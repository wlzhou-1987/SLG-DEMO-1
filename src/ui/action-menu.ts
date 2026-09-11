export interface MenuItem {
  label: string;
  value: string;
  kind?: 'normal' | 'cancel';
  disabled?: boolean;  // R5-1 资源不足等不可选项：灰显且点击不触发
}

let menuEl: HTMLDivElement | null = null;

/** 在画布容器内弹出浮动行动菜单（原型 .action-menu 形态） */
export function showActionMenu(
  screenX: number,
  screenY: number,
  items: MenuItem[],
  onPick: (value: string) => void
): void {
  hideActionMenu();
  const wrap = document.getElementById('map-wrap');
  if (!wrap) return;

  menuEl = document.createElement('div');
  menuEl.className = 'action-menu';
  menuEl.style.left = `${screenX + 10}px`;
  menuEl.style.top = `${screenY - 10}px`;

  for (const item of items) {
    const div = document.createElement('div');
    div.className = item.kind === 'cancel' ? 'item cancel' : 'item';
    if (item.disabled) div.className += ' disabled';
    div.textContent = item.label;
    div.addEventListener('mousedown', e => e.stopPropagation());
    div.addEventListener('click', () => {
      if (item.disabled) return;  // R5-1 灰显项不触发回调
      hideActionMenu();
      onPick(item.value);
    });
    menuEl.appendChild(div);
  }

  wrap.appendChild(menuEl);
}

export function hideActionMenu(): void {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}
