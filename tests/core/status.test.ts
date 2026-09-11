import { describe, it, expect, beforeEach } from 'vitest';
import { resolveArmor, tickStatuses, interruptChant, refreshAuras } from '../../src/core/status';
import { calcBattleForecast } from '../../src/core/combat';
import { basicAttackSkill } from '../../src/config/units';
import { SKILLS } from '../../src/config/skills';
import type { ActiveStatus } from '../../src/core/status';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { getTemplate } from '../../src/config/units';
import { SPELLS } from '../../src/config/spells';
import { createMapState } from '../../src/core/map';
import { resolveSkillSubs, resolveShout } from '../../src/core/effects';

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
    expect(u.hp).toBe(30);
    expect(u.statuses).toHaveLength(0);
  });

  it('再生不超过最大 HP', () => {
    const u = withStatuses(createUnitState('lord', 'player', { q: 5, r: 5 }), [
      { type: 'regen', skillName: '再生术', turnsLeft: 1, appliedAtTurn: 1, healPerTurn: 5 }
    ]);
    u.hp = 50;
    tickStatuses([u], 'player');
    expect(u.hp).toBe(52);  // maxHp 29
  });

  it('咒杀：归零结算伤害', () => {
    const enemy = withStatuses(createUnitState('swordsman', 'enemy', { q: 5, r: 5 }), [
      { type: 'delayed', skillName: '咒杀', turnsLeft: 1, appliedAtTurn: 1, damage: 10 }
    ]);
    const events = tickStatuses([enemy], 'enemy');
    expect(enemy.hp).toBe(36 - 10);
    expect(enemy.statuses).toHaveLength(0);
    expect(events.some(e => e.kind === 'delayedFire')).toBe(true);
  });

  it('咒杀未归零：只递减不结算', () => {
    const enemy = withStatuses(createUnitState('swordsman', 'enemy', { q: 5, r: 5 }), [
      { type: 'delayed', skillName: '咒杀', turnsLeft: 3, appliedAtTurn: 1, damage: 10 }
    ]);
    tickStatuses([enemy], 'enemy');
    expect(enemy.hp).toBe(36);
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

describe('R3-9 状态与增益', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('BuffStatus 衰减：tick 每回合 amount-decay，归零移除（祝福 3→2→1→移除）', () => {
    const paladin = createUnitState('paladin', 'player', { q: 5, r: 5 });
    paladin.statuses.push({
      type: 'buff', skillName: '祝福', appliedAtTurn: 1,
      turnsLeft: 5, stat: 'mdef', amount: 3, decay: 1
    });
    tickStatuses([paladin], 'player');
    const b1 = paladin.statuses.find(s => s.type === 'buff');
    expect((b1 as { amount: number })?.amount).toBe(2);
    tickStatuses([paladin], 'player');
    expect((paladin.statuses.find(s => s.type === 'buff') as { amount: number })?.amount).toBe(1);
    tickStatuses([paladin], 'player');
    expect(paladin.statuses.some(s => s.type === 'buff')).toBe(false);
  });

  it('强化祝福：buff tick 时持有 trait 者回 HP 并暂存怒气计数', () => {
    const paladin = createUnitState('paladin', 'player', { q: 5, r: 5 });
    paladin.hp = 10;
    paladin.statuses.push({
      type: 'buff', skillName: '祝福', appliedAtTurn: 1,
      turnsLeft: 5, stat: 'mdef', amount: 3, decay: 1
    });
    tickStatuses([paladin], 'player');
    expect(paladin.hp).toBeGreaterThan(10);
    expect(paladin.pendingResources?.rage).toBeGreaterThan(0);
  });

  it('光环：领主（aura）范围内友军获 atk 增益，范围外无；刷新不叠加', () => {
    const lord = createUnitState('lord', 'player', { q: 5, r: 5 });
    const near = createUnitState('knight', 'player', { q: 6, r: 5 });   // 距 1
    const far = createUnitState('mage', 'player', { q: 15, r: 5 });     // 距 10
    const units = [lord, near, far];
    refreshAuras(units, 'player');
    const auraBuff = (u: ReturnType<typeof createUnitState>) =>
      u.statuses.find(s => s.type === 'buff' && (s as { source?: string }).source === 'aura');
    expect(auraBuff(near)).toBeDefined();
    expect((auraBuff(near) as unknown as { amount: number }).amount).toBeGreaterThan(0);
    expect(auraBuff(far)).toBeUndefined();
    // 二次 tick 刷新不叠加
    refreshAuras(units, 'player');
    expect(near.statuses.filter(s => s.type === 'buff' && (s as { source?: string }).source === 'aura')).toHaveLength(1);
  });

  it('姿态：stance 状态挂载后 statValue 防御加成进入战斗计算', () => {
    const defender = createUnitState('lord', 'player', { q: 5, r: 5 });
    defender.statuses.push({ type: 'stance', skillName: '防御姿态', appliedAtTurn: 1, turnsLeft: -1, stanceId: 'defense' });
    const attacker = createUnitState('boss', 'enemy', { q: 6, r: 5 });
    // 无姿态预报
    const plain = calcBattleForecast(map, attacker, { ...defender, statuses: [] }, basicAttackSkill(getTemplate('boss')!));
    const withStance = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('boss')!));
    expect(withStance.attacker.damage).toBeLessThan(plain.attacker.damage);
  });

  it('姿态部位参数化：防御姿态下侧后两格按正面处理（仅正后算背）', () => {
    // 守方 (5,5) 朝 0（东）；侧后 = 西北(5,4)/西南(4,6)；正后 = 西(4,5)
    const defender = createUnitState('defender', 'player', { q: 5, r: 5 });
    defender.facing = 0;
    const attackerSide = createUnitState('boss', 'enemy', { q: 5, r: 4 });
    const plainSide = calcBattleForecast(map, attackerSide, defender, basicAttackSkill(getTemplate('boss')!));
    defender.statuses.push({ type: 'stance', skillName: '防御姿态', appliedAtTurn: 1, turnsLeft: -1, stanceId: 'defense' });
    const stanceSide = calcBattleForecast(map, attackerSide, defender, basicAttackSkill(getTemplate('boss')!));
    expect(plainSide.attacker.side).toBe('side');
    expect(stanceSide.attacker.side).toBe('front');
    // 正后仍算背
    const attackerBack = createUnitState('boss', 'enemy', { q: 4, r: 5 });
    const stanceBack = calcBattleForecast(map, attackerBack, defender, basicAttackSkill(getTemplate('boss')!));
    expect(stanceBack.attacker.side).toBe('back');
  });

  it('附属段 immediate：战斗怒吼释放暂存怒气计数（结算归 R5）', () => {
    const defender = createUnitState('defender', 'player', { q: 5, r: 5 });
    resolveSkillSubs(defender, SKILLS.warCry);
    expect(defender.pendingResources?.rage).toBeGreaterThan(0);
  });

  it('战斗怒吼：自身与周围 1 格友军获 atk 增益（ally AoE）', () => {
    const defender = createUnitState('defender', 'player', { q: 5, r: 5 });
    const mate = createUnitState('lord', 'player', { q: 6, r: 5 });
    const far = createUnitState('mage', 'player', { q: 12, r: 5 });
    resolveShout(defender, SKILLS.warCry, [defender, mate, far]);
    expect(defender.statuses.some(s => s.type === 'buff' && s.skillName === '战斗怒吼')).toBe(true);
    expect(mate.statuses.some(s => s.type === 'buff' && s.skillName === '战斗怒吼')).toBe(true);
    expect(far.statuses.some(s => s.type === 'buff')).toBe(false);
  });
});
