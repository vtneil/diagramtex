// The grid a stage draws under its drawing, on any plane of it: span{u1, u2} through o. `o` is where the plane's
// origin is on the screen and u1, u2 the screen vectors of one unit along the plane's two axes (screen y runs down).
// The block editors' upright centimetre grid is the plain case, u1 = (k, 0) and u2 = (0, −k). A layer of a 3D picture
// passes its projected axes, so the grid, the origin and snapping lie in that plane, in perspective, as the drawing on
// it does. The same calls serve any stage: an editor, or the main canvas.
export type Vec2 = [number, number];
/** a plane as a stage shows it: its origin and one unit along each of its axes, in screen pixels */
export interface Plane { o: Vec2; u1: Vec2; u2: Vec2 }

export interface PlaneGridOptions {
  /** spacings to try, in units, finest first: the first whose lines lie at least `minGap` px apart is drawn, else
   *  the last (default [0.25, 1]) */
  steps?: number[];
  /** a major line every so many units (default 1) */
  major?: number;
  /** the fewest pixels between neighbouring lines (default 7) */
  minGap?: number;
  /** the stage's background under the grid (class cz-bg; default true) */
  bg?: boolean;
  /** the origin's cross, along the plane's axes (default true) */
  origin?: boolean;
}

/** an upright plane: x to the right and y up, kx and ky pixels per unit, its origin at (ox, oy) */
export const uprightPlane = (ox: number, oy: number, kx: number, ky = kx): Plane => ({ o: [ox, oy], u1: [kx, 0], u2: [0, -ky] });

/** the screen point of the plane's point (a, b) */
export const planeToScreen = (P: Plane, a: number, b: number): Vec2 => [P.o[0] + a * P.u1[0] + b * P.u2[0], P.o[1] + a * P.u1[1] + b * P.u2[1]];

/** the plane's point (a, b) under the screen point (X, Y); null when the plane is seen edge on */
export function screenToPlane(P: Plane, X: number, Y: number): Vec2 | null {
  const [p, q] = P.u1, [r, s] = P.u2, det = p * s - q * r;
  if (Math.abs(det) < 1e-9) return null;
  const dx = X - P.o[0], dy = Y - P.o[1];
  return [(dx * s - dy * r) / det, (p * dy - q * dx) / det];
}

/** the grid point (in units, every `step`) nearest the screen point (X, Y), and where it is on the screen */
export function snapOnPlane(P: Plane, X: number, Y: number, step: number): { at: Vec2; screen: Vec2 } | null {
  const ab = screenToPlane(P, X, Y);
  if (!ab) return null;
  const at: Vec2 = [Math.round(ab[0] / step) * step, Math.round(ab[1] / step) * step];
  return { at, screen: planeToScreen(P, at[0], at[1]) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The grid (minor lines cz-gmin, major cz-gmaj) and the origin (cz-origin) on plane P, over a W × H stage, as SVG. */
export function planeGrid(P: Plane, W: number, H: number, { steps = [0.25, 1], major = 1, minGap = 7, bg = true, origin = true }: PlaneGridOptions = {}) {
  const [p, q] = P.u1, [r, s] = P.u2, det = p * s - q * r, [OX, OY] = P.o;
  let out = bg ? `<rect width="${W}" height="${H}" class="cz-bg"/>` : '';
  if (Math.abs(det) < 1e-9) return out; // seen edge on: no grid to draw
  // lines a = const run along u2 and lie |det| / |u2| px apart per unit; lines b = const along u1, |det| / |u1|
  const gap = Math.abs(det) / Math.max(Math.hypot(p, q), Math.hypot(r, s));
  const step = steps.find((x) => gap * x >= minGap) ?? steps[steps.length - 1];
  const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([X, Y]) => screenToPlane(P, X, Y)!);
  const lo = (j: 0 | 1) => Math.min(...corners.map((c) => c[j])), hi = (j: 0 | 1) => Math.max(...corners.map((c) => c[j]));
  const isMajor = (t: number) => Math.abs(t % major) < 1e-6;
  const upright = Math.abs(q) < 1e-9 && Math.abs(r) < 1e-9;
  let minor = '', maj = '';
  for (const j of [0, 1] as const) {
    const from = Math.floor(lo(j) / step), to = Math.ceil(hi(j) / step);
    if (to - from > 4000) continue; // (finer than a pixel: nothing to see)
    for (let i = from; i <= to; i++) {
      const t = i * step;
      let d: string;
      // upright lines land on the pixel grid (crisp); others are drawn across the stage
      if (upright) d = j === 0 ? `M${Math.round(OX + t * p) + 0.5},0V${H}` : `M0,${Math.round(OY + t * s) + 0.5}H${W}`;
      else {
        const [x0, y0] = j === 0 ? planeToScreen(P, t, lo(1)) : planeToScreen(P, lo(0), t), [x1, y1] = j === 0 ? planeToScreen(P, t, hi(1)) : planeToScreen(P, hi(0), t);
        d = `M${r2(x0)},${r2(y0)}L${r2(x1)},${r2(y1)}`;
      }
      if (isMajor(t)) maj += d; else minor += d;
    }
  }
  out += `<path d="${minor}" class="cz-gmin"/><path d="${maj}" class="cz-gmaj"/>`;
  if (origin) {
    if (upright) out += `<path class="cz-origin" d="M${r2(OX - 6)},${r2(OY)}h12M${r2(OX)},${r2(OY - 6)}v12"/>`;
    else {
      const arm = (u: Vec2) => { const n = Math.hypot(u[0], u[1]) || 1, x = (6 * u[0]) / n, y = (6 * u[1]) / n; return `M${r2(OX - x)},${r2(OY - y)}L${r2(OX + x)},${r2(OY + y)}`; };
      out += `<path class="cz-origin" d="${arm(P.u1)}${arm(P.u2)}"/>`;
    }
  }
  return out;
}
