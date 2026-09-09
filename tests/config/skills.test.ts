import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  getSkill,
  WEAPON_ATOMS,
  RESOURCE_TYPES
} from '../../src/config/skills';
import {
  PLAYER_TEMPLATES,
  ENEMY_TEMPLATES,
  getTemplateSkills,
  resolveSkill,
  basicAttackSkill
} from '../../src/config/units';
import { TRAIT_CONFIGS } from '../../src/config/traits';

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

  it('17 模板：weapons 非空且均为合法原子', () => {
    expect(ALL_TEMPLATES.length).toBe(17);
    for (const t of ALL_TEMPLATES) {
      expect(t.weapons.length).toBeGreaterThanOrEqual(1);
      for (const w of t.weapons) expect(WEAPON_ATOMS).toContain(w);
    }
  });

  it('17 模板：resourceType 为三枚举之一，且与 R8 归属一致（飞马=专注、敌方法师=MP）', () => {
    for (const t of ALL_TEMPLATES) {
      expect(RESOURCE_TYPES).toContain(t.resourceType);
    }
    const pegasus = PLAYER_TEMPLATES.find(t => t.id === 'pegasus')!;
    expect(pegasus.resourceType).toBe('focus');
    const enemyMage = ENEMY_TEMPLATES.find(t => t.id === 'mage_enemy')!;
    expect(enemyMage.resourceType).toBe('mp');
  });

  it('模板 basicAttack 结构完整（伤害线 + 射程区间，弓=远程）', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.basicAttack).toBeDefined();
      expect(['slashing', 'piercing', 'blunt', 'magic']).toContain(t.basicAttack.damageType);
      expect(t.basicAttack.rangeMin).toBeGreaterThanOrEqual(1);
      expect(t.basicAttack.rangeMax).toBeGreaterThanOrEqual(t.basicAttack.rangeMin);
    }
    const archer = PLAYER_TEMPLATES.find(t => t.id === 'archer')!;
    expect(archer.basicAttack.rangeMin).toBe(2);
    const staff = PLAYER_TEMPLATES.find(t => t.id === 'mage')!;
    expect(staff.basicAttack.damageType).toBe('blunt');
  });

  it('reMove 字段已删除；再移动改为被动（骑士持有、飞马暂不持有）', () => {
    for (const t of ALL_TEMPLATES) {
      expect('reMove' in t).toBe(false);
    }
    expect(TRAIT_CONFIGS['re-move']).toBeDefined();
    const knight = PLAYER_TEMPLATES.find(t => t.id === 'knight')!;
    expect(knight.traits).toContain('re-move');
    const pegasus = PLAYER_TEMPLATES.find(t => t.id === 'pegasus')!;
    expect(pegasus.traits ?? []).not.toContain('re-move');
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
  it('basicAttackSkill 由模板普攻数据合成（弓远程、法杖近战钝伤）', () => {
    const archer = PLAYER_TEMPLATES.find(t => t.id === 'archer')!;
    const b = basicAttackSkill(archer);
    expect(b.name).toBe('普攻');
    expect(b.target).toBe('enemy');
    expect(b.rangeMin).toBe(2);
    expect(b.rangeMax).toBe(2);

    const mage = PLAYER_TEMPLATES.find(t => t.id === 'mage')!;
    const bm = basicAttackSkill(mage);
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
