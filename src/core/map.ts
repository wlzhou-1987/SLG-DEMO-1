import type { HexCoord, TerrainType } from './types';
import { isValidHex } from './hex';
import type { UnitState } from './unit';

export const MAP_WIDTH = 20;
export const MAP_HEIGHT = 30;

export interface MapState {
  width: number;
  height: number;
  terrain: TerrainType[][];
}

export interface MapOverrides {
  forests?: HexCoord[];
  mountains?: HexCoord[];
  bases?: HexCoord[];
}

export function createMapState(overrides: MapOverrides = {}): MapState {
  const terrain: TerrainType[][] = [];
  for (let r = 0; r < MAP_HEIGHT; r++) {
    terrain[r] = [];
    for (let q = 0; q < MAP_WIDTH; q++) {
      terrain[r][q] = 'plain';
    }
  }
  for (const pos of overrides.forests ?? []) {
    if (isValidHex(pos, MAP_WIDTH, MAP_HEIGHT)) {
      terrain[pos.r][pos.q] = 'forest';
    }
  }
  for (const pos of overrides.mountains ?? []) {
    if (isValidHex(pos, MAP_WIDTH, MAP_HEIGHT)) {
      terrain[pos.r][pos.q] = 'mountain';
    }
  }
  for (const pos of overrides.bases ?? []) {
    if (isValidHex(pos, MAP_WIDTH, MAP_HEIGHT)) {
      terrain[pos.r][pos.q] = 'base';
    }
  }
  return { width: MAP_WIDTH, height: MAP_HEIGHT, terrain };
}

export function getTerrain(map: MapState, pos: HexCoord): TerrainType | undefined {
  if (!isValidHex(pos, map.width, map.height)) return undefined;
  return map.terrain[pos.r][pos.q];
}

export function isPassable(
  map: MapState,
  pos: HexCoord,
  flying: boolean,
  units: UnitState[] = []
): boolean {
  const terrain = getTerrain(map, pos);
  if (terrain === undefined) return false;
  if (!flying && terrain === 'mountain') return false;
  if (!flying) {
    const unit = units.find(u => u.position.q === pos.q && u.position.r === pos.r);
    if (unit) return false;
  }
  return true;
}

export function getMoveCost(map: MapState, pos: HexCoord, flying: boolean): number {
  const terrain = getTerrain(map, pos);
  if (terrain === undefined) return Infinity;
  if (flying) return 1;
  if (terrain === 'mountain') return Infinity;
  if (terrain === 'forest') return 2;
  return 1;
}
