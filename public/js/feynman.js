// Feynman diagrams written with the tikz-feynman package. The source is the object: \vertex lines that
// place the vertices and a \diagram* that joins them with propagators. It is drawn here as vectors at
// the package's own sizes (wave, coil, arrow and momentum measured from its output), and exported
// unchanged in a scope shifted to where the drawing sits. Every position is given, so pdfLaTeX builds
// it; only automatic layout (\feynmandiagram, \diagram without the star) needs LuaLaTeX.
// The visual editor (js/fyeditor.js) reads the code into a model and writes it back.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, MM = PX / 10, PT = 1 / K;

  TD.FEYN_DEFAULT = [
    '\\begin{feynman}',
    '  \\vertex (i1) at (0,1) {\\(e^-\\)};',
    '  \\vertex (i2) at (0,-1) {\\(e^+\\)};',
    '  \\vertex (a) at (1.25,0);',
    '  \\vertex (b) at (3.25,0);',
    '  \\vertex (f1) at (4.5,1) {\\(\\mu^-\\)};',
    '  \\vertex (f2) at (4.5,-1) {\\(\\mu^+\\)};',
    '  \\diagram* {',
    '    (i1) -- [fermion] (a) -- [fermion] (i2),',
    '    (a) -- [photon, edge label=\\(\\gamma\\), momentum\'=\\(q\\)] (b),',
    '    (f2) -- [fermion] (b) -- [fermion] (f1),',
    '  };',
    '\\end{feynman}',
  ].join('\n');

  // the package's sizes
  const LW = 0.4 * PT;
  const WAVE = { amp: 1.25 * PT, per: 2 * MM };                  // photon, boson: complete sines
  const COIL = { amp: 2.5 * PT, per: 1.5 * MM, rx: 1.877 * PT }; // gluon: coil, aspect .75, mirror
  const ARROW = { ahead: 3.7 * PT, len: 6.62 * PT, half: 2.74 * PT };
  const MOM = { dist: 3 * MM, shorten: 0.15 };
  const INNER = 3.333 * PT; // inner sep .3333em at 10pt
  const DOT = 0.75 * MM, CROSSED = 1.5 * MM, BLOB = 0.375 * PX;
  const TEXT = { size: 10 * PT, font: 'default' };
  const DIST = 1.5; // medium node distance, cm

  const EDGE_TYPES = ['plain', 'fermion', 'anti fermion', 'photon', 'boson', 'charged boson', 'anti charged boson', 'gluon',
    'scalar', 'charged scalar', 'anti charged scalar', 'ghost', 'majorana', 'anti majorana'];
  const VERTEX_STYLES = ['dot', 'square dot', 'empty dot', 'crossed dot', 'blob'];
  const TYPE_SET = new Set(EDGE_TYPES), VSET = new Set(VERTEX_STYLES);

  // ---------------------------------------------------------------- reading the code
  function close(s, i) {
    const open = s[i], shut = { '{': '}', '[': ']', '(': ')' }[open];
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{' && open !== '{') { k = close(s, k); if (k < 0) return -1; continue; }
      if (c === open) d++;
      else if (c === shut && --d === 0) return k;
    }
    return -1;
  }
  // a top-level split on sep, minding braces, brackets and parentheses
  function split(s, sep = ',') {
    const out = [];
    let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
      if ('{[('.includes(c)) d++;
      else if ('}])'.includes(c)) d--;
      if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }
  const opts = (s) => split(s || '').map((x) => x.trim()).filter(Boolean);
  const kv = (it) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null }; };
  const unbrace = (v) => { v = String(v ?? '').trim(); while (v[0] === '{' && close(v, 0) === v.length - 1) v = v.slice(1, -1).trim(); return v; };
  const stripComments = (s) => s.replace(/(^|[^\\])%.*$/gm, '$1');
  // \(…\) and \[…\] as $…$ for drawing
  const shown = (t) => String(t || '').replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$');

  // a length → cm ("1.5", "2cm", "3mm", "10pt", "1em")
  function cm(v) {
    const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?\s*$/.exec(String(v));
    if (!m) return NaN;
    const n = parseFloat(m[1]);
    return { cm: n, mm: n / 10, pt: n / 28.4527, em: n * 10 / 28.4527, ex: n * 4.3 / 28.4527, in: n * 2.54, bp: n * 2.54 / 72 }[m[2] || 'cm'] ?? n;
  }
  // (x,y) or (angle:radius) → [x, y] in cm
  function coord(t) {
    t = t.trim();
    let m = /^\(\s*([^,:()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(t);
    if (m) { const x = cm(m[1]), y = cm(m[2]); return isFinite(x) && isFinite(y) ? [x, y] : null; }
    m = /^\(\s*(-?[\d.]+)\s*:\s*([^,()]+?)\s*\)$/.exec(t);
    if (m) { const a = (parseFloat(m[1]) * Math.PI) / 180, r = cm(m[2]); return isFinite(r) ? [r * Math.cos(a), r * Math.sin(a)] : null; }
    return null;
  }
  // "above right=1cm and 2cm of b" → { dir, d, of }
  const REL_RE = /^(above|below|left|right|above left|above right|below left|below right)\s*=\s*(?:(.*?)\s+)?of\s+(\S+)$/;

  // The model: { env, vertices: [v], edges: [e], extra: [statement], warnings }.
  // v: { name, o: [option], x, y (cm, or null), rel, text (TeX, or null), graph }
  // e: { a, b, o: [option], ch (the chain it was written in) }
  function parse(src) {
    const warnings = [], warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const t = stripComments(String(src || ''));
    const bm = /\\begin\{feynman\}\s*(\[[^\]]*\])?/.exec(t);
    let body = t, env = '';
    if (bm) {
      env = bm[1] ? bm[1].slice(1, -1).trim() : '';
      const em = t.indexOf('\\end{feynman}', bm.index);
      body = t.slice(bm.index + bm[0].length, em < 0 ? t.length : em);
      if (em < 0) warn('\\end{feynman} is missing');
    }
    const M = { env, vertices: [], edges: [], extra: [], warnings };
    const byName = new Map();
    const vertex = (name, rest) => {
      let v = byName.get(name);
      if (!v) { v = { name, o: [], x: null, y: null, rel: null, text: null, ...rest }; byName.set(name, v); M.vertices.push(v); }
      return v;
    };
    let i = 0, chain = 0;
    while (i < body.length) {
      i = skip(body, i);
      if (i >= body.length) break;
      if (body.startsWith('\\vertex', i) && !/[A-Za-z]/.test(body[i + 7] || '')) {
        i += 7;
        let name = null, xy = null, text = null, o = [], bad = false;
        for (;;) {
          i = skip(body, i);
          const c = body[i];
          if (c === undefined) { bad = true; break; }
          if (c === ';') { i++; break; }
          if (c === '[') { const e = close(body, i); if (e < 0) { bad = true; break; } o = o.concat(opts(body.slice(i + 1, e))); i = e + 1; continue; }
          if (c === '(') { const e = close(body, i); if (e < 0) { bad = true; break; } if (name == null) name = body.slice(i + 1, e).trim(); i = e + 1; continue; }
          if (c === '{') { const e = close(body, i); if (e < 0) { bad = true; break; } text = body.slice(i + 1, e).trim(); i = e + 1; continue; }
          if (body.startsWith('at', i) && !/[A-Za-z]/.test(body[i + 2] || '')) {
            i = skip(body, i + 2);
            if (body[i] === '(') { const e = close(body, i); const p = e > 0 ? coord(body.slice(i, e + 1)) : null; if (!p) warn(`The position ${body.slice(i, e + 1)} isn't one the drawing understands; use at (x,y)`); xy = p; i = e > 0 ? e + 1 : body.length; continue; }
          }
          // anything else up to the ;
          const e = body.indexOf(';', i);
          warn(`Something in a \\vertex line isn't drawn here: "${body.slice(i, e < 0 ? undefined : e).trim()}"`);
          i = e < 0 ? body.length : e;
        }
        if (bad) { warn('A \\vertex line is not closed with ;'); }
        if (!name) { warn('A \\vertex has no name: write \\vertex (a) …'); continue; }
        const v = vertex(name, { decl: true });
        const r = readVertexOpts(o, warn);
        v.o = r.o; v.rel = r.rel; v.decl = true;
        if (text != null) v.text = text; else if (r.text !== undefined) v.text = r.text;
        if (xy) { v.x = xy[0]; v.y = xy[1]; }
        continue;
      }
      const dm = /^\\(diagram|feynmandiagram)(\*?)/.exec(body.slice(i));
      if (dm) {
        if (dm[1] === 'feynmandiagram' || !dm[2]) warn(`\\${dm[1]}${dm[2]} lays the diagram out itself and needs LuaLaTeX: positions here are a guess. Use \\diagram* with placed vertices for pdfLaTeX`);
        i = skip(body, i + dm[0].length);
        if (body[i] === '[') { const e = close(body, i); M.dopts = body.slice(i + 1, e).trim(); i = e + 1; i = skip(body, i); }
        if (body[i] !== '{') { warn(`\\${dm[1]}${dm[2]} needs { … }`); continue; }
        const e = close(body, i);
        if (e < 0) { warn(`The { after \\${dm[1]}${dm[2]} is not closed`); break; }
        const inner = body.slice(i + 1, e);
        i = e + 1; i = skip(body, i); if (body[i] === ';') i++;
        for (const part of split(inner)) {
          if (!part.trim()) continue;
          readChain(part, chain++, M, vertex, warn);
        }
        continue;
      }
      // any other statement is kept as written
      const e = nextSemi(body, i);
      const st = body.slice(i, e + 1).trim();
      if (st) { M.extra.push(st); warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`); }
      i = e + 1;
    }
    return M;
  }
  const skip = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  function nextSemi(s, i) {
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if ('{[('.includes(c)) { const e = close(s, k); if (e < 0) return s.length - 1; k = e; continue; }
      if (c === ';') return k;
    }
    return s.length - 1;
  }
  function readVertexOpts(list, warn) {
    const o = [];
    let rel = null, text;
    for (const it of list) {
      const m = REL_RE.exec(it);
      if (m) { rel = { dir: m[1], d: m[2] || '', of: m[3].replace(/^\(|\)$/g, '') }; continue; }
      const { k, v } = kv(it);
      if (k === 'particle' && v != null) { text = unbrace(v); continue; }
      o.push(it);
      if (VSET.has(k) || k === 'label' || k === 'vertex' || /^(red|blue|green|black|gray|grey|orange|purple|brown|cyan|magenta|violet|teal|olive|draw|fill|color|text)$/.test(k)) continue;
      warn(`The vertex option "${it}" isn't drawn here (it is kept in the code)`);
    }
    const r = { o, rel };
    if (text !== undefined) r.text = text;
    return r;
  }
  // (a) -- [opts] (b) -- (c); a bare name, or { a, b } for several at once
  function readChain(s, ch, M, vertex, warn) {
    let i = 0, prev = null, edge = null;
    const ends = [];
    const node = (name, o) => {
      let v = M.vertices.find((x) => x.name === name);
      if (!v) { v = vertex(name, { graph: true }); warn(`"${name}" is used in the diagram without a \\vertex line: its place is a guess`); }
      if (o && o.length) { const r = readVertexOpts(o, warn); v.o = v.o.concat(r.o); if (r.text !== undefined) v.text = r.text; if (r.rel) v.rel = r.rel; }
      return v.name;
    };
    while (i < s.length) {
      i = skip(s, i);
      if (i >= s.length) break;
      const c = s[i];
      let group = null;
      if (c === '(') { const e = close(s, i); if (e < 0) { warn('A ( in the diagram is not closed'); return; } group = [s.slice(i + 1, e).trim()]; i = e + 1; }
      else if (c === '{') {
        const e = close(s, i); if (e < 0) { warn('A { in the diagram is not closed'); return; }
        group = split(s.slice(i + 1, e)).map((x) => x.trim().replace(/^\(|\)$/g, '').trim()).filter(Boolean);
        i = e + 1;
      } else if (/^(--|->|<-|<->)/.test(s.slice(i))) {
        const m = /^(--|<->|->|<-)/.exec(s.slice(i));
        i = skip(s, i + m[0].length);
        let o = [];
        if (s[i] === '[') { const e = close(s, i); o = opts(s.slice(i + 1, e)); i = e + 1; }
        edge = o;
        continue;
      } else if (/[A-Za-z0-9_]/.test(c)) {
        const m = /^[A-Za-z0-9_.']+/.exec(s.slice(i));
        group = [m[0]]; i += m[0].length;
      } else { warn(`"${s.slice(i).trim()}" in the diagram isn't understood`); return; }
      // options right after a node
      i = skip(s, i);
      let o = null;
      if (s[i] === '[') { const e = close(s, i); o = opts(s.slice(i + 1, e)); i = e + 1; }
      const names = group.map((n) => node(n, o));
      if (prev && edge) for (const a of prev) for (const b of names) { M.edges.push({ a, b, o: edge.slice(), ch }); readEdgeOpts(edge, warn); }
      else if (prev && !edge) warn('Two vertices in the diagram follow each other without -- between them');
      prev = names; edge = null; ends.push(names);
    }
  }
  // what an edge's options say: { type, label, labelSide, mom: [{ text, side, rev, shorten, dist }], ins: [pos], bend, color, width }
  function readEdgeOpts(list, warn) {
    const r = { type: 'plain', mom: [], ins: [], labels: [], bend: null, out: null, in: null, loose: 1, color: null, width: LW, extra: [] };
    for (const it of list) {
      const { k, v } = kv(it);
      if (TYPE_SET.has(k) && v == null) { r.type = k; continue; }
      if (k === 'edge label' || k === "edge label'") { r.labels.push({ t: unbrace(v), side: k.endsWith("'") ? -1 : 1 }); continue; }
      const mm = /^(reversed momentum|rmomentum|momentum)('?)$/.exec(k);
      if (mm) {
        let t = unbrace(v), sub = {};
        if (t[0] === '[') { const e = close(t, 0); for (const x of opts(t.slice(1, e))) { const q = kv(x); sub[q.k] = q.v; } t = t.slice(e + 1).trim(); }
        r.mom.push({ t, side: mm[2] ? -1 : 1, rev: mm[1] !== 'momentum', shorten: parseFloat(sub['arrow shorten']) || MOM.shorten, dist: sub['arrow distance'] ? cm(sub['arrow distance']) * PX : MOM.dist });
        continue;
      }
      if (k === 'insertion') {
        let t = unbrace(v == null ? '0.5' : v);
        if (t[0] === '[') t = t.slice(close(t, 0) + 1).trim();
        r.ins.push(parseFloat(t) || 0.5);
        continue;
      }
      if (k === 'bend left' || k === 'bend right') { r.bend = (k === 'bend left' ? 1 : -1) * (v == null ? 30 : parseFloat(v) || 30); continue; }
      if (k === 'half left' || k === 'half right') { r.bend = k === 'half left' ? 90 : -90; r.loose = 1.5; continue; }
      if (k === 'quarter left' || k === 'quarter right') { r.bend = k === 'quarter left' ? 45 : -45; continue; }
      if (k === 'out' && v != null) { r.out = parseFloat(v); continue; }
      if (k === 'in' && v != null) { r.in = parseFloat(v); continue; }
      if (k === 'looseness' && v != null) { r.loose = parseFloat(v) || 1; continue; }
      if (k === 'thick') { r.width = 0.8 * PT; continue; }
      if (k === 'very thick') { r.width = 1.2 * PT; continue; }
      if (k === 'ultra thick') { r.width = 1.6 * PT; continue; }
      if (k === 'thin') { r.width = LW; continue; }
      if (k === 'line width' && v != null) { const w = cm(v); if (isFinite(w)) r.width = w * PX; continue; }
      const col = (k === 'draw' || k === 'color') && v != null ? v : v == null ? k : null;
      if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
      if (warn) warn(`The edge option "${it}" isn't drawn here (it is kept in the code)`);
      r.extra.push(it);
    }
    return r;
  }

  // ---------------------------------------------------------------- writing the code
  const num = (n) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
  function vertexCode(v) {
    const o = v.o.slice();
    if (v.x == null && v.rel) o.push(`${v.rel.dir}=${v.rel.d ? v.rel.d + ' ' : ''}of ${v.rel.of}`);
    const at = v.x != null ? ` at (${num(v.x)},${num(v.y)})` : '';
    const text = v.text != null && v.text !== '' ? ` {${v.text}}` : VSET.has(styleOf(v)) ? ' {}' : '';
    return `\\vertex${o.length ? ` [${o.join(', ')}]` : ''} (${v.name})${at}${text};`;
  }
  function write(M) {
    const lines = M.vertices.map((v) => '  ' + vertexCode(v));
    for (const x of M.extra) lines.push('  ' + x);
    if (M.edges.length) {
      lines.push(`  \\diagram*${M.dopts ? ` [${M.dopts}]` : ''} {`);
      const chains = [];
      let cur = null;
      for (const e of M.edges) {
        const step = ` -- ${e.o.length ? `[${e.o.join(', ')}] ` : ''}(${e.b})`;
        if (cur && cur.ch === e.ch && cur.last === e.a) { cur.text += step; cur.last = e.b; }
        else { cur = { ch: e.ch, last: e.b, text: `(${e.a})${step}` }; chains.push(cur); }
      }
      for (const c of chains) lines.push(`    ${c.text},`);
      lines.push('  };');
    }
    return `\\begin{feynman}${M.env ? `[${M.env}]` : ''}\n${lines.join('\n')}${lines.length ? '\n' : ''}\\end{feynman}`;
  }
  const styleOf = (v) => { for (const it of v.o) { const k = kv(it).k; if (VSET.has(k)) return k; } return ''; };

  // ---------------------------------------------------------------- layout
  const cache = new Map();
  function layout(s) {
    const key = [s.src, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s.src);
    if (TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

  // where every vertex sits, in cm (y up)
  function place(M, warn) {
    const at = new Map();
    for (const v of M.vertices) if (v.x != null) at.set(v.name, [v.x, v.y]);
    // relative ones, as far as their references reach
    for (let pass = 0; pass < M.vertices.length; pass++) {
      let moved = false;
      for (const v of M.vertices) {
        if (at.has(v.name) || !v.rel || !at.has(v.rel.of)) continue;
        const [bx, by] = at.get(v.rel.of), dir = v.rel.dir;
        const ds = v.rel.d ? v.rel.d.split(/\s+and\s+/).map(cm) : [];
        let dy = isFinite(ds[0]) ? ds[0] : DIST, dx = isFinite(ds[1]) ? ds[1] : isFinite(ds[0]) ? ds[0] : DIST;
        const diag = /\s/.test(dir);
        if (diag && ds.length < 2) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
        const x = bx + (/right/.test(dir) ? dx : /left/.test(dir) ? -dx : 0);
        const y = by + (/above/.test(dir) ? dy : /below/.test(dir) ? -dy : 0);
        at.set(v.name, [x, y]); moved = true;
      }
      if (!moved) break;
    }
    // the rest: next to what they are joined to, or in a row under the drawing
    const loose = M.vertices.filter((v) => !at.has(v.name));
    if (loose.length) {
      warn(loose.length === 1 ? `The vertex "${loose[0].name}" has no position: it is drawn where it might go. Give it at (x,y) (moving it in the editor does)` : `${loose.length} vertices have no position: they are drawn where they might go. Give them at (x,y) (moving them in the editor does)`);
      const pts = [...at.values()], cx = pts.length ? pts.reduce((a, p) => a + p[0], 0) / pts.length : 0, cy = pts.length ? pts.reduce((a, p) => a + p[1], 0) / pts.length : 0;
      for (let pass = 0; pass < 4; pass++) for (const v of loose) {
        if (at.has(v.name)) continue;
        const nb = M.edges.filter((e) => e.a === v.name || e.b === v.name).map((e) => (e.a === v.name ? e.b : e.a)).filter((n) => at.has(n)).map((n) => at.get(n));
        if (!nb.length) continue;
        const mx = nb.reduce((a, p) => a + p[0], 0) / nb.length, my = nb.reduce((a, p) => a + p[1], 0) / nb.length;
        let ux = mx - cx, uy = my - cy;
        const l = Math.hypot(ux, uy);
        if (l < 1e-6) { ux = 1; uy = 0; } else { ux /= l; uy /= l; }
        let p = [mx + ux * DIST, my + uy * DIST];
        while ([...at.values()].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.3)) p = [p[0] + 0.5, p[1] - 0.5];
        at.set(v.name, p);
      }
      let x0 = pts.length ? Math.min(...pts.map((p) => p[0])) : 0, y0 = pts.length ? Math.min(...pts.map((p) => p[1])) - DIST : 0;
      for (const v of loose) if (!at.has(v.name)) { at.set(v.name, [x0, y0]); x0 += DIST; }
    }
    return at;
  }

  // a path as a polyline with its lengths: point and direction at any distance along it
  function polyline(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function along(P, s) {
    const { pts, cum, len } = P;
    s = Math.max(0, Math.min(len, s));
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
    const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
    // left of the direction of travel (y down on screen)
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty, nx: ty, ny: -tx };
  }
  const ptsD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');

  // how far a vertex's border is from its centre in direction (ux, uy)
  function reach(n, ux, uy) {
    if (!n.r && !n.hw) return 0;
    if (n.r) return n.r;
    const ax = Math.abs(ux), ay = Math.abs(uy);
    return Math.min(ax > 1e-9 ? n.hw / ax : Infinity, ay > 1e-9 ? n.hh / ay : Infinity);
  }

  function build(src) {
    const M = parse(src);
    const warnings = M.warnings.slice(), warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const at = place(M, warn);
    const nodes = new Map(), texts = [], shapes = [], paths = [], edges = [];
    // vertices
    for (const v of M.vertices) {
      const p = at.get(v.name), x = p[0] * PX, y = -p[1] * PX, st = styleOf(v);
      const n = { name: v.name, x, y, style: st, r: 0, hw: 0, hh: 0 };
      if (st === 'dot' || st === 'empty dot') n.r = DOT;
      else if (st === 'square dot') { n.hw = n.hh = DOT; }
      else if (st === 'crossed dot') n.r = CROSSED;
      else if (st === 'blob') n.r = BLOB;
      if (v.text) {
        const t = shown(v.text), b = TD.textBox(t, TEXT);
        if (!st) { n.hw = (b.w - 2) / 2 + INNER; n.hh = 0.4 * b.h + INNER; }
        texts.push({ t, x, y, b });
      }
      if (st) shapes.push({ kind: st, x, y, r: n.r || DOT });
      // label=above:text
      for (const it of v.o) {
        const { k, v: val } = kv(it);
        if (k !== 'label' || val == null) continue;
        const raw = unbrace(val), m = /^(above left|above right|below left|below right|above|below|left|right|-?[\d.]+)\s*:\s*([\s\S]*)$/.exec(raw);
        const dir = m ? m[1] : 'above', t = shown(unbrace(m ? m[2] : raw)), b = TD.textBox(t, TEXT);
        const ang = { right: 0, 'above right': 45, above: 90, 'above left': 135, left: 180, 'below left': 225, below: 270, 'below right': 315 }[dir] ?? parseFloat(dir);
        const ux = Math.cos((ang * Math.PI) / 180), uy = -Math.sin((ang * Math.PI) / 180);
        const d = reach(n, ux, uy) + INNER + Math.abs(ux) * ((b.w - 2) / 2) + Math.abs(uy) * (0.4 * b.h);
        texts.push({ t, x: x + ux * d, y: y + uy * d, b });
      }
      nodes.set(v.name, n);
    }
    // edges
    M.edges.forEach((e, idx) => {
      const A = nodes.get(e.a), B = nodes.get(e.b);
      if (!A || !B) return;
      const R = readEdgeOpts(e.o, null);
      const ink = R.color;
      let pts;
      const dx = B.x - A.x, dy = B.y - A.y, base = Math.atan2(-dy, dx) * 180 / Math.PI; // maths angle, y up
      if (e.a === e.b) { warn('An edge from a vertex to itself (a loop) isn\'t drawn here'); return; }
      const curved = R.bend != null || R.out != null || R.in != null;
      if (!curved) {
        const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        const ra = reach(A, ux, uy), rb = reach(B, -ux, -uy);
        pts = [[A.x + ux * ra, A.y + uy * ra], [B.x - ux * rb, B.y - uy * rb]];
      } else {
        const outA = R.out != null ? R.out : base + (R.bend || 0), inA = R.in != null ? R.in : base + 180 - (R.bend || 0);
        const u1 = [Math.cos(outA * Math.PI / 180), -Math.sin(outA * Math.PI / 180)], u2 = [Math.cos(inA * Math.PI / 180), -Math.sin(inA * Math.PI / 180)];
        const p0 = [A.x + u1[0] * reach(A, u1[0], u1[1]), A.y + u1[1] * reach(A, u1[0], u1[1])];
        const p3 = [B.x + u2[0] * reach(B, u2[0], u2[1]), B.y + u2[1] * reach(B, u2[0], u2[1])];
        const d = R.loose * 0.3915 * Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
        const c1 = [p0[0] + u1[0] * d, p0[1] + u1[1] * d], c2 = [p3[0] + u2[0] * d, p3[1] + u2[1] * d];
        pts = [];
        for (let k = 0; k <= 64; k++) {
          const t = k / 64, m = 1 - t;
          pts.push([m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]]);
        }
      }
      const P = polyline(pts), L = P.len;
      const sw = R.type === 'ghost' ? Math.max(R.width, 0.8 * PT) : R.width;
      // the line itself
      let line;
      if (R.type === 'photon' || /boson$/.test(R.type)) {
        const n = Math.max(1, Math.round(L / WAVE.per)), per = L / n, out = [];
        for (let j = 0; j <= 12 * n; j++) { const q = along(P, (j * per) / 12), o = WAVE.amp * Math.sin((2 * Math.PI * j) / 12); out.push([q.x + q.nx * o, q.y + q.ny * o]); }
        line = ptsD(out);
      } else if (R.type === 'gluon') {
        const span = L - 2 * COIL.rx, N = Math.max(1, Math.round(span / COIL.per - 0.5)), per = span / (N + 0.5), out = [];
        const steps = Math.ceil((N + 0.5) * 24);
        for (let j = 0; j <= steps; j++) {
          const ph = -Math.PI / 2 + (2 * Math.PI * (N + 0.5) * j) / steps;
          const s = (per * (ph + Math.PI / 2)) / (2 * Math.PI) + COIL.rx * (1 + Math.sin(ph));
          const q = along(P, s), o = -COIL.amp * Math.cos(ph);
          out.push([q.x + q.nx * o, q.y + q.ny * o]);
        }
        line = ptsD(out);
      } else line = ptsD(pts);
      const dash = /scalar$/.test(R.type) ? 'dash' : R.type === 'ghost' ? 'dot' : '';
      paths.push({ d: line, sw, dash, color: ink, edge: idx });
      // arrows
      const arrows = [];
      if (R.type === 'fermion' || R.type === 'charged boson' || R.type === 'charged scalar') arrows.push([0.5, 1]);
      if (R.type === 'anti fermion' || R.type === 'anti charged boson' || R.type === 'anti charged scalar') arrows.push([0.5, -1]);
      if (R.type === 'majorana') arrows.push([0.33, 1], [0.73, -1]);
      if (R.type === 'anti majorana') arrows.push([0.33, -1], [0.73, 1]);
      for (const [pos, dir] of arrows) {
        const q = along(P, pos * L), tx = q.tx * dir, ty = q.ty * dir;
        const tip = [q.x + tx * ARROW.ahead, q.y + ty * ARROW.ahead], bk = [tip[0] - tx * ARROW.len, tip[1] - ty * ARROW.len];
        shapes.push({ kind: 'tri', color: ink, d: `M${r2(tip[0])},${r2(tip[1])}L${r2(bk[0] + q.nx * ARROW.half)},${r2(bk[1] + q.ny * ARROW.half)}L${r2(bk[0] - q.nx * ARROW.half)},${r2(bk[1] - q.ny * ARROW.half)}Z` });
      }
      for (const pos of R.ins) {
        const q = along(P, pos * L), a = 3 * PT;
        const c = (u, v) => [q.x + q.tx * u + q.nx * v, q.y + q.ty * u + q.ny * v];
        const p1 = c(-a, -a), p2 = c(a, a), p3 = c(-a, a), p4 = c(a, -a);
        paths.push({ d: `M${r2(p1[0])},${r2(p1[1])}L${r2(p2[0])},${r2(p2[1])}M${r2(p3[0])},${r2(p3[1])}L${r2(p4[0])},${r2(p4[1])}`, sw: LW, color: ink });
      }
      // momentum arrows: parallel to the edge, 3mm to its left (or right), the label beyond
      for (const m of R.mom) {
        const o = m.side * m.dist, out = [];
        for (let j = 0; j <= 50; j++) { const q = along(P, (m.shorten + ((1 - 2 * m.shorten) * j) / 50) * L); out.push([q.x + q.nx * o, q.y + q.ny * o]); }
        if (m.rev) out.reverse();
        const MP = polyline(out), Lm = MP.len, end = along(MP, Lm);
        const back = (d) => [end.x - end.tx * d, end.y - end.ty * d];
        const shaft = out.filter((p, j) => MP.cum[j] < Lm - 2.5 * PT).concat([back(2.5 * PT)]);
        paths.push({ d: ptsD(shaft), sw: LW, color: ink });
        const tip = [end.x, end.y], b1 = back(3.58 * PT), b2 = back(2.41 * PT), hw = 1.35 * PT;
        shapes.push({ kind: 'tri', color: ink, d: `M${r2(tip[0])},${r2(tip[1])}L${r2(b1[0] + end.nx * hw)},${r2(b1[1] + end.ny * hw)}L${r2(b2[0])},${r2(b2[1])}L${r2(b1[0] - end.nx * hw)},${r2(b1[1] - end.ny * hw)}Z` });
        if (m.t) {
          const mid = along(MP, Lm / 2), side = m.side * (m.rev ? -1 : 1);
          texts.push(labelAt(m.t, mid, side));
        }
      }
      for (const lb of R.labels) if (lb.t) texts.push(labelAt(lb.t, along(P, L / 2), lb.side));
      edges.push({ i: idx, a: e.a, b: e.b, d: ptsD(pts), P, type: R.type, R });
    });
    // bounding box
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const p of paths) for (const m of p.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) { const x = +m[1], y = +m[2], h = (p.sw || LW) / 2; ext(x - h, y - h, x + h, y + h); }
    for (const s of shapes) {
      if (s.kind === 'tri') { for (const m of s.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1], +m[2], +m[1], +m[2]); }
      else ext(s.x - s.r - LW, s.y - s.r - LW, s.x + s.r + LW, s.y + s.r + LW);
    }
    for (const t of texts) ext(t.x - t.b.w / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
    for (const n of nodes.values()) ext(n.x, n.y, n.x, n.y);
    if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
    if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
    if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
    return { M, nodes, edges, paths, shapes, texts, warnings, empty: !M.vertices.length, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }
  // a label beside a path: TikZ's auto anchor, inner sep away from the line
  function labelAt(t, q, side) {
    t = shown(t);
    const b = TD.textBox(t, TEXT);
    const nx = q.nx * side, ny = q.ny * side;
    const d = INNER + Math.abs(nx) * ((b.w - 2) / 2) + Math.abs(ny) * (0.4 * b.h);
    return { t, x: q.x + nx * d, y: q.y + ny * d, b };
  }

  // ---------------------------------------------------------------- drawing
  // the north west lines of a blob, clipped to its circle
  function hatch(x, y, r, ink, id) {
    let d = '';
    const g = 3 * PT;
    for (let k = -r * 2; k <= r * 2; k += g) {
      // lines x - y = k (screen): from upper left to lower right
      const half = Math.sqrt(Math.max(0, r * r - (k * k) / 2));
      if (!half) continue;
      const cx = x + k / 2, cy = y - k / 2;
      d += `M${r2(cx - half * Math.SQRT1_2)},${r2(cy - half * Math.SQRT1_2)}L${r2(cx + half * Math.SQRT1_2)},${r2(cy + half * Math.SQRT1_2)}`;
    }
    return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
  }
  function draw(s, ctx) {
    const Lo = layout(s);
    const ink = TD.css(s.color || '#000000'), paper = ctx.paper || '#ffffff';
    let out = '';
    if (Lo.empty) {
      const b = Lo.bb;
      out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty Feynman diagram', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
    }
    for (const p of Lo.paths) {
      const col = p.color ? TD.css(p.color) : ink;
      const dash = p.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : p.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + p.sw)}" stroke-linecap="round"` : '';
      out += `<path d="${p.d}" fill="none" stroke="${col}" stroke-width="${r2(p.sw)}" stroke-linejoin="round"${dash}/>`;
    }
    for (const sh of Lo.shapes) {
      const col = sh.color ? TD.css(sh.color) : ink;
      if (sh.kind === 'tri') { out += `<path d="${sh.d}" fill="${col}" stroke="none"/>`; continue; }
      const { x, y, r } = sh;
      if (sh.kind === 'dot') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${ink}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
      else if (sh.kind === 'empty dot') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
      else if (sh.kind === 'square dot') out += `<rect x="${r2(x - r)}" y="${r2(y - r)}" width="${r2(2 * r)}" height="${r2(2 * r)}" fill="${ink}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
      else if (sh.kind === 'crossed dot') {
        const a = r * Math.SQRT1_2;
        out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="${ink}" stroke-width="${r2(LW)}"/><path d="M${r2(x - a)},${r2(y - a)}L${r2(x + a)},${r2(y + a)}M${r2(x - a)},${r2(y + a)}L${r2(x + a)},${r2(y - a)}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
      } else if (sh.kind === 'blob') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="none"/>${hatch(x, y, r, ink)}<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
    }
    for (const t of Lo.texts) out += TD.textSvg(t.t, TEXT, s.color || '#000000', t.x, t.y, ctx);
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{feynman\}/.test(t) ? t : `\\begin{feynman}\n${t}\n\\end{feynman}`;
  }

  // a small drawing of a snippet (palette previews)
  TD.feynMini = (src, maxH = 30) => {
    const s = { type: 'feynman', x: 0, y: 0, src, color: 'currentColor' };
    const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
    return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
  };

  TD.TYPES.feynman = {
    name: 'Feynman diagram',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'feynman', x: p.x, y: p.y, src: TD.FEYN_DEFAULT, color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the diagram's own coordinates, in a scope moved to where the drawing sits
    tikz(s, X) {
      X.pkgs.add('tikz-feynman');
      const b = layout(s).bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`];
      const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
      if (col) o.push(`color=${col}`);
      return `\\begin{scope}[${o.join(', ')}]\n${fullCode(s.src)}\n\\end{scope}`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.feynman = {
    html(s) {
      const L = layout(s);
      return `<div class="sec"><div class="sec-title">Feynman <small>${L.M.vertices.length} vertices · ${L.M.edges.length} lines</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="9">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the diagram to edit it visually. Exported with <code>\\usepackage{tikz-feynman}</code>; builds with pdfLaTeX.</div></div>
        <div class="sec"><button class="wide primary" data-act="editfeyn">Edit Feynman…</button><button class="wide" data-act="copyfeyn">Copy Feynman Code</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editfeyn') { if (TD.feynOpen) TD.feynOpen(s.id); return; }
      if (act !== 'copyfeyn') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Feynman Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied Feynman code';
    },
  };
  // for the visual editor (js/fyeditor.js)
  TD.feyn = { parse, write, layout, draw, along, polyline, readEdgeOpts, kv, opts, unbrace, styleOf, fullCode, shown, num, EDGE_TYPES, VERTEX_STYLES, TEXT };
  // Application integration belongs to the block, alongside its model and panel.
  TD.blocks.register("feynman", {
    menu: { order: 7, label: "Feynman", title: "Feynman diagram, written for tikz-feynman", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M3 3l7 9-7 9M29 3l-7 9 7 9\"/><path d=\"M10 12c1-2.5 2-2.5 3 0s2 2.5 3 0 2-2.5 3 0 2 2.5 3 0\" class=\"a1\"/><path d=\"M5.6 6.4l2.2.2-.3-2.2M7.5 19.6l-2.2.2.3-2.2\" /></svg>" },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    editor: { get: () => TD.feynEditor, alias: "feynOpen", layout: (s) => TD.feyn.layout(s) }
  });
})();
