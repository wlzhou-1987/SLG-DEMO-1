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
