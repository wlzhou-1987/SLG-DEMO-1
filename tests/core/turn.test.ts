import { describe, it, expect, beforeEach } from 'vitest';
import { checkVictory, startPlayerPhase } from '../../src/core/turn';
import { createMapState } from '../../src/core/map';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';

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

  describe('startPlayerPhase', () => {
    it('重置 hasActed', () => {
      const units = [
        createUnitState('lord', 'player', { q: 10, r: 27 }),
        createUnitState('swordsman', 'enemy', { q: 10, r: 20 })
      ];
      units.forEach(u => { u.hasActed = true; });
      startPlayerPhase(units, createMapState());
      expect(units.every(u => !u.hasActed)).toBe(true);
    });

    it('重置本回合已消耗移动力（§4.8 剩余移动力规则）', () => {
      const units = [createUnitState('knight', 'player', { q: 10, r: 27 })];
      units[0].moveSpent = 6;
      startPlayerPhase(units, createMapState());
      expect(units[0].moveSpent).toBe(0);
    });

    it('驻基地单位回合开始回复 10% 最大 HP（上限截断）', () => {
      const map = createMapState({ bases: [{ q: 10, r: 2 }] });
      const u = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      u.hp = 30;
      startPlayerPhase([u], map);
      expect(u.hp).toBe(34); // 30 + ceil(34/10)
      u.hp = 33;
      startPlayerPhase([u], map);
      expect(u.hp).toBe(34); // 不超过 maxHp
    });

    it('不在基地的单位不回血', () => {
      const u = createUnitState('lord', 'player', { q: 10, r: 27 });
      u.hp = 10;
      startPlayerPhase([u], createMapState());
      expect(u.hp).toBe(10);
    });
  });
});
