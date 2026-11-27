import { snapOnPlane, type Plane } from './plane-grid';
export type GridStyle = 'grid' | 'dot' | 'isometric' | 'isometric-dot' | 'oblique';
/** the styles every grid track offers (the main canvas adds 'oblique') */
export const GRID_STYLES: GridStyle[] = ['grid', 'dot', 'isometric', 'isometric-dot'];
export const CANVAS_GRID_STYLES: GridStyle[] = [...GRID_STYLES, 'oblique'];
/** the oblique grid's axes, in degrees as TikZ measures them (anticlockwise from x): span{u1, u2} */
export type GridAxes = [number, number];
export const GRID_AXES_PRESETS: GridAxes[] = [[0, 45], [30, 150], [0, 60]];
/** the canvas plane (px, y down) of an oblique grid: one px along each axis, from the origin */
export function obliquePlane([a, b]: GridAxes, unit = 1): Plane {
  const r = Math.PI / 180;
  return { o: [0, 0], u1: [Math.cos(a * r) * unit, -Math.sin(a * r) * unit], u2: [Math.cos(b * r) * unit, -Math.sin(b * r) * unit] };
}
export function snapCanvasGrid(p: { x: number; y: number }, step: number, style: GridStyle, axes: GridAxes = [0, 45]) {
  if (style === 'oblique') { const s = snapOnPlane(obliquePlane(axes), p.x, p.y, step); return s ? { x: s.screen[0], y: s.screen[1] } : { x: p.x, y: p.y }; }
  if (!style.startsWith('isometric')) return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
  const pitch = Math.sqrt(3) * step / 2, column = Math.round(p.x / pitch);
  let best = { x: 0, y: 0 }, distance = Infinity;
  for (let c = column - 1; c <= column + 1; c++) {
    const offset = ((c % 2 + 2) % 2) * step / 2;
    const q = { x: c * pitch, y: Math.round((p.y - offset) / step) * step + offset };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < distance) { distance = d; best = q; }
  }
  return best;
}
