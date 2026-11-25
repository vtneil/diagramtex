import { runtime as TD } from '../runtime';
import { message as msg, type Message } from '../i18n';
import { layoutCache } from './layout-cache';
import { num3 } from '../core/format';
// Chemistry lab apparatus written for tikz-chemlab (the TikZ port of pst-labo). The source is the object: a
// tikzpicture of \tkz… calls (\tkzTestTube, \tkzTitration, \tkzHeatFlask …), each usually in a scope that moves it,
// \chemlabset lines, labels (\node … at (x,y) {…};) and leader lines (\draw … (a) -- (b);). It is drawn here as the
// package draws it: the shapes of tikz-chemlabObj.tex statement by statement, with TikZ's own geometry (PGF's
// rounded corners, smooth plots and arcs, clips, axis and radial shadings, patterns), the package's quirks kept
// (\tkzRoundFlask with no glass type draws a test tube; \tkzTitration, \tkzHeatFlask and \tkzRoundFlask leave their
// settings behind and move the next call of theirs sideways; its line widths follow the transformation in force when
// \chemlabUpdateLineWidths last ran, in the TeX group it ran in). Random contents (bubbles, filaments, turnings) are
// drawn from a seeded generator: pgf seeds its own from the time, so no two PDFs agree either.
// The picture is exported as a scope moved to where the block sits (as the UML class diagram is), and read back on
// import. The visual editor is src/editors/cleditor.ts.
const { r2 } = TD.util;
const PX = TD.PX_PER_CM;              // px per cm
const PXPT = 1 / TD.PT_PER_PX;        // px per pt
const CMPT = 28.45274;                // pt per cm
const cm = (v: number) => v * CMPT;   // cm → pt
const RAD = Math.PI / 180;
type Pt = [number, number];
type Mx = number[];                   // [a, b, c, d, e, f]: (x, y) → (a x + c y + e, b x + d y + f)

TD.CHEMLAB_DEFAULT = [
  '\\begin{tikzpicture}[scale=0.5]',
  '  \\tkzTestTube[liquidLevel1=40]',
  '  \\begin{scope}[shift={(3,0)}]',
  '    \\tkzTestTube[glassType=erlenmeyer, liquidStyle1=Champagne]',
  '  \\end{scope}',
  '\\end{tikzpicture}',
].join('\n');

// ---------------------------------------------------------------- colours
// xcolor's base names and tikz-chemlab's own (xcolor turns cmyk into rgb as 1 − min(1, c + k))
const RGB: Record<string, number[]> = {
  black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], cyan: [0, 1, 1], magenta: [1, 0, 1], yellow: [1, 1, 0],
  gray: [0.5, 0.5, 0.5], lightgray: [0.75, 0.75, 0.75], darkgray: [0.25, 0.25, 0.25], brown: [0.75, 0.5, 0.25], lime: [0.75, 1, 0], olive: [0.5, 0.5, 0],
  orange: [1, 0.5, 0], pink: [1, 0.75, 0.75], purple: [0.75, 0, 0.25], teal: [0, 0.5, 0.5], violet: [0.5, 0, 0.5],
  Beige: [0.96, 0.96, 0.86], LightGray: [0.8, 0.8, 0.8], VeryLightGray: [0.9, 0.9, 0.9], VeryPaleOrange: [1, 0.9, 0.7], PaleOrange: [1, 0.8, 0.6],
  LightBlue1: [0.8, 1, 1], LightBlue: [0.68, 0.85, 0.9], Copper: [0.8, 0, 0], Brown: [0.7, 0.4, 0.2], woodColor: [0.957, 0.84, 0.69], darkWoodColor: [0.5, 0.25, 0],
  flameAndGrill: [0.95, 0.55, 0.1], AqueousPhaseColor: [0.784314, 0.937255, 1], OrganicPhaseColor: [0.776471, 0.905882, 0.498039], billeBlue: [0, 0.1, 0.95],
};
/** the colours tikz-chemlab defines, for the editor's colour fields */
const LAB_COLOURS = ['VeryPaleOrange', 'PaleOrange', 'Beige', 'LightBlue', 'LightBlue1', 'LightGray', 'Copper', 'Brown', 'woodColor', 'AqueousPhaseColor', 'OrganicPhaseColor'];
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
function rgbOf(spec: any): number[] | null {
  let t = String(spec ?? '').trim();
  while (/^\{[\s\S]*\}$/.test(t)) t = t.slice(1, -1).trim();
  if (!t || t === 'none') return null;
  if (/^#[0-9a-f]{6}$/i.test(t)) return hexRgb(t); // a colour already worked out (a shading's, from colour())
  let m = /^rgb\s*,\s*255\s*:\s*red\s*,\s*([\d.]+)\s*;\s*green\s*,\s*([\d.]+)\s*;\s*blue\s*,\s*([\d.]+)$/.exec(t);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  m = /^rgb\s*:\s*red\s*,\s*([\d.]+)\s*;\s*green\s*,\s*([\d.]+)\s*;\s*blue\s*,\s*([\d.]+)$/.exec(t);
  if (m) return [+m[1], +m[2], +m[3]];
  const base = (n: string) => {
    if (RGB[n]) return RGB[n];
    const h = TD.tikzColor ? TD.tikzColor(n) : null;
    return typeof h === 'string' && /^#[0-9a-f]{6}/i.test(h) ? hexRgb(h) : null;
  };
  const parts = t.split('!').map((x) => x.trim());
  let c = base(parts[0]);
  if (!c) return null;
  for (let i = 1; i < parts.length; i += 2) {
    const p = parseFloat(parts[i]) / 100, o = parts[i + 1] ? base(parts[i + 1]) : [1, 1, 1];
    if (!isFinite(p) || !o) break;
    c = c.map((v, k) => v * p + o[k] * (1 - p));
  }
  return c;
}
const colour = (spec: any) => { const c = rgbOf(spec); return c ? hex(c) : null; };

// ---------------------------------------------------------------- reading TikZ options
// the index of the bracket closing the one at i (braces skipped), or -1
function close(s: string, i: number) {
  const open = s[i], shut = open === '[' ? ']' : open === '(' ? ')' : '}';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (open !== '{' && c === '{') { const e = close(s, k); if (e < 0) return -1; k = e; continue; }
    if (c === open) d++;
    else if (c === shut) { d--; if (d === 0) return k; }
  }
  return -1;
}
// a key=value list split at its top-level commas
function split(s: string) {
  const out: string[] = [];
  let d = 0, b = 0, a = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') b++; else if (c === '}') b--;
    else if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--;
    else if (c === ',' && !b && !d) { out.push(s.slice(a, k)); a = k + 1; }
  }
  out.push(s.slice(a));
  return out.map((x) => x.trim()).filter(Boolean);
}
const kv = (it: string) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null as string | null }; };
const unbrace = (v: any) => { let t = String(v ?? '').trim(); while (/^\{[\s\S]*\}$/.test(t) && close(t, 0) === t.length - 1) t = t.slice(1, -1).trim(); return t; };
const num = num3;
// a length as cm (TikZ: a plain number in a dimension is pt)
function lenCm(v: any, unitless = 'pt') {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|in|bp|em|ex)?\s*$/.exec(String(v ?? ''));
  if (!m) return NaN;
  const x = parseFloat(m[1]), u = m[2] || unitless;
  return u === 'cm' ? x : u === 'mm' ? x / 10 : u === 'in' ? x * 2.54 : u === 'bp' ? x * 2.54 / 72 : u === 'em' ? x * 10 / CMPT : u === 'ex' ? x * 4.3 / CMPT : x / CMPT;
}
// a width \chemlabset takes, as pt: one of the five words \chemlab@resolveLineWidth knows, or a length (a bare number is
// pt, as pgfmath reads it). Any other word (very thin, ultra thin) goes into pgfmath as a function and stops pdflatex.
const LAB_WIDTHS = ['thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
function labWidth(g: G, k: string, v: any) {
  const t = unbrace(String(v ?? '')).trim();
  if (LAB_WIDTHS.includes(t)) return WIDTHS[t];
  const c = lenCm(t);
  if (isFinite(c)) return cm(c);
  g.warn(msg('chemlab.warn.width', '{key}={value}: a length, or thin, semithick, thick, very thick or ultra thick', { key: k, value: t }));
  return NaN;
}
// a TikZ width: thin, thick … or a length (cm/pt), as pt
const WIDTHS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const widthPt = (v: any) => (WIDTHS[String(v).trim()] ?? cm(lenCm(v)));
function pair(t: any): Pt | null {
  const m = /^\s*\(\s*(-?[\d.]+)\s*(cm)?\s*,\s*(-?[\d.]+)\s*(cm)?\s*\)\s*$/.exec(unbrace(t));
  return m ? [parseFloat(m[1]), parseFloat(m[3])] : null;
}

// ---------------------------------------------------------------- geometry
const mul = (m: Mx, t: Mx): Mx => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
const ap = (m: Mx, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const inv = (m: Mx): Mx => { const det = m[0] * m[3] - m[1] * m[2] || 1e-12; const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det; return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]; };
const SHIFT = (x: number, y: number): Mx => [1, 0, 0, 1, x, y];
const ROT = (a: number): Mx => { const c = Math.cos(a * RAD), s = Math.sin(a * RAD); return [c, s, -s, c, 0, 0]; };
const SCALE = (x: number, y = x): Mx => [x, 0, 0, y, 0, 0];

// A path in the coordinates in force, as TikZ builds one: moves, lines, curves (arcs and ellipses become Béziers,
// as PGF makes them), closes.
type Seg = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];
class Path {
  s: Seg[] = []; x = 0; y = 0; x0 = 0; y0 = 0;
  /** an ellipse's quarters: their centre, by segment (see ellipse) */
  n1 = new Map<number, Pt>();
  M(x: number, y: number) { this.s.push(['M', x, y]); this.x = this.x0 = x; this.y = this.y0 = y; return this; }
  L(x: number, y: number) { if (!this.s.length) return this.M(x, y); this.s.push(['L', x, y]); this.x = x; this.y = y; return this; }
  C(a: number, b: number, c: number, d: number, x: number, y: number) { this.s.push(['C', a, b, c, d, x, y]); this.x = x; this.y = y; return this; }
  Z() { this.s.push(['Z']); this.x = this.x0; this.y = this.y0; return this; }
  // an elliptical arc round (cx, cy) from angle a0 to a1 (degrees, the ellipse's own parameter), in pieces as PGF cuts
  // it (\pgfpatharc): 90° at a time while more than 115° is left, 60° while more than 90°, then the rest
  earc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
    const piece = (b0: number, b1: number) => {
      const t0 = b0 * RAD, t1 = b1 * RAD, k = Math.abs(b1 - b0) === 90 ? 0.55228475 : (4 / 3) * Math.tan((Math.abs(b1 - b0) * RAD) / 4), sg = b1 > b0 ? 1 : -1;
      const p0x = cx + rx * Math.cos(t0), p0y = cy + ry * Math.sin(t0), p1x = cx + rx * Math.cos(t1), p1y = cy + ry * Math.sin(t1);
      this.C(p0x - sg * k * rx * Math.sin(t0), p0y + sg * k * ry * Math.cos(t0), p1x + sg * k * rx * Math.sin(t1), p1y - sg * k * ry * Math.cos(t1), p1x, p1y);
    };
    let a = a0;
    for (let left = Math.abs(a1 - a); left > 90 + 1e-9; left = Math.abs(a1 - a)) {
      const step = (left > 115 ? 90 : 60) * (a1 > a ? 1 : -1);
      piece(a, a + step);
      a += step;
    }
    piece(a, a1);
    return this;
  }
  /** arc[start angle=a0, end angle=a1, radius=r] from the current point */
  arc(a0: number, a1: number, rx: number, ry = rx) { return this.earc(this.x - rx * Math.cos(a0 * RAD), this.y - ry * Math.sin(a0 * RAD), rx, ry, a0, a1); }
  /** ([shift={(cx,cy)}]a0:r) arc[start angle=a0, end angle=a1, radius=r]: a move to the start (a line with `--`), then the arc */
  A(cx: number, cy: number, r: number, a0: number, a1: number, link: 'M' | 'L' = this.s.length ? 'L' : 'M') {
    const x = cx + r * Math.cos(a0 * RAD), y = cy + r * Math.sin(a0 * RAD);
    if (link === 'M') this.M(x, y); else this.L(x, y);
    return this.earc(cx, cy, r, r, a0, a1);
  }
  // TikZ's ellipse and circle (\pgfpathellipse): four quarters from the first axis. Each quarter's first support is set
  // by \pgf@xc<x>\pgf@yc<y> straight before the curveto, which TeX expands while it still looks for a space after "pt":
  // the size is protocolled with the new x but the old y, the centre's (see G.measure)
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.M(cx + rx, cy);
    const from = this.s.length;
    this.earc(cx, cy, rx, ry, 0, 360);
    for (let i = from; i < this.s.length; i++) if (this.s[i][0] === 'C') this.n1.set(i, [cx, cy]);
    return this.Z();
  }
  circle(cx: number, cy: number, r: number) { return this.ellipse(cx, cy, r, r); }
  rect(x1: number, y1: number, x2: number, y2: number) { return this.M(x1, y1).L(x1, y2).L(x2, y2).L(x2, y1).Z(); }
  poly(pts: number[][], closed = false) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return closed ? this.Z() : this; }
  /** plot[smooth, tension=t] coordinates {…}: PGF's curveto plot handler (supports 0.2775·t of the chord either side) */
  smooth(pts: number[][], link: 'M' | 'L' = this.s.length ? 'L' : 'M', tension = 0.5) {
    const f = 0.2775 * tension;
    if (link === 'M') this.M(pts[0][0], pts[0][1]); else this.L(pts[0][0], pts[0][1]);
    if (pts.length < 2) return this;
    if (pts.length === 2) return this.L(pts[1][0], pts[1][1]);
    let sup: Pt = [pts[0][0], pts[0][1]];
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = (pts[i + 1][0] - pts[i - 1][0]) * f, dy = (pts[i + 1][1] - pts[i - 1][1]) * f;
      this.C(sup[0], sup[1], pts[i][0] - dx, pts[i][1] - dy, pts[i][0], pts[i][1]);
      sup = [pts[i][0] + dx, pts[i][1] + dy];
    }
    const e = pts[pts.length - 1];
    return this.C(sup[0], sup[1], e[0], e[1], e[0], e[1]);
  }
}
const path = () => new Path();
const rect = (x1: number, y1: number, x2: number, y2: number) => path().rect(x1, y1, x2, y2);
const circle = (x: number, y: number, r: number) => path().circle(x, y, r);
const ellipse = (x: number, y: number, rx: number, ry: number) => path().ellipse(x, y, rx, ry);

// The path in px (y down) through m, with PGF's rounded corners of r px: a corner that ends a line and is followed by
// a line, a curve or the close is cut r px back along both sides (not clamped, as PGF doesn't) and joined by a
// Bézier with its supports 0.5523 of the way to the corner; a closed path rounds its first corner too.
type PSeg = { t: string; p?: Pt; a?: Pt; b?: Pt; n1?: Pt };
const K = 0.5522847;
const toward = (b: Pt, a: Pt, r: number): Pt => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [b[0] + (dx * r) / l, b[1] + (dy * r) / l]; };
const lerp = (s: Pt, b: Pt): Pt => [s[0] + K * (b[0] - s[0]), s[1] + K * (b[1] - s[1])];
function toPx(p: Path, m: Mx): PSeg[] {
  const q = (x: number, y: number): Pt => { const [X, Y] = ap(m, x, y); return [X * PX, -Y * PX]; };
  return p.s.map((s, i) => (s[0] === 'Z' ? { t: 'Z' } : s[0] === 'C' ? { t: 'C', a: q(s[1], s[2]), b: q(s[3], s[4]), p: q(s[5], s[6]), ...(p.n1.has(i) ? { n1: q(...p.n1.get(i)!) } : {}) } : { t: s[0], p: q(s[1], s[2]) }));
}
function rounded(segs: PSeg[], r: number): PSeg[] {
  if (!(r > 0)) return segs;
  const out: PSeg[] = [];
  for (let i = 0; i < segs.length;) {
    let j = i + 1;
    while (j < segs.length && segs[j].t !== 'M') j++;
    const sub = segs.slice(i, j);
    i = j;
    if (sub[0].t !== 'M') { out.push(...sub); continue; }
    const M0 = sub[0].p!, closed = sub[sub.length - 1].t === 'Z', res: PSeg[] = [];
    let prev = M0, start: PSeg = sub[0];
    const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
    for (let k = 1; k < sub.length; k++) {
      const sg = sub[k], nx = sub[k + 1];
      if (sg.t === 'L') {
        const into = nx && nx.t === 'Z' && same(sg.p!, M0);
        const C = !nx || into ? null : nx.t === 'L' ? nx.p! : nx.t === 'C' ? nx.a! : nx.t === 'Z' ? M0 : null;
        if (C) { const S = toward(sg.p!, prev, r), E = toward(sg.p!, C, r); res.push({ t: 'L', p: S }, { t: 'C', a: lerp(S, sg.p!), b: lerp(E, sg.p!), p: E }); }
        else res.push(sg);
        if (!into) prev = sg.p!;
      } else if (sg.t === 'C') { res.push(sg); prev = sg.p!; }
      else if (sg.t === 'Z') {
        const first = sub[1];
        if (closed && first && first.t === 'L' && !same(prev, M0)) {
          const S = toward(M0, prev, r), E = toward(M0, first.p!, r);
          start = { t: 'M', p: E };
          res.push({ t: 'L', p: S }, { t: 'C', a: lerp(S, M0), b: lerp(E, M0), p: E });
        }
        res.push(sg);
      }
    }
    out.push(start, ...res);
  }
  return out;
}
const f2 = (p: Pt) => `${r2(p[0])},${r2(p[1])}`;
const dOf = (segs: PSeg[]) => segs.map((s) => (s.t === 'Z' ? 'Z' : s.t === 'C' ? `C${f2(s.a!)} ${f2(s.b!)} ${f2(s.p!)}` : s.t + f2(s.p!))).join('');

// ---------------------------------------------------------------- styles (liquids, mixtures)
// A paint: a colour, an axis shading (bottom → top), a radial one, TikZ's ball, or a pattern of lines
type Paint = string | { k: 'axis'; top: string; bottom: string; middle?: string } | { k: 'radial'; inner: string; outer: string } | { k: 'ball'; c: string } | { k: 'lines'; angle: number; dist: number; c: string };
interface Sty { fill?: Paint | null; draw?: string | null; unknown?: string; /** it sets a shading (\shade keeps its own otherwise) */ shade?: boolean }
// tikz-chemlab's \tikzset styles
const STYLES: Record<string, string> = {
  liquidStyle1: 'fill=cyan,draw=none', liquidStyle2: 'fill=yellow,draw=none', liquidStyle3: 'fill=magenta,draw=none',
  Ball3D: 'shading=ball,ball color=cyan,draw=none', Champagne: 'fill=Beige,draw=none', Blood: 'fill=red,draw=none', Cobalt: 'fill=blue,line width=0.2cm',
  Oil: 'fill=yellow,draw=none', Vinegar: 'fill=magenta,draw=none', Diffusion: 'bottom color={rgb,255:red,0;green,25;blue,242},top color=cyan,draw=none',
  MixtureDiffusion2: 'bottom color=white,top color=red,draw=red', flameAndGrill: 'bottom color=PaleOrange,top color=yellow,draw=none',
  YellowStripes: 'pattern=north east lines,pattern color=yellow', BlueDiffusion: 'bottom color=green,top color=cyan,draw=none',
  AqueousPhase: 'fill=AqueousPhaseColor,draw=none', OrganicPhase: 'fill=OrganicPhaseColor,draw=none', 'tkz liquid': 'draw=none',
};
/** the liquid styles the editor offers, in order */
const LIQUIDS = ['liquidStyle1', 'liquidStyle2', 'liquidStyle3', 'Champagne', 'Blood', 'Cobalt', 'Oil', 'Vinegar', 'AqueousPhase', 'OrganicPhase', 'Diffusion', 'BlueDiffusion', 'MixtureDiffusion2', 'YellowStripes', 'Ball3D'];
// options (a style's body, or what is written in its place) → what they paint. A name may be a style or a colour.
function styleOf(spec: any, user: Map<string, string>, depth = 0): Sty {
  const out: Sty = {};
  const o: any = {};
  for (const it of split(unbrace(spec))) {
    const { k, v } = kv(it);
    if (v == null) {
      const body = user.get(k) ?? STYLES[k];
      if (body != null && depth < 8) { Object.assign(out, styleOf(body, user, depth + 1)); continue; }
      if (colour(k)) { out.fill = colour(k); continue; }
      out.unknown = k; continue;
    }
    o[k] = v;
  }
  if (o.fill != null) out.fill = o.fill === 'none' ? null : colour(o.fill);
  if (o.draw != null) out.draw = o.draw === 'none' ? null : colour(o.draw);
  if (o.color != null && o.fill == null) out.fill = colour(o.color);
  if (o['top color'] != null || o['bottom color'] != null || o['middle color'] != null) {
    // TikZ starts from gray over white (tikz.code.tex); a middle not given is the two mixed half and half
    const top = colour(o['top color'] ?? 'gray')!, bottom = colour(o['bottom color'] ?? 'white')!;
    out.fill = { k: 'axis', top, bottom, ...(o['middle color'] ? { middle: colour(o['middle color'])! } : {}) };
    out.shade = true;
  }
  if (o['inner color'] != null || o['outer color'] != null) { out.fill = { k: 'radial', inner: colour(o['inner color'] ?? 'white')!, outer: colour(o['outer color'] ?? 'white')! }; out.shade = true; }
  if (o['ball color'] != null || o.shading === 'ball') { out.fill = { k: 'ball', c: colour(o['ball color'] ?? 'blue')! }; out.shade = true; }
  if (o.pattern != null) {
    const pc = colour(o['pattern color'] ?? 'black')!, pn = unbrace(o.pattern);
    const lm = /^Lines\s*\[([^\]]*)\]$/.exec(pn);
    let angle = 45, dist = 3;
    if (lm) { for (const x of split(lm[1])) { const q = kv(x); if (q.k === 'angle') angle = parseFloat(q.v!) || 0; if (q.k === 'distance') dist = /sqrt/.test(q.v!) ? 1 / Math.SQRT2 : cm(lenCm(unbrace(q.v))) || 3; } }
    // TikZ's own: diagonals 3pt apart along an edge (3/√2 across), horizontal and vertical lines 3pt apart
    else { angle = ({ 'north east lines': 45, 'north west lines': -45, 'horizontal lines': 0, 'vertical lines': 90 } as Record<string, number>)[pn] ?? 45; dist = Math.abs(angle) === 45 ? 3 / Math.SQRT2 : 3; }
    out.fill = { k: 'lines', angle, dist, c: pc };
  }
  return out;
}

// ---------------------------------------------------------------- parameters
// tikz-chemlab's keys: name → [kind, default]. Boolean keys are TeX \ifs (`stopper` alone is true).
const BOOL = ['burette', 'pHMeter', 'stopper', 'straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'doubleTube', 'condenserBulbs', 'clamp', 'noDefaults', 'bubbling', 'gasCollection', 'tubeOnly', 'gasTubeStraight', 'bunsenBurner', 'label', 'magneticStirrer', 'TapOpen'];
const STORE = ['tiltAngle', 'liquidLevel1', 'liquidLevel2', 'liquidLevel3', 'liquidStyle1', 'liquidStyle2', 'liquidStyle3', 'substance', 'solid', 'Number', 'glassType', 'buretteColor', 'buretteLevel', 'buretteReagent', 'beakerReagent', 'reagentColor', 'reagentLevel', 'DistillateColor', 'MixtureStyle'];
const GLASS = ['tube', 'roundFlask', 'beaker', 'erlenmeyer', 'reagentBottle', 'volumetricFlask', 'watchGlass'];
const SETTINGS = ['line width', 'linewidth', 'outline line width', 'outline width', 'ellipse line width', 'ellipse width', 'tube ellipse line width', 'tube ellipse width', 'graduation line width', 'graduation width', 'style', 'flame outer color', 'flame outer end color', 'flame inner color', 'flame inner end color', 'flame scale'];
const KEYS = new Set([...BOOL, ...STORE, ...SETTINGS]);
const LINE_STYLES: Record<string, number[]> = { default: [cm(0.053), cm(0.07), cm(0.08), cm(0.02)], publication: [0.4, 0.6, 0.8, 0.4], presentation: [0.8, 1.2, 1.6, 0.6], schematic: [0.6, 0.8, 1.2, 0.4], draft: [0.4, 0.4, 0.4, 0.4], bold: [1.2, 1.6, 1.6, 0.8] };
function defaults(): any {
  return {
    burette: true, pHMeter: false, stopper: false, straightTube: false, elbowTube: false, uTube: false, uTubeLong: false, curvedTube: false, curvedTubeShort: false,
    doubleTube: false, condenserBulbs: false, clamp: false, bubbling: false, gasCollection: false, tubeOnly: false, gasTubeStraight: false, bunsenBurner: true,
    label: false, magneticStirrer: true, TapOpen: false, tiltAngle: '0', liquidLevel1: '50', liquidLevel2: '0', liquidLevel3: '0',
    liquidStyle1: 'liquidStyle1', liquidStyle2: 'liquidStyle2', liquidStyle3: 'liquidStyle3', substance: '', solid: '', Number: '', glass: 0, glassType: 'tube',
    buretteColor: 'VeryPaleOrange', buretteLevel: '20', buretteReagent: '', beakerReagent: '', reagentColor: 'PaleOrange', reagentLevel: '2', DistillateColor: 'yellow', MixtureStyle: 'BlueDiffusion',
    sepL1: '11', sepL2: '12',
  };
}
const n0 = (v: any) => { const x = parseFloat(String(v)); return isFinite(x) ? x : 0; };
// TeX's \ifnum reads the integer at the start (37.5 is 37, then ".5" would be typeset)
const int = (v: any) => { const m = /^\s*(-?\d+)/.exec(String(v)); return m ? parseInt(m[1], 10) : 0; };

// ---------------------------------------------------------------- the drawing context
// A TeX group's state: the transformation (local → picture cm), the line width, caps, joins and rounded corners in force,
// the colour lines are drawn in, chemlab's four line widths (pt) as \chemlabUpdateLineWidths last set them, the base
// widths and flame settings \chemlabset gave, the parameters (tikz-chemlab's macros and \ifs), whether \tkzTestTube
// keeps them (noDefaults), the sideways offset of the next titration or flask, user styles, and whether paths still
// count towards the picture's size (PGF stops counting them after a clip or \useasboundingbox, to the group's end).
interface St {
  m: Mx; lw: number; cap: string; join: string; rc: number; ink: string; regs: number[]; base: number[]; flame: any; P: any; nd: boolean; acc: number;
  rel: boolean; out: any[]; styles: Map<string, string>; cb: Box | null;
}
type Box = { x1: number; y1: number; x2: number; y2: number };
/** a level's frame, for the editor's handle (see G.level) */
type Lv = { key: string; v: number; m: Mx; axis: Mx; ax: number; off: number; per: number; min: number; max: number; step: number };
const nobox = (): Box => ({ x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
const grow = (b: Box, x: number, y: number, h = 0) => { b.x1 = Math.min(b.x1, x - h); b.y1 = Math.min(b.y1, y - h); b.x2 = Math.max(b.x2, x + h); b.y2 = Math.max(b.y2, y + h); };
interface DrawOpts { color?: string | null; lw?: number; rc?: number; cap?: string; join?: string; dash?: number[]; tips?: [string, string]; opacity?: number }

class G {
  st: St; defs: string[] = []; n = 0; bb = nobox(); boxes: Box[] = []; levels: Lv[][] = []; quiet = 0; origins: (Mx | null)[] = []; item = -1; seed = 1; warnings: { i: number; key: string; msg: Message }[] = []; texts = 0;
  constructor(m: Mx, styles: Map<string, string>) {
    this.st = { m, lw: 0.4, cap: 'butt', join: 'miter', rc: 0, ink: '#000000', regs: LINE_STYLES.default.slice(), base: LINE_STYLES.default.slice(),
      flame: { outer: 'PaleOrange', outerEnd: 'yellow', inner: 'cyan', innerEnd: 'white', scale: 1 }, P: defaults(), nd: false, acc: 0, rel: true, out: [], styles, cb: null };
  }
  get P() { return this.st.P; }
  warn(m: Message) { const key = m.id + JSON.stringify(m.params || {}); if (!this.warnings.some((w) => w.i === this.item && w.key === key)) this.warnings.push({ i: this.item, key, msg: m }); }
  rand() { let t = (this.seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  id() { return `cl@${++this.n}`; }
  // a TeX group (a scope): the state copied in, restored after; tf: the scope's transformations, in the order written
  scope(o: { tf?: Mx[]; lw?: number; cap?: string; join?: string; rc?: number; ink?: string }, fn: () => void) {
    const was = this.st, kids: any[] = [];
    this.st = { ...was, regs: was.regs.slice(), base: was.base.slice(), flame: { ...was.flame }, P: { ...was.P }, out: kids, styles: new Map(was.styles) };
    for (const t of o.tf || []) this.st.m = mul(this.st.m, t);
    if (o.lw != null) this.st.lw = o.lw;
    if (o.cap) this.st.cap = o.cap;
    if (o.join) this.st.join = o.join;
    if (o.rc != null) this.st.rc = o.rc;
    if (o.ink) this.st.ink = o.ink;
    try { fn(); } finally { this.st = was; }
    if (kids.length) was.out.push(...kids);
  }
  /** \chemlabUpdateLineWidths: the base widths times the mean of the transformation's diagonal */
  update() { const m = this.st.m, k = (m[0] + m[3]) / 2; this.st.regs = this.st.base.map((b) => b * k); }
  get L() { return this.st.regs[0]; } get E() { return this.st.regs[1]; } get T() { return this.st.regs[2]; } get Gr() { return this.st.regs[3]; }
  // where a path's points count: towards the picture (as PGF counts them: every point, supports too, half the line
  // width when stroked) and towards the item being drawn (always)
  measure(segs: PSeg[], half: number, ink = true) {
    // a negative width (\chemlabUpdateLineWidths past a quarter turn) pads the path's box inwards, which never widens
    // the picture's: PGF only lets the padded box grow it
    half = Math.max(0, half);
    const b = nobox(), rel = this.st.rel, raw = nobox();
    for (const s of segs) for (const [k, p] of [[0, s.a], [1, s.b], [2, s.p]] as [number, Pt | undefined][]) if (p) {
      grow(b, p[0], p[1], half);
      if (!rel) continue;
      // an ellipse quarter's first support (see Path.ellipse): TeX tests its new x against the picture's box and then the
      // path's (this path's points so far: TikZ moves to the centre first), and the first test that passes ends the scan,
      // so the y is the support's own from there on. When none passes, the y tests all see the centre's, which lies in
      // both boxes: the support doesn't count. Its x is inside the picture's box whenever it is inside the path's.
      if (k === 0 && s.n1 && p[0] >= Math.min(raw.x1, s.n1[0]) && p[0] <= Math.max(raw.x2, s.n1[0])) continue;
      grow(raw, p[0], p[1]); grow(this.bb, p[0], p[1], half);
    }
    // the item's own box: what it inks, inside the clips in force
    const c = this.st.cb, ib = ink && this.item >= 0 ? (this.boxes[this.item] ||= nobox()) : null;
    if (!ib || !isFinite(b.x1)) return;
    const x1 = Math.max(b.x1, c ? c.x1 : -Infinity), y1 = Math.max(b.y1, c ? c.y1 : -Infinity), x2 = Math.min(b.x2, c ? c.x2 : Infinity), y2 = Math.min(b.y2, c ? c.y2 : Infinity);
    if (x1 <= x2 && y1 <= y2) { grow(ib, x1, y1); grow(ib, x2, y2); }
  }
  paint(p: Paint | null | undefined): string {
    if (p == null) return 'none';
    if (typeof p === 'string') return p;
    const id = this.id();
    if (p.k === 'axis') this.defs.push(`<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.bottom}"/>${p.middle ? `<stop offset="0.5" stop-color="${p.middle}"/>` : ''}<stop offset="1" stop-color="${p.top}"/></linearGradient>`);
    else if (p.k === 'radial') this.defs.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${p.inner}"/><stop offset="1" stop-color="${p.outer}"/></radialGradient>`);
    // TikZ's ball: PGF's radial shading scaled by the path's size over 50bp (\pgfshadepath), so its 100bp square is twice
    // the path's box: the centre (-10bp, 10bp) falls at 0.3 of the box, and black (50bp) a whole box away
    else if (p.k === 'ball') {
      const c = rgbOf(p.c) || [0, 0, 1], w = (q: number) => hex(c.map((v) => v * q + (1 - q))), b = (q: number) => hex(c.map((v) => v * q));
      this.defs.push(`<radialGradient id="${id}" cx="0.3" cy="0.3" r="1"><stop offset="0" stop-color="${w(0.15)}"/><stop offset="0.18" stop-color="${w(0.75)}"/><stop offset="0.36" stop-color="${b(0.7)}"/><stop offset="0.5" stop-color="${b(0.5)}"/><stop offset="1" stop-color="#000000"/></radialGradient>`);
    } else {
      const d = r2(p.dist * PXPT), w = r2(0.4 * PXPT);
      this.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${d}" height="${d}" patternTransform="rotate(${r2(-p.angle + 90)})"><path d="M${r2(d / 2)},0V${d}" stroke="${p.c}" stroke-width="${w}"/></pattern>`);
    }
    return `url(#${id})`;
  }
  // stroke / fill a path in the coordinates in force (rounded corners: pt, as TikZ keeps them)
  op(p: Path, fill: Paint | null | undefined, stroke: boolean, o: DrawOpts = {}) {
    const st = this.st, rc = (o.rc ?? st.rc) * PXPT, raw = toPx(p, st.m), segs = rounded(raw, rc), lw = o.lw ?? st.lw, color = o.color === undefined ? st.ink : o.color;
    if (!segs.length) return;
    const drawn = stroke && color != null;
    this.measure(rc > 0 ? [...raw, ...segs] : segs, drawn ? (lw * PXPT) / 2 : 0);
    let d = dOf(segs), tipSvg = '';
    if (drawn && o.tips && (o.tips[0] || o.tips[1])) {
      const pts = segs.filter((s) => s.p).map((s) => s.p!), w = lw * PXPT;
      const end = (k: 0 | 1) => {
        const tp = o.tips![k];
        if (!tp || pts.length < 2) return;
        const P = k ? pts[pts.length - 1] : pts[0], Q = k ? pts[pts.length - 2] : pts[1], l = Math.hypot(P[0] - Q[0], P[1] - Q[1]) || 1, u = { x: (P[0] - Q[0]) / l, y: (P[1] - Q[1]) / l };
        const T = TD.tip(tp, { x: P[0], y: P[1] }, u, w, color);
        tipSvg += T.svg;
        P[0] -= u.x * T.back; P[1] -= u.y * T.back;
      };
      end(1); end(0);
      d = dOf(segs);
    }
    const f = fill === undefined ? 'none' : this.paint(fill);
    // a width of 0 (\chemlabUpdateLineWidths under rotate=90 or xscale=-1 makes one) is a PDF's thinnest line, a pixel
    const sw = lw * PXPT, width = sw >= 0.005 ? `stroke-width="${r2(sw)}"` : 'stroke-width="1" vector-effect="non-scaling-stroke"';
    const sa = drawn ? ` stroke="${color}" ${width}${st.cap !== 'butt' || o.cap ? ` stroke-linecap="${o.cap || st.cap}"` : ''}${st.join !== 'miter' || o.join ? ` stroke-linejoin="${o.join || st.join}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash.map((x) => r2(x * PXPT)).join(' ')}"` : ''}` : '';
    st.out.push(`<path d="${d}" fill="${f}"${sa}${o.opacity != null ? ` opacity="${o.opacity}"` : ''}/>${tipSvg}`);
  }
  draw(p: Path, o: DrawOpts = {}) { this.op(p, undefined, true, o); }
  fill(p: Path, c: Paint | null | undefined, o: DrawOpts = {}) { this.op(p, c ?? null, false, o); }
  filldraw(p: Path, c: Paint | null | undefined, o: DrawOpts = {}) { this.op(p, c ?? null, true, o); }
  // \fill[style] (or \shade): what the style fills, and a line too when it says draw=…
  styled(p: Path, s: Sty, o: DrawOpts = {}) { if (s.draw) this.op(p, s.fill ?? '#000000', true, { ...o, color: s.draw }); else this.op(p, s.fill === undefined ? '#000000' : s.fill, false, o); }
  clip(p: Path, rc = 0) {
    const raw = toPx(p, this.st.m), segs = rounded(raw, rc * PXPT), id = this.id(), b = nobox();
    this.measure(rc > 0 ? [...raw, ...segs] : segs, 0, false);
    for (const s of segs) for (const q of [s.a, s.b, s.p]) if (q) grow(b, q[0], q[1]);
    const c = this.st.cb;
    this.st.cb = c ? { x1: Math.max(c.x1, b.x1), y1: Math.max(c.y1, b.y1), x2: Math.min(c.x2, b.x2), y2: Math.min(c.y2, b.y2) } : b;
    this.defs.push(`<clipPath id="${id}"><path d="${dOf(segs)}"/></clipPath>`);
    const kids: any[] = [];
    this.st.out.push({ clip: id, kids });
    this.st.out = kids;
    this.st.rel = false;
  }
  // a level the editor can drag (an option drawn as a height): in the frame in force, its surface is at
  // y = off + per × value, and its handle where that meets the glass's axis (x = ax in the frame `axis`). A glass the
  // command draws on its own (a second tube) is quiet: its options aren't the item's.
  level(key: string, v: number, off: number, per: number, o: { axis?: Mx; ax?: number; min?: number; max?: number; step?: number } = {}) {
    if (this.item < 0 || this.quiet) return;
    const l = (this.levels[this.item] ||= []);
    if (!l.some((x) => x.key === key)) l.push({ key, v, m: this.st.m.slice(), axis: (o.axis ?? this.st.m).slice(), ax: o.ax ?? 0, off, per, min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1 });
  }
  useBox(x1: number, y1: number, x2: number, y2: number) { this.measure(toPx(rect(x1, y1, x2, y2), this.st.m), 0, false); this.st.rel = false; }
  // a node: the text upright at the point (or its west side there), on its fill; empty text draws nothing
  // anchor: TikZ's compass points (north, south west …), center or base
  node(text: string, x: number, y: number, o: { anchor?: string; fill?: string; inner?: number; color?: string } = {}) {
    const [X, Y] = ap(this.st.m, x, y), px = X * PX, py = -Y * PX, t = String(text ?? '').trim();
    const inner = (o.inner ?? 3.3333) * PXPT;
    // the text's box as TeX sets it: its width, and the height and depth of Computer Modern at its size
    const { body, size } = sized(t), b = t ? textBox(body, size) : { w: 0, h: 0 }, k = (SIZE_PT[size] || 10) / 10;
    const hd = t && TD.texText ? TD.texText.hd(body) : { ht: (b.h * 0.7) / PXPT / k, dp: (b.h * 0.3) / PXPT / k };
    const w = Math.max(0, b.w - 2) + 2 * inner, h = (hd.ht + hd.dp) * k * PXPT + 2 * inner, an = o.anchor || 'center';
    // the box's centre from the anchor at the point (px, y down); base: the text's baseline there
    const cx = px + (/west/.test(an) ? w / 2 : /east/.test(an) ? -w / 2 : 0);
    const cy = an === 'base' ? py + hd.dp * k * PXPT + inner - h / 2 : py + (/north/.test(an) ? h / 2 : /south/.test(an) ? -h / 2 : 0);
    this.measure([{ t: 'M', p: [cx - w / 2, cy - h / 2] }, { t: 'L', p: [cx + w / 2, cy + h / 2] }], 0);
    if (!t) return;
    if (o.fill) this.st.out.push(`<rect x="${r2(cx - w / 2)}" y="${r2(cy - h / 2)}" width="${r2(w)}" height="${r2(h)}" fill="${colour(o.fill)}"/>`);
    this.texts++;
    this.st.out.push({ text: body, size, color: colour(o.color || 'black'), x: cx, y: cy });
  }
}
// a node's placement → the anchor at its point
const PLACE: Record<string, string> = { right: 'west', left: 'east', above: 'south', below: 'north', 'above right': 'south west', 'above left': 'south east', 'below right': 'north west', 'below left': 'north east' };
// a node's text: a leading size command ({\small Cu$^{2+}$}) sets its size
const SIZE_PT: Record<string, number> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
const SIZE_CMD = /^\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b\s*/;
function sized(t: string) {
  let body = unbrace(t), size = 'normalsize';
  const m = SIZE_CMD.exec(body);
  if (m) { size = m[1]; body = unbrace(body.slice(m[0].length)); }
  return { body, size };
}
function textBox(text: string, size: string) {
  try { return TD.textBox(text, { size, font: 'default' }); } catch { return { w: text.length * 6, h: 12 }; }
}

// ---------------------------------------------------------------- tikz-chemlabObj.tex
const W = '#ffffff', BLACK = '#000000';
const C = (n: string) => colour(n)!;
function buretteBody(g: G) {
  g.draw(path().poly([[-0.5, 11.5], [-0.25, 11], [-0.25, 3], [0, 2.75], [0, 0.5]]));
  g.draw(path().poly([[0.2, 0.7], [0.2, 2.75], [0.5, 3], [0.5, 11], [0.75, 11.5]]));
}
function buretteStopcock(g: G) {
  g.filldraw(rect(-0.1, 1.6, 0.3, 2.1), W);
  g.draw(rect(-0.1, 1.5, -0.2, 2.2));
  g.draw(rect(0.3, 1.5, 0.4, 2.2));
  g.draw(path().poly([[0.4, 1.7], [0.5, 1.7], [0.6, 1.4], [0.8, 1.4], [0.8, 2.3], [0.6, 2.3], [0.5, 2], [0.4, 2]], true));
  g.filldraw(path().poly([[-0.5, 1.5], [-0.75, 1.7], [-0.75, 2], [-0.5, 2.2], [-0.3, 2.2], [-0.3, 1.5]], true), C('LightBlue'));
  g.filldraw(rect(-0.5, 1.5, -0.2, 2.2), C('LightBlue'));
}
// \foreach \x in {a,b,...,end}: pgffor counts in TeX's scaled points (65536 to the pt), from b by b − a, while it is
// not past end, so a step that isn't a whole number of them falls short (0.1 is 6554sp: {0.5,0.6,...,4.4} stops at 4.3)
const tsp = (x: number) => Math.round(x * 65536);
function dots(a: number, b: number, end: number): number[] {
  const out = [a, b], step = tsp(b) - tsp(a), e = tsp(end);
  if (step) for (let v = tsp(b) + step; step > 0 ? v <= e : v >= e; v += step) out.push(v / 65536);
  return out;
}
function buretteGraduation(g: G) { for (const n of dots(3.0, 3.32, 10.68)) g.draw(path().M(-0.25, n).L(0, n), { lw: g.Gr }); }
const BURETTE_PATH = () => path().poly([[-0.5, 11.5], [-0.25, 11], [-0.25, 3], [0, 2.75], [0, 0.5], [0.2, 0.7], [0.2, 2.75], [0.5, 3], [0.5, 11], [0.75, 11.5]], true);
function phMeter(g: G) {
  g.filldraw(rect(-1, 0, 1, 3), W, { rc: cm(0.125) });
  g.fill(rect(-0.75, 2, 0.75, 2.75), C('LightGray'));
  g.node('PH', 0, 2.375, { color: 'white' });
  g.draw(circle(0, 1.25, 0.3));
  g.draw(path().M(0, 1.25).L(0, 1.5), { tips: ['', 'to'] });
  g.node('$^\\circ$C', 0.65, 1.5);
  g.draw(circle(-0.5, 0.5, 0.2));
  g.draw(circle(0.5, 0.5, 0.2));
  g.draw(rect(2.25, 2.5, 2.75, 4.5));
  g.filldraw(rect(2.25, 4, 2.75, 4.5), C('LightGray'));
  g.draw(circle(2.5, 2.25, 0.25));
  g.draw(path().poly([[2.5, 4.5], [2.5, 5], [1.25, 4.75], [0, 5], [0, 3]]), { lw: cm(0.05), color: C('LightBlue'), rc: cm(0.2) });
}
function titrationStand(g: G) {
  g.update();
  const L = g.L;
  g.draw(rect(-1.5, 0, 1.5, 1.5), { lw: L });
  g.fill(circle(0, 0.75, 0.2), C('red'));
  g.draw(rect(-1.25 - 0.085, 0.3 - 0.085, -0.75 + 0.085, 1.2 + 0.085), { lw: L });
  g.draw(rect(-1.25 + 0.034, 0.3 + 0.034, -0.75 - 0.034, 1.2 - 0.034), { lw: L });
  g.draw(circle(1, 0.75, 0.25 + 0.085), { lw: L });
  g.draw(circle(1, 0.75, 0.25 - 0.034), { lw: L });
}
function stirBar(g: G) {
  g.update();
  g.filldraw(rect(-0.5, 0.1, 0.5, 0.4), W, { lw: g.L, rc: cm(0.075) });
  g.filldraw(rect(-0.05, 0, 0.05, 0.5), W, { lw: g.L, rc: cm(0.025) });
}
const PIPETTE_PATH = () => path().poly([[-0.05, 0], [-0.15, 0.2], [-0.15, 6], [0.15, 6], [0.15, 0.2], [0.05, 0]], true).M(0, 0).C(0.25, -0.4, -0.25, -0.4, 0, 0);
function pipetteBody(g: G) {
  g.update();
  g.scope({ lw: g.L, rc: cm(0.05) }, () => {
    g.draw(path().poly([[-0.05, 0], [-0.15, 0.2], [-0.15, 6], [0.15, 6], [0.15, 0.2], [0.05, 0]], true));
    g.fill(ellipse(0, 6, 0.15, 0.05), W);
    for (const y of dots(0.5, 1.0, 5.0)) g.draw(path().M(0, y).L(0.1, y), { lw: g.Gr });
  });
}
function largePipetteBody(g: G) {
  g.update();
  g.scope({ lw: g.L, rc: cm(0.05) }, () => g.draw(path().poly([[0, 0], [0, 1], [-0.23, 2.5], [-0.23, 22.5]]).arc(-80, 80, 0.45)));
}
function drop(g: G) { g.scope({ tf: [SCALE(0.6)] }, () => g.draw(path().M(0, 0).C(0.25, -0.4, -0.25, -0.4, 0, 0), { lw: cm(0.0102) })); }
const CYL_PATH = () => path().poly([[-0.5, 5], [-0.5, 0], [0.5, 0], [0.5, 4.9], [0.6, 4.93]], true);
function cylinderBody(g: G) { g.draw(path().poly([[-0.5, 5], [-0.5, 0], [0.5, 0], [0.5, 4.9], [0.6, 4.93]])); }
function cylinderRim(g: G) {
  g.draw(path().smooth([[0.6, -0.07], [0.498, 0.008], [0.483, 0.026], [0.433, 0.05], [0.353, 0.0707], [0.25, 0.0866], [0.13, 0.0966], [0, 0.1], [-0.13, 0.0966], [-0.25, 0.0866],
    [-0.353, 0.0707], [-0.433, 0.05], [-0.483, 0.026], [-0.5, 0], [-0.483, -0.026], [-0.353, -0.0707], [-0.25, -0.0866], [-0.13, -0.096], [0, -0.1], [0.13, -0.096],
    [0.25, -0.0866], [0.353, -0.0707], [0.433, -0.05], [0.498, -0.026], [0.6, -0.07]], 'M'));
}
function cylinderBaseOutline(closed: boolean) {
  const p = path().A(-0.95, 0.5, 0.45, 0, -90, 'M').A(-0.95, 0.025, 0.025, 90, 270).L(-0.95, 0).L(0.95, 0).A(0.95, 0.025, 0.025, -90, 90).A(0.95, 0.5, 0.45, -90, -180)
    .smooth([[0.5, 0.4], [0, 0.25], [-0.5, 0.4]], 'L');
  return closed ? p.Z() : p;
}
function cylinderBase(g: G) { g.fill(cylinderBaseOutline(true), W); g.draw(cylinderBaseOutline(false)); }
function cylinderGraduation(g: G) {
  for (const y of dots(0.5, 1.0, 4.5)) g.draw(path().M(-0.4, y).L(-0.1, y), { lw: 1.5 * g.Gr });
  for (const y of dots(0.5, 0.6, 4.4)) g.draw(path().M(-0.4, y).L(-0.25, y), { lw: g.Gr });
}
const COLUMN_PATH = () => path().poly([[-0.25, 10.5], [-0.25, 8.5], [-0.75, 8], [-0.75, 2.5], [-0.25, 2], [-0.25, 0], [0.25, 0], [0.25, 2], [0.75, 2.5], [0.75, 8], [0.25, 8.5], [0.25, 9.36], [0.25, 10.5]], true);
const HATCH: Paint = { k: 'lines', angle: 45, dist: 1 / Math.SQRT2, c: '#808080' };
function column(g: G) {
  g.scope({}, () => {
    g.clip(COLUMN_PATH(), cm(0.12));
    const w = 0.4 * g.st.lw;
    for (let i = 3; i <= 8; i++) { g.draw(path().poly([[-0.75, i], [-0.25, i - 0.5], [-0.75, i - 0.1]]), { lw: w }); }
    for (let i = 3; i <= 8; i++) { g.draw(path().poly([[0.75, i], [0.25, i - 0.5], [0.75, i - 0.1]]), { lw: w }); }
  });
  g.draw(path().poly([[-0.25, 10.5], [-0.25, 8.5], [-0.75, 8], [-0.75, 2.5], [-0.25, 2], [-0.25, 0]]), { rc: cm(0.12) });
  g.draw(path().poly([[0.25, 0], [0.25, 2], [0.75, 2.5], [0.75, 8], [0.25, 8.5], [0.25, 9.36]]), { rc: cm(0.12) });
  g.draw(path().M(0.25, 9.5).L(0.25, 10.5));
  g.fill(rect(-0.25, 10, -0.05, 10.5), HATCH);
  g.fill(rect(0.25, 10, 0.05, 10.5), HATCH);
  for (let n = 2.5; n <= 7.5; n++) { g.scope({ tf: [SHIFT(-0.25, n)] }, () => drop(g)); g.scope({ tf: [SHIFT(0.25, n)] }, () => drop(g)); }
  g.scope({ tf: [SHIFT(-0.25, -0.1)] }, () => drop(g));
  g.scope({ tf: [SHIFT(0.25, -0.1)] }, () => drop(g));
}
function condenser(g: G) {
  g.draw(path().A(3, 0, 0.5, 90, 270, 'M'));
  g.draw(path().A(7, 0, 0.5, 270, 450, 'M'));
  g.fill(rect(0, -0.05, 9, 0.05), W);
  g.scope({ lw: 0.4 }, () => { g.draw(path().M(-0.075, 0.05).L(9, 0.05)); g.draw(path().M(0.02, -0.05).L(9, -0.05)); });
  g.draw(path().M(3, 0.5).L(3.5, 0.5));
  g.draw(path().M(3, -0.5).L(6.5, -0.5));
  g.draw(path().M(3.6, 0.5).L(7, 0.5));
  g.scope({ lw: 0.4 }, () => {
    g.draw(path().M(3.5, 0.5).L(3.5, 1.5)); g.draw(path().M(3.6, 0.5).L(3.6, 1.5));
    g.draw(path().M(6.6, -0.5).L(6.6, -1.5)); g.draw(path().M(6.5, -0.5).L(6.5, -1.5));
  });
  g.draw(path().M(6.6, -0.5).L(7, -0.5));
  g.draw(path().M(6.55, -2.5).L(6.55, -1.5), { tips: ['', 'to'] });
  g.draw(path().M(3.55, 1.5).L(3.55, 2.5), { tips: ['', 'to'] });
}
function thermometer(g: G) {
  g.draw(path().poly([[-0.05, 0.25], [-0.05, 2.75], [0.05, 2.75], [0.05, 0.25]], true), { rc: cm(0.025) });
  g.filldraw(rect(-0.15, -0.25, 0.15, 0.25), C('red'), { rc: cm(0.06) });
  g.draw(path().M(0, 0).L(0, 2), { color: C('red'), lw: 0.8 });
}
function heater(g: G) { g.draw(path().poly([[1.17, 2.5], [0, 2.5], [0, 0], [5.5, 0], [5.5, 2.5], [4.33, 2.5]])); }
const SMALL_CYL_PATH = () => path().M(-0.5, 6).L(-0.5, 0.5).A(-1, 0.5, 0.5, 0, -90).L(-1, 0).L(1, 0).A(1, 0.5, 0.5, 270, 180).L(0.5, 0.5).L(0.5, 6).Z();
function smallCylinder(g: G) {
  g.scope({ lw: 0.72, cap: 'round', join: 'round' }, () => g.draw(path().M(-0.5, 6).L(-0.5, 0.5).A(-1, 0.5, 0.5, 0, -90).L(-1, 0).L(1, 0).A(1, 0.5, 0.5, 270, 180).L(0.5, 0.5).L(0.5, 6)));
}
function cylinderWithLiquid(g: G) {
  g.scope({}, () => { g.clip(SMALL_CYL_PATH()); g.fill(rect(-1.5, -1, 1.5, 1), colour(g.P.DistillateColor) || C('yellow')); });
  smallCylinder(g);
}
function distillationFlask(g: G) {
  g.fill(rect(-0.5, 2.25, -0.25, 3), HATCH);
  g.fill(rect(0.5, 2.25, 0.25, 3), HATCH);
  g.update();
  const L = g.L;
  g.draw(path().M(0.5, 1.5).L(0.5, 3), { lw: L });
  g.draw(path().M(-0.5, 1.5).L(-0.5, 3), { lw: L });
  g.draw(path().A(0, 0, 1.581, 71.565, 0, 'M'), { lw: L });
  g.draw(path().A(0, 0, 1.581, 180, 108.435, 'M'), { lw: L });
  const st = styleOf(g.P.MixtureStyle, g.st.styles);
  if (st.unknown) g.warn(msg('chemlab.warn.style', '{name}: no such style (define it with {name}/.style={…} in the picture’s options)', { name: unbrace(g.P.MixtureStyle) }));
  // \shade[\tkzMixtureStyle]: a style that sets no shading (Oil: fill=yellow) shades with TikZ's own, gray over white
  g.styled(path().smooth([[-1.581, 0], [-1.25, 0.1], [-0.75, -0.1], [0, 0.1], [0.75, -0.1], [1.25, 0.1], [1.581, 0]], 'M').arc(0, -180, 1.581),
    st.shade ? st : { ...st, fill: { k: 'axis', top: C('gray'), bottom: C('white') } });
  g.draw(path().A(0, 0, 1.581, 180, 360, 'M'), { lw: L });
}
function distillationFractionated(g: G) {
  g.scope({ tf: [SHIFT(0, -3)] }, () => {
    g.scope({ tf: [SHIFT(2.75, 13.5)] }, () => thermometer(g));
    g.scope({ tf: [SHIFT(2.75, 2.5)] }, () => distillationFlask(g));
    g.scope({ tf: [SHIFT(2.75, 4)] }, () => column(g));
    g.scope({ tf: [SHIFT(3, 13.4), ROT(-45)] }, () => condenser(g));
    g.scope({ tf: [SHIFT(0, 0)] }, () => heater(g));
    g.scope({ tf: [SHIFT(9.4, 0)] }, () => {
      cylinderWithLiquid(g);
      for (let l = 1; l <= 5; l++) g.draw(path().M(-0.4, l).L(-0.1, l), { lw: 1.5 * g.Gr });
      for (const y of dots(0.2, 0.4, 4.8)) g.draw(path().M(-0.4, y).L(-0.2, y), { lw: g.Gr });
    });
    for (const y of [7, 6, 4, 1.2]) g.scope({ tf: [SHIFT(9.37, y)] }, () => drop(g));
    g.scope({ tf: [SHIFT(0.75, 0.75)] }, () => {
      g.draw(circle(0, 0, 0.5));
      for (let a = 0; a <= 180; a += 30) { const c = Math.cos(a * RAD), s = Math.sin(a * RAD); g.draw(path().M(0.55 * c, 0.55 * s).L(0.65 * c, 0.65 * s)); }
      g.draw(path().M(0, 0).L(0, 0.45), { lw: cm(0.035), tips: ['', 'to'] });
    });
  });
}
function burnerBody(g: G) {
  g.draw(rect(-1.25, 0, 1.25, 0.25));
  g.draw(rect(-0.5, 1.25, 0.5, 2.25));
  for (const n of [-0.3, 0, 0.3]) g.draw(circle(n, 1.75, 0.1));
  g.draw(rect(-0.25, 2.25, 0.25, 4.25));
  g.draw(path().poly([[0.25, 1.25], [0.25, 0.5], [1.25, 0.25]]));
  g.draw(path().poly([[-1.25, 0.25], [-0.25, 0.5], [-0.25, 0.75]]));
  g.draw(path().M(-2.25, 0.75).L(-0.25, 0.75));
  g.draw(path().M(-2.25, 1).L(-0.25, 1));
  g.draw(ellipse(-0.25, 0.875, 0.1, 0.125));
  g.fill(rect(-2.25, 0.75, -0.25, 1), W);
  g.draw(path().M(-2.25, 0.75).L(-0.25, 0.75));
  g.draw(path().poly([[-2.25, 1], [-0.25, 1], [-0.25, 1.25]]));
  g.draw(path().smooth([[-0.25, 0.5], [0, 0.4], [0.25, 0.5]], 'M'));
}
const FLAME = () => path().M(0, 0).C(-0.25, 0, -0.35, 0.5, -0.4, 0.75).C(-0.35, 1, -0.25, 1.5, 0.5, 2).C(0.25, 1.5, 0.35, 1, 0.4, 0.75).C(0.35, 0.5, 0.25, 0, 0, 0);
function bunsenBurner(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    burnerBody(g);
    g.scope({ tf: [SHIFT(0, 4.25)] }, () => {
      g.fill(FLAME(), { k: 'axis', top: C('yellow'), bottom: C('PaleOrange') });
      g.scope({}, () => { g.clip(FLAME()); g.fill(path().poly([[-0.25, 0], [0.25, 0], [0, 1]], true), { k: 'axis', top: W, bottom: C('cyan') }); });
    });
  });
}
const FLAME_GRILL = () => path().A(0, 0.75, 0.75, 270, 360, 'M').A(1.5, 0.75, 0.75, 180, 90).L(1.5, 1.5).L(-1.5, 1.5).A(-1.5, 0.75, 0.75, 90, 0).A(0, 0.75, 0.75, 180, 270).Z();
function flameGrill(g: G) { g.fill(FLAME_GRILL(), styleOf('flameAndGrill', g.st.styles).fill); }
function bunsenBurnerGrill(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    burnerBody(g);
    const F = g.st.flame, k = n0(F.scale) || 1;
    g.scope({ tf: [SHIFT(0, 4.25), SCALE(k)] }, () => {
      g.scope({}, () => {
        g.clip(FLAME_GRILL());
        g.fill(rect(-1.5, 0, 1.5, 1.5), { k: 'axis', top: colour(F.outerEnd) || C('yellow'), bottom: colour(F.outer) || C('PaleOrange') });
        g.fill(path().poly([[-0.25, 0], [0.25, 0], [0, 1]], true), { k: 'axis', top: colour(F.innerEnd) || W, bottom: colour(F.inner) || C('cyan') });
      });
    });
    g.draw(path().M(-2, 5.75).L(2, 5.75), { lw: g.E, dash: [3, 3] });
  });
}
const ROUND_FLASK_PATH = () => path().A(-0.7, 3.4, 0.2, 90, 0, 'M').L(-0.5, 3.4).L(-0.5, 2.4).L(-0.489, 2.401).arc(113, 427, 1.25).L(0.5, 2.4).L(0.5, 3.4).A(0.7, 3.4, 0.2, 180, 90).L(0, 3.5).Z();
function roundFlaskSimple(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.draw(path().A(-0.7, 3.4, 0.2, 90, 0, 'M').L(-0.5, 3.4).L(-0.5, 2.4).L(-0.489, 2.401).arc(113, 427, 1.25));
    g.draw(path().M(0.489, 2.401).L(0.5, 2.4).L(0.5, 3.4).A(0.7, 3.4, 0.2, 180, 90));
    g.filldraw(ellipse(0, 3.6, 0.7, 0.1), W, { lw: g.L });
  });
}
// \tkzRoundFlaskGrill: \tkzRoundFlaskSimple 1.25 lower, its lip at 2.35. The package's right side climbs to 3.4 and back
// down to the lip, as written there.
function roundFlaskGrill(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.draw(path().A(-0.7, 2.15, 0.2, 90, 0, 'M').L(-0.5, 2.15).L(-0.5, 1.4).L(-0.489, 1.401).arc(113, 427, 1.25));
    g.draw(path().M(0.489, 1.401).L(0.5, 1.15).L(0.5, 3.4).A(0.7, 2.15, 0.2, 180, 90));
    g.filldraw(ellipse(0, 2.35, 0.7, 0.1), W, { lw: g.L });
  });
}
function testTubeStopper(g: G) {
  g.update();
  const LG = C('LightGray');
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.filldraw(ellipse(0, -0.3, 0.4, 0.1), LG);
    g.filldraw(path().poly([[-0.4, -0.3], [-0.6, 0.5], [0.6, 0.5], [0.4, -0.3]], true), LG);
    g.fill(ellipse(0, -0.3, 0.4, 0.1), LG);
    g.filldraw(ellipse(0, 0.5, 0.6, 0.1), LG);
  });
  g.draw(path().smooth([[-0.5, 0], [0, -0.07], [0.5, 0]], 'M'), { lw: g.E });
}
function testTubeBody(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.draw(path().M(-0.5, 3.5).L(-0.5, 0.5).arc(180, 360, 0.5).L(0.5, 3.5));
    g.draw(ellipse(0, 3.5, 0.5, 0.1), { lw: g.T });
  });
}
const TEST_TUBE_PATH = () => path().M(-0.5, 3.5).L(-0.5, 0.5).arc(180, 360, 0.5).L(0.5, 3.5).Z();
function stems(g: G, top: number) {
  const w = 0.5 * g.st.lw;
  g.draw(path().M(0.05, -1).L(0.05, top), { lw: w });
  g.draw(path().M(-0.05, -1).L(-0.05, top), { lw: w });
}
function straightTube(g: G) {
  const w = 0.5 * g.st.lw;
  stems(g, 5);
  testTubeStopper(g);
  g.filldraw(rect(-0.05, 5, 0.05, 0.5), W, { rc: 0.5, lw: w });
  g.draw(path().M(-0.1, 5).L(0.1, 5), { color: W, lw: cm(0.14) });
}
function bentTube(g: G, pts: number[][], cut: number[][]) {
  const w = 0.5 * g.st.lw;
  stems(g, 0);
  testTubeStopper(g);
  g.filldraw(path().poly(pts, true), W, { rc: cm(0.05), lw: w });
  g.draw(path().M(cut[0][0], cut[0][1]).L(cut[1][0], cut[1][1]), { color: W, lw: cm(0.14) });
}
const elbowTube = (g: G) => bentTube(g, [[-0.05, 0.5], [-0.05, 2], [8, 2], [8, 1.9], [0.05, 1.9], [0.05, 0.5]], [[7.95, 1.9], [8.05, 2]]);
const uTube = (g: G) => bentTube(g, [[-0.05, 0.5], [-0.05, 2], [4.5, 2], [4.5, -3], [4.4, -3], [4.4, 1.9], [0.05, 1.9], [0.05, 0.5]], [[4.3, -3], [4.6, -3]]);
const uTubeLong = (g: G) => bentTube(g, [[-0.05, 0.5], [-0.05, 2], [4.5, 2], [4.5, -9], [4.4, -9], [4.4, 1.9], [0.05, 1.9], [0.05, 0.5]], [[4.3, -9], [4.6, -9]]);
// the bent delivery tube of \tkzCurvedTube (len 5, down to -8.8) and \tkzCurvedTubeShort (3, to -2.8)
function curvedLines(g: G, len: number, low: number, firstStem: boolean) {
  const x = 0.5 + len, xr = x + 0.55;
  if (firstStem) g.draw(path().M(-0.05, 0.5).L(-0.05, 1));
  g.draw(path().A(0.5, 1, 0.55, 180, 90, 'M'));
  g.draw(path().M(0.5, 1.55).L(x, 1.55));
  g.draw(path().A(x, 1, 0.55, 90, 0, 'M'));
  g.draw(path().M(xr, 1).L(xr, low));
  g.draw(path().A(xr + 0.45, low, 0.45, 180, 360, 'M'));
  g.draw(path().M(xr + 0.9, low).L(xr + 0.9, low + 0.5));
  g.draw(path().M(xr + 1, low + 0.5).L(xr + 1, low));
  g.draw(path().A(xr + 0.45, low, 0.55, 0, -180, 'M'));
  g.draw(path().M(xr - 0.1, low).L(xr - 0.1, 1));
  g.draw(path().A(x, 1, 0.45, 0, 90, 'M'));
  g.draw(path().M(x, 1.45).L(0.5, 1.45));
  g.draw(path().A(0.5, 1, 0.45, 90, 180, 'M'));
  g.draw(path().M(0.05, 1).L(0.05, 0.5));
  g.draw(path().M(-0.05, 0.5).L(0.05, 0.5));
}
function curvedTube(g: G, short: boolean) {
  stems(g, 0);
  testTubeStopper(g);
  if (short) g.draw(path().M(-0.05, 0.5).L(-0.05, 1));
  g.scope({ lw: 0.4 }, () => curvedLines(g, short ? 3 : 5, short ? -2.8 : -8.8, !short));
  g.fill(rect(-0.025, 0.52, 0.02, 0.6), W);
}
// \tkzCurvedTubeShortDoubleTube: the short delivery tube \tkzTestTubeDoubleTube draws beside its thistle funnel
function curvedTubeShortDoubleTube(g: G) {
  g.scope({ lw: 0.4 }, () => curvedLines(g, 3, -2.8, true));
  g.fill(rect(-0.025, 0.52, 0.018, 0.8), W);
}
function doubleTube(g: G) {
  g.scope({ lw: 0.4 }, () => {
    g.draw(path().M(-0.3, -3).L(-0.3, 0)); g.draw(path().M(-0.2, -3).L(-0.2, 0));
    g.draw(path().M(0.25, -1).L(0.25, 0)); g.draw(path().M(0.15, -1).L(0.15, 0));
  });
  testTubeStopper(g);
  g.scope({ tf: [SHIFT(0.2, 0)] }, () => curvedTubeShortDoubleTube(g));
  g.scope({ tf: [SHIFT(0, 0.5)] }, () => {
    g.scope({ lw: 0.4 }, () => {
      g.filldraw(path().poly([[-0.3, 0], [-0.3, 2], [-0.5, 2.2], [-0.5, 3], [0, 3], [0, 2.2], [-0.2, 2], [-0.2, 0]], true), W, { rc: cm(0.05) });
      g.draw(path().poly([[0.1, 1.55], [-0.5, 1.55], [-0.5, 1.7], [-0.55, 1.7], [-0.55, 1.3], [-0.5, 1.3], [-0.5, 1.55], [-0.5, 1.45], [0.1, 1.45]]));
      g.filldraw(rect(-0.4, 1.3, -0.1, 1.7), W, { rc: 0.2 });
    });
    g.fill(ellipse(-0.25, 3, 0.3, 0.1), W);
  });
}
function clamp(g: G) {
  const PO = C('PaleOrange'), o = { cap: 'round', join: 'round' };
  g.filldraw(path().M(0.5, 0).C(0.25, -0.13, -0.25, -0.13, -0.5, 0).L(-0.8, 0).A(-0.5, 0, 0.3, 180, 270).L(-0.5, -0.3).L(2.5, -0.3).L(2.4, -0.2).L(1, 0).L(0.5, 0).Z(), PO, o);
  g.filldraw(path().M(-0.8, 0).L(-0.8, -0.3).A(-0.5, -0.3, 0.3, 180, 270).L(-0.5, -0.6).L(2.5, -0.6).L(2.5, -0.3).L(-0.5, -0.3).A(-0.5, 0, 0.3, -90, -180).Z(), PO, o);
  g.filldraw(path().M(-0.5, 0.05).A(-0.5, 0.05, 0.25, 180, 90).L(-0.5, 0.3).L(-0.5, 0.05).Z(), PO, o);
  g.filldraw(path().poly([[0.5, 0.3], [4.9, 0.3], [5, 0.2], [1, 0], [0.5, 0], [0.5, 0.3]], true), PO, o);
  g.filldraw(path().poly([[0.5, 0], [5, 0.2], [5, 0], [2, -0.2], [1, 0]], true), C('Brown'), o);
  const w = 1.5 * g.st.lw;
  g.draw(ellipse(1, 0, 0.3, 0.1), { lw: w, cap: 'round' });
  g.draw(path().poly([[0.7, 0], [0.4, -0.3], [0.4, -0.6]]), { lw: w, cap: 'round', join: 'round' });
}
function volumetricFlask(g: G) {
  g.update();
  g.draw(path().poly([[-0.21, 3.5], [-0.1, 3.5], [-0.1, 1.5], [-0.75, 0], [0.75, 0], [0.1, 1.5], [0.1, 3.5], [0.21, 3.5]]), { rc: cm(0.1), lw: g.L, cap: 'round', join: 'round' });
  g.draw(path().M(-0.1, 2.5).L(0.1, 2.5), { lw: g.Gr, cap: 'round' });
}
const VOL_FLASK_PATH = () => path().poly([[-0.21, 3.5], [-0.1, 3.5], [-0.1, 1.5], [-0.75, 0], [0.75, 0], [0.1, 1.5], [0.1, 3.5], [0.21, 3.5]], true);
function dishOutline(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.draw(path().M(-1.9, 2).L(-2, 2));
    g.draw(path().A(-2, 1.95, 0.05, 90, 270, 'M'));
    g.draw(path().M(-2, 1.9).L(-2, 1));
    g.draw(path().A(-1, 1, 1, 180, 270, 'M'));
    g.draw(path().M(-1, 0).L(1, 0));
    g.draw(path().A(1, 1, 1, 270, 360, 'M'));
    g.draw(path().M(2, 1).L(2, 1.9));
    g.draw(path().A(2, 1.95, 0.05, 270, 90, 'M'));
    g.draw(path().M(2, 2).L(1.9, 2));
    g.draw(path().M(1.9, 2).L(1.9, 1));
    g.draw(path().A(1, 1, 0.9, 0, -90, 'M'));
    g.draw(path().M(1, 0.1).L(-1, 0.1));
    g.draw(path().A(-1, 1, 0.9, 270, 180, 'M'));
    g.draw(path().M(-1.9, 1).L(-1.9, 2));
  });
}
const DISH_INSIDE = () => path().M(1.9, 2).L(1.9, 1).A(1, 1, 0.9, 0, -90).L(1, 0.1).L(-1, 0.1).A(-1, 1, 0.9, 270, 180).L(-1.9, 1).L(-1.9, 2).Z();
function crystallizingDish(g: G) { g.scope({}, () => { g.clip(DISH_INSIDE()); g.fill(rect(-3, -1, 3, 1.5), C('LightBlue1')); }); dishOutline(g); }
function invertedTube(g: G) {
  g.update();
  g.scope({ lw: g.E, cap: 'round', join: 'round' }, () => {
    g.fill(rect(-0.5, 0, 0.5, 5.5), C('LightBlue1'));
    g.draw(path().M(-0.5, 0).L(-0.5, 6).arc(180, 0, 0.5).L(0.5, 0));
  });
}
function testTubeRack(g: G) {
  g.scope({ lw: cm(0.1), ink: C('lightgray') }, () => {
    g.draw(path().A(0, -0.25, 1, 100, 140, 'M'));
    g.draw(path().A(0, -0.25, 1, 150, 160, 'M'));
    g.draw(path().A(0, -0.25, 1, 20, 80, 'M'));
  });
}
function beakerRim(g: G) {
  g.update();
  g.draw(ellipse(0, 2.55, 1.1, 0.1), { lw: g.L });
  for (const y of dots(0.5, 1.0, 2.0)) g.draw(path().M(-0.75, y).L(-0.4, y), { lw: 1.5 * g.Gr });
  for (const y of dots(0.5, 0.6, 2.0)) g.draw(path().M(-0.75, y).L(-0.5, y), { lw: g.Gr });
}
const BEAKER_LINE = () => path().M(-1, 2.5).L(-1, 0.5).A(-0.5, 0.5, 0.5, 180, 270).L(0.5, 0).A(0.5, 0.5, 0.5, 270, 360).L(1, 2.5);
function beakerBody(g: G) { g.update(); g.draw(BEAKER_LINE(), { lw: g.L, cap: 'round', join: 'round' }); }
const ERLEN_LINE = () => path().M(-0.5, 3.5).L(-0.5, 2.5).L(-1.3354, 0.4114).A(-1.0569, 0.3, 0.3, 158.2, 270).L(1.0569, 0).A(1.0569, 0.3, 0.3, -90, 21.8).L(0.5, 2.5).L(0.5, 3.5);
function erlenmeyerBody(g: G) { g.update(); g.draw(ERLEN_LINE(), { lw: g.L, cap: 'round', join: 'round' }); }
const BOTTLE_PATH = () => path().A(-0.6, 3.4, 0.1, 90, 0, 'M').L(-0.5, 3.4).L(-0.5, 3.1).A(-0.6, 3.1, 0.1, 0, -90).A(-0.6, 2.6, 0.4, 90, 180).L(-1, 2.6).L(-1, 0.2)
  .A(-0.8, 0.2, 0.2, 180, 270).L(-0.8, 0).L(0.8, 0).A(0.8, 0.2, 0.2, -90, 0).L(1, 0.2).L(1, 2.6).A(0.6, 2.6, 0.4, 0, 90).A(0.6, 3.1, 0.1, -90, -180).L(0.5, 3.1).L(0.5, 3.4)
  .A(0.6, 3.4, 0.1, 180, 90).Z();
function reagentBottleBody(g: G) {
  g.update();
  g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => {
    g.draw(path().A(-0.6, 3.4, 0.1, 90, 0, 'M'));
    g.draw(path().M(-0.5, 3.4).L(-0.5, 3.1));
    g.draw(path().A(-0.6, 3.1, 0.1, 0, -90, 'M'));
    g.draw(path().A(-0.6, 2.6, 0.4, 90, 180, 'M'));
    g.draw(path().M(-1, 2.6).L(-1, 0.2));
    g.draw(path().A(-0.8, 0.2, 0.2, 180, 270, 'M'));
    g.draw(path().M(-0.8, 0).L(0.8, 0));
    g.draw(path().A(0.8, 0.2, 0.2, -90, 0, 'M'));
    g.draw(path().M(1, 0.2).L(1, 2.6));
    g.draw(path().A(0.6, 2.6, 0.4, 0, 90, 'M'));
    g.draw(path().A(0.6, 3.1, 0.1, -90, -180, 'M'));
    g.draw(path().M(0.5, 3.1).L(0.5, 3.4));
    g.draw(path().A(0.6, 3.4, 0.1, 180, 90, 'M'));
  });
}
const WATCH_PATH = () => path().M(-1, 3.5).L(-0.5, 1).arc(180, 360, 0.5).L(1, 3.5).Z();
function watchGlassBody(g: G) { g.update(); g.scope({ lw: g.L, cap: 'round', join: 'round' }, () => g.draw(path().M(-1, 3.5).L(-0.5, 1).arc(180, 360, 0.5).L(1, 3.5))); }
function watchGlassBase(g: G) {
  g.update();
  g.scope({ lw: g.L, rc: cm(0.03), cap: 'round', join: 'round' }, () => g.draw(path().poly([[-0.5, 1], [-0.34, 0.2], [-1.2, 0], [1.2, 0], [0.34, 0.2], [0.5, 1]])));
}
// \tkzFunnelOutline: the funnel's two sides, unfilled and with sharp corners (the package never calls it)
const funnelOutline = (g: G) => g.scope({ cap: 'round', join: 'round' }, () => {
  g.draw(path().poly([[-0.07, 0], [-0.07, 1], [-1, 2.5]]));
  g.draw(path().poly([[1, 2.5], [0.07, 1], [0.07, 0.1]]));
});
function funnelBody(g: G) {
  g.scope({}, () => { g.clip(path().poly([[-0.07, 0], [-0.07, 1], [-1, 2.5], [1, 2.5], [0.07, 1], [0.07, 0.1]], true)); g.fill(rect(-2, -1, 2, 3), W); });
  g.scope({ rc: cm(0.25) }, () => { g.draw(path().poly([[-0.07, 0], [-0.07, 1], [-1, 2.5]])); g.draw(path().poly([[1, 2.5], [0.07, 1], [0.07, 0.1]])); });
  g.draw(ellipse(0, 2.5, 1, 0.1));
}
// the ball condenser's stem: seven bulbs each side, open at the top and the bottom
function stemPath(fill: boolean) {
  const p = path().A(-0.35, 7.5, 0.1, 90, 0, 'M').L(-0.25, 7.5).L(-0.25, 6.6).A(-0.15, 6.6, 0.1, 180, 270).A(-0.15, 6.4, 0.1, 90, 0).L(-0.05, 6.4).L(-0.05, 6);
  p.M(-0.05, 6);
  for (let i = 0; i < 7; i++) { const y = 6 - 0.75 * i; if (i) p.L(-0.05, y); p.arc(90, 270, 0.25).L(-0.05, y - 0.5); }
  p.L(-0.05, 0.75);
  const right = (q: Path) => {
    for (let i = 0; i < 7; i++) { const y = 1 + 0.75 * i; if (i) q.L(0.05, y); q.arc(270, 450, 0.25).L(0.05, y + 0.5); }
    q.L(0.05, 6.4).A(0.15, 6.4, 0.1, 180, 90).A(0.15, 6.6, 0.1, -90, 0).L(0.25, 6.6).L(0.25, 7.5).A(0.35, 7.5, 0.1, 180, 90);
    return q;
  };
  if (fill) { p.L(-0.05, -1.5).L(0.05, -1.5).L(0.05, 1); return right(p).Z(); }
  p.L(-0.05, -1.5);
  return [p, right(path().M(0.05, -1.5).L(0.05, 1))];
}
function condenserStem(g: G) {
  g.fill(stemPath(true) as Path, W);
  for (const p of stemPath(false) as Path[]) g.draw(p);
  g.scope({ tf: [SHIFT(0, -1.6)] }, () => drop(g));
}
function condenserBody(g: G) {
  g.fill(path().A(0, 5.75, 0.5, 0, 180, 'M').L(-0.5, 5.75).L(-0.5, 5.5).L(-1.5, 5.5).L(-1.5, 5.3).L(-0.5, 5.3).L(-0.5, 1.7).L(-1.5, 1.7).L(-1.5, 1.5).L(-0.5, 1.5).L(-0.5, 1)
    .A(0, 1, 0.5, 180, 360).L(0.5, 1).L(0.5, 5.75).Z(), { k: 'axis', top: C('PaleOrange'), bottom: C('cyan') });
  g.scope({ lw: 0.88 }, () => {
    g.draw(path().A(0, 5.75, 0.5, 0, 180, 'M'));
    g.draw(path().poly([[-0.5, 5.75], [-0.5, 5.5], [-1.5, 5.5]]));
    g.draw(path().poly([[-0.5, 5.75], [-0.5, 5.5], [-1.5, 5.5]]));
    g.draw(path().poly([[-1.5, 5.3], [-0.5, 5.3], [-0.5, 1.7], [-1.5, 1.7]]));
    g.draw(path().poly([[-1.5, 1.5], [-0.5, 1.5], [-0.5, 1]]));
    g.draw(path().A(0, 1, 0.5, 180, 360, 'M'));
    g.draw(path().M(0.5, 1).L(0.5, 5.75));
  });
  g.draw(path().M(-2.5, 1.6).L(-1.6, 1.6), { color: C('cyan'), tips: ['', 'to'] });
  g.draw(path().M(-2.5, 5.4).L(-1.6, 5.4), { color: C('PaleOrange'), tips: ['to', ''] });
}
function condenserBulbs(g: G) {
  g.scope({ tf: [SHIFT(0, 0.2)] }, () => { condenserBody(g); condenserStem(g); });
  testTubeStopper(g);
  g.fill(path().poly([[-0.05, 0.6], [-0.05, 0.5], [0.05, 0.5], [0.05, 0.6]], true), W, { rc: cm(0.025) });
}
function heaterRoundFlask(g: G) {
  g.filldraw(rect(-2, -1, 2, 1), W);
  g.draw(circle(-1.25, 0, 0.4));
  g.scope({ tf: [SHIFT(-1.25, 0)] }, () => {
    for (let a = 0; a <= 180; a += 30) { const c = Math.cos(a * RAD), s = Math.sin(a * RAD); g.draw(path().M(0.45 * c, 0.45 * s).L(0.6 * c, 0.6 * s)); }
    g.draw(path().M(0, 0).L(0.3 * Math.cos(60 * RAD), 0.3 * Math.sin(60 * RAD)), { tips: ['', 'to'] });
  });
  g.draw(rect(1, -0.5, 1.5, 0.5), { lw: 0.8 });
  g.filldraw(rect(1.14, -0.36, 1.36, 0.36), C('gray'), { lw: 0.8 });
  g.fill(circle(1.25, 0.7, 0.1), C('red'));
}
function roundFlaskReflux(g: G) {
  g.scope({}, () => {
    g.clip(ROUND_FLASK_PATH());
    const pts: number[][] = [];
    for (let i = 0; i <= 24; i++) pts.push([-1.5 + 0.125 * i, 1.5 + [0, 0.05, 0, -0.05][i % 4]]);
    g.styled(path().smooth(pts, 'M').L(1.5, 1.5).L(1.5, 0).L(-1.5, 0).L(-1.5, 1.5).Z(), { fill: { k: 'axis', top: C('cyan'), bottom: W }, draw: C('cyan') });
  });
  roundFlaskSimple(g);
}
const SEP_OUTLINE = () => path().M(-0.65, 15).L(-0.55, 13.75).C(-1.55, 13.54, -1.92, 12.7, -1.92, 11.65).C(-1.92, 10.6, -0.3, 9.55, -0.3, 8.5).L(-0.3, 2)
  .C(-0.3, 1.5, -0.14, 1.5, -0.14, 1).L(-0.14, -1).L(0.14, -1).L(0.14, 1).C(0.14, 1.5, 0.3, 1.5, 0.3, 2).L(0.3, 8.5).C(0.3, 9.55, 1.92, 10.6, 1.92, 11.65)
  .C(1.92, 12.7, 1.55, 13.54, 0.55, 13.75).L(0.65, 15);
function sepStopper(g: G) {
  g.update();
  const o = { lw: g.L, color: C('gray'), cap: 'round', join: 'round' };
  g.filldraw(path().poly([[-0.67, 15.25], [0.67, 15.25], [0.57, 14], [-0.57, 14]], true), colour('gray!10'), o);
  g.filldraw(path().A(0.555, 15.365, 0.1145, -90, -180, 'M').A(0, 15.92, 0.67, -45, 225).A(-0.555, 15.365, 0.1145, 0, -90).Z(), colour('gray!5'), o);
}
function tap(g: G, open: boolean) {
  g.update();
  const L = g.L;
  g.filldraw(rect(-0.2, 0.5, 0.2, 1), W, { lw: L });
  g.draw(rect(-0.2, 0.4, -0.3, 1.1), { lw: L });
  g.draw(rect(0.2, 0.4, 0.3, 1.1), { lw: L });
  if (open) g.draw(path().poly([[0.3, 0.6], [0.4, 0.6], [0.5, 0.3], [0.9, 0.3], [0.9, 1.2], [0.5, 1.2], [0.4, 0.9], [0.3, 0.9]], true), { lw: L });
  else {
    g.draw(path().A(0.35, 0.6, 0.05, 180, 90, 'M').L(0.4, 0.65).L(0.9, 0.65).L(0.9, 0.85).L(0.35, 0.85).A(0.35, 0.9, 0.05, -90, -180).Z(), { lw: L });
    g.draw(path().M(0.5, 0.65).L(0.5, 0.85), { lw: L });
  }
  g.fill(path().poly([[-0.6, 0.4], [-0.85, 0.6], [-0.85, 0.9], [-0.6, 1.1], [-0.3, 1.1], [-0.3, 0.4]], true), colour('cyan!50'));
  g.draw(path().M(-0.6, 0.4).L(-0.6, 1.1), { lw: L });
  if (open) g.draw(path().M(0.5, 0.3).L(0.5, 1.2), { lw: L });
}
function stand(g: G) {
  g.update();
  const wood = C('woodColor');
  g.scope({ lw: g.L }, () => {
    g.filldraw(rect(-2, -6, 5, -5), wood, { join: 'round' });
    g.filldraw(rect(2.75, 2, 3.25, 16), wood, { join: 'round' });
    g.filldraw(path().A(2.75, 1.5, 0.5, 90, 180, 'M').L(2.25, 1.5).L(2.25, -5).L(3.75, -5).L(3.75, 1.5).A(3.25, 1.5, 0.5, 0, 90).Z(), wood, { join: 'round' });
    g.draw(path().M(2, 11.5).L(1.55, 10.5));
    g.filldraw(path().poly([[-2.5, 11.5], [-2, 11.5], [-1.55, 10.5], [-2.5, 10.5]], true), wood, { join: 'round' });
    g.filldraw(path().poly([[4, 11.5], [2, 11.5], [1.55, 10.5], [4, 10.5]], true), wood, { join: 'round' });
    g.draw(rect(-2.5, 10.5, 4, 11.5));
    const knob = () => path().M(4, 11.2).L(4.5, 11.2).A(5, 11, 0.5385, 158.2, -158.2).L(4.5, 10.8).L(4, 10.8);
    g.fill(knob().Z(), wood);
    g.draw(knob());
    g.draw(path().M(4.5, 10.8).L(4.5, 11.2));
  });
}

// ---------------------------------------------------------------- what goes in the glass
// substance=\tkzChampagneBubbles[25], {\tkzFilaments[10]{red}} …: the macro, its count and its colour
function substanceOf(v: any) {
  const t = unbrace(v);
  if (!t) return null;
  const m = /^\\(tkz[A-Za-z]+)\s*(?:\[\s*([^\]]*)\])?\s*(?:\{([^{}]*)\})?\s*$/.exec(t);
  return m ? { name: m[1], n: m[2] != null && m[2].trim() !== '' ? parseInt(m[2], 10) : null, c: m[3] ?? null } : { name: '', raw: t, n: null, c: null };
}
const SUBST: Record<string, { n: number; colour?: boolean; solid?: boolean }> = {
  tkzChampagneBubbles: { n: 25 }, tkzFilaments: { n: 5, colour: true }, tkzBalls: { n: 50 }, tkzBubblesThreeD: { n: 50, colour: true }, tkzBubbles: { n: 25 },
  tkzCopperTurnings: { n: 30, solid: true }, tkzIronNail: { n: 60, solid: true }, tkzZincGranules: { n: 25, solid: true },
};
const scaleOf = (g: G) => (g.st.m[0] + g.st.m[3]) / 2;
// one of each solid, as \tkzIronNail, \tkzCopperTurnings and \tkzZincGranules scatter them (each \draw[scale=0.5])
function nails(g: G) {
  g.scope({ tf: [SCALE(0.5)] }, () => {
    g.draw(path().A(0, 0.5, 0.4, 190, 260, 'M'), { lw: cm(0.025), color: C('blue') });
    g.draw(path().M(-0.28, 0.2).L(0.5, 1), { lw: cm(0.025), color: C('blue') });
  });
}
const copper = (g: G) => g.scope({ tf: [SCALE(0.5)] }, () =>
  g.draw(path().M(0.25, 0.25).C(0, 0, -0.25, 0.25, 0.25, 0.75).C(0, 0.5, -0.25, 0.75, 0.25, 1.25).C(0, 1, -0.25, 1.25, 0.25, 1.75), { lw: cm(0.01), color: C('Copper') }));
const zinc = (g: G) => g.scope({ tf: [SCALE(0.5)] }, () =>
  g.filldraw(path().smooth([[0, 0], [-0.25, 0.25], [0, 0.5], [0.25, 0.75], [0.5, 0.5], [0.15, 0.4], [0, 0]], 'M').Z(), C('LightGray'), { color: BLACK }));
function contents(g: G, v: any, key: string) {
  const s = substanceOf(v);
  if (!s) return;
  if (!s.name || !SUBST[s.name]) { g.warn(msg('chemlab.warn.substance', '{key}={value}: not one of tikz-chemlab’s substances', { key, value: unbrace(v) })); return; }
  const def = SUBST[s.name], n = Math.max(0, Math.min(400, s.n ?? def.n));
  // \tkzFilaments and \tkzBubblesThreeD take their colour as a second argument; written without one, TeX takes the
  // package's next token for it and pdflatex draws them in black
  const ink = def.colour && s.c == null ? 'black' : s.c;
  const tilt = n0(g.P.tiltAngle), L1 = n0(g.P.liquidLevel1), k = scaleOf(g) || 1;
  const rot = (fn: () => void) => g.scope({ tf: [ROT(tilt)] }, fn);
  for (let i = 0; i < n; i++) {
    if (s.name === 'tkzChampagneBubbles') {
      const x = -1 + 2 * g.rand(), y = 2 * g.rand(), r = y * 0.0875;
      g.rand();
      rot(() => g.draw(circle(x, (y * L1) / 100, r), { lw: 0.6, color: BLACK }));
    } else if (s.name === 'tkzBubbles') {
      const x = -0.1 + 0.2 * g.rand(), y = 0.15 + 2.85 * g.rand(), r = (1.8 * y * (y < 1 ? 3 : y < 2 ? 2 : 1)) / (72 * k);
      rot(() => g.filldraw(circle(x, y * 1.5, r), W, { lw: 0.4, color: BLACK }));
    } else if (s.name === 'tkzFilaments') {
      const fw = cm(0.05 * k * g.rand()), q = g.rand();
      rot(() => g.draw(path().smooth([[q - 1, 2 * q - 1], [q + 0.2, q + 2], [q, q - 1], [q + 0.5, q + 4]], 'M'), { lw: fw, color: colour(ink) || BLACK }));
    } else if (s.name === 'tkzIronNail') {
      const x = (-1 + 2 * g.rand()) / k, y = (-0.2 + 0.6 * g.rand()) / k, a = -90 + 180 * g.rand();
      rot(() => g.scope({ tf: [SHIFT(x, y), ROT(a)] }, () => nails(g)));
    } else if (s.name === 'tkzCopperTurnings') {
      const x = (-1 + 2 * g.rand()) / k, y = (-0.2 + 0.5 * g.rand()) / k, a = -180 + 360 * g.rand();
      rot(() => g.scope({ tf: [SHIFT(x, y), ROT(a)] }, () => copper(g)));
    } else if (s.name === 'tkzZincGranules') {
      const x = (-1 + 2 * g.rand()) / k, y = (-0.2 + 0.5 * g.rand()) / k, a = -180 + 360 * g.rand();
      rot(() => g.scope({ tf: [SHIFT(x, y), ROT(a)] }, () => zinc(g)));
    } else {
      const x = -1.5 + 3 * g.rand(), y = 3 * g.rand(), r = (0.01 + 0.1 * g.rand()) * (y > 2 ? 3 : y > 1 ? 2 : 1);
      if (s.name === 'tkzBalls') rot(() => g.fill(circle(x, y, r), { k: 'radial', inner: W, outer: C('billeBlue') }));
      else rot(() => g.fill(circle(x, y, r), colour(ink) || BLACK));
    }
  }
}

// ---------------------------------------------------------------- tikz-chemlab.tex: the commands
const GLASS_CLIP = [TEST_TUBE_PATH, ROUND_FLASK_PATH, () => BEAKER_LINE().Z(), () => ERLEN_LINE().Z(), BOTTLE_PATH, VOL_FLASK_PATH, WATCH_PATH];
const glassClip = (g: G) => { const t = g.P.glass; g.clip(GLASS_CLIP[t] ? GLASS_CLIP[t]() : TEST_TUBE_PATH(), t === 5 ? cm(0.1) : 0); };
function glassDraw(g: G) {
  const t = g.P.glass;
  if (t === 0) testTubeBody(g);
  else if (t === 1) roundFlaskSimple(g);
  else if (t === 2) { beakerBody(g); beakerRim(g); }
  else if (t === 3 || t === 4) { if (t === 3) erlenmeyerBody(g); else reagentBottleBody(g); g.filldraw(ellipse(0, 3.5, 0.6, 0.1), W, { lw: g.E, cap: 'round' }); }
  else if (t === 5) volumetricFlask(g);
  else if (t === 6) { watchGlassBody(g); watchGlassBase(g); }
}
// \fill[liquid style] (-4,y) -- (-4,-1) -- (5,-1) -- (5,y) -- cycle, the level y = h · level/100 · cos(tilt)
function liquid(g: G, level: any, styleName: any, h: number) {
  const y = (h * n0(level) / 100) * Math.cos(n0(g.P.tiltAngle) * RAD), st = styleOf(styleName, g.st.styles);
  if (st.unknown) g.warn(msg('chemlab.warn.style', '{name}: no such style (define it with {name}/.style={…} in the picture’s options)', { name: unbrace(styleName) }));
  g.styled(path().poly([[-4, y], [-4, -1], [5, -1], [5, y]], true), st);
}
const liquids = (g: G, h: number, all = true, axis?: Mx) => {
  const P = g.P, per = (h * Math.cos(n0(P.tiltAngle) * RAD)) / 100;
  for (let n = 1; n <= (all ? 3 : 1); n++) g.level(`liquidLevel${n}`, n0(P[`liquidLevel${n}`]), 0, per, { axis });
  if (int(P.liquidLevel1) > 0) liquid(g, P.liquidLevel1, P.liquidStyle1, h);
  if (all && int(P.liquidLevel2) > 0) liquid(g, P.liquidLevel2, P.liquidStyle2, h);
  if (all && int(P.liquidLevel3) > 0) liquid(g, P.liquidLevel3, P.liquidStyle3, h);
};
const liquidClip = (g: G) => { const P = g.P; if (int(P.liquidLevel1) > 0) g.clip(rect(-4, -1.5, 5, 3 * n0(P.liquidLevel1) / 100 * Math.cos(n0(P.tiltAngle) * RAD))); };
const inGlass = (g: G, all: boolean) => g.scope({}, () => { glassClip(g); liquidClip(g); liquids(g, 3, all); contents(g, g.P.substance, 'substance'); contents(g, g.P.solid, 'solid'); });
// the keys of a call, set in the group's parameters; a key the package doesn't know stops pdflatex
type Opt = { k: string; v: string | null };
function setKeys(g: G, opts: Opt[]) {
  const P = g.P;
  for (const { k, v } of opts) {
    if (!KEYS.has(k)) { g.warn(msg('chemlab.warn.key', '{key}: tikz-chemlab has no such key, and pdfLaTeX stops at it', { key: k })); continue; }
    if (BOOL.includes(k)) {
      const b = v == null ? 'true' : unbrace(v);
      if (b !== 'true' && b !== 'false') { g.warn(msg('chemlab.warn.bool', '{key}={value}: true or false', { key: k, value: String(v) })); continue; }
      if (k === 'noDefaults') g.st.nd = b === 'true'; else P[k] = b === 'true';
      continue;
    }
    const val = v == null ? '' : v;
    if (k === 'glassType') { const i = GLASS.indexOf(unbrace(val)); if (i < 0) g.warn(msg('chemlab.warn.glass', 'glassType={value}: one of {list}; a test tube is drawn', { value: val, list: GLASS.join(', ') })); P.glass = i < 0 ? 0 : i; P.glassType = unbrace(val); continue; }
    if (/^liquidLevel|^tiltAngle$|^buretteLevel$|^reagentLevel$/.test(k) && !/^\s*-?\d+(\.\d+)?\s*$/.test(val)) g.warn(msg('chemlab.warn.number', '{key}={value}: a number', { key: k, value: val }));
    else if (/^liquidLevel\d$/.test(k) && !/^\s*-?\d+\s*$/.test(val)) g.warn(msg('chemlab.warn.whole', '{key}={value}: a whole number (TeX compares it with \\ifnum)', { key: k, value: val }));
    if (STORE.includes(k)) { P[k] = val; continue; }
    // \chemlabset's own: line widths, styles, the flame
    if (k === 'style') { const w = LINE_STYLES[unbrace(val)]; if (w) g.st.base = w.slice(); else g.warn(msg('chemlab.warn.lineStyle', 'style={value}: one of {list}', { value: val, list: Object.keys(LINE_STYLES).join(', ') })); }
    else if (/^(line width|linewidth)$/.test(k)) { const w = labWidth(g, k, val); if (isFinite(w)) g.st.base = [w, w, w, w]; }
    else if (/^(outline|ellipse|tube ellipse|graduation)( line)? width$/.test(k)) {
      const w = labWidth(g, k, val);
      if (isFinite(w)) g.st.base[/^outline/.test(k) ? 0 : /^ellipse/.test(k) ? 1 : /^tube/.test(k) ? 2 : 3] = w;
    }
    else if (k === 'flame outer color') g.st.flame.outer = val;
    else if (k === 'flame outer end color') g.st.flame.outerEnd = val;
    else if (k === 'flame inner color') g.st.flame.inner = val;
    else if (k === 'flame inner end color') g.st.flame.innerEnd = val;
    else if (k === 'flame scale') g.st.flame.scale = val;
  }
}
const opts = (s: string | null): Opt[] => split(s || '').map(kv);
const fresh = (g: G) => { g.st.P = { ...defaults(), sepL1: g.P.sepL1, sepL2: g.P.sepL2 }; };
function testTube(g: G, o: Opt[]) {
  g.scope({}, () => {
    if (!g.st.nd) fresh(g);
    setKeys(g, o);
    const P = g.P, tilt = n0(P.tiltAngle);
    g.scope({}, () => g.scope({ tf: [ROT(tilt)] }, () => {
      const axis = g.st.m.slice();
      g.scope({}, () => {
        glassClip(g);
        g.scope({ tf: [ROT(-tilt)] }, () => { liquidClip(g); liquids(g, 3, true, axis); contents(g, P.substance, 'substance'); contents(g, P.solid, 'solid'); });
      });
      if (P.label) g.node(P.Number, 0, 2, { fill: 'VeryLightGray', inner: 2 });
      glassDraw(g);
      const top = (fn: (g: G) => void) => g.scope({ tf: [SHIFT(0, 3.5)] }, () => fn(g));
      if (P.straightTube) top(straightTube); else if (P.elbowTube) top(elbowTube); else if (P.uTube) top(uTube); else if (P.stopper) top(testTubeStopper);
      if (P.clamp) g.scope({ tf: [SHIFT(0, 3.2)] }, () => clamp(g));
    }));
  });
}
const kvs = (t: string) => opts(t);
function heatTube(g: G, o: Opt[]) {
  g.scope({}, () => {
    fresh(g);
    setKeys(g, o);
    g.st.nd = true;
    const P = g.P;
    g.scope({}, () => {
      if (P.bubbling) {
        g.scope({ tf: [SHIFT(0, 0.5)] }, () => testTube(g, kvs('elbowTube=true,tiltAngle=-60,noDefaults=true')));
        g.quiet++;
        g.scope({ tf: [SHIFT(9.2, -5)] }, () => testTube(g, kvs('liquidLevel1=70,glassType=tube,elbowTube=false,tiltAngle=30,liquidStyle1=Champagne,substance={\\tkzChampagneBubbles[10]},clamp=false')));
        g.quiet--;
      } else {
        const at = P.glass === 0 ? (P.tubeOnly ? [0.5, 0.5] : P.elbowTube ? [-0.5, 0.5] : [0, 0.5]) : P.glass === 1 ? [1, 0.5] : [0, 0.5];
        g.scope({ tf: [SHIFT(at[0], at[1])] }, () => testTube(g, kvs('tiltAngle=-60,noDefaults=true')));
      }
      if (P.bunsenBurner) g.scope({ tf: [SHIFT(1, -5)] }, () => bunsenBurner(g));
    });
  });
}
function gasCollector(g: G) {
  crystallizingDish(g); testTubeRack(g);
  g.scope({ tf: [SHIFT(0, 0.7)] }, () => { invertedTube(g); contents(g, '\\tkzBubbles', 'gasCollection'); });
}
function fittings(g: G, reflux: boolean) {
  const P = g.P, top = (fn: (g: G) => void) => g.scope({ tf: [SHIFT(0, 3.5)] }, () => fn(g));
  if (P.straightTube) top(straightTube); else if (P.elbowTube) top(elbowTube); else if (P.uTube) top(uTube); else if (P.uTubeLong) top(uTubeLong);
  else if (P.curvedTube) top((g) => curvedTube(g, false)); else if (P.curvedTubeShort) top((g) => curvedTube(g, true)); else if (P.stopper) top(testTubeStopper);
  else if (P.doubleTube) top(doubleTube);
  else if (reflux && P.condenserBulbs) { roundFlaskReflux(g); top(condenserBulbs); heaterRoundFlask(g); }
}
// \tkzHeatFlask, \tkzRoundFlask and \tkzTitration set their keys in the group they are called in (no \begingroup):
// what they set stays for the next call there; each moves the next one of them sideways
function heatFlask(g: G, o: Opt[]) {
  fresh(g); setKeys(g, o);
  const P = g.P;
  g.scope({ tf: [SHIFT(g.st.acc, 0)] }, () => {
    if (P.gasCollection) {
      if (P.curvedTube) g.scope({ tf: [SHIFT(8, -5)] }, () => gasCollector(g));
      else if (P.curvedTubeShort) { g.P.bunsenBurner = false; g.scope({ tf: [SHIFT(6, 1)] }, () => gasCollector(g)); }
      else if (P.doubleTube) { g.P.bunsenBurner = false; g.scope({ tf: [SHIFT(6.2, 1)] }, () => gasCollector(g)); }
    }
    g.scope({ tf: [SHIFT(1, 1)] }, () => { inGlass(g, false); glassDraw(g); fittings(g, false); });
    if (g.P.bubbling) { g.quiet++; g.scope({ tf: [SHIFT(5.3, -5)] }, () => testTube(g, kvs('liquidLevel1=70,glassType=tube'))); g.quiet--; }
    if (g.P.bunsenBurner) g.scope({ tf: [SHIFT(1, -5)] }, () => bunsenBurnerGrill(g));
  });
  g.st.acc += P.uTubeLong || P.uTube ? 0 : P.curvedTubeShort || P.doubleTube ? 11 : 6;
}
function roundFlask(g: G, o: Opt[]) {
  fresh(g); setKeys(g, o);
  const P = g.P;
  g.scope({ tf: [SHIFT(g.st.acc, 0)] }, () => g.scope({ tf: [ROT(n0(P.tiltAngle))] }, () => {
    inGlass(g, true);
    if (P.label) g.node(P.Number, 0, 1.5, { fill: 'VeryLightGray', inner: 2 });
    glassDraw(g);
    fittings(g, true);
  }));
  g.st.acc += 4;
}
function titration(g: G, o: Opt[]) {
  const was = g.P;
  fresh(g); setKeys(g, o);
  const P = g.P;
  if (P.glass === 0) { P.glass = was.glass; P.glassType = was.glassType; }
  if (int(P.liquidLevel1) === 50) P.liquidLevel1 = was.liquidLevel1;
  if (P.glass === 0 || P.glass >= 5) { P.glass = 1; P.glassType = 'roundFlask'; }
  g.scope({ tf: [SHIFT(g.st.acc, 0)] }, () => {
    const pH = P.pHMeter;
    g.useBox(pH ? -5 : -2, 0, pH ? 3 : 2, P.burette ? 16 : 5);
    g.scope({ tf: [SHIFT(0, 1.5)] }, () => {
      g.scope({}, () => { glassClip(g); liquidClip(g); liquids(g, 3, false); contents(g, P.substance, 'substance'); contents(g, P.solid, 'solid'); });
      glassDraw(g);
    });
    if (P.burette) g.scope({ tf: [SHIFT(0, 4.5)] }, () => {
      g.level('buretteLevel', n0(P.buretteLevel), 2.68, 0.32, { ax: 0.125, max: 26 }); // the bore, 2.68 to 11
      g.scope({}, () => { g.clip(BURETTE_PATH()); g.fill(rect(-1, -1, 1, n0(P.buretteLevel) * 0.32 + 2.68), colour(P.buretteColor) || C('VeryPaleOrange')); });
      buretteBody(g); buretteStopcock(g); buretteGraduation(g);
    });
    if (pH) g.scope({ tf: [SHIFT(-3, 0)] }, () => phMeter(g));
    if (P.magneticStirrer) { g.scope({ tf: [SHIFT(0, 1.5)] }, () => stirBar(g)); g.scope({}, () => titrationStand(g)); }
    else { g.update(); g.draw(rect(-1.5, 0, 1.5, 1.5), { lw: g.L }); }
    if (P.burette) g.node(P.buretteReagent, 2, 11, { anchor: 'west' });
    g.node(P.beakerReagent, 2, 3.5, { anchor: 'west' });
  });
  g.st.acc += P.pHMeter ? 8 : 4;
}
function funnel(g: G, o: Opt[]) {
  g.scope({}, () => {
    fresh(g); setKeys(g, o); g.st.nd = true;
    const P = g.P, t = int(P.tiltAngle);
    g.scope({}, () => {
      const at = t === 0 ? (P.glass === 2 ? [-0.25, -1.4] : [0, -2]) : t > 0 ? [1, -2] : [-1, -2];
      g.scope({ tf: [SHIFT(at[0], at[1])] }, () => testTube(g, kvs('noDefaults=true')));
      g.scope({ tf: [SHIFT(0, 0.2)] }, () => funnelBody(g));
    });
  });
}
function graduatedCylinder(g: G, o: Opt[]) {
  g.scope({}, () => {
    fresh(g); setKeys(g, o);
    const P = g.P;
    g.scope({}, () => g.scope({ tf: [ROT(n0(P.tiltAngle))] }, () => {
      g.scope({}, () => { g.clip(CYL_PATH()); liquids(g, 4.5); contents(g, P.substance, 'substance'); });
      cylinderBody(g); cylinderBase(g); cylinderGraduation(g);
      g.scope({ tf: [SHIFT(0, 5)] }, () => cylinderRim(g));
    }));
  });
}
function pipette(g: G, o: Opt[], large: boolean) {
  g.scope({}, () => {
    fresh(g); setKeys(g, o);
    const P = g.P;
    g.scope({}, () => {
      g.useBox(-1, -1, 1, 6);
      g.level('reagentLevel', n0(P.reagentLevel), 0, 0.5, { ax: large ? -0.115 : 0, max: large ? 45 : 12, step: 0.5 }); // up the stem, to its top
      g.scope({}, () => {
        g.clip(large ? path().poly([[0, 0], [0, 1], [-0.23, 2.5], [-0.23, 22.5]]).arc(-80, 80, 0.45).Z() : PIPETTE_PATH());
        g.fill(rect(-1, -2, 1, n0(P.reagentLevel) / 2), colour(P.reagentColor) || C('PaleOrange'));
      });
      if (large) largePipetteBody(g); else { pipetteBody(g); drop(g); }
    });
  });
}
function distillation(g: G, o: Opt[]) {
  g.scope({}, () => { fresh(g); setKeys(g, o); g.scope({}, () => { g.useBox(-4, -10, 8, 7); g.scope({ tf: [SHIFT(-3, -7)] }, () => distillationFractionated(g)); }); });
}
const SEP_KEYS = new Set(['stopper', 'TapOpen', 'liquidLevel1', 'liquidLevel2']);
function separatoryFunnel(g: G, o: Opt[]) {
  g.scope({}, () => {
    g.update();
    setKeys(g, o.map((x) => ({ k: x.k === 'liquidLevel1' ? 'sepL1' : x.k === 'liquidLevel2' ? 'sepL2' : x.k, v: x.v })).filter((x) => {
      if (x.k === 'sepL1' || x.k === 'sepL2') { g.P[x.k] = x.v ?? ''; return false; }
      if (!SEP_KEYS.has(x.k)) { g.warn(msg('chemlab.warn.sepKey', '{key}: \\tkzSeparatoryFunnel takes only stopper, TapOpen, liquidLevel1 and liquidLevel2', { key: x.k })); return false; }
      return true;
    }));
    const P = g.P, a = n0(P.sepL1), b = n0(P.sepL2);
    g.level('liquidLevel1', a, 0, 1, { min: 1, max: 13, step: 0.1 }); g.level('liquidLevel2', b, 0, 1, { min: 1, max: 13, step: 0.1 });
    g.scope({}, () => { g.clip(SEP_OUTLINE().Z()); g.fill(rect(-2, 1, 2, a), C('AqueousPhaseColor')); });
    g.scope({}, () => { g.clip(SEP_OUTLINE().Z()); g.fill(rect(-2, a, 2, b), C('OrganicPhaseColor')); });
    if (P.stopper) sepStopper(g);
    g.update();
    g.draw(SEP_OUTLINE(), { lw: g.L, cap: 'round', join: 'round' });
    tap(g, P.TapOpen);
    g.filldraw(ellipse(0, -1, 0.15, 0.25), W, { lw: g.L });
    g.fill(circle(-0.675, 15, 0.03), C('darkgray'));
    g.fill(circle(0.675, 15, 0.03), C('darkgray'));
    g.draw(path().M(-0.65, 15).L(0.65, 15), { color: C('darkgray'), lw: g.L });
    g.draw(path().M(-0.55, 13.75).L(0.55, 13.75), { color: C('gray'), lw: g.L });
  });
}
// every macro a picture may call: name → [draw, takes options]
const MACROS: Record<string, [(g: G, o: Opt[], it?: Item) => void, boolean]> = {
  tkzTestTube: [testTube, true], tkzHeatTube: [heatTube, true], tkzRoundFlask: [roundFlask, true], tkzHeatFlask: [heatFlask, true], tkzFunnel: [funnel, true],
  tkzGraduatedCylinder: [graduatedCylinder, true], tkzPipette: [(g, o) => pipette(g, o, false), true], tkzLargePipette: [(g, o) => pipette(g, o, true), true],
  tkzTitration: [titration, true], tkzDistillation: [distillation, true], tkzSeparatoryFunnel: [separatoryFunnel, true],
  tkzStand: [stand, false], tkzColumn: [column, false], tkzBunsenBurner: [bunsenBurner, false], tkzBunsenBurnerGrill: [bunsenBurnerGrill, false], tkzFlameGrill: [flameGrill, false],
  tkzThermometer: [thermometer, false], tkzCondenser: [condenser, false], tkzHeater: [heater, false], tkzCrystallizingDish: [crystallizingDish, false],
  tkzInvertedTube: [invertedTube, false], tkzTestTubeRack: [testTubeRack, false], tkzHeaterRoundFlask: [heaterRoundFlask, false], tkzRoundFlaskReflux: [roundFlaskReflux, false],
  tkzCondenserBulbs: [condenserBulbs, false], tkzCondenserStem: [condenserStem, false], tkzCondenserBody: [condenserBody, false], tkzBeakerBody: [beakerBody, false],
  tkzBeakerRim: [beakerRim, false], tkzErlenmeyerBody: [erlenmeyerBody, false], tkzReagentBottleBody: [reagentBottleBody, false], tkzWatchGlassBody: [watchGlassBody, false],
  tkzWatchGlassBase: [watchGlassBase, false], tkzVolumetricFlask: [volumetricFlask, false], tkzRoundFlaskSimple: [roundFlaskSimple, false], tkzTestTubeBody: [testTubeBody, false],
  tkzTestTubeStopper: [testTubeStopper, false], tkzTestTubeClamp: [clamp, false], tkzTestTubeStraightTube: [straightTube, false], tkzTestTubeElbowTube: [elbowTube, false],
  tkzTestTubeUTube: [uTube, false], tkzTestTubeUTubeLong: [uTubeLong, false], tkzCurvedTube: [(g) => curvedTube(g, false), false], tkzCurvedTubeShort: [(g) => curvedTube(g, true), false],
  tkzTestTubeDoubleTube: [doubleTube, false], tkzFunnelBody: [funnelBody, false], tkzStopper: [sepStopper, false], tkzTapOpen: [(g) => tap(g, true), false],
  tkzTapClosed: [(g) => tap(g, false), false], tkzSeparatoryFunnelBody: [(g) => { g.update(); g.draw(SEP_OUTLINE(), { lw: g.L, cap: 'round', join: 'round' }); }, false],
  tkzBuretteBody: [buretteBody, false], tkzBuretteStopcock: [buretteStopcock, false], tkzBuretteGraduation: [buretteGraduation, false], tkzTitrationPHMeter: [phMeter, false],
  tkzTitrationStand: [titrationStand, false], tkzTitrationStirBar: [stirBar, false], tkzPipetteBody: [pipetteBody, false], tkzLargePipetteBody: [largePipetteBody, false],
  tkzDrop: [drop, false], tkzGraduatedCylinderBody: [cylinderBody, false], tkzGraduatedCylinderRim: [cylinderRim, false], tkzGraduatedCylinderBase: [cylinderBase, false],
  tkzGraduatedCylinderGraduation: [cylinderGraduation, false], tkzDistillationFractionated: [distillationFractionated, false], tkzGraduatedCylinderSmall: [smallCylinder, false],
  tkzGraduatedCylinderWithLiquid: [cylinderWithLiquid, false], tkzCurvedTubeShortDoubleTube: [curvedTubeShortDoubleTube, false], tkzRoundFlaskGrill: [roundFlaskGrill, false],
  tkzFunnelOutline: [funnelOutline, false], tkzNails: [nails, false], tkzCopper: [copper, false], tkzZinc: [zinc, false],
};
// a substance called on its own, with its count and colour as written (\tkzFilaments[8]{red})
for (const name of Object.keys(SUBST)) MACROS[name] = [(g, _o, it) => contents(g, `\\${name}${it?.o != null ? `[${it.o}]` : ''}${it?.arg != null ? `{${it.arg}}` : ''}`, name), false];

// ---------------------------------------------------------------- reading the code
// The model: the picture's options, and its body as a list of items, each with what came before it (spaces, line
// breaks: `lead`) and its own text as written (`raw`), changed only when the item is edited (`dirty`):
//   app    { cmd, o (options as written, or null), ops (read), sc (the scope round it: null, or its options and the
//            text inside it), at (where the scope's shifts put its origin, local cm, or null) }
//   label  { o, at, t }                          \node[o] at (x,y) {t};
//   line   { o, pts }                            \draw[o] (x,y) -- (x,y) …;
//   scope  { o, body (items), inner (text) }     a scope round anything else
//   set    { o }  \chemlabset{o}  ·  tikzset { o }  ·  bbox { a, b }  \useasboundingbox (a) rectangle (b);
//   comment { }, raw { }                         kept as written; raw is not drawn
type Item = any;
const PATHCMD = /^\\(draw|node|path|fill|filldraw|coordinate|shade|shadedraw|pic|clip|foreach|matrix|useasboundingbox)\b/;
function statementEnd(rest: string) {
  let d = 0;
  for (let k = 0; k < rest.length; k++) {
    const c = rest[k];
    if (c === '\\') { k++; continue; }
    if (c === '%') { const e = rest.indexOf('\n', k); if (e < 0) return -1; k = e; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    else if (c === ';' && d === 0) return k + 1;
  }
  return -1;
}
// the end of a scope opened just before i (nested ones skipped), as [start of \end{scope}, after it], or null
function scopeEnd(s: string, i: number): [number, number] | null {
  let d = 1;
  for (const m of s.slice(i).matchAll(/\\(begin|end)\s*\{scope\}/g)) if ((d += m[1] === 'begin' ? 1 : -1) === 0) return [i + m.index!, i + m.index! + m[0].length];
  return null;
}
function parseBody(body: string): { items: Item[]; tail: string } {
  const items: Item[] = [];
  let i = 0;
  for (;;) {
    const ws = /^\s*/.exec(body.slice(i))![0];
    if (i + ws.length >= body.length) return { items, tail: body.slice(i) };
    const lead = ws, at0 = i + ws.length, rest = body.slice(at0);
    const push = (it: Item, len: number) => { it.lead = lead; it.raw = rest.slice(0, len); items.push(it); i = at0 + len; };
    if (rest[0] === '%') { const e = rest.indexOf('\n'); push({ k: 'comment' }, e < 0 ? rest.length : e); continue; }
    let m = /^\\begin\s*\{scope\}/.exec(rest);
    if (m) {
      let j = m[0].length, o: string | null = null;
      const w = /^\s*/.exec(rest.slice(j))![0];
      if (rest[j + w.length] === '[') { const e = close(rest, j + w.length); if (e > 0) { o = rest.slice(j + w.length + 1, e); j = e + 1; } }
      const se = scopeEnd(rest, j);
      if (se) {
        const inner = rest.slice(j, se[0]), sub = parseBody(inner), real = sub.items.filter((x) => x.k !== 'comment');
        const one = sub.items.length === 1 && real[0]?.k === 'app' && !real[0].sc;
        push(one ? { ...real[0], sc: { o, inner, call: real[0].raw }, at: shiftOf(o) } : { k: 'scope', o, inner, body: sub.items, at: shiftOf(o) }, se[1]);
        continue;
      }
    }
    m = /^\\(tkz[A-Za-z]+)(?![A-Za-z@])/.exec(rest);
    if (m) {
      let j = m[0].length, o: string | null = null, arg: string | null = null;
      // options are read on every call: on one that takes none, pdflatex sets them as text, and they are named
      const w = /^[ \t]*/.exec(rest.slice(j))![0];
      if (rest[j + w.length] === '[') { const e = close(rest, j + w.length); if (e > 0) { o = rest.slice(j + w.length + 1, e); j = e + 1; } }
      // a substance called on its own takes [n] and {colour}
      if (SUBST[m[1]]) { const w2 = /^[ \t]*/.exec(rest.slice(j))![0]; if (rest[j + w2.length] === '{') { const e = close(rest, j + w2.length); if (e > 0) { arg = rest.slice(j + w2.length + 1, e); j = e + 1; } } }
      push({ k: 'app', cmd: m[1], o, ops: opts(o), sc: null, at: null, ...(arg != null ? { arg } : {}) }, j);
      continue;
    }
    m = /^\\chemlabset\s*\{/.exec(rest);
    if (m) { const e = close(rest, m[0].length - 1); if (e > 0) { push({ k: 'set', o: rest.slice(m[0].length, e) }, e + 1); continue; } }
    m = /^\\tikzset\s*\{/.exec(rest);
    if (m) { const e = close(rest, m[0].length - 1); if (e > 0) { push({ k: 'tikzset', o: rest.slice(m[0].length, e) }, e + 1); continue; } }
    if (PATHCMD.test(rest)) {
      const e = statementEnd(rest);
      if (e > 0) {
        const st = rest.slice(0, e);
        const it = readNode(st) || readLine(st) || readBox(st) || { k: 'raw' };
        push(it, e);
        continue;
      }
    }
    const nl = rest.indexOf('\n');
    push({ k: 'raw' }, nl < 0 ? rest.length : nl);
  }
}
const NUM = '(-?[\\d.]+)';
function readNode(st: string): Item | null {
  const m = new RegExp(`^\\\\node\\s*(?:\\[([^\\]]*)\\])?\\s*at\\s*\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)\\s*\\{`).exec(st);
  if (!m) return null;
  const b = m[0].length - 1, e = close(st, b);
  if (e < 0 || !/^\s*;$/.test(st.slice(e + 1))) return null;
  return { k: 'label', o: m[1] ?? null, at: [parseFloat(m[2]), parseFloat(m[3])], t: st.slice(b + 1, e) };
}
function readLine(st: string): Item | null {
  const m = /^\\draw\s*(?:\[((?:[^\][]|\[[^\]]*\]|\{[^{}]*\})*)\])?\s*/.exec(st);
  if (!m) return null;
  const body = st.slice(m[0].length).replace(/;\s*$/, '').trim(), pts: Pt[] = [];
  for (const part of body.split(/\s*--\s*/)) { const p = pair(part); if (!p) return null; pts.push(p); }
  return pts.length >= 2 ? { k: 'line', o: m[1] ?? null, pts } : null;
}
function readBox(st: string): Item | null {
  const m = new RegExp(`^\\\\(?:useasboundingbox|path\\s*\\[\\s*use as bounding box\\s*\\])\\s*\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)\\s*rectangle\\s*\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)\\s*;$`).exec(st.trim());
  return m ? { k: 'bbox', a: [+m[1], +m[2]], b: [+m[3], +m[4]] } : null;
}
// A scope's leading shifts: the shift={(x,y)}, xshift and yshift written before any other transformation (options
// that don't transform, such as a line width, may come between). Together they are where the scope moves its origin to,
// in the coordinates round it (cm, as a plain TikZ coordinate is), whatever comes after them. The editor moves a scope by
// rewriting them as one shift and leaves the rest as written. lead: the indices of those options.
const TRANSFORM = /^(scale|xscale|yscale|rotate|cm|xslant|yslant|x|y|z|shift only|reset cm|rotate around|scale around)$/;
function leadShift(o: string | null): { at: Pt; lead: number[] } {
  let x = 0, y = 0;
  const lead: number[] = [];
  split(o || '').some((it, n) => {
    const { k, v } = kv(it);
    let d: Pt | null = null;
    if (k === 'shift') d = pair(v);
    else if (k === 'xshift') { const c = lenCm(v); d = isFinite(c) ? [c, 0] : null; }
    else if (k === 'yshift') { const c = lenCm(v); d = isFinite(c) ? [0, c] : null; }
    else return TRANSFORM.test(k);
    if (!d) return true;
    x += d[0]; y += d[1]; lead.push(n);
    return false;
  });
  return { at: [x, y], lead };
}
const shiftOf = (o: string | null): Pt => leadShift(o).at;
// the options with their leading shifts written as one shift to `at` (none when it is the origin)
function withShift(o: string | null, at: Pt) {
  const { lead } = leadShift(o), rest = split(o || '').filter((_x, n) => !lead.includes(n));
  return [...(Math.abs(at[0]) > 1e-9 || Math.abs(at[1]) > 1e-9 ? [`shift={${pt(at)}}`] : []), ...rest];
}
// a scope's own scale as written ('' when it has none), and its options with that scale set (null takes it out). A new
// scale goes straight after the leading shifts, so the item grows or shrinks about its origin; one already written
// keeps its place.
const scaleIn = (o: string | null) => { const x = split(o || '').map(kv).find((y) => y.k === 'scale'); return x && x.v != null ? unbrace(x.v) : ''; };
function withScale(o: string | null, v: string | null): string | null {
  const list = split(o || ''), at = list.findIndex((x) => kv(x).k === 'scale');
  if (at >= 0) { if (v == null) list.splice(at, 1); else list[at] = `scale=${v}`; }
  else if (v != null) { const { lead } = leadShift(o); list.splice(lead.length ? Math.max(...lead) + 1 : 0, 0, `scale=${v}`); }
  return list.map((x) => x.trim()).join(', ') || null;
}
// a scope's options as transformations, in the order written (the rest: line widths, styles … are not ours)
function transforms(o: string | null, styles?: Map<string, string>): Mx[] {
  const out: Mx[] = [];
  for (const it of split(o || '')) {
    const { k, v } = kv(it);
    if (k === 'shift') { const p = pair(v); if (p) out.push(SHIFT(p[0], p[1])); }
    else if (k === 'xshift') { const c = lenCm(v); if (isFinite(c)) out.push(SHIFT(c, 0)); }
    else if (k === 'yshift') { const c = lenCm(v); if (isFinite(c)) out.push(SHIFT(0, c)); }
    else if (k === 'scale') { const s = parseFloat(v!); if (isFinite(s)) out.push(SCALE(s)); }
    else if (k === 'xscale') { const s = parseFloat(v!); if (isFinite(s)) out.push(SCALE(s, 1)); }
    else if (k === 'yscale') { const s = parseFloat(v!); if (isFinite(s)) out.push(SCALE(1, s)); }
    else if (k === 'rotate') { const a = parseFloat(v!); if (isFinite(a)) out.push(ROT(a)); }
    else if (styles) { const sm = /^(.+?)\/\.(style|append style)$/.exec(k); if (sm && v != null) styles.set(sm[1].trim(), (sm[2] === 'append style' ? (styles.get(sm[1].trim()) ?? '') + ',' : '') + unbrace(v)); }
  }
  return out;
}
interface Model { pre: string; head: string; env: string | null; items: Item[]; tail: string; post: string; whole: boolean; headDirty?: boolean }
function parse(src: any): Model {
  const text = String(src ?? '');
  const bm = /\\begin\s*\{tikzpicture\}/.exec(text), em = text.lastIndexOf('\\end{tikzpicture}');
  if (!bm || em < bm.index) { const b = parseBody(text); return { pre: '', head: '', env: null, items: b.items, tail: b.tail, post: '', whole: false }; }
  let j = bm.index + bm[0].length, env: string | null = null;
  const w = /^\s*/.exec(text.slice(j))![0];
  if (text[j + w.length] === '[') { const e = close(text, j + w.length); if (e > 0 && e < em) { env = text.slice(j + w.length + 1, e); j = e + 1; } }
  const b = parseBody(text.slice(j, em));
  return { pre: text.slice(0, bm.index), head: text.slice(bm.index, j), env, items: b.items, tail: b.tail, post: text.slice(em), whole: true };
}

// ---------------------------------------------------------------- writing it
// a value braced when it has a comma, an equals sign or brackets of its own
const wrapV = (v: string) => (/[,=[\]]/.test(v) && !(/^\{[\s\S]*\}$/.test(v) && close(v, 0) === v.length - 1) ? `{${v}}` : v);
const optsText = (ops: Opt[]) => ops.map(({ k, v }) => (v == null ? k : `${k}=${wrapV(v)}`)).join(', ');
const pt = (p: number[]) => `(${num(p[0])},${num(p[1])})`;
function itemText(it: Item, ind: string): string {
  if (!it.dirty) return it.raw;
  const head = (o: string | null) => { const so = withShift(o, it.at || [0, 0]); return `\\begin{scope}${so.length ? `[${so.join(', ')}]` : ''}`; };
  if (it.k === 'app') {
    const call = `\\${it.cmd}${it.ops.length ? `[${optsText(it.ops)}]` : ''}${it.arg != null ? `{${it.arg}}` : ''}`, at = it.at || [0, 0];
    // in its own scope: the scope's text kept round the call; a call that moves or is scaled gets a scope of its own
    // (so). A scope left with nothing once the editor took its scale out goes, unless it holds a call whose settings
    // would otherwise carry on to the next (ACC)
    if (it.sc) {
      if (it.sc.unwrap && !withShift(it.sc.o, at).length && !ACC.has(it.cmd) && !it.sc.inner.replace(it.sc.call, '').trim()) return call;
      return `${head(it.sc.o)}${it.sc.inner.replace(it.sc.call, () => call)}\\end{scope}`;
    }
    if (!(at[0] || at[1]) && !it.so) return call;
    return `${head(it.so || null)}\n${ind}  ${call}\n${ind}\\end{scope}`;
  }
  if (it.k === 'scope') return `${head(it.o)}${it.inner}\\end{scope}`;
  if (it.k === 'label') return `\\node${it.o ? `[${it.o}]` : ''} at ${pt(it.at)} {${it.t}};`;
  if (it.k === 'line') return `\\draw${it.o ? `[${it.o}]` : ''} ${it.pts.map(pt).join(' -- ')};`;
  if (it.k === 'set') return `\\chemlabset{${it.o}}`;
  return it.raw;
}
const indentOf = (lead: string) => /[ \t]*$/.exec(lead)![0];
function write(M: Model): string {
  const body = M.items.map((it) => it.lead + itemText(it, indentOf(it.lead))).join('') + M.tail;
  if (!M.whole) return body;
  const head = M.env != null && M.env.trim() ? `\\begin{tikzpicture}[${M.env}]` : '\\begin{tikzpicture}';
  return M.pre + (M.headDirty ? head : M.head) + body + M.post;
}
const fullCode = (src: any) => { const t = String(src ?? '').trim(); return /\\begin\{tikzpicture\}/.test(t) ? t : `\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`; };

// ---------------------------------------------------------------- running it
function run(g: G, items: Item[], top: boolean) {
  items.forEach((it, i) => {
    if (top) { g.item = i; g.seed = 1 + i * 7919; }
    try { exec(g, it); } catch (e: any) { g.warn(msg('chemlab.warn.failed', 'This line could not be drawn: {error}', { error: String(e?.message || e) })); }
  });
}
function exec(g: G, it: Item) {
  if (it.k === 'app') {
    const mac = MACROS[it.cmd];
    if (!mac) { g.warn(msg('chemlab.warn.command', '\\{name}: not a tikz-chemlab command', { name: it.cmd })); return; }
    if (!mac[1] && it.o != null && !SUBST[it.cmd]) g.warn(msg('chemlab.warn.noOptions', '\\{name} takes no options', { name: it.cmd }));
    const call = () => { if (top0(g, it)) g.origins[g.item] = ACC.has(it.cmd) ? mul(g.st.m, SHIFT(g.st.acc, 0)) : g.st.m.slice(); mac[0](g, it.ops, it); };
    if (it.sc) g.scope({ tf: transforms(it.sc.o, g.st.styles) }, call); else call();
  } else if (it.k === 'scope') g.scope({ tf: transforms(it.o, g.st.styles) }, () => { if (g.origins[g.item] == null) g.origins[g.item] = g.st.m.slice(); run(g, it.body, false); });
  else if (it.k === 'set') setKeys(g, opts(it.o));
  else if (it.k === 'tikzset') transforms(it.o, g.st.styles);
  else if (it.k === 'label') {
    const o = split(it.o || ''), q = o.map(kv), fill = q.find((x) => x.k === 'fill'), col = q.find((x) => x.k === 'text' || x.k === 'color');
    const bare = o.find((x) => !/=/.test(x) && colour(x));
    // where the node sits: anchor=…, a placement (right, above left …: the opposite anchor, and a distance that moves
    // it that way), xshift and yshift; a distance without a unit is in pt, as TikZ reads it
    let anchor = 'center', dx = 0, dy = 0;
    for (const { k, v } of q) {
      const d = v == null ? 0 : lenCm(unbrace(v));
      if (k === 'anchor' && v) anchor = unbrace(v).trim();
      else if (PLACE[k]) { anchor = PLACE[k]; if (isFinite(d)) { dx += /right/.test(k) ? d : /left/.test(k) ? -d : 0; dy += /above/.test(k) ? d : /below/.test(k) ? -d : 0; } }
      else if (k === 'xshift' && isFinite(d)) dx += d;
      else if (k === 'yshift' && isFinite(d)) dy += d;
    }
    g.origins[g.item] = mul(g.st.m, SHIFT(it.at[0], it.at[1]));
    g.node(it.t, it.at[0] + dx, it.at[1] + dy, { anchor, fill: fill?.v || undefined, color: col?.v || bare || undefined });
  } else if (it.k === 'line') {
    const o = split(it.o || ''), q = o.map(kv), tips = arrowsOf(o), col = q.find((x) => x.k === 'color' || x.k === 'draw')?.v || o.find((x) => !/[=>-]/.test(x) && colour(x));
    const lw = q.find((x) => x.k === 'line width')?.v ?? o.find((x) => WIDTHS[x] != null);
    g.origins[g.item] = mul(g.st.m, SHIFT(it.pts[0][0], it.pts[0][1]));
    g.draw(path().poly(it.pts), { tips, color: col ? colour(col) : undefined, lw: lw != null ? widthPt(lw) : undefined, dash: o.includes('dashed') ? [3, 3] : o.includes('dotted') ? [0.4, 2] : undefined });
  } else if (it.k === 'bbox') g.useBox(it.a[0], it.a[1], it.b[0], it.b[1]);
  else if (it.k === 'raw') { const code = it.raw.trim().replace(/\s+/g, ' '); g.warn(msg('chemlab.warn.raw', 'Kept in the code but not drawn here: {code}', { code: code.length > 48 ? code.slice(0, 47) + '…' : code })); }
}
const top0 = (g: G, _it: Item) => g.origins[g.item] == null;
// the commands drawn at the sideways offset the ones before them left (\\chemlab@xshift)
const ACC = new Set(['tkzTitration', 'tkzHeatFlask', 'tkzRoundFlask']);
// the tips an option list asks for: ->, <-, <->, -{Stealth}, -Latex …
function arrowsOf(o: string[]): [string, string] {
  const spec = o.find((x) => /^[^=]*-[^=]*$/.test(x) && /[<>]|Stealth|Latex|To\b|stealth|latex/.test(x) && !/^(dashed|dotted)$/.test(x));
  if (!spec) return ['', ''];
  const [a, b] = spec.split(/-(?![^{]*\})/), kind = (t: string, rev: boolean) => {
    const u = unbrace(t || '').trim();
    if (!u) return '';
    if (/Stealth|stealth/.test(u)) return 'stealth';
    if (/Latex|latex/.test(u)) return 'latex';
    if (rev ? /</.test(u) : />/.test(u) || /To/.test(u)) return 'to';
    return '';
  };
  return [kind(a, true), kind(b ?? '', false)];
}
interface Layout {
  M: Model; svg: string; texts: any[]; bb: { x: number; y: number; w: number; h: number }; boxes: (Box | null)[]; origins: (Mx | null)[]; pm: Mx;
  /** the item's draggable levels (see G.level) */
  levels: Lv[][];
  warnings: { i: number; key: string; msg: Message }[]; empty: boolean;
}
// the picture's own transformation (its options: scale, x=…, shift) and styles
function pictureOf(M: Model) {
  const styles = new Map<string, string>();
  const tf = transforms(M.env, styles);
  let m: Mx = [1, 0, 0, 1, 0, 0];
  for (const t of tf) m = mul(m, t);
  return { m, styles };
}
function build(src: any): Layout {
  const M = parse(src), { m, styles } = pictureOf(M), g = new G(m, styles);
  run(g, M.items, true);
  const flat = (xs: any[]): string => xs.map((x) => (typeof x === 'string' ? x : x.clip ? `<g clip-path="url(#${x.clip})">${flat(x.kids)}</g>` : `\u0000T${texts.push(x) - 1}\u0000`)).join('');
  const texts: any[] = [];
  const svg = flat(g.st.out);
  const has = isFinite(g.bb.x1);
  const bb = has ? { x: g.bb.x1, y: g.bb.y1, w: g.bb.x2 - g.bb.x1, h: g.bb.y2 - g.bb.y1 } : { x: -2 * PX, y: -2 * PX, w: 4 * PX, h: 2 * PX };
  return {
    M, svg: (g.defs.length ? `<defs>${g.defs.join('')}</defs>` : '') + svg, texts, bb, pm: m,
    boxes: M.items.map((_x, i) => (g.boxes[i] && isFinite(g.boxes[i].x1) ? g.boxes[i] : null)), origins: M.items.map((_x, i) => g.origins[i] || null),
    levels: M.items.map((_x, i) => g.levels[i] || []),
    warnings: g.warnings, empty: !has,
  };
}
const layout = layoutCache<any, Layout>((s: any) => String(s.src ?? ''), (s: any) => build(String(s.src ?? '')));

// ---------------------------------------------------------------- drawing it
let drawn = 0;
/** the picture's markup in px, its origin at (0,0) (y down); ids made unique for this drawing */
function markup(L: Layout, ctx: any, pre = `cl${++drawn}_`) {
  return L.svg.replace(/cl@/g, pre).replace(/\u0000T(\d+)\u0000/g, (_m, i) => { const t = L.texts[+i]; return TD.textSvg(t.text, { size: t.size, font: 'default' }, t.color, t.x, t.y, ctx); });
}
function draw(s: any, ctx: any) {
  const L = layout(s), bb = L.bb;
  let out = '';
  if (L.empty) {
    const ink = TD.css('#000000');
    out += `<rect x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}" fill="none" stroke="${ink}" stroke-width="0.6" stroke-dasharray="4 3" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty lab picture', { size: 'small', font: 'default' }, '#888888', bb.x + bb.w / 2, bb.y + bb.h / 2, ctx);
  } else out += markup(L, ctx, `cl${String(s.id ?? '').replace(/\W/g, '') || ++drawn}_${ctx.export ? 'x' : 'c'}_`);
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

// ---------------------------------------------------------------- export and import
// the picture as a scope moved to where the drawing sits: the picture's options go with it, so its scale and styles hold
function exportScope(s: any, X: any) {
  const L = layout(s), b = L.bb, M = L.M;
  const body = (M.whole ? M.items.map((it) => it.lead + itemText(it, indentOf(it.lead))).join('') + M.tail : write(M)).replace(/^\s*\n/, '').replace(/\s+$/, '');
  const o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`, ...(M.env != null && M.env.trim() ? [M.env.trim()] : [])];
  return `\\begin{scope}[${o.join(', ')}]\n${body}\n\\end{scope}`;
}
// A whole tikzpicture that calls tikz-chemlab (as written in a document, or as exported here: one scope moved to where
// the block sat) → a Chemistry Laboratory block, or null.
const USES = /\\tkz(?:TestTube|HeatTube|RoundFlask|HeatFlask|Funnel|GraduatedCylinder|Pipette|LargePipette|Titration|Distillation|SeparatoryFunnel|Stand|Column|BunsenBurner|Thermometer|CrystallizingDish|HeaterRoundFlask)\b/;
function fromPicture(t: string) {
  t = String(t || '').trim();
  if (!USES.test(t.replace(/%[^\n]*/g, ''))) return null;
  const bm = /^\\begin\{tikzpicture\}\s*/.exec(t), end = t.lastIndexOf('\\end{tikzpicture}');
  if (!bm || end < 0) return null;
  let i = bm[0].length, env = '';
  if (t[i] === '[') { const e = close(t, i); if (e < 0) return null; env = split(t.slice(i + 1, e)).filter((o) => !/^(?:[xy]\s*=\s*1\s*cm|remember picture|overlay)$/.test(o)).join(', '); i = e + 1; }
  let body = t.slice(i, end), at: Pt | null = null;
  const sm = /^\s*\\begin\{scope\}\s*\[/.exec(body);
  if (sm) {
    const ob = sm[0].length - 1, oe = close(body, ob), se = oe > 0 ? scopeEnd(body, oe + 1) : null;
    if (se && !body.slice(se[1]).trim()) {
      const o = split(body.slice(ob + 1, oe)), sh = o.length ? kv(o[0]) : null, p = sh && sh.k === 'shift' && sh.v ? pair(sh.v) : null;
      if (p) { at = p; if (o.length > 1) env = [env, ...o.slice(1)].filter(Boolean).join(', '); body = body.slice(oe + 1, se[0]); }
    }
  }
  const lines = body.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length));
  const src = `\\begin{tikzpicture}${env ? `[${env}]` : ''}\n${lines.map((l) => (l.trim() ? '  ' + l.slice(isFinite(ind) ? ind : 0) : '')).join('\n')}\n\\end{tikzpicture}`;
  // written by hand (not one moved scope): a picture of apparatus, its labels and leader lines only; one with other
  // drawing in it is read as TikZ, its shifted scopes of apparatus each a block
  if (!at && parse(src).items.some((it) => it.k === 'raw')) return null;
  const s: any = { type: 'chemlab', x: 0, y: 0, src };
  const b = layout(s).bb;
  s.x = (at ? at[0] * PX : 0) + b.x; s.y = (at ? -at[1] * PX : 0) + b.y;
  return s;
}

TD.TYPES.chemlab = {
  name: 'Chemistry lab apparatus',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'chemlab', x: p.x, y: p.y, src: TD.CHEMLAB_DEFAULT }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  tikz(s: any, X: any) { X.pkgs.add('tikz-chemlab'); return exportScope(s, X); },
};

// ---------------------------------------------------------------- for the editor and the panel
// the commands the palette offers, with the keys each one reads (the editor's settings follow them)
const CMDS: Record<string, { keys: string[]; fit?: string[] }> = {
  tkzTestTube: { keys: ['glassType', 'liquids3', 'tiltAngle', 'fit', 'clamp', 'label', 'substance', 'solid'], fit: ['stopper', 'straightTube', 'elbowTube', 'uTube'] },
  tkzRoundFlask: { keys: ['glassType', 'liquids3', 'tiltAngle', 'fit', 'label', 'substance', 'solid'], fit: ['stopper', 'straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'doubleTube', 'condenserBulbs'] },
  tkzHeatTube: { keys: ['glassType', 'liquids3', 'fit', 'clamp', 'label', 'substance', 'solid', 'bunsenBurner', 'bubbling', 'tubeOnly'], fit: ['stopper', 'straightTube', 'elbowTube', 'uTube'] },
  tkzHeatFlask: { keys: ['glassType', 'liquids1', 'fit', 'substance', 'solid', 'bunsenBurner', 'bubbling', 'gasCollection'], fit: ['stopper', 'straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'doubleTube'] },
  tkzFunnel: { keys: ['glassType', 'liquids3', 'tiltAngle', 'fit', 'clamp', 'label', 'substance', 'solid'], fit: ['stopper', 'straightTube', 'elbowTube', 'uTube'] },
  tkzGraduatedCylinder: { keys: ['liquids3', 'tiltAngle', 'substance'] },
  tkzPipette: { keys: ['reagentLevel', 'reagentColor'] },
  tkzLargePipette: { keys: ['reagentLevel', 'reagentColor'] },
  tkzTitration: { keys: ['glassTypeTitration', 'liquids1', 'substance', 'solid', 'burette', 'buretteLevel', 'buretteColor', 'buretteReagent', 'beakerReagent', 'pHMeter', 'magneticStirrer'] },
  tkzDistillation: { keys: ['MixtureStyle', 'DistillateColor'] },
  tkzSeparatoryFunnel: { keys: ['sep', 'stopper', 'TapOpen'] },
  tkzStand: { keys: [] }, tkzColumn: { keys: [] }, tkzBunsenBurner: { keys: [] }, tkzThermometer: { keys: [] }, tkzCrystallizingDish: { keys: [] }, tkzHeaterRoundFlask: { keys: [] },
};
/** a key's default, as the package resets it for each call */
const DEFAULT: Record<string, string | boolean> = (() => { const d = defaults(); const o: any = {}; for (const k of [...BOOL, ...STORE]) if (k in d) o[k] = d[k]; o.glassType = 'tube'; return o; })();
/** a palette drawing: the call drawn alone, fitted to its own box (`id`: what makes its ids its own) */
// a palette drawing, framed by what it inks: the package's bounding boxes (a 4 cm square round every test tube) would
// leave a narrow piece of glassware small in the middle of its tile
// a small picture of one call. hair: a stroke thinner than this (px) is drawn as a 0.75px hairline whatever the
// picture is shrunk to, so 0.4pt lines (\tkzHeater, \tkzCondenser …) still show on a palette tile; a pattern's own lines
// are left as they are
function mini(call: string, id = 'm', hair = 0) {
  const L = build(`\\begin{tikzpicture}\n${call}\n\\end{tikzpicture}`), ink = nobox();
  for (const k of L.boxes) if (k && isFinite(k.x1)) { grow(ink, k.x1, k.y1); grow(ink, k.x2, k.y2); }
  const pad = 1, b = isFinite(ink.x1) ? { x: ink.x1 - pad, y: ink.y1 - pad, w: ink.x2 - ink.x1 + 2 * pad, h: ink.y2 - ink.y1 + 2 * pad } : L.bb;
  let svg = markup(L, { export: true }, `clm${id}_`);
  if (hair > 0) svg = svg.replace(/<pattern\b[\s\S]*?<\/pattern>|stroke-width="([\d.]+)"(?! vector-effect)/g, (m, w) => (w != null && +w < hair ? 'stroke-width="0.75" vector-effect="non-scaling-stroke"' : m));
  return `<svg viewBox="${r2(b.x)} ${r2(b.y)} ${r2(b.w)} ${r2(b.h)}" aria-hidden="true">${svg}</svg>`;
}
/** one item read from its text (a call, a scope, a label …) */
const item = (text: string): Item | null => parse(text).items[0] || null;
/** the line (from 1) item i starts on in the code */
function lineOf(M: Model, i: number) {
  let t = M.whole ? M.pre + M.head : '';
  for (let k = 0; k < i && k < M.items.length; k++) t += M.items[k].lead + M.items[k].raw;
  if (M.items[i]) t += M.items[i].lead;
  return t.split('\n').length;
}
const count = (L: Layout) => L.M.items.filter((x) => x.k === 'app' || (x.k === 'scope' && x.body.some((y: Item) => y.k === 'app'))).length;
TD.chemlab = {
  parse, write, layout, draw, markup, fullCode, fromPicture, mini, count, item, lineOf, shiftOf, scaleIn, withScale, ACC, LINE_STYLES, int, n0, colour, styleOf, substanceOf, split, kv, unbrace, num, opts, optsText, close, pair,
  inv, ap, mul, widthPt, LAB_WIDTHS, CMDS, MACROS, SUBST, GLASS, LIQUIDS, LAB_COLOURS, STYLES, DEFAULT, BOOL, PX, USES,
};
TD.blocks.register('chemlab', {
  menu: { order: 12.2, group: 'chemistry', label: 'Chemistry Laboratory', title: 'Chemistry lab apparatus: glassware, burners, titrations and distillations, written for tikz-chemlab', icon: '<svg viewBox="0 0 32 24"><path d="M5 3v14a3 3 0 0 0 6 0V3M4 3h8"/><path d="M5 11h6"/><path d="M20 3v6l-5 10.5a1.2 1.2 0 0 0 1 1.5h12a1.2 1.2 0 0 0 1-1.5L24 9V3M19 3h6"/><path d="M17.2 15.5h9.6"/></svg>' },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.chemlabEditor, alias: 'chemlabOpen', layout: (s: any) => TD.chemlab.layout(s) },
  // a bare call pasted on its own (\tkzTestTube[…]) comes in as a lab picture of its own:
  // every macro the package draws (not tkz-euclide's \tkzDraw…, which shares the prefix)
  nodeImport: { re: new RegExp(`^\\\\(?:(?:${Object.keys(MACROS).join('|')})\\b|chemlabset\\b)[\\s\\S]*`), order: 12.2, dedent: true,
    place: (q: any, at: any) => { q.src = fullCode(q.src); const b = layout(q).bb; q.x = at.x - b.w / 2; q.y = at.y - b.h / 2; } },
});
export { layout, fullCode, count };
