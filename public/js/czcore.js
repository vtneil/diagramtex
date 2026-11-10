// circuitikz part library core: how a part's body is drawn and where its pins are.
// DOM-free (scripts/cz-sheet.js runs it in Node). The part files (czparts-*.js) register parts with
// TD.CZ.part({...}); the Circuit block (circuit.js) draws them and writes circuitikz.
//
// Units are centimetres with y UP (TikZ's convention), origin at the part's centre:
//  - bipole: the middle of the body; x runs along the path from its start to its end, so the body spans
//    x = -w/2 .. w/2 and the framework draws the leads out to the path's ends.
//  - node: circuitikz's `center` anchor (where `node[...] at (x,y)` puts it); pins are its anchors.
(function () {
  const TD = (window.TD = window.TD || {});
  const CZ = (TD.CZ = { parts: {}, order: [] });

  // categories, in palette order: [key, title]
  CZ.CATS = [
    ['wires', 'Wires & nodes'], ['res', 'Resistors'], ['cap', 'Capacitors'], ['ind', 'Inductors & transformers'],
    ['diode', 'Diodes'], ['trans', 'Transistors'], ['opamp', 'Op-amps'], ['src', 'Sources & cells'],
    ['switch', 'Switches & jumpers'], ['fuse', 'Fuses & protection'], ['ground', 'Grounds & supplies'],
    ['meter', 'Meters & devices'], ['audio', 'Audio & acoustics'], ['rf', 'Antennas & RF'], ['filter', 'Filters'],
    ['gen', 'Generators'], ['emech', 'Electro-mechanical'], ['dsp', 'Signal & DSP'], ['power', 'Power converters'],
    ['conn', 'Connectors'], ['ic', 'ICs & packages'], ['logic', 'Logic gates'], ['ff', 'Flip-flops'], ['mech', 'Mechanics'],
  ];

  // def: { key, name, cat, kind: 'bipole'|'node', tikz, w (bipole body length, cm), pins {name: [x, y]},
  //        draw(g), text (node takes text content), opts (extra circuitikz options), keywords }
  CZ.part = function (def) {
    if (!def.key || !def.draw) throw new Error('circuit part needs key and draw: ' + def.key);
    if (CZ.parts[def.key]) throw new Error('duplicate circuit part: ' + def.key);
    def.kind = def.kind || 'bipole';
    def.pins = def.pins || {};
    CZ.parts[def.key] = def;
    CZ.order.push(def.key);
    return def;
  };

  // ---------- drawing context (cm, y up) ----------
  // A part's draw(g) builds subpaths; each subpath has a paint: 'stroke' (default), 'ink' (filled with
  // the line colour), 'paper' (filled with the background, outlined), 'grey' (filled light grey, outlined)
  // and a line width factor (1 = the component line width).
  function ctx() {
    const subs = [], texts = [];
    let cur = null, lw = 1;
    const sub = () => { cur = { segs: [], paint: 'stroke', lw, closed: false }; subs.push(cur); return cur; };
    const g = {
      subs, texts,
      // line width factor for the subpaths that follow (e.g. 2 for a thick plate)
      width(k = 1) { lw = k; return g; },
      M(x, y) { sub().segs.push(['M', x, y]); return g; },
      L(x, y) { cur.segs.push(['L', x, y]); return g; },
      C(x1, y1, x2, y2, x, y) { cur.segs.push(['C', x1, y1, x2, y2, x, y]); return g; },
      // quadratic Bézier from the current point, as a cubic
      Q(qx, qy, x, y) {
        const p = cur.segs[cur.segs.length - 1], px = p[p.length - 2], py = p[p.length - 1];
        return g.C(px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
      },
      Z() { cur.segs.push(['Z']); cur.closed = true; return g; },
      // paint of the current (last) subpath
      ink() { cur.paint = 'ink'; return g; },
      paper() { cur.paint = 'paper'; return g; },
      grey() { cur.paint = 'grey'; return g; },
      // open polyline / closed polygon through x0,y0,x1,y1,…
      line(...p) { g.M(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.L(p[i], p[i + 1]); return g; },
      poly(...p) { g.line(...p); return g.Z(); },
      rect(x1, y1, x2, y2) { return g.poly(x1, y1, x2, y1, x2, y2, x1, y2); },
      // elliptic arc centred (cx,cy), radii rx ry, from a1 to a2 degrees (counter-clockwise, y up).
      // cont: continue the current subpath (a line to the arc's start) instead of starting a new one
      arc(cx, cy, rx, ry, a1, a2, cont) {
        const P = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
        const D = (a) => [-rx * Math.sin(a), ry * Math.cos(a)];
        const A1 = (a1 * Math.PI) / 180, A2 = (a2 * Math.PI) / 180;
        const n = Math.max(1, Math.ceil(Math.abs(A2 - A1) / (Math.PI / 2) - 1e-9));
        const d = (A2 - A1) / n, k = (4 / 3) * Math.tan(d / 4);
        const s = P(A1);
        if (cont && cur) g.L(s[0], s[1]); else g.M(s[0], s[1]);
        for (let i = 0; i < n; i++) {
          const a = A1 + i * d, e = a + d, p0 = P(a), p1 = P(e), d0 = D(a), d1 = D(e);
          g.C(p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1]);
        }
        return g;
      },
      ellipse(cx, cy, rx, ry) { g.arc(cx, cy, rx, ry, 0, 360); return g.Z(); },
      circle(cx, cy, r) { return g.ellipse(cx, cy, r, r); },
      // sampled curve: f(t) → [x, y] for t in 0..1
      curve(f, n = 32) { for (let i = 0; i <= n; i++) { const [x, y] = f(i / n); i ? g.L(x, y) : g.M(x, y); } return g; },
      // filled arrowhead with its tip at (x,y) pointing along (dx,dy); len and half-width in cm
      head(x, y, dx, dy, len = 0.12, half = 0.05) {
        const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        return g.poly(x, y, x - ux * len - uy * half, y - uy * len + ux * half, x - ux * len + uy * half, y - uy * len - ux * half).ink();
      },
      // a line from (x1,y1) to (x2,y2) with an arrowhead at the end
      arrow(x1, y1, x2, y2, len, half) { g.line(x1, y1, x2, y2); return g.head(x2, y2, x2 - x1, y2 - y1, len, half); },
      // text centred at (x,y); size in cm (cap height ≈ 0.7 × size); o: { italic, bold, anchor: 'c'|'w'|'e', over }
      // `over` draws a bar over the text (Q̄). Text is preview only: circuitikz draws its own.
      text(x, y, str, size = 0.25, o = {}) { texts.push({ x, y, str, size, ...o }); return g; },
    };
    return g;
  }
  CZ.ctx = ctx;

  // A part drawn in its own frame: { subs, texts, pins, box: {x1,y1,x2,y2} } (cm, y up).
  const cache = new Map();
  CZ.geom = function (key) {
    if (cache.has(key)) return cache.get(key);
    const def = CZ.parts[key];
    if (!def) return null;
    const g = ctx();
    def.draw(g);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const grow = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
    for (const s of g.subs) for (const q of s.segs) for (let i = 1; i < q.length; i += 2) grow(q[i], q[i + 1]);
    for (const t of g.texts) { const hw = (t.str.length * t.size * 0.3), hh = t.size * 0.5; grow(t.x - hw, t.y - hh); grow(t.x + hw, t.y + hh); }
    for (const p of Object.values(def.pins)) grow(p[0], p[1]);
    if (def.kind === 'bipole') { const w = def.w || 0; grow(-w / 2, 0); grow(w / 2, 0); }
    if (!isFinite(x1)) { x1 = y1 = -0.1; x2 = y2 = 0.1; }
    const out = { subs: g.subs, texts: g.texts, pins: def.pins, box: { x1, y1, x2, y2 } };
    cache.set(key, out);
    return out;
  };

  // ---------- SVG ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  // subpaths → SVG d, through a mapping m(x,y) → [X, Y] (to screen px, y down)
  CZ.pathD = function (subs, m) {
    return subs.map((s) => s.segs.map((q) => {
      if (q[0] === 'Z') return 'Z';
      let o = q[0];
      for (let i = 1; i < q.length; i += 2) { const [X, Y] = m(q[i], q[i + 1]); o += (i > 1 ? ' ' : '') + r2(X) + ',' + r2(Y); }
      return o;
    }).join('')).join('');
  };
  // SVG for a geometry under mapping m; st: { stroke, width (px), paper, grey, scale (px per cm, for text) }
  CZ.svg = function (G, m, st) {
    const col = st.stroke || '#000', paper = st.paper || '#fff', grey = st.grey || '#d4d4d4';
    const byLw = new Map();
    let out = '';
    // filled parts first (paper / grey outlined, ink solid), then plain strokes grouped by width
    for (const s of G.subs) {
      if (s.paint === 'stroke') { const k = s.lw; if (!byLw.has(k)) byLw.set(k, []); byLw.get(k).push(s); continue; }
      const d = CZ.pathD([s], m), w = r2(st.width * s.lw);
      if (s.paint === 'ink') out += `<path d="${d}" fill="${col}" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
      else out += `<path d="${d}" fill="${s.paint === 'grey' ? grey : paper}" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
    }
    let strokes = '';
    for (const [k, list] of byLw) strokes += `<path d="${CZ.pathD(list, m)}" fill="none" stroke="${col}" stroke-width="${r2(st.width * k)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    // strokes under the fills, so a filled body hides the lead behind it
    out = strokes + out;
    for (const t of G.texts) {
      const [X, Y] = m(t.x, t.y), fs = r2(t.size * (st.scale || 40));
      const anc = t.anchor === 'w' ? 'start' : t.anchor === 'e' ? 'end' : 'middle';
      out += `<text x="${r2(X)}" y="${r2(Y)}" font-size="${fs}" font-family="'Latin Modern Roman','CMU Serif','Times New Roman',serif"${t.italic ? ' font-style="italic"' : ''}${t.bold ? ' font-weight="bold"' : ''} text-anchor="${anc}" dominant-baseline="central" fill="${col}"${t.over ? ' text-decoration="overline"' : ''}>${String(t.str).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    }
    return out;
  };

  // Palette icon: the part with short leads, fitted to a w×h viewBox
  CZ.icon = function (key, W = 44, H = 30) {
    const def = CZ.parts[key], G = CZ.geom(key);
    if (!G) return '';
    let { x1, y1, x2, y2 } = G.box;
    if (def.kind === 'bipole') { const lead = Math.max(0.25, (x2 - x1) * 0.18); x1 -= lead; x2 += lead; }
    const pad = 0.06, bw = x2 - x1 + 2 * pad, bh = y2 - y1 + 2 * pad, k = Math.min(W / bw, H / bh);
    const ox = (W - bw * k) / 2 - (x1 - pad) * k, oy = (H - bh * k) / 2 + (y2 + pad) * k;
    const m = (x, y) => [ox + x * k, oy - y * k];
    let leads = '';
    if (def.kind === 'bipole') {
      const w = def.w || 0, [a] = m(x1, 0), [b] = m(-w / 2, 0), [c] = m(w / 2, 0), [d, yy] = m(x2, 0);
      leads = `<path d="M${r2(a)},${r2(yy)}H${r2(b)}M${r2(c)},${r2(yy)}H${r2(d)}" fill="none" stroke="currentColor" stroke-width="1"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${leads}${CZ.svg(G, m, { stroke: 'currentColor', paper: 'var(--cz-paper, #fff)', width: 1, scale: k })}</svg>`;
  };
})();
