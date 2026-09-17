import type { Faction, ArmorType } from '../core/types';
import { SPELLS } from './spells';
import type { SpellTemplate } from './spells';
import { getSkill } from './skills';
import type { SkillTemplate } from './skills';

/** 兵种标签（§4.2 定稿：可扩展；含「飞行」标签即按飞行移动规则处理） */
export type UnitTag = 'infantry' | 'cavalry' | 'flying' | 'heavy' | 'monster' | 'dragon';

export const UNIT_TAGS: readonly UnitTag[] = [
  'infantry', 'cavalry', 'flying', 'heavy', 'monster', 'dragon'
];

/** 飞行判定：unitTags 含「飞行」标签（R4-4 收编原 flying 布尔） */
export function isFlying(t: UnitTemplate): boolean {
  return t.unitTags.includes('flying');
}

/** 八维战斗属性（R4-1，终战档基线 GAME-DESIGN §5；MP 为资源属性归 R5 不在模板） */
export interface UnitTemplate {
  id: string;
  name: string;
  label: string;
  faction: Faction;
  armor: ArmorType;
  movePoints: number;
  unitTags: UnitTag[];         // 兵种标签（R4-4 正式化：counters 克制消费 + 飞行判定；步兵为显式标签）
  defaultEquipment: readonly string[];  // 出厂默认装备（武器条目 id，§4.14；普攻与武器过滤数据源；装备类别/资源类型/缺省权重已迁 JobConfig，R2-4）
  hp: number;
  str: number;                 // 力量：物理伤害基数
  mag: number;                 // 魔力：魔法伤害/治疗基数
  pdef: number;                // 物防：物理线减伤
  mdef: number;                // 魔防：魔法线减伤（× 魔防系数）
  spd: number;                 // 速：追击/回避驱动/先攻阈值
  tec: number;                 // 技：命中基数
  lck: number;                 // 运：回避基数
  skills: string[];            // 出厂主动（SKILLS/SPELLS id 引用；玩家可改，R3-3/R3-5）
  traits?: string[];           // 绑定被动 + 职业强化（TRAIT_CONFIGS id 引用）
}

export const PLAYER_TEMPLATES: UnitTemplate[] = [
  {
    id: 'lord', name: '领主', label: '领', faction: 'player',
    armor: 'light', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['longsword', 'rapier'],
    hp: 52, str: 21, mag: 0, pdef: 15, mdef: 9, spd: 17, tec: 19, lck: 14,
    traits: ['aura'],
    skills: ['stab']
  },
  {
    id: 'defender', name: '防战', label: '战', faction: 'player',
    armor: 'heavy', movePoints: 4,
    unitTags: ['heavy'],
    defaultEquipment: ['longsword', 'ironShield'],
    hp: 61, str: 19, mag: 0, pdef: 25, mdef: 11, spd: 12, tec: 16, lck: 10,
    traits: ['fortify'],
    skills: ['shieldThrust', 'defenseStance', 'warCry']
  },
  {
    id: 'paladin', name: '防骑', label: '骑', faction: 'player',
    armor: 'heavy', movePoints: 4,
    unitTags: ['heavy', 'cavalry'],
    defaultEquipment: ['maul', 'ironShield'],
    hp: 63, str: 28, mag: 0, pdef: 26, mdef: 12, spd: 10, tec: 15, lck: 9,
    traits: ['blessing-boost'],
    skills: ['shieldStrike', 'holyShieldStrike', 'blessing']
  },
  {
    id: 'thief', name: '盗贼', label: '贼', faction: 'player',
    armor: 'none', movePoints: 6,
    unitTags: ['infantry'],
    defaultEquipment: ['dagger', 'killingDagger'],
    hp: 46, str: 17, mag: 0, pdef: 10, mdef: 10, spd: 24, tec: 23, lck: 16,
    traits: ['backstab', 'stealth-move', 'ambush'],
    skills: ['stealth', 'backstab-strike', 'shadow-strike']
  },
  {
    id: 'knight', name: '骑士', label: '骑', faction: 'player',
    armor: 'medium', movePoints: 7,
    unitTags: ['cavalry'],
    defaultEquipment: ['spear', 'naginata'],
    hp: 54, str: 22, mag: 0, pdef: 17, mdef: 13, spd: 17, tec: 17, lck: 12,
    traits: ['re-move', 'charge-bonus'],
    skills: ['charge-rush']
  },
  {
    id: 'pegasus', name: '飞马', label: '马', faction: 'player',
    armor: 'light', movePoints: 7,
    unitTags: ['flying'],
    defaultEquipment: ['spear'],
    hp: 49, str: 17, mag: 0, pdef: 12, mdef: 15, spd: 21, tec: 18, lck: 15,
    traits: ['re-move'],
    skills: ['deathblow', 'sky-strike']
  },
  {
    id: 'axeman', name: '斧兵', label: '斧', faction: 'player',
    armor: 'medium', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['warAxe', 'bluntAxe'],
    hp: 58, str: 26, mag: 0, pdef: 14, mdef: 8, spd: 12, tec: 15, lck: 9,
    traits: ['berserk', 'vampiric', 'ww-enhance'],
    skills: ['bloodlust', 'whirlwind']
  },
  {
    id: 'archer', name: '弓箭', label: '弓', faction: 'player',
    armor: 'none', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['longbow', 'killingBow'],
    hp: 45, str: 19, mag: 0, pdef: 11, mdef: 8, spd: 15, tec: 19, lck: 12,
    traits: ['shadow-hunter', 'eagle-eye'],
    skills: ['snipe', 'aim-shot']
  },
  {
    id: 'priest', name: '牧师', label: '牧', faction: 'player',
    armor: 'none', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['staff'],
    hp: 46, str: 9, mag: 21, pdef: 8, mdef: 17, spd: 13, tec: 16, lck: 13,
    traits: ['heal-boost', 'pious'],
    skills: ['heal', 'regen', 'mithrilShield']
  },
  {
    id: 'mage', name: '法师', label: '法', faction: 'player',
    armor: 'none', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['staff'],
    hp: 41, str: 14, mag: 24, pdef: 8, mdef: 18, spd: 14, tec: 17, lck: 11,
    traits: ['pyro'],
    skills: ['fireball', 'meteor', 'curse']
  }
];

export const ENEMY_TEMPLATES: UnitTemplate[] = [
  {
    id: 'swordsman', name: '剑士', label: '剑', faction: 'enemy',
    armor: 'light', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['longsword'],
    hp: 39, str: 18, mag: 0, pdef: 11, mdef: 5, spd: 17, tec: 16, lck: 8,
    skills: []
  },
  {
    id: 'spearman', name: '枪兵', label: '枪', faction: 'enemy',
    armor: 'medium', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['spear'],
    hp: 38, str: 18, mag: 0, pdef: 13, mdef: 5, spd: 11, tec: 13, lck: 7,
    skills: []
  },
  {
    id: 'axeman_enemy', name: '斧兵', label: '斧', faction: 'enemy',
    armor: 'heavy', movePoints: 5,
    unitTags: ['heavy'],
    defaultEquipment: ['warAxe'],
    hp: 43, str: 21, mag: 0, pdef: 11, mdef: 5, spd: 11, tec: 12, lck: 6,
    skills: []
  },
  {
    id: 'hammerman', name: '锤兵', label: '锤', faction: 'enemy',
    armor: 'medium', movePoints: 4,
    unitTags: ['heavy'],
    defaultEquipment: ['maul'],
    hp: 37, str: 21, mag: 0, pdef: 14, mdef: 6, spd: 10, tec: 12, lck: 6,
    skills: ['warHammer']
  },
  {
    id: 'archer_enemy', name: '弓手', label: '弓', faction: 'enemy',
    armor: 'none', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['longbow'],
    hp: 36, str: 17, mag: 0, pdef: 9, mdef: 5, spd: 12, tec: 15, lck: 7,
    skills: ['snipe']
  },
  {
    id: 'mage_enemy', name: '敌方法师', label: '法', faction: 'enemy',
    armor: 'none', movePoints: 5,
    unitTags: ['infantry'],
    defaultEquipment: ['staff'],
    hp: 33, str: 15, mag: 14, pdef: 7, mdef: 15, spd: 12, tec: 15, lck: 7,
    skills: ['fireball']
  },
  {
    id: 'boss', name: 'BOSS', label: 'B', faction: 'enemy',
    armor: 'heavy', movePoints: 4,
    unitTags: ['heavy'],
    defaultEquipment: ['cavalierSlayer'],
    hp: 72, str: 26, mag: 0, pdef: 12, mdef: 8, spd: 12, tec: 16, lck: 4,
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

/** 普攻合成见 config/weapons.ts basicAttackSkills（R2-2 起按装备条目构造，模板 basicAttack 字段退役） */

/** 再移动判定（R8 reMove 技能化：改为模板绑定被动） */
export function hasTemplateTrait(t: UnitTemplate, traitId: string): boolean {
  return (t.traits ?? []).includes(traitId);
}
