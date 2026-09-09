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
  }
};

export function getTrait(id: string): TraitConfig | undefined {
  return TRAIT_CONFIGS[id];
}
