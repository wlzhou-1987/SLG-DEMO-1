import type { UnitState } from '../core/unit';
import type { ArmorType, DamageType, TerrainType } from '../core/types';
import { getTemplate } from '../config/units';
import { TERRAIN_CONFIGS } from '../config/terrain';

const ARMOR_LABELS: Record<ArmorType, string> = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲'
};

const DAMAGE_LABELS: Record<DamageType, string> = {
  piercing: '穿刺', slashing: '斩击', blunt: '钝击', magic: '法术'
};

export function showUnitInfo(unit: UnitState): void {
  const el = document.getElementById('sidepanel');
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

  el.innerHTML =
    `<h3>${template.name} <small>${factionLabel}</small></h3>` +
    `<p>HP ${unit.hp}/${unit.maxHp}</p>` +
    `<table>` +
    `<tr><td>攻击</td><td>${template.atk}</td><td>防御</td><td>${template.def}</td></tr>` +
    `<tr><td>速度</td><td>${template.spd}</td><td>技巧</td><td>${template.tec}</td></tr>` +
    `<tr><td>幸运</td><td>${template.lck}</td><td>护甲</td><td>${ARMOR_LABELS[template.armor]}</td></tr>` +
    `<tr><td>移动</td><td>${template.movePoints}</td><td>飞行</td><td>${template.flying ? '是' : '否'}</td></tr>` +
    `</table>` +
    `<h4>技能</h4><ul>${skills}</ul>`;
}

export function showTerrainInfo(terrain: TerrainType): void {
  const el = document.getElementById('sidepanel');
  if (!el) return;
  const config = TERRAIN_CONFIGS[terrain];
  const costLabel = config.moveCost === Infinity ? '不可通行' : `${config.moveCost}`;
  el.innerHTML =
    `<h3>${config.label}</h3>` +
    `<table>` +
    `<tr><td>移动消耗</td><td>${costLabel}</td></tr>` +
    `<tr><td>回避</td><td>+${config.evasion}</td></tr>` +
    `<tr><td>防御</td><td>+${config.defense}</td></tr>` +
    `</table>`;
}

export function clearSidepanel(): void {
  const el = document.getElementById('sidepanel');
  if (el) el.innerHTML = '<p class="dim">点击单位查看信息</p>';
}
