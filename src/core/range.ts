import type { HexCoord } from './types';
import type { MapState } from './map';
import type { UnitState } from './unit';
import { getMoveCost, isPassable } from './map';
import { neighbor, hexKey } from './hex';
import type { Facing } from './types';

export function calcMovementRange(
  map: MapState,
  units: UnitState[],
  origin: HexCoord,
  movePoints: number,
  flying: boolean
): Set<string> {
  const result = new Set<string>();
  const cost = new Map<string, number>();
  const originKey = hexKey(origin);

  result.add(originKey);
  cost.set(originKey, 0);

  const deque: Array<{ pos: HexCoord; totalCost: number }> = [
    { pos: origin, totalCost: 0 }
  ];

  while (deque.length > 0) {
    const current = deque.shift()!;
    const currentKey = hexKey(current.pos);
    const currentCost = cost.get(currentKey)!;

    if (currentCost > current.totalCost) continue;

    for (let dir = 0; dir < 6; dir++) {
      const nextPos = neighbor(current.pos, dir as Facing);
      const nextKey = hexKey(nextPos);

      if (!isPassable(map, nextPos, flying, units)) continue;

      const moveCost = getMoveCost(map, nextPos, flying);
      const newCost = currentCost + moveCost;

      if (newCost > movePoints) continue;

      const existingCost = cost.get(nextKey);
      if (existingCost === undefined || newCost < existingCost) {
        cost.set(nextKey, newCost);
        result.add(nextKey);

        if (moveCost === 1) {
          deque.unshift({ pos: nextPos, totalCost: newCost });
        } else {
          deque.push({ pos: nextPos, totalCost: newCost });
        }
      }
    }
  }

  return result;
}

export function calcAttackRange(
  movementRange: Set<string>,
  rangeMin: number,
  rangeMax: number
): Set<string> {
  const attackRange = new Set<string>();

  for (const moveKey of movementRange) {
    const [qStr, rStr] = moveKey.split(',');
    const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };

    for (let dq = -rangeMax; dq <= rangeMax; dq++) {
      for (let dr = -rangeMax; dr <= rangeMax; dr++) {
        if (Math.abs(dq + dr) > rangeMax) continue;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        if (dist < rangeMin || dist > rangeMax) continue;

        const target: HexCoord = { q: pos.q + dq, r: pos.r + dr };
        const targetKey = hexKey(target);
        if (!movementRange.has(targetKey)) {
          attackRange.add(targetKey);
        }
      }
    }
  }

  return attackRange;
}
