import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ART_ASSETS, artPath } from '../../src/config/art';
import type { ArtKind } from '../../src/config/art';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '../../src/config/units';

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
