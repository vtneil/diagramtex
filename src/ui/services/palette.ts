import { runtime as TD } from '../../runtime';
// Search ("/"): one field that finds tools and shapes, commands (Save, Export, Add Page…), modes and files,
// and runs the one picked. Tools and shapes are read from the toolbar and its menus as they are, so
// anything added there can be found here without a second list; commands and modes are listed below.
(function () {
  'use strict';
  const app = TD.app, C = app.cmd, st = app.state;
  const $ = (s: any) => document.querySelector(s);
  const esc = (t: any) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

  // ---------- what can be found ----------
  const FLY: Record<string, any> = { lines: 'Lines', shapes: 'Shapes', elec: 'Electrical', phys: 'Physics', misc: 'Misc', arrows: 'Block arrows', insertPop: '2D plots', plots3d: '3D plots', figures3d: '3D figures', blocks: 'Blocks' };
  const ICON = (d: any) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  const IC = {
    newdoc: ICON('<path d="M5 2.5h6.5l3.5 3.5v11.5H5z"/><path d="M10 8.5v6M7 11.5h6"/>'),
    open: ICON('<path d="M2.5 5.5v11h13l2-7H5l-2.5 7"/><path d="M2.5 5.5V3.5h5l1.5 2h6v4"/>'),
    save: ICON('<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/>'),
    exp: ICON('<path d="M10 12V3M6.5 6.5L10 3l3.5 3.5"/><path d="M3.5 10v6.5h13V10"/>'),
    tex: ICON('<path d="M7 5l-4 5 4 5M13 5l4 5-4 5"/>'),
    imp: ICON('<path d="M7.5 6V2.5h9v15h-9V14"/><path d="M2 10h8.5M7.5 7l3 3-3 3"/>'),
    print: ICON('<path d="M5.5 7.5V3h9v4.5M5.5 14.5h-3v-7h15v7h-3"/><path d="M5.5 11.5h9v6h-9z"/>'),
    link: ICON('<path d="M8.5 11.5l3-3"/><path d="M7 9.5l-2 2a2.5 2.5 0 003.5 3.5l2-2M13 10.5l2-2A2.5 2.5 0 0011.5 5l-2 2"/>'),
    page: ICON('<path d="M5 2.5h10v15H5z"/><path d="M10 7.5v5M7.5 10h5"/>'),
    undo: ICON('<path d="M7 5L3 9l4 4M3 9h9a4 4 0 010 8h-2"/>'),
    redo: ICON('<path d="M13 5l4 4-4 4M17 9H8a4 4 0 000 8h2"/>'),
    grid: ICON('<path d="M3 3h14v14H3zM3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14"/>'),
    snap: ICON('<path d="M5 3v7a5 5 0 0010 0V3h-3.5v7a1.5 1.5 0 01-3 0V3z"/>'),
    fit: ICON('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'),
    zoom: ICON('<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5l4.5 4.5"/>'),
    rename: ICON('<path d="M3 6h9M3 10h6M3 14h5"/><path d="M11 17l.6-2.6L16 10l2 2-4.4 4.4z"/>'),
    dup: ICON('<path d="M3 3h10v10H3z"/><path d="M7 17h10V7"/>'),
    folder: ICON('<path d="M2.5 4.5h5l1.5 2h8.5v9.5h-15z"/>'),
    del: ICON('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>'),
    side: ICON('<rect x="3" y="4" width="14" height="12"/><path d="M8 4v12"/>'),
    all: ICON('<path d="M3.5 3.5h10l3 3v10h-13z"/><path d="M6.5 3.5v4h6v-4"/>'),
  };
  const modeIcon = (sel: any) => { const b = $(sel); const s = b && b.querySelector('svg'); return s ? s.outerHTML : ''; };
  const kindWord = () => (({ page: 'page', board: 'whiteboard', classic: 'document' }) as Record<string, any>)[st.doc.kind];
  const onCanvas = () => !C.inTool() && st.mode !== 'document';
  const leaveQuick = () => { C.setQuick(false); C.setTable(false); };

  function commands() {
    const kind = st.doc.kind, id = st.docId, linked = TD.files && TD.files.fileOf(id), can = TD.files && TD.files.can;
    const L: any[] = [
      { label: `New ${kindWord()[0].toUpperCase() + kindWord().slice(1)}`, words: 'create blank file add', ic: IC.newdoc, run: () => { leaveQuick(); C.runCmd('new'); } },
      { label: 'New Folder…', words: 'create group organise', ic: IC.folder, run: () => { leaveQuick(); C.newFolder(''); } },
      { label: 'Open File…', words: 'load diagramtex json tex', key: 'Ctrl+O', ic: IC.open, run: () => C.runCmd('open') },
      { label: linked ? `Save to ${linked.name}` : can ? 'Save to File…' : 'Save (Download .diagramtex)', words: 'save write file disk download keep', key: linked ? 'Ctrl+S' : 'Ctrl+Shift+S', ic: IC.save, run: () => C.runCmd('save') },
      ...(can ? [{ label: linked ? 'Save to Another File…' : 'Save to New File…', words: 'save as copy file', ic: IC.save, run: () => C.runCmd('saveas') }] : []),
      { label: 'Copy Share Link', words: 'share url link send copy small', ic: IC.link, run: () => C.shareLink(id) },
      { label: 'Import LaTeX or TikZ…', words: 'paste code tikzpicture import tex', ic: IC.imp, run: () => { leaveQuick(); C.runCmd('import'); } },
      { label: 'Export Image (PNG, SVG, PDF)…', words: 'export picture png svg pdf dpi', ic: IC.exp, when: onCanvas, run: () => C.runCmd('export') },
      { label: kind === 'page' ? 'LaTeX Code…' : 'TikZ Code…', words: 'latex tikz code copy export', key: 'Ctrl+E', ic: IC.tex, when: () => !C.inTool(), run: () => C.runCmd('tikz') },
      { label: 'Download LaTeX Document (.tex)', words: 'export latex tex document download', key: 'Ctrl+Shift+E', ic: IC.tex, when: () => !C.inTool(), run: () => C.runCmd('latex') },
      { label: 'Export Web Page (.html)', words: 'html web page export', ic: IC.exp, when: () => !C.inTool(), run: () => C.runCmd('html') },
      { label: 'Print or Save as PDF…', words: 'print pdf paper', key: 'Ctrl+P', ic: IC.print, when: () => !C.inTool(), run: () => C.runCmd('print') },
      { label: 'Export All Files…', words: 'backup bundle export everything', ic: IC.all, run: () => C.docAction('exportall') },
      { label: 'Add Page', words: 'insert new page after sheet', ic: IC.page, when: () => kind === 'page' && !C.inTool(), run: () => C.addPage() },
      { label: 'Next Page', words: 'page down go', key: 'PgDn', ic: IC.page, when: () => kind === 'page' && !C.inTool() && C.currentPage() < C.pageCount() - 1, run: () => C.goToPage(C.currentPage() + 1) },
      { label: 'Previous Page', words: 'page up go back', key: 'PgUp', ic: IC.page, when: () => kind === 'page' && !C.inTool() && C.currentPage() > 0, run: () => C.goToPage(C.currentPage() - 1) },
      { label: 'Undo', words: 'back revert', key: 'Ctrl+Z', ic: IC.undo, when: () => onCanvas() && C.canUndo(), run: () => C.undo() },
      { label: 'Redo', words: 'again forward', key: 'Ctrl+Shift+Z', ic: IC.redo, when: () => onCanvas() && C.canRedo(), run: () => C.redo() },
      { label: st.grid ? 'Hide Grid' : 'Show Grid', words: 'grid lines toggle', key: 'G', ic: IC.grid, when: onCanvas, run: () => C.toggleGrid() },
      { label: st.snap ? 'Turn Snapping Off' : 'Turn Snapping On', words: 'snap grid points magnet toggle', ic: IC.snap, when: onCanvas, run: () => C.toggleSnap() },
      { label: 'Zoom to Fit', words: 'fit view whole everything', ic: IC.fit, when: onCanvas, run: () => C.zoomFit() },
      { label: 'Zoom to Fit Width', words: 'fit width view', ic: IC.fit, when: onCanvas, run: () => C.zoomFitWidth() },
      { label: 'Actual Size (100%)', words: 'zoom 1:1 reset 100', ic: IC.zoom, when: onCanvas, run: () => C.zoomTo(1) },
      { label: `Rename This ${kindWord()[0].toUpperCase() + kindWord().slice(1)}…`, words: 'rename name title file', ic: IC.rename, when: () => !C.inTool(), run: () => C.docAction('rename', id) },
      { label: 'Move to Folder…', words: 'folder move organise', ic: IC.folder, when: () => !C.inTool(), run: () => C.docAction('move', id) },
      { label: `Duplicate This ${kindWord()[0].toUpperCase() + kindWord().slice(1)}`, words: 'copy duplicate file', ic: IC.dup, when: () => !C.inTool(), run: () => C.docAction('dup', id) },
      { label: document.body.classList.contains('no-files') ? 'Show File List' : 'Hide File List', words: 'sidebar documents files panel toggle', ic: IC.side, run: () => $('#btnSidebar').click() },
      { label: 'Recovery Copies…', words: 'history versions backup restore recover earlier autosave revert lost', ic: IC.undo, when: () => !C.inTool(), run: () => C.docAction('recovery', id) },
      { label: 'Welcome Tour', words: 'help tour guide welcome intro start tutorial onboarding', ic: IC.page, run: () => TD.tour && TD.tour.show() },
      { label: 'Recycle Bin…', words: 'trash deleted restore undelete bin recover', ic: IC.del, run: () => C.openBin() },
      { label: `Move This ${kindWord()[0].toUpperCase() + kindWord().slice(1)} to the Recycle Bin`, words: 'delete remove trash file bin', ic: IC.del, danger: true, when: () => !C.inTool(), run: () => C.docAction('del', id) },
    ];
    return L.filter((c) => !c.when || c.when()).map((c) => ({ ...c, group: 'Operations' }));
  }

  function modes() {
    const cur = C.inQuick() ? 'quick' : C.inTable() ? 'table' : st.mode;
    const L: any[] = [
      { m: 'document', label: 'Classic: Document View', words: 'classic text page view mode', ic: modeIcon('#classicSeg [data-mode="document"]') },
      { m: 'diagram', label: 'Classic: Diagram View', words: 'classic canvas draw view mode', ic: modeIcon('#classicSeg [data-mode="diagram"]') },
      { m: 'page', label: 'Page', words: 'free form paper sheet mode', ic: modeIcon('#kindSeg [data-mode="page"]') },
      { m: 'board', label: 'Whiteboard', words: 'board endless canvas infinite mode', ic: modeIcon('#kindSeg [data-mode="board"]') },
      { m: 'table', label: 'Table', words: 'table tabular spreadsheet csv excel sheets booktabs import latex mode', ic: modeIcon('#kindSeg [data-table]') },
      { m: 'quick', label: 'Quick Formula', words: 'quick formula equation png copy mode', ic: modeIcon('#kindSeg [data-quick]') },
    ].filter((x) => x.m !== cur).map((x) => ({ ...x, group: 'Modes', run: () => { if (x.m === 'quick') C.setQuick(true); else if (x.m === 'table') C.setTable(true); else { leaveQuick(); C.setMode(x.m); } } }));
    const theme = window.TDTheme ? TDTheme.get() : 'system';
    for (const [t, label] of [['system', 'Appearance: Follow the System'], ['light', 'Appearance: Light'], ['dark', 'Appearance: Dark']]) {
      if (t === theme) continue;
      const b = $(`#themeBox [data-theme-pick="${t}"]`);
      L.push({ group: 'Modes', label, words: 'theme dark light colour color appearance', ic: b ? b.querySelector('svg').outerHTML : '', run: () => { if (window.TDTheme && TDTheme.get() !== t) b.click(); } });
    }
    return L;
  }

  // a title such as "Arc by centre (O) — click the centre…" gives the name, the key and the detail
  function fromTitle(t: any) {
    t = String(t || '');
    const key = (/\(([A-Z])\)/.exec(t) || [])[1] || '';
    const cut = t.search(/ \(| — |: /);
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
    for (const b of document.querySelectorAll('.flyout [data-pick], .flyout [data-insert]')) {
      if (b.classList.contains('soon')) continue;
      const fly = b.closest('.flyout'), cat = FLY[fly!.id === 'insertPop' ? 'insertPop' : fly!.id.replace(/^fly-/, '')] || '';
      const text = [...b.childNodes].filter((n: any) => n.nodeType === 3 || n.tagName === 'SPAN').map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const t = fromTitle(tipOf(b) || text);
      const label = text || t.label;
      const sec = b.closest('.sym-grid, .pop-grid')?.previousElementSibling;
      const secName = sec && sec.classList.contains('pop-title') ? sec.firstChild!.textContent!.trim() : '';
      out.push({ group: 'Tools & Shapes', label, key: t.key,
        detail: [cat, secName && secName !== cat ? secName : ''].filter(Boolean).join(' · '),
        words: [(b as HTMLElement).dataset.pick || (b as HTMLElement).dataset.insert, t.detail, cat, secName].join(' '), ic: b.querySelector('svg')?.outerHTML || '', run: () => runTool(b) });
    }
    return out;
  }
  function runTool(b: any) {
    leaveQuick();
    if (st.mode === 'document') C.setMode('diagram');
    b.click(); // the toolbar's own handlers pick the tool (and close any menu)
  }
  function files() {
    const KIND: Record<string, any> = { page: 'Page', board: 'Whiteboard', classic: 'Classic' };
    return C.files().filter((d: any) => d.id !== st.docId).map((d: any) => ({
      group: 'Files', label: C.leafOf(d.name), detail: [C.folderOf(d.name), KIND[d.kind || 'classic']].filter(Boolean).join(' · '), words: d.name,
      ic: ICON('<path d="M5 2.5h6.5l3.5 3.5v11.5H5zM11.5 2.5V6H15"/>'),
      run: () => { leaveQuick(); C.openDoc(d.id); },
    }));
  }

  // ---------- matching ----------
  const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // every word typed must be found; a hit at the start of the name counts most, then at the start of a
  // word in it, anywhere in it, in the details, and last as letters in order (so "bzc" finds "Bézier curve")
  function score(it: any, words: any) {
    const name = norm(it.label), more = norm(it.detail + ' ' + it.words + ' ' + it.group);
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
  root.innerHTML = `<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Search tools and commands">
    <div class="cmdk-field"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5l4.5 4.5"/></svg>
      <input id="cmdkIn" type="text" spellcheck="false" autocomplete="off" placeholder="Search tools, shapes, commands, modes and files" role="combobox" aria-expanded="true" aria-controls="cmdkList" aria-autocomplete="list"></div>
    <div id="cmdkList" class="cmdk-list" role="listbox" aria-label="Results"></div>
    <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>↩</kbd> run</span><span><kbd>esc</kbd> close</span></div></div>`;
  document.body.appendChild(root);
  const box = root.firstElementChild, inp = root.querySelector('#cmdkIn'), list = root.querySelector('#cmdkList');
  let items: any[] = [], shown: any[] = [], cur = 0, prevFocus: any = null;

  function place() {
    // centred over the drawing area: right of the file list, left of the floating panel (as Fit is)
    const main = $('#main').getBoundingClientRect(), files = $('#files').getBoundingClientRect(), rc = $('#rightCol');
    let left = main.left + (files.width > 1 ? files.width : 0), right = main.right;
    if (rc && rc.getClientRects().length && getComputedStyle(rc).visibility !== 'hidden') { const r = rc.getBoundingClientRect(); if (r.width > 1 && r.left > left) right = Math.min(right, r.left); }
    const w = Math.min(560, Math.max(320, right - left - 32));
    (box! as HTMLElement).style.width = w + 'px';
    (box! as HTMLElement).style.left = Math.max(8, Math.min(innerWidth - w - 8, (left + right) / 2 - w / 2)) + 'px';
    (box! as HTMLElement).style.top = Math.max(8, main.top + 48) + 'px';
  }
  function draw() {
    const q = norm((inp! as HTMLInputElement).value).trim(), words = q.split(/\s+/).filter(Boolean);
    if (!words.length) shown = items.filter((x) => x.group !== 'Tools & Shapes' || x.top);
    else shown = items.map((x, i) => ({ x, s: score(x, words), i })).filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || ORDER.indexOf(a.x.group) - ORDER.indexOf(b.x.group) || a.i - b.i).slice(0, 60).map((r) => r.x);
    if (!words.length) shown.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
    cur = Math.min(cur, Math.max(0, shown.length - 1));
    let last: any = null, h = '';
    shown.forEach((x, i) => {
      if (!words.length && x.group !== last) { h += `<div class="cmdk-sec" role="presentation">${esc(x.group)}</div>`; last = x.group; }
      h += `<div class="cmdk-row${i === cur ? ' on' : ''}${x.danger ? ' danger' : ''}" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === cur}">
        <span class="cmdk-ic">${x.ic || ''}</span><span class="cmdk-lb">${esc(x.label)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</span>
        ${words.length ? `<span class="cmdk-grp">${esc(x.group)}</span>` : ''}${x.key ? `<kbd>${esc(C.kb(x.key))}</kbd>` : ''}</div>`;
    });
    list!.innerHTML = h || `<div class="cmdk-empty">Nothing found for “${esc((inp! as HTMLInputElement).value.trim())}”</div>`;
    inp!.setAttribute('aria-activedescendant', shown.length ? 'cmdk-' + cur : '');
    const on = list!.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function open() {
    if (!root.hidden) { (inp! as HTMLInputElement).select(); return; }
    prevFocus = document.activeElement;
    items = [...commands(), ...modes(), ...tools(), ...files()];
    (inp! as HTMLInputElement).value = ''; cur = 0;
    root.hidden = false; root.classList.remove('closing');
    place(); draw();
    (inp! as HTMLElement).focus({ preventScroll: true });
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
    (inp! as HTMLElement).blur();
    close(() => setTimeout(() => x.run(), 0)); // after the box lets go of the keyboard
  }
  inp!.addEventListener('input', () => { cur = 0; draw(); });
  inp!.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e as any).key === 'ArrowDown' || ((e as any).key === 'Tab' && !(e as any).shiftKey) || ((e as any).ctrlKey && (e as any).key === 'n')) { e.preventDefault(); if (shown.length) { cur = (cur + 1) % shown.length; draw(); } }
    else if ((e as any).key === 'ArrowUp' || ((e as any).key === 'Tab' && (e as any).shiftKey) || ((e as any).ctrlKey && (e as any).key === 'p')) { e.preventDefault(); if (shown.length) { cur = (cur - 1 + shown.length) % shown.length; draw(); } }
    else if ((e as any).key === 'PageDown' || (e as any).key === 'PageUp') { e.preventDefault(); cur = Math.max(0, Math.min(shown.length - 1, cur + ((e as any).key === 'PageDown' ? 8 : -8))); draw(); }
    else if ((e as any).key === 'Enter') { e.preventDefault(); run(cur); }
    else if ((e as any).key === 'Escape') { e.preventDefault(); close(); }
  });
  list!.addEventListener('pointermove', (e) => {
    const r = (e.target! as Element).closest('.cmdk-row');
    if (r && +(r as HTMLElement).dataset.i! !== cur) { cur = +(r as HTMLElement).dataset.i!; list!.querySelectorAll('.cmdk-row').forEach((el) => { const on = +(el as HTMLElement).dataset.i! === cur; el.classList.toggle('on', on); el.setAttribute('aria-selected', String(on)); }); inp!.setAttribute('aria-activedescendant', 'cmdk-' + cur); }
  });
  list!.addEventListener('pointerdown', (e) => e.preventDefault()); // the field keeps the focus
  list!.addEventListener('click', (e) => { const r = (e.target! as Element).closest('.cmdk-row'); if (r) run(+(r as HTMLElement).dataset.i!); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) { e.preventDefault(); close(); } });
  window.addEventListener('resize', () => { if (!root.hidden) place(); });

  const typing = (t: any) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable);
  const modalOpen = () => [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el !== box && el.getClientRects().length)
    || !$('#modal').hidden || !$('#importModal').hidden;
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (!root.hidden || typing(e.target) || modalOpen()) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }, true);
  TD.palette = { open, close, get isOpen() { return !root.hidden; } };
})();
