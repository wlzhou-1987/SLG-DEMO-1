import { describe, it, expect } from 'vitest';
import { createMapState, isPassable } from '../../src/core/map';
import { MAP_OVERRIDES, INITIAL_UNITS } from '../../src/config/map';
import { getTemplate } from '../../src/config/units';
import { hexKey } from '../../src/core/hex';

describe('关卡 1 配置一致性', () => {
  const map = createMapState(MAP_OVERRIDES);

  it('敌方 40 人（含 BOSS），我方 10 人', () => {
    const players = INITIAL_UNITS.filter(u => u.faction === 'player');
    const enemies = INITIAL_UNITS.filter(u => u.faction === 'enemy');
    expect(players).toHaveLength(10);
    expect(enemies).toHaveLength(40);
  });

  it('所有初始位置在地图内', () => {
    for (const u of INITIAL_UNITS) {
      expect(
        u.position.q >= 0 && u.position.q < map.width &&
        u.position.r >= 0 && u.position.r < map.height,
        `${u.templateId} at ${u.position.q},${u.position.r} 越界`
      ).toBe(true);
    }
  });

  it('初始位置无重叠', () => {
    const seen = new Set<string>();
    for (const u of INITIAL_UNITS) {
      const key = hexKey(u.position);
      expect(seen.has(key), `位置 ${key} 被 ${u.templateId} 重复占据`).toBe(false);
      seen.add(key);
    }
  });

  it('地面单位初始位置不处于山', () => {
    for (const u of INITIAL_UNITS) {
      const template = getTemplate(u.templateId)!;
      if (template.flying) continue;
      expect(
        isPassable(map, u.position, false),
        `${u.templateId} at ${u.position.q},${u.position.r} 站在不可通行地形`
      ).toBe(true);
    }
  });

  it('所有模板 ID 存在', () => {
    for (const u of INITIAL_UNITS) {
      expect(getTemplate(u.templateId), `模板 ${u.templateId} 不存在`).toBeDefined();
    }
  });
});
