import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showForecastPanel, showSpellForecastPanel, hideForecastPanel } from '../../src/ui/forecast';
import type { ForecastWho } from '../../src/ui/forecast';
import type { BattleForecast, StrikeForecast } from '../../src/core/combat';
import type { SpellForecast } from '../../src/core/spell';

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
    showForecastPanel(
      forecast,
      { name: '法师', templateId: 'mage', faction: 'player' },
      { name: 'BOSS', templateId: 'boss', faction: 'enemy' },
      () => {}, () => {}
    );
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('暴击 41%');
    expect(html).toContain('暴击 必定');
  });
});

describe('R15-2 预报面板头像（§4.5/§7.5）', () => {
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

  it('战斗预报标题行：攻守双方各 28px 头像（攻左守右）', () => {
    const forecast: BattleForecast = {
      attacker: strike({}),
      counter: null,
      firstStrike: false
    };
    const atk: ForecastWho = { name: '法师', templateId: 'mage', faction: 'player' };
    const def: ForecastWho = { name: 'BOSS', templateId: 'boss', faction: 'enemy' };
    showForecastPanel(forecast, atk, def, () => {}, () => {});
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('src="art/standing/mage.png"');
    expect(html).toContain('src="art/standing/boss.png"');
    const atkPos = html.indexOf('art/standing/mage.png');
    const defPos = html.indexOf('art/standing/boss.png');
    expect(atkPos).toBeGreaterThan(-1);
    expect(defPos).toBeGreaterThan(atkPos);   // 攻左守右
  });

  it('法术预报：仅施法者头像，目标不加（行高稳定）', () => {
    const forecast: SpellForecast = { kind: 'heal', amount: 18 } as SpellForecast;
    showSpellForecastPanel(
      '治疗',
      { name: '牧师', templateId: 'priest', faction: 'player' },
      '法师',
      forecast,
      () => {}, () => {}
    );
    const html = wrap.children[wrap.children.length - 1].innerHTML;
    expect(html).toContain('src="art/standing/priest.png"');
    expect(html.match(/<img/g)?.length).toBe(1);
  });
});
