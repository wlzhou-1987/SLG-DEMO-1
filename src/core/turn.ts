import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';

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

/** 玩家阶段开始：重置行动标记与本回合移动力消耗，驻基地单位回复 10% 最大 HP（§3） */
export function startPlayerPhase(units: UnitState[], map: MapState): void {
  for (const u of units) {
    u.hasActed = false;
    u.moveSpent = 0;
    if (getTerrain(map, u.position) === 'base') {
      u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp / 10));
    }
  }
}
