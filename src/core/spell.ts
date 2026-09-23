import type { MapState } from './map';
import type { HexCoord } from './types';
import type { UnitState } from './unit';
import { getAreaCells, unitsInArea } from './area';
import type { SpellTemplate } from '../config/spells';
import { getTemplate } from '../config/units';
import { calcStrike, effectiveRangeMax } from './combat';
import { EFFECT_PARAMS } from '../config/combat';
import { getJob } from '../config/jobs';
import { statValue } from './status';
import { gainOnStruck } from './resources';
import { distance } from './hex';
import { getTerrain } from './map';
import type { PartSide } from './combat';
import type { ArmorType } from './types';

export type SpellForecast =
  | { kind: 'damage'; damage: number; hitRate: number; side: PartSide; chantTurns: number; critRate: number; critDamage: number; mustCrit: boolean }
  | { kind: 'heal'; amount: number }
  | { kind: 'regen'; healPerTurn: number; turns: number }
  | { kind: 'shield'; armorType: ArmorType; absorb: number; turns: number }
  | { kind: 'dot'; total: number; damagePerTurn: number; finalTurnExtra: number; turns: number; hitRate: number; side: PartSide };

/** R10-1 统一 DoT 切分（§4.3，灼烧/咒杀同构）：每回合 max(1, floor(total/turns))，余数末回合补足 */
export function splitDot(total: number, turns: number): { perTurn: number; extra: number } {
  const perTurn = Math.max(1, Math.floor(total / turns));
  return { perTurn, extra: Math.max(0, total - perTurn * turns) };
}

/** 治疗段基数（R4-2）：Σ(属性×权重)+固定值——治疗不扣防御项与地形防（§4.3 治疗线） */
function healSegment(caster: UnitState, spell: SpellTemplate): number {
  const t = getTemplate(caster.templateId)!;
  let v = spell.power ?? 0;
  for (const [k, w] of Object.entries(spell.weights ?? getJob(t.id)!.defaultWeights.heal) as Array<[string, number]>) {
    if (!w) continue;
    v += statValue(caster, t, k as 'str') * w;
  }
  return Math.floor(v);
}

export function calcSpellForecast(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate
): SpellForecast {
  switch (spell.effectMode) {
    case 'instant': {
      // 伤害类走统一战斗公式（含 power 与矩阵）；治疗类固定 power
      if (spell.targetType === 'enemy') {
        const strike = calcStrike(map, caster, getTemplate(caster.templateId)!, target, getTemplate(target.templateId)!, spell);
        return {
          kind: 'damage',
          damage: strike.damage,
          hitRate: strike.hitRate,
          side: strike.side,
          chantTurns: spell.chantTurns ?? 0,
          critRate: strike.critRate,
          critDamage: strike.critDamage,
          mustCrit: strike.mustCrit
        };
      }
      // R4-2：治疗统一伤害段——Σ(属性×权重)+固定值（主要挂魔力；不扣防御不乘克制）
      return { kind: 'heal', amount: healSegment(caster, spell) };
    }
    case 'lasting': {
      if (spell.shield) {
        return { kind: 'shield', armorType: spell.shield.armorType, absorb: spell.shield.absorb, turns: spell.durationTurns ?? 1 };
      }
      if (spell.targetType === 'enemy') {
        const strike = calcStrike(map, caster, getTemplate(caster.templateId)!, target, getTemplate(target.templateId)!, spell);
        const { perTurn, extra } = splitDot(strike.damage, spell.durationTurns ?? 1);
        return {
          kind: 'dot', total: strike.damage, damagePerTurn: perTurn, finalTurnExtra: extra,
          turns: spell.durationTurns ?? 1, hitRate: strike.hitRate, side: strike.side
        };
      }
      return { kind: 'regen', healPerTurn: healSegment(caster, spell), turns: spell.durationTurns ?? 1 };
    }
  }
}

export type SpellResult = SpellForecast & { hit?: boolean; crit?: boolean; targetHp: number; splash?: { targetId: string; value: number } };

/** R12-1 虔诚溅射目标（§5）：施法者法术有效射程内存活友方，排除主目标与施法者；绝对 HP 最低 → 距施法者近 → 数组序（确定性） */
function piousSplashTarget(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate,
  units: UnitState[]
): UnitState | undefined {
  if (!caster.loadout.passive.includes('pious')) return undefined;
  const rMax = effectiveRangeMax(getTemplate(caster.templateId)!, spell, getTerrain(map, caster.position), caster.loadout.passive);
  let best: UnitState | undefined;
  let bestDist = Infinity;
  for (const u of units) {
    if (u === caster || u === target || u.faction !== caster.faction || u.hp <= 0) continue;
    const d = distance(caster.position, u.position);
    if (d > rMax) continue;
    if (!best || u.hp < best.hp || (u.hp === best.hp && d < bestDist)) { best = u; bestDist = d; }
  }
  return best;
}

/** R12-1 溅射复制量：主目标结算值 ×piousSplashFraction（向下取整、保底 1） */
function splashHalf(value: number): number {
  return Math.max(1, Math.floor(value * EFFECT_PARAMS.piousSplashFraction));
}

/**
 * 即时释放的法术结算。增益必中；伤害类掷命中。
 * 持续/延时类在目标身上挂状态，阶段开始由 tickStatuses 推进。
 * units 为全场单位（虔诚溅射候选；R7-3 教训：sim 与真实走同一签名同一路径）。
 */
export function resolveSpell(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate,
  units: UnitState[],
  rng: () => number = Math.random
): SpellResult {
  const forecast = calcSpellForecast(map, caster, target, spell);
  const castTurn = 0;  // 回合数由调用方维护，此处仅保序（后施加覆盖先生效）
  caster.castSpellThisTurn = true;  // R5-2 施法标记（0 耗亦算，MP 歇息判定）

  switch (forecast.kind) {
    case 'damage': {
      // R7-1 直击法术可暴（§4.3：同一公式，先命中后暴击）；灼烧 DoT 锁定非暴击值（预报 = 实际）
      const hit = rng() < forecast.hitRate / 100;
      const crit = hit && (forecast.mustCrit || rng() < forecast.critRate / 100);
      let damage = crit ? forecast.critDamage : forecast.damage;
      let dotBase = forecast.damage;
      if (hit && caster.loadout.passive.includes('pyro') && (spell.id === 'fireball' || spell.id === 'meteor')) {
        damage = Math.floor(damage * EFFECT_PARAMS.pyroBoostMult);
        dotBase = Math.floor(dotBase * EFFECT_PARAMS.pyroBoostMult);
        // R4-7 施放时锁定：splitDot 切分（§4.3，预报=实际）
        const { perTurn, extra } = splitDot(dotBase, EFFECT_PARAMS.pyroDotTurns);
        target.statuses.push({
          type: 'dot', skillName: '灼烧', appliedAtTurn: castTurn,
          turnsLeft: EFFECT_PARAMS.pyroDotTurns,
          damagePerTurn: perTurn,
          finalTurnExtra: extra
        });
      }
      if (hit) {
        target.hp = Math.max(0, target.hp - damage);
        gainOnStruck(target);  // R5-2 法术命中受击回怒
      }
      return { ...forecast, hit, crit, damage, targetHp: target.hp };
    }
    case 'heal': {
      const amount = caster.loadout.passive.includes('heal-boost')
        ? forecast.amount + Math.floor((getTemplate(caster.templateId)?.tec ?? 0) * EFFECT_PARAMS.healPerTechHalf)
        : forecast.amount;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      let splash: SpellResult['splash'];
      const st = piousSplashTarget(map, caster, target, spell, units);
      if (st) {
        const v = splashHalf(amount);
        st.hp = Math.min(st.maxHp, st.hp + v);
        splash = { targetId: st.id, value: v };
      }
      return { ...forecast, amount, targetHp: target.hp, splash };
    }
    case 'regen': {
      target.statuses.push({
        type: 'regen', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, healPerTurn: forecast.healPerTurn
      });
      let splash: SpellResult['splash'];
      const st = piousSplashTarget(map, caster, target, spell, units);
      if (st) {
        const v = splashHalf(forecast.healPerTurn);
        st.statuses.push({
          type: 'regen', skillName: spell.name, turnsLeft: forecast.turns,
          appliedAtTurn: castTurn, healPerTurn: v
        });
        splash = { targetId: st.id, value: v };
      }
      return { ...forecast, targetHp: target.hp, splash };
    }
    case 'shield': {
      target.statuses.push({
        type: 'shield', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, armorType: forecast.armorType, absorbLeft: forecast.absorb
      });
      let splash: SpellResult['splash'];
      const st = piousSplashTarget(map, caster, target, spell, units);
      if (st) {
        const v = splashHalf(forecast.absorb);
        st.statuses.push({
          type: 'shield', skillName: spell.name, turnsLeft: forecast.turns,
          appliedAtTurn: castTurn, armorType: forecast.armorType, absorbLeft: v
        });
        splash = { targetId: st.id, value: v };
      }
      return { ...forecast, targetHp: target.hp, splash };
    }
    case 'dot': {
      // R10-1 咒杀 DoT：掷命中，命中挂锁定切分值；法术命中受击回怒（§4.13）
      const hit = rng() < forecast.hitRate / 100;
      if (hit) {
        target.statuses.push({
          type: 'dot', skillName: spell.name, appliedAtTurn: castTurn,
          turnsLeft: forecast.turns,
          damagePerTurn: forecast.damagePerTurn,
          finalTurnExtra: forecast.finalTurnExtra
        });
        gainOnStruck(target);
      }
      return { ...forecast, hit, targetHp: target.hp };
    }
  }
}

export interface AoeSpellResult {
  targetId: string;
  hit: boolean;
  crit: boolean;  // R7-1 暴击标记
  damage: number;
  targetHp: number;
}

/** AoE 法术结算（§4.9：以释放中心格为圆心，区域内敌方独立掷命中；不触发反击）；R7-1 逐目标独立掷暴 */
export function resolveAoeSpell(
  map: MapState,
  caster: UnitState,
  center: HexCoord,
  units: UnitState[],
  spell: SpellTemplate,
  rng: () => number = Math.random
): AoeSpellResult[] {
  if (!spell.area) return [];
  const cells = getAreaCells(spell.area, caster, center);
  const targets = unitsInArea(units, cells, caster.faction);
  const casterT = getTemplate(caster.templateId)!;
  caster.castSpellThisTurn = true;  // R5-2 施法标记
  return targets.map(t => {
    const strike = calcStrike(map, caster, casterT, t, getTemplate(t.templateId)!, spell);
    const hit = rng() < strike.hitRate / 100;
    const crit = hit && (strike.mustCrit || rng() < strike.critRate / 100);
    const damage = hit ? (crit ? strike.critDamage : strike.damage) : 0;
    if (hit) {
      t.hp = Math.max(0, t.hp - damage);
      gainOnStruck(t);  // R5-2 受击回怒
    }
    return { targetId: t.id, hit, crit, damage, targetHp: t.hp };
  });
}
