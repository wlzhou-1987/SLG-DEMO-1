import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon, validateEquipment, basicAttackSkills, WEAPON_SLOT_LIMIT } from '../../src/config/weapons';
import { WEAPON_ATOMS } from '../../src/config/skills';
import { UNIT_TAGS, PLAYER_TEMPLATES, ENEMY_TEMPLATES, getTemplate } from '../../src/config/units';
import { getJob } from '../../src/config/jobs';

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
    expect(WEAPONS.maul).toMatchObject({ power: 3 });
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

describe('R2-2 装备校验、普攻条目化与默认装备', () => {
  it('装备校验：合法双槽通过（剑盾类别装长剑+铁盾；同条目双持合法）', () => {
    expect(validateEquipment(['sword', 'shield'], ['longsword', 'ironShield'])).toEqual([]);
    expect(validateEquipment(['dagger'], ['killingDagger', 'killingDagger'])).toEqual([]);
  });

  it('装备校验：类别外条目拒绝（盗贼类别不能装长剑）', () => {
    const errors = validateEquipment(['dagger'], ['longsword']);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('类别');
  });

  it('装备校验：超出槽位上限拒绝（3 条 > 2）', () => {
    const errors = validateEquipment(['sword', 'shield'], ['longsword', 'rapier', 'ironShield']);
    expect(errors.join('；')).toContain('槽');
  });

  it('装备校验：未知条目 id 拒绝', () => {
    const errors = validateEquipment(['sword'], ['nope']);
    expect(errors.join('；')).toContain('未知');
  });

  it('普攻条目化：双武器角色两条普攻（领主默认装备 = 长剑+刺剑）', () => {
    const skills = basicAttackSkills(['longsword', 'rapier']);
    expect(skills.map(s => s.name)).toEqual(['长剑·普攻', '刺剑·普攻']);
    expect(skills[0]).toMatchObject({ damageType: 'slashing', power: 2, rangeMin: 1, rangeMax: 1, target: 'enemy' });
    expect(skills[1]).toMatchObject({ damageType: 'piercing', power: 2 });
  });

  it('盾条目不供普攻（长剑+铁盾 → 仅 1 条普攻；双盾 → 0 条）', () => {
    expect(basicAttackSkills(['longsword', 'ironShield']).map(s => s.name)).toEqual(['长剑·普攻']);
    expect(basicAttackSkills(['ironShield', 'ironShield'])).toEqual([]);
    expect(basicAttackSkills([])).toEqual([]);
  });

  it('条目 counters 与威力传入普攻技能（弑骑战锤普攻带骑兵 ×1.5）', () => {
    const skills = basicAttackSkills(['cavalierSlayer']);
    expect(skills[0].counters).toEqual({ cavalry: 1.5 });
    expect(skills[0].power).toBe(3);
  });

  it('槽位上限常量 = 2（§4.14 全局可配）', () => {
    expect(WEAPON_SLOT_LIMIT).toBe(2);
  });

  it('17 模板默认装备齐备且全部通过类别校验（R2-4 类别源 = JobConfig.equipmentClass）', () => {
    for (const t of [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES]) {
      expect(t.defaultEquipment, `${t.id} 未配默认装备`).toBeDefined();
      const errors = validateEquipment(getJob(t.id)!.equipmentClass, t.defaultEquipment!);
      expect(errors, `${t.id}: ${errors.join('；')}`).toEqual([]);
    }
  });

  it('出厂默认装备与 §4.14 出厂表一致（抽查）', () => {
    expect(getTemplate('lord')!.defaultEquipment).toEqual(['longsword', 'rapier']);
    expect(getTemplate('defender')!.defaultEquipment).toEqual(['longsword', 'ironShield']);
    expect(getTemplate('paladin')!.defaultEquipment).toEqual(['maul', 'ironShield']);
    expect(getTemplate('thief')!.defaultEquipment).toEqual(['dagger', 'killingDagger']);
    expect(getTemplate('knight')!.defaultEquipment).toEqual(['spear', 'naginata']);
    expect(getTemplate('pegasus')!.defaultEquipment).toEqual(['spear']);
    expect(getTemplate('axeman')!.defaultEquipment).toEqual(['warAxe', 'bluntAxe']);
    expect(getTemplate('archer')!.defaultEquipment).toEqual(['longbow', 'killingBow']);
    expect(getTemplate('priest')!.defaultEquipment).toEqual(['staff']);
    expect(getTemplate('mage')!.defaultEquipment).toEqual(['staff']);
    expect(getTemplate('swordsman')!.defaultEquipment).toEqual(['longsword']);
    expect(getTemplate('boss')!.defaultEquipment).toEqual(['cavalierSlayer']);
  });
});
