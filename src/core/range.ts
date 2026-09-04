import type { HexCoord } from './types';
import type { MapState } from './map';
import type { UnitState } from './unit';
import { getMoveCost, isPassable } from './map';
import { neighbor, hexKey } from './hex';
import { getUnitAt } from './unit';
import type { Facing } from './types';

/** 移动代价表：起点到各可达格的最小消耗（飞行途经被占格亦计入，供已消耗移动力计算） */
export function calcMovementCosts(
  map: MapState,
  units: UnitState[],
  origin: HexCoord,
  movePoints: number,
  flying: boolean
): Map<string, number> {
  const cost = new Map<string, number>();
  const originKey = hexKey(origin);
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

        if (moveCost === 1) {
          deque.unshift({ pos: nextPos, totalCost: newCost });
        } else {
          deque.push({ pos: nextPos, totalCost: newCost });
        }
      }
    }
  }

  return cost;
}

export function calcMovementRange(
  map: MapState,
  units: UnitState[],
  origin: HexCoord,
  movePoints: number,
  flying: boolean
): Set<string> {
  const cost = calcMovementCosts(map, units, origin, movePoints, flying);
  const result = new Set<string>();
  for (const key of cost.keys()) {
    const [qStr, rStr] = key.split(',');
    const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
    // 飞行可途经被占格继续扩展，但被占格不可作为落点
    if (getUnitAt(units, pos) === undefined) {
      result.add(key);
    }
  }
  result.add(hexKey(origin));  // 起点恒可原地待命
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
