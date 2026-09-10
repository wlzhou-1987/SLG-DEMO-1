import type { ArmorType, Faction } from './types';
import type { HexCoord } from './types';
import type { UnitState } from './unit';
import type { UnitTemplate } from '../config/units';
import type { SpellTemplate } from '../config/spells';
import { EFFECT_PARAMS } from '../config/combat';
import { distance } from './hex';

export interface ChantStatus {
  type: 'chant';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  spell: SpellTemplate;
  targetId: string;
  targetPos?: HexCoord;  // R3-7 AoE 法术：咏唱锁定的释放中心格（目标死移仍生效）
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

/** 潜行状态（§4.9：绝对隐身；跨回合维持无自然到期，turnsLeft=-1，仅三类主动行为取消） */
export interface StealthStatus {
  type: 'stealth';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
}

/** 属性增益 buff（R3-9）：可声明随回合衰减（祝福）；光环类经 source 标记每回合刷新 */
export interface BuffStatus {
  type: 'buff';
  skillName: string;
  turnsLeft: number;         // -1 = 无限（衰减归零或刷新移除）
  appliedAtTurn: number;
  stat: 'atk' | 'def';       // 过渡占位属性轴（R4 八维后祝福改魔防轴）
  amount: number;            // 当前剩余增益
  decay: number;             // 每回合衰减量（0 = 不衰减）
  source?: 'aura';           // 光环来源标记（tick 时统一刷新）
}

/** 姿态状态（R3-9 防御姿态）：部位判定参数化 + 移动取消；fortify 被动下封锁移动 */
export interface StanceStatus {
  type: 'stance';
  skillName: string;
  turnsLeft: number;         // -1 = 无限（移动取消）
  appliedAtTurn: number;
  stanceId: 'defense';
}

/** 灼烧 DoT（R3-10 炎爆）：每回合固定伤害 */
export interface DotStatus {
  type: 'dot';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  damagePerTurn: number;
}


export interface ChargeStatus {
  type: 'charge';
  skillName: string;
  turnsLeft: number;
  appliedAtTurn: number;
  skill: import('./../config/skills').SkillTemplate;
  targetId: string;
}

export type ActiveStatus = ChantStatus | DelayedStatus | RegenStatus | ShieldStatus | StealthStatus | BuffStatus | StanceStatus | ChargeStatus | DotStatus;

export type StatusEvent =
  | { kind: 'chantFire'; unitId: string; spell: SpellTemplate; targetId: string; targetPos?: HexCoord }
  | { kind: 'chargeFire'; unitId: string; skill: import('./../config/skills').SkillTemplate; targetId: string }
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
            events.push({ kind: 'chantFire', unitId: unit.id, spell: status.spell, targetId: status.targetId, targetPos: status.targetPos });
            removed.push(status);
          }
          break;
        }
        case 'dot': {
          unit.hp = Math.max(0, unit.hp - status.damagePerTurn);
          events.push({ kind: 'delayedFire', unitId: unit.id, skillName: status.skillName, damage: status.damagePerTurn });
          status.turnsLeft--;
          if (status.turnsLeft <= 0) removed.push(status);
          break;
        }
        case 'charge': {
          status.turnsLeft--;
          if (status.turnsLeft <= 0) {
            events.push({ kind: 'chargeFire', unitId: unit.id, skill: status.skill, targetId: status.targetId });
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
        case 'buff': {
          // R3-9：衰减 buff——每回合 amount-decay，归零移除；光环类（source）由刷新逻辑重建，tick 跳过
          if (status.source === 'aura') break;
          status.amount -= status.decay;
          status.turnsLeft--;
          if (status.decay > 0 && unit.loadout.passive.includes('blessing-boost')) {
            // 强化祝福：祝福期间每回合回血 + 怒气计数暂存（结算归 R5）
            unit.hp = Math.min(unit.maxHp, unit.hp + EFFECT_PARAMS.blessingBoostHeal);
            unit.pendingResources = {
              ...unit.pendingResources,
              rage: (unit.pendingResources?.rage ?? 0) + EFFECT_PARAMS.blessingBoostRage
            };
          }
          if (status.amount <= 0 || status.turnsLeft <= 0) {
            removed.push(status);
            events.push({ kind: 'statusExpired', unitId: unit.id, skillName: status.skillName });
          }
          break;
        }
        case 'stance': {
          break;  // 姿态无限维持，仅移动取消（R3-9）
        }
        case 'stealth': {
          break;  // 跨回合维持（R3-8）
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

/** 挂属性增益（R3-9）：同 skillName 的 buff 后生效覆盖先生效（§4.10 冲突规则口径） */
export function applyBuff(
  unit: UnitState,
  opts: { skillName: string; stat: 'atk' | 'def'; amount: number; decay?: number; turns?: number; source?: 'aura' }
): void {
  unit.statuses = unit.statuses.filter(
    s => !(s.type === 'buff' && s.skillName === opts.skillName)
  );
  unit.statuses.push({
    type: 'buff', skillName: opts.skillName,
    turnsLeft: opts.turns ?? -1,
    appliedAtTurn: 0,
    stat: opts.stat, amount: opts.amount,
    decay: opts.decay ?? 0,
    source: opts.source
  });
}

/** 光环刷新（R3-9 领主被动）：清除旧 aura buff，按携带者当前位置对范围内友军重挂 */
export function refreshAuras(units: UnitState[], faction: Faction): void {
  for (const u of units) {
    if (u.statuses.some(s => s.type === 'buff' && s.source === 'aura')) {
      u.statuses = u.statuses.filter(s => !(s.type === 'buff' && s.source === 'aura'));
    }
  }
  for (const holder of units) {
    if (holder.hp <= 0 || holder.faction !== faction) continue;
    if (!holder.loadout.passive.includes('aura')) continue;
    for (const u of units) {
      if (u.hp <= 0 || u.faction !== holder.faction) continue;
      if (distance(holder.position, u.position) <= EFFECT_PARAMS.auraRange) {
        applyBuff(u, {
          skillName: '光环', stat: 'atk',
          amount: EFFECT_PARAMS.auraAtkBonus,
          source: 'aura'
        });
      }
    }
  }
}

/** 属性总值（R3-9）：模板基础 + buff 增益 + 姿态加成（combat 结算入口） */
export function statValue(
  unit: UnitState,
  template: UnitTemplate,
  stat: 'atk' | 'def'
): number {
  let v = template[stat];
  for (const s of unit.statuses) {
    if (s.type === 'buff' && s.stat === stat) v += s.amount;
  }
  if (stat === 'def' && unit.statuses.some(s => s.type === 'stance')) {
    v += EFFECT_PARAMS.stanceDefBonus;
  }
  if (stat === 'atk' && unit.loadout.passive.includes('charge-bonus')) {
    v += Math.min(unit.moveSpent, EFFECT_PARAMS.chargeCap) * EFFECT_PARAMS.chargePerHex;
  }
  if (stat === 'atk' && unit.loadout.passive.includes('berserk')) {
    v += Math.floor((1 - unit.hp / unit.maxHp) * EFFECT_PARAMS.berserkMaxBonus);
  }
  return v;
}
