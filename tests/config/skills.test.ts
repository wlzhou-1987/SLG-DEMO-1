import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  getSkill,
  WEAPON_ATOMS
} from '../../src/config/skills';
import {
  PLAYER_TEMPLATES,
  ENEMY_TEMPLATES,
  getTemplateSkills,
  resolveSkill
} from '../../src/config/units';
import { basicAttackSkills } from '../../src/config/weapons';
import { TRAIT_CONFIGS } from '../../src/config/traits';
import { SPELLS } from '../../src/config/spells';
import { learnBlockReason } from '../../src/config/pool';

const ALL_TEMPLATES = [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES];

describe('R3-1 三注册表与类型重构：SKILLS 注册表', () => {
  it('注册表条目 id 与名称唯一', () => {
    const entries = Object.values(SKILLS);
    const ids = new Set(entries.map(s => s.id));
    const names = new Set(entries.map(s => s.name));
    expect(ids.size).toBe(entries.length);
    expect(names.size).toBe(entries.length);
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('普攻吸收的四技能已删除，保留技能在注册表', () => {
    const names = Object.values(SKILLS).map(s => s.name);
    for (const name of ['盾突', '盾击', '重锤', '狙击', '横扫']) {
      expect(names).toContain(name);
    }
    for (const name of ['横斩', '突刺', '重劈', '射击']) {
      expect(names).not.toContain(name);
    }
  });

  it('横扫 weaponType = 锤/斧 one-of（武器线跨伤害线实例）', () => {
    expect(SKILLS.sweep.weaponType).toEqual(['hammer', 'axe']);
  });

  it('条目均携带 target 三值之一与 learnable 布尔', () => {
    for (const s of Object.values(SKILLS)) {
      expect(['enemy', 'self', 'ally']).toContain(s.target);
      expect(typeof s.learnable).toBe('boolean');
    }
  });

  it('声明的 weaponType 均为合法武器原子', () => {
    for (const s of Object.values(SKILLS)) {
      if (s.weaponType === undefined) continue;
      const reqs = Array.isArray(s.weaponType) ? s.weaponType : [s.weaponType];
      for (const w of reqs) expect(WEAPON_ATOMS).toContain(w);
    }
  });

  it('全技能与法术条目携带非空功能描述（战前 UI 展示）', () => {
    for (const s of Object.values(SKILLS)) {
      expect(s.desc, `技能 ${s.id} 缺 desc`).toBeTruthy();
    }
    for (const s of Object.values(SPELLS)) {
      expect(s.desc, `法术 ${s.id} 缺 desc`).toBeTruthy();
    }
  });
});

describe('R3-1 模板改造', () => {
  it('全部模板 skills id 可解析（SKILLS ∪ SPELLS，无悬空引用）', () => {
    for (const t of ALL_TEMPLATES) {
      for (const id of t.skills) {
        expect(resolveSkill(id)).toBeDefined();
      }
    }
  });

  it('getTemplateSkills 返回解析后的技能对象（含法术）', () => {
    const mage = PLAYER_TEMPLATES.find(t => t.id === 'mage')!;
    const resolved = getTemplateSkills(mage);
    expect(resolved.length).toBe(3);
    expect(resolved.every(s => typeof s.name === 'string')).toBe(true);
  });

  it('模板 basicAttack 字段已退役（R2-2：普攻数据源 = 武器条目普攻段，弓=远程由条目射程表达）', () => {
    for (const t of ALL_TEMPLATES) {
      expect('basicAttack' in t).toBe(false);
      expect(t.defaultEquipment.length).toBeGreaterThan(0);
    }
    const archer = PLAYER_TEMPLATES.find(t => t.id === 'archer')!;
    expect(basicAttackSkills(archer.defaultEquipment).every(s => s.rangeMin === 2)).toBe(true);
    const staff = PLAYER_TEMPLATES.find(t => t.id === 'mage')!;
    expect(basicAttackSkills(staff.defaultEquipment)[0].damageType).toBe('blunt');
  });

  it('reMove 字段已删除；再移动改为被动（骑士持有、飞马暂不持有）', () => {
    for (const t of ALL_TEMPLATES) {
      expect('reMove' in t).toBe(false);
    }
    expect(TRAIT_CONFIGS['re-move']).toBeDefined();
    const knight = PLAYER_TEMPLATES.find(t => t.id === 'knight')!;
    expect(knight.traits).toContain('re-move');
    const pegasus = PLAYER_TEMPLATES.find(t => t.id === 'pegasus')!;
    expect(pegasus.traits ?? []).toContain('re-move');
  });

  it('特性条目携带 learnable 标记（F2）', () => {
    for (const trait of Object.values(TRAIT_CONFIGS)) {
      expect(typeof trait.learnable).toBe('boolean');
    }
  });

  it('getSkill 按 id 取条目', () => {
    expect(getSkill('sweep')?.name).toBe('横扫');
    expect(getSkill('nonexistent')).toBeUndefined();
  });
});

describe('R3-2 普攻口径：基础攻击=固有能力', () => {
  it('普攻按装备条目合成（R2-2：弓远程、法杖近战钝伤；模板 basicAttack 字段退役）', () => {
    const archer = PLAYER_TEMPLATES.find(t => t.id === 'archer')!;
    const b = basicAttackSkills(archer.defaultEquipment)[0];
    expect(b.name).toBe('长弓·普攻');
    expect(b.target).toBe('enemy');
    expect(b.rangeMin).toBe(2);
    expect(b.rangeMax).toBe(2);

    const mage = PLAYER_TEMPLATES.find(t => t.id === 'mage')!;
    const bm = basicAttackSkills(mage.defaultEquipment)[0];
    expect(bm.damageType).toBe('blunt');
    expect(bm.rangeMin).toBe(1);
    expect(bm.rangeMax).toBe(1);
  });

  it('敌方三杂兵纯普攻（skills 为空）', () => {
    for (const id of ['swordsman', 'spearman', 'axeman_enemy']) {
      const t = ENEMY_TEMPLATES.find(x => x.id === id)!;
      expect(t.skills).toEqual([]);
    }
  });

  it('被普攻吸收的四技能不再被任何模板引用', () => {
    const gone = ['slash', 'thrust', 'heavyCleave', 'shoot'];
    for (const t of ALL_TEMPLATES) {
      for (const g of gone) expect(t.skills).not.toContain(g);
    }
  });
});

describe('R4-1 八维属性结构（终战档基线，GAME-DESIGN §5；R4-8 平衡定稿修订）', () => {
  const BASELINE: Array<[string, number, number, number, number, number, number, number, number]> = [
    // [templateId, HP, 力量, 魔力, 物防, 魔防, 速, 技, 运]
    ['lord', 52, 21, 0, 15, 9, 17, 19, 14],
    ['defender', 61, 19, 0, 25, 11, 12, 16, 10],
    ['paladin', 63, 28, 0, 26, 12, 10, 15, 9],
    ['thief', 46, 17, 0, 10, 10, 24, 23, 16],
    ['knight', 54, 22, 0, 17, 13, 17, 17, 12],
    ['pegasus', 49, 17, 0, 12, 15, 21, 18, 15],
    ['axeman', 58, 26, 0, 14, 8, 12, 15, 9],
    ['archer', 45, 19, 0, 11, 8, 15, 19, 12],
    ['priest', 46, 9, 21, 8, 17, 13, 16, 13],
    ['mage', 41, 14, 24, 8, 18, 14, 17, 11],
    ['swordsman', 39, 18, 0, 11, 5, 17, 16, 8],
    ['spearman', 38, 18, 0, 13, 5, 11, 13, 7],
    ['axeman_enemy', 43, 21, 0, 11, 5, 11, 12, 6],
    ['hammerman', 37, 21, 0, 14, 6, 10, 12, 6],
    ['archer_enemy', 36, 17, 0, 9, 5, 12, 15, 7],
    ['mage_enemy', 33, 15, 14, 7, 15, 12, 15, 7],
    ['boss', 72, 26, 0, 12, 8, 12, 16, 4]
  ];

  it('17 模板八维与旧字段全部落位（atk/def 字段已删除）', () => {
    for (const [id, hp, str, mag, pdef, mdef, spd, tec, lck] of BASELINE) {
      const t = ALL_TEMPLATES.find(x => x.id === id);
      expect(t, id).toBeDefined();
      expect(t!.hp).toBe(hp);
      expect(t!.str).toBe(str);
      expect(t!.mag).toBe(mag);
      expect(t!.pdef).toBe(pdef);
      expect(t!.mdef).toBe(mdef);
      expect(t!.spd).toBe(spd);
      expect(t!.tec).toBe(tec);
      expect(t!.lck).toBe(lck);
      expect('atk' in t!).toBe(false);
      expect('def' in t!).toBe(false);
    }
  });

  it('法系魔力驱动法术、物理系力量驱动普攻（消费点适配的行为锚）', () => {
    const mage = ALL_TEMPLATES.find(t => t.id === 'mage')!;
    const lord = ALL_TEMPLATES.find(t => t.id === 'lord')!;
    expect(mage.mag).toBeGreaterThan(lord.mag);
    expect(lord.str).toBeGreaterThan(mage.str);
  });
});

describe('R5-1 资源消耗声明', () => {
  it('cost 占位值锚：MP 六法术 15/35/25/12/20/20；怒气刺击 40/旋风斩 50；专注潜行 30（R5-3 定稿）', () => {
    expect(SPELLS.fireball.cost).toBe(15);
    expect(SPELLS.meteor.cost).toBe(35);
    expect(SPELLS.curse.cost).toBe(25);
    expect(SPELLS.heal.cost).toBe(12);
    expect(SPELLS.regen.cost).toBe(20);
    expect(SPELLS.mithrilShield.cost).toBe(20);
    expect(SKILLS.stab.cost).toBe(40);
    expect(SKILLS.whirlwind.cost).toBe(50);
    expect(SKILLS.stealth.cost).toBe(30);
  });

  it('声明 cost 必须声明 resourceType（归属可判）', () => {
    for (const s of Object.values(SKILLS)) {
      if (s.cost !== undefined) expect(s.resourceType, `skill ${s.id}`).toBeDefined();
    }
    for (const s of Object.values(SPELLS)) {
      if (s.cost !== undefined) expect(s.resourceType, `spell ${s.id}`).toBeDefined();
    }
  });

  it('法术声明 mp 归属：非 MP 职业装填被资源过滤拦截（F3）', () => {
    const lord = ALL_TEMPLATES.find(t => t.id === 'lord')!;
    const mage = ALL_TEMPLATES.find(t => t.id === 'mage')!;
    const fireballEntry = { id: 'fireball', name: '火球', kind: 'spell' as const, entry: SPELLS.fireball };
    expect(learnBlockReason(lord, lord.defaultEquipment, fireballEntry)).toBe('resource');
    expect(learnBlockReason(mage, mage.defaultEquipment, fireballEntry)).toBeNull();
  });
});
