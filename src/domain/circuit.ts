export let panelServices: any;
import { runtime as TD } from '../runtime';
// Circuit block: a schematic drawn with circuitikz parts (czcore.ts + czparts-*.ts) and exported as
// circuitikz code. The block holds a list of items in its own frame (cm, y up, origin at (s.x, s.y)):
//   bipole { id, part, a: [x, y], b: [x, y], l, ann, v, i, poles, name, opts }  → \draw (a) to[…] (b);
//   node   { id, part, p: [x, y], rot, flip, name, text, opts }               → \node[…] (name) at (p) {text};
// plus raw lines it could not read back (kept verbatim). A bipole's end that sits on a named node's pin
// is written as (Name.pin), so the wire meets the pin in LaTeX as it does here.
// The circuit is edited in its own overlay editor (czeditor.ts), opened by double-clicking the block.
(function () {
  const CZ = TD.CZ;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;
  const RLEN = 1.4, NODE_R = 0.04 * RLEN;
  const EPS = 1e-3;
  const f = (n: any) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? '0' : String(v); };
  const same = (p: any, q: any) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------------------------------------------------------------- geometry
  // node frame: mirror (xscale=-1) first, then rotate counter-clockwise, then move to p
  function nodeXf(it: any) {
    const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), fx = it.flip ? -1 : 1;
    return (x: any, y: any) => { x *= fx; return [it.p[0] + x * c - y * s, it.p[1] + x * s + y * c]; };
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
    for (const it of items) {
      const def = CZ.parts[it.part], ic = colorOf(it), c = o.colorOf ? o.colorOf(it, ic) : ic ? TD.css(ic) : col;
      let s = '';
      if (it.p) {
        if (!def) { const [X, Y] = m(it.p[0], it.p[1]); s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(0.15 * k)}" fill="none" stroke="${c}" stroke-dasharray="2 2"/>`; }
        else { const T = nodeXf(it); s += CZ.svg(CZ.geom(it.part), (x: any, y: any) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k }); }
      } else {
        const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]), w = def ? Math.min(def.w || 0, L) : 0;
        const T = bipXf(it), [ax, ay] = m(...it.a), [bx, by] = m(...it.b);
        if (!def || w <= 0) s += `<path d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"${def ? '' : ' stroke-dasharray="3 3"'}/>`;
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
    for (const m of String(raw || '').matchAll(/voltage\s*=\s*(american|european|straight|raised|curved)\b|\b(american|european|straight|raised)\s+voltages\b/g)) v = VSTYLE[m[1] || m[2]];
    return v;
  }
  const colorOf = (it: any) => optsOf(it).color || null;
  // sources: 'v' (a voltage source), 'i' (a current source) or ''
  const srcKind = (part: any) => (!/^src:/.test(part) || /nullator|norator/.test(part) ? '' : /^src:c?isource/.test(part) ? 'i' : 'v');
  // circuitikz's defaults (no `oldvoltagedirection`): a part's voltage below and forward, a voltage source's above,
  // a current source's backward; `^ _` pick the side, `> <` the direction
  function voltOf(it: any, ox: any) {
    const o = ox.v || (it.v ? { mods: '', t: it.v } : null);
    if (!o) return null;
    const k = srcKind(it.part), md = o.mods;
    return { t: o.t, s: md.includes('^') ? 1 : md.includes('_') ? -1 : k === 'v' ? 1 : -1, back: md.includes('<') ? true : md.includes('>') ? false : k === 'i', gen: k === 'v' };
  }
  // currents: forward after the part above the wire; on a voltage source backward and before it.
  // `i<` is backward and before; with a side too, the order says where: `i>_` before, `i_>` after
  function currOf(it: any, ox: any) {
    const o = ox.i || (it.i ? { mods: '', t: it.i } : null);
    if (!o) return null;
    const vs = srcKind(it.part) === 'v', md = o.mods, pi = md.search(/[_^]/), di = md.search(/[<>]/);
    let back = vs, before = vs;
    if (di >= 0) { back = md[di] === '<'; before = pi < 0 ? back : di < pi; }
    return { t: o.t, s: md[pi] === '_' ? -1 : 1, back, before };
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
  // where the labels go: l (and i) on the left of the path, a and v on the right; node text at its centre.
  // Spots: { t, at, dir } plus arc (a curved arrow), line (a straight one) or arrow (the current's, on the wire)
  function labelSpots(it: any, st: any) {
    const def = CZ.parts[it.part], G = def && CZ.geom(it.part);
    const spots: any[] = [];
    if (it.p) {
      if (!it.text) return spots;
      // circuitikz: the text of a ground symbol sits above its pin, a supply's beyond its arrow, a transistor's to the side
      const T = nodeXf(it), up = (sgn: any, x: any, y: any) => { const a = T(0, 0), b = T(0, sgn); return { t: it.text, at: T(x, y), dir: [b[0] - a[0], b[1] - a[1]] }; };
      if (it.part === 'ground:vcc') spots.push(up(1, 0, 0.42 + NODE_TXT));
      else if (it.part === 'ground:vee') spots.push(up(-1, 0, -0.42 - NODE_TXT));
      else if (/^ground:/.test(it.part)) spots.push(up(1, 0.26, -0.16)); // a ground's text hangs off the pin's upper right
      else if (/^trans:/.test(it.part)) spots.push({ t: it.text, at: T(/mos|fet/.test(it.part) ? 0.36 : 0.45, 0), dir: [0, 0] });
      else spots.push({ t: it.text, at: it.p, dir: [0, 0] });
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
  function code(items: any, raw: any) {
    const lines = [], refs = pinRefs(items);
    const pt = (q: any) => { const r = refs.find(([p]) => same(p, q)); return r ? r[1] : `(${f(q[0])},${f(q[1])})`; };
    for (const it of items) {
      const def = CZ.parts[it.part];
      if (!def || !it.p) continue;
      const o = [def.tikz];
      if (it.rot) o.push(`rotate=${f(it.rot)}`);
      if (it.flip) o.push('xscale=-1');
      if (it.opts) o.push(it.opts);
      lines.push(`\\node[${o.join(', ')}]${it.name ? ` (${it.name})` : ''} at (${f(it.p[0])},${f(it.p[1])}) {${it.text || ''}};`);
    }
    for (const it of items) {
      const def = CZ.parts[it.part];
      if (!def || it.p) continue;
      const o = [];
      if (it.l) o.push(`l=${brace(it.l)}`);
      if (it.ann) o.push(`a=${brace(it.ann)}`);
      if (it.v) o.push(`v=${brace(it.v)}`);
      if (it.i) o.push(`i=${brace(it.i)}`);
      if (it.name) o.push(`n=${it.name}`);
      if (it.poles && it.poles !== '-') o.push(it.poles);
      if (it.opts) o.push(it.opts);
      if (isWire(it) && !o.length) lines.push(`\\draw ${pt(it.a)} -- ${pt(it.b)};`);
      else lines.push(`\\draw ${pt(it.a)} to[${[def.tikz, ...o].join(', ')}] ${pt(it.b)};`);
    }
    // \ctikzset / \tikzset lines go first: they set the style of everything drawn after them
    if (raw && raw.trim()) {
      const R = raw.replace(/\s+$/, '').split('\n'), set = (l: any) => /^\s*\\(ctikzset|tikzset)\b/.test(l);
      lines.unshift(...R.filter(set)); lines.push(...R.filter((l: any) => !set(l)));
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
  const norm = (t: any) => t.trim().replace(/\s+/g, ' ').toLowerCase();
  let tikzIndex: any = null;
  function partFor(list: any, kind: any) {
    if (!tikzIndex) {
      tikzIndex = CZ.order.map((k: any) => ({ k, kind: CZ.parts[k].kind, t: splitTop(CZ.parts[k].tikz, ',').map(norm) }));
      tikzIndex.sort((a: any, b: any) => b.t.length - a.t.length);
    }
    // the part's name usually comes first, but `to[american voltages, R]` is fine too
    const L = list.map(norm);
    for (let j = 0; j < L.length; j++)
      for (const e of tikzIndex) if (e.kind === kind && e.t.every((t: any, i: any) => L[j + i] === t)) return { key: e.k, rest: [...list.slice(0, j), ...list.slice(j + e.t.length)] };
    return null;
  }
  const unbrace = (v: any) => v.trim().replace(/^\{([\s\S]*)\}$/, '$1');
  function parse(src: any) {
    const items: any[] = [], raw = [];
    const text = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const coords = new Map(); // \coordinate (name) at (x,y);
    const named = () => {
      const m = new Map(coords);
      for (const it of items) if (it.name) for (const [n, q] of Object.entries<any>(pinsOf(it))) { m.set(`${it.name}.${n}`, q); if (n === 'center') m.set(it.name, q); }
      return m;
    };
    const coord = (t: any, names: any) => {
      const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(t.trim());
      if (m) return [+m[1], +m[2]];
      const n = /^\(\s*([^()]+?)\s*\)$/.exec(t.trim());
      if (n && names.has(n[1])) return names.get(n[1]).slice();
      return null;
    };
    for (let stmt of splitTop(text, ';')) {
      let orig = stmt.trim();
      if (!orig) continue;
      // settings ahead of the statement (\ctikzset{…} needs no semicolon): kept as written, on lines of their own
      let m;
      while ((m = /^\\(ctikzset|tikzset|usetikzlibrary)\s*\{/.exec(stmt.trim()))) {
        const t = stmt.trim(), j = closeAt(t, m[0].length - 1);
        if (j < 0) break;
        raw.push(t.slice(0, j + 1)); stmt = t.slice(j + 1);
      }
      if (!stmt.trim()) continue;
      orig = stmt.trim();
      // a named coordinate: kept as written, and its name is known to the statements after it
      const cm = /^\\coordinate\s*\(\s*([^()]+?)\s*\)\s*at\s*(\([^()]*\))$/.exec(orig);
      if (cm) { const q = coord(cm[2], named()); if (q) coords.set(cm[1], q); raw.push(orig + ';'); continue; }
      const got = readStmt(orig, coord, named);
      if (got) items.push(...got); else raw.push(orig + ';');
    }
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
  function nodeFrom(optStr: any, name: any, p: any, txt: any) {
    const list = splitTop(optStr, ',').map((t) => t.trim()).filter(Boolean);
    const hit = partFor(list, 'node');
    if (!hit) return null;
    const it = { id: uid(), part: hit.key, p, rot: 0, flip: false, name: name || '', text: txt || '', opts: '' };
    const rest = [];
    for (const t of hit.rest) {
      const r = /^rotate\s*=\s*(-?[\d.]+)$/.exec(t);
      if (r) it.rot = ((+r[1] % 360) + 360) % 360;
      else if (/^xscale\s*=\s*-1$/.test(t)) it.flip = !it.flip;
      else rest.push(t);
    }
    it.opts = rest.join(', ');
    return it;
  }
  function readStmt(st: any, coord: any, named: any) {
    const T = tokens(st);
    if (!T || !T.length) return null;
    if (T[0] === '\\node') {
      // \node[opts] (name) at (x,y) {text}
      let k = 1, opt = '', name = '', p = null, txt = null;
      if (T[k] && T[k][0] === '[') opt = T[k++].slice(1, -1);
      if (T[k] && T[k][0] === '(') name = T[k++].slice(1, -1).trim();
      if (T[k] === 'at') { p = coord(T[k + 1] || '', named()); k += 2; }
      if (T[k] && T[k][0] === '{') txt = T[k++].slice(1, -1);
      if (k !== T.length || !p || txt == null) return null;
      const it = nodeFrom(opt, name, p, txt);
      return it ? [it] : null;
    }
    if (T[0] !== '\\draw' && T[0] !== '\\path') return null;
    const out = [];
    let names = named(), k = 1, base: any = null;
    // the coordinate at T[k]: absolute, ++(dx,dy) (moves the base) or +(dx,dy) (from the base, which stays)
    const at = () => {
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
    while (k < T.length) {
      const t = T[k];
      if (t === 'node') {
        // \draw (x,y) node[opts] (name) {text}
        let opt = '', name = '', txt = null;
        k++;
        if (T[k] && T[k][0] === '[') opt = T[k++].slice(1, -1);
        if (T[k] && T[k][0] === '(') name = T[k++].slice(1, -1).trim();
        if (T[k] && T[k][0] === '{') txt = T[k++].slice(1, -1);
        if (txt == null) return null;
        const it = nodeFrom(opt, name, cur.slice(), txt);
        if (!it) return null;
        out.push(it);
        continue;
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
        const hit = partFor(list, 'bipole');
        if (!q || !hit) return null;
        const it: Record<string, any> = { id: uid(), part: hit.key, a: cur, b: q, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' };
        const rest = [];
        for (const x of hit.rest) {
          const m = /^(l|a|v|i|n)\s*=\s*([\s\S]*)$/.exec(x);
          if (m) it[({ l: 'l', a: 'ann', v: 'v', i: 'i', n: 'name' } as Record<string, any>)[(m[1] as any)]] = unbrace(m[2]);
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
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

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
      return `\\begin{scope}[${o.join(', ')}]\n${body.split('\n').map((l) => '  ' + l).join('\n')}\n\\end{scope}`;
    },
  };

  

  TD.cz = { vstyleOf, colorOf, pinsOf, nodeXf, bipXf, xfOf, itemsSvg, itemsBox, code, parse, layout, same, uid, isWire, NODE_R, RLEN, defaultItems };
  // Application integration belongs to the block, alongside its model and panel.
  TD.blocks.register("cz", {
    menu: { order: 4, label: "Circuit", title: "Circuit, drawn with circuitikz parts", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M4 18V6h7M21 6h7v12H4\"/><path d=\"M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3\" class=\"c1\"/><path d=\"M14 18v-3M18 18v-3\" class=\"c1\"/><path d=\"M12 15h8M12 21h8\" class=\"c1\"/></svg>" },
    fixed: true,
    editor: { get: () => TD.czEditor, alias: "czOpen", apply: (s, result) => { s.items = result.items; s.raw = result.raw; } }
  });
  panelServices = { isWire, fullCode };
})();
