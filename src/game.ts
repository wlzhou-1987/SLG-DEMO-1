import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState, getUnitAt } from './core/unit';
import { axialToPixel, pixelToAxial, isValidHex, distance, hexKey } from './core/hex';
import type { HexCoord } from './core/types';
import { calcMovementRange, calcAttackRange } from './core/range';
import type { SkillTemplate } from './config/units';
import { MAP_OVERRIDES, INITIAL_UNITS } from './config/map';
import { getTemplate } from './config/units';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE } from './render/hex-renderer';
import { InputHandler } from './render/input';
import { updateTopbar } from './ui/topbar';
import { showUnitInfo, clearUnitInfo, showTerrainInfo, clearTerrainInfo } from './ui/sidepanel';
import { showActionMenu, hideActionMenu } from './ui/action-menu';
import { getTerrain } from './core/map';

type Phase =
  | { mode: 'idle' }
  | { mode: 'unitSelected'; unit: UnitState; moveRange: Set<string>; attackRange: Set<string> }
  | { mode: 'actionMenu'; unit: UnitState; originPos: HexCoord }
  | { mode: 'targetSelect'; unit: UnitState; skill: SkillTemplate; originPos: HexCoord; targets: Set<string> };

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private renderer: HexRenderer;
  private phase: Phase = { mode: 'idle' };
  private lastHoverKey = '';
  turn = 1;
  phaseLabel = '玩家';
  map: MapState;
  units: UnitState[];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new HexRenderer(this.ctx);

    this.map = createMapState(MAP_OVERRIDES);
    this.units = INITIAL_UNITS.map(p =>
      createUnitState(p.templateId, p.faction, p.position)
    );

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
          // 移动（含原地待命）；记录出发点供撤销
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
          // 预报与结算在 M3-5 接入；当前回到行动菜单
          this.openActionMenu(this.phase.unit, this.phase.originPos);
        } else {
          // 点空/非目标 = 返回行动菜单
          this.openActionMenu(this.phase.unit, this.phase.originPos);
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
    showActionMenu(screen.x, screen.y, [
      { label: '攻击', value: 'attack' },
      { label: '待机', value: 'wait' },
      { label: '取消', value: 'cancel', kind: 'cancel' }
    ], value => {
      this.onMenuPick(value, unit, originPos);
      this.render();
    });
  }

  private onMenuPick(value: string, unit: UnitState, originPos: HexCoord) {
    switch (value) {
      case 'attack':
        this.showSkillList(unit, originPos);
        break;
      case 'wait':
        this.finishAction(unit);
        break;
      case 'cancel':
        this.undoMove({ mode: 'actionMenu', unit, originPos });
        break;
    }
  }

  private showSkillList(unit: UnitState, originPos: HexCoord) {
    const template = getTemplate(unit.templateId)!;
    const world = axialToPixel(unit.position, HEX_SIZE);
    const screen = this.camera.worldToScreen(world);
    showActionMenu(screen.x, screen.y, [
      ...template.skills.map(s => ({ label: `${s.name}`, value: `skill:${s.name}` })),
      { label: '返回', value: 'back', kind: 'cancel' }
    ], value => {
      if (value === 'back') {
        this.openActionMenu(unit, originPos);
      } else {
        const skill = template.skills.find(s => `skill:${s.name}` === value)!;
        this.enterTargetSelect(unit, skill, originPos);
      }
      this.render();
    });
  }

  private enterTargetSelect(unit: UnitState, skill: SkillTemplate, originPos: HexCoord) {
    const targets = new Set<string>();
    for (const u of this.units) {
      if (u.faction === unit.faction) continue;
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
  }

  private cancelToIdle() {
    hideActionMenu();
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
    updateTopbar(this.turn, this.phaseLabel, playerCount, enemyCount);
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
      this.renderer.drawRangeOverlay(this.phase.targets, this.camera, '#d94a4a', width, height);
    }

    this.renderer.drawUnits(this.units, this.camera, width, height);

    if (this.phase.mode === 'unitSelected' || this.phase.mode === 'actionMenu' || this.phase.mode === 'targetSelect') {
      this.renderer.drawSelectionIndicator(this.phase.unit.position, this.camera);
    }
  };
}
