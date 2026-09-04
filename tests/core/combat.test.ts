import { describe, it, expect } from 'vitest';
import { attackSide } from '../../src/core/combat';

describe('attackSide 部位判定', () => {
  // 守方在 (5,5)，朝向 0（东）；左右紧邻 = NE/SE
  it('正面：朝向格与左右紧邻共 3 格', () => {
    expect(attackSide(0, { q: 6, r: 5 }, { q: 5, r: 5 })).toBe('front');  // 东（朝向格）
    expect(attackSide(0, { q: 6, r: 4 }, { q: 5, r: 5 })).toBe('front');  // 东北（右紧邻）
    expect(attackSide(0, { q: 5, r: 6 }, { q: 5, r: 5 })).toBe('front');  // 东南（左紧邻）
  });

  it('侧面：侧后方两格', () => {
    expect(attackSide(0, { q: 5, r: 4 }, { q: 5, r: 5 })).toBe('side');  // 西北
    expect(attackSide(0, { q: 4, r: 6 }, { q: 5, r: 5 })).toBe('side');  // 西南
  });

  it('背面：正对背后一格', () => {
    expect(attackSide(0, { q: 4, r: 5 }, { q: 5, r: 5 })).toBe('back');  // 西
  });

  it('守方朝向 4（西南）时扇区跟随旋转', () => {
    expect(attackSide(4, { q: 4, r: 6 }, { q: 5, r: 5 })).toBe('front'); // 朝向格
    expect(attackSide(4, { q: 5, r: 6 }, { q: 5, r: 5 })).toBe('front'); // 右紧邻
    expect(attackSide(4, { q: 4, r: 5 }, { q: 5, r: 5 })).toBe('front'); // 左紧邻
    expect(attackSide(4, { q: 6, r: 4 }, { q: 5, r: 5 })).toBe('back');  // 正背（东北）
  });

  it('远程（距离 2）按量化方向判部位', () => {
    // 攻方 (7,5) 量化为东 → 守方朝东 → 正面
    expect(attackSide(0, { q: 7, r: 5 }, { q: 5, r: 5 })).toBe('front');
    // 攻方 (3,5) 量化为西 → 守方朝东 → 背面
    expect(attackSide(0, { q: 3, r: 5 }, { q: 5, r: 5 })).toBe('back');
  });
});
