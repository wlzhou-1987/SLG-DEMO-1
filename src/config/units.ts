import type { Faction, ArmorType, DamageType } from '../core/types';
import { SPELLS } from './spells';
import type { SpellTemplate } from './spells';
import { getSkill } from './skills';
import type { SkillTemplate, WeaponAtom, ResourceType } from './skills';

/** 普攻数据（§4.9：基础攻击=固有能力；伤害线/威力/射程为武器数据，R2 装备后由武器装备决定） */
export interface BasicAttackData {
  damageType: DamageType;
  power?: number;
  rangeMin: number;
  rangeMax: number;
}

export interface UnitTemplate {
  id: string;
  name: string;
  label: string;
  faction: Faction;
  armor: ArmorType;
  movePoints: number;
  flying: boolean;
  weapons: WeaponAtom[];       // 武器原子数组（任意组合合法，§4.9）
  resourceType: ResourceType;  // 主资源归属（§4.1；结算归 R5）
  basicAttack: BasicAttackData;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tec: number;
  lck: number;
  skills: string[];            // 出厂主动（SKILLS/SPELLS id 引用；玩家可改，R3-3/R3-5）
  traits?: string[];           // 绑定被动 + 职业强化（TRAIT_CONFIGS id 引用）
}

export const PLAYER_TEMPLATES: UnitTemplate[] = [
  {
    id: 'lord', name: '领主', label: '领', faction: 'player',
    armor: 'light', movePoints: 5, flying: false,
    weapons: ['sword'], resourceType: 'rage',
    basicAttack: { damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
    hp: 29, atk: 10, def: 6, spd: 9, tec: 10, lck: 7,
    skills: ['shieldThrust']
  },
  {
    id: 'defender', name: '防战', label: '战', faction: 'player',
    armor: 'heavy', movePoints: 4, flying: false,
    weapons: ['sword', 'shield'], resourceType: 'rage',
    basicAttack: { damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
    hp: 33, atk: 8, def: 9, spd: 5, tec: 8, lck: 4,
    skills: ['shieldThrust']
  },
  {
    id: 'paladin', name: '防骑', label: '骑', faction: 'player',
    armor: 'heavy', movePoints: 4, flying: false,
    weapons: ['hammer', 'shield'], resourceType: 'rage',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 35, atk: 11, def: 10, spd: 3, tec: 7, lck: 3,
    skills: ['warHammer', 'shieldStrike']
  },
  {
    id: 'thief', name: '盗贼', label: '贼', faction: 'player',
    armor: 'none', movePoints: 6, flying: false,
    weapons: ['dagger'], resourceType: 'focus',
    basicAttack: { damageType: 'piercing', rangeMin: 1, rangeMax: 1 },
    hp: 25, atk: 8, def: 3, spd: 12, tec: 11, lck: 8,
    traits: ['backstab'],
    skills: []
  },
  {
    id: 'knight', name: '骑士', label: '骑', faction: 'player',
    armor: 'medium', movePoints: 7, flying: false,
    weapons: ['spear'], resourceType: 'rage',
    basicAttack: { damageType: 'piercing', rangeMin: 1, rangeMax: 1 },
    hp: 29, atk: 10, def: 7, spd: 8, tec: 8, lck: 5,
    traits: ['re-move'],
    skills: []
  },
  {
    id: 'pegasus', name: '飞马', label: '马', faction: 'player',
    armor: 'light', movePoints: 7, flying: true,
    weapons: ['spear'], resourceType: 'focus',
    basicAttack: { damageType: 'piercing', rangeMin: 1, rangeMax: 1 },
    hp: 27, atk: 9, def: 5, spd: 11, tec: 9, lck: 7,
    skills: []
  },
  {
    id: 'axeman', name: '斧兵', label: '斧', faction: 'player',
    armor: 'medium', movePoints: 5, flying: false,
    weapons: ['axe'], resourceType: 'rage',
    basicAttack: { damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
    hp: 31, atk: 12, def: 6, spd: 5, tec: 7, lck: 3,
    skills: []
  },
  {
    id: 'archer', name: '弓箭', label: '弓', faction: 'player',
    armor: 'none', movePoints: 5, flying: false,
    weapons: ['bow'], resourceType: 'focus',
    basicAttack: { damageType: 'piercing', rangeMin: 2, rangeMax: 2 },
    hp: 25, atk: 9, def: 4, spd: 7, tec: 9, lck: 5,
    skills: ['snipe']
  },
  {
    id: 'priest', name: '牧师', label: '牧', faction: 'player',
    armor: 'none', movePoints: 5, flying: false,
    weapons: ['staff'], resourceType: 'mp',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 23, atk: 4, def: 3, spd: 6, tec: 8, lck: 6,
    traits: ['steady'],
    skills: ['heal', 'regen', 'mithrilShield']
  },
  {
    id: 'mage', name: '法师', label: '法', faction: 'player',
    armor: 'none', movePoints: 5, flying: false,
    weapons: ['staff'], resourceType: 'mp',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 23, atk: 8, def: 3, spd: 7, tec: 9, lck: 5,
    skills: ['fireball', 'meteor', 'curse']
  }
];

export const ENEMY_TEMPLATES: UnitTemplate[] = [
  {
    id: 'swordsman', name: '剑士', label: '剑', faction: 'enemy',
    armor: 'light', movePoints: 5, flying: false,
    weapons: ['sword'], resourceType: 'rage',
    basicAttack: { damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
    hp: 16, atk: 5, def: 4, spd: 8, tec: 8, lck: 4,
    skills: []
  },
  {
    id: 'spearman', name: '枪兵', label: '枪', faction: 'enemy',
    armor: 'medium', movePoints: 5, flying: false,
    weapons: ['spear'], resourceType: 'rage',
    basicAttack: { damageType: 'piercing', rangeMin: 1, rangeMax: 1 },
    hp: 18, atk: 6, def: 5, spd: 4, tec: 6, lck: 3,
    skills: []
  },
  {
    id: 'axeman_enemy', name: '斧兵', label: '斧', faction: 'enemy',
    armor: 'heavy', movePoints: 5, flying: false,
    weapons: ['axe'], resourceType: 'rage',
    basicAttack: { damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
    hp: 19, atk: 8, def: 4, spd: 4, tec: 5, lck: 2,
    skills: []
  },
  {
    id: 'hammerman', name: '锤兵', label: '锤', faction: 'enemy',
    armor: 'medium', movePoints: 4, flying: false,
    weapons: ['hammer'], resourceType: 'rage',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 18, atk: 7, def: 5, spd: 3, tec: 5, lck: 2,
    skills: ['warHammer']
  },
  {
    id: 'archer_enemy', name: '弓手', label: '弓', faction: 'enemy',
    armor: 'none', movePoints: 5, flying: false,
    weapons: ['bow'], resourceType: 'focus',
    basicAttack: { damageType: 'piercing', rangeMin: 2, rangeMax: 2 },
    hp: 15, atk: 5, def: 3, spd: 5, tec: 7, lck: 3,
    skills: ['snipe']
  },
  {
    id: 'mage_enemy', name: '敌方法师', label: '法', faction: 'enemy',
    armor: 'none', movePoints: 5, flying: false,
    weapons: ['staff'], resourceType: 'mp',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 13, atk: 6, def: 2, spd: 5, tec: 7, lck: 3,
    skills: ['fireball']
  },
  {
    id: 'boss', name: 'BOSS', label: 'B', faction: 'enemy',
    armor: 'heavy', movePoints: 4, flying: false,
    weapons: ['hammer'], resourceType: 'rage',
    basicAttack: { damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
    hp: 34, atk: 10, def: 6, spd: 6, tec: 9, lck: 5,
    skills: ['warHammer', 'sweep']
  }
];

export function getTemplate(templateId: string): UnitTemplate | undefined {
  return [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES].find(t => t.id === templateId);
}

/** id → SKILLS ∪ SPELLS 条目解析（模板 skills 为 id 引用） */
export function resolveSkill(id: string): SkillTemplate | SpellTemplate | undefined {
  return getSkill(id) ?? SPELLS[id];
}

/** 模板出厂技能解析（过滤悬空引用不做——注册表完整性由 tests/config 保证） */
export function getTemplateSkills(t: UnitTemplate): (SkillTemplate | SpellTemplate)[] {
  return t.skills
    .map(id => resolveSkill(id))
    .filter((s): s is SkillTemplate | SpellTemplate => s !== undefined);
}

/** 普攻合成为技能形态（§4.9：基础攻击=固有能力，不占技能位；结算走同一条管线） */
export function basicAttackSkill(t: UnitTemplate): SkillTemplate {
  return {
    id: 'basic',
    name: '普攻',
    target: 'enemy',
    damageType: t.basicAttack.damageType,
    power: t.basicAttack.power,
    rangeMin: t.basicAttack.rangeMin,
    rangeMax: t.basicAttack.rangeMax,
    learnable: false
  };
}

/** 再移动判定（R8 reMove 技能化：改为模板绑定被动） */
export function hasTemplateTrait(t: UnitTemplate, traitId: string): boolean {
  return (t.traits ?? []).includes(traitId);
}
