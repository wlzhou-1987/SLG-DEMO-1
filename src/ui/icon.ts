import { iconPath } from '../config/art';

/** 图标缺失/加载失败的回落文字（键 = 语义键，与 ICON_ART 同键集；缺省回落 = 空串不显示） */
const FALLBACK: Record<string, string> = {
  sword: '剑', shield: '盾', hammer: '锤', dagger: '匕', spear: '枪', axe: '斧', bow: '弓', staff: '杖',
  rage: '怒', focus: '专', mp: 'MP',
  slashing: '斩', piercing: '突', blunt: '钝',
  'armor-none': '无甲', 'armor-light': '轻甲', 'armor-medium': '中甲', 'armor-heavy': '重甲',
  infantry: '步兵', cavalry: '骑兵', flying: '飞行', heavy: '重甲', monster: '魔物', dragon: '龙',
  'status-chant': '咏', 'status-charge': '蓄', 'status-stealth': '隐', 'status-burn': '灼',
  'status-buff': '增', 'status-shield': '盾', 'status-regen': '再', 'status-stance': '姿'
};

/**
 * UI 图标件（R16-3，§7.5）：已登记键出 <img>（加载失败 onerror 显 CSS 回落文字 data-fb）；
 * 未登记键回落文字（无文字则空串——伤害线 magic 等无图不显示）。
 */
export function iconSpan(key: string, fallbackText?: string): string {
  const text = fallbackText ?? FALLBACK[key];
  const path = iconPath(key);
  if (!path) return text ? `<span class="ui-icon icon-fb">${text}</span>` : '';
  return `<span class="ui-icon" data-fb="${text ?? ''}"><img src="${path}" alt="${text ?? ''}" onerror="this.remove();this.parentNode.classList.add('icon-fb')"></span>`;
}
