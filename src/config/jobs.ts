import type { WeaponAtom, ResourceType, StatWeights } from './skills';

/**
 * 职业配置（R2-4 实体化，§4.1）。
 * 模板即职业过渡：id = 模板 id、17 条一一对应（完整职业体系不做，§8）；
 * 三字段自 UnitTemplate/硬编码迁入——R2 装备类别 + R5 资源类型 + R4 缺省权重，模板字段已删防双真源。
 */
export interface JobConfig {
  equipmentClass: readonly WeaponAtom[];  // R2 装备类别（可装备原子集；装备校验源）
  resourceType: ResourceType;             // R5 主资源类型（资源初始化与技能资源过滤源）
  defaultWeights: {                       // R4 缺省权重（§4.3：技能/法术未声明 weights 时按伤害/效果线取）
    phys: StatWeights;  // 物理伤害线（迁自 combat.ts 硬编码 str×1）
    mag: StatWeights;   // 魔法伤害线（迁自 combat.ts 硬编码 mag×1）
    heal: StatWeights;  // 治疗/再生线（迁自 spell.ts 硬编码 mag×0.5）
  };
}

/** 首版全职业基准缺省（职业差异化留内容轮按条覆盖） */
const BASE_WEIGHTS: JobConfig['defaultWeights'] = { phys: { str: 1 }, mag: { mag: 1 }, heal: { mag: 0.5 } };

export const JOBS: Record<string, JobConfig> = {
  // 我方 10 职业
  lord: { equipmentClass: ['sword'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  defender: { equipmentClass: ['sword', 'shield'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  paladin: { equipmentClass: ['hammer', 'shield'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  thief: { equipmentClass: ['dagger'], resourceType: 'focus', defaultWeights: BASE_WEIGHTS },
  knight: { equipmentClass: ['spear'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  pegasus: { equipmentClass: ['spear'], resourceType: 'focus', defaultWeights: BASE_WEIGHTS },
  axeman: { equipmentClass: ['axe'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  archer: { equipmentClass: ['bow'], resourceType: 'focus', defaultWeights: BASE_WEIGHTS },
  priest: { equipmentClass: ['staff'], resourceType: 'mp', defaultWeights: BASE_WEIGHTS },
  mage: { equipmentClass: ['staff'], resourceType: 'mp', defaultWeights: BASE_WEIGHTS },
  // 敌方 7 职业（与我方共用清单，阵营强度由八维属性差表达 §5）
  swordsman: { equipmentClass: ['sword'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  spearman: { equipmentClass: ['spear'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  axeman_enemy: { equipmentClass: ['axe'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  hammerman: { equipmentClass: ['hammer'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS },
  archer_enemy: { equipmentClass: ['bow'], resourceType: 'focus', defaultWeights: BASE_WEIGHTS },
  mage_enemy: { equipmentClass: ['staff'], resourceType: 'mp', defaultWeights: BASE_WEIGHTS },
  boss: { equipmentClass: ['hammer'], resourceType: 'rage', defaultWeights: BASE_WEIGHTS }
};

export function getJob(jobId: string): JobConfig | undefined {
  return JOBS[jobId];
}
