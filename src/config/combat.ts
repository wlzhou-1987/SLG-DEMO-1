import type { DamageType, ArmorType } from '../core/types';

/** 伤害类型 × 护甲类型 加成矩阵（§4.2：每行每列恰一个 ×1.25 与一个 ×0.75） */
export const DAMAGE_ARMOR_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  piercing: { none: 1.25, light: 1.0, medium: 1.0, heavy: 0.75 },
  slashing: { none: 1.0, light: 1.25, medium: 0.75, heavy: 1.0 },
  blunt: { none: 1.0, light: 0.75, medium: 1.25, heavy: 1.0 },
  magic: { none: 0.75, light: 1.0, medium: 1.0, heavy: 1.25 }
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
  evadePerLuck: 3,      // 每点幸运回避
  pursuitSpeedDiff: 4,  // 追击速度差阈值
  rangePenaltyPerHex: 15, // 超射程每格命中惩罚
  hitMin: 5,
  hitMax: 100
} as const;
