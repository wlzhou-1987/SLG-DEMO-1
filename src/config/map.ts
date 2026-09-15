import type { HexCoord } from '../core/types';
import type { MapOverrides } from '../core/map';
import type { Faction } from '../core/types';
import type { SkillLoadout } from '../core/unit';

export interface UnitPlacement {
  templateId: string;
  faction: Faction;
  position: HexCoord;
  loadout?: SkillLoadout;
  equipment?: readonly string[];   // 关卡覆盖默认装备（R2-2，§4.14）
}

/** 敌组 AI 激活类型（§6）：待机=警戒/被攻击激活；主动=登场即激活；boss=驻守不移动 */
export type GroupAiType = 'dormant' | 'aggressive' | 'boss';

export interface EnemyGroupConfig {
  id: string;
  aiType: GroupAiType;
  units: UnitPlacement[];
}

/** 战前部署区（§7.0 R1）：可放置我方初始站位的矩形范围 */
export interface DeployZone {
  qMin: number;
  qMax: number;
  rMin: number;
  rMax: number;
}

/** 部署区默认南端四行全宽（2026-09-07 拍板）；现 PLAYER_UNITS 站位全部落在区内 */
export const DEPLOY_ZONE: DeployZone = { qMin: 0, qMax: 19, rMin: 26, rMax: 29 };

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

export const PLAYER_UNITS: UnitPlacement[] = [
  // 我方：南端出生
  { templateId: 'lord', faction: 'player', position: { q: 10, r: 27 } },
  { templateId: 'defender', faction: 'player', position: { q: 8, r: 28 } },
  { templateId: 'paladin', faction: 'player', position: { q: 12, r: 28 } },
  { templateId: 'thief', faction: 'player', position: { q: 6, r: 27 } },
  { templateId: 'knight', faction: 'player', position: { q: 14, r: 27 } },
  { templateId: 'pegasus', faction: 'player', position: { q: 5, r: 27 } },
  { templateId: 'axeman', faction: 'player', position: { q: 16, r: 26 } },
  { templateId: 'archer', faction: 'player', position: { q: 9, r: 27 } },
  { templateId: 'priest', faction: 'player', position: { q: 11, r: 27 } },
  { templateId: 'mage', faction: 'player', position: { q: 7, r: 29 } }
];

export const ENEMY_GROUPS: EnemyGroupConfig[] = [
  {
    id: 'outpostA', aiType: 'dormant',
    // 南线前哨 A（西侧+东侧）
    units: [
      { templateId: 'swordsman', faction: 'enemy', position: { q: 5, r: 20 } },
      { templateId: 'swordsman', faction: 'enemy', position: { q: 6, r: 20 } },
      { templateId: 'swordsman', faction: 'enemy', position: { q: 14, r: 20 } },
      { templateId: 'swordsman', faction: 'enemy', position: { q: 15, r: 20 } },
      { templateId: 'archer_enemy', faction: 'enemy', position: { q: 5, r: 19 }, loadout: { active: ['snipe'], passive: ['true-sight'] } },
      { templateId: 'archer_enemy', faction: 'enemy', position: { q: 15, r: 19 }, loadout: { active: ['snipe'], passive: ['true-sight'] } },
      { templateId: 'swordsman', faction: 'enemy', position: { q: 7, r: 18 } },
      { templateId: 'archer_enemy', faction: 'enemy', position: { q: 13, r: 18 }, loadout: { active: ['snipe'], passive: ['true-sight'] } }
    ]
  },
  {
    id: 'outpostB', aiType: 'aggressive',
    // 南线前哨 B（中路）——主动型，开场压制（§6）
    units: [
      { templateId: 'swordsman', faction: 'enemy', position: { q: 9, r: 20 } },
      { templateId: 'swordsman', faction: 'enemy', position: { q: 11, r: 20 } },
      { templateId: 'archer_enemy', faction: 'enemy', position: { q: 10, r: 19 }, loadout: { active: ['snipe'], passive: ['true-sight'] } }
    ]
  },
  {
    id: 'midA', aiType: 'dormant',
    // 中线纵深 A（枪/斧/锤混编）
    units: [
      { templateId: 'spearman', faction: 'enemy', position: { q: 4, r: 15 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 5, r: 15 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 15, r: 15 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 16, r: 15 } },
      { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 4, r: 14 } },
      { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 16, r: 14 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 6, r: 14 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 14, r: 14 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 5, r: 13 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 15, r: 13 } }
    ]
  },
  {
    id: 'midB', aiType: 'dormant',
    // 中线纵深 B（山口守卫）
    units: [
      { templateId: 'spearman', faction: 'enemy', position: { q: 8, r: 10 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 12, r: 10 } },
      { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 8, r: 9 } },
      { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 12, r: 9 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 9, r: 7 } }
    ]
  },
  {
    id: 'midC', aiType: 'dormant',
    // 中线纵深 C（山口两侧）
    units: [
      { templateId: 'spearman', faction: 'enemy', position: { q: 7, r: 9 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 13, r: 9 } }
    ]
  },
  {
    id: 'midD', aiType: 'dormant',
    // 中线纵深 D（山南两翼）
    units: [
      { templateId: 'spearman', faction: 'enemy', position: { q: 8, r: 12 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 12, r: 12 } },
      { templateId: 'axeman_enemy', faction: 'enemy', position: { q: 10, r: 12 } }
    ]
  },
  {
    id: 'guardA', aiType: 'dormant',
    // 北端卫队 A
    units: [
      { templateId: 'spearman', faction: 'enemy', position: { q: 7, r: 6 } },
      { templateId: 'spearman', faction: 'enemy', position: { q: 13, r: 6 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 8, r: 5 } },
      { templateId: 'hammerman', faction: 'enemy', position: { q: 12, r: 5 } },
      { templateId: 'mage_enemy', faction: 'enemy', position: { q: 9, r: 4 } },
      { templateId: 'mage_enemy', faction: 'enemy', position: { q: 11, r: 4 } }
    ]
  },
  {
    id: 'guardB', aiType: 'dormant',
    // 北端卫队 B（BOSS 亲军，待机型——激活后可移动参战）
    units: [
      { templateId: 'hammerman', faction: 'enemy', position: { q: 9, r: 3 } },
      { templateId: 'mage_enemy', faction: 'enemy', position: { q: 11, r: 3 } }
    ]
  },
  {
    id: 'bossGroup', aiType: 'boss',
    // BOSS（单独成组，驻基地不移动）
    units: [
      { templateId: 'boss', faction: 'enemy', position: { q: 10, r: 2 }, loadout: { active: ['warHammer', 'sweep'], passive: ['true-sight'] } }
    ]
  }
];
