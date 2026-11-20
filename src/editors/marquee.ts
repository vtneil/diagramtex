// The block editors' marquee, as the main canvas has it: dragged left to right it takes only what lies wholly inside
// the box; dragged right to left (a crossing marquee, drawn in marker) anything the box touches. Any one frame will
// do (screen px or cm, y either way), as long as the box and the items are in the same one.
type Pt = ArrayLike<number>;
export type Marquee = { x1: number; y1: number; x2: number; y2: number; cross: boolean };
// what an item is drawn as: its points (all inside for the window), its outline's segments (one meeting the box is
// a touch) and its closed areas (the box inside one is a touch too)
export type MarqueeShape = { pts: Pt[]; segs?: [Pt, Pt][]; areas?: Pt[][] };

// the box dragged from (sx, sy) to (x, y)
export function marquee(sx: number, sy: number, x: number, y: number): Marquee {
  return { x1: Math.min(sx, x), y1: Math.min(sy, y), x2: Math.max(sx, x), y2: Math.max(sy, y), cross: x < sx };
}
// the box as the canvas draws it (`.marquee`, `.cross` when crossing), in the frame it is drawn in
export function marqueeSvg(sx: number, sy: number, x: number, y: number) {
  const M = marquee(sx, sy, x, y), r = (n: number) => Math.round(n * 100) / 100;
  return `<rect class="marquee${M.cross ? ' cross' : ''}" x="${r(M.x1)}" y="${r(M.y1)}" width="${r(M.x2 - M.x1)}" height="${r(M.y2 - M.y1)}"/>`;
}
export const inMarquee = (M: Marquee, p: Pt) => p[0] >= M.x1 && p[0] <= M.x2 && p[1] >= M.y1 && p[1] <= M.y2;
// does the segment a-b meet the box? (an end inside, or it crosses one of the four sides)
export function segInMarquee(M: Marquee, a: Pt, b: Pt) {
  if (inMarquee(M, a) || inMarquee(M, b)) return true;
  const X = (p: Pt, q: Pt, r: Pt, s: Pt) => {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (!d) return false;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const c = [[M.x1, M.y1], [M.x2, M.y1], [M.x2, M.y2], [M.x1, M.y2]];
  return c.some((p, i) => X(a, b, p, c[(i + 1) % 4]));
}
// is the point inside the polygon? (even-odd)
function inPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
// a closed outline's sides
export const ring = (poly: Pt[]): [Pt, Pt][] => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
// a box's corners, for an item drawn as a box
export const boxPoly = (x1: number, y1: number, x2: number, y2: number): Pt[] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
// does the marquee take this item?
export function marqueeTakes(M: Marquee, s: MarqueeShape) {
  if (s.pts.length && s.pts.every((p) => inMarquee(M, p))) return true;
  if (!M.cross) return false;
  const areas = s.areas || [];
  return s.pts.some((p) => inMarquee(M, p)) || (s.segs || []).some(([a, b]) => segInMarquee(M, a, b))
    || [...areas.flatMap(ring)].some(([a, b]) => segInMarquee(M, a, b))
    || areas.some((poly) => inPoly([(M.x1 + M.x2) / 2, (M.y1 + M.y2) / 2], poly));
}
// an item drawn as a box: its corners, sides and area
export const boxShape = (x1: number, y1: number, x2: number, y2: number): MarqueeShape => { const p = boxPoly(x1, y1, x2, y2); return { pts: p, areas: [p] }; };
