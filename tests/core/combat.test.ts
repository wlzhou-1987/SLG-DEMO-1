import { describe, it, expect, beforeEach } from 'vitest';
import { attackSide, calcBattleForecast, resolveBattle } from '../../src/core/combat';
import { createMapState } from '../../src/core/map';
import { getTemplate, getTemplateSkills, basicAttackSkill } from '../../src/config/units';
import { SKILLS } from '../../src/config/skills';
import { directionBetween } from '../../src/core/hex';
import { calcMovementRange } from '../../src/core/range';
import { isFlying } from '../../src/config/units';
import { DAMAGE_ARMOR_MATRIX } from '../../src/config/combat';
import { rangeBonus, effectiveRangeMax } from '../../src/core/combat';
import { SPELLS } from '../../src/config/spells';
import type { SkillTemplate } from '../../src/config/skills';
import { calcAoeForecast, resolveAoeBattle, calcStrike, calcEvade } from '../../src/core/combat';
import { COMBAT_PARAMS } from '../../src/config/combat';
import { resetUnitCounter, createUnitState } from '../../src/core/unit';
import { resolveSpell } from '../../src/core/spell';
import { TRAIT_CONFIGS } from '../../src/config/traits';

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
    // 领主横斩(挥砍)攻剑士(轻甲)：max(10−4−0,0)×1.25 = 7.5 → 7
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    expect(f.attacker.damage).toBe(10);
    expect(f.attacker.damageType).toBe('slashing');
  });

  it('伤害地板 0：攻低于防时为 0', () => {
    // 法师火球(atk8, magic)打防骑(重甲 def10)：max(8−10−0,0)=0 → 伤害 0
    const attacker = createUnitState('priest', 'player', { q: 10, r: 15 });
    const defender = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('priest')!));
    expect(f.attacker.damage).toBe(0);
  });

  it('地形防：守方站森林防 +1', () => {
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(forestMap, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    // max(10−4−1,0)×1.25 = 6.25 → 6
    expect(f.attacker.damage).toBe(9);
  });

  it('飞行守方不享地形防与回避加成', () => {
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('pegasus', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(forestMap, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    // 飞马 light pdef12：floor(21×1.0−12) = 9（若误吃森林+1 则为 8）
    expect(f.attacker.damage).toBe(9);
    // 回避 = 速21×3 + 运15×3 = 108（若误吃森林+20 则命中骤降 20）
    // 命中 = 50 + 19×5 − 108 = 37
    expect(f.attacker.hitRate).toBe(37);
  });

  it('命中公式与 clamp', () => {
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    // 命中 = 50 + 领主技19×5 − 剑士回避(速17×3+运8×3=75) = 145−75 = 70
    expect(f.attacker.hitRate).toBe(70);
  });

  it('背面攻击：命中 +25 伤害 +3', () => {
    // 守方朝东(0)，攻方在西(9,15) → 背面
    const attacker = createUnitState('lord', 'player', { q: 9, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    defender.facing = 0;
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    expect(f.attacker.side).toBe('back');
    expect(f.attacker.damage).toBe(10 + 3);
    expect(f.attacker.hitRate).toBe(70 + 25); // 95（未触 clamp）
  });

  it('超射程命中惩罚：每格 −15', () => {
    // 近战技能打距离 2（直接调用函数验证公式）
    const attacker = createUnitState('lord', 'player', { q: 9, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    // 距离 2 超出 rangeMax 1 → 70 − 15 = 55
    expect(f.attacker.hitRate).toBe(55);
  });

  it('守方可反击：近战互殴', () => {
    const { attacker, defender } = makeUnits();
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    expect(f.counter).not.toBeNull();
    // 剑士横斩(挥砍) vs 领主(轻甲)：max(5−6−0,0)×1.25 = 0
    expect(f.counter!.damage).toBe(0);
  });

  it('弓手被贴脸无反击（最小射程死角）', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('archer_enemy', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    expect(f.counter).toBeNull();
  });

  it('反击择优：覆盖射程的技能中期望伤害最高', () => {
    // 领主(轻甲)攻 BOSS：BOSS 技能序 [重锤(钝击), 横扫(挥砍)]
    // 钝击 vs 轻甲 ×0.75 → floor(4×0.75)=3；挥砍 vs 轻甲 ×1.25 → floor(4×1.25)=5
    // 择优应选横扫（虽排在技能列表第二位）
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, boss, basicAttackSkill(getTemplate('lord')!));
    expect(f.counter).not.toBeNull();
    expect(f.counter!.skillName).toBe('横扫');
    expect(f.counter!.damage).toBe(9);  // BOSS str24 横扫(斩) vs 轻甲：floor(24×1.0−15)=9
  });

  it('追击：速度差 ≥4 快方多打一次', () => {
    // 盗贼 spd12 vs 剑士 spd8 → 差 4 → 攻方 count 2
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('thief')!));
    expect(f.attacker.count).toBe(2);
    // 反向：剑士 spd8 攻盗贼 spd12 → 守方 count 2
    const f2 = calcBattleForecast(map, defender, attacker, basicAttackSkill(getTemplate('swordsman')!));
    expect(f2.counter!.count).toBe(2);
    expect(f2.attacker.count).toBe(1);
  });
});

describe('resolveBattle 战斗结算', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const lordSkill = basicAttackSkill(getTemplate('lord')!);

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
    const attacker = createUnitState('swordsman', 'enemy', { q: 10, r: 14 });
    const defender = createUnitState('priest', 'player', { q: 10, r: 15 }, { active: [], passive: ['steady'] });
    defender.facing = 0;
    const hpBefore = defender.hp;
    const r = resolveBattle(map, attacker, defender, basicAttackSkill(getTemplate('swordsman')!), () => 0.99);
    expect(r.strikes[0].hit).toBe(false);
    expect(defender.hp).toBe(hpBefore);
  });

  it('击杀目标则无反击', () => {
    // BOSS(atk10) 重锤打剑士(轻甲 钝击×0.75)：floor(max(10-4,0)×0.75)=4
    // 用 BOSS 攻 hp 剩 3 的剑士——直接改 hp
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'player', { q: 11, r: 15 });
    defender.hp = 3;
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    expect(r.defenderHp).toBe(0);
    expect(r.strikes.every(s => s.byAttacker)).toBe(true); // 无反击与追击
  });

  it('攻→反→守方追击的完整序列', () => {
    // 盗贼(spd12, atk6) 攻 BOSS(spd6, hp40)：盗贼打 BOSS 重甲 突刺×0.75→floor(max(6-11,0)×..)=0
    // 换：剑士(spd8) 攻 盗贼(spd12) → 守方快 4 → 守追击
    const attacker = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('thief', 'player', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, basicAttackSkill(getTemplate('swordsman')!), () => 0);
    // 序列：剑士攻 → 盗贼反 → 盗贼追击
    expect(r.strikes.map(s => s.byAttacker)).toEqual([true, false, false]);
  });

  it('攻方追击：攻1→反1→攻2', () => {
    // 盗贼(spd12) 攻 剑士(spd8)
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, basicAttackSkill(getTemplate('thief')!), () => 0);
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
    // BOSS 重锤(atk10 钝击) 打持盾领主：钝击 vs 中甲 ×1.25 → max(10-6,0)×1.25=5
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 10
    }];
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    // 伤害 9 全被护盾吸收；领主反击 BOSS(重甲 pdef12)：floor(21×0.7−12)=2，lord 快 5 追击 ×2 → 50−4
    expect(r.attackerHp).toBe(46);
    expect(r.defenderHp).toBe(52);
    const shieldLeft = defender.statuses.find(s2 => s2.type === 'shield');
    expect((shieldLeft as { absorbLeft: number } | undefined)?.absorbLeft).toBe(1);
  });

  it('破盾：超出吸收的部分扣 HP 且状态移除', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.hp = 52;
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 3
    }];
    // BOSS 重锤 ×1 击（boss spd12 vs lord spd17 差 5 反击追击；伤害 9 > 吸收 3 → 破盾 6 入 HP
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    expect(defender.hp).toBe(52 - 6);
    expect(defender.statuses.some(s2 => s2.type === 'shield')).toBe(false);
    expect(r.defenderHp).toBe(46);
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
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('axeman')!));
    // max(12-6,0)×0.75 = 4.5 → 4（若误按轻甲则为 floor(6×1.25)=7）
    expect(f.attacker.damage).toBe(11);
  });
});

describe('特性修正管线', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('背刺：盗贼背面攻击伤害 +3 改为 ×1.5 乘算', () => {
    // 盗贼 atk8 vs 剑士 def4 轻甲 突刺×1.0 → base 4
    // 普通背面 = 4+3 = 7；背刺 = floor(4×1.5) = 6
    const thief = createUnitState('thief', 'player', { q: 9, r: 15 });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    swordsman.facing = 0;  // 朝东，盗贼在西 → 背面
    const f = calcBattleForecast(map, thief, swordsman, basicAttackSkill(getTemplate('thief')!));
    expect(f.attacker.side).toBe('back');
    expect(f.attacker.damage).toBe(22);
    // 正面不受特性影响
    const thief2 = createUnitState('thief', 'player', { q: 10, r: 14 });
    const swordsman2 = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    swordsman2.facing = 2;  // 朝西北，盗贼在(10,14)西北方向 → 正面
    const f2 = calcBattleForecast(map, thief2, swordsman2, basicAttackSkill(getTemplate('thief')!));
    expect(f2.attacker.damage).toBe(9);
  });

  it('沉稳：牧师受到的部位命中补正减半', () => {
    // 剑士 tec16 攻牧师侧面：50+80−回避(速13×3+运13×3=78)+补正；沉稳补正 10→5
    // = 130−78+5 = 57（无特性应为 62）
    const attacker = createUnitState('swordsman', 'enemy', { q: 10, r: 14 });
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 }, { active: [], passive: ['steady'] });
    priest.facing = 0;  // 朝东，攻方在西北 → 侧面
    const f = calcBattleForecast(map, attacker, priest, basicAttackSkill(getTemplate('swordsman')!));
    expect(f.attacker.side).toBe('side');
    expect(f.attacker.hitRate).toBe(57);
  });

  it('无特性单位不受修正影响', () => {
    // 剑士(无特性)攻剑士背面：伤害 +3、命中 +25 正常生效
    const attacker = createUnitState('swordsman', 'player', { q: 9, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    defender.facing = 0;
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('swordsman')!));
    expect(f.attacker.damage).toBe(5);
  });
});

describe('M6-1 战斗反馈：打击结果上报吸收量', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('无盾打击 absorbed 为 0', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    expect(r.strikes[0].hit).toBe(true);
    expect(r.strikes[0].absorbed).toBe(0);
  });

  it('部分吸收：absorbed = 盾吸收量，实际扣血 = 伤害 - absorbed', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 3
    }];
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    expect(r.strikes[0].damage).toBe(9);
    expect(r.strikes[0].absorbed).toBe(3);
  });

  it('全吸收：absorbed = 伤害全额', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    defender.statuses = [{
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 99
    }];
    const r = resolveBattle(map, attacker, defender, getTemplateSkills(getTemplate('boss')!)[0], () => 0);
    expect(r.strikes[0].damage).toBe(9);
    expect(r.strikes[0].absorbed).toBe(9);
  });
});

describe('R3-2 普攻口径落地', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('普攻结算走护甲矩阵：BOSS 普攻(钝) vs 领主(轻甲 ×0.75)', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const defender = createUnitState('lord', 'player', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('boss')!));
    expect(f.attacker.damageType).toBe('blunt');
    // BOSS str24 钝 vs 轻甲 0.8：floor(24×0.8−15) = 4（R5-3 定稿值）
    expect(f.attacker.damage).toBe(4);
  });

  it('法杖普攻=低威力钝伤杖击（近战保底手段）', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 });
    const defender = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const b = basicAttackSkill(getTemplate('priest')!);
    expect(b.damageType).toBe('blunt');
    expect(b.rangeMax).toBe(1);
    // 牧师 atk4 vs 重甲 def4：base 0 → 保底非输出
    const f = calcBattleForecast(map, priest, defender, b);
    expect(f.attacker.damage).toBe(0);
  });
});

describe('R3-3 特性读取改自实例装填', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('卸下背刺被动后背面攻击无乘算', () => {
    const thiefNoTrait = createUnitState('thief', 'player', { q: 9, r: 15 }, {
      active: [], passive: []
    });
    const swordsman = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    swordsman.facing = 0;  // 朝东，盗贼在西 → 背面
    const f = calcBattleForecast(map, thiefNoTrait, swordsman, basicAttackSkill(getTemplate('thief')!));
    // base4 背面 +3 = 7（无背刺乘算；装填含 backstab 时为 6）
    expect(f.attacker.side).toBe('back');
    expect(f.attacker.damage).toBe(12);
  });
});

describe('R3-7 AoE 结算（独立命中/无反击/多段）', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const whirlwind = SKILLS.whirlwind;

  function makeScene() {
    const caster = createUnitState('axeman', 'player', { q: 10, r: 15 }, { active: ['whirlwind'], passive: [] });
    const foeA = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const foeB = createUnitState('spearman', 'enemy', { q: 10, r: 14 });
    return { caster, foeA, foeB };
  }

  it('calcAoeForecast：区域内每个敌人各自预报（含部位）', () => {
    const { caster, foeA, foeB } = makeScene();
    const forecasts = calcAoeForecast(map, caster, [foeA, foeB], whirlwind);
    expect(forecasts).toHaveLength(2);
    expect(forecasts[0].skillName).toBe('旋风斩');
    expect(['front', 'side', 'back']).toContain(forecasts[0].side);
  });

  it('resolveAoeBattle：逐单位独立命中（rng 一中一空）', () => {
    const { caster, foeA, foeB } = makeScene();
    const forestMap2 = createMapState({ forests: [{ q: 10, r: 14 }] });
    const seq = [0.0, 0.99];
    let i = 0;
    const r = resolveAoeBattle(forestMap2, caster, [foeA, foeB], whirlwind, () => seq[i++]);
    const byId = new Map(r.map(x => [x.targetId, x]));
    expect(byId.get(foeA.id)!.hit).toBe(true);
    expect(byId.get(foeB.id)!.hit).toBe(false);
    expect(foeA.hp).toBeLessThan(foeA.maxHp);
    expect(foeB.hp).toBe(foeB.maxHp);
  });

  it('AoE 不触发反击：结算后攻方 HP 不变', () => {
    const { caster, foeA, foeB } = makeScene();
    resolveAoeBattle(map, caster, [foeA, foeB], whirlwind, () => 0);
    expect(caster.hp).toBe(caster.maxHp);
  });

  it('多段伤害：附加段独立过矩阵求和（双伤害段结构）', () => {
    const { caster, foeA } = makeScene();
    const dual: SkillTemplate = {
      ...whirlwind,
      id: 'dual-test', name: '双段测试',
      segments: [{ damageType: 'blunt', power: 0 }]
    };
    const single = calcAoeForecast(map, caster, [foeA], whirlwind)[0].damage;
    const mainBlunt = calcAoeForecast(map, caster, [foeA], { ...whirlwind, damageType: 'blunt' })[0].damage;
    const dualForecast = calcAoeForecast(map, caster, [foeA], dual)[0].damage;
    expect(dualForecast).toBe(single + mainBlunt);
  });

  it('AoE 目标护盾吸收生效', () => {
    const { caster, foeA } = makeScene();
    foeA.statuses.push({
      type: 'shield', skillName: '秘银护盾', turnsLeft: 3, appliedAtTurn: 1,
      armorType: 'medium', absorbLeft: 99
    });
    const hpBefore = foeA.hp;
    resolveAoeBattle(map, caster, [foeA], whirlwind, () => 0);
    expect(foeA.hp).toBe(hpBefore); // 全额被盾吸收
  });
});

describe('R3-10 攻击修饰集', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('背刺（主动技能）：背面攻击无视一半防御', () => {
    const attacker = createUnitState('thief', 'player', { q: 9, r: 15 });
    const defender = createUnitState('defender', 'enemy', { q: 10, r: 15 });
    defender.facing = 0;
    const backstab = SKILLS['backstab-strike'];
    const plain = calcBattleForecast(map, attacker, defender, basicAttackSkill(getTemplate('thief')!));
    const stabbed = calcBattleForecast(map, attacker, defender, backstab);
    expect(plain.attacker.side).toBe('back');
    // thief atk8 vs def9：普攻 base=max(8-9,0)=0；背刺无视一半防 → max(8-4,0)=4 ×钝矩阵
    expect(stabbed.attacker.damage).toBeGreaterThan(plain.attacker.damage);
  });

  it('影袭：背面攻击威力提升（正面无加成）', () => {
    const bare = { active: [], passive: [] };
    const backAtt = createUnitState('thief', 'player', { q: 9, r: 15 }, bare);
    const frontAtt = createUnitState('thief', 'player', { q: 10, r: 16 }, bare);
    const defender = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    defender.facing = 0;
    const frontDefender = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    frontDefender.facing = directionBetween(frontDefender.position, frontAtt.position);
    const shadow = SKILLS['shadow-strike'];
    const plainBack = calcBattleForecast(map, backAtt, defender, basicAttackSkill(getTemplate('thief')!));
    const boostedBack = calcBattleForecast(map, backAtt, defender, shadow);
    expect(boostedBack.attacker.damage - plainBack.attacker.damage).toBe((Math.floor((17 + 4) * 1.2 - 11) + 3) - (Math.floor(17 * 1.2 - 11) + 3));
    const plainFront = calcBattleForecast(map, frontAtt, frontDefender, basicAttackSkill(getTemplate('thief')!));
    const boostedFront = calcBattleForecast(map, frontAtt, frontDefender, shadow);
    expect(boostedFront.attacker.damage).toBe(plainFront.attacker.damage);
  });

  it('刺击 counters：对重甲与骑兵模板特效克制（占位 tags）', () => {
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    const heavyFoe = createUnitState('axeman_enemy', 'enemy', { q: 11, r: 15 });  // 重甲
    const lightFoe = createUnitState('swordsman', 'enemy', { q: 10, r: 16 });     // 轻甲
    const stab = SKILLS.stab;
    const vsHeavy = calcBattleForecast(map, lord, heavyFoe, stab);
    const vsLight = calcBattleForecast(map, lord, lightFoe, stab);
    const baseHeavy = calcBattleForecast(map, lord, heavyFoe, { ...stab, counters: undefined });
    const baseLight = calcBattleForecast(map, lord, lightFoe, { ...stab, counters: undefined });
    expect(vsHeavy.attacker.damage).toBeGreaterThan(baseHeavy.attacker.damage);  // 重甲受特效
    expect(vsLight.attacker.damage).toBe(baseLight.attacker.damage);            // 轻甲无特效
  });

  it('冲锋被动：移动格数线性加攻击（普攻与技能均享受）', () => {
    const knight = createUnitState('knight', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 10, r: 16 });
    const still = calcBattleForecast(map, knight, foe, basicAttackSkill(getTemplate('knight')!));
    knight.moveSpent = 3;
    const moved = calcBattleForecast(map, knight, foe, basicAttackSkill(getTemplate('knight')!));
    expect(moved.attacker.damage).toBeGreaterThan(still.attacker.damage);
  });

  it('低血狂战：HP 越低攻击越高（线性）', () => {
    const axeman = createUnitState('axeman', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 10, r: 16 });
    const full = calcBattleForecast(map, axeman, foe, basicAttackSkill(getTemplate('axeman')!));
    axeman.hp = Math.floor(axeman.maxHp * 0.3);
    const low = calcBattleForecast(map, axeman, foe, basicAttackSkill(getTemplate('axeman')!));
    expect(low.attacker.damage).toBeGreaterThan(full.attacker.damage);
  });

  it('吸血（强化嗜血）：嗜血 buff 激活期间命中回血一半', () => {
    const axeman = createUnitState('axeman', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 10, r: 16 });
    axeman.hp = 5;
    axeman.statuses.push({
      type: 'buff', skillName: '嗜血', appliedAtTurn: 1, turnsLeft: 3,
      stat: 'str', amount: 3, decay: 0
    });
    const hpBefore = axeman.hp;
    resolveBattle(map, axeman, foe, basicAttackSkill(getTemplate('axeman')!), () => 0);
    expect(axeman.hp).toBeGreaterThan(hpBefore); // 吸血回血（不超上限）
  });

  it('强化旋风斩：AoE 附加第二段（威力减半）', () => {
    const axeman = createUnitState('axeman', 'player', { q: 10, r: 15 }, { active: ['whirlwind'], passive: [] });
    const foe = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const single = calcAoeForecast(map, axeman, [foe], SKILLS.whirlwind)[0].damage;
    const dual = calcAoeForecast(map, axeman, [foe], SKILLS.whirlwind)[0].damage;
    expect(dual).toBe(single); // 同单位同结果（强化经 attacker passive 生效，见下）
    const enhanced = createUnitState('axeman', 'player', { q: 10, r: 15 }, {
      active: ['whirlwind'], passive: ['berserk', 'vampiric', 'ww-enhance']
    });
    const enh = calcAoeForecast(map, enhanced, [foe], SKILLS.whirlwind)[0].damage;
    expect(enh).toBeGreaterThan(calcAoeForecast(map, axeman, [foe], SKILLS.whirlwind)[0].damage);
  });
});

describe('R4-2 统一伤害段结构与公式', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const mkSkill = (over: Partial<SkillTemplate>): SkillTemplate => ({
    id: 't', name: '测试技能', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: false, ...over
  });

  it('乘算在 max 内：低攻高防 × 高克制仍有伤害（旧公式为 0）', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });   // str21
    const defender = createUnitState('paladin', 'enemy', { q: 11, r: 15 }); // pdef26 heavy
    // 钝 vs 重甲 1.4 × 重甲特效 2 = 2.8：floor(21×2.8−26)=32；旧先减后乘 = max(21−26,0)×2.8 = 0
    const f = calcBattleForecast(map, attacker, defender, mkSkill({
      damageType: 'blunt', counters: { heavy: 2 }
    }));
    expect(f.attacker.damage).toBe(Math.floor(21 * 2.8 - 26));
  });

  it('三线之一：物理线扣 pdef、法术线扣 mdef（同一基数不同防御轴）', () => {
    const attacker = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] }); // mag24
    const defender = createUnitState('knight', 'enemy', { q: 11, r: 15 }); // pdef17 mdef13, 中甲
    const phys = calcBattleForecast(map, attacker, defender, mkSkill({ damageType: 'blunt' }));   // str14
    const magic = calcBattleForecast(map, attacker, defender, mkSkill({ damageType: 'magic' }));  // mag24
    expect(phys.attacker.damage).toBe(Math.max(Math.floor(14 * 1.0 - 17), 0));
    expect(magic.attacker.damage).toBe(Math.max(Math.floor(24 * 1.0 - 13), 0));
  });

  it('组合权重：{str:0.5, tec:0.5} = (力量+技)/2 作基数', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });   // str21 tec19 → 20
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 }); // pdef11 轻甲 斩×1.2
    const f = calcBattleForecast(map, attacker, defender, mkSkill({
      weights: { str: 0.5, tec: 0.5 }
    }));
    expect(f.attacker.damage).toBe(Math.floor((21 / 2 + 19 / 2) * 1.0 - 11));
  });

  it('缺省权重回落：物理技能=str×1、法术=mag×1', () => {
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });  // str17
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const phys = calcBattleForecast(map, attacker, defender, mkSkill({ damageType: 'piercing' })); // 突vs轻1.0
    expect(phys.attacker.damage).toBe(Math.max(Math.floor(17 * 1.2 - 11), 0));
  });

  it('固定值在乘区内：power 与基数一起乘克制矩阵', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 }); // 轻甲 斩1.2
    const f = calcBattleForecast(map, attacker, defender, mkSkill({ power: 5 }));
    expect(f.attacker.damage).toBe(Math.floor((21 + 5) * 1.0 - 11));
  });

  it('克制合成上限 ×3.0：多标签 counters 联乘超限截断', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('paladin', 'enemy', { q: 11, r: 15 }); // tags heavy+cavalry
    const f = calcBattleForecast(map, attacker, defender, mkSkill({
      damageType: 'piercing', counters: { heavy: 3, cavalry: 3 }  // 0.6×9=5.4 超 3.0 → 截 3.0
    }));
    expect(f.attacker.damage).toBe(Math.max(Math.floor(21 * 3.0 - 26), 0));
  });

  it('地形物理防：守方站森林 pdefense+1 进减法区（飞行不享）', () => {
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const defender = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(forestMap, attacker, defender, basicAttackSkill(getTemplate('lord')!));
    expect(f.attacker.damage).toBe(Math.floor(21 * 1.0 - 11 - 1));
    const flyer = createUnitState('pegasus', 'enemy', { q: 11, r: 15 }); // pdef12 轻甲
    const f2 = calcBattleForecast(forestMap, attacker, flyer, basicAttackSkill(getTemplate('lord')!));
    expect(f2.attacker.damage).toBe(Math.floor(21 * 1.0 - 12));
  });

  it('治疗统一段：mag×0.5 权重（牧师 mag21 → 10）', () => {
    expect(SPELLS.heal.weights).toEqual({ mag: 0.5 });
  });

  it('总封顶挂点：克制合成×背刺联乘超 4.0 截断', () => {
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 });   // 出厂 backstab
    const defender = createUnitState('paladin', 'enemy', { q: 11, r: 15 }); // heavy+cavalry, pdef26
    defender.facing = 0;  // 朝东，攻方在西(10,15) → 背面
    const f = calcBattleForecast(map, attacker, defender, mkSkill({
      damageType: 'blunt', counters: { heavy: 2, cavalry: 2 }
    }));
    expect(f.attacker.side).toBe('back');
    // 克制 1.4×4=5.6→cap3.0；背刺 1.5 → 4.5→总封 4.0；floor(17×4.0−26)=42
    expect(f.attacker.damage).toBe(Math.floor(17 * 4.0 - 26) + 3);
  });
});

describe('R4-3 物理矩阵梯度与法术级克制', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('12 格矩阵 = §4.2 定稿梯度（斩/突/钝 × 四护甲）', () => {
    expect(DAMAGE_ARMOR_MATRIX.slashing).toEqual({ none: 1.2, light: 1.0, medium: 1.0, heavy: 0.7 });
    expect(DAMAGE_ARMOR_MATRIX.piercing).toEqual({ none: 1.3, light: 1.2, medium: 0.8, heavy: 0.6 });
    expect(DAMAGE_ARMOR_MATRIX.blunt).toEqual({ none: 0.8, light: 0.8, medium: 1.0, heavy: 1.4 });
  });

  it('magic 行已移出矩阵（类型与运行时均无）', () => {
    expect('magic' in DAMAGE_ARMOR_MATRIX).toBe(false);
  });

  const mkSkill = (over: Partial<SkillTemplate>): SkillTemplate => ({
    id: 't', name: '测试技能', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: false, ...over
  });

  it('斩 vs 重甲 0.7 梯度进乘区（lord str21 vs boss pdef12 heavy）', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, boss, mkSkill({ damageType: 'slashing' }));
    expect(f.attacker.damage).toBe(Math.max(Math.floor(21 * 0.7 - 12), 0));
  });

  it('突 vs 轻甲 1.2（thief str17 vs swordsman pdef11）', () => {
    const attacker = createUnitState('thief', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, sw, mkSkill({ damageType: 'piercing' }));
    expect(f.attacker.damage).toBe(Math.floor(17 * 1.2 - 11));
  });

  it('钝 vs 重甲 1.4（boss str24 vs paladin pdef26 heavy）', () => {
    const attacker = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const paladin = createUnitState('paladin', 'enemy', { q: 11, r: 15 });
    paladin.faction = 'player' as never;
    const f = calcBattleForecast(map, attacker, paladin, mkSkill({ damageType: 'blunt' }));
    expect(f.attacker.damage).toBe(Math.max(Math.floor(24 * 1.4 - 26), 0));
  });

  it('法术默认不走矩阵：vs 重甲不再吃旧 magic 行 1.25（mage mag24 vs boss mdef8）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, mage, boss, mkSkill({ damageType: 'magic' }));
    expect(f.attacker.damage).toBe(Math.floor(24 * 1.0 - 8));  // 旧矩阵 magic.heavy=1.25 → 已移除
  });

  it('法术级对护甲克制 armorResist 进乘区（vs heavy 1.25 配置）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, mage, boss, mkSkill({
      damageType: 'magic', armorResist: { heavy: 1.25 }
    }));
    expect(f.attacker.damage).toBe(Math.floor(24 * 1.25 - 8));
  });

  it('armorResist 与 counters 联乘后仍受克制合成 cap 3.0 约束', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const boss = createUnitState('boss', 'enemy', { q: 11, r: 15 });  // heavy tag
    const f = calcBattleForecast(map, mage, boss, mkSkill({
      damageType: 'magic', armorResist: { heavy: 2 }, counters: { heavy: 2 }  // 4.0 → cap 3.0
    }));
    expect(f.attacker.damage).toBe(Math.floor(24 * 3.0 - 8));
  });

  it('法术 armorResist 对未声明护甲格取 1.0', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });  // light mdef5
    const f = calcBattleForecast(map, mage, sw, mkSkill({
      damageType: 'magic', armorResist: { heavy: 1.5 }  // light 未声明 → 1.0
    }));
    expect(f.attacker.damage).toBe(Math.floor(24 * 1.0 - 5));
  });
});

describe('R4-4 兵种标签与克制合成', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const mkSkill = (over: Partial<SkillTemplate>): SkillTemplate => ({
    id: 't', name: '测试技能', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: false, ...over
  });

  it('unitTags 落值：防骑=重甲+骑兵双标签、飞马=飞行、步兵显式', () => {
    const paladin = getTemplate('paladin')!;
    expect(paladin.unitTags).toEqual(['heavy', 'cavalry']);
    expect(getTemplate('pegasus')!.unitTags).toEqual(['flying']);
    expect(getTemplate('lord')!.unitTags).toEqual(['infantry']);
    expect(getTemplate('spearman')!.unitTags).toEqual(['infantry']);  // 枪兵保持步兵（§4.2 定稿）
    expect('flying' in paladin).toBe(false);  // 布尔已收编
  });

  it('isFlying 判定：飞马 true、领主 false（飞行移动消费点入口）', () => {
    expect(isFlying(getTemplate('pegasus')!)).toBe(true);
    expect(isFlying(getTemplate('lord')!)).toBe(false);
  });

  it('多标签克制：防骑（重甲+骑兵）吃两个 counters 联乘', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const paladin = createUnitState('paladin', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, attacker, paladin, mkSkill({
      damageType: 'blunt', counters: { heavy: 1.2, cavalry: 1.5 }
    }));
    expect(f.attacker.damage).toBe(Math.floor(21 * (1.4 * 1.8) - 26));  // 钝重1.4 × 2标签1.8
  });

  it('counters 缺省 1 与 <1（反克制：对步兵 0.8 减伤）', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });  // infantry, pdef11
    const f = calcBattleForecast(map, attacker, sw, mkSkill({
      counters: { infantry: 0.8 }
    }));
    expect(f.attacker.damage).toBe(Math.floor(21 * 1.0 * 0.8 - 11));
  });

  it('克制只进伤害不进命中：counters 高低不改变 hitRate', () => {
    const attacker = createUnitState('lord', 'player', { q: 10, r: 15 });
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const plain = calcBattleForecast(map, attacker, sw, mkSkill({}));
    const boosted = calcBattleForecast(map, attacker, sw, mkSkill({ counters: { infantry: 3 } }));
    expect(boosted.attacker.hitRate).toBe(plain.attacker.hitRate);
  });

  it('狙击对飞行 ×1.5：弓手 snipe 打飞马（轻甲 pdef12，突轻 1.2×1.5）', () => {
    const archer = createUnitState('archer', 'player', { q: 10, r: 15 });
    const pegasus = createUnitState('pegasus', 'enemy', { q: 11, r: 15 });
    const f = calcBattleForecast(map, archer, pegasus, SKILLS.snipe);
    expect(f.attacker.damage).toBe(Math.floor(19 * 1.2 * 1.5 - 12));
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    const f2 = calcBattleForecast(map, archer, sw, SKILLS.snipe);
    expect(f2.attacker.damage).toBe(Math.floor(19 * 1.2 - 11));  // 步兵无特效
  });

  it('飞行移动回归：飞马 unitTags 飞行 → 地形消耗 1 可越山', () => {
    const flyMap = createMapState({ mountains: [{ q: 11, r: 15 }] });
    const pegasus = createUnitState('pegasus', 'player', { q: 10, r: 15 });
    const range = calcMovementRange(flyMap, [pegasus], pegasus.position, 5, isFlying(getTemplate('pegasus')!));
    expect(range.has('11,15')).toBe(true);  // 穿山落到山后
    const lord = createUnitState('lord', 'player', { q: 10, r: 15 });
    const range2 = calcMovementRange(flyMap, [lord], lord.position, 5, isFlying(getTemplate('lord')!));
    expect(range2.has('11,15')).toBe(false);  // 地面被山挡
  });
});

describe('R4-5 射程条件加成与递增距离惩罚', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('递增序列：超程 1 格 −15、2 格 −40、3 格 −75（15+10×(n−1) 累计）', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 }, { active: [], passive: ['steady'] });
    const b = basicAttackSkill(getTemplate('swordsman')!);
    const at = (q: number) => {
      const a = createUnitState('swordsman', 'enemy', { q, r: 15 }, { active: [], passive: ['steady'] });
      return calcBattleForecast(map, a, priest, b).attacker.rangePenalty ?? 0;
    };
    expect(at(11)).toBe(0);
    expect(at(12)).toBe(15);
    expect(at(13)).toBe(40);
    expect(at(14)).toBe(75);
  });

  it('弓力量阈值两态：弓箭 str19 ≥ 19 射程 +1；敌弓 str13 无加成', () => {
    const archer = getTemplate('archer')!;
    const archerEnemy = getTemplate('archer_enemy')!;
    expect(rangeBonus(archer, SKILLS.snipe)).toBe(1);
    expect(rangeBonus(archerEnemy, SKILLS.snipe)).toBe(0);
  });

  it('法术魔力阈值两态：法师 mag24 ≥ 20 射程 +1；敌方法师 mag19 无', () => {
    expect(rangeBonus(getTemplate('mage')!, SPELLS.fireball)).toBe(1);
    expect(rangeBonus(getTemplate('mage_enemy')!, SPELLS.fireball)).toBe(0);
  });

  it('非弓物理与普攻近战无加成', () => {
    expect(rangeBonus(getTemplate('lord')!, SKILLS.stab)).toBe(0);
    expect(rangeBonus(getTemplate('knight')!, basicAttackSkill(getTemplate('knight')!))).toBe(0);
  });

  it('弓手普攻（武器数据）享受力量加成', () => {
    expect(rangeBonus(getTemplate('archer')!, basicAttackSkill(getTemplate('archer')!))).toBe(1);
  });

  it('effectiveRangeMax = 基础 + 加成（弓箭狙击 2+1=3）', () => {
    expect(effectiveRangeMax(getTemplate('archer')!, SKILLS.snipe)).toBe(3);
    expect(effectiveRangeMax(getTemplate('lord')!, basicAttackSkill(getTemplate('lord')!))).toBe(1);
  });

  it('延伸格吃惩罚：弓箭 effective 3 格打 dist 3，惩罚按基础 rangeMax 2 计算 = −15', () => {
    const archer = createUnitState('archer', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 10, r: 18 });  // dist 3
    const f = calcBattleForecast(map, archer, foe, SKILLS.snipe);
    expect(f.attacker.rangePenalty).toBe(15);  // 基础 2，超 1 格
  });

  it('法术距离惩罚同款递增（法师打 dist 4：基础 2 超 2 格 = −40）', () => {
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 });
    const foe = createUnitState('swordsman', 'enemy', { q: 10, r: 19 });  // dist 4
    const f = calcBattleForecast(map, mage, foe, SPELLS.fireball);
    expect(f.attacker.rangePenalty).toBe(40);
  });
});

describe('R4-6 双轴命中回避', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();
  const mkSkill = (over: Partial<SkillTemplate>): SkillTemplate => ({
    id: 't', name: '测试技能', target: 'enemy', damageType: 'slashing',
    rangeMin: 1, rangeMax: 1, learnable: false, ...over
  });

  it('回避公式：速×速系数 + 运×运系数 + 地形闪避（线性合成）', () => {
    const thiefT = getTemplate('thief')!;  // spd24 lck16
    const thief = createUnitState('thief', 'enemy', { q: 11, r: 15 });
    expect(calcEvade(thief, thiefT, 'phys', 20, { spd: 2, lck: 3 })).toBe(24 * 2 + 16 * 3 + 20);
    expect(calcEvade(thief, thiefT, 'phys', 0, { spd: 2, lck: 3 })).toBe(24 * 2 + 16 * 3);
  });

  it('四系数独立可配：物理/法术 × 速/运 各自单独驱动结果', () => {
    expect(COMBAT_PARAMS.evadeCoeffs).toEqual({  // R4-8 定稿：两轴同值，速 3 / 运 3（§4.3）
      phys: { spd: 3, lck: 3 }, mag: { spd: 3, lck: 3 }
    });
    const thiefT = getTemplate('thief')!;
    const thief = createUnitState('thief', 'enemy', { q: 11, r: 15 });
    expect(calcEvade(thief, thiefT, 'phys', 0, { spd: 1, lck: 0 })).toBe(24);  // 物理速系数
    expect(calcEvade(thief, thiefT, 'phys', 0, { spd: 0, lck: 1 })).toBe(16);  // 物理运系数
    expect(calcEvade(thief, thiefT, 'mag', 0, { spd: 1, lck: 0 })).toBe(24);   // 法术速系数
    expect(calcEvade(thief, thiefT, 'mag', 0, { spd: 0, lck: 5 })).toBe(80);   // 法术运系数独立取值
  });

  it('两轴独立端到端：改 mag 轴系数只影响法术命中、物理命中不变', () => {
    const mageT = getTemplate('mage')!;        // tec17 → 命中基数 135
    const thiefT = getTemplate('thief')!;      // 回避 = 24×3+16×3 = 120
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const thief = createUnitState('thief', 'enemy', { q: 11, r: 15 });
    expect(calcStrike(map, mage, mageT, thief, thiefT, mkSkill({ damageType: 'blunt' })).hitRate).toBe(15);
    expect(calcStrike(map, mage, mageT, thief, thiefT, mkSkill({ damageType: 'magic' })).hitRate).toBe(15);
    const ec = (COMBAT_PARAMS as { evadeCoeffs: { phys: { spd: number; lck: number }; mag: { spd: number; lck: number } } }).evadeCoeffs;
    const saved = ec.mag;
    ec.mag = { spd: 0, lck: 6 };  // 法术轴运系数 3→6
    try {
      expect(calcStrike(map, mage, mageT, thief, thiefT, mkSkill({ damageType: 'blunt' })).hitRate).toBe(15);  // 物理轴不受影响
      expect(calcStrike(map, mage, mageT, thief, thiefT, mkSkill({ damageType: 'magic' })).hitRate).toBe(39);  // 回避 16×6=96 → 39
    } finally {
      ec.mag = saved;
    }
  });

  it('定稿锚：速系数 3 / 运系数 3，回避 = (速+运)×3（可触发命中下限 5）', () => {
    const thiefT = getTemplate('thief')!;
    const thief = createUnitState('thief', 'enemy', { q: 11, r: 15 });
    expect(calcEvade(thief, thiefT, 'phys', 0)).toBe(24 * 3 + 16 * 3);  // 120
    const archerT = getTemplate('archer_enemy')!;  // tec15 → 125
    const archer = createUnitState('archer_enemy', 'player', { q: 10, r: 15 });
    const f = calcStrike(map, archer, archerT, thief, thiefT, mkSkill({ damageType: 'piercing' }));
    expect(f.hitRate).toBe(5);  // 125−120 触发 clamp 下限
  });

  it('修正管线改写（运轴）：运 buff 入 statValue → 回避上升命中下降', () => {
    const archerT = getTemplate('archer_enemy')!;  // tec15 → 125
    const swT = getTemplate('swordsman')!;         // spd17 lck8 → 回避 75
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const make = () => {
      const archer = createUnitState('archer_enemy', 'player', { q: 10, r: 15 });
      const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
      return { archer, sw };
    };
    const a = make();
    expect(calcStrike(forestMap, a.archer, archerT, a.sw, swT, mkSkill({ damageType: 'piercing' })).hitRate)
      .toBe(125 - (17 * 3 + 8 * 3 + 20));  // 森林：回避 75+20 = 95 → 30
    const b = make();
    b.sw.statuses.push({
      type: 'buff', skillName: '幸运祝福', appliedAtTurn: 1, turnsLeft: 3,
      stat: 'lck', amount: 4, decay: 0
    });
    expect(calcStrike(forestMap, b.archer, archerT, b.sw, swT, mkSkill({ damageType: 'piercing' })).hitRate)
      .toBe(125 - (17 * 3 + 12 * 3 + 20));  // 运 +4 → 回避 107 → 18
  });

  it('修正管线改写（速轴）：速 buff 经 statValue 进回避', () => {
    const thiefT = getTemplate('thief')!;
    const thief = createUnitState('thief', 'enemy', { q: 11, r: 15 });
    expect(calcEvade(thief, thiefT, 'mag', 0, { spd: 1, lck: 0 })).toBe(24);
    thief.statuses.push({
      type: 'buff', skillName: '风行', appliedAtTurn: 1, turnsLeft: 3,
      stat: 'spd', amount: 6, decay: 0
    });
    expect(calcEvade(thief, thiefT, 'mag', 0, { spd: 1, lck: 0 })).toBe(30);
  });

  it('两轴共用现地形闪避字段（R6 前）：法术线同吃森林 +20，飞行守方两轴均不享', () => {
    const mageT = getTemplate('mage')!;  // tec17 → 135
    const mage = createUnitState('mage', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const forestMap = createMapState({ forests: [{ q: 11, r: 15 }] });
    const swT = getTemplate('swordsman')!;  // 回避 75
    const sw = createUnitState('swordsman', 'enemy', { q: 11, r: 15 });
    expect(calcStrike(forestMap, mage, mageT, sw, swT, mkSkill({ damageType: 'blunt' })).hitRate).toBe(135 - 95);
    expect(calcStrike(forestMap, mage, mageT, sw, swT, mkSkill({ damageType: 'magic' })).hitRate).toBe(135 - 95);
    const pegasusT = getTemplate('pegasus')!;  // 飞行：回避 21×3+15×3 = 108，不享森林
    const pegasus = createUnitState('pegasus', 'enemy', { q: 11, r: 15 });
    expect(calcStrike(forestMap, mage, mageT, pegasus, pegasusT, mkSkill({ damageType: 'blunt' })).hitRate).toBe(135 - 108);
    expect(calcStrike(forestMap, mage, mageT, pegasus, pegasusT, mkSkill({ damageType: 'magic' })).hitRate).toBe(135 - 108);
  });

  it('增益必中回归：治疗法术不掷命中（rng 必失败仍全额治疗）', () => {
    const priest = createUnitState('priest', 'player', { q: 10, r: 15 }, { active: [], passive: [] });
    const lord = createUnitState('lord', 'player', { q: 11, r: 15 });
    lord.hp = 30;
    const r = resolveSpell(map, priest, lord, SPELLS.heal, () => 0.99);
    expect(r.kind).toBe('heal');
    expect(r.hit).toBeUndefined();
    expect(lord.hp).toBe(40);  // mag21×0.5=10
  });
});

describe('R4-7 先攻反击', () => {
  beforeEach(() => {
    resetUnitCounter();
  });

  const map = createMapState();

  it('阈值边界两态：守速差 12 触发先攻（反击先行）、差 7 不触发（正常序）', () => {
    // boss spd12 攻 thief spd24：diff 12 ≥ 阈值 10
    const boss = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const thief = createUnitState('thief', 'player', { q: 11, r: 15 });
    const f = calcBattleForecast(map, boss, thief, basicAttackSkill(getTemplate('boss')!));
    expect(f.counter).not.toBeNull();
    expect(f.firstStrike).toBe(true);
    const r = resolveBattle(map, boss, thief, basicAttackSkill(getTemplate('boss')!), () => 0);
    expect(r.strikes[0].byAttacker).toBe(false);  // 先攻反击先结算
    // swordsman spd17 攻 thief spd24：diff 7 < 10
    const sw = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
    const thief2 = createUnitState('thief', 'player', { q: 11, r: 15 });
    const f2 = calcBattleForecast(map, sw, thief2, basicAttackSkill(getTemplate('swordsman')!));
    expect(f2.firstStrike).toBe(false);
    const r2 = resolveBattle(map, sw, thief2, basicAttackSkill(getTemplate('swordsman')!), () => 0);
    expect(r2.strikes[0].byAttacker).toBe(true);  // 攻方先结算
  });

  it('结算顺序：先攻反击 → 攻方攻击 → 守方追击（先攻不重复反击）', () => {
    // thief 反击 boss（重甲 pdef12）0 伤、boss 攻击 thief 9 伤；thief 快 12 → 守方追击
    const boss = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const thief = createUnitState('thief', 'player', { q: 11, r: 15 });
    const r = resolveBattle(map, boss, thief, basicAttackSkill(getTemplate('boss')!), () => 0);
    expect(r.strikes.map(s => s.byAttacker)).toEqual([false, true, false]);
    expect(r.attackerHp).toBe(50);        // thief 突 vs 重甲两击均 0 伤
    expect(r.defenderHp).toBe(46 - 9);    // boss 钝 vs 无甲 floor(24×0.8−10)=9
  });

  it('先攻截断：先攻反击击杀攻方则其攻击不发生', () => {
    const mageE = createUnitState('mage_enemy', 'enemy', { q: 10, r: 15 });  // spd12
    mageE.hp = 10;
    const thief = createUnitState('thief', 'player', { q: 11, r: 15 });     // spd24，反击 15 伤
    const r = resolveBattle(map, mageE, thief, basicAttackSkill(getTemplate('mage_enemy')!), () => 0);
    expect(r.strikes.map(s => s.byAttacker)).toEqual([false]);  // 仅先攻反击
    expect(r.attackerHp).toBe(0);
    expect(r.defenderHp).toBe(46);  // 攻方攻击未发生
  });

  it('技能降阈值：守方特性声明阈值 5 时 diff 7 触发（默认 10 不触发）', () => {
    const swT = getTemplate('swordsman')!;
    TRAIT_CONFIGS['test-first-strike'] = {
      id: 'test-first-strike', name: '迅捷反击', desc: '测试用', learnable: false,
      firstStrikeThreshold: 5
    };
    try {
      const sw = createUnitState('swordsman', 'enemy', { q: 10, r: 15 });
      const withTrait = createUnitState('thief', 'player', { q: 11, r: 15 }, { active: [], passive: ['test-first-strike'] });
      expect(calcBattleForecast(map, sw, withTrait, basicAttackSkill(swT)).firstStrike).toBe(true);   // 7 ≥ 5
      const without = createUnitState('thief', 'player', { q: 11, r: 15 }, { active: [], passive: [] });
      expect(calcBattleForecast(map, sw, without, basicAttackSkill(swT)).firstStrike).toBe(false);  // 7 < 10
    } finally {
      delete TRAIT_CONFIGS['test-first-strike'];
    }
  });

  it('无反击则无先攻：反击射程够不着或 noCounter 时不触发', () => {
    const bossT = getTemplate('boss')!;
    const boss = createUnitState('boss', 'enemy', { q: 10, r: 15 });
    const farThief = createUnitState('thief', 'player', { q: 12, r: 15 });  // dist 2，thief 普攻射程 1
    const f = calcBattleForecast(map, boss, farThief, basicAttackSkill(bossT));
    expect(f.counter).toBeNull();
    expect(f.firstStrike).toBe(false);
    const nearThief = createUnitState('thief', 'player', { q: 11, r: 15 });
    const f2 = calcBattleForecast(map, boss, nearThief, basicAttackSkill(bossT), { noCounter: true });
    expect(f2.counter).toBeNull();
    expect(f2.firstStrike).toBe(false);
  });
});
