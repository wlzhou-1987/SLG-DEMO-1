import { describe, it, expect } from 'vitest';
import { TERRAIN_PATTERNS } from '../../src/render/terrain-patterns';

describe('R9-1 地形图案完整性', () => {
  it('4 地形全部有绘制函数', () => {
    for (const ty of ['plain', 'forest', 'mountain', 'base'] as const) {
      expect(typeof TERRAIN_PATTERNS[ty], `地形 ${ty}`).toBe('function');
    }
    expect(Object.keys(TERRAIN_PATTERNS)).toHaveLength(4);
  });
});
