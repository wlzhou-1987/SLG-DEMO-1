import type { MapState } from './map';
import { getTerrain } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/skills';
import { getTemplate, basicAttackSkill, isFlying } from '../config/units';
import { getUnitActiveSkills } from './unit';
import { isVisibleTo } from './stealth';
import { calcMovementRange, calcAttackRange } from './range';
import { calcBattleForecast, effectiveRangeMax, expectedDamage } from './combat';
import { canAfford } from './resources';
import { distance, hexKey } from './hex';
import type { HexCoord } from './types';

export interface EnemyAction {
  dest: HexCoord;
  skill: SkillTemplate | null;
  target: UnitState | null;
}

/**
 * 敌方 AI 决策（§6）：枚举「落位 × 技能 × 目标」组合，
 * 击杀优先，否则期望净收益最高；无可攻击目标时 BOSS 原地驻守、
 * 其余向组共享目标集结移动。激活状态由调用方过滤（未激活单位不决策）。
 */
export function decideEnemyAction(
  map: MapState,
  units: UnitState[],
  enemy: UnitState
): EnemyAction {
  const template = getTemplate(enemy.templateId)!;
  // R3-8 潜行感知全忽略：择优与集结均不计不可见单位（§6）
  const players = units.filter(
    u => u.faction === 'player' && u.hp > 0 && isVisibleTo(u, 'enemy', units)
  );
  // R3-8：全部我方不可见（潜行）→ 无可选目标，原地待命（fallback）
  if (players.length === 0) {
    return { dest: enemy.position, skill: null, target: null };
  }
  // BOSS 驻守：不移动，仅射程覆盖当前位置时才攻击（§6）
  const moveRange = enemy.aiKind === 'boss'
    ? new Set([hexKey(enemy.position)])
    : calcMovementRange(map, units, enemy.position, template.movePoints, isFlying(template));

  let best: EnemyAction | null = null;
  let bestScore = -Infinity;

  for (const key of moveRange) {
    const [qStr, rStr] = key.split(',');
    const dest: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
    const attackerAt: UnitState = { ...enemy, position: dest };

    for (const target of players) {
      const d = distance(dest, target.position);
      // R3-2：普攻恒入择优候选（纯普攻单位同规则，§6）；R5-1：资源不足的技能不入选（回落普攻）
      for (const skill of [basicAttackSkill(template), ...getUnitActiveSkills(enemy)]) {
        if (d < skill.rangeMin || d > effectiveRangeMax(template, skill, getTerrain(map, dest))) continue;
        if (!canAfford(enemy, skill)) continue;

        const forecast = calcBattleForecast(map, attackerAt, target, skill);
        // R7-1 期望含暴击（§6/§4.3）：E = 命中率 × (非暴伤害×(1−p) + 暴击伤害×p)
        const expected = expectedDamage(forecast.attacker) * forecast.attacker.count;
        const counterCost = forecast.counter
          ? expectedDamage(forecast.counter) * forecast.counter.count
          : 0;
        // 击杀优先：期望伤害 ≥ 目标当前 HP 时大幅加权（§6）
        const killBonus = forecast.attacker.damage >= target.hp ? 1000 : 0;
        const score = expected - counterCost + killBonus;

        if (score > bestScore) {
          bestScore = score;
          best = { dest, skill, target };
        }
      }
    }
  }

  if (best) return best;

  // BOSS 无射程内目标：原地驻守
  if (enemy.aiKind === 'boss') {
    return { dest: enemy.position, skill: null, target: null };
  }

  // 无可攻击目标：向组共享目标集结（§6 不散兵）——
  // 共享目标 = 距组质心最近的我方单位；单人组/无组退化为距本人最近
  const mates = enemy.groupId !== undefined
    ? units.filter(u => u.faction === 'enemy' && u.groupId === enemy.groupId)
    : [];
  let from: HexCoord = enemy.position;
  if (mates.length > 1) {
    from = {
      q: mates.reduce((s, u) => s + u.position.q, 0) / mates.length,
      r: mates.reduce((s, u) => s + u.position.r, 0) / mates.length
    };
  }
  const target = players.reduce((bestP, p) =>
    distance(from, p.position) < distance(from, bestP.position) ? p : bestP);

  let dest = enemy.position;
  let bestDist = Infinity;
  for (const key of moveRange) {
    const [qStr, rStr] = key.split(',');
    const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
    const d = distance(pos, target.position);
    if (d < bestDist) {
      bestDist = d;
      dest = pos;
    }
  }
  return { dest, skill: null, target: null };
}

/**
 * 警戒范围扫描（§6 待机型）：组内任一成员的「移动+射程覆盖」含我方单位 → 全组激活。
 * 敌方阶段开始时调用。
 */
export function checkGroupActivation(map: MapState, units: UnitState[]): void {
  // R3-8：警戒扫描不含不可见（潜行）单位
  const players = units.filter(u => u.faction === 'player' && isVisibleTo(u, 'enemy', units));
  if (players.length === 0) return;

  const groupIds = new Set(
    units
      .filter(u => u.faction === 'enemy' && u.aiKind === 'dormant' && !u.activated)
      .map(u => u.groupId)
  );

  for (const groupId of groupIds) {
    if (groupId === undefined) continue;
    const members = units.filter(u => u.faction === 'enemy' && u.groupId === groupId);

    const triggered = members.some(m => {
      const template = getTemplate(m.templateId);
      if (!template) return false;
      const moveRange = calcMovementRange(map, units, m.position, template.movePoints, isFlying(template));
      const resolved = [basicAttackSkill(template), ...getUnitActiveSkills(m)];
      const rangeMin = Math.min(...resolved.map(s => s.rangeMin));
      // 口径：警戒范围不含地形射程加成（按落位变化的近似值；当前 4 地形 rangeBonus 均 0）
      const rangeMax = Math.max(...resolved.map(s => effectiveRangeMax(template, s)));
      const alert = calcAttackRange(moveRange, rangeMin, rangeMax);
      return players.some(p => moveRange.has(hexKey(p.position)) || alert.has(hexKey(p.position)));
    });

    if (triggered) {
      for (const m of members) m.activated = true;
    }
  }
}

/** 被攻击激活：目标及其所在组全组激活（§6；目标可为已亡单位） */
export function provokeGroup(units: UnitState[], target: UnitState): void {
  if (target.groupId === undefined) return;
  for (const u of units) {
    if (u.faction === 'enemy' && u.groupId === target.groupId) u.activated = true;
  }
}
