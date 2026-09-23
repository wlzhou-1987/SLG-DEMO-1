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

/** 首批供给 2026-09-23：17 模板立绘全量 + 棋子透明底全量（立绘母本抠图 512×512，母本见 docs/prototypes/art-samples） */
export const ART_ASSETS: Record<string, ArtAssets> = {
  lord: { standing: 'lord.png', sprite: 'lord.png' },
  defender: { standing: 'defender.png', sprite: 'defender.png' },
  paladin: { standing: 'paladin.png', sprite: 'paladin.png' },
  thief: { standing: 'thief.png', sprite: 'thief.png' },
  knight: { standing: 'knight.png', sprite: 'knight.png' },
  pegasus: { standing: 'pegasus.png', sprite: 'pegasus.png' },
  axeman: { standing: 'axeman.png', sprite: 'axeman.png' },
  archer: { standing: 'archer.png', sprite: 'archer.png' },
  priest: { standing: 'priest.png', sprite: 'priest.png' },
  mage: { standing: 'mage.png', sprite: 'mage.png' },
  swordsman: { standing: 'swordsman.png', sprite: 'swordsman.png' },
  spearman: { standing: 'spearman.png', sprite: 'spearman.png' },
  axeman_enemy: { standing: 'axeman_enemy.png', sprite: 'axeman_enemy.png' },
  hammerman: { standing: 'hammerman.png', sprite: 'hammerman.png' },
  archer_enemy: { standing: 'archer_enemy.png', sprite: 'archer_enemy.png' },
  mage_enemy: { standing: 'mage_enemy.png', sprite: 'mage_enemy.png' },
  boss: { standing: 'boss.png', sprite: 'boss.png' }
};

/** 查询资源相对路径；未登记返回 null（调用方回落） */
export function artPath(kind: ArtKind, templateId: string): string | null {
  const file = ART_ASSETS[templateId]?.[kind];
  return file ? `${ART_ROOT}/${kind}/${file}` : null;
}
