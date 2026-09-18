/**
 * 兵种矢量剪影（R9-1 定稿：底座圆盘 = 阵营色环 + 深盘心 + 浅色剪影，侧视面朝右）。
 * 形状函数不设颜色，fillStyle/strokeStyle 由调用方预设。
 * 视觉基准：docs/prototypes/r9-visual.html
 */
export type SilhouetteFn = (ctx: CanvasRenderingContext2D, u: number) => void;

function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number): void {
  ctx.lineWidth = w; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** 人形基件：u = 剪影整体高度尺度，原点在剪影中心，y 向下 */
function sTorso(ctx: CanvasRenderingContext2D, u: number): void {
  poly(ctx, [[-0.13 * u, -0.20 * u], [0.15 * u, -0.20 * u], [0.10 * u, 0.10 * u], [-0.09 * u, 0.10 * u]]);
}
function sHead(ctx: CanvasRenderingContext2D, u: number, hx = 0.05, hy = -0.31, r = 0.10): void {
  circ(ctx, hx * u, hy * u, r * u);
}
function sLegs(ctx: CanvasRenderingContext2D, u: number): void {
  poly(ctx, [[-0.11 * u, 0.10 * u], [-0.01 * u, 0.10 * u], [-0.03 * u, 0.42 * u], [-0.13 * u, 0.42 * u]]);
  poly(ctx, [[0.03 * u, 0.10 * u], [0.12 * u, 0.10 * u], [0.14 * u, 0.42 * u], [0.05 * u, 0.42 * u]]);
}
function sBlade(ctx: CanvasRenderingContext2D, u: number, bx: number, by: number, tx: number, ty: number, w = 0.055): void {
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  poly(ctx, [
    [bx * u + nx * w * u, by * u + ny * w * u], [tx * u + nx * w * 0.55 * u, ty * u + ny * w * 0.55 * u],
    [tx * u - nx * w * 0.55 * u, ty * u - ny * w * 0.55 * u], [bx * u - nx * w * u, by * u - ny * w * u],
  ]);
}
function sHorse(ctx: CanvasRenderingContext2D, u: number): void {
  ell(ctx, 0, 0.06 * u, 0.30 * u, 0.145 * u);
  poly(ctx, [[0.20 * u, 0.02 * u], [0.40 * u, -0.18 * u], [0.50 * u, -0.12 * u], [0.42 * u, 0.02 * u], [0.28 * u, 0.08 * u]]);
  poly(ctx, [[0.38 * u, -0.20 * u], [0.42 * u, -0.27 * u], [0.45 * u, -0.18 * u]]);
  poly(ctx, [[0.14 * u, 0.14 * u], [0.22 * u, 0.14 * u], [0.23 * u, 0.44 * u], [0.16 * u, 0.44 * u]]);
  poly(ctx, [[0.06 * u, 0.14 * u], [0.13 * u, 0.14 * u], [0.12 * u, 0.44 * u], [0.05 * u, 0.44 * u]]);
  poly(ctx, [[-0.24 * u, 0.12 * u], [-0.16 * u, 0.12 * u], [-0.15 * u, 0.44 * u], [-0.23 * u, 0.44 * u]]);
  poly(ctx, [[-0.15 * u, 0.12 * u], [-0.08 * u, 0.12 * u], [-0.06 * u, 0.44 * u], [-0.14 * u, 0.44 * u]]);
  poly(ctx, [[-0.29 * u, -0.02 * u], [-0.42 * u, 0.12 * u], [-0.33 * u, 0.16 * u], [-0.26 * u, 0.05 * u]]);
}
function sRider(ctx: CanvasRenderingContext2D, u: number, arm?: readonly [number, number]): void {
  poly(ctx, [[-0.14 * u, -0.16 * u], [0.12 * u, -0.16 * u], [0.08 * u, 0.06 * u], [-0.10 * u, 0.06 * u]]);
  circ(ctx, 0.02 * u, -0.26 * u, 0.085 * u);
  if (arm) seg(ctx, 0.06 * u, -0.12 * u, arm[0] * u, arm[1] * u, 0.07 * u);
}

export const SILHOUETTE_SHAPES: Readonly<Record<string, SilhouetteFn>> = {
  // 领主：举剑 + 三尖冠 + 披风
  lord(ctx, u) {
    poly(ctx, [[-0.13 * u, -0.19 * u], [-0.30 * u, -0.02 * u], [-0.22 * u, 0.30 * u], [-0.10 * u, 0.10 * u]]);
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    poly(ctx, [[-0.02 * u, -0.40 * u], [0.01 * u, -0.48 * u], [0.04 * u, -0.40 * u], [0.07 * u, -0.50 * u], [0.10 * u, -0.40 * u], [0.12 * u, -0.44 * u], [0.12 * u, -0.37 * u], [-0.02 * u, -0.36 * u]]);
    seg(ctx, 0.10 * u, -0.10 * u, 0.24 * u, -0.22 * u, 0.08 * u);
    sBlade(ctx, u, 0.24, -0.22, 0.40, -0.56);
    seg(ctx, 0.20 * u, -0.28 * u, 0.31 * u, -0.19 * u, 0.05 * u);
  },
  // 防战：鸢盾 + 短剑
  defender(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u, -0.02);
    poly(ctx, [[0.16 * u, -0.24 * u], [0.34 * u, -0.17 * u], [0.32 * u, 0.04 * u], [0.23 * u, 0.24 * u], [0.14 * u, 0.02 * u]]);
    seg(ctx, -0.10 * u, -0.02 * u, 0.10 * u, 0.14 * u, 0.07 * u);
    sBlade(ctx, u, 0.10, 0.14, 0.26, 0.32);
  },
  // 防骑：骑乘 + 鸢盾
  paladin(ctx, u) {
    sHorse(ctx, u);
    sRider(ctx, u * 0.92);
    poly(ctx, [[0.10 * u, -0.30 * u], [0.28 * u, -0.24 * u], [0.26 * u, -0.04 * u], [0.18 * u, 0.10 * u], [0.09 * u, -0.08 * u]]);
  },
  // 盗贼：尖兜帽 + 双匕首
  thief(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u);
    poly(ctx, [[-0.04 * u, -0.40 * u], [0.10 * u, -0.30 * u], [0.08 * u, -0.22 * u], [-0.06 * u, -0.22 * u]]);
    poly(ctx, [[-0.05 * u, -0.22 * u], [0.09 * u, -0.22 * u], [0.07 * u, -0.14 * u], [-0.04 * u, -0.14 * u]]);
    seg(ctx, 0.10 * u, -0.12 * u, 0.30 * u, -0.22 * u, 0.06 * u);
    sBlade(ctx, u, 0.30, -0.22, 0.44, -0.28, 0.035);
    seg(ctx, 0.08 * u, 0.02 * u, 0.28 * u, 0.10 * u, 0.06 * u);
    sBlade(ctx, u, 0.28, 0.10, 0.42, 0.16, 0.035);
  },
  // 骑士：骑乘 + 平端长枪
  knight(ctx, u) {
    sHorse(ctx, u);
    sRider(ctx, u * 0.92, [0.34, -0.10]);
    seg(ctx, -0.06 * u, -0.10 * u, 0.56 * u, 0.02 * u, 0.045 * u);
    poly(ctx, [[0.56 * u, 0.02 * u], [0.66 * u, -0.015 * u], [0.66 * u, 0.055 * u]]);
  },
  // 飞马：上扬双翼 + 马体
  pegasus(ctx, u) {
    poly(ctx, [[-0.08 * u, -0.02 * u], [-0.50 * u, -0.40 * u], [-0.32 * u, -0.06 * u], [-0.10 * u, 0.06 * u]]);
    poly(ctx, [[-0.02 * u, -0.08 * u], [-0.34 * u, -0.48 * u], [-0.14 * u, -0.12 * u], [-0.02 * u, -0.02 * u]]);
    sHorse(ctx, u);
  },
  // 斧兵：双手举斧
  axeman(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    seg(ctx, 0.12 * u, 0.10 * u, 0.30 * u, -0.44 * u, 0.05 * u);
    poly(ctx, [[0.26 * u, -0.46 * u], [0.50 * u, -0.36 * u], [0.44 * u, -0.16 * u], [0.24 * u, -0.26 * u]]);
    seg(ctx, 0.10 * u, -0.12 * u, 0.24 * u, -0.30 * u, 0.07 * u);
  },
  // 弓箭手：持弓搭箭
  archer(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    ctx.lineWidth = 0.05 * u;
    ctx.beginPath(); ctx.arc(0.26 * u, -0.04 * u, 0.26 * u, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
    const bw = 0.26 * u * Math.sin(Math.PI * 0.42);
    seg(ctx, 0.26 * u, -0.04 * u - bw, 0.26 * u, -0.04 * u + bw, 0.025 * u);
    seg(ctx, 0.02 * u, -0.04 * u, 0.34 * u, -0.04 * u, 0.035 * u);
    poly(ctx, [[0.34 * u, -0.04 * u], [0.41 * u, -0.07 * u], [0.41 * u, -0.01 * u]]);
    seg(ctx, 0.10 * u, -0.14 * u, 0.24 * u, -0.06 * u, 0.07 * u);
  },
  // 牧师：长袍 + 顶圆法杖
  priest(ctx, u) {
    poly(ctx, [[-0.13 * u, -0.20 * u], [0.15 * u, -0.20 * u], [0.22 * u, 0.44 * u], [-0.18 * u, 0.44 * u]]);
    sHead(ctx, u);
    seg(ctx, 0.28 * u, 0.30 * u, 0.20 * u, -0.46 * u, 0.045 * u);
    circ(ctx, 0.20 * u, -0.52 * u, 0.06 * u);
    seg(ctx, 0.10 * u, -0.14 * u, 0.24 * u, -0.36 * u, 0.07 * u);
  },
  // 法师：尖帽 + 长袍 + 法珠杖
  mage(ctx, u) {
    poly(ctx, [[-0.13 * u, -0.22 * u], [0.15 * u, -0.22 * u], [0.22 * u, 0.44 * u], [-0.18 * u, 0.44 * u]]);
    poly(ctx, [[-0.16 * u, -0.24 * u], [0.18 * u, -0.24 * u], [0.12 * u, -0.28 * u], [-0.10 * u, -0.28 * u]]);
    poly(ctx, [[-0.06 * u, -0.28 * u], [0.06 * u, -0.54 * u], [0.10 * u, -0.28 * u]]);
    seg(ctx, 0.28 * u, 0.30 * u, 0.22 * u, -0.34 * u, 0.045 * u);
    circ(ctx, 0.22 * u, -0.42 * u, 0.08 * u);
    seg(ctx, 0.10 * u, -0.16 * u, 0.24 * u, -0.26 * u, 0.07 * u);
  },
  // 剑士：斜下持剑
  swordsman(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    seg(ctx, 0.10 * u, -0.10 * u, 0.20 * u, -0.02 * u, 0.07 * u);
    sBlade(ctx, u, 0.20, -0.02, 0.40, 0.26);
    seg(ctx, 0.16 * u, 0.06 * u, 0.28 * u, -0.06 * u, 0.045 * u);
  },
  // 枪兵：前竖长枪
  spearman(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    seg(ctx, 0.26 * u, 0.36 * u, 0.18 * u, -0.40 * u, 0.045 * u);
    poly(ctx, [[0.18 * u, -0.40 * u], [0.22 * u, -0.56 * u], [0.26 * u, -0.38 * u]]);
    seg(ctx, 0.10 * u, -0.14 * u, 0.24 * u, -0.28 * u, 0.07 * u);
  },
  // 锤兵：举战锤
  hammerman(ctx, u) {
    sTorso(ctx, u); sLegs(ctx, u); sHead(ctx, u);
    seg(ctx, 0.12 * u, 0.10 * u, 0.26 * u, -0.34 * u, 0.05 * u);
    poly(ctx, [[0.12 * u, -0.34 * u], [0.40 * u, -0.34 * u], [0.40 * u, -0.52 * u], [0.12 * u, -0.52 * u]]);
    seg(ctx, 0.10 * u, -0.12 * u, 0.22 * u, -0.30 * u, 0.07 * u);
  },
  // BOSS：角盔巨躯 + 巨斧（独占形，渲染层据此画金环双圈）
  boss(ctx, u) {
    poly(ctx, [[-0.16 * u, -0.19 * u], [-0.34 * u, -0.04 * u], [-0.25 * u, 0.34 * u], [-0.12 * u, 0.12 * u]]);
    poly(ctx, [[-0.15 * u, -0.24 * u], [0.18 * u, -0.24 * u], [0.12 * u, 0.14 * u], [-0.11 * u, 0.14 * u]]);
    poly(ctx, [[-0.13 * u, 0.14 * u], [-0.01 * u, 0.14 * u], [-0.03 * u, 0.46 * u], [-0.15 * u, 0.46 * u]]);
    poly(ctx, [[0.04 * u, 0.14 * u], [0.14 * u, 0.14 * u], [0.16 * u, 0.46 * u], [0.06 * u, 0.46 * u]]);
    circ(ctx, 0.04 * u, -0.34 * u, 0.105 * u);
    poly(ctx, [[-0.05 * u, -0.40 * u], [-0.14 * u, -0.56 * u], [-0.02 * u, -0.44 * u]]);
    poly(ctx, [[0.12 * u, -0.42 * u], [0.22 * u, -0.58 * u], [0.18 * u, -0.40 * u]]);
    seg(ctx, 0.14 * u, 0.12 * u, 0.36 * u, -0.50 * u, 0.055 * u);
    poly(ctx, [[0.31 * u, -0.53 * u], [0.60 * u, -0.40 * u], [0.53 * u, -0.16 * u], [0.29 * u, -0.30 * u]]);
    seg(ctx, 0.12 * u, -0.14 * u, 0.30 * u, -0.36 * u, 0.08 * u);
  },
};

/** BOSS 独占形状 id（渲染层据此附加金环双圈） */
export const BOSS_SHAPE = 'boss';

/** 未知模板的回退形状 */
export const SILHOUETTE_FALLBACK = 'swordsman';

/** 模板 → 形状映射（敌我斧兵/弓手/法师共用同形，阵营由色环区分；R9-1 定稿） */
export const SILHOUETTE_MAP: Readonly<Record<string, string>> = {
  lord: 'lord',
  defender: 'defender',
  paladin: 'paladin',
  thief: 'thief',
  knight: 'knight',
  pegasus: 'pegasus',
  axeman: 'axeman',
  archer: 'archer',
  priest: 'priest',
  mage: 'mage',
  swordsman: 'swordsman',
  spearman: 'spearman',
  axeman_enemy: 'axeman',
  hammerman: 'hammerman',
  archer_enemy: 'archer',
  mage_enemy: 'mage',
  boss: BOSS_SHAPE,
};

export const SHAPE_IDS: readonly string[] = Object.keys(SILHOUETTE_SHAPES);

export function getShapeId(templateId: string): string {
  return SILHOUETTE_MAP[templateId] ?? SILHOUETTE_FALLBACK;
}
