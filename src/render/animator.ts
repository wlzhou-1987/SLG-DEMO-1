export const STEP_MOVE_MS = 120;
export const LUNGE_MS = 200;
export const FLASH_MS = 180;
export const SHAKE_MS = 200;
export const SHAKE_AMP = 3;
export const GHOST_MS = 350;
export const APPEAR_MS = 400;
export const STRIKE_GAP_MS = 80;

export interface MoveDelta { dx: number; dy: number }
export interface Point { x: number; y: number }

export interface GhostView {
  templateId: string;
  color: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

interface MoveTween {
  unitId: string;
  points: Point[];  // 途经点序列（首=出发点，尾=逻辑终点）
  startMs: number;
  segMs: number;
}

interface TimedFx { unitId: string; startMs: number; durMs: number }
interface FlashFx extends TimedFx { kind: 'flash' }
interface AppearFx extends TimedFx { kind: 'appear' }
interface ShakeFx extends TimedFx { kind: 'shake' }
interface LungeFx extends TimedFx { kind: 'lunge'; dx: number; dy: number }
interface GhostFx { templateId: string; color: string; worldX: number; worldY: number; startMs: number; durMs: number }

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const SHAKE_TURNS = 3;

/** 单位动画状态机：逐格移动/受击抖动闪烁/突进/登场渐入/阵亡幽灵，随时间自衰减 */
export class Animator {
  private moves: MoveTween[] = [];
  private flashes: FlashFx[] = [];
  private shakes: ShakeFx[] = [];
  private appears: AppearFx[] = [];
  private lunges: LungeFx[] = [];
  private ghostFx: GhostFx[] = [];

  /** 逐格移动：points 为途经点序列（含起终点），每段 segMs；返回总时长 */
  startMove(unitId: string, points: Point[], now: number, segMs: number = STEP_MOVE_MS): number {
    this.moves = this.moves.filter(m => m.unitId !== unitId);
    this.moves.push({ unitId, points, startMs: now, segMs });
    return Math.max(0, points.length - 1) * segMs;
  }

  /** 单位视觉偏移（逻辑已在终点，渲染沿途经点逐格回插） */
  moveDelta(unitId: string, now: number): MoveDelta | null {
    for (const m of this.moves) {
      if (m.unitId !== unitId) continue;
      const segIdx = Math.floor((now - m.startMs) / m.segMs);
      if (segIdx >= m.points.length - 1) continue;
      const t = easeOut(Math.max(0, (now - m.startMs - segIdx * m.segMs) / m.segMs));
      const a = m.points[segIdx];
      const b = m.points[segIdx + 1];
      const last = m.points[m.points.length - 1];
      return { dx: a.x + (b.x - a.x) * t - last.x, dy: a.y + (b.y - a.y) * t - last.y };
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

  startShake(unitId: string, now: number, durMs: number = SHAKE_MS): void {
    this.shakes = this.shakes.filter(f => f.unitId !== unitId);
    this.shakes.push({ kind: 'shake', unitId, startMs: now, durMs });
  }

  /** 受击抖动：幅度线性衰减的圆周偏移（确定性，无随机） */
  shakeDelta(unitId: string, now: number): MoveDelta | null {
    for (const s of this.shakes) {
      if (s.unitId !== unitId) continue;
      const p = (now - s.startMs) / s.durMs;
      if (p >= 1) return null;
      const t = Math.max(0, p);
      const amp = SHAKE_AMP * (1 - t);
      const angle = SHAKE_TURNS * 2 * Math.PI * t;
      return { dx: amp * Math.sin(angle), dy: amp * Math.cos(angle) };
    }
    return null;
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

  startGhost(templateId: string, color: string, worldX: number, worldY: number, now: number, durMs: number = GHOST_MS): void {
    this.ghostFx.push({ templateId, color, worldX, worldY, startMs: now, durMs });
  }

  /** 当前可见的阵亡幽灵（缩小+淡出） */
  ghosts(now: number): GhostView[] {
    return this.ghostFx
      .map(g => {
        const p = (now - g.startMs) / g.durMs;
        if (p >= 1) return null;
        const t = Math.max(0, p);
        return { templateId: g.templateId, color: g.color, x: g.worldX, y: g.worldY, scale: 1 - 0.4 * t, alpha: 1 - t };
      })
      .filter((g): g is GhostView => g !== null);
  }

  /** 是否有任一动画未完成（驱动渲染循环） */
  active(now: number): boolean {
    const live = (list: TimedFx[]) => list.some(f => now < f.startMs + f.durMs);
    const moveLive = this.moves.some(m => now < m.startMs + Math.max(0, m.points.length - 1) * m.segMs);
    return moveLive || live(this.flashes) || live(this.shakes) || live(this.appears) || live(this.lunges) ||
      this.ghostFx.some(g => now < g.startMs + g.durMs);
  }
}
