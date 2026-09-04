export function updateTopbar(
  turn: number,
  phase: string,
  playerCount: number,
  enemyCount: number
): void {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML =
    `<span>回合 ${turn}</span>` +
    `<span>阶段：${phase}</span>` +
    `<span>我方 ${playerCount}</span>` +
    `<span>敌方 ${enemyCount}</span>`;
}
