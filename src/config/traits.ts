export interface TraitConfig {
  id: string;
  name: string;
  desc: string;
}

/** 特性修正层示例（§4.7）：结算管线直接在修正点查询攻守双方特性 */
export const TRAIT_CONFIGS: Record<string, TraitConfig> = {
  backstab: {
    id: 'backstab',
    name: '背刺',
    desc: '背面攻击伤害加成由 +3 改为 ×1.5 乘算'
  },
  steady: {
    id: 'steady',
    name: '沉稳',
    desc: '受到的部位命中补正减半'
  }
};

export function getTrait(id: string): TraitConfig | undefined {
  return TRAIT_CONFIGS[id];
}
