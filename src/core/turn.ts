import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { Faction } from './types';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { gainResource } from './resources';

export type VictoryState = 'ongoing' | 'playerWin' | 'playerLose';

/** 胜负判定（§2：敌方全灭胜；我方全灭或领主阵亡败） */
export function checkVictory(units: UnitState[]): VictoryState {
  if (!units.some(u => u.faction === 'enemy')) return 'playerWin';
  if (!units.some(u => u.faction === 'player')) return 'playerLose';
  if (!units.some(u => u.faction === 'player' && u.templateId === 'lord')) {
    return 'playerLose';
  }
  return 'ongoing';
}

/** 玩家阶段开始：重置行动标记与本回合移动力消耗（§4.8） */
export function startPlayerPhase(units: UnitState[]): void {
  for (const u of units) {
    u.hasActed = false;
    u.moveSpent = 0;
  }
}

/** 地形回复（§3 R6-1：数据驱动，持有者阵营阶段开始——与状态/资源推进同层；占据型效果飞行照常享受 §4.11） */
export function applyTerrainRegen(units: UnitState[], faction: Faction, map: MapState): void {
  for (const u of units) {
    if (u.faction !== faction || u.hp <= 0) continue;
    const terrain = getTerrain(map, u.position);
    if (terrain === undefined) continue;
    const cfg = TERRAIN_CONFIGS[terrain];
    if (cfg.hpRegenPct > 0) {
      u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * cfg.hpRegenPct / 100));
    }
    if (cfg.mpRegen > 0 && u.resources.type === 'mp') {
      gainResource(u, cfg.mpRegen);
    }
  }
}
