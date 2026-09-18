import type { TerrainType } from '../core/types';

/** 地形效果字段（R6-1 定稿 §3：显式平铺、缺省 0；消费点只读字段不认地形名） */
export interface TerrainConfig {
  type: TerrainType;
  moveCost: number;
  pevasion: number;    // 物理闪避
  mevasion: number;    // 法术闪避
  pdefense: number;    // 物理防
  mdefense: number;    // 法术防
  hpRegenPct: number;  // HP 回复（回合开始，按最大 HP 百分比）
  mpRegen: number;     // MP 回复（回合开始固定值，仅 MP 资源单位受益）
  rangeBonus: number;  // 额外射程（只加最大射程不抬最小射程；本期 4 地形 0 留扩展）
  color: string;
  label: string;
}

export const TERRAIN_CONFIGS: Record<TerrainType, TerrainConfig> = {
  plain: {
    type: 'plain',
    moveCost: 1,
    pevasion: 0,
    mevasion: 0,
    pdefense: 0,
    mdefense: 0,
    hpRegenPct: 0,
    mpRegen: 0,
    rangeBonus: 0,
    color: '#4a6350',
    label: '平原'
  },
  forest: {
    type: 'forest',
    moveCost: 2,
    pevasion: 20,
    mevasion: 10,   // R6-2 定稿：物理掩蔽强于法术（减半）
    pdefense: 1,
    mdefense: 0,    // R6-2 定稿：树不挡魔法
    hpRegenPct: 0,
    mpRegen: 0,
    rangeBonus: 0,
    color: '#2f4736',
    label: '森林'
  },
  mountain: {
    type: 'mountain',
    moveCost: Infinity,
    pevasion: 0,
    mevasion: 0,
    pdefense: 0,
    mdefense: 0,
    hpRegenPct: 0,
    mpRegen: 0,
    rangeBonus: 0,
    color: '#6a675f',
    label: '山'
  },
  base: {
    type: 'base',
    moveCost: 1,
    pevasion: 20,
    mevasion: 20,   // R6-2 定稿：工事双向掩蔽
    pdefense: 2,
    mdefense: 1,    // R6-2 定稿：硬抗但低于物理
    hpRegenPct: 10,
    mpRegen: 10,    // R6-2 定稿：通用补给点，仅 MP 资源受益
    rangeBonus: 0,
    color: '#7d6a3d',
    label: '基地'
  }
};
