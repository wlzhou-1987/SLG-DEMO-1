import type { HexCoord, Faction } from './types';
import { getTemplate } from '../config/units';
import type { ActiveStatus } from './status';

export interface UnitState {
  id: string;
  templateId: string;
  faction: Faction;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  hasActed: boolean;
  statuses: ActiveStatus[];
}

let unitCounter = 0;

export function resetUnitCounter(): void {
  unitCounter = 0;
}

export function createUnitState(
  templateId: string,
  faction: Faction,
  position: HexCoord
): UnitState {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`未知单位模板: ${templateId}`);
  unitCounter++;
  return {
    id: `${faction}-${unitCounter}`,
    templateId,
    faction,
    position: { ...position },
    facing: faction === 'player' ? 1 : 4,
    hp: template.hp,
    maxHp: template.hp,
    hasActed: false,
    statuses: []
  };
}

export function getUnitAt(
  units: UnitState[],
  pos: HexCoord,
  faction?: Faction
): UnitState | undefined {
  return units.find(u => {
    if (u.position.q !== pos.q || u.position.r !== pos.r) return false;
    if (faction !== undefined && u.faction !== faction) return false;
    return true;
  });
}
