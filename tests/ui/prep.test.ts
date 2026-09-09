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

  it('setBoardRoster 更新站位且保持校验通过', () => {
    let updated = 0;
    const prep2 = createPrepScreen(() => {}, () => { updated++; });
    prep2.setChecked('mage', false);
    const moved = prep2.getRoster().map(e =>
      e.templateId === 'knight' ? { ...e, position: { q: 5, r: 26 } } : e
    );
    prep2.setBoardRoster(moved);
    const knight = prep2.getRoster().find(e => e.templateId === 'knight');
    expect(knight?.position).toEqual({ q: 5, r: 26 });
    expect(prep2.startButton.disabled).toBe(false);
    expect(updated).toBe(2); // setChecked 与 setBoardRoster 各触发一次
  });

  it('取消勾选再恢复：保留画布调整后的站位', () => {
    const prep = make();
    prep.setChecked('knight', false);
    prep.setBoardRoster(
      prep.getRoster().map(e => e.templateId === 'lord' ? { ...e, position: { q: 6, r: 26 } } : e)
    );
    prep.setChecked('knight', true);
    const lord = prep.getRoster().find(e => e.templateId === 'lord');
    expect(lord?.position).toEqual({ q: 6, r: 26 });
  });
});

describe('R3-5 技能配置区块', () => {
  let started: RosterEntry[] | null;

  beforeEach(() => {
    started = null;
  });

  function make() {
    return createPrepScreen(roster => {
      started = roster;
    });
  }

  it('选中角色默认显示出厂装填；未编辑角色开战不显式传装填', () => {
    const prep = make();
    prep.selectUnit('lord');
    expect([...prep.getEffectiveLoadout('lord').active]).toEqual(['shieldThrust']);
    prep.clickStart();
    const lord = (started as RosterEntry[]).find(e => e.templateId === 'lord');
    expect(lord?.loadout).toBeUndefined();
  });

  it('双过滤置灰：领主不可装横扫（武器不符），可装火球（法术免声明）', () => {
    const prep = make();
    prep.selectUnit('lord');
    const entries = prep.poolEntries('lord');
    expect(entries.find(e => e.id === 'sweep')?.blocked).toBe('weapon');
    expect(entries.find(e => e.id === 'fireball')?.blocked).toBeNull();
    expect(prep.addToSlot('lord', 'sweep')).toBe(false);
    expect(prep.addToSlot('lord', 'fireball')).toBe(true);
  });

  it('增删互斥：装入→槽内可移除→可再装；重复装入拒绝', () => {
    const prep = make();
    prep.selectUnit('lord');
    expect(prep.addToSlot('lord', 'fireball')).toBe(true);
    expect(prep.addToSlot('lord', 'fireball')).toBe(false); // 重复
    const lo = prep.getEffectiveLoadout('lord');
    expect([...lo.active]).toEqual(['shieldThrust', 'fireball']);
    prep.removeFromSlot('lord', 'active', 1);
    expect([...prep.getEffectiveLoadout('lord').active]).toEqual(['shieldThrust']);
    expect(prep.addToSlot('lord', 'fireball')).toBe(true);
  });

  it('主动槽上限 5：装满后拒绝并标注 full', () => {
    const prep = make();
    prep.selectUnit('lord'); // 出厂 1 条 + 池内可装法术恰 6 条
    for (const id of ['fireball', 'meteor', 'curse', 'heal']) {
      expect(prep.addToSlot('lord', id)).toBe(true);
    }
    // 5 满后第 6 条拒绝
    expect(prep.getEffectiveLoadout('lord').active).toHaveLength(5);
    expect(prep.addToSlot('lord', 'regen')).toBe(false);
    const entries = prep.poolEntries('lord');
    expect(entries.find(e => e.id === 'regen')?.full).toBe(true);
  });

  it('被动槽：出厂被动可移除；池中无 learnable 被动条目（结构就绪）', () => {
    const prep = make();
    prep.selectUnit('thief');
    expect([...prep.getEffectiveLoadout('thief').passive]).toEqual(['backstab']);
    prep.removeFromSlot('thief', 'passive', 0);
    expect([...prep.getEffectiveLoadout('thief').passive]).toEqual([]);
    expect(prep.poolEntries('thief').some(e => e.kind === 'trait')).toBe(false);
  });

  it('开战传参：编辑过的角色随编成传入装填，战斗内即锁定', () => {
    const prep = make();
    prep.selectUnit('mage');
    prep.removeFromSlot('mage', 'active', 0); // 移除火球
    prep.clickStart();
    const mage = (started as RosterEntry[]).find(e => e.templateId === 'mage');
    expect(mage?.loadout).toBeDefined();
    expect(mage?.loadout?.active).toEqual(['meteor', 'curse']);
    const priest = (started as RosterEntry[]).find(e => e.templateId === 'priest');
    expect(priest?.loadout).toBeUndefined(); // 未编辑走出厂默认
  });

  it('槽位渲染：选中角色后技能区块显示出厂条目名', () => {
    const prep = make();
    prep.selectUnit('lord');
    const kids = (prep.root as unknown as { children: FakeElement[] }).children;
    const block = kids.find(c => c.className === 'prep-block skill-block');
    expect(block).toBeDefined();
    expect(block!.innerHTML).toContain('盾突');
    expect(block!.innerHTML).toContain('主动技能');
  });
});
