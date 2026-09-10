import { describe, it, expect, beforeEach } from 'vitest';
import { getUnitAt, createUnitState, resetUnitCounter, getUnitActiveSkills, hasUnitTrait } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';

describe('unit', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  describe('createUnitState', () => {
    it('从模板创建单位状态', () => {
      const unit = createUnitState('lord', 'player', { q: 5, r: 5 });
      expect(unit.id).toBe('player-1');
      expect(unit.templateId).toBe('lord');
      expect(unit.faction).toBe('player');
      expect(unit.position).toEqual({ q: 5, r: 5 });
      expect(unit.facing).toBe(1);
      expect(unit.hasActed).toBe(false);
    });

    it('ID 自动递增', () => {
      const u1 = createUnitState('lord', 'player', { q: 0, r: 0 });
      const u2 = createUnitState('knight', 'player', { q: 1, r: 1 });
      expect(u1.id).toBe('player-1');
      expect(u2.id).toBe('player-2');
    });

    it('HP 与 maxHp 取自模板', () => {
      const lord = createUnitState('lord', 'player', { q: 0, r: 0 });
      expect(lord.hp).toBe(29);
      expect(lord.maxHp).toBe(29);
      const boss = createUnitState('boss', 'enemy', { q: 10, r: 2 });
      expect(boss.hp).toBe(34);
      expect(boss.maxHp).toBe(34);
    });
  });

  describe('getUnitAt', () => {
    it('返回指定位置的单位', () => {
      const units: UnitState[] = [
        {
          id: 'u1',
          templateId: 'lord',
          faction: 'player',
          position: { q: 3, r: 3 },
          facing: 0,
          hp: 26,
          maxHp: 26,
          hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] }
        },
        {
          id: 'u2',
          templateId: 'knight',
          faction: 'player',
          position: { q: 5, r: 5 },
          facing: 1,
          hp: 26,
          maxHp: 26,
          hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] }
        }
      ];
      expect(getUnitAt(units, { q: 3, r: 3 })).toBe(units[0]);
      expect(getUnitAt(units, { q: 5, r: 5 })).toBe(units[1]);
    });

    it('空位置返回 undefined', () => {
      const units: UnitState[] = [];
      expect(getUnitAt(units, { q: 3, r: 3 })).toBeUndefined();
    });

    it('按阵营筛选', () => {
      const units: UnitState[] = [
        {
          id: 'p1',
          templateId: 'lord',
          faction: 'player',
          position: { q: 3, r: 3 },
          facing: 0,
          hp: 26,
          maxHp: 26,
          hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] }
        },
        {
          id: 'e1',
          templateId: 'swordsman',
          faction: 'enemy',
          position: { q: 3, r: 3 },
          facing: 3,
          hp: 18,
          maxHp: 18,
          hasActed: false, statuses: [], activated: true, moveSpent: 0,
          loadout: { active: [], passive: [] }
        }
      ];
      expect(getUnitAt(units, { q: 3, r: 3 }, 'player')?.faction).toBe('player');
      expect(getUnitAt(units, { q: 3, r: 3 }, 'enemy')?.faction).toBe('enemy');
    });
  });
});

describe('R3-3 技能挂实例与战斗内锁定', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  it('默认装填 = 出厂装填（active=模板 skills、passive=模板 traits）', () => {
    const lord = createUnitState('lord', 'player', { q: 0, r: 0 });
    expect([...lord.loadout.active]).toEqual(['stab']);
    expect([...lord.loadout.passive]).toEqual(['aura']);
    const thief = createUnitState('thief', 'player', { q: 0, r: 1 });
    expect([...thief.loadout.passive]).toEqual(['backstab', 'stealth-move', 'ambush']);
    const enemyArcher = createUnitState('archer_enemy', 'enemy', { q: 0, r: 2 });
    expect([...enemyArcher.loadout.active]).toEqual(['snipe']);
  });

  it('传入自定义装填生效（编成条目 → 实例）', () => {
    const u = createUnitState('lord', 'player', { q: 0, r: 0 }, {
      active: ['snipe'], passive: ['steady']
    });
    expect([...u.loadout.active]).toEqual(['snipe']);
    expect([...u.loadout.passive]).toEqual(['steady']);
  });

  it('战斗内锁定：装填冻结不可变', () => {
    const u = createUnitState('lord', 'player', { q: 0, r: 0 });
    expect(() => {
      (u.loadout as unknown as { active: string[] }).active.push('snipe');
    }).toThrow();
    expect(() => { (u.loadout as unknown as { active: string[] }).active = []; }).toThrow();
  });

  it('getUnitActiveSkills 解析实例主动；hasUnitTrait 读实例被动', () => {
    const mage = createUnitState('mage', 'player', { q: 0, r: 0 });
    expect(getUnitActiveSkills(mage).map(s => s.name)).toEqual(['火球', '陨石术', '咒杀']);
    const knight = createUnitState('knight', 'player', { q: 1, r: 0 });
    expect(hasUnitTrait(knight, 're-move')).toBe(true);
  });
});
