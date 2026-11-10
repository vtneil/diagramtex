// Karnaugh maps written with the karnaugh-map package (v2.0). The source is the object: a karnaugh-map
// environment of \minterms, \maxterms, \indeterminants, \terms, \autoterms and \manualterms that fill the
// cells, and \implicant, \implicantedge and \implicantcorner that mark the groups. It is drawn here at the
// package's own sizes (1cm cells, Gray-coded row and column headers, groups ±3mm round the cell centres,
// filled red, green, yellow, cyan, blue, magenta at 25%), and exported unchanged in a node.
// The package has six templates: 2×2 (2 variables), 4×2 and 2×4 (3), 4×4 (4), 4×4×2 (5) and 4×4×4 (6).
// The visual editor (js/kmeditor.js) reads the code into a model and writes it back.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K;

  TD.KMAP_DEFAULT = [
    '\\begin{karnaugh-map}[4][4][1][$D$][$C$][$B$][$A$]',
    '  \\minterms{0,2,5,7,8,10,13,15}',
    '  \\autoterms[0]',
    '  \\implicant{5}{15}',
    '  \\implicantcorner',
    '\\end{karnaugh-map}',
  ].join('\n');

  // the package's sizes
  const GRID_W = 0.1 * PT, LW = 0.4 * PT, ROUND = 3 * PT, INNER = 3.333 * PT;
  const TEXT = { size: 10 * PT, font: 'default' }, SMALL = { size: 9 * PT, font: 'default' };
  const COLORS = ['red', 'green', 'yellow', 'cyan', 'blue', 'magenta'];
  const XCOLOR = { red: '#ff0000', green: '#00ff00', yellow: '#ffff00', cyan: '#00ffff', blue: '#0000ff', magenta: '#ff00ff', black: '#000000', white: '#ffffff', gray: '#808080', orange: '#ff8000', violet: '#800080', purple: '#bf0040', brown: '#bf8040', lime: '#bfff00', olive: '#808000', pink: '#ffbfbf', teal: '#008080', darkgray: '#404040', lightgray: '#bfbfbf' };
  // the templates: columns × rows × sub maps → number of variables
  const SIZES = [[2, 2, 1], [4, 2, 1], [2, 4, 1], [4, 4, 1], [4, 4, 2], [4, 4, 4]];
  const sizeOk = (x, y, z) => SIZES.some((s) => s[0] === x && s[1] === y && s[2] === z);
  const varsOf = (x, y, z) => Math.log2(x * y * z);
  const GRAY = [0, 1, 3, 2];

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
  const skip = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  const stripComments = (s) => s.replace(/(^|[^\\])%.*$/gm, '$1');
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
  // a \foreach list of numbers: "0,2,5" or "0,2,...,10" or "1,...,5"
  function numbers(s) {
    const parts = split(s).map((x) => x.trim()).filter(Boolean), out = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '...' && out.length && i + 1 < parts.length) {
        const a = out[out.length - 1], step = out.length > 1 ? a - out[out.length - 2] : 1, b = parseInt(parts[++i], 10);
        if (!step || !isFinite(b)) return null;
        for (let v = a + step; step > 0 ? v <= b : v >= b; v += step) out.push(v);
        if (out[out.length - 1] !== b) return null;
        continue;
      }
      if (!/^-?\d+$/.test(parts[i])) return null;
      out.push(parseInt(parts[i], 10));
    }
    return out;
  }
  // the arguments after a command: { args: [{ o: bool, v: text }], end }
  function readArgs(s, i, spec) {
    const args = [];
    for (const k of spec) {
      const j = skip(s, i), c = s[j];
      if (k === 'o' && c !== '[') { args.push(null); continue; }
      if (k === 'm' && c !== '{') {
        // a single token argument (\implicantedge 0 2 8 10 is unusual but legal)
        if (c && /[0-9A-Za-z]/.test(c)) { args.push(c); i = j + 1; continue; }
        return null;
      }
      const e = close(s, j);
      if (e < 0) return null;
      args.push(s.slice(j + 1, e));
      i = e + 1;
    }
    return { args, end: i };
  }

  // The model: { opts, bw, X, Y, Z, labels: [raw | undefined], cells: [value | null], fills: [statement],
  //   groups: [g], extra: [statement], warnings, ok }
  // g: { kind: 'rect' | 'edge' | 'corner', a, b, c, d (cell numbers), maps: [m], mapsRaw }
  // cells[i] is what the code writes in cell i (first write wins), null when nothing does.
  function parse(src) {
    const warnings = [], warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const t = stripComments(String(src || ''));
    const M = { opts: '', bw: false, X: 4, Y: 4, Z: 1, labels: [], fills: [], groups: [], extra: [], warnings, ok: true };
    const bm = /\\begin\{karnaugh-map\}/.exec(t);
    let i = 0, body = t;
    if (bm) {
      i = bm.index + bm[0].length;
      let j = skip(t, i);
      if (t[j] === '(') { const e = close(t, j); if (e > 0) { M.opts = t.slice(j + 1, e).trim(); i = e + 1; j = skip(t, i); } }
      if (t[j] === '*') { M.bw = true; i = j + 1; }
      const nums = [], labels = [];
      for (let n = 0; n < 9; n++) {
        j = skip(t, i);
        if (t[j] !== '[') break;
        const e = close(t, j);
        if (e < 0) { warn('A [ after \\begin{karnaugh-map} is not closed'); break; }
        const v = t.slice(j + 1, e);
        if (n < 3) nums.push(v.trim()); else labels.push(v);
        i = e + 1;
      }
      const sz = [4, 4, 1].map((d, k) => (nums[k] != null && nums[k] !== '' ? parseInt(nums[k], 10) : d));
      if (sizeOk(...sz)) [M.X, M.Y, M.Z] = sz;
      else { warn(`The package has no ${sz.join(' × ')} map (it has 2×2×1, 4×2×1, 2×4×1, 4×4×1, 4×4×2 and 4×4×4): a 4×4 map is drawn`); M.ok = false; }
      M.labels = labels;
      const em = t.indexOf('\\end{karnaugh-map}', i);
      if (em < 0) warn('\\end{karnaugh-map} is missing');
      body = t.slice(i, em < 0 ? t.length : em);
    } else if (!/\\(minterms|maxterms|implicant)/.test(t)) warn('No \\begin{karnaugh-map} in the code');
    const N = M.X * M.Y * M.Z, per = M.X * M.Y;
    const cells = new Array(N).fill(null);
    M.cells = cells;
    const fill = (list, v) => { for (const n of list) { if (n < 0 || n >= N) { warn(`Cell ${n} is not on a ${N}-cell map`); continue; } if (cells[n] == null) cells[n] = v; } };
    const mapsOf = (raw) => {
      if (raw == null) return [0];
      const l = numbers(raw);
      if (!l) { warn(`The sub map list "${raw}" isn't understood`); return [0]; }
      const ok = l.filter((m) => m >= 0 && m < M.Z);
      if (ok.length < l.length) warn('A group is drawn on a sub map that does not exist: that part is left out');
      return ok;
    };
    const SPEC = { minterms: 'm', maxterms: 'm', indeterminants: 'm', terms: 'mm', autoterms: 'o', manualterms: 'm', implicant: 'mmo', implicantedge: 'mmmmo', implicantcorner: 'o' };
    i = 0;
    while (i < body.length) {
      i = skip(body, i);
      if (i >= body.length) break;
      const cm = /^\\([A-Za-z]+)/.exec(body.slice(i));
      const name = cm && cm[1];
      if (name && SPEC[name]) {
        const r = readArgs(body, i + cm[0].length, SPEC[name]);
        if (!r) { warn(`\\${name} is missing an argument`); i += cm[0].length; continue; }
        const raw = body.slice(i, r.end).trim(), a = r.args;
        i = r.end;
        if (name === 'minterms' || name === 'maxterms' || name === 'indeterminants' || name === 'terms') {
          const l = numbers(a[0]);
          if (!l) { warn(`The cell list "${a[0]}" isn't understood`); M.extra.push(raw); continue; }
          fill(l, name === 'minterms' ? '1' : name === 'maxterms' ? '0' : name === 'indeterminants' ? '-' : a[1].trim());
          M.fills.push(raw);
          continue;
        }
        if (name === 'autoterms') { const v = a[0] == null ? '-' : a[0].trim(); for (let n = 0; n < N; n++) if (cells[n] == null) cells[n] = v; M.fills.push(raw); continue; }
        if (name === 'manualterms') { split(a[0]).forEach((v, n) => { if (n < N && cells[n] == null) cells[n] = v.trim(); }); M.fills.push(raw); continue; }
        const cellNo = (x) => { const n = parseInt(x, 10); if (!isFinite(n) || n < 0 || n >= per) { warn(`Cell ${x} is not on a ${per}-cell map`); return null; } return n; };
        if (name === 'implicant') {
          const p = cellNo(a[0]), q = cellNo(a[1]);
          if (p == null || q == null) { M.extra.push(raw); continue; }
          M.groups.push({ kind: 'rect', a: p, b: q, maps: mapsOf(a[2]), mapsRaw: a[2] });
          continue;
        }
        if (name === 'implicantedge') {
          const c = a.slice(0, 4).map(cellNo);
          if (c.some((x) => x == null)) { M.extra.push(raw); continue; }
          M.groups.push({ kind: 'edge', a: c[0], b: c[1], c: c[2], d: c[3], maps: mapsOf(a[4]), mapsRaw: a[4] });
          continue;
        }
        if (name === 'implicantcorner') {
          if (M.X !== 4 || M.Y !== 4) { warn('\\implicantcorner works on 4×4 maps only: LaTeX stops with an error'); M.extra.push(raw); continue; }
          M.groups.push({ kind: 'corner', maps: mapsOf(a[0]), mapsRaw: a[0] });
          continue;
        }
      }
      // anything else is kept as written
      let e = i + (cm ? cm[0].length : 1);
      for (;;) { const j = skip(body, e); if (body[j] === '{' || body[j] === '[') { const k = close(body, j); if (k < 0) break; e = k + 1; } else break; }
      const st = body.slice(i, e).trim();
      if (st) { M.extra.push(st); warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`); }
      i = e;
    }
    return M;
  }

  // the variable labels the package shows: { X, Y, Z, names: [6] } (labeltype 2, or 1 for the old API)
  const DEF_LABEL = (k) => `$X_${k}$`;
  function labelsOf(M) {
    const L = M.labels, sz = `${M.X}${M.Y}${M.Z}`;
    const v = (k) => (L[k] != null ? L[k] : DEF_LABEL(k));
    const names = [0, 1, 2, 3, 4, 5].map(v);
    const old = (sz === '241' || sz === '421' || sz === '441') ? L.length === 2 : (sz === '442' || sz === '444') ? L.length === 3 : false;
    if (old) return { X: L[0], Y: L[1], Z: sz[2] !== '1' ? L[2] : '', names: [0, 1, 2, 3, 4, 5].map(DEF_LABEL), old: true };
    const T = {
      221: [v(0), v(1), ''], 241: [v(0), v(2) + v(1), ''], 421: [v(1) + v(0), v(2), ''], 441: [v(1) + v(0), v(3) + v(2), ''],
      442: [v(1) + v(0), v(3) + v(2), v(4)], 444: [v(1) + v(0), v(3) + v(2), v(5) + v(4)],
    }[sz];
    return { X: T[0], Y: T[1], Z: T[2], names, old: false };
  }
  const labelMode = (M) => (/(^|,)\s*label\s*=\s*corner\b/.test(M.opts) ? 'corner' : 'middle');
  const colorList = (M) => {
    const m = /(?:^|,)\s*implicantcolors\s*=\s*(\{[^}]*\}|[^,]*)/.exec(M.opts);
    if (!m) return COLORS;
    const l = m[1].replace(/^\{|\}$/g, '').split(',').map((x) => x.trim()).filter(Boolean);
    return l.length ? l : COLORS;
  };

  // ---------------------------------------------------------------- geometry
  // bits of the column and row codes, and the cell number at (map, row, col)
  const colBits = (M) => (M.X === 2 ? 1 : 2), rowBits = (M) => (M.Y === 2 ? 1 : 2);
  const code = (n, pos) => (n === 2 ? pos : GRAY[pos]);
  const cellAt = (M, m, r, c) => m * M.X * M.Y + code(M.Y, r) * M.X + code(M.X, c);
  function posOf(M, n) {
    const per = M.X * M.Y, m = Math.floor(n / per), k = n % per, rc = Math.floor(k / M.X), cc = k % M.X;
    return { m, r: M.Y === 2 ? rc : GRAY.indexOf(rc), c: M.X === 2 ? cc : GRAY.indexOf(cc) };
  }
  const bin = (v, w) => v.toString(2).padStart(w, '0');
  // a sub map's lower left corner, in cm (y up): maps sit 5cm apart, 1 right, 2 below, 3 below right
  const mapOrigin = (m) => [(m % 2) * 5, -Math.floor(m / 2) * 5];
  // a cell's centre in cm
  const centre = (M, m, r, c) => { const [ox, oy] = mapOrigin(m); return [ox + c + 0.5, oy + M.Y - r - 0.5]; };

  // a group as rows × columns from (r, c), wrapping round the edges: { r, c, h, w, wr, wc }
  function rectOf(M, g) {
    if (g.kind === 'corner') return { r: 3, c: 3, h: 2, w: 2, wr: true, wc: true };
    const P = (n) => posOf(M, n);
    if (g.kind === 'rect') {
      const p = P(g.a), q = P(g.b);
      return { r: Math.min(p.r, q.r), c: Math.min(p.c, q.c), h: Math.abs(p.r - q.r) + 1, w: Math.abs(p.c - q.c) + 1, wr: false, wc: false };
    }
    const p = P(g.a), q = P(g.b), s = P(g.c);
    if (edgeVertical(M, g)) {
      // the first part opens up from its row, the second down from its own
      return { r: s.r, h: M.Y - s.r + p.r + 1, c: Math.min(p.c, q.c), w: Math.abs(p.c - q.c) + 1, wr: true, wc: false };
    }
    return { r: Math.min(p.r, q.r), h: Math.abs(p.r - q.r) + 1, c: s.c, w: M.X - s.c + p.c + 1, wr: false, wc: true };
  }
  // the package's test: vertical (wrapping top to bottom) unless |a − b| ≥ columns, and horizontal if |a − c| < columns
  function edgeVertical(M, g) {
    let v = Math.abs(g.a - g.b) < M.X;
    if (Math.abs(g.a - g.c) < M.X) v = false;
    return v;
  }
  // the cells a rect covers on one sub map, as [row, col] pairs
  function rectCells(M, R) {
    const out = [];
    for (let i = 0; i < R.h; i++) for (let j = 0; j < R.w; j++) out.push([(R.r + i) % M.Y, (R.c + j) % M.X]);
    return out;
  }
  // a rect back to the command that draws it, or null when the package can't (a wrap wider than one row)
  function groupFor(M, R, maps) {
    const H = M.Y, W = M.X;
    let { r, c, h, w } = R;
    if (h >= H) { r = 0; h = H; }
    if (w >= W) { c = 0; w = W; }
    const wr = r + h > H, wc = c + w > W;
    const at = (rr, cc) => cellAt(M, 0, rr % H, cc % W);
    const ms = maps.slice().sort((a, b) => a - b);
    if (wr && wc) return W === 4 && H === 4 && r === 3 && c === 3 && h === 2 && w === 2 ? { kind: 'corner', maps: ms } : null;
    if (wr) return r === H - 1 && h === 2 ? { kind: 'edge', a: at(0, c), b: at(0, c + w - 1), c: at(H - 1, c), d: at(H - 1, c + w - 1), maps: ms } : null;
    if (wc) return c === W - 1 && w === 2 ? { kind: 'edge', a: at(r, 0), b: at(r + h - 1, 0), c: at(r, W - 1), d: at(r + h - 1, W - 1), maps: ms } : null;
    return { kind: 'rect', a: at(r, c), b: at(r + h - 1, c + w - 1), maps: ms };
  }

  // ---------------------------------------------------------------- writing the code
  function groupCode(g) {
    const m = g.maps.length === 1 && g.maps[0] === 0 && g.mapsRaw == null ? '' : `[${g.maps.join(',')}]`;
    if (g.kind === 'corner') return `\\implicantcorner${m}`;
    if (g.kind === 'edge') return `\\implicantedge{${g.a}}{${g.b}}{${g.c}}{${g.d}}${m}`;
    return `\\implicant{${g.a}}{${g.b}}${m}`;
  }
  // the cells as \minterms, \maxterms, \indeterminants and \terms (in that order, so no cell is written twice)
  function fillCode(M) {
    const by = new Map();
    M.cells.forEach((v, n) => { if (v == null || v === '') return; if (!by.has(v)) by.set(v, []); by.get(v).push(n); });
    const out = [], list = (l) => l.join(',');
    // every cell filled and more than four 0s: \autoterms[0] says it shortest
    const auto = by.has('0') && by.get('0').length > 4 && M.cells.every((v) => v != null && v !== '');
    if (by.has('1')) out.push(`\\minterms{${list(by.get('1'))}}`);
    if (by.has('0') && !auto) out.push(`\\maxterms{${list(by.get('0'))}}`);
    if (by.has('-')) out.push(`\\indeterminants{${list(by.get('-'))}}`);
    for (const [v, l] of by) if (!['0', '1', '-'].includes(v)) out.push(`\\terms{${list(l)}}{${v}}`);
    if (auto) out.push('\\autoterms[0]');
    return out;
  }
  function write(M) {
    let L = M.labels.slice();
    while (L.length && L[L.length - 1] == null) L.pop();
    L = L.map((x, k) => (x == null ? DEF_LABEL(k) : x));
    const head = `\\begin{karnaugh-map}${M.opts ? `(${M.opts})` : ''}${M.bw ? '*' : ''}[${M.X}][${M.Y}][${M.Z}]${L.map((x) => `[${x}]`).join('')}`;
    const lines = [...fillCode(M), ...M.groups.map(groupCode), ...M.extra];
    return `${head}\n${lines.map((x) => '  ' + x).join('\n')}${lines.length ? '\n' : ''}\\end{karnaugh-map}`;
  }

  // ---------------------------------------------------------------- checking the groups
  // a group as a cube: { value, mask } over the variables (mask bits are the free ones), or null when its
  // cells are not one (a side that isn't 1, 2 or 4 long, or sub maps that are not a cube)
  function cubeOf(M, R, maps) {
    const n = varsOf(M.X, M.Y, M.Z), cells = [];
    for (const m of maps) for (const [r, c] of rectCells(M, R)) cells.push(cellAt(M, m, r, c));
    if (!cells.length) return null;
    let and = (1 << n) - 1, or = 0;
    for (const x of cells) { and &= x; or |= x; }
    const mask = and ^ or, size = 1 << popcount(mask);
    return new Set(cells).size === size ? { value: and, mask, cells } : null;
  }
  const popcount = (x) => { let k = 0; while (x) { k += x & 1; x >>= 1; } return k; };
  // what a cell counts as: 1, 0 or don't care ('' and other text count as 0)
  const truth = (v) => (v === '1' ? 1 : v === '-' || v === 'x' || v === 'X' ? 2 : 0);
  // each group's state and the function the groups give.
  // mode 'sop' groups the 1s (products), 'pos' the 0s (sums)
  function check(M, mode = 'sop') {
    const n = varsOf(M.X, M.Y, M.Z), want = mode === 'pos' ? 0 : 1;
    const T = M.cells.map(truth), primes = primeCubes(T.map((t) => t === want), T.map((t) => t === 2), n);
    const covered = new Set();
    const groups = M.groups.map((g, i) => {
      const R = rectOf(M, g), cube = cubeOf(M, R, g.maps);
      if (!g.maps.length) return { i, ok: false, why: 'On no sub map' };
      if (!cube) return { i, ok: false, why: 'Not a block of 1, 2, 4, 8… adjacent cells' };
      const bad = cube.cells.filter((x) => T[x] !== want && T[x] !== 2);
      if (bad.length) return { i, ok: false, cube, why: `Covers ${bad.length === 1 ? 'a' : bad.length} ${want ? '0' : '1'}${bad.length === 1 ? '' : 's'} (cell${bad.length === 1 ? '' : 's'} ${bad.join(', ')})` };
      if (!cube.cells.some((x) => T[x] === want)) return { i, ok: false, cube, why: `Covers no ${want}s, only don't cares` };
      for (const x of cube.cells) if (T[x] === want) covered.add(x);
      const prime = primes.some((p) => p.mask !== cube.mask && (p.mask & cube.mask) === cube.mask && (p.value & ~p.mask) === (cube.value & ~p.mask));
      return { i, ok: true, cube, prime: !prime, term: termOf(M, cube, mode) };
    });
    const missing = T.map((t, x) => (t === want && !covered.has(x) ? x : -1)).filter((x) => x >= 0);
    // a valid group whose cells all lie in other valid groups adds nothing
    for (const G of groups) {
      if (!G.ok) continue;
      const others = new Set();
      for (const H of groups) if (H !== G && H.ok) for (const x of H.cube.cells) others.add(x);
      G.redundant = G.cube.cells.every((x) => T[x] !== want || others.has(x));
    }
    const terms = groups.filter((G) => G.ok).map((G) => G.term);
    return { mode, groups, missing, terms, primes, expr: exprOf(terms, mode), ones: T.filter((t) => t === want).length };
  }
  // variable names in maths: "$A$" → A, "$X_0$" → X_0
  function varName(t) { t = String(t || '').trim(); const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1].trim() : t; }
  function termOf(M, cube, mode) {
    const n = varsOf(M.X, M.Y, M.Z), names = labelsOf(M).names, lits = [];
    for (let k = n - 1; k >= 0; k--) {
      if (cube.mask & (1 << k)) continue;
      const one = !!(cube.value & (1 << k)), nm = varName(names[k]);
      lits.push((mode === 'pos' ? !one : one) ? nm : `\\overline{${nm}}`);
    }
    if (!lits.length) return mode === 'pos' ? '0' : '1';
    return mode === 'pos' ? (lits.length > 1 ? `(${lits.join(' + ')})` : lits[0]) : lits.join('');
  }
  function exprOf(terms, mode) {
    if (!terms.length) return mode === 'pos' ? '1' : '0';
    return mode === 'pos' ? terms.join('') : terms.join(' + ');
  }

  // prime implicants (Quine–McCluskey) of the cells marked on, with don't cares
  function primeCubes(on, dc, n) {
    let cur = new Map();
    on.forEach((v, x) => { if (v || dc[x]) cur.set(`${x}/0`, { value: x, mask: 0 }); });
    const primes = [];
    while (cur.size) {
      const next = new Map(), used = new Set(), list = [...cur.values()];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.mask !== b.mask) continue;
        const d = a.value ^ b.value;
        if (popcount(d) !== 1) continue;
        const c = { value: a.value & ~d, mask: a.mask | d };
        next.set(`${c.value}/${c.mask}`, c);
        used.add(a); used.add(b);
      }
      for (const a of list) if (!used.has(a)) primes.push(a);
      cur = next;
    }
    const cellsOf = (p) => { const out = []; for (let x = 0; x < (1 << n); x++) if ((x & ~p.mask) === p.value) out.push(x); return out; };
    return primes.map((p) => ({ ...p, cells: cellsOf(p) })).filter((p) => p.cells.some((x) => on[x]));
  }
  // a small cover of the wanted cells by prime implicants: the essential ones, then the largest that
  // cover the most of what is left
  function solve(M, mode = 'sop') {
    const n = varsOf(M.X, M.Y, M.Z), want = mode === 'pos' ? 0 : 1, T = M.cells.map(truth);
    const on = T.map((t) => t === want), primes = primeCubes(on, T.map((t) => t === 2), n);
    const left = new Set(on.map((v, x) => (v ? x : -1)).filter((x) => x >= 0)), pick = [];
    for (const x of [...left]) {
      const has = primes.filter((p) => p.cells.includes(x));
      if (has.length === 1 && !pick.includes(has[0])) pick.push(has[0]);
    }
    for (const p of pick) for (const x of p.cells) left.delete(x);
    while (left.size) {
      let best = null, bs = -1;
      for (const p of primes) {
        if (pick.includes(p)) continue;
        const s = p.cells.filter((x) => left.has(x)).length * 64 + popcount(p.mask);
        if (s > bs) { bs = s; best = p; }
      }
      if (!best) break;
      pick.push(best);
      for (const x of best.cells) left.delete(x);
    }
    return pick.map((p) => cubeGroup(M, p)).filter(Boolean);
  }
  // a cube back to a group on the map
  function cubeGroup(M, p) {
    const cb = colBits(M), rb = rowBits(M), mb = Math.log2(M.Z);
    const span = (len, shift, bits) => {
      const free = (p.mask >> shift) & ((1 << bits) - 1), val = (p.value >> shift) & ((1 << bits) - 1);
      if (bits === 1) return free ? [0, 2] : [val, 1];
      if (free === 3) return [0, 4];
      if (free === 0) return [GRAY.indexOf(val), 1];
      if (free === 1) return [val & 2 ? 2 : 0, 2]; // hi fixed: 00,01 or 11,10
      return [val & 1 ? 1 : 3, 2]; // lo fixed: 01,11 or 10,00 (round the edge)
    };
    const [c, w] = span(M.X, 0, cb), [r, h] = span(M.Y, cb, rb);
    const sh = cb + rb, fixed = ~p.mask & (((1 << mb) - 1) << sh), maps = [];
    for (let m = 0; m < M.Z; m++) if ((((m << sh) ^ p.value) & fixed) === 0) maps.push(m);
    return groupFor(M, { r, c, h, w }, maps);
  }

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
  const shown = (t) => String(t || '').replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$')
    .replace(/\$\$/g, ''); // $A$$B$ (two labels side by side) reads as one formula
  // a colour the package would use: an xcolor name or mix, else TikZ's own reading of it
  function colour(name) {
    const m = /^([a-z]+)(?:!(\d+)(?:!([a-z]+))?)?$/i.exec(name.trim());
    if (m && XCOLOR[m[1]]) {
      if (!m[2]) return XCOLOR[m[1]];
      const a = TD.parseColor(XCOLOR[m[1]]).hex, b = TD.parseColor(m[3] && XCOLOR[m[3]] ? XCOLOR[m[3]] : '#ffffff').hex, t = +m[2] / 100;
      const mix = (k) => Math.round(parseInt(a.slice(k, k + 2), 16) * t + parseInt(b.slice(k, k + 2), 16) * (1 - t)).toString(16).padStart(2, '0');
      return `#${mix(1)}${mix(3)}${mix(5)}`;
    }
    const c = TD.tikzColor && TD.tikzColor(name);
    return c || '#00ffff';
  }

  function build(src) {
    const M = parse(src);
    const warnings = M.warnings.slice();
    const X = M.X, Y = M.Y, Z = M.Z, S = (x, y) => [x * PX, -y * PX];
    const lines = [], texts = [], marks = [], cells = [];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    const text = (t, st, x, y, extra = {}) => { const b = TD.textBox(t, st); const o = { t, st, x, y, b, ...extra }; texts.push(o); if (!extra.rot) ext(x - b.w / 2, y - b.h / 2, x + b.w / 2, y + b.h / 2); return o; };
    // the grids
    for (let m = 0; m < Z; m++) {
      const [ox, oy] = mapOrigin(m), [a, b] = S(ox, oy + Y), [c, d] = S(ox + X, oy);
      let p = '';
      for (let i = 0; i <= X; i++) p += `M${r2(a + i * PX)},${r2(b)}V${r2(d)}`;
      for (let j = 0; j <= Y; j++) p += `M${r2(a)},${r2(b + j * PX)}H${r2(c)}`;
      lines.push({ d: p, sw: GRID_W });
      ext(a, b, c, d);
    }
    // the headers: column codes over the top maps, row codes left of the left ones, and the phantom
    // row and column of the matrix that pad it below and to the right
    const cw = colBits(M), rw = rowBits(M), hb = TD.textBox('0'.repeat(Math.max(cw, rw)), TEXT);
    const nodeHW = (b) => (b.w - 2) / 2 + INNER, DIGIT = 3.22 * PT;
    for (let m = 0; m < Z; m++) {
      const [ox, oy] = mapOrigin(m);
      if (m < 2) for (let c = 0; c < X; c++) { const [x, y] = S(ox + c + 0.5, oy + Y + 0.5); text(bin(code(X, c), cw), TEXT, x, y, { head: true }); }
      if (m % 2 === 0) for (let r = 0; r < Y; r++) { const [x, y] = S(ox - 0.5, oy + Y - r - 0.5); text(bin(code(Y, r), rw), TEXT, x, y, { head: true }); }
      // the matrix's own bounds (its phantom cells and inner sep)
      const [px, py] = S(ox + X + 0.5, oy - 0.5);
      // the phantom row reaches half a digit's height (3.22pt) and two inner seps below its middle
      ext(px - nodeHW(hb), py, px + nodeHW(hb) + INNER, py + DIGIT + 2 * INNER);
      const [qx] = S(ox - 0.5, 0);
      if (m % 2 === 0) ext(qx - nodeHW(hb) - INNER, py, qx, py);
    }
    // the cells
    for (let m = 0; m < Z; m++) for (let r = 0; r < Y; r++) for (let c = 0; c < X; c++) {
      const n = cellAt(M, m, r, c), [cx, cy] = centre(M, m, r, c), [x, y] = S(cx, cy);
      cells.push({ n, m, r, c, x, y });
      const v = M.cells[n];
      if (v != null && v !== '') text(shown(v), TEXT, x, y, { cell: n });
    }
    // the variable labels
    const lb = labelsOf(M), mode = labelMode(M);
    const zl = (v) => (lb.Z ? `${shown(lb.Z)}$=${v}$`.replace(/\$\$/g, '') : '');
    if (mode === 'corner') {
      const [a, b] = S(0, Y), [c, d] = S(-Math.SQRT1_2, Y + Math.SQRT1_2);
      lines.push({ d: `M${r2(a)},${r2(b)}L${r2(c)},${r2(d)}`, sw: GRID_W });
      ext(c, d, a, b);
      const mx = (a + c) / 2, my = (b + d) / 2;
      for (const [t, side] of [[lb.X, 1], [lb.Y, -1]]) {
        const bx = TD.textBox(shown(t), SMALL), off = 0.4 * bx.h + INNER;
        // above (X) or below (Y) the diagonal, turned 45° to read along it: 'above' after rotate=-45 points up and right
        const X_ = mx + side * Math.SQRT1_2 * off, Y_ = my - side * Math.SQRT1_2 * off;
        text(shown(t), SMALL, X_, Y_, { rot: 45 });
        const hw = (bx.w / 2 + bx.h / 2) * Math.SQRT1_2;
        ext(X_ - hw, Y_ - hw, X_ + hw, Y_ + hw);
      }
    } else {
      const top = (cx, cy) => { const b = TD.textBox(shown(lb.X), SMALL), [x, y] = S(cx, cy); text(shown(lb.X), SMALL, x, y - INNER - 0.4 * b.h); };
      const left = (cx, cy) => { const b = TD.textBox(shown(lb.Y), SMALL), [x, y] = S(cx, cy); text(shown(lb.Y), SMALL, x - INNER - (b.w - 2) / 2, y); };
      top(X * 0.5, Y + 0.9); left(-0.9, Y * 0.5);
      if (Z >= 2) top(7, 4.9);
      if (Z === 4) left(-0.9, -3);
    }
    if (Z >= 2) {
      const at = Z === 2 ? [[2, -0.1, '0'], [7, -0.1, '1']] : [[2, -0.1, '00'], [7, -0.1, '01'], [2, -5.1, '10'], [7, -5.1, '11']];
      for (const [cx, cy, v] of at) { const t = zl(v), b = TD.textBox(t, SMALL), [x, y] = S(cx, cy); text(t, SMALL, x, y + INNER + 0.4 * b.h); }
    }
    // the groups, each in the next colour
    const cols = colorList(M);
    M.groups.forEach((g, gi) => {
      const fill = M.bw ? null : colour(gi < cols.length ? cols[gi] : 'cyan');
      for (const m of g.maps) for (const part of groupShapes(M, g, m)) { marks.push({ ...part, fill, g: gi, m }); for (const [x, y] of part.pts) ext(x - LW, y - LW, x + LW, y + LW); }
    });
    if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
    return { M, lines, texts, marks, cells, warnings, empty: false, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }
  // the outline of a group on sub map m, in px: [{ fill: path, edge: path, pts }]
  function groupShapes(M, g, m) {
    const P = (n, dx, dy) => { const p = posOf(M, n), [cx, cy] = centre(M, m, p.r, p.c); return [(cx + dx) * PX, -(cy + dy) * PX]; };
    const out = [];
    if (g.kind === 'rect') {
      const a = P(g.a, -0.3, 0.3), b = P(g.b, 0.3, -0.3);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      const d = roundRect(x, y, w, h, ROUND);
      out.push({ fillD: d, edgeD: d, pts: [[x, y], [x + w, y + h]] });
      return out;
    }
    if (g.kind === 'corner') {
      for (const [n, mx, my] of [[0, 1, 1], [2, -1, 1], [8, 1, -1], [10, -1, -1]]) {
        const A = P(n, -0.6 * mx, 0.6 * my), B = P(n, 0.3 * mx, 0.6 * my), C = P(n, 0.3 * mx, -0.3 * my), D = P(n, -0.6 * mx, -0.3 * my);
        out.push({ fillD: poly([A, B, C, D], [2]), edgeD: poly([B, C, D], [1], true), pts: [A, B, C, D] });
      }
      return out;
    }
    const vert = edgeVertical(M, g);
    for (const [one, two, mir] of [[g.a, g.b, 1], [g.c, g.d, -1]]) {
      let A, B, C, D;
      if (vert) { A = P(one, -0.3, 0.6 * mir); B = P(two, 0.3, 0.6 * mir); C = P(two, 0.3, -0.3 * mir); D = P(one, -0.3, -0.3 * mir); }
      else { A = P(two, -0.6 * mir, -0.3); B = P(one, -0.6 * mir, 0.3); C = P(one, 0.3 * mir, 0.3); D = P(two, 0.3 * mir, -0.3); }
      // fill: A B {round} C {round} D; border: B {round} C {round} D A (vertical) / B C {round} D {round} A …
      out.push({ fillD: poly([A, B, C, D], [2, 3]), edgeD: vert ? poly([B, C, D, A], [1, 2], true) : poly([B, C, D, A], [1, 2], true), pts: [A, B, C, D] });
    }
    return out;
  }
  // a polygon with the corners at the given indices rounded by 3pt (TikZ's rounded corners)
  function poly(pts, round, open = false) {
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const isEnd = open && (i === 0 || i === n - 1);
      if (!round.includes(i) || isEnd) { d += `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`; continue; }
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ra = Math.min(ROUND, la / 2), rb = Math.min(ROUND, lb / 2);
      const s = [p[0] + ((a[0] - p[0]) / la) * ra, p[1] + ((a[1] - p[1]) / la) * ra], e = [p[0] + ((b[0] - p[0]) / lb) * rb, p[1] + ((b[1] - p[1]) / lb) * rb];
      d += `${i ? 'L' : 'M'}${r2(s[0])},${r2(s[1])}Q${r2(p[0])},${r2(p[1])} ${r2(e[0])},${r2(e[1])}`;
    }
    return open ? d : d + 'Z';
  }
  const roundRect = (x, y, w, h, r) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], [0, 1, 2, 3]);

  // ---------------------------------------------------------------- drawing
  function draw(s, ctx) {
    const Lo = layout(s);
    const ink = TD.css(s.color || '#000000');
    let out = '';
    for (const mk of Lo.marks) if (mk.fill) out += `<path d="${mk.fillD}" fill="${mk.fill}" fill-opacity=".25" stroke="none"/>`;
    for (const l of Lo.lines) out += `<path d="${l.d}" fill="none" stroke="${ink}" stroke-width="${r2(ctx.export && !ctx.editor ? l.sw : Math.max(l.sw, ctx.editor ? 0.35 * PT : 0.5))}"/>`;
    for (const mk of Lo.marks) out += `<path d="${mk.edgeD}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
    for (const t of Lo.texts) {
      const svg = TD.textSvg(t.t, t.st, s.color || '#000000', t.x, t.y, ctx);
      out += t.rot ? `<g transform="rotate(${t.rot} ${r2(t.x)} ${r2(t.y)})">${svg}</g>` : svg;
    }
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{karnaugh-map\}/.test(t) ? t : `\\begin{karnaugh-map}\n${t}\n\\end{karnaugh-map}`;
  }

  TD.TYPES.kmap = {
    name: 'Karnaugh map',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'kmap', x: p.x, y: p.y, src: TD.KMAP_DEFAULT, color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the environment opens a tikzpicture of its own: it sits in a plain node with the outer picture interrupted
    tikz(s, X) {
      X.pkgs.add('karnaugh-map');
      const b = layout(s).bb;
      const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
      return `\\node[inner sep=0pt${col ? `, text=${col}` : ''}] at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture${col ? `\\color{${col}}` : ''}%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.kmap = {
    html(s) {
      const L = layout(s), M = L.M, n = varsOf(M.X, M.Y, M.Z);
      return `<div class="sec"><div class="sec-title">Karnaugh map <small>${n} variables · ${M.groups.length} group${M.groups.length === 1 ? '' : 's'}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="8">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the map to edit it visually. Exported with <code>\\usepackage{karnaugh-map}</code>.</div></div>
        <div class="sec"><button class="wide primary" data-act="editkmap">Edit Karnaugh Map…</button><button class="wide" data-act="copykmap">Copy Karnaugh Map Code</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editkmap') { if (TD.kmapOpen) TD.kmapOpen(s.id); return; }
      if (act !== 'copykmap') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Karnaugh Map Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied Karnaugh map code';
    },
  };
  // for the visual editor (js/kmeditor.js)
  TD.kmap = { parse, write, layout, draw, groupShapes, check, solve, labelsOf, labelMode, rectOf, rectCells, groupFor, cellAt, posOf, centre, mapOrigin, varsOf, varName, truth, fullCode, shown, colorList, colour, SIZES, DEF_LABEL, TEXT };
})();
