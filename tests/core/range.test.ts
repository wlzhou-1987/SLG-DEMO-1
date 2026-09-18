import { describe, it, expect } from 'vitest';
import { createUnitState } from '../../src/core/unit';
import { calcMovementRange, calcAttackRange, calcMovementCosts, rebuildPath } from '../../src/core/range';
import { createMapState } from '../../src/core/map';
import { distance } from '../../src/core/hex';
import type { UnitState } from '../../src/core/unit';

describe('M6-4 calcMovementCosts（再移动剩余移动力 §4.8）', () => {
  const emptyUnits: UnitState[] = [];

  it('平原每格消耗 1，等于六边形距离', () => {
    const map = createMapState();
    const costs = calcMovementCosts(map, emptyUnits, { q: 10, r: 15 }, 5, false);
    expect(costs.get('10,15')).toBe(0);
    expect(costs.get('11,15')).toBe(1);
    expect(costs.get('10,14')).toBe(1);
    expect(costs.get('12,15')).toBe(2);
  });

  it('森林格消耗 2 计入路径', () => {
    const map = createMapState({ forests: [{ q: 11, r: 15 }] });
    const costs = calcMovementCosts(map, emptyUnits, { q: 10, r: 15 }, 5, false);
    expect(costs.get('11,15')).toBe(2);
    expect(costs.get('12,15')).toBe(3);
  });

  it('飞行途经被占格计入代价表（供已消耗移动力计算）', () => {
    const map = createMapState();
    const units: UnitState[] = [{
      id: 'u1',
      templateId: 'lord',
      faction: 'player',
      position: { q: 11, r: 15 },
      facing: 0,
      hp: 26,
      maxHp: 26,
      hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] },
          equipment: [],
          resources: { type: "rage", current: 0, max: 100 }
    }];
    const costs = calcMovementCosts(map, units, { q: 10, r: 15 }, 2, true);
    expect(costs.get('11,15')).toBe(1);  // 被占格：不可落但可途经
    expect(costs.get('12,15')).toBe(2);
  });
});

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
        hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] },
          equipment: [],
          resources: { type: "rage", current: 0, max: 100 }
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
        hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] },
          equipment: [],
          resources: { type: "rage", current: 0, max: 100 }
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
        hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] },
          equipment: [],
          resources: { type: "rage", current: 0, max: 100 }
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

describe('R3-9 封锁（强化防御姿态：敌方不可经过身边、仅可逐格挪入终点）', () => {
  it('防战姿态+fortify：邻格可作终点（逐格挪），但不可途经（后方格不可直线直达）', () => {
    const map = createMapState();
    const blocker = createUnitState('defender', 'player', { q: 5, r: 5 });
    blocker.statuses.push({ type: 'stance', skillName: '防御姿态', appliedAtTurn: 1, turnsLeft: -1, stanceId: 'defense' });
    const mover = createUnitState('swordsman', 'enemy', { q: 5, r: 6 }); // 防战正南
    const range = calcMovementRange(map, [blocker, mover], mover.position, 5, false);
    // 邻格（防战身边）可作为终点：mover 北侧邻 (5,5) 被防战占——用 (6,5)（防山东南=邻格）
    expect(range.has('6,5')).toBe(true);
    // 途经封锁：防线后方 (5,3)/(6,4) 若必须穿过防战邻格群则不可达或需大幅绕行——全平原 5 移动力下 (5,3) 距离 3 且必经封锁邻格（北向走廊被封锁）断言不可达
    expect(range.has('5,3')).toBe(false);
  });

  it('无姿态的防战不封锁（普通单位阻挡）', () => {
    const map = createMapState();
    const blocker = createUnitState('defender', 'player', { q: 5, r: 5 });
    const mover = createUnitState('swordsman', 'enemy', { q: 5, r: 6 });
    const range = calcMovementRange(map, [blocker, mover], mover.position, 5, false);
    expect(range.has('5,3')).toBe(true); // 可绕行（无封锁）
  });
});

describe('R9-2 rebuildPath（移动动效路径重建）', () => {
  it('全平原直线：返回起终点途经序列', () => {
    const map = createMapState();
    const path = rebuildPath(map, [], { q: 10, r: 15 }, { q: 13, r: 15 }, 5, false);
    expect(path).not.toBeNull();
    expect(path!.map(c => `${c.q},${c.r}`).join(';')).toBe('10,15;11,15;12,15;13,15');
  });

  it('绕开山脉：路径不含山格且每步相邻', () => {
    const map = createMapState({ mountains: [{ q: 11, r: 15 }] });
    const path = rebuildPath(map, [], { q: 10, r: 15 }, { q: 12, r: 15 }, 5, false)!;
    expect(path).not.toBeNull();
    const keys = path.map(c => `${c.q},${c.r}`);
    expect(keys[0]).toBe('10,15');
    expect(keys[keys.length - 1]).toBe('12,15');
    expect(keys).not.toContain('11,15');
    for (let i = 1; i < path.length; i++) {
      expect(distance(path[i - 1], path[i])).toBe(1);
    }
  });

  it('途经避开被占格（非飞行）', () => {
    const map = createMapState();
    const units = [createUnitState('swordsman', 'player', { q: 11, r: 15 })];
    const path = rebuildPath(map, units, { q: 10, r: 15 }, { q: 12, r: 15 }, 5, false)!;
    expect(path).not.toBeNull();
    expect(path.map(c => `${c.q},${c.r}`)).not.toContain('11,15');
  });

  it('不可达返回 null', () => {
    const map = createMapState();
    expect(rebuildPath(map, [], { q: 10, r: 15 }, { q: 12, r: 15 }, 1, false)).toBeNull();
  });

  it('移动者已在终点：须按出发点快照重建（终点被自身占位时不可达）', () => {
    const map = createMapState();
    const mover = createUnitState('swordsman', 'player', { q: 12, r: 15 });
    // 不快照（逻辑位置已在终点）：终点被自己占，非飞行不可进入 → null
    expect(rebuildPath(map, [mover], { q: 10, r: 15 }, { q: 12, r: 15 }, 5, false)).toBeNull();
    // game.ts 快照语义：视移动者仍在出发点 → 直线重建成功
    const snapshot = [{ ...mover, position: { q: 10, r: 15 } }];
    const path = rebuildPath(map, snapshot, { q: 10, r: 15 }, { q: 12, r: 15 }, 5, false)!;
    expect(path.map(c => `${c.q},${c.r}`).join(';')).toBe('10,15;11,15;12,15');
  });
});
