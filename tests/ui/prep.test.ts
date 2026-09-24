import { describe, it, expect, beforeEach } from 'vitest';
import { createPrepScreen } from '../../src/ui/prep';
import { PLAYER_UNITS } from '../../src/config/map';
import { ART_ASSETS } from '../../src/config/art';
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

  it('R15-2：出场名单行含 32px 头像窗，立绘三级回落到 standing 路径', () => {
    const prep = make();
    // root: [title, rosterBlock, skillBlock, equipBlock, errorList, startButton]
    const rosterBlock = prep.root.children[1];
    const lordRow = rosterBlock.children[1];   // h3 后首行 = lord（PLAYER_UNITS 首位）
    const art = lordRow.children[1];           // [checkbox, 头像, 名字]
    expect(art.innerHTML).toContain('art-slot');
    expect(art.innerHTML).toContain('src="art/standing/lord.png"');
  });

  it('R15-3：选中角色显示立绘预览窗，切换角色随换', () => {
    const prep = make();
    // root: [title, rosterBlock, previewBlock, skillBlock, ...]
    const preview = prep.root.children[2];
    expect(preview.innerHTML).toBe('');   // 未选中时区块隐藏（:empty）
    prep.selectUnit('lord');
    expect(preview.innerHTML).toContain('src="art/standing/lord.png"');
    prep.selectUnit('mage');
    expect(preview.innerHTML).toContain('src="art/standing/mage.png"');
    expect(preview.innerHTML).not.toContain('art/standing/lord.png"');
  });

  it('R15-3：立绘缺失回落隐藏区块（全缺不为占位而占位）', () => {
    const prep = make();
    const preview = prep.root.children[2];
    const orig = ART_ASSETS.lord;
    ART_ASSETS.lord = {};                      // 临时清供给
    try {
      prep.selectUnit('lord');
      expect(preview.innerHTML).toBe('');
    } finally {
      ART_ASSETS.lord = orig;
    }
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
    expect([...prep.getEffectiveLoadout('lord').active]).toEqual(['stab']);
    prep.clickStart();
    const lord = (started as RosterEntry[]).find(e => e.templateId === 'lord');
    expect(lord?.loadout).toBeUndefined();
  });

  it('双过滤置灰：领主不可装横扫（武器不符）与火球（R5-1 资源不符），法师可装治疗系', () => {
    const prep = make();
    prep.selectUnit('lord');
    const lordEntries = prep.poolEntries('lord');
    expect(lordEntries.find(e => e.id === 'sweep')?.blocked).toBe('weapon');
    expect(lordEntries.find(e => e.id === 'fireball')?.blocked).toBe('resource');  // R5-1 法术=MP 资源技能
    expect(prep.addToSlot('lord', 'sweep')).toBe(false);
    expect(prep.addToSlot('lord', 'fireball')).toBe(false);
    prep.selectUnit('mage');
    expect(prep.poolEntries('mage').find(e => e.id === 'heal')?.blocked).toBeNull();
    expect(prep.addToSlot('mage', 'heal')).toBe(true);
  });

  it('增删互斥：装入→槽内可移除→可再装；重复装入拒绝', () => {
    const prep = make();
    prep.selectUnit('mage');
    expect(prep.addToSlot('mage', 'heal')).toBe(true);
    expect(prep.addToSlot('mage', 'heal')).toBe(false); // 重复
    const lo = prep.getEffectiveLoadout('mage');
    expect([...lo.active]).toEqual(['fireball', 'meteor', 'curse', 'heal']);
    prep.removeFromSlot('mage', 'active', 3);
    expect([...prep.getEffectiveLoadout('mage').active]).toEqual(['fireball', 'meteor', 'curse']);
    expect(prep.addToSlot('mage', 'heal')).toBe(true);
  });

  it('主动槽上限 5：装满后拒绝并标注 full', () => {
    const prep = make();
    prep.selectUnit('mage'); // 出厂 3 条 + 池内可装治疗系 3 条
    for (const id of ['heal', 'regen']) {
      expect(prep.addToSlot('mage', id)).toBe(true);
    }
    // 5 满后第 6 条拒绝
    expect(prep.getEffectiveLoadout('mage').active).toHaveLength(5);
    expect(prep.addToSlot('mage', 'mithrilShield')).toBe(false);
    const entries = prep.poolEntries('mage');
    expect(entries.find(e => e.id === 'mithrilShield')?.full).toBe(true);
  });

  it('被动槽：出厂被动可移除；learnable 被动（真实视野，R3-6 入池）可装入', () => {
    const prep = make();
    prep.selectUnit('thief');
    expect([...prep.getEffectiveLoadout('thief').passive]).toEqual(['backstab', 'stealth-move', 'ambush']);
    prep.removeFromSlot('thief', 'passive', 0);
    expect([...prep.getEffectiveLoadout('thief').passive]).toEqual(['stealth-move', 'ambush']);
    expect(prep.poolEntries('thief').some(e => e.kind === 'trait')).toBe(true);
    expect(prep.addToSlot('thief', 'true-sight')).toBe(true);
    expect([...prep.getEffectiveLoadout('thief').passive]).toEqual(['stealth-move', 'ambush', 'true-sight']);
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
    expect(block!.innerHTML).toContain('刺击');
    expect(block!.innerHTML).toContain('主动技能');
  });

  it('技能描述：池条目视图携带描述，槽位与池清单渲染描述文本', () => {
    const prep = make();
    prep.selectUnit('lord');
    const sweepDesc = prep.poolEntries('lord').find(e => e.id === 'sweep')!.desc;
    expect(sweepDesc.length).toBeGreaterThan(0);
    const kids = (prep.root as unknown as { children: FakeElement[] }).children;
    const block = kids.find(c => c.className === 'prep-block skill-block')!;
    expect(block.innerHTML).toContain('克制重装 ×1.8、骑兵 ×1.5');  // 出厂槽位（刺击）显示描述
    prep.selectUnit('mage');
    prep.addToSlot('mage', 'heal');                // 装入后池保持展开
    expect(block.innerHTML).toContain('回复量随魔力提升');          // 池条目（治疗）显示描述
  });
});

describe('R2-5 战前装备区块（选人 → 槽 ×2 → 类别过滤清单 → 开战注入编成）', () => {
  let started: RosterEntry[] | null;

  beforeEach(() => {
    started = null;
  });

  function make() {
    return createPrepScreen(roster => {
      started = roster;
    });
  }

  it('选中角色默认显示出厂装备；未编辑开战不显式传装备', () => {
    const prep = make();
    prep.selectUnit('lord');
    expect([...prep.getEffectiveEquipment('lord')]).toEqual(['longsword', 'rapier']);
    const kids = (prep.root as unknown as { children: FakeElement[] }).children;
    const block = kids.find(c => c.className === 'prep-block equip-block');
    expect(block).toBeDefined();
    expect(block!.innerHTML).toContain('长剑');
    expect(block!.innerHTML).toContain('刺剑');
    prep.clickStart();
    const lord = (started as RosterEntry[]).find(e => e.templateId === 'lord');
    expect(lord?.equipment).toBeUndefined();
  });

  it('类别过滤置灰：法师不可装必杀弓、可同条目双持法杖（双持合法 §4.14）', () => {
    const prep = make();
    prep.selectUnit('mage');
    const entries = prep.equipmentEntries('mage');
    expect(entries.find(e => e.id === 'staff')?.blocked).toBe(false);
    expect(entries.find(e => e.id === 'killingBow')?.blocked).toBe(true);
    expect(prep.equipWeapon('mage', 'killingBow')).toBe(false);
    prep.unequipWeapon('mage', 0);                      // 清空单槽 → 再双持
    expect(prep.equipWeapon('mage', 'staff')).toBe(true);
    expect(prep.equipWeapon('mage', 'staff')).toBe(true);
    expect([...prep.getEffectiveEquipment('mage')]).toEqual(['staff', 'staff']);
  });

  it('槽位上限 2：防战默认满槽拒绝再装；卸下后可再装（允许清空，校验仅上限无保底）', () => {
    const prep = make();
    prep.selectUnit('defender');
    expect(prep.equipWeapon('defender', 'rapier')).toBe(false);   // [longsword, ironShield] 已满
    prep.unequipWeapon('defender', 0);
    expect(prep.equipWeapon('defender', 'rapier')).toBe(true);
    expect([...prep.getEffectiveEquipment('defender')]).toEqual(['ironShield', 'rapier']);
    prep.unequipWeapon('defender', 0);
    prep.unequipWeapon('defender', 0);
    expect([...prep.getEffectiveEquipment('defender')]).toEqual([]);
  });

  it('装备编辑随编成传入开战（编辑者传、未编辑者 undefined）', () => {
    const prep = make();
    prep.selectUnit('thief');
    prep.unequipWeapon('thief', 1);                     // 卸必杀匕首
    expect(prep.equipWeapon('thief', 'dagger')).toBe(true);   // 双持基准匕首
    prep.clickStart();
    const thief = (started as RosterEntry[]).find(e => e.templateId === 'thief');
    expect(thief?.equipment).toEqual(['dagger', 'dagger']);
    const mage = (started as RosterEntry[]).find(e => e.templateId === 'mage');
    expect(mage?.equipment).toBeUndefined();
  });

  it('技能过滤与头部原子展示随编辑装备变化（换武器 = 换可用技能 §4.9）', () => {
    const prep = make();
    prep.selectUnit('defender');
    const kids = (prep.root as unknown as { children: FakeElement[] }).children;
    const skillBlock = kids.find(c => c.className === 'prep-block skill-block')!;
    expect(skillBlock.innerHTML).toContain('icon-sword.png');   // R16-3 头部原子图标化（出厂长剑+铁盾）
    expect(skillBlock.innerHTML).toContain('icon-shield.png');
    prep.unequipWeapon('defender', 0);                              // 卸长剑 → [ironShield]
    expect(prep.equipWeapon('defender', 'ironShield')).toBe(true);  // 双持盾 → 原子仅盾
    expect(skillBlock.innerHTML).not.toContain('icon-sword.png');
    expect(skillBlock.innerHTML).toContain('icon-shield.png');
    const entries = prep.poolEntries('defender');
    expect(entries.find(e => e.id === 'sweep')?.blocked).toBe('weapon');  // 过滤源 = 编辑装备
  });
});

describe('R16-3 prep 声明图标化（池/槽条目与装备清单，§7.0）', () => {
  function make() {
    return createPrepScreen(() => {});
  }
  function blockOf(prep: ReturnType<typeof make>, className: string): FakeElement {
    const kids = (prep.root as unknown as { children: FakeElement[] }).children;
    return kids.find(c => c.className === className)!;
  }

  it('池条目视图携带声明（武器原子/资源/消耗）', () => {
    const prep = make();
    const stealth = prep.poolEntries('thief').find(e => e.id === 'stealth')!;
    expect(stealth.resourceType).toBe('focus');
    expect(stealth.cost).toBe(30);
    const sweep = prep.poolEntries('lord').find(e => e.id === 'sweep')!;
    expect(sweep.weaponType).toEqual(['hammer', 'axe']);
  });

  it('池清单渲染声明图标：资源图标（专注/MP）与武器原子图标', () => {
    const prep = make();
    prep.selectUnit('mage');
    prep.addToSlot('mage', 'heal');                       // 池展开
    const skill = blockOf(prep, 'prep-block skill-block');
    expect(skill.innerHTML).toContain('src="art/icon/icon-mp.png"');       // 治疗声明 MP
    const prep2 = make();
    prep2.selectUnit('axeman');                           // 斧兵可学横扫（weaponType [锤,斧]）
    prep2.addToSlot('axeman', 'sweep');
    const skill2 = blockOf(prep2, 'prep-block skill-block');
    expect(skill2.innerHTML).toContain('src="art/icon/icon-hammer.png"');
    expect(skill2.innerHTML).toContain('src="art/icon/icon-axe.png"');     // 头部原子（战斧）与声明共用
  });

  it('装备清单与已装备槽渲染武器图标', () => {
    const prep = make();
    prep.selectUnit('paladin');                            // 出厂 = 战锤 + 铁盾
    const eq = blockOf(prep, 'prep-block equip-block');
    expect(eq.innerHTML).toContain('src="art/icon/icon-hammer.png"');
    expect(eq.innerHTML).toContain('src="art/icon/icon-shield.png"');
  });
});
