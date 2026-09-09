import { distance } from './hex';
import type { Faction } from './types';
import type { UnitState } from './unit';
import { TRAIT_CONFIGS } from '../config/traits';

export const STEALTH_SKILL_NAME = '潜行';
export const TRUE_SIGHT_TRAIT_ID = 'true-sight';

/** 进入潜行（绝对隐身，§4.9：跨回合维持，无自然到期） */
export function enterStealth(unit: UnitState): void {
  if (isStealthed(unit)) return;
  unit.statuses.push({
    type: 'stealth', skillName: STEALTH_SKILL_NAME,
    turnsLeft: -1, appliedAtTurn: 0
  });
}

/** 打破潜行（三类主动行为触发；真实视野显形不走此处——被发现≠被打破） */
export function cancelStealth(unit: UnitState): void {
  unit.statuses = unit.statuses.filter(s => s.type !== 'stealth');
}

export function isStealthed(unit: UnitState): boolean {
  return unit.statuses.some(s => s.type === 'stealth');
}

/** 单位对某阵营是否可见：己方阵营恒可见；无潜行恒可见；潜行仅当对方阵营存在真实视野持有者在范围内 */
export function isVisibleTo(
  unit: UnitState,
  viewerFaction: Faction,
  units: UnitState[]
): boolean {
  if (unit.faction === viewerFaction) return true;
  if (!isStealthed(unit)) return true;
  return units.some(h =>
    h.hp > 0 &&
    h.faction === viewerFaction &&
    h.loadout.passive.includes(TRUE_SIGHT_TRAIT_ID) &&
    distance(h.position, unit.position) <= (TRAIT_CONFIGS[TRUE_SIGHT_TRAIT_ID]?.revealRange ?? 0)
  );
}
