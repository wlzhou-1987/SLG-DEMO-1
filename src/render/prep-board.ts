import type { HexCoord } from '../core/types';
import type { MapState } from '../core/map';
import type { RosterEntry } from '../core/deployment';
import { applyPlacement } from '../core/deployment';
import { DEPLOY_ZONE } from '../config/map';
import { createUnitState } from '../core/unit';
import { axialToPixel, pixelToAxial } from '../core/hex';
import { Camera } from './camera';
import { HexRenderer, HEX_SIZE } from './hex-renderer';
import { InputHandler } from './input';

export interface PrepBoardCallbacks {
  getRoster(): RosterEntry[];
  onChange(next: RosterEntry[]): void;
  onInvalid(target: HexCoord): void;
}

/** 战前画布（§7.0 R1-4）：部署区高亮 + 我方站位显示与点击调整（空格=移动、被占=交换） */
export class PrepBoard {
  private camera = new Camera();
  private renderer: HexRenderer;
  private input: InputHandler;
  private selected: HexCoord | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private map: MapState,
    private cb: PrepBoardCallbacks
  ) {
    this.renderer = new HexRenderer(canvas.getContext('2d')!);
    this.input = new InputHandler(canvas, {
      onClick: (x, y) => { this.handleClick(x, y); this.render(); },
      onDrag: (dx, dy) => { this.camera.pan(dx, dy); this.render(); },
      onWheel: (sx, sy, deltaY) => {
        this.camera.zoomAt(sx, sy, Math.pow(1.1, -deltaY / 100));
        this.render();
      },
      onDblClick: () => {},
      onHover: () => {}
    });
    this.resize();
    const onResize = (): void => { this.resize(); this.centerOnZone(); this.render(); };
    window.addEventListener('resize', onResize);
    this.cleanup = (): void => {
      window.removeEventListener('resize', onResize);
      this.input.dispose();
    };
    this.centerOnZone();
    this.render();
  }

  private cleanup: () => void;

  render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.renderer.drawTerrain(this.map, this.camera, w, h);
    this.renderer.drawGrid(this.map, this.camera, w, h);
    this.renderer.drawRangeOverlay(this.zoneKeys(), this.camera, '#4ade80', w, h);
    const viewUnits = this.cb.getRoster().map(e => createUnitState(e.templateId, 'player', e.position));
    this.renderer.drawUnits(viewUnits, this.camera, w, h);
    if (this.selected) this.renderer.drawSelectionIndicator(this.selected, this.camera);
  }

  handleClick(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld({ x: screenX, y: screenY });
    const hex = pixelToAxial(world.x, world.y, HEX_SIZE);
    const roster = this.cb.getRoster();
    const atHex = roster.findIndex(e => e.position.q === hex.q && e.position.r === hex.r);

    if (this.selected === null) {
      if (atHex !== -1) this.selected = { q: hex.q, r: hex.r };
      return;
    }

    const selIdx = roster.findIndex(
      e => e.position.q === this.selected!.q && e.position.r === this.selected!.r
    );
    if (selIdx === -1) {
      this.selected = null;
      return;
    }
    if (atHex === selIdx) {
      this.selected = null;
      return;
    }
    const next = applyPlacement(roster, selIdx, hex, DEPLOY_ZONE);
    if (next) {
      this.selected = null;
      this.cb.onChange(next);
    } else {
      this.cb.onInvalid(hex);
    }
  }

  dispose(): void {
    this.cleanup();
  }

  private zoneKeys(): Set<string> {
    const keys = new Set<string>();
    for (let r = DEPLOY_ZONE.rMin; r <= DEPLOY_ZONE.rMax; r++) {
      for (let q = DEPLOY_ZONE.qMin; q <= DEPLOY_ZONE.qMax; q++) {
        keys.add(`${q},${r}`);
      }
    }
    return keys;
  }

  private resize(): void {
    const wrap = this.canvas.parentElement!;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  }

  private centerOnZone(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;
    const cx = (DEPLOY_ZONE.qMin + DEPLOY_ZONE.qMax) / 2;
    const cy = (DEPLOY_ZONE.rMin + DEPLOY_ZONE.rMax) / 2;
    const world = axialToPixel({ q: cx, r: cy }, HEX_SIZE);
    this.camera.centerOn(world.x, world.y, w, h);
  }
}
