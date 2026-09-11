import { describe, it, expect, beforeEach } from 'vitest';
import { calcSpellForecast, resolveSpell, resolveAoeSpell } from '../../src/core/spell';
import { createMapState } from '../../src/core/map';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { SPELLS } from '../../src/config/spells';
import type { SpellTemplate } from '../../src/config/spells';
import { tickStatuses } from '../../src/core/status';
import type { DotStatus } from '../../src/core/status';
import { EFFECT_PARAMS } from '../../src/config/combat';

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
      expect(f.damage).toBe(19);
      expect(f.hitRate).toBeGreaterThan(0);
    }
  });

  it('陨石术 power 参与伤害', () => {
    // max(8+6-4,0)×1.0 = 10
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcSpellForecast(map, mage, swordsman, SPELLS.meteor);
    if (f.kind === 'damage') expect(f.damage).toBe(25);
  });

  it('R4-8 法术破重甲钥匙：陨石术 armorResist heavy ×1.5', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });  // heavy mdef8
    const f = calcSpellForecast(map, mage, boss, SPELLS.meteor);
    if (f.kind === 'damage') expect(f.damage).toBe(Math.floor((24 + 6) * 1.5 - 8));  // 37
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });  // light 未声明 → 1.0
    const f2 = calcSpellForecast(map, mage, sw, SPELLS.meteor);
    if (f2.kind === 'damage') expect(f2.damage).toBe(Math.floor((24 + 6) * 1.0 - 5));  // 25，非重甲无加成
  });

  it('治疗预报固定 power', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    const f = calcSpellForecast(map, priest, lord, SPELLS.heal);
    expect(f).toEqual({ kind: 'heal', amount: 10 });
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
    lord.hp = 50;
    resolveSpell(map, priest, lord, SPELLS.heal);
    expect(lord.hp).toBe(52);  // min(20+10, 29)
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
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r1 = resolveSpell(map, mage, swordsman, SPELLS.fireball, () => 0);
    expect(r1.kind).toBe('damage');
    expect(swordsman.hp).toBe(32 - 19);
    const r2 = resolveSpell(map, mage, swordsman, SPELLS.fireball, () => 1.0);
    if (r2.kind === 'damage') expect(r2.hit).toBe(false);
  });
});

describe('R3-7 陨石术 AoE 化（咏唱锁定格、区域内独立结算）', () => {
  it('resolveAoeSpell：以中心格 disc 内敌军各自掷命中结算，友军不受影响', () => {
    resetUnitCounter();
    const map = createMapState();
    const caster = createUnitState('mage', 'player', { q: 10, r: 15 });
    const foeA = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    const foeB = createUnitState('swordsman', 'enemy', { q: 12, r: 14 });
    const friend = createUnitState('lord', 'player', { q: 12, r: 16 });
    const seq = [0.0, 1.0];
    let i = 0;
    const results = resolveAoeSpell(map, caster, { q: 12, r: 15 }, [caster, foeA, foeB, friend], SPELLS.meteor, () => seq[i++]);
    expect(results).toHaveLength(2); // 只敌军两名
    expect(results.find(r => r.targetId === foeA.id)!.hit).toBe(true);
    expect(results.find(r => r.targetId === foeB.id)!.hit).toBe(false);
    expect(foeA.hp).toBeLessThan(foeA.maxHp);
    expect(friend.hp).toBe(friend.maxHp);
  });
});

describe('R3-10 法术修饰（炎爆/强化治疗/虔诚溅射）', () => {
  beforeEach(() => resetUnitCounter());
  const map = createMapState();

  it('炎爆：火球伤害提升并附加灼烧 DoT（每回合掉血）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });  // 出厂 pyro
    const foe = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const hp0 = foe.hp;
    resolveSpell(map, mage, foe, SPELLS.fireball, () => 0);
    expect(foe.hp).toBeLessThan(hp0 - 4);          // 基础 4 + 炎爆加成
    const dot = foe.statuses.find(s => s.type === 'dot');
    expect(dot).toBeDefined();
    const hp1 = foe.hp;
    tickStatuses([foe], 'enemy');
    expect(foe.hp).toBeLessThan(hp1);              // DoT 掉血
  });

  it('强化治疗：治疗量随技巧提升', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });  // 出厂 heal-boost, tec8
    const wounded = createUnitState('lord', 'player', { q: 11, r: 15 });
    wounded.hp = 10;
    resolveSpell(map, priest, wounded, SPELLS.heal, () => 0);
    expect(wounded.hp).toBe(10 + 10 + Math.floor(16 * 0.5));  // 基础 10 + tec/2
  });
});

describe('R4-7 DoT 施放时锁定', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('施放时锁定：每回合 = max(1, floor(直伤/回合数))，余数记入末回合补足', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });  // 出厂 pyro
    const foe = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const hp0 = foe.hp;
    resolveSpell(map, mage, foe, SPELLS.fireball, () => 0);
    const direct = hp0 - foe.hp;  // 炎爆加成后直伤 = DoT 锁定基准
    const dot = foe.statuses.find(s => s.type === 'dot') as DotStatus;
    const turns = EFFECT_PARAMS.pyroDotTurns;
    expect(dot.turnsLeft).toBe(turns);
    expect(dot.damagePerTurn).toBe(Math.max(1, Math.floor(direct / turns)));
    expect(dot.finalTurnExtra).toBe(Math.max(0, direct - Math.max(1, Math.floor(direct / turns)) * turns));
  });

  it('末回合补足：按存值跳、两跳合计 = 直伤', () => {
    // 防骑 mdef12：直伤 floor(24−12)=12 → 炎爆 floor(12×1.25)=15（奇数，余数可观察）
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const foe = createUnitState('paladin', 'enemy', { q: 11, r: 15 });
    const hp0 = foe.hp;
    resolveSpell(map, mage, foe, SPELLS.fireball, () => 0);
    const direct = hp0 - foe.hp;
    const perTurn = Math.max(1, Math.floor(direct / EFFECT_PARAMS.pyroDotTurns));
    const hpAfterCast = foe.hp;
    tickStatuses([foe], 'enemy');
    expect(foe.hp).toBe(hpAfterCast - perTurn);   // 首跳按存值
    tickStatuses([foe], 'enemy');
    expect(foe.hp).toBe(hpAfterCast - direct);    // 末跳补足余数，合计 = 直伤
    expect(foe.statuses.some(s => s.type === 'dot')).toBe(false);
  });

  it('保底 1 不回退：直伤 0 时每回合仍跳 1（小幅总伤溢价为接受设计）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const ember: SpellTemplate = { ...SPELLS.fireball, weights: { mag: 0 }, power: 0 };  // 直伤 0
    resolveSpell(map, mage, foe, ember, () => 0);
    const dot = foe.statuses.find(s => s.type === 'dot') as DotStatus;
    expect(dot.damagePerTurn).toBe(1);
    expect(dot.finalTurnExtra).toBe(0);
    const hp = foe.hp;
    tickStatuses([foe], 'enemy');
    tickStatuses([foe], 'enemy');
    expect(foe.hp).toBe(hp - 2);
  });
});
