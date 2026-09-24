import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ART_ASSETS, artPath, TERRAIN_ART, terrainArtPath, FX_ART, FX_BY_SKILL_ID, FX_COMMON, fxPath, fxNameForSkill, allFxPaths } from '../../src/config/art';
import { SKILLS } from '../../src/config/skills';
import { SPELLS } from '../../src/config/spells';
import type { ArtKind } from '../../src/config/art';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';
import type { TerrainType } from '../../src/core/types';

const TEMPLATE_IDS = [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES].map(t => t.id);
const KINDS: ArtKind[] = ['standing', 'portrait', 'sprite'];

describe('R15-1 美术资源登记（art.ts 显式登记制，§7.5）', () => {
  it('登记键集 = 17 模板 id 合法集，且立绘/棋子 17 全量登记', () => {
    expect(Object.keys(ART_ASSETS).sort()).toEqual([...TEMPLATE_IDS].sort());
    for (const id of TEMPLATE_IDS) {
      expect(ART_ASSETS[id].standing, `${id} 立绘已登记`).toMatch(/\.png$/);
      expect(ART_ASSETS[id].sprite, `${id} 棋子已登记`).toMatch(/\.png$/);
    }
  });

  it('artPath：登记返回相对路径（base ./ 兼容 Electron file://），未登记类别与未知模板返 null', () => {
    expect(artPath('standing', 'lord')).toBe('art/standing/lord.png');
    expect(artPath('sprite', 'lord')).toBe('art/sprite/lord.png');
    expect(artPath('portrait', 'lord')).toBeNull();   // 头像未登记 → 显示层立绘裁切
    expect(artPath('sprite', 'unknown-unit')).toBeNull();
    expect(artPath('standing', 'unknown-unit')).toBeNull();
  });

  it('登记值为合法 png 文件名（类型防呆）', () => {
    for (const [id, assets] of Object.entries(ART_ASSETS)) {
      for (const kind of KINDS) {
        const v = assets[kind];
        if (v !== undefined) {
          expect(typeof v, `${id}.${kind}`).toBe('string');
          expect(v, `${id}.${kind}`).toMatch(/^[a-z0-9_]+\.png$/);
        }
      }
    }
  });

  it('登记与 public/art/{standing,sprite} 物理文件一致（登记制不漂移）', () => {
    for (const kind of ['standing', 'sprite'] as const) {
      const dir = resolve(process.cwd(), `public/art/${kind}`);
      expect(existsSync(dir), `${kind} 目录存在`).toBe(true);
      const files = new Set(readdirSync(dir).filter(f => f.endsWith('.png')));
      const registered = new Set(TEMPLATE_IDS.map(id => ART_ASSETS[id][kind]!));
      for (const f of registered) expect(files.has(f), `已登记文件存在：${kind}/${f}`).toBe(true);
      for (const f of files) expect(registered.has(f), `目录文件已登记：${kind}/${f}`).toBe(true);
    }
  });
});

describe('R16 地形贴图登记（art.ts 扩展，§7.5 登记制同构）', () => {
  const TERRAIN_TYPES: TerrainType[] = ['plain', 'forest', 'mountain', 'base'];
  const savedTerrain = { ...TERRAIN_ART };

  afterEach(() => {
    Object.keys(TERRAIN_ART).forEach(k => delete (TERRAIN_ART as Record<string, string | undefined>)[k]);
    Object.assign(TERRAIN_ART, savedTerrain);
  });

  it('4 地形全量登记，值为合法 png 文件名', () => {
    expect(Object.keys(TERRAIN_ART).sort()).toEqual([...TERRAIN_TYPES].sort());
    for (const t of TERRAIN_TYPES) {
      expect(TERRAIN_ART[t], `${t} 已登记`).toMatch(/^[a-z0-9_]+\.png$/);
    }
  });

  it('terrainArtPath：登记返回相对路径（base ./ 兼容 Electron file://），未登记返 null', () => {
    expect(terrainArtPath('plain')).toBe('art/terrain/plain.png');
    expect(terrainArtPath('forest')).toBe('art/terrain/forest.png');
    expect(terrainArtPath('mountain')).toBe('art/terrain/mountain.png');
    expect(terrainArtPath('base')).toBe('art/terrain/base.png');
    delete (TERRAIN_ART as Partial<Record<TerrainType, string>>).mountain;
    expect(terrainArtPath('mountain')).toBeNull();   // 未登记 → 渲染层回落矢量图案
  });

  it('登记与 public/art/terrain 物理文件一致（登记制不漂移）', () => {
    const dir = resolve(process.cwd(), 'public/art/terrain');
    expect(existsSync(dir), 'terrain 目录存在').toBe(true);
    const files = new Set(readdirSync(dir).filter(f => f.endsWith('.png')));
    const registered = new Set(Object.values(TERRAIN_ART));
    for (const f of registered) expect(files.has(f), `已登记文件存在：terrain/${f}`).toBe(true);
    for (const f of files) expect(registered.has(f), `目录文件已登记：terrain/${f}`).toBe(true);
  });
});

describe('R16-2 战斗特效登记（art.ts 扩展，§7.4/§7.5）', () => {
  it('技能/法术映射全量覆盖 20 技能 + 6 法术，映射值均在 FX_ART 在册（全量接入定稿）', () => {
    const ids = [...Object.keys(SKILLS), ...Object.keys(SPELLS)];
    expect(ids).toHaveLength(26);
    for (const id of ids) {
      const fxName = FX_BY_SKILL_ID[id];
      expect(fxName, `${id} 有特效映射`).toBeDefined();
      expect(FX_ART[fxName], `${id} → ${fxName} 在 FX_ART 在册`).toBeDefined();
    }
  });

  it('通用反馈四键在册；fxPath 相对路径（base ./ 兼容 Electron file://），未登记返 null', () => {
    for (const key of ['crit', 'miss', 'shieldBreak', 'death'] as const) {
      expect(FX_ART[FX_COMMON[key]], `${key} 在册`).toBeDefined();
    }
    expect(fxPath('slash')).toBe('art/fx/fx-slash.png');
    expect(fxPath('death')).toBe('art/fx/fx-death.png');
    expect(fxPath('unknown-fx')).toBeNull();
  });

  it('普攻三线按 damageType 自动映射；未知技能/无映射伤害线返 null（缺失不播）', () => {
    expect(fxNameForSkill({ id: 'basic:longsword', damageType: 'slashing' })).toBe('slash');
    expect(fxNameForSkill({ id: 'basic:longbow', damageType: 'piercing' })).toBe('thrust');
    expect(fxNameForSkill({ id: 'basic:staff', damageType: 'blunt' })).toBe('blunt');
    expect(fxNameForSkill({ id: 'stab', damageType: 'piercing' })).toBe('thrust-strike');
    expect(fxNameForSkill({ id: 'stealth', damageType: 'piercing' })).toBe('stealth');
    expect(fxNameForSkill({ id: 'not-a-skill', damageType: 'slashing' })).toBeNull();
    expect(fxNameForSkill({ id: 'basic:magic-thing', damageType: 'magic' })).toBeNull();  // magic 线无普攻特效
  });

  it('登记与 public/art/fx 物理文件一致（登记制不漂移，33 张）', () => {
    const dir = resolve(process.cwd(), 'public/art/fx');
    expect(existsSync(dir), 'fx 目录存在').toBe(true);
    const files = new Set(readdirSync(dir).filter(f => f.endsWith('.png')));
    const registered = new Set(Object.values(FX_ART));
    expect(registered.size).toBe(33);
    expect(allFxPaths()).toHaveLength(33);   // 预载清单与登记同基数
    for (const f of registered) expect(files.has(f), `已登记文件存在：fx/${f}`).toBe(true);
    for (const f of files) expect(registered.has(f), `目录文件已登记：fx/${f}`).toBe(true);
  });
});
