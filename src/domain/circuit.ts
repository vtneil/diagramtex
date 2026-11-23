import { crossingSections, isCrossing } from './circuit-crossings';
import { runtime as TD } from '../runtime';
import { unbraceOnce as unbrace } from './tex-groups';
// Circuit block: a schematic drawn with circuitikz parts (czcore.ts + czparts-*.ts) and exported as
// circuitikz code. The block holds a list of items in its own frame (cm, y up, origin at (s.x, s.y)):
//   bipole { id, part, a: [x, y], b: [x, y], l, ann, v, i, poles, name, opts }  → \draw (a) to[…] (b);
//   node   { id, part, p: [x, y], rot, flip, name, text, opts }               → \node[…] (name) at (p) {text};
// plus raw lines it could not read back (kept verbatim). A bipole's end that sits on a named node's pin
// is written as (Name.pin), so the wire meets the pin in LaTeX as it does here. `%` comments go with the statement
// they sit by: an item's cmt { pre: lines above it, post: the end of its line }, and raw lines keep their own.
// The circuit is edited in its own overlay editor (czeditor.ts), opened by double-clicking the block.
const CZ = TD.CZ;
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;
const RLEN = 1.4, NODE_R = 0.04 * RLEN;
const EPS = 1e-3;
const f = (n: any) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); }; // to the 1/8 cm grids exporters use
const same = (p: any, q: any) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
const uid = () => Math.random().toString(36).slice(2, 10);
// where a line's comment starts: the first % that is not \%
function commentAt(line: string) {
  for (let i = 0; i < line.length; i++) { if (line[i] === '\\') i++; else if (line[i] === '%') return i; }
  return -1;
}
const uncomment = (s: any) => String(s || '').split('\n').map((l) => { const i = commentAt(l); return i < 0 ? l : l.slice(0, i); }).join('\n');

// ---------------------------------------------------------------- geometry
// node frame: scale (sc [x, y], when it is not 1) and mirror (xscale=-1) first, then rotate counter-clockwise,
// then move to p
function nodeXf(it: any) {
  const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [sx, sy] = it.sc || [1, 1], fx = (it.flip ? -1 : 1) * sx;
  return (x: any, y: any) => { x *= fx; y *= sy; return [it.p[0] + x * c - y * s, it.p[1] + x * s + y * c]; };
}
// bipole frame: origin at the middle of a→b, x along the path, y to its left;
// circuitikz's `mirror` flips the part along the path (x), `invert` across it (y)
// (labels follow the path, not the flipped part: they use the plain frame)
function bipXf(it: any, plain?: any) {
  const dx = it.b[0] - it.a[0], dy = it.b[1] - it.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const mx = (it.a[0] + it.b[0]) / 2, my = (it.a[1] + it.b[1]) / 2;
  const o = plain ? [] : (it.opts || '').split(',').map((t: any) => t.trim()), fx = o.includes('mirror') ? -1 : 1, fy = o.includes('invert') ? -1 : 1;
  return (x: any, y: any) => { x *= fx; y *= fy; return [mx + x * ux - y * uy, my + x * uy + y * ux]; };
}
const xfOf = (it: any) => (it.p ? nodeXf(it) : bipXf(it));
const isWire = (it: any) => it.part === 'short';
// every connection point of an item, in the block frame: { name: [x, y] }
function pinsOf(it: any) {
  const def = CZ.parts[it.part];
  const out: Record<string, any> = {};
  if (it.p) { const T = nodeXf(it); for (const [n, q] of Object.entries<any>((def && def.pins) || { center: [0, 0] })) out[n] = T(q[0], q[1]); return out; }
  out.start = it.a.slice(); out.end = it.b.slice();
  if (def) { const T = bipXf(it); for (const [n, q] of Object.entries<any>(def.pins)) out[n] = T(q[0], q[1]); }
  return out;
}

// ---------------------------------------------------------------- drawing
// SVG of the items through m (block cm → screen px); k = px per cm; o: { color, paper, sel: Set of ids, ctx, st }
function itemsSvg(items: any, m: any, k: any, o: Record<string, any> = {}) {
  const col = o.color || '#000', paper = o.paper || '#fff';
  const wW = 0.4 / K / PX * k, bW = 2 * wW; // wires 0.4pt, component bodies twice that (circuitikz thickness 2)
  let out = '';
  for (const it of [...items.filter((it: any) => !isCrossing(it)), ...items.filter(isCrossing)]) {
    const def = CZ.parts[it.part], ic = colorOf(it), c = o.colorOf ? o.colorOf(it, ic) : ic ? TD.css(ic) : col;
    let s = '';
    if (it.p) {
      if (!def) { const [X, Y] = m(it.p[0], it.p[1]); s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(0.15 * k)}" fill="none" stroke="${c}" stroke-dasharray="2 2"/>`; }
      else { const T = nodeXf(it); s += CZ.svg(CZ.geom(it.part), (x: any, y: any) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k }); }
    } else {
      const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]), w = def ? Math.min(def.w || 0, L) : 0;
      const T = bipXf(it), [ax, ay] = m(...it.a), [bx, by] = m(...it.b);
      // an open circuit draws nothing; in the editor (o.wrap) a faint dashed line keeps it findable
      if (it.part === 'open') { if (o.wrap) s += `<path d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-opacity=".35" stroke-width="${r2(wW)}" stroke-dasharray="3 3" fill="none"/>`; }
      else if (isWire(it)) {
        const d = crossingSections(it, items).map(([a, b]) => { const [ax, ay] = m(...a), [bx, by] = m(...b); return `M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}`; }).join('');
        s += `<path d="${d}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"/>`;
      }
      else if (!def || w <= 0) s += `<path d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"${def ? '' : ' stroke-dasharray="3 3"'}/>`;
      else {
        const [p1x, p1y] = m(...T(-w / 2, 0)), [p2x, p2y] = m(...T(w / 2, 0));
        s += `<path d="M${r2(ax)},${r2(ay)}L${r2(p1x)},${r2(p1y)}M${r2(p2x)},${r2(p2y)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"/>`;
        s += CZ.svg(CZ.geom(it.part), (x: any, y: any) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k });
      }
      // poles: * filled, o open
      const pm = /^([*o]?)-([*o]?)$/.exec(it.poles || '');
      if (pm) [[pm[1], ax, ay], [pm[2], bx, by]].forEach(([t, X, Y]) => {
        if (t) s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(NODE_R * k)}" fill="${t === '*' ? c : paper}" stroke="${c}" stroke-width="${r2(wW)}"/>`;
      });
    }
    s += labelsSvg(it, m, k, c, o);
    out += o.wrap ? o.wrap(it, s) : s;
  }
  return out;
}
// what the free options say about labels and style: { l_, a_, v: {mods, t}, i: {mods, t}, vstyle, color }
// (`v^= i<_=` … are exported as written; plain `v= i=` live in the item's own fields)
const VSTYLE: Record<string, any> = { american: 'american', european: 'european', straight: 'straight', raised: 'raised', curved: 'european' };
function optsOf(it: any) {
  const out: Record<string, any> = {};
  for (const x of splitTop(it.opts || '', ',')) {
    const t = x.trim();
    let m = /^(l|a)_\s*=\s*([\s\S]*)$/.exec(t);
    if (m) { out[m[1] + '_'] = unbrace(m[2]); continue; }
    m = /^(v|i)([_^<>]{1,3})\s*=\s*([\s\S]*)$/.exec(t);
    if (m) { out[m[1]] = { mods: m[2], t: unbrace(m[3]) }; continue; }
    m = /^(american|european|straight|raised)\s+voltages$/.exec(norm(t));
    if (m) { out.vstyle = m[1]; continue; }
    m = /^(?:color|draw)\s*=\s*([\s\S]+)$/.exec(t);
    const c = TD.tikzColor && (m ? TD.tikzColor(unbrace(m[1])) : !/[=\s]/.test(t) && TD.tikzColor(t));
    if (c) out.color = c;
  }
  return out;
}
// the circuit-wide voltage style a `\ctikzset{voltage=…}` (or `\tikzset{… voltages}`) line in the code sets
function vstyleOf(raw: any) {
  let v = 'european';
  for (const m of uncomment(raw).matchAll(/voltage\s*=\s*(american|european|straight|raised|curved)\b|\b(american|european|straight|raised)\s+voltages\b/g)) v = VSTYLE[m[1] || m[2]];
  return v;
}
const colorOf = (it: any) => optsOf(it).color || null;
// sources: 'v' (a voltage source), 'i' (a current source) or ''
const srcKind = (part: any) => (!/^src:/.test(part) || /nullator|norator/.test(part) ? '' : /^src:c?isource/.test(part) ? 'i' : 'v');
// circuitikz's defaults (no `oldvoltagedirection`): a part's voltage below and forward, a voltage source's above,
// a current source's backward; `^ _` pick the side, `> <` the direction
function voltOf(it: any, ox: any) {
  const o = ox.v || (it.v ? { mods: it.vm || '', t: it.v } : null);
  if (!o) return null;
  const k = srcKind(it.part), md = o.mods;
  return { t: o.t, s: md.includes('^') ? 1 : md.includes('_') ? -1 : k === 'v' ? 1 : -1, back: md.includes('<') ? true : md.includes('>') ? false : k === 'i', gen: k === 'v' };
}
// currents: forward after the part above the wire; on a voltage source backward and before it.
// `i<` is backward and before; with a side too, the order says where: `i>_` before, `i_>` after
function currOf(it: any, ox: any) {
  const o = ox.i || (it.i ? { mods: it.im || '', t: it.i } : null);
  if (!o) return null;
  const vs = srcKind(it.part) === 'v', md = o.mods, pi = md.search(/[_^]/), di = md.search(/[<>]/);
  let back = vs, before = vs;
  if (di >= 0) { back = md[di] === '<'; before = pi < 0 ? back : di < pi; }
  return { t: o.t, s: md[pi] === '_' ? -1 : 1, back, before };
}
// the mods (`^ _ < >`) that put a voltage or current mark on a side (1: left of the path, ^) and way (back: <);
// a current's arrow sits before the part when it points back, as `i<=` puts it
function markMods(kind: 'v' | 'i', s: number, back: boolean) {
  const side = s > 0 ? '^' : '_';
  return kind === 'v' ? side + (back ? '<' : '>') : back ? '<' + side : side + '>';
}
// circuitikz's voltage arc (european style): both ends sit 0.112 cm beside the part's pins, the controls come
// from the part's -110/-70 degree anchors scaled by `bump b` 1.5. Frame: x along the path, y to its left.
const VSHIFT = 0.112, BUMP = 1.5, LABEL_UP = 0.13, NODE_TXT = 0.1;
// a TeX label anchored at distance d from the path (north below it, south above) has its canvas box edge at
// d − 0.096 below and d + 0.039 above (the canvas text box is taller than TeX's); a voltage label (inner sep
// 2pt) above the path at d − 0.09. Measured against pdflatex at normalsize.
const TEX_BELOW = 0.096, TEX_ABOVE = 0.039, TEX_ABOVE_V = -0.09;
function voltageArc(it: any, def: any, G: any) {
  const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) || 1, w = Math.min(def.w || 0, L);
  const hy = G ? Math.max(G.box.y2, -G.box.y1) : 0.2, Ay = srcKind(it.part) ? 1.1 * hy : Math.max(hy, 0.325);
  const ah = /^res:/.test(it.part) ? 0.77 : w / 2, xs = -L / 2 + (0.0875 + (L / 2 - ah)) / 2, cy = -(BUMP * Ay + VSHIFT), cx = BUMP * 0.364 * Ay;
  // where circuitikz anchors the label (north of it): a resistor's anchors sit lower than its curve's controls
  const lab = /^res:/.test(it.part) ? BUMP * 0.308 + VSHIFT : -cy;
  return { p0: [xs, -VSHIFT], c1: [-cx, cy], c2: [cx, cy], p3: [-xs, -VSHIFT], xs, hy, lab };
}
// what a node's text shows: exporters wrap it in \rotatebox{…} and \ctikzflipx/y/xy{…} to undo the node's own turn
// and mirror, so it reads upright, as the canvas draws it anyway
function shown(t: string) {
  for (;;) {
    const s = t.trim(), m = /^\\(?:rotatebox\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}|ctikzflip(?:xy|x|y))\s*\{/.exec(s);
    if (!m || closeAt(s, m[0].length - 1) !== s.length - 1) return t;
    t = s.slice(m[0].length, -1);
  }
}
// a TikZ length in cm: `2`, `2cm`, `3pt`, `1.5mm`, `.5in`
const UNIT: Record<string, number> = { cm: 1, mm: 0.1, pt: 2.54 / 72.27, bp: 2.54 / 72, in: 2.54, em: 0.35, ex: 0.16 };
const NUM = '(-?(?:\\d+\\.?\\d*|\\.\\d+))\\s*(cm|mm|pt|bp|in|em|ex)?';
const dim = (v: string, u?: string) => +v * UNIT[u || 'cm'];
const r6 = (v: number) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
// where a text node's options put its text from its point: [dx, dy] (the side, each -1, 0 or 1) and a shift [sx, sy]
function textDir(opts: string) {
  let dx = 0, dy = 0, sx = 0, sy = 0, m;
  for (const x of splitTop(opts || '', ',')) {
    const k = norm(x);
    if ((m = /^anchor\s*=\s*(.+)$/.exec(k))) { dx = /west/.test(m[1]) ? 1 : /east/.test(m[1]) ? -1 : 0; dy = /south/.test(m[1]) ? 1 : /north/.test(m[1]) ? -1 : 0; }
    else if ((m = new RegExp(`^(x|y)shift\\s*=\\s*${NUM}$`).exec(k))) { if (m[1] === 'x') sx += dim(m[2], m[3]); else sy += dim(m[2], m[3]); }
    else if ((m = /^(above|below)?\s*(left|right)?(?:\s*=.*)?$/.exec(k)) && (m[1] || m[2])) { dy = m[1] === 'above' ? 1 : m[1] === 'below' ? -1 : 0; dx = m[2] === 'left' ? -1 : m[2] === 'right' ? 1 : 0; }
  }
  return [dx, dy, sx, sy];
}
// where the labels go: l (and i) on the left of the path, a and v on the right; node text at its centre.
// Spots: { t, at, dir } plus arc (a curved arrow), line (a straight one) or arrow (the current's, on the wire)
function labelSpots(it: any, st: any) {
  const def = CZ.parts[it.part], G = def && CZ.geom(it.part);
  const spots: any[] = [];
  if (it.p) {
    if (!it.text) return spots;
    if (it.part === 'text') { const d = textDir(it.opts); spots.push({ t: shown(it.text), at: [it.p[0] + d[0] * NODE_TXT + d[2], it.p[1] + d[1] * NODE_TXT + d[3]], dir: [d[0], d[1]] }); return spots; }
    // circuitikz: the text of a ground symbol sits above its pin, a supply's beyond its arrow, a transistor's to the side
    const t = shown(it.text), T = nodeXf(it), up = (sgn: any, x: any, y: any) => { const a = T(0, 0), b = T(0, sgn); return { t, at: T(x, y), dir: [b[0] - a[0], b[1] - a[1]] }; };
    if (it.part === 'ground:vcc') spots.push(up(1, 0, 0.42 + NODE_TXT));
    else if (it.part === 'ground:vee') spots.push(up(-1, 0, -0.42 - NODE_TXT));
    else if (/^ground:/.test(it.part)) spots.push(up(1, 0.26, -0.16)); // a ground's text hangs off the pin's upper right
    else if (/^trans:/.test(it.part)) spots.push({ t, at: T(/mos|fet/.test(it.part) ? 0.36 : 0.45, 0), dir: [0, 0] });
    else spots.push({ t, at: it.p, dir: [0, 0] });
    return spots;
  }
  const T = bipXf(it, true), hy = G ? Math.max(G.box.y2, -G.box.y1, 0.05) : 0.05;
  const dx = it.b[0] - it.a[0], dy = it.b[1] - it.a[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L], mn = [-n[0], -n[1]];
  const ox = optsOf(it), LD = 0.12 - LABEL_UP, LB = 0.12;
  const top = [], bot = [];
  if (it.l) top.push(it.l);
  if ((ox as Record<string, any>)['a_']) bot.push((ox as Record<string, any>)['a_']); // circuitikz puts `a_` below too
  if (it.ann) bot.push(it.ann);
  if ((ox as Record<string, any>)['l_']) bot.push((ox as Record<string, any>)['l_']);
  top.forEach((t) => spots.push({ t, at: T(0, hy + LD), dir: n }));
  bot.forEach((t) => spots.push({ t, at: T(0, -hy - LB), dir: mn }));
  // a label anchored by TeX at distance d on side s, and one centred at (x, y)
  // (the offsets were fitted on level paths, where the box is pushed up or down; pushed sideways it is as below)
  const vy = Math.abs(n[1]), vx = 1 - vy;
  const side = (t: any, x: any, d: any, s: any) => ({ t, at: T(x, s > 0 ? d + vy * TEX_ABOVE_V - vx * TEX_BELOW : -(d - TEX_BELOW)), dir: s > 0 ? n : mn });
  const mid = (t: any, x: any, y: any) => ({ t, at: T(x, y), dir: [0, 0] });
  const V = def && voltOf(it, ox);
  if (V) {
    const sty = ox.vstyle || (st && st.vstyle) || 'european', am = sty === 'american' || sty === 'raised', s = V.s;
    const sign = (from: any, to: any, y: any) => { const [p, q] = V.back ? [to, from] : [from, to]; spots.push(mid('$+$', p, y), mid('$-$', q, y)); };
    if (V.gen) {
      // a voltage source: a straight arrow (or + and −) between its 120° and 60° anchors scaled by `bump a` 1.2
      const ex = 0.762 * hy, ey = 1.32 * hy;
      if (am && !/^src:c?vsource-us$/.test(it.part)) sign(-ex, ex, s * ey); // an American source already has its signs
      const L0: any = side(V.t, 0, 1.52 * hy + (s < 0 ? 0.08 : 0), s);
      if (!am) L0.line = V.back ? [[ex, s * ey], [-ex, s * ey]] : [[-ex, s * ey], [ex, s * ey]];
      spots.push(L0);
    } else {
      const A = voltageArc(it, def, G), xs = A.xs, hb = 1.1 * A.hy + VSHIFT;
      if (sty === 'european') {
        const y = (q: any) => [q[0], q[1] * -s], arc = V.back ? { p0: y(A.p3), c1: y(A.c2), c2: y(A.c1), p3: y(A.p0) } : { p0: y(A.p0), c1: y(A.c1), c2: y(A.c2), p3: y(A.p3) };
        spots.push({ ...side(V.t, 0, A.lab, s), arc });
      } else if (sty === 'straight') {
        const Ls: any = side(V.t, 0, hb, s);
        Ls.line = V.back ? [[-xs, s * hb], [xs, s * hb]] : [[xs, s * hb], [-xs, s * hb]];
        spots.push(Ls);
      } else if (sty === 'american') {
        sign(xs, -xs, s * 0.255 + 0.013); // a + glyph sits a little below its canvas box's middle
        spots.push(side(V.t, 0, hb, s));
      } else { // raised: signs and label on one line beyond the part
        const y = s * (hb + 0.24);
        sign(xs, -xs, y);
        spots.push(mid(V.t, 0, y));
      }
    }
  }
  const C = def && currOf(it, ox);
  if (C) {
    const w = Math.min(def.w || 0, L), x = ((L + w) / 4) * (C.before ? -1 : 1);
    // the box edge sits just past the wire: the canvas box is roomier than TeX's around the glyph
    spots.push({ t: C.t, at: T(x, C.s * (vx * 0.12) + vy * (C.s > 0 ? -0.02 : -0.03)), dir: C.s > 0 ? n : mn, arrow: { x, back: C.back } });
  }
  return spots;
}
// a `latexslim`-like head with its tip at (X, Y) pointing along (ux, uy); k = px per cm
const arrowHead = (X: any, Y: any, ux: any, uy: any, c: any, k: any) => {
  const hl = 0.2 * k, hw = 0.075 * k, bx = X - ux * hl, by = Y - uy * hl, nx = -uy, ny = ux;
  return `<path d="M${r2(X)},${r2(Y)}L${r2(bx + nx * hw)},${r2(by + ny * hw)}L${r2(X - ux * hl * 0.72)},${r2(Y - uy * hl * 0.72)}L${r2(bx - nx * hw)},${r2(by - ny * hw)}Z" fill="${c}"/>`;
};
function labelsSvg(it: any, m: any, k: any, c: any, o: any) {
  let s = '';
  const st = o.st || { size: 'normalsize', font: 'default' }, zoom = k / PX, wW = 0.4 / K / PX * k;
  for (const L of labelSpots(it, st)) {
    const b = TD.textBox(L.t, st), bw = b.w / PX, bh = b.h / PX; // text keeps its size in cm
    // push the box out along dir so its nearest edge sits at the spot
    const ox = L.dir[0] * (bw / 2), oy = L.dir[1] * (bh / 2);
    const [X, Y] = m(L.at[0] + ox, L.at[1] + oy);
    if (zoom === 1) s += TD.textSvg(L.t, st, c, X, Y, o.ctx || {});
    else s += `<g transform="translate(${r2(X)},${r2(Y)}) scale(${r2(zoom)})">${TD.textSvg(L.t, st, c, 0, 0, o.ctx || {})}</g>`;
    // the voltage and current marks follow a two-terminal part's path: a node part (a ground, a label) has none
    const T = it.b ? bipXf(it, true) : (x: any, y: any) => [x, y];
    if (L.arc) {
      const P = ['p0', 'c1', 'c2', 'p3'].map((n) => m(...T(...(L.arc[n] as [any, any]))));
      const tx = P[3][0] - P[2][0], ty = P[3][1] - P[2][1], tl = Math.hypot(tx, ty) || 1;
      s += `<path d="M${r2(P[0][0])},${r2(P[0][1])}C${r2(P[1][0])},${r2(P[1][1])} ${r2(P[2][0])},${r2(P[2][1])} ${r2(P[3][0])},${r2(P[3][1])}" fill="none" stroke="${c}" stroke-width="${r2(wW)}"/>`;
      s += arrowHead(P[3][0], P[3][1], tx / tl, ty / tl, c, k);
    }
    if (L.line) {
      const [P, Q] = L.line.map((q: any) => m(...T(...(q as [any, any])))), tx = Q[0] - P[0], ty = Q[1] - P[1], tl = Math.hypot(tx, ty) || 1;
      s += `<path d="M${r2(P[0])},${r2(P[1])}L${r2(Q[0])},${r2(Q[1])}" fill="none" stroke="${c}" stroke-width="${r2(wW)}"/>`;
      s += arrowHead(Q[0], Q[1], tx / tl, ty / tl, c, k);
    }
    if (L.arrow) {
      // the current's arrow sits on the wire, centred at x along the path
      const [wx, wy] = m(...T(L.arrow.x, 0)), [ex, ey] = m(...T(L.arrow.x + (L.arrow.back ? -1 : 1), 0)), l = Math.hypot(ex - wx, ey - wy) || 1;
      const u = [(ex - wx) / l, (ey - wy) / l], hl = 0.2 * k;
      s += arrowHead(wx + u[0] * hl / 2, wy + u[1] * hl / 2, u[0], u[1], c, k);
    }
  }
  return s;
}
// bounding box of the items in the block frame (cm, y up): { x1, y1, x2, y2 }
function itemsBox(items: any, st: any) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const grow = (x: any, y: any) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const it of items) {
    const G = CZ.parts[it.part] && CZ.geom(it.part), T = xfOf(it);
    if (G) { const b = G.box; [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].forEach((q) => grow(...(T(...(q as [any, any])) as [any, any]))); }
    if (!it.p) { grow(...(it.a as [any, any])); grow(...(it.b as [any, any])); } else grow(...(it.p as [any, any]));
    for (const L of labelSpots(it, st)) {
      const b = TD.textBox(L.t, st || { size: 'normalsize', font: 'default' }), bw = b.w / PX, bh = b.h / PX;
      const cx = L.at[0] + L.dir[0] * bw / 2, cy = L.at[1] + L.dir[1] * bh / 2;
      grow(cx - bw / 2, cy - bh / 2); grow(cx + bw / 2, cy + bh / 2);
    }
  }
  if (!isFinite(x1)) return null;
  return { x1, y1, x2, y2 };
}

// ---------------------------------------------------------------- circuitikz code
const brace = (t: any) => (/[,=\]]/.test(t) ? `{${t}}` : t);
// names of every named item's pins: Map "x,y" → "Name.pin" (nodes first: their pins win)
function pinRefs(items: any) {
  const refs = [];
  for (const it of items) {
    if (!it.name) continue;
    const def = CZ.parts[it.part];
    if (!def) continue;
    if (it.p) for (const [n, q] of Object.entries<any>(pinsOf(it))) refs.push([q, n === 'center' ? `(${it.name})` : `(${it.name}.${n})`]);
    else for (const n of Object.keys(def.pins)) refs.push([(pinsOf(it) as Record<string, any>)[n], `(${it.name}.${n})`]);
  }
  return refs;
}
// the name a part is written with: circuitikz's short name it was read as (`R`, `V` …) while that still means it
const nameOf = (it: any, def: any, st: CzStyle) => (it.as && partByName(it.as, def.kind, styleWith(st, it.opts || '')) === it.part ? it.as : def.tikz);
function code(items: any, raw: any) {
  const lines: string[] = [], refs = pinRefs(items), st = styleOf(raw);
  const pt = (q: any) => { const r = refs.find(([p]) => same(p, q)); return r ? r[1] : `(${f(q[0])},${f(q[1])})`; };
  // an item's lines, with its comments
  const put = (it: any, ls: string[]) => {
    const c = it.cmt;
    if (c && c.pre) lines.push(...c.pre);
    if (c && c.post) { if (ls.length) ls[ls.length - 1] += ' ' + c.post; else ls.push(c.post); }
    lines.push(...ls);
  };
  for (const it of items) {
    const def = CZ.parts[it.part];
    if (!def || !it.p) continue;
    const o = [nameOf(it, def, st)].filter(Boolean), [sx, sy] = it.sc || [1, 1];
    if (it.rot) o.push(`rotate=${f(it.rot)}`);
    if (it.flip || sx !== 1) o.push(`xscale=${f(it.flip ? -sx : sx)}`);
    if (sy !== 1) o.push(`yscale=${f(sy)}`);
    if (it.opts) o.push(it.opts);
    put(it, [`\\node${o.length ? `[${o.join(', ')}]` : ''}${it.name ? ` (${it.name})` : ''} at (${f(it.p[0])},${f(it.p[1])}) {${it.text || ''}};`]);
  }
  for (const it of items) {
    const def = CZ.parts[it.part];
    if (!def || it.p) continue;
    const o: string[] = [];
    if (it.l) o.push(`l=${brace(it.l)}`);
    if (it.ann) o.push(`a=${brace(it.ann)}`);
    if (it.v) o.push(`v${it.vm || ''}=${brace(it.v)}`);
    if (it.i) o.push(`i${it.im || ''}=${brace(it.i)}`);
    if (it.name) o.push(`n=${it.name}`);
    if (it.poles && it.poles !== '-') o.push(it.poles);
    if (it.opts) o.push(it.opts);
    if (isWire(it) && !o.length) put(it, crossingSections(it, items).map(([a, b]: any) => `\\draw ${pt(a)} -- ${pt(b)};`));
    else put(it, (isWire(it) ? crossingSections(it, items) : [[it.a, it.b]]).map(([a, b]: any) => `\\draw ${pt(a)} to[${[nameOf(it, def, st), ...o].join(', ')}] ${pt(b)};`));
  }
  // \ctikzset / \tikzset / \tikzstyle lines go first: they set the style of everything drawn after them; comment lines go with
  // the line under them
  if (raw && raw.trim()) {
    const R = raw.replace(/\s+$/, '').split('\n'), set = (c: string[]) => /^\s*\\(ctikzset|tikzset|tikzstyle)\b/.test(c[c.length - 1]);
    const chunks: string[][] = [];
    let cur: string[] = [];
    for (const l of R) { cur.push(l); if (!/^\s*%/.test(l)) { chunks.push(cur); cur = []; } }
    lines.unshift(...chunks.filter(set).flat()); lines.push(...chunks.filter((c) => !set(c)).flat(), ...cur);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- reading code back
// Reads the subset code() writes (and the obvious hand edits to it). Anything else is kept as raw lines.
function closeAt(s: any, i: any) {
  const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, any>)[open];
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\') { k++; continue; }
    if (ch === open) d++;
    else if (ch === shut && --d === 0) return k;
  }
  return -1;
}
function splitTop(str: any, sep: any) {
  const out = [];
  let d = 0, buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') { buf += ch + (str[i + 1] || ''); i++; continue; }
    if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
    if (ch === sep && d === 0) { out.push(buf); buf = ''; } else buf += ch;
  }
  out.push(buf);
  return out;
}
// a part's option as compared: spaces folded, lower case, a braced value unbraced (`Telmech={M}` is `Telmech=M`)
const norm = (t: any) => t.trim().replace(/\s+/g, ' ').toLowerCase().replace(/=\s*\{([^{}]*)\}$/, '=$1');
let tikzIndex: any = null;
function partFor(list: any, kind: any, st0?: CzStyle) {
  if (!tikzIndex) {
    tikzIndex = CZ.order.filter((k: any) => CZ.parts[k].tikz).map((k: any) => ({ k, kind: CZ.parts[k].kind, t: splitTop(CZ.parts[k].tikz, ',').map(norm) }));
    tikzIndex.sort((a: any, b: any) => b.t.length - a.t.length);
  }
  // the part's name usually comes first, but `to[american voltages, R]` is fine too
  const L = list.map(norm);
  for (let j = 0; j < L.length; j++)
    for (const e of tikzIndex) if (e.kind === kind && e.t.every((t: any, i: any) => L[j + i] === t)) return { key: e.k, rest: [...list.slice(0, j), ...list.slice(j + e.t.length)], as: '' };
  // circuitikz's other names for it (R, V, D …), as the style reads them; the name is kept as written
  const st = styleWith(st0 || STYLE0, list.join(','));
  for (let j = 0; j < list.length; j++) {
    const key = partByName(list[j], kind, st);
    if (key) return { key, rest: [...list.slice(0, j), ...list.slice(j + 1)], as: list[j].trim() };
  }
  // `R=$R_1$`: the part with its label (a voltage source's voltage, a current source's current)
  for (let j = 0; j < list.length; j++) {
    const m = /^([^=]+?)\s*=\s*([\s\S]*)$/.exec(list[j].trim());
    if (!m) continue;
    const exact = tikzIndex.find((e: any) => e.kind === kind && e.t.length === 1 && e.t[0] === norm(m[1])), key = exact ? exact.k : partByName(m[1], kind, st);
    if (key) return { key, rest: [...list.slice(0, j), ...list.slice(j + 1)], as: exact ? '' : m[1].trim(), lab: unbrace(m[2]) };
  }
  return null;
}

// ---------------------------------------------------------------- circuitikz's own names for parts
// The short names circuitikz defines (R, L, C, V, I, D, sV, leD* …, from pgfcircbipoles.tex): name=what it stands for.
const ALIAS = new Map<string, string>((
  'xing=crossing|R=resistor|vR=variable resistor|sR=resistive sensor|ldR=light dependent resistor|pR=potentiometer|thR=thermistor|' +
  'thRp=thermistor ptc|thRn=thermistor ntc|phR=photoresistor|Mr=memristor|C=capacitor|eC=ecapacitor|elko=ecapacitor|pC=polar capacitor|' +
  'cC=curved capacitor|vC=variable capacitor|PZ=piezoelectric|sC=capacitive sensor|feC=ferrocap|L=inductor|vL=variable inductor|sL=inductive sensor|' +
  'vsource=voltage source|V=voltage source|cvsource=controlled voltage source|controlled vsource=controlled voltage source|' +
  'cV=controlled voltage source|vsourceAM=american voltage source|cvsourceAM=american controlled voltage source|vsourceEU=european voltage source|' +
  'cvsourceEU=european controlled voltage source|ecsource=empty controlled source|vsourcesin=sinusoidal voltage source|sV=sinusoidal voltage source|' +
  'cvsourcesin=controlled sinusoidal voltage source|controlled vsourcesin=controlled sinusoidal voltage source|' +
  'csV=controlled sinusoidal voltage source|vsourcesquare=square voltage source|sqV=square voltage source|vsourcetri=triangle voltage source|' +
  'tV=triangle voltage source|vsourceC=cute european voltage source|ceV=cute european voltage source|' +
  'cvsourceC=cute european controlled voltage source|cceV=cute european controlled voltage source|vsourceN=noise voltage source|' +
  'nV=noise voltage source|isource=current source|I=current source|cisource=controlled current source|controlled isource=controlled current source|' +
  'cI=controlled current source|isourceAM=american current source|cisourceAM=american controlled current source|isourceEU=european current source|' +
  'cisourceEU=european controlled current source|isourcesin=sinusoidal current source|sI=sinusoidal current source|' +
  'cisourcesin=controlled sinusoidal current source|controlled isourcesin=controlled sinusoidal current source|' +
  'csI=controlled sinusoidal current source|isourceC=cute european current source|ceI=cute european current source|' +
  'cisourceC=cute european controlled current source|cceI=cute european controlled current source|isourceN=noise current source|' +
  'nI=noise current source|D*=full diode|Do=empty diode|D-=stroke diode|zD*=full Zener diode|zDo=empty Zener diode|zD-=stroke Zener diode|' +
  'zzD*=full ZZener diode|zzDo=empty ZZener diode|zzD-=stroke ZZener diode|sD*=full Schottky diode|sDo=empty Schottky diode|' +
  'sD-=stroke Schottky diode|tD*=full tunnel diode|tDo=empty tunnel diode|tD-=stroke tunnel diode|leD*=full led|leDo=empty led|leD-=stroke led|' +
  'lasD*=full laser diode|lasDo=empty laser diode|lasD-=stroke laser diode|pD*=full photodiode|pDo=empty photodiode|pD-=stroke photodiode|' +
  'VC*=full varcap|VCo=empty varcap|VC-=stroke varcap|tvsD*=full TVS diode|tvsDo=empty TVS diode|tvsD-=stroke TVS diode|shD*=full Shockley diode|' +
  'shDo=empty Shockley diode|shD-=stroke Shockley diode|biD*=full bidirectionaldiode|biDo=empty bidirectionaldiode|biD-=stroke bidirectionaldiode|' +
  'Ty*=full thyristor|Tyo=empty thyristor|Ty-=stroke thyristor|PUT*=full put|PUTo=empty put|PUT-=stroke put|GTO*=full gto|GTOo=empty gto|' +
  'GTO-=stroke gto|GTOb*=full gtobar|GTObo=empty gtobar|GTOb-=stroke gtobar|aGTOb*=full agtobar|aGTObo=empty agtobar|aGTOb-=stroke agtobar|' +
  'IGCT*=full igct|IGCTo=empty igct|IGCT-=stroke igct|Tr*=full triac|Tro=empty triac|Tr-=stroke triac|D=diode|zD=Zener diode|zzD=ZZener diode|' +
  'sD=Schottky diode|tD=tunnel diode|leD=led|pD=photodiode|lasD=laser diode|VC=varcap|tvsD=TVS diode|shD=Shockley diode|biD=bidirectionaldiode|' +
  'Ty=thyristor|PUT=put|GTO=gto|GTOb=gtobar|aGTOb=agtobar|IGCT=igct|Tr=triac|switch=closing switch|cspst=closing switch|spst=switch|' +
  'ospst=opening switch|normal open switch=nos|normal closed switch=ncs|opening normal closed switch=oncs|closing normal closed switch=cncs|' +
  'opening normal open switch=onos|closing normal open switch=cnos|nopb=push button|normally open push button=push button|' +
  'normally closed push button=ncpb|normally open push button closed=nopbc|normally closed push button open=ncpbo|ccsw=cute closed switch|' +
  'cosw=cute open switch|ccgsw=cute closing switch|cogsw=cute opening switch|afuse=asymmetric fuse|vdd=vcc|vss=vee|transmission line=tline|TL=tline|' +
  'iec connector=iecconn'
).split('|').map((x) => x.split('=') as [string, string]));
// names that follow the circuit's style: `R` is a zigzag unless resistors are European, and so on
type CzStyle = { resistor: string; inductor: string; voltage: string; current: string; diode: string };
const STYLE0: CzStyle = { resistor: 'american', inductor: 'cute', voltage: 'european', current: 'european', diode: 'empty' }; // circuitikz's defaults
const DIODES = new Set(['diode', 'Zener diode', 'ZZener diode', 'Schottky diode', 'tunnel diode', 'led', 'photodiode', 'laser diode', 'varcap', 'TVS diode',
  'Shockley diode', 'bidirectionaldiode', 'thyristor', 'put', 'gto', 'gtobar', 'agtobar', 'igct', 'triac']);
function styled(n: string, st: CzStyle) {
  const R = st.resistor === 'european' ? 'european' : 'american', V = st.voltage === 'american' || st.voltage === 'raised' ? 'american' : 'european';
  const I = st.current === 'american' ? 'american' : 'european';
  const resist: Record<string, string> = { resistor: `${R} resistor`, 'variable resistor': `variable ${R} resistor`, 'resistive sensor': `${R} resistive sensor`,
    'light dependent resistor': `${R} light dependent resistor`, potentiometer: `${R} potentiometer` };
  if (resist[n]) return resist[n];
  if (n === 'inductor' || n === 'inductive sensor') return `${st.inductor} ${n}`;
  if (n === 'variable inductor') return `variable ${st.inductor} inductor`;
  if (n === 'voltage source' || n === 'controlled voltage source') return `${V} ${n}`;
  if (n === 'controlled current source') return `${V} ${n}`; // circuitikz picks this one by the voltage style too
  if (n === 'current source') return `${I} ${n}`;
  if (DIODES.has(n)) return `${st.diode} ${n}`;
  return null;
}
// what a name finally stands for in style st
function resolveName(n: string, st: CzStyle) {
  for (let k = 0; k < 8; k++) { const r = styled(n, st) ?? ALIAS.get(n); if (r == null) break; n = r; }
  return n;
}
// style settings in a list of options (`american`, `european voltages`, `full diodes`, `resistor=european` …)
function styleWith(st: CzStyle, opts: string) {
  st = { ...st };
  for (const x of splitTop(opts || '', ',')) {
    const t = norm(x);
    let m;
    if (t === 'american' || t === 'european') { st.voltage = st.current = st.resistor = st.inductor = t; continue; }
    if ((m = /^(american|european|straight|raised|curved) voltages$/.exec(t))) st.voltage = m[1];
    else if ((m = /^(american|european) currents$/.exec(t))) st.current = m[1];
    else if ((m = /^(american|european) resistors$/.exec(t))) st.resistor = m[1];
    else if ((m = /^(american|european|cute) inductors$/.exec(t))) st.inductor = m[1];
    else if ((m = /^(full|empty|stroke) diodes?$/.exec(t))) st.diode = m[1];
    else if ((m = /^(voltage|current|resistor|inductor)\s*=\s*(\w+)$/.exec(t))) (st as any)[m[1]] = m[2];
  }
  return st;
}
// the style \ctikzset{…} and \tikzset{…} lines set
function styleOf(raw: any) {
  let st = STYLE0;
  const t = uncomment(raw);
  for (const m of t.matchAll(/\\(?:ctikzset|tikzset)\s*\{/g)) {
    const j = closeAt(t, m.index! + m[0].length - 1);
    if (j > 0) st = styleWith(st, t.slice(m.index! + m[0].length, j));
  }
  return st;
}
// a part by any of its names: Map (kind, what the name stands for) → part key
let canon: Map<string, string> | null = null;
function partByName(n: string, kind: string, st: CzStyle) {
  if (!canon) {
    canon = new Map();
    for (const k of CZ.order) {
      const t = CZ.parts[k].tikz, kd = CZ.parts[k].kind;
      if (!t || /,/.test(t)) continue;
      for (const v of [t, resolveName(t, STYLE0)]) if (!canon.has(kd + ':' + norm(v))) canon.set(kd + ':' + norm(v), k);
    }
  }
  return canon.get(kind + ':' + norm(resolveName(n.trim(), st))) || null;
}
function parse(src: any) {
  const items: any[] = [], raw: string[] = [];
  // comments are blanked out, the same length, so a statement's place in the text is its place in the source
  const notes: { at: number; text: string }[] = [];
  let text = '', at0 = 0;
  for (const l of String(src || '').split('\n')) {
    const i = commentAt(l);
    if (i >= 0) notes.push({ at: at0 + i, text: l.slice(i).trimEnd() });
    text += (i < 0 ? l : l.slice(0, i) + ' '.repeat(l.length - i)) + '\n';
    at0 += l.length + 1;
  }
  // a whole \begin{circuitikz}[…] … \end{circuitikz} (or tikzpicture): its options become a \tikzset line
  const env = [];
  const blank = (s: string) => ';' + s.slice(1).replace(/[^\n]/g, ' '); // the lines stay where they were
  text = text.replace(/\\end\{(circuitikz|tikzpicture)\}/g, blank);
  for (let bm; (bm = /\\begin\{(circuitikz|tikzpicture)\}\s*/.exec(text));) {
    let e = bm.index + bm[0].length;
    if (text[e] === '[') { const j = closeAt(text, e); if (j > 0) { if (text.slice(e + 1, j).trim()) env.push(`\\tikzset{${text.slice(e + 1, j).trim()}}`); e = j + 1; } }
    text = text.slice(0, bm.index) + blank(text.slice(bm.index, e)) + text.slice(e);
  }
  raw.push(...env);
  let st = styleOf(env.join('\n'));
  const coords = new Map(); // \coordinate (name) at (x,y);
  const named = () => {
    const m = new Map(coords);
    for (const it of items) if (it.name) for (const [n, q] of Object.entries<any>(pinsOf(it))) { m.set(`${it.name}.${n}`, q); if (n === 'center') m.set(it.name, q); }
    return m;
  };
  // (x,y) with or without units, (angle:radius), or a name
  const coord = (t: any, names: any) => {
    const m = new RegExp(`^\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`).exec(t.trim());
    if (m) return [r6(dim(m[1], m[2])), r6(dim(m[3], m[4]))];
    const pm = new RegExp(`^\\(\\s*(-?[\\d.]+)\\s*:\\s*${NUM}\\s*\\)$`).exec(t.trim());
    if (pm) { const a = (+pm[1] * Math.PI) / 180, r = dim(pm[2], pm[3]); return [r6(r * Math.cos(a)), r6(r * Math.sin(a))]; }
    const n = /^\(\s*([^()]+?)\s*\)$/.exec(t.trim());
    if (n && names.has(n[1])) return names.get(n[1]).slice();
    return null;
  };
  // each statement's comments: the ones above it and inside it (pre), and one after its ; on the same line (post)
  const stmts = splitTop(text, ';'), pre: string[][] = stmts.map(() => []), post: string[] = [];
  let k = 0, from = 0;
  for (const n of notes) {
    while (k < stmts.length - 1 && n.at >= from + stmts[k].length) { from += stmts[k].length + 1; k++; }
    if (k && stmts[k - 1].trim() && !text.slice(from, n.at).trim() && !text.slice(from, n.at).includes('\n') && !post[k - 1]) post[k - 1] = n.text;
    else pre[k].push(n.text);
  }
  let carry: string[] = []; // comments by a statement that wrote nothing: they go with the next one
  const rawLine = (s: string, post?: string) => raw.push(post ? `${s} ${post}` : s);
  stmts.forEach((stmt, k) => {
    const lead = carry.concat(pre[k]);
    carry = [];
    if (!stmt.trim()) { carry = lead; if (post[k]) carry.push(post[k]); return; }
    // settings ahead of the statement (\ctikzset{…} and \tikzstyle{…}=[…] need no semicolon): kept as written, on
    // lines of their own
    for (;;) {
      const t = stmt.trim(), m = /^\\(?:ctikzset|tikzset|usetikzlibrary)\s*\{/.exec(t) || /^\\tikzstyle\s*\{[^{}]*\}\s*=?\s*\[/.exec(t);
      const j = m ? closeAt(t, m[0].length - 1) : -1;
      if (j < 0) break;
      raw.push(...lead.splice(0)); raw.push(t.slice(0, j + 1)); st = styleOf(t.slice(0, j + 1)) === STYLE0 ? st : styleWith(st, t.slice(m![0].length, j)); stmt = t.slice(j + 1);
    }
    if (!stmt.trim()) { if (post[k]) { if (raw.length) raw[raw.length - 1] += ' ' + post[k]; else lead.push(post[k]); } carry = lead; return; }
    const orig = stmt.trim();
    // a named coordinate: kept as written, and its name is known to the statements after it
    const cm = /^\\coordinate\s*\(\s*([^()]+?)\s*\)\s*at\s*(\([^()]*\))$/.exec(orig);
    if (cm) { const q = coord(cm[2], named()); if (q) coords.set(cm[1], q); raw.push(...lead); rawLine(orig + ';', post[k]); return; }
    const got = readStmt(orig, coord, named, st);
    if (got && got.length) {
      if (lead.length || post[k]) (got[0] as any).cmt = { ...(lead.length ? { pre: lead } : {}), ...(post[k] ? { post: post[k] } : {}) };
      items.push(...got);
    } else if (got) { carry = lead; if (post[k]) carry.push(post[k]); }
    else { raw.push(...lead); rawLine(orig + ';', post[k]); }
  });
  // comments after the last statement stay at the end
  raw.push(...carry);
  return { items, raw: raw.join('\n') };
}
// tokens of a path: (coord), [opts], {text}, words, --
function tokens(s: any) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('([{'.includes(ch)) { const j = closeAt(s, i); if (j < 0) return null; out.push(s.slice(i, j + 1)); i = j + 1; continue; }
    const op = ['--', '-|', '|-', '++', '+'].find((o) => s.startsWith(o, i));
    if (op) { out.push(op); i += op.length; continue; }
    const m = /^\\?[A-Za-z]+/.exec(s.slice(i));
    if (!m) return null;
    out.push(m[0]); i += m[0].length;
  }
  return out;
}
// options a text node (`\node[above] at (1,2) {$V_{CC}$}`) may have: where it sits, its font and colour
const TEXT_OPT = /^(?:(?:above|below)(?: (?:left|right))?|left|right)(?:\s*=.*)?$|^(?:anchor|font|text|color|xshift|yshift|inner sep|inner xsep|inner ysep|outer sep|align|text width|text depth|text height|opacity|text opacity|rotate|scale|xscale|yscale|transform shape)(?:\s*=.*)?$/;
const textOpt = (t: string) => TEXT_OPT.test(norm(t)) || (!/=/.test(t) && !!(TD.tikzColor && TD.tikzColor(t.trim())));
function nodeFrom(optStr: any, name: any, p: any, txt: any, st?: CzStyle) {
  const list = splitTop(optStr, ',').map((t) => t.trim()).filter(Boolean);
  // a part, or else text on its own (never an empty one: `\node (A) at (1,2) {};` names a point)
  const hit = partFor(list, 'node', st) || (String(txt || '').trim() && list.every(textOpt) ? { key: 'text', rest: list, as: '' } : null);
  if (!hit || !CZ.parts[hit.key]) return null;
  const it: Record<string, any> = { id: uid(), part: hit.key, p, rot: 0, flip: false, name: name || '', text: txt || '', opts: '' };
  if (hit.as) it.as = hit.as;
  // the node's own transformations, in the order written (TikZ applies the last one first) → rot, flip and scale:
  // a negative xscale mirrors, a negative yscale mirrors and turns half round, a negative scale turns half round
  let rot = 0, flip = false, sx = 1, sy = 1;
  const rest = [];
  for (const t of hit.rest) {
    const r = /^rotate\s*=\s*(-?[\d.]+)$/.exec(t), sc = /^(x|y)?scale\s*=\s*(-?[\d.]+)$/.exec(t);
    if (r) rot += flip ? -r[1] : +r[1];
    else if (sc && +sc[2]) {
      const v = +sc[2];
      if (sc[1] !== 'y') sx *= Math.abs(v);
      if (sc[1] !== 'x') sy *= Math.abs(v);
      if (v < 0 && sc[1] !== 'x') rot += 180;
      if (v < 0 && sc[1]) flip = !flip;
    } else rest.push(t);
  }
  it.rot = r6(((rot % 360) + 360) % 360); it.flip = flip;
  if (Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) it.sc = [r6(sx), r6(sy)];
  it.opts = rest.join(', ');
  return it;
}
// a \draw's own options the block can carry: line and colour ones (each part takes them), and circuitikz's style
// keys (which say what `R`, `V` … stand for)
const LINE_OPT = /^(?:ultra thin|very thin|thin|semithick|thick|very thick|ultra thick|solid|dashed|dotted|(?:densely|loosely) (?:dashed|dotted)|(?:line width|color|draw|line cap|line join|opacity|draw opacity)\s*=.*)$/;
const STYLE_OPT = /^(?:american|european|(?:american|european|straight|raised|curved) voltages|(?:american|european) (?:currents|resistors)|(?:american|european|cute) inductors|(?:full|empty|stroke) diodes?|(?:voltage|current|resistor|inductor)\s*=\s*\w+)$/;
function readStmt(stmt: any, coord: any, named: any, st?: CzStyle) {
  const T = tokens(stmt);
  if (!T || !T.length) return null;
  // a node's options, name and place, in any order (`\node at (1,2) [circ] {}` too), then its {text}:
  // { k: the token after it, opt, name, p (null without `at`), txt }
  const nodeAt = (k: number, names: any) => {
    const opt: string[] = [];
    let name = '', p = null;
    for (; k < T.length && T[k][0] !== '{'; k++) {
      const t = T[k];
      if (t[0] === '[') opt.push(t.slice(1, -1));
      else if (t === 'at') { p = coord(T[++k] || '', names); if (!p) return null; }
      else if (t[0] === '(' && !name) name = t.slice(1, -1).trim();
      else return null;
    }
    if (!T[k]) return null;
    return { k: k + 1, opt: opt.filter((o) => o.trim()).join(', '), name, p, txt: T[k].slice(1, -1) };
  };
  if (T[0] === '\\node') {
    const n = nodeAt(1, named());
    if (!n || n.k !== T.length) return null;
    const it = nodeFrom(n.opt, n.name, n.p || [0, 0], n.txt, st);
    return it ? [it] : null;
  }
  if (T[0] !== '\\draw' && T[0] !== '\\path') return null;
  const out: any[] = [];
  let names = named(), k = 1, base: any = null, start: any = null;
  // \draw[…]: line and colour options go on every part drawn; style keys only say what the names stand for
  let dopts: string[] = [];
  if (T[k] && T[k][0] === '[') {
    const list = splitTop(T[k++].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
    if (!list.every((x) => LINE_OPT.test(norm(x)) || STYLE_OPT.test(norm(x)) || (!/=/.test(x) && TD.tikzColor && TD.tikzColor(x)))) return null;
    st = styleWith(st || STYLE0, list.join(','));
    dopts = list.filter((x) => !STYLE_OPT.test(norm(x)));
  }
  // the coordinate at T[k]: absolute, ++(dx,dy) (moves the base) or +(dx,dy) (from the base, which stays)
  const at = () => {
    if (T[k] === 'cycle') { k++; if (!start) return null; base = start.slice(); return start.slice(); } // back to where this run began
    const rel = T[k] === '++' ? 2 : T[k] === '+' ? 1 : 0;
    if (rel) k++;
    const q = coord(T[k] || '', names);
    if (!q) return null;
    k++;
    if (rel) { if (!base || !/^\(\s*-?[\d.]/.test(T[k - 1])) return null; q[0] += base[0]; q[1] += base[1]; }
    if (rel !== 1) base = q.slice();
    return q;
  };
  const wire = (a: any, b: any) => ({ id: uid(), part: 'short', a, b, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
  let cur = at();
  if (!cur) return null;
  start = cur.slice();
  while (k < T.length) {
    const t = T[k];
    // a coordinate on its own moves the pen: `(0,0) to[R] (2,0) (0,1) to[C] (2,1)`
    if (t[0] === '(' || t === '++' || t === '+') { const q = at(); if (!q) return null; cur = q; start = q.slice(); continue; }
    if (t === 'node') {
      // \draw (x,y) node[opts] (name) {text}
      const n = nodeAt(k + 1, names);
      if (!n) return null;
      k = n.k;
      const it = nodeFrom(n.opt, n.name, n.p || cur.slice(), n.txt, st);
      if (!it) return null;
      out.push(it);
      continue;
    }
    if (t === 'to' && !(T[k + 1] && T[k + 1][0] === '[')) {
      // a plain `to` is a straight line, a wire
      k++;
      const q = at();
      if (!q) return null;
      out.push(wire(cur, q)); cur = q; continue;
    }
    if (t === '--' || t === '-|' || t === '|-') {
      // a corner (-| across then up, |- up then across) is two wires
      k++;
      const q = at();
      if (!q) return null;
      const c = t === '-|' ? [q[0], cur[1]] : t === '|-' ? [cur[0], q[1]] : null;
      if (c && !same(c, cur) && !same(c, q)) out.push(wire(cur, c), wire(c, q));
      else out.push(wire(cur, q));
      cur = q; continue;
    }
    if (t === 'to' && T[k + 1] && T[k + 1][0] === '[') {
      const list = splitTop(T[k + 1].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
      k += 2;
      const q = at();
      const hit = partFor(list, 'bipole', st);
      if (!q || !hit) return null;
      const it: Record<string, any> = { id: uid(), part: hit.key, a: cur, b: q, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' };
      if (hit.as) it.as = hit.as;
      if (hit.lab) it[({ v: 'v', i: 'i' } as Record<string, string>)[srcKind(hit.key)] || 'l'] = hit.lab;
      const rest = [];
      for (const x of hit.rest) {
        const m = /^(l|a|v|i|n|name)\s*=\s*([\s\S]*)$/.exec(x), vi = /^(v|i)([_^<>]{1,3})\s*=\s*([\s\S]*)$/.exec(x);
        if (vi) { it[vi[1]] = unbrace(vi[3]); it[vi[1] + 'm'] = vi[2]; }
        else if (m) it[({ l: 'l', a: 'ann', v: 'v', i: 'i', n: 'name', name: 'name' } as Record<string, any>)[(m[1] as any)]] = unbrace(m[2]);
        else if (/^[*o]?-[*o]?$/.test(x)) it.poles = x;
        else rest.push(x);
      }
      it.opts = rest.join(', ');
      out.push(it);
      if (it.name) names = new Map([...names, ...Object.entries<any>(pinsOf(it)).map(([n, p]) => [`${it.name}.${n}`, p])]);
      cur = q; continue;
    }
    return null;
  }
  if (dopts.length) for (const it of out) it.opts = [it.opts, ...dopts].filter(Boolean).join(', ');
  return out.length ? out : null;
}

// ---------------------------------------------------------------- the block
// a small default circuit: a source, a resistor and a capacitor in a loop
function defaultItems() {
  const pick = (...keys: any[]) => keys.find((k) => CZ.parts[k]) || 'short';
  const B = (part: any, a: any, b: any, l?: any) => ({ id: uid(), part, a, b, l: l || '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
  return [
    B(pick('src:vsource-eu', 'src:battery', 'src:vsource-us'), [0, 0], [0, 2], '$V$'),
    B(pick('res:iec', 'res:us'), [0, 2], [3, 2], '$R$'),
    B(pick('cap:iec', 'cap:c'), [3, 2], [3, 0], '$C$'),
    B('short', [3, 0], [0, 0]),
  ];
}
const cache = new Map();
function layout(s: any) {
  const key = JSON.stringify([s.items, s.raw || '', s.size, s.font, TD.math && TD.math.engine]);
  const hit = cache.get(key);
  if (hit) return hit;
  const b = itemsBox(s.items || [], { size: s.size, font: s.font, vstyle: vstyleOf(s.raw) });
  // in canvas px, relative to (s.x, s.y)
  const bb = b ? { x: b.x1 * PX, y: -b.y2 * PX, w: (b.x2 - b.x1) * PX, h: (b.y2 - b.y1) * PX } : { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX };
  const L = { bb, empty: !b };
  if (TD.measuring && TD.measuring()) return L; // text sizes may be placeholders in a measuring pass: don't keep them
  if (cache.size > 200) cache.clear();
  cache.set(key, L);
  return L;
}
TD.onTextMetricsChange(() => { cache.clear(); });

function draw(s: any, ctx: any) {
  const L = layout(s), col = TD.css(s.color || '#000000'), bb = L.bb;
  let out;
  if (L.empty) {
    out = `<rect x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}" fill="none" stroke="${col}" stroke-dasharray="4 3" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty circuit', { size: 'small', font: s.font }, '#888888', bb.x + bb.w / 2, bb.y + bb.h / 2, ctx);
  } else {
    out = itemsSvg(s.items, (x: any, y: any) => [x * PX, -y * PX], PX, { color: col, paper: ctx.paper || '#ffffff', ctx, st: { size: s.size || 'normalsize', font: s.font || 'default', vstyle: vstyleOf(s.raw) } });
  }
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x)},${r2(s.y)})">${out}</g>`;
}
const fullCode = (s: any) => code(s.items || [], s.raw || '');

TD.TYPES.cz = {
  name: 'Circuit',
  pts: [['x', 'y']],
  create(p: any, d: any) {
    const s = { type: 'cz', x: p.x, y: p.y, items: defaultItems(), raw: '', size: TD.BLOCK_SIZE, font: 'default', color: '#000000' };
    const bb = layout(s).bb; s.x = p.x - bb.x; s.y = p.y - bb.y; // top-left at the click
    return s;
  },
  drag(s: any, a: any, q: any) { const bb = layout(s).bb; s.x = q.x - bb.x; s.y = q.y - bb.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb, x = s.x + b.x, y = s.y + b.y; return [{ x, y: y + b.h / 2 }, { x: x + b.w, y: y + b.h / 2 }, { x: x + b.w / 2, y }, { x: x + b.w / 2, y: y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x + b.x, y: s.y + b.y }, { x: s.x + b.x + b.w, y: s.y + b.y + b.h }]; },
  svg: draw,
  // circuitikz parts draw straight into the picture, in a scope placed where the block is
  tikz(s: any, X: any) {
    X.pkgs.add('circuitikz');
    const body = fullCode(s);
    if (!body.trim()) return '';
    const o = [`shift={${X.c(s.x, s.y)}}`];
    if (TD.css(s.color || '#000000') !== '#000000') o.push(`color=${X.col(s.color)}`);
    o.push(...TD.textOpts({ size: s.size, font: s.font }, X)); // the labels' size, as on the canvas
    // The circuit's own code may set a font for its nodes (\tikzstyle{every node}=[font=\fontsize…], from an
    // import): a node's font= replaces the scope's, family and all. The block's font is then also switched to at
    // the scope's start, as the text's surrounding font, which a font= that sets only the size keeps.
    const fam = /\bfont\s*=/.test(body) && TD.textOpts({ font: s.font }, X).find((x: string) => x.startsWith('font='));
    if (fam) o.push(`execute at begin scope={${fam.slice(5)}}`);
    return `\\begin{scope}[${o.join(', ')}]\n${body.split('\n').map((l) => '  ' + l).join('\n')}\n\\end{scope}`;
  },
};



const markOf = (kind: 'v' | 'i', it: any) => (kind === 'v' ? voltOf : currOf)({ ...it, [kind]: it[kind] || ' ' }, {});
TD.cz = { markOf, markMods, vstyleOf, colorOf, pinsOf, nodeXf, bipXf, xfOf, itemsSvg, itemsBox, code, parse, layout, same, uid, isWire, NODE_R, RLEN, defaultItems };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("cz", {
  menu: { order: 4, group: 'electronics', label: "Circuit", title: "Circuit, drawn with circuitikz parts", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M4 18V6h7M21 6h7v12H4\"/><path d=\"M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3\" class=\"c1\"/><path d=\"M14 18v-3M18 18v-3\" class=\"c1\"/><path d=\"M12 15h8M12 21h8\" class=\"c1\"/></svg>" },
  fixed: true,
  editor: { get: () => TD.czEditor, alias: "czOpen", apply: (s, result) => { s.items = result.items; s.raw = result.raw; } }
});
export { isWire, fullCode };
