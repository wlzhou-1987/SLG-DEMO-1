export const MOVE_MS = 240;
export const LUNGE_MS = 200;
export const FLASH_MS = 180;
export const GHOST_MS = 350;
export const APPEAR_MS = 400;
export const STRIKE_GAP_MS = 80;

export interface MoveDelta { dx: number; dy: number }

export interface GhostView {
  label: string;
  color: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

interface MoveTween {
  unitId: string;
  fromX: number; fromY: number;
  startX: number; startY: number;  // 逻辑终点（插值基准）
  startMs: number; durMs: number;
}

interface TimedFx { unitId: string; startMs: number; durMs: number }
interface FlashFx extends TimedFx { kind: 'flash' }
interface AppearFx extends TimedFx { kind: 'appear' }
interface LungeFx extends TimedFx { kind: 'lunge'; dx: number; dy: number }
interface GhostFx { label: string; color: string; worldX: number; worldY: number; startMs: number; durMs: number }

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

/** 单位动画状态机：移动偏移/受击闪烁/登场渐入/阵亡幽灵，随时间自衰减 */
export class Animator {
  private moves: MoveTween[] = [];
  private flashes: FlashFx[] = [];
  private appears: AppearFx[] = [];
  private lunges: LungeFx[] = [];
  private ghostFx: GhostFx[] = [];

  startMove(unitId: string, fromX: number, fromY: number, toX: number, toY: number, now: number, durMs: number = MOVE_MS): void {
    this.moves = this.moves.filter(m => m.unitId !== unitId);
    this.moves.push({ unitId, fromX, fromY, startX: toX, startY: toY, startMs: now, durMs });
  }

  /** 单位视觉偏移（逻辑已在终点，渲染回插到出发点） */
  moveDelta(unitId: string, now: number): MoveDelta | null {
    for (const m of this.moves) {
      if (m.unitId !== unitId) continue;
      const p = (now - m.startMs) / m.durMs;
      if (p >= 1) continue;
      const t = easeOut(Math.max(0, p));
      return { dx: (m.fromX - m.startX) * (1 - t), dy: (m.fromY - m.startY) * (1 - t) };
    }
    return null;
  }

  /** 突进：朝方向 (dx,dy) 往返偏移（攻击前摇） */
  startLunge(unitId: string, dx: number, dy: number, now: number, durMs: number = LUNGE_MS): void {
    this.lunges = this.lunges.filter(l => l.unitId !== unitId);
    this.lunges.push({ kind: 'lunge', unitId, dx, dy, startMs: now, durMs });
  }

  lungeDelta(unitId: string, now: number): MoveDelta | null {
    for (const l of this.lunges) {
      if (l.unitId !== unitId) continue;
      const p = (now - l.startMs) / l.durMs;
      if (p >= 1) return null;
      const amp = Math.sin(Math.PI * Math.max(0, p)) * 0.35;
      return { dx: l.dx * amp, dy: l.dy * amp };
    }
    return null;
  }

  startFlash(unitId: string, now: number, durMs: number = FLASH_MS): void {
    this.flashes = this.flashes.filter(f => f.unitId !== unitId);
    this.flashes.push({ kind: 'flash', unitId, startMs: now, durMs });
  }

  /** 受击闪烁强度 1 → 0 */
  flashAmount(unitId: string, now: number): number {
    for (const f of this.flashes) {
      if (f.unitId !== unitId) continue;
      const p = (now - f.startMs) / f.durMs;
      if (p >= 1) continue;
      return 1 - Math.max(0, p);
    }
    return 0;
  }

  startAppear(unitId: string, now: number, durMs: number = APPEAR_MS): void {
    this.appears = this.appears.filter(f => f.unitId !== unitId);
    this.appears.push({ kind: 'appear', unitId, startMs: now, durMs });
  }

  /** 登场渐入 scale 0 → 1（结束后恒 1） */
  appearScale(unitId: string, now: number): number {
    for (const f of this.appears) {
      if (f.unitId !== unitId) continue;
      const p = (now - f.startMs) / f.durMs;
      if (p >= 1) continue;
      return easeOut(Math.max(0, p));
    }
    return 1;
  }

  startGhost(label: string, color: string, worldX: number, worldY: number, now: number, durMs: number = GHOST_MS): void {
    this.ghostFx.push({ label, color, worldX, worldY, startMs: now, durMs });
  }

  /** 当前可见的阵亡幽灵（缩小+淡出） */
  ghosts(now: number): GhostView[] {
    return this.ghostFx
      .map(g => {
        const p = (now - g.startMs) / g.durMs;
        if (p >= 1) return null;
        const t = Math.max(0, p);
        return { label: g.label, color: g.color, x: g.worldX, y: g.worldY, scale: 1 - 0.4 * t, alpha: 1 - t };
      })
      .filter((g): g is GhostView => g !== null);
  }

  /** 是否有任一动画未完成（驱动渲染循环） */
  active(now: number): boolean {
    const live = (list: TimedFx[]) => list.some(f => now < f.startMs + f.durMs);
    return live(this.moves) || live(this.flashes) || live(this.appears) || live(this.lunges) ||
      this.ghostFx.some(g => now < g.startMs + g.durMs);
  }
}
