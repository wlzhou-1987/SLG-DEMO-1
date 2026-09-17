import { describe, it, expect } from 'vitest';
import { getPool, canLearn, learnBlockReason, validateLoadoutForTemplate } from '../../src/config/pool';
import type { PoolEntry } from '../../src/config/pool';
import { SKILLS } from '../../src/config/skills';
import type { SkillTemplate } from '../../src/config/skills';
import { SPELLS } from '../../src/config/spells';
import { TRAIT_CONFIGS } from '../../src/config/traits';
import { getTemplate } from '../../src/config/units';

describe('R3-4 getPool：三表 learnable 条目 union', () => {
  it('池 = SKILLS ∪ SPELLS ∪ TRAIT_CONFIGS 的 learnable 条目', () => {
    const pool = getPool();
    const expectIds = new Set([
      ...Object.values(SKILLS).filter(s => s.learnable).map(s => s.id),
      ...Object.values(SPELLS).filter(s => s.learnable).map(s => s.id),
      ...Object.values(TRAIT_CONFIGS).filter(t => t.learnable).map(t => t.id)
    ]);
    expect(new Set(pool.map(e => e.id))).toEqual(expectIds);
  });

  it('池条目携带 kind 标签与名称（供 UI 混排显示）', () => {
    const pool = getPool();
    expect(pool.every(e => ['skill', 'spell', 'trait'].includes(e.kind))).toBe(true);
    expect(pool.every(e => e.name.length > 0)).toBe(true);
    expect(pool.find(e => e.id === 'fireball')?.kind).toBe('spell');
    expect(pool.find(e => e.id === 'warHammer')?.kind).toBe('skill');
  });

  it('非 learnable 条目不入池（盾突/背刺等出厂绑定项）', () => {
    const pool = getPool();
    expect(pool.some(e => e.id === 'shieldThrust')).toBe(false);
    expect(pool.some(e => e.id === 'backstab')).toBe(false);
  });
});

const entryOf = (id: string): PoolEntry => {
  const e = getPool().find(p => p.id === id);
  if (!e) throw new Error(`池中不存在: ${id}`);
  return e;
};
const literalSkill = (s: Partial<SkillTemplate>): PoolEntry => ({
  id: 'test', name: '测试', kind: 'skill',
  entry: {
    id: 'test', name: '测试', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: true, ...s
  } as SkillTemplate
});

describe('R3-4 canLearn：双过滤', () => {
  const lord = getTemplate('lord')!;        // 剑·怒气
  const defender = getTemplate('defender')!; // 剑盾·怒气
  const thief = getTemplate('thief')!;      // 匕首·专注
  const axeman = getTemplate('axeman')!;    // 斧·怒气
  const mage = getTemplate('mage')!;        // 法杖·MP

  it('武器过滤·单值：盾突需要盾——防战可学、盗贼不可', () => {
    // 盾突不在池中，用同 weaponType 字面量验证规则；池内真实条目走 snipe/sweep
    const shieldSkill = literalSkill({ weaponType: 'shield' });
    expect(canLearn(defender, defender.defaultEquipment, shieldSkill)).toBe(true);
    expect(learnBlockReason(thief, thief.defaultEquipment, shieldSkill)).toBe('weapon');
  });

  it('武器过滤·one-of：横扫（锤/斧）——斧兵可学、领主不可', () => {
    const sweep = entryOf('sweep');
    expect(canLearn(axeman, axeman.defaultEquipment, sweep)).toBe(true);
    expect(learnBlockReason(lord, lord.defaultEquipment, sweep)).toBe('weapon');
  });

  it('武器过滤·弓：狙击——弓箭可学、骑士（枪）不可', () => {
    const snipe = entryOf('snipe');
    const archer = getTemplate('archer')!;
    const knight = getTemplate('knight')!;
    expect(canLearn(archer, archer.defaultEquipment, snipe)).toBe(true);
    expect(learnBlockReason(knight, knight.defaultEquipment, snipe)).toBe('weapon');
  });

  it('资源过滤·仅主动：声明 resourceType 的主动技能受主资源约束', () => {
    const fireMp = literalSkill({ resourceType: 'mp' });
    expect(canLearn(mage, mage.defaultEquipment, fireMp)).toBe(true);
    expect(learnBlockReason(lord, lord.defaultEquipment, fireMp)).toBe('resource');
  });

  it('资源过滤·未声明豁免：无 resourceType 的主动技能任何职业可学', () => {
    const noRes = literalSkill({});
    for (const t of [lord, thief, mage, getTemplate('boss')!]) {
      expect(canLearn(t, t.defaultEquipment, noRes)).toBe(true);
    }
  });

  it('被动免资源过滤：被动条目无资源维度约束', () => {
    // 现行 learnable 被动为空——用字面量走规则路径（trait 声明 weaponType 时仍受武器过滤）
    const traitEntry: PoolEntry = {
      id: 'test-trait', name: '测试被动', kind: 'trait',
      entry: { id: 'test-trait', name: '测试被动', desc: '', learnable: true }
    };
    for (const t of [lord, thief, mage]) {
      expect(canLearn(t, t.defaultEquipment, traitEntry)).toBe(true);
    }
  });

  it('R5-1 法术声明 mp 归属：非 MP 职业不可学（R3-4「法系互学」旧口径随 §4.13 作废）', () => {
    const fireball = entryOf('fireball');
    expect(canLearn(lord, lord.defaultEquipment, fireball)).toBe(false);
    expect(canLearn(axeman, axeman.defaultEquipment, fireball)).toBe(false);
    expect(canLearn(mage, mage.defaultEquipment, fireball)).toBe(true);
  });

  it('法术按技能差异化声明武器时受过滤（声明即过滤对法术同样生效）', () => {
    const staffOnlySpell: PoolEntry = {
      id: 'test-spell', name: '测试法术', kind: 'spell',
      entry: {
        id: 'test-spell', name: '测试法术', target: 'enemy', learnable: true,
        damageType: 'magic', rangeMin: 1, rangeMax: 2,
        power: 0, castMode: 'instant', effectMode: 'instant', targetType: 'enemy',
        weaponType: 'staff'
      } as never
    };
    expect(canLearn(mage, mage.defaultEquipment, staffOnlySpell)).toBe(true);
    expect(learnBlockReason(lord, lord.defaultEquipment, staffOnlySpell)).toBe('weapon');
  });
});

describe('R2-3 武器过滤改读装备原子并集', () => {
  const defender = getTemplate('defender')!;  // 类别 [sword, shield]，默认装备 [longsword, ironShield]

  it('装备驱动：卸盾后盾技被过滤（默认双槽可学）', () => {
    const shieldSkill = literalSkill({ weaponType: 'shield' });
    expect(learnBlockReason(defender, defender.defaultEquipment, shieldSkill)).toBeNull();
    expect(learnBlockReason(defender, ['longsword'], shieldSkill)).toBe('weapon');
  });

  it('同原子跨线不扩并集：长剑+刺剑均为剑，横扫（锤/斧）仍不可学', () => {
    const lord = getTemplate('lord')!;
    const sweep = entryOf('sweep');
    expect(learnBlockReason(lord, lord.defaultEquipment, sweep)).toBe('weapon');
  });

  it('敌方关卡装备覆盖同源校验：validateLoadoutForTemplate 按覆盖装备判武器', () => {
    expect(validateLoadoutForTemplate(defender, { active: ['shieldThrust'], passive: [] })).toEqual([]);
    expect(validateLoadoutForTemplate(defender, { active: ['shieldThrust'], passive: [] }, ['longsword']))
      .toEqual([expect.stringContaining('武器不符')]);
  });
});
