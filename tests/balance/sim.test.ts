import { describe, it, expect } from 'vitest';
import { createMapState } from '../../src/core/map';
import type { MapState } from '../../src/core/map';
import { createUnitState, resetUnitCounter, getUnitActiveSkills } from '../../src/core/unit';
import type { UnitState } from '../../src/core/unit';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS } from '../../src/config/map';
import { getTemplate, isFlying } from '../../src/config/units';
import { basicAttackSkills } from '../../src/config/weapons';
import type { SkillTemplate } from '../../src/config/skills';
import { isSpell } from '../../src/config/spells';
import type { SpellTemplate } from '../../src/config/spells';
import { calcMovementCosts } from '../../src/core/range';
import { calcBattleForecast, resolveBattle } from '../../src/core/combat';
import { canAfford, payCost, tickResources } from '../../src/core/resources';
import { decideEnemyAction, checkGroupActivation, provokeGroup } from '../../src/core/ai';
import { checkReinforcements } from '../../src/core/reinforce';
import { tickStatuses } from '../../src/core/status';
import type { StatusEvent } from '../../src/core/status';
import { resolveSpell } from '../../src/core/spell';
import { checkVictory, startPlayerPhase, applyTerrainRegen } from '../../src/core/turn';
import { hexKey, distance, directionBetween } from '../../src/core/hex';
import type { HexCoord } from '../../src/core/types';

/** mulberry32 种子随机（注入战斗结算，模拟可复现） */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_TURNS = 80;
const HOLD_DISTANCE = 8;  // 最近敌人超过此距离按兵不动（守线待敌，逐组接敌）

interface SimResult {
  seed: number;
  winner: 'playerWin' | 'playerLose' | 'draw';
  turns: number;
  playersAlive: number;
  enemiesAlive: number;
  lastEnemy?: string;
}

function occupied(units: UnitState[], pos: HexCoord, self: UnitState): boolean {
  return units.some(u => u !== self && u.hp > 0 && u.position.q === pos.q && u.position.r === pos.r);
}

function usableSkills(u: UnitState): SkillTemplate[] {
  // R3-2：普攻恒为可用攻击选项（不占技能位）；R2-2：按供普攻段装备条目展开（期望择优含武器维度）
  return [...basicAttackSkills(u.equipment),
    ...getUnitActiveSkills(u).filter(s => !isSpell(s) || s.targetType === 'enemy')];
}

/** 启发式玩家行动：优先治疗重伤友军，否则落位攻击最近敌人 */
function actPlayerUnit(map: MapState, units: UnitState[], u: UnitState, rng: () => number): void {
  const template = getTemplate(u.templateId)!;
  const enemies = units.filter(x => x.faction === 'enemy' && x.hp > 0);
  if (enemies.length === 0) { u.hasActed = true; return; }
  const nearest = enemies.reduce((a, b) =>
    distance(u.position, a.position) <= distance(u.position, b.position) ? a : b);
  const dNearest = distance(u.position, nearest.position);

  // 领主（败北条件）：只在敌人逼近时后撤；终局（敌≤2）参战收尾；
  // R7-3 口径修正：仅在有队友护卫（我方存活>1）时躲避——独苗领主后撤待机 = 80 回合
  // 数学必平（领主不败也杀不完），真玩家独苗搏命，僵局交 rng（领主死 = 分出胜负）
  const alliesAlive = units.filter(x => x.faction === 'player' && x.hp > 0).length;
  if (u.templateId === 'lord' && enemies.length > 2 && alliesAlive > 1) {
    if (dNearest < 5) {
      const costs = calcMovementCosts(map, units, u.position, template.movePoints, isFlying(template));
      let bestKey = hexKey(u.position);
      let bestD = dNearest;
      for (const key of costs.keys()) {
        const [qs, rs] = key.split(',');
        const pos: HexCoord = { q: parseInt(qs), r: parseInt(rs) };
        if (occupied(units, pos, u)) continue;
        const d = distance(pos, nearest.position);
        if (d > bestD) { bestD = d; bestKey = key; }
      }
      const [bq, br] = bestKey.split(',');
      u.position = { q: parseInt(bq), r: parseInt(br) };
    }
    u.hasActed = true;
    return;
  }

  // 重伤撤退（基线操作）：HP < 35% 的非领主单位拉开与最近敌人的距离；
  // R7-3 口径修正：仅中前期（敌>5 且我方存活>6——尚有轮换资本）撤退；敌方≤5、我方伤亡
  // 过半或独苗残局不再绕圈撤退（治疗续航下撤退绕圈 = 理性拒战伪影，真玩家集火搏命，僵局交 rng）
  if (u.templateId !== 'lord' && enemies.length > 5 && alliesAlive > 6 && u.hp < u.maxHp * 0.35) {
    const costs = calcMovementCosts(map, units, u.position, template.movePoints, isFlying(template));
    let bestKey = hexKey(u.position);
    let bestD = dNearest;
    for (const key of costs.keys()) {
      const [qs, rs] = key.split(',');
      const pos: HexCoord = { q: parseInt(qs), r: parseInt(rs) };
      if (occupied(units, pos, u)) continue;
      const d = distance(pos, nearest.position);
      if (d > bestD) { bestD = d; bestKey = key; }
    }
    const [bq, br] = bestKey.split(',');
    u.position = { q: parseInt(bq), r: parseInt(br) };
    u.hasActed = true;
    return;
  }

  // 敌远则缓进至 HOLD_DISTANCE 内（逐组接敌），已在内则正常作战
  if (dNearest > HOLD_DISTANCE) {
    const costs = calcMovementCosts(map, units, u.position, template.movePoints, isFlying(template));
    let bestKey = hexKey(u.position);
    let bestScore = -Infinity;
    for (const [key, cost] of costs) {
      const [qs, rs] = key.split(',');
      const pos: HexCoord = { q: parseInt(qs), r: parseInt(rs) };
      if (occupied(units, pos, u)) continue;
      const d = distance(pos, nearest.position);
      const score = -d * 10 - cost;  // 直接贴脸（避免停在待机组警戒圈外成死局）
      if (score > bestScore) { bestScore = score; bestKey = key; }
    }
    const [bq, br] = bestKey.split(',');
    u.position = { q: parseInt(bq), r: parseInt(br) };
    u.hasActed = true;
    return;
  }

  // 治疗类法术：射程内最重伤的友军（<70% HP）
  const healSkill = getUnitActiveSkills(u).find(
    (s): s is SpellTemplate => isSpell(s) && s.targetType === 'ally'
  );
  if (healSkill) {
    const wounded = units.filter(a =>
      a.faction === 'player' && a.hp > 0 && a.hp < a.maxHp * 0.7 &&
      distance(u.position, a.position) <= healSkill.rangeMax
    );
    if (wounded.length > 0) {
      const worst = wounded.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
      resolveSpell(map, u, worst, healSkill, rng);
      u.hasActed = true;
      return;
    }
  }

  // 落点打分：可攻击 > 距敌更近 > 消耗更少；纯远程单位（全技能射程 ≥2）偏好最大射程风筝
  const skills = usableSkills(u);
  const prefersRange = skills.every(s => s.rangeMin >= 2);
  const costs = calcMovementCosts(map, units, u.position, template.movePoints, isFlying(template));
  let bestKey = hexKey(u.position);
  let bestScore = -Infinity;
  for (const [key, cost] of costs) {
    const [qs, rs] = key.split(',');
    const pos: HexCoord = { q: parseInt(qs), r: parseInt(rs) };
    if (occupied(units, pos, u)) continue;
    const dNear = Math.min(...enemies.map(e => distance(pos, e.position)));
    const canAttack = enemies.some(e => {
      const d = distance(pos, e.position);
      return skills.some(s => d >= s.rangeMin && d <= s.rangeMax);
    });
    const score = (canAttack ? 1000 : 0) - dNear * 10 - cost + (canAttack && prefersRange ? dNear * 5 : 0);
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  const [bq, br] = bestKey.split(',');
  u.position = { q: parseInt(bq), r: parseInt(br) };
  u.moveSpent = costs.get(bestKey) ?? 0;

  // 攻击：期望净收益最高（击杀加权，惩罚反击）；R5-1 资源不足不入选、执行时扣费
  let bestAtk: { skill: SkillTemplate; target: UnitState; score: number } | null = null;
  for (const e of enemies) {
    const d = distance(u.position, e.position);
    for (const skill of skills) {
      if (d < skill.rangeMin || d > skill.rangeMax) continue;
      if (!canAfford(u, skill)) continue;
      const forecast = calcBattleForecast(map, u, e, skill);
      const gain = forecast.attacker.damage * forecast.attacker.count * forecast.attacker.hitRate / 100;
      const counterCost = forecast.counter
        ? forecast.counter.damage * forecast.counter.count * forecast.counter.hitRate / 100
        : 0;
      const killBonus = forecast.attacker.damage * forecast.attacker.count >= e.hp ? 1000 : 0;
      const score = gain - counterCost + killBonus;
      if (!bestAtk || score > bestAtk.score) bestAtk = { skill, target: e, score };
    }
  }
  // 理性守卫：最优攻击期望净收益 ≤0 不攻击；反击上限伤害 ≥ 自身 HP（自杀式攻击）不攻击；
  // 终局死战（敌 ≤2）：胜利需敌方全灭，平局=必非赢——无视两守卫搏命，把僵局交给 rng
  const lastStand = enemies.length <= 2;
  if (bestAtk && (lastStand || bestAtk.score > 0)) {
    const fs = calcBattleForecast(map, u, bestAtk.target, bestAtk.skill);
    const suicide = fs.counter !== null && fs.counter.damage >= u.hp;
    if (lastStand || !suicide) {
      payCost(u, bestAtk.skill);  // R5-1 扣费
      if (isSpell(bestAtk.skill)) {
        // R7-3 口径修正：单体法术走 resolveSpell（与真实 confirmSpell 一致——无反击、pyro 加成、
        // 咒杀挂 DoT 而非直伤；R10-1 前 sim 将咒杀当直伤 29 结算，R10 规则变更后口径失真）；
        // castSpellThisTurn 由 resolveSpell 内部设置
        resolveSpell(map, u, bestAtk.target, bestAtk.skill, rng);
      } else {
        const result = resolveBattle(map, u, bestAtk.target, bestAtk.skill, rng);
        u.hp = result.attackerHp;
        bestAtk.target.hp = result.defenderHp;
      }
      u.facing = directionBetween(u.position, bestAtk.target.position);
    }
  } else {
    const near = enemies.reduce((a, b) =>
      distance(u.position, a.position) <= distance(u.position, b.position) ? a : b);
    u.facing = directionBetween(u.position, near.position);
  }
  u.hasActed = true;
}

function applyStatusEvents(map: MapState, units: UnitState[], events: StatusEvent[], rng: () => number): void {
  for (const e of events) {
    if (e.kind !== 'chantFire') continue;
    const caster = units.find(u => u.id === e.unitId);
    const target = units.find(u => u.id === e.targetId);
    if (caster && target) {
      resolveSpell(map, caster, target, e.spell, rng);
      if (caster.faction === 'player' && target.faction === 'enemy') provokeGroup(units, target);
    }
  }
}

/** 单局模拟（敌方阶段时序镜像 game.ts） */
function simulate(seed: number): SimResult {
  resetUnitCounter();
  const map = createMapState(MAP_OVERRIDES);
  const rng = seededRng(seed);
  const units: UnitState[] = [
    ...PLAYER_UNITS.map(p => createUnitState(p.templateId, p.faction, p.position)),
    ...ENEMY_GROUPS.flatMap(g =>
      g.units.map(p => {
        const u = createUnitState(p.templateId, p.faction, p.position);
        u.groupId = g.id;
        u.aiKind = g.aiType;
        u.activated = g.aiType !== 'dormant';
        return u;
      })
    )
  ];
  const fired = new Map<string, number>();
  let victory = checkVictory(units);
  let turn = 1;

  const cleanup = () => {
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) units.splice(i, 1);
  };

  while (victory === 'ongoing' && turn <= MAX_TURNS) {
    for (const u of [...units.filter(x => x.faction === 'player')]) {
      if (u.hp <= 0 || u.hasActed) continue;
      actPlayerUnit(map, units, u, rng);
      cleanup();
    }
    victory = checkVictory(units);
    if (victory !== 'ongoing') break;

    applyStatusEvents(map, units, tickStatuses(units, 'enemy'), rng);
    tickResources(units, 'enemy');  // R5-2 资源阶段推进
    applyTerrainRegen(units, 'enemy', map);  // R6-1 地形回复（敌方阶段开始）
    cleanup();
    units.push(...checkReinforcements(map, turn, units, fired));
    checkGroupActivation(map, units);
    for (const enemy of [...units.filter(u => u.faction === 'enemy')]) {
      if (victory !== 'ongoing') break;
      if (enemy.hp <= 0 || !enemy.activated) continue;
      const action = decideEnemyAction(map, units, enemy);
      enemy.position = { ...action.dest };
      if (action.skill && action.target) {
        enemy.facing = directionBetween(enemy.position, action.target.position);
        if (isSpell(action.skill)) enemy.castSpellThisTurn = true;  // R5-2 敌方施法标记
        payCost(enemy, action.skill);  // R5-1 敌方同样扣费
        const result = resolveBattle(map, enemy, action.target, action.skill, rng);
        enemy.hp = result.attackerHp;
        action.target.hp = result.defenderHp;
      }
      enemy.hasActed = true;
      cleanup();
      victory = checkVictory(units);
    }
    victory = checkVictory(units);
    if (victory !== 'ongoing') break;

    applyStatusEvents(map, units, tickStatuses(units, 'player'), rng);
    tickResources(units, 'player');  // R5-2 资源阶段推进
    applyTerrainRegen(units, 'player', map);  // R6-1 地形回复（玩家阶段开始）
    cleanup();
    victory = checkVictory(units);
    if (victory !== 'ongoing') break;
    turn++;
    startPlayerPhase(units);
  }

  return {
    seed,
    winner: victory === 'ongoing' ? 'draw' : victory,
    turns: turn,
    playersAlive: units.filter(u => u.faction === 'player').length,
    enemiesAlive: units.filter(u => u.faction === 'enemy').length,
    lastEnemy: units.find(u => u.faction === 'enemy')?.templateId
  };
}

describe('平衡模拟（R4-8 定稿 / R5-3 资源经济重校 / R7-3 暴击重校 / R2-2 装备威力过渡锚定）', () => {
  it('20 局模拟：R2-2 过渡锚定 9 胜 11 败 0 平（R7-1 先例：中间 issue 锚定当时值，重校归 R2-6）', () => {
    const results = Array.from({ length: 20 }, (_, i) => simulate(i + 1));
    const wins = results.filter(r => r.winner === 'playerWin');
    const losses = results.filter(r => r.winner === 'playerLose');
    const draws = results.filter(r => r.winner === 'draw');
    const avgTurns = (results.reduce((s, r) => s + r.turns, 0) / results.length).toFixed(1);
    console.log(
      `[平衡模拟] 玩家胜 ${wins.length} / 败 ${losses.length} / 平 ${draws.length}；` +
      `平均回合 ${avgTurns}；胜局平均存活 ${(wins.length ? (wins.reduce((s, r) => s + r.playersAlive, 0) / wins.length).toFixed(1) : '-')}`
    );
    console.log('[明细] ' + results.map(r =>
      `#${r.seed}${r.winner === 'playerWin' ? '胜' : r.winner === 'playerLose' ? '败' : '平'}` +
      `T${r.turns}存${r.playersAlive}敌${r.enemiesAlive}${r.lastEnemy ? '(' + r.lastEnemy + ')' : ''}`).join(' '));
    // R2-2 过渡锚定 9 胜 11 败 0 平（R7-3 基线 14/6）：双重不对称中间态——
    // ①我方必杀型威力 −1 已生效、critBonus +10 未生效（R2-3 接管线）；②BOSS 弑骑锤 counters 骑兵×1.5 已生效（反噬防骑/骑士）；③敌方杂兵威力 +2~3
    // R2-3 接 critBonus 后回补、R2-6 统一重校回 14/6/0 = 70%（带宽 12~15 + 0 平）
    expect(wins.length).toBe(9);
    expect(losses.length).toBe(11);
    expect(draws.length).toBe(0);
    // 可复现性：同种子重跑结果一致
    expect(simulate(7)).toEqual(results[6]);
  });
});
