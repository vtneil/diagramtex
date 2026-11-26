import { canScale, objectScale } from '../domain/scale';
import { snapTranslation, createSnapIndex, type Guide, type SnapLine } from '../core/smart-snap';
import { createCanvasMagnifier } from '../ui/canvas-magnifier';
import { GRID_STYLES, snapCanvasGrid } from '../ui/canvas-grid';
import { applyWelcomeEdits } from './examples/welcome-edits';
import { dashName, tipName, shaftName, placeName, anchorName, optionName } from '../i18n/names';
import { exampleDiagramBlocks } from './example-diagrams';
import { previewFadeFinished } from '../platform/preview-fade';
import { updateSvg } from '../platform/update-svg';
import { SvgLabelResources } from '../platform/svg-label-resources';
import { labelFontsReady } from '../domain/label-image';
import { wheelZoomFactor } from '../ui/wheel-zoom';
import { captions } from '../i18n/messages';
import { t as uiText, caption, message, onLocale } from '../i18n';
import { typeName } from '../i18n/shapes';
import { destroyView } from '../ui/render-view.svelte';
import type { PositionedShape } from '../core/blocks';
import type { Shape } from '../core/contracts';
interface SavedEntry { id: string; name: string; kind: import('../core/contracts').FileKind; updated: number; created?: number }
interface DeletedEntry extends SavedEntry { deleted: number; folder?: string; batch?: string }
import type { EditorState } from '../core/state';
import { createEditorState, SNAP_MODES, type SnapMode } from '../core/state';
import { downloadBlob, downloadImage, createExportWriter } from '../platform/download';
import { readPicture, svgFilePdf, texBundle, texFiles, type Picture } from '../platform/images';
import { texEngine, type TexSupport } from '../platform/tex-engine';
import { keptPreview } from './kept-preview';
import { docFont, hasThai, type TexEngine } from '../core/doc-fonts';
import { svgVectorPdf } from '../platform/svgpdf';
import { createBrowserStore } from '../platform/browser-store';
import { createAutosave } from '../core/autosave';
import { mergeFile } from '../core/merge';
import type { HistoryStep } from '../core/contracts';
import { arrayCopies, createRecovery, type CopyStore, RECOVERY_DEFAULTS, RECOVERY_EVERY, RECOVERY_KEEP, RECOVERY_KEY, RECOVERY_QUICK, type RecoveryCopy, type RecoverySettings } from '../core/recovery';
import { createDocumentFactory } from '../core/document';
import { keysFrom, link, markOverrides, nameProblem, reset as resetStyle, styleable, stylesOf, sync as syncStyles, unlink, type NamedStyle } from '../core/named-styles';
import { mergeMacros, parseMacros } from '../core/doc-macros';
import { conformShape } from '../core/conform';
import { createDocumentHistory, stamp } from '../core/history';
import MainProperties from '../ui/MainProperties.svelte';
import type { Model as StyleModel } from '../ui/StyleField.svelte';
import type { Model as PageModel } from '../ui/PageProperties.svelte';
import { row, section } from '../ui/forms';
import type { FormRow, FormSection } from '../ui/forms';
import { mountFrame } from '../ui/mount-frame';
import { keyLabel } from '../ui/kit/keys';
import { iconSvg, setIcon, type IconName } from '../ui/kit/icons';
import { unmount } from 'svelte';
import { runtime as TD } from '../runtime';
import { emptyStateHtml } from '../ui/kit/markup';
import { openPopover, type PopoverHandle } from '../ui/kit/open-popover';
import { openTextPopup, type TextPopupHandle } from '../ui/kit/text-popup.svelte';
import { closeFlyouts, flyoutOpen, holdFlyout, releaseFlyout, onFlyoutClose } from '../ui/kit/Flyout.svelte';
import { openContextMenu, closeContextMenu, contextMenuOpen } from '../ui/kit/context-menu';
import { tidy as tidyMenu, type MenuEntry, type MenuItemSpec } from '../ui/kit/menu';
import { fitToolbar } from '../ui/kit/toolbar';
import { renderView as renderSvelteView } from '../ui/render-view.svelte';
import BinDialog, { type BinDialogModel } from '../ui/BinDialog.svelte';
import RecoveryDialog, { type RecoveryDialogModel } from '../ui/RecoveryDialog.svelte';
import ToolPanel, { type ToolPanelModel, type ToolSection, type ToolSymbol, type ToolTileSpec } from '../ui/ToolPanel.svelte';
import ExportPanel, { type ExportPanelModel, type ExportRow, type ExportAction } from '../ui/ExportPanel.svelte';
import LintList, { type LintItem, type LintListModel } from '../ui/LintList.svelte';
import ImportReport, { type ImportReportModel } from '../ui/ImportReport.svelte';
import DiagramGallery, { type DiagramGalleryModel } from '../ui/DiagramGallery.svelte';
import { openModal as showModalEl, closeModal as hideModalEl, closeDialogElement, fadeOutDialog } from '../ui/kit/modal';
import FileList, { type FileRow, type FileListModel } from '../ui/FileList.svelte';
import LayerList, { type LayerRow, type LayerListModel } from '../ui/LayerList.svelte';
import { escapeHtml } from '../core/html';
import { bracketMarks, bracketHtml } from '../ui/tex-brackets';
// DiagramTeX editor: state, interaction, history, properties panel, storage and export.
(function () {
  const { TYPES, util } = TD;
  // the version link's tip follows the interface language, as the rest of the shell does (newer: a release to reload into)
  let newerVersion = '';
  // a release is X.Y.Z; any other build (the Preview) is versioned by its commit's short hash, stamped in by CI
  const release = /^\d+\.\d+\.\d+$/.test(TD.VERSION);
  const shown = (ver: string) => (/^\d+\.\d+\.\d+$/.test(ver) ? 'v' : '') + ver;
  const versionTip = () => {
    const v = document.getElementById('appVer');
    if (v) v.title = newerVersion ? uiText('app.version.update', 'DiagramTeX {version} is out (this is {current}): click to reload', { version: newerVersion, current: TD.VERSION })
      : uiText('app.version.title', 'DiagramTeX {version}: this release on GitHub', { version: TD.VERSION });
  };
  { const v = document.getElementById('appVer'); if (v) { v.textContent = shown(TD.VERSION); versionTip(); (v as HTMLAnchorElement).href = release ? `https://github.com/vtneil/diagramtex/releases/tag/v${TD.VERSION}` : `https://github.com/vtneil/diagramtex/commit/${TD.VERSION}`; } }
  onLocale(versionTip);
  // a newer release on this host (dist/version.json, written by the build): a marker dot by the version, and
  // a click reloads into it. Asked once per load, past every cache; no answer (dev, offline) changes nothing.
  // A commit build has no order to compare: any other version there is a newer deploy.
  {
    const semverNewer = (a: any, b: any) => { const p = (x: any) => String(x).split('.').map((n) => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
    const newer = (a: any, b: any) => (release ? semverNewer(a, b) : String(a) !== String(b));
    fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const v = document.getElementById('appVer'), n = j && j.version;
      if (!v || !n || !newer(n, TD.VERSION)) return;
      v.classList.add('update');
      newerVersion = n; versionTip();
      v.removeAttribute('target'); (v as HTMLAnchorElement).href = location.href;
      v.addEventListener('click', (e) => { e.preventDefault(); location.reload(); });
    }).catch(() => {});
  }
  const { r2, esc, dist } = util;
  const $ = (s: any) => document.querySelector(s);
  const svg = $('#canvas'), content = $('#content'), overlay = $('#overlay');
  const magnifier = createCanvasMagnifier($('#stage'), svg, () => state.view);
  let smartLines: SnapLine[] = [];
  let pointSnapCache: any = null;
  let guideMode: 'show' | 'locked' | 'off' = 'show';
  const GRP_OUT = 7; // a group's frame (and its resize handles): this many screen px outside its members
  let selectedGuide: string | null = null;
  let guidePress: any = null;
  const activeGuides = () => guideMode === 'off' ? [] : home().guides || [];
  const PX = TD.PX_PER_CM;
  const fx = (n: any) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).replace('-', '−');

  const isDrawTool = (t: any) => !['select', 'hand', 'text', 'math', 'image', 'magnify', 'bucket'].includes(t);
  const toolType = (t: any) => (({ arc3: 'arc', arrow: 'line', darrow: 'line', elbow: 'line', curvedconn: 'line', curvearrow: 'curve', blob: 'poly', smoothcurve: 'poly', curvpen: 'poly', pencil: 'poly', math: 'text' }) as Record<string, any>)[t] || t.split(':')[0];
  const TOOL_KEYS: Record<string, any> = { v: 'select', h: 'hand', z: 'magnify', k: 'bucket', l: 'line', a: 'arrow', c: 'curve', p: 'poly', o: 'arc', s: 'spring', r: 'rect', e: 'ellipse', b: 'ball', d: 'dot', t: 'text', m: 'math', n: 'pencil', i: 'image' };
  // How the Rectangle and Ellipse tools draw, chosen from the menu on their buttons and remembered: rows are
  // [mode, label, hint, icon (20 × 20)]. The first is the default. 'three' and 'circle3' are drawn click by
  // click (pointsKind); the rest by one drag (the shape type's drag, given the mode).
  const DOT = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.6" class="f"/>`;
  const DRAW_MODES: Record<string, any[][]> = {
    rect: [
      ['corner', message('mode.corner', 'Corner to corner'), message('mode.rect.corner.hint', 'Drag from one corner to the other, or click both (Shift keeps it square)'), `<rect x="3" y="5" width="14" height="10"/>${DOT(3, 15)}${DOT(17, 5)}`],
      ['center', message('mode.center', 'From the centre'), message('mode.rect.center.hint', 'Drag from the centre out to a corner, or click both (Shift keeps it square)'), `<rect x="3" y="5" width="14" height="10"/>${DOT(10, 10)}${DOT(17, 5)}`],
      ['three', message('mode.three', 'Three points'), message('mode.rect.three.hint', 'Click a corner, the next corner, then how far the other side goes: a turned rectangle'), `<path d="M4.25 9.75L9.75 4.25 15.75 10.25 10.25 15.75z"/>${DOT(4.25, 9.75)}${DOT(9.75, 4.25)}${DOT(15.75, 10.25)}`],
    ],
    ellipse: [
      ['corner', message('mode.corner', 'Corner to corner'), message('mode.ellipse.corner.hint', 'Drag across the box round the ellipse, or click two opposite corners (Shift makes a circle)'), `<ellipse cx="10" cy="10" rx="7" ry="5"/>${DOT(3, 15)}${DOT(17, 5)}`],
      ['center', message('mode.center', 'From the centre'), message('mode.ellipse.center.hint', 'Drag from the centre out to a corner of its box, or click both (Shift makes a circle)'), `<ellipse cx="10" cy="10" rx="7" ry="5"/>${DOT(10, 10)}${DOT(17, 5)}`],
      ['circle', message('mode.circle', 'Circle from the centre'), message('mode.circle.hint', 'Drag from the centre out to the circle, or click both'), `<circle cx="10" cy="10" r="7"/>${DOT(10, 10)}`],
      ['circle2', message('mode.circle2', 'Circle by 2 points'), message('mode.circle2.hint', 'Drag or click across the circle: the two ends of a diameter'), `<circle cx="10" cy="10" r="7"/><path d="M3 10h14" stroke-dasharray="1.5 2"/>${DOT(3, 10)}${DOT(17, 10)}`],
      ['circle3', message('mode.circle3', 'Circle by 3 points'), message('mode.circle3.hint', 'Click three points on the circle'), `<circle cx="10" cy="10" r="7"/>${DOT(3, 10)}${DOT(13.5, 3.94)}${DOT(13.5, 16.06)}`],
    ],
  };
  const MODES_KEY = 'diagramtex.drawModes';
  const drawModes: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(MODES_KEY) || '{}') || {}; } catch (e: any) { return {}; } })();
  const drawMode = (tool: string) => { const L = DRAW_MODES[tool]; return L && L.some((r) => r[0] === drawModes[tool]) ? drawModes[tool] : L ? L[0][0] : ''; };
  const modeRow = (tool: string) => DRAW_MODES[tool].find((r) => r[0] === drawMode(tool))!;
  const modeHint = (tool: string) => caption(modeRow(tool)[2]);
  // what the second click of a two-click box sets, by draw mode
  const secondClickHint = (m: string) => m === 'center' ? uiText('hint.second.center', 'Click where a corner goes') : m === 'circle' ? uiText('hint.second.circle', 'Click a point on the circle')
    : m === 'circle2' ? uiText('hint.second.circle2', 'Click the other end of the diameter') : uiText('hint.second.corner', 'Click the opposite corner');

  // A document is a list of blocks (text paragraphs and diagrams). The canvas edits one diagram
  // block at a time; state.doc.shapes always points at that block's shapes.
  // Three kinds of file: 'classic' (diagram blocks + document view), 'page' (one free-form sheet) and
  // 'board' (a whiteboard: one diagram on an endless canvas, stored like a Classic file with one block).
  const normKind = TD.projectFiles.normKind;
  // a document from outside (a link, a file, a paste or storage) is repaired against fresh defaults before use
  const templates = new Map<string, Record<string, unknown>>();
  function conform(sh: Shape) {
    const type = TD.TYPES[sh.type];
    if (!type) return;
    if (!templates.has(sh.type)) {
      let made: Record<string, unknown> = {};
      try { made = type.create({ x: 0, y: 0 }, { x: 40, y: 40 }, sh.type) || {}; } catch { made = {}; }
      templates.set(sh.type, made);
    }
    conformShape(sh, templates.get(sh.type)!, state.defaults as Record<string, unknown>);
  }
  const makeDoc = createDocumentFactory({
    uid,
    upgrade(sh) {
      conform(sh);
      const t = TD.TYPES[sh.type];
      if (t && t.upgrade) t.upgrade(sh);
      // a shape its type cannot measure would break every redraw (and, at startup, the whole app): leave it out
      try { TD.bbox(sh); return true; } catch (err) { console.warn('Left out a damaged shape', sh.type, err); return false; }
    },
    onDropped: (n) => setTimeout(() => showHint(n > 1 ? uiText('hint.droppedShapes.many', 'Left out {n} damaged shapes that could not be drawn', { n }) : uiText('hint.droppedShapes.one', 'Left out 1 damaged shape that could not be drawn'), 5000), 0),
    pageDefaults: TD.PAGE_DEFAULT,
  });

  const state: EditorState = createEditorState(makeDoc);
  let drag: any = null;       // active pointer interaction
  let polyDraft: any = null;  // id of polyline being drawn
  let lineDraft: any = null;  // a line started with a click (no drag): it follows the pointer until the second click
  let arcDraft: any = null;   // arc being drawn click by click: { tool, id, pts, a0, sweep, last, down }
  let snapHint: any = null;   // point to show snap indicator
  let marquee: any = null;
  let spaceDown = false;
  let lastDown = { t: 0, x: 0, y: 0 };
  let clipboard: any = null;
  let editing: any = null;    // { id, field }

  function uid() { return Math.random().toString(36).slice(2, 10); }
  const clone = (o: any) => JSON.parse(JSON.stringify(o));
  // Formatting previews have their own render scene. Saved files, exports and history always
  // read the real document; linked geometry is solved only on the disposable scene while painting.
  let renderScene: Shape[] | null = null;
  let formatPreview: { owner: any; ids: string; key: string; value: any; scene: Shape[] | null } | null = null;
  let formatPreviewFrame = 0;
  const shapes = (): Shape[] => renderScene || state.doc.shapes;
  // where the diagram's variables live (saved with it): the page sheet, or the diagram block
  const home = () => (state.doc.kind === 'page' ? state.doc.sheet : state.doc.blocks[state.doc.active]);
  // shape by id: an index into the shape list, rebuilt when it no longer matches (loops over a large
  // selection call this once per shape, so a scan each time would be quadratic)
  let idList: any = null, idPos = new Map();
  function byId(id: any) {
    const L = shapes();
    let i = L === idList ? idPos.get(id) : undefined;
    if (i !== undefined && L[i] && L[i].id === id) return L[i];
    idList = L; idPos = new Map();
    for (let k = 0; k < L.length; k++) idPos.set(L[k].id, k);
    i = idPos.get(id);
    return i === undefined ? undefined : L[i];
  }
  const selected = (): Shape[] => shapes().filter((s: any) => state.sel.has(s.id));

  // Document transactions are independent of DOM and persistence. Input completion stays here.
  const documentHistory = createDocumentHistory(state, {
    // a linked shape's field changed away from its named style is an override from now on
    // (and one whose style is not in this file, pasted from another, is unlinked)
    syncLinks() { syncLinks(); markOverrides(state.doc.shapes, namedStyles()); syncStyles([home()], namedStyles()); },
    changed() { fileRedo.length = 0; scheduleSave(); }, // a new edit ends what redo could bring back
    // undo brought back the styles table: every diagram's linked shapes follow it (only this one's are in the step)
    applied() { syncNamed(); render(); renderProps(); scheduleSave(); updateTopbar(); },
    updateTools: updateTopbar,
  });
  const { commit, apply: applyStep, trim: trimUndo } = documentHistory;
  function begin() { pointSnapCache = null; clearFormatPreview(false); documentHistory.begin(); }

  // ---------------- named styles (src/core/named-styles.ts) ----------------
  // The file's styles live in its settings (page.styles). Each linked shape keeps the values; a change to the table
  // is copied onto every diagram's linked shapes at once, so the table and the shapes never disagree.
  const namedStyles = () => stylesOf(state.doc.page);
  TD.namedStyles = namedStyles; // for the export (src/domain/shapes.ts)
  // ---------------- the file's macros (src/core/doc-macros.ts) ----------------
  // \newcommand-style definitions kept in the file's settings (page.macros): formulas are drawn with them (render()
  // hands them to the maths engine) and every export writes them into the preamble. An import brings its preamble's.
  TD.docMacros = () => String(state.doc.page.macros || '');
  /** The file's macros become `text`, as one undo step. */
  function setMacros(text: string) {
    const t = String(text || '').trim();
    if (t === TD.docMacros().trim()) return;
    const put = () => { if (t) state.doc.page.macros = t; else delete state.doc.page.macros; };
    // the Document's page settings are one undo step of the document (src/application/docview.ts setPage)
    if (state.mode === 'document') { put(); TD.docview?.changed?.(); TD.docview?.render(); }
    else { begin(); put(); commit(); render(); }
    renderProps();
  }
  /**
   * An import's macro definitions (res.macros) join the file's, inside the caller's undo step; a command the file
   * already defines keeps the file's definition.
   */
  function takeMacros(res: any) {
    if (!res || !String(res.macros || '').trim()) return;
    const m = mergeMacros(TD.docMacros(), res.macros);
    if (m.added.length) state.doc.page.macros = m.text;
    if (m.kept.length) showHint(uiText('hint.macros.kept', 'This file already defines {names}: it keeps its own definition.', { names: m.kept.join(', ') }), 4000);
  }
  async function editMacros() {
    const describe = (v: string) => {
      const p = parseMacros(v), n = p.statements.length;
      const why: Record<string, string> = {
        optional: uiText('macros.why.optional', 'its optional argument is always its default here'),
        delimited: uiText('macros.why.delimited', 'its arguments are delimited, which formulas here can’t read'),
        at: uiText('macros.why.at', 'it uses names with @ (\\makeatletter), which formulas here can’t read; exports still write it'),
        unreadable: uiText('macros.why.unreadable', 'this definition couldn’t be read'),
      };
      const esc = escapeHtml;
      const head = n === 1 ? uiText('macros.count.one', '1 macro') : uiText('macros.count.many', '{n} macros', { n });
      return `<p>${esc(head)}</p>` + p.problems.map((q) => `<p><code>${esc(q.name)}</code>: ${esc(why[q.reason])}</p>`).join('');
    };
    const v = await TD.prompt(uiText('macros.title', 'Macros'), TD.docMacros(), {
      multiline: true, ok: uiText('ui.save', 'Save'), placeholder: '\\newcommand{\\R}{\\mathbb{R}}', preview: describe, notes: true,
      message: uiText('macros.help', 'This file’s own commands, as a preamble defines them (\\newcommand, \\DeclareMathOperator, \\def). Formulas are drawn with them, and every export writes them into its preamble.'),
    });
    if (v != null) setMacros(String(v));
  }
  const styleOwners = () => (state.doc.kind === 'page' ? [state.doc.sheet] : state.doc.blocks.filter((b: any) => b.type === 'diagram'));
  function syncNamed() { syncStyles(styleOwners(), namedStyles()); }
  function setStyles(list: NamedStyle[]) { if (list.length) state.doc.page.styles = list; else delete state.doc.page.styles; syncNamed(); }
  const styleTargets = () => selected().filter(styleable);
  const usersOf = (id: string) => styleOwners().reduce((n: number, o: any) => n + o.shapes.filter((q: any) => q.style === id).length, 0);
  async function askStyleName(title: string, ok: string, value: string, taken: string[]) {
    for (;;) {
      const v = await TD.prompt(title, value, { ok, placeholder: uiText('ns.name.placeholder', 'Name, e.g. block') });
      if (v == null) return null;
      const name = String(v).trim(), problem = nameProblem(name, taken);
      if (!problem) return name;
      showHint(problem === 'chars' ? uiText('ns.bad.chars', 'A style name uses letters, digits, spaces and hyphens, and starts with a letter.')
        : problem === 'reserved' ? uiText('ns.bad.reserved', '"{name}" is one of TikZ’s own keys. Choose another name.', { name })
        : problem === 'taken' ? uiText('ns.bad.taken', 'This file already has a style named "{name}".', { name }) : uiText('ns.bad.empty', 'Type a name for the style.'), 4000);
      value = String(v);
    }
  }
  /** A new style from the first selected object's style; the selection is linked to it. */
  async function newNamedStyle() {
    const sel = styleTargets();
    if (!sel.length) return;
    const name = await askStyleName(uiText('ns.new.title', 'New Style'), uiText('ns.new.ok', 'Create'), '', namedStyles().map((x) => x.name));
    if (name == null || !styleTargets().length) return;
    begin();
    const st: NamedStyle = { id: uid(), name, keys: keysFrom(sel[0]) };
    setStyles([...namedStyles(), st]);
    for (const q of sel) link(q, st);
    render(); commit(); renderProps();
    showHint(uiText('hint.ns.made', 'Made the style "{name}". The LaTeX defines it once and names it on each object.', { name }), 3000);
  }
  /** Link the selection to style `id`, or with '' unlink it (it keeps how it looks). */
  function applyNamed(id: string) {
    const st = namedStyles().find((x) => x.id === id);
    if (id && !st) return;
    begin();
    for (const q of styleTargets()) { if (st) link(q, st); else unlink(q); }
    render(); commit(); renderProps();
  }
  const linkedOf = () => { const q = styleTargets().find((x) => x.style); return q ? { q, st: namedStyles().find((x) => x.id === q.style) } : null; };
  /** The style takes the first linked object's values; every object linked to it follows. */
  function updateNamed() {
    const L = linkedOf();
    if (!L || !L.st) return;
    begin();
    setStyles(namedStyles().map((x) => (x.id === L.st!.id ? { ...x, keys: { ...x.keys, ...keysFrom(L.q) } } : x)));
    delete L.q.so;
    syncNamed();
    render(); commit(); renderProps();
    showHint(uiText('hint.ns.updated', 'Updated the style "{name}". Every object linked to it follows.', { name: L.st.name }), 3000);
  }
  function resetNamed() { begin(); for (const q of styleTargets()) resetStyle(q, namedStyles()); render(); commit(); renderProps(); }
  async function renameNamed() {
    const st = linkedOf()?.st;
    if (!st) return;
    const name = await askStyleName(uiText('ns.rename.title', 'Rename Style'), uiText('ns.rename.ok', 'Rename'), st.name, namedStyles().filter((x) => x.id !== st.id).map((x) => x.name));
    if (name == null || name === st.name) return;
    begin(); setStyles(namedStyles().map((x) => (x.id === st.id ? { ...x, name } : x))); render(); commit(); renderProps();
  }
  // undoable, so no question first: the hint says what happened and how to take it back
  function deleteNamed() {
    const st = linkedOf()?.st;
    if (!st) return;
    const n = usersOf(st.id);
    begin(); setStyles(namedStyles().filter((x) => x.id !== st.id)); render(); commit(); renderProps();
    showHint(n === 1 ? uiText('hint.ns.deleted.one', 'Deleted the style "{name}": the object that used it keeps how it looks. {undo}', { name: st.name, undo: undoHint() })
      : n ? uiText('hint.ns.deleted.many', 'Deleted the style "{name}": the {n} objects that used it keep how they look. {undo}', { name: st.name, n, undo: undoHint() })
      : uiText('hint.ns.deleted', 'Deleted the style "{name}". {undo}', { name: st.name, undo: undoHint() }), 2400);
  }
  function namedMenu(btn: HTMLElement) {
    const L = linkedOf(), over = styleTargets().some((q) => q.style && q.so?.length);
    if (!L || !L.st) return;
    openContextMenu([
      { act: 'update', label: uiText('ns.update', 'Update "{name}" from This Object', { name: L.st.name }), icon: 'history', title: uiText('ns.update.title', 'The style takes this object’s values; every object linked to it follows') },
      { act: 'reset', label: uiText('ns.reset', 'Reset to Style'), icon: 'undo', disabled: !over, title: uiText('ns.reset.title', 'Drop what the selection sets differently from its style') },
      { act: 'detach', label: uiText('ns.detach', 'Detach from Style'), icon: 'unlink' }, '-',
      { act: 'rename', label: uiText('ns.renameDots', 'Rename Style…'), icon: 'rename' },
      { act: 'delete', label: uiText('ns.delete', 'Delete Style'), icon: 'delete', danger: true },
    ], 0, 0, (act) => {
      if (act === 'update') updateNamed(); else if (act === 'reset') resetNamed(); else if (act === 'detach') applyNamed('');
      else if (act === 'rename') void renameNamed(); else if (act === 'delete') void deleteNamed();
    }, { below: btn.getBoundingClientRect(), align: 'end', owner: btn, minWidth: 220, label: uiText('ns.menu', 'Style actions') });
  }
  /** The Style row over the selection's fields: which named style it follows, and what it sets differently. */
  function namedSection(sel: Shape[]): FormSection[] | undefined {
    const targets = sel.filter(styleable);
    if (!targets.length) return undefined;
    const list = namedStyles(), ids = [...new Set(targets.map((q) => q.style || ''))], cur = ids.length === 1 ? ids[0] : '*';
    const options: string[][] = [['', uiText('ns.none', 'None')], ...list.map((st) => [st.id, st.name]), ...(cur === '*' ? [['*', uiText('prop.mixed', 'Mixed')]] : []), ['+', uiText('ns.newFromSel', 'New Style from Selection…')]];
    const linked = targets.some((q) => q.style);
    const rows: FormRow[] = [{ ...row(uiText('ns.label', 'Style'),
      { kind: 'select', attrs: { 'data-named': '', 'aria-label': uiText('ns.label.aria', 'Named style') }, options, value: cur },
      ...(linked ? [{ kind: 'button' as const, attrs: { 'data-act': 'ns:menu', class: 'icon', title: uiText('ns.menu', 'Style actions'), 'aria-haspopup': 'menu' }, text: '', icon: 'more' as IconName }] : [])) }];
    const st = cur && cur !== '*' ? list.find((x) => x.id === cur) : null, so = [...new Set(targets.flatMap((q) => (q.style && Array.isArray(q.so) ? q.so : [])))];
    if (st && so.length) {
      const names = so.map((k: string) => { const p = PROPS.find((x) => x.key === k || (x.key === 'bold' && k === 'italic')); return p ? caption(p.label) : k; });
      rows.push({ kind: 'hint', text: [uiText('ns.differs', 'Differs from "{name}" in {fields}. Reset to Style drops that.', { name: st.name, fields: [...new Set(names)].join(', ') })] });
    }
    return [{ class: 'sec named-row', rows }];
  }

  // The open file's own steps come first; once they run out, undo reaches the file list (a file or folder
  // moved to the Recycle Bin comes back), as redo does the other way.
  // Whichever is later goes first: the open file's last step, or the last change to the file list. Redo takes
  // back whichever was undone last.
  function undo() {
    finishEdit(); finishPoly(); commit();
    const st = state.undo[state.undo.length - 1], f = fileUndo[fileStep(fileUndo, binnedOf)];
    if (f && (!st || f.t > (st.t || 0))) { undoFile(); return; }
    if (!st) return;
    state.undo.pop(); st.r = stamp(); state.redo.push(st); applyStep(st, true);
  }
  // A Classic document's page has its own steps (src/application/doc-history.ts); they take turns with the
  // file list's the same way.
  function undoDocument(back: boolean) {
    const dv = TD.docview;
    if (back) {
      const t = dv?.lastDone() || 0, f = fileUndo[fileStep(fileUndo, binnedOf)];
      if (f && (!t || f.t > t)) undoFile(); else if (t) dv.applyUndo(true);
    } else {
      const r = dv?.lastUndone() || 0, f = fileRedo[fileStep(fileRedo, listedOf)];
      if (f && (!r || (f.r || 0) > r)) redoFile(); else if (r) dv.applyUndo(false);
    }
    updateTopbar();
  }
  function redo() {
    finishEdit(); commit();
    const st = state.redo[state.redo.length - 1], f = fileRedo[fileStep(fileRedo, listedOf)];
    if (f && (!st || (f.r || 0) > (st.r || 0))) { redoFile(); return; }
    if (!st) return;
    state.redo.pop(); st.t = stamp(); state.undo.push(st); trimUndo(); applyStep(st, false);
  }

  // ---------------- storage ----------------
  const LS_INDEX = 'diagramtex.index', LS_DOC = 'diagramtex.doc.', LS_PREFS = 'diagramtex.prefs', LS_CLIP = 'diagramtex.clip';
  // Files and the file list go to IndexedDB when it is available (src/platform/storage.ts); everything else, and every
  // key when it is not, to localStorage.
  const DS = TD.docStore;
  const { store, inDatabase: inDb } = createBrowserStore(DS, () => localStorage);
  const index = () => store.get<SavedEntry[]>(LS_INDEX, []);
  // Stable function declarations allow history callbacks to call the initialized service later.
  // Recovery copies (src/core/recovery.ts): autosave keeps a file's earlier state, at most once a period.
  // The period and how many copies are kept are app settings, kept in this browser.
  const LS_RECOVERY = 'diagramtex.recovery';
  const recoverySettings = (): RecoverySettings => {
    const s = store.get<Partial<RecoverySettings>>(LS_RECOVERY, {});
    return { every: RECOVERY_EVERY.includes(s.every as number) ? s.every as number : RECOVERY_DEFAULTS.every,
      keep: RECOVERY_KEEP.includes(s.keep as number) ? s.keep as number : RECOVERY_DEFAULTS.keep };
  };
  // Copies are kept in the database one record per copy; without it, as one array per file in localStorage.
  const arrayed = arrayCopies(store), copyStore = (): CopyStore => (DS?.active ? DS.copies : arrayed);
  const recovery = createRecovery({ list: (id) => copyStore().list(id), put: (id, c) => copyStore().put(id, c),
    del: (id, t) => copyStore().del(id, t), clear: (id) => copyStore().clear(id) }, recoverySettings);
  const autosave = createAutosave(state, store, { index, inBin: (id) => bin().some((x) => (x as any).id === id), inDatabase: inDb, report: reportSave, showState: showSaveState, renderList: renderDocList,
    replacing: (id, stored, updated) => { recovery.take(id, stored, updated); } });
  // A file linked to one on disk that the browser lets the page write to is also written there, a second
  // after the last change (src/platform/filelink.ts); every file is also kept in the browser.
  let fileTimer: ReturnType<typeof setTimeout> | undefined, fileId: string | null = null;
  function writeLinked(id: string | null = state.docId) {
    clearTimeout(fileTimer); fileTimer = undefined; fileId = null;
    if (!id || id !== state.docId || !TD.files.autoSaving(id)) return;
    const edit = diskEdit(id);
    TD.files.autoWrite(id, projectJson(state.doc)).then((r: string) => {
      if (r === 'saved') diskWritten(id, edit);
      if (r === 'changed') {
        const f = TD.files.fileOf(id);
        showHint(uiText('hint.fileChangedOnDisk', '{file} changed on disk, so changes are no longer saved to it as you work. {key} lets you choose which to keep.', { file: f?.name || '', key: keyLabel('Ctrl+S') }), 6000);
      }
      if (r === 'missing') showHint(uiText('hint.fileMissing', '{file} was moved or deleted. Changes stay in this browser; {key} asks where to save it.', { file: TD.files.fileOf(id)?.name || '', key: keyLabel('Ctrl+S') }), 6000);
      if (id === state.docId) showSaveState();
    });
  }
  function scheduleSave() {
    autosave.scheduleSave();
    if (state.docId && TD.files.fileOf(state.docId)) diskChanged(state.docId); // its dot turns yellow with the change
    if (state.docId && TD.files.autoSaving(state.docId)) { clearTimeout(fileTimer); fileId = state.docId; fileTimer = setTimeout(() => writeLinked(fileId), 1000); }
  }
  function saveNow() { autosave.saveNow(); if (fileTimer) writeLinked(fileId); }
  // Files linked to one on disk with changes not yet written there: the top bar's dot is yellow for the open one, and
  // closing the tab asks first. Known from what happens, never by comparing the file's contents: an edit marks its
  // file, and a write that lands (autosave's, Ctrl+S, or the file opened or reloaded from disk) clears it, unless
  // the file was edited again while it was being written. Kept across a reload, as the changes are.
  const DISK_DIRTY = 'diagramtex.diskDirty';
  const diskDirty = new Set<string>(store.get<string[]>(DISK_DIRTY, []) || []);
  const diskEdits = new Map<string, number>(); // edits counted per file, so a write knows which edit it holds
  const diskEdit = (id: string | null) => (id && diskEdits.get(id)) || 0;
  function diskChanged(id: string) {
    diskEdits.set(id, diskEdit(id) + 1);
    if (diskDirty.has(id)) return;
    diskDirty.add(id); store.set(DISK_DIRTY, [...diskDirty]);
    if (id === state.docId) showSaveState();
  }
  // `edit`: the edit the write was started with (none: the file holds the document as it is now)
  function diskWritten(id: string | null, edit = diskEdit(id)) {
    if (!id) return;
    if (edit !== diskEdit(id) || !diskDirty.has(id)) { if (id === state.docId) showSaveState(); return; }
    diskDirty.delete(id); store.set(DISK_DIRTY, [...diskDirty]);
    if (id === state.docId) showSaveState();
  }
  // Back in the tab, or switched to a linked file: has something else changed the file on disk meanwhile? With
  // nothing here unsaved to it, the disk's version comes in (this browser's is kept in version history); otherwise
  // autosave to it stops, the top bar says so and ⌘S asks which to keep. A file moved or deleted says so too. Not
  // while something is being edited (a field, a dialog, a block editor): the next look, or autosave's, finds it.
  const diskLook = { busy: false };
  // What it did ('changed', 'missing', 'same', …), or why it didn't look ('skip: …'), for the tests.
  async function lookAtDisk(id: string | null = state.docId): Promise<string> {
    if (!id || !TD.files.fileOf(id)) return 'skip: not linked';
    if (diskLook.busy) return 'skip: busy';
    if (TD.files.conflict(id)) return 'skip: held';
    if (TD.app?.cmd?.inTool?.()) return 'skip: in Quick or the Table'; // not from under them
    const a = document.activeElement as HTMLElement | null;
    if (a?.closest?.('input, textarea, select, [contenteditable], math-field')) return 'skip: typing in ' + a.tagName;
    const top = [...document.querySelectorAll<HTMLElement>('.td-dialog, [aria-modal="true"]')].find((el) => el.getClientRects().length);
    if (top) return 'skip: under ' + (top.id || top.className);
    diskLook.busy = true;
    try {
      const was = TD.files.missing(id), now = await TD.files.diskState(id), name = TD.files.fileOf(id)?.name || '';
      if (id !== state.docId) return 'skip: switched';
      if (now.state === 'changed') {
        if (!diskDirty.has(id)) await takeDisk(id, now.text, name);
        else if (TD.files.hold(id)) showHint(uiText('hint.fileChangedBoth', '{file} changed on disk while it has changes here. {key} lets you choose which to keep.', { file: name, key: keyLabel('Ctrl+S') }), 6000);
      } else if (now.state === 'missing' && !was) showHint(uiText('hint.fileMissing', '{file} was moved or deleted. Changes stay in this browser; {key} asks where to save it.', { file: name, key: keyLabel('Ctrl+S') }), 6000);
      showSaveState();
      return now.state + (now.state === 'changed' && diskDirty.has(id) ? ': held' : '');
    } finally { diskLook.busy = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void lookAtDisk(); });
  addEventListener('focus', () => { void lookAtDisk(); });
  function unsavedToDisk() {
    const open = new Set(store.get<any[]>(LS_INDEX, []).map((d) => d.id)); // not one in the bin
    return [...diskDirty].some((id) => open.has(id) && !!TD.files.fileOf(id));
  }
  // Where autosave keeps the open file: nowhere (no IndexedDB), the browser, or also its file on disk.
  const autosaveMode = (): 'none' | 'browser' | 'file' => !DS?.active ? 'none' : state.docId && TD.files.autoSaving(state.docId) ? 'file' : 'browser';
  TD.files.onChange(() => { showSaveState(); });
  // Saving is continuous, so there is nothing to report while it works: the top bar says where autosave goes.
  // A failure is the only news, shown there and once as a hint (the sidebar may be hidden).
  let saveOk = true, saveFull = false;
  function reportSave(ok: any, full: any) {
    const was = !saveOk;
    saveOk = ok; saveFull = full;
    showSaveState();
    if (!ok && !was) showHint(full ? uiText('hint.autosave.tooLarge', 'Autosave failed: this file is too large for browser storage. Use Save to keep it as a file, or delete files you no longer need.')
      : uiText('hint.autosave.unavailable', 'Autosave failed: browser storage is unavailable. Use Save to keep a copy as a file.'), 6000);
  }
  // The status line, its file name cut in the middle where the bar has no room ("Lectur…tes.diagramtex"): the start
  // of the name and its end, with the extension, stay readable. Fitted again when the bar changes width.
  let statusLine: { file: string; make: (name: string) => string } = { file: '', make: () => '' };
  function cutMiddle(name: string, keep: number) {
    const ext = /\.[^.\s]{1,12}$/.exec(name)?.[0] || '', stem = name.slice(0, name.length - ext.length);
    if (keep >= stem.length) return name;
    const head = Math.ceil(keep / 2), tail = keep - head;
    return stem.slice(0, head) + '…' + (tail ? stem.slice(-tail) : '') + ext;
  }
  function fitStatus() {
    const txt = $('#saveStatus .save-text');
    if (!txt) return;
    const set = (s: string) => { if (txt.textContent !== s) txt.textContent = s; }; // unchanged text is not re-announced
    const { file, make } = statusLine;
    set(make(file));
    const fits = () => txt.scrollWidth <= txt.clientWidth;
    if (!file || make('') === make(file) || !txt.clientWidth || fits()) return; // no name in it, or it fits
    // the most of the name's stem that fits, found by halves, but at least a few letters of it: where even those don't
    // fit, the bar's own ellipsis cuts the line's end (the tooltip has all of it)
    const least = 8;
    let lo = least, hi = file.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); set(make(cutMiddle(file, mid))); if (fits()) lo = mid; else hi = mid - 1; }
    set(make(cutMiddle(file, lo)));
  }
  { const row = document.querySelector('#topbar .doc-row'); if (row && typeof ResizeObserver === 'function') new ResizeObserver(() => fitStatus()).observe(row); }
  // Beside the logo: a status dot and where the open file is kept. Red: no autosave, or it failed; yellow: kept only
  // in this browser though it could be on disk (not linked to a file yet, or changes not saved to its file); green:
  // saved to its file on disk; blue: kept in this browser, which can't link files (Safari, Firefox).
  function showSaveState() {
    const f = TD.files.fileOf(state.docId), mode = autosaveMode();
    // with autosave writing the file, a change is yellow until its write lands a second later
    const onDisk = !!f && !!state.docId && !diskDirty.has(state.docId);
    const file = f?.name || '';
    const fixed = (t: string) => () => t; // a line with no file name in it
    const ctrlS = keyLabel('Ctrl+S'), saveKey = keyLabel('Ctrl+Shift+S');
    // [dot, the line (given the file name, which may come cut), what it means]
    const [tone, make, tip]: [string, (name: string) => string, string] =
      mode === 'none' ? ['err', fixed(uiText('save.status.none', 'Autosave unavailable')), uiText('save.autosaveNone.tip', 'This browser can’t keep your work as you go. Save it as a file to keep it.')]
      : !saveOk ? ['err', fixed(saveFull ? uiText('save.state.full', 'Autosave failed: browser storage is full') : uiText('save.state.unavailable', 'Autosave failed: browser storage unavailable')), '']
      : f && TD.files.missing(state.docId) ? ['warn', (name) => uiText('save.status.missing', '{file} was moved or deleted · {key} saves it again', { file: name, key: ctrlS }),
        uiText('save.status.missing.tip', 'Every change is still saved in this browser. {key} asks where to save the file.', { key: ctrlS })]
      : f && TD.files.conflict(state.docId) ? ['warn', (name) => uiText('save.status.conflict', '{file} changed on disk · {key} to choose which to keep', { file: name, key: ctrlS }),
        uiText('save.status.conflict.tip', 'Something else saved the file while it had changes here. They are kept in this browser; {key} asks whether to save over the file or open its version.', { key: ctrlS })]
      : onDisk ? ['ok', (name) => uiText('save.status.saved', 'Changes are saved to {file}', { file: name }),
        mode === 'file' ? uiText('save.autosaveFile.tip', 'Every change is written to it as you work, and kept in this browser too.') : uiText('save.state.saved', '{key} saves later changes to it.', { key: ctrlS })]
      : f ? ['warn', (name) => uiText('save.status.notOnDisk', 'Autosaved in browser only · Not saved to {file} yet', { file: name }), uiText('save.state.dirty', '{key} saves them to it.', { key: ctrlS })]
      : TD.files.can ? ['warn', fixed(uiText('save.status.toDisk', 'Autosaved in browser only · Save it to disk with {key}', { key: saveKey })),
        uiText('save.status.toDisk.tip', 'Every change is saved in this browser as you work. {key} saves it to a file on your computer, and later changes go to that file.', { key: saveKey })]
      : ['info', fixed(uiText('save.status.browser', 'Autosaved in browser only')), caption(captions["ui.every.change.is.saved.in.this.browser.as.you.work"])];
    const text = make(file);
    const el = $('#saveStatus');
    el.dataset.tone = tone;
    el.title = tip ? `${text}\n${tip}` : text; // the whole line, where the bar cuts it short
    statusLine = { file, make };
    fitStatus();
    const b = $('#topbar [data-cmd="save"]');
    if (b) b.title = f ? uiText('save.btn.linked', 'Save to {file} (Ctrl+S)', { file: f.name }) : TD.files.can ? uiText('save.btn.files', 'Save to a .diagramtex file on your computer; later saves go to the same file (Ctrl+Shift+S)') : caption(captions["ui.save.to.a.diagramtex.file.that.you.can.open.again.ctrl.shift.s"]);
  }
  // The properties window folds up to its first heading and back down, its height eased between the two.
  // Each time the panel is drawn, its first heading moves into the window's head, above the scrolling part,
  // where a click anywhere on it folds or unfolds the window.
  {
    const props = $('#props'), head = $('#propsHead');
    const lift = () => {
      const f = props.firstElementChild;
      if (!f || f.tagName !== 'H3') return;
      const old = head.querySelector('h3');
      if (old) old.replaceWith(f); else head.prepend(f);
    };
    new MutationObserver(lift).observe(props, { childList: true });
    lift();
  }
  function setPropsOpen(open: any, animate?: any) {
    foldWin($('#propsWin'), $('#propsToggle'), open, animate, () => { if (!open) $('#props').scrollTop = 0; }, [$('#layersWin')]);
  }
  // Folds or unfolds a side window, easing its height from where it was to where the class change puts it.
  // `also` are windows whose height follows from this one (Layers, whose cap depends on Properties being
  // folded); they ease along in step so nothing jumps. While moving, a window carries `.folding`, which keeps
  // its contents shown so they slide away rather than vanish.
  function foldWin(win: any, btn: any, open: any, animate: any, after: any, also: HTMLElement[] = []) {
    const els = [win, ...also].filter((el) => el.offsetParent);
    if (!els.includes(win)) els.unshift(win);
    for (const el of els) if (el._foldEnd) el._foldEnd();
    const from = els.map((el) => el.offsetHeight);
    // a list that scrolls before or after keeps its scroll bar the whole way; one that fits at both ends
    // hides it, so no bar flickers in for the frames where the window is between sizes
    const scroller = (el: any) => el.querySelector('#props, #layers');
    const overflows = (el: any) => { const sc = scroller(el); return !!sc && !el.classList.contains('collapsed') && sc.scrollHeight > sc.clientHeight + 1; };
    const scrolled = els.map(overflows);
    win.classList.toggle('collapsed', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.title = open ? caption(captions["ui.collapse.panel"]) : uiText('panel.expand', 'Expand panel');
    if (after) after();
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = els.map((el) => el.offsetHeight), scrolls = els.map(overflows); // measured before `.folding` lifts the cap
    els.forEach((el, i) => {
      if (to[i] === from[i]) return;
      el.classList.add('folding');
      el.classList.toggle('fold-clip', !scrolled[i] && !scrolls[i]);
      el.style.height = from[i] + 'px';
    });
    void win.offsetHeight;
    els.forEach((el, i) => {
      if (to[i] === from[i]) return;
      el.style.transition = 'height .24s cubic-bezier(.3, .7, .2, 1)';
      el.style.height = to[i] + 'px';
      const end = (e: any) => {
        if (e && e.target !== el) return;
        el.removeEventListener('transitionend', end); el._foldEnd = null;
        el.classList.remove('folding', 'fold-clip'); el.style.transition = el.style.height = '';
      };
      el._foldEnd = end;
      el.addEventListener('transitionend', end);
    });
  }
  function savePrefs() { store.set(LS_PREFS, { grid: state.grid, gridCm: state.gridCm, gridStyle: state.gridStyle, guideMode, snap: state.snap, snapMode: snapMode(), defaults: state.defaults, bucketFill, sidebar: !document.body.classList.contains('no-files'), props: !$('#propsWin').classList.contains('collapsed'), layers: !$('#layersWin').classList.contains('collapsed') }); }

  // ---- Undo history per file (and per diagram of a classic file). Leaving a file keeps its steps; coming back
  // gives them back, as long as what they apply to is still exactly as it was left. Another tab's edit, a
  // restored recovery copy or reordered blocks change it, and its steps are dropped rather than misapplied.
  // The newest 40 are kept for the session.
  interface KeptHistory { undo: HistoryStep[]; redo: HistoryStep[]; mark: string }
  const histories = new Map<string, KeptHistory>();
  const historyKey = (id: string) => id + ':' + (state.doc.kind === 'page' ? 'page' : state.doc.active);
  const historyMark = () => JSON.stringify(state.doc.kind === 'page' ? state.doc.sheet : state.doc.blocks[state.doc.active]);
  function keepHistory() {
    if (!state.docId) return;
    const key = historyKey(state.docId);
    histories.delete(key);
    if (state.undo.length || state.redo.length) histories.set(key, { undo: state.undo, redo: state.redo, mark: historyMark() });
    while (histories.size > 40) histories.delete(histories.keys().next().value!);
  }
  function takeHistory() {
    state.undo = []; state.redo = []; documentHistory.reset();
    if (!state.docId) return;
    const key = historyKey(state.docId), kept = histories.get(key);
    histories.delete(key);
    if (kept && kept.mark === historyMark()) { state.undo = kept.undo; state.redo = kept.redo; }
  }
  const forgetHistory = (id: string) => { for (const k of [...histories.keys()]) if (k.startsWith(id + ':')) histories.delete(k); };

  function openDoc(id: any) {
    TD.math.cancelPending();
    finishEdit(); finishPoly(); commit();
    if (state.docId) { saveNow(); keepHistory(); }
    const d: any = store.get<Record<string, any> | null>(LS_DOC + id, null);
    if (!d) return;
    const gone = dropRetiredDoc(d);
    state.docId = id;
    const kind = normKind(d.kind);
    state.doc = makeDoc(d.name, d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }], d.active ?? 0, d.page, d.sheet, kind);
    // a file changed by a version without named styles: what differs from a shape's style is an override
    for (const o of styleOwners()) markOverrides(o.shapes, namedStyles());
    syncNamed();
    const fit = !(d.view && d.view.zoom > 0);
    if (!fit) state.view = d.view;
    state.sel.clear(); takeHistory();
    autosave.markSynced();
    $('#docName').value = state.doc.name;
    renderDocList();
    applyMode(kind === 'page' || kind === 'board' ? kind : (d.mode === 'diagram' ? 'diagram' : 'document'), fit);
    render(); renderProps(); updateTopbar(); showSaveState();
    // remembered for the next start only once it has drawn
    store.set('diagramtex.last', id);
    store.set('diagramtex.last.' + kind, id);
    if (gone) { saveNow(); retiredHint(gone); }
    void lookAtDisk(id);
  }
  // Switch the canvas to another diagram block of the current document.
  function setActiveBlock(i: any, scrollTo = true) {
    if (!state.doc.blocks[i] || state.doc.blocks[i].type !== 'diagram') return;
    finishEdit(); finishPoly(); commit();
    keepHistory();
    state.doc.active = i;
    state.sel.clear(); takeHistory();
    render(); renderProps(); updateTopbar(); scheduleSave();
    if (state.mode === 'document' && scrollTo) TD.docview?.scrollToDiagram(i);
  }
  // Modes: 'page' (Page files), 'board' (Whiteboard files) or 'diagram' / 'document' (the two views of a
  // Classic file). Picking a mode of another kind switches to the last file of that kind (or starts one).
  const kindOf = (m: any) => (m === 'page' || m === 'board' ? m : 'classic');
  const NEW_NAME: Record<string, any> = { page: 'Untitled page', board: 'Untitled board', classic: 'Untitled' };
  function setMode(m: any, quiet?: any) {
    finishEdit(); finishPoly(); commit();
    if (kindOf(m) !== state.doc.kind) { switchKind(kindOf(m), m); return; }
    if (m === state.mode) return;
    applyMode(m, false);
    if (!quiet) scheduleSave();
  }
  function switchKind(kind: any, m?: any) {
    const idx = index().filter((x) => ((x as any).kind || 'classic') === kind);
    const last = store.get('diagramtex.last.' + kind, null);
    const id = idx.find((x) => (x as any).id === last) ? last : idx.length ? (idx[idx.length - 1] as any).id : null;
    if (id) openDoc(id); else newDoc(NEW_NAME[kind], null, null, null, null, kind);
    if (kind === 'classic' && m && m !== state.mode) { applyMode(m, false); scheduleSave(); }
  }
  const documentScroll = new Map<string, { top: number; left: number }>();
  let documentViewId: string | null = null;
  function applyMode(m: any, fit: any) {
    magnifier.hide(); smartLines = [];
    const docView = $('#docview');
    if (state.mode === 'document' && documentViewId) documentScroll.set(documentViewId, { top: docView.scrollTop, left: docView.scrollLeft });
    state.mode = m;
    document.body.classList.toggle('mode-doc', m === 'document');
    document.body.classList.toggle('mode-page', m === 'page');
    document.body.classList.toggle('mode-board', m === 'board');
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.mode === m));
    document.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.kind === kindOf(m)));
    if (m === 'document') { if (fit) fitLater = true; if (TD.docview) TD.docview.render(); }
    else requestAnimationFrame(() => { const f = fit || fitLater; fitLater = false; if (f) zoomFit(); else render(); });
    renderProps();
    updateTopbar();
    if (m === 'document' && state.docId) {
      const id = documentViewId = state.docId;
      const scroll = documentScroll.get(id) || { top: 0, left: 0 };
      const restore = () => { if (state.mode === 'document' && state.docId === id) { docView.scrollTop = scroll.top; docView.scrollLeft = scroll.left; } };
      restore(); requestAnimationFrame(restore); // after docview's scheduled page layout
    }
  }
  function newDoc(name: any, shapesArr: any, view: any, blocks: any, page?: any, kind?: any, sheet?: any) {
    const id = uid();
    kind = normKind(kind);
    name = name || NEW_NAME[kind];
    // a whiteboard holds one diagram: imported blocks are merged onto it
    if (kind === 'board' && blocks) { shapesArr = blocks.filter((b: any) => b.type === 'diagram').flatMap((b: any) => b.shapes || []); blocks = null; }
    store.set(LS_DOC + id, kind === 'page'
      ? { kind, name, page, sheet: sheet || { pages: 1, shapes: [] }, view, mode: 'page' }
      : { kind, name, blocks: blocks || [{ type: 'diagram', shapes: shapesArr || [] }], active: 0, page, view: view || { x: -60, y: -60, zoom: 1 }, mode: kind === 'board' ? 'board' : 'document' }); // a Classic file opens on its page
    const idx: any[] = index(); const now = Date.now(); idx.push({ id, name, kind, updated: now, created: now }); store.set(LS_INDEX, idx);
    openDoc(id);
    return id;
  }
  // Deleting moves a file to the Recycle Bin: it leaves the list but keeps its data, so it can be put back.
  // Whatever has been in the bin for 30 days is removed for good the next time the app starts or the bin opens.
  const LS_BIN = 'diagramtex.bin', BIN_DAYS = 30, DAY = 864e5;
  const bin = () => store.get<DeletedEntry[]>(LS_BIN, []);
  function purgeBin() {
    const now = Date.now(), keep: any[] = [];
    for (const x of bin()) {
      if (now - (x as any).deleted < BIN_DAYS * DAY) keep.push(x);
      // a file put back in the list (by another tab) keeps its data
      else if (!index().some((d) => (d as any).id === (x as any).id)) { store.del(LS_DOC + (x as any).id); recovery.forget((x as any).id); forgetHistory((x as any).id); TD.files.forget((x as any).id); }
    }
    if (keep.length !== bin().length) store.set(LS_BIN, keep);
    return keep;
  }
  // take files out of the list into the bin; `folder` groups the files of a deleted folder. When the open file
  // goes, `next` opens in its place if it is listed (redo goes back to where undo came from), else the last
  // file of the kind.
  function binDocs(ids: any, folder?: any, next?: string | null) {
    if (ids.includes(state.docId)) saveNow();
    const all = index(), out = all.filter((d) => ids.includes((d as any).id)), when = Date.now(), batch = folder ? uid() : null;
    // what undo needs to put things back as they were: places in the list, the open file, folded folders
    const step: FileStep = { t: stamp(), ids: out.map((d) => d.id), folder, at: out.map((d) => all.indexOf(d)), open: ids.includes(state.docId) ? state.docId : null, created: null,
      folded: folder ? [...folded].filter((k) => k === foldKey(folder) || k.startsWith(foldKey(folder + '/'))) : [] };
    store.set(LS_BIN, [...bin(), ...out.map((d) => ({ id: (d as any).id, name: (d as any).name, kind: (d as any).kind || 'classic', updated: (d as any).updated, created: (d as any).created, deleted: when, ...(folder ? { folder, batch } : {}) }))]);
    const idx = all.filter((d) => !ids.includes((d as any).id));
    store.set(LS_INDEX, idx);
    if (ids.includes(state.docId)) {
      const kind = state.doc.kind;
      finishEdit(); finishPoly(); commit();
      keepHistory(); // its steps come back with it
      state.docId = null;
      const same = idx.filter((d) => ((d as any).kind || 'classic') === kind);
      if (next && same.some((d) => d.id === next)) openDoc(next);
      else if (same.length) openDoc((same[same.length - 1] as any).id); else step.created = newDoc(null, null, null, null, null, kind);
    }
    renderDocList(); renderBinRow();
    step.seen = listIds();
    if (step.ids.length) { fileUndo.push(step); if (fileUndo.length > 50) fileUndo.shift(); }
    updateTopbar();
  }
  // ---- Undo for the file list. A delete is one step: undo takes the files back out of the bin, to the places
  // they had in the list and under their names (a name taken since gets "copy"), and reopens the file that
  // was open. A file restored or erased from the bin dialog since is no longer the step's to bring back.
  // `t` / `r`: when it was done and undone (`stamp()`), so it takes its turn among the files' own steps;
  // `back`: the file that was open before undo, where redo returns to; `seen`: the files in the list once it was done
  // (or undone). Only their undo and redo reach it: a file made or opened since has nothing to undo or redo.
  interface FileStep { t: number; r?: number; back?: string | null; seen?: string[]; ids: string[]; folder?: string; at: number[]; open: string | null; created: string | null; folded: string[] }
  const fileUndo: FileStep[] = [], fileRedo: FileStep[] = [];
  const binnedOf = (step: FileStep) => { const b = new Set(bin().map((x) => x.id)); return step.ids.filter((id) => b.has(id) && store.get(LS_DOC + id, null)); };
  const listedOf = (step: FileStep) => { const l = new Set(index().map((x) => x.id)); return step.ids.filter((id) => l.has(id)); };
  // the last step the open file can reach (-1: none); steps whose files have been restored or erased since are dropped
  function fileStep(list: FileStep[], live: (step: FileStep) => string[]) {
    for (let k = list.length - 1; k >= 0; k--) {
      if (!live(list[k]).length) { list.splice(k, 1); continue; }
      if (!list[k].seen || list[k].seen!.includes(state.docId!)) return k;
    }
    return -1;
  }
  const listIds = () => index().map((d: any) => d.id);
  const canUndoFile = () => fileStep(fileUndo, binnedOf) >= 0;
  const canRedoFile = () => fileStep(fileRedo, listedOf) >= 0;
  // a file made only because the last one of its kind was deleted, and still untouched
  const isBlankNew = (id: string) => {
    const d: any = store.get(LS_DOC + id, null), e: any = docEntry(id);
    if (!d || !e || e.name !== NEW_NAME[normKind(d.kind)]) return false;
    return !(d.sheet?.shapes?.length) && (d.blocks || []).every((b: any) => b.type === 'diagram' && !(b.shapes || []).length);
  };
  function undoFile() {
    const at = fileStep(fileUndo, binnedOf);
    if (at < 0) return;
    const step = fileUndo.splice(at, 1)[0], ids = binnedOf(step), items = bin().filter((x) => ids.includes(x.id));
    if (step.created && step.created === state.docId) saveNow();
    const idx: any[] = index();
    // back in list order, each at its old place (or the end, when the list has shrunk since)
    const order = ids.map((id) => ({ id, at: step.at[step.ids.indexOf(id)] })).sort((a, b) => a.at - b.at);
    for (const { id, at } of order) {
      const x: any = items.find((y) => y.id === id);
      const name = idx.some((d) => d.name === x.name) ? copyName(x.name) : x.name;
      if (name !== x.name) store.set(LS_DOC + id, { ...store.get<Record<string, any>>(LS_DOC + id, {}), name });
      idx.splice(Math.min(at, idx.length), 0, { id, name, kind: x.kind, updated: x.updated || Date.now(), created: x.created || x.updated || Date.now() });
    }
    // the empty file that stood in for the deleted one goes again
    let dropped = false;
    if (step.created && isBlankNew(step.created)) {
      const k = idx.findIndex((d) => d.id === step.created);
      if (k >= 0) idx.splice(k, 1);
      store.del(LS_DOC + step.created); recovery.forget(step.created); forgetHistory(step.created);
      dropped = true;
    }
    store.set(LS_INDEX, idx);
    store.set(LS_BIN, bin().filter((x) => !ids.includes(x.id)));
    for (const k of step.folded) folded.add(k);
    if (step.folded.length) store.set(LS_FOLDED, [...folded]);
    const again: FileStep = { ...step, ids, created: null, r: stamp(), back: dropped && state.docId === step.created ? null : state.docId };
    fileRedo.push(again);
    const reopen = step.open && ids.includes(step.open) ? step.open : null;
    if (dropped && state.docId === step.created) state.docId = null; // nothing of it left to save
    if (reopen) openDoc(reopen);
    else if (!state.docId) { const same = idx.filter((d) => (d.kind || 'classic') === state.doc.kind); if (same.length) openDoc(same[same.length - 1].id); }
    again.seen = listIds();
    renderDocList(); renderBinRow(); updateTopbar();
    const first: any = items.find((x) => x.id === ids[0]);
    showHint(step.folder ? uiText('hint.restored.folder', 'Restored "{name}"', { name: leafOf(step.folder) }) : ids.length === 1 ? uiText('hint.restored.folder', 'Restored "{name}"', { name: leafOf(first.name) }) : uiText('hint.restored.many', 'Restored {n} files', { n: ids.length }), 1600);
  }
  function redoFile() {
    const at = fileStep(fileRedo, listedOf);
    if (at < 0) return;
    const step = fileRedo.splice(at, 1)[0], ids = listedOf(step);
    const it: any = docEntry(ids[0]);
    binDocs(ids, step.folder, step.back);
    for (const k of step.folded) folded.delete(k);
    if (step.folded.length) store.set(LS_FOLDED, [...folded]);
    showHint(uiText('hint.binned', 'Moved "{name}" to the Recycle Bin', { name: leafOf(step.folder || it.name) }), 1600);
  }
  const undoHint = () => uiText('hint.undoBringsBack', '{key} brings it back', { key: kb('Ctrl+Z') });
  function deleteDoc(id: any) {
    const it: any = docEntry(id);
    if (!it) return;
    fileRedo.length = 0;
    binDocs([id]);
    showHint(uiText('hint.binned.undo', 'Moved "{name}" to the Recycle Bin. {undo}', { name: leafOf(it.name), undo: undoHint() }), 2400);
  }
  // A folder goes to the bin with everything in it (files of the kind on show, and the folders inside): no question
  // first, as ⌘Z or the bin brings it all back.
  function deleteFolder(path: any) {
    const kind = state.doc.kind, pre = path + '/';
    const ids = index().filter((d) => ((d as any).kind || 'classic') === kind && pathOf((d as any).name).join('/').startsWith(pre)).map((d) => (d as any).id);
    if (!ids.length) return;
    fileRedo.length = 0;
    binDocs(ids, path);
    for (const k of [...folded]) if (k === foldKey(path) || (k as any).startsWith(foldKey(pre))) folded.delete(k);
    store.set(LS_FOLDED, [...folded]);
    showHint(uiText('hint.binned.undo', 'Moved "{name}" to the Recycle Bin. {undo}', { name: leafOf(path), undo: undoHint() }), 2400);
  }
  // Put files back under their old names (a name taken since gets "copy"); the first one opens.
  function restoreFromBin(ids: any) {
    const items = bin().filter((x) => ids.includes((x as any).id) && store.get<Record<string, any> | null>(LS_DOC + (x as any).id, null));
    if (!items.length) return;
    const idx: any[] = index();
    for (const x of items) {
      const name = idx.some((d) => d.name === (x as any).name) ? copyName((x as any).name) : (x as any).name;
      if (name !== (x as any).name) { const d = store.get<Record<string, any> | null>(LS_DOC + (x as any).id, null); store.set(LS_DOC + (x as any).id, { ...d, name }); }
      idx.push({ id: (x as any).id, name, kind: (x as any).kind, updated: (x as any).updated || Date.now(), created: (x as any).created || (x as any).updated || Date.now() });
      store.set(LS_INDEX, idx);
    }
    store.set(LS_BIN, bin().filter((x) => !ids.includes((x as any).id)));
    openDoc((items[0] as any).id);
    renderBinRow();
    showHint(items.length === 1 ? uiText('hint.restored.folder', 'Restored "{name}"', { name: leafOf((items[0] as any).name) }) : uiText('hint.restored.many', 'Restored {n} files', { n: items.length }), 1600);
  }
  function eraseFromBin(ids: any) {
    for (const id of ids) { store.del(LS_DOC + id); recovery.forget(id); forgetHistory(id); TD.files.forget(id); }
    store.set(LS_BIN, bin().filter((x) => !ids.includes((x as any).id)));
    renderBinRow();
  }
  function renderBinRow() {
    const b = $('#binRow');
    if (!b) return;
    const n = bin().length;
    b.querySelector('.bin-n').textContent = n ? n : '';
    b.classList.toggle('full', n > 0);
  }
  const ago = (t: any) => { const d = Math.floor((Date.now() - t) / DAY); return d < 1 ? uiText('time.today', 'today') : d === 1 ? uiText('time.yesterday', 'yesterday') : uiText('time.daysAgo', '{n} days ago', { n: d }); };
  const left = (t: any) => { const d = Math.max(0, Math.ceil((t + BIN_DAYS * DAY - Date.now()) / DAY)); return d <= 1 ? uiText('bin.removedWithinDay', 'removed within a day') : uiText('bin.removedInDays', 'removed in {n} days', { n: d }); };
  // The bin: one row per file, or per folder deleted as a whole (restored or removed together).
  function openBin() {
    if ($('#binDlg')) return;
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'td-dialog'; root.id = 'binDlg';
    document.body.appendChild(root);
    const KIND_WORD: Record<string, any> = { page: caption(captions["ui.page"]), board: caption(captions["ui.whiteboard"]), classic: caption(captions["ui.classic"]) };
    const inFolder = (f: string) => f ? ' · ' + uiText('bin.inFolder', 'in {folder}', { folder: f }) : '';
    const draw = () => {
      const items = purgeBin().slice().sort((a, b) => b.deleted - a.deleted), rows = [], seen = new Set();
      for (const x of items) {
        if (x.batch) {
          if (seen.has(x.batch)) continue;
          seen.add(x.batch);
          const g = items.filter((y) => y.batch === x.batch);
          rows.push({ ids: g.map((y) => y.id), ic: FOLDER_IC, name: leafOf(x.folder), detail: `${g.length === 1 ? uiText('bin.files.one', '1 file') : uiText('bin.files.many', '{n} files', { n: g.length })} · ${KIND_WORD[x.kind]}${inFolder(folderOf(x.folder))}`, t: x.deleted });
        } else rows.push({ ids: [x.id], ic: KIND_IC[x.kind] || KIND_IC.classic, name: leafOf(x.name), detail: `${KIND_WORD[x.kind]}${inFolder(folderOf(x.name))}`, t: x.deleted });
      }
      renderSvelteView(root, BinDialog, { title: caption(captions["ui.recycle.bin"]),
        sub: uiText('bin.sub', 'Deleted files and folders stay here for {days} days, then they are removed for good.', { days: BIN_DAYS }),
        emptyLabel: uiText('bin.empty', 'Empty Bin…'), canEmpty: rows.length > 0, doneLabel: caption(captions["ui.done"]),
        list: { empty: uiText('bin.isEmpty', 'The Recycle Bin is empty.'),
        rows: rows.map((r) => ({ key: r.ids.join(','), attrs: { 'data-ids': r.ids.join(',') }, svg: r.ic, name: r.name,
          detail: `${r.detail} · ${uiText('bin.deletedWhen', 'deleted {ago}, {left}', { ago: ago(r.t), left: left(r.t) })}`,
          restore: { label: uiText('bin.restore', 'Restore') },
          acts: [{ class: 'bin-erase', icon: 'delete' as const, title: uiText('bin.deleteForGood', 'Delete for good'), label: uiText('bin.deleteForGood.aria', 'Delete {name} for good', { name: r.name }) }] })) } } satisfies BinDialogModel);
    };
    // the focus goes back at once; the dialog fades out, then goes
    const close = () => { root.id = ''; if (prev && prev.isConnected && (prev as HTMLElement).focus) (prev as HTMLElement).focus({ preventScroll: true }); fadeOutDialog(root, () => { destroyView(root); root.remove(); }); };
    draw();
    root.addEventListener('click', async (e) => {
      const li = (e.target! as Element).closest('li[data-ids]'), ids = li ? (li as HTMLElement).dataset.ids!.split(',') : [];
      if ((e.target! as Element).closest('.bin-done')) close();
      else if ((e.target! as Element).closest('.bin-restore')) { close(); restoreFromBin(ids); }
      else if ((e.target! as Element).closest('.bin-erase')) {
        const name = (li!.querySelector('b'))!.textContent;
        root.hidden = true;
        const yes = await TD.confirm(uiText('dlg.eraseBin.title', 'Delete "{name}" for good?', { name: name || '' }), ids.length > 1 ? uiText('dlg.eraseBin.many', "Its {n} files are removed from this browser. This can't be undone.", { n: ids.length }) : uiText('dlg.eraseBin.one', "It is removed from this browser. This can't be undone."), { ok: caption(captions["ui.delete"]), danger: true });
        root.hidden = false;
        if (yes) { eraseFromBin(ids); draw(); }
        (root.querySelector<HTMLElement>('.bin-restore') || root.querySelector<HTMLElement>('.bin-done'))?.focus();
      } else if ((e.target! as Element).closest('.bin-empty')) {
        const n = bin().length;
        root.hidden = true;
        const yes = await TD.confirm(uiText('dlg.emptyBin.title', 'Empty the Recycle Bin?'), n === 1 ? uiText('dlg.emptyBin.one', "1 file is removed from this browser. This can't be undone.") : uiText('dlg.emptyBin.many', "{n} files are removed from this browser. This can't be undone.", { n }), { ok: uiText('dlg.emptyBin.ok', 'Empty Bin'), danger: true });
        root.hidden = false;
        if (yes) { eraseFromBin(bin().map((x) => (x as any).id)); draw(); }
        ((root.querySelector('.bin-done'))! as HTMLElement).focus();
      }
    });
    for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, (e) => { e.stopPropagation(); if (e.target === root) { e.preventDefault(); close(); } });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('button:not([disabled])')], i = f.indexOf(document.activeElement!), n = f.length;
        e.preventDefault(); (f[(i + (e.shiftKey ? n - 1 : 1)) % n] as HTMLElement).focus();
      }
    });
    requestAnimationFrame(() => (root.querySelector<HTMLElement>('.bin-restore') || root.querySelector<HTMLElement>('.bin-done'))?.focus()); // closed within the frame: nothing to focus
  }
  // ---- Recovery copies of one file: the newest first, each restored in place or opened as a new file. ----
  const HIST_IC = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.8 8a5.2 5.2 0 101.5-3.7" fill="none" stroke="currentColor"/><path d="M2.4 2.4v2.8h2.8" fill="none" stroke="currentColor"/><path d="M8 5.2V8l2 1.2" fill="none" stroke="currentColor"/></svg>';
  const clockOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function whenOf(t: number) {
    const d = new Date(t), today = new Date(), y = new Date(today.getTime() - DAY);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    return same(d, today) ? uiText('time.todayAt', 'Today, {time}', { time: clockOf(t) }) : same(d, y) ? uiText('time.yesterdayAt', 'Yesterday, {time}', { time: clockOf(t) })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) }) + ', ' + clockOf(t);
  }
  function sinceOf(t: number) {
    const m = Math.round((Date.now() - t) / 6e4);
    return m < 1 ? uiText('time.justNow', 'just now') : m < 60 ? uiText('time.minAgo', '{n} min ago', { n: m }) : m < 60 * 24 ? uiText('time.hoursAgo', '{n} h ago', { n: Math.round(m / 60) }) : ago(t);
  }
  const sizeOf = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;
  function contentsOf(d: any) {
    const count = (n: number) => n === 1 ? uiText('count.objects.one', '1 object') : uiText('count.objects.many', '{n} objects', { n });
    if (d.kind === 'page') { const n = d.sheet?.shapes?.length || 0; return count(n); }
    const blocks = d.blocks || [], n = blocks.reduce((s: number, b: any) => s + (b.shapes?.length || 0), 0);
    const objects = count(n);
    return d.kind === 'board' || blocks.length < 2 ? objects : uiText('count.blocksObjects', '{blocks} blocks, {objects}', { blocks: blocks.length, objects });
  }
  const everyWord = (m: number) => m === 60 ? uiText('rec.everyHour', 'every hour') : m === 1 ? uiText('rec.everyMinute', 'every minute') : uiText('rec.everyMinutes', 'every {n} minutes', { n: m });
  // Put a copy back in place of the file. What the file holds now becomes a copy itself, so this is undone
  // by restoring that one. The name, view and place in the list stay as they are.
  function restoreRecovery(id: string, copy: RecoveryCopy) {
    const open = id === state.docId;
    if (open) { finishEdit(); finishPoly(); commit(); saveNow(); }
    const cur: any = store.get(LS_DOC + id, null), e: any = docEntry(id);
    if (!cur || !e) return;
    recovery.take(id, cur, e.updated, true);
    store.set(LS_DOC + id, { ...copy.doc, kind: cur.kind, name: cur.name, view: cur.view, mode: cur.mode });
    const idx: any[] = index(), it = idx.find((x) => x.id === id);
    if (it) { it.updated = Date.now(); store.set(LS_INDEX, idx); }
    if (open) { state.docId = null; openDoc(id); } else renderDocList();
    showHint(restoredHint(copy), 3200);
  }
  const restoredHint = (copy: RecoveryCopy) => copy.name ? uiText('hint.versionRestored', 'Restored the version "{name}". The state before it is kept in the version history.', { name: copy.name })
    : uiText('hint.recRestored', 'Restored the copy from {when}. The state before it is kept in the version history.', { when: whenOf(copy.at) });
  function openRecoveryCopy(id: string, copy: RecoveryCopy) {
    const e: any = docEntry(id);
    if (!e) return;
    let name = `${e.name} (${copy.name || whenOf(copy.at)})`;
    if (index().some((x) => x.name === name)) name = copyName(name);
    openDoc(storeCopy(copy.doc, name, id));
    showHint(uiText('hint.recOpened', 'Opened the copy as "{name}"', { name: leafOf(name) }), 1800);
  }
  // A saved version is marked with a bookmark; automatic copies with the clock.
  const VERSION_IC = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.5h7v11L8 11l-3.5 2.5z" fill="none" stroke="currentColor" stroke-linejoin="round"/></svg>';
  // How a copy differs from the file now, counted in objects (shapes are matched by id across the file's diagrams).
  function shapesOf(d: any) {
    const m = new Map<string, string>(), add = (list: any[] | undefined, at: string) => { for (const x of list || []) m.set(at + ':' + x.id, JSON.stringify(x)); };
    if (d.kind === 'page') add(d.sheet?.shapes, 's');
    else (d.blocks || []).forEach((b: any, i: number) => add(b.shapes, b.id || String(i)));
    return m;
  }
  function differenceOf(copy: any, now: any, nowShapes: Map<string, string>) {
    const content = (d: any) => JSON.stringify({ page: d.page, blocks: d.blocks, sheet: d.sheet });
    if (content(copy) === content(now)) return uiText('rec.diff.same', 'same as now');
    const mine = shapesOf(copy);
    let n = 0;
    for (const [k, v] of mine) if (nowShapes.get(k) !== v) n++;
    for (const k of nowShapes.keys()) if (!mine.has(k)) n++;
    return !n ? uiText('rec.diff.other', 'differs from now') : n === 1 ? uiText('rec.diff.one', '1 object differs from now') : uiText('rec.diff.many', '{n} objects differ from now', { n });
  }
  /** Keep what file `id` holds now as a saved version, asking for its name. */
  async function saveVersion(id?: string) {
    id = id || state.docId || undefined;
    if (!id || !docEntry(id)) return null;
    if (id === state.docId) { finishEdit(); finishPoly(); commit(); saveNow(); }
    const name = await TD.prompt(uiText('dlg.saveVersion.title', 'Save Version'), '', { ok: uiText('dlg.saveVersion.ok', 'Save'), placeholder: uiText('dlg.saveVersion.placeholder', 'Name, e.g. Before review') });
    if (name == null) return null;
    const cur = store.get<Record<string, unknown> | null>(LS_DOC + id, null);
    if (!cur) return null;
    const v = recovery.save(id, cur, docEntry(id)?.updated, String(name).trim() || whenOf(Date.now()));
    showHint(uiText('hint.versionSaved', 'Saved the version "{name}". It is kept until you delete it.', { name: v.name! }), 3000);
    return v;
  }
  function openRecovery(id?: string) {
    id = id || state.docId || undefined;
    if (!id || !docEntry(id) || $('#recDlg')) return;
    if (id === state.docId) saveNow(); // the open file's latest edit is in storage, not mistaken for a copy
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'td-dialog'; root.id = 'recDlg';
    const opts = (vals: number[], word: (v: number) => string) => vals.map((v) => ({ value: String(v), label: word(v) }));
    document.body.appendChild(root);
    let copies: RecoveryCopy[] = [], usage = '', usageHigh = false;
    // how much of the browser's storage the app uses, read once (the browser answers later)
    navigator.storage?.estimate?.().then((e) => {
      if (!e.quota) return;
      usage = uiText('rec.usage', 'DiagramTeX uses {used} of the {quota} this browser allows.', { used: sizeOf(e.usage || 0), quota: sizeOf(e.quota) });
      usageHigh = (e.usage || 0) > 0.8 * e.quota;
      if (root.isConnected) draw();
    }).catch(() => {});
    const draw = () => {
      const e: any = docEntry(id!), s = recoverySettings();
      copies = recovery.list(id!);
      const now: any = store.get(LS_DOC + id!, {}), nowShapes = shapesOf(now);
      const total = copies.reduce((n, c) => n + JSON.stringify(c.doc).length, 0);
      const nm = leafOf(e.name);
      const sub = !s.every ? uiText('rec.sub.off', 'Copies of "{name}" are no longer kept. Those below stay until the file is deleted for good.', { name: nm })
        : (s.every > RECOVERY_QUICK ? uiText('rec.sub.everyQuick', 'Earlier states of "{name}", kept on their own while you edit: one {every} at most, the newest {keep}, and one more in between, {quick}.', { name: nm, every: everyWord(s.every), keep: s.keep, quick: everyWord(RECOVERY_QUICK) })
          : uiText('rec.sub.every', 'Earlier states of "{name}", kept on their own while you edit: one {every} at most, the newest {keep}.', { name: nm, every: everyWord(s.every), keep: s.keep })) +
          ' ' + uiText('rec.sub.saved', 'Versions you save and name are kept until you delete them.') +
          (copies.length ? ' ' + uiText('rec.sub.size', 'They take {size} in this browser.', { size: sizeOf(total) }) : '');
      renderSvelteView(root, RecoveryDialog, { title: uiText('rec.title', 'Version History'), sub, doneLabel: caption(captions["ui.done"]),
        saveLabel: uiText('rec.saveVersion', 'Save Version…'), saveTitle: uiText('rec.saveVersion.title', 'Keep the file as it is now, under a name, until you delete it'),
        usage, usageHigh,
        every: { label: uiText('rec.keepCopy', 'Keep a copy'), aria: uiText('rec.keepCopy.aria', 'How often a copy is kept'), value: s.every, options: opts(RECOVERY_EVERY, (v) => v ? everyWord(v) : uiText('rec.never', 'never')) },
        keep: { label: uiText('rec.keepNewest', 'Keep the newest'), aria: uiText('rec.keepNewest.aria', 'How many copies are kept'), value: s.keep, options: opts(RECOVERY_KEEP, (v) => String(v)) },
        list: {
        empty: s.every ? uiText('rec.none.on', 'No copies yet. The first is kept when the file is next changed.') : uiText('rec.none.off', 'No copies yet. The first is kept when the file is next changed, once copies are turned on.'),
        rows: copies.map((c, i) => {
          const when = whenOf(c.at), size = sizeOf(JSON.stringify(c.doc).length), diff = differenceOf(c.doc, now, nowShapes);
          return { key: String(c.taken), attrs: { 'data-i': String(i) }, svg: c.name ? VERSION_IC : HIST_IC, name: c.name || when,
            detail: c.name ? `${when} · ${diff} · ${contentsOf(c.doc)} · ${size}` : `${sinceOf(c.at)} · ${diff} · ${contentsOf(c.doc)} · ${size}`,
            restore: { label: uiText('bin.restore', 'Restore'), title: uiText('rec.restore.title', 'Put this copy in place of the file. Its state now is kept as a copy.') },
            acts: [
              { class: 'rec-act rec-name', icon: 'rename' as const, title: c.name ? uiText('rec.rename', 'Rename Version…') : uiText('rec.name', 'Name and Keep…'),
                label: c.name ? uiText('rec.rename.aria', 'Rename the version {name}', { name: c.name }) : uiText('rec.name.aria', 'Name the copy from {when} and keep it', { when }) },
              { class: 'rec-act rec-open', icon: 'duplicate' as const, title: uiText('rec.openNew', 'Open as a new file'), label: uiText('rec.openNew.aria', 'Open the copy from {when} as a new file', { when }) },
              { class: 'rec-act rec-del', icon: 'delete' as const, title: uiText('rec.delete', 'Delete'), label: uiText('rec.delete.aria', 'Delete the copy from {when}', { when }) }] };
        }) } } satisfies RecoveryDialogModel);
    };
    // the focus goes back at once; the dialog fades out, then goes
    const close = () => { root.id = ''; if (prev && prev.isConnected && (prev as HTMLElement).focus) (prev as HTMLElement).focus({ preventScroll: true }); fadeOutDialog(root, () => { destroyView(root); root.remove(); }); };
    // a dialog over this one: this one hides meanwhile, then is drawn again and takes the focus back
    const over = async <T,>(ask: () => Promise<T>, focus = '.rec-save') => {
      root.hidden = true;
      const r = await ask();
      root.hidden = false; draw();
      root.querySelector<HTMLElement>(focus)?.focus();
      return r;
    };
    draw();
    root.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement, s = recoverySettings();
      if (t.name === 'every') s.every = +t.value; else if (t.name === 'keep') s.keep = +t.value; else return;
      store.set(LS_RECOVERY, s);
      // fewer copies kept: the oldest go now, in every file (those in the bin too)
      if (t.name === 'keep') recovery.trim([...index(), ...bin()].map((x) => x.id));
      draw();
    });
    root.addEventListener('click', (ev) => {
      const t = ev.target as Element, li = t.closest('li[data-i]'), c = li ? copies[+(li as HTMLElement).dataset.i!] : null;
      if (t.closest('.rec-done')) close();
      else if (t.closest('.rec-save')) void over(() => saveVersion(id));
      else if (c && t.closest('.bin-restore')) { close(); restoreRecovery(id!, c); }
      else if (c && t.closest('.rec-open')) { close(); openRecoveryCopy(id!, c); }
      else if (c && t.closest('.rec-name')) void over(async () => {
        const name = await TD.prompt(c.name ? uiText('dlg.renameVersion.title', 'Rename Version') : uiText('dlg.nameVersion.title', 'Name and Keep This Copy'), c.name || '',
          { ok: c.name ? uiText('dlg.renameVersion.ok', 'Rename') : uiText('dlg.nameVersion.ok', 'Keep'), placeholder: uiText('dlg.saveVersion.placeholder', 'Name, e.g. Before review') });
        // an empty name turns a version back into an automatic copy
        if (name != null && (String(name).trim() || c.name)) recovery.rename(id!, c.taken, String(name));
      });
      else if (c && t.closest('.rec-del')) void over(async () => {
        const yes = await TD.confirm(c.name ? uiText('dlg.deleteVersion.title', 'Delete the version "{name}"?', { name: c.name }) : uiText('dlg.deleteCopy.title', 'Delete the copy from {when}?', { when: whenOf(c.at) }),
          uiText('dlg.deleteVersion.body', "It is removed from this browser. This can't be undone."), { ok: caption(captions["ui.delete"]), danger: true });
        if (yes) recovery.remove(id!, c.taken);
      });
    });
    for (const ty of ['pointerdown', 'mousedown']) root.addEventListener(ty, (ev) => { ev.stopPropagation(); if (ev.target === root) { ev.preventDefault(); close(); } });
    root.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'Tab') {
        const f = [...root.querySelectorAll('button:not([disabled]), select')], i = f.indexOf(document.activeElement!), n = f.length;
        ev.preventDefault(); (f[(i + (ev.shiftKey ? n - 1 : 1)) % n] as HTMLElement).focus();
      }
    });
    requestAnimationFrame(() => (root.querySelector<HTMLElement>('.bin-restore') || root.querySelector<HTMLElement>('.rec-done'))?.focus()); // closed within the frame: nothing to focus
  }
  // Folders are only a way of showing names: a file named "Physics/Lab 1" is listed as "Lab 1" inside a
  // folder "Physics" (like a path in cloud storage). A folder exists while a file is in it; folded folders
  // are remembered (an app preference).
  const pathOf = (n: any) => String(n || '').split('/').map((s) => s.trim()).filter(Boolean);
  const leafOf = (n: any) => { const p = pathOf(n); return p.length ? p[p.length - 1] : String(n || ''); };
  const folderOf = (n: any) => pathOf(n).slice(0, -1).join('/');
  const joinPath = (folder: any, leaf: any) => (folder ? folder + '/' : '') + leaf;
  TD.leafName = leafOf;
  const LS_FOLDED = 'diagramtex.folded';
  let folded = new Set(store.get<string[]>(LS_FOLDED, [])), listShows: any = null;
  const foldKey = (path: any) => state.doc.kind + ':' + path;
  function setFolded(path: any, on: any) {
    if (on) folded.add(foldKey(path)); else folded.delete(foldKey(path));
    store.set(LS_FOLDED, [...folded]);
    renderDocList();
  }
  const KIND_IC: Record<string, any> = {
    page: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 1.5h9v13h-9z" fill="none" stroke="currentColor"/><path d="M6 5h4M6 7.5h2.5" fill="none" stroke="currentColor"/></svg>',
    board: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 3.5h13v9h-13z" fill="none" stroke="currentColor"/><path d="M4 9.5c1.5-3 3-3 4 0s2.5 3 4 0" fill="none" stroke="currentColor"/></svg>',
    classic: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 1.5H10l3.5 3.5v9.5h-10zM10 1.5V5h3.5" fill="none" stroke="currentColor" stroke-linejoin="miter"/></svg>',
  };
  const FOLDER_IC = '<svg class="fic" viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 3.5h4.5l1.5 1.5h7v8h-13z" fill="none" stroke="currentColor" stroke-linejoin="round"/></svg>';
  const CHEV_IC = '<svg class="chev" viewBox="0 0 16 16" width="12" height="12"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // How the sidebar sorts: the user's own order (dragging reorders), or by date created, date modified or name,
  // either way round (dragging only moves files between folders then). Files from before created dates were
  // kept count as created when last modified.
  const LS_SORT = 'diagramtex.fileSort';
  type SortBy = 'custom' | 'created' | 'modified' | 'name';
  let fileSort: { by: SortBy; dir: 'asc' | 'desc' } = { by: 'custom', dir: 'asc', ...store.get<any>(LS_SORT, {}) };
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const createdOf = (d: any) => d.created || d.updated || 0;
  function sortDocs(files: any[]) {
    const { by, dir } = fileSort, k = dir === 'desc' ? -1 : 1;
    if (by === 'custom') return files;
    const cmp = by === 'name' ? (a: any, b: any) => byName(leafOf(a.name), leafOf(b.name))
      : by === 'created' ? (a: any, b: any) => createdOf(a) - createdOf(b) : (a: any, b: any) => (a.updated || 0) - (b.updated || 0);
    return [...files].sort((a, b) => k * cmp(a, b));
  }
  // The sidebar lists only files of the current kind: folders first, then the files. Folders go A to Z, or by
  // name or by their newest file when sorted.
  function renderDocList() {
    const ul = $('#docList'), kind = state.doc.kind;
    $('#filesTitle').textContent = caption(({ page: captions["ui.pages"], board: captions["ui.whiteboards"], classic: captions["ui.classic.documents"] } as Record<string, any>)[kind]);
    const newName = caption(({ page: captions["ui.new.page"], board: captions["ui.new.whiteboard"], classic: captions["ui.new.classic.document"] } as Record<string, any>)[kind]);
    $('#btnNewDoc').title = newName; $('#btnNewDoc').setAttribute('aria-label', newName);
    const docs = index().filter((d) => ((d as any).kind || 'classic') === kind);
    // a file just opened is shown: the folders around it unfold
    if (state.docId && listShows !== state.docId) {
      listShows = state.docId;
      const cur: any = docs.find((d) => (d as any).id === state.docId), p = cur ? pathOf(cur.name).slice(0, -1) : [];
      let changed = false;
      for (let i = 1; i <= p.length; i++) { const k = foldKey(p.slice(0, i).join('/')); if (folded.delete(k)) changed = true; }
      if (changed) store.set(LS_FOLDED, [...folded]);
    }
    const root = { dirs: new Map(), files: ([] as any[]) };
    for (const d of docs) {
      const p = pathOf((d as any).name);
      let node = root;
      for (const seg of p.slice(0, -1)) { if (!node.dirs.has(seg)) node.dirs.set(seg, { dirs: new Map(), files: [] }); node = node.dirs.get(seg); }
      node.files.push(d);
    }
    const count = (n: any) => n.files.length + [...n.dirs.values()].reduce((a, c) => a + count(c), 0);
    const holds = (n: any) => n.files.some((d: any) => d.id === state.docId) || [...n.dirs.values()].some(holds);
    const out: FileRow[] = [], { by, dir } = fileSort, k = dir === 'desc' && by !== 'custom' ? -1 : 1;
    const newest = (n: any): number => Math.max(0, ...n.files.map((d: any) => (by === 'created' ? createdOf(d) : d.updated || 0)), ...[...n.dirs.values()].map(newest));
    const dirCmp = (a: any, b: any) => (by === 'created' || by === 'modified' ? k * (newest(a[1]) - newest(b[1])) || byName(a[0], b[0]) : k * byName(a[0], b[0]));
    $('#docList').classList.toggle('sorted', by !== 'custom');
    const delFile = caption(captions["ui.delete"]);
    const walk = (node: any, path: any, depth: any) => {
      for (const [name, sub] of [...node.dirs].sort(dirCmp)) {
        const fp = joinPath(path, name), shut = folded.has(foldKey(fp));
        out.push({ key: 'f:' + fp, folder: fp, name, depth, shut, hasActive: shut && holds(sub), svg: CHEV_IC + FOLDER_IC,
          title: count(sub) === 1 ? uiText('files.folder.title.one', '{path} (1 file)', { path: fp }) : uiText('files.folder.title.many', '{path} ({n} files)', { path: fp, n: count(sub) }),
          del: { title: uiText('files.deleteFolder', 'Delete folder'), label: uiText('files.deleteFolder.aria', 'Delete folder {name}', { name }) } });
        if (!shut) walk(sub, fp, depth + 1);
      }
      for (const d of sortDocs(node.files)) {
        out.push({ key: 'd:' + d.id, doc: d.id, name: leafOf(d.name), depth, active: d.id === state.docId, svg: KIND_IC[kind] || KIND_IC.classic,
          del: { title: delFile, label: delFile } });
      }
    };
    walk(root, '', 0);
    renderSvelteView(ul, FileList, { rows: out, renaming: fileRenaming, nameLabel: { file: uiText('files.fileName', 'File name'), folder: uiText('files.folderName', 'Folder name') },
      click: fileClick, remove: (row: FileRow) => (row.folder !== undefined ? deleteFolder(row.folder) : deleteDoc(row.doc)),
      rename: fileRename, renameEnd: () => { fileRenaming = null; renderDocList(); } } satisfies FileListModel);
  }
  // A click opens a file or folds a folder; a second click on the same row within 400ms (or a double-click) renames
  // it in place instead, a folder going back to the fold it had before the first click.
  let fileRenaming: string | null = null; // the key of the row being renamed (FileList)
  let lastDocClick: { t: number; folder?: string; doc?: string; shut?: boolean } = { t: 0 };
  function fileClick(row: FileRow, e: MouseEvent | KeyboardEvent) {
    const now = Date.now(), mouse = e instanceof MouseEvent;
    if (row.folder !== undefined) {
      const path = row.folder;
      if (mouse && !(e.target as Element)?.closest?.('.chev') && (e.detail >= 2 || (lastDocClick.folder === path && now - lastDocClick.t < 400))) {
        const shut = lastDocClick.folder === path ? lastDocClick.shut! : !!row.shut;
        lastDocClick = { t: 0 };
        setFolded(path, shut);
        renameFolderInList(path);
        return;
      }
      lastDocClick = mouse ? { t: now, folder: path, shut: !!row.shut } : { t: 0 };
      setFolded(path, !row.shut);
      return;
    }
    const id = row.doc!;
    if (mouse && (e.detail >= 2 || (lastDocClick.doc === id && now - lastDocClick.t < 400))) {
      lastDocClick = { t: 0 };
      renameInList(id);
      return;
    }
    lastDocClick = mouse ? { t: now, doc: id } : { t: 0 };
    if (id !== state.docId) openDoc(id);
  }
  function fileRename(row: FileRow, v: string) {
    if (row.folder !== undefined) {
      const parent = pathOf(row.folder).slice(0, -1).join('/');
      if (v && v !== leafOf(row.folder)) renameFolder(row.folder, joinPath(parent, v));
      return;
    }
    const full = docEntry(row.doc)?.name || row.name;
    if (v && v !== leafOf(full)) renameDoc(row.doc, joinPath(folderOf(full), v)); // a "/" typed here makes a folder inside this one
  }
  // Move a file into a folder ('' is the top level), keeping its own name; a name taken there gets "copy".
  function moveToFolder(id: any, folder: any) {
    const it: any = docEntry(id);
    if (!it) return;
    folder = pathOf(folder).join('/');
    if (folderOf(it.name) === folder) return;
    let name = joinPath(folder, leafOf(it.name));
    const taken = new Set(index().filter((d) => (d as any).id !== id).map((d) => (d as any).name));
    if (taken.has(name)) { let k = 1; const b = name; name = `${b} copy`; while (taken.has(name)) name = `${b} copy ${++k}`; }
    renameDoc(id, name);
    renderDocList();
    showHint(folder ? uiText("hint.moved", 'Moved "{name}" to {folder}', { name: leafOf(name), folder }) : uiText('hint.movedOut', 'Moved "{name}" out of its folder', { name: leafOf(name) }), 1400);
  }
  // Rename a folder: every file of this kind inside it (and in folders inside it) changes its path.
  function renameFolder(path: any, to: any) {
    to = pathOf(to).join('/');
    if (!to || to === path) return;
    const kind = state.doc.kind, pre = path + '/';
    const wasShut = folded.has(foldKey(path));
    for (const d of index().filter((x) => ((x as any).kind || 'classic') === kind && pathOf((x as any).name).join('/').startsWith(pre)))
      renameDoc((d as any).id, to + '/' + pathOf((d as any).name).join('/').slice(pre.length));
    for (const k of [...folded]) if (k === foldKey(path) || (k as any).startsWith(foldKey(pre))) { folded.delete(k); folded.add(foldKey(to) + (k as any).slice(foldKey(path).length)); }
    if (wasShut) folded.add(foldKey(to));
    store.set(LS_FOLDED, [...folded]);
    renderDocList();
  }
  function renameFolderInList(path: any) {
    if (!$(`#docList li[data-folder="${CSS.escape(path)}"]`)) return;
    fileRenaming = 'f:' + path;
    renderDocList();
  }
  async function newFolder(parent: any) {
    const name = await TD.prompt(uiText('dlg.newFolder.title', 'New Folder'), '', { ok: caption(captions["ui.create"]), placeholder: uiText('files.folderName', 'Folder name') });
    if (name == null || !pathOf(name).length) return;
    const folder = joinPath(parent || '', pathOf(name).join('/'));
    newDoc(joinPath(folder, NEW_NAME[state.doc.kind]), null, null, null, null, state.doc.kind);
  }

  // ---------------- view ----------------
  type StageSize = { w: number; h: number; left: number; top: number };
  let viewGeometry: { stage: StageSize; rulerWidth: number; rulerHeight: number } | null = null;
  function stageSize(): StageSize {
    if (viewGeometry) return viewGeometry.stage;
    const r = svg.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }
  // A synchronous view update reads its geometry before changing SVG attributes.
  // Navigation, rulers, culling and page layers share that snapshot, rather than
  // forcing layout of every SVG label between their writes. It never survives
  // the update: a later input/resize always measures the current viewport.
  function withViewGeometry(update: () => void): void {
    if (viewGeometry) { update(); return; }
    const stage = stageSize();
    viewGeometry = {
      stage,
      rulerWidth: $('#rulerX').clientWidth,
      rulerHeight: $('#rulerY').clientHeight,
    };
    try { update(); } finally { viewGeometry = null; }
  }
  function toWorld(e: any) {
    const r = stageSize();
    return { x: (e.clientX - r.left) / state.view.zoom + state.view.x, y: (e.clientY - r.top) / state.view.zoom + state.view.y };
  }
  // the middle of the visible canvas, left of the floating panel column
  function viewCentre() { const r = fitArea(), v = state.view; return { x: v.x + r.w / 2 / v.zoom, y: v.y + r.h / 2 / v.zoom }; }
  function toScreen(p: any) { return { x: (p.x - state.view.x) * state.view.zoom, y: (p.y - state.view.y) * state.view.zoom }; }
  function applyView(rulers = true) {
    const r = stageSize(), v = state.view;
    const w = r.w / v.zoom, h = r.h / v.zoom;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${w} ${h}`);
    svg.style.setProperty('--hitw', 14 / v.zoom + 'px');
    svg.style.setProperty('--zoom', v.zoom); // marks that keep their size on screen (the frames of kept TikZ code)
    for (const id of ['#paper', '#gridRect']) {
      const el = $(id);
      el.setAttribute('x', v.x); el.setAttribute('y', v.y); el.setAttribute('width', w); el.setAttribute('height', h);
    }
    $('#origin').setAttribute('d', `M${v.x},0H${v.x + w}M0,${v.y}V${v.y + h}`);
    updateGridPattern();
    { const zv = $('#zoomVal'); if (document.activeElement !== zv) zv.value = Math.round(v.zoom * 100) + '%'; }
    updatePageNav();
    if (rulers) drawRulers();
    if (editing) positionEditor();
  }

  const gridStyle = () => state.gridStyle;
  function updateGridPattern() {
    const style = gridStyle(), z = state.view.zoom;
    let step = TD.GRID;
    const dots = style === 'dot' || style === 'isometric-dot';
    while (step * z < (dots || style.startsWith('isometric') ? 18 : 7)) step *= 2;
    const iso = style.startsWith('isometric'), w = iso ? Math.sqrt(3) * step : step, h = step;
    const id = style === 'grid' ? 'gridMajor' : style === 'dot' ? 'gridDots' : style === 'isometric' ? 'gridIsometric' : 'gridIsometricDots';
    $('#gridRect').setAttribute('fill', `url(#${id})`);
    if (style !== 'grid') {
      const pat = $('#' + id);
      pat.setAttribute('width', w); pat.setAttribute('height', h);
      pat.setAttribute('x', dots ? -w / 4 : 0); pat.setAttribute('y', dots ? -h / 4 : 0);
      if (dots) pat.querySelectorAll('circle').forEach((c: any, i: number) => {
        c.setAttribute('cx', w * (i ? .75 : .25)); c.setAttribute('cy', h * (i ? .75 : .25)); c.setAttribute('r', 1.2 / z);
      });
      else pat.querySelector('path').setAttribute('d', `M0,0L${w},${h}M0,${h}L${w},0M0,0V${h}M${w / 2},0V${h}`);
    }
    updateGridSelection();
  }
  function updateGridSelection() {
    $('#gridStyle').querySelectorAll('[data-grid-style]').forEach((b: HTMLButtonElement) => {
      const remembered = b.dataset.gridStyle === state.gridStyle, on = state.grid && remembered;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = remembered ? 0 : -1;
    });
  }
  let navPage = -1;
  function updatePageNav() {
    const nav = $('#pageNav');
    nav.hidden = state.mode !== 'page';
    if (nav.hidden) return;
    const G = pageGeom(), k = currentPage();
    $('#pageNavVal').textContent = uiText('page.nav', 'Page {n} / {total}', { n: k + 1, total: G.n });
    $('#pagePrev').disabled = k === 0; $('#pageNext').disabled = k === G.n - 1;
    // keep the highlighted page in the panel in step with scrolling
    if (k !== navPage) { navPage = k; document.querySelectorAll('#props .pg-item').forEach((el) => el.classList.toggle('on', +(el as HTMLElement).dataset.k! === k)); }
  }
  $('#pagePrev').onclick = () => goToPage(currentPage() - 1);
  $('#pageNext').onclick = () => goToPage(currentPage() + 1);
  $('#pageAdd').onclick = () => insertPage(currentPage() + 1);

  // ---------------- rulers: TikZ centimetres along the sheet edges (y up) ----------------
  const RULER = 18;
  let cursorW: any = null; // last pointer position in world coords
  function rulerStep(pxPerCm: any) {
    for (const st of [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]) if (st * pxPerCm >= 56) return st;
    return 1000;
  }
  function fmtCm(c: any) { return String(+c.toFixed(2)).replace('-', '−'); }
  function drawRulers(): void {
    if (!viewGeometry) return withViewGeometry(drawRulers);
    const rx = $('#rulerX svg'), ry = $('#rulerY svg');
    if (!rx || state.mode === 'document') return;
    const pageY = state.mode === 'page'; // page mode: y measured downwards from the top of the sheet
    const v = state.view, z = v.zoom, ppc = PX * z, r = stageSize();
    if (r.w <= RULER || r.h <= RULER + 24 || !(z > 0)) return;
    const step = rulerStep(ppc), m = +String(step).replace(/^0\.|0+$/g, '')[0];
    const sub = step / (m === 5 ? 5 : 4);
    const minorOk = sub * ppc >= 5;
    // world cm → ruler-local px
    const X = (c: any) => (c * PX - v.x) * z - RULER;
    const Y = (c: any) => (-c * PX - v.y) * z - RULER;
    const span = (lo: any, hi: any, f: any, len: any) => {
      const out = [], a = Math.floor(lo / sub) - 1, b = Math.ceil(hi / sub) + 1;
      for (let i = a; i <= b; i++) {
        const c = i * sub, major = Math.abs(c / step - Math.round(c / step)) < 1e-6;
        if (!major && !minorOk) continue;
        const half = Math.abs(c / (step / 2) - Math.round(c / (step / 2))) < 1e-6;
        out.push({ c, pos: Math.round(f(c)) + 0.5, major, len: major ? len : half && m !== 5 ? len * 0.45 : len * 0.28 });
      }
      return out;
    };
    const sel = selected(), sb = sel.length ? unionBox(sel) : null;
    // horizontal
    // Match the ruler length exactly. Its border reduces the cross-axis viewport to 17px;
    // preserving aspect ratio would also shrink the entire scale by 17/18.
    const wX = viewGeometry.rulerWidth || r.w - RULER, x0 = (v.x + RULER / z) / PX, x1 = (v.x + r.w / z) / PX;
    let h = '';
    if (sb) { const a = (sb.x - v.x) * z - RULER, b = (sb.x + sb.w - v.x) * z - RULER;
      h += `<rect class="span" x="${a}" y="0" width="${b - a}" height="${RULER}"/><path class="span-edge" d="M${Math.round(a) + .5},0V${RULER}M${Math.round(b) + .5},0V${RULER}"/>`; }
    let d = '';
    for (const t of span(x0, x1, X, RULER)) {
      d += `M${t.pos},${RULER}v${-t.len}`;
      if (t.major) h += `<text x="${t.pos + 3}" y="9">${fmtCm(t.c)}</text>`;
    }
    h = `<path class="tk" d="${d}"/>` + h;
    h += `<path class="cur" d="${rulerCursor('x')}"/>`;
    rx.setAttribute('viewBox', `0 0 ${wX} ${RULER}`); rx.setAttribute('preserveAspectRatio', 'none'); rx.innerHTML = h;
    // vertical (TikZ y = −world y / PX)
    const hY = viewGeometry.rulerHeight || r.h - RULER - 24, yTop = -(v.y + RULER / z) / PX, yBot = -(v.y + r.h / z) / PX;
    h = ''; d = '';
    if (sb) { const a = (sb.y - v.y) * z - RULER, b = (sb.y + sb.h - v.y) * z - RULER;
      h += `<rect class="span" x="0" y="${a}" width="${RULER}" height="${b - a}"/><path class="span-edge" d="M0,${Math.round(a) + .5}H${RULER}M0,${Math.round(b) + .5}H${RULER}"/>`; }
    for (const t of span(yBot, yTop, Y, RULER)) {
      d += `M${RULER},${t.pos}h${-t.len}`;
      if (t.major) h += `<text transform="translate(9 ${t.pos - 3}) rotate(-90)">${fmtCm(pageY ? -t.c : t.c)}</text>`;
    }
    h = `<path class="tk" d="${d}"/>` + h;
    h += `<path class="cur" d="${rulerCursor('y')}"/>`;
    ry.setAttribute('viewBox', `0 0 ${RULER} ${hY}`); ry.setAttribute('preserveAspectRatio', 'none'); ry.innerHTML = h;
  }
  // the pointer's mark on each ruler: a pointer move changes only this, so it moves without redrawing the ticks
  function rulerCursor(axis: 'x' | 'y'): string {
    if (!cursorW) return '';
    const v = state.view, c = Math.round((cursorW[axis] - v[axis]) * v.zoom - RULER) + .5;
    return axis === 'x' ? `M${c},0V${RULER}` : `M0,${c}H${RULER}`;
  }
  function moveRulerCursor(): void {
    const cx = $('#rulerX svg .cur'), cy = $('#rulerY svg .cur');
    if (!cx || !cy || state.mode === 'document') { drawRulers(); return; }
    cx.setAttribute('d', rulerCursor('x')); cy.setAttribute('d', rulerCursor('y'));
  }
  function updateStatus() {
    const sel = selected(), el = $('#selInfo');
    if (!el) return;
    if (!sel.length) el.textContent = '';
    else { const b = unionBox(sel); el.textContent = uiText('status.selected', '{n} selected · {w} × {h} cm', { n: sel.length, w: r2(b.w / PX), h: r2(b.h / PX) }); }
    const gv = $('#gridVal');
    if (document.activeElement !== gv) gv.value = fmtGrid();
    $('#snapInfo').textContent = snapMode() === 'objects' ? uiText('snap.statusObjects','snap objects') : snapMode() === 'grid' ? uiText('snap.statusGrid','snap grid') : snapMode() === 'both' ? uiText('snap.statusBoth','snap both') : caption(captions['ui.snap.off']);
  }
  // Grid spacing: TD.GRID (px) drives snapping, nudging and paste offsets; the canvas pattern follows.
  // Major lines stay on whole centimetres when the spacing divides 1 cm, else every 4th line.
  const fmtGrid = () => String(+state.gridCm.toFixed(3));
  function applyGrid() {
    const g = state.gridCm * PX, n = 1 / state.gridCm, major = state.gridCm >= 1 ? g : Math.abs(n - Math.round(n)) < 1e-6 ? PX : 4 * g;
    TD.GRID = g;
    const mi = $('#gridMinor'), ma = $('#gridMajor');
    mi.setAttribute('width', g); mi.setAttribute('height', g); mi.querySelector('path').setAttribute('d', `M${g} 0H0V${g}`);
    ma.setAttribute('width', major); ma.setAttribute('height', major);
    const r = ma.querySelector('rect'); r.setAttribute('width', major); r.setAttribute('height', major);
    ma.querySelector('path').setAttribute('d', `M${major} 0H0V${major}`);
    updateGridPattern();
  }
  // Standard cursors for handles: edge/corner handles resize along their axis (turned with the shape's
  // rotation, snapped to the four system resize cursors); point handles (ends, vertices, arc ends) move.
  const HANDLE_DIR: Record<string, any> = { e: 0, ne: 45, n: 90, nw: 135, w: 180, sw: 225, s: 270, se: 315, tw: 0, r: 0 };
  const RESIZE_CUR = ['ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'];
  function handleCursor(s: any, k: any) {
    if (s.type === 'arc' && k === 'rad') { const m = ((s.a1 + s.a2) / 2) * Math.PI / 180, a = Math.atan2((s.ry > 0 ? s.ry : s.r) * Math.sin(m), s.r * Math.cos(m)) * 180 / Math.PI + (+s.angle || 0); return RESIZE_CUR[Math.round(((a % 180) + 180) % 180 / 45) % 4]; } // along the radius
    if (s.type === 'arc' && (k === 'rx' || k === 'ry')) return RESIZE_CUR[Math.round(((((k === 'rx' ? 0 : 90) + (+s.angle || 0)) % 180) + 180) % 180 / 45) % 4];
    if (s.type === 'line' && k === 'mid') return (TD.routeDir(s) === 'hh') !== TD.elbowFlat(s) ? 'ew-resize' : 'ns-resize'; // an elbow's middle slides across (out sideways when its ends are level)
    if (!(k in HANDLE_DIR)) return 'move';
    const a = (((HANDLE_DIR[k] + (s.angle || 0)) % 180) + 180) % 180;
    return RESIZE_CUR[Math.round(a / 45) % 4];
  }
  function zoomAt(factor: any, sx: any, sy: any) {
    const v = state.view;
    const nz = Math.min(8, Math.max(state.mode === 'board' ? 0.03 : 0.1, v.zoom * factor));
    const wx = sx / v.zoom + v.x, wy = sy / v.zoom + v.y;
    v.zoom = nz; v.x = wx - sx / nz; v.y = wy - sy / nz;
    renderView();
  }
  // The canvas is hidden in Document view: a fit asked for there waits until the canvas shows.
  let fitLater = false;
  // The part of the stage not covered by the panel column on the right: fits centre in it, so the drawing or
  // page sits in the clear space rather than half under Properties.
  function fitArea() {
    const r = stageSize(), rc = $('#rightCol');
    let w = r.w;
    if (rc && rc.offsetWidth) { const q = rc.getBoundingClientRect(); if (q.left > r.left && q.left < r.left + r.w) w = q.left - r.left; }
    return { w: Math.max(120, w), h: r.h };
  }
  // Fit the whole page or drawing; with `width`, fit only its width and show it from the top.
  function zoomFit(width?: any) {
    width = width === true;
    if (state.mode === 'document') { fitLater = true; return; }
    const r = fitArea();
    if (state.mode === 'page') {
      const b = sheetBox(), ph = Math.min(b.h, pageGeom().h);
      const z = Math.max(0.1, Math.min(width ? 8 : 3, (r.w - 60) / b.w, width ? Infinity : (r.h - 60) / ph));
      state.view = { zoom: z, x: b.x + b.w / 2 - r.w / 2 / z, y: width ? -30 / z : ph / 2 - r.h / 2 / z };
      render(); return;
    }
    if (!shapes().length) { state.view = { x: -60, y: -60, zoom: 1 }; render(); return; }
    const b = TD.bboxOf(shapes().flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }));
    // as far out as zooming by hand goes (a Whiteboard 3%), so Fit always brings everything into view
    const z = Math.max(state.mode === 'board' ? 0.03 : 0.1, Math.min(width ? 8 : 3, (r.w - 80) / Math.max(b.w, 1), width ? Infinity : (r.h - 80) / Math.max(b.h, 1)));
    state.view = { zoom: z, x: b.x + b.w / 2 - r.w / 2 / z, y: width ? b.y - 40 / z : b.y + b.h / 2 - r.h / 2 / z };
    render();
  }
  const zoomFitWidth = () => zoomFit(true);

  // Construction guides belong to the active diagram/sheet, never exported drawing objects.
  function nativeNodeSections(sel: Shape[]): FormSection[] {
    if (sel.length !== 1) return [];
    const s = sel[0], options = TD.nodeFeatures.placements.map((k: string) => [k, placeName(k)]);
    const field = (key: string, label: string, fallback: any = '', numeric = false) => row(label, { kind: 'input' as const, value: s[key] ?? fallback, attrs: { type: numeric ? 'number' : 'text', 'data-native': key, ...(numeric ? { min: 0, step: 1 } : { 'data-tx': key === 'nodeName' ? '' : 'text' }) } }, ...(numeric ? [{ kind: 'text' as const, text: 'px', class: 'val' }] : []));
    const place = (key: string, label: string) => row(label, { kind: 'select' as const, value: s[key] || (key==='nodePinPosition'?'right':'above'), options, attrs: { 'data-native': key } });
    if (TD.nodeFeatures.types.has(s.type)) return [section(uiText('native.node', 'TikZ node'), [
      field('nodeName', uiText('native.name', 'Node name'), s.tex?.nm?.[0] || ''),
      ...(s.type !== 'text' ? [field('nodeText', uiText('native.text', 'Node text'))] : []),
      field('nodeLabel', uiText('native.label', 'Node label')), place('nodeLabelPosition', uiText('native.labelPosition', 'Label position')),
      field('nodePin', uiText('native.pin', 'Pin')), place('nodePinPosition', uiText('native.pinPosition', 'Pin position')),
      field('nodePinDistance', uiText('native.pinDistance', 'Pin distance'), 24, true),
    ], 'sec native-node')];
    if (!CONNECT.has(s.type)) return [];
    const nodes = shapes().filter(n => n.id !== s.id && TD.nodeFeatures.types.has(n.type));
    return [section(uiText('native.attachments', 'Node anchors'), ['link1','link2'].flatMap((key, i) => [
      row(i ? uiText('native.end', 'End node') : uiText('native.start', 'Start node'), { kind: 'select' as const, value: s[key]?.id || '', options: [['', uiText('native.detached', 'Detached')], ...nodes.map(n => [n.id, n.nodeName || n.name || typeName(n.type) + ' ' + n.id])], attrs: { 'data-native-link': key } }),
      row(uiText('native.anchor', 'Anchor'), { kind: 'select' as const, value: s[key] ? TD.nodeFeatures.anchorName(s[key].u,s[key].v,byId(s[key].id)?.type) || 'custom' : 'center', options: [...TD.nodeFeatures.anchors.map((a: string)=>[a, anchorName(a)]), ['custom', uiText('native.customAnchor', 'Custom border point')]], attrs: { 'data-native-anchor': key, disabled: !s[key] } }),
    ]), 'sec native-anchors')];
  }
  function applyNativeField(t: any, final: boolean) {
    if (!t.dataset.native && !t.dataset.nativeLink && !t.dataset.nativeAnchor) return false;
    const s = selected()[0]; if (!s) return true;
    const key = t.dataset.native;
    if (key === 'nodeName') {
      const value = t.value.trim();
      const invalid = value && (!TD.nodeFeatures.validName(value) || shapes().some(q => q !== s && TD.nodeFeatures.nameOf(q) === value));
      t.classList.toggle('bad', !!invalid);
      if (invalid) { t.title = uiText('native.invalidName', 'Use a unique name starting with a letter; letters, digits, _ and - are allowed.'); return true; }
      t.removeAttribute('title');
    }
    if (key === 'nodePinDistance' && (!t.value.trim() || !Number.isFinite(+t.value) || +t.value < 0)) return true;
    begin();
    if (key) { const value = key === 'nodePinDistance' ? +t.value : key === 'nodeName' ? t.value.trim() : t.value; if (value === '') delete s[key]; else s[key] = value; }
    else if (t.dataset.nativeLink) { const link = t.dataset.nativeLink; if (!t.value) delete s[link]; else { const [u,v] = TD.nodeFeatures.anchorUV(link === 'link1' ? 'east' : 'west'); s[link] = { id:t.value,u,v }; } }
    else if (t.value !== 'custom' && s[t.dataset.nativeAnchor]) { const [u,v] = TD.nodeFeatures.anchorUV(t.value,byId(s[t.dataset.nativeAnchor].id)?.type); Object.assign(s[t.dataset.nativeAnchor],{u,v}); }
    render();
    const native = nativeNodeSections(selected())[0];
    if (native && propertiesView) propertiesView.updateAfter(propertyAfter.map(section => section.class.includes('native-') ? native : section));
    if (final) { commit(); if (!key || key.endsWith('Position')) renderProps(); }
    return true;
  }
  function updateGuidesButton() {
    const button = $('#btnGuides');
    const text = guideMode === 'show' ? uiText('assist.showGuides', 'Show guide') : guideMode === 'locked' ? uiText('assist.lockGuides', 'Show and lock guide') : uiText('assist.noGuides', 'No guide');
    button.dataset.guideMode = guideMode; button.title = text; button.setAttribute('aria-label',text);
    button.setAttribute('aria-pressed',String(guideMode !== 'off')); button.classList.toggle('on',guideMode !== 'off');
    setIcon(button.querySelector('svg'), guideMode === 'locked' ? 'guidesLocked' : 'guides');
    document.body.classList.toggle('guides-editable',guideMode === 'show');
  }
  function removeGuide(id: string, all = false) {
    if (guideMode !== 'show' || !home().guides?.some(g=>g.id===id)) return;
    begin(); home().guides = all ? [] : home().guides!.filter(g=>g.id!==id); selectedGuide = null;
    commit(); renderOverlay();
  }
  async function editGuide(id: string) {
    if (guideMode !== 'show') return;
    const owner = home(), guide = owner.guides?.find(g=>g.id===id); if (!guide) return;
    const v = state.view, size = stageSize(), canvas = svg.getBoundingClientRect(), panel = $('#rightCol').getBoundingClientRect(), sign = guide.axis === 'x' ? 1 : -1;
    const end = guide.axis === 'x' ? (panel.width && panel.left > canvas.left+64 ? Math.min(size.w,panel.left-canvas.left-8) : size.w) : size.h-24;
    const lo = v[guide.axis] + 30/v.zoom, hi = Math.max(lo,v[guide.axis] + (end-12)/v.zoom);
    const limits = [lo/PX*sign,hi/PX*sign].sort((a,b)=>a-b);
    const response = TD.prompt(uiText('assist.editGuide', 'Edit position'),String(r2(guide.position/PX*sign)),{message:uiText('assist.guideRange', 'Position in cm ({min} to {max}). Values are limited to the visible canvas.',{min:r2(limits[0]),max:r2(limits[1])})});
    const input = document.querySelector('.td-dialog .tdd-in') as HTMLInputElement | null;
    if (input) { input.type='number'; input.min=String(limits[0]); input.max=String(limits[1]); input.step='any'; }
    const value = await response;
    if (value == null || !String(value).trim() || !Number.isFinite(Number(value)) || home() !== owner || !owner.guides?.includes(guide) || guideMode !== 'show') return;
    begin(); guide.position = Math.max(lo,Math.min(hi,Number(value)*PX*sign)); commit(); renderOverlay();
  }
  function addGuide(axis: 'x' | 'y', position: number): Guide {
    const guide = { id: uid(), axis, position }; (home().guides ||= []).push(guide); return guide;
  }
  for (const [id, axis] of [['#rulerX', 'y'], ['#rulerY', 'x']] as const) $(id).addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || state.mode === 'document' || inTool() || guideMode !== 'show') return;
    e.preventDefault(); finishEdit(); setTool('select'); begin();
    const point = toWorld(e), beforeGuides = clone(home().guides || null), guide = addGuide(axis, point[axis]);
    selectedGuide = guide.id; state.sel.clear(); drag = { mode: 'guide', guide, beforeGuides }; svg.setPointerCapture(e.pointerId); renderOverlay();
  });

  // ---------------- snapping ----------------
  const snapMode = (): SnapMode => state.snap ? state.snapMode : 'off';
  const snapObjects = () => snapMode() === 'objects' || snapMode() === 'both';
  const snapGrid = () => snapMode() === 'grid' || snapMode() === 'both';
  function cycleSnapMode() {
    state.snapMode = SNAP_MODES[(SNAP_MODES.indexOf(snapMode())+1)%SNAP_MODES.length];
    state.snap = state.snapMode !== 'off'; smartLines=[]; snapHint=null;
    savePrefs(); updateTopbar(); renderOverlay();
  }
  function updateSnapButton() {
    const mode = snapMode(), button = $('#btnSnap');
    const label = mode === 'objects' ? uiText('snap.objects','Snap to objects, guides and object anchors only') : mode === 'grid' ? uiText('snap.grid','Snap to grid only') : mode === 'both' ? uiText('snap.both','Snap to both') : uiText('snap.off',"Don't snap");
    button.dataset.snapMode = mode; button.title = label; button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(mode !== 'off')); button.classList.toggle('on',mode !== 'off');
    const svg = button.querySelector('svg');
    setIcon(svg, mode === 'objects' ? 'snapObjects' : mode === 'grid' ? 'snapGrid' : 'snap'); svg.dataset.snapIcon = mode; svg.setAttribute('aria-hidden','true');
  }
  // What a point (a new shape's corner, a line's end) snaps to: a shape's box without the half of its stroke that lies
  // outside the outline, so it lands where the outline (and TikZ's coordinate) is and shapes drawn in turn don't drift.
  // Moving shapes still lines up what is seen, the outside of the stroke (tests/snapping-modes.mjs).
  function snapBox(s: any) {
    const b = TD.nodeFeatures?.bodyBox(s) || TD.bbox(s);
    const p = s.type === 'text' ? 0 : Math.min(b.w, b.h, (s.width || 0) * (canScale(s) ? objectScale(s) : 1)) / 2;
    return p > 0 ? { x: b.x + p, y: b.y + p, w: b.w - 2 * p, h: b.h - 2 * p } : b;
  }
  function snapPoint(p: any, e: any, exclude?: any) {
    smartLines = [];
    if (!state.snap || (e && e.altKey)) return { x: p.x, y: p.y };
    if (!snapObjects()) return snapGrid() ? snapCanvasGrid(p,TD.GRID,gridStyle()) : {x:p.x,y:p.y};
    const thr = 8 / state.view.zoom;
    let best = null, bd = thr;
    for (const s of shapes()) {
      if (exclude && exclude.has(s.id)) continue;
      for (const a of TYPES[s.type].anchors(s)) {
        const d = dist(a, p);
        if (d < bd) { bd = d; best = a; }
      }
    }
    if (state.mode === 'page') for (const a of pageAnchors()) { const d = dist(a, p); if (d < bd) { bd = d; best = a; } }
    if (best) return { x: best.x, y: best.y, anchor: true };
    const excluded = [...(exclude || [])].join(',');
    if (!pointSnapCache || pointSnapCache.owner !== home() || pointSnapCache.list !== shapes() || pointSnapCache.excluded !== excluded) {
      const others = shapes().filter(s => !s.hidden && !exclude?.has(s.id)).map(snapBox);
      pointSnapCache = { owner:home(), list:shapes(), excluded, others, index:createSnapIndex(others) };
    }
    const match = snapTranslation({ x: p.x, y: p.y, w: 0, h: 0 }, 0, 0, pointSnapCache.others, activeGuides(), thr, false, pointSnapCache.index);
    const grid = snapGrid() ? snapCanvasGrid(p, TD.GRID, gridStyle()) : p; smartLines = match.lines;
    return { x: match.snappedX ? p.x + match.dx : grid.x, y: match.snappedY ? p.y + match.dy : grid.y };
  }


  // ---------------- attached connectors ----------------
  // A line, arrow, curve or spring whose end is dropped on another shape's outline (or on one of its snap
  // points) stays attached, like connectors in PowerPoint or edges in Obsidian Canvas. The end is kept as a
  // position in that shape's frame (link1 / link2 = { id, u, v }: u across, v down) and follows the shape
  // when it moves, resizes or rotates. Moving the connector on its own, or dragging the end off the shape,
  // detaches it; Alt places an end without attaching.
  const CONNECT = new Set(['line', 'curve', 'spring']);
  const END: Record<string, any> = { p1: ['link1', 'x1', 'y1', 'cx1', 'cy1'], p2: ['link2', 'x2', 'y2', 'cx2', 'cy2'] };
  const ROUND = new Set(['ellipse', 'ball', 'dot', 'pie']);
  let linkHint: any = null; // id of the shape an end would attach to (outlined while drawing)
  function linkFrame(t: any) {
    if (!t || CONNECT.has(t.type)) return null;
    if (t.type === 'coord') return [[t.x - 1, t.y - 1], [t.x + 1, t.y - 1], [t.x + 1, t.y + 1], [t.x - 1, t.y + 1]]; // a point: ends sit on it
    if (TD.ROT_TYPES.has(t.type) || t.type === 'sym') { const C = TD.rotFrame({ ...t, nodeLabel: '', nodePin: '' }); if (C) return C; }
    const b = TD.nodeFeatures?.bodyBox(t) || TD.bbox(t);
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  }
  const fromUV = (C: any, u: any, v: any) => ({ x: C[0][0] + u * (C[1][0] - C[0][0]) + v * (C[3][0] - C[0][0]), y: C[0][1] + u * (C[1][1] - C[0][1]) + v * (C[3][1] - C[0][1]) });
  function toUV(C: any, p: any) {
    const ax = C[1][0] - C[0][0], ay = C[1][1] - C[0][1], bx = C[3][0] - C[0][0], by = C[3][1] - C[0][1];
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-9) return null;
    const px = p.x - C[0][0], py = p.y - C[0][1];
    return { u: (px * by - py * bx) / det, v: (ax * py - ay * px) / det };
  }
  // the nearest point of the shape's outline, in frame terms, if p's (u, v) lies within tol of it
  function outlineUV(t: any, C: any, { u, v }: any, tol: any) {
    const w = Math.hypot(C[1][0] - C[0][0], C[1][1] - C[0][1]), h = Math.hypot(C[3][0] - C[0][0], C[3][1] - C[0][1]);
    if (!w || !h) return null;
    if (ROUND.has(t.type)) {
      const x = (u - 0.5) * w, y = (v - 0.5) * h, r = Math.hypot(x / (w / 2), y / (h / 2));
      if (Math.abs(r - 1) * Math.min(w, h) / 2 > tol) return null;
      return r ? { u: 0.5 + x / r / w, v: 0.5 + y / r / h } : { u: 0.5, v: 0.5 };
    }
    const x = u * w, y = v * h, cx = Math.max(0, Math.min(w, x)), cy = Math.max(0, Math.min(h, y));
    if (x !== cx || y !== cy) return Math.hypot(x - cx, y - cy) > tol ? null : { u: cx / w, v: cy / h };
    const d = [x, w - x, y, h - y], m = Math.min(...d);
    if (m > tol) return null;
    return [{ u: 0, v }, { u: 1, v }, { u, v: 0 }, { u, v: 1 }][d.indexOf(m)];
  }
  // what an end at raw point p (snapped to q) attaches to: a snap point of a shape, else the outline near p
  function linkAt(p: any, q: any, e: any, self?: any) {
    if (!snapObjects() || (e && e.altKey)) return null;
    const tol = 6 / state.view.zoom, L = shapes();
    for (let i = L.length - 1; i >= 0; i--) {
      const t = L[i];
      if (t.id === self) continue;
      const C = linkFrame(t);
      if (!C) continue;
      if (q && q.anchor && TYPES[t.type].anchors(t).some((a: any) => dist(a, q) < 1e-6)) { const uv = toUV(C, q); if (uv) return { id: t.id, ...uv }; }
      const uv = toUV(C, p), on = uv && outlineUV(t, C, uv, tol);
      if (on) return { id: t.id, ...on };
    }
    return null;
  }
  const linkPoint = (k: any) => { const C = linkFrame(byId(k.id)); return C && fromUV(C, k.u, k.v); };
  // put every attached end back on its shape (after anything moved); drops links to shapes that are gone
  let paramErr: any = new Map();
  function syncLinks() {
    // fields given as expressions (src/domain/params.ts) first: connectors and placed nodes then follow what they moved
    const vars = home().vars;
    paramErr = TD.GEOM && ((vars && Object.keys(vars).length) || shapes().some((s: any) => s.ex)) ? TD.params.solve(shapes(), vars, TD.GEOM) : new Map();
    for (const s of shapes()) {
      if (!CONNECT.has(s.type) || !(s.link1 || s.link2)) continue;
      const o = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      for (const [L, X, Y, CX, CY] of Object.values<any>(END)) {
        if (!s[L]) continue;
        const P = linkPoint(s[L]);
        if (!P) { delete s[L]; continue; }
        const dx = P.x - s[X], dy = P.y - s[Y];
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
        s[X] = P.x; s[Y] = P.y;
        if (s.type === 'curve') { s[CX] += dx; s[CY] += dy; } // the curve keeps its shape near that end
      }
      if (s.type === 'line' && (s.x1 !== o.x1 || s.y1 !== o.y1 || s.x2 !== o.x2 || s.y2 !== o.y2)) TD.keepElbowMid(s, o); // an elbow's middle stays put
    }
    syncPos();
  }
  // a node placed beside another with the positioning library (s.pos, from src/domain/tikzimport.ts) moves with that
  // node, so it stays `right=1cm of a` in the code; moved on its own, it lets go
  function syncPos() {
    const L = shapes();
    if (!L.some((s: any) => s.pos)) return;
    // name → its first two holders in list order (a node never stands for itself), built once instead of a
    // scan of every shape per positioned node: imports with `right=of a` position most nodes
    const named = new Map<string, any[]>();
    const add = (k: string, q: any) => { const m = named.get(k); if (!m) named.set(k, [q]); else if (m.length < 2 && m[0] !== q) m.push(q); };
    for (const q of L) {
      if (q.type === 'coord') { if (q.tikzName != null) add(q.tikzName, q); }
      else if (q.tex && q.tex.i === 0 && q.tex.nm) for (const k of q.tex.nm) add(k, q);
    }
    for (const s of L) {
      if (!s.pos) continue;
      const r = (named.get(s.pos.of) || []).find((q: any) => q !== s);
      if (!r) continue;
      const pr = s._pr;
      s._pr = { x: r.x, y: r.y };
      const ox = s.x - r.x - s.pos.off[0], oy = s.y - r.y - s.pos.off[1];
      if (Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6) continue;
      if (pr && (Math.abs(pr.x - r.x) > 1e-9 || Math.abs(pr.y - r.y) > 1e-9)) TD.translate(s, -ox, -oy);
      else delete s.pos;
    }
  }
  // connectors moved by themselves let go of shapes that aren't moving with them
  function detachFrom(list: any, moving: any) {
    for (const s of list) if (CONNECT.has(s.type)) for (const L of ['link1', 'link2']) if (s[L] && !moving.has(s[L].id)) delete s[L];
  }
  // copies: links to shapes copied alongside point at the copies; links to anything else are dropped
  function remapLinks(made: any, idmap: any) {
    for (const s of made) for (const L of ['link1', 'link2']) {
      if (!s[L]) continue;
      if (idmap.has(s[L].id)) s[L].id = idmap.get(s[L].id); else delete s[L];
    }
  }

  // ---------------- page mode: sheets of paper on the desk ----------------
  const PAGE_GAP = PX; // 1 cm between stacked pages
  function pageGeom() {
    const P = TD.pageSize(state.doc.page);
    return { ...P, w: P.W * PX, h: P.H * PX, n: Math.max(1, state.doc.sheet.pages | 0) };
  }
  const pageTop = (k: any, G = pageGeom()) => k * (G.h + PAGE_GAP);
  function sheetBox() { const G = pageGeom(); return { x: 0, y: 0, w: G.w, h: G.n * G.h + (G.n - 1) * PAGE_GAP }; }
  // which page a shape sits on (by the centre of its bounding box)
  function pageOf(s: any, G = pageGeom()) { const b = TD.bbox(s); return Math.max(0, Math.min(G.n - 1, Math.floor((b.y + b.h / 2) / (G.h + PAGE_GAP)))); }
  function pageAnchors() {
    const G = pageGeom(), out = [];
    const ml = G.ml * PX, mr = G.w - G.mr * PX, mt = G.mt * PX, mb = G.h - G.mb * PX;
    for (let k = 0; k < G.n; k++) {
      const t = pageTop(k, G);
      for (const x of [0, ml, G.w / 2, mr, G.w]) for (const y of [0, mt, G.h / 2, mb, G.h]) out.push({ x, y: t + y });
    }
    return out;
  }
  let pageLayerKey = '', pageHoles = '';
  function renderPageLayer() {
    const layer = $('#pageLayer'), mask = $('#pageMask');
    if (state.mode !== 'page') {
      if (pageLayerKey) { layer.innerHTML = ''; mask.setAttribute('d', ''); $('#pageLabels').innerHTML = ''; pageLayerKey = ''; pageHoles = ''; }
      return;
    }
    const G = pageGeom(), z = state.view.zoom;
    const key = JSON.stringify([G, z]);
    if (key !== pageLayerKey) {
      let h = '', holes = '', labels = '';
      for (let k = 0; k < G.n; k++) {
        const t = pageTop(k, G);
        h += `<rect class="pg-shadow" x="${2 / z}" y="${t + 3 / z}" width="${G.w}" height="${G.h}"/>` +
          `<rect class="pg-sheet" x="0" y="${t}" width="${G.w}" height="${G.h}"/>` +
          `<rect class="pg-margin" x="${G.ml * PX}" y="${t + G.mt * PX}" width="${G.w - (G.ml + G.mr) * PX}" height="${G.h - (G.mt + G.mb) * PX}" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>` +
          '';
        labels += `<text class="pg-num" x="${G.w + 8 / z}" y="${t + 12 / z}" font-size="${11 / z}">${k + 1}${G.n > 1 ? ' / ' + G.n : ''}</text>`;
        holes += `M0,${t}h${G.w}v${G.h}h${-G.w}z`;
      }
      layer.innerHTML = h;
      $('#pageLabels').innerHTML = labels;
      pageLayerKey = key; pageHoles = holes;
    }
    // dim anything that falls outside the paper
    const v = state.view, r = stageSize(), W = r.w / z, H = r.h / z;
    mask.setAttribute('d', `M${v.x - 10},${v.y - 10}h${W + 20}v${H + 20}h${-(W + 20)}z${pageHoles}`);
  }
  // Page operations. Objects belong to the page under their centre; moving a page moves them with it.
  const pageStep = (G = pageGeom()) => G.h + PAGE_GAP;
  function onPage(k: any, G: any) { return shapes().filter((s: any) => pageOf(s, G) === k); }
  function pageOp(fn: any) {
    finishEdit(); finishPoly(); commit();
    begin();
    const G = pageGeom();
    if (fn(G) === false) { documentHistory.cancel(); return; }
    state.sel.clear();
    commit(); render(); renderProps(); scheduleSave();
  }
  function insertPage(at: any) {
    pageOp((G: any) => {
      if (G.n >= 50) return false;
      for (const s of shapes()) if (pageOf(s, G) >= at) TD.translate(s, 0, pageStep(G));
      state.doc.sheet.pages = G.n + 1;
    });
    goToPage(at);
  }
  // undoable, so no question first, even with objects on the page: the hint says how to take it back
  function deletePage(k: any) {
    const G = pageGeom();
    if (G.n < 2) { showHint(uiText('hint.pageNeedsOne', 'A page file needs at least one page'), 1400); return; }
    const lost = onPage(k, G).length;
    pageOp(() => {
      const keep = [];
      for (const s of shapes()) { const p = pageOf(s, G); if (p === k) continue; if (p > k) TD.translate(s, 0, -pageStep(G)); keep.push(s); }
      state.doc.sheet.shapes = keep;
      state.doc.sheet.pages = G.n - 1;
    });
    goToPage(Math.min(k, G.n - 2));
    showHint(lost > 1 ? uiText('hint.pageDeleted.many', 'Deleted page {page} and the {n} objects on it. {undo}', { page: k + 1, n: lost, undo: undoHint() })
      : lost ? uiText('hint.pageDeleted.one', 'Deleted page {page} and the object on it. {undo}', { page: k + 1, undo: undoHint() })
      : uiText('hint.pageDeleted', 'Deleted page {page}. {undo}', { page: k + 1, undo: undoHint() }), 2400);
  }
  function duplicatePage(k: any) {
    pageOp((G: any) => {
      if (G.n >= 50) return false;
      const src = onPage(k, G);
      for (const s of shapes()) if (pageOf(s, G) > k) TD.translate(s, 0, pageStep(G));
      const gmap = new Map(), idmap = new Map(), made = [];
      for (const s0 of src) {
        const c = clone(s0); c.id = uid(); idmap.set(s0.id, c.id); made.push(c);
        if (c.g) { if (!gmap.has(c.g)) gmap.set(c.g, uid()); c.g = gmap.get(c.g); }
        TD.translate(c, 0, pageStep(G));
        shapes().push(c);
      }
      remapLinks(made, idmap);
      state.doc.sheet.pages = G.n + 1;
    });
    goToPage(k + 1);
  }
  function movePage(k: any, dir: any) {
    const G = pageGeom(), j = k + dir;
    if (j < 0 || j >= G.n) return;
    pageOp(() => {
      for (const s of shapes()) { const p = pageOf(s, G); if (p === k) TD.translate(s, 0, dir * pageStep(G)); else if (p === j) TD.translate(s, 0, -dir * pageStep(G)); }
    });
    goToPage(j);
  }
  // the page under the middle of the view
  function currentPage() {
    const G = pageGeom(), r = stageSize(), cy = state.view.y + r.h / 2 / state.view.zoom;
    return Math.max(0, Math.min(G.n - 1, Math.floor((cy + PAGE_GAP / 2) / pageStep(G))));
  }
  function goToPage(k: any) {
    const G = pageGeom(), r = stageSize(), z = state.view.zoom;
    k = Math.max(0, Math.min(G.n - 1, k));
    const visH = r.h / z;
    // show the whole page if it fits, else its top edge
    const y = G.h + 40 / z <= visH ? pageTop(k, G) + G.h / 2 - visH / 2 : pageTop(k, G) - 20 / z;
    state.view = { ...state.view, y };
    render(); if (!state.sel.size) renderProps();
  }
  function pageThumb(k: any, G: any) {
    const list = onPage(k, G), t = pageTop(k, G);
    const ctx = { zoom: 1, hit: 0, export: true, scene: shapes() };
    return `<svg viewBox="0 ${r2(t)} ${r2(G.w)} ${r2(G.h)}" preserveAspectRatio="xMidYMid meet">` +
      `<rect x="0" y="${r2(t)}" width="${r2(G.w)}" height="${r2(G.h)}" fill="#fff"/>` +
      fillDefsAround(() => list.map((s: any) => `<g data-thumb-id="${s.id}">${TYPES[s.type].svg(s, ctx)}</g>`).join('')) + '</svg>';
  }

  // ---------------- rendering ----------------
  function render(): void {
    // the open file's macros, before anything is drawn (a change clears the drawn formulas: src/domain/mathengine.ts)
    TD.math.useMacros(state.doc.page.macros);
    if (!TD.math.previewing) return TD.math.preview(render);
    if (!viewGeometry) return withViewGeometry(render);
    if (formatPreview && !renderScene) {
      const p = formatPreview;
      if (p.owner !== home() || p.ids !== [...state.sel].join(',')) clearFormatPreview(false);
      else {
        if (!p.scene) {
          p.scene = clone(state.doc.shapes);
          for (const s of p.scene!) if (state.sel.has(s.id) && s.type === 'text') {
            TD.textHold(s, () => setTextFormat(s, p.key, p.value));
          }
        }
        renderScene = p.scene;
        try { render(); } finally { renderScene = null; }
        return;
      }
    }
    syncLinks();
    if (drag && drag.fast) fastLinks(drag);
    applyView(false);
    // The drawing does not depend on the view (hit outlines take their width from --hitw), so a shape's
    // markup only changes when the shape does, and only changed shapes are put back into the canvas.
    paint();
    renderPageLayer();
    $('#emptyHint').hidden = shapes().length > 0 || state.tool !== 'select';
    renderOverlay();
  }
  // A shape's markup, remembered against its data: unchanged shapes are not drawn again. Lines that hop
  // over others depend on the rest of the scene, and markup made with placeholder text sizes is not kept.
  const drawn = new Map(); // shape id → { key, html, defs }
  { const clear = TD.clearTextCache; TD.clearTextCache = () => { drawn.clear(); clear(); }; }
  const changedMathShapes = new Set<string>();
  const sidebarPending = new Map<string, number[]>();
  const mathPriorities = new Map<string, number>();
  const capturedMathPriorities = new Map<string, number>();
  let sidebarVersion = 0;
  let mathProgressPainting = false;
  const pendingDependencies = (html: string): number[] => [...html.matchAll(/data-math-pending="([\d,]+)"/g)].flatMap(match => match[1].split(',').map(Number));
  const dependsOn = (value: any, ids?: number[]) => value.pendingIds.length && (!ids || value.pendingIds.some((id: number) => ids.includes(id)));
  { const clear = TD.clearPendingTextCache; TD.clearPendingTextCache = (ids?: number[]) => {
    for (const [id, value] of drawn) if (dependsOn(value, ids)) { drawn.delete(id); changedMathShapes.add(id); }
    for (const [id, value] of thumbs) if (dependsOn(value, ids)) { thumbs.delete(id); changedMathShapes.add(id); }
    for (const [id, pending] of sidebarPending) if (!ids || pending.some(value => ids.includes(value))) { sidebarPending.delete(id); changedMathShapes.add(id); }
    clear(ids);
  }; }
  function shapeSvg(s: any, ctx: any, defs: any) {
    const key = JSON.stringify(s), m = drawn.get(s.id);
    if (m && m.key === key) { if (m.defs) defs.add(m.defs); return m.html; }
    TD.takeFillDefs();
    let html: string;
    try { html = TD.math.withPriority(mathPriorities.get(s.id) ?? 2, () => `${TYPES[s.type].svg(s, ctx)}`); } catch (err) { console.warn('Could not draw', s.type, s.id, err); html = ''; }
    TD.math.prioritize(pendingDependencies(html), mathPriorities.get(s.id) ?? 2);
    const d = TD.takeFillDefs();
    if (d) defs.add(d);
    if (!TD.measuring() && (s.cross ?? TD.LINE_EXTRA.cross) !== 'hop') drawn.set(s.id, { key, html, defs: d, pendingIds: pendingDependencies(html) });
    else drawn.delete(s.id);
    return html;
  }
  const canvasLabelResources = new SvgLabelResources();
  const painted = new Map(); // shape id → { html, el } as last put in the canvas
  let defsEl: any = null, defsHtml = '';
  function paintContent(list: any, strs: any, defs: any) {
    if (!defsEl) { defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'g'); defsEl.id = 'contentDefs'; content.parentNode.insertBefore(defsEl, content); }
    if (defs !== defsHtml) { defsEl.innerHTML = defs; defsHtml = defs; }
    let cur = content.firstChild;
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const id = list[i].id;
      let m = painted.get(id);
      if (!m || seen.has(id)) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        el.setAttribute('data-id', id);
        if (drag && drag.fast && state.sel.has(id)) el.classList.add('mv');
        m = { html: null, el };
        if (!seen.has(id)) painted.set(id, m);
      }
      seen.add(id);
      if (m.html !== strs[i]) {
        const unmarked = (html: string) => html.replace(/ data-math-pending="[\d,]+"/g, '').replace(/class="svg-label math-pending"/g, 'class="svg-label"');
        if (m.html && unmarked(m.html) === unmarked(strs[i])) {
          const markers = [...strs[i].matchAll(/class="svg-label(?: math-pending)?"(?: data-math-pending="([\d,]+)")?/g)];
          let n = 0;
          for (const image of m.el.querySelectorAll('image.svg-label')) {
            const ids = markers[n++]?.[1];
            const revealing = image.classList.contains('math-pending') && !ids;
            image.classList.toggle('math-pending', !!ids);
            if (ids) image.setAttribute('data-math-pending', ids); else image.removeAttribute('data-math-pending');
            if (revealing) TD.math.trackView(previewFadeFinished(image));
          }
        } else updateSvg(m.el, strs[i], canvasLabelResources);
        m.html = strs[i];
      }
      if (m.el.classList.contains('locked') !== !!list[i].locked) m.el.classList.toggle('locked', !!list[i].locked);
      if (m.el === cur) cur = cur.nextSibling;
      else content.insertBefore(m.el, cur);
    }
    while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
    canvasLabelResources.update(content);
    if (painted.size > seen.size) for (const id of [...painted.keys()]) if (!seen.has(id)) painted.delete(id);
  }
  // On a large drawing only the shapes in and around the view are in the canvas (the browser repaints every
  // node it holds, on screen or not); a view that leaves that margin paints again.
  const CULL = 400;
  let paintedBox: any = null;
  function paint() {
    const all = shapes().filter((s: any) => !s.hidden), ctx = { zoom: 1, hit: 14, scene: all };
    let list, defs: any, box = null;
    if (all.length > CULL) {
      const r = stageSize(), v = state.view, w = r.w / v.zoom, h = r.h / v.zoom;
      box = { x1: v.x - w, y1: v.y - h, x2: v.x + 2 * w, y2: v.y + 2 * h, z: v.zoom };
    }
    const strs = TD.measureBatch(() => {
      defs = new Set();
      list = box ? all.filter((s: any) => { const b = TD.bbox(s); return b.x <= box.x2 && b.x + b.w >= box.x1 && b.y <= box.y2 && b.y + b.h >= box.y1; }) : all;
      return list.map((s: any) => shapeSvg(s, ctx, defs));
    });
    paintContent(list, strs, [...defs].join(''));
    paintedBox = box;
    if (drawn.size > all.length + 200) { const ids = new Set(all.map((s: any) => s.id)); for (const id of [...drawn.keys()]) if (!ids.has(id)) drawn.delete(id); }
  }
  // the view still lies inside what was painted
  function viewPainted() {
    const b = paintedBox;
    if (!b) return shapes().length <= CULL;
    const r = stageSize(), v = state.view;
    return v.x >= b.x1 && v.y >= b.y1 && v.x + r.w / v.zoom <= b.x2 && v.y + r.h / v.zoom <= b.y2 && v.zoom <= b.z * 3; // zoomed far in: paint fewer
  }
  // Only the view moved (pan, zoom): the drawing stays as it is.
  function renderView(): void {
    if (!TD.math.previewing) return TD.math.preview(renderView);
    if (!viewGeometry) return withViewGeometry(renderView);
    applyView(false);
    if (!viewPainted()) paint();
    renderPageLayer();
    renderOverlay(true);
  }
  function renderOverlay(viewOnly = false) {
    pruneSel();
    if (selectedGuide && (state.sel.size || !home().guides?.some(g=>g.id===selectedGuide))) selectedGuide=null;
    const z = state.view.zoom, out = [];
    const size = stageSize(), v = state.view;
    for (const g of activeGuides()) {
      const line = g.axis === 'x' ? `x1="${g.position}" y1="${v.y}" x2="${g.position}" y2="${v.y + size.h / z}"` : `x1="${v.x}" y1="${g.position}" x2="${v.x + size.w / z}" y2="${g.position}"`;
      out.push(`<line class="construction-guide${selectedGuide === g.id ? ' selected' : ''}" ${line} stroke-width="${1/z}"/>${guideMode === 'show' ? `<line class="guide-hit" data-guide-id="${esc(g.id)}" ${line} stroke-width="${10/z}"/>` : ''}`);
    }
    for (const l of smartLines) out.push(`<line class="smart-guide${l.spacing ? ' equal-spacing' : ''}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke-width="${1/z}"/>`);
    const sel = selected();
    const pb = paintedBox;
    for (const s of sel) {
      const b = TD.bbox(s);
      if (pb && (b.x > pb.x2 || b.x + b.w < pb.x1 || b.y > pb.y2 || b.y + b.h < pb.y1)) continue; // off screen
      if (s.type === 'arc' && +s.angle) { // a turned arc: its own box, turned with it
        const C = TD.rotFrame(s), cx = (C[0][0] + C[2][0]) / 2, cy = (C[0][1] + C[2][1]) / 2;
        const g = (p: any) => { const d = Math.hypot(p[0] - cx, p[1] - cy) || 1, k = 3 * Math.SQRT2 / z / d; return `${p[0] + (p[0] - cx) * k},${p[1] + (p[1] - cy) * k}`; };
        out.push(`<polygon class="sel-box" points="${C.map(g).join(' ')}"/>`);
        continue;
      }
      out.push(`<rect class="sel-box" x="${b.x - 3 / z}" y="${b.y - 3 / z}" width="${b.w + 6 / z}" height="${b.h + 6 / z}"/>`);
    }
    const groups = new Map();
    for (const s of sel) if (s.g) (groups.get(s.g) || groups.set(s.g, []).get(s.g)).push(s);
    for (const m of groups.values()) {
      const b = unionBox(m);
      out.push(`<rect class="grp-box" x="${b.x - GRP_OUT / z}" y="${b.y - GRP_OUT / z}" width="${b.w + 2 * GRP_OUT / z}" height="${b.h + 2 * GRP_OUT / z}"/>`);
    }
    const G = !polyDraft && !arcDraft ? selFrame() : null;
    if (G && !G.one) out.push(`<rect class="grp-box" x="${G.F.x}" y="${G.F.y}" width="${G.F.w}" height="${G.F.h}"/>`); // a group draws its own
    if (G) for (const h of G.H) {
      const q = 3.75 / z;
      out.push(`<rect class="handle" data-handle="${h.k}" data-frame="1" x="${h.x - q}" y="${h.y - q}" width="${2 * q}" height="${2 * q}" style="cursor:${handleCursor({ type: 'rect' }, h.k)}"/>`);
    }
    if (arcDraft) {
      const d = arcDraft, c = d.cur, P = d.pts, L = (a: any, b: any) => out.push(`<line class="guide" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
      if (d.tool === 'arc') { if (P.length === 1) L(P[0], c); else { L(P[0], P[1]); L(P[0], c); } }
      else if (P.length === 1) L(P[0], c); else L(P[0], P[1]);
      for (const q of P) out.push(`<circle class="arc-pt" cx="${q.x}" cy="${q.y}" r="${3 / z}"/>`);
    }
    // the curvature pen's points while it draws, as Photoshop shows them: smooth round, corners square
    const pd = polyDraft && byId(polyDraft);
    if (pd && pd.curv) {
      const q = 3 / z;
      pd.pts.slice(0, -1).forEach((p: any, i: number) => out.push(pd.corner && pd.corner[i]
        ? `<rect class="arc-pt" x="${p[0] - q}" y="${p[1] - q}" width="${2 * q}" height="${2 * q}"/>` : `<circle class="arc-pt" cx="${p[0]}" cy="${p[1]}" r="${q}"/>`));
      // over the first point, a ring: clicking there closes the path
      const f = pd.pts[0], l = pd.pts[pd.pts.length - 1];
      if (pd.pts.length >= 3 && Math.hypot(l[0] - f[0], l[1] - f[1]) * z < 8) out.push(`<circle class="snap-ind" cx="${f[0]}" cy="${f[1]}" r="${6 / z}"/>`);
    }
    if (sel.length === 1 && !polyDraft && !arcDraft) {
      const s = sel[0], t = TYPES[s.type];
      if (t.guides) for (const g of t.guides(s)) out.push(`<line class="guide" x1="${g[0]}" y1="${g[1]}" x2="${g[2]}" y2="${g[3]}"/>`);
      if (s.type === 'poly') {
        // small "+" at the middle of each segment: drag it to add a point there
        const P = s.pts, n = s.closed ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) {
          const a = P[i], b = P[(i + 1) % P.length], m = polyMid(s, i), mx = m.x, my = m.y;
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) * z < 28) continue;
          out.push(`<g class="addpt" data-addpt="${i}" data-hid="${s.id}"><circle cx="${mx}" cy="${my}" r="${5 / z}"/><path d="M${mx - 2.6 / z} ${my}h${5.2 / z}M${mx} ${my - 2.6 / z}v${5.2 / z}"/></g>`);
        }
      }
      for (const h of t.handles(s, z)) {
        const cur = handleCursor(s, h.k);
        if (h.round) out.push(`<circle class="handle" data-handle="${h.k}" data-hid="${s.id}" cx="${h.x}" cy="${h.y}" r="${4.25 / z}" style="cursor:${cur}"/>`);
        else if (h.ctrl) out.push(`<circle class="handle ctrl" data-handle="${h.k}" data-hid="${s.id}" cx="${h.x}" cy="${h.y}" r="${4 / z}" style="cursor:${cur}"/>`);
        else {
          const q = 3.75 / z, on = s.type === 'poly' && state.vertex && state.vertex.id === s.id && 'v' + state.vertex.i === h.k;
          const lk = CONNECT.has(s.type) && END[h.k] && s[END[h.k][0]];
          // a curvature pen path's smooth points are round, its corners square
          if (s.curv && !(s.corner && s.corner[+h.k.slice(1)])) { out.push(`<circle class="handle${on ? ' on' : ''}" data-handle="${h.k}" data-hid="${s.id}" cx="${h.x}" cy="${h.y}" r="${4.25 / z}" style="cursor:${cur}"/>`); continue; }
          out.push(`<rect class="handle${on ? ' on' : ''}${lk ? ' linked' : ''}" data-handle="${h.k}" data-hid="${s.id}" x="${h.x - q}" y="${h.y - q}" width="${2 * q}" height="${2 * q}" style="cursor:${cur}"/>`);
        }
      }
    }
    if (marquee) {
      const x = Math.min(marquee.a.x, marquee.b.x), y = Math.min(marquee.a.y, marquee.b.y);
      out.push(`<rect class="marquee${marquee.text ? ' tf' : marquee.cross ? ' cross' : ''}" x="${x}" y="${y}" width="${Math.abs(marquee.b.x - marquee.a.x)}" height="${Math.abs(marquee.b.y - marquee.a.y)}"/>`);
    }
    if (linkHint) {
      const t = byId(linkHint), C = linkFrame(t);
      if (C) {
        const P = ROUND.has(t!.type) ? Array.from<any, any>({ length: 48 }, (_, i) => fromUV(C, 0.5 + 0.5 * Math.cos((i * Math.PI) / 24), 0.5 + 0.5 * Math.sin((i * Math.PI) / 24)))
          : C.map(([x, y]: any) => ({ x, y }));
        out.push(`<polygon class="link-hint" points="${P.map((q: any) => `${r2(q.x)},${r2(q.y)}`).join(' ')}"/>`);
      }
    }
    if (snapHint) {
      const r = (snapHint.anchor ? 6 : 3) / z;
      out.push(`<circle class="snap-ind" cx="${snapHint.x}" cy="${snapHint.y}" r="${r}"/>`);
    }
    if (layerHover) {
      const hs = layerHover.map(byId).filter((q: any) => q && !q.hidden);
      if (hs.length) { const b = unionBox(hs); out.push(`<rect class="layer-hover" x="${b.x - 4 / z}" y="${b.y - 4 / z}" width="${b.w + 8 / z}" height="${b.h + 8 / z}"/>`); }
    }
    overlay.innerHTML = out.join('');
    drawRulers(); magnifier.refresh();
    if (!viewOnly && !mathProgressPainting) { updateStatus(); scheduleLayers(); }
  }

  // ---------------- moving a large selection ----------------
  // Dragging many shapes does not touch them until the drop: their painted elements slide together by a
  // CSS translate, the selection outline slides with them, and only the connectors attached from outside
  // are redrawn as they go. On release every shape moves once, for real.
  const FAST_DRAG = 200;
  function startFastMove(d: any) {
    d.fast = true;
    d.off = { dx: 0, dy: 0 };
    for (const id of state.sel) { const m = painted.get(id); if (m) m.el.classList.add('mv'); }
    // connectors outside the selection with an end on a moving shape, with where those ends are now
    d.ext = [];
    for (const s of shapes()) {
      if (state.sel.has(s.id) || !CONNECT.has(s.type) || !(s.link1 || s.link2)) continue;
      const ends = [];
      for (const [L, X, Y, CX, CY] of Object.values<any>(END)) if (s[L] && state.sel.has(s[L].id)) ends.push([X, Y, CX, CY, s[X], s[Y], s[CX], s[CY]]);
      if (ends.length) d.ext.push({ s, ends });
    }
  }
  function fastMove(d: any, dx: any, dy: any) {
    if (dx === d.off.dx && dy === d.off.dy) return;
    d.off = { dx, dy };
    content.style.setProperty('--mx', dx + 'px');
    content.style.setProperty('--my', dy + 'px');
    overlay.setAttribute('transform', `translate(${dx} ${dy})`);
    if (!d.ext.length) return;
    fastLinks(d);
    const all = shapes(), ctx = { zoom: 1, hit: 14, scene: all }, defs = new Set();
    TD.measureBatch(() => {
      for (const { s } of d.ext) {
        const m = painted.get(s.id);
        if (!m) continue;
        const html = shapeSvg(s, ctx, defs);
        if (m.html !== html) { m.el.innerHTML = html; m.html = html; }
      }
    });
  }
  // the outside connectors' ends follow the moving shapes (also after a redraw mid-drag, whose syncLinks
  // put them back on the shapes, which have not moved yet)
  function fastLinks(d: any) {
    const { dx, dy } = d.off;
    for (const { s, ends } of d.ext) {
      const o = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      for (const [X, Y, CX, CY, x, y, cx, cy] of ends) {
        s[X] = x + dx; s[Y] = y + dy;
        if (s.type === 'curve') { s[CX] = cx + dx; s[CY] = cy + dy; }
      }
      if (s.type === 'line') TD.keepElbowMid(s, o); // an elbow's middle stays put
    }
  }
  function endFastMove(d: any) {
    const { dx, dy } = d.off;
    if (dx || dy) {
      for (const s of d.orig.values()) TD.translate(s, dx, dy);
      detachFrom(selected(), state.sel);
    }
    for (const el of content.querySelectorAll('.mv')) el.classList.remove('mv');
    content.style.removeProperty('--mx'); content.style.removeProperty('--my');
    overlay.removeAttribute('transform');
  }

  // ---------------- tools ----------------
  // the toolbar shows the tool in use: Hand while Space is held (Space-drag pans)
  function markTools() {
    const t = spaceDown ? 'hand' : state.tool;
    document.querySelectorAll('#tools button[data-tool]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tool === t));
    document.querySelectorAll('#tools button[data-fly]').forEach((b) => b.classList.toggle('active', flyOf(t) === (b as HTMLElement).dataset.fly));
  }
  const canBucketFill = (s: any) => !s.hidden && !s.locked && s.type !== 'ball' && s.type !== 'dot' && TD.canCombine(s);
  // the bucket's own colour (remembered with the preferences): not Default style's fill, which every new shape takes
  let bucketFill: any = '#cfe2f3';
  function fillShapes(list: any[], clear = false) {
    const eligible = list.filter(canBucketFill); if (!eligible.length) return;
    const fill = clear ? null : bucketFill;
    if (eligible.every(s=>JSON.stringify(s.fill)===JSON.stringify(fill))) return;
    begin(); for (const s of eligible) s.fill = clone(fill); commit(); render();
  }
  function setTool(t: any) {
    const previous = state.tool;
    finishPoly();
    if (t === 'image') { $('#imageInput').value = ''; $('#imageInput').click(); t = 'select'; }
    state.tool = t;
    // the selection takes the bucket's colour at once (one undo step); an empty bucket never clears a fill this way
    if (t === 'bucket' && previous !== 'bucket' && bucketFill != null) fillShapes(selected());
    if (previous === 'bucket' || t === 'bucket') renderProps();
    magnifier.hide(); smartLines = [];
    markTools();
    svg.classList.toggle('tool-draw', isDrawTool(t));
    svg.classList.toggle('tool-text', t === 'text' || t === 'math');
    svg.classList.toggle('tool-hand', t === 'hand');
    svg.classList.toggle('tool-magnify', t === 'magnify');
    svg.classList.toggle('tool-bucket', t === 'bucket');
    $('#emptyHint').hidden = shapes().length > 0 || t !== 'select';
    snapHint = null;
    const sym = t.startsWith('sym:') && TD.SYMS[t.slice(4)];
    if (pointsKind()) { arcHint(); renderOverlay(); return; }
    showHint(t === 'magnify' ? uiText('assist.magnifyHelp', 'Move over the canvas to magnify details. Scroll to change magnification; Esc returns to Select.')
      : t === 'bucket' ? uiText('assist.bucketHelp', 'Choose Fill in Properties, then click a closed shape. Alt-click clears fill; Shift-click applies it to selected shapes.')
      : t === 'poly' ? uiText('tool.hint.poly', 'Click to add points · double-click / Enter to finish · click first point to close')
      : t === 'blob' ? uiText('tool.hint.blob', 'Click to add points of a smooth closed curve · double-click / Enter to finish')
      : t === 'curvpen' ? uiText('tool.hint.curvpen', 'Click to add points the curve bends through · double-click or Alt-click for a corner · click the first point to close · Enter or Esc to finish')
      : t === 'smoothcurve' ? uiText('tool.hint.smoothcurve', 'Click to add points the curve passes through · double-click / Enter to finish')
      : t === 'elbow' ? uiText('tool.hint.elbow', 'Drag from start to end; the ends hold on to shapes · drag the middle handle to move the bend')
      : t === 'curvedconn' ? uiText('tool.hint.connector', 'Drag from start to end; the ends hold on to shapes')
      : t === 'pencil' ? uiText('tool.hint.pencil', 'Draw freehand · end near the start to close · Esc when done')
      : sym ? uiText('tool.hint.sym', '{name}: click to place, or drag to set the size (Shift keeps it square)', { name: sym.name })
      : DRAW_MODES[t] ? modeHint(t)
      : (TD.blocks.get(toolType(t)) || /^(plot|pie|solid|prim3d|revolve)/.test(t)) ? uiText('tool.hint.place', 'Click to place, or drag to set the size') : '');
    renderOverlay();
  }

  // ---------------- tool flyouts (lines / shapes / misc / arrows / plots) ----------------
  // in PowerPoint's order: straight lines, connectors, curves, then the freeform ones
  const LINE_TOOLS: any[][] = [
    ['line', message('tool.line', 'Line (L)'), '<path d="M4 12h26"/>'], ['arrow', message('tool.arrow', 'Arrow (A)'), '<path d="M4 12h24M23 7l6 5-6 5"/>'],
    ['darrow', message('tool.darrow', 'Double arrow'), '<path d="M6 12h22M11 7l-6 5 6 5M23 7l6 5-6 5"/>'],
    ['elbow', message('tool.elbow', 'Elbow connector: right angles; drag its middle handle to move the bend'), '<path d="M4 18h12V6h14"/>'],
    ['curvedconn', message('tool.curvedconn', 'Curved connector'), '<path d="M4 18C17 18 17 6 30 6"/>'],
    ['curve', message('tool.curve', 'Bézier curve (C)'), '<path d="M4 16C10 2 20 22 30 8"/>'], ['curvearrow', message('tool.curvearrow', 'Curved arrow'), '<path d="M4 16C10 4 18 20 27 9M22 8l6 0-1 6"/>'],
  ];
  const FREE_TOOLS: any[][] = [
    ['curvpen', message('tool.curvpen', 'Curvature pen: click points the curve bends through; double-click for a corner'), '<path d="M9.4 4.7C14.2 5.1 16 9.5 15.8 15.8"/><circle cx="7.5" cy="4.5" r="1.8"/><g transform="translate(17.5 21.5) rotate(45)"><path d="M0 0L5.8 -9.8L3.7 -14.4H-3.7L-5.8 -9.8Z"/><path d="M0 0V-7"/><circle cx="0" cy="-8.1" r="1.2" class="f"/><path d="M-4.1 -17.6H4.1"/></g>'],

    ['smoothcurve', message('tool.smoothcurve', 'Curve through points'), '<path d="M4 18Q9 5 16 11T29 7"/><circle cx="4" cy="18" r="1.6" class="f"/><circle cx="16" cy="11" r="1.6" class="f"/><circle cx="29" cy="7" r="1.6" class="f"/>'],
    ['poly', message('tool.poly', 'Polyline / polygon (P)'), '<path d="M5 19l5-14 9 10 9-11"/>'], ['blob', message('tool.blob', 'Smooth closed curve'), '<path d="M8 6c6-4 18-3 20 4s-4 10-10 9-15 0-14-6 1-5 4-7z"/>'],
    ['arc', message('tool.arc', 'Arc by centre (O) — click the centre, the start, then the end'), '<path d="M7 18h20M27 18a20 20 0 0 0-6.5-14.8"/><path d="M7 18L20.5 3.2" stroke-dasharray="2 2"/><circle cx="7" cy="18" r="1.8" class="f"/>'],
    ['arc3', message('tool.arc3', 'Arc through three points — click both ends, then a point on the arc'), '<path d="M5 19A13 13 0 0 1 29 19"/><circle cx="5" cy="19" r="1.8" class="f"/><circle cx="29" cy="19" r="1.8" class="f"/><circle cx="17" cy="11" r="1.8" class="f"/>'], ['spring', message('tool.spring', 'Spring (S)'), '<path d="M2 12h5l2-6 4 12 4-12 4 12 4-12 2 6h5"/>'],
  ];
  const MISC_EXTRA: any[][] = [
    ['ball', message('tool.ball', 'Shaded ball (B)'), '<circle cx="17" cy="12" r="7" class="ballic"/>'], ['dot', message('tool.dot', 'Dot (D)'), '<circle cx="17" cy="12" r="3" class="f"/>'],
  ];
  // the plain TikZ rectangle and ellipse lead the basic shapes; each has a menu of draw modes
  const PLAIN_SHAPES: any[][] = [
    ['rect', message('tool.rect', 'Rectangle (R) — plain TikZ rectangle'), '<rect x="6" y="5" width="22" height="14"/>'], ['ellipse', message('tool.ellipse', 'Ellipse (E) — plain TikZ ellipse'), '<ellipse cx="17" cy="12" rx="11" ry="7"/>'],
  ];
  // the flyouts' contents as data (src/ui/ToolPanel.svelte): symbol buttons and picture tiles under small titles
  const sym = (tool: string, title: any, svg: string): ToolSymbol => ({ pick: tool, title: caption(title), svg });
  const symBtns = (cat: any) => TD.SYM_CATS[cat].map((k: any) => sym('sym:' + k, TD.SYMS[k].name, TD.symIcon(k)));
  const lineBtns = (L: any[][]) => L.map(([t, n, d]) => sym(t, n, `<svg viewBox="0 0 34 24">${d}</svg>`));
  // the Rectangle and Ellipse buttons show the way they draw now; a mark in the corner says they have a menu
  const modeBtn = (t: any, n: any): ToolSymbol => ({ ...sym(t, n, `<svg viewBox="-4.2 0 28.4 20">${modeRow(t)[3]}</svg>`), modes: true });
  // Physics: computed figures (the physics block, one entry per domain), then the drawn symbols
  const PHYS_DOMAINS: any[][] = [
    ['mechanics', message('phys.mechanics', 'Forces on blocks and inclines, pulleys, springs, pendulums, projectiles and linkages'), '<path d="M3 20h25V6z"/><path d="M11 15.5l5.2-2.9-2-3.5L9 12z" class="a1"/>'],
    ['optics', message('phys.optics', 'Ray optics: lenses, mirrors, prisms, refraction, polarisers and interferometers'), '<path d="M2 12h28"/><path d="M15 3c2 3 2 15 0 18M15 3c-2 3-2 15 0 18"/><path d="M3 7h12l12 10" class="c1"/>'],
    ['fields', message('phys.fields', 'Electric and magnetic fields: charges, wires, field lines, equipotentials and probes'), '<path d="M9 12h14M9 12c4-7 10-7 14 0M9 12c4 7 10 7 14 0" class="c1"/><circle cx="8" cy="12" r="2.6"/><circle cx="24" cy="12" r="2.6"/>'],
    ['waves', message('phys.waves', 'Waves: interference, slits and gratings, superposition and standing waves'), '<path d="M2 12h28"/><path d="M3 12c3-8 6-8 8.5 0s6 8 8.5 0 6-8 8.5 0" class="c1"/>'],
    ['spacetime', message('phys.spacetime', 'Minkowski diagrams: moving frames, events, world lines, light cones and intervals'), '<path d="M6 21V3M6 21h22"/><path d="M6 21L24 3" stroke-dasharray="2 2"/><path d="M6 21l6-15M6 21l15-6" class="c1"/>'],
    ['levels', message('phys.levels', 'Energy levels: atomic levels, transitions and line spectra'), '<path d="M5 20h22M5 11h22M5 7.5h22M5 5.5h22"/><path d="M15 7.5V19M13 17l2 2 2-2" class="c1"/>'],
  ];
  const physDomains = (): ToolTileSpec[] => PHYS_DOMAINS.map(([k, title, d]) => {
    const D = TD.physics && TD.physics.domains[k];
    return { insert: 'physics:' + k, title: uiText('phys.computed', '{title}: computed, with an editor', { title: caption(title) }), svg: `<svg viewBox="0 0 32 24">${d}</svg>`, label: D ? D.label : k };
  });
  // the Blocks flyout: one titled section per subject (a block's menu.group), the ones still to come at the end of theirs
  const BLOCK_GROUPS: [string, any][] = [
    ['general', message('fly.blocks.general', 'General')], ['maths', message('fly.blocks.maths', 'Maths')],
    ['quantum', message('fly.blocks.quantum', 'Quantum and physics')], ['electronics', message('fly.blocks.electronics', 'Electronics')],
    ['computing', message('fly.blocks.computing', 'Computing')], ['chemistry', message('fly.blocks.chemistry', 'Chemistry')],
  ];
  const SOON_BLOCKS = (): Record<string, ToolTileSpec[]> => ({ maths: [
      { soon: true, title: uiText('ui.string.diagram.coming.soon', 'String diagram — coming soon'), label: uiText('ui.string', 'String'), svg: '<svg viewBox="0 0 32 24"><path d="M9 2v6M23 2v6M16 16v6M9 16c0 3 7 0 7 0"/><rect x="5" y="8" width="22" height="8" rx="1"/></svg>' },
      { soon: true, title: uiText('ui.braid.and.knot.coming.soon', 'Braid and knot — coming soon'), label: uiText('ui.braid', 'Braid'), svg: '<svg viewBox="0 0 32 24"><path d="M6 2c0 6 10 6 10 10s-10 4-10 10"/><path d="M16 2c0 4-3 5-4.5 6.5M8.5 15.5C7 17 6 18 6 22"/><path d="M26 2v10c0 4-10 4-10 10M19.5 17.5c2-1.5 6.5-2 6.5-5.5"/></svg>' },
      { soon: true, title: uiText('ui.tensor.network.coming.soon', 'Tensor network — coming soon'), label: uiText('ui.tensor', 'Tensor'), svg: '<svg viewBox="0 0 32 24"><path d="M2 12h4M12 12h8M26 12h4M9 6V2M23 6V2M9 18v4M23 18v4"/><rect x="5" y="7" width="8" height="10" rx="2"/><rect x="19" y="7" width="8" height="10" rx="2"/></svg>' },
  ] });
  const blockSections = (): ToolSection[] => {
    const all = TD.blocks.menuEntries(), soon = SOON_BLOCKS();
    return BLOCK_GROUPS.map(([g, name]) => ({ title: caption(name), tiles: [
      ...all.filter((b: any) => (b.group ?? 'general') === g).map((b: any) => ({ insert: b.type, title: b.title, svg: b.icon, label: b.label })),
      ...(soon[g] ?? []),
    ] })).filter((sec) => sec.tiles.length);
  };

  // the same drawing tools, for block editors that hold plain shapes too (the Physics editor): every tool but
  // images, plots, 3D and blocks. Items are [tool, title, icon svg]; TD.toolType gives the shape type of a tool.
  const railIcon = (t: any) => { const b = document.querySelector(`#tools [data-tool="${t}"] svg`); return b ? b.outerHTML : ''; };
  const symItems = (cat: any) => TD.SYM_CATS[cat].map((k: any) => ['sym:' + k, TD.SYMS[k].name, TD.symIcon(k)]);
  const capItems = (L: any[][]) => L.map(([t, n, d]) => [t, caption(n), ic34(d)]);
  const ic34 = (d: any) => `<svg viewBox="0 0 34 24">${d}</svg>`;
  TD.toolType = toolType;
  TD.drawTools = () => [
    [uiText('fly.text', 'Text'), [['text', uiText('tool.text', 'Text: click to place, then type. Use $…$ for maths'), railIcon('text')], ['math', uiText('tool.math', 'Maths: a text that starts in $…$'), railIcon('math')]]],
    [uiText('fly.lines', 'Lines'), [...capItems([...LINE_TOOLS, ...FREE_TOOLS]), ['pencil', uiText('tool.pencil', 'Pencil: freehand, smoothed'), railIcon('pencil')]]],
    [uiText('fly.shapes', 'Shapes'), symItems('rect')],
    [uiText('fly.basicShapes', 'Basic shapes'), [...capItems(PLAIN_SHAPES), ...symItems('basic')]], [uiText('fly.flowchart', 'Flowchart'), symItems('flow')],
    [uiText('fly.misc', 'Misc'), [...symItems('misc'), ...capItems(MISC_EXTRA)]],
    [uiText('fly.blockArrows', 'Block arrows'), symItems('arrow')], [uiText('fly.mechSymbols', 'Mechanics symbols'), symItems('mech')], [uiText('fly.opticsSymbols', 'Optics symbols'), symItems('optics')],
    [uiText('fly.elecSymbols', 'Electrical symbols'), symItems('elec')], [uiText('fly.waveforms', 'Waveforms'), symItems('wave')],
  ];
  // The flyouts' panels, drawn into their homes (#fly-*) and redrawn in place when the language or a draw mode
  // changes (an open flyout keeps its panel, and the kit's Flyout keeps whether it is open and pinned).
  function renderFlyPanels() {
    const panel = (id: string, sections: ToolSection[]) => renderSvelteView($('#' + id), ToolPanel, { sections } satisfies ToolPanelModel);
    const czLabel = uiText('fly.cz.label', 'Advanced Circuit Block ({code})', { code: '\u0000' }).split('\u0000');
    panel('fly-lines', [{ title: uiText('fly.lines', 'Lines'), symbols: lineBtns(LINE_TOOLS) }, { title: uiText('fly.freeform', 'Freeform'), symbols: lineBtns(FREE_TOOLS) }]);
    panel('fly-shapes', [{ title: uiText('fly.rectangles', 'Rectangles'), symbols: symBtns('rect') },
      { title: uiText('fly.basicShapes', 'Basic shapes'), symbols: [...PLAIN_SHAPES.map(([t, n]) => modeBtn(t, n)), ...symBtns('basic')] },
      { title: uiText('fly.flowchart', 'Flowchart'), symbols: symBtns('flow') }]);
    panel('fly-misc', [{ title: uiText('fly.misc', 'Misc'), symbols: [...symBtns('misc'), ...lineBtns(MISC_EXTRA)] }]);
    panel('fly-arrows', [{ symbols: symBtns('arrow') }]);
    panel('fly-phys', [{ title: uiText('fly.physTitle', 'Physics figures (experimental)'), warn: uiText('fly.physWarn', 'Results and drawings might not be correct.'), tiles: physDomains(), columns: 3 },
      { title: uiText('fly.mechSymbols', 'Mechanics symbols'), symbols: symBtns('mech') }, { title: uiText('fly.opticsSymbols', 'Optics symbols'), symbols: symBtns('optics') }]);
    // electrical: the common symbols and waveforms here, the full circuitikz library in the Circuit block
    panel('fly-elec', [{ title: uiText('fly.symbols', 'Symbols'), symbols: symBtns('elec') }, { title: uiText('fly.waveforms', 'Waveforms'), symbols: symBtns('wave') },
      { entry: { insert: 'cz', title: uiText('fly.cz.title', 'A circuit drawn with circuitikz parts: 415 components, wires that snap to pins'), label: [czLabel[0], 'circuitikz', czLabel[1] ?? ''],
        svg: '<svg viewBox="0 0 32 24"><path d="M4 18V6h7M21 6h7v12H4"/><path d="M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3" class="c1"/><path d="M14 18v-3M18 18v-3" class="c1"/><path d="M12 15h8M12 21h8" class="c1"/></svg>',
        help: uiText('fly.cz.help', 'Every circuitikz part, wired on a grid and exported as circuitikz.') } }]);
    panel('fly-blocks', [{ title: uiText('ui.blocks.experimental', 'Blocks (experimental)'), warn: uiText('ui.some.inputs.might.not.be.rendered.correctly', 'Some inputs might not be rendered correctly.') }, ...blockSections()]);
  }
  let flyBuilt = false;
  onLocale(() => {
    if (flyBuilt) hideModes();
    flyBuilt = true;
    renderFlyPanels();
  });
  function flyOf(t: any) {
    if (/^(solid|prim3d|revolve)\b/.test(t)) return 'figures3d';
    if (/^plot:\w*3d$/.test(t)) return 'plots3d';
    if (/^(plot|pie)/.test(t)) return 'insertPop';
    if (/^physics\b/.test(t)) return 'phys';
    if (TD.blocks.get(t)) return 'blocks';
    if ([...LINE_TOOLS, ...FREE_TOOLS].some((x) => x[0] === t)) return 'lines';
    if (MISC_EXTRA.some((x) => x[0] === t)) return 'misc';
    if (PLAIN_SHAPES.some((x) => x[0] === t)) return 'shapes';
    if (t.startsWith('sym:')) { const c = (TD.SYMS[t.slice(4)] || {}).cat; return c === 'elec' || c === 'wave' ? 'elec' : c === 'misc' ? 'misc' : c === 'arrow' ? 'arrows' : c === 'mech' || c === 'optics' ? 'phys' : 'shapes'; }
    return null;
  }
  // The tool groups are the kit's Flyouts (src/ui/AppShell.svelte): hover, pin, Esc and a press outside are theirs.
  // Their panels (#fly-*, #insertPop) are built here and kept in a hidden home while closed. Closing one closes the
  // draw-mode menu with it.
  const hideFly = () => { closeFlyouts(); hideModes(); };
  onFlyoutClose(() => hideModes());
  // the hover timings the menus that open on hover share (the draw-mode menu, the file sort menu)
  const HOVER_OPEN = 120, HOVER_CLOSE = 280;
  document.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('.fly-panel [data-pick], .fly-panel [data-insert]');
    if (!b) return;
    hideFly();
    if (state.mode === 'document') setMode('diagram');
    setTool((b as HTMLElement).dataset.pick || (b as HTMLElement).dataset.insert);
  });

  // The draw-mode menu of the Rectangle and Ellipse buttons: it opens beside the button on hover (or on a
  // right-click), lists the modes with the current one ticked, and a choice sets the mode and takes the tool.
  // It belongs to the open flyout: being over either keeps both open.
  let modeTimer = 0, modeFor = '';
  function hideModes() { clearTimeout(modeTimer); if (modeFor) closeContextMenu(); }
  function showModes(b: HTMLElement, focus = false) {
    const tool = b.dataset.modes!, cur = drawMode(tool);
    const menu = openContextMenu(DRAW_MODES[tool].map(([m, label, hint, icon]) => ({ act: `${tool}:${m}`, label: caption(label), title: caption(hint), svg: icon, checked: m === cur })), 0, 0, (act) => {
      const [t, m] = act.split(':');
      setDrawMode(t, m);
      hideFly();
      if (state.mode === 'document') setMode('diagram');
      setTool(t);
    }, { id: 'modeMenu', class: 'mode-menu', below: b.getBoundingClientRect(), owner: b, focus, minWidth: 0, label: uiText('mode.menu.aria', '{name} drawing', { name: typeName(tool) }),
      onclose: () => { clearTimeout(modeTimer); modeFor = ''; b.classList.remove('open'); } });
    modeFor = tool;
    b.classList.add('open');
    // it belongs to the open flyout: being over either keeps both open
    menu?.addEventListener('pointerenter', () => { clearTimeout(modeTimer); holdFlyout(); });
    menu?.addEventListener('pointerleave', (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('#fly-shapes')) { if (!to.closest('[data-modes]')) modeTimer = setTimeout(hideModes, HOVER_CLOSE) as any; return; }
      modeTimer = setTimeout(hideModes, HOVER_CLOSE) as any;
      releaseFlyout();
    });
  }
  function setDrawMode(tool: string, m: string) {
    drawModes[tool] = m;
    try { localStorage.setItem(MODES_KEY, JSON.stringify(drawModes)); } catch (e: any) { /* storage blocked */ }
    renderFlyPanels(); // the button shows the new way
  }
  $('#fly-shapes').addEventListener('pointerover', (e: any) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest('[data-modes]');
    clearTimeout(modeTimer);
    if (b && modeFor !== b.dataset.modes) modeTimer = setTimeout(() => { TD.tooltip && TD.tooltip.hide(); showModes(b); }, HOVER_OPEN) as any;
    else if (!b && modeFor) modeTimer = setTimeout(hideModes, HOVER_CLOSE) as any;
  });
  $('#fly-shapes').addEventListener('contextmenu', (e: any) => {
    const b = e.target.closest('[data-modes]');
    if (b) { e.preventDefault(); showModes(b, true); }
  });

  // ---------------- image insert ----------------
  // A picture goes in at most 8 cm wide, centred on `at` (the middle of the view when not given), under a file
  // name LaTeX can use that no other picture in this file has.
  function imageFileName(name: any, src: any) {
    const used = new Set(shapes().filter((q: any) => q.type === 'image').map((q: any) => TYPES.image.fileName(q)));
    const first = TD.texImages.fileName(name || 'image', src), dot = first.lastIndexOf('.');
    let out = first;
    for (let k = 2; used.has(out); k++) out = `${first.slice(0, dot)}-${k}${first.slice(dot)}`;
    return out;
  }
  function placeImage(pic: Picture, name: any, at?: any) {
    const r = stageSize(), v = state.view, w = pic.w, h = pic.h;
    const sc = Math.min(1, (8 * PX) / w, (r.h * 0.6) / v.zoom / h);
    const W = w * sc, H = h * sc, c = at || viewCentre();
    const s = addShape({ type: 'image', x: Math.round(c.x - W / 2), y: Math.round(c.y - H / 2), w: W, h: H, src: pic.src, file: '', opacity: 1 });
    s.file = imageFileName(name, pic.src);
    return s;
  }
  const stemOf = (n: any) => String(n || '').replace(/\.[^.]+$/, '');
  let imageTarget: any = null; // id of an image being replaced
  $('#imageInput').addEventListener('change', async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    let pic: Picture;
    try { pic = await readPicture(file); } catch (err: any) { imageTarget = null; showHint(uiText('hint.couldntOpenFile', "Couldn't open {name}: {error}", { name: file.name, error: err.message }), 2500); return; }
    begin();
    const old = imageTarget && byId(imageTarget);
    if (old) { old.src = pic.src; old.h = old.w * (pic.h / pic.w); old.file = ''; old.file = imageFileName(stemOf(file.name), pic.src); }
    else state.sel = new Set([placeImage(pic, stemOf(file.name)).id]);
    imageTarget = null;
    commit(); render(); renderProps();
  });
  $('#props').addEventListener('click', (e: any) => {
    const b = e.target.closest('[data-imgact]');
    if (!b) return;
    const s = selected()[0];
    if (!s || s.type !== 'image') return;
    if (b.dataset.imgact === 'replace') { imageTarget = s.id; $('#imageInput').value = ''; $('#imageInput').click(); return; }
    downloadImage(s.src, TYPES.image.fileName(s));
  });
  let hintTimer: any;
  function showHint(msg: any, ms?: any) {
    const h = $('#hint');
    h.textContent = msg; h.style.display = msg ? 'block' : 'none';
    clearTimeout(hintTimer);
    if (msg && ms) hintTimer = setTimeout(() => (h.style.display = 'none'), ms);
  }

  // Ramer–Douglas–Peucker
  function simplify(pts: any, tol: any) {
    if (pts.length < 3) return pts;
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_: any, i: any) => keep[i]);
  }
  function addShape(s: any) {
    s.id = s.id || uid();
    state.doc.shapes.push(s);
    return s;
  }
  function removeShape(id: any) {
    state.doc.shapes = state.doc.shapes.filter((s: any) => s.id !== id);
    state.sel.delete(id);
  }

  function finishPoly(e?: any) {
    if (arcDraft) arcCancel();
    if (lineDraft) lineCancel();
    if (!polyDraft) return;
    const s = byId(polyDraft);
    polyDraft = null;
    if (s) {
      s.pts.pop(); // remove rubber-band point
      if (s.corner) s.corner.length = s.pts.length;
      // drop consecutive duplicates
      const keep = s.pts.map((p: any, i: any, a: any) => i === 0 || dist({ x: p[0], y: p[1] }, { x: a[i - 1][0], y: a[i - 1][1] }) > 0.5);
      s.pts = s.pts.filter((_: any, i: any) => keep[i]);
      if (s.corner) s.corner = s.corner.filter((_: any, i: any) => keep[i]).map((c: any) => (c ? 1 : 0));
      if (s.corner && !s.corner.some(Boolean)) delete s.corner;
      if (s._draft) { delete s._draft; if (s.pts.length < 3) s.closed = false; }
      if (s.pts.length < 2) removeShape(s.id);
    }
    commit();
    state.tool = 'select';
    setTool('select');
    render(); renderProps();
  }

  // ---------------- arcs, click by click ----------------
  // Arc by centre ('arc'): the centre, then the start (radius and start angle), then the end. The arc follows
  // the way the pointer turns round the centre, so it goes either way and past 180°; Shift snaps to 15°.
  // Arc through three points ('arc3'): both ends, then a point the arc passes through.
  // The first step can also be a drag: press at the centre (or the first end) and let go at the next point.
  const angDeg = (c: any, q: any) => (Math.atan2(-(q.y - c.y), q.x - c.x) * 180) / Math.PI;
  const mod360 = (a: any) => ((a % 360) + 360) % 360;
  function circumcircle(A: any, B: any, C: any) {
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(d) < 1e-9) return null;
    const a = A.x * A.x + A.y * A.y, b = B.x * B.x + B.y * B.y, c = C.x * C.x + C.y * C.y;
    const x = (a * (B.y - C.y) + b * (C.y - A.y) + c * (A.y - B.y)) / d, y = (a * (C.x - B.x) + b * (A.x - C.x) + c * (B.x - A.x)) / d;
    const r = Math.hypot(A.x - x, A.y - y);
    return r > 50 * dist(A, B) ? null : { x, y, r }; // nearly straight: no arc yet
  }
  // the tools drawn click by click through this draft: the two arcs, a rectangle by three points and a circle
  // through three points (their tools' draw modes)
  function pointsKind(t = state.tool) {
    if (t === 'arc' || t === 'arc3') return t;
    if (t === 'rect' && drawMode('rect') === 'three') return 'rect3';
    if (t === 'ellipse' && drawMode('ellipse') === 'circle3') return 'circle3';
    return null;
  }
  const POINT_HINTS: Record<string, any[]> = {
    arc3: [message('pt.arc3.1', 'Click one end of the arc'), message('pt.arc3.2', 'Click the other end'), message('pt.arc3.3', 'Click a point the arc passes through · Esc cancels')],
    arc: [message('pt.arc.1', 'Click the centre of the arc'), message('pt.arc.2', 'Click where the arc starts (sets the radius) · Shift snaps to 15°'), message('pt.arc.3', 'Turn round the centre and click where the arc ends · Shift snaps to 15° · Esc cancels')],
    rect3: [message('pt.rect3.1', 'Click one corner of the rectangle'), message('pt.rect3.2', 'Click the next corner (sets one side and the angle) · Shift snaps to 15°'), message('pt.rect3.3', 'Click to set the other side · Esc cancels')],
    circle3: [message('hint.second.circle', 'Click a point on the circle'), message('pt.circle3.2', 'Click a second point'), message('pt.circle3.3', 'Click a third point · Esc cancels')],
  };
  function arcHint() {
    const d = arcDraft, n = d ? d.pts.length : 0, k = d ? d.tool : pointsKind();
    if (k) showHint(caption(POINT_HINTS[k][Math.min(n, 2)]));
  }
  // a rectangle with one side from A to B, as far to one side of it as q is
  function rect3(A: any, B: any, q: any) {
    const L = dist(A, B), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L, nx = -uy, ny = ux;
    const h = (q.x - A.x) * nx + (q.y - A.y) * ny;
    const cx = (A.x + B.x) / 2 + (nx * h) / 2, cy = (A.y + B.y) / 2 + (ny * h) / 2, H = Math.abs(h);
    return { x: cx - L / 2, y: cy - H / 2, w: L, h: H, angle: TD.normDeg(angDeg(A, B)) };
  }
  function arcMove(q: any, e: any) {
    const d = arcDraft, s = byId(d.id);
    d.cur = q;
    if (d.tool === 'rect3' || d.tool === 'circle3') {
      if (d.pts.length < 2) return;
      if (d.tool === 'rect3') { Object.assign(s!, rect3(d.pts[0], d.pts[1], q)); return; }
      const C = circumcircle(d.pts[0], d.pts[1], q);
      Object.assign(s!, C ? { cx: C.x, cy: C.y, rx: C.r, ry: C.r } : { rx: 0, ry: 0 });
      return;
    }
    if (d.tool === 'arc') {
      if (d.pts.length < 2) return;
      let ang = angDeg(d.pts[0], q);
      ang = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang * 10) / 10;
      d.sweep = Math.max(-360, Math.min(360, d.sweep + mod360(ang - d.last + 180) - 180));
      d.last = ang;
      if (d.sweep >= 0) { s!.a1 = d.a0; s!.a2 = d.a0 + d.sweep; } else { s!.a1 = d.a0 + d.sweep; s!.a2 = d.a0; }
      return;
    }
    if (d.pts.length < 2) return;
    const [P1, P2] = d.pts, C = circumcircle(P1, P2, q);
    if (!C) { s!.r = 0; return; }
    const A1 = angDeg(C, P1), A2 = angDeg(C, P2), Aq = angDeg(C, q);
    Object.assign(s!, { cx: C.x, cy: C.y, r: C.r });
    if (mod360(Aq - A1) < mod360(A2 - A1)) { s!.a1 = A1; s!.a2 = A1 + mod360(A2 - A1); }
    else { s!.a1 = A2; s!.a2 = A2 + mod360(A1 - A2); }
  }
  function arcStep(q: any, e: any) {
    const d = arcDraft, s = byId(d.id), far = (a: any, b: any) => dist(a, b) * state.view.zoom >= 4;
    if (d.pts.length === 1) {
      if (!far(d.pts[0], q)) return;
      if (d.tool === 'rect3' && e.shiftKey) { const P = d.pts[0], a = Math.round(angDeg(P, q) / 15) * 15 * Math.PI / 180, L = dist(P, q); q = { x: P.x + L * Math.cos(a), y: P.y - L * Math.sin(a) }; }
      d.pts.push(q);
      if (d.tool === 'arc') {
        let a0 = angDeg(d.pts[0], q);
        a0 = e.shiftKey ? Math.round(a0 / 15) * 15 : Math.round(a0 * 10) / 10;
        Object.assign(d, { a0, sweep: 0, last: a0 });
        Object.assign(s!, { r: dist(d.pts[0], q), a1: a0, a2: a0 });
      }
      arcHint();
      return;
    }
    arcMove(q, e);
    if (d.tool === 'rect3' || d.tool === 'circle3') {
      if (!TYPES[s!.type].valid(s) || !far(d.pts[0], q) || !far(d.pts[1], q)) return;
      arcDraft = null; snapHint = null;
      commit(); setTool('select');
      render(); renderProps();
      return;
    }
    if (d.tool === 'arc' ? Math.abs(d.sweep) < 0.5 : !(s!.r > 0) || !far(d.pts[0], q) || !far(d.pts[1], q)) return;
    arcDraft = null;
    if (s!.a1 < 0 || s!.a1 >= 360) { const k = Math.floor(s!.a1 / 360) * 360; s!.a1 -= k; s!.a2 -= k; }
    if (!TYPES.arc.valid(s)) removeShape(s!.id);
    snapHint = null;
    commit();
    setTool('select');
    render(); renderProps();
  }
  function lineCancel() {
    const s = byId(lineDraft.id);
    lineDraft = null; linkHint = null; snapHint = null;
    if (s) removeShape(s.id);
    commit(); render(); renderProps();
  }
  // the free end of a line being drawn follows the pointer (a drag, or a two-click line between its clicks)
  function createMove(d: any, p: any, e: any) {
    const s = byId(d.id);
    if (!s) return;
    let q = snapPoint(p, e, new Set([d.id]));
    const lk = CONNECT.has(s.type) && !e.shiftKey && linkAt(p, q, e, s.id);
    if (lk) q = { ...linkPoint(lk), anchor: true };
    d.lk = lk || null; linkHint = lk ? lk.id : null;
    snapHint = q;
    TYPES[s.type].drag(s, d.a, q, e, d.dm);
    render();
  }
  function arcCancel() {
    const s = byId(arcDraft.id);
    arcDraft = null;
    if (s) removeShape(s.id);
    snapHint = null;
    commit(); render(); renderProps();
  }
  function arcDown(p: any, e: any) {
    const q = snapPoint(p, e, arcDraft ? new Set([arcDraft.id]) : null);
    if (!arcDraft) {
      begin();
      const kind = pointsKind()!, type = kind === 'rect3' ? 'rect' : kind === 'circle3' ? 'ellipse' : 'arc';
      const s = addShape(TYPES[type].create(q, state.defaults));
      state.sel = new Set([s.id]);
      arcDraft = { tool: kind, id: s.id, pts: [q], cur: q };
    } else arcStep(q, e);
    if (arcDraft) { arcDraft.down = { x: e.clientX, y: e.clientY }; arcHint(); }
    render();
  }
  // letting go after a drag sets the next point; a plain click waits for the next click
  svg.addEventListener('pointerup', (e: any) => {
    const d = arcDraft;
    if (!d || !d.down) return;
    const moved = Math.hypot(e.clientX - d.down.x, e.clientY - d.down.y) > 6;
    d.down = null;
    if (moved && d.pts.length === 1) { arcStep(snapPoint(toWorld(e), e, new Set([d.id])), e); render(); }
  });

  // ---------------- rotate by dragging just outside a corner (like Photoshop) ----------------
  // the frame is the shape's own (rotated) box for one shape, else the selection's bounding box
  // blocks whose content never turns: rotating one alone does nothing, so it gets no rotate zone, hint or menu item
  const fixedContent = (type: any) => !!(TD.blocks.get(type) || {}).fixed || ['plot', 'solid', 'prim3d', 'revolve', 'tikz'].includes(type);
  const rotatable = (sel = selected()) => sel.length > 1 || (sel.length === 1 && !fixedContent(sel[0].type));
  // an elbow connector alone can be flipped but not turned: it always runs in right angles
  const turnable = (sel = selected()) => rotatable(sel) && !(sel.length === 1 && sel[0].type === 'line' && TD.routeOf(sel[0]) === 'elbow');
  function rotFrame() {
    const sel = selected();
    if (!sel.length || state.tool !== 'select' || !turnable(sel)) return null;
    let C = null;
    const G = selFrame();
    if (sel.length === 1 && (TD.ROT_TYPES.has(sel[0].type) || sel[0].type === 'sym' || sel[0].type === 'arc')) C = TD.rotFrame(sel[0]);
    if (!C) { const b = G ? G.F : unionBox(sel); C = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]; }
    const cx = (C[0][0] + C[2][0]) / 2, cy = (C[0][1] + C[2][1]) / 2;
    const H = sel.length === 1 ? TYPES[sel[0].type].handles(sel[0]) : G ? G.H : []; // the resize handles actually drawn
    return { C, cx, cy, H };
  }
  // A selection of two or more objects (a group, several groups, loose shapes or a mix) is resized as one by eight
  // handles on its frame, drawn GRP_OUT screen px outside what it holds: B is the box of its members, F the frame, H
  // the handles on it, one whether it is one whole group (whose own frame F is). Null for one object or none.
  function selFrame() {
    const sel = selected();
    if (sel.length < 2 || state.tool !== 'select') return null;
    const B = unionBox(sel), o = GRP_OUT / state.view.zoom, F = { x: B.x - o, y: B.y - o, w: B.w + 2 * o, h: B.h + 2 * o };
    return { B, F, H: TD.box.handles(F), one: !!sel[0].g && sel.every((s: any) => s.g === sel[0].g) };
  }
  // the members' box after a drag of handle k by (dx, dy): the opposite side holds, the box never turns inside out,
  // and Shift at a corner keeps its proportions
  function selResize(B: any, k: string, dx: number, dy: number, e: any) {
    const MIN = 4 / state.view.zoom;
    let x1 = B.x, y1 = B.y, x2 = B.x + B.w, y2 = B.y + B.h;
    if (k.includes('w')) x1 = Math.min(x1 + dx, x2 - MIN);
    if (k.includes('e')) x2 = Math.max(x2 + dx, x1 + MIN);
    if (k.includes('n')) y1 = Math.min(y1 + dy, y2 - MIN);
    if (k.includes('s')) y2 = Math.max(y2 + dy, y1 + MIN);
    if (e.shiftKey && k.length === 2 && B.w > 0 && B.h > 0) {
      const f = Math.max((x2 - x1) / B.w, (y2 - y1) / B.h), w = B.w * f, h = B.h * f;
      if (k.includes('w')) x1 = x2 - w; else x2 = x1 + w;
      if (k.includes('n')) y1 = y2 - h; else y2 = y1 + h;
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const insideQuad = (C: any, x: any, y: any) => {
    let sgn = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 4], cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cr) < 1e-9) continue;
      if (sgn && Math.sign(cr) !== sgn) return false;
      sgn = Math.sign(cr);
    }
    return true;
  };
  // Rotate zone: a small tab straight out from the middle of each edge, never along the whole edge or around a
  // corner. The pointer counts when its foot on an edge lies within ROT_HALF screen px of the edge's midpoint
  // (less on a short edge) and it sits ROT_IN to ROT_OUT screen px out along the outward normal. Anything
  // within HANDLE_CLEAR px of a resize handle the shape really has, and anything over another (unselected)
  // shape, is never rotate. Returns the aim point, or null.
  const ROT_IN = 9, ROT_OUT = 26, ROT_HALF = 14, HANDLE_CLEAR = 9;
  function rotZone(p: any, F = rotFrame(), target: any = null) {
    if (!F || insideQuad(F.C, p.x, p.y)) return null;
    const hit = target && target.closest && target.closest('[data-id]');
    if (hit && !state.sel.has(hit.dataset.id)) return null; // a click on another shape selects it
    const z = state.view.zoom, C = F.C;
    if (F.H.some((h: any) => Math.hypot(p.x - h.x, p.y - h.y) * z < HANDLE_CLEAR)) return null;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 4];
      const L = Math.hypot(bx - ax, by - ay);
      if (!L) continue;
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      const t = (p.x - ax) * ux + (p.y - ay) * uy;             // along the edge (world)
      let n = (p.x - ax) * -uy + (p.y - ay) * ux;              // across it (world)
      if ((F.cx - ax) * -uy + (F.cy - ay) * ux > 0) n = -n;    // make outward positive
      if (n * z < ROT_IN || n * z > ROT_OUT || Math.abs(t - L / 2) * z > Math.min(ROT_HALF, L * z / 2)) continue;
      return [p.x, p.y];
    }
    return null;
  }
  const ROT_CUR: Record<string, any> = {};
  function rotCursor(deg: any) {
    const k = Math.round(deg / 15) * 15;
    if (!ROT_CUR[k]) {
      const g = `<g transform='rotate(${k} 12 12)'><path d='M5.5 13.5Q12 5 18.5 13.5' fill='none' stroke='S' stroke-width='W' stroke-linecap='round'/><path d='M3.4 16.4L8.4 14.6L4 11Z M20.6 16.4L15.6 14.6L20 11Z' fill='S' stroke='S' stroke-width='V' stroke-linejoin='round'/></g>`;
      const svgc = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${g.replace(/S/g, 'white').replace(/W/g, '4').replace(/V/g, '2.4')}${g.replace(/S/g, 'black').replace(/W/g, '1.5').replace(/V/g, '0.6')}</svg>`;
      ROT_CUR[k] = `url("data:image/svg+xml,${encodeURIComponent(svgc)}") 12 12, alias`;
    }
    return ROT_CUR[k];
  }
  function setRotCursor(F: any, q: any) {
    if (!q) { svg.classList.remove('rot-zone'); return; }
    const [x, y] = q;
    svg.style.setProperty('--rot-cur', rotCursor((Math.atan2(y - F.cy, x - F.cx) * 180) / Math.PI + 90));
    svg.classList.add('rot-zone');
  }

  // ---------------- pointer interaction ----------------
  svg.addEventListener('pointerdown', (e: any) => {
    if (editing) finishEdit();
    const p = toWorld(e);
    if (e.button === 1 || (e.button === 0 && (spaceDown || state.tool === 'hand'))) {
      e.preventDefault();
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: { ...state.view } };
      svg.classList.add('panning');
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    if (state.tool === 'magnify') { magnifier.show(e); return; }
    if (state.tool === 'bucket') {
      const hit = [...shapes()].reverse().find(s => canBucketFill(s) && TD.containsClosedShape(s, p));
      if (!hit) { showHint(uiText('assist.bucketClosed', 'Choose a closed, unlocked shape.'), 1200); return; }
      const targets = e.shiftKey && state.sel.has(hit.id) ? selected().filter(canBucketFill) : [hit];
      fillShapes(targets,e.altKey); renderProps(); return;
    }
    const guide = e.target.closest?.('[data-guide-id]');
    if (guide && state.tool === 'select' && guideMode === 'show') {
      const id = guide.dataset.guideId, now = performance.now();
      selectedGuide = id; state.sel.clear(); renderOverlay(); renderProps();
      if (guidePress?.id === id && now-guidePress.t < 350 && Math.hypot(e.clientX-guidePress.x,e.clientY-guidePress.y)<6) { guidePress=null; void editGuide(id); return; }
      guidePress = {id,t:now,x:e.clientX,y:e.clientY};
      begin(); drag = { mode:'guide', guide:home().guides!.find(g=>g.id===id), beforeGuides:clone(home().guides || null) }; return;
    }
    selectedGuide = null; guidePress = null;
    if (lineDraft) { // the second click of a two-click line: it ends where this press lets go
      drag = { ...lineDraft, second: true }; lineDraft = null;
      createMove(drag, p, e);
      return;
    }
    const now = e.timeStamp; // when the press happened, not when a busy page got to it: two quick presses stay a double-click
    const dbl = now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const hitG = e.target.closest && e.target.closest('[data-id]');
    const hitId = hitG && hitG.dataset.id;

    if (state.tool === 'pencil') {
      begin();
      const s = addShape(TYPES.poly.create(p, state.defaults));
      s.pts = [[p.x, p.y]]; s.smooth = true;
      state.sel = new Set(); // no handles while drawing; selected on release
      drag = { mode: 'pencil', id: s.id };
      render();
      return;
    }
    if (pointsKind()) { arcDown(p, e); return; }
    if (state.tool === 'poly' || state.tool === 'blob' || state.tool === 'smoothcurve' || state.tool === 'curvpen') {
      const q = snapPoint(p, e, polyDraft ? new Set([polyDraft]) : null);
      if (!polyDraft) {
        begin();
        const s = addShape(TYPES.poly.create(q, state.defaults));
        // tension marks a TikZ `plot[smooth]` curve (0.5 is TikZ's own default)
        if (state.tool === 'blob') { s.smooth = true; s.tension = 0.5; s.closed = true; s._draft = true; }
        if (state.tool === 'smoothcurve') { s.smooth = true; s.tension = 0.5; }
        if (state.tool === 'curvpen') { s.smooth = true; s.curv = true; s.corner = [e.altKey ? 1 : 0, 0]; }
        polyDraft = s.id; state.sel = new Set([s.id]);
      } else {
        const s = byId(polyDraft);
        if (s!.curv) {
          // Curvature pen: a double-click makes the point just placed a corner (Photoshop's way); Alt-click places one
          if (dbl) { s!.corner[s!.pts.length - 2] = 1; render(); return; }
          const first = { x: s!.pts[0][0], y: s!.pts[0][1] };
          if (s!.pts.length >= 3 && dist(first, p) < 8 / state.view.zoom) { if (e.altKey) s!.corner[0] = 1; s!.closed = true; finishPoly(); return; }
          s!.pts[s!.pts.length - 1] = [q.x, q.y]; s!.corner[s!.pts.length - 1] = e.altKey ? 1 : 0;
          s!.pts.push([q.x, q.y]); s!.corner.push(0);
          render();
          return;
        }
        if (dbl) { finishPoly(); return; }
        const first = { x: s!.pts[0][0], y: s!.pts[0][1] };
        if (s!.pts.length >= 3 && dist(first, p) < 8 / state.view.zoom) { s!.closed = true; finishPoly(); return; }
        s!.pts[s!.pts.length - 1] = [q.x, q.y];
        s!.pts.push([q.x, q.y]);
      }
      render();
      return;
    }

    if (state.tool === 'text' || state.tool === 'math') {
      const math = state.tool === 'math';
      if (hitId && (byId(hitId))!.text !== undefined) { state.sel = new Set([hitId]); startEdit(hitId, 'text'); setTool('select'); return; }
      // click: a line of text at that point; drag: a paragraph box of that size (see endDrag)
      const q = snapPoint(p, e);
      drag = { mode: 'textframe', math, a: q };
      marquee = { a: q, b: q, text: true };
      renderOverlay();
      return;
    }

    if (state.tool !== 'select') {
      const tool = state.tool, type = toolType(tool);
      begin();
      let q = snapPoint(p, e);
      const lk = CONNECT.has(type) && linkAt(p, q, e);
      if (lk) q = linkPoint(lk);
      const s = addShape(TYPES[type].create(q, state.defaults, tool));
      if (lk) s.link1 = lk;
      state.sel = new Set([s.id]);
      drag = { mode: 'create', id: s.id, a: q, dm: DRAW_MODES[tool] ? drawMode(tool) : undefined, c0: { x: e.clientX, y: e.clientY } };
      render();
      return;
    }

    // select tool
    const ap = e.target.closest && e.target.closest('[data-addpt]');
    if (ap) {
      const s = byId(ap.dataset.hid), i = +ap.dataset.addpt, before = clone(s);
      begin();
      polyInsert(s, i);
      state.vertex = { id: s!.id, i: i + 1 };
      drag = { mode: 'handle', id: s!.id, key: 'v' + (i + 1), orig: clone(s), before };
      render(); renderProps();
      return;
    }
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h && h.dataset.frame) {
      const G = selFrame();
      if (!G) return;
      begin();
      const hp = G.H.find((q: any) => q.k === h.dataset.handle);
      drag = { mode: 'gresize', key: h.dataset.handle, B: G.B, hp, p0: p, orig: new Map(selected().map((s: any) => [s.id, clone(s)])) };
      svg.style.setProperty('--drag-cur', h.style.cursor || 'move'); svg.classList.add('drag-cur');
      return;
    }
    if (h) {
      const hs = byId(h.dataset.hid);
      if (hs && hs.type === 'poly' && /^v\d+$/.test(h.dataset.handle)) {
        const i = +h.dataset.handle.slice(1);
        if (dbl) { if (hs.curv) polyCorner(hs, i); else polyRemove(hs, i); return; }
        state.vertex = { id: hs.id, i };
        renderOverlay(); renderProps();
      }
      begin();
      const hs0 = byId(h.dataset.hid), before = clone(hs0); // (before: what Esc puts back)
      if (CONNECT.has(hs0!.type) && END[h.dataset.handle]) delete hs0![END[h.dataset.handle][0]]; // re-attached where it's dropped
      drag = { mode: 'handle', id: h.dataset.hid, key: h.dataset.handle, orig: clone(hs0), p0: p, before };
      svg.style.setProperty('--drag-cur', h.style.cursor || 'move'); svg.classList.add('drag-cur'); // keep it while the pointer outruns the handle
      return;
    }
    {
      const F = rotFrame(), zq = rotZone(p, F, e.target);
      if (zq) {
        begin();
        drag = { mode: 'rotate', cx: F!.cx, cy: F!.cy, a0: Math.atan2(p.y - F!.cy, p.x - F!.cx), orig: new Map(selected().map((s: any) => [s.id, clone(s)])), F, zq };
        setRotCursor(F, zq);
        return;
      }
    }
    if (hitId) {
      if (dbl) {
        const s = byId(hitId);
        if (s!.type === 'text' || (s!.type === 'sym' && s!.text !== undefined)) { startEdit(hitId, 'text'); return; }
        if (s!.type === 'line' || s!.type === 'curve') { startEdit(hitId, 'label'); return; }
        if (BOXED.has(s!.type) && (s!.type !== 'poly' || s!.closed)) { labelInside(s); return; }
        if (TD.blocks.editable(s!.type)) {
          state.sel = new Set([hitId]);
          if ((TD.blocks.get(s!.type))!.refreshOnDoubleClick !== false) { render(); renderProps(); }
          openBlock(hitId); return;
        }
      }
      // Groups select as one on the first click. A second click (without dragging) on a member of the selected
      // group selects that member alone; while inside a group, a click on another member selects just it.
      const grp = groupIds(hitId), hg = (byId(hitId))!.g, cur = selected();
      const wholeGroup = hg && cur.length === grp.length && grp.every((id: any) => state.sel.has(id));
      const inGroup = hg && cur.length && !wholeGroup && cur.every((q: any) => q.g === hg);
      let narrow = null;
      if (e.shiftKey) { if (state.sel.has(hitId)) grp.forEach((id: any) => state.sel.delete(id)); else grp.forEach((id: any) => state.sel.add(id)); }
      else if (inGroup && !state.sel.has(hitId)) state.sel = new Set([hitId]);
      else if (!state.sel.has(hitId)) state.sel = new Set(grp);
      else if (wholeGroup && grp.length > 1) narrow = hitId;
      if (state.sel.has(hitId)) {
        begin();
        const sel = selected(), fast = sel.length > FAST_DRAG;
        drag = { mode: 'move', a: p, narrow, cx: e.clientX, cy: e.clientY, orig: new Map(sel.map((s: any) => [s.id, fast ? s : clone(s)])), ref: TYPES[(byId(hitId))!.type].anchors(byId(hitId))[0] };
        if (fast) startFastMove(drag);
      }
      renderOverlay(); renderProps();
      return;
    }
    // a double-click inside a box drawn without a fill (only its outline is hit): label it, as on its outline
    if (dbl && state.tool === 'select') {
      const box = [...shapes()].reverse().find((s: any) => BOXED.has(s.type) && (s.type !== 'poly' || s.closed) && !s.hidden && !s.locked && TD.containsClosedShape(s, p));
      if (box) { state.sel = new Set([box.id]); labelInside(box); return; }
    }
    if (!e.shiftKey) state.sel.clear();
    drag = { mode: 'marquee', base: new Set(state.sel) };
    marquee = { a: p, b: p };
    renderOverlay(); renderProps();
  });
  // A press that opened an edit (a double-click on text, a label or inside a box: the handler above finishes any
  // other edit first) keeps the focus in its box. Otherwise the mousedown that follows moves the focus off it, and
  // keys typed straight after the double-click reach the canvas's shortcuts.
  svg.addEventListener('pointerdown', (e: PointerEvent) => { if (editing) e.preventDefault(); });

  svg.addEventListener('pointermove', (e: any) => {
    const p = toWorld(e);
    $('#cursorPos').textContent = `x ${fx(p.x / PX)} · y ${fx(-p.y / PX)} cm`;
    cursorW = p; moveRulerCursor();
    if (state.tool === 'magnify') { magnifier.show(e); return; }
    if (state.tool === 'bucket' && !drag) return;
    if (!drag) {
      if (lineDraft) { createMove(lineDraft, p, e); return; }
      if (arcDraft) {
        const q = snapPoint(p, e, new Set([arcDraft.id]));
        arcMove(q, e);
        snapHint = q;
        render();
        return;
      }
      if (polyDraft) {
        const s = byId(polyDraft);
        let q = snapPoint(p, e, new Set([polyDraft]));
        if (e.shiftKey && s!.pts.length >= 2) { const prev = s!.pts[s!.pts.length - 2]; q = TD.constrain({ x: prev[0], y: prev[1] }, q); }
        s!.pts[s!.pts.length - 1] = [q.x, q.y];
        snapHint = q;
        render();
        return;
      }
      if (state.tool !== 'select') {
        snapHint = snapPoint(p, e);
        const lk = CONNECT.has(toolType(state.tool)) && linkAt(p, snapHint, e);
        linkHint = lk ? lk.id : null;
        if (lk) snapHint = { ...linkPoint(lk), anchor: true };
        renderOverlay();
      }
      else if (!(e.target.closest && e.target.closest('[data-handle],[data-addpt]'))) { const F = rotFrame(); setRotCursor(F, rotZone(p, F, e.target)); }
      else setRotCursor(null, null);
      return;
    }
    switch (drag.mode) {
      case 'guide': { drag.guide.position = drag.guide.axis === 'x' ? p.x : p.y; renderOverlay(); break; }
      case 'pan': {
        state.view.x = drag.v.x - (e.clientX - drag.sx) / state.view.zoom;
        state.view.y = drag.v.y - (e.clientY - drag.sy) / state.view.zoom;
        renderView();
        break;
      }
      case 'move': {
        smartLines = [];
        let dx = p.x - drag.a.x, dy = p.y - drag.a.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (state.snap && !e.altKey) {
          // try snapping any selected anchor to another shape's anchor, else snap reference to grid
          const thr = 8 / state.view.zoom;
          let best = null, bd = thr;
          if (snapObjects()) {
            // other shapes' anchors in a grid of thr-sized cells, made once per drag (and again after a zoom)
            if (!drag.snapIdx || drag.snapIdx.thr !== thr) {
              const cells = new Map();
              for (const sh of shapes()) if (!state.sel.has(sh.id)) for (const t of TYPES[sh.type].anchors(sh)) {
                const k = Math.floor(t.x / thr) + ',' + Math.floor(t.y / thr);
                (cells.get(k) || cells.set(k, []).get(k)).push(t);
              }
              // a large selection snaps by the corners, edge middles and centre of its bounding box
              let mine;
              if (drag.fast) {
                const B = unionBox([...drag.orig.values()]);
                mine = [];
                for (const x of [B.x, B.x + B.w / 2, B.x + B.w]) for (const y of [B.y, B.y + B.h / 2, B.y + B.h]) mine.push({ x, y });
              } else mine = [...drag.orig.values()].flatMap((o) => TYPES[o.type].anchors(o));
              drag.snapIdx = { thr, cells, mine };
            }
            const { cells, mine } = drag.snapIdx;
            for (const a of mine) {
              const m = { x: a.x + dx, y: a.y + dy }, cx = Math.floor(m.x / thr), cy = Math.floor(m.y / thr);
              for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                const near = cells.get((cx + i) + ',' + (cy + j));
                if (near) for (const t of near) { const d = dist(m, t); if (d < bd) { bd = d; best = { dx: t.x - a.x, dy: t.y - a.y, pt: t }; } }
              }
            }
          }
          if (best) { dx = best.dx; dy = best.dy; snapHint = { ...best.pt, anchor: true }; }
          else {
            const g = TD.GRID, rx = drag.ref.x + dx, ry = drag.ref.y + dy;
            const snapped = snapGrid() ? snapCanvasGrid({ x: rx, y: ry }, g, gridStyle()) : {x:rx,y:ry};
            if (!snapObjects()) { dx=snapped.x-drag.ref.x; dy=snapped.y-drag.ref.y; snapHint=null; } else {
              if (!drag.smart) drag.smart = { box: unionBox([...drag.orig.values()]), others: shapes().filter(s => !s.hidden && !state.sel.has(s.id) && !CONNECT.has(s.type)).map(s => TD.nodeFeatures?.bodyBox(s) || TD.bbox(s)) };
              if (!drag.smart.index) drag.smart.index = createSnapIndex(drag.smart.others);
              const match = snapTranslation(drag.smart.box, dx, dy, drag.smart.others, activeGuides(), thr, !e.shiftKey, drag.smart.index);
              dx = match.snappedX ? match.dx : snapped.x - drag.ref.x;
              dy = match.snappedY ? match.dy : snapped.y - drag.ref.y;
              smartLines = match.lines; snapHint = null;
            }
          }
        }
        drag.moved = true;
        if (drag.fast) { fastMove(drag, dx, dy); break; }
        for (const [id, o] of drag.orig) {
          const s = byId(id);
          Object.assign(s!, clone(o));
          TD.translate(s, dx, dy);
        }
        if (dx || dy) detachFrom(selected(), state.sel);
        render();
        break;
      }
      case 'rotate': {
        let deg = ((Math.atan2(p.y - drag.cy, p.x - drag.cx) - drag.a0) * 180) / Math.PI;
        deg = TD.normDeg(deg);
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        else deg = Math.round(deg * 10) / 10;
        for (const [id, o] of drag.orig) {
          const s = byId(id);
          for (const k of Object.keys(s!)) if (!(k in o)) delete s![k]; // e.g. an `angle` added by the previous frame
          Object.assign(s!, clone(o));
          TD.rotateShape(s, drag.cx, drag.cy, deg);
        }
        if (deg) detachFrom(selected(), state.sel);
        const [x, y] = drag.zq, a = Math.atan2(y - drag.cy, x - drag.cx) + (deg * Math.PI) / 180;
        svg.style.setProperty('--rot-cur', rotCursor((a * 180) / Math.PI + 90));
        const one = drag.orig.size === 1 ? byId([...drag.orig.keys()][0]) : null;
        showHint(one && one.angle !== undefined ? `${fx(one.angle)}°` : `${fx(-deg)}°`, 600);
        drag.moved = true;
        render(); renderGeom();
        break;
      }
      case 'handle': {
        const s = byId(drag.id);
        Object.assign(s!, clone(drag.orig));
        let q = snapPoint(p, e, new Set([drag.id]));
        const lk = CONNECT.has(s!.type) && END[drag.key] && !e.shiftKey && linkAt(p, q, e, s!.id);
        if (lk) q = { ...linkPoint(lk), anchor: true };
        drag.lk = lk || null; linkHint = lk ? lk.id : null;
        snapHint = q.anchor ? q : null;
        TYPES[s!.type].setHandle(s, drag.key, q, e, drag.orig, drag.p0);
        render(); renderGeom();
        break;
      }
      case 'gresize': {
        // the handle snaps where a handle would (the grid, other shapes' anchors); the members follow the box
        const k = drag.key, at = { x: drag.hp.x + p.x - drag.p0.x, y: drag.hp.y + p.y - drag.p0.y };
        const q = snapPoint(at, e, new Set(drag.orig.keys()));
        snapHint = q.anchor ? q : null;
        const nb = selResize(drag.B, k, k.includes('w') || k.includes('e') ? q.x - drag.hp.x : 0, k.includes('n') || k.includes('s') ? q.y - drag.hp.y : 0, e);
        for (const [id, o] of drag.orig) {
          const s = byId(id);
          for (const key of Object.keys(s!)) if (!(key in o)) delete s![key];
          Object.assign(s!, clone(o));
          TD.scaleShape(s, drag.B, nb);
        }
        detachFrom(selected(), state.sel);
        showHint(`${Math.round((nb.w / (drag.B.w || 1)) * 100)}% × ${Math.round((nb.h / (drag.B.h || 1)) * 100)}%`, 600);
        drag.moved = true;
        render(); renderGeom();
        break;
      }
      case 'create': createMove(drag, p, e); break;
      case 'pencil': {
        const s = byId(drag.id), l = s!.pts[s!.pts.length - 1];
        if (Math.hypot(p.x - l[0], p.y - l[1]) > 2 / state.view.zoom) { s!.pts.push([p.x, p.y]); render(); }
        break;
      }
      case 'textframe': {
        const q = snapPoint(p, e);
        snapHint = q.anchor ? q : null;
        marquee.b = q;
        renderOverlay();
        break;
      }
      case 'marquee': {
        marquee.b = p;
        const x1 = Math.min(marquee.a.x, p.x), y1 = Math.min(marquee.a.y, p.y), x2 = Math.max(marquee.a.x, p.x), y2 = Math.max(marquee.a.y, p.y);
        // left-to-right: window (shapes wholly inside); right-to-left: crossing (anything the box touches)
        const cross = marquee.cross = p.x < marquee.a.x;
        const R = { x1, y1, x2, y2 };
        state.sel = new Set(drag.base);
        for (const s of shapes()) {
          const b = TD.bbox(s);
          if (b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2) state.sel.add(s.id);
          else if (cross && b.x <= x2 && b.x + b.w >= x1 && b.y <= y2 && b.y + b.h >= y1 && touchesRect(s, R)) state.sel.add(s.id);
        }
        expandGroups();
        renderOverlay();
        break;
      }
    }
  });

  // Does shape s actually touch the world-space rect R ({x1,y1,x2,y2})? Tested against what is drawn:
  // its hit outline (sampled along its length) and, for filled areas, whether the box lies inside the fill.
  function touchesRect(s: any, R: any) {
    const g = content.querySelector(`[data-id="${s.id}"]`);
    if (!g) return true; // nothing rendered to test: the bbox overlap stands
    let els = [...g.querySelectorAll('.hit, .hitfill')];
    if (!els.length) els = [...g.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')];
    if (!els.length) return true;
    const toWorld = content.getCTM().inverse();
    const step = 3 / state.view.zoom;
    const inR = (q: any) => q.x >= R.x1 && q.x <= R.x2 && q.y >= R.y1 && q.y <= R.y2;
    const cx = (R.x1 + R.x2) / 2, cy = (R.y1 + R.y2) / 2;
    for (const el of els) {
      if (!el.getTotalLength) continue;
      const m = toWorld.multiply(el.getCTM()), inv = m.inverse();
      const P = (x: any, y: any) => new DOMPoint(x, y).matrixTransform(m);
      let len = 0;
      try { len = el.getTotalLength(); } catch (e: any) { continue; }
      // sampling step in local units ~ 3 screen px
      const sc = Math.hypot(m.a, m.b) || 1, n = Math.min(4000, Math.max(8, Math.ceil(len * sc / step)));
      for (let i = 0; i <= n; i++) { const q = el.getPointAtLength((len * i) / n); if (inR(P(q.x, q.y))) return true; }
      // box sitting inside a filled area (or wholly inside a stroke's hit band)
      if (el.isPointInFill && el.classList.contains('hitfill')) {
        const c = new DOMPoint(cx, cy).matrixTransform(inv);
        try { if (el.isPointInFill(c)) return true; } catch (e: any) { /* ignore */ }
      }
    }
    return false;
  }

  // whether a click alone leaves this new shape standing (a symbol takes its own size; a rectangle doesn't)
  function clickMakes(s: any) {
    const t = TYPES[s.type], c = clone(s);
    if (t.fix) t.fix(c);
    return t.valid(c);
  }
  // Esc while dragging: what the drag changed goes back as it was, and nothing is added to undo. A shape being drawn
  // goes; a move, a resize or a turn returns; a marquee leaves the selection as it found it. (A pan is left be.)
  function cancelDrag() {
    const d = drag;
    if (!d || d.mode === 'pan') return false;
    const putBack = (q: any, o: any) => { if (!q || q === o) return; for (const k of Object.keys(q)) if (!(k in o)) delete q[k]; Object.assign(q, clone(o)); };
    drag = null; snapHint = null; linkHint = null; smartLines = [];
    svg.classList.remove('drag-cur', 'rot-zone');
    if (d.mode === 'create' || d.mode === 'pencil') { removeShape(d.id); state.sel.clear(); }
    else if (d.mode === 'move' || d.mode === 'rotate' || d.mode === 'gresize') {
      if (d.fast) { d.off = { dx: 0, dy: 0 }; fastLinks(d); endFastMove(d); }
      else for (const [id, o] of d.orig) putBack(byId(id), o);
    } else if (d.mode === 'handle') putBack(byId(d.id), d.before || d.orig);
    else if (d.mode === 'marquee') { marquee = null; state.sel = new Set(d.base); }
    else if (d.mode === 'textframe') marquee = null;
    else if (d.mode === 'guide') { if (d.beforeGuides) home().guides = d.beforeGuides; else delete home().guides; }
    documentHistory.cancel();
    render(); renderProps();
    return true;
  }
  function endDrag(e: any) {
    if (!drag) return;
    const d = drag;
    if (d.mode === 'guide' && e?.type === 'pointercancel') { if (d.beforeGuides) home().guides = d.beforeGuides; else delete home().guides; drag = null; documentHistory.cancel(); renderOverlay(); renderProps(); return; }
    // a click (no drag) on a member of the selected group: select that member alone
    if (d.mode === 'move' && d.narrow && (!d.moved || (e && e.clientX != null && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) <= 3))) {
      if (d.fast) endFastMove(d);
      for (const [id, o] of d.orig) { const q = byId(id); if (q && o !== q) Object.assign(q, clone(o)); }
      drag = null; snapHint = null;
      svg.classList.remove('drag-cur');
      commit();
      state.sel = new Set([d.narrow]);
      render(); renderProps();
      return;
    }
    drag = null;
    svg.classList.remove('panning', 'drag-cur');
    if (d.mode === 'rotate') svg.classList.remove('rot-zone');
    smartLines = [];
    if (d.mode === 'guide') {
      const r = svg.getBoundingClientRect();
      const ruler = $(d.guide.axis === 'x' ? '#rulerY' : '#rulerX').getBoundingClientRect();
      const onRuler = e && e.clientX >= ruler.left && e.clientX <= ruler.right && e.clientY >= ruler.top && e.clientY <= ruler.bottom;
      if (e && (onRuler || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) home().guides = home().guides?.filter(g => g.id !== d.guide.id);
      commit(); renderOverlay(); renderProps(); return;
    }
    if (d.mode === 'pan') { scheduleSave(); return; }
    if (d.mode === 'textframe') {
      const b = marquee.b, z = state.view.zoom;
      marquee = null; snapHint = null;
      const w = Math.abs(b.x - d.a.x), h = Math.abs(b.y - d.a.y);
      begin();
      const s = addShape(TYPES.text.create(d.a, state.defaults));
      // a drag of at least ~12 screen px each way makes a paragraph box; anything less is a click
      if (w * z >= 12 && h * z >= 12) {
        s.tw = w; s.th = h; s.align = 'left';
        s.x = Math.min(b.x, d.a.x) + w / 2; s.y = Math.min(b.y, d.a.y) + h / 2;
      }
      state.sel = new Set([s.id]);
      setTool('select');
      render();
      startEdit(s.id, 'text', d.math ? '$$' : null);
      return;
    }
    if (d.mode === 'pencil') {
      const s = byId(d.id);
      s!.pts = simplify(s!.pts, 1.6 / state.view.zoom);
      // closes itself when the stroke ends near where it started
      if (s!.pts.length > 3 && Math.hypot(s!.pts[0][0] - s!.pts[s!.pts.length - 1][0], s!.pts[0][1] - s!.pts[s!.pts.length - 1][1]) < 10 / state.view.zoom) { s!.pts.pop(); s!.closed = true; }
      if (s!.pts.length < 2) removeShape(s!.id); else state.sel = new Set([s!.id]);
      commit(); render(); renderProps();
      return;
    }
    if (d.mode === 'create' && !d.second) {
      // a click without a drag starts a two-click line: the end follows the pointer to the next click. A shape
      // that only a drag can size (a rectangle, an ellipse: a click alone makes nothing) does the same, its
      // second corner (or edge) following the pointer
      const s = byId(d.id), z = state.view.zoom;
      const line = s && CONNECT.has(s.type) && s.x2 != null && Math.hypot(s.x2 - d.a.x, s.y2 - d.a.y) * z < 4;
      const box = s && !line && d.c0 && Math.hypot(e.clientX - d.c0.x, e.clientY - d.c0.y) < 4 && !clickMakes(s);
      if (line || box) {
        lineDraft = d;
        showHint(line ? uiText('hint.clickEnd', 'Click where it ends · Esc cancels') : uiText('hint.escCancels', '{hint} · Esc cancels', { hint: secondClickHint(d.dm) }));
        return;
      }
    }
    linkHint = null;
    if (d.mode === 'create') {
      const s = byId(d.id), t = TYPES[s!.type];
      if (d.lk && d.lk.id !== (s!.link1 && s!.link1.id)) s!.link2 = d.lk;
      if (t.fix) t.fix(s);
      if (!t.valid(s)) removeShape(s!.id);
      snapHint = null;
      commit();
      setTool('select');
    } else if (d.mode === 'marquee') {
      marquee = null;
    } else {
      if (d.fast) endFastMove(d);
      if (d.mode === 'handle') {
        const s = byId(d.id);
        if (s && d.lk && END[d.key]) s[END[d.key][0]] = d.lk;
        if (s && TYPES[s.type].endHandle) TYPES[s.type].endHandle(s);
      }
      snapHint = null;
      commit();
    }
    render(); renderProps();
  }
  svg.addEventListener('wheel', (e: WheelEvent) => { if (state.tool !== 'magnify') return; e.preventDefault(); e.stopImmediatePropagation(); magnifier.zoom(wheelZoomFactor(e)); }, { capture: true, passive: false });
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // Touch: a finger held still for half a second opens the object menu, as a right-click does (iPad Safari sends no
  // contextmenu for it). What the press started (a move, a marquee, a new shape) is undone first; a second finger
  // (a pinch) or a move of more than 8px is not a long press.
  let longPress: { id: number; x: number; y: number; timer: number } | null = null, longPressed = 0;
  const endLongPress = () => { if (longPress) { clearTimeout(longPress.timer); longPress = null; } };
  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    endLongPress();
    if (e.pointerType !== 'touch' || !e.isPrimary || e.button !== 0) return;
    const at = { clientX: e.clientX, clientY: e.clientY, target: e.target };
    longPress = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
      longPress = null;
      if (drag?.mode === 'pan') return;
      cancelDrag();
      longPressed = Date.now();
      canvasMenu(at);
    }, 550) };
  });
  svg.addEventListener('pointermove', (e: PointerEvent) => { if (longPress && e.pointerId === longPress.id && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 8) endLongPress(); });
  svg.addEventListener('pointerup', endLongPress);
  svg.addEventListener('pointercancel', endLongPress);
  svg.addEventListener('pointerleave', () => { magnifier.hide(); cursorW = null; moveRulerCursor(); });
  svg.addEventListener('pointerleave', () => { if (!drag && state.tool !== 'select' && !polyDraft && !arcDraft && !lineDraft) { snapHint = null; renderOverlay(); } });

  svg.addEventListener('wheel', (e: any) => {
    e.preventDefault();
    const r = stageSize();
    if (e.ctrlKey || e.metaKey) zoomAt(wheelZoomFactor(e), e.clientX - r.left, e.clientY - r.top);
    else { state.view.x += e.deltaX / state.view.zoom; state.view.y += e.deltaY / state.view.zoom; renderView(); }
  }, { passive: false });

  window.addEventListener('resize', () => { if (!inTool() && state.mode !== 'document') render(); });
  // the stage also changes size without the window (the sidebar folding, leaving Table or Quick, the page view):
  // the canvas's viewBox and the rulers follow, else they are drawn for the old size
  { let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); if (!inTool() && state.mode !== 'document') raf = requestAnimationFrame(render); }).observe(svg); }

  // ---------------- inline text editor ----------------
  // The kit's TextPopup (src/ui/kit/TextPopup.svelte) in its roomy form, in #stage under what is edited: a LaTeX
  // field or MathLive, as the Text input setting says (quantikz code is always LaTeX).
  let textPop: TextPopupHandle | null = null;
  function editAnchor() {
    const s = byId(editing.id);
    if (!s) return null;
    if (editing.field === 'text') { const b = TD.bbox(s); return { x: s.x, y: b.y + b.h }; }
    if (editing.field === 'src') { const b = TD.bbox(s); return { x: b.x + b.w / 2, y: b.y + b.h }; }
    const L = TYPES[s.type].labelAt(s);
    return { x: L.P.x, y: L.P.y + 12 };
  }
  // the box's top centre on the stage, 10px under what is edited (TextPopup keeps the whole box on the stage)
  function editAt(): [number, number] {
    const a = editing && editAnchor();
    if (!a) return [0, 0];
    const sp = toScreen(a);
    return [sp.x, sp.y + 10];
  }
  const positionEditor = () => textPop?.place();
  // Roomy by default: about 40 characters wide (or the paragraph frame's width at this zoom, if wider), and
  // growing with the text up to ~12 lines before it scrolls.
  function editWidth() {
    const s = editing && byId(editing.id);
    let w = 360;
    if (!s) return w;
    if (editing.field === 'text' && TD.isParaText(s)) w = Math.max(w, Math.min(640, s.tw * state.view.zoom));
    if (editing.field === 'src') w = 520;
    return w;
  }
  // All editor entry points share the same transaction and block-owned placement rules.
  function openBlock(id: any) {
    const s = byId(id);
    if (!s || !TD.blocks.editable(s.type)) return false;
    finishEdit();
    return TD.blocks.open(s as PositionedShape, (apply) => {
      const t = byId(id);
      if (!t) return;
      begin(); apply(t as PositionedShape); commit();
      render(); renderProps();
    });
  }
  TD.blocks.bindOpen(openBlock); // retains the public aliases used by existing panels
  function startEdit(id: any, field: any, init?: any) {
    const s = byId(id);
    if (!s) return;
    if (editing) finishEdit();
    begin();
    const me = (editing = { id, field });
    let text = s[field] || '';
    if (init != null && !s[field]) { s[field] = ''; text = init; } // a new maths text opens as $|$; the shape stays empty until typed in
    const code = field === 'src', para = code || (field === 'text' && TD.isParaText(s));
    const mod = isMac ? '⌘' : 'Ctrl+';
    textPop = openTextPopup($('#stage'), {
      text, kind: code ? 'code' : para ? 'para' : 'line', roomy: true,
      placeholder: field === 'label' ? uiText('ed.label', 'Label, e.g. $r$ — Enter to finish')
        : code ? uiText('ed.code', 'quantikz code — Enter for a new line, {mod}Enter or Esc to finish', { mod })
        : para ? uiText('ed.para', 'Paragraph, $math$ — Enter for a new line, {mod}Enter or Esc to finish', { mod }) : caption(captions["ui.text.math.enter.to.finish.shift.enter.newline"]),
      caret: init != null && text === init ? 1 : undefined,
      // MathLive: a text box's new lines are prose; a label, or the maths tool's text, starts in maths
      prose: field === 'text' && init == null, start: init != null || field === 'label' ? 'math' : 'text',
      width: editWidth, at: editAt,
      onInput: editInput,
      onDone: () => { if (editing === me) finishEdit(); },
      onFallback: () => showHint(uiText('hint.mathliveFailed', "MathLive couldn't load, so this edit uses LaTeX"), 2500),
    });
  }
  function finishEdit() {
    if (!editing) return;
    const { id } = editing;
    editing = null;
    const pop = textPop;
    textPop = null;
    pop?.close(); // fades out; its onDone finds nothing left to finish
    const s = byId(id);
    if (s && s.type === 'text' && !s.text.trim()) removeShape(id);
    commit();
    render(); renderProps();
  }
  function editInput(v: any) {
    if (!editing) return;
    const s = byId(editing.id);
    if (!s) return;
    TD.textHold(s, () => { s[editing.field] = v; });
    render(); positionEditor();
    const ta = document.querySelector(`#props [data-key="${editing.field}"], #props [data-panel] [data-p="${editing.field}"]`);
    if (ta) (ta as HTMLInputElement).value = v;
  }

  // ---------------- polyline points ----------------
  // Insert a point in the middle of segment i (i → i+1).
  function polyInsert(s: any, i: any) {
    const m = polyMid(s, i);
    s.pts.splice(i + 1, 0, [m.x, m.y]);
    if (s.corner) s.corner.splice(i + 1, 0, 0);
  }
  // the middle of segment i: on the curve for a curvature pen path, so adding a point there keeps its shape
  function polyMid(s: any, i: any) {
    const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length];
    if (s.curv && s.smooth && s.pts.length > 2) {
      const g = TD.polySegs(s.pts.map((p: any) => ({ x: p[0], y: p[1] })), s)[i];
      if (g) return { x: (a[0] + 3 * g[0].x + 3 * g[1].x + b[0]) / 8, y: (a[1] + 3 * g[0].y + 3 * g[1].y + b[1]) / 8 };
    }
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
  }
  // a curvature pen point turns between smooth and corner
  function polyCorner(s: any, i: any) {
    begin();
    const c = s.corner || (s.corner = s.pts.map(() => 0));
    c[i] = c[i] ? 0 : 1;
    if (!c.some(Boolean)) delete s.corner;
    render(); commit(); renderProps();
  }
  function polyRemove(s: any, i: any) {
    if (s.pts.length <= (s.closed ? 3 : 2)) { showHint(s.closed ? 'A closed shape needs at least 3 points' : 'A polyline needs at least 2 points', 1400); return; }
    begin();
    s.pts.splice(i, 1);
    if (s.corner) s.corner.splice(i, 1);
    state.vertex = null;
    render(); commit(); renderProps();
  }
  // "Add point" adds after the chosen point (or splits the longest segment); "Remove point" removes the chosen one.
  function polyAddPoint(s: any) {
    let i = state.vertex && state.vertex.id === s.id ? state.vertex.i : -1;
    if (i < 0 || (!s.closed && i >= s.pts.length - 1)) {
      if (!s.closed && i === s.pts.length - 1) i = i - 1;
      else {
        let best = 0, bl = -1;
        const n = s.closed ? s.pts.length : s.pts.length - 1;
        for (let k = 0; k < n; k++) { const a = s.pts[k], b = s.pts[(k + 1) % s.pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = k; } }
        i = best;
      }
    }
    begin(); polyInsert(s, i); state.vertex = { id: s.id, i: i + 1 }; render(); commit(); renderProps();
  }
  TD.polyPoints = { add: polyAddPoint, remove: (s: any) => state.vertex && state.vertex.id === s.id && polyRemove(s, state.vertex.i),
    corner: (s: any) => state.vertex && state.vertex.id === s.id && polyCorner(s, state.vertex.i) };

  // ---------------- properties panel ----------------
  const sizeOpts = TD.SIZES.map((s: any) => [s[0], s[0]]);
  const PROPS: any[] = [
    { key: 'text', label: message('prop.text', 'Text'), type: 'textarea', hint: message('prop.text.hint', 'Use $…$ for math, e.g. $\\vec{F}_e$; $$…$$ for display style') },
    { key: 'mathStyle', label: message('prop.mathStyle', 'Math style'), type: 'select', options: [['inline', message('prop.mathStyle.inline', 'Inline  $…$')], ['display', message('prop.mathStyle.display', 'Display  $$…$$')], ['mixed', message('prop.mathStyle.mixed', 'Mixed')]], derived: true },
    { key: 'label', label: message('prop.label', 'Label'), type: 'text', hint: message('prop.label.hint', 'Shown along the path; $…$ for math') },
    { key: 'labelSide', label: message('prop.labelSide', 'Label side'), type: 'select', options: [['left', message('prop.labelSide.left', 'Left (auto)')], ['right', message('prop.labelSide.right', 'Right (swap)')], ['on', message('prop.labelSide.on', 'On the line')]], needs: 'label' },
    { key: 'labelPos', label: message('prop.labelPos', 'Label pos'), type: 'range', min: 0, max: 1, step: 0.05, needs: 'label' },
    { key: 'size', label: message('prop.size', 'Font size'), type: 'size' },
    { key: 'font', label: message('prop.font', 'Font'), type: 'select', options: TD.FONTS.map((f: any) => [f[0], f[1]]) },
    { key: 'bold', label: message('prop.bold', 'Style'), type: 'bi' },
    { key: 'align', label: message('prop.align', 'Align'), type: 'align' },
    { key: 'valign', label: message('prop.valign', 'Vertical'), type: 'valign' },
    { key: 'color', label: message('prop.color', 'Text colour'), type: 'color' },
    { key: 'ballColor', label: message('prop.ballColor', 'Ball colour'), type: 'color' },
    { key: 'border', label: message('prop.border', 'Border'), type: 'number', min: 0, step: 1, unit: 'px', hint: message('prop.border.hint', 'Space round the picture, like the white edge of a photo print') },
    { key: 'borderColor', label: message('prop.borderColor', 'Border colour'), type: 'color', needs: 'border' },
    { key: 'stroke', label: message('prop.stroke', 'Stroke'), type: 'color', nullable: true },
    { key: 'fill', label: message('prop.fill', 'Fill'), type: 'color', nullable: true, fills: true },
    { key: 'width', label: message('prop.width', 'Line width'), type: 'width', min: 0.25, step: 0.25, unit: 'px' },
    { key: 'dash', label: message('prop.dash', 'Dash'), type: 'dash' },
    { key: 'route', label: message('prop.route', 'Route'), type: 'icons', icons: [['straight', message('prop.route.straight', 'Straight'), 'routeStraight'], ['elbow', message('prop.route.elbow', 'Elbow: right angles'), 'routeElbow'], ['curved', message('prop.route.curved', 'Curved'), 'routeCurved']] },
    { key: 'dir', label: message('prop.dir', 'Direction'), type: 'icons' },
    { key: 'startTip', label: message('prop.startTip', 'Start tip'), type: 'tip' },
    { key: 'endTip', label: message('prop.endTip', 'End tip'), type: 'tip' },
    { key: 'midTip', label: message('prop.midTip', 'Middle tip'), type: 'tip' },
    { key: 'bpTip', label: message('prop.bpTip', 'Bend tips'), type: 'tip' },
    { key: 'shaft', label: message('prop.shaft', 'Shaft'), type: 'shaft' },
    { key: 'cross', label: message('prop.cross', 'Crossings'), type: 'select', options: TD.CROSSES },
    { key: 'closed', label: message('prop.closed', 'Closed'), type: 'checkbox' },
    { key: 'tension', label: message('prop.tension', 'Tension'), type: 'number', min: 0, step: 0.05, hint: message('prop.tension.hint', 'TikZ’s plot tension: 0 is straight lines, 0.5 is TikZ’s default, higher is rounder') },
    { key: 'boxed', label: message('prop.boxed', 'Boxed'), type: 'checkbox' },
    { key: 'radius', label: message('prop.radius', 'Corner radius'), type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'coils', label: message('prop.coils', 'Coils'), type: 'number', min: 1, step: 1 },
    { key: 'amplitude', label: message('prop.amplitude', 'Amplitude'), type: 'number', min: 1, step: 1, unit: 'px' },
    { key: 'pitch', label: message('prop.pitch', 'Pitch'), type: 'number', min: 0, step: 1, unit: 'px', hint: message('prop.pitch.hint', 'Length of one coil; resizing adds coils. 0 = use a fixed coil count') },
    { key: 'loop', label: message('prop.loop', 'Loop size'), type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'wl', label: message('prop.wl', 'Wave length'), type: 'number', min: 4, step: 1, unit: 'px' },
    { key: 'phase', label: message('prop.phase', 'Start position'), type: 'range', min: 0, max: 100, step: 1 },
    { key: 'duty', label: message('prop.duty', 'Duty cycle'), type: 'range', min: 5, max: 95, step: 1 },
    { key: 'fire', label: message('prop.fire', 'Firing angle'), type: 'range', min: 0, max: 175, step: 5 },
    { key: 'tick', label: message('prop.tick', 'Tick spacing'), type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'ticksz', label: message('prop.ticksz', 'Tick size'), type: 'number', min: 1, step: 1, unit: 'px' },
    { key: 'nums', label: message('prop.nums', 'Show numbers'), type: 'checkbox' },
    { key: 'cell', label: message('prop.cell', 'Cell size'), type: 'number', min: 4, step: 1, unit: 'px' },
    { key: 'shift', label: message('prop.shift', 'Corner shift'), type: 'number', step: 1, unit: 'px' },
    { key: 'frame', label: message('prop.frame', 'Border'), type: 'checkbox' },
    { key: 'hatch', label: message('prop.hatch', 'Hatch spacing'), type: 'number', min: 3, step: 1, unit: 'px' },
    { key: 'hatchAngle', label: message('prop.hatchAngle', 'Hatch angle'), type: 'number', step: 1, unit: '°' },
    { key: 'hatchWidth', label: message('prop.hatchWidth', 'Hatch lines width'), type: 'width', min: 0.25, step: 0.25, unit: 'px' },
    ...['Top', 'Right', 'Bottom', 'Left'].map(side => ({ key: 'hatch' + side, label: message('prop.hatch' + side, side + ' edge'), type: 'checkbox' })),
    { key: 'mount', label: message('prop.mount', 'Mount'), type: 'checkbox' },
    { key: 'mark', label: message('prop.mark', 'Angle mark'), type: 'checkbox' },
    { key: 'lbl', label: message('prop.lbl', 'Angle label'), type: 'text', hint: message('prop.lbl.hint', 'Maths without $, e.g. \\theta or 30^\\circ; leave empty for none') },
    { key: 'slits', label: message('prop.slits', 'Slits'), type: 'number', min: 1, step: 1 },
    { key: 'angle', label: message('prop.angle', 'Rotation'), type: 'number', step: 1, unit: '°' },
    { key: 'skew', label: message('prop.skew', 'Skew X'), type: 'number', min: -75, step: 1, unit: '°' },
    { key: 'opacity', label: message('prop.opacity', 'Opacity'), type: 'range', min: 0.05, max: 1, step: 0.05 },
    { key: 'shadow', label: message('prop.shadow', 'Shadow'), type: 'checkbox' },
    { key: 'shadowOffset', label: message('prop.shadowOffset', 'Shadow offset'), type: 'number', step: 1, unit: 'px', needs: 'shadow', hint: message('prop.shadowOffset.hint', 'How far right and down the shadow falls; below 0 it falls up and left') },
    { key: 'shadowOpacity', label: message('prop.shadowOpacity', 'Shadow alpha'), type: 'range', min: 0.05, max: 1, step: 0.05, needs: 'shadow' },
  ];
  const GEOM: Record<string, any> = {
    line: [['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y']],
    spring: [['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y']],
    curve: [['x1', 'x'], ['y1', 'y'], ['cx1', 'x'], ['cy1', 'y'], ['cx2', 'x'], ['cy2', 'y'], ['x2', 'x'], ['y2', 'y']],
    rect: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    ellipse: [['cx', 'x'], ['cy', 'y'], ['rx', 'len'], ['ry', 'len']],
    ball: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    dot: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    arc: [['cx', 'x'], ['cy', 'y'], ['r', 'len'], ['ry', 'len'], ['a1', 'deg'], ['a2', 'deg']],
    text: [['x', 'x'], ['y', 'y'], ['tw', 'len'], ['th', 'len']],
    plot: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    solid: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    prim3d: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    revolve: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    pie: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    tikz: [['x', 'x'], ['y', 'y']],
    coord: [['x', 'x'], ['y', 'y']],
    sym: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    image: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
  };
  for (const [type, block] of TD.blocks.entries()) if (block.geometry) GEOM[type] = block.geometry;
  TD.GEOM = GEOM;
  const toUnit = (v: any, k: any) => (k === 'deg' ? r2(v) : k === 'y' ? r2(-v / PX) : r2(v / PX));
  function propsEl0() { return $('#props'); }
  const fromUnit = (v: any, k: any) => (k === 'deg' ? v : k === 'y' ? -v * PX : v * PX);

  // Four bars, alternating long/short, drawn heavy so they read like the usual paragraph-align icons (kit icons).
  const ALIGNS: any[][] = [['left', message('align.left', 'Align Left'), 'alignLeft'], ['center', message('align.center', 'Align Centre'), 'alignCentre'],
    ['right', message('align.right', 'Align Right'), 'alignRight'], ['justify', message('align.justify', 'Justify'), 'alignJustify']];
  // A rule for the edge the text holds to, with an arrow towards it (both arrows for middle)
  const VALIGNS: any[][] = [['top', message('valign.top', 'Align Top: new lines grow the box downward'), 'valignTop'],
    ['middle', message('valign.middle', 'Align Middle: new lines grow the box both ways'), 'valignMiddle'],
    ['bottom', message('valign.bottom', 'Align Bottom: new lines grow the box upward'), 'valignBottom']];
  // the value a field shows for a shape, as fieldModel reads it (no tips, a single shaft and a solid line are unset)
  const shownVal = (p: any, v: any) => p.type === 'tip' ? v || 'none' : p.type === 'shaft' ? v || 'single' : p.type === 'dash' ? v || 'solid' : typeof v === 'number' ? +v.toFixed(3) : v ?? null;
  const MIXABLE = new Set(['color', 'width', 'number', 'select', 'size', 'tip', 'shaft', 'dash']);
  function fieldModel(p: any, v: any, labelOverride?: any, others?: any[]): StyleModel {
    const model = {
      sliderDefault: p.type === 'range' ? (p.key === 'labelPos' ? 0.5 : p.key === 'opacity' ? 1 : p.key === 'shadowOpacity' ? TD.SHADOW.opacity : symParams(selected()[0] || {})?.[p.key] ?? ({ phase: 0, duty: 50, fire: 60 } as Record<string, number>)[p.key]) : undefined,
      type: p.type, key: p.key, id: 'f-' + p.key, label: caption(labelOverride || p.label),
      value: p.type === 'size' && typeof v === 'number' ? 'custom' : p.type === 'number' && typeof v === 'number' ? +v.toFixed(3) : p.type === 'width' ? (typeof v === 'number' ? +v.toFixed(3) : '') : v ?? '',
      min: p.min ?? '', max: p.max ?? '', step: p.step ?? 1, unit: p.unit, hint: p.hint && caption(p.hint),
      options: p.type === 'size' ? [...sizeOpts, ['custom', uiText('prop.size.custom', 'Custom px…')]] : (p.options || []).map((o: any) => [o[0], optionName(p.key, o[0]) ?? caption(o[1])]),
      checked: !!v, italic: !!p.italic, px: p.type === 'size' ? Math.round(TD.sizePx(v ?? 'normalsize') * 10) / 10 : 0,
      range: r2(v), radioLabel: p.type === 'align' ? caption(captions["ui.align"]) : p.type === 'valign' ? uiText('prop.valign.radio', 'Vertical alignment') : caption(p.label),
      radios: (p.type === 'align' ? ALIGNS : p.type === 'valign' ? VALIGNS : (p.icons || []) as any[][]).map(([key, label, icon]) => ({ key, icon, on: key === v,
        disabled: p.type === 'align' && key === 'justify' && !p.wraps,
        label: p.type === 'align' && key === 'justify' && !p.wraps ? uiText('align.justify.boxOnly', 'Justify (paragraph boxes only: drag with the text tool)') : caption(label) })),
      colour: { none: !v, nullable: !!p.nullable, fills: !!p.fills, label: p.type === 'color' ? TD.fillLabel(v) : '', css: p.type === 'color' ? TD.fillCss(v) : '' },
      drawn: drawnPicker(p.type, p.key, v),
    };
    if (p.type === 'tip') model.value = v || 'none';
    else if (p.type === 'shaft') model.value = v || 'single';
    else if (p.type === 'dash') model.value = v || 'solid';
    // several objects that differ here (others: each one's value): "Mixed", not the first one's value
    const seen = others && MIXABLE.has(p.type) ? [...new Map(others.map((x) => [JSON.stringify(shownVal(p, x)), x])).values()] : [];
    if (seen.length > 1) {
      (model as any).mixed = true;
      if (p.type === 'color') model.colour = { ...model.colour, none: false, label: uiText('prop.mixed', 'Mixed'), css: `linear-gradient(135deg, ${TD.fillCss(seen[0]) || 'transparent'} 50%, ${TD.fillCss(seen[1]) || 'transparent'} 50%)` };
      else model.value = '';
    }
    return model;
  }

  const DIR_NAMES: Record<string, any> = { hh: message('dir.hh', 'Sideways at both ends'), vv: message('dir.vv', 'Up or down at both ends'), hv: message('dir.hv', 'Sideways, then up or down'), vh: message('dir.vh', 'Up or down, then sideways') };
  const DIR_ELBOW = [['hh', DIR_NAMES.hh, 'dirElbowHH'], ['vv', DIR_NAMES.vv, 'dirElbowVV'], ['hv', DIR_NAMES.hv, 'dirElbowHV'], ['vh', DIR_NAMES.vh, 'dirElbowVH']];
  const DIR_CURVED = [['hh', DIR_NAMES.hh, 'dirCurvedHH'], ['vv', DIR_NAMES.vv, 'dirCurvedVV'], ['hv', DIR_NAMES.hv, 'dirCurvedHV'], ['vh', DIR_NAMES.vh, 'dirCurvedVH']];
  const TIP_KEYS = ['startTip', 'endTip', 'midTip', 'bpTip'];
  function tipPreview(v: any) {
    const t = TD.tip(v, { x: 40, y: 6 }, { x: 1, y: 0 }, 1.2, 'currentColor');
    return `<svg class="dprev tprev" viewBox="0 0 48 12"><path d="M4 6H${r2(40 - t.back)}" stroke="currentColor" stroke-width="1.2" fill="none"/>${t.svg.replaceAll('fill="#fff"', 'fill="none"')}</svg>`; // open tips: hollow on a dark menu too
  }
  function shaftPreview(v: any) {
    const s = { type: 'line', x1: 3, y1: 7, x2: 57, y2: 7, stroke: '#000000', width: 1, dash: 'solid', startTip: 'none', endTip: 'none', midTip: 'none', shaft: v, cross: 'none', opacity: 1 };
    return `<svg class="dprev sprev" viewBox="0 0 60 14">${TD.TYPES.line.svg(s, { export: true })}</svg>`;
  }
  // keys a shape has, counting the line extras older files lack
  // rectangles and ellipses have an outline, single or double (an automaton's accepting state), not a line's shaft
  const CLOSED_SHAFT = new Set(['rect', 'ellipse']);
  const SYM_XF = new Set(['angle', 'skew']), TICK_KEYS: Record<string, any> = { tick: 6 / TD.PT_PER_PX, ticksz: 6 / TD.PT_PER_PX };
  const symParams = (s: any) => (s.type === 'sym' && TD.SYMS[s.kind] && TD.SYMS[s.kind].params) || null;
  const hasTips = (s: any) => TD.LINEISH.has(s.type) && !(s.type === 'poly' && s.closed);
  const hasKey = (s: any, k: any) => (!TIP_KEYS.includes(k) || hasTips(s)) && ((s.type === 'line' && (k === 'route' || (k === 'dir' && TD.routeOf(s) !== 'straight'))) || s[k] !== undefined || (k === 'shaft' && CLOSED_SHAFT.has(s.type)) || (TD.LINEISH.has(s.type) && (k in TD.LINE_EXTRA || (k === 'bpTip' && s.type === 'poly'))) || (s.type === 'text' && (k === 'boxed' || k === 'align' || k === 'valign')) || (TD.SHADOW_KEYS.includes(k) && TD.canShadow(s)) || (s.type === 'image' && k in TD.IMAGE_FRAME) || (k === 'angle' && (TD.ROT_TYPES.has(s.type) || s.type === 'arc')) ||
    (s.type === 'sym' && (SYM_XF.has(k) || !!(symParams(s) && k in symParams(s)))) || (TD.LINEISH.has(s.type) && k in TICK_KEYS && keyVal(s, 'shaft') === 'ticks'));
  // text with no alignment set: centred lines, or left in a wrapping box
  // what a shape without the key shows: a shadow's and an image frame's defaults (src/domain/shadow.ts, symbols.ts)
  const keyVal = (s: any, k: any) => keyVal0(s, k) ?? (k === 'shadowOffset' ? TD.SHADOW.offset : k === 'shadowOpacity' ? TD.SHADOW.opacity : k === 'shadow' ? false : s.type === 'image' && k in TD.IMAGE_FRAME ? TD.IMAGE_FRAME[k] : undefined);
  const keyVal0 = (s: any, k: any) => (s.type === 'line' && k === 'route' ? TD.routeOf(s) : s.type === 'line' && k === 'dir' ? TD.routeDir(s) : undefined) ?? s[k] ?? (k === 'hatchWidth' && symParams(s)?.hatchWidth != null ? s.width ?? 1 : undefined) ?? (k === 'align' && s.type === 'text' ? (s.tw > 0 ? 'left' : 'center') : k === 'valign' && s.type === 'text' ? (TD.isParaText(s) ? 'top' : 'middle') : undefined) ?? TD.LINE_EXTRA[k] ?? (k === 'bpTip' ? 'none' : SYM_XF.has(k) ? 0 : symParams(s) && k in symParams(s) ? symParams(s)[k] : k in TICK_KEYS && TD.LINEISH.has(s.type) ? TICK_KEYS[k] : undefined);
  function dashPreview(v: any, w: any) {
    const da = TD.dashArray(v, w);
    return `<svg class="dprev" viewBox="0 0 48 8" preserveAspectRatio="none"><path d="M1 4H47" stroke="currentColor" stroke-width="${w}"${da ? ` stroke-dasharray="${da}"` : ''}/></svg>`;
  }
  // The drawn pickers in the properties panel (dash, shaft, arrow tips, width presets): the kit's Select, its options
  // drawn; a pick comes back as the select's change (readField), a typed dash through `custom`.
  // renderProps builds the panel anew; a pick from a drawn picker re-renders it (the closed box shows the new drawing),
  // so focus goes to the new select for the same key, opened-by-pointer (no focus ring) if the old one was
  function renderPropsKeepPicker(old: HTMLElement | null) {
    const key = old?.dataset.key, attached = !!old?.classList.contains('attached'), had = !!old && document.activeElement === old;
    const byPointer = !!old && 'byPointer' in old.dataset; // read first: removing the old select (focusout) clears it
    renderProps();
    if (!key) return;
    const next = $('#props').querySelector(`select[data-key="${CSS.escape(key)}"]${attached ? '.attached' : ':not(.attached)'}`) as HTMLElement | null;
    const at = document.activeElement;
    if (!next || !(had || !at || at === document.body || at.closest('.selmenu'))) return; // not if the person has moved on
    if (byPointer) next.dataset.byPointer = '';
    next.focus({ preventScroll: true });
  }
  function drawnPicker(type: string, key: string, v: any): StyleModel['drawn'] {
    if (type === 'tip') return { title: uiText('dd.tip.title', 'Arrow tip'), columns: 3,
      options: TD.TIPS.map(([k, n]: any) => ({ value: k, label: tipName(k, n), svg: k === 'none' ? `<span class="none">${esc(caption(captions['ui.none']))}</span>` : tipPreview(k) })) };
    if (type === 'shaft') {
      const sel = selected(), closed = sel.length > 0 && sel.every((x: any) => CLOSED_SHAFT.has(x.type));
      return { title: closed ? uiText('prop.outline', 'Outline') : uiText('style.shaft', 'Shaft'),
        options: TD.SHAFTS.filter(([k]: any) => !closed || k === 'single' || k === 'double').map(([k, n]: any) => ({ value: k, label: shaftName(k, n), svg: shaftPreview(k) })) };
    }
    if (type === 'width') return { title: uiText('ui.line.width.presets', 'Line width presets'),
      options: TD.WIDTHS.map((w: any) => ({ value: String(w), label: `${w} px`, note: `${r2(w * TD.PT_PER_PX)}pt`, svg: `<svg viewBox="0 0 60 10"><path d="M2 5H58" stroke="currentColor" stroke-width="${w}"/></svg>` })) };
    if (type !== 'dash') return undefined;
    const pat = TD.dashPat(v);
    return { title: uiText('style.dashPattern', 'Dash pattern'),
      options: TD.DASHES.map(([k, n]: any) => ({ value: k, label: dashName(k, n), svg: dashPreview(k, 1.5) })),
      custom: { label: uiText('dd.custom', 'Custom…'), shown: 'Custom', svg: dashPreview(v, 1.2), value: pat ? v.slice(2) : '', placeholder: 'on off … (pt)', title: uiText('dd.dash.title', 'Dash lengths in pt, e.g. 4 2 or 6 2 1 2'),
        apply: (text: string) => {
          const nums = text.trim().split(/[\s,]+/).map(Number).filter((n: any) => isFinite(n) && n >= 0);
          if (nums.length && nums.some((n: any) => n > 0)) { applyProp(key, 'p:' + nums.join(' '), true); renderPropsKeepPicker($('#props').querySelector(`select[data-key="${CSS.escape(key)}"]:not(.attached)`)); }
        } } };
  }
  let panelView: any = null, panelType = '', propertiesView: any = null;
  let propertyAfter: FormSection[] = [];
  function renderProps(): void {
    clearFormatPreview();
    if (!TD.math.previewing) return TD.math.preview(renderProps);
    if (panelView) { panelView.destroy(); panelView = null; }
    if (propertiesView) { void unmount(propertiesView); propertiesView = null; }
    if (TD.closeColorPicker) TD.closeColorPicker();
    const el = $('#props');
    destroyView(el); el.replaceChildren();
    if (inTable()) { if (TD.tableWs) TD.tableWs.renderProps(); return; }
    if (state.mode === 'document') { if (TD.docview) TD.docview.renderSettings(el); return; }
    const sel = selected(), fields: StyleModel[] = [];
    if (state.tool === 'bucket') {
      propertiesView = mountFrame(el, MainProperties, { defaults: true, defaultsHint: false, title: uiText('assist.bucketTitle', 'Fill bucket'), target: 'bucket', fields: PROPS.filter(p => p.key === 'fill').map(p => fieldModel(p, bucketFill)), before: [], after: [], geometry: false });
      return;
    }
    if (!sel.length) {
      const d = state.defaults, keys = ['stroke', 'fill', 'width', 'dash', 'color', 'size', 'font', 'ballColor'];
      const shortcuts = [
        ['Ctrl+K', uiText('sc.search', 'search tools, shapes and commands')], ['V L A C P', uiText('sc.tools1', 'select · line · arrow · curve · polyline')], ['O S R E', uiText('sc.tools2', 'arc · spring · rect · ellipse')], ['B D T', uiText('sc.tools3', 'ball · dot · text')],
        ['Shift', uiText('sc.shift', 'constrain angle / square')], ['Alt', uiText('sc.alt', 'drag without snapping')], ...(state.mode === 'board' ? [['H', uiText('sc.handBoard', 'hand: drag the board')], ['wheel', uiText('sc.wheel', 'move around')]] : state.mode === 'page' ? [['H', uiText('sc.handPage', 'hand: drag the page')]] : []), ['Space+drag', uiText('sc.pan', 'pan (or middle mouse)')], ['Ctrl+wheel', uiText('sc.zoom', 'zoom')],
        ['Ctrl+G', uiText('sc.group', 'group (Shift: ungroup)')], ['Ctrl+R', uiText('sc.rotate', 'rotate 90°')], ['Ctrl+] / [', uiText('sc.order', 'forward / backward')], ['Ctrl+D', uiText('sc.dup', 'duplicate')],
        ['Enter', uiText('sc.enter', 'label a box')], ['Ctrl+C', uiText('sc.copy', 'copy, also as TikZ code')], ['Ctrl+V', uiText('sc.paste', 'paste; TikZ code imports')], ['Ctrl+Alt+K', uiText('sc.comp', 'make component')],
        ['Ctrl+E', uiText('sc.tikz', 'TikZ code')], ['Ctrl+O', uiText('sc.open', 'open file')], ['Right-click', uiText('sc.ctx', 'object menu')],
      ].map(([keys, description]) => ({ keys: keys.split(' ').map(kb), description }));
      propertiesView = mountFrame(el, MainProperties, { defaults: true, title: uiText('props.defaultStyle', 'Default style'), fields: PROPS.filter(p => keys.includes(p.key)).map(p => fieldModel(p, d[p.key])), ...(state.mode === 'page' ? { page: pageModel() } : {}), variables: variablesModel(), before: compLibrary(), after: [], geometry: false, shortcuts });
      return;
    }
    const types = [...new Set(sel.map((s: any) => s.type))];
    const title = sel.length === 1 ? (sel[0].type === 'sym' && TD.SYMS[sel[0].kind]?.hatchPreset ? uiText('props.hatchTitle', 'Hatch') : typeName(sel[0].type)) : (sel[0].g && sel.every((q: any) => q.g === sel[0].g) ? uiText('props.groupOf', 'Group of {n}', { n: sel.length }) : uiText('props.nObjects', '{n} objects', { n: sel.length }));
    const has = (k: any) => sel.some((s: any) => hasKey(s, k)), first = (k: any) => keyVal(sel.find((s: any) => hasKey(s, k)), k), isText = types.includes('text');
    for (const p of PROPS) {
      if (p.key === 'mathStyle') { const ms = mathStyleOf(sel); if (ms) fields.push(fieldModel(p, ms, p.label)); continue; }
      if (!has(p.key)) continue;
      if (p.key === 'color' && types.every(t => t === 'bloch')) continue;
      if (p.needs && !sel.some(s => s[p.needs])) continue;
      if ((p.key === 'startTip' || p.key === 'endTip') && sel.every(s => s.type === 'poly' && s.closed)) continue;
      if (p.key === 'cross' && !sel.some(s => (s.type === 'line' && TD.routeOf(s) !== 'curved') || (s.type === 'poly' && !s.smooth))) continue;
      if (p.key === 'dir') { // which way an elbow or curved line leaves and arrives, drawn the way it routes
        const ln = sel.find(s => s.type === 'line' && TD.routeOf(s) !== 'straight');
        if (!ln) continue;
        fields.push(fieldModel({ ...p, icons: TD.routeOf(ln) === 'curved' ? DIR_CURVED : DIR_ELBOW }, TD.routeDir(ln)));
        continue;
      }
      if (['stroke', 'fill', 'width', 'dash', 'radius', ...TD.SHADOW_KEYS].includes(p.key) && sel.every(s => s.type === 'text' && !s.boxed)) continue;
      let label = p.label;
      if (!isText && p.key === 'size') label = uiText('prop.labelSize', 'Label size');
      if (!isText && p.key === 'color' && !types.includes('dot')) label = uiText('prop.labelColor', 'Label colour');
      if (types.length === 1 && types[0] === 'dot' && p.key === 'color') label = caption(captions["ui.color"]);
      if (p.key === 'shaft' && types.every((x: any) => CLOSED_SHAFT.has(x))) label = uiText('prop.outline', 'Outline');
      if (p.type === 'bi') fields.push(fieldModel({ ...p, italic: first('italic') }, first('bold')));
      else if (p.type === 'align') fields.push(fieldModel({ ...p, wraps: sel.some(s => s.tw > 0) }, first('align')));
      else fields.push(fieldModel(p, first(p.key), label, sel.length > 1 ? sel.filter((s: any) => hasKey(s, p.key)).map((s: any) => keyVal(s, p.key)) : undefined));
    }
    const so = new Set(sel.flatMap((q: any) => (q.style && Array.isArray(q.so) ? q.so : [])));
    for (const fm of fields) if (so.has(fm.key) || (fm.type === 'bi' && (so.has('bold') || so.has('italic')))) fm.overridden = true;
    const named = namedSection(sel);
    const before: FormSection[] = [], after: FormSection[] = [];
    if (sel.every(canScale)) before.push({ class: 'sec', rows: [row(captions["ui.scale"],
      { kind: 'input', value: sel.every(s => objectScale(s) === objectScale(sel[0])) ? objectScale(sel[0]) : '', attrs: { type: 'number', min: '0.01', step: '0.01', 'data-object-scale': '', 'aria-label': uiText('ui.scale', 'Scale') } },
      { kind: 'text', text: '×' })] });

    if (sel.length === 1 && sel[0].type === 'poly') {
      const s = sel[0], vi = state.vertex && state.vertex.id === s.id ? state.vertex.i : -1;
      before.push({ ...section(captions["ui.points"], [{ kind: 'actions', class: 'btns', buttons: [{ text: uiText('pt.add', 'Add Point'), attrs: { 'data-act': 'pt:add', title: uiText('pt.add.title', 'Add a point after the chosen one (or on the longest segment). You can also drag a + on the shape.') } }, { text: vi >= 0 ? uiText('pt.removeN', 'Remove Point {n}', { n: vi + 1 }) : uiText('pt.remove', 'Remove Point'), attrs: { 'data-act': 'pt:rm', title: s.curv ? uiText('pt.remove.title.curv', 'Remove the chosen point. You can also press Delete.') : uiText('pt.remove.title', 'Remove the chosen point. You can also double-click a point.'), ...(vi < 0 ? { disabled: true } : {}) } },
        ...(s.curv ? [{ text: vi >= 0 && s.corner && s.corner[vi] ? uiText('pt.smooth', 'Make Smooth') : uiText('pt.corner', 'Make Corner'), attrs: { 'data-act': 'pt:corner', title: uiText('pt.corner.title', 'Turn the chosen point between smooth and corner. You can also double-click a point.'), ...(vi < 0 ? { disabled: true } : {}) } }] : [])] },
        { kind: 'hint', text: [s.curv ? uiText('pt.help.curv', 'Click a point to choose it, Delete removes it. Drag a + to add a point there; double-click a point to turn it between smooth and corner.')
          : uiText('pt.help', 'Click a point to choose it. Drag a + to add a point there; double-click a point to remove it.')] }], 'sec'), summary: String(s.pts.length) });
    }
    if (units().length > 1) after.push(section(captions["ui.align"], [{ kind: 'controls', class: 'align-row', controls: ([
      ['left', 'alignLefts', uiText('arr.left', 'Align left')], ['center', 'alignCentres', uiText('arr.centres', 'Align centres')], ['right', 'alignRights', uiText('arr.right', 'Align right')],
      ['top', 'alignTops', uiText('arr.top', 'Align top')], ['middle', 'alignMiddles', uiText('arr.middles', 'Align middles')], ['bottom', 'alignBottoms', uiText('arr.bottom', 'Align bottom')],
    ] as [string, IconName, string][]).map(([key, icon, title]) => ({ kind: 'button', text: '', icon, attrs: { class: 'icon', 'data-act': 'l:' + key, title } })) }], 'sec'));
    if (combinable()) after.push(section(uiText('combine.title', 'Combine'), [{ kind: 'controls', class: 'align-row', controls: COMBINE.map(([key]) => ({ kind: 'button', text: '', icon: COMBINE_ICON[key], attrs: { class: 'icon', 'data-act': 'cb:' + key, title: key === 'subtract' ? uiText('combine.subtract.title', '{name}: cut the shapes above out of the bottom one', { name: combineName(key) }) : key === 'divide' ? uiText('combine.divide.title', '{name}: split into every overlap piece', { name: combineName(key) }) : combineName(key) } })) }], 'sec'));
    if (units().length >= 3) after.push(section(uiText('ctx.distribute', 'Distribute'), [{ kind: 'actions', class: 'btns', buttons: [
      { text: uiText('ctx.horizontally', 'Horizontally'), attrs: { 'data-act': 'd:h' } },
      { text: uiText('ctx.vertically', 'Vertically'), attrs: { 'data-act': 'd:v' } },
    ] }], 'sec'));
    after.push(...nativeNodeSections(sel));
    after.push(...componentSections(sel));
    const buttons = [
      ...(canGroup() ? [{ text: caption(captions["ui.group"]), attrs: { 'data-act': 'group', title: 'Ctrl+G' } }] : []),
      ...(sel.length > 1 && !sel.some(q => q.cpart) ? [{ text: uiText('comp.make', 'Make Component'), attrs: { 'data-act': 'comp:make', title: uiText('comp.make.title', 'Save these as one reusable part: copies stay linked') } }] : []),
      ...(canUngroup() ? [{ text: caption(captions["ui.ungroup"]), attrs: { 'data-act': 'ungroup', title: 'Ctrl+Shift+G' } }] : []),
      ...[['front', caption(captions["ui.bring.to.front"])], ['back', caption(captions["ui.send.to.back"])], ['dup', caption(captions["ui.duplicate"])], ['del', caption(captions["ui.delete"])]].map(([key, text]) => ({ text, attrs: { 'data-act': key } })),
    ];
    after.push({ class: 'sec', rows: [{ kind: 'actions', class: 'btns', buttons }, { kind: 'hint', text: [turnable(sel) ? uiText('props.more.turn', 'Right-click for more: rotate, flip, arrange, distribute.') : rotatable(sel) ? uiText('props.more.flip', 'Right-click for more: flip, arrange, distribute.') : uiText('props.more', 'Right-click for more: arrange, distribute.')] }] });
    const panel = sel.length === 1 && TD.panels[sel[0].type];
    propertyAfter = after;
    propertiesView = mountFrame(el, MainProperties, { defaults: false, title, fields, ...(named ? { named } : {}), before, after, ...(panel ? { panel: sel[0].type } : {}), geometry: sel.length === 1 && !!GEOM[sel[0].type] });
    if (panel) panelType = sel[0].type, panelView = TD.panelViews[sel[0].type].mount(el.querySelector('[data-panel]'), sel[0] as Shape & { src: string });
    renderGeom();
  }
  function pageModel(): PageModel {
    const G = pageGeom();
    return { paper: G.paper, paperName: TD.PAPERS[G.paper]?.name || uiText('page.paper.custom', 'Custom'), widthCm: G.W, heightCm: G.H, rawWidthCm: G.w / PX, rawHeightCm: G.h / PX, width: G.w, height: G.h, orient: G.orient, mt: G.mt, ml: G.ml, current: currentPage(), papers: Object.entries<any>(TD.PAPERS).map(([key, v]) => ({ key, name: v.name })), pages: Array.from({ length: G.n }, (_, k) => ({ objects: onPage(k, G).length, thumbnail: pageThumb(k, G) })) };
  }
  // A new paper, orientation or margins: one undo step. Pages stack by the paper's height, so everything on a page
  // moves with it and keeps its place on the paper (an object belongs to the page under its centre).
  function setSheetPage(pg: any) {
    finishEdit(); finishPoly(); commit();
    begin();
    const G0 = pageGeom(), on = shapes().map((s: any) => [s, pageOf(s, G0)] as const);
    state.doc.page = pg;
    const d = pageStep() - pageStep(G0);
    if (d) for (const [s, k] of on) if (k) TD.translate(s, 0, k * d);
    commit(); render(); renderProps(); scheduleSave();
  }
  propsEl0().addEventListener('change', (e: any) => {
    const k = e.target.dataset.pp;
    if (!k || state.mode !== 'page') return;
    let v = e.target.value;
    const pg = { ...state.doc.page };
    if (k === 'paper') { if (v === 'custom') { const G = pageGeom(); pg.w = G.W; pg.h = G.H; } pg.paper = v; }
    else { v = parseFloat(v); if (!isFinite(v) || v < 0) { renderProps(); return; } if (k === 'mt') pg.mt = pg.mb = v; else if (k === 'ml') pg.ml = pg.mr = v; else pg[k] = Math.max(1, v); }
    if (!TD.pageFits(pg)) { showHint(uiText('page.noRoom', 'That leaves no room for text: keep at least 1 cm between the margins'), 2400); renderProps(); return; }
    setSheetPage(pg);
  });
  propsEl0().addEventListener('click', (e: any) => {
    if (state.mode !== 'page') return;
    const o = e.target.closest('[data-ppo]');
    if (o && o.dataset.ppo !== pageGeom().orient) setSheetPage({ ...state.doc.page, orient: o.dataset.ppo });
    const a = e.target.closest('[data-pg]');
    if (!a || a.disabled) return;
    const k = +a.dataset.k;
    (({ go: () => goToPage(k), add: () => insertPage(k), ins: () => insertPage(k), up: () => movePage(k, -1), down: () => movePage(k, 1), dup: () => duplicatePage(k), del: () => deletePage(k) }) as Record<string, any>)[a.dataset.pg]();
  });
  // each field takes a number or an expression (src/domain/params.ts): w/2, a.east.x + gap. An expression is kept and
  // shown in blue pen, its value in the tooltip; one that can't be worked out is red, with the reason
  function renderGeom(force?: boolean) {
    const sec = $('#geomSec'), sel = selected();
    if (!sec || sel.length !== 1 || !propertiesView) return;
    if (!force && sec.contains(document.activeElement)) return;
    const s = sel[0], ex = s.ex || {};
    propertiesView.updateGeometry({ title: GEOM[s.type].some((g: any) => g[1] === 'deg') ? uiText('geom.title.deg', 'Geometry (TikZ cm / °)') : uiText('geom.title', 'Geometry (TikZ cm)'), rows: GEOM[s.type].map(([k, kind]: string[]) => {
      const e = ex[k] != null ? paramErr.get(s.id + ':' + k) : null;
      const gv = (s.type === 'arc' && k === 'ry' ? s.ry || s.r : s[k]) ?? 0;
      const tip = ex[k] != null ? (e || `= ${toUnit(gv, kind)}${kind === 'deg' ? '°' : ' cm'}`) : k === 'tw' ? uiText('geom.tw.tip', 'Wrap width in cm (0 = no wrapping)') : k === 'th' ? uiText('geom.th.tip', 'Paragraph box height in cm (0 = grows with the text). Needs a wrap width.') : '';
      return row(k === 'tw' ? uiText('geom.tw', 'wrap width') : k === 'th' ? uiText('geom.th', 'box height') : s.type === 'arc' && k === 'r' ? 'rx' : k, { kind: 'input', value: ex[k] != null ? ex[k] : String(toUnit(gv, kind)), attrs: { type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', 'data-geom': k, 'data-kind': kind, 'data-step': kind === 'deg' ? 5 : 0.05, class: 'geomin' + (ex[k] != null ? ' ex' : '') + (e ? ' bad' : ''), ...(tip ? { title: tip } : {}) } });
    }) });
  }
  function variablesModel() {
    const V = home().vars || {}, vals = paramErr.vals || new Map();
    return Object.entries<string>(V).map(([name, expression]) => {
      const error = paramErr.get('var:' + name), value = vals.get(name);
      return { name, expression, error, title: error || (typeof value === 'number' && String(r2(value)) !== String(expression).trim() ? `= ${r2(value)}` : undefined) };
    });
  }
  // rename a variable everywhere it is used (not after a dot: a.w is the field w of a)
  function renameVar(from: any, to: any) {
    const re = new RegExp(`(?<![\\w.])${from}(?![\\w(])`, 'g');
    const V = home().vars, out: Record<string, any> = {};
    for (const [n, x] of Object.entries<any>(V!)) out[n === from ? to : n] = String(x).replace(re, to);
    home().vars = out;
    for (const s of shapes()) if (s.ex) for (const f of Object.keys(s.ex)) (s.ex as Record<string, any>)[f] = (s.ex as Record<string, any>)[f].replace(re, to);
  }

  // Inline vs display maths of text objects: 'inline' | 'display' | 'mixed', or null when there is no maths.
  function mathStyleOf(list: any) {
    const segs = list.filter((s: any) => s.type === 'text').flatMap((s: any) => String(s.text).split('\n').flatMap(TD.segments)).filter((g: any) => g.math);
    if (!segs.length) return null;
    return segs.every((g: any) => g.display) ? 'display' : segs.every((g: any) => !g.display) ? 'inline' : 'mixed';
  }
  function setMathStyle(s: any, style: any) {
    if (style === 'mixed') return;
    s.text = String(s.text).split('\n').map((line) => TD.segments(line).map((g: any) => {
      if (!g.math) return g.s;
      return style === 'display' ? `$$${g.s.trim()}$$` : `$${g.s.trim()}$`;
    }).join('')).join('\n');
  }
  function setTextFormat(s: any, key: string, value: any) {
    if (key === 'mathStyle') setMathStyle(s, value);
    else {
      s[key] = value;
      if (key === 'boxed' && value && s.type === 'text') { s.stroke ??= '#000000'; s.fill ??= null; s.width ??= 1; s.dash ??= 'solid'; s.radius ??= 0; }
    }
  }
  function clearFormatPreview(paint = true) {
    if (formatPreviewFrame) cancelAnimationFrame(formatPreviewFrame);
    formatPreviewFrame = 0;
    const hadPreview = !!formatPreview;
    formatPreview = null;
    if (hadPreview && paint) render();
  }
  function previewFormat(key: string, value: any) {
    if (!['mathStyle', 'size', 'font', 'bold', 'italic', 'align', 'valign', 'color', 'boxed'].includes(key) ||
        !selected().some(s => s.type === 'text') || state.mode === 'document') return;
    if (formatPreview?.key === key && formatPreview.value === value) return;
    formatPreview = { owner: home(), ids: [...state.sel].join(','), key, value, scene: null };
    if (!formatPreviewFrame) formatPreviewFrame = requestAnimationFrame(() => { formatPreviewFrame = 0; render(); });
  }
  function applyProp(key: any, value: any, isFinal: any) {
    clearFormatPreview(false);
    const target = $('#props .sec[data-target]')?.dataset.target;
    if (target === 'defaults') { state.defaults[key] = value; savePrefs(); return; }
    if (target === 'bucket') { if (key === 'fill') bucketFill = value; savePrefs(); return; }
    if (key === 'mathStyle') {
      begin();
      for (const s of selected()) if (s.type === 'text') TD.textHold(s, () => setMathStyle(s, value));
      render(); commit(); renderProps(); return;
    }
    begin();
    for (const s of selected()) if (hasKey(s, key)) TD.textHold(s, () => {
      setTextFormat(s, key, value);
    });
    render();
    if (isFinal) commit();
  }
  const propsEl = $('#props');
  function readField(t: any) {
    const key = t.dataset.key;
    if (t.dataset.sizepx) { const v = parseFloat(t.value); return isFinite(v) && v > 0 ? { key: 'size', v: Math.min(200, Math.max(2, v)) } : undefined; }
    const p: any = key === 'italic' ? { type: 'checkbox' } : PROPS.find((q) => q.key === key);
    if (!p) return;
    let v = t.value;
    if (p.type === 'number' || p.type === 'width') { v = parseFloat(v); if (!isFinite(v)) return; if (p.min != null) v = Math.max(p.min, v); }
    if (p.type === 'range') { v = parseFloat(v); const sp = t.parentElement.querySelector('.slider-value'); if (sp) sp.textContent = r2(v); }
    if (p.type === 'checkbox' || p.type === 'bi' || key === 'italic') v = t.checked;
    if (key === 'size' && v === 'custom') v = r2(TD.sizePx(selected()[0]?.size ?? state.defaults.size));
    return { key, v };
  }
  const panelOf = (t: any) => {
    const el = t.closest('[data-panel]');
    return el && selected().length === 1 ? { panel: TD.panels[el.dataset.panel], s: selected()[0] } : null;
  };
  const formatButton = (t: any) => t.closest?.('[data-alignv], [data-valign]');
  propsEl.addEventListener('pointerover', (e: any) => {
    const b = formatButton(e.target);
    if (b) previewFormat(b.dataset.alignv ? 'align' : 'valign', b.dataset.alignv || b.dataset.valign);
  });
  propsEl.addEventListener('pointerout', (e: any) => {
    const b = formatButton(e.target);
    if (b && !b.contains(e.relatedTarget)) clearFormatPreview();
  });
  propsEl.addEventListener('optionpreview', (e: any) => {
    const t = e.target, key = t.dataset.key;
    if (key === 'size' && e.detail.value === 'custom') return clearFormatPreview();
    previewFormat(key, e.detail.value);
  });
  propsEl.addEventListener('optionpreviewend', () => clearFormatPreview());
  // Numeric sizes preview on each keystroke, with a single committed edit on change.
  propsEl.addEventListener('input', (e: any) => {
    const t = e.target;
    if (t.dataset.objectScale != null) return;
    if (applyNativeField(t, false)) return;
    const pn = panelOf(t);
    // the panel follows each keystroke: other fields show what this one changed (the Svelte view preserves the active field)
    if (pn) { begin(); pn.panel.apply!(pn.s, t); render(); renderPanel(); return; }
    if (t.dataset.sizepx) { const r = readField(t); if (r) previewFormat(r.key, r.v); else clearFormatPreview(); return; }
    if (t.dataset.geom) return;
    const r = readField(t);
    if (r) applyProp(r.key, r.v, false);
  });
  propsEl.addEventListener('change', (e: any) => {
    const t = e.target;
    if (t.dataset.named != null) {
      const v = t.value;
      if (v === '+') void newNamedStyle(); else if (v !== '*') applyNamed(v);
      renderProps(); return;
    }
    if (t.dataset.objectScale != null) {
      const value = Number(t.value);
      if (!Number.isFinite(value) || value <= 0) { renderProps(); return; }
      begin();
      for (const s of selected()) if (canScale(s)) {
        if (value === 1) delete s.objectScale; else s.objectScale = value;
      }
      render(); commit(); renderProps(); return;
    }
    if (applyNativeField(t, true)) return;
    // an error mark this handler added by hand (Svelte does not know about it) is cleared before re-checking
    if (t.dataset.localBad != null) { t.classList.remove('bad'); t.title = t.dataset.localBad; delete t.dataset.localBad; }
    const pn = panelOf(t);
    if (pn) {
      begin();
      const rerender = pn.panel.apply!(pn.s, t);
      render(); commit();
      if (rerender || t.tagName === 'SELECT' || t.type === 'checkbox') renderPanel(); else refreshPanelErrors();
      return;
    }
    if (t.dataset.vexpr != null) {
      const n = t.dataset.vexpr, x = t.value.trim().replace(/^=\s*/, '') || '0';
      try { TD.params.parse(x); } catch (err: any) { if (t.dataset.localBad == null) t.dataset.localBad = t.getAttribute('title') ?? ''; t.classList.add('bad'); t.title = err.message; return; }
      begin(); home().vars![n] = x; render(); commit(); renderProps(); return;
    }
    if (t.dataset.cname != null) {
      const s0 = selected()[0], v = t.value.trim();
      if (!s0 || s0.type !== 'comp' || !v) { renderProps(); return; }
      begin(); for (const q of shapes()) if (q.type === 'comp' && q.ref === s0.ref) q.cname = v; render(); commit(); renderProps(); return;
    }
    if (t.dataset.vname != null) {
      const from = t.dataset.vname, to = t.value.trim();
      if (to === from) return;
      if (!TD.params.okName(to) || (home().vars && to in home().vars!)) { showHint(!TD.params.okName(to) ? uiText('hint.varName.bad', 'A name is letters, digits and _, starting with a letter (and not a function such as sin)') : uiText('hint.varName.taken', 'There is already a variable called {name}', { name: to }), 2400); t.value = from; return; }
      begin(); renameVar(from, to); render(); commit(); renderProps(); return;
    }
    if (t.dataset.geom) {
      const s = selected()[0], k = t.dataset.geom, raw = t.value.trim();
      const v = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(raw) ? parseFloat(raw) : NaN;
      if (!isFinite(v)) {
        // an expression: kept on the field and worked out again whenever what it uses changes (syncLinks)
        if (!raw) { renderGeom(true); return; }
        try { TD.params.parse(raw); } catch (err: any) { if (t.dataset.localBad == null) t.dataset.localBad = t.getAttribute('title') ?? ''; t.classList.add('bad'); t.title = err.message; return; }
        begin();
        s.ex = { ...(s.ex || {}), [k]: raw.replace(/^=\s*/, '') };
        if (s._ev) delete (s._ev as Record<string, any>)[k];
        if (CONNECT.has(s.type)) { if (k === 'x1' || k === 'y1') delete s.link1; if (k === 'x2' || k === 'y2') delete s.link2; }
        render(); commit(); renderGeom(true); return;
      }
      begin();
      if (s.ex && k in s.ex) { delete (s.ex as Record<string, any>)[k]; if (s._ev) delete (s._ev as Record<string, any>)[k]; if (!Object.keys(s.ex).length) { delete s.ex; delete s._ev; } }
      s[t.dataset.geom] = fromUnit(v, t.dataset.kind);
      if (CONNECT.has(s.type)) { const g = t.dataset.geom; if (g === 'x1' || g === 'y1') delete s.link1; if (g === 'x2' || g === 'y2') delete s.link2; } // typed coordinates let go
      if (s.type === 'arc' && t.dataset.geom === 'a2' && s.a2 <= s.a1) s.a2 += 360;
      if (t.dataset.geom === 'tw' || t.dataset.geom === 'th') {
        s.tw = Math.max(0, s.tw || 0); s.th = Math.max(0, s.th || 0);
        if (s.tw > 0 && !s.align) s.align = 'left';
        render(); commit(); renderProps(); return;
      }
      render(); commit(); renderGeom(true);
      return;
    }
    const r = readField(t);
    if (r) {
      applyProp(r.key, r.v, true);
      // a drawn picker (dash, shaft, tips, width presets) shows its new drawing; a width preset fills the number field
      if (t.tagName === 'SELECT' && ['dash', 'shaft', 'tip', 'width'].includes(PROPS.find((q) => q.key === r.key)?.type as string)) renderPropsKeepPicker(t);
      // the panel shows what was set (a number as kept: clamped, rounded), or the field would go back to the old value
      // when it loses focus, and the next step (↑, ↓) would build on that
      else renderProps();
    }
  });
  // re-render only the custom panel (keeps generic fields untouched)
  function renderPanel() {
    const el = propsEl.querySelector('[data-panel]');
    const s = selected()[0];
    if (!el || !s) return;
    // a conversion (xymatrix ⇄ tikz-cd) changes the shape's type, and with it the panel
    if (panelView && s.type !== panelType) { renderProps(); return; }
    const sc = propsEl.scrollTop;
    if (panelView) panelView.update(s);
    propsEl.scrollTop = sc;
  }
  function refreshPanelErrors() {
    const el = propsEl.querySelector('[data-panel]');
    const s = selected()[0];
    if (!el || !s) return;
    if (panelView && s.type !== panelType) { renderProps(); return; }
    if (panelView) { panelView.update(s); return; }

  }
  // colour buttons open the popover picker
  function openPicker(btn: any, get: any, set: any, nullable: any, rerender?: any, fills?: any) {
    let started = false;
    const paint = (v: any) => {
      btn.classList.toggle('none', !v);
      btn.querySelector('span').style.background = TD.fillCss(v);
      const cv = btn.parentElement.querySelector('.cval');
      if (cv) cv.textContent = TD.fillLabel(v);
    };
    TD.openColorPicker(btn, {
      value: get(), nullable, fills,
      onInput(v: any) { if (!started) { begin(); started = true; } set(v); paint(v); render(); },
      onChange(v: any) { if (!started) { begin(); started = true; } set(v); paint(v); render(); },
      onClose() { commit(); if (rerender) rerender(); },
    });
  }
  propsEl.addEventListener('click', (e: any) => {
    const cb = e.target.closest('[data-color]');
    if (cb) {
      const key = cb.dataset.color;
      const target = $('#props .sec[data-target]')?.dataset.target;
      const fills = !!cb.dataset.fills;
      if (target === 'defaults') openPicker(cb, () => state.defaults[key], (v: any) => { state.defaults[key] = v; savePrefs(); }, !!cb.dataset.nullable, null, fills);
      else if (target === 'bucket') openPicker(cb, () => bucketFill, (v: any) => {
        bucketFill = v;
        for (const shape of selected().filter(canBucketFill)) shape.fill = clone(v); // the selection follows the bucket
        savePrefs();
      }, !!cb.dataset.nullable, null, fills);
      else {
        const list = selected().filter((s: any) => s[key] !== undefined);
        openPicker(cb, () => list[0] && list[0][key], (v: any) => { for (const s of list) s[key] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }, !!cb.dataset.nullable, null, fills);
      }
      return;
    }
    const al = e.target.closest('[data-alignv]');
    if (al) { applyProp('align', al.dataset.alignv, true); renderProps(); return; }
    const va = e.target.closest('[data-valign]');
    if (va) { applyProp('valign', va.dataset.valign, true); renderProps(); return; }
    const pv = e.target.closest('[data-pv]');
    if (pv) { applyProp(pv.dataset.pk, pv.dataset.pv, true); renderProps(); return; }
    const sc = e.target.closest('[data-sercolor]');
    if (sc) {
      const s = selected()[0], h = (TD.panels[s.type] as any).color(s, +sc.dataset.sercolor);
      openPicker(sc, h.get, h.set, h.nullable);
      return;
    }
    const pa = e.target.closest('[data-panel] [data-act]');
    if (pa) {
      const s = selected()[0];
      begin();
      const msg = TD.panels[s.type].action!(s, pa.dataset.act, +pa.dataset.i);
      render(); commit(); renderPanel();
      if (typeof msg === 'string') showHint(msg, 1500);
      else if (msg && msg.text) showHint(msg.text, msg.ms || 1500);
      return;
    }
    const vd = e.target.closest('[data-vdel]');
    if (vd) { begin(); delete home().vars![vd.dataset.vdel]; if (!Object.keys(home().vars!).length) delete home().vars; render(); commit(); renderProps(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'ns:menu') return namedMenu(e.target.closest('[data-act]'));
    if (act === 'comp:make') return makeComponent();
    if (act === 'comp:edit') return editComponent(selected()[0]);
    if (act === 'comp:detach') return detachComponent(selected()[0]);
    if (act === 'comp:save') { const c = selected().find((q: any) => q.cpart); return c && saveComponent(c.cpart.ref); }
    if (act && act.startsWith('comp:ins:')) { const c = shapes().find((q: any) => q.type === 'comp' && q.ref === act.slice(9)); if (c) { state.sel = new Set([c.id]); duplicate(); } return; }
    if (act === 'var:add') {
      const V = home().vars || {};
      let k = 1; while (('v' + k) in V) k++;
      begin(); home().vars = { ...V, ['v' + k]: '1' }; render(); commit(); renderProps();
      const inp = propsEl.querySelector(`[data-vname="v${k}"]`); if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
      return;
    }
    if (act === 'front' || act === 'back') reorder(act);
    if (act === 'group') groupSel();
    if (act?.startsWith('cb:')) combineSel(act.slice(3));
    if (act === 'ungroup') ungroupSel();
    if (act?.startsWith('d:')) distributeSel(act.slice(2));
    if (act && act.startsWith('l:')) alignSel(act.slice(2));
    if (act === 'dup') duplicate();
    if (act === 'del') deleteSel();
    if (act === 'pt:add' || act === 'pt:rm' || act === 'pt:corner') { const s = selected()[0]; if (s && s.type === 'poly') TD.polyPoints[act === 'pt:add' ? 'add' : act === 'pt:rm' ? 'remove' : 'corner'](s); }
  });
  propsEl.addEventListener('focusin', (e: any) => {
    const b = formatButton(e.target);
    if (b) previewFormat(b.dataset.alignv ? 'align' : 'valign', b.dataset.alignv || b.dataset.valign);
    const t = e.target;
    if (!t.matches || !t.matches('input.geomin')) return;
    t.select(); t._keepSel = true; // the mouseup of the click that focused it would put a caret instead
  });
  propsEl.addEventListener('focusout', (e: any) => { if (formatButton(e.target)) clearFormatPreview(); });
  propsEl.addEventListener('mouseup', (e: any) => { if (e.target._keepSel) { e.target._keepSel = false; if (e.target.selectionStart !== e.target.selectionEnd) e.preventDefault(); } });
  propsEl.addEventListener('keydown', (e: any) => {
    if (e.key === 'Escape' && e.target.dataset.sizepx) {
      e.preventDefault(); e.stopPropagation(); clearFormatPreview();
      e.target.value = r2(TD.sizePx(selected()[0]?.size ?? state.defaults.size));
      return;
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    const t = e.target;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && t.dataset.geom && /^\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*$/.test(t.value)) {
      e.preventDefault();
      const st = +t.dataset.step * (e.shiftKey ? 10 : 1), v = parseFloat(t.value) + (e.key === 'ArrowUp' ? st : -st);
      t.value = String(r2(v));
      t.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });


  // ---------------- commands ----------------
  function deleteSel() {
    if (!state.sel.size) return;
    begin();
    state.doc.shapes = state.doc.shapes.filter((s: any) => !state.sel.has(s.id));
    state.sel.clear();
    commit(); render(); renderProps();
  }
  function reorder(dir: any) {
    begin();
    const sel = selected(), rest = shapes().filter((s: any) => !state.sel.has(s.id));
    state.doc.shapes = dir === 'front' ? rest.concat(sel) : sel.concat(rest);
    commit(); render();
  }
  // Document view: blocks go in after the active diagram (at the end when there is none), the first new
  // diagram becomes the active one, and the page scrolls to them.
  function insertBlocks(blocks: any, where?: number) {
    if (!blocks.length) return;
    const d = state.doc, at = where != null && where >= 0 && where <= d.blocks.length ? where : d.blocks[d.active] ? d.active + 1 : d.blocks.length;
    if (d.blocks[d.active] && at <= d.active) d.active += blocks.length; // the active block keeps being itself
    d.blocks.splice(at, 0, ...blocks);
    const k = blocks.findIndex((b: any) => b.type === 'diagram');
    if (k >= 0) setActiveBlock(at + k, false); else scheduleSave();
    TD.docview?.changed?.(); // one undo step in the document
    if (TD.docview) TD.docview.render();
    if (k >= 0) TD.docview?.scrollToDiagram(at + k);
    else requestAnimationFrame(() => document.querySelector(`#docview .blk[data-i="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  function pasteShapes(list: any, dx: any, dy = dx) {
    begin();
    state.sel.clear();
    const gmap = new Map(), idmap = new Map(), made = [];
    for (const o of list) {
      const s = clone(o); conform(s); s.id = uid(); idmap.set(o.id, s.id); made.push(s);
      if (s.g) { if (!gmap.has(s.g)) gmap.set(s.g, uid()); s.g = gmap.get(s.g); }
      TD.translate(s, dx, dy);
      addShape(s); state.sel.add(s.id);
    }
    // a lone member copied out of a group pastes as a plain shape, not a group of one
    for (const g of gmap.values()) { const m = made.filter((q) => q.g === g); if (m.length === 1) { delete m[0].g; delete m[0].gname; } }
    remapLinks(made, idmap);
    commit(); render(); renderProps();
  }
  function duplicate() { if (state.sel.size) pasteShapes(selected(), TD.GRID * 2); }
  // Copied shapes are also kept in local storage, so the app's other windows and tabs can paste them.
  function copySel() {
    if (!state.sel.size) return;
    clipboard = { shapes: clone(selected()), n: 0, t: Date.now() };
    store.set(LS_CLIP, { shapes: clipboard.shapes, t: clipboard.t });
  }
  // the latest copy made in any window
  function clip() {
    const c: any = store.get(LS_CLIP, null);
    if (c && validShapes(dropRetired(c.shapes).shapes) && (!clipboard || c.t > clipboard.t)) clipboard = { shapes: dropRetired(c.shapes).shapes, n: 0, t: c.t };
    return clipboard;
  }
  // Paste lands centred in the visible canvas, moved by whole grid steps so it stays on the grid.
  // Pasting again without moving the view steps each copy down-right, so they don't stack.
  // ⌘C also puts the TikZ code on the system clipboard as text: of the selection, or of the whole diagram when
  // nothing is selected, ready for a .tex file.
  let codeCopied: any = null;
  function copyCode() {
    const list = state.sel.size ? selected() : shapes();
    if (!list.length || !navigator.clipboard) return;
    let code;
    try { code = state.mode === 'page' ? TD.pageToLatex(state.doc, { only: state.sel.size ? list : null }) : TD.toTikz(list); } catch (err: any) { return; }
    codeCopied = code;
    // the code pastes back as these shapes, here and in the app's other windows (the whole diagram when nothing is selected)
    const t = Date.now();
    clipboard = { shapes: clone(list), n: 0, t };
    store.set(LS_CLIP, { shapes: clipboard.shapes, t, code });
    navigator.clipboard.writeText(code).then(() => { codeFailed = 0; if (!state.sel.size) showHint(uiText('hint.copiedDiagramTikz', 'Copied the TikZ code of this diagram'), 1500); }, () => { codeFailed = t; });
  }
  // ⌘V: what the system clipboard holds decides. A copy made in this app (in any of its windows) pastes its
  // shapes; anything else comes in through takeIn below. A browser that sends no paste event gets the shapes.
  let pasteTimer = 0, codeFailed = 0;
  function pasteSoon() { clearTimeout(pasteTimer); pasteTimer = setTimeout(() => { if (!document.body.classList.contains('cz-open')) paste(); }, 80); }
  function ownCopy(text: any) {
    if (text === codeCopied) return true;
    const c: any = store.get(LS_CLIP, null);
    return !!(c && c.code && c.code === text);
  }
  document.addEventListener('paste', (e) => {
    if (document.body.classList.contains('cz-open')) { clearTimeout(pasteTimer); pasteTimer = 0; return; }
    if (!pasteTimer || isTyping(e.target) || !$('#modal').hidden || !imp.hidden) return;
    clearTimeout(pasteTimer); pasteTimer = 0;
    const dt = e.clipboardData, text = (dt && dt.getData('text/plain')) || '', files = dt ? [...dt.files] : [];
    // shapes copied here while the system clipboard could not be written: the clipboard's text is older
    const stale = codeFailed && clipboard && clipboard.t >= codeFailed;
    if (ownCopy(text) || stale || (!text.trim() && !files.length)) { paste(); return; }
    e.preventDefault();
    takeIn(text, files, null, undefined, (dt && dt.getData('text/html')) || '');
  });
  // ---------- from outside: pasted or dropped ----------
  // Pictures (PNG, JPEG, SVG, and GIF, WebP … as PNG) go in as images, as the Image tool inserts them. Text is read
  // by TD.pasteIn: TikZ and LaTeX are imported (straight in when every line becomes shapes, else through the
  // import dialog, which says what stays code), a block's bare environment becomes that block, a formula or a
  // symbol a text object holding it as maths, anything else a text object. A dropped .tex file is read as text.
  // Things land on the point they are dropped on (pasted: the middle of the view); in Document view they become
  // blocks, after the block they are dropped on (pasted: after the active one).
  const PIC_FILE = (f: File) => /^image\//.test(f.type) || /\.(svg|png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(f.name);
  const TEXT_FILE = (f: File) => /\.(tex|tikz|ltx|txt)$/i.test(f.name) || /^text\/(plain|x-tex)/.test(f.type);
  async function takeIn(text: string, files: File[], at: any, docAt?: number, html = '') {
    const pics = files.filter(PIC_FILE), texts = files.filter((f) => !PIC_FILE(f) && TEXT_FILE(f)), t = String(text || '').trim();
    // on the canvas, cells from a spreadsheet (or a Markdown table) become a Table block, and so does a dropped .csv, .tsv or .xlsx
    if (state.mode !== 'document') {
      const sheet = files.find(TABLE_FILE);
      if (sheet && !pics.length) {
        try { const r = await TD.table.importFile(sheet); placeTable(r.table, at, uiText('hint.insertedTable', 'Inserted {name} as a table', { name: sheet.name })); } catch (err: any) { showHint(uiText('hint.couldntRead', "Couldn't read {name}: {error}", { name: sheet.name, error: err.message || err }), 2600); }
        return;
      }
      const tb = files.every(PIC_FILE) && tableFrom(html, text); // a spreadsheet's copy may carry a picture of the cells too
      if (tb) { placeTable(tb, at, uiText('hint.pastedTable', 'Pasted as a table · double-click to edit it')); return; }
    }
    // a picture copied from a file manager or a web page carries its file name or address as text too
    const nameOnly = !t || (!t.includes('\n') && (/^https?:\/\/\S+$/.test(t) || /^[^\s\\$]+\.\w{2,5}$/.test(t) || pics.some((f) => f.name === t)));
    if (pics.length && nameOnly) return takePictures(pics.map((f) => ({ blob: f, name: f.name })), at, docAt);
    if (t) return takeText(text, at, docAt);
    if (texts.length) { try { return takeText(await texts[0].text(), at, docAt); } catch (err: any) { showHint(uiText('hint.couldntReadFile', "Couldn't read {name}", { name: texts[0].name }), 2000); return; } }
    if (files.length) showHint(uiText('hint.cantUse', "Can't use {name}: drop a picture (PNG, JPEG, SVG, GIF, WebP) or a .tex file", { name: files[0].name }), 2600);
  }
  const TABLE_FILE = (f: File) => /\.(csv|tsv|tab|xlsx|xlsm)$/i.test(f.name);
  /** cells copied from a spreadsheet or the Table workspace (HTML with tab-separated text), or a Markdown table: a table model */
  function tableFrom(html: string, text: string) {
    const T = TD.table, body = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    try {
      const own = html && /data-diagramtex-table="/.test(html) && new DOMParser().parseFromString(html, 'text/html').querySelector('[data-diagramtex-table]');
      if (own) return T.normalize(JSON.parse(own.getAttribute('data-diagramtex-table')!));
      const rows = body.split('\n'), tabbed = rows.length > 1 && rows.every((l) => l.includes('\t') || !l.trim());
      if (tabbed && html && T.isHtml(html)) return T.fromHtml(html);
      if (tabbed) return T.fromDelimited(body, '\t');
      if (T.detect(body) === 'markdown' && rows.length > 2) return T.importText(body, 'markdown').table;
    } catch (err: any) { /* not a table after all: pasted as text */ }
    return null;
  }
  /** a Table block centred on `at` (pasted: the middle of the view), selected */
  function placeTable(table: any, at: any, msg: string) {
    begin();
    const c = at || viewCentre(), s = addShape({ ...TYPES.table.create(c, state.defaults), table: TD.table.normalize(table) });
    const L = TD.table.layout(s.table);
    s.x = c.x - L.w / 2; s.y = c.y - L.h / 2;
    state.sel = new Set([s.id]);
    commit(); render(); renderProps();
    showHint(msg, 1800);
  }
  async function takePictures(list: { blob: Blob | string; name: string }[], at: any, docAt?: number) {
    const got: { pic: Picture; name: string }[] = [];
    for (const it of list) {
      try { got.push({ pic: await readPicture(it.blob), name: it.name }); }
      catch (err: any) { showHint(uiText('hint.couldntOpenFile', "Couldn't open {name}: {error}", { name: it.name || uiText('hint.thatPicture', 'that picture'), error: err.message }), 2600); }
    }
    if (!got.length) return;
    if (state.mode === 'document') {
      insertBlocks(got.map((g) => ({ type: 'image', src: g.pic.src, name: g.name || 'image', width: 0.6, caption: '' })), docAt);
      return;
    }
    begin();
    state.sel.clear();
    const c = at || viewCentre(), G = TD.GRID;
    got.forEach((g, k) => state.sel.add(placeImage(g.pic, stemOf(g.name) || 'image', { x: c.x + k * G * 2, y: c.y + k * G * 2 }).id));
    commit(); render(); renderProps();
    showHint(got.length > 1 ? uiText('hint.insertedPictures', 'Inserted {n} pictures', { n: got.length }) : uiText('hint.insertedPicture', 'Inserted the picture · the LaTeX names it {file}', { file: TYPES.image.fileName(selected()[0]) }), 2000);
  }
  async function takeText(text: string, at: any, docAt?: number) {
    const P = TD.pasteIn, k = P.kind(text);
    if (k === 'empty') return;
    if (k === 'svg') return takePictures([{ blob: text.trim(), name: 'image.svg' }], at, docAt);
    if (k === 'image') {
      let blob: Blob;
      try { blob = await (await fetch(text.trim())).blob(); } catch (err: any) { showHint(uiText('hint.couldntReadPicture', "Couldn't read that picture"), 2000); return; }
      return takePictures([{ blob, name: 'image' }], at, docAt);
    }
    if (k === 'tex' || k === 'block') {
      const src = k === 'block' ? P.asPicture(text) : text;
      let res = null;
      try { res = TD.importLatex(src); } catch (err: any) { res = null; }
      const list = res ? res.blocks.flatMap((b: any) => b.shapes || []) : [];
      const clean = res && list.length && !(res.kept || []).length && !res.warnings.length && !res.blocks.some((b: any) => b.type === 'text');
      if (!clean) { openImport(src); return; }
      groupPictures(res);
      placeImported(res, at, docAt);
      // a block is named (code that became one, too), not counted as a shape
      const one = list.length === 1 && (k === 'block' || TD.blocks.get(list[0].type)) ? list[0] : null;
      showHint(one ? uiText('hint.pastedBlock', 'Pasted the {name} block', { name: TYPES[one.type] ? typeName(one.type) : uiText('hint.block', 'block') })
        : list.length === 1 ? uiText('hint.importedShapes.one', 'Imported 1 shape') : uiText('hint.importedShapes.many', 'Imported {n} shapes', { n: list.length }), 1800);
      return;
    }
    const body = P.asText(text, k);
    if (state.mode === 'document') { insertBlocks([{ type: 'text', text: k === 'math' ? `$${body}$` : String(text).trim() }], docAt); return; }
    begin();
    const s = addShape(TYPES.text.create(at || viewCentre(), state.defaults));
    s.text = body;
    // a long line wraps at 12 cm, as a paragraph would
    if (body.split('\n').some((l: any) => l.length > 90)) { s.tw = 12 * PX; s.align = 'left'; }
    conform(s);
    state.sel = new Set([s.id]);
    commit(); render(); renderProps();
    showHint(k === 'math' ? uiText('hint.pastedFormula', 'Pasted as a formula') : uiText('hint.pastedText', 'Pasted as text'), 1200);
  }
  // Dropping: only drags from outside the page (a drag started here, like a file row in the sidebar, is not one)
  let innerDrag = false;
  document.addEventListener('dragstart', () => { innerDrag = true; });
  document.addEventListener('dragend', () => { innerDrag = false; });
  const dropZone = (e: any) => (e.target as Element).closest?.('#stage, #docview') as HTMLElement | null;
  const projectDropFile = (file: File) => /\.diagramtex$/i.test(file.name) || file.type === 'application/vnd.diagramtex+json';
  const canOpenProjectDrop = () => $('#modal').hidden && imp.hidden &&
    ![...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(dialog => dialog.getClientRects().length > 0);
  async function openDroppedProjects(files: File[], items: DataTransferItem[]) {
    // Capture handle promises during the drop event: Chromium may revoke access
    // after the first await. Other browsers simply open an unlinked project copy.
    const handles = items.filter(item => item.kind === 'file').map(item => {
      try { return Promise.resolve((item as any).getAsFileSystemHandle?.()).catch(() => null); }
      catch { return Promise.resolve(null); }
    });
    for (const [i, file] of files.entries()) {
      if (!projectDropFile(file)) continue;
      try {
        const text = await file.text(), handle = await handles[i];
        if (await openText(text, file.name, handle?.kind === 'file' ? handle : null)) {
          setQuick(false); setTable(false);
        }
      } catch (error: any) {
        await TD.alert(uiText('dlg.openFailed.title', 'Couldn\'t open "{name}"', { name: file.name }),
          uiText('hint.couldntRead', "Couldn't read {name}: {error}", { name: file.name, error: error.message || error }));
      }
    }
  }
  const fromOutside = (e: any) => !innerDrag && !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/plain' || t === 'text/uri-list');
  document.addEventListener('dragover', (e: any) => {
    if (!fromOutside(e)) return;
    e.preventDefault(); // a file dropped anywhere else would make the browser leave the app to show it
    const z = canOpenProjectDrop() && (e.dataTransfer.types.includes('Files') || (dropZone(e) && !inTool()));
    e.dataTransfer.dropEffect = z ? 'copy' : 'none';
    document.body.classList.toggle('drop-over', !!z);
  });
  document.addEventListener('dragleave', (e: any) => { if (!e.relatedTarget) document.body.classList.remove('drop-over'); });
  document.addEventListener('drop', (e: any) => {
    document.body.classList.remove('drop-over');
    if (!fromOutside(e)) return;
    e.preventDefault();
    if (!canOpenProjectDrop()) return;
    const dt = e.dataTransfer, files = [...dt.files] as File[];
    if (files.some(projectDropFile)) { void openDroppedProjects(files, [...dt.items]); return; }
    if (!dropZone(e) || inTool()) return;
    let text = dt.getData('text/plain') || '';
    const uri = (dt.getData('text/uri-list') || '').split('\n').find((l: string) => l && !l.startsWith('#')) || '';
    let docAt: number | undefined;
    if (state.mode === 'document') { const b = (e.target as Element).closest('#docview .blk') as HTMLElement | null; docAt = b ? +b.dataset.i! + 1 : undefined; }
    const at = state.mode === 'document' ? null : toWorld(e);
    // a picture dragged from a web page comes as its address: fetched (where the site allows it)
    if (!files.length && uri && (!text.trim() || text.trim() === uri.trim()) && /^(https?:|data:image\/)/.test(uri)) {
      fetch(uri).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then((blob) => {
        if (!/^image\//.test(blob.type)) throw new Error('not a picture');
        takePictures([{ blob, name: decodeURIComponent((uri.split(/[?#]/)[0].split('/').pop() || 'image')) }], at, docAt);
      }).catch(() => showHint(uiText('hint.siteBlocksCopy', "That site doesn't let its pictures be copied: save the picture, then drop the file"), 3000));
      return;
    }
    takeIn(text, files, at, docAt, dt.getData('text/html') || '');
  });
  // at: centred on that point of the drawing (the menu's Paste, where the right-click was); else on the view's middle,
  // each paste there a little further on
  function paste(at?: { x: number; y: number }) {
    pasteTimer = 0;
    const c = clip();
    if (!c) return;
    if (state.mode === 'document') {
      const gmap = new Map(), idmap = new Map(), made = c.shapes.map((o: any) => { const x = clone(o); x.id = uid(); idmap.set(o.id, x.id); if (x.g) { if (!gmap.has(x.g)) gmap.set(x.g, uid()); x.g = gmap.get(x.g); } return x; });
      remapLinks(made, idmap);
      insertBlocks([{ type: 'diagram', shapes: made }]);
      return;
    }
    const r = fitArea(), v = state.view, G = TD.GRID; // the clear space left of the panel column
    const cx = at ? at.x : v.x + r.w / 2 / v.zoom, cy = at ? at.y : v.y + r.h / 2 / v.zoom;
    const key = `${Math.round(cx / G)},${Math.round(cy / G)}`;
    if (c.at !== key) { c.at = key; c.n = 0; }
    const b = TD.bboxOf(c.shapes.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }));
    const step = at ? 0 : G * 2 * c.n++;
    pasteShapes(c.shapes, Math.round((cx - b.x - b.w / 2) / G) * G + step, Math.round((cy - b.y - b.h / 2) / G) * G + step);
  }
  // Quick's Add to Document / Diagram / Page / Whiteboard: leave Quick and add the shapes to the open file, in the middle of the visible view (a new
  // diagram at the cursor in a document), selected but not opened
  function placeOnCanvas(list: any[]) {
    setQuick(false);
    const shapes = list.map((o) => { const s = clone(o); s.id = uid(); return s; });
    if (state.mode === 'document') { insertBlocks([{ type: 'diagram', shapes }]); return; }
    const r = fitArea(), v = state.view, G = TD.GRID;
    const cx = v.x + r.w / 2 / v.zoom, cy = v.y + r.h / 2 / v.zoom;
    const b = TD.bboxOf(shapes.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }));
    pasteShapes(shapes, Math.round((cx - b.x - b.w / 2) / G) * G, Math.round((cy - b.y - b.h / 2) / G) * G);
  }
  // ---------- combine (shape booleans) ----------
  const COMBINE = [['unite'], ['intersect'], ['subtract'], ['exclude'], ['divide']];
  function combineName(key: string) {
    return key === 'unite' ? uiText('combine.unite', 'Unite') : key === 'intersect' ? uiText('combine.intersect', 'Intersect') : key === 'subtract' ? uiText('combine.subtract', 'Subtract')
      : key === 'exclude' ? uiText('combine.exclude', 'Exclude') : uiText('combine.divide', 'Divide');
  }
  const COMBINE_ICON: Record<string, IconName> = { unite: 'combineUnite', intersect: 'combineIntersect', subtract: 'combineSubtract', exclude: 'combineExclude', divide: 'combineDivide' };
  const combinable = () => { const sel = selected(); return sel.length > 1 && sel.every((s: any) => TD.canCombine && TD.canCombine(s)); };
  function combineSel(op: any) {
    const sel = selected();
    if (sel.length < 2) return showHint(uiText('hint.combine.selectTwo', 'Select two or more closed shapes to combine'), 1500);
    if (!combinable()) return showHint(uiText('hint.combine.closedOnly', 'Combine works on closed shapes: rectangles, ellipses, closed polylines, filled symbols, regions'), 2200);
    const all = shapes(), list = sel.slice().sort((a: any, b: any) => all.indexOf(a) - all.indexOf(b));
    let res;
    try { res = TD.combineGeom(list, op); } catch (e: any) { console.error(e); res = null; }
    if (!res) return showHint(uiText('hint.combine.failed', 'Could not combine these shapes'), 1500);
    begin();
    const at = all.indexOf(list[0]);
    const made = res.map((r: any) => ({ id: uid(), type: 'region', rings: r.rings, ...TD.regionStyle(r.from) }));
    const rest = all.filter((s: any) => !state.sel.has(s.id)), pos = rest.filter((s: any) => all.indexOf(s) < at).length;
    state.doc.shapes = [...rest.slice(0, pos), ...made, ...rest.slice(pos)];
    state.sel = new Set(made.map((s: any) => s.id));
    commit(); render(); renderProps();
    showHint(made.length ? (made.length > 1 ? uiText('hint.combine.many', '{name}: {n} shapes', { name: combineName(op), n: made.length }) : uiText('hint.combine.one', '{name}: 1 shape', { name: combineName(op) })) : uiText('hint.combine.nothing', 'Nothing left: the shapes do not overlap that way'), 1500);
  }
  // ---------- groups ----------
  function groupIds(id: any) {
    const s = byId(id);
    return s && s.g ? shapes().filter((q: any) => q.g === s.g).map((q: any) => q.id) : [id];
  }
  function expandGroups() {
    const gs = new Set(selected().map((s: any) => s.g).filter(Boolean));
    if (gs.size) for (const q of shapes()) if (gs.has(q.g)) state.sel.add(q.id);
  }
  function unionBox(list: any) {
    return TD.bboxOf(list.flatMap((s: any) => { const b = TD.bbox(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0);
  }
  const canGroup = () => { const sel = selected(); return sel.length > 1 && !(sel[0].g && sel.every((s: any) => s.g === sel[0].g)); };
  const canUngroup = () => selected().some((s: any) => s.g);
  function groupSel() {
    if (!canGroup()) return;
    begin();
    const g = uid();
    for (const s of selected()) { s.g = g; s.scopeGroup = true; }
    // keep members adjacent in z-order (at the topmost member's position)
    const sel = selected(), all = shapes();
    let top = 0;
    all.forEach((s: any, i: any) => { if (state.sel.has(s.id)) top = i; });
    const rest = all.filter((s: any) => !state.sel.has(s.id)), at = all.slice(0, top).filter((s: any) => !state.sel.has(s.id)).length;
    state.doc.shapes = [...rest.slice(0, at), ...sel, ...rest.slice(at)];
    commit(); render(); renderProps(); showHint(uiText('hint.grouped', 'Grouped {n} objects', { n: sel.length }), 1000);
  }
  function ungroupSel() {
    if (!canUngroup()) return;
    begin();
    for (const s of selected()) { delete s.g; delete s.gname; delete s.scopeGroup; }
    commit(); render(); renderProps(); showHint(uiText('hint.ungrouped', 'Ungrouped'), 1000);
  }

  // ---------- components (src/domain/components.ts) ----------
  // Make: the selection becomes one instance, its origin the middle of their box (on the grid). Edit: an
  // instance opens into its shapes, grouped and marked (cpart); Save writes them back to every linked copy.
  function replaceWith(old: any, made: any) {
    const all = shapes(), ids = new Set(old.map((q: any) => q.id));
    const at = Math.max(...old.map((q: any) => all.indexOf(q)));
    const rest = all.filter((q: any) => !ids.has(q.id)), pos = all.slice(0, at).filter((q: any) => !ids.has(q.id)).length;
    state.doc.shapes = [...rest.slice(0, pos), ...made, ...rest.slice(pos)];
    state.sel = new Set(made.map((q: any) => q.id));
  }
  // A box's label: a text in its middle, grouped with it so they move together (Enter or a double-click on the box).
  // A second time edits the same text.
  const BOXED = new Set(['rect', 'ellipse', 'ball', 'poly']);
  function labelInside(s: any) {
    if (s.type === 'poly' && !s.closed) return;
    const b = TD.bbox(s), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let t = s.g && shapes().find((q: any) => q.g === s.g && q.type === 'text' && Math.abs(q.x - cx) < b.w / 2 && Math.abs(q.y - cy) < b.h / 2);
    if (!t) {
      begin();
      t = addShape(TYPES.text.create({ x: cx, y: cy }, state.defaults));
      delete t.valign; // grows both ways from the middle
      const g = s.g || uid();
      s.g = g; t.g = g;
      // the label right above its box in the order
      const all = shapes(); all.splice(all.indexOf(t), 1); all.splice(all.indexOf(s) + 1, 0, t);
      commit();
    }
    state.sel = new Set([t.id]);
    render(); renderProps();
    startEdit(t.id, 'text');
  }
  function makeComponent() {
    const all = shapes(), list = selected().slice().sort((a: any, b: any) => all.indexOf(a) - all.indexOf(b));
    if (list.length < 2) return showHint(uiText('hint.comp.selectTwo', 'Select two or more objects (or a group) to make a component'), 1800);
    const b = unionBox(list), G = TD.GRID, ox = Math.round((b.x + b.w / 2) / G) * G, oy = Math.round((b.y + b.h / 2) / G) * G;
    const used = new Set(all.filter((q: any) => q.type === 'comp').map((q: any) => q.cname));
    let k = 1; while (used.has('part' + k)) k++;
    begin();
    const inst = { id: uid(), type: 'comp', x: ox, y: oy, ref: uid(), cname: 'part' + k, def: TD.comp.defOf(list, ox, oy) };
    replaceWith(list, [inst]);
    commit(); render(); renderProps();
    showHint(uiText('hint.comp.made', 'Made component {name}: duplicate it for linked copies, exported as a TikZ pic', { name: 'part' + k }), 2400);
  }
  function openParts(inst: any, mark: any) {
    const P = TD.comp.placed(inst), idmap = new Map(), g = uid();
    for (const p of P) {
      const n = uid(); idmap.set(p.id, n); p.id = n; p.g = g; p.gname = inst.cname;
      if (mark) p.cpart = { ref: inst.ref, name: inst.cname, at: [inst.x, inst.y] };
    }
    remapLinks(P, idmap);
    return P;
  }
  function editComponent(inst: any) {
    if (!inst || inst.type !== 'comp') return;
    begin(); replaceWith([inst], openParts(inst, true)); commit(); render(); renderProps();
    showHint(uiText('hint.comp.editing', 'Editing {name}: change its parts, then Save Component to update every copy', { name: inst.cname }), 2600);
  }
  function detachComponent(inst: any) {
    if (!inst || inst.type !== 'comp') return;
    begin(); replaceWith([inst], openParts(inst, false)); commit(); render(); renderProps();
    showHint(uiText('hint.comp.detached', 'Detached: plain shapes, no longer linked'), 1500);
  }
  function saveComponent(ref: any) {
    const list = shapes().filter((q: any) => q.cpart && q.cpart.ref === ref);
    if (!list.length) return;
    const { at, name } = list[0].cpart, def = TD.comp.defOf(list, at[0], at[1]);
    begin();
    let n = 0;
    for (const q of shapes()) if (q.type === 'comp' && q.ref === ref) { q.def = clone(def); q.cname = name; n++; }
    replaceWith(list, [{ id: uid(), type: 'comp', x: at[0], y: at[1], ref, cname: name, def }]);
    commit(); render(); renderProps();
    showHint(n ? uiText('hint.comp.savedN', 'Saved {name}: {n} copies updated', { name, n: n + 1 }) : uiText('hint.comp.saved', 'Saved {name}', { name }), 1800);
  }
  function componentSections(sel: Shape[]): FormSection[] {
    const one = sel.length === 1 && sel[0].type === 'comp' ? sel[0] : null;
    if (one) {
      const n = shapes().filter((q: Shape) => q.type === 'comp' && q.ref === one.ref).length;
      return [section(uiText('comp.section', 'Component'), [{ ...row(captions["ui.name"], { kind: 'input', value: one.cname || '', attrs: { type: 'text', id: 'pCname', 'data-cname': '', spellcheck: 'false', autocomplete: 'off' } }), labelFor: 'pCname' },
        { kind: 'actions', class: 'btns', buttons: [{ text: uiText('comp.editParts', 'Edit Parts'), attrs: { 'data-act': 'comp:edit', title: uiText('comp.editParts.title', 'Open the parts to change them; Save Component then updates every copy') } }, { text: uiText('comp.detach', 'Detach'), attrs: { 'data-act': 'comp:detach', title: uiText('comp.detach.title', 'Turn this copy into plain shapes, no longer linked') } }] },
        { kind: 'hint', text: [uiText('comp.exportPic', '{lead} The export defines it once as a TikZ pic, ', { lead: n > 1 ? uiText('comp.linkedCopies', '{n} linked copies in this diagram.', { n }) : uiText('comp.dupForCopies', 'Duplicate it for linked copies.') }), { code: `\\pic at (x,y) {${TD.comp.picBase(one.cname)}}` }, '.'] }], 'sec')];
    }
    const c = sel.find(q => q.cpart);
    return c ? [section(uiText('comp.section', 'Component'), [{ kind: 'actions', class: 'btns', buttons: [{ text: uiText('comp.save', 'Save Component'), attrs: { 'data-act': 'comp:save', title: uiText('comp.save.title', 'Write these parts back to {name} and every linked copy', { name: c.cpart.name }) } }] }, { kind: 'hint', text: [uiText('comp.editingHint', 'Editing {name}. Save writes every shape of this group back to the component.', { name: c.cpart.name })] }], 'sec')] : [];
  }
  function compLibrary(): FormSection[] {
    const seen = new Map<string, { name: string; n: number }>();
    for (const q of shapes()) if (q.type === 'comp') { const e = seen.get(q.ref) || { name: q.cname, n: 0 }; e.n++; seen.set(q.ref, e); }
    return seen.size ? [section(uiText('comp.library', 'Components'), [...seen].map(([ref, e]) => row(e.name, { kind: 'text', text: e.n === 1 ? uiText('comp.copies.one', '1 copy') : uiText('comp.copies.many', '{n} copies', { n: e.n }), class: 'hint-inline' }, { kind: 'spacer' }, { kind: 'button', text: uiText('comp.insertCopy', 'Insert Copy'), attrs: { 'data-act': 'comp:ins:' + ref } })), 'sec')] : [];
  }
  // ---------- layers ----------
  // The Layers window lists the diagram's shapes from the top of the stack down, as an image editor lists its
  // layers. A group is one row (folded at first) with its members indented below it. A row selects its shapes
  // (Shift: a range, Ctrl/Cmd: add or remove), the eye hides them (not drawn, not exported), the lock keeps them
  // from being picked or changed, a double-click renames, a drag restacks (into or out of a group), and a
  // right-click opens the object menu with Rename, Hide and Lock on top. Hidden and locked shapes never stay
  // selected. Names: `name` on a shape, `gname` on every member of a group.
  const layersEl = $('#layers'), layersWin = $('#layersWin');
  const openGroups = new Set();
  let layersKey = '', layersRaf = 0, layerHover: any = null, layerAnchor: any = null, layerDrag: any = null, layerPressKey: any = null;
  const pickable = (s: any) => s && !s.hidden && !s.locked;
  function pruneSel() { for (const id of [...state.sel]) if (!pickable(byId(id))) state.sel.delete(id); }
  function autoName(s: any) {
    // a library symbol is named by what it says, else by which symbol it is (all of them are of type Shape)
    const t = ((s.type === 'text' || s.type === 'sym' ? s.text : s.label) || '').replace(/\s+/g, ' ').trim();
    return t ? (t.length > 48 ? t.slice(0, 48) + '…' : t) : (s.type === 'sym' && TD.SYMS?.[s.kind]?.name) || (TYPES[s.type] && typeName(s.type)) || s.type;
  }
  const layerName = (s: any) => s.name || autoName(s);
  // groups by id in one pass over the shapes, bottom member first; a rebuild of the panel reads it once
  // per row instead of scanning every shape per group
  let groupIndex: Map<any, any[]> | null = null;
  const groupsOf = () => { const out = new Map(); for (const q of shapes()) if (q.g) { const m = out.get(q.g); if (m) m.push(q); else out.set(q.g, [q]); } return out; };
  const groupName = (g: any) => ((groupIndex || groupsOf()).get(g) || []).find((q: any) => q.gname)?.gname || uiText('layers.group', 'Group');
  // a small picture of the shape, drawn as it exports; remembered against the shape's data
  const thumbs = new Map();
  function thumb(s: any) {
    const key = JSON.stringify(s), m = thumbs.get(s.id);
    if (m && m.key === key) return m.html;
    let html = '';
    try {
      const b = TD.bbox(s), pad = Math.max(b.w, b.h, 4) * 0.1;
      TD.takeFillDefs();
      const body = TYPES[s.type].svg(s, { zoom: 1, hit: 0, export: true, scene: [s] }), defs = TD.takeFillDefs() || '';
      html = `<svg viewBox="${r2(b.x - pad)} ${r2(b.y - pad)} ${r2(b.w + 2 * pad)} ${r2(b.h + 2 * pad)}" aria-hidden="true">${defs}${body}</svg>`;
    } catch (err: any) { html = ''; }
    thumbs.set(s.id, { key, html, pendingIds: pendingDependencies(html) });
    return html;
  }
  // the rows, top of the stack first; a group at its topmost member
  function layerRows() {
    const all = shapes(), rows = [], seen = new Set(), groups = groupIndex || groupsOf();
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (!s.g) { rows.push({ s }); continue; }
      if (seen.has(s.g)) continue;
      seen.add(s.g);
      const m = groups.get(s.g).slice().reverse();
      rows.push({ g: s.g, m });
      if (openGroups.has(s.g)) for (const q of m) rows.push({ s: q, in: s.g });
    }
    return rows;
  }
  let rowCaptions: { eyeT: string; eyeF: string; lockT: string; lockF: string } | null = null; // looked up once per rebuild rather than once per row
  function layerRow(r: any): LayerRow {
    const flags = (list: any) => ({ on: list.every((q: any) => state.sel.has(q.id)), hid: list.every((q: any) => q.hidden), lk: list.every((q: any) => q.locked) });
    const { eyeT, eyeF, lockT, lockF } = rowCaptions || { eyeT: caption(captions["ui.show"]), eyeF: caption(captions["ui.hide"]), lockT: caption(captions["ui.unlock"]), lockF: caption(captions["ui.lock"]) };
    const buttons = (f: any) => ({ eye: { icon: (f.hid ? 'hide' : 'show') as IconName, title: f.hid ? eyeT : eyeF }, lock: { icon: (f.lk ? 'lock' : 'unlock') as IconName, title: f.lk ? lockT : lockF } });
    if (r.g) {
      const f = flags(r.m), open = openGroups.has(r.g);
      return { key: 'g:' + r.g, g: r.g, name: groupName(r.g), ...f, ...buttons(f), open, count: r.m.length, thumb: iconSvg('folder'), icon: true,
        fold: { icon: 'disclosure' as IconName, title: open ? uiText('layers.fold', 'Fold') : uiText('layers.unfold', 'Unfold'), label: open ? uiText('layers.foldGroup', 'Fold group') : uiText('layers.unfoldGroup', 'Unfold group') } };
    }
    const s = r.s, f = flags([s]);
    return { key: s.id, id: s.id, name: layerName(s), ...f, ...buttons(f), inGroup: !!r.in, thumb: s.type === 'text' ? iconSvg('toolText') : thumb(s), icon: s.type === 'text' };
  }
  function scheduleLayers() {
    if (layersRaf) return;
    layersRaf = requestAnimationFrame(() => { layersRaf = 0; renderLayers(); });
  }
  function renderLayers(): void {
    if (!TD.math.previewing) return TD.math.preview(renderLayers);
    if (!layersEl) return;
    const n = state.mode === 'document' ? 0 : shapes().length;
    $('#layersCount').textContent = n ? String(n) : '';
    if (state.mode === 'document' || layersWin.classList.contains('collapsed')) { layersKey = ''; return; }
    if (drag || layerDrag || layerRenameHeld) return; // the call after the drag or rename catches up
    const key = [state.docId, state.mode, [...openGroups].join(), [...state.sel].join(), ...shapes().map((s: any) => JSON.stringify(s))].join('\u0001');
    if (key === layersKey) return;
    layersKey = key;
    const sc = layersEl.scrollTop;
    // keyed rows: a row whose shape didn't change keeps its element and picture (an edit on a large drawing doesn't
    // lay out every row again)
    groupIndex = n ? groupsOf() : null;
    rowCaptions = { eyeT: caption(captions["ui.show"]), eyeF: caption(captions["ui.hide"]), lockT: caption(captions["ui.unlock"]), lockF: caption(captions["ui.lock"]) };
    try {
      renderSvelteView(layersEl, LayerList, { rows: n ? layerRows().map(layerRow) : [], empty: uiText('layers.empty', 'Shapes you draw are listed here, the top one first.'),
        renaming: layerRenaming, nameLabel: uiText('layers.name', 'Layer name'), rename: layerRename,
        renameEnd: () => { layerRenameHeld = false; layerRenaming = null; layersKey = ''; render(); renderProps(); } } satisfies LayerListModel);
    } finally { groupIndex = null; rowCaptions = null; }
    layersEl.scrollTop = sc;
    const sel = state.sel.size;
    $('#layersFoot [data-la="newgroup"]').disabled = !canGroup();
    $('#layersFoot [data-la="ungroup"]').disabled = !canUngroup();
    $('#layersFoot [data-la="del"]').disabled = !sel;
    if (thumbs.size > n + 200) { const ids = new Set(shapes().map((s: any) => s.id)); for (const id of [...thumbs.keys()]) if (!ids.has(id)) thumbs.delete(id); }
  }
  // the shapes a row stands for, bottom first
  const rowIds = (row: any) => (row.dataset.g ? shapes().filter((q: any) => q.g === row.dataset.g).map((q: any) => q.id) : [row.dataset.id]);
  const rowKey = (row: any) => (row.dataset.g ? 'g:' + row.dataset.g : row.dataset.id);
  const rowByKey = (k: any) => (k ? layersEl.querySelector(k.startsWith('g:') ? `.ly-row[data-g="${k.slice(2)}"]` : `.ly-row[data-id="${k}"]`) : null);
  const keyIds = (k: any) => (k.startsWith('g:') ? shapes().filter((q: any) => q.g === k.slice(2)).map((q: any) => q.id) : [k]);
  function selectRow(row: any, e: any) {
    const ids = rowIds(row);
    if (!ids.some((id: any) => pickable(byId(id)))) { showHint(ids.every((id: any) => (byId(id))!.hidden) ? uiText('hint.hiddenSelect', 'Hidden: show it to select it') : uiText('hint.lockedSelect', 'Locked: unlock it to select it'), 1400); return; }
    const rows = [...layersEl.querySelectorAll('.ly-row')], a = rowByKey(layerAnchor);
    if (e.shiftKey && a) {
      const i = rows.indexOf(a), j = rows.indexOf(row);
      state.sel = new Set();
      for (const r of rows.slice(Math.min(i, j), Math.max(i, j) + 1)) for (const id of rowIds(r)) state.sel.add(id);
    } else if (e.metaKey || e.ctrlKey) {
      const all = ids.every((id: any) => state.sel.has(id));
      for (const id of ids) all ? state.sel.delete(id) : state.sel.add(id);
      layerAnchor = rowKey(row);
    } else { state.sel = new Set(ids); layerAnchor = rowKey(row); }
    renderOverlay(); renderProps();
  }
  function setLayerFlag(ids: any, key: any, on: any) {
    begin();
    for (const id of ids) { const s = byId(id); if (!s) continue; if (on) s[key] = true; else delete s[key]; }
    commit(); render(); renderProps();
  }
  function deleteIds(ids: any) {
    const set = new Set(ids);
    begin();
    state.doc.shapes = shapes().filter((s: any) => !set.has(s.id));
    for (const id of ids) state.sel.delete(id);
    commit(); render(); renderProps();
  }
  function layerAction(a: any, key: any) {
    const ids = keyIds(key), ls = ids.map(byId).filter(Boolean);
    if (a === 'rename') { const r = rowByKey(key); if (r) renameRow(r); }
    if (a === 'hide' || a === 'show') setLayerFlag(ids, 'hidden', a === 'hide');
    if (a === 'lock' || a === 'unlock') setLayerFlag(ids, 'locked', a === 'lock');
    if (a === 'del' && ls.length) deleteIds(ids);
  }
  // rename in place: the row's own field (LayerList); kept or not, the panel is drawn again after
  let layerRenaming: string | null = null, layerRenameHeld = false;
  function renameRow(row: any) {
    layerRenaming = rowKey(row);
    layersKey = '';
    renderLayers();
    layerRenameHeld = true; // drawn with its field, then held until the rename ends
  }
  function layerRename(r: LayerRow, v: string) {
    const g = r.g, s = g ? null : byId(r.id), cur = g ? groupName(g) : layerName(s);
    if (v === cur) return;
    begin();
    if (g) { for (const q of shapes()) if (q.g === g) { if (v && v !== 'Group') q.gname = v; else delete q.gname; } }
    else if (s) { if (v && v !== autoName(s)) s.name = v; else delete s.name; }
    commit();
  }
  // drop the dragged shapes above or below a row; a member row of an open group (or the lower half of an open
  // group's own row) takes them into that group, anywhere else takes them out. A dragged group stays whole.
  function dropTarget(e: any) {
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('#layers .ly-row');
    if (!row || row.classList.contains('drag')) return null;
    const r = row.getBoundingClientRect(), upper = e.clientY < r.top + r.height / 2;
    if ((row as HTMLElement).dataset.g && !upper && openGroups.has((row as HTMLElement).dataset.g) && !layerDrag.group) return { row, mode: 'into' };
    return { row, mode: upper ? 'above' : 'below' };
  }
  function dropLayers(t: any) {
    const all = shapes(), moving = all.filter((s: any) => layerDrag.ids.has(s.id)), r = t.row;
    let anchor, above, into: any = null;
    if (r.dataset.g) {
      const m = all.filter((q: any) => q.g === r.dataset.g);
      if (t.mode === 'into') { anchor = m[m.length - 1]; above = true; into = r.dataset.g; }
      else if (t.mode === 'above') { anchor = m[m.length - 1]; above = true; }
      else { anchor = m[0]; above = false; }
    } else {
      anchor = byId(r.dataset.id); above = t.mode === 'above';
      if (r.classList.contains('ly-in')) {
        into = anchor!.g;
        if (layerDrag.group) { const m = all.filter((q: any) => q.g === into); anchor = above ? m[m.length - 1] : m[0]; into = null; }
      }
    }
    if (!anchor || layerDrag.ids.has(anchor.id)) return;
    const rest = all.filter((s: any) => !layerDrag.ids.has(s.id));
    const i = rest.indexOf(anchor) + (above ? 1 : 0);
    begin();
    if (!layerDrag.group) for (const s of moving) {
      if (into) { s.g = into; s.scopeGroup = true; const gn = rest.find((q: any) => q.g === into && q.gname); if (gn) s.gname = gn.gname; else delete s.gname; }
      else { delete s.g; delete s.gname; delete s.scopeGroup; }
    }
    state.doc.shapes = [...rest.slice(0, i), ...moving, ...rest.slice(i)];
    commit(); render(); renderProps();
  }
  function clearDropMarks() { for (const el of layersEl.querySelectorAll('.drop-above, .drop-below, .drop-into, .drag')) el.classList.remove('drop-above', 'drop-below', 'drop-into', 'drag'); }
  if (layersEl) {
    layersEl.addEventListener('pointerdown', (e: any) => {
      const row = e.target.closest('.ly-row');
      if (!row || e.button !== 0 || e.target.closest('button, input')) return;
      layerPressKey = rowKey(row);
      const ids = rowIds(row), already = ids.every((id: any) => state.sel.has(id));
      // a click on a row of the selection keeps it until the pointer comes up, so the whole selection can be dragged
      if (!already || e.shiftKey || e.metaKey || e.ctrlKey) selectRow(row, e);
      const dragIds = ids.every((id: any) => state.sel.has(id)) ? new Set(state.sel) : new Set(ids);
      layerDrag = { row, y: e.clientY, on: false, ids: dragIds, group: !!row.dataset.g, plain: already && !(e.shiftKey || e.metaKey || e.ctrlKey), e };
      layersEl.setPointerCapture(e.pointerId);
    });
    layersEl.addEventListener('pointermove', (e: any) => {
      if (!layerDrag) {
        const row = e.target.closest('.ly-row'), ids = row ? rowIds(row) : null, k = ids ? ids.join() : '';
        if (k !== (layerHover || []).join()) { layerHover = ids; renderOverlay(); }
        return;
      }
      if (!layerDrag.on) {
        if (Math.abs(e.clientY - layerDrag.y) < 4) return;
        layerDrag.on = true;
        for (const r of layersEl.querySelectorAll('.ly-row')) if (rowIds(r).every((id: any) => layerDrag.ids.has(id))) r.classList.add('drag');
      }
      for (const el of layersEl.querySelectorAll('.drop-above, .drop-below, .drop-into')) el.classList.remove('drop-above', 'drop-below', 'drop-into');
      const t = dropTarget(e);
      if (t) t.row.classList.add('drop-' + t.mode);
      const r = layersEl.getBoundingClientRect(); // scroll near the ends
      if (e.clientY < r.top + 16) layersEl.scrollTop -= 8; else if (e.clientY > r.bottom - 16) layersEl.scrollTop += 8;
    });
    const endDrag = (e: any, ok: any) => {
      const d = layerDrag;
      if (!d) return;
      layerDrag = null;
      if (d.on) { const t = ok ? dropTarget(Object.assign({}, { clientX: e.clientX, clientY: e.clientY })) : null; clearDropMarks(); layerDrag = d; if (t) dropLayers(t); layerDrag = null; layersKey = ''; renderLayers(); }
      else if (ok && d.plain) selectRow(d.row, d.e);
      scheduleLayers(); // the rebuild skipped while the button was down
    };
    layersEl.addEventListener('pointerup', (e: any) => endDrag(e, true));
    layersEl.addEventListener('pointercancel', (e: any) => endDrag(e, false));
    layersEl.addEventListener('pointerleave', () => { if (!layerDrag && layerHover) { layerHover = null; renderOverlay(); } });
    layersEl.addEventListener('click', (e: any) => {
      const b = e.target.closest('button[data-la]'), row = e.target.closest('.ly-row');
      if (!b || !row) return;
      const ids = rowIds(row), ls = ids.map(byId);
      if (b.dataset.la === 'eye') setLayerFlag(ids, 'hidden', !ls.every((q: any) => q!.hidden));
      if (b.dataset.la === 'lock') setLayerFlag(ids, 'locked', !ls.every((q: any) => q!.locked));
      if (b.dataset.la === 'fold') { const g = row.dataset.g; if (openGroups.has(g)) openGroups.delete(g); else openGroups.add(g); renderLayers(); }
    });
    layersEl.addEventListener('dblclick', (e: any) => {
      if (e.target.closest('button, input')) return;
      // the first click may have rebuilt the rows, so find the row again by what it stands for
      const hit = e.target.closest('.ly-row'), row = rowByKey(hit && hit.isConnected ? rowKey(hit) : layerPressKey);
      if (!row) return;
      renderLayers();
      const live = rowByKey(rowKey(row));
      if (live) renameRow(live);
    });
    layersEl.addEventListener('contextmenu', (e: any) => {
      const row = e.target.closest('.ly-row');
      e.preventDefault();
      if (!row) { openCtx(e.clientX, e.clientY); return; }
      const ids = rowIds(row);
      if (ids.some((id: any) => pickable(byId(id))) && !ids.every((id: any) => state.sel.has(id))) selectRow(row, { shiftKey: false, metaKey: false, ctrlKey: false });
      openCtx(e.clientX, e.clientY, { key: rowKey(row), ids });
    });
    $('#layersFoot').addEventListener('click', (e: any) => {
      const b = e.target.closest('button[data-la]');
      if (!b) return;
      if (b.dataset.la === 'newgroup') groupSel();
      if (b.dataset.la === 'ungroup') ungroupSel();
      if (b.dataset.la === 'del') deleteSel();
    });
    $('#layersHead').addEventListener('click', () => {
      const open = layersWin.classList.contains('collapsed');
      foldWin(layersWin, $('#layersToggle'), open, true, () => { if (open) { layersKey = ''; renderLayers(); } }, [$('#propsWin')]);
      savePrefs();
    });
  }

  // ---------- arrange ----------
  function arrange(how: any) {
    if (!state.sel.size) return;
    if (how === 'front' || how === 'back') return reorder(how);
    begin();
    const a = shapes().slice(), inSel = (s: any) => state.sel.has(s.id);
    if (how === 'forward') {
      for (let i = a.length - 2; i >= 0; i--) if (inSel(a[i]) && !inSel(a[i + 1])) [a[i], a[i + 1]] = [a[i + 1], a[i]];
    } else {
      for (let i = 1; i < a.length; i++) if (inSel(a[i]) && !inSel(a[i - 1])) [a[i], a[i - 1]] = [a[i - 1], a[i]];
    }
    state.doc.shapes = a;
    commit(); render();
  }

  // ---------- rotate / flip about the selection centre ----------
  // how: 'cw' | 'ccw' | 'fliph' | 'flipv'  (screen coordinates, y down)
  function transformSel(how: any) {
    const sel = selected();
    if (!rotatable(sel) || ((how === 'cw' || how === 'ccw') && !turnable(sel))) return;
    const b = unionBox(sel), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const M = ({ cw: (dx: any, dy: any) => [-dy, dx], ccw: (dx: any, dy: any) => [dy, -dx], fliph: (dx: any, dy: any) => [-dx, dy], flipv: (dx: any, dy: any) => [dx, -dy] } as Record<string, any>)[how];
    const P = (x: any, y: any) => { const [u, v] = M(x - cx, y - cy); return [cx + u, cy + v]; };
    const quarter = how === 'cw' || how === 'ccw';
    begin();
    if (how === 'fliph' || how === 'flipv') for (const s of sel) if (TD.ROT_TYPES.has(s.type) && s.angle) s.angle = -s.angle;
    for (const s of sel) {
      const t = TYPES[s.type];
      if (s.type === 'poly') { s.pts = s.pts.map(([x, y]: any) => P(x, y)); continue; }
      if (s.type === 'region') { s.rings = s.rings.map((r: any) => r.map(([x, y]: any) => P(x, y))); continue; }
      if (s.type === 'sym') {
        const [ax, ay] = P(s.x, s.y), [bx, by] = P(s.x + s.w, s.y + s.h);
        Object.assign(s!, { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
        const r = s.rot || 0;
        if (how === 'cw') s.rot = (r + 1) % 4;
        else if (how === 'ccw') s.rot = (r + 3) % 4;
        else {
          s.rot = (4 - r) % 4; if (how === 'fliph') s.fx = !s.fx; else s.fy = !s.fy; // F·R(k) = R(−k)·F
          if (+s.angle) s.angle = -s.angle; // a mirror reverses the free rotation and the skew too
          if (+s.skew) s.skew = -s.skew;
        }
        continue;
      }
      if (s.type === 'image' || s.type === 'text') {
        // move the centre with the transform; quarter turns also turn the object itself
        const bb = TD.bbox(s), [nx, ny] = P(bb.x + bb.w / 2, bb.y + bb.h / 2); TD.translate(s, nx - (bb.x + bb.w / 2), ny - (bb.y + bb.h / 2));
        if (quarter) s.angle = TD.normDeg((s.angle || 0) + (how === 'cw' ? -90 : 90));
        continue;
      }
      if (s.type === 'rect') {
        const [ax, ay] = P(s.x, s.y), [bx, by] = P(s.x + s.w, s.y + s.h);
        Object.assign(s!, { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
        continue;
      }
      if (fixedContent(s.type)) {
        // content is not rotated: move the object so its centre follows the transform
        const bb = TD.bbox(s), [nx, ny] = P(bb.x + bb.w / 2, bb.y + bb.h / 2);
        TD.translate(s, nx - (bb.x + bb.w / 2), ny - (bb.y + bb.h / 2));
        continue;
      }
      // an elbow's middle goes where the transform takes it
      const mh = s.type === 'line' && t.handles(s).find((h: any) => h.k === 'mid');
      if (s.type === 'line' && quarter && TD.routeOf(s) !== 'straight') s.dir = TD.routeDir(s).replace(/[hv]/g, (c: string) => (c === 'h' ? 'v' : 'h'));
      for (const [kx, ky] of t.pts) [s[kx], s[ky]] = P(s[kx], s[ky]);
      if (mh) { const [mx, my] = P(mh.x, mh.y); TD.placeElbowMid(s, { x: mx, y: my }); }
      if (s.type === 'ellipse' && quarter) [s.rx, s.ry] = [s.ry, s.rx];
      if (s.type === 'arc' && quarter && s.ry > 0) [s.r, s.ry] = [s.ry, s.r];
      if (s.type === 'arc') {
        const [a1, a2] = [s.a1, s.a2];
        if (how === 'cw') { s.a1 = a1 - 90; s.a2 = a2 - 90; }
        else if (how === 'ccw') { s.a1 = a1 + 90; s.a2 = a2 + 90; }
        else if (how === 'fliph') { s.a1 = 180 - a2; s.a2 = 180 - a1; }
        else { s.a1 = -a2; s.a2 = -a1; }
        if (!quarter && +s.angle) s.angle = -s.angle; // a mirror turns the axes the other way
        const n = Math.floor(s.a1 / 360) * 360; s.a1 -= n; s.a2 -= n;
      }
      // mirroring swaps which side a path label sits on
      if (!quarter && s.labelSide) s.labelSide = s.labelSide === 'left' ? 'right' : 'left';
    }
    commit(); render(); renderProps();
  }

  // ---------- align / distribute ----------
  // Units are groups: a group moves as one block.
  function units() {
    const m = new Map();
    for (const s of selected()) { const k = s.g || s.id; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return [...m.values()].map((list) => ({ list, b: unionBox(list) }));
  }
  function alignSel(how: any) {
    const us = units();
    if (us.length < 2) return;
    const B = unionBox(selected());
    begin();
    for (const u of us) {
      let dx = 0, dy = 0;
      if (how === 'left') dx = B.x - u.b.x;
      if (how === 'right') dx = B.x + B.w - (u.b.x + u.b.w);
      if (how === 'center') dx = B.x + B.w / 2 - (u.b.x + u.b.w / 2);
      if (how === 'top') dy = B.y - u.b.y;
      if (how === 'bottom') dy = B.y + B.h - (u.b.y + u.b.h);
      if (how === 'middle') dy = B.y + B.h / 2 - (u.b.y + u.b.h / 2);
      for (const s of u.list) TD.translate(s, dx, dy);
    }
    commit(); render(); renderGeom();
  }
  function distributeSel(axis: any) {
    const us = units();
    if (us.length < 3) return;
    const X = axis === 'h' ? 'x' : 'y', W = axis === 'h' ? 'w' : 'h';
    us.sort((a, b) => a.b[X] + a.b[W] / 2 - (b.b[X] + b.b[W] / 2));
    const first = us[0].b, last = us[us.length - 1].b;
    const total = us.reduce((a, u) => a + u.b[W], 0);
    const gap = (last[X] + last[W] - first[X] - total) / (us.length - 1);
    begin();
    let pos = first[X];
    for (const u of us) {
      const d = pos - u.b[X];
      for (const s of u.list) TD.translate(s, axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
      pos += u.b[W] + gap;
    }
    commit(); render(); renderGeom();
  }
  const outputWait = () => uiText('output.waitForRendering', 'Rendering is still in progress. Wait until it finishes before printing or exporting.');
  // Probe only the selected objects, including nested labels. Force deferred
  // compilation so checking an offscreen/cold object cannot block the UI.
  function outputReady(list?: any[]): boolean {
    if (!list) return !TD.math.pending;
    // A compiled result can still be decoding or fading into the mounted object.
    for (const shape of list) {
      const mounted = content.querySelector(`[data-id="${CSS.escape(shape.id || '')}"]`);
      if (mounted?.querySelector('.math-pending')) return false;
      if (mounted?.getAnimations({ subtree: true }).some((animation: Animation) =>
        (animation as CSSTransition).transitionProperty === 'opacity' && animation.playState === 'running')) return false;
    }
    return TD.math.preview(() => {
      const html = fillDefsAround(() => list.filter(s => !s.hidden).map(s => TYPES[s.type].svg(s, { zoom: 1, hit: 0, export: true, scene: list })).join(''));
      return !pendingDependencies(html).some(id => TD.math.hasPendingJob(id));
    }, true);
  }
  function outputAllowed(list?: any[]): boolean {
    if (outputReady(list)) return true;
    showHint(outputWait(), 2200); return false;
  }
  const OUTPUT_BUTTONS: [string, string][] = [['topbar', '[data-cmd="export"], [data-cmd="print"], [data-cmd="tikz"]'], ['quick', '[data-q]'], ['pwQuick', '[data-q]'], ['tableview', 'button[data-render]']];
  function updateOutputAvailability(): void {
    const busy = !!TD.math.pending;
    // runs on every maths progress round: searched within each container, not across a page that may hold a large table
    for (const [id, sel] of OUTPUT_BUTTONS) (id === 'tableview' ? document.querySelector('#tableview .tb-outbar') : document.getElementById(id))?.querySelectorAll<HTMLButtonElement>(sel).forEach(b => { if (b.disabled !== busy) b.disabled = busy; });
    if (busy) closeExport();
    const ctx = ctxShown && document.getElementById(CTX_ID);
    if (ctx) {
      // the kit's rows (data-act), set in place: the menu's items don't change while it is open
      const objectButtons = ctx.querySelectorAll<HTMLButtonElement>('[data-act^="img:"], [data-act="copytikz"]');
      if (objectButtons.length) {
        const ready = outputReady(selected());
        objectButtons.forEach(b => { if (b.disabled === ready) b.disabled = !ready; });
      }
      ctx.querySelectorAll<HTMLButtonElement>('[data-act="doc:print"], [data-act="doc:html"], [data-act="doc:latex"], [data-act="doc:tikz"], [data-act="doc:image"]').forEach(b => { if (b.disabled !== busy) b.disabled = busy; });
    }
  }
  async function copyTikz() {
    if (!state.sel.size || !outputAllowed(selected())) return;
    copySel();
    const code = TD.toTikz(selected());
    try { await navigator.clipboard.writeText(code); showHint(uiText('hint.tikzCopied', 'TikZ code copied'), 1200); }
    catch (e: any) { openTikz(); }
  }

  // The selection as a picture, from the right-click menu: copied (PNG, or SVG as image and text) or saved
  // like an export (into the file's export folder, else downloaded). PNG comes on a white background or
  // transparent (the item says which; `-t` is transparent) at 4× the Export menu's DPI; an SVG, copied or saved,
  // carries its maths fonts, so it shows the same wherever it is pasted.
  async function selImage(what: any) {
    const list = selected().filter((s: any) => !s.hidden);
    if (!list.length) { showHint(uiText('hint.nothingVisible', 'Nothing visible is selected'), 1200); return; }
    if (!outputAllowed(list)) return;
    const name = slug() + '-selection';
    const clear = what.endsWith('-t'), kind = what.replace(/-t$/, '');
    const dpi = expOpts.dpi * 4;
    const png = () => TD.app.pngOf(list, dpi, clear, true);
    const svg = () => svgWithFonts(TD.app.svgOf(list));
    try {
      if (kind === 'copy-png') {
        // the item is made during the click with the picture still to come: Safari allows a copy only then
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
        showHint(clear ? uiText('hint.copiedPngClear', 'Copied as PNG at {dpi} DPI, transparent', { dpi }) : uiText('hint.copiedPng', 'Copied as PNG at {dpi} DPI', { dpi }), 1400);
      } else if (kind === 'copy-svg') {
        const text = svg(), item: Record<string, any> = { 'text/plain': text.then((t: string) => new Blob([t], { type: 'text/plain' })) };
        if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = text.then((t: string) => new Blob([t], { type: 'image/svg+xml' }));
        await navigator.clipboard.write([new ClipboardItem(item)]);
        showHint(uiText('hint.copiedSvg', 'Copied as SVG'), 1200);
      } else if (kind === 'save-png') {
        await askDir();
        await out(name + '.png', await png());
      } else if (kind === 'save-svg') {
        await askDir();
        await out(name + '.svg', await svg(), 'image/svg+xml');
      }
    } catch (e: any) {
      showHint(kind.startsWith('copy') ? uiText('hint.couldntCopyPic', "Couldn't copy the picture ({error})", { error: e.message || e }) : uiText('hint.couldntSavePic', "Couldn't save the picture ({error})", { error: e.message || e }), 3000);
    }
  }

  // ---------- context menu ----------
  // The right-click menus of the canvas, the Layers rows, the guides and the file list, and the menus other parts of
  // the app ask for (openMenu): the kit's menu (src/ui/kit/context-menu.ts), open as #ctxMenu. A row's act says what
  // it does; ctxFor holds what it acts on (the file, folder, Layers row or guide it was opened on).
  const CTX_ID = 'ctxMenu';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  // shortcuts are written the Windows way and shown as glyphs on a Mac (src/ui/kit/keys.ts)
  const kb = (k: string) => keyLabel(k);
  let ctxFor: { doc?: string; folder?: string; layer?: string; guideId?: string; pick?: (act: string) => void; at?: { x: number; y: number } } = {};
  let ctxShown = false;
  const ctxOpen = () => ctxShown;
  function closeCtx() { if (ctxShown) closeContextMenu(); }
  type CtxRow = MenuEntry | '' | false | null | undefined;
  function item(label: any, act: string, { ic, key, dis, sub, danger }: { ic?: IconName; key?: string; dis?: boolean; sub?: CtxRow[]; danger?: boolean } = {}): MenuItemSpec {
    // deleting turns the red pen when highlighted, as everywhere
    return { act, label: caption(label), icon: ic, key: key || undefined, disabled: !!dis, danger: danger ?? /del(ete)?$/.test(act), sub: sub ? tidyMenu(sub) : undefined };
  }
  const hr = '-' as const;
  function placeCtx(rows: CtxRow[], x: number, y: number, on: typeof ctxFor = {}) {
    ctxFor = on;
    openContextMenu(tidyMenu(rows), x, y, ctxAct, { id: CTX_ID, onclose: () => { ctxShown = false; } });
    ctxShown = true;
    updateOutputAvailability();
  }
  // layer: { key, ids } when opened on a row of the Layers window; its Rename / Hide / Lock come first, and a
  // hidden or locked row (which can't be selected) gets only those and Delete
  // at: the drawing's point under a right-click on the canvas, where its Paste puts what it pastes
  function openCtx(x: any, y: any, layer?: any, at?: { x: number; y: number }) {
    const sel = selected(), n = sel.length, nu = n ? units().length : 0;
    const h: CtxRow[] = [];
    const on = { layer: layer ? layer.key : '', ...(at ? { at } : {}) };
    if (layer) {
      const ls = layer.ids.map(byId).filter(Boolean), hid = ls.every((q: any) => q.hidden), lk = ls.every((q: any) => q.locked);
      h.push(item(captions["ui.rename"], 'layer:rename', { ic: 'rename' }),
        item(hid ? captions["ui.show"] : captions["ui.hide"], 'layer:' + (hid ? 'show' : 'hide'), { ic: hid ? 'show' : 'hide' }),
        item(lk ? captions["ui.unlock"] : captions["ui.lock"], 'layer:' + (lk ? 'unlock' : 'lock'), { ic: lk ? 'unlock' : 'lock' }), hr);
      if (ls.some((q: any) => q.hidden || q.locked)) { placeCtx([...h, item(captions["ui.delete"], 'layer:del', { ic: 'delete', key: 'Del' })], x, y, on); return; }
    }
    if (n) {
      const one = n === 1 ? sel[0] : null;
      const image = (verb: string) => [item(uiText('ctx.pngBg', 'PNG (Background)'), `img:${verb}-png`), item(uiText('ctx.pngClear', 'PNG (Transparent)'), `img:${verb}-png-t`), item('SVG', `img:${verb}-svg`)];
      if (one && (one.type === 'text' || one.label !== undefined)) h.push(item(one.type === 'text' ? uiText('ctx.editText', 'Edit Text') : uiText('ctx.editLabel', 'Edit Label'), 'edit', { ic: 'edit', key: 'Enter' }), hr);
      h.push(item(captions["ui.copy"], 'copy', { ic: 'copy', key: 'Ctrl+C' }),
        item(captions["ui.copy.tikz.code"], 'copytikz', { ic: 'code' }),
        item(uiText('ctx.copyImage', 'Copy as Image'), '', { ic: 'toolImage', sub: image('copy') }),
        item(uiText('ctx.saveImage', 'Save as Image'), '', { ic: 'download', sub: image('save') }),
        sel.some((s: any) => (s.text || s.label || '').trim()) && item(uiText('ctx.copyText', 'Copy Text'), 'copytext', { ic: 'copy' }),
        item(captions["ui.cut"], 'cut', { ic: 'cut', key: 'Ctrl+X' }),
        item(captions["ui.paste"], 'paste', { ic: 'paste', key: 'Ctrl+V', dis: !clip() }),
        item(captions["ui.duplicate"], 'dup', { ic: 'duplicate', key: 'Ctrl+D' }),
        item(captions["ui.delete"], 'del', { ic: 'delete', key: 'Del' }), hr,
        canGroup() && item(captions["ui.group"], 'group', { ic: 'group', key: 'Ctrl+G' }),
        canUngroup() && item(captions["ui.ungroup"], 'ungroup', { ic: 'ungroup', key: 'Ctrl+Shift+G' }),
        n > 1 && item(uiText('comp.make', 'Make Component'), 'comp:make', { ic: 'group' }),
        n > 1 && item(uiText('combine.title', 'Combine'), '', { ic: 'group', dis: !combinable(), sub: COMBINE.map(([k]) => item(combineName(k), 'cb:' + k)) }),
        item(uiText('ctx.arrange', 'Arrange'), '', { ic: 'arrange', sub: [
          item(uiText('ctx.front', 'Bring to Front'), 'a:front', { key: 'Ctrl+Shift+]' }), item(uiText('ctx.forward', 'Bring Forward'), 'a:forward', { key: 'Ctrl+]' }),
          item(uiText('ctx.backward', 'Send Backward'), 'a:backward', { key: 'Ctrl+[' }), item(uiText('ctx.back', 'Send to Back'), 'a:back', { key: 'Ctrl+Shift+[' })] }),
        rotatable() && item(uiText('ctx.rotate', 'Rotate'), '', { ic: 'rotate', sub: [
          item(uiText('ctx.cw', 'Rotate 90° Clockwise'), 'r:cw', { key: 'Ctrl+R', dis: !turnable() }), item(uiText('ctx.ccw', 'Rotate 90° Counterclockwise'), 'r:ccw', { key: 'Ctrl+Shift+R', dis: !turnable() }), hr,
          item(uiText('ctx.flipH', 'Flip Horizontal'), 'r:fliph'), item(uiText('ctx.flipV', 'Flip Vertical'), 'r:flipv')] }),
        item(captions["ui.align"], '', { ic: 'alignLefts', dis: nu < 2, sub: [
          item(captions["ui.left"], 'l:left'), item(captions["ui.center"], 'l:center'), item(captions["ui.right"], 'l:right'), hr,
          item(captions["ui.top"], 'l:top'), item(uiText('ctx.middle', 'Middle'), 'l:middle'), item(captions["ui.bottom"], 'l:bottom')] }),
        item(uiText('ctx.distribute', 'Distribute'), '', { ic: 'distribute', dis: nu < 3, sub: [item(uiText('ctx.horizontally', 'Horizontally'), 'd:h'), item(uiText('ctx.vertically', 'Vertically'), 'd:v')] }));
    } else {
      h.push(item(captions["ui.paste"], 'paste', { ic: 'paste', key: 'Ctrl+V', dis: !clip() }),
        item(uiText('ctx.selectAll', 'Select All'), 'all', { ic: 'selectAll', key: 'Ctrl+A', dis: !shapes().length }), hr,
        item(uiText('ctx.fit', 'Zoom to Fit'), 'fit', { ic: 'fit' }), item(uiText('ctx.fitWidth', 'Zoom to Fit Width'), 'fitw'),
        item(state.grid ? uiText('ctx.hideGrid', 'Hide Grid') : uiText('ctx.showGrid', 'Show Grid'), 'grid', { key: 'G' }));
    }
    placeCtx(h, x, y, on);
  }
  // ---------- document list: right-click menu ----------
  // Rename, Duplicate, Save As, Copy, Paste and Delete work on the row's file without switching to it;
  // Download, Export and Print act on the open file, so they open the row's file first.
  let docClip: any = null; // last copied file (project JSON); the system clipboard gets the same text
  const docData = (id: any) => { if (id === state.docId) saveNow(); return store.get<Record<string, any> | null>(LS_DOC + id, null); };
  const docEntry = (id: any) => index().find((d) => (d as any).id === id);
  // project-file JSON for a stored file (the same format Save writes)
  // Project file: { app, version: 3, kind: 'page' | 'classic' | 'board', name, page, sheet | blocks }.
  const projectJson = TD.projectFiles.stringify;
  function docJson(id: any) {
    const d = docData(id);
    return d ? projectJson(d) : null;
  }
  // ---------- share links ----------
  // A small file can travel in a link: its project JSON, deflated and base64url-encoded, after "#share=".
  // The part after "#" never leaves the browser (it isn't sent to the server), and opening the link adds a
  // copy to the files of whoever opens it. Links longer than SHARE_MAX are refused: many chat apps, mail
  // clients, proxies and firewalls cut or reject long URLs, so a larger file is shared as a file.
  const SHARE_MAX = 8000, SHARE_KEY = 'share=';
  const b64u = (bytes: any) => { let t = ''; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s: any) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
  const viaStream = async (bytes: any, S: any) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new S('deflate-raw'))).arrayBuffer());
  // "1." + deflated text, or "0." + the text as it is where the browser can't compress
  async function packShare(text: any) {
    const raw = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'function') { try { return '1.' + b64u(await viaStream(raw, CompressionStream)); } catch (e: any) { /* fall through */ } }
    return '0.' + b64u(raw);
  }
  async function unpackShare(code: any) {
    const m = /^([01])\.([\w-]+)$/.exec(code);
    if (!m) throw new Error('the link is incomplete');
    let bytes = unb64u(m[2]);
    if (m[1] === '1') {
      if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot read compressed links');
      bytes = await viaStream(bytes, DecompressionStream);
    }
    return new TextDecoder().decode(bytes);
  }
  const shareBase = () => location.origin + location.pathname;
  // Numbers go in the link to 6 significant digits: a drag off the grid leaves coordinates like
  // 219.28932188134524, whose digits barely compress (a third or more of a hand-drawn board's link). 6 digits is
  // far finer than anything drawn or exported (0.001 px on a 200 px coordinate), and a value someone typed
  // (0.125, 0.0005) has fewer digits, so it goes through unchanged. Whole numbers are left alone.
  const shareNum = (_k: any, v: any) => (typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(6)) : v);
  async function shareLink(id: any) {
    finishEdit(); commit();
    const it: any = docEntry(id), json = docJson(id);
    if (!it || !json) return;
    // the link carries the file without its folder: the folder is how the sender files it
    const p = JSON.parse(json); p.name = leafOf(p.name);
    const url = shareBase() + '#' + SHARE_KEY + (await packShare(JSON.stringify(p, shareNum)));
    if (url.length > SHARE_MAX) {
      TD.alert(uiText('dlg.shareTooLarge.title', 'Too large to share as a link'), uiText('dlg.shareTooLarge.body', '"{name}" needs a link of {k}k characters; links are kept under {max}k so browsers, chat apps and firewalls don\'t cut them off. Save it to a .diagramtex file and send the file instead.', { name: leafOf(it.name), k: Math.ceil(url.length / 1000), max: SHARE_MAX / 1000 }));
      return;
    }
    try { await navigator.clipboard.writeText(url); showHint(uiText('hint.shareCopied', 'Share link copied ({n} characters). Whoever opens it gets their own copy of "{name}".', { n: url.length.toLocaleString(), name: leafOf(it.name) }), 3200); }
    catch (e: any) { TD.prompt(uiText('dlg.shareLink.title', 'Share Link'), url, { ok: caption(captions["ui.done"]), cancel: null }); }
  }
  // Open the file in a share link as a new file. The same link opened again opens the copy made the
  // first time, if it is still here unchanged.
  async function openShared() {
    const h = location.hash.slice(1);
    if (!h.startsWith(SHARE_KEY)) return false;
    history.replaceState(null, '', location.pathname + location.search); // a reload doesn't add it again
    let p: any;
    try {
      const text = await unpackShare(h.slice(SHARE_KEY.length));
      p = parseProject(text, 'Shared');
      if (!p) throw new Error('it holds no DiagramTeX file');
    } catch (e: any) { TD.alert(uiText('dlg.sharedFailed.title', "Couldn't open the shared file"), uiText('dlg.sharedFailed.body', 'This share link is damaged or cut short ({error}). Ask for the link again, or for the .diagramtex file.', { error: e.message })); return true; }
    const same = projectJson(p);
    for (const x of index()) {
      if (leafOf((x as any).name) !== p.name) continue;
      const d = store.get<Record<string, any> | null>(LS_DOC + (x as any).id, null);
      let q: any = null; try { q = d && parseProject(projectJson({ ...d, name: p.name })); } catch (e: any) { q = null; }
      if (q && projectJson(q) === same) { openDoc((x as any).id); showHint(uiText('hint.alreadyHere', '"{name}" is already here', { name: p.name }), 1600); return true; }
    }
    const name = index().some((x) => (x as any).name === p.name) ? copyName(p.name) : p.name;
    if (p.kind === 'page') newDoc(name, null, null, null, p.page, 'page', p.sheet);
    else { newDoc(name, null, null, p.blocks, p.page, p.kind); zoomFit(); }
    showHint(uiText('hint.openedShared', 'Opened the shared file "{name}". It is now saved in this browser.', { name }), 3000);
    return true;
  }
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#' + SHARE_KEY)) { setQuick(false); setTable(false); openShared(); } });
  // store a copy of a file under a new name, listed right after `afterId`; returns the new id
  function storeCopy(d: any, name: any, afterId: any) {
    const id = uid(), kind = normKind(d.kind);
    store.set(LS_DOC + id, { ...JSON.parse(JSON.stringify(d)), kind, name });
    const idx: any[] = index(), at = idx.findIndex((x) => x.id === afterId), it = { id, name, kind, updated: Date.now(), created: Date.now() };
    if (at >= 0) idx.splice(at + 1, 0, it); else idx.push(it);
    store.set(LS_INDEX, idx);
    return id;
  }
  const copyName = (n: any) => { const names = new Set(index().map((d) => (d as any).name)); let k = 1, t = `${n} copy`; while (names.has(t)) t = `${n} copy ${++k}`; return t; };
  // A project file's contents: { kind, name, page, sheet } or { kind, name, page, blocks }; false if the text
  // isn't JSON, and an error if it is JSON but not a DiagramTeX file.
  function parseProject(text: any, fallbackName?: any) {
    return TD.projectFiles.parse(text, fallbackName, retiredHint);
  }
  // Open a project file's text (from a file or the clipboard) as a new file. Returns false if it isn't one.
  function openProjectText(text: any, fallbackName: any, unique?: any) {
    const p = parseProject(text, fallbackName);
    if (!p) return false;
    let name = p.name;
    if (unique && index().some((x) => (x as any).name === name)) name = copyName(name); // a pasted file never takes an existing name
    if (p.kind === 'page') newDoc(name, null, null, null, p.page, 'page', p.sheet);
    else { newDoc(name, null, null, p.blocks, p.page, p.kind); zoomFit(); }
    return true;
  }
  // A project file's contents (parseProject) as storage keeps a file of the app; `old`, what storage held, gives the view and mode.
  function storedOf(p: any, old: any) {
    return p.kind === 'page'
      ? { kind: 'page', name: p.name, page: p.page, sheet: p.sheet, view: old.view, mode: 'page' }
      : { kind: p.kind, name: p.name, blocks: p.blocks, active: 0, page: p.page, view: old.view, mode: p.kind === 'board' ? 'board' : (old.mode === 'diagram' ? 'diagram' : 'document') };
  }
  // Put a project file's contents into an existing file of the app (reopening it from disk).
  function replaceDoc(id: any, p: any) {
    if (state.docId === id) saveNow();
    const old = store.get<Record<string, any> | null>(LS_DOC + id, null) || {};
    recovery.take(id, old.kind ? old : null, docEntry(id)?.updated, true); // what it held stays recoverable
    store.set(LS_DOC + id, storedOf(p, old));
    const idx = index(), it: any = idx.find((x) => (x as any).id === id);
    if (it) { it.name = p.name; it.kind = p.kind; it.updated = Date.now(); store.set(LS_INDEX, idx); }
    if (state.docId === id) state.docId = null; // reopen without saving the old contents over the new
    openDoc(id);
  }
  // A bundle: every file of the app (Pages, Classic and Whiteboard) in one .diagramtex,
  // { app, version: 3, kind: 'bundle', files: [project file, …] }, in the order of the file list.
  function bundleJson() {
    if (state.docId) saveNow();
    const files = index().map((x) => { const d = store.get<Record<string, any> | null>(LS_DOC + (x as any).id, null); return d ? JSON.parse(projectJson(d)) : null; }).filter(Boolean);
    return { text: JSON.stringify({ app: 'diagramtex', version: 3, kind: 'bundle', files }, null, 1), n: files.length };
  }
  function exportAll() {
    finishEdit();
    const { text, n } = bundleJson();
    if (!n) { showHint(uiText('hint.noFilesExport', 'No files to export'), 1400); return; }
    download(`DiagramTeX files ${new Date().toISOString().slice(0, 10)}${FILE_EXT}`, text, FILE_TYPE);
    showHint(n === 1 ? uiText('hint.exportedBundle.one', 'Exported 1 file in one bundle') : uiText('hint.exportedBundle.many', 'Exported {n} files in one bundle', { n }), 1600);
  }
  const isBundle = (d: any) => !!d && typeof d === 'object' && d.kind === 'bundle' && Array.isArray(d.files);
  // Each file of a bundle goes to the list of its kind. A file already here with the same name and contents is
  // skipped (opening a backup twice adds nothing); one whose name is taken gets "copy" added.
  function importBundle(d: any) {
    const idx: any[] = index(), names = new Set(idx.map((x) => x.name)), have = new Map();
    const key = (q: any) => { try { const r = parseProject(projectJson(q)); return r ? projectJson(r) : null; } catch { return null; } };
    for (const x of idx) { const s = store.get<Record<string, any> | null>(LS_DOC + x.id, null); const k = s && key(s); if (k) have.set(k, x.id); }
    const n: Record<string, any> = { page: 0, classic: 0, board: 0 };
    let same = 0, bad = 0, first = null;
    for (const f of d.files) {
      let p: any = null;
      try { p = parseProject(JSON.stringify(f), 'Untitled'); } catch { p = null; }
      if (!p) { bad++; continue; }
      if (have.has(projectJson(p))) { same++; continue; }
      let name = p.name;
      if (names.has(name)) { let k = 1; name = `${p.name} copy`; while (names.has(name)) name = `${p.name} copy ${++k}`; }
      names.add(name);
      const id = uid();
      store.set(LS_DOC + id, p.kind === 'page'
        ? { kind: 'page', name, page: p.page, sheet: p.sheet, mode: 'page' }
        : { kind: p.kind, name, blocks: p.blocks, active: 0, page: p.page, mode: p.kind === 'board' ? 'board' : 'document' });
      idx.push({ id, name, kind: p.kind, updated: Date.now(), created: Date.now() });
      have.set(projectJson({ ...p, name }), id);
      n[p.kind]++;
      if (!first) first = id;
    }
    store.set(LS_INDEX, idx);
    renderDocList();
    const parts = [n.page ? uiText('bundle.pages', '{n} Pages', { n: n.page }) : '', n.classic ? uiText('bundle.classic', '{n} Classic', { n: n.classic }) : '', n.board ? uiText('bundle.board', '{n} Whiteboard', { n: n.board }) : ''].filter(Boolean);
    const added = n.page + n.classic + n.board;
    const msg = (added ? (added === 1 ? uiText('bundle.added.one', 'Added 1 file: {parts}', { parts: parts.join(', ') }) : uiText('bundle.added.many', 'Added {n} files: {parts}', { n: added, parts: parts.join(', ') })) : uiText('bundle.none', 'No new files'))
      + (same ? uiText('bundle.same', '; {n} already here', { n: same }) : '') + (bad ? uiText('bundle.bad', '; {n} not readable', { n: bad }) : '');
    showHint(msg, 3000);
    return { ...n, same, bad, first };
  }
  async function pasteDoc() {
    let text = null;
    try { text = await navigator.clipboard.readText(); } catch { /* permission denied: use our own copy */ }
    try {
      if (text && /^\s*\{/.test(text) && openProjectText(text, null, true)) { showHint(uiText('hint.pastedNewFile', 'Pasted as a new file'), 1200); return; }
      if (docClip && openProjectText(docClip, null, true)) { showHint(uiText('hint.pastedNewFile', 'Pasted as a new file'), 1200); return; }
    } catch (err: any) { showHint(uiText('hint.couldNotPaste', 'Could not paste: {error}', { error: err.message }), 2000); return; }
    showHint(uiText('hint.nothingToPaste', 'Nothing to paste: copy a file first'), 1600);
  }
  // A menu of a few actions for another part of the app (Quick's sidebar list), drawn and placed like this one.
  function openMenu(entries: { label: string; act: string; ic?: IconName; danger?: boolean; dis?: boolean; sep?: boolean }[], x: number, y: number, pick: (act: string) => void) {
    placeCtx(entries.flatMap((e) => [e.sep && hr, item(e.label, 'menu:' + e.act, { ic: e.ic, danger: e.danger, dis: e.dis })]), x, y, { pick });
  }
  function openDocCtx(id: any, x: any, y: any) {
    const it = id && docEntry(id), page = state.doc.kind === 'page', d = (k: any) => 'doc:' + k, lf = id && TD.files.fileOf(id);
    let h: CtxRow[];
    if (it) {
      h = [id !== state.docId && item(captions["ui.open"], d('open'), { ic: 'open' }), hr,
        item(uiText('ctx.renameDots', 'Rename…'), d('rename'), { ic: 'rename' }),
        item(uiText('ctx.moveToFolder', 'Move to Folder…'), d('move'), { ic: 'folder' }),
        item(captions["ui.duplicate"], d('dup'), { ic: 'duplicate' }),
        item(uiText('ctx.saveCopy', 'Save a Copy…'), d('saveas'), { ic: 'duplicate' }),
        item(uiText('ctx.saveVersion', 'Save Version…'), d('saveversion'), { ic: 'history' }),
        item(uiText('ctx.recovery', 'Version History…'), d('recovery'), { ic: 'history' }), hr,
        item(captions["ui.copy"], d('copy'), { ic: 'copy' }),
        item(captions["ui.paste"], d('paste'), { ic: 'paste' }),
        item(uiText('ctx.copyShare', 'Copy Share Link'), d('share'), { ic: 'link' }), hr,
        ...(!TD.files.can ? [item(uiText('ctx.download', 'Download (.diagramtex)'), d('save'), { ic: 'download', key: id === state.docId ? 'Ctrl+Shift+S' : '' })]
          : [lf ? item(uiText('ctx.saveTo', 'Save to {file}', { file: lf.name }), d('save'), { ic: 'download', key: id === state.docId ? 'Ctrl+S' : '' })
            : item(uiText('ctx.saveToFile', 'Save to File…'), d('save'), { ic: 'download', key: id === state.docId ? 'Ctrl+Shift+S' : '' }),
            item(lf ? uiText('ctx.saveToAnother', 'Save to Another File…') : uiText('ctx.saveToNew', 'Save to New File…'), d('savenew'), { ic: 'saveAs' }),
            lf && item(uiText('ctx.unlink', 'Unlink {file}', { file: lf.name }), d('unlink'), { ic: 'unlink' })]),
        item(captions["ui.export"], '', { ic: 'export', sub: [
          item(uiText('ctx.latexDoc', 'LaTeX Document (.tex)'), d('latex'), { key: id === state.docId ? 'Ctrl+Shift+E' : '' }),
          !page && item(uiText('ctx.tikzCode', 'TikZ Code…'), d('tikz'), { key: id === state.docId ? 'Ctrl+E' : '' }),
          item(uiText('ctx.webPage', 'Web Page (.html)'), d('html')),
          item(uiText('ctx.image', 'Image (PNG, SVG, PDF)…'), d('image')), hr,
          item(uiText('ctx.print', 'Print or Save as PDF…'), d('print'), { key: id === state.docId ? 'Ctrl+P' : '' })] }), hr,
        item(uiText('ctx.moveToBin', 'Move to Recycle Bin'), d('del'), { ic: 'delete' })];
    } else {
      h = [item(page ? uiText('ctx.newPage', 'New Page') : uiText('ctx.newDocument', 'New Document'), d('new'), { ic: 'newFile' }),
        item(uiText('ctx.newFolder', 'New Folder…'), d('newfolder'), { ic: 'folder' }),
        item(uiText('ctx.openFile', 'Open File…'), d('openfile'), { ic: 'open', key: 'Ctrl+O' }), hr,
        item(captions["ui.paste"], d('paste'), { ic: 'paste' }), hr,
        item(uiText('ctx.exportAll', 'Export All Files…'), d('exportall'), { ic: 'download' }),
        item(uiText('ctx.bin', 'Recycle Bin…'), d('bin'), { ic: 'delete' })];
    }
    placeCtx(h, x, y, { doc: id || '' });
  }
  function openFolderCtx(path: any, x: any, y: any) {
    const d = (k: any) => 'doc:' + k, shut = folded.has(foldKey(path));
    placeCtx([item(state.doc.kind === 'page' ? uiText('ctx.newPageHere', 'New Page Here') : state.doc.kind === 'board' ? uiText('ctx.newBoardHere', 'New Whiteboard Here') : uiText('ctx.newDocHere', 'New Document Here'), d('newin'), { ic: 'newFile' }),
      item(uiText('ctx.newFolderInside', 'New Folder Inside…'), d('newfolderin'), { ic: 'folder' }), hr,
      item(uiText('ctx.renameFolder', 'Rename Folder…'), d('renamefolder'), { ic: 'rename' }),
      item(shut ? uiText('layers.unfold', 'Unfold') : uiText('layers.fold', 'Fold'), d('fold'), { ic: 'disclosure' }), hr,
      item(uiText('ctx.deleteFolder', 'Delete Folder'), d('delfolder'), { ic: 'delete', danger: true })], x, y, { folder: path });
  }
  // Rename in place: the row's name becomes a field. Enter or leaving keeps it, Esc cancels; the file stays closed.
  function renameDoc(id: any, name: any) {
    if (id === state.docId) { state.doc.name = name; $('#docName').value = name; TD.docview?.updateTitle(); saveNow(); return; }
    const d = store.get<Record<string, any> | null>(LS_DOC + id, null);
    if (d) store.set(LS_DOC + id, { ...d, name });
    const idx = index(), it: any = idx.find((x) => (x as any).id === id);
    if (it) { it.name = name; store.set(LS_INDEX, idx); }
  }
  function renameInList(id: any) {
    const li = id && $(`#docList li[data-doc="${id}"]`);
    if (!li || document.body.classList.contains('no-files')) { // sidebar hidden: rename the open file in the top bar
      if (id !== state.docId) openDoc(id);
      const n = $('#docName'); n.focus(); n.select(); return;
    }
    fileRenaming = 'd:' + id;
    renderDocList();
  }
  function docAction(a: any, id: any) {
    const it = id && docEntry(id);
    const openFirst = () => { if (id && id !== state.docId) openDoc(id); };
    switch (a) {
      case 'open': openFirst(); break;
      case 'new': newDoc(null, null, null, null, null, state.doc.kind); break;
      case 'newfolder': newFolder(''); break;
      case 'newin': newDoc(joinPath(ctxFor.folder, NEW_NAME[state.doc.kind]), null, null, null, null, state.doc.kind); break;
      case 'newfolderin': newFolder(ctxFor.folder!); break;
      case 'renamefolder': renameFolderInList(ctxFor.folder!); break;
      case 'delfolder': deleteFolder(ctxFor.folder!); break;
      case 'bin': openBin(); break;
      case 'recovery': openRecovery(id); break;
      case 'saveversion': void saveVersion(id); break;
      case 'fold': setFolded(ctxFor.folder!, !folded.has(foldKey(ctxFor.folder!))); break;
      case 'move': {
        if (!it) break;
        TD.prompt(uiText('dlg.moveToFolder.title', 'Move to Folder'), folderOf(it.name), { ok: uiText('dlg.moveToFolder.ok', 'Move'), placeholder: uiText('dlg.moveToFolder.placeholder', 'Folder, e.g. Physics/Labs (empty: top level)') }).then((f: any) => { if (f != null) moveToFolder(id, f); });
        break;
      }
      case 'share': shareLink(id); break;
      case 'openfile': openFile(); break;
      case 'rename': renameInList(id); break;
      case 'dup': { const src = docData(id); if (src) { const n = copyName(it.name); storeCopy(src, n, id); renderDocList(); showHint(uiText('hint.duplicatedAs', 'Duplicated as "{name}"', { name: n }), 1200); } break; }
      case 'saveas': {
        const src = docData(id); if (!src) break;
        TD.prompt(uiText('dlg.saveCopyAs.title', 'Save a Copy As'), copyName(it.name), { ok: caption(captions["ui.save"]) }).then((name: any) => {
          if (name != null && name.trim()) openDoc(storeCopy(src, name.trim(), id));
        });
        break;
      }
      case 'copy': {
        docClip = docJson(id);
        if (!docClip) break;
        navigator.clipboard.writeText(docClip).then(() => showHint(uiText('hint.copiedFile', 'Copied "{name}"', { name: it.name }), 1000), () => showHint(uiText('hint.copiedFileTab', 'Copied "{name}" (in this tab only)', { name: it.name }), 1400));
        break;
      }
      case 'paste': pasteDoc(); break;
      case 'exportall': exportAll(); break;
      case 'save': openFirst(); saveFile(); break;
      case 'savenew': openFirst(); saveFile(true); break;
      case 'unlink': { const f = TD.files.fileOf(id); TD.files.unlink(id).then(() => { diskWritten(id, diskEdit(id)); if (id === state.docId) showSaveState(); if (f) showHint(uiText('hint.unlinked', 'No longer linked to {file}', { file: f.name }), 1400); }); break; }
      case 'latex': case 'tikz': case 'html': case 'print': openFirst(); runCmd(a); break;
      case 'image': {
        openFirst();
        if (state.mode === 'document') { showHint(uiText('hint.imageNeedsDiagram', 'Image export works on a diagram: switch to Diagram view first'), 2000); break; }
        if (expOpts.fmt === 'html') expOpts.fmt = 'png'; // "Image…" opens on a picture format
        requestAnimationFrame(() => openExport($('#btnExport')));
        break;
      }
      case 'del': deleteDoc(id); break;
    }
  }
  $('#docList').addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (editing) finishEdit();
    pop.hidden = true;
    const fo = e.target.closest('[data-folder]');
    if (fo) { openFolderCtx(fo.dataset.folder, e.clientX, e.clientY); return; }
    const li = e.target.closest('[data-doc]');
    openDocCtx(li ? li.dataset.doc : null, e.clientX, e.clientY);
  });
  // the empty part of the sidebar's list area also offers New / Open / Paste
  $('#files')?.addEventListener('contextmenu', (e: any) => {
    if (e.target.closest('#docList, #quickList, input, textarea, button')) return;
    e.preventDefault();
    openDocCtx(null, e.clientX, e.clientY);
  });

  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (Date.now() - longPressed < 1000) return; // a long press already opened it (some browsers send this too)
    canvasMenu(e);
  });
  // the object menu at a point, for a right-click or a long press: what is there is selected first
  function canvasMenu(e: { clientX: number; clientY: number; target: any }) {
    if (drag || polyDraft) return;
    if (lineDraft) { lineCancel(); return; }
    if (editing) finishEdit();
    if (state.tool !== 'select') setTool('select');
    const guideHit = e.target.closest?.('[data-guide-id]');
    if (guideHit && guideMode === 'show') {
      selectedGuide = guideHit.dataset.guideId; state.sel.clear(); renderOverlay(); renderProps();
      placeCtx([item(uiText('assist.editGuide', 'Edit position'), 'guide:edit', { ic: 'edit' }), item(uiText('assist.deleteGuide', 'Delete guide'), 'guide:delete', { ic: 'delete', key: 'Del' }), hr,
        item(uiText('assist.deleteAllGuides', 'Delete all guides'), 'guide:deleteAll', { ic: 'delete', danger: true })], e.clientX, e.clientY, { guideId: selectedGuide! });
      return;
    }
    selectedGuide = null;

    const hitG = e.target.closest && e.target.closest('[data-id]');
    if (hitG && !state.sel.has(hitG.dataset.id)) { state.sel = new Set(groupIds(hitG.dataset.id)); renderOverlay(); renderProps(); }
    if (!hitG && state.sel.size && !e.target.closest('[data-handle]')) {
      // right-click inside the current selection's box keeps it; elsewhere clears it
      const p = toWorld(e), b = unionBox(selected());
      if (!(p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)) { state.sel.clear(); renderOverlay(); renderProps(); }
    }
    pop.hidden = true;
    openCtx(e.clientX, e.clientY, undefined, toWorld(e));
  }
  // what a row of the menu does (also TD.app.cmd.ctxAct, for the tests)
  function ctxAct(act: string) {
    const [a, arg] = act.split(':');
    if (a === 'guide') { if (arg === 'edit') void editGuide(ctxFor.guideId!); else removeGuide(ctxFor.guideId!, arg === 'deleteAll'); return; }
    if (a === 'doc') { docAction(arg, ctxFor.doc); return; }
    if (a === 'menu') { const pick = ctxFor.pick; ctxFor = {}; pick?.(arg); return; }
    if (a === 'edit') { const s = selected()[0]; if (!openBlock(s.id)) startEdit(s.id, s.type === 'text' ? 'text' : 'label'); }
    if (a === 'copy') copySel();
    if (a === 'copytikz') copyTikz();
    if (a === 'img') selImage(arg);
    if (a === 'copytext') {
      const t = selected().map((s: any) => (s.text || s.label || '').trim()).filter(Boolean).join('\n');
      navigator.clipboard.writeText(t).then(() => showHint(uiText('hint.textCopied', 'Text copied'), 1000), () => showHint(uiText('hint.noClipboard', 'Clipboard not available'), 1400));
    }
    if (a === 'cut') { copySel(); deleteSel(); }
    if (a === 'paste') paste(ctxFor.at);
    if (a === 'dup') duplicate();
    if (a === 'del') deleteSel();
    if (a === 'group') groupSel();
    if (a === 'cb') combineSel(arg);
    if (a === 'ungroup') ungroupSel();
    if (a === 'comp:make') makeComponent();
    if (a === 'a') arrange(arg);
    if (a === 'r') transformSel(arg);
    if (a === 'l') alignSel(arg);
    if (a === 'd') distributeSel(arg);
    if (a === 'all') { state.sel = new Set(shapes().map((s: any) => s.id)); renderOverlay(); renderProps(); }
    if (a === 'layer') layerAction(arg, ctxFor.layer || '');
    if (a === 'fit') zoomFit();
    if (a === 'fitw') zoomFitWidth();
    if (a === 'grid') toggleGrid();
  }

  function nudge(dx: any, dy: any) {
    if (!state.sel.size) return;
    begin();
    for (const s of selected()) TD.translate(s, dx, dy);
    detachFrom(selected(), state.sel);
    commit(); render(); renderGeom();
  }

  const isTyping = (t: any) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable);
  // Ctrl/⌘ + = − 0: 1 in, −1 out, 0 to 100%, or null. Read by key and by physical key, so layouts where = or −
  // need Shift, and the number pad, work too.
  const zoomKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
    const c = e.code;
    return e.key === '0' || c === 'Digit0' || c === 'Numpad0' ? 0
      : e.key === '=' || e.key === '+' || c === 'Equal' || c === 'NumpadAdd' ? 1
      : e.key === '-' || e.key === '_' || c === 'Minus' || c === 'NumpadSubtract' ? -1 : null;
  };
  // The browser's page zoom never takes these keys, wherever the focus is: block editors and Quick stop keys from
  // reaching the handlers below, but a listener on window in the capture phase runs first, whatever they do.
  // In an open block editor they zoom its canvas instead: in and out about the middle, through the editor's own
  // ⌘-wheel zoom (one step of −100·ln 1.25 is ×1.25 there, within the editor's own limits, carrying its pop-ups
  // along), and ⌘0 presses its Fit button.
  window.addEventListener('keydown', (e) => {
    const z = zoomKey(e);
    if (z === null) return;
    e.preventDefault();
    if (document.querySelector('.td-dialog')) return; // a question over the editor: leave the view alone
    const svg = [...document.querySelectorAll<SVGSVGElement>('.cz-svg')].find((s) => s.getClientRects().length);
    if (!svg) return;
    const ed = svg.closest('[id$="Modal"]') || svg.parentElement!;
    if (z === 0) { [...ed.querySelectorAll<HTMLElement>('button')].find((b) => Object.values(b.dataset).includes('fit'))?.click(); return; }
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaMode: 0, deltaY: (z > 0 ? -100 : 100) * Math.log(1.25), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }, true);
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'p' && !outputAllowed()) { e.preventDefault(); return; }
    // in Table, ⌘P prints the table (its Print button), not the page behind it
    if (mod && !e.altKey && e.key.toLowerCase() === 'p' && inTable()) { e.preventDefault(); ($('#tableview .tb-outbar [data-o="print"]') as HTMLButtonElement | null)?.click(); return; }
    // Ctrl/⌘ + = − 0 zoom the canvas (the Document view handles its own, in docview.ts)
    const z = zoomKey(e);
    if (inTool()) return; // Quick and Table handle their own keys (nothing to zoom there)
    // an open block editor handles its own keys (its ⌘C, ⌘V and zoom are its own), even those it lets through
    if (document.body.classList.contains('cz-open')) return;
    if (state.mode !== 'document') {
      if (z !== null) {
        if (!$('#modal').hidden || !imp.hidden) return; // a dialog is open: the page stays as it is
        if (z === 0) zoomTo(1); else { const r = stageSize(); zoomAt(z > 0 ? 1.25 : 0.8, r.w / 2, r.h / 2); }
        return;
      }
    }
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (!imp.hidden) { if (e.key === 'Escape') closeImport(); return; }
    if (e.key === 'Escape' && (flyoutOpen() || ctxOpen())) { hideFly(); closeCtx(); return; }
    if (mod && !e.altKey) {
      const k0 = e.key.toLowerCase();
      if (k0 === 'e') { e.preventDefault(); runCmd(e.shiftKey ? 'latex' : 'tikz'); return; }
      if (k0 === 's') {
        e.preventDefault();
        if (e.shiftKey || TD.files.fileOf(state.docId)) runCmd('save'); // a file linked to one on disk saves to it
        else {
          saveNow();
          // without the File System Access API there is no file to keep in step, so remind people to keep one
          const key = isMac ? '⇧⌘S' : 'Ctrl+Shift+S';
          if (!DS?.active) { showHint(uiText('hint.autosaveNone', 'This browser can’t autosave — {key} saves to a file', { key }), 3000); return; }
          const msg = uiText('hint.autosaved', 'Autosaved in this browser — {key} saves to a file', { key });
          if (TD.files.can) showHint(msg, 1500);
          else showHint(uiText('hint.autosaved.remind', '{msg}\nRemember to occasionally save to file to prevent accidental losses.', { msg }), 4000);
        }
        return;
      }
      if (k0 === 'o') { e.preventDefault(); runCmd('open'); return; }
      if (k0 === 'p') { e.preventDefault(); runCmd('print'); return; }
    }
    if (isTyping(e.target)) return;
    if (state.mode === 'document') {
      const k1 = e.key.toLowerCase();
      if (mod && !e.altKey && k1 === 'v') pasteSoon(); // a new diagram block
      else if (mod && !e.altKey && (k1 === 'z' || k1 === 'y')) { e.preventDefault(); undoDocument(k1 === 'z' && !e.shiftKey); }
      return;
    }

    const k = e.key.toLowerCase();
    if (mod) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'c') { copySel(); copyCode(); }
      else if (k === 'x') { if (state.sel.size) { copySel(); copyCode(); deleteSel(); } }
      else if (k === 'v') pasteSoon(); // the paste event below decides: TikZ code from elsewhere, or copied shapes
      else if (e.code === 'KeyK' && e.altKey) { e.preventDefault(); makeComponent(); }
      else if (k === 'd') { e.preventDefault(); duplicate(); }
      else if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); }
      else if (k === 'r') { e.preventDefault(); transformSel(e.shiftKey ? 'ccw' : 'cw'); }
      else if (e.code === 'BracketRight') { e.preventDefault(); arrange(e.shiftKey ? 'front' : 'forward'); }
      else if (e.code === 'BracketLeft') { e.preventDefault(); arrange(e.shiftKey ? 'back' : 'backward'); }
      else if (k === 'a') { e.preventDefault(); state.sel = new Set(shapes().map((s: any) => s.id)); renderOverlay(); renderProps(); }
      return;
    }
    if (e.key === ' ') { if (!spaceDown) { spaceDown = true; markTools(); } svg.classList.add('pan-ready'); e.preventDefault(); return; }
    if (state.mode === 'page' && (e.key === 'PageUp' || e.key === 'PageDown')) { e.preventDefault(); goToPage(currentPage() + (e.key === 'PageUp' ? -1 : 1)); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const vs = state.vertex && state.sel.size === 1 && byId(state.vertex.id);
      if (selectedGuide) removeGuide(selectedGuide);
      else if (vs && vs.curv && state.sel.has(vs.id)) polyRemove(vs, state.vertex!.i); // Photoshop's way: the point, not the path
      else deleteSel();
      return;
    }
    if (e.key === 'Enter') { if (polyDraft) finishPoly(); else if (state.sel.size === 1) { const s = selected()[0]; if (s.type === 'text' || (s.type === 'sym' && s.text !== undefined)) startEdit(s.id, 'text'); else if (TD.blocks.editable(s.type)) openBlock(s.id); else if (s.label !== undefined) startEdit(s.id, 'label'); else if (BOXED.has(s.type)) labelInside(s); } return; }
    if (e.key === 'Escape') {
      if (cancelDrag()) return;
      if (selectedGuide) { selectedGuide=null; guidePress=null; renderOverlay(); return; }
      if (polyDraft) finishPoly();
      else if (state.tool !== 'select') setTool('select');
      else { state.sel.clear(); renderOverlay(); renderProps(); }
      return;
    }
    const step = e.shiftKey ? TD.GRID : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); return; }
    if (k === 'g') { toggleGrid(); return; }
    if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
  });
  const spaceUp = () => { if (spaceDown) { spaceDown = false; markTools(); } svg.classList.remove('pan-ready'); };
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceUp(); });
  window.addEventListener('blur', spaceUp);

  // ---------------- appearance (sidebar) ----------------
  function syncThemeBox() {
    const cur = window.TDTheme ? TDTheme.get() : 'system';
    document.querySelectorAll('#themeBox [data-theme-pick]').forEach((b) => {
      b.classList.toggle('on', (b as HTMLElement).dataset.themePick === cur);
      b.setAttribute('aria-checked', String((b as HTMLElement).dataset.themePick === cur));
    });
  }
  $('#themeBox').addEventListener('click', (e: any) => {
    const b = e.target.closest('[data-theme-pick]');
    if (!b || !window.TDTheme) return;
    let pick = b.dataset.themePick;
    if (matchMedia('(max-width: 1100px)').matches && pick === TDTheme.get()) { // compact: one icon that cycles
      const order = ['system', 'light', 'dark'];
      pick = order[(order.indexOf(pick) + 1) % order.length];
    }
    TDTheme.set(pick); syncThemeBox();
  });
  syncThemeBox();

  // ---------------- top bar ----------------
  // Toggle state for assistive tech: a button's .on / .active class is mirrored to aria-pressed.
  {
    // a segment of a one-of switch (the kit's Segmented: role=radio) says aria-checked instead
    const sync = (b: any) => b.setAttribute(b.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', b.classList.contains('on') || b.classList.contains('active'));
    const sel = 'button.toggle, button[data-tool], button[data-fly]';
    const mo = new MutationObserver((ms) => ms.forEach((m) => (m.target as Element).matches(sel) && sync(m.target)));
    ['#topbar', '#tools'].forEach((root) => {
      document.querySelectorAll(`${root} ${sel}`).forEach(sync);
      mo.observe($(root), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  }
  // "Diagram 2 of 3" and its arrows; the Document view calls it after each change to the page (a diagram added,
  // moved or deleted), as well as everything that updates the top bar
  function updateBlockNav() {
    const diagrams = state.doc.blocks.map((b: any, i: any) => [b, i]).filter(([b]: any) => b.type === 'diagram');
    const bs = $('#blockSel'), nav = $('#blockNav');
    // Classic views share the same diagram picker and toolbar position.
    nav.hidden = bs.hidden = (state.mode !== 'diagram' && state.mode !== 'document') || !diagrams.length;
    nav.style.visibility = '';
    const activeDiagram = diagrams.find(([b, i]: any) => i === state.doc.active);
    const activeIndex = diagrams.findIndex(([, i]: any) => i === state.doc.active);
    bs.textContent = activeDiagram?.[0].name?.trim() || uiText('top.blockSel', 'Diagram {n} of {total}', { n: activeIndex + 1, total: diagrams.length });
    // its name is now the diagram's (what it shows); the tip, which named it while it was empty, describes it
    if (bs.dataset.tipLabel) { bs.removeAttribute('aria-label'); delete bs.dataset.tipLabel; bs.setAttribute('aria-description', bs.dataset.tip); }
    $('#blockPrev').disabled = activeIndex <= 0;
    $('#blockNext').disabled = activeIndex < 0 || activeIndex >= diagrams.length - 1;
  }
  function updateTopbar() {
    updateBlockNav();
    const board = state.mode === 'board';
    // what the Export panel offers in this view (expFmts)
    $('#btnExport').title = state.mode === 'document' ? uiText('top.export.document', 'Export the document as a PDF or a web page') : state.mode === 'page' ? uiText('top.export.page', 'Export the page as PNG (choose DPI), SVG, PDF or a web page') : board ? uiText('top.export.board', 'Export this whiteboard as PNG (choose DPI), SVG, PDF or a web page') : uiText('top.export.diagram', 'Export this diagram as PNG (choose DPI), SVG, PDF or a web page');
    $('#btnTikz').title = state.mode === 'page' ? uiText('top.tikz.page', 'LaTeX for this page, to copy or download (Ctrl+E)') : board ? uiText('top.tikz.board', 'LaTeX code for this whiteboard or the whole document, to copy or download (Ctrl+E)') : caption(captions["ui.latex.code.for.this.diagram.or.the.whole.document.to.copy.or.download.ctrl.e"]);
    undoButtons();
    updateSnapButton();
    $('#stage').classList.toggle('hide-grid', !state.grid);
    updateGridSelection();
    updateGuidesButton();
    updateStatus();
  }
  function toggleGrid() { state.grid = !state.grid; savePrefs(); updateTopbar(); }
  // In Document view the buttons work on the page's own steps (src/application/doc-history.ts).
  function undoButtons() {
    const doc = state.mode === 'document';
    $('#btnUndo').disabled = !(doc ? TD.docview?.canUndo() : state.undo.length) && !canUndoFile();
    $('#btnRedo').disabled = !(doc ? TD.docview?.canRedo() : state.redo.length) && !canRedoFile();
  }
  $('#btnUndo').onclick = () => (state.mode === 'document' ? undoDocument(true) : undo());
  $('#btnRedo').onclick = () => (state.mode === 'document' ? undoDocument(false) : redo());
  function chooseGridStyle(style: any, toggle = false) {
    if (!GRID_STYLES.includes(style)) return;
    state.grid = !(toggle && state.grid && state.gridStyle === style); state.gridStyle = style;
    savePrefs(); updateGridPattern(); updateTopbar();
  }
  $('#gridStyle').onclick = (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-grid-style]');
    if (button) chooseGridStyle(button.dataset.gridStyle, true);
  };
  $('#gridStyle').addEventListener('keydown', (e: KeyboardEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-grid-style]');
    if (button && (e.key === ' ' || e.key === 'Enter')) { e.stopPropagation(); return; }
    if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const index = GRID_STYLES.indexOf(button.dataset.gridStyle as any), delta = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? GRID_STYLES.length - 1 : (index + delta + GRID_STYLES.length) % GRID_STYLES.length;
    chooseGridStyle(GRID_STYLES[next]);
    $('#gridStyle').querySelector(`[data-grid-style="${GRID_STYLES[next]}"]`)?.focus();
  });
  $('#btnSnap').onclick = cycleSnapMode;
  $('#zoomIn').onclick = () => { const r = stageSize(); zoomAt(1.25, r.w / 2, r.h / 2); };
  $('#zoomOut').onclick = () => { const r = stageSize(); zoomAt(0.8, r.w / 2, r.h / 2); };
  const zoomTo = (z: any) => { const r = stageSize(); zoomAt(z / state.view.zoom, r.w / 2, r.h / 2); };
  $('#zoomReset').onclick = () => zoomTo(1);
  { // the percentage is a field: click, type a number, Enter (or leave the field) applies, Esc reverts
    const zv = $('#zoomVal');
    const shown = () => Math.round(state.view.zoom * 100) + '%';
    zv.addEventListener('focus', () => selectOnFocus(zv));
    zv.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter') { e.preventDefault(); zv.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zv.value = shown(); zv.blur(); }
    });
    zv.addEventListener('change', () => {
      const n = parseFloat(zv.value.replace(/[%\s]/g, '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) zoomTo(n / 100);
      zv.value = shown(); // also shows the clamped value (10–800%) or reverts junk
    });
    zv.addEventListener('blur', () => { zv.value = shown(); });
  }
  // A field focused by a click selects all of its text, so what is typed replaces it: at once, and again a frame later
  // (the click's mouseup can put a caret back), but only while it still has focus: select() on a field already left
  // (Enter, typed quickly) would focus it again, and the next shortcut would be typed into it.
  function selectOnFocus(f: HTMLInputElement) {
    f.select();
    // the mouseup of the click that focused it would put a caret in (WebKit): not that one
    const keep = (e: Event) => e.preventDefault();
    f.addEventListener('mouseup', keep, { once: true });
    setTimeout(() => f.removeEventListener('mouseup', keep), 500); // focused from the keyboard: no click to come
    const was = f.value; // and not once typing has begun: it would select what was just typed
    requestAnimationFrame(() => { if (document.activeElement === f && f.value === was) f.select(); });
  }
  { // grid spacing: a field like the zoom percentage (Enter or leaving applies, Esc reverts)
    const gv = $('#gridVal');
    gv.addEventListener('focus', () => selectOnFocus(gv));
    gv.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter') { e.preventDefault(); gv.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); gv.value = fmtGrid(); gv.blur(); }
    });
    gv.addEventListener('change', () => {
      const n = parseFloat(gv.value.replace(/cm|\s/g, '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) { state.gridCm = Math.min(5, Math.max(0.05, n)); applyGrid(); savePrefs(); render(); }
      gv.value = fmtGrid();
    });
    gv.addEventListener('blur', () => { gv.value = fmtGrid(); });
  }
  $('#zoomFit').onclick = () => zoomFit();
  $('#zoomFitW').onclick = zoomFitWidth;
  document.querySelectorAll('#tools button[data-tool]').forEach((b) => ((b as HTMLElement).onclick = () => setTool((b as HTMLElement).dataset.tool)));

  $('#docName').addEventListener('input', (e: any) => { state.doc.name = e.target.value || 'Untitled'; TD.docview?.updateTitle(); scheduleSave(); });
  $('#docName').addEventListener('keydown', (e: any) => { if (e.key === 'Enter') e.target.blur(); });
  $('#btnNewDoc').onclick = () => newDoc(null, null, null, null, null, state.doc.kind);
  $('#binRow').onclick = openBin;
  // Drag a file onto a folder to move it there, or onto the list's empty part to take it out of its folder.
  {
    const ul = $('#docList');
    let dragId: any = null, dragFolder: any = null;
    // a file row: the drop goes before it (upper half) or after it (lower half)
    const rowAt = (e: any) => {
      if (fileSort.by !== 'custom') return null;
      const li = e.target.closest('[data-doc]');
      if (!li || li.dataset.doc === dragId) return null;
      const r = li.getBoundingClientRect();
      return { li, after: e.clientY > r.top + r.height / 2 };
    };
    const target = (e: any) => e.target.closest('[data-folder]') || (e.target === ul ? ul : null);
    const clear = () => [ul, ...ul.querySelectorAll('.drop-into,.drop-before,.drop-after')].forEach((el: any) => el.classList.remove('drop-into', 'drop-before', 'drop-after'));
    // a folder can go into another folder (not into itself), or to the top level
    const folderOk = (t: any) => {
      if (!dragFolder) return true;
      const to = t === ul ? '' : t.dataset.folder;
      return to !== dragFolder && !to.startsWith(dragFolder + '/') && folderOf(dragFolder) !== to;
    };
    ul.addEventListener('dragstart', (e: any) => {
      const fo = e.target.closest('[data-folder]');
      if (fo) {
        if (fo.classList.contains('renaming')) { e.preventDefault(); return; }
        dragFolder = fo.dataset.folder;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', leafOf(dragFolder));
        return;
      }
      const li = e.target.closest('[data-doc]');
      if (!li || li.classList.contains('renaming')) { e.preventDefault(); return; }
      dragId = li.dataset.doc;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', leafOf(docEntry(dragId)?.name || ''));
    });
    ul.addEventListener('dragover', (e: any) => {
      if (!dragId && !dragFolder) return;
      if (dragFolder) {
        const ft = target(e);
        clear();
        if (!ft || !folderOk(ft)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        ft.classList.add('drop-into');
        return;
      }
      const t = target(e), row = t ? null : rowAt(e);
      clear();
      if (row) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.li.classList.add(row.after ? 'drop-after' : 'drop-before'); return; }
      if (!t) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      t.classList.add('drop-into');
    });
    ul.addEventListener('dragleave', (e: any) => { if (!ul.contains(e.relatedTarget)) clear(); });
    ul.addEventListener('drop', (e: any) => {
      if (dragFolder) {
        const ft = target(e), f = dragFolder;
        clear(); dragFolder = null;
        if (!ft || !f) return;
        const to = ft === ul ? '' : ft.dataset.folder;
        if (to === f || to.startsWith(f + '/') || folderOf(f) === to) return;
        e.preventDefault();
        renameFolder(f, joinPath(to, leafOf(f)));
        return;
      }
      const t = target(e), row = t ? null : rowAt(e), id = dragId;
      clear(); dragId = null;
      if (row && id) {
        e.preventDefault();
        const tid = row.li.dataset.doc, tgt: any = docEntry(tid);
        if (tgt && folderOf((docEntry(id) as any)?.name || '') !== folderOf(tgt.name)) moveToFolder(id, folderOf(tgt.name));
        const idx: any[] = index(), from = idx.findIndex((d) => d.id === id);
        if (from < 0) return;
        const [it] = idx.splice(from, 1);
        const to = idx.findIndex((d) => d.id === tid);
        idx.splice(to + (row.after ? 1 : 0), 0, it);
        store.set(LS_INDEX, idx);
        renderDocList();
        return;
      }
      if (!t || !id) return;
      e.preventDefault();
      moveToFolder(id, t === ul ? '' : t.dataset.folder);
    });
    ul.addEventListener('dragend', () => { clear(); dragId = null; dragFolder = null; });
  }

  // The sort menu on the file list's header: opens on hover or a click; a choice closes it. A click on the button
  // keeps a hover-opened menu open (it no longer closes when the pointer leaves); a second click closes it.
  {
    const btn = $('#btnSortDocs');
    const BY: [SortBy, any, any, string][] = [
      ['custom', captions["ui.custom.order"], captions["ui.your.own.order.drag.files.to.rearrange.them"], '<path d="M4 6h12M4 10h12M4 14h12"/>'],
      ['created', captions["ui.date.created"], captions["ui.when.each.file.was.made"], '<path d="M3.5 5.5h13v11h-13zM3.5 8.5h13M7 3.5v3M13 3.5v3"/>'],
      ['modified', captions["ui.date.modified"], captions["ui.when.each.file.was.last.changed"], '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>'],
      ['name', captions["ui.name"], captions["ui.by.file.name.numbers.in.number.order"], '<path d="M3.5 14.5l3-9 3 9M4.5 11.5h4M11.5 5.5h5l-5 9h5"/>'],
    ];
    const dirLabel = (by: SortBy, d: 'asc' | 'desc') => caption(by === 'name' ? (d === 'asc' ? captions["ui.a.to.z"] : captions["ui.z.to.a"])
      : by === 'custom' ? (d === 'asc' ? captions["ui.ascending"] : captions["ui.descending"]) : (d === 'asc' ? captions["ui.oldest.first"] : captions["ui.newest.first"]));
    const sortTitle = () => fileSort.by === 'custom' ? uiText('files.sortTitle.custom', 'Sort: custom order (drag to rearrange)')
      : uiText('files.sortTitle', 'Sort: {by}, {dir}', { by: caption(BY.find((b) => b[0] === fileSort.by)![1]).toLowerCase(), dir: dirLabel(fileSort.by, fileSort.dir).toLowerCase() });
    const fill = () => { btn.title = sortTitle(); btn.classList.toggle('on', fileSort.by !== 'custom'); };
    let timer = 0, pinned = false, open = false;
    function hide() { clearTimeout(timer); if (open) closeContextMenu(); }
    const later = () => { clearTimeout(timer); if (!pinned) timer = setTimeout(hide, HOVER_CLOSE) as any; };
    function show(focus = false) {
      clearTimeout(timer);
      if (open) return;
      TD.tooltip && TD.tooltip.hide();
      const { by, dir } = fileSort, custom = by === 'custom';
      const way = (d: 'asc' | 'desc', svg: string): MenuItemSpec => ({ act: 'dir:' + d, label: dirLabel(by, d), svg, checked: !custom && dir === d, disabled: custom,
        title: caption(custom ? captions["ui.custom.order.has.no.direction"] : d === 'asc' ? captions["ui.ascending"] : captions["ui.descending"]) });
      const menu = openContextMenu([
        ...BY.map(([b, label, hint, icon]): MenuItemSpec => ({ act: 'sort:' + b, label: caption(label), title: caption(hint), svg: icon, checked: b === by })), '-',
        way('asc', '<path d="M10 15.5v-11M6 8.5l4-4 4 4"/>'), way('desc', '<path d="M10 4.5v11M6 11.5l4 4 4-4"/>'),
      ], 0, 0, (act) => {
        const [k, v] = act.split(':');
        fileSort = k === 'sort' ? { ...fileSort, by: v as SortBy } : { ...fileSort, dir: v as 'asc' | 'desc' };
        store.set(LS_SORT, fileSort);
        fill();
        renderDocList();
      }, { id: 'sortMenu', class: 'sort-menu', below: btn.getBoundingClientRect(), align: 'end', owner: btn, focus, minWidth: 200, label: caption(captions["ui.sort.files"]),
        onclose: () => { clearTimeout(timer); open = false; pinned = false; btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
      open = true;
      btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      menu?.addEventListener('pointerenter', () => clearTimeout(timer));
      menu?.addEventListener('pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse' && !btn.contains(e.relatedTarget as Node)) later(); });
    }
    btn.addEventListener('pointerenter', (e: any) => { if (e.pointerType !== 'mouse') return; clearTimeout(timer); if (!open) timer = setTimeout(show, HOVER_OPEN) as any; });
    btn.addEventListener('pointerleave', (e: any) => { if (e.pointerType === 'mouse' && !document.getElementById('sortMenu')?.contains(e.relatedTarget)) later(); });
    // a click keeps a hover-opened menu open (it no longer closes when the pointer leaves); a second click closes it
    btn.addEventListener('click', () => { if (!open || !pinned) { show(true); pinned = true; } else hide(); });
    onLocale(() => { hide(); fill(); }); // runs now, too
  }

  // a file name from the file's: letters and digits of any script (Thai keeps its vowel and tone marks), others as _
  const cleanName = (n: string) => String(n || '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '');
  const slug = () => cleanName(leafOf(state.doc.name)) || 'diagram';
  // one diagram of a Classic file (Diagram view): named after the diagram's own name, or numbered when there are several
  const picSlug = () => {
    if (state.doc.kind !== 'classic' || state.mode === 'document') return slug();
    const ds = state.doc.blocks.filter((b: any) => b.type === 'diagram'), b = state.doc.blocks[state.doc.active], n = ds.indexOf(b) + 1;
    const own = cleanName(b?.name?.trim() || '');
    return own ? `${slug()}-${own}` : ds.length > 1 && n > 0 ? `${slug()}-diagram-${n}` : slug();
  };
  function download(name: any, text: any, type: any) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // Project files are .diagramtex (JSON inside; the kind is recorded in the file). Older versions saved
  // .json, .page.json and .board.json, which still open.
  const FILE_EXT = '.diagramtex', FILE_TYPE = 'application/vnd.diagramtex+json';
  const fileName = () => slug() + FILE_EXT;
  // Save to a file on disk. Where the browser allows it, the file is picked once and later saves write to
  // it directly (`pick` picks a new one); elsewhere each save downloads a copy.
  async function saveFile(pick?: any) {
    finishEdit(); finishPoly(); commit();
    if (state.docId) saveNow();
    const id = state.docId, text = projectJson(state.doc), edit = diskEdit(id);
    if (!TD.files.can) { download(fileName(), text, FILE_TYPE); return; }
    try {
      const name = await TD.files.saveDoc(id, text, fileName(), pick, (disk: string) => diskConflict(id, disk));
      if (name) diskWritten(id, edit);
      if (name) showHint(uiText('hint.savedTo', 'Saved to {file}', { file: name }), 1200);
    } catch (e: any) {
      showHint(uiText('hint.saveFailed', "Couldn't save the file ({error}). Downloaded a copy instead.", { error: e.message }), 3500);
      download(fileName(), text, FILE_TYPE);
    }
    if (id === state.docId) showSaveState();
  }
  const { validShapes, dropRetired, dropRetiredDoc } = TD.projectFiles;
  const retiredHint = (n: any) => n && showHint(n > 1 ? uiText('hint.retired.many', 'Removed {n} 3D sketches: no longer supported. Use 3D Geometry instead.', { n }) : uiText('hint.retired.one', 'Removed 1 3D sketch: no longer supported. Use 3D Geometry instead.'), 5000);
  const baseName = (n: any) => n.replace(/(\.diagramtex|(\.page|\.board)?\.json)$/i, '');
  // Open a file from disk: a project file opens as a file of the app (linked to the file on disk when the
  // browser hands over a handle), anything else goes to the LaTeX import.
  async function openText(text: any, name: any, handle: any) {
    if (!/\.(diagramtex|json)$/i.test(name) && !/^\s*\{/.test(text)) { openImport(text, name.replace(/\.[a-z0-9]+$/i, '')); return; }
    try {
      let bd = null;
      try { bd = JSON.parse(text); } catch { bd = null; }
      if (isBundle(bd)) { importBundle(bd); return true; }
      const known = handle && (await TD.files.docFor(handle, index().map((x) => (x as any).id)));
      if (known) { await reopenLinked(known, text, name); return true; }
      if (!openProjectText(text, baseName(name), true)) throw new Error('not valid JSON'); // a second file never takes an existing name
      // an older .json file is not linked: its first save makes a .diagramtex beside it
      if (handle && name.toLowerCase().endsWith(FILE_EXT)) { const id = state.docId; await TD.files.link(id, handle, projectJson(state.doc), text); diskWritten(id); }
      return true;
    } catch (err: any) {
      // what went wrong, not only that it did
      const why = err.code === 'newer' ? uiText('dlg.openFailed.newer', 'It was saved by a newer version of DiagramTeX (file version {version}). Reload the app to get the latest version, then open it again.', { version: err.version })
        : err.code === 'unknown' ? uiText('dlg.openFailed.unknown', "It holds objects this version of DiagramTeX doesn't know: {types}. If it comes from a newer version, reload the app to get the latest one, then open it again.", { types: err.types.join(', ') })
        : uiText('dlg.openFailed.invalid', "It isn't a DiagramTeX file, or it is damaged: its contents aren't a drawing DiagramTeX can read.");
      await TD.alert(uiText('dlg.openFailed.title', 'Couldn\'t open "{name}"', { name }), why); return false;
    }
  }
  // A file already linked to one of the app's files: open that one, and take the file's contents if it
  // changed on disk since it was last saved or opened.
  async function reopenLinked(id: any, text: any, name: any) {
    const fresh = !TD.files.isOnDisk(id, text);
    diskLook.busy = true; // this reads the file itself
    try {
      if (id !== state.docId) openDoc(id);
      if (!fresh) { showHint(uiText('hint.isOpen', '"{name}" is open', { name }), 1200); return; }
      if (diskDirty.has(id) &&
        !(await TD.confirm(uiText('dlg.changedOnDisk.title', '"{name}" changed on disk', { name }), uiText('dlg.changedOnDisk.body', 'This file also has changes that are not saved to it. Replace them with the version on disk?'), { ok: uiText('dlg.changedOnDisk.ok', 'Use the Version on Disk') }))) return;
      await takeDisk(id, text, name);
    } finally { diskLook.busy = false; }
  }
  // The file's version on disk (its text) comes into the app's file `id`; what the app held is kept in its version
  // history (replaceDoc), and the file counts as saved.
  async function takeDisk(id: any, text: any, name: any) {
    const p = parseProject(text, baseName(name));
    if (!p) throw new Error('not valid JSON');
    replaceDoc(id, p);
    await TD.files.link(id, TD.files.fileOf(id).handle, projectJson(state.doc), text);
    diskWritten(id);
    showHint(uiText('hint.reloaded', 'Reloaded "{name}" from disk', { name }), 1400);
  }
  // ⌘S found the file changed on disk since it was last saved or opened here. Save over it (its version on disk
  // kept as a saved version first), or open its version (this browser's kept in version history): nothing is lost.
  async function diskConflict(id: any, disk: string): Promise<'overwrite' | 'cancel'> {
    const file = TD.files.fileOf(id)?.name || fileName();
    const a = await TD.ask(uiText('dlg.diskConflict.title', '"{file}" changed on disk', { file }),
      uiText('dlg.diskConflict.body', 'Something else saved it after it was last saved here. Save over it, or open the version on disk? The one replaced is kept in this file’s version history.'),
      { ok: uiText('dlg.diskConflict.over', 'Save Over It'), alt: uiText('dlg.diskConflict.open', 'Open Disk Version') });
    if (a === 'ok') {
      const p = parseProject(disk, baseName(file));
      if (p) recovery.save(id, storedOf(p, store.get<Record<string, any> | null>(LS_DOC + id, null) || {}), Date.now(), uiText('rec.diskVersion', 'On disk before saving over it'));
      return 'overwrite';
    }
    if (a === 'alt') { diskLook.busy = true; try { await takeDisk(id, disk, file); } finally { diskLook.busy = false; } }
    return 'cancel';
  }
  async function openFile() {
    if (!TD.files.can) { $('#fileInput').click(); return; }
    try {
      const f = await TD.files.pickOpen();
      if (f) await openText(await f.file.text(), f.file.name, f.handle);
    } catch (e: any) { showHint(uiText('hint.couldntOpenTheFile', "Couldn't open the file ({error})", { error: e.message }), 2500); }
  }
  $('#fileInput').onchange = async (e: any) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) openText(await file.text(), file.name, null);
  };
  // Files opened with the installed app (double-click, or Open With in the system's file manager).
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (p: any) => {
      await TD.ready; await TD.files.ready;
      for (const h of p.files || []) if (h.kind === 'file') { const f = await h.getFile(); await openText(await f.text(), f.name, h); }
    });
  }

  // Render shapes, then prepend the gradient/pattern <defs> they referenced.
  function fillDefsAround(fn: any) { TD.takeFillDefs(); const body = fn(); return TD.takeFillDefs() + body; }
  // SVG string for a list of shapes (used for SVG export and the document view)
  function shapesSvg(list: any, pad = 8, standalone = true, preview = false): string {
    if (!preview && !TD.math.finalizing) return TD.math.synchronous(() => shapesSvg(list, pad, standalone));
    if (preview && !TD.math.previewing) return TD.math.preview(() => shapesSvg(list, pad, standalone, true));
    list = list.filter((s: any) => !s.hidden); // a hidden layer is not exported
    if (!list.length) return '';
    const ctx = { zoom: 1, hit: 0, export: true, scene: list };
    const b = TD.bboxOf(list.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), pad);
    if (preview) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(b.x)} ${r2(b.y)} ${r2(b.w)} ${r2(b.h)}" width="${r2(b.w)}" height="${r2(b.h)}">` +
      fillDefsAround(() => list.map((s: any) => TYPES[s.type].svg(s, ctx)).join('')) + '</svg>';
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    host.setAttribute('viewBox', `${r2(b.x)} ${r2(b.y)} ${r2(b.w)} ${r2(b.h)}`);
    host.setAttribute('width', r2(b.w)); host.setAttribute('height', r2(b.h));
    host.innerHTML = (standalone ? TD.math.exportStyle() : '') +
      fillDefsAround(() => list.map((s: any) => TYPES[s.type].svg(s, ctx)).join(''));
    return new XMLSerializer().serializeToString(host);
  }
  // a downloaded SVG carries the maths fonts embedded (from vendor/), so opening it requests nothing
  async function svgWithFonts(svg: any) {
    let fonts = '';
    try { fonts = await TD.inlineMathCss(); } catch (e: any) { fonts = ''; }
    return fonts ? svg.replace(/(<svg\b[^>]*>)/, (m: any) => m + xmlStyle(fonts)) : svg;
  }
  const exportSvg = async () => { if (shapes().length) out(picSlug() + '.svg', await svgWithFonts(shapesSvg(shapes())), 'image/svg+xml'); };

  // ---------------- top-bar commands & insert popover ----------------
  const pop = $('#insertPop');
  $('#topbar').addEventListener('click', (e: any) => {
    const c = e.target.closest('[data-cmd]')?.dataset.cmd;
    if (c) runCmd(c);
  });
  function runCmd(c: any) {
    if (['print', 'export', 'svg', 'html', 'latex', 'tikz'].includes(c) && !outputAllowed()) return;
    if (c === 'guides') { guideMode = guideMode === 'show' ? 'locked' : guideMode === 'locked' ? 'off' : 'show'; selectedGuide = null; guidePress = null; savePrefs(); updateGuidesButton(); drawRulers(); renderOverlay(); }
    if (c === 'new') newDoc(null, null, null, null, null, state.doc.kind);
    if (c === 'open') openFile();
    if (c === 'save') saveFile();
    if (c === 'saveas') saveFile(true);
    if (c === 'tikz') openTikz();
    if (c === 'latex') { const r = TD.texImages.collect(() => (state.mode === 'page' ? TD.pageToLatex(state.doc) : TD.docToLatex(state.doc))); if (!restorable(r.result)) showHint(noRestore(), 6000); downloadLatex(r.result, r.files); } // a failed export's hint replaces the warning
    if (c === 'svg') { if (state.mode === 'page') exportPageSvg(); else if (shapes().length) exportSvg(); else showHint(uiText('hint.diagramEmpty', 'This diagram is empty'), 1200); }
    if (c === 'import') openImport('');
    if (c === 'print') printDoc();
    if (c === 'html') exportHtml();
    if (c === 'export') openExport($('#btnExport'));
  }
  // One self-contained web page (fonts and pictures embedded) of the whole file.
  async function exportHtml() {
    if (!outputAllowed()) return;
    finishEdit();
    if (!outputAllowed()) return;
    let body;
    if (state.doc.kind === 'page') {
      const G = pageGeom(), [defs, sh] = pageSvgs();
      body = `<div class="sheet-pages">${Array.from<any, any>({ length: G.n }, (_, k) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${r2(pageTop(k, G))} ${r2(G.w)} ${r2(G.h)}" style="width:${G.W}cm;max-width:100%;height:auto;display:block;margin:0 auto 24px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.06)">${defs}${sh}</svg>`).join('')}</div>`;
    }
    await askDir();
    showHint(uiText('hint.buildingHtml', 'Building HTML…'), 800);
    try {
      await out(slug() + '.html', await TD.docToHtml(body), 'text/html');
      if (TD.mathFontsLinked) showHint(uiText('hint.htmlFontsOnline', 'Saved. Maths fonts could not be embedded, so the file loads them online.'), 3200);
    }
    catch (e: any) { showHint(uiText('hint.htmlFailed', 'Could not build the HTML file: {error}', { error: e.message }), 2500); }
  }
  // Quick: a formula box on its own, over whatever file is open. Picking a file kind leaves it.
  const QUICK_KEY = 'diagramtex.quick', TABLE_KEY = 'diagramtex.tablemode';
  const inQuick = () => document.body.classList.contains('mode-quick');
  // Table (src/ui/services/table.ts): a table to import, format and export, over whatever file is open, like Quick
  const inTable = () => document.body.classList.contains('mode-table');
  /** Quick or Table: a tool on its own, the file's canvas and document hidden */
  const inTool = () => inQuick() || inTable();
  function leaveFile() { magnifier.hide(); finishEdit(); finishPoly(); commit(); if (state.docId) saveNow(); hideFly(); closeCtx(); closeExport(); }
  function setTable(on: any) {
    if (on === inTable()) return;
    if (on) { setQuick(false); leaveFile(); }
    TD.math.cancelPending();
    document.body.classList.toggle('mode-table', on);
    try { on ? localStorage.setItem(TABLE_KEY, '1') : localStorage.removeItem(TABLE_KEY); } catch (e: any) { /* storage blocked */ }
    if (on) {
      document.querySelectorAll('#kindSeg [data-mode], #kindSeg [data-kind]').forEach((b) => b.classList.remove('on'));
      $('#kindSeg [data-table]').classList.add('on');
      TD.tableWs.show();
      renderProps();
    } else {
      $('#kindSeg [data-table]').classList.remove('on');
      TD.tableWs.hide();
      applyMode(state.mode, false);
      renderProps();
    }
  }
  function setQuick(on: any) {
    if (on === inQuick()) return;
    if (on) { magnifier.hide(); setTable(false); finishEdit(); finishPoly(); commit(); if (state.docId) saveNow(); }
    TD.math.cancelPending();
    document.body.classList.toggle('mode-quick', on);
    try { on ? localStorage.setItem(QUICK_KEY, '1') : localStorage.removeItem(QUICK_KEY); } catch (e: any) { /* storage blocked */ }
    if (on) {
      hideFly(); closeCtx(); closeExport();
      document.querySelectorAll('#kindSeg [data-mode], #kindSeg [data-kind]').forEach((b) => b.classList.remove('on'));
      $('#kindSeg [data-quick]').classList.add('on');
      TD.quick.show();
    } else {
      $('#kindSeg [data-quick]').classList.remove('on');
      TD.quick.hide();
      applyMode(state.mode, false); // the canvas was hidden: lay it out and draw it again
    }
  }
  $('#kindSeg [data-quick]').onclick = () => setQuick(true);
  $('#kindSeg [data-table]').onclick = () => setTable(true);
  // upcoming features (.soon) are shown greyed out; a click on one does nothing
  document.addEventListener('click', (e) => { if ((e.target! as Element).closest && (e.target! as Element).closest('.soon')) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.querySelectorAll('[data-mode]').forEach((b) => ((b as HTMLElement).onclick = () => { setQuick(false); setTable(false); setMode((b as HTMLElement).dataset.mode); }));
  // Classic reopens the last Classic file in the view it was left in (Diagram or Document).
  document.querySelectorAll('[data-kind]').forEach((b) => ((b as HTMLElement).onclick = () => { setQuick(false); setTable(false); if (state.doc.kind !== (b as HTMLElement).dataset.kind) { finishEdit(); finishPoly(); commit(); switchKind((b as HTMLElement).dataset.kind); } }));
  for (const [id, step] of [['#blockPrev', -1], ['#blockNext', 1]] as const) $(id).onclick = () => {
    const indices = state.doc.blocks.flatMap((b: any, i: number) => b.type === 'diagram' ? [i] : []);
    const next = indices[indices.indexOf(state.doc.active) + step];
    if (next != null) setActiveBlock(next);
  };
  $('#blockRename').onclick = async () => {
    const doc = state.doc, block = doc.blocks[doc.active];
    if (doc.kind !== 'classic' || block?.type !== 'diagram') return;
    const name = await TD.prompt(uiText('ui.renameDiagram', 'Rename diagram'), block.name || '', {
      ok: caption(captions["ui.save"]), placeholder: uiText('diagram.name.placeholder', 'Diagram name (empty for automatic numbering)'),
    });
    if (name === null || state.doc !== doc || home() !== block) return;
    begin();
    const value = name.trim().slice(0, 200);
    if (value) block.name = value; else delete block.name;
    commit(); updateTopbar();
  };
  $('#blockSel').onclick = () => {
    commit();
    const gallery = document.createElement('dialog');
    gallery.className = 'diagram-gallery';
    gallery.setAttribute('aria-labelledby', 'diagramGalleryTitle');
    const diagrams = state.doc.blocks.map((b: any, i: number) => ({ b, i })).filter(({ b }: any) => b.type === 'diagram');
    const leave = () => closeDialogElement(gallery); // fades out, then closes
    document.body.appendChild(gallery);
    renderSvelteView(gallery, DiagramGallery, {
      title: uiText('gallery.title', 'Choose a Diagram'), closeLabel: uiText('ui.close', 'Close'), empty: uiText('pages.empty', 'empty'),
      cards: diagrams.map(({ b, i }: any, n: number) => ({ index: i, on: i === state.doc.active, svg: shapesSvg(b.shapes || [], 12, false, true),
        name: typeof b.name === 'string' && b.name.trim() ? b.name : uiText('top.blockSel', 'Diagram {n} of {total}', { n: n + 1, total: diagrams.length }) })),
      pick: (index) => { leave(); setActiveBlock(index); },
      close: leave,
    } satisfies DiagramGalleryModel);
    gallery.addEventListener('close', () => { destroyView(gallery); gallery.remove(); $('#blockSel').focus({ preventScroll: true }); }, { once: true });
    gallery.addEventListener('click', (e) => { if (e.target === gallery) leave(); }); // the backdrop
    gallery.addEventListener('cancel', (e) => { e.preventDefault(); leave(); }); // Esc
    gallery.addEventListener('keydown', (e) => e.stopPropagation());
    gallery.showModal();
    const selected = gallery.querySelector<HTMLElement>('[aria-current="true"]');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  };

  // Page mode: the sheet as SVG, one <svg> per page (for print) or one tall SVG (for download).
  function pageSvgs(): any {
    if (!TD.math.finalizing) return TD.math.synchronous(pageSvgs);
    const G = pageGeom(), ctx = { zoom: 1, hit: 0, export: true, scene: shapes() };
    return fillDefsAround(() => '<!--body-->' + shapes().map((s: any) => TYPES[s.type].svg(s, ctx)).join('')).split('<!--body-->');
  }
  async function exportPageSvg() {
    const G = pageGeom(), b = sheetBox(), [defs, body] = pageSvgs();
    let bg = '';
    for (let k = 0; k < G.n; k++) bg += `<rect x="0" y="${r2(pageTop(k, G))}" width="${r2(G.w)}" height="${r2(G.h)}" fill="#fff"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(b.w)} ${r2(b.h)}" width="${G.W}cm" height="${r2(b.h / PX)}cm">${TD.math.exportStyle()}${defs}${bg}${body}</svg>`;
    out(slug() + '.svg', await svgWithFonts(svg), 'image/svg+xml');
  }
  // ---------------- Export menu: PNG (chosen DPI), SVG, PDF ----------------
  // PNG is rasterised in the browser from the same SVG as the SVG export, with the maths fonts embedded
  // so they render inside the image. PDF goes through the browser's own PDF engine (print → Save as PDF)
  // on pages sized exactly to the diagram or the page, so shapes stay vector and text stays real text.
  const EXP_KEY = 'diagramtex.export';
  const expOpts = (() => { try { return { fmt: 'png', dpi: 300, transparent: false, flat: false, flatDpi: 300, ...JSON.parse(localStorage.getItem(EXP_KEY) || '{}') }; } catch (e: any) { return { fmt: 'png', dpi: 300, transparent: false, flat: false, flatDpi: 300 }; } })();
  const saveExpOpts = () => { try { localStorage.setItem(EXP_KEY, JSON.stringify(expOpts)); } catch (e: any) { /* storage blocked */ } };
  let rasterCss: any = null;
  async function rasterStyle() {
    const eng = TD.math.engine;
    if (!rasterCss || rasterCss[0] !== eng) {
      let fonts = '';
      try { fonts = await TD.inlineMathCss(); } catch (e: any) { fonts = ''; }
      const own = TD.math.exportStyle().replace(/^<style>|<\/style>$/g, '');
      // a stylesheet that couldn't be read is tried again next time, not kept for the session
      // (a font that had to be linked instead of embedded won't load inside a picture either)
      if (fonts && !fonts.startsWith('@import') && !TD.mathFontsLinked) rasterCss = [eng, fonts + own];
      else return xmlStyle(fonts + own);
    }
    return xmlStyle(rasterCss[1]);
  }
  // The picture is XML, where a raw < or & in a stylesheet (Temml's CSS has inline SVG images) breaks
  // it: the CSS goes in a CDATA section, with any "]]>" in it split across two sections.
  const xmlStyle = (css: any) => `<style><![CDATA[${css.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></style>`;
  // KaTeX writes each formula twice: the visible HTML, and MathML for screen readers, which its stylesheet
  // hides. A picture has no screen reader, and without the stylesheet the MathML would show as a second
  // copy of the formula, so it is left out.
  const noMathml = (svg: any) => svg.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '');
  // what to export: one entry per output page, each { vb: [x,y,w,h] in canvas px, inner: svg markup, bg }
  function exportSources(): any {
    if (!TD.math.finalizing) return TD.math.synchronous(exportSources);
    if (state.mode === 'page') {
      const G = pageGeom(), [defs, body] = pageSvgs();
      return Array.from<any, any>({ length: G.n }, (_, k) => ({ vb: [0, pageTop(k, G), G.w, G.h], inner: defs + body, page: true }));
    }
    return shapeSources(shapes());
  }
  function shapeSources(list: any[]): any {
    if (!TD.math.finalizing) return TD.math.synchronous(() => shapeSources(list));
    if (!list.length) return [];
    const b = TD.bboxOf(list.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 8);
    const svg = shapesSvg(list, 8, false);
    return [{ vb: [b.x, b.y, b.w, b.h], inner: svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') }];
  }
  const expScale = (dpi = expOpts.dpi) => dpi / 2.54 / PX; // canvas px → image px
  // the largest picture a browser draws: 40 megapixels, and no side over 32767 px
  const RASTER_AREA = 4e7, RASTER_SIDE = 32767;
  const rasterFits = (W: number, H: number) => W * H <= RASTER_AREA && Math.max(W, H) <= RASTER_SIDE;
  // the highest DPI at which every source fits (whole DPI)
  const maxDpi = (srcs: any[]) => Math.floor(Math.min(...srcs.map((s: any) => { const [, , w, h] = s.vb, k = 1 / 2.54 / PX; return Math.min(Math.sqrt(RASTER_AREA / (w * k * h * k)), RASTER_SIDE / (Math.max(w, h) * k)); })));
  async function rasterise(src: any, transparent: any, dpi?: any) {
    const sc = expScale(dpi), [x, y, w, h] = src.vb;
    const W = Math.max(1, Math.round(w * sc)), H = Math.max(1, Math.round(h * sc));
    if (!rasterFits(W, H)) throw new Error(`${W} × ${H} px is too large; lower the DPI`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}" width="${W}" height="${H}">${await rasterStyle()}${noMathml(src.inner)}</svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    await new Promise((r) => setTimeout(r, 60)); // let the embedded fonts settle
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!transparent) { g!.fillStyle = '#ffffff'; g!.fillRect(0, 0, W, H); }
    g!.drawImage(img, 0, 0, W, H);
    return c;
  }
  // PNG with its DPI recorded (pHYs chunk), so it prints at the diagram's true size
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8: any) => { let c = 0xffffffff; for (const b of u8) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function pngWithDpi(canvas: any, dpi: any) {
    const buf = new Uint8Array(await ((await new Promise((r) => canvas.toBlob(r, 'image/png'))) as any).arrayBuffer());
    const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const at = 33; // after the signature (8) and IHDR (25)
    const out = new Uint8Array(buf.length + 21);
    out.set(buf.subarray(0, at)); out.set(chunk, at); out.set(buf.subarray(at), at + 21);
    return new Blob([out], { type: 'image/png' });
  }
  // A flattened PDF: each sheet one RGB image at the chosen DPI (Flate-compressed), on a page of the
  // sheet's true size. Written here, so it saves like a PNG does, without the print window.
  async function flatPdf(srcs: any, dpi: any) {
    const enc = new TextEncoder(), parts: any[] = [], offs: any[] = [];
    let len = 0;
    const add = (x: any) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const deflate = async (u8: any) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const n = srcs.length, obj = (i: any, body: any) => { offs[i] = len; add(`${i} 0 obj\n`); for (const b of [].concat(body)) add(b); add('\nendobj\n'); };
    add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    // 1 catalog, 2 pages, then per sheet: page, image, content
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${n} /Kids [${srcs.map((_: any, k: any) => `${3 + 3 * k} 0 R`).join(' ')}] >>`);
    for (let k = 0; k < n; k++) {
      const c = await rasterise(srcs[k], false, dpi), W = c.width, H = c.height;
      const px = (c.getContext('2d'))!.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3);
      for (let i = 0, j = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
      const img = await deflate(rgb);
      const pw = r2(srcs[k].vb[2] / PX / 2.54 * 72), ph = r2(srcs[k].vb[3] / PX / 2.54 * 72), cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
      const P = 3 + 3 * k;
      obj(P, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${P + 1} 0 R >> >> /Contents ${P + 2} 0 R >>`);
      obj(P + 1, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream']);
      obj(P + 2, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    }
    const xref = len, N = 3 + 3 * n;
    add(`xref\n0 ${N}\n0000000000 65535 f \n` + offs.slice(1, N).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    add(`trailer\n<< /Size ${N} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  const out = createExportWriter(TD.files, () => state.docId, showHint);
  // Ask for the export folder's access while the click is fresh, before slow work.
  const askDir = () => (TD.files.dirOf(state.docId) ? TD.files.exportDir(state.docId) : null);
  async function runExport() {
    if (!outputAllowed()) return;
    finishEdit(); finishPoly();
    if (!outputAllowed()) return;
    const fmt = expOpts.fmt;
    if (fmt === 'svg') { runCmd('svg'); return; }
    const srcs = exportSources();
    if (!srcs.length) { showHint(uiText('hint.diagramEmpty', 'This diagram is empty'), 1200); return; }
    if (fmt === 'pdf' && !expOpts.flat) { printVector(srcs, picSlug()); return; }
    await askDir();
    if (fmt === 'pdf') {
      showHint(uiText('hint.exportingFlatPdf', 'Exporting a flattened PDF at {dpi} DPI…', { dpi: expOpts.flatDpi }), 1500);
      try { await out(picSlug() + '.pdf', await flatPdf(srcs, expOpts.flatDpi)); } catch (e: any) { showHint(uiText('hint.exportFailed', 'Export failed: {error}', { error: e.message || e }), 3000); }
      return;
    }
    showHint(uiText('hint.exportingAt', 'Exporting {fmt} at {dpi} DPI…', { fmt: fmt.toUpperCase(), dpi: expOpts.dpi }), 1500);
    try {
      for (let k = 0; k < srcs.length; k++) {
        const c = await rasterise(srcs[k], expOpts.transparent && !srcs[k].page);
        await out(picSlug() + (srcs.length > 1 ? `-p${k + 1}` : '') + '.png', await pngWithDpi(c, expOpts.dpi));
      }
    } catch (e: any) { showHint(uiText('hint.exportFailed', 'Export failed: {error}', { error: e.message || e }), 3000); }
  }
  // the Export panel: the kit's popover under the Export button, its body built here
  let expPop: PopoverHandle | null = null;
  const expOpen = () => !!expPop && !expPop.closed;
  const closeExport = () => expPop?.close();
  const DPIS = [72, 96, 150, 300, 600];
  // Formats: pictures of the diagram or pages, plus the whole file as one web page. Document view has a PDF of the
  // document (printed, so vector with selectable text) and the web page.
  const expFmts = () => (state.mode === 'document' ? [['pdf', 'PDF'], ['html', uiText('exp.webPage', 'Web page')]] : [['png', 'PNG'], ['svg', 'SVG'], ['pdf', 'PDF'], ['html', uiText('exp.webPage', 'Web page')]]);
  const expFmt = () => (expFmts().some(([k]) => k === expOpts.fmt) ? expOpts.fmt : expFmts()[0][0]);
  function renderExpPop() {
    if (!expOpen()) return;
    if (TD.math.pending) { closeExport(); return; }
    const o = expOpts, fmt = expFmt();
    expPop!.el.setAttribute('aria-label', caption(captions["ui.export"]));
    const setFmt = (v: string) => { expOpts.fmt = v; saveExpOpts(); renderExpPop(); };
    const go = (label: string): ExportAction => ({ label, primary: true, attrs: { 'data-ego': '' }, onclick: () => { closeExport(); if (expFmt() === 'html') exportHtml(); else if (expFmt() === 'pdf' && expRender !== 'shown') void exportTexPdf(expRender); else if (state.mode === 'document') printShown(); else runExport(); } });
    // a PDF made by LaTeX in this browser, where an engine runs: the choice, and what it makes
    const renderRow = (): ExportRow[] => expEngines.length ? [{ kind: 'select', id: 'expRender', label: uiText('exp.render', 'Render'),
      title: uiText('exp.render.title', 'As shown: the PDF of what you see here. pdfLaTeX or XeLaTeX: the file’s LaTeX compiled in this browser'),
      value: expRender, options: [{ value: 'shown', label: uiText('print.asShown', 'As shown') }, ...expEngines.map((e) => ({ value: e, label: ENGINE_NAME[e] }))],
      onchange: (v) => { expRender = v as typeof expRender; renderExpPop(); } }] : [];
    const texRows = (): ExportRow[] => [{ kind: 'note', text: uiText('exp.texNote', 'The file’s LaTeX compiled with {engine} here, in this browser, as the PDF LaTeX makes it.', { engine: ENGINE_NAME[expRender as TexEngine] }) },
      // pdfLaTeX for a Thai file: it sets the Thai, but XeLaTeX sets it best
      ...(expRender === 'pdflatex' && expEngines.includes('xelatex') && thaiFile(state.doc) ? [{ kind: 'note', warn: true, text: uiText('tex.thaiBest', 'This file has Thai: XeLaTeX sets it best, its Latin letters in the Thai font too.') } as ExportRow] : []), ...dirRow()];
    const texGo = () => go(TD.files.dirOf(state.docId) ? uiText('exp.save', 'Save {fmt}', { fmt: 'PDF' }) : uiText('exp.download', 'Download {fmt}', { fmt: 'PDF' }));
    const formats = expFmts().map(([value, label]) => ({ value, label }));
    let model: ExportPanelModel;
    if (fmt === 'html') {
      model = { head: state.doc.kind === 'classic' ? uiText('exp.h.document', 'Export document') : uiText('exp.h.file', 'Export file'), formats, format: fmt, onformat: setFmt,
        rows: [{ kind: 'note', text: uiText('exp.htmlNote', 'The whole file as one self-contained page (.html), with fonts and pictures embedded. Opens in any browser, even offline.') }, ...dirRow()],
        actions: [go(TD.files.dirOf(state.docId) ? uiText('exp.saveWeb', 'Save web page') : uiText('exp.downloadWeb', 'Download web page'))] };
    } else if (state.mode === 'document') {
      // the document's PDF is the print of its pages: vector, selectable text, no flattening
      model = { head: uiText('exp.h.document', 'Export document'), formats, format: fmt, onformat: setFmt,
        rows: [...renderRow(), ...(expRender !== 'shown' ? texRows() : [{ kind: 'note', bold: uiText('exp.saveAsPdf', 'Save as PDF'), text: uiText('exp.pdfNote', 'Vector PDF with selectable text. In the print window, choose {b} as the destination.', { b: '\u0000' }) } as ExportRow])],
        actions: [expRender !== 'shown' ? texGo() : go(uiText('exp.savePdf', 'Save PDF…'))] };
    } else if (o.fmt === 'pdf' && expRender !== 'shown') {
      model = { head: state.mode === 'page' ? uiText('exp.h.page', 'Export page') : state.mode === 'board' ? uiText('exp.h.board', 'Export whiteboard') : uiText('exp.h.diagram', 'Export diagram'),
        formats, format: o.fmt, onformat: setFmt, rows: [...renderRow(), ...texRows()], actions: [texGo()] };
    } else {
      const flat = o.fmt === 'pdf' && o.flat, dpi = flat ? o.flatDpi : o.dpi;
      const srcs = exportSources(), sc = expScale(dpi);
      const dim = srcs.length ? `${Math.round(srcs[0].vb[2] * sc)} × ${Math.round(srcs[0].vb[3] * sc)} px` : uiText('exp.empty', 'empty');
      const cm = srcs.length ? `${r2(srcs[0].vb[2] / PX)} × ${r2(srcs[0].vb[3] / PX)} cm` : '';
      const raster = o.fmt === 'png' || flat;
      const head = state.mode === 'page' ? (srcs.length > 1 ? uiText('exp.h.pages', 'Export pages') : uiText('exp.h.page', 'Export page')) : state.mode === 'board' ? uiText('exp.h.board', 'Export whiteboard') : uiText('exp.h.diagram', 'Export diagram');
      const B = '\u0000';
      const rows: ExportRow[] = [];
      if (o.fmt === 'pdf') rows.push(...renderRow());
      if (o.fmt === 'pdf') rows.push({ kind: 'switch', id: 'expFlat', label: uiText('exp.flatten', 'Flatten'), title: uiText('exp.flatten.title', 'Pages as images at a set DPI, instead of vector with selectable text'), checked: flat,
        onchange: (on) => { expOpts.flat = on; saveExpOpts(); setTimeout(renderExpPop, 220); } }); // after the knob slides
      if (raster) rows.push({ kind: 'dpi', label: uiText('exp.resolution', 'Resolution'), value: dpi, presets: DPIS, onchange: (v) => { expOpts[expOpts.fmt === 'pdf' ? 'flatDpi' : 'dpi'] = v; saveExpOpts(); renderExpPop(); } },
        { kind: 'meta', text: dim + (srcs.length > 1 ? ' ' + (o.fmt === 'pdf' ? uiText('exp.perPage.pages', 'per page · {n} pages', { n: srcs.length }) : uiText('exp.perPage.files', 'per page · {n} files', { n: srcs.length })) : ''), aside: cm });
      else rows.push({ kind: 'meta', text: uiText('exp.vector', 'Vector, scales to any size'), aside: cm });
      // said here, before the export, not after it fails: the largest DPI that works instead
      const tooBig = raster && srcs.length > 0 && srcs.some((s: any) => !rasterFits(Math.round(s.vb[2] * sc), Math.round(s.vb[3] * sc)));
      if (tooBig) rows.push({ kind: 'error', text: uiText('exp.tooLarge', 'Too large for the browser to draw at {dpi} DPI. Choose {max} DPI or less.', { dpi, max: Math.max(1, maxDpi(srcs)) }) });
      if (o.fmt === 'png' && state.mode !== 'page') rows.push({ kind: 'check', id: 'expTr', label: uiText('exp.transparent', 'Transparent background'), checked: o.transparent, onchange: (on) => { expOpts.transparent = on; saveExpOpts(); } });
      if (flat) rows.push({ kind: 'note', text: srcs.length > 1 ? uiText('exp.flatNote.page', "Each page becomes one image; text can't be selected.") : uiText('exp.flatNote.sheet', "Each sheet becomes one image; text can't be selected.") });
      if (o.fmt === 'pdf' && !flat) rows.push({ kind: 'note', bold: uiText('exp.saveAsPdf', 'Save as PDF'),
        text: srcs.length > 1 ? uiText('exp.pdfNote.pages', 'Vector PDF with selectable text, {n} pages. In the print window, choose {b} as the destination.', { n: srcs.length, b: B }) : uiText('exp.pdfNote', 'Vector PDF with selectable text. In the print window, choose {b} as the destination.', { b: B }) });
      else rows.push(...dirRow());
      model = { head, formats, format: o.fmt, onformat: setFmt, rows,
        actions: [{ ...go(o.fmt === 'pdf' && !flat ? uiText('exp.savePdf', 'Save PDF…') : TD.files.dirOf(state.docId) ? uiText('exp.save', 'Save {fmt}', { fmt: o.fmt.toUpperCase() }) : uiText('exp.download', 'Download {fmt}', { fmt: o.fmt.toUpperCase() })), disabled: tooBig }] };
    }
    renderSvelteView(expPop!.body, ExportPanel, model);
  }
  // Where exports go: Downloads, or a folder picked once for this file (where the browser allows it).
  function dirRow(): ExportRow[] {
    if (!TD.files.can) return [];
    const f = TD.files.dirOf(state.docId);
    return [{ kind: 'dir', label: uiText('exp.saveTo', 'Save to'), folder: f ? f.name : uiText('exp.downloads', 'Downloads'),
      title: f ? uiText('exp.dir.title', 'Exports of this file go to the folder {folder}, replacing files of the same name. Click to pick another folder.', { folder: f.name }) : uiText('exp.dir.none', 'Exports are downloaded. Click to pick a folder for this file’s exports instead.'),
      onpick: () => { TD.files.pickDir(state.docId).then(renderExpPop, (err: any) => showHint(uiText('hint.folderFailed', "Couldn't use that folder ({error})", { error: err.message }), 2500)); },
      clear: f ? { title: uiText('exp.dirClear', 'Download exports instead'), onclick: () => { TD.files.clearDir(state.docId).then(renderExpPop); } } : undefined }];
  }
  // Export PDF's renderer: as shown, or a LaTeX engine; starts as shown each time the panel opens
  let expRender: 'shown' | TexEngine = 'shown', expEngines: TexEngine[] = [];
  function openExport(btn: any) {
    if (!outputAllowed()) return;
    if (expOpen()) { closeExport(); return; }
    expRender = 'shown'; expEngines = [];
    void texEnginesHere().then((e) => { expEngines = e; if (e.length) renderExpPop(); });
    // Esc and a press outside are the popover's own
    // the panel goes once the popover has faded out
    const pop = openPopover(btn, { width: 264, class: 'exp-pop', label: caption(captions["ui.export"]), onclose: () => { const body = pop.body; setTimeout(() => destroyView(body), 400); } });
    expPop = pop;
    renderExpPop();
  }
  // Print one sheet per export source, each sized exactly to it: the browser's PDF output is vector,
  // with the fonts embedded, so "Save as PDF" here is the vector PDF export.
  function printVector(srcs: any, name = slug()) {
    if (!outputAllowed() || !srcs.length) return;
    let host = $('#pagePrint');
    if (!host) { host = document.createElement('div'); host.id = 'pagePrint'; document.body.appendChild(host); }
    const cm = (v: any) => r2(v / PX);
    // the live canvas (hidden while printing) holds the same gradient / clip / marker ids, and url(#id)
    // would resolve to those hidden copies, so the printed copy gets ids of its own
    const own = (m: any, k: any) => m.replace(/\bid="([^"]+)"/g, `id="pp${k}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#pp${k}-$1)`).replace(/href="#([^"]+)"/g, `href="#pp${k}-$1"`);
    // Paper dimensions belong to @page. The HTML sheet fills the actual print
    // page area; a physical-height SVG in normal flow can overflow it in WebKit.
    host.innerHTML = srcs.map((s: any, k: any) => { const [x, y, w, h] = s.vb;
      return `<section class="print-sheet" style="page:p${k}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}">${s.page ? `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="#fff"/>` : ''}${own(s.inner, k)}</svg></section>`; }).join('');
    let st = $('#pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = srcs.map((s: any, k: any) => `@page p${k} { size: ${cm(s.vb[2])}cm ${cm(s.vb[3])}cm; margin: 0; }`).join('\n') +
      `\n@page { size: ${cm(srcs[0].vb[2])}cm ${cm(srcs[0].vb[3])}cm; margin: 0; }`;
    const title = document.title;
    document.title = name; // the default file name in "Save as PDF"
    document.body.classList.add('printing-page');
    setTimeout(() => { if (outputAllowed()) window.print(); document.body.classList.remove('printing-page'); host.innerHTML = ''; document.title = title; }, 300);
  }
  const printPage = () => printVector(exportSources());
  // Print: as shown (the browser's drawing, as always), or the LaTeX compiled here, asked each time where an engine runs
  async function printDoc() {
    if (!outputAllowed()) return;
    const engines = await texEnginesHere();
    if (engines.length) {
      // pdfLaTeX for a Thai file: said while it is the one chosen
      const thai = thaiFile(state.doc) && engines.includes('xelatex') ? uiText('tex.thaiBest', 'This file has Thai: XeLaTeX sets it best, its Latin letters in the Thai font too.') : null;
      const pick = await TD.choose(uiText('print.title', 'Print'), uiText('print.how.msg', 'As shown prints what you see here. pdfLaTeX and XeLaTeX compile the file’s LaTeX in this browser and print that PDF.'),
        [uiText('print.asShown', 'As shown'), ...engines.map((e) => ENGINE_NAME[e])], { ok: uiText('print.go', 'Print'), choiceLabel: uiText('print.renderWith', 'Render with'),
          choiceNotes: [null, ...engines.map((e) => (e === 'pdflatex' ? thai : null))] });
      if (pick == null) return;
      if (pick > 0) { void printTexPdf(engines[pick - 1]); return; }
    }
    printShown();
  }
  function printShown() {
    if (!outputAllowed()) return;
    finishEdit(); finishPoly(); commit();
    if (!outputAllowed()) return;
    if (state.mode === 'page') { printPage(); return; }
    if (TD.docview) TD.docview.render(true);
    document.body.classList.add('printing');
    const title = document.title;
    document.title = slug(); // the default file name in "Save as PDF"
    setTimeout(() => { if (outputAllowed()) window.print(); document.body.classList.remove('printing'); document.title = title; if (state.mode === 'document' && TD.docview) TD.docview.render(); }, 300);
  }

  // Browser-menu printing bypasses our keyboard handler. beforeprint cannot
  // cancel the native dialog, so never expose provisional content to it.
  window.addEventListener('beforeprint', () => {
    if (!TD.math.pending) return;
    let note = document.getElementById('printBlocked');
    if (!note) { note = document.createElement('div'); note.id = 'printBlocked'; document.body.append(note); }
    note.textContent = outputWait(); document.body.classList.add('print-blocked');
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('print-blocked'));

  // ---------------- import ----------------
  const imp = $('#importModal');
  // fromName: the file the code came from (a .tex opened from disk), which a new document is named after
  let importFrom = '';
  function openImport(text: any, fromName = '') {
    finishEdit(); finishPoly(); commit();
    importFrom = fromName;
    $('#impText').value = text || '';
    impSay('');
    $('#impDefs').value = '';
    showModalEl(imp);
    importReport();
    $('#impText').focus();
  }
  function closeImport() { hideModalEl(imp); }
  // the report under the field (src/ui/ImportReport.svelte): one line, or what becomes shapes and what stays code
  const impSay = (text: string) => { $('#impMsg').classList.remove('report'); renderSvelteView($('#impMsg'), ImportReport, { text } satisfies ImportReportModel); };
  // what statements that can't be read exactly become: TikZ code as written (grouped), or editable shapes
  let impHow: any = (store.get('diagramtex.importHow', 'code') as any) === 'shapes' ? 'shapes' : 'code';
  const markHow = () => document.querySelectorAll('#impHow [data-how]').forEach((b) => { const on = (b as HTMLElement).dataset.how === impHow; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  markHow();
  document.querySelectorAll('#impHow [data-how]').forEach((b) => ((b as HTMLElement).onclick = () => { impHow = (b as HTMLElement).dataset.how; store.set('diagramtex.importHow', impHow); markHow(); importReport(); }));
  const importAs = (src: any) => TD.importLatex(src, { editable: impHow === 'shapes', definitions: $('#impDefs').value });
  // as the code is typed or pasted: what will become shapes and what stays TikZ code, and why (with its line)
  function importReport() {
    const msg = $('#impMsg'), src = $('#impText').value;
    if (!src.trim()) { impSay(''); return; }
    let res, conv = [];
    try { res = TD.importLatex(src, { definitions: $('#impDefs').value }); if (impHow === 'shapes') { conv = (res.kept || []).filter((k: any) => k.preview); res = importAs(src); } } catch (err: any) { impSay(uiText('imp.parseFailed', 'Could not parse: {error}', { error: err.message })); return; }
    const shapes = res.blocks.flatMap((b: any) => b.shapes || []);
    const n = shapes.filter((x: any) => x.type !== 'tikz').length, kept = [...conv.map((k: any) => ({ ...k, conv: true })), ...(res.kept || [])].sort((a, b) => (a.line || 0) - (b.line || 0));
    const nConv = conv.length, nCode = kept.length - nConv;
    const unresolved = (res.analysis || []).filter((a: any) => a.status === 'unresolved').length;
    const lintSource = ($('#impDefs').value ? $('#impDefs').value + '\n' : '') + src;
    const first = (c: any) => { const l = String(c).split('\n').find((x) => x.trim() && !/^\s*%/.test(x)) || ''; return l.trim().length > 60 ? l.trim().slice(0, 59) + '…' : l.trim(); };
    msg.classList.add('report');
    renderSvelteView(msg, ImportReport, {
      unresolved: unresolved ? (unresolved === 1 ? uiText('imp.unresolved.one', '1 section has unresolved layout or no preview. Its source is preserved; it is not converted to shapes.') : uiText('imp.unresolved.many', '{n} sections have unresolved layout or no preview. Their source is preserved; they are not converted to shapes.', { n: unresolved })) : undefined,
      lint: TD.lint ? TD.lint(lintSource) : [],
      summary: [n === 1 ? uiText('imp.shapes.one', '1 shape') : uiText('imp.shapes.many', '{n} shapes', { n }),
        nConv ? (nConv === 1 ? uiText('imp.conv.one', "1 statement converted to shapes as drawn: what isn't read below is left out") : uiText('imp.conv.many', "{n} statements converted to shapes as drawn: what isn't read below is left out", { n: nConv })) : '',
        nCode ? (nCode === 1 ? uiText('imp.preserved.one', '1 statement preserved as TikZ code') : uiText('imp.preserved.many', '{n} statements preserved as TikZ code', { n: nCode })) : ''].filter(Boolean).join(' · '),
      rows: kept.slice(0, 40).map((k) => ({ line: k.line ? uiText('imp.line', 'line {n}', { n: k.line }) : '', code: first(k.code), why: k.issues.join('; ') })),
      more: kept.length > 40 ? uiText('imp.more', '… {n} more', { n: kept.length - 40 }) : undefined,
      warnings: res.warnings,
    } satisfies ImportReportModel);
  }
  let impTimer = 0;
  for (const id of ['#impText', '#impDefs']) $(id).addEventListener('input', () => { clearTimeout(impTimer); impTimer = setTimeout(importReport, 300); });
  // each picture comes in as one group, so it moves as one and its pieces don't scatter
  function groupPictures(res: any) {
    for (const b of res.blocks) if (b.type === 'diagram' && b.shapes.length > 1) { const g = uid(); for (const x of b.shapes) { x.g = g; delete x.gname; } }
  }
  // Imported code into this file: in Document view as new blocks (after the active one, or at docAt), else as
  // shapes centred on `at` (the middle of the visible canvas), moved by whole grid steps so they stay on the grid.
  function placeImported(res: any, at: any, docAt?: number) {
    // (in the Document, the insert below is the undo step that also holds the macros)
    if (state.mode === 'document') { takeMacros(res); insertBlocks(res.blocks.filter((b: any) => b.type !== 'diagram' || b.shapes.length), docAt); return; }
    const list = res.blocks.flatMap((b: any) => (b.type === 'diagram' ? b.shapes : []));
    const c = at || viewCentre(), G = TD.GRID;
    const bb = list.length ? TD.bboxOf(list.flatMap((x: any) => { const q = TD.bbox(x); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; })) : null;
    const dx = bb ? Math.round((c.x - bb.x - bb.w / 2) / G) * G : 0, dy = bb ? Math.round((c.y - bb.y - bb.h / 2) / G) * G : 0;
    begin();
    state.sel.clear();
    const idmap = new Map();
    for (const sh of list) { const oldId = sh.id; sh.id = uid(); idmap.set(oldId, sh.id); if (dx || dy) TD.translate(sh, dx, dy); addShape(sh); state.sel.add(sh.id); }
    remapLinks(list, idmap);
    takeMacros(res);
    commit();
    render(); renderProps();
  }
  // the one block an import brought in (named in the hint instead of counted as a shape), else null
  const nIn1 = (res: any) => { const l = res.blocks.flatMap((b: any) => b.shapes || []); return l.length === 1 && TD.blocks.get(l[0].type) && TYPES[l[0].type] ? l[0] : null; };
  function runImport(asNew: any) {
    const src = $('#impText').value;
    let res;
    try { res = importAs(src); } catch (err: any) { impSay(uiText('imp.parseFailed', 'Could not parse: {error}', { error: err.message })); return; }
    groupPictures(res);
    const nShapes = res.blocks.reduce((a: any, b: any) => a + (b.shapes ? b.shapes.length : 0), 0);
    if (!nShapes && !res.blocks.some((b: any) => b.type === 'text')) { impSay(uiText('imp.nothing', 'Nothing recognised in this code.') + (res.warnings.length ? ' ' + res.warnings.join(' ') : '')); return; }
    // a new document is named after its \title, else the file it came from, else "Imported"; never an existing name
    const newName = () => { const n = String(res.title || importFrom || uiText('imp.defaultName', 'Imported')).trim() || uiText('imp.defaultName', 'Imported'); return index().some((x) => (x as any).name === n) ? copyName(n) : n; };
    // a new file takes the import's macros with its page settings
    const page = String(res.macros || '').trim() ? { ...(res.page || {}), macros: res.macros } : res.page;
    if (asNew && state.doc.kind === 'board') { newDoc(newName(), null, null, res.blocks, page, 'board'); zoomFit(); }
    else if (asNew) {
      newDoc(newName(), null, null, res.blocks, page);
      if (res.blocks.filter((b: any) => b.type === 'diagram').length > 1 || res.blocks.some((b: any) => b.type === 'text')) setMode('document');
      else zoomFit();
    } else {
      // what the file held before the import stays in its version history
      if (state.docId) { commit(); saveNow(); const cur = store.get<Record<string, unknown> | null>(LS_DOC + state.docId, null); recovery.take(state.docId, cur, docEntry(state.docId)?.updated, true); }
      placeImported(res, null);
    }
    closeImport();
    const nKept = (res.kept || []).length;
    const only = nIn1(res), nIn = nShapes - nKept;
    const inMsg = only ? uiText('hint.importedBlock', 'Imported the {name} block', { name: typeName(only.type) }) : nIn === 1 ? uiText('hint.importedShapes.one', 'Imported 1 shape') : uiText('hint.importedShapes.many', 'Imported {n} shapes', { n: nIn });
    showHint(nKept ? uiText('hint.imported.kept', '{shapes} · {n} kept as TikZ code (dashed frames)', { shapes: inMsg, n: nKept }) : inMsg, 3000);
  }
  $('#impClose').onclick = closeImport;
  $('#impNew').onclick = () => runImport(true);
  $('#impInsert').onclick = () => runImport(false);
  $('#impFile').onclick = () => $('#fileInput').click();
  imp.addEventListener('pointerdown', (e: any) => { if (e.target === imp) closeImport(); });

  // TikZ modal
  // The code is shown one row per line. The lines of the selected objects are marked, and a click on a line
  // selects the object it draws. Lines pdflatex would stop on are marked red (the message is the tooltip),
  // and lines changed since the code was last copied or downloaded get a blue bar.
  const view = $('#tikzOut');
  let tikzText = '', tikzSpans: any[] = [], tikzErr = new Map();
  let tikzFiles = new Map<string, string>(); // pictures the code in the dialog refers to (name → data)
  // LaTeX out: the .tex alone, or (when it uses pictures, or zip is asked for) a .zip with the pictures
  // convert: the .zip for a setup without Inkscape: each SVG with a PDF of it, and the LaTeX set to use those
  async function downloadLatex(tex: string, files: Map<string, string>, zip = files.size > 0, convert = false) {
    if (!zip) { await out(slug() + '.tex', tex, 'text/x-tex'); return; }
    await askDir();
    try { await out(slug() + '.zip', await texBundle(slug() + '.tex', convert ? TD.texImages.noInkscape(tex) : tex, files, TD.texImages.svgFallback, convert)); }
    catch (e: any) { showHint(uiText('hint.exportFailed', 'Export failed: {error}', { error: e.message || e }), 3000); }
  }
  const tikzBase = new Map(); // what was last copied or downloaded, per file, scope and selection
  const baseKey = () => [state.docId, state.mode === 'page' ? 'page' : $('#tikzScope').value, $('#tikzSelOnly').checked ? 'sel' : ''].join(':');
  // lines of b (0-based) not in a longest common subsequence with a
  function changedLines(a: any, b: any) {
    let p = 0, q = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q), out = new Set();
    if (A.length * B.length > 4e6) { const has = new Set(A); B.forEach((l: any, i: any) => { if (!has.has(l)) out.add(p + i); }); return out; }
    const W = B.length + 1, D = new Uint32Array((A.length + 1) * W);
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) D[i * W + j] = A[i] === B[j] ? D[(i + 1) * W + j + 1] + 1 : Math.max(D[(i + 1) * W + j], D[i * W + j + 1]);
    let i = 0, j = 0;
    while (j < B.length) {
      if (i < A.length && A[i] === B[j]) { i++; j++; }
      else if (i < A.length && D[(i + 1) * W + j] >= D[i * W + j + 1]) i++;
      else out.add(p + j++);
    }
    return out;
  }
  const selLines = () => {
    const L = new Set();
    for (const sp of tikzSpans) if (sp.ids.some((id: any) => state.sel.has(id))) for (let n = sp.a; n <= sp.b; n++) L.add(n);
    return L;
  };
  function markSel(scroll: any) {
    const L = selLines();
    let first = null;
    for (const el of view.children) { const on = L.has(+el.dataset.n); el.classList.toggle('sel', on); if (on && !first) first = el; }
    if (scroll && first) view.scrollTop = Math.max(0, first.offsetTop - 48);
  }
  function paintTikz() {
    const lines = tikzText.split('\n'), base = tikzBase.get(baseKey());
    const ch = base == null ? new Set() : changedLines(base.split('\n'), lines);
    // brackets in their colours by depth, nesting across lines (src/ui/tex-brackets.ts)
    const marks = bracketMarks(tikzText);
    let at = 0;
    view.innerHTML = lines.map((l, i) => {
      const e = tikzErr.get(i + 1), h = bracketHtml(l, marks, at);
      at += l.length + 1;
      return `<div class="cl${e ? ' err' : ''}${ch.has(i) ? ' chg' : ''}" data-n="${i + 1}"${e ? ` title="${esc(e.join('\n'))}"` : ''}>${h}</div>`;
    }).join('');
    markSel(false);
  }
  // the LaTeX carries no copy of the diagram (a long data line stopped pdflatex), so importing it again is a best effort
  // said only when it applies: importing this LaTeX again leaves something as TikZ code (one plain circle comes back whole)
  function restorable(tex: string) {
    try { return TD.importLatex(tex).blocks.every((b: any) => b.type !== 'diagram' || (b.shapes || []).every((s: any) => s.type !== 'tikz' || s.kind === 'defs')); } catch { return false; }
  }
  const noRestore = () => uiText('hint.noRestore', 'DiagramTeX can\'t restore this LaTeX exactly: importing it again brings back lines, shapes and text, but plots, most blocks and library symbols come back as TikZ code. To keep editing, save the .diagramtex file.');
  // the engine the dialog's code is for (its menu): pdfLaTeX, or XeLaTeX for the document's font or Thai text
  const tikzEngine = (): TexEngine => ($('#tikzEngine').value === 'xelatex' ? 'xelatex' : 'pdflatex');
  /** The engine a file's LaTeX starts with: XeLaTeX when its font or its text is Thai. */
  const engineFor = (doc: any): TexEngine => (thaiFile(doc) ? 'xelatex' : 'pdflatex');
  /** A file in a Thai document font or with Thai text: XeLaTeX sets it best (pdfLaTeX can, with the TLWG Type 1 fonts). */
  // (a document's blocks, a page's sheet, a whiteboard's shapes: every content a file kind keeps, not its name)
  function thaiFile(doc: any) { return !!docFont(doc?.page?.family).thai || hasThai(JSON.stringify([doc?.blocks, doc?.sheet, doc?.shapes])); }
  function genTikz() {
    const scope = state.mode === 'page' ? 'page' : $('#tikzScope').value, engine = tikzEngine();
    $('#tikzSelWrap').style.display = state.sel.size && scope !== 'doc' ? '' : 'none';
    const selOnly = $('#tikzSelOnly').checked && state.sel.size && scope !== 'doc';
    const list = selOnly ? selected() : shapes();
    let raw;
    TD.srcMark = true;
    try {
      ({ result: raw, files: tikzFiles } = TD.texImages.collect(() => scope === 'page' ? TD.pageToLatex(state.doc, { only: selOnly ? list : null, engine })
        : scope === 'doc' ? TD.docToLatex(state.doc, { engine })
        : TD.toTikz(list, { standalone: scope === 'standalone', engine })));
    } finally { TD.srcMark = false; }
    // the pictures the code names: a .zip carries them with the .tex
    const n = tikzFiles.size, svgs = [...tikzFiles.keys()].some((k) => /\.svg$/i.test(k));
    $('#tikzZipWrap').hidden = !n;
    // the menu's other .zip matters only when there is an SVG to convert
    $('#tikzZipWrap').classList.toggle('one', !svgs);
    closeZipMenu();
    if (n) {
      const what = n === 1 ? uiText('tikz.zip.one', 'The .tex and the picture it uses') : uiText('tikz.zip.many', 'The .tex and the {n} pictures it uses', { n });
      $('#tikzZip').title = svgs ? uiText('tikz.zip.svg', '{files}. SVGs are converted by Inkscape when the LaTeX compiles (shell escape; Overleaf has both)', { files: what }) : what;
    }
    const m = TD.srcMap(raw);
    tikzText = m.text; tikzSpans = m.spans;
    // what would stop pdflatex: mostly TikZ code kept as written (imported or typed in a code object)
    const L = TD.lint ? TD.lint(tikzText, { preview: false, engine }).filter((d: any) => d.sev !== 'info') : [];
    tikzErr = new Map();
    for (const d of L) tikzErr.set(d.line, [...(tikzErr.get(d.line) || []), d.msg]);
    tikzLint = L;
    showTikzLint();
    clearCompiled(); // the code has changed: a PDF made from the last would mislead
    paintTikz();
  }
  let tikzLint: LintItem[] = [], tikzStatus: LintListModel['status'];
  function showTikzLint() { renderSvelteView($('#tikzLint'), LintList, { note: restorable(tikzText) ? '' : noRestore(), items: tikzLint, ...(tikzStatus ? { status: tikzStatus } : {}) } satisfies LintListModel); }
  // a click on a line selects what it draws (⇧ adds); dragging across lines selects text as usual
  view.addEventListener('click', (e: any) => {
    const el = e.target.closest('.cl');
    if (!el || !(getSelection())!.isCollapsed) return;
    const n = +el.dataset.n, here = new Set(shapes().map((s: any) => s.id));
    const hits = tikzSpans.filter((sp) => sp.a <= n && n <= sp.b);
    if (!hits.length) return;
    const sp = hits.reduce((x, y) => (y.b - y.a < x.b - x.a ? y : x));
    const ids = sp.ids.filter((id: any) => here.has(id));
    if (!ids.length) return;
    if (!e.shiftKey) state.sel.clear();
    for (const id of ids) state.sel.add(id);
    render(); renderProps(); markSel(false);
  });
  // copying a selection gives the code exactly (the line numbers are drawn, not text)
  const posIn = (node: any, off: any) => {
    if (node === view) { const k = Math.min(off, view.children.length - 1), el = view.children[k]; return el ? [+el.dataset.n, off >= view.children.length ? el.textContent.length : 0] : null; }
    const el = (node.nodeType === 3 ? node.parentElement : node).closest('.cl');
    if (!el) return null;
    // (a line's brackets are spans of their own: its text up to the point, whatever holds it)
    const r = document.createRange(); r.setStart(el, 0); r.setEnd(node, off);
    return [+el.dataset.n, r.toString().length];
  };
  view.addEventListener('copy', (e: any) => {
    const S = getSelection();
    if (!S!.rangeCount || S!.isCollapsed) return;
    const R = S!.getRangeAt(0), a = posIn(R.startContainer, R.startOffset), b = posIn(R.endContainer, R.endOffset);
    if (!a || !b) return;
    const lines = tikzText.split('\n').slice(a[0] - 1, b[0]);
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, b[1]); lines[0] = lines[0].slice(a[1]);
    e.clipboardData.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  });
  view.addEventListener('keydown', (e: any) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); const r = document.createRange(); r.selectNodeContents(view); (getSelection())!.removeAllRanges(); (getSelection())!.addRange(r); }
  });
  const taken = () => { tikzBase.set(baseKey(), tikzText); paintTikz(); };
  // one dialog for all the LaTeX out: a picture, a standalone file or the whole document (Document view starts on that)
  function openTikz(scope?: any) {
    finishEdit(); finishPoly(); commit();
    $('#tikzScope').style.display = state.mode === 'page' ? 'none' : '';
    if (state.mode !== 'page') $('#tikzScope').value = scope || (state.mode === 'document' ? 'doc' : $('#tikzScope').value === 'doc' ? 'pic' : $('#tikzScope').value);
    const ttl = $('#modal .modal-head strong'); if (ttl) ttl.textContent = caption(state.mode === 'page' ? captions["ui.latex.for.this.page"] : captions["ui.latex.code.variant1"]);
    $('#tikzSelOnly').checked = false;
    $('#tikzEngine').value = engineFor(state.doc);
    genTikz();
    void offerCompile();
    showModalEl($('#modal'));
    view.focus({ preventScroll: true }); view.scrollTop = 0;
    markSel(true);
  }
  function closeModal() { closeZipMenu(); clearCompiled(); hideModalEl($('#modal')); }
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('pointerdown', (e: any) => { if (e.target.id === 'modal') closeModal(); });
  $('#tikzScope').onchange = genTikz;
  $('#tikzEngine').onchange = () => { genTikz(); void offerCompile(); };
  $('#tikzSelOnly').onchange = genTikz;
  $('#tikzCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(tikzText); } catch (e: any) { const t = document.createElement('textarea'); t.value = tikzText; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    $('#tikzCopy').textContent = uiText("ui.copied", 'Copied');
    setTimeout(() => ($('#tikzCopy').textContent = uiText("ui.copy", 'Copy')), 1200);
    taken();
  };
  $('#tikzDownload').onclick = () => { out(slug() + '.tex', tikzText, 'text/x-tex'); taken(); };

  // ---- Compile: pdfLaTeX in this browser (src/platform/tex-engine.ts), the PDF beside the code, or TeX's errors on
  // their lines. A picture is compiled as the standalone document it would be in; its errors are moved to its lines.
  let compiledUrl = '', compiledPdf: Uint8Array | null = null, compileRun = 0;
  const ENGINE_NAME: Record<TexEngine, string> = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX' };
  const mb = (n: number) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
  const texWhyNot = (s: Extract<TexSupport, { ok: false }>) => s.reason === 'wasm' ? uiText('tex.no.wasm', 'This browser can’t run WebAssembly, which the LaTeX engine needs.')
    : s.reason === 'worker' || s.reason === 'stream' ? uiText('tex.no.browser', 'This browser is too old to run the LaTeX engine.')
    : s.reason === 'memory' ? uiText('tex.no.memory', 'This browser won’t give the LaTeX engine the memory it needs.')
    : s.reason === 'space' ? uiText('tex.no.space', 'There isn’t room in this browser’s storage for the LaTeX engine.')
    : uiText('tex.no.bundle', 'The LaTeX engine isn’t available on this site.');
  // the button says what a first compile downloads, or why this browser can't
  async function offerCompile() {
    const engine = tikzEngine(), b = $('#tikzCompile'), s = await texEngine.support(engine);
    if (engine !== tikzEngine()) return; // the menu changed meanwhile
    b.hidden = !s.ok && s.reason === 'bundle'; // a site without the engine doesn't offer it (the buttons beside it stay put)
    b.disabled = !s.ok;
    b.title = !s.ok ? texWhyNot(s) : s.cached ? uiText('tex.compile.title', 'Compile with {engine} here, in this browser, and see the PDF', { engine: ENGINE_NAME[engine] })
      : uiText('tex.compile.first', 'Compile with {engine} here, in this browser, and see the PDF. The first time downloads the LaTeX engine ({size}), kept for offline use.', { size: mb(s.size), engine: ENGINE_NAME[engine] });
  }
  function clearCompiled() {
    compileRun++;
    if (compiledUrl) { URL.revokeObjectURL(compiledUrl); compiledUrl = ''; compiledPdf = null; }
    const pane = $('#tikzPdfPane');
    if (pane && !pane.hidden) { pane.hidden = true; $('#tikzPdf').removeAttribute('src'); $('#modal .modal-box').classList.remove('with-pdf'); }
    if (tikzStatus) { tikzStatus = undefined; showTikzLint(); }
    const b = $('#tikzCompile'); if (b) { b.disabled = false; b.textContent = uiText('ui.compile', 'Compile'); }
  }
  async function compileTikz() {
    const engine = tikzEngine(), s = await texEngine.support(engine);
    if (!s.ok) { tikzStatus = { kind: 'error', text: texWhyNot(s) }; showTikzLint(); return; }
    clearCompiled();
    const run = compileRun, b = $('#tikzCompile');
    b.disabled = true; b.textContent = uiText('tex.compiling', 'Compiling…');
    const say = (text: string, kind: 'info' | 'warn' | 'error' | 'ok' = 'info') => { if (run === compileRun) { tikzStatus = { kind, text }; showTikzLint(); } };
    say(s.cached ? uiText('tex.compiling', 'Compiling…') : uiText('tex.downloading', 'Downloading the LaTeX engine ({size})…', { size: mb(s.size) }));
    // what is compiled: the dialog's LaTeX; a bare picture inside the standalone document it would be in
    const scope = state.mode === 'page' ? 'page' : $('#tikzScope').value;
    let src = tikzText, shift = 0;
    if (scope === 'pic') {
      const list = $('#tikzSelOnly').checked && state.sel.size ? selected() : shapes();
      src = TD.texImages.collect(() => TD.toTikz(list, { standalone: true, engine })).result;
      const at = (t: string) => t.split('\n').findIndex((l) => l.startsWith('\\begin{tikzpicture}'));
      shift = at(src) - at(tikzText);
    }
    try {
      const entries = await texFiles(tikzFiles, TD.texImages.svgFallback, true); // SVGs as PDFs: nothing calls Inkscape
      const files = Object.fromEntries(entries.map((e: any) => [e.name, e.data]));
      const r = await texEngine.compile(TD.texImages.noInkscape(src), files, {
        engine,
        onProgress: (done, total) => say(uiText('tex.downloadingOf', 'Downloading the LaTeX engine: {done} of {total}…', { done: mb(done), total: mb(total) })),
      });
      if (run !== compileRun) return; // the code changed or the dialog closed meanwhile
      b.disabled = false; b.textContent = uiText('ui.compile', 'Compile');
      if (r.ok && r.pdf) {
        compiledPdf = r.pdf;
        compiledUrl = URL.createObjectURL(new Blob([r.pdf as BlobPart], { type: 'application/pdf' }));
        $('#modal .modal-box').classList.add('with-pdf');
        $('#tikzPdfPane').hidden = false;
        // a browser without a PDF viewer in pages (most phones) offers the PDF to open or save instead
        const inPage = (navigator as any).pdfViewerEnabled !== false;
        $('#tikzPdfNone').hidden = inPage;
        if (inPage) $('#tikzPdf').src = compiledUrl + '#navpanes=0&view=FitH'; // (the viewer's thumbnails take room the page needs)
        say(uiText('tex.done', 'Compiled with {engine} (TeX Live {year}) in {s} s.', { engine: ENGINE_NAME[engine], year: s.texlive, s: (r.ms / 1000).toFixed(1) }), 'ok');
        return;
      }
      if (r.timedOut) { say(uiText('tex.timeout', '{engine} took too long and was stopped. A very large plot or a loop that never ends can do this.', { engine: ENGINE_NAME[engine] }), 'error'); return; }
      // TeX's errors on their lines (those outside the code shown, in the standalone document's own lines, as they are)
      const n = tikzText.split('\n').length, errs = r.errors.map((e) => ({ ...e, at: e.line != null && e.line - shift >= 1 && e.line - shift <= n ? e.line - shift : null }));
      tikzErr = new Map(tikzErr);
      for (const e of errs) if (e.at != null) tikzErr.set(e.at, [...(tikzErr.get(e.at) || []), e.message]);
      tikzLint = [...errs.filter((e) => e.at != null).map((e) => ({ sev: 'error', line: e.at!, msg: e.message })), ...tikzLint];
      paintTikz();
      // a file TeX said it couldn't find (packages probe for files they can do without; those aren't counted)
      const lost = r.missing.filter((f) => /\.(sty|cls|tex)$/.test(f) && errs.some((e) => e.message.includes('`' + f + "'")));
      say(lost.length ? uiText('tex.missing', '{engine} stopped: {files} isn’t among the packages this LaTeX engine has.', { files: lost.join(', '), engine: ENGINE_NAME[engine] })
        : errs.length ? (errs.length === 1 ? (errs[0].at != null ? uiText('tex.error.at', '{engine} stopped on line {n}.', { n: errs[0].at, engine: ENGINE_NAME[engine] }) : uiText('tex.error.one', '{engine} stopped: {msg}', { msg: errs[0].message, engine: ENGINE_NAME[engine] })) : uiText('tex.error.many', '{engine} stopped with {n} errors, marked on their lines.', { n: errs.length, engine: ENGINE_NAME[engine] }))
        : uiText('tex.error.none', '{engine} could not make a PDF of this.', { engine: ENGINE_NAME[engine] }), 'error');
      const lv = $('#tikzOut .cl.err'); if (lv) view.scrollTop = Math.max(0, lv.offsetTop - 48);
    } catch (e: any) {
      if (run !== compileRun) return;
      b.disabled = false; b.textContent = uiText('ui.compile', 'Compile');
      say(uiText('tex.failed', 'The LaTeX engine could not start: {error}', { error: e?.message || String(e) }), 'error');
    }
  }
  $('#tikzCompile').onclick = () => { void compileTikz(); };

  // ---- Print and Export PDF through LaTeX: the file's own LaTeX (what Download .tex gives), compiled here with
  // pdfLaTeX or XeLaTeX, in place of the browser's drawing of it. Chosen each time; As shown is today's.
  /** The engines this browser can compile with (none where the site has no LaTeX bundle). */
  async function texEnginesHere(): Promise<TexEngine[]> {
    const all: TexEngine[] = ['pdflatex', 'xelatex'], ok = await Promise.all(all.map((e) => texEngine.support(e)));
    return all.filter((_, i) => ok[i].ok);
  }
  /** The file's LaTeX for an engine: the document, the page, or the diagram as a standalone document. */
  const fileLatex = (engine: TexEngine) => TD.texImages.collect(() => state.mode === 'page' ? TD.pageToLatex(state.doc, { engine })
    : state.mode === 'document' ? TD.docToLatex(state.doc, { engine }) : TD.toTikz(shapes(), { standalone: true, engine }));
  /** The file compiled with an engine: its PDF, or null once what stopped it has been said. */
  async function compileFile(engine: TexEngine): Promise<Uint8Array | null> {
    finishEdit(); finishPoly(); commit();
    const name = ENGINE_NAME[engine], { result, files } = fileLatex(engine);
    showHint(uiText('tex.compilingWith', 'Compiling with {engine}…', { engine: name }), 0);
    try {
      const entries = await texFiles(files, TD.texImages.svgFallback, true);
      const r = await texEngine.compile(TD.texImages.noInkscape(result), Object.fromEntries(entries.map((e: any) => [e.name, e.data])), {
        engine, onProgress: (done, total) => showHint(uiText('tex.downloadingOf', 'Downloading the LaTeX engine: {done} of {total}…', { done: mb(done), total: mb(total) }), 0),
      });
      if (r.ok && r.pdf) { showHint(''); return r.pdf; }
      const e = r.errors[0];
      showHint(r.timedOut ? uiText('tex.timeout', '{engine} took too long and was stopped. A very large plot or a loop that never ends can do this.', { engine: name })
        : e ? uiText('tex.stoppedOpen', '{engine} stopped: {msg} The LaTeX window (Ctrl+E) shows where.', { engine: name, msg: e.message })
        : uiText('tex.error.none', '{engine} could not make a PDF of this.', { engine: name }), 7000);
      return null;
    } catch (err: any) {
      showHint(uiText('tex.failed', 'The LaTeX engine could not start: {error}', { error: err?.message || String(err) }), 5000);
      return null;
    }
  }
  async function exportTexPdf(engine: TexEngine) {
    const pdf = await compileFile(engine);
    if (pdf) { await out(slug() + '.pdf', pdf as BlobPart, 'application/pdf'); taken(); }
  }
  // The PDF printed: in a hidden frame, through the browser's PDF viewer (WebKit's can't print from a frame, so there
  // it opens in a tab of its own, to print from)
  async function printTexPdf(engine: TexEngine) {
    const pdf = await compileFile(engine);
    if (!pdf) return;
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);
    if (webkit || (navigator as any).pdfViewerEnabled === false) { window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60e3); return; }
    const f = document.createElement('iframe');
    f.className = 'tex-print'; f.setAttribute('aria-hidden', 'true'); f.src = url;
    f.onload = () => { try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { window.open(url, '_blank', 'noopener'); } setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60e3); };
    document.body.append(f);
  }
  $('#tikzPdfOpen').onclick = () => { if (compiledUrl) window.open(compiledUrl, '_blank', 'noopener'); };
  $('#tikzPdfSave').onclick = () => { if (compiledPdf) out(slug() + '.pdf', compiledPdf as BlobPart, 'application/pdf'); };
  $('#tikzZip').onclick = async () => { closeZipMenu(); await downloadLatex(tikzText, tikzFiles, true); taken(); };
  // the split button's menu (the kit's): the two .zip downloads, the first the same as the button
  let zipMenuOpen = false;
  function closeZipMenu() {
    if (!zipMenuOpen) return;
    zipMenuOpen = false;
    $('#tikzZipMore').setAttribute('aria-expanded', 'false');
    if (contextMenuOpen()) closeContextMenu();
  }
  $('#tikzZipMore').onclick = () => {
    if (zipMenuOpen && contextMenuOpen()) { closeZipMenu(); return; }
    const more = $('#tikzZipMore');
    zipMenuOpen = true;
    more.setAttribute('aria-expanded', 'true');
    openContextMenu([
      { act: 'ink', label: uiText('tikz.zip.ink', 'Download .zip: SVG through Inkscape'), title: uiText('tikz.zip.ink.title', 'The SVGs as they are: the svg package has Inkscape convert them when the LaTeX compiles. Needs shell escape and Inkscape; Overleaf has both.') },
      { act: 'pdf', label: uiText('tikz.zip.pdf', 'Download .zip: SVG as PDF, no Inkscape'), title: uiText('tikz.zip.pdf.title', 'Each SVG also comes as a vector PDF made here, and the LaTeX tells the svg package to use it instead of calling Inkscape. Compiles with plain pdflatex.') },
    ], 0, 0, async (act) => { await downloadLatex(tikzText, tikzFiles, true, act === 'pdf'); taken(); },
    { below: $('#tikzZipWrap').getBoundingClientRect(), owner: more, class: 'zip-menu', onclose: () => { zipMenuOpen = false; more.setAttribute('aria-expanded', 'false'); } });
  };

  // ---------------- sample document ----------------
  // The first file a new user sees, a Classic file that opens in Document view: what the app is, its
  // modes and what each is for, then a diagram with one of each kind of object (text, formulae, shapes,
  // a circuit, a quantum circuit, a plot, a commutative diagram), built from each type's own defaults so
  // it stays in step with the library. Text blocks use the Document view's syntax (# heading, - item).
  // Short intro and the modes on top, where people read first; the how-to goes below the diagram.
  const SAMPLE_INTRO = [
    'Draw figures for \\LaTeX\\ and export them as TikZ, SVG, PNG or PDF. Your work saves in this browser as you go.',
    '',
    '# What you can draw',
    '- \\textbf{Text and maths}: labels, formulae and paragraphs typed as \\LaTeX, or in a visual maths editor.',
    '- \\textbf{Lines and arrows}: straight and curved lines, connectors that hold on to shapes, arrows with many heads, curves through points, a curvature pen, polylines, smooth closed curves, arcs, springs, and wavy, double or ticked lines.',
    '- \\textbf{Shapes}: rectangles with rounded or cut corners, circles, polygons, stars, clouds and more basic shapes, 28 flowchart symbols and 28 block arrows.',
    '- \\textbf{Electrical}: a circuit editor with 415 circuitikz parts, common symbols, logic gates and waveforms such as sine, square and sawtooth.',
    '- \\textbf{Physics}: ground, walls and ceilings, blocks, inclines, carts, pulleys and pendulums; lenses, mirrors, prisms, screens, slits, rays and light sources.',
    '- \\textbf{Measuring and guides}: axes, rulers, grids, braces, waves and coil springs that keep their detail when stretched.',
    '- \\textbf{2D plots}: functions, lines, scatter, area, bar and pie charts, contour plots and heatmaps, drawn with pgfplots.',
    '- \\textbf{3D}: surfaces, meshes, 3D scatter, parametric surfaces and space curves; solids such as boxes, cylinders, cones and spheres; solids of revolution with disks, washers and shells; regions for double and triple integrals; and 3D geometry in tikz-3dplot (points, vectors, planes, rotated frames, projections and angles), edited by dragging.',
    '- \\textbf{Blocks}: quantum circuits (quantikz), commutative diagrams (tikz-cd or XyMatrix), trees (forest), graphs (TikZ graphs), ZX diagrams (zx-calculus), Feynman diagrams (tikz-feynman), Bloch spheres (blochsphere), timing diagrams (tikz-timing), state machines (TikZ automata), UML class diagrams (pgf-umlcd), UML sequence diagrams (pgf-umlsd), Karnaugh maps (karnaugh-map), bit fields (bytefield), molecules and reactions (chemfig), laboratory apparatus (tikz-chemlab), 2D geometry (TikZ), tables (booktabs) and computed physics figures.',
    '- \\textbf{Images} and \\textbf{freehand} pencil strokes.',
    '',
    '# Five modes',
    '- \\textbf{Classic}: diagrams arranged with text, like this file. Familiar with Mathcha? Classic mode offers a similar editing workflow.',
    '- \\textbf{Page}: a free-form sheet. Place anything anywhere, for posters and handouts.',
    '- \\textbf{Whiteboard}: an endless canvas for sketching.',
    '- \\textbf{Table}: one table, imported from a spreadsheet or typed in a grid, copied as booktabs \\LaTeX.',
    '- \\textbf{Quick}: one figure without a file: a formula, or any block drawn in its own editor, copied as a PNG, SVG or TikZ.',
  ].join('\n');
  // A short manual, read top to bottom: draw, write maths, use the blocks, arrange, write the document,
  // get the LaTeX out. Keys are spelled out (Cmd on a Mac, Ctrl elsewhere) so the text also compiles.
  const MODK = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
  const key = (k: any) => `\\texttt{${k.replace('Mod', MODK)}}`;
  const SAMPLE_OUTRO = [
    '# How to use',
    '## Draw',
    '1. Pick a tool from the rail on the left. A button with a small corner mark opens a menu when you rest on it: lines, shapes, electrical, physics, \\textbf{2D plots}, \\textbf{3D} and \\textbf{Blocks}.',
    '2. Click on the canvas to place the object, or drag to set its size. Hold ' + key('Shift') + ' to keep angles and squares, ' + key('Alt') + ' to place it off the grid.',
    '3. Choose the arrow tool (' + key('V') + ') to select. The panel on the right edits what is selected: colours, line style, arrow heads, text size and exact position.',
    '- Shortcuts for the common tools: ' + key('L') + ' line, ' + key('A') + ' arrow, ' + key('C') + ' curve, ' + key('P') + ' polyline, ' + key('R') + ' rectangle, ' + key('E') + ' ellipse, ' + key('T') + ' text.',
    '',
    '## Text and maths',
    '- Write maths between \\$ signs, as in \\LaTeX, for example $\\int_0^1 x^2\\,dx = \\tfrac13$. Use \\$\\$ for a displayed formula.',
    '- Double-click any text or label to edit it in place. Under \\textbf{Text input} in the sidebar, choose \\LaTeX\\ source or the visual MathLive editor.',
    '',
    '## Blocks',
    '- Circuits, quantum circuits, commutative diagrams, trees, graphs, ZX and Feynman diagrams, Bloch spheres, 2D and 3D geometry, timing diagrams, state machines, UML, Karnaugh maps, bit fields and chemistry are each drawn from their own \\LaTeX\\ package.',
    '- Double-click a block, or select it and press ' + key('Enter') + ', to open its editor. The drawing and the code beside it stay in step, both ways.',
    '',
    '## Arrange',
    '- Right-click an object for its actions. ' + key('Mod+D') + ' duplicates, ' + key('Mod+G') + ' groups, ' + key('Mod+R') + ' turns by 90 degrees, and the arrow keys nudge.',
    '- Hold ' + key('Space') + ' and drag to pan, or ' + key('Mod') + ' and scroll to zoom. ' + key('G') + ' shows or hides the grid. ' + key('Mod+Z') + ' undoes.',
    '',
    '## Write the document',
    '- In Classic, switch between \\textbf{Document} and \\textbf{Diagram} at the top, or double-click a diagram to draw in it.',
    '- Text is edited in place, as it looks on the page. Start a line with \\texttt{\\#} for a section, \\texttt{-} for a bullet or \\texttt{1.} for a numbered list.',
    '- Your work saves in this browser as you go. ' + key('Mod+S') + ' saves a \\texttt{.diagramtex} file to keep or share, and ' + key('Mod+O') + ' opens one. \\textbf{Import} reads TikZ or \\LaTeX\\ back in.',
    '',
    '## Get the LaTeX out',
    '- \\textbf{LaTeX} (' + key('Mod+E') + ') shows the code to copy or download: the TikZ picture for the diagram (it lists the packages your preamble needs), a standalone file, or the whole document.',
    '- ' + key('Mod+Shift+E') + ' downloads the whole document as a \\texttt{.tex} file straight away (a \\texttt{.zip} with its pictures when it has any).',
    '- \\textbf{Export} saves a PNG, SVG or PDF. ' + key('Mod+P') + ' prints.',
  ].join('\n');
  function sampleBlocks() {
    return applyWelcomeEdits([
      { type: 'text', text: SAMPLE_INTRO },
      { type: 'diagram', shapes: sample() },
      { type: 'diagram', shapes: sampleMore() },
      { type: 'text', text: SAMPLE_OUTRO },
      ...exampleDiagramBlocks(uid),
    ], uid);
  }
  function sample() {
    const s: any[] = [], D = { ...state.defaults, stroke: '#000000', color: '#000000', size: 'normalsize' };
    const add = (type: any, tool: any, o: any) => { const t = TD.TYPES[type]; if (!t) return null; const it = { id: uid(), ...t.create({ x: 0, y: 0 }, D, tool || type), ...o }; s.push(it); return it; };
    const text = (x: any, y: any, t: any, o?: any) => add('text', 'text', { x, y, text: t, ...o });
    const GREY = '#6b6b6b', BLUE = '#1e63c4';
    const head = (x: any, y: any, t: any) => text(x, y, t, { size: 'small', bold: true, color: GREY });
    // (the welcome and how-to lines are text blocks around this diagram: see SAMPLE_INTRO)
    // text and formulae
    head(130, 150, 'TEXT AND FORMULAE');
    text(130, 196, '$\\vec F = q\\left(\\vec E + \\vec v \\times \\vec B\\right)$', { size: 'large' });
    text(130, 252, '$\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$');
    text(130, 304, 'Plain text in \\textbf{bold}, \\textit{italic} or \\texttt{typewriter}', { size: 'small' });
    // shapes and arrows
    head(440, 150, 'SHAPES AND ARROWS');
    // the arrows and the spring are attached (link1/link2: where on the shape, as a fraction of its box), so they follow
    const idea = add('sym', 'sym:rrect', { x: 350, y: 178, w: 76, h: 40, text: 'Idea', fill: '#e8f0fb' });
    const toAsk = add('line', 'line', { x1: 426, y1: 198, x2: 462, y2: 198, startTip: 'none', endTip: 'stealth', label: '' });
    const ask = add('sym', 'sym:diamond', { x: 462, y: 172, w: 60, h: 52, text: '$?$' });
    const toDone = add('line', 'line', { x1: 492, y1: 224, x2: 492, y2: 262, startTip: 'none', endTip: 'stealth', label: '' });
    const done = add('sym', 'sym:rrect', { x: 454, y: 262, w: 76, h: 40, text: 'Done', fill: '#e6f4ea' });
    const ball = add('ball', 'ball', { cx: 372, cy: 282, r: 16 });
    const spring = add('spring', 'spring', { x1: 388, y1: 282, x2: 446, y2: 282 });
    const at = (s: any, u: number, v: number) => s && { id: s.id, u, v };
    if (toAsk) Object.assign(toAsk, { link1: at(idea, 1, 0.5), link2: at(ask, 0, 0.5) });
    if (toDone) Object.assign(toDone, { link1: at(ask, 0.5, 1), link2: at(done, 0.5, 0) });
    if (spring) spring.link1 = at(ball, 1, 0.5);
    // circuit
    head(750, 150, 'CIRCUITS');
    add('cz', 'cz', { x: 690, y: 290 }); // y is the circuit's bottom edge
    // plot
    head(170, 370, 'PLOTS');
    add('plot', 'plot:function', { x: 40, y: 396, w: 260, h: 170 });
    // quantum circuit
    head(500, 370, 'QUANTUM CIRCUITS');
    add('qc', 'qc', { x: 428, y: 410 });
    // commutative diagram
    head(770, 370, 'COMMUTATIVE DIAGRAMS');
    add('cd', 'cd', { x: 730, y: 410 });
    text(440, 620, 'On the canvas, double-click the circuit or the quantum circuit to open its editor.', { size: 'small', color: BLUE });
    return s.filter(Boolean);
  }
  // A second diagram with the rest of the range: physics, optics, waveforms, 3D figures and the other
  // blocks, laid out in the same three columns so the two read as one gallery.
  function sampleMore() {
    const s: any[] = [], D = { ...state.defaults, stroke: '#000000', color: '#000000', size: 'normalsize' };
    const add = (type: any, tool: any, o: any) => {
      const t = TD.TYPES[type]; if (!t) return null;
      const it = { id: uid(), ...t.create({ x: 0, y: 0 }, D, tool || type), ...o };
      if (type === 'sym' && !it.w && t.fix) { t.fix(it); it.x = o.x; it.y = o.y; } // fix centres it on a click; here x,y is the top-left // a library symbol takes its own default size, as when placed by a click
      delete it._pw; delete it._ph; // box-shaped figures keep the size given here
      s.push(it); return it;
    };
    const text = (x: any, y: any, t: any, o: any) => add('text', 'text', { x, y, text: t, ...o });
    const GREY = '#6b6b6b', BLUE = '#1e63c4', RED = '#c0392b';
    const head = (x: any, y: any, t: any) => text(x, y, t, { size: 'small', bold: true, color: GREY });
    const line = (x1: any, y1: any, x2: any, y2: any, o: any) => add('line', 'line', { x1, y1, x2, y2, startTip: 'none', endTip: 'none', label: '', ...o });
    const sym = (k: any, x: any, y: any, o?: any) => add('sym', 'sym:' + k, { x, y, ...o });
    // physics: a cart pushed along the ground, and a pendulum
    head(170, 30, 'PHYSICS');
    sym('p-ground', 40, 170, { w: 260, h: 10 });
    sym('p-cart', 50, 119);
    line(131, 144, 188, 144, { endTip: 'stealth', label: '$\\vec F$' });
    sym('p-pendulum', 212, 46);
    // optics: a point source imaged by a converging lens onto a screen
    head(500, 30, 'OPTICS');
    line(372, 110, 632, 110, { dash: 'dashed', stroke: GREY });
    sym('p-source', 380, 92);
    sym('p-convex', 490, 55);
    sym('p-screen', 610, 55, { w: 10, h: 110 });
    for (const yl of [64, 156]) { line(406, 110, 502, yl, { stroke: RED }); line(502, yl, 610, 110, { stroke: RED, endTip: 'stealth' }); }
    // waveforms
    head(790, 30, 'WAVEFORMS');
    sym('e-sine', 722, 58);
    sym('e-square', 722, 122);
    // 3D: a surface, a solid of revolution cut open, and a see-through cone
    head(170, 230, '3D PLOTS');
    add('plot', 'plot:surface3d', { x: 66, y: 252, w: 230, h: 200 });
    head(500, 230, 'SOLIDS OF REVOLUTION');
    add('revolve', 'revolve:washer', { x: 362, y: 248, w: 276, h: 210 });
    head(790, 230, '3D SOLIDS');
    add('prim3d', 'prim3d:cone', { x: 720, y: 248, w: 150, h: 210, solidColor: '#2f7fc199' });
    // more blocks, each drawn from its own package
    head(150, 500, 'FEYNMAN DIAGRAMS');
    add('feynman', 'feynman', { x: 52, y: 536 });
    head(420, 500, 'TREES');
    add('forest', 'forest', { x: 336, y: 532 });
    head(620, 500, 'ZX-CALCULUS');
    add('zx', 'zx', { x: 560, y: 572 });
    head(800, 500, 'BLOCH SPHERE');
    add('bloch', 'bloch', { x: 740, y: 524 });
    text(470, 720, 'Double-click any block to open its editor. Select a 3D figure to turn it or change it in the panel.', { size: 'small', color: BLUE });
    return s.filter(Boolean);
  }

  // Older files held both diagram blocks and a page sheet. Give each file one kind; a file that
  // used both is split into a Classic file and a Page file.
  function migrateKinds() {
    const idx: any[] = index();
    let changed = false;
    for (const it of [...idx]) {
      if (it.kind) continue;
      const d: any = store.get(LS_DOC + it.id, null);
      changed = true;
      if (!d) { it.kind = 'classic'; continue; }
      const hasSheet = d.sheet && d.sheet.shapes && d.sheet.shapes.length;
      const hasBlocks = (d.blocks || []).some((b: any) => (b.type === 'text' && b.text) || (b.shapes && b.shapes.length)) || (d.shapes && d.shapes.length);
      if (hasSheet && hasBlocks) {
        const id = uid();
        store.set(LS_DOC + id, { kind: 'page', name: (d.name || 'Untitled') + ' (page)', page: d.page, sheet: d.sheet, view: (d.views || {}).page, mode: 'page' });
        idx.push({ id, name: (d.name || 'Untitled') + ' (page)', kind: 'page', updated: Date.now(), created: Date.now() });
      }
      it.kind = hasSheet && !hasBlocks ? 'page' : 'classic';
      if (it.kind === 'page') { d.view = (d.views || {}).page || (d.mode === 'page' ? d.view : null); d.mode = 'page'; }
      else if (d.mode === 'page') { d.mode = 'diagram'; d.view = (d.views || {}).diagram || null; }
      d.kind = it.kind; delete d.sheet; delete d.views;
      if (it.kind === 'page') d.sheet = { pages: 1, shapes: [], ...((store.get(LS_DOC + it.id, {}) as any).sheet || {}) };
      store.set(LS_DOC + it.id, d);
    }
    if (changed) store.set(LS_INDEX, idx);
  }

  // Another tab saved the open file. Without changes here, take its version; with changes here, merge the two
  // (src/core/merge.ts: what only one tab changed comes from that tab, both tabs' new shapes are kept, and where both
  // changed the same thing this tab's wins) and save the result; files that cannot be merged, say so (the next save
  // here replaces it).
  let warnedConflict = '';
  function reloadFromOtherTab() {
    const id = state.docId, d: any = store.get<Record<string, any> | null>(LS_DOC + id, null);
    if (!id || !d || editing || drag) return;
    if (autosave.isDirty()) {
      const base: any = autosave.base(), here = JSON.parse(JSON.stringify({ kind: state.doc.kind, name: state.doc.name, page: state.doc.page, blocks: state.doc.blocks, active: state.doc.active, sheet: state.doc.sheet }));
      const m = base && mergeFile(base, here, JSON.parse(JSON.stringify(d)));
      if (m) {
        // what this tab had before the merge stays in the file's version history
        recovery.take(id, here, Date.now(), true);
        const kind = normKind(d.kind), sel = [...state.sel];
        const theirs = makeDoc(d.name, JSON.parse(JSON.stringify(d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }])), d.active ?? 0, d.page, JSON.parse(JSON.stringify(d.sheet || {})), kind);
        state.doc = makeDoc(m.merged.name, m.merged.blocks || here.blocks, state.doc.active, m.merged.page, m.merged.sheet || here.sheet, kind);
        state.sel = new Set(sel.filter((s) => state.doc.shapes.some((x: any) => x.id === s)));
        state.undo = []; state.redo = []; documentHistory.reset(); // steps made before the merge would undo the other tab's changes too
        autosave.markSynced(theirs); autosave.scheduleSave();
        $('#docName').value = state.doc.name;
        render(); renderProps(); renderDocList(); updateTopbar();
        if (state.mode === 'document' && TD.docview) TD.docview.render();
        showHint(m.clash ? uiText('hint.mergedClash', 'This file was also changed in another tab: its changes are added to yours, and where both tabs changed the same thing, yours are kept.')
          : uiText('hint.merged', 'This file was also changed in another tab: its changes are added to yours.'), 5000);
        return;
      }
      if (warnedConflict !== id) { warnedConflict = id; showHint(uiText('hint.conflict', 'This file was also changed in another tab. Your changes here will replace those when saved.'), 6000); }
      return;
    }
    const kind = normKind(d.kind);
    const fresh = makeDoc(d.name, d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }], d.active ?? 0, d.page, d.sheet, kind);
    if (JSON.stringify(fresh.blocks) === JSON.stringify(state.doc.blocks) && JSON.stringify(fresh.sheet) === JSON.stringify(state.doc.sheet) &&
      fresh.name === state.doc.name && JSON.stringify(fresh.page) === JSON.stringify(state.doc.page)) return;
    state.doc = fresh;
    state.sel.clear(); state.undo = []; state.redo = []; documentHistory.reset();
    autosave.markSynced();
    $('#docName').value = state.doc.name;
    render(); renderProps(); renderDocList(); updateTopbar();
    if (state.mode === 'document' && TD.docview) TD.docview.render();
  }

  // ---------------- init ----------------
  async function init() {
    await labelFontsReady;
    await TD.files.ready; // which files are linked to files on disk
    if (DS) {
      await DS.ready;
      DS.on({
        write: (ok, e: any) => reportSave(ok, !ok && !!e && e.name === 'QuotaExceededError'),
        // another tab changed the file list, or a file: keep the list current
        remote: (k) => {
          if (k === LS_INDEX) renderDocList();
          if (k.startsWith(RECOVERY_KEY)) recovery.stale(k.slice(RECOVERY_KEY.length));
          if (k === LS_DOC + state.docId) reloadFromOtherTab();
        },
        // a tab still running an older version: this one keeps its changes for it, but it should be reloaded
        older: () => showHint(uiText('hint.olderTab', 'DiagramTeX is open in another tab running an older version. Reload that tab to keep working there.'), 8000),
      });
    }
    const prefs: any = store.get(LS_PREFS, null);
    if (prefs) {
      if (['show','locked','off'].includes(prefs.guideMode)) guideMode = prefs.guideMode;
      const savedGridStyle = prefs.gridStyle || prefs.gridStyles?.diagram;
      if (GRID_STYLES.includes(savedGridStyle)) state.gridStyle = savedGridStyle;
      state.grid = prefs.grid ?? true;
      state.snapMode = SNAP_MODES.includes(prefs.snapMode) ? prefs.snapMode : prefs.snap === false ? 'off' : 'both';
      state.snap = state.snapMode !== 'off';
      if (prefs.gridCm >= 0.05 && prefs.gridCm <= 5) state.gridCm = prefs.gridCm;
      Object.assign(state.defaults, prefs.defaults || {});
      if ('bucketFill' in prefs) bucketFill = prefs.bucketFill; else if (prefs.defaults?.fill) bucketFill = clone(prefs.defaults.fill);
      if (prefs.sidebar === false) document.body.classList.add('no-files');
      if (prefs.props === false) setPropsOpen(false);
      if (prefs.layers === false) { $('#layersWin').classList.add('collapsed'); $('#layersToggle').setAttribute('aria-expanded', 'false'); $('#layersToggle').title = uiText('panel.expand', 'Expand panel'); }
    }
    // The document list folds open and shut (CSS). The drawing stays where it is on screen, at the same
    // scale: as the canvas's left edge moves, the view moves the other way by as much, so the list just
    // covers or uncovers the drawing's left side. It draws once at the new size when the fold ends.
    let filesAnim = 0, canvasLeft = 0;
    const holdView = () => {
      if (state.mode === 'document' || inTool()) return;
      const l = stageSize().left;
      state.view.x -= (canvasLeft - l) / state.view.zoom;
      canvasLeft = l;
      applyView();
      renderPageLayer(); // the dimming outside the paper covers the view, which grows each frame
    };
    // A top bar too narrow for its controls scrolls sideways; a plain mouse wheel scrolls it too, and the side with
    // more to see fades and shows a ‹ or › that scrolls it on (the kit's fitToolbar; the bar sheds its labels by its
    // own rules, so not `lean`).
    fitToolbar($('#topbarTools') || $('#topbar'), { lean: false, arrows: true });
    $('#propsHead').onclick = () => { setPropsOpen($('#propsWin').classList.contains('collapsed'), true); savePrefs(); };
    $('#btnSidebar').onclick = () => {
      const b = document.body, done = () => { if (inTool()) return; if (state.mode !== 'document') render(); else TD.docview.render(); };
      cancelAnimationFrame(filesAnim);
      if (state.mode !== 'document') canvasLeft = stageSize().left;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      b.classList.toggle('files-anim', !still);
      b.classList.toggle('no-files');
      savePrefs();
      if (still) { holdView(); done(); return; }
      const end = performance.now() + 280;
      const step = () => {
        holdView();
        if (performance.now() < end) { filesAnim = requestAnimationFrame(step); return; }
        b.classList.remove('files-anim');
        done();
      };
      filesAnim = requestAnimationFrame(step);
    };
    applyGrid();
    migrateKinds();
    const idx = index();
    const last = store.get('diagramtex.last', null);
    purgeBin(); renderBinRow();
    const shared = location.hash.startsWith('#' + SHARE_KEY);
    if (idx.length) {
      const first = idx.find((d) => (d as any).id === last) ? last : (idx[idx.length - 1] as any).id;
      // a file that fails to open must not take the rest of the list with it: try the others, newest first
      for (const id of [first, ...idx.map((d) => (d as any).id).reverse().filter((x: any) => x !== first)]) {
        try { openDoc(id); break; } catch (err) { console.error('Could not open', id, err); state.docId = null; }
      }
      renderDocList();
    }
    else if (!shared) { newDoc('Welcome to DiagramTeX', null, null, sampleBlocks()); zoomFit(); } // the very first visit
    if (shared) await openShared();
    if (!state.docId) { newDoc('Welcome to DiagramTeX', null, null, sampleBlocks()); zoomFit(); } // a broken link and no files
    setTool('select');
    updateTopbar();
    // init awaits labelFontsReady before measuring any drawing. UI and editor
    // fonts can load later; they must not invalidate the drawing's text caches.
    // In particular, inserting formula styles can emit further loadingdone
    // events, turning a blanket font listener into a full-document redraw loop.
  }
  window.addEventListener('beforeunload', (e) => {
    commit(); saveNow();
    // documents save themselves in the browser, but not to a linked file until saved (or written by autosave), and an
    // open block editor's edits don't until Done: for those the browser asks before the page goes
    if (unsavedToDisk() || TD.unsaved.some((f) => { try { return f(); } catch { return false; } })) { e.preventDefault(); e.returnValue = ''; }
  });
  // a tab put away (or closed on a phone, where beforeunload may not come) saves what it has
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { commit(); if (state.docId) saveNow(); } });
  // Sidebar previews are exports of the current model, without canvas hit areas.
  // Stage them separately so offscreen/cull-excluded objects also update without
  // rebuilding the entire Properties or Layers panel (and losing input focus).
  function renderSidebarMath(id: string): void {
    const shape = byId(id); if (!shape) return;
    const escaped = CSS.escape(id);
    const pages = document.querySelectorAll<HTMLElement>(`#props [data-thumb-id="${escaped}"]`);
    const layers = shape.type === 'text' ? [] : document.querySelectorAll<HTMLElement>(`#layers .ly-row[data-id="${escaped}"] .ly-th`);
    const pending: number[] = [];
    if (pages.length) {
      const html = fillDefsAround(() => TYPES[shape.type].svg(shape, { zoom: 1, hit: 0, export: true, scene: shapes() }));
      for (const target of pages) { updateSvg(target, html); target.classList.remove('math-pending'); }
      pending.push(...pendingDependencies(html));
    }
    if (layers.length) {
      thumbs.delete(id); const html = thumb(shape);
      for (const target of layers) { updateSvg(target, html); target.classList.remove('math-pending'); }
      pending.push(...pendingDependencies(html));
    }
    if (pending.length) sidebarPending.set(id, pending); else sidebarPending.delete(id);
  }
  function captureMathPriorities(): void {
    capturedMathPriorities.clear();
    if (inTool() || state.mode === 'document') return;
    const viewport = svg.getBoundingClientRect(), onScreen = new Set<string>();
    for (const element of (content as Element).querySelectorAll<SVGGElement>(':scope > [data-id]')) {
      const rect = element.getBoundingClientRect();
      if (rect.right >= viewport.left && rect.left <= viewport.right && rect.bottom >= viewport.top && rect.top <= viewport.bottom) onScreen.add(element.dataset.id!);
    }
    const G = state.mode === 'page' ? pageGeom() : null, current = G ? currentPage() : -1;
    // Snapshot the old engine's measured geometry before clearing its caches.
    // Page membership must not depend on whether thumbnails are mounted.
    TD.withCachedGeometry(() => TD.math.preview(() => {
      for (const shape of shapes()) {
        let rank = onScreen.has(shape.id) ? 0 : 2;
        if (rank && G) { try { if (pageOf(shape, G) === current) rank = 1; } catch { /* an incomplete edit keeps background priority */ } }
        capturedMathPriorities.set(shape.id, rank);
      }
    }, true));
  }
  function prioritizeCurrentView(): void {
    mathPriorities.clear();
    for (const [id, rank] of capturedMathPriorities) mathPriorities.set(id, rank);
    capturedMathPriorities.clear();
    const scene = shapes();
    // Request visible/current-page dependencies before any top-to-bottom bounds
    // or sidebar pass. Other shapes remain deferred to the ordinary renderer.
    TD.math.preview(() => {
      for (const shape of [...scene].filter(s => !s.hidden && mathPriorities.get(s.id)! < 2).sort((a, b) => mathPriorities.get(a.id)! - mathPriorities.get(b.id)!)) {
        const rank = mathPriorities.get(shape.id)!;
        try {
          const html = TD.math.withPriority(rank, () => fillDefsAround(() => TYPES[shape.type].svg(shape, { zoom: 1, hit: 0, export: true, scene })));
          TD.math.prioritize(pendingDependencies(html), rank);
        } catch { /* the ordinary renderer handles incomplete edits */ }
      }
    });
  }
  function stageSidebarMath(): void {
    const ids = new Set<string>();
    for (const target of document.querySelectorAll<HTMLElement>('#props [data-thumb-id], #layers .ly-th')) {
      if (!target.querySelector('image.svg-label')) continue;
      const id = target.dataset.thumbId || (target.closest('[data-id]') as HTMLElement)?.dataset.id;
      if (id) { ids.add(id); target.querySelectorAll('image.svg-label').forEach(image => image.classList.add('math-pending')); }
    }
    if (!ids.size) return;
    const list = [...ids].sort((a, b) => (mathPriorities.get(a) ?? 2) - (mathPriorities.get(b) ?? 2)), docId = state.docId, engine = TD.math.engine, version = sidebarVersion;
    let index = 0;
    TD.math.trackView(new Promise<void>(resolve => {
      const step = () => {
        if (version !== sidebarVersion || state.docId !== docId || TD.math.engine !== engine || inTool()) { resolve(); return; }
        try { TD.math.preview(() => {
          for (let n = 0; n < 2 && index < list.length; n++) {
            const id = list[index++]; TD.math.withPriority(mathPriorities.get(id) ?? 2, () => renderSidebarMath(id));
          }
        }); } catch (error) { resolve(); throw error; }
        if (index < list.length) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    }));
  }
  TD.math.onProgress(() => TD.math.preview(() => {
    if (inTool()) { changedMathShapes.clear(); return; }
    mathProgressPainting = true;
    try { if (state.mode === 'document') TD.docview?.renderProgress(); else render(); } finally { mathProgressPainting = false; }
    for (const id of changedMathShapes) renderSidebarMath(id);
    changedMathShapes.clear();
  }));
  TD.math.onBeforeChange(captureMathPriorities);
  TD.math.onChange(() => {
    sidebarPending.clear(); changedMathShapes.clear();
    if (inTool()) return;
    if (state.mode === 'document') TD.docview?.beginEngineChange(); else { prioritizeCurrentView(); render(); }
    thumbs.clear(); stageSidebarMath();
    showHint(TD.math.pending ? uiText('engine.loading', 'Rendering {name}… You can keep editing.', { name: TD.math.ENGINES[TD.math.engine].name }) : uiText('hint.mathEngine', 'Maths now rendered with {name}', { name: TD.math.ENGINES[TD.math.engine].name }), 1400);
  });
  TD.math.onReadiness(updateOutputAvailability);
  TD.state = state; // for debugging
  TD.app = {
    undoDocument, noteEdit: () => { fileRedo.length = 0; undoButtons(); }, updateBlockNav,
    outputReady, outputAllowed, updateOutputAvailability,
    printShapes: (list: any[], name?: string) => printVector(shapeSources(list), name),
    // renames the open file, keeping its folder (the document's title is its name)
    renameOpen: (leaf: string) => { renameDoc(state.docId, joinPath(folderOf(state.doc.name), leaf)); renderDocList(); },
    cancelMathViews: () => { sidebarVersion++; sidebarPending.clear(); changedMathShapes.clear(); mathPriorities.clear(); },
    magnifier,
    state, render, renderProps, setActiveBlock, setMode, scheduleSave, saveNow, begin, commit, uid, shapesSvg, zoomFit, openImport,
    parseProject, projectJson, // project files, for the tests
    recovery, restoreRecovery, openRecoveryCopy, saveVersion, openRecovery, // version history, for the tests
    namedSync: syncNamed, styleNameProblem: nameProblem, // named styles, for the tests
    setMacros, takeMacros, // the file's macros (page.macros), for the tests and scripts/snippets/compare.mjs
    showHint, takeIn, takeText, texBundle, texFiles, svgFilePdf, svgVectorPdf, // pictures, code and text from outside (pasted or dropped); LaTeX with its pictures (an SVG as vector PDF)
    setBucketFill: (v: any) => { bucketFill = v; }, // tests
    clearAllHistory: () => { histories.clear(); fileUndo.length = fileRedo.length = 0; state.undo = []; state.redo = []; documentHistory.reset(); updateTopbar(); }, // tests
    newDoc, // tests/bench.mjs
    resetHistory: () => { state.undo = []; state.redo = []; documentHistory.reset(); },
    newSample: () => { newDoc('Welcome to DiagramTeX', null, null, sampleBlocks()); zoomFit(); },
    get slug() { return slug(); },
    get picSlug() { return picSlug(); },
    // pictures of shapes that are not on the canvas (Quick): a standalone SVG, or a PNG at `dpi`
    svgOf: (list: any) => shapesSvg(list, 4),
    defaults: () => state.defaults, // a new shape's style (Quick makes its blocks with them)
    async pngOf(list: any, dpi: any, transparent: any, objectOnly = false) {
      if (!outputReady(objectOnly ? list : undefined)) throw new Error(outputWait());
      const b = TD.bboxOf(list.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 4);
      const inner = shapesSvg(list, 4, false).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      return pngWithDpi(await rasterise({ vb: [b.x, b.y, b.w, b.h], inner }, transparent, dpi), dpi);
    },
    downloadBlob: (name: any, blob: any) => downloadBlob(name, blob),
    svgWithFonts, // a standalone SVG with the maths fonts embedded (Table's SVG download)
    // for the command search (src/ui/services/palette.svelte.ts)
    cmd: {
      runCmd, setMode, setQuick, inQuick, placeOnCanvas, openMenu, ctxAct, fileMode: () => state.mode, setTable, inTable, inTool, setTool, undo, redo, toggleGrid, zoomFit, zoomFitWidth, zoomTo,
      toggleSnap: cycleSnapMode, unsavedToDisk, showSaveState, diskChanged, diskWritten, saveFile, lookAtDisk, writeLinked,
      addPage: () => insertPage(currentPage() + 1), goToPage, currentPage, pageCount: () => pageGeom().n,
      docAction, shareLink, newFolder, openBin, openRecovery, binCount: () => bin().length, openDoc, files: () => index(), leafOf, folderOf, kb, isMac, editMacros,
      canUndo: () => state.undo.length > 0 || canUndoFile(), canRedo: () => state.redo.length > 0 || canRedoFile(),
    },
  };
  // the files are read from IndexedDB first; the loading screen stays up until they are open
  TD.ready = init().catch((e) => { console.error(e); }).then(() => {
    let q = null; try { q = localStorage.getItem(QUICK_KEY); } catch (e: any) { /* storage blocked */ }
    // src/ui/services/quick.ts may still be loading: the page's scripts can still be parsing when the files are read
    if (q) { if (TD.quick) setQuick(true); else document.addEventListener('DOMContentLoaded', () => setQuick(true), { once: true }); }
    let t = null; try { t = localStorage.getItem(TABLE_KEY); } catch (e: any) { /* storage blocked */ }
    if (t && !q) { if (TD.tableWs) setTable(true); else document.addEventListener('DOMContentLoaded', () => setTable(true), { once: true }); }
    // Refresh controller-owned UI captions too. This does not commit or alter document content.
    // AppShell's reactive titles update on the same change: the ones this file sets from state are put back after it
    let localeRun = false;
    onLocale(() => {
      renderDocList(); updateStatus();
      if (!localeRun) { localeRun = true; return; }
      setTimeout(() => {
        showSaveState(); updateTopbar(); updatePageNav();
        for (const id of ['#propsToggle', '#layersToggle']) {
          const b = $(id);
          if (b) b.title = b.getAttribute('aria-expanded') === 'false' ? uiText('panel.expand', 'Expand panel') : caption(captions["ui.collapse.panel"]);
        }
        layersKey = ''; renderLayers(); renderProps();
        renderExpPop();
      });
    });
  });
})();
