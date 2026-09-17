import { describe, it, expect } from 'vitest';
import { createMapState, isPassable } from '../../src/core/map';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS } from '../../src/config/map';
import { isFlying } from '../../src/config/units';
import { getTemplate, getTemplateSkills, PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';
import { hexKey } from '../../src/core/hex';
import { SPELLS, isSpell } from '../../src/config/spells';
import { getTrait } from '../../src/config/traits';
import { validateLoadoutForTemplate } from '../../src/config/pool';
import { checkGroupActivation } from '../../src/core/ai';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';

const allPlacements = () => [...PLAYER_UNITS, ...ENEMY_GROUPS.flatMap(g => g.units)];

describe('关卡 1 配置一致性', () => {
  const map = createMapState(MAP_OVERRIDES);

  it('我方 10 人；敌方 9 组共 40 人（含 BOSS）', () => {
    expect(PLAYER_UNITS).toHaveLength(10);
    expect(PLAYER_UNITS.every(u => u.faction === 'player')).toBe(true);
    const enemies = ENEMY_GROUPS.flatMap(g => g.units);
    expect(enemies).toHaveLength(40);
    expect(enemies.every(u => u.faction === 'enemy')).toBe(true);
  });

  it('组激活配置：前哨 B 主动，BOSS 单独成组驻守，其余 7 组待机', () => {
    const aggressive = ENEMY_GROUPS.filter(g => g.aiType === 'aggressive');
    expect(aggressive).toHaveLength(1);
    expect(aggressive[0].id).toBe('outpostB');

    const bossGroups = ENEMY_GROUPS.filter(g => g.aiType === 'boss');
    expect(bossGroups).toHaveLength(1);
    expect(bossGroups[0].units).toHaveLength(1);
    expect(bossGroups[0].units[0].templateId).toBe('boss');

    expect(ENEMY_GROUPS.filter(g => g.aiType === 'dormant')).toHaveLength(7);
  });

  it('组 ID 唯一', () => {
    const ids = ENEMY_GROUPS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('所有初始位置在地图内', () => {
    for (const u of allPlacements()) {
      expect(
        u.position.q >= 0 && u.position.q < map.width &&
        u.position.r >= 0 && u.position.r < map.height,
        `${u.templateId} at ${u.position.q},${u.position.r} 越界`
      ).toBe(true);
    }
  });

  it('初始位置无重叠', () => {
    const seen = new Set<string>();
    for (const u of allPlacements()) {
      const key = hexKey(u.position);
      expect(seen.has(key), `位置 ${key} 被 ${u.templateId} 重复占据`).toBe(false);
      seen.add(key);
    }
  });

  it('地面单位初始位置不处于山', () => {
    for (const u of allPlacements()) {
      const template = getTemplate(u.templateId)!;
      if (isFlying(template)) continue;
      expect(
        isPassable(map, u.position, false),
        `${u.templateId} at ${u.position.q},${u.position.r} 站在不可通行地形`
      ).toBe(true);
    }
  });

  it('所有模板 ID 存在', () => {
    for (const u of allPlacements()) {
      expect(getTemplate(u.templateId), `模板 ${u.templateId} 不存在`).toBeDefined();
    }
  });

  it('开局任何我方单位不进入待机组警戒范围（前哨 A 等不被误激活）', () => {
    resetUnitCounter();
    const units: UnitState[] = [
      ...PLAYER_UNITS.map(p => createUnitState(p.templateId, p.faction, p.position)),
      ...ENEMY_GROUPS.flatMap(g =>
        g.units.map(p => {
          const u = createUnitState(p.templateId, p.faction, p.position);
          u.groupId = g.id;
          u.aiKind = g.aiType;
          u.activated = g.aiType !== 'dormant';
          return u;
        })
      )
    ];
    checkGroupActivation(map, units);
    for (const u of units) {
      if (u.aiKind !== 'dormant') continue;
      expect(u.activated, `组 ${u.groupId} 的 ${u.templateId} 开局被误激活`).toBe(false);
    }
  });
});

describe('法术与特性配置一致性', () => {
  it('六个示例法术配置完整', () => {
    const ids = ['fireball', 'meteor', 'curse', 'heal', 'regen', 'mithrilShield'];
    for (const id of ids) {
      const spell = SPELLS[id];
      expect(spell, `法术 ${id} 缺失`).toBeDefined();
    }
    expect(SPELLS.meteor.chantTurns).toBeGreaterThan(0);
    expect(SPELLS.curse.durationTurns).toBeGreaterThan(0);
    expect(SPELLS.regen.durationTurns).toBeGreaterThan(0);
    expect(SPELLS.mithrilShield.shield).toBeDefined();
    expect(SPELLS.mithrilShield.shield!.absorb).toBeGreaterThan(0);
  });

  it('增益法术目标友方，伤害法术目标敌方', () => {
    expect(SPELLS.heal.targetType).toBe('ally');
    expect(SPELLS.regen.targetType).toBe('ally');
    expect(SPELLS.mithrilShield.targetType).toBe('ally');
    expect(SPELLS.fireball.targetType).toBe('enemy');
    expect(SPELLS.meteor.targetType).toBe('enemy');
    expect(SPELLS.curse.targetType).toBe('enemy');
  });

  it('模板 traits 引用存在', () => {
    const all = [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES];
    for (const t of all) {
      for (const traitId of t.traits ?? []) {
        expect(getTrait(traitId), `模板 ${t.id} 引用不存在的特性 ${traitId}`).toBeDefined();
      }
    }
  });

  it('施法者技能池为法术模板', () => {
    const priest = getTemplate('priest')!;
    const mage = getTemplate('mage')!;
    expect(getTemplateSkills(priest).every(isSpell)).toBe(true);
    expect(getTemplateSkills(mage).every(isSpell)).toBe(true);
    expect(priest.traits).toContain('heal-boost');
    expect(priest.traits).toContain('pious');
    expect(getTemplate('thief')!.traits).toContain('backstab');
  });
});

describe('R3-6 敌方关卡级配置', () => {
  it('全部敌方条目通过双约束校验（模板存在 + loadout 合法）', () => {
    for (const g of ENEMY_GROUPS) {
      for (const p of g.units) {
        const t = getTemplate(p.templateId);
        expect(t).toBeDefined();
        if (p.loadout) {
          expect(validateLoadoutForTemplate(t!, p.loadout, p.equipment)).toEqual([]);
        }
      }
    }
  });

  it('敌方首版内容：弓手出厂狙击+真实视野，BOSS 第二处真实视野（独立布防 ≥2）', () => {
    const archers = ENEMY_GROUPS.flatMap(g => g.units).filter(p => p.templateId === 'archer_enemy');
    expect(archers.length).toBeGreaterThanOrEqual(2);
    for (const a of archers) {
      expect(a.loadout?.active).toEqual(['snipe']);
      expect(a.loadout?.passive).toContain('true-sight');
    }
    const boss = ENEMY_GROUPS.flatMap(g => g.units).find(p => p.templateId === 'boss')!;
    expect(boss.loadout?.active).toEqual(['warHammer', 'sweep']);
    expect(boss.loadout?.passive).toContain('true-sight');
    expect(getTrait('true-sight')?.revealRange).toBeGreaterThan(0);
  });

  it('未配 loadout 的敌方默认走出厂（锤兵=重锤，纯普攻杂兵技能为空）', () => {
    const hammer = ENEMY_GROUPS.flatMap(g => g.units).find(p => p.templateId === 'hammerman')!;
    expect(hammer.loadout).toBeUndefined();
    const unit = createUnitState('hammerman', 'enemy', hammer.position);
    expect([...unit.loadout.active]).toEqual(['warHammer']);
    const sword = ENEMY_GROUPS.flatMap(g => g.units).find(p => p.templateId === 'swordsman')!;
    expect(sword.loadout).toBeUndefined();
    const unit2 = createUnitState('swordsman', 'enemy', sword.position);
    expect([...unit2.loadout.active]).toEqual([]);
  });

  it('非法配置拦截：武器不符与未注册 id 报错', () => {
    const swordsman = getTemplate('swordsman')!;
    const errs = validateLoadoutForTemplate(swordsman, { active: ['snipe'], passive: [] });
    expect(errs.some(e => e.includes('武器'))).toBe(true);
    const errs2 = validateLoadoutForTemplate(swordsman, { active: ['nonexistent'], passive: [] });
    expect(errs2.some(e => e.includes('未注册'))).toBe(true);
  });
});
