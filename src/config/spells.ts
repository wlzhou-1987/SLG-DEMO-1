import type { ArmorType } from '../core/types';
import type { SkillTemplate } from './skills';

/** 法术是技能子类（§4.12），额外携带释放方式与生效方式两个维度 */
export interface SpellTemplate extends SkillTemplate {
  power: number;                                  // 固定值加项（治疗基数/护盾吸收；伤害类并入统一公式固定值）
  castMode: 'instant' | 'chant';                  // 释放方式
  chantTurns?: number;                            // 咏唱回合数
  effectMode: 'instant' | 'lasting';              // 生效方式（R10：delayed 退役，伤害持续走 dot）
  durationTurns?: number;                         // 持续/护盾回合数
  targetType: 'enemy' | 'ally';                   // 增益（ally）必中
  shield?: { armorType: ArmorType; absorb: number }; // 护甲覆盖（§4.10）
}

export const SPELLS: Record<string, SpellTemplate> = {
  fireball: {
    id: 'fireball', name: '火球', target: 'enemy', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 15,
    power: 0, castMode: 'instant', effectMode: 'instant', targetType: 'enemy'
  },
  meteor: {
    id: 'meteor', name: '陨石术', target: 'enemy', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 35,
    power: 6, castMode: 'chant', chantTurns: 2, effectMode: 'instant', targetType: 'enemy',
    area: { shape: 'disc', radius: 1 },
    armorResist: { heavy: 1.5 }  // R4-8 法术破重甲钥匙（§4.12：法术级对护甲克制）
  },
  curse: {
    id: 'curse', name: '咒杀', target: 'enemy', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 25,
    // R7-3 数值定稿：power 14——生态位 = 高魔防目标（敌法 mdef15 总伤 23 > 火球+pyro 总效 22）
    // 与非 pyro MP 系（牧师总伤 30 vs 火球 16）；低防目标仍火球优（即时+可暴），分工成立
    power: 14, castMode: 'instant', effectMode: 'lasting', durationTurns: 3, targetType: 'enemy'
  },
  heal: {
    id: 'heal', name: '治疗', target: 'ally', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 12,
    weights: { mag: 0.5 }, power: 0, castMode: 'instant', effectMode: 'instant', targetType: 'ally'
  },
  regen: {
    id: 'regen', name: '再生术', target: 'ally', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 20,
    weights: { mag: 0.25 }, power: 0, castMode: 'instant', effectMode: 'lasting', durationTurns: 3, targetType: 'ally'
  },
  mithrilShield: {
    id: 'mithrilShield', name: '秘银护盾', target: 'ally', learnable: true,
    damageType: 'magic', rangeMin: 1, rangeMax: 2,
    resourceType: 'mp', cost: 20,
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
