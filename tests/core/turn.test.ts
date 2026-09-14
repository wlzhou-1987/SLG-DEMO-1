import { describe, it, expect, beforeEach } from 'vitest';
import { checkVictory, startPlayerPhase, applyTerrainRegen } from '../../src/core/turn';
import { createMapState } from '../../src/core/map';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import { TERRAIN_CONFIGS } from '../../src/config/terrain';

describe('turn', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  describe('checkVictory', () => {
    it('战斗进行中', () => {
      const units = [
        createUnitState('lord', 'player', { q: 10, r: 27 }),
        createUnitState('swordsman', 'enemy', { q: 10, r: 20 })
      ];
      expect(checkVictory(units)).toBe('ongoing');
    });

    it('敌方全灭 → 我方胜', () => {
      const units = [createUnitState('lord', 'player', { q: 10, r: 27 })];
      expect(checkVictory(units)).toBe('playerWin');
    });

    it('我方全灭 → 我方败', () => {
      const units = [createUnitState('swordsman', 'enemy', { q: 10, r: 20 })];
      expect(checkVictory(units)).toBe('playerLose');
    });

    it('领主阵亡（我方尚存）→ 我方败', () => {
      const units = [
        createUnitState('knight', 'player', { q: 10, r: 27 }),
        createUnitState('swordsman', 'enemy', { q: 10, r: 20 })
      ];
      expect(checkVictory(units)).toBe('playerLose');
    });
  });

  describe('startPlayerPhase（R6-1：只重置标记，回复归 applyTerrainRegen）', () => {
    it('重置 hasActed', () => {
      const units = [
        createUnitState('lord', 'player', { q: 10, r: 27 }),
        createUnitState('swordsman', 'enemy', { q: 10, r: 20 })
      ];
      units.forEach(u => { u.hasActed = true; });
      startPlayerPhase(units);
      expect(units.every(u => !u.hasActed)).toBe(true);
    });

    it('重置本回合已消耗移动力（§4.8 剩余移动力规则）', () => {
      const units = [createUnitState('knight', 'player', { q: 10, r: 27 })];
      units[0].moveSpent = 6;
      startPlayerPhase(units);
      expect(units[0].moveSpent).toBe(0);
    });

    it('不再回血：单位 HP 不变（行为锚，地形回复移 applyTerrainRegen）', () => {
      const u = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      u.hp = 30;
      startPlayerPhase([u]);
      expect(u.hp).toBe(30);
    });
  });

  describe('applyTerrainRegen（R6-1 地形回复数据驱动，§3）', () => {
    const baseMap = createMapState({ bases: [{ q: 10, r: 2 }, { q: 11, r: 2 }] });

    it('驻基地回复 10% 最大 HP（ceil、上限截断）', () => {
      const u = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      u.hp = 30;
      applyTerrainRegen([u], 'enemy', baseMap);
      expect(u.hp).toBe(30 + Math.ceil(u.maxHp / 10));  // ceil(maxHp×10%)
      u.hp = u.maxHp - 2;
      applyTerrainRegen([u], 'enemy', baseMap);
      expect(u.hp).toBe(u.maxHp);  // 不超过 maxHp
    });

    it('阵营过滤：只结算持有者阵营（敌方阶段不回我方）', () => {
      const priest = createUnitState('priest', 'player', { q: 10, r: 2 });
      const boss = createUnitState('boss', 'enemy', { q: 11, r: 2 });
      priest.hp = 10;
      boss.hp = 30;
      applyTerrainRegen([priest, boss], 'enemy', baseMap);
      expect(priest.hp).toBe(10);  // 我方不在敌方阶段回复
      expect(boss.hp).toBe(30 + Math.ceil(boss.maxHp / 10));
    });

    it('死亡单位跳过（hp 0 不回复）', () => {
      const u = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      u.hp = 0;
      applyTerrainRegen([u], 'enemy', baseMap);
      expect(u.hp).toBe(0);
    });

    it('无回复地形不生效：平原单位 HP 不变', () => {
      const u = createUnitState('lord', 'player', { q: 10, r: 27 });
      u.hp = 10;
      applyTerrainRegen([u], 'player', createMapState());
      expect(u.hp).toBe(10);
    });

    it('MP 回复：mpRegen 只入 MP 资源单位（怒气/专注不回，封顶上限）', () => {
      const saved = TERRAIN_CONFIGS.base.mpRegen;
      TERRAIN_CONFIGS.base.mpRegen = 10;
      try {
        const priest = createUnitState('priest', 'player', { q: 10, r: 2 });  // mp
        const knight = createUnitState('knight', 'player', { q: 11, r: 2 }); // rage
        priest.resources.current = 0;
        knight.resources.current = 0;
        applyTerrainRegen([priest, knight], 'player', baseMap);
        expect(priest.resources.current).toBe(10);
        expect(knight.resources.current).toBe(0);
        priest.resources.current = priest.resources.max - 3;
        applyTerrainRegen([priest], 'player', baseMap);
        expect(priest.resources.current).toBe(priest.resources.max);  // 封顶
      } finally {
        TERRAIN_CONFIGS.base.mpRegen = saved;
      }
    });
  });
});
