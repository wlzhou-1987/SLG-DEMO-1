import { SKILLS } from './skills';
import type { SkillTemplate, WeaponAtom, ResourceType } from './skills';
import { SPELLS } from './spells';
import type { SpellTemplate } from './spells';
import { TRAIT_CONFIGS } from './traits';
import type { TraitConfig } from './traits';
import type { UnitTemplate } from './units';

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
 * 双过滤（§4.9 可学性）：
 * - 武器过滤（声明即过滤，主动/被动均适用）：所需 ∈ 角色武器集；未声明豁免；法术默认不声明即免
 * - 资源过滤（仅主动）：声明 resourceType 的技能只能配给主资源对应职业；未声明豁免；被动无消耗天然豁免
 * 死配置（未声明但装备后无效）接受、不校验拦截
 */
export function learnBlockReason(t: UnitTemplate, e: PoolEntry): LearnBlockReason | null {
  if (e.entry.weaponType !== undefined) {
    const reqs = Array.isArray(e.entry.weaponType) ? e.entry.weaponType : [e.entry.weaponType];
    if (!reqs.some(w => t.weapons.includes(w))) return 'weapon';
  }
  if (e.kind !== 'trait' && e.entry.resourceType !== undefined && e.entry.resourceType !== t.resourceType) {
    return 'resource';
  }
  return null;
}

export function canLearn(t: UnitTemplate, e: PoolEntry): boolean {
  return learnBlockReason(t, e) === null;
}
