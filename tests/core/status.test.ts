import { describe, it, expect, beforeEach } from 'vitest';
import { resolveArmor, tickStatuses, interruptChant } from '../../src/core/status';
import type { ActiveStatus } from '../../src/core/status';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { getTemplate } from '../../src/config/units';
import { SPELLS } from '../../src/config/spells';

function withStatuses(unit: ReturnType<typeof createUnitState>, statuses: ActiveStatus[]) {
  unit.statuses = statuses;
  return unit;
}

const shield = (turn: number, absorb = 10, armor: 'light' | 'medium' | 'heavy' = 'medium') =>
  ({ type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: turn, armorType: armor, absorbLeft: absorb }) as ActiveStatus;

describe('resolveArmor 护甲覆盖', () => {
  beforeEach(() => resetUnitCounter());

  it('无状态时回落兵种基础护甲', () => {
    const lord = createUnitState('lord', 'player', { q: 5, r: 5 });
    const resolved = resolveArmor(lord, getTemplate('lord')!);
    expect(resolved.armor).toBe('light');
    expect(resolved.shield).toBeUndefined();
  });

  it('护盾覆盖护甲类型', () => {
    const lord = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [shield(1)]);
    const resolved = resolveArmor(lord, getTemplate('lord')!);
    expect(resolved.armor).toBe('medium');
    expect(resolved.shield?.absorbLeft).toBe(10);
  });

  it('多个护盾时最新生效覆盖', () => {
    const lord = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [
      shield(1, 10, 'heavy'),
      shield(2, 6, 'light')
    ]);
    const resolved = resolveArmor(lord, getTemplate('lord')!);
    expect(resolved.armor).toBe('light');
    expect(resolved.shield?.absorbLeft).toBe(6);
  });
});

describe('tickStatuses 阶段推进', () => {
  beforeEach(() => resetUnitCounter());

  it('再生：回血并递减，到期移除', () => {
    const u = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [
      { type: 'regen', skillName: '再生术', turnsLeft: 2, appliedAtTurn: 1, healPerTurn: 5 }
    ]);
    u.hp = 20;
    const events = tickStatuses([u], 'player');
    expect(u.hp).toBe(25);
    expect(events.some(e => e.kind === 'regenTick' && e.healed === 5)).toBe(true);
    expect(u.statuses).toHaveLength(1);
    expect(u.statuses[0].turnsLeft).toBe(1);
    tickStatuses([u], 'player');
    expect(u.hp).toBe(26);  // 上限截断
    expect(u.statuses).toHaveLength(0);  // 到期移除
  });

  it('再生不超过最大 HP', () => {
    const u = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [
      { type: 'regen', skillName: '再生术', turnsLeft: 1, appliedAtTurn: 1, healPerTurn: 5 }
    ]);
    u.hp = 25;
    tickStatuses([u], 'player');
    expect(u.hp).toBe(26);  // maxHp 26
  });

  it('咒杀：归零结算伤害', () => {
    const enemy = withStatuses(createUnitState('swordsman', 'enemy', { q: 5, r: 5 }), [
      { type: 'delayed', skillName: '咒杀', turnsLeft: 1, appliedAtTurn: 1, damage: 10 }
    ]);
    const events = tickStatuses([enemy], 'enemy');
    expect(enemy.hp).toBe(18 - 10);
    expect(enemy.statuses).toHaveLength(0);
    expect(events.some(e => e.kind === 'delayedFire')).toBe(true);
  });

  it('咒杀未归零：只递减不结算', () => {
    const enemy = withStatuses(createUnitState('swordsman', 'enemy', { q: 5, r: 5 }), [
      { type: 'delayed', skillName: '咒杀', turnsLeft: 3, appliedAtTurn: 1, damage: 10 }
    ]);
    tickStatuses([enemy], 'enemy');
    expect(enemy.hp).toBe(18);
    expect(enemy.statuses[0].turnsLeft).toBe(2);
  });

  it('护盾：到期移除', () => {
    const u = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [shield(1, 10)]);
    u.statuses[0].turnsLeft = 1;
    tickStatuses([u], 'player');
    expect(u.statuses).toHaveLength(0);
  });

  it('咏唱：归零返回触发事件', () => {
    const mage = createUnitState('mage', 'player', { q: 5, r: 5 });
    const target = createUnitState('swordsman', 'enemy', { q: 6, r: 5 });
    mage.statuses = [{
      type: 'chant', skillName: '陨石术', turnsLeft: 1, appliedAtTurn: 1,
      spell: SPELLS.meteor, targetId: target.id
    }];
    const events = tickStatuses([mage, target], 'player');
    expect(mage.statuses).toHaveLength(0);
    const fire = events.find(e => e.kind === 'chantFire');
    expect(fire).toBeDefined();
  });

  it('只推进指定阵营单位的状态', () => {
    const player = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [
      { type: 'regen', skillName: '再生术', turnsLeft: 1, appliedAtTurn: 1, healPerTurn: 5 }
    ]);
    const enemy = withStatuses(createUnitState('swordsman', 'enemy', { q: 6, r: 5 }), [
      { type: 'regen', skillName: '再生术', turnsLeft: 1, appliedAtTurn: 1, healPerTurn: 5 }
    ]);
    player.hp = 20;
    enemy.hp = 10;
    tickStatuses([player, enemy], 'player');
    expect(player.hp).toBe(25);
    expect(enemy.hp).toBe(10);  // 敌方未到阶段
    expect(enemy.statuses).toHaveLength(1);
  });
});

describe('interruptChant 咏唱打断', () => {
  beforeEach(() => resetUnitCounter());

  it('有咏唱时打断并返回 true', () => {
    const mage = createUnitState('mage', 'player', { q: 5, r: 5 });
    mage.statuses = [{
      type: 'chant', skillName: '陨石术', turnsLeft: 2, appliedAtTurn: 1,
      spell: SPELLS.meteor, targetId: 'enemy-1'
    }];
    expect(interruptChant(mage)).toBe(true);
    expect(mage.statuses).toHaveLength(0);
  });

  it('无咏唱返回 false', () => {
    const mage = createUnitState('mage', 'player', { q: 5, r: 5 });
    expect(interruptChant(mage)).toBe(false);
  });
});
