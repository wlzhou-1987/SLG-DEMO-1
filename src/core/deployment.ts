import type { HexCoord } from './types';
import type { DeployZone } from '../config/map';
import { getTemplate } from '../config/units';
import type { SkillLoadout } from './unit';

/** 出战编成条目（§7.0 R1）：出场名单成员 + 初始站位 + 可选技能装填（R3-3）/ 装备（R2-2） */
export interface RosterEntry {
  templateId: string;
  position: HexCoord;
  loadout?: SkillLoadout;
  equipment?: readonly string[];
}

/** 编成校验规则（全部参数化；领主约束 = 必含模板清单） */
export interface DeploymentRules {
  minUnits: number;
  maxUnits: number;
  requiredTemplateIds: string[];
}

/** 默认规则（2026-09-07 拍板）：领主强制上场，人数 1~10 */
export const DEFAULT_DEPLOYMENT_RULES: DeploymentRules = {
  minUnits: 1,
  maxUnits: 10,
  requiredTemplateIds: ['lord']
};

export interface DeploymentCheckResult {
  ok: boolean;
  errors: string[];
}

export function isInDeployZone(pos: HexCoord, zone: DeployZone): boolean {
  return pos.q >= zone.qMin && pos.q <= zone.qMax && pos.r >= zone.rMin && pos.r <= zone.rMax;
}

export function validateDeployment(
  entries: RosterEntry[],
  zone: DeployZone,
  rules: DeploymentRules = DEFAULT_DEPLOYMENT_RULES
): DeploymentCheckResult {
  const errors: string[] = [];
  if (entries.length < rules.minUnits) {
    errors.push(`出场人数不足：${entries.length} < ${rules.minUnits}`);
  }
  if (entries.length > rules.maxUnits) {
    errors.push(`出场人数超限：${entries.length} > ${rules.maxUnits}`);
  }

  const occupied = new Set<string>();
  const seen = new Set<string>();
  for (const e of entries) {
    const template = getTemplate(e.templateId);
    if (!template) {
      errors.push(`未知模板: ${e.templateId}`);
    } else if (template.faction !== 'player') {
      errors.push(`非我方模板: ${e.templateId}`);
    }
    if (seen.has(e.templateId)) {
      errors.push(`模板重复上场: ${e.templateId}`);
    }
    seen.add(e.templateId);

    if (!isInDeployZone(e.position, zone)) {
      errors.push(`站位在部署区外: (${e.position.q}, ${e.position.r}) ${e.templateId}`);
    }
    const key = `${e.position.q},${e.position.r}`;
    if (occupied.has(key)) {
      errors.push(`站位重叠: (${e.position.q}, ${e.position.r})`);
    }
    occupied.add(key);
  }

  const ids = new Set(entries.map(e => e.templateId));
  for (const required of rules.requiredTemplateIds) {
    if (!ids.has(required)) {
      errors.push(`编成缺少必上模板: ${required}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 战前站位调整：把 roster[index] 移到 target——空格=移动、被占=交换；区外或 index 越界返回 null */
export function applyPlacement(
  roster: RosterEntry[],
  index: number,
  target: HexCoord,
  zone: DeployZone
): RosterEntry[] | null {
  const entry = roster[index];
  if (!entry || !isInDeployZone(target, zone)) return null;
  const other = roster.findIndex(
    e => e !== entry && e.position.q === target.q && e.position.r === target.r
  );
  return roster.map((e, i) => {
    if (i === index) return { ...e, position: { ...target } };
    if (i === other) return { ...e, position: { ...entry.position } };
    return e;
  });
}
