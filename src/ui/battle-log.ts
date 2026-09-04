const MAX_ENTRIES = 30;

/** 追加一条战斗日志（最新在顶部，自动裁剪） */
export function logBattle(text: string, kind: 'battle' | 'phase' = 'battle'): void {
  const el = document.getElementById('log-entries');
  if (!el) return;
  const entry = document.createElement('div');
  entry.className = kind === 'phase' ? 'log-entry phase' : 'log-entry';
  entry.textContent = text;
  el.prepend(entry);
  while (el.children.length > MAX_ENTRIES) {
    el.removeChild(el.lastChild!);
  }
}
