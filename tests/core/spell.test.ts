import { describe, it, expect, beforeEach } from 'vitest';
import { calcSpellForecast, resolveSpell } from '../../src/core/spell';
import { createMapState } from '../../src/core/map';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { SPELLS } from '../../src/config/spells';

describe('calcSpellForecast 法术预报', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('火球伤害走统一公式（含矩阵）', () => {
    // 法师 atk8 vs 剑士(无甲? 剑士轻甲) def4：magic vs light ×1.0 → max(8-4,0)×1.0=4
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcSpellForecast(map, mage, swordsman, SPELLS.fireball);
    expect(f.kind).toBe('damage');
    if (f.kind === 'damage') {
      expect(f.damage).toBe(4);
      expect(f.hitRate).toBeGreaterThan(0);
    }
  });

  it('陨石术 power 参与伤害', () => {
    // max(8+6-4,0)×1.0 = 10
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcSpellForecast(map, mage, swordsman, SPELLS.meteor);
    if (f.kind === 'damage') expect(f.damage).toBe(10);
  });

  it('治疗预报固定 power', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    const f = calcSpellForecast(map, priest, lord, SPELLS.heal);
    expect(f).toEqual({ kind: 'heal', amount: 8 });
  });

  it('再生/护盾/咒杀预报读配置', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    const enemy = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    expect(calcSpellForecast(map, priest, lord, SPELLS.regen)).toEqual({ kind: 'regen', healPerTurn: 5, turns: 3 });
    expect(calcSpellForecast(map, priest, lord, SPELLS.mithrilShield)).toEqual({ kind: 'shield', armorType: 'medium', absorb: 10, turns: 3 });
    expect(calcSpellForecast(map, priest, enemy, SPELLS.curse)).toEqual({ kind: 'curse', damage: 10, turns: 3 });
  });
});

describe('resolveSpell 法术结算（即时释放部分）', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('治疗：回复且不超过上限', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    lord.hp = 20;
    resolveSpell(map, priest, lord, SPELLS.heal);
    expect(lord.hp).toBe(26);  // min(20+8, 26)
  });

  it('再生：目标获得 regen 状态', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    resolveSpell(map, priest, lord, SPELLS.regen);
    const regen = lord.statuses.find(s => s.type === 'regen');
    expect(regen).toBeDefined();
    expect(regen!.turnsLeft).toBe(3);
  });

  it('秘银护盾：目标获得 shield 状态', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    resolveSpell(map, priest, lord, SPELLS.mithrilShield);
    const shield = lord.statuses.find(s => s.type === 'shield');
    expect(shield).toBeDefined();
    expect(shield!.turnsLeft).toBe(3);
  });

  it('咒杀：目标获得 delayed 状态（不立即伤害）', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const enemy = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    const hpBefore = enemy.hp;
    resolveSpell(map, priest, enemy, SPELLS.curse);
    const delayed = enemy.statuses.find(s => s.type === 'delayed');
    expect(delayed).toBeDefined();
    expect(enemy.hp).toBe(hpBefore);
  });

  it('火球：命中扣血 / 未中不扣', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r1 = resolveSpell(map, mage, swordsman, SPELLS.fireball, () => 0);
    expect(r1.kind).toBe('damage');
    expect(swordsman.hp).toBe(18 - 4);
    const r2 = resolveSpell(map, mage, swordsman, SPELLS.fireball, () => 0.99);
    if (r2.kind === 'damage') expect(r2.hit).toBe(false);
  });
});
