import { describe, it, expect, beforeEach } from 'vitest';
import { getUnitAt, createUnitState, resetUnitCounter } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';

describe('unit', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  describe('createUnitState', () => {
    it('从模板创建单位状态', () => {
      const unit = createUnitState('lord', 'player', { q: 5, r: 5 });
      expect(unit.id).toBe('player-1');
      expect(unit.templateId).toBe('lord');
      expect(unit.faction).toBe('player');
      expect(unit.position).toEqual({ q: 5, r: 5 });
      expect(unit.facing).toBe(1);
      expect(unit.hasActed).toBe(false);
    });

    it('ID 自动递增', () => {
      const u1 = createUnitState('lord', 'player', { q: 0, r: 0 });
      const u2 = createUnitState('knight', 'player', { q: 1, r: 1 });
      expect(u1.id).toBe('player-1');
      expect(u2.id).toBe('player-2');
    });

    it('HP 与 maxHp 取自模板', () => {
      const lord = createUnitState('lord', 'player', { q: 0, r: 0 });
      expect(lord.hp).toBe(26);
      expect(lord.maxHp).toBe(26);
      const boss = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      expect(boss.hp).toBe(40);
      expect(boss.maxHp).toBe(40);
    });
  });

  describe('getUnitAt', () => {
    it('返回指定位置的单位', () => {
      const units: UnitState[] = [
        {
          id: 'u1',
          templateId: 'lord',
          faction: 'player',
          position: { q: 3, r: 3 },
          facing: 0,
          hp: 26,
          maxHp: 26,
          hasActed: false
        },
        {
          id: 'u2',
          templateId: 'knight',
          faction: 'player',
          position: { q: 5, r: 5 },
          facing: 1,
          hp: 26,
          maxHp: 26,
          hasActed: false
        }
      ];
      expect(getUnitAt(units, { q: 3, r: 3 })).toBe(units[0]);
      expect(getUnitAt(units, { q: 5, r: 5 })).toBe(units[1]);
    });

    it('空位置返回 undefined', () => {
      const units: UnitState[] = [];
      expect(getUnitAt(units, { q: 3, r: 3 })).toBeUndefined();
    });

    it('按阵营筛选', () => {
      const units: UnitState[] = [
        {
          id: 'p1',
          templateId: 'lord',
          faction: 'player',
          position: { q: 3, r: 3 },
          facing: 0,
          hp: 26,
          maxHp: 26,
          hasActed: false
        },
        {
          id: 'e1',
          templateId: 'swordsman',
          faction: 'enemy',
          position: { q: 3, r: 3 },
          facing: 3,
          hp: 18,
          maxHp: 18,
          hasActed: false
        }
      ];
      expect(getUnitAt(units, { q: 3, r: 3 }, 'player')?.faction).toBe('player');
      expect(getUnitAt(units, { q: 3, r: 3 }, 'enemy')?.faction).toBe('enemy');
    });
  });
});
