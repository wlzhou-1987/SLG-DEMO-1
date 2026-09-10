import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import { EFFECT_PARAMS } from '../config/combat';
import { enterStealth } from './stealth';
import { applyBuff } from './status';
import { distance } from './hex';

/** 附属段结算（§4.9 丙方案）：immediate 资源段计数暂存（结算归 R5） */
export function resolveSkillSubs(caster: UnitState, skill: SkillTemplate): void {
  for (const sub of skill.subs ?? []) {
    if (sub.kind === 'resource' && sub.timing === 'immediate') {
      caster.pendingResources = {
        ...caster.pendingResources,
        [sub.resourceType]: (caster.pendingResources?.[sub.resourceType] ?? 0) + sub.amount
      } as { rage?: number; focus?: number; mp?: number };
    }
  }
}

/** 战斗怒吼（ally AoE 增益）：自身与周围 1 格友军获得攻击增益 */
export function resolveShout(caster: UnitState, skill: SkillTemplate, units: UnitState[]): void {
  for (const u of units) {
    if (u.hp <= 0 || u.faction !== caster.faction) continue;
    if (u.id !== caster.id && distance(u.position, caster.position) > 1) continue;
    applyBuff(u, {
      skillName: skill.name,
      stat: 'atk',
      amount: EFFECT_PARAMS.warCryAtkBonus,
      turns: EFFECT_PARAMS.warCryTurns
    });
  }
}

/** 行为技能统一执行（§4.9 行为主效果）：潜行/防御姿态/祝福/战斗怒吼 */
export function executeBehavior(caster: UnitState, skill: SkillTemplate, units: UnitState[]): string {
  const b = skill.behavior;
  if (!b) return '';
  switch (b.kind) {
    case 'stealth': {
      enterStealth(caster);
      return `${caster.id} 进入潜行`;
    }
    case 'stance': {
      caster.statuses.push({
        type: 'stance', skillName: skill.name,
        turnsLeft: -1, appliedAtTurn: 0,
        stanceId: 'defense'
      });
      return `${caster.id} 进入防御姿态`;
    }
    case 'buff': {
      applyBuff(caster, {
        skillName: skill.name,
        stat: b.stat,
        amount: b.amount,
        decay: b.decay ?? 0,
        turns: b.turns
      });
      return `${caster.id} 获得 ${skill.name}`;
    }
    case 'shout': {
      resolveShout(caster, skill, units);
      resolveSkillSubs(caster, skill);
      return `${caster.id} 释放 ${skill.name}`;
    }
  }
}
