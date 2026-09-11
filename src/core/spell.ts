import type { MapState } from './map';
import type { HexCoord } from './types';
import type { UnitState } from './unit';
import { getAreaCells, unitsInArea } from './area';
import type { SpellTemplate } from '../config/spells';
import { getTemplate } from '../config/units';
import { calcStrike } from './combat';
import { EFFECT_PARAMS } from '../config/combat';
import { statValue } from './status';
import type { PartSide } from './combat';
import type { ArmorType } from './types';

export type SpellForecast =
  | { kind: 'damage'; damage: number; hitRate: number; side: PartSide; chantTurns: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'regen'; healPerTurn: number; turns: number }
  | { kind: 'shield'; armorType: ArmorType; absorb: number; turns: number }
  | { kind: 'curse'; damage: number; turns: number };

/** 治疗段基数（R4-2）：Σ(属性×权重)+固定值——治疗不扣防御项与地形防（§4.3 治疗线） */
function healSegment(caster: UnitState, spell: SpellTemplate): number {
  const t = getTemplate(caster.templateId)!;
  let v = spell.power ?? 0;
  for (const [k, w] of Object.entries(spell.weights ?? { mag: 0.5 }) as Array<[string, number]>) {
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
          chantTurns: spell.chantTurns ?? 0
        };
      }
      // R4-2：治疗统一伤害段——Σ(属性×权重)+固定值（主要挂魔力；不扣防御不乘克制）
      return { kind: 'heal', amount: healSegment(caster, spell) };
    }
    case 'lasting': {
      if (spell.shield) {
        return { kind: 'shield', armorType: spell.shield.armorType, absorb: spell.shield.absorb, turns: spell.durationTurns ?? 1 };
      }
      return { kind: 'regen', healPerTurn: healSegment(caster, spell), turns: spell.durationTurns ?? 1 };
    }
    case 'delayed': {
      return { kind: 'curse', damage: spell.power, turns: spell.durationTurns ?? 1 };
    }
  }
}

export type SpellResult = SpellForecast & { hit?: boolean; targetHp: number };

/**
 * 即时释放的法术结算。增益必中；伤害类掷命中。
 * 持续/延时类在目标身上挂状态，阶段开始由 tickStatuses 推进。
 */
export function resolveSpell(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate,
  rng: () => number = Math.random
): SpellResult {
  const forecast = calcSpellForecast(map, caster, target, spell);
  const castTurn = 0;  // 回合数由调用方维护，此处仅保序（后施加覆盖先生效）

  switch (forecast.kind) {
    case 'damage': {
      const hit = rng() < forecast.hitRate / 100;
      let damage = forecast.damage;
      if (hit && caster.loadout.passive.includes('pyro') && (spell.id === 'fireball' || spell.id === 'meteor')) {
        damage = Math.floor(damage * EFFECT_PARAMS.pyroBoostMult);
        target.statuses.push({
          type: 'dot', skillName: '灼烧', appliedAtTurn: castTurn,
          turnsLeft: EFFECT_PARAMS.pyroDotTurns,
          damagePerTurn: Math.max(1, Math.floor(damage / 2))
        });
      }
      if (hit) {
        target.hp = Math.max(0, target.hp - damage);
      }
      return { ...forecast, hit, targetHp: target.hp };
    }
    case 'heal': {
      const amount = caster.loadout.passive.includes('heal-boost')
        ? forecast.amount + Math.floor((getTemplate(caster.templateId)?.tec ?? 0) * EFFECT_PARAMS.healPerTechHalf)
        : forecast.amount;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      return { ...forecast, amount, targetHp: target.hp };
    }
    case 'regen': {
      target.statuses.push({
        type: 'regen', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, healPerTurn: forecast.healPerTurn
      });
      return { ...forecast, targetHp: target.hp };
    }
    case 'shield': {
      target.statuses.push({
        type: 'shield', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, armorType: forecast.armorType, absorbLeft: forecast.absorb
      });
      return { ...forecast, targetHp: target.hp };
    }
    case 'curse': {
      target.statuses.push({
        type: 'delayed', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, damage: forecast.damage
      });
      return { ...forecast, targetHp: target.hp };
    }
  }
}

export interface AoeSpellResult {
  targetId: string;
  hit: boolean;
  damage: number;
  targetHp: number;
}

/** AoE 法术结算（§4.9：以释放中心格为圆心，区域内敌方独立掷命中；不触发反击） */
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
  return targets.map(t => {
    const strike = calcStrike(map, caster, casterT, t, getTemplate(t.templateId)!, spell);
    const hit = rng() < strike.hitRate / 100;
    const damage = hit ? strike.damage : 0;
    if (hit) t.hp = Math.max(0, t.hp - damage);
    return { targetId: t.id, hit, damage, targetHp: t.hp };
  });
}
