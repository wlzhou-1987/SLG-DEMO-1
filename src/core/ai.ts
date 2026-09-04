import type { MapState } from './map';
import type { UnitState } from './unit';
import type { SkillTemplate } from '../config/units';
import { getTemplate } from '../config/units';
import { calcMovementRange } from './range';
import { calcBattleForecast } from './combat';
import { distance } from './hex';
import type { HexCoord } from './types';

export interface EnemyAction {
  dest: HexCoord;
  skill: SkillTemplate | null;
  target: UnitState | null;
}

/**
 * 敌方占位 AI（M3）：枚举「落位 × 技能 × 目标」组合，
 * 击杀优先，否则期望净收益最高；无可攻击目标则向最近我方移动。
 * 完整三类激活/组集结在 M5。
 */
export function decideEnemyAction(
  map: MapState,
  units: UnitState[],
  enemy: UnitState
): EnemyAction {
  const template = getTemplate(enemy.templateId)!;
  const players = units.filter(u => u.faction === 'player');
  const moveRange = calcMovementRange(map, units, enemy.position, template.movePoints, template.flying);

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

  // 无可攻击目标：向最近我方单位移动
  let dest = enemy.position;
  let minDist = Infinity;
  for (const key of moveRange) {
    const [qStr, rStr] = key.split(',');
    const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
    const nearest = Math.min(...players.map(p => distance(pos, p.position)));
    if (nearest < minDist) {
      minDist = nearest;
      dest = pos;
    }
  }
  return { dest, skill: null, target: null };
}
