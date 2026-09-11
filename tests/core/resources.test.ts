import { describe, it, expect, beforeEach } from 'vitest';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { getTemplate, basicAttackSkill } from '../../src/config/units';
import { initResources, canAfford, payCost, refundCost, tickResources } from '../../src/core/resources';
import { SPELLS } from '../../src/config/spells';
import { SKILLS } from '../../src/config/skills';
import { interruptChant, tickStatuses } from '../../src/core/status';
import { resolveBattle } from '../../src/core/combat';
import { resolveSpell } from '../../src/core/spell';
import { executeBehavior } from '../../src/core/effects';
import { createMapState } from '../../src/core/map';

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

describe('R5-2 生成与恢复结算', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('普攻命中积攒三资源：怒+10 / 专+5 / MP+5（§4.9）', () => {
    // 领主普攻命中剑士（贴脸互殴，反击同积攒）：领主 命中+10 与 受击+8 = 18；剑士同理 18
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    resolveBattle(map, lord, sw, basicAttackSkill(getTemplate('lord')!), () => 0);
    expect(lord.resources.current).toBe(10 + 8);  // 命中 +10、被反击受击 +8
    expect(sw.resources.current).toBe(8 + 10);    // 受击 +8、反击命中 +10（同速无追击）
    // 弓箭（专注）普攻命中：+5（距离 2 无反击）
    const archer = createUnitState('archer', 'player', { q: 10, r: 15 });
    const sw2 = createUnitState('swordsman', 'enemy', { q: 10, r: 17 });  // dist 2
    archer.resources.current = 50;
    resolveBattle(map, archer, sw2, basicAttackSkill(getTemplate('archer')!), () => 0);
    expect(archer.resources.current).toBe(55);
    // 法师（MP）杖击普攻命中：+5（剑士快 3 无追击；法师受击不积攒 MP）
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const sw3 = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    mage.resources.current = 30;
    resolveBattle(map, mage, sw3, basicAttackSkill(getTemplate('mage')!), () => 0);
    expect(mage.resources.current).toBe(35);
  });

  it('技能命中仅怒气积攒（专注/MP 技能命中不积攒）', () => {
    // 盗贼背刺（技能，免费）命中×2（盗贼快 7 追击）：专注不增；剑士 受击×2 +8×2 + 反击命中 +10 = 26
    const thief = createUnitState('thief', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    resolveBattle(map, thief, sw, SKILLS['backstab-strike'], () => 0);
    expect(thief.resources.current).toBe(100);  // 技能命中专注不积攒（满亦封顶）
    expect(sw.resources.current).toBe(8 + 8 + 10);
  });

  it('落空不积攒（攻击者与受击者均无所得）', () => {
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    resolveBattle(map, lord, sw, basicAttackSkill(getTemplate('lord')!), () => 0.99);
    expect(lord.resources.current).toBe(0);
    expect(sw.resources.current).toBe(0);
  });

  it('专注回合恢复：己方阶段开始 +20（封顶 100）', () => {
    const thief = createUnitState('thief', 'player', { q: 10, r: 15 });
    thief.resources.current = 75;
    tickResources([thief], 'player');
    expect(thief.resources.current).toBe(95);
    tickResources([thief], 'player');
    expect(thief.resources.current).toBe(100);  // 封顶
    // 敌方阶段不推进我方
    tickResources([thief], 'enemy');
    expect(thief.resources.current).toBe(100);
  });

  it('MP 歇息两态：未施法回合 +15；施法回合不恢复且标志重置', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    mage.resources.current = 40;
    tickResources([mage], 'player');
    expect(mage.resources.current).toBe(55);  // 未施法 → 恢复
    mage.castSpellThisTurn = true;
    mage.resources.current = 40;
    tickResources([mage], 'player');
    expect(mage.resources.current).toBe(40);  // 施法回合不恢复
    tickResources([mage], 'player');
    expect(mage.resources.current).toBe(55);  // 标志已重置 → 下回合恢复
  });

  it('法术结算标记施法（resolveSpell 即时与咏唱触发）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    resolveSpell(map, mage, sw, SPELLS.fireball, () => 0);
    expect(mage.castSpellThisTurn).toBe(true);
  });

  it('附属段资源生成入真实资源：战斗怒吼 +2 怒（封顶）', () => {
    const defender = createUnitState('defender', 'player', { q: 10, r: 15 });
    executeBehavior(defender, SKILLS.warCry, [defender]);
    expect(defender.resources.current).toBe(2);   // 原 pendingResources 计数 → 真实怒气
    expect((defender as { pendingResources?: unknown }).pendingResources).toBeUndefined();
  });

  it('强化祝福回合开始回怒气入真实资源（原暂存迁移）', () => {
    const paladin = createUnitState('paladin', 'player', { q: 10, r: 15 });
    paladin.statuses.push({
      type: 'buff', skillName: '祝福', appliedAtTurn: 1, turnsLeft: 3,
      stat: 'mdef', amount: 3, decay: 1
    });
    tickStatuses([paladin], 'player');
    expect(paladin.resources.current).toBeGreaterThanOrEqual(1);  // 祝福期间每回合 +1
    expect((paladin as { pendingResources?: unknown }).pendingResources).toBeUndefined();
  });
});
