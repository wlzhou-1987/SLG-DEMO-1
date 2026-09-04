import type { ArmorType, Faction } from './types';
import type { UnitState } from './unit';
import type { UnitTemplate } from '../config/units';
import type { SpellTemplate } from '../config/spells';

export interface ChantStatus {
  type: 'chant';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  spell: SpellTemplate;
  targetId: string;
}

export interface DelayedStatus {
  type: 'delayed';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  damage: number;
}

export interface RegenStatus {
  type: 'regen';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  healPerTurn: number;
}

export interface ShieldStatus {
  type: 'shield';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  armorType: ArmorType;
  absorbLeft: number;
}

export type ActiveStatus = ChantStatus | DelayedStatus | RegenStatus | ShieldStatus;

export type StatusEvent =
  | { kind: 'chantFire'; unitId: string; spell: SpellTemplate; targetId: string }
  | { kind: 'delayedFire'; unitId: string; skillName: string; damage: number }
  | { kind: 'regenTick'; unitId: string; healed: number }
  | { kind: 'statusExpired'; unitId: string; skillName: string };

/** 护甲解析（§4.10）：活跃护盾按后生效覆盖先生效，无护盾回落兵种基础 */
export function resolveArmor(
  unit: UnitState,
  template: UnitTemplate
): { armor: ArmorType; shield: ShieldStatus | undefined } {
  let shield: ShieldStatus | undefined;
  for (const s of unit.statuses) {
    if (s.type === 'shield') shield = s;  // 数组顺序即生效顺序，取最后
  }
  return { armor: shield?.armorType ?? template.armor, shield };
}

/**
 * 阶段开始推进指定阵营单位的状态（目标所属方阶段开始 tick，已确认规则）。
 * 直接修改单位 HP/状态数组，返回事件供表现层播放；chantFire 仅报告，法术结算由调用方执行。
 */
export function tickStatuses(units: UnitState[], faction: Faction): StatusEvent[] {
  const events: StatusEvent[] = [];

  for (const unit of units) {
    if (unit.faction !== faction) continue;
    const removed: ActiveStatus[] = [];

    for (const status of unit.statuses) {
      switch (status.type) {
        case 'chant': {
          status.turnsLeft--;
          if (status.turnsLeft <= 0) {
            events.push({ kind: 'chantFire', unitId: unit.id, spell: status.spell, targetId: status.targetId });
            removed.push(status);
          }
          break;
        }
        case 'delayed': {
          status.turnsLeft--;
          if (status.turnsLeft <= 0) {
            unit.hp = Math.max(0, unit.hp - status.damage);
            events.push({ kind: 'delayedFire', unitId: unit.id, skillName: status.skillName, damage: status.damage });
            removed.push(status);
          }
          break;
        }
        case 'regen': {
          const healed = Math.min(status.healPerTurn, unit.maxHp - unit.hp);
          unit.hp += healed;
          events.push({ kind: 'regenTick', unitId: unit.id, healed });
          status.turnsLeft--;
          if (status.turnsLeft <= 0) {
            removed.push(status);
            events.push({ kind: 'statusExpired', unitId: unit.id, skillName: status.skillName });
          }
          break;
        }
        case 'shield': {
          status.turnsLeft--;
          if (status.turnsLeft <= 0) {
            removed.push(status);
            events.push({ kind: 'statusExpired', unitId: unit.id, skillName: status.skillName });
          }
          break;
        }
      }
    }

    if (removed.length > 0) {
      unit.statuses = unit.statuses.filter(s => !removed.includes(s));
    }
  }

  return events;
}

/** 咏唱打断（§4.12：主动行动即打断）。有咏唱被移除返回 true */
export function interruptChant(unit: UnitState): boolean {
  const before = unit.statuses.length;
  unit.statuses = unit.statuses.filter(s => s.type !== 'chant');
  return unit.statuses.length < before;
}
