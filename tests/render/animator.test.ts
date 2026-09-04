import { describe, it, expect } from 'vitest';
import { Animator } from '../../src/render/animator';

describe('M6-2 动画器：移动滑行', () => {
  it('起始偏移 = 终点指向出发点，结束后清除', () => {
    const a = new Animator();
    a.startMove('u1', 100, 200, 160, 220, 0, 240);
    // 单位逻辑位置已是终点 (160,220)：视觉应停在出发点 → 偏移 = 起点 - 终点
    const d0 = a.moveDelta('u1', 0);
    expect(d0).toEqual({ dx: -60, dy: -20 });
    expect(a.moveDelta('u1', 240)).toBeNull();
    expect(a.active(0)).toBe(true);
    expect(a.active(240)).toBe(false);
  });

  it('中点偏移按缓动插值', () => {
    const a = new Animator();
    a.startMove('u1', 0, 0, 100, 0, 0, 240);
    const d = a.moveDelta('u1', 120)!;
    expect(d.dx).toBeLessThan(0);
    expect(d.dx).toBeGreaterThan(-100);
  });

  it('不同单位互不干扰', () => {
    const a = new Animator();
    a.startMove('u1', 0, 0, 100, 0, 0, 240);
    a.startMove('u2', 0, 0, 200, 0, 0, 240);
    expect(a.moveDelta('u2', 0)).toEqual({ dx: -200, dy: 0 });
    expect(a.moveDelta('u1', 0)).toEqual({ dx: -100, dy: 0 });
  });
});

describe('M6-2 动画器：受击闪烁与渐入', () => {
  it('突进为往返偏移：起点/终点为 0，中途最大', () => {
    const a = new Animator();
    a.startLunge('u1', 40, 0, 0, 200);
    expect(a.lungeDelta('u1', 0)).toEqual({ dx: 0, dy: 0 });
    const mid = a.lungeDelta('u1', 100)!;
    expect(mid.dx).toBeGreaterThan(0);
    expect(mid.dx).toBeLessThan(40);
    expect(a.lungeDelta('u1', 200)).toBeNull();
  });

  it('闪烁强度随进度衰减，结束归零', () => {
    const a = new Animator();
    a.startFlash('u1', 0, 180);
    expect(a.flashAmount('u1', 0)).toBeGreaterThan(a.flashAmount('u1', 90));
    expect(a.flashAmount('u1', 180)).toBe(0);
  });

  it('渐入 scale 从 0 到 1，结束为 1 且不再活跃', () => {
    const a = new Animator();
    a.startAppear('u1', 0, 400);
    expect(a.appearScale('u1', 0)).toBe(0);
    expect(a.appearScale('u1', 400)).toBe(1);
    expect(a.active(400)).toBe(false);
  });
});

describe('M6-2 动画器：幽灵（阵亡淡出）', () => {
  it('幽灵可见期内透明度衰减，过期消失', () => {
    const a = new Animator();
    a.startGhost('剑', '#d94a4a', 50, 60, 0, 350);
    const t0 = a.ghosts(0);
    expect(t0).toHaveLength(1);
    expect(t0[0].alpha).toBe(1);
    const mid = a.ghosts(175)[0];
    expect(mid.alpha).toBeLessThan(1);
    expect(a.ghosts(350)).toHaveLength(0);
  });

  it('active 汇总所有未完成动画', () => {
    const a = new Animator();
    a.startGhost('剑', '#d94a4a', 50, 60, 0, 350);
    a.startFlash('u1', 100, 180);
    expect(a.active(100)).toBe(true);
    expect(a.active(300)).toBe(true);   // 幽灵仍在
    expect(a.active(350)).toBe(false);
  });
});
