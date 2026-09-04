import type { ArmorType } from '../core/types';
import type { SkillTemplate } from './units';

/** 法术是技能子类（§4.12），额外携带释放方式与生效方式两个维度 */
export interface SpellTemplate extends SkillTemplate {
  power: number;                                  // 威力基数（治疗/吸收/咒杀伤害 = power）
  castMode: 'instant' | 'chant';                  // 释放方式
  chantTurns?: number;                            // 咏唱回合数
  effectMode: 'instant' | 'delayed' | 'lasting';  // 生效方式
  durationTurns?: number;                         // 延时/持续/护盾回合数
  targetType: 'enemy' | 'ally';                   // 增益（ally）必中
  shield?: { armorType: ArmorType; absorb: number }; // 护甲覆盖（§4.10）
}

export const SPELLS: Record<string, SpellTemplate> = {
  fireball: {
    name: '火球', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 0, castMode: 'instant', effectMode: 'instant', targetType: 'enemy'
  },
  meteor: {
    name: '陨石术', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 6, castMode: 'chant', chantTurns: 2, effectMode: 'instant', targetType: 'enemy'
  },
  curse: {
    name: '咒杀', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 10, castMode: 'instant', effectMode: 'delayed', durationTurns: 3, targetType: 'enemy'
  },
  heal: {
    name: '治疗', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 10, castMode: 'instant', effectMode: 'instant', targetType: 'ally'
  },
  regen: {
    name: '再生术', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 5, castMode: 'instant', effectMode: 'lasting', durationTurns: 3, targetType: 'ally'
  },
  mithrilShield: {
    name: '秘银护盾', damageType: 'magic', rangeMin: 1, rangeMax: 2,
    power: 0, castMode: 'instant', effectMode: 'lasting', durationTurns: 3,
    targetType: 'ally', shield: { armorType: 'medium', absorb: 10 }
  }
};

export function getSpell(id: string): SpellTemplate | undefined {
  return SPELLS[id];
}

/** 判断技能是否为法术（携带释放/生效维度即为法术） */
export function isSpell(skill: SkillTemplate): skill is SpellTemplate {
  return 'castMode' in skill;
}
