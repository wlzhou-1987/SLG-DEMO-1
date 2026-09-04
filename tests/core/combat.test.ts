import { describe, it, expect, beforeEach } from 'vitest';
import { attackSide, calcBattleForecast, resolveBattle } from '../../src/core/combat';
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

describe('resolveBattle 战斗结算', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const lordSkill = getTemplate('lord')!.skills[0];

  it('命中按预报伤害扣血', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const hpBefore = defender.hp;
    const f = calcBattleForecast(map, attacker, defender, lordSkill);
    const r = resolveBattle(map, attacker, defender, lordSkill, () => 0);
    expect(r.strikes.length).toBeGreaterThan(0);
    expect(r.strikes[0].hit).toBe(true);
    expect(r.defenderHp).toBe(hpBefore - f.attacker.damage * f.attacker.count);
  });

  it('未命中不造成伤害', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, lordSkill, () => 0.99);
    expect(r.strikes.every(s => !s.hit)).toBe(true);
    expect(r.defenderHp).toBe(defender.hp);
    expect(r.attackerHp).toBe(attacker.hp);
  });

  it('击杀目标则无反击', () => {
    // BOSS(atk12) 重锤打剑士(18hp)：无甲? 剑士轻甲 钝击×0.75 → floor(max(12-4,0)×0.75)=6
    // 用 BOSS 攻 hp 剩 5 的剑士——直接改 hp
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'player', { q: 11, r: 15 });
    defender.hp = 5;
    const r = resolveBattle(map, attacker, defender, getTemplate('boss')!.skills[0], () => 0);
    expect(r.defenderHp).toBe(0);
    expect(r.strikes.every(s => s.byAttacker)).toBe(true); // 无反击与追击
  });

  it('攻→反→守方追击的完整序列', () => {
    // 盗贼(spd12, atk6) 攻 BOSS(spd6, hp40)：盗贼打 BOSS 重甲 突刺×0.75→floor(max(6-11,0)×..)=0
    // 换：剑士(spd8) 攻 盗贼(spd12) → 守方快 4 → 守追击
    const attacker = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('thief', 'player', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, getTemplate('swordsman')!.skills[0], () => 0);
    // 序列：剑士攻 → 盗贼反 → 盗贼追击
    expect(r.strikes.map(s => s.byAttacker)).toEqual([true, false, false]);
  });

  it('攻方追击：攻1→反1→攻2', () => {
    // 盗贼(spd12) 攻 剑士(spd8)
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, getTemplate('thief')!.skills[0], () => 0);
    expect(r.strikes.map(s => s.byAttacker)).toEqual([true, false, true]);
  });

  it('攻方阵亡于反击则无追击', () => {
    // 牧师(hp20) 攻 BOSS：BOSS 反击 7×2 追击……直接构造：牧师 hp 剩 5
    const attacker = createUnitState('priest', 'player', { q: 10, r: 15 });
    attacker.hp = 5;
    const defender = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    // 牧师无攻击技能（治疗 range2），用火球手 mage？mage 技能 range2 —— 直接调函数
    const r = resolveBattle(map, attacker, defender, lordSkill, () => 0);
    // 牧师(无甲) atk8? priest atk4：max(4-11,0)=0 伤害 0 → 打不死 BOSS
    // BOSS 反击挥砍 vs 无甲×1.0 → max(12-3,0)=9 ≥5 → 牧师亡，无后续
    expect(r.attackerHp).toBe(0);
    expect(r.strikes.map(s => s.byAttacker)).toEqual([true, false]);
  });
});

describe('M4 战斗扩展：power 与护盾吸收', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('护盾吸收：伤害先扣护盾再扣 HP', () => {
    // 领主(轻甲)持秘银护盾(中甲, 吸收10)；剑士横斩 vs 中甲 挥砍×0.75 → max(5-6-0,0)=0…
    // 换 BOSS 重锤(atk12 钝击) 打持盾领主：钝击 vs 中甲 ×1.25 → max(12-6,0)×1.25=7.5→7
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 10
    }];
    const r = resolveBattle(map, attacker, defender, getTemplate('boss')!.skills[0], () => 0);
    // 伤害 7 全被护盾吸收
    expect(r.attackerHp).toBe(40);
    expect(r.defenderHp).toBe(26);
    const shield = defender.statuses.find(s => s.type === 'shield');
    expect(shield?.absorbLeft).toBe(3);
  });

  it('破盾：超出吸收的部分扣 HP 且状态移除', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.hp = 26;
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 3
    }];
    // BOSS 重锤 ×2 击（boss spd6 vs lord spd9 差 3 无追击；伤害 7×1=7 > 吸收 3 → 破盾 4 入 HP
    const r = resolveBattle(map, attacker, defender, getTemplate('boss')!.skills[0], () => 0);
    expect(defender.hp).toBe(26 - 4);
    expect(defender.statuses.some(s => s.type === 'shield')).toBe(false);
    expect(r.defenderHp).toBe(22);
  });

  it('护盾覆盖矩阵：按护盾护甲类型结算', () => {
    // 领主(轻甲)持中甲盾：法师火球(magic) vs 中甲 ×1.0（若无盾按轻甲也 ×1.0……
    // 用斧兵重劈(挥砍)：vs 中甲 ×0.75、vs 轻甲 ×1.25 —— 持盾应按中甲
    const attacker = createUnitState('axeman', 'player', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.faction = 'enemy';
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 99
    }];
    const f = calcBattleForecast(map, attacker, defender, getTemplate('axeman')!.skills[0]);
    // max(11-6,0)×0.75 = 3.75 → 3（若误按轻甲则为 floor(5×1.25)=6）
    expect(f.attacker.damage).toBe(3);
  });
});
