import { describe, it, expect, beforeEach } from 'vitest';
import {
  enterStealth, cancelStealth, isStealthed, isVisibleTo, STEALTH_SKILL_NAME
} from '../../src/core/stealth';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { createMapState } from '../../src/core/map';
import { unitsInArea } from '../../src/core/area';
import { calcMovementRange } from '../../src/core/range';

describe('R3-8 潜行：绝对隐身与显形', () => {
  beforeEach(() => resetUnitCounter());

  function scene() {
    const thief = createUnitState('thief', 'player', { q: 5, r: 5 });
    const foe = createUnitState('swordsman', 'enemy', { q: 8, r: 5 });
    const archer = createUnitState('archer_enemy', 'enemy', { q: 6, r: 5 }, { active: [], passive: ['true-sight'] });
    return { thief, foe, archer };
  }

  it('enterStealth 挂潜行状态；cancelStealth 移除', () => {
    const { thief } = scene();
    expect(isStealthed(thief)).toBe(false);
    enterStealth(thief);
    expect(isStealthed(thief)).toBe(true);
    expect(thief.statuses.some(s => s.type === 'stealth' && s.skillName === STEALTH_SKILL_NAME)).toBe(true);
    cancelStealth(thief);
    expect(isStealthed(thief)).toBe(false);
  });

  it('无潜行恒可见；潜行后对敌方不可见', () => {
    const { thief, foe } = scene();
    const units = [thief, foe];
    expect(isVisibleTo(thief, 'enemy', units)).toBe(true);
    enterStealth(thief);
    expect(isVisibleTo(thief, 'enemy', units)).toBe(false);
  });

  it('潜行对我方自身阵营仍可见（规则对称的己方视角）', () => {
    const { thief, foe } = scene();
    enterStealth(thief);
    expect(isVisibleTo(thief, 'player', [thief, foe])).toBe(true);
  });

  it('真实视野显形：持有者周围 revealRange 格内对持有者阵营可见', () => {
    const { thief, archer, foe } = scene();
    enterStealth(thief);
    const units = [thief, archer, foe];
    expect(isVisibleTo(thief, 'enemy', units)).toBe(true); // 距弓手 1 ≤ 3
  });

  it('出范围自动重新隐匿；显形不破隐（状态保留）', () => {
    const { thief, archer, foe } = scene();
    enterStealth(thief);
    thief.position = { q: 12, r: 5 }; // 远离弓手（距离 6 > 3）
    const units = [thief, archer, foe];
    expect(isVisibleTo(thief, 'enemy', units)).toBe(false);
    expect(isStealthed(thief)).toBe(true); // 未被打破
  });

  it('reveal 只对持有者所在阵营生效（第三方阵营仍不可见）', () => {
    const { thief, foe } = scene();
    const allyHolder = createUnitState('lord', 'player', { q: 6, r: 5 });
    // 我方持真实视野的盟友不能让盗贼对我方"显形"语义变化，也不给敌方视野
    enterStealth(thief);
    expect(isVisibleTo(thief, 'enemy', [thief, foe, allyHolder])).toBe(false);
  });

  it('AoE 区域筛受影响者时排除潜行单位（不可见即不受 AoE）', () => {
    const { thief } = scene();
    const visibleAlly = createUnitState('lord', 'player', { q: 8, r: 5 });
    const caster = createUnitState('boss', 'enemy', { q: 5, r: 6 });
    enterStealth(thief);
    const cells = [{ q: 5, r: 5 }, { q: 8, r: 5 }];
    const targets = unitsInArea([thief, visibleAlly], cells, caster.faction);
    expect(targets.map(t => t.id)).toEqual([visibleAlly.id]);
  });

  it('潜行单位仍占格：不可经过、不可停留（移动范围绕行）', () => {
    const map = createMapState();
    const mover = createUnitState('swordsman', 'enemy', { q: 5, r: 5 });
    const hidden = createUnitState('thief', 'player', { q: 7, r: 5 });
    enterStealth(hidden);
    const range = calcMovementRange(map, [mover, hidden], mover.position, 5, false);
    expect(range.has(`${7},${5}`)).toBe(false);   // 不可停留
    // 途经阻挡：右侧远处格若必须穿过 (7,5) 直线则不可达——全平原下可绕行，断言 (9,5) 可达（绕行成功即占格生效）
    expect(range.has(`${9},${5}`)).toBe(true);
  });
});
