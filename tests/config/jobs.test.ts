import { describe, it, expect } from 'vitest';
import { JOBS, getJob } from '../../src/config/jobs';
import type { JobConfig } from '../../src/config/jobs';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';
import { WEAPON_ATOMS, RESOURCE_TYPES } from '../../src/config/skills';

const ALL_TEMPLATES = [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES];
const jobOf = (id: string): JobConfig => {
  const j = getJob(id);
  if (!j) throw new Error(`缺少 JobConfig: ${id}`);
  return j;
};

describe('R2-4 JobConfig 实体化（17 条 1:1，模板即职业：id = 模板 id）', () => {
  it('JOBS 与 17 模板一一对应（键集相等）', () => {
    expect(ALL_TEMPLATES.length).toBe(17);
    expect(new Set(Object.keys(JOBS))).toEqual(new Set(ALL_TEMPLATES.map(t => t.id)));
  });

  it('装备类别非空且均为合法原子（语义原模板 weapons 迁入）', () => {
    for (const t of ALL_TEMPLATES) {
      const cls = jobOf(t.id).equipmentClass;
      expect(cls.length, `${t.id} 装备类别为空`).toBeGreaterThanOrEqual(1);
      for (const w of cls) expect(WEAPON_ATOMS).toContain(w);
    }
    expect(jobOf('defender').equipmentClass).toEqual(['sword', 'shield']);  // 复合类别迁移抽查
  });

  it('resourceType 为三枚举之一，且与 R8 归属一致（飞马=专注、敌方法师=MP）', () => {
    for (const t of ALL_TEMPLATES) {
      expect(RESOURCE_TYPES).toContain(jobOf(t.id).resourceType);
    }
    expect(jobOf('pegasus').resourceType).toBe('focus');
    expect(jobOf('mage_enemy').resourceType).toBe('mp');
  });

  it('defaultWeights 按线三条目 = 迁移前行为值（phys str×1 / mag mag×1 / heal mag×0.5），全职业共享常量', () => {
    const base: JobConfig['defaultWeights'] = { phys: { str: 1 }, mag: { mag: 1 }, heal: { mag: 0.5 } };
    for (const id of Object.keys(JOBS)) {
      expect(JOBS[id].defaultWeights, id).toEqual(base);
    }
  });

  it('模板过渡字段已删（weapons/resourceType 不在 UnitTemplate 上——防双真源，§4.1）', () => {
    for (const t of ALL_TEMPLATES) {
      expect('weapons' in t, `${t.id}.weapons 应删除`).toBe(false);
      expect('resourceType' in t, `${t.id}.resourceType 应删除`).toBe(false);
    }
  });
});
