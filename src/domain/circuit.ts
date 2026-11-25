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
// (with `anchor=` (it.anc), TikZ puts that anchor, turned with the node, at p and the node round it)
function nodeXf(it: any) {
  const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [sx, sy] = it.sc || [1, 1], fx = (it.flip ? -1 : 1) * sx;
  const T = (x: any, y: any) => { x *= fx; y *= sy; return [it.p[0] + x * c - y * s, it.p[1] + x * s + y * c]; };
  const an = it.anc && anchorAt(it.part, it.anc);
  if (!an) return T;
  const [qx, qy] = T(an[0], an[1]), dx = qx - it.p[0], dy = qy - it.p[1];
  return (x: any, y: any) => { const [u, v] = T(x, y); return [u - dx, v - dy]; };
}
// the anchors TeX gives a part besides the pins it is wired by (measured with \pgfpointanchor, circuitikz 1.8):
// a transistor's B, C, E, D, G, S and their long names (base, gate … ; B is the bulk on FETs that have one),
// an op amp's in up, in down, up and down, a not or buffer port's in 1, a mixer's 1 to 4
const BULK0 = new Set(['npn', 'pnp', 'nmos', 'pmos', 'nfet', 'pfet', 'nigfete', 'pigfete', 'nigfetebulk', 'nigbt', 'pigbt', 'hemt', 'nigfetd', 'nmosd']);
const COMPASS_OK = new Set(['american and port', 'american or port', 'american xor port', 'american nand port', 'american nor port', 'american xnor port',
  'american not port', 'american buffer port', 'european and port', 'op amp', 'npn', 'nmos', 'ground', 'vcc']);
const BULK_G = new Set(['Lnigbt', 'njfet', 'pjfet']), B_BULK = new Set(['nfet', 'pfet', 'nigfete', 'pigfete', 'nigfetebulk', 'nigfetd']);
const texAnchorMemo = new Map<string, Record<string, number[]>>();
function texAnchors(key: string) {
  let out = texAnchorMemo.get(key);
  if (out) return out;
  out = {};
  const def = CZ.parts[key], P = (def && def.pins) || {}, t = def && def.tikz;
  if (def && def.cat === 'trans' && def.kind === 'node') {
    const ctl = P.B || P.G, hi = P.C || P.D, lo = P.E || P.S;
    if (ctl && hi && lo) {
      for (const n of ['G', 'base', 'gate']) out[n] = ctl;
      out.B = B_BULK.has(t) ? [0, 0] : ctl;
      for (const n of ['C', 'D', 'collector', 'drain']) out[n] = hi;
      for (const n of ['E', 'S', 'emitter', 'source']) out[n] = lo;
      if (BULK0.has(t)) out.bulk = [0, 0]; else if (BULK_G.has(t)) out.bulk = [0, ctl[1]];
    }
  }
  if (t === 'op amp') Object.assign(out, { 'in up': P['-'], 'in down': P['+'], up: [-0.0833, 0.539], down: [-0.0833, -0.539] });
  if ((t === 'american not port' || t === 'american buffer port') && P.in) out['in 1'] = P.in;
  if (t === 'mixer') Object.assign(out, { 1: P.in, 2: P['in 2'], 3: P.out, 4: P['4'] });
  // compass anchors: the node's box (its drawing's, a not or buffer port's 1.4 high)
  if (COMPASS_OK.has(t)) {
    const b = CZ.geom(key).box, y2 = /^american (?:not|buffer) port$/.test(t) ? 0.7 : b.y2, y1 = /^american (?:not|buffer) port$/.test(t) ? -0.7 : b.y1;
    const cx = (b.x1 + b.x2) / 2, cy = (y1 + y2) / 2;
    Object.assign(out, { north: [cx, y2], south: [cx, y1], east: [b.x2, cy], west: [b.x1, cy], 'north east': [b.x2, y2], 'north west': [b.x1, y2], 'south east': [b.x2, y1], 'south west': [b.x1, y1] });
  }
  for (const n of Object.keys(out)) if (!out[n] || P[n]) delete out[n];
  texAnchorMemo.set(key, out);
  return out;
}
// a node part's anchor in its own frame: a pin, or another anchor TeX gives it; centre is (0, 0)
const anchorAt = (key: string, n: string) => (n === 'center' ? [0, 0] : ((CZ.parts[key] && CZ.parts[key].pins) || {})[n] || texAnchors(key)[n] || null);
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
// the points code may name on an item: its pins and the other anchors TeX gives it, in the block frame
function anchorsOf(it: any) {
  const out = pinsOf(it);
  if (it.p) { const T = nodeXf(it); for (const [n, q] of Object.entries<any>(texAnchors(it.part))) if (!out[n]) out[n] = T(q[0], q[1]); }
  return out;
}

// ---------------------------------------------------------------- drawing
// SVG of the items through m (block cm → screen px); k = px per cm; o: { color, paper, sel: Set of ids, ctx, st }
function itemsSvg(items: any, m: any, k: any, o: Record<string, any> = {}) {
  const col = o.color || '#000', paper = o.paper || '#fff';
  let out = '';
  for (const it of [...items.filter((it: any) => !isCrossing(it)), ...items.filter(isCrossing)]) {
    const def = CZ.parts[it.part], ic = colorOf(it), c = o.colorOf ? o.colorOf(it, ic) : ic ? TD.css(ic) : col;
    // wires the path's line width (TikZ's 0.4pt, or what the \draw or the circuit's settings say), component bodies
    // twice that (circuitikz's bipoles/thickness 2)
    const wW = widthOf(it, o.st) / K / PX * k, bW = 2 * wW;
    let s = '';
    if (it.p) {
      if (!def) { const [X, Y] = m(it.p[0], it.p[1]); s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(0.15 * k)}" fill="none" stroke="${c}" stroke-dasharray="2 2"/>`; }
      else { const T = nodeXf(it); s += CZ.svg(CZ.geom(it.part), (x: any, y: any) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k }); }
    } else {
      const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]), w = def ? Math.min(def.w || 0, L) : 0;
      const T0 = bipXf(it), T = vdirMirror(it, vdirOf(it, o.st)) ? (x: any, y: any) => T0(-x, y) : T0, [ax, ay] = m(...it.a), [bx, by] = m(...it.b);
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
    m = /^voltage dir\s*=\s*(old|noold|rp|ef)$/.exec(norm(t));
    if (m) { out.vdir = ({ rp: 'RP', ef: 'EF' } as any)[m[1]] || m[1]; continue; }
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
// TikZ's line width keys in a list of options: the last one's width in pt, or null
const WIDTHS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
function lineWidthIn(opts: string) {
  let w: number | null = null, m;
  for (const x of splitTop(opts || '', ',')) {
    const t = norm(x);
    if (WIDTHS[t] != null) w = WIDTHS[t];
    else if ((m = new RegExp(`^line width\\s*=\\s*${NUM}$`).exec(t))) w = m[2] ? dim(m[1], m[2]) / UNIT.pt : +m[1]; // (a bare number is in pt)
  }
  return w;
}
// the line width the circuit's settings (\tikzset{thick}, a picture's line width=1pt) give its paths
function lineWidthOf(raw: any) {
  let w: number | null = null;
  const t = uncomment(raw);
  for (const m of t.matchAll(/\\tikzset\s*\{/g)) {
    const j = closeAt(t, m.index! + m[0].length - 1), v = j > 0 ? lineWidthIn(t.slice(m.index! + m[0].length, j)) : null;
    if (v != null) w = v;
  }
  return w;
}
const widthOf = (it: any, st: any) => lineWidthIn(it.opts) ?? (st && st.lw) ?? 0.4;
// what the code's settings say about voltage and current marks (their style and `voltage dir`) and line widths
const markStyle = (raw: any) => ({ vstyle: vstyleOf(raw), vdir: styleOf(uncomment(raw)).vdir, lw: lineWidthOf(raw) });
// `voltage dir=old` or `RP` (oldvoltagedirection): a passive part's voltage points backward, a source's signs swap
const oldDir = (st: any) => !!st && (st.vdir === 'old' || st.vdir === 'RP');
// `RP` and `EF` fix batteries (pgfcircbipoles.tex): a battery's plates, and its American + and −, swap ends
const fixBat = (st: any) => !!st && (st.vdir === 'RP' || st.vdir === 'EF');
const BATTERY = /^src:(?:battery|cell2?)$/;
// a body drawn mirrored along its path by the voltage direction: fixed batteries, and an American source's inner
// signs under old directions
const vdirMirror = (it: any, st: any) => (BATTERY.test(it.part) && fixBat(st)) || (/^src:c?vsource-us$/.test(it.part) && oldDir(st));
// the settings with the part's own `voltage dir=` (from its \draw or its to[…]) over the circuit's
const vdirOf = (it: any, st: any) => { const v = optsOf(it).vdir; return v ? { ...(st || {}), vdir: v } : st; };
const colorOf = (it: any) => optsOf(it).color || null;
// sources: 'v' (a voltage source), 'i' (a current source) or ''
const srcKind = (part: any) => (!/^src:/.test(part) || /nullator|norator/.test(part) ? '' : /^src:c?isource/.test(part) ? 'i' : 'v');
// circuitikz's defaults (pgfcircvoltage.tex, v/.code): a voltage source's voltage above and forward; any other
// part's below, forward (backward with `voltage dir=old` or `RP`); a current source's backward, or forward under RP
// (old directions with fixed batteries); `^ _` pick the side, `> <` the direction
function voltOf(it: any, ox: any, st?: any) {
  const o = ox.v || (it.v ? { mods: it.vm || '', t: it.v } : null);
  if (!o) return null;
  const k = srcKind(it.part), md = o.mods, old = oldDir(st);
  const back0 = k === 'v' ? false : k === 'i' ? !(old && st.vdir === 'RP') : old;
  return { t: o.t, s: md.includes('^') ? 1 : md.includes('_') ? -1 : k === 'v' ? 1 : -1, back: md.includes('<') ? true : md.includes('>') ? false : back0, gen: k === 'v' };
}
// currents: forward after the part above the wire; on a voltage source backward and before it (but not with old
// voltage directions). `i<` is backward and before; with a side too, the order says where: `i>_` before, `i_>` after
function currOf(it: any, ox: any, st?: any) {
  const o = ox.i || (it.i ? { mods: it.im || '', t: it.i } : null);
  if (!o) return null;
  const vs = srcKind(it.part) === 'v' && !oldDir(st), md = o.mods, pi = md.search(/[_^]/), di = md.search(/[<>]/);
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
// As pgfcircvoltage.tex draws it: each end Rlen/16 (0.0875) from the path's end towards the part's .left (.right),
// then `distance from node` of the way on; the controls the part's ∓110/∓70 degree border anchors (its box, half the
// body long and as high as its north anchor, grown by a tenth) scaled from the centre by `bump b`; all 0.112 off the
// path. Some kinds set their own distance and bump. (Measured: R, C, L, D, lamp, fuse, vR, sR, pR, cC, eC and
// European R and L on a 2 cm path match to 1e-4 cm.)
const VKIND: Record<string, number[]> = { 'european resistor': [0.4, 2], 'european inductor': [0.4, 2], 'curved capacitor': [0.5, 2.2] };
const VNORTH: Record<string, number> = { 'american inductor': 0.21 }; // TeX's north where the ink stops short of it
function voltageArc(it: any, def: any, G: any) {
  const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) || 1, w = Math.min(def.w || 0, L);
  const hy = G ? Math.max(G.box.y2, -G.box.y1) : 0.2, Ay = srcKind(it.part) ? 1.1 * hy : Math.max(hy, 0.325);
  // where circuitikz anchors the label (north of it): a resistor's anchors sit lower than its curve's controls
  const lab = /^res:/.test(it.part) ? BUMP * 0.308 + VSHIFT : BUMP * Ay + VSHIFT;
  const [dist, bump] = VKIND[def.tikz] || [0.5, BUMP], hh = 1.1 * (VNORTH[def.tikz] ?? hy), hw = 1.1 * (w / 2);
  const xs = -L / 2 + 0.0875 + dist * (L / 2 - w / 2 - 0.0875);
  // the 70 degree ray leaves the box by its top, or by its side when the box is narrow
  const t70 = Math.tan((70 * Math.PI) / 180), [ax, ay] = hh / t70 <= hw ? [hh / t70, hh] : [hw, hw * t70];
  const cy = -(bump * ay + VSHIFT), cx = bump * ax;
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
  st = vdirOf(it, st);
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
    else spots.push({ t, at: T(0, 0), dir: [0, 0] }); // (its centre: with anchor= that is not p)
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
  const V = def && voltOf(it, ox, st);
  if (V) {
    const sty = ox.vstyle || (st && st.vstyle) || 'european', am = sty === 'american' || sty === 'raised', s = V.s;
    // (old voltage directions put + where the arrow starts, and fixed batteries do on a battery: pgfcircvoltage.tex, american)
    const swap = BATTERY.test(it.part) ? fixBat(st) : oldDir(st);
    const sign = (from: any, to: any, y: any) => { const [p, q] = V.back !== swap ? [to, from] : [from, to]; spots.push(mid('$+$', p, y), mid('$-$', q, y)); };
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
  const C = def && currOf(it, ox, st);
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
  const st = o.st || { size: 'normalsize', font: 'default' }, zoom = k / PX, wW = widthOf(it, o.st) / K / PX * k;
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
    if (it.anc) o.push(`anchor=${it.anc}`);
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
type CzStyle = { resistor: string; inductor: string; voltage: string; current: string; diode: string; ports: string; vdir: string };
const STYLE0: CzStyle = { resistor: 'american', inductor: 'cute', voltage: 'european', current: 'european', diode: 'empty', ports: 'american', vdir: 'noold' }; // circuitikz's defaults
// the logic ports `logic ports=…` picks (pgfcirctripoles.tex): `and port` is `american and port` by default
const GATES = new Set(['and', 'or', 'xor', 'nand', 'nor', 'xnor', 'not', 'buffer']);
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
  const g = /^(\w+) port$/.exec(n);
  if (g && GATES.has(g[1])) return `${st.ports === 'ieee' ? 'ieeestd' : st.ports === 'european' ? 'european' : 'american'} ${n}`;
  if (n === 'blank port' || n === 'blank not port') return `european ${n}`; // (no American blank ports)
  if (n === 'schmitt port' || n === 'invschmitt port') return st.ports === 'ieee' ? `ieeestd ${n}` : n.replace(/ port$/, '');
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
    if (t === 'american' || t === 'european') { st.voltage = st.current = st.resistor = st.inductor = st.ports = t; continue; }
    if ((m = /^(american|european|straight|raised|curved) voltages$/.exec(t))) st.voltage = m[1];
    else if ((m = /^(american|european) currents$/.exec(t))) st.current = m[1];
    else if ((m = /^(american|european) resistors$/.exec(t))) st.resistor = m[1];
    else if ((m = /^(american|european|cute) inductors$/.exec(t))) st.inductor = m[1];
    else if ((m = /^(full|empty|stroke) diodes?$/.exec(t))) st.diode = m[1];
    else if ((m = /^(american|european|ieee) ports$/.exec(t))) st.ports = m[1];
    else if ((m = /^logic ports\s*=\s*(american|european|ieee)$/.exec(t))) st.ports = m[1];
    else if ((m = /^voltage dir\s*=\s*(old|noold|rp|ef)$/.exec(t))) st.vdir = { rp: 'RP', ef: 'EF' }[m[1]] || m[1];
    else if ((m = /^(voltage|current|resistor|inductor|diode)\s*=\s*(\w+)$/.exec(t))) (st as any)[m[1]] = m[2];
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
// opt.pre: settings ahead of the code (the document's package options, as \ctikzset); the result also has where
// each statement read into items is in src (spans: [at, end) with its ;), the code's settings alone (set: raw
// without the statements kept) and every name the code defines (names: name → [x, y])
function parse(src: any, opt: { pre?: string } = {}) {
  const items: any[] = [], raw: string[] = [], set: string[] = [], spans: number[][] = [];
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
  if (opt.pre) raw.push(opt.pre);
  raw.push(...env); set.push(...raw);
  // node distance (positioning's right=of …): the picture's, else TikZ's 1cm and 1cm (null: one not read); on grid
  // measures it between centres, which parts are not placed by
  let nd: number[] | number | null = [1, 1], grid = false;
  const distOf = (t: string) => {
    for (const m of t.matchAll(/node distance\s*=\s*(\{[^{}]*\}|[^,}\]]+)/g)) nd = distSpec(unbrace(m[1].trim()));
    if (/\bon grid\b(?!\s*=\s*false)/.test(t)) grid = true;
  };
  distOf(env.join('\n'));
  let st = styleOf([opt.pre || '', ...env].join('\n'));
  // \coordinate (name) at (x,y); a path's coordinate (name); an empty node's centre (name.center only: TikZ ends a
  // path at a node's border)
  const coords = new Map();
  const named = () => {
    const m = new Map(coords);
    for (const it of items) if (it.name) for (const [n, q] of Object.entries<any>(anchorsOf(it))) { m.set(`${it.name}.${n}`, q); if (n === 'center') m.set(it.name, q); }
    return m;
  };
  const coord = (t: any, names: any) => coordOf(t, names);
  // each statement's comments: the ones above it and inside it (pre), and one after its ; on the same line (post)
  const stmts = splitTop(text, ';'), pre: string[][] = stmts.map(() => []), post: string[] = [];
  let k = 0, from = 0;
  for (const n of notes) {
    while (k < stmts.length - 1 && n.at >= from + stmts[k].length) { from += stmts[k].length + 1; k++; }
    if (k && stmts[k - 1].trim() && !text.slice(from, n.at).trim() && !text.slice(from, n.at).includes('\n') && !post[k - 1]) post[k - 1] = n.text;
    else pre[k].push(n.text);
  }
  const starts: number[] = [];
  for (let k = 0, p = 0; k < stmts.length; k++) { starts.push(p); p += stmts[k].length + 1; }
  let carry: string[] = [], depth = 0; // comments by a statement that wrote nothing: they go with the next one
  const macros = new Map<string, string>(), scopes: string[] = [];
  const expand = (t: string) => {
    for (let n = 0; n < 8 && macros.size; n++) {
      const u = t.replace(/\\[A-Za-z]+/g, (m) => (macros.has(m) ? macros.get(m)! : m));
      if (u === t) break;
      t = u;
    }
    return t;
  };
  const rawLine = (s: string, post?: string) => raw.push(post ? `${s} ${post}` : s);
  stmts.forEach((stmt, k) => {
    const lead = carry.concat(pre[k]);
    carry = [];
    if (!stmt.trim()) { carry = lead; if (post[k]) carry.push(post[k]); return; }
    // settings ahead of the statement (\ctikzset{…} and \tikzstyle{…}=[…] need no semicolon): kept as written, on
    // lines of their own
    for (;;) {
      // (\def\x{…} and \newcommand\x{…} with no arguments too: their text is read where they are used, as TeX expands them)
      const t = stmt.trim(), m = /^\\(?:ctikzset|tikzset|usetikzlibrary)\s*\{/.exec(t) || /^\\tikzstyle\s*\{[^{}]*\}\s*=?\s*\[/.exec(t) ||
        /^\\(?:def\s*(\\[A-Za-z]+)|newcommand\s*\{?\s*(\\[A-Za-z]+)\s*\}?)\s*\{/.exec(t);
      // (a scope that only names its bounding box, or has no options, changes nothing drawn: read through)
      const sb = depth ? null : /^\\begin\s*\{scope\}\s*/.exec(t), se = !depth && scopes.length && /^\\end\s*\{scope\}/.exec(t);
      if (sb) {
        const o = t[sb[0].length] === '[' ? closeAt(t, sb[0].length) : sb[0].length - 1;
        if (o < 0 || !splitTop(t.slice(sb[0].length + 1, o), ',').every((x) => !x.trim() || /^local bounding box\s*=/.test(x.trim()))) break;
        scopes.push(t.slice(0, o + 1)); raw.push(t.slice(0, o + 1)); stmt = t.slice(o + 1);
        continue;
      }
      if (se) { scopes.pop(); raw.push(se[0]); stmt = t.slice(se[0].length); continue; }
      const j = m ? closeAt(t, m[0].length - 1) : -1;
      if (j < 0) break;
      if (m![1] || m![2]) { const body = t.slice(m![0].length, j); if (/#/.test(body)) break; macros.set(m![1] || m![2], body); }
      raw.push(...lead.splice(0)); raw.push(t.slice(0, j + 1)); set.push(t.slice(0, j + 1)); distOf(t.slice(0, j + 1)); st = styleOf(t.slice(0, j + 1)) === STYLE0 ? st : styleWith(st, t.slice(m![0].length, j)); stmt = t.slice(j + 1);
    }
    if (!stmt.trim()) { if (post[k]) { if (raw.length) raw[raw.length - 1] += ' ' + post[k]; else lead.push(post[k]); } carry = lead; return; }
    const orig = stmt.trim(), at = starts[k] + stmts[k].lastIndexOf(orig);
    // a statement in a scope (or any environment) is kept, with the scope: its options may move or restyle it
    const opens = (orig.match(/\\begin\s*\{/g) || []).length, shuts = (orig.match(/\\end\s*\{/g) || []).length, inScope = depth > 0 || opens > 0 || shuts > 0;
    depth = Math.max(0, depth + opens - shuts);
    // a named coordinate: kept as written, and its name is known to the statements after it
    const cm = /^\\coordinate\s*\(\s*([^()]+?)\s*\)\s*at\s*(\([\s\S]*\))$/.exec(orig);
    if (cm && !inScope) { const q = coord(cm[2], named()); if (q) { coords.set(cm[1], q); coords.set(cm[1] + '.center', q); } raw.push(...lead); rawLine(orig + ';', post[k]); set.push(orig + ';'); return; }
    const got = inScope ? null : readStmt(expand(orig), coord, named, st, { nd, grid, isPoint: (n: string) => coords.has(n) });
    if (got && got.length) {
      if (lead.length || post[k]) (got[0] as any).cmt = { ...(lead.length ? { pre: lead } : {}), ...(post[k] ? { post: post[k] } : {}) };
      items.push(...got);
    } else if (got) { carry = lead; if (post[k]) carry.push(post[k]); }
    else { raw.push(...lead); rawLine(orig + ';', post[k]); }
    // what the statement names: a path's coordinate (n) where it stands, an empty node's centre
    for (const [n, q, bare] of (got && (got as any).defs) || (!got && !inScope && emptyNode(orig, coord, named)) || []) {
      coords.set(n + '.center', q); if (bare) coords.set(n, q);
      if (got && bare) { const line = `\\coordinate (${n}) at (${f(q[0])},${f(q[1])});`; raw.push(line); set.push(line); }
    }
    // what a statement holds that the circuit can't stays code, after it
    if (got) { const rest = (got as any).rest || []; raw.push(...rest); spans.push([at, starts[k] + stmts[k].length + 1, rest.join('\n')]); }
  });
  // comments after the last statement stay at the end
  raw.push(...carry);
  return { items, raw: raw.join('\n'), set: set.join('\n'), spans, names: named(), coords };
}
// `\node (A) at (p) {};`: an empty node with no options, the point its centre is ([[name, p, false]]) or null
function emptyNode(stmt: string, coord: any, named: any) {
  const T = tokens(stmt);
  if (!T || T[0] !== '\\node' || T.length < 4 || T[T.length - 1].replace(/\s+/g, '') !== '{}') return null;
  let name = '', p = null;
  for (let k = 1; k < T.length - 1; k++) {
    if (T[k] === 'at') p = coord(T[++k] || '', named());
    else if (T[k][0] === '(' && !name) name = T[k].slice(1, -1).trim();
    else return null;
  }
  return name && p ? [[name, p, false]] : null;
}
// a node distance: one length, or `a and b` (vertical, horizontal); a bare number is in cm
function distSpec(t: string): number[] | number | null {
  const one = (x: string) => { const m = new RegExp(`^${NUM}$`).exec(x.trim()); return m ? dim(m[1], m[2]) : null; };
  const ab = String(t).split(/\s+and\s+/);
  if (ab.length === 2) { const a = one(ab[0]), b = one(ab[1]); return a == null || b == null ? null : [a, b]; }
  return one(t);
}
// a point in TikZ's syntax: (x,y) with or without units, (angle:radius), a name (Q.B, a), (p |- q) and (p -| q),
// and calc's ($(a)!f!(b)$), ($(a)+(x,y)$), ($k*(a)$); a bare node name inside |- and calc is its centre
function coordOf(t: any, names: any): number[] | null {
  const s = String(t).trim();
  const m = new RegExp(`^\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`).exec(s);
  if (m) return [r6(dim(m[1], m[2])), r6(dim(m[3], m[4]))];
  const pm = new RegExp(`^\\(\\s*(-?[\\d.]+|right|up|left|down|east|north|west|south)\\s*:\\s*${NUM}\\s*\\)$`).exec(s);
  const DIRS: Record<string, number> = { right: 0, up: 90, left: 180, down: 270, east: 0, north: 90, west: 180, south: 270 };
  if (pm) { const a = ((DIRS[pm[1]] ?? +pm[1]) * Math.PI) / 180, r = dim(pm[2], pm[3]); return [r6(r * Math.cos(a)), r6(r * Math.sin(a))]; }
  if (s[0] !== '(' || closeAt(s, 0) !== s.length - 1) return null;
  const inner = s.slice(1, -1).trim();
  if (names.has(inner)) return names.get(inner).slice();
  const centre = (x: string) => coordOf(`(${x.trim()})`, names) || (names.has(x.trim() + '.center') ? names.get(x.trim() + '.center').slice() : null);
  if (/^\$[\s\S]*\$$/.test(inner)) return calcOf(inner.slice(1, -1), centre);
  const pp = /^([^$]+?)\s*(\|-|-\|)\s*([^$]+)$/.exec(inner);
  if (pp) {
    const a = centre(pp[1]), b = centre(pp[3]);
    return a && b ? (pp[2] === '|-' ? [a[0], b[1]] : [b[0], a[1]]) : null;
  }
  return null;
}
// calc's sum of terms: [±][k*](point)[!f!(point)]…
function calcOf(e: string, centre: (x: string) => number[] | null): number[] | null {
  const acc = [0, 0];
  let i = 0;
  const ws = () => { while (/\s/.test(e[i] || '')) i++; };
  for (ws(); i < e.length; ws()) {
    let sign = 1, k = 1, m;
    if (e[i] === '+' || e[i] === '-') { if (e[i] === '-') sign = -1; i++; ws(); }
    if ((m = /^(\d*\.?\d+)\s*\*\s*/.exec(e.slice(i)))) { k = +m[1]; i += m[0].length; }
    if (e[i] !== '(') return null;
    let j = closeAt(e, i);
    if (j < 0) return null;
    let p = centre(e.slice(i + 1, j));
    if (!p) return null;
    i = j + 1;
    while ((m = /^\s*!\s*(-?\d*\.?\d+)\s*!\s*\(/.exec(e.slice(i)))) {
      const at = i + m[0].length - 1;
      j = closeAt(e, at);
      const q = j > 0 ? centre(e.slice(at + 1, j)) : null;
      if (!q) return null;
      p = [p[0] + +m[1] * (q[0] - p[0]), p[1] + +m[1] * (q[1] - p[1])];
      i = j + 1;
    }
    acc[0] += sign * k * p[0]; acc[1] += sign * k * p[1];
  }
  return [r6(acc[0]), r6(acc[1])];
}
// tokens of a path: (coord), [opts], {text}, words, --
// (out.pos: where each token starts in s)
function tokens(s: any) {
  const out: any = [], pos: number[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    pos.push(i);
    if ('([{'.includes(ch)) { const j = closeAt(s, i); if (j < 0) return null; out.push(s.slice(i, j + 1)); i = j + 1; continue; }
    const op = ['--', '-|', '|-', '++', '+'].find((o) => s.startsWith(o, i));
    if (op) { out.push(op); i += op.length; continue; }
    const m = /^\\?[A-Za-z]+/.exec(s.slice(i));
    if (!m) return null;
    out.push(m[0]); i += m[0].length;
  }
  out.pos = pos;
  return out as string[] & { pos: number[] };
}
// options a text node (`\node[above] at (1,2) {$V_{CC}$}`) may have: where it sits, its font and colour
const TEXT_OPT = /^(?:(?:above|below)(?: (?:left|right))?|left|right)(?:\s*=.*)?$|^(?:anchor|font|text|color|xshift|yshift|inner sep|inner xsep|inner ysep|outer sep|align|text width|text depth|text height|opacity|text opacity|rotate|scale|xscale|yscale|transform shape)(?:\s*=.*)?$/;
const textOpt = (t: string) => (TEXT_OPT.test(norm(t)) && !/=\s*(?:[\s\S]*\s)?of\b/.test(norm(t))) || (!/=/.test(t) && !!(TD.tikzColor && TD.tikzColor(t.trim())));
// options that move a part node from its point (TikZ's above/left … set its anchor; positioning's right=of X, shifts):
// such a node stays code
const MOVES = /^(?:(?:above|below)(?:\s+(?:left|right))?|left|right|xshift|yshift|shift|at)(?:\s*=|$)/;
function nodeFrom(optStr: any, name: any, p: any, txt: any, st?: CzStyle) {
  const list = splitTop(optStr, ',').map((t) => t.trim()).filter(Boolean);
  // a part, or else text on its own (never an empty one: `\node (A) at (1,2) {};` names a point)
  const hit = partFor(list, 'node', st) || (String(txt || '').trim() && list.every(textOpt) ? { key: 'text', rest: list, as: '' } : null);
  if (!hit || !CZ.parts[hit.key]) return null;
  const it: Record<string, any> = { id: uid(), part: hit.key, p, rot: 0, flip: false, name: name || '', text: txt || '', opts: '' };
  if (hit.as) it.as = hit.as;
  // name= names it as (name) does; anchor= is held for a part when it is one of the part's anchors (else the node stays
  // code), and placed as a text node's side
  const rest0: string[] = [];
  for (const t of hit.rest) {
    const nm = /^name\s*=\s*(.+)$/.exec(t.trim()), an = hit.key !== 'text' && /^anchor\s*=\s*(.+)$/.exec(t.trim());
    if (nm) it.name = unbrace(nm[1].trim());
    else if (an) { const a = unbrace(an[1].trim()); if (!anchorAt(hit.key, a)) return null; if (a !== 'center') it.anc = a; }
    else if (hit.key !== 'text' && MOVES.test(norm(t))) return null;
    else rest0.push(t);
  }
  hit.rest = rest0;
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
// (of them, the ones a part's voltage and current marks are drawn with)
const VMARK_OPT = /^(?:(?:american|european|straight|raised) voltages|voltage dir\s*=\s*\w+)$/;
const STYLE_OPT = /^(?:american|european|(?:american|european|straight|raised|curved) voltages|(?:american|european) (?:currents|resistors)|(?:american|european|cute) inductors|(?:full|empty|stroke) diodes?|(?:american|european|ieee) ports|logic ports\s*=\s*\w+|voltage dir\s*=\s*\w+|(?:voltage|current|resistor|inductor|diode)\s*=\s*\w+)$/;
function readStmt(stmt: any, coord: any, named: any, st?: CzStyle, pos?: { nd: number[] | number | null; grid?: boolean; isPoint: (n: string) => boolean }) {
  const T0 = tokens(stmt);
  if (!T0 || !T0.length) return null;
  const T = T0; // narrowed for the hoisted step() below
  // a node's options, name and place, in any order (`\node at (1,2) [circ] {}` too), then its {text}:
  // { k: the token after it, opt, name, p (null without `at`), txt }
  // positioning's above=, below right=1cm of … on a part: the place is the other node's anchor on that side (or the
  // point named) moved by the distance, the part's own anchor on the other side there. Measured: right=of U1 puts
  // west at U1.east + (1, 0); `a and b` is vertical then horizontal, one length is that far straight or on the
  // diagonal (each way d/√2), a bare number is in cm. Options are read in order, so a later anchor= is the one held.
  const placed = (opt: string, names: any) => {
    const list = splitTop(opt, ',').map((x) => x.trim()).filter(Boolean);
    let p: number[] | null = null;
    for (let i = 0; i < list.length; i++) {
      const m = /^(above|below)?\s*(left|right)?\s*=\s*(?:(.*?)\s+)?of\s+(.+)$/.exec(list[i]);
      if (!m || !(m[1] || m[2]) || !pos) continue;
      if (pos.grid || list.some((x) => /^on grid\b(?!\s*=\s*false)/.test(x))) return null;
      const v = m[1] === 'above' ? 1 : m[1] === 'below' ? -1 : 0, h = m[2] === 'right' ? 1 : m[2] === 'left' ? -1 : 0;
      const side = [m[1] === 'above' ? 'north' : m[1] === 'below' ? 'south' : '', m[2] === 'right' ? 'east' : m[2] === 'left' ? 'west' : ''].filter(Boolean).join(' ');
      const back = side.replace(/north|south|east|west/g, (w) => ({ north: 'south', south: 'north', east: 'west', west: 'east' } as any)[w]);
      const d = m[3] ? distSpec(m[3]) : pos.nd, ref = m[4].trim().replace(/^\{(.*)\}$/, '$1');
      if (d == null) return null;
      const [dv, dh] = Array.isArray(d) ? d : v && h ? [d / Math.SQRT2, d / Math.SQRT2] : [d, d];
      const at = names.get(`${ref}.${side}`) || (/\./.test(ref) || pos.isPoint(ref) ? names.get(ref) : null);
      if (!at) return null;
      p = [r6(at[0] + h * dh), r6(at[1] + v * dv)];
      list[i] = `anchor=${back}`;
    }
    return { opt: list.join(', '), p };
  };
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
    const pl = placed(n.opt, named());
    const it = pl && nodeFrom(pl.opt, n.name, pl.p || n.p || [0, 0], n.txt, st);
    return it ? [it] : null;
  }
  if (T[0] !== '\\draw' && T[0] !== '\\path') return null;
  const out: any[] = [];
  let names = named(), k = 1, base: any = null, start: any = null;
  // \draw[…]: line and colour options go on every part drawn; style keys only say what the names stand for, but the
  // voltage style and direction, which each part draws its marks with
  let dopts: string[] = [];
  if (T[k] && T[k][0] === '[') {
    const list = splitTop(T[k++].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
    if (!list.every((x) => LINE_OPT.test(norm(x)) || STYLE_OPT.test(norm(x)) || (!/=/.test(x) && TD.tikzColor && TD.tikzColor(x)))) return null;
    st = styleWith(st || STYLE0, list.join(','));
    dopts = list.filter((x) => !STYLE_OPT.test(norm(x)) || VMARK_OPT.test(norm(x)));
  }
  // the coordinate at T[k]: absolute, ++(dx,dy) (moves the base) or +(dx,dy) (from the base, which stays)
  const at = () => {
    if (T[k] === 'cycle') { k++; if (!start) return null; base = start.slice(); return start.slice(); } // back to where this run began
    const rel = T[k] === '++' ? 2 : T[k] === '+' ? 1 : 0;
    if (rel) k++;
    const q = coord(T[k] || '', names);
    if (!q) return null;
    k++;
    if (rel) { if (!base || !/^\(\s*(?:-?[\d.]|(?:right|up|left|down|east|north|west|south)\s*:)/.test(T[k - 1])) return null; q[0] += base[0]; q[1] += base[1]; }
    if (rel !== 1) base = q.slice();
    return q;
  };
  const wire = (a: any, b: any) => ({ id: uid(), part: 'short', a, b, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
  const defs: any[] = []; // [name, point, bare] the path defines
  let cur = at();
  if (!cur) return null;
  start = cur.slice();
  // A piece of the path the circuit can't hold is kept as a path of its own from where the pen was: a node, pic or
  // coordinate there (the pen stays, and the path reads on after it), or else the rest of the path. Not a node placed
  // along the step before it (pos=, midway …) nor a path that closes with cycle: those need the path whole.
  const rest: string[] = [], head = T[0] + (T[1][0] === '[' ? T[1] : '');
  // (a step relative to the last point can't start afresh where a +(x,y) left the pen: the path is kept whole)
  const keep = (k0: number, k1: number) => {
    if (base && !same(base, cur) && T.slice(k0, k1).some((x: string) => x === '+' || x === '++')) return false;
    rest.push(`${head} (${f(cur[0])},${f(cur[1])}) ${stmt.slice(T.pos[k0], k1 < T.length ? T.pos[k1] : stmt.length).trim()};`);
    return true;
  };
  const along = (k0: number, k1: number) => T.slice(k0, k1).some((x: string) => x[0] === '[' && /\b(?:pos|midway|near start|near end|very near start|very near end|at start|at end|sloped)\b/.test(x));
  const ends = (k0: number) => {
    // where a node, pic or coordinate that starts at k0 ends
    let j = k0 + 1;
    for (; j < T.length && T[j][0] !== '{'; j++) {
      if (T[j] === 'at') j++;
      else if (T[j][0] !== '[' && T[j][0] !== '(') return -1;
      if (T[k0] === 'coordinate' && T[j] && T[j][0] === '(') return j + 1;
    }
    return T[k0] === 'coordinate' || j >= T.length ? -1 : j + 1;
  };
  while (k < T.length) {
    const k0 = k;
    if (step()) continue;
    const e = ['node', 'pic', 'coordinate'].includes(T[k0]) ? ends(k0) : -1;
    if (T.slice(k0).includes('cycle') || along(k0, e < 0 ? T.length : e)) return null;
    if (!keep(k0, e < 0 ? T.length : e)) return null;
    if (e < 0) break;
    k = e;
  }
  if (dopts.length) for (const it of out) it.opts = [it.opts, ...dopts].filter(Boolean).join(', ');
  if (!out.length) return null;
  (out as any).defs = defs;
  (out as any).rest = rest;
  return out;
  // one piece of the path at T[k]: read (true, k past it) or not (false)
  function step() {
    const t = T[k];
    // a coordinate on its own moves the pen: `(0,0) to[R] (2,0) (0,1) to[C] (2,1)`
    if (t[0] === '(' || t === '++' || t === '+') { const q = at(); if (!q) return false; cur = q; start = q.slice(); return true; }
    if (t === '{}') { k++; return true; } // an empty group
    if (t === 'node') {
      // \draw (x,y) node[opts] (name) {text}
      const n = nodeAt(k + 1, names);
      if (!n) return false;
      // an empty node with no options names a point: its centre (TikZ ends a path at its border)
      // (kept as code too, so code that is not the circuit's finds it, borders and all)
      if (!n.opt.trim() && !String(n.txt).trim() && !n.p) {
        if (n.name) { keep(k, n.k); defs.push([n.name, cur.slice(), false]); names = new Map([...names, [n.name + '.center', cur.slice()]]); }
        k = n.k;
        return true;
      }
      const pl = placed(n.opt, names);
      const it = pl && nodeFrom(pl.opt, n.name, pl.p || n.p || cur.slice(), n.txt, st);
      if (!it) return false;
      k = n.k;
      out.push(it);
      // its anchors are known to the rest of the path
      if (it.name && it.part !== 'text') names = new Map([...names, ...Object.entries<any>(anchorsOf(it)).map(([nm, p]) => [`${it.name}.${nm}`, p] as [string, any])]);
      return true;
    }
    if (t === 'coordinate') {
      // coordinate (n) names where the pen is, for the rest of the path and the statements after it
      // (its label=side:text is a text node on that side of it: a coordinate has no size)
      let j = k + 1, lab = null;
      if (T[j] && T[j][0] === '[') {
        const o = T[j].slice(1, -1).trim(), m = /^label\s*=\s*\{?\s*((?:above|below)(?: (?:left|right))?|left|right)\s*:([\s\S]*?)\}?$/.exec(o);
        if (o && !m) return false;
        if (m) lab = nodeFrom(m[1], '', cur.slice(), m[2].trim(), st);
        if (m && !lab) return false;
        j++;
      }
      if (!T[j] || T[j][0] !== '(' || (T[j + 1] && T[j + 1][0] === '{')) return false;
      const n = T[j].slice(1, -1).trim();
      if (lab) out.push(lab);
      defs.push([n, cur.slice(), true]); names = new Map([...names, [n, cur.slice()]]);
      k = j + 1;
      return true;
    }
    if (t === 'to' && !(T[k + 1] && T[k + 1][0] === '[')) {
      // a plain `to` is a straight line, a wire
      const k0 = k;
      k++;
      const q = at();
      if (!q) { k = k0; return false; }
      out.push(wire(cur, q)); cur = q; return true;
    }
    if (t === '--' || t === '-|' || t === '|-') {
      // a corner (-| across then up, |- up then across) is two wires
      const k0 = k, b0 = base;
      k++;
      const q = at();
      if (!q) { k = k0; base = b0; return false; }
      const c = t === '-|' ? [q[0], cur[1]] : t === '|-' ? [cur[0], q[1]] : null;
      if (c && !same(c, cur) && !same(c, q)) out.push(wire(cur, c), wire(c, q));
      else out.push(wire(cur, q));
      cur = q; return true;
    }
    if (t === 'to' && T[k + 1] && T[k + 1][0] === '[' && /^\[\s*T(?:npn|pnp|nmos|pmos|nfet|pfet|nigbt|pigbt)\s*[,\]]/.test(T[k + 1])) {
      // to[Tnpn] (pgfcircpath.tex, \pgf@circ@trans@path): the transistor at the middle, turned by the path's angle
      // − 90 (rounded), mirrored by `mirror`, wired from the start to its pathstart (0, −0.77) and from its pathend
      // (0, 0.77) to the end (the other way round when inverted), its label a plain node at the middle
      const list = splitTop(T[k + 1].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
      const k0 = k, b0 = base;
      k += 2;
      const q = at(), key = partByName(list[0].slice(1), 'node', st || STYLE0);
      let name = '', lab = '', mirror = false, inv = false, poles = '';
      const ok = list.slice(1).every((x) => {
        const m = /^(n|name|l)\s*=\s*([\s\S]*)$/.exec(x);
        if (m) { if (m[1] === 'l') lab = unbrace(m[2]); else name = unbrace(m[2]).trim(); return true; }
        if (x === 'mirror') return (mirror = true);
        if (x === 'invert') return (inv = true);
        if (/^[*o]?-[*o]?$/.test(x)) { poles = x; return true; }
        return false;
      });
      if (!q || !key || !ok) { k = k0; base = b0; return false; }
      const [a, b] = inv ? [q, cur] : [cur, q], ang = Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI - 90);
      const it: Record<string, any> = { id: uid(), part: key, p: [r6((a[0] + b[0]) / 2), r6((a[1] + b[1]) / 2)], rot: ((ang % 360) + 360) % 360, flip: mirror, name, text: '', opts: '' };
      const X = nodeXf(it), ps = X(0, -0.77).map(r6), pe = X(0, 0.77).map(r6), [pa, pb] = (/^([*o]?)-([*o]?)$/.exec(poles) || ['', '', '']).slice(1);
      // (\drawpoles: the left pole where the path starts, the right one where it ends, inverted or not)
      const w1 = wire(a, ps), w2 = wire(pe, b), [p0, p1] = inv ? [pb, pa] : [pa, pb];
      if (p0) w1.poles = `${p0}-`;
      if (p1) w2.poles = `-${p1}`;
      out.push(it, w1, w2);
      if (lab) out.push(nodeFrom('', '', it.p.slice(), lab, st));
      if (name) names = new Map([...names, ...Object.entries<any>(anchorsOf(it)).map(([nm, p]) => [`${name}.${nm}`, p] as [string, any])]);
      cur = q; return true;
    }
    if (t === 'to' && T[k + 1] && T[k + 1][0] === '[') {
      const list = splitTop(T[k + 1].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
      const k0 = k, b0 = base;
      k += 2;
      const q = at();
      const hit = partFor(list, 'bipole', st);
      // (v= and i= take their direction from the voltage dir set when they are read: one after them is kept as code)
      const vd = list.findIndex((x) => /^voltage dir\s*=/.test(norm(x)));
      if (vd > 0 && list.slice(0, vd).some((x, j) => (!j && /=/.test(x)) || /^(?:v|i)[_^<>]{0,3}\s*=/.test(x))) { k = k0; base = b0; return false; }
      if (!q || !hit) { k = k0; base = b0; return false; }
      const it: Record<string, any> = { id: uid(), part: hit.key, a: cur, b: q, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' };
      if (hit.as) it.as = hit.as;
      if (hit.lab) it[({ v: 'v', i: 'i' } as Record<string, string>)[srcKind(hit.key)] || 'l'] = hit.lab;
      const opts = [];
      for (const x of hit.rest) {
        const m = /^(l|a|v|i|n|name)\s*=\s*([\s\S]*)$/.exec(x), vi = /^(v|i)([_^<>]{1,3})\s*=\s*([\s\S]*)$/.exec(x);
        if (vi) { it[vi[1]] = unbrace(vi[3]); it[vi[1] + 'm'] = vi[2]; }
        else if (m) it[({ l: 'l', a: 'ann', v: 'v', i: 'i', n: 'name', name: 'name' } as Record<string, any>)[(m[1] as any)]] = unbrace(m[2]);
        else if (/^[*o]?-[*o]?$/.test(x)) it.poles = x;
        else opts.push(x);
      }
      it.opts = opts.join(', ');
      out.push(it);
      if (it.name) names = new Map([...names, ...Object.entries<any>(pinsOf(it)).map(([n, p]) => [`${it.name}.${n}`, p])]);
      cur = q; return true;
    }
    return false;
  }
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
  const b = itemsBox(s.items || [], { size: s.size, font: s.font, ...markStyle(s.raw) });
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
    out = itemsSvg(s.items, (x: any, y: any) => [x * PX, -y * PX], PX, { color: col, paper: ctx.paper || '#ffffff', ctx, st: { size: s.size || 'normalsize', font: s.font || 'default', ...markStyle(s.raw) } });
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
TD.cz = { markOf, markMods, vstyleOf, markStyle, anchorsOf, voltageArc: (it: any) => voltageArc(it, CZ.parts[it.part], CZ.geom(it.part)), styleOpt: (x: string) => STYLE_OPT.test(norm(x)), splitTop, colorOf, pinsOf, nodeXf, bipXf, xfOf, itemsSvg, itemsBox, code, parse, layout, same, uid, isWire, NODE_R, RLEN, defaultItems };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("cz", {
  menu: { order: 4, group: 'electronics', label: "Circuit", title: "Circuit, drawn with circuitikz parts", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M4 18V6h7M21 6h7v12H4\"/><path d=\"M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3\" class=\"c1\"/><path d=\"M14 18v-3M18 18v-3\" class=\"c1\"/><path d=\"M12 15h8M12 21h8\" class=\"c1\"/></svg>" },
  fixed: true,
  editor: { get: () => TD.czEditor, alias: "czOpen", apply: (s, result) => { s.items = result.items; s.raw = result.raw; } }
});
export { isWire, fullCode };
