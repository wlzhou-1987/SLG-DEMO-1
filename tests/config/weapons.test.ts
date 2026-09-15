import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon } from '../../src/config/weapons';
import { WEAPON_ATOMS } from '../../src/config/skills';
import { UNIT_TAGS } from '../../src/config/units';

const ALL = Object.values(WEAPONS);

describe('R2-1 武器注册表与首版清单（§4.14）', () => {
  it('注册表条目 id 与名称唯一，共 15 条', () => {
    const ids = new Set(ALL.map(w => w.id));
    const names = new Set(ALL.map(w => w.name));
    expect(ids.size).toBe(ALL.length);
    expect(names.size).toBe(ALL.length);
    expect(ALL.length).toBe(15);
  });

  it('weaponType 均为合法武器原子', () => {
    for (const w of ALL) expect(WEAPON_ATOMS).toContain(w.weaponType);
  });

  it('普攻段齐备性：伤害线/威力/射程要么全配要么全不配', () => {
    for (const w of ALL) {
      const hasDamage = w.damageType !== undefined;
      const hasPower = w.power !== undefined;
      const hasRange = w.rangeMin !== undefined && w.rangeMax !== undefined;
      expect(
        hasDamage === hasPower && hasPower === hasRange,
        `条目 ${w.id} 普攻段残缺`
      ).toBe(true);
    }
  });

  it('供普攻条目：伤害线限物理三线（武器不入法术线）且 rangeMin ≤ rangeMax', () => {
    for (const w of ALL) {
      if (w.damageType === undefined) continue;
      expect(['slashing', 'piercing', 'blunt']).toContain(w.damageType);
      expect(w.rangeMin!).toBeLessThanOrEqual(w.rangeMax!);
    }
  });

  it('critBonus 未配或为非负数', () => {
    for (const w of ALL) {
      if (w.critBonus === undefined) continue;
      expect(w.critBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it('counters 键为合法兵种标签且值为正数', () => {
    for (const w of ALL) {
      if (w.counters === undefined) continue;
      for (const [tag, m] of Object.entries(w.counters)) {
        expect(UNIT_TAGS).toContain(tag as never);
        expect(m).toBeGreaterThan(0);
      }
    }
  });

  it('原子基准威力定稿（Q-1：剑2/枪2/斧3/锤3/匕1/弓1/杖0）', () => {
    expect(WEAPONS.longsword).toMatchObject({ power: 2 });
    expect(WEAPONS.spear).toMatchObject({ power: 2 });
    expect(WEAPONS.warAxe).toMatchObject({ power: 3 });
    expect(WEAPONS.warHammer).toMatchObject({ power: 3 });
    expect(WEAPONS.dagger).toMatchObject({ power: 1 });
    expect(WEAPONS.longbow).toMatchObject({ power: 1, rangeMin: 2, rangeMax: 2 });
    expect(WEAPONS.staff).toMatchObject({ power: 0 });
  });

  it('必杀型三条：critBonus +10、威力 = 基准 −2（匕/弓 −1）（Q-2）', () => {
    expect(WEAPONS.killingSword).toMatchObject({ critBonus: 10, power: 0 });
    expect(WEAPONS.killingDagger).toMatchObject({ critBonus: 10, power: -1 });
    expect(WEAPONS.killingBow).toMatchObject({ critBonus: 10, power: -1, rangeMin: 2, rangeMax: 2 });
  });

  it('跨线条目三条：刺剑（剑·突）/薙刀（枪·斩）/钝斧（斧·钝）（Q-4）', () => {
    expect(WEAPONS.rapier).toMatchObject({ weaponType: 'sword', damageType: 'piercing', power: 2 });
    expect(WEAPONS.naginata).toMatchObject({ weaponType: 'spear', damageType: 'slashing', power: 2 });
    expect(WEAPONS.bluntAxe).toMatchObject({ weaponType: 'axe', damageType: 'blunt', power: 3 });
  });

  it('铁盾无普攻段（纯原子供体，不设盾特判）', () => {
    expect(WEAPONS.ironShield).toMatchObject({ weaponType: 'shield' });
    expect(WEAPONS.ironShield.damageType).toBeUndefined();
    expect(WEAPONS.ironShield.power).toBeUndefined();
    expect(WEAPONS.ironShield.rangeMin).toBeUndefined();
  });

  it('弑骑战锤：锤·钝·威力3·骑兵 ×1.5（Q-3）', () => {
    expect(WEAPONS.cavalierSlayer).toMatchObject({
      weaponType: 'hammer', damageType: 'blunt', power: 3,
      counters: { cavalry: 1.5 }
    });
  });

  it('getWeapon 按 id 解析与未知 id 返回 undefined', () => {
    expect(getWeapon('longsword')?.name).toBe('长剑');
    expect(getWeapon('nope')).toBeUndefined();
  });
});
