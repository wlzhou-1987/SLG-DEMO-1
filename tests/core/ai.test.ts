import { describe, it, expect, beforeEach } from 'vitest';
import { decideEnemyAction } from '../../src/core/ai';
import { createMapState } from '../../src/core/map';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import { distance } from '../../src/core/hex';

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
