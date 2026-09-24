import type { UnitState } from '../core/unit';
import { getUnitActiveSkills } from '../core/unit';
import { effectiveRangeMax } from '../core/combat';
import type { ArmorType, TerrainType } from '../core/types';
import { getTemplate, isFlying } from '../config/units';
import { basicAttackSkills, WEAPONS } from '../config/weapons';
import { getJob } from '../config/jobs';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { getTrait } from '../config/traits';
import { portraitMarkup } from './portrait';
import { iconSpan } from './icon';

const ARMOR_LABELS: Record<ArmorType, string> = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲'
};

const TAG_LABELS: Record<string, string> = {
  infantry: '步兵', cavalry: '骑兵', flying: '飞行', heavy: '重甲', monster: '魔物', dragon: '龙'
};

const RESOURCE_LABEL: Record<string, string> = { rage: '怒气', focus: '专注', mp: 'MP' };

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
  // 有效射程 = 基础 + 属性/特性加成（§4.4）；地形加成不读（口径同选中叠层）
  // R16-3：伤害类型图标化（物理三线有图；法术/治疗线 magic 无图不显示）
  const skills = [...basicAttackSkills(unit.equipment), ...getUnitActiveSkills(unit)]
    .map(s => {
      const rMax = effectiveRangeMax(template, s, undefined, unit.loadout.passive);
      return `<li>${iconSpan(s.damageType)} ${s.name}（射程 ${s.rangeMin}-${rMax}）</li>`;
    })
    .join('');

  // R16-3：状态图标（键 = status-<type>，dot 复用 burn 图）
  const statusIcon = (type: string) => iconSpan(type === 'dot' ? 'status-burn' : `status-${type}`);
  const statusText = (s: UnitState['statuses'][number]): string => {
    if (s.type === 'shield') return `秘银护盾（吸收 ${s.absorbLeft}·剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'chant') return `咏唱 ${s.skillName}（剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'regen') return `再生（每回合 +${s.healPerTurn}·剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'stealth') return '潜行（对敌不可见，移动/攻击/技能取消）';
    const ATTR_LABELS: Record<string, string> = { str: '力量', mag: '魔力', pdef: '物防', mdef: '魔防', spd: '速', lck: '运' };
    if (s.type === 'buff') return `${s.skillName}（${ATTR_LABELS[s.stat] ?? s.stat} ${s.amount >= 0 ? '+' : ''}${s.amount}${s.decay > 0 ? '·衰减中' : ''}）`;
    if (s.type === 'stance') return '防御姿态（防御提升·移动取消）';
    if (s.type === 'charge') return `蓄力 ${s.skillName}（剩 ${s.turnsLeft} 回合）`;
    if (s.type === 'dot') return `${s.skillName}（每回合 -${s.damagePerTurn}·剩 ${s.turnsLeft} 回合）`;
    return '';
  };
  const statuses = unit.statuses.map(s => `<li>${statusIcon(s.type)} ${statusText(s)}</li>`).join('');

  const traits = [...unit.loadout.passive]
    .map(id => getTrait(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .map(t => `<li><b>${t.name}</b>：${t.desc}</li>`)
    .join('');

  const job = getJob(unit.templateId)!;
  const head =
    `<div class="unit-head">${portraitMarkup(unit.templateId, unit.faction, template.name, 48)}` +
    `<div><h3>${template.name} <small>${factionLabel}</small></h3><p>HP ${unit.hp}/${unit.maxHp}</p></div></div>`;
  el.innerHTML =
    head +
    `<table>` +
    `<tr><td>力量</td><td>${template.str}</td><td>魔力</td><td>${template.mag}</td></tr>` +
    `<tr><td>物防</td><td>${template.pdef}</td><td>魔防</td><td>${template.mdef}</td></tr>` +
    `<tr><td>速度</td><td>${template.spd}</td><td>技巧</td><td>${template.tec}</td></tr>` +
    `<tr><td>幸运</td><td>${template.lck}</td><td>护甲</td><td>${ARMOR_LABELS[template.armor]}</td></tr>` +
    `<tr><td>移动</td><td>${template.movePoints}</td><td>飞行</td><td>${isFlying(template) ? '是' : '否'}</td></tr>` +
    `<tr><td>标签</td><td>${template.unitTags.map(tg => iconSpan(tg, TAG_LABELS[tg])).join(' ')}</td></tr>` +
    `<tr><td>装备</td><td>${unit.equipment.map(id => `${iconSpan(WEAPONS[id]?.weaponType)} ${WEAPONS[id]?.name ?? id}`).join('·')}</td></tr>` +
    `<tr><td>主资源</td><td>${iconSpan(job.resourceType, RESOURCE_LABEL[job.resourceType])} ${unit.resources.current}/${unit.resources.max}</td></tr>` +
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
  // R6-1：效果字段条件显示（非 0 才占行），平原只剩标题与移动消耗
  const rows: string[] = [`<tr><td>移动消耗</td><td>${costLabel}</td></tr>`];
  if (config.pdefense > 0) rows.push(`<tr><td>物理防</td><td>+${config.pdefense}</td></tr>`);
  if (config.mdefense > 0) rows.push(`<tr><td>法术防</td><td>+${config.mdefense}</td></tr>`);
  if (config.pevasion > 0) rows.push(`<tr><td>物理闪避</td><td>+${config.pevasion}</td></tr>`);
  if (config.mevasion > 0) rows.push(`<tr><td>法术闪避</td><td>+${config.mevasion}</td></tr>`);
  if (config.hpRegenPct > 0) rows.push(`<tr><td>HP 回复</td><td>${config.hpRegenPct}%</td></tr>`);
  if (config.mpRegen > 0) rows.push(`<tr><td>MP 回复</td><td>+${config.mpRegen}</td></tr>`);
  if (config.rangeBonus > 0) rows.push(`<tr><td>射程</td><td>+${config.rangeBonus}</td></tr>`);
  el.innerHTML =
    `<h4>地形：${config.label}</h4>` +
    `<table>` +
    rows.join('') +
    `</table>`;
}

export function clearTerrainInfo(): void {
  const el = terrainEl();
  if (el) el.innerHTML = '';
}
