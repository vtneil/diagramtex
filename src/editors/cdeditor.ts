import { captions } from '../i18n/messages';
import { bindCaption, message, onLocale, t } from '../i18n';
import FormPanel from '../ui/FormPanel.svelte';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { row, switchRow, section } from '../ui/forms';
import type { FormRow, FormSection } from '../ui/forms';
import { field, numField, note } from '../ui/editor-fields';
import CdeditorFrame from '../ui/editors/CdeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// CD editor: the overlay that opens on a commutative diagram. A palette of objects and arrow styles; the
// diagram drawn over its grid of cells, where objects are typed or dropped and moved, and arrows are
// dragged from cell to cell; the selected cell's or arrow's properties; and beside them the tikz-cd code,
// live both ways. Only the cells that change are rewritten, so hand-written code keeps its form.
// TD.cdEditor.open(block, onDone, X) — block: { src }; onDone({ src }) on Done. X (TD.xy) edits xymatrix code
// instead: the model stays tikz-cd code, read from and written back to the xy dialect.
(function () {
  let titleCaption: (() => void) | undefined, localeOff: (() => void) | undefined;
  const D = TD.cd, Z = TD.zx;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const MM = TD.PX_PER_CM / 10;

  // ---------------------------------------------------------------- palette
  const cdw = (body: any) => `\\begin{tikzcd}${body}\\end{tikzcd}`;
  const OBJECTS = [
    ['A', 'A'], ['X', 'X'], ['zero', '0'], ['one', '1'], ['Z', '\\mathbb{Z}'], ['R', '\\mathbb{R}'], ['bullet', '\\bullet'], ['cdots', '\\cdots'],
    ['times', 'A \\times B'], ['oplus', 'A \\oplus B'], ['otimes', 'A \\otimes B'], ['hom', '\\operatorname{Hom}(A, B)'], ['ker', '\\ker f'], ['coker', '\\operatorname{coker} f'], ['pi1', '\\pi_1(X)'], ['FX', 'F(X)'],
  ];
  // arrow styles: [key, name, options]
  const STYLES: [string, string, string[]][] = [
    ['to', 'Arrow', []], ['mapsto', 'Maps to', ['mapsto']], ['hook', 'Inclusion', ['hook']], ['two heads', 'Onto', ['two heads']],
    ['tail', 'Into', ['tail']], ['dashed', 'Dashed', ['dashed']], ['Rightarrow', 'Implies', ['Rightarrow']], ['equal', 'Equal', ['equal']],
    ['leftrightarrow', 'Both ways', ['leftrightarrow']], ['dash', 'Line', ['dash']], ['harpoon', 'Harpoon', ['harpoon']], ['squiggly', 'Squiggly', ['squiggly']],
  ];
  const STYLE = Object.fromEntries<any>(STYLES.map(([k, n, o]) => [k, { k, name: n, items: o }]));
  // the styles' names as shown (STYLES keeps the English for search)
  const styleName = (k: string): string => ({
    to: () => t('editor.cd.style.to', 'Arrow'), mapsto: () => t('editor.cd.style.mapsto', 'Maps to'), hook: () => t('editor.cd.style.hook', 'Inclusion'),
    'two heads': () => t('editor.cd.style.twoHeads', 'Onto'), tail: () => t('editor.cd.style.tail', 'Into'), dashed: () => t('ui.dashed', 'Dashed'),
    Rightarrow: () => t('editor.cd.style.implies', 'Implies'), equal: () => t('editor.cd.style.equal', 'Equal'), leftrightarrow: () => t('editor.cd.style.both', 'Both ways'),
    dash: () => t('editor.cd.style.dash', 'Line'), harpoon: () => t('editor.cd.style.harpoon', 'Harpoon'), squiggly: () => t('editor.cd.style.squiggly', 'Squiggly'),
  } as Record<string, () => string>)[k]?.() ?? (STYLE[k] ? STYLE[k].name : k);
  const OBJ = Object.fromEntries<any>(OBJECTS.map(([k, t]) => [k, t]));
  // An arrow's style is two independent choices: its head (the pictures) and its line (solid, dashed, dotted,
  // squiggly). A picture replaces only the head, a line only the line, so neither undoes the other.
  const LINE_KINDS = ['dashed', 'dotted', 'squiggly'];
  const isLine = (x: any) => LINE_KINDS.includes(Z.styleOf(x).name);
  const isHead = (x: any) => !isLine(x) && !!TD.CD_HEADS[Z.styleOf(x).name];
  const HEAD_STYLES = STYLES.filter(([, , o]) => !(o as any).some((x: any) => LINE_KINDS.includes(x)));
  const headKey = (items: any) => {
    const h = items.filter(isHead).join(',');
    const st = HEAD_STYLES.find(([, , o]) => (o as any).join(',') === h);
    return st ? st[0] : h ? '' : 'to';
  };
  const lineOf = (items: any) => { const x = items.find(isLine); return x ? Z.styleOf(x).name : ''; };
  // the palette's pick for an arrow: a line style (Dashed, Squiggly) sets the line, any other the head
  const paletteKey = (items: any) => { const l = lineOf(items), h = headKey(items); return l && STYLE[l] && h === 'to' ? l : h; };
  function applyStyle(a: any, k: any) {
    const o = STYLE[k].items;
    if (o.length && o.every((x: any) => LINE_KINDS.includes(x))) a.items = a.items.filter((x: any) => !isLine(x)).concat(o);
    else a.items = o.concat(a.items.filter((x: any) => !isHead(x)));
  }
  const SEP_OPTS = () => [['', t('ui.normal', 'Normal')]].concat(TD.CD_SEPS.filter((x: any) => x !== 'normal').map((x: any) => [x, x[0].toUpperCase() + x.slice(1)]));
  const XY_SEPS = () => [['', t('editor.cd.sepNormalXy', 'Normal (2pc)')], ['.5pc', '0.5pc'], ['1pc', '1pc'], ['1.5pc', '1.5pc'], ['3pc', '3pc'], ['4pc', '4pc']];

  // ---------------------------------------------------------------- model
  // M: { wrapped, env, amp, rows: [{ cells: [cell], sep }] }; cell: { text, sep (the &[…] before it), t (its
  // maths), arrows: [{ dirs, items, cmd }], dirty }. A cell is written from t + arrows only once it is dirty.
  function parseCell(text: any, sep = '') {
    const p = D.cell(text);
    return { text: text.trim(), sep, t: p.t, node: p.node, arrows: p.arrows, dirty: false };
  }
  const emptyCell = () => ({ text: '', sep: '', t: '', arrows: [], dirty: false });
  const isEmpty = (c: any) => !c || (!c.text && !c.t && !c.arrows.length);
  function load(src: any) {
    const t = String(src || '');
    const { env, inner } = D.unwrap(t);
    const amp = /ampersand replacement/.test(env);
    const g = Z.grid(inner, amp), C = Math.max(0, ...g.map((r: any) => r.cells.length));
    let rows = g.map((r: any) => { const cells = r.cells.map((c: any) => parseCell(c.text, c.colSep)); while (cells.length < C) cells.push(emptyCell()); return { cells, sep: r.rowSep || '' }; });
    if (rows.length === 1 && rows[0].cells.every(isEmpty)) rows = [];
    // arrows between two cells written by position (quiver puts them all in the last cell: from=1-1, to=1-2) move into
    // their source cell as \arrow[r] …; the ones that end at a name (a 2-cell) stay put, after the labels naming them
    rows.forEach((row: any, r: any) => row.cells.forEach((cell: any, c: any) => {
      cell.arrows = cell.arrows.filter((a: any) => {
        if (a.dirs) return true;
        let from = [r, c], to = [r, c], ok = true;
        const rest = a.items.filter((x: any) => {
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
  const nR = (M: any) => M.rows.length, nC = (M: any) => (M.rows[0] ? M.rows[0].cells.length : 0);
  function arrowCode(a: any) {
    const o = a.items.length ? `[${a.items.join(', ')}]` : '';
    // a shortcut (\rar …) stays one while it still points its way
    if (a.cmd && Z.ARROWS[a.cmd] && Z.ARROWS[a.cmd] === a.dirs) return `\\${a.cmd}${o}`;
    return `\\arrow[${[a.dirs, ...a.items].filter(Boolean).join(', ')}]`;
  }
  const cellText = (c: any) => (c.dirty ? [c.node != null ? `|[${c.node}]|` : '', c.t, ...c.arrows.map(arrowCode)].filter(Boolean).join(' ') : c.text);
  // the code, with the & signs lined up
  function codeOf(M: any) {
    const R = nR(M), C = nC(M);
    const amp = M.amp ? '\\&' : '&';
    const parts = M.rows.map((row: any) => row.cells.map((c: any, i: any) => { const t = cellText(c); return (i ? `${amp}${c.sep ? `[${c.sep}]` : ''}${t ? ' ' : ''}` : '') + t; }));
    // trailing empty cells go, unless an arrow ends there (tikz-cd needs the node)
    const hit = new Set();
    M.rows.forEach((row: any, r: any) => row.cells.forEach((c: any, i: any) => c.arrows.forEach((a: any) => { const m = !a.dirs && a.items.map((x: any) => /^(?:from|to)\s*=\s*([rlud]+)\s*$/.exec(x)).find(Boolean); const [dr, dc] = delta(m ? m[1] : a.dirs); hit.add(`${r + dr},${i + dc}`); })));
    parts.forEach((p: any, r: any) => { while (p.length > 1 && /^\\?&\s*$/.test(p[p.length - 1]) && !hit.has(`${r},${p.length - 1}`)) p.pop(); });
    const w: any[] = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...parts.map((p: any) => (p[c] || '').length));
    const lines = parts.map((p: any, r: any) => '  ' + p.map((t: any, c: any) => (c < p.length - 1 ? t.padEnd(w[c]) + ' ' : t)).join('').replace(/\s+$/, '') + (r < R - 1 ? ` \\\\${M.rows[r].sep ? `[${M.rows[r].sep}]` : ''}` : M.trail || ''));
    const body = R ? lines.join('\n') : '';
    return M.wrapped ? `${M.pre || ''}\\begin{tikzcd}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{tikzcd}${M.post || ''}` : body;
  }
  const delta = D.delta;
  const dirsOf = (dr: any, dc: any) => (dc > 0 ? 'r'.repeat(dc) : 'l'.repeat(-dc)) + (dr > 0 ? 'd'.repeat(dr) : 'u'.repeat(-dr));
  const same = (a: any, b: any) => delta(a).join() === delta(b).join(); // ddll and lldd point the same way
  // Cells move to new places (map: [r, c] → [r, c] or null); every arrow keeps (or drops) its two ends.
  function remap(M: any, map: any, R2: any, C2: any) {
    const out = Array.from<any, any>({ length: R2 }, () => ({ cells: Array.from<any, any>({ length: C2 }, emptyCell), sep: '' }));
    M.rows.forEach((row: any, r: any) => {
      row.cells.forEach((cell: any, c: any) => {
        const to = map(r, c);
        if (!to) return;
        const keep = [];
        for (const a of cell.arrows) {
          if (!a.dirs) {
            // from=… / to=…: the other end, moved with its cell
            const k = a.items.findIndex((x: any) => /^(from|to)\s*=\s*[rlud]+\s*$/.test(x));
            if (k < 0) { keep.push(a); continue; }
            const m = /^(from|to)\s*=\s*([rlud]+)/.exec(a.items[k]), [dr, dc] = delta(m![2]), t = map(r + dr, c + dc);
            const d = t && dirsOf(t[0] - to[0], t[1] - to[1]);
            if (!d) { cell.dirty = true; continue; }
            if (!same(d, m![2])) { a.items[k] = `${m![1]}=${d}`; cell.dirty = true; }
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
  const insertRow = (M: any, at: any) => remap(M, (r: any, c: any) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r >= at ? r + 1 : r, c] : null), nR(M) + 1, Math.max(1, nC(M)));
  const deleteRows = (M: any, a: any, b: any) => { const n = b - a + 1; remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (r >= a && r <= b) ? null : [r > b ? r - n : r, c]), nR(M) - n, nC(M)); };
  const insertCol = (M: any, at: any) => remap(M, (r: any, c: any) => (r < nR(M) && c < nC(M) && r >= 0 && c >= 0 ? [r, c >= at ? c + 1 : c] : null), Math.max(1, nR(M)), nC(M) + 1);
  const deleteCols = (M: any, a: any, b: any) => { const n = b - a + 1; remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) || (c >= a && c <= b) ? null : [r, c > b ? c - n : c]), nR(M), nC(M) - n); if (!nC(M)) M.rows = []; };
  function ensure(M: any, R: any, C: any) {
    while (nR(M) < R) M.rows.push({ cells: Array.from<any, any>({ length: Math.max(nC(M), 1) }, emptyCell), sep: '' });
    while (nC(M) < C) for (const r of M.rows) r.cells.push(emptyCell());
  }
  const touch = (c: any) => { c.dirty = true; };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'cdModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, CdeditorFrame);
  document.body.appendChild(root);
  const svg = $('.ce-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.commonA.elements', 'Elements'), listClass: 'ce-list', onpick: (k) => (k.startsWith('s:') ? pickStyle(k.slice(2)) : pick(k)) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  for (const [action, axis] of [['addrow', 'row'], ['addcol', 'col']]) {
    const button = $('[data-ce="' + action + '"]', root);
    button.addEventListener('pointerenter', () => {
      if (!E || E.drag || !nR(E.M) || !nC(E.M)) return;
      E.hover = axis === 'row' ? { r: nR(E.M), c: 0 } : { r: 0, c: nC(E.M) }; draw();
    });
    button.addEventListener('pointerleave', () => { if (E && !E.drag) { E.hover = null; draw(); } });
  }

  // ---------------------------------------------------------------- state
  // { M, sel, arrow: [r, c, i] | null, arm, style (for new arrows), view, undo, redo, pending, start, done, drag, hover, ghost, codeAt, codeTimer, clip, G }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  const snap = () => codeOf(E.M);
  // the code as the block keeps it: tikz-cd, or xymatrix in the xy dialect, keeping the comments last written
  const out = () => (E.typed = keepComments(E.typed, E.X ? E.X.fromCd(snap()) : snap()));
  const layoutOf = (src: any) => (E.X ? E.X.layout : D.layout)({ src });
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => out(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); commit(); clampSel(); draw(); keepInView(); renderProps(); }
  function keepInView() {
    const G = E.G, r = rect(), v = E.view;
    if (!G) return;
    const x1 = v.ox + G.xs[0] * v.k, x2 = v.ox + G.xs[G.xs.length - 1] * v.k, y1 = v.oy + G.ys[0] * v.k, y2 = v.oy + G.ys[G.ys.length - 1] * v.k;
    if (x1 < 0 || y1 < 0 || x2 > r.width || y2 > r.height) fit();
  }
  function restore(code: any) { E.typed = code; E.M = load(E.X ? E.X.toCd(code) : code); clampSel(); draw(); renderProps(); updateTools(); }
  const at = (r: any, c: any) => (E.M.rows[r] && E.M.rows[r].cells[c]) || null;
  const arrowOf = (w: any) => { const c = w && at(w[0], w[1]); return c ? c.arrows[w[2]] || null : null; };
  function clampSel() {
    if (E.arrow && !arrowOf(E.arrow)) E.arrow = null;
    const s = E.sel;
    if (!s) return;
    const R = nR(E.M), C = nC(E.M);
    if (!R || !C) { E.sel = null; return; }
    const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
    E.sel = { r1: f(s.r1, R), c1: f(s.c1, C), r2: f(s.r2, R), c2: f(s.c2, C) };
  }
  const selBox = () => { const s = E.sel; return s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }; };
  const single = () => { const b = selBox(); return b && b.r1 === b.r2 && b.c1 === b.c2 ? b : null; };
  const selectCell = (r: any, c: any) => { E.sel = { r1: r, c1: c, r2: r, c2: c }; E.arrow = null; };
  // w.lab: the label clicked (its index among the arrow's labels); the same arrow keeps the one being edited
  const selectArrow = (w: any) => { const same = E.arrow && E.arrow.join() === w.slice(0, 3).join(); E.lab = w.lab != null ? w.lab : same ? E.lab || 0 : 0; E.arrow = w.slice(0, 3); E.sel = null; };

  // ---------------------------------------------------------------- editing
  function place(key: any, r: any, c: any) {
    ensure(E.M, r + 1, c + 1);
    const cell = at(r, c);
    cell.t = OBJ[key]; touch(cell);
  }
  function put(k: any, r: any, c: any, step: any) {
    edit(() => place(k, r, c));
    if (step) { ensure(E.M, r + 1, c + 2); selectCell(r, c + 1); } else selectCell(r, c);
    draw(); renderProps();
  }
  // an arrow from one cell to another, in the style picked in the palette
  function addArrow(r1: any, c1: any, r2: any, c2: any) {
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
  function moveCell(r1: any, c1: any, r2: any, c2: any, copy: any) {
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
    remap(M, (r: any, c: any) => (r < 0 || c < 0 || r >= nR(M) || c >= nC(M) ? null : r === r1 && c === c1 ? [r2, c2] : r === r2 && c === c2 ? [r1, c1] : [r, c]), nR(M), nC(M));
    at(r2, c2).sep = sep2; at(r1, c1).sep = sep1;
  }
  // clearing cells also drops the arrows that reach into them
  function clearCells(b: any) {
    edit(() => {
      const inBox = (r: any, c: any) => r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = at(r, c); if (cell && !isEmpty(cell)) Object.assign(cell, emptyCell(), { sep: cell.sep }); }
      E.M.rows.forEach((row: any, r: any) => row.cells.forEach((cell: any) => {
        const n = cell.arrows.length;
        cell.arrows = cell.arrows.filter((a: any) => { const [dr, dc] = delta(a.dirs); return !inBox(r + dr, row.cells.indexOf(cell) + dc); });
        if (cell.arrows.length !== n) touch(cell);
      }));
    });
  }
  function deleteArrow(w: any) {
    const cell = at(w[0], w[1]);
    if (!cell) return;
    edit(() => { cell.arrows.splice(w[2], 1); touch(cell); });
    E.arrow = null; renderProps(); draw();
  }
  // the arrow turned round: it starts from its old target, its label and bend keep their side on the page
  function reverseArrow(w: any) {
    const a = arrowOf(w);
    if (!a) return;
    const [dr, dc] = delta(a.dirs), r2_ = w[0] + dr, c2 = w[1] + dc;
    let nw = null;
    edit(() => {
      const from = at(w[0], w[1]), to = at(r2_, c2);
      from.arrows.splice(w[2], 1); touch(from);
      a.dirs = dirsOf(-dr, -dc); a.cmd = 'arrow';
      a.items = a.items.map((x: any) => {
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
  // the drawings in the properties panel, at one scale
  function sizeMinis(el: any, maxW: any, maxH: any, top: any) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  const styleMini = (items: any) => TD.cdMini(cdw(` \\arrow[r${items.length ? ', ' + items.join(', ') : ''}] & `), 1e3);
  // objects (data-item) are placed; an arrow style (data-style) restyles the selected arrow, or is the one new arrows get
  function buildPalette() {
    const objsT = t('editor.cd.objects', 'Objects'), arrowsT = t('editor.cd.arrows', 'Arrows');
    const cur = E && E.arrow && arrowOf(E.arrow) ? paletteKey(arrowOf(E.arrow).items) : E ? E.style : 'to';
    pal.render([
      { id: 'objects', title: objsT, items: OBJECTS.map(([k, x]) => ({ id: k, label: '', title: x, alt: k, keywords: `objects ${objsT}`, svg: fitMini(TD.cdMini(cdw(x), 1e3), 64, 34, 2.2) })) },
      { id: 'arrows', title: arrowsT, note: E && E.arrow ? undefined : t('editor.cd.forNewArrows', 'for new arrows'),
        items: STYLES.map(([k, n, o]) => ({ id: `s:${k}`, label: styleName(k), title: `${styleName(k)}${o.length ? ` (${o.join(', ')})` : ''}`, alt: `${k} ${n}`, keywords: `arrows ${arrowsT}`, svg: fitMini(styleMini(o), 64, 34, 2.2), on: cur === k, attrs: { 'data-style': k } })) },
    ], { armed: E?.arm });
  }
  paletteDrag(list, {
    keyboard: true,
    press: (b) => { if (!b.dataset.style) return false; pickStyle(b.dataset.style); return true; },
    pick,
    move: (d, e) => { E.hover = overStage(e) ? cellAt(e) : null; E.ghost = { k: d.k, e: pos(e) }; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      const h = overStage(e) && cellAt(e);
      if (h) { edit(() => place(d.k, h.r, h.c)); selectCell(h.r, h.c); renderProps(); }
      E.hover = null; draw();
    },
  });
  function pick(k: any) {
    const s = single();
    if (s && !E.arm) { put(k, s.r1, s.c1, true); return; }
    if (!nR(E.M) && !E.arm) { put(k, 0, 0, true); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? t('editor.cd.tip.place', '{object}: click a cell to place it. Esc when done.', { object: OBJ[k] }) : '');
  }
  // an arrow style: onto the selected arrow, else the style of the next arrows drawn
  function pickStyle(k: any) {
    if (E.arm) { E.arm = null; draw(); }
    const a = E.arrow && arrowOf(E.arrow);
    if (a) {
      const cell = at(E.arrow[0], E.arrow[1]);
      edit(() => { applyStyle(a, k); touch(cell); });
    } else { E.style = k; setTip(t('editor.cd.tip.newArrows', "New arrows: {style}. Drag from a cell's blue handle to draw one.", { style: styleName(k).toLowerCase() })); }
    buildPalette();
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // The diagram in the renderer's px (empty cells spread to 4mm so they can be picked), cell edges
  // halfway between columns / rows, and one more column and row past the end that grow the grid.
  function geom() {
    const s = { type: 'cd', x: 0, y: 0, src: snap(), color: INK, minCell: 4 * MM };
    const L = (E.X ? E.X.layoutCd : D.layout)(s), R = nR(E.M), C = nC(E.M);
    const pitch = 8 * MM, xs: any[] = [], ys: any[] = [];
    if (L.R && L.C && L.geo) {
      const g = L.geo, colR = (c: any) => g.colL[c] + g.colW[c], rowB = (r: any) => g.rowT[r] + g.rowH[r];
      for (let c = 0; c < L.C; c++) xs.push(c ? (colR(c - 1) + g.colL[c]) / 2 : g.colL[0] - Math.max(g.cs / 2, MM));
      xs.push(colR(L.C - 1) + Math.max(g.cs / 2, MM));
      for (let r = 0; r < L.R; r++) ys.push(r ? (rowB(r - 1) + g.rowT[r]) / 2 : g.rowT[0] - Math.max(g.rs / 2, MM));
      ys.push(rowB(L.R - 1) + Math.max(g.rs / 2, MM));
    } else { xs.push(0); ys.push(0); }
    while (xs.length < C + 1) xs.push(xs[xs.length - 1] + pitch);
    while (ys.length < R + 1) ys.push(ys[ys.length - 1] + pitch);
    xs.push(xs[xs.length - 1] + pitch); ys.push(ys[ys.length - 1] + pitch);
    const cx = (c: any) => (L.geo && c < L.C ? L.geo.cx[c] : (xs[c] + xs[c + 1]) / 2), cy = (r: any) => (L.geo && r < L.R ? L.geo.cy[r] : (ys[r] + ys[r + 1]) / 2);
    return { s, L, xs, ys, R, C, cx, cy };
  }
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [0.5, 14], redraw: () => { draw(); if (Pop) Pop.pop.place(); } });
  const toL = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  function cellAt(e: any) {
    const G = E.G || (E.G = geom()), [x, y] = toL(e);
    const find = (a: any, v: any) => { for (let i = 0; i < a.length - 1; i++) if (v >= a[i] && v < a[i + 1]) return i; return -1; };
    const c = find(G.xs, x), r = find(G.ys, y);
    if (c < 0 || r < 0 || (G.R && G.C && r === G.R && c === G.C)) return null;
    return { r, c };
  }
  // the arrow (or its label) under the pointer, [r, c, i]
  function arrowAt(e: any, px = 5) {
    const G = E.G || (E.G = geom());
    if (!G.L.arrows) return null;
    const [x, y] = toL(e), tol = px / E.view.k;
    for (const l of G.L.labels) if (Math.abs(x - l.x) <= l.w / 2 && Math.abs(y - l.y) <= l.h / 2) return Object.assign(l.src.slice(0, 3), { lab: l.src[3] < 100 ? l.src[3] : null });
    let best = null, bd = tol;
    for (const a of G.L.arrows) for (let i = 0; i <= 32; i++) {
      const p = D.at(a.seg, i / 32), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = a.src; }
    }
    return best;
  }
  // the object (drawn maths) under the pointer
  function nodeAt(e: any, px = 2) {
    const G = E.G || (E.G = geom());
    if (!G.L.nodes) return null;
    const [x, y] = toL(e), p = px / E.view.k;
    for (const n of G.L.nodes) if (Math.abs(x - n.x) <= n.w / 2 + p && Math.abs(y - n.y) <= n.h / 2 + p) return { r: n.cell[0], c: n.cell[1] };
    return null;
  }
  function fit() {
    if (!E) return;
    const G = geom(), r = rect();
    const bb = G.L.bb || { x: 0, y: 0, w: 0, h: 0 };
    const x1 = Math.min(G.xs[0], bb.x) - 4, x2 = Math.max(G.xs[G.xs.length - 1], bb.x + bb.w) + 4;
    const y1 = Math.min(G.ys[0], bb.y) - 4, y2 = Math.max(G.ys[G.ys.length - 1], bb.y + bb.h) + 4;
    E.view = fitView(r, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, { min: 0.8, max: 5 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
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
    if (R && C) {
      out += `<rect class="qe-grow" x="${X(xs[C])}" y="${Y(ys[0])}" width="${r2((xs[C + 1] - xs[C]) * k)}" height="${r2((ys[R] - ys[0]) * k)}"/>`;
      out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[R])}" width="${r2((xs[C] - xs[0]) * k)}" height="${r2((ys[R + 1] - ys[R]) * k)}"/>`;
      const plus = (x: any, y: any) => `<path class="qe-plus" d="M${X(x) - 5},${Y(y)}h10M${X(x)},${Y(y) - 5}v10"/>`;
      out += plus((xs[C] + xs[C + 1]) / 2, (ys[0] + ys[R]) / 2) + plus((xs[0] + xs[C]) / 2, (ys[R] + ys[R + 1]) / 2);
    }
    const box = (r1: any, c1: any, r2_: any, c2: any, cls: any) => `<rect class="${cls}" x="${X(xs[c1])}" y="${Y(ys[r1])}" width="${r2((xs[c2 + 1] - xs[c1]) * k)}" height="${r2((ys[r2_ + 1] - ys[r1]) * k)}"/>`;
    const b = selBox();
    if (b) out += box(b.r1, b.c1, b.r2, b.c2, 'qe-sel ze-sel');
    const h = E.hover, dragging = E.drag && ((E.drag.mode === 'move' && E.drag.moved) || E.drag.mode === 'arrow');
    if (h && (h.r <= R && h.c <= C)) {
      // Match Quantum: the whole growing row/column is the hit target.
      const hb = R && C ? h.r === R ? [R, 0, R, C - 1] : h.c === C ? [0, C, R - 1, C] : [h.r, h.c, h.r, h.c] : [h.r, h.c, h.r, h.c];
      if (E.arm || E.ghost || dragging) out += box(hb[0], hb[1], hb[2], hb[3], 'qe-target');
      else if (!E.drag) out += box(hb[0], hb[1], hb[2], hb[3], 'qe-hover');
    }
    // the selected arrow, as a halo under the drawing
    const sa = E.arrow && L.arrows && L.arrows.find((a: any) => a.src.join() === E.arrow.join());
    if (sa) {
      out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})"><path class="ze-wsel" d="${D.curveD(sa.seg)}" stroke-width="${r2(8 / k)}"/>`;
      // with several labels, only the one the panel edits
      const ar = arrowOf(E.arrow), many = ar && labelsOf(ar).length > 1, li = ar ? labIndex(ar) : 0;
      for (const l of L.labels) if (l.src.slice(0, 3).join() === E.arrow.join() && !(many && l.src[3] < 100 && l.src[3] !== li)) out += `<rect class="ze-wsel" x="${r2(l.x - l.w / 2)}" y="${r2(l.y - l.h / 2)}" width="${r2(l.w)}" height="${r2(l.h)}" stroke-width="${r2(3 / k)}"/>`;
      out += '</g>';
    }
    if (R && C && !L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})">${D.draw({ ...G.s, x: bb.x, y: bb.y }, { paper: PAPER, export: true }, L)}</g>`;
    if (!R || !C || L.empty) out += `<text class="qe-empty" x="${X((xs[0] + xs[Math.max(1, C)]) / 2)}" y="${Y(ys[0]) - 10}">${esc(R && C ? t('editor.cd.empty.cells', 'Type in a cell, or drop an object') : t('editor.cd.empty.start', 'Drop an object here to start'))}</text>`;
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
      const n = L.nodes && L.nodes.find((x: any) => x.cell[0] === knobCell.r && x.cell[1] === knobCell.c);
      const kx = r2(X(G.cx(knobCell.c) + (n ? n.w / 2 : 2 * MM)) + 9), ky = r2(Y(G.cy(knobCell.r)));
      out += `<g class="ze-knob" data-r="${knobCell.r}" data-c="${knobCell.c}"><title>${esc(t('editor.cd.knob', 'Drag to another cell to draw an arrow'))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // the delete gutters left of the rows and above the columns
    E.gut = !E.drag && !E.arm && !E.ghost && R && C ? { sx: xs.map(X), sy: ys.map(Y), R, C, left: X(px1), top: Y(py1) } : null;
    out += TD.gridDel.svg(E.gut, E.del, E.del ? null : E.near, [t('editor.cd.deleteRowN', 'Delete row {n}'), t('editor.cd.deleteColumnN', 'Delete column {n}')]);
    // what is being dragged, under the pointer
    const mv = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if ((E.ghost && E.ghost.k) || mv) {
      const t = E.ghost ? OBJ[E.ghost.k] : at(E.drag.r, E.drag.c).t || '\\bullet';
      const [gx, gy] = E.ghost ? E.ghost.e : E.drag.e;
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${TD.cdMini(cdw(t), 24)}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    // the stage takes no focus itself, so a field still focused would swallow the keys meant for the diagram
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
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
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const dz = TD.gridDel.at(E.gut, sx, sy), h = dz ? null : cellAt(e), n = dz ? null : nodeAt(e, 14);
      const kn = n || (e.target.closest('.ze-knob') ? E.knobAt : null);
      const nr = dz ? null : TD.gridDel.near(E.gut, sx, sy);
      const ch = JSON.stringify(nr) !== JSON.stringify(E.near) || JSON.stringify(dz) !== JSON.stringify(E.del) || JSON.stringify(h) !== JSON.stringify(E.hover) || JSON.stringify(kn) !== JSON.stringify(E.knobAt);
      E.hover = h; E.knobAt = kn; E.del = dz; E.near = nr;
      svg.style.cursor = dz || (!n && arrowAt(e)) || (h && (h.r === nR(E.M) || h.c === nC(E.M))) ? 'pointer' : n ? 'move' : '';
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
      setTip(h && (h.r !== d.r || h.c !== d.c) ? t('editor.cd.tip.arrowTo', 'Arrow to row {row}, column {col}', { row: h.r + 1, col: h.c + 1 }) : t('editor.cd.tip.dropOther', 'Drop on another cell'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true; d.e = [sx, sy]; E.hover = cellAt(e);
      setTip(e.altKey ? t('editor.cd.tip.copyHere', 'Copy to this cell') : t('editor.cd.tip.moveHere', 'Move here; a full cell swaps places. ⌥ copies.'));
      draw(); return;
    }
    if (d.mode === 'range') { const h = cellAt(e); if (h && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); } }
  });
  svg.addEventListener('pointerup', (e: any) => {
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
  function delLine(dz: any) {
    closePop(); E.del = null; E.hover = null; E.knobAt = null; E.sel = null; E.arrow = null; svg.style.cursor = '';
    edit(() => (dz.kind === 'row' ? deleteRows(E.M, dz.i, dz.i) : deleteCols(E.M, dz.i, dz.i))); buildPalette();
  }

  // right-click: rows and columns around the cell (or range) under the pointer; on an arrow, the arrow
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { above: 'rowAbove', below: 'rowBelow', before: 'colBefore', after: 'colAfter', rowdel: 'rowDelete', coldel: 'colDelete', clear: 'clear', del: 'delete', rev: 'reverse', edit: 'edit' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /^(rowdel|coldel|delete|arrowdel)$/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const n = nodeAt(e), w = !n && arrowAt(e);
    if (w) {
      selectArrow(w); draw(); renderProps(); buildPalette();
      menuRows = [mItem('label', t('editor.cd.menu.editLabel', 'Edit Label'), 'edit', 'Enter'), mItem('reverse', t('editor.cd.menu.reverse', 'Reverse Arrow'), 'rev'), '-', mItem('arrowdel', t('editor.cd.menu.deleteArrow', 'Delete Arrow'), 'del', '⌫')];
    } else {
      const h = cellAt(e);
      if (!h || h.r >= nR(E.M) || h.c >= nC(E.M)) { closeMenu(); return; }
      const b = selBox();
      if (!b || h.r < b.r1 || h.r > b.r2 || h.c < b.c1 || h.c > b.c2) selectCell(h.r, h.c);
      draw(); renderProps();
      const s = selBox(), nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
      menuRows = [...(single() ? [mItem('cell', t('editor.cd.menu.editObject', 'Edit Object'), 'edit', 'Enter'), '-' as const] : []), mItem('rowabove', t('editor.commonA.menu.rowAbove', 'Insert Row Above'), 'above'), mItem('rowbelow', t('editor.commonA.menu.rowBelow', 'Insert Row Below'), 'below'), '-', mItem('colbefore', t('editor.commonA.menu.colBefore', 'Insert Column Before'), 'before'), mItem('colafter', t('editor.commonA.menu.colAfter', 'Insert Column After'), 'after'), '-', mItem('rowdel', nr > 1 ? t('editor.commonA.menu.deleteRows', 'Delete {n} Rows', { n: nr }) : t('editor.commonA.menu.deleteRow', 'Delete Row'), 'rowdel'), mItem('coldel', nc > 1 ? t('editor.commonA.menu.deleteCols', 'Delete {n} Columns', { n: nc }) : t('editor.commonA.menu.deleteCol', 'Delete Column'), 'coldel'), '-', mItem('delete', nr * nc > 1 ? t('editor.commonA.menu.clearCells', 'Clear Cells') : t('editor.commonA.menu.clearCell', 'Clear Cell'), 'clear', '⌫')];
    }
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- in-place editors
  // A floating box under the object, or by the arrow's label (TD.input.popup); one undo step each.
  let Pop: any = null;
  function editCell(r: any, c: any, init?: any) {
    if (!TD.input) return false;
    ensure(E.M, r + 1, c + 1);
    const cell = at(r, c);
    closePop();
    begin();
    if (init != null) { cell.t = init; touch(cell); draw(); }
    const me: any = (Pop = { r, c });
    me.pop = TD.input.popup(stage, {
      text: cell.t || '', math: true, bare: true,
      at: () => { const G = E.G || (E.G = geom()), v = E.view, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + v.ox + G.cx(c) * v.k, vr.top - sr.top + v.oy + G.ys[r + 1] * v.k + 8]; },
      onInput: (v: any) => { cell.t = v; touch(cell); draw(); renderProps(); },
      onDone: () => { if (Pop === me) Pop = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // the arrow's labels, { i (in items), L }; E.lab picks the one the panel edits (one past the last: a new label, added once it has text)
  function labelsOf(a: any) { const r: any[] = []; a.items.forEach((x: any, i: number) => { const L = D.label(x); if (L) r.push({ i, L }); }); return r; }
  function labIndex(a: any) { const n = labelsOf(a).length; return Math.max(0, Math.min(E.lab || 0, n)); }
  function firstLabel(a: any) { return labelsOf(a)[labIndex(a)] || null; }
  function setLabel(a: any, fn: any) {
    const f = firstLabel(a);
    const L = f ? f.L : { t: '', swap: false, opts: [] };
    fn(L);
    const code = D.labelCode(L);
    // a label with no text is dropped whole: an empty "" with a side or a place sets nothing
    if (f) { if (!L.t.trim()) a.items.splice(f.i, 1); else a.items[f.i] = code; } else if (L.t.trim()) a.items.push(code);
  }
  function editLabel(w: any) {
    const a = arrowOf(w);
    if (!a || !TD.input) return false;
    const cell = at(w[0], w[1]);
    closePop();
    begin();
    const f = firstLabel(a);
    const me: any = (Pop = { w });
    me.pop = TD.input.popup(stage, {
      text: f ? f.L.t : '', math: true, bare: true,
      at: () => {
        const G = E.G || (E.G = geom()), v = E.view, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
        const ar = G.L.arrows.find((x: any) => x.src.join() === w.join()), lb = G.L.labels.find((l: any) => l.src.slice(0, 3).join() === w.join() && l.src[3] === labIndex(a));
        const p = lb ? { x: lb.x, y: lb.y } : ar ? D.at(ar.seg, 0.5) : { x: G.cx(w[1]), y: G.cy(w[0]) };
        return [vr.left - sr.left + v.ox + p.x * v.k, vr.top - sr.top + v.oy + p.y * v.k + 14];
      },
      onInput: (v: any) => { setLabel(a, (L: any) => { L.t = v; }); touch(cell); draw(); renderProps(); },
      onDone: () => { if (Pop === me) Pop = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function closePop() { if (Pop) Pop.pop.close(); }
  function focusField(name?: string) { const f = $(name ? `[data-f="${name}"]` : '[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const nameOf = (x: any) => Z.styleOf(x).name;
  const find = (a: any, re: any) => a.items.find((x: any) => re.test(nameOf(x)));
  function setItem(a: any, re: any, item: any) { a.items = a.items.filter((x: any) => !re.test(nameOf(x))); if (item) a.items.push(item); }
  // ---- colours: kept in the code as written (a name, a mix, rgb,255:…); a pick writes xcolor's name or rgb,255 expression
  const isLabelCol = (o: any) => { const c = D.colorOpt(o); return !!c && c.key !== 'draw'; };
  // the arrow's own colour (its line; with color= or a name, its labels too): { key, spec, i } or null
  function arrowColor(a: any) { let r = null; a.items.forEach((x: any, i: any) => { if (D.label(x)) return; const o = D.colorOpt(x); if (o && o.key !== 'text') r = { ...o, i }; }); return r; }
  function setArrowColor(a: any, spec: any) {
    const old: any = arrowColor(a);
    const rest = a.items.filter((x: any) => { if (D.label(x)) return true; const o = D.colorOpt(x); return !o || o.key === 'text'; });
    if (spec) {
      // the key the code used stays (quiver's draw= colours the line only); new ones: tikz-cd's colour, xy's @[…] (a line colour)
      const key = old ? old.key : E.X ? 'draw' : 'color';
      const it = D.colorItem(spec, key || 'color');
      rest.splice(old ? Math.min(old.i, rest.length) : rest.length, 0, it);
    }
    a.items = rest;
  }
  // a label's colour: its options' (text=, color=, a name) or a \textcolor round its text
  function labelColor(a: any) {
    const f = firstLabel(a);
    if (!f) return null;
    const o = f.L.opts.filter(isLabelCol).pop();
    return o ? D.colorOpt(o).spec : D.splitColor(f.L.t).spec;
  }
  function setLabelColor(a: any, spec: any) {
    setLabel(a, (L: any) => {
      const w = D.splitColor(L.t), had = L.opts.some(isLabelCol);
      L.opts = L.opts.filter((o: any) => !isLabelCol(o));
      if (w.spec && !had) L.t = D.joinColor(spec, w.body);
      else if (spec) L.opts.push(D.colorItem(spec));
    });
  }
  // an object's colour: |[red]| (tikz-cd) or \textcolor{red}{…} round it (written for xymatrix, and kept where the code has it)
  const objColor = (cell: any) => { const n = D.nodeColor(cell.node); return n ? n.spec : D.splitColor(cell.t).spec; };
  function setObjColor(cell: any, spec: any) {
    const w = D.splitColor(cell.t), n = D.nodeColor(cell.node);
    if (E.X || (w.spec && !n) || (!spec && !n)) cell.t = D.joinColor(spec, w.body);
    if (!E.X && (n || (spec && !w.spec))) {
      const l = Z.opts(cell.node || '').list.filter((x: any) => { const c = D.colorOpt(x); return !c || c.key === 'draw'; });
      if (spec) l.push(D.colorItem(spec));
      cell.node = l.length ? l.join(', ') : null;
    }
    touch(cell);
  }
  const colLabel = (spec: any) => (!spec ? t('ui.default', 'Default') : spec.replace(/^rgb,\s*255\s*:\s*red,\s*(\d+);\s*green,\s*(\d+);\s*blue,\s*(\d+)$/, 'RGB $1, $2, $3'));
  const swatchCss = (spec: any) => { const h = spec && TD.tikzColor(spec); return h ? TD.fillCss(h) : 'transparent'; };

  function openColor(btn: any) {
    const k = btn.dataset.cc, s = single();
    const a = k !== 'obj' && E.arrow ? arrowOf(E.arrow) : null, cell = k === 'obj' ? s && at(s.r1, s.c1) : E.arrow && at(E.arrow[0], E.arrow[1]);
    if (!cell || (k !== 'obj' && !a)) return;
    const get = () => (k === 'obj' ? objColor(cell) : k === 'label' ? labelColor(a) : ((arrowColor(a) || {}) as any).spec || null);
    let started = false;
    const set = (v: any) => {
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
  const POSN = () => [['near start', t('ui.start', 'Start')], ['', t('editor.cd.pos.middle', 'Middle')], ['near end', t('ui.end', 'End')]];
  const POS_RE = /^(at start|very near start|near start|midway|near end|very near end|at end|pos)$/;
  // env options
  const envList = () => Z.opts(E.M.env || '').list;
  function envGet(name: any) { const it = envList().find((x: any) => Z.styleOf(x).name === name); return it ? Z.styleOf(it).arg || '' : null; }
  function envSet(name: any, v: any) {
    const l = envList().filter((x: any) => Z.styleOf(x).name !== name);
    if (v) l.push(`${name}=${v}`);
    E.M.env = l.join(', ');
  }
  function sepRow(label: string, name: string): FormRow {
    const v = envGet(name) || envGet('sep') || '', opts = E.X ? XY_SEPS() : SEP_OPTS();
    const known = opts.some(([k]: string[]) => k === v) || v === 'normal';
    return row(label, { kind: 'select', value: v === 'normal' ? '' : v, attrs: { 'data-f': name }, options: [...opts, ...(known ? [] : [[v, v]])] });
  }
  function renderProps() {
    if (!E) return;
    const M = E.M;
    const show = (sections: FormSection[]) => renderView(props, FormPanel, { sections });
    const sg = (label: string, key: string, current: string, options: string[][], off = false): FormRow => switchRow(label, options.map(([value, text, title]) => ({ text, on: String(current) === String(value), ...(off ? { disabled: true, title: t('editor.cd.addLabelFirst', 'Add a label first') } : title ? { title } : {}), attrs: { 'data-cs': key, 'data-v': value } })));
    const color = (label: string, key: string, spec: string | null, off?: string | false) => row(label, { kind: 'fillColour', none: !spec, label: colLabel(spec), css: swatchCss(spec), attrs: { 'data-cc': key, ...(off ? { disabled: true, title: off } : { title: spec || t('editor.commonA.defaultColour', 'Default colour') }) } });
    if (E.arrow) {
      const a = arrowOf(E.arrow);
      if (!a) { E.arrow = null; renderProps(); return; }
      const [dr, dc] = delta(a.dirs), f = firstLabel(a), L = f ? f.L : { t: '', swap: false, opts: [] }, labs = labelsOf(a), li = labIndex(a);
      const side = L.opts.includes('description') || a.items.includes('description') ? 'on' : L.swap ? 'right' : 'left', p = L.opts.find((x: any) => POS_RE.test(Z.styleOf(x).name)) || '';
      const bend = find(a, /^bend (left|right)$/), shift = find(a, /^shift (left|right)$/), bendSide = bend ? nameOf(bend).slice(5) : '', bendA = bend ? Z.styleOf(bend).arg || '30' : '30', shiftSide = shift ? nameOf(shift).slice(6) : '';
      const sk = headKey(a.items), lk = lineOf(a.items), noLabel = !L.t;
      const none = t('ui.none', 'None'), left = t('ui.left', 'Left'), right = t('ui.right', 'Right');
      const rows: FormRow[] = [];
      // more than one label ("φ" near start, "η" near end): pick the one the fields below edit, or add another
      if (labs.length > 1 || (labs.length && li >= labs.length)) {
        const tabs = Array.from({ length: Math.max(labs.length, li + 1) }, (_, k) => ({ text: String(k + 1), on: k === li, title: labs[k] ? D.splitColor(labs[k].L.t).body : t('editor.cd.newLabel', 'New label'), attrs: { 'data-cs': 'lab', 'data-v': String(k) } }));
        rows.push(switchRow(t('editor.cd.labels', 'Labels'), tabs));
      }
      rows.push(field(t('ui.label', 'Label'), 'label', D.splitColor(L.t).body, { 'data-tx': 'math', placeholder: 'none' }), color(t('ui.colour', 'Colour'), 'arrow', (arrowColor(a) || {} as any).spec || null), color(t('editor.cd.labelColour', 'Label colour'), 'label', labelColor(a), noLabel && t('editor.cd.addLabelFirst', 'Add a label first')), sg(t('editor.cd.side', 'Side'), 'side', side, [['left', left], ['right', right, t('editor.cd.side.swapped', "Swapped (')")], ['on', t('editor.cd.side.on', 'On line'), 'description']], noLabel), sg(t('editor.cd.at', 'At'), 'pos', p, POSN(), noLabel));
      if (f) rows.push({ kind: 'actions', class: 'row', buttons: [{ text: t('editor.cd.addLabel', 'Add Label'), attrs: { 'data-ce': 'addlabel', title: t('editor.cd.addLabelTitle', 'Another label on this arrow, e.g. one near the start and one near the end') } }, { text: t('editor.cd.removeLabel', 'Remove Label'), attrs: { class: 'danger', 'data-ce': 'rmlabel' } }] });
      rows.push({ kind: 'controls', class: 'ze-shapes', controls: HEAD_STYLES.map(([k, , o]) => ({ kind: 'button', text: '', svg: styleMini(o), attrs: { class: 'ze-shape' + (sk === k ? ' on' : ''), 'data-cs': 'style', 'data-v': k, title: styleName(k) } })) },
        sg(t('editor.cd.line', 'Line'), 'line', lk, [['', t('editor.commonA.solid', 'Solid')], ['dashed', t('ui.dashed', 'Dashed')], ['dotted', t('ui.dotted', 'Dotted')], ['squiggly', t('editor.cd.style.squiggly', 'Squiggly')]]));
      if (!E.X) rows.push(sg(t('editor.cd.crossing', 'Crossing'), 'cross', find(a, /^crossing over$/) ? '1' : '', [['', none], ['1', t('editor.cd.crossing.gap', 'Gap'), t('editor.cd.crossing.gapTitle', 'crossing over: a gap where it crosses another arrow')]]));
      rows.push(sg(t('editor.cd.bend', 'Bend'), 'bend', bendSide, [['', none], ['left', left], ['right', right]]));
      if (bendSide && !E.X) rows.push(numField(t('ui.angle', 'Angle'), 'bendA', bendA, '°', { min: '0', max: '90', step: '5' }));
      rows.push(sg(t('editor.cd.shift', 'Shift'), 'shift', shiftSide, [['', none], ['left', left, t('editor.cd.shift.leftTitle', 'shift left: for parallel arrows')], ['right', right, t('editor.cd.shift.rightTitle', 'shift right')]]));
      if (!E.X) rows.push(field(t('ui.options', 'Options'), 'items', a.items.join(', '), { class: 'mono' }));
      rows.push({ kind: 'actions', class: 'row', buttons: [{ text: t('editor.cd.reverse', 'Reverse'), attrs: { 'data-ce': 'reverse' } }, { text: t('editor.cd.menu.deleteArrow', 'Delete Arrow'), attrs: { class: 'danger', 'data-ce': 'arrowdel' } }] });
      show([{ ...section(captions["ui.arrow"], rows, 'sec'), summary: t('editor.cd.arrowSummary', 'row {r1}, col {c1} → row {r2}, col {c2}', { r1: E.arrow[0] + 1, c1: E.arrow[1] + 1, r2: E.arrow[0] + dr + 1, c2: E.arrow[1] + dc + 1 }) }]); sizeMinis(props, 48, 26, 2); return;
    }
    const b = selBox();
    if (!b) {
      const rows = [sepRow(t('editor.cd.rowSep', 'Row sep'), 'row sep'), sepRow(t('editor.cd.colSep', 'Column sep'), 'column sep')];
      if (!E.X) rows.push(field(t('ui.options', 'Options'), 'env', M.env, { class: 'mono', placeholder: t('editor.cd.envPlaceholder', 'e.g. row sep=large') }));
      rows.push(note(t('editor.cd.help', "Type in a cell to write its object. Drag a cell's blue handle to another cell to draw an arrow; click an arrow to label and style it. "), { kbd: 'Enter' }, t('editor.commonA.help.edits', ' edits, '), { kbd: '⌫' }, t('editor.commonA.help.clears', ' clears.')));
      show([{ ...section(captions["ui.diagram"], rows, 'sec'), summary: `${nR(M)} × ${nC(M)}` }]); return;
    }
    if (!single()) { const n = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1); show([section(t('editor.commonA.nCells', '{n} cells', { n }), [note(t('editor.cd.rangeNote', 'Rows {r1}–{r2}, columns {c1}–{c2}. Right-click for rows and columns.', { r1: b.r1 + 1, r2: b.r2 + 1, c1: b.c1 + 1, c2: b.c2 + 1 }))], 'sec')]); return; }
    const cell = at(b.r1, b.c1);
    const sections: FormSection[] = [{ ...section(cell.t ? t('editor.cd.object', 'Object') : t('editor.cd.emptyCell', 'Empty cell'), [field(t('editor.cd.object', 'Object'), 't', D.splitColor(cell.t).body, { 'data-tx': 'math', placeholder: 'empty' }), color(t('ui.colour', 'Colour'), 'obj', objColor(cell), !cell.t && t('editor.cd.typeObjectFirst', 'Type an object first'))], 'sec'), summary: t('editor.cd.cellSummary', 'row {row} · column {col}', { row: b.r1 + 1, col: b.c1 + 1 }) }];
    if (cell.arrows.length) sections.push(section(t('editor.cd.arrowsFromHere', 'Arrows from here'), [{ kind: 'codeButtons', class: 'ze-wires', items: cell.arrows.map((a: any, i: number) => { const [dr, dc] = delta(a.dirs); return { attrs: { 'data-ce': 'pickarrow', 'data-i': i }, label: t('editor.cd.arrowTarget', '→ row {row}, col {col}', { row: b.r1 + dr + 1, col: b.c1 + dc + 1 }), code: E.X ? E.X.arrowXy(a) : arrowCode(a) }; }) }], 'sec'));
    sections.push({ class: 'sec', rows: [field(t('editor.commonA.code', 'Code'), 'code', E.X ? E.X.cellFromCd(cellText(cell)) : cellText(cell), { class: 'mono' })] }); show(sections);
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e: any) => {
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
      if (f === 'items') { const l = Z.opts(t.value).list; const d = l.findIndex((x: any) => /^[rlud]+$/.test(x)); if (d >= 0) l.splice(d, 1); a.items = l; }
      else if (f === 'label') setLabel(a, (L: any) => { L.t = D.joinColor(D.splitColor(L.t).spec, t.value); });
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
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (e: any) => {
    const cc = e.target.closest('[data-cc]');
    if (cc && E && !cc.disabled) { openColor(cc); return; }
    const bt = e.target.closest('[data-cs]');
    if (!bt || !E || !E.arrow) return;
    const f = bt.dataset.cs, v = bt.dataset.v;
    const cell = at(E.arrow[0], E.arrow[1]), a = arrowOf(E.arrow);
    if (!a) return;
    if (f === 'lab') { E.lab = +v; draw(); renderProps(); return; }
    edit(() => {
      if (f === 'style') applyStyle(a, v);
      else if (f === 'line') setItem(a, /^(dashed|dotted|squiggly)$/, v);
      else if (f === 'side') {
        a.items = a.items.filter((x: any) => x !== 'description');
        setLabel(a, (L: any) => { L.opts = L.opts.filter((x: any) => x !== 'description'); L.swap = v === 'right'; if (v === 'on') L.opts.push('description'); });
      } else if (f === 'pos') setLabel(a, (L: any) => { L.opts = L.opts.filter((x: any) => !POS_RE.test(Z.styleOf(x).name)); if (v) L.opts.push(v); });
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
    const b = (e.target! as Element).closest('[data-ce]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ce, b);
  });
  function act(a: any, b?: any) {
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
    else if (a === 'addlabel') { if (E.arrow && arrowOf(E.arrow)) { E.lab = labelsOf(arrowOf(E.arrow)).length; renderProps(); focusField('label'); } }
    else if (a === 'rmlabel') { const w = E.arrow, ar = w && arrowOf(w), f = ar && firstLabel(ar); if (f) { const k = labIndex(ar); edit(() => { ar.items.splice(f.i, 1); touch(at(w[0], w[1])); }); E.lab = Math.min(k, Math.max(0, labelsOf(ar).length - 1)); renderProps(); draw(); } }
    else if (a === 'copy') copyCode(b, codeTa.value);
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
    count.textContent = `${R === 1 ? t('editor.commonA.oneRow', '1 row') : t('editor.commonA.nRows', '{n} rows', { n: R })} · ${C === 1 ? t('editor.commonA.oneColumn', '1 column') : t('editor.commonA.nColumns', '{n} columns', { n: C })}`;
    if (document.activeElement === codeTa) return;
    const c = out();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, layoutOf(c).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(E.X ? E.X.toCd(codeTa.value) : codeTa.value); E.codeAt = codeTa.value;
    clampSel(); draw(); keepInView(); renderProps();
    showCodeNotes(codeMsg, layoutOf(codeTa.value).warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !dock.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      escape: () => {
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.sel || E.arrow) { E.sel = null; E.arrow = null; draw(); renderProps(); buildPalette(); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
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
      edit(() => { ensure(E.M, b.r1 + E.clip.length, b.c1 + E.clip[0].length); E.clip.forEach((rw: any, i: any) => rw.forEach((cell: any, j: any) => { const t = JSON.parse(JSON.stringify(cell)); t.sep = at(b.r1 + i, b.c1 + j).sep; E.M.rows[b.r1 + i].cells[b.c1 + j] = t; })); });
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
      const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
      if (e.shiftKey && E.sel) E.sel = { ...cur, r2: f(cur.r2 + dr, R), c2: f(cur.c2 + dc, C) };
      else selectCell(f(cur.r2 + dr, R), f(cur.c2 + dc, C));
      draw(); renderProps(); buildPalette(); return;
    }
    if (e.key === '0' && !s) { fit(); return; }
    // typing on a cell writes its object
    if (s && e.key.length === 1 && !e.altKey) { e.preventDefault(); editCell(s.r1, s.c1, e.key); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; }, snapshot: () => out(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closePop(); }, discardTitle: () => t('editor.cd.discard', 'Discard changes to this diagram?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, X: any, host?: any) {
    const M = load(X ? X.toCd(block.src) : block.src);
    const lang = X ? 'xymatrix' : 'tikz-cd';
    titleCaption?.();
    titleCaption = bindCaption($('#cdTitle', root), X ? message("editor.xy.title", 'XyMatrix') : message("editor.cd.title", 'Commutative diagram'));
    const ic = TD.blocks.get(X ? 'xy' : 'cd')?.menu.icon;
    if (ic) $('#cdIcon', root).innerHTML = ic;
    $('.cz-code-head span', root).textContent = lang;

    E = { X: X || null, M, sel: null, arrow: null, arm: null, style: 'to', view: { ox: 0, oy: 0, k: 4 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null, clip: null, G: null };
    E.typed = String(block.src || ''); E.start = out();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
    // the chrome built here follows the interface language while the editor is open
    let first = true;
    localeOff?.();
    localeOff = onLocale(() => {
      // after the frame's own (English-id) captions, so the dialect's names win
      queueMicrotask(() => {
        $('[data-ce="copy"]', root).title = t('editor.commonA.copyCode', 'Copy the {lang} code', { lang });
        codeTa.setAttribute('aria-label', t('editor.commonA.langCode', '{lang} code', { lang }));
      });
      if (first) { first = false; return; }
      if (E) { buildPalette(); renderProps(); draw(); }
    });
  }
  TD.cdEditor = { open, dockable: true, close: () => dock.detach() };
})();
