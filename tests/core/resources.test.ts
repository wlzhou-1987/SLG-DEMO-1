import { describe, it, expect, beforeEach } from 'vitest';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { getTemplate, basicAttackSkill } from '../../src/config/units';
import { initResources, canAfford, payCost, refundCost } from '../../src/core/resources';
import { SPELLS } from '../../src/config/spells';
import { SKILLS } from '../../src/config/skills';
import { interruptChant } from '../../src/core/status';

describe('R5-1 资源槽与消耗结算', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  it('三资源初始化：怒气 0/100、专注满 100/100、MP 满 mag×5', () => {
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    expect(lord.resources).toEqual({ type: 'rage', current: 0, max: 100 });
    const thief = createUnitState('thief', 'player', { q: 10, r: 15 });
    expect(thief.resources).toEqual({ type: 'focus', current: 100, max: 100 });
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    expect(mage.resources).toEqual({ type: 'mp', current: 120, max: 120 });  // mag24×5
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    expect(priest.resources).toEqual({ type: 'mp', current: 105, max: 105 });  // mag21×5
    expect(initResources(getTemplate('mage_enemy')!)).toEqual({ type: 'mp', current: 70, max: 70 });  // mag14×5
  });

  it('扣费：即时施放前扣（火球 15、陨石 35）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    expect(payCost(mage, SPELLS.fireball)).toBe(true);
    expect(mage.resources.current).toBe(105);
    expect(payCost(mage, SPELLS.meteor)).toBe(true);
    expect(mage.resources.current).toBe(70);
  });

  it('不足拦截：canAfford false 且 payCost 拒扣不变化（MP 10 < 火球 15）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    mage.resources.current = 10;
    expect(canAfford(mage, SPELLS.fireball)).toBe(false);
    expect(payCost(mage, SPELLS.fireball)).toBe(false);
    expect(mage.resources.current).toBe(10);
  });

  it('全额返还：refundCost 恢复等量（怒气刺击 40，不超上限）', () => {
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    lord.resources.current = 60;
    payCost(lord, SKILLS.stab);
    expect(lord.resources.current).toBe(20);
    refundCost(lord, SKILLS.stab);
    expect(lord.resources.current).toBe(60);
  });

  it('咏唱打断全额返还：interruptChant 退还陨石 35', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    payCost(mage, SPELLS.meteor);
    expect(mage.resources.current).toBe(85);
    mage.statuses.push({
      type: 'chant', skillName: SPELLS.meteor.name, turnsLeft: 2, appliedAtTurn: 1,
      spell: SPELLS.meteor, targetId: foe.id
    });
    expect(interruptChant(mage)).toBe(true);
    expect(mage.resources.current).toBe(120);
  });

  it('免费锚：普攻与未声明 cost 的技能恒可用；怒 0 时刺击不可用（生成随 R5-2）', () => {
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    expect(canAfford(lord, basicAttackSkill(getTemplate('lord')!))).toBe(true);
    expect(canAfford(lord, SKILLS.stab)).toBe(false);  // 怒气 0 < 40
    const thief = createUnitState('thief', 'player', { q: 10, r: 15 });
    expect(canAfford(thief, SKILLS.stealth)).toBe(true);  // 专注 100 ≥ 30
  });
});
