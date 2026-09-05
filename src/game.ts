import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState, getUnitAt } from './core/unit';
import { axialToPixel, pixelToAxial, isValidHex, distance, hexKey, directionBetween, neighbor } from './core/hex';
import type { HexCoord, Facing } from './core/types';
import { calcMovementRange, calcAttackRange, calcMovementCosts } from './core/range';
import { calcBattleForecast, resolveBattle } from './core/combat';
import type { BattleForecast, StrikeResult } from './core/combat';
import { calcSpellForecast, resolveSpell } from './core/spell';
import type { SpellForecast, SpellResult } from './core/spell';
import type { SkillTemplate } from './config/units';
import { isSpell } from './config/spells';
import type { SpellTemplate } from './config/spells';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS } from './config/map';
import { getTemplate } from './config/units';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE, FACTION_COLORS } from './render/hex-renderer';
import { EffectSystem, FLOAT_COLOR } from './render/effects';
import { Animator, MOVE_MS, LUNGE_MS, FLASH_MS, STRIKE_GAP_MS } from './render/animator';
import { InputHandler } from './render/input';
import { updateTopbar } from './ui/topbar';
import { showUnitInfo, clearUnitInfo, showTerrainInfo, clearTerrainInfo } from './ui/sidepanel';
import { showActionMenu, hideActionMenu } from './ui/action-menu';
import { showForecastPanel, hideForecastPanel, showSpellForecastPanel } from './ui/forecast';
import { getTerrain } from './core/map';
import { checkVictory, startPlayerPhase } from './core/turn';
import type { VictoryState } from './core/turn';
import { decideEnemyAction, checkGroupActivation, provokeGroup } from './core/ai';
import { checkReinforcements } from './core/reinforce';
import { interruptChant, tickStatuses } from './core/status';
import { showNotice } from './ui/notice';
import { logBattle } from './ui/battle-log';

type Phase =
  | { mode: 'idle' }
  | { mode: 'unitSelected'; unit: UnitState; moveRange: Set<string>; attackRange: Set<string>; moveCosts: Map<string, number> }
  | { mode: 'actionMenu'; unit: UnitState; originPos: HexCoord }
  | { mode: 'targetSelect'; unit: UnitState; skill: SkillTemplate; originPos: HexCoord; targets: Set<string> }
  | { mode: 'forecast'; unit: UnitState; target: UnitState; skill: SkillTemplate; forecast: BattleForecast }
  | { mode: 'spellForecast'; unit: UnitState; target: UnitState; spell: SpellTemplate; forecast: SpellForecast }
  | { mode: 'reMove'; unit: UnitState; moveRange: Set<string>; defaultFacing: number }
  | { mode: 'facingConfirm'; unit: UnitState }
  | { mode: 'enemyTurn' }
  | { mode: 'gameOver' };

const ENEMY_ACTION_DELAY_MS = 300;

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new HexRenderer(this.ctx);

    this.map = createMapState(MAP_OVERRIDES);
    this.units = [
      ...PLAYER_UNITS.map(p => createUnitState(p.templateId, p.faction, p.position)),
      ...ENEMY_GROUPS.flatMap(g =>
        g.units.map(p => {
          const u = createUnitState(p.templateId, p.faction, p.position);
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
        this.camera.zoomAt(sx, sy, Math.pow(1.1, -deltaY / 100));
        this.render();
      },
      onDblClick: (sx, sy) => { this.handleDblClick(sx, sy); this.render(); },
      onHover: (sx, sy) => this.handleHover(sx, sy)
    });

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });
    this.centerOnSpawn();

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
          if (isSpell(this.phase.skill)) {
            this.enterSpellForecast(this.phase.unit, unit, this.phase.skill, this.phase.originPos);
          } else {
            this.enterForecast(this.phase.unit, unit, this.phase.skill, this.phase.originPos);
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
      this.map, this.units, unit.position, template.movePoints, template.flying
    );
    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, template.movePoints, template.flying
    );
    const rangeMin = Math.min(...template.skills.map(s => s.rangeMin));
    const rangeMax = Math.max(...template.skills.map(s => s.rangeMax));
    const attackRange = calcAttackRange(moveRange, rangeMin, rangeMax);

    this.phase = { mode: 'unitSelected', unit, moveRange, attackRange, moveCosts };
    showUnitInfo(unit);
  }

  private openActionMenu(unit: UnitState, originPos: HexCoord) {
    hideActionMenu();
    this.phase = { mode: 'actionMenu', unit, originPos };
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);

    const template = getTemplate(unit.templateId)!;
    const attackSkills = template.skills.filter(s => !isSpell(s));
    const spellSkills = template.skills.filter(isSpell);
    const items: Array<{ label: string; value: string; kind?: 'normal' | 'cancel' }> = [];
    if (attackSkills.length > 0) items.push({ label: '攻击', value: 'attack' });
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
      ...skills.map(s => ({ label: `${title}·${s.name}`, value: `skill:${s.name}` })),
      { label: '返回', value: 'back', kind: 'cancel' }
    ], value => {
      if (value === 'back') {
        this.openActionMenu(unit, originPos);
      } else {
        const skill = skills.find(s => `skill:${s.name}` === value)!;
        this.enterTargetSelect(unit, skill, originPos);
      }
      this.render();
    });
  }

  private enterTargetSelect(unit: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    // 法术按 targetType 选择目标阵营，普通技能只打敌方
    const wantAlly = isSpell(skill) && skill.targetType === 'ally';
    const targets = new Set<string>();
    for (const u of this.units) {
      const isEnemy = u.faction !== unit.faction;
      if (isEnemy === wantAlly) continue;
      const d = distance(unit.position, u.position);
      if (d >= skill.rangeMin && d <= skill.rangeMax) {
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

  private enterForecast(unit: UnitState, target: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    hideActionMenu();
    const forecast = calcBattleForecast(this.map, unit, target, skill);
    this.phase = { mode: 'forecast', unit, target, skill, forecast };
    const atkName = getTemplate(unit.templateId)?.name ?? unit.templateId;
    const defName = getTemplate(target.templateId)?.name ?? target.templateId;
    showForecastPanel(forecast, atkName, defName,
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
    showSpellForecastPanel(spell.name, casterName, targetName, forecast,
      () => { void this.confirmSpell(unit, target, spell); },
      () => { this.enterTargetSelect(unit, spell, originPos); this.render(); }
    );
  }

  /** 确认法术：即时释放立即结算/挂状态；咏唱释放挂咏唱状态（§4.12） */
  private async confirmSpell(unit: UnitState, target: UnitState, spell: SpellTemplate) {
    hideForecastPanel();
    interruptChant(unit);  // 释放其他法术打断已有咏唱

    if (spell.castMode === 'chant') {
      unit.statuses.push({
        type: 'chant', skillName: spell.name,
        turnsLeft: spell.chantTurns ?? 1,
        appliedAtTurn: this.turn,
        spell, targetId: target.id
      });
      logBattle(`${this.unitName(unit)} 开始咏唱 ${spell.name}`);
      const facing = directionBetween(unit.position, target.position);
      this.enterFacingConfirm(unit, facing);
      return;
    }

    const hpBefore = target.hp;
    const spellResult = resolveSpell(this.map, unit, target, spell);
    if (target.faction === 'enemy') provokeGroup(this.units, target);  // 打一个引来一组
    this.removeDead();
    this.victory = checkVictory(this.units);
    this.updateTopbar();
    this.render();

    // 伤害类法术播放突进+受击+飘字；增益类只飘字
    if (spellResult.kind === 'damage') {
      await this.playStrikes(unit, target, [{
        byAttacker: true, hit: spellResult.hit === true, damage: spellResult.damage,
        absorbed: 0, side: spellResult.side, skillName: spell.name
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
    if (getTemplate(unit.templateId)?.reMove) {
      this.enterReMove(unit, facing);
    } else {
      this.enterFacingConfirm(unit, facing);
    }
  }

  /** 确认预报：结算并应用，随后进入再移动或朝向确认 */
  private async confirmBattle(unit: UnitState, target: UnitState, skill: SkillTemplate) {
    hideForecastPanel();
    const result = resolveBattle(this.map, unit, target, skill);
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
    if (getTemplate(unit.templateId)?.reMove) {
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

  /** 动画活跃时 rAF 重绘，静止即停（不跑常驻循环） */
  private kickAnimLoop(): void {
    if (this.animating) return;
    this.animating = true;
    const step = () => {
      const now = performance.now();
      this.effects.prune(now);
      if (!this.effects.active(now) && !this.animator.active(now)) {
        this.animating = false;
        this.render();
        return;
      }
      this.render();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 移动滑行：逻辑坐标已瞬时更新，渲染插值回起点（阻塞至动画完成） */
  private async playMove(unit: UnitState, from: HexCoord, to: HexCoord): Promise<void> {
    const fromW = axialToPixel(from, HEX_SIZE);
    const toW = axialToPixel(to, HEX_SIZE);
    this.animator.startMove(unit.id, fromW.x, fromW.y, toW.x, toW.y, performance.now());
    this.kickAnimLoop();
    await this.sleep(MOVE_MS);
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
        const hpLoss = s.damage - s.absorbed;
        if (hpLoss > 0) this.floatText(`-${hpLoss}`, FLOAT_COLOR.damage, def.position);
        if (s.absorbed > 0) this.floatText(`盾${s.absorbed}`, FLOAT_COLOR.shield, def.position, 0, -14);
        logBattle(
          `${this.unitName(atk)}·${s.skillName} → ${this.unitName(def)} 命中` +
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
        getTemplate(u.templateId)?.label[0] ?? '?',
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
        this.floatText(`-${result.damage}`, FLOAT_COLOR.damage, target.position);
        logBattle(`${c}·${skillName} → ${t} 命中 -${result.damage}`);
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
    } else {
      logBattle(`${c}·${skillName} → ${t} 被咒杀（${result.turns} 回合后 -${result.damage}）`);
    }
  }

  private enterReMove(unit: UnitState, defaultFacing: number) {
    const template = getTemplate(unit.templateId)!;
    // §4.8 再移动使用剩余移动力（已消耗在本回合移动时记录）
    const remaining = Math.max(0, template.movePoints - unit.moveSpent);
    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, remaining, template.flying
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

    // 玩家阶段开始：推进玩家单位状态（咏唱触发/再生/咒杀结算），再重置行动
    if (this.tickPhase('player') !== 'ongoing') return;

    this.turn++;
    startPlayerPhase(this.units, this.map);
    this.phaseLabel = '玩家';
    this.phase = { mode: 'idle' };
    logBattle(`── 回合 ${this.turn} · 玩家阶段 ──`, 'phase');
    this.updateTopbar();
    this.render();
  }

  /** 阶段开始推进状态并应用触发事件；返回胜负态 */
  private tickPhase(faction: 'player' | 'enemy'): VictoryState {
    const events = tickStatuses(this.units, faction);
    if (events.length > 0) {
      for (const e of events) {
        if (e.kind === 'chantFire') {
          const caster = this.units.find(u => u.id === e.unitId);
          const target = this.units.find(u => u.id === e.targetId);
          // 目标先亡则法术落空（§4.12）
          if (caster && target) {
            const hpBefore = target.hp;
            const r = resolveSpell(this.map, caster, target, e.spell);
            this.showSpellResult(caster, target, e.spell.name, hpBefore, r);
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
        } else if (e.kind === 'delayedFire') {
          const u = this.units.find(x => x.id === e.unitId);
          if (u) {
            this.floatText(`-${e.damage}`, FLOAT_COLOR.damage, u.position);
            logBattle(`${this.unitName(u)} 咒杀爆发 -${e.damage}`);
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
    this.updateTopbar();
    this.render();
  }

  /** 调整画布尺寸跟随容器 */
  private resizeCanvas() {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  /** 初始视野：对准南方我方出生点 */
  private centerOnSpawn() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const players = this.units.filter(u => u.faction === 'player');
    const cx = players.reduce((s, u) => s + u.position.q, 0) / players.length;
    const cy = players.reduce((s, u) => s + u.position.r, 0) / players.length;
    const world = axialToPixel({ q: cx, r: cy }, HEX_SIZE);
    this.camera.centerOn(world.x, world.y, w, h);
  }

  /** 按需渲染：状态变更后同步重绘（M2 无动画，不跑常驻 rAF 循环） */
  private render = () => {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#0d0f13';
    this.ctx.fillRect(0, 0, width, height);

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
  };
}