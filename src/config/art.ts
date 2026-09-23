/**
 * 美术资源登记（R15，GAME-DESIGN §7.5）——只登记已迁入 public/art/ 的资源，
 * 缺失 = 无字段 → 调用方走回落链（棋子→矢量剪影 / 头像→立绘裁切 / 立绘→区块隐藏）。
 * 新增角色美术 = 放文件 + 此处登记，不改代码。
 * 路径为相对路径：vite base './'（Electron file:// 加载 dist），绝对路径会失效。
 */

export type ArtKind = 'standing' | 'portrait' | 'sprite';

export interface ArtAssets {
  standing?: string;  // 全身立绘，public/art/standing/
  portrait?: string;  // 独立头像，public/art/portrait/（未登记时显示层用立绘裁切）
  sprite?: string;    // 棋子贴图，public/art/sprite/（必须透明底）
}

const ART_ROOT = 'art';

/** 首批供给 2026-09-23：17 模板立绘全量（512×512 降采样迁入，母本见 docs/prototypes/art-samples） */
export const ART_ASSETS: Record<string, ArtAssets> = {
  lord: { standing: 'lord.png' },
  defender: { standing: 'defender.png' },
  paladin: { standing: 'paladin.png' },
  thief: { standing: 'thief.png' },
  knight: { standing: 'knight.png' },
  pegasus: { standing: 'pegasus.png' },
  axeman: { standing: 'axeman.png' },
  archer: { standing: 'archer.png' },
  priest: { standing: 'priest.png' },
  mage: { standing: 'mage.png' },
  swordsman: { standing: 'swordsman.png' },
  spearman: { standing: 'spearman.png' },
  axeman_enemy: { standing: 'axeman_enemy.png' },
  hammerman: { standing: 'hammerman.png' },
  archer_enemy: { standing: 'archer_enemy.png' },
  mage_enemy: { standing: 'mage_enemy.png' },
  boss: { standing: 'boss.png' }
};

/** 查询资源相对路径；未登记返回 null（调用方回落） */
export function artPath(kind: ArtKind, templateId: string): string | null {
  const file = ART_ASSETS[templateId]?.[kind];
  return file ? `${ART_ROOT}/${kind}/${file}` : null;
}
