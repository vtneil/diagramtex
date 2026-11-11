// Commutative diagrams written with tikz-cd. The source is the object: it is drawn here as vectors,
// following the package's own sizes (cells, separations, arrow tips, labels), and exported unchanged
// inside \begin{tikzcd}. The visual editor (js/cdeditor.js) rewrites the code cell by cell.
// Older XyMatrix shapes (a cell grid plus an arrow list) become tikz-cd code when a file is opened.
(function () {
  const TD = window.TD, Z = TD.zx;
  const { r2, esc } = TD.util;
  const f = TD.fmt;
  const PX = TD.PX_PER_CM, MM = PX / 10, PT = 1 / TD.PT_PER_PX;
  const EM = 10 * PT, EX = 4.31 * PT; // Computer Modern at 10pt
  const LW = 0.4 * PT; // rule_thickness

  TD.CD_DEFAULT = [
    '\\begin{tikzcd}',
    '  A \\arrow[r, "f"] \\arrow[d, "g"\'] & B \\arrow[d, "h"] \\\\',
    '  C \\arrow[r, "k"\']                  & D',
    '\\end{tikzcd}',
  ].join('\n');

  const SEPS = {
    row: { huge: 3.6, large: 2.7, normal: 1.8, scriptsize: 1.35, small: 0.9, tiny: 0.45 },
    column: { huge: 4.8, large: 3.6, normal: 2.4, scriptsize: 1.8, small: 1.2, tiny: 0.6 },
  };
  TD.CD_SEPS = ['tiny', 'small', 'scriptsize', 'normal', 'large', 'huge'];

  // ---------------------------------------------------------------- parsing
  const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  function unwrap(src) {
    src = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const m = /\\begin\{tikzcd\}/.exec(src);
    if (!m) return { env: '', inner: src };
    let i = skipWs(src, m.index + m[0].length), env = '';
    if (src[i] === '[') { const j = Z.close(src, i); if (j > 0) { env = src.slice(i + 1, j); i = j + 1; } }
    const e = src.indexOf('\\end{tikzcd}', i);
    return { env, inner: src.slice(i, e < 0 ? src.length : e) };
  }
  const ARROWS = Z.ARROWS; // \ar \arrow \rar \lar \dar \uar \urar \ular \drar \dlar
  // one cell: its maths (t) and its arrows ({ dirs, items, cmd }); items keep every option but the direction
  function cell(text) {
    const out = { t: '', arrows: [], node: null };
    let i = 0, t = '';
    // |[options]| before the maths: the node's own options (kept, not drawn)
    { const k = skipWs(text, 0); if (text[k] === '|' && text[k + 1] === '[') { const j = Z.close(text, k + 1); if (j > 0 && text[j + 1] === '|') { out.node = text.slice(k + 2, j); i = j + 2; } } }
    const optArg = () => { const k = skipWs(text, i); if (text[k] !== '[') return null; const j = Z.close(text, k); if (j < 0) return null; i = j + 1; return text.slice(k + 1, j); };
    const arg = () => { const k = skipWs(text, i); if (text[k] !== '{') return null; const j = Z.close(text, k); if (j < 0) return null; i = j + 1; return text.slice(k + 1, j); };
    while (i < text.length) {
      const c = text[i];
      if (c === '{') { const j = Z.close(text, i); const k = j < 0 ? text.length : j + 1; t += text.slice(i, k); i = k; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+)/.exec(text.slice(i));
        if (m && m[1] in ARROWS) {
          i += m[0].length;
          const name = m[1];
          let o = optArg();
          const list = Z.opts(o || '').list;
          let dirs = ARROWS[name];
          if (!dirs) {
            if (list.length && /^[rlud]*$/.test(list[0])) dirs = list.shift();
            else if (o == null || !list.some((x) => /^[rlud]+$/.test(x))) {
              // the old syntax: \arrow[opts]{dir}{label}
              const d = arg();
              if (d != null && /^[rlud]+$/.test(d.trim())) {
                dirs = d.trim();
                // \arrow{u}[label options]{label}
                const lo = optArg(), lab = arg();
                if (lo != null) list.push(`"{${(lab || '').trim()}}"{${lo}}`);
                else if (lab != null && lab.trim()) list.unshift(`"${lab.trim()}"`);
              }
            } else { const k = list.findIndex((x) => /^[rlud]+$/.test(x)); dirs = list.splice(k, 1)[0]; }
          } else if (o == null) {
            // \rar{f}: the old shortcut with a label
            const k = skipWs(text, i);
            if (text[k] === '{') { const lab = arg(); if (lab && lab.trim()) list.unshift(`"${lab.trim()}"`); }
          }
          out.arrows.push({ dirs: dirs || '', items: list, cmd: name });
          continue;
        }
        if (m) { t += m[0]; i += m[0].length; continue; }
        t += text.slice(i, i + 2); i += 2; continue;
      }
      t += c; i++;
    }
    out.t = t.trim();
    return out;
  }
  function parse(src) {
    const { env, inner } = unwrap(src);
    const E = Z.opts(env);
    const amp = /ampersand replacement/.test(env);
    const rows = Z.grid(inner, amp);
    const cells = rows.map((r) => r.cells.map((c) => cell(c.text)));
    return { env: E, rows, cells, amp };
  }
  // a label item: "text"' / "text" description / "{text}"{above} → { t, swap, opts[] } (null if not a label)
  function label(item) {
    const s = String(item).trim();
    if (s[0] !== '"') return null;
    let d = 0, j = 1;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
      else if (c === '"' && d === 0) break;
    }
    let t = s.slice(1, j), rest = s.slice(j + 1).trim(), swap = false;
    if (/^\{[\s\S]*\}$/.test(t)) t = t.slice(1, -1);
    if (rest[0] === "'") { swap = true; rest = rest.slice(1).trim(); }
    let opts = [];
    if (rest[0] === '{') { const k = Z.close(rest, 0); opts = Z.opts(rest.slice(1, k < 0 ? rest.length : k)).list; }
    // "f" near start: one key of a few words (a position), else words that are keys of their own ("f" description)
    else if (rest) opts = /^(very near|near|at) (start|end)$|^midway$/.test(rest) ? [rest] : rest.split(/\s+(?=[a-z])/).map((x) => x.trim()).filter(Boolean);
    if (opts.includes('swap') || opts.includes("'")) { swap = !swap; opts = opts.filter((x) => x !== 'swap' && x !== "'"); }
    return { t, swap, opts };
  }
  function labelCode(L) {
    const t = /[",]|^\s|\s$/.test(L.t) && !/^\{.*\}$/.test(L.t) ? `{${L.t}}` : L.t;
    const o = L.opts.filter(Boolean);
    return `"${t}"${L.swap ? "'" : ''}${o.length ? (o.length === 1 && /^[a-z ]+$/.test(o[0]) ? ` ${o[0]}` : `{${o.join(', ')}}`) : ''}`;
  }

  // ---------------------------------------------------------------- lengths
  function length(v, unitless = PT) {
    v = String(v || '').trim().replace(/^\+/, '');
    if (!v) return 0;
    const m = /^(-?)\s*([\d.]*)\s*(cm|mm|pt|pc|em|ex|in|bp)?$/.exec(v);
    if (!m) return null;
    const n = m[2] === '' ? 1 : parseFloat(m[2]);
    if (!isFinite(n)) return null;
    const u = m[3];
    const px = !u ? unitless : u === 'cm' ? PX : u === 'mm' ? MM : u === 'in' ? 2.54 * PX : u === 'em' ? EM : u === 'ex' ? EX : u === 'bp' ? 1.00375 * PT : u === 'pc' ? 12 * PT : PT;
    return (m[1] ? -1 : 1) * n * px;
  }
  // row sep / column sep: a name, a length, or {length, between origins}
  function sepValue(kind, v, warn) {
    const out = { px: 0, origins: false };
    for (const part of Z.opts(String(v || '').replace(/^\{([\s\S]*)\}$/, '$1')).list) {
      if (part === 'between origins') { out.origins = true; continue; }
      if (part === 'between borders') continue;
      if (SEPS[kind][part] != null) { out.px += SEPS[kind][part] * EM; continue; }
      const l = length(part);
      if (l == null) warn(`The ${kind} sep "${part}" isn't understood here`); else out.px += l;
    }
    return out;
  }

  // ---------------------------------------------------------------- curves
  const bez = (p0, c1, c2, p1) => ({ p0, c1, c2, p1 });
  const at = Z.at;
  const tan = (s, t) => {
    const u = 1 - t;
    const x = 3 * u * u * (s.c1.x - s.p0.x) + 6 * u * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.p1.x - s.c2.x);
    const y = 3 * u * u * (s.c1.y - s.p0.y) + 6 * u * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.p1.y - s.c2.y);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const line = (a, b) => bez(a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 }, b);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  // the part of a cubic between t0 and t1
  function sub(s, t0, t1) {
    const split = (q, t) => { // → the right part from t
      const a = lerp(q.p0, q.c1, t), b = lerp(q.c1, q.c2, t), c = lerp(q.c2, q.p1, t), d = lerp(a, b, t), e = lerp(b, c, t), m = lerp(d, e, t);
      return [bez(q.p0, a, d, m), bez(m, e, c, q.p1)];
    };
    let r = t0 > 0 ? split(s, t0)[1] : s;
    if (t1 < 1) r = split(r, (t1 - t0) / (1 - t0))[0];
    return r;
  }
  // the parameter at a distance from the start (or, negative, from the end)
  function tAt(s, dist) {
    const N = 48, pts = [];
    for (let i = 0; i <= N; i++) pts.push(at(s, i / N));
    const acc = [0];
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = acc[N], want = dist >= 0 ? dist : L + dist;
    if (want <= 0) return 0;
    if (want >= L) return 1;
    for (let i = 1; i <= N; i++) if (acc[i] >= want) return (i - 1 + (want - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1)) / N;
    return 1;
  }
  const curveD = (s) => `M${r2(s.p0.x)},${r2(s.p0.y)}C${r2(s.c1.x)},${r2(s.c1.y)} ${r2(s.c2.x)},${r2(s.c2.y)} ${r2(s.p1.x)},${r2(s.p1.y)}`;
  // TikZ's zigzag decoration along a curve (squiggly arrows)
  function zigzag(s, seg, amp, pre, post) {
    const N = 96, pts = [];
    for (let i = 0; i <= N; i++) pts.push(at(s, i / N));
    const acc = [0];
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = acc[N];
    const pointAt = (d) => { for (let i = 1; i <= N; i++) if (acc[i] >= d) { const t = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1); return { p: lerp(pts[i - 1], pts[i], t), u: { x: (pts[i].x - pts[i - 1].x) / ((acc[i] - acc[i - 1]) || 1), y: (pts[i].y - pts[i - 1].y) / ((acc[i] - acc[i - 1]) || 1) } }; } return { p: pts[N], u: { x: 1, y: 0 } }; };
    const mid = L - pre - post;
    if (mid < seg) return `M${r2(pts[0].x)},${r2(pts[0].y)}` + pts.slice(1).map((p) => `L${r2(p.x)},${r2(p.y)}`).join('');
    const n = Math.max(1, Math.floor(mid / seg)), sl = mid / n;
    let d = `M${r2(pts[0].x)},${r2(pts[0].y)}`;
    const P = (dist, off) => { const q = pointAt(dist); return `L${r2(q.p.x + q.u.y * off)},${r2(q.p.y - q.u.x * off)}`; };
    d += P(pre, 0);
    for (let k = 0; k < n; k++) { const b = pre + k * sl; d += P(b + sl / 4, amp) + P(b + (3 * sl) / 4, -amp); }
    d += P(pre + mid, 0) + `L${r2(pts[N].x)},${r2(pts[N].y)}`;
    return d;
  }

  // ---------------------------------------------------------------- arrow styles
  // the arrow's look from its options: tips at the end (head) and start (tail), double line, dashes …
  const HEADS = {
    to: { head: 'to' }, rightarrow: { head: 'to', tail: null }, '->': { head: 'to', tail: null },
    'no head': { head: null }, dash: { head: null, tail: null }, '-': { head: null, tail: null }, 'no tail': { tail: null }, 'to head': { head: 'to' },
    'two heads': { head: 'to2' }, twoheadrightarrow: { head: 'to2', tail: null }, '->>': { head: 'to2', tail: null }, twoheadleftarrow: { head: null, tail: 'to2' },
    hook: { tail: 'hook' }, "hook'": { tail: "hook'" }, hookrightarrow: { head: 'to', tail: 'hook' }, hookleftarrow: { head: "hook'", tail: 'to', hookEnd: true },
    tail: { tail: 'tail' }, rightarrowtail: { head: 'to', tail: 'tail' }, leftarrowtail: { head: 'tail', tail: 'to' }, '>->': { head: 'to', tail: 'tail' },
    'maps to': { tail: 'bar' }, mapsto: { head: 'to', tail: 'bar' }, '|->': { head: 'to', tail: 'bar' }, mapsfrom: { head: 'bar', tail: 'to' },
    harpoon: { head: 'harpoon' }, "harpoon'": { head: "harpoon'" },
    rightharpoonup: { head: 'harpoon', tail: null }, rightharpoondown: { head: "harpoon'", tail: null }, leftharpoonup: { head: null, tail: "harpoon'" }, leftharpoondown: { head: null, tail: 'harpoon' },
    leftarrow: { head: null, tail: 'to' }, '<-': { head: null, tail: 'to' }, leftrightarrow: { head: 'to', tail: 'to' }, '<->': { head: 'to', tail: 'to' },
    Rightarrow: { head: 'implies', tail: null, dbl: true }, Leftarrow: { head: null, tail: 'implies', dbl: true }, Leftrightarrow: { head: 'implies', tail: 'implies', dbl: true },
    Mapsto: { head: 'implies', tail: 'bar', dbl: true }, Mapsfrom: { head: 'bar', tail: 'implies', dbl: true },
    equal: { head: null, tail: null, dbl: true }, equals: { head: null, tail: null, dbl: true }, Equal: { head: null, tail: null, dbl: true },
    dashrightarrow: { head: 'to', tail: null, dash: 'dashed' }, dashleftarrow: { head: null, tail: 'to', dash: 'dashed' },
    squiggly: { squig: true }, rightsquigarrow: { head: 'to', tail: null, squig: true }, leftsquigarrow: { head: null, tail: 'to', squig: true }, leftrightsquigarrow: { head: 'to', tail: 'to', squig: true },
  };
  TD.CD_HEADS = HEADS;
  const POS = { 'at start': 0, 'very near start': 0.125, 'near start': 0.25, midway: 0.5, 'near end': 0.75, 'very near end': 0.875, 'at end': 1 };
  const COMPASS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], 'north east': [1, -1], 'north west': [-1, -1], 'south east': [1, 1], 'south west': [-1, 1], center: [0, 0] };
  // arrow options → look
  // PR: another package's geometry (xy.js) — PR.item reads the options only that package has
  let DEFS = {};
  const unbrace = (v) => String(v == null ? '' : v).trim().replace(/^\{([\s\S]*)\}$/, '$1');
  // name/.style={…} definitions: in \tikzset{…} or \tikzcdset{…} around the diagram, or in its options
  function styleDefs(src, envList) {
    const out = {};
    const add = (it) => { const m = /^([^=]+?)\s*\/\.style\s*=\s*([\s\S]*)$/.exec(it.trim()); if (!m) return false; out[m[1].trim()] = unbrace(m[2]).replace(/\s+/g, ' '); return true; };
    const re = /\\tikz(?:cd)?set\s*\{/g;
    let m;
    const text = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    while ((m = re.exec(text))) { const i = m.index + m[0].length - 1, j = Z.close(text, i); if (j < 0) break; Z.opts(text.slice(i + 1, j)).list.forEach(add); re.lastIndex = j; }
    for (const it of envList || []) add(it);
    return out;
  }
  function style(items, warn, PR) {
    const A = { head: 'to', tail: null, dbl: false, dash: null, squig: false, cross: false, phantom: false, color: null, lw: LW, bend: null, inA: null, outA: null, loose: 1, shift: 0, sa: null, ea: null, sh0: 0, sh1: 0, swap: false, desc: false, labels: [], pos: null, curve: null };
    const work = items.slice();
    let guard = 0;
    while (work.length) {
      const it = work.shift();
      const L = label(it);
      if (L) { A.labels.push(L); continue; }
      const { name, arg } = Z.styleOf(it);
      if (PR && PR.item && PR.item(A, name, arg, it, warn)) continue;
      // a style of the user's own (\tikzset{name/.style={…}}): its keys, with #1 its argument
      if (DEFS[name] != null && guard++ < 200) { work.unshift(...Z.opts(DEFS[name].replace(/#1/g, arg == null ? '' : unbrace(arg))).list); continue; }
      if (name === 'rounded corners') { const l = arg == null ? 4 * PT : length(unbrace(arg)); A.rc = l == null ? 4 * PT : l; continue; }
      if (name === 'sharp corners') { A.rc = 0; continue; }
      if (name === 'to path') { A.toPath = unbrace(arg || ''); continue; }
      if (name === 'execute at begin to' || name === 'from' || name === 'to') continue;
      if (HEADS[name] && arg == null) { Object.assign(A, HEADS[name]); continue; }
      if (name === 'dashed') { A.dash = 'dashed'; continue; }
      if (name === 'dotted' || name === 'densely dotted' || name === 'loosely dotted') { A.dash = 'dotted'; continue; }
      if (name === 'crossing over') { A.cross = true; continue; }
      if (name === 'phantom') { A.phantom = true; continue; }
      if (name === 'description') { A.desc = true; continue; }
      if (name === 'swap' || name === "'") { A.swap = true; continue; }
      if (name === 'bend left' || name === 'bend right') { A.bend = (name === 'bend left' ? 1 : -1) * (arg ? parseFloat(arg) || 0 : 30); continue; }
      if (name === 'in') { A.inA = parseFloat(arg); continue; }
      if (name === 'out') { A.outA = parseFloat(arg); continue; }
      if (name === 'looseness') { A.loose = parseFloat(arg) || 1; continue; }
      if (name === 'shift left' || name === 'shift right') {
        const dflt = PR && PR.shift != null ? PR.shift : 0.56 * EX;
        const l = arg == null ? dflt : length(arg, dflt);
        if (l == null) { warn(`"${it}" isn't understood here`); continue; }
        A.shift += (name === 'shift left' ? 1 : -1) * l; continue;
      }
      if (name === 'start anchor' || name === 'end anchor') {
        const a = String(arg || '').replace(/^\{|\}$/g, '').trim();
        if (a && !COMPASS[a]) warn(`The anchor "${a}" isn't drawn here (it is kept in the code)`);
        if (name === 'start anchor') A.sa = a; else A.ea = a;
        continue;
      }
      if (/^shorten\s*(<|>)?$/.test(name)) {
        const l = length(arg);
        if (l == null) { warn(`"${it}" isn't understood here`); continue; }
        if (!/>/.test(name)) A.sh0 = l;
        if (!/</.test(name)) A.sh1 = l;
        continue;
      }
      if (name === 'pos') { A.pos = parseFloat(arg); continue; }
      if (name in POS) { A.pos = POS[name]; continue; }
      if (name === 'thick') { A.lw = 0.8 * PT; continue; }
      if (name === 'very thick') { A.lw = 1.2 * PT; continue; }
      if (name === 'thin') { A.lw = LW; continue; }
      if (name === 'line width') { const l = length(arg); if (l != null) { A.lw = l; continue; } }
      if (name === 'color' || name === 'draw') { const k = TD.tikzColor && TD.tikzColor(arg); if (k) { A.color = k; continue; } if (arg === 'none') { A.phantom = true; continue; } }
      const k = arg == null && TD.tikzColor && TD.tikzColor(name);
      if (k) { A.color = k; continue; }
      warn(`The arrow option "${it}" isn't drawn here (it is kept in the code)`);
    }
    return A;
  }

  // ---------------------------------------------------------------- layout
  const NORMAL = { size: 10 * PT, font: 'default' }, LABEL = { size: 7 * PT, font: 'default' };
  // the measured line is a little taller than TeX's box: keep about the maths' own height
  const HK = 0.68;
  // A cell is TeX's box of its maths (height + depth) plus 0.85ex above and below. The measured line is
  // taller by about a constant, taken from an A (6.83pt, no depth); the box sits 0.9pt above the maths
  // axis, where tikz-cd's asymmetrical rectangle puts its centre (A: 8pt above the axis, 6.2pt below).
  const TXT_DY = 1.4, BB_DY = 0.2, LAB_PAD = 1.2; // text lower, drawing within TeX's picture box (whose label nodes keep their inner sep)
  const strutH = (b) => { const m = /katex-strut" style="height:([\d.]+)em/.exec(b.html || ''); return m ? +m[1] * b.px : HK * b.h; };
  const mathOf = (t) => (/\$/.test(t) ? t : `$${t}$`);
  const cache = new Map();
  function layout(s) {
    if (s.arrows) upgrade(s);
    const key = [s.src, TD.math && TD.math.engine, s.minCell || 0].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s);
    if (TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

  function build(s, PR) {
    const P = parse(s.src);
    const warnings = [];
    const warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    let rs = { px: SEPS.row.normal * EM, origins: false }, cs = { px: SEPS.column.normal * EM, origins: false };
    if (PR) { rs = { px: PR.rs, origins: false }; cs = { px: PR.cs, origins: false }; }
    const every = [];
    DEFS = styleDefs(s.src, P.env.list);
    let textH = null, textD = null;
    for (const it of P.env.list) {
      const { name, arg } = Z.styleOf(it);
      if (PR && name === 'xy') continue;
      if (/\/\.style\s*$/.test(name)) continue;
      if (name === 'cells' || name === 'nodes') {
        const v = String(arg || '');
        const h = /text height\s*=\s*([^,}]+)/.exec(v), d = /text depth\s*=\s*([^,}]+)/.exec(v);
        if (h) textH = length(h[1].trim());
        if (d) textD = length(d[1].trim());
        if (h || d) continue;
      }
      if (name === 'row sep') { rs = sepValue('row', arg, warn); continue; }
      if (name === 'column sep') { cs = sepValue('column', arg, warn); continue; }
      if (name === 'sep') { rs = sepValue('row', arg, warn); cs = sepValue('column', arg, warn); continue; }
      if (name === 'arrows' || name === 'every arrow/.append style') { every.push(...Z.opts(String(arg || '').replace(/^\{([\s\S]*)\}$/, '$1')).list); continue; }
      if (/^(ampersand replacement|baseline|1-row diagram|math mode|cramped|background color|execute at end picture|remember picture|nodes in empty cells)$/.test(name)) continue;
      if (it === 'cramped') continue;
      warn(`The diagram option "${it}" isn't drawn here (it is kept in the code)`);
    }
    const cells = P.cells, R = cells.length, C = Math.max(0, ...cells.map((r) => r.length));
    if (!R || !C || cells.every((r) => r.every((c) => !c.t && !c.arrows.length))) {
      return { empty: true, bb: { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }, warnings, R: 0, C: 0, P, arrows: [], nodes: [], labels: [] };
    }
    // cells: TeX's box of the maths, with 0.85ex of inner sep above and below, hung on the baseline; arrows run at the maths
    // axis (2.5pt above it), so a cell reaches (height + sep - axis) above the arrow line and (depth + sep + axis) below it.
    const AXIS = 2.5 * PT, ISEP = PR ? PR.margin : 0.85 * EX, XSEP = PR ? PR.margin : EX;
    const look = cells.map((r) => r.map((c) => {
      if (!c.t) return null;
      const b = TD.textBox(mathOf(c.t), NORMAL);
      const m = /katex-strut" style="height:([\d.]+)em(?:;vertical-align:(-?[\d.]+)em)?/.exec(b.html || '');
      let ht = 6.83 * PT, dp = 0;
      if (m) { dp = Math.max(0, -(+m[2] || 0)) * b.px; ht = +m[1] * b.px - dp; }
      if (textH != null) ht = textH;
      if (textD != null) dp = textD;
      let up = Math.max(ht, 0) + ISEP - AXIS, down = dp + ISEP + AXIS;
      const need = s.minCell || 0;
      if (up + down < need) { const e = (need - up - down) / 2; up += e; down += e; }
      return { b, w: b.w - 2 + 2 * XSEP, up, down, h: up + down };
    }));
    const colW = Array(C).fill(0), rowUp = Array(R).fill(0), rowDn = Array(R).fill(0);
    for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) { const m = look[r][c]; if (m) { colW[c] = Math.max(colW[c], m.w); rowUp[r] = Math.max(rowUp[r], m.up); rowDn[r] = Math.max(rowDn[r], m.down); } }
    if (s.minCell) for (let c = 0; c < C; c++) colW[c] = Math.max(colW[c], s.minCell);
    const rowH = rowUp.map((u, r) => u + rowDn[r]);
    // &[…] and \\[…] add to the separation before that column / after that row
    const colX = Array(C).fill(0), rowX = Array(R).fill(0);
    const extra = (v, kind) => { const o = sepValue(kind, v, warn); return o.px; };
    P.rows.forEach((row, r) => {
      row.cells.forEach((cl, c) => { if (c && cl.colSep) colX[c] = Math.max(colX[c], extra(cl.colSep, 'column')); });
      if (row.rowSep && r < R - 1) rowX[r + 1] = extra(row.rowSep, 'row');
    });
    const colL = [], cx = [], rowT = [], cy = [];
    let x = 0;
    for (let c = 0; c < C; c++) {
      if (c && cs.origins) { cx[c] = cx[c - 1] + cs.px + colX[c]; colL[c] = cx[c] - colW[c] / 2; }
      else { if (c) x += cs.px + colX[c]; colL[c] = x; cx[c] = x + colW[c] / 2; }
      x = colL[c] + colW[c];
    }
    let y = 0;
    for (let r = 0; r < R; r++) {
      if (r && rs.origins) cy[r] = cy[r - 1] + rs.px + rowX[r];
      else cy[r] = r ? y + rs.px + rowX[r] + rowUp[r] : rowUp[r];
      rowT[r] = cy[r] - rowUp[r];
      y = cy[r] + rowDn[r];
    }
    const nodeAt = (r, c) => { const m = look[r] && look[r][c]; return { x: cx[c], y: cy[r], oy: m ? (m.down - m.up) / 2 : 0, w: m ? m.w : 0, h: m ? m.h : 0 }; };
    const nodes = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const m = look[r][c]; if (m) nodes.push({ x: cx[c], y: cy[r], oy: (m.down - m.up) / 2, w: m.w, h: m.h, t: mathOf(cells[r][c].t), b: m.b, cell: [r, c] }); }

    // a point on a node's border: from p along u (leaving the box), or in a direction (TikZ degrees)
    const exit = (n, p, u) => {
      if (!n.w && !n.h) return p;
      const a = n.w / 2, b = n.h / 2, ny = n.y + (n.oy || 0);
      let t = Infinity;
      if (u.x > 1e-9) t = Math.min(t, (n.x + a - p.x) / u.x); else if (u.x < -1e-9) t = Math.min(t, (n.x - a - p.x) / u.x);
      if (u.y > 1e-9) t = Math.min(t, (ny + b - p.y) / u.y); else if (u.y < -1e-9) t = Math.min(t, (ny - b - p.y) / u.y);
      return t > 0 && isFinite(t) ? { x: p.x + u.x * t, y: p.y + u.y * t } : p;
    };
    const ray = (n, deg) => { const a = (deg * Math.PI) / 180; return exit(n, n, { x: Math.cos(a), y: -Math.sin(a) }); };
    const compass = (n, a) => { const k = COMPASS[a]; return k ? { x: n.x + (k[0] * n.w) / 2, y: n.y + (n.oy || 0) + (k[1] * n.h) / 2 } : null; };

    const arrows = [], labels = [], later = [], names = {};
    const base = every.length ? style(every, warn) : null;
    for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) cells[r][c].arrows.forEach((ar, ai) => {
      // from=ul / to=dr: the arrow written in the cell at its other end
      let dirs = ar.dirs, back = false;
      if (!dirs) { const k = ar.items.map((x) => /^(from|to)\s*=\s*([rlud]+)\s*$/.exec(x)).find(Boolean); if (k) { dirs = k[2]; back = k[1] === 'from'; } }
      if (!dirs) { warn('An arrow with no direction (like \\arrow[r]) is skipped'); return; }
      const [dr, dc] = delta(dirs);
      const r1 = back ? r + dr : r, c1 = back ? c + dc : c, r2_ = back ? r : r + dr, c2 = back ? c : c + dc;
      const inside = (a, b) => a >= 0 && a < R && b >= 0 && b < C;
      if (!inside(r1, c1) || !inside(r2_, c2) || (!dr && !dc)) { warn(`An arrow from row ${r + 1}, column ${c + 1} points outside the diagram`); return; }
      const A = style(every.concat(ar.items), warn, PR);
      void base;
      const S = nodeAt(r1, c1), T = nodeAt(r2_, c2);
      if (A.toPath) { later.push({ A, S, T, src: [r, c, ai], to: [r2_, c2] }); return; }
      if (A.turns && A.turns.length) {
        const g = xyTurns(A, S, T, r1, c1);
        if (g) { arrows.push({ seg: g.seg, route: g.els, A, src: [r, c, ai], to: [r2_, c2] }); g.pieces.forEach((pc, i) => (A.turns[i].labels || []).forEach((L, li) => placeLabel(PR.label(L), A, pc, [r, c, ai, 100 + i * 10 + li]))); A.labels.forEach((L, li) => placeLabel(L, A, g.seg, [r, c, ai, li])); return; }
      }
      const d = { x: T.x - S.x, y: T.y - S.y }, dl = Math.hypot(d.x, d.y) || 1, u = { x: d.x / dl, y: d.y / dl };
      let seg;
      if (A.curve != null && A.bend != null) {
        // xy's @/^d/: a curve whose middle sits d off the straight line, to the left (^) or right (_)
        const p = (A.sa && compass(S, A.sa)) || S, q = (A.ea && compass(T, A.ea)) || T;
        const nl = { x: u.y, y: -u.x }, h = (Math.sign(A.bend) * A.curve) / 0.75;
        const c1 = { x: p.x + (q.x - p.x) / 3 + nl.x * h, y: p.y + (q.y - p.y) / 3 + nl.y * h }, c2 = { x: p.x + (2 * (q.x - p.x)) / 3 + nl.x * h, y: p.y + (2 * (q.y - p.y)) / 3 + nl.y * h };
        const full = bez(p, c1, c2, q);
        // from the source's border to the target's: cut where the curve leaves each box
        const inBox = (n, pt) => Math.abs(pt.x - n.x) <= n.w / 2 && Math.abs(pt.y - (n.y + (n.oy || 0))) <= n.h / 2;
        let t0 = 0, t1 = 1;
        for (let i = 1; i <= 200; i++) { if (!inBox(S, at(full, i / 200))) { t0 = i / 200; break; } }
        for (let i = 199; i >= 0; i--) { if (!inBox(T, at(full, i / 200))) { t1 = i / 200; break; } }
        seg = t1 > t0 ? sub(full, t0, t1) : full;
      } else if (A.bend != null || A.inA != null || A.outA != null) {
        const phi = (Math.atan2(-d.y, d.x) * 180) / Math.PI;
        const outA = A.outA != null ? A.outA : phi + (A.bend || 0), inA = A.inA != null ? A.inA : phi + 180 - (A.bend || 0);
        const p = (A.sa && compass(S, A.sa)) || ray(S, outA), q = (A.ea && compass(T, A.ea)) || ray(T, inA);
        const k = 0.3915 * A.loose * Math.hypot(q.x - p.x, q.y - p.y);
        const U = (a) => { a = (a * Math.PI) / 180; return { x: Math.cos(a), y: -Math.sin(a) }; };
        const uo = U(outA), ui = U(inA);
        seg = bez(p, { x: p.x + k * uo.x, y: p.y + k * uo.y }, { x: q.x + k * ui.x, y: q.y + k * ui.y }, q);
      } else {
        // shift left/right moves both ends sideways (left of the direction, as TikZ sees it)
        const nl = { x: u.y, y: -u.x }, o = { x: nl.x * A.shift, y: nl.y * A.shift };
        const S2 = { x: S.x + o.x, y: S.y + o.y }, T2 = { x: T.x + o.x, y: T.y + o.y };
        const p = (A.sa && compass(S, A.sa)) || exit(S, S2, u), q = (A.ea && compass(T, A.ea)) || exit(T, T2, { x: -u.x, y: -u.y });
        seg = line(p, q);
      }
      if (A.sh0 || A.sh1) { const t0 = A.sh0 ? tAt(seg, A.sh0) : 0, t1 = A.sh1 ? tAt(seg, -A.sh1) : 1; if (t1 > t0) seg = sub(seg, t0, t1); }
      arrows.push({ seg, A, src: [r, c, ai], to: [r2_, c2] });
      A.ends = { S, T };
      A.labels.forEach((L, li) => placeLabel(L, A, seg, [r, c, ai, li]));
    });
    // labels: at the middle (or pos), on the left of the arrow (auto), ' puts them on the right; name= keeps the point
    function placeLabel(L, A, seg, src) {
      {
        let named = null, coord = false;
        for (const o of L.opts) { const { name, arg } = Z.styleOf(o); if (name === 'name') named = unbrace(arg); else if (name === 'shape' && unbrace(arg) === 'coordinate') coord = true; }
        if (!L.t && !named) return;
        let pos = A.pos != null ? A.pos : 0.5, swap = A.swap !== L.swap, desc = A.desc || A.phantom, fill = A.desc;
        for (const o of L.opts) {
          const { name, arg } = Z.styleOf(o);
          if (name in POS) pos = POS[name];
          else if (name === 'pos') pos = parseFloat(arg) || 0;
          else if (name === 'description') { desc = true; fill = true; }
          else if (name === 'marking') desc = true;
          else if (name === 'swap') swap = !swap;
          else if (PR && PR.at && name === 'xy at') {
            const v = PR.at(arg);
            if (typeof v === 'number') pos = v;
            else if (v) {
              // xy's (f) with no < or > counts from the entries' centres, not the arrow's ends
              let d0 = v.d0, d1 = v.d1;
              if (v.centre && A.ends) { const p0 = at(seg, 0), p1 = at(seg, 1); d0 = -Math.hypot(p0.x - A.ends.S.x, p0.y - A.ends.S.y); d1 = -Math.hypot(p1.x - A.ends.T.x, p1.y - A.ends.T.y); }
              const len = segLen(seg), dist = d0 + v.f * (len - d0 - d1) + v.slide; pos = tAt(seg, Math.max(1e-6, Math.min(len - 1e-6, dist))); }
          }
          else if (name === 'name' || name === 'shape') continue;
          else if (/^(above|below|left|right|anchor|inner sep|outer sep|near|sloped|font|text|fill|color|red|blue)/.test(name)) warn(`The label option "${o}" isn't drawn here (it is kept in the code)`);
        }
        const P0 = at(seg, pos), tu = tan(seg, pos);
        if (coord || !L.t) { if (named) names[named] = P0; return; }
        const lp = PR ? PR.labPad : EX;
        const b = TD.textBox(mathOf(L.t), LABEL), w = b.w - 2 + lp, h = strutH(b) + lp; // TeX's label box: the glyphs' own height + depth, so a k sits lower than an f
        let x = P0.x, y = P0.y;
        if (!desc) {
          // TikZ's auto: the label's anchor faces the line, picked from eight by the side's direction
          let n = { x: tu.y, y: -tu.x };
          if (swap) n = { x: -n.x, y: -n.y };
          const sx = n.x > 0.05 ? 1 : n.x < -0.05 ? -1 : 0, sy = n.y > 0.05 ? 1 : n.y < -0.05 ? -1 : 0;
          x += (sx * w) / 2; y += (sy * h) / 2;
        }
        if (named) names[named] = { x, y };
        labels.push({ t: mathOf(L.t), x, y, w, h, b, fill, color: A.color, src });
      }
    }
    // arrows drawn along a to path, once every named point is known
    for (const it of later) {
      const g = toPath(it.A, it.S, it.T);
      if (!g) { warn('This to path isn\'t drawn here (it is kept in the code)'); arrows.push({ seg: line(exit(it.S, it.S, unitV(it.S, it.T)), exit(it.T, it.T, unitV(it.T, it.S))), A: it.A, src: it.src, to: it.to }); continue; }
      arrows.push({ seg: g.seg, route: g.els, A: it.A, src: it.src, to: it.to });
      g.marks.forEach((mk, i) => placeLabel(mk.L, it.A, mk.seg, it.src.concat(300 + i)));
      // the arrow's own labels go where the path says \tikztonodes (on its last piece); without it, nowhere
      if (/\\tikztonodes\b/.test(it.A.toPath)) it.A.labels.forEach((L, li) => placeLabel(L, it.A, g.seg, it.src.concat(li)));
      for (const n of g.nodes) {
        const b = TD.textBox(mathOf(n.t), NORMAL), pad = 2 * 0.3333 * EM;
        labels.push({ t: mathOf(n.t), x: n.x, y: n.y, w: b.w - 2 + pad, h: strutH(b) + pad, b, fill: n.fill, font: NORMAL, color: it.A.color, src: it.src.concat(200) });
      }
    }

    // xymatrix's turns: `diag[cell] — a straight piece, then a quarter circle into the next direction
    function xyTurns(A, S, T, r0, c0) {
      let p = { x: S.x, y: S.y }, pn = S, last = 3;
      const els = [], pieces = [];
      for (const tn of A.turns) {
        const Rr = tn.r != null ? tn.r : PR.turnR;
        const inn = tn.diag && DIAG[tn.diag] != null ? DIAG[tn.diag] : last, din = D8[inn];
        const [dr, dc] = delta(tn.dirs);
        if (!(r0 + dr >= 0 && r0 + dr < R && c0 + dc >= 0 && c0 + dc < C)) return null;
        const cc = nodeAt(r0 + dr, c0 + dc);
        const nl = { x: din.y, y: -din.x }, acw = (cc.x - p.x) * nl.x + (cc.y - p.y) * nl.y > 0;
        const out = (inn + (acw ? 2 : 6)) % 8, dout = D8[out];
        const start = pn ? exit(pn, p, din) : p;
        const sc = cross({ x: cc.x - p.x, y: cc.y - p.y }, dout) / cross(din, dout);
        let corner = { x: p.x + din.x * sc, y: p.y + din.y * sc }, a0 = { x: corner.x - din.x * Rr, y: corner.y - din.y * Rr };
        if ((a0.x - start.x) * din.x + (a0.y - start.y) * din.y < 0) { corner = { x: start.x + din.x * Rr, y: start.y + din.y * Rr }; a0 = start; }
        const a1 = { x: corner.x + dout.x * Rr, y: corner.y + dout.y * Rr };
        const L = { k: 'L', p: start, q: a0 };
        if (Math.hypot(a0.x - start.x, a0.y - start.y) > 0.01) els.push(L);
        pieces.push(line(start, a0));
        els.push({ k: 'A', p: a0, q: a1, r: Rr, sw: cross(din, dout) > 0 ? 1 : 0, v: corner });
        p = a1; pn = null; last = out;
      }
      const q = exit(T, T, unitV(T, p));
      els.push({ k: 'L', p, q });
      return { els, pieces, seg: line(p, q) };
    }
    // a to path of --, |- and -| through (\tikztostart), (\tikztotarget), named points and shifted anchors
    function toPath(A, S, T) {
      const src = A.toPath, pts = [], nodes = [], marks = [];
      let i = 0, cur = { x: S.x, y: S.y, node: S };
      pts.push(cur);
      const coord = (txt) => {
        let t = txt.trim(), sx = 0, sy = 0;
        // (a |- b): a's x and b's y; (a -| b): b's x and a's y; either may carry its own shift
        const pp = /^(.+?)\s*(\|-|-\|)\s*(.+)$/.exec(t);
        if (pp) { const a = coord(pp[1]), b = coord(pp[3]); return a && b ? (pp[2] === '|-' ? { x: a.x, y: b.y } : { x: b.x, y: a.y }) : null; }
        if (t[0] === '[') { const j = Z.close(t, 0); if (j < 0) return null; for (const o of Z.opts(t.slice(1, j)).list) { const { name, arg } = Z.styleOf(o); const l = length(unbrace(arg), PX); if (l == null) return null; if (name === 'xshift') sx += l; else if (name === 'yshift') sy -= l; else return null; } t = t.slice(j + 1).trim(); }
        let m = /^\\tikzto(start|target)(?:\.(.+))?$/.exec(t), P = null, n = null;
        if (m) n = m[1] === 'start' ? S : T;
        // a cell of the matrix: \tikzcdmatrixname-2-3
        else if ((m = /^\\tikzcdmatrixname-(\d+)-(\d+)(?:\.(.+))?$/.exec(t))) { const r = +m[1] - 1, c = +m[2] - 1; if (!(r >= 0 && r < R && c >= 0 && c < C)) return null; n = nodeAt(r, c); m = [0, 0, m[3]]; }
        if (n) { if (!m[2] && !sx && !sy) return { x: n.x, y: n.y, node: n }; P = m[2] ? compass(n, m[2].trim()) : { x: n.x, y: n.y }; }
        else if ((m = /^([^.,]+)$/.exec(t)) && names[m[1].trim()]) P = names[m[1].trim()];
        else if ((m = /^(-?[\d.]+\s*\w*)\s*,\s*(-?[\d.]+\s*\w*)$/.exec(t))) { const a = length(m[1], PX), b = length(m[2], PX); if (a == null || b == null) return null; P = { x: S.x + a, y: S.y - b }; }
        return P ? { x: P.x + sx, y: P.y + sy } : null;
      };
      while (i < src.length) {
        i = skipWs(src, i);
        if (i >= src.length) break;
        const op = src.slice(i, i + 2);
        if (op === '--' || op === '|-' || op === '-|') {
          i = skipWs(src, i + 2);
          if (src[i] !== '(') return null;
          let d = 0, j = i;
          for (; j < src.length; j++) { if (src[j] === '(' || src[j] === '[' || src[j] === '{') d++; else if (src[j] === ')' || src[j] === ']' || src[j] === '}') { d--; if (!d) break; } }
          const P = coord(src.slice(i + 1, j));
          if (!P) return null;
          if (op === '|-') pts.push({ x: cur.x, y: P.y });
          if (op === '-|') pts.push({ x: P.x, y: cur.y });
          pts.push(P); cur = P; i = j + 1; continue;
        }
        if (/^\\tikztonodes\b/.test(src.slice(i))) { i += 12; continue; }
        if (/^node\b/.test(src.slice(i))) {
          i = skipWs(src, i + 4);
          let opts = '';
          if (src[i] === '[') { const j = Z.close(src, i); if (j < 0) return null; opts = src.slice(i + 1, j); i = skipWs(src, j + 1); }
          if (src[i] !== '{') return null;
          const j = Z.close(src, i);
          if (j < 0) return null;
          const ol = Z.opts(opts).list, fill = ol.some((o) => { const { name, arg } = Z.styleOf(o); return name === 'fill' && unbrace(arg) !== 'none'; });
          const t = src.slice(i + 1, j).trim();
          // a label on the piece just drawn (midway, pos=, auto, swap): placed as tikz-cd places its labels
          if (ol.some((o) => /^(midway|pos|auto|swap|near start|near end|very near start|very near end|at start|at end)\b/.test(o)) && pts.length > 1) {
            const lo = [];
            let swap = false;
            for (const o of ol) { const { name } = Z.styleOf(o); if (name === 'swap') swap = true; else if (name === 'midway' || name === 'pos' || name in POS) lo.push(o); }
            if (fill) lo.push('description');
            marks.push({ k: pts.length - 1, L: { t: t.replace(/^\$\s*\\scriptstyle\s*([\s\S]*)\$$/, '$1'), swap, opts: lo } });
          } else nodes.push({ t, x: cur.x, y: cur.y, fill });
          i = j + 1; continue;
        }
        return null;
      }
      if (pts.length < 2) return null;
      // a node itself: its border, towards the next point
      const n = pts.length;
      if (pts[0].node) pts[0] = exit(pts[0].node, pts[0], unitV(pts[0], pts[1]));
      if (pts[n - 1].node) pts[n - 1] = exit(pts[n - 1].node, pts[n - 1], unitV(pts[n - 1], pts[n - 2]));
      for (const nd of nodes) if (nd.x == null) Object.assign(nd, pts[n - 1]);
      const els = roundPoly(pts, A.rc || 0), lt = els[els.length - 1];
      return { els, nodes, marks: marks.map((mk) => ({ L: mk.L, seg: line(pts[mk.k - 1], pts[mk.k]) })), seg: line(lt.p, lt.q) };
    }

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    const arc = (a) => !a.A.phantom && PR && a.A.curve != null && a.A.bend != null;
    for (const n of nodes) ext(n.x - n.w / 2, n.y + n.oy - n.h / 2, n.x + n.w / 2, n.y + n.oy + n.h / 2);
    const ARROW = (a) => {
      const pts = [];
      if (a.route) for (const e of a.route) for (let i = 0; i <= 8; i++) { const t = i / 8, v = e.v || { x: (e.p.x + e.q.x) / 2, y: (e.p.y + e.q.y) / 2 }; pts.push({ x: (1 - t) * (1 - t) * e.p.x + 2 * t * (1 - t) * v.x + t * t * e.q.x, y: (1 - t) * (1 - t) * e.p.y + 2 * t * (1 - t) * v.y + t * t * e.q.y }); }
      else for (let i = 0; i <= 16; i++) pts.push(at(a.seg, i / 16));
      for (const p of pts) ext(p.x - 2 * PT, p.y - 2 * PT, p.x + 2 * PT, p.y + 2 * PT);
    };
    for (const a of arrows) if (!a.A.phantom && !arc(a)) ARROW(a);
    for (const l of labels) ext(l.x - l.w / 2 - LAB_PAD, l.y - l.h / 2 - LAB_PAD, l.x + l.w / 2 + LAB_PAD, l.y + l.h / 2 + LAB_PAD);
    // xymatrix's own box leaves out its curved arrows: the export centres the node on this box
    const ebox = nodes.length ? { x: x1, y: y1 - BB_DY, w: x2 - x1, h: y2 - y1 } : null;
    for (const a of arrows) if (arc(a)) ARROW(a);
    if (!(x2 > x1)) { x1 = colL[0] - 1; x2 = colL[C - 1] + colW[C - 1] + 1; }
    if (!(y2 > y1)) { y1 = rowT[0] - 1; y2 = rowT[R - 1] + rowH[R - 1] + 1; }
    y1 -= BB_DY; y2 -= BB_DY;
    // a last row ended with \\ leaves tikz-cd an empty row: no height, but its row sep
    if (!PR) { const m = /\\\\\s*(?:\[([^\]]*)\])?\s*$/.exec(unwrap(s.src).inner); if (m) y2 += rs.px + (m[1] ? extra(m[1], 'row') : 0); }
    return { PR, nodes, arrows, labels, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, ebox, warnings, R, C, P, geo: { colL, colW, cx, rowT, rowH, cy, cs: cs.px, rs: rs.px } };
  }
  const D8 = [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]].map(([x, y]) => { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; });
  const DIAG = { dl: 0, ld: 0, d: 1, dr: 2, rd: 2, r: 3, ur: 4, ru: 4, u: 5, ul: 6, lu: 6, l: 7 };
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const unitV = (a, b) => { const x = b.x - a.x, y = b.y - a.y, l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
  function segLen(s) { let L = 0, q = s.p0; for (let i = 1; i <= 32; i++) { const p = at(s, i / 32); L += Math.hypot(p.x - q.x, p.y - q.y); q = p; } return L; }
  // a polyline with its corners rounded (TikZ's rounded corners: cut back r along each side, at most half the side)
  function roundPoly(pts, rc) {
    const els = [];
    let cur = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const v = pts[i];
      if (i === pts.length - 1 || !rc) { if (Math.hypot(v.x - cur.x, v.y - cur.y) > 0.01) els.push({ k: 'L', p: cur, q: v }); cur = v; continue; }
      const nx = pts[i + 1], a = unitV(pts[i - 1], v), b = unitV(v, nx);
      const la = Math.hypot(v.x - pts[i - 1].x, v.y - pts[i - 1].y), lb = Math.hypot(nx.x - v.x, nx.y - v.y);
      const cr = cross(a, b), dt = a.x * b.x + a.y * b.y;
      if (Math.abs(cr) < 1e-6 || la < 1e-6 || lb < 1e-6) { if (Math.abs(cr) >= 1e-6 || dt < 0) { els.push({ k: 'L', p: cur, q: v }); cur = v; } continue; }
      const k = Math.min(rc, la / 2, lb / 2), phi = Math.acos(Math.max(-1, Math.min(1, dt)));
      const s1 = { x: v.x - a.x * k, y: v.y - a.y * k }, s2 = { x: v.x + b.x * k, y: v.y + b.y * k };
      if (Math.hypot(s1.x - cur.x, s1.y - cur.y) > 0.01) els.push({ k: 'L', p: cur, q: s1 });
      els.push({ k: 'A', p: s1, q: s2, r: k / Math.tan(phi / 2), sw: cr > 0 ? 1 : 0, v });
      cur = s2;
    }
    return els;
  }
  const routeD = (els) => els.map((e, i) => (i ? '' : `M${r2(e.p.x)},${r2(e.p.y)}`) + (e.k === 'A' ? `A${r2(e.r)},${r2(e.r)} 0 0,${e.sw} ${r2(e.q.x)},${r2(e.q.y)}` : `L${r2(e.q.x)},${r2(e.q.y)}`)).join('');
  const delta = (dirs) => { let dr = 0, dc = 0; for (const ch of dirs || '') { if (ch === 'r') dc++; else if (ch === 'l') dc--; else if (ch === 'd') dr++; else if (ch === 'u') dr--; } return [dr, dc]; };

  // ---------------------------------------------------------------- drawing
  // a tikz-cd tip at P pointing along u (out of the line); returns { svg, back }
  function tipSvg(kind, P, u, w, col) {
    if (!kind) return { svg: '', back: 0 };
    if (kind === 'implies') {
      // pgf's Implies around the double line (centres 0.45ex apart): a = half that distance, the line width as pen
      const n = { x: -u.y, y: u.x }, a = 0.225 * EX, tipEnd = 2.06 * a + 0.5 * w;
      const Q = (x, y) => `${r2(P.x - u.x * (tipEnd - 0.06 * a - x) + n.x * y)},${r2(P.y - u.y * (tipEnd - 0.06 * a - x) + n.y * y)}`;
      return { svg: `<path d="M${Q(-1.4 * a, 2.65 * a)}C${Q(-0.75 * a, 1.25 * a)} ${Q(a, 0.05 * a)} ${Q(2 * a, 0)}C${Q(a, -0.05 * a)} ${Q(-0.75 * a, -1.25 * a)} ${Q(-1.4 * a, -2.65 * a)}" fill="none" stroke="${col}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round"/>`, back: a + 0.5 * w };
    }
    // tikz-cd's cm to: Computer Modern Rightarrow 6.2 line widths long; two heads overlap by 2.6 line widths
    if (kind === 'to') return TD.cmArrow(P, u, w, col, 6.2 * w, 0.5 * w, 1);
    if (kind === 'to2') {
      const t1 = TD.cmArrow(P, u, w, col, 6.2 * w, 0.5 * w, 1), t2 = TD.cmArrow(P, u, w, col, 6.2 * w, t1.end - 2.6 * w, 1);
      return { svg: t1.svg + t2.svg, back: t1.back };
    }
    if (kind === 'tail') return TD.cmArrow(P, u, w, col, 6.2 * w, 0, -1);
    if (kind === "harpoon'") return TD.tip('harpoonr', P, u, w, col);
    return TD.tip(kind, P, u, w, col);
  }
  function hookFix(kind, P, u, w, col) {
    // a hook curls to the left of travel (hook) or to the right (hook')
    if (kind !== 'hook' && kind !== "hook'") return tipSvg(kind, P, u, w, col);
    const sg = kind === 'hook' ? 1 : -1, n = { x: -u.y * sg, y: u.x * sg }, r = 0.3 * ((3 + 4.5 * w * TD.PT_PER_PX) / TD.PT_PER_PX);
    const Q = { x: P.x + n.x * 2 * r, y: P.y + n.y * 2 * r }, M = { x: P.x + u.x * r + n.x * r, y: P.y + u.y * r + n.y * r };
    const cr = (M.x - P.x) * (Q.y - M.y) - (M.y - P.y) * (Q.x - M.x);
    return { svg: `<path d="M${r2(P.x)},${r2(P.y)}A${r2(r)},${r2(r)} 0 0,${cr > 0 ? 1 : 0} ${r2(Q.x)},${r2(Q.y)}" fill="none" stroke="${col}" stroke-width="${r2(w)}" stroke-linecap="round"/>`, back: 0 };
  }
  function arrowSvg(a, ink, paper, PR) {
    const A = a.A;
    if (A.phantom) return '';
    const col = A.color ? TD.css(A.color) : ink, w = A.lw, s = a.seg;
    const tipOf = PR && PR.tip ? (k, P, u) => PR.tip(k, P, u, w, col, A, hookFix) : (k, P, u) => hookFix(k, P, u, w, col);
    let head, tail, d, full;
    if (a.route) {
      // straight pieces and arcs: the tips sit on the first and last straight pieces
      const els = a.route.map((e) => ({ ...e })), f0 = els[0], f1 = els[els.length - 1];
      const u0 = f0.k === 'A' ? unitV(f0.v, f0.p) : unitV(f0.q, f0.p), u1 = f1.k === 'A' ? unitV(f1.v, f1.q) : unitV(f1.p, f1.q);
      head = tipOf(A.head, f1.q, u1); tail = tipOf(A.tail, f0.p, u0);
      full = routeD(a.route);
      if (f0.k === 'L' && tail.back) f0.p = { x: f0.p.x - u0.x * tail.back, y: f0.p.y - u0.y * tail.back };
      if (f1.k === 'L' && head.back) f1.q = { x: f1.q.x - u1.x * head.back, y: f1.q.y - u1.y * head.back };
      d = routeD(els);
    } else {
      const u1 = tan(s, 1), u0 = tan(s, 0), back0 = { x: -u0.x, y: -u0.y };
      head = tipOf(A.head, s.p1, u1); tail = tipOf(A.tail, s.p0, back0);
      const t0 = tail.back ? tAt(s, tail.back) : 0, t1 = head.back ? tAt(s, -head.back) : 1;
      const body = t1 > t0 ? sub(s, t0, t1) : s;
      d = A.squig ? zigzag(body, 9.25 * w, 1.9 * w, 6 * w, 6 * w) : curveD(body);
      full = curveD(s);
    }
    const dash = PR && PR.dash && A.dash ? PR.dash(A.dash, w) : A.dash === 'dashed' ? ` stroke-dasharray="${r2(7 * w)} ${r2(4 * w)}"` : A.dash === 'dotted' ? ` stroke-dasharray="${r2(w)} ${r2(2 * PT)}" stroke-linecap="round"` : '';
    let out = '';
    if (A.cross) out += `<path d="${full}" fill="none" stroke="${paper}" stroke-width="${r2(1.5 * EX)}"/>`;
    if (A.dbl) {
      const gap = PR && PR.dblGap != null ? PR.dblGap : 1.6 * PT;
      out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(gap + 2 * w)}"${dash}/><path d="${d}" fill="none" stroke="${paper}" stroke-width="${r2(gap)}"/>`;
    } else out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(w)}"${dash} stroke-linejoin="round"/>`;
    return out + head.svg + tail.svg;
  }
  function draw(s, ctx, Lo) {
    Lo = Lo || layout(s);
    const ink = TD.css(s.color || '#000000'), paper = ctx.paper || '#ffffff';
    let out = '';
    if (Lo.empty) {
      const o = Lo.bb;
      out += `<rect x="0" y="0" width="${r2(o.w)}" height="${r2(o.h)}" fill="none" stroke="${ink}" stroke-width="${r2(LW * 2)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty diagram', { size: 'small', font: 'default' }, '#888888', o.w / 2, o.h / 2, ctx);
    } else {
      for (const a of Lo.arrows) out += arrowSvg(a, ink, paper, Lo.PR);
      for (const n of Lo.nodes) out += TD.textSvg(n.t, NORMAL, s.color || '#000000', n.x, n.y + TXT_DY, ctx);
      for (const l of Lo.labels) {
        if (l.fill) out += `<rect x="${r2(l.x - l.w / 2)}" y="${r2(l.y - l.h / 2)}" width="${r2(l.w)}" height="${r2(l.h)}" fill="${paper}"/>`;
        out += TD.textSvg(l.t, l.font || LABEL, l.color || s.color || '#000000', l.x, l.y, ctx);
      }
    }
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{tikzcd\}/.test(t) ? t : `\\begin{tikzcd}\n${t}\n\\end{tikzcd}`;
  }
  TD.cdCode = fullCode;

  // a small drawing of a snippet (palette previews)
  TD.cdMini = (src, maxH = 30) => {
    const s = { type: 'cd', x: 0, y: 0, src, color: 'currentColor' };
    const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
    return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
  };

  // ---------------------------------------------------------------- old XyMatrix shapes
  // { src: '$A$ & $B$ \\ …', colSep, rowSep, arrows: [{ r1, c1, r2, c2, label, side, style, bend }] } →
  // tikz-cd code, with the shape moved so cell (0, 0) stays where it was
  function legacyCode(s) {
    const grid = String(s.src || '').split(/\\\\/).map((row) => row.split('&').map((c) => c.trim()));
    const nc = Math.max(...grid.map((r) => r.length));
    const STY = { '->': '', '->>': 'two heads', hook: 'hook', mapsto: 'mapsto', dashed: 'dashed', '=': 'equal', '<->': 'leftrightarrow', '-': 'dash' };
    const strip = (t) => { const m = /^\$([^$]*)\$$/.exec(t); return m ? m[1] : t ? `\\text{${t}}` : ''; };
    const ok = (a) => grid[a.r1] && grid[a.r2] && !(a.r1 === a.r2 && a.c1 === a.c2);
    const rows = grid.map((row, r) => {
      const cols = [];
      for (let c = 0; c < nc; c++) {
        let t = strip(row[c] || '');
        for (const a of s.arrows || []) {
          if (a.r1 !== r || a.c1 !== c || !ok(a)) continue;
          const dr = a.r2 - a.r1, dc = a.c2 - a.c1;
          const o = [(dc > 0 ? 'r' : 'l').repeat(Math.abs(dc)) + (dr > 0 ? 'd' : 'u').repeat(Math.abs(dr))];
          if (a.label) o.push(`"${strip(a.label)}"${a.side === 'right' ? "'" : ''}`);
          if (STY[a.style]) o.push(STY[a.style]);
          if (a.bend) o.push(`bend ${a.bend > 0 ? 'left' : 'right'}=${f(Math.abs(a.bend))}`);
          t += ` \\arrow[${o.join(', ')}]`;
        }
        cols.push(t.trim());
      }
      return '  ' + cols.join(' & ');
    });
    const cm = (v) => f(v / TD.PX_PER_CM);
    return `\\begin{tikzcd}[column sep={${cm(s.colSep || 80)}cm,between origins}, row sep={${cm(s.rowSep || 60)}cm,between origins}]\n${rows.join(' \\\\\n')}\n\\end{tikzcd}`;
  }
  function upgrade(s) {
    if (!s.arrows) return s;
    const x0 = s.x, y0 = s.y;
    s.src = legacyCode(s);
    for (const k of ['arrows', 'colSep', 'rowSep', 'labelSize', 'size', 'font', 'width', '_drag']) delete s[k];
    const L = build(s);
    if (L.geo) { s.x = x0 - (L.geo.cx[0] - L.bb.x); s.y = y0 - (L.geo.cy[0] - L.bb.y); }
    return s;
  }
  TD.cdToTikzcd = (s) => (s.arrows ? legacyCode(s) : fullCode(s.src));

  TD.TYPES.cd = {
    name: 'Commutative diagram',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'cd', x: p.x, y: p.y, src: TD.CD_DEFAULT, color: '#000000' }),
    upgrade,
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // tikz-cd is a picture of its own: it sits in a plain node with the outer picture interrupted
    tikz(s, X) {
      X.pkgs.add('tikz-cd');
      if (/squig/.test(s.src)) X.libs.add('decorations.pathmorphing');
      const b = layout(s).bb;
      return `\\node at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.cd = {
    html(s) {
      const L = layout(s);
      return `<div class="sec"><div class="sec-title">tikz-cd <small>${L.R} × ${L.C}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="7">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the diagram to edit it visually. Exported with <code>\\usepackage{tikz-cd}</code>.</div></div>
        <div class="sec"><button class="wide primary" data-act="editcd">Edit Diagram…</button><button class="wide" data-act="copycd">Copy tikz-cd Code</button><button class="wide" data-act="toXy">Convert to xymatrix</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editcd') { if (TD.cdOpen) TD.cdOpen(s.id); return; }
      if (act === 'toXy') return TD.xy.switchType(s);
      if (act !== 'copycd') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('tikz-cd Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied tikz-cd code';
    },
  };
  TD.cdLayout = layout;
  // for the visual editor (js/cdeditor.js)
  TD.cd = { unwrap, cell, parse, label, labelCode, layout, build, draw, fullCode, delta, style, styleDefs, SEPS, HEADS, tan, at, curveD, length, LW, PT, EX, EM, D8, DIAG };
})();
