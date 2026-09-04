import { describe, it, expect } from 'vitest';
import {
  neighbor,
  distance,
  inRange,
  ring,
  axialToPixel,
  pixelToAxial,
  hexCorners,
  hexKey,
  isValidHex,
  facingToAngle,
  directionBetween,
} from '../../src/core/hex';
import type { Facing } from '../../src/core/types';

describe('hex', () => {
  describe('distance', () => {
    it('自身距离为 0', () => {
      expect(distance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    });

    it('相邻格子距离为 1', () => {
      expect(distance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
      expect(distance({ q: 0, r: 0 }, { q: 0, r: -1 })).toBe(1);
      expect(distance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
    });

    it('远距离计算正确', () => {
      expect(distance({ q: 0, r: 0 }, { q: 3, r: -2 })).toBe(3);
      expect(distance({ q: 1, r: 1 }, { q: -2, r: 3 })).toBe(3);
    });

    it('距离对称', () => {
      const a = { q: 2, r: -1 };
      const b = { q: -3, r: 4 };
      expect(distance(a, b)).toBe(distance(b, a));
    });
  });

  describe('directionBetween', () => {
    it('距离 1 精确返回六方向', () => {
      expect(directionBetween({ q: 5, r: 5 }, { q: 6, r: 5 })).toBe(0); // E
      expect(directionBetween({ q: 5, r: 5 }, { q: 6, r: 4 })).toBe(1); // NE
      expect(directionBetween({ q: 5, r: 5 }, { q: 5, r: 4 })).toBe(2); // NW
      expect(directionBetween({ q: 5, r: 5 }, { q: 4, r: 5 })).toBe(3); // W
      expect(directionBetween({ q: 5, r: 5 }, { q: 4, r: 6 })).toBe(4); // SW
      expect(directionBetween({ q: 5, r: 5 }, { q: 5, r: 6 })).toBe(5); // SE
    });

    it('距离 2 纯轴向量化正确', () => {
      expect(directionBetween({ q: 5, r: 5 }, { q: 7, r: 5 })).toBe(0);  // 正东 ×2
      expect(directionBetween({ q: 5, r: 5 }, { q: 7, r: 3 })).toBe(1);  // 正东北 ×2
      expect(directionBetween({ q: 5, r: 5 }, { q: 5, r: 3 })).toBe(2);  // 正西北 ×2
      expect(directionBetween({ q: 5, r: 5 }, { q: 3, r: 5 })).toBe(3);  // 正西 ×2
      expect(directionBetween({ q: 5, r: 5 }, { q: 3, r: 7 })).toBe(4);  // 正西南 ×2
      expect(directionBetween({ q: 5, r: 5 }, { q: 5, r: 7 })).toBe(5);  // 正东南 ×2
    });
  });

  describe('neighbor', () => {
    it('6 个方向邻居距离均为 1', () => {
      const center = { q: 5, r: 5 };
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(center, dir as Facing);
        expect(distance(center, n)).toBe(1);
      }
    });

    it('东西方向互为反向', () => {
      const center = { q: 0, r: 0 };
      const east = neighbor(center, 0); // E
      const west = neighbor(center, 3); // W
      expect(east.q).toBe(1);
      expect(west.q).toBe(-1);
    });
  });

  describe('inRange', () => {
    it('range=0 只含自身', () => {
      const result = inRange({ q: 0, r: 0 }, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ q: 0, r: 0 });
    });

    it('range=1 含 7 格（中心 + 6 邻居）', () => {
      const result = inRange({ q: 0, r: 0 }, 1);
      expect(result).toHaveLength(7);
    });

    it('range=2 含 19 格', () => {
      const result = inRange({ q: 0, r: 0 }, 2);
      expect(result).toHaveLength(19);
    });

    it('range=3 含 37 格', () => {
      const result = inRange({ q: 0, r: 0 }, 3);
      expect(result).toHaveLength(37);
    });

    it('所有结果在指定距离内', () => {
      const center = { q: 5, r: 5 };
      const range = 3;
      const result = inRange(center, range);
      for (const hex of result) {
        expect(distance(center, hex)).toBeLessThanOrEqual(range);
      }
    });
  });

  describe('ring', () => {
    it('radius=0 只含中心', () => {
      expect(ring({ q: 0, r: 0 }, 0)).toHaveLength(1);
    });

    it('radius=1 含 6 格', () => {
      expect(ring({ q: 0, r: 0 }, 1)).toHaveLength(6);
    });

    it('radius=2 含 12 格', () => {
      expect(ring({ q: 0, r: 0 }, 2)).toHaveLength(12);
    });

    it('环上所有格子距离中心等于半径', () => {
      const center = { q: 3, r: 3 };
      const radius = 4;
      const result = ring(center, radius);
      for (const hex of result) {
        expect(distance(center, hex)).toBe(radius);
      }
    });
  });

  describe('pixel roundtrip', () => {
    it('轴坐标→像素→轴坐标 往返一致', () => {
      const size = 32;
      const coords = [
        { q: 0, r: 0 },
        { q: 5, r: 3 },
        { q: -2, r: 7 },
        { q: 10, r: -5 },
      ];
      for (const coord of coords) {
        const pixel = axialToPixel(coord, size);
        const back = pixelToAxial(pixel.x, pixel.y, size);
        expect(back).toEqual(coord);
      }
    });

    it('原点像素为 (0, 0)', () => {
      const pixel = axialToPixel({ q: 0, r: 0 }, 32);
      expect(pixel.x).toBe(0);
      expect(pixel.y).toBe(0);
    });
  });

  describe('hexCorners', () => {
    it('返回 6 个角点', () => {
      const corners = hexCorners(100, 100, 32);
      expect(corners).toHaveLength(6);
    });

    it('角点到中心距离等于 size', () => {
      const cx = 50;
      const cy = 50;
      const size = 40;
      const corners = hexCorners(cx, cy, size);
      for (const c of corners) {
        const dx = c.x - cx;
        const dy = c.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeCloseTo(size, 5);
      }
    });
  });

  describe('hexKey', () => {
    it('相同坐标生成相同键', () => {
      expect(hexKey({ q: 1, r: 2 })).toBe(hexKey({ q: 1, r: 2 }));
    });

    it('不同坐标生成不同键', () => {
      expect(hexKey({ q: 1, r: 2 })).not.toBe(hexKey({ q: 2, r: 1 }));
    });
  });

  describe('isValidHex', () => {
    it('范围内返回 true', () => {
      expect(isValidHex({ q: 0, r: 0 }, 20, 30)).toBe(true);
      expect(isValidHex({ q: 19, r: 29 }, 20, 30)).toBe(true);
      expect(isValidHex({ q: 10, r: 15 }, 20, 30)).toBe(true);
    });

    it('范围外返回 false', () => {
      expect(isValidHex({ q: -1, r: 0 }, 20, 30)).toBe(false);
      expect(isValidHex({ q: 20, r: 0 }, 20, 30)).toBe(false);
      expect(isValidHex({ q: 0, r: 30 }, 20, 30)).toBe(false);
      expect(isValidHex({ q: 0, r: -1 }, 20, 30)).toBe(false);
    });
  });

  describe('facingToAngle', () => {
    it('东为 0°', () => {
      expect(facingToAngle(0)).toBe(0);
    });

    it('西为 180°', () => {
      expect(facingToAngle(3)).toBe(180);
    });

    it('6 个朝向角度不同', () => {
      const angles = new Set<number>();
      for (let f = 0; f < 6; f++) {
        angles.add(facingToAngle(f as Facing));
      }
      expect(angles.size).toBe(6);
    });
  });
});
