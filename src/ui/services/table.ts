import { previewFadeFinished } from '../../platform/preview-fade';
import { runtime as TD } from '../../runtime';
import { renderView, destroyView } from '../render-view.svelte';
import { openContextMenu, closeContextMenu } from '../kit/context-menu';
import type { MenuEntry, MenuItemSpec } from '../kit/menu';
import { iconSvg, type IconName } from '../kit/icons';
import TableWorkspace, { type TableWorkspaceModel } from '../TableWorkspace.svelte';
import TablePanel, { type TablePanelModel } from '../TablePanel.svelte';
import { t, message as msg, caption, onLocale, type Message } from '../../i18n';
import type { TableModel, TCell, Range, HAlign, BorderWhere, Rule } from '../../domain/table/model';
import { patchSvg } from '../svg-patch';
import { labelBudget, laterPicture } from '../../domain/label-image';
import { escapeHtml } from '../../core/html';
import type { HintKind } from './hint-toast';
// milliseconds of new cell pictures the preview makes a frame
const PICTURE_MS = 10;
// Table: a quick tool for one table, beside the files like Quick. Import (paste or drop CSV, TSV, Excel,
// Google Sheets, Markdown, HTML or a LaTeX tabular), edit and format in a spreadsheet-like grid, then copy or
// download the LaTeX, an SVG or a PNG. It is not a file: the table is kept in this browser until the next
// import, and the file that was open stays open underneath.
//
// The grid shows each cell as it will look (maths typeset, numbers rounded); editing shows its LaTeX text.
// The right panel (#props) holds the table's, the column's and the cell's settings; the pane under the grid
// is the live preview, drawn by the same renderer as the SVG and PNG, and the LaTeX.
(function () {
  'use strict';
  const host = document.getElementById('tableview');
  if (!host) return;
  const T = TD.table;
  const KEY = 'diagramtex.table', OUT_KEY = 'diagramtex.table.out';
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = mac ? '⌘' : 'Ctrl+', SHIFT = mac ? '⇧' : 'Shift+';
  const esc = escapeHtml;
  const $ = (s: string) => host.querySelector(s) as HTMLElement;
  const PX = TD.PX_PER_CM;

  // ---------------------------------------------------------------- state
  let M: TableModel = T.create(4, 3, 'booktabs');
  let fresh = true; // nothing imported or typed yet: the start screen shows
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { const o = JSON.parse(saved); M = T.normalize(o.table); fresh = !!o.fresh; }
  } catch (e: any) { /* storage blocked or bad data: a new table */ }
  const out = { tab: 'preview', dpi: 300, transparent: false, autoMath: true };
  try { Object.assign(out, JSON.parse(localStorage.getItem(OUT_KEY) || '{}')); } catch (e: any) { /* storage blocked */ }
  if (![150, 300, 600].includes(+out.dpi)) out.dpi = 300;
  // selection: the active cell and the other corner of the range
  let act: [number, number] = [0, 0], ext: [number, number] = [0, 0];
  // a cell being edited: in place in a LaTeX text field (ta), or in MathLive's popup (pop), as the Text input setting says
  type Edit = { r: number; c: number; was: string; ta: HTMLTextAreaElement | null; pop: { close(): void } | null; v: string; cancel?: boolean };
  let editing: Edit | null = null;
  const undoStack: string[] = [], redoStack: string[] = [];
  let shown = false;
  // editing a Table block from the diagram (editBlock): the workspace's own table waits in `stash` meanwhile
  let session: { done: (r: { src: string; table: TableModel }) => void; start: string; cancel?: boolean } | null = null;
  let stash: { M: TableModel; fresh: boolean; undo: string[]; redo: string[]; act: [number, number]; ext: [number, number] } | null = null;

  const range = (): Range => T.expand(M, T.rangeOf(act, ext));
  const clampSel = () => {
    const nr = T.nRows(M) - 1, nc = T.nCols(M) - 1;
    act = [Math.min(act[0], nr), Math.min(act[1], nc)]; ext = [Math.min(ext[0], nr), Math.min(ext[1], nc)];
    // the active cell is a merge's anchor
    const own = T.owners(M);
    act = own[act[0]][act[1]].slice() as [number, number];
  };
  let saveTimer: any = null;
  function save() {
    if (session) return; // a Table block's table: it goes back to the diagram, not into the workspace's storage
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ table: M, fresh })); } catch (e: any) { /* too large or blocked */ } }, 200);
  }
  // Leaving the page (reload, the tab closed or put away): saved at once, with the text of a cell still being typed
  // into, which is otherwise kept only when its editor closes. The editor stays open.
  function saveNow() {
    if (session) return;
    clearTimeout(saveTimer);
    let table = M;
    if (editing) {
      const v = editing.pop ? editing.v : editing.ta!.value;
      table = JSON.parse(JSON.stringify(M));
      if (table.cells[editing.r]?.[editing.c]) table.cells[editing.r][editing.c].t = v;
    }
    try { localStorage.setItem(KEY, JSON.stringify({ table, fresh: fresh && !editing })); } catch { /* too large or blocked */ }
  }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  /** One undoable change: fn edits M; the grid, panel and preview follow. */
  function change(fn: () => unknown) {
    const before = JSON.stringify(M);
    const res = fn();
    if (res === false) return false;
    const after = JSON.stringify(M);
    if (after === before) return false;
    undoStack.push(before); if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    fresh = false;
    clampSel();
    save();
    paint();
    panel(); // in place: a field being typed in keeps its text
    preview();
    return true;
  }
  // Off for now (too eager on real data): the code stays, the checkbox is hidden. Turning it on is AUTO_MATH = true.
  const AUTO_MATH = false;
  // Numbers that come in (typed, pasted, imported) become maths, unless turned off (out.autoMath): a step of its
  // own, so ⌘Z takes the $…$ off and keeps the text. siunitx columns (Align decimals) read their numbers bare.
  function wrapNumbersIn(g: Range) {
    if (!AUTO_MATH || out.autoMath === false) return;
    const next: [number, number, string][] = [];
    for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
      const cell = M.cells[r]?.[c];
      if (!cell || M.cols[c]?.num) continue;
      const v = T.wrapNumbers(cell.t);
      if (v !== cell.t) next.push([r, c, v]);
    }
    if (next.length) change(() => { for (const [r, c, v] of next) M.cells[r][c].t = v; });
  }
  const whole = (): Range => ({ r0: 0, c0: 0, r1: T.nRows(M) - 1, c1: T.nCols(M) - 1 });

  function undo() {
    finishEdit(true);
    if (!undoStack.length) { hint(t('table.hint.noUndo', 'Nothing to undo'), undefined, 'warn'); return; }
    redoStack.push(JSON.stringify(M)); M = T.normalize(JSON.parse(undoStack.pop()!));
    clampSel(); save(); refresh();
  }
  function redo() {
    finishEdit(true);
    if (!redoStack.length) { hint(t('table.hint.noRedo', 'Nothing to redo'), undefined, 'warn'); return; }
    undoStack.push(JSON.stringify(M)); M = T.normalize(JSON.parse(redoStack.pop()!));
    clampSel(); save(); refresh();
  }
  function hint(text: string, ms = 1600, kind?: HintKind) { if (TD.app && TD.app.showHint) TD.app.showHint(text, ms, kind); }

  // ---------------------------------------------------------------- icons
  // the toolbar's text glyphs (its drawn icons are the kit's: src/ui/kit/icons.ts)
  const I = {
    b: '<b class="tb-glyph">B</b>', i: '<i class="tb-glyph" style="font-family:Georgia,serif">I</i>', u: '<span class="tb-glyph" style="text-decoration:underline">U</span>', tt: '<span class="tb-glyph tb-mono">T</span>',
    num: '<span class="tb-glyph tb-mono" style="font-size:12px">.00</span>',
  };
  const B: Record<BorderWhere, IconName> = {
    all: 'borderAll', outer: 'borderOuter', inner: 'borderInner', innerH: 'borderInnerH', innerV: 'borderInnerV',
    top: 'borderTop', bottom: 'borderBottom', left: 'borderLeft', right: 'borderRight', none: 'borderNone',
  };
  const BNAME = (): Record<BorderWhere, string> => ({ all: t('table.border.all', 'All borders'), outer: t('table.border.outer', 'Outer borders'), inner: t('table.border.inner', 'Inner borders'), innerH: t('table.border.innerH', 'Inner horizontal'), innerV: t('table.border.innerV', 'Inner vertical'), top: t('table.border.top', 'Top border'), bottom: t('table.border.bottom', 'Bottom border'), left: t('table.border.left', 'Left border'), right: t('table.border.right', 'Right border'), none: t('table.border.none', 'No borders') });
  // the presets' names and descriptions (the domain's PRESETS holds the English)
  const PRESET: Record<string, [Message, Message]> = {
    booktabs: [msg('table.preset.booktabs', 'Academic'), msg('table.preset.booktabs.tip', 'booktabs: a heavy rule on top and at the bottom, a light one under the header, no vertical rules')],
    minimal: [msg('table.preset.minimal', 'Minimal'), msg('table.preset.minimal.tip', 'A rule under the header only')],
    grid: [msg('table.preset.grid', 'Grid'), msg('table.preset.grid.tip', 'Every cell boxed, the header in bold')],
    striped: [msg('table.preset.striped', 'Striped'), msg('table.preset.striped.tip', 'Every other row shaded, a rule under the header, the header in bold')],
    plain: [msg('table.preset.plain', 'Plain'), msg('table.preset.plain.tip', 'No rules at all')],
  };
  const presetName = (p: any) => (PRESET[p.key] ? caption(PRESET[p.key][0]) : p.name);
  const presetTip = (p: any) => (PRESET[p.key] ? caption(PRESET[p.key][1]) : p.title);

  // ---------------------------------------------------------------- the frame (ui/TableWorkspace.svelte)
  // The toolbar, the cell-text bar, the output bar and the start screen are drawn from shellModel(), in place; the
  // grid, the preview and the LaTeX are drawn into its empty panes here.
  let built = false;
  function build() {
    renderView(host!, TableWorkspace, shellModel());
    built = true;
    paint(); panel(); preview(); startScreen();
  }
  function renderShell() { if (built && shown) renderView(host!, TableWorkspace, shellModel()); }
  let copied = '', copiedTimer: any = null, packages = { text: '', title: '' };
  function shellModel(): TableWorkspaceModel {
    const x = M.cells[act[0]][act[1]], all = anchorsSel(), g = range();
    return {
      session: !!session, fresh, mod: MOD, shift: SHIFT,
      icons: { b: I.b, i: I.i, u: I.u, tt: I.tt, num: I.num, border: B[lastBorder] },
      // the colour buttons' bars show the colour they apply
      colours: { ...lastColour },
      borderName: borderPicked ? BNAME()[lastBorder] : '',
      presets: [...T.PRESETS.map((p: any) => ({ value: p.key, label: presetName(p), title: presetTip(p) })), { value: 'custom', label: t('ui.custom', 'Custom'), disabled: true }],
      preset: M.preset,
      on: {
        b: all.every((y, i) => !!y.b || (M.headBold && rowOfAnchor(g, i) < M.head)),
        i: all.every((y) => !!y.i), u: all.every((y) => !!y.u), tt: all.every((y) => !!y.tt), num: !!M.cols[act[1]].num,
      },
      align: T.alignOf(M, act[1], x),
      can: { undo: undoStack.length > 0, redo: redoStack.length > 0, merge: g.r0 !== g.r1 || g.c0 !== g.c1, split: all.some((y) => y.rs || y.cs) },
      ref: g.r0 === g.r1 && g.c0 === g.c1 ? T.cellName(act[0], act[1]) : `${T.cellName(g.r0, g.c0)}:${T.cellName(g.r1, g.c1)}`,
      fx: x.t.replace(/\n/g, ' \\\\ '),
      tab: out.tab === 'latex' ? 'latex' : 'preview', dpi: +out.dpi, copied, packages,
    };
  }

  // ---------------------------------------------------------------- the start screen (nothing imported yet)
  function startScreen() {
    host!.classList.toggle('is-fresh', fresh);
    renderShell();
  }

  // ---------------------------------------------------------------- the grid
  const cellCss = (r: number, c: number, x: TCell) => {
    const st: string[] = [];
    const al = T.alignOf(M, c, x), fill = x.bg || T.stripeOf(M, r);
    st.push(`text-align:${({ l: 'left', c: 'center', r: 'right', j: 'justify' } as any)[al]}`);
    st.push(`vertical-align:${x.va === 'm' ? 'middle' : x.va === 'b' ? 'bottom' : (x.rs || 1) > 1 ? 'middle' : 'top'}`);
    if (T.isBold(M, r, x)) st.push('font-weight:bold');
    if (x.i) st.push('font-style:italic');
    if (x.fg) st.push(`color:${x.fg}`);
    if (fill) st.push(`background:${fill}`);
    if (x.sz && x.sz !== M.size) st.push(`font-size:${(TD.sizePx(x.sz) as number).toFixed(2)}px`);
    // rules: the strongest on each edge
    const cs = x.cs || 1, rs = x.rs || 1;
    const bw = (w: number) => (w === 3 ? '3px double var(--tb-rule)' : w === 2 ? '2px solid var(--tb-rule)' : w === 1 ? '1px solid var(--tb-rule)' : '');
    const top = Math.max(...M.hr[r].slice(c, c + cs)), bot = Math.max(...M.hr[r + rs].slice(c, c + cs));
    const lef = Math.max(...M.vr.slice(r, r + rs).map((row) => row[c])), rig = Math.max(...M.vr.slice(r, r + rs).map((row) => row[c + cs]));
    if (top) st.push(`border-top:${bw(top)}`);
    if (bot) st.push(`border-bottom:${bw(bot)}`);
    if (lef) st.push(`border-left:${bw(lef)}`);
    if (rig) st.push(`border-right:${bw(rig)}`);
    return st.join(';');
  };
  /** What a cell shows in the grid: numbers rounded as they will print, maths typeset. */
  function cellHtml(r: number, c: number, x: TCell) {
    const col = M.cols[c];
    if (col.num && r >= M.head && (x.cs || 1) === 1) {
      const n = T.parseNum(x.t);
      if (n) return cellPreview(T.mathText(T.format(n, col.num), col.num.unc || 'paren', T.numStyle(col.num)));
    }
    let t = T.shownText(M, r, c, x);
    if (!t.trim()) return '';
    if (x.tt) t = t.split('\n').map((l: string) => (l.trim() ? `\\texttt{${l}}` : l)).join('\n');
    if (x.u) t = t.split('\n').map((l: string) => (l.trim() ? `\\underline{${l}}` : l)).join('\n');
    try { return cellPreview(t); } catch (e: any) { return esc(t); }
  }
  function cellPreview(text: string): string {
    const html = TD.math.liveMarkup(TD.textHtml(text));
    return TD.math.isPending(html) ? `<span class="math-pending" data-math-pending="${TD.math.pendingIds(html).join(',')}">${TD.math.cleanPreview(html)}</span>` : html;
  }
  // A column with a width wraps its text at that width, as p{w} does in the output: the <col> holds the cell's
  // padding and border too (.tg td .tg-in in table.css: 8px each side, a 1px rule), not only the text.
  const CELL_EXTRA = 2 * 8 + 1;
  const colPx = (w: number) => w * PX + CELL_EXTRA;
  // a column header's letter and badges (.00 aligned decimals, its width, X)
  function headLabel(c: number): string {
    const col = M.cols[c];
    return `<span>${T.colName(c)}</span>${col.num ? `<i title="${esc(t('table.numAligned', 'Numbers aligned on the decimal point'))}">.00</i>` : ''}${col.w > 0 ? `<i title="${esc(t('table.wrapsAt', 'Wraps at {w} cm', { w: col.w }))}">${col.w}cm</i>` : col.fill && M.env === 'tabularx' ? `<i title="${esc(t('table.fillTip', 'Takes the rest of the width (X)'))}">X</i>` : ''}`;
  }
  function paint(): void {
    if (!TD.math.previewing) return TD.math.preview(paint);
    const g = $('.tb-grid');
    if (!g) return;
    const nr = T.nRows(M), nc = T.nCols(M), own = T.owners(M);
    const wrap = $('.tb-gridwrap'), keep = [wrap.scrollLeft, wrap.scrollTop];
    // a column's edge is grabbed from either side: the half on the next header (which would cover a handle
    // reaching over it) belongs to the column on the left
    const rsTip = esc(t('table.resizeTip', 'Drag to set a width (the column wraps); double-click for automatic'));
    const colW = (c: number) => (M.cols[c].w > 0 ? `${colPx(M.cols[c].w).toFixed(1)}px` : 'auto');
    let h = `<table class="tg" style="font-size:${(TD.sizePx(M.size) as number).toFixed(2)}px;--tb-stretch:${M.stretch}${M.ruleColor ? `;--tb-rule:${M.ruleColor}` : ''}"><colgroup><col class="tg-rhc">${M.cols.map((_: any, c: number) => `<col style="width:${colW(c)}">`).join('')}</colgroup>`;
    h += `<thead><tr><th class="tg-corner" data-all title="${esc(t('table.selectAllTip', 'Select all ({key})', { key: MOD + 'A' }))}"><span class="sr-only">${esc(t('table.selectAllTip', 'Select all ({key})', { key: MOD + 'A' }))}</span></th>${M.cols.map((col: any, c: number) => `<th class="tg-ch${col.num ? ' num' : ''}" data-ch="${c}"><span class="tg-chl">${headLabel(c)}</span>${c ? `<span class="tg-rs tg-rs-l" role="separator" aria-orientation="vertical" data-rs="${c - 1}" title="${rsTip}"></span>` : ''}<span class="tg-rs" role="separator" aria-orientation="vertical" data-rs="${c}" title="${rsTip}"></span></th>`).join('')}</tr></thead><tbody>`;
    for (let r = 0; r < nr; r++) {
      h += `<tr class="${r < M.head ? 'hd' : ''}${r === M.head - 1 ? ' hd-last' : ''}"><th class="tg-rh" data-rh="${r}">${r + 1}</th>`;
      for (let c = 0; c < nc; c++) {
        if (own[r][c][0] !== r || own[r][c][1] !== c) continue;
        const x = M.cells[r][c];
        h += `<td data-r="${r}" data-c="${c}"${x.rs ? ` rowspan="${x.rs}"` : ''}${x.cs ? ` colspan="${x.cs}"` : ''} style="${cellCss(r, c, x)}"><div class="tg-in${M.cols[c].w > 0 ? ' wrap' : ''}">${cellHtml(r, c, x)}</div></td>`;
      }
      h += '</tr>';
    }
    // the strips past the last column and under the last row: hovering one shows a + that adds a column or a row
    const plus = iconSvg('add');
    g.innerHTML = `<div class="tg-box">${h}</tbody></table><button type="button" class="tg-add tg-addc" data-add="col" title="${esc(t('table.addCol', 'Add a column'))}" aria-label="${esc(t('table.addCol', 'Add a column'))}">${plus}</button><button type="button" class="tg-add tg-addr" data-add="row" title="${esc(t('table.addRow', 'Add a row'))}" aria-label="${esc(t('table.addRow', 'Add a row'))}">${plus}</button></div>`;
    // a button doesn't stretch between top and bottom like a div does, so the strips get their size here
    const tbl = g.querySelector('table') as HTMLElement, addc = g.querySelector('.tg-addc') as HTMLElement, addr = g.querySelector('.tg-addr') as HTMLElement;
    addc.style.top = '4px'; addc.style.height = Math.max(0, tbl.offsetHeight - 4) + 'px';
    addr.style.left = '4px'; addr.style.width = Math.max(0, tbl.offsetWidth - 4) + 'px';
    wrap.scrollLeft = keep[0]; wrap.scrollTop = keep[1];
    syncSel();
    rankVisibleMaths();
  }
  // Formulae compile in rank order: the cells on screen first (0), then a screen's height around them (1),
  // then the rest (2), so what is shown fills in first however large the table is.
  let rankFrame = 0;
  function rankVisibleMaths() {
    if (rankFrame) return;
    rankFrame = requestAnimationFrame(() => {
      rankFrame = 0;
      const wrap = $('.tb-gridwrap');
      if (!shown || !wrap) return;
      const view = wrap.getBoundingClientRect(), near = view.height, ranks: number[][] = [[], []];
      for (const span of host!.querySelectorAll<HTMLElement>('.tg td .math-pending[data-math-pending]')) {
        const r = span.getBoundingClientRect();
        const rank = r.bottom >= view.top && r.top <= view.bottom && r.right >= view.left && r.left <= view.right ? 0
          : r.bottom >= view.top - near && r.top <= view.bottom + near ? 1 : -1;
        if (rank >= 0) for (const id of span.dataset.mathPending!.split(',')) ranks[rank].push(+id);
      }
      ranks.forEach((ids, rank) => { if (ids.length) TD.math.prioritize(ids, rank); });
    });
  }
  const tdAt = (r: number, c: number) => host!.querySelector(`.tg td[data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
  // the range's frame (red pen) and the headers it covers
  function syncSel(scroll = false) {
    const g = range(), box = $('.tb-selbox'), wrap = $('.tb-gridwrap');
    if (!box) return;
    const a = tdAt(g.r0, g.c0), own = T.owners(M);
    const [er, ec] = own[g.r1][g.c1], b = tdAt(er, ec);
    if (!a || !b) { box.hidden = true; return; }
    const wr = wrap.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    box.hidden = false;
    box.style.left = ra.left - wr.left + wrap.scrollLeft + 'px';
    box.style.top = ra.top - wr.top + wrap.scrollTop + 'px';
    box.style.width = rb.right - ra.left + 'px';
    box.style.height = rb.bottom - ra.top + 'px';
    box.classList.toggle('multi', g.r0 !== g.r1 || g.c0 !== g.c1);
    host!.querySelectorAll('.tg td.act').forEach((e) => e.classList.remove('act'));
    tdAt(act[0], act[1])?.classList.add('act');
    host!.querySelectorAll('.tg-ch, .tg-rh').forEach((e) => {
      const el = e as HTMLElement, c = el.dataset.ch, r = el.dataset.rh;
      el.classList.toggle('on', c != null ? +c >= g.c0 && +c <= g.c1 : +r! >= g.r0 && +r! <= g.r1);
    });
    // (the cell's name and text are in the frame's model; the text is written here too, for an edit put back)
    const fx = $('.tb-fxin') as HTMLInputElement;
    if (fx && document.activeElement !== fx) fx.value = M.cells[act[0]][act[1]].t.replace(/\n/g, ' \\\\ ');
    if (scroll) {
      const r = tdAt(act[0], act[1])!.getBoundingClientRect(), head = 28;
      if (r.top < wr.top + head) wrap.scrollTop -= wr.top + head - r.top;
      else if (r.bottom > wr.bottom - 12) wrap.scrollTop += r.bottom - wr.bottom + 12;
      if (r.left < wr.left + 40) wrap.scrollLeft -= wr.left + 40 - r.left;
      else if (r.right > wr.right - 12) wrap.scrollLeft += r.right - wr.right + 12;
    }
    toolbarState();
  }
  function select(a: [number, number], e?: [number, number], scroll = true) {
    finishEdit();
    const own = T.owners(M);
    act = own[a[0]][a[1]].slice() as [number, number];
    ext = e ? e : act.slice() as [number, number];
    syncSel(scroll);
    panel();
  }
  // the next cell in a direction, past merges
  function step(from: [number, number], dr: number, dc: number): [number, number] {
    const own = T.owners(M), nr = T.nRows(M), nc = T.nCols(M);
    let [r, c] = from;
    const [ar, ac] = own[r][c], x = M.cells[ar][ac];
    if (dr > 0) r = ar + (x.rs || 1); else if (dr < 0) r = ar - 1;
    if (dc > 0) c = ac + (x.cs || 1); else if (dc < 0) c = ac - 1;
    if (dr) c = from[1];
    if (dc) r = from[0];
    return [Math.max(0, Math.min(nr - 1, r)), Math.max(0, Math.min(nc - 1, c))];
  }

  // ---------------------------------------------------------------- editing a cell in place
  function startEdit(text?: string) {
    if (editing) return;
    const [r, c] = act, td = tdAt(r, c);
    if (!td) return;
    const x = M.cells[r][c], wrap = $('.tb-gridwrap');
    const v0 = text != null ? text : x.t;
    const fxShow = (v: string) => { const fx = $('.tb-fxin') as HTMLInputElement; if (fx) fx.value = v.replace(/\n/g, ' \\\\ '); };
    if (TD.input && TD.input.mode === 'mathlive') {
      // MathLive: the label popup the block editors use, under the cell
      const ed: Edit = { r, c, was: x.t, ta: null, pop: null, v: v0 };
      editing = ed;
      ed.pop = TD.input.popup(wrap, {
        text: v0,
        at: () => {
          const cell = tdAt(r, c), a = wrap.getBoundingClientRect();
          if (!cell) return [0, 0];
          const b = cell.getBoundingClientRect();
          return [b.left - a.left + wrap.scrollLeft + b.width / 2, b.bottom - a.top + wrap.scrollTop + 4];
        },
        onInput: (v: string) => { ed.v = v; fxShow(v); },
        onDone: () => { if (editing === ed) { finishEdit(!!ed.cancel); focusGrid(); } },
      });
      return;
    }
    const ta = document.createElement('textarea');
    ta.className = 'tb-edit';
    ta.spellcheck = false;
    ta.rows = 1; // grows with its text (fit), from one line
    ta.dataset.tx = 'text'; // maths green, LaTeX suggestions and bracket pairs (texhighlight.ts, texcomplete.ts)
    ta.setAttribute('aria-label', t('table.cellAria', 'Cell {name}', { name: T.cellName(r, c) }));
    ta.value = v0;
    const wr = wrap.getBoundingClientRect(), rr = td.getBoundingClientRect();
    ta.style.left = rr.left - wr.left + wrap.scrollLeft + 'px';
    ta.style.top = rr.top - wr.top + wrap.scrollTop + 'px';
    ta.style.minWidth = Math.max(rr.width, 120) + 'px';
    ta.style.minHeight = rr.height + 'px';
    wrap.appendChild(ta);
    editing = { r, c, was: x.t, ta, pop: null, v: v0 };
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; ta.style.width = 'auto'; ta.style.width = Math.min(Math.max(rr.width, 120, ta.scrollWidth + 4), 560) + 'px'; };
    ta.addEventListener('input', () => { fit(); fxShow(ta.value); });
    ta.addEventListener('keydown', editKeys);
    ta.addEventListener('blur', () => { if (editing && editing.ta === ta) finishEdit(); });
    fit();
    ta.focus({ preventScroll: true });
    const n = ta.value.length; ta.setSelectionRange(n, n);
  }
  function finishEdit(cancel = false) {
    if (!editing) return;
    const ed = editing, { r, c, was } = ed;
    editing = null;
    let v: string;
    if (ed.pop) { v = ed.v; ed.pop.close(); } else { v = ed.ta!.value; ed.ta!.remove(); }
    if (!cancel && v !== was && M.cells[r] && M.cells[r][c]) { change(() => { M.cells[r][c].t = v; }); wrapNumbersIn({ r0: r, c0: c, r1: r, c1: c }); }
    else syncSel();
  }
  function editKeys(e: KeyboardEvent) {
    const ta = e.target as HTMLTextAreaElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(true); focusGrid(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); finishEdit(); select(step(act, e.metaKey || e.ctrlKey ? 0 : 1, 0)); focusGrid(); return; }
    if (e.key === 'Tab') {
      const to = step(act, 0, e.shiftKey ? -1 : 1);
      finishEdit();
      // nowhere further along the row: from the grid (the editor is gone), focus moves on out of it
      if (to[0] === act[0] && to[1] === act[1]) { focusGrid(); return; }
      e.preventDefault(); select(to); focusGrid(); return;
    }
    // ⌘B etc. wrap the selected text
    if ((e.metaKey || e.ctrlKey) && /^[biu]$/i.test(e.key)) {
      e.preventDefault();
      const cmd = ({ b: 'textbf', i: 'textit', u: 'underline' } as any)[e.key.toLowerCase()];
      const a = ta.selectionStart, z = ta.selectionEnd;
      ta.setRangeText(`\\${cmd}{${ta.value.slice(a, z)}}`, a, z, a === z ? 'end' : 'select');
      if (a === z) ta.setSelectionRange(a + cmd.length + 2, a + cmd.length + 2);
      ta.dispatchEvent(new Event('input'));
    }
    e.stopPropagation();
  }
  const focusGrid = () => ($('.tb-gridwrap') as HTMLElement)?.focus({ preventScroll: true });
  // the sidebar's Text input switch (LaTeX | MathLive) shows here too; the next edit opens in the new mode
  if (TD.input) TD.input.onChange(() => { if (editing) finishEdit(); });
  // Esc in the MathLive popup puts the cell back (the popup itself finishes on Esc and on Enter alike)
  host.addEventListener('keydown', (e) => { if (editing && editing.pop && e.key === 'Escape') editing.cancel = true; }, true);

  // ---------------------------------------------------------------- formatting
  const anchorsSel = () => T.anchorsIn(M, range()) as TCell[];
  /** A flag on when every selected cell has it: pressing turns it on for all, or off when all have it. */
  function toggle(k: 'b' | 'i' | 'u' | 'tt') {
    const g = range();
    const on = anchorsSel().every((x, i) => (k === 'b' ? x.b || (M.headBold && rowOfAnchor(g, i) < M.head) : x[k]));
    change(() => {
      if (k === 'b' && on && M.headBold && g.r0 < M.head) {
        // bold header rows: un-bolding them in the header turns the table's header bold off, keeping the others bold
        M.headBold = false;
        for (let r = 0; r < M.head; r++) for (let c = 0; c < T.nCols(M); c++) if (!(r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1)) M.cells[r][c].b = true;
      }
      T.styleRange(M, g, { [k]: !on });
    });
  }
  function rowOfAnchor(g: Range, i: number) {
    const own = T.owners(M);
    let n = 0;
    for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (own[r][c][0] === r && own[r][c][1] === c) { if (n === i) return r; n++; }
    return 0;
  }
  function setAlign(a: HAlign) {
    const g = range();
    // whole columns selected: the column's alignment; otherwise the cells'
    if (g.r0 === 0 && g.r1 === T.nRows(M) - 1) change(() => { for (let c = g.c0; c <= g.c1; c++) M.cols[c].al = a; T.styleRange(M, g, { al: undefined }); });
    else change(() => T.styleRange(M, g, { al: a }));
  }
  let lastBorder: BorderWhere = 'all', borderPicked = false;
  function border(where: BorderWhere, w: Rule = 1) { lastBorder = where; borderPicked = true; if (!change(() => T.setBorders(M, range(), where, w))) renderShell(); }
  // The colour buttons apply the last colour picked (not the cell's own); their arrows pick another, which
  // applies to the selection as it is picked and becomes the last colour.
  const lastColour: Record<'fg' | 'bg', string> = { fg: '#c62828', bg: '#f5e44c' };
  function applyColour(k: 'fg' | 'bg') {
    const g = range();
    change(() => T.styleRange(M, g, { [k]: lastColour[k] }));
  }
  function pickColor(btn: HTMLElement, k: 'fg' | 'bg') {
    const g = range();
    const before = JSON.stringify(M);
    let changed = false;
    const set = (v: any) => {
      const hex = v ? TD.parseColor(v).hex : undefined;
      if (hex) { lastColour[k] = hex; renderShell(); }
      T.styleRange(M, g, { [k]: hex }); changed = true; paint(); preview();
    };
    TD.openColorPicker(btn, {
      value: lastColour[k], nullable: true, noneLabel: k === 'fg' ? t('table.automatic', 'Automatic') : t('table.noFill', 'No Fill'),
      onInput: set, onChange: set,
      onClose: () => { if (changed && JSON.stringify(M) !== before) { undoStack.push(before); redoStack.length = 0; fresh = false; save(); panel(); renderShell(); } focusGrid(); },
    });
  }
  function toggleNum() {
    const g = range(), cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, k) => g.c0 + k);
    const on = cols.every((c) => M.cols[c].num);
    change(() => { for (const c of cols) M.cols[c].num = on ? null : startNum(c); });
    if (!on) hint(t('table.hint.numOn', 'Numbers aligned on the decimal point (siunitx S column). Round them in the panel on the right.'), 2600, 'info');
  }
  /** the toolbar follows the selection (shellModel) */
  const toolbarState = renderShell;

  // ---------------------------------------------------------------- menus (the kit menu: borders, number format, import, right-click)
  let menuFrom: Element | null = null, menuOpen = false;
  function closeMenu() { if (menuOpen) closeContextMenu(); }
  /** a menu at a point, or under the control that opens it (pressing that control again shuts it) */
  function openMenu(items: MenuEntry[], at: { x: number; y: number } | HTMLElement) {
    const from = at instanceof HTMLElement ? at : null;
    if (from && menuOpen && menuFrom === from) { closeMenu(); return; }
    openContextMenu(items, from ? 0 : (at as { x: number }).x, from ? 0 : (at as { y: number }).y, (a) => {
      menuAct(a);
      if (a.startsWith('b:') || a.startsWith('bw:') || a.startsWith('ng:') || a.startsWith('nd:')) focusGrid();
    }, { class: 'tb-ctx', below: from?.getBoundingClientRect(), owner: from ?? undefined, minWidth: from ? 220 : undefined, onclose: () => { menuOpen = false; menuFrom = null; } });
    menuOpen = true; menuFrom = from;
  }
  // o.name: the row's icon (kit/icons.ts)
  const item = (label: string, act2: string, o: { name?: IconName; key?: string; dis?: boolean; danger?: boolean; checked?: boolean } = {}): MenuItemSpec =>
    ({ act: act2, label, icon: o.name, key: o.key, disabled: o.dis, danger: o.danger, checked: o.checked });
  // ---- number format (siunitx): a column's numbers start out as they were typed (1,955.98 keeps its commas)
  const startNum = (c: number) => T.typedNum(M.cells.slice(M.head).map((row: TCell[]) => (row[c].cs && row[c].cs! > 1 ? '' : row[c].t)));
  /** a change to the number settings of the selected columns; a column that wasn't aligned is aligned first */
  function setNum(cols: number[], f: (n: any) => void) {
    change(() => { for (const c of cols) { const n = { ...(M.cols[c].num || startNum(c)) }; f(n); M.cols[c].num = n; } });
  }
  // the decimal marker and the grouping mark can't be the same: picking one moves the other
  function setGroup(n: any, g: string) {
    if (g === 'thin') delete n.group; else n.group = g;
    delete n.groupMin; delete n.groupFrac;
    if (g === 'comma' && n.dec === ',') delete n.dec;
    if (g === 'point' && n.dec !== ',') n.dec = ',';
  }
  function setDec(n: any, d: string) {
    if (d === ',') n.dec = ','; else delete n.dec;
    if (d === ',' && n.group === 'comma') n.group = 'point';
    if (d !== ',' && n.group === 'point') n.group = 'comma';
  }
  const GROUP_NAMES = (): [string, string][] => [
    ['thin', t('table.group.thin', 'Thin space: 12\u2009345')], ['comma', t('table.group.comma', 'Comma: 1,234')], ['point', t('table.group.point', 'Point: 1.234')],
    ['space', t('table.group.space', 'Space: 12 345')], ['none', t('table.group.none', 'None: 12345')]];
  function numMenu(anchor: HTMLElement) {
    const n = M.cols[act[1]].num, g = n?.group || 'thin', d = n?.dec || '.';
    openMenu([{ heading: t('table.groupThousands', 'Group Thousands') }, ...GROUP_NAMES().map(([k, l]) => item(l, `ng:${k}`, { checked: !!n && g === k })), '-',
      { heading: t('table.decimalMarker', 'Decimal Marker') }, item(t('table.dec.point', 'Point: 1.5'), 'nd:.', { checked: !!n && d === '.' }), item(t('table.dec.comma', 'Comma: 1,5'), 'nd:,', { checked: !!n && d === ',' })], anchor);
  }
  function bordersMenu(anchor: HTMLElement) {
    const where: BorderWhere[] = ['all', 'outer', 'inner', 'innerH', 'innerV', 'top', 'bottom', 'left', 'right', 'none'];
    openMenu([{ tiles: where.map((w) => ({ act: `b:${w}`, label: BNAME()[w], icon: B[w] })), columns: 5 }, '-',
      item(t('table.rules.thick', 'Thick Rules'), 'bw:2', { name: 'ruleThick', checked: borderW === 2 }), item(t('table.rules.thin', 'Thin Rules'), 'bw:1', { name: 'ruleThin', checked: borderW === 1 }), item(t('table.rules.double', 'Double Rules'), 'bw:3', { name: 'ruleDouble', checked: borderW === 3 })], anchor);
  }
  let borderW: Rule = 1;
  function ctxMenu(x: number, y: number) {
    const g = range(), rows = g.r1 - g.r0 + 1, cols = g.c1 - g.c0 + 1, nr = T.nRows(M), nc = T.nCols(M);
    const multi = rows > 1 || cols > 1, merged = anchorsSel().some((q) => q.rs || q.cs);
    const many = rows > 1, manyC = cols > 1;
    openMenu([
      item(t('ui.cut', 'Cut'), 'cut', { key: 'Ctrl+X' }), item(t('ui.copy', 'Copy'), 'copy', { key: 'Ctrl+C' }), item(t('ui.paste', 'Paste'), 'paste', { key: 'Ctrl+V' }), '-',
      item(many ? t('table.insertRowsAbove', 'Insert {n} Rows Above', { n: rows }) : t('table.insertRowAbove', 'Insert Row Above'), 'row-above', { name: 'rowAbove' }),
      item(many ? t('table.insertRowsBelow', 'Insert {n} Rows Below', { n: rows }) : t('table.insertRowBelow', 'Insert Row Below'), 'row-below', { name: 'rowBelow' }),
      item(manyC ? t('table.insertColsLeft', 'Insert {n} Columns Left', { n: cols }) : t('table.insertColLeft', 'Insert Column Left'), 'col-left', { name: 'colBefore' }),
      item(manyC ? t('table.insertColsRight', 'Insert {n} Columns Right', { n: cols }) : t('table.insertColRight', 'Insert Column Right'), 'col-right', { name: 'colAfter' }), '-',
      item(t('table.moveUp', 'Move Up'), 'up', { dis: g.r0 === 0 }), item(t('table.moveDown', 'Move Down'), 'down', { dis: g.r1 === nr - 1 }), item(t('table.moveLeft', 'Move Left'), 'left', { dis: g.c0 === 0 }), item(t('table.moveRight', 'Move Right'), 'right', { dis: g.c1 === nc - 1 }), '-',
      item(t('table.mergeCells', 'Merge Cells'), 'merge', { name: 'mergeCells', dis: !multi }), item(t('table.splitCells', 'Split Cells'), 'split', { name: 'splitCells', dis: !merged }),
      item(g.r1 < M.head && g.r0 === 0 ? t('table.headerAbove', 'Header: rows above this one') : t('table.headerRows', 'Header: rows 1–{n}', { n: g.r1 + 1 }), 'head', { name: 'headerRows' }), '-',
      item(t('table.clearText', 'Clear Text'), 'clear-text', { key: 'Del' }), item(t('table.clearFormat', 'Clear Formatting'), 'clear-format'),
      item(many ? t('table.deleteRows', 'Delete {n} Rows', { n: rows }) : t('table.deleteRow', 'Delete Row'), 'del-rows', { danger: true, dis: rows >= nr, name: 'rowDelete' }),
      item(manyC ? t('table.deleteCols', 'Delete {n} Columns', { n: cols }) : t('table.deleteCol', 'Delete Column'), 'del-cols', { danger: true, dis: cols >= nc, name: 'colDelete' })], { x, y });
  }
  function menuAct(a: string) {
    const g = range();
    if (a === 'imp-text') { importDialog(); return; }
    if (a === 'imp-file') { chooseFile(); return; }
    if (a === 'imp-blank') { replaceTable(T.create(4, 3, 'booktabs'), t('table.newTable', 'A new table')); return; }
    if (a.startsWith('b:')) { border(a.slice(2) as BorderWhere, borderW); return; }
    if (a.startsWith('ng:') || a.startsWith('nd:')) {
      const cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, k) => g.c0 + k), v = a.slice(3);
      setNum(cols, (n) => (a.startsWith('ng:') ? setGroup(n, v) : setDec(n, v)));
      focusGrid(); return;
    }
    if (a.startsWith('bw:')) { borderW = +a.slice(3) as Rule; hint(borderW === 3 ? t('table.hint.rulesDouble', 'New rules are double') : borderW === 2 ? t('table.hint.rulesThick', 'New rules are thick') : t('table.hint.rulesThin', 'New rules are thin'), undefined, 'info'); return; }
    switch (a) {
      case 'cut': copySel(true); break;
      case 'copy': copySel(false); break;
      case 'paste': pasteFromClipboard(); break;
      case 'row-above': change(() => T.insertRows(M, g.r0, g.r1 - g.r0 + 1)); select([g.r0, act[1]]); break;
      case 'row-below': change(() => T.insertRows(M, g.r1 + 1, g.r1 - g.r0 + 1)); select([g.r1 + 1, act[1]]); break;
      case 'col-left': change(() => T.insertCols(M, g.c0, g.c1 - g.c0 + 1)); select([act[0], g.c0]); break;
      case 'col-right': change(() => T.insertCols(M, g.c1 + 1, g.c1 - g.c0 + 1)); select([act[0], g.c1 + 1]); break;
      case 'up': if (change(() => T.moveRows(M, g.r0, g.r1, -1))) { act[0]--; ext[0]--; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way'), undefined, 'warn'); break;
      case 'down': if (change(() => T.moveRows(M, g.r0, g.r1, 1))) { act[0]++; ext[0]++; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way'), undefined, 'warn'); break;
      case 'left': if (change(() => T.moveCols(M, g.c0, g.c1, -1))) { act[1]--; ext[1]--; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way'), undefined, 'warn'); break;
      case 'right': if (change(() => T.moveCols(M, g.c0, g.c1, 1))) { act[1]++; ext[1]++; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way'), undefined, 'warn'); break;
      case 'merge': mergeSel(); break;
      case 'split': change(() => T.split(M, g)); break;
      case 'head': change(() => { M.head = g.r1 + 1 >= T.nRows(M) ? T.nRows(M) - 1 : g.r1 + 1; T.restyle(M); }); break;
      case 'clear-text': change(() => T.clearRange(M, g, 'text')); break;
      case 'clear-format': change(() => T.clearRange(M, g, 'format')); break;
      case 'del-rows': change(() => T.deleteRows(M, g.r0, g.r1)); select([Math.min(g.r0, T.nRows(M) - 1), act[1]]); break;
      case 'del-cols': change(() => T.deleteCols(M, g.c0, g.c1)); select([act[0], Math.min(g.c0, T.nCols(M) - 1)]); break;
    }
  }
  function mergeSel() {
    const g = range();
    const filled = new Set(anchorsSel().map((x) => x.t.trim()).filter(Boolean)).size;
    change(() => T.merge(M, g));
    act = [g.r0, g.c0]; ext = act.slice() as [number, number]; syncSel();
    if (filled > 1) hint(t('table.hint.merged', 'Merged: the texts were joined. {key} undoes it.', { key: MOD + 'Z' }), 2200, 'ok');
  }

  // ---------------------------------------------------------------- clipboard
  // Copy gives spreadsheets their tab-separated text and an HTML table, and this tool the cells with their
  // formats and merges (in the HTML, as data).
  function sliceHtml(t: TableModel) {
    const own = T.owners(t);
    let h = `<table data-diagramtex-table="${esc(JSON.stringify(t))}">`;
    for (let r = 0; r < T.nRows(t); r++) {
      h += '<tr>';
      for (let c = 0; c < T.nCols(t); c++) {
        if (own[r][c][0] !== r || own[r][c][1] !== c) continue;
        const x = t.cells[r][c], st: string[] = [];
        if (T.isBold(t, r, x)) st.push('font-weight:bold');
        if (x.i) st.push('font-style:italic');
        if (x.fg) st.push('color:' + x.fg);
        if (x.bg) st.push('background-color:' + x.bg);
        h += `<td${x.rs ? ` rowspan="${x.rs}"` : ''}${x.cs ? ` colspan="${x.cs}"` : ''}${st.length ? ` style="${st.join(';')}"` : ''}>${esc(x.t).replace(/\n/g, '<br>')}</td>`;
      }
      h += '</tr>';
    }
    return h + '</table>';
  }
  async function copySel(cut: boolean) {
    const g = range(), sl = T.slice(M, g);
    const text = T.toTsv(M, g), html = sliceHtml(sl);
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(text);
    } catch (e: any) { hint(t('table.hint.copyFailed', "Couldn't copy"), undefined, 'error'); return; }
    if (cut) change(() => T.clearRange(M, g, 'all'));
  }
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) if (it.types.includes('text/html')) { pasteData(await (await it.getType('text/html')).text(), await (it.types.includes('text/plain') ? (await it.getType('text/plain')).text() : '')); return; }
      pasteData('', await navigator.clipboard.readText());
    } catch (e: any) { hint(t('table.hint.usePaste', 'Use {key} to paste', { key: MOD + 'V' }), undefined, 'warn'); }
  }
  /** ⌘V pastes at the selection's top-left cell, growing the table to fit: copied cells (this tool, Excel,
   *  Sheets) with their formats, text tables (TSV, CSV, Markdown, a LaTeX tabular) as text, keeping the cells'
   *  formats. A source that fits the selection a whole number of times fills it (one value fills every cell).
   *  It never replaces the table, except on the start screen, where nothing has been made yet; Import does. */
  function pasteData(html: string, text: string) {
    const g = range();
    let src: TableModel | null = null, styles = true;
    const own = html && /data-diagramtex-table="/.exec(html);
    if (own) {
      const d = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-diagramtex-table]');
      try { src = T.normalize(JSON.parse(d!.getAttribute('data-diagramtex-table')!)); } catch (e: any) { src = null; }
    }
    if (!src && html && T.isHtml(html)) { try { src = T.fromHtml(html); } catch (e: any) { src = null; } }
    const body = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!src && body) {
      const f = T.detect(body);
      // a LaTeX, Markdown or HTML table brings its formats; plain CSV / TSV text has none, so the cells keep theirs
      styles = f === 'latex' || f === 'markdown' || f === 'html';
      try {
        if (styles) src = T.importText(body, f).table;
        // more than one value: lines, or tabs (a single line with commas is one value: "Hello, world")
        else if (/[\t\n]/.test(body)) src = T.fromDelimited(body, f === 'tsv' ? '\t' : undefined);
      } catch (e: any) { hint(String(e.message || e), undefined, 'error'); return; }
    }
    if (fresh && src && T.nRows(src) * T.nCols(src) > 1) { replaceTable(src, t('table.pasted', 'Pasted')); return; }
    if (!src) {
      // one value: the text as typed, in every selected cell
      change(() => { for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) M.cells[r][c].t = body; });
      wrapNumbersIn(g);
      return;
    }
    // what the source keeps table-wide goes onto its cells, so it lands with them: the bold header, column alignment
    if (styles) {
      src = T.normalize(JSON.parse(JSON.stringify(src))) as TableModel;
      src.cells.forEach((row, r) => row.forEach((x, c) => {
        if (src!.headBold && r < src!.head && x.t) x.b = true;
        const al = src!.cols[c]?.al, to = M.cols[g.c0 + c]?.al;
        if (!x.al && al && al !== (to || 'l')) x.al = al;
      }));
    }
    const h = T.nRows(src), w = T.nCols(src), H = g.r1 - g.r0 + 1, W = g.c1 - g.c0 + 1, nrWas = T.nRows(M), ncWas = T.nCols(M);
    const ty = H % h === 0 ? H / h : 1, tx = W % w === 0 ? W / w : 1;
    const box: { at?: Range } = {};
    change(() => {
      for (let i = 0; i < ty; i++) for (let j = 0; j < tx; j++) T.pasteAt(M, src!, g.r0 + i * h, g.c0 + j * w, { styles });
      box.at = { r0: g.r0, c0: g.c0, r1: g.r0 + ty * h - 1, c1: g.c0 + tx * w - 1 };
    });
    const p = box.at;
    if (p) wrapNumbersIn(p);
    if (p) {
      act = [p.r0, p.c0]; ext = [p.r1, p.c1]; clampSel(); syncSel(true); panel();
      if (T.nRows(M) > nrWas || T.nCols(M) > ncWas) hint(t('table.hint.grew', 'Pasted {h} × {w}; the table grew to {rows} × {cols}', { h, w, rows: T.nRows(M), cols: T.nCols(M) }), 2000, 'ok');
    }
  }
  // incoming: imported or pasted text, whose numbers become maths (not a table opened as it was)
  function replaceTable(tbl: TableModel, note?: string, incoming = true) {
    finishEdit(true);
    const was = fresh;
    change(() => { M = tbl; });
    fresh = false;
    if (was !== fresh) startScreen();
    act = [0, 0]; ext = [0, 0];
    syncSel(); panel();
    focusGrid();
    if (incoming) wrapNumbersIn(whole());
    if (note) hint(t('table.hint.replaced', '{what} · {rows} × {cols}. {key} undoes it.', { what: note, rows: T.nRows(M), cols: T.nCols(M), key: MOD + 'Z' }), 2400, 'ok');
  }
  async function importFile(file: File) {
    try {
      const r = await T.importFile(file);
      replaceTable(r.table, t('table.importedFile', 'Imported {name}', { name: file.name }));
      if (r.warnings.length) setTimeout(() => hint(r.warnings.join(' · '), 3200, 'warn'), 2500);
    } catch (e: any) { TD.alert(t('table.importFileFailed', "Couldn't import the file"), String(e.message || e)); }
  }
  function chooseFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.tsv,.tab,.txt,.xlsx,.xlsm,.md,.markdown,.html,.htm,.tex,.ltx,text/csv,text/tab-separated-values,text/html,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) importFile(f); };
    inp.click();
  }
  async function importDialog() {
    const text = await TD.prompt(t('table.importTitle', 'Import a Table'), '', {
      multiline: true, ok: t('table.import', 'Import'), message: t('table.importBody', 'Paste CSV, TSV, Markdown, HTML or a LaTeX tabular. It replaces this table ({key} undoes it).', { key: MOD + 'Z' }),
      placeholder: '\\begin{tabular}{lr}\n\\toprule\nName & Value \\\\\n\\midrule\n…',
    });
    if (text == null) return; // Cancel
    if (!String(text).trim()) { hint(t('table.hint.emptyImport', 'Nothing to import: the box was empty'), undefined, 'warn'); return; }
    try { const r = T.importText(String(text)); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); }
    catch (e: any) { TD.alert(t('table.importFailed', "Couldn't import"), String(e.message || e)); }
  }

  // ---------------------------------------------------------------- the right panel
  let detailsOpen = false;
  function panelModel(): TablePanelModel {
    const c = act[1], col = M.cols[c], x = M.cells[act[0]][act[1]], g = range(), n = col.num;
    const round = !n ? 'none' : n.sig != null ? 'sig' : n.dp != null ? 'dp' : 'none';
    const style = n ? T.numStyle(n) : null;
    return {
      rows: T.nRows(M), cols: T.nCols(M),
      presets: [...T.PRESETS.map((p: any) => ({ value: p.key, label: presetName(p) })), { value: 'custom', label: t('table.customRules', 'Custom rules') }], preset: M.preset,
      head: M.head, headBold: !!M.headBold, booktabs: !!M.booktabs,
      striped: !!(M.stripe || M.stripe2), stripe: M.stripe || '', stripe2: M.stripe2 || '',
      autoMath: AUTO_MATH ? out.autoMath !== false : null,
      col: {
        name: T.colName(c) + (g.c1 > g.c0 ? `–${T.colName(g.c1)}` : ''), al: col.al, w: col.w || 0, fill: M.env === 'tabularx' ? !!col.fill : null, unit: col.unit || '',
        num: n ? { round, prec: (round === 'sig' ? n.sig : round === 'dp' ? n.dp : null) ?? null, group: n.group || 'thin', groupMin: style!.min, groupFrac: !!style!.frac,
          dec: n.dec || '.', exp: n.exp || 'input', prod: n.prod || 'times', unc: n.unc || 'paren', plus: !!n.plus, pos: n.pos || 'c' } : null,
      },
      cell: {
        name: g.r0 === g.r1 && g.c0 === g.c1 ? T.cellName(act[0], act[1]) : `${T.cellName(g.r0, g.c0)}:${T.cellName(g.r1, g.c1)}`,
        va: x.va || ((x.rs || 1) > 1 ? 'm' : 't'), sz: x.sz || '', fg: x.fg || '', bg: x.bg || '',
      },
      latex: {
        session: !!session, caption: M.caption, label: M.label, place: M.place,
        float: M.env === 'longtable' ? 'long' : (M.caption.trim() || M.label.trim()) ? 'forced' : M.float ? 'on' : 'off',
        env: M.env, width: M.width, foot: M.env === 'longtable' && !session ? M.foot : null, footMax: T.nRows(M) - M.head, floatPos: M.floatPos, capTop: !!M.capTop,
        size: M.size, pad: M.pad, stretch: M.stretch, ruleW: M.ruleW, ruleColor: M.ruleColor || '', unitStyle: M.unitStyle,
      },
      more: detailsOpen,
    };
  }
  /** the right panel (ui/TablePanel.svelte), drawn in place */
  function panel() {
    if (!shown) return;
    const el = document.getElementById('props');
    if (!el) return;
    const keep = el.scrollTop;
    renderView(el, TablePanel, panelModel());
    // the heading moves into the window's head (app.ts does it too, but later, from a MutationObserver);
    // moving it now keeps the height the scroll is restored against, so ticking a box doesn't scroll up
    const h = el.firstElementChild, head = document.getElementById('propsHead');
    if (h && h.tagName === 'H3' && head) { const old = head.querySelector('h3'); if (old) old.replaceWith(h); else head.prepend(h); }
    el.scrollTop = keep;
  }
  function panelChange(e: Event) {
    const t = e.target as HTMLInputElement, k = t.dataset.p;
    if (!k || !shown) return;
    const g = range(), c = act[1], cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, i) => g.c0 + i);
    const num = (v: string, lo: number, hi: number) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
    switch (k) {
      case 'preset': if (t.value !== 'custom') change(() => { const s = M.stripe; T.applyPreset(M, t.value); if (t.value === 'striped' && s) M.stripe = s; }); break;
      case 'head': { const v = num(t.value, 0, T.nRows(M)); if (v != null) change(() => { M.head = Math.round(v); T.restyle(M); }); break; }
      case 'headBold': change(() => { M.headBold = t.checked; }); break;
      case 'autoMath': out.autoMath = t.checked; saveOut(); break; // how text comes in, for every table: not part of this one
      case 'striped': change(() => { M.stripe = t.checked ? '#eef2f7' : ''; if (!t.checked) { M.stripe2 = ''; M.stripeFrom = -1; } if (M.preset === 'striped' && !t.checked) M.preset = 'custom'; }); break;
      case 'foot': { const v = num(t.value, 0, T.nRows(M) - M.head); if (v != null) change(() => { M.foot = Math.round(v); }); break; }
      case 'floatPos': { const v = t.value.trim(); if (/^[htbpH!]{1,5}$/.test(v) || !v) change(() => { M.floatPos = v || 'htbp'; }); break; }
      case 'ruleW': { const v = num(t.value, 0.1, 5); if (v != null) change(() => { M.ruleW = v; }); break; }
      case 'w': { const v = t.value === '' ? 0 : num(t.value, 0, 40); if (v != null) change(() => { for (const k2 of cols) M.cols[k2].w = v; }); break; }
      case 'fill': change(() => { for (const k2 of cols) M.cols[k2].fill = t.checked || undefined; }); break;
      case 'num': change(() => { for (const k2 of cols) M.cols[k2].num = t.checked ? startNum(k2) : null; }); break;
      case 'group': setNum(cols, (n) => setGroup(n, t.value as any)); break;
      case 'groupMin': { const v = num(t.value, 1, 9); if (v != null) setNum(cols, (n) => { n.groupMin = Math.round(v); }); break; }
      case 'groupFrac': setNum(cols, (n) => { n.groupFrac = t.checked; }); break;
      case 'plus': setNum(cols, (n) => { if (t.checked) n.plus = true; else delete n.plus; }); break;
      case 'round': change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; delete n.sig; delete n.dp; if (t.value === 'sig') n.sig = 3; if (t.value === 'dp') n.dp = 2; M.cols[k2].num = n; } }); break;
      case 'prec': { const v = num(t.value, 0, 15); if (v != null) change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; if (n.sig != null) n.sig = Math.max(1, Math.round(v)); else n.dp = Math.round(v); M.cols[k2].num = n; } }); break; }
      case 'exp': change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; if (t.value === 'input') delete n.exp; else n.exp = t.value as any; M.cols[k2].num = n; } }); break;
      case 'unit': change(() => { for (const k2 of cols) { if (t.value.trim()) M.cols[k2].unit = t.value.trim(); else delete M.cols[k2].unit; } }); break;
      case 'sz': change(() => T.styleRange(M, g, { sz: t.value || undefined })); break;
      case 'caption': case 'label': change(() => { if (k === 'caption') M.caption = t.value; else M.label = t.value.trim(); }); break;
      case 'float': change(() => { M.float = t.checked; }); break;
      case 'env': change(() => { M.env = t.value as any; }); break;
      case 'width': { const v = num(t.value, 10, 100); if (v != null) change(() => { M.width = v / 100; }); break; }
      case 'size': change(() => { M.size = t.value; }); break;
      case 'pad': { const v = num(t.value, 0, 30); if (v != null) change(() => { M.pad = v; }); break; }
      case 'stretch': { const v = num(t.value, 0.5, 4); if (v != null) change(() => { M.stretch = v; }); break; }
      case 'unitStyle': change(() => { M.unitStyle = t.value as any; }); break;
    }
    void c;
  }
  function panelClick(e: Event) {
    if (!shown) return;
    const b = (e.target as Element).closest('button') as HTMLElement | null;
    if (!b) return;
    const sg = b.closest('[data-seg]') as HTMLElement | null;
    if (sg && b.dataset.v != null) {
      const v = b.dataset.v, g = range(), cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, i) => g.c0 + i);
      switch (sg.dataset.seg) {
        case 'booktabs': change(() => { M.booktabs = v === '1'; }); break;
        case 'colAl': change(() => { for (const c of cols) M.cols[c].al = v as HAlign; for (const c of cols) for (const row of M.cells) delete row[c].al; }); break;
        case 'unc': change(() => { for (const c of cols) { const n = M.cols[c].num || {}; n.unc = v as any; M.cols[c].num = n; } }); break;
        case 'dec': setNum(cols, (n) => setDec(n, v as any)); break;
        case 'prod': setNum(cols, (n) => { if (v === 'cdot') n.prod = 'cdot'; else delete n.prod; }); break;
        case 'pos': setNum(cols, (n) => { if (v === 'l' || v === 'r') n.pos = v; else delete n.pos; }); break;
        case 'va': change(() => T.styleRange(M, g, { va: v as any })); break;
        case 'place': change(() => { M.place = v as any; }); break;
        case 'capTop': change(() => { M.capTop = v === '1'; }); break;
      }
      return;
    }
    if (b.dataset.color) {
      const k = b.dataset.color;
      if (k === 'stripe' || k === 'stripe2' || k === 'ruleColor') {
        // a table-wide colour; the stripes' other rows and the rules can have none (no fill, black)
        const before = JSON.stringify(M), key = k as 'stripe' | 'stripe2' | 'ruleColor';
        const set = (v: any) => { M[key] = v ? TD.parseColor(v).hex : ''; if (!M.stripe && !M.stripe2) M.stripe = '#eef2f7'; paint(); preview(); };
        TD.openColorPicker(b, { value: M[key] || null, nullable: k !== 'stripe' || !!M.stripe2, noneLabel: k === 'ruleColor' ? t('table.black', 'Black') : t('table.noFill', 'No Fill'), onInput: set, onChange: set,
          onClose: () => { if (JSON.stringify(M) !== before) { undoStack.push(before); redoStack.length = 0; save(); panel(); } } });
      } else pickColor(b, k as 'fg' | 'bg');
    }
  }
  const props = document.getElementById('props');
  props?.addEventListener('change', panelChange);
  props?.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.matches('input[type=text], input[type=number]')) panelChange(e); });
  props?.addEventListener('click', panelClick);
  props?.addEventListener('toggle', (e) => { if ((e.target as Element).matches?.('.tb-more-sec')) detailsOpen = (e.target as HTMLDetailsElement).open; }, true);

  // ---------------------------------------------------------------- preview and output
  const shape = () => ({ type: 'table', x: 0, y: 0, table: M, cap: true }); // its caption drawn too
  let pvTimer: any = null, pvDone: (() => void) | null = null, codeText = '';
  // a preview still to come counts as pending output (trackView), so Print and Copy PNG wait for it
  function preview() {
    clearTimeout(pvTimer);
    if (!pvDone) TD.math.trackView(new Promise<void>((done) => { pvDone = done; }));
    pvTimer = setTimeout(() => { const done = pvDone; pvDone = null; try { previewNow(); } finally { done?.(); } }, 40);
  }
  // pictureOnly: a formula finished, which changes the picture but never the LaTeX
  function previewNow(pictureOnly = false): void {
    if (!TD.math.previewing) return TD.math.preview(() => previewNow(pictureOnly));
    if (!shown) return;
    const p = $('.tb-prev'), code = $('.tb-code');
    if (!p) return;
    try {
      // a big table makes its cell pictures over several frames, so typing and scrolling never wait for them
      const { result: d, deferred } = labelBudget(PICTURE_MS, () => TD.measureBatch(() => T.draw(M, {})));
      if (deferred) previewLater();
      const pad = 12;
      // the picture is patched, not replaced: each cell's label keeps its decoded picture until its markup changes
      let pic = p.firstElementChild;
      if (!pic || pic.tagName.toLowerCase() !== 'svg' || p.childNodes.length !== 1) { p.innerHTML = '<svg class="tb-pic"></svg>'; pic = p.firstElementChild!; }
      pic.setAttribute('viewBox', `${-pad} ${-pad} ${(d.w + 2 * pad).toFixed(2)} ${(d.h + 2 * pad).toFixed(2)}`);
      pic.setAttribute('width', ((d.w + 2 * pad) * 1.25).toFixed(1)); pic.setAttribute('height', ((d.h + 2 * pad) * 1.25).toFixed(1));
      patchSvg(pic, d.svg);
    } catch (e: any) { p.textContent = t('table.drawFailed', 'Could not draw the table: {error}', { error: e.message || e }); }
    if (pictureOnly) return;
    const r = T.toLatex(M, { bare: !!session });
    const text = (r.packages.length ? `% ${r.packages.join(' ')}\n` : '') + r.code;
    codeText = text;
    code.innerHTML = text.split('\n').map((l: string, i: number) => `<div class="cl" data-n="${i + 1}">${esc(l) || ' '}</div>`).join('');
    packages = {
      text: r.packages.length ? r.packages.map((x: string) => /\{([^}]*)\}$/.exec(x)![1]).join(', ') : t('table.noPackages', 'No packages'),
      title: r.packages.length ? t('table.packagesTip', 'Packages the LaTeX needs (in the preamble):') + '\n' + r.packages.join('\n') : t('table.noPackagesTip', 'Plain LaTeX: no packages needed'),
    };
    renderShell();
  }
  function tabs() {
    renderShell();
    if (out.tab === 'preview' && host!.querySelector('.tb-prev .math-pending')) previewProgress();
  }
  const saveOut = () => { try { localStorage.setItem(OUT_KEY, JSON.stringify(out)); } catch (e: any) { /* storage blocked */ } };
  /** a copy button says Copied for a moment */
  function flash(what: string) {
    copied = what; renderShell();
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied = ''; renderShell(); }, 1200);
  }
  const fileName = () => (M.label.replace(/^tab:/, '') || M.caption.replace(/\\[A-Za-z]+|[$\\{}]/g, '')).trim().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'table'; // letters of any script stay
  // The LaTeX is ready at once; the picture outputs wait until every cell's maths is drawn.
  const PICTURE_OUTPUTS = new Set(['copy-png', 'dl-svg', 'dl-png', 'print']);
  async function output(what: string, btn: HTMLElement | null) {
    if (PICTURE_OUTPUTS.has(what) && !TD.app.outputAllowed()) return;
    finishEdit();
    try {
      if (what === 'copy') {
        const r = T.toLatex(M, { bare: !!session });
        await navigator.clipboard.writeText((r.packages.length ? `% Preamble: ${r.packages.join(' ')}\n` : '') + r.code + '\n');
        flash(what);
      } else if (what === 'dl-tex') TD.app.downloadBlob(fileName() + '.tex', new Blob([T.toLatex(M, { standalone: true }).code], { type: 'text/x-tex' }));
      else if (what === 'dl-svg') {
        const svg = await TD.app.svgWithFonts(TD.app.svgOf([shape()]));
        TD.app.downloadBlob(fileName() + '.svg', new Blob([svg], { type: 'image/svg+xml' }));
      } else if (what === 'dl-png') TD.app.downloadBlob(fileName() + '.png', await TD.app.pngOf([shape()], +out.dpi, out.transparent));
      else if (what === 'print') TD.app.printShapes([shape()], fileName());
      else if (what === 'copy-png') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': TD.app.pngOf([shape()], +out.dpi, false) })]);
        flash(what);
      }
    } catch (e: any) { hint(what.startsWith('dl') ? t('table.hint.fileFailed', "Couldn't make the file: {error}", { error: e.message || e }) : t('table.hint.copyFailedWhy', "Couldn't copy: {error}", { error: e.message || e }), 2600, 'error'); }
  }

  // ---------------------------------------------------------------- events
  host.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.ses) { endBlock(b.dataset.ses === 'done'); return; }
    if (b.dataset.tab) { out.tab = b.dataset.tab; saveOut(); tabs(); return; }
    if (b.dataset.o) { output(b.dataset.o, b); return; }
    if (b.dataset.add) {
      finishEdit();
      if (b.dataset.add === 'col') { const c = T.nCols(M); change(() => T.insertCols(M, c, 1)); select([act[0], c]); }
      else { const r = T.nRows(M); change(() => T.insertRows(M, r, 1)); select([r, act[1]]); }
      focusGrid();
      return;
    }
    const cmd = b.dataset.t;
    if (!cmd) return;
    switch (cmd) {
      case 'import':
        openMenu([item(t('table.menu.paste', 'Paste a Table…'), 'imp-text', { name: 'paste' }),
          item(t('table.menu.open', 'Open a File…'), 'imp-file', { name: 'open' }),
          '-', item(t('table.menu.blank', 'New Empty Table'), 'imp-blank', { name: 'fileTable' })], b);
        break;
      case 'file': chooseFile(); break;
      case 'blank': replaceTable(T.create(4, 3, 'booktabs')); break;
      case 'import-text': {
        const v = ($('.tb-paste') as HTMLTextAreaElement).value;
        if (!v.trim()) { hint(t('table.hint.pasteFirst', 'Paste a table first'), undefined, 'warn'); return; }
        try { const r = T.importText(v); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); } catch (err: any) { TD.alert(t('table.importFailed', "Couldn't import"), String(err.message || err)); }
        break;
      }
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'b': case 'i': case 'u': case 'tt': toggle(cmd); break;
      case 'al': setAlign(b.dataset.v as HAlign); break;
      case 'fg': case 'bg': applyColour(cmd as 'fg' | 'bg'); break;
      case 'fgmore': case 'bgmore': pickColor(b.parentElement as HTMLElement, cmd.slice(0, 2) as 'fg' | 'bg'); break;
      case 'border': border(lastBorder, borderW); break;
      case 'borders': bordersMenu(b); break;
      case 'merge': mergeSel(); break;
      case 'split': change(() => T.split(M, range())); break;
      case 'num': toggleNum(); break;
      case 'numfmt': numMenu(b); break;
    }
    // Formatting buttons act on the selection; return keyboard shortcuts to it.
    if (['undo', 'redo', 'b', 'i', 'u', 'tt', 'al', 'border', 'merge', 'split', 'num'].includes(cmd)) focusGrid();
  });
  host.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.t === 'preset') {
      change(() => { const s = M.stripe; T.applyPreset(M, t.value); if (t.value === 'striped' && s) M.stripe = s; });
      focusGrid();
    }
    if (t.dataset.o === 'dpi') { out.dpi = +t.value; saveOut(); }
  });
  // the formula bar: typing edits the active cell; Enter keeps it, Esc puts it back
  let fxWas: string | null = null, fxCell: [number, number] = [0, 0];
  host.addEventListener('focusin', (e) => { if ((e.target as Element).matches('.tb-fxin')) { finishEdit(); fxWas = JSON.stringify(M); fxCell = [act[0], act[1]]; } });
  host.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.matches('.tb-fxin')) return;
    // \\ is a line break in the cell, except inside an environment (a pmatrix's rows)
    const envs = T.envRanges(t.value);
    M.cells[act[0]][act[1]].t = t.value.replace(/\s*(?<!\\)\\\\\s*/g, (all: string, at: number) => (envs.some(([a, b]: [number, number]) => at >= a && at < b) ? all : '\n'));
    fresh = false;
    const td = tdAt(act[0], act[1]);
    if (td) (td.firstElementChild as HTMLElement).innerHTML = cellHtml(act[0], act[1], M.cells[act[0]][act[1]]);
    syncSel(); preview(); save();
  });
  host.addEventListener('focusout', (e) => {
    if (!(e.target as Element).matches('.tb-fxin') || fxWas == null) return;
    const edited = fxWas !== JSON.stringify(M);
    if (edited) { undoStack.push(fxWas); redoStack.length = 0; paint(); }
    fxWas = null;
    if (edited) wrapNumbersIn({ r0: fxCell[0], c0: fxCell[1], r1: fxCell[0], c1: fxCell[1] });
  });
  host.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('.tb-fxin')) {
      if (e.key === 'Enter') { e.preventDefault(); t.blur(); select(step(act, 1, 0)); focusGrid(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (fxWas) { M = T.normalize(JSON.parse(fxWas)); paint(); preview(); } fxWas = null; t.blur(); focusGrid(); }
      return;
    }
    if (t.matches('.tb-paste') && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); ($('[data-t="import-text"]') as HTMLElement).click(); }
  });

  const wrapEl = () => $('.tb-gridwrap');
  // pointer: select, drag a range, headers select rows and columns, the handle on a column header sets a width
  host.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.tb-gridwrap') || e.button > 0 || t.closest('.tb-edit')) return;
    const rs = t.closest('[data-rs]') as HTMLElement | null;
    if (rs) { resizeCol(e, +rs.dataset.rs!); return; }
    const td = t.closest('td[data-r]') as HTMLElement | null, ch = t.closest('[data-ch]') as HTMLElement | null, rh = t.closest('[data-rh]') as HTMLElement | null;
    if (t.closest('[data-all]')) { e.preventDefault(); select([0, 0], [T.nRows(M) - 1, T.nCols(M) - 1], false); focusGrid(); return; }
    if (!td && !ch && !rh) return;
    e.preventDefault();
    finishEdit();
    focusGrid();
    const at = (el: HTMLElement): [number, number] | null => {
      const cell = el.closest('td[data-r]') as HTMLElement | null;
      if (cell) return [+cell.dataset.r!, +cell.dataset.c!];
      return null;
    };
    const lastR = T.nRows(M) - 1, lastC = T.nCols(M) - 1;
    if (ch) {
      const c = +ch.dataset.ch!;
      if (e.shiftKey) { ext = [lastR, c]; act = [0, act[1]]; } else { act = [0, c]; ext = [lastR, c]; }
      syncSel(); panel();
    } else if (rh) {
      const r = +rh.dataset.rh!;
      if (e.shiftKey) { ext = [r, lastC]; act = [act[0], 0]; } else { act = [r, 0]; ext = [r, lastC]; }
      syncSel(); panel();
    } else if (td) {
      const p = at(td)!;
      if (e.shiftKey) { ext = p; syncSel(); panel(); } else select(p, undefined, false);
    }
    const kind = ch ? 'c' : rh ? 'r' : 'cell';
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      if (!el) return;
      if (kind === 'cell') { const p = at(el); if (p && (p[0] !== ext[0] || p[1] !== ext[1])) { ext = p; syncSel(); } }
      else if (kind === 'c') { const h = el.closest('[data-ch]') as HTMLElement | null, cell = at(el); const c = h ? +h.dataset.ch! : cell ? cell[1] : null; if (c != null && c !== ext[1]) { ext = [lastR, c]; syncSel(); } }
      else { const h = el.closest('[data-rh]') as HTMLElement | null, cell = at(el); const r = h ? +h.dataset.rh! : cell ? cell[0] : null; if (r != null && r !== ext[0]) { ext = [r, lastC]; syncSel(); } }
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); panel(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  host.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement;
    const rs = t.closest('[data-rs]') as HTMLElement | null;
    if (rs) { change(() => { M.cols[+rs.dataset.rs!].w = 0; }); return; }
    const td = t.closest('td[data-r]') as HTMLElement | null;
    if (td && !t.closest('.tb-edit')) { select([+td.dataset.r!, +td.dataset.c!], undefined, false); startEdit(); }
  });
  host.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement;
    const td = t.closest('td[data-r]') as HTMLElement | null, hd = t.closest('[data-ch], [data-rh]');
    if (!td && !hd) return;
    e.preventDefault();
    finishEdit();
    if (td) {
      const p: [number, number] = [+td.dataset.r!, +td.dataset.c!], g = range();
      if (!(p[0] >= g.r0 && p[0] <= g.r1 && p[1] >= g.c0 && p[1] <= g.c1)) select(p, undefined, false);
    }
    ctxMenu(e.clientX, e.clientY);
  });
  // The edge follows the pointer: only the column's <col> and its cells' wrapping change while dragging (no
  // repaint of the grid), and the header's width over its <col> (the borders) is measured, not assumed.
  const MIN_COL = 48; // a grid cell's min-width (table.css)
  function resizeCol(e: PointerEvent, c: number) {
    e.preventDefault(); e.stopPropagation();
    const th = host!.querySelector(`.tg th[data-ch="${c}"]`) as HTMLElement, col = host!.querySelectorAll<HTMLElement>('.tg colgroup col')[c + 1];
    if (!th || !col) return;
    const x0 = e.clientX, w0 = th.getBoundingClientRect().width, before = JSON.stringify(M);
    col.style.width = `${w0}px`;
    const extra = th.getBoundingClientRect().width - w0;
    host!.querySelectorAll(`.tg td[data-c="${c}"] .tg-in`).forEach((el) => el.classList.add('wrap'));
    let x = x0, frame = 0;
    const apply = () => {
      frame = 0;
      const w = Math.max(MIN_COL, w0 + x - x0) - extra - CELL_EXTRA;
      M.cols[c].w = Math.max(0.5, Math.round(w / PX * 10) / 10);
      col.style.width = `${colPx(M.cols[c].w).toFixed(1)}px`;
      // what shows the width follows it: the header's badge and the panel's Width field
      const label = th.querySelector('.tg-chl'); if (label) label.innerHTML = headLabel(c);
      const field = act[1] === c ? document.querySelector<HTMLInputElement>('#props [data-p="w"]') : null;
      if (field) field.value = String(M.cols[c].w);
      syncSel();
    };
    const move = (ev: PointerEvent) => { x = ev.clientX; if (!frame) frame = requestAnimationFrame(apply); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (frame) { cancelAnimationFrame(frame); apply(); }
      if (x === x0) M.cols[c].w = (JSON.parse(before) as TableModel).cols[c].w; // a click (or a double-click's first half) changes nothing
      paint();
      if (JSON.stringify(M) !== before) { undoStack.push(before); redoStack.length = 0; fresh = false; save(); panel(); preview(); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up); // a cancelled drag ends as a release
  }
  // the LaTeX view reads like a field: a click focuses it, and ⌘A takes just the code, not the page (as #tikzOut);
  // copying all of it gives the exact text (an empty line is drawn as a space)
  host.addEventListener('keydown', (e) => {
    const code = (e.target as Element).closest('.tb-code');
    if (!code || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'a' || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const rg = document.createRange(); rg.selectNodeContents(code);
    const s = getSelection()!; s.removeAllRanges(); s.addRange(rg);
  });
  host.addEventListener('copy', (e) => {
    const code = host!.querySelector('.tb-code'), s = getSelection();
    if (!code || !s || !s.rangeCount || !code.contains(s.anchorNode)) return;
    const all = document.createRange(); all.selectNodeContents(code);
    const r = s.getRangeAt(0);
    if (r.compareBoundaryPoints(Range.START_TO_START, all) > 0 || r.compareBoundaryPoints(Range.END_TO_END, all) < 0) return;
    e.clipboardData!.setData('text/plain', codeText);
    e.preventDefault();
  });
  // keys on the grid
  host.addEventListener('keydown', (e) => {
    if (!(e.target as Element).closest('.tb-gridwrap') || editing) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    const nr = T.nRows(M), nc = T.nCols(M);
    const go = (p: [number, number], extend: boolean) => {
      e.preventDefault();
      if (extend) { ext = p; syncSel(true); panel(); } else select(p);
    };
    const DIR: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (DIR[k]) {
      const [dr, dc] = DIR[k], from = e.shiftKey ? ext : act;
      if (mod) go([dr ? (dr < 0 ? 0 : nr - 1) : from[0], dc ? (dc < 0 ? 0 : nc - 1) : from[1]], e.shiftKey);
      else go(step(from, dr, dc), e.shiftKey);
      return;
    }
    // Tab moves along the row; where it can't go further (a row's end, or its start with Shift), focus leaves the
    // grid as Tab does anywhere else, so the keyboard is never trapped in it
    if (k === 'Tab') { const to = step(act, 0, e.shiftKey ? -1 : 1); if ((e.target as Element).matches('.tb-gridwrap') && (to[0] !== act[0] || to[1] !== act[1])) go(to, false); return; }
    if (k === 'Home') { go([mod ? 0 : act[0], 0], e.shiftKey); return; }
    if (k === 'End') { go([mod ? nr - 1 : act[0], nc - 1], e.shiftKey); return; }
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); change(() => T.clearRange(M, range(), 'text')); return; }
    if (k === 'Escape') { if (range().r0 !== range().r1 || range().c0 !== range().c1) { e.preventDefault(); select(act); } return; }
    if (mod) {
      const l = k.toLowerCase();
      if (l === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (l === 'y') { e.preventDefault(); redo(); return; }
      if (l === 'a') { e.preventDefault(); select([0, 0], [nr - 1, nc - 1], false); return; }
      if (l === 'b' || l === 'i' || l === 'u') { e.preventDefault(); toggle(l as 'b' | 'i' | 'u'); return; }
      if (l === 'c' && e.shiftKey) { e.preventDefault(); output('copy', host!.querySelector('[data-o="copy"]')); return; }
      if (l === 'm' && e.shiftKey) { e.preventDefault(); mergeSel(); return; }
      return; // ⌘C ⌘X ⌘V come as clipboard events
    }
    // typing starts editing, replacing the text
    if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k); }
  });
  host.addEventListener('copy', (e) => {
    if (!(e.target as Element).closest('.tb-gridwrap') || editing) return;
    e.preventDefault();
    const g = range();
    e.clipboardData!.setData('text/plain', T.toTsv(M, g));
    e.clipboardData!.setData('text/html', sliceHtml(T.slice(M, g)));
  });
  host.addEventListener('cut', (e) => {
    if (!(e.target as Element).closest('.tb-gridwrap') || editing) return;
    e.preventDefault();
    const g = range();
    e.clipboardData!.setData('text/plain', T.toTsv(M, g));
    e.clipboardData!.setData('text/html', sliceHtml(T.slice(M, g)));
    change(() => T.clearRange(M, g, 'all'));
  });
  // paste: into the grid, or anywhere in the workspace that isn't a text field (the start screen included)
  document.addEventListener('paste', (e) => {
    if (!shown) return;
    const t = e.target as HTMLElement;
    if (t && t.closest && (t.closest('.tb-edit, .tb-fxin, .tb-paste, #props, .td-dialog, .modal') || (t.matches('input, textarea, [contenteditable]') && !t.closest('.tb-gridwrap')))) return;
    const d = e.clipboardData;
    if (!d) return;
    const files = [...d.files].filter((f) => /\.(xlsx|csv|tsv|md|html?|tex)$/i.test(f.name));
    e.preventDefault();
    if (files.length) { importFile(files[0]); return; }
    pasteData(d.getData('text/html'), d.getData('text/plain'));
  });
  // drop a file anywhere on the workspace
  host.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); host!.classList.add('drop'); } });
  host.addEventListener('dragleave', (e) => { if (e.target === host || !host!.contains(e.relatedTarget as Node)) host!.classList.remove('drop'); });
  host.addEventListener('drop', (e) => {
    host!.classList.remove('drop');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) { const txt = e.dataTransfer?.getData('text/plain'); if (txt) { e.preventDefault(); try { const r = T.importText(txt); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); } catch (err: any) { hint(String(err.message || err), undefined, 'error'); } } return; }
    e.preventDefault(); e.stopPropagation();
    importFile(f);
  });
  addEventListener('resize', () => { if (shown) syncSel(); });
  host.addEventListener('scroll', (e) => { closeMenu(); if ((e.target as Element).matches?.('.tb-gridwrap')) rankVisibleMaths(); }, true);
  if (TD.math && TD.math.onChange) TD.math.onChange(() => { if (shown) { paint(); preview(); } });

  // Formulae finish one or two a frame. Each round redraws only the cells waiting on one that finished, and
  // the preview (the whole table drawn again) at most every PREVIEW_EVERY ms rather than every frame.
  const PREVIEW_EVERY = 250;
  let previewDue: Promise<void> | null = null, pictureDue: Promise<void> | null = null;
  // makes the pictures labelBudget left out, one frame's worth at a time, in place: redrawing a big table
  // for each frame's few pictures would cost more than the pictures. Output waits for it (trackView).
  function previewLater() {
    if (pictureDue) return;
    TD.math.trackView(pictureDue = new Promise<void>((done) => requestAnimationFrame(() => {
      pictureDue = null;
      try {
        const preview = host!.querySelector('.tb-prev');
        if (!shown || !preview) return;
        const end = performance.now() + PICTURE_MS;
        let lost = false;
        for (const el of preview.querySelectorAll<SVGImageElement>('image[data-later]')) {
          if (performance.now() > end) { previewLater(); return; }
          const image = laterPicture(+el.dataset.later!);
          el.removeAttribute('data-later');
          if (!image) { lost = true; continue; }
          el.setAttribute('x', String(+el.dataset.lx! + image.x)); el.setAttribute('y', String(+el.dataset.ly! + image.y));
          el.setAttribute('width', String(image.width)); el.setAttribute('height', String(image.height)); el.setAttribute('href', image.href);
          if (!el.dataset.mathPending) el.classList.remove('math-pending');
        }
        // a picture forgotten since its draw: draw again, which defers what is still missing
        if (lost) TD.math.preview(() => previewNow(true));
        if (!pictureDue && !preview.querySelector('.math-pending')) TD.math.trackView(previewFadeFinished(preview));
      } finally { done(); }
    })));
  }
  function previewProgress() {
    if (previewDue) return;
    TD.math.trackView(previewDue = new Promise<void>((done) => setTimeout(() => {
      previewDue = null;
      try {
        // a hidden preview catches up when its tab is opened (tabs())
        if (!shown || out.tab !== 'preview' || !host!.querySelector('.tb-prev .math-pending')) return;
        TD.math.preview(() => previewNow(true));
        const preview = host!.querySelector('.tb-prev');
        if (preview && !preview.querySelector('.math-pending')) TD.math.trackView(previewFadeFinished(preview));
      } finally { done(); }
    }, PREVIEW_EVERY)));
  }
  TD.math.onProgress((ids: number[]) => {
    if (!shown) return;
    const finished = new Set(ids), filled: Element[] = [];
    TD.math.preview(() => {
      for (const span of host!.querySelectorAll<HTMLElement>('.tg td[data-r][data-c] .math-pending[data-math-pending]')) {
        if (!span.isConnected || !span.dataset.mathPending!.split(',').some((id) => finished.has(+id))) continue;
        const cell = span.closest<HTMLElement>('td[data-r][data-c]')!, r = +cell.dataset.r!, c = +cell.dataset.c!;
        if (editing && editing.r === r && editing.c === c) continue;
        const inner = cell.querySelector('.tg-in');
        if (!inner) continue;
        inner.innerHTML = cellHtml(r, c, M.cells[r][c]);
        if (!inner.querySelector('.math-pending')) filled.push(inner);
      }
    });
    // after every write: reading a cell's fade recalculates the grid's styles, once here rather than once a cell
    for (const inner of filled) TD.math.trackView(previewFadeFinished(inner));
    if (host!.querySelector('.tb-prev .math-pending')) previewProgress();
  });

  function refresh() { paint(); panel(); preview(); startScreen(); }

  // ---------------------------------------------------------------- a Table block from the diagram
  // Double-clicking a Table block opens it here: the workspace's own table is put aside, the block's table is
  // edited with the whole workspace, and Done (or leaving Table for Classic, Page or Whiteboard) writes it back as
  // one undo step there. Cancel drops the changes. ⌘S writes it back and keeps editing.
  function editBlock(shape: { table: TableModel }, done: (r: { src: string; table: TableModel }) => void) {
    if (session || !TD.app?.cmd?.setTable) return;
    stash = { M, fresh, undo: undoStack.splice(0), redo: redoStack.splice(0), act, ext };
    M = T.normalize(JSON.parse(JSON.stringify(shape.table)));
    fresh = false; act = [0, 0]; ext = [0, 0];
    session = { done, start: JSON.stringify(M) };
    TD.app.cmd.setTable(true);
  }
  /** back from a block's table to the workspace's own (hide() calls it with ok = true when Table mode is left) */
  function closeBlock(ok: boolean) {
    const s = session;
    if (!s || !stash) return;
    const cur = JSON.stringify(M), res = ok && !s.cancel && cur !== s.start ? JSON.parse(cur) : null;
    M = stash.M; fresh = stash.fresh; act = stash.act; ext = stash.ext;
    undoStack.splice(0, undoStack.length, ...stash.undo); redoStack.splice(0, redoStack.length, ...stash.redo);
    stash = null; session = null;
    // after the switch back has finished, so the diagram is showing when the change lands
    if (res) queueMicrotask(() => s.done({ src: '', table: res }));
  }
  async function endBlock(ok: boolean) {
    if (!session) return;
    finishEdit();
    if (!ok && JSON.stringify(M) !== session.start && !(await TD.confirm(t('table.discard.title', 'Discard changes to this table?'), t('table.discard.body', 'Your edits since opening the table will be lost.'), { ok: t('table.discard.ok', 'Discard'), danger: true }))) return;
    if (!session) return;
    if (!ok) session.cancel = true;
    TD.app.cmd.setTable(false);
  }
  window.addEventListener('keydown', (e) => {
    if (!session || !shown || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return;
    if (document.querySelector('.td-dialog')) return; // a dialog is open
    e.preventDefault(); e.stopImmediatePropagation();
    finishEdit();
    const cur = JSON.stringify(M);
    if (cur !== session.start) { session.start = cur; session.done({ src: '', table: JSON.parse(cur) }); }
    hint(t('table.hint.saved', 'Saved to the diagram'), undefined, 'ok');
  }, true);
  TD.tableBlockEditor = { open: editBlock };
  // a language switch while the table is on screen redraws its frame (the model and selection stay)
  let firstLocale = true;
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (shown) { finishEdit(); closeMenu(); build(); requestAnimationFrame(() => syncSel()); } }); // captions follow by themselves; the grid's are drawn again

  TD.tableWs = {
    show() { shown = true; host.hidden = false; build(); requestAnimationFrame(() => { syncSel(); if (!fresh) focusGrid(); }); },
    hide() { finishEdit(); closeMenu(); closeBlock(true); shown = false; host.hidden = true; destroyView(host); built = false; },
    get inBlock() { return !!session; },
    renderProps() { panel(); },
    undo, redo, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0,
    // for the tests
    autoMathAvailable: AUTO_MATH,
    get autoMath() { return AUTO_MATH && out.autoMath !== false; }, set autoMath(on: boolean) { out.autoMath = on; saveOut(); panel(); },
    get model() { return M; }, set model(t: TableModel) { replaceTable(T.normalize(t), undefined, false); },
    select: (a: [number, number], b?: [number, number]) => select(a, b), range, pasteData, importText: (s: string) => { const r = T.importText(s); replaceTable(r.table); return r; }, output,
  };
})();
