import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HexRenderer, RESOURCE_COLORS } from '../../src/render/hex-renderer';
import { Camera } from '../../src/render/camera';
import { spriteCache } from '../../src/render/sprite-cache';
import { ART_ASSETS } from '../../src/config/art';
import { createUnitState } from '../../src/core/unit';
import type { GhostView } from '../../src/render/animator';

/** R15-4 棋子盘心贴图分支：FakeCtx 记录 drawImage 调用（剪影回落=无 drawImage） */
class FakeCtx {
  drawImageCalls = 0;
  fillRectCalls: { x: number; y: number; w: number; h: number; style: string }[] = [];
  globalAlpha = 1;
  font = '';
  textAlign = '';
  textBaseline = '';
  fillStyle = '';
  strokeStyle = '';
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillRectCalls.push({ x, y, w, h, style: this.fillStyle });
  }
  lineWidth = 1;
  beginPath(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(): void {}
  clip(): void {}
  save(): void {}
  restore(): void {}
  setTransform(): void {}
  translate(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  drawImage(): void { this.drawImageCalls++; }
}

class FakeImage {
  complete = true;
  naturalWidth = 256;
  src = '';
}

const originalImage = (globalThis as { Image?: unknown }).Image;
const savedLord = ART_ASSETS.lord;   // 真实登记快照（sprite 供给后非空），用例改写后还原

describe('R15-4 棋子贴图管线（hex-renderer 盘心分支）', () => {
  let ctx: FakeCtx;

  beforeEach(() => {
    ctx = new FakeCtx();
    (globalThis as { Image?: unknown }).Image = FakeImage as unknown as typeof Image;
  });
  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = originalImage;
    delete ART_ASSETS.__sprite_test;
    ART_ASSETS.lord = savedLord;
    spriteCache.clear();
  });

  it('sprite 未登记：drawUnits 走剪影回落（无 drawImage）', () => {
    ART_ASSETS.lord = { standing: savedLord.standing };   // 剥掉 sprite 模拟未登记
    const r = new HexRenderer(ctx as unknown as CanvasRenderingContext2D);
    const unit = createUnitState('lord', 'player', { q: 0, r: 0 });
    r.drawUnits([unit], new Camera(), 800, 600);
    expect(ctx.drawImageCalls).toBe(0);
  });

  it('sprite 登记且就绪：drawUnits 盘心 drawImage 贴图', () => {
    ART_ASSETS.__sprite_test = { sprite: 's.png' };
    ART_ASSETS.lord = { ...ART_ASSETS.lord, sprite: 'lord-sprite.png' };
    const r = new HexRenderer(ctx as unknown as CanvasRenderingContext2D);
    const unit = createUnitState('lord', 'player', { q: 0, r: 0 });
    r.drawUnits([unit], new Camera(), 800, 600);
    expect(ctx.drawImageCalls).toBe(1);
  });

  it('阵亡幽灵同源：sprite 就绪时 drawGhosts 同样贴图', () => {
    ART_ASSETS.lord = { ...ART_ASSETS.lord, sprite: 'lord-sprite.png' };
    const r = new HexRenderer(ctx as unknown as CanvasRenderingContext2D);
    const ghost: GhostView = { templateId: 'lord', color: '#4a90d9', x: 0, y: 0, scale: 1, alpha: 0.5 };
    r.drawGhosts([ghost], new Camera());
    expect(ctx.drawImageCalls).toBe(1);
  });
});

describe('R20 棋子资源条（HP 条下方，职业主资源）', () => {
  it('专注系：资源条在 HP 条正下方、宽度按比例、颜色按资源类型', () => {
    const c = new FakeCtx();
    const r = new HexRenderer(c as unknown as CanvasRenderingContext2D);
    const unit = createUnitState('thief', 'player', { q: 0, r: 0 });   // 专注满起（上限值不假设）
    unit.resources.current = unit.resources.max / 2;
    r.drawUnits([unit], new Camera(), 800, 600);
    expect(c.fillRectCalls.length).toBe(4);                            // HP 底/HP 前/资源底/资源前
    const [hpBg, , resBg, resFg] = c.fillRectCalls;
    expect(resBg.y).toBeGreaterThan(hpBg.y);                           // HP 条下方
    expect(resFg.w).toBeCloseTo(resBg.w * 0.5, 5);                     // 2/4 半仓
    expect(resFg.style).toBe(RESOURCE_COLORS.focus);
  });

  it('怒气系空仓：前景条宽 0（仍占绘制调用，槽位稳定）', () => {
    const c = new FakeCtx();
    const r = new HexRenderer(c as unknown as CanvasRenderingContext2D);
    const unit = createUnitState('lord', 'player', { q: 0, r: 0 });    // 怒气 0/10 空起
    r.drawUnits([unit], new Camera(), 800, 600);
    expect(c.fillRectCalls.length).toBe(4);
    const resFg = c.fillRectCalls[3];
    expect(resFg.w).toBe(0);
    expect(resFg.style).toBe(RESOURCE_COLORS.rage);
  });
});
