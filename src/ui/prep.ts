import { PLAYER_UNITS, DEPLOY_ZONE } from '../config/map';
import { validateDeployment } from '../core/deployment';
import type { RosterEntry } from '../core/deployment';
import { getTemplate } from '../config/units';

export interface PrepScreen {
  root: HTMLElement;
  startButton: HTMLButtonElement;
  errorList: HTMLElement;
  getRoster(): RosterEntry[];
  setChecked(templateId: string, checked: boolean): void;
  refresh(): void;
  clickStart(): void;
}

/** 战前准备界面（§7.0 R1）：出场名单勾选 + 占位区块 + 校验提示 + 开战按钮 */
export function createPrepScreen(onStart: (roster: RosterEntry[]) => void): PrepScreen {
  const root = document.createElement('div');
  root.className = 'prep-screen';

  const title = document.createElement('h2');
  title.textContent = '战前准备';
  root.appendChild(title);

  const rosterBlock = document.createElement('div');
  rosterBlock.className = 'prep-block';
  const rosterTitle = document.createElement('h3');
  rosterTitle.textContent = '出场名单';
  rosterBlock.appendChild(rosterTitle);

  const checkboxes = new Map<string, HTMLInputElement>();
  const defaultPos = new Map(PLAYER_UNITS.map(u => [u.templateId, u.position]));
  for (const u of PLAYER_UNITS) {
    const label = document.createElement('label');
    label.className = 'prep-unit';
    const box = document.createElement('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => refresh());
    const span = document.createElement('span');
    span.textContent = getTemplate(u.templateId)?.name ?? u.templateId;
    label.appendChild(box);
    label.appendChild(span);
    checkboxes.set(u.templateId, box);
    rosterBlock.appendChild(label);
  }
  root.appendChild(rosterBlock);

  for (const blockName of ['装备与物品（R2）', '技能配置（R3）', '地图配置']) {
    const block = document.createElement('div');
    block.className = 'prep-block disabled';
    const h = document.createElement('h3');
    h.textContent = `${blockName} · 未开放`;
    block.appendChild(h);
    root.appendChild(block);
  }

  const errorList = document.createElement('ul');
  errorList.className = 'prep-errors';
  root.appendChild(errorList);

  const startButton = document.createElement('button') as HTMLButtonElement;
  startButton.className = 'prep-start';
  startButton.textContent = '开战';
  startButton.addEventListener('click', () => clickStart());
  root.appendChild(startButton);

  function getRoster(): RosterEntry[] {
    return [...checkboxes.entries()]
      .filter(([, box]) => box.checked)
      .map(([templateId]) => ({ templateId, position: { ...defaultPos.get(templateId)! } }));
  }

  function setChecked(templateId: string, checked: boolean): void {
    const box = checkboxes.get(templateId);
    if (!box) return;
    box.checked = checked;
    refresh();
  }

  function refresh(): void {
    const check = validateDeployment(getRoster(), DEPLOY_ZONE);
    startButton.disabled = !check.ok;
    errorList.innerHTML = check.ok ? '' : check.errors.map(e => `<li>${e}</li>`).join('');
  }

  function clickStart(): void {
    const roster = getRoster();
    if (validateDeployment(roster, DEPLOY_ZONE).ok) onStart(roster);
  }

  refresh();
  return { root, startButton, errorList, getRoster, setChecked, refresh, clickStart };
}
