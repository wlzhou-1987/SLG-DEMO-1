import { describe, it, expect } from 'vitest';
import { getPool, canLearn, learnBlockReason } from '../../src/config/pool';
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

describe('R3-4 canLearn：双过滤', () => {
  const lord = getTemplate('lord')!;        // 剑·怒气
  const defender = getTemplate('defender')!; // 剑盾·怒气
  const thief = getTemplate('thief')!;      // 匕首·专注
  const axeman = getTemplate('axeman')!;    // 斧·怒气
  const mage = getTemplate('mage')!;        // 法杖·MP

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

  it('武器过滤·单值：盾突需要盾——防战可学、盗贼不可', () => {
    // 盾突不在池中，用同 weaponType 字面量验证规则；池内真实条目走 snipe/sweep
    const shieldSkill = literalSkill({ weaponType: 'shield' });
    expect(canLearn(defender, shieldSkill)).toBe(true);
    expect(learnBlockReason(thief, shieldSkill)).toBe('weapon');
  });

  it('武器过滤·one-of：横扫（锤/斧）——斧兵可学、领主不可', () => {
    const sweep = entryOf('sweep');
    expect(canLearn(axeman, sweep)).toBe(true);
    expect(learnBlockReason(lord, sweep)).toBe('weapon');
  });

  it('武器过滤·弓：狙击——弓箭可学、骑士（枪）不可', () => {
    const snipe = entryOf('snipe');
    const archer = getTemplate('archer')!;
    const knight = getTemplate('knight')!;
    expect(canLearn(archer, snipe)).toBe(true);
    expect(learnBlockReason(knight, snipe)).toBe('weapon');
  });

  it('资源过滤·仅主动：声明 resourceType 的主动技能受主资源约束', () => {
    const fireMp = literalSkill({ resourceType: 'mp' });
    expect(canLearn(mage, fireMp)).toBe(true);
    expect(learnBlockReason(lord, fireMp)).toBe('resource');
  });

  it('资源过滤·未声明豁免：无 resourceType 的主动技能任何职业可学', () => {
    const noRes = literalSkill({});
    for (const t of [lord, thief, mage, getTemplate('boss')!]) {
      expect(canLearn(t, noRes)).toBe(true);
    }
  });

  it('被动免资源过滤：被动条目无资源维度约束', () => {
    // 现行 learnable 被动为空——用字面量走规则路径（trait 声明 weaponType 时仍受武器过滤）
    const traitEntry: PoolEntry = {
      id: 'test-trait', name: '测试被动', kind: 'trait',
      entry: { id: 'test-trait', name: '测试被动', desc: '', learnable: true }
    };
    for (const t of [lord, thief, mage]) {
      expect(canLearn(t, traitEntry)).toBe(true);
    }
  });

  it('法术默认免武器声明：火球无武器要求——近战职业也可学（法系互学接受）', () => {
    const fireball = entryOf('fireball');
    expect(canLearn(lord, fireball)).toBe(true);
    expect(canLearn(axeman, fireball)).toBe(true);
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
    expect(canLearn(mage, staffOnlySpell)).toBe(true);
    expect(learnBlockReason(lord, staffOnlySpell)).toBe('weapon');
  });
});
