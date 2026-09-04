import type { BattleForecast, StrikeForecast } from '../core/combat';

const SIDE_LABELS: Record<string, string> = { front: '正面', side: '侧面', back: '背面' };
const DAMAGE_LABELS: Record<string, string> = {
  piercing: '穿刺', slashing: '斩击', blunt: '钝击', magic: '法术'
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
