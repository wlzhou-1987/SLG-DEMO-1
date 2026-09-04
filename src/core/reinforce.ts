import type { MapState } from './map';
import { isPassable } from './map';
import type { UnitState } from './unit';
import { createUnitState } from './unit';
import { neighbor, hexKey } from './hex';
import type { HexCoord, Facing } from './types';
import { REINFORCEMENTS } from '../config/reinforcements';
import type { ReinforcementEvent } from '../config/reinforcements';

/**
 * 敌方阶段开始检查增援事件（§6）：满足触发且未超过次数 → 刷新登场。
 * 返回本阶段登场单位；fired 计数就地更新。
 */
export function checkReinforcements(
  map: MapState,
  turn: number,
  units: UnitState[],
  fired: Map<string, number>
): UnitState[] {
  const spawned: UnitState[] = [];
  // 同批登场的单位互占位置，回退搜索须计入
  const occupied = new Set(units.map(u => hexKey(u.position)));

  for (const event of REINFORCEMENTS) {
    if ((fired.get(event.id) ?? 0) >= (event.times ?? 1)) continue;
    if (!triggerMet(event, turn, units)) continue;
    fired.set(event.id, (fired.get(event.id) ?? 0) + 1);

    for (const spec of event.units) {
      const pos = findFreeSpot(map, occupied, spec.point);
      if (!pos) continue;
      occupied.add(hexKey(pos));
      const u = createUnitState(spec.templateId, 'enemy', pos);
      u.groupId = event.groupId;
      u.aiKind = 'aggressive';  // 登场即激活（§6）
      spawned.push(u);
    }
  }
  return spawned;
}

function triggerMet(event: ReinforcementEvent, turn: number, units: UnitState[]): boolean {
  const t = event.trigger;
  if (t.kind === 'turn') return turn >= t.turn;
  // groupHpBelow：组内存活成员 HP% 严格低于阈值；组全灭不触发
  return units
    .filter(u => u.groupId === t.groupId && u.hp > 0)
    .some(u => u.hp / u.maxHp < t.percent);
}

/** 刷新点被占或不可通行 → BFS 找最近可通行空格 */
function findFreeSpot(
  map: MapState,
  occupied: Set<string>,
  point: HexCoord
): HexCoord | null {
  const free = (pos: HexCoord): boolean =>
    isPassable(map, pos, false) && !occupied.has(hexKey(pos));

  if (free(point)) return point;
  const visited = new Set([hexKey(point)]);
  const queue: HexCoord[] = [point];
  while (queue.length > 0) {
    const pos = queue.shift()!;
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(pos, dir as Facing);
      const key = hexKey(n);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!isPassable(map, n, false)) continue;
      if (free(n)) return n;
      queue.push(n);
    }
  }
  return null;
}
