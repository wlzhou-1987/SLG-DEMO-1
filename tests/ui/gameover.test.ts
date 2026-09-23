import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showGameOverOverlay, hideGameOverOverlay } from '../../src/ui/gameover';
import { ART_ASSETS } from '../../src/config/art';

/** R15-5 胜负结算浮层（§7.4/§7.5）：极简 DOM 桩，同 forecast.test 口径 */
class FakeElement {
  tagName = 'DIV';
  className = '';
  innerHTML = '';
  children: FakeElement[] = [];
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  remove(): void {}
  querySelector(): FakeElement {
    return new FakeElement();
  }
  addEventListener(): void {}
}

const wrap = new FakeElement();
const originalDocument = globalThis.document;

beforeEach(() => {
  (globalThis as { document: unknown }).document = {
    createElement: () => new FakeElement(),
    getElementById: (id: string) => (id === 'map-wrap' ? wrap : null)
  };
});
afterEach(() => {
  hideGameOverOverlay();
  (globalThis as { document: unknown }).document = originalDocument;
});

describe('R15-5 胜负结算浮层', () => {
  it('胜态：领主立绘 + 回合数 + 双方存活统计', () => {
    showGameOverOverlay('playerWin', { turn: 12, playerAlive: 5, enemyAlive: 0 });
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('我方胜利');
    expect(html).toContain('src="art/standing/lord.png"');
    expect(html).toContain('回合 12');
    expect(html).toContain('我方存活 5');
    expect(html).toContain('敌方存活 0');
  });

  it('败态：BOSS 立绘代表胜方阵营', () => {
    showGameOverOverlay('playerLose', { turn: 20, playerAlive: 0, enemyAlive: 8 });
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('我方败北');
    expect(html).toContain('src="art/standing/boss.png"');
  });

  it('立绘缺失回落头像占位（三级回落链尾）', () => {
    const orig = ART_ASSETS.lord;
    ART_ASSETS.lord = {};
    try {
      showGameOverOverlay('playerWin', { turn: 3, playerAlive: 2, enemyAlive: 9 });
      const html = wrap.children[wrap.children.length - 1].innerHTML;
      expect(html).not.toContain('go-img');
      expect(html).toContain('art-fb-on');
    } finally {
      ART_ASSETS.lord = orig;
    }
  });
});
