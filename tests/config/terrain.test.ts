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

  it('法术线定稿值（R6-2）：森林法闪 10（减半）/法防 0，基地法闪 20/法防 1', () => {
    expect(TERRAIN_CONFIGS.forest.mevasion).toBe(10);
    expect(TERRAIN_CONFIGS.forest.mdefense).toBe(0);
    expect(TERRAIN_CONFIGS.base.mevasion).toBe(20);
    expect(TERRAIN_CONFIGS.base.mdefense).toBe(1);
    expect(TERRAIN_CONFIGS.plain.mevasion).toBe(0);
    expect(TERRAIN_CONFIGS.plain.mdefense).toBe(0);
  });

  it('MP 回复定稿值（R6-2）：仅基地 10；额外射程全 0（留未来高地/塔类地形）', () => {
    expect(TERRAIN_CONFIGS.base.mpRegen).toBe(10);
    expect(TERRAIN_CONFIGS.plain.mpRegen).toBe(0);
    expect(TERRAIN_CONFIGS.forest.mpRegen).toBe(0);
    for (const cfg of Object.values(TERRAIN_CONFIGS)) {
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
