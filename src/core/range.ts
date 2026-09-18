import type { HexCoord } from './types';
import type { MapState } from './map';
import type { UnitState } from './unit';
import { getMoveCost, isPassable } from './map';
import { neighbor, hexKey, distance } from './hex';
import { getUnitAt } from './unit';
import type { Facing } from './types';
import { hasUnitTrait } from './unit';

/** 封锁判定（§4.7 移动阻碍）：姿态激活 + fortify 被动的单位，其相邻格敌方不可途经（仅可逐格挪入作终点） */
export function isBlockaded(
  units: UnitState[],
  pos: HexCoord,
  moverFaction: 'player' | 'enemy' | undefined
): boolean {
  return units.some(u =>
    u.hp > 0 &&
    u.faction !== moverFaction &&
    u.statuses.some(s => s.type === 'stance') &&
    hasUnitTrait(u, 'fortify') &&
    distance(u.position, pos) === 1
  );
}

/** 移动代价表：起点到各可达格的最小消耗（飞行途经被占格亦计入，供已消耗移动力计算）；封锁邻格仅可作终点不扩展 */
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
    // R3-9：封锁邻格不继续扩展（途经禁止；该格已入 cost 表仍可作终点）
    const mover = units.find(u => hexKey(u.position) === originKey);
    if (currentKey !== originKey && mover && isBlockaded(units, current.pos, mover.faction)) continue;

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

/** 路径重建（R9-2 移动动效）：从代价表反向回溯 origin→dest 途经格序列（含起终点），不可达返回 null */
export function rebuildPath(
  map: MapState,
  units: UnitState[],
  origin: HexCoord,
  dest: HexCoord,
  movePoints: number,
  flying: boolean
): HexCoord[] | null {
  const cost = calcMovementCosts(map, units, origin, movePoints, flying);
  const originKey = hexKey(origin);
  if (!cost.has(hexKey(dest))) return null;

  const mover = units.find(u => hexKey(u.position) === originKey);
  const path: HexCoord[] = [{ ...dest }];
  let cur = dest;
  while (hexKey(cur) !== originKey) {
    const curCost = cost.get(hexKey(cur))!;
    let stepped = false;
    for (let dir = 0; dir < 6 && !stepped; dir++) {
      const prev = neighbor(cur, dir as Facing);
      const prevKey = hexKey(prev);
      const prevCost = cost.get(prevKey);
      if (prevCost === undefined) continue;
      // 封锁格仅可作终点：可作中途 prev 的格必须可继续扩展（prev=起点除外）
      if (prevKey !== originKey && mover && isBlockaded(units, prev, mover.faction)) continue;
      if (prevCost + getMoveCost(map, cur, flying) !== curCost) continue;
      path.unshift(prev);
      cur = prev;
      stepped = true;
    }
    if (!stepped) return null;
  }
  return path;
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
