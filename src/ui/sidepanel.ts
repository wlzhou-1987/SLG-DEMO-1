import type { UnitState } from '../core/unit';
import type { ArmorType, DamageType, TerrainType } from '../core/types';
import { getTemplate } from '../config/units';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { getTrait } from '../config/traits';

const ARMOR_LABELS: Record<ArmorType, string> = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲'
};

const DAMAGE_LABELS: Record<DamageType, string> = {
  piercing: '穿刺', slashing: '斩击', blunt: '钝击', magic: '法术'
};

function unitEl(): HTMLElement | null {
  return document.getElementById('panel-unit');
}

function terrainEl(): HTMLElement | null {
  return document.getElementById('panel-terrain');
}

export function showUnitInfo(unit: UnitState): void {
  const el = unitEl();
  if (!el) return;
  const template = getTemplate(unit.templateId);
  if (!template) {
    el.innerHTML = `<p>未知单位：${unit.templateId}</p>`;
    return;
  }

  const factionLabel = unit.faction === 'player' ? '我方' : '敌方';
  const skills = template.skills
    .map(s => `<li>${s.name}（${DAMAGE_LABELS[s.damageType]}·射程 ${s.rangeMin}-${s.rangeMax}）</li>`)
    .join('');

  const statuses = unit.statuses.map(s => {
    if (s.type === 'shield') return `秘银护盾（吸收 ${s.absorbLeft}·剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'chant') return `咏唱 ${s.skillName}（剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'regen') return `再生（每回合 +${s.healPerTurn}·剩 ${s.turnsLeft} 回合）`;
    return `咒杀（${s.turnsLeft} 回合后 -${s.damage}）`;
  }).map(s => `<li>${s}</li>`).join('');

  const traits = (template.traits ?? [])
    .map(id => getTrait(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .map(t => `<li><b>${t.name}</b>：${t.desc}</li>`)
    .join('');

  el.innerHTML =
    `<h3>${template.name} <small>${factionLabel}</small></h3>` +
    `<p>HP ${unit.hp}/${unit.maxHp}</p>` +
    `<table>` +
    `<tr><td>攻击</td><td>${template.atk}</td><td>防御</td><td>${template.def}</td></tr>` +
    `<tr><td>速度</td><td>${template.spd}</td><td>技巧</td><td>${template.tec}</td></tr>` +
    `<tr><td>幸运</td><td>${template.lck}</td><td>护甲</td><td>${ARMOR_LABELS[template.armor]}</td></tr>` +
    `<tr><td>移动</td><td>${template.movePoints}</td><td>飞行</td><td>${template.flying ? '是' : '否'}</td></tr>` +
    `</table>` +
    (statuses ? `<h4>当前状态</h4><ul>${statuses}</ul>` : '') +
    (traits ? `<h4>特性</h4><ul>${traits}</ul>` : '') +
    `<h4>技能</h4><ul>${skills}</ul>`;
}

export function clearUnitInfo(): void {
  const el = unitEl();
  if (el) el.innerHTML = '<p class="dim">点击单位查看信息</p>';
}

export function showTerrainInfo(terrain: TerrainType): void {
  const el = terrainEl();
  if (!el) return;
  const config = TERRAIN_CONFIGS[terrain];
  const costLabel = config.moveCost === Infinity ? '不可通行' : `${config.moveCost}`;
  el.innerHTML =
    `<h4>地形：${config.label}</h4>` +
    `<table>` +
    `<tr><td>移动消耗</td><td>${costLabel}</td></tr>` +
    `<tr><td>回避</td><td>+${config.evasion}</td></tr>` +
    `<tr><td>防御</td><td>+${config.defense}</td></tr>` +
    `</table>`;
}

export function clearTerrainInfo(): void {
  const el = terrainEl();
  if (el) el.innerHTML = '';
}
