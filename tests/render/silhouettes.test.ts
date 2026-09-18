import { describe, it, expect } from 'vitest';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';
import {
  SILHOUETTE_MAP,
  SILHOUETTE_SHAPES,
  SHAPE_IDS,
  SILHOUETTE_FALLBACK,
  getShapeId,
  BOSS_SHAPE,
} from '../../src/render/silhouettes';

describe('R9-1 剪影映射完整性', () => {
  const all = [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES];

  it('17 模板全部有形状映射且形状已定义', () => {
    expect(all).toHaveLength(17);
    for (const t of all) {
      const shape = getShapeId(t.id);
      expect(SHAPE_IDS, `模板 ${t.id}`).toContain(shape);
      expect(typeof SILHOUETTE_SHAPES[shape]).toBe('function');
    }
  });

  it('未知模板回退通用剑士形', () => {
    expect(getShapeId('nonexistent-template')).toBe(SILHOUETTE_FALLBACK);
    expect(SILHOUETTE_FALLBACK).toBe('swordsman');
    expect(SHAPE_IDS).toContain(SILHOUETTE_FALLBACK);
  });

  it('形状集 14 个；敌我斧/弓/法共用同形（设计定稿回归）', () => {
    expect(SHAPE_IDS).toHaveLength(14);
    expect(SILHOUETTE_MAP['axeman_enemy']).toBe('axeman');
    expect(SILHOUETTE_MAP['archer_enemy']).toBe('archer');
    expect(SILHOUETTE_MAP['mage_enemy']).toBe('mage');
  });

  it('BOSS 独占形存在', () => {
    expect(BOSS_SHAPE).toBe('boss');
    expect(SILHOUETTE_MAP['boss']).toBe(BOSS_SHAPE);
  });
});
