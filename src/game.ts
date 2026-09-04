import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState, getUnitAt } from './core/unit';
import { axialToPixel, pixelToAxial, isValidHex } from './core/hex';
import { calcMovementRange, calcAttackRange } from './core/range';
import { MAP_OVERRIDES, INITIAL_UNITS } from './config/map';
import { getTemplate } from './config/units';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE } from './render/hex-renderer';
import { InputHandler } from './render/input';
import { updateTopbar } from './ui/topbar';
import { showUnitInfo, clearSidepanel } from './ui/sidepanel';

interface Selection {
  unit: UnitState;
  moveRange: Set<string>;
  attackRange: Set<string>;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private renderer: HexRenderer;
  private selection: Selection | null = null;
  turn = 1;
  phase = '玩家';
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
      onDblClick: (sx, sy) => { this.handleDblClick(sx, sy); this.render(); }
    });

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.fitCamera();
      this.render();
    });
    this.fitCamera();

    this.updateTopbar();
    clearSidepanel();
    this.render();
  }

  private handleClick(screenX: number, screenY: number) {
    const hex = this.screenToHex(screenX, screenY);
    const unit = hex ? getUnitAt(this.units, hex) : undefined;

    if (unit && unit.faction === 'player' && !unit.hasActed) {
      this.selectUnit(unit);
    } else if (unit) {
      // 敌方单位：仅查看信息，不显示范围
      this.selection = null;
      showUnitInfo(unit);
    } else {
      this.selection = null;
      clearSidepanel();
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

    this.selection = { unit, moveRange, attackRange };
    showUnitInfo(unit);
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
    updateTopbar(this.turn, this.phase, playerCount, enemyCount);
  }

  /** 调整画布尺寸跟随容器 */
  private resizeCanvas() {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  /** 初始视野：整幅地图适配屏幕 */
  private fitCamera() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const topLeft = axialToPixel({ q: 0, r: 0 }, HEX_SIZE);
    const bottomRight = axialToPixel(
      { q: this.map.width - 1, r: this.map.height - 1 },
      HEX_SIZE
    );
    const hexWidth = Math.sqrt(3) * HEX_SIZE;
    const mapW = bottomRight.x - topLeft.x + hexWidth;
    const mapH = bottomRight.y - topLeft.y + 2 * HEX_SIZE;

    this.camera.zoom = Math.min(w / mapW, h / mapH, 1);
    this.camera.centerOn(
      (topLeft.x + bottomRight.x) / 2,
      (topLeft.y + bottomRight.y) / 2,
      w,
      h
    );
  }

  /** 按需渲染：状态变更后同步重绘（M2 无动画，不跑常驻 rAF 循环） */
  private render = () => {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#0d0f13';
    this.ctx.fillRect(0, 0, width, height);

    this.renderer.drawTerrain(this.map, this.camera, width, height);
    this.renderer.drawGrid(this.map, this.camera, width, height);

    if (this.selection) {
      this.renderer.drawRangeOverlay(this.selection.moveRange, this.camera, '#4a90d9', width, height);
      this.renderer.drawRangeOverlay(this.selection.attackRange, this.camera, '#d94a4a', width, height);
    }

    this.renderer.drawUnits(this.units, this.camera, width, height);

    if (this.selection) {
      this.renderer.drawSelectionIndicator(this.selection.unit.position, this.camera);
    }
  };
}
