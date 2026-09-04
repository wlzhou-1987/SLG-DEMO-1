import type { HexCoord, Facing, PixelCoord } from './types';

// 尖顶六边形：6 个方向（顺时针从东）
const DIRECTIONS: readonly HexCoord[] = [
  { q: +1, r:  0 }, // 0: 东 E
  { q: +1, r: -1 }, // 1: 东北 NE
  { q:  0, r: -1 }, // 2: 西北 NW
  { q: -1, r:  0 }, // 3: 西 W
  { q: -1, r: +1 }, // 4: 西南 SW
  { q:  0, r: +1 }, // 5: 东南 SE
];

/** 获取指定方向的邻居坐标 */
export function neighbor(coord: HexCoord, direction: Facing): HexCoord {
  const d = DIRECTIONS[direction];
  return { q: coord.q + d.q, r: coord.r + d.r };
}

/** 六边形距离（曼哈顿距离在轴坐标下的等价） */
export function distance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 获取范围内所有格子（含中心） */
export function inRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    const rMin = Math.max(-range, -dq - range);
    const rMax = Math.min(range, -dq + range);
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

/** 获取指定半径的环（不含中心） */
export function ring(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [{ ...center }];
  const results: HexCoord[] = [];
  // 从东侧角点出发，逆时针绕行
  let hex: HexCoord = { q: center.q + radius, r: center.r };
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ ...hex });
      hex = neighbor(hex, ((side + 2) % 6) as Facing);
    }
  }
  return results;
}

/** 轴坐标转像素（尖顶六边形） */
export function axialToPixel(coord: HexCoord, size: number): PixelCoord {
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = size * 1.5 * coord.r;
  return { x, y };
}

/** 像素转轴坐标（尖顶六边形，返回浮点，需 round） */
export function pixelToAxialRaw(x: number, y: number, size: number): HexCoord {
  const q = (Math.sqrt(3) / 3 * x - y / 3) / size;
  const r = (2 / 3 * y) / size;
  return { q, r };
}

/** 浮点轴坐标四舍五入到最近格子 */
export function axialRound(frac: HexCoord): HexCoord {
  const s = -frac.q - frac.r;
  let rq = Math.round(frac.q);
  let rr = Math.round(frac.r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - frac.q);
  const dr = Math.abs(rr - frac.r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

/** 像素坐标转最近格子 */
export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  return axialRound(pixelToAxialRaw(x, y, size));
}

/** 获取尖顶六边形的 6 个角点（屏幕坐标，y 向下） */
export function hexCorners(cx: number, cy: number, size: number): PixelCoord[] {
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (i * Math.PI) / 3; // 30° + 60°*i
    corners.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }
  return corners;
}

/** 坐标转字符串键（用于 Map/Set） */
export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

/** 检查坐标是否在地图范围内（宽 width 列，高 height 行） */
export function isValidHex(coord: HexCoord, width: number, height: number): boolean {
  // 轴坐标下，q 范围 [0, width-1]，r 范围 [0, height-1]
  return coord.q >= 0 && coord.q < width && coord.r >= 0 && coord.r < height;
}

/** 朝向转角度（屏幕坐标，y 向下，顺时针从东） */
export function facingToAngle(facing: Facing): number {
  // 方向顺序：E, NE, NW, W, SW, SE
  // 屏幕角度：0°, 300°, 240°, 180°, 120°, 60°
  const angles = [0, 300, 240, 180, 120, 60];
  return angles[facing];
}

/** 获取所有 6 个方向 */
export function allDirections(): readonly HexCoord[] {
  return DIRECTIONS;
}
