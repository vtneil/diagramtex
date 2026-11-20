import type { QuantityParameter } from './contracts';
import { runtime as TD } from '../runtime';
import { unbraceOnce as unbrace } from './tex-groups';
// Physics block: a constraint-aware physics figure described by a short LaTeX-flavoured source, one domain per
// block (optics, fields, waves, spacetime, energy levels, mechanics). Each line is one object:
//
//   \physics{optics}
//   \lens[f=2, label=$L_1$](3)          a command, its options and its position(s)
//   % comments, and lines the block does not know, are kept as written
//   \draw[dashed] (0,0) -- (1,1);       plain TikZ passes through to the drawing and the export
//
// A domain module (phys-*.ts) reads the objects, solves the physics (ray tracing, field lines, Lorentz
// transforms, …) and draws into a scene of lines, polygons, dots and labels in centimetres. The same scene
// draws the preview (view3d's renderer) and writes the TikZ, so the two agree. Every computed value is a
// result with a kind: exact, ideal (exact within a stated idealisation), approx (an approximation) or
// schematic (drawn, not computed), so an approximation is never shown as exact.
const V3 = TD.V3;
const { esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

// ---------------------------------------------------------------- numbers and units
const fmt = (v: number, d = 4) => {
  if (!isFinite(v)) return String(v);
  const s = String(+(+v).toFixed(d));
  return s === '-0' ? '0' : s;
};
// significant figures for reported results
const sig = (v: number, n = 4) => {
  if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
  if (v === 0) return '0';
  const a = Math.abs(v), e = Math.floor(Math.log10(a));
  if (e >= 6 || e <= -4) { const m = v / Math.pow(10, e); return `${String(+m.toFixed(n - 1))}×10^${e}`; }
  return String(+v.toFixed(Math.max(0, n - 1 - e))).replace('-', '−');
};
// unit families: the factor to the family's base unit
const UNITS: Record<string, Record<string, number>> = {
  len: { m: 1, km: 1e3, cm: 1e-2, mm: 1e-3, um: 1e-6, 'μm': 1e-6, 'µm': 1e-6, nm: 1e-9, pm: 1e-12, 'Å': 1e-10, A: 1e-10 },
  energy: { eV: 1, meV: 1e-3, keV: 1e3, MeV: 1e6, J: 1 / 1.602176634e-19 },
  angle: { deg: 1, '°': 1, rad: 180 / Math.PI },
  mass: { kg: 1, g: 1e-3 },
  force: { N: 1, kN: 1e3 },
  stiff: { 'N/m': 1, 'N/cm': 100 },
  charge: { C: 1, mC: 1e-3, uC: 1e-6, 'µC': 1e-6, 'μC': 1e-6, nC: 1e-9, pC: 1e-12, e: 1.602176634e-19 },
  current: { A: 1, mA: 1e-3, kA: 1e3 },
  efield: { 'N/C': 1, 'V/m': 1, 'kV/m': 1e3, 'V/cm': 100 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, 'cm/s': 1e-2 },
  accel: { 'm/s^2': 1, 'm/s2': 1 },
  time: { s: 1, ms: 1e-3 },
};
const NUM = /^([-+−]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([^\d\s][^\s]*)?$/;
/** A quantity as written ("500nm", "30", "1.2e-3 m") in the base unit of its family; null when unreadable. */
function quantity(text: string | number, p: QuantityParameter): number | null {
  const m = NUM.exec(String(text).trim());
  if (!m) return null;
  const v = parseFloat(m[1].replace('−', '-'));
  const fam = p.dim && UNITS[p.dim];
  if (!m[2]) return fam ? v * (fam[p.unit!] ?? 1) : v;
  if (!fam || !(m[2] in fam)) return null;
  return v * fam[m[2]];
}
// a value in a parameter's display unit, written with the unit when the family has one
function writeQ(v: number, p: QuantityParameter): string {
  const fam = p.dim && UNITS[p.dim];
  if (!fam) return fmt(v, p.dp ?? 4);
  return fmt(v / (fam[p.unit!] ?? 1), p.dp ?? 4) + (p.unit === 'deg' ? '' : p.unit);
}

// ---------------------------------------------------------------- source
// A balanced group from s[i] (the opening character); $…$ and {…} are opaque. Returns the index after it.
function group(s: string, i: number, open: string, close: string): number {
  let depth = 0, brace = 0, math = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '$') { math = !math; continue; }
    if (math) continue;
    if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (brace === 0 && c === open) depth++;
    else if (brace === 0 && c === close) { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}
function splitTop(s: string, sep = ','): string[] {
  const out = [];
  let brace = 0, math = false, from = 0, paren = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '$') { math = !math; continue; }
    if (math) continue;
    if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === sep && !brace && !paren) { out.push(s.slice(from, j).trim()); from = j + 1; }
  }
  out.push(s.slice(from).trim());
  return out.filter((x, i, a) => x !== '' || a.length > 1);
}
function kv(part: string): { k: string; v: string | null } {
  const s = splitTop(part, '=');
  if (s.length < 2) return { k: part.trim(), v: null };
  const i = part.indexOf('=');
  return { k: part.slice(0, i).trim(), v: unbrace(part.slice(i + 1)) };
}
// the main editor's drawing objects a figure can hold: not blocks, plots, 3D, images or kept code
const SHAPE_OK = (type: any) => !['physics', 'plot', 'pie', 'solid', 'prim3d', 'revolve', 'image', 'tikz', 'group'].includes(type) && !(TD.blocks && TD.blocks.get && TD.blocks.get(type));
const r2s = (v: any): any => (typeof v === 'number' ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(r2s) : v && typeof v === 'object' ? Object.fromEntries<any>(Object.entries<any>(v).map(([k, x]) : any => [k, r2s(x)])) : v);
/** The source line for a shape object (its id and other app bookkeeping left out). */
function shapeLine(sh: any) {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(sh)) if (k !== 'id' && k !== 'g' && k[0] !== '_' && v !== undefined) o[k] = r2s(v);
  return '\\shape' + JSON.stringify({ type: o.type, ...o });
}
const RAW = new Set(['draw', 'fill', 'filldraw', 'node', 'path', 'coordinate', 'shade', 'shadedraw', 'foreach', 'clip', 'pic']);
function parseLine(raw: any) {
  const t = raw.trim();
  if (!t || t[0] === '%') return { raw, kind: 'comment' };
  let m = /^\\physics\s*\{\s*([A-Za-z]+)\s*\}\s*(%.*)?$/.exec(t);
  if (m) return { raw, kind: 'header', domain: m[1] };
  // a shape drawn with the main editor's tools: its object as JSON, in px of the figure's frame (x right, y down,
  // 1cm = PX px, origin at the figure's 0,0), drawn and exported by the shape's own code (TD.TYPES)
  m = /^\\shape\s*(\{.*\})\s*$/.exec(t);
  if (m) {
    let sh = null;
    try { sh = JSON.parse(m[1]); } catch {}
    if (sh && typeof sh === 'object' && TD.TYPES && TD.TYPES[sh.type] && SHAPE_OK(sh.type)) return { raw, kind: 'shape', shape: sh };
    return { raw, kind: 'unknown', cmd: 'shape', why: sh ? `“${sh.type}” is not a shape the figure can hold` : 'a shape that is not valid JSON' };
  }
  m = /^\\([A-Za-z]+)/.exec(t);
  if (!m) return { raw, kind: 'unknown' };
  const cmd = m[1];
  if (RAW.has(cmd)) return { raw, kind: 'tikz' };
  let i = m[0].length;
  const ws = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  ws();
  let opts: any[] = [];
  if (t[i] === '[') {
    const e = group(t, i, '[', ']');
    if (e < 0) return { raw, kind: 'unknown', cmd, why: 'an option list without its ]' };
    const body = t.slice(i + 1, e - 1).trim();
    opts = body ? splitTop(body).filter(Boolean).map(kv) : [];
    i = e;
  }
  const args = [];
  for (;;) {
    ws();
    if (t[i] !== '(') break;
    const e = group(t, i, '(', ')');
    if (e < 0) return { raw, kind: 'unknown', cmd, why: 'a position without its )' };
    args.push(splitTop(t.slice(i + 1, e - 1)));
    i = e;
  }
  const rest = t.slice(i).trim();
  if (rest && rest[0] !== '%') return { raw, kind: 'unknown', cmd, why: `unexpected text “${rest.slice(0, 24)}”` };
  return { raw, kind: 'cmd', cmd, opts, args, comment: rest };
}
// multi-line TikZ statements run until a ; outside braces
const ends = (s: any) => { const t = s.replace(/%.*$/, '').trim(); return t.endsWith(';'); };
function parse(src: any) {
  const lines = [], text = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let domain = null;
  for (let i = 0; i < text.length; i++) {
    const L = parseLine(text[i]);
    if (L.kind === 'tikz' && !ends(text[i])) {
      let j = i;
      while (j + 1 < text.length && !ends(text[j])) j++;
      L.raw = text.slice(i, j + 1).join('\n');
      i = j;
    }
    if (L.kind === 'header' && !domain) domain = L.domain;
    lines.push(L);
  }
  return { domain, lines };
}
function optStr(o: any) {
  if (o.v == null) return o.k;
  const plain = o.v.replace(/\$[^$]*\$/g, '');
  return `${o.k}=${/[,=[\]]/.test(plain) || /^\s|\s$/.test(o.v) || !o.v ? `{${o.v}}` : o.v}`;
}
function build(L: any) {
  return `\\${L.cmd}${L.opts.length ? `[${L.opts.map(optStr).join(', ')}]` : ''}${L.args.map((a: any) => `(${a.join(', ')})`).join('')}${L.comment ? ' ' + L.comment : ''}`;
}
const serialize = (M: any) => M.lines.map((L: any) => L.raw).join('\n');
// edits keep the rest of the line (option order, other options, the comment) as written
function setOpt(L: any, k: any, v: any) {
  const i = L.opts.findIndex((o: any) => o.k === k);
  if (v == null || v === '') { if (i >= 0) L.opts.splice(i, 1); }
  else if (i >= 0) L.opts[i] = { k, v: String(v) };
  else L.opts.push({ k, v: String(v) });
  L.raw = build(L);
}
const getOpt = (L: any, k: any) => { const o = L.opts && L.opts.find((x: any) => x.k === k); return o ? o.v : undefined; };
function setArg(L: any, i: any, vals: any) { L.args[i] = vals.map((v: any) => (typeof v === 'number' ? fmt(v, 3) : v)); L.raw = build(L); }

// ---------------------------------------------------------------- objects
/** A command's options read against its schema: { v: values, warn: [messages] }. */
function read(L: any, spec: any) {
  const v: Record<string, any> = {}, warn = [];
  const ps = spec.params || [];
  for (const p of ps) {
    const raw = getOpt(L, p.k);
    if (raw === undefined || raw === null) { v[p.k] = typeof p.def === 'function' ? p.def(v) : p.def; continue; }
    if (p.kind === 'text') { v[p.k] = raw; continue; }
    if (p.kind === 'bool') { v[p.k] = !/^(false|no|0|off)$/i.test(raw); continue; }
    if (p.kind === 'enum') {
      if (p.opts.some(([x]: any) => x === raw)) v[p.k] = raw;
      else { warn.push(`${p.k}=${raw}: expected ${p.opts.map(([x]: any) => x).join(', ')}`); v[p.k] = p.def; }
      continue;
    }
    const q = quantity(raw, p);
    if (q == null || !isFinite(q)) { warn.push(`${p.k}=${raw} is not a ${p.dim ? `${p.dim === 'len' ? 'length' : p.dim} (e.g. 1${p.unit})` : 'number'}`); v[p.k] = p.def; continue; }
    let x = q;
    const lo = p.min, hi = p.max, base = (b: any) => (p.dim && UNITS[p.dim] ? b * (UNITS[p.dim][p.unit] ?? 1) : b);
    if (lo != null && x < base(lo) - 1e-12) { warn.push(`${p.k} must be at least ${fmt(lo)}${p.unit && p.dim ? ' ' + p.unit : ''}; drawn with ${fmt(lo)}`); x = base(lo); }
    if (hi != null && x > base(hi) + 1e-12) { warn.push(`${p.k} must be at most ${fmt(hi)}${p.unit && p.dim ? ' ' + p.unit : ''}; drawn with ${fmt(hi)}`); x = base(hi); }
    if (p.nonzero && x === 0) { warn.push(`${p.k} cannot be 0`); x = p.def; }
    v[p.k] = x;
  }
  for (const o of L.opts) if (!ps.some((p: any) => p.k === o.k)) warn.push(`unknown option “${o.k}” (kept in the code)`);
  const na = spec.args || 0, have = L.args.length;
  if (have < (spec.minArgs ?? na)) warn.push(`needs ${spec.argHelp || `${na} position${na === 1 ? '' : 's'}`}`);
  return { v, warn };
}
// a position argument: numbers → [x, y] (one number: on the axis, y = 0), a name → { ref }
function pos(L: any, i: any, def = [0, 0]) {
  const a = L.args[i];
  if (!a || !a.length) return { p: def.slice(), one: false, missing: true };
  if (a.length === 1 && !/^[-+−.\d]/.test(a[0])) return { ref: a[0] };
  const n = a.map((x: any) => parseFloat(String(x).replace('−', '-')));
  if (n.some((x: any) => !isFinite(x))) return { p: def.slice(), bad: true };
  return { p: [n[0], n.length > 1 ? n[1] : 0], one: n.length === 1 };
}

// ---------------------------------------------------------------- geometry
const G = {
  add: (a: any, b: any) => [a[0] + b[0], a[1] + b[1]],
  sub: (a: any, b: any) => [a[0] - b[0], a[1] - b[1]],
  mul: (a: any, k: any) => [a[0] * k, a[1] * k],
  dot: (a: any, b: any) => a[0] * b[0] + a[1] * b[1],
  cross: (a: any, b: any) => a[0] * b[1] - a[1] * b[0],
  len: (a: any) => Math.hypot(a[0], a[1]),
  norm: (a: any) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  dir: (deg: any) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)],
  ang: (a: any) => (Math.atan2(a[1], a[0]) * 180) / Math.PI,
  rot: (a: any, deg: any) => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; },
  lerp: (a: any, b: any, t: any) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  dist: (a: any, b: any) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  // where ray p + t d meets segment a–b: { t, s (0..1 along a–b) } or null
  raySeg(p: any, d: any, a: any, b: any) {
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) return null;
    const w = [a[0] - p[0], a[1] - p[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * d[1] - w[1] * d[0]) / den;
    return { t, s };
  },
  // intersections of two circles (centre, radius)
  circles(c1: any, r1: any, c2: any, r2: any) {
    const d = G.dist(c1, c2);
    if (d < 1e-12 || d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const m = G.add(c1, G.mul(G.sub(c2, c1), a / d)), u = G.mul([-(c2[1] - c1[1]) / d, (c2[0] - c1[0]) / d], h);
    return [G.add(m, u), G.sub(m, u)];
  },
  arc(c: any, r: any, a0: any, a1: any, n: any) {
    n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6));
    const out = [];
    for (let i = 0; i <= n; i++) { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return out;
  },
  // the part of the line p + t d inside a box { x0, y0, x1, y1 }: [a, b], or null (Liang–Barsky)
  clip(p: any, d: any, b: any, t0 = -Infinity, t1 = Infinity) {
    for (const [k, lo, hi] of [[0, b.x0, b.x1], [1, b.y0, b.y1]]) {
      if (Math.abs(d[k]) < 1e-12) { if (p[k] < lo - 1e-9 || p[k] > hi + 1e-9) return null; continue; }
      let a = (lo - p[k]) / d[k], c = (hi - p[k]) / d[k];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    if (!isFinite(t0) || !isFinite(t1)) return null;
    return [G.add(p, G.mul(d, t0)), G.add(p, G.mul(d, t1))];
  },
  // level curves of f over a box by marching squares, joined into polylines
  contours(f: any, b: any, nx: any, ny: any, level: any) {
    const dx = (b.x1 - b.x0) / nx, dy = (b.y1 - b.y0) / ny, V = [];
    for (let j = 0; j <= ny; j++) { const row = []; for (let i = 0; i <= nx; i++) row.push(f([b.x0 + i * dx, b.y0 + j * dy])); V.push(row); }
    const P = new Map(), adj = new Map(), segs: any[] = [];
    const pt = (key: any, p: any) => { if (!P.has(key)) P.set(key, p); return key; };
    const ex = (i: any, j: any, a: any, c: any) => { const t = (level - a) / (c - a); return [b.x0 + (i + t) * dx, b.y0 + j * dy]; };
    const ey = (i: any, j: any, a: any, c: any) => { const t = (level - a) / (c - a); return [b.x0 + i * dx, b.y0 + (j + t) * dy]; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = V[j][i], c = V[j][i + 1], e = V[j + 1][i + 1], d = V[j + 1][i];
      if (![a, c, e, d].every(isFinite)) continue;
      const idx = (a > level ? 1 : 0) | (c > level ? 2 : 0) | (e > level ? 4 : 0) | (d > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const B = () => pt(`h${i},${j}`, ex(i, j, a, c)), R = () => pt(`v${i + 1},${j}`, ey(i + 1, j, c, e));
      const T = () => pt(`h${i},${j + 1}`, ex(i, j + 1, d, e)), Lf = () => pt(`v${i},${j}`, ey(i, j, a, d));
      const add = (p: any, q: any) => segs.push([p, q]);
      const mid = (a + c + e + d) / 4 > level;
      switch (idx) {
        case 1: case 14: add(Lf(), B()); break;
        case 2: case 13: add(B(), R()); break;
        case 3: case 12: add(Lf(), R()); break;
        case 4: case 11: add(R(), T()); break;
        case 6: case 9: add(B(), T()); break;
        case 7: case 8: add(Lf(), T()); break;
        case 5: if (mid) { add(Lf(), T()); add(B(), R()); } else { add(Lf(), B()); add(R(), T()); } break;
        case 10: if (mid) { add(Lf(), B()); add(R(), T()); } else { add(Lf(), T()); add(B(), R()); } break;
      }
    }
    segs.forEach(([p, q], k) => { for (const x of [p, q]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(k); } });
    const used = new Uint8Array(segs.length), out = [];
    const walk = (start: any, k0: any) => {
      const line = [start];
      let cur = start, k = k0;
      while (k != null && !used[k]) {
        used[k] = 1;
        const [p, q] = segs[k], nxt = p === cur ? q : p;
        line.push(nxt); cur = nxt;
        k = (adj.get(cur) || []).find((m: any) => !used[m]);
      }
      return line;
    };
    // open curves start at an end (a key with one segment), then the closed loops
    for (const [key, list] of adj) if (list.length === 1 && !used[list[0]]) out.push(walk(key, list[0]));
    for (let k = 0; k < segs.length; k++) if (!used[k]) { const l = walk(segs[k][0], k); out.push(l); }
    return out.map((l) => l.map((key) => P.get(key)));
  },
  // Douglas–Peucker, for long computed curves (field lines, contours) so the TikZ stays readable
  simplify(pts: any, tol = 0.004) : any {
    if (pts.length < 3) return pts;
    // a closed curve: simplify the two halves either side of the point farthest from the start
    if (G.dist(pts[0], pts[pts.length - 1]) < 1e-9) {
      let far = 1, fd = -1;
      pts.forEach((p: any, k: any) => { const d = G.dist(p, pts[0]); if (d > fd) { fd = d; far = k; } });
      if (far <= 0 || far >= pts.length - 1) return pts;
      return [...G.simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...G.simplify(pts.slice(far), tol)];
    }
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop()!; let best = -1, bd = tol;
      const a = pts[i], b = pts[j], ab = G.sub(b, a), L = G.len(ab) || 1e-12;
      for (let k = i + 1; k < j; k++) { const d = Math.abs(G.cross(ab, G.sub(pts[k], a))) / L; if (d > bd) { bd = d; best = k; } }
      if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
    }
    return pts.filter((_: any, i: any) => keep[i]);
  },
};

// ---------------------------------------------------------------- scene
const LW: Record<string, any> = { thin: 0.4, normal: 0.8, thick: 1.2, vthick: 1.6 };
const box = (text: any) => { const b = TD.textBox(text, V3.NORMAL); return { w: b.w / PX, h: b.h / PX }; };
// distance from the segment a–b to the axis-aligned box at c (0 when they meet)
function segRect(a: any, b: any, c: any, w2: any, h2: any) {
  const x0 = c[0] - w2, x1 = c[0] + w2, y0 = c[1] - h2, y1 = c[1] + h2;
  // Liang–Barsky: does the segment cross the box?
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const clip = (p: any, q: any) => { if (Math.abs(p) < 1e-12) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  if (clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1])) return 0;
  const pr = (p: any) => Math.hypot(Math.max(0, Math.abs(p[0] - c[0]) - w2), Math.max(0, Math.abs(p[1] - c[1]) - h2));
  const ps = (p: any) => { const L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  return Math.min(pr(a), pr(b), ps([x0, y0]), ps([x0, y1]), ps([x1, y0]), ps([x1, y1]));
}

function Scene() {
  const S: Record<string, any> = { items: [], handles: [], results: [], warnings: [], bad: new Set(), obj: -1, tikz: [] };
  const C = (c: any) => V3.col(c || '#000000');
  S.line = (pts: any, o: Record<string, any> = {}) => { if (pts.length < 2) return; S.items.push({ k: 'line', pts, stroke: C(o.color), hex: o.color || '#000000', w: (LW[o.w] ?? o.w ?? LW.normal) / K, dash: o.dash ? true : false, arrow: !!o.arrow, arrow0: !!o.arrow0, opacity: o.opacity, obj: o.obj ?? S.obj }); };
  S.poly = (pts: any, o: Record<string, any> = {}) => S.items[o.back ? 'unshift' : 'push']({ k: 'poly', pts, fill: C(o.fill || '#ffffff'), hex: o.fill || '#ffffff', stroke: o.stroke === null ? null : C(o.stroke), shex: o.stroke === null ? null : o.stroke || '#000000', w: (LW[o.w] ?? o.w ?? LW.normal) / K, opacity: o.opacity, obj: o.obj ?? S.obj });
  S.dot = (at: any, o: Record<string, any> = {}) => S.items.push({ k: 'dot', at, r: o.r ?? 2.2, color: C(o.color), hex: o.color || '#000000', obj: o.obj ?? S.obj });
  S.circle = (c: any, r: any, o: Record<string, any> = {}) => { const pts = G.arc(c, r, 0, 360, o.n || 48); pts.pop(); if (o.fill) S.poly(pts, o); else S.line([...pts, pts[0]], o); };
  // a label: `anchor` is the side of the text the point is on (TikZ's anchor), `push` a direction to move off
  S.text = (at: any, text: any, o: Record<string, any> = {}) => {
    if (text == null || text === '') return;
    const b = box(text), c = S.spot(at, text, o);
    S.items.push({ k: 'text', at: c, text: String(text), color: o.color ? C(o.color) : undefined, hex: o.color, w2: b.w / 2, h2: b.h / 2, obj: o.obj ?? S.obj });
  };
  // where S.text would put the label's centre
  S.spot = (at: any, text: any, o: Record<string, any> = {}) => {
    const b = box(text), c = [at[0], at[1]], g = 2 / PX;
    const a = o.anchor || '';
    if (a.includes('west')) c[0] += b.w / 2 + g;
    if (a.includes('east')) c[0] -= b.w / 2 + g;
    if (a.includes('south')) c[1] += b.h / 2 + g;
    if (a.includes('north')) c[1] -= b.h / 2 + g;
    if (o.push) { const u = G.norm(o.push), off = 3 / PX + Math.abs(u[0]) * b.w / 2 + Math.abs(u[1]) * b.h / 2; c[0] += u[0] * off; c[1] += u[1] * off; }
    return c;
  };
  // how far a label box (centre c, half sizes w2 × h2) stays from every line and label drawn so far; 0 when touching
  S.clearance = (c: any, w2: any, h2: any) => {
    let d = Infinity;
    for (const it of S.items) {
      if (it.k === 'line') for (let i = 0; i + 1 < it.pts.length; i++) d = Math.min(d, segRect(it.pts[i], it.pts[i + 1], c, w2, h2));
      else if (it.k === 'text') d = Math.min(d, Math.hypot(Math.max(0, Math.abs(it.at[0] - c[0]) - it.w2 - w2), Math.max(0, Math.abs(it.at[1] - c[1]) - it.h2 - h2)));
    }
    return d;
  };
  // a label at the first of several places that keeps clear of the drawing, else the clearest of them.
  // Each place is { at, ...S.text options }.
  S.textAt = (places: any, text: any, o = {}, gap = 0.03) => {
    if (text == null || text === '' || !places.length) return;
    const b = box(text);
    let best = null, bd = -1;
    for (const pl of places) {
      const c = S.spot(pl.at, text, { ...o, ...pl }), d = S.clearance(c, b.w / 2, b.h / 2);
      if (d >= gap) { best = pl; break; }
      if (d > bd + 1e-9) { bd = d; best = pl; }
    }
    S.text(best.at, text, { ...o, ...best });
  };
  S.arrow = (a: any, b: any, o = {}) => S.line([a, b], { ...o, arrow: true });
  // a direction mark in the middle of a segment (a lone arrow head)
  S.mark = (a: any, b: any, o: Record<string, any> = {}) => { const d = G.norm(G.sub(b, a)), m = G.lerp(a, b, o.at ?? 0.5); S.line([G.sub(m, G.mul(d, 0.04)), G.add(m, G.mul(d, 0.04))], { ...o, arrow: true }); };
  // hatching on one side of a polyline (walls, grounds, mirror backs): short strokes at 45°
  S.hatch = (pts: any, side: any, o: Record<string, any> = {}) => {
    const step = o.step || 0.16, len = o.len || 0.16;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], L = G.dist(a, b), u = G.norm(G.sub(b, a)), n = G.mul([u[1], -u[0]], side);
      const dd = G.norm(G.add(n, G.mul(u, -1)));
      for (let s = (o.phase ?? step / 2); s < L; s += step) { const p = G.add(a, G.mul(u, s)); S.line([p, G.add(p, G.mul(dd, len))], { w: 'thin', color: o.color, obj: o.obj }); }
    }
  };
  S.handle = (h: any) => S.handles.push({ obj: S.obj, ...h });
  S.result = (label: any, value: any, kind: any, note: any) => S.results.push({ obj: S.obj, label, value, kind, note });
  S.warn = (msg: any, obj = S.obj) => { S.warnings.push({ obj, msg }); if (obj >= 0) S.bad.add(obj); };
  return S;
}

// ---------------------------------------------------------------- solving
const domains: Record<string, any> = {};
const cache = new Map();
/** The figure for a source: { M, domain, items, handles, results, warnings, bad, bb (cm), empty }. */
function solve(src: any) {
  src = String(src || '');
  if (cache.has(src)) return cache.get(src);
  const M = parse(src), S = Scene();
  const D = domains[(M.domain as any)];
  if (!M.domain) S.warn('the first line names the domain, e.g. \\physics{optics}', -1);
  else if (!D) S.warn(`unknown domain “${M.domain}”: ${Object.keys(domains).join(', ')}`, -1);
  M.lines.forEach((L, i) => {
    if (L.kind === 'unknown') S.warn(`line ${i + 1}: ${L.why || 'not a physics command'} (kept in the code)`, i);
    else if (L.kind === 'cmd' && D && !D.commands[(L.cmd as any)] && L.cmd !== 'physics') S.warn(`\\${L.cmd} is not a ${D.label.toLowerCase()} command (kept in the code)`, i);
  });
  if (D) {
    try { D.solve(M, S); } catch (e: any) { S.warn('could not solve the figure: ' + e.message, -1); }
  }
  // TikZ written as is: drawn through the 2D interpreter (geo2d), exported verbatim
  const raw = M.lines.filter((L) => L.kind === 'tikz').map((L) => L.raw);
  if (raw.length && TD.geo3d) {
    try {
      const R = TD.geo3d.layout(`\\begin{tikzpicture}\n${raw.join('\n')}\n\\end{tikzpicture}`, true);
      for (const it of R.items || []) S.items.push({ ...it, obj: -2 });
      for (const w of R.warnings || []) S.warn('TikZ: ' + w, -1);
    } catch (e: any) { S.warn('TikZ: ' + e.message, -1); }
    S.tikz = raw;
  }
  // shapes drawn with the main tools: their boxes count towards the figure's bounds
  S.shapes = [];
  M.lines.forEach((L, i) => { if (L.kind === 'shape') S.shapes.push({ i, s: L.shape }); });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p: any, rx = 0, ry = rx) => { if (!p || !isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0] - rx); x1 = Math.max(x1, p[0] + rx); y0 = Math.min(y0, p[1] - ry); y1 = Math.max(y1, p[1] + ry); };
  for (const it of S.items) {
    if (it.k === 'text') grow(it.at, it.w2 ?? box(it.text).w / 2, it.h2 ?? box(it.text).h / 2);
    else if (it.k === 'dot') grow(it.at, (it.r ?? 2.2) / PX);
    else for (const p of it.pts || []) grow(p, it.w ? it.w / 2 / PX : 0);
  }
  for (const { s: sh } of S.shapes) {
    try { const b = TD.bbox(sh); grow([b.x / PX, -(b.y + b.h) / PX]); grow([(b.x + b.w) / PX, -b.y / PX]); } catch {}
  }
  const empty = !isFinite(x0);
  if (empty) { x0 = 0; y0 = 0; x1 = 4; y1 = 2; }
  const pad = 0.05;
  const R = { M, domain: D, src, ...S, bb: { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }, empty };
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  cache.set(src, R);
  return R;
}

// ---------------------------------------------------------------- drawing and export
// the block's box in page px, relative to where the scene's origin is drawn
function layout(s: any) {
  const R = solve(s.src), b = R.bb;
  return { ...R, bb: { x: b.x0 * PX, y: -b.y1 * PX, w: (b.x1 - b.x0) * PX, h: (b.y1 - b.y0) * PX } };
}
const fitAt = (R: any, x: any, y: any) => ({ k: PX, px: (p: any) => ({ x: x + (p[0] - R.bb.x0) * PX, y: y + (R.bb.y1 - p[1]) * PX }) });
function draw(s: any, ctx: Record<string, any> = {}) {
  const R = solve(s.src), w = (R.bb.x1 - R.bb.x0) * PX, h = (R.bb.y1 - R.bb.y0) * PX;
  let out;
  if (R.empty) out = V3.errorSvg({ x: s.x, y: s.y, w, h }, R.warnings.length ? 'Physics: ' + R.warnings[0].msg : 'Empty physics figure', ctx);
  else out = V3.svg(R.items, fitAt(R, s.x, s.y), ctx) + shapesSvg(R, s.x - R.bb.x0 * PX, s.y + R.bb.y1 * PX, ctx);
  if (!ctx.export) out += `<rect class="hitfill" x="${s.x}" y="${s.y}" width="${w}" height="${h}"/>`;
  return out;
}
// the shapes in px of the figure's frame, moved to where its origin is drawn
function shapesSvg(R: any, ox: any, oy: any, ctx: any) {
  if (!R.shapes.length) return '';
  const c = { zoom: ctx.zoom || 1, hit: 0, export: true, scene: R.shapes.map((x: any) => x.s) };
  let body = '';
  for (const { s: sh } of R.shapes) { try { body += TD.TYPES[sh.type].svg(sh, c); } catch {} }
  return `<g transform="translate(${fmt(ox, 3)},${fmt(oy, 3)})">${body}</g>`;
}
// TikZ in the scene's centimetres, inside a scope shifted to where the block sits. Plain TikZ lines of
// the source use the same coordinates, so they land where the preview draws them.
const c3 = (p: any) => `(${fmt(p[0], 3)},${fmt(p[1], 3)})`;
function tikzItems(items: any, X: any) {
  const out = [];
  let arrows = false;
  const col = (hex: any) => X.col(hex || '#000000');
  const op = (v: any, k: any) => (v != null && v < 1 ? `, ${k}=${fmt(v, 2)}` : '');
  for (const it of items) {
    if (it.obj === -2) continue;
    if (it.k === 'line') {
      const o = [];
      if (col(it.hex) !== 'black') o.push(col(it.hex));
      o.push(`line width=${fmt(it.w * K, 2)}pt`);
      if (it.dash) o.push('dash pattern=on 3pt off 2.2pt');
      if (it.arrow || it.arrow0) { o.push(`${it.arrow0 ? '{Stealth[length=4pt]}' : ''}-${it.arrow ? '{Stealth[length=4pt]}' : ''}`); arrows = true; }
      out.push(`\\draw[${o.join(', ')}${op(it.opacity, 'opacity')}] ${it.pts.map(c3).join(' -- ')};`);
    } else if (it.k === 'poly') {
      const fo = op(it.opacity, 'fill opacity');
      if (it.shex) out.push(`\\filldraw[fill=${col(it.hex)}${fo}, draw=${col(it.shex)}, line width=${fmt(it.w * K, 2)}pt] ${it.pts.map(c3).join(' -- ')} -- cycle;`);
      else out.push(`\\fill[${col(it.hex)}${fo}] ${it.pts.map(c3).join(' -- ')} -- cycle;`);
    } else if (it.k === 'dot') out.push(`\\fill${col(it.hex) !== 'black' ? `[${col(it.hex)}]` : ''} ${c3(it.at)} circle (${fmt((it.r ?? 2.2) * K, 2)}pt);`);
    else if (it.k === 'text') out.push(`\\node${it.hex && col(it.hex) !== 'black' ? `[text=${col(it.hex)}]` : ''} at ${c3(it.at)} {${TD.tikzText(it.text)}};`);
  }
  if (arrows) X.libs.add('arrows.meta');
  return out;
}
function tikz(s: any, X: any) {
  const R = solve(s.src);
  if (R.empty) return `% physics figure: ${R.warnings.length ? R.warnings[0].msg : 'empty'}`;
  const o = X.c(s.x - R.bb.x0 * PX, s.y + R.bb.y1 * PX);
  const head = `% physics: ${R.domain ? R.domain.label : 'figure'} (DiagramTeX)`;
  const out = [head, `\\begin{scope}[shift={${o}}, line cap=round, line join=round]`, ...tikzItems(R.items, X), ...R.tikz, '\\end{scope}'];
  // the shapes as the main export writes them, in their own scope (the main canvas's line caps)
  if (R.shapes.length) {
    let lines = [];
    try { lines = TD.tikzLines(R.shapes.map((x: any) => x.s), X); } catch (e: any) { lines = ['% shapes: ' + e.message]; }
    if (lines.length) out.push(`\\begin{scope}[shift={${o}}]`, ...lines, '\\end{scope}');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- results
const KIND: Record<string, any> = {
  exact: ['exact', 'Computed exactly from the model'],
  ideal: ['ideal', 'Exact within the idealisation named in the note'],
  approx: ['approx.', 'An approximation: see the note for when it holds'],
  schematic: ['schematic', 'Drawn to show the idea, not computed to scale'],
};
function resultsHtml(R: any, only: any) {
  const list = R.results.filter((r: any) => only == null || r.obj === only);
  if (!list.length) return '';
  return `<div class="phy-res">${list.map((r: any) => `<div class="phy-r" title="${esc((KIND[r.kind] || KIND.exact)[1] + (r.note ? ' — ' + r.note : ''))}"><span class="phy-l">${esc(r.label)}</span><span class="phy-v">${esc(r.value)}</span><span class="phy-k phy-${esc(r.kind)}">${esc((KIND[r.kind] || KIND.exact)[0])}</span></div>`).join('')}</div>`;
}
const warningsHtml = (R: any, only: any) => R.warnings.filter((w: any) => only == null || w.obj === only).map((w: any) => `<div class="err">${esc(w.msg)}</div>`).join('');

// ---------------------------------------------------------------- block
const DEFAULT = () => (domains.optics ? domains.optics.example : '\\physics{optics}');
TD.TYPES.physics = {
  name: 'Physics',
  pts: [['x', 'y']],
  create: (p: any, d: any, tool: any) => {
    const k = String(tool || '').split(':')[1];
    return { type: 'physics', x: p.x, y: p.y, src: (k && domains[k] && domains[k].example) || DEFAULT() };
  },
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  tikz,
};


TD.physics = {
  domains, parse, parseLine, serialize, shapeLine, SHAPE_OK, build, setOpt, getOpt, setArg, read, pos, quantity, writeQ, fmt, sig, UNITS,
  G, Scene, box, solve, layout, draw, tikzItems, fitAt, resultsHtml, warningsHtml, KIND, LW,
  // a domain: { label, commands: { name: { label, params, args, icon?, make(x, y) → line text } }, example, solve(M, S) }
  domain(name: any, def: any) { domains[name] = { name, ...def }; cache.clear(); },
};
TD.blocks.register('physics', {
  menu: { order: 14, flyout: 'phys', label: 'Physics', title: 'Physics figures that are computed, not just drawn: ray optics and interferometers, electric and magnetic field lines, interference, Minkowski diagrams, energy levels and spectra, forces, pulleys and linkages', icon: '<svg viewBox="0 0 32 24"><path d="M3 12h26"/><path d="M14 3c2.2 3 2.2 15 0 18M14 3c-2.2 3-2.2 15 0 18"/><path d="M4 6l10 6 12 6" class="c1"/></svg>' },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.physicsEditor, alias: 'physicsOpen', layout: (s) => layout(s) },
});
export { solve, KIND };
