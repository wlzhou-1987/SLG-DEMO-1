let noticeEl: HTMLDivElement | null = null;
let hideTimer: number | undefined;

/** 战场提示条（增援登场等），短暂显示后淡出 */
export function showNotice(text: string, durationMs = 1800): void {
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  if (!noticeEl) {
    noticeEl = document.createElement('div');
    noticeEl.className = 'battle-notice';
    wrap.appendChild(noticeEl);
  }
  noticeEl.textContent = text;
  noticeEl.classList.add('visible');

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    noticeEl?.classList.remove('visible');
  }, durationMs);
}
