import type { PixelCoord } from '../core/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private minZoom = 0.3;
  private maxZoom = 2;

  /** 顺滑缩放补间（R19）：目标倍率 + 光标不动点；pan/zoomAt/centerOn 打断 */
  private tween: {
    targetZoom: number;
    anchorScreenX: number;
    anchorScreenY: number;
    anchorWorldX: number;
    anchorWorldY: number;
  } | null = null;

  /** 平移（屏幕像素增量）；拖拽期间终止缩放补间——否则补间每帧按锚点回写位置会与拖拽打架 */
  pan(dx: number, dy: number) {
    this.tween = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** 立即缩放（程序化/测试用；打断进行中的补间） */
  zoomAt(screenX: number, screenY: number, factor: number) {
    this.tween = null;
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));

    // 保持缩放中心点不动
    const worldX = this.screenToWorldX(screenX, oldZoom);
    const worldY = this.screenToWorldY(screenY, oldZoom);
    this.x = worldX - screenX / this.zoom;
    this.y = worldY - screenY / this.zoom;
  }

  /** 设置相机使世界点居中于屏幕（打断进行中的补间） */
  centerOn(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number) {
    this.tween = null;
    this.x = worldX - canvasWidth / (2 * this.zoom);
    this.y = worldY - canvasHeight / (2 * this.zoom);
  }

  /** 滚轮顺滑缩放：设定目标倍率，以屏幕点为不动点逐帧趋近（tick 驱动） */
  setZoomTarget(screenX: number, screenY: number, factor: number) {
    const from = this.tween ? this.tween.targetZoom : this.zoom;
    this.tween = {
      targetZoom: Math.max(this.minZoom, Math.min(this.maxZoom, from * factor)),
      anchorScreenX: screenX,
      anchorScreenY: screenY,
      anchorWorldX: this.screenToWorldX(screenX),
      anchorWorldY: this.screenToWorldY(screenY),
    };
  }

  animating(): boolean {
    return this.tween !== null;
  }

  /** 每帧推进插值（指数趋近，dt 毫秒、封顶 100ms 防空闲后跳变）；返回是否仍在动画 */
  tick(dtMs: number): boolean {
    if (!this.tween) return false;
    const k = 1 - Math.exp(-Math.min(dtMs, 100) / 90);
    const t = this.tween.targetZoom;
    let next = this.zoom + (t - this.zoom) * k;
    if (Math.abs(t - next) < 0.001) next = t;
    this.zoom = next;
    this.x = this.tween.anchorWorldX - this.tween.anchorScreenX / this.zoom;
    this.y = this.tween.anchorWorldY - this.tween.anchorScreenY / this.zoom;
    if (next === t) this.tween = null;
    return this.tween !== null;
  }

  screenToWorldX(screenX: number, zoom = this.zoom): number {
    return screenX / zoom + this.x;
  }

  screenToWorldY(screenY: number, zoom = this.zoom): number {
    return screenY / zoom + this.y;
  }

  worldToScreenX(worldX: number): number {
    return (worldX - this.x) * this.zoom;
  }

  worldToScreenY(worldY: number): number {
    return (worldY - this.y) * this.zoom;
  }

  /** 屏幕坐标转世界坐标 */
  screenToWorld(screen: PixelCoord): PixelCoord {
    return {
      x: this.screenToWorldX(screen.x),
      y: this.screenToWorldY(screen.y),
    };
  }

  /** 世界坐标转屏幕坐标 */
  worldToScreen(world: PixelCoord): PixelCoord {
    return {
      x: this.worldToScreenX(world.x),
      y: this.worldToScreenY(world.y),
    };
  }
}
