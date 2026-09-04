import type { HexCoord, DamageType } from './types';
import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate, UnitTemplate } from '../config/units';
import { getTemplate } from '../config/units';
import { directionBetween, distance } from './hex';
import { DAMAGE_ARMOR_MATRIX, PART_BONUS, COMBAT_PARAMS } from '../config/combat';
import { TERRAIN_CONFIGS } from '../config/terrain';

export type PartSide = 'front' | 'side' | 'back';

/** 以守方朝向为基准判定攻击部位（§4.7：正面 3 格 / 侧面 2 格 / 背面 1 格） */
export function attackSide(
  defenderFacing: number,
  attackerPos: HexCoord,
  defenderPos: HexCoord
): PartSide {
  const dir = directionBetween(defenderPos, attackerPos);
  const d = (dir - defenderFacing + 6) % 6;
  if (d === 3) return 'back';
  if (d === 2 || d === 4) return 'side';
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
function calcStrike(
  map: MapState,
  attacker: UnitState,
  atkT: UnitTemplate,
  defender: UnitState,
  defT: UnitTemplate,
  skill: SkillTemplate
): StrikeForecast {
  const side = attackSide(defender.facing, attacker.position, defender.position);
  const dist = distance(attacker.position, defender.position);

  // 守方地形加成（飞行不享，§4.11）
  const terrain = getTerrain(map, defender.position);
  const terrDef = !defT.flying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].defense : 0;
  const terrEva = !defT.flying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].evasion : 0;

  const base = Math.max(atkT.atk - defT.def - terrDef, 0);
  const matrix = DAMAGE_ARMOR_MATRIX[skill.damageType][defT.armor];
  const damage = Math.floor(base * matrix) + PART_BONUS[side].damage;

  const evade = defT.lck * COMBAT_PARAMS.evadePerLuck + terrEva;
  const rangePenalty = COMBAT_PARAMS.rangePenaltyPerHex * Math.max(0, dist - skill.rangeMax);
  const rawHit =
    COMBAT_PARAMS.hitBase + atkT.tec * COMBAT_PARAMS.hitPerTech - evade +
    PART_BONUS[side].hit - rangePenalty;
  const hitRate = Math.max(COMBAT_PARAMS.hitMin, Math.min(COMBAT_PARAMS.hitMax, rawHit));

  return { skillName: skill.name, damageType: skill.damageType, side, damage, hitRate, count: 1 };
}

/** 守方反击技能：射程覆盖攻方位置者中期望伤害最高（§4.3 已确认规则） */
function pickCounterSkill(
  defT: UnitTemplate,
  atkT: UnitTemplate,
  dist: number
): SkillTemplate | null {
  let best: SkillTemplate | null = null;
  let bestScore = -1;
  for (const skill of defT.skills) {
    if (dist < skill.rangeMin || dist > skill.rangeMax) continue;
    const matrix = DAMAGE_ARMOR_MATRIX[skill.damageType][atkT.armor];
    if (matrix > bestScore) {
      bestScore = matrix;
      best = skill;
    }
  }
  return best;
}

export function calcBattleForecast(
  map: MapState,
  attacker: UnitState,
  defender: UnitState,
  skill: SkillTemplate
): BattleForecast {
  const atkT = getTemplate(attacker.templateId)!;
  const defT = getTemplate(defender.templateId)!;
  const dist = distance(attacker.position, defender.position);

  const attackerStrike = calcStrike(map, attacker, atkT, defender, defT, skill);

  // 反击：守方技能射程覆盖攻方位置
  let counter: StrikeForecast | null = null;
  const counterSkill = pickCounterSkill(defT, atkT, dist);
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
  rng: () => number = Math.random
): BattleResult {
  const forecast = calcBattleForecast(map, attacker, defender, skill);
  const strikes: StrikeResult[] = [];
  let attackerHp = attacker.hp;
  let defenderHp = defender.hp;

  const strike = (s: StrikeForecast, byAttacker: boolean): boolean => {
    // 返回目标是否阵亡
    const hit = rng() < s.hitRate / 100;
    const damage = hit ? s.damage : 0;
    strikes.push({ byAttacker, hit, damage, side: s.side, skillName: s.skillName });
    if (byAttacker) {
      defenderHp = Math.max(0, defenderHp - damage);
      return defenderHp === 0;
    }
    attackerHp = Math.max(0, attackerHp - damage);
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
