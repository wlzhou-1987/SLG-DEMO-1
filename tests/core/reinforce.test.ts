import { describe, it, expect, beforeEach } from 'vitest';
import { checkReinforcements } from '../../src/core/reinforce';
import { REINFORCEMENTS } from '../../src/config/reinforcements';
import { createMapState } from '../../src/core/map';
import { MAP_OVERRIDES } from '../../src/config/map';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';
import { distance } from '../../src/core/hex';

describe('增援事件（§6）', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState(MAP_OVERRIDES);

  function bossUnit(): UnitState {
    const boss = createUnitState('boss', 'enemy', { q: 10, r: 2 });
    boss.groupId = 'bossGroup';
    boss.aiKind = 'boss';
    return boss;
  }

  it('配置：东西侧第 5 回合各 3 人、BOSS 组半血北端 4 锤兵，共 3 事件 10 人', () => {
    expect(REINFORCEMENTS).toHaveLength(3);
    const turnEvents = REINFORCEMENTS.filter(e => e.trigger.kind === 'turn');
    expect(turnEvents).toHaveLength(2);
    expect(REINFORCEMENTS.filter(e => e.trigger.kind === 'groupHpBelow')).toHaveLength(1);
    expect(REINFORCEMENTS.reduce((s, e) => s + e.units.length, 0)).toBe(10);

    const bossEvent = REINFORCEMENTS.find(e => e.trigger.kind === 'groupHpBelow')!;
    expect(bossEvent.units.every(u => u.templateId === 'hammerman')).toBe(true);
  });

  it('turn 触发：第 4 回合不刷，第 5 回合刷 6 人，之后不重复', () => {
    const fired = new Map<string, number>();
    const units: UnitState[] = [createUnitState('lord', 'player', { q: 10, r: 27 })];

    expect(checkReinforcements(map, 4, units, fired)).toHaveLength(0);
    const at5 = checkReinforcements(map, 5, units, fired);
    expect(at5).toHaveLength(6);
    expect(checkReinforcements(map, 6, units, fired)).toHaveLength(0);
  });

  it('登场单位属性：敌方、主动型、已激活、组归属', () => {
    const fired = new Map<string, number>();
    const units: UnitState[] = [createUnitState('lord', 'player', { q: 10, r: 27 })];
    const spawned = checkReinforcements(map, 5, units, fired);
    for (const u of spawned) {
      expect(u.faction).toBe('enemy');
      expect(u.aiKind).toBe('aggressive');
      expect(u.activated).toBe(true);
      expect(u.groupId).toBeDefined();
    }
    const groupIds = new Set(spawned.map(u => u.groupId));
    expect(groupIds.size).toBe(2);  // 东西各一组
  });

  it('groupHpBelow 触发：BOSS 组半血以下刷 4 锤兵', () => {
    const fired = new Map<string, number>();
    const boss = bossUnit();
    boss.hp = Math.ceil(boss.maxHp * 0.5) - 1;  // 严格低于 50%
    const units: UnitState[] = [boss, createUnitState('lord', 'player', { q: 10, r: 27 })];
    const spawned = checkReinforcements(map, 1, units, fired);
    expect(spawned).toHaveLength(4);
  });

  it('BOSS 恰好半血不触发；组全灭不触发', () => {
    const fired = new Map<string, number>();
    const half = bossUnit();
    half.hp = half.maxHp / 2;
    expect(checkReinforcements(map, 1, [half], fired)).toHaveLength(0);

    const dead = bossUnit();
    dead.hp = 0;
    expect(checkReinforcements(map, 1, [dead], fired)).toHaveLength(0);
  });

  it('刷新点被占回退到最近空格', () => {
    const fired = new Map<string, number>();
    // 占住西侧 3 个刷新点
    const units: UnitState[] = [
      createUnitState('lord', 'player', { q: 0, r: 16 }),
      createUnitState('knight', 'player', { q: 0, r: 17 }),
      createUnitState('mage', 'player', { q: 0, r: 18 })
    ];
    const spawned = checkReinforcements(map, 5, units, fired);
    expect(spawned).toHaveLength(6);
    // 被占点旁的单位落在邻近空格（距原刷新点 ≤1）
    const westPoints = [{ q: 0, r: 16 }, { q: 0, r: 17 }, { q: 0, r: 18 }];
    for (const u of spawned) {
      if (u.position.q > 5) continue;  // 只看西侧
      const near = westPoints.some(p => distance(u.position, p) <= 1);
      expect(near, `西侧增援 ${u.id} 落点 ${u.position.q},${u.position.r} 离刷新点过远`).toBe(true);
    }
  });

  it('登场位置互不重叠且在可通行格', () => {
    const fired = new Map<string, number>();
    const boss = bossUnit();
    boss.hp = 1;
    const units: UnitState[] = [boss, createUnitState('lord', 'player', { q: 10, r: 27 })];
    const spawned = checkReinforcements(map, 5, units, fired);  // turn×2 + boss 组 = 10 人
    expect(spawned).toHaveLength(10);
    const keys = new Set(spawned.map(u => `${u.position.q},${u.position.r}`));
    expect(keys.size).toBe(10);
  });
});
