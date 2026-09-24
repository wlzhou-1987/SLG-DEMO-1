import type { HexCoord, Facing } from '../core/types';
import type { UnitState } from '../core/unit';
import type { MapState } from '../core/map';
import type { Camera } from './camera';
import type { Animator, GhostView } from './animator';
import { axialToPixel, hexCorners, facingToAngle } from '../core/hex';
import { getTerrain } from '../core/map';
import { TERRAIN_CONFIGS } from '../config/terrain';
import { TERRAIN_PATTERNS } from './terrain-patterns';
import { terrainArtPath } from '../config/art';
import { SILHOUETTE_SHAPES, getShapeId, BOSS_SHAPE } from './silhouettes';
import { spriteCache } from './sprite-cache';
import type { LoadedImage } from './sprite-cache';
import { artPath } from '../config/art';

export const HEX_SIZE = 30; // 六边形外接圆半径（像素；R18 由 24 调大 25% 应对界面拥挤）

export const FACTION_COLORS = { player: '#4a90d9', enemy: '#d94a4a' } as const;

/** R20 主资源条配色（与阵营环/HP 三档色拉开距离：天蓝/橙/金） */
export const RESOURCE_COLORS = { mp: '#66c2ff', rage: '#ff8c42', focus: '#ffd75e' } as const;

// R9-1 视觉定稿常量（基准 docs/prototypes/r9-visual.html）
const GRID_COLOR = '#1c2128';
const TOKEN_DISK_COLOR = '#20262f';
const SILHOUETTE_COLOR = '#e8eef4';
const BOSS_RING_COLOR = '#ffb347';
const FACING_TRIANGLE_COLOR = '#ffffff';
const FACING_TRIANGLE_STROKE = '#1a1a1a';

export class HexRenderer {
  private ctx: CanvasRenderingContext2D;
  private hexSize = HEX_SIZE;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** 世界坐标系变换（R19）：各层在世界坐标下绘制，格子/棋子/文字随 zoom 等比缩放 */
  applyView(camera: Camera): void {
    this.ctx.save();
    this.ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);
  }

  resetView(): void {
    this.ctx.restore();
  }

  /** 世界系视口包围盒（外扩 2 格余量容纳棋子出露） */
  private viewBounds(camera: Camera, canvasWidth: number, canvasHeight: number) {
    const m = this.hexSize * 2;
    return {
      x0: camera.x - m,
      y0: camera.y - m,
      x1: camera.x + canvasWidth / camera.zoom + m,
      y1: camera.y + canvasHeight / camera.zoom + m,
    };
  }

  /** 绘制地形层 */
  drawTerrain(map: MapState, camera: Camera, canvasWidth: number, canvasHeight: number) {
    const vb = this.viewBounds(camera, canvasWidth, canvasHeight);
    for (let r = 0; r < map.height; r++) {
      for (let q = 0; q < map.width; q++) {
        const world = axialToPixel({ q, r }, this.hexSize);

        // 视口裁剪（世界系）
        if (world.x < vb.x0 || world.x > vb.x1) continue;
        if (world.y < vb.y0 || world.y > vb.y1) continue;

        const terrain = getTerrain(map, { q, r });
        if (terrain === undefined) continue;
        const config = TERRAIN_CONFIGS[terrain];

        this.drawHex(world.x, world.y, config.color, true);
        // R16 地形贴图：就绪时六边形裁切满铺；未登记/加载中/失败回落 R9 矢量图案
        const texture = spriteCache.get(terrainArtPath(terrain));
        if (texture) {
          this.ctx.save();
          this.traceHex(world.x, world.y, this.hexSize);
          this.ctx.clip();
          this.ctx.drawImage(texture as CanvasImageSource, world.x - this.hexSize, world.y - this.hexSize, this.hexSize * 2, this.hexSize * 2);
          this.ctx.restore();
        } else {
          TERRAIN_PATTERNS[terrain](this.ctx, world.x, world.y, this.hexSize);
        }
      }
    }
  }

  /** 绘制网格线 */
  drawGrid(map: MapState, camera: Camera, canvasWidth: number, canvasHeight: number) {
    this.ctx.strokeStyle = GRID_COLOR;
    this.ctx.lineWidth = 1;

    const vb = this.viewBounds(camera, canvasWidth, canvasHeight);
    for (let r = 0; r < map.height; r++) {
      for (let q = 0; q < map.width; q++) {
        const world = axialToPixel({ q, r }, this.hexSize);

        if (world.x < vb.x0 || world.x > vb.x1) continue;
        if (world.y < vb.y0 || world.y > vb.y1) continue;

        this.drawHexOutline(world.x, world.y);
      }
    }
  }

  /** 绘制单位（应用移动偏移/突进/闪烁/登场渐入） */
  drawUnits(
    units: UnitState[],
    camera: Camera,
    canvasWidth: number,
    canvasHeight: number,
    animator?: Animator,
    now: number = performance.now()
  ) {
    const vb = this.viewBounds(camera, canvasWidth, canvasHeight);
    for (const unit of units) {
      const world = axialToPixel(unit.position, this.hexSize);
      let wx = world.x, wy = world.y;
      if (animator) {
        const mv = animator.moveDelta(unit.id, now);
        if (mv) { wx += mv.dx; wy += mv.dy; }
        const lg = animator.lungeDelta(unit.id, now);
        if (lg) { wx += lg.dx; wy += lg.dy; }
        const sh = animator.shakeDelta(unit.id, now);
        if (sh) { wx += sh.dx; wy += sh.dy; }
      }

      if (wx < vb.x0 || wx > vb.x1) continue;
      if (wy < vb.y0 || wy > vb.y1) continue;

      const shapeId = getShapeId(unit.templateId);
      const ringColor = unit.faction === 'player' ? FACTION_COLORS.player : FACTION_COLORS.enemy;
      // R3-8：潜行单位半透明渲染（对己方视角可见的表示，§7.4）
      const stealthed = unit.statuses.some(s => s.type === 'stealth');
      const alpha = unit.hasActed ? 0.5 : stealthed ? 0.45 : 1;
      const appear = animator ? animator.appearScale(unit.id, now) : 1;
      const flash = animator ? animator.flashAmount(unit.id, now) : 0;
      const R = this.hexSize * 0.75 * appear;

      this.ctx.globalAlpha = alpha * appear;
      this.drawToken(wx, wy, R, ringColor, shapeId, this.resolveSprite(unit.templateId));

      // 朝向三角（A 案：盘缘内侧，指向朝向）
      const angle = facingToAngle(unit.facing as Facing) * Math.PI / 180;
      this.drawFacingTriangle(wx, wy, R, angle);

      // HP 条（贴盘下缘，三档色）
      const hpRatio = unit.hp / unit.maxHp;
      const barWidth = R * 1.5;
      const barHeight = 4;
      const barX = wx - barWidth / 2;
      const barY = wy + R + 3;

      this.ctx.fillStyle = '#333333';
      this.ctx.fillRect(barX, barY, barWidth, barHeight);
      this.ctx.fillStyle = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#fbbf24' : '#ef4444';
      this.ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

      // R20 主资源条（HP 条正下方，职业资源：MP/怒气/专注）
      const resRatio = unit.resources.current / unit.resources.max;
      const resY = barY + barHeight + 1;
      const resHeight = 3;
      this.ctx.fillStyle = '#333333';
      this.ctx.fillRect(barX, resY, barWidth, resHeight);
      this.ctx.fillStyle = RESOURCE_COLORS[unit.resources.type];
      this.ctx.fillRect(barX, resY, barWidth * resRatio, resHeight);

      // 状态标记（§7.4：盘上方黄字 + 剩余回合）
      if (unit.statuses.length > 0) {
        const labels = unit.statuses.map(s => {
          if (s.type === 'shield') return `盾${s.absorbLeft}`;
          if (s.type === 'chant') return `咏${s.turnsLeft}`;
          if (s.type === 'regen') return `再${s.turnsLeft}`;
          if (s.type === 'stealth') return '隐';
          return `咒${s.turnsLeft}`;
        });
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillStyle = '#ffd75e';
        this.ctx.fillText(labels.join(' '), wx, wy - R - 6);
      }

      // 受击闪烁：白色圆盘覆盖随强度衰减
      if (flash > 0) {
        this.ctx.globalAlpha = flash;
        this.ctx.beginPath();
        this.ctx.arc(wx, wy, R, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();
      }

      this.ctx.globalAlpha = 1;
    }
  }

  /** 绘制阵亡幽灵（圆盘+剪影，缩小淡出） */
  drawGhosts(ghosts: GhostView[], _camera: Camera) {
    for (const g of ghosts) {
      const R = this.hexSize * 0.75 * g.scale;
      this.ctx.globalAlpha = g.alpha;
      this.drawToken(g.x, g.y, R, g.color, getShapeId(g.templateId), this.resolveSprite(g.templateId));
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

    const vb = this.viewBounds(camera, canvasWidth, canvasHeight);
    for (const key of range) {
      const [qStr, rStr] = key.split(',');
      const pos: HexCoord = { q: parseInt(qStr), r: parseInt(rStr) };
      const world = axialToPixel(pos, this.hexSize);

      if (world.x < vb.x0 || world.x > vb.x1) continue;
      if (world.y < vb.y0 || world.y > vb.y1) continue;

      this.drawHex(world.x, world.y, color, true);
    }

    this.ctx.globalAlpha = 1;
  }

  /** 绘制选中指示器 */
  drawSelectionIndicator(pos: HexCoord, _camera: Camera) {
    const world = axialToPixel(pos, this.hexSize);

    this.ctx.strokeStyle = '#fbbf24';
    this.ctx.lineWidth = 3;
    this.drawHexOutline(world.x, world.y);
  }

  /** R15-4 棋子贴图：登记且已加载才返回（未登记/未就绪/失败均 null → 剪影回落） */
  private resolveSprite(templateId: string): LoadedImage | null {
    return spriteCache.get(artPath('sprite', templateId));
  }

  /** 底座圆盘（R9-1 定稿）：BOSS 金环双圈 + 深盘心 + 阵营色环 + 盘心内剪影/贴图（R15-4） */
  private drawToken(cx: number, cy: number, R: number, ringColor: string, shapeId: string, sprite: LoadedImage | null = null): void {
    if (shapeId === BOSS_SHAPE) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
      this.ctx.lineWidth = R * 0.13;
      this.ctx.strokeStyle = BOSS_RING_COLOR;
      this.ctx.stroke();
    }
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, R, 0, Math.PI * 2);
    this.ctx.fillStyle = TOKEN_DISK_COLOR;
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2);
    this.ctx.lineWidth = R * 0.17;
    this.ctx.strokeStyle = ringColor;
    this.ctx.stroke();

    const inner = R * 0.82;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    this.ctx.clip();
    if (sprite) {
      // R15-4 盘心贴图：方图满铺圆窗（透明底为登记前置条件）
      this.ctx.drawImage(sprite as CanvasImageSource, cx - inner, cy - inner, inner * 2, inner * 2);
    } else {
      this.ctx.translate(cx, cy);
      this.ctx.fillStyle = SILHOUETTE_COLOR;
      this.ctx.strokeStyle = SILHOUETTE_COLOR;
      SILHOUETTE_SHAPES[shapeId](this.ctx, inner * 1.5);
    }
    this.ctx.restore();
  }

  /** 朝向三角（A 案：嵌盘缘内侧，白底深描边，指向朝向） */
  private drawFacingTriangle(cx: number, cy: number, R: number, angle: number): void {
    const c = Math.cos(angle), s = Math.sin(angle);
    const rot = (px: number, py: number): [number, number] => [cx + px * c - py * s, cy + px * s + py * c];
    const apex = rot(R, 0);
    const b1 = rot(R * 0.70, -R * 0.24);
    const b2 = rot(R * 0.70, R * 0.24);
    this.ctx.beginPath();
    this.ctx.moveTo(apex[0], apex[1]);
    this.ctx.lineTo(b1[0], b1[1]);
    this.ctx.lineTo(b2[0], b2[1]);
    this.ctx.closePath();
    this.ctx.fillStyle = FACING_TRIANGLE_COLOR;
    this.ctx.strokeStyle = FACING_TRIANGLE_STROKE;
    this.ctx.lineWidth = 1.5;
    this.ctx.fill();
    this.ctx.stroke();
  }

  private traceHex(cx: number, cy: number, size: number) {
    const corners = hexCorners(cx, cy, size);
    this.ctx.beginPath();
    this.ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      this.ctx.lineTo(corners[i].x, corners[i].y);
    }
    this.ctx.closePath();
  }

  private drawHex(cx: number, cy: number, color: string, fill: boolean, size: number = this.hexSize) {
    this.traceHex(cx, cy, size);

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
