import type { HexCoord, Faction, Facing } from './types';
import { neighbor } from './hex';
import type { EffectArea } from '../config/skills';
import type { UnitState } from './unit';

/**
 * 效果区域解算（§4.9）：
 * - disc：以释放中心格为圆心的六边形圆盘（半径 N）
 * - sector：施法者正面三格扇形（朝向格 + 左右紧邻，半径 1，朝向取施法者朝向）
 */
export function getAreaCells(
  area: EffectArea,
  caster: { position: HexCoord; facing: number },
  center: HexCoord
): HexCoord[] {
  if (area.shape === 'disc') {
    const cells: HexCoord[] = [];
    for (let dq = -area.radius; dq <= area.radius; dq++) {
      for (let dr = Math.max(-area.radius, -dq - area.radius); dr <= Math.min(area.radius, -dq + area.radius); dr++) {
        cells.push({ q: center.q + dq, r: center.r + dr });
      }
    }
    return cells;
  }
  const f = caster.facing as Facing;
  return [
    neighbor(caster.position, f),
    neighbor(caster.position, ((f + 1) % 6) as Facing),
    neighbor(caster.position, ((f + 5) % 6) as Facing)
  ];
}

/** AoE 受影响者 = 区域内存活单位且属目标阵营（只影响目标阵营，§4.9） */
export function unitsInArea(
  units: UnitState[],
  cells: HexCoord[],
  casterFaction: Faction
): UnitState[] {
  const keys = new Set(cells.map(c => `${c.q},${c.r}`));
  return units.filter(u =>
    u.hp > 0 && u.faction !== casterFaction && keys.has(`${u.position.q},${u.position.r}`)
  );
}
