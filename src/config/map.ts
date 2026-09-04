import type { HexCoord } from '../core/types';
import type { MapOverrides } from '../core/map';
import type { Faction } from '../core/types';

export interface UnitPlacement {
  templateId: string;
  faction: Faction;
  position: HexCoord;
}

export const MAP_OVERRIDES: MapOverrides = {
  forests: [
    { q: 5, r: 10 }, { q: 6, r: 10 }, { q: 5, r: 11 },
    { q: 14, r: 10 }, { q: 15, r: 10 }, { q: 14, r: 11 },
    { q: 9, r: 15 }, { q: 10, r: 15 }, { q: 11, r: 15 },
    { q: 3, r: 20 }, { q: 4, r: 20 }, { q: 16, r: 20 }, { q: 17, r: 20 }
  ],
  mountains: [
    { q: 0, r: 12 }, { q: 1, r: 12 }, { q: 18, r: 12 }, { q: 19, r: 12 },
    { q: 9, r: 8 }, { q: 10, r: 8 }, { q: 9, r: 9 }, { q: 10, r: 9 }
  ],
  bases: [
    { q: 10, r: 2 }
  ]
};

export const INITIAL_UNITS: UnitPlacement[] = [
  // 我方：南端出生
  { templateId: 'lord', faction: 'player', position: { q: 10, r: 27 } },
  { templateId: 'defender', faction: 'player', position: { q: 8, r: 28 } },
  { templateId: 'paladin', faction: 'player', position: { q: 12, r: 28 } },
  { templateId: 'thief', faction: 'player', position: { q: 6, r: 27 } },
  { templateId: 'knight', faction: 'player', position: { q: 14, r: 27 } },
  { templateId: 'pegasus', faction: 'player', position: { q: 4, r: 26 } },
  { templateId: 'axeman', faction: 'player', position: { q: 16, r: 26 } },
  { templateId: 'archer', faction: 'player', position: { q: 9, r: 26 } },
  { templateId: 'priest', faction: 'player', position: { q: 11, r: 26 } },
  { templateId: 'mage', faction: 'player', position: { q: 7, r: 29 } },

  // 敌方 · 南线前哨 A（西侧+东侧）
  { templateId: 'swordsman', faction: 'enemy', position: { q: 5, r: 20 } },
  { templateId: 'swordsman', faction: 'enemy', position: { q: 6, r: 20 } },
  { templateId: 'swordsman', faction: 'enemy', position: { q: 14, r: 20 } },
  { templateId: 'swordsman', faction: 'enemy', position: { q: 15, r: 20 } },
  { templateId: 'archer_enemy', faction: 'enemy', position: { q: 5, r: 19 } },
  { templateId: 'archer_enemy', faction: 'enemy', position: { q: 15, r: 19 } },
  { templateId: 'swordsman', faction: 'enemy', position: { q: 7, r: 18 } },
  { templateId: 'archer_enemy', faction: 'enemy', position: { q: 13, r: 18 } },

  // 敌方 · 南线前哨 B（中路）
  { templateId: 'swordsman', faction: 'enemy', position: { q: 9, r: 20 } },
  { templateId: 'swordsman', faction: 'enemy', position: { q: 11, r: 20 } },
  { templateId: 'archer_enemy', faction: 'enemy', position: { q: 10, r: 19 } },

  // 敌方 · 中线纵深 A（枪/斧/锤混编）
  { templateId: 'spearman', faction: 'enemy', position: { q: 4, r: 15 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 5, r: 15 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 15, r: 15 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 16, r: 15 } },
  { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 4, r: 14 } },
  { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 16, r: 14 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 6, r: 14 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 14, r: 14 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 5, r: 13 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 15, r: 13 } },

  // 敌方 · 中线纵深 B（山口守卫）
  { templateId: 'spearman', faction: 'enemy', position: { q: 8, r: 10 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 12, r: 10 } },
  { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 8, r: 9 } },
  { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 12, r: 9 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 9, r: 7 } },

  // 敌方 · 中线纵深 C（山口两侧）
  { templateId: 'spearman', faction: 'enemy', position: { q: 7, r: 9 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 13, r: 9 } },

  // 敌方 · 中线纵深 D（山南两翼）
  { templateId: 'spearman', faction: 'enemy', position: { q: 8, r: 12 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 12, r: 12 } },
  { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 10, r: 12 } },

  // 敌方 · 北端卫队 A
  { templateId: 'spearman', faction: 'enemy', position: { q: 7, r: 6 } },
  { templateId: 'spearman', faction: 'enemy', position: { q: 13, r: 6 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 8, r: 5 } },
  { templateId: 'hammerman', faction: 'enemy', position: { q: 12, r: 5 } },
  { templateId: 'mage_enemy', faction: 'enemy', position: { q: 9, r: 4 } },
  { templateId: 'mage_enemy', faction: 'enemy', position: { q: 11, r: 4 } },

  // 敌方 · 北端卫队 B（BOSS 亲军）
  { templateId: 'hammerman', faction: 'enemy', position: { q: 9, r: 3 } },
  { templateId: 'mage_enemy', faction: 'enemy', position: { q: 11, r: 3 } },

  // 敌方 · BOSS（驻基地）
  { templateId: 'boss', faction: 'enemy', position: { q: 10, r: 2 } }
];
