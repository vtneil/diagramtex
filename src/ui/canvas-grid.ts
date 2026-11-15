export type GridStyle = 'grid' | 'dot' | 'isometric' | 'isometric-dot';
export const GRID_STYLES: GridStyle[] = ['grid', 'dot', 'isometric', 'isometric-dot'];
export function snapCanvasGrid(p: { x: number; y: number }, step: number, style: GridStyle) {
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
