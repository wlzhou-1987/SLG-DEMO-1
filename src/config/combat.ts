import type { DamageType, ArmorType } from '../core/types';

/** 物理矩阵（§4.2 定稿梯度，R4-3：列序 无甲/轻甲/中甲/重甲；法术行已移出——魔法走法术级对护甲系数 armorResist）
 * 原则：武器=应对卡——斩泛用平缓、突随护甲递减、钝随护甲递增；行和均衡、列和单调递减 */
export const DAMAGE_ARMOR_MATRIX: Record<Exclude<DamageType, 'magic'>, Record<ArmorType, number>> = {
  slashing: { none: 1.2, light: 1.0, medium: 1.0, heavy: 0.7 },
  piercing: { none: 1.3, light: 1.2, medium: 0.8, heavy: 0.6 },
  blunt: { none: 0.8, light: 0.8, medium: 1.0, heavy: 1.4 }
};

/** 部位补正（§4.7） */
export const PART_BONUS = {
  front: { hit: 0, damage: 0 },
  side: { hit: 10, damage: 0 },
  back: { hit: 25, damage: 3 }
} as const;

/** 战斗公式参数（§4.3/§4.4） */
export const COMBAT_PARAMS = {
  hitBase: 50,          // 命中基数
  hitPerTech: 5,        // 每点技巧命中
  // R4-6 双轴回避系数（§4.3）：回避 = 速×速系数 + 运×运系数 + 对应线地形闪避；
  // 两轴四系数独立可配、两轴同值；R4-8 定稿：速 3 / 运 3（回避 = (速+运)×3）
  evadeCoeffs: {
    phys: { spd: 3, lck: 3 },
    mag: { spd: 3, lck: 3 }
  },
  pursuitSpeedDiff: 4,  // 追击速度差阈值
  firstStrikeThreshold: 10,  // R4-7 先攻反击：守方速度超出攻方 ≥ 阈值时反击先行（可被守方特性降低）
  rangePenaltyBase: 15,   // R4-5 递增距离惩罚：第 1 个超程格
  rangePenaltyStep: 10,   // 每多 1 格递增值（第 n 格 = base + step×(n−1) 累计求和）
  hitMin: 5,
  hitMax: 100,
  counterCap: 3.0,
  totalDamageCap: 4.0
} as const;

/** R4-5 属性条件射程（§4.4 定稿：弓挂力量、法术挂魔力；阈值可配，占位值随 R4-8 数值定稿） */
export const RANGE_PARAMS = {
  bowStrThreshold: 19,   // 力量 ≥ 19 弓类射程 +1（终战档：我方弓箭 19 吃、敌弓 13 不吃）
  spellMagThreshold: 20, // 魔力 ≥ 20 法术施法距离 +1（法师 24 吃、敌方法师 19 不吃）
  bowBonus: 1,
  spellBonus: 1
} as const;

/** R5 资源参数（§4.13 设计定稿：怒气 100 空起 / 专注 100 满起每回合回 20 / MP 上限 = mag×5；
 *  积攒/消耗/恢复量占位随 R5-3 平衡定稿） */
export const RESOURCE_PARAMS = {
  rageMax: 100,
  focusMax: 100,
  mpPerMag: 5
} as const;

/** R3-9 状态与增益参数（占位数值，随 R4/R5 数值期重定；全部配置可调） */
export const EFFECT_PARAMS = {
  stanceDefBonus: 3,      // 防御姿态：物防加成
  auraAtkBonus: 2,        // 领主光环：范围内友军攻击加成
  auraRange: 2,           // 光环半径（格）
  warCryAtkBonus: 2,      // 战斗怒吼：范围内友军攻击加成
  warCryTurns: 2,         // 战斗怒吼持续回合
  warCryRage: 2,          // 战斗怒吼：自身怒气生成（计数暂存，结算归 R5）
  blessingDef: 3,         // 祝福：防御加成初始值（R4 后改魔防轴）
  blessingDecay: 1,       // 祝福：每回合衰减
  blessingBoostHeal: 2,   // 强化祝福：祝福期间每回合回血
  blessingBoostRage: 1,
  chargePerHex: 1,
  chargeCap: 5,
  berserkMaxBonus: 6,
  lifestealRate: 0.5,
  pyroBoostMult: 1.25,
  pyroDotTurns: 2,
  healPerTechHalf: 0.5,
  ambushBonus: 5,
  aimPowerBonus: 3
// 强化祝福：祝福期间每回合怒气生成
} as const;
