import { PLAYER_UNITS, DEPLOY_ZONE } from '../config/map';
import { validateDeployment } from '../core/deployment';
import type { RosterEntry } from '../core/deployment';
import { getTemplate, resolveSkill } from '../config/units';
import { getTrait } from '../config/traits';
import { getPool, learnBlockReason, SLOT_LIMITS } from '../config/pool';
import type { PoolEntryKind, LearnBlockReason } from '../config/pool';
import { equipmentAtoms, WEAPONS, WEAPON_SLOT_LIMIT } from '../config/weapons';
import { getJob } from '../config/jobs';
import { portraitMarkup } from './portrait';

/** 通用池条目视图（R3-5 UI 渲染与测试驱动） */
export interface PoolItemView {
  id: string;
  name: string;
  desc: string;
  kind: PoolEntryKind;
  blocked: LearnBlockReason | null;
  full: boolean;
}

/** 武器条目清单视图（R2-5：全注册表混排、类别不符置灰） */
export interface EquipmentItemView {
  id: string;
  name: string;
  blocked: boolean;   // 原子 ∉ 职业装备类别（§4.14）
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
  getEffectiveEquipment(templateId: string): readonly string[];
  equipWeapon(templateId: string, weaponId: string): boolean;
  unequipWeapon(templateId: string, index: number): void;
  equipmentEntries(templateId: string): EquipmentItemView[];
}

const KIND_LABELS: Record<PoolEntryKind, string> = { skill: '技能', spell: '法术', trait: '被动' };
const BLOCK_LABELS: Record<LearnBlockReason, string> = { weapon: '武器不符', resource: '资源不符' };
const WEAPON_LABELS: Record<string, string> = {
  sword: '剑', shield: '盾', hammer: '锤', dagger: '匕首',
  spear: '枪', axe: '斧', bow: '弓', staff: '法杖'
};

/** 战前准备界面（§7.0 R1 + R3-5 技能配置 + R2-5 装备配置）：出场名单勾选 + 技能配置 + 装备配置 + 校验提示 + 开战按钮 */
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
    const art = document.createElement('span');   // R15-2 名单行 32px 头像窗
    art.innerHTML = portraitMarkup(u.templateId, 'player', span.textContent, 32);
    row.appendChild(box);
    row.appendChild(art);
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

  // R2-5 装备区块（选中角色 → 武器槽 ×2 → 类别过滤清单；交互同构技能配置，§4.14/§7.0）
  const equips = new Map<string, string[]>();
  let eqListOpen = false;

  const equipBlock = document.createElement('div');
  equipBlock.className = 'prep-block equip-block';
  root.appendChild(equipBlock);

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
    eqListOpen = false;
    renderSkillBlock();
    renderEquipBlock();
  }

  function editableEquipment(templateId: string): string[] {
    let eq = equips.get(templateId);
    if (!eq) {
      const t = getTemplate(templateId);
      eq = [...(t?.defaultEquipment ?? [])];
      equips.set(templateId, eq);
    }
    return eq;
  }

  function getEffectiveEquipment(templateId: string): readonly string[] {
    const edited = equips.get(templateId);
    if (edited) return edited;
    return getTemplate(templateId)?.defaultEquipment ?? [];
  }

  function equipmentEntries(templateId: string): EquipmentItemView[] {
    const classAtoms = getJob(templateId)?.equipmentClass ?? [];
    return Object.values(WEAPONS).map(w => ({
      id: w.id,
      name: w.name,
      blocked: !classAtoms.includes(w.weaponType)
    }));
  }

  function equipWeapon(templateId: string, weaponId: string): boolean {
    const w = WEAPONS[weaponId];
    if (!w || !getTemplate(templateId)) return false;
    const classAtoms = getJob(templateId)!.equipmentClass;
    if (!classAtoms.includes(w.weaponType)) return false;   // 类别过滤
    const eq = editableEquipment(templateId);
    if (eq.length >= WEAPON_SLOT_LIMIT) return false;       // 槽位上限（同条目双持合法 §4.14）
    eq.push(weaponId);
    eqListOpen = true;
    renderSkillBlock();   // 头部原子与技能过滤随装备变化（§4.9 换武器 = 换可用技能）
    renderEquipBlock();
    return true;
  }

  function unequipWeapon(templateId: string, index: number): void {
    const eq = editableEquipment(templateId);
    eq.splice(index, 1);
    renderSkillBlock();
    renderEquipBlock();
  }

  function poolEntries(templateId: string): PoolItemView[] {
    const t = getTemplate(templateId);
    if (!t) return [];
    const eff = getEffectiveLoadout(templateId);
    const effEq = getEffectiveEquipment(templateId);
    return getPool().map(e => {
      const group = e.kind === 'trait' ? 'passive' : 'active';
      return {
        id: e.id,
        name: e.name,
        desc: e.entry.desc ?? '',
        kind: e.kind,
        blocked: learnBlockReason(t, effEq, e),
        full: eff[group].length >= SLOT_LIMITS[group]
      };
    });
  }

  function addToSlot(templateId: string, poolId: string): boolean {
    const t = getTemplate(templateId);
    const entry = getPool().find(e => e.id === poolId);
    if (!t || !entry) return false;
    if (learnBlockReason(t, getEffectiveEquipment(templateId), entry) !== null) return false;
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
    const descOf = (id: string): string => resolveSkill(id)?.desc ?? getTrait(id)?.desc ?? '';
    const slotGroup = (kind: 'active' | 'passive'): string => {
      const ids = [...eff[kind]];
      const limit = SLOT_LIMITS[kind];
      const items = ids.map((id, i) =>
        `<li><span class="slot-name">${nameOf(id)}</span><small class="slot-desc">${descOf(id)}</small> <button class="slot-remove" data-remove="${kind}:${i}">×</button></li>`).join('');
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
        const descLine = v.desc ? `<div class="pool-item-desc">${v.desc}</div>` : '';
        return `<div class="pool-item${disabled}" data-pool-id="${v.id}">${v.name} <small>[${tags.join('·')}]</small>${descLine}</div>`;
      }).join('');
      poolHtml = `<div class="pool-list">${rows || '<p class="dim">池中无可学条目</p>'}</div>`;
    }
    skillBlock.innerHTML =
      `<h3>技能配置 · ${t.name}（${equipmentAtoms(getEffectiveEquipment(selectedId)).map(w => WEAPON_LABELS[w] ?? w).join('/')}）</h3>` +
      slotGroup('active') + slotGroup('passive') + poolHtml;
  }

  function renderEquipBlock(): void {
    if (!selectedId || !checkboxes.get(selectedId)?.checked) {
      eqListOpen = false;
      equipBlock.innerHTML = '<h3>装备</h3><p class="dim">点击出场名单中的角色名进行配置</p>';
      return;
    }
    const t = getTemplate(selectedId)!;
    const eq = getEffectiveEquipment(selectedId);
    const items = eq.map((id, i) => {
      const w = WEAPONS[id];
      return `<li>${w?.name ?? id} <button class="slot-remove" data-eq-remove="${i}">×</button></li>`;
    }).join('');
    const addBtn = eq.length < WEAPON_SLOT_LIMIT
      ? `<li class="slot-add" data-eq-add>＋ 添加</li>` : '';
    let listHtml = '';
    if (eqListOpen) {
      const rows = equipmentEntries(selectedId).map(v => {
        const tags = v.blocked ? ' <small>[类别不符]</small>' : '';
        const disabled = v.blocked ? ' blocked' : '';
        return `<div class="pool-item${disabled}" data-eq-id="${v.id}">${v.name}${tags}</div>`;
      }).join('');
      listHtml = `<div class="pool-list">${rows}</div>`;
    }
    equipBlock.innerHTML =
      `<h3>装备 · ${t.name}（${eq.length}/${WEAPON_SLOT_LIMIT}）</h3>` +
      `<div class="slot-group"><ul>${items}${addBtn}</ul></div>` + listHtml;
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
  equipBlock.addEventListener('click', e => {
    if (!selectedId) return;
    const target = e.target as HTMLElement;
    const remove = target.closest('[data-eq-remove]');
    if (remove) {
      unequipWeapon(selectedId, parseInt((remove as HTMLElement).dataset.eqRemove!));
      return;
    }
    if (target.closest('[data-eq-add]')) {
      eqListOpen = true;
      renderEquipBlock();
      return;
    }
    const pick = target.closest('[data-eq-id]');
    if (pick) equipWeapon(selectedId, (pick as HTMLElement).dataset.eqId!);
  });

  function getRoster(): RosterEntry[] {
    return [...checkboxes.entries()]
      .filter(([, box]) => box.checked)
      .map(([templateId]) => {
        const edited = loadouts.get(templateId);
        const editedEq = equips.get(templateId);
        return {
          templateId,
          position: { ...positions.get(templateId)! },
          loadout: edited ? { active: [...edited.active], passive: [...edited.passive] } : undefined,
          equipment: editedEq ? [...editedEq] : undefined
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
    renderEquipBlock();
  }

  function clickStart(): void {
    const roster = getRoster();
    if (validateDeployment(roster, DEPLOY_ZONE).ok) onStart(roster);
  }

  refresh();
  return {
    root, startButton, errorList, getRoster, setChecked, setBoardRoster, refresh, clickStart,
    selectUnit, getEffectiveLoadout, addToSlot, removeFromSlot, poolEntries,
    getEffectiveEquipment, equipWeapon, unequipWeapon, equipmentEntries
  };
}
