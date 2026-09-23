import type { VictoryState } from '../core/turn';
import type { Faction } from '../core/types';
import { artPath } from '../config/art';
import { portraitMarkup } from './portrait';

/** 胜负结算浮层（R15-5，§7.4 结算画面做实 + §7.5 立绘落点）：
 *  胜方阵营代表立绘（我方=领主 / 敌方=BOSS）+ 回合数 + 双方存活统计；
 *  立绘缺失回落头像（portraitMarkup 三级链），再缺回落首字窗。 */

let overlayEl: HTMLDivElement | null = null;

/** 代表单位：胜方阵营的标志性角色 */
function repOf(victory: VictoryState): { templateId: string; faction: Faction; name: string } {
  return victory === 'playerWin'
    ? { templateId: 'lord', faction: 'player', name: '领主' }
    : { templateId: 'boss', faction: 'enemy', name: 'BOSS' };
}

export interface GameOverStats {
  turn: number;
  playerAlive: number;
  enemyAlive: number;
}

export function showGameOverOverlay(victory: VictoryState, stats: GameOverStats): void {
  hideGameOverOverlay();
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  const rep = repOf(victory);
  const title = victory === 'playerWin' ? '🏆 我方胜利' : '☠ 我方败北';
  const standing = artPath('standing', rep.templateId);
  const fb = portraitMarkup(rep.templateId, rep.faction, rep.name, 200);
  const art = standing
    ? `<img class="go-img" src="${standing}" alt="${rep.name}" ` +
      `onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` +
      `<div class="go-fb-wrap">${fb}</div>`
    : `<div class="go-fb-wrap go-fb-on">${fb}</div>`;

  overlayEl = document.createElement('div');
  overlayEl.className = 'gameover';
  overlayEl.innerHTML =
    `<div class="gameover-panel">` +
    `<div class="go-art">${art}</div>` +
    `<h2>${title}</h2>` +
    `<p class="go-stats">回合 ${stats.turn} · 我方存活 ${stats.playerAlive} · 敌方存活 ${stats.enemyAlive}</p>` +
    `</div>`;
  wrap.appendChild(overlayEl);
}

export function hideGameOverOverlay(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}
