import type { Camera } from './camera';

export const FLOAT_DURATION_MS = 900;
const RISE_PX = 28;
const FADE_START = 0.7;

export const FLOAT_COLOR = {
  damage: '#ef4444',
  heal: '#4ade80',
  miss: '#9ca3af',
  shield: '#ffd75e'
} as const;

export interface FloatTextView {
  text: string;
  color: string;
  x: number;
  y: number;
  alpha: number;
}

interface FloatTextItem {
  text: string;
  color: string;
  worldX: number;
  worldY: number;
  bornMs: number;
  durationMs: number;
}

/** 战场飘字：世界坐标锚定的纯状态机，随镜头平移缩放 */
export class EffectSystem {
  private items: FloatTextItem[] = [];

  spawn(text: string, color: string, worldX: number, worldY: number, bornMs: number, durationMs: number = FLOAT_DURATION_MS): void {
    this.items.push({ text, color, worldX, worldY, bornMs, durationMs });
  }

  /** 是否还有未过期飘字（含延时未出生，用于驱动渲染循环） */
  active(now: number): boolean {
    return this.items.some(i => now < i.bornMs + i.durationMs);
  }

  /** 当前可见飘字（世界坐标 + 上升/淡出进度） */
  visible(now: number): FloatTextView[] {
    const views: FloatTextView[] = [];
    for (const i of this.items) {
      const elapsed = now - i.bornMs;
      if (elapsed < 0 || elapsed >= i.durationMs) continue;
      const p = elapsed / i.durationMs;
      const rise = 1 - (1 - p) * (1 - p);  // ease-out 减速上升
      const alpha = p < FADE_START ? 1 : 1 - (p - FADE_START) / (1 - FADE_START);
      views.push({ text: i.text, color: i.color, x: i.worldX, y: i.worldY - RISE_PX * rise, alpha });
    }
    return views;
  }

  prune(now: number): void {
    this.items = this.items.filter(i => now < i.bornMs + i.durationMs);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, now: number): void {
    for (const v of this.visible(now)) {
      const screen = camera.worldToScreen({ x: v.x, y: v.y });
      ctx.globalAlpha = v.alpha;
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(v.text, screen.x, screen.y);
      ctx.fillStyle = v.color;
      ctx.fillText(v.text, screen.x, screen.y);
    }
    ctx.globalAlpha = 1;
  }
}
