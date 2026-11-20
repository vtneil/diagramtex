// The drawing area every block editor shares: where the pointer is on it, the mouse wheel (pan, and zoom with
// Ctrl/⌘ or a trackpad pinch, about the pointer), and fitting a drawing in view. What an editor draws, and the
// bounds of its drawing, stay its own.
import { wheelZoomFactor } from '../ui/wheel-zoom';

/** An editor's camera: a point (x, y) of the drawing is shown at (ox + x·k, oy + y·k) on the stage. */
export interface StageView { k: number; ox: number; oy: number }

interface StageHooks {
  /** the camera while the editor is open (null when it is closed) */
  view(): StageView | null;
  /** the closest and farthest zoom (k) the wheel may reach */
  zoom: [min: number, max: number];
  /** draw again after the wheel moved the camera (and re-place anything pinned to the drawing, such as a label popup) */
  redraw(): void;
  /** before the wheel moves the camera (the Quantum editor stops fitting the circuit on each edit) */
  beforeWheel?(): void;
}

/**
 * The stage's helpers for an editor whose drawing is `svg` inside `stage`: `rect` and `pos` (the pointer in the
 * drawing's box), `overStage` (the pointer over the stage, for a drag from the palette). The wheel is handled here.
 */
export function editorStage(svg: Element, stage: Element, { view, zoom: [min, max], redraw, beforeWheel }: StageHooks) {
  const rect = () => svg.getBoundingClientRect();
  const pos = (e: { clientX: number; clientY: number }) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const overStage = (e: { clientX: number; clientY: number }) => {
    const r = stage.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  svg.addEventListener('wheel', (event) => {
    const e = event as WheelEvent;
    e.preventDefault();
    const v = view();
    if (!v) return;
    beforeWheel?.();
    if (e.ctrlKey || e.metaKey) {
      const [sx, sy] = pos(e), k = Math.max(min, Math.min(max, v.k * wheelZoomFactor(e)));
      v.ox = sx - ((sx - v.ox) * k) / v.k; v.oy = sy - ((sy - v.oy) * k) / v.k; v.k = k;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    redraw();
  }, { passive: false });
  return { rect, pos, overStage };
}

interface FitOptions {
  /** the closest and farthest zoom (k) a fit may choose */
  min: number;
  max: number;
  /** units of the box per unit of k (a layout in points drawn at k pixels per centimetre passes its points per cm) */
  scale?: number;
  /** room round the box on every side, in the same units as k (after scale) */
  margin?: number;
  /** room left round the drawing on the stage, in pixels, across both sides */
  pad?: number;
  /** pixels kept free under the drawing (the Timing editor's add-row buttons) */
  below?: number;
}

/**
 * The camera that shows `box` (x, y, w, h, with y down the stage) whole and centred on a stage of `area`'s size, its
 * zoom kept within min and max.
 */
export function fitView(area: { width: number; height: number }, box: { x: number; y: number; w: number; h: number }, { min, max, scale = 1, margin = 0, pad = 80, below = 0 }: FitOptions): StageView {
  const w = box.w / scale + 2 * margin, h = box.h / scale + 2 * margin;
  const cx = (box.x + box.w / 2) / scale, cy = (box.y + box.h / 2) / scale;
  const k = Math.max(min, Math.min(max, Math.min((area.width - pad) / w, (area.height - pad - below) / h)));
  return { k, ox: area.width / 2 - cx * k, oy: (area.height - below) / 2 - cy * k };
}
