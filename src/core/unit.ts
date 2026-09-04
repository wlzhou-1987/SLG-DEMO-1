import type { HexCoord, Faction } from './types';
import { getTemplate } from '../config/units';
import type { ActiveStatus } from './status';
import type { GroupAiType } from '../config/map';

export interface UnitState {
  id: string;
  templateId: string;
  faction: Faction;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  hasActed: boolean;
  statuses: ActiveStatus[];
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
  position: HexCoord
): UnitState {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`未知单位模板: ${templateId}`);
  unitCounter++;
  return {
    id: `${faction}-${unitCounter}`,
    templateId,
    faction,
    position: { ...position },
    facing: faction === 'player' ? 1 : 4,
    hp: template.hp,
    maxHp: template.hp,
    hasActed: false,
    statuses: [],
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
