import type { TerrainType } from '../core/types';

/** 地形矢量图案（R9-1 定稿：一地形一绘制函数，图案色为渲染模块常量；调用前地形色块已画好） */
export type TerrainPattern = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void;

/** 平原：3 处草簇短须 */
function patternPlain(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.strokeStyle = '#5b7a63';
  ctx.lineWidth = s * 0.06;
  ctx.lineCap = 'round';
  const tufts = [[-0.30, -0.12], [0.24, 0.22], [0.10, -0.30]] as const;
  for (const [tx, ty] of tufts) {
    const bx = cx + tx * s, by = cy + ty * s, h = s * 0.20;
    ctx.beginPath();
    ctx.moveTo(bx - h * 0.5, by); ctx.lineTo(bx - h * 0.45, by - h * 0.8);
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - h);
    ctx.moveTo(bx + h * 0.5, by); ctx.lineTo(bx + h * 0.45, by - h * 0.8);
    ctx.stroke();
  }
}

/** 森林：两棵树（暗干 + 亮圆冠） */
function patternForest(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const trees = [[-0.20, 0.16, 1.0], [0.22, -0.10, 0.82]] as const;
  for (const [tx, ty, sc] of trees) {
    const x = cx + tx * s, y = cy + ty * s, r = s * 0.30 * sc;
    ctx.fillStyle = '#223528';
    ctx.fillRect(x - r * 0.12, y - r * 0.2, r * 0.24, r * 0.9);
    ctx.fillStyle = '#40634c';
    ctx.beginPath(); ctx.arc(x, y - r * 0.55, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.55, y - r * 0.25, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.55, y - r * 0.25, r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
}

/** 山：双峰折线（暗面 + 亮面 + 小雪线） */
function patternMountain(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const x = cx, y = cy + s * 0.18;
  ctx.fillStyle = '#57544d';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.62, y); ctx.lineTo(x - s * 0.06, y - s * 0.72); ctx.lineTo(x + s * 0.34, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a857a';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.06, y - s * 0.72); ctx.lineTo(x + s * 0.34, y); ctx.lineTo(x + s * 0.66, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b9b4a6';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.06, y - s * 0.72); ctx.lineTo(x + s * 0.06, y - s * 0.55);
  ctx.lineTo(x - s * 0.14, y - s * 0.48); ctx.lineTo(x - s * 0.10, y - s * 0.62);
  ctx.closePath(); ctx.fill();
}

/** 基地：垛口墙 + 拱门（全图仅一格，图案画满格） */
function patternBase(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const w = s * 1.05, h = s * 0.72, x = cx - w / 2, y = cy - h * 0.30;
  ctx.fillStyle = '#9c8858';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + s * 0.14);
  ctx.lineTo(x + w * 0.12, y + s * 0.14); ctx.lineTo(x + w * 0.12, y); ctx.lineTo(x + w * 0.24, y); ctx.lineTo(x + w * 0.24, y + s * 0.14);
  ctx.lineTo(x + w * 0.38, y + s * 0.14); ctx.lineTo(x + w * 0.38, y); ctx.lineTo(x + w * 0.50, y); ctx.lineTo(x + w * 0.50, y + s * 0.14);
  ctx.lineTo(x + w * 0.62, y + s * 0.14); ctx.lineTo(x + w * 0.62, y); ctx.lineTo(x + w * 0.74, y); ctx.lineTo(x + w * 0.74, y + s * 0.14);
  ctx.lineTo(x + w * 0.76, y + s * 0.14); ctx.lineTo(x + w, y + s * 0.14); ctx.lineTo(x + w, y + h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a3122';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, y + h);
  ctx.lineTo(cx - s * 0.18, y + h * 0.45);
  ctx.arc(cx, y + h * 0.45, s * 0.18, Math.PI, 0);
  ctx.lineTo(cx + s * 0.18, y + h);
  ctx.closePath(); ctx.fill();
}

export const TERRAIN_PATTERNS: Record<TerrainType, TerrainPattern> = {
  plain: patternPlain,
  forest: patternForest,
  mountain: patternMountain,
  base: patternBase,
};
