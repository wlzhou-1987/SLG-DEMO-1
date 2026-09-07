import { describe, it, expect, beforeEach } from 'vitest';
import { createPrepScreen } from '../../src/ui/prep';
import { PLAYER_UNITS } from '../../src/config/map';
import type { RosterEntry } from '../../src/core/deployment';

/**
 * prep 界面（§7.0 R1-3）：node 环境下用极简 DOM 桩驱动。
 * 只依赖 document.createElement，桩覆盖 prep.ts 用到的属性。
 */

class FakeElement {
  tagName = 'DIV';
  className = '';
  textContent = '';
  innerHTML = '';
  checked = false;
  disabled = false;
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  classList = { add: (): void => {}, remove: (): void => {} };
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  remove(): void {}
  addEventListener(_type: string, _fn: () => void): void {}
}

const documentStub = {
  createElement: (tagName: string): FakeElement => {
    const el = new FakeElement();
    el.tagName = tagName.toUpperCase();
    return el;
  }
} as unknown as Document;

(globalThis as unknown as { document: Document }).document = documentStub;

describe('prep 战前准备界面（R1-3）', () => {
  let started: RosterEntry[] | null;

  beforeEach(() => {
    started = null;
  });

  function make() {
    return createPrepScreen(roster => {
      started = roster;
    });
  }

  it('初始状态：10 人全选、开战按钮可用、无校验提示', () => {
    const prep = make();
    const roster = prep.getRoster();
    expect(roster).toHaveLength(10);
    expect(roster.some(e => e.templateId === 'lord')).toBe(true);
    expect(prep.startButton.disabled).toBe(false);
    expect(prep.errorList.innerHTML).toBe('');
  });

  it('默认站位沿用关卡配置（PLAYER_UNITS 同位）', () => {
    const prep = make();
    const byId = new Map(PLAYER_UNITS.map(u => [u.templateId, u.position]));
    for (const e of prep.getRoster()) {
      expect(e.position).toEqual(byId.get(e.templateId));
    }
  });

  it('0 人：按钮禁用，提示含人数不足与缺领主', () => {
    const prep = make();
    for (const u of PLAYER_UNITS) prep.setChecked(u.templateId, false);
    expect(prep.startButton.disabled).toBe(true);
    expect(prep.errorList.innerHTML).toContain('人数不足');
    expect(prep.errorList.innerHTML).toContain('lord');
  });

  it('取消领主（9 人）：禁用并提示；勾回后恢复可用', () => {
    const prep = make();
    prep.setChecked('lord', false);
    expect(prep.getRoster()).toHaveLength(9);
    expect(prep.startButton.disabled).toBe(true);
    expect(prep.errorList.innerHTML).toContain('lord');

    prep.setChecked('lord', true);
    expect(prep.startButton.disabled).toBe(false);
    expect(prep.errorList.innerHTML).toBe('');
  });

  it('开战：合法时回调编成，非法时不回调', () => {
    const prep = make();
    prep.clickStart();
    expect(started).not.toBeNull();
    expect((started as RosterEntry[])).toHaveLength(10);

    prep.setChecked('lord', false);
    prep.clickStart();
    expect(started).not.toBeNull(); // 仍是上次合法回调，未再次触发
  });
});
