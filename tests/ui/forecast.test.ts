import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showForecastPanel, hideForecastPanel } from '../../src/ui/forecast';
import type { BattleForecast, StrikeForecast } from '../../src/core/combat';

/** 极简 DOM 桩（同 action-menu.test 口径）：forecast 走 innerHTML + querySelector */
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
    return new FakeElement();  // 按钮桩：仅承接 addEventListener
  }
  addEventListener(): void {}
}

const wrap = new FakeElement();
const originalDocument = globalThis.document;

function strike(over: Partial<StrikeForecast>): StrikeForecast {
  return {
    skillName: '普攻', damageType: 'slashing', side: 'front',
    damage: 10, hitRate: 90, count: 1,
    critRate: 35, critDamage: 20, mustCrit: false,
    ...over
  };
}

describe('R7-2 预报面板暴击率行', () => {
  beforeEach(() => {
    (globalThis as { document: unknown }).document = {
      createElement: () => new FakeElement(),
      getElementById: (id: string) => (id === 'map-wrap' ? wrap : null)
    };
  });
  afterEach(() => {
    hideForecastPanel();
    (globalThis as { document: unknown }).document = originalDocument;
  });

  it('打击行显示暴击率；必暴技能显示「必定」', () => {
    const forecast: BattleForecast = {
      attacker: strike({ critRate: 41 }),
      counter: strike({ skillName: '重锤', mustCrit: true, critRate: 0 }),
      firstStrike: false
    };
    showForecastPanel(forecast, '法师', 'BOSS', () => {}, () => {});
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('暴击 41%');
    expect(html).toContain('暴击 必定');
  });
});
