import { describe, it, expect } from 'vitest';
import { Camera } from '../../src/render/camera';

/** R19 顺滑缩放：目标插值 + 光标不动点；pan/zoomAt/centerOn 打断补间 */
describe('Camera 顺滑缩放插值（R19）', () => {
  it('setZoomTarget 后逐帧 tick 收敛到目标，且收敛即停', () => {
    const cam = new Camera();
    cam.setZoomTarget(100, 100, 1.5);
    expect(cam.animating()).toBe(true);
    let guard = 0;
    while (cam.tick(16) && guard++ < 500);
    expect(cam.zoom).toBeCloseTo(1.5, 3);
    expect(cam.animating()).toBe(false);
    expect(cam.tick(16)).toBe(false);   // 收敛后不再动画
  });

  it('插值全程光标不动点：锚点世界坐标在屏幕上恒等于锚点屏幕坐标', () => {
    const cam = new Camera();
    cam.centerOn(500, 400, 1000, 800);  // x=0,y=0 视野中心 (500,400)
    const ax = 620, ay = 330;
    const worldAtStart = cam.screenToWorld({ x: ax, y: ay });
    cam.setZoomTarget(ax, ay, 2);
    let guard = 0;
    while (cam.tick(16) && guard++ < 500);
    const screenAtEnd = cam.worldToScreen(worldAtStart);
    expect(screenAtEnd.x).toBeCloseTo(ax, 6);
    expect(screenAtEnd.y).toBeCloseTo(ay, 6);
    // 中途某帧也不动
    cam.setZoomTarget(ax, ay, 0.5);
    cam.tick(16);
    const mid = cam.worldToScreen(worldAtStart);
    expect(mid.x).toBeCloseTo(ax, 6);
    expect(mid.y).toBeCloseTo(ay, 6);
  });

  it('目标受 0.3~2 限幅', () => {
    const cam = new Camera();
    cam.setZoomTarget(0, 0, 100);
    let guard = 0;
    while (cam.tick(16) && guard++ < 500);
    expect(cam.zoom).toBeLessThanOrEqual(2);
    cam.setZoomTarget(0, 0, 0.0001);
    guard = 0;
    while (cam.tick(16) && guard++ < 500);
    expect(cam.zoom).toBeGreaterThanOrEqual(0.3);
  });

  it('pan 打断补间（zoom 停在当前值）；zoomAt/centerOn 同样打断', () => {
    const cam = new Camera();
    cam.setZoomTarget(50, 50, 2);
    cam.tick(16);
    cam.pan(30, 30);
    expect(cam.animating()).toBe(false);
    const zAfterPan = cam.zoom;
    expect(cam.tick(16)).toBe(false);
    expect(cam.zoom).toBe(zAfterPan);

    cam.setZoomTarget(50, 50, 2);
    cam.zoomAt(0, 0, 1.7);
    expect(cam.animating()).toBe(false);

    cam.setZoomTarget(50, 50, 2);
    cam.centerOn(0, 0, 800, 600);
    expect(cam.animating()).toBe(false);
  });
});
