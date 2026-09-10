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
  }
};

export function getTrait(id: string): TraitConfig | undefined {
  return TRAIT_CONFIGS[id];
}
