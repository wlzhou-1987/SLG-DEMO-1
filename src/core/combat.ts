import type { HexCoord, DamageType } from './types';
import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import type { UnitTemplate } from '../config/units';
import { getTemplate, getTemplateSkills, basicAttackSkill, isFlying } from '../config/units';
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

  // 守方地形加成（飞行不享，§4.11）；R4-2：地形 defense 更名物理防过渡（R6 只增字段）
  const terrain = getTerrain(map, defender.position);
  const defFlying = isFlying(defT);
  const terrDef = !defFlying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].pdefense : 0;
  const terrEva = !defFlying && terrain !== undefined ? TERRAIN_CONFIGS[terrain].evasion : 0;

  // 守方护甲解析：活跃护盾覆盖类型（§4.10）；吸收在 resolveBattle 应用
  const { armor: defArmor } = resolveArmor(defender, defT);

  // 特性修正（§4.7 管线：在修正点直接查询攻守双方特性）
  const atkTraits = [...attacker.loadout.passive];
  const defTraits = [...defender.loadout.passive];

  // ---------- R4-2 统一伤害公式 ----------
  // 伤害 = max( floor( ((权重基数 + 固定值) x 克制系数 - 防御项 - 地形防 ), 0 ) + 部位伤害加算
  // 三线：物理扣 pdef、魔法扣 mdef；克制乘算位于 max 内（先乘后减）
  const isMagic = skill.damageType === 'magic';
  const defAxis: 'pdef' | 'mdef' = isMagic ? 'mdef' : 'pdef';
  const backBonus = side === 'back' ? (skill.backPowerBonus ?? 0) : 0;

  // 伤害段基数：技能组合权重（缺省物理=str*1、法术=mag*1，模板即职业过渡）+ 固定值 + 影袭背面威力
  const weights = skill.weights ?? (isMagic ? { mag: 1 } : { str: 1 });
  let segBase = (skill.power ?? 0) + backBonus;
  for (const [k, w] of Object.entries(weights) as Array<[string, number]>) {
    if (!w) continue;
    segBase += statValue(attacker, atkT, k as 'str') * w;
  }

  // 克制系数 = 护甲矩阵 x prod 兵种克制（cap）；法术矩阵行走法术级克制（R4-3，暂 1）
  let counterMult = 1;
  if (skill.counters) {
    for (const tag of defT.unitTags) {
      const m = skill.counters[tag];
      if (m !== undefined) counterMult *= m;
    }
  }
  // R4-3：法术行移出矩阵——法术线走法术级对护甲系数（未声明格 1.0），与 counters 联乘同受 cap
  const matrixMult = isMagic
    ? (skill.armorResist?.[defArmor] ?? 1)
    : DAMAGE_ARMOR_MATRIX[skill.damageType as Exclude<DamageType, 'magic'>][defArmor];
  // 克制合成上限：护甲克制 × ∏兵种克制 整体 ≤3.0（§4.2）
  const resistMult = Math.min(matrixMult * counterMult, COMBAT_PARAMS.counterCap);
  const backstabMult = side === 'back' && atkTraits.includes('backstab')
    ? TRAIT_CONFIGS.backstab.backstabMultiplier ?? 1.5
    : 1;
  // 全局伤害倍率总封顶（R8 评审定稿：全部乘数联乘后截断 ≤4.0）
  const mult = Math.min(resistMult * backstabMult, COMBAT_PARAMS.totalDamageCap);

  // 防御项：背刺技能=背面无视一半防御
  const defForSkill = skill.halfDefFromBack && side === 'back'
    ? statValue(defender, defT, defAxis) / 2
    : statValue(defender, defT, defAxis);

  const damage = Math.max(Math.floor(segBase * mult - defForSkill - terrDef), 0) + PART_BONUS[side].damage;

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
    // R4-3：法术行已移出矩阵——法术按 armorResist 缺省 1 参与择优
    const matrix = skill.damageType === 'magic'
      ? (skill.armorResist?.[atkT.armor] ?? 1)
      : DAMAGE_ARMOR_MATRIX[skill.damageType as Exclude<DamageType, 'magic'>][atkT.armor];
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
