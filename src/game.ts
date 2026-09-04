import type { MapState } from './core/map';
import { createMapState } from './core/map';
import type { UnitState } from './core/unit';
import { createUnitState } from './core/unit';
import { axialToPixel } from './core/hex';
import { MAP_OVERRIDES, INITIAL_UNITS } from './config/map';
import { Camera } from './render/camera';
import { HexRenderer, HEX_SIZE } from './render/hex-renderer';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private renderer: HexRenderer;
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

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.fitCamera();
    });
    this.fitCamera();

    this.render();
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

  private render = () => {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = '#0d0f13';
    this.ctx.fillRect(0, 0, width, height);

    this.renderer.drawTerrain(this.map, this.camera, width, height);
    this.renderer.drawGrid(this.map, this.camera, width, height);
    this.renderer.drawUnits(this.units, this.camera, width, height);

    requestAnimationFrame(this.render);
  };
}
