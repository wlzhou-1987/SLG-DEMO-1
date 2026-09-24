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

  it('法师：魔力 24 ≥ 阈值，火球显示射程 1-3（R16-3 伤害类型图标化后法术线无图标）', () => {
    showUnitInfo(createUnitState('mage', 'player', { q: 0, r: 0 }));
    expect(panel.innerHTML).toContain('火球（射程 1-3）');
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

describe('R16-3 单位面板图标化（五处落点，§7.3）', () => {
  it('主资源行/装备行/标签行携图标；标签 fallback 文字在 data-fb', () => {
    const unit = createUnitState('paladin', 'player', { q: 0, r: 0 });   // 怒气 · 重甲+骑兵 · 锤盾
    showUnitInfo(unit);
    expect(panel.innerHTML).toContain('src="art/icon/icon-rage.png"');
    expect(panel.innerHTML).toContain('src="art/icon/icon-hammer.png"');
    expect(panel.innerHTML).toContain('src="art/icon/icon-shield.png"');
    expect(panel.innerHTML).toContain('src="art/icon/icon-tag-heavy.png"');
    expect(panel.innerHTML).toContain('src="art/icon/icon-tag-cavalry.png"');
    expect(panel.innerHTML).toContain('data-fb="重甲"');
  });

  it('技能列表：物理线伤害类型图标在位，法术线（magic 无图）不显示图标', () => {
    const unit = createUnitState('mage', 'player', { q: 0, r: 0 });
    showUnitInfo(unit);
    expect(panel.innerHTML).toContain('src="art/icon/icon-dmg-blunt.png"');   // 杖击普攻 = 钝线
    expect(panel.innerHTML).not.toContain('src="art/icon/icon-dmg-slash.png"');
  });

  it('状态行：每状态前置状态图标（dot 用 burn 图）', () => {
    const unit = createUnitState('mage', 'player', { q: 0, r: 0 });
    unit.statuses.push({
      type: 'dot', skillName: '灼烧', turnsLeft: 2, appliedAtTurn: 1, damagePerTurn: 5
    });
    showUnitInfo(unit);
    expect(panel.innerHTML).toContain('src="art/icon/icon-status-burn.png"');
  });
});
