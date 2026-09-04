import { describe, it, expect } from 'vitest';
import { EffectSystem, FLOAT_DURATION_MS } from '../../src/render/effects';

describe('M6-1 飘字效果系统', () => {
  it('延时未到不可见，但系统仍活跃', () => {
    const fx = new EffectSystem();
    fx.spawn('-7', '#ef4444', 100, 200, 300);  // 300ms 后出生
    expect(fx.visible(100)).toHaveLength(0);
    expect(fx.active(100)).toBe(true);
  });

  it('期内可见：从锚点上升且不透明', () => {
    const fx = new EffectSystem();
    fx.spawn('-7', '#ef4444', 100, 200, 0);
    const start = fx.visible(0)[0];
    expect(start.y).toBe(200);
    const mid = fx.visible(FLOAT_DURATION_MS / 2)[0];
    expect(mid.y).toBeLessThan(200);
    expect(mid.alpha).toBe(1);
  });

  it('过期后不可见且不再活跃，prune 移除', () => {
    const fx = new EffectSystem();
    fx.spawn('-7', '#ef4444', 100, 200, 0);
    const end = 0 + FLOAT_DURATION_MS;
    expect(fx.visible(end)).toHaveLength(0);
    expect(fx.active(end)).toBe(false);
    fx.prune(end);
    expect(fx.active(end)).toBe(false);
  });

  it('末段淡出：alpha 随进度衰减', () => {
    const fx = new EffectSystem();
    fx.spawn('-7', '#ef4444', 100, 200, 0);
    const late = fx.visible(FLOAT_DURATION_MS * 0.9)[0];
    expect(late.alpha).toBeLessThan(1);
    expect(late.alpha).toBeGreaterThan(0);
  });

  it('多条飘字互不干扰，prune 只移除过期的', () => {
    const fx = new EffectSystem();
    fx.spawn('-3', '#ef4444', 0, 0, 0);
    fx.spawn('+5', '#4ade80', 10, 10, 500);
    fx.prune(FLOAT_DURATION_MS + 1);
    const rest = fx.visible(FLOAT_DURATION_MS + 1);
    expect(rest).toHaveLength(1);
    expect(rest[0].text).toBe('+5');
  });
});
