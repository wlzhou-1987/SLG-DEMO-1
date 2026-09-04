import type { HexCoord, Facing } from '../core/types';
import type { UnitState } from '../core/unit';
import type { MapState } from '../core/map';
import type { Camera } from './camera';
import { axialToPixel, hexCorners, facingToAngle } from '../core/hex';
import { getTerrain } from '../core/map';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { getTemplate } from '../config/units';

export const HEX_SIZE = 24; // 六边形外接圆半径（像素）

export class HexRenderer {
  private ctx: CanvasRenderingContext2D;
  private hexSize = HEX_SIZE;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** 绘制地形层 */
  drawTerrain(map: MapState, camera: Camera, canvasWidth: number, canvasHeight: number) {
    for (let r = 0; r < map.height; r++) {
      for (let q = 0; q < map.width; q++) {
        const world = axialToPixel({ q, r }, this.hexSize);
        const screen = camera.worldToScreen(world);

        // 视口裁剪
        if (screen.x < -this.hexSize * 2 || screen.x > canvasWidth + this.hexSize * 2) continue;
        if (screen.y < -this.hexSize * 2 || screen.y > canvasHeight + this.hexSize * 2) continue;

        const terrain = getTerrain(map, { q, r });
        if (terrain === undefined) continue;
        const config = TERRAIN_CONFIGS[terrain];

        this.drawHex(screen.x, screen.y, config.color, true);
      }
    }
  }

  /** 绘制网格线 */
  drawGrid(map: MapState, camera: Camera, canvasWidth: number, canvasHeight: number) {
    this.ctx.strokeStyle = '#1a1a1a';
    this.ctx.lineWidth = 1;

    for (let r = 0; r < map.height; r++) {
      for (let q = 0; q < map.width; q++) {
        const world = axialToPixel({ q, r }, this.hexSize);
        const screen = camera.worldToScreen(world);

        if (screen.x < -this.hexSize * 2 || screen.x > canvasWidth + this.hexSize * 2) continue;
        if (screen.y < -this.hexSize * 2 || screen.y > canvasHeight + this.hexSize * 2) continue;

        this.drawHexOutline(screen.x, screen.y);
      }
    }
  }

  /** 绘制单位 */
  drawUnits(units: UnitState[], camera: Camera, canvasWidth: number, canvasHeight: number) {
    for (const unit of units) {
      const world = axialToPixel(unit.position, this.hexSize);
      const screen = camera.worldToScreen(world);

      if (screen.x < -this.hexSize * 2 || screen.x > canvasWidth + this.hexSize * 2) continue;
      if (screen.y < -this.hexSize * 2 || screen.y > canvasHeight + this.hexSize * 2) continue;

      const template = getTemplate(unit.templateId);
      if (!template) continue;
      const baseColor = unit.faction === 'player' ? '#4a90d9' : '#d94a4a';
      const alpha = unit.hasActed ? 0.5 : 1;

      // 单位底色
      this.ctx.globalAlpha = alpha;
      this.drawHex(screen.x, screen.y, baseColor, true);

      // 兵种首字
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(template.label[0], screen.x, screen.y);

      // 朝向箭头
      const angle = facingToAngle(unit.facing as Facing) * Math.PI / 180;
      const arrowLen = this.hexSize * 0.5;
      const arrowX = screen.x + Math.cos(angle) * arrowLen;
      const arrowY = screen.y + Math.sin(angle) * arrowLen;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(screen.x, screen.y);
      this.ctx.lineTo(arrowX, arrowY);
      this.ctx.stroke();

      // HP 条
      const hpRatio = unit.hp / unit.maxHp;
      const barWidth = this.hexSize * 1.2;
      const barHeight = 4;
      const barX = screen.x - barWidth / 2;
      const barY = screen.y + this.hexSize * 0.7;

      this.ctx.fillStyle = '#333333';
      this.ctx.fillRect(barX, barY, barWidth, barHeight);
      this.ctx.fillStyle = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#fbbf24' : '#ef4444';
      this.ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

      this.ctx.globalAlpha = 1;
    }
  }

  /** 绘制范围覆盖层 */
  drawRangeOverlay(
    range: Set<string>,
    camera: Camera,
    color: string,
    canvasWidth: number,
    canvasHeight: number
  ) {
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.3;

    for (const key of range) {
      const [qStr, rStr] = key.split(',');
      const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
      const world = axialToPixel(pos, this.hexSize);
      const screen = camera.worldToScreen(world);

      if (screen.x < -this.hexSize * 2 || screen.x > canvasWidth + this.hexSize * 2) continue;
      if (screen.y < -this.hexSize * 2 || screen.y > canvasHeight + this.hexSize * 2) continue;

      this.drawHex(screen.x, screen.y, color, true);
    }

    this.ctx.globalAlpha = 1;
  }

  /** 绘制选中指示器 */
  drawSelectionIndicator(pos: HexCoord, camera: Camera) {
    const world = axialToPixel(pos, this.hexSize);
    const screen = camera.worldToScreen(world);

    this.ctx.strokeStyle = '#fbbf24';
    this.ctx.lineWidth = 3;
    this.drawHexOutline(screen.x, screen.y);
  }

  private drawHex(cx: number, cy: number, color: string, fill: boolean) {
    const corners = hexCorners(cx, cy, this.hexSize);
    this.ctx.beginPath();
    this.ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      this.ctx.lineTo(corners[i].x, corners[i].y);
    }
    this.ctx.closePath();

    if (fill) {
      this.ctx.fillStyle = color;
      this.ctx.fill();
    } else {
      this.ctx.strokeStyle = color;
      this.ctx.stroke();
    }
  }

  private drawHexOutline(cx: number, cy: number) {
    const corners = hexCorners(cx, cy, this.hexSize);
    this.ctx.beginPath();
    this.ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      this.ctx.lineTo(corners[i].x, corners[i].y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }
}
