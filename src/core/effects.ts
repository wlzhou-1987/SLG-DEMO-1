import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import { EFFECT_PARAMS } from '../config/combat';
import { enterStealth } from './stealth';
import { applyBuff } from './status';
import { cancelStealth } from './stealth';
import { resolveBattle } from './combat';
import { distance, directionBetween, neighbor as hexNeighbor } from './hex';
import { isPassable } from './map';
import { getUnitAt } from './unit';
import type { MapState } from './map';
import type { HexCoord, Facing } from './types';

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
      stat: 'str',
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
    case 'bloodlust': {
      if (caster.statuses.some(st => st.type === 'buff' && st.skillName === skill.name)) {
        return '';
      }
      const selfDamage = Math.max(1, Math.floor(caster.maxHp * b.selfPct));
      caster.hp = Math.max(1, caster.hp - selfDamage);
      applyBuff(caster, { skillName: skill.name, stat: 'str', amount: b.atkUp, turns: 3 });
      applyBuff(caster, { skillName: skill.name + '(防降)', stat: 'pdef', amount: -b.defDown, turns: 3 });
      resolveSkillSubs(caster, skill);
      return `${caster.id} 释放 ${skill.name}（自伤 ${selfDamage}）`;
    }
  }
}

/** 冲杀落位（R3-10）：直线冲过目标格落到背后格；不可直线/背后格被占/中间被挡 → null（灰显条件） */
export function rushDestination(
  map: MapState,
  units: UnitState[],
  mover: UnitState,
  target: UnitState
): HexCoord | null {
  const dir = directionBetween(mover.position, target.position);
  const dist = distance(mover.position, target.position);
  if (dist < 1) return null;
  let pos = mover.position;
  for (let step = 1; step < dist; step++) {
    pos = hexNeighbor(pos, dir as Facing);
    if (getUnitAt(units, pos) !== undefined) return null;
  }
  pos = hexNeighbor(pos, dir as Facing);
  if (pos.q !== target.position.q || pos.r !== target.position.r) return null;
  const dest = hexNeighbor(target.position, dir as Facing);
  if (!isPassable(map, dest, false, units)) return null;
  if (getUnitAt(units, dest) !== undefined) return null;
  return dest;
}

/** 破隐一击加成（R3-10）：攻击瞬间潜行且持有突袭/隐秘猎手 → 附加威力 */
export function applyAmbushBonus(unit: UnitState, skill: SkillTemplate): SkillTemplate {
  const hasAmbush = unit.loadout.passive.includes('ambush') || unit.loadout.passive.includes('shadow-hunter');
  if (!hasAmbush || !unit.statuses.some(s => s.type === 'stealth')) return skill;
  return { ...skill, power: (skill.power ?? 0) + EFFECT_PARAMS.ambushBonus };
}

/** 蓄力触发结算（R3-10 瞄准射击）：额外威力 + 免距离惩罚（rangeMax 放开）+ 破隐一击 */
export function resolveChargeStrike(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  skill: SkillTemplate,
  rng: () => number = Math.random
) {
  const wasStealthed = caster.statuses.some(s => s.type === 'stealth');
  let boosted: SkillTemplate = {
    ...skill,
    power: (skill.power ?? 0) + EFFECT_PARAMS.aimPowerBonus,
    rangeMax: 99
  };
  if (wasStealthed) boosted = applyAmbushBonus(caster, boosted);
  const result = resolveBattle(map, caster, target, boosted, rng);
  if (wasStealthed) cancelStealth(caster);
  return result;
}
