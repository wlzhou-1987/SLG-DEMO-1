import type { HexCoord, Faction } from './types';

export interface UnitState {
  id: string;
  templateId: string;
  faction: Faction;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  hasActed: boolean;
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
  unitCounter++;
  return {
    id: `${faction}-${unitCounter}`,
    templateId,
    faction,
    position: { ...position },
    facing: faction === 'player' ? 1 : 4,
    hp: 20,
    maxHp: 20,
    hasActed: false
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
