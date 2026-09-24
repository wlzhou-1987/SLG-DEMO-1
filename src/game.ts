import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState, getUnitAt, getUnitActiveSkills, hasUnitTrait } from './core/unit';
import { axialToPixel, pixelToAxial, isValidHex, distance, hexKey, directionBetween, neighbor } from './core/hex';
import type { HexCoord, Facing } from './core/types';
import { calcMovementRange, calcAttackRange, calcMovementCosts, rebuildPath } from './core/range';
import { calcBattleForecast, resolveBattle, calcAoeForecast, resolveAoeBattle, effectiveRangeMax } from './core/combat';
import type { BattleForecast, StrikeResult } from './core/combat';
import { calcSpellForecast, resolveSpell, resolveAoeSpell } from './core/spell';
import type { SpellForecast, SpellResult } from './core/spell';
import { getAreaCells, unitsInArea } from './core/area';
import { cancelStealth, isStealthed } from './core/stealth';
import { executeBehavior, applyAmbushBonus, rushDestination, resolveChargeStrike } from './core/effects';
import { refreshAuras } from './core/status';
import type { SkillTemplate } from './config/skills';
import { getTemplate, isFlying } from './config/units';
import { basicAttackSkills } from './config/weapons';
import { isSpell } from './config/spells';
import type { SpellTemplate } from './config/spells';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS, DEPLOY_ZONE } from './config/map';
import { validateDeployment } from './core/deployment';
import type { RosterEntry } from './core/deployment';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE, FACTION_COLORS } from './render/hex-renderer';
import { EffectSystem, FLOAT_COLOR } from './render/effects';
import { Animator, LUNGE_MS, FLASH_MS, STRIKE_GAP_MS } from './render/animator';
import { InputHandler } from './render/input';
import { updateTopbar } from './ui/topbar';
import { showUnitInfo, clearUnitInfo, showTerrainInfo, clearTerrainInfo } from './ui/sidepanel';
import { showActionMenu, hideActionMenu } from './ui/action-menu';
import { showForecastPanel, hideForecastPanel, showSpellForecastPanel, showAoeForecastPanel } from './ui/forecast';
import { showGameOverOverlay } from './ui/gameover';
import { getTerrain } from './core/map';
import { checkVictory, startPlayerPhase, applyTerrainRegen } from './core/turn';
import type { VictoryState } from './core/turn';
import { decideEnemyAction, checkGroupActivation, provokeGroup } from './core/ai';
import { checkReinforcements } from './core/reinforce';
import { interruptChant, tickStatuses } from './core/status';
import { canAfford, payCost, tickResources } from './core/resources';
import { showNotice } from './ui/notice';
import { logBattle } from './ui/battle-log';

type Phase =
  | { mode: 'idle' }
  | { mode: 'unitSelected'; unit: UnitState; moveRange: Set<string>; attackRange: Set<string>; moveCosts: Map<string, number> }
  | { mode: 'actionMenu'; unit: UnitState; originPos: HexCoord }
  | { mode: 'targetSelect'; unit: UnitState; skill: SkillTemplate; originPos: HexCoord; targets: Set<string> }
  | { mode: 'forecast'; unit: UnitState; target: UnitState; skill: SkillTemplate; forecast: BattleForecast }
  | { mode: 'aoeForecast'; unit: UnitState; skill: SkillTemplate; originPos: HexCoord; targets: UnitState[] }
  | { mode: 'spellForecast'; unit: UnitState; target: UnitState; spell: SpellTemplate; forecast: SpellForecast }
  | { mode: 'reMove'; unit: UnitState; moveRange: Set<string>; defaultFacing: number }
  | { mode: 'facingConfirm'; unit: UnitState }
  | { mode: 'enemyTurn' }
  | { mode: 'gameOver' };

const ENEMY_ACTION_DELAY_MS = 300;
const RESOURCE_SHORT: Record<string, string> = { rage: '怒', focus: '专', mp: 'MP' };  // R5-1 菜单消耗标签

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private renderer: HexRenderer;
  private effects = new EffectSystem();
  private animator = new Animator();
  private animating = false;
  private busy = false;  // 动画播放中，画布点击忽略
  private phase: Phase = { mode: 'idle' };
  private lastHoverKey = '';
  private victory: VictoryState = 'ongoing';
  private reinforcementFired = new Map<string, number>();
  turn = 1;
  phaseLabel = '玩家';
  map: MapState;
  units: UnitState[];

  constructor(canvas: HTMLCanvasElement, roster?: RosterEntry[]) {
    if (roster !== undefined) {
      const check = validateDeployment(roster, DEPLOY_ZONE);
      if (!check.ok) throw new Error(`非法编成：${check.errors.join('；')}`);
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new HexRenderer(this.ctx);

    this.map = createMapState(MAP_OVERRIDES);
    const playerRoster: RosterEntry[] = roster ?? PLAYER_UNITS;
    this.units = [
      ...playerRoster.map(p => createUnitState(p.templateId, 'player', p.position, p.loadout, p.equipment)),
      ...ENEMY_GROUPS.flatMap(g =>
        g.units.map(p => {
          const u = createUnitState(p.templateId, p.faction, p.position, p.loadout, p.equipment);
          u.groupId = g.id;
          u.aiKind = g.aiType;
          u.activated = g.aiType !== 'dormant';
          return u;
        })
      )
    ];

    new InputHandler(canvas, {
      onClick: (sx, sy) => { this.handleClick(sx, sy); this.render(); },
      onDrag: (dx, dy) => { this.camera.pan(dx, dy); this.render(); },
      onWheel: (sx, sy, deltaY) => {
        this.camera.setZoomTarget(sx, sy, Math.pow(1.1, -deltaY / 100));
        this.kickAnimLoop();
      },
      onDblClick: (sx, sy) => { this.handleDblClick(sx, sy); this.render(); },
      onHover: (sx, sy) => this.handleHover(sx, sy)
    });

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      // R14：构造时画布 0 尺寸（布局未 settled）会静默跳过初始居中——首次有效 resize 补做
      if (!this.cameraCentered) this.centerOnSpawn();
      this.render();
    });
    this.centerOnSpawn();
    // R14：布局稳定后不一定有 resize 事件——首帧 rAF 再试一次（已居中则跳过）
    requestAnimationFrame(() => {
      this.resizeCanvas();
      if (!this.cameraCentered) this.centerOnSpawn();
      this.render();
    });

    this.updateTopbar();
    clearUnitInfo();
    this.render();
  }

  private handleHover(screenX: number, screenY: number) {
    if (screenX < 0 || screenY < 0 || screenX >= this.canvas.width || screenY >= this.canvas.height) {
      if (this.lastHoverKey !== '') {
        this.lastHoverKey = '';
        clearTerrainInfo();
      }
      return;
    }
    const hex = this.screenToHex(screenX, screenY);
    const key = hex ? hexKey(hex) : '';
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;

    const terrain = hex ? getTerrain(this.map, hex) : undefined;
    if (terrain !== undefined) {
      showTerrainInfo(terrain);
    } else {
      clearTerrainInfo();
    }
  }

  private handleClick(screenX: number, screenY: number) {
    const hex = this.screenToHex(screenX, screenY);
    if (this.phase.mode === 'enemyTurn' || this.phase.mode === 'gameOver' || this.busy) return;
    if (!hex) { this.cancelToIdle(); return; }
    const unit = getUnitAt(this.units, hex);
    const key = hexKey(hex);

    switch (this.phase.mode) {
      case 'idle': {
        if (unit && unit.faction === 'player' && !unit.hasActed) {
          this.selectUnit(unit);
        } else if (unit) {
          this.phase = { mode: 'idle' };
          showUnitInfo(unit);
        } else {
          this.phase = { mode: 'idle' };
          clearUnitInfo();
        }
        break;
      }
      case 'unitSelected': {
        if (unit && unit !== this.phase.unit && unit.faction === 'player' && !unit.hasActed) {
          this.selectUnit(unit);  // 切换选中
        } else if (this.phase.moveRange.has(key) || unit === this.phase.unit) {
          // 移动（含原地待命）；记录出发点供撤销；主动移动打断咏唱（§4.12）
          const mover = this.phase.unit;
          interruptChant(mover);
          // R3-8：移动取消潜行（强化潜行=移动不破隐豁免）；原地待命不取消
          if (mover.position.q !== hex.q || mover.position.r !== hex.r) {
            if (isStealthed(mover) && !hasUnitTrait(mover, 'stealth-move')) cancelStealth(mover);
            if (mover.statuses.some(s => s.type === 'stance')) {
              mover.statuses = mover.statuses.filter(s => s.type !== 'stance');
              logBattle(`${this.unitName(mover)} 移动，防御姿态取消`);
            }
          }
          const origin = mover.position;
          mover.moveSpent = this.phase.moveCosts.get(key) ?? 0;  // §4.8 剩余移动力
          mover.position = { ...hex };
          this.busy = true;
          void this.playMove(mover, origin, hex).then(() => {
            this.busy = false;
            this.openActionMenu(mover, origin);
          });
        } else {
          this.cancelToIdle();
        }
        break;
      }
      case 'actionMenu': {
        // 画布点击 = 取消菜单并撤销移动
        this.undoMove(this.phase);
        break;
      }
      case 'targetSelect': {
        if (unit && this.phase.targets.has(key)) {
          const skill = this.phase.skill;
          if (skill.chargeTurns) {
            this.beginCharge(this.phase.unit, unit, skill);
          } else if (isSpell(skill)) {
            this.enterSpellForecast(this.phase.unit, unit, skill, this.phase.originPos);
          } else {
            this.enterForecast(this.phase.unit, unit, skill, this.phase.originPos);
          }
        } else {
          // 点空/非目标 = 返回行动菜单
          this.openActionMenu(this.phase.unit, this.phase.originPos);
        }
        break;
      }
      case 'forecast':
      case 'spellForecast': {
        break;  // 预报面板按钮驱动，画布点击忽略
      }
      case 'reMove': {
        if (this.phase.moveRange.has(key)) {
          const dest = hex;
          const mover = this.phase.unit;
          const from = mover.position;
          const facing = directionBetween(from, dest);
          mover.position = { ...dest };
          this.busy = true;
          void this.playMove(mover, from, dest).then(() => {
            this.busy = false;
            this.enterFacingConfirm(mover, facing);
          });
        } else {
          this.enterFacingConfirm(this.phase.unit, this.phase.defaultFacing);
        }
        break;
      }
      case 'facingConfirm': {
        // 点相邻格调整朝向
        for (let dir = 0; dir < 6; dir++) {
          const n = neighbor(this.phase.unit.position, dir as Facing);
          if (n.q === hex.q && n.r === hex.r) {
            this.phase.unit.facing = dir;
            break;
          }
        }
        break;
      }
    }
  }

  private selectUnit(unit: UnitState) {
    const template = getTemplate(unit.templateId);
    if (!template) return;

    const moveCosts = calcMovementCosts(
      this.map, this.units, unit.position, template.movePoints, isFlying(template)
    );
    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, template.movePoints, isFlying(template)
    );
    const resolvedSkills = [...basicAttackSkills(unit.equipment), ...getUnitActiveSkills(unit)];
    const rangeMin = Math.min(...resolvedSkills.map(s => s.rangeMin));
    // 口径同 ai.ts 警戒范围：属性/特性射程计入叠层，地形加成不读（本期 4 地形 rangeBonus 均 0）
    const rangeMax = Math.max(...resolvedSkills.map(s => effectiveRangeMax(template, s, undefined, unit.loadout.passive)));
    const attackRange = calcAttackRange(moveRange, rangeMin, rangeMax);

    this.phase = { mode: 'unitSelected', unit, moveRange, attackRange, moveCosts };
    showUnitInfo(unit);
  }

  private openActionMenu(unit: UnitState, originPos: HexCoord) {
    hideActionMenu();
    this.phase = { mode: 'actionMenu', unit, originPos };
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);

    const resolved = getUnitActiveSkills(unit);
    // R3-2：普攻恒为攻击选项（不占技能位，§4.9）；R2-2：按供普攻段装备条目展开（§4.14）
    const attackSkills = [...basicAttackSkills(unit.equipment), ...resolved.filter(s => !isSpell(s))];
    const spellSkills = resolved.filter(isSpell);
    const items: Array<{ label: string; value: string; kind?: 'normal' | 'cancel' }> = [];
    items.push({ label: '攻击', value: 'attack' });
    if (spellSkills.length > 0) items.push({ label: '法术', value: 'spell' });
    items.push({ label: '待机', value: 'wait' }, { label: '取消', value: 'cancel', kind: 'cancel' });

    showActionMenu(screen.x, screen.y, items, value => {
      this.onMenuPick(value, unit, originPos, attackSkills, spellSkills);
      this.render();
    });
  }

  private onMenuPick(
    value: string,
    unit: UnitState,
    originPos: HexCoord,
    attackSkills: SkillTemplate[],
    spellSkills: SkillTemplate[]
  ) {
    switch (value) {
      case 'attack':
        this.showSkillList(unit, originPos, '攻击', attackSkills);
        break;
      case 'spell':
        this.showSkillList(unit, originPos, '法术', spellSkills);
        break;
      case 'wait': {
        // 默认朝向 = 最后一次移动方向（原地则保持）
        const moved = originPos.q !== unit.position.q || originPos.r !== unit.position.r;
        const facing = moved ? directionBetween(originPos, unit.position) : unit.facing;
        this.enterFacingConfirm(unit, facing);
        break;
      }
      case 'cancel':
        this.undoMove({ mode: 'actionMenu', unit, originPos });
        break;
    }
  }

  private showSkillList(unit: UnitState, originPos: HexCoord, title: string, skills: SkillTemplate[]) {
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);
    showActionMenu(screen.x, screen.y, [
      ...skills.map(s => ({
        label: `${title}·${s.name}${s.cost !== undefined ? `（${RESOURCE_SHORT[s.resourceType ?? 'mp']}${s.cost}）` : ''}`,
        value: `skill:${s.name}`,
        disabled: !canAfford(unit, s)  // R5-1 资源不足灰显不可选
      })),
      { label: '返回', value: 'back', kind: 'cancel' }
    ], value => {
      if (value === 'back') {
        this.openActionMenu(unit, originPos);
      } else {
        const skill = skills.find(s => `skill:${s.name}` === value)!;
        if (skill.behavior) {
          this.executeBehaviorSkill(unit, skill, originPos);
        } else if (skill.area) {
          this.enterAoeForecast(unit, skill, originPos);
        } else {
          this.enterTargetSelect(unit, skill, originPos);
        }
      }
      this.render();
    });
  }

  /** 行为技能（§4.9 行为主效果）：执行后走行动收尾；瞬发（R3-10）回行动菜单不结束行动 */
  private executeBehaviorSkill(unit: UnitState, skill: SkillTemplate, originPos?: HexCoord) {
    hideActionMenu();
    if (!payCost(unit, skill)) return;  // R5-1 行为技能消耗（潜行 30 专注）
    // R3-9：行为技能统一执行器（潜行/防御姿态/祝福/战斗怒吼/嗜血）
    const msg = executeBehavior(unit, skill, this.units);
    if (msg) logBattle(`${this.unitName(unit)} ${msg.replace(`${unit.id} `, '')}`);
    if (skill.instant) {
      this.openActionMenu(unit, originPos ?? unit.position);
      return;
    }
    if (hasUnitTrait(unit, 're-move')) {
      this.enterReMove(unit, unit.facing);
    } else {
      this.enterFacingConfirm(unit, unit.facing);
    }
  }

  /** AoE 技能流程（§4.9）：自身为中心的旋风斩/神圣盾击——区域内敌人预报后确认 */
  private enterAoeForecast(unit: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    if (!skill.area) return;
    const cells = getAreaCells(skill.area, unit, unit.position);
    const targets = unitsInArea(this.units, cells, unit.faction);
    if (targets.length === 0) {
      showNotice(`${skill.name}：范围内没有目标`);
      this.openActionMenu(unit, originPos);
      return;
    }
    hideActionMenu();
    const forecasts = calcAoeForecast(this.map, unit, targets, skill);
    this.phase = { mode: 'aoeForecast', unit, skill, originPos, targets };
    const rows = targets.map((t, i) => ({
      name: this.unitName(t),
      damage: forecasts[i].damage,
      hitRate: forecasts[i].hitRate,
      critRate: forecasts[i].critRate
    }));
    showAoeForecastPanel(
      skill.name,
      { name: this.unitName(unit), templateId: unit.templateId, faction: unit.faction },
      rows,
      () => { void this.confirmAoeBattle(unit, skill, targets); },
      () => { this.openActionMenu(unit, originPos); this.render(); }
    );
  }

  private async confirmAoeBattle(
    unit: UnitState,
    skill: SkillTemplate,
    targets: UnitState[]
  ) {
    hideForecastPanel();
    cancelStealth(unit);
    const results = resolveAoeBattle(this.map, unit, targets, skill);
    for (const t of targets) {
      if (t.faction === 'enemy') provokeGroup(this.units, t);
    }
    this.removeDead();
    this.victory = checkVictory(this.units);
    this.updateTopbar();
    this.render();

    for (const r of results) {
      const t = targets.find(x => x.id === r.targetId);
      if (!t) continue;
      await this.playStrikes(unit, t, [{
        byAttacker: true, hit: r.hit, crit: r.crit, damage: r.damage, absorbed: r.absorbed,
        side: r.forecast.side, skillName: skill.name
      }]);
    }
    logBattle(`${this.unitName(unit)} 释放 ${skill.name}，命中 ${results.filter(r => r.hit).length}/${results.length}`);

    if (this.victory !== 'ongoing') {
      this.enterGameOver();
      return;
    }
    if (unit.hp <= 0) {
      this.cancelToIdle();
      return;
    }
    const facing = directionBetween(unit.position, targets[0].position);
    if (hasUnitTrait(unit, 're-move')) {
      this.enterReMove(unit, facing);
    } else {
      this.enterFacingConfirm(unit, facing);
    }
  }

  private enterTargetSelect(unit: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    // 法术按 targetType 选择目标阵营，普通技能只打敌方
    const wantAlly = isSpell(skill) && skill.targetType === 'ally';
    const targets = new Set<string>();
    for (const u of this.units) {
      const isEnemy = u.faction !== unit.faction;
      if (isEnemy === wantAlly) continue;
      const d = distance(unit.position, u.position);
      const rMax = effectiveRangeMax(getTemplate(unit.templateId)!, skill, getTerrain(this.map, unit.position), unit.loadout.passive);
      if (d >= skill.rangeMin && d <= rMax) {
        if (skill.rush && rushDestination(this.map, this.units, unit, u) === null) continue;
        targets.add(hexKey(u.position));
      }
    }
    if (targets.size === 0) {
      // 射程内无目标：回行动菜单
      this.openActionMenu(unit, originPos);
      return;
    }
    this.phase = { mode: 'targetSelect', unit, skill, originPos, targets };
  }

  private beginCharge(unit: UnitState, target: UnitState, skill: SkillTemplate) {
    hideActionMenu();
    if (isStealthed(unit) && !hasUnitTrait(unit, 'shadow-hunter')) cancelStealth(unit);
    unit.statuses.push({
      type: 'charge', skillName: skill.name,
      turnsLeft: (skill.chargeTurns ?? 1) + 1,
      appliedAtTurn: this.turn,
      skill, targetId: target.id
    });
    logBattle(`${this.unitName(unit)} 开始蓄力 ${skill.name}`);
    const facing = directionBetween(unit.position, target.position);
    this.enterFacingConfirm(unit, facing);
  }

  private enterForecast(unit: UnitState, target: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    hideActionMenu();
    const forecast = calcBattleForecast(this.map, unit, target, skill);
    this.phase = { mode: 'forecast', unit, target, skill, forecast };
    const atkName = getTemplate(unit.templateId)?.name ?? unit.templateId;
    const defName = getTemplate(target.templateId)?.name ?? target.templateId;
    showForecastPanel(
      forecast,
      { name: atkName, templateId: unit.templateId, faction: unit.faction },
      { name: defName, templateId: target.templateId, faction: target.faction },
      () => { void this.confirmBattle(unit, target, skill); },
      () => { this.enterTargetSelect(unit, skill, originPos); this.render(); }
    );
  }

  private enterSpellForecast(unit: UnitState, target: UnitState, spell: SpellTemplate, originPos: HexCoord) {
    hideActionMenu();
    const forecast = calcSpellForecast(this.map, unit, target, spell);
    this.phase = { mode: 'spellForecast', unit, target, spell, forecast };
    const casterName = getTemplate(unit.templateId)?.name ?? unit.templateId;
    const targetName = getTemplate(target.templateId)?.name ?? target.templateId;
    showSpellForecastPanel(
      spell.name,
      { name: casterName, templateId: unit.templateId, faction: unit.faction },
      targetName,
      forecast,
      () => { void this.confirmSpell(unit, target, spell); },
      () => { this.enterTargetSelect(unit, spell, originPos); this.render(); }
    );
  }

  /** 确认法术：即时释放立即结算/挂状态；咏唱释放挂咏唱状态（§4.12）；R5-1 起唱即扣、打断经 interruptChant 返还 */
  private async confirmSpell(unit: UnitState, target: UnitState, spell: SpellTemplate) {
    hideForecastPanel();
    cancelStealth(unit);
    interruptChant(unit);  // 释放其他法术打断已有咏唱（返还其已扣资源）
    unit.castSpellThisTurn = true;  // R5-2 施法标记（咏唱起唱即算施放）

    if (!payCost(unit, spell)) return;  // 资源不足兜底（菜单已灰显）

    if (spell.castMode === 'chant') {
      unit.statuses.push({
        type: 'chant', skillName: spell.name,
        turnsLeft: spell.chantTurns ?? 1,
        appliedAtTurn: this.turn,
        spell, targetId: target.id,
        targetPos: { ...target.position }  // R3-7 AoE 法术：锁定释放中心格
      });
      logBattle(`${this.unitName(unit)} 开始咏唱 ${spell.name}`);
      const facing = directionBetween(unit.position, target.position);
      this.enterFacingConfirm(unit, facing);
      return;
    }

    const hpBefore = target.hp;
    const spellResult = resolveSpell(this.map, unit, target, spell, this.units);
    if (target.faction === 'enemy') provokeGroup(this.units, target);  // 打一个引来一组
    this.removeDead();
    this.victory = checkVictory(this.units);
    this.updateTopbar();
    this.render();

    // 伤害类法术播放突进+受击+飘字；增益类只飘字
    if (spellResult.kind === 'damage') {
      await this.playStrikes(unit, target, [{
        byAttacker: true, hit: spellResult.hit === true, crit: spellResult.crit === true,
        damage: spellResult.damage, absorbed: 0, side: spellResult.side, skillName: spell.name
      }]);
    } else {
      this.showSpellResult(unit, target, spell.name, hpBefore, spellResult);
    }

    if (this.victory !== 'ongoing') {
      this.enterGameOver();
      return;
    }
    if (unit.hp <= 0) {
      this.cancelToIdle();
      return;
    }
    const facing = directionBetween(unit.position, target.position);
    if (hasUnitTrait(unit, 're-move')) {
      this.enterReMove(unit, facing);
    } else {
      this.enterFacingConfirm(unit, facing);
    }
  }

  /** 确认预报：结算并应用，随后进入再移动或朝向确认 */
  private async confirmBattle(unit: UnitState, target: UnitState, skill: SkillTemplate) {
    hideForecastPanel();
    const wasStealthed = isStealthed(unit);
    cancelStealth(unit);
    const finalSkill = wasStealthed ? applyAmbushBonus(unit, skill) : skill;
    if (!payCost(unit, finalSkill)) return;  // R5-1 结算前扣费；资源不足兜底（菜单已灰显）
    const noCounter = finalSkill.noCounterIfMoved === true && unit.moveSpent > 0;
    if (finalSkill.rush) {
      const dest = rushDestination(this.map, this.units, unit, target);
      if (dest) unit.position = { ...dest };
    }
    const result = resolveBattle(this.map, unit, target, finalSkill, Math.random, { noCounter });
    unit.hp = result.attackerHp;
    target.hp = result.defenderHp;
    if (target.faction === 'enemy') provokeGroup(this.units, target);  // 打一个引来一组
    this.removeDead();
    this.victory = checkVictory(this.units);
    this.updateTopbar();
    this.render();

    await this.playStrikes(unit, target, result.strikes);

    if (this.victory !== 'ongoing') {
      this.enterGameOver();
      return;
    }
    if (unit.hp <= 0) {
      // 攻方阵亡于反击
      this.cancelToIdle();
      return;
    }
    const facing = directionBetween(unit.position, target.position);
    if (hasUnitTrait(unit, 're-move')) {
      this.enterReMove(unit, facing);
    } else {
      this.enterFacingConfirm(unit, facing);
    }
  }

  /** 生成飘字并确保动画渲染循环运行 */
  private floatText(text: string, color: string, pos: HexCoord, delayMs = 0, dyPx = 0): void {
    const world = axialToPixel(pos, HEX_SIZE);
    this.effects.spawn(text, color, world.x, world.y + dyPx, performance.now() + delayMs);
    this.kickAnimLoop();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private unitName(u: UnitState): string {
    return getTemplate(u.templateId)?.name ?? u.templateId;
  }

  /** 动画或缩放补间活跃时 rAF 重绘，静止即停（不跑常驻循环） */
  private kickAnimLoop(): void {
    if (this.animating) return;
    this.animating = true;
    let lastMs = performance.now();
    const step = () => {
      const now = performance.now();
      this.camera.tick(now - lastMs);
      lastMs = now;
      this.effects.prune(now);
      if (!this.effects.active(now) && !this.animator.active(now) && !this.camera.animating()) {
        this.animating = false;
        this.render();
        return;
      }
      this.render();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 移动滑行：逻辑坐标已瞬时更新，渲染沿途经格逐格插值（阻塞至动画完成） */
  private async playMove(unit: UnitState, from: HexCoord, to: HexCoord): Promise<void> {
    const template = getTemplate(unit.templateId);
    // 快照：视移动者仍在出发点（占位/封锁按移动前局面判定）
    const snapshot = this.units.map(u => (u === unit ? { ...u, position: from } : u));
    const path = template
      ? rebuildPath(this.map, snapshot, from, to, template.movePoints, isFlying(template))
      : null;
    const pts = (path ?? [from, to]).map(h => axialToPixel(h, HEX_SIZE));
    const totalMs = this.animator.startMove(unit.id, pts, performance.now());
    this.kickAnimLoop();
    await this.sleep(totalMs);
  }

  /** 战斗交换序列动画（§4.3）：逐击突进→受击闪烁+飘字（阻塞至序列完成） */
  private async playStrikes(unit: UnitState, target: UnitState, strikes: StrikeResult[]): Promise<void> {
    for (const s of strikes) {
      const atk = s.byAttacker ? unit : target;
      const def = s.byAttacker ? target : unit;
      const atkW = axialToPixel(atk.position, HEX_SIZE);
      const defW = axialToPixel(def.position, HEX_SIZE);
      this.animator.startLunge(atk.id, defW.x - atkW.x, defW.y - atkW.y, performance.now());
      this.kickAnimLoop();
      await this.sleep(LUNGE_MS);
      if (s.hit) {
        this.animator.startFlash(def.id, performance.now());
        this.animator.startShake(def.id, performance.now());
        const hpLoss = s.damage - s.absorbed;
        // R7-2 暴击标记：飘字前缀 + 战报「暴击！」
        if (hpLoss > 0) this.floatText(s.crit ? `暴击-${hpLoss}` : `-${hpLoss}`, s.crit ? FLOAT_COLOR.crit : FLOAT_COLOR.damage, def.position);
        if (s.absorbed > 0) this.floatText(`盾${s.absorbed}`, FLOAT_COLOR.shield, def.position, 0, -14);
        logBattle(
          `${this.unitName(atk)}·${s.skillName} → ${this.unitName(def)} ${s.crit ? '暴击！' : ''}命中` +
          (hpLoss > 0 ? ` -${hpLoss}` : '') + (s.absorbed > 0 ? `（盾吸收 ${s.absorbed}）` : '')
        );
      } else {
        this.floatText('MISS', FLOAT_COLOR.miss, def.position);
        logBattle(`${this.unitName(atk)}·${s.skillName} → ${this.unitName(def)} 落空`);
      }
      this.kickAnimLoop();
      await this.sleep(FLASH_MS + STRIKE_GAP_MS);
    }
  }

  /** 清理阵亡单位并生成淡出幽灵 */
  private removeDead(): void {
    const dead = this.units.filter(u => u.hp <= 0);
    if (dead.length === 0) return;
    for (const u of dead) {
      const world = axialToPixel(u.position, HEX_SIZE);
      this.animator.startGhost(
        u.templateId,
        u.faction === 'player' ? FACTION_COLORS.player : FACTION_COLORS.enemy,
        world.x, world.y, performance.now()
      );
    }
    this.units = this.units.filter(u => u.hp > 0);
    for (const u of dead) {
      logBattle(`${this.unitName(u)} 阵亡`);
    }
    this.kickAnimLoop();
  }

  /** 法术结算飘字与日志：伤害/MISS/治疗/状态施加（过量治疗只显示实际回复） */
  private showSpellResult(caster: UnitState, target: UnitState, skillName: string, hpBefore: number, result: SpellResult): void {
    const c = this.unitName(caster), t = this.unitName(target);
    if (result.kind === 'damage') {
      if (result.hit) {
        this.floatText(result.crit ? `暴击-${result.damage}` : `-${result.damage}`,
          result.crit ? FLOAT_COLOR.crit : FLOAT_COLOR.damage, target.position);
        logBattle(`${c}·${skillName} → ${t} ${result.crit ? '暴击！' : ''}命中 -${result.damage}`);
      } else {
        this.floatText('MISS', FLOAT_COLOR.miss, target.position);
        logBattle(`${c}·${skillName} → ${t} 落空`);
      }
    } else if (result.kind === 'heal') {
      const healed = result.targetHp - hpBefore;
      if (healed > 0) this.floatText(`+${healed}`, FLOAT_COLOR.heal, target.position);
      logBattle(`${c}·${skillName} → ${t} 回复 +${healed}`);
    } else if (result.kind === 'regen') {
      logBattle(`${c}·${skillName} → ${t} 获得再生（每回合 +${result.healPerTurn}·${result.turns} 回合）`);
    } else if (result.kind === 'shield') {
      logBattle(`${c}·${skillName} → ${t} 获得护盾（吸收 ${result.absorb}·${result.turns} 回合）`);
    } else if (result.kind === 'dot') {
      if (result.hit) logBattle(`${c}·${skillName} → ${t} 中咒（每回合 -${result.damagePerTurn}，共 ${result.turns} 回合）`);
      else logBattle(`${c}·${skillName} → ${t} 落空`);
    }
    // R12-1 虔诚溅射展示：与主结算同构（治疗飘字 + 战报行）
    const sp = result.splash;
    if (sp) {
      const su = this.units.find(u => u.id === sp.targetId);
      if (su) {
        if (result.kind === 'heal') this.floatText(`+${sp.value}`, FLOAT_COLOR.heal, su.position);
        const desc = result.kind === 'heal' ? `回复 +${sp.value}`
          : result.kind === 'regen' ? `获得再生（每回合 +${sp.value}·${result.turns} 回合）`
          : result.kind === 'shield' ? `获得护盾（吸收 ${sp.value}·${result.turns} 回合）`
          : '';
        logBattle(`虔诚溅射：${this.unitName(su)} ${desc}`);
      }
    }
  }

  private enterReMove(unit: UnitState, defaultFacing: number) {
    const template = getTemplate(unit.templateId)!;
    // §4.8 再移动使用剩余移动力（已消耗在本回合移动时记录）
    const remaining = Math.max(0, template.movePoints - unit.moveSpent);
    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, remaining, isFlying(template)
    );
    this.phase = { mode: 'reMove', unit, moveRange, defaultFacing };
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);
    showActionMenu(screen.x, screen.y, [
      { label: '待命', value: 'wait' }
    ], () => {
      this.enterFacingConfirm(unit, defaultFacing);
      this.render();
    });
  }

  private enterFacingConfirm(unit: UnitState, defaultFacing: number) {
    hideActionMenu();
    unit.facing = defaultFacing;
    this.phase = { mode: 'facingConfirm', unit };
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);
    showActionMenu(screen.x, screen.y, [
      { label: '确认朝向', value: 'ok' }
    ], () => {
      this.finishAction(unit);
      this.render();
    });
  }

  /** 撤销移动：单位回出发点，重新选中 */
  private undoMove(phase: { mode: 'actionMenu' | 'targetSelect'; unit: UnitState; originPos: HexCoord }) {
    hideActionMenu();
    phase.unit.position = { ...phase.originPos };
    phase.unit.moveSpent = 0;
    this.selectUnit(phase.unit);
  }

  /** 结束单位行动 */
  private finishAction(unit: UnitState) {
    hideActionMenu();
    unit.hasActed = true;
    this.phase = { mode: 'idle' };
    this.updateTopbar();
    // 全部行动完毕自动进入敌方阶段（§2）
    const players = this.units.filter(u => u.faction === 'player');
    if (players.length > 0 && players.every(u => u.hasActed)) {
      this.endPlayerPhase();
    }
  }

  private cancelToIdle() {
    hideActionMenu();
    hideForecastPanel();
    this.phase = { mode: 'idle' };
    clearUnitInfo();
  }

  private handleDblClick(screenX: number, screenY: number) {
    const hex = this.screenToHex(screenX, screenY);
    if (!hex) return;
    const unit = getUnitAt(this.units, hex);
    const target = unit ? unit.position : hex;
    const world = axialToPixel(target, HEX_SIZE);
    this.camera.centerOn(world.x, world.y, this.canvas.width, this.canvas.height);
  }

  private screenToHex(screenX: number, screenY: number) {
    const world = this.camera.screenToWorld({ x: screenX, y: screenY });
    const hex = pixelToAxial(world.x, world.y, HEX_SIZE);
    if (!isValidHex(hex, this.map.width, this.map.height)) return null;
    return hex;
  }

  private updateTopbar() {
    const playerCount = this.units.filter(u => u.faction === 'player').length;
    const enemyCount = this.units.filter(u => u.faction === 'enemy').length;
    updateTopbar(this.turn, this.phaseLabel, playerCount, enemyCount,
      this.phaseLabel === '玩家' && this.victory === 'ongoing'
        ? () => this.endPlayerPhase()
        : undefined);
  }

  /** 玩家阶段结束：进入敌方阶段 */
  private endPlayerPhase() {
    if (this.victory !== 'ongoing' || this.phase.mode === 'enemyTurn' || this.phase.mode === 'gameOver') return;
    hideActionMenu();
    hideForecastPanel();
    this.phase = { mode: 'enemyTurn' };
    this.phaseLabel = '敌方';
    logBattle(`── 回合 ${this.turn} · 敌方阶段 ──`, 'phase');
    this.updateTopbar();
    this.render();
    void this.runEnemyPhase();
  }

  /** 敌方阶段：激活单位逐个 AI 行动，短延时播放（§6/§7.4 简化版） */
  private async runEnemyPhase() {
    // 敌方阶段开始：推进敌方单位状态（§4.12 计时规则）
    if (this.tickPhase('enemy') !== 'ongoing') return;

    // 增援触发（§6）：登场即激活并参与本阶段行动
    const spawned = checkReinforcements(this.map, this.turn, this.units, this.reinforcementFired);
    if (spawned.length > 0) {
      this.units.push(...spawned);
      for (const u of spawned) this.animator.startAppear(u.id, performance.now());
      showNotice(`⚔ 敌方增援登场（${spawned.length} 人）`);
      logBattle(`敌方增援登场（${spawned.length} 人）`);
      this.updateTopbar();
      this.kickAnimLoop();
      this.render();
    }

    // 警戒范围扫描（§6 待机型）：覆盖我方即全组激活
    checkGroupActivation(this.map, this.units);

    const queue = this.units.filter(u => u.faction === 'enemy');
    for (const enemy of queue) {
      if (!enemy.activated) continue;  // 待机未激活：本阶段不行动
      await new Promise(r => setTimeout(r, ENEMY_ACTION_DELAY_MS));
      if (this.victory !== 'ongoing') return;
      if (!this.units.includes(enemy)) continue;

      interruptChant(enemy);  // 敌方主动行动同样打断咏唱
      const action = decideEnemyAction(this.map, this.units, enemy);
      const from = enemy.position;
      enemy.position = { ...action.dest };
      await this.playMove(enemy, from, action.dest);
      if (action.skill && action.target) {
        enemy.facing = directionBetween(enemy.position, action.target.position);
        if (isSpell(action.skill)) enemy.castSpellThisTurn = true;  // R5-2 敌方施法标记
        payCost(enemy, action.skill);  // R5-1 敌方同样扣费（AI 择优已过滤资源不足）
        const result = resolveBattle(this.map, enemy, action.target, action.skill);
        enemy.hp = result.attackerHp;
        action.target.hp = result.defenderHp;
        this.removeDead();
        this.victory = checkVictory(this.units);
        this.updateTopbar();
        this.render();
        await this.playStrikes(enemy, action.target, result.strikes);
      }
      enemy.hasActed = true;
      this.updateTopbar();
      this.render();
    }

    if (this.victory !== 'ongoing') {
      this.enterGameOver();
      return;
    }

    // 玩家阶段开始：推进玩家单位状态（咏唱触发/再生/DoT 结算），再重置行动
    if (this.tickPhase('player') !== 'ongoing') return;

    this.turn++;
    startPlayerPhase(this.units);
    this.phaseLabel = '玩家';
    this.phase = { mode: 'idle' };
    logBattle(`── 回合 ${this.turn} · 玩家阶段 ──`, 'phase');
    this.updateTopbar();
    this.render();
  }

  /** 阶段开始推进状态并应用触发事件；返回胜负态 */
  private tickPhase(faction: 'player' | 'enemy'): VictoryState {
    const events = tickStatuses(this.units, faction);
    tickResources(this.units, faction);  // R5-2 资源阶段推进（专注回 20/MP 歇息/施法标记重置）
    applyTerrainRegen(this.units, faction, this.map);  // R6-1 地形回复（持有者阵营阶段开始，§3）
    if (faction === 'player') refreshAuras(this.units, faction);
    if (events.length > 0) {
      for (const e of events) {
        if (e.kind === 'chantFire') {
          const caster = this.units.find(u => u.id === e.unitId);
          const target = this.units.find(u => u.id === e.targetId);
          if (caster && e.spell.area && e.targetPos) {
            // R3-7 AoE 法术：以咏唱锁定格为中心，区域内敌方独立结算（目标死移不影响落点）
            const aoeResults = resolveAoeSpell(this.map, caster, e.targetPos, this.units, e.spell);
            for (const r of aoeResults) {
              const t = this.units.find(u => u.id === r.targetId);
              if (!t) continue;
              this.floatText(r.hit ? (r.crit ? `暴击-${r.damage}` : `-${r.damage}`) : 'MISS',
                r.hit ? (r.crit ? FLOAT_COLOR.crit : FLOAT_COLOR.damage) : FLOAT_COLOR.miss, t.position);
              if (caster.faction === 'player' && t.faction === 'enemy') {
                provokeGroup(this.units, t);
              }
            }
            logBattle(`${this.unitName(caster)} 的 ${e.spell.name} 落地，命中 ${aoeResults.filter(r => r.hit).length}/${aoeResults.length}`);
          } else if (caster && target) {
            // 目标先亡则法术落空（§4.12）
            const hpBefore = target.hp;
            const r = resolveSpell(this.map, caster, target, e.spell, this.units);
            this.showSpellResult(caster, target, e.spell.name, hpBefore, r);
            if (caster.faction === 'player' && target.faction === 'enemy') {
              provokeGroup(this.units, target);
            }
          }
        } else if (e.kind === 'chargeFire') {
          const caster = this.units.find(u => u.id === e.unitId);
          const target = this.units.find(u => u.id === e.targetId);
          if (caster && target && target.hp > 0) {
            const hpBefore = target.hp;
            resolveChargeStrike(this.map, caster, target, e.skill);
            if (hpBefore > target.hp) {
              this.floatText(`-${hpBefore - target.hp}`, FLOAT_COLOR.damage, target.position);
            }
            logBattle(`${this.unitName(caster)} 蓄力射击 → ${this.unitName(target)}`);
            if (caster.faction === 'player' && target.faction === 'enemy') {
              provokeGroup(this.units, target);
            }
          }
        } else if (e.kind === 'regenTick') {
          const u = this.units.find(x => x.id === e.unitId);
          if (u && e.healed > 0) {
            this.floatText(`+${e.healed}`, FLOAT_COLOR.heal, u.position);
            logBattle(`${this.unitName(u)} 再生 +${e.healed}`);
          }
        } else if (e.kind === 'dotTick') {
          const u = this.units.find(x => x.id === e.unitId);
          if (u) {
            this.floatText(`-${e.damage}`, FLOAT_COLOR.damage, u.position);
            logBattle(`${this.unitName(u)} ${e.skillName} -${e.damage}`);
          }
        }
      }
      this.removeDead();
      this.victory = checkVictory(this.units);
      this.updateTopbar();
      this.kickAnimLoop();
      this.render();
      if (this.victory !== 'ongoing') {
        this.enterGameOver();
      }
    }
    return this.victory;
  }

  private enterGameOver() {
    hideActionMenu();
    hideForecastPanel();
    this.phase = { mode: 'gameOver' };
    this.phaseLabel = this.victory === 'playerWin' ? '🏆 我方胜利' : '☠ 我方败北';
    logBattle(this.victory === 'playerWin' ? '🏆 我方胜利' : '☠ 我方败北', 'phase');
    // R15-5 结算浮层：胜方阵营代表立绘 + 回合数 + 双方存活统计（§7.4 结算画面做实）
    showGameOverOverlay(this.victory, {
      turn: this.turn,
      playerAlive: this.units.filter(u => u.faction === 'player').length,
      enemyAlive: this.units.filter(u => u.faction === 'enemy').length
    });
    this.updateTopbar();
    this.render();
  }

  /** 调整画布尺寸跟随容器 */
  private resizeCanvas() {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  /** 初始视野：对准南方我方出生点（R14：成功后置位，供 resize 补做判定） */
  private cameraCentered = false;

  private centerOnSpawn() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const players = this.units.filter(u => u.faction === 'player');
    const cx = players.reduce((s, u) => s + u.position.q, 0) / players.length;
    const cy = players.reduce((s, u) => s + u.position.r, 0) / players.length;
    const world = axialToPixel({ q: cx, r: cy }, HEX_SIZE);
    this.camera.centerOn(world.x, world.y, w, h);
    this.cameraCentered = true;
  }

  /** 按需渲染：状态变更后同步重绘（M2 无动画，不跑常驻 rAF 循环） */
  private render = () => {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#0d0f13';
    this.ctx.fillRect(0, 0, width, height);

    // R19 世界系变换：所有层在世界坐标绘制，随 zoom 等比缩放
    this.renderer.applyView(this.camera);

    this.renderer.drawTerrain(this.map, this.camera, width, height);
    this.renderer.drawGrid(this.map, this.camera, width, height);

    if (this.phase.mode === 'unitSelected') {
      this.renderer.drawRangeOverlay(this.phase.moveRange, this.camera, '#4a90d9', width, height);
      this.renderer.drawRangeOverlay(this.phase.attackRange, this.camera, '#d94a4a', width, height);
    }
    if (this.phase.mode === 'targetSelect') {
      const wantAlly = isSpell(this.phase.skill) && this.phase.skill.targetType === 'ally';
      this.renderer.drawRangeOverlay(this.phase.targets, this.camera,
        wantAlly ? '#4ade80' : '#d94a4a', width, height);
    }
    if (this.phase.mode === 'forecast' || this.phase.mode === 'spellForecast') {
      this.renderer.drawRangeOverlay(
        new Set([hexKey(this.phase.target.position)]), this.camera, '#d94a4a', width, height
      );
    }
    if (this.phase.mode === 'reMove') {
      this.renderer.drawRangeOverlay(this.phase.moveRange, this.camera, '#4a90d9', width, height);
    }
    if (this.phase.mode === 'facingConfirm') {
      // 相邻 6 格高亮提示可点击调整朝向
      const neighbors = new Set<string>();
      for (let dir = 0; dir < 6; dir++) {
        neighbors.add(hexKey(neighbor(this.phase.unit.position, dir as Facing)));
      }
      this.renderer.drawRangeOverlay(neighbors, this.camera, '#4ade80', width, height);
    }

    this.renderer.drawUnits(this.units, this.camera, width, height, this.animator);
    this.renderer.drawGhosts(this.animator.ghosts(performance.now()), this.camera);

    if (this.phase.mode === 'unitSelected' || this.phase.mode === 'actionMenu' ||
        this.phase.mode === 'targetSelect' || this.phase.mode === 'reMove' ||
        this.phase.mode === 'facingConfirm') {
      this.renderer.drawSelectionIndicator(this.phase.unit.position, this.camera);
    }

    this.effects.draw(this.ctx, this.camera, performance.now());
    this.renderer.resetView();
  };
}