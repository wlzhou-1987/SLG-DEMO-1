import type { MapState } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/units';
import { getTemplate } from '../config/units';
import { calcMovementRange, calcAttackRange } from './range';
import { calcBattleForecast } from './combat';
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
  const players = units.filter(u => u.faction === 'player');
  // BOSS 驻守：不移动，仅射程覆盖当前位置时才攻击（§6）
  const moveRange = enemy.aiKind === 'boss'
    ? new Set([hexKey(enemy.position)])
    : calcMovementRange(map, units, enemy.position, template.movePoints, template.flying);

  let best: EnemyAction | null = null;
  let bestScore = -Infinity;

  for (const key of moveRange) {
    const [qStr, rStr] = key.split(',');
    const dest: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
    const attackerAt: UnitState = { ...enemy, position: dest };

    for (const target of players) {
      const d = distance(dest, target.position);
      for (const skill of template.skills) {
        if (d < skill.rangeMin || d > skill.rangeMax) continue;

        const forecast = calcBattleForecast(map, attackerAt, target, skill);
        const expected =
          forecast.attacker.damage * forecast.attacker.count * forecast.attacker.hitRate / 100;
        const counterCost = forecast.counter
          ? forecast.counter.damage * forecast.counter.count * forecast.counter.hitRate / 100
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
  const players = units.filter(u => u.faction === 'player');
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
      const moveRange = calcMovementRange(map, units, m.position, template.movePoints, template.flying);
      const rangeMin = Math.min(...template.skills.map(s => s.rangeMin));
      const rangeMax = Math.max(...template.skills.map(s => s.rangeMax));
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
