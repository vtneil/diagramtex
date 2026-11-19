import { wheelZoomFactor } from '../ui/wheel-zoom';
import { captions } from '../i18n/messages';
import { t as uiText, message, caption, onLocale } from '../i18n';
import type { FormSection } from '../ui/forms';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import { field, numField, segments, note, actionRow } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import ZxeditorFrame from '../ui/editors/ZxeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
// ZX editor: the overlay that opens on a ZX block. A palette of spiders, boxes and points; the diagram
// drawn by the canvas renderer over its grid of cells, where nodes are dropped and moved and wires are
// dragged from node to node; the selected node's or wire's properties; and beside them the zx-calculus
// code, live both ways. Only the cells that change are rewritten, so hand-written code keeps its form.
// TD.zxEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const Z = TD.zx;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const MM = TD.PX_PER_CM / 10;

  // ---------------------------------------------------------------- palette
  // [key, name, cell code, key shortcut, preview]. Nodes replace the cell's node and keep its wires;
  // 'loop' adds a wire.
  const zxw = (body: any) => `\\begin{ZX}${body}\\end{ZX}`;
  // names are caption descriptors, shown in the interface language when the palette is drawn
  const PAL: any[] = [
    [message('editor.zx.cat.spiders', 'Spiders'), [
      ['z', message('editor.zx.zSpider', 'Z spider'), '\\zxZ{}', 'Z'], ['x', message('editor.zx.xSpider', 'X spider'), '\\zxX{}', 'X'],
      ['za', message('editor.zx.zPhase', 'Z phase'), '\\zxZ{\\alpha}'], ['xa', message('editor.zx.xPhase', 'X phase'), '\\zxX{\\alpha}'],
      ['zm', message('editor.zx.zMinusPhase', 'Z −phase'), '\\zxZ-{\\alpha}'], ['xm', message('editor.zx.xMinusPhase', 'X −phase'), '\\zxX-{\\alpha}'],
      ['zpi', 'Z π', '\\zxZ{\\pi}'], ['xpi', 'X π', '\\zxX{\\pi}'],
      ['zf', 'Z π/2', '\\zxFracZ{\\pi}{2}'], ['xf', 'X π/2', '\\zxFracX{\\pi}{2}'],
      ['zfm', 'Z −π/2', '\\zxFracZ-{\\pi}{2}'], ['xfm', 'X −π/2', '\\zxFracX-{\\pi}{2}'],
    ]],
    [message('editor.zx.cat.boxes', 'Boxes and points'), [
      ['h', message('editor.zx.hadamard', 'Hadamard'), '\\zxH{}', 'H'], ['n', message('editor.zx.point', 'Point'), '\\zxN{}', 'N', zxw('\\zxN{} \\rar & \\zxZ{} \\rar & \\zxN{}')],
      ['in', message('editor.zx.input', 'Input'), '\\zxN{} \\rar', null, zxw('\\zxN{} \\rar &[\\zxwCol] \\zxZ{}')], ['out', message('editor.zx.output', 'Output'), '\\zxN{} \\ar[l]', null, zxw('\\zxZ{} &[\\zxwCol] \\zxN{} \\ar[l]')],
      ['loop', message('editor.zx.loop', 'Loop'), '\\zxLoop{}', 'L', zxw('\\zxZ{} \\zxLoop{}')], ['empty', message('editor.zx.emptyDiagram', 'Empty diagram'), '\\zxEmptyDiagram{}'],
      ['text', message('editor.zx.text', 'Text'), '\\cdots'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, code, key, mini] of items) { ITEM[(k as any)] = { k, name, code, key, mini: mini || zxw(code) }; if (key) KEYS[key.toLowerCase()] = k; }

  // wire shapes offered as pictures; the rest are in a list
  const SHAPES: [string, any][] = [['', message('editor.zx.shape.straight', 'Straight')], ["o'", message('editor.zx.shape.arcUp', 'Arc up')], ['o.', message('editor.zx.shape.arcDown', 'Arc down')], ['-o', message('editor.zx.shape.arcRight', 'Arc right')], ['o-', message('editor.zx.shape.arcLeft', 'Arc left')], [')', message('editor.zx.shape.bendLeft', 'Bend left')], ['(', message('editor.zx.shape.bendRight', 'Bend right')],
    ['s', message('editor.zx.shape.sCurve', 'S-curve')], ['N', message('editor.zx.shape.nCurve', 'N-curve')], ['C', message('editor.zx.shape.roundLeft', 'Round left')], ['C-', message('editor.zx.shape.roundRight', 'Round right')], ["C'", message('editor.zx.shape.roundTop', 'Round top')], ['C.', message('editor.zx.shape.roundBottom', 'Round bottom')]];
  const SHAPE_SET = new Set(TD.ZX_WIRES);
  const LOOP_DIRS = () => [[90, uiText('editor.zx.up', 'Up')], [0, uiText('editor.zx.right', 'Right')], [270, uiText('editor.zx.down', 'Down')], [180, uiText('editor.zx.left', 'Left')]];
  const GAPS = () => [['', uiText('editor.zx.gapDefault', 'Default')], ['\\zxwCol', '\\zxwCol (1mm)'], ['\\zxHCol', '\\zxHCol'], ['\\zxSCol', '\\zxSCol'], ['\\zxWCol', '\\zxWCol (2mm)'], ['\\zxDotsCol', '\\zxDotsCol (3mm)'], ['\\zxNCol', uiText('editor.zx.gapTight', '{cmd} (tight)', { cmd: '\\zxNCol' })], ['\\zxZeroCol', uiText('editor.zx.gapNone', '{cmd} (none)', { cmd: '\\zxZeroCol' })]];

  // ---------------------------------------------------------------- model
  // M: { wrapped, env, rows: [{ cells: [cell], sep }] }; cell: { text, sep (the &[…] before it), node, edges,
  // rest, opaque, dirty }. A cell is written from node + edges + rest only once it is dirty.
  function parseCell(text: any, sep = '') {
    let opaque = false;
    const p = Z.cell(text, () => (opaque = true));
    return { text: text.trim(), sep, node: p.node, edges: p.edges, rest: p.rest, opaque, dirty: false };
  }
  const emptyCell = () => ({ text: '', sep: '', node: null, edges: [], rest: '', opaque: false, dirty: false });
  const isEmpty = (c: any) => !c || (!c.text && !c.node && !c.edges.length && !c.rest);
  function load(src: any) {
    const t = String(src || '');
    const { env, inner } = Z.unwrap(t);
    const amp = /(^|,)\s*(amp|ampersand replacement)/.test(env);
    const g = Z.grid(Z.expandShortcuts(inner), amp), C = Math.max(0, ...g.map((r: any) => r.cells.length));
    let rows = g.map((r: any) => { const cells = r.cells.map((c: any) => parseCell(c.text, c.colSep)); while (cells.length < C) cells.push(emptyCell()); return { cells, sep: r.rowSep || '' }; });
    if (rows.length === 1 && rows[0].cells.every(isEmpty)) rows = [];
    return { wrapped: /\\begin\{ZX\}/.test(t) || !t.trim(), env, amp, rows };
  }
  const nR = (M: any) => M.rows.length, nC = (M: any) => (M.rows[0] ? M.rows[0].cells.length : 0);
  const optsCode = (list: any) => (list.length ? `[${list.join(', ')}]` : '');
  function nodeCode(n: any) {
    const o = n.o ? `[${n.o}]` : '';
    if (n.k === 'Z' || n.k === 'X') return `\\zx${n.k}${o}${n.star ? '*' : ''}${n.minus ? '-' : ''}{${n.phase || ''}}`;
    if (n.frac) return `\\zxFrac${n.k}${o}${n.minus ? '-' : ''}{${n.num}}${n.numP != null ? `[${n.numP}]` : ''}${n.denP != null ? `[${n.denP}]` : ''}{${n.den}}`;
    if (n.k === 'H') return `\\zxH${o}{}`;
    if (n.k === 'N') return `\\${n.cmd || 'zxN'}${n.v || ''}${o}{}`;
    if (n.k === 'E') return '\\zxEmptyDiagram{}';
    return n.t || '';
  }
  function edgeCode(e: any) {
    if (e.loop) {
      const st = e.styles.length, op = st || e.open !== 20, dr = op || e.dir !== 90;
      return `\\zxLoop${dr ? `[${e.dir}]` : ''}${op ? `[${e.open}]` : ''}${st ? `[${e.styles.join(', ')}]` : ''}{}`;
    }
    // a shortcut (\rar …) stays one while it still points its way
    if (e.cmd && Z.ARROWS[e.cmd] && Z.ARROWS[e.cmd] === e.dirs) return `\\${e.cmd}${optsCode(e.styles)}`;
    if (!e.styles.length) { const sc = Object.keys(Z.ARROWS).find((k) => Z.ARROWS[k] === e.dirs && /^[rlud]ar$/.test(k)); if (sc && e.isNew) return `\\${sc}`; }
    return `\\ar${optsCode([e.dirs, ...e.styles])}`;
  }
  const cellText = (c: any) => (c.dirty ? [c.node ? nodeCode(c.node) : '', ...c.edges.map(edgeCode), c.rest].filter(Boolean).join(' ') : c.text);
  // the code, with the & signs lined up
  function codeOf(M: any) {
    const R = nR(M), C = nC(M);
    const parts = M.rows.map((row: any) => row.cells.map((c: any, i: any) => (i ? `&${c.sep ? `[${c.sep}]` : ''} ` : '') + cellText(c)));
    // trailing empty cells go
    for (const p of parts) { while (p.length > 1 && /^&\s*$/.test(p[p.length - 1])) p.pop(); }
    const w: any[] = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...parts.map((p: any) => (p[c] || '').length));
    const lines = parts.map((p: any, r: any) => '  ' + p.map((t: any, c: any) => (c < p.length - 1 ? t.padEnd(w[c]) + ' ' : t)).join('').replace(/\s+$/, '') + (r < R - 1 ? ` \\\\${M.rows[r].sep ? `[${M.rows[r].sep}]` : ''}` : ''));
    const body = R ? lines.join('\n') : '';
    return M.wrapped ? `\\begin{ZX}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{ZX}` : body;
  }
  // wires as absolute links: [r, c, i] → target [r, c]
  const delta = (dirs: any) => { let dr = 0, dc = 0; for (const ch of dirs || '') { if (ch === 'r') dc++; else if (ch === 'l') dc--; else if (ch === 'd') dr++; else if (ch === 'u') dr--; } return [dr, dc]; };
  const dirsOf = (dr: any, dc: any) => (dc > 0 ? 'r'.repeat(dc) : 'l'.repeat(-dc)) + (dr > 0 ? 'd'.repeat(dr) : 'u'.repeat(-dr));
  // Cells move to new places (map: [r, c] → [r, c] or null); every wire keeps (or drops) its two ends.
  function remap(M: any, map: any, R2: any, C2: any) {
    const out = Array.from<any, any>({ length: R2 }, () => ({ cells: Array.from<any, any>({ length: C2 }, emptyCell), sep: '' }));
    M.rows.forEach((row: any, r: any) => {
      row.cells.forEach((cell: any, c: any) => {
        const to = map(r, c);
        if (!to) return;
        if (!cell.opaque) {
          const keep = [];
          for (const e of cell.edges) {
            if (e.loop || !e.dirs) { keep.push(e); continue; }
            const [dr, dc] = delta(e.dirs), t = map(r + dr, c + dc);
            if (!t) { cell.dirty = true; continue; }
            const d = dirsOf(t[0] - to[0], t[1] - to[1]);
            if (!d) { cell.dirty = true; continue; }
            if (d !== e.dirs) { e.dirs = d; cell.dirty = true; }
            keep.push(e);
          }
          cell.edges = keep;
        }
        out[to[0]].cells[to[1]] = cell;
      });
      const t = map(r, 0);
      if (t && row.sep && !out[t[0]].sep) out[t[0]].sep = row.sep;
    });
    M.rows = out;
  }
  const insertRow = (M: any, at: any) => remap(M, (r: any, c: any) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r >= at ? r + 1 : r, c] : null), nR(M) + 1, Math.max(1, nC(M)));
  const deleteRows = (M: any, a: any, b: any) => { const n = b - a + 1; remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (r >= a && r <= b) ? null : [r > b ? r - n : r, c]), nR(M) - n, nC(M)); };
  const insertCol = (M: any, at: any) => remap(M, (r: any, c: any) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r, c >= at ? c + 1 : c] : null), Math.max(1, nR(M)), nC(M) + 1);
  const deleteCols = (M: any, a: any, b: any) => { const n = b - a + 1; remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (c >= a && c <= b) ? null : [r, c > b ? c - n : c]), nR(M), nC(M) - n); if (!nC(M)) M.rows = []; };
  function ensure(M: any, R: any, C: any) {
    while (nR(M) < R) M.rows.push({ cells: Array.from<any, any>({ length: Math.max(nC(M), 1) }, emptyCell), sep: '' });
    while (nC(M) < C) for (const r of M.rows) r.cells.push(emptyCell());
  }
  const touch = (c: any) => { c.dirty = true; c.opaque = false; };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'zxModal';
  root.className = 'modal';
  root.hidden = true;
  // three-bar icons: outlined bars stay, the filled one is inserted (offset to where it goes) or deleted (with a ×)
  mountFrame(root, ZxeditorFrame);
  document.body.appendChild(root);
  const svg = $('.ze-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.qc.searchElements', 'Search elements'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'ze-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  for (const [action, axis] of [['addrow', 'row'], ['addcol', 'col']]) {
    const button = $('[data-ze="' + action + '"]', root);
    button.addEventListener('pointerenter', () => {
      if (!E || E.drag || !nR(E.M) || !nC(E.M)) return;
      E.hover = axis === 'row' ? { r: nR(E.M), c: 0 } : { r: 0, c: nC(E.M) }; draw();
    });
    button.addEventListener('pointerleave', () => { if (E && !E.drag) { E.hover = null; draw(); } });
  }

  // ---------------------------------------------------------------- state
  // { M, sel: {r1, c1, r2, c2} | null, wire: [r, c, i] | null, arm, view, undo, redo, pending, start, done, drag, hover, ghost, codeAt, codeTimer, clip, G }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snap = () => codeOf(E.M);
  function begin() { if (E.pending == null) E.pending = snap(); }
  function commit() {
    if (E.pending == null) return;
    const now = snap();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
    dock.changed();
  }
  function edit(fn: any) { begin(); fn(); commit(); clampSel(); draw(); keepInView(); renderProps(); }
  function keepInView() {
    const G = E.G, r = rect(), v = E.view;
    if (!G) return;
    const x1 = v.ox + G.xs[0] * v.k, x2 = v.ox + G.xs[G.xs.length - 1] * v.k, y1 = v.oy + G.ys[0] * v.k, y2 = v.oy + G.ys[G.ys.length - 1] * v.k;
    if (x1 < 0 || y1 < 0 || x2 > r.width || y2 > r.height) fit();
  }
  function restore(code: any) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snap()); restore(E.undo.pop()); dock.changed(); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snap()); restore(E.redo.pop()); dock.changed(); }
  const at = (r: any, c: any) => (E.M.rows[r] && E.M.rows[r].cells[c]) || null;
  const wireOf = (w: any) => { const c = w && at(w[0], w[1]); return c && !c.opaque ? c.edges[w[2]] || null : null; };
  function clampSel() {
    if (E.wire && !wireOf(E.wire)) E.wire = null;
    const s = E.sel;
    if (!s) return;
    const R = nR(E.M), C = nC(E.M);
    if (!R || !C) { E.sel = null; return; }
    const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
    E.sel = { r1: f(s.r1, R), c1: f(s.c1, C), r2: f(s.r2, R), c2: f(s.c2, C) };
  }
  const selBox = () => { const s = E.sel; return s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }; };
  const single = () => { const b = selBox(); return b && b.r1 === b.r2 && b.c1 === b.c2 ? b : null; };
  const selectCell = (r: any, c: any) => { E.sel = { r1: r, c1: c, r2: r, c2: c }; E.wire = null; };
  const selectWire = (w: any) => { E.wire = w; E.sel = null; };

  // ---------------------------------------------------------------- editing
  // put a palette element in a cell: a node replaces the cell's node, a loop is added to it
  function place(key: any, r: any, c: any) {
    const it = ITEM[key], M = E.M;
    ensure(M, r + 1, c + 1);
    const cell = at(r, c), add = Z.cell(it.code, () => {});
    if (cell.opaque) Object.assign(cell, { node: null, edges: [], rest: '' });
    if (key === 'loop') {
      if (!cell.node) cell.node = { k: 'Z', o: '', phase: '' };
      cell.edges.push(...add.edges);
    } else {
      cell.node = add.node;
      // a stub brings its wire, unless the cell has one that way already
      for (const e of add.edges) {
        const [dr, dc] = delta(e.dirs);
        if (!cell.edges.some((x: any) => x.dirs === e.dirs)) { cell.edges.push(e); ensure(M, r + Math.max(0, dr) + 1, c + Math.max(0, dc) + 1); }
      }
    }
    touch(cell);
  }
  function put(k: any, r: any, c: any, step: any) {
    edit(() => place(k, r, c));
    if (step) { ensure(E.M, r + 1, c + 2); selectCell(r, c + 1); } else selectCell(r, c);
    draw(); renderProps();
  }
  // a wire from one cell to another; an empty end gets a point (\zxN{}) so LaTeX has a node to reach
  function addWire(r1: any, c1: any, r2: any, c2: any) {
    if (r1 === r2 && c1 === c2) return null;
    let w = null;
    edit(() => {
      ensure(E.M, Math.max(r1, r2) + 1, Math.max(c1, c2) + 1);
      const a = at(r1, c1), b = at(r2, c2);
      if (a.opaque) Object.assign(a, parseCell(''));
      for (const [cell] of [[a], [b]]) if (!cell.node) { if (cell.opaque) Object.assign(cell, parseCell('')); cell.node = { k: 'N', v: '', cmd: 'zxN', o: '' }; touch(cell); }
      a.edges.push({ dirs: dirsOf(r2 - r1, c2 - c1), styles: [], cmd: 'ar', isNew: true });
      touch(a);
      w = [r1, c1, a.edges.length - 1];
    });
    selectWire(w); draw(); renderProps();
    return w;
  }
  // move (or copy) a cell; wires keep their other ends
  function moveCell(r1: any, c1: any, r2: any, c2: any, copy: any) {
    const M = E.M;
    ensure(M, r2 + 1, c2 + 1);
    if (copy) {
      const src = JSON.parse(JSON.stringify(at(r1, c1)));
      // a copy keeps its wires' targets when they are still in the diagram
      const keep = [];
      for (const e of src.edges) {
        if (e.loop) { keep.push(e); continue; }
        const [dr, dc] = delta(e.dirs), tr = r1 + dr, tc = c1 + dc;
        if (tr === r2 && tc === c2) continue;
        if (tr < 0 || tc < 0 || tr >= nR(M) || tc >= nC(M)) continue;
        e.dirs = dirsOf(tr - r2, tc - c2); keep.push(e);
      }
      src.edges = keep; touch(src);
      const dst = at(r2, c2);
      src.sep = dst.sep;
      M.rows[r2].cells[c2] = src;
      return;
    }
    const sep1 = at(r1, c1).sep, sep2 = at(r2, c2).sep;
    remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) ? null : r === r1 && c === c1 ? [r2, c2] : r === r2 && c === c2 ? [r1, c1] : [r, c]), nR(M), nC(M));
    // the column gaps (&[…]) stay with their columns
    at(r2, c2).sep = sep2; at(r1, c1).sep = sep1;
  }
  // clearing cells also drops the wires that reach into them
  function clearCells(b: any) {
    edit(() => {
      const inBox = (r: any, c: any) => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = at(r, c); if (cell && !isEmpty(cell)) Object.assign(cell, emptyCell(), { sep: cell.sep }); }
      E.M.rows.forEach((row: any, r: any) => row.cells.forEach((cell: any, c: any) => {
        if (cell.opaque) return;
        const n = cell.edges.length;
        cell.edges = cell.edges.filter((e: any) => { if (e.loop) return true; const [dr, dc] = delta(e.dirs); return !inBox(r + dr, c + dc); });
        if (cell.edges.length !== n) touch(cell);
      }));
    });
  }
  function deleteWire(w: any) {
    const cell = at(w[0], w[1]);
    if (!cell) return;
    edit(() => { cell.edges.splice(w[2], 1); touch(cell); });
    E.wire = null; renderProps(); draw();
  }
  function deleteSel() { if (E.wire) deleteWire(E.wire); else { const b = selBox(); if (b) clearCells(b); } }

  // ---------------------------------------------------------------- palette
  // the drawings in the properties panel, at one scale
  function sizeMinis(el: any, maxW: any, maxH: any, top: any) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      // the shown name, the English one and the category's find it; one scale for every drawing, so nodes keep the
      // same size, and wide ones shrink to fit
      items: items.map(([k, label, kw, key]: any) => ({ id: k, label: caption(label), key, alt: label.fallback, keywords: `${kw} ${caption(cat)} ${cat.fallback}`, svg: fitMini(TD.zxMini(ITEM[k].mini, 1e3), 64, 40, 2.4) })),
    })), { armed: E?.arm });
  }
  // click: into the selected cell (then step right), or arm it for clicking cells; drag: drop on a cell
  let palDrag: any = null;
  // the keyboard's click (Enter or Space on a focused item) chooses it, as a tap does
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e: any) => {
    if (!palDrag) return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (palDrag.moved) { E.hover = overStage(e) ? cellAt(e) : null; E.ghost = { k: palDrag.k, e: pos(e) }; draw(); }
  });
  list.addEventListener('pointerup', (e: any) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    if (!d.moved) { pick(d.k); return; }
    const h = overStage(e) && cellAt(e);
    if (h) { edit(() => place(d.k, h.r, h.c)); selectCell(h.r, h.c); renderProps(); }
    E.hover = null; draw();
  });
  list.addEventListener('pointercancel', () => { palDrag = null; if (E) { E.ghost = null; E.hover = null; draw(); } });
  function pick(k: any) {
    E.tool = 'select'; E.wireStart = null; updateTools();
    const s = single();
    if (s && !E.arm) { put(k, s.r1, s.c1, k !== 'loop'); return; }
    if (!nR(E.M) && !E.arm) { put(k, 0, 0, k !== 'loop'); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? uiText('editor.zx.armTip', '{name}: click a cell to place it. Esc when done.', { name: caption(ITEM[k].name) }) : '');
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // The diagram in the renderer's px (points and empty cells spread to 2mm so they can be picked), cell
  // edges halfway between columns / rows, and one more column and row past the end that grow the grid.
  function geom() {
    const s = { type: 'zx', x: 0, y: 0, src: snap(), color: INK, minCell: 2 * MM };
    const L = Z.layout(s), R = nR(E.M), C = nC(E.M);
    const pitch = 5 * MM, xs: any[] = [], ys: any[] = [];
    if (L.R && L.C && L.geo) {
      const g = L.geo, colR = (c: any) => g.colL[c] + g.colW[c], rowB = (r: any) => g.rowT[r] + g.rowH[r];
      for (let c = 0; c < L.C; c++) xs.push(c ? (colR(c - 1) + g.colL[c]) / 2 : g.colL[0] - Math.max(g.cs, MM));
      xs.push(colR(L.C - 1) + Math.max(g.cs, MM));
      for (let r = 0; r < L.R; r++) ys.push(r ? (rowB(r - 1) + g.rowT[r]) / 2 : g.rowT[0] - Math.max(g.rs, MM));
      ys.push(rowB(L.R - 1) + Math.max(g.rs, MM));
    } else { xs.push(0); ys.push(0); }
    while (xs.length < C + 1) xs.push(xs[xs.length - 1] + pitch);
    while (ys.length < R + 1) ys.push(ys[ys.length - 1] + pitch);
    xs.push(xs[xs.length - 1] + pitch); ys.push(ys[ys.length - 1] + pitch);
    const cx = (c: any) => (L.geo && c < L.C ? L.geo.cx[c] : (xs[c] + xs[c + 1]) / 2), cy = (r: any) => (L.geo && r < L.R ? L.geo.cy[r] : (ys[r] + ys[r + 1]) / 2);
    return { s, L, xs, ys, R, C, cx, cy };
  }
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e: any) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  const pos = (e: any) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toL = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  function cellAt(e: any) {
    const G = E.G || (E.G = geom()), [x, y] = toL(e);
    const find = (a: any, v: any) => { for (let i = 0; i < a.length - 1; i++) if (v >= a[i] && v < a[i + 1]) return i; return -1; };
    const c = find(G.xs, x), r = find(G.ys, y);
    if (c < 0 || r < 0 || (G.R && G.C && r === G.R && c === G.C)) return null; // the corner past both ends
    return { r, c };
  }
  // the wire under the pointer, [r, c, i]
  function wireAt(e: any, px = 5) {
    const G = E.G || (E.G = geom());
    if (!G.L.wires) return null;
    const [x, y] = toL(e), tol = px / E.view.k;
    let best = null, bd = tol;
    for (const w of G.L.wires) for (const sg of w.segs) for (let i = 0; i <= 24; i++) {
      const p = Z.at(sg, i / 24), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = w.src; }
    }
    return best;
  }
  // the node (drawn shape) under the pointer
  function nodeAt(e: any, px = 3) {
    const G = E.G || (E.G = geom());
    if (!G.L.nodes) return null;
    const [x, y] = toL(e), p = px / E.view.k;
    for (const n of G.L.nodes) {
      if (!n.cell) continue;
      const w = Math.max(n.w, 2 * MM), h = Math.max(n.h, 2 * MM);
      if (Math.abs(x - n.x) <= w / 2 + p && Math.abs(y - n.y) <= h / 2 + p) return { r: n.cell[0], c: n.cell[1] };
    }
    return null;
  }
  function fit() {
    if (!E) return;
    const G = geom(), r = rect();
    const bb = G.L.bb || { x: 0, y: 0, w: 0, h: 0 };
    const x1 = Math.min(G.xs[0], bb.x) - 4, x2 = Math.max(G.xs[G.xs.length - 1], bb.x + bb.w) + 4;
    const y1 = Math.min(G.ys[0], bb.y) - 4, y2 = Math.max(G.ys[G.ys.length - 1], bb.y + bb.h) + 4;
    const k = Math.max(0.8, Math.min(7, Math.min((r.width - 80) / (x2 - x1), (r.height - 80) / (y2 - y1))));
    E.view = { k, ox: r.width / 2 - ((x1 + x2) / 2) * k, oy: r.height / 2 - ((y1 + y2) / 2) * k };
    draw();
  }
  svg.addEventListener('wheel', (e: any) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(0.5, Math.min(14, v.k * wheelZoomFactor(e)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Lb) Lb.pop.place();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode(); updateTools();
    const G = (E.G = geom()), r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    const X = (x: any) => r2(v.ox + x * k), Y = (y: any) => r2(v.oy + y * k);
    const { xs, ys, R, C, L } = G;
    const bb = L.bb;
    const px1 = Math.min(xs[0], bb.x) - 3, px2 = xs[xs.length - 1] + 2, py1 = Math.min(ys[0], bb.y) - 3, py2 = Math.max(ys[ys.length - 1], bb.y + bb.h) + 2;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><rect class="qe-paper" x="${X(px1)}" y="${Y(py1)}" width="${r2((px2 - px1) * k)}" height="${r2((py2 - py1) * k)}"/>`;
    let rules = '';
    for (let c = 0; c <= C; c++) rules += `M${X(xs[c])},${Y(ys[0])}V${Y(ys[R])}`;
    for (let i = 0; i <= R; i++) rules += `M${X(xs[0])},${Y(ys[i])}H${X(xs[C])}`;
    if (R && C) out += `<path class="qe-rule" d="${rules}"/>`;
    // the growing edges: one more column, one more row
    if (R && C) {
      out += `<rect class="qe-grow" x="${X(xs[C])}" y="${Y(ys[0])}" width="${r2((xs[C + 1] - xs[C]) * k)}" height="${r2((ys[R] - ys[0]) * k)}"/>`;
      out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[R])}" width="${r2((xs[C] - xs[0]) * k)}" height="${r2((ys[R + 1] - ys[R]) * k)}"/>`;
      const plus = (x: any, y: any) => `<path class="qe-plus" d="M${X(x) - 5},${Y(y)}h10M${X(x)},${Y(y) - 5}v10"/>`;
      out += plus((xs[C] + xs[C + 1]) / 2, (ys[0] + ys[R]) / 2) + plus((xs[0] + xs[C]) / 2, (ys[R] + ys[R + 1]) / 2);
    }
    const box = (r1: any, c1: any, r2_: any, c2: any, cls: any) => `<rect class="${cls}" x="${X(xs[c1])}" y="${Y(ys[r1])}" width="${r2((xs[c2 + 1] - xs[c1]) * k)}" height="${r2((ys[r2_ + 1] - ys[r1]) * k)}"/>`;
    // selection under the drawing, so the diagram stays readable
    const b = selBox();
    if (b) out += box(b.r1, b.c1, b.r2, b.c2, 'qe-sel ze-sel');
    const h = E.hover, dragging = E.drag && ((E.drag.mode === 'move' && E.drag.moved) || E.drag.mode === 'wire');
    if (h && (h.r <= R && h.c <= C)) {
      // Match Quantum: the whole growing row/column is the hit target.
      const hb = R && C ? h.r === R ? [R, 0, R, C - 1] : h.c === C ? [0, C, R - 1, C] : [h.r, h.c, h.r, h.c] : [h.r, h.c, h.r, h.c];
      if (E.arm || E.ghost || dragging) out += box(hb[0], hb[1], hb[2], hb[3], 'qe-target');
      else if (!E.drag) out += box(hb[0], hb[1], hb[2], hb[3], 'qe-hover');
    }
    // the selected wire, as a halo under the drawing
    const sw = E.wire && L.wires && L.wires.find((w: any) => w.src.join() === E.wire.join());
    if (sw) {
      out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})"><path class="ze-wsel" d="${sw.segs.map((sg: any, i: any) => (i ? '' : `M${r2(sg.p0.x)},${r2(sg.p0.y)}`) + `C${r2(sg.c1.x)},${r2(sg.c1.y)} ${r2(sg.c2.x)},${r2(sg.c2.y)} ${r2(sg.p1.x)},${r2(sg.p1.y)}`).join('')}" stroke-width="${r2(8 / k)}"/></g>`;
    }
    if (R && C && !L.ops) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})">${Z.draw({ ...G.s, x: bb.x, y: bb.y }, { paper: PAPER, export: true })}</g>`;
    if (!R || !C || L.ops) out += `<text class="qe-empty" x="${X((xs[0] + xs[Math.max(1, C)]) / 2)}" y="${Y(ys[0]) - 10}">${esc(R && C ? uiText('editor.zx.dropInCell', 'Drop a spider in a cell') : uiText('editor.zx.dropToStart', 'Drop a spider here to start'))}</text>`;
    // a wire being drawn
    if ((E.drag && E.drag.mode === 'wire') || E.wireStart) {
      const d = E.drag?.mode === 'wire' ? E.drag : { ...E.wireStart, e: E.pointer || [0, 0] }, x0 = X(G.cx(d.c)), y0 = Y(G.cy(d.r));
      const t = E.hover && (E.hover.r !== d.r || E.hover.c !== d.c) ? [X(G.cx(E.hover.c)), Y(G.cy(E.hover.r))] : d.e;
      out += `<path class="ze-draft" d="M${x0},${y0}L${r2(t[0])},${r2(t[1])}"/>`;
    }
    // the wire knob: a selected (or hovered) node's handle for drawing wires
    const knobCell = !E.drag && !E.ghost && !E.arm && (E.knobAt || (single() && at(single().r1, single().c1) && at(single().r1, single().c1).node ? { r: single().r1, c: single().c1 } : null));
    if (knobCell && L.nodes) {
      const n = L.nodes.find((x: any) => x.cell && x.cell[0] === knobCell.r && x.cell[1] === knobCell.c);
      if (n) {
        const kx = r2(X(n.x + Math.max(n.w, 2 * MM) / 2) + 9), ky = r2(Y(n.y));
        out += `<g class="ze-knob" data-r="${knobCell.r}" data-c="${knobCell.c}"><title>${esc(uiText('editor.zx.knobTitle', 'Drag to another cell to draw a wire'))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
      }
    }
    // the delete gutters left of the rows and above the columns
    E.gut = !E.drag && !E.arm && !E.ghost && R && C ? { sx: xs.map(X), sy: ys.map(Y), R, C, left: X(px1), top: Y(py1) } : null;
    out += TD.gridDel.svg(E.gut, E.del, E.del ? null : E.near, [uiText('editor.zx.deleteRowN', 'Delete row {n}'), uiText('editor.zx.deleteColumnN', 'Delete column {n}')]);
    // what is being dragged, under the pointer
    const mv = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if ((E.ghost && E.ghost.k) || mv) {
      const src = E.ghost ? ITEM[E.ghost.k].mini : `\\begin{ZX}${nodeCode(at(E.drag.r, E.drag.c).node || { k: 'T', t: cellText(at(E.drag.r, E.drag.c)) })}\\end{ZX}`;
      const [gx, gy] = E.ghost ? E.ghost.e : E.drag.e;
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${TD.zxMini(src, 24)}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm || E.tool === 'wire');
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    // the stage takes no focus itself, so a field still focused would swallow the keys meant for the diagram
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    // a double-click is detected here: a redraw between the clicks may replace the target, so a native dblclick can't be relied on
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e); E.pointer = [sx, sy];
    const dz = e.button === 0 && !E.space && TD.gridDel.at(E.gut, sx, sy);
    if (dz) { delLine(dz); return; }
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'wire', r: +kb.dataset.r, c: +kb.dataset.c, e: [sx, sy] }; E.knobAt = null; return; }
    const h = cellAt(e);
    if (E.tool === 'wire' && h) {
      if (E.wireStart) { const from = E.wireStart; E.wireStart = null; if (from.r !== h.r || from.c !== h.c) addWire(from.r, from.c, h.r, h.c); setTip(''); draw(); }
      else { E.drag = { mode: 'wire', r: h.r, c: h.c, e: [sx, sy] }; selectCell(h.r, h.c); draw(); renderProps(); }
      return;
    }
    if (E.arm && h) { put(E.arm, h.r, h.c, false); return; }
    // a node wins over a wire running past it; a wire over the cell around it
    const n = nodeAt(e), w = !n && wireAt(e);
    if (w) { selectWire(w); E.drag = null; draw(); renderProps(); if (dbl) focusField(); return; }
    if (!h) { E.sel = null; E.wire = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps(); return; }
    if (h.r >= nR(E.M) || h.c >= nC(E.M)) { edit(() => ensure(E.M, h.r + 1, h.c + 1)); selectCell(h.r, h.c); draw(); renderProps(); return; }
    if (dbl && single() && single().r1 === h.r && single().c1 === h.c) { if (editPhase(h.r, h.c)) return; }
    if (e.shiftKey && E.sel) { E.sel.r2 = h.r; E.sel.c2 = h.c; E.wire = null; draw(); renderProps(); return; }
    selectCell(h.r, h.c);
    const cell = at(h.r, h.c);
    E.drag = !isEmpty(cell) ? { mode: 'move', r: h.r, c: h.c, sx, sy, e: [sx, sy], moved: false } : { mode: 'range', r: h.r, c: h.c };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    E.pointer = [sx, sy];
    if (!d) {
      const dz = TD.gridDel.at(E.gut, sx, sy), h = dz ? null : cellAt(e), n = dz ? null : nodeAt(e, 14);
      const kn = n && at(n.r, n.c) && at(n.r, n.c).node ? n : e.target.closest('.ze-knob') ? E.knobAt : null;
      const nr = dz ? null : TD.gridDel.near(E.gut, sx, sy);
      const ch = JSON.stringify(nr) !== JSON.stringify(E.near) || JSON.stringify(dz) !== JSON.stringify(E.del) || JSON.stringify(h) !== JSON.stringify(E.hover) || JSON.stringify(kn) !== JSON.stringify(E.knobAt);
      E.hover = h; E.knobAt = kn; E.del = dz; E.near = nr;
      svg.style.cursor = E.tool === 'wire' && !dz ? 'crosshair' : dz || (!n && wireAt(e)) || (h && (h.r === nR(E.M) || h.c === nC(E.M))) ? 'pointer' : n ? 'move' : '';
      if (ch || E.wireStart) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'wire') {
      d.e = [sx, sy]; E.hover = cellAt(e);
      const h = E.hover;
      setTip(h && (h.r !== d.r || h.c !== d.c) ? (h.r >= nR(E.M) || h.c >= nC(E.M) || isEmpty(at(h.r, h.c)) ? uiText('editor.zx.wireToPoint', 'Wire to row {row}, column {col} (a point is added there)', { row: h.r + 1, col: h.c + 1 }) : uiText('editor.zx.wireTo', 'Wire to row {row}, column {col}', { row: h.r + 1, col: h.c + 1 })) : uiText('editor.zx.dropOnOther', 'Drop on another cell'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true; d.e = [sx, sy]; E.hover = cellAt(e);
      setTip(e.altKey ? uiText('editor.zx.copyHere', 'Copy to this cell') : uiText('editor.zx.moveHere', 'Move here; a full cell swaps places. ⌥ copies.'));
      draw(); return;
    }
    if (d.mode === 'range') { const h = cellAt(e); if (h && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); } }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'wire') {
      setTip('');
      const h = cellAt(e);
      if (h && (h.r !== d.r || h.c !== d.c)) addWire(d.r, d.c, h.r, h.c);
      else if (h && E.tool === 'wire') { E.wireStart = { r: d.r, c: d.c }; setTip(uiText('editor.zx.chooseWireEnd', 'Click another cell to connect. Esc cancels.')); }
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
  svg.addEventListener('pointercancel', () => { if (E) { E.drag = null; E.wireStart = null; E.hover = null; E.ghost = null; palDrag = null; setTip(''); draw(); } });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt || E.del || E.near)) { E.hover = null; E.knobAt = null; E.del = null; E.near = null; draw(); } });
  // a click on a delete gutter: that row or column goes, as one undo step
  function delLine(dz: any) {
    closeLabel(); E.del = null; E.hover = null; E.knobAt = null; E.sel = null; E.wire = null; svg.style.cursor = '';
    edit(() => (dz.kind === 'row' ? deleteRows(E.M, dz.i, dz.i) : deleteCols(E.M, dz.i, dz.i)));
  }

  // right-click: rows and columns around the cell (or range) under the pointer; on a wire, the wire
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { above: 'rowAbove', below: 'rowBelow', before: 'colBefore', after: 'colAfter', rowdel: 'rowDelete', coldel: 'colDelete', edit: 'edit', duplicate: 'duplicate', clear: 'clear', del: 'delete', loop: 'loop' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /^(rowdel|coldel|delete|wiredel)$/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const n = nodeAt(e), w = !n && wireAt(e);
    if (w) {
      selectWire(w); draw(); renderProps();
      menuRows = [mItem('wiredel', uiText('editor.zx.deleteWire', 'Delete Wire'), 'del', '⌫')];
    } else {
      const h = cellAt(e);
      if (!h || h.r >= nR(E.M) || h.c >= nC(E.M)) { closeMenu(); return; }
      const b = selBox();
      if (!b || h.r < b.r1 || h.r > b.r2 || h.c < b.c1 || h.c > b.c2) selectCell(h.r, h.c);
      draw(); renderProps();
      const s = selBox(), nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
      menuRows = [...(single() && at(s.r1, s.c1).node ? [mItem('editphase', uiText('editor.zx.editNode', 'Edit Node'), 'edit', 'Enter'), mItem('duplicate', uiText('ui.duplicate', 'Duplicate'), 'duplicate', isMac ? '⌘D' : 'Ctrl+D'), '-' as const] : []), mItem('rowabove', uiText('editor.commonB.insertRowAbove', 'Insert Row Above'), 'above'), mItem('rowbelow', uiText('editor.commonB.insertRowBelow', 'Insert Row Below'), 'below'), '-', mItem('colbefore', uiText('editor.commonB.insertColumnBefore', 'Insert Column Before'), 'before'), mItem('colafter', uiText('editor.commonB.insertColumnAfter', 'Insert Column After'), 'after'), '-', ...(single() && at(s.r1, s.c1).node ? [mItem('loop', uiText('editor.zx.addLoop', 'Add Loop'), 'loop', 'L'), '-' as const] : []), mItem('rowdel', nr > 1 ? uiText('editor.commonB.deleteRows', 'Delete {n} Rows', { n: nr }) : uiText('editor.commonB.deleteRow', 'Delete Row'), 'rowdel'), mItem('coldel', nc > 1 ? uiText('editor.commonB.deleteColumns', 'Delete {n} Columns', { n: nc }) : uiText('editor.commonB.deleteColumn', 'Delete Column'), 'coldel'), '-', mItem('delete', nr * nc > 1 ? uiText('editor.commonB.clearCells', 'Clear Cells') : uiText('editor.commonB.clearCell', 'Clear Cell'), 'clear', '⌫')];
    }
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- phase editor
  // A floating box under the node (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null; // { r, c, pop }
  function editPhase(r: any, c: any) {
    const cell = at(r, c), n = cell && !cell.opaque && cell.node;
    if (!n || !TD.input || !(n.k === 'Z' || n.k === 'X' || n.k === 'T') || n.frac) return false;
    closeLabel();
    begin();
    const me: any = (Lb = { r, c }), f = n.k === 'T' ? 't' : 'phase';
    me.pop = TD.input.popup(stage, {
      text: n[f] || '', math: true, bare: true,
      at: () => labelAt(r, c),
      onInput: (v: any) => { n[f] = v; touch(cell); draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelAt(r: any, c: any) {
    const G = E.G || (E.G = geom()), v = E.view;
    const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + v.ox + G.cx(c) * v.k, vr.top - sr.top + v.oy + G.ys[r + 1] * v.k + 8];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const KIND = (k: string) => (({ Z: () => uiText('editor.zx.zSpider', 'Z spider'), X: () => uiText('editor.zx.xSpider', 'X spider'), H: () => uiText('editor.zx.hadamardBox', 'Hadamard box'), N: () => uiText('editor.zx.point', 'Point'), E: () => uiText('editor.zx.emptyDiagram', 'Empty diagram'), T: () => uiText('editor.zx.text', 'Text') }) as Record<string, () => string>)[k]?.();
  const LABELS = () => [['', uiText('editor.zx.inNode', 'In node')], ['above', uiText('editor.zx.above', 'Above')], ['below', uiText('editor.zx.below', 'Below')], ['left', uiText('editor.zx.left', 'Left')], ['right', uiText('editor.zx.right', 'Right')]];
  const PIL: Record<string, any> = { above: 'pil', below: 'pilb', left: 'pill', right: 'pilr' };
  const PIL_RE = /^(pil|pila|pilb|pilr|pill|phase in label( above| below| right| left)?)$/;
  const PIL_POS: Record<string, any> = { pil: 'above', pila: 'above', pilb: 'below', pilr: 'right', pill: 'left', 'phase in label': 'above', 'phase in label above': 'above', 'phase in label below': 'below', 'phase in label right': 'right', 'phase in label left': 'left' };
  function labelOf(n: any) {
    for (const it of Z.opts(n.o || '').list) { const p = PIL_POS[Z.styleOf(it).name]; if (p) return p; }
    return '';
  }
  function setLabel(n: any, pos: any) {
    const l = Z.opts(n.o || '').list.filter((x: any) => !PIL_RE.test(Z.styleOf(x).name));
    if (pos) l.push(PIL[pos]);
    n.o = l.join(', ');
  }
  const markOf = (e: any) => e.styles.find((x: any) => /^(H|Z|X)$/.test(x.trim())) || '';
  const has = (e: any, re: any) => e.styles.some((x: any) => re.test(Z.styleOf(x).name));
  const shapeOfWire = (e: any) => { const s = e.styles.map((x: any) => Z.styleOf(x)).find((x: any) => SHAPE_SET.has(x.name)); return s ? s.name : ''; };
  function setShape(e: any, name: any) {
    const i = e.styles.findIndex((x: any) => SHAPE_SET.has(Z.styleOf(x).name));
    if (i >= 0) { if (name) e.styles[i] = name; else e.styles.splice(i, 1); } else if (name) e.styles.unshift(name);
  }
  function setFlag(e: any, re: any, add: any, item: any) { e.styles = e.styles.filter((x: any) => !re.test(Z.styleOf(x).name)); if (add) e.styles.push(item); }
  // a small picture of a wire shape, drawn for this wire's own direction
  function shapeMini(dr: any, dc: any, shape: any) {
    const R = Math.abs(dr) + 1, C = Math.abs(dc) + 1, r0 = dr < 0 ? R - 1 : 0, c0 = dc < 0 ? C - 1 : 0;
    const rows = [];
    for (let r = 0; r < R; r++) {
      const cells = [];
      for (let c = 0; c < C; c++) cells.push(r === r0 && c === c0 ? `\\zxZ{} \\ar[${dirsOf(dr, dc)}${shape ? `, ${shape}` : ''}]` : r === r0 + dr && c === c0 + dc ? '\\zxZ{}' : '');
      rows.push(cells.join(' &[\\zxwCol] '));
    }
    return TD.zxMini(`\\begin{ZX}${rows.join(' \\\\[\\zxwRow] ')}\\end{ZX}`, 1e3);
  }
  // Expose the package's spacing without replacing unrelated environment options.
  function spacing(axis: string) {
    let value = '';
    for (const item of Z.opts(E.M.env).list) {
      const { name, arg } = Z.styleOf(item);
      if (name === 'circuit') value = '4mm';
      if (name === 'sep' || name === `${axis} sep` || name === `zx ${axis} sep`) value = arg;
    }
    const m = /^([\d.]+)\s*(mm|cm|pt|bp|in)?$/.exec(value);
    const units: Record<string, number> = { mm: 1, cm: 10, pt: 25.4 / 72.27, bp: 25.4 / 72, in: 25.4 };
    return { value: m ? r2(Number(m[1]) * units[m[2] || 'pt']) : '', placeholder: value || '1.5' };
  }
  function setSpacing(axis: string, value: string) {
    const number = Number(value);
    if (value !== '' && (!Number.isFinite(number) || number < 0)) return;
    const list = Z.opts(E.M.env).list.filter((item: string) => !new RegExp(`^(zx )?${axis} sep$`).test(Z.styleOf(item).name));
    if (value !== '') list.push(`${axis} sep=${number}mm`);
    E.M.env = list.join(', '); if (E.M.env) E.M.wrapped = true;
  }
  function renderProps() {
    if (!E) return;
    props.hidden = false;
    const M = E.M;
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const zs = (label: any, key: any, value: any, options: any) => {
      const result: any = segments(label, key, value, options);
      for (const o of result.options) { o.attrs['data-zs'] = o.attrs['data-fs']; delete o.attrs['data-fs']; }
      return result;
    };
    const selectField = (label: any, key: any, value: any, options: any) => row(label, { kind: 'select' as const, value, options, attrs: { 'data-f': key } });
    if (E.wire) {
      const cell = at(E.wire[0], E.wire[1]), e = wireOf(E.wire);
      if (!e) { E.wire = null; renderProps(); return; }
      if (e.loop) {
        show(uiText('editor.zx.loop', 'Loop'), uiText('editor.commonB.rowColumn', 'row {row} · column {col}', { row: E.wire[0] + 1, col: E.wire[1] + 1 }), [zs(uiText('editor.zx.side', 'Side'), 'loopdir', e.dir, LOOP_DIRS()), numField(uiText('editor.zx.opening', 'Opening'), 'open', e.open, '°', { min: '0', max: '80', step: '5' }), field(uiText('editor.commonB.options', 'Options'), 'wstyles', e.styles.join(', '), { class: 'mono' }), actionRow('ze', 'wiredel', uiText('editor.zx.deleteLoop', 'Delete Loop'))]); return;
      }
      const [dr, dc] = delta(e.dirs), shape = shapeOfWire(e), mark = markOf(e).trim(), more = TD.ZX_WIRES.filter((name: any) => !SHAPES.some(([v]) => v === name));
      const pics = SHAPES.map(([value, label]) => ({ kind: 'button' as const, text: '', svg: shapeMini(dr, dc, value), attrs: { class: 'ze-shape' + (shape === value ? ' on' : ''), 'data-zs': 'shape', 'data-v': value, title: caption(label) + (value ? ` (${value})` : '') } }));
      const flags = [['cl', has(e, /^(cl|classical)$/), uiText('editor.zx.classical', 'Classical'), uiText('editor.zx.classicalTitle', 'Doubled line (cl)')], ['B', has(e, /^(B|bold)$/), uiText('editor.zx.bold', 'Bold'), uiText('editor.zx.boldTitle', 'Thick line (B)')], ['dash', has(e, /^dashed$/), uiText('editor.zx.dashed', 'Dashed'), 'dashed']].map(([key, on, text, title]) => ({ text, title, on: !!on, attrs: { 'data-zs': key, 'data-v': on ? '0' : '1' } }));
      show(uiText('editor.zx.wire', 'Wire'), uiText('editor.zx.wireSummary', 'row {r1}, col {c1} → row {r2}, col {c2}', { r1: E.wire[0] + 1, c1: E.wire[1] + 1, r2: E.wire[0] + dr + 1, c2: E.wire[1] + dc + 1 }), [
        { kind: 'controls' as const, class: 'ze-shapes', controls: pics }, selectField(uiText('editor.zx.moreShapes', 'More shapes'), 'shape', shape && more.includes(shape) ? shape : '', [['', '—'], ...more.map((name: any) => [name, name])]), zs(uiText('editor.zx.marker', 'Marker'), 'mark', mark, [['', uiText('editor.zx.markerNone', 'None')], ['H', uiText('editor.zx.hBox', 'H box')], ['Z', 'Z'], ['X', 'X']]),
        switchRow(captions["ui.line"], flags, { many: true }), field(uiText('editor.commonB.options', 'Options'), 'wstyles', e.styles.join(', '), { class: 'mono' }), actionRow('ze', 'wiredel', uiText('editor.zx.deleteWire', 'Delete Wire')),
      ]); sizeMinis(props, 48, 30, 2); return;
    }
    const b = selBox();
    if (!b) {
      show(uiText('editor.zx.diagram', 'Diagram'), `${nR(M)} × ${nC(M)}`, [...['row', 'column'].map(axis => { const v = spacing(axis); return numField(axis === 'row' ? uiText('editor.zx.rowGap', 'Row gap') : uiText('editor.zx.columnGap', 'Column gap'), `spacing-${axis}`, v.value, 'mm', { min: '0', step: '0.5', placeholder: v.placeholder }); }), field(uiText('editor.commonB.options', 'Options'), 'env', M.env, { class: 'mono', placeholder: uiText('editor.zx.envPlaceholder', 'e.g. row sep=3mm') }), note(uiText('editor.zx.help1', 'Drop spiders from the left into cells. Select a node and drag its blue handle to another cell to draw a wire; click a wire to shape it. Type '), { kbd: 'Z' }, ' ', { kbd: 'X' }, ' ', { kbd: 'H' }, ' ', { kbd: 'N' }, uiText('editor.zx.help2', ' on a cell; '), { kbd: 'Enter' }, uiText('editor.zx.help3', ' edits a phase.'))]); return;
    }
    if (!single()) {
      const count = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
      renderView(props, FormPanel, { sections: [section(uiText('editor.commonB.nCells', '{n} cells', { n: count }), [note(uiText('editor.zx.rangeNote', 'Rows {r1}–{r2}, columns {c1}–{c2}. Right-click for rows and columns.', { r1: b.r1 + 1, r2: b.r2 + 1, c1: b.c1 + 1, c2: b.c2 + 1 }))], 'sec')] }); return;
    }
    const cell = at(b.r1, b.c1), n = !cell.opaque && cell.node, rows = [];
    if (n && (n.k === 'Z' || n.k === 'X')) {
      rows.push(zs(uiText('editor.zx.colour', 'Colour'), 'kind', n.k, [['Z', uiText('editor.zx.zGreen', 'Z (green)')], ['X', uiText('editor.zx.xRed', 'X (red)')]]), zs(uiText('editor.zx.phase', 'Phase'), 'form', n.frac ? 'frac' : 'plain', [['plain', uiText('editor.zx.plain', 'Plain')], ['frac', uiText('editor.zx.fraction', 'Fraction')]]));
      if (n.frac) rows.push(field(uiText('editor.zx.numerator', 'Numerator'), 'num', n.num, { 'data-tx': 'math' }), field(uiText('editor.zx.denominator', 'Denominator'), 'den', n.den, { 'data-tx': 'math' }));
      else rows.push(field(uiText('editor.zx.phase', 'Phase'), 'phase', n.phase, { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }));
      rows.push({ kind: 'controls' as const, class: 'ze-phase-presets', controls: [['', '0'], ['\\pi/2', 'π/2'], ['-\\pi/2', '−π/2'], ['\\pi', 'π']].map(([value, text]) => ({ kind: 'button' as const, text, attrs: { 'data-zs': 'preset', 'data-v': value, title: uiText('editor.zx.setPhase', 'Set phase to {phase}', { phase: text }), 'aria-pressed': String(!n.frac && !n.minus && (n.phase || '') === value) } })) });
      rows.push(zs(uiText('editor.zx.sign', 'Sign'), 'minus', n.minus ? '1' : '0', [['0', '+'], ['1', '−']]), zs(uiText('editor.zx.phaseAt', 'Phase at'), 'label', labelOf(n), LABELS()));
    } else if (n && n.k === 'N') rows.push(zs(uiText('editor.zx.size', 'Size'), 'nv', n.v || '', [['', uiText('editor.zx.point', 'Point')], ['+', uiText('editor.zx.square', 'Square'), uiText('editor.zx.squareTitle', '{cmd}: 2mm both ways', { cmd: '\\zxN+' })], ['-', uiText('editor.zx.wide', 'Wide'), uiText('editor.zx.wideTitle', '{cmd}: 2mm wide', { cmd: '\\zxN-' })], ['|', uiText('editor.zx.tall', 'Tall'), uiText('editor.zx.tallTitle', '{cmd}: 2mm tall', { cmd: '\\zxN|' })]]));
    else if (n && n.k === 'T') rows.push(field(uiText('editor.zx.text', 'Text'), 't', n.t, { 'data-tx': 'math' }));
    else if (!n && !cell.opaque) rows.push(note(uiText('editor.zx.pickHelp', 'Pick an element on the left, or type '), { kbd: 'Z' }, ' ', { kbd: 'X' }, ' ', { kbd: 'H' }, ' ', { kbd: 'N' }, uiText('editor.zx.pickHelpEnd', '.')));
    if (n && n.k !== 'E') rows.push({ ...row(uiText('editor.zx.changeTo', 'Change to'), ...[['Z', 'Z'], ['X', 'X'], ['H', 'H'], ['N', uiText('editor.zx.point', 'Point')]].filter(([key]) => key !== n.k || n.frac).map(([key, text]) => ({ kind: 'button' as const, text, attrs: { 'data-zs': 'conv', 'data-v': key } }))), controlClass: 'ctl ze-conv' });
    if (b.c1 > 0) { const gaps = GAPS(); rows.push(selectField(uiText('editor.zx.gapBefore', 'Gap before'), 'gap', cell.sep || gaps[0][0], [...gaps, ...(cell.sep && !gaps.some(([v]) => v === cell.sep) ? [[cell.sep, cell.sep]] : [])])); }
    const sections: FormSection[] = [{ ...section(cell.opaque ? uiText('editor.zx.customCell', 'Custom cell') : n ? (n.frac ? uiText('editor.zx.kSpider', '{k} spider', { k: n.k }) : KIND(n.k)) : uiText('editor.zx.emptyCell', 'Empty cell'), rows, 'sec'), summary: uiText('editor.commonB.rowColumn', 'row {row} · column {col}', { row: b.r1 + 1, col: b.c1 + 1 }) }];
    if (n && cell.edges.length) sections.push(section(uiText('editor.zx.wiresFromHere', 'Wires from here'), [{ kind: 'codeButtons' as const, class: 'ze-wires', items: cell.edges.map((edge: any, index: any) => { const [dr, dc] = delta(edge.dirs); return { attrs: { 'data-ze': 'pickwire', 'data-i': index }, label: edge.loop ? uiText('editor.zx.loop', 'Loop') : uiText('editor.zx.wireToShort', '→ row {row}, col {col}', { row: b.r1 + dr + 1, col: b.c1 + dc + 1 }), code: edgeCode(edge) }; }) }], 'sec'));
    sections.push({ class: 'sec', rows: [field(uiText('editor.commonB.code', 'Code'), 'code', cellText(cell), { class: 'mono' }), ...(cell.opaque ? [note(uiText('editor.zx.opaqueNote', 'This cell has commands the editor doesn’t draw; they are kept as written.'))] : [])] });
    renderView(props, FormPanel, { sections });
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e: any) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    if (f.startsWith('spacing-')) { if (t.validity.valid) setSpacing(f.slice(8), t.value); draw(); return; }
    if (f === 'env') { E.M.env = t.value; draw(); return; }
    if (E.wire) {
      const cell = at(E.wire[0], E.wire[1]), w = wireOf(E.wire);
      if (!w) return;
      if (f === 'wstyles') w.styles = Z.opts(t.value).list;
      else if (f === 'open') w.open = Math.max(0, parseFloat(t.value) || 0);
      else if (f === 'shape') setShape(w, t.value);
      touch(cell); draw();
      if (f === 'shape') { commit(); renderProps(); }
      return;
    }
    const s = single();
    if (!s) return;
    const cell = at(s.r1, s.c1), n = cell.node;
    if (f === 'code') { Object.assign(cell, parseCell(t.value, cell.sep)); cell.text = t.value.trim(); }
    else if (f === 'gap') { cell.sep = t.value; }
    else if (n && (f === 'phase' || f === 'num' || f === 'den' || f === 't')) { n[f] = t.value; touch(cell); }
    draw();
    if (f === 'gap') { commit(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (e: any) => {
    const bt = e.target.closest('[data-zs]');
    if (!bt || !E) return;
    const f = bt.dataset.zs, v = bt.dataset.v;
    if (E.wire) {
      const cell = at(E.wire[0], E.wire[1]), w = wireOf(E.wire);
      if (!w) return;
      edit(() => {
        if (f === 'shape') setShape(w, v);
        else if (f === 'mark') setFlag(w, /^(H|Z|X)$/, !!v, v);
        else if (f === 'cl') setFlag(w, /^(cl|classical)$/, v === '1', 'cl');
        else if (f === 'B') setFlag(w, /^(B|bold)$/, v === '1', 'B');
        else if (f === 'dash') setFlag(w, /^dashed$/, v === '1', 'dashed');
        else if (f === 'loopdir') w.dir = +v;
        touch(cell);
      });
      return;
    }
    const s = single();
    if (!s) return;
    const cell = at(s.r1, s.c1), n = cell.node;
    if (!n) return;
    edit(() => {
      if (f === 'preset') { n.phase = v; n.minus = false; delete n.frac; delete n.num; delete n.den; delete n.numP; delete n.denP; }
      else if (f === 'kind') n.k = v;
      else if (f === 'minus') n.minus = v === '1';
      else if (f === 'label') setLabel(n, v);
      else if (f === 'nv') n.v = v;
      else if (f === 'form') {
        if (v === 'frac' && !n.frac) { const p = String(n.phase || '').trim(); Object.assign(n, { frac: true, num: p || '\\pi', den: '2' }); delete n.phase; }
        else if (v === 'plain' && n.frac) { const p = `\\frac{${n.num}}{${n.den}}`; delete n.frac; delete n.num; delete n.den; delete n.numP; delete n.denP; n.phase = p; }
      } else if (f === 'conv') {
        const keep = { o: '' };
        if (v === 'Z' || v === 'X') cell.node = { k: v, o: n.o || '', phase: n.frac ? `\\frac{${n.num}}{${n.den}}` : n.phase || '', minus: !!n.minus, star: false };
        else if (v === 'H') cell.node = { k: 'H', ...keep };
        else cell.node = { k: 'N', v: '', cmd: 'zxN', ...keep };
      }
      touch(cell);
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ze="undo"]', root).disabled = !E.undo.length;
    $('[data-ze="redo"]', root).disabled = !E.redo.length;
    $('[data-ze="delete"]', root).disabled = !E.sel && !E.wire;
    for (const tool of ['select', 'wire']) { const b = $(`[data-ze="${tool}"]`, root); const on = E.tool === tool && !E.arm; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-ze]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ze, b);
  });
  function act(a: any, b?: any) {
    const s = selBox(), M = E.M;
    if (a === 'select' || a === 'wire') {
      closeLabel(); E.tool = a; E.arm = null; E.wireStart = null; E.drag = null; E.hover = null;
      buildPalette(); updateTools(); draw();
      setTip(a === 'wire' ? uiText('editor.zx.wireToolTip', 'Drag between cells, or click a start cell and an end cell to connect.') : '');
    }
    else if (a === 'diagram') { act('select'); E.sel = null; E.wire = null; renderProps(); draw(); }
    else if (a === 'editphase' && single()) { if (!editPhase(s.r1, s.c1)) focusField(); }
    else if (a === 'duplicate' && single()) {
      let c = s.c1 + 1; while (c < nC(M) && !isEmpty(at(s.r1, c))) c++;
      edit(() => moveCell(s.r1, s.c1, s.r1, c, true)); selectCell(s.r1, c); draw(); renderProps();
    }
    else if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'wiredel') { if (E.wire) deleteWire(E.wire); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = uiText('ui.copied', 'Copied'); setTimeout(() => (b.textContent = uiText('ui.copy', 'Copy')), 1200); });
    else if (a === 'addrow') edit(() => ensure(M, nR(M) + 1, Math.max(nC(M), 1)));
    else if (a === 'addcol') edit(() => ensure(M, Math.max(nR(M), 1), nC(M) + 1));
    else if (a === 'pickwire' && single()) { selectWire([single().r1, single().c1, +b.dataset.i]); draw(); renderProps(); }
    else if (!s) return;
    else if (a === 'loop') { const r = s.r1, c = s.c1; edit(() => place('loop', r, c)); selectWire([r, c, at(r, c).edges.length - 1]); draw(); renderProps(); }
    else if (a === 'rowabove') { edit(() => insertRow(M, s.r1)); selectCell(s.r1, s.c1); draw(); renderProps(); }
    else if (a === 'rowbelow') { edit(() => insertRow(M, s.r2 + 1)); selectCell(s.r2 + 1, s.c1); draw(); renderProps(); }
    else if (a === 'rowdel') edit(() => { deleteRows(M, s.r1, s.r2); if (!nR(M)) E.sel = null; });
    else if (a === 'colbefore') { edit(() => insertCol(M, s.c1)); selectCell(s.r1, s.c1); draw(); renderProps(); }
    else if (a === 'colafter') { edit(() => insertCol(M, s.c2 + 1)); selectCell(s.r1, s.c2 + 1); draw(); renderProps(); }
    else if (a === 'coldel') edit(() => { deleteCols(M, s.c1, s.c2); if (!nC(M)) E.sel = null; });
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const R = nR(E.M), C = nC(E.M);
    count.textContent = `${R === 1 ? uiText('editor.commonB.oneRow', '1 row') : uiText('editor.commonB.nRows', '{n} rows', { n: R })} · ${C === 1 ? uiText('editor.commonB.oneColumn', '1 column') : uiText('editor.commonB.nColumns', '{n} columns', { n: C })}`;
    if (document.activeElement === codeTa) return;
    const c = snap();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, Z.layout({ src: c }).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    clampSel(); draw(); keepInView(); renderProps();
    showCodeNotes(codeMsg, Z.layout({ src: codeTa.value }).warnings);
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (inEditorMenu(e)) return; // the right-click menu's own keys: arrows, Enter, Esc
    // a focused palette button keeps its own Enter and Space (they click it) instead of the canvas shortcuts
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('.qe-item, .cz-part, [data-cmd], [data-tool], [data-ex]')) return;
    if (!E || root.hidden || dock.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (editorMenuOpen()) { closeMenu(); return; }
      if (E.wireStart || E.drag) { E.wireStart = null; E.drag = null; setTip(''); draw(); return; }
      if (E.tool === 'wire') { act('select'); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel || E.wire) { E.sel = null; E.wire = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    const b = selBox();
    if (mod && e.key === 'a') { e.preventDefault(); if (nR(E.M) && nC(E.M)) { E.sel = { r1: 0, c1: 0, r2: nR(E.M) - 1, c2: nC(E.M) - 1 }; E.wire = null; draw(); renderProps(); } return; }
    if (mod && (e.key === 'c' || e.key === 'x') && b) {
      e.preventDefault();
      E.clip = [];
      for (let r = b.r1; r <= b.r2; r++) { const rw = []; for (let c = b.c1; c <= b.c2; c++) rw.push(JSON.parse(JSON.stringify(at(r, c)))); E.clip.push(rw); }
      if (e.key === 'x') clearCells(b);
      return;
    }
    if (mod && e.key === 'v' && b && E.clip) {
      e.preventDefault();
      edit(() => { ensure(E.M, b.r1 + E.clip.length, b.c1 + E.clip[0].length); E.clip.forEach((rw: any, i: any) => rw.forEach((cell: any, j: any) => { const t = JSON.parse(JSON.stringify(cell)); t.sep = at(b.r1 + i, b.c1 + j).sep; E.M.rows[b.r1 + i].cells[b.c1 + j] = t; })); });
      E.sel = { r1: b.r1, c1: b.c1, r2: b.r1 + E.clip.length - 1, c2: b.c1 + E.clip[0].length - 1 }; draw(); renderProps();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd' && single()) { e.preventDefault(); act('duplicate'); return; }
    if (mod) return;
    if (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'w') { e.preventDefault(); act(e.key.toLowerCase() === 'v' ? 'select' : 'wire'); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const s = single();
    if ((e.key === 'Enter' || e.key === 'F2') && (s || E.wire)) { e.preventDefault(); if (!(s && editPhase(s.r1, s.c1))) focusField(); return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const R = nR(E.M), C = nC(E.M);
      if (!R || !C) return;
      const cur = E.sel || (E.wire ? { r1: E.wire[0], c1: E.wire[1], r2: E.wire[0], c2: E.wire[1] } : { r1: 0, c1: 0, r2: 0, c2: 0 });
      const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
      if (e.shiftKey && E.sel) E.sel = { ...cur, r2: f(cur.r2 + dr, R), c2: f(cur.c2 + dc, C) };
      else selectCell(f(cur.r2 + dr, R), f(cur.c2 + dc, C));
      draw(); renderProps(); return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k && s) { e.preventDefault(); if (k === 'loop') act('loop'); else put(k, s.r1, s.c1, true); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // Ctrl+S: write the diagram back to the page (one undo step there) and keep editing
  function save() {
    if (E && dock.docked()) { commit(); return; }
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snap();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    const saved = uiText('editor.commonB.saved', 'Saved to the page');
    stageNote.flash(saved, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (src/application/app.ts, beforeunload)
  // embedded in a pane (Quick): src/core/editor-session.ts dockable
  const dock = TD.editorSession.dockable({ root, state: () => E, snapshot: () => snap() });
  TD.unsaved.push(() => !!E && !dock.docked() && snap() !== E.start);
  async function finish(ok: any) {
    if (dock.docked()) return;
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    commit();
    const src = snap(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm(uiText('editor.commonB.discardDiagram', 'Discard changes to this diagram?'), uiText('editor.commonB.discardBody', 'Your edits since opening the editor will be lost.'), { ok: uiText('editor.commonB.discard', 'Discard'), danger: true }))) return;
    const done = E.done;
    stopLocale?.(); stopLocale = null;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, tool: 'select', wireStart: null, pointer: null, sel: null, wire: null, arm: null, view: { ox: 0, oy: 0, k: 4 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null, clip: null, G: null };
    // an untouched diagram hands its own text back
    E.start = codeOf(M);
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, panel and drawing's captions follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.zxEditor = { open, dockable: true, close: () => { if (!dock.docked()) return; dock.release(); finish(true); } };
})();
