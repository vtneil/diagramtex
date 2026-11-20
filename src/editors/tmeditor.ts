import { captions } from '../i18n/messages';
import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import TmeditorFrame from '../ui/editors/TmeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
// Timing editor: the overlay that opens on a timing block. A palette of signal values, rows and
// annotations; the table drawn by the canvas renderer on a grid of periods, where transitions are dragged
// along the time axis, values are painted onto rows and arrows are drawn between edges; the selected
// segment's, row's or annotation's properties; and beside them the tikz-timing code, live both ways.
// Untouched code is handed back as written.
// TD.timingEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const T = TD.timing;
  // braces close in order (an escaped \{ or \} doesn't count)
  const balanced = (v: any) => { let d = 0; for (let i = 0; i < v.length; i++) { if (v[i] === '\\') { i++; continue; } if (v[i] === '{') d++; else if (v[i] === '}' && --d < 0) return false; } return d === 0; };
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const U = T.U, STEP = 0.5;

  // ---------------------------------------------------------------- palette
  const tbl = (rows: any, extra = '') => `\\begin{tikztimingtable}${rows.map((r: any) => ` & ${r} \\\\`).join('')}${extra ? `\\extracode ${extra}` : ''}\\end{tikztimingtable}`;
  // names are caption descriptors, shown in the interface language when the palette is drawn
  const PAL: any[] = [
    [message('editor.tm.cat.values', 'Values'), [
      ['v:H', message('editor.tm.high', 'High'), tbl(['L 2H L']), 'H'], ['v:L', message('editor.tm.low', 'Low'), tbl(['H 2L H']), 'L'], ['v:Z', message('editor.tm.highZ', 'High-Z'), tbl(['L 2Z H']), 'Z'],
      ['v:X', message('editor.tm.unknown', 'Unknown'), tbl(['L 2X H']), 'X'], ['v:D', message('editor.tm.data', 'Data'), tbl(['D{} 2D{} D{}']), 'D'], ['v:U', message('editor.tm.unknownData', 'Unknown data'), tbl(['D{} 2U D{}']), 'U'],
      ['v:C', message('editor.tm.clock', 'Clock'), tbl(['6{c}']), 'C'], ['v:T', message('editor.tm.toggle', 'Toggle'), tbl(['4{T}']), 'T'], ['v:M', message('editor.tm.metastable', 'Metastable'), tbl(['L 2M H']), 'M'],
      ['v:G', message('editor.tm.glitch', 'Glitch'), tbl(['2L G 2L']), 'G'], ['v:S', message('editor.tm.gap', 'Gap'), tbl(['H 2S H']), 'S'],
      ['v:UH', message('editor.tm.hatched', 'Hatched'), tbl(['D{} {[timing/u/background/.style={pattern=north east lines}]2U} D{}']), 'W'],
    ]],
    [message('editor.tm.cat.rows', 'Rows'), [
      ['r:clock', message('editor.tm.clockRow', 'Clock row'), tbl(['8{c}'])], ['r:signal', message('editor.tm.signalRow', 'Signal row'), tbl(['L 2H L 2H'])], ['r:bus', message('editor.tm.busRow', 'Bus row'), tbl(['U 2D{} 2D{} U'])],
      ['r:blank', message('editor.tm.blankRow', 'Blank row'), tbl(['L 2H L 2H', '', 'L 2H L 2H'])],
    ]],
    [message('editor.tm.cat.annotations', 'Annotations'), [
      ['a:<->', message('editor.tm.interval', 'Interval'), tbl(['L 4H'], '\\draw[<->] (1,1.6) -- (4,1.6);'), 'I'], ['a:->', message('editor.tm.delay', 'Delay'), tbl(['L 4H'], '\\draw[->] (1,1.6) -- (4,1.6);'), 'A'],
      ['a:mark', message('editor.tm.markerLine', 'Marker line'), tbl(['L 2H 2L'], '\\vertlines[help lines]{1,3}'), 'K'],
      ['a:brk', message('editor.tm.break', 'Break'), tbl(['L 2H 2L'], '\\foreach \\y in {0} {\\fill[white] (2.3,\\y-.2) -- (2.5,\\y+1.2) -- (2.7,\\y+1.2) -- (2.5,\\y-.2) -- cycle; \\draw (2.3,\\y-.2) -- (2.5,\\y+1.2) (2.5,\\y-.2) -- (2.7,\\y+1.2);}'), 'B'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.timing.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = T.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? T.write(M) : M.raw);
  // maths in an annotation label: $x$ → x; written back as $x$
  const mathOf = (t: any) => { t = String(t || '').trim(); const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t: any) => { const v = mathOf(t).trim(); return v ? `$${v}$` : ''; };
  const cfg = () => T.config(E.M);
  const baseOf = (r: any) => -r * cfg().rowdist;
  const spansOf = (r: any) => { const row = E.M.rows[r]; return row ? T.drawRow(row, cfg()).spans : []; };
  const rowEnd = (r: any) => E.M.rows[r].segs.reduce((a: any, s: any) => a + s.w, 0);
  const touch = (row: any) => { row.dirty = true; E.M.dirty = true; };
  const LEVELS = new Set(['H', 'L', 'Z', 'X', 'M', 'S']);
  // merge neighbours that draw as one, drop empty pieces
  function norm(row: any) {
    const out = [];
    for (const s of row.segs) {
      if (s.c !== 'G' && s.w <= 1e-6) { if (s.pre && s.pre.length) (out.length ? out[out.length - 1] : s).pre.push(...s.pre); continue; }
      const p = out[out.length - 1];
      if (p && p.c === s.c && (p.bg || null) === (s.bg || null) && !(s.pre && s.pre.length) && (LEVELS.has(s.c) || ((s.c === 'D' || s.c === 'U') && s.t == null))) { p.w = round(p.w + s.w); continue; }
      out.push(s);
    }
    row.segs = out;
  }
  const round = (n: any) => Math.round(n * 1000) / 1000;
  const seg = (c: any, w: any, t: any = null) => ({ c, w: round(w), t, topt: '', pre: ([] as any[]) });
  // a clock or toggle is a run of steps (one character each), step periods wide
  function fresh(c: any, w: any, step = 1) {
    if (c === 'C' || c === 'T') {
      const out = [], n = Math.floor(w / step + 1e-6);
      for (let k = 0; k < n; k++) out.push(seg(c, step));
      if (w - n * step > 1e-6) out.push(seg(c, w - n * step));
      return out.length ? out : [seg(c, w)];
    }
    if (c === 'G') return [seg('G', 0)];
    return [seg(c, w, c === 'D' ? '' : null)];
  }
  // a and b in periods: [a, b] of the row becomes c
  function paint(row: any, a: any, b: any, c: any) {
    if (b < a) [a, b] = [b, a];
    const end = row.segs.reduce((x: any, s: any) => x + s.w, 0);
    if (a > end + 1e-6) {
      const last = row.segs[row.segs.length - 1];
      if (last && last.c !== 'G' && !(last.c === 'C' || last.c === 'T')) last.w = round(last.w + a - end);
      else row.segs.push(seg('S', a - end));
    }
    // painting next to a clock (or toggle) of the same kind continues it at its step width
    let step = 1;
    if (c === 'C' || c === 'T') {
      let x0 = 0;
      for (const s of row.segs) { const sa = x0, sb = (x0 += s.w); if (s.c === c && (Math.abs(sb - a) < 1e-6 || Math.abs(sa - b) < 1e-6 || (sa < a && sb > a))) { step = s.w; break; } }
    }
    const news = c === 'G' ? fresh('G', 0) : fresh(c, b - a, step), out = [];
    let x = 0, done = false;
    for (const s of row.segs) {
      const sa = x, sb = x + s.w;
      x = sb;
      if (sb <= a + 1e-6 && !(s.c === 'G' && Math.abs(sa - a) < 1e-6 && c !== 'G')) { out.push(s); continue; }
      if (sa >= b - 1e-6 && (c !== 'G' || sa > a + 1e-6)) { if (!done) { out.push(...news); done = true; } out.push(s); continue; }
      if (c === 'G') { // a glitch splits what it lands in
        out.push({ ...s, w: round(a - sa) }); out.push(...news); done = true; out.push({ ...s, w: round(sb - a), pre: [] }); continue;
      }
      if (sa < a - 1e-6) out.push({ ...s, w: round(a - sa) });
      if (!done) { out.push(...news); done = true; }
      if (sb > b + 1e-6) out.push({ ...s, w: round(sb - b), pre: [] });
      else if (s.pre && s.pre.length) news[0].pre.push(...s.pre);
    }
    if (!done) out.push(...news);
    row.segs = out;
    norm(row);
  }
  // a palette value: 'UH' is unknown data, hatched
  function paintVal(row: any, a: any, b: any, v: any) {
    paint(row, a, b, v === 'UH' ? 'U' : v);
    let x = 0;
    for (const sg of row.segs) { const sa = x; x += sg.w; if (sg.c === 'U' || sg.c === 'D') { if (sa >= a - 1e-6 && x <= b + 1e-6) sg.bg = v === 'UH' ? 'pattern=north east lines' : sg.c === v ? sg.bg : null; } }
  }
  function newRowName(base: any) { let n = 1, name = base; while (E.M.rows.some((r: any) => r.name === name)) name = base + ++n; return name; }
  function makeRow(kind: any) {
    const w = Math.max(8, Math.ceil(E.M.rows.reduce((m: any, _: any, r: any) => Math.max(m, rowEnd(r)), 0)));
    const q = Math.max(1, Math.round(w / 4));
    const row = { src: '', name: '', init: null, ropts: null, segs: ([] as any[]), tail: [], dirty: true };
    if (kind === 'blank') return row;
    if (kind === 'clock') { row.name = newRowName('CLK'); row.segs = fresh('C', w); }
    else if (kind === 'bus') { row.name = newRowName('Bus'); row.segs = [seg('U', q), seg('D', q, 'A'), seg('D', q, 'B'), seg('U', w - 3 * q)]; }
    else { row.name = newRowName('Sig'); row.segs = [seg('L', q), seg('H', 2 * q), seg('L', w - 3 * q)]; }
    norm(row);
    return row;
  }
  // table options: one key set, replaced or removed
  function setTopt(key: any, value: any) {
    const i = E.M.topts.findIndex((o: any) => T.kv(o).k === key);
    const it = value == null ? null : `${key}=${value}`;
    if (i >= 0) { if (it) E.M.topts[i] = it; else E.M.topts.splice(i, 1); } else if (it) E.M.topts.push(it);
  }
  const toptOf = (key: any) => { const o = E.M.topts.find((x: any) => T.kv(x).k === key); return o ? T.kv(o).v : null; };
  // annotations
  const tipOpt = (x: any) => x.o.find((it: any) => /^[<>|]*-[<>|]*$/.test(it.trim())) || '-';
  function setTip(x: any, t: any) { x.o = x.o.filter((it: any) => !/^[<>|]*-[<>|]*$/.test(it.trim())); if (t && t !== '-') x.o.unshift(t); }
  const sideOf = (x: any) => ((x.lo.find((it: any) => /^(above|below)$/.test(it.trim())) || 'above').trim());
  function setSide(x: any, s: any) { x.lo = x.lo.filter((it: any) => !/^(above|below|left|right)( (left|right))?$/.test(it.trim())); x.lo.unshift(s); }
  const dashedOf = (x: any) => x.o.some((it: any) => /dashed|dotted/.test(it));
  function setDashed(x: any, on: any) { x.o = x.o.filter((it: any) => !/^(loosely |densely )?(dashed|dotted)$/.test(it.trim())); if (on) x.o.push('dashed'); }
  const xdirty = (x: any) => { x.dirty = true; E.M.dirty = true; };
  // marker lines: the values in a \vertlines list
  const markVals = (x: any) => T.list(x.list, { twidth: '0', nrows: '0' });
  function setMarks(x: any, vals: any) { x.list = vals.map(T.num).join(','); xdirty(x); }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'tmModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, TmeditorFrame);
  document.body.appendChild(root);
  const svg = $('.tm-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'tm-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { r, i } (a segment) | { row } | { x } (an annotation) | { x, j } (a marker) | null, arm, view: { k (px per period), ox, oy },
  //   undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snapCode = () => codeOf(E.M);
  const history = TD.editorSession.history({ state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed() });
  const { begin, commit } = history;
  function undo() { dropPaint(); history.undo(); }
  function redo() { dropPaint(); history.redo(); }
  function edit(fn: any) { begin(); fn(); syncBreaks(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  // a break crosses every row that draws something (not blank rows), at its row's height
  const breakYs = () => E.M.rows.map((row: any, r: any) => (row.segs.length ? -r * cfg().rowdist : null)).filter((y: any) => y != null);
  function syncBreaks() {
    const ys = breakYs();
    for (const x of E.M.ext) if (x.k === 'brk' && x.ys.join() !== ys.join()) { x.ys = ys; xdirty(x); }
  }
  function addBreak(t: any) {
    edit(() => E.M.ext.push({ k: 'brk', t, ys: breakYs(), dirty: true }));
    disarm();
    E.sel = { x: E.M.ext.length - 1 }; draw(); renderProps();
  }
  function restore(code: any) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() {
    const s = E.sel;
    if (!s) return;
    if (s.r != null && (!E.M.rows[s.r] || !E.M.rows[s.r].segs[s.i])) E.sel = null;
    else if (s.row != null && !E.M.rows[s.row]) E.sel = null;
    else if (s.x != null && !E.M.ext[s.x]) E.sel = null;
    else if (s.x != null && s.j != null && !(markVals(E.M.ext[s.x]).length > s.j)) E.sel = null;
  }
  const selSeg = () => (E.sel && E.sel.r != null ? E.M.rows[E.sel.r].segs[E.sel.i] : null);
  // Several segments selected (shift-click, or a drag over empty space): E.many lists them, its anchor E.sel among
  // them. It holds only while E.sel is that anchor, so selecting anything else (which sets a new E.sel) ends it.
  const selSegs = (): { r: number; i: number }[] => {
    if (!E.sel || E.sel.r == null) return [];
    const list = E.many && E.many.anchor === E.sel ? E.many.list : [E.sel];
    return list.filter((s: any) => E.M.rows[s.r] && E.M.rows[s.r].segs[s.i]);
  };
  function selectSegs(list: { r: number; i: number }[], anchor?: any) {
    if (!list.length) { E.sel = null; E.many = null; return; }
    const a = anchor && list.some((s) => s.r === anchor.r && s.i === anchor.i) ? anchor : list[0];
    E.sel = a; E.many = list.length > 1 ? { anchor: a, list } : null;
  }
  // the segments of rows r0…r1 that overlap the times t1…t2
  function segsIn(r0: number, r1: number, t1: number, t2: number) {
    const out: { r: number; i: number }[] = [];
    for (let r = r0; r <= r1; r++) spansOf(r).forEach((sp: any, i: number) => { if (sp.b - sp.a < 1e-6 ? sp.a >= t1 - 1e-6 && sp.a <= t2 + 1e-6 : sp.b > t1 + 1e-6 && sp.a < t2 - 1e-6) out.push({ r, i }); });
    return out;
  }
  // a segment's box on the stage, as the selection draws it
  function segBox(r: number, sp: any) { const base = baseOf(r), [x1, y1] = m(sp.a, base + 1.25), [x2, y2] = m(sp.b, base - 0.25); return { x1: x1 - (sp.b - sp.a < 1e-6 ? 3 : 0), y1, x2: Math.max(x2, x1 + 6), y2 }; }
  // a value for several segments: each painted over its own time, as one edit, and the same times selected after
  function setValues(list: { r: number; i: number }[], c: string) {
    const at = list.map((s) => { const sp = spansOf(s.r)[s.i]; return { r: s.r, a: sp.a, b: sp.b }; });
    edit(() => { for (const x of at) { const row = E.M.rows[x.r]; paintVal(row, x.a, x.b, c); touch(row); } });
    const after: { r: number; i: number }[] = [];
    for (const x of at) spansOf(x.r).forEach((sp: any, i: number) => { if (sp.b > x.a + 1e-6 && sp.a < x.b - 1e-6 && !after.some((q) => q.r === x.r && q.i === i)) after.push({ r: x.r, i }); });
    selectSegs(after); draw(); renderProps();
  }
  const selRow = () => (E.sel && E.sel.row != null ? E.M.rows[E.sel.row] : null);
  const selAnn = () => (E.sel && E.sel.x != null && E.sel.j == null && E.M.ext[E.sel.x] && E.M.ext[E.sel.x].k === 'annot' ? E.M.ext[E.sel.x] : null);
  const selBrk = () => (E.sel && E.sel.x != null && E.sel.j == null && E.M.ext[E.sel.x] && E.M.ext[E.sel.x].k === 'brk' ? E.M.ext[E.sel.x] : null);
  const selMark = () => (E.sel && E.sel.x != null && E.sel.j != null ? E.M.ext[E.sel.x] : null);
  const lay = () => T.layout({ src: snapCode() });
  const snapT = (t: any, on: any) => (on ? Math.round(t / STEP) * STEP : Math.round(t * 20) / 20);
  // painting covers whole periods, so a drag doesn't leave half-period slivers; ⌥ paints freely
  const paintT = (t: any, alt: any) => (alt ? snapT(t, false) : Math.round(t));

  // ---------------------------------------------------------------- editing
  // Arrows are written at fixed heights, so when rows are added, removed or reordered they move with
  // their row: an arrow belongs to the row it is drawn on or in the gap below (above the first row: the first).
  // map(old row) → new row, or -1 when that row is gone (its arrows go too).
  function followRows(n: any, map: any) {
    const rd = cfg().rowdist, rowOf = (y: any) => Math.max(0, Math.min(n - 1, Math.floor((1 - y) / rd)));
    E.M.ext = E.M.ext.filter((x: any) => {
      if (x.k !== 'annot') return true;
      const r1 = rowOf(x.y1), r2 = rowOf(x.y2), n1 = map(r1), n2 = map(r2);
      if (n1 < 0 || n2 < 0) return false;
      if (n1 !== r1 || n2 !== r2) { x.y1 = round(x.y1 + (r1 - n1) * rd); x.y2 = round(x.y2 + (r2 - n2) * rd); xdirty(x); }
      return true;
    });
  }
  // where a new row goes: under the selected row or segment, else at the bottom
  const rowAfterSel = () => (E.sel && E.sel.row != null ? E.sel.row + 1 : E.sel && E.sel.r != null ? E.sel.r + 1 : E.M.rows.length);
  function addRow(kind: any, at = rowAfterSel()) {
    const n = E.M.rows.length;
    edit(() => { E.M.rows.splice(at, 0, makeRow(kind)); followRows(n, (r: any) => (r >= at ? r + 1 : r)); });
    E.sel = { row: at }; draw(); renderProps(); showRow(at);
  }
  function deleteRow(r: any) {
    const n = E.M.rows.length;
    edit(() => { E.M.rows.splice(r, 1); followRows(n, (q: any) => (q === r ? -1 : q > r ? q - 1 : q)); });
    E.sel = null; draw(); renderProps();
  }
  function moveRow(r: any, d: any) {
    const to = r + d, n = E.M.rows.length;
    if (to < 0 || to >= n) return;
    edit(() => { const [row] = E.M.rows.splice(r, 1); E.M.rows.splice(to, 0, row); followRows(n, (q: any) => (q === r ? to : q === to ? r : q)); });
    E.sel = { row: to }; draw(); renderProps();
  }
  function dupRow(r: any) {
    const src = E.M.rows[r], n = E.M.rows.length;
    edit(() => { E.M.rows.splice(r + 1, 0, { ...src, name: src.name ? `${src.name}'` : '', segs: src.segs.map((s: any) => ({ ...s, pre: (s.pre || []).slice() })), tail: (src.tail || []).slice(), dirty: true }); followRows(n, (q: any) => (q > r ? q + 1 : q)); });
    E.sel = { row: r + 1 }; draw(); renderProps(); showRow(r + 1);
  }
  // scroll a row into view when it lands below the visible stage
  function showRow(r: any) {
    const H = rect().height, [, y1] = m(0, baseOf(r) + 1.4), [, y2] = m(0, baseOf(r) - 1.6);
    if (y2 > H - 8) { E.view.oy -= y2 - (H - 8); draw(); } else if (y1 < 24) { E.view.oy += 24 - y1; draw(); }
  }
  // a segment goes, its time to the one before it (or after it); merged afterwards, so remove a row's from the last back
  function removeSeg(row: any, i: any) {
    const s = row.segs[i], prev = row.segs.slice(0, i).reverse().find((x: any) => x.c !== 'G'), next = row.segs.slice(i + 1).find((x: any) => x.c !== 'G');
    row.segs.splice(i, 1);
    if (prev) prev.w = round(prev.w + s.w); else if (next) next.w = round(next.w + s.w);
    if (s.pre && s.pre.length) (row.segs[i] || prev || { pre: row.tail }).pre.push(...s.pre);
  }
  function deleteSeg(r: any, i: any) { deleteSegs([{ r, i }]); }
  function deleteSegs(list: any[]) {
    edit(() => {
      for (const r of new Set(list.map((s: any) => s.r))) {
        const row = E.M.rows[r];
        for (const i of list.filter((s: any) => s.r === r).map((s: any) => s.i).sort((a: any, b: any) => b - a)) removeSeg(row, i);
        norm(row); touch(row);
      }
    });
    E.sel = null; draw(); renderProps();
  }
  function splitSeg(r: any, i: any, t: any) {
    const row = E.M.rows[r], sp = spansOf(r)[i];
    if (!sp || t <= sp.a + 1e-6 || t >= sp.b - 1e-6) return;
    edit(() => {
      const s = row.segs[i], right = { ...s, w: round(sp.b - t), pre: [] };
      if (s.c === 'D') right.t = '';
      s.w = round(t - sp.a);
      row.segs.splice(i + 1, 0, right); touch(row);
    });
    E.sel = { r, i: i + 1 }; draw(); renderProps();
  }
  // the clock (or toggle) a step belongs to: the unbroken run of steps of its kind around it
  function runOf(r: any, i: any) {
    const segs = E.M.rows[r].segs, c = segs[i].c, same = (q: any) => segs[q] && segs[q].c === c;
    let a = i, b = i;
    while (same(a - 1) && !(segs[a].pre && segs[a].pre.length)) a--;
    while (same(b + 1) && !(segs[b + 1].pre && segs[b + 1].pre.length)) b++;
    return { a, b };
  }
  // Clock width: every step of the run that wide, over about the same time (the rest of the row moves along)
  // span: the length to keep (while typing, the clock's length when the field was entered, so each keystroke starts over)
  function setClockWidth(r: any, i: any, cw: any, span: any) {
    const row = E.M.rows[r], { a, b } = runOf(r, i);
    if (span == null) span = row.segs.slice(a, b + 1).reduce((x: any, q: any) => x + q.w, 0);
    const n = Math.max(1, Math.round(span / cw)), c = row.segs[i].c, pre = row.segs[a].pre;
    row.segs.splice(a, b - a + 1, ...Array.from<any, any>({ length: n }, (_, k) => ({ ...seg(c, cw), pre: k ? [] : pre || [] })));
    touch(row);
    return a + Math.min(i - a, n - 1);
  }
  function setValue(r: any, i: any, c: any) {
    const row = E.M.rows[r], sp = spansOf(r)[i];
    if (!sp) return;
    edit(() => { paintVal(row, sp.a, sp.b, c); touch(row); });
    const k = spansOf(r).findIndex((x: any) => x.b > sp.a + 1e-6 && E.M.rows[r].segs[x.i].c !== 'G');
    E.sel = k >= 0 ? { r, i: k } : null; draw(); renderProps();
  }
  function deleteAnn(xi: any) { edit(() => E.M.ext.splice(xi, 1)); E.sel = null; draw(); renderProps(); }
  function deleteMark(xi: any, j: any) {
    edit(() => { const x = E.M.ext[xi], v = markVals(x); v.splice(j, 1); if (v.length) setMarks(x, v); else E.M.ext.splice(xi, 1); });
    E.sel = null; draw(); renderProps();
  }
  function deleteSel() {
    const s = E.sel;
    if (!s) return;
    if (s.r != null) deleteSegs(selSegs());
    else if (s.row != null) deleteRow(s.row);
    else if (s.j != null) deleteMark(s.x, s.j);
    else if (s.x != null) deleteAnn(s.x);
  }
  function addMark(t: any) {
    let xi = E.M.ext.findIndex((x: any) => x.k === 'vert' && /help lines/.test(x.o) && x.list && !/\.\.\./.test(x.list));
    edit(() => {
      if (xi < 0) { E.M.ext.push({ k: 'vert', o: 'help lines', list: T.num(t), dirty: true }); xi = E.M.ext.length - 1; }
      else { const v = markVals(E.M.ext[xi]); if (!v.some((q: any) => Math.abs(q - t) < 1e-6)) v.push(t); v.sort((p: any, q: any) => p - q); setMarks(E.M.ext[xi], v); }
    });
    const j = markVals(E.M.ext[xi]).findIndex((q: any) => Math.abs(q - t) < 1e-6);
    disarm();
    E.sel = { x: xi, j }; draw(); renderProps();
  }
  // a new arrow between two times at height y, labelled t with the next number
  function newAnn(kind: any, t1: any, t2: any, y: any) {
    const n = E.M.ext.filter((x: any) => x.k === 'annot').length + 1;
    return { k: 'annot', o: [kind], x1: t1, y1: y, x2: t2, y2: y, lo: ['above', 'font=\\footnotesize'], t: `$t_{${n}}$`, dirty: true };
  }


  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      // the shown name, the English one and the category's both find it
      items: items.map(([k, label, , key]: any) => ({ id: k, label: caption(label), key, alt: label.fallback, keywords: `${k.slice(2)} ${caption(cat)} ${cat.fallback}`, svg: fitMini(TD.timingMini(ITEM[k].mini, 1e3), 64, 34, 3) })),
    })), { armed: E?.arm });
  }
  // the keyboard's click (Enter or Space on a focused item) picks it; a press is a click or a drag (below)
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  // Drag an item onto the drawing: a value onto a segment (or past a row's end), shown painted as it hovers; a row
  // kind between rows, where a line shows it goes; an interval or delay arrow from an edge to the next, drawn as it
  // hovers; a marker or break at a time. Letting go over the drawing places it as one undo step; anywhere else, or
  // Esc, drops it. A press without a drag picks the item, as a click.
  let palDrag: any = null;
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0 || !E) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    try { b.setPointerCapture(e.pointerId); } catch { /* a pointer the browser doesn't know */ }
  });
  list.addEventListener('pointermove', (e: any) => {
    const d = palDrag;
    if (!d) return;
    if (!d.moved) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4) return; d.moved = true; dropPaint(); disarm(); begin(); }
    dndShow(d, overStage(e) ? e : null);
    draw();
  });
  list.addEventListener('pointerup', (e: any) => {
    const d = palDrag;
    if (!d) return;
    palDrag = null;
    if (!d.moved) { pick(d.k); return; }
    if (overStage(e)) { dndShow(d, e); dndPlace(d); } else dndDrop(d);
  });
  list.addEventListener('pointercancel', () => { if (palDrag) { const d = palDrag; palDrag = null; if (d.moved) dndDrop(d); } });
  // what a dragged item shows where it is (or nothing, off the drawing): the model changes live for a value or an
  // arrow, from how it was when the drag began; a row, marker or break is a guide line
  function dndShow(d: any, e: any) {
    if (d.r != null) { const row = E.M.rows[d.r]; row.segs = JSON.parse(d.segs0); touch(row); d.r = null; d.segs0 = null; }
    if (d.x != null) { E.M.ext.splice(d.x, 1); d.x = null; }
    d.range = null; d.line = null; d.at = null;
    if (e) {
      const [t, y] = toT(e), kind = d.k[0], key = d.k.slice(2);
      if (kind === 'v') {
        const r = rowAt(y);
        if (r >= 0) {
          const spans = spansOf(r), end = rowEnd(r), sp = spans.find((q: any) => t >= q.a && t < q.b && q.b - q.a > 1e-6);
          const g = Math.max(0, paintT(t, e.altKey));
          d.range = key === 'G' ? [g, g] : sp ? [sp.a, sp.b] : t >= end ? [end, Math.max(end + 1, Math.ceil(t))] : null;
          if (d.range) {
            const row = E.M.rows[r];
            d.r = r; d.segs0 = JSON.stringify(row.segs);
            if (d.range[1] - d.range[0] > 1e-6) paintVal(row, d.range[0], d.range[1], key);
            touch(row);
          }
        }
      } else if (kind === 'r') {
        const n = E.M.rows.length, rd = cfg().rowdist;
        d.ins = Math.max(0, Math.min(n, Math.ceil((0.5 - y) / rd)));
        d.line = baseOf(d.ins) + 0.5 + rd / 2;
      } else if (d.k === 'a:mark') d.at = snapEdge(t, e.altKey);
      else if (d.k === 'a:brk') d.at = Math.max(0.2, snapT(t, !e.altKey));
      else {
        const t1 = Math.max(0, snapEdge(t, e.altKey)), t2 = edgeTimes().filter((q) => q > t1 + 1e-6).sort((a, b) => a - b)[0] ?? t1 + 1;
        E.M.ext.push(newAnn(key, t1, t2, Math.round(y * 4) / 4)); d.x = E.M.ext.length - 1; E.M.dirty = true;
      }
    }
    syncBreaks(); E.dnd = d;
  }
  function dndPlace(d: any) {
    E.dnd = null;
    if (d.k[0] === 'v') {
      if (!d.range) { dndDrop(d); return; }
      const r = d.r, row = E.M.rows[r];
      row.segs = JSON.parse(d.segs0); touch(row);
      placePaint({ arm: d.k, r, range: d.range, segs0: null });
    } else if (d.k[0] === 'r') { commit(); addRow(d.k.slice(2), d.ins); }
    else if (d.k === 'a:mark') { commit(); addMark(d.at); }
    else if (d.k === 'a:brk') { commit(); addBreak(d.at); }
    else {
      const x = d.x;
      E.M.dirty = true; commit();
      E.sel = { x }; draw(); renderProps(); editLabel({ x });
    }
  }
  function dndDrop(d: any) { dndShow(d, null); E.dnd = null; commit(); draw(); }
  function cancelDnd() { if (!palDrag) return false; const d = palDrag; palDrag = null; if (d.moved) dndDrop(d); return true; }
  // a value sets the selected segment, or is armed for painting; a row kind adds a row; an annotation is armed
  function pick(k: any) {
    dropPaint();
    if (k[0] === 'r') { addRow(k.slice(2)); return; }
    if (k[0] === 'v' && !E.arm && selSegs().length > 1) { setValues(selSegs(), k.slice(2)); return; }
    if (k[0] === 'v' && !E.arm && E.sel && E.sel.r != null) { setValue(E.sel.r, E.sel.i, k.slice(2)); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    const name = caption(ITEM[k].name);
    setHint(!E.arm ? '' : k[0] === 'v' ? armHint() : k === 'a:mark' ? uiText('editor.tm.armMark', 'Marker line: click a time, or Esc.') : k === 'a:brk' ? uiText('editor.tm.armBreak', 'Break: click a time to break every row there, or Esc.') : uiText('editor.tm.armAnnot', '{name}: drag from one edge to another, or Esc.', { name }));
  }
  function setHint(t: any) { stageNote.set(t); }
  function disarm() { if (!E.arm) return; E.arm = null; buildPalette(); setHint(''); }
  // a value stays picked for painting until Esc; its hint stays up meanwhile
  const armHint = () => (E.arm && E.arm[0] === 'v' ? uiText('editor.tm.armValue', '{name}: drag along a row to paint it, or click, point and click again. Esc when done.', { name: caption(ITEM[E.arm].name) }) : '');

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [4, 300], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  // screen ↔ table units (periods along, signal heights up)
  const m = (t: any, y: any) => [E.view.ox + t * E.view.k, E.view.oy - y * E.view.k];
  const toT = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (v.oy - y) / v.k]; };
  // layout px (y down) → screen
  const S = (X: any, Y: any) => [E.view.ox + (X / U) * E.view.k, E.view.oy + (Y / U) * E.view.k];
  function rowAt(y: any) {
    const n = E.M.rows.length, rd = cfg().rowdist;
    if (!n) return -1;
    const r = Math.max(0, Math.min(n - 1, Math.round((0.5 - y) / rd)));
    return Math.abs(y - (baseOf(r) + 0.5)) <= Math.max(0.9, rd / 2) ? r : -1;
  }
  // every edge time, for snapping arrows
  function edgeTimes() {
    const out = new Set([0]);
    E.M.rows.forEach((_: any, r: any) => { for (const s of spansOf(r)) { out.add(round(s.a)); out.add(round(s.b)); } });
    return [...out];
  }
  function snapEdge(t: any, alt: any) {
    if (!alt) { let best = null, bd = 8 / E.view.k; for (const q of edgeTimes()) if (Math.abs(q - t) < bd) { bd = Math.abs(q - t); best = q; } if (best != null) return best; }
    return snapT(t, !alt);
  }
  // what is under the pointer
  function hitAt(e: any) {
    const [sx, sy] = pos(e), [t, y] = toT(e), k = E.view.k, L = lay();
    for (const a of E.adds || []) if (sx >= a.x1 && sx <= a.x2 && sy >= a.y1 && sy <= a.y2) return { add: a.kind };
    for (const ex of L.extra) {
      if (ex.k !== 'brk') continue;
      const [X] = m(ex.t, 0);
      if (Math.abs(X - sx) <= 7 && ex.ys.some((v: any) => y >= v - 0.35 && y <= v + 1.35)) return { x: ex.xi, brk: true };
    }
    // annotation ends of the selected one, then annotations and marker lines
    const sa = selAnn();
    if (sa) for (const end of [1, 2]) { const [X, Y] = m(sa['x' + end], sa['y' + end]); if (Math.hypot(X - sx, Y - sy) <= 7) return { aend: end, x: E.sel.x }; }
    for (const ex of L.extra) {
      if (ex.k === 'annot') {
        const [ax, ay] = S(ex.Xa, ex.Ya), [bx, by] = S(ex.Xb, ex.Yb), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, q = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / l2));
        if (Math.hypot(ax + dx * q - sx, ay + dy * q - sy) <= 6) return { x: ex.xi };
        if (ex.label) { const [lx, ly] = S(ex.label.x, ex.label.y), hw = (ex.label.b.w / 2 / U) * k, hh = (ex.label.b.h / 2 / U) * k; if (Math.abs(sx - lx) <= hw && Math.abs(sy - ly) <= hh) return { x: ex.xi }; }
      }
    }
    const r = rowAt(y);
    if (r >= 0) {
      const sp = spansOf(r), base = baseOf(r);
      if (t < -0.05) return { row: r };
      // an edge: the end of a segment
      let best = null, bd = 6;
      for (const s of sp) { if (s.b - s.a < 1e-6) continue; const d = Math.abs(s.b - t) * k; if (d < bd) { bd = d; best = s.i; } }
      if (best != null && y >= base - 0.4 && y <= base + 1.4) return { r, edge: best };
      for (const s of sp) if (t >= s.a && t < s.b && s.b - s.a > 1e-6) return { r, i: s.i };
      for (const s of sp) if (s.c === 'G' && Math.abs(s.a - t) * k < 5) return { r, i: s.i };
      if (t >= 0) return { r, past: true };
    }
    for (const ex of L.extra) {
      if (ex.k !== 'line' || ex.x == null || E.M.ext[ex.xi].k !== 'vert') continue;
      const [X] = S(ex.x * U, 0);
      if (Math.abs(X - sx) <= 4) return { x: ex.xi, j: ex.j };
    }
    return null;
  }
  function fit() {
    const L = lay();
    // room under the drawing for the add-row buttons
    E.view = fitView(rect(), L.empty ? { x: 0, y: -2 * U, w: 8 * U, h: 3 * U } : L.bb, { scale: U, margin: 1, min: 6, max: 80, below: L.empty ? 0 : 44 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // grid: half periods (hidden when too dense), whole periods, and every fifth stronger
    const step = k * STEP >= 7 ? STEP : k >= 7 ? 1 : 5, ts = Math.floor(-v.ox / k / step), te = Math.ceil((W - v.ox) / k / step);
    let minor = '', major = '', ruler = '';
    const every = k >= 22 ? 1 : k >= 9 ? 2 : 5;
    for (let i = ts; i <= te; i++) {
      const t = i * step, X = Math.round(v.ox + t * k) + 0.5, whole = Math.abs(t - Math.round(t)) < 1e-6;
      if (whole && Math.round(t) % 5 === 0) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`;
      if (whole && t >= 0 && Math.round(t) % every === 0) ruler += `<text class="tm-tick" x="${X}" y="14">${Math.round(t)}</text>`;
    }
    const [OX] = m(0, 0);
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/><path class="cz-origin" d="M${r2(OX) + 0.5},0V${H}"/>${ruler}`;
    const L = lay(), kk = k / U;
    // under the drawing: the selected segment or row, a paint stroke
    const sel = E.sel;
    for (const q of selSegs()) {
      const sp = spansOf(q.r)[q.i];
      if (sp) { const b = segBox(q.r, sp); out += `<rect class="tm-ssel" x="${r2(b.x1)}" y="${r2(b.y1)}" width="${r2(b.x2 - b.x1)}" height="${r2(b.y2 - b.y1)}" rx="3"/>`; }
    }
    if (sel && sel.row != null && L.rows[sel.row]) {
      const base = baseOf(sel.row), lbl = L.texts.find((t: any) => t.row === sel.row), lx = lbl ? (lbl.x - lbl.b.w / 2) / U : -cfg().coldist - 2;
      const [x1, y1] = m(Math.min(lx, -cfg().coldist - 0.5) - 0.3, base + 1.3), [x2, y2] = m(Math.max(1, L.rows[sel.row].R.end) + 0.3, base - 0.3);
      out += `<rect class="tm-rsel" x="${r2(x1)}" y="${r2(y1)}" width="${r2(x2 - x1)}" height="${r2(y2 - y1)}" rx="4"/>`;
    }
    const d = E.drag;
    if (d && d.mode === 'paint') { const base = baseOf(d.r), a = Math.min(d.a, d.b), b = Math.max(d.a, d.b), [x1, y1] = m(a, base + 1.25), [x2, y2] = m(b, base - 0.25); out += `<rect class="tm-paint" x="${r2(x1)}" y="${r2(y1)}" width="${r2(Math.max(2, x2 - x1))}" height="${r2(y2 - y1)}" rx="3"/>`; }
    const sb = selBrk();
    if (sb) for (const v of sb.ys) { const [x1, y1] = m(sb.t - 0.4, v + 1.4), [x2, y2] = m(sb.t + 0.4, v - 0.4); out += `<rect class="tm-ssel" x="${r2(x1)}" y="${r2(y1)}" width="${r2(x2 - x1)}" height="${r2(y2 - y1)}" rx="3"/>`; }
    // the selected annotation or marker, as a halo
    const se = sel && sel.x != null ? L.extra.filter((x: any) => x.xi === sel.x && (sel.j == null ? x.k === 'annot' : x.j === sel.j)) : [];
    for (const x of se) {
      const dd = x.k === 'annot' ? `M${r2(x.Xa)},${r2(x.Ya)}L${r2(x.Xb)},${r2(x.Yb)}` : x.d;
      out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})"><path class="ze-wsel" d="${dd}" stroke-width="${r2(10 / kk)}"/></g>`;
    }
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${T.draw({ type: 'timing', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
    // under the last row: buttons that add a row there
    E.adds = [];
    {
      // below the last row, and below any arrow or label hanging under it
      const n = E.M.rows.length, [X0, Yr] = n ? m(0, baseOf(n - 1) - 1) : [W / 2 - 170, H / 2], Y = n && !L.empty ? Math.max(Yr, S(0, L.bb.y + L.bb.h)[1]) + 22 : Yr;
      let x = X0;
      for (const [kind, name] of [['signal', uiText('editor.tm.signalRow', 'Signal row')], ['clock', uiText('editor.tm.clockRow', 'Clock row')], ['bus', uiText('editor.tm.busRow', 'Bus row')], ['blank', uiText('editor.tm.blankRow', 'Blank row')]]) {
        const w = 104, on = E.hover && E.hover.add === kind;
        E.adds.push({ kind, x1: x, x2: x + w, y1: Y - 13, y2: Y + 13 });
        out += `<g class="tm-add${on ? ' on' : ''}"><rect x="${r2(x)}" y="${r2(Y - 13)}" width="${w}" height="26" rx="6"/><path d="M${r2(x + 13)},${r2(Y)}h10M${r2(x + 18)},${r2(Y - 5)}v10"/><text x="${r2(x + 30)}" y="${r2(Y + 4)}">${esc(name)}</text></g>`;
        x += w + 8;
      }
    }
    // the edge under the pointer, or being dragged
    const h = d && d.mode === 'edge' ? { r: d.r, edge: d.i } : !d && !E.arm ? E.hover : null;
    if (h && h.edge != null) {
      const sp = spansOf(h.r)[h.edge], base = baseOf(h.r);
      if (sp) { const [X, y1] = m(sp.b, base + 1.4), [, y2] = m(sp.b, base - 0.4); out += `<path class="tm-edge" d="M${r2(X)},${r2(y1)}V${r2(y2)}"/>`; }
    }
    // the ends of the selected annotation
    const sa = selAnn();
    if (sa) for (const end of [1, 2]) { const [X, Y] = m(sa['x' + end], sa['y' + end]); out += `<circle class="cz-h tm-aend" cx="${r2(X)}" cy="${r2(Y)}" r="4.5"/>`; }
    // an arrow being drawn: the arrow itself once it has a length (made live), and where its end snaps
    if (d && d.mode === 'annot') {
      const [x1, y1] = m(d.t1, d.y), [x2] = m(d.t2, d.y);
      if (d.x == null) out += `<path class="ze-draft" d="M${r2(x1)},${r2(y1)}H${r2(x2)}"/>`;
      out += `<circle class="cz-snap on" cx="${r2(x2)}" cy="${r2(y1)}" r="5"/>`;
    }
    // a selection being dragged out over empty space
    if (d && d.mode === 'marquee' && d.moved) out += `<rect class="marquee" x="${r2(Math.min(d.sx, d.x))}" y="${r2(Math.min(d.sy, d.y))}" width="${r2(Math.abs(d.x - d.sx))}" height="${r2(Math.abs(d.y - d.sy))}"/>`;
    // an item dragged from the palette: where a row goes, or where a marker or break lands
    if (E.dnd && E.dnd.line != null) { const [, Y] = m(0, E.dnd.line); out += `<path class="ze-draft" d="M0,${r2(Y)}H${W}"/>`; }
    if (E.dnd && E.dnd.at != null) { const [X] = m(E.dnd.at, 0); out += `<path class="ze-draft" d="M${r2(X)},0V${H}"/>`; }
    // placing a marker: where it lands
    if ((E.arm === 'a:mark' || E.arm === 'a:brk') && E.hover && E.hover.at != null) { const [X] = m(E.hover.at, 0); out += `<path class="ze-draft" d="M${r2(X)},0V${H}"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- painting a value
  // A drag paints from where it began to the pointer. A click starts the same thing without the button held: the
  // pointer then shows what a second click places, the clicked segment while it stays in it (or a period past the
  // end), a range from the click once it leaves. Either way the row is painted as the pointer moves, from how it was
  // when it began, and placing it is one undo step.
  function paintPreview(d: any, t: number, alt: boolean) {
    const row = E.M.rows[d.r];
    if (d.segs0 == null) { begin(); d.segs0 = JSON.stringify(row.segs); }
    row.segs = JSON.parse(d.segs0); touch(row);
    if (!d.click) d.range = [Math.min(d.a, d.b), Math.max(d.a, d.b)];
    else {
      const spans = spansOf(d.r), at = (x: number) => spans.find((sp: any) => x >= sp.a && x < sp.b && sp.b - sp.a > 1e-6);
      const end = rowEnd(d.r), sp = at(d.t0), here = at(t);
      if (sp && here === sp) d.range = [sp.a, sp.b];
      else if (!sp && d.t0 >= end && t >= end && !here) d.range = [end, Math.max(end + 1, Math.ceil(Math.max(d.t0, t)))];
      else { const b = Math.max(0, paintT(t, alt)); d.range = [Math.min(d.a, b), Math.max(d.a, b)]; }
    }
    const [a, b] = d.range;
    if (b - a > 1e-6) paintVal(row, a, b, d.arm.slice(2));
    touch(row); syncBreaks();
  }
  function placePaint(d: any) {
    setHint(armHint());
    const v = d.arm.slice(2), c = v === 'UH' ? 'U' : v, row = E.M.rows[d.r], [a, b] = d.range;
    if (d.segs0 != null) row.segs = JSON.parse(d.segs0); // shown while it was made: painted again here, as one edit
    if (b - a < 1e-6 && c !== 'G') { touch(row); commit(); draw(); return; }
    edit(() => { paintVal(row, a, b, v); touch(row); });
    const k = spansOf(d.r).findIndex((sp: any) => sp.a >= a - 1e-6 && (sp.b > sp.a || c === 'G'));
    E.sel = k >= 0 ? { r: d.r, i: k } : null; draw(); renderProps();
    if (c === 'D' && E.sel) editLabel(E.sel);
  }
  // a click's paint not yet placed: Esc, another value, undo, the code or a press outside the drawing drop it
  function dropPaint() {
    const d = E && E.drag;
    if (!d || !d.click) return false;
    E.drag = null;
    if (d.segs0 != null) { const row = E.M.rows[d.r]; row.segs = JSON.parse(d.segs0); touch(row); syncBreaks(); }
    commit(); setHint(armHint()); draw();
    return true;
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e), [t, y] = toT(e);
    if (E.drag && E.drag.click) { const d = E.drag; E.drag = null; if (e.button === 0) { paintPreview(d, t, e.altKey); placePaint(d); } else dropPaint(); return; }
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    {
      // the add-row buttons work whatever is picked; a row name selects the row and puts the tool down
      const h0 = hitAt(e);
      if (h0 && h0.add) { addRow(h0.add, E.M.rows.length); return; }
      if (E.arm && h0 && h0.row != null) { disarm(); E.sel = { row: h0.row }; draw(); renderProps(); return; }
    }
    if (E.arm) {
      if (E.arm === 'a:mark') { addMark(snapEdge(t, e.altKey)); return; }
      if (E.arm === 'a:brk') { addBreak(Math.max(0.2, snapT(t, !e.altKey))); return; }
      if (E.arm[0] === 'a') { const t1 = snapEdge(t, e.altKey); E.drag = { mode: 'annot', kind: E.arm.slice(2), t1, t2: t1, y: Math.round(y * 4) / 4, x: null }; draw(); return; }
      const r = rowAt(y);
      if (r < 0) return;
      const a = paintT(t, e.altKey);
      E.drag = { mode: 'paint', r, a: Math.max(0, a), b: Math.max(0, a), t0: t, sx, moved: false, arm: E.arm, segs0: null }; draw(); return;
    }
    const h = hitAt(e);
    if (h && h.aend) { begin(); E.drag = { mode: 'aend', x: h.x, end: h.aend }; return; }
    if (h && h.brk) { E.sel = { x: h.x }; E.drag = { mode: 'bmove', x: h.x, sx, moved: false }; draw(); renderProps(); return; }
    if (h && h.x != null && h.j == null) {
      if (dbl && E.sel && E.sel.x === h.x && E.sel.j == null) { editLabel({ x: h.x }); return; }
      const a = E.M.ext[h.x];
      E.sel = { x: h.x };
      E.drag = { mode: 'amove', x: h.x, sx, sy, t0: t, y0: y, a: { x1: a.x1, x2: a.x2, y1: a.y1, y2: a.y2 }, moved: false };
      draw(); renderProps(); return;
    }
    if (h && h.j != null) {
      E.sel = { x: h.x, j: h.j };
      E.drag = { mode: 'mmove', x: h.x, j: h.j, moved: false, sx };
      draw(); renderProps(); return;
    }
    if (h && h.row != null) {
      if (dbl && E.sel && E.sel.row === h.row) { editLabel({ row: h.row }); return; }
      E.sel = { row: h.row }; E.drag = null; draw(); renderProps(); return;
    }
    if (h && h.edge != null) {
      const row = E.M.rows[(h.r as any)], sp = spansOf(h.r), i = h.edge, n = row.segs.findIndex((s: any, q: any) => q > i && s.c !== 'G');
      const t0 = sp[i].b, base = baseOf(h.r);
      // arrows whose end is on this edge, near this row, follow it
      const follow: any[] = [];
      E.M.ext.forEach((x: any, xi: any) => { if (x.k !== 'annot') return; for (const end of [1, 2]) if (Math.abs(x['x' + end] - t0) < 1e-6 && Math.abs(x['y' + end] - (base + 0.5)) <= cfg().rowdist) follow.push({ xi, end }); });
      E.drag = { mode: 'edge', r: h.r, i, n, sx, t0, w0: row.segs[i].w, wn: n >= 0 ? row.segs[n].w : 0, start: sp[i].a, nextEnd: n >= 0 ? sp[n].b : Infinity, follow, moved: false };
      E.sel = { r: h.r, i }; draw(); renderProps(); return;
    }
    if (h && h.i != null && e.shiftKey && E.sel && E.sel.r != null) {
      // from the anchor to this one: the segments of the rows between, over the time between
      const A = spansOf(E.sel.r)[E.sel.i], B = spansOf(h.r!)[h.i];
      if (A && B) selectSegs(segsIn(Math.min(E.sel.r, h.r!), Math.max(E.sel.r, h.r!), Math.min(A.a, B.a), Math.max(A.b, B.b)), E.sel);
      E.drag = null; draw(); renderProps(); return;
    }
    if (h && h.i != null) {
      if (dbl && E.sel && E.sel.r === h.r && E.sel.i === h.i) { const s = selSeg(); if (s.c === 'D') editLabel({ r: h.r, i: h.i }); return; }
      E.sel = { r: h.r, i: h.i };
      const row = E.M.rows[(h.r as any)], sp = spansOf(h.r), p = row.segs.slice(0, h.i).map((s: any, q: any) => q).reverse().find((q: any) => row.segs[q].c !== 'G'), n = row.segs.findIndex((s: any, q: any) => q > h.i && s.c !== 'G');
      if (p != null && p >= 0 && n >= 0) E.drag = { mode: 'move', r: h.r, i: h.i, p, n, sx, a0: sp[h.i].a, wp: row.segs[p].w, wn: row.segs[n].w, moved: false };
      else E.drag = null;
      draw(); renderProps(); return;
    }
    // empty space: drag out a selection of segments (⇧ adds to it); a click there selects nothing. Pan with the
    // wheel, the middle button or Space
    const base = e.shiftKey ? selSegs() : [], anchor = e.shiftKey ? E.sel : null;
    if (!e.shiftKey) { E.sel = null; E.many = null; }
    E.drag = { mode: 'marquee', sx, sy, x: sx, y: sy, base, anchor, moved: false }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e), [t, y] = toT(e);
    if (!d) {
      const h0 = hitAt(e), h: any = h0 && (h0.add || (E.arm && h0.row != null)) ? h0 : E.arm === 'a:mark' ? { at: snapEdge(t, e.altKey) } : E.arm === 'a:brk' ? { at: snapT(t, !e.altKey), brkAt: true } : E.arm ? null : h0;
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover);
      E.hover = h;
      svg.style.cursor = h && (h.add || h.row != null) ? 'pointer' : E.arm ? '' : !h ? '' : h.brk ? 'ew-resize' : h.edge != null || h.j != null ? 'ew-resize' : h.aend ? 'grab' : h.x != null || (h.i != null && E.sel && E.sel.r === h.r && E.sel.i === h.i) ? 'move' : h.i != null || h.row != null ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'marquee') {
      d.x = sx; d.y = sy;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.moved = true;
      const x1 = Math.min(d.sx, sx), x2 = Math.max(d.sx, sx), y1 = Math.min(d.sy, sy), y2 = Math.max(d.sy, sy), list = d.base.slice();
      E.M.rows.forEach((_: any, r: number) => spansOf(r).forEach((sp: any, i: number) => {
        const b = segBox(r, sp);
        if (b.x1 <= x2 && b.x2 >= x1 && b.y1 <= y2 && b.y2 >= y1 && !list.some((q: any) => q.r === r && q.i === i)) list.push({ r, i });
      }));
      selectSegs(list, d.anchor);
      draw(); return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'paint') {
      if (!d.click) {
        if (!d.moved && Math.abs(sx - d.sx) < 4) return;
        d.moved = true; d.b = Math.max(0, paintT(t, e.altKey));
      }
      paintPreview(d, t, e.altKey);
      const [a, b] = d.range;
      setHint(d.click ? uiText('editor.tm.paintClick', '{name} from {a} to {b}: click to place it, or Esc', { name: caption(ITEM[d.arm].name), a: T.num(a), b: T.num(b) })
        : uiText('editor.tm.paintRange', '{name} from {a} to {b}', { name: caption(ITEM[d.arm].name), a: T.num(a), b: T.num(b) }));
      draw(); return;
    }
    if (d.mode === 'annot') {
      d.t2 = snapEdge(t, e.altKey);
      setHint(uiText('editor.tm.annotRange', 'From {a} to {b}: {n} periods', { a: T.num(d.t1), b: T.num(d.t2), n: T.num(Math.abs(d.t2 - d.t1)) }));
      // the arrow itself, label and all, from the first move on; none while it has no length
      const long = Math.abs(d.t2 - d.t1) >= 1e-6;
      if (long && d.x == null) { begin(); d.x = E.M.ext.length; E.M.ext.push(newAnn(d.kind, d.t1, d.t2, d.y)); }
      else if (!long && d.x != null) { E.M.ext.splice(d.x, 1); d.x = null; E.M.dirty = true; }
      if (d.x != null) { E.M.ext[d.x].x2 = d.t2; xdirty(E.M.ext[d.x]); }
      draw(); return;
    }
    if (d.mode === 'edge') {
      if (!d.moved && Math.abs(sx - d.sx) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const row = E.M.rows[d.r], min = e.altKey ? 0.05 : STEP, ripple = e.shiftKey || d.n < 0;
      let nt = snapT(d.t0 + (sx - d.sx) / E.view.k, !e.altKey);
      nt = Math.max(d.start + min, ripple ? nt : Math.min(d.nextEnd - min, nt));
      row.segs[d.i].w = round(nt - d.start);
      if (d.n >= 0) row.segs[d.n].w = ripple ? d.wn : round(d.nextEnd - nt);
      for (const f of d.follow) E.M.ext[f.xi]['x' + f.end] = nt, xdirty(E.M.ext[f.xi]);
      touch(row);
      setHint(ripple && d.n >= 0 ? uiText('editor.tm.edgeAtRipple', 'Edge at {t} · the rest of the row moves along', { t: T.num(nt) }) : e.shiftKey ? uiText('editor.tm.edgeAt', 'Edge at {t}', { t: T.num(nt) }) : uiText('editor.tm.edgeAtHelp', 'Edge at {t} · ⇧ moves the rest of the row along, ⌥ places freely', { t: T.num(nt) }));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.abs(sx - d.sx) < 4) return;
      if (!d.moved) { begin(); d.moved = true; }
      const row = E.M.rows[d.r], min = e.altKey ? 0.05 : STEP;
      let na = snapT(d.a0 + (sx - d.sx) / E.view.k, !e.altKey);
      na = Math.max(d.a0 - d.wp + min, Math.min(d.a0 + d.wn - min, na));
      row.segs[d.p].w = round(d.wp + na - d.a0); row.segs[d.n].w = round(d.wn - (na - d.a0));
      touch(row);
      setHint(uiText('editor.tm.startsAt', 'Starts at {t}', { t: T.num(na) }));
      draw(); return;
    }
    if (d.mode === 'amove') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); d.moved = true; }
      const x = E.M.ext[d.x], dt = snapT(t - d.t0, !e.altKey), dy = Math.round((y - d.y0) * 4) / 4;
      x.x1 = round(d.a.x1 + dt); x.x2 = round(d.a.x2 + dt); x.y1 = round(d.a.y1 + dy); x.y2 = round(d.a.y2 + dy);
      xdirty(x); draw(); return;
    }
    if (d.mode === 'aend') {
      const x = E.M.ext[d.x];
      x['x' + d.end] = snapEdge(t, e.altKey);
      xdirty(x); setHint(uiText('editor.tm.nPeriods', '{n} periods', { n: T.num(Math.abs(x.x2 - x.x1)) })); draw(); return;
    }
    if (d.mode === 'bmove') {
      if (!d.moved && Math.abs(sx - d.sx) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const x = E.M.ext[d.x];
      x.t = Math.max(0.2, snapT(t, !e.altKey)); xdirty(x); setHint(uiText('editor.tm.breakAt', 'Break at {t}', { t: T.num(x.t) })); draw(); return;
    }
    if (d.mode === 'mmove') {
      if (!d.moved && Math.abs(sx - d.sx) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const x = E.M.ext[d.x], v = markVals(x);
      v[d.j] = Math.max(0, snapEdge(t, e.altKey));
      setMarks(x, v); setHint(uiText('editor.tm.markerAt', 'Marker at {t}', { t: T.num(v[d.j]) })); draw();
    }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'paint') {
      const c = d.arm.slice(2) === 'UH' ? 'U' : d.arm.slice(2);
      if (!d.moved && c !== 'G') {
        // a click: hovering now shows what a second click will place (the segment clicked, or a range from it)
        d.click = true; E.drag = d;
        paintPreview(d, toT(e)[0], e.altKey);
        setHint(uiText('editor.tm.paintClick', '{name} from {a} to {b}: click to place it, or Esc', { name: caption(ITEM[d.arm].name), a: T.num(d.range[0]), b: T.num(d.range[1]) }));
        draw(); return;
      }
      if (!d.moved) { const g = snapT(toT(e)[0], !e.altKey); d.range = [g, g]; } // a glitch is placed where it is clicked
      placePaint(d);
      return;
    }
    if (d.mode === 'marquee') { renderProps(); draw(); return; }
    if (d.mode === 'annot') {
      setHint('');
      if (d.x == null) { draw(); return; }
      // drawn live while dragging: kept as one edit, selected, its label ready to type
      E.M.dirty = true; commit(); disarm();
      E.sel = { x: d.x }; draw(); renderProps();
      editLabel(E.sel);
      return;
    }
    if ((d.mode === 'edge' || d.mode === 'move' || d.mode === 'mmove' || d.mode === 'bmove') && d.moved) { setHint(''); commit(); renderProps(); draw(); return; }
    if ((d.mode === 'amove' && d.moved) || d.mode === 'aend') { setHint(''); commit(); renderProps(); draw(); return; }
    draw();
  });
  document.addEventListener('pointerdown', (e) => { if (E && E.drag && E.drag.click && !svg.contains(e.target as Node)) dropPaint(); }, true);
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });

  // right-click: the segment's, row's, annotation's or marker's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', above: 'insertAbove', below: 'insertBelow', rev: 'reverse', del: 'delete', up: 'moveUp', down: 'moveDown', dup: 'duplicate', split: 'split', add: 'add' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /del$/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const h = hitAt(e);
    E.menuAt = toT(e)[0];
    if (h && h.brk) { E.sel = { x: h.x }; menuRows = [mItem('bdel', uiText('editor.tm.deleteBreak', 'Delete Break'), 'del', '⌫')]; }
    else if (h && h.x != null && h.j == null) { E.sel = { x: h.x }; menuRows = [mItem('label', uiText('editor.tm.editLabel', 'Edit Label'), 'label', '↩'), mItem('side', uiText('editor.tm.labelOtherSide', 'Label Other Side'), 'above'), mItem('flip', uiText('editor.tm.reverseArrow', 'Reverse Arrow'), 'rev'), '-', mItem('adel', uiText('editor.tm.deleteArrow', 'Delete Arrow'), 'del', '⌫')]; }
    else if (h && h.j != null) { E.sel = { x: h.x, j: h.j }; menuRows = [mItem('mdel', uiText('editor.tm.deleteMarker', 'Delete Marker'), 'del', '⌫')]; }
    else if (h && h.row != null) {
      E.sel = { row: h.row };
      menuRows = [mItem('label', uiText('editor.tm.editName', 'Edit Name'), 'label', '↩'), mItem('insa', uiText('editor.commonB.insertRowAbove', 'Insert Row Above'), 'above'), mItem('insb', uiText('editor.commonB.insertRowBelow', 'Insert Row Below'), 'below'), '-', mItem('up', uiText('editor.tm.moveUp', 'Move Up'), 'up'), mItem('down', uiText('editor.tm.moveDown', 'Move Down'), 'down'), mItem('dup', uiText('editor.tm.duplicateRow', 'Duplicate Row'), 'dup'), '-', mItem('rdel', uiText('editor.commonB.deleteRow', 'Delete Row'), 'del')];
    } else if (h && (h.i != null || h.edge != null)) {
      const i = h.i != null ? h.i : h.edge;
      E.sel = { r: h.r, i };
      const s = selSeg();
      menuRows = [...(s.c === 'D' ? [mItem('label', uiText('editor.tm.editText', 'Edit Text'), 'label', '↩')] : []), ...(s.c !== 'G' ? [mItem('split', uiText('editor.tm.splitHere', 'Split Here'), 'split')] : []), mItem('rowsel', uiText('editor.tm.selectRow', 'Select Row'), 'above'), '-', mItem('sdel', uiText('editor.tm.deleteSegment', 'Delete Segment'), 'del', '⌫')];
    } else if (!h || h.past || h.add) {
      E.sel = null;
      menuRows = [mItem('add:signal', uiText('editor.tm.addSignalRow', 'Add Signal Row'), 'add'), mItem('add:clock', uiText('editor.tm.addClockRow', 'Add Clock Row'), 'add'), mItem('add:bus', uiText('editor.tm.addBusRow', 'Add Bus Row'), 'add'), mItem('add:blank', uiText('editor.tm.addBlankRow', 'Add Blank Row'), 'add')];
    } else { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the row name, data value or arrow (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null;
  function editLabel(target: any) {
    if (!TD.input) return false;
    closeLabel();
    const row = target.row != null ? E.M.rows[target.row] : null, sg = target.r != null ? E.M.rows[target.r].segs[target.i] : null, an = target.x != null && target.j == null ? E.M.ext[target.x] : null;
    if (!row && !(sg && sg.c === 'D') && !an) return false;
    begin();
    const me: any = (Lb = { target });
    const text = row ? row.name : sg ? sg.t || '' : mathOf(an.t || '');
    me.pop = TD.input.popup(stage, {
      text, math: !!an, bare: true,
      at: () => labelPos(target),
      onInput: (t: any) => {
        if (row) { row.name = t; touch(row); }
        else if (sg) { sg.t = t; touch(E.M.rows[target.r]); }
        else { an.t = wrapMath(t) || null; xdirty(an); }
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target: any) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.row != null) { [X, Y] = m(-cfg().coldist - 1, baseOf(target.row) - 0.4); }
    else if (target.r != null) { const sp = spansOf(target.r)[target.i]; if (sp) [X, Y] = m((sp.a + sp.b) / 2, baseOf(target.r) - 0.4); }
    else { const ex = L.extra.find((x: any) => x.k === 'annot' && x.xi === target.x); if (ex) { [X, Y] = S((ex.Xa + ex.Xb) / 2, Math.max(ex.Ya, ex.Yb)); Y += 14; } }
    return [vr.left - sr.left + X, vr.top - sr.top + Y + 8];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const HATCH = 'north east lines';
  function bgParts(bg: any) {
    let c = '', hatch = false;
    for (const it of T.opts(bg || '')) { const { k, v } = T.kv(it); if (k === 'pattern') hatch = true; else if ((k === 'fill' || k === 'pattern color') && v) c = TD.texColor.unwrap(v); }
    return { c, hatch };
  }
  const bgCode = (c: any, hatch: any) => (hatch ? `pattern=${HATCH}${c ? `, pattern color=${TD.texColor.wrap(c)}` : ''}` : c ? `fill=${TD.texColor.wrap(c)}` : null);
  function renderProps() {
    if (!E) return;
    const M = E.M, sg = selSeg(), signal = selRow(), an = selAnn(), mk = selMark();
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const numeric = (label: any, key: any, value: any, unit: any, step = 0.5, attrs = {}) => numField(label, key, value == null ? '' : T.num(value), unit, { step: String(step), ...attrs });
    const selectField = (label: any, key: any, value: any, options: any) => row(label, { kind: 'select' as const, value, options, attrs: { 'data-f': key } });
    const many = selSegs();
    if (many.length > 1) {
      // several segments: their value and width, set on all of them (blank where they differ)
      const segs = many.map((q) => M.rows[q.r].segs[q.i]), same = (k: string) => (segs.every((q: any) => q[k] === segs[0][k]) ? segs[0][k] : null);
      const rows = new Set(many.map((q) => q.r)).size, c = same('c'), w = segs.filter((q: any) => q.c !== 'G'), wv = w.length && w.every((q: any) => Math.abs(q.w - w[0].w) < 1e-6) ? w[0].w : null;
      show(uiText('editor.tm.nSel', '{n} segments', { n: many.length }), rows === 1 ? uiText('editor.tm.nSelOneRow', 'in 1 row') : uiText('editor.tm.nSelRows', 'in {n} rows', { n: rows }), [
        selectField(uiText('editor.tm.value', 'Value'), 'value', c ?? '', [...(c == null ? [['', uiText('editor.tm.mixed', 'Mixed')]] : []), ...T.VALUES.map((v: any) => [v, `${T.VALUE_NAMES[v]} (${v})`])]),
        numeric(uiText('editor.tm.width', 'Width'), 'w', wv, uiText('editor.tm.unitPeriods', 'periods'), 0.5, { min: '0.05', ...(wv == null ? { placeholder: uiText('editor.tm.mixed', 'Mixed') } : {}) }),
        note(uiText('editor.tm.manyNote1', 'Pick a value on the left to paint them all; Delete removes them. '), { kbd: '⇧' }, uiText('editor.tm.manyNote2', '-click a segment, or hold it while dragging over empty space, to add more.')),
      ]);
      return;
    }
    if (sg) {
      const sp = spansOf(E.sel.r)[E.sel.i], rname = M.rows[E.sel.r].name, band = sg.c === 'D' || sg.c === 'U', clock = sg.c === 'C' || sg.c === 'T';
      const run = clock ? runOf(E.sel.r, E.sel.i) : null, ws = run ? M.rows[E.sel.r].segs.slice(run.a, run.b + 1).map((q: any) => q.w) : [], clockW = ws.every((w: any) => Math.abs(w - ws[0]) < 1e-6) ? ws[0] : null;
      const p = bgParts(sg.bg);
      const periods = uiText('editor.tm.unitPeriods', 'periods');
      show(T.VALUE_NAMES[sg.c], `${rname || uiText('editor.tm.rowN', 'Row {n}', { n: E.sel.r + 1 })} · ${T.num(sp.a)}–${T.num(sp.b)}`, [
        selectField(uiText('editor.tm.value', 'Value'), 'value', sg.c, T.VALUES.map((c: any) => [c, `${T.VALUE_NAMES[c]} (${c})`])), numeric(clock ? uiText('editor.tm.stepWidth', 'Step width') : uiText('editor.tm.width', 'Width'), 'w', sg.w, periods, 0.5, sg.c === 'G' ? { disabled: true } : { min: '0.05' }),
        ...(clock ? [numeric(uiText('editor.tm.clockWidth', 'Clock width'), 'cw', clockW, periods, 0.5, { min: '0.25' })] : []), ...(sg.c === 'D' ? [field(uiText('editor.tm.text', 'Text'), 't', sg.t || '', { 'data-tx': 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') })] : []),
        ...(band ? [{ ...row(captions["ui.fill"], texColour(p.c, { 'data-f': 'bg' }, { nullable: true, defaultSwatch: p.hatch ? '#000000' : sg.c === 'U' ? '#808080' : '', title: uiText('editor.tm.fill', 'Fill') })), controlClass: 'ctl tc' }, segments(uiText('editor.tm.pattern', 'Pattern'), 'bgpat', p.hatch ? '1' : '0', [['0', uiText('editor.tm.solid', 'Solid')], ['1', uiText('editor.tm.hatched', 'Hatched')]])] : []),
        ...(sg.c === 'D' ? [segments(uiText('editor.tm.starts', 'Starts'), 'newv', sg.t == null ? 0 : 1, [[1, uiText('editor.tm.newValue', 'New value'), uiText('editor.tm.newValueTitle', 'A crossing where it starts: D{…}')], [0, uiText('editor.tm.continues', 'Continues'), uiText('editor.tm.continuesTitle', 'No crossing: the value before goes on')]], sg.t != null && sg.t !== '')] : []),
        note(...(clock ? [sg.c === 'C' ? uiText('editor.tm.clockNoteClock', 'Clock width sets every step of this clock ({n} steps, each a high or a low) and keeps about the same length: 2 writes ', { n: run!.b - run!.a + 1 }) : uiText('editor.tm.clockNoteToggle', 'Clock width sets every step of this toggle ({n} steps, each a high or a low) and keeps about the same length: 2 writes ', { n: run!.b - run!.a + 1 }), { code: '2C' }, uiText('editor.tm.clockNoteEnd', '. Step width changes only this step. ')] : []), uiText('editor.tm.segNote1', 'Drag its edges along the row; '), { kbd: '⇧' }, uiText('editor.tm.segNote2', ' moves the rest of the row with an edge. Drag the segment to move it between its neighbours.')),
      ]); return;
    }
    if (signal) {
      const ns = signal.segs.length, len = T.num(rowEnd(E.sel.row));
      show(ns ? uiText('editor.tm.signal', 'Signal') : uiText('editor.tm.blankRow', 'Blank row'), ns ? (ns === 1 ? uiText('editor.tm.oneSegment', '1 segment · {len} periods', { len }) : uiText('editor.tm.nSegments', '{n} segments · {len} periods', { n: ns, len })) : uiText('editor.tm.blankSummary', 'a gap between rows; type characters to make it a signal'), [
        field(uiText('editor.tm.name', 'Name'), 'name', signal.name, { 'data-tx': 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }), selectField(uiText('editor.tm.startsFrom', 'Starts from'), 'init', signal.init || '', [['', uiText('editor.tm.nothing', 'Nothing')], ['L', uiText('editor.tm.low', 'Low')], ['H', uiText('editor.tm.high', 'High')], ['Z', uiText('editor.tm.highImpedance', 'High impedance')], ['X', uiText('editor.tm.unknown', 'Unknown')], ['D', uiText('editor.tm.data', 'Data')]]), field(uiText('editor.tm.characters', 'Characters'), 'chars', T.charsCode(signal), { class: 'mono' }),
        ...(signal.ropts ? [field(uiText('editor.commonB.options', 'Options'), 'ropts', signal.ropts, { class: 'mono' })] : []), note(uiText('editor.tm.charsNote1', 'Characters: '), { code: 'H L Z X D{text} U M G S C T' }, uiText('editor.tm.charsNote2', '; a number in front sets the width ('), { code: '3H' }, uiText('editor.tm.charsNote3', '), lower case is half ('), { code: 'h' }, '), ', { code: '4{C}' }, uiText('editor.tm.charsNote4', ' repeats.')),
      ]); return;
    }
    if (an) {
      const periods = uiText('editor.tm.unitPeriods', 'periods');
      show(uiText('editor.tm.arrow', 'Arrow'), uiText('editor.tm.nPeriods', '{n} periods', { n: T.num(Math.abs(an.x2 - an.x1)) }), [field(uiText('editor.tm.label', 'Label'), 'alabel', mathOf(an.t || ''), { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }),
        segments(uiText('editor.tm.tips', 'Tips'), 'tips', tipOpt(an), [['<->', '↔', '<->'], ['->', '→', '->'], ['<-', '←', '<-'], ['|<->|', '|↔|', '|<->|'], ['-', '—', uiText('editor.tm.noTips', 'No tips')]]), segments(uiText('editor.tm.labelSide', 'Label side'), 'side', sideOf(an), [['above', uiText('editor.tm.above', 'Above')], ['below', uiText('editor.tm.below', 'Below')]], !an.t), segments(uiText('editor.tm.line', 'Line'), 'dash', dashedOf(an) ? 1 : 0, [[0, uiText('editor.tm.solid', 'Solid')], [1, uiText('editor.tm.dashed', 'Dashed')]]),
        numeric(uiText('editor.tm.from', 'From'), 'x1', an.x1, periods), numeric(uiText('editor.tm.to', 'To'), 'x2', an.x2, periods), numeric(uiText('editor.tm.height', 'Height'), 'ay', an.y1, uiText('editor.tm.unitUnits', 'units'), 0.25), field(uiText('editor.commonB.options', 'Options'), 'aopts', an.o.filter((it: any) => !/^[<>|]*-[<>|]*$/.test(it.trim()) && !/^(loosely |densely )?(dashed|dotted)$/.test(it.trim())).join(', '), { class: 'mono', placeholder: uiText('editor.tm.optsPlaceholder', 'e.g. blue, thick') }),
      ]); return;
    }
    const bk = selBrk();
    if (bk) { show(uiText('editor.tm.break', 'Break'), bk.ys.length === 1 ? uiText('editor.tm.acrossOne', 'across 1 row') : uiText('editor.tm.acrossN', 'across {n} rows', { n: bk.ys.length }), [numeric(uiText('editor.tm.time', 'Time'), 'bt', bk.t, uiText('editor.tm.unitPeriods', 'periods')), note(uiText('editor.tm.breakNote', 'Drag it along the rows. It is drawn in the extra code, over every row that has a signal.'))]); return; }
    if (mk) { show(uiText('editor.tm.markerLine', 'Marker line'), '\\vertlines', [numeric(uiText('editor.tm.time', 'Time'), 'mt', markVals(mk)[E.sel.j], uiText('editor.tm.unitPeriods', 'periods')), segments(uiText('editor.tm.style', 'Style'), 'mstyle', /help lines/.test(mk.o) ? 'help' : /dashed/.test(mk.o) ? 'dashed' : 'solid', [['help', uiText('editor.tm.helpLine', 'Help line')], ['dashed', uiText('editor.tm.dashed', 'Dashed')], ['solid', uiText('editor.tm.solid', 'Solid')]]), note(uiText('editor.tm.markNote', 'The style is shared by every marker written in the same '), { code: '\\vertlines' }, uiText('editor.tm.markNoteEnd', '.'))]); return; }
    const c = cfg(), grid = M.ext.find((x: any) => x.k === 'grid' || x.k === 'fullgrid'), sl = toptOf('timing/slope'), maxW = M.rows.reduce((a: any, _: any, r: any) => Math.max(a, rowEnd(r)), 0);
    const nsig = M.rows.length, len = T.num(maxW);
    show(uiText('editor.tm.table', 'Table'), nsig === 1 ? uiText('editor.tm.oneSignalPeriods', '1 signal · {len} periods', { len }) : uiText('editor.tm.nSignalsPeriods', '{n} signals · {len} periods', { n: nsig, len }), [numeric(uiText('editor.tm.rowDistance', 'Row distance'), 'rowdist', c.rowdist, uiText('editor.tm.unitHeights', 'heights'), 0.5, { min: '1' }), numeric(uiText('editor.tm.slope', 'Slope'), 'slope', sl != null ? parseFloat(sl) : c.lslope, uiText('editor.tm.unitPeriods', 'periods'), 0.05, { min: '0', max: '1' }), segments(uiText('editor.tm.grid', 'Grid'), 'grid', grid ? grid.k : 'none', [['none', uiText('editor.tm.gridNone', 'None')], ['grid', uiText('editor.tm.gridRows', 'Rows'), '\\tablegrid'], ['fullgrid', uiText('editor.tm.gridFull', 'Full'), '\\fulltablegrid']]),
      note(uiText('editor.tm.tableNote', 'Add a row with the buttons under the last row, from Rows on the left, or by right-clicking a row name. Click a value to paint with it: drag along a row, or click where it starts, point to where it ends (it shows as you go) and click again; click twice on a segment to paint just that one. Or drag any item from the left onto the drawing. Drag over empty space to select segments; ⇧-click one to select up to it. Drag edges to move transitions. Draw arrows between edges for setup, hold and delay times. Double-click a name or data value to type it.'))]);
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { begin(); E.cwSpan = null; E.rdFrom = null; } });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const sg = selSeg(), row = selRow(), an = selAnn(), mk = selMark(), n = parseFloat(t.value), many = selSegs();
    if (many.length > 1) {
      for (const q of many) {
        const r = E.M.rows[q.r], s = r.segs[q.i];
        if (f === 'value' && t.value) { s.c = t.value; if (s.c === 'D' && s.t == null) s.t = ''; if (s.c === 'G') s.w = 0; else if (s.w <= 0) s.w = 1; if (s.c !== 'D') { s.t = null; s.topt = ''; } if (s.c !== 'D' && s.c !== 'U') s.bg = null; }
        else if (f === 'w' && n > 0 && s.c !== 'G') s.w = round(n);
        touch(r);
      }
    } else if (sg) {
      const r = E.M.rows[E.sel.r];
      if (f === 'value') { sg.c = t.value; if (sg.c === 'D' && sg.t == null) sg.t = ''; if (sg.c === 'G') sg.w = 0; else if (sg.w <= 0) sg.w = 1; if (sg.c !== 'D') { sg.t = null; sg.topt = ''; } if (sg.c !== 'D' && sg.c !== 'U') sg.bg = null; }
      else if (f === 'w') { if (!(n > 0)) return; sg.w = round(n); }
      else if (f === 'cw') {
        if (E.cwSpan == null) { const { a, b } = runOf(E.sel.r, E.sel.i); E.cwSpan = r.segs.slice(a, b + 1).reduce((x: any, q: any) => x + q.w, 0); }
        if (!(n >= 0.25)) return;
        E.sel.i = setClockWidth(E.sel.r, E.sel.i, round(n), E.cwSpan);
      }
      else if (f === 't') sg.t = t.value;
      else if (f === 'bg') sg.bg = bgCode(t.value, bgParts(sg.bg).hatch);
      touch(r);
    } else if (row) {
      if (f === 'name') row.name = t.value;
      else if (f === 'init') { row.init = t.value || null; if (row.init) row.ropts = null; }
      else if (f === 'chars') {
        // half-typed braces (or a row break) wait until they are complete; the row keeps its last whole value
        if (!balanced(t.value) || /(^|[^\\])(\\\\|&)/.test(t.value)) return;
        const fr = T.parse(`\\begin{tikztimingtable} & ${t.value} \\\\\\end{tikztimingtable}`).rows[0];
        if (!fr) return;
        row.segs = fr.segs; row.tail = fr.tail;
        if (fr.init || fr.ropts) { row.init = fr.init; row.ropts = fr.ropts; }
      }
      else if (f === 'ropts') row.ropts = t.value.trim() || null;
      touch(row);
    } else if (an) {
      if (f === 'alabel') an.t = wrapMath(t.value) || null;
      else if (f === 'x1' || f === 'x2') { if (!isFinite(n)) return; an[f] = n; }
      else if (f === 'ay') { if (!isFinite(n)) return; an.y1 = an.y2 = n; }
      else if (f === 'aopts') { const keep = an.o.filter((it: any) => /^[<>|]*-[<>|]*$/.test(it.trim()) || /^(loosely |densely )?(dashed|dotted)$/.test(it.trim())); an.o = keep.concat(T.opts(t.value)); }
      xdirty(an);
    } else if (selBrk()) {
      if (f === 'bt') { if (!(n >= 0.2)) return; const x = selBrk(); x.t = n; xdirty(x); }
    } else if (mk) {
      if (f === 'mt') { if (!isFinite(n) || n < 0) return; const v = markVals(mk); v[E.sel.j] = n; setMarks(mk, v); }
    } else {
      if (f === 'rowdist') {
        if (!(n >= 0.5)) return;
        // arrows stay where they were on their own row: measured from the distance the field had on focus,
        // so the in-between values typed on the way (1 before 10) don't move them
        if (!E.rdFrom) { const rd = cfg().rowdist; E.rdFrom = { rd, ys: E.M.ext.map((x: any) => (x.k === 'annot' ? [x.y1, x.y2] : null)) }; }
        const { rd, ys } = E.rdFrom, last = Math.max(0, E.M.rows.length - 1), rowOf = (y: any) => Math.max(0, Math.min(last, Math.floor((1 - y) / rd)));
        setTopt('timing/rowdist', n === 2 ? null : T.num(n));
        E.M.ext.forEach((x: any, i: any) => { if (!ys[i]) return; const [y1, y2] = ys[i]; x.y1 = round(y1 + rowOf(y1) * (rd - n)); x.y2 = round(y2 + rowOf(y2) * (rd - n)); xdirty(x); });
      }
      else if (f === 'slope') { if (!(n >= 0 && n <= 1)) return; setTopt('timing/slope', Math.abs(n - 0.1) < 1e-9 ? null : T.num(n)); }
    }
    if (f === 'rowdist') syncBreaks();
    E.M.dirty = true; draw();
    if (f === 'value' || f === 'init' || f === 'bg') { commit(); renderProps(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, sg = selSeg(), an = selAnn(), mk = selMark();
    edit(() => {
      if (sg && f === 'bgpat') { sg.bg = bgCode(bgParts(sg.bg).c, v === '1'); touch(E.M.rows[E.sel.r]); }
      else if (sg && f === 'newv') { sg.t = v === '1' ? '' : null; touch(E.M.rows[E.sel.r]); }
      else if (an && f === 'tips') { setTip(an, v); xdirty(an); }
      else if (an && f === 'side') { setSide(an, v); xdirty(an); }
      else if (an && f === 'dash') { setDashed(an, v === '1'); xdirty(an); }
      else if (mk && f === 'mstyle') { mk.o = v === 'help' ? 'help lines' : v === 'dashed' ? 'densely dashed' : ''; xdirty(mk); }
      else if (f === 'grid') {
        E.M.ext = E.M.ext.filter((x: any) => x.k !== 'grid' && x.k !== 'fullgrid');
        if (v !== 'none') E.M.ext.unshift({ k: v, star: false, o: '', dirty: true });
        if (E.sel && E.sel.x != null) E.sel = null;
      }
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-te="undo"]', root).disabled = !E.undo.length;
    $('[data-te="redo"]', root).disabled = !E.redo.length;
    $('[data-te="delete"]', root).disabled = !E.sel;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-te]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.te, b);
  });
  function act(a: any, b?: any) {
    const s = E.sel;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'sdel' || a === 'rdel' || a === 'adel' || a === 'mdel' || a === 'bdel') deleteSel();
    else if (a === 'label') { if (s) editLabel(s); }
    else if (a.startsWith('add:')) addRow(a.slice(4), E.M.rows.length);
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = uiText('ui.copied', 'Copied'); setTimeout(() => (b.textContent = uiText('ui.copy', 'Copy')), 1200); });
    else if (!s) return;
    else if (a === 'split' && s.r != null) splitSeg(s.r, s.i, snapT(E.menuAt, true));
    else if (a === 'rowsel' && s.r != null) { E.sel = { row: s.r }; draw(); renderProps(); }
    else if (a === 'up') moveRow(s.row, -1);
    else if (a === 'down') moveRow(s.row, 1);
    else if (a === 'dup') dupRow(s.row);
    else if (a === 'insa' && s.row != null) addRow('signal', s.row);
    else if (a === 'insb' && s.row != null) addRow('signal', s.row + 1);
    else if (a === 'side') { const x = selAnn(); if (x) edit(() => { setSide(x, sideOf(x) === 'above' ? 'below' : 'above'); xdirty(x); }); }
    else if (a === 'flip') { const x = selAnn(); if (x) edit(() => { const tp = tipOpt(x), rev = tp.split('').reverse().map((c: any) => (({ '<': '>', '>': '<' } as Record<string, any>)[c] || c)).join(''); setTip(x, rev); xdirty(x); }); }
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M;
    const nA = M.ext.filter((x: any) => x.k === 'annot').length;
    count.textContent = `${M.rows.length === 1 ? uiText('editor.tm.oneSignal', '1 signal') : uiText('editor.tm.nSignals', '{n} signals', { n: M.rows.length })} · ${nA === 1 ? uiText('editor.tm.oneArrow', '1 arrow') : uiText('editor.tm.nArrows', '{n} arrows', { n: nA })}`;
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, T.layout({ src: c }).warnings);
  }
  function readCode() {
    dropPaint();
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps();
    showCodeNotes(codeMsg, T.layout({ src: codeTa.value }).warnings);
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  // ←/→: the neighbouring segment; ↑/↓: the row above or below, at the same time
  function step(dx: any, dy: any) {
    const s = E.sel;
    if (!s || (s.r == null && s.row == null)) { if (E.M.rows.length && E.M.rows[0].segs.length) { E.sel = { r: 0, i: 0 }; draw(); renderProps(); } return; }
    if (s.row != null) { const r = Math.max(0, Math.min(E.M.rows.length - 1, s.row + dy)); E.sel = dx > 0 && E.M.rows[r].segs.length ? { r, i: 0 } : { row: r }; draw(); renderProps(); return; }
    if (dx) { const n = E.M.rows[s.r].segs.length, i = s.i + dx; if (i < 0) E.sel = { row: s.r }; else E.sel = { r: s.r, i: Math.min(n - 1, i) }; }
    else {
      const sp = spansOf(s.r)[s.i], r = s.r + dy;
      if (r < 0 || r >= E.M.rows.length) return;
      const t = (sp.a + sp.b) / 2, q = spansOf(r).find((x: any) => t >= x.a && t < x.b) || spansOf(r)[spansOf(r).length - 1];
      E.sel = q ? { r, i: q.i } : { row: r };
    }
    draw(); renderProps();
  }
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
      if (cancelDnd() || dropPaint()) return;
      if (E.arm) { E.arm = null; buildPalette(); setHint(''); draw(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel) { e.preventDefault(); if (!editLabel(E.sel)) focusField(); return; }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0); return; }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the diagram back to the page (one undo step there) and keep editing
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.commonB.discardDiagram', 'Discard changes to this diagram?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, view: { ox: 0, oy: 0, k: 30 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setHint('');
    // the palette, panel and drawing's captions follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.timingEditor = { open, dockable: true, close: () => dock.detach(), paint, norm };
})();
