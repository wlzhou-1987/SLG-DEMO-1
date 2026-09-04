import type { HexCoord } from '../core/types';

export type ReinforcementTrigger =
  | { kind: 'turn'; turn: number }
  | { kind: 'groupHpBelow'; groupId: string; percent: number };

export interface ReinforcementEvent {
  id: string;
  groupId: string;              // 登场单位归属组（登场即激活，§6）
  trigger: ReinforcementTrigger;
  units: Array<{ templateId: string; point: HexCoord }>;  // point = 地图边缘刷新点
  times?: number;               // 默认 1（DEMO 均一次性）
}

/** DEMO 增援（§6 建议，数值可配）：①第 5 回合东西各 3 人 ②BOSS 组半血北端 4 锤兵 */
export const REINFORCEMENTS: ReinforcementEvent[] = [
  {
    id: 'westTurn5',
    groupId: 'reinWest',
    trigger: { kind: 'turn', turn: 5 },
    units: [
      { templateId: 'swordsman', point: { q: 0, r: 16 } },
      { templateId: 'swordsman', point: { q: 0, r: 17 } },
      { templateId: 'archer_enemy', point: { q: 0, r: 18 } }
    ]
  },
  {
    id: 'eastTurn5',
    groupId: 'reinEast',
    trigger: { kind: 'turn', turn: 5 },
    units: [
      { templateId: 'swordsman', point: { q: 19, r: 16 } },
      { templateId: 'swordsman', point: { q: 19, r: 17 } },
      { templateId: 'archer_enemy', point: { q: 19, r: 18 } }
    ]
  },
  {
    id: 'bossGuard',
    groupId: 'reinBoss',
    trigger: { kind: 'groupHpBelow', groupId: 'bossGroup', percent: 0.5 },
    units: [
      { templateId: 'hammerman', point: { q: 8, r: 0 } },
      { templateId: 'hammerman', point: { q: 9, r: 0 } },
      { templateId: 'hammerman', point: { q: 10, r: 0 } },
      { templateId: 'hammerman', point: { q: 11, r: 0 } }
    ]
  }
];
