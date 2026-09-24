import { describe, it, expect } from 'vitest';
import { FxSystem, FX_DURATION_MS } from '../../src/render/fx';

/** 记录型 ctx 桩：只记 drawImage 调用 */
class FakeCtx {
  draws: Array<{ img: unknown; x: number; y: number; w: number; h: number }> = [];
  globalAlpha = 1;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void {
    this.draws.push({ img, x, y, w, h });
  }
}

const fakeImg = { complete: true, naturalWidth: 512, src: 'art/fx/fx-slash.png' };

describe('R16-2 FxSystem 单帧闪现状态机（§7.4）', () => {
  it('出生段放大/淡出段透明/过期清除，延时未出生计入 active', () => {
    const fx = new FxSystem({ get: () => null });
    fx.spawn('art/fx/fx-slash.png', 100, 200, 1000);
    expect(fx.active(1000)).toBe(true);

    const at = (p: number) => fx.visible(1000 + p * FX_DURATION_MS)[0];
    expect(at(0).scale).toBeCloseTo(0.75, 5);       // 出生最小
    expect(at(0).alpha).toBe(1);
    expect(at(0.5).alpha).toBe(1);                  // 淡出起点 0.55 之前
    expect(at(0.6).scale).toBeCloseTo(1.2, 5);      // 弹出峰值后保持
    expect(at(0.775).alpha).toBeCloseTo(0.5, 5);    // 淡出段中点
    expect(fx.visible(1000 + FX_DURATION_MS)).toHaveLength(0);   // 过期

    fx.prune(1000 + FX_DURATION_MS);
    expect(fx.active(1000 + FX_DURATION_MS)).toBe(false);

    fx.spawn('art/fx/fx-crit.png', 0, 0, 2000);     // 延时未出生
    expect(fx.visible(1500)).toHaveLength(0);
    expect(fx.active(1500)).toBe(true);
  });

  it('未就绪图片不画（缺失=不播），就绪居中绘制约一格宽', () => {
    const lazy = new FxSystem({ get: () => null });
    lazy.spawn('art/fx/fx-slash.png', 100, 200, 1000);
    const ctx1 = new FakeCtx();
    lazy.draw(ctx1 as unknown as CanvasRenderingContext2D, 30, 1000 + 0.6 * FX_DURATION_MS);
    expect(ctx1.draws).toHaveLength(0);

    const ready = new FxSystem({ get: () => fakeImg });
    ready.spawn('art/fx/fx-slash.png', 100, 200, 1000);
    const ctx2 = new FakeCtx();
    ready.draw(ctx2 as unknown as CanvasRenderingContext2D, 30, 1000 + 0.6 * FX_DURATION_MS);
    expect(ctx2.draws).toHaveLength(1);
    const d = ctx2.draws[0];
    expect(d.img).toBe(fakeImg);
    const w = 30 * Math.sqrt(3) * 1.2;              // 一格宽 × 峰值缩放 1.2
    expect(d.x).toBeCloseTo(100 - w / 2, 5);
    expect(d.y).toBeCloseTo(200 - w / 2, 5);
    expect(d.w).toBeCloseTo(w, 5);
  });
});
