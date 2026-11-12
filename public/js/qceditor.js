// Quantum circuit editor: the overlay that opens on a Quantum block. A palette of quantikz elements,
// the circuit drawn by the canvas renderer over a grid of cells (wires × steps) where elements are
// dropped, moved and linked, the selected cell's properties, and beside them the quantikz code, live
// both ways. Only the cells that change are rewritten, so hand-written code keeps its form.
// TD.qcEditor.open(block, onDone) — block: { src, size, font }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, Q = TD.qc;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';

  // Delete gutters, shared by the grid editors (Quantum, ZX, CD): a strip left of the rows and one above the
  // columns. Pointing at a row (column) there shows its bin and marks the whole line; a click deletes it.
  // While the pointer is in a row or column (a cell or the gutter beside it), that line's bin shows faintly.
  // g: { sx, sy, R, C, left, top } in stage px — sx / sy are the cell edges, left / top the paper's edges.
  const GUT = 22;
  TD.gridDel = {
    at(g, x, y) {
      if (!g || !g.R || !g.C) return null;
      // only the round button itself (radius 9) counts, not the gutter around it
      const rx = g.left - GUT / 2 - 2, cy = g.top - GUT / 2 - 2, R2 = 10 * 10;
      for (let i = 0; i < g.R; i++) { const y0 = (g.sy[i] + g.sy[i + 1]) / 2; if ((x - rx) ** 2 + (y - y0) ** 2 <= R2) return { kind: 'row', i }; }
      for (let i = 0; i < g.C; i++) { const x0 = (g.sx[i] + g.sx[i + 1]) / 2; if ((x - x0) ** 2 + (y - cy) ** 2 <= R2) return { kind: 'col', i }; }
      return null;
    },
    // the row and column the pointer is in, counting the gutters: their bins show faintly while it is there
    near(g, x, y) {
      if (!g || !g.R || !g.C) return null;
      const { sx, sy, R, C } = g, band = (v, e, n) => { for (let i = 0; i < n; i++) if (v >= e[i] && v < e[i + 1]) return i; return -1; };
      const r = x >= g.left - GUT - 4 && x <= sx[C] ? band(y, sy, R) : -1, c = y >= g.top - GUT - 4 && y <= sy[R] ? band(x, sx, C) : -1;
      return r < 0 && c < 0 ? null : { r, c };
    },
    svg(g, del, hover, names) {
      if (!g || !g.R || !g.C) return '';
      const { sx, sy, R, C } = g, rx = r2(g.left - GUT / 2 - 2), cy = r2(g.top - GUT / 2 - 2);
      const bin = (x, y, on, title) => `<g class="qe-del${on ? ' on' : ''}" transform="translate(${x},${y})"><title>${title}</title><circle r="9"/><svg x="-6" y="-6" width="12" height="12" viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/></svg></g>`;
      const row = (i, on) => bin(rx, r2((sy[i] + sy[i + 1]) / 2), on, `Delete ${names[0]} ${i + 1}`);
      const col = (i, on) => bin(r2((sx[i] + sx[i + 1]) / 2), cy, on, `Delete ${names[1]} ${i + 1}`);
      if (del) {
        const band = del.kind === 'row'
          ? `<rect class="qe-delband" x="${r2(sx[0])}" y="${r2(sy[del.i])}" width="${r2(sx[C] - sx[0])}" height="${r2(sy[del.i + 1] - sy[del.i])}"/>`
          : `<rect class="qe-delband" x="${r2(sx[del.i])}" y="${r2(sy[0])}" width="${r2(sx[del.i + 1] - sx[del.i])}" height="${r2(sy[R] - sy[0])}"/>`;
        return band + (del.kind === 'row' ? row(del.i, true) : col(del.i, true));
      }
      if (!hover) return '';
      return (hover.r >= 0 && hover.r < R ? row(hover.r, false) : '') + (hover.c >= 0 && hover.c < C ? col(hover.c, false) : '');
    },
  };

  // ---------------------------------------------------------------- elements
  // main: one per cell (dropping another replaces it); extras (slices, groups, wire types) stack on it.
  const MAIN = new Set(['gate', 'meter', 'metercw', 'meterD', 'inputD', 'measuretab', 'measure', 'ctrl', 'octrl', 'control', 'ocontrol', 'targ', 'targX', 'swap', 'phase', 'push', 'midstick', 'lstick', 'rstick', 'ground', 'trash', 'qwbundle', 'permute', 'makeebit', 'phantomgate', 'hphantomgate', 'linethrough']);
  const LINKS = new Set(['ctrl', 'octrl', 'swap', 'vqw', 'vcw', 'cwbend']); // {n}: a line to the wire n below
  const SPANS = new Set(['gate', 'meter', 'lstick', 'rstick', 'midstick']); // [wires=n] / [n]
  const NAMES = {
    gate: 'Gate', meter: 'Meter', meterD: 'Measurement (D)', measuretab: 'Measurement tab', measure: 'Measurement', ctrl: 'Control', octrl: 'Open control',
    control: 'Control (no line)', ocontrol: 'Open control (no line)', targ: 'Target', targX: 'Swap end', swap: 'Swap', phase: 'Phase', push: 'Text', midstick: 'Middle label',
    lstick: 'Input label', rstick: 'Output label', ground: 'Ground', qwbundle: 'Bundle', slice: 'Slice', gategroup: 'Group', setwiretype: 'Wire type',
    metercw: 'Meter to classical', inputD: 'Input (D)', trash: 'Discard', permute: 'Permutation', makeebit: 'Entangled pair', phantomgate: 'Space', hphantomgate: 'Space',
    linethrough: 'Line through', ghost: 'Height of', gateinput: 'Gate input', gateoutput: 'Gate output', wave: 'Wave', wireoverride: 'Wire override',
  };
  // palette: [key, name, cells: [[row offset, code]], shortcut]
  const PAL = [
    ['Gates', [
      ['h', 'Hadamard', [[0, '\\gate{H}']], 'H'], ['x', 'Pauli X', [[0, '\\gate{X}']], 'X'], ['y', 'Pauli Y', [[0, '\\gate{Y}']], 'Y'], ['z', 'Pauli Z', [[0, '\\gate{Z}']], 'Z'],
      ['s', 'S', [[0, '\\gate{S}']], 'S'], ['t', 'T', [[0, '\\gate{T}']], 'T'], ['sd', 'S†', [[0, '\\gate{S^\\dagger}']]], ['td', 'T†', [[0, '\\gate{T^\\dagger}']]],
      ['sx', '√X', [[0, '\\gate{\\sqrt{X}}']]], ['rx', 'Rx(θ)', [[0, '\\gate{R_x(\\theta)}']]], ['ry', 'Ry(θ)', [[0, '\\gate{R_y(\\theta)}']]], ['rz', 'Rz(θ)', [[0, '\\gate{R_z(\\theta)}']]],
      ['u', 'Gate U', [[0, '\\gate{U}']], 'U'], ['u2', 'Two-wire gate', [[0, '\\gate[2]{U}'], [1, '']]],
      ['swapg', 'Swap gate', [[0, '\\gate[2,swap]{}'], [1, '']]], ['perm', 'Permutation', [[0, '\\permute{2,1}'], [1, '']]],
    ]],
    ['Controls', [
      ['cnot', 'CNOT', [[0, '\\ctrl{1}'], [1, '\\targ{}']]], ['cz', 'Controlled Z', [[0, '\\ctrl{1}'], [1, '\\control{}']]], ['cu', 'Controlled U', [[0, '\\ctrl{1}'], [1, '\\gate{U}']]], ['swap2', 'SWAP', [[0, '\\swap{1}'], [1, '\\targX{}']]],
      ['toff', 'Toffoli', [[0, '\\ctrl{2}'], [1, '\\ctrl{1}'], [2, '\\targ{}']]], ['ctrl', 'Control', [[0, '\\ctrl{}']], 'C'], ['octrl', 'Open control', [[0, '\\octrl{}']], 'O'],
      ['targ', 'Target', [[0, '\\targ{}']], '+'], ['swap', 'Swap', [[0, '\\swap{}']]], ['targX', 'Swap end', [[0, '\\targX{}']]], ['phase', 'Phase', [[0, '\\phase{\\alpha}']]],
    ]],
    ['Measure', [
      ['meter', 'Meter', [[0, '\\meter{}']], 'M'], ['meterD', 'Measurement (D)', [[0, '\\meterD{\\ket{0}}']]], ['mtab', 'Measurement tab', [[0, '\\measuretab{0}']]], ['ground', 'Ground', [[0, '\\ground{}']]],
      ['metercw', 'Meter to classical', [[0, '\\metercw{}']]], ['measure', 'Measurement', [[0, '\\measure{x}']]], ['trash', 'Discard', [[0, '\\trash{}']]],
    ]],
    ['Labels', [
      ['ket0', 'Input |0⟩', [[0, '\\lstick{\\ket{0}}']]], ['lstick', 'Input label', [[0, '\\lstick{\\ket{\\psi}}']]], ['rstick', 'Output label', [[0, '\\rstick{\\ket{\\psi}}']]],
      ['mid', 'Middle label', [[0, '\\midstick{\\ket{0}}']]], ['push', 'Text', [[0, '\\push{a}']]],
      ['inputD', 'Input (D)', [[0, '\\inputD{0}']], null, '\\inputD{0} & &'], ['ebit', 'Entangled pair', [[0, '\\makeebit{}'], [1, '']], null, '\\makeebit{} & & \\\\ & &'],
    ]],
    ['Wires', [
      ['wc', 'Classical from here', [[0, '\\setwiretype{c}']], null, '& & \\setwiretype{c} & &'], ['wq', 'Quantum from here', [[0, '\\setwiretype{q}']], null, '\\setwiretype{c} & & \\setwiretype{q} & &'], ['wn', 'No wire from here', [[0, '\\setwiretype{n}']], null, '& & \\setwiretype{n} & &'],
      ['bundle', 'Bundle', [[0, '\\qwbundle{n}']]], ['vqw', 'Wire down', [[0, '\\vqw{1}']], null, '& \\gate{U} \\vqw{1} & \\\\ & \\gate{V} &'], ['vcw', 'Classical wire down', [[0, '\\vcw{1}']], null, '& \\meter{} \\vcw{1} & \\\\ & \\gate{V} &'],
      ['wave', 'Wave', [[0, '\\wave']], null, '\\wave & & &'],
    ]],
    ['Annotations', [
      ['slice', 'Slice', [[0, '\\slice{}']]], ['group', 'Group', [[0, '\\gategroup[2,steps=2,style={dashed,rounded corners}]{}']]],
      ['glabel', 'Label above', [[0, '\\gategroup[1,steps=1,style={draw=none}]{label}']], null, '& \\gate{U} \\gategroup[1,steps=1,style={draw=none}]{label} &'],
    ]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, cells, key, mini] of items) { ITEM[k] = { k, name, cells, key, mini }; if (key) KEYS[key.toLowerCase()] = k; }
  function miniSrc(it) {
    if (it.mini) return it.mini;
    const rows = Math.max(...it.cells.map((c) => c[0])) + 1, out = [];
    for (let r = 0; r < rows; r++) {
      const code = (it.cells.find((c) => c[0] === r) || [0, ''])[1];
      out.push(/\\lstick/.test(code) ? `${code} & &` : /\\rstick/.test(code) ? `& & ${code}` : `& ${code} &`);
    }
    return out.join(' \\\\ ');
  }

  // ---------------------------------------------------------------- model
  // rows of cells; a cell keeps its text and, unless it holds commands this editor doesn't know
  // (opaque), its items { name, o: [options], a: [arguments] }. dirty cells are written from items.
  function parseCell(text) {
    let unknown = false;
    const items = Q.cell(text, () => (unknown = true));
    return { text: text.trim(), items, opaque: unknown, dirty: false };
  }
  const emptyCell = () => ({ text: '', items: [], opaque: false, dirty: false });
  const itemCode = (it) => (it.plain ? it.a[0] : `\\${it.name}${it.o.map((o) => `[${o}]`).join('')}${it.a.map((a) => `{${a}}`).join('')}`);
  const cellText = (c) => (c.dirty ? c.items.map(itemCode).join(' ') : c.text);
  function load(src) {
    const t = String(src || '');
    const { env, inner } = Q.unwrap(t);
    const g = Q.grid(inner), C = Math.max(0, ...g.map((r) => r.length));
    const rows = g.map((r) => { const cells = r.map(parseCell); while (cells.length < C) cells.push(emptyCell()); return cells; });
    return { wrapped: /\\begin\{quantikz\}/.test(t), env, seps: (g.seps || []).slice(), rows };
  }
  const nR = (M) => M.rows.length, nC = (M) => (M.rows[0] ? M.rows[0].length : 0);
  // the code, with the & signs lined up
  function codeOf(M) {
    const C = nC(M), texts = M.rows.map((r) => r.map(cellText)), w = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...texts.map((r) => r[c].length));
    const lines = texts.map((r, i) => r.map((t, c) => (c < C - 1 ? t.padEnd(w[c]) : t)).join(' & ').replace(/\s+$/, '') + (i < texts.length - 1 ? ` \\\\${M.seps[i] || ''}` : ''));
    const body = lines.join('\n');
    return M.wrapped || !body ? `\\begin{quantikz}${M.env ? `[${M.env}]` : ''}\n${body}\n\\end{quantikz}` : body;
  }
  const mainOf = (c) => c.items.find((it) => MAIN.has(it.name));
  const setItems = (c, items) => { c.items = items; c.opaque = false; c.dirty = true; };
  const intArg = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  // [wires=n] in an option list: read / write (1 drops it)
  function spanOf(it) {
    if (!it.o.length) return 1;
    const o = Q.opts(it.o[0]);
    if (o.map.wires) return Math.max(1, intArg(o.map.wires));
    const bare = o.list.find((x) => /^\d+$/.test(x));
    return bare ? Math.max(1, +bare) : 1;
  }
  function setSpan(it, n) {
    const list = it.o.length ? Q.opts(it.o[0]).list.filter((x) => !/^\d+$/.test(x) && !/^wires\s*=/.test(x)) : [];
    if (n > 1) list.unshift(String(n));
    if (list.length) it.o[0] = list.join(', '); else if (it.o.length > 1) it.o[0] = ''; else it.o.splice(0, 1);
  }
  // \gate[…][min width][min height]{…}, in cm (0: none)
  const cmOf = (v) => { const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em)?\s*$/.exec(v || ''); if (!m) return 0; const n = +m[1]; if (m[2] === 'pt' && n <= 1.5) return 0; return m[2] === 'mm' ? n / 10 : m[2] === 'pt' ? n / 28.45 : m[2] === 'em' ? n * 0.35 : n; };
  function gateSize(it) { return { w: cmOf(it.o[1]), h: cmOf(it.o[2]) }; }
  function setGateSize(it, w, h) {
    const f = (v) => (v > 0 ? `${Math.round(v * 100) / 100}cm` : '');
    while (it.o.length < 3) it.o.push('');
    it.o[1] = f(w) || (h > 0 ? '1.5pt' : ''); it.o[2] = f(h);
    if (!it.o[2]) { it.o.length = 2; if (!it.o[1]) { it.o.length = 1; if (!it.o[0]) it.o.length = 0; } }
  }
  function groupDims(it) { const o = Q.opts(it.o[0] || ''); return { wires: Math.max(1, intArg(o.map.wires) || +(o.list.find((x) => /^\d+$/.test(x)) || 1)), steps: Math.max(1, intArg(o.map.steps) || 1) }; }
  function setGroupDims(it, wires, steps) {
    const list = Q.opts(it.o[0] || '').list.filter((x) => !/^\d+$/.test(x) && !/^(wires|steps)\s*=/.test(x));
    it.o[0] = [String(wires), `steps=${steps}`, ...list].join(',');
  }

  // Re-index after wires or steps are inserted / removed: rowMap / colMap give an old index's new
  // index (null: removed). Links and spans keep pointing at the same wires.
  function remap(M, rowMap, colMap, R2, C2) {
    const out = Array.from({ length: R2 }, () => Array.from({ length: C2 }, emptyCell));
    const R = nR(M), C = nC(M);
    const lastKept = (from, to, map, n) => { for (let i = Math.min(to, n - 1); i >= from; i--) if (map(i) != null) return i; return null; };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const r1 = rowMap(r), c1 = colMap(c);
      if (r1 == null || c1 == null) continue;
      const cell = M.rows[r][c];
      if (!cell.opaque) {
        let changed = false;
        for (const it of cell.items) {
          if (LINKS.has(it.name) && intArg(it.a[0])) {
            const t = rowMap(r + intArg(it.a[0])), n = t == null ? 0 : t - r1;
            if (n !== intArg(it.a[0])) { it.a[0] = n ? String(n) : ''; changed = true; }
          } else if (SPANS.has(it.name) && spanOf(it) > 1) {
            const last = lastKept(r, r + spanOf(it) - 1, rowMap, R), n = last == null ? 1 : rowMap(last) - r1 + 1;
            if (n !== spanOf(it)) { setSpan(it, n); changed = true; }
          } else if (it.name === 'slice' && (it.wr || sliceShort(it))) {
            const [a, b] = sliceWires(it), l = lastKept(a, b, rowMap, R);
            let f = a; while (f <= b && rowMap(f) == null) f++;
            if (l == null) delete it.wr; else it.wr = [rowMap(f), rowMap(l)];
          } else if (it.name === 'gategroup') {
            const d = groupDims(it), lr = lastKept(r, r + d.wires - 1, rowMap, R), lc = lastKept(c, c + d.steps - 1, colMap, C);
            const w = lr == null ? 1 : rowMap(lr) - r1 + 1, s = lc == null ? 1 : colMap(lc) - c1 + 1;
            if (w !== d.wires || s !== d.steps) { setGroupDims(it, w, s); changed = true; }
          }
        }
        if (changed) cell.dirty = true;
      }
      out[r1][c1] = cell;
    }
    const seps = [];
    for (let r = 0; r < R; r++) if (rowMap(r) != null && M.seps[r]) seps[rowMap(r)] = M.seps[r];
    M.rows = out; M.seps = seps;
  }
  function insertRow(M, at) { remap(M, (r) => (r >= at ? r + 1 : r), (c) => c, nR(M) + 1, Math.max(1, nC(M))); }
  function deleteRows(M, a, b) { remap(M, (r) => (r < a ? r : r > b ? r - (b - a + 1) : null), (c) => c, nR(M) - (b - a + 1), nC(M)); }
  function insertCol(M, at) { remap(M, (r) => r, (c) => (c >= at ? c + 1 : c), Math.max(1, nR(M)), nC(M) + 1); }
  // steps a..b trade places with the step beside them (d = -1: left, +1: right)
  function moveCols(M, a, b, d) {
    const o = d < 0 ? a - 1 : b + 1;
    remap(M, (r) => r, (c) => (c >= a && c <= b ? c + d : c === o ? (d < 0 ? b : a) : c), nR(M), nC(M));
  }
  function deleteCols(M, a, b) { remap(M, (r) => r, (c) => (c < a ? c : c > b ? c - (b - a + 1) : null), nR(M), nC(M) - (b - a + 1)); if (!nC(M)) M.rows = []; }
  function ensure(M, R, C) {
    while (nR(M) < R) M.rows.push(Array.from({ length: Math.max(nC(M), 1) }, emptyCell));
    while (nC(M) < C) for (const r of M.rows) r.push(emptyCell());
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'qcModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  // wires and steps as three blocks; the one an action makes or removes stands out, offset in its pen.
  // Insert: an accent block before (first) or after (last). Delete: the middle one, red, with a cross.
  // three-bar icons: outlined bars are the wires (or steps) that stay, the filled one is the one that is
  // inserted (offset to where it goes) or deleted (with a knocked-out ×); steps are the same, transposed
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
  const QI = {
    above: blocks(0, false, false), below: blocks(2, false, false), rowdel: blocks(0, true, false),
    before: blocks(0, false, true), after: blocks(2, false, true), coldel: blocks(0, true, true),
  };
  const qic = (k) => `<svg viewBox="0 0 20 20" class="qe-ic">${QI[k]}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="qcTitle">
    <div class="modal-head">
      <strong id="qcTitle">Quantum circuit</strong>
      <div class="cz-tools">
        <button class="icon flat" data-qe="addrow" title="Add a wire at the bottom">${qic('below')}</button>
        <button class="icon flat" data-qe="addcol" title="Add a step at the end">${qic('after')}</button>
        <button class="icon flat danger" data-qe="delete" title="Clear the selected cells (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-qe="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-qe="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-qe="fit" title="Fit the circuit in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-qe="cancel">Cancel</button>
      <button class="primary" data-qe="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search elements" aria-label="Search elements" spellcheck="false"></div>
        <div class="cz-list qe-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg qe-svg" aria-label="Quantum circuit"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>quantikz</span><small class="cz-count"></small><button class="flat" data-qe="copy" title="Copy the quantikz code">Copy</button></div>
          <textarea spellcheck="false" aria-label="quantikz code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.qe-svg', root), stage = $('.cz-stage', root), list = $('.qe-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: {r1, c1, r2, c2} | null, arm, view: {ox, oy, k}, undo, redo, pending, start, done, drag, hover, st, codeAt, codeTimer, clip }
  let E = null, lastDown = { t: 0, x: 0, y: 0 };
  const snap = () => codeOf(E.M);
  function begin() { if (E.pending == null) E.pending = snap(); }
  function commit() {
    if (E.pending == null) return;
    const now = snap();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  // one edit: begin, change, commit, redraw
  function edit(fn) { begin(); fn(); commit(); clampSel(); draw(); keepInView(); renderProps(); }
  // while the view is fitted (on open, or after Fit / 0), every edit fits the circuit again; once the user pans
  // or zooms, the camera stays where they put it until Fit is pressed again
  function keepInView() { if (E.G && E.fitted) fit(); }
  function restore(code) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snap()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snap()); restore(E.redo.pop()); }
  const at = (r, c) => (E.M.rows[r] && E.M.rows[r][c]) || null;
  function clampSel() {
    const s = E.sel;
    if (!s) return;
    const R = nR(E.M), C = nC(E.M);
    if (!R || !C) { E.sel = null; return; }
    const f = (v, n) => Math.max(0, Math.min(n - 1, v));
    E.sel = { r1: f(s.r1, R), c1: f(s.c1, C), r2: f(s.r2, R), c2: f(s.c2, C) };
  }
  const selBox = () => { const s = E.sel; return s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }; };
  const single = () => { const b = selBox(); return b && b.r1 === b.r2 && b.c1 === b.c2 ? b : null; };
  // a gate over several wires: its own cell owns the cells under it, so a click there picks the gate
  const spanAt = (r, c) => { const x = at(r, c), m = x && !x.opaque && mainOf(x); return m && SPANS.has(m.name) ? spanOf(m) : 1; };
  function owner(r, c) {
    for (let rr = r - 1; rr >= 0; rr--) if (rr + spanAt(rr, c) - 1 >= r) return { r: rr, c };
    return { r, c };
  }
  // the box drawn round a selection: grown down to the last wire of any tall gate in it
  function shownBox(b) {
    let r2_ = b.r2;
    for (let c = b.c1; c <= b.c2; c++) for (let r = b.r1; r <= b.r2; r++) r2_ = Math.max(r2_, r + spanAt(r, c) - 1);
    return { ...b, r2: Math.min(r2_, nR(E.M) - 1) };
  }
  // a cell with nothing but its wire (\qw, \cw): free for a tall gate to cover
  const wireOnly = (x) => !x || (!x.opaque && x.items.every((it) => it.name === 'qw' || it.name === 'cw') && (x.items.length > 0 || !x.text.trim()));
  // the cells a tall gate covers hold nothing: their wire is under the gate
  function clearUnder(r, c) {
    const n = spanAt(r, c);
    for (let i = 1; i < n; i++) { const x = at(r + i, c); if (x && (x.text || x.items.length) && wireOnly(x)) Object.assign(x, emptyCell()); }
  }

  // ---------------------------------------------------------------- placing
  // put a palette element with its top cell at (r, c); returns false when nothing changed
  function place(key, r, c) {
    const it = ITEM[key], M = E.M;
    const rows = Math.max(...it.cells.map((x) => x[0])) + 1;
    ensure(M, r + rows, c + 1);
    for (const [dr, code] of it.cells) {
      const cell = M.rows[r + dr][c];
      if (!code) { if (mainOf(cell)) setItems(cell, cell.items.filter((x) => !MAIN.has(x.name))); continue; }
      const add = Q.cell(code, () => {});
      const base = cell.opaque ? [] : cell.items;
      if (add.some((x) => MAIN.has(x.name))) setItems(cell, [...add, ...base.filter((x) => !MAIN.has(x.name))]);
      else setItems(cell, [...base.filter((x) => !add.some((y) => y.name === x.name)), ...add]);
    }
    if (it.cells.length === 1) link(r, c);
    return true;
  }
  // a lone control finds the nearest element in its column; a new element picks up the column's lone controls
  function link(r, c) {
    const M = E.M, cell = M.rows[r][c], m = mainOf(cell);
    if (!m) return;
    const kinds = (x) => x && !['lstick', 'rstick', 'push', 'midstick', 'qwbundle', 'ground', 'trash', 'permute', 'makeebit', 'phantomgate', 'hphantomgate', 'linethrough', 'inputD'].includes(x.name);
    if ((m.name === 'ctrl' || m.name === 'octrl' || m.name === 'swap') && !intArg(m.a[0])) {
      let best = null;
      for (let i = 0; i < nR(M); i++) {
        if (i === r) continue;
        const o = mainOf(M.rows[i][c]);
        if (!kinds(o) || (m.name === 'swap' && o.name !== 'targX')) continue;
        if (best == null || Math.abs(i - r) < Math.abs(best - r)) best = i;
      }
      if (best != null) m.a[0] = String(best - r);
    } else if (kinds(m) && !LINKS.has(m.name)) {
      for (let i = 0; i < nR(M); i++) {
        const o = mainOf(M.rows[i][c]);
        if (i === r || !o || intArg(o.a[0])) continue;
        if (((o.name === 'ctrl' || o.name === 'octrl') && m.name !== 'targX') || (o.name === 'swap' && m.name === 'targX')) { o.a[0] = String(r - i); M.rows[i][c].dirty = true; }
      }
    }
  }
  // move (or copy) a cell's contents; within a column, links keep pointing at the same wires
  // the rows of column c tied to row r by vertical links (a swap and its end, a control and its target)
  function linkGroup(r, c) {
    const M = E.M, rows = new Set([r]), target = (i) => {
      const cell = M.rows[i] && M.rows[i][c];
      if (!cell || cell.opaque) return [];
      return cell.items.filter((it) => LINKS.has(it.name) && intArg(it.a[0])).map((it) => i + intArg(it.a[0]));
    };
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < nR(M); i++) {
        const ts = target(i).filter((t) => t >= 0 && t < nR(M));
        if (rows.has(i)) { for (const t of ts) if (!rows.has(t)) { rows.add(t); grew = true; } }
        else if (ts.some((t) => rows.has(t))) { rows.add(i); grew = true; }
      }
    }
    return [...rows].sort((a, b) => a - b);
  }
  function moveCell(r1, c1, r2, c2, copy) {
    const M = E.M;
    // into another step: a linked group (swap and its end, controls and their target) moves as one,
    // when the cells it lands on are free
    if (c1 !== c2) {
      const g = linkGroup(r1, c1), dr = r2 - r1;
      if (g.length > 1 && g[0] + dr >= 0) {
        ensure(M, g[g.length - 1] + dr + 1, c2 + 1);
        if (g.every((i) => wireOnly(M.rows[i + dr][c2]))) {
          for (const i of g) {
            M.rows[i + dr][c2] = JSON.parse(JSON.stringify(M.rows[i][c1]));
            if (!copy) M.rows[i][c1] = emptyCell();
          }
          return;
        }
      }
    }
    ensure(M, r2 + 1, c2 + 1);
    const src = M.rows[r1][c1], dst = M.rows[r2][c2];
    const moved = JSON.parse(JSON.stringify(src));
    const shift = (cell, from, to) => {
      if (cell.opaque || c1 !== c2) return;
      for (const it of cell.items) if (LINKS.has(it.name) && intArg(it.a[0])) { const n = intArg(it.a[0]) + from - to; it.a[0] = n ? String(n) : ''; cell.dirty = true; }
    };
    shift(moved, r1, r2);
    if (copy) { M.rows[r2][c2] = moved; return; }
    // swap places; the cell coming back is shifted too
    const back = JSON.parse(JSON.stringify(dst));
    shift(back, r2, r1);
    M.rows[r2][c2] = moved; M.rows[r1][c1] = back;
    // controls elsewhere in the column follow a moved target
    if (c1 === c2) for (let i = 0; i < nR(M); i++) {
      if (i === r1 || i === r2) continue;
      const cell = M.rows[i][c1];
      if (cell.opaque) continue;
      for (const it of cell.items) {
        if (!LINKS.has(it.name) || !intArg(it.a[0])) continue;
        const t = i + intArg(it.a[0]);
        if (t === r1 && mainOf(moved)) { it.a[0] = String(r2 - i); cell.dirty = true; }
        else if (t === r2 && mainOf(back)) { it.a[0] = String(r1 - i); cell.dirty = true; }
      }
    }
  }
  function clearSel() {
    const b = selBox();
    if (!b) return;
    edit(() => { for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = at(r, c); if (cell && (cell.text || cell.items.length)) setItems(cell, []); } });
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    for (const [title, items] of PAL) {
      const hits = items.filter((it) => !q || `${it[1]} ${it[2].map((c) => c[1]).join(' ')} ${title}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , key]) => `<button class="qe-item${E && E.arm === k ? ' on' : ''}" data-item="${k}" title="${esc(name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${TD.qcMini(miniSrc(ITEM[k]), 1e3, 'var(--qe-paper)')}</span><span>${esc(name)}</span></button>`).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    // one scale for every drawing, so wires and gates keep the same weight; wide ones shrink to fit
    for (const m of list.querySelectorAll('.qcmini')) {
      const [, , w, h] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(1.5, 64 / w, 44 / h);
      m.style.width = `${r2(w * k)}px`; m.style.height = `${r2(h * k)}px`;
    }
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) choose(b.dataset.item); search.blur(); }
  });
  // click: into the selected cell (then step right), or arm it for clicking cells; drag: drop on a cell
  let palDrag = null;
  list.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
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
    if (!d.moved) { choose(d.k); return; }
    const h = overStage(e) && cellAt(e);
    if (h) { edit(() => place(d.k, h.r, h.c)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; renderProps(); }
    E.hover = null; draw();
  });
  const GROUPING = new Set(['group', 'glabel']);
  function choose(k) {
    // Group / Label above with cells selected: one sized to the selection
    const b = selBox();
    if (GROUPING.has(k) && b && !E.arm && b.r2 < nR(E.M) && b.c2 < nC(E.M)) { addGroup(b, k === 'glabel'); return; }
    const s = single();
    if (s && !E.arm) { put(k, s.r1, s.c1, true); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? `${ITEM[k].name}: ${GROUPING.has(k) ? 'drag across the cells it should cover' : 'click a cell to place it'}. Esc when done.` : '');
  }
  function put(k, r, c, step) {
    edit(() => place(k, r, c));
    if (step) { ensure(E.M, r + 1, c + 2); E.sel = { r1: r, c1: c + 1, r2: r, c2: c + 1 }; }
    else E.sel = { r1: r, c1: c, r2: r, c2: c };
    draw(); renderProps();
  }
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  // The circuit in the renderer's px, cell edges halfway between columns / rows; one more step
  // and one more wire past the end take drops that grow the circuit.
  function geom() {
    const s = { type: 'qc', x: 0, y: 0, src: snap(), size: E.st.size, font: E.st.font, color: INK };
    const L = Q.layout(s), R = nR(E.M), C = nC(E.M);
    const pitch = 0.6 * TD.PX_PER_CM, xs = [], ys = [];
    // nothing yet: one start cell, a drop or click there makes the first wire and step
    if (!R || !C) {
      const z = 1.2 * TD.PX_PER_CM, ex = [0, z], ey = [0, z];
      return { s, L: { ...L, bb: { x: 0, y: 0, w: z, h: z } }, xs: ex, ys: ey, R: 0, C: 0, empty: true, cx: () => z / 2, cy: () => z / 2 };
    }
    if (L.R && L.C) {
      const g = L.geo, colR = (c) => g.colL[c] + g.colW[c], rowB = (r) => g.rowT[r] + g.rowH[r];
      for (let c = 0; c < L.C; c++) xs.push(c ? (colR(c - 1) + g.colL[c]) / 2 : g.colL[0] - g.cs / 2);
      xs.push(colR(L.C - 1) + g.cs / 2);
      for (let r = 0; r < L.R; r++) ys.push(r ? (rowB(r - 1) + g.rowT[r]) / 2 : g.rowT[0] - g.rs / 2);
      ys.push(rowB(L.R - 1) + g.rs / 2);
      xs[0] = Math.min(xs[0], L.bb.x - 4);
    } else { xs.push(0); ys.push(0); }
    while (xs.length < C + 1) xs.push(xs[xs.length - 1] + pitch);
    while (ys.length < R + 1) ys.push(ys[ys.length - 1] + pitch);
    xs.push(xs[xs.length - 1] + pitch); ys.push(ys[ys.length - 1] + pitch);
    const cx = (c) => (xs[c] + xs[c + 1]) / 2, cy = (r) => (L.R && L.geo && r < L.R ? L.geo.cy[r] : (ys[r] + ys[r + 1]) / 2);
    return { s, L, xs, ys, R, C, cx, cy };
  }
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toL = (e) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  // the cell under the pointer (r == R or c == C: the growing edge), or null
  // the cell a click picks: a covered cell gives the tall gate over it
  // is the pointer on the element drawn in this cell (its box, plus 6 screen px)? A drag from there moves the
  // element; a drag from the rest of the cell selects a range of cells. Gates use their drawn box (all their wires);
  // other elements a small square on the wire; sticks hang off the cell, so their whole cell counts.
  function onElement(e, h) {
    const cell = at(h.r, h.c), G = E.G;
    if (!cell || !G || G.empty) return false;
    if (cell.opaque) return true;
    const m = mainOf(cell);
    if (!m) return false;
    if (m.name === 'lstick' || m.name === 'rstick') return true;
    const [x, y] = toL(e), tol = 5 / E.view.k;
    const o = m.name === 'gate' && G.L.ops && G.L.ops.find((q) => q.gate && q.gate[0] === h.r && q.gate[1] === h.c);
    // half the drawn size, in cm: control dots are 0.12cm across, targets and swaps about 0.35cm, meters 2em × 1.5em
    const DOT = { ctrl: 0.1, octrl: 0.1, control: 0.1, ocontrol: 0.1, phase: 0.1, targ: 0.18, targX: 0.18, swap: 0.12, ground: 0.18, trash: 0.18 };
    const half = (DOT[m.name] || 0.3) * TD.PX_PER_CM;
    const b = o ? { x1: o.x, y1: o.y, x2: o.x + o.w, y2: o.y + o.h } : { x1: G.cx(h.c) - half, y1: G.cy(h.r) - half, x2: G.cx(h.c) + half, y2: G.cy(h.r) + half };
    return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
  }
  function pick(e) { const h = cellAt(e); return h && h.r < nR(E.M) && h.c < nC(E.M) ? owner(h.r, h.c) : h; }
  function cellAt(e) {
    const G = E.G || (E.G = geom()), [x, y] = toL(e);
    const find = (a, v) => { for (let i = 0; i < a.length - 1; i++) if (v >= a[i] && v < a[i + 1]) return i; return -1; };
    const c = find(G.xs, x), r = find(G.ys, y);
    if (c < 0 || r < 0 || (!G.empty && r === G.R && c === G.C)) return null;
    return { r, c };
  }
  function fit() {
    const G = geom(), r = rect();
    // the paper's edges, with room past them for the delete gutters
    const x1 = Math.min(G.xs[0], G.L.bb.x) - 16, x2 = Math.max(G.xs[G.xs.length - 1], G.L.bb.x + G.L.bb.w) + 10;
    const y1 = Math.min(G.ys[0], G.L.bb.y) - 24, y2 = Math.max(G.ys[G.ys.length - 1], G.L.bb.y + G.L.bb.h) + 10;
    const k = Math.max(0.6, Math.min(3, Math.min((r.width - 80) / (x2 - x1), (r.height - 80) / (y2 - y1))));
    E.view = { k, ox: r.width / 2 - ((x1 + x2) / 2) * k, oy: r.height / 2 - ((y1 + y2) / 2) * k };
    E.fitted = true;
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    E.fitted = false;
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(0.4, Math.min(6, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    E.G = geom();
    if (syncSlices()) E.G = geom();
    syncCode();
    const G = E.G, r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // emptied (every wire or step deleted): bring the start cell into the middle
    if (!!G.empty !== !!E.wasEmpty) { E.wasEmpty = G.empty; if (G.empty && r.width && E.fitted) { fit(); return; } }
    const X = (x) => r2(v.ox + x * k), Y = (y) => r2(v.oy + y * k);
    const { xs, ys, R, C } = G;
    // paper under the circuit, cell rules, then the circuit
    const px1 = Math.min(xs[0], G.L.bb.x) - 16, px2 = xs[xs.length - 1] + 8, py1 = Math.min(ys[0], G.L.bb.y) - 16, py2 = Math.max(ys[ys.length - 1], G.L.bb.y + G.L.bb.h) + 8;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><rect class="qe-paper" x="${X(px1)}" y="${Y(py1)}" width="${r2((px2 - px1) * k)}" height="${r2((py2 - py1) * k)}"/>`;
    let rules = '';
    if (!G.empty) for (let c = 0; c <= C; c++) rules += `M${X(xs[c])},${Y(ys[0])}V${Y(ys[R])}`;
    if (!G.empty) for (let i = 0; i <= R; i++) rules += `M${X(xs[0])},${Y(ys[i])}H${X(xs[C])}`;
    out += `<path class="qe-rule" d="${rules}"/>`;
    const plus = (x, y) => `<path class="qe-plus" d="M${X(x) - 5},${Y(y)}h10M${X(x)},${Y(y) - 5}v10"/>`;
    if (G.empty) {
      out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[0])}" width="${r2((xs[1] - xs[0]) * k)}" height="${r2((ys[1] - ys[0]) * k)}"/>` + plus((xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2);
    } else {
    // the growing edges: one more step, one more wire
    out += `<rect class="qe-grow" x="${X(xs[C])}" y="${Y(ys[0])}" width="${r2((xs[C + 1] - xs[C]) * k)}" height="${r2((ys[R] - ys[0]) * k)}"/>`;
    out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[R])}" width="${r2((xs[C] - xs[0]) * k)}" height="${r2((ys[R + 1] - ys[R]) * k)}"/>`;
    out += plus((xs[C] + xs[C + 1]) / 2, (ys[0] + ys[R]) / 2) + plus((xs[0] + xs[C]) / 2, (ys[R] + ys[R + 1]) / 2);
    }
    out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(k)})">${R && C ? Q.draw({ ...G.s, x: G.L.bb.x, y: G.L.bb.y }, { paper: PAPER, export: true }) : ''}</g>`;
    // a group whose border isn't drawn (draw=none, a label above): its box outlined here only, never exported
    if (!G.empty && G.L.groups) for (const g of G.L.groups) if (g.bare) out += `<rect class="qe-gbare" x="${X(g.x)}" y="${Y(g.y)}" width="${r2(g.w * k)}" height="${r2(g.h * k)}" rx="${r2(g.rx * k)}"/>`;
    if (G.empty) out += `<text class="qe-empty" x="${X((xs[0] + xs[1]) / 2)}" y="${Y(ys[0]) - 14}">Drop or click an element to start</text>`;
    const box = (r1, c1, r2_, c2, cls) => `<rect class="${cls}" x="${X(xs[c1])}" y="${Y(ys[r1])}" width="${r2((xs[c2 + 1] - xs[c1]) * k)}" height="${r2((ys[r2_ + 1] - ys[r1]) * k)}"/>`;
    const h = E.hover;
    if (h) {
      // the growing row / column light up whole: a drop there adds a wire / a step
      const hb = G.empty ? [0, 0, 0, 0] : h.r === R ? [R, 0, R, C - 1] : h.c === C ? [0, C, R - 1, C] : [h.r, h.c, h.r + spanAt(h.r, h.c) - 1, h.c];
      if (G.empty || R && C || h.r < R || h.c < C) {
        if (E.arm || E.ghost || (E.drag && E.drag.mode === 'move' && E.drag.moved)) out += box(...hb, 'qe-target');
        else if (!E.drag) out += box(...hb, 'qe-hover');
      }
    }
    const b = selBox() && shownBox(selBox());
    if (b) out += box(b.r1, b.c1, b.r2, b.c2, 'qe-sel');
    // a selected control's link: a blue knob at the wire it reaches; drag it to another wire
    const s = single(), m = s && at(s.r1, s.c1) && mainOf(at(s.r1, s.c1));
    if (m && LINKS.has(m.name) && !(E.drag && E.drag.mode === 'move')) {
      const n = E.drag && E.drag.mode === 'link' ? E.drag.n : intArg(m.a[0]), x = X(G.cx(s.c1)), y = Y(G.cy(s.r1 + n));
      if (n) out += `<path class="qe-link" d="M${x},${Y(G.cy(s.r1))}V${y}"/>`;
      out += `<circle class="qe-knob" cx="${x}" cy="${n ? y : r2(Y(G.cy(s.r1)) + 16)}" r="5"/>`;
    }
    // the selected cell's group: a bar on each edge, dragged to another wire or step to resize it (under a selected gate's own handles)
    const hg = !(E.drag && E.drag.mode === 'move') && handleGroup();
    if (hg) {
      const g = hg.g, x1 = X(g.x), y1 = Y(g.y), x2 = X(g.x + g.w), y2 = Y(g.y + g.h), mx = r2((x1 + x2) / 2), my = r2((y1 + y2) / 2);
      out += `<rect class="qe-gedge" data-e="t" x="${r2(mx - 8)}" y="${r2(y1 - 3)}" width="16" height="6" rx="2"/><rect class="qe-gedge" data-e="b" x="${r2(mx - 8)}" y="${r2(y2 - 3)}" width="16" height="6" rx="2"/>`;
      out += `<rect class="qe-gedge" data-e="l" x="${r2(x1 - 3)}" y="${r2(my - 8)}" width="6" height="16" rx="2"/><rect class="qe-gedge" data-e="r" x="${r2(x2 - 3)}" y="${r2(my - 8)}" width="6" height="16" rx="2"/>`;
    }
    // a selected gate: a red-pen handle on its lower right corner sets its minimum width / height
    const gb = !(E.drag && E.drag.mode === 'move') && gateBox();
    if (gb) {
      const x1 = X(gb.x), y1 = Y(gb.y), x2 = X(gb.x + gb.w), y2 = Y(gb.y + gb.h);
      out += `<rect class="qe-gbox" x="${x1}" y="${y1}" width="${r2(x2 - x1)}" height="${r2(y2 - y1)}"/>`;
      // bars on the top and bottom edges: drag to reach up to earlier wires or down to later ones
      const bx = r2((x1 + x2) / 2 - 8);
      out += `<rect class="qe-span" data-e="t" x="${bx}" y="${r2(y1 - 3)}" width="16" height="6" rx="2"/><rect class="qe-span" data-e="b" x="${bx}" y="${r2(y2 - 3)}" width="16" height="6" rx="2"/>`;
      out += `<rect class="qe-size" x="${r2(x2 - 4)}" y="${r2(y2 - 4)}" width="8" height="8"/>`;
    }
    // the delete gutters left of the wires and above the steps
    E.gut = !E.drag && !E.arm && !E.ghost && R && C ? { sx: xs.map(X), sy: ys.map(Y), R, C, left: X(px1), top: Y(py1) } : null;
    out += TD.gridDel.svg(E.gut, E.del, E.del ? null : E.near, ['wire', 'step']);
    // what is being dragged, under the pointer
    const dragKey = E.ghost && E.ghost.k, mv = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if (dragKey || mv) {
      const src = dragKey ? miniSrc(ITEM[dragKey]) : `& ${cellText(at(E.drag.r, E.drag.c))} &`;
      const [gx, gy] = dragKey ? E.ghost.e : E.drag.e;
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${TD.qcMini(src, 34, PAPER)}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm);
  }

  // the selected cell's gate box, in layout px (one-wire gates only: taller ones follow their wires)
  function gateBox() {
    const s = single(), G = E.G;
    if (!s || !G || !G.L.ops) return null;
    const m = at(s.r1, s.c1) && !at(s.r1, s.c1).opaque && mainOf(at(s.r1, s.c1));
    if (!m || m.name !== 'gate') return null;
    const o = G.L.ops.find((o) => o.gate && o.gate[0] === s.r1 && o.gate[1] === s.c1);
    if (!o) return null;
    return { x: o.x, y: o.y, w: o.w, h: o.h, fit: o.fit, multi: spanOf(m) > 1 };
  }
  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    // a double-click is detected here: redraws between the clicks swap the target, so no native dblclick arrives
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    const dz = e.button === 0 && !E.space && TD.gridDel.at(E.gut, sx, sy);
    if (dz) { delLine(dz); return; }
    if (dbl && !e.target.closest('.qe-size, .qe-knob, .qe-span') && onDouble(e)) return;
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    if (e.target.closest('.qe-size')) {
      const s = single(), gb = gateBox();
      const [x0, y0] = toL(e);
      begin(); E.drag = { mode: 'size', r: s.r1, c: s.c1, x0, y0, w0: gb.w, h0: gb.h, fit: gb.fit, multi: gb.multi };
      return;
    }
    if (e.target.closest('.qe-span')) {
      const s = single(), m = mainOf(at(s.r1, s.c1));
      begin(); E.drag = { mode: 'span', c: s.c1, top: s.r1, bot: s.r1 + spanOf(m) - 1, edge: e.target.closest('.qe-span').dataset.e };
      return;
    }
    if (e.target.closest('.qe-gedge')) {
      const hg = handleGroup();
      if (hg) { begin(); E.gpin = hg.it; E.drag = { mode: 'gedge', edge: e.target.closest('.qe-gedge').dataset.e, it: hg.it, b: { r1: hg.g.r, c1: hg.g.c, r2: hg.g.r2, c2: hg.g.c2 } }; return; }
    }
    if (e.target.closest('.qe-knob')) { const s = single(); begin(); E.drag = { mode: 'link', r: s.r1, c: s.c1, n: intArg(mainOf(at(s.r1, s.c1)).a[0]) }; return; }
    // a click on a slice's or a group's label selects the cell that writes it (it may sit over the add-a-wire strip)
    const lt = !E.arm && titleAt(e);
    if (lt) { E.sel = { r1: lt.o.lab.r, c1: lt.o.lab.c, r2: lt.o.lab.r, c2: lt.o.lab.c }; draw(); renderProps(); return; }
    const h = E.arm ? cellAt(e) : pick(e);
    if (!h) { E.sel = null; draw(); renderProps(); return; }
    // an armed Group / Label above: drag across the cells it should cover (a click covers one)
    if (E.arm && GROUPING.has(E.arm) && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; E.drag = { mode: 'range', r: h.r, c: h.c, group: E.arm }; draw(); renderProps(); return; }
    if (E.arm) { put(E.arm, h.r, h.c, false); return; }
    if (h.r >= nR(E.M) || h.c >= nC(E.M)) { edit(() => ensure(E.M, h.r + 1, h.c + 1)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; draw(); renderProps(); return; }
    if (e.shiftKey && E.sel) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); return; }
    E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
    const cell = at(h.r, h.c);
    E.drag = cell && (cell.text || cell.items.length) && onElement(e, h) ? { mode: 'move', r: h.r, c: h.c, sx, sy, e: [sx, sy], moved: false } : { mode: 'range', r: h.r, c: h.c };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const dz = TD.gridDel.at(E.gut, sx, sy), h = dz ? null : E.arm ? cellAt(e) : pick(e);
      svg.style.cursor = dz ? 'pointer' : h && !E.arm && h.r < nR(E.M) && h.c < nC(E.M) && onElement(e, h) ? 'move' : '';
      const nr = dz ? null : TD.gridDel.near(E.gut, sx, sy);
      if (JSON.stringify(h) !== JSON.stringify(E.hover) || JSON.stringify(dz) !== JSON.stringify(E.del) || JSON.stringify(nr) !== JSON.stringify(E.near)) { E.hover = h; E.del = dz; E.near = nr; draw(); }
      return;
    }
    if (d.mode === 'pan') { E.fitted = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return; }
    if (d.mode === 'size') {
      const [x, y] = toL(e), PX = TD.PX_PER_CM, snap = (v) => Math.round(v * 20) / 20;
      // the handle is the lower right corner: right / down grows the gate, left / up shrinks it. The column's
      // left edge and the wire's top stay put, so the corner moves by the whole change in size.
      const w = d.w0 + (x - d.x0), h = d.h0 + (y - d.y0);
      const cell = at(d.r, d.c), m = mainOf(cell);
      // back at (or below) the fitted size: auto again
      const wcm = w <= d.fit[0] + 2 ? 0 : snap(w / PX), hcm = d.multi ? gateSize(m).h : h <= d.fit[1] + 2 ? 0 : snap(h / PX);
      setGateSize(m, wcm, hcm); cell.dirty = true;
      setTip(`Min width ${wcm ? wcm + ' cm' : 'auto'} · min height ${hcm ? hcm + ' cm' : 'auto'}`);
      draw();
      // the panel follows live: size fields and the cell's code
      const gw = $('[data-f="gw"]', props), gh = $('[data-f="gh"]', props), cf = $('[data-f="code"]', props);
      if (gw) gw.value = wcm || ''; if (gh) gh.value = hcm || ''; if (cf) cf.value = cellText(cell);
      return;
    }
    if (d.mode === 'gedge') {
      // the edge follows the pointer to a wire or step, never past the opposite edge; the group's code moves to its top left cell
      const h = cellAt(e);
      if (!h) return;
      const R = nR(E.M), C = nC(E.M), hr = Math.max(0, Math.min(R - 1, h.r)), hc = Math.max(0, Math.min(C - 1, h.c)), b = { ...d.b };
      if (d.edge === 't') b.r1 = Math.min(hr, b.r2); else if (d.edge === 'b') b.r2 = Math.max(hr, b.r1);
      else if (d.edge === 'l') b.c1 = Math.min(hc, b.c2); else b.c2 = Math.max(hc, b.c1);
      if (b.r1 === d.b.r1 && b.c1 === d.b.c1 && b.r2 === d.b.r2 && b.c2 === d.b.c2) return;
      const from = at(d.b.r1, d.b.c1), to = at(b.r1, b.c1);
      if (to !== from) {
        if (!to || to.opaque) { setTip('That cell is written as raw code: a group can\'t start there'); return; }
        setItems(from, from.items.filter((q) => q !== d.it)); setItems(to, [...to.items, d.it]);
      }
      setGroupDims(d.it, b.r2 - b.r1 + 1, b.c2 - b.c1 + 1); to.dirty = true;
      d.b = b;
      const k = single();
      if (!k || k.r1 < b.r1 || k.r1 > b.r2 || k.c1 < b.c1 || k.c1 > b.c2) E.sel = { r1: b.r1, c1: b.c1, r2: b.r1, c2: b.c1 };
      setTip(`Group · ${b.r2 - b.r1 + 1} wire${b.r2 > b.r1 ? 's' : ''} × ${b.c2 - b.c1 + 1} step${b.c2 > b.c1 ? 's' : ''}`);
      draw();
      return;
    }
    if (d.mode === 'span') {
      // the nearest wire to the pointer, as far as the column stays empty: a gate never covers another element
      const [, y] = toL(e), G = E.G, R = nR(E.M), c = d.c;
      let wire = 0, dist = Infinity;
      for (let i = 0; i < G.R; i++) { const dd = Math.abs(G.cy(i) - y); if (dd < dist) { dist = dd; wire = i; } }
      // a cell with nothing but its wire (\qw, \cw) is free: the gate is drawn over it
      const free = (r) => wireOnly(at(r, c));
      if (d.edge === 'b') {
        let lim = d.top; while (lim + 1 < R && (lim + 1 <= d.bot || free(lim + 1))) lim++;
        d.bot = Math.max(d.top, Math.min(wire, lim));
      } else {
        let lim = d.top; while (lim - 1 >= 0 && free(lim - 1)) lim--;
        const top = Math.max(lim, Math.min(wire, d.bot));
        if (top !== d.top) { moveCell(d.top, c, top, c); d.top = top; E.sel = { r1: top, c1: c, r2: top, c2: c }; }
      }
      const cell = at(d.top, c), m = mainOf(cell);
      setSpan(m, d.bot - d.top + 1); cell.dirty = true;
      setTip(d.bot > d.top ? `Wires ${d.top + 1}–${d.bot + 1}` : `Wire ${d.top + 1}`);
      draw();
      const sf = $('[data-f="span"]', props), cf = $('[data-f="code"]', props);
      if (sf) sf.value = d.bot - d.top + 1; if (cf) cf.value = cellText(cell);
      return;
    }
    if (d.mode === 'link') {
      const [, y] = toL(e), G = E.G;
      let best = d.r, dist = Infinity;
      for (let i = 0; i < G.R; i++) { const dd = Math.abs(G.cy(i) - y); if (dd < dist) { dist = dd; best = i; } }
      d.n = best - d.r; draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true; d.e = [sx, sy]; E.hover = cellAt(e); draw(); return;
    }
    if (d.mode === 'range') { const h = pick(e); if (h && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); } }
  });
  svg.addEventListener('pointerup', (e) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'range' && d.group) { addGroup(selBox(), d.group === 'glabel'); return; }
    if (d.mode === 'span') clearUnder(d.top, d.c);
    if (d.mode === 'size' || d.mode === 'span' || d.mode === 'gedge') { setTip(''); commit(); draw(); keepInView(); renderProps(); return; }
    if (d.mode === 'link') { const m = mainOf(at(d.r, d.c)); m.a[0] = d.n ? String(d.n) : ''; at(d.r, d.c).dirty = true; commit(); draw(); renderProps(); return; }
    if (d.mode === 'move' && d.moved) {
      const h = cellAt(e);
      if (h && (h.r !== d.r || h.c !== d.c)) { edit(() => moveCell(d.r, d.c, h.r, h.c, e.altKey)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; }
      E.hover = null; draw(); renderProps(); return;
    }
    draw();
  });
  // right-click: wires and steps, around the cell (or range) under the pointer
  const MI = {
    ...QI, clear: '<path d="M4 4l12 12M16 4L4 16"/>',
    left: '<path d="M16 10H4M8.5 5.5L4 10l4.5 4.5"/>', right: '<path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>',
    group: '<rect x="3" y="5" width="14" height="12" rx="2" stroke-dasharray="2.5 2"/><path d="M6 2.5h8"/>',
    glabel: '<path d="M5 3h10M10 3v5"/><rect x="5" y="11" width="10" height="6" rx="1"/>',
    gdel: '<rect x="3" y="5" width="14" height="12" rx="2" stroke-dasharray="2.5 2"/><path d="M7.5 8.5l5 5M12.5 8.5l-5 5"/>',
  };
  // the groups whose box covers a cell: [{ r, c, i, it }]
  function groupsAt(r, c) {
    const out = [];
    E.M.rows.forEach((row, r0) => row.forEach((cell, c0) => {
      if (cell.opaque) return;
      cell.items.forEach((it, i) => {
        if (it.name !== 'gategroup') return;
        const d = groupDims(it);
        if (r >= r0 && r < r0 + d.wires && c >= c0 && c < c0 + d.steps) out.push({ r: r0, c: c0, i, it });
      });
    }));
    return out;
  }
  // the group whose edge handles show: with one cell selected, the group last resized if it covers the cell, else the
  // smallest group that does. { g (layout box), it (the item), r, c }
  function handleGroup() {
    const s = single(), G = E.G;
    if (!s || !G || G.empty || !G.L.groups) return null;
    const item = (g) => { const cell = at(g.r, g.c); return cell && !cell.opaque ? cell.items.filter((q) => q.name === 'gategroup')[g.n] || null : null; };
    const cover = G.L.groups.filter((g) => s.r1 >= g.r && s.r1 <= g.r2 && s.c1 >= g.c && s.c1 <= g.c2).map((g) => ({ g, it: item(g) })).filter((x) => x.it);
    if (!cover.length) return null;
    return cover.find((x) => x.it === E.gpin) || cover.sort((p, q) => (p.g.r2 - p.g.r + 1) * (p.g.c2 - p.g.c + 1) - (q.g.r2 - q.g.r + 1) * (q.g.c2 - q.g.c + 1))[0];
  }
  // a group over the selection, framed or (label) with no border; selects its cell and puts the caret in its label.
  // A tall gate in the selection is covered whole: the group reaches down to its last wire
  function addGroup(s, label) {
    s = shownBox(s);
    const cell = at(s.r1, s.c1);
    if (!cell || cell.opaque) return;
    const w = s.r2 - s.r1 + 1, n = s.c2 - s.c1 + 1;
    const it = Q.cell(`\\gategroup[${w},steps=${n},style={${label ? 'draw=none' : 'dashed,rounded corners'}}]{${label ? 'label' : ''}}`, () => {})[0];
    edit(() => setItems(cell, [...cell.items, it]));
    E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps();
    const f = $(`[data-f="Gx${s.r1}_${s.c1}_${cell.items.indexOf(it)}"]`, props);
    if (f) { f.scrollIntoView({ block: 'nearest' }); f.focus({ preventScroll: true }); f.select(); }
  }
  const mItem = (act, label, ic, key, off) => `<button class="ctx-item${/^(rowdel|coldel|delete|gdel)/.test(act) ? ' danger' : ''}" data-qm="${act}"${off ? ' disabled' : ''}><svg viewBox="0 0 20 20"${QI[ic] ? ' class="qe-ic"' : ''}>${MI[ic]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const h = pick(e);
    if (!h || h.r >= nR(E.M) || h.c >= nC(E.M)) { closeMenu(); return; }
    const b = selBox() && shownBox(selBox());
    if (!b || h.r < b.r1 || h.r > b.r2 || h.c < b.c1 || h.c > b.c2) E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
    draw(); renderProps();
    const s = selBox(), nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
    menu.innerHTML = mItem('rowabove', 'Insert Wire Above', 'above') + mItem('rowbelow', 'Insert Wire Below', 'below') + '<hr>' +
      mItem('colbefore', 'Insert Step Before', 'before') + mItem('colafter', 'Insert Step After', 'after') + '<hr>' +
      mItem('colleft', nc > 1 ? `Move ${nc} Steps Left` : 'Move Step Left', 'left', '', s.c1 === 0) +
      mItem('colright', nc > 1 ? `Move ${nc} Steps Right` : 'Move Step Right', 'right', '', s.c2 >= nC(E.M) - 1) + '<hr>' +
      mItem('rowdel', nr > 1 ? `Delete ${nr} Wires` : 'Delete Wire', 'rowdel') + mItem('coldel', nc > 1 ? `Delete ${nc} Steps` : 'Delete Step', 'coldel') + '<hr>' +
      mItem('delete', nr * nc > 1 ? 'Clear Cells' : 'Clear Cell', 'clear', 'Del');
    // groups: frame or label the selection; delete any group whose box covers the clicked cell
    const gb = shownBox(s), anchor = at(s.r1, s.c1), here = groupsAt(h.r, h.c), many = (gb.r2 - gb.r1 + 1) * nc > 1;
    let gh = mItem('gadd', many ? 'Group Selection' : 'Group Cell', 'group', '', !anchor || anchor.opaque) +
      mItem('glabel', many ? 'Label Above Selection' : 'Label Above', 'glabel', '', !anchor || anchor.opaque);
    here.forEach((g) => {
      const t = (g.it.a[0] || '').trim(), name = t ? `“${t.length > 24 ? t.slice(0, 23) + '…' : t}”` : '';
      gh += mItem(`gdel:${g.r},${g.c},${g.i}`, here.length > 1 || name ? `Delete Group ${name}`.trim() : 'Delete Group', 'gdel');
    });
    menu.innerHTML = menu.innerHTML.replace(/<hr>(?=<button[^>]*data-qm="delete")/, '<hr>' + gh + '<hr>');
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qm]');
    if (!b) return;
    closeMenu();
    const q = b.dataset.qm;
    if (q === 'gadd' || q === 'glabel') { addGroup(selBox(), q === 'glabel'); return; }
    if (q.startsWith('gdel:')) {
      const [r, c, i] = q.slice(5).split(',').map(Number), cell = at(r, c);
      if (cell) edit(() => setItems(cell, cell.items.filter((_, k) => k !== i)));
      return;
    }
    act(q);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.del || E.near)) { E.hover = null; E.del = null; E.near = null; draw(); } });
  // a click on a delete gutter: that wire or step goes, as one undo step
  function delLine(dz) {
    closeLabel(); E.del = null; E.hover = null; E.sel = null; svg.style.cursor = '';
    edit(() => (dz.kind === 'row' ? deleteRows(E.M, dz.i, dz.i) : deleteCols(E.M, dz.i, dz.i)));
  }
  // double-click: a sized gate goes back to its fitted size; anything else opens its first field
  // double-click on a gate or another element with a label: edit the label in place
  // elements with a typeable label, and the name of its field in the panel
  const LABEL = { gate: 'Label', phase: 'Angle', meter: 'Label', metercw: 'Label', inputD: 'Label', trash: 'Label', makeebit: 'Label', permute: 'Order', phantomgate: 'Width of', hphantomgate: 'Width of', meterD: 'Label', measuretab: 'Label', measure: 'Label', lstick: 'Label', rstick: 'Label', push: 'Text', midstick: 'Label', qwbundle: 'Label' };
  function onDouble(e) {
    if (editTitle(e)) return true;
    const s = single(), h = pick(e);
    if (!s || !h || h.r !== s.r1 || h.c !== s.c1) return false;
    return editLabel(s.r1, s.c1);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the element (TD.input.popup): LaTeX or MathLive, as the Text input setting says.
  // Enter, Esc or clicking away finishes; the whole edit is one undo step.
  const MATH_LABEL = new Set(['gate', 'phase', 'qwbundle']); // set as maths by quantikz; the rest are text
  let L = null; // { r, c, pop }
  function editLabel(r, c) {
    const cell = at(r, c), m = cell && !cell.opaque && mainOf(cell);
    if (!m || !LABEL[m.name] || !TD.input) return false;
    closeLabel();
    begin();
    const me = (L = { r, c });
    me.pop = TD.input.popup(stage, {
      text: m.a[0] || '', math: MATH_LABEL.has(m.name), bare: true,
      at: () => labelAt(r, c),
      onInput: (v) => { m.a[0] = v; cell.dirty = true; draw(); renderProps(); },
      onDone: () => { if (L === me) L = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // a slice's or a group's label (its top or its bottom one) under the pointer: edit it in place, under the label
  function titleAt(e) {
    const G = E.G, [x, y] = toL(e), tol = 4 / E.view.k;
    const o = G && !G.empty && G.L.ops && [...G.L.ops].reverse().find((o) => o.k === 'text' && o.lab && Math.abs(x - o.x) <= o.b.w / 2 + tol && Math.abs(y - o.y) <= o.b.h / 2 + tol);
    const cell = o && at(o.lab.r, o.lab.c), it = cell && !cell.opaque && cell.items[o.lab.i];
    return it ? { o, cell, it } : null;
  }
  function editTitle(e) {
    const t = titleAt(e);
    if (!t || !TD.input) return false;
    const { o, cell, it } = t;
    const low = !!o.lab.low, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(), oy = o.y + o.b.h / 2;
    closeLabel();
    begin();
    const me = (L = { r: o.lab.r, c: o.lab.c });
    me.pop = TD.input.popup(stage, {
      text: low ? groupLow(it) : it.a[0] || '', math: false, bare: true,
      at: () => { const v = E.view; return [vr.left - sr.left + v.ox + o.x * v.k, vr.top - sr.top + v.oy + oy * v.k + 8]; },
      onInput: (v) => { if (low) setGroupMode(it, 'both', v); else it.a[0] = v; cell.dirty = true; draw(); renderProps(); },
      onDone: () => { if (L === me) L = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // under the gate's box (or the cell), in stage pixels
  function labelAt(r, c) {
    const G = E.G || (E.G = geom()), v = E.view, gb = gateBox();
    const x = gb ? gb.x + gb.w / 2 : G.cx(c), y = gb ? gb.y + gb.h : G.ys[r + 1];
    const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + v.ox + x * v.k, vr.top - sr.top + v.oy + y * v.k + 8];
  }
  function closeLabel() { if (L) L.pop.close(); }
  svg.addEventListener('wheel', () => L && L.pop.place(), { passive: true }); // panning or zooming carries it along

  // ---------------------------------------------------------------- properties
  const field = (label, f, value, extra = '') => `<div class="row"><label>${label}</label><div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div></div>`;
  const dec = (label, f, value) => `<div class="row"><label>${label}</label><div class="ctl unit"><input type="number" data-f="${f}" value="${value || ''}" min="0" step="0.1" placeholder="auto"><span>cm</span></div></div>`;
  const num = (label, f, value, min = 1) => `<div class="row"><label>${label}</label><div class="ctl"><input type="number" data-f="${f}" value="${value}" min="${min}" step="1"></div></div>`;
  // colours, as quantikz takes them: style={fill=…, draw=…} in the element's options
  const FILLED = new Set(['gate', 'meter', 'metercw', 'meterD', 'inputD', 'measure', 'measuretab']);
  const COLOURED = new Set([...FILLED, 'ctrl', 'octrl', 'control', 'ocontrol', 'targ', 'targX', 'swap', 'phase', 'ground', 'trash', 'permute', 'qwbundle']); // sticks, \push and \makeebit draw no colour
  function styleOf(m) {
    const o = Q.opts(m.o[0] || '');
    return Q.opts(o.map.style || '').map;
  }
  function setStyle(m, key, val) {
    const o = Q.opts(m.o[0] || ''), st = Q.opts(o.map.style || '');
    let list = st.list.filter((e) => !new RegExp(`^${key}\\s*=`).test(e));
    if (val) list.push(`${key}=${val}`);
    const rest = o.list.filter((e) => !/^style\s*=/.test(e));
    if (list.length) rest.push(`style={${list.join(',')}}`);
    const head = rest.join(',');
    m.o = head || m.o.length > 1 ? [head, ...m.o.slice(1)] : [];
  }
  // a colour field (the colour picker, written as an xcolor spec); Default leaves it to quantikz
  const hueSel = (label, f, cur, fill) => `<div class="row"><label>${label}</label>${TD.texColor.field(`data-f="${f}"`, TD.texColor.unwrap(cur), { nullable: true, dfltSw: fill ? '' : TD.css(INK), title: label })}</div>`;
  // a group's border: Shown (its Line colour) or None (draw=none: only the label, above the gates)
  function groupBorder(k, st) {
    const off = /^none$/i.test((st.draw || '').trim());
    return `<div class="row"><label>Border</label><div class="ctl seg-ctl">${[['1', 'Shown'], ['0', 'None']].map(([v, n]) => `<button data-qe="gb" data-g="${k}" data-v="${v}" class="${(v === '0') === off ? 'on' : ''}">${n}</button>`).join('')}</div></div>` +
      `<div${off ? ' style="visibility:hidden"' : ''}>${hueSel('Line', 'Gd' + k, off ? '' : st.draw || st.color || '', false)}</div>`;
  }
  // a group named in the panel as "r_c_i": its anchor cell and item
  function gref(k) {
    const [r, c, i] = k.split('_').map(Number), cell = at(r, c), it = cell && !cell.opaque && cell.items[i];
    return it && it.name === 'gategroup' ? { cell, it } : null;
  }
  // a top-level option written as key={a,b,…} (none: dropped)
  function setOpt(m, key, list) {
    const o = Q.opts(m.o[0] || ''), rest = o.list.filter((e) => !new RegExp(`^${key}\\s*=`).test(e));
    if (list.length) rest.push(`${key}={${list.join(',')}}`);
    const head = rest.join(',');
    m.o = head || m.o.length > 1 ? [head, ...m.o.slice(1)] : [];
  }
  const lsOf = (m) => Q.opts(Q.opts(m.o[0] || '').map['label style'] || '').list;
  // A group's label: above (quantikz's own), below (label position=below, as far under as the top one is over),
  // or both (a second label={…} in its style).
  const GLOW = 'group label,label position=below,yshift=-0.4cm';
  function groupMode(it) {
    if (Q.opts(Q.opts(it.o[0] || '').map.style || '').list.some((e) => /^label\s*=/.test(e))) return 'both';
    return lsOf(it).some((e) => /^label position\s*=\s*below/.test(e) || e === 'below') ? 'bottom' : 'top';
  }
  function groupLow(it) {
    const q = /\]\s*(?:\w+\s*)?:\s*([\s\S]*)$/.exec(styleOf(it).label || '');
    return q ? q[1].trim().replace(/^\{([\s\S]*)\}$/, '$1') : '';
  }
  function setGroupMode(it, mode, low) {
    const keep = lsOf(it).filter((e) => !/^(label position|yshift)\s*=/.test(e) && e !== 'below' && e !== 'above');
    setOpt(it, 'label style', mode === 'bottom' ? [...keep, 'label position=below', 'yshift=-0.4cm'] : keep);
    setStyle(it, 'label', mode === 'both' ? `{[${GLOW}]:{${low}}}` : '');
  }
  // A slice's label: at the top (quantikz's own), the bottom (label style={pos=1,anchor=north}), or both: a second,
  // borderless \slice in the same cell carries the bottom one. A slice over fewer wires is shortened at its ends
  // (shorten <=, >= from the layout); shortening leaves the label where it was, so a yshift follows the cut end.
  // it.wr caches the wires [from, to] while editing; the code alone gives them back by the nearest wire edges.
  const sliceNone = (it) => /^none$/i.test((styleOf(it).draw || '').trim());
  function slicePair(cell) {
    const sl = cell.opaque ? [] : cell.items.filter((it) => it.name === 'slice');
    const main = sl.find((it) => !sliceNone(it)) || null;
    return { main, comp: (main && sl.find((it) => it !== main && sliceNone(it))) || null };
  }
  const sliceBottom = (it) => lsOf(it).some((e) => /^pos\s*=\s*1(\.0*)?$/.test(e));
  const sliceShort = (it) => !!(styleOf(it)['shorten <'] || styleOf(it)['shorten >']);
  function rowsPx() { const G = E.G || (E.G = geom()), g = G.L && G.L.geo; return g && G.L.R ? { g, R: G.L.R } : null; }
  const edgeT = (g, a) => g.rowT[a] - g.rowT[0], edgeB = (g, R, b) => g.rowT[R - 1] + g.rowH[R - 1] - g.rowT[b] - g.rowH[b];
  function sliceWires(it) {
    const R = nR(E.M), q = rowsPx();
    if (it.wr) return it.wr;
    if (!q || !sliceShort(it)) return [0, Math.max(0, R - 1)];
    const cm = (v) => { const m = /(-?[\d.]+)\s*(cm|mm|pt)?/.exec(v || ''); return !m ? 0 : m[2] === 'mm' ? m[1] / 10 : m[2] === 'pt' ? m[1] / 28.45 : +m[1]; };
    const T = cm(styleOf(it)['shorten <']) * TD.PX_PER_CM, B = cm(styleOf(it)['shorten >']) * TD.PX_PER_CM;
    let a = 0, b = q.R - 1;
    for (let i = 0; i < q.R; i++) { if (Math.abs(edgeT(q.g, i) - T) < Math.abs(edgeT(q.g, a) - T)) a = i; if (Math.abs(edgeB(q.g, q.R, i) - B) < Math.abs(edgeB(q.g, q.R, b) - B)) b = i; }
    return [a, Math.max(a, b)];
  }
  // the cut at each end, in cm, for wires [a, b]
  function sliceCut(it) {
    const q = rowsPx();
    if (!q || !(it.wr || sliceShort(it))) return [0, 0];
    const [a, b] = sliceWires(it).map((v) => Math.min(Math.max(v, 0), q.R - 1)), cm = (v) => Math.round((v / TD.PX_PER_CM) * 100) / 100;
    return [cm(edgeT(q.g, a)), cm(edgeB(q.g, q.R, Math.max(a, b)))];
  }
  function placeSlice(main, comp, bottom) {
    const [T, B] = sliceCut(main), keep = (it) => lsOf(it).filter((e) => !/^(pos|anchor|yshift)\s*=/.test(e));
    setStyle(main, 'shorten <', T ? `${T}cm` : ''); setStyle(main, 'shorten >', B ? `${B}cm` : '');
    if (!T && !B) delete main.wr;
    setOpt(main, 'label style', [...keep(main), ...(bottom ? ['pos=1', 'anchor=north', ...(B ? [`yshift=${B}cm`] : [])] : T ? [`yshift=-${T}cm`] : [])]);
    if (comp) setOpt(comp, 'label style', [...keep(comp), 'pos=1', 'anchor=north', ...(B ? [`yshift=${B}cm`] : [])]);
  }
  // keep every shortened slice's cut on its wires as the rows around it change height
  function syncSlices() {
    let changed = false;
    for (const row of E.M.rows) for (const cell of row) {
      const { main, comp } = slicePair(cell);
      if (!main || !(main.wr || sliceShort(main))) continue;
      const was = itemCode(main) + (comp ? itemCode(comp) : '');
      main.wr = sliceWires(main);
      placeSlice(main, comp, sliceBottom(main));
      if (itemCode(main) + (comp ? itemCode(comp) : '') !== was) { cell.dirty = true; changed = true; }
    }
    return changed;
  }
  function setSliceMode(cell, main, mode) {
    let { comp } = slicePair(cell);
    if (mode === 'both' && !comp) { comp = { name: 'slice', o: ['style={draw=none}'], a: [''] }; cell.items.splice(cell.items.indexOf(main) + 1, 0, comp); }
    if (mode !== 'both' && comp) { cell.items.splice(cell.items.indexOf(comp), 1); comp = null; }
    placeSlice(main, comp, mode === 'bottom');
    cell.dirty = true;
  }
  const seg = (qe, data, cur, opts) => `<div class="row"><label>Label at</label><div class="ctl seg-ctl">${opts.map(([v, n]) => `<button data-qe="${qe}" ${data} data-v="${v}" class="${cur === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
  const AT = [['top', 'Top'], ['bottom', 'Bottom'], ['both', 'Both']];

  // ---------------------------------------------------------------- circuit-wide spacing
  // quantikz's row sep / column sep in the environment's options: a gap between rows (steps), or, with
  // "between origins", the distance from one wire (step) to the next, so every row is the same height whatever
  // it holds. Shown in cm; a length in other units is converted, em and ex kept until the field is changed.
  const SEP = { row: 'row sep', col: 'column sep' };
  const CM = { cm: 1, mm: 0.1, pt: 2.54 / 72.27, bp: 2.54 / 72, in: 2.54 };
  function sepOf(axis) {
    const v = Q.opts(E.M.env || '').map[SEP[axis]];
    if (!v) return { cm: null, between: false, raw: '' };
    const between = /between origins/.test(v), len = v.replace(/,?\s*between origins\s*,?/, '').trim();
    const m = /^(-?[\d.]+)\s*(cm|mm|pt|bp|in)?$/.exec(len);
    return { cm: m ? Math.round(parseFloat(m[1]) * CM[m[2] || 'pt'] * 1000) / 1000 : null, between, raw: len };
  }
  // the spacing the circuit has now, in cm: the gap, or the mean wire-to-wire (step-to-step) distance
  function sepNow(axis, between) {
    const g = Q.layout({ type: 'qc', x: 0, y: 0, src: snap(), size: E.st.size, font: E.st.font, color: INK }).geo;
    if (!g) return 0.5;
    const [mid, lo, size] = axis === 'row' ? [g.cy, g.rowT, g.rowH] : [g.cx, g.colL, g.colW], n = mid ? mid.length : 0;
    if (n < 2) return between ? 1 : 0.5;
    let v = 0;
    for (let i = 1; i < n; i++) v += between ? mid[i] - mid[i - 1] : lo[i] - lo[i - 1] - size[i - 1];
    return Math.max(0.05, Math.round((v / (n - 1) / TD.PX_PER_CM) * 20) / 20);
  }
  function setSep(axis, cm, between) {
    const key = SEP[axis], o = Q.opts(E.M.env || '');
    const list = o.list.filter((e) => !new RegExp(`^${key}\\s*=`).test(e));
    if (cm != null) list.push(between ? `${key}={${cm}cm,between origins}` : `${key}=${cm}cm`);
    E.M.env = list.join(', ');
    if (E.M.env) E.M.wrapped = true; // the options need \begin{quantikz}[…] to live in
  }
  function circuitProps() {
    const one = (axis, label, pitch) => {
      const v = sepOf(axis);
      return `<div class="row"><label>${label}</label><div class="ctl unit"><input type="number" data-f="E${axis}" value="${v.cm ?? ''}" min="0" step="0.05" placeholder="${v.cm == null && v.raw ? esc(v.raw) : v.between ? '' : '0.5'}"><span>cm</span></div></div>`
        + `<div class="row"><label>Measured</label><div class="ctl seg-ctl">${[['gap', 'Gap'], ['pitch', pitch]].map(([k, n]) => `<button data-qe="sepmode" data-axis="${axis}" data-v="${k}" class="${(k === 'pitch') === v.between ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
    };
    return `<div class="sec"><div class="sec-title">Circuit</div>${one('row', 'Wire spacing', 'Wire to wire')}${one('col', 'Step spacing', 'Step to step')}`
      + '<div class="help">Gap: the space between rows, which grow with what they hold. Wire to wire: every wire the same distance from the next.</div></div>';
  }
  function renderProps() {
    if (!E) return;
    const b = selBox();
    if (!b) { props.hidden = false; TD.morph(props, circuitProps()); return; }
    props.hidden = false;
    if (!single()) {
      const n = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
      TD.morph(props, `<div class="sec"><div class="sec-title">${n} cells</div><div class="help">Wires ${b.r1 + 1}–${b.r2 + 1}, steps ${b.c1 + 1}–${b.c2 + 1}.</div><div class="help">Right-click for wires and steps.</div></div>`);
      return;
    }
    const cell = at(b.r1, b.c1), m = !cell.opaque && mainOf(cell);
    let h = `<div class="sec"><div class="sec-title">${cell.opaque ? 'Custom cell' : m ? NAMES[m.name] || m.name : cell.items.length ? 'Cell' : 'Empty cell'} <small>wire ${b.r1 + 1} · step ${b.c1 + 1}</small></div>`;
    if (m) {
      const label = LABEL[m.name];
      if (label) h += field(label, 'arg', m.plain ? m.a[0] : m.a[0] || '', MATH_LABEL.has(m.name) ? ' data-tx="math"' : ' data-tx="text"');
      if (SPANS.has(m.name)) h += num('Wires', 'span', spanOf(m));
      if (COLOURED.has(m.name)) {
        const st = styleOf(m);
        if (FILLED.has(m.name)) h += hueSel('Fill', 'cfill', st.fill || '', true);
        h += hueSel(FILLED.has(m.name) ? 'Line' : 'Colour', 'cdraw', st.draw || st.color || '', false);
      }
      if (m.name === 'gate') { const z = gateSize(m); h += dec('Min width', 'gw', z.w) + (spanOf(m) > 1 ? '' : dec('Min height', 'gh', z.h)); }
      if (LINKS.has(m.name)) {
        const n = intArg(m.a[0]), opts = [`<option value="0"${n ? '' : ' selected'}>None</option>`];
        for (let i = 0; i < nR(E.M); i++) if (i !== b.r1) opts.push(`<option value="${i - b.r1}"${i - b.r1 === n ? ' selected' : ''}>Wire ${i + 1}</option>`);
        h += `<div class="row"><label>Line to</label><div class="ctl"><select data-f="link">${opts.join('')}</select></div></div>`;
      }
    } else if (!cell.opaque && !cell.items.length) h += `<div class="help">Pick an element on the left, or type <kbd>H</kbd> <kbd>X</kbd> <kbd>Z</kbd> <kbd>C</kbd> <kbd>M</kbd>…</div>`;
    h += '</div>';
    if (!cell.opaque) cell.items.forEach((it, i) => {
      if (it.name === 'slice') {
        const { main, comp } = slicePair(cell);
        if (it === comp) return; // shown with its slice, as the bottom label
        const mode = it === main && comp ? 'both' : sliceBottom(it) ? 'bottom' : 'top', w = it === main ? sliceWires(it) : null, R = nR(E.M);
        h += `<div class="sec"><div class="sec-title">Slice <button class="flat qe-x" data-qe="drop" data-i="${i}" title="Remove">×</button></div>${field('Label', 'x' + i, it.a[0] || '', ' data-tx="text"')}`;
        if (it === main) {
          h += seg('sl', `data-i="${i}"`, mode, AT) + `<div${comp ? '' : ' style="visibility:hidden"'}>${field('Bottom label', 'xb' + i, comp ? comp.a[0] || '' : '', ' data-tx="text"')}</div>`;
          h += num('From wire', 'sa' + i, w[0] + 1).replace('min="1"', `min="1" max="${R}"`) + num('To wire', 'sz' + i, w[1] + 1).replace('min="1"', `min="1" max="${R}"`);
        }
        h += `${hueSel('Colour', 'cd' + i, styleOf(it).draw || styleOf(it).color || '', false)}</div>`;
      }
      else if (it.name === 'setwiretype') {
        const t = (it.a[0] || 'q').trim();
        h += `<div class="sec"><div class="sec-title">Wire from here <button class="flat qe-x" data-qe="drop" data-i="${i}" title="Remove">×</button></div><div class="row"><div class="ctl seg-ctl">${[['q', 'Quantum'], ['c', 'Classical'], ['n', 'None']].map(([v, n]) => `<button data-qe="wt" data-i="${i}" data-v="${v}" class="${t === v ? 'on' : ''}">${n}</button>`).join('')}</div></div></div>`;
      }
    });
    // every group whose box covers this cell, wherever it is written (its top-left cell), edited the same from any cell it covers
    for (const g of groupsAt(b.r1, b.c1)) {
      const k = `${g.r}_${g.c}_${g.i}`, d = groupDims(g.it), st = styleOf(g.it), away = g.r !== b.r1 || g.c !== b.c1;
      h += `<div class="sec"><div class="sec-title"><span>Group${away ? ` <small>from wire ${g.r + 1} · step ${g.c + 1}</small>` : ''}</span> <button class="flat qe-x" data-qe="gdrop" data-g="${k}" title="Remove">×</button></div>${field('Label', 'Gx' + k, g.it.a[0] || '', ' data-tx="text"')}${seg('gl', `data-g="${k}"`, groupMode(g.it), AT)}<div${groupMode(g.it) === 'both' ? '' : ' style="visibility:hidden"'}>${field('Bottom label', 'Gb' + k, groupLow(g.it), ' data-tx="text"')}</div>${num('Wires', 'Gw' + k, d.wires)}${num('Steps', 'Gs' + k, d.steps)}${hueSel('Fill', 'Gf' + k, st.fill || '', true)}${groupBorder(k, st)}</div>`;
    }
    h += `<div class="sec">${field('Code', 'code', cellText(cell), ' class="mono"')}${cell.opaque ? '<div class="help">This cell has commands the editor doesn’t draw; they are kept as written.</div>' : ''}</div>`;
    TD.morph(props, h);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e) => {
    const t = e.target, f = t.dataset.f, s = single();
    if (f === 'Erow' || f === 'Ecol') {
      const axis = f.slice(1).toLowerCase(), v = parseFloat(t.value);
      setSep(axis, Number.isFinite(v) && v >= 0 ? v : null, sepOf(axis).between);
      draw(); keepInView(); return;
    }
    if (!f || !s) return;
    const cell = at(s.r1, s.c1);
    if (f === 'code') { Object.assign(cell, parseCell(t.value)); }
    else if (/^G[xbwsfd]/.test(f)) {
      // a group's field, by its top-left cell; a filled group goes behind the circuit (background), or its fill hides the gates
      const g = gref(f.slice(2));
      if (!g) return;
      const it = g.it;
      if (f[1] === 'x') it.a[0] = t.value;
      else if (f[1] === 'b') setGroupMode(it, 'both', t.value);
      else if (f[1] === 'w' || f[1] === 's') { const d = groupDims(it), v = Math.max(1, intArg(t.value) || 1); setGroupDims(it, f[1] === 'w' ? v : d.wires, f[1] === 's' ? v : d.steps); }
      else {
        if (f[1] === 'd') setStyle(it, 'color', '');
        setStyle(it, f[1] === 'f' ? 'fill' : 'draw', TD.texColor.wrap(t.value));
        if (f[1] === 'f' && t.value) { const o = Q.opts(it.o[0] || ''); if (!o.list.includes('background')) it.o = [[...o.list, 'background'].join(','), ...it.o.slice(1)]; }
      }
      g.cell.dirty = true;
    }
    else {
      const m = mainOf(cell);
      if (f === 'arg') { m.a[0] = t.value; cell.dirty = true; }
      else if (f === 'gw' || f === 'gh') { const z = gateSize(m), v = Math.max(0, parseFloat(t.value) || 0); setGateSize(m, f === 'gw' ? v : z.w, f === 'gh' ? v : z.h); cell.dirty = true; }
      else if (f === 'span') { setSpan(m, Math.max(1, intArg(t.value) || 1)); cell.dirty = true; clearUnder(s.r1, s.c1); }
      else if (f === 'link') { const n = intArg(t.value); m.a[0] = n ? String(n) : ''; cell.dirty = true; }
      else if (f === 'cfill' || f === 'cdraw') { if (f === 'cdraw') setStyle(m, 'color', ''); setStyle(m, f === 'cfill' ? 'fill' : 'draw', TD.texColor.wrap(t.value)); cell.dirty = true; }
      else if (/^cd\d+$/.test(f)) { const it = cell.items[+f.slice(2)]; setStyle(it, 'color', ''); setStyle(it, 'draw', TD.texColor.wrap(t.value)); cell.dirty = true; } // a slice's colour
      else if (/^x\d+$/.test(f)) { cell.items[+f.slice(1)].a[0] = t.value; cell.dirty = true; }
      else if (/^xb\d+$/.test(f)) { const { comp } = slicePair(cell); if (comp) { comp.a[0] = t.value; cell.dirty = true; } }
      else if (/^s[az]\d+$/.test(f)) {
        // a slice's wires: the other end moves along when they would cross
        const it = cell.items[+f.slice(2)], w = sliceWires(it).slice(), R = nR(E.M), v = Math.min(Math.max(intArg(t.value) || 1, 1), R) - 1;
        if (f[1] === 'a') { w[0] = v; w[1] = Math.max(w[1], v); } else { w[1] = v; w[0] = Math.min(w[0], v); }
        it.wr = w; placeSlice(it, slicePair(cell).comp, sliceBottom(it)); cell.dirty = true;
      }
    }
    draw();
    if (f === 'link' || f === 'cfill' || f === 'cdraw' || /^cd\d+$/.test(f) || /^G[fd]/.test(f)) { commit(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (TD.morph keeps this one as typed)
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-qe="undo"]', root).disabled = !E.undo.length;
    $('[data-qe="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qe]');
    if (!b || !E) return;
    act(b.dataset.qe, b);
  });
  function act(a, b) {
    const s = selBox(), M = E.M;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') clearSel();
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    else if (a === 'addrow') edit(() => ensure(M, nR(M) + 1, Math.max(nC(M), 1)));
    else if (a === 'addcol') edit(() => ensure(M, Math.max(nR(M), 1), nC(M) + 1));
    else if (a === 'sepmode') {
      // switching keeps the circuit as it looks: the new measure starts from the spacing it has now
      const axis = b.dataset.axis, between = b.dataset.v === 'pitch';
      if (sepOf(axis).between !== between) edit(() => setSep(axis, sepNow(axis, between), between));
    }
    else if (!s) return;
    else if (a === 'rowabove') { edit(() => insertRow(M, s.r1)); E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'rowbelow') { edit(() => insertRow(M, s.r2 + 1)); E.sel = { r1: s.r2 + 1, c1: s.c1, r2: s.r2 + 1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'rowdel') edit(() => { deleteRows(M, s.r1, s.r2); if (!nR(M)) E.sel = null; });
    else if (a === 'colbefore') { edit(() => insertCol(M, s.c1)); E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'colafter') { edit(() => insertCol(M, s.c2 + 1)); E.sel = { r1: s.r1, c1: s.c2 + 1, r2: s.r1, c2: s.c2 + 1 }; draw(); renderProps(); }
    else if (a === 'colleft' || a === 'colright') {
      const d = a === 'colleft' ? -1 : 1;
      if (d < 0 ? s.c1 === 0 : s.c2 >= nC(M) - 1) return;
      edit(() => moveCols(M, s.c1, s.c2, d));
      E.sel = { r1: s.r1, c1: s.c1 + d, r2: s.r2, c2: s.c2 + d }; draw(); renderProps();
    }
    else if (a === 'coldel') edit(() => { deleteCols(M, s.c1, s.c2); if (!nC(M)) E.sel = null; });
    else if (a === 'drop') { const cell = at(s.r1, s.c1), it = cell.items[+b.dataset.i], { main, comp } = slicePair(cell); edit(() => setItems(cell, cell.items.filter((x) => x !== it && !(it === main && x === comp)))); }
    else if (a === 'sl') { const cell = at(s.r1, s.c1); edit(() => setSliceMode(cell, cell.items[+b.dataset.i], b.dataset.v)); }
    else if (a === 'gl') { const g = gref(b.dataset.g); if (g) edit(() => { setGroupMode(g.it, b.dataset.v, groupLow(g.it)); g.cell.dirty = true; }); }
    else if (a === 'gb') { const g = gref(b.dataset.g); if (g) edit(() => { setStyle(g.it, 'color', ''); setStyle(g.it, 'draw', b.dataset.v === '0' ? 'none' : ''); g.cell.dirty = true; }); renderProps(); }
    else if (a === 'gdrop') { const g = gref(b.dataset.g); if (g) edit(() => setItems(g.cell, g.cell.items.filter((x) => x !== g.it))); }
    else if (a === 'wt') { const cell = at(s.r1, s.c1); edit(() => { cell.items[+b.dataset.i].a[0] = b.dataset.v; cell.dirty = true; }); }
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const R = nR(E.M), C = nC(E.M);
    count.textContent = `${R} wire${R === 1 ? '' : 's'} · ${C} step${C === 1 ? '' : 's'}`;
    if (document.activeElement === codeTa) return;
    const c = snap();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    const L = Q.layout({ src: c, size: E.st.size, font: E.st.font });
    codeMsg.innerHTML = L.warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    clampSel(); draw(); keepInView(); renderProps();
    const L = Q.layout({ src: codeTa.value, size: E.st.size, font: E.st.font });
    codeMsg.innerHTML = L.warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; } // never the browser's Save Page
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return; // a label popup handles its own keys
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation(); // the main editor's shortcuts stay off while this is open
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) { if (e.key === 'Enter' && e.target.matches('#qcModal .cz-props input')) e.target.blur(); return; }
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    const b = selBox();
    if (mod && e.key === 'a') { e.preventDefault(); if (nR(E.M) && nC(E.M)) { E.sel = { r1: 0, c1: 0, r2: nR(E.M) - 1, c2: nC(E.M) - 1 }; draw(); renderProps(); } return; }
    if (mod && (e.key === 'c' || e.key === 'x') && b) {
      e.preventDefault();
      E.clip = [];
      for (let r = b.r1; r <= b.r2; r++) { const row = []; for (let c = b.c1; c <= b.c2; c++) row.push(JSON.parse(JSON.stringify(at(r, c)))); E.clip.push(row); }
      if (e.key === 'x') clearSel();
      return;
    }
    if (mod && e.key === 'v' && b && E.clip) {
      e.preventDefault();
      edit(() => { ensure(E.M, b.r1 + E.clip.length, b.c1 + E.clip[0].length); E.clip.forEach((row, i) => row.forEach((cell, j) => { E.M.rows[b.r1 + i][b.c1 + j] = JSON.parse(JSON.stringify(cell)); })); });
      E.sel = { r1: b.r1, c1: b.c1, r2: b.r1 + E.clip.length - 1, c2: b.c1 + E.clip[0].length - 1 }; draw(); renderProps();
      return;
    }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clearSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if (e.key === 'Enter' && single()) { e.preventDefault(); const f = $('[data-f]', props); if (f) { f.focus(); f.select && f.select(); } return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const R = nR(E.M), C = nC(E.M);
      if (!R || !C) return;
      const s = E.sel || { r1: 0, c1: 0, r2: 0, c2: 0 }, dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const f = (v, n) => Math.max(0, Math.min(n - 1, v));
      if (e.shiftKey && E.sel) E.sel = { ...s, r2: f(s.r2 + dr, R), c2: f(s.c2 + dc, C) };
      else { const r = f(s.r2 + dr, R), c = f(s.c2 + dc, C); E.sel = { r1: r, c1: c, r2: r, c2: c }; }
      draw(); renderProps(); return;
    }
    const k = KEYS[e.key.toLowerCase()] || (e.key === '=' ? 'targ' : null);
    const s = single();
    if (k && s) { e.preventDefault(); put(k, s.r1, s.c1, true); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // Ctrl+S: write the circuit back to the page (one undo step there) and keep editing; Esc then has nothing to discard
  function save() {
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = E.codeAt != null && document.activeElement === codeTa ? codeTa.value : snap();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    flashSaved();
  }
  let savedT = 0;
  function flashSaved() { setTip('Saved to the page'); clearTimeout(savedT); savedT = setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500); }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.js, beforeunload)
  TD.unsaved.push(() => !!E && snap() !== E.start);
  async function finish(ok) {
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = E.codeAt != null && document.activeElement === codeTa ? codeTa.value : snap();
    const changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this circuit?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, view: { ox: 0, oy: 0, k: 1.5 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, ghost: null, st: { size: block.size || 'normalsize', font: block.font || 'default' }, codeAt: null, codeTimer: null, clip: null };
    // an untouched circuit hands its own text back
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    requestAnimationFrame(fit);
  }
  TD.qcEditor = { open };
})();
