import type { Faction, ArmorType, DamageType } from '../core/types';
import { SPELLS } from './spells';
import type { SpellTemplate } from './spells';

export interface SkillTemplate {
  name: string;
  damageType: DamageType;
  rangeMin: number;
  rangeMax: number;
  power?: number;  // 威力修正（缺省 0）
}

export interface UnitTemplate {
  id: string;
  name: string;
  label: string;
  faction: Faction;
  armor: ArmorType;
  movePoints: number;
  flying: boolean;
  reMove: boolean;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tec: number;
  lck: number;
  skills: (SkillTemplate | SpellTemplate)[];
  traits?: string[];
}

export const PLAYER_TEMPLATES: UnitTemplate[] = [
  {
    id: 'lord', name: '领主', label: '领', faction: 'player',
    armor: 'light', movePoints: 5, flying: false, reMove: false,
    hp: 29, atk: 10, def: 6, spd: 9, tec: 10, lck: 7,
    skills: [
      { name: '横斩', damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
      { name: '盾突', damageType: 'blunt', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'defender', name: '防战', label: '战', faction: 'player',
    armor: 'heavy', movePoints: 4, flying: false, reMove: false,
    hp: 33, atk: 8, def: 9, spd: 5, tec: 8, lck: 4,
    skills: [
      { name: '横斩', damageType: 'slashing', rangeMin: 1, rangeMax: 1 },
      { name: '盾突', damageType: 'blunt', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'paladin', name: '防骑', label: '骑', faction: 'player',
    armor: 'heavy', movePoints: 4, flying: false, reMove: false,
    hp: 35, atk: 11, def: 10, spd: 3, tec: 7, lck: 3,
    skills: [
      { name: '重锤', damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
      { name: '盾击', damageType: 'blunt', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'thief', name: '盗贼', label: '贼', faction: 'player',
    armor: 'none', movePoints: 6, flying: false, reMove: false,
    hp: 25, atk: 8, def: 3, spd: 12, tec: 11, lck: 8,
    traits: ['backstab'],
    skills: [
      { name: '突刺', damageType: 'piercing', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'knight', name: '骑士', label: '骑', faction: 'player',
    armor: 'medium', movePoints: 7, flying: false, reMove: true,
    hp: 29, atk: 10, def: 7, spd: 8, tec: 8, lck: 5,
    skills: [
      { name: '突刺', damageType: 'piercing', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'pegasus', name: '飞马', label: '马', faction: 'player',
    armor: 'light', movePoints: 7, flying: true, reMove: false,
    hp: 27, atk: 9, def: 5, spd: 11, tec: 9, lck: 7,
    skills: [
      { name: '突刺', damageType: 'piercing', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'axeman', name: '斧兵', label: '斧', faction: 'player',
    armor: 'medium', movePoints: 5, flying: false, reMove: false,
    hp: 31, atk: 12, def: 6, spd: 5, tec: 7, lck: 3,
    skills: [
      { name: '重劈', damageType: 'slashing', rangeMin: 1, rangeMax: 1 }
    ]
  },
  {
    id: 'archer', name: '弓箭', label: '弓', faction: 'player',
    armor: 'none', movePoints: 5, flying: false, reMove: false,
    hp: 25, atk: 9, def: 4, spd: 7, tec: 9, lck: 5,
    skills: [
      { name: '射击', damageType: 'piercing', rangeMin: 2, rangeMax: 2 },
      { name: '狙击', damageType: 'piercing', rangeMin: 2, rangeMax: 2 }
    ]
  },
  {
    id: 'priest', name: '牧师', label: '牧', faction: 'player',
    armor: 'none', movePoints: 5, flying: false, reMove: false,
    hp: 23, atk: 4, def: 3, spd: 6, tec: 8, lck: 6,
    traits: ['steady'],
    skills: [SPELLS.heal, SPELLS.regen, SPELLS.mithrilShield]
  },
  {
    id: 'mage', name: '法师', label: '法', faction: 'player',
    armor: 'none', movePoints: 5, flying: false, reMove: false,
    hp: 23, atk: 8, def: 3, spd: 7, tec: 9, lck: 5,
    skills: [SPELLS.fireball, SPELLS.meteor, SPELLS.curse]
  }
];

export const ENEMY_TEMPLATES: UnitTemplate[] = [
  {
    id: 'swordsman', name: '剑士', label: '剑', faction: 'enemy',
    armor: 'light', movePoints: 5, flying: false, reMove: false,
    hp: 16, atk: 5, def: 4, spd: 8, tec: 8, lck: 4,
    skills: [{ name: '横斩', damageType: 'slashing', rangeMin: 1, rangeMax: 1 }]
  },
  {
    id: 'spearman', name: '枪兵', label: '枪', faction: 'enemy',
    armor: 'medium', movePoints: 5, flying: false, reMove: false,
    hp: 18, atk: 6, def: 5, spd: 4, tec: 6, lck: 3,
    skills: [{ name: '突刺', damageType: 'piercing', rangeMin: 1, rangeMax: 1 }]
  },
  {
    id: 'axeman_enemy', name: '斧兵', label: '斧', faction: 'enemy',
    armor: 'heavy', movePoints: 5, flying: false, reMove: false,
    hp: 19, atk: 8, def: 4, spd: 4, tec: 5, lck: 2,
    skills: [{ name: '重劈', damageType: 'slashing', rangeMin: 1, rangeMax: 1 }]
  },
  {
    id: 'hammerman', name: '锤兵', label: '锤', faction: 'enemy',
    armor: 'medium', movePoints: 4, flying: false, reMove: false,
    hp: 18, atk: 7, def: 5, spd: 3, tec: 5, lck: 2,
    skills: [{ name: '重锤', damageType: 'blunt', rangeMin: 1, rangeMax: 1 }]
  },
  {
    id: 'archer_enemy', name: '弓手', label: '弓', faction: 'enemy',
    armor: 'none', movePoints: 5, flying: false, reMove: false,
    hp: 15, atk: 5, def: 3, spd: 5, tec: 7, lck: 3,
    skills: [
      { name: '射击', damageType: 'piercing', rangeMin: 2, rangeMax: 2 },
      { name: '狙击', damageType: 'piercing', rangeMin: 2, rangeMax: 2 }
    ]
  },
  {
    id: 'mage_enemy', name: '敌方法师', label: '法', faction: 'enemy',
    armor: 'none', movePoints: 5, flying: false, reMove: false,
    hp: 13, atk: 6, def: 2, spd: 5, tec: 7, lck: 3,
    skills: [SPELLS.fireball]
  },
  {
    id: 'boss', name: 'BOSS', label: 'B', faction: 'enemy',
    armor: 'heavy', movePoints: 4, flying: false, reMove: false,
    hp: 34, atk: 10, def: 6, spd: 6, tec: 9, lck: 5,
    skills: [
      { name: '重锤', damageType: 'blunt', rangeMin: 1, rangeMax: 1 },
      { name: '横扫', damageType: 'slashing', rangeMin: 1, rangeMax: 1 }
    ]
  }
];

export function getTemplate(templateId: string): UnitTemplate | undefined {
  return [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES].find(t => t.id === templateId);
}
