import type { WeaponAtom } from './skills';

export interface TraitConfig {
  id: string;
  name: string;
  desc: string;
  learnable: boolean;          // F2：true=通用被动进池 / false=职业绑定仅模板引用
  weaponType?: WeaponAtom | WeaponAtom[]; // 声明即过滤（被动也可声明武器要求，§4.9）
  backstabMultiplier?: number; // 背刺：背面伤害乘算倍率（替代 +3 加算）
  revealRange?: number;        // 真实视野（§6 反制；随 R3-8 生效）
}

/** 特性修正层（§4.7 被动 + 职业强化，TRAIT_CONFIGS 注册表）：结算管线在修正点查询攻守双方特性 */
export const TRAIT_CONFIGS: Record<string, TraitConfig> = {
  're-move': {
    id: 're-move',
    name: '再移动',
    desc: '行动后可再移动（剩余移动力规则，§4.8）',
    learnable: false
  },
  backstab: {
    id: 'backstab',
    name: '背刺',
    desc: '背面攻击伤害加成由 +3 改为 ×1.5 乘算',
    learnable: false,
    backstabMultiplier: 1.5
  },
  steady: {
    id: 'steady',
    name: '沉稳',
    desc: '受到的部位命中补正减半',
    learnable: false
  },
  'true-sight': {
    id: 'true-sight',
    name: '真实视野',
    desc: '周围 revealRange 格内潜行单位对己方阵营可见、可选中攻击（潜行不取消）',
    learnable: true,
    revealRange: 3
  },
  'stealth-move': {
    id: 'stealth-move',
    name: '强化潜行',
    desc: '潜行状态下移动不取消潜行（攻击/使用技能仍取消）',
    learnable: false
  },
  ambush: {
    id: 'ambush',
    name: '突袭',
    desc: '隐形状态破隐一击附加伤害（结算随 R3-10 攻击修饰）',
    learnable: false
  },
  'shadow-hunter': {
    id: 'shadow-hunter',
    name: '隐秘猎手',
    desc: '潜行中发起蓄力射击不破隐、破隐一击附加伤害（蓄力结构随 R3-10）',
    learnable: false
  },
  fortify: {
    id: 'fortify',
    name: '强化防御姿态',
    desc: '防御姿态激活期间敌方不可经过身边、只能逐格挪（移动阻碍，R3-9）',
    learnable: false
  },
  'blessing-boost': {
    id: 'blessing-boost',
    name: '强化祝福',
    desc: '祝福期间每回合开始回复生命并暂存怒气计数（结算归 R5）',
    learnable: false
  },
  aura: {
    id: 'aura',
    name: '光环',
    desc: '周围 2 格内友军攻击力提升（每回合按持有者位置刷新）',
    learnable: false
  },
  'charge-bonus': {
    id: 'charge-bonus',
    name: '冲锋',
    desc: '移动格数线性转化为攻击加成（普攻与技能均享受）',
    learnable: false
  },
  berserk: {
    id: 'berserk',
    name: '低血狂战',
    desc: 'HP 越低攻击越高（线性）',
    learnable: false
  },
  vampiric: {
    id: 'vampiric',
    name: '强化嗜血',
    desc: '嗜血状态期间命中回复造成伤害的一半',
    learnable: false
  },
  'ww-enhance': {
    id: 'ww-enhance',
    name: '强化旋风斩',
    desc: '旋风斩附加第二段伤害（威力减半）',
    learnable: false
  },
  pyro: {
    id: 'pyro',
    name: '炎爆',
    desc: '火球术与陨石术伤害提升并附加灼烧 DoT',
    learnable: false
  },
  'heal-boost': {
    id: 'heal-boost',
    name: '强化治疗',
    desc: '治疗量随技巧提升；治疗/增益法术射程随技巧提升（动态射程）',
    learnable: false
  },
  pious: {
    id: 'pious',
    name: '虔诚',
    desc: '释放增益类法术时复制一半效果到治疗范围内随机友方',
    learnable: false
  },
  'eagle-eye': {
    id: 'eagle-eye',
    name: '鹰眼',
    desc: '远程命中 +30%、命中溢出转暴击（结算随 R7 落地）',
    learnable: false
  }
};

export function getTrait(id: string): TraitConfig | undefined {
  return TRAIT_CONFIGS[id];
}
