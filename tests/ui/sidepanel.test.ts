import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showUnitInfo } from '../../src/ui/sidepanel';
import { createUnitState } from '../../src/core/unit';

/** R15-2 单位面板头部头像窗（§7.3/§7.5）：极简 DOM 桩，同 forecast.test 口径 */
class FakeElement {
  innerHTML = '';
}

let panel: FakeElement;
const originalDocument = globalThis.document;

beforeEach(() => {
  panel = new FakeElement();
  (globalThis as unknown as { document: unknown }).document = {
    getElementById: (id: string): FakeElement | null => (id === 'panel-unit' ? panel : null)
  };
});

afterEach(() => {
  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

describe('R15-2 单位面板头部头像', () => {
  it('选中单位：头部含 48px 头像窗，立绘三级回落到 standing 路径', () => {
    const unit = createUnitState('lord', 'player', { q: 0, r: 0 });
    showUnitInfo(unit);
    expect(panel.innerHTML).toContain('unit-head');
    expect(panel.innerHTML).toContain('art-slot');
    expect(panel.innerHTML).toContain('src="art/standing/lord.png"');
    expect(panel.innerHTML).toContain('<h3>领主');
  });

  it('敌方单位：头像窗用敌方阵营色占位兜底可用', () => {
    const unit = createUnitState('swordsman', 'enemy', { q: 0, r: 0 });
    showUnitInfo(unit);
    expect(panel.innerHTML).toContain('src="art/standing/swordsman.png"');
    expect(panel.innerHTML).toContain('art-fb');  // onerror 兜底在位
  });
});

describe('技能列表有效射程显示（§4.4 属性/特性射程加成）', () => {
  it('弓箭：力量 19 ≥ 阈值，普攻与技能显示射程 2-3', () => {
    showUnitInfo(createUnitState('archer', 'player', { q: 0, r: 0 }));
    expect(panel.innerHTML).toContain('射程 2-3');
    expect(panel.innerHTML).not.toContain('射程 2-2');
  });

  it('法师：魔力 24 ≥ 阈值，火球显示射程 1-3', () => {
    showUnitInfo(createUnitState('mage', 'player', { q: 0, r: 0 }));
    expect(panel.innerHTML).toContain('火球（法术·射程 1-3）');
  });

  it('牧师：魔力 21 + 强化治疗特性双加成，治疗法术显示射程 1-4', () => {
    showUnitInfo(createUnitState('priest', 'player', { q: 0, r: 0 }));
    expect(panel.innerHTML).toContain('射程 1-4');
  });

  it('领主：近战无加成仍显示射程 1-1', () => {
    showUnitInfo(createUnitState('lord', 'player', { q: 0, r: 0 }));
    expect(panel.innerHTML).toContain('射程 1-1');
  });
});
