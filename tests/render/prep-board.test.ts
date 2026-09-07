import { describe, it, expect } from 'vitest';
import { PrepBoard } from '../../src/render/prep-board';
import { createMapState } from '../../src/core/map';
import { MAP_OVERRIDES, DEPLOY_ZONE } from '../../src/config/map';
import { Camera } from '../../src/render/camera';
import { HEX_SIZE } from '../../src/render/hex-renderer';
import { axialToPixel } from '../../src/core/hex';
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
