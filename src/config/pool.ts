import { SKILLS } from './skills';
import type { SkillTemplate, WeaponAtom, ResourceType } from './skills';
import { SPELLS } from './spells';
import type { SpellTemplate } from './spells';
import { TRAIT_CONFIGS } from './traits';
import type { TraitConfig } from './traits';
import type { UnitTemplate } from './units';
import { equipmentAtoms } from './weapons';
import { getJob } from './jobs';

/** 通用技能池条目（§4.9：三表可学条目的 union 视图，不建统一单表） */
export type PoolEntryKind = 'skill' | 'spell' | 'trait';

export interface PoolEntry {
  id: string;
  name: string;
  kind: PoolEntryKind;
  entry: (SkillTemplate | SpellTemplate | TraitConfig) & {
    weaponType?: WeaponAtom | WeaponAtom[];
    resourceType?: ResourceType;
  };
}

/** 不可学原因（R3-5 UI 置灰标注用；null = 可学） */
export type LearnBlockReason = 'resource' | 'weapon';

/** 学习槽位上限（§4.9 口径 A 全局统一可配常量；下限 0 = 普攻即保底） */
export const SLOT_LIMITS = { active: 5, passive: 6 } as const;

export function getPool(): PoolEntry[] {
  return [
    ...Object.values(SKILLS).filter(s => s.learnable)
      .map(s => ({ id: s.id, name: s.name, kind: 'skill' as const, entry: s })),
    ...Object.values(SPELLS).filter(s => s.learnable)
      .map(s => ({ id: s.id, name: s.name, kind: 'spell' as const, entry: s })),
    ...Object.values(TRAIT_CONFIGS).filter(t => t.learnable)
      .map(t => ({ id: t.id, name: t.name, kind: 'trait' as const, entry: t }))
  ];
}

/**
 * 双过滤（§4.9 可学性；R2-3 武器数据源迁装备）：
 * - 武器过滤（声明即过滤，主动/被动均适用）：所需 ∈ 角色装备条目原子并集（§4.14）；未声明豁免；法术默认不声明即免
 * - 资源过滤（仅主动）：声明 resourceType 的技能只能配给主资源对应职业；未声明豁免；被动无消耗天然豁免
 * 死配置（未声明但装备后无效）接受、不校验拦截
 */
export function learnBlockReason(
  t: UnitTemplate,
  equipment: readonly string[],
  e: PoolEntry
): LearnBlockReason | null {
  if (e.entry.weaponType !== undefined) {
    const reqs = Array.isArray(e.entry.weaponType) ? e.entry.weaponType : [e.entry.weaponType];
    const atoms = equipmentAtoms(equipment);
    if (!reqs.some(w => atoms.includes(w))) return 'weapon';
  }
  if (e.kind !== 'trait' && e.entry.resourceType !== undefined
    && e.entry.resourceType !== getJob(t.id)!.resourceType) {
    return 'resource';
  }
  return null;
}

export function canLearn(t: UnitTemplate, equipment: readonly string[], e: PoolEntry): boolean {
  return learnBlockReason(t, equipment, e) === null;
}

/** id → 三表全量条目（含非 learnable 出厂条目；敌方配置校验用） */
export function findRegisteredEntry(id: string): PoolEntry | undefined {
  const skill = SKILLS[id];
  if (skill) return { id: skill.id, name: skill.name, kind: 'skill', entry: skill };
  const spell = SPELLS[id];
  if (spell) return { id: spell.id, name: spell.name, kind: 'spell', entry: spell };
  const trait = TRAIT_CONFIGS[id];
  if (trait) return { id: trait.id, name: trait.name, kind: 'trait', entry: trait };
  return undefined;
}

/** 装填对模板的合法性校验（R3-6 敌方关卡配置复用；R2-3 武器判据 = 装备原子并集，装备缺省回落模板默认）：
 *  未注册 id、分组错误、双约束 */
export function validateLoadoutForTemplate(
  t: UnitTemplate,
  loadout: { active: readonly string[]; passive: readonly string[] },
  equipment: readonly string[] = t.defaultEquipment
): string[] {
  const errors: string[] = [];
  const check = (ids: readonly string[], group: 'active' | 'passive') => {
    for (const id of ids) {
      const entry = findRegisteredEntry(id);
      if (!entry) {
        errors.push(`未注册条目: ${id}（${group}）`);
        continue;
      }
      const expected = entry.kind === 'trait' ? 'passive' : 'active';
      if (expected !== group) {
        errors.push(`分组错误: ${entry.name} 应装${expected === 'active' ? '主动' : '被动'}槽`);
        continue;
      }
      const reason = learnBlockReason(t, equipment, entry);
      if (reason === 'weapon') errors.push(`武器不符: ${entry.name}（${t.name}）`);
      if (reason === 'resource') errors.push(`资源不符: ${entry.name}（${t.name}）`);
    }
  };
  check(loadout.active, 'active');
  check(loadout.passive, 'passive');
  return errors;
}
