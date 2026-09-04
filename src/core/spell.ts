import type { MapState } from './map';
import type { UnitState } from './unit';
import type { SpellTemplate } from '../config/spells';
import { getTemplate } from '../config/units';
import { calcStrike } from './combat';
import type { PartSide } from './combat';
import type { ArmorType } from './types';

export type SpellForecast =
  | { kind: 'damage'; damage: number; hitRate: number; side: PartSide; chantTurns: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'regen'; healPerTurn: number; turns: number }
  | { kind: 'shield'; armorType: ArmorType; absorb: number; turns: number }
  | { kind: 'curse'; damage: number; turns: number };

export function calcSpellForecast(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate
): SpellForecast {
  switch (spell.effectMode) {
    case 'instant': {
      // 伤害类走统一战斗公式（含 power 与矩阵）；治疗类固定 power
      if (spell.targetType === 'enemy') {
        const strike = calcStrike(map, caster, getTemplate(caster.templateId)!, target, getTemplate(target.templateId)!, spell);
        return {
          kind: 'damage',
          damage: strike.damage,
          hitRate: strike.hitRate,
          side: strike.side,
          chantTurns: spell.chantTurns ?? 0
        };
      }
      return { kind: 'heal', amount: spell.power };
    }
    case 'lasting': {
      if (spell.shield) {
        return { kind: 'shield', armorType: spell.shield.armorType, absorb: spell.shield.absorb, turns: spell.durationTurns ?? 1 };
      }
      return { kind: 'regen', healPerTurn: spell.power, turns: spell.durationTurns ?? 1 };
    }
    case 'delayed': {
      return { kind: 'curse', damage: spell.power, turns: spell.durationTurns ?? 1 };
    }
  }
}

export type SpellResult = SpellForecast & { hit?: boolean; targetHp: number };

/**
 * 即时释放的法术结算。增益必中；伤害类掷命中。
 * 持续/延时类在目标身上挂状态，阶段开始由 tickStatuses 推进。
 */
export function resolveSpell(
  map: MapState,
  caster: UnitState,
  target: UnitState,
  spell: SpellTemplate,
  rng: () => number = Math.random
): SpellResult {
  const forecast = calcSpellForecast(map, caster, target, spell);
  const castTurn = 0;  // 回合数由调用方维护，此处仅保序（后施加覆盖先生效）

  switch (forecast.kind) {
    case 'damage': {
      const hit = rng() < forecast.hitRate / 100;
      if (hit) {
        target.hp = Math.max(0, target.hp - forecast.damage);
      }
      return { ...forecast, hit, targetHp: target.hp };
    }
    case 'heal': {
      target.hp = Math.min(target.maxHp, target.hp + forecast.amount);
      return { ...forecast, targetHp: target.hp };
    }
    case 'regen': {
      target.statuses.push({
        type: 'regen', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, healPerTurn: forecast.healPerTurn
      });
      return { ...forecast, targetHp: target.hp };
    }
    case 'shield': {
      target.statuses.push({
        type: 'shield', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, armorType: forecast.armorType, absorbLeft: forecast.absorb
      });
      return { ...forecast, targetHp: target.hp };
    }
    case 'curse': {
      target.statuses.push({
        type: 'delayed', skillName: spell.name, turnsLeft: forecast.turns,
        appliedAtTurn: castTurn, damage: forecast.damage
      });
      return { ...forecast, targetHp: target.hp };
    }
  }
}
