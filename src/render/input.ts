export interface InputCallbacks {
  /** 点击（未拖动的按下-抬起），坐标为画布内像素 */
  onClick(screenX: number, screenY: number): void;
  /** 拖动增量（屏幕像素） */
  onDrag(dxScreen: number, dyScreen: number): void;
  /** 滚轮缩放，坐标为画布内像素 */
  onWheel(screenX: number, screenY: number, deltaY: number): void;
  /** 双击（画布内像素） */
  onDblClick(screenX: number, screenY: number): void;
  /** 悬停（无按键时的移动，画布内像素） */
  onHover(screenX: number, screenY: number): void;
}

const DRAG_THRESHOLD = 5;

export class InputHandler {
  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    let pointerDown = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;

    canvas.addEventListener('mousedown', e => {
      pointerDown = true;
      dragging = false;
      lastX = startX = e.offsetX;
      lastY = startY = e.offsetY;
    });

    window.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!pointerDown) {
        callbacks.onHover(x, y);
        return;
      }

      const dx = x - lastX;
      const dy = y - lastY;

      if (!dragging) {
        const distSq = (x - startX) ** 2 + (y - startY) ** 2;
        if (distSq > DRAG_THRESHOLD * DRAG_THRESHOLD) dragging = true;
      }
      if (dragging) {
        callbacks.onDrag(dx, dy);
      }
      lastX = x;
      lastY = y;
    });

    window.addEventListener('mouseup', e => {
      if (!pointerDown) return;
      pointerDown = false;
      if (dragging) return;

      const rect = canvas.getBoundingClientRect();
      callbacks.onClick(e.clientX - rect.left, e.clientY - rect.top);
    });

    canvas.addEventListener('dblclick', e => {
      callbacks.onDblClick(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      callbacks.onWheel(e.offsetX, e.offsetY, e.deltaY);
    }, { passive: false });
  }
}
