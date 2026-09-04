export function updateTopbar(
  turn: number,
  phase: string,
  playerCount: number,
  enemyCount: number,
  onEndTurn?: () => void
): void {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML =
    `<span>回合 ${turn}</span>` +
    `<span>阶段：${phase}</span>` +
    `<span>我方 ${playerCount}</span>` +
    `<span>敌方 ${enemyCount}</span>`;
  if (onEndTurn) {
    const btn = document.createElement('button');
    btn.id = 'end-turn-btn';
    btn.textContent = '结束回合';
    btn.addEventListener('click', onEndTurn);
    el.appendChild(btn);
  }
}
