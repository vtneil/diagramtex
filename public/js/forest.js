// Trees written for the forest package. The source is the object: the bracket code is drawn here as
// vectors (an approximation of forest's packing) and exported unchanged inside \begin{forest}.
// The visual editor (js/fteditor.js) rewrites the code from the tree it holds.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  TD.FT_DEFAULT = [
    '\\begin{forest}',
    '  for tree={draw, rounded corners}',
    '  [Root',
    '    [Branch [Leaf] [Leaf]]',
    '    [Branch [Leaf]]',
    '  ]',
    '\\end{forest}',
  ].join('\n');

  // ---------------------------------------------------------------- parsing
  // index of the } closing the { at s[i], skipping escapes
  function close(s, i) {
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') d++;
      else if (c === '}' && --d === 0) return k;
    }
    return -1;
  }
  const stripComments = (src) => src.split('\n').map((l) => {
    for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); }
    return l;
  }).join('\n');
  // split at a character outside {groups}
  function splitTop(s, ch) {
    const out = [];
    let d = 0, a = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') d++;
      else if (c === '}') d--;
      else if (c === ch && d === 0) { out.push(s.slice(a, i)); a = i + 1; }
    }
    out.push(s.slice(a));
    return out;
  }
  const unbrace = (v) => { v = v.trim(); return v[0] === '{' && close(v, 0) === v.length - 1 ? v.slice(1, -1).trim() : v; };
  // "key=value" → { k, v, op ('', '+', '-', '*', ':'), prime }; a bare key has v null
  function opt(str) {
    const p = splitTop(str, '=');
    const raw = p[0].trim().replace(/\s+/g, ' ');
    if (p.length < 2) return { k: raw, v: null, op: '', prime: false };
    const m = /^(.*?)(')?([+\-*:]?)$/.exec(raw);
    return { k: m[1].trim(), prime: !!m[2], op: m[3], v: unbrace(p.slice(1).join('=')) };
  }
  const optList = (s) => splitTop(String(s || ''), ',').map((x) => x.trim()).filter(Boolean);

  function unwrap(src) {
    const t = stripComments(String(src || ''));
    const m = /\\begin\{forest\}([\s\S]*?)(\\end\{forest\}|$)/.exec(t);
    return m ? { wrapped: true, inner: m[1] } : { wrapped: false, inner: t };
  }
  // the bracket code → { pre: [options], root: node | null }; node: { c: content, o: [options], k: [children] }
  function parse(inner, warn = () => {}) {
    const s = inner;
    let start = -1, d = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') d++;
      else if (c === '}') d--;
      else if (c === '[' && d === 0) { start = i; break; }
    }
    const pre = optList(start < 0 ? s : s.slice(0, start));
    if (start < 0) return { pre, root: null };
    let j = start;
    // up to the first of `stops` outside {groups}
    const scan = (from, stops) => {
      let dd = 0, k = from;
      for (; k < s.length; k++) {
        const c = s[k];
        if (c === '\\') { k++; continue; }
        if (c === '{') dd++;
        else if (c === '}') dd--;
        else if (dd === 0 && stops.includes(c)) break;
      }
      return Math.min(k, s.length);
    };
    function node() {
      j++; // past [
      const n = { c: '', o: [], k: [] };
      let k = j;
      while (k < s.length && /\s/.test(s[k])) k++;
      let braced = false;
      // content in braces: {a, b}
      if (s[k] === '{') {
        const e = close(s, k);
        if (e > 0) {
          let q = e + 1;
          while (q < s.length && /\s/.test(s[q])) q++;
          if (q >= s.length || /[,[\]]/.test(s[q])) { n.c = s.slice(k + 1, e); braced = true; j = q; }
        }
      }
      if (!braced) { const e = scan(j, ',[]'); n.c = s.slice(j, e).trim(); j = e; }
      if (s[j] === ',') { const e = scan(j + 1, '[]'); n.o = optList(s.slice(j + 1, e)); j = e; }
      for (;;) {
        while (j < s.length && /\s/.test(s[j])) j++;
        if (j >= s.length) { warn('A ] is missing at the end of the tree'); return n; }
        if (s[j] === '[') { n.k.push(node()); continue; }
        if (s[j] === ']') { j++; return n; }
        const e = scan(j, '[]');
        warn(`Ignored “${s.slice(j, e).trim().slice(0, 24)}” between children`);
        j = e;
      }
    }
    const root = node();
    if (s.slice(j).trim()) warn('Only the first tree is drawn: there is code after it');
    return { pre, root };
  }

  // ---------------------------------------------------------------- writing
  // a content that would end early (a comma or bracket), or lose its braces, is written in braces
  function contentCode(c) {
    let d = 0;
    for (let i = 0; i < c.length; i++) {
      const ch = c[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') d++;
      else if (ch === '}') d--;
      else if (d === 0 && (ch === ',' || ch === '[' || ch === ']')) return `{${c}}`;
    }
    if (c[0] === '{' && close(c, 0) === c.length - 1) return `{${c}}`;
    return c;
  }
  const head = (n) => contentCode(n.c) + (n.o.length ? `, ${n.o.join(', ')}` : '');
  const inline = (n) => `[${head(n)}${n.k.map((k) => ' ' + inline(k)).join('')}]`;
  // one node per line, except a node whose children are all leaves and fit on the line
  function code(T) {
    const lines = [];
    if (T.pre.length) lines.push('  ' + T.pre.join(', '));
    const out = (n, ind) => {
      const one = inline(n);
      if (!n.k.length || (n.k.every((k) => !k.k.length) && ind.length + one.length <= 64)) { lines.push(ind + one); return; }
      lines.push(`${ind}[${head(n)}`);
      for (const k of n.k) out(k, ind + '  ');
      lines.push(`${ind}]`);
    };
    if (T.root) out(T.root, '  ');
    return `\\begin{forest}\n${lines.join('\n')}${lines.length ? '\n' : ''}\\end{forest}`;
  }
  // the code as it goes into LaTeX: always a full forest environment
  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{forest\}/.test(t) ? t : `\\begin{forest}\n${t}\n\\end{forest}`;
  }
  TD.ftCode = fullCode;

  // ---------------------------------------------------------------- style
  const SHAPES = new Set(['circle', 'ellipse', 'rectangle']);
  const DASH = { dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], dotted: [0.4, 2], 'densely dotted': [0.4, 1], 'loosely dotted': [0.4, 4], solid: null };
  const WIDTH = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  const SILENT = new Set(['name', 'anchor', 'parent anchor', 'child anchor', 'baseline', 'base', 'outer sep', 'outer xsep', 'outer ysep', 'delay', 's', 'fit', 'calign']);
  const DRAWN_ELSEWHERE = ['tikz', 'label', 'pin', 'tier', 'edge path', 'edge path\''];
  const SIZE_CMD = { tiny: 'tiny', scriptsize: 'scriptsize', footnotesize: 'footnotesize', small: 'small', normalsize: 'normalsize', large: 'large', Large: 'Large', LARGE: 'LARGE', huge: 'huge', Huge: 'Huge' };
  const GROW = { south: 270, north: 90, east: 0, west: 180, down: 270, up: 90, right: 0, left: 180 };

  // length with a unit → px; a bare number is pt. em: the tree's font size.
  function len(v, E) {
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(pt|em|ex|cm|mm|in|bp)?\s*$/.exec(String(v));
    if (!m) return NaN;
    const n = +m[1];
    return { pt: n / K, em: n * E, ex: n * E * 0.43, cm: n * PX, mm: n * PX / 10, in: n * 2.54 * PX, bp: n * 1.00375 / K }[m[2] || 'pt'];
  }
  const colorOf = (v) => (TD.tikzColor ? TD.tikzColor(v) : undefined);
  // edge options: arrows, colour, dash, width
  function edgeStyle(ed, list, warn) {
    for (const str of list) {
      const o = opt(str), k = o.k;
      if (o.v == null && k.includes('-') && !/\s/.test(k)) { // ->, <-, <->, -{Stealth}, -latex
        const i = k.lastIndexOf('-'), a = k.slice(0, i).trim(), b = k.slice(i + 1).trim();
        ed.start = !!a; ed.end = !!b;
      } else if (k === 'draw' && o.v === 'none') ed.none = true;
      else if ((k === 'draw' || k === 'color') && o.v != null) { const c = colorOf(o.v); if (c) ed.color = c; }
      else if (k in DASH && o.v == null) ed.dash = DASH[k];
      else if (k in WIDTH && o.v == null) ed.lw = WIDTH[k] / K;
      else if (k === 'line width') { const w = len(o.v, 10 / K); if (w > 0) ed.lw = w; }
      else if (o.v == null && colorOf(k)) ed.color = colorOf(k);
      else if (k !== 'draw') warn(`Not drawn: edge option “${k}”`);
    }
  }

  // ---------------------------------------------------------------- layout
  const cache = new Map();
  function layout(s) {
    const key = [s.src, s.size, s.font, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s);
    if (TD.measuring && TD.measuring()) return L; // text sizes may be placeholders in a measuring pass: don't keep them
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

  function build(s) {
    const warnings = [], warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const T = parse(unwrap(s.src).inner, warn);
    const size = s.size || 'normalsize', E = TD.sizePx(size);
    if (!T.root) return { empty: true, nodes: [], edges: [], bb: { x: 0, y: 0, w: 2 * PX, h: PX }, warnings, n: 0, levels: 0, G: [0, 1], U: [1, 0], grow: 270, rev: false, libs: [] };
    const libs = new Set();

    // effective options per node: inherited `for tree` / `for children` first, then its own
    const nodes = [];
    function walk(n, depth, parent, inh, fromParent) {
      const me = { n, i: nodes.length, depth, parent, kids: [] };
      nodes.push(me);
      const eff = [], sub = [], ch = [];
      const run = (list, own) => {
        for (const str of list) {
          const o = opt(str);
          if (o.k === 'for tree' && o.v != null) { run(optList(o.v), false); if (own) sub.push(...optList(o.v)); }
          else if (o.k === 'for descendants' && o.v != null) { if (own) sub.push(...optList(o.v)); }
          else if (o.k === 'for children' && o.v != null) { if (own) ch.push(...optList(o.v)); }
          else if (o.k === 'forked edges') { libs.add('edges'); if (own) sub.push('forked edge'); else eff.push(opt('forked edge')); }
          else if (/^(for |where |if )/.test(o.k) || /^(for|where|if)\b/.test(o.k)) warn(`Not drawn: ${o.k}`);
          else eff.push(o);
        }
      };
      run(inh, false);
      run(fromParent, false);
      if (parent < 0) run(T.pre, true);
      run(n.o, true);
      me.eff = eff;
      for (const c of n.k) me.kids.push(walk(c, depth + 1, me.i, [...inh, ...sub], ch).i);
      return me;
    }
    walk(T.root, 0, -1, [], []);

    // style of each node
    const IS = E / 3;
    for (const me of nodes) {
      const st = {
        content: me.n.c, draw: false, dc: null, shape: 'rect', rc: 0, fill: null, tc: null, dash: null, lw: 0.4 / K,
        isx: IS, isy: IS, mw: 0, mh: 0, tw: 0, align: null, size, font: s.font, bold: false, italic: false,
        edge: { color: null, dash: null, lw: 0.4 / K, start: false, end: false, none: false },
        roof: false, fork: false, folder: false, phantom: false,
        l: null, lsep: null, ssep: null, fsep: null, findent: null, grow: null, rev: null, calign: 'mid',
      };
      const setLen = (field, o, base) => {
        const v = len(o.v, E);
        if (!isFinite(v)) { warn(`Not drawn: ${o.k}=${o.v}`); return; }
        const cur = st[field] != null ? st[field] : base;
        st[field] = o.op === '+' ? cur + v : o.op === '-' ? cur - v : o.op === '*' ? cur * (+o.v || 1) : v;
      };
      for (const o of me.eff) {
        const k = o.k, v = o.v;
        if (k === 'draw') { if (v === 'none') st.draw = false; else { st.draw = true; if (v != null) { const c = colorOf(v); if (c) st.dc = c; } } }
        else if (SHAPES.has(k) && v == null) { st.shape = k === 'rectangle' ? 'rect' : k; if (k === 'ellipse') libs.add('tikz:shapes.geometric'); }
        else if (k === 'rounded corners') st.rc = v == null ? 4 / K : len(v, E) || 4 / K;
        else if (k === 'sharp corners') st.rc = 0;
        else if (k === 'fill') st.fill = v === 'none' ? null : colorOf(v) || null;
        else if (k === 'text' && v != null) st.tc = colorOf(v) || st.tc;
        else if (k === 'color' && v != null) { const c = colorOf(v); if (c) { st.tc = c; st.dc = c; } }
        else if (k in DASH && v == null) st.dash = DASH[k];
        else if (k in WIDTH && v == null) st.lw = WIDTH[k] / K;
        else if (k === 'line width') { const w = len(v, E); if (w > 0) st.lw = w; }
        else if (k === 'inner sep') { const w = len(v, E); if (w >= 0) st.isx = st.isy = w; }
        else if (k === 'inner xsep') { const w = len(v, E); if (w >= 0) st.isx = w; }
        else if (k === 'inner ysep') { const w = len(v, E); if (w >= 0) st.isy = w; }
        else if (k === 'minimum size') { const w = len(v, E); if (w > 0) st.mw = st.mh = w; }
        else if (k === 'minimum width') { const w = len(v, E); if (w > 0) st.mw = w; }
        else if (k === 'minimum height') { const w = len(v, E); if (w > 0) st.mh = w; }
        else if (k === 'text width') { const w = len(v, E); if (w > 0) st.tw = w; }
        else if (k === 'align') st.align = /center/.test(v || '') ? 'center' : /right/.test(v || '') ? 'right' : 'left';
        else if (k === 'font' && v != null) {
          if (/\\(bfseries|textbf)/.test(v)) st.bold = true;
          if (/\\(itshape|textit|slshape)/.test(v)) st.italic = true;
          if (/\\ttfamily/.test(v)) st.font = 'cmtt';
          if (/\\sffamily/.test(v)) st.font = 'cmss';
          const m = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(v);
          if (m) st.size = SIZE_CMD[m[1]];
        }
        else if (k === 'content' && v != null) st.content = v;
        else if (k === 'edge' && v != null) {
          // `edge=` replaces the inherited edge style (forest's keylist assignment); `edge+=` adds to it
          if (o.op !== '+') Object.assign(st.edge, { color: null, dash: null, lw: 0.4 / K, start: false, end: false });
          edgeStyle(st.edge, optList(v), warn);
        }
        else if (k === 'edge label' && v != null) {
          // edge label={node[midway, left]{yes}}: one node along the edge
          const m = /^\s*node\s*(?:\[([^\]]*)\])?\s*\{([\s\S]*)\}\s*$/.exec(v);
          if (m) st.elabel = { o: optList(m[1] || '').map((x) => opt(x)), t: m[2].trim() };
          else warn('Not drawn: edge label');
        } else if (k === 'no edge') st.edge.none = true;
        else if (k === 'phantom') st.phantom = true;
        else if (k === 'roof') { st.roof = true; libs.add('linguistics'); }
        else if (k === 'forked edge') { st.fork = true; libs.add('edges'); }
        else if (k === 'folder') { st.folder = true; libs.add('edges'); }
        else if (k === 'fork sep') setLen('fsep', o, E / 2);
        else if (k === 'folder indent') setLen('findent', o, 0.45 * E);
        else if (k === 'l') setLen('l', o, 2.3 * E);
        else if (k === 'l sep') setLen('lsep', o, IS);
        else if (k === 's sep') setLen('ssep', o, 2 * IS);
        else if (k === 'grow' && v != null) {
          const a = GROW[v.trim()] != null ? GROW[v.trim()] : parseFloat(v);
          if (isFinite(a)) { st.grow = a; st.rev = o.prime; } else warn(`Not drawn: grow=${v}`);
        } else if (k === 'reversed') st.rev = v == null || v === 'true';
        else if (k === 'calign') st.calign = /^first/.test(v || '') ? 'first' : /^last/.test(v || '') ? 'last' : 'mid';
        else if (SILENT.has(k)) { /* placement details forest handles itself */ }
        else if (DRAWN_ELSEWHERE.includes(k)) warn(`Not drawn: ${k}`);
        else if (v == null && colorOf(k)) { st.tc = colorOf(k); st.dc = colorOf(k); }
        else warn(`Not drawn: ${k}${v != null ? '=…' : ''}`);
      }
      // the text, its box (the line's leading taken off, as TeX's box has none) and the node around it
      const t = String(st.content).replace(/\\\\(\[[^\]]*\])?\s*/g, '\n').trim();
      me.t = t;
      me.ts = { size: st.size, font: st.font, bold: st.bold, italic: st.italic, tw: st.tw || 0, align: st.align || 'center' };
      const b = t ? TD.textBox(t, me.ts) : { w: 0, h: 0 };
      const tw = st.tw > 0 ? st.tw : b.w, th = t ? Math.max(0, b.h - 0.22 * TD.sizePx(st.size)) : 0;
      let w = tw + 2 * st.isx, h = th + 2 * st.isy;
      if (st.shape === 'circle') w = h = Math.hypot(tw + 2 * st.isx, th + 2 * st.isy);
      else if (st.shape === 'ellipse') { w *= Math.SQRT2; h *= Math.SQRT2; }
      w = Math.max(w, st.mw); h = Math.max(h, st.mh);
      if (st.shape === 'circle') w = h = Math.max(w, h);
      me.w = w; me.h = h; me.st = st;
    }

    // growth direction: the root's (forest lets each node turn; here the tree keeps one)
    const R0 = nodes[0].st;
    const grow = R0.grow != null ? R0.grow : 270, rev = !!R0.rev;
    const ga = grow * Math.PI / 180, ua = (grow + (rev ? -90 : 90)) * Math.PI / 180;
    const cl = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    const G = [cl(Math.cos(ga)), cl(-Math.sin(ga))], U = [cl(Math.cos(ua)), cl(-Math.sin(ua))];
    for (const me of nodes) {
      me.hd = Math.abs(G[0]) * me.w / 2 + Math.abs(G[1]) * me.h / 2;
      me.hs = Math.abs(U[0]) * me.w / 2 + Math.abs(U[1]) * me.h / 2;
    }

    // packing: each subtree is a list of boxes (d: along the growth, s: across) round its root; siblings
    // are pushed apart until no boxes that share a band of d come closer than s sep
    const sub = (me) => {
      const own = { d1: -me.hd, d2: me.hd, s1: -me.hs, s2: me.hs };
      if (!me.kids.length) return [own];
      const st = me.st, kids = me.kids.map((i) => ({ c: nodes[i], b: sub(nodes[i]) }));
      const ssep = st.ssep != null ? st.ssep : 2 * IS;
      const out = [own];
      if (st.folder) {
        // children stacked under the parent, indented, each in its own band
        const fi = st.findent != null ? st.findent : 0.45 * E;
        const trunk = -me.hd + fi + st.isx;
        let cur = me.hs + ssep / 2;
        for (const k of kids) {
          const s1 = Math.min(...k.b.map((x) => x.s1)), s2 = Math.max(...k.b.map((x) => x.s2));
          const dd = trunk + fi * 2 + k.c.hd, ss = cur - s1;
          k.c.rel = { d: dd, s: ss }; k.c.trunk = { d: trunk, s: me.hs };
          for (const x of k.b) out.push({ d1: x.d1 + dd, d2: x.d2 + dd, s1: x.s1 + ss, s2: x.s2 + ss });
          cur = ss + s2 + ssep;
        }
        return out;
      }
      const lsep = st.lsep != null ? st.lsep : IS;
      let dist = 0;
      for (const k of kids) dist = Math.max(dist, k.c.st.l != null ? k.c.st.l : 2.3 * E, me.hd + lsep + k.c.hd);
      const placed = [];
      let prev = -Infinity;
      for (const k of kids) {
        let off = placed.length ? prev : 0;
        if (placed.length) {
          for (const b of k.b) {
            const d1 = b.d1 + dist, d2 = b.d2 + dist;
            for (const a of placed) if (a.d1 < d2 - 0.01 && d1 < a.d2 - 0.01) off = Math.max(off, a.s2 + ssep - b.s1);
          }
        }
        k.off = off; prev = off;
        for (const b of k.b) placed.push({ d1: b.d1 + dist, d2: b.d2 + dist, s1: b.s1 + off, s2: b.s2 + off });
      }
      const first = kids[0].off, last = kids[kids.length - 1].off;
      const mid = st.calign === 'first' ? first : st.calign === 'last' ? last : (first + last) / 2;
      for (const k of kids) k.c.rel = { d: dist, s: k.off - mid };
      for (const b of placed) out.push({ d1: b.d1, d2: b.d2, s1: b.s1 - mid, s2: b.s2 - mid });
      me.dist = dist;
      return out;
    };
    sub(nodes[0]);
    nodes[0].D = 0; nodes[0].S = 0;
    for (const me of nodes) if (me.parent >= 0) { const p = nodes[me.parent]; me.D = p.D + me.rel.d; me.S = p.S + me.rel.s; }
    const at = (D, S) => [D * G[0] + S * U[0], D * G[1] + S * U[1]];
    for (const me of nodes) [me.x, me.y] = at(me.D, me.S);

    // edges
    const border = (me, vx, vy) => {
      const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
      let t;
      if (me.st.shape === 'circle') t = me.w / 2;
      else if (me.st.shape === 'ellipse') t = 1 / Math.hypot(ux / (me.w / 2 || 1), uy / (me.h / 2 || 1));
      else t = Math.min(ux ? me.w / 2 / Math.abs(ux) : Infinity, uy ? me.h / 2 / Math.abs(uy) : Infinity);
      return [me.x + ux * t, me.y + uy * t];
    };
    // an edge label: placed along the path (pos), then moved off it by its anchor (left, above right, …)
    const edgeLabel = (el, pts, st) => {
      let pos = 0.5, dx = 0, dy = 0;
      for (const o of el.o) {
        const k = o.k;
        if (k === 'pos' && isFinite(+o.v)) pos = +o.v;
        else if (k === 'near start') pos = 0.25; else if (k === 'near end') pos = 0.75;
        else if (k === 'very near start') pos = 0.125; else if (k === 'very near end') pos = 0.875;
        else if (k === 'at start') pos = 0; else if (k === 'at end') pos = 1;
        for (const w of k.split(/\s+/)) {
          if (w === 'left') dx = -1; else if (w === 'right') dx = 1;
          else if (w === 'above') dy = -1; else if (w === 'below') dy = 1;
        }
      }
      const seg = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
      let want = pos * total, x = pts[0][0], y = pts[0][1];
      for (let i = 0; i < seg.length; i++) {
        if (want <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, want / seg[i]) : 0; x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f; y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; break; }
        want -= seg[i];
      }
      const ts = { size: st.size, font: st.font, tw: 0, align: 'center' }, b = TD.textBox(el.t, ts), sep = 0.3333 * E;
      const w = b.w + 2 * sep, h = Math.max(0, b.h - 0.22 * TD.sizePx(st.size)) + 2 * sep;
      return { t: el.t, ts, x: x + dx * w / 2, y: y + dy * h / 2, w, h };
    };
    const edges = [];
    for (const me of nodes) {
      if (me.parent < 0) continue;
      const p = nodes[me.parent], ed = me.st.edge;
      if (ed.none || me.st.phantom) continue;
      const style = { color: ed.color, dash: ed.dash, lw: ed.lw, start: ed.start, end: ed.end };
      let pts, roof = false;
      if (me.trunk) {
        const [ax, ay] = at(p.D + me.trunk.d, p.S + me.trunk.s), [bx, by] = at(p.D + me.trunk.d, me.S), [cx, cy] = at(me.D - me.hd, me.S);
        pts = [[ax, ay], [bx, by], [cx, cy]];
      } else if (me.st.roof) {
        const [ax, ay] = at(p.D + p.hd, p.S), [bx, by] = at(me.D - me.hd, me.S - me.hs), [cx, cy] = at(me.D - me.hd, me.S + me.hs);
        pts = [[ax, ay], [bx, by], [cx, cy], [ax, ay]]; roof = true;
      } else if (me.st.fork) {
        const fd = p.st.fsep != null ? p.hd + p.st.fsep : (p.hd + (p.dist || 2.3 * E) - Math.max(...p.kids.map((i) => nodes[i].hd))) / 2;
        pts = [at(p.D + p.hd, p.S), at(p.D + fd, p.S), at(p.D + fd, me.S), at(me.D - me.hd, me.S)];
      } else pts = [border(p, me.x - p.x, me.y - p.y), border(me, p.x - me.x, p.y - me.y)];
      const ed2 = { pts, roof, style, i: me.i };
      if (me.st.elabel && me.st.elabel.t) ed2.label = edgeLabel(me.st.elabel, pts, me.st);
      edges.push(ed2);
    }

    // bounding box
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const me of nodes) ext(me.x - me.w / 2, me.y - me.h / 2, me.x + me.w / 2, me.y + me.h / 2);
    for (const e of edges) {
      for (const [x, y] of e.pts) ext(x - 1, y - 1, x + 1, y + 1);
      if (e.label) { const l = e.label; ext(l.x - l.w / 2, l.y - l.h / 2, l.x + l.w / 2, l.y + l.h / 2); }
    }
    const levels = 1 + Math.max(...nodes.map((m) => m.depth));
    return { nodes, edges, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, n: nodes.length, levels, G, U, grow, rev, libs: [...libs] };
  }

  // ---------------------------------------------------------------- drawing
  function draw(s, ctx) {
    const L = layout(s), ink = s.color || '#000000', col = TD.css(ink), paper = ctx.paper || '#ffffff';
    let out = '';
    if (L.empty) {
      out += `<rect x="0" y="0" width="${r2(L.bb.w)}" height="${r2(L.bb.h)}" fill="none" stroke="${col}" stroke-width="${r2(0.4 / K)}" stroke-dasharray="3 2" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty tree', { size: 'small', font: s.font }, '#888888', L.bb.w / 2, L.bb.h / 2, ctx);
    }
    const dashAttr = (d, lw) => (d ? ` stroke-dasharray="${d.map((v) => r2(Math.max(v / K, lw))).join(' ')}"` : '');
    for (const e of L.edges) {
      const st = e.style, c = st.color ? TD.css(st.color) : col, lw = st.lw;
      const pts = e.pts.slice();
      // arrow tips: the line stops short so its end stays under the tip
      const tip = (P, Q) => {
        const dx = P[0] - Q[0], dy = P[1] - Q[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a = 2.2 / K + lw * 2, b = a * 0.62;
        return { d: `M${r2(P[0])},${r2(P[1])}L${r2(P[0] - ux * a - uy * b)},${r2(P[1] - uy * a + ux * b)}Q${r2(P[0] - ux * a * 0.7)},${r2(P[1] - uy * a * 0.7)} ${r2(P[0] - ux * a + uy * b)},${r2(P[1] - uy * a - ux * b)}Z`, back: [P[0] - ux * a * 0.7, P[1] - uy * a * 0.7] };
      };
      let tips = '';
      if (!e.roof && st.end && pts.length > 1) { const t = tip(pts[pts.length - 1], pts[pts.length - 2]); tips += t.d; pts[pts.length - 1] = t.back; }
      if (!e.roof && st.start && pts.length > 1) { const t = tip(pts[0], pts[1]); tips += t.d; pts[0] = t.back; }
      out += `<path d="M${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}${e.roof ? 'Z' : ''}" fill="none" stroke="${c}" stroke-width="${r2(lw)}" stroke-linejoin="round"${dashAttr(st.dash, lw)}/>`;
      if (tips) out += `<path d="${tips}" fill="${c}" stroke="none"/>`;
      if (e.label) out += TD.textSvg(e.label.t, e.label.ts, ink, e.label.x, e.label.y, ctx);
    }
    for (const me of L.nodes) {
      const st = me.st;
      if (st.phantom) continue;
      if (st.draw || st.fill) {
        // in the UI's ink (palette drawings) a fill is a tint of that ink, so it reads in light and dark themes
        const tint = ink === 'currentColor' && st.fill, fill = tint ? 'currentColor" fill-opacity=".14' : st.fill ? TD.css(st.fill) : 'none';
        const stroke = st.draw ? TD.css(st.dc || ink) : 'none', a = ` fill="${fill}" stroke="${stroke}" stroke-width="${r2(st.lw)}"${st.draw ? dashAttr(st.dash, st.lw) : ''}`;
        if (st.shape === 'circle') out += `<circle cx="${r2(me.x)}" cy="${r2(me.y)}" r="${r2(me.w / 2)}"${a}/>`;
        else if (st.shape === 'ellipse') out += `<ellipse cx="${r2(me.x)}" cy="${r2(me.y)}" rx="${r2(me.w / 2)}" ry="${r2(me.h / 2)}"${a}/>`;
        else out += `<rect x="${r2(me.x - me.w / 2)}" y="${r2(me.y - me.h / 2)}" width="${r2(me.w)}" height="${r2(me.h)}"${st.rc ? ` rx="${r2(Math.min(st.rc, me.w / 2, me.h / 2))}"` : ''}${a}/>`;
      }
      if (me.t) out += TD.textSvg(me.t, me.ts, st.tc || ink, me.x, me.y, ctx);
    }
    const bb = L.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    void paper;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  // A small drawing of a tree, for the editor's palette: in the UI's ink.
  TD.ftMini = (src, maxH = 40) => {
    const s = { type: 'forest', x: 0, y: 0, src, size: 'small', font: 'default', color: 'currentColor' };
    const bb = layout(s).bb, k = Math.min(1, maxH / bb.h);
    return `<svg class="qcmini ftmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true })}</svg>`;
  };

  TD.TYPES.forest = {
    name: 'Tree',
    pts: [['x', 'y']],
    create: (p, d) => ({ type: 'forest', x: p.x, y: p.y, src: TD.FT_DEFAULT, size: TD.BLOCK_SIZE, font: 'default', color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // forest draws a tikzpicture of its own: like quantikz, it sits in a plain node with the outer
    // picture interrupted, centred where the drawing is
    tikz(s, X) {
      const L = layout(s);
      X.pkgs.add('forest');
      for (const l of L.libs) if (l.startsWith('tikz:')) X.libs.add(l.slice(5)); else X.pkgs.add(`forest[${l}]`);
      const b = L.bb, fo = TD.textOpts({ size: s.size, font: s.font }, X); // the tree's text size, as on the canvas
      return `\\node${fo.length ? `[${fo.join(', ')}]` : ''} at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  // property panel: the code, what is not drawn, and a copy button
  TD.panels = TD.panels || {};
  TD.panels.forest = {
    html(s) {
      const L = layout(s);
      const pkg = `\\usepackage${L.libs.filter((l) => !l.startsWith('tikz:')).length ? `[${L.libs.filter((l) => !l.startsWith('tikz:')).join(', ')}]` : ''}{forest}`;
      return `<div class="sec"><div class="sec-title">forest <small>${L.n} node${L.n === 1 ? '' : 's'}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="7">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the tree to edit it visually. Exported with <code>${esc(pkg)}</code>.</div></div>
        <div class="sec"><button class="wide primary" data-act="editft">Edit Tree…</button><button class="wide" data-act="copyft">Copy forest Code</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editft') { if (TD.ftOpen) TD.ftOpen(s.id); return; }
      if (act !== 'copyft') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('forest Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied forest code';
    },
  };
  TD.ftLayout = layout;
  // for the visual editor (js/fteditor.js)
  TD.ft = { opt, optList, splitTop, unbrace, unwrap, parse, code, fullCode, layout, draw, len };
})();
