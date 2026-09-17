import type { DamageType } from '../core/types';
import type { WeaponAtom } from './skills';
import type { SkillTemplate } from './skills';
import type { UnitTag } from './units';

/**
 * 武器条目（§4.14 R2 设计定稿）。
 * 普攻段 = 伤害线 + 威力 + 射程，三者齐备才供普攻形态（铁盾等纯原子供体不配）；
 * 条目无实例状态（无耐久/无强化/无库存唯一性）。
 */
export interface WeaponItem {
  id: string;
  name: string;
  weaponType: WeaponAtom;
  damageType?: DamageType;
  power?: number;
  rangeMin?: number;
  rangeMax?: number;
  critBonus?: number;
  counters?: Partial<Record<UnitTag, number>>;
}

/** 装备槽位上限（§4.14：全局统一可配常量） */
export const WEAPON_SLOT_LIMIT = 2;

export const WEAPONS: Record<string, WeaponItem> = {
  longsword: { id: 'longsword', name: '长剑', weaponType: 'sword', damageType: 'slashing', power: 2, rangeMin: 1, rangeMax: 1 },
  rapier: { id: 'rapier', name: '刺剑', weaponType: 'sword', damageType: 'piercing', power: 2, rangeMin: 1, rangeMax: 1 },
  killingSword: { id: 'killingSword', name: '必杀剑', weaponType: 'sword', damageType: 'slashing', power: 0, rangeMin: 1, rangeMax: 1, critBonus: 10 },
  spear: { id: 'spear', name: '长枪', weaponType: 'spear', damageType: 'piercing', power: 2, rangeMin: 1, rangeMax: 1 },
  naginata: { id: 'naginata', name: '薙刀', weaponType: 'spear', damageType: 'slashing', power: 2, rangeMin: 1, rangeMax: 1 },
  warAxe: { id: 'warAxe', name: '战斧', weaponType: 'axe', damageType: 'slashing', power: 3, rangeMin: 1, rangeMax: 1 },
  bluntAxe: { id: 'bluntAxe', name: '钝斧', weaponType: 'axe', damageType: 'blunt', power: 3, rangeMin: 1, rangeMax: 1 },
  maul: { id: 'maul', name: '战锤', weaponType: 'hammer', damageType: 'blunt', power: 3, rangeMin: 1, rangeMax: 1 },
  dagger: { id: 'dagger', name: '匕首', weaponType: 'dagger', damageType: 'piercing', power: 1, rangeMin: 1, rangeMax: 1 },
  killingDagger: { id: 'killingDagger', name: '必杀匕首', weaponType: 'dagger', damageType: 'piercing', power: -1, rangeMin: 1, rangeMax: 1, critBonus: 10 },
  longbow: { id: 'longbow', name: '长弓', weaponType: 'bow', damageType: 'piercing', power: 1, rangeMin: 2, rangeMax: 2 },
  killingBow: { id: 'killingBow', name: '必杀弓', weaponType: 'bow', damageType: 'piercing', power: -1, rangeMin: 2, rangeMax: 2, critBonus: 10 },
  staff: { id: 'staff', name: '法杖', weaponType: 'staff', damageType: 'blunt', power: 0, rangeMin: 1, rangeMax: 1 },
  ironShield: { id: 'ironShield', name: '铁盾', weaponType: 'shield' },
  cavalierSlayer: { id: 'cavalierSlayer', name: '弑骑战锤', weaponType: 'hammer', damageType: 'blunt', power: 3, rangeMin: 1, rangeMax: 1, counters: { cavalry: 1.5 } }
};

export function getWeapon(id: string): WeaponItem | undefined {
  return WEAPONS[id];
}

/** 装备原子并集（§4.14 技能武器过滤数据源：可学性读此并集，不读模板类别） */
export function equipmentAtoms(equipment: readonly string[]): WeaponAtom[] {
  return [...new Set(
    equipment.map(id => WEAPONS[id]?.weaponType).filter((w): w is WeaponAtom => w !== undefined)
  )];
}

/**
 * 装备校验（§4.14）：条目存在、原子 ∈ 职业装备类别、数量 ≤ 槽位上限；
 * 同条目双持合法（critBonus 求和为有意设计）。返回错误消息数组，空 = 合法。
 */
export function validateEquipment(
  classAtoms: readonly WeaponAtom[],
  equipment: readonly string[]
): string[] {
  const errors: string[] = [];
  if (equipment.length > WEAPON_SLOT_LIMIT) {
    errors.push(`装备超出槽位上限：${equipment.length} > ${WEAPON_SLOT_LIMIT}`);
  }
  for (const id of equipment) {
    const w = WEAPONS[id];
    if (!w) {
      errors.push(`未知武器条目: ${id}`);
    } else if (!classAtoms.includes(w.weaponType)) {
      errors.push(`武器类别不符: ${w.name}（${w.weaponType} ∉ [${classAtoms.join(', ')}]）`);
    }
  }
  return errors;
}

/**
 * 普攻条目化（§4.14）：每条供普攻段（伤害线/威力/射程齐备）的装备条目
 * 合成一条普攻技能（同构技能管线）；未配普攻段的条目（盾）不供普攻。
 */
export function basicAttackSkills(equipment: readonly string[]): SkillTemplate[] {
  return equipment
    .map(id => WEAPONS[id])
    .filter((w): w is WeaponItem => w !== undefined)
    .filter(w => w.damageType !== undefined && w.power !== undefined
      && w.rangeMin !== undefined && w.rangeMax !== undefined)
    .map(w => ({
      id: `basic:${w.id}`,
      name: `${w.name}·普攻`,
      target: 'enemy',
      damageType: w.damageType!,
      power: w.power,
      rangeMin: w.rangeMin!,
      rangeMax: w.rangeMax!,
      weaponType: w.weaponType,   // 普攻自带来源武器原子（rangeBonus 等技能级判定统一走此字段，§4.4）
      ...(w.counters ? { counters: w.counters } : {}),
      learnable: false
    }));
}
