import { artPath } from '../config/art';
import type { Faction } from '../core/types';

/** DOM 头像窗（R15-2，§7.5）三级回落：独立头像 → 立绘裁切（cover 取上部）→ 阵营色底+名首字。
 *  img 加载失败 = 缺失同回落：onerror 时显示同级隐藏占位。 */

// 阵营色与渲染层 FACTION_COLORS 同源（R9-1 定稿值）；UI 层不依赖渲染层，本地声明
const FACTION_BG: Record<Faction, string> = { player: '#4a90d9', enemy: '#d94a4a' };

export function portraitMarkup(templateId: string, faction: Faction, name: string, size: number): string {
  const url = artPath('portrait', templateId) ?? artPath('standing', templateId);
  const fallback =
    `<i class="art-fb${url ? '' : ' art-fb-on'}" style="background:${FACTION_BG[faction]}">${name.charAt(0)}</i>`;
  if (!url) return `<span class="art-slot" style="width:${size}px;height:${size}px">${fallback}</span>`;
  const img =
    `<img class="art-img" src="${url}" alt="${name}" ` +
    `onerror="this.style.display='none';this.parentNode.querySelector('.art-fb').style.display='flex'">`;
  return `<span class="art-slot" style="width:${size}px;height:${size}px">${img}${fallback}</span>`;
}
