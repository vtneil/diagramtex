import { previewFadeFinished } from '../../platform/preview-fade';
import { runtime as TD } from '../../runtime';
import { gridIcon } from '../grid-icons';
import { t, message as msg, caption, onLocale, type Message } from '../../i18n';
import type { TableModel, TCell, Range, HAlign, BorderWhere, Rule } from '../../domain/table/model';
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
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const $ = (s: string) => host.querySelector(s) as HTMLElement;
  const PX = TD.PX_PER_CM;

  // ---------------------------------------------------------------- state
  let M: TableModel = T.create(4, 3, 'booktabs');
  let fresh = true; // nothing imported or typed yet: the start screen shows
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { const o = JSON.parse(saved); M = T.normalize(o.table); fresh = !!o.fresh; }
  } catch (e: any) { /* storage blocked or bad data: a new table */ }
  const out = { tab: 'preview', dpi: 300, transparent: false };
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
  /** One undoable change: fn edits M; the grid, panel and preview follow. */
  function change(fn: () => unknown, opts: { keepPanel?: boolean } = {}) {
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
    if (!opts.keepPanel) panel(); else syncPanel();
    preview();
    return true;
  }
  function undo() {
    finishEdit(true);
    if (!undoStack.length) { hint(t('table.hint.noUndo', 'Nothing to undo')); return; }
    redoStack.push(JSON.stringify(M)); M = T.normalize(JSON.parse(undoStack.pop()!));
    clampSel(); save(); refresh();
  }
  function redo() {
    finishEdit(true);
    if (!redoStack.length) { hint(t('table.hint.noRedo', 'Nothing to redo')); return; }
    undoStack.push(JSON.stringify(M)); M = T.normalize(JSON.parse(redoStack.pop()!));
    clampSel(); save(); refresh();
  }
  function hint(text: string, ms = 1600) { if (TD.app && TD.app.showHint) TD.app.showHint(text, ms); }

  // ---------------------------------------------------------------- icons
  const ic = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
  const I = {
    undo: ic('<path d="M7 5L3 9l4 4M3 9h9a5 5 0 010 10h-2"/>'),
    redo: ic('<path d="M13 5l4 4-4 4M17 9H8a5 5 0 000 10h2"/>'),
    imp: ic('<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/>'),
    dl: ic('<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/>'),
    b: '<b class="tb-glyph">B</b>', i: '<i class="tb-glyph" style="font-family:Georgia,serif">I</i>', u: '<span class="tb-glyph" style="text-decoration:underline">U</span>', tt: '<span class="tb-glyph tb-mono">T</span>',
    al: { l: ic('<path d="M3 5h14M3 9h9M3 13h14M3 17h9"/>'), c: ic('<path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/>'), r: ic('<path d="M3 5h14M8 9h9M3 13h14M8 17h9"/>'), j: ic('<path d="M3 5h14M3 9h14M3 13h14M3 17h9"/>') } as Record<string, string>,
    va: { t: ic('<path d="M3 3.5h14M10 7v9M7 9.5l3-3 3 3"/>'), m: ic('<path d="M3 10h14M10 2.5v5M10 12.5v5M7.5 5.5l2.5 2 2.5-2M7.5 14.5l2.5-2 2.5 2"/>'), b: ic('<path d="M3 16.5h14M10 4v9M7 10.5l3 3 3-3"/>') } as Record<string, string>,
    fg: ic('<path d="M6 14l4-10 4 10M7.4 10.5h5.2"/><path class="sw" d="M3 16.5h14" stroke-width="3"/>'),
    bg: ic('<path d="M4.5 9.5l5-5 5 5-5 5z"/><path d="M15.5 11.5s1.5 1.8 1.5 2.8a1.5 1.5 0 01-3 0c0-1 1.5-2.8 1.5-2.8z"/><path class="sw" d="M3 17.5h14" stroke-width="3"/>'),
    border: ic('<path d="M3 3h14v14H3z" stroke-dasharray="1.5 2"/><path d="M3 17h14"/>'),
    merge: ic('<path d="M3 4h14v12H3z"/><path d="M7 10h6M11 8l2 2-2 2M9 8l-2 2 2 2" />'),
    split: ic('<path d="M3 4h14v12H3zM10 4v12"/><path d="M4.5 10h3M6 8.5L7.5 10 6 11.5M15.5 10h-3M14 8.5L12.5 10l1.5 1.5"/>'),
    num: '<span class="tb-glyph tb-mono" style="font-size:12px">.00</span>',
    more: ic('<path d="M6 8l4 4 4-4"/>'),
  };
  const B: Record<BorderWhere, string> = {
    all: ic('<path d="M3 3h14v14H3zM10 3v14M3 10h14"/>'), outer: ic('<path d="M3 3h14v14H3z"/><path d="M10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'),
    inner: ic('<path d="M10 3v14M3 10h14"/><path d="M3 3h14v14H3z" stroke-dasharray="1.5 2"/>'), innerH: ic('<path d="M3 10h14"/><path d="M3 3h14v14H3zM10 3v14" stroke-dasharray="1.5 2"/>'),
    innerV: ic('<path d="M10 3v14"/><path d="M3 3h14v14H3zM3 10h14" stroke-dasharray="1.5 2"/>'), top: ic('<path d="M3 3h14"/><path d="M3 3v14h14V3M10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'),
    bottom: ic('<path d="M3 17h14"/><path d="M3 17V3h14v14M10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'), left: ic('<path d="M3 3v14"/><path d="M3 3h14v14H3M10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'),
    right: ic('<path d="M17 3v14"/><path d="M17 3H3v14h14M10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'), none: ic('<path d="M3 3h14v14H3zM10 3v14M3 10h14" stroke-dasharray="1.5 2"/>'),
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

  // ---------------------------------------------------------------- the frame
  function build() {
    host!.innerHTML = `<div class="tbw${session ? ' tb-in-block' : ''}">
      ${session ? `<div class="tb-session" role="region" aria-label="${esc(t('table.session.aria', 'Editing a table from the diagram'))}"><span>${esc(t('table.session.editing', 'Editing a table from the diagram.'))} <b>${esc(t('ui.done', 'Done'))}</b> ${esc(t('table.session.back', "puts it back; the Table workspace's own table is left as it was."))}</span><div class="spacer"></div><button type="button" data-ses="cancel">${esc(t('ui.cancel', 'Cancel'))}</button><button type="button" class="primary" data-ses="done" title="${esc(t('table.session.doneTip', 'Put the table back in the diagram ({key} keeps editing)', { key: MOD + 'S' }))}">${esc(t('ui.done', 'Done'))}</button></div>` : ''}
      <div class="tb-bar" role="toolbar" aria-label="${esc(t('ui.table', 'Table'))}">
        <div class="tb-grp"><button type="button" data-t="import" class="tb-imp" title="${esc(t('table.importTip', 'Import a table: paste or open CSV, TSV, Excel (.xlsx), Markdown, HTML or LaTeX'))}" aria-haspopup="menu">${I.imp}${esc(t('table.import', 'Import'))}</button></div>
        <div class="tb-grp"><button type="button" class="icon" data-t="undo" title="${esc(t('table.undoTip', 'Undo ({key})', { key: MOD + 'Z' }))}">${I.undo}</button><button type="button" class="icon" data-t="redo" title="${esc(t('table.redoTip', 'Redo ({key})', { key: SHIFT + MOD + 'Z' }))}">${I.redo}</button></div>
        <div class="tb-grp"><select data-t="preset" class="tb-preset" aria-label="${esc(t('table.style', 'Table style'))}" title="${esc(t('table.styleTip', 'Table style: rules, stripes and header'))}">${T.PRESETS.map((p: any) => `<option value="${p.key}" title="${esc(presetTip(p))}">${esc(presetName(p))}</option>`).join('')}<option value="custom" disabled>${esc(t('ui.custom', 'Custom'))}</option></select></div>
        <div class="tb-grp"><button type="button" class="icon" data-t="b" title="${esc(t('table.boldTip', 'Bold ({key})', { key: MOD + 'B' }))}">${I.b}</button><button type="button" class="icon" data-t="i" title="${esc(t('table.italicTip', 'Italic ({key})', { key: MOD + 'I' }))}">${I.i}</button><button type="button" class="icon" data-t="u" title="${esc(t('table.underlineTip', 'Underline ({key})', { key: MOD + 'U' }))}">${I.u}</button><button type="button" class="icon" data-t="tt" title="${esc(t('table.monoTip', 'Monospace (\\texttt)'))}">${I.tt}</button></div>
        <div class="tb-grp"><button type="button" class="icon tb-col" data-t="fg" title="${esc(t('table.textColour', 'Text colour'))}">${I.fg}</button><button type="button" class="icon tb-col" data-t="bg" title="${esc(t('table.cellFill', 'Cell fill'))}">${I.bg}</button></div>
        <div class="tb-grp seg-ctl tb-seg" role="group" aria-label="${esc(t('ui.alignment', 'Alignment'))}">${(['l', 'c', 'r', 'j'] as HAlign[]).map((a) => `<button type="button" data-t="al" data-v="${a}" title="${esc(({ l: t('table.alignLeft', 'Align left'), c: t('ui.centre', 'Centre'), r: t('table.alignRight', 'Align right'), j: t('table.justify', 'Justify (wrapping columns)') } as any)[a])}">${I.al[a]}</button>`).join('')}</div>
        <div class="tb-grp"><span class="split-btn tb-split"><button type="button" class="icon" data-t="border" title="${esc(t('table.bordersLast', 'Borders: the last one picked'))}">${B.all}</button><button type="button" class="tb-more" data-t="borders" title="${esc(t('table.borders', 'Borders'))}" aria-haspopup="menu">${I.more}</button></span></div>
        <div class="tb-grp"><button type="button" class="icon" data-t="merge" title="${esc(t('table.mergeTip', 'Merge cells (\\multicolumn, \\multirow)'))}">${I.merge}</button><button type="button" class="icon" data-t="split" title="${esc(t('table.splitTip', 'Split cells'))}">${I.split}</button></div>
        <div class="tb-grp"><button type="button" class="icon" data-t="num" title="${esc(t('table.numTip', 'Numbers: align on the decimal point (siunitx), round, scientific notation'))}">${I.num}</button></div>
      </div>
      <div class="tb-fx"><span class="tb-ref" title="${esc(t('table.activeCell', 'The active cell'))}"></span><input class="tb-fxin" data-tx="text" spellcheck="false" autocomplete="off" aria-label="${esc(t('table.cellTextAria', 'Cell text (LaTeX)'))}" placeholder="${esc(t('table.cellTextPh', 'Cell text: plain words, $maths$, \\textbf{…}'))}"></div>
      <div class="tb-gridwrap" tabindex="0" aria-label="${esc(t('table.cells', 'Table cells'))}" role="grid"><div class="tb-grid"></div><div class="tb-selbox" aria-hidden="true"></div></div>
      <div class="tb-out">
        <div class="tb-outbar">
          <div class="seg tb-tabs" role="tablist"><button type="button" role="tab" data-tab="preview">${esc(t('ui.preview', 'Preview'))}</button><button type="button" role="tab" data-tab="latex">LaTeX</button></div>
          <span class="tb-pk" title="${esc(t('table.packagesShort', 'Packages the LaTeX needs'))}"></span>
          <div class="spacer"></div>
          <button type="button" class="primary" data-o="copy" title="${esc(t('table.copyLatexTip', 'Copy the LaTeX ({key})', { key: SHIFT + MOD + 'C' }))}">${esc(t('table.copyLatex', 'Copy LaTeX'))}</button>
          <button type="button" data-o="copy-png" title="${esc(t('table.copyPngTip', 'Copy the table as a PNG picture'))}">${esc(t('table.copyPng', 'Copy PNG'))}</button>
          <span class="tb-join" role="group" aria-label="${esc(t('ui.download', 'Download'))}"><button type="button" data-o="dl-tex" title="${esc(t('table.dlTexTip', 'Download the LaTeX: a document that compiles on its own'))}">${I.dl}.tex</button><button type="button" data-o="dl-svg" title="${esc(t('table.dlSvgTip', 'Download a vector SVG (maths fonts embedded)'))}">SVG</button><button type="button" data-o="dl-png" title="${esc(t('table.dlPngTip', 'Download a PNG at the resolution on the right'))}">PNG</button></span>
          <select data-o="dpi" aria-label="${esc(t('table.pngRes', 'PNG resolution'))}" title="${esc(t('table.pngRes', 'PNG resolution'))}">${[150, 300, 600].map((d) => `<option value="${d}"${d === +out.dpi ? ' selected' : ''}>${d} DPI</option>`).join('')}</select>
        </div>
        <div class="tb-prev" data-pane="preview"></div>
        <div class="tb-code codeview" data-pane="latex" tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label="${esc(t('ui.latex.code', 'LaTeX code'))}"></div>
      </div>
      <div class="tb-start" hidden></div>
    </div>`;
    paint(); panel(); preview(); tabs(); startScreen();
  }

  // ---------------------------------------------------------------- the start screen (nothing imported yet)
  function startScreen() {
    const s = $('.tb-start');
    s.hidden = !fresh;
    host!.classList.toggle('is-fresh', fresh);
    if (!fresh) { s.innerHTML = ''; return; }
    s.innerHTML = `<div class="tb-drop">
      <div class="tb-drop-t">${esc(t('table.start.title', 'Make a table'))}</div>
      <p>${esc(t('table.start.body', 'Paste cells from Excel or Google Sheets ({key}), drop a file here, or paste CSV, Markdown, HTML or a LaTeX', { key: MOD + 'V' }))} <code>tabular</code> ${esc(t('table.start.below', 'below.'))}</p>
      <textarea class="tb-paste" spellcheck="false" placeholder="Name, Mass, Speed&#10;Ball, 0.45, 12.3&#10;…" aria-label="${esc(t('table.start.pasteAria', 'Table text to import'))}"></textarea>
      <div class="tb-drop-acts">
        <button type="button" data-t="file">${esc(t('ui.choose.file', 'Choose File…'))}</button>
        <span class="spacer"></span>
        <button type="button" data-t="blank" title="${esc(t('table.start.blankTip', 'An empty 4 × 3 table'))}">${esc(t('table.start.blank', 'Start Empty'))}</button>
        <button type="button" class="primary" data-t="import-text">${esc(t('table.import', 'Import'))}</button>
      </div>
      <p class="tb-drop-foot">CSV, TSV, Excel (.xlsx), Markdown, HTML ${esc(t('table.start.and', 'and'))} LaTeX (<code>tabular</code>, <code>tabularx</code>, <code>longtable</code>, booktabs, <code>\\multicolumn</code>, <code>\\multirow</code>). ${esc(t('table.start.local', 'Nothing leaves your browser.'))}</p>
    </div>`;
    requestAnimationFrame(() => (s.querySelector('.tb-paste') as HTMLElement)?.focus({ preventScroll: true }));
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
      if (n) return cellPreview(T.mathText(T.format(n, col.num), col.num.unc || 'paren'));
    }
    let t = T.shownText(M, r, c, x);
    if (!t.trim()) return '';
    if (x.tt) t = t.split('\n').map((l: string) => (l.trim() ? `\\texttt{${l}}` : l)).join('\n');
    if (x.u) t = t.split('\n').map((l: string) => (l.trim() ? `\\underline{${l}}` : l)).join('\n');
    try { return cellPreview(t); } catch (e: any) { return esc(t); }
  }
  function cellPreview(text: string): string {
    const html = TD.math.liveMarkup(TD.textHtml(text));
    return TD.math.isPending(html) ? `<span class="math-pending">${TD.math.cleanPreview(html)}</span>` : html;
  }
  function paint(): void {
    if (!TD.math.previewing) return TD.math.preview(paint);
    const g = $('.tb-grid');
    if (!g) return;
    const nr = T.nRows(M), nc = T.nCols(M), own = T.owners(M);
    const wrap = $('.tb-gridwrap'), keep = [wrap.scrollLeft, wrap.scrollTop];
    const colW = (c: number) => (M.cols[c].w > 0 ? `${(M.cols[c].w * PX).toFixed(1)}px` : 'auto');
    let h = `<table class="tg" style="font-size:${(TD.sizePx(M.size) as number).toFixed(2)}px;--tb-stretch:${M.stretch}${M.ruleColor ? `;--tb-rule:${M.ruleColor}` : ''}"><colgroup><col class="tg-rhc">${M.cols.map((_: any, c: number) => `<col style="width:${colW(c)}">`).join('')}</colgroup>`;
    h += `<thead><tr><th class="tg-corner" data-all title="${esc(t('table.selectAllTip', 'Select all ({key})', { key: MOD + 'A' }))}"></th>${M.cols.map((col: any, c: number) => `<th class="tg-ch${col.num ? ' num' : ''}" data-ch="${c}"><span>${T.colName(c)}</span>${col.num ? `<i title="${esc(t('table.numAligned', 'Numbers aligned on the decimal point'))}">.00</i>` : ''}${col.w > 0 ? `<i title="${esc(t('table.wrapsAt', 'Wraps at {w} cm', { w: col.w }))}">${col.w}cm</i>` : col.fill && M.env === 'tabularx' ? `<i title="${esc(t('table.fillTip', 'Takes the rest of the width (X)'))}">X</i>` : ''}<span class="tg-rs" data-rs="${c}" title="${esc(t('table.resizeTip', 'Drag to set a width (the column wraps); double-click for automatic'))}"></span></th>`).join('')}</tr></thead><tbody>`;
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
    const plus = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10"/></svg>';
    g.innerHTML = `<div class="tg-box">${h}</tbody></table><button type="button" class="tg-add tg-addc" data-add="col" title="${esc(t('table.addCol', 'Add a column'))}" aria-label="${esc(t('table.addCol', 'Add a column'))}">${plus}</button><button type="button" class="tg-add tg-addr" data-add="row" title="${esc(t('table.addRow', 'Add a row'))}" aria-label="${esc(t('table.addRow', 'Add a row'))}">${plus}</button></div>`;
    const head = g.querySelector('thead') as HTMLElement, corner = g.querySelector('.tg-corner') as HTMLElement;
    // a button doesn't stretch between top and bottom like a div does, so the strips get their size here
    const tbl = g.querySelector('table') as HTMLElement, addc = g.querySelector('.tg-addc') as HTMLElement, addr = g.querySelector('.tg-addr') as HTMLElement;
    addc.style.top = head.offsetHeight + 'px'; addc.style.height = tbl.offsetHeight - head.offsetHeight + 'px';
    addr.style.left = corner.offsetWidth + 'px'; addr.style.width = tbl.offsetWidth - corner.offsetWidth + 'px';
    wrap.scrollLeft = keep[0]; wrap.scrollTop = keep[1];
    syncSel();
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
    const ref = $('.tb-ref');
    if (ref) ref.textContent = g.r0 === g.r1 && g.c0 === g.c1 ? T.cellName(act[0], act[1]) : `${T.cellName(g.r0, g.c0)}:${T.cellName(g.r1, g.c1)}`;
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
    if (!cancel && v !== was && M.cells[r] && M.cells[r][c]) change(() => { M.cells[r][c].t = v; });
    else syncSel();
  }
  function editKeys(e: KeyboardEvent) {
    const ta = e.target as HTMLTextAreaElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(true); focusGrid(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); finishEdit(); select(step(act, e.metaKey || e.ctrlKey ? 0 : 1, 0)); focusGrid(); return; }
    if (e.key === 'Tab') { e.preventDefault(); finishEdit(); select(step(act, 0, e.shiftKey ? -1 : 1)); focusGrid(); return; }
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
  let lastBorder: BorderWhere = 'all';
  function border(where: BorderWhere, w: Rule = 1) { lastBorder = where; ($('[data-t="border"]') as HTMLElement).innerHTML = B[where]; ($('[data-t="border"]') as HTMLElement).title = t('table.border.last', '{name} (the last one picked)', { name: BNAME()[where] }); change(() => T.setBorders(M, range(), where, w)); }
  function pickColor(btn: HTMLElement, k: 'fg' | 'bg') {
    const g = range(), cur = M.cells[act[0]][act[1]][k] || null;
    const before = JSON.stringify(M);
    let changed = false;
    TD.openColorPicker(btn, {
      value: cur, nullable: true, noneLabel: k === 'fg' ? t('table.automatic', 'Automatic') : t('table.noFill', 'No Fill'),
      onInput: (v: any) => { const hex = v ? TD.parseColor(v).hex : undefined; T.styleRange(M, g, { [k]: hex }); changed = true; paint(); preview(); },
      onChange: (v: any) => { const hex = v ? TD.parseColor(v).hex : undefined; T.styleRange(M, g, { [k]: hex }); changed = true; paint(); preview(); },
      onClose: () => { if (changed && JSON.stringify(M) !== before) { undoStack.push(before); redoStack.length = 0; fresh = false; save(); panel(); toolbarState(); } },
    });
  }
  function toggleNum() {
    const g = range(), cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, k) => g.c0 + k);
    const on = cols.every((c) => M.cols[c].num);
    change(() => { for (const c of cols) M.cols[c].num = on ? null : {}; });
    if (!on) hint(t('table.hint.numOn', 'Numbers aligned on the decimal point (siunitx S column). Round them in the panel on the right.'), 2600);
  }
  function toolbarState() {
    const x = M.cells[act[0]][act[1]], all = anchorsSel(), g = range();
    const tog = (k: string, on: boolean) => $(`[data-t="${k}"]`)?.classList.toggle('on', on);
    tog('b', all.every((y, i) => !!y.b || (M.headBold && rowOfAnchor(g, i) < M.head)));
    tog('i', all.every((y) => !!y.i)); tog('u', all.every((y) => !!y.u)); tog('tt', all.every((y) => !!y.tt));
    const al = T.alignOf(M, act[1], x);
    host!.querySelectorAll('[data-t="al"]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === al));
    tog('num', !!M.cols[act[1]].num);
    const fg = $('[data-t="fg"] .sw'), bg = $('[data-t="bg"] .sw');
    if (fg) fg.style.stroke = x.fg || 'currentColor';
    if (bg) bg.style.stroke = x.bg || 'transparent';
    const sel = $('[data-t="preset"]') as HTMLSelectElement;
    if (sel) sel.value = M.preset;
    const multi = g.r0 !== g.r1 || g.c0 !== g.c1;
    ($('[data-t="merge"]') as HTMLButtonElement).disabled = !multi;
    ($('[data-t="split"]') as HTMLButtonElement).disabled = !anchorsSel().some((y) => y.rs || y.cs);
    ($('[data-t="undo"]') as HTMLButtonElement).disabled = !undoStack.length;
    ($('[data-t="redo"]') as HTMLButtonElement).disabled = !redoStack.length;
  }

  // ---------------------------------------------------------------- menus (borders, right-click)
  let menu: HTMLElement | null = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(html: string, x: number, y: number, alignRight = false) {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'ctx tb-ctx';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = alignRight ? x - w : x;
    menu.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
    menu.style.top = (y + h > innerHeight - 8 ? Math.max(8, y - h) : y) + 'px';
    menu.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('[data-m]') as HTMLElement;
      if (!b || (b as HTMLButtonElement).disabled) return;
      closeMenu(); menuAct(b.dataset.m!);
    });
  }
  // checked: a radio item (role menuitemradio) with a tick at its right end when it is the one picked
  const TICK = '<svg class="ck" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
  const item = (label: string, act2: string, o: { icon?: string; key?: string; dis?: boolean; danger?: boolean; checked?: boolean } = {}) =>
    `<button class="ctx-item${o.danger ? ' danger' : ''}" data-m="${act2}"${o.checked != null ? ` role="menuitemradio" aria-checked="${o.checked}"` : ''}${o.dis ? ' disabled' : ''}>${o.icon || '<span class="ic"></span>'}<span class="lb">${esc(label)}</span>${o.key ? `<kbd>${o.key}</kbd>` : ''}${o.checked != null ? (o.checked ? TICK : '<span class="ck"></span>') : ''}</button>`;
  function bordersMenu(anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    const where: BorderWhere[] = ['all', 'outer', 'inner', 'innerH', 'innerV', 'top', 'bottom', 'left', 'right', 'none'];
    openMenu(`<div class="tb-bgrid">${where.map((w) => `<button type="button" class="icon flat" data-m="b:${w}" title="${esc(BNAME()[w])}">${B[w]}</button>`).join('')}</div><hr>
      ${item(t('table.rules.thick', 'Thick Rules'), 'bw:2', { icon: ic('<path d="M3 10h14" stroke-width="3"/>'), checked: borderW === 2 })}${item(t('table.rules.thin', 'Thin Rules'), 'bw:1', { icon: ic('<path d="M3 10h14"/>'), checked: borderW === 1 })}${item(t('table.rules.double', 'Double Rules'), 'bw:3', { icon: ic('<path d="M3 8h14M3 12h14"/>'), checked: borderW === 3 })}`, r.left, r.bottom + 6);
  }
  let borderW: Rule = 1;
  function ctxMenu(x: number, y: number) {
    const g = range(), rows = g.r1 - g.r0 + 1, cols = g.c1 - g.c0 + 1, nr = T.nRows(M), nc = T.nCols(M);
    const multi = rows > 1 || cols > 1, merged = anchorsSel().some((q) => q.rs || q.cs);
    const many = rows > 1, manyC = cols > 1;
    openMenu(
      item(t('ui.cut', 'Cut'), 'cut', { key: MOD + 'X' }) + item(t('ui.copy', 'Copy'), 'copy', { key: MOD + 'C' }) + item(t('ui.paste', 'Paste'), 'paste', { key: MOD + 'V' }) + '<hr>' +
      item(many ? t('table.insertRowsAbove', 'Insert {n} Rows Above', { n: rows }) : t('table.insertRowAbove', 'Insert Row Above'), 'row-above', { icon: gridIcon('above') }) +
      item(many ? t('table.insertRowsBelow', 'Insert {n} Rows Below', { n: rows }) : t('table.insertRowBelow', 'Insert Row Below'), 'row-below', { icon: gridIcon('below') }) +
      item(manyC ? t('table.insertColsLeft', 'Insert {n} Columns Left', { n: cols }) : t('table.insertColLeft', 'Insert Column Left'), 'col-left', { icon: gridIcon('before') }) +
      item(manyC ? t('table.insertColsRight', 'Insert {n} Columns Right', { n: cols }) : t('table.insertColRight', 'Insert Column Right'), 'col-right', { icon: gridIcon('after') }) + '<hr>' +
      item(t('table.moveUp', 'Move Up'), 'up', { dis: g.r0 === 0 }) + item(t('table.moveDown', 'Move Down'), 'down', { dis: g.r1 === nr - 1 }) + item(t('table.moveLeft', 'Move Left'), 'left', { dis: g.c0 === 0 }) + item(t('table.moveRight', 'Move Right'), 'right', { dis: g.c1 === nc - 1 }) + '<hr>' +
      item(t('table.mergeCells', 'Merge Cells'), 'merge', { icon: I.merge, dis: !multi }) + item(t('table.splitCells', 'Split Cells'), 'split', { icon: I.split, dis: !merged }) +
      item(g.r1 < M.head && g.r0 === 0 ? t('table.headerAbove', 'Header: rows above this one') : t('table.headerRows', 'Header: rows 1–{n}', { n: g.r1 + 1 }), 'head', { icon: ic('<path d="M3 3h14v14H3z"/><path d="M3 7.5h14" stroke-width="2.5"/>') }) + '<hr>' +
      item(t('table.clearText', 'Clear Text'), 'clear-text', { key: '⌫' }) + item(t('table.clearFormat', 'Clear Formatting'), 'clear-format') +
      item(many ? t('table.deleteRows', 'Delete {n} Rows', { n: rows }) : t('table.deleteRow', 'Delete Row'), 'del-rows', { danger: true, dis: rows >= nr, icon: gridIcon('rowdel') }) +
      item(manyC ? t('table.deleteCols', 'Delete {n} Columns', { n: cols }) : t('table.deleteCol', 'Delete Column'), 'del-cols', { danger: true, dis: cols >= nc, icon: gridIcon('coldel') }), x, y);
  }
  function menuAct(a: string) {
    const g = range();
    if (a === 'imp-text') { importDialog(); return; }
    if (a === 'imp-file') { chooseFile(); return; }
    if (a === 'imp-blank') { replaceTable(T.create(4, 3, 'booktabs'), t('table.newTable', 'A new table')); return; }
    if (a.startsWith('b:')) { border(a.slice(2) as BorderWhere, borderW); return; }
    if (a.startsWith('bw:')) { borderW = +a.slice(3) as Rule; hint(borderW === 3 ? t('table.hint.rulesDouble', 'New rules are double') : borderW === 2 ? t('table.hint.rulesThick', 'New rules are thick') : t('table.hint.rulesThin', 'New rules are thin')); return; }
    switch (a) {
      case 'cut': copySel(true); break;
      case 'copy': copySel(false); break;
      case 'paste': pasteFromClipboard(); break;
      case 'row-above': change(() => T.insertRows(M, g.r0, g.r1 - g.r0 + 1)); select([g.r0, act[1]]); break;
      case 'row-below': change(() => T.insertRows(M, g.r1 + 1, g.r1 - g.r0 + 1)); select([g.r1 + 1, act[1]]); break;
      case 'col-left': change(() => T.insertCols(M, g.c0, g.c1 - g.c0 + 1)); select([act[0], g.c0]); break;
      case 'col-right': change(() => T.insertCols(M, g.c1 + 1, g.c1 - g.c0 + 1)); select([act[0], g.c1 + 1]); break;
      case 'up': if (change(() => T.moveRows(M, g.r0, g.r1, -1))) { act[0]--; ext[0]--; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way')); break;
      case 'down': if (change(() => T.moveRows(M, g.r0, g.r1, 1))) { act[0]++; ext[0]++; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way')); break;
      case 'left': if (change(() => T.moveCols(M, g.c0, g.c1, -1))) { act[1]--; ext[1]--; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way')); break;
      case 'right': if (change(() => T.moveCols(M, g.c0, g.c1, 1))) { act[1]++; ext[1]++; syncSel(true); } else hint(t('table.hint.mergedInWay', 'A merged cell is in the way')); break;
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
    if (filled > 1) hint(t('table.hint.merged', 'Merged: the texts were joined. {key} undoes it.', { key: MOD + 'Z' }), 2200);
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
    } catch (e: any) { hint(t('table.hint.copyFailed', "Couldn't copy")); return; }
    if (cut) change(() => T.clearRange(M, g, 'all'));
  }
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) if (it.types.includes('text/html')) { pasteData(await (await it.getType('text/html')).text(), await (it.types.includes('text/plain') ? (await it.getType('text/plain')).text() : '')); return; }
      pasteData('', await navigator.clipboard.readText());
    } catch (e: any) { hint(t('table.hint.usePaste', 'Use {key} to paste', { key: MOD + 'V' })); }
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
      } catch (e: any) { hint(String(e.message || e)); return; }
    }
    if (fresh && src && T.nRows(src) * T.nCols(src) > 1) { replaceTable(src, t('table.pasted', 'Pasted')); return; }
    if (!src) {
      // one value: the text as typed, in every selected cell
      change(() => { for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) M.cells[r][c].t = body; });
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
    if (p) {
      act = [p.r0, p.c0]; ext = [p.r1, p.c1]; clampSel(); syncSel(true); panel();
      if (T.nRows(M) > nrWas || T.nCols(M) > ncWas) hint(t('table.hint.grew', 'Pasted {h} × {w}; the table grew to {rows} × {cols}', { h, w, rows: T.nRows(M), cols: T.nCols(M) }), 2000);
    }
  }
  function replaceTable(tbl: TableModel, note?: string) {
    finishEdit(true);
    const was = fresh;
    change(() => { M = tbl; });
    fresh = false;
    if (was !== fresh) startScreen();
    act = [0, 0]; ext = [0, 0];
    syncSel(); panel();
    focusGrid();
    if (note) hint(t('table.hint.replaced', '{what} · {rows} × {cols}. {key} undoes it.', { what: note, rows: T.nRows(M), cols: T.nCols(M), key: MOD + 'Z' }), 2400);
  }
  async function importFile(file: File) {
    try {
      const r = await T.importFile(file);
      replaceTable(r.table, t('table.importedFile', 'Imported {name}', { name: file.name }));
      if (r.warnings.length) setTimeout(() => hint(r.warnings.join(' · '), 3200), 2500);
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
    if (!String(text).trim()) { hint(t('table.hint.emptyImport', 'Nothing to import: the box was empty')); return; }
    try { const r = T.importText(String(text)); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); }
    catch (e: any) { TD.alert(t('table.importFailed', "Couldn't import"), String(e.message || e)); }
  }

  // ---------------------------------------------------------------- the right panel
  const rowsHtml = (rows: [string, string, string?][]) => rows.map(([l, ctl, title]) => `<div class="row"${title ? ` title="${esc(title)}"` : ''}><label>${esc(l)}</label><div class="ctl">${ctl}</div></div>`).join('');
  const seg = (key: string, list: [string, string, string?][], cur: string) => `<div class="seg-ctl" data-seg="${key}">${list.map(([v, l, tip]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
  const opt = (list: [string, string][], cur: string) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const SIZE_NAMES = (): [string, string][] => [['tiny', t('table.size.tiny', 'Tiny')], ['scriptsize', t('table.size.script', 'Script')], ['footnotesize', t('table.size.footnote', 'Footnote')], ['small', t('table.size.small', 'Small')], ['normalsize', t('ui.normal', 'Normal')], ['large', t('table.size.large', 'Large')], ['Large', t('table.size.larger', 'Larger')]];
  const swatch = (k: string, v: string | undefined, none: string) => `<button type="button" class="tb-swatch" data-color="${k}" title="${esc(v || none)}"><i style="background:${v || 'transparent'}"${v ? '' : ' class="none"'}></i><span>${v ? v.toUpperCase() : esc(none)}</span></button>`;
  let detailsOpen = false;
  const floatCtl = () => M.env === 'longtable' ? `<span class="tb-unit">${esc(t('table.longtableNoFloat', 'longtable: over pages, no float'))}</span>`
    : (M.caption.trim() || M.label.trim()) ? `<label class="tb-chk" title="${esc(t('table.floatForced', 'A caption or label always puts the table in a table environment'))}"><input type="checkbox" checked disabled> ${esc(t('table.tableEnv', 'table environment'))}</label>`
    : `<label class="tb-chk" title="${esc(t('table.floatTip', 'In a table environment, placed by LaTeX (h t b p)'))}"><input type="checkbox" data-p="float"${M.float ? ' checked' : ''}> ${esc(t('table.tableEnv', 'table environment'))}</label>`;
  function panel() {
    if (!shown) return;
    const el = document.getElementById('props');
    if (!el) return;
    const keep = el.scrollTop;
    const c = act[1], col = M.cols[c], x = M.cells[act[0]][act[1]], g = range();
    const n = col.num;
    const round = !n ? 'none' : n.sig != null ? 'sig' : n.dp != null ? 'dp' : 'none';
    el.innerHTML = `<h3>${esc(t('ui.table', 'Table'))} <small>${T.nRows(M)} × ${T.nCols(M)}</small></h3>
    <div class="sec">${rowsHtml([
      [t('ui.style', 'Style'), `<select data-p="preset" aria-label="${esc(t('table.style', 'Table style'))}">${opt([...T.PRESETS.map((p: any) => [p.key, presetName(p)]), ['custom', t('table.customRules', 'Custom rules')]], M.preset)}</select>`],
      [t('table.headerRowsLabel', 'Header rows'), `<input type="number" data-p="head" min="0" max="${T.nRows(M)}" step="1" value="${M.head}" aria-label="${esc(t('table.headerRowsLabel', 'Header rows'))}"><label class="tb-chk" title="${esc(t('table.headBoldTip', 'The header rows in bold'))}"><input type="checkbox" data-p="headBold"${M.headBold ? ' checked' : ''}> ${esc(t('ui.bold', 'Bold'))}</label>`],
      [t('table.rules', 'Rules'), seg('booktabs', [['1', 'booktabs', t('table.rules.booktabsTip', 'Rules of different weights, with space round them (\\toprule, \\midrule, \\bottomrule)')], ['0', esc(t('table.rules.lines', 'Lines')), t('table.rules.linesTip', '\\hline and \\cline: thin lines, no extra space')]], M.booktabs ? '1' : '0')],
      [t('table.stripes', 'Stripes'), `<label class="tb-chk"><input type="checkbox" data-p="striped"${M.stripe || M.stripe2 ? ' checked' : ''}> ${esc(t('table.everyOtherRow', 'Every other row'))}</label>${M.stripe || M.stripe2 ? swatch('stripe', M.stripe, t('ui.none', 'None')).replace('class="tb-swatch"', `class="tb-swatch bare" aria-label="${esc(t('table.stripeColour', 'Stripe colour'))}"`) : ''}`],
      ...(M.stripe || M.stripe2 ? [[t('table.otherRows', 'Other rows'), swatch('stripe2', M.stripe2, t('ui.none', 'None')), t('table.otherRowsTip', "The rows between the stripes (\\rowcolors' other colour)")] as [string, string, string]] : []),
    ])}</div>
    <div class="sec"><div class="sec-title">${esc(t('table.columnTitle', 'Column {name}', { name: T.colName(c) + (g.c1 > g.c0 ? `–${T.colName(g.c1)}` : '') }))}</div>${rowsHtml([
      [t('ui.align', 'Align'), seg('colAl', [['l', I.al.l, t('ui.left', 'Left')], ['c', I.al.c, t('ui.centre', 'Centre')], ['r', I.al.r, t('ui.right', 'Right')], ['j', I.al.j, t('table.justified', 'Justified (with a width)')]], col.al)],
      [t('ui.width', 'Width'), `<input type="number" data-p="w" min="0" step="0.1" value="${col.w || ''}" placeholder="${esc(t('ui.auto', 'Auto'))}" aria-label="${esc(t('table.colWidthAria', 'Column width (cm)'))}" title="${esc(t('table.colWidthTip', 'A width in cm makes the column wrap (p{…}); empty: as wide as its text'))}"><span class="tb-unit">cm</span>${M.env === 'tabularx' ? `<label class="tb-chk" title="${esc(t('table.colFillTip', 'The column takes the rest of the line (X)'))}"><input type="checkbox" data-p="fill"${col.fill ? ' checked' : ''}> ${esc(t('table.fill', 'Fill'))}</label>` : ''}`],
      [t('table.numbers', 'Numbers'), `<label class="tb-chk" title="${esc(t('table.numbersTip', 'Numbers align on the decimal point in a siunitx S column'))}"><input type="checkbox" data-p="num"${n ? ' checked' : ''}> ${esc(t('table.alignDecimals', 'Align decimals'))}</label>`],
    ])}${n ? `<div class="tb-sub">${rowsHtml([
      [t('table.round', 'Round'), `<select data-p="round" aria-label="${esc(t('table.rounding', 'Rounding'))}">${opt([['none', t('table.asTyped', 'As typed')], ['sig', t('table.sigFigs', 'Significant figures')], ['dp', t('table.decimals', 'Decimal places')]], round)}</select>${round !== 'none' ? `<input type="number" class="tb-n" data-p="prec" min="${round === 'sig' ? 1 : 0}" max="15" step="1" value="${round === 'sig' ? n.sig : n.dp}" aria-label="${round === 'sig' ? esc(t('table.sigFigs', 'Significant figures')) : esc(t('table.decimals', 'Decimal places'))}">` : ''}`],
      [t('table.exponent', 'Exponent'), `<select data-p="exp" aria-label="${esc(t('table.exponent', 'Exponent'))}">${opt([['input', t('table.asTyped', 'As typed')], ['sci', t('table.scientific', 'Scientific (× 10ⁿ)')], ['fixed', t('table.never', 'Never')]], n.exp || 'input')}</select>`],
      [t('table.uncertainty', 'Uncertainty'), seg('unc', [['paren', '1.23(4)'], ['pm', '1.23 ± 0.04']], n.unc || 'paren')],
    ])}</div>` : ''}${rowsHtml([
      [t('table.unit', 'Unit'), `<input type="text" data-p="unit" value="${esc(col.unit || '')}" placeholder="kg, m/s, \\kilo\\gram" aria-label="${esc(t('table.unit', 'Unit'))}" spellcheck="false" title="${esc(t('table.unitTip', 'siunitx unit, shown after the header text: Mass (kg)'))}">`],
    ])}</div>
    <div class="sec"><div class="sec-title">${esc(t('table.cellTitle', 'Cell {name}', { name: g.r0 === g.r1 && g.c0 === g.c1 ? T.cellName(act[0], act[1]) : `${T.cellName(g.r0, g.c0)}:${T.cellName(g.r1, g.c1)}` }))}</div>${rowsHtml([
      [t('ui.vertical', 'Vertical'), seg('va', [['t', I.va.t, t('ui.top', 'Top')], ['m', I.va.m, t('table.middle', 'Middle')], ['b', I.va.b, t('ui.bottom', 'Bottom')]], x.va || ((x.rs || 1) > 1 ? 'm' : 't'))],
      [t('ui.size', 'Size'), `<select data-p="sz" aria-label="${esc(t('table.textSize', 'Text size'))}">${opt([['', t('table.asTable', 'As the table')], ...SIZE_NAMES()], x.sz || '')}</select>`],
      [t('ui.text', 'Text'), swatch('fg', x.fg, t('table.automatic', 'Automatic'))],
      [t('ui.fill', 'Fill'), swatch('bg', x.bg, t('ui.none', 'None'))],
    ])}</div>
    <div class="sec"><div class="sec-title">LaTeX</div>${session ? `<div class="hint-line">${esc(t('table.inDiagram', 'In the diagram the table is a tabular in a node: no caption, label or float.'))}</div>` : ''}${rowsHtml(session ? [] : [
      [t('table.caption', 'Caption'), `<input type="text" data-p="caption" value="${esc(M.caption)}" placeholder="${esc(t('ui.none', 'None'))}" aria-label="${esc(t('table.caption', 'Caption'))}">`],
      [t('ui.label', 'Label'), `<input type="text" data-p="label" value="${esc(M.label)}" placeholder="tab:results" aria-label="${esc(t('ui.label', 'Label'))}" spellcheck="false">`],
      [t('table.float', 'Float'), `<span class="tb-floatctl">${floatCtl()}</span>`],
      [t('table.place', 'Place'), seg('place', [['left', I.al.l, t('ui.left', 'Left')], ['center', I.al.c, t('ui.centre', 'Centre')], ['right', I.al.r, t('ui.right', 'Right')]], M.place)],
    ])}
    <details class="tb-more-sec"${detailsOpen ? ' open' : ''}><summary>${esc(t('table.moreOptions', 'More options'))}</summary>${rowsHtml([
      [t('table.environment', 'Environment'), `<select data-p="env" aria-label="${esc(t('table.environment', 'Environment'))}">${opt([['tabular', 'tabular'], ['tabularx', t('table.env.tabularx', 'tabularx (full width)')], ...(session ? [] : [['longtable', t('table.env.longtable', 'longtable (over pages)')] as [string, string]])], M.env)}</select>`],
      ...(M.env === 'tabularx' ? [[t('ui.width', 'Width'), `<input type="number" data-p="width" min="10" max="100" step="5" value="${Math.round(M.width * 100)}" aria-label="${esc(t('ui.width', 'Width'))}"><span class="tb-unit">${esc(t('table.ofLine', '% of the line'))}</span>`] as [string, string]] : []),
      ...(M.env === 'longtable' && !session ? [[t('table.footerRows', 'Footer rows'), `<input type="number" data-p="foot" min="0" max="${T.nRows(M) - M.head}" step="1" value="${M.foot}" aria-label="${esc(t('table.footerRows', 'Footer rows'))}">`, t('table.footerTip', 'The bottom rows: written once, at the end of the table (\\endlastfoot); the other pages end with the rule above them')] as [string, string, string]] : []),
      ...(M.env !== 'longtable' && !session ? [[t('table.placement', 'Placement'), `<input type="text" data-p="floatPos" value="${esc(M.floatPos)}" placeholder="htbp" aria-label="${esc(t('table.floatPlacement', 'Float placement'))}" spellcheck="false" maxlength="5" title="${esc(t('table.placementTip', 'Where LaTeX may put the table: h here, t top, b bottom, p own page, ! try harder, H exactly here (float package)'))}">`] as [string, string]] : []),
      ...(session ? [] : [[t('table.captionAt', 'Caption at'), seg('capTop', [['1', esc(t('ui.top', 'Top'))], ['0', esc(t('ui.bottom', 'Bottom'))]], M.capTop ? '1' : '0')] as [string, string]]),
      [t('ui.font.size', 'Font size'), `<select data-p="size" aria-label="${esc(t('ui.font.size', 'Font size'))}">${opt(SIZE_NAMES(), M.size)}</select>`],
      [t('table.padding', 'Padding'), `<input type="number" data-p="pad" min="0" max="30" step="0.5" value="${M.pad}" aria-label="${esc(t('table.paddingAria', 'Cell padding (pt)'))}" title="${esc(t('table.paddingTip', '\\tabcolsep: the space on each side of a column'))}"><span class="tb-unit">pt</span>`],
      [t('table.rowHeight', 'Row height'), `<input type="number" data-p="stretch" min="0.5" max="4" step="0.05" value="${M.stretch}" aria-label="${esc(t('table.rowHeight', 'Row height'))}" title="${esc(t('table.rowHeightTip', "\\arraystretch: 1 is LaTeX's own"))}"><span class="tb-unit">×</span>`],
      [t('table.ruleWidth', 'Rule width'), `<input type="number" data-p="ruleW" min="0.1" max="5" step="0.1" value="${M.ruleW}" aria-label="${esc(t('table.ruleWidthAria', 'Rule width (pt)'))}" title="${esc(t('table.ruleWidthTip', "\\arrayrulewidth: thin rules and | (LaTeX's 0.4 pt)"))}"><span class="tb-unit">pt</span>${swatch('ruleColor', M.ruleColor, t('table.black', 'Black')).replace('class="tb-swatch"', `class="tb-swatch bare" aria-label="${esc(t('table.ruleColour', 'Rule colour'))}"`).replace(/title="[^"]*"/, `title="\\arrayrulecolor: ${M.ruleColor || 'black'}"`)}`],
      [t('table.unitsAs', 'Units as'), `<select data-p="unitStyle" aria-label="${esc(t('table.unitsAsAria', 'How units follow the header'))}">${opt([['paren', t('table.units.paren', 'Mass (kg)')], ['bracket', t('table.units.bracket', 'Mass [kg]')], ['slash', t('table.units.slash', 'Mass / kg')]], M.unitStyle)}</select>`],
    ])}</details></div>
    <div class="sec tb-keys"><div class="sec-title">${esc(t('table.keys', 'Keys'))}</div><div class="hint-line">${esc(t('table.keys.replace', 'Type to replace a cell'))} · <kbd>Enter</kbd> ${esc(t('table.keys.edit', 'or double-click to edit'))} · <kbd>${SHIFT}Enter</kbd> ${esc(t('table.keys.newline', 'new line'))} · <kbd>${SHIFT}</kbd>${esc(t('table.keys.select', '+arrows select'))} · <kbd>${MOD}C</kbd> <kbd>${MOD}V</kbd> ${esc(t('table.keys.clip', 'copy and paste with Excel and Sheets'))} · ${esc(t('table.keys.menu', 'right-click for rows, columns and merging.'))}</div></div>`;
    // the heading moves into the window's head (app.ts does it too, but later, from a MutationObserver);
    // moving it now keeps the height the scroll is restored against, so ticking a box doesn't scroll up
    const h = el.firstElementChild, head = document.getElementById('propsHead');
    if (h && h.tagName === 'H3' && head) { const old = head.querySelector('h3'); if (old) old.replaceWith(h); else head.prepend(h); }
    el.scrollTop = keep;
  }
  function syncPanel() {
    // after an edit typed in the panel: only the summary needs to follow (the field keeps its focus)
    const s = document.querySelector('#propsHead h3 small');
    if (s) s.textContent = `${T.nRows(M)} × ${T.nCols(M)}`;
  }
  function panelChange(e: Event) {
    const t = e.target as HTMLInputElement, k = t.dataset.p;
    if (!k || !shown) return;
    const g = range(), c = act[1], cols = Array.from({ length: g.c1 - g.c0 + 1 }, (_, i) => g.c0 + i);
    const num = (v: string, lo: number, hi: number) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
    const live = e.type === 'input';
    const typing = live && t.type === 'text';
    const o = { keepPanel: typing || (live && t.type === 'number') };
    switch (k) {
      case 'preset': if (t.value !== 'custom') change(() => { const s = M.stripe; T.applyPreset(M, t.value); if (t.value === 'striped' && s) M.stripe = s; }); break;
      case 'head': { const v = num(t.value, 0, T.nRows(M)); if (v != null) change(() => { M.head = Math.round(v); T.restyle(M); }, o); break; }
      case 'headBold': change(() => { M.headBold = t.checked; }); break;
      case 'striped': change(() => { M.stripe = t.checked ? '#eef2f7' : ''; if (!t.checked) { M.stripe2 = ''; M.stripeFrom = -1; } if (M.preset === 'striped' && !t.checked) M.preset = 'custom'; }); break;
      case 'foot': { const v = num(t.value, 0, T.nRows(M) - M.head); if (v != null) change(() => { M.foot = Math.round(v); }, o); break; }
      case 'floatPos': { const v = t.value.trim(); if (/^[htbpH!]{1,5}$/.test(v) || !v) change(() => { M.floatPos = v || 'htbp'; }, o); break; }
      case 'ruleW': { const v = num(t.value, 0.1, 5); if (v != null) change(() => { M.ruleW = v; }, o); break; }
      case 'w': { const v = t.value === '' ? 0 : num(t.value, 0, 40); if (v != null) change(() => { for (const k2 of cols) M.cols[k2].w = v; }, o); break; }
      case 'fill': change(() => { for (const k2 of cols) M.cols[k2].fill = t.checked || undefined; }); break;
      case 'num': change(() => { for (const k2 of cols) M.cols[k2].num = t.checked ? {} : null; }); break;
      case 'round': change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; delete n.sig; delete n.dp; if (t.value === 'sig') n.sig = 3; if (t.value === 'dp') n.dp = 2; M.cols[k2].num = n; } }); break;
      case 'prec': { const v = num(t.value, 0, 15); if (v != null) change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; if (n.sig != null) n.sig = Math.max(1, Math.round(v)); else n.dp = Math.round(v); M.cols[k2].num = n; } }, o); break; }
      case 'exp': change(() => { for (const k2 of cols) { const n = M.cols[k2].num || {}; if (t.value === 'input') delete n.exp; else n.exp = t.value as any; M.cols[k2].num = n; } }); break;
      case 'unit': change(() => { for (const k2 of cols) { if (t.value.trim()) M.cols[k2].unit = t.value.trim(); else delete M.cols[k2].unit; } }, o); break;
      case 'sz': change(() => T.styleRange(M, g, { sz: t.value || undefined })); break;
      case 'caption': case 'label': {
        change(() => { if (k === 'caption') M.caption = t.value; else M.label = t.value.trim(); }, o);
        const f = document.querySelector('#props .tb-floatctl');
        if (f) f.innerHTML = floatCtl();
        break;
      }
      case 'float': change(() => { M.float = t.checked; }); break;
      case 'env': change(() => { M.env = t.value as any; }); break;
      case 'width': { const v = num(t.value, 10, 100); if (v != null) change(() => { M.width = v / 100; }, o); break; }
      case 'size': change(() => { M.size = t.value; }); break;
      case 'pad': { const v = num(t.value, 0, 30); if (v != null) change(() => { M.pad = v; }, o); break; }
      case 'stretch': { const v = num(t.value, 0.5, 4); if (v != null) change(() => { M.stretch = v; }, o); break; }
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
  let pvTimer: any = null, codeText = '';
  function preview() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(previewNow, 40);
  }
  function previewNow(): void {
    if (!TD.math.previewing) return TD.math.preview(previewNow);
    if (!shown) return;
    const p = $('.tb-prev'), code = $('.tb-code'), pk = $('.tb-pk');
    if (!p) return;
    try {
      const d = TD.measureBatch(() => T.draw(M, {}));
      const pad = 12;
      p.innerHTML = `<svg class="tb-pic" viewBox="${-pad} ${-pad} ${(d.w + 2 * pad).toFixed(2)} ${(d.h + 2 * pad).toFixed(2)}" width="${((d.w + 2 * pad) * 1.25).toFixed(1)}" height="${((d.h + 2 * pad) * 1.25).toFixed(1)}">${d.svg}</svg>`;
    } catch (e: any) { p.textContent = t('table.drawFailed', 'Could not draw the table: {error}', { error: e.message || e }); }
    const r = T.toLatex(M, { bare: !!session });
    const text = (r.packages.length ? `% ${r.packages.join(' ')}\n` : '') + r.code;
    codeText = text;
    code.innerHTML = text.split('\n').map((l: string, i: number) => `<div class="cl" data-n="${i + 1}">${esc(l) || ' '}</div>`).join('');
    pk.textContent = r.packages.length ? r.packages.map((x: string) => /\{([^}]*)\}$/.exec(x)![1]).join(', ') : t('table.noPackages', 'No packages');
    pk.title = r.packages.length ? t('table.packagesTip', 'Packages the LaTeX needs (in the preamble):') + '\n' + r.packages.join('\n') : t('table.noPackagesTip', 'Plain LaTeX: no packages needed');
  }
  function tabs() {
    host!.querySelectorAll('[data-tab]').forEach((b) => { const on = (b as HTMLElement).dataset.tab === out.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    host!.querySelectorAll('[data-pane]').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.pane !== out.tab));
  }
  const saveOut = () => { try { localStorage.setItem(OUT_KEY, JSON.stringify(out)); } catch (e: any) { /* storage blocked */ } };
  function flash(btn: HTMLElement | null, text: string) {
    if (!btn) return;
    const old = btn.dataset.label || btn.innerHTML;
    btn.dataset.label = old; btn.textContent = text;
    clearTimeout((btn as any)._t);
    (btn as any)._t = setTimeout(() => { btn.innerHTML = old; delete btn.dataset.label; }, 1200);
  }
  const fileName = () => (M.label.replace(/^tab:/, '') || M.caption.replace(/\\[A-Za-z]+|[$\\{}]/g, '')).trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'table';
  async function output(what: string, btn: HTMLElement | null) {
    if (!TD.app.outputAllowed()) return;
    finishEdit();
    try {
      if (what === 'copy') {
        const r = T.toLatex(M, { bare: !!session });
        await navigator.clipboard.writeText((r.packages.length ? `% Preamble: ${r.packages.join(' ')}\n` : '') + r.code + '\n');
        flash(btn, t('ui.copied', 'Copied'));
      } else if (what === 'dl-tex') TD.app.downloadBlob(fileName() + '.tex', new Blob([T.toLatex(M, { standalone: true }).code], { type: 'text/x-tex' }));
      else if (what === 'dl-svg') {
        const svg = await TD.app.svgWithFonts(TD.app.svgOf([shape()]));
        TD.app.downloadBlob(fileName() + '.svg', new Blob([svg], { type: 'image/svg+xml' }));
      } else if (what === 'dl-png') TD.app.downloadBlob(fileName() + '.png', await TD.app.pngOf([shape()], +out.dpi, out.transparent));
      else if (what === 'copy-png') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': TD.app.pngOf([shape()], +out.dpi, false) })]);
        flash(btn, t('ui.copied', 'Copied'));
      }
    } catch (e: any) { hint(what.startsWith('dl') ? t('table.hint.fileFailed', "Couldn't make the file: {error}", { error: e.message || e }) : t('table.hint.copyFailedWhy', "Couldn't copy: {error}", { error: e.message || e }), 2600); }
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
      case 'import': {
        const r = b.getBoundingClientRect();
        openMenu(item(t('table.menu.paste', 'Paste a Table…'), 'imp-text', { icon: ic('<path d="M7 3.5h6v2H7z"/><path d="M13 4.5h2.5v13h-11v-13H7"/><path d="M7.5 10h5M7.5 13h3"/>') })
          + item(t('table.menu.open', 'Open a File…'), 'imp-file', { icon: ic('<path d="M2.5 5.5v10h13l2-7h-13l-2 7"/><path d="M2.5 5.5V4h5l1.5 1.5h6v3"/>') })
          + '<hr>' + item(t('table.menu.blank', 'New Empty Table'), 'imp-blank', { icon: ic('<path d="M3 4h14v12H3zM3 8h14M3 12h14M8 4v12"/>') }), r.left, r.bottom + 6);
        break;
      }
      case 'file': chooseFile(); break;
      case 'blank': replaceTable(T.create(4, 3, 'booktabs')); break;
      case 'import-text': {
        const v = ($('.tb-paste') as HTMLTextAreaElement).value;
        if (!v.trim()) { hint(t('table.hint.pasteFirst', 'Paste a table first')); return; }
        try { const r = T.importText(v); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); } catch (err: any) { TD.alert(t('table.importFailed', "Couldn't import"), String(err.message || err)); }
        break;
      }
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'b': case 'i': case 'u': case 'tt': toggle(cmd); break;
      case 'al': setAlign(b.dataset.v as HAlign); break;
      case 'fg': case 'bg': pickColor(b, cmd); break;
      case 'border': border(lastBorder, borderW); break;
      case 'borders': bordersMenu(b); break;
      case 'merge': mergeSel(); break;
      case 'split': change(() => T.split(M, range())); break;
      case 'num': toggleNum(); break;
    }
  });
  host.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.t === 'preset') change(() => { const s = M.stripe; T.applyPreset(M, t.value); if (t.value === 'striped' && s) M.stripe = s; });
    if (t.dataset.o === 'dpi') { out.dpi = +t.value; saveOut(); }
  });
  // the formula bar: typing edits the active cell; Enter keeps it, Esc puts it back
  let fxWas: string | null = null;
  host.addEventListener('focusin', (e) => { if ((e.target as Element).matches('.tb-fxin')) { finishEdit(); fxWas = JSON.stringify(M); } });
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
    if (fxWas !== JSON.stringify(M)) { undoStack.push(fxWas); redoStack.length = 0; paint(); }
    fxWas = null;
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
  function resizeCol(e: PointerEvent, c: number) {
    e.preventDefault(); e.stopPropagation();
    const th = (e.target as HTMLElement).closest('th') as HTMLElement, x0 = e.clientX, w0 = th.getBoundingClientRect().width;
    const before = JSON.stringify(M);
    const pad = 2 * 6; // the grid cell's own padding
    const move = (ev: PointerEvent) => {
      const w = Math.max(24, w0 + ev.clientX - x0) - pad;
      M.cols[c].w = Math.max(0.5, Math.round(w / PX * 10) / 10);
      paint();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (JSON.stringify(M) !== before) { undoStack.push(before); redoStack.length = 0; fresh = false; save(); panel(); preview(); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
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
    if (k === 'Tab') { go(step(act, 0, e.shiftKey ? -1 : 1), false); return; }
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
    if (!f) { const txt = e.dataTransfer?.getData('text/plain'); if (txt) { e.preventDefault(); try { const r = T.importText(txt); replaceTable(r.table, t('table.importedFormat', 'Imported ({format})', { format: r.format })); } catch (err: any) { hint(String(err.message || err)); } } return; }
    e.preventDefault(); e.stopPropagation();
    importFile(f);
  });
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target as Node)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (menu && e.key === 'Escape') { e.preventDefault(); closeMenu(); } }, true);
  addEventListener('resize', () => { if (shown) syncSel(); });
  host.addEventListener('scroll', () => closeMenu(), true);
  if (TD.math && TD.math.onChange) TD.math.onChange(() => { if (shown) { paint(); preview(); } });

  TD.math.onProgress(() => {
    if (!shown) return;
    TD.math.preview(() => {
      for (const cell of host!.querySelectorAll<HTMLElement>('.tg td[data-r][data-c]')) {
        const r = +cell.dataset.r!, c = +cell.dataset.c!;
        if (editing && editing.r === r && editing.c === c) continue;
        const inner = cell.querySelector('.tg-in');
        if (inner?.querySelector('.math-pending')) {
          inner.innerHTML = cellHtml(r, c, M.cells[r][c]);
          if (!inner.querySelector('.math-pending')) TD.math.trackView(previewFadeFinished(inner));
        }
      }
      if (host!.querySelector('.tb-prev .math-pending')) {
        previewNow();
        const preview = host!.querySelector('.tb-prev')!;
        if (!preview.querySelector('.math-pending')) TD.math.trackView(previewFadeFinished(preview));
      }
    });
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
    hint(t('table.hint.saved', 'Saved to the diagram'));
  }, true);
  TD.tableBlockEditor = { open: editBlock };
  // a language switch while the table is on screen redraws its frame (the model and selection stay)
  let firstLocale = true;
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (shown) { finishEdit(); closeMenu(); build(); requestAnimationFrame(() => syncSel()); } });

  TD.tableWs = {
    show() { shown = true; host.hidden = false; build(); requestAnimationFrame(() => { syncSel(); if (!fresh) focusGrid(); }); },
    hide() { finishEdit(); closeMenu(); closeBlock(true); shown = false; host.hidden = true; host.innerHTML = ''; },
    get inBlock() { return !!session; },
    renderProps() { panel(); },
    undo, redo, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0,
    // for the tests
    get model() { return M; }, set model(t: TableModel) { replaceTable(T.normalize(t)); },
    select: (a: [number, number], b?: [number, number]) => select(a, b), range, pasteData, importText: (s: string) => { const r = T.importText(s); replaceTable(r.table); return r; }, output,
  };
})();
