import type { UnitState } from './unit';
import type { UnitTemplate } from '../config/units';
import type { SkillTemplate } from '../config/skills';
import type { Faction } from './types';
import { RESOURCE_PARAMS } from '../config/combat';
import { getJob } from '../config/jobs';

/** 主资源槽（§4.13）：三资源共用结构，差异在配置的生成/恢复规则 */
export interface ResourceState {
  type: 'mp' | 'rage' | 'focus';
  current: number;
  max: number;
}

/** 按模板初始化：怒气 0 空起 / 专注满 / MP = mag×5 满（R2-4 资源类型源 = JobConfig） */
export function initResources(template: UnitTemplate): ResourceState {
  switch (getJob(template.id)!.resourceType) {
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

// ---------- R5-2 生成与恢复（§4.13） ----------

/** 入池（封顶上限）：附属段/特性段资源生成共用 */
export function gainResource(unit: UnitState, amount: number): void {
  unit.resources.current = Math.min(unit.resources.max, unit.resources.current + amount);
}

/** 攻击命中积攒：怒气任意攻击命中 +10；专注/MP 仅普攻命中 +5（§4.9/§4.13） */
export function gainOnHit(unit: UnitState, isBasic: boolean): void {
  if (unit.resources.type === 'rage') {
    gainResource(unit, RESOURCE_PARAMS.ragePerHit);
  } else if (isBasic && unit.resources.type === 'focus') {
    gainResource(unit, RESOURCE_PARAMS.basicGainFocus);
  } else if (isBasic && unit.resources.type === 'mp') {
    gainResource(unit, RESOURCE_PARAMS.basicGainMp);
  }
}

/** 受击积攒：仅怒气系 +8 */
export function gainOnStruck(unit: UnitState): void {
  if (unit.resources.type === 'rage') {
    gainResource(unit, RESOURCE_PARAMS.ragePerHitTaken);
  }
}

/** 暴击额外积攒（R7-1 §4.3/§4.13）：出手方暴击且主资源 = 怒气时 +15；专注/MP 系无额外资源 */
export function gainOnCrit(unit: UnitState): void {
  if (unit.resources.type === 'rage') {
    gainResource(unit, RESOURCE_PARAMS.ragePerCrit);
  }
}

/** 阶段开始资源推进（§4.13）：专注固定回 20；MP 歇息（上回合未施法）回 15 后重置标记 */
export function tickResources(units: UnitState[], faction: Faction): void {
  for (const u of units) {
    if (u.faction !== faction || u.hp <= 0) continue;
    if (u.resources.type === 'focus') {
      gainResource(u, RESOURCE_PARAMS.focusRegenPerTurn);
    }
    if (u.resources.type === 'mp' && !u.castSpellThisTurn) {
      gainResource(u, RESOURCE_PARAMS.mpRestRegen);
    }
    u.castSpellThisTurn = false;
  }
}
