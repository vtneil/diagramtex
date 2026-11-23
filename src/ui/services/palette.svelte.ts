import { flushSync } from 'svelte';
import { runtime as TD } from '../../runtime';
import { t, message as msg, caption, type Message } from '../../i18n';
import { mountFrame } from '../mount-frame';
import CommandSearch, { type CommandSearchModel } from '../CommandSearch.svelte';
// Search ("/"): one field that finds tools and shapes, commands (Save, Export, Add Page…), modes and files,
// and runs the one picked (drawn by src/ui/CommandSearch.svelte). Tools and shapes are read from the toolbar and its menus as they are, so
// anything added there can be found here without a second list; commands and modes are listed below.
(function () {
  'use strict';
  const app = TD.app, C = app.cmd, st = app.state;
  const one = (s: any): any => document.querySelector(s);
  
  // ---------- what can be found ----------
  const FLY: Record<string, Message> = { lines: msg('pal.fly.lines', 'Lines'), shapes: msg('pal.fly.shapes', 'Shapes'), elec: msg('pal.fly.elec', 'Electrical'), phys: msg('ui.physics', 'Physics'), misc: msg('pal.fly.misc', 'Misc'), arrows: msg('ui.block.arrows', 'Block arrows'), insertPop: msg('ui.2d.plots', '2D plots'), plots3d: msg('ui.3d.plots', '3D plots'), figures3d: msg('ui.3d.figures', '3D figures'), blocks: msg('ui.blocks', 'Blocks') };
  // result groups: an English key (ordering) and the caption shown
  const GROUP: Record<string, Message> = { 'Tools & Shapes': msg('pal.group.tools', 'Tools & Shapes'), Operations: msg('pal.group.ops', 'Operations'), Modes: msg('pal.group.modes', 'Modes'), Files: msg('pal.group.files', 'Files') };
  const groupName = (g: string) => caption(GROUP[g] || g);
  // the commands' icons (src/ui/kit/icons.ts)
  const IC = {
    newdoc: 'newFile', open: 'open', save: 'download', exp: 'export', tex: 'source', imp: 'importFile', print: 'print', link: 'link', page: 'addPage',
    undo: 'undo', redo: 'redo', grid: 'grid', snap: 'snap', fit: 'fit', zoom: 'search', rename: 'rename', dup: 'duplicate', folder: 'folder', del: 'delete',
    side: 'sidebar', all: 'exportAll',
  } as const;
  const modeIcon = (sel: any) => { const b = one(sel); const s = b && b.querySelector('svg'); return s ? s.outerHTML : ''; };
  const onCanvas = () => !C.inTool() && st.mode !== 'document';
  const leaveQuick = () => { C.setQuick(false); C.setTable(false); };

  // per file kind: a page, a whiteboard or a classic document
  const byKind = (page: Message, board: Message, classic: Message) => (({ page, board, classic }) as Record<string, Message>)[st.doc.kind] || classic;
  // captions are shown in the interface language; the English stays searchable too
  const shown2 = (L: any[], group: string) => L.filter((c) => !c.when || c.when()).map((c) => ({ ...c, group, label: caption(c.label), words: c.words + ' ' + caption(c.label, 'en') }));

  function commands() {
    const kind = st.doc.kind, id = st.docId, linked = TD.files && TD.files.fileOf(id), can = TD.files && TD.files.can;
    const L: any[] = [
      { label: byKind(msg('pal.newPage', 'New Page'), msg('pal.newWhiteboard', 'New Whiteboard'), msg('pal.newDocument', 'New Document')), words: 'create blank file add', icon: IC.newdoc, run: () => { leaveQuick(); C.runCmd('new'); } },
      { label: msg('pal.newFolder', 'New Folder…'), words: 'create group organise', icon: IC.folder, run: () => { leaveQuick(); C.newFolder(''); } },
      { label: msg('pal.openFile', 'Open File…'), words: 'load diagramtex json tex', key: 'Ctrl+O', icon: IC.open, run: () => C.runCmd('open') },
      { label: linked ? msg('pal.saveTo', 'Save to {name}', { name: linked.name }) : can ? msg('pal.saveToFile', 'Save to File…') : msg('pal.saveDownload', 'Save (Download .diagramtex)'), words: 'save write file disk download keep', key: linked ? 'Ctrl+S' : 'Ctrl+Shift+S', icon: IC.save, run: () => C.runCmd('save') },
      ...(can ? [{ label: linked ? msg('pal.saveAnother', 'Save to Another File…') : msg('pal.saveNew', 'Save to New File…'), words: 'save as copy file', icon: IC.save, run: () => C.runCmd('saveas') }] : []),
      { label: msg('pal.shareLink', 'Copy Share Link'), words: 'share url link send copy small', icon: IC.link, run: () => C.shareLink(id) },
      { label: msg('pal.import', 'Import LaTeX or TikZ…'), words: 'paste code tikzpicture import tex', icon: IC.imp, run: () => { leaveQuick(); C.runCmd('import'); } },
      { label: msg('pal.exportImage', 'Export Image (PNG, SVG, PDF)…'), words: 'export picture png svg pdf dpi', icon: IC.exp, when: onCanvas, run: () => C.runCmd('export') },
      { label: kind === 'page' ? msg('pal.latexCode', 'LaTeX Code…') : msg('pal.tikzCode', 'TikZ Code…'), words: 'latex tikz code copy export', key: 'Ctrl+E', icon: IC.tex, when: () => !C.inTool(), run: () => C.runCmd('tikz') },
      { label: msg('pal.downloadTex', 'Download LaTeX Document (.tex)'), words: 'export latex tex document download', key: 'Ctrl+Shift+E', icon: IC.tex, when: () => !C.inTool(), run: () => C.runCmd('latex') },
      { label: msg('pal.exportHtml', 'Export Web Page (.html)'), words: 'html web page export', icon: IC.exp, when: () => !C.inTool(), run: () => C.runCmd('html') },
      { label: msg('pal.print', 'Print or Save as PDF…'), words: 'print pdf paper', key: 'Ctrl+P', icon: IC.print, when: () => !C.inTool(), run: () => C.runCmd('print') },
      { label: msg('pal.exportAll', 'Export All Files…'), words: 'backup bundle export everything', icon: IC.all, run: () => C.docAction('exportall') },
      { label: msg('pal.addPage', 'Add Page'), words: 'insert new page after sheet', icon: IC.page, when: () => kind === 'page' && !C.inTool(), run: () => C.addPage() },
      { label: msg('pal.nextPage', 'Next Page'), words: 'page down go', key: 'PgDn', icon: IC.page, when: () => kind === 'page' && !C.inTool() && C.currentPage() < C.pageCount() - 1, run: () => C.goToPage(C.currentPage() + 1) },
      { label: msg('pal.prevPage', 'Previous Page'), words: 'page up go back', key: 'PgUp', icon: IC.page, when: () => kind === 'page' && !C.inTool() && C.currentPage() > 0, run: () => C.goToPage(C.currentPage() - 1) },
      { label: msg('pal.undo', 'Undo'), words: 'back revert', key: 'Ctrl+Z', icon: IC.undo, when: () => onCanvas() && C.canUndo(), run: () => C.undo() },
      { label: msg('pal.redo', 'Redo'), words: 'again forward', key: 'Ctrl+Shift+Z', icon: IC.redo, when: () => onCanvas() && C.canRedo(), run: () => C.redo() },
      { label: st.grid ? msg('pal.hideGrid', 'Hide Grid') : msg('pal.showGrid', 'Show Grid'), words: 'grid lines toggle', key: 'G', icon: IC.grid, when: onCanvas, run: () => C.toggleGrid() },
      { label: msg('pal.snapCycle', 'Cycle snapping mode'), words: 'snap grid objects guides anchors points magnet mode cycle', icon: IC.snap, when: onCanvas, run: () => C.toggleSnap() },
      { label: msg('pal.zoomFit', 'Zoom to Fit'), words: 'fit view whole everything', icon: IC.fit, when: onCanvas, run: () => C.zoomFit() },
      { label: msg('pal.zoomFitWidth', 'Zoom to Fit Width'), words: 'fit width view', icon: IC.fit, when: onCanvas, run: () => C.zoomFitWidth() },
      { label: msg('pal.actualSize', 'Actual Size (100%)'), words: 'zoom 1:1 reset 100', icon: IC.zoom, when: onCanvas, run: () => C.zoomTo(1) },
      { label: byKind(msg('pal.renamePage', 'Rename This Page…'), msg('pal.renameWhiteboard', 'Rename This Whiteboard…'), msg('pal.renameDocument', 'Rename This Document…')), words: 'rename name title file', icon: IC.rename, when: () => !C.inTool(), run: () => C.docAction('rename', id) },
      { label: msg('pal.moveToFolder', 'Move to Folder…'), words: 'folder move organise', icon: IC.folder, when: () => !C.inTool(), run: () => C.docAction('move', id) },
      { label: byKind(msg('pal.dupPage', 'Duplicate This Page'), msg('pal.dupWhiteboard', 'Duplicate This Whiteboard'), msg('pal.dupDocument', 'Duplicate This Document')), words: 'copy duplicate file', icon: IC.dup, when: () => !C.inTool(), run: () => C.docAction('dup', id) },
      { label: document.body.classList.contains('no-files') ? msg('pal.showFiles', 'Show File List') : msg('pal.hideFiles', 'Hide File List'), words: 'sidebar documents files panel toggle', icon: IC.side, run: () => one('#btnSidebar').click() },
      { label: msg('pal.recovery', 'Version History…'), words: 'history versions backup restore recover recovery copies earlier autosave revert lost snapshot', icon: IC.undo, when: () => !C.inTool(), run: () => C.docAction('recovery', id) },
      { label: msg('pal.saveVersion', 'Save Version…'), words: 'version snapshot checkpoint name keep history milestone', icon: IC.undo, when: () => !C.inTool(), run: () => C.docAction('saveversion', id) },
      { label: msg('assist.guides', 'Guides'), words: 'guides ruler snap alignment construction', icon: IC.grid, when: () => !C.inTool() && st.mode !== 'document', run: () => C.runCmd('guides') },
      { label: msg('pal.tour', 'Welcome Tour'), words: 'help tour guide welcome intro start tutorial onboarding', icon: IC.page, run: () => TD.tour && TD.tour.show() },
      { label: msg('pal.bin', 'Recycle Bin…'), words: 'trash deleted restore undelete bin recover', icon: IC.del, run: () => C.openBin() },
      { label: byKind(msg('pal.binPage', 'Move This Page to the Recycle Bin'), msg('pal.binWhiteboard', 'Move This Whiteboard to the Recycle Bin'), msg('pal.binDocument', 'Move This Document to the Recycle Bin')), words: 'delete remove trash file bin', icon: IC.del, danger: true, when: () => !C.inTool(), run: () => C.docAction('del', id) },
    ];
    return shown2(L, 'Operations');
  }

  function modes() {
    const cur = C.inQuick() ? 'quick' : C.inTable() ? 'table' : st.mode;
    const L: any[] = shown2([
      { m: 'document', label: msg('pal.mode.document', 'Classic: Document View'), words: 'classic text page view mode', ic: modeIcon('#classicSeg [data-mode="document"]') },
      { m: 'diagram', label: msg('pal.mode.diagram', 'Classic: Diagram View'), words: 'classic canvas draw view mode', ic: modeIcon('#classicSeg [data-mode="diagram"]') },
      { m: 'page', label: msg('ui.page', 'Page'), words: 'free form paper sheet mode', ic: modeIcon('#kindSeg [data-mode="page"]') },
      { m: 'board', label: msg('ui.whiteboard', 'Whiteboard'), words: 'board endless canvas infinite mode', ic: modeIcon('#kindSeg [data-mode="board"]') },
      { m: 'table', label: msg('ui.table', 'Table'), words: 'table tabular spreadsheet csv excel sheets booktabs import latex mode', ic: modeIcon('#kindSeg [data-table]') },
      { m: 'quick', label: msg('pal.mode.quick', 'Quick Formula'), words: 'quick formula equation png copy mode', ic: modeIcon('#kindSeg [data-quick]') },
    ].filter((x) => x.m !== cur), 'Modes').map((x) => ({ ...x, run: () => { if (x.m === 'quick') C.setQuick(true); else if (x.m === 'table') C.setTable(true); else { leaveQuick(); C.setMode(x.m); } } }));
    const theme = window.TDTheme ? TDTheme.get() : 'system';
    const themes: [string, Message][] = [['system', msg('pal.theme.system', 'Appearance: Follow the System')], ['light', msg('pal.theme.light', 'Appearance: Light')], ['dark', msg('pal.theme.dark', 'Appearance: Dark')]];
    for (const [t, label] of themes) {
      if (t === theme) continue;
      const b = one(`#themeBox [data-theme-pick="${t}"]`);
      L.push(...shown2([{ label, words: 'theme dark light colour color appearance', ic: b ? b.querySelector('svg').outerHTML : '', run: () => { if (window.TDTheme && TDTheme.get() !== t) b.click(); } }], 'Modes'));
    }
    return L;
  }

  // a title such as "Arc by centre (O) — click the centre…" gives the name, the key and the detail
  function fromTitle(t: any) {
    t = String(t || '');
    const key = (/\(([A-Z])\)/.exec(t) || [])[1] || '';
    // the name ends at its key, "Rectangle (R)", or at what it does; other brackets are part of it ("Circular arrow (left)")
    const cut = t.search(/ \([A-Z]\)| — |: /);
    const label = (cut > 0 ? t.slice(0, cut) : t).trim();
    const rest = cut > 0 ? t.slice(cut).replace(/^\s*\([A-Z]\)\s*/, '').replace(/^\s*(—|:)\s*/, '').replace(/^\(|\)$/g, '').trim() : '';
    return { label, key, detail: rest };
  }
  // src/ui/services/tooltip.ts moves a title into data-tip (and aria-label) once the page is up
  const tipOf = (b: any) => b.title || b.dataset.tip || b.getAttribute('aria-label') || '';
  function tools() {
    const out = [];
    for (const b of document.querySelectorAll('#tools button[data-tool]')) {
      if (getComputedStyle(b).display === 'none') continue; // Hand: only on a page or a whiteboard
      const t = fromTitle(tipOf(b));
      out.push({ group: 'Tools & Shapes', top: true, label: t.label, key: t.key, detail: t.detail, words: (b as HTMLElement).dataset.tool, ic: b.querySelector('svg')?.outerHTML || '', run: () => runTool(b) });
    }
    for (const b of document.querySelectorAll('.fly-panel [data-pick], .fly-panel [data-insert]')) {
      if (b.classList.contains('soon')) continue;
      const fly = b.closest('.fly-panel'), catM = FLY[fly!.id === 'insertPop' ? 'insertPop' : fly!.id.replace(/^fly-/, '')], cat = catM ? caption(catM) : '', catEn = catM ? caption(catM, 'en') : '';
      const text = [...b.childNodes].filter((n: any) => n.nodeType === 3 || n.tagName === 'SPAN').map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const t = fromTitle(tipOf(b) || text);
      const label = text || t.label; // a tile's own name; its title's (K-map: "Karnaugh map…") is searched too
      const sec = b.closest('.sym-grid, .tile-grid')?.previousElementSibling;
      const secName = sec && sec.classList.contains('pop-title') ? sec.firstChild!.textContent!.trim() : '';
      out.push({ group: 'Tools & Shapes', label, key: t.key,
        detail: [cat, secName && secName !== cat ? secName : ''].filter(Boolean).join(' · '),
        words: [(b as HTMLElement).dataset.pick || (b as HTMLElement).dataset.insert, label !== t.label ? t.label : '', t.detail, cat, catEn, secName].join(' '), ic: b.querySelector('svg')?.outerHTML || '', run: () => runTool(b) });
    }
    return out;
  }
  function runTool(b: any) {
    leaveQuick();
    if (st.mode === 'document') C.setMode('diagram');
    b.click(); // the toolbar's own handlers pick the tool (and close any menu)
  }
  function files() {
    const KIND: Record<string, Message> = { page: msg('ui.page', 'Page'), board: msg('ui.whiteboard', 'Whiteboard'), classic: msg('ui.classic', 'Classic') };
    return C.files().filter((d: any) => d.id !== st.docId).map((d: any) => ({
      group: 'Files', label: C.leafOf(d.name), detail: [C.folderOf(d.name), caption(KIND[d.kind || 'classic'])].filter(Boolean).join(' · '), words: d.name + ' ' + caption(KIND[d.kind || 'classic'], 'en'),
      icon: 'file',
      run: () => { leaveQuick(); C.openDoc(d.id); },
    }));
  }

  // ---------- matching ----------
  const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // every word typed must be found; a hit at the start of the name counts most, then at the start of a
  // word in it, anywhere in it, in the details, and last as letters in order (so "bzc" finds "Bézier curve")
  function score(it: any, words: any) {
    const name = norm(it.label), more = norm(it.detail + ' ' + it.words + ' ' + it.group + ' ' + groupName(it.group));
    let total = 0;
    for (const w of words) {
      let s = 0;
      if (name.startsWith(w)) s = 100;
      else if (new RegExp('(^|[\\s/(:·-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(name)) s = 80;
      else if (name.includes(w)) s = 60;
      else if (more.includes(w)) s = 35;
      else { let i = 0; for (const ch of name) if (ch === w[i]) i++; if (i === w.length && w.length > 1) s = 15; }
      if (!s) return 0;
      total += s;
    }
    return total + (it.key ? 5 : 0) - name.length * 0.05; // a tool with its own key, then shorter names, first among equals
  }
  const ORDER = ['Tools & Shapes', 'Operations', 'Modes', 'Files'];

  // ---------- the search box ----------
  const root = document.createElement('div');
  root.id = 'cmdk'; root.hidden = true;
  document.body.appendChild(root);
  const model: CommandSearchModel = $state({ rows: [], cur: 0, query: '', empty: '', left: 0, top: 0, width: 560 });
  mountFrame(root, CommandSearch, model);
  const box = root.querySelector('.cmdk-box')!, inp = root.querySelector<HTMLInputElement>('#cmdkIn')!, list = root.querySelector('#cmdkList')!;
  let items: any[] = [], shown: any[] = [], words: string[] = [], prevFocus: any = null;

  function place() {
    // centred over the drawing area: right of the file list, left of the floating panel (as Fit is)
    const main = one('#main').getBoundingClientRect(), files = one('#files').getBoundingClientRect(), rc = one('#rightCol');
    let left = main.left + (files.width > 1 ? files.width : 0), right = main.right;
    if (rc && rc.getClientRects().length && getComputedStyle(rc).visibility !== 'hidden') { const r = rc.getBoundingClientRect(); if (r.width > 1 && r.left > left) right = Math.min(right, r.left); }
    const w = Math.min(560, Math.max(320, right - left - 32));
    Object.assign(model, { width: w, left: Math.max(8, Math.min(innerWidth - w - 8, (left + right) / 2 - w / 2)), top: Math.max(8, main.top + 48) });
  }
  // the results for what is typed
  function find() {
    const q = norm(inp.value).trim();
    words = q.split(/\s+/).filter(Boolean);
    if (!words.length) shown = items.filter((x) => x.group !== 'Tools & Shapes' || x.top);
    else shown = items.map((x, i) => ({ x, s: score(x, words), i })).filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || ORDER.indexOf(a.x.group) - ORDER.indexOf(b.x.group) || a.i - b.i).slice(0, 60).map((r) => r.x);
    if (!words.length) shown.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  }
  function draw() {
    model.cur = Math.min(model.cur, Math.max(0, shown.length - 1));
    // browsing: a heading over each group; searching: each result says its group
    model.rows = shown.map((x, i) => ({ label: x.label, detail: x.detail, icon: x.icon, svg: x.ic, key: x.key, danger: x.danger,
      section: !words.length && (i === 0 || shown[i - 1].group !== x.group) ? groupName(x.group) : undefined, group: words.length ? groupName(x.group) : undefined }));
    model.empty = t('pal.empty', 'Nothing found for “{q}”', { q: inp.value.trim() });
    flushSync();
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  const move = (to: number) => { if (!shown.length) return; model.cur = to; draw(); };
  function open() {
    if (!root.hidden) { inp.select(); return; }
    prevFocus = document.activeElement;
    items = [...commands(), ...modes(), ...tools(), ...files()];
    model.query = ''; model.cur = 0; inp.value = '';
    root.hidden = false; root.classList.remove('closing');
    place(); find(); draw();
    inp.focus({ preventScroll: true });
  }
  function close(then?: any) {
    if (root.hidden) return;
    const done = () => { root.hidden = true; root.classList.remove('closing'); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else { root.classList.add('closing'); setTimeout(done, 120); }
    if (then) then();
    else if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  function run(i: any) {
    const x = shown[i];
    if (!x) return;
    inp.blur();
    close(() => setTimeout(() => x.run(), 0)); // after the box lets go of the keyboard
  }
  inp.addEventListener('input', () => { model.cur = 0; find(); draw(); });
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const n = shown.length, cur = model.cur;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move((cur + 1) % n); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move((cur - 1 + n) % n); }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); move(Math.max(0, Math.min(n - 1, cur + (e.key === 'PageDown' ? 8 : -8)))); }
    else if (e.key === 'Enter') { e.preventDefault(); run(cur); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('pointermove', (e) => {
    const r = (e.target as Element).closest<HTMLElement>('.cmdk-row');
    if (r && +r.dataset.i! !== model.cur) { model.cur = +r.dataset.i!; flushSync(); }
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault()); // the field keeps the focus
  list.addEventListener('click', (e) => { const r = (e.target as Element).closest<HTMLElement>('.cmdk-row'); if (r) run(+r.dataset.i!); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) { e.preventDefault(); close(); } });
  window.addEventListener('resize', () => { if (!root.hidden) place(); });

  const typing = (t: any) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable);
  const modalOpen = () => [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el !== box && el.getClientRects().length && !el.closest('.modal-leaving'))
    || !one('#modal').hidden || !one('#importModal').hidden;
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (!root.hidden || typing(e.target) || modalOpen()) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }, true);
  TD.palette = { open, close, get isOpen() { return !root.hidden; } };
})();
