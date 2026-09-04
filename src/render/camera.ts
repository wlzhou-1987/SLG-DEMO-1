import type { PixelCoord } from '../core/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private minZoom = 0.3;
  private maxZoom = 2;

  /** 平移（屏幕像素增量） */
  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** 缩放（以屏幕点为中心） */
  zoomAt(screenX: number, screenY: number, factor: number) {
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));

    // 保持缩放中心点不动
    const worldX = this.screenToWorldX(screenX, oldZoom);
    const worldY = this.screenToWorldY(screenY, oldZoom);
    this.x = worldX - screenX / this.zoom;
    this.y = worldY - screenY / this.zoom;
  }

  /** 设置相机使世界点居中于屏幕 */
  centerOn(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number) {
    this.x = worldX - canvasWidth / (2 * this.zoom);
    this.y = worldY - canvasHeight / (2 * this.zoom);
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
