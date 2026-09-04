import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState, getUnitAt } from './core/unit';
import { axialToPixel, pixelToAxial, isValidHex, distance, hexKey, directionBetween, neighbor } from './core/hex';
import type { HexCoord, Facing } from './core/types';
import { calcMovementRange, calcAttackRange } from './core/range';
import { calcBattleForecast, resolveBattle } from './core/combat';
import type { BattleForecast } from './core/combat';
import { calcSpellForecast, resolveSpell } from './core/spell';
import type { SpellForecast } from './core/spell';
import type { SkillTemplate } from './config/units';
import { isSpell } from './config/spells';
import type { SpellTemplate } from './config/spells';
import { MAP_OVERRIDES, PLAYER_UNITS, ENEMY_GROUPS } from './config/map';
import { getTemplate } from './config/units';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE } from './render/hex-renderer';
import { InputHandler } from './render/input';
import { updateTopbar } from './ui/topbar';
import { showUnitInfo, clearUnitInfo, showTerrainInfo, clearTerrainInfo } from './ui/sidepanel';
import { showActionMenu, hideActionMenu } from './ui/action-menu';
import { showForecastPanel, hideForecastPanel, showSpellForecastPanel } from './ui/forecast';
import { getTerrain } from './core/map';
import { checkVictory, startPlayerPhase } from './core/turn';
import type { VictoryState } from './core/turn';
import { decideEnemyAction } from './core/ai';
import { interruptChant, tickStatuses } from './core/status';

type Phase =
  | { mode: 'idle' }
  | { mode: 'unitSelected'; unit: UnitState; moveRange: Set<string>; attackRange: Set<string> }
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
  private phase: Phase = { mode: 'idle' };
  private lastHoverKey = '';
  private victory: VictoryState = 'ongoing';
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
    if (this.phase.mode === 'enemyTurn' || this.phase.mode === 'gameOver') return;
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
          interruptChant(this.phase.unit);
          const origin = this.phase.unit.position;
          this.phase.unit.position = { ...hex };
          this.openActionMenu(this.phase.unit, origin);
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
            this.enterSpellForecast(this.phase.unit, unit, this.phase.skill);
          } else {
            this.enterForecast(this.phase.unit, unit, this.phase.skill);
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
          const facing = directionBetween(this.phase.unit.position, dest);
          this.phase.unit.position = { ...dest };
          this.enterFacingConfirm(this.phase.unit, facing);
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

    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, template.movePoints, template.flying
    );
    const rangeMin = Math.min(...template.skills.map(s => s.rangeMin));
    const rangeMax = Math.max(...template.skills.map(s => s.rangeMax));
    const attackRange = calcAttackRange(moveRange, rangeMin, rangeMax);

    this.phase = { mode: 'unitSelected', unit, moveRange, attackRange };
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

  private enterForecast(unit: UnitState, target: UnitState, skill: SkillTemplate) {
    hideActionMenu();
    const forecast = calcBattleForecast(this.map, unit, target, skill);
    this.phase = { mode: 'forecast', unit, target, skill, forecast };
    const atkName = getTemplate(unit.templateId)?.name ?? unit.templateId;
    const defName = getTemplate(target.templateId)?.name ?? target.templateId;
    showForecastPanel(forecast, atkName, defName,
      () => { this.confirmBattle(unit, target, skill); this.render(); },
      () => { this.enterTargetSelect(unit, skill, unit.position); this.render(); }
    );
  }

  private enterSpellForecast(unit: UnitState, target: UnitState, spell: SpellTemplate) {
    hideActionMenu();
    const forecast = calcSpellForecast(this.map, unit, target, spell);
    this.phase = { mode: 'spellForecast', unit, target, spell, forecast };
    const casterName = getTemplate(unit.templateId)?.name ?? unit.templateId;
    const targetName = getTemplate(target.templateId)?.name ?? target.templateId;
    showSpellForecastPanel(spell.name, casterName, targetName, forecast,
      () => { this.confirmSpell(unit, target, spell); this.render(); },
      () => { this.enterTargetSelect(unit, spell, unit.position); this.render(); }
    );
  }

  /** 确认法术：即时释放立即结算/挂状态；咏唱释放挂咏唱状态（§4.12） */
  private confirmSpell(unit: UnitState, target: UnitState, spell: SpellTemplate) {
    hideForecastPanel();
    interruptChant(unit);  // 释放其他法术打断已有咏唱

    if (spell.castMode === 'chant') {
      unit.statuses.push({
        type: 'chant', skillName: spell.name,
        turnsLeft: spell.chantTurns ?? 1,
        appliedAtTurn: this.turn,
        spell, targetId: target.id
      });
      const facing = directionBetween(unit.position, target.position);
      this.enterFacingConfirm(unit, facing);
      return;
    }

    resolveSpell(this.map, unit, target, spell);
    this.units = this.units.filter(u => u.hp > 0);
    this.victory = checkVictory(this.units);
    this.updateTopbar();

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
  private confirmBattle(unit: UnitState, target: UnitState, skill: SkillTemplate) {
    hideForecastPanel();
    const result = resolveBattle(this.map, unit, target, skill);
    unit.hp = result.attackerHp;
    target.hp = result.defenderHp;
    this.units = this.units.filter(u => u.hp > 0);
    this.victory = checkVictory(this.units);
    this.updateTopbar();

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

  private enterReMove(unit: UnitState, defaultFacing: number) {
    const template = getTemplate(unit.templateId)!;
    const moveRange = calcMovementRange(
      this.map, this.units, unit.position, template.movePoints, template.flying
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
    this.updateTopbar();
    this.render();
    void this.runEnemyPhase();
  }

  /** 敌方阶段：逐单位占位 AI 行动，短延时播放（§7.4 简化版） */
  private async runEnemyPhase() {
    // 敌方阶段开始：推进敌方单位状态（§4.12 计时规则）
    if (this.tickPhase('enemy') !== 'ongoing') return;

    const queue = this.units.filter(u => u.faction === 'enemy');
    for (const enemy of queue) {
      await new Promise(r => setTimeout(r, ENEMY_ACTION_DELAY_MS));
      if (this.victory !== 'ongoing') return;
      if (!this.units.includes(enemy)) continue;

      interruptChant(enemy);  // 敌方主动行动同样打断咏唱
      const action = decideEnemyAction(this.map, this.units, enemy);
      enemy.position = { ...action.dest };
      if (action.skill && action.target) {
        enemy.facing = directionBetween(enemy.position, action.target.position);
        const result = resolveBattle(this.map, enemy, action.target, action.skill);
        enemy.hp = result.attackerHp;
        action.target.hp = result.defenderHp;
        this.units = this.units.filter(u => u.hp > 0);
        this.victory = checkVictory(this.units);
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
            resolveSpell(this.map, caster, target, e.spell);
          }
        }
      }
      this.units = this.units.filter(u => u.hp > 0);
      this.victory = checkVictory(this.units);
      this.updateTopbar();
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

    this.renderer.drawUnits(this.units, this.camera, width, height);

    if (this.phase.mode === 'unitSelected' || this.phase.mode === 'actionMenu' ||
        this.phase.mode === 'targetSelect' || this.phase.mode === 'reMove' ||
        this.phase.mode === 'facingConfirm') {
      this.renderer.drawSelectionIndicator(this.phase.unit.position, this.camera);
    }
  };
}