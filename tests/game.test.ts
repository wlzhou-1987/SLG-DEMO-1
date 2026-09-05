import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/game';
import { Camera } from '../src/render/camera';
import { HEX_SIZE } from '../src/render/hex-renderer';
import { MOVE_MS } from '../src/render/animator';
import { axialToPixel } from '../src/core/hex';
import type { HexCoord } from '../src/core/types';
import type { UnitState } from '../src/core/unit';

/**
 * game.ts 协调层交互测试：node 环境下用极简 DOM/Canvas 桩驱动状态机。
 * 相机初始由 centerOnSpawn 确定，此处用相同输入复算一份坐标换算。
 */

const CANVAS_W = 1280;
const CANVAS_H = 800;

class FakeElement {
  tagName = 'DIV';
  id = '';
  className = '';
  textContent = '';
  innerHTML = '';
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  private parent: FakeElement | null = null;
  private listeners = new Map<string, Array<() => void>>();
  private bySelector = new Map<string, FakeElement>();
  classList = { add: () => {}, remove: () => {} };

  addEventListener(type: string, fn: () => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  prepend(child: FakeElement): void {
    child.parent = this;
    this.children.unshift(child);
  }

  get lastChild(): FakeElement | null {
    return this.children[this.children.length - 1] ?? null;
  }

  removeChild(child: FakeElement): FakeElement {
    this.children = this.children.filter(c => c !== child);
    return child;
  }

  remove(): void {
    if (this.parent) this.parent.removeChild(this);
  }

  querySelector(sel: string): FakeElement | null {
    let el = this.bySelector.get(sel);
    if (!el) {
      el = new FakeElement();
      this.bySelector.set(sel, el);
    }
    return el;
  }

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
}

const elements = new Map<string, FakeElement>();

const documentStub = {
  getElementById: (id: string): FakeElement => {
    let el = elements.get(id);
    if (!el) {
      el = new FakeElement();
      elements.set(id, el);
    }
    return el;
  },
  createElement: (): FakeElement => new FakeElement(),
} as unknown as Document;

const windowStub = {
  addEventListener: (): void => {},
  setTimeout: (fn: () => void, ms?: number): number =>
    globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (t: number): void => {
    globalThis.clearTimeout(t as unknown as ReturnType<typeof globalThis.setTimeout>);
  },
} as unknown as Window & typeof globalThis;

const ctxStub: unknown = new Proxy(function () {}, {
  get(_target, prop, receiver) {
    if (prop === Symbol.toPrimitive) return () => 0;
    return receiver;
  },
  set: () => true,
});

const canvasStub = {
  width: 0,
  height: 0,
  getContext: (): unknown => ctxStub,
  addEventListener: (): void => {},
  parentElement: { clientWidth: CANVAS_W, clientHeight: CANVAS_H },
} as unknown as HTMLCanvasElement;

(globalThis as unknown as { document: Document }).document = documentStub;
(globalThis as unknown as { window: Window & typeof globalThis }).window = windowStub;

const g = globalThis as { requestAnimationFrame?: unknown };
if (g.requestAnimationFrame === undefined) {
  g.requestAnimationFrame = (cb: (t: number) => void): number =>
    globalThis.setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

interface GameDriver {
  phase: { mode: string };
  units: UnitState[];
  handleClick(screenX: number, screenY: number): void;
}

const CANVAS_STUB = canvasStub;

function createGame(): { game: GameDriver; click: (h: HexCoord) => void } {
  const game = new Game(CANVAS_STUB) as unknown as GameDriver;

  // 复算 centerOnSpawn：构造时相机对准我方出生点质心（此时单位仍在原位）
  const cam = new Camera();
  const players = game.units.filter(u => u.faction === 'player');
  const cx = players.reduce((s, u) => s + u.position.q, 0) / players.length;
  const cy = players.reduce((s, u) => s + u.position.r, 0) / players.length;
  const world = axialToPixel({ q: cx, r: cy }, HEX_SIZE);
  cam.centerOn(world.x, world.y, CANVAS_W, CANVAS_H);

  const click = (h: HexCoord): void => {
    const p = cam.worldToScreen(axialToPixel(h, HEX_SIZE));
    game.handleClick(p.x, p.y);
  };
  return { game, click };
}

function mapWrap(): FakeElement {
  return elements.get('map-wrap')!;
}

/** 点击行动菜单中指定标签的项（菜单 = map-wrap 下最后一个 .action-menu） */
function menuClick(label: string): void {
  const menu = mapWrap().children.find(c => c.className === 'action-menu');
  if (!menu) throw new Error('行动菜单未弹出');
  const item = menu.children.find(c => c.textContent === label);
  if (!item) throw new Error(`菜单项不存在: ${label}`);
  item.fire('click');
}

/** 点击预报面板的取消按钮 */
function forecastCancel(): void {
  const panel = mapWrap().children.find(c => c.className === 'forecast');
  if (!panel) throw new Error('预报面板未弹出');
  panel.querySelector('.btn-cancel')!.fire('click');
}

const waitMove = (): Promise<void> =>
  new Promise(r => globalThis.setTimeout(r, MOVE_MS + 80));

beforeEach(() => {
  elements.clear();
});

describe('撤销移动（取消行动）', () => {
  it('移动后从行动菜单直接取消：单位回出发点并恢复满移动力', async () => {
    const { game, click } = createGame();
    const hero = game.units.find(u => u.templateId === 'lord')!;
    const origin = { q: 2, r: 24 };
    const dest = { q: 3, r: 24 };
    hero.position = { ...origin };

    click(origin);
    expect(game.phase.mode).toBe('unitSelected');
    click(dest);
    await waitMove();
    expect(game.phase.mode).toBe('actionMenu');

    menuClick('取消');

    expect(hero.position).toEqual(origin);
    expect(hero.moveSpent).toBe(0);
    expect(game.phase.mode).toBe('unitSelected');
  });

  it('移动→攻击→预报取消→点空地→取消：单位仍须回到真正出发点（不得在新位置再移动）', async () => {
    const { game, click } = createGame();
    const hero = game.units.find(u => u.templateId === 'lord')!;
    const enemy = game.units.find(u => u.faction === 'enemy')!;
    const origin = { q: 2, r: 24 };
    const dest = { q: 3, r: 24 };
    const foe = { q: 4, r: 24 };
    hero.position = { ...origin };
    enemy.position = { ...foe };

    click(origin);
    click(dest);
    await waitMove();
    expect(game.phase.mode).toBe('actionMenu');

    menuClick('攻击');
    menuClick('攻击·横斩');
    expect(game.phase.mode).toBe('targetSelect');

    click(foe);
    expect(game.phase.mode).toBe('forecast');

    forecastCancel();
    expect(game.phase.mode).toBe('targetSelect');

    click({ q: 2, r: 22 });
    expect(game.phase.mode).toBe('actionMenu');

    menuClick('取消');

    expect(hero.position).toEqual(origin);
    expect(hero.moveSpent).toBe(0);
    expect(game.phase.mode).toBe('unitSelected');
  });

  it('移动→法术→预报取消→点空地→取消：法术链路同样回到真正出发点', async () => {
    const { game, click } = createGame();
    const mage = game.units.find(u => u.templateId === 'mage')!;
    const enemy = game.units.find(u => u.faction === 'enemy')!;
    const origin = { q: 1, r: 26 };
    const dest = { q: 2, r: 26 };
    const foe = { q: 3, r: 26 };
    mage.position = { ...origin };
    enemy.position = { ...foe };

    click(origin);
    click(dest);
    await waitMove();
    expect(game.phase.mode).toBe('actionMenu');

    menuClick('法术');
    menuClick('法术·火球');
    expect(game.phase.mode).toBe('targetSelect');

    click(foe);
    expect(game.phase.mode).toBe('spellForecast');

    forecastCancel();
    expect(game.phase.mode).toBe('targetSelect');

    click({ q: 1, r: 23 });
    expect(game.phase.mode).toBe('actionMenu');

    menuClick('取消');

    expect(mage.position).toEqual(origin);
    expect(mage.moveSpent).toBe(0);
    expect(game.phase.mode).toBe('unitSelected');
  });
});
