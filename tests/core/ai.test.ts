import { describe, it, expect, beforeEach } from 'vitest';
import { decideEnemyAction, checkGroupActivation, provokeGroup } from '../../src/core/ai';
import { createMapState } from '../../src/core/map';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';
import { distance } from '../../src/core/hex';
import type { HexCoord } from '../../src/core/types';

describe('decideEnemyAction 占位 AI', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('射程可达时选择攻击而非纯移动', () => {
    const enemy = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const player = createUnitState('lord', 'player', { q: 10, r: 18 });
    const action = decideEnemyAction(map, [enemy, player], enemy);
    expect(action.skill).not.toBeNull();
    expect(action.target).toBe(player);
    const d = distance(action.dest, player.position);
    expect(d).toBe(1); // 近战贴脸
  });

  it('能击杀的组合优先', () => {
    const enemy = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const fullHp = createUnitState('lord', 'player', { q: 10, r: 18 });
    const nearDeath = createUnitState('swordsman', 'player', { q: 12, r: 15 });
    nearDeath.hp = 1;
    const action = decideEnemyAction(map, [enemy, fullHp, nearDeath], enemy);
    expect(action.target).toBe(nearDeath);
  });

  it('射程不可达时向最近我方移动', () => {
    const enemy = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const player = createUnitState('lord', 'player', { q: 10, r: 25 });
    const d0 = distance(enemy.position, player.position);
    const action = decideEnemyAction(map, [enemy, player], enemy);
    expect(action.skill).toBeNull();
    expect(distance(action.dest, player.position)).toBeLessThan(d0);
  });

  it('已贴脸时选择相邻落位攻击（部位择优）', () => {
    const enemy = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const player = createUnitState('lord', 'player', { q: 11, r: 15 });
    const action = decideEnemyAction(map, [enemy, player], enemy);
    expect(distance(action.dest, player.position)).toBe(1);
    expect(action.target).toBe(player);
  });

  it('同期望伤害目标中选反击更轻的（净收益择优）', () => {
    // 弓手打盗贼(无甲)与法师(无甲)期望伤害相同；盗贼反击够不着（净收益高），
    // 法师火球反击 3 点（净收益负）——应选盗贼
    const enemy = createUnitState('archer_enemy', 'enemy', { q: 10, r: 15 });
    const thief = createUnitState('thief', 'player', { q: 10, r: 17 });  // 距离 2，反击够不着
    const mage = createUnitState('mage', 'player', { q: 9, r: 17 });      // 距离 2，火球可反
    const action = decideEnemyAction(map, [enemy, thief, mage], enemy);
    expect(action.target).toBe(thief);
  });

  it('选择期望伤害最高的技能', () => {
    // BOSS 重锤(钝击)与横扫(挥砍)；目标轻甲时挥砍 ×1.25 > 钝击 ×0.75
    const enemy = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const target = createUnitState('lord', 'player', { q: 11, r: 15 });
    const action = decideEnemyAction(map, [enemy, target], enemy);
    expect(action.skill!.name).toBe('横扫');
  });
});

describe('组激活（§6）', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();  // 全平原：警戒半径 = 移动 + 射程

  function dormantEnemy(templateId: string, pos: HexCoord, groupId: string): UnitState {
    const u = createUnitState(templateId, 'enemy', pos);
    u.groupId = groupId;
    u.aiKind = 'dormant';
    u.activated = false;
    return u;
  }

  it('我方进入警戒范围（移动+射程覆盖）→ 全组激活', () => {
    // 剑士移动 5、射程 1 → 警戒半径 6；距离 6 恰在边界
    const a = dormantEnemy('swordsman', { q: 10, r: 15 }, 'g1');
    const b = dormantEnemy('swordsman', { q: 11, r: 15 }, 'g1');
    const player = createUnitState('lord', 'player', { q: 10, r: 21 });
    checkGroupActivation(map, [a, b, player]);
    expect(a.activated).toBe(true);
    expect(b.activated).toBe(true);
  });

  it('警戒范围外 → 不激活', () => {
    const a = dormantEnemy('swordsman', { q: 10, r: 15 }, 'g1');
    const player = createUnitState('lord', 'player', { q: 10, r: 22 });  // 距离 7
    checkGroupActivation(map, [a, player]);
    expect(a.activated).toBe(false);
  });

  it('组内任一成员警戒范围内即全组激活，他组不受波及', () => {
    const a = dormantEnemy('swordsman', { q: 10, r: 15 }, 'g1');
    // g2 成员距玩家 7（警戒半径 6 之外），但紧邻 g1——验证激活不越组传染
    const c = dormantEnemy('swordsman', { q: 11, r: 14 }, 'g2');
    const player = createUnitState('lord', 'player', { q: 10, r: 21 });
    checkGroupActivation(map, [a, c, player]);
    expect(a.activated).toBe(true);
    expect(c.activated).toBe(false);
  });

  it('被攻击时全组激活（打一个引来一组，含已亡目标）', () => {
    const a = dormantEnemy('swordsman', { q: 10, r: 15 }, 'g1');
    const b = dormantEnemy('swordsman', { q: 11, r: 15 }, 'g1');
    const c = dormantEnemy('swordsman', { q: 12, r: 15 }, 'g2');
    a.hp = 0;  // 被击杀的目标
    provokeGroup([a, b, c], a);
    expect(b.activated).toBe(true);
    expect(c.activated).toBe(false);
  });

  it('provokeGroup 对无 groupId 单位安全跳过', () => {
    const a = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    a.activated = false;
    provokeGroup([a], a);
    expect(a.activated).toBe(false);
  });
});

describe('BOSS 驻守与组集结（§6）', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  function groupEnemy(
    templateId: string, pos: HexCoord, groupId: string, aiKind: 'dormant' | 'aggressive' | 'boss'
  ): UnitState {
    const u = createUnitState(templateId, 'enemy', pos);
    u.groupId = groupId;
    u.aiKind = aiKind;
    return u;
  }

  it('BOSS 射程内有目标 → 原地攻击不移动', () => {
    const boss = groupEnemy('boss', { q: 10, r: 15 }, 'bossGroup', 'boss');
    const player = createUnitState('lord', 'player', { q: 11, r: 15 });
    const action = decideEnemyAction(map, [boss, player], boss);
    expect(action.skill).not.toBeNull();
    expect(action.dest).toEqual({ q: 10, r: 15 });
  });

  it('BOSS 射程外 → 原地驻守不攻击不移动', () => {
    const boss = groupEnemy('boss', { q: 10, r: 15 }, 'bossGroup', 'boss');
    const player = createUnitState('lord', 'player', { q: 10, r: 20 });  // 距离 5
    const action = decideEnemyAction(map, [boss, player], boss);
    expect(action.skill).toBeNull();
    expect(action.dest).toEqual({ q: 10, r: 15 });
  });

  it('同组单位向共享目标集结（距组质心最近的我方），非各选各的', () => {
    const a = groupEnemy('swordsman', { q: 10, r: 10 }, 'g1', 'aggressive');
    const b = groupEnemy('swordsman', { q: 10, r: 19 }, 'g1', 'aggressive');
    // 质心 (10,14.5)：南面目标距质心 12.5 < 北面 14.5 → 组共享目标=南；
    // 但 a 单独看北面更近（10 < 17）——集结应压向共享目标而非各选各的
    const north = createUnitState('lord', 'player', { q: 10, r: 0 });
    const south = createUnitState('mage', 'player', { q: 10, r: 27 });
    const units = [a, b, north, south];
    const actionA = decideEnemyAction(map, units, a);
    const actionB = decideEnemyAction(map, units, b);
    expect(actionA.skill).toBeNull();
    expect(actionB.skill).toBeNull();
    expect(distance(actionA.dest, south.position)).toBeLessThan(distance(a.position, south.position));
    expect(distance(actionB.dest, south.position)).toBeLessThan(distance(b.position, south.position));
  });
});
