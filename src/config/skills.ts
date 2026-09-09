import type { DamageType } from '../core/types';

/** 武器原子 8 种（§4.9：角色武器 = 原子数组，任意组合合法） */
export type WeaponAtom =
  | 'sword' | 'shield' | 'hammer' | 'dagger'
  | 'spear' | 'axe' | 'bow' | 'staff';

export const WEAPON_ATOMS: readonly WeaponAtom[] = [
  'sword', 'shield', 'hammer', 'dagger', 'spear', 'axe', 'bow', 'staff'
];

/** 主资源三枚举（§4.1：怒气/专注/MP，结算归 R5） */
export type ResourceType = 'mp' | 'rage' | 'focus';

export const RESOURCE_TYPES: readonly ResourceType[] = ['mp', 'rage', 'focus'];

/** 技能目标三值（§4.9 F1：ally/self 必中） */
export type SkillTarget = 'enemy' | 'self' | 'ally';

/** 附属段（§4.9 丙方案：按时间点封闭枚举三种；结算随 R3-9） */
export type SubEffect =
  | { kind: 'resource'; timing: 'immediate'; resourceType: ResourceType; amount: number }
  | { kind: 'status'; timing: 'onTurnStart'; statusId: string }
  | { kind: 'damage'; timing: 'onHit'; damageType: DamageType; power?: number };

/** AoE 效果区域声明（§4.9：disc 圆盘 / sector 朝向扇形；解算随 R3-7） */
export interface EffectArea {
  shape: 'disc' | 'sector';
  radius: number;
}

/**
 * SKILLS 注册表条目（物理攻击 + 行为技能）。
 * 主效果现以扁平伤害段承载（damageType/power），治疗/状态/行为段随 R3-7~R3-10 扩展。
 */
export interface SkillTemplate {
  id: string;
  name: string;
  target: SkillTarget;
  damageType: DamageType;
  rangeMin: number;
  rangeMax: number;
  power?: number;
  subs?: SubEffect[];
  area?: EffectArea;
  resourceType?: ResourceType;
  weaponType?: WeaponAtom | WeaponAtom[];
  counters?: Partial<Record<string, number>>;
  instant?: boolean;
  learnable: boolean;
}

export const SKILLS: Record<string, SkillTemplate> = {
  slash: {
    id: 'slash', name: '横斩', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: false
  },
  shieldThrust: {
    id: 'shieldThrust', name: '盾突', target: 'enemy', damageType: 'blunt',
    rangeMin: 1, rangeMax: 1, weaponType: 'shield', learnable: false
  },
  warHammer: {
    id: 'warHammer', name: '重锤', target: 'enemy', damageType: 'blunt',
    rangeMin: 1, rangeMax: 1, weaponType: 'hammer', learnable: true
  },
  shieldStrike: {
    id: 'shieldStrike', name: '盾击', target: 'enemy', damageType: 'blunt',
    rangeMin: 1, rangeMax: 1, weaponType: 'shield', learnable: false
  },
  thrust: {
    id: 'thrust', name: '突刺', target: 'enemy', damageType: 'piercing',
    rangeMin: 1, rangeMax: 1, weaponType: 'spear', learnable: false
  },
  heavyCleave: {
    id: 'heavyCleave', name: '重劈', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, weaponType: 'axe', learnable: false
  },
  shoot: {
    id: 'shoot', name: '射击', target: 'enemy', damageType: 'piercing',
    rangeMin: 2, rangeMax: 2, weaponType: 'bow', learnable: false
  },
  snipe: {
    id: 'snipe', name: '狙击', target: 'enemy', damageType: 'piercing',
    rangeMin: 2, rangeMax: 2, weaponType: 'bow', learnable: true
  },
  sweep: {
    id: 'sweep', name: '横扫', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, weaponType: ['hammer', 'axe'], learnable: true
  }
};

export function getSkill(id: string): SkillTemplate | undefined {
  return SKILLS[id];
}
