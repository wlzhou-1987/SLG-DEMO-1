// 六边形坐标（轴坐标）
export interface HexCoord {
  q: number;
  r: number;
}

// 像素坐标
export interface PixelCoord {
  x: number;
  y: number;
}

// 朝向（0-5，对应 6 个方向）
export type Facing = 0 | 1 | 2 | 3 | 4 | 5;

// 地形类型
export type TerrainType = 'plain' | 'forest' | 'mountain' | 'base';

// 阵营
export type Faction = 'player' | 'enemy';

// 护甲类型
export type ArmorType = 'none' | 'light' | 'medium' | 'heavy';

// 伤害类型
export type DamageType = 'piercing' | 'slashing' | 'blunt' | 'magic';
