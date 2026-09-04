import { describe, it, expect } from 'vitest';
import { calcMovementRange, calcAttackRange } from '../../src/core/range';
import { createMapState } from '../../src/core/map';
import type { UnitState } from '../../src/core/unit';

describe('range', () => {
  const emptyUnits: UnitState[] = [];

  describe('calcMovementRange', () => {
    it('全平原移动范围 5', () => {
      const map = createMapState();
      const range = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 5, false);
      expect(range.size).toBeGreaterThan(0);
      expect(range.has('10,15')).toBe(true);
      // 全平原 movePoints=5 应该有 91 格（六边形面积公式 3r²+3r+1）
      expect(range.size).toBe(91);
    });

    it('森林消耗为 2，范围缩小', () => {
      const map = createMapState({
        forests: [{ q: 11, r: 15 }]
      });
      const range = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 5, false);
      // 森林消耗 2，总范围应小于全平原
      expect(range.size).toBeLessThan(91);
    });

    it('山脉阻挡地面单位', () => {
      const map = createMapState({
        mountains: [{ q: 11, r: 15 }]
      });
      const range = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 5, false);
      expect(range.has('11,15')).toBe(false);
    });

    it('飞行单位无视山脉', () => {
      const map = createMapState({
        mountains: [{ q: 11, r: 15 }]
      });
      const range = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 5, true);
      expect(range.has('11,15')).toBe(true);
    });

    it('有单位占据的格子不可通行（地面单位）', () => {
      const map = createMapState();
      const units: UnitState[] = [{
        id: 'u1',
        templateId: 'lord',
        faction: 'player',
        position: { q: 11, r: 15 },
        facing: 0,
        hp: 26,
        maxHp: 26,
        hasActed: false, statuses: [], activated: true
      }];
      const range = calcMovementRange(map, units, { q: 10, r: 15 }, 5, false);
      expect(range.has('11,15')).toBe(false);
    });

    it('飞行单位不可落在被占格', () => {
      const map = createMapState();
      const units: UnitState[] = [{
        id: 'u1',
        templateId: 'lord',
        faction: 'player',
        position: { q: 11, r: 15 },
        facing: 0,
        hp: 26,
        maxHp: 26,
        hasActed: false, statuses: [], activated: true
      }];
      const range = calcMovementRange(map, units, { q: 10, r: 15 }, 5, true);
      expect(range.has('11,15')).toBe(false);
    });

    it('飞行单位可飞越被占格继续扩展', () => {
      const map = createMapState();
      const units: UnitState[] = [{
        id: 'u1',
        templateId: 'lord',
        faction: 'player',
        position: { q: 11, r: 15 },
        facing: 0,
        hp: 26,
        maxHp: 26,
        hasActed: false, statuses: [], activated: true
      }];
      const range = calcMovementRange(map, units, { q: 10, r: 15 }, 2, true);
      // (11,15) 被占不可落，但可途经——(12,15) 消耗 2 仍可达
      expect(range.has('12,15')).toBe(true);
      expect(range.size).toBe(18); // 移动力 2 共 19 格，被占格从落点中剔除
    });

    it('移动力为 0 只返回起点', () => {
      const map = createMapState();
      const range = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 0, false);
      expect(range.size).toBe(1);
      expect(range.has('10,15')).toBe(true);
    });
  });

  describe('calcAttackRange', () => {
    it('近战射程 [1,1] 从移动范围扩展', () => {
      const map = createMapState();
      const moveRange = calcMovementRange(map, emptyUnits, { q: 10, r: 15 }, 5, false);
      const attackRange = calcAttackRange(moveRange, 1, 1);
      // 攻击范围是移动范围外圈的邻居，不包含移动范围本身
      expect(attackRange.size).toBeGreaterThan(0);
      // 起点本身不在攻击范围（射程最小为 1）
      expect(attackRange.has('10,15')).toBe(false);
    });

    it('远程射程 [2,2] 不包含相邻格', () => {
      const moveRange = new Set(['10,15']);
      const attackRange = calcAttackRange(moveRange, 2, 2);
      // 相邻格不应在攻击范围
      expect(attackRange.has('11,15')).toBe(false);
      expect(attackRange.has('10,16')).toBe(false);
      // 距离 2 的格应在攻击范围
      expect(attackRange.has('12,15')).toBe(true);
    });

    it('射程区间 [1,2] 包含相邻和距离 2', () => {
      const moveRange = new Set(['10,15']);
      const attackRange = calcAttackRange(moveRange, 1, 2);
      expect(attackRange.has('11,15')).toBe(true);
      expect(attackRange.has('12,15')).toBe(true);
      expect(attackRange.has('13,15')).toBe(false);
    });
  });
});
