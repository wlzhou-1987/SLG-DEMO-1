import { describe, it, expect, beforeEach } from 'vitest';
import { calcSpellForecast, resolveSpell, resolveAoeSpell, splitDot } from '../../src/core/spell';
import { createMapState } from '../../src/core/map';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { SPELLS } from '../../src/config/spells';
import type { SpellTemplate } from '../../src/config/spells';
import { tickStatuses } from '../../src/core/status';
import type { DotStatus } from '../../src/core/status';
import { EFFECT_PARAMS } from '../../src/config/combat';

/** R7-1 起命中后追加暴击掷：奇偶交替 = 必中 + 必不暴（保旧用例非暴击语义） */
const hitNoCrit = () => {
  let i = 0;
  return () => (i++ % 2 === 0 ? 0 : 0.99);
};

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

  it('再生/护盾预报读配置；咒杀 DoT 预报走公式切分', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    const enemy = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    expect(calcSpellForecast(map, priest, lord, SPELLS.regen)).toEqual({ kind: 'regen', healPerTurn: 5, turns: 3 });
    expect(calcSpellForecast(map, priest, lord, SPELLS.mithrilShield)).toEqual({ kind: 'shield', armorType: 'medium', absorb: 10, turns: 3 });
    // 咒杀 total = 魔 21 + power 14 − 魔防 5 = 30 → 每回合 10、整除无补余（R10-1 公式 / R7-3 power 14）
    const f = calcSpellForecast(map, priest, enemy, SPELLS.curse);
    expect(f).toMatchObject({ kind: 'dot', total: 30, damagePerTurn: 10, finalTurnExtra: 0, turns: 3 });
    if (f.kind === 'dot') expect(f.hitRate).toBeGreaterThan(0);
  });
});

describe('resolveSpell 法术结算（即时释放部分）', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('治疗：回复且不超过上限', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    lord.hp = 50;
    resolveSpell(map, priest, lord, SPELLS.heal, [priest, lord]);
    expect(lord.hp).toBe(52);  // min(20+10, 29)
  });

  it('再生：目标获得 regen 状态', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    resolveSpell(map, priest, lord, SPELLS.regen, [priest, lord]);
    const regen = lord.statuses.find(s => s.type === 'regen');
    expect(regen).toBeDefined();
    expect(regen!.turnsLeft).toBe(3);
  });

  it('秘银护盾：目标获得 shield 状态', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    resolveSpell(map, priest, lord, SPELLS.mithrilShield, [priest, lord]);
    const shield = lord.statuses.find(s => s.type === 'shield');
    expect(shield).toBeDefined();
    expect(shield!.turnsLeft).toBe(3);
  });

  it('咒杀：命中挂 DotStatus 锁定切分值（不立即伤害），未中不挂', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const enemy = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    const hpBefore = enemy.hp;
    const r = resolveSpell(map, priest, enemy, SPELLS.curse, [priest, enemy], () => 0);
    expect(r.hit).toBe(true);
    const dot = enemy.statuses.find(s => s.type === 'dot' && s.skillName === '咒杀');
    expect(dot).toMatchObject({ damagePerTurn: 10, finalTurnExtra: 0, turnsLeft: 3 });
    expect(enemy.hp).toBe(hpBefore);

    const enemy2 = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    const r2 = resolveSpell(map, priest, enemy2, SPELLS.curse, [priest, enemy2], () => 1.0);
    expect(r2.hit).toBe(false);
    expect(enemy2.statuses.find(s => s.type === 'dot')).toBeUndefined();
  });

  it('咒杀：锁定值不随施法者后续状态变化（预报 = 实际）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const enemy = createUnitState('swordsman', 'enemy', { q: 12, r: 15 });
    resolveSpell(map, mage, enemy, SPELLS.curse, [mage, enemy], () => 0);
    // total = 24 + 14 − 5 = 33 → 11/11/11（整除）；施法后施法者获得大幅魔力 buff 不影响已锁定值
    mage.statuses.push({ type: 'buff', skillName: '祝福', turnsLeft: 3, appliedAtTurn: 0, stat: 'mag', amount: 20, decay: 0 });
    const events = [
      ...tickStatuses([enemy], 'enemy'),
      ...tickStatuses([enemy], 'enemy'),
      ...tickStatuses([enemy], 'enemy')
    ];
    expect(events.filter(e => e.kind === 'dotTick').map(e => (e as { damage: number }).damage)).toEqual([11, 11, 11]);
    expect(enemy.hp).toBe(39 - 33);  // 剑士 hp39（R7-3）
    expect(enemy.statuses.find(s => s.type === 'dot')).toBeUndefined();
  });

  it('splitDot：整除无余数 / 余数末回合补足 / 保底每回合 ≥1', () => {
    expect(splitDot(30, 3)).toEqual({ perTurn: 10, extra: 0 });
    expect(splitDot(29, 3)).toEqual({ perTurn: 9, extra: 2 });
    expect(splitDot(2, 3)).toEqual({ perTurn: 1, extra: 0 });  // floor 0 → max(1,·) 保底
  });

  it('火球：命中扣血 / 未中不扣', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r1 = resolveSpell(map, mage, swordsman, SPELLS.fireball, [mage, swordsman], hitNoCrit());
    expect(r1.kind).toBe('damage');
    expect(swordsman.hp).toBe(39 - 19);  // 剑士 hp39（R7-3）
    const r2 = resolveSpell(map, mage, swordsman, SPELLS.fireball, [mage, swordsman], () => 1.0);
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
    resolveSpell(map, mage, foe, SPELLS.fireball, [mage, foe], hitNoCrit());
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
    resolveSpell(map, priest, wounded, SPELLS.heal, [priest, wounded], () => 0);
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
    resolveSpell(map, mage, foe, SPELLS.fireball, [mage, foe], hitNoCrit());
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
    resolveSpell(map, mage, foe, SPELLS.fireball, [mage, foe], hitNoCrit());
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
    resolveSpell(map, mage, foe, ember, [mage, foe], () => 0);
    const dot = foe.statuses.find(s => s.type === 'dot') as DotStatus;
    expect(dot.damagePerTurn).toBe(1);
    expect(dot.finalTurnExtra).toBe(0);
    const hp = foe.hp;
    tickStatuses([foe], 'enemy');
    tickStatuses([foe], 'enemy');
    expect(foe.hp).toBe(hp - 2);
  });
});

describe('R12-1 虔诚溅射（pious：ally 法术结算值减半复制到血量最低友方）', () => {
  beforeEach(() => resetUnitCounter());

  const map = createMapState();

  it('治疗溅射：血量最低友方吃主目标结算值减半（含 tec/2 加治），排除主目标与施法者', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });    // 主目标
    const knight = createUnitState('knight', 'player', { q: 9, r: 15 });
    knight.hp = 20;
    const r = resolveSpell(map, priest, lord, SPELLS.heal, [priest, lord, knight], () => 0.99);
    if (r.kind !== 'heal') throw new Error('expected heal');
    expect(r.amount).toBe(18);                                            // 10 + floor(tec16 × 0.5)
    expect(r.splash).toEqual({ targetId: knight.id, value: 9 });
    expect(knight.hp).toBe(29);
  });

  it('择取序：绝对 HP 最低优先；并列取距施法者近；再并列取数组序（稳定）', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const target = createUnitState('swordsman', 'player', { q: 11, r: 15 });
    const near = createUnitState('lord', 'player', { q: 10, r: 14 });    // 距 1
    const far = createUnitState('knight', 'player', { q: 10, r: 17 });   // 距 2
    near.hp = far.hp = 30;
    const r = resolveSpell(map, priest, target, SPELLS.heal, [far, near, target, priest], () => 0.99);
    expect(r.splash!.targetId).toBe(near.id);
    const near2 = createUnitState('archer', 'player', { q: 9, r: 16 });  // 距 1，与 near 并列
    near2.hp = 30;
    const r2 = resolveSpell(map, priest, target, SPELLS.heal, [near2, near, target, priest], () => 0.99);
    expect(r2.splash!.targetId).toBe(near2.id);                           // 数组序靠前胜
  });

  it('范围边界：有效射程 4（2+魔力1+技1）内候选，5 格外不候选；敌方阵营不候选', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const target = createUnitState('lord', 'player', { q: 11, r: 15 });
    const edge = createUnitState('knight', 'player', { q: 10, r: 19 });  // 距 4 = 恰在程内
    edge.hp = 10;
    const foe = createUnitState('swordsman', 'enemy', { q: 9, r: 15 });
    foe.hp = 5;                                                          // 血量更低但敌方
    const r = resolveSpell(map, priest, target, SPELLS.heal, [edge, foe, target, priest], () => 0.99);
    expect(r.splash!.targetId).toBe(edge.id);
    edge.position = { q: 10, r: 20 };                                    // 距 5 = 程外
    const r2 = resolveSpell(map, priest, target, SPELLS.heal, [edge, foe, target, priest], () => 0.99);
    expect(r2.splash).toBeUndefined();
  });

  it('再生/护盾溅射：每回合量与吸收量各自减半，回合数同主目标', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const target = createUnitState('lord', 'player', { q: 11, r: 15 });
    const other = createUnitState('knight', 'player', { q: 10, r: 14 });
    other.hp = 10;
    const r1 = resolveSpell(map, priest, target, SPELLS.regen, [priest, target, other], () => 0.99);
    expect(r1.splash).toEqual({ targetId: other.id, value: 2 });         // 5 → 2
    const regen = other.statuses.find(s => s.type === 'regen') as { type: 'regen'; healPerTurn: number; turnsLeft: number };
    expect(regen.healPerTurn).toBe(2);
    expect(regen.turnsLeft).toBe(3);
    const r2 = resolveSpell(map, priest, target, SPELLS.mithrilShield, [priest, target, other], () => 0.99);
    expect(r2.splash).toEqual({ targetId: other.id, value: 5 });         // 10 → 5
    const shield = other.statuses.find(s => s.type === 'shield') as { type: 'shield'; absorbLeft: number; turnsLeft: number };
    expect(shield.absorbLeft).toBe(5);
    expect(shield.turnsLeft).toBe(3);
  });

  it('门控：未装 pious 被动不溅射；无程内其他友方不溅射', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 },
      { active: ['heal', 'regen', 'mithrilShield'], passive: ['heal-boost'] });
    const target = createUnitState('lord', 'player', { q: 11, r: 15 });
    const other = createUnitState('knight', 'player', { q: 10, r: 14 });
    other.hp = 10;
    const r1 = resolveSpell(map, priest, target, SPELLS.heal, [priest, target, other], () => 0.99);
    expect(r1.splash).toBeUndefined();
    const priest2 = createUnitState('priest', 'player', { q: 10, r: 15 });
    const r2 = resolveSpell(map, priest2, target, SPELLS.heal, [priest2, target], () => 0.99);
    expect(r2.splash).toBeUndefined();
    expect(other.hp).toBe(10);
  });

  it('溅射减半保底 1：主目标结算值 1 时溅射 1', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 },
      { active: ['heal', 'regen', 'mithrilShield'], passive: ['pious'] });  // 无 heal-boost，结算值走 power
    const tiny: SpellTemplate = { ...SPELLS.heal, weights: {}, power: 1 };
    const target = createUnitState('lord', 'player', { q: 11, r: 15 });
    const other = createUnitState('knight', 'player', { q: 10, r: 14 });
    other.hp = 10;
    const r = resolveSpell(map, priest, target, tiny, [priest, target, other], () => 0.99);
    if (r.kind !== 'heal') throw new Error('expected heal');
    expect(r.amount).toBe(1);
    expect(r.splash).toEqual({ targetId: other.id, value: 1 });
    expect(other.hp).toBe(11);
  });
});
