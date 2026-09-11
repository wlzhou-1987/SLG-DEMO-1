import type { UnitState } from './unit';
import type { UnitTemplate } from '../config/units';
import type { SkillTemplate } from '../config/skills';
import { RESOURCE_PARAMS } from '../config/combat';

/** 主资源槽（§4.13）：三资源共用结构，差异在配置的生成/恢复规则 */
export interface ResourceState {
  type: 'mp' | 'rage' | 'focus';
  current: number;
  max: number;
}

/** 按模板初始化：怒气 0 空起 / 专注满 / MP = mag×5 满 */
export function initResources(template: UnitTemplate): ResourceState {
  switch (template.resourceType) {
    case 'rage':
      return { type: 'rage', current: 0, max: RESOURCE_PARAMS.rageMax };
    case 'focus':
      return { type: 'focus', current: RESOURCE_PARAMS.focusMax, max: RESOURCE_PARAMS.focusMax };
    case 'mp':
      return { type: 'mp', current: template.mag * RESOURCE_PARAMS.mpPerMag, max: template.mag * RESOURCE_PARAMS.mpPerMag };
  }
}

/** 资源是否够付（未声明 cost 恒可付——普攻与免费技能） */
export function canAfford(unit: UnitState, skill: SkillTemplate): boolean {
  if (skill.cost === undefined) return true;
  return unit.resources.current >= skill.cost;
}

/** 扣费（施放前调用）：不足拒扣返回 false，资源不变 */
export function payCost(unit: UnitState, skill: SkillTemplate): boolean {
  if (!canAfford(unit, skill)) return false;
  if (skill.cost !== undefined) unit.resources.current -= skill.cost;
  return true;
}

/** 全额返还（咏唱被打断）：不超上限 */
export function refundCost(unit: UnitState, skill: SkillTemplate): void {
  if (skill.cost === undefined) return;
  unit.resources.current = Math.min(unit.resources.max, unit.resources.current + skill.cost);
}
