import { describe, it, expect, afterEach } from 'vitest';
import { PrepBoard } from '../../src/render/prep-board';
import { createMapState } from '../../src/core/map';
import { MAP_OVERRIDES, DEPLOY_ZONE } from '../../src/config/map';
import { Camera } from '../../src/render/camera';
import { HEX_SIZE } from '../../src/render/hex-renderer';
import { axialToPixel } from '../../src/core/hex';
import { MARKER_ART } from '../../src/config/art';
import { spriteCache } from '../../src/render/sprite-cache';
import type { HexCoord } from '../../src/core/types';
import type { RosterEntry } from '../../src/core/deployment';
import type { MapState } from '../../src/core/map';

/** prep-board 渲染层单测：画布/ctx 用桩，Camera 数学用真实现复算点击坐标 */

const CANVAS_W = 1280;
const CANVAS_H = 800;

const ctxStub: unknown = new Proxy(function () {}, {
  get(_target, prop, receiver) {
    if (prop === Symbol.toPrimitive) return () => 0;
    return receiver;
  },
  set: () => true
});

const canvasStub = {
  width: 0,
  height: 0,
  getContext: (): unknown => ctxStub,
  addEventListener: (): void => {},
  removeEventListener: (): void => {},
  parentElement: { clientWidth: CANVAS_W, clientHeight: CANVAS_H }
} as unknown as HTMLCanvasElement;

(globalThis as unknown as { window: Window & typeof globalThis }).window = {
  addEventListener: (): void => {},
  removeEventListener: (): void => {}
} as unknown as Window & typeof globalThis;

/** 复算 PrepBoard 构造时的相机定位（部署区中心），得到某格的屏幕坐标 */
function screenOf(hex: HexCoord): { x: number; y: number } {
  const cam = new Camera();
  const cx = (DEPLOY_ZONE.qMin + DEPLOY_ZONE.qMax) / 2;
  const cy = (DEPLOY_ZONE.rMin + DEPLOY_ZONE.rMax) / 2;
  const world = axialToPixel({ q: cx, r: cy }, HEX_SIZE);
  cam.centerOn(world.x, world.y, CANVAS_W, CANVAS_H);
  return cam.worldToScreen(axialToPixel(hex, HEX_SIZE));
}

function makeBoard(
  getRoster: () => RosterEntry[]
): { board: PrepBoard; changed: RosterEntry[] | null; invalidAt: HexCoord | null } {
  let changed: RosterEntry[] | null = null;
  let invalidAt: HexCoord | null = null;
  const board = new PrepBoard(canvasStub, createMapState(MAP_OVERRIDES) as MapState, {
    getRoster,
    onChange: next => { changed = next; },
    onInvalid: target => { invalidAt = target; }
  });
  return { board, get changed() { return changed; }, get invalidAt() { return invalidAt; } };
}

describe('PrepBoard 战前站位调整（R1-4）', () => {
  const roster = (): RosterEntry[] => [
    { templateId: 'lord', position: { q: 10, r: 27 } },
    { templateId: 'knight', position: { q: 11, r: 28 } }
  ];

  it('点单位选中，再点部署区空格：onChange 收到移动后的编成', () => {
    const t = makeBoard(roster);
    const p1 = screenOf({ q: 10, r: 27 });
    t.board.handleClick(p1.x, p1.y);
    const p2 = screenOf({ q: 5, r: 26 });
    t.board.handleClick(p2.x, p2.y);
    expect(t.changed).not.toBeNull();
    expect(t.changed![0].position).toEqual({ q: 5, r: 26 });
    expect(t.changed![1].position).toEqual({ q: 11, r: 28 });
  });

  it('选中后点部署区外：onInvalid 回调、onChange 不触发', () => {
    const t = makeBoard(roster);
    const p1 = screenOf({ q: 10, r: 27 });
    t.board.handleClick(p1.x, p1.y);
    const out = screenOf({ q: 10, r: 25 });
    t.board.handleClick(out.x, out.y);
    expect(t.invalidAt).toEqual({ q: 10, r: 25 });
    expect(t.changed).toBeNull();
  });

  it('选中 A 点 B 所在格：onChange 收到交换后的编成', () => {
    const t = makeBoard(roster);
    const p1 = screenOf({ q: 10, r: 27 });
    t.board.handleClick(p1.x, p1.y);
    const p2 = screenOf({ q: 11, r: 28 });
    t.board.handleClick(p2.x, p2.y);
    expect(t.changed).not.toBeNull();
    expect(t.changed![0].position).toEqual({ q: 11, r: 28 });
    expect(t.changed![1].position).toEqual({ q: 10, r: 27 });
  });

  it('点击自己两次：取消选中，不产生编成变更', () => {
    const t = makeBoard(roster);
    const p1 = screenOf({ q: 10, r: 27 });
    t.board.handleClick(p1.x, p1.y);
    t.board.handleClick(p1.x, p1.y);
    expect(t.changed).toBeNull();
    expect(t.invalidAt).toBeNull();
  });
});

describe('PrepBoard 渲染清屏（拖动残影修复）', () => {
  it('render 每帧先以背景填充整幅画布再绘制', () => {
    const calls: Array<{ prop: string; args: unknown[] }> = [];
    const ctx = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === Symbol.toPrimitive) return () => 0;
        return (...args: unknown[]): void => { calls.push({ prop: String(prop), args }); };
      },
      set: () => true
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: (): unknown => ctx,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
      parentElement: { clientWidth: CANVAS_W, clientHeight: CANVAS_H }
    } as unknown as HTMLCanvasElement;
    const board = new PrepBoard(canvas, createMapState(MAP_OVERRIDES) as MapState, {
      getRoster: () => [],
      onChange: () => {},
      onInvalid: () => {}
    });
    // 构造与手动 render 的第一笔都必须是整幅背景填充（与 Game.render 一致）
    expect(calls[0]).toEqual({ prop: 'fillRect', args: [0, 0, CANVAS_W, CANVAS_H] });
    const before = calls.length;
    board.render();
    expect(calls[before]).toEqual({ prop: 'fillRect', args: [0, 0, CANVAS_W, CANVAS_H] });
  });
});

describe('R16-4 部署区标识叠加（prep-board，§7.0）', () => {
  class MarkerCtx {
    drawImageCalls = 0;
    fillStyles: string[] = [];
    globalAlpha = 1;
    fillStyle = '';
    strokeStyle = '';
    font = '';
    lineWidth = 1;
    beginPath(): void {}
    arc(): void {}
    moveTo(): void {}
    lineTo(): void {}
    closePath(): void {}
    fill(): void { this.fillStyles.push(this.fillStyle); }
    stroke(): void {}
    fillText(): void {}
    fillRect(): void {}
    clip(): void {}
    save(): void {}
    restore(): void {}
    setTransform(): void {}
    translate(): void {}
    drawImage(): void { this.drawImageCalls++; }
  }
  class MarkerImage { complete = true; naturalWidth = 256; src = ''; }
  const originalImage = (globalThis as { Image?: unknown }).Image;

  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = originalImage;
    spriteCache.clear();
  });

  function makeCtxBoard(): MarkerCtx {
    const ctx = new MarkerCtx();
    (globalThis as { Image?: unknown }).Image = MarkerImage as unknown as typeof Image;
    spriteCache.clear();   // 前序用例可能在无 Image 环境缓存了永不就绪桩，装桩后重置
    const canvas = {
      width: 0, height: 0,
      getContext: (): unknown => ctx,
      addEventListener: (): void => {},
      parentElement: { clientWidth: 800, clientHeight: 600 }
    } as unknown as HTMLCanvasElement;
    new PrepBoard(canvas, createMapState(MAP_OVERRIDES) as MapState, {
      getRoster: () => [], onChange: () => {}, onInvalid: () => {}
    });
    return ctx;
  }

  it('marker 登记就绪：render 含标识贴图（计数高于剥除基线），绿高亮保留', () => {
    const withMarker = makeCtxBoard();
    expect(withMarker.drawImageCalls).toBeGreaterThan(0);
    const saved = MARKER_ART.deploy;
    MARKER_ART.deploy = undefined as unknown as string;
    spriteCache.clear();
    const without = makeCtxBoard();
    MARKER_ART.deploy = saved;
    expect(withMarker.drawImageCalls).toBeGreaterThan(without.drawImageCalls);
    expect(without.fillStyles).toContain('#4ade80');   // 剥除标识后绿高亮仍在（叠加不替代）
  });
});
