import { describe, it, expect } from 'vitest';
import { getAreaCells, unitsInArea } from '../../src/core/area';
import { SKILLS } from '../../src/config/skills';
import { SPELLS } from '../../src/config/spells';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';

describe('R3-7 效果区域解算', () => {
  it('disc 半径 1 = 中心 + 6 邻格（7 格）', () => {
    const cells = getAreaCells({ shape: 'disc', radius: 1 }, { position: { q: 5, r: 5 }, facing: 0 }, { q: 5, r: 5 });
    expect(cells).toHaveLength(7);
    expect(cells).toContainEqual({ q: 5, r: 5 });
    expect(cells).toContainEqual({ q: 6, r: 5 });
    expect(cells).toContainEqual({ q: 4, r: 6 });
  });

  it('disc 半径 0 = 仅中心格（选格释放的最小 AoE）', () => {
    const cells = getAreaCells({ shape: 'disc', radius: 0 }, { position: { q: 0, r: 0 }, facing: 0 }, { q: 3, r: 4 });
    expect(cells).toEqual([{ q: 3, r: 4 }]);
  });

  it('sector = 施法者正面三格扇形（朝向 0：东 + 东北 + 东南）', () => {
    const cells = getAreaCells({ shape: 'sector', radius: 1 }, { position: { q: 5, r: 5 }, facing: 0 }, { q: 5, r: 5 });
    expect(cells).toHaveLength(3);
    expect(cells).toContainEqual({ q: 6, r: 5 });  // 东
    expect(cells).toContainEqual({ q: 6, r: 4 });  // 东北
    expect(cells).toContainEqual({ q: 5, r: 6 });  // 东南
  });

  it('unitsInArea 只取目标阵营存活单位（友军与尸体排除）', () => {
    resetUnitCounter();
    const caster = createUnitState('lord', 'player', { q: 5, r: 5 });
    const foe = createUnitState('swordsman', 'enemy', { q: 6, r: 5 });
    const friend = createUnitState('knight', 'player', { q: 6, r: 4 });
    const deadFoe = createUnitState('swordsman', 'enemy', { q: 5, r: 6 });
    deadFoe.hp = 0;
    const cells = getAreaCells({ shape: 'disc', radius: 1 }, caster, caster.position);
    const targets = unitsInArea([caster, foe, friend, deadFoe], cells, caster.faction);
    expect(targets.map(t => t.id)).toEqual([foe.id]);
  });
});

describe('R3-7 AoE 内容声明', () => {
  it('旋风斩 = 自身中心圆盘（斧系）；神圣盾击 = 正面扇形（盾系）', () => {
    expect(SKILLS.whirlwind.area).toEqual({ shape: 'disc', radius: 1 });
    expect(SKILLS.whirlwind.weaponType).toBe('axe');
    expect(SKILLS.holyShieldStrike.area).toEqual({ shape: 'sector', radius: 1 });
    expect(SKILLS.holyShieldStrike.weaponType).toBe('shield');
  });

  it('陨石术声明 AoE 圆盘', () => {
    expect(SPELLS.meteor.area).toEqual({ shape: 'disc', radius: 1 });
  });
});
