import { describe, it, expect } from 'vitest';
import { createMapState, isPassable } from '../../src/core/map';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS } from '../../src/config/map';
import { getTemplate, PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';
import { hexKey } from '../../src/core/hex';
import { SPELLS, isSpell } from '../../src/config/spells';
import { getTrait } from '../../src/config/traits';

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
      if (template.flying) continue;
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
    expect(priest.skills.every(isSpell)).toBe(true);
    expect(mage.skills.every(isSpell)).toBe(true);
    expect(priest.traits).toContain('steady');
    expect(getTemplate('thief')!.traits).toContain('backstab');
  });
});
