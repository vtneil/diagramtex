import { runtime as TD } from '../runtime';
// tkz-euclide (5.x) in a picture: each command read as the TikZ it expands to, so its drawing is shapes the app holds
// (src/domain/tikzimport.ts reads the TikZ written here as the command's own statement). Points are coordinates
// (\tkzDefPoint is \coordinate at (x', y'), x' = (x − origin)/step of the \tkzInit frame), so plain TikZ in the same
// picture finds them; constructions (\tkzInterLL, \tkzDefPointBy …) compute in the picture's frame in pt, as
// \pgfpointanchor gives it, and leave tkzPointResult (or the first and second results) for \tkzGetPoint(s). Drawings
// take tkz-euclide.cfg's styles: lines 0.2pt black with round caps (polygons round joins too), circles black!50,
// arcs black 0.2pt with butt caps, points a 2pt circle drawn black and filled black!10, labels below in \normalsize.
// Measured against pdfLaTeX (tkz-euclide 5.14c). A command, or an option, this can't hold exactly stays as code.
const K = TD.PT_PER_PX, PX = TD.PX_PER_CM;
const CM = 72.27 / 2.54; // pt per cm (28.45274)
const f = (n: number) => { const v = Math.round(n * 1e5) / 1e5; return Object.is(v, -0) ? '0' : String(v); };
const P = (p: Pt) => `(${f(p.x)}pt,${f(p.y)}pt)`;
type Pt = { x: number, y: number };
const add = (a: Pt, b: Pt) => ({ x: a.x + b.x, y: a.y + b.y }), sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number) => ({ x: a.x * k, y: a.y * k }), norm = (a: Pt) => Math.hypot(a.x, a.y);
const rot = (a: Pt, deg: number) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }; };
// \pgfmathanglebetweenpoints: the slope of a→b in [0, 360)
const slope = (a: Pt, b: Pt) => { let t = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (t < 0) t += 360; return t; };
// \tkzNormalizeAngle: the arc from the first to the second runs counter-clockwise
function normAngles(a: number, b: number) {
  if (a > 0) { if (a > b) a -= 360; } else if (a > b) b += 360;
  return [a, b];
}

// ---------- l3fp (\fpeval), as \tkzDefPoint and \tkzInit read numbers: trig in radians, sind … in degrees ----------
const FP_CONST: Record<string, number> = { pi: Math.PI, deg: Math.PI / 180, pt: 1, cm: CM, mm: CM / 10, in: 72.27, bp: 72.27 / 72, pc: 12, true: 1, false: 0 };
const D = Math.PI / 180;
const FP_FN: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: (a) => 1 / Math.tan(a), sec: (a) => 1 / Math.cos(a), csc: (a) => 1 / Math.sin(a),
  sind: (a) => Math.sin(a * D), cosd: (a) => Math.cos(a * D), tand: (a) => Math.tan(a * D), cotd: (a) => 1 / Math.tan(a * D),
  asin: Math.asin, acos: Math.acos, atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
  asind: (a) => Math.asin(a) / D, acosd: (a) => Math.acos(a) / D, atand: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)) / D,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, sign: Math.sign, trunc: Math.trunc, ceil: Math.ceil, floor: Math.floor,
  round: (a, n = 0) => { const k = 10 ** n; return Math.round(a * k) / k; }, max: Math.max, min: Math.min,
};
export function fpEval(src: string): number {
  const s = String(src).replace(/\s+/g, '');
  let i = 0;
  const fail = () => { throw new Error('fp'); };
  const atom = (): number => {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') fail(); i++; return v; }
    const n = /^(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(s.slice(i));
    if (n) { i += n[0].length; return parseFloat(n[0]); }
    const w = /^[a-z]+/i.exec(s.slice(i));
    if (!w) return fail();
    i += w[0].length;
    if (s[i] === '(' && FP_FN[w[0]]) {
      i++;
      const args = [expr()];
      while (s[i] === ',') { i++; args.push(expr()); }
      if (s[i] !== ')') fail();
      i++;
      return FP_FN[w[0]](...args);
    }
    if (w[0] in FP_CONST) return FP_CONST[w[0]];
    return fail();
  };
  // ^ binds tighter than a sign (−2^2 = −4) and to the right; juxtaposition (2pi, 3sqrt(2)) before * and /
  const pow = (): number => { const b = atom(); if (s[i] === '^' || s.startsWith('**', i)) { i += s[i] === '^' ? 1 : 2; return b ** unary(); } return b; };
  const unary = (): number => { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return juxt(); };
  const juxt = (): number => { let v = pow(); while (i < s.length && /[a-z(.\d]/i.test(s[i])) v *= pow(); return v; };
  const term = (): number => { let v = unary(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = unary(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = (): number => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try { const v = expr(); return i === s.length ? v : NaN; } catch { return NaN; }
}

// ---------- reading a command's arguments ----------
type Arg = { k: '[' | '(' | '{', s: string, o: string };
// options as written: [{ raw, k, v }] at top-level commas
function items(X: any, str: string) {
  return X.splitTop(str, ',').map((x: string) => x.trim()).filter(Boolean).map((raw: string) => {
    const eq = X.splitTop(raw, '=');
    return { raw, k: eq[0].trim().replace(/\s+/g, ' '), v: eq.length > 1 ? eq.slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1').trim() : null };
  });
}
const W: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
// the line width (pt) a list of options leaves, from `from`
function widthOf(X: any, list: any[], from: number) {
  let w = from;
  for (const o of list) {
    if (o.v == null && W[o.k] != null) w = W[o.k];
    else if (o.k === 'line width' && o.v != null) { const d = X.len(o.v, 'pt') * K; if (Number.isFinite(d)) w = d; }
  }
  return w;
}

/** The handlers' context: the picture (C), the importer's helpers (X) and what a handler reports. */
class Ctx {
  issues: string[] = [];
  out: string[] = [];
  clip = false;
  constructor(public X: any, public C: any, public name: string) {}
  get st() { return (this.C.tkz ||= { init: initFrame({}), res: null }); }
  why(w: string) { this.issues.push(w); return null; }
  // a point by name, in the picture's frame (pt, y up): \pgfpointanchor{…}{center}
  pt(nm: string): Pt | null {
    const n = clean(nm);
    if (!n) return this.why(`\\${this.name}: an empty point`);
    if (this.C.unresolved?.has(n) || !this.C.names?.[n]) return this.why(`Unresolved node or coordinate (${n})`);
    if (this.C.approx?.has(n)) return this.why(`(${n}) is placed approximately`);
    const q = this.X.coord(n);
    if (!q) return this.why(`Unresolved node or coordinate (${n})`);
    return { x: q.x * K, y: -q.y * K };
  }
  pts(list: string[]) { const r = list.map((n) => this.pt(n)); return r.every(Boolean) ? (r as Pt[]) : null; }
  // a coordinate (A) written by name: a point TikZ reaches at its centre (a node would be met at its border)
  isCoord(nm: string) { return (this.C.kinds || {})[clean(nm)] === 'coordinate'; }
  // a length (pt): a number (an expression, macros in it) and its unit, else TikZ's reading of it
  hasUnit(v: string | null | undefined) { return /(cm|mm|pt|in|bp|em|ex)\s*$/.test(this.X.expand(String(v ?? '')).trim()); }
  len(v: string | null | undefined) {
    const e = this.X.expand(String(v ?? '')).trim(), m = /^([\s\S]*?)\s*(cm|mm|pt|in|bp|em|ex)$/.exec(e);
    const U: Record<string, number> = { cm: CM, mm: CM / 10, pt: 1, in: 72.27, bp: 72.27 / 72, em: 10, ex: 4.30554 };
    if (m && m[1].trim()) { const n = this.X.num(m[1]); if (Number.isFinite(n)) return n * U[m[2]]; }
    return this.X.len(e, 'pt') * K;
  }
  num(v: string | null | undefined, dflt = NaN) { if (v == null || v === '') return dflt; const n = this.X.num(v); return Number.isFinite(n) ? n : NaN; }
  fp(v: string) { return fpEval(this.X.expand(v)); }
  // a construction's results: tkzPointResult, tkzFirstPointResult, tkzSecondPointResult
  result(p: Pt | null, first?: Pt | null, second?: Pt | null) {
    this.st.res = { p, first, second };
    for (const [nm, q] of [['tkzPointResult', p], ['tkzFirstPointResult', first], ['tkzSecondPointResult', second]] as [string, Pt | null | undefined][]) {
      if (q) this.X.setName(nm, { x: q.x / K, y: -q.y / K }); else if (q === null) this.X.dropName(nm);
    }
  }
  // what one xy unit is in cm when x= and y= are the same length along their axes (1 by default), else NaN: tkz
  // places some results and radii as xy numbers of cm, so LaTeX's land that many times further
  unitK() {
    const vx = this.C.vx || [PX, 0], vy = this.C.vy || [0, PX];
    return Math.abs(vx[1]) < 1e-9 && Math.abs(vy[0]) < 1e-9 && vx[0] > 0 && Math.abs(vx[0] - vy[1]) < 1e-9 ? vx[0] / PX : NaN;
  }
  plainUnits() { return Number.isFinite(this.unitK()); }
  // a scope that scales: nodes keep their own size there
  // the scopes' scale along both axes (NaN under xscale or yscale): a decoration's mark keeps its own size on the page
  scaleOf() { let s = 1; for (const L of this.C.scopes || []) for (const t of L.xf || []) { if (t.sx !== undefined) return NaN; if (t.scale !== undefined) s *= t.scale; } return s; }
  // the scopes' scale, when it is the same along both axes (or transform shape takes it whole): else NaN
  nodeScale() {
    let s = 1;
    if ((this.C.scopes || []).some((L: any) => L.shape)) return 1;
    for (const L of this.C.scopes || []) {
      for (const t of L.xf || []) { if (t.sx !== undefined) return NaN; if (t.scale !== undefined) s *= t.scale; }
    }
    return s;
  }
  // the line width the picture's and scopes' options leave (what \pgflinewidth is in a tkz command)
  baseWidth() { return widthOf(this.X, this.C.base || [], 0.4); }
  // a tkz-euclide style as the document leaves it: '' untouched (tkz-euclide.cfg's, written here), its name when only
  // appended to (\tikzset{line style/.append style=…}: cfg's keys, then those; the importer holds such a style as
  // ",keys"), else null and why (.style, or \tkzSetUp…, redefines it)
  styleOf(nm: string, append = false): string | null {
    const v = this.C.styles?.get(nm);
    if (v == null) return '';
    if (append && /^\s*,/.test(v)) return nm;
    return this.why(`\\${this.name}: ${nm} is redefined`);
  }
}

// the \tkzInit frame: xmin … ystep as given (defaults 0, 10, 1), each axis moved to its min when both ends have the
// same sign; xa … yb the clip rectangle (\tkz@xa = xmin/xstep after the move); keys what the next \tkzInit starts
// from (its keys are stored, the moved ends with them: xmin 0, xmax xmax − xmin)
function initFrame(k: Record<string, number>) {
  const g = (n: string, d: number) => (Number.isFinite(k[n]) ? k[n] : d);
  let xmin = g('xmin', 0), xmax = g('xmax', 10), ymin = g('ymin', 0), ymax = g('ymax', 10);
  const xstep = g('xstep', 1), ystep = g('ystep', 1);
  let xo = 0, yo = 0;
  if (Math.sign(xmin) === Math.sign(xmax)) { xmax -= xmin; xo = xmin; xmin = 0; }
  if (Math.sign(ymin) === Math.sign(ymax)) { ymax -= ymin; yo = ymin; ymin = 0; }
  return {
    xo, yo, xstep, ystep, xa: xmin / xstep, xb: xmax / xstep, ya: ymin / ystep, yb: ymax / ystep,
    raw: { xmin: g('xmin', 0), xmax: g('xmax', 10), ymin: g('ymin', 0), ymax: g('ymax', 10) },
    keys: { xmin, xmax, ymin, ymax, xstep, ystep } as Record<string, number>,
  };
}

// a name as \foreach hands it over ({A}: the braces are TeX's grouping)
const clean = (n: string) => String(n).trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
// a comma list as \foreach reads it: 0,...,99 and 1,3,...,9 are the numbers between
function list(X: any, s: string) {
  const L: string[] = X.splitTop(s, ',').map(clean).filter(Boolean), out: string[] = [];
  for (let k = 0; k < L.length; k++) {
    if (L[k] !== '...' || !out.length || k + 1 >= L.length) { out.push(L[k]); continue; }
    const a = +out[out.length - 1], b = +L[k + 1], prev = out.length > 1 ? +out[out.length - 2] : NaN;
    const step = Number.isFinite(prev) && out.length > 1 && /^-?\d/.test(out[out.length - 2]) ? a - prev : (b >= a ? 1 : -1);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !step || (b - a) / step > 1000) { out.push(L[k]); continue; }
    for (let v = a + step; step > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += step) out.push(f(v));
    k++;
  }
  return out;
}
// space-separated groups (\tkzDrawSegments(A,B C,D)), each split at its commas
const groups = (X: any, s: string) => s.trim().split(/\s+/).filter(Boolean).map((g) => list(X, g));
const opt = (L: any[]) => L.map((o) => o.raw).join(', ');
const join = (...a: string[]) => a.filter(Boolean).join(', ');

// tkz-euclide's styles (tkz-euclide.cfg)
const LINE = 'line width=0.2pt, color=black, solid, line cap=round';
const CIRCLE = 'color=black!50, line width=0.2pt, solid';
const ARC = 'color=black, line width=0.2pt';
const LABEL = 'below, black, font=\\normalsize';

// plot marks (pgf's and tkz-lib-eu-marks.tex): strokes in the mark's frame (x along the path), s the mark size
// and w the line width, in pt
function plotMark(m: string, s: number, w: number): [number, number, number, number][] | null {
  const r = 0.70710678 * s;
  switch (m) {
    case '|': return [[0, s, 0, -s]];
    case '||': return [[2 * w, s, 2 * w, -s], [-2 * w, s, -2 * w, -s]];
    case '|||': return [[0, s, 0, -s], [-3 * w, s, -3 * w, -s], [3 * w, s, 3 * w, -s]];
    case 's|': return [[-r, -r, r, r]];
    case 's||': return [[-0.75 * s, -s, 0.25 * s, s], [0, -s, s, s]];
    case 's|||': return [[-0.75 * s, -s, 0.25 * s, s], [0, -s, s, s], [0.75 * s, -s, 1.75 * s, s]];
    case 'x': return [[-r, -r, r, r], [-r, r, r, -r]];
    case '+': return [[-s, 0, s, 0], [0, -s, 0, s]];
    case '-': return [[-s, 0, s, 0]];
    default: return null;
  }
}

type Handler = (c: Ctx, a: Arg[]) => void;
const H: Record<string, [string, Handler]> = {};
// each command: its arguments ([ and o (a parenthesis) optional; ( and { required, in order) and what it does
const def = (names: string, sig: string, h: Handler) => { for (const n of names.split(' ')) H[n] = [sig, h]; };

// ---------- points ----------
function defPoint(c: Ctx, o: string, xy: string, nm: string) {
  const I = c.st.init, parts = c.X.splitTop(xy, ',');
  let x: number, y: number;
  if (parts.length === 1) {
    // a:r, polar (one argument with no comma)
    const pr = c.X.splitTop(xy, ':');
    if (pr.length !== 2) return c.why(`\\${c.name}(${xy}): not a point`);
    const a = c.fp(pr[0]), r = c.fp(pr[1]);
    x = r * Math.cos(a * D); y = r * Math.sin(a * D);
  } else if (parts.length === 2) { x = c.fp(parts[0]); y = c.fp(parts[1]); }
  else return c.why(`\\${c.name}(${xy}): not a point`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return c.why(`\\${c.name}(${xy}): a number not worked out`);
  c.out.push(`\\coordinate${o ? `[${o}]` : ''} (${clean(nm)}) at (${f((x - I.xo) / I.xstep)},${f((y - I.yo) / I.ystep)});`);
}
def('tkzDefPoint', '[({', (c, a) => defPoint(c, a[0].o, a[1].o, a[2].o));
def('tkzDefPoints', '[{', (c, a) => {
  for (const t of list(c.X, a[1].o)) {
    const q = c.X.splitTop(t, '/');
    if (q.length !== 3) { c.why(`\\tkzDefPoints: ${t} is not x/y/name`); return; }
    defPoint(c, a[0].o, `${clean(q[0])},${clean(q[1])}`, clean(q[2]));
  }
});
def('tkzDefShiftPoint', '[({', (c, a) => {
  const A = c.pt(a[0].o), v = c.X.coord(a[1].o);
  if (!v) { c.why(`\\tkzDefShiftPoint: (${a[1].o}) not worked out`); return; }
  if (A) c.out.push(`\\coordinate (${clean(a[2].o)}) at ${P(add(A, { x: v.x * K, y: -v.y * K }))};`);
});
def('tkzInit', '[', (c, a) => {
  const k: Record<string, number> = { ...c.st.init.keys };
  for (const o of items(c.X, a[0].o)) {
    if (!/^(xmin|xmax|xstep|ymin|ymax|ystep)$/.test(o.k)) { c.why(`\\tkzInit: ${o.k}`); continue; }
    k[o.k] = c.fp(o.v ?? '');
    if (!Number.isFinite(k[o.k]) || (/step/.test(o.k) && !k[o.k])) c.why(`\\tkzInit: ${o.k}=${o.v}`);
  }
  if (!c.issues.length) c.st.init = initFrame(k);
});
const getPoint = (key: 'p' | 'first' | 'second', reg: string) => (c: Ctx, a: Arg[]) => {
  const q = c.st.res?.[key];
  if (!q) { c.why(`Unresolved node or coordinate (${reg})`); return; }
  c.out.push(`\\coordinate (${clean(a[0].o)}) at ${P(q)};`);
};
def('tkzGetPoint', '{', getPoint('p', 'tkzPointResult'));
def('tkzGetFirstPoint', '{', getPoint('first', 'tkzFirstPointResult'));
def('tkzGetSecondPoint', '{', getPoint('second', 'tkzSecondPointResult'));
def('tkzGetPoints', '{{', (c, a) => { getPoint('first', 'tkzFirstPointResult')(c, [a[0]]); getPoint('second', 'tkzSecondPointResult')(c, [a[1]]); });
// scalars: \tkzGetAngle{m} and \tkzGetLength{m} define \m
def('tkzFindSlopeAngle', '(', (c, a) => {
  const p = c.pts(list(c.X, a[0].o));
  c.st.angle = p && p.length === 2 ? slope(p[0], p[1]) : null;
});
def('tkzFindAngle', '(', (c, a) => {
  const p = c.pts(list(c.X, a[0].o));
  if (!p || p.length !== 3) { c.st.angle = null; return; }
  const [t1, t2] = normAngles(slope(p[1], p[0]), slope(p[1], p[2]));
  c.st.angle = t2 - t1;
});
def('tkzCalcLength', '[(', (c, a) => {
  const p = c.pts(list(c.X, a[1].o)), o = items(c.X, a[0].o);
  if (o.some((x: any) => x.k !== 'cm')) { c.st.length = null; c.why(`\\tkzCalcLength: ${opt(o)}`); return; }
  c.st.length = p && p.length === 2 ? Math.round(norm(sub(p[1], p[0])) / CM * 1e6) / 1e6 : null;
});
const getScalar = (key: 'angle' | 'length') => (c: Ctx, a: Arg[]) => {
  const v = c.st[key], nm = a[0].o.trim().replace(/^\\/, '');
  if (v == null || !/^[A-Za-z@]+$/.test(nm)) { c.why(`\\${c.name}{${nm}}: the ${key} before it is not worked out`); return; }
  c.C.macros.set(nm, f(v));
};
def('tkzGetAngle', '{', getScalar('angle'));
def('tkzGetLength', '{', getScalar('length'));

// ---------- constructions ----------
def('tkzDefMidPoint', '(', (c, a) => {
  const p = c.pts(list(c.X, a[0].o));
  if (p && p.length === 2) c.result(mul(add(p[0], p[1]), 0.5)); else c.result(null);
});
// \tkz@InterLL: in cm, rounded to 5 places, placed as xy
def('tkzInterLL', '((', (c, a) => {
  const p = c.pts([...list(c.X, a[0].o), ...list(c.X, a[1].o)]);
  if (!p || p.length !== 4) { c.result(null); return; }
  const [A, B, Cc, Dd] = p.map((q) => mul(q, 1 / CM));
  const dx = A.x - B.x, dxx = Cc.x - Dd.x, dy = A.y - B.y, dyy = Cc.y - Dd.y;
  const dxy = A.x * B.y - A.y * B.x, dxxyy = Cc.x * Dd.y - Cc.y * Dd.x, div = dx * dyy - dy * dxx;
  if (!div || !c.plainUnits()) { c.result(null); c.why(div ? '\\tkzInterLL under x=/y= unit vectors' : '\\tkzInterLL: parallel lines'); return; }
  const u = c.unitK() * CM;
  c.result({ x: r5((dxy * dxx - dx * dxxyy) / div) * u, y: r5((dxy * dyy - dy * dxxyy) / div) * u });
});
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
// the foot of the perpendicular from p onto ab
const project = (a: Pt, b: Pt, p: Pt) => { const u = sub(b, a), t = ((p.x - a.x) * u.x + (p.y - a.y) * u.y) / (u.x * u.x + u.y * u.y); return add(a, mul(u, t)); };
// \tkzInterLCR: the line ab against the circle (o, r); first and second (r in pt)
function interLC(a: Pt, b: Pt, o: Pt, r: number): [Pt, Pt] | null {
  const h = project(a, b, o), d = norm(sub(h, o));
  if (d < 0.05) { const u = mul(sub(b, a), 1 / norm(sub(b, a))), s = add(o, mul(u, r)); return [sub(mul(o, 2), s), s]; }
  if (d > r) return null;
  const t = Math.acos(d / r) * 180 / Math.PI, b0 = add(o, mul(sub(h, o), r / d));
  return [add(o, rot(sub(b0, o), t)), add(o, rot(sub(b0, o), -t))];
}
def('tkzInterLC', '[((', (c, a) => {
  const o = items(c.X, a[0].o), L = list(c.X, a[1].o), K2 = list(c.X, a[2].o);
  let mode = 'node', near = false, common = '', next = '';
  for (const x of o) {
    if (x.k === 'R' || x.k === 'with nodes' || x.k === 'node') mode = x.k;
    else if (x.k === 'near') near = x.v !== 'false';
    else if (x.k === 'common') common = x.v || '';
    else if (x.k === 'next to') next = x.v || '';
    else { c.result(null); c.why(`\\tkzInterLC: ${x.raw}`); return; }
  }
  const ab = c.pts(L);
  if (!ab || ab.length !== 2) { c.result(null); return; }
  let O: Pt | null, r: number;
  // [R]: the radius in cm (#5 cm: a length, whatever x= and y= are)
  if (mode === 'R') { O = c.pt(K2[0]); r = c.hasUnit(K2[1]) ? c.len(K2[1]) : c.num(K2[1]) * CM; }
  else if (mode === 'with nodes') { const q = c.pts(K2); O = q && q[0]; r = q && q.length === 3 ? norm(sub(q[2], q[1])) : NaN; }
  else { const q = c.pts(K2); O = q && q[0]; r = q && q.length === 2 ? norm(sub(q[1], q[0])) : NaN; }
  if (!O || !Number.isFinite(r) || c.issues.length) { c.result(null); return; }
  const fs = interLC(ab[0], ab[1], O, r);
  if (!fs) { c.result(null); c.why('\\tkzInterLC: the line misses the circle'); return; }
  let [F, S] = fs;
  const swap = () => { [F, S] = [S, F]; };
  if (near) { if (!(norm(sub(F, ab[0])) < norm(sub(S, ab[0])))) swap(); }
  else if (common) { const q = c.pt(common); if (!q) { c.result(null); return; } if (!(norm(sub(q, S)) < 1)) swap(); }
  else if (next) { const q = c.pt(next); if (!q) { c.result(null); return; } if (!(norm(sub(q, F)) < norm(sub(q, S)))) swap(); }
  else { const [t1, t2] = normAngles(slope(F, S), slope(F, O)); if (!(t2 - t1 < 180)) swap(); }
  c.result(null, F, S);
});
def('tkzInterCC', '[((', (c, a) => {
  const o = items(c.X, a[0].o), L1 = list(c.X, a[1].o), L2 = list(c.X, a[2].o);
  let mode = 'node', common = '';
  for (const x of o) {
    if (x.k === 'R' || x.k === 'with nodes' || x.k === 'node') mode = x.k;
    else if (x.k === 'common') common = x.v || '';
    else { c.result(null); c.why(`\\tkzInterCC: ${x.raw}`); return; }
  }
  // radii in cm (\tkz@@CalcLengthcm, rounded to 6 places), as \tkzInterCCR takes them
  const cm6 = (v: number) => Math.round(v / CM * 1e6) / 1e6;
  let A: Pt | null = null, B: Pt | null = null, ra = NaN, rb = NaN;
  const cmOf = (v: string) => (c.hasUnit(v) ? c.len(v) / CM : c.num(v));
  if (mode === 'R') { A = c.pt(L1[0]); B = c.pt(L2[0]); ra = cmOf(L1[1]); rb = cmOf(L2[1]); }
  else {
    const p = c.pts(L1), q = c.pts(L2), n = mode === 'with nodes' ? 3 : 2;
    if (p && q && p.length === n && q.length === n) { A = p[0]; B = q[0]; ra = cm6(norm(sub(p[n - 1], p[n - 2]))); rb = cm6(norm(sub(q[n - 1], q[n - 2]))); }
  }
  if (!A || !B || !Number.isFinite(ra) || !Number.isFinite(rb)) { c.result(null); return; }
  const cx = ra * CM, cy = rb * CM, dd = norm(sub(B, A));
  if (!dd) { c.result(null); c.why('\\tkzInterCC: the same centre'); return; }
  const aa = ((cx + cy) / (2 * dd)) * (cx - cy) + dd / 2, M = add(A, mul(sub(B, A), aa / dd));
  const hh = Math.sqrt(Math.abs((cx + aa) * (cx - aa))), R = { x: hh / dd * (A.y - B.y), y: hh / dd * (B.x - A.x) };
  let F = add(M, R), S = sub(M, R);
  if (common) { const q = c.pt(common); if (!q) { c.result(null); return; } if (!(norm(sub(q, S)) < 0.05)) [F, S] = [S, F]; }
  else { const [t1, t2] = normAngles(slope(F, A), slope(F, B)); if (!(t2 - t1 < 180)) [F, S] = [S, F]; }
  c.result(null, F, S);
});
// \tkzDefPointBy[translation=from A to B | homothety=center O ratio k | reflection=over A--B | symmetry=center O |
// projection=onto A--B | rotation=center O angle α | rotation in rad=center O angle α](P)
function transform(c: Ctx, o: string): ((p: Pt) => Pt) | null {
  const it = items(c.X, o);
  if (it.length !== 1 || it[0].v == null) return c.why(`\\${c.name}[${o}]`);
  const { k, v } = it[0];
  let m: RegExpExecArray | null;
  if (k === 'translation' && (m = /^from\s+(.+?)\s+to\s+(.+)$/.exec(v))) { const p = c.pts([m[1], m[2]]); return p && ((q) => add(q, sub(p[1], p[0]))); }
  if (k === 'homothety' && (m = /^center\s+(.+?)\s+ratio\s+(.+)$/.exec(v))) { const O = c.pt(m[1]), r = c.fp(m[2]); return O && Number.isFinite(r) ? (q) => add(O, mul(sub(q, O), r)) : c.why(`\\${c.name}: ratio ${m[2]}`); }
  if (k === 'reflection' && (m = /^over\s+(.+?)\s*--\s*(.+)$/.exec(v))) { const p = c.pts([m[1], m[2]]); return p && ((q) => sub(mul(project(p[0], p[1], q), 2), q)); }
  if (k === 'symmetry' && (m = /^center\s+(.+)$/.exec(v))) { const O = c.pt(m[1]); return O && ((q) => sub(mul(O, 2), q)); }
  if (k === 'projection' && (m = /^onto\s+(.+?)\s*--\s*(.+)$/.exec(v))) { const p = c.pts([m[1], m[2]]); return p && ((q) => project(p[0], p[1], q)); }
  if ((k === 'rotation' || k === 'rotation in rad') && (m = /^center\s+(.+?)\s+angle\s+(.+)$/.exec(v))) {
    const O = c.pt(m[1]), t = k === 'rotation' ? c.num(m[2]) : c.fp(m[2]) / D;
    return O && Number.isFinite(t) ? (q) => add(O, rot(sub(q, O), t)) : c.why(`\\${c.name}: angle ${m[2]}`);
  }
  return c.why(`\\${c.name}: ${k}${v ? '=' + v : ''}`);
}
def('tkzDefPointBy', '[(', (c, a) => {
  const T = transform(c, a[0].o), p = T && c.pt(a[1].o);
  c.result(T && p ? T(p) : null);
});
def('tkzDefPointsBy', '[({', (c, a) => {
  const T = transform(c, a[0].o), src = list(c.X, a[1].o), names = list(c.X, a[2].o);
  c.result(null);
  if (!T) return;
  src.forEach((n: string, k: number) => { const p = c.pt(n); if (p) c.out.push(`\\coordinate (${names.length ? names[k] ?? `${n}'` : `${n}'`}) at ${P(T(p))};`); });
  if (names.length && names.length !== src.length) c.why('\\tkzDefPointsBy: names and points differ in number');
});
// \tkzDefLine[perpendicular=through C | orthogonal=through C | parallel=through C | mediator | bisector, K=1](…)
def('tkzDefLine', '[(', (c, a) => {
  const it = items(c.X, a[0].o), p = c.pts(list(c.X, a[1].o));
  let Kf = 1, kind = '', thr = '';
  for (const x of it) {
    if (x.k === 'K') Kf = c.num(x.v);
    else if (/^(perpendicular|orthogonal|parallel)$/.test(x.k) && x.v && /^through\s+/.test(x.v)) { kind = x.k === 'parallel' ? 'par' : 'perp'; thr = x.v.replace(/^through\s+/, ''); }
    else if ((x.k === 'mediator' || x.k === 'bisector') && x.v == null) kind = x.k;
    else { c.result(null); c.why(`\\tkzDefLine: ${x.raw}`); return; }
  }
  if (!p || !Number.isFinite(Kf)) { c.result(null); return; }
  if ((kind === 'par' || kind === 'perp') && p.length === 2) {
    const C0 = c.pt(thr), u = sub(p[1], p[0]);
    if (!C0) { c.result(null); return; }
    c.result(add(C0, mul(kind === 'par' ? u : { x: -u.y, y: u.x }, Kf)));
  } else if (kind === 'mediator' && p.length === 2) {
    // the equilateral apexes either side of the middle, then K times their distance from it
    const M = mul(add(p[0], p[1]), 0.5), u = sub(p[1], p[0]), h = mul({ x: -u.y, y: u.x }, Math.sqrt(3) / 2 * Kf);
    c.result(null, add(M, h), sub(M, h));
  } else if (kind === 'bisector' && p.length === 3) {
    const [B, A, C0] = p, d = norm(sub(B, A)), v = sub(C0, A), Q = add(A, mul(v, d / norm(v)));
    c.result(add(A, mul(sub(mul(add(Q, B), 0.5), A), Kf)));
  } else { c.result(null); c.why(`\\tkzDefLine[${a[0].o}]`); }
});
// the circumcentre, as \tkzInterLLxy of two mediators places it: in cm rounded to 5 places, as xy
function circum(c: Ctx, p: Pt[] | null) {
  if (!p || p.length !== 3) return null;
  const [A, B, C0] = p, d = 2 * (A.x * (B.y - C0.y) + B.x * (C0.y - A.y) + C0.x * (A.y - B.y));
  if (!d) return c.why(`\\${c.name}: the points are in line`);
  if (!c.plainUnits()) return c.why(`\\${c.name} under x=/y= unit vectors`);
  const q = (P0: Pt) => P0.x * P0.x + P0.y * P0.y, u = c.unitK() * CM;
  return { x: r5((q(A) * (B.y - C0.y) + q(B) * (C0.y - A.y) + q(C0) * (A.y - B.y)) / d / CM) * u, y: r5((q(A) * (C0.x - B.x) + q(B) * (A.x - C0.x) + q(C0) * (B.x - A.x)) / d / CM) * u };
}
def('tkzCircumCenter tkzDefCircumCenter', '(', (c, a) => c.result(circum(c, c.pts(list(c.X, a[0].o)))));
// \tkzDefCircle[R](O,r): (O) --++(r,0) as xy; [diameter](A,B): the middle and B; [circum](A,B,C): the centre, then
// the centre and A
def('tkzDefCircle', '[(', (c, a) => {
  const it = items(c.X, a[0].o), L = list(c.X, a[1].o);
  const kind = it.length ? it[it.length - 1].k : 'circum';
  if (it.length > 1 || it.some((x: any) => x.v != null) || !/^(R|diameter|circum)$/.test(kind)) { c.result(null); c.why(`\\tkzDefCircle[${a[0].o}]`); return; }
  if (kind === 'R') {
    const O = c.pt(L[0]), r = c.fp(L[1] ?? '');
    if (!O || !Number.isFinite(r) || !c.plainUnits()) { c.result(null); if (O) c.why('\\tkzDefCircle[R]: the radius'); return; }
    const q = add(O, { x: r5(r) * c.unitK() * CM, y: 0 });
    c.result(q, undefined, q);
  } else if (kind === 'diameter') {
    const p = c.pts(L);
    if (!p || p.length !== 2) { c.result(null); return; }
    const M = mul(add(p[0], p[1]), 0.5);
    c.result(M, M, p[1]);
  } else {
    const p = c.pts(L), O = circum(c, p);
    c.result(O, O, O && p ? p[0] : null);
  }
});
def('tkzDefSquare', '(', (c, a) => {
  const p = c.pts(list(c.X, a[0].o));
  if (!p || p.length !== 2) { c.result(null); return; }
  const u = sub(p[1], p[0]), n = { x: -u.y, y: u.x };
  c.result(null, add(p[1], n), add(p[0], n));
});
def('tkzDefParallelogram', '(', (c, a) => {
  const p = c.pts(list(c.X, a[0].o));
  if (!p || p.length !== 3) { c.result(null); return; }
  c.result(add(p[0], sub(p[2], p[1])));
});
// \tkzDefPointWith[colinear=at C | orthogonal | linear …, K=1](A,B)
def('tkzDefPointWith', '[(', (c, a) => {
  const it = items(c.X, a[0].o), p = c.pts(list(c.X, a[1].o));
  let Kf = 1, kind = '', at = '';
  for (const x of it) {
    if (x.k === 'K') Kf = c.num(x.v);
    else if (x.k === 'colinear' && x.v && /^at\s+/.test(x.v)) { kind = 'col'; at = x.v.replace(/^at\s+/, ''); }
    else if ((x.k === 'orthogonal' || x.k === 'linear') && x.v == null) kind = x.k;
    else { c.result(null); c.why(`\\tkzDefPointWith: ${x.raw}`); return; }
  }
  if (!p || p.length !== 2 || !Number.isFinite(Kf)) { c.result(null); return; }
  const u = sub(p[1], p[0]);
  if (kind === 'col') { const C0 = c.pt(at); c.result(C0 ? add(C0, mul(u, Kf)) : null); }
  else if (kind === 'linear') c.result(add(p[0], mul(u, Kf)));
  else c.result(add(p[0], mul({ x: -u.y, y: u.x }, Kf)));
});

// \tkzDefTriangle[equilateral | two one | egyptian … , swap](A,B): the third vertex (tkz-obj-eu-triangles.tex: a
// rotation of B about A, or \tkzDefPointWith[K=…](B,A))
def('tkzDefTriangle', '[(', (c, a) => {
  const it = items(c.X, a[0].o), p = c.pts(list(c.X, a[1].o));
  let kind = 'equilateral', swap = false;
  for (const x of it) { if (x.k === 'swap') swap = x.v !== 'false'; else if (x.v == null) kind = x.k; else { c.result(null); c.why(`\\tkzDefTriangle: ${x.raw}`); return; } }
  if (!p || p.length !== 2) { c.result(null); return; }
  const [A, B] = p, phi = (1 + Math.sqrt(5)) / 2;
  const turn = (t: number) => add(A, rot(sub(B, A), t)), withK = (Kf: number) => { const u = sub(A, B); return add(B, mul({ x: -u.y, y: u.x }, swap ? -Kf : Kf)); };
  const K0: Record<string, number> = { half: 0.5, 'two one': 0.5, pythagore: 0.75, pythagoras: 0.75, right: 0.75, egyptian: 0.75, gold: 1 / phi };
  if (kind === 'equilateral') c.result(turn(60));
  else if (K0[kind] != null) c.result(withK(K0[kind]));
  else if (kind === 'euclid' || kind === 'euclide') c.result(turn(swap ? 36 : -36));
  else { c.result(null); c.why(`\\tkzDefTriangle[${kind}]`); }
});
// \tkzDefPointOnCircle[through=center O angle α point P | R=center O angle α radius r]: (O) --++(α:r), r = |OP| in
// cm as xy (rounded to 6 places) or as written
def('tkzDefPointOnCircle', '[', (c, a) => {
  const it = items(c.X, a[0].o), x = it[0];
  const m = x && it.length === 1 && x.v ? /^center\s+(.+?)\s+angle\s+(.+?)\s+(point|radius)\s+(.+)$/.exec(x.v) : null;
  if (!m || !/^(through|R|through in rad|R in rad)$/.test(x.k) || (m[3] === 'point') !== /^through/.test(x.k)) { c.result(null); c.why(`\\tkzDefPointOnCircle[${a[0].o}]`); return; }
  const O = c.pt(m[1]), ang = /in rad/.test(x.k) ? c.num(m[2]) / D : c.num(m[2]);
  let r = m[4];
  if (m[3] === 'point') { const q = c.pt(m[4]); if (!q || !O) { c.result(null); return; } r = f(Math.round(norm(sub(q, O)) / CM * 1e6) / 1e6); }
  const e = O && Number.isFinite(ang) ? c.X.coord(`${f(ang)}:${r}`) : null;
  if (!O || !e) { c.result(null); if (O) c.why(`\\tkzDefPointOnCircle: ${x.v}`); return; }
  c.result(add(O, { x: e.x * K, y: -e.y * K }));
});
// \tkzDefPointOnLine[pos=t](A,B): the point at pos t of the line between the centres
def('tkzDefPointOnLine', '[(', (c, a) => {
  const it = items(c.X, a[0].o), p = c.pts(list(c.X, a[1].o));
  let pos = 0.5;
  for (const x of it) { if (x.k === 'pos') pos = c.num(x.v); else if (x.v == null && POS[x.k] != null) pos = POS[x.k]; else { c.result(null); c.why(`\\tkzDefPointOnLine: ${x.raw}`); return; } }
  if (!p || p.length !== 2 || !Number.isFinite(pos) || !(p.every((q, k) => c.isCoord(list(c.X, a[1].o)[k])))) { c.result(null); if (p) c.why('\\tkzDefPointOnLine: a node (the line starts at its border)'); return; }
  c.result(add(p[0], mul(sub(p[1], p[0]), pos)));
});
// \tkzDefRegPolygon[center | side, sides=n, name=P](A,B): the vertices P1 … Pn turning B about A (center), or about
// the centre of the polygon on side AB (side; tkzPointResult that centre)
def('tkzDefRegPolygon', '[(', (c, a) => {
  const it = items(c.X, a[0].o), p = c.pts(list(c.X, a[1].o));
  let side = false, n = 5, name = 'P';
  for (const x of it) {
    if (x.k === 'side' || x.k === 'center') side = x.k === 'side';
    else if (x.k === 'sides') n = c.num(x.v);
    else if (x.k === 'name') name = x.v ?? 'P';
    else { c.result(null); c.why(`\\tkzDefRegPolygon: ${x.raw}`); return; }
  }
  if (!p || p.length !== 2 || !(n >= 3 && n <= 360) || n !== Math.round(n) || !c.plainUnits()) { c.result(null); if (p) c.why(`\\tkzDefRegPolygon[${a[0].o}]`); return; }
  let O = p[0], A = p[1];
  if (side) {
    const M = mul(add(p[0], p[1]), 0.5), len = Math.round(norm(sub(p[0], M)) / CM * 1e6) / 1e6, ri = len * Math.tan(Math.PI / 2 * (n - 2) / n);
    const u = sub(p[1], M), nu = norm(u);
    O = add(M, mul({ x: -u.y, y: u.x }, ri * CM * c.unitK() / nu)); A = p[0];
  }
  let last = A;
  for (let v = 1; v <= n; v++) { last = add(O, rot(sub(A, O), 360 / n * (v - 1))); c.out.push(`\\coordinate (${name}${v}) at ${P(last)};`); }
  c.result(side ? O : last);
});

// ---------- drawings ----------
// \tkzDrawSegment / \tkzDrawLine: \draw[line style, add=l and r, o] (A) to (B), add's to path from the centres:
// ($(A)!-l!(B)$) -- ($(B)!-r!(A)$) (a length when it has a unit, else a fraction of AB)
function segment(c: Ctx, o: string, ab: string[], line: boolean) {
  const it = items(c.X, o);
  let l = line ? '.2' : '0', r = l;
  const rest: any[] = [];
  // dim style: tkz-euclide's latex-latex, or the document's (appended to: after it); dim fence style: none, or the
  // document's; the command's own dim style/.style and /.append style after them
  const gd = c.C.styles?.get('dim style');
  let dim: string[] | null = null, dimSty = gd == null ? 'latex-latex' : /^\s*,/.test(gd) ? 'latex-latex, dim style' : 'dim style';
  let fenceSty = c.C.styles?.has('dim fence style') ? 'dim fence style' : '';
  for (const x of it) {
    if (x.k === 'add' && x.v) { const m = /^(.*?)\s+and\s+(.*)$/.exec(x.v); if (!m) return c.why(`\\${c.name}: add=${x.v}`); [l, r] = [m[1], m[2]]; }
    else if (x.k === 'dim' && x.v) dim = c.X.splitTop(x.v, ',');
    else if (x.k === 'dim style/.append style' && x.v != null) dimSty = join(dimSty, x.v);
    else if (x.k === 'dim style/.style' && x.v != null) dimSty = x.v;
    else if (x.k === 'dim fence style/.style' || x.k === 'dim fence style/.append style') fenceSty = join(x.k.includes('append') ? fenceSty : '', x.v ?? '');
    else if (/^dim\b/.test(x.k)) return c.why(`\\${c.name}: ${x.k}`);
    else rest.push(x);
  }
  if (ab.length !== 2) return c.why(`\\${c.name}(${ab.join(',')}): two points`);
  const ls = c.styleOf('line style', true);
  if (ls == null) return null;
  const p = c.pts(ab);
  if (!p) return null;
  const end = (A: Pt, B: Pt, t: string) => {
    if (c.hasUnit(t)) { const d = c.len(t), n = norm(sub(B, A)); return Number.isFinite(d) && n ? sub(A, mul(sub(B, A), d / n)) : null; }
    const k = c.num(t);
    return Number.isFinite(k) ? sub(A, mul(sub(B, A), k)) : null;
  };
  const A = end(p[0], p[1], l), B = end(p[1], p[0], r);
  if (!A || !B) return c.why(`\\${c.name}: add=${l} and ${r}`);
  const plain = (t: string) => /^\s*-?0*\.?0*\s*$/.test(t) && !/[1-9]/.test(t);
  const wa = plain(l) && c.isCoord(ab[0]) ? `(${ab[0]})` : P(A), wb = plain(r) && c.isCoord(ab[1]) ? `(${ab[1]})` : P(B);
  c.out.push(`\\draw[${join(LINE, ls, opt(rest))}] ${wa} -- ${wb};`);
  if (!dim) return;
  // dim={text, offset, options}: on the segment's left (90° from it), fences 1.2 × offset long from its ends and the
  // dimension line at offset, latex-latex, its text in a white \footnotesize node at the middle (inner sep 0pt),
  // all in the segment's style; dim style for the line and the text, dim fence style for the fences
  const off = dim.length === 3 ? c.len(dim[1]) : NaN, d = sub(B, A), nd = norm(d);
  if (!c.hasUnit(dim[1]) || !Number.isFinite(off) || !nd) return c.why(`\\${c.name}: dim={${dim.join(',')}}`);
  const n = mul({ x: -d.y, y: d.x }, off / nd), base = join(LINE, ls, opt(rest));
  c.out.push(`\\draw[${join(base, fenceSty)}] ${P(A)} -- ${P(add(A, mul(n, 1.2)))};`, `\\draw[${join(base, fenceSty)}] ${P(B)} -- ${P(add(B, mul(n, 1.2)))};`);
  c.out.push(`\\draw[${join(base, dimSty)}] ${P(add(A, n))} -- ${P(add(B, n))};`);
  const col = items(c.X, join(opt(rest), /(^|,)\s*dim style\s*(,|$)/.test(dimSty) ? gd ?? '' : '', dimSty)).filter((x: any) => (x.v == null && c.X.color?.(x.k)) || x.k === 'color').map((x: any) => x.raw);
  c.out.push(`\\node[${join('inner sep=0pt, font=\\footnotesize, fill=white', col.join(', '), dim[2].trim())}] at ${P(add(mul(add(A, B), 0.5), n))} {${dim[0].trim()}};`);
}
def('tkzDrawSegment', '[(', (c, a) => segment(c, a[0].o, list(c.X, a[1].o), false));
def('tkzDrawLine', '[(', (c, a) => segment(c, a[0].o, list(c.X, a[1].o), true));
def('tkzDrawSegments', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) segment(c, a[0].o, g, false); });
def('tkzDrawLines', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) segment(c, a[0].o, g, true); });
// \tkzDrawPolygon: \draw[line style, line join=round, o] (P1)--(P2)--…--cycle; \tkzFillPolygon: \fill[o] the same
function polygon(c: Ctx, o: string, L: string[], fill: boolean) {
  if (L.length < 2) return c.why(`\\${c.name}: fewer than two points`);
  const ls = fill ? '' : c.styleOf('line style', true);
  if (ls == null || !c.pts(L)) return null;
  c.out.push(`${fill ? `\\fill${o.trim() ? `[${o}]` : ''}` : `\\draw[${join(LINE, ls, 'line join=round', o)}]`} ${L.map((n) => `(${n})`).join(' -- ')} -- cycle;`);
}
def('tkzDrawPolygon', '[(', (c, a) => polygon(c, a[0].o, list(c.X, a[1].o), false));
def('tkzDrawPolygons', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) polygon(c, a[0].o, g, false); });
def('tkzFillPolygon', '[(', (c, a) => polygon(c, a[0].o, list(c.X, a[1].o), true));
// \tkzDrawCircle: \node[draw, circle through=(A), circle style, o] at (O) {}: the circle through A, its radius |OA|
// in the frame (a node: a scope's scale does not size it)
function circle(c: Ctx, o: string, L: string[], fill: boolean) {
  if (L.length !== 2) return c.why(`\\${c.name}(${L.join(',')}): a centre and a point`);
  const cs = fill ? '' : c.styleOf('circle style', true), p = cs == null ? null : c.pts(L);
  if (!p) return null;
  // circle through takes the distance on the page: a scope's scale sizes it as a path's radius (measured), but an
  // xscale or yscale leaves it a circle
  const r = norm(sub(p[1], p[0]));
  if (!Number.isFinite(c.nodeScale())) return c.why(`\\${c.name} under xscale or yscale (circle through stays round)`);
  c.out.push(fill ? `\\fill${o.trim() ? `[${o}]` : ''} (${L[0]}) circle[radius=${f(r)}pt];` : `\\draw[${join(CIRCLE, cs!, o)}] (${L[0]}) circle[radius=${f(r)}pt];`);
}
def('tkzDrawCircle', '[(', (c, a) => circle(c, a[0].o, list(c.X, a[1].o), false));
def('tkzDrawCircles', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) circle(c, a[0].o, g, false); });
def('tkzFillCircle', '[(', (c, a) => circle(c, a[0].o, list(c.X, a[1].o), true));
def('tkzFillCircles', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) circle(c, a[0].o, g, true); });
// an arc about O of radius r (pt) from t1 to t2 (after \tkzNormalizeAngle), counter-clockwise
const ARC_KEYS = /^(towards|rotate|angles|R|R with nodes|type|delta|reverse|diameter|arc|size|mark|mkpos|mksize|mkcolor)$/;
function arcPath(O: Pt, r: number, t1: number, t2: number) {
  return `${P(add(O, rot({ x: r, y: 0 }, t1)))} arc[start angle=${f(t1)}, end angle=${f(t2)}, radius=${f(r)}pt]`;
}
const XF = /^(shift|xshift|yshift|scale|xscale|yscale|rotate around|scale around|cm|xslant|yslant)$/;
function drawArc(c: Ctx, o: string, A1: string[], A2: string[], semi = false) {
  const it = items(c.X, o);
  let type = 'towards', delta = 0, reverse = false;
  const rest: any[] = [];
  for (const x of it) {
    if (/^(towards|rotate|angles|R|R with nodes)$/.test(x.k) && x.v == null) type = x.k;
    else if (x.k === 'type' && x.v) type = x.v;
    else if (x.k === 'delta') delta = c.num(x.v);
    else if (x.k === 'reverse') reverse = x.v !== 'false';
    else if (ARC_KEYS.test(x.k)) { /* the marks' keys: nothing on an arc */ }
    else if (XF.test(x.k)) return c.why(`\\${c.name}: ${x.k} after the arc's shift`);
    else rest.push(x);
  }
  if (!c.plainUnits()) return c.why(`\\${c.name} under x=/y= unit vectors`);
  const as = c.styleOf('arc style', true);
  if (as == null) return null;
  const O = c.pt(A1[0]);
  if (!O || A1.length !== 2) return null;
  let r: number, t1: number, t2: number;
  // radii: towards's in cm as xy (rounded to 6 places), rotate's and angles' in pt, R's as written
  const k = c.unitK();
  if (type === 'R' || type === 'R with nodes') {
    r = c.hasUnit(A1[1]) ? c.len(A1[1]) : c.num(A1[1]) * CM * k;
    if (type === 'R') { [t1, t2] = [c.num(A2[0]), c.num(A2[1])]; }
    else { const q = c.pts(A2); if (!q || q.length !== 2) return null; [t1, t2] = [slope(O, q[0]), slope(O, q[1])]; }
  } else {
    const A = c.pt(A1[1]);
    if (!A) return null;
    r = norm(sub(A, O)); t1 = slope(O, A);
    if (type === 'towards') { const Xp = semi ? sub(mul(O, 2), A) : c.pt(A2[0]); if (!Xp) return null; t2 = slope(O, Xp); r = Math.round(r / CM * 1e6) / 1e6 * CM * k; }
    else if (type === 'rotate') { const al = c.num(A2[0]); t2 = t1 + al; if (!(al > 0)) [t1, t2] = [t2, t1]; }
    else if (type === 'angles') { [t1, t2] = [c.num(A2[0]), c.num(A2[1])]; }
    else return c.why(`\\${c.name}: type=${type}`);
  }
  if (![r, t1, t2, delta].every(Number.isFinite)) return c.why(`\\${c.name}: a number not worked out`);
  [t1, t2] = normAngles(t1, t2);
  t1 -= delta; t2 += delta;
  if (reverse) [t1, t2] = [t2, t1];
  c.out.push(`\\draw[${join(ARC, as, opt(rest))}] ${arcPath(O, r, t1, t2)};`);
}
def('tkzDrawArc', '[((', (c, a) => drawArc(c, a[0].o, list(c.X, a[1].o), list(c.X, a[2].o)));
def('tkzDrawSemiCircle', '[(', (c, a) => drawArc(c, `${a[0].o},delta=0`, list(c.X, a[1].o), [], true));
// \tkzDrawPoint: \node[point style, o] at (A) {}: a circle 2pt across (size=n: n pt), drawn black and filled
// black!10; color= (or a bare colour) sets both, draw= and fill= one each, in order
function drawPoints(c: Ctx, o: string, L: string[]) {
  let draw = 'black', fill = 'black!10', size = '2pt';
  const rest: string[] = [];
  if (c.styleOf('point style') == null) return;
  for (const x of items(c.X, o)) {
    if (x.k === 'size' && x.v) { size = c.hasUnit(x.v) ? x.v : `${f(c.num(x.v))}pt`; if (!c.hasUnit(x.v) && !Number.isFinite(c.num(x.v))) { c.why(`\\${c.name}: size=${x.v}`); return; } }
    else if (x.k === 'color' && x.v) draw = fill = x.v;
    else if (x.k === 'draw' && x.v) draw = x.v;
    else if (x.k === 'fill' && x.v) fill = x.v;
    else if (x.v == null && c.X.color?.(x.k)) draw = fill = x.k;
    else if (x.k === 'shape' && x.v === 'circle') { /* the default */ }
    else rest.push(x.raw);
  }
  for (const n of L) if (c.pt(n)) c.out.push(`\\node[circle, draw=${draw}, fill=${fill}, inner sep=0pt, minimum size=${size}${rest.length ? ', ' + rest.join(', ') : ''}] at (${n}) {};`);
}
def('tkzDrawPoint tkzDrawPoints', '[(', (c, a) => drawPoints(c, a[0].o, list(c.X, a[1].o)));

// ---------- labels ----------
def('tkzLabelPoint', '[({', (c, a) => { const ls = c.styleOf('label style', true); if (ls != null && c.pt(a[1].o)) c.out.push(`\\node[${join(LABEL, ls, a[0].o)}] at (${clean(a[1].o)}) {${a[2].o}};`); });
def('tkzLabelPoints', '[(', (c, a) => { const ls = c.styleOf('label style', true); if (ls != null) for (const n of list(c.X, a[1].o)) if (c.pt(n)) c.out.push(`\\node[${join(LABEL, ls, a[0].o)}] at (${n}) {$${n}$};`); });
// \path (A) to node[label style, o]{t} (B): the node at pos (.5) of the line between the centres
const POS: Record<string, number> = { 'at start': 0, 'very near start': 0.125, 'near start': 0.25, midway: 0.5, 'near end': 0.75, 'very near end': 0.875, 'at end': 1 };
function labelSegment(c: Ctx, o: string, ab: string[], t: string, style: string) {
  if (ab.length !== 2) return c.why(`\\${c.name}(${ab.join(',')}): two points`);
  const ls = style ? c.styleOf('label style', true) : '';
  if (ls == null) return null;
  style = join(style, ls);
  const p = c.pts(ab);
  if (!p) return null;
  const it = items(c.X, o);
  // along a line between two nodes TikZ starts and ends at their borders; sloped turns the text
  if (!ab.every((n) => c.isCoord(n)) || it.some((x: any) => /^(sloped|auto|swap|')$/.test(x.k))) {
    c.out.push(`\\path (${ab[0]}) to node[${join(style, o)}]{${t}} (${ab[1]});`);
    return;
  }
  let pos = 0.5;
  const rest: string[] = [];
  for (const x of it) {
    if (x.k === 'pos') pos = c.num(x.v);
    else if (x.v == null && POS[x.k] != null) pos = POS[x.k];
    else rest.push(x.raw);
  }
  if (!Number.isFinite(pos)) return c.why(`\\${c.name}: pos`);
  c.out.push(`\\node[${join(style, rest.join(', '))}] at ${P(add(p[0], mul(sub(p[1], p[0]), pos)))} {${t}};`);
}
def('tkzLabelSegment', '[({', (c, a) => labelSegment(c, a[0].o, list(c.X, a[1].o), a[2].o, LABEL));
def('tkzLabelSegments', '[({', (c, a) => { for (const g of groups(c.X, a[1].o)) labelSegment(c, a[0].o, g, a[2].o, LABEL); });
def('tkzLabelLine', '[({', (c, a) => labelSegment(c, a[0].o, list(c.X, a[1].o), a[2].o, ''));
// \path (O) --+(θ:dist) node[black, font=\normalsize, o]{t}: θ the bisector's slope unless angle= says, the node
// at the end (pos=p: that far along)
function labelAngle(c: Ctx, o: string, L: string[], t: string) {
  if (L.length !== 3) return c.why(`\\${c.name}(${L.join(',')}): three points`);
  const las = c.styleOf('label angle style', true), p = las == null ? null : c.pts(L);
  if (!p) return null;
  let dist = '1', ang: number | null = null, pos = 1;
  const rest: string[] = [];
  for (const x of items(c.X, o)) {
    if (x.k === 'dist' && x.v) dist = x.v;
    else if (x.k === 'angle' && x.v) ang = c.num(x.v);
    else if (x.k === 'pos') pos = c.num(x.v);
    else if (x.v == null && POS[x.k] != null) pos = POS[x.k];
    else rest.push(x.raw);
  }
  if (ang == null) { const [t1, t2] = normAngles(slope(p[1], p[0]), slope(p[1], p[2])); ang = (t1 + t2) / 2; }
  const e = c.X.coord(`${f(ang)}:${dist}`);
  if (!e || !Number.isFinite(pos) || !Number.isFinite(ang)) return c.why(`\\${c.name}: dist=${dist}`);
  c.out.push(`\\node[${join('black, font=\\normalsize', las!, rest.join(', '))}] at ${P(add(p[1], mul({ x: e.x * K, y: -e.y * K }, pos)))} {${t}};`);
}
def('tkzLabelAngle', '[({', (c, a) => labelAngle(c, a[0].o, list(c.X, a[1].o), a[2].o));
def('tkzLabelAngles', '[({', (c, a) => { for (const g of groups(c.X, a[1].o)) labelAngle(c, a[0].o, g, a[2].o); });

// ---------- marks ----------
// the strokes of plot mark m at p, its x axis along u (unit), in colour col
function markAt(c: Ctx, m: string, size: number, w: number, p: Pt, u: Pt, col: string, o = '') {
  // (the mark is drawn on the page: under a scope's scale its strokes keep their size, measured)
  const L = plotMark(m, size, w), S = c.scaleOf();
  if (!L) return c.why(`\\${c.name}: mark=${m} is not drawn`);
  if (!(S > 0)) return c.why(`\\${c.name}: a mark under xscale or yscale`);
  const n = { x: -u.y, y: u.x }, at = (x: number, y: number) => add(p, mul(add(mul(u, x), mul(n, y)), 1 / S));
  for (const [x1, y1, x2, y2] of L) c.out.push(`\\draw[${join(col, o)}] ${P(at(x1, y1))} -- ${P(at(x2, y2))};`);
}
// \tkzMarkAngle[size=1, arc=l, mark=none, mksize=4pt, mkpos=.5, mkcolor=black, o](A,O,B): \draw[shift={(O)}, o,
// fill=none] (θ1:size) arc (θ1:θ2:size) at the current line width and colour; arc=ll two arcs at size cm ∓
// 2.5\pgflinewidth, lll the three; the mark on the arc at size, at the line width round the command
function markAngle(c: Ctx, o: string, L: string[]) {
  if (L.length !== 3) return c.why(`\\${c.name}(${L.join(',')}): three points`);
  const p = c.pts(L);
  if (!p) return null;
  let size = '1', arc = 'l', mark = 'none', mksize = '4pt', mkpos = 0.5, mkcolor = 'black', scale = 1;
  const rest: any[] = [];
  for (const x of items(c.X, o)) {
    if (x.k === 'size' && x.v) size = x.v;
    else if (x.k === 'arc' && x.v) arc = x.v;
    else if (x.k === 'mark' && x.v) mark = x.v;
    else if (x.k === 'mksize' && x.v) mksize = x.v;
    else if (x.k === 'mkpos') mkpos = c.num(x.v);
    else if (x.k === 'mkcolor' && x.v) mkcolor = x.v;
    else if (x.k === 'scale' && x.v) scale = c.num(x.v);
    else if (/^(fill|pattern|shade|top color|bottom color|left color|right color|ball color|fill opacity)$/.test(x.k) || ARC_KEYS.test(x.k)) { /* fill=none after them; the arcs' keys do nothing */ }
    else if (XF.test(x.k)) return c.why(`\\${c.name}: ${x.k} after the arc's shift`);
    else rest.push(x);
  }
  if (!c.plainUnits()) return c.why(`\\${c.name} under x=/y= unit vectors`);
  // size: xy units unless it has a unit; arc=ll and lll draw at size cm ∓ 2.5\pgflinewidth (absolute)
  const unit = c.hasUnit(size), s = (unit ? c.len(size) : c.num(size) * CM * c.unitK()) * scale, sAbs = c.num(size) * CM * scale;
  const ms = c.len(mksize);
  if (![s, ms, mkpos, scale].every(Number.isFinite)) return c.why(`\\${c.name}: size=${size}`);
  if (arc !== 'l' && unit) return c.why(`\\${c.name}: arc=${arc} with size in units (a LaTeX error)`);
  const [t1, t2] = normAngles(slope(p[1], p[0]), slope(p[1], p[2])), O = p[1];
  const lw = widthOf(c.X, rest, c.baseWidth()), radii = arc === 'l' ? [s] : arc === 'll' ? [sAbs - 2.5 * lw * scale, sAbs + 2.5 * lw * scale] : arc === 'lll' ? [s, sAbs - 2.5 * lw * scale, sAbs + 2.5 * lw * scale] : null;
  if (!radii) return c.why(`\\${c.name}: arc=${arc}`);
  for (const r of radii) c.out.push(`\\draw[${join(opt(rest), 'fill=none')}] ${arcPath(O, r, t1, t2)};`);
  if (mark !== 'none') {
    const t = t1 + (t2 - t1) * mkpos, q = add(O, rot({ x: s, y: 0 }, t)), u = rot({ x: 0, y: 1 }, t);
    markAt(c, mark, ms, c.baseWidth(), q, u, mkcolor);
  }
}
def('tkzMarkAngle', '[(', (c, a) => markAngle(c, a[0].o, list(c.X, a[1].o)));
def('tkzMarkAngles', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) markAngle(c, a[0].o, g); });
// \tkzMarkRightAngle[size=.25, o](A,O,B): (O) --++(k·û) --++(k·v̂) --++(−k·û) -- (O), k = size cm (pt, not xy);
// german: the arc of radius size and a 3pt dot on the bisector at size/2
function rightAngle(c: Ctx, o: string, L: string[]) {
  if (L.length !== 3) return c.why(`\\${c.name}(${L.join(',')}): three points`);
  const p = c.pts(L);
  if (!p) return null;
  let size = 0.25, german = false, dot = '3pt';
  const rest: any[] = [];
  for (const x of items(c.X, o)) {
    if (x.k === 'size') size = c.num(x.v);
    else if (x.k === 'german') german = true;
    else if (x.k === 'norm tkz code') german = x.v === 'false';
    else if (x.k === 'dotsize' && x.v) dot = x.v;
    else rest.push(x);
  }
  if (!Number.isFinite(size)) return c.why(`\\${c.name}: size`);
  const O = p[1], u = sub(p[0], O), v = sub(p[2], O), nu = norm(u), nv = norm(v);
  if (!nu || !nv) return c.why(`\\${c.name}: a side of no length`);
  const k = CM * size, a = mul(u, k / nu), b = mul(v, k / nv);
  if (!german) {
    const nm = L[1];
    c.out.push(`\\draw${rest.length ? `[${opt(rest)}]` : ''} (${nm}) -- ++${P(a)} -- ++${P(b)} -- ++${P(mul(a, -1))} -- (${nm});`);
    return;
  }
  if (!c.plainUnits()) return c.why(`\\${c.name} under x=/y= unit vectors`);
  if (rest.some((x) => XF.test(x.k))) return c.why(`\\${c.name}: a transform in its options`);
  const [t1, t2] = normAngles(slope(O, p[0]), slope(O, p[2])), tm = (t1 + t2) / 2;
  const R = size * CM * c.unitK();
  c.out.push(`\\draw${rest.length ? `[${opt(rest)}]` : ''} ${arcPath(O, R, t1, t2)};`);
  c.out.push(`\\node[fill, circle, minimum size=${dot}, inner sep=0pt${rest.length ? ', ' + opt(rest) : ''}] at ${P(add(O, rot({ x: R / 2, y: 0 }, tm)))} {};`);
}
def('tkzMarkRightAngle', '[(', (c, a) => rightAngle(c, a[0].o, list(c.X, a[1].o)));
def('tkzMarkRightAngles', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) rightAngle(c, a[0].o, g); });
// \tkzMarkSegment[mark=|, size=4pt, pos=.5, color=black, o](A,B): the plot mark at pos along AB, its x axis along
// it, stroked with o (its line width too)
function markSegment(c: Ctx, o: string, L: string[]) {
  if (L.length !== 2) return c.why(`\\${c.name}(${L.join(',')}): two points`);
  const p = c.pts(L);
  if (!p) return null;
  let mark = '|', size = '4pt', pos = 0.5, color = 'black';
  const rest: any[] = [];
  for (const x of items(c.X, o)) {
    if (x.k === 'mark' && x.v) mark = x.v;
    else if (x.k === 'size' && x.v) size = x.v;
    else if (x.k === 'pos') pos = c.num(x.v);
    else if (x.k === 'color' && x.v) color = x.v;
    else if (XF.test(x.k)) return c.why(`\\${c.name}: ${x.k}`);
    else rest.push(x);
  }
  const s = c.len(size), d = sub(p[1], p[0]), n = norm(d);
  if (!Number.isFinite(s) || !Number.isFinite(pos) || !n) return c.why(`\\${c.name}: size=${size}`);
  markAt(c, mark, s, widthOf(c.X, rest, c.baseWidth()), add(p[0], mul(d, pos)), mul(d, 1 / n), color, opt(rest));
}
def('tkzMarkSegment', '[(', (c, a) => markSegment(c, a[0].o, list(c.X, a[1].o)));
def('tkzMarkSegments', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) markSegment(c, a[0].o, g); });
// \tkzFillAngle[size=1, o](A,O,B): \path[shift={(O)}, fill=black!10, o] (O) -- (θ1:size) arc (θ1:θ2:size) -- cycle
function fillAngle(c: Ctx, o: string, L: string[]) {
  if (L.length !== 3) return c.why(`\\${c.name}(${L.join(',')}): three points`);
  const p = c.pts(L);
  if (!p) return null;
  let size = 1;
  const rest: any[] = [];
  for (const x of items(c.X, o)) {
    if (x.k === 'size') size = c.num(x.v);
    else if (XF.test(x.k)) return c.why(`\\${c.name}: ${x.k} after the shift`);
    else rest.push(x);
  }
  if (!c.plainUnits() || !Number.isFinite(size)) return c.why(`\\${c.name}: size`);
  const [t1, t2] = normAngles(slope(p[1], p[0]), slope(p[1], p[2]));
  c.out.push(`\\path[${join('fill=black!10', opt(rest))}] (${L[1]}) -- ${arcPath(p[1], size * CM * c.unitK(), t1, t2)} -- cycle;`);
}
def('tkzFillAngle', '[(', (c, a) => fillAngle(c, a[0].o, list(c.X, a[1].o)));
def('tkzFillAngles', '[(', (c, a) => { for (const g of groups(c.X, a[1].o)) fillAngle(c, a[0].o, g); });

// ---------- the \tkzInit frame's grid and axes ----------
// \tkzGrid: \draw[color=gray, line width=0.4pt] (xa,ya) grid (xb,yb) with TikZ's 1cm step (sub: first the 0.2
// steps at 0.75pt in gray!50); the frame's ends mapped as the points are
def('tkzGrid', '[oo', (c, a) => {
  if ((c.C.pkgs || []).includes('tkz-base')) { c.why('\\tkzGrid with tkz-base loaded (its own grid)'); return; }
  if (c.styleOf(GRID) == null) return;
  // (xmin,ymin)(xmax,ymax) when given, else \tkzInit's ends as written
  const I = c.st.init, two = a[1].o.trim() && a[2].o.trim();
  let R = I.raw;
  if (two) {
    const [p, q] = [a[1].o, a[2].o].map((t) => c.X.splitTop(t, ',').map((v: string) => c.fp(v)));
    if (p.length !== 2 || q.length !== 2 || ![...p, ...q].every(Number.isFinite)) { c.why(`\\tkzGrid(${a[1].o})(${a[2].o})`); return; }
    R = { xmin: p[0], ymin: p[1], xmax: q[0], ymax: q[1] };
  } else if (a[1].o.trim()) { c.why('\\tkzGrid: one corner'); return; }
  let color = 'gray', lw = '0.4pt', sub0 = false, sx = 0.2, sy = 0.2;
  for (const x of items(c.X, a[0].o)) {
    if (x.k === 'color' && x.v) color = x.v;
    else if (x.k === 'line width' && x.v) lw = x.v;
    else if (x.k === 'sub') sub0 = x.v !== 'false';
    else if (x.k === 'subxstep') sx = c.fp(x.v ?? '');
    else if (x.k === 'subystep') sy = c.fp(x.v ?? '');
    else { c.why(`\\tkzGrid: ${x.raw}`); return; }
  }
  const xa = (R.xmin - I.xo) / I.xstep, xb = (R.xmax - I.xo) / I.xstep, ya = (R.ymin - I.yo) / I.ystep, yb = (R.ymax - I.yo) / I.ystep;
  const box = `(${f(xa)},${f(ya)}) grid (${f(xb)},${f(yb)})`;
  if (sub0) c.out.push(`\\draw[xstep=${f(sx / I.xstep)}cm, ystep=${f(sy / I.ystep)}cm, color=${color}!50, line width=0.75pt] ${box};`);
  c.out.push(`\\draw[color=${color}, line width=${c.hasUnit(lw) ? lw : f(c.num(lw)) + 'pt'}] ${box};`);
});
// \tkzDrawX / \tkzDrawY: \draw[>=latex, ->, black] from the frame's start (less left space, 0) to its end (plus right
// space, .5), node[below=3pt (left=3pt), inner sep=1pt, outer sep=0pt]{$x$} at the end; ticks are off by default
function axis(c: Ctx, o: string, y: boolean) {
  if ((c.C.pkgs || []).includes('tkz-base')) return c.why(`\\${c.name} with tkz-base loaded (its own axes)`);
  if ((y ? ['yaxe style', 'ylabel style'] : ['xaxe style', 'xlabel style']).some((n) => c.styleOf(n) == null)) return null;
  const I = c.st.init;
  let label = y ? '$y$' : '$x$', lo = 0, hi = 0.5;
  for (const x of items(c.X, o)) {
    if (x.k === 'label') label = x.v ?? '';
    else if (x.k === 'noticks' && x.v !== 'false') { /* the default */ }
    else if (x.k === (y ? 'up space' : 'right space')) hi = c.fp(x.v ?? '');
    else if (x.k === (y ? 'down space' : 'left space')) lo = c.fp(x.v ?? '');
    else return c.why(`\\${c.name}: ${x.raw}`);
  }
  const a0 = (y ? I.ya : I.xa) - lo, a1 = (y ? I.yb : I.xb) + hi;
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return c.why(`\\${c.name}: a space`);
  const at = (v: number) => (y ? `(0,${f(v)})` : `(${f(v)},0)`);
  c.out.push(`\\draw[-latex, color=black] ${at(a0)} -- ${at(a1)};`);
  if (label) c.out.push(`\\node[${y ? 'left' : 'below'}=3pt, inner sep=1pt, outer sep=0pt] at ${at(a1)} {${label}};`);
}
def('tkzDrawX', '[', (c, a) => axis(c, a[0].o, false));
def('tkzDrawY', '[', (c, a) => axis(c, a[0].o, true));

// ---------- set-ups ----------
// \tkzSetUpLine, \tkzSetUpPoint … redefine tkz-euclide's styles (\tikzset{line style/.append style={line width=…, color=…,
// …}}; the grid's and colours' set their macros): held as those styles set to the command's name, a key the shapes
// don't hold, so the drawings that take them stay code. \tkzSetUpStyle[o]{name} is \tikzset{name/.style={o}}.
const GRID = 'tkz grid';
const SETUP: Record<string, string[]> = {
  tkzSetUpPoint: ['point style'], tkzSetUpLine: ['line style'], tkzSetUpCircle: ['circle style'], tkzSetUpArc: ['arc style'],
  tkzSetUpLabel: ['label style'], tkzSetUpCompass: ['compass style'], tkzSetUpGrid: [GRID],
  tkzSetUpAxis: ['xaxe style', 'yaxe style', 'xlabel style', 'ylabel style'],
};
SETUP.tkzSetUpColors = SETUP.tkzSetUpAllColors = [...new Set(Object.values(SETUP).flat()), 'label angle style', 'dim style'];
for (const [nm, styles] of Object.entries(SETUP)) def(nm, '[', (c) => { for (const k of styles) c.C.styles?.set(k, `/tkz/${nm}`); });
def('tkzSetUpStyle', '[{', (c, a) => { const nm = clean(a[1].o); if (nm) c.X.style(nm, a[0].o); });

// ---------- clips ----------
// \tkzClip[space=s]: \clip (xa−s, ya−s) rectangle (xb+s, yb+s) in the \tkzInit frame; \tkzClipCircle(O,A):
// \clip (O) circle (|OA| pt); \tkzClipPolygon(P1,…): \clip (P1)--…--cycle. Held as the region itself, undrawn
// (TikZ adds a clip's path to the picture's size), while nothing drawn after it in the picture crosses it
// (checkClips, once the picture is read); [out] clips the other way and stays code
function clipOut(c: Ctx, o: string) {
  const it = items(c.X, o);
  // (in a scope a clip ends with it: not followed here)
  if ((c.C.scopes || []).length > 1) { c.why(`\\${c.name} in a scope`); return null; }
  if (it.some((x: any) => x.k === 'out')) { c.why(`\\${c.name}[out] clips outside`); return null; }
  return it;
}
def('tkzClip', '[', (c, a) => {
  const it = clipOut(c, a[0].o);
  if (!it) return;
  let s = 0;
  for (const x of it) { if (x.k === 'space') s = x.v ? c.fp(x.v) : 0; else { c.why(`\\tkzClip: ${x.raw}`); return; } }
  const I = c.st.init;
  if (!Number.isFinite(s)) { c.why('\\tkzClip: space'); return; }
  c.out.push(`\\path (${f(I.xa - s)},${f(I.ya - s)}) rectangle (${f(I.xb + s)},${f(I.yb + s)});`);
  c.clip = true;
});
def('tkzClipCircle', '[(', (c, a) => {
  const L = list(c.X, a[1].o), p = clipOut(c, a[0].o) && c.pts(L);
  if (!p || p.length !== 2) return;
  c.out.push(`\\path (${L[0]}) circle[radius=${f(Math.round(norm(sub(p[1], p[0])) * 1e6) / 1e6)}pt];`);
  c.clip = true;
});
def('tkzClipPolygon', '[(', (c, a) => {
  const L = list(c.X, a[1].o);
  if (!clipOut(c, a[0].o) || !c.pts(L)) return;
  if (L.length < 3) { c.why('\\tkzClipPolygon: fewer than three points'); return; }
  c.out.push(`\\path ${L.map((n) => `(${n})`).join(' -- ')} -- cycle;`);
  c.clip = true;
});
// whether box b (px) lies inside clip region g (the undrawn rectangle, circle or polygon a clip statement made)
function inside(g: any, b: any) {
  const e = 0.01, cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
  if (g.type === 'rect' && !g.rot) return b.x >= g.x - e && b.y >= g.y - e && b.x + b.w <= g.x + g.w + e && b.y + b.h <= g.y + g.h + e;
  if (g.type === 'ellipse' && Math.abs(g.rx - g.ry) < 1e-6 && !g.rot) return cs.every(([x, y]) => Math.hypot(x - g.cx, y - g.cy) <= g.rx + e);
  if (g.type === 'poly' && g.closed && g.pts.length >= 3) {
    // a convex polygon: each corner on the inner side of every edge
    const P = g.pts, n = P.length;
    let sgn = 0;
    for (let k = 0; k < n; k++) {
      const [ax, ay] = P[k], [bx, by] = P[(k + 1) % n], [cx, cy] = P[(k + 2) % n], z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      if (Math.abs(z) < 1e-9) continue;
      if (sgn && Math.sign(z) !== sgn) return false;
      sgn = Math.sign(z);
    }
    return cs.every(([x, y]) => P.every(([ax, ay]: number[], k: number) => { const [bx, by] = P[(k + 1) % n]; return sgn * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) >= -e; }));
  }
  return false;
}
/** Once a picture is read: a tkz clip that something drawn after it would cross (its box, with arrow tips and the
 * line's own width) is kept as code after all, the clip TikZ applies; `read` (the picture's shapes) follows. */
export function tkzCheckClips(C: any, read: any[]) {
  for (const st of C.tkzClips || []) {
    const k = C.stmts.indexOf(st), g = st.shapes[0];
    if (k < 0 || st.raw) continue;
    let bad = st.shapes.length !== 1 ? 'not one region' : '';
    for (const u of C.stmts.slice(k + 1)) {
      if (bad) break;
      // code kept with nothing to show for it may draw anywhere (definitions draw nothing)
      if (u.raw && u.shapes[0]?.kind !== 'defs' && !u.shapes[0]?.prev?.length) { bad = 'code kept as code after it'; break; }
      for (const sh of u.raw ? (u.shapes[0]?.prev || []) : u.shapes) {
        if (sh.type === 'coord' || sh.type === 'tikz') continue;
        const b = TD.bbox(sh), tip = (sh.startTip && sh.startTip !== 'none') || (sh.endTip && sh.endTip !== 'none') ? 6 * (sh.width || 0) + 4 : 0;
        const m = tip + (sh.type === 'poly' && sh.join !== 'round' ? 5 * (sh.width || 0) : 0);
        if (!inside(g, { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m })) { bad = 'what is drawn after it crosses it'; break; }
      }
    }
    if (!bad) continue;
    const kept = { type: 'tikz', kind: 'code', code: '', x: 0, y: 0, ctx: [], prev: [g], issues: [`the clip is kept as code: ${bad}`], ...(C.libs?.length ? { libs: C.libs.slice() } : {}), ...(C.pkgs?.length ? { pkgs: C.pkgs.slice() } : {}) };
    const at = read.indexOf(g);
    st.shapes = [kept]; st.raw = true;
    if (at >= 0) read[at] = kept;
  }
}

// ---------- the command at s[j] (just past its name) ----------
/** A tkz-euclide command: the TikZ it stands for (tikz, '' when it draws nothing), why it stays code (issues) and
 * where it ends: its own arguments, then a ; if one follows (tkz commands end without one). */
export function tkzStatement(X: any, C: any, s: string, o: string, j: number, name: string) {
  const h = H[name], sig = h ? h[0] : null, args: Arg[] = [];
  let q = j;
  const ws = () => { while (q < s.length && /\s/.test(s[q])) q++; };
  const take = (k: '[' | '(' | '{') => {
    const save = q;
    ws();
    if (s[q] !== k) { q = save; return false; }
    const e = X.matchClose(s, q, k, k === '[' ? ']' : k === '(' ? ')' : '}');
    if (e < 0) { q = save; return false; }
    args.push({ k, s: s.slice(q + 1, e), o: o.slice(q + 1, e) });
    q = e + 1;
    return true;
  };
  let ok = true;
  if (sig) {
    for (const k of sig) {
      if (k === '[') { if (!take('[')) args.push({ k: '[', s: '', o: '' }); }
      else if (k === 'o') { if (!take('(')) args.push({ k: '(', s: '', o: '' }); }
      else if (!take(k as any)) { ok = false; break; }
    }
  } else {
    // a command not read here: its brackets, parentheses and braces as they come
    while (take('[') || take('(') || take('{')) { /* its arguments */ }
  }
  const semi = /^[ \t]*;/.exec(s.slice(q)); if (semi) q += semi[0].length;
  const c = new Ctx(X, C, name);
  // a command not read may set tkzPointResult (\tkzDefTriangleCenter …) or a scalar: what came before is gone
  if (!h || !ok) { c.result(null, null, null); c.st.angle = c.st.length = null; }
  if (!h) return { end: q, tikz: '', issues: [`\\${name} is kept as code`] };
  if (!ok) return { end: q, tikz: '', issues: [`\\${name}: its arguments not understood`] };
  try { h[1](c, args); } catch (e: any) { c.issues.push(`\\${name}: ${e?.message || e}`); }
  return { end: q, tikz: c.issues.length ? '' : c.out.join('\n'), issues: c.issues, clip: c.clip && !c.issues.length };
}

TD.tkz = { statement: tkzStatement, checkClips: tkzCheckClips, fp: fpEval };
