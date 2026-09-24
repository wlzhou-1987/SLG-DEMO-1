import { spriteCache, type LoadedImage } from './sprite-cache';

/** 单帧特效闪现时长（§7.4：约一格宽快速淡出，实现期可调） */
export const FX_DURATION_MS = 420;
const POP_END = 0.6;      // 出生放大段终点（此后保持峰值）
const FADE_START = 0.55;  // 淡出起点

const BASE_SCALE = 0.75;
const PEAK_SCALE = 1.2;

export interface FxView {
  path: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

interface FxItem {
  path: string;
  worldX: number;
  worldY: number;
  bornMs: number;
}

/**
 * 战场单帧特效（R16-2，§7.4）：世界坐标锚定、出生放大 + 末段淡出；
 * 图片未就绪/加载失败不画（缺失 = 不播，区别于图标的文字回落）。
 */
export class FxSystem {
  private items: FxItem[] = [];

  constructor(private cache: Pick<typeof spriteCache, 'get'> = spriteCache) {}

  spawn(path: string, worldX: number, worldY: number, bornMs: number): void {
    this.items.push({ path, worldX, worldY, bornMs });
  }

  active(now: number): boolean {
    return this.items.some(i => now < i.bornMs + FX_DURATION_MS);
  }

  visible(now: number): FxView[] {
    const views: FxView[] = [];
    for (const i of this.items) {
      const elapsed = now - i.bornMs;
      if (elapsed < 0 || elapsed >= FX_DURATION_MS) continue;
      const p = elapsed / FX_DURATION_MS;
      const pop = Math.min(1, p / POP_END);
      const scale = BASE_SCALE + (PEAK_SCALE - BASE_SCALE) * (1 - (1 - pop) * (1 - pop));
      const alpha = p < FADE_START ? 1 : 1 - (p - FADE_START) / (1 - FADE_START);
      views.push({ path: i.path, x: i.worldX, y: i.worldY, scale, alpha });
    }
    return views;
  }

  prune(now: number): void {
    this.items = this.items.filter(i => now < i.bornMs + FX_DURATION_MS);
  }

  /** 世界系绘制（变换由调用方 applyView 设置），基准尺寸 = 一格宽（hex 外接宽 √3×hexSize） */
  draw(ctx: CanvasRenderingContext2D, hexSize: number, now: number): void {
    for (const v of this.visible(now)) {
      const img: LoadedImage | null = this.cache.get(v.path);
      if (!img) continue;
      const w = hexSize * Math.sqrt(3) * v.scale;
      ctx.globalAlpha = v.alpha;
      ctx.drawImage(img as CanvasImageSource, v.x - w / 2, v.y - w / 2, w, w);
    }
    ctx.globalAlpha = 1;
  }
}
