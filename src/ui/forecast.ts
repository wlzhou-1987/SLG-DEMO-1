import type { BattleForecast, StrikeForecast } from '../core/combat';
import type { SpellForecast } from '../core/spell';
import type { ArmorType } from '../core/types';

const SIDE_LABELS: Record<string, string> = { front: '正面', side: '侧面', back: '背面' };
const DAMAGE_LABELS: Record<string, string> = {
  piercing: '穿刺', slashing: '斩击', blunt: '钝击', magic: '法术'
};
const ARMOR_LABELS: Record<ArmorType, string> = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲'
};

let panelEl: HTMLDivElement | null = null;

function strikeRow(label: string, s: StrikeForecast): string {
  return (
    `<div class="strike">` +
    `<span class="who">${label}·${s.skillName}（${DAMAGE_LABELS[s.damageType]}·${SIDE_LABELS[s.side]}）</span>` +
    `<span>伤害 ${s.damage} ×${s.count}</span>` +
    `<span>命中 ${s.hitRate}%</span>` +
    `</div>`
  );
}

/** 左下角战斗预报面板（原型 .forecast 形态） */
export function showForecastPanel(
  forecast: BattleForecast,
  attackerName: string,
  defenderName: string,
  onConfirm: () => void,
  onCancel: () => void
): void {
  hideForecastPanel();
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  panelEl = document.createElement('div');
  panelEl.className = 'forecast';
  panelEl.innerHTML =
    `<h3>战斗预报 · ${attackerName} → ${defenderName}</h3>` +
    strikeRow('我方攻击', forecast.attacker) +
    (forecast.counter
      ? strikeRow('敌方反击', forecast.counter)
      : `<div class="strike dim">敌方无法反击</div>`) +
    `<div class="btns"><button class="btn-cancel">取消</button><button class="btn-confirm">确认</button></div>`;

  panelEl.querySelector('.btn-confirm')!.addEventListener('click', onConfirm);
  panelEl.querySelector('.btn-cancel')!.addEventListener('click', onCancel);

  wrap.appendChild(panelEl);
}

export function hideForecastPanel(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

function buildPanel(title: string, body: string, onConfirm: () => void, onCancel: () => void) {
  hideForecastPanel();
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  panelEl = document.createElement('div');
  panelEl.className = 'forecast';
  panelEl.innerHTML =
    `<h3>${title}</h3>` +
    body +
    `<div class="btns"><button class="btn-cancel">取消</button><button class="btn-confirm">确认</button></div>`;

  panelEl.querySelector('.btn-confirm')!.addEventListener('click', onConfirm);
  panelEl.querySelector('.btn-cancel')!.addEventListener('click', onCancel);

  wrap.appendChild(panelEl);
}

/** 法术预报面板（§4.12：预报显示法术触发时点） */
export function showSpellForecastPanel(
  spellName: string,
  casterName: string,
  targetName: string,
  forecast: SpellForecast,
  onConfirm: () => void,
  onCancel: () => void
): void {
  let body: string;
  switch (forecast.kind) {
    case 'damage':
      body =
        `<div class="strike"><span class="who">${casterName}·${spellName}（${SIDE_LABELS[forecast.side]}）</span>` +
        (forecast.chantTurns > 0
          ? `<span>咏唱 ${forecast.chantTurns} 回合后生效</span>`
          : '') +
        `</div>` +
        `<div class="strike"><span class="who">→ ${targetName}</span>` +
        `<span>伤害 ${forecast.damage}</span><span>命中 ${forecast.hitRate}%</span></div>`;
      break;
    case 'heal':
      body = `<div class="strike"><span class="who">${casterName}·${spellName} → ${targetName}</span><span>回复 ${forecast.amount}（必中）</span></div>`;
      break;
    case 'regen':
      body = `<div class="strike"><span class="who">${casterName}·${spellName} → ${targetName}</span><span>每回合回复 ${forecast.healPerTurn}，持续 ${forecast.turns} 回合</span></div>`;
      break;
    case 'shield':
      body = `<div class="strike"><span class="who">${casterName}·${spellName} → ${targetName}</span><span>护甲覆盖 ${ARMOR_LABELS[forecast.armorType]} + 吸收 ${forecast.absorb}，持续 ${forecast.turns} 回合</span></div>`;
      break;
    case 'curse':
      body = `<div class="strike"><span class="who">${casterName}·${spellName} → ${targetName}</span><span>${forecast.turns} 回合后受 ${forecast.damage} 伤</span></div>`;
      break;
  }
  buildPanel(`法术预报 · ${spellName}`, body, onConfirm, onCancel);
}
