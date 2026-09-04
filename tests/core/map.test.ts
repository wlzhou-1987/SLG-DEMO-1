import { describe, it, expect } from 'vitest';
import { createMapState, getTerrain, isPassable, getMoveCost, MAP_WIDTH, MAP_HEIGHT } from '../../src/core/map';
import type { UnitState } from '../../src/core/unit';

describe('map', () => {
  describe('createMapState', () => {
    it('创建默认全平原地图', () => {
      const map = createMapState();
      expect(map.width).toBe(MAP_WIDTH);
      expect(map.height).toBe(MAP_HEIGHT);
    });
  });

  describe('getTerrain', () => {
    it('返回指定格子的地形类型', () => {
      const map = createMapState();
      // 默认全平原
      expect(getTerrain(map, { q: 0, r: 0 })).toBe('plain');
    });

    it('越界返回 undefined', () => {
      const map = createMapState();
      expect(getTerrain(map, { q: -1, r: 0 })).toBeUndefined();
      expect(getTerrain(map, { q: MAP_WIDTH, r: 0 })).toBeUndefined();
      expect(getTerrain(map, { q: 0, r: MAP_HEIGHT })).toBeUndefined();
    });
  });

  describe('isPassable', () => {
    it('平原可通行', () => {
      const map = createMapState();
      expect(isPassable(map, { q: 0, r: 0 }, false)).toBe(true);
    });

    it('山脉不可通行（地面单位）', () => {
      const map = createMapState({
        mountains: [{ q: 5, r: 5 }]
      });
      expect(isPassable(map, { q: 5, r: 5 }, false)).toBe(false);
    });

    it('山脉可通行（飞行单位）', () => {
      const map = createMapState({
        mountains: [{ q: 5, r: 5 }]
      });
      expect(isPassable(map, { q: 5, r: 5 }, true)).toBe(true);
    });

    it('有单位占据的格子不可通行', () => {
      const map = createMapState();
      const units: UnitState[] = [{
        id: 'u1',
        templateId: 'lord',
        faction: 'player',
        position: { q: 3, r: 3 },
        facing: 0,
        hp: 26,
        maxHp: 26,
        hasActed: false, statuses: [], activated: true, moveSpent: 0
      }];
      expect(isPassable(map, { q: 3, r: 3 }, false, units)).toBe(false);
    });

    it('飞行单位无视占据', () => {
      const map = createMapState();
      const units: UnitState[] = [{
        id: 'u1',
        templateId: 'lord',
        faction: 'player',
        position: { q: 3, r: 3 },
        facing: 0,
        hp: 26,
        maxHp: 26,
        hasActed: false, statuses: [], activated: true, moveSpent: 0
      }];
      expect(isPassable(map, { q: 3, r: 3 }, true, units)).toBe(true);
    });
  });

  describe('getMoveCost', () => {
    it('平原消耗为 1', () => {
      const map = createMapState();
      expect(getMoveCost(map, { q: 0, r: 0 }, false)).toBe(1);
    });

    it('森林消耗为 2', () => {
      const map = createMapState({
        forests: [{ q: 2, r: 2 }]
      });
      expect(getMoveCost(map, { q: 2, r: 2 }, false)).toBe(2);
    });

    it('山脉消耗为 Infinity（地面单位）', () => {
      const map = createMapState({
        mountains: [{ q: 5, r: 5 }]
      });
      expect(getMoveCost(map, { q: 5, r: 5 }, false)).toBe(Infinity);
    });

    it('飞行单位所有地形消耗为 1', () => {
      const map = createMapState({
        forests: [{ q: 2, r: 2 }],
        mountains: [{ q: 5, r: 5 }]
      });
      expect(getMoveCost(map, { q: 2, r: 2 }, true)).toBe(1);
      expect(getMoveCost(map, { q: 5, r: 5 }, true)).toBe(1);
    });

    it('基地消耗为 1', () => {
      const map = createMapState({
        bases: [{ q: 10, r: 15 }]
      });
      expect(getMoveCost(map, { q: 10, r: 15 }, false)).toBe(1);
    });
  });
});
