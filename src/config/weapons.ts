import type { DamageType } from '../core/types';
import type { WeaponAtom } from './skills';
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

export const WEAPONS: Record<string, WeaponItem> = {
  longsword: { id: 'longsword', name: '长剑', weaponType: 'sword', damageType: 'slashing', power: 2, rangeMin: 1, rangeMax: 1 },
  rapier: { id: 'rapier', name: '刺剑', weaponType: 'sword', damageType: 'piercing', power: 2, rangeMin: 1, rangeMax: 1 },
  killingSword: { id: 'killingSword', name: '必杀剑', weaponType: 'sword', damageType: 'slashing', power: 0, rangeMin: 1, rangeMax: 1, critBonus: 10 },
  spear: { id: 'spear', name: '长枪', weaponType: 'spear', damageType: 'piercing', power: 2, rangeMin: 1, rangeMax: 1 },
  naginata: { id: 'naginata', name: '薙刀', weaponType: 'spear', damageType: 'slashing', power: 2, rangeMin: 1, rangeMax: 1 },
  warAxe: { id: 'warAxe', name: '战斧', weaponType: 'axe', damageType: 'slashing', power: 3, rangeMin: 1, rangeMax: 1 },
  bluntAxe: { id: 'bluntAxe', name: '钝斧', weaponType: 'axe', damageType: 'blunt', power: 3, rangeMin: 1, rangeMax: 1 },
  warHammer: { id: 'warHammer', name: '战锤', weaponType: 'hammer', damageType: 'blunt', power: 3, rangeMin: 1, rangeMax: 1 },
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
