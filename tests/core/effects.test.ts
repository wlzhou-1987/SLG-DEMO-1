import { describe, it, expect, beforeEach } from 'vitest';
import { rushDestination, applyAmbushBonus } from '../../src/core/effects';
import { SKILLS } from '../../src/config/skills';
import { createUnitState, resetUnitCounter } from '../../src/core/unit';
import { createMapState } from '../../src/core/map';
import { enterStealth } from '../../src/core/stealth';

describe('R3-10 冲杀（穿越位移）', () => {
  beforeEach(() => resetUnitCounter());
  const map = createMapState();

  it('直线目标：落位目标背后格', () => {
    const knight = createUnitState('knight', 'player', { q: 5, r: 5 });
    const foe = createUnitState('swordsman', 'enemy', { q: 7, r: 5 });
    const rush = rushDestination(map, [knight, foe], knight, foe);
    expect(rush).toEqual({ q: 8, r: 5 });
  });

  it('非直线目标不可冲杀（灰显条件）', () => {
    const knight = createUnitState('knight', 'player', { q: 5, r: 5 });
    const foe = createUnitState('swordsman', 'enemy', { q: 6, r: 6 });
    expect(rushDestination(map, [knight, foe], knight, foe)).toBeNull();
  });

  it('背后格被占不可冲杀；中间格有第三方单位也不可冲', () => {
    const knight = createUnitState('knight', 'player', { q: 5, r: 5 });
    const foe = createUnitState('swordsman', 'enemy', { q: 7, r: 5 });
    const blocker = createUnitState('swordsman', 'enemy', { q: 8, r: 5 });
    expect(rushDestination(map, [knight, foe, blocker], knight, foe)).toBeNull();
    const midBlocker = createUnitState('archer_enemy', 'enemy', { q: 6, r: 5 });
    expect(rushDestination(map, [knight, foe, midBlocker], knight, foe)).toBeNull();
  });
});

describe('R3-10 破隐一击', () => {
  beforeEach(() => resetUnitCounter());

  it('潜行中攻击附加 ambush 威力（突袭/隐秘猎手持有者）', () => {
    const thief = createUnitState('thief', 'player', { q: 5, r: 5 });
    enterStealth(thief);
    const boosted = applyAmbushBonus(thief, SKILLS['backstab-strike']);
    expect((boosted.power ?? 0)).toBeGreaterThan(SKILLS['backstab-strike'].power ?? 0);
    const noTrait = createUnitState('lord', 'player', { q: 5, r: 5 }, { active: [], passive: [] });
    enterStealth(noTrait);
    expect(applyAmbushBonus(noTrait, SKILLS.stab).power ?? 0).toBe(SKILLS.stab.power ?? 0);
  });
});
