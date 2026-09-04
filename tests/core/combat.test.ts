import { describe, it, expect, beforeEach } from 'vitest';
import { attackSide, calcBattleForecast } from '../../src/core/combat';
import { createMapState } from '../../src/core/map';
import { getTemplate } from '../../src/config/units';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';

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

describe('calcBattleForecast 战斗预报', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  // 攻方默认领主(10,15)朝东，守方剑士(11,15)朝西
  const makeUnits = (attackerPos = { q: 10, r: 15 }, defenderPos = { q: 11, r: 15 }) => ({
    attacker: createUnitState('lord', 'player', attackerPos),
    defender: createUnitState('swordsman', 'enemy', defenderPos)
  });

  it('基础伤害：攻−防 后乘矩阵系数', () => {
    // 领主横斩(挥砍)攻剑士(轻甲)：max(8−4−0,0)×1.25 = 5
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    expect(f.attacker.damage).toBe(5);
    expect(f.attacker.damageType).toBe('slashing');
  });

  it('伤害地板 0：攻低于防时为 0', () => {
    // 牧师(atk4)治疗是 magic 射程 2——用法师火球(atk8, magic)打 BOSS(重甲 def11)
    // max(8−11−0,0)=0 → 伤害 0
    const attacker = createUnitState('mage', 'player', { q: 10, r: 15 });
    const defender = createUnitState('boss', 'enemy', { q: 12, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, getTemplate('mage')!.skills[0]);
    expect(f.attacker.damage).toBe(0);
  });

  it('地形防：守方站森林防 +1', () => {
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(forestMap, attacker, defender, getTemplate('lord')!.skills[0]);
    // max(8−4−1,0)×1.25 = floor(3.75) = 3
    expect(f.attacker.damage).toBe(3);
  });

  it('飞行守方不享地形防与回避加成', () => {
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('pegasus', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(forestMap, attacker, defender, getTemplate('lord')!.skills[0]);
    // 飞马 light：max(8−5−0,0)×1.25 = floor(3.75) = 3（若误吃森林+1 则为 2）
    expect(f.attacker.damage).toBe(3);
    // 回避 = 运×3 = 21（若误吃森林+20 则命中骤降 20）
    // 命中 = 50 + 10×5 − 21 = 79
    expect(f.attacker.hitRate).toBe(79);
  });

  it('命中公式与 clamp', () => {
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    // 命中 = 50 + 领主技10×5 − 剑士运4×3 = 50+50−12 = 88
    expect(f.attacker.hitRate).toBe(88);
  });

  it('背面攻击：命中 +25 伤害 +3', () => {
    // 守方朝东(0)，攻方在西(9,15) → 背面
    const attacker = createUnitState('lord', 'player', { q: 9, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    defender.facing = 0;
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    expect(f.attacker.side).toBe('back');
    expect(f.attacker.damage).toBe(5 + 3);
    expect(f.attacker.hitRate).toBe(100); // 88+25=113 被 clamp 到上限
  });

  it('超射程命中惩罚：每格 −15', () => {
    // 近战技能打距离 2（直接调用函数验证公式）
    const attacker = createUnitState('lord', 'player', { q: 9, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    // 距离 2 超出 rangeMax 1 → 88 − 15 = 73
    expect(f.attacker.hitRate).toBe(73);
  });

  it('守方可反击：近战互殴', () => {
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    expect(f.counter).not.toBeNull();
    // 剑士横斩(挥砍) vs 领主(轻甲)：max(5−6−0,0)×1.25 = 0
    expect(f.counter!.damage).toBe(0);
  });

  it('弓手被贴脸无反击（最小射程死角）', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('archer_enemy', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, getTemplate('lord')!.skills[0]);
    expect(f.counter).toBeNull();
  });

  it('反击择优：覆盖射程的技能中期望伤害最高', () => {
    // 领主(轻甲)攻 BOSS：BOSS 技能序 [重锤(钝击), 横扫(挥砍)]
    // 钝击 vs 轻甲 ×0.75 → floor(6×0.75)=4；挥砍 vs 轻甲 ×1.25 → floor(6×1.25)=7
    // 择优应选横扫（虽排在技能列表第二位）
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, boss, getTemplate('lord')!.skills[0]);
    expect(f.counter).not.toBeNull();
    expect(f.counter!.skillName).toBe('横扫');
    expect(f.counter!.damage).toBe(7);
  });

  it('追击：速度差 ≥4 快方多打一次', () => {
    // 盗贼 spd12 vs 剑士 spd8 → 差 4 → 攻方 count 2
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, getTemplate('thief')!.skills[0]);
    expect(f.attacker.count).toBe(2);
    // 反向：剑士 spd8 攻盗贼 spd12 → 守方 count 2
    const f2 = calcBattleForecast(map, defender, attacker, getTemplate('swordsman')!.skills[0]);
    expect(f2.counter!.count).toBe(2);
    expect(f2.attacker.count).toBe(1);
  });
});
