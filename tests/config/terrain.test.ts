import { describe, it, expect } from 'vitest';
import { TERRAIN_CONFIGS } from '../../src/config/terrain';

describe('R6-1 地形效果字段（显式平铺 7 字段）', () => {
  it('4 地形效果字段齐全（moveCost/物理防/法术防/物理闪避/法术闪避/HP 回复/MP 回复/额外射程）', () => {
    for (const cfg of Object.values(TERRAIN_CONFIGS)) {
      expect(cfg.moveCost).toBeDefined();
      expect(cfg.pdefense).toBeDefined();
      expect(cfg.mdefense).toBeDefined();
      expect(cfg.pevasion).toBeDefined();
      expect(cfg.mevasion).toBeDefined();
      expect(cfg.hpRegenPct).toBeDefined();
      expect(cfg.mpRegen).toBeDefined();
      expect(cfg.rangeBonus).toBeDefined();
    }
  });

  it('行为等价过渡锚：法术线初值沿用物理线现值（R6-2 落数值时移除本锚）', () => {
    for (const cfg of Object.values(TERRAIN_CONFIGS)) {
      expect(cfg.mevasion).toBe(cfg.pevasion);
      expect(cfg.mdefense).toBe(cfg.pdefense);
    }
  });

  it('行为等价过渡锚：MP 回复与额外射程全 0（R6-2 落数值时移除本锚）', () => {
    for (const cfg of Object.values(TERRAIN_CONFIGS)) {
      expect(cfg.mpRegen).toBe(0);
      expect(cfg.rangeBonus).toBe(0);
    }
  });

  it('基地 HP 回复 10%（现行值数值化）、其余地形不回', () => {
    expect(TERRAIN_CONFIGS.base.hpRegenPct).toBe(10);
    expect(TERRAIN_CONFIGS.plain.hpRegenPct).toBe(0);
    expect(TERRAIN_CONFIGS.forest.hpRegenPct).toBe(0);
  });

  it('现行值锚：森林物闪 20/物防 1、基地物闪 20/物防 2（§3 表）', () => {
    expect(TERRAIN_CONFIGS.forest.pevasion).toBe(20);
    expect(TERRAIN_CONFIGS.forest.pdefense).toBe(1);
    expect(TERRAIN_CONFIGS.base.pevasion).toBe(20);
    expect(TERRAIN_CONFIGS.base.pdefense).toBe(2);
    expect(TERRAIN_CONFIGS.plain.pevasion).toBe(0);
  });
});
