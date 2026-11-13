// Insert and delete icons for grids of rows and columns: the quantum editor's wires and steps, the Table's rows
// and columns. Three blocks; the one an action makes or removes stands out, filled, offset to where it goes.
// Insert: a filled block first (before / above) or last (after / below). Delete: the middle one with a
// knocked-out ×. Columns are the rows' icons transposed.
function blocks(at: number, del: boolean, cols: boolean) {
  const P = (x: number, y: number) => { const r = (v: number) => +v.toFixed(2); return cols ? `${r(y)},${r(x)}` : `${r(x)},${r(y)}`; };
  const box = (x: number, y: number, w: number, h: number) => `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`;
  const out = (x: number, y: number, w: number, h: number) => `<path class="qo" d="${box(x + 0.5, y + 0.5, w - 1, h - 1)}"/>`;
  const solid = (d: string) => `<path class="qf" fill-rule="evenodd" d="${d}"/>`;
  if (del) {
    const a = 2.6, t = 0.75, k = Math.SQRT1_2, cx = 12, cy = 10;
    const arm = [[t, a], [t, t], [a, t], [a, -t], [t, -t], [t, -a], [-t, -a], [-t, -t], [-a, -t], [-a, t], [-t, t], [-t, a]]
      .map(([x, y], i) => `${i ? 'L' : 'M'}${P(cx + (x - y) * k, cy + (x + y) * k)}`).join('') + 'Z';
    return out(1.5, 1, 12, 4) + out(1.5, 15, 12, 4) + solid(box(5.5, 6.5, 13, 7) + arm);
  }
  return [1.5, 8, 14.5].map((y, i) => (i === at ? solid(box(6.5, y, 12, 4)) : out(1.5, y, 12, 4))).join('');
}
/** above / below / rowdel (rows), before / after / coldel (columns) */
export const GRID_ICON_PATHS: Record<string, string> = {
  above: blocks(0, false, false), below: blocks(2, false, false), rowdel: blocks(0, true, false),
  before: blocks(0, false, true), after: blocks(2, false, true), coldel: blocks(0, true, true),
};
export const gridIcon = (k: string) => `<svg viewBox="0 0 20 20" class="qe-ic" aria-hidden="true">${GRID_ICON_PATHS[k]}</svg>`;
