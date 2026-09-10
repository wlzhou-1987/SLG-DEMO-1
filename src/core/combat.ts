import type { HexCoord, DamageType } from './types';
import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import type { UnitTemplate } from '../config/units';
import { getTemplate, getTemplateSkills, basicAttackSkill } from '../config/units';
import { directionBetween, distance } from './hex';
import { DAMAGE_ARMOR_MATRIX, PART_BONUS, COMBAT_PARAMS, EFFECT_PARAMS } from '../config/combat';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { TRAIT_CONFIGS } from '../config/traits';
import { resolveArmor, statValue } from './status';

export type PartSide = 'front' | 'side' | 'back';

/** 以守方朝向为基准判定攻击部位（§4.7）；guardStance=防御姿态参数化——侧后两格按正面处理（仅正后 1 格算背） */
export function attackSide(
  defenderFacing: number,
  attackerPos: HexCoord,
  defenderPos: HexCoord,
  guardStance = false
): PartSide {
  const dir = directionBetween(defenderPos, attackerPos);
  const d = (dir - defenderFacing + 6) % 6;
  if (d === 3) return 'back';
  if (d === 2 || d === 4) return guardStance ? 'front' : 'side';
  return 'front';
}

export interface StrikeForecast {
  skillName: string;
  damageType: DamageType;
  side: PartSide;
  damage: number;   // 单次命中伤害（预报值）
  hitRate: number;  // 0-100
  count: number;    // 攻击次数（追击时 2）
}

export interface BattleForecast {
  attacker: StrikeForecast;
  counter: StrikeForecast | null;
}

/** 单方打击预报（attacker 向 defender 发动 skill） */
export function calcStrike(
  map: MapState,
  attacker: UnitState,
  atkT: UnitTemplate,
  defender: UnitState,
  defT: UnitTemplate,
  skill: SkillTemplate
): StrikeForecast {
  const guardStance = defender.statuses.some(s => s.type === 'stance');
  const side = attackSide(defender.facing, attacker.position, defender.position, guardStance);
  const dist = distance(attacker.position, defender.position);

  // 守方地形加成（飞行不享，§4.11）
  const terrain = getTerrain(map, defender.position);
  const terrDef = !defT.flying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].defense : 0;
  const terrEva = !defT.flying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].evasion : 0;

  // 守方护甲解析：活跃护盾覆盖类型（§4.10）；吸收在 resolveBattle 应用
  const { armor: defArmor } = resolveArmor(defender, defT);

  // 特性修正（§4.7 管线：在修正点直接查询攻守双方特性）
  const atkTraits = [...attacker.loadout.passive];
  const defTraits = [...defender.loadout.passive];

  // R3-9：属性总值 = 模板基础 + buff/姿态加成（光环经 buff 进入）
  // R3-10：影袭背面威力、背刺半防在 base 层合成
  const backBonus = side === 'back' ? (skill.backPowerBonus ?? 0) : 0;
  const defForSkill = skill.halfDefFromBack && side === 'back'
    ? Math.floor(statValue(defender, defT, 'def') / 2)
    : statValue(defender, defT, 'def');
  const base = Math.max(
    statValue(attacker, atkT, 'atk') + (skill.power ?? 0) + backBonus - defForSkill - terrDef,
    0
  );
  // R3-10：counters 特效克制（占位 tags，R4-4 迁移正式 unitTags）——只进伤害乘区
  let counterMult = 1;
  if (skill.counters) {
    for (const tag of defT.tags ?? []) {
      const m = skill.counters[tag];
      if (m !== undefined) counterMult *= m;
    }
  }
  const matrix = DAMAGE_ARMOR_MATRIX[skill.damageType][defArmor] * counterMult;
  // 背刺：背面伤害 +3 加算改为乘算
  const backstabMult = atkTraits.includes('backstab')
    ? TRAIT_CONFIGS.backstab.backstabMultiplier ?? 1.5
    : 1;
  const damage = side === 'back' && backstabMult !== 1
    ? Math.floor(base * matrix * backstabMult)
    : Math.floor(base * matrix) + PART_BONUS[side].damage;

  // 沉稳：守方受到的部位命中补正减半
  const partHit = defTraits.includes('steady')
    ? Math.floor(PART_BONUS[side].hit / 2)
    : PART_BONUS[side].hit;

  const evade = defT.lck * COMBAT_PARAMS.evadePerLuck + terrEva;
  const rangePenalty = COMBAT_PARAMS.rangePenaltyPerHex * Math.max(0, dist - skill.rangeMax);
  const rawHit =
    COMBAT_PARAMS.hitBase + atkT.tec * COMBAT_PARAMS.hitPerTech - evade +
    partHit - rangePenalty;
  const hitRate = Math.max(COMBAT_PARAMS.hitMin, Math.min(COMBAT_PARAMS.hitMax, rawHit));

  return { skillName: skill.name, damageType: skill.damageType, side, damage, hitRate, count: 1 };
}

/** 守方反击技能：普攻恒入候选，射程覆盖攻方位置者中期望伤害最高（§4.3/§4.9） */
function pickCounterSkill(
  defT: UnitTemplate,
  atkT: UnitTemplate,
  dist: number
): SkillTemplate | null {
  let best: SkillTemplate | null = null;
  let bestScore = -1;
  for (const skill of [basicAttackSkill(defT), ...getTemplateSkills(defT)]) {
    if (dist < skill.rangeMin || dist > skill.rangeMax) continue;
    const matrix = DAMAGE_ARMOR_MATRIX[skill.damageType][atkT.armor];
    if (matrix > bestScore) {
      bestScore = matrix;
      best = skill;
    }
  }
  return best;
}

/** 单次伤害应用：先扣护盾吸收，超出部分扣 HP；返回吸收量（单体与 AoE 共用） */
export function applyDamageToUnit(
  target: UnitState,
  targetT: UnitTemplate,
  amount: number
): number {
  const { shield } = resolveArmor(target, targetT);
  let rest = amount;
  let absorbed = 0;
  if (shield && shield.absorbLeft > 0) {
    absorbed = Math.min(shield.absorbLeft, rest);
    shield.absorbLeft -= absorbed;
    rest -= absorbed;
    if (shield.absorbLeft <= 0) {
      target.statuses = target.statuses.filter(s => s !== shield);
    }
  }
  target.hp = Math.max(0, target.hp - rest);
  return absorbed;
}

export function calcBattleForecast(
  map: MapState,
  attacker: UnitState,
  defender: UnitState,
  skill: SkillTemplate,
  opts?: { noCounter?: boolean }
): BattleForecast {
  const atkT = getTemplate(attacker.templateId)!;
  const defT = getTemplate(defender.templateId)!;
  const dist = distance(attacker.position, defender.position);

  const attackerStrike = calcStrike(map, attacker, atkT, defender, defT, skill);

  // 反击：守方技能射程覆盖攻方位置；空中突袭等条件免反击（R3-10）
  let counter: StrikeForecast | null = null;
  const counterSkill = opts?.noCounter ? null : pickCounterSkill(defT, atkT, dist);
  if (counterSkill) {
    // 反击方向：守方 → 攻方，以攻方朝向为基准判部位
    counter = calcStrike(map, defender, defT, attacker, atkT, counterSkill);
  }

  // 追击：速度差 ≥4 快方多打一次（不能反击则不能追击）
  const spdDiff = atkT.spd - defT.spd;
  if (spdDiff >= COMBAT_PARAMS.pursuitSpeedDiff) {
    attackerStrike.count = 2;
  } else if (counter && spdDiff <= -COMBAT_PARAMS.pursuitSpeedDiff) {
    counter.count = 2;
  }

  return { attacker: attackerStrike, counter };
}

export interface StrikeResult {
  byAttacker: boolean;
  hit: boolean;
  damage: number;
  absorbed: number;  // 护盾吸收部分（表现层区分扣血与吸收）
  side: PartSide;
  skillName: string;
}

export interface BattleResult {
  strikes: StrikeResult[];
  attackerHp: number;
  defenderHp: number;
}

/**
 * 战斗结算（§4.3 序列：攻方攻击 → 守方反击 → 追击方攻击，死亡即停）
 * rng 返回 [0,1)，注入以获得确定性测试
 */
export function resolveBattle(
  map: MapState,
  attacker: UnitState,
  defender: UnitState,
  skill: SkillTemplate,
  rng: () => number = Math.random,
  opts?: { noCounter?: boolean }
): BattleResult {
  const forecast = calcBattleForecast(map, attacker, defender, skill, opts);
  const atkT = getTemplate(attacker.templateId)!;
  const defT = getTemplate(defender.templateId)!;
  const strikes: StrikeResult[] = [];
  let attackerHp = attacker.hp;
  let defenderHp = defender.hp;

  const strike = (s: StrikeForecast, byAttacker: boolean): boolean => {
    // 返回目标是否阵亡
    const hit = rng() < s.hitRate / 100;
    const damage = hit ? s.damage : 0;
    const absorbed = byAttacker
      ? applyDamageToUnit(defender, defT, damage)
      : applyDamageToUnit(attacker, atkT, damage);
    if (byAttacker && hit && damage > 0 &&
        attacker.loadout.passive.includes('vampiric') &&
        attacker.statuses.some(st => st.type === 'buff' && st.skillName === '嗜血')) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.max(1, Math.floor(damage * EFFECT_PARAMS.lifestealRate)));
    }
    attackerHp = attacker.hp;
    defenderHp = defender.hp;
    strikes.push({ byAttacker, hit, damage, absorbed, side: s.side, skillName: s.skillName });
    if (byAttacker) return defenderHp === 0;
    return attackerHp === 0;
  };

  // 第一击：攻方
  if (strike(forecast.attacker, true)) {
    return { strikes, attackerHp, defenderHp };
  }
  // 第二击：守方反击
  if (forecast.counter && strike(forecast.counter, false)) {
    return { strikes, attackerHp, defenderHp };
  }
  // 第三击：追击（双方 count 里第二击即追击）
  if (forecast.attacker.count === 2) {
    strike(forecast.attacker, true);
  } else if (forecast.counter && forecast.counter.count === 2) {
    strike(forecast.counter, false);
  }

  return { strikes, attackerHp, defenderHp };
}

// ---------- R3-7 AoE 结算 ----------

export interface AoeStrikeResult {
  targetId: string;
  hit: boolean;
  damage: number;
  absorbed: number;
  forecast: StrikeForecast;
}

/** 单目标 AoE 预报：主段 + 附加伤害段（各段独立过矩阵，同侧同命中） */
function aoeStrikeForecast(
  map: MapState,
  attacker: UnitState,
  atkT: UnitTemplate,
  defender: UnitState,
  defT: UnitTemplate,
  skill: SkillTemplate
): StrikeForecast {
  const main = calcStrike(map, attacker, atkT, defender, defT, skill);
  if (skill.id === 'whirlwind' && attacker.loadout.passive.includes('ww-enhance')) {
    return { ...main, damage: main.damage + Math.floor(main.damage / 2) };
  }
  if (!skill.segments || skill.segments.length === 0) return main;
  let total = main.damage;
  for (const seg of skill.segments) {
    const segSkill: SkillTemplate = {
      ...skill, damageType: seg.damageType, power: seg.power, segments: undefined
    };
    total += calcStrike(map, attacker, atkT, defender, defT, segSkill).damage;
  }
  return { ...main, damage: total };
}

/** AoE 预报：区域内每个敌人各自预报（部位/命中独立计算） */
export function calcAoeForecast(
  map: MapState,
  caster: UnitState,
  targets: UnitState[],
  skill: SkillTemplate
): StrikeForecast[] {
  const atkT = getTemplate(caster.templateId)!;
  return targets.map(t =>
    aoeStrikeForecast(map, caster, atkT, t, getTemplate(t.templateId)!, skill)
  );
}

/**
 * AoE 结算（§4.9）：区域内逐单位独立掷命中；不触发反击与追击
 * （定稿明文为 AoE 法术不触发反击；物理 AoE 取同口径——范围释放非单挑，台账记录）
 */
export function resolveAoeBattle(
  map: MapState,
  caster: UnitState,
  targets: UnitState[],
  skill: SkillTemplate,
  rng: () => number = Math.random
): AoeStrikeResult[] {
  const atkT = getTemplate(caster.templateId)!;
  const results: AoeStrikeResult[] = [];
  for (const t of targets) {
    const defT = getTemplate(t.templateId)!;
    const forecast = aoeStrikeForecast(map, caster, atkT, t, defT, skill);
    const hit = rng() < forecast.hitRate / 100;
    const damage = hit ? forecast.damage : 0;
    const absorbed = applyDamageToUnit(t, defT, damage);
    results.push({ targetId: t.id, hit, damage, absorbed, forecast });
  }
  return results;
}
