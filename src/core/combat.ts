import type { HexCoord, DamageType, TerrainType } from './types';
import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import type { SpellTemplate } from '../config/spells';
import type { UnitTemplate } from '../config/units';
import { getTemplate, getTemplateSkills, isFlying } from '../config/units';
import { basicAttackSkills, WEAPONS } from '../config/weapons';
import { getJob } from '../config/jobs';
import { directionBetween, distance } from './hex';
import { DAMAGE_ARMOR_MATRIX, PART_BONUS, COMBAT_PARAMS, EFFECT_PARAMS, RANGE_PARAMS } from '../config/combat';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { TRAIT_CONFIGS } from '../config/traits';
import { resolveArmor, statValue } from './status';
import { gainOnHit, gainOnStruck, gainOnCrit } from './resources';

export type PartSide = 'front' | 'side' | 'back';

/** 回避轴（R4-6 双轴）：物理线 / 法术线 */
export type EvadeAxis = 'phys' | 'mag';

/** 双轴回避（§4.3）：速×速系数 + 运×运系数 + 对应线地形闪避（R6-1 起由调用方按轴传 pevasion/mevasion）；
 *  经 statValue 入修正管线——buff/装备/特性改写速/运即改写回避 */
export function calcEvade(
  defender: UnitState,
  defT: UnitTemplate,
  axis: EvadeAxis,
  terrEva: number,
  coeffs: { spd: number; lck: number } = COMBAT_PARAMS.evadeCoeffs[axis]
): number {
  return statValue(defender, defT, 'spd') * coeffs.spd
    + statValue(defender, defT, 'lck') * coeffs.lck
    + terrEva;
}

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
  skillId: string;    // R16-2 表现层逐击选特效（普攻 = basic:<武器> 前缀）
  damageType: DamageType;
  side: PartSide;
  damage: number;   // 单次命中伤害（预报值，非暴击）
  hitRate: number;  // 0-100
  count: number;    // 攻击次数（追击时 2）
  rangePenalty?: number;  // R4-5 超程递增惩罚合计（预报明细显示）
  critRate: number;      // R7-1 暴击率 0-50（公式值；mustCrit 时不参与掷骰）
  critDamage: number;    // R7-1 暴击伤害（×2 进乘数区吃总封顶后）
  mustCrit: boolean;     // R7-1 必暴（critOverride：不掷骰，技运均不参与）
}

export interface BattleForecast {
  attacker: StrikeForecast;
  counter: StrikeForecast | null;
  firstStrike: boolean;  // R4-7 先攻反击：守方反击先行结算（§4.3）
}

/** R7-1 暴击率（§4.3）：属性段 clamp(技×系数 + 运差×系数 + 修正合计, 0, 上限) + 武器加成 → clamp 0~100；
 *  R7-2 mods：overflow = 鹰眼命中溢出（1:1 进修正合计）；capBonus = Σ critCapBonus（技能/特性声明）抬上限 */
export function calcCritRate(
  attacker: UnitState,
  atkT: UnitTemplate,
  defender: UnitState,
  defT: UnitTemplate,
  mods?: { overflow?: number; capBonus?: number }
): number {
  const rate = statValue(attacker, atkT, 'tec') * COMBAT_PARAMS.critPerTech
    + (statValue(attacker, atkT, 'lck') - statValue(defender, defT, 'lck')) * COMBAT_PARAMS.critPerLck
    + (mods?.overflow ?? 0) * COMBAT_PARAMS.critOverflowRate;
  const cap = COMBAT_PARAMS.critCap + (mods?.capBonus ?? 0);
  const propSeg = Math.max(0, Math.min(rate, cap));
  // R2-3 武器暴击加成 = 装备条目求和（§4.14；原全局表 WEAPON_CRIT_BONUS 退役）：
  // clamp 外自动全额生效，仅受绝对顶；作用域 = 持有者全部攻击
  const weaponBonus = attacker.equipment.reduce((s, id) => s + (WEAPONS[id]?.critBonus ?? 0), 0);
  return Math.max(0, Math.min(propSeg + weaponBonus, COMBAT_PARAMS.critAbsMax));
}

/** R7-1 期望伤害（§6/§4.3）：命中率 × (非暴伤害×(1−p) + 暴击伤害×p)，p = mustCrit ? 1 : 暴击率 */
export function expectedDamage(s: StrikeForecast): number {
  const p = s.mustCrit ? 1 : s.critRate / 100;
  return s.hitRate / 100 * (s.damage * (1 - p) + s.critDamage * p);
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

  const isMagic = skill.damageType === 'magic';
  const defAxis: 'pdef' | 'mdef' = isMagic ? 'mdef' : 'pdef';

  // 守方地形加成（飞行不享，§4.11）；R6-1：防/闪按伤害线取双轴字段（§4.3）
  const terrain = getTerrain(map, defender.position);
  const defFlying = isFlying(defT);
  const terrDef = !defFlying && terrain !== undefined
    ? TERRAIN_CONFIGS[terrain][isMagic ? 'mdefense' : 'pdefense'] : 0;
  const terrEva = !defFlying && terrain !== undefined
    ? TERRAIN_CONFIGS[terrain][isMagic ? 'mevasion' : 'pevasion'] : 0;

  // 守方护甲解析：活跃护盾覆盖类型（§4.10）；吸收在 resolveBattle 应用
  const { armor: defArmor } = resolveArmor(defender, defT);

  // 特性修正（§4.7 管线：在修正点直接查询攻守双方特性）
  const atkTraits = [...attacker.loadout.passive];
  const defTraits = [...defender.loadout.passive];

  // ---------- R4-2 统一伤害公式 ----------
  // 伤害 = max( floor( ((权重基数 + 固定值) x 克制系数 - 防御项 - 地形防 ), 0 ) + 部位伤害加算
  // 三线：物理扣 pdef、魔法扣 mdef；克制乘算位于 max 内（先乘后减）
  const backBonus = side === 'back' ? (skill.backPowerBonus ?? 0) : 0;

  // 伤害段基数：技能组合权重（R2-4 缺省取职业 defaultWeights，按伤害线分 phys/mag）+ 固定值 + 影袭背面威力
  const weights = skill.weights ?? getJob(atkT.id)!.defaultWeights[isMagic ? 'mag' : 'phys'];
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
  // 全局伤害倍率总封顶（R8 评审定稿：全部乘数联乘后截断 ≤4.0）；R7-1 暴击 ×2 进乘数区（同受封顶）
  const mult = Math.min(resistMult * backstabMult, COMBAT_PARAMS.totalDamageCap);
  const critMult = Math.min(resistMult * backstabMult * 2, COMBAT_PARAMS.totalDamageCap);

  // 防御项：背刺技能=背面无视一半防御
  const defForSkill = skill.halfDefFromBack && side === 'back'
    ? statValue(defender, defT, defAxis) / 2
    : statValue(defender, defT, defAxis);

  const damage = Math.max(Math.floor(segBase * mult - defForSkill - terrDef), 0) + PART_BONUS[side].damage;
  const critDamage = Math.max(Math.floor(segBase * critMult - defForSkill - terrDef), 0) + PART_BONUS[side].damage;

  // 沉稳：守方受到的部位命中补正减半
  const partHit = defTraits.includes('steady')
    ? Math.floor(PART_BONUS[side].hit / 2)
    : PART_BONUS[side].hit;

  // R4-6：命中公式接对应轴回避（物理线 phys / 法术线 mag）
  const evade = calcEvade(defender, defT, isMagic ? 'mag' : 'phys', terrEva);
  // R4-5 递增距离惩罚：第 n 个超程格 = base + step×(n−1)，累计求和（延伸格按基础射程计，§4.4）
  const over = Math.max(0, dist - skill.rangeMax);
  const rangePenalty = over === 0
    ? 0
    : COMBAT_PARAMS.rangePenaltyBase * over + COMBAT_PARAMS.rangePenaltyStep * over * (over - 1) / 2;
  // R7-2 鹰眼（远程）：命中加成参与喂溢出（§4.3——+30 自喂，溢出只对低回避目标产生）
  const eagleRanged = atkTraits.includes('eagle-eye') && skill.rangeMax >= COMBAT_PARAMS.rangedMinRange;
  const rawHit =
    COMBAT_PARAMS.hitBase + atkT.tec * COMBAT_PARAMS.hitPerTech - evade +
    partHit - rangePenalty +
    (eagleRanged ? TRAIT_CONFIGS['eagle-eye'].rangedHitBonus ?? 0 : 0);
  const hitRate = Math.max(COMBAT_PARAMS.hitMin, Math.min(COMBAT_PARAMS.hitMax, rawHit));
  // R7-2 命中溢出转暴击（1:1 进修正合计，限远程）；上限突破 = 技能/特性 critCapBonus 声明合计
  const critOverflow = eagleRanged ? Math.max(0, rawHit - COMBAT_PARAMS.hitMax) : 0;
  const critCapBonus = (skill.critCapBonus ?? 0)
    + atkTraits.reduce((s, id) => s + (TRAIT_CONFIGS[id]?.critCapBonus ?? 0), 0);

  return {
    skillName: skill.name, skillId: skill.id, damageType: skill.damageType, side, damage, hitRate, count: 1, rangePenalty,
    critRate: calcCritRate(attacker, atkT, defender, defT, { overflow: critOverflow, capBonus: critCapBonus }),
    critDamage,
    mustCrit: skill.critOverride === true
  };
}

/** 先攻反击阈值（R4-7）：默认 10 可配，守方特性声明可降（取最低，§4.3） */
function firstStrikeThresholdFor(passives: readonly string[]): number {
  let t: number = COMBAT_PARAMS.firstStrikeThreshold;
  for (const id of passives) {
    const v = TRAIT_CONFIGS[id]?.firstStrikeThreshold;
    if (v !== undefined && v < t) t = v;
  }
  return t;
}

/** 守方反击技能：普攻恒入候选，有效射程（§4.4 属性/特性加成，R21；地形不读同 R17 显示口径）覆盖攻方位置者中期望伤害最高（§4.3/§4.9；R7-1 起期望含暴击） */
function pickCounterSkill(
  map: MapState,
  defender: UnitState,
  defT: UnitTemplate,
  attacker: UnitState,
  atkT: UnitTemplate,
  dist: number
): SkillTemplate | null {
  let best: SkillTemplate | null = null;
  let bestScore = -1;
  for (const skill of [...basicAttackSkills(defender.equipment), ...getTemplateSkills(defT)]) {
    if (dist < skill.rangeMin || dist > effectiveRangeMax(defT, skill, undefined, defender.loadout.passive)) continue;
    const strike = calcStrike(map, defender, defT, attacker, atkT, skill);
    const score = expectedDamage(strike);  // 与 AI 择优同式（§4.3：精确期望，暴伤经防御后置）
    if (score > bestScore) {
      bestScore = score;
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
  const counterSkill = opts?.noCounter ? null : pickCounterSkill(map, defender, defT, attacker, atkT, dist);
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

  // R4-7 先攻反击：守方速度超出攻方 ≥ 阈值时，反击先行结算（反击存在为前提）
  const firstStrike = counter !== null
    && defT.spd - atkT.spd >= firstStrikeThresholdFor(defender.loadout.passive);

  return { attacker: attackerStrike, counter, firstStrike };
}

export interface StrikeResult {
  byAttacker: boolean;
  hit: boolean;
  crit: boolean;    // R7-1 暴击标记（表现层飘字/战报用）
  damage: number;
  absorbed: number;  // 护盾吸收部分（表现层区分扣血与吸收）
  side: PartSide;
  skillName: string;
  skillId: string;      // R16-2 表现层逐击选特效
  damageType: DamageType;
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
    // 返回目标是否阵亡；R7-1 逐击独立掷暴：先命中、命中落地才掷暴击（必暴不掷骰）
    const hit = rng() < s.hitRate / 100;
    const crit = hit && (s.mustCrit || rng() < s.critRate / 100);
    const damage = crit ? s.critDamage : (hit ? s.damage : 0);
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
    strikes.push({ byAttacker, hit, crit, damage, absorbed, side: s.side, skillName: s.skillName, skillId: s.skillId, damageType: s.damageType });
    if (hit) {
      // R5-2 资源积攒（§4.13）：攻击者命中入池（怒任意攻击/专与MP仅普攻）、受击方回怒；R7-1 暴击额外怒气
      const striker = byAttacker ? attacker : defender;
      const struck = byAttacker ? defender : attacker;
      gainOnHit(striker, s.skillName.endsWith('·普攻'));  // R2-2 普攻名 = 「武器名·普攻」
      gainOnStruck(struck);
      if (crit) gainOnCrit(striker);
    }
    if (byAttacker) return defenderHp === 0;
    return attackerHp === 0;
  };

  // R4-7 先攻反击（触发时）→ 攻方攻击 → 守方反击 → 追击；先攻击杀攻方则其攻击不发生（§4.3）
  if (forecast.counter && forecast.firstStrike && strike(forecast.counter, false)) {
    return { strikes, attackerHp, defenderHp };
  }
  // 第一击：攻方
  if (strike(forecast.attacker, true)) {
    return { strikes, attackerHp, defenderHp };
  }
  // 第二击：守方反击（先攻已结算时该位已消耗，不重复反击）
  if (!forecast.firstStrike && forecast.counter && strike(forecast.counter, false)) {
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
  crit: boolean;  // R7-1 暴击标记
  damage: number;
  absorbed: number;
  forecast: StrikeForecast;
}

/** 单目标 AoE 预报：主段 + 附加伤害段（各段独立过矩阵，同侧同命中；暴击伤害同构合成——R7-1） */
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
    return {
      ...main,
      damage: main.damage + Math.floor(main.damage / 2),
      critDamage: main.critDamage + Math.floor(main.critDamage / 2)
    };
  }
  if (!skill.segments || skill.segments.length === 0) return main;
  let total = main.damage;
  let critTotal = main.critDamage;
  for (const seg of skill.segments) {
    const segSkill: SkillTemplate = {
      ...skill, damageType: seg.damageType, power: seg.power, segments: undefined
    };
    const segStrike = calcStrike(map, attacker, atkT, defender, defT, segSkill);
    total += segStrike.damage;
    critTotal += segStrike.critDamage;
  }
  return { ...main, damage: total, critDamage: critTotal };
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
    const crit = hit && (forecast.mustCrit || rng() < forecast.critRate / 100);
    const damage = crit ? forecast.critDamage : (hit ? forecast.damage : 0);
    const absorbed = applyDamageToUnit(t, defT, damage);
    if (hit) {
      gainOnHit(caster, skill.id.startsWith('basic:'));  // R5-2 命中积攒（R2-2 普攻 id = basic:<武器>）
      gainOnStruck(t);
      if (crit) gainOnCrit(caster);  // R7-1 暴击额外怒气
    }
    results.push({ targetId: t.id, hit, crit, damage, absorbed, forecast });
  }
  return results;
}


/** R4-5 属性条件射程加成 + R12-2 特性门控动态射程（§4.4：弓挂力量、法术挂魔力、治疗/增益法术挂技×「强化治疗」特性；阈值可配；同类不互斥按加法合计；R2-2 起普攻自带 weaponType 统一走 isBow 判定；被动来源 = 实例装填 loadout.passive，R3-3 口径） */
export function rangeBonus(t: import('../config/units').UnitTemplate, skill: SkillTemplate, passive?: readonly string[]): number {
  let bonus = 0;
  if (skill.damageType === 'magic' && t.mag >= RANGE_PARAMS.spellMagThreshold) bonus += RANGE_PARAMS.spellBonus;
  if ((skill as SpellTemplate).targetType === 'ally' && passive?.includes('heal-boost') && t.tec >= RANGE_PARAMS.healTecThreshold) {
    bonus += RANGE_PARAMS.healBonus;
  }
  const wt = skill.weaponType;
  const isBow = wt === 'bow' || (Array.isArray(wt) && wt.includes('bow'));
  if (isBow && t.str >= RANGE_PARAMS.bowStrThreshold) bonus += RANGE_PARAMS.bowBonus;
  return bonus;
}

/** R6-1 地形额外射程（§3/§4.4：即时读、只加最大射程；飞行不享加成型地形效果 §4.11） */
function terrainRangeBonus(t: import('../config/units').UnitTemplate, terrain?: TerrainType): number {
  if (terrain === undefined || isFlying(t)) return 0;
  return TERRAIN_CONFIGS[terrain].rangeBonus;
}

/** 实际射程上限 = 技能基础 + 属性加成 + 地形加成（目标选择/择优用；惩罚仍按基础 rangeMax）；passive 透传 rangeBonus 实例被动（R12-2） */
export function effectiveRangeMax(
  t: import('../config/units').UnitTemplate,
  skill: SkillTemplate,
  terrain?: TerrainType,
  passive?: readonly string[]
): number {
  return skill.rangeMax + rangeBonus(t, skill, passive) + terrainRangeBonus(t, terrain);
}
