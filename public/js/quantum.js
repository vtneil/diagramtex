// Quantum circuits written in quantikz. The source is the object: it is drawn here as vectors
// (an approximation of quantikz2's layout) and exported unchanged inside \begin{quantikz}.
// One-way: the drawing is not edited on the canvas, only the code.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  TD.QC_DEFAULT = [
    '\\begin{quantikz}',
    '\\lstick{\\ket{0}} & \\gate{H} & \\ctrl{1} & \\meter{} \\\\',
    '\\lstick{\\ket{0}} & & \\targ{} & \\meter{}',
    '\\end{quantikz}',
  ].join('\n');

  // ---------------------------------------------------------------- parsing
  // Number of {…} arguments; commands not listed are reported and skipped.
  const ARGS = {
    gate: 1, ctrl: 1, octrl: 1, control: 1, ocontrol: 1, targ: 1, targX: 1, swap: 1, phase: 1,
    meter: 1, meterD: 1, measuretab: 1, measure: 1, lstick: 1, rstick: 1, midstick: 1, push: 1,
    qw: 0, cw: 0, qwbundle: 1, cwbend: 1, vqw: 1, vcw: 1, wire: 1, setwiretype: 1, wireoverride: 1,
    slice: 1, gategroup: 1, ghost: 1, ground: 1,
  };
  const IGNORED = new Set(['ghost']);

  // index of the bracket closing the one at s[i] ({ or [), skipping escapes and nested groups
  function close(s, i) {
    const open = s[i], shut = open === '{' ? '}' : ']';
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (open === '[' && c === '{') { k = close(s, k); if (k < 0) return -1; continue; }
      if (c === open) d++;
      else if (c === shut && --d === 0) return k;
    }
    return -1;
  }
  const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  // top-level comma list → { list: [...], map: {key: value} }
  function opts(str) {
    const list = [], map = {};
    let d = 0, buf = '';
    const push = () => {
      const t = buf.trim(); buf = '';
      if (!t) return;
      list.push(t);
      const m = /^([^=]+?)\s*=\s*([\s\S]*)$/.exec(t);
      if (m) map[m[1].trim()] = m[2].trim().replace(/^\{([\s\S]*)\}$/, '$1');
    };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '\\') { buf += c + (str[i + 1] || ''); i++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
      if (c === ',' && d === 0) push(); else buf += c;
    }
    push();
    return { list, map };
  }
  // the code between \begin{quantikz}[…] and \end{quantikz} (or all of it, when not wrapped)
  function unwrap(src) {
    src = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const m = /\\begin\{quantikz\}/.exec(src);
    if (!m) return { env: '', inner: src };
    let i = skipWs(src, m.index + m[0].length), env = '';
    if (src[i] === '[') { const j = close(src, i); if (j > 0) { env = src.slice(i + 1, j); i = j + 1; } }
    const e = src.indexOf('\\end{quantikz}', i);
    return { env, inner: src.slice(i, e < 0 ? src.length : e) };
  }
  // rows (split at \\) of cells (split at &), groups and escapes kept whole
  function grid(inner) {
    const rows = [[]];
    rows.seps = [];
    let buf = '';
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '{') { const j = close(inner, i); const k = j < 0 ? inner.length - 1 : j; buf += inner.slice(i, k + 1); i = k; continue; }
      if (c === '\\') {
        if (inner[i + 1] === '\\') { // row break, with an optional [length]
          rows[rows.length - 1].push(buf); buf = ''; rows.push([]);
          let k = skipWs(inner, i + 2);
          if (inner[k] === '[') { const j = close(inner, k); if (j > 0) { rows.seps[rows.length - 2] = inner.slice(k, j + 1); i = j; continue; } }
          i++; continue;
        }
        buf += c + (inner[i + 1] || ''); i++; continue;
      }
      if (c === '&') { rows[rows.length - 1].push(buf); buf = ''; continue; }
      buf += c;
    }
    rows[rows.length - 1].push(buf);
    // a trailing \\ leaves an empty last row
    while (rows.length && rows[rows.length - 1].length === 1 && !rows[rows.length - 1][0].trim()) rows.pop();
    return rows;
  }
  function cell(text, warn) {
    const items = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+)\*?/.exec(text.slice(i));
        if (!m) { i += 2; continue; }
        const name = m[1], n = ARGS[name];
        i += m[0].length;
        const o = [], a = [];
        for (;;) { const k = skipWs(text, i); if (text[k] !== '[') break; const j = close(text, k); if (j < 0) break; o.push(text.slice(k + 1, j)); i = j + 1; }
        while (a.length < (n ?? 1)) { const k = skipWs(text, i); if (text[k] !== '{') break; const j = close(text, k); if (j < 0) break; a.push(text.slice(k + 1, j)); i = j + 1; }
        if (n === undefined) warn(`\\${name} isn't drawn here (it is kept in the code)`);
        else if (!IGNORED.has(name)) items.push({ name, o, a });
        continue;
      }
      if (c === '{') { const j = close(text, i); i = j < 0 ? text.length : j + 1; continue; }
      let j = i;
      while (j < text.length && text[j] !== '\\' && text[j] !== '{') j++;
      const t = text.slice(i, j).trim();
      if (t) items.push({ name: 'push', o: [], a: [t], plain: true });
      i = j;
    }
    return items;
  }
  function parse(src) {
    const warnings = [];
    const { env, inner } = unwrap(src);
    const raw = grid(inner);
    const rows = raw.map((r, ri) => r.map((t, ci) => cell(t, (w) => { if (!warnings.includes(w)) warnings.push(w); void ri; void ci; })));
    return { env: opts(env), rows, warnings };
  }

  // lengths in options: 0.5cm, 4pt, 1em, 2ex, 3mm → px; "{1cm,between origins}" sets the pitch
  function length(v, E) {
    if (!v) return null;
    const between = /between origins/.test(v);
    const m = /(-?[\d.]+)\s*(cm|mm|pt|em|ex|in)?/.exec(v);
    if (!m) return null;
    const n = parseFloat(m[1]), u = m[2] || 'pt';
    const px = u === 'cm' ? n * PX : u === 'mm' ? (n * PX) / 10 : u === 'in' ? n * 2.54 * PX : u === 'em' ? n * E : u === 'ex' ? n * E * 0.43 : n / K;
    return { px, between };
  }

  // ---------------------------------------------------------------- layout
  // Ops in local coordinates; the object's (x, y) is the top-left of their bounding box.
  const plain = (t) => String(t || '').trim(); // slice and group labels are text, as in quantikz
  const math = (t) => { t = String(t || '').trim(); return !t ? '' : t.includes('$') ? t : `$${t}$`; };
  // stick labels are text in quantikz; a bare command such as \ket{0} still comes out as maths there
  const stickText = (t) => { t = String(t || '').trim(); return !t || t.includes('$') || !/\\[A-Za-z]/.test(t) ? t : `$${t}$`; };
  const intArg = (v, d) => { const n = parseInt(v, 10); return isFinite(n) ? n : d; };
  function wiresOf(it) {
    const o = it.o.length ? opts(it.o[0]) : { list: [], map: {} };
    if (o.map.wires) return Math.max(1, intArg(o.map.wires, 1));
    const bare = o.list.find((x) => /^\d+$/.test(x));
    return bare ? Math.max(1, +bare) : 1;
  }

  const cache = new Map();
  function layout(s) {
    const key = [s.src, s.size, s.font, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s);
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  // measured text sizes change when fonts load or the maths engine changes
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

  function build(s) {
    const st = { size: s.size || 'normalsize', font: s.font };
    const stSmall = { size: 'footnotesize', font: s.font };
    const E = TD.sizePx(st.size);
    // sizes follow quantikz2: gates are their text plus 4pt a side, meters 2em x 1.5em, control dots 0.12cm,
    // the target 0.3cm across. Text boxes are measured a little wider than the ink, and a line high.
    const G = 1.5 * E;             // a one-line gate's height (and a meter's)
    const gw = (b) => b.w + 0.55 * E, gh = (b) => Math.max(G, b.h + 0.2 * E);
    const DOT = 0.06 * PX, TARG = 0.42 * E, SW = 0.3 * E;
    const LGAP = E / 3;            // a stick label's gap to its wire (TikZ's label inner sep)
    const box = (t, small) => TD.textBox(t, small ? stSmall : st);
    const P = parse(s.src);
    const rows = P.rows, R = rows.length, C = Math.max(0, ...rows.map((r) => r.length));
    const ops = [], warnings = P.warnings.slice();
    const warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    // \gate[options][min width][min height]{…}: the cell's minimum size (it widens the column, as in quantikz),
    // and a style's minimum width / height / size (sw, sh: only the box grows)
    const gateMin = (it) => {
      const px = (v) => (v && length(v, E)?.px) || 0;
      const st = it.o.length ? opts(opts(it.o[0]).map.style || '').map : {};
      return { w: px(it.o[1]), h: px(it.o[2]), sw: px(st['minimum width'] || st['minimum size']), sh: px(st['minimum height'] || st['minimum size']) };
    };
    if (!R || !C) return { ops: [{ k: 'empty', x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }], bb: { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }, warnings, R: 0, C: 0 };
    const at = (r, c) => (rows[r] && rows[r][c]) || [];
    const has = (r, c, n) => at(r, c).some((it) => it.name === n);

    // sizes of each cell's contents
    const colW = Array(C).fill(0), rowH = Array(R).fill(0);
    const BRACE = 0.2 * PX, GAP = 0.3 * E;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      let w = 0, h = 0;
      const k = it.name;
      if (k === 'gate') { const b = box(math(it.a[0])), m = gateMin(it); w = Math.max(gw(b), m.w); h = wiresOf(it) > 1 ? 0 : Math.max(gh(b), m.h); }
      else if (k === 'meter' || k === 'meterD' || k === 'measuretab' || k === 'measure') { const b = it.a[0] && k !== 'meter' ? box(math(it.a[0])) : { w: 0, h: 0 }; w = Math.max(2 * E, gw(b)); h = G; }
      else if (k === 'ctrl' || k === 'octrl' || k === 'control' || k === 'ocontrol') w = 2 * DOT;
      else if (k === 'targ') { w = 2 * TARG; h = 2 * TARG; }
      else if (k === 'swap' || k === 'targX') w = 2 * SW;
      else if (k === 'phase') { const b = box(math(it.a[0]), true); w = 2 * DOT + b.w; }
      else if (k === 'push' || k === 'midstick') { const b = box(math(it.a[0])); w = b.w + GAP; h = b.h; }
      else if (k === 'lstick' || k === 'rstick') { const b = box(stickText(it.a[0])); h = wiresOf(it) > 1 ? 0 : b.h; } // the label hangs outside its column
      else if (k === 'ground') { w = 1.2 * E; }
      colW[c] = Math.max(colW[c], w); rowH[r] = Math.max(rowH[r], h);
    }
    // spacing (quantikz: row sep / column sep, optionally between origins)
    const rs = length(P.env.map['row sep'], E) || { px: 0.5 * PX }, cs = length(P.env.map['column sep'], E) || { px: 0.5 * PX };
    const colL = [], cx = [], rowT = [], cy = [];
    let x = 0;
    for (let c = 0; c < C; c++) {
      if (cs.between && c) { cx[c] = cx[c - 1] + cs.px; colL[c] = cx[c] - colW[c] / 2; }
      else { colL[c] = x; cx[c] = x + colW[c] / 2; }
      x = colL[c] + colW[c] + (cs.between ? 0 : cs.px);
    }
    let y = 0;
    for (let r = 0; r < R; r++) {
      if (rs.between && r) { cy[r] = cy[r - 1] + rs.px; rowT[r] = cy[r] - rowH[r] / 2; }
      else { rowT[r] = y; cy[r] = y + rowH[r] / 2; }
      y = rowT[r] + rowH[r] + (rs.between ? 0 : rs.px);
    }
    const colR = (c) => colL[c] + colW[c];
    const clampRow = (r) => Math.max(0, Math.min(R - 1, r));

    // cells under a multi-wire \lstick / \rstick count as part of it
    const stick = {};
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      if (it.name !== 'lstick' && it.name !== 'rstick') continue;
      for (let k = 0; k < Math.min(wiresOf(it), R - r); k++) stick[`${r + k},${c}`] = it.name;
    }
    // ---- horizontal wires (quantikz2: every row runs the full width unless told otherwise)
    const types = (P.env.map['wire types'] || '').split(',').map((t) => t.trim());
    for (let r = 0; r < R; r++) {
      let state = types[r] || 'q';
      let prevExit = null;
      for (let c = 0; c < C; c++) {
        const cl = at(r, c);
        // quantikz2 draws a cell's incoming wire as the cell ends, so a \setwiretype there already applies to it
        for (const it of cl) if (it.name === 'setwiretype') state = (it.a[0] || 'q').trim();
        let inType = state;
        for (const it of cl) {
          if (it.name === 'cw') inType = 'c';
          else if (it.name === 'qw') inType = 'q';
          else if (it.name === 'wireoverride') inType = (it.a[0] || 'n').trim();
        }
        const lst = stick[`${r},${c}`] === 'lstick', rst = stick[`${r},${c}`] === 'rstick';
        const entry = lst ? null : rst ? colL[c] : cx[c];
        if (c === 0 && !cl.length && !lst && !rst) prevExit = colL[0]; // an empty first cell starts the wire at its edge
        if (prevExit != null && entry != null && inType !== 'n' && prevExit !== entry) ops.push({ k: 'wire', t: inType, x1: prevExit, y1: cy[r], x2: entry, y2: cy[r] });
        prevExit = rst ? null : lst ? colR(c) : cx[c];
      }
    }

    // ---- vertical connections
    const vline = (c, r1, r2, t) => { r2 = clampRow(r2); if (r2 !== r1) ops.push({ k: 'wire', t, x1: cx[c], y1: cy[r1], x2: cx[c], y2: cy[r2] }); };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      const n = intArg(it.a[0], 0);
      if (['ctrl', 'octrl', 'swap'].includes(it.name) && n) vline(c, r, r + n, 'q');
      else if (it.name === 'vqw' && n) vline(c, r, r + n, 'q');
      else if ((it.name === 'vcw' || it.name === 'cwbend') && n) vline(c, r, r + n, 'c');
      else if (it.name === 'wire') {
        const dir = (it.o[0] || 'd').trim(), m = intArg(it.o[1], 1), t = (it.a[0] || 'q').trim();
        if (dir === 'd') vline(c, r, r + m, t); else if (dir === 'u') vline(c, r, r - m, t);
        else if (dir === 'l' || dir === 'r') { const c2 = Math.max(0, Math.min(C - 1, c + (dir === 'r' ? m : -m))); ops.push({ k: 'wire', t, x1: cx[c], y1: cy[r], x2: cx[c2], y2: cy[r] }); }
      }
    }

    // ---- gate groups (behind the gates)
    const gpad = 4 / K + E / 3; // quantikz: rows and columns are fitted with TikZ's 1/3em, then the group adds 4pt
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      if (it.name !== 'gategroup') continue;
      const o = opts(it.o[0] || '');
      const k = Math.max(1, intArg(o.map.wires, 1)), m = Math.max(1, intArg(o.map.steps, 1));
      const r2_ = clampRow(r + k - 1), c2 = Math.min(C - 1, c + m - 1);
      const x1 = colL[c] - gpad, x2 = colR(c2) + gpad, y1 = rowT[r] - gpad, y2 = rowT[r2_] + rowH[r2_] + gpad;
      const below = /below/.test(o.map['label style'] || ''), gs = o.map.style || '';
      ops.push({ k: 'rect', x: x1, y: y1, w: x2 - x1, h: y2 - y1, dash: /dash|dott/.test(gs), rx: /rounded/.test(gs) ? 4 / K : 0, fill: false });
      // the label: above the box, raised 0.2cm (quantikz's group label style)
      if (plain(it.a[0])) { const b = box(plain(it.a[0])); ops.push({ k: 'text', t: plain(it.a[0]), x: (x1 + x2) / 2, y: below ? y2 + 0.2 * PX : y1 - 0.2 * PX, b }); }
    }

    // ---- elements
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      const k = it.name, X = cx[c], Y = cy[r];
      if (k === 'gate') {
        const t = math(it.a[0]), b = box(t), n = Math.min(wiresOf(it), R - r);
        const m = gateMin(it), cellH = Math.max(gh(b), m.h);
        // the box fits its cells; a style's minimum size then grows it in place, over its neighbours
        const w = Math.max(gw(b), m.w, m.sw);
        let y1 = n > 1 ? cy[r] - G / 2 : Y - cellH / 2;
        let y2 = n > 1 ? cy[r + n - 1] + G / 2 : Y + cellH / 2;
        if (m.sh > y2 - y1) { const ym = (y1 + y2) / 2; y1 = ym - m.sh / 2; y2 = ym + m.sh / 2; }
        if (/\$/.test(it.a[0] || '')) warn('\\gate{…} is already maths in quantikz: drop its $ signs, or LaTeX stops with "Missing $ inserted"');
        if (m.sw > Math.max(gw(b), m.w)) warn('style={minimum width=…} widens the gate box but not its column, so it covers its neighbours in LaTeX too; \\gate[…][width]{…} widens the column');
        ops.push({ k: 'rect', x: X - w / 2, y: y1, w, h: y2 - y1, fill: true, gate: [r, c], fit: [gw(b), gh(b)] });
        if (t) ops.push({ k: 'text', t, x: X, y: (y1 + y2) / 2, b });
      } else if (k === 'meter') {
        const w = 2 * E, h = G, x1 = X - w / 2, x2 = X + w / 2, u = 0.1 * PX;
        ops.push({ k: 'rect', x: x1, y: Y - h / 2, w, h, fill: true });
        // the dial: an arc 'bend left=50' between points 0.1cm in from the sides, 0.06cm below the middle
        const ay = Y + 0.6 * u, half = (x2 - x1 - 2 * u) / 2, rr = half / Math.sin((50 * Math.PI) / 180);
        ops.push({ k: 'path', d: `M${r2(x1 + u)},${r2(ay)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x2 - u)},${r2(ay)}`, bb: [x1 + u, ay - rr + rr * Math.cos((50 * Math.PI) / 180), x2 - u, ay] });
        // the needle, with its arrowhead
        const nx1 = X, ny1 = Y + u, nx2 = x2 - u, ny2 = Y - 2 * u, L = Math.hypot(nx2 - nx1, ny2 - ny1), ux = (nx2 - nx1) / L, uy = (ny2 - ny1) / L, ah = 0.42 * E * 0.6, aw = ah * 0.45;
        const bx = nx2 - ux * ah, by = ny2 - uy * ah;
        ops.push({ k: 'path', d: `M${r2(nx1)},${r2(ny1)}L${r2(bx)},${r2(by)}`, bb: [nx1, ny2, nx2, ny1] });
        ops.push({ k: 'path', solid: true, d: `M${r2(nx2)},${r2(ny2)}L${r2(bx - uy * aw)},${r2(by + ux * aw)}L${r2(bx + uy * aw)},${r2(by - ux * aw)}Z`, bb: [nx1, ny2, nx2, ny1] });
        if (it.a[0]) { const b = box(math(it.a[0]), true); ops.push({ k: 'text', t: math(it.a[0]), small: true, x: X, y: Y - h / 2 - b.h / 2 - 1, b }); }
      } else if (k === 'meterD') {
        const t = math(it.a[0]), b = box(t), w = Math.max(2 * E, gw(b)), h = G, x1 = X - w / 2, y1 = Y - h / 2, rr = h / 2;
        ops.push({ k: 'path', fill: true, d: `M${r2(x1)},${r2(y1)}H${r2(x1 + w - rr)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x1 + w - rr)},${r2(y1 + h)}H${r2(x1)}Z`, bb: [x1, y1, x1 + w, y1 + h] });
        if (t) ops.push({ k: 'text', t, x: X - rr / 4, y: Y, b });
      } else if (k === 'measuretab' || k === 'measure') {
        const t = math(it.a[0]), b = box(t), w = Math.max(2 * E, gw(b)), h = G, x1 = X - w / 2, y1 = Y - h / 2, tip = h * 0.3;
        ops.push({ k: 'path', fill: true, d: `M${r2(x1)},${r2(y1)}H${r2(x1 + w - tip)}L${r2(x1 + w)},${r2(Y)}L${r2(x1 + w - tip)},${r2(y1 + h)}H${r2(x1)}Z`, bb: [x1, y1, x1 + w, y1 + h] });
        if (t) ops.push({ k: 'text', t, x: X - tip / 3, y: Y, b });
      } else if (k === 'ctrl' || k === 'control') ops.push({ k: 'dot', x: X, y: Y, r: DOT, open: false });
      else if (k === 'octrl' || k === 'ocontrol') ops.push({ k: 'dot', x: X, y: Y, r: DOT * 1.15, open: true });
      else if (k === 'phase') {
        ops.push({ k: 'dot', x: X, y: Y, r: DOT, open: false });
        if (it.a[0]) { const b = box(math(it.a[0]), true); ops.push({ k: 'text', t: math(it.a[0]), small: true, x: X + DOT + b.w / 2, y: Y - DOT - b.h / 2, b }); }
      } else if (k === 'targ') {
        ops.push({ k: 'targ', x: X, y: Y, r: TARG });
      } else if (k === 'swap' || k === 'targX') {
        ops.push({ k: 'path', d: `M${r2(X - SW)},${r2(Y - SW)}L${r2(X + SW)},${r2(Y + SW)}M${r2(X - SW)},${r2(Y + SW)}L${r2(X + SW)},${r2(Y - SW)}`, bb: [X - SW, Y - SW, X + SW, Y + SW] });
      } else if (k === 'push' || k === 'midstick') {
        const t = math(it.a[0]), b = box(t);
        if (t) { ops.push({ k: 'rect', x: X - b.w / 2, y: Y - b.h / 2, w: b.w, h: b.h, fill: true, stroke: false }); ops.push({ k: 'text', t, x: X, y: Y, b }); }
      } else if (k === 'lstick' || k === 'rstick') {
        const t = stickText(it.a[0]), b = box(t), n = Math.min(wiresOf(it), R - r), left = k === 'lstick';
        const y1 = n > 1 ? rowT[r] : Y - b.h / 2, y2 = n > 1 ? rowT[r + n - 1] + rowH[r + n - 1] : Y + b.h / 2, ym = (y1 + y2) / 2;
        let edge = X; // the column has no width: the label hangs off it, past a brace when it spans wires
        if (n > 1) {
          const s1 = left ? -1 : 1, bx = edge + s1 * LGAP / 2, h2 = BRACE / 2;
          ops.push({ k: 'path', d: `M${r2(bx)},${r2(y1)}Q${r2(bx + s1 * h2)},${r2(y1)} ${r2(bx + s1 * h2)},${r2(y1 + h2)}L${r2(bx + s1 * h2)},${r2(ym - h2)}Q${r2(bx + s1 * h2)},${r2(ym)} ${r2(bx + s1 * BRACE)},${r2(ym)}Q${r2(bx + s1 * h2)},${r2(ym)} ${r2(bx + s1 * h2)},${r2(ym + h2)}L${r2(bx + s1 * h2)},${r2(y2 - h2)}Q${r2(bx + s1 * h2)},${r2(y2)} ${r2(bx)},${r2(y2)}`, bb: [Math.min(bx, bx + s1 * BRACE), y1, Math.max(bx, bx + s1 * BRACE), y2] });
          edge = bx + s1 * BRACE;
        }
        edge += (left ? -1 : 1) * LGAP;
        if (t) ops.push({ k: 'text', t, x: left ? edge - b.w / 2 : edge + b.w / 2, y: ym, b });
      } else if (k === 'qwbundle') {
        const a = 0.28 * E;
        ops.push({ k: 'path', d: `M${r2(X - a * 0.7)},${r2(Y + a)}L${r2(X + a * 0.7)},${r2(Y - a)}`, bb: [X - a, Y - a, X + a, Y + a] });
        if (it.a[0]) { const b = box(math(it.a[0]), true); ops.push({ k: 'text', t: math(it.a[0]), small: true, x: X + a * 0.7 + b.w / 2, y: Y - a - b.h / 2 + 2, b }); }
      } else if (k === 'ground') {
        const a = 0.5 * E;
        ops.push({ k: 'path', d: `M${r2(X)},${r2(Y)}H${r2(X + a * 0.6)}M${r2(X + a * 0.6)},${r2(Y - a)}V${r2(Y + a)}M${r2(X + a)},${r2(Y - a * 0.6)}V${r2(Y + a * 0.6)}M${r2(X + a * 1.4)},${r2(Y - a * 0.25)}V${r2(Y + a * 0.25)}`, bb: [X, Y - a, X + a * 1.4, Y + a] });
      }
    }

    // ---- slices: dashed line after the column, across every wire
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) for (const it of at(r, c)) {
      if (it.name !== 'slice') continue;
      const xs = c < C - 1 ? (colR(c) + colL[c + 1]) / 2 : colR(c) + cs.px / 2;
      // quantikz: red, dashed 5pt/3pt, from the top row's top to 3pt under the bottom row (rows fitted with 1/3em);
      // the label sits on top
      const y1 = rowT[0] - E / 3, y2 = rowT[R - 1] + rowH[R - 1] + E / 3 + 3 / K;
      ops.push({ k: 'line', x1: xs, y1, x2: xs, y2, slice: true });
      if (plain(it.a[0])) { const b = box(plain(it.a[0])); ops.push({ k: 'text', t: plain(it.a[0]), x: xs, y: y1 - 4 / K - 0.35 * E, b }); }
    }

    // bounding box of everything
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const o of ops) {
      if (o.k === 'wire' || o.k === 'line') ext(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2) - 1.5, Math.max(o.x1, o.x2), Math.max(o.y1, o.y2) + 1.5);
      else if (o.k === 'rect') ext(o.x, o.y, o.x + o.w, o.y + o.h);
      else if (o.k === 'text') ext(o.x - o.b.w / 2, o.y - o.b.h / 2, o.x + o.b.w / 2, o.y + o.b.h / 2);
      else if (o.k === 'path') ext(...o.bb);
      else if (o.k === 'dot' || o.k === 'targ') ext(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
    }
    // nothing drawn (every wire switched off): the grid's own extent
    if (!(x2 > x1)) { x1 = colL[0]; x2 = colL[C - 1] + colW[C - 1]; }
    if (!(y2 > y1)) { y1 = rowT[0]; y2 = rowT[R - 1] + rowH[R - 1]; }
    return { ops, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, R, C, geo: { colL, colW, cx, rowT, rowH, cy, cs: cs.px, rs: rs.px } };
  }

  // ---------------------------------------------------------------- drawing
  function draw(s, ctx) {
    const Lo = layout(s), st = { size: s.size || 'normalsize', font: s.font };
    const col = TD.css(s.color || '#000000'), white = ctx.paper || '#ffffff';
    const w = r2(0.8 / K), dd = 0.03 * PX; // quantikz draws 'thick'; half the gap of a classical double wire
    const line = (a, b, c, d, extra = '') => `<path d="M${r2(a)},${r2(b)}L${r2(c)},${r2(d)}" stroke="${col}" stroke-width="${w}" fill="none"${extra}/>`;
    const dash = ` stroke-dasharray="${r2(3 / K)} ${r2(2 / K)}"`;
    let out = '';
    for (const o of Lo.ops) {
      if (o.k === 'empty') {
        out += `<rect x="0" y="0" width="${r2(o.w)}" height="${r2(o.h)}" fill="none" stroke="${col}" stroke-width="${w}"${dash} rx="4"/>`;
        if (!ctx.export) out += TD.textSvg('Empty circuit', { size: 'small', font: s.font }, '#888888', o.w / 2, o.h / 2, ctx);
      } else if (o.k === 'wire') {
        if (o.t === 'c') {
          const v = o.x1 === o.x2;
          out += line(o.x1 + (v ? -dd : 0), o.y1 + (v ? 0 : -dd), o.x2 + (v ? -dd : 0), o.y2 + (v ? 0 : -dd)) + line(o.x1 + (v ? dd : 0), o.y1 + (v ? 0 : dd), o.x2 + (v ? dd : 0), o.y2 + (v ? 0 : dd));
        } else out += line(o.x1, o.y1, o.x2, o.y2);
      } else if (o.k === 'line') out += o.slice ? `<path d="M${r2(o.x1)},${r2(o.y1)}L${r2(o.x2)},${r2(o.y2)}" stroke="#ff0000" stroke-width="${w}" fill="none" stroke-dasharray="${r2(5 / K)} ${r2(3 / K)}"/>` : line(o.x1, o.y1, o.x2, o.y2, o.dash ? dash : '');
      else if (o.k === 'rect') {
        out += `<rect x="${r2(o.x)}" y="${r2(o.y)}" width="${r2(o.w)}" height="${r2(o.h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${o.fill ? white : 'none'}" stroke="${o.stroke === false ? 'none' : col}" stroke-width="${w}"${o.dash ? dash : ''}/>`;
      } else if (o.k === 'path') out += `<path d="${o.d}" fill="${o.solid ? col : o.fill ? white : 'none'}" stroke="${col}" stroke-width="${w}"${o.solid ? ' stroke-linejoin="round"' : ''}/>`;
      else if (o.k === 'dot') out += `<circle cx="${r2(o.x)}" cy="${r2(o.y)}" r="${r2(o.r)}" fill="${o.open ? white : col}" stroke="${col}" stroke-width="${w}"/>`;
      else if (o.k === 'targ') {
        out += `<circle cx="${r2(o.x)}" cy="${r2(o.y)}" r="${r2(o.r)}" fill="${white}" stroke="${col}" stroke-width="${w}"/>` + line(o.x - o.r, o.y, o.x + o.r, o.y) + line(o.x, o.y - o.r, o.x, o.y + o.r);
      } else if (o.k === 'text') out += TD.textSvg(o.t, o.small ? { size: 'footnotesize', font: s.font } : st, s.color || '#000000', o.x, o.y, ctx);
    }
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  // the code as it goes into LaTeX: always a full quantikz environment
  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{quantikz\}/.test(t) ? t : `\\begin{quantikz}\n${t}\n\\end{quantikz}`;
  }
  TD.qcCode = fullCode;

  // A small drawing of a snippet, for the command suggestions: in the UI's ink, on its surface colour.
  TD.qcMini = (src, maxH = 30, paper = 'var(--qc-paper, var(--sheet-raised))') => {
    const s = { type: 'qc', x: 0, y: 0, src, size: 'small', font: 'default', color: 'currentColor' };
    const bb = layout(s).bb, k = Math.min(1, maxH / bb.h);
    return `<svg class="qcmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper })}</svg>`;
  };

  TD.TYPES.qc = {
    name: 'Quantum circuit',
    pts: [['x', 'y']],
    create: (p, d) => ({ type: 'qc', x: p.x, y: p.y, src: TD.QC_DEFAULT, size: d.size || 'normalsize', font: 'default', color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // quantikz is a tikzpicture of its own: it sits in a plain node (no options, which the
    // circuit's nodes would inherit), centred where the drawing is, with the outer picture
    // interrupted so its shift / overlay settings don't reach the circuit.
    tikz(s, X) {
      X.libs.add('quantikz2');
      const b = layout(s).bb;
      return `\\node at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  // property panel: the code, what is not drawn, and a copy button
  TD.panels = TD.panels || {};
  TD.panels.qc = {
    html(s) {
      const L = layout(s);
      return `<div class="sec"><div class="sec-title">quantikz <small>${L.R} × ${L.C}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="7">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the circuit to edit it visually. Exported with <code>\\usetikzlibrary{quantikz2}</code>.</div></div>
        <div class="sec"><button class="wide primary" data-act="editqc">Edit Circuit…</button><button class="wide" data-act="copyqc">Copy quantikz Code</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editqc') { if (TD.qcOpen) TD.qcOpen(s.id); return; }
      if (act !== 'copyqc') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('quantikz Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied quantikz code';
    },
  };
  TD.qcLayout = layout;
  // for the visual editor (js/qceditor.js)
  TD.qc = { ARGS, IGNORED, unwrap, grid, cell, opts, close, draw, layout, fullCode };
})();
