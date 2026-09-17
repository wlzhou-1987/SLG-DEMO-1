import { PLAYER_UNITS, DEPLOY_ZONE } from '../config/map';
import { validateDeployment } from '../core/deployment';
import type { RosterEntry } from '../core/deployment';
import { getTemplate, resolveSkill } from '../config/units';
import { getTrait } from '../config/traits';
import { getPool, learnBlockReason, SLOT_LIMITS } from '../config/pool';
import type { PoolEntryKind, LearnBlockReason } from '../config/pool';
import { equipmentAtoms } from '../config/weapons';

/** 通用池条目视图（R3-5 UI 渲染与测试驱动） */
export interface PoolItemView {
  id: string;
  name: string;
  kind: PoolEntryKind;
  blocked: LearnBlockReason | null;
  full: boolean;
}

export interface PrepScreen {
  root: HTMLElement;
  startButton: HTMLButtonElement;
  errorList: HTMLElement;
  getRoster(): RosterEntry[];
  setChecked(templateId: string, checked: boolean): void;
  setBoardRoster(next: RosterEntry[]): void;
  refresh(): void;
  clickStart(): void;
  selectUnit(templateId: string): void;
  getEffectiveLoadout(templateId: string): { active: readonly string[]; passive: readonly string[] };
  addToSlot(templateId: string, poolId: string): boolean;
  removeFromSlot(templateId: string, kind: 'active' | 'passive', index: number): void;
  poolEntries(templateId: string): PoolItemView[];
}

const KIND_LABELS: Record<PoolEntryKind, string> = { skill: '技能', spell: '法术', trait: '被动' };
const BLOCK_LABELS: Record<LearnBlockReason, string> = { weapon: '武器不符', resource: '资源不符' };
const WEAPON_LABELS: Record<string, string> = {
  sword: '剑', shield: '盾', hammer: '锤', dagger: '匕首',
  spear: '枪', axe: '斧', bow: '弓', staff: '法杖'
};

/** 战前准备界面（§7.0 R1 + R3-5 技能配置）：出场名单勾选 + 技能配置 + 占位区块 + 校验提示 + 开战按钮 */
export function createPrepScreen(
  onStart: (roster: RosterEntry[]) => void,
  onRosterUpdated?: () => void
): PrepScreen {
  const root = document.createElement('div');
  root.className = 'prep-screen';

  const title = document.createElement('h2');
  title.textContent = '战前准备';
  root.appendChild(title);

  const rosterBlock = document.createElement('div');
  rosterBlock.className = 'prep-block';
  const rosterTitle = document.createElement('h3');
  rosterTitle.textContent = '出场名单（点名配置技能）';
  rosterBlock.appendChild(rosterTitle);

  const checkboxes = new Map<string, HTMLInputElement>();
  const positions = new Map(PLAYER_UNITS.map(u => [u.templateId, { ...u.position }]));
  for (const u of PLAYER_UNITS) {
    const row = document.createElement('div');
    row.className = 'prep-unit';
    row.dataset.unitId = u.templateId;
    const box = document.createElement('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => {
      refresh();
      onRosterUpdated?.();
    });
    const span = document.createElement('span');
    span.textContent = getTemplate(u.templateId)?.name ?? u.templateId;
    row.appendChild(box);
    row.appendChild(span);
    checkboxes.set(u.templateId, box);
    rosterBlock.appendChild(row);
  }
  root.appendChild(rosterBlock);

  // R3-5 技能配置区块（选中角色 → 主动/被动槽 + 通用池双过滤）
  const loadouts = new Map<string, { active: string[]; passive: string[] }>();
  let selectedId: string | null = null;
  let poolOpenFor: 'active' | 'passive' | null = null;

  const skillBlock = document.createElement('div');
  skillBlock.className = 'prep-block skill-block';
  root.appendChild(skillBlock);

  for (const blockName of ['装备与物品（R2）', '地图配置']) {
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

  function editableLoadout(templateId: string): { active: string[]; passive: string[] } {
    let lo = loadouts.get(templateId);
    if (!lo) {
      const t = getTemplate(templateId);
      lo = { active: [...(t?.skills ?? [])], passive: [...(t?.traits ?? [])] };
      loadouts.set(templateId, lo);
    }
    return lo;
  }

  function getEffectiveLoadout(templateId: string): { active: readonly string[]; passive: readonly string[] } {
    const edited = loadouts.get(templateId);
    if (edited) return { active: edited.active, passive: edited.passive };
    const t = getTemplate(templateId);
    return { active: t?.skills ?? [], passive: t?.traits ?? [] };
  }

  function selectUnit(templateId: string): void {
    selectedId = templateId;
    poolOpenFor = null;
    renderSkillBlock();
  }

  function poolEntries(templateId: string): PoolItemView[] {
    const t = getTemplate(templateId);
    if (!t) return [];
    const eff = getEffectiveLoadout(templateId);
    return getPool().map(e => {
      const group = e.kind === 'trait' ? 'passive' : 'active';
      return {
        id: e.id,
        name: e.name,
        kind: e.kind,
        blocked: learnBlockReason(t, t.defaultEquipment, e),
        full: eff[group].length >= SLOT_LIMITS[group]
      };
    });
  }

  function addToSlot(templateId: string, poolId: string): boolean {
    const t = getTemplate(templateId);
    const entry = getPool().find(e => e.id === poolId);
    if (!t || !entry) return false;
    if (learnBlockReason(t, t.defaultEquipment, entry) !== null) return false;
    const group = entry.kind === 'trait' ? 'passive' : 'active';
    const lo = editableLoadout(templateId);
    if (lo[group].includes(poolId)) return false;           // 重复装入拒绝
    if (lo[group].length >= SLOT_LIMITS[group]) return false; // 槽位上限
    lo[group].push(poolId);
    poolOpenFor = group;
    renderSkillBlock();
    return true;
  }

  function removeFromSlot(templateId: string, kind: 'active' | 'passive', index: number): void {
    const lo = editableLoadout(templateId);
    lo[kind].splice(index, 1);
    renderSkillBlock();
  }

  function renderSkillBlock(): void {
    if (!selectedId || !checkboxes.get(selectedId)?.checked) {
      selectedId = null;
      poolOpenFor = null;
      skillBlock.innerHTML = '<h3>技能配置</h3><p class="dim">点击出场名单中的角色名进行配置</p>';
      return;
    }
    const t = getTemplate(selectedId)!;
    const eff = getEffectiveLoadout(selectedId);
    const nameOf = (id: string): string => resolveSkill(id)?.name ?? getTrait(id)?.name ?? id;
    const slotGroup = (kind: 'active' | 'passive'): string => {
      const ids = [...eff[kind]];
      const limit = SLOT_LIMITS[kind];
      const items = ids.map((id, i) =>
        `<li>${nameOf(id)} <button class="slot-remove" data-remove="${kind}:${i}">×</button></li>`).join('');
      const addBtn = ids.length < limit
        ? `<li class="slot-add" data-add="${kind}">＋ 添加</li>` : '';
      return `<div class="slot-group"><h4>${kind === 'active' ? '主动技能' : '被动技能'}（${ids.length}/${limit}）</h4><ul>${items}${addBtn}</ul></div>`;
    };
    let poolHtml = '';
    if (poolOpenFor) {
      const rows = poolEntries(selectedId).map(v => {
        const tags = [KIND_LABELS[v.kind]];
        if (v.blocked) tags.push(BLOCK_LABELS[v.blocked]);
        if (v.full) tags.push('已满');
        const disabled = v.blocked !== null || v.full ? ' blocked' : '';
        return `<div class="pool-item${disabled}" data-pool-id="${v.id}">${v.name} <small>[${tags.join('·')}]</small></div>`;
      }).join('');
      poolHtml = `<div class="pool-list">${rows || '<p class="dim">池中无可学条目</p>'}</div>`;
    }
    skillBlock.innerHTML =
      `<h3>技能配置 · ${t.name}（${equipmentAtoms(t.defaultEquipment).map(w => WEAPON_LABELS[w] ?? w).join('/')}）</h3>` +
      slotGroup('active') + slotGroup('passive') + poolHtml;
  }

  // 事件委托（真实浏览器交互；测试桩走接口方法）
  rosterBlock.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('[data-unit-id]');
    if (el) selectUnit((el as HTMLElement).dataset.unitId!);
  });
  skillBlock.addEventListener('click', e => {
    if (!selectedId) return;
    const target = e.target as HTMLElement;
    const remove = target.closest('[data-remove]');
    if (remove) {
      const [kind, idx] = (remove as HTMLElement).dataset.remove!.split(':');
      removeFromSlot(selectedId, kind as 'active' | 'passive', parseInt(idx));
      return;
    }
    const add = target.closest('[data-add]');
    if (add) {
      poolOpenFor = (add as HTMLElement).dataset.add as 'active' | 'passive';
      renderSkillBlock();
      return;
    }
    const pick = target.closest('[data-pool-id]');
    if (pick) addToSlot(selectedId, (pick as HTMLElement).dataset.poolId!);
  });

  function getRoster(): RosterEntry[] {
    return [...checkboxes.entries()]
      .filter(([, box]) => box.checked)
      .map(([templateId]) => {
        const edited = loadouts.get(templateId);
        return {
          templateId,
          position: { ...positions.get(templateId)! },
          loadout: edited ? { active: [...edited.active], passive: [...edited.passive] } : undefined
        };
      });
  }

  function setChecked(templateId: string, checked: boolean): void {
    const box = checkboxes.get(templateId);
    if (!box) return;
    box.checked = checked;
    refresh();
    onRosterUpdated?.();
  }

  function setBoardRoster(next: RosterEntry[]): void {
    for (const e of next) positions.set(e.templateId, { ...e.position });
    refresh();
    onRosterUpdated?.();
  }

  function refresh(): void {
    const check = validateDeployment(getRoster(), DEPLOY_ZONE);
    startButton.disabled = !check.ok;
    errorList.innerHTML = check.ok ? '' : check.errors.map(e => `<li>${e}</li>`).join('');
    renderSkillBlock();
  }

  function clickStart(): void {
    const roster = getRoster();
    if (validateDeployment(roster, DEPLOY_ZONE).ok) onStart(roster);
  }

  refresh();
  return {
    root, startButton, errorList, getRoster, setChecked, setBoardRoster, refresh, clickStart,
    selectUnit, getEffectiveLoadout, addToSlot, removeFromSlot, poolEntries
  };
}
