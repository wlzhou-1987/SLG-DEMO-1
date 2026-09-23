import type { BattleForecast, StrikeForecast } from '../core/combat';
import type { SpellForecast } from '../core/spell';
import type { ArmorType, Faction } from '../core/types';
import { portraitMarkup } from './portrait';

/** 预报面板参与者（R15-2：携 templateId/faction 供头像渲染） */
export interface ForecastWho {
  name: string;
  templateId: string;
  faction: Faction;
}

const SIDE_LABELS: Record<string, string> = { front: '正面', side: '侧面', back: '背面' };
const DAMAGE_LABELS: Record<string, string> = {
  piercing: '穿刺', slashing: '斩击', blunt: '钝击', magic: '法术'
};
const ARMOR_LABELS: Record<ArmorType, string> = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲'
};

let panelEl: HTMLDivElement | null = null;

function strikeRow(label: string, s: StrikeForecast): string {
  // R7-2 预报暴击率行（§4.5）：必暴技能显示「必定」（不掷骰）
  const critText = s.mustCrit ? '必定' : `${s.critRate}%`;
  return (
    `<div class="strike">` +
    `<span class="who">${label}·${s.skillName}（${DAMAGE_LABELS[s.damageType]}·${SIDE_LABELS[s.side]}）</span>` +
    `<span>伤害 ${s.damage} ×${s.count}</span>` +
    `<span>命中 ${s.hitRate}%${s.rangePenalty ? `（距离 −${s.rangePenalty}）` : ''}</span>` +
    `<span>暴击 ${critText}</span>` +
    `</div>`
  );
}

/** 面板头（R15-2）：头像（攻左/施法者左，守方右）+ 标题 */
function fcHead(who: ForecastWho, title: string, right?: ForecastWho): string {
  const rightHtml = right ? portraitMarkup(right.templateId, right.faction, right.name, 28) : '';
  return (
    `<div class="fc-head">${portraitMarkup(who.templateId, who.faction, who.name, 28)}` +
    `<h3>${title}</h3>${rightHtml}</div>`
  );
}

/** 左下角战斗预报面板（原型 .forecast 形态） */
export function showForecastPanel(
  forecast: BattleForecast,
  attacker: ForecastWho,
  defender: ForecastWho,
  onConfirm: () => void,
  onCancel: () => void
): void {
  const body =
    strikeRow('我方攻击', forecast.attacker) +
    (forecast.counter
      ? strikeRow('敌方反击', forecast.counter)
      : `<div class="strike dim">敌方无法反击</div>`);
  buildPanel(
    fcHead(attacker, `战斗预报 · ${attacker.name} → ${defender.name}`, defender),
    body,
    onConfirm,
    onCancel
  );
}

/** AoE 预报面板（§4.9：区域内每个敌人各自预报；无反击；R15-2 仅施法者头像） */
export function showAoeForecastPanel(
  skillName: string,
  caster: ForecastWho,
  rows: Array<{ name: string; damage: number; hitRate: number; critRate: number }>,
  onConfirm: () => void,
  onCancel: () => void
): void {
  const body =
    `<div class="strike"><span class="who">${caster.name}·${skillName}（AoE · ${rows.length} 个目标）</span></div>` +
    rows.map(r =>
      `<div class="strike"><span class="who">→ ${r.name}</span>` +
      `<span>伤害 ${r.damage}</span><span>命中 ${r.hitRate}%</span><span>暴击 ${r.critRate}%</span></div>`
    ).join('') +
    `<div class="strike dim">范围攻击不触发反击</div>`;
  buildPanel(fcHead(caster, `战斗预报 · ${skillName}`), body, onConfirm, onCancel);
}

export function hideForecastPanel(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

function buildPanel(head: string, body: string, onConfirm: () => void, onCancel: () => void) {
  hideForecastPanel();
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  panelEl = document.createElement('div');
  panelEl.className = 'forecast';
  panelEl.innerHTML =
    head +
    body +
    `<div class="btns"><button class="btn-cancel">取消</button><button class="btn-confirm">确认</button></div>`;

  panelEl.querySelector('.btn-confirm')!.addEventListener('click', onConfirm);
  panelEl.querySelector('.btn-cancel')!.addEventListener('click', onCancel);

  wrap.appendChild(panelEl);
}

/** 法术预报面板（§4.12：预报显示法术触发时点；R15-2 仅施法者头像） */
export function showSpellForecastPanel(
  spellName: string,
  caster: ForecastWho,
  targetName: string,
  forecast: SpellForecast,
  onConfirm: () => void,
  onCancel: () => void
): void {
  let body: string;
  switch (forecast.kind) {
    case 'damage':
      body =
        `<div class="strike"><span class="who">${caster.name}·${spellName}（${SIDE_LABELS[forecast.side]}）</span>` +
        (forecast.chantTurns > 0
          ? `<span>咏唱 ${forecast.chantTurns} 回合后生效</span>`
          : '') +
        `</div>` +
        `<div class="strike"><span class="who">→ ${targetName}</span>` +
        `<span>伤害 ${forecast.damage}</span><span>命中 ${forecast.hitRate}%</span>` +
        `<span>暴击 ${forecast.mustCrit ? '必定' : `${forecast.critRate}%`}</span></div>`;
      break;
    case 'heal':
      body = `<div class="strike"><span class="who">${caster.name}·${spellName} → ${targetName}</span><span>回复 ${forecast.amount}（必中）</span></div>`;
      break;
    case 'regen':
      body = `<div class="strike"><span class="who">${caster.name}·${spellName} → ${targetName}</span><span>每回合回复 ${forecast.healPerTurn}，持续 ${forecast.turns} 回合</span></div>`;
      break;
    case 'shield':
      body = `<div class="strike"><span class="who">${caster.name}·${spellName} → ${targetName}</span><span>护甲覆盖 ${ARMOR_LABELS[forecast.armorType]} + 吸收 ${forecast.absorb}，持续 ${forecast.turns} 回合</span></div>`;
      break;
    case 'dot':
      body =
        `<div class="strike"><span class="who">${caster.name}·${spellName}（${SIDE_LABELS[forecast.side]}）→ ${targetName}</span>` +
        `<span>每回合 -${forecast.damagePerTurn}${forecast.finalTurnExtra > 0 ? `（末回合 +${forecast.finalTurnExtra}）` : ''}，持续 ${forecast.turns} 回合</span>` +
        `<span>命中 ${forecast.hitRate}%</span></div>`;
      break;
  }
  buildPanel(fcHead(caster, `法术预报 · ${spellName}`), body, onConfirm, onCancel);
}
