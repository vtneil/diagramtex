import { previewFadeFinished } from '../../platform/preview-fade';
import { themeField } from './mathlive-theme';
import { runtime as TD } from '../../runtime';
import { t, onLocale, locale } from '../../i18n';
import { blockCaption } from '../../i18n/shapes';
import { get } from 'svelte/store';
import type { EditorMemo } from '../../core/editor-session';
import { openPopover, type PopoverHandle } from '../kit/open-popover';
import { renderView, destroyView } from '../render-view.svelte';
import ExportPanel, { type ExportPanelModel } from '../ExportPanel.svelte';
import QuickList, { type QuickListModel } from '../QuickList.svelte';
import QuickFormula, { type QuickFormulaModel } from '../QuickFormula.svelte';
import QuickBlock, { type QuickBlockModel } from '../QuickBlock.svelte';
// Quick: one formula, typed as LaTeX or edited in MathLive, copied or downloaded as a picture (PNG or SVG).
// It is not a file: the formula and its options are kept in this browser, and the file that was open stays
// open underneath. The picture is the app's own export of a text box holding the formula, so it looks
// exactly like the same maths on the canvas, with the maths fonts embedded in the PNG.
// Beside the formula, Quick lists the blocks whose editor can be embedded (src/core/blocks.ts dock): picking one
// shows its editor in the pane, on a drawing kept in this browser with a short history per block, with the same
// output bar: Copy TikZ, Export (copy or download a PNG or SVG) and Add to Document / Diagram / Page / Whiteboard
// (named after the view the open file is in; it leaves Quick and adds the drawing there). A block keeps several
// drafts; each reopens as it was left (view, selection, undo history) and a new one is only made on request.
(function () {
  'use strict';
  const KEY = 'diagramtex.quick.opts';
  const SIZES = () => [['normalsize', t('ui.normal', 'Normal')], ['Large', t('quick.size.large', 'Large')], ['Huge', t('quick.size.huge', 'Huge')]];
  // PNG sharpness: image pixels per pixel of the formula at its size on the canvas. 8× (the default) looks crisp
  // when pasted into a chat or slide at any size people usually make it; the PNG also records its DPI, so
  // documents that read it (Word, Pages) still place it at the formula's true size.
  const SCALES = [4, 8, 16, 32];
  const appHost = document.getElementById('quick');
  if (!appHost) return;
  // A phone held upright shows the phone page (AppShell's #phoneWall) instead of the editor; the formula part of
  // Quick works there too, in #pwQuick. `host` is where Quick draws now: the app's pane, or that page.
  const phoneHost = document.getElementById('pwQuick');
  const smallScreen = () => document.documentElement.classList.contains('small-screen'); // set by src/platform/preflight.ts, as for #phoneWall's CSS
  let host: HTMLElement = appHost;
  const onPhone = () => host === phoneHost;

  const opts: Record<string, any> = { tex: 'E = mc^2', size: 'Large', scale: 8, transparent: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e: any) { /* storage blocked */ }
  if (opts.v !== 2) { opts.v = 2; opts.scale = 8; delete opts.dpi; } // earlier versions chose DPI, then defaulted to 4×
  if (!SCALES.includes(+opts.scale)) opts.scale = 8;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e: any) { /* storage blocked */ } };
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const canCopy = !!(navigator.clipboard && (navigator.clipboard as { write?: unknown }).write && window.ClipboardItem);

  // the formula as the export sees it: a text box holding display maths, one line
  const tex = () => opts.tex.replace(/\s*\n\s*/g, ' ').trim();
  const shape = () => ({ type: 'text', x: 0, y: 0, text: `$$${tex()}$$`, tw: 0, size: opts.size, font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 });

  // ---- what Quick shows: the formula, or a block's drawing ----
  const BKEY = 'diagramtex.quick.blocks', HISTORY = 24;
  // name: the user's, or none (the list shows when it was last changed); memo: how its editor was left, without the
  // undo history, which is kept only in memory (memos) for as long as the page is open
  type Drawing = { id: string; t: number; shape: any; name?: string; memo?: EditorMemo };
  const memos = new Map<string, EditorMemo>();
  const store: { view: string; items: Record<string, Drawing[]>; cur: Record<string, string> } = { view: 'formula', items: {}, cur: {} };
  try { Object.assign(store, JSON.parse(localStorage.getItem(BKEY) || '{}')); } catch (e: any) { /* storage blocked */ }
  const saveStore = () => { try { localStorage.setItem(BKEY, JSON.stringify(store)); } catch (e: any) { /* storage blocked or full */ } };
  const list = document.getElementById('quickList');
  // the blocks shown in Quick: those with an embeddable editor, in the toolbar's order
  const dockBlocks = () => [...TD.blocks.entries()].filter(([type]: any) => TD.blocks.dockable(type))
    .sort((a: any, b: any) => a[1].menu.order - b[1].menu.order) as [string, any][];
  const isBlockView = () => !onPhone() && store.view !== 'formula' && TD.blocks.dockable(store.view);
  function fresh(type: string): Drawing {
    const shape = { ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.app.defaults ? TD.app.defaults() : {}, type), type };
    return { id: Math.random().toString(36).slice(2, 10), t: Date.now(), shape };
  }
  // the drawing open for a block: its current one, or none when it has none (a new one is made only on request)
  function current(type: string): Drawing | null {
    const all = store.items[type] ||= [];
    const d = all.find((x) => x.id === store.cur[type]) || all[0] || null;
    if (d) store.cur[type] = d.id; else delete store.cur[type];
    return d;
  }
  // a drawing's name in the list: when it was last changed (with seconds where two would read the same)
  const when = (ms: number, seconds = false) => {
    const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
    return new Intl.DateTimeFormat(get(locale) === 'th' ? 'th-TH' : undefined, { ...(today ? {} : { day: 'numeric', month: 'short' }), hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(d);
  };
  function names(all: Drawing[]) {
    const short = all.map((d) => when(d.t));
    return all.map((d, i) => d.name || (short.indexOf(short[i]) !== short.lastIndexOf(short[i]) ? when(d.t, true) : short[i]));
  }
  const blockName = (type: string) => blockCaption(type, 'label', TD.blocks.get(type)?.menu.label || type);
  const FORMULA_IC = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 11h2.5l2.5 5.5 4-13h6"/><path d="M12.5 9l4 5M16.5 9l-4 5"/></svg>';
  // a draft's mark: outlined, filled for the one open
  const DOT = '<svg class="qk-dot" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3"/></svg>';

  let renamingDraft: string | null = null; // the draft whose name is a field (QuickList)
  function renderList() {
    if (!list) return;
    const top = list.scrollTop;
    const blocks = dockBlocks();
    renderView(list, QuickList, {
      formula: { label: t('quick.formula', 'Formula'), svg: FORMULA_IC, active: store.view === 'formula' },
      head: blocks.length ? t('quick.blocks', 'Blocks') : null,
      // a block row is a folder of its drafts: the open block's row heads them, unfilled; the open draft is the filled row
      blocks: blocks.map(([type, def]) => {
        const on = store.view === type, name = blockCaption(type, 'label', def.menu.label), all = store.items[type] || [], cur = on ? current(type)?.id : undefined, nm = on ? names(all) : [];
        return { type, name, title: blockCaption(type, 'title', def.menu.title), svg: def.menu.icon, open: on, count: all.length, countLabel: t('quick.draftCount', '{n} drafts', { n: all.length }),
          drafts: on ? { newTitle: t('quick.newTip', 'Start a new {block}; the one open now stays in the list', { block: name }), newLabel: t('quick.new', 'New'),
            rows: all.map((d, i) => ({ id: d.id, name: nm[i], value: d.name || '', active: d.id === cur, title: t('quick.changed', 'Changed {time}', { time: when(d.t, true) }) })) } : undefined };
      }),
      icons: { dot: DOT }, deleteLabel: t('quick.delete', 'Delete this drawing'), nameLabel: t('quick.draftName', 'Draft name'),
      renaming: renamingDraft,
      rename: (id, v) => { const d = (store.items[store.view] || []).find((x) => x.id === id); if (d) { if (v) d.name = v; else delete d.name; saveStore(); } },
      renameEnd: (id) => { renamingDraft = null; renderList(); list?.querySelector<HTMLElement>(`li[data-hist="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); },
    } satisfies QuickListModel);
    list.scrollTop = top;
  }
  // the block view: the embedded editor, then the output bar
  let docked: string | null = null;
  // the output bar rides in the editor's top bar while it is embedded, so it leaves with it
  // closing it hands back how it was left (keep, below); code being typed is read first
  function undock() {
    closeExport();
    host!.querySelector<HTMLElement>('.qk-dock :focus')?.blur();
    host!.querySelectorAll('.qk-dock .qk-bar, .qk-dock .qk-push').forEach((x) => x.remove());
    if (docked) { const type = docked; docked = null; TD.blocks.undock(type); }
  }
  // the block view (src/ui/QuickBlock.svelte): the open draft's editor docked, or a way to start one
  let blockState: Pick<QuickBlockModel, 'none' | 'unavailable'> = {};
  function blockModel(): QuickBlockModel {
    const [place, placeTip] = placeCaption();
    return { ...blockState, copied, copiedLabel: t('ui.copied', 'Copied'),
      bar: { place, placeTip, exportLabel: t('ui.export', 'Export'), exportTip: t('quick.exportTip', 'Copy or download the drawing as a picture (PNG or SVG)'),
        copyTikz: t('quick.copyTikz', 'Copy TikZ'), copyTikzTip: t('quick.copyTikzTip', 'Copy the drawing as TikZ code') } };
  }
  const renderBlock = () => renderView(host, QuickBlock, blockModel());
  function buildBlock() {
    const type = store.view, d = current(type);
    host!.classList.add('qk-blocks');
    destroyView(host); // the bar may have moved into the editor that was docked: start afresh
    if (!d) { // no drafts: nothing is made until asked for
      const name = blockName(type);
      blockState = { none: { icon: TD.blocks.get(type)?.menu.icon || '', text: t('quick.noDrafts', 'No {block} drafts yet', { block: name }), newLabel: t('quick.ctxNew', 'New {block}', { block: name }) } };
      renderBlock();
      saveStore();
      return;
    }
    blockState = {};
    renderBlock();
    const dock = host!.querySelector('.qk-dock') as HTMLElement;
    docked = type;
    // the full memo while the page is open; after a reload, the stored one (no undo history)
    const keep = (memo: EditorMemo) => { memos.set(d.id, memo); d.memo = { ...memo, undo: [], redo: [] }; saveStore(); };
    const ok = TD.blocks.dock(d.shape, dock, () => { d.t = Date.now(); saveStore(); renderList(); }, memos.get(d.id) || d.memo, keep);
    const head = ok && dock.querySelector('.modal-head'), bar = host!.querySelector('.qk-bar');
    // on the right of the editor's own tools: one bar, not two. A stretching gap before it pushes it right while it
    // fits; when it wraps, the gap stays behind on the first line and the bar starts at the left
    if (head && bar) head.append(Object.assign(document.createElement('span'), { className: 'qk-push' }), bar);
    if (!ok) { docked = null; blockState = { unavailable: t('quick.blockUnavailable', 'This block can’t be edited here right now') }; renderBlock(); }
    saveStore();
  }
  // Add to …: named after the view the open file was left in
  function placeCaption() {
    const m = TD.app.cmd.fileMode ? TD.app.cmd.fileMode() : 'diagram';
    if (m === 'document') return [t('quick.addToDocument', 'Add to Document'), t('quick.addToDocumentTip', 'Leave Quick and add this drawing to the document, as a new diagram at the cursor')];
    const tip = t('quick.placeTip', 'Leave Quick and add this drawing to the open file, in the middle of the view');
    if (m === 'page') return [t('quick.addToPage', 'Add to Page'), tip];
    if (m === 'board') return [t('quick.addToBoard', 'Add to Whiteboard'), tip];
    return [t('quick.addToDiagram', 'Add to Diagram'), tip];
  }
  // ---- the block view's Export menu: the app's export popover, for one drawing ----
  let expPop: PopoverHandle | null = null;
  let expBtn: HTMLElement | null = null;
  const expFmt = () => (opts.fmt === 'svg' ? 'svg' : 'png');
  function renderExport() {
    if (!expPop || expPop.closed) return;
    const fmt = expFmt(), F = fmt.toUpperCase(), btn = expBtn;
    // the copy runs within the click (Safari allows it only then); the menu closes and its button says Copied
    const run = (q: string) => () => { closeExport(true); act(q, q.startsWith('dl') ? null : btn); };
    renderView(expPop.body, ExportPanel, {
      head: t('quick.exportDrawing', 'Export drawing'), formatLabel: t('quick.format', 'Format'),
      formats: [{ value: 'png', label: 'PNG' }, { value: 'svg', label: 'SVG' }], format: fmt,
      onformat: (v) => { opts.fmt = v; save(); renderExport(); },
      rows: fmt === 'png' ? [
        { kind: 'select', id: 'qkScale', label: t('quick.sharpness', 'Sharpness'), title: t('quick.sharpBlockTip', 'PNG sharpness: pixels per pixel of the drawing'),
          value: String(opts.scale), options: SCALES.map((x) => ({ value: String(x), label: x + '×' })), onchange: (v) => { opts.scale = +v; save(); } },
        { kind: 'check', label: t('exp.transparent', 'Transparent background'), checked: !!opts.transparent, onchange: (on) => { opts.transparent = on; save(); } },
      ] : [{ kind: 'meta', text: t('exp.vector', 'Vector, scales to any size') }],
      actions: [
        ...(canCopy ? [{ label: t('quick.copyFmt', 'Copy {fmt}', { fmt: F }), primary: true, attrs: { 'data-q': fmt }, onclick: run(fmt),
          title: fmt === 'png' ? t('quick.copyBlockPngTip', 'Copy the drawing as a PNG picture') : t('quick.copyBlockSvgTip', 'Copy the drawing as SVG') }] : []),
        { label: t('quick.download', 'Download'), icon: 'download', attrs: { 'data-q': 'dl-' + fmt }, onclick: run('dl-' + fmt),
          title: fmt === 'png' ? t('quick.dlPng', 'Download as PNG') : t('quick.dlSvg', 'Download as SVG') },
      ],
    } satisfies ExportPanelModel);
  }
  // the kit's popover below the button (on the right of the window, so right edges lined up, growing left)
  function openExport(btn: HTMLElement) {
    if (expPop && !expPop.closed) { closeExport(); return; }
    if (!TD.app.outputAllowed()) return;
    expBtn = btn;
    const h = openPopover(btn, {
      width: 240, class: 'exp-pop qk-exp-pop', label: t('quick.exportDrawing', 'Export drawing'),
      // the panel goes once the popover has faded out
      onclose: () => { btn.setAttribute('aria-expanded', 'false'); setTimeout(() => destroyView(h.body), 400); },
    });
    expPop = h;
    renderExport();
    btn.setAttribute('aria-expanded', 'true');
    h.body.querySelector<HTMLElement>('[data-q]')?.focus({ preventScroll: true });
  }
  function closeExport(focus = false) {
    if (!expPop || expPop.closed) return;
    expPop.close();
    if (focus) expBtn?.focus({ preventScroll: true });
  }
  function show(view: string) {
    undock();
    store.view = view === 'formula' || TD.blocks.dockable(view) ? view : 'formula';
    saveStore();
    renderList();
    if (isBlockView()) buildBlock(); else { host!.classList.remove('qk-blocks'); build(); }
  }

  // the formula view (src/ui/QuickFormula.svelte); build() also makes the field and draws the preview
  function formulaModel(): QuickFormulaModel {
    return {
      phone: onPhone(),
      formulaLabel: t('quick.formula', 'Formula'), inputLabel: t('quick.input', 'Input'), input: TD.input ? TD.input.mode : 'latex',
      inputs: Object.entries<any>(TD.input ? TD.input.MODES : { latex: { name: 'LaTeX' } }).map(([value, v]) => ({ value, label: v.name })),
      sizeLabel: t('ui.size', 'Size'), sizes: SIZES().map(([value, label]) => ({ value, label })), size: opts.size,
      sharpLabel: t('quick.sharp', 'PNG sharpness'), sharpTip: t('quick.sharpTip', 'PNG sharpness: pixels per pixel of the formula'), scales: SCALES, scale: +opts.scale,
      transparentLabel: t('quick.transparent', 'Transparent'), transparent: !!opts.transparent,
      canCopy, copied, copiedLabel: t('ui.copied', 'Copied'),
      labels: {
        copyPng: t('table.copyPng', 'Copy PNG'), copyPngTip: t('quick.copyPngTip', 'Copy the formula as a PNG picture ({key})', { key: (mac ? '⌘' : 'Ctrl+') + 'Enter' }),
        copySvg: t('quick.copySvg', 'Copy SVG'), copySvgTip: t('quick.copySvgTip', 'Copy the formula as SVG'),
        dlPngTip: t('quick.dlPng', 'Download as PNG'), dlSvgTip: t('quick.dlSvg', 'Download as SVG'),
        foot: t('quick.foot', 'Paste the PNG into slides, documents or chats. The SVG keeps the maths as text, with its fonts loaded from the web.'), copyLatex: t('table.copyLatex', 'Copy LaTeX'),
      },
    };
  }
  const renderFormula = () => renderView(host, QuickFormula, formulaModel());
  function build() {
    destroyView(host); // a new field (the input mode may have changed)
    renderFormula();
    editor();
    preview();
  }

  // ---- the input: a LaTeX field, or one MathLive field ----
  function editor() {
    const box = host!.querySelector('.qk-edit');
    if (TD.input && TD.input.mode === 'mathlive' && !onPhone()) { // the phone page types LaTeX
      box!.innerHTML = `<div class="qk-loading">${esc(t('quick.loadingMathlive', 'Loading MathLive…'))}</div>`;
      TD.input.load().then(() => {
        if (!box!.isConnected) return;
        const mf = new window.MathfieldElement();
        themeField(mf); // the app's menu and menu button
        mf.id = 'quickTex';
        mf.mathVirtualKeyboardPolicy = 'manual';
        mf.smartFence = true;
        mf.value = opts.tex;
        mf.addEventListener('input', () => { opts.tex = mf.value; changed(); });
        box!.replaceChildren(mf);
        mf.focus();
      }, () => { box!.innerHTML = ''; TD.input.set('latex'); }); // offline before it was cached
      return;
    }
    box!.innerHTML = `<textarea id="quickTex" class="qk-ta" data-tx="math" rows="3" spellcheck="false" autocomplete="off" placeholder="\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}">${esc(opts.tex)}</textarea>`;
    const ta = box!.firstElementChild;
    const fit = () => { (ta! as HTMLElement).style.height = 'auto'; (ta! as HTMLElement).style.height = Math.min(ta!.scrollHeight + 2, 240) + 'px'; };
    ta!.addEventListener('input', () => { opts.tex = (ta! as HTMLInputElement).value; fit(); changed(); });
    if (onPhone()) { (ta as HTMLElement).setAttribute('aria-label', t('quick.formula', 'Formula')); requestAnimationFrame(fit); return; } // no keyboard popping up as the page opens
    requestAnimationFrame(() => { fit(); (ta! as HTMLElement).focus(); (ta! as HTMLTextAreaElement).setSelectionRange((ta! as HTMLInputElement).value.length, (ta! as HTMLInputElement).value.length); });
  }

  let timer: any = null;
  function changed() { save(); clearTimeout(timer); timer = setTimeout(preview, 60); }
  // the preview: the formula at twice the chosen size, on white (or a checkerboard when transparent)
  let good = false;
  function preview(): void {
    if (!TD.math.previewing) return TD.math.preview(preview);
    const p = host!.querySelector('.qk-prev'), msg = host!.querySelector('.qk-msg');
    if (!p) return;
    const src = tex();
    (p as HTMLElement).style.fontSize = TD.sizePx(opts.size) * 2 + 'px';
    if (!src) { p.classList.remove('math-pending'); p.innerHTML = `<span class="qk-empty">${esc(t('quick.empty', 'Type a formula above'))}</span>`; good = false; note(''); return; }
    try {
      const html = TD.math.render(src, { display: true, throwOnError: true });
      p.innerHTML = TD.math.cleanPreview(TD.math.liveMarkup(html)); p.classList.toggle('math-pending', TD.math.isPending(html));
      if (!TD.math.isPending(html)) TD.math.trackView(previewFadeFinished(p));
      p.classList.remove('stale'); good = true; note('');
    } catch (e: any) {
      p.classList.remove('math-pending'); p.classList.add('stale'); good = false; // the last good picture stays, faded, while the error shows
      note(String(e.message || e).replace(/^KaTeX parse error: /, ''), true);
    }
    void msg;
  }
  function note(text: any, err?: any) {
    const m = host!.querySelector('.qk-msg');
    if (!m) return;
    m.textContent = text; m.classList.toggle('err', !!err);
  }

  // ---- output ----
  const blockShape = () => (isBlockView() ? current(store.view)?.shape || null : null);
  const png = () => { const b = blockShape(); return b ? TD.app.pngOf([b], opts.scale * 2.54 * TD.PX_PER_CM, opts.transparent, true) : TD.app.pngOf([shape()], opts.scale * 2.54 * TD.PX_PER_CM, opts.transparent); };
  const svg = () => TD.app.svgOf([blockShape() || shape()]);
  // a block's file is named after it, as the toolbar names it in English (circuit.png, k-map.svg)
  const fileName = () => (isBlockView() ? String(TD.blocks.get(store.view)?.menu.label || store.view).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || store.view : 'formula');
  // a button says Copied for a moment, holding its width so the shorter word doesn't pull the bar along
  let copied: string | null = null, copiedTimer = 0;
  const redraw = () => { if (isBlockView()) { if (host.querySelector('.qk-blk')) renderBlock(); } else if (host.querySelector('.qk')) renderFormula(); };
  function flash(btn: HTMLElement | null) {
    if (!btn) return;
    if (!copied) btn.style.minWidth = btn.offsetWidth + 'px';
    copied = btn.dataset.q ?? 'qexp';
    redraw();
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copied = null; btn.style.minWidth = ''; redraw(); }, 1200);
  }
  async function act(what: any, btn: any) {
    if (!TD.app.outputAllowed()) return;
    if (isBlockView()) host!.querySelector<HTMLElement>('.qk-dock textarea:focus')?.blur(); // code being typed is read first
    if (isBlockView() && !blockShape()) return;
    if (!isBlockView() && (!tex() || !good)) { note(tex() ? t('quick.fixFirst', 'Fix the formula first') : t('quick.typeFirst', 'Type a formula first'), true); return; }
    try {
      if (what === 'png') {
        // the item is made at once, with the picture still to come: Safari allows a copy only during the click
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
        flash(btn);
      } else if (what === 'svg') {
        const s = svg(), item: Record<string, any> = { 'text/plain': new Blob([s], { type: 'text/plain' }) };
        if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = new Blob([s], { type: 'image/svg+xml' });
        await navigator.clipboard.write([new ClipboardItem(item)]);
        flash(btn);
      } else if (what === 'tex') {
        await navigator.clipboard.writeText(tex());
        flash(btn);
      } else if (what === 'tikz') {
        await navigator.clipboard.writeText(TD.toTikz([blockShape()]));
        flash(btn);
      } else if (what === 'dl-png') TD.app.downloadBlob(fileName() + '.png', await png());
      else if (what === 'dl-svg') TD.app.downloadBlob(fileName() + '.svg', new Blob([svg()], { type: 'image/svg+xml' }));
    } catch (e: any) { const why = String(e.message || e).replace('lower the DPI', 'choose a lower sharpness');
      note(what.startsWith('dl') ? t('quick.fileFailed', "Couldn't make the file ({error})", { error: why }) : t('quick.copyFailed', "Couldn't copy ({error})", { error: why }), true); }
  }

  const hosts = phoneHost ? [appHost, phoneHost] : [appHost];
  for (const h of hosts) h.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('button');
    if (!b) return;
    if (b.dataset.input) { TD.input.set(b.dataset.input); return; } // rebuilt by the listener below
    if (b.dataset.size) { opts.size = b.dataset.size; save(); renderFormula(); preview(); return; }
    if (b.dataset.qexp !== undefined) { openExport(b); return; }
    if (b.dataset.newDraft !== undefined && isBlockView()) { addDrawing(store.view); return; }
    if (b.dataset.q) act(b.dataset.q, b);
    const d = isBlockView() ? current(store.view) : null;
    if (b.dataset.place !== undefined && d) placeDrawing(store.view, d.id);
  });
  // the sidebar list: Formula, the blocks, and the open block's drawings
  async function deleteDrawing(type: string, id: string) {
    const all = store.items[type] || [];
    if (!(await TD.confirm(t('quick.deleteTitle', 'Delete this drawing?'), t('quick.deleteBody', 'It is kept only in this browser, so it can’t be brought back.'), { ok: t('quick.deleteOk', 'Delete'), danger: true }))) return;
    const i = all.findIndex((x) => x.id === id);
    if (i < 0) return;
    const wasOpen = all[i].id === store.cur[type];
    if (wasOpen) undock();
    all.splice(i, 1);
    memos.delete(id);
    if (wasOpen) { store.cur[type] = (all[Math.min(i, all.length - 1)] || {} as Drawing).id; show(type); } else { saveStore(); renderList(); }
  }
  // a new drawing at the top of the block's list, empty or a copy of one. Past HISTORY, the oldest unnamed one that
  // isn't open goes; a named draft is only ever deleted by the user
  function addDrawing(type: string, from?: Drawing) {
    undock();
    const all = store.items[type] ||= [];
    const d: Drawing = from ? { id: Math.random().toString(36).slice(2, 10), t: Date.now(), shape: JSON.parse(JSON.stringify(from.shape)), ...(from.name ? { name: t('quick.copyName', '{name} copy', { name: from.name }) } : {}) } : fresh(type);
    all.unshift(d);
    for (let i = all.length - 1; all.length > HISTORY && i > 0; i--) if (!all[i].name) { memos.delete(all[i].id); all.splice(i, 1); }
    store.cur[type] = d.id;
    show(type);
  }
  function openDrawing(type: string, id: string) { if (id !== store.cur[type]) { undock(); store.cur[type] = id; show(type); } }
  // rename in place, in the row: Enter or leaving the field keeps it, Esc puts it back; empty goes back to the time
  function renameDrawing(type: string, id: string) {
    if (!(store.items[type] || []).some((x) => x.id === id) || !list?.querySelector(`li[data-hist="${CSS.escape(id)}"]`)) return;
    renamingDraft = id;
    renderList();
  }
  function placeDrawing(type: string, id: string) {
    if (id === store.cur[type]) host!.querySelector<HTMLElement>('.qk-dock textarea:focus')?.blur(); // code being typed is read first
    const d = (store.items[type] || []).find((x) => x.id === id);
    if (d) TD.app.cmd.placeOnCanvas([d.shape]);
  }
  async function onList(e: Event) {
    const el = e.target as Element;
    if (el.closest('.list-row-ed')) return; // a click in a draft's name field stays there
    const del = el.closest<HTMLElement>('[data-del]');
    if (del) { e.stopPropagation(); await deleteDrawing(store.view, del.dataset.del!); return; }
    const row = el.closest<HTMLElement>('li');
    if (!row) return;
    if (row.dataset.view) { if (row.dataset.view !== store.view) show(row.dataset.view); return; }
    const type = store.view;
    if (row.dataset.new) { addDrawing(type); return; }
    if (row.dataset.hist) openDrawing(type, row.dataset.hist);
  }
  list?.addEventListener('click', onList);
  // right-click: the row's own actions (the file list's menu is for files, not these)
  list?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = (e.target as Element).closest<HTMLElement>('li[tabindex]');
    if (!row || !TD.app.cmd.openMenu) return;
    const menu = (entries: any[], pick: (act: string) => void) => TD.app.cmd.openMenu(entries, e.clientX, e.clientY, pick);
    const type = store.view;
    if (row.dataset.view) {
      const v = row.dataset.view, def = v === 'formula' ? null : TD.blocks.get(v);
      const name = v === 'formula' ? t('quick.formula', 'Formula') : blockCaption(v, 'label', def?.menu?.label || v);
      menu([
        { label: t('quick.ctxOpen', 'Open'), act: 'open', ic: 'open', dis: v === store.view },
        ...(v !== 'formula' ? [{ label: t('quick.ctxNew', 'New {block}', { block: name }), act: 'new', ic: 'newdoc' }] : []),
      ], (a) => { if (a === 'open') show(v); if (a === 'new') addDrawing(v); });
      return;
    }
    if (row.dataset.new) { menu([{ label: t('quick.new', 'New'), act: 'new', ic: 'newdoc' }], () => addDrawing(type)); return; }
    const id = row.dataset.hist;
    if (!id) return;
    const d = (store.items[type] || []).find((x) => x.id === id);
    if (!d) return;
    menu([
      { label: t('quick.ctxOpen', 'Open'), act: 'open', ic: 'open', dis: id === store.cur[type] },
      { label: t('quick.ctxRename', 'Rename…'), act: 'rename', ic: 'rename' },
      { label: placeCaption()[0], act: 'place', ic: 'paste', sep: true },
      { label: t('quick.ctxDup', 'Duplicate'), act: 'dup', ic: 'dup' },
      { label: t('quick.ctxDelete', 'Delete'), act: 'del', ic: 'del', danger: true, sep: true },
    ], (a) => {
      if (a === 'open') openDrawing(type, id);
      else if (a === 'rename') renameDrawing(type, id);
      else if (a === 'place') placeDrawing(type, id);
      else if (a === 'dup') addDrawing(type, d);
      else if (a === 'del') void deleteDrawing(type, id);
    });
  });
  list?.addEventListener('keydown', (e) => {
    const row = e.target as HTMLElement;
    if (!row.matches('li[tabindex]')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onList(e); }
    if (e.key === 'F2' && row.dataset.hist) { e.preventDefault(); renameDrawing(store.view, row.dataset.hist); }
  });
  // double-click a draft to rename it (the first click has opened it, and the list was drawn again under the pointer)
  list?.addEventListener('dblclick', (e) => {
    const row = (document.elementFromPoint(e.clientX, e.clientY) || (e.target as Element))?.closest<HTMLElement>('li[data-hist]');
    if (row && !(e.target as Element).closest('[data-del], .list-row-ed')) renameDrawing(store.view, row.dataset.hist!);
  });
  for (const h of hosts) h.addEventListener('change', (e) => {
    if ((e.target! as Element).matches('.qk-dpi')) { opts.scale = +(e.target! as HTMLInputElement).value; save(); }
    if ((e.target! as Element).matches('[data-clear]')) { opts.transparent = (e.target! as HTMLInputElement).checked; save(); renderFormula(); }
  });
  for (const h of hosts) h.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); act(canCopy ? 'png' : 'dl-png', canCopy ? host.querySelector(isBlockView() ? '[data-qexp]' : '[data-q="png"]') : null); }
  });

  let shown = false;
  if (TD.input) TD.input.onChange(() => { if (shown && !onPhone() && !isBlockView()) build(); });
  let firstLocale = true;
  // a block's editor follows the language itself: only its output bar and the list are rebuilt
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (onPhone()) { build(); return; } if (!shown) return; closeExport(); renderList(); if (isBlockView()) { if (docked) renderBlock(); else buildBlock(); } else build(); });
  const formulaShown = () => onPhone() || (shown && !isBlockView());
  TD.math.onChange(() => { if (formulaShown()) preview(); });
  TD.math.onProgress(() => { if (formulaShown()) preview(); });

  TD.quick = {
    show() { shown = true; appHost.hidden = false; if (!onPhone()) show(store.view); },
    hide() { shown = false; closeExport(); if (!onPhone()) { undock(); destroyView(appHost); appHost.classList.remove('qk-blocks'); } appHost.hidden = true; if (list) destroyView(list); },
  };
  // follow the phone page as it comes and goes (turning the phone, resizing a window)
  function placeHost() {
    const want: HTMLElement = phoneHost && smallScreen() ? phoneHost : appHost!;
    if (want === host) return;
    if (host === appHost) { undock(); destroyView(appHost); appHost.classList.remove('qk-blocks'); } else destroyView(host);
    host = want;
    if (onPhone()) build(); else if (shown) show(store.view);
  }
  window.addEventListener('td-smallscreen', placeHost);
  placeHost();
})();
