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
  // A TeX box is as tall as its tallest glyph and as deep as its deepest (no line leading, no strut): the
  // height and depth (in units of the font size) of a one-line plain text, or of a $math$ of letters and
  // digits only. null when the text has commands or several lines (the line box is measured instead).
  function glyphHD(t, mono) {
    let x = t.replace(/\\(le|leq|ge|geq|ne|neq|approx|equiv)(?![A-Za-z])/g, '\u0001').replace(/\$/g, '');
    let sub = 0, sup = 0;
    // sub- and superscripts: lowered by 0.15 and raised by 0.41 em, set at 0.7 of the size
    x = x.replace(/([_^])(\{[^{}]*\}|.)/g, (m, k, a) => {
      a = a.replace(/[{}]/g, '');
      const h = glyphHD(a, mono);
      if (!h) { sub = NaN; return ''; }
      if (k === '_') sub = Math.max(sub, 0.15 + h.dp * 0.7); else sup = Math.max(sup, 0.41 + h.ht * 0.7);
      return '';
    });
    if (sub !== sub) return null;
    if (!x.trim() && !sub && !sup) return null;
    if (/[\\{}&%#~\n]/.test(x) || /[^\x20-\x7e\u0001]/.test(x)) return null;
    let ht = sup, dp = sub;
    for (const c of x) {
      let h, d = 0;
      if (c === ' ') continue;
      if (c === '\u0001') { h = 0.69; d = 0.19; }
      else if (/[A-Z]/.test(c)) h = mono ? 0.611 : 0.683;
      else if (/[0-9]/.test(c)) h = mono ? 0.611 : 0.644;
      else if (/[bdfhkl]/.test(c)) h = mono ? 0.611 : 0.694;
      else if (c === 't') h = mono ? 0.55 : 0.615;
      else if (/[ij]/.test(c)) h = 0.669;
      else if (/[?!]/.test(c)) h = 0.705;
      else if (/[()[\]/|]/.test(c)) { h = 0.75; d = 0.25; }
      else if (/[.:]/.test(c)) h = 0.43;
      else if (/[,;]/.test(c)) { h = 0.43; d = 0.19; }
      else if (/[-+=<>*'"`]/.test(c)) h = 0.5;
      else if (c === '_') { h = 0; d = 0.1; }
      else h = 0.431;
      if (/[gjpqy]/.test(c)) d = mono ? 0.22 : 0.194;
      ht = Math.max(ht, h); dp = Math.max(dp, d);
    }
    return { ht, dp };
  }
  // what pdflatex's \em, \strutbox height and forest's default level distance `l` are at each size (pt)
  const TEXSZ = {
    tiny: [6.806, 4.2, 15.849], scriptsize: [7.972, 5.6, 20.194], footnotesize: [8.5, 6.65, 22.66], small: [9.25, 7.7, 25.349],
    normalsize: [10, 8.4, 27.688], large: [11.75, 9.8, 32.615], Large: [14.1, 12.6, 39.898], LARGE: [15.85, 15.4, 47.009],
    huge: [19.024, 17.5, 55.358], Huge: [22.821, 21, 66.335],
  };
  const texsz = (name) => TEXSZ[name] || TEXSZ.normalsize;
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

    // the linguistics library (loaded for roofs) makes every node `align=center` and every edge run from the
    // parent's near face to the child's (sn edges)
    const ling = nodes.some((me) => me.eff.some((o) => o.k === 'roof' || o.k === 'sn edges'));
    // style of each node
    const T0 = texsz(size), IS = T0[0] / K / 3;
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
        else if (k === 'fork sep') setLen('fsep', o, 5 / K);
        else if (k === 'folder indent') setLen('findent', o, 4.5 / K);
        else if (k === 'l') setLen('l', o, T0[2] / K);
        else if (k === 'l sep') setLen('lsep', o, T0[1] / K + IS);
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
      const Es = TD.sizePx(st.size);
      let hd = t && !st.tw ? glyphHD(t, st.font === 'cmtt') : null;
      // align= typesets the text as a table row with a \strut: at least 0.7 and 0.3 baselineskips
      if (hd && (st.align || ling)) { const sh = texsz(st.size)[1] / K / Es; hd = { ht: Math.max(hd.ht, sh), dp: Math.max(hd.dp, sh * 3 / 7) }; }
      // the box of TeX: the glyphs' height and depth; the +2 in a measured width is slack, not text
      const tw = st.tw > 0 ? st.tw : Math.max(0, b.w - 2), th = t ? (hd ? (hd.ht + hd.dp) * Es : Math.max(0, b.h - 0.22 * Es)) : 0;
      me.off = hd ? (hd.ht - hd.dp) * Es / 2 : 0; // the box's centre above its baseline
      let w = tw + 2 * st.isx, h = th + 2 * st.isy;
      if (st.shape === 'circle') w = h = Math.hypot(tw + 2 * st.isx, th + 2 * st.isy);
      else if (st.shape === 'ellipse') { w *= Math.SQRT2; h *= Math.SQRT2; }
      w = Math.max(w, st.mw); h = Math.max(h, st.mh);
      if (st.shape === 'circle') w = h = Math.max(w, h);
      me.w = w; me.h = h; me.st = st;
    }

    // Every node turns its own children (`grow`, default south); G is the direction they grow in and U the
    // one their order runs along. The root's pair is kept for the editor.
    const cl = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    const frame = (st) => {
      const grow = st.grow != null ? st.grow : 270, rev = !!st.rev;
      const ga = grow * Math.PI / 180, ua = (grow + (rev ? -90 : 90)) * Math.PI / 180;
      return { G: [cl(Math.cos(ga)), cl(-Math.sin(ga))], U: [cl(Math.cos(ua)), cl(-Math.sin(ua))], grow, rev };
    };
    for (const me of nodes) {
      me.fr = frame(me.st);
      // forest anchors a node at the baseline of its text, a folder's at the middle of its west side
      if (me.st.folder) me.off = 0;
      const asc = me.h / 2 + me.off, dsc = me.h / 2 - me.off;
      me.box = { x1: -me.w / 2, x2: me.w / 2, y1: -asc, y2: dsc }; // round the anchor, y down
    }
    const { G, U, grow, rev } = nodes[0].fr;
    for (const me of nodes) {
      me.hd = Math.abs(G[0]) * me.w / 2 + Math.abs(G[1]) * me.h / 2;
      me.hs = Math.abs(U[0]) * me.w / 2 + Math.abs(U[1]) * me.h / 2;
    }
    const LDEF = T0[2] / K, LSEP0 = T0[1] / K + IS, SSEP0 = 2 * IS;
    // a box as seen along a frame: d along the growth, s across
    const inFrame = (r, f) => {
      let d1 = Infinity, d2 = -Infinity, s1 = Infinity, s2 = -Infinity;
      for (const x of [r.x1, r.x2]) for (const y of [r.y1, r.y2]) {
        const d = x * f.G[0] + y * f.G[1], s = x * f.U[0] + y * f.U[1];
        d1 = Math.min(d1, d); d2 = Math.max(d2, d); s1 = Math.min(s1, s); s2 = Math.max(s2, s);
      }
      return { d1, d2, s1, s2 };
    };
    const shiftR = (r, x, y) => ({ x1: r.x1 + x, x2: r.x2 + x, y1: r.y1 + y, y2: r.y2 + y });

    // packing: a subtree is a list of boxes round its root's anchor; siblings are pushed apart until no
    // boxes that share a band of d come closer than s sep. Each child gets rel {x, y} from its parent's anchor.
    const sub = (me) => {
      const own = me.box;
      if (!me.kids.length) return [own];
      const st = me.st, f = me.fr, kids = me.kids.map((i) => ({ c: nodes[i], b: sub(nodes[i]) }));
      const ssep = st.ssep != null ? st.ssep : SSEP0;
      const out = [own], po = inFrame(own, f);
      const place = (k, d, s) => { k.c.rel = { x: d * f.G[0] + s * f.U[0], y: d * f.G[1] + s * f.U[1] }; };
      const pack = (dist) => { // each kid's boxes at distance dist(k); sets the s offsets
        const placed = [];
        let prev = -Infinity;
        for (const k of kids) {
          const d0 = dist(k);
          k.fr = k.b.map((r) => inFrame(r, f));
          let off = placed.length ? prev : 0;
          if (placed.length) {
            for (const b of k.fr) {
              const d1 = b.d1 + d0, d2 = b.d2 + d0;
              for (const a of placed) if (a.d1 < d2 - 0.01 && d1 < a.d2 - 0.01) off = Math.max(off, a.s2 + ssep - b.s1);
            }
          }
          k.off = off; prev = off;
          for (const b of k.fr) placed.push({ d1: b.d1 + d0, d2: b.d2 + d0, s1: b.s1 + off, s2: b.s2 + off });
        }
      };
      if (st.folder) {
        // children hang below the parent, every one l sep from the parent's near side (their anchors are
        // their west sides), the first s sep below the parent, the rest packed as usual
        const fi = st.findent != null ? st.findent : 4.5 / K; // 0.45em of the 10pt font forest was loaded in
        const fl = st.lsep != null ? st.lsep : LSEP0, hdp = (po.d2 - po.d1) / 2, hsp = (po.s2 - po.s1) / 2;
        for (const k of kids) { const c = inFrame(k.c.box, f); k.dd = fl - hdp + (c.d2 - c.d1) / 2; }
        pack((k) => k.dd);
        const c0 = inFrame(kids[0].c.box, f), shift = hsp + ssep + (c0.s2 - c0.s1) / 2 - kids[0].off;
        for (const k of kids) { place(k, k.dd, k.off + shift); k.c.trunk = { d: -hdp + fi, s: hsp }; }
      } else {
        const lsep = st.lsep != null ? st.lsep : LSEP0;
        // each child's distance from this anchor: its own `l`, else the default; then all are pushed out
        // until the nearest clears this node by l sep
        let minNear = Infinity;
        for (const k of kids) {
          k.l = k.c.st.l != null ? k.c.st.l : LDEF;
          minNear = Math.min(minNear, k.l + inFrame(k.c.box, f).d1);
        }
        const push = Math.max(0, po.d2 + lsep - minNear);
        for (const k of kids) k.l += push;
        pack((k) => k.l);
        const first = kids[0].off, last = kids[kids.length - 1].off;
        const mid = st.calign === 'first' ? first : st.calign === 'last' ? last : (first + last) / 2;
        for (const k of kids) place(k, k.l, k.off - mid);
      }
      for (const k of kids) for (const r of k.b) out.push(shiftR(r, k.c.rel.x, k.c.rel.y));
      return out;
    };
    sub(nodes[0]);
    nodes[0].ax = 0; nodes[0].ay = 0;
    for (const me of nodes) if (me.parent >= 0) { const p = nodes[me.parent]; me.ax = p.ax + me.rel.x; me.ay = p.ay + me.rel.y; }
    for (const me of nodes) { me.x = me.ax; me.y = me.ay - me.off; } // from the anchor to the node's centre

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
      // points in the parent's frame: d along its growth, s across, from a node's centre
      const f = p.fr, pt = (c, d, sv) => [c.x + d * f.G[0] + sv * f.U[0], c.y + d * f.G[1] + sv * f.U[1]];
      const half = (c, v) => Math.abs(v[0]) * c.w / 2 + Math.abs(v[1]) * c.h / 2;
      const hdp = half(p, f.G), hdc = half(me, f.G), hsc = half(me, f.U), rs = (me.x - p.x) * f.U[0] + (me.y - p.y) * f.U[1];
      if (me.trunk) {
        pts = [pt(p, me.trunk.d, me.trunk.s), pt(p, me.trunk.d, rs), pt(me, -hdc, 0)];
      } else if (me.st.roof) {
        pts = [pt(p, hdp, 0), pt(me, -hdc, -hsc), pt(me, -hdc, hsc), pt(p, hdp, 0)]; roof = true;
      } else if (me.st.fork) {
        const fd = hdp + (p.st.fsep != null ? p.st.fsep : 5 / K); // fork sep is 0.5em of the 10pt font forest was loaded in
        pts = [pt(p, hdp, 0), pt(p, fd, 0), pt(p, fd, rs), pt(me, -hdc, 0)];
      } else if (ling) pts = [pt(p, hdp, 0), pt(me, -hdc, 0)];
      else pts = [border(p, me.x - p.x, me.y - p.y), border(me, p.x - me.x, p.y - me.y)];
      const ed2 = { pts, roof, style, i: me.i };
      if (me.st.elabel && me.st.elabel.t) ed2.label = edgeLabel(me.st.elabel, pts, me.st);
      edges.push(ed2);
    }

    // bounding box
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const me of nodes) if (!me.st.phantom) ext(me.x - me.w / 2, me.y - me.h / 2, me.x + me.w / 2, me.y + me.h / 2);
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
  // Application integration belongs to the block, alongside its model and panel.
  TD.blocks.register("forest", {
    menu: { order: 5, label: "Tree", title: "Tree or hierarchy, written for forest", icon: "<svg viewBox=\"0 0 32 24\"><rect x=\"12\" y=\"2\" width=\"8\" height=\"6\" class=\"a1\"/><path d=\"M16 8v3M7 11h18M7 11v3M25 11v3M16 11v3\"/><rect x=\"4\" y=\"14\" width=\"6\" height=\"6\"/><rect x=\"13\" y=\"14\" width=\"6\" height=\"6\"/><rect x=\"22\" y=\"14\" width=\"6\" height=\"6\"/></svg>" },
    nodeImport: { re: /\\begin\{forest\}[\s\S]*\\end\{forest\}/, order: 2, bb: (q) => TD.ftLayout(q).bb },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    editor: { get: () => TD.ftEditor, alias: "ftOpen" }
  });
})();
