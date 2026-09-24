/**
 * 美术资源登记（R15，GAME-DESIGN §7.5）——只登记已迁入 public/art/ 的资源，
 * 缺失 = 无字段 → 调用方走回落链（棋子→矢量剪影 / 头像→立绘裁切 / 立绘→区块隐藏）。
 * 新增角色美术 = 放文件 + 此处登记，不改代码。
 * 路径为相对路径：vite base './'（Electron file:// 加载 dist），绝对路径会失效。
 */

import type { TerrainType } from '../core/types';
import type { DamageType } from '../core/types';

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

/** 地形贴图登记（R16）：满铺方图无需透明底；缺失/未登记 = null → 渲染层回落矢量图案（R9 资产） */
export const TERRAIN_ART: Partial<Record<TerrainType, string>> = {
  plain: 'plain.png',
  forest: 'forest.png',
  mountain: 'mountain.png',
  base: 'base.png'
};

export function terrainArtPath(terrain: TerrainType): string | null {
  const file = TERRAIN_ART[terrain];
  return file ? `${ART_ROOT}/terrain/${file}` : null;
}

/**
 * 战斗特效登记（R16-2，§7.4/§7.5）：键 = 特效名（伤害线/通用反馈/技能映射目标值），
 * 值 = public/art/fx/ 文件名；未登记 → null，表现层不播（区别于图标的文字回落）。
 */
export const FX_ART: Record<string, string> = {
  // 普攻伤害线（按 damageType 自动映射）
  slash: 'fx-slash.png',
  thrust: 'fx-thrust.png',
  blunt: 'fx-blunt.png',
  // 通用反馈（§7.4：暴击/落空/有盾吸收即播/阵亡）
  crit: 'fx-crit.png',
  miss: 'fx-miss.png',
  'shield-break': 'fx-shield-break.png',
  death: 'fx-death.png',
  // 技能/法术/行为特效（文件名 ≠ id 处经 FX_BY_SKILL_ID 显式对应）
  'thrust-strike': 'fx-thrust-strike.png',
  'shield-bash': 'fx-shield-bash.png',
  'war-cry': 'fx-war-cry.png',
  'defensive-stance': 'fx-defensive-stance.png',
  blessing: 'fx-blessing.png',
  'shield-strike': 'fx-shield-strike.png',
  'holy-shield-smash': 'fx-holy-shield-smash.png',
  stealth: 'fx-stealth.png',
  backstab: 'fx-backstab.png',
  'shadow-strike': 'fx-shadow-strike.png',
  charge: 'fx-charge.png',
  'deadly-strike': 'fx-deadly-strike.png',
  'air-strike': 'fx-air-strike.png',
  bloodlust: 'fx-bloodlust.png',
  whirlwind: 'fx-whirlwind.png',
  snipe: 'fx-snipe.png',
  'aimed-shot': 'fx-aimed-shot.png',
  'axe-butt': 'fx-axe-butt.png',
  warhammer: 'fx-warhammer.png',
  sweep: 'fx-sweep.png',
  fireball: 'fx-fireball.png',
  meteor: 'fx-meteor.png',
  curse: 'fx-curse.png',
  heal: 'fx-heal.png',
  regen: 'fx-regen.png',
  aegis: 'fx-aegis.png'
};

/** 技能/法术/行为 id → 特效名（id 与文件名同者直书，不同者显式对应；26 条全量） */
export const FX_BY_SKILL_ID: Record<string, string> = {
  stealth: 'stealth',
  defenseStance: 'defensive-stance',
  blessing: 'blessing',
  warCry: 'war-cry',
  stab: 'thrust-strike',
  'backstab-strike': 'backstab',
  'shadow-strike': 'shadow-strike',
  deathblow: 'deadly-strike',
  'sky-strike': 'air-strike',
  bloodlust: 'bloodlust',
  'aim-shot': 'aimed-shot',
  'charge-rush': 'charge',
  'axe-butt': 'axe-butt',
  shieldThrust: 'shield-bash',
  warHammer: 'warhammer',
  shieldStrike: 'shield-strike',
  snipe: 'snipe',
  whirlwind: 'whirlwind',
  holyShieldStrike: 'holy-shield-smash',
  sweep: 'sweep',
  fireball: 'fireball',
  meteor: 'meteor',
  curse: 'curse',
  heal: 'heal',
  regen: 'regen',
  mithrilShield: 'aegis'
};

/** 通用反馈特效名（触发时点见 §7.4） */
export const FX_COMMON = {
  crit: 'crit',
  miss: 'miss',
  shieldBreak: 'shield-break',
  death: 'death'
} as const;

/** 普攻三线自动映射（magic 线无普攻特效 → undefined 不播） */
const FX_BY_DAMAGE_TYPE: Partial<Record<DamageType, string>> = {
  slashing: 'slash',
  piercing: 'thrust',
  blunt: 'blunt'
};

export function fxPath(name: string): string | null {
  const file = FX_ART[name];
  return file ? `${ART_ROOT}/fx/${file}` : null;
}

/** 逐击/释放时选特效：普攻（id 前缀 basic:，R2-2 口径）按伤害线，其余按技能/法术 id 映射；无映射返 null 不播 */
export function fxNameForSkill(skill: { id: string; damageType: DamageType }): string | null {
  if (skill.id.startsWith('basic:')) return FX_BY_DAMAGE_TYPE[skill.damageType] ?? null;
  return FX_BY_SKILL_ID[skill.id] ?? null;
}

/** 全量特效路径（启动预载用，触发 SpriteCache 懒加载） */
export function allFxPaths(): string[] {
  return Object.values(FX_ART).map(f => `${ART_ROOT}/fx/${f}`);
}
