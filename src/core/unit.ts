import type { HexCoord, Faction } from './types';
import { getTemplate, resolveSkill } from '../config/units';
import type { SkillTemplate } from '../config/skills';
import type { SpellTemplate } from '../config/spells';
import type { ActiveStatus } from './status';
import type { GroupAiType } from '../config/map';
import { initResources } from './resources';
import type { ResourceState } from './resources';

/** 技能装填（§4.9：挂人物实例，战斗内锁定） */
export interface SkillLoadout {
  readonly active: readonly string[];   // 主动技能/法术 id（SKILLS/SPELLS）
  readonly passive: readonly string[];  // 被动/职业强化 id（TRAIT_CONFIGS）
}

export interface UnitState {
  id: string;
  templateId: string;
  faction: Faction;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  hasActed: boolean;
  moveSpent: number;             // 本回合已消耗移动力（§4.8 再移动剩余移动力）
  statuses: ActiveStatus[];
  loadout: SkillLoadout;         // 技能装填（R3-3：编成传入或出厂默认，战斗内冻结）
  resources: ResourceState;      // 主资源槽（§4.13，R5-1）
  castSpellThisTurn?: boolean;   // R5-2 本回合已施法（0 耗亦算）——MP 歇息恢复判定，阶段开始重置
  groupId?: string;              // 敌方组归属（集结/全组激活）
  aiKind?: GroupAiType;          // 敌方 AI 类型；玩家单位无
  activated: boolean;            // 激活后永久主动（§6）；玩家/主动型/增援恒 true
}

let unitCounter = 0;

export function resetUnitCounter(): void {
  unitCounter = 0;
}

export function createUnitState(
  templateId: string,
  faction: Faction,
  position: HexCoord,
  loadout?: SkillLoadout
): UnitState {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`未知单位模板: ${templateId}`);
  unitCounter++;
  const active = loadout ? [...loadout.active] : [...template.skills];
  const passive = loadout ? [...loadout.passive] : [...(template.traits ?? [])];
  return {
    id: `${faction}-${unitCounter}`,
    templateId,
    faction,
    position: { ...position },
    facing: faction === 'player' ? 1 : 4,
    hp: template.hp,
    maxHp: template.hp,
    hasActed: false,
    moveSpent: 0,
    statuses: [],
    loadout: Object.freeze({ active: Object.freeze(active), passive: Object.freeze(passive) }),
    resources: initResources(template),
    activated: true
  };
}

export function getUnitAt(
  units: UnitState[],
  pos: HexCoord,
  faction?: Faction
): UnitState | undefined {
  return units.find(u => {
    if (u.position.q !== pos.q || u.position.r !== pos.r) return false;
    if (faction !== undefined && u.faction !== faction) return false;
    return true;
  });
}

/** 实例主动技能解析（SKILLS ∪ SPELLS） */
export function getUnitActiveSkills(u: UnitState): (SkillTemplate | SpellTemplate)[] {
  return u.loadout.active
    .map(id => resolveSkill(id))
    .filter((s): s is SkillTemplate | SpellTemplate => s !== undefined);
}

/** 实例被动判定（R3-3：消费点从模板 traits 改读实例装填） */
export function hasUnitTrait(u: UnitState, traitId: string): boolean {
  return u.loadout.passive.includes(traitId);
}
