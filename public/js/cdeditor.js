// CD editor: the overlay that opens on a commutative diagram. A palette of objects and arrow styles; the
// diagram drawn over its grid of cells, where objects are typed or dropped and moved, and arrows are
// dragged from cell to cell; the selected cell's or arrow's properties; and beside them the tikz-cd code,
// live both ways. Only the cells that change are rewritten, so hand-written code keeps its form.
// TD.cdEditor.open(block, onDone, X) — block: { src }; onDone({ src }) on Done. X (TD.xy) edits xymatrix code
// instead: the model stays tikz-cd code, read from and written back to the xy dialect.
(function () {
  const TD = window.TD, D = TD.cd, Z = TD.zx;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const MM = TD.PX_PER_CM / 10;

  // ---------------------------------------------------------------- palette
  const cdw = (body) => `\\begin{tikzcd}${body}\\end{tikzcd}`;
  const OBJECTS = [
    ['A', 'A'], ['X', 'X'], ['zero', '0'], ['one', '1'], ['Z', '\\mathbb{Z}'], ['R', '\\mathbb{R}'], ['bullet', '\\bullet'], ['cdots', '\\cdots'],
    ['times', 'A \\times B'], ['oplus', 'A \\oplus B'], ['otimes', 'A \\otimes B'], ['hom', '\\operatorname{Hom}(A, B)'], ['ker', '\\ker f'], ['coker', '\\operatorname{coker} f'], ['pi1', '\\pi_1(X)'], ['FX', 'F(X)'],
  ];
  // arrow styles: [key, name, options]
  const STYLES = [
    ['to', 'Arrow', []], ['mapsto', 'Maps to', ['mapsto']], ['hook', 'Inclusion', ['hook']], ['two heads', 'Onto', ['two heads']],
    ['tail', 'Into', ['tail']], ['dashed', 'Dashed', ['dashed']], ['Rightarrow', 'Implies', ['Rightarrow']], ['equal', 'Equal', ['equal']],
    ['leftrightarrow', 'Both ways', ['leftrightarrow']], ['dash', 'Line', ['dash']], ['harpoon', 'Harpoon', ['harpoon']], ['squiggly', 'Squiggly', ['squiggly']],
  ];
  const STYLE = Object.fromEntries(STYLES.map(([k, n, o]) => [k, { k, name: n, items: o }]));
  const OBJ = Object.fromEntries(OBJECTS.map(([k, t]) => [k, t]));
  // An arrow's style is two independent choices: its head (the pictures) and its line (solid, dashed, dotted,
  // squiggly). A picture replaces only the head, a line only the line, so neither undoes the other.
  const LINE_KINDS = ['dashed', 'dotted', 'squiggly'];
  const isLine = (x) => LINE_KINDS.includes(Z.styleOf(x).name);
  const isHead = (x) => !isLine(x) && !!TD.CD_HEADS[Z.styleOf(x).name];
  const HEAD_STYLES = STYLES.filter(([, , o]) => !o.some((x) => LINE_KINDS.includes(x)));
  const headKey = (items) => {
    const h = items.filter(isHead).join(',');
    const st = HEAD_STYLES.find(([, , o]) => o.join(',') === h);
    return st ? st[0] : h ? '' : 'to';
  };
  const lineOf = (items) => { const x = items.find(isLine); return x ? Z.styleOf(x).name : ''; };
  // the palette's pick for an arrow: a line style (Dashed, Squiggly) sets the line, any other the head
  const paletteKey = (items) => { const l = lineOf(items), h = headKey(items); return l && STYLE[l] && h === 'to' ? l : h; };
  function applyStyle(a, k) {
    const o = STYLE[k].items;
    if (o.length && o.every((x) => LINE_KINDS.includes(x))) a.items = a.items.filter((x) => !isLine(x)).concat(o);
    else a.items = o.concat(a.items.filter((x) => !isHead(x)));
  }
  const SEP_OPTS = [['', 'Normal']].concat(TD.CD_SEPS.filter((x) => x !== 'normal').map((x) => [x, x[0].toUpperCase() + x.slice(1)]));
  const XY_SEPS = [['', 'Normal (2pc)'], ['.5pc', '0.5pc'], ['1pc', '1pc'], ['1.5pc', '1.5pc'], ['3pc', '3pc'], ['4pc', '4pc']];

  // ---------------------------------------------------------------- model
  // M: { wrapped, env, amp, rows: [{ cells: [cell], sep }] }; cell: { text, sep (the &[…] before it), t (its
  // maths), arrows: [{ dirs, items, cmd }], dirty }. A cell is written from t + arrows only once it is dirty.
  function parseCell(text, sep = '') {
    const p = D.cell(text);
    return { text: text.trim(), sep, t: p.t, node: p.node, arrows: p.arrows, dirty: false };
  }
  const emptyCell = () => ({ text: '', sep: '', t: '', arrows: [], dirty: false });
  const isEmpty = (c) => !c || (!c.text && !c.t && !c.arrows.length);
  function load(src) {
    const t = String(src || '');
    const { env, inner } = D.unwrap(t);
    const amp = /ampersand replacement/.test(env);
    const g = Z.grid(inner, amp), C = Math.max(0, ...g.map((r) => r.cells.length));
    let rows = g.map((r) => { const cells = r.cells.map((c) => parseCell(c.text, c.colSep)); while (cells.length < C) cells.push(emptyCell()); return { cells, sep: r.rowSep || '' }; });
    if (rows.length === 1 && rows[0].cells.every(isEmpty)) rows = [];
    // arrows between two cells written by position (quiver puts them all in the last cell: from=1-1, to=1-2) move into
    // their source cell as \arrow[r] …; the ones that end at a name (a 2-cell) stay put, after the labels naming them
    rows.forEach((row, r) => row.cells.forEach((cell, c) => {
      cell.arrows = cell.arrows.filter((a) => {
        if (a.dirs) return true;
        let from = [r, c], to = [r, c], ok = true;
        const rest = a.items.filter((x) => {
          const m = /^(from|to)\s*=\s*\{?\s*(?:(\d+)\s*-\s*(\d+)|([rlud]+)|(.*?))\s*\}?\s*$/.exec(x.trim());
          if (!m) return true;
          let p;
          if (m[2]) p = [+m[2] - 1, +m[3] - 1];
          else if (m[4]) { const [dr, dc] = delta(m[4]); p = [r + dr, c + dc]; }
          else { ok = false; return true; }
          if (m[1] === 'from') from = p; else to = p;
          return false;
        });
        const dirs = dirsOf(to[0] - from[0], to[1] - from[1]);
        const src = ok && rows[from[0]] && rows[from[0]].cells[from[1]];
        if (!ok || !dirs || !src || !rows[to[0]] || !rows[to[0]].cells[to[1]]) return true;
        a.dirs = dirs; a.items = rest; a.cmd = 'arrow';
        src.dirty = cell.dirty = true;
        if (src === cell) return true;
        src.arrows.push(a);
        return false;
      });
    }));
    // kept as written: code around the environment (\tikzset{…}) and a \\ after the last row (tikz-cd's empty row)
    const b = t.indexOf('\\begin{tikzcd}'), e = t.lastIndexOf('\\end{tikzcd}');
    const pre = b > 0 ? t.slice(0, b) : '', post = b >= 0 && e >= 0 ? t.slice(e + '\\end{tikzcd}'.length) : '';
    const tm = /\\\\\s*(\[[^\]]*\])?\s*$/.exec(inner);
    return { wrapped: /\\begin\{tikzcd\}/.test(t) || !t.trim(), env, amp, rows, pre, post, trail: tm ? ` \\\\${tm[1] || ''}` : '' };
  }
  const nR = (M) => M.rows.length, nC = (M) => (M.rows[0] ? M.rows[0].cells.length : 0);
  function arrowCode(a) {
    const o = a.items.length ? `[${a.items.join(', ')}]` : '';
    // a shortcut (\rar …) stays one while it still points its way
    if (a.cmd && Z.ARROWS[a.cmd] && Z.ARROWS[a.cmd] === a.dirs) return `\\${a.cmd}${o}`;
    return `\\arrow[${[a.dirs, ...a.items].filter(Boolean).join(', ')}]`;
  }
  const cellText = (c) => (c.dirty ? [c.node != null ? `|[${c.node}]|` : '', c.t, ...c.arrows.map(arrowCode)].filter(Boolean).join(' ') : c.text);
  // the code, with the & signs lined up
  function codeOf(M) {
    const R = nR(M), C = nC(M);
    const amp = M.amp ? '\\&' : '&';
    const parts = M.rows.map((row) => row.cells.map((c, i) => { const t = cellText(c); return (i ? `${amp}${c.sep ? `[${c.sep}]` : ''}${t ? ' ' : ''}` : '') + t; }));
    // trailing empty cells go, unless an arrow ends there (tikz-cd needs the node)
    const hit = new Set();
    M.rows.forEach((row, r) => row.cells.forEach((c, i) => c.arrows.forEach((a) => { const m = !a.dirs && a.items.map((x) => /^(?:from|to)\s*=\s*([rlud]+)\s*$/.exec(x)).find(Boolean); const [dr, dc] = delta(m ? m[1] : a.dirs); hit.add(`${r + dr},${i + dc}`); })));
    parts.forEach((p, r) => { while (p.length > 1 && /^\\?&\s*$/.test(p[p.length - 1]) && !hit.has(`${r},${p.length - 1}`)) p.pop(); });
    const w = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...parts.map((p) => (p[c] || '').length));
    const lines = parts.map((p, r) => '  ' + p.map((t, c) => (c < p.length - 1 ? t.padEnd(w[c]) + ' ' : t)).join('').replace(/\s+$/, '') + (r < R - 1 ? ` \\\\${M.rows[r].sep ? `[${M.rows[r].sep}]` : ''}` : M.trail || ''));
    const body = R ? lines.join('\n') : '';
    return M.wrapped ? `${M.pre || ''}\\begin{tikzcd}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{tikzcd}${M.post || ''}` : body;
  }
  const delta = D.delta;
  const dirsOf = (dr, dc) => (dc > 0 ? 'r'.repeat(dc) : 'l'.repeat(-dc)) + (dr > 0 ? 'd'.repeat(dr) : 'u'.repeat(-dr));
  const same = (a, b) => delta(a).join() === delta(b).join(); // ddll and lldd point the same way
  // Cells move to new places (map: [r, c] → [r, c] or null); every arrow keeps (or drops) its two ends.
  function remap(M, map, R2, C2) {
    const out = Array.from({ length: R2 }, () => ({ cells: Array.from({ length: C2 }, emptyCell), sep: '' }));
    M.rows.forEach((row, r) => {
      row.cells.forEach((cell, c) => {
        const to = map(r, c);
        if (!to) return;
        const keep = [];
        for (const a of cell.arrows) {
          if (!a.dirs) {
            // from=… / to=…: the other end, moved with its cell
            const k = a.items.findIndex((x) => /^(from|to)\s*=\s*[rlud]+\s*$/.test(x));
            if (k < 0) { keep.push(a); continue; }
            const m = /^(from|to)\s*=\s*([rlud]+)/.exec(a.items[k]), [dr, dc] = delta(m[2]), t = map(r + dr, c + dc);
            const d = t && dirsOf(t[0] - to[0], t[1] - to[1]);
            if (!d) { cell.dirty = true; continue; }
            if (!same(d, m[2])) { a.items[k] = `${m[1]}=${d}`; cell.dirty = true; }
            keep.push(a); continue;
          }
          const [dr, dc] = delta(a.dirs), t = map(r + dr, c + dc);
          if (!t) { cell.dirty = true; continue; }
          const d = dirsOf(t[0] - to[0], t[1] - to[1]);
          if (!d) { cell.dirty = true; continue; }
          if (!same(d, a.dirs)) { a.dirs = d; cell.dirty = true; }
          keep.push(a);
        }
        cell.arrows = keep;
        out[to[0]].cells[to[1]] = cell;
      });
      const t = map(r, 0);
      if (t && row.sep && !out[t[0]].sep) out[t[0]].sep = row.sep;
    });
    M.rows = out;
  }
  const insertRow = (M, at) => remap(M, (r, c) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r >= at ? r + 1 : r, c] : null), nR(M) + 1, Math.max(1, nC(M)));
  const deleteRows = (M, a, b) => { const n = b - a + 1; remap(M, (r, c) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (r >= a && r <= b) ? null : [r > b ? r - n : r, c]), nR(M) - n, nC(M)); };
  const insertCol = (M, at) => remap(M, (r, c) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r, c >= at ? c + 1 : c] : null), Math.max(1, nR(M)), nC(M) + 1);
  const deleteCols = (M, a, b) => { const n = b - a + 1; remap(M, (r, c) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (c >= a && c <= b) ? null : [r, c > b ? c - n : c]), nR(M), nC(M) - n); if (!nC(M)) M.rows = []; };
  function ensure(M, R, C) {
    while (nR(M) < R) M.rows.push({ cells: Array.from({ length: Math.max(nC(M), 1) }, emptyCell), sep: '' });
    while (nC(M) < C) for (const r of M.rows) r.cells.push(emptyCell());
  }
  const touch = (c) => { c.dirty = true; };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'cdModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  function blocks(at, del, cols) {
    const P = (x, y) => { const r = (v) => +v.toFixed(2); return cols ? `${r(y)},${r(x)}` : `${r(x)},${r(y)}`; };
    const box = (x, y, w, h) => `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`;
    const out = (x, y, w, h) => `<path class="qo" d="${box(x + 0.5, y + 0.5, w - 1, h - 1)}"/>`;
    const solid = (d) => `<path class="qf" fill-rule="evenodd" d="${d}"/>`;
    if (del) {
      const a = 2.6, t = 0.75, k = Math.SQRT1_2, cx = 12, cy = 10;
      const arm = [[t, a], [t, t], [a, t], [a, -t], [t, -t], [t, -a], [-t, -a], [-t, -t], [-a, -t], [-a, t], [-t, t], [-t, a]]
        .map(([x, y], i) => `${i ? 'L' : 'M'}${P(cx + (x - y) * k, cy + (x + y) * k)}`).join('') + 'Z';
      return out(1.5, 1, 12, 4) + out(1.5, 15, 12, 4) + solid(box(5.5, 6.5, 13, 7) + arm);
    }
    return [1.5, 8, 14.5].map((y, i) => (i === at ? solid(box(6.5, y, 12, 4)) : out(1.5, y, 12, 4))).join('');
  }
  const QI = { above: blocks(0, false, false), below: blocks(2, false, false), rowdel: blocks(0, true, false), before: blocks(0, false, true), after: blocks(2, false, true), coldel: blocks(0, true, true) };
  const qic = (k) => `<svg viewBox="0 0 20 20" class="qe-ic">${QI[k]}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="cdTitle">
    <div class="modal-head">
      <strong id="cdTitle">Commutative diagram</strong>
      <div class="cz-tools">
        <button class="icon flat" data-ce="addrow" title="Add a row at the bottom">${qic('below')}</button>
        <button class="icon flat" data-ce="addcol" title="Add a column at the end">${qic('after')}</button>
        <button class="icon flat danger" data-ce="delete" title="Delete the selection (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ce="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-ce="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-ce="fit" title="Fit the diagram in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ce="cancel">Cancel</button>
      <button class="primary" data-ce="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list ce-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg ce-svg" aria-label="Commutative diagram"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>tikz-cd</span><small class="cz-count"></small><button class="flat" data-ce="copy" title="Copy the tikz-cd code">Copy</button></div>
          <textarea spellcheck="false" aria-label="tikz-cd code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.ce-svg', root), stage = $('.cz-stage', root), list = $('.ce-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel, arrow: [r, c, i] | null, arm, style (for new arrows), view, undo, redo, pending, start, done, drag, hover, ghost, codeAt, codeTimer, clip, G }
  let E = null, lastDown = { t: 0, x: 0, y: 0 };
  const snap = () => codeOf(E.M);
  // the code as the block keeps it: tikz-cd, or xymatrix in the xy dialect
  const out = () => (E.X ? E.X.fromCd(snap()) : snap());
  const layoutOf = (src) => (E.X ? E.X.layout : D.layout)({ src });
  function begin() { if (E.pending == null) E.pending = snap(); }
  function commit() {
    if (E.pending == null) return;
    const now = snap();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  function edit(fn) { begin(); fn(); commit(); clampSel(); draw(); keepInView(); renderProps(); }
  function keepInView() {
    const G = E.G, r = rect(), v = E.view;
    if (!G) return;
    const x1 = v.ox + G.xs[0] * v.k, x2 = v.ox + G.xs[G.xs.length - 1] * v.k, y1 = v.oy + G.ys[0] * v.k, y2 = v.oy + G.ys[G.ys.length - 1] * v.k;
    if (x1 < 0 || y1 < 0 || x2 > r.width || y2 > r.height) fit();
  }
  function restore(code) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snap()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snap()); restore(E.redo.pop()); }
  const at = (r, c) => (E.M.rows[r] && E.M.rows[r].cells[c]) || null;
  const arrowOf = (w) => { const c = w && at(w[0], w[1]); return c ? c.arrows[w[2]] || null : null; };
  function clampSel() {
    if (E.arrow && !arrowOf(E.arrow)) E.arrow = null;
    const s = E.sel;
    if (!s) return;
    const R = nR(E.M), C = nC(E.M);
    if (!R || !C) { E.sel = null; return; }
    const f = (v, n) => Math.max(0, Math.min(n - 1, v));
    E.sel = { r1: f(s.r1, R), c1: f(s.c1, C), r2: f(s.r2, R), c2: f(s.c2, C) };
  }
  const selBox = () => { const s = E.sel; return s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }; };
  const single = () => { const b = selBox(); return b && b.r1 === b.r2 && b.c1 === b.c2 ? b : null; };
  const selectCell = (r, c) => { E.sel = { r1: r, c1: c, r2: r, c2: c }; E.arrow = null; };
  const selectArrow = (w) => { E.arrow = w; E.sel = null; };

  // ---------------------------------------------------------------- editing
  function place(key, r, c) {
    ensure(E.M, r + 1, c + 1);
    const cell = at(r, c);
    cell.t = OBJ[key]; touch(cell);
  }
  function put(k, r, c, step) {
    edit(() => place(k, r, c));
    if (step) { ensure(E.M, r + 1, c + 2); selectCell(r, c + 1); } else selectCell(r, c);
    draw(); renderProps();
  }
  // an arrow from one cell to another, in the style picked in the palette
  function addArrow(r1, c1, r2, c2) {
    if (r1 === r2 && c1 === c2) return null;
    let w = null;
    edit(() => {
      ensure(E.M, Math.max(r1, r2) + 1, Math.max(c1, c2) + 1);
      const a = at(r1, c1);
      a.arrows.push({ dirs: dirsOf(r2 - r1, c2 - c1), items: STYLE[E.style] ? STYLE[E.style].items.slice() : [], cmd: 'arrow' });
      touch(a);
      w = [r1, c1, a.arrows.length - 1];
    });
    selectArrow(w); draw(); renderProps();
    return w;
  }
  function moveCell(r1, c1, r2, c2, copy) {
    const M = E.M;
    ensure(M, r2 + 1, c2 + 1);
    if (copy) {
      const src = JSON.parse(JSON.stringify(at(r1, c1)));
      const keep = [];
      for (const a of src.arrows) {
        const [dr, dc] = delta(a.dirs), tr = r1 + dr, tc = c1 + dc;
        if (tr === r2 && tc === c2) continue;
        if (tr < 0 || tc < 0 || tr >= nR(M) || tc >= nC(M)) continue;
        a.dirs = dirsOf(tr - r2, tc - c2); keep.push(a);
      }
      src.arrows = keep; touch(src);
      src.sep = at(r2, c2).sep;
      M.rows[r2].cells[c2] = src;
      return;
    }
    const sep1 = at(r1, c1).sep, sep2 = at(r2, c2).sep;
    remap(M, (r, c) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) ? null : r === r1 && c === c1 ? [r2, c2] : r === r2 && c === c2 ? [r1, c1] : [r, c]), nR(M), nC(M));
    at(r2, c2).sep = sep2; at(r1, c1).sep = sep1;
  }
  // clearing cells also drops the arrows that reach into them
  function clearCells(b) {
    edit(() => {
      const inBox = (r, c) => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = at(r, c); if (cell && !isEmpty(cell)) Object.assign(cell, emptyCell(), { sep: cell.sep }); }
      E.M.rows.forEach((row, r) => row.cells.forEach((cell) => {
        const n = cell.arrows.length;
        cell.arrows = cell.arrows.filter((a) => { const [dr, dc] = delta(a.dirs); return !inBox(r + dr, row.cells.indexOf(cell) + dc); });
        if (cell.arrows.length !== n) touch(cell);
      }));
    });
  }
  function deleteArrow(w) {
    const cell = at(w[0], w[1]);
    if (!cell) return;
    edit(() => { cell.arrows.splice(w[2], 1); touch(cell); });
    E.arrow = null; renderProps(); draw();
  }
  // the arrow turned round: it starts from its old target, its label and bend keep their side on the page
  function reverseArrow(w) {
    const a = arrowOf(w);
    if (!a) return;
    const [dr, dc] = delta(a.dirs), r2_ = w[0] + dr, c2 = w[1] + dc;
    let nw = null;
    edit(() => {
      const from = at(w[0], w[1]), to = at(r2_, c2);
      from.arrows.splice(w[2], 1); touch(from);
      a.dirs = dirsOf(-dr, -dc); a.cmd = 'arrow';
      a.items = a.items.map((x) => {
        const L = D.label(x);
        if (L) { L.swap = !L.swap; return D.labelCode(L); }
        const n = Z.styleOf(x).name;
        if (n === 'bend left') return x.replace('bend left', 'bend right');
        if (n === 'bend right') return x.replace('bend right', 'bend left');
        if (n === 'shift left') return x.replace('shift left', 'shift right');
        if (n === 'shift right') return x.replace('shift right', 'shift left');
        return x;
      });
      to.arrows.push(a); touch(to);
      nw = [r2_, c2, to.arrows.length - 1];
    });
    selectArrow(nw); draw(); renderProps();
  }
  function deleteSel() { if (E.arrow) deleteArrow(E.arrow); else { const b = selBox(); if (b) clearCells(b); } }

  // ---------------------------------------------------------------- palette
  function sizeMinis(el, maxW, maxH, top) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  const styleMini = (items) => TD.cdMini(cdw(` \\arrow[r${items.length ? ', ' + items.join(', ') : ''}] & `), 1e3);
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    const objs = OBJECTS.filter(([k, t]) => !q || `${k} ${t} objects`.toLowerCase().includes(q));
    if (objs.length) html += `<div class="cz-cat"><div class="cz-cat-t">Objects</div><div class="qe-grid">${objs.map(([k, t]) => `<button class="qe-item${E && E.arm === k ? ' on' : ''}" data-item="${k}" title="${esc(t)}" role="listitem"><span class="qe-fig">${TD.cdMini(cdw(t), 1e3)}</span></button>`).join('')}</div></div>`;
    const sts = STYLES.filter(([k, n]) => !q || `${k} ${n} arrows`.toLowerCase().includes(q));
    if (sts.length) {
      const cur = E && E.arrow && arrowOf(E.arrow) ? paletteKey(arrowOf(E.arrow).items) : E ? E.style : 'to';
      html += `<div class="cz-cat"><div class="cz-cat-t">Arrows${E && E.arrow ? '' : ' <small>for new arrows</small>'}</div><div class="qe-grid">${sts.map(([k, n, o]) => `<button class="qe-item${cur === k ? ' on' : ''}" data-style="${esc(k)}" title="${esc(n)}${o.length ? ` (${o.join(', ')})` : ''}" role="listitem"><span class="qe-fig">${styleMini(o)}</span><span>${esc(n)}</span></button>`).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list, 64, 34, 2.2);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) { if (b.dataset.item) pick(b.dataset.item); else pickStyle(b.dataset.style); } search.blur(); }
  });
  let palDrag = null;
  list.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    if (b.dataset.style) { pickStyle(b.dataset.style); return; }
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!palDrag) return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (palDrag.moved) { E.hover = overStage(e) ? cellAt(e) : null; E.ghost = { k: palDrag.k, e: pos(e) }; draw(); }
  });
  list.addEventListener('pointerup', (e) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    if (!d.moved) { pick(d.k); return; }
    const h = overStage(e) && cellAt(e);
    if (h) { edit(() => place(d.k, h.r, h.c)); selectCell(h.r, h.c); renderProps(); }
    E.hover = null; draw();
  });
  function pick(k) {
    const s = single();
    if (s && !E.arm) { put(k, s.r1, s.c1, true); return; }
    if (!nR(E.M) && !E.arm) { put(k, 0, 0, true); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? `${OBJ[k]}: click a cell to place it. Esc when done.` : '');
  }
  // an arrow style: onto the selected arrow, else the style of the next arrows drawn
  function pickStyle(k) {
    const a = E.arrow && arrowOf(E.arrow);
    if (a) {
      const cell = at(E.arrow[0], E.arrow[1]);
      edit(() => { applyStyle(a, k); touch(cell); });
    } else { E.style = k; setTip(`New arrows: ${STYLE[k].name.toLowerCase()}. Drag from a cell's blue handle to draw one.`); }
    buildPalette();
  }
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  // The diagram in the renderer's px (empty cells spread to 4mm so they can be picked), cell edges
  // halfway between columns / rows, and one more column and row past the end that grow the grid.
  function geom() {
    const s = { type: 'cd', x: 0, y: 0, src: snap(), color: INK, minCell: 4 * MM };
    const L = (E.X ? E.X.layoutCd : D.layout)(s), R = nR(E.M), C = nC(E.M);
    const pitch = 8 * MM, xs = [], ys = [];
    if (L.R && L.C && L.geo) {
      const g = L.geo, colR = (c) => g.colL[c] + g.colW[c], rowB = (r) => g.rowT[r] + g.rowH[r];
      for (let c = 0; c < L.C; c++) xs.push(c ? (colR(c - 1) + g.colL[c]) / 2 : g.colL[0] - Math.max(g.cs / 2, MM));
      xs.push(colR(L.C - 1) + Math.max(g.cs / 2, MM));
      for (let r = 0; r < L.R; r++) ys.push(r ? (rowB(r - 1) + g.rowT[r]) / 2 : g.rowT[0] - Math.max(g.rs / 2, MM));
      ys.push(rowB(L.R - 1) + Math.max(g.rs / 2, MM));
    } else { xs.push(0); ys.push(0); }
    while (xs.length < C + 1) xs.push(xs[xs.length - 1] + pitch);
    while (ys.length < R + 1) ys.push(ys[ys.length - 1] + pitch);
    xs.push(xs[xs.length - 1] + pitch); ys.push(ys[ys.length - 1] + pitch);
    const cx = (c) => (L.geo && c < L.C ? L.geo.cx[c] : (xs[c] + xs[c + 1]) / 2), cy = (r) => (L.geo && r < L.R ? L.geo.cy[r] : (ys[r] + ys[r + 1]) / 2);
    return { s, L, xs, ys, R, C, cx, cy };
  }
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toL = (e) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  function cellAt(e) {
    const G = E.G || (E.G = geom()), [x, y] = toL(e);
    const find = (a, v) => { for (let i = 0; i < a.length - 1; i++) if (v >= a[i] && v < a[i + 1]) return i; return -1; };
    const c = find(G.xs, x), r = find(G.ys, y);
    if (c < 0 || r < 0 || (G.R && G.C && r === G.R && c === G.C)) return null;
    return { r, c };
  }
  // the arrow (or its label) under the pointer, [r, c, i]
  function arrowAt(e, px = 5) {
    const G = E.G || (E.G = geom());
    if (!G.L.arrows) return null;
    const [x, y] = toL(e), tol = px / E.view.k;
    for (const l of G.L.labels) if (Math.abs(x - l.x) <= l.w / 2 && Math.abs(y - l.y) <= l.h / 2) return l.src.slice(0, 3);
    let best = null, bd = tol;
    for (const a of G.L.arrows) for (let i = 0; i <= 32; i++) {
      const p = D.at(a.seg, i / 32), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = a.src; }
    }
    return best;
  }
  // the object (drawn maths) under the pointer
  function nodeAt(e, px = 2) {
    const G = E.G || (E.G = geom());
    if (!G.L.nodes) return null;
    const [x, y] = toL(e), p = px / E.view.k;
    for (const n of G.L.nodes) if (Math.abs(x - n.x) <= n.w / 2 + p && Math.abs(y - n.y) <= n.h / 2 + p) return { r: n.cell[0], c: n.cell[1] };
    return null;
  }
  function fit() {
    const G = geom(), r = rect();
    const bb = G.L.bb || { x: 0, y: 0, w: 0, h: 0 };
    const x1 = Math.min(G.xs[0], bb.x) - 4, x2 = Math.max(G.xs[G.xs.length - 1], bb.x + bb.w) + 4;
    const y1 = Math.min(G.ys[0], bb.y) - 4, y2 = Math.max(G.ys[G.ys.length - 1], bb.y + bb.h) + 4;
    const k = Math.max(0.8, Math.min(5, Math.min((r.width - 80) / (x2 - x1), (r.height - 80) / (y2 - y1))));
    E.view = { k, ox: r.width / 2 - ((x1 + x2) / 2) * k, oy: r.height / 2 - ((y1 + y2) / 2) * k };
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(0.5, Math.min(14, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Pop) Pop.pop.place();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const G = (E.G = geom()), r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    const X = (x) => r2(v.ox + x * k), Y = (y) => r2(v.oy + y * k);
    const { xs, ys, R, C, L } = G;
    const bb = L.bb;
    const px1 = Math.min(xs[0], bb.x) - 3, px2 = xs[xs.length - 1] + 2, py1 = Math.min(ys[0], bb.y) - 3, py2 = Math.max(ys[ys.length - 1], bb.y + bb.h) + 2;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><rect class="qe-paper" x="${X(px1)}" y="${Y(py1)}" width="${r2((px2 - px1) * k)}" height="${r2((py2 - py1) * k)}"/>`;
    let rules = '';
    for (let c = 0; c <= C; c++) rules += `M${X(xs[c])},${Y(ys[0])}V${Y(ys[R])}`;
    for (let i = 0; i <= R; i++) rules += `M${X(xs[0])},${Y(ys[i])}H${X(xs[C])}`;
    if (R && C) out += `<path class="qe-rule" d="${rules}"/>`;
    if (R && C) {
      out += `<rect class="qe-grow" x="${X(xs[C])}" y="${Y(ys[0])}" width="${r2((xs[C + 1] - xs[C]) * k)}" height="${r2((ys[R] - ys[0]) * k)}"/>`;
      out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[R])}" width="${r2((xs[C] - xs[0]) * k)}" height="${r2((ys[R + 1] - ys[R]) * k)}"/>`;
      const plus = (x, y) => `<path class="qe-plus" d="M${X(x) - 5},${Y(y)}h10M${X(x)},${Y(y) - 5}v10"/>`;
      out += plus((xs[C] + xs[C + 1]) / 2, (ys[0] + ys[R]) / 2) + plus((xs[0] + xs[C]) / 2, (ys[R] + ys[R + 1]) / 2);
    }
    const box = (r1, c1, r2_, c2, cls) => `<rect class="${cls}" x="${X(xs[c1])}" y="${Y(ys[r1])}" width="${r2((xs[c2 + 1] - xs[c1]) * k)}" height="${r2((ys[r2_ + 1] - ys[r1]) * k)}"/>`;
    const b = selBox();
    if (b) out += box(b.r1, b.c1, b.r2, b.c2, 'qe-sel ze-sel');
    const h = E.hover, dragging = E.drag && ((E.drag.mode === 'move' && E.drag.moved) || E.drag.mode === 'arrow');
    if (h && (h.r <= R && h.c <= C)) {
      if (E.arm || E.ghost || dragging) out += box(h.r, h.c, h.r, h.c, 'qe-target');
      else if (!E.drag && R && C && h.r < R && h.c < C) out += box(h.r, h.c, h.r, h.c, 'qe-hover');
    }
    // the selected arrow, as a halo under the drawing
    const sa = E.arrow && L.arrows && L.arrows.find((a) => a.src.join() === E.arrow.join());
    if (sa) {
      out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(k)})"><path class="ze-wsel" d="${D.curveD(sa.seg)}" stroke-width="${r2(8 / k)}"/>`;
      for (const l of L.labels) if (l.src.slice(0, 3).join() === E.arrow.join()) out += `<rect class="ze-wsel" x="${r2(l.x - l.w / 2)}" y="${r2(l.y - l.h / 2)}" width="${r2(l.w)}" height="${r2(l.h)}" stroke-width="${r2(3 / k)}"/>`;
      out += '</g>';
    }
    if (R && C && !L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(k)})">${D.draw({ ...G.s, x: bb.x, y: bb.y }, { paper: PAPER, export: true }, L)}</g>`;
    if (!R || !C || L.empty) out += `<text class="qe-empty" x="${X((xs[0] + xs[Math.max(1, C)]) / 2)}" y="${Y(ys[0]) - 10}">${R && C ? 'Type in a cell, or drop an object' : 'Drop an object here to start'}</text>`;
    // an arrow being drawn
    if (E.drag && E.drag.mode === 'arrow') {
      const d = E.drag, x0 = X(G.cx(d.c)), y0 = Y(G.cy(d.r));
      const t = E.hover && (E.hover.r !== d.r || E.hover.c !== d.c) ? [X(G.cx(E.hover.c)), Y(G.cy(E.hover.r))] : d.e;
      out += `<path class="ze-draft" d="M${x0},${y0}L${r2(t[0])},${r2(t[1])}"/>`;
    }
    // the arrow knob: the selected (or hovered) cell's handle for drawing arrows
    const sc = single();
    const knobCell = !E.drag && !E.ghost && !E.arm && (E.knobAt || (sc && sc.r1 < R && sc.c1 < C ? { r: sc.r1, c: sc.c1 } : null));
    if (knobCell) {
      const n = L.nodes && L.nodes.find((x) => x.cell[0] === knobCell.r && x.cell[1] === knobCell.c);
      const kx = r2(X(G.cx(knobCell.c) + (n ? n.w / 2 : 2 * MM)) + 9), ky = r2(Y(G.cy(knobCell.r)));
      out += `<g class="ze-knob" data-r="${knobCell.r}" data-c="${knobCell.c}"><title>Drag to another cell to draw an arrow</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // the delete gutters left of the rows and above the columns
    E.gut = !E.drag && !E.arm && !E.ghost && R && C ? { sx: xs.map(X), sy: ys.map(Y), R, C, left: X(px1), top: Y(py1) } : null;
    out += TD.gridDel.svg(E.gut, E.del, E.del ? null : E.near, ['row', 'column']);
    // what is being dragged, under the pointer
    const mv = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if ((E.ghost && E.ghost.k) || mv) {
      const t = E.ghost ? OBJ[E.ghost.k] : at(E.drag.r, E.drag.c).t || '\\bullet';
      const [gx, gy] = E.ghost ? E.ghost.e : E.drag.e;
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${TD.cdMini(cdw(t), 24)}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    // the stage takes no focus itself, so a field still focused would swallow the keys meant for the diagram
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    const dz = e.button === 0 && !E.space && TD.gridDel.at(E.gut, sx, sy);
    if (dz) { delLine(dz); return; }
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'arrow', r: +kb.dataset.r, c: +kb.dataset.c, e: [sx, sy] }; E.knobAt = null; return; }
    const h = cellAt(e);
    if (E.arm && h) { put(E.arm, h.r, h.c, false); return; }
    // an object wins over an arrow running past it; an arrow over the cell around it
    const n = nodeAt(e), w = !n && arrowAt(e);
    if (w) { selectArrow(w); E.drag = null; draw(); renderProps(); buildPalette(); if (dbl) editLabel(w); return; }
    if (!h) { E.sel = null; E.arrow = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps(); buildPalette(); return; }
    if (h.r >= nR(E.M) || h.c >= nC(E.M)) { edit(() => ensure(E.M, h.r + 1, h.c + 1)); selectCell(h.r, h.c); draw(); renderProps(); return; }
    if (dbl && single() && single().r1 === h.r && single().c1 === h.c) { editCell(h.r, h.c); return; }
    if (e.shiftKey && E.sel) { E.sel.r2 = h.r; E.sel.c2 = h.c; E.arrow = null; draw(); renderProps(); return; }
    const was = E.arrow;
    selectCell(h.r, h.c);
    const cell = at(h.r, h.c);
    E.drag = !isEmpty(cell) ? { mode: 'move', r: h.r, c: h.c, sx, sy, e: [sx, sy], moved: false } : { mode: 'range', r: h.r, c: h.c };
    draw(); renderProps();
    if (was) buildPalette();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const dz = TD.gridDel.at(E.gut, sx, sy), h = dz ? null : cellAt(e), n = dz ? null : nodeAt(e, 14);
      const kn = n || (e.target.closest('.ze-knob') ? E.knobAt : null);
      const nr = dz ? null : TD.gridDel.near(E.gut, sx, sy);
      const ch = JSON.stringify(nr) !== JSON.stringify(E.near) || JSON.stringify(dz) !== JSON.stringify(E.del) || JSON.stringify(h) !== JSON.stringify(E.hover) || JSON.stringify(kn) !== JSON.stringify(E.knobAt);
      E.hover = h; E.knobAt = kn; E.del = dz; E.near = nr;
      svg.style.cursor = dz || (!n && arrowAt(e)) ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Pop) Pop.pop.place(); return;
    }
    if (d.mode === 'arrow') {
      d.e = [sx, sy]; E.hover = cellAt(e);
      const h = E.hover;
      setTip(h && (h.r !== d.r || h.c !== d.c) ? `Arrow to row ${h.r + 1}, column ${h.c + 1}` : 'Drop on another cell');
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true; d.e = [sx, sy]; E.hover = cellAt(e);
      setTip(e.altKey ? 'Copy to this cell' : 'Move here; a full cell swaps places. ⌥ copies.');
      draw(); return;
    }
    if (d.mode === 'range') { const h = cellAt(e); if (h && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); } }
  });
  svg.addEventListener('pointerup', (e) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'arrow') {
      setTip('');
      const h = cellAt(e);
      if (h && (h.r !== d.r || h.c !== d.c)) { addArrow(d.r, d.c, h.r, h.c); buildPalette(); }
      E.hover = null; draw(); return;
    }
    if (d.mode === 'move' && d.moved) {
      setTip('');
      const h = cellAt(e);
      if (h && (h.r !== d.r || h.c !== d.c)) { edit(() => moveCell(d.r, d.c, h.r, h.c, e.altKey)); selectCell(h.r, h.c); }
      E.hover = null; draw(); renderProps(); return;
    }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt || E.del || E.near)) { E.hover = null; E.knobAt = null; E.del = null; E.near = null; draw(); } });
  // a click on a delete gutter: that row or column goes, as one undo step
  function delLine(dz) {
    closePop(); E.del = null; E.hover = null; E.knobAt = null; E.sel = null; E.arrow = null; svg.style.cursor = '';
    edit(() => (dz.kind === 'row' ? deleteRows(E.M, dz.i, dz.i) : deleteCols(E.M, dz.i, dz.i))); buildPalette();
  }

  // right-click: rows and columns around the cell (or range) under the pointer; on an arrow, the arrow
  const MI = { ...QI, clear: '<path d="M4 4l12 12M16 4L4 16"/>', del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>', rev: '<path d="M3 7h13l-3-3M17 13H4l3 3"/>', edit: '<path d="M4 16l1-4 8-8 3 3-8 8z"/>' };
  const mItem = (act, label, icon, key) => `<button class="ctx-item${/^(rowdel|coldel|delete|arrowdel)$/.test(act) ? ' danger' : ''}" data-cm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const n = nodeAt(e), w = !n && arrowAt(e);
    if (w) {
      selectArrow(w); draw(); renderProps(); buildPalette();
      menu.innerHTML = mItem('label', 'Edit Label', 'edit', 'Enter') + mItem('reverse', 'Reverse Arrow', 'rev') + '<hr>' + mItem('arrowdel', 'Delete Arrow', 'del', '⌫');
    } else {
      const h = cellAt(e);
      if (!h || h.r >= nR(E.M) || h.c >= nC(E.M)) { closeMenu(); return; }
      const b = selBox();
      if (!b || h.r < b.r1 || h.r > b.r2 || h.c < b.c1 || h.c > b.c2) selectCell(h.r, h.c);
      draw(); renderProps();
      const s = selBox(), nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
      menu.innerHTML = (single() ? mItem('cell', 'Edit Object', 'edit', 'Enter') + '<hr>' : '') +
        mItem('rowabove', 'Insert Row Above', 'above') + mItem('rowbelow', 'Insert Row Below', 'below') + '<hr>' +
        mItem('colbefore', 'Insert Column Before', 'before') + mItem('colafter', 'Insert Column After', 'after') + '<hr>' +
        mItem('rowdel', nr > 1 ? `Delete ${nr} Rows` : 'Delete Row', 'rowdel') + mItem('coldel', nc > 1 ? `Delete ${nc} Columns` : 'Delete Column', 'coldel') + '<hr>' +
        mItem('delete', nr * nc > 1 ? 'Clear Cells' : 'Clear Cell', 'clear', '⌫');
    }
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cm]');
    if (!b) return;
    closeMenu();
    act(b.dataset.cm);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- in-place editors
  // A floating box under the object, or by the arrow's label (TD.input.popup); one undo step each.
  let Pop = null;
  function editCell(r, c, init) {
    if (!TD.input) return false;
    ensure(E.M, r + 1, c + 1);
    const cell = at(r, c);
    closePop();
    begin();
    if (init != null) { cell.t = init; touch(cell); draw(); }
    const me = (Pop = { r, c });
    me.pop = TD.input.popup(stage, {
      text: cell.t || '', math: true, bare: true,
      at: () => { const G = E.G || (E.G = geom()), v = E.view, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + v.ox + G.cx(c) * v.k, vr.top - sr.top + v.oy + G.ys[r + 1] * v.k + 8]; },
      onInput: (v) => { cell.t = v; touch(cell); draw(); renderProps(); },
      onDone: () => { if (Pop === me) Pop = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // the arrow's first label (one is added when it has none)
  function firstLabel(a) { const i = a.items.findIndex((x) => D.label(x)); return i < 0 ? null : { i, L: D.label(a.items[i]) }; }
  function setLabel(a, fn) {
    const f = firstLabel(a);
    const L = f ? f.L : { t: '', swap: false, opts: [] };
    fn(L);
    const code = D.labelCode(L);
    // a label with no text is dropped whole: an empty "" with a side or a place sets nothing
    if (f) { if (!L.t.trim()) a.items.splice(f.i, 1); else a.items[f.i] = code; } else if (L.t.trim()) a.items.push(code);
  }
  function editLabel(w) {
    const a = arrowOf(w);
    if (!a || !TD.input) return false;
    const cell = at(w[0], w[1]);
    closePop();
    begin();
    const f = firstLabel(a);
    const me = (Pop = { w });
    me.pop = TD.input.popup(stage, {
      text: f ? f.L.t : '', math: true, bare: true,
      at: () => {
        const G = E.G || (E.G = geom()), v = E.view, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
        const ar = G.L.arrows.find((x) => x.src.join() === w.join());
        const p = ar ? D.at(ar.seg, 0.5) : { x: G.cx(w[1]), y: G.cy(w[0]) };
        return [vr.left - sr.left + v.ox + p.x * v.k, vr.top - sr.top + v.oy + p.y * v.k + 14];
      },
      onInput: (v) => { setLabel(a, (L) => { L.t = v; }); touch(cell); draw(); renderProps(); },
      onDone: () => { if (Pop === me) Pop = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function closePop() { if (Pop) Pop.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div>`);
  const seg = (f, cur, opts, off) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-cs="${f}" data-v="${esc(String(v))}" class="${String(cur) === String(v) ? 'on' : ''}"${off ? ' disabled title="Add a label first"' : t ? ` title="${esc(t)}"` : ''}>${n}</button>`).join('')}</div>`;
  const nameOf = (x) => Z.styleOf(x).name;
  const find = (a, re) => a.items.find((x) => re.test(nameOf(x)));
  function setItem(a, re, item) { a.items = a.items.filter((x) => !re.test(nameOf(x))); if (item) a.items.push(item); }
  // ---- colours: kept in the code as written (a name, a mix, rgb,255:…); a pick writes xcolor's name or rgb,255 expression
  const isLabelCol = (o) => { const c = D.colorOpt(o); return !!c && c.key !== 'draw'; };
  // the arrow's own colour (its line; with color= or a name, its labels too): { key, spec, i } or null
  function arrowColor(a) { let r = null; a.items.forEach((x, i) => { if (D.label(x)) return; const o = D.colorOpt(x); if (o && o.key !== 'text') r = { ...o, i }; }); return r; }
  function setArrowColor(a, spec) {
    const old = arrowColor(a);
    const rest = a.items.filter((x) => { if (D.label(x)) return true; const o = D.colorOpt(x); return !o || o.key === 'text'; });
    if (spec) {
      // the key the code used stays (quiver's draw= colours the line only); new ones: tikz-cd's colour, xy's @[…] (a line colour)
      const key = old ? old.key : E.X ? 'draw' : 'color';
      const it = D.colorItem(spec, key || 'color');
      rest.splice(old ? Math.min(old.i, rest.length) : rest.length, 0, it);
    }
    a.items = rest;
  }
  // a label's colour: its options' (text=, color=, a name) or a \textcolor round its text
  function labelColor(a) {
    const f = firstLabel(a);
    if (!f) return null;
    const o = f.L.opts.filter(isLabelCol).pop();
    return o ? D.colorOpt(o).spec : D.splitColor(f.L.t).spec;
  }
  function setLabelColor(a, spec) {
    setLabel(a, (L) => {
      const w = D.splitColor(L.t), had = L.opts.some(isLabelCol);
      L.opts = L.opts.filter((o) => !isLabelCol(o));
      if (w.spec && !had) L.t = D.joinColor(spec, w.body);
      else if (spec) L.opts.push(D.colorItem(spec));
    });
  }
  // an object's colour: |[red]| (tikz-cd) or \textcolor{red}{…} round it (written for xymatrix, and kept where the code has it)
  const objColor = (cell) => { const n = D.nodeColor(cell.node); return n ? n.spec : D.splitColor(cell.t).spec; };
  function setObjColor(cell, spec) {
    const w = D.splitColor(cell.t), n = D.nodeColor(cell.node);
    if (E.X || (w.spec && !n) || (!spec && !n)) cell.t = D.joinColor(spec, w.body);
    if (!E.X && (n || (spec && !w.spec))) {
      const l = Z.opts(cell.node || '').list.filter((x) => { const c = D.colorOpt(x); return !c || c.key === 'draw'; });
      if (spec) l.push(D.colorItem(spec));
      cell.node = l.length ? l.join(', ') : null;
    }
    touch(cell);
  }
  const colLabel = (spec) => (!spec ? 'Default' : spec.replace(/^rgb,\s*255\s*:\s*red,\s*(\d+);\s*green,\s*(\d+);\s*blue,\s*(\d+)$/, 'RGB $1, $2, $3'));
  const swatchCss = (spec) => { const h = spec && TD.tikzColor(spec); return h ? TD.fillCss(h) : 'transparent'; };
  const colorRow = (label, k, spec, off) => row(label, `<div class="ctl"><button type="button" class="cbtn${spec ? '' : ' none'}" data-cc="${k}"${off ? ` disabled title="${esc(off)}"` : ` title="${esc(spec || 'Default colour')}"`}><span style="background:${swatchCss(spec)}"></span></button><span class="cval">${esc(colLabel(spec))}</span></div>`);
  function openColor(btn) {
    const k = btn.dataset.cc, s = single();
    const a = k !== 'obj' && E.arrow ? arrowOf(E.arrow) : null, cell = k === 'obj' ? s && at(s.r1, s.c1) : E.arrow && at(E.arrow[0], E.arrow[1]);
    if (!cell || (k !== 'obj' && !a)) return;
    const get = () => (k === 'obj' ? objColor(cell) : k === 'label' ? labelColor(a) : (arrowColor(a) || {}).spec || null);
    let started = false;
    const set = (v) => {
      const spec = v ? D.colorSpec(v) : null;
      if (v && !spec) return;
      if (!started) { begin(); started = true; }
      if (k === 'obj') setObjColor(cell, spec);
      else { if (k === 'label') setLabelColor(a, spec); else setArrowColor(a, spec); touch(cell); }
      btn.classList.toggle('none', !spec);
      btn.querySelector('span').style.background = swatchCss(spec);
      const cv = btn.parentElement.querySelector('.cval');
      if (cv) cv.textContent = colLabel(spec);
      draw();
    };
    const cur = get();
    TD.openColorPicker(btn, { value: (cur && TD.tikzColor(cur)) || null, nullable: true, onInput: set, onChange: set, onClose() { commit(); renderProps(); } });
  }
  const POSN = [['near start', 'Start'], ['', 'Middle'], ['near end', 'End']];
  const POS_RE = /^(at start|very near start|near start|midway|near end|very near end|at end|pos)$/;
  // env options
  const envList = () => Z.opts(E.M.env || '').list;
  function envGet(name) { const it = envList().find((x) => Z.styleOf(x).name === name); return it ? Z.styleOf(it).arg || '' : null; }
  function envSet(name, v) {
    const l = envList().filter((x) => Z.styleOf(x).name !== name);
    if (v) l.push(`${name}=${v}`);
    E.M.env = l.join(', ');
  }
  function sepRow(label, name) {
    const v = envGet(name) || envGet('sep') || '';
    const opts = E.X ? XY_SEPS : SEP_OPTS;
    const known = opts.some(([k]) => k === v) || v === 'normal';
    return row(label, `<div class="ctl"><select data-f="${name}">${opts.map(([k, n]) => `<option value="${k}"${(v === 'normal' ? '' : v) === k ? ' selected' : ''}>${n}</option>`).join('')}${known ? '' : `<option value="${esc(v)}" selected>${esc(v)}</option>`}</select></div>`);
  }
  function renderProps() {
    if (!E) return;
    const M = E.M;
    if (E.arrow) {
      const a = arrowOf(E.arrow);
      if (!a) { E.arrow = null; renderProps(); return; }
      const [dr, dc] = delta(a.dirs), f = firstLabel(a), L = f ? f.L : { t: '', swap: false, opts: [] };
      const side = L.opts.includes('description') || a.items.includes('description') ? 'on' : L.swap ? 'right' : 'left';
      const p = L.opts.find((x) => POS_RE.test(Z.styleOf(x).name)) || '';
      const bend = find(a, /^bend (left|right)$/), shift = find(a, /^shift (left|right)$/);
      const bendSide = bend ? nameOf(bend).slice(5) : '', bendA = bend ? Z.styleOf(bend).arg || '30' : '30';
      const shiftSide = shift ? nameOf(shift).slice(6) : '';
      const sk = headKey(a.items), lk = lineOf(a.items), noLabel = !L.t;
      const pics = HEAD_STYLES.map(([k, n, o]) => `<button class="ze-shape${sk === k ? ' on' : ''}" data-cs="style" data-v="${esc(k)}" title="${esc(n)}">${styleMini(o)}</button>`).join('');
      TD.morph(props, `<div class="sec"><div class="sec-title">Arrow <small>row ${E.arrow[0] + 1}, col ${E.arrow[1] + 1} → row ${E.arrow[0] + dr + 1}, col ${E.arrow[1] + dc + 1}</small></div>
        ${field('Label', 'label', D.splitColor(L.t).body, ' data-tx="math" placeholder="none"')}
        ${colorRow('Colour', 'arrow', (arrowColor(a) || {}).spec || null)}
        ${colorRow('Label colour', 'label', labelColor(a), noLabel && 'Add a label first')}
        ${row('Side', seg('side', side, [['left', 'Left'], ['right', 'Right', "Swapped (')"], ['on', 'On line', 'description']], noLabel))}
        ${row('At', seg('pos', p, POSN, noLabel))}
        <div class="ze-shapes">${pics}</div>
        ${row('Line', seg('line', lk, [['', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['squiggly', 'Squiggly']]))}
        ${E.X ? '' : row('Crossing', seg('cross', find(a, /^crossing over$/) ? '1' : '', [['', 'None'], ['1', 'Gap', 'crossing over: a gap where it crosses another arrow']]))}
        ${row('Bend', seg('bend', bendSide, [['', 'None'], ['left', 'Left'], ['right', 'Right']]))}
        ${bendSide && !E.X ? row('Angle', `<div class="ctl unit"><input type="number" data-f="bendA" value="${esc(bendA)}" min="0" max="90" step="5"><span>°</span></div>`) : ''}
        ${row('Shift', seg('shift', shiftSide, [['', 'None'], ['left', 'Left', 'shift left: for parallel arrows'], ['right', 'Right', 'shift right']]))}
        ${E.X ? '' : field('Options', 'items', a.items.join(', '), ' class="mono"')}
        <div class="row"><button data-ce="reverse">Reverse</button><button class="danger" data-ce="arrowdel">Delete Arrow</button></div></div>`);
      sizeMinis(props, 48, 26, 2);
      return;
    }
    const b = selBox();
    if (!b) {
      TD.morph(props, `<div class="sec"><div class="sec-title">Diagram <small>${nR(M)} × ${nC(M)}</small></div>
        ${sepRow('Row sep', 'row sep')}
        ${sepRow('Column sep', 'column sep')}
        ${E.X ? '' : field('Options', 'env', M.env, ' class="mono" placeholder="e.g. row sep=large"')}
        <div class="help">Type in a cell to write its object. Drag a cell's blue handle to another cell to draw an arrow; click an arrow to label and style it. <kbd>Enter</kbd> edits, <kbd>⌫</kbd> clears.</div></div>`);
      return;
    }
    if (!single()) {
      const n = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
      TD.morph(props, `<div class="sec"><div class="sec-title">${n} cells</div><div class="help">Rows ${b.r1 + 1}–${b.r2 + 1}, columns ${b.c1 + 1}–${b.c2 + 1}. Right-click for rows and columns.</div></div>`);
      return;
    }
    const cell = at(b.r1, b.c1);
    let h = `<div class="sec"><div class="sec-title">${cell.t ? 'Object' : 'Empty cell'} <small>row ${b.r1 + 1} · column ${b.c1 + 1}</small></div>`;
    h += field('Object', 't', D.splitColor(cell.t).body, ' data-tx="math" placeholder="empty"');
    h += colorRow('Colour', 'obj', objColor(cell), !cell.t && 'Type an object first');
    h += '</div>';
    if (cell.arrows.length) {
      h += `<div class="sec"><div class="sec-title">Arrows from here</div><div class="ze-wires">${cell.arrows.map((a, i) => {
        const [dr, dc] = delta(a.dirs);
        return `<button data-ce="pickarrow" data-i="${i}"><span>→ row ${b.r1 + dr + 1}, col ${b.c1 + dc + 1}</span><code>${esc(E.X ? E.X.arrowXy(a) : arrowCode(a))}</code></button>`;
      }).join('')}</div></div>`;
    }
    h += `<div class="sec">${field('Code', 'code', E.X ? E.X.cellFromCd(cellText(cell)) : cellText(cell), ' class="mono"')}</div>`;
    TD.morph(props, h);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    if (f === 'env') { E.M.env = t.value; draw(); return; }
    if (f === 'row sep' || f === 'column sep') {
      const other = f === 'row sep' ? 'column sep' : 'row sep', both = envGet('sep');
      if (both != null) { envSet('sep', ''); if (envGet(other) == null) envSet(other, both); }
      envSet(f, t.value); commit(); begin(); draw(); return;
    }
    if (E.arrow) {
      const cell = at(E.arrow[0], E.arrow[1]), a = arrowOf(E.arrow);
      if (!a) return;
      if (f === 'items') { const l = Z.opts(t.value).list; const d = l.findIndex((x) => /^[rlud]+$/.test(x)); if (d >= 0) l.splice(d, 1); a.items = l; }
      else if (f === 'label') setLabel(a, (L) => { L.t = D.joinColor(D.splitColor(L.t).spec, t.value); });
      else if (f === 'bendA') { const bnd = find(a, /^bend (left|right)$/); if (bnd) setItem(a, /^bend (left|right)$/, `${nameOf(bnd)}=${Math.max(0, parseFloat(t.value) || 0)}`); }
      touch(cell); draw();
      return;
    }
    const s = single();
    if (!s) return;
    const cell = at(s.r1, s.c1);
    if (f === 'code') { const v = E.X ? E.X.cellToCd(t.value) : t.value; Object.assign(cell, parseCell(v, cell.sep)); cell.text = v.trim(); }
    else if (f === 't') { cell.t = D.joinColor(D.splitColor(cell.t).spec, t.value); touch(cell); }
    draw();
  });
  // the panel follows each keystroke: the other fields show what this one changed (TD.morph keeps this one as typed)
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (e) => {
    const cc = e.target.closest('[data-cc]');
    if (cc && E && !cc.disabled) { openColor(cc); return; }
    const bt = e.target.closest('[data-cs]');
    if (!bt || !E || !E.arrow) return;
    const f = bt.dataset.cs, v = bt.dataset.v;
    const cell = at(E.arrow[0], E.arrow[1]), a = arrowOf(E.arrow);
    if (!a) return;
    edit(() => {
      if (f === 'style') applyStyle(a, v);
      else if (f === 'line') setItem(a, /^(dashed|dotted|squiggly)$/, v);
      else if (f === 'side') {
        a.items = a.items.filter((x) => x !== 'description');
        setLabel(a, (L) => { L.opts = L.opts.filter((x) => x !== 'description'); L.swap = v === 'right'; if (v === 'on') L.opts.push('description'); });
      } else if (f === 'pos') setLabel(a, (L) => { L.opts = L.opts.filter((x) => !POS_RE.test(Z.styleOf(x).name)); if (v) L.opts.push(v); });
      else if (f === 'cross') setItem(a, /^crossing over$/, v === '1' ? 'crossing over' : '');
      else if (f === 'bend') { const old = find(a, /^bend (left|right)$/), ang = old && Z.styleOf(old).arg; setItem(a, /^bend (left|right)$/, v ? `bend ${v}${ang ? `=${ang}` : ''}` : ''); }
      else if (f === 'shift') setItem(a, /^shift (left|right)$/, v ? `shift ${v}` : '');
      touch(cell);
    });
    if (f === 'style') buildPalette();
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ce="undo"]', root).disabled = !E.undo.length;
    $('[data-ce="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ce]');
    if (!b || !E) return;
    act(b.dataset.ce, b);
  });
  function act(a, b) {
    const s = selBox(), M = E.M;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'arrowdel') { if (E.arrow) deleteArrow(E.arrow); }
    else if (a === 'reverse') { if (E.arrow) reverseArrow(E.arrow); }
    else if (a === 'label') { if (E.arrow) editLabel(E.arrow); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    else if (a === 'addrow') edit(() => ensure(M, nR(M) + 1, Math.max(nC(M), 1)));
    else if (a === 'addcol') edit(() => ensure(M, Math.max(nR(M), 1), nC(M) + 1));
    else if (a === 'pickarrow' && single()) { selectArrow([single().r1, single().c1, +b.dataset.i]); draw(); renderProps(); buildPalette(); }
    else if (!s) return;
    else if (a === 'cell') editCell(s.r1, s.c1);
    else if (a === 'rowabove') { edit(() => insertRow(M, s.r1)); selectCell(s.r1, s.c1); draw(); renderProps(); }
    else if (a === 'rowbelow') { edit(() => insertRow(M, s.r2 + 1)); selectCell(s.r2 + 1, s.c1); draw(); renderProps(); }
    else if (a === 'rowdel') edit(() => { deleteRows(M, s.r1, s.r2); if (!nR(M)) E.sel = null; });
    else if (a === 'colbefore') { edit(() => insertCol(M, s.c1)); selectCell(s.r1, s.c1); draw(); renderProps(); }
    else if (a === 'colafter') { edit(() => insertCol(M, s.c2 + 1)); selectCell(s.r1, s.c2 + 1); draw(); renderProps(); }
    else if (a === 'coldel') edit(() => { deleteCols(M, s.c1, s.c2); if (!nC(M)) E.sel = null; });
  }
  function syncCode() {
    const R = nR(E.M), C = nC(E.M);
    count.textContent = `${R} row${R === 1 ? '' : 's'} · ${C} column${C === 1 ? '' : 's'}`;
    if (document.activeElement === codeTa) return;
    const c = out();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    codeMsg.innerHTML = layoutOf(c).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(E.X ? E.X.toCd(codeTa.value) : codeTa.value); E.codeAt = codeTa.value;
    clampSel(); draw(); keepInView(); renderProps();
    codeMsg.innerHTML = layoutOf(codeTa.value).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    if (document.querySelector('.cp[style*="display: block"]')) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); TD.closeColorPicker(); } return; } // the colour picker's keys
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel || E.arrow) { E.sel = null; E.arrow = null; draw(); renderProps(); buildPalette(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    const b = selBox();
    if (mod && e.key === 'a') { e.preventDefault(); if (nR(E.M) && nC(E.M)) { E.sel = { r1: 0, c1: 0, r2: nR(E.M) - 1, c2: nC(E.M) - 1 }; E.arrow = null; draw(); renderProps(); } return; }
    if (mod && (e.key === 'c' || e.key === 'x') && b) {
      e.preventDefault();
      E.clip = [];
      for (let r = b.r1; r <= b.r2; r++) { const rw = []; for (let c = b.c1; c <= b.c2; c++) rw.push(JSON.parse(JSON.stringify(at(r, c)))); E.clip.push(rw); }
      if (e.key === 'x') clearCells(b);
      return;
    }
    if (mod && e.key === 'v' && b && E.clip) {
      e.preventDefault();
      edit(() => { ensure(E.M, b.r1 + E.clip.length, b.c1 + E.clip[0].length); E.clip.forEach((rw, i) => rw.forEach((cell, j) => { const t = JSON.parse(JSON.stringify(cell)); t.sep = at(b.r1 + i, b.c1 + j).sep; E.M.rows[b.r1 + i].cells[b.c1 + j] = t; })); });
      E.sel = { r1: b.r1, c1: b.c1, r2: b.r1 + E.clip.length - 1, c2: b.c1 + E.clip[0].length - 1 }; draw(); renderProps();
      return;
    }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ' && !single()) { e.preventDefault(); E.space = true; return; }
    const s = single();
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      if (E.arrow) editLabel(E.arrow); else if (s) editCell(s.r1, s.c1);
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const R = nR(E.M), C = nC(E.M);
      if (!R || !C) return;
      const cur = E.sel || (E.arrow ? { r1: E.arrow[0], c1: E.arrow[1], r2: E.arrow[0], c2: E.arrow[1] } : { r1: 0, c1: 0, r2: 0, c2: 0 });
      const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const f = (v, n) => Math.max(0, Math.min(n - 1, v));
      if (e.shiftKey && E.sel) E.sel = { ...cur, r2: f(cur.r2 + dr, R), c2: f(cur.c2 + dc, C) };
      else selectCell(f(cur.r2 + dr, R), f(cur.c2 + dc, C));
      draw(); renderProps(); buildPalette(); return;
    }
    if (e.key === '0' && !s) { fit(); return; }
    // typing on a cell writes its object
    if (s && e.key.length === 1 && !e.altKey) { e.preventDefault(); editCell(s.r1, s.c1, e.key); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  function save() {
    closePop();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = out();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.js, beforeunload)
  TD.unsaved.push(() => !!E && out() !== E.start);
  async function finish(ok) {
    if (!E) return;
    closePop();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = out(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this diagram?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done, X) {
    const M = load(X ? X.toCd(block.src) : block.src);
    const lang = X ? 'xymatrix' : 'tikz-cd';
    $('#cdTitle', root).textContent = X ? 'XyMatrix' : 'Commutative diagram';
    $('.cz-code-head span', root).textContent = lang;
    $('[data-ce="copy"]', root).title = `Copy the ${lang} code`;
    codeTa.setAttribute('aria-label', `${lang} code`);
    E = { X: X || null, M, sel: null, arrow: null, arm: null, style: 'to', view: { ox: 0, oy: 0, k: 4 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null, clip: null, G: null };
    E.start = out();
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    requestAnimationFrame(fit);
  }
  TD.cdEditor = { open };
})();
