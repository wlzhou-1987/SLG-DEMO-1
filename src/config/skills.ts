import type { DamageType } from '../core/types';
import type { AttrKey } from '../core/status';

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

/** 组合权重表（§4.3：键 = 属性，值 = 系数；技能/法术声明或职业缺省） */
export type StatWeights = Partial<Record<'str' | 'mag' | 'spd' | 'tec' | 'lck', number>>;

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
  desc?: string;                   // 详细功能描述（战前配置 UI 展示；法术继承）
  target: SkillTarget;
  damageType: DamageType;
  rangeMin: number;
  rangeMax: number;
  power?: number;
  subs?: SubEffect[];
  area?: EffectArea;
  resourceType?: ResourceType;
  cost?: number;                 // R5-1 资源消耗量（声明 cost 必须声明 resourceType；未声明 = 免费）
  weaponType?: WeaponAtom | WeaponAtom[];
  counters?: Partial<Record<string, number>>;
  instant?: boolean;
  learnable: boolean;
  /** R3-10 攻击修饰声明 */
  halfDefFromBack?: boolean;      // 背刺：背面攻击无视一半防御
  backPowerBonus?: number;        // 影袭：背面攻击威力提升
  critOverride?: boolean;         // 致命突袭：绝对必暴（声明先行，结算归 R7）
  critCapBonus?: number;         // R7-2 暴击上限突破（§4.3：上限 = 50 + Σ；首版消费者 = 瞄准射击蓄力触发一击 +20）
  noCounterIfMoved?: boolean;     // 空中突袭：本回合移动后释放不受反击
  chargeTurns?: number;           // 瞄准射击：物理蓄力（复用咏唱推进结构）
  rush?: boolean;                 // 冲杀：穿越位移（直线冲过目标格落背后）
  /** 附加伤害段（双伤害段结构，R3-7）：各段独立伤害线/威力过矩阵，与主段同侧同命中 */
  segments?: Array<{ damageType: DamageType; power?: number }>;
  /** R4-2 伤害段属性权重表：加权合成基数；缺省取职业 defaultWeights（§4.1 JobConfig，R2-4） */
  weights?: StatWeights;
  /** R4-3 法术级对护甲克制系数（法术线专用，替代矩阵 magic 行；未声明格取 1.0） */
  armorResist?: Partial<Record<'none' | 'light' | 'medium' | 'heavy', number>>;
  /** 行为主效果（行为技能）：主效果为行为段而非伤害段；damageType 为占位、不走伤害管线 */
  behavior?:
    | { kind: 'stealth' }
    | { kind: 'stance' }
    | { kind: 'buff'; stat: AttrKey; amount: number; decay?: number; turns?: number }
    | { kind: 'shout' }
    | { kind: 'bloodlust'; atkUp: number; defDown: number; selfPct: number; rage: number };
}

export const SKILLS: Record<string, SkillTemplate> = {
  stealth: {
    id: 'stealth', name: '潜行', target: 'self', damageType: 'piercing',
    desc: '进入潜行：对敌方不可见；移动、攻击或使用技能后解除。消耗专注 30',
    rangeMin: 0, rangeMax: 0, resourceType: 'focus', cost: 30,
    behavior: { kind: 'stealth' }, learnable: true
  },
  defenseStance: {
    id: 'defenseStance', name: '防御姿态', target: 'self', damageType: 'blunt',
    desc: '进入防御姿态：防御提升，移动后解除',
    rangeMin: 0, rangeMax: 0, weaponType: 'shield',
    behavior: { kind: 'stance' }, learnable: false
  },
  blessing: {
    id: 'blessing', name: '祝福', target: 'self', damageType: 'blunt',
    desc: '魔防 +3，持续 5 回合、每回合衰减 1',
    rangeMin: 0, rangeMax: 0,
    behavior: { kind: 'buff', stat: 'mdef', amount: 3, decay: 1, turns: 5 },
    learnable: false
  },
  warCry: {
    id: 'warCry', name: '战斗怒吼', target: 'ally', damageType: 'blunt',
    desc: '自身与周围 1 格友军攻击 +2，持续 2 回合；自身怒气 +2',
    rangeMin: 0, rangeMax: 0, area: { shape: 'disc', radius: 1 },
    behavior: { kind: 'shout' },
    subs: [{ kind: 'resource', timing: 'immediate', resourceType: 'rage', amount: 2 }],
    learnable: false
  },
  stab: {
    id: 'stab', name: '刺击', target: 'enemy', damageType: 'piercing',
    desc: '对相邻敌人造成穿刺伤害；克制重装 ×1.8、骑兵 ×1.5。消耗怒气 40',
    rangeMin: 1, rangeMax: 1, weaponType: 'sword', resourceType: 'rage', cost: 40,
    counters: { heavy: 1.8, cavalry: 1.5 }, learnable: false
  },
  'backstab-strike': {
    id: 'backstab-strike', name: '背刺', target: 'enemy', damageType: 'piercing',
    desc: '对相邻敌人造成穿刺伤害；从背面攻击时无视目标一半防御',
    rangeMin: 1, rangeMax: 1, weaponType: 'dagger',
    halfDefFromBack: true, learnable: false
  },
  'shadow-strike': {
    id: 'shadow-strike', name: '影袭', target: 'enemy', damageType: 'piercing',
    desc: '对相邻敌人造成穿刺伤害；从背面攻击时威力 +4',
    rangeMin: 1, rangeMax: 1, weaponType: 'dagger',
    backPowerBonus: 4, learnable: false
  },
  deathblow: {
    id: 'deathblow', name: '致命突袭', target: 'enemy', damageType: 'piercing',
    desc: '对相邻敌人造成穿刺伤害；必定暴击',
    rangeMin: 1, rangeMax: 1, weaponType: 'spear',
    critOverride: true, learnable: false
  },
  'sky-strike': {
    id: 'sky-strike', name: '空中突袭', target: 'enemy', damageType: 'piercing',
    desc: '对相邻敌人造成穿刺伤害；必定暴击；本回合移动过后释放不受反击',
    rangeMin: 1, rangeMax: 1, weaponType: 'spear',
    critOverride: true, noCounterIfMoved: true, learnable: false
  },
  bloodlust: {
    id: 'bloodlust', name: '嗜血', target: 'self', damageType: 'slashing',
    desc: '瞬发（不结束行动）：自伤最大 HP 的 10%，攻击 +3、物防 -2 持续 3 回合，并获怒气 +2',
    rangeMin: 0, rangeMax: 0, weaponType: 'axe', instant: true,
    behavior: { kind: 'bloodlust', atkUp: 3, defDown: 2, selfPct: 0.1, rage: 2 },
    subs: [{ kind: 'resource', timing: 'immediate', resourceType: 'rage', amount: 2 }],
    learnable: false
  },
  'aim-shot': {
    id: 'aim-shot', name: '瞄准射击', target: 'enemy', damageType: 'piercing',
    desc: '对 2 格敌人蓄力 1 回合后射击：威力 +3、无视距离惩罚、暴击上限 +20%',
    rangeMin: 2, rangeMax: 2, weaponType: 'bow',
    chargeTurns: 1, backPowerBonus: 0, critCapBonus: 20, learnable: false
  },
  'charge-rush': {
    id: 'charge-rush', name: '冲杀', target: 'enemy', damageType: 'piercing',
    desc: '直线冲过 1~2 格外的目标、落到其背后并发动穿刺攻击；需直线通路且背后格可落',
    rangeMin: 1, rangeMax: 2, weaponType: 'spear',
    rush: true, learnable: false
  },
  'axe-butt': {
    id: 'axe-butt', name: '斧柄打击', target: 'enemy', damageType: 'blunt',
    desc: '对相邻敌人造成钝击伤害',
    rangeMin: 1, rangeMax: 1, weaponType: 'axe', learnable: true
  },
  shieldThrust: {
    id: 'shieldThrust', name: '盾突', target: 'enemy', damageType: 'blunt',
    desc: '对相邻敌人造成钝击伤害',
    rangeMin: 1, rangeMax: 1, weaponType: 'shield', learnable: false
  },
  warHammer: {
    id: 'warHammer', name: '重锤', target: 'enemy', damageType: 'blunt',
    desc: '对相邻敌人造成钝击伤害',
    rangeMin: 1, rangeMax: 1, weaponType: 'hammer', learnable: true
  },
  shieldStrike: {
    id: 'shieldStrike', name: '盾击', target: 'enemy', damageType: 'blunt',
    desc: '对相邻敌人造成钝击伤害',
    rangeMin: 1, rangeMax: 1, weaponType: 'shield', learnable: false
  },
  snipe: {
    id: 'snipe', name: '狙击', target: 'enemy', damageType: 'piercing',
    desc: '对 2 格敌人造成穿刺伤害；克制飞行 ×1.5',
    rangeMin: 2, rangeMax: 2, weaponType: 'bow',
    counters: { flying: 1.5 }, learnable: true
  },
  whirlwind: {
    id: 'whirlwind', name: '旋风斩', target: 'enemy', damageType: 'slashing',
    desc: '斩击自身周围 1 格内的所有敌人。消耗怒气 50',
    rangeMin: 1, rangeMax: 1, weaponType: 'axe', resourceType: 'rage', cost: 50,
    area: { shape: 'disc', radius: 1 }, learnable: false
  },
  holyShieldStrike: {
    id: 'holyShieldStrike', name: '神圣盾击', target: 'enemy', damageType: 'blunt',
    desc: '钝击正面扇形 1 格内的所有敌人',
    rangeMin: 1, rangeMax: 1, weaponType: 'shield',
    area: { shape: 'sector', radius: 1 }, learnable: false
  },
  sweep: {
    id: 'sweep', name: '横扫', target: 'enemy', damageType: 'slashing',
    desc: '对相邻敌人造成斩击伤害',
    rangeMin: 1, rangeMax: 1, weaponType: ['hammer', 'axe'], learnable: true
  }
};

export function getSkill(id: string): SkillTemplate | undefined {
  return SKILLS[id];
}
