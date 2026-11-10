// DiagramTeX editor: state, interaction, history, properties panel, storage and export.
(function () {
  const TD = window.TD;
  const { TYPES, util } = TD;
  { const v = document.getElementById('appVer'); if (v) { v.textContent = 'v' + TD.VERSION; v.title = `DiagramTeX ${TD.VERSION}: this release on GitLab`; v.href = `https://gitlab.com/igniting-space/diagramtex/-/tags/v${TD.VERSION}`; } }
  const { r2, esc, dist } = util;
  const $ = (s) => document.querySelector(s);
  const svg = $('#canvas'), content = $('#content'), overlay = $('#overlay');
  const PX = TD.PX_PER_CM;
  const fx = (n) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).replace('-', '−');

  const isDrawTool = (t) => !['select', 'hand', 'text', 'math', 'image'].includes(t);
  const toolType = (t) => ({ arrow: 'line', curvearrow: 'curve', blob: 'poly', pencil: 'poly', math: 'text' })[t] || t.split(':')[0];
  const TOOL_KEYS = { v: 'select', h: 'hand', l: 'line', a: 'arrow', c: 'curve', p: 'poly', o: 'arc', s: 'spring', r: 'rect', e: 'ellipse', b: 'ball', d: 'dot', t: 'text', m: 'math', n: 'pencil', i: 'image' };

  // A document is a list of blocks (text paragraphs and diagrams). The canvas edits one diagram
  // block at a time; state.doc.shapes always points at that block's shapes.
  // Three kinds of file: 'classic' (diagram blocks + document view), 'page' (one free-form sheet) and
  // 'board' (a whiteboard: one diagram on an endless canvas, stored like a Classic file with one block).
  const normKind = (k) => (k === 'page' || k === 'board' ? k : 'classic');
  // ids for shapes that have none; older shapes brought up to date (XyMatrix → tikz-cd)
  function fixShape(sh) { if (!sh.id) sh.id = uid(); const t = TD.TYPES[sh.type]; if (t && t.upgrade) t.upgrade(sh); }
  function makeDoc(name, blocks, active, page, sheet, kind) {
    if (!blocks || !blocks.length) blocks = [{ type: 'diagram', shapes: [] }];
    if (!blocks.some((b) => b.type === 'diagram')) blocks.push({ type: 'diagram', shapes: [] });
    for (const b of blocks) if (b.type === 'diagram') { b.shapes = b.shapes || []; for (const sh of b.shapes) fixShape(sh); }
    if (!(blocks[active] && blocks[active].type === 'diagram')) active = blocks.findIndex((b) => b.type === 'diagram');
    // Page mode: one free-form sheet (one or more pages stacked vertically) placed directly on paper.
    sheet = { pages: 1, shapes: [], ...(sheet || {}) };
    for (const sh of sheet.shapes) fixShape(sh);
    const doc = { kind: normKind(kind), name: name || 'Untitled', blocks, active, page: { ...TD.PAGE_DEFAULT, ...(page || {}) }, sheet };
    Object.defineProperty(doc, 'shapes', {
      get() { return doc.kind === 'page' ? doc.sheet.shapes : doc.blocks[doc.active].shapes; },
      set(v) { if (doc.kind === 'page') doc.sheet.shapes = v; else doc.blocks[doc.active].shapes = v; },
      enumerable: false,
    });
    return doc;
  }

  const state = {
    docId: null,
    doc: null,
    mode: 'diagram',
    sel: new Set(),
    tool: 'select',
    view: { x: -60, y: -60, zoom: 1 },
    grid: true,
    gridCm: 0.25, // grid spacing (an app preference, like snap)
    snap: true,
    defaults: { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' },
    undo: [], redo: [],
  };
  state.doc = makeDoc('Untitled');
  let drag = null;       // active pointer interaction
  let polyDraft = null;  // id of polyline being drawn
  let snapHint = null;   // point to show snap indicator
  let marquee = null;
  let spaceDown = false;
  let lastDown = { t: 0, x: 0, y: 0 };
  let clipboard = null;
  let editing = null;    // { id, field }

  function uid() { return Math.random().toString(36).slice(2, 10); }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const shapes = () => state.doc.shapes;
  // shape by id: an index into the shape list, rebuilt when it no longer matches (loops over a large
  // selection call this once per shape, so a scan each time would be quadratic)
  let idList = null, idPos = new Map();
  function byId(id) {
    const L = state.doc.shapes;
    let i = L === idList ? idPos.get(id) : undefined;
    if (i !== undefined && L[i] && L[i].id === id) return L[i];
    idList = L; idPos = new Map();
    for (let k = 0; k < L.length; k++) idPos.set(L[k].id, k);
    i = idPos.get(id);
    return i === undefined ? undefined : L[i];
  }
  const selected = () => state.doc.shapes.filter((s) => state.sel.has(s.id));

  // ---------------- history ----------------
  // An undo step holds only what changed: the changed, added and removed shapes as JSON before and after
  // (with their places in the list), the whole order only when shapes were reordered, and a Page file's
  // page count. The drawing as of the last step is kept as JSON per shape (`base`), so starting an edit
  // costs nothing and finishing one compares shape by shape.
  let pending = false, base = null;
  const owner = () => (state.doc.kind === 'page' ? state.doc.sheet : state.doc.blocks[state.doc.active]);
  function capture() {
    const L = shapes(), json = new Map();
    for (const s of L) json.set(s.id, JSON.stringify(s));
    return { owner: owner(), ids: L.map((s) => s.id), json, pages: state.doc.kind === 'page' ? state.doc.sheet.pages : undefined };
  }
  function begin() {
    if (pending) return;
    pending = true;
    if (!base || base.owner !== owner()) base = capture();
  }
  // the shapes both lists hold, in the same order in each
  function sameOrder(a, inA, b, inB) {
    let i = 0, j = 0;
    for (;;) {
      while (i < a.length && !inB.has(a[i])) i++;
      while (j < b.length && !inA.has(b[j])) j++;
      if (i >= a.length || j >= b.length) return i >= a.length && j >= b.length;
      if (a[i++] !== b[j++]) return false;
    }
  }
  function commit() {
    if (!pending) return;
    pending = false;
    syncLinks();
    const now = capture(), before = [], after = [];
    const posB = new Map(base.ids.map((id, i) => [id, i]));
    now.ids.forEach((id, i) => {
      const j = now.json.get(id), o = base.json.get(id);
      if (o !== j) { after.push([id, j, i]); if (o !== undefined) before.push([id, o, posB.get(id)]); }
    });
    for (const [id, o] of base.json) if (!now.json.has(id)) before.push([id, o, posB.get(id)]);
    const moved = !sameOrder(base.ids, base.json, now.ids, now.json);
    if (before.length || after.length || moved || now.pages !== base.pages) {
      const step = { before, after, size: 64 };
      if (moved) { step.ib = base.ids; step.ia = now.ids; step.size += 12 * (base.ids.length + now.ids.length); }
      if (now.pages !== base.pages) { step.pb = base.pages; step.pa = now.pages; }
      for (const e of before) step.size += e[1].length;
      for (const e of after) step.size += e[1].length;
      state.undo.push(step);
      trimUndo();
      state.redo = [];
      scheduleSave();
    }
    base = now;
    updateTopbar();
  }
  // keep 300 steps, or fewer when they would hold more than ~40 MB of text, but always the last 5
  const UNDO_CHARS = 40e6;
  function trimUndo() {
    if (state.undo.length > 300) state.undo.shift();
    let total = 0;
    for (const u of state.undo) total += u.size;
    while (total > UNDO_CHARS && state.undo.length > 5) total -= state.undo.shift().size;
  }
  // put the drawing back to one side of a step (back: as it was before)
  function applyStep(step, back) {
    const to = back ? step.before : step.after, from = back ? step.after : step.before, order = back ? step.ib : step.ia;
    const toMap = new Map(to.map((e) => [e[0], e[1]])), fromIds = new Set(from.map((e) => e[0]));
    let list;
    if (order) {
      const cur = new Map(shapes().map((s) => [s.id, s]));
      list = order.map((id) => (toMap.has(id) ? JSON.parse(toMap.get(id)) : cur.get(id))).filter(Boolean);
    } else {
      const kept = [];
      for (const s of shapes()) {
        if (toMap.has(s.id)) kept.push(JSON.parse(toMap.get(s.id)));
        else if (!fromIds.has(s.id)) kept.push(s);
      }
      // shapes that come back go in at their old places
      const ins = to.filter((e) => !fromIds.has(e[0])).sort((a, b) => a[2] - b[2]);
      list = [];
      let k = 0;
      for (const s of kept) {
        while (k < ins.length && ins[k][2] <= list.length) list.push(JSON.parse(ins[k++][1]));
        list.push(s);
      }
      while (k < ins.length) list.push(JSON.parse(ins[k++][1]));
    }
    state.doc.shapes = list;
    const pages = back ? step.pb : step.pa;
    if (pages !== undefined) state.doc.sheet.pages = pages;
    if (base && base.owner === owner()) {
      for (const id of fromIds) if (!toMap.has(id)) base.json.delete(id);
      for (const [id, j] of toMap) base.json.set(id, j);
      base.ids = list.map((s) => s.id);
      if (pages !== undefined) base.pages = pages;
    } else base = null;
    for (const id of [...state.sel]) if (!byId(id)) state.sel.delete(id);
    render(); renderProps(); scheduleSave(); updateTopbar();
  }
  function undo() { finishEdit(); finishPoly(); commit(); const st = state.undo.pop(); if (!st) return; applyStep(st, true); state.redo.push(st); }
  function redo() { finishEdit(); commit(); const st = state.redo.pop(); if (!st) return; applyStep(st, false); state.undo.push(st); trimUndo(); }

  // ---------------- storage ----------------
  const LS_INDEX = 'diagramtex.index', LS_DOC = 'diagramtex.doc.', LS_PREFS = 'diagramtex.prefs', LS_CLIP = 'diagramtex.clip';
  // Files and the file list go to IndexedDB when it is available (storage.js); everything else, and every
  // key when it is not, to localStorage.
  const DS = TD.docStore, inDb = (k) => DS && DS.active && DS.owns(k);
  const store = {
    get(k, fb) { try { const v = inDb(k) ? DS.get(k) : localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(k, v) {
      try {
        const t = JSON.stringify(v);
        if (inDb(k)) DS.set(k, t); else { localStorage.setItem(k, t); store.full = false; }
        return true;
      } catch (e) { store.full = !!e && (e.name === 'QuotaExceededError' || e.code === 22); return false; }
    },
    del(k) { try { if (inDb(k)) DS.del(k); else localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const index = () => store.get(LS_INDEX, []);
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!state.docId) return;
    const d = state.doc, isPage = d.kind === 'page';
    const ok = store.set(LS_DOC + state.docId, { kind: d.kind, name: d.name, page: d.page, view: state.view, mode: state.mode,
      ...(isPage ? { sheet: d.sheet } : { blocks: d.blocks, active: d.active }) });
    const idx = index();
    const it = idx.find((x) => x.id === state.docId);
    if (it) { it.name = d.name; it.kind = d.kind; it.updated = Date.now(); } else idx.push({ id: state.docId, name: d.name, kind: d.kind, updated: Date.now() });
    store.set(LS_INDEX, idx);
    // a write to IndexedDB reports itself when it lands (see init)
    if (!ok || !inDb(LS_DOC + state.docId)) reportSave(ok, store.full);
    else showSaveState();
    renderDocList();
  }
  // Saving is continuous, so there is nothing to report while it works: the sidebar says autosave is on.
  // A failure is the only news, shown there and once as a hint (the sidebar may be hidden).
  let saveOk = true, saveFull = false;
  function reportSave(ok, full) {
    const was = !saveOk;
    saveOk = ok; saveFull = full;
    showSaveState();
    if (!ok && !was) showHint(full ? 'Autosave failed: this file is too large for browser storage. Use Save to keep it as a file, or delete files you no longer need.'
      : 'Autosave failed: browser storage is unavailable. Use Save to keep a copy as a file.', 6000);
  }
  // Beside the file name: autosave, or, for a file linked to one on disk, that file's name, marked while the
  // document has changes not yet saved to it.
  function showSaveState() {
    const st = $('#saveState'), f = TD.files.fileOf(state.docId);
    const dirty = !!f && saveOk && !TD.files.isSaved(state.docId, projectJson(state.doc));
    const msg = !saveOk ? (saveFull ? 'Autosave failed: browser storage is full' : 'Autosave failed: browser storage unavailable') : f ? f.name : 'Autosave enabled';
    st.classList.toggle('err', !saveOk);
    st.classList.toggle('linked', saveOk && !!f);
    st.classList.toggle('dirty', dirty);
    if (st.textContent !== msg) st.textContent = msg; // unchanged text is not re-announced
    st.title = !saveOk ? msg // the full message where only "Not saved" fits
      : f ? (dirty ? `Changes not yet saved to ${f.name}. Ctrl+S saves them.` : `Saved to ${f.name}. Ctrl+S saves changes to it.`)
      : 'Every change is saved in this browser as you work';
    const b = $('#topbar [data-cmd="save"]');
    if (b) b.title = f ? `Save to ${f.name} (Ctrl+S)` : TD.files.can ? 'Save to a .diagramtex file on your computer; later saves go to the same file (Ctrl+Shift+S)' : 'Save to a .diagramtex file that you can open again (Ctrl+Shift+S)';
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
  function setPropsOpen(open, animate) {
    foldWin($('#propsWin'), $('#propsToggle'), open, animate, () => { if (!open) $('#props').scrollTop = 0; }, [$('#layersWin')]);
  }
  // Folds or unfolds a side window, easing its height from where it was to where the class change puts it.
  // `also` are windows whose height follows from this one (Layers, whose cap depends on Properties being
  // folded); they ease along in step so nothing jumps. While moving, a window carries `.folding`, which keeps
  // its contents shown so they slide away rather than vanish.
  function foldWin(win, btn, open, animate, after, also = []) {
    const els = [win, ...also].filter((el) => el.offsetParent);
    if (!els.includes(win)) els.unshift(win);
    for (const el of els) if (el._foldEnd) el._foldEnd();
    const from = els.map((el) => el.offsetHeight);
    // a list that scrolls before or after keeps its scroll bar the whole way; one that fits at both ends
    // hides it, so no bar flickers in for the frames where the window is between sizes
    const scroller = (el) => el.querySelector('#props, #layers');
    const overflows = (el) => { const sc = scroller(el); return !!sc && !el.classList.contains('collapsed') && sc.scrollHeight > sc.clientHeight + 1; };
    const scrolled = els.map(overflows);
    win.classList.toggle('collapsed', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.title = open ? 'Collapse panel' : 'Expand panel';
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
      const end = (e) => {
        if (e && e.target !== el) return;
        el.removeEventListener('transitionend', end); el._foldEnd = null;
        el.classList.remove('folding', 'fold-clip'); el.style.transition = el.style.height = '';
      };
      el._foldEnd = end;
      el.addEventListener('transitionend', end);
    });
  }
  function savePrefs() { store.set(LS_PREFS, { grid: state.grid, gridCm: state.gridCm, snap: state.snap, defaults: state.defaults, sidebar: !document.body.classList.contains('no-files'), props: !$('#propsWin').classList.contains('collapsed'), layers: !$('#layersWin').classList.contains('collapsed') }); }

  function openDoc(id) {
    finishEdit(); finishPoly(); commit();
    if (state.docId) saveNow();
    const d = store.get(LS_DOC + id, null);
    if (!d) return;
    state.docId = id;
    const kind = normKind(d.kind);
    state.doc = makeDoc(d.name, d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }], d.active ?? 0, d.page, d.sheet, kind);
    const fit = !(d.view && d.view.zoom > 0);
    if (!fit) state.view = d.view;
    state.sel.clear(); state.undo = []; state.redo = []; base = null;
    $('#docName').value = state.doc.name;
    store.set('diagramtex.last', id);
    store.set('diagramtex.last.' + kind, id);
    applyMode(kind === 'page' || kind === 'board' ? kind : (d.mode === 'document' ? 'document' : 'diagram'), fit);
    render(); renderProps(); renderDocList(); updateTopbar(); showSaveState();
  }
  // Switch the canvas to another diagram block of the current document.
  function setActiveBlock(i) {
    if (!state.doc.blocks[i] || state.doc.blocks[i].type !== 'diagram') return;
    finishEdit(); finishPoly(); commit();
    state.doc.active = i;
    state.sel.clear(); state.undo = []; state.redo = []; base = null;
    render(); renderProps(); updateTopbar(); scheduleSave();
  }
  // Modes: 'page' (Page files), 'board' (Whiteboard files) or 'diagram' / 'document' (the two views of a
  // Classic file). Picking a mode of another kind switches to the last file of that kind (or starts one).
  const kindOf = (m) => (m === 'page' || m === 'board' ? m : 'classic');
  const NEW_NAME = { page: 'Untitled page', board: 'Untitled board', classic: 'Untitled' };
  function setMode(m, quiet) {
    finishEdit(); finishPoly(); commit();
    if (kindOf(m) !== state.doc.kind) { switchKind(kindOf(m), m); return; }
    if (m === state.mode) return;
    applyMode(m, false);
    if (!quiet) scheduleSave();
  }
  function switchKind(kind, m) {
    const idx = index().filter((x) => (x.kind || 'classic') === kind);
    const last = store.get('diagramtex.last.' + kind, null);
    const id = idx.find((x) => x.id === last) ? last : idx.length ? idx[idx.length - 1].id : null;
    if (id) openDoc(id); else newDoc(NEW_NAME[kind], null, null, null, null, kind);
    if (kind === 'classic' && m && m !== state.mode) { applyMode(m, false); scheduleSave(); }
  }
  function applyMode(m, fit) {
    state.mode = m;
    document.body.classList.toggle('mode-doc', m === 'document');
    document.body.classList.toggle('mode-page', m === 'page');
    document.body.classList.toggle('mode-board', m === 'board');
    if (m !== 'board' && state.tool === 'hand') setTool('select'); // the hand tool is a whiteboard's
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    document.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === kindOf(m)));
    if (m === 'document') { if (TD.docview) TD.docview.render(); }
    else requestAnimationFrame(() => (fit ? zoomFit() : render()));
    renderProps();
    updateTopbar();
  }
  function newDoc(name, shapesArr, view, blocks, page, kind, sheet) {
    const id = uid();
    kind = normKind(kind);
    name = name || NEW_NAME[kind];
    // a whiteboard holds one diagram: imported blocks are merged onto it
    if (kind === 'board' && blocks) { shapesArr = blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes || []); blocks = null; }
    store.set(LS_DOC + id, kind === 'page'
      ? { kind, name, page, sheet: sheet || { pages: 1, shapes: [] }, view, mode: 'page' }
      : { kind, name, blocks: blocks || [{ type: 'diagram', shapes: shapesArr || [] }], active: 0, page, view: view || { x: -60, y: -60, zoom: 1 }, mode: kind === 'board' ? 'board' : 'diagram' });
    const idx = index(); idx.push({ id, name, kind, updated: Date.now() }); store.set(LS_INDEX, idx);
    openDoc(id);
    return id;
  }
  async function deleteDoc(id) {
    const it = index().find((d) => d.id === id);
    if (!(await TD.confirm(`Delete "${it ? it.name : 'this file'}"?`, 'It is removed from this browser and cannot be undone.', { ok: 'Delete', danger: true }))) return;
    store.del(LS_DOC + id);
    TD.files.forget(id);
    const idx = index().filter((d) => d.id !== id);
    store.set(LS_INDEX, idx);
    if (id === state.docId) {
      const kind = state.doc.kind;
      state.docId = null;
      const same = idx.filter((d) => (d.kind || 'classic') === kind);
      if (same.length) openDoc(same[same.length - 1].id); else newDoc(null, null, null, null, null, kind);
    }
    renderDocList();
  }
  // The sidebar lists only files of the current kind.
  function renderDocList() {
    const ul = $('#docList'), kind = state.doc.kind;
    $('#filesTitle').textContent = { page: 'Pages', board: 'Whiteboards', classic: 'Classic documents' }[kind];
    $('#btnNewDoc').title = { page: 'New page', board: 'New whiteboard', classic: 'New classic document' }[kind];
    ul.innerHTML = index().filter((d) => (d.kind || 'classic') === kind).map((d) => `<li data-doc="${d.id}" class="${d.id === state.docId ? 'active' : ''}">
      ${kind === 'page' ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 1.5h9v13h-9z" fill="none" stroke="currentColor"/><path d="M6 5h4M6 7.5h2.5" fill="none" stroke="currentColor"/></svg>'
        : kind === 'board' ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M1.5 3.5h13v9h-13z" fill="none" stroke="currentColor"/><path d="M4 9.5c1.5-3 3-3 4 0s2.5 3 4 0" fill="none" stroke="currentColor"/></svg>'
        : '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor"/></svg>'}
      <span class="nm">${esc(d.name)}</span><button class="del" data-del="${d.id}" title="Delete">×</button></li>`).join('');
  }

  // ---------------- view ----------------
  function stageSize() { const r = svg.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
  function toWorld(e) {
    const r = stageSize();
    return { x: (e.clientX - r.left) / state.view.zoom + state.view.x, y: (e.clientY - r.top) / state.view.zoom + state.view.y };
  }
  function toScreen(p) { return { x: (p.x - state.view.x) * state.view.zoom, y: (p.y - state.view.y) * state.view.zoom }; }
  function applyView() {
    const r = stageSize(), v = state.view;
    const w = r.w / v.zoom, h = r.h / v.zoom;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${w} ${h}`);
    svg.style.setProperty('--hitw', 14 / v.zoom + 'px');
    for (const id of ['#paper', '#gridRect']) {
      const el = $(id);
      el.setAttribute('x', v.x); el.setAttribute('y', v.y); el.setAttribute('width', w); el.setAttribute('height', h);
    }
    $('#origin').setAttribute('d', `M${v.x},0H${v.x + w}M0,${v.y}V${v.y + h}`);
    if (state.mode === 'board') dotGrid();
    { const zv = $('#zoomVal'); if (document.activeElement !== zv) zv.value = Math.round(v.zoom * 100) + '%'; }
    updatePageNav();
    drawRulers();
    if (editing) positionEditor();
  }

  // Whiteboard grid: a dot at every major grid line, kept 1.2px on screen; when zoomed out the dots
  // thin out (every 2nd, 4th… line) so they never turn into a grey wash. Snapping is unaffected.
  function dotGrid() {
    const z = state.view.zoom, pat = $('#gridDots');
    let step = TD.GRID * Math.max(1, Math.round(PX / TD.GRID)); // ≈ 1 cm, a whole number of grid steps
    while (step * z < 18) step *= 2;
    for (const [k, v] of [['width', step], ['height', step], ['x', -step / 2], ['y', -step / 2]]) pat.setAttribute(k, v);
    const c = pat.querySelector('circle'); c.setAttribute('cx', step / 2); c.setAttribute('cy', step / 2); c.setAttribute('r', 1.2 / z);
  }
  let navPage = -1;
  function updatePageNav() {
    const nav = $('#pageNav');
    nav.hidden = state.mode !== 'page';
    if (nav.hidden) return;
    const G = pageGeom(), k = currentPage();
    $('#pageNavVal').textContent = `Page ${k + 1} / ${G.n}`;
    $('#pagePrev').disabled = k === 0; $('#pageNext').disabled = k === G.n - 1;
    // keep the highlighted page in the panel in step with scrolling
    if (k !== navPage) { navPage = k; document.querySelectorAll('#props .pg-item').forEach((el) => el.classList.toggle('on', +el.dataset.k === k)); }
  }
  $('#pagePrev').onclick = () => goToPage(currentPage() - 1);
  $('#pageNext').onclick = () => goToPage(currentPage() + 1);
  $('#pageAdd').onclick = () => insertPage(currentPage() + 1);

  // ---------------- rulers: TikZ centimetres along the sheet edges (y up) ----------------
  const RULER = 18;
  let cursorW = null; // last pointer position in world coords
  function rulerStep(pxPerCm) {
    for (const st of [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]) if (st * pxPerCm >= 56) return st;
    return 1000;
  }
  function fmtCm(c) { return String(+c.toFixed(2)).replace('-', '−'); }
  function drawRulers() {
    const rx = $('#rulerX svg'), ry = $('#rulerY svg');
    if (!rx || state.mode === 'document' || state.mode === 'board') return;
    const pageY = state.mode === 'page'; // page mode: y measured downwards from the top of the sheet
    const v = state.view, z = v.zoom, ppc = PX * z, r = stageSize();
    if (r.w <= RULER || r.h <= RULER + 24 || !(z > 0)) return;
    const step = rulerStep(ppc), m = +String(step).replace(/^0\.|0+$/g, '')[0];
    const sub = step / (m === 5 ? 5 : 4);
    const minorOk = sub * ppc >= 5;
    // world cm → ruler-local px
    const X = (c) => (c * PX - v.x) * z - RULER;
    const Y = (c) => (-c * PX - v.y) * z - RULER;
    const span = (lo, hi, f, len) => {
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
    const wX = r.w - RULER, x0 = (v.x + RULER / z) / PX, x1 = (v.x + r.w / z) / PX;
    let h = '';
    if (sb) { const a = (sb.x - v.x) * z - RULER, b = (sb.x + sb.w - v.x) * z - RULER;
      h += `<rect class="span" x="${a}" y="0" width="${b - a}" height="${RULER}"/><path class="span-edge" d="M${Math.round(a) + .5},0V${RULER}M${Math.round(b) + .5},0V${RULER}"/>`; }
    let d = '';
    for (const t of span(x0, x1, X, RULER)) {
      d += `M${t.pos},${RULER}v${-t.len}`;
      if (t.major) h += `<text x="${t.pos + 3}" y="9">${fmtCm(t.c)}</text>`;
    }
    h = `<path class="tk" d="${d}"/>` + h;
    if (cursorW) { const c = Math.round((cursorW.x - v.x) * z - RULER) + .5; h += `<path class="cur" d="M${c},0V${RULER}"/>`; }
    rx.setAttribute('viewBox', `0 0 ${wX} ${RULER}`); rx.innerHTML = h;
    // vertical (TikZ y = −world y / PX)
    const hY = r.h - RULER - 24, yTop = -(v.y + RULER / z) / PX, yBot = -(v.y + r.h / z) / PX;
    h = ''; d = '';
    if (sb) { const a = (sb.y - v.y) * z - RULER, b = (sb.y + sb.h - v.y) * z - RULER;
      h += `<rect class="span" x="0" y="${a}" width="${RULER}" height="${b - a}"/><path class="span-edge" d="M0,${Math.round(a) + .5}H${RULER}M0,${Math.round(b) + .5}H${RULER}"/>`; }
    for (const t of span(yBot, yTop, Y, RULER)) {
      d += `M${RULER},${t.pos}h${-t.len}`;
      if (t.major) h += `<text transform="translate(9 ${t.pos - 3}) rotate(-90)">${fmtCm(pageY ? -t.c : t.c)}</text>`;
    }
    h = `<path class="tk" d="${d}"/>` + h;
    if (cursorW) { const c = Math.round((cursorW.y - v.y) * z - RULER) + .5; h += `<path class="cur" d="M0,${c}H${RULER}"/>`; }
    ry.setAttribute('viewBox', `0 0 ${RULER} ${hY}`); ry.innerHTML = h;
  }
  function updateStatus() {
    const sel = selected(), el = $('#selInfo');
    if (!el) return;
    if (!sel.length) el.textContent = '';
    else { const b = unionBox(sel); el.textContent = `${sel.length} selected · ${r2(b.w / PX)} × ${r2(b.h / PX)} cm`; }
    const gv = $('#gridVal');
    if (document.activeElement !== gv) gv.value = fmtGrid();
    $('#snapInfo').textContent = state.snap ? 'snap on' : 'snap off';
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
  }
  // Standard cursors for handles: edge/corner handles resize along their axis (turned with the shape's
  // rotation, snapped to the four system resize cursors); point handles (ends, vertices, arc ends) move.
  const HANDLE_DIR = { e: 0, ne: 45, n: 90, nw: 135, w: 180, sw: 225, s: 270, se: 315, tw: 0, r: 0 };
  const RESIZE_CUR = ['ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'];
  function handleCursor(s, k) {
    if (!(k in HANDLE_DIR)) return 'move';
    const a = (((HANDLE_DIR[k] + (s.angle || 0)) % 180) + 180) % 180;
    return RESIZE_CUR[Math.round(a / 45) % 4];
  }
  function zoomAt(factor, sx, sy) {
    const v = state.view;
    const nz = Math.min(8, Math.max(state.mode === 'board' ? 0.03 : 0.1, v.zoom * factor));
    const wx = sx / v.zoom + v.x, wy = sy / v.zoom + v.y;
    v.zoom = nz; v.x = wx - sx / nz; v.y = wy - sy / nz;
    renderView();
  }
  function zoomFit() {
    const r = stageSize();
    if (state.mode === 'page') {
      const b = sheetBox(), z = Math.max(0.1, Math.min(3, (r.w - 60) / b.w, (r.h - 60) / Math.min(b.h, pageGeom().h)));
      state.view = { zoom: z, x: b.x + b.w / 2 - r.w / 2 / z, y: Math.min(b.h, pageGeom().h) / 2 - r.h / 2 / z };
      render(); return;
    }
    if (!shapes().length) { state.view = { x: -60, y: -60, zoom: 1 }; render(); return; }
    const b = TD.bboxOf(shapes().flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }));
    const z = Math.max(0.1, Math.min(3, (r.w - 80) / Math.max(b.w, 1), (r.h - 80) / Math.max(b.h, 1)));
    state.view = { zoom: z, x: b.x + b.w / 2 - r.w / 2 / z, y: b.y + b.h / 2 - r.h / 2 / z };
    render();
  }

  // ---------------- snapping ----------------
  function snapPoint(p, e, exclude) {
    if (!state.snap || (e && e.altKey)) return { x: p.x, y: p.y };
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
    const g = TD.GRID;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }


  // ---------------- attached connectors ----------------
  // A line, arrow, curve or spring whose end is dropped on another shape's outline (or on one of its snap
  // points) stays attached, like connectors in PowerPoint or edges in Obsidian Canvas. The end is kept as a
  // position in that shape's frame (link1 / link2 = { id, u, v }: u across, v down) and follows the shape
  // when it moves, resizes or rotates. Moving the connector on its own, or dragging the end off the shape,
  // detaches it; Alt places an end without attaching.
  const CONNECT = new Set(['line', 'curve', 'spring']);
  const END = { p1: ['link1', 'x1', 'y1', 'cx1', 'cy1'], p2: ['link2', 'x2', 'y2', 'cx2', 'cy2'] };
  const ROUND = new Set(['ellipse', 'ball', 'dot', 'pie']);
  let linkHint = null; // id of the shape an end would attach to (outlined while drawing)
  function linkFrame(t) {
    if (!t || CONNECT.has(t.type)) return null;
    if (TD.ROT_TYPES.has(t.type) || t.type === 'sym') { const C = TD.rotFrame(t); if (C) return C; }
    const b = TD.bbox(t);
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  }
  const fromUV = (C, u, v) => ({ x: C[0][0] + u * (C[1][0] - C[0][0]) + v * (C[3][0] - C[0][0]), y: C[0][1] + u * (C[1][1] - C[0][1]) + v * (C[3][1] - C[0][1]) });
  function toUV(C, p) {
    const ax = C[1][0] - C[0][0], ay = C[1][1] - C[0][1], bx = C[3][0] - C[0][0], by = C[3][1] - C[0][1];
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-9) return null;
    const px = p.x - C[0][0], py = p.y - C[0][1];
    return { u: (px * by - py * bx) / det, v: (ax * py - ay * px) / det };
  }
  // the nearest point of the shape's outline, in frame terms, if p's (u, v) lies within tol of it
  function outlineUV(t, C, { u, v }, tol) {
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
  function linkAt(p, q, e, self) {
    if (e && e.altKey) return null;
    const tol = 6 / state.view.zoom, L = shapes();
    for (let i = L.length - 1; i >= 0; i--) {
      const t = L[i];
      if (t.id === self) continue;
      const C = linkFrame(t);
      if (!C) continue;
      if (q && q.anchor && TYPES[t.type].anchors(t).some((a) => dist(a, q) < 1e-6)) { const uv = toUV(C, q); if (uv) return { id: t.id, ...uv }; }
      const uv = toUV(C, p), on = uv && outlineUV(t, C, uv, tol);
      if (on) return { id: t.id, ...on };
    }
    return null;
  }
  const linkPoint = (k) => { const C = linkFrame(byId(k.id)); return C && fromUV(C, k.u, k.v); };
  // put every attached end back on its shape (after anything moved); drops links to shapes that are gone
  function syncLinks() {
    for (const s of shapes()) {
      if (!CONNECT.has(s.type) || !(s.link1 || s.link2)) continue;
      for (const [L, X, Y, CX, CY] of Object.values(END)) {
        if (!s[L]) continue;
        const P = linkPoint(s[L]);
        if (!P) { delete s[L]; continue; }
        const dx = P.x - s[X], dy = P.y - s[Y];
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
        s[X] = P.x; s[Y] = P.y;
        if (s.type === 'curve') { s[CX] += dx; s[CY] += dy; } // the curve keeps its shape near that end
      }
    }
  }
  // connectors moved by themselves let go of shapes that aren't moving with them
  function detachFrom(list, moving) {
    for (const s of list) if (CONNECT.has(s.type)) for (const L of ['link1', 'link2']) if (s[L] && !moving.has(s[L].id)) delete s[L];
  }
  // copies: links to shapes copied alongside point at the copies; links to anything else are dropped
  function remapLinks(made, idmap) {
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
  const pageTop = (k, G = pageGeom()) => k * (G.h + PAGE_GAP);
  function sheetBox() { const G = pageGeom(); return { x: 0, y: 0, w: G.w, h: G.n * G.h + (G.n - 1) * PAGE_GAP }; }
  // which page a shape sits on (by the centre of its bounding box)
  function pageOf(s, G = pageGeom()) { const b = TD.bbox(s); return Math.max(0, Math.min(G.n - 1, Math.floor((b.y + b.h / 2) / (G.h + PAGE_GAP)))); }
  function pageAnchors() {
    const G = pageGeom(), out = [];
    const ml = G.ml * PX, mr = G.w - G.mr * PX, mt = G.mt * PX, mb = G.h - G.mb * PX;
    for (let k = 0; k < G.n; k++) {
      const t = pageTop(k, G);
      for (const x of [0, ml, G.w / 2, mr, G.w]) for (const y of [0, mt, G.h / 2, mb, G.h]) out.push({ x, y: t + y });
    }
    return out;
  }
  function renderPageLayer() {
    const layer = $('#pageLayer'), mask = $('#pageMask');
    if (state.mode !== 'page') { layer.innerHTML = ''; mask.setAttribute('d', ''); $('#pageLabels').innerHTML = ''; return; }
    const G = pageGeom(), z = state.view.zoom;
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
    // dim anything that falls outside the paper
    const v = state.view, r = stageSize(), W = r.w / z, H = r.h / z;
    mask.setAttribute('d', `M${v.x - 10},${v.y - 10}h${W + 20}v${H + 20}h${-(W + 20)}z${holes}`);
  }
  // Page operations. Objects belong to the page under their centre; moving a page moves them with it.
  const pageStep = (G = pageGeom()) => G.h + PAGE_GAP;
  function onPage(k, G) { return shapes().filter((s) => pageOf(s, G) === k); }
  function pageOp(fn) {
    finishEdit(); finishPoly(); commit();
    begin();
    const G = pageGeom();
    if (fn(G) === false) { pending = false; return; }
    state.sel.clear();
    commit(); render(); renderProps(); scheduleSave();
  }
  function insertPage(at) {
    pageOp((G) => {
      if (G.n >= 50) return false;
      for (const s of shapes()) if (pageOf(s, G) >= at) TD.translate(s, 0, pageStep(G));
      state.doc.sheet.pages = G.n + 1;
    });
    goToPage(at);
  }
  async function deletePage(k) {
    const G = pageGeom();
    if (G.n < 2) { showHint('A page file needs at least one page', 1400); return; }
    const lost = onPage(k, G).length;
    if (lost && !(await TD.confirm(`Delete page ${k + 1}?`, `The ${lost} object${lost > 1 ? 's' : ''} on it will be deleted too.`, { ok: 'Delete Page', danger: true }))) return;
    pageOp(() => {
      const keep = [];
      for (const s of shapes()) { const p = pageOf(s, G); if (p === k) continue; if (p > k) TD.translate(s, 0, -pageStep(G)); keep.push(s); }
      state.doc.sheet.shapes = keep;
      state.doc.sheet.pages = G.n - 1;
    });
    goToPage(Math.min(k, G.n - 2));
  }
  function duplicatePage(k) {
    pageOp((G) => {
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
  function movePage(k, dir) {
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
  function goToPage(k) {
    const G = pageGeom(), r = stageSize(), z = state.view.zoom;
    k = Math.max(0, Math.min(G.n - 1, k));
    const visH = r.h / z;
    // show the whole page if it fits, else its top edge
    const y = G.h + 40 / z <= visH ? pageTop(k, G) + G.h / 2 - visH / 2 : pageTop(k, G) - 20 / z;
    state.view = { ...state.view, y };
    render(); if (!state.sel.size) renderProps();
  }
  function pageThumb(k, G) {
    const list = onPage(k, G), t = pageTop(k, G);
    const ctx = { zoom: 1, hit: 0, export: true, scene: shapes() };
    return `<svg viewBox="0 ${r2(t)} ${r2(G.w)} ${r2(G.h)}" preserveAspectRatio="xMidYMid meet">` +
      `<rect x="0" y="${r2(t)}" width="${r2(G.w)}" height="${r2(G.h)}" fill="#fff"/>` +
      fillDefsAround(() => list.map((s) => TYPES[s.type].svg(s, ctx)).join('')) + '</svg>';
  }

  // ---------------- rendering ----------------
  function render() {
    syncLinks();
    if (drag && drag.fast) fastLinks(drag);
    applyView();
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
  function shapeSvg(s, ctx, defs) {
    const key = JSON.stringify(s), m = drawn.get(s.id);
    if (m && m.key === key) { if (m.defs) defs.add(m.defs); return m.html; }
    TD.takeFillDefs();
    const html = `${TYPES[s.type].svg(s, ctx)}`, d = TD.takeFillDefs();
    if (d) defs.add(d);
    if (!TD.measuring() && (s.cross ?? TD.LINE_EXTRA.cross) !== 'hop') drawn.set(s.id, { key, html, defs: d });
    else drawn.delete(s.id);
    return html;
  }
  const painted = new Map(); // shape id → { html, el } as last put in the canvas
  let defsEl = null, defsHtml = '';
  function paintContent(list, strs, defs) {
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
      if (m.html !== strs[i]) { m.el.innerHTML = strs[i]; m.html = strs[i]; }
      if (m.el.classList.contains('locked') !== !!list[i].locked) m.el.classList.toggle('locked', !!list[i].locked);
      if (m.el === cur) cur = cur.nextSibling;
      else content.insertBefore(m.el, cur);
    }
    while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
    if (painted.size > seen.size) for (const id of [...painted.keys()]) if (!seen.has(id)) painted.delete(id);
  }
  // On a large drawing only the shapes in and around the view are in the canvas (the browser repaints every
  // node it holds, on screen or not); a view that leaves that margin paints again.
  const CULL = 400;
  let paintedBox = null;
  function paint() {
    const all = shapes().filter((s) => !s.hidden), ctx = { zoom: 1, hit: 14, scene: all };
    let list, defs, box = null;
    if (all.length > CULL) {
      const r = stageSize(), v = state.view, w = r.w / v.zoom, h = r.h / v.zoom;
      box = { x1: v.x - w, y1: v.y - h, x2: v.x + 2 * w, y2: v.y + 2 * h, z: v.zoom };
    }
    const strs = TD.measureBatch(() => {
      defs = new Set();
      list = box ? all.filter((s) => { const b = TD.bbox(s); return b.x <= box.x2 && b.x + b.w >= box.x1 && b.y <= box.y2 && b.y + b.h >= box.y1; }) : all;
      return list.map((s) => shapeSvg(s, ctx, defs));
    });
    paintContent(list, strs, [...defs].join(''));
    paintedBox = box;
    if (drawn.size > all.length + 200) { const ids = new Set(all.map((s) => s.id)); for (const id of [...drawn.keys()]) if (!ids.has(id)) drawn.delete(id); }
  }
  // the view still lies inside what was painted
  function viewPainted() {
    const b = paintedBox;
    if (!b) return shapes().length <= CULL;
    const r = stageSize(), v = state.view;
    return v.x >= b.x1 && v.y >= b.y1 && v.x + r.w / v.zoom <= b.x2 && v.y + r.h / v.zoom <= b.y2 && v.zoom <= b.z * 3; // zoomed far in: paint fewer
  }
  // Only the view moved (pan, zoom): the drawing stays as it is.
  function renderView() {
    applyView();
    if (!viewPainted()) paint();
    renderPageLayer();
    renderOverlay();
  }
  function renderOverlay() {
    pruneSel();
    const z = state.view.zoom, out = [];
    const sel = selected();
    const pb = paintedBox;
    for (const s of sel) {
      const b = TD.bbox(s);
      if (pb && (b.x > pb.x2 || b.x + b.w < pb.x1 || b.y > pb.y2 || b.y + b.h < pb.y1)) continue; // off screen
      out.push(`<rect class="sel-box" x="${b.x - 3 / z}" y="${b.y - 3 / z}" width="${b.w + 6 / z}" height="${b.h + 6 / z}"/>`);
    }
    const groups = new Map();
    for (const s of sel) if (s.g) (groups.get(s.g) || groups.set(s.g, []).get(s.g)).push(s);
    for (const m of groups.values()) {
      const b = unionBox(m);
      out.push(`<rect class="grp-box" x="${b.x - 7 / z}" y="${b.y - 7 / z}" width="${b.w + 14 / z}" height="${b.h + 14 / z}"/>`);
    }
    if (sel.length === 1 && !polyDraft) {
      const s = sel[0], t = TYPES[s.type];
      if (t.guides) for (const g of t.guides(s)) out.push(`<line class="guide" x1="${g[0]}" y1="${g[1]}" x2="${g[2]}" y2="${g[3]}"/>`);
      if (s.type === 'poly') {
        // small "+" at the middle of each segment: drag it to add a point there
        const P = s.pts, n = s.closed ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) {
          const a = P[i], b = P[(i + 1) % P.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) * z < 28) continue;
          out.push(`<g class="addpt" data-addpt="${i}" data-hid="${s.id}"><circle cx="${mx}" cy="${my}" r="${5 / z}"/><path d="M${mx - 2.6 / z} ${my}h${5.2 / z}M${mx} ${my - 2.6 / z}v${5.2 / z}"/></g>`);
        }
      }
      for (const h of t.handles(s)) {
        const cur = handleCursor(s, h.k);
        if (h.ctrl) out.push(`<circle class="handle ctrl" data-handle="${h.k}" data-hid="${s.id}" cx="${h.x}" cy="${h.y}" r="${4 / z}" style="cursor:${cur}"/>`);
        else {
          const q = 3.75 / z, on = s.type === 'poly' && state.vertex && state.vertex.id === s.id && 'v' + state.vertex.i === h.k;
          const lk = CONNECT.has(s.type) && END[h.k] && s[END[h.k][0]];
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
        const P = ROUND.has(t.type) ? Array.from({ length: 48 }, (_, i) => fromUV(C, 0.5 + 0.5 * Math.cos((i * Math.PI) / 24), 0.5 + 0.5 * Math.sin((i * Math.PI) / 24)))
          : C.map(([x, y]) => ({ x, y }));
        out.push(`<polygon class="link-hint" points="${P.map((q) => `${r2(q.x)},${r2(q.y)}`).join(' ')}"/>`);
      }
    }
    if (snapHint) {
      const r = (snapHint.anchor ? 6 : 3) / z;
      out.push(`<circle class="snap-ind" cx="${snapHint.x}" cy="${snapHint.y}" r="${r}"/>`);
    }
    if (layerHover) {
      const hs = layerHover.map(byId).filter((q) => q && !q.hidden);
      if (hs.length) { const b = unionBox(hs); out.push(`<rect class="layer-hover" x="${b.x - 4 / z}" y="${b.y - 4 / z}" width="${b.w + 8 / z}" height="${b.h + 8 / z}"/>`); }
    }
    overlay.innerHTML = out.join('');
    drawRulers(); updateStatus(); scheduleLayers();
  }

  // ---------------- moving a large selection ----------------
  // Dragging many shapes does not touch them until the drop: their painted elements slide together by a
  // CSS translate, the selection outline slides with them, and only the connectors attached from outside
  // are redrawn as they go. On release every shape moves once, for real.
  const FAST_DRAG = 200;
  function startFastMove(d) {
    d.fast = true;
    d.off = { dx: 0, dy: 0 };
    for (const id of state.sel) { const m = painted.get(id); if (m) m.el.classList.add('mv'); }
    // connectors outside the selection with an end on a moving shape, with where those ends are now
    d.ext = [];
    for (const s of shapes()) {
      if (state.sel.has(s.id) || !CONNECT.has(s.type) || !(s.link1 || s.link2)) continue;
      const ends = [];
      for (const [L, X, Y, CX, CY] of Object.values(END)) if (s[L] && state.sel.has(s[L].id)) ends.push([X, Y, CX, CY, s[X], s[Y], s[CX], s[CY]]);
      if (ends.length) d.ext.push({ s, ends });
    }
  }
  function fastMove(d, dx, dy) {
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
  function fastLinks(d) {
    const { dx, dy } = d.off;
    for (const { s, ends } of d.ext) for (const [X, Y, CX, CY, x, y, cx, cy] of ends) {
      s[X] = x + dx; s[Y] = y + dy;
      if (s.type === 'curve') { s[CX] = cx + dx; s[CY] = cy + dy; }
    }
  }
  function endFastMove(d) {
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
  function setTool(t) {
    finishPoly();
    if (t === 'image') { $('#imageInput').value = ''; $('#imageInput').click(); t = 'select'; }
    state.tool = t;
    document.querySelectorAll('#tools button[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    document.querySelectorAll('#tools button[data-fly]').forEach((b) => b.classList.toggle('active', flyOf(t) === b.dataset.fly));
    svg.classList.toggle('tool-draw', isDrawTool(t));
    svg.classList.toggle('tool-text', t === 'text' || t === 'math');
    svg.classList.toggle('tool-hand', t === 'hand');
    $('#emptyHint').hidden = shapes().length > 0 || t !== 'select';
    snapHint = null;
    const sym = t.startsWith('sym:') && TD.SYMS[t.slice(4)];
    showHint(t === 'poly' ? 'Click to add points · double-click / Enter to finish · click first point to close'
      : t === 'blob' ? 'Click to add points of a smooth closed curve · double-click / Enter to finish'
      : t === 'pencil' ? 'Draw freehand · end near the start to close · Esc when done'
      : sym ? `${sym.name}: click to place, or drag to set the size (Shift keeps it square)`
      : /^(plot|pie|cd|qc|cz|forest|zx|bloch)/.test(t) ? 'Click to place, or drag to set the size' : '');
    renderOverlay();
  }

  // ---------------- tool flyouts (lines / shapes / misc / arrows / plots) ----------------
  const LINE_TOOLS = [
    ['line', 'Line (L)', '<path d="M4 12h26"/>'], ['curve', 'Bézier curve (C)', '<path d="M4 16C10 2 20 22 30 8"/>'],
    ['arrow', 'Arrow (A)', '<path d="M4 12h24M23 7l6 5-6 5"/>'], ['curvearrow', 'Curved arrow', '<path d="M4 16C10 4 18 20 27 9M22 8l6 0-1 6"/>'],
    ['poly', 'Polyline / polygon (P)', '<path d="M5 19l5-14 9 10 9-11"/>'], ['blob', 'Smooth closed curve', '<path d="M8 6c6-4 18-3 20 4s-4 10-10 9-15 0-14-6 1-5 4-7z"/>'],
    ['arc', 'Arc / angle (O)', '<path d="M5 19h24M5 19l14-13M14 19a9 9 0 00-2.7-6.4"/>'], ['spring', 'Spring (S)', '<path d="M2 12h5l2-6 4 12 4-12 4 12 4-12 2 6h5"/>'],
  ];
  const MISC_EXTRA = [
    ['ball', 'Shaded ball (B)', '<circle cx="17" cy="12" r="7" class="ballic"/>'], ['dot', 'Dot (D)', '<circle cx="17" cy="12" r="3" class="f"/>'],
    ['rect', 'Rectangle (R) — plain TikZ rectangle', '<rect x="6" y="5" width="22" height="14"/>'], ['ellipse', 'Ellipse (E) — plain TikZ ellipse', '<ellipse cx="17" cy="12" rx="11" ry="7"/>'],
  ];
  const btn = (tool, title, icon) => `<button data-pick="${tool}" title="${esc(title)}">${icon}</button>`;
  const symBtns = (cat) => TD.SYM_CATS[cat].map((k) => btn('sym:' + k, TD.SYMS[k].name, TD.symIcon(k))).join('');
  const sec = (title, inner) => (title ? `<div class="pop-title">${title}</div>` : '') + `<div class="sym-grid">${inner}</div>`;
  $('#fly-lines').innerHTML = sec('', LINE_TOOLS.map(([t, n, d]) => btn(t, n, `<svg viewBox="0 0 34 24">${d}</svg>`)).join(''));
  $('#fly-shapes').innerHTML = sec('Rectangles', symBtns('rect')) + sec('Basic shapes', symBtns('basic')) + sec('Flowchart', symBtns('flow'));
  $('#fly-misc').innerHTML = sec('Misc', symBtns('misc') + MISC_EXTRA.map(([t, n, d]) => btn(t, n, `<svg viewBox="0 0 34 24">${d}</svg>`)).join('')) ;
  $('#fly-arrows').innerHTML = sec('', symBtns('arrow'));
  // electrical: the common symbols and waveforms here, the full circuitikz library in the Circuit block
  $('#fly-elec').innerHTML = `<div class="pop-grid cz-entry"><button data-insert="cz" title="A circuit drawn with circuitikz parts: about 250 components, wires that snap to pins"><svg viewBox="0 0 32 24"><path d="M4 18V6h7M21 6h7v12H4"/><path d="M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3" class="c1"/><path d="M14 18v-3M18 18v-3" class="c1"/><path d="M12 15h8M12 21h8" class="c1"/></svg>Circuit…</button><div class="help">Every circuitikz part, wired on a grid and exported as circuitikz.</div></div>`
    + sec('Symbols', symBtns('elec')) + sec('Waveforms', symBtns('wave'));
  function flyOf(t) {
    if (/^(plot|pie)/.test(t)) return 'insertPop';
    if (/^(cd|qc|cz|forest|zx|bloch)$/.test(t)) return 'blocks';
    if (LINE_TOOLS.some((x) => x[0] === t)) return 'lines';
    if (MISC_EXTRA.some((x) => x[0] === t)) return 'misc';
    if (t.startsWith('sym:')) { const c = (TD.SYMS[t.slice(4)] || {}).cat; return c === 'elec' || c === 'wave' ? 'elec' : c === 'misc' ? 'misc' : c === 'arrow' ? 'arrows' : 'shapes'; }
    return null;
  }
  const flyEl = (name) => $(name === 'insertPop' ? '#insertPop' : '#fly-' + name);
  let openFly = null;
  function showFly(name) {
    if (openFly && openFly !== name) flyEl(openFly).hidden = true;
    openFly = name; closeCtx();
    const el = flyEl(name), b = $(`#tools [data-fly="${name}"]`).getBoundingClientRect();
    el.hidden = false;
    el.style.left = b.right + 6 + 'px';
    el.style.top = Math.max(8, Math.min(b.top - 6, innerHeight - el.offsetHeight - 10)) + 'px';
    document.querySelectorAll('#tools [data-fly]').forEach((x) => x.classList.toggle('open', x.dataset.fly === name));
  }
  function hideFly() {
    clearTimeout(flyTimer); flyPinned = false;
    if (!openFly) return;
    flyEl(openFly).hidden = true; openFly = null;
    document.querySelectorAll('#tools [data-fly]').forEach((x) => x.classList.remove('open'));
  }
  // A mouse resting on a tool group opens its menu (after a moment, so sweeping down the rail doesn't flash
  // every one); it closes once the mouse has been off both the button and the menu for a moment, which
  // leaves time to cross the gap. A click opens it and keeps it open (pinned) until a choice, a click
  // elsewhere, Escape or a second click; touch and pen open it by tapping, as before.
  const HOVER_OPEN = 120, HOVER_CLOSE = 280;
  let flyTimer = 0, flyPinned = false;
  const flyHover = (fn, ms) => { clearTimeout(flyTimer); flyTimer = fn ? setTimeout(fn, ms) : 0; };
  document.querySelectorAll('#tools [data-fly]').forEach((b) => {
    const name = b.dataset.fly;
    b.onclick = (e) => {
      e.stopPropagation(); flyHover();
      if (openFly === name && flyPinned) { hideFly(); return; }
      showFly(name); flyPinned = true;
    };
    b.onpointerenter = (e) => {
      if (e.pointerType !== 'mouse') { if (openFly && openFly !== name) showFly(name); return; }
      if (openFly === name) { flyHover(); return; }
      // moving from one open menu's button to the next switches at once
      flyHover(() => { TD.tooltip && TD.tooltip.hide(); showFly(name); flyPinned = false; }, openFly ? 0 : HOVER_OPEN);
    };
    b.onpointerleave = (e) => {
      if (e.pointerType !== 'mouse') return;
      if (openFly !== name) { flyHover(); return; }
      if (!flyPinned) flyHover(hideFly, HOVER_CLOSE);
    };
  });
  document.querySelectorAll('#tools ~ .flyout').forEach((f) => {
    f.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') flyHover(); });
    f.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && openFly && !flyPinned) flyHover(hideFly, HOVER_CLOSE); });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.flyout [data-pick], .flyout [data-insert]');
    if (!b) return;
    hideFly();
    if (state.mode === 'document') setMode('diagram');
    setTool(b.dataset.pick || b.dataset.insert);
  });
  document.addEventListener('pointerdown', (e) => {
    if (openFly && !e.target.closest('.flyout') && !e.target.closest('#tools [data-fly]')) hideFly();
  });

  // ---------------- image insert ----------------
  function readImage(file, cb) {
    const fr = new FileReader();
    fr.onload = () => {
      const src = fr.result;
      if (/svg/.test(file.type)) { const im = new Image(); im.onload = () => cb(src, im.naturalWidth || 300, im.naturalHeight || 200); im.src = src; return; }
      const im = new Image();
      im.onload = () => { // keep stored documents small: cap at 1600 px on the long side
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        if (k >= 1) { cb(src, im.naturalWidth, im.naturalHeight); return; }
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL(/png|gif/.test(file.type) ? 'image/png' : 'image/jpeg', 0.9), c.width, c.height);
      };
      im.src = src;
    };
    fr.readAsDataURL(file);
  }
  let imageTarget = null; // id of an image being replaced
  $('#imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readImage(file, (src, w, h) => {
      begin();
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-') || 'image';
      const old = imageTarget && byId(imageTarget);
      if (old) { old.src = src; old.h = old.w * (h / w); old.file = ''; }
      else {
        const r = stageSize(), v = state.view;
        const sc = Math.min(1, (8 * PX) / w, (r.h * 0.6) / v.zoom / h); // at most 8 cm wide
        const W = w * sc, H = h * sc, cx = v.x + r.w / 2 / v.zoom, cy = v.y + r.h / 2 / v.zoom;
        const s = addShape({ type: 'image', x: Math.round(cx - W / 2), y: Math.round(cy - H / 2), w: W, h: H, src, file: '', opacity: 1 });
        s.file = `${base}.${(/^data:image\/(\w+)/.exec(src) || [])[1] === 'jpeg' ? 'jpg' : ((/^data:image\/(\w+)/.exec(src) || [])[1] || 'png').replace('svg+xml', 'svg')}`;
        state.sel = new Set([s.id]);
      }
      imageTarget = null;
      commit(); render(); renderProps();
    });
  });
  $('#props').addEventListener('click', (e) => {
    const b = e.target.closest('[data-imgact]');
    if (!b) return;
    const s = selected()[0];
    if (!s || s.type !== 'image') return;
    if (b.dataset.imgact === 'replace') { imageTarget = s.id; $('#imageInput').value = ''; $('#imageInput').click(); return; }
    const a = document.createElement('a');
    a.href = s.src; a.download = TYPES.image.fileName(s); a.click();
  });
  let hintTimer;
  function showHint(msg, ms) {
    const h = $('#hint');
    h.textContent = msg; h.style.display = msg ? 'block' : 'none';
    clearTimeout(hintTimer);
    if (msg && ms) hintTimer = setTimeout(() => (h.style.display = 'none'), ms);
  }

  // Ramer–Douglas–Peucker
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function addShape(s) {
    s.id = s.id || uid();
    state.doc.shapes.push(s);
    return s;
  }
  function removeShape(id) {
    state.doc.shapes = state.doc.shapes.filter((s) => s.id !== id);
    state.sel.delete(id);
  }

  function finishPoly(e) {
    if (!polyDraft) return;
    const s = byId(polyDraft);
    polyDraft = null;
    if (s) {
      s.pts.pop(); // remove rubber-band point
      // drop consecutive duplicates
      s.pts = s.pts.filter((p, i, a) => i === 0 || dist({ x: p[0], y: p[1] }, { x: a[i - 1][0], y: a[i - 1][1] }) > 0.5);
      if (s._draft) { delete s._draft; if (s.pts.length < 3) s.closed = false; }
      if (s.pts.length < 2) removeShape(s.id);
    }
    commit();
    state.tool = 'select';
    setTool('select');
    render(); renderProps();
  }

  // ---------------- rotate by dragging just outside a corner (like Photoshop) ----------------
  // the frame is the shape's own (rotated) box for one shape, else the selection's bounding box
  function rotFrame() {
    const sel = selected();
    if (!sel.length || state.tool !== 'select') return null;
    let C = null;
    if (sel.length === 1 && (TD.ROT_TYPES.has(sel[0].type) || sel[0].type === 'sym')) C = TD.rotFrame(sel[0]);
    if (!C) { const b = unionBox(sel); C = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]; }
    const cx = (C[0][0] + C[2][0]) / 2, cy = (C[0][1] + C[2][1]) / 2;
    const H = sel.length === 1 ? TYPES[sel[0].type].handles(sel[0]) : []; // the resize handles actually drawn
    return { C, cx, cy, H };
  }
  const insideQuad = (C, x, y) => {
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
  function rotZone(p, F = rotFrame(), target = null) {
    if (!F || insideQuad(F.C, p.x, p.y)) return null;
    const hit = target && target.closest && target.closest('[data-id]');
    if (hit && !state.sel.has(hit.dataset.id)) return null; // a click on another shape selects it
    const z = state.view.zoom, C = F.C;
    if (F.H.some((h) => Math.hypot(p.x - h.x, p.y - h.y) * z < HANDLE_CLEAR)) return null;
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
  const ROT_CUR = {};
  function rotCursor(deg) {
    const k = Math.round(deg / 15) * 15;
    if (!ROT_CUR[k]) {
      const g = `<g transform='rotate(${k} 12 12)'><path d='M5.5 13.5Q12 5 18.5 13.5' fill='none' stroke='S' stroke-width='W' stroke-linecap='round'/><path d='M3.4 16.4L8.4 14.6L4 11Z M20.6 16.4L15.6 14.6L20 11Z' fill='S' stroke='S' stroke-width='V' stroke-linejoin='round'/></g>`;
      const svgc = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${g.replace(/S/g, 'white').replace(/W/g, '4').replace(/V/g, '2.4')}${g.replace(/S/g, 'black').replace(/W/g, '1.5').replace(/V/g, '0.6')}</svg>`;
      ROT_CUR[k] = `url("data:image/svg+xml,${encodeURIComponent(svgc)}") 12 12, alias`;
    }
    return ROT_CUR[k];
  }
  function setRotCursor(F, q) {
    if (!q) { svg.classList.remove('rot-zone'); return; }
    const [x, y] = q;
    svg.style.setProperty('--rot-cur', rotCursor((Math.atan2(y - F.cy, x - F.cx) * 180) / Math.PI + 90));
    svg.classList.add('rot-zone');
  }

  // ---------------- pointer interaction ----------------
  svg.addEventListener('pointerdown', (e) => {
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
    const now = performance.now();
    const dbl = now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const hitG = e.target.closest && e.target.closest('[data-id]');
    const hitId = hitG && hitG.dataset.id;

    if (state.tool === 'pencil') {
      begin();
      const s = addShape(TYPES.poly.create(p, state.defaults));
      s.pts = [[p.x, p.y]]; s.smooth = true;
      state.sel = new Set([s.id]);
      drag = { mode: 'pencil', id: s.id };
      render();
      return;
    }
    if (state.tool === 'poly' || state.tool === 'blob') {
      const q = snapPoint(p, e, polyDraft ? new Set([polyDraft]) : null);
      if (!polyDraft) {
        begin();
        const s = addShape(TYPES.poly.create(q, state.defaults));
        if (state.tool === 'blob') { s.smooth = true; s.closed = true; s._draft = true; }
        polyDraft = s.id; state.sel = new Set([s.id]);
      } else {
        const s = byId(polyDraft);
        if (dbl) { finishPoly(); return; }
        const first = { x: s.pts[0][0], y: s.pts[0][1] };
        if (s.pts.length >= 3 && dist(first, p) < 8 / state.view.zoom) { s.closed = true; finishPoly(); return; }
        s.pts[s.pts.length - 1] = [q.x, q.y];
        s.pts.push([q.x, q.y]);
      }
      render();
      return;
    }

    if (state.tool === 'text' || state.tool === 'math') {
      const math = state.tool === 'math';
      if (hitId && byId(hitId).text !== undefined) { state.sel = new Set([hitId]); startEdit(hitId, 'text'); setTool('select'); return; }
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
      drag = { mode: 'create', id: s.id, a: q };
      render();
      return;
    }

    // select tool
    const ap = e.target.closest && e.target.closest('[data-addpt]');
    if (ap) {
      const s = byId(ap.dataset.hid), i = +ap.dataset.addpt;
      begin();
      polyInsert(s, i);
      state.vertex = { id: s.id, i: i + 1 };
      drag = { mode: 'handle', id: s.id, key: 'v' + (i + 1), orig: clone(s) };
      render(); renderProps();
      return;
    }
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h) {
      const hs = byId(h.dataset.hid);
      if (hs && hs.type === 'poly' && /^v\d+$/.test(h.dataset.handle)) {
        const i = +h.dataset.handle.slice(1);
        if (dbl) { polyRemove(hs, i); return; }
        state.vertex = { id: hs.id, i };
        renderOverlay(); renderProps();
      }
      begin();
      const hs0 = byId(h.dataset.hid);
      if (CONNECT.has(hs0.type) && END[h.dataset.handle]) delete hs0[END[h.dataset.handle][0]]; // re-attached where it's dropped
      drag = { mode: 'handle', id: h.dataset.hid, key: h.dataset.handle, orig: clone(hs0) };
      svg.style.setProperty('--drag-cur', h.style.cursor || 'move'); svg.classList.add('drag-cur'); // keep it while the pointer outruns the handle
      return;
    }
    {
      const F = rotFrame(), zq = rotZone(p, F, e.target);
      if (zq) {
        begin();
        drag = { mode: 'rotate', cx: F.cx, cy: F.cy, a0: Math.atan2(p.y - F.cy, p.x - F.cx), orig: new Map(selected().map((s) => [s.id, clone(s)])), F, zq };
        setRotCursor(F, zq);
        return;
      }
    }
    if (hitId) {
      if (dbl) {
        const s = byId(hitId);
        if (s.type === 'text' || (s.type === 'sym' && s.text !== undefined)) { startEdit(hitId, 'text'); return; }
        if (s.type === 'line' || s.type === 'curve') { startEdit(hitId, 'label'); return; }
        if (s.type === 'qc') { state.sel = new Set([hitId]); openQuantum(hitId); return; }
        if (s.type === 'cz') { state.sel = new Set([hitId]); render(); renderProps(); openCircuit(hitId); return; }
        if (s.type === 'forest') { state.sel = new Set([hitId]); render(); renderProps(); openTree(hitId); return; }
        if (s.type === 'zx') { state.sel = new Set([hitId]); render(); renderProps(); openZX(hitId); return; }
        if (s.type === 'cd') { state.sel = new Set([hitId]); render(); renderProps(); openCD(hitId); return; }
      }
      const grp = groupIds(hitId);
      if (e.shiftKey) { if (state.sel.has(hitId)) grp.forEach((id) => state.sel.delete(id)); else grp.forEach((id) => state.sel.add(id)); }
      else if (!state.sel.has(hitId)) state.sel = new Set(grp);
      if (state.sel.has(hitId)) {
        begin();
        const sel = selected(), fast = sel.length > FAST_DRAG;
        drag = { mode: 'move', a: p, orig: new Map(sel.map((s) => [s.id, fast ? s : clone(s)])), ref: TYPES[byId(hitId).type].anchors(byId(hitId))[0] };
        if (fast) startFastMove(drag);
      }
      renderOverlay(); renderProps();
      return;
    }
    if (!e.shiftKey) state.sel.clear();
    drag = { mode: 'marquee', base: new Set(state.sel) };
    marquee = { a: p, b: p };
    renderOverlay(); renderProps();
  });

  svg.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    $('#cursorPos').textContent = `x ${fx(p.x / PX)} · y ${fx(-p.y / PX)} cm`;
    cursorW = p; drawRulers();
    if (!drag) {
      if (polyDraft) {
        const s = byId(polyDraft);
        let q = snapPoint(p, e, new Set([polyDraft]));
        if (e.shiftKey && s.pts.length >= 2) { const prev = s.pts[s.pts.length - 2]; q = TD.constrain({ x: prev[0], y: prev[1] }, q); }
        s.pts[s.pts.length - 1] = [q.x, q.y];
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
      case 'pan': {
        state.view.x = drag.v.x - (e.clientX - drag.sx) / state.view.zoom;
        state.view.y = drag.v.y - (e.clientY - drag.sy) / state.view.zoom;
        renderView();
        break;
      }
      case 'move': {
        let dx = p.x - drag.a.x, dy = p.y - drag.a.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (state.snap && !e.altKey) {
          // try snapping any selected anchor to another shape's anchor, else snap reference to grid
          const thr = 8 / state.view.zoom;
          let best = null, bd = thr;
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
          if (best) { dx = best.dx; dy = best.dy; snapHint = { ...best.pt, anchor: true }; }
          else {
            const g = TD.GRID, rx = drag.ref.x + dx, ry = drag.ref.y + dy;
            dx = Math.round(rx / g) * g - drag.ref.x; dy = Math.round(ry / g) * g - drag.ref.y;
            snapHint = null;
          }
        }
        drag.moved = true;
        if (drag.fast) { fastMove(drag, dx, dy); break; }
        for (const [id, o] of drag.orig) {
          const s = byId(id);
          Object.assign(s, clone(o));
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
          for (const k of Object.keys(s)) if (!(k in o)) delete s[k]; // e.g. an `angle` added by the previous frame
          Object.assign(s, clone(o));
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
        Object.assign(s, clone(drag.orig));
        let q = snapPoint(p, e, new Set([drag.id]));
        const lk = CONNECT.has(s.type) && END[drag.key] && !e.shiftKey && linkAt(p, q, e, s.id);
        if (lk) q = { ...linkPoint(lk), anchor: true };
        drag.lk = lk || null; linkHint = lk ? lk.id : null;
        snapHint = q.anchor ? q : null;
        TYPES[s.type].setHandle(s, drag.key, q, e, drag.orig);
        render(); renderGeom();
        break;
      }
      case 'create': {
        const s = byId(drag.id);
        let q = snapPoint(p, e, new Set([drag.id]));
        const lk = CONNECT.has(s.type) && !e.shiftKey && linkAt(p, q, e, s.id);
        if (lk) q = { ...linkPoint(lk), anchor: true };
        drag.lk = lk || null; linkHint = lk ? lk.id : null;
        snapHint = q;
        TYPES[s.type].drag(s, drag.a, q, e);
        render();
        break;
      }
      case 'pencil': {
        const s = byId(drag.id), l = s.pts[s.pts.length - 1];
        if (Math.hypot(p.x - l[0], p.y - l[1]) > 2 / state.view.zoom) { s.pts.push([p.x, p.y]); render(); }
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
  function touchesRect(s, R) {
    const g = content.querySelector(`[data-id="${s.id}"]`);
    if (!g) return true; // nothing rendered to test: the bbox overlap stands
    let els = [...g.querySelectorAll('.hit, .hitfill')];
    if (!els.length) els = [...g.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')];
    if (!els.length) return true;
    const toWorld = content.getCTM().inverse();
    const step = 3 / state.view.zoom;
    const inR = (q) => q.x >= R.x1 && q.x <= R.x2 && q.y >= R.y1 && q.y <= R.y2;
    const cx = (R.x1 + R.x2) / 2, cy = (R.y1 + R.y2) / 2;
    for (const el of els) {
      if (!el.getTotalLength) continue;
      const m = toWorld.multiply(el.getCTM()), inv = m.inverse();
      const P = (x, y) => new DOMPoint(x, y).matrixTransform(m);
      let len = 0;
      try { len = el.getTotalLength(); } catch (e) { continue; }
      // sampling step in local units ~ 3 screen px
      const sc = Math.hypot(m.a, m.b) || 1, n = Math.min(4000, Math.max(8, Math.ceil(len * sc / step)));
      for (let i = 0; i <= n; i++) { const q = el.getPointAtLength((len * i) / n); if (inR(P(q.x, q.y))) return true; }
      // box sitting inside a filled area (or wholly inside a stroke's hit band)
      if (el.isPointInFill && el.classList.contains('hitfill')) {
        const c = new DOMPoint(cx, cy).matrixTransform(inv);
        try { if (el.isPointInFill(c)) return true; } catch (e) { /* ignore */ }
      }
    }
    return false;
  }

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('panning', 'drag-cur');
    if (d.mode === 'rotate') svg.classList.remove('rot-zone');
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
      s.pts = simplify(s.pts, 1.6 / state.view.zoom);
      // closes itself when the stroke ends near where it started
      if (s.pts.length > 3 && Math.hypot(s.pts[0][0] - s.pts[s.pts.length - 1][0], s.pts[0][1] - s.pts[s.pts.length - 1][1]) < 10 / state.view.zoom) { s.pts.pop(); s.closed = true; }
      if (s.pts.length < 2) removeShape(s.id);
      commit(); render(); renderProps();
      return;
    }
    linkHint = null;
    if (d.mode === 'create') {
      const s = byId(d.id), t = TYPES[s.type];
      if (d.lk && d.lk.id !== (s.link1 && s.link1.id)) s.link2 = d.lk;
      if (t.fix) t.fix(s);
      if (!t.valid(s)) removeShape(s.id);
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
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', () => { cursorW = null; drawRulers(); });
  svg.addEventListener('pointerleave', () => { if (!drag && state.tool !== 'select' && !polyDraft) { snapHint = null; renderOverlay(); } });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stageSize();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { state.view.x += e.deltaX / state.view.zoom; state.view.y += e.deltaY / state.view.zoom; renderView(); }
  }, { passive: false });

  window.addEventListener('resize', render);

  // ---------------- inline text editor ----------------
  const ed = $('#inlineEditor'), mlBox = $('#mlEditor');
  let ml = null; // the MathLive editor while editing in MathLive mode (TD.input), else the textarea is used
  const edBox = () => (editing && editing.ml ? mlBox : ed);
  function editAnchor() {
    const s = byId(editing.id);
    if (!s) return null;
    if (editing.field === 'text') { const b = TD.bbox(s); return { x: s.x, y: b.y + b.h }; }
    if (editing.field === 'src') { const b = TD.bbox(s); return { x: b.x + b.w / 2, y: b.y + b.h }; }
    const L = TYPES[s.type].labelAt(s);
    return { x: L.P.x, y: L.P.y + 12 };
  }
  function positionEditor() {
    const a = editAnchor();
    if (!a) return;
    const sp = toScreen(a), r = stageSize(), box = edBox();
    // keep the whole box on the stage (it is centred on the anchor by translateX(-50%))
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.max(w / 2 + 8, Math.min(sp.x, r.w - w / 2 - 8)) + 'px';
    box.style.top = Math.max(8, Math.min(sp.y + 10, r.h - h - 8)) + 'px';
  }
  // Roomy by default: about 40 characters wide (or the paragraph frame's width, if wider), and
  // growing with the text up to ~12 lines before it scrolls.
  function sizeEditor() {
    const s = editing && byId(editing.id);
    if (!s) return;
    let w = 360;
    if (editing.field === 'text' && TD.isParaText(s)) w = Math.max(w, Math.min(640, s.tw * state.view.zoom));
    if (editing.field === 'src') w = 520;
    if (editing.ml) { mlBox.style.width = w + 'px'; return; }
    ed.style.width = w + 'px';
    ed.style.height = 'auto';
    ed.style.height = Math.min(Math.max(ed.scrollHeight + 2, ed.classList.contains('para') ? 120 : 76), 260) + 'px';
  }
  // Circuit blocks open their own editor (czeditor.js); Done writes the circuit back as one undo step
  function openCircuit(id) {
    finishEdit();
    const s = byId(id);
    if (!s || !TD.czEditor) return;
    TD.czEditor.open(s, (res) => {
      const t = byId(id);
      if (!t) return;
      begin(); t.items = res.items; t.raw = res.raw; commit();
      render(); renderProps();
    });
  }
  TD.czOpen = openCircuit;
  // Quantum blocks too (qceditor.js): Done writes the quantikz code back as one undo step
  function openQuantum(id) {
    finishEdit();
    const s = byId(id);
    if (!s || !TD.qcEditor) return;
    TD.qcEditor.open(s, (res) => {
      const t = byId(id);
      if (!t) return;
      begin(); t.src = res.src; commit();
      render(); renderProps();
    });
  }
  TD.qcOpen = openQuantum;
  // Tree blocks too (fteditor.js): Done writes the forest code back as one undo step
  function openTree(id) {
    finishEdit();
    const s = byId(id);
    if (!s || !TD.ftEditor) return;
    TD.ftEditor.open(s, (res) => {
      const t = byId(id);
      if (!t) return;
      begin(); t.src = res.src; commit();
      render(); renderProps();
    });
  }
  TD.ftOpen = openTree;
  // ZX diagrams (zxeditor.js): Done writes the ZX code back as one undo step
  function openZX(id) {
    finishEdit();
    const s = byId(id);
    if (!s || !TD.zxEditor) return;
    TD.zxEditor.open(s, (res) => {
      const t = byId(id);
      if (!t) return;
      begin(); t.src = res.src; commit();
      render(); renderProps();
    });
  }
  TD.zxOpen = openZX;
  // commutative diagrams (cdeditor.js): the same, for tikz-cd code
  function openCD(id) {
    finishEdit();
    const s = byId(id);
    if (!s || !TD.cdEditor) return;
    if (s.arrows && TD.TYPES.cd.upgrade) TD.TYPES.cd.upgrade(s);
    TD.cdEditor.open(s, (res) => {
      const t = byId(id);
      if (!t) return;
      begin(); t.src = res.src; commit();
      render(); renderProps();
    });
  }
  TD.cdOpen = openCD;
  function startEdit(id, field, init) {
    const s = byId(id);
    if (!s) return;
    if (TD.input && TD.input.mode === 'mathlive' && field !== 'src') { startEditML(s, field, init); return; }
    begin();
    editing = { id, field };
    if (init != null && !s[field]) { s[field] = ''; ed.value = init; }
    else ed.value = s[field] || '';
    ed.style.display = 'block';
    const code = field === 'src', para = code || (field === 'text' && TD.isParaText(s));
    ed.classList.toggle('para', para);
    ed.classList.toggle('code', code);
    ed.placeholder = field === 'label' ? 'Label, e.g. $r$ — Enter to finish'
      : code ? `quantikz code — Enter for a new line, ${isMac ? '⌘' : 'Ctrl+'}Enter or Esc to finish`
      : para ? `Paragraph, $math$ — Enter for a new line, ${isMac ? '⌘' : 'Ctrl+'}Enter or Esc to finish` : 'Text, $math$ — Enter to finish, Shift+Enter newline';
    sizeEditor();
    positionEditor();
    // select the existing text for replacement, unless typing already started before this frame
    const v0 = ed.value;
    requestAnimationFrame(() => { ed.focus(); if (ed.value !== v0) return; if (code) { ed.setSelectionRange(ed.value.length, ed.value.length); ed.scrollTop = ed.scrollHeight; } else if (init != null && ed.value === init) ed.setSelectionRange(1, 1); else ed.select(); });
  }
  // MathLive mode: the same box, with one interactive maths field per line (see js/mathinput.js)
  async function startEditML(s, field, init) {
    begin();
    const me = (editing = { id: s.id, field, ml: true });
    if (init != null && !s[field]) s[field] = '';
    const para = field === 'text' && TD.isParaText(s);
    mlBox.classList.toggle('para', para);
    mlBox.innerHTML = '<div class="ml-load">Loading MathLive…</div>';
    mlBox.style.display = 'block';
    sizeEditor(); positionEditor();
    try { await TD.input.load(); }
    catch (err) { // offline before it was ever cached, say: fall back to the LaTeX field for this edit
      if (editing !== me) return;
      editing = null; mlBox.style.display = 'none';
      showHint("MathLive couldn't load, so this edit uses LaTeX", 2500);
      TD.input.set('latex'); startEdit(s.id, field, init);
      return;
    }
    if (editing !== me) return; // finished while loading
    const text = s[field] || '';
    ml = TD.input.mount(mlBox, {
      text, para, prose: field === 'text' && init == null,
      start: text ? 'end' : init != null || field === 'label' ? 'math' : 'text',
      onInput: editInput, onDone: finishEdit,
    });
    sizeEditor(); positionEditor();
  }
  function finishEdit() {
    if (!editing) return;
    const { id } = editing;
    editing = null;
    if (ml) { const m = ml; ml = null; m.destroy(); }
    mlBox.style.display = 'none';
    ed.blur();
    ed.style.display = 'none';
    const s = byId(id);
    if (s && s.type === 'text' && !s.text.trim()) removeShape(id);
    commit();
    render(); renderProps();
  }
  function editInput(v) {
    if (!editing) return;
    const s = byId(editing.id);
    if (!s) return;
    s[editing.field] = v;
    render(); sizeEditor(); positionEditor();
    const ta = document.querySelector(`#props [data-key="${editing.field}"], #props [data-panel] [data-p="${editing.field}"]`);
    if (ta) ta.value = v;
  }
  ed.addEventListener('input', () => editInput(ed.value));
  ed.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const para = ed.classList.contains('para');
    const done = e.key === 'Escape' || (e.key === 'Enter' && (para ? e.metaKey || e.ctrlKey : !e.shiftKey));
    if (done) { e.preventDefault(); finishEdit(); }
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (editing && document.activeElement !== ed) finishEdit(); }, 0));

  // ---------------- polyline points ----------------
  // Insert a point in the middle of segment i (i → i+1).
  function polyInsert(s, i) {
    const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length];
    s.pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  function polyRemove(s, i) {
    if (s.pts.length <= (s.closed ? 3 : 2)) { showHint(s.closed ? 'A closed shape needs at least 3 points' : 'A polyline needs at least 2 points', 1400); return; }
    begin();
    s.pts.splice(i, 1);
    state.vertex = null;
    render(); commit(); renderProps();
  }
  // "Add point" adds after the chosen point (or splits the longest segment); "Remove point" removes the chosen one.
  function polyAddPoint(s) {
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
  TD.polyPoints = { add: polyAddPoint, remove: (s) => state.vertex && state.vertex.id === s.id && polyRemove(s, state.vertex.i) };

  // ---------------- properties panel ----------------
  const sizeOpts = TD.SIZES.map((s) => [s[0], s[0]]);
  const PROPS = [
    { key: 'text', label: 'Text', type: 'textarea', hint: 'Use $…$ for math, e.g. $\\vec{F}_e$; $$…$$ for display style' },
    { key: 'mathStyle', label: 'Math style', type: 'select', options: [['inline', 'Inline  $…$'], ['display', 'Display  $$…$$'], ['mixed', 'Mixed']], derived: true },
    { key: 'label', label: 'Label', type: 'text', hint: 'Shown along the path; $…$ for math' },
    { key: 'labelSide', label: 'Label side', type: 'select', options: [['left', 'Left (auto)'], ['right', 'Right (swap)'], ['on', 'On the line']], needs: 'label' },
    { key: 'labelPos', label: 'Label pos', type: 'range', min: 0, max: 1, step: 0.05, needs: 'label' },
    { key: 'size', label: 'Font size', type: 'size' },
    { key: 'font', label: 'Font', type: 'select', options: TD.FONTS.map((f) => [f[0], f[1]]) },
    { key: 'bold', label: 'Style', type: 'bi' },
    { key: 'align', label: 'Align', type: 'align' },
    { key: 'color', label: 'Text color', type: 'color' },
    { key: 'ballColor', label: 'Ball color', type: 'color' },
    { key: 'stroke', label: 'Stroke', type: 'color', nullable: true },
    { key: 'fill', label: 'Fill', type: 'color', nullable: true, fills: true },
    { key: 'width', label: 'Line width', type: 'width', min: 0.25, step: 0.25, unit: 'px' },
    { key: 'dash', label: 'Dash', type: 'dash' },
    { key: 'startTip', label: 'Start tip', type: 'tip' },
    { key: 'endTip', label: 'End tip', type: 'tip' },
    { key: 'midTip', label: 'Middle tip', type: 'tip' },
    { key: 'bpTip', label: 'Bend tips', type: 'tip' },
    { key: 'shaft', label: 'Shaft', type: 'shaft' },
    { key: 'cross', label: 'Crossings', type: 'select', options: TD.CROSSES },
    { key: 'closed', label: 'Closed', type: 'checkbox' },
    { key: 'boxed', label: 'Boxed', type: 'checkbox' },
    { key: 'radius', label: 'Corner radius', type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'coils', label: 'Coils', type: 'number', min: 1, step: 1 },
    { key: 'amplitude', label: 'Amplitude', type: 'number', min: 1, step: 1, unit: 'px' },
    { key: 'pitch', label: 'Pitch', type: 'number', min: 0, step: 1, unit: 'px', hint: 'Length of one coil; resizing adds coils. 0 = use a fixed coil count' },
    { key: 'loop', label: 'Loop size', type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'wl', label: 'Wave length', type: 'number', min: 4, step: 1, unit: 'px' },
    { key: 'phase', label: 'Start position', type: 'range', min: 0, max: 100, step: 1 },
    { key: 'duty', label: 'Duty cycle', type: 'range', min: 5, max: 95, step: 1 },
    { key: 'fire', label: 'Firing angle', type: 'range', min: 0, max: 175, step: 5 },
    { key: 'tick', label: 'Tick spacing', type: 'number', min: 0, step: 1, unit: 'px' },
    { key: 'ticksz', label: 'Tick size', type: 'number', min: 1, step: 1, unit: 'px' },
    { key: 'nums', label: 'Show numbers', type: 'checkbox' },
    { key: 'cell', label: 'Cell size', type: 'number', min: 4, step: 1, unit: 'px' },
    { key: 'shift', label: 'Corner shift', type: 'number', step: 1, unit: 'px' },
    { key: 'frame', label: 'Border', type: 'checkbox' },
    { key: 'angle', label: 'Rotation', type: 'number', step: 1, unit: '°' },
    { key: 'skew', label: 'Skew X', type: 'number', min: -75, step: 1, unit: '°' },
    { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.05 },
  ];
  const GEOM = {
    line: [['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y']],
    spring: [['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y']],
    curve: [['x1', 'x'], ['y1', 'y'], ['cx1', 'x'], ['cy1', 'y'], ['cx2', 'x'], ['cy2', 'y'], ['x2', 'x'], ['y2', 'y']],
    rect: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    ellipse: [['cx', 'x'], ['cy', 'y'], ['rx', 'len'], ['ry', 'len']],
    ball: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    dot: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    arc: [['cx', 'x'], ['cy', 'y'], ['r', 'len'], ['a1', 'deg'], ['a2', 'deg']],
    text: [['x', 'x'], ['y', 'y'], ['tw', 'len'], ['th', 'len']],
    plot: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    pie: [['cx', 'x'], ['cy', 'y'], ['r', 'len']],
    cd: [['x', 'x'], ['y', 'y']],
    qc: [['x', 'x'], ['y', 'y']],
    forest: [['x', 'x'], ['y', 'y']],
    zx: [['x', 'x'], ['y', 'y']],
    bloch: [['x', 'x'], ['y', 'y']],
    sym: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
    image: [['x', 'x'], ['y', 'y'], ['w', 'len'], ['h', 'len']],
  };
  const toUnit = (v, k) => (k === 'deg' ? r2(v) : k === 'y' ? r2(-v / PX) : r2(v / PX));
  function propsEl0() { return $('#props'); }
  const fromUnit = (v, k) => (k === 'deg' ? v : k === 'y' ? -v * PX : v * PX);

  // Four bars, alternating long/short, drawn heavy so they read like the usual paragraph-align icons.
  const ALIGNS = [['left', 'Align Left', 'M3 4h14M3 8h9M3 12h14M3 16h9'], ['center', 'Align Centre', 'M3 4h14M5.5 8h9M3 12h14M5.5 16h9'],
    ['right', 'Align Right', 'M3 4h14M8 8h9M3 12h14M8 16h9'], ['justify', 'Justify', 'M3 4h14M3 8h14M3 12h14M3 16h14']];
  function fieldHtml(p, v, labelOverride) {
    const id = 'f-' + p.key;
    let ctl = '';
    switch (p.type) {
      case 'textarea': ctl = `<textarea id="${id}" data-key="${p.key}">${esc(v ?? '')}</textarea>`; break;
      case 'text': ctl = `<input type="text" id="${id}" data-key="${p.key}" value="${esc(v ?? '')}">`; break;
      case 'number': ctl = `<input type="number" id="${id}" data-key="${p.key}" value="${typeof v === 'number' ? +v.toFixed(3) : (v ?? '')}" min="${p.min ?? ''}" step="${p.step ?? 1}">${p.unit ? `<span class="val">${p.unit}</span>` : ''}`; break;
      case 'range': ctl = `<input type="range" id="${id}" data-key="${p.key}" value="${v}" min="${p.min}" max="${p.max}" step="${p.step}"><span class="val">${r2(v)}</span>`; break;
      case 'select': ctl = `<select id="${id}" data-key="${p.key}">${p.options.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; break;
      case 'size': {
        const custom = typeof v === 'number';
        ctl = `<select id="${id}" data-key="size">${sizeOpts.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}<option value="custom"${custom ? ' selected' : ''}>Custom px…</option></select>` +
          `<input type="number" class="px" data-sizepx="1" min="2" max="200" step="1" value="${Math.round(TD.sizePx(v ?? 'normalsize') * 10) / 10}" title="Size in px — type a value and press Enter">`;
        break;
      }
      case 'bi': ctl = `<label class="chk"><input type="checkbox" data-key="bold"${v ? ' checked' : ''}><b>Bold</b></label><label class="chk"><input type="checkbox" data-key="italic"${p.italic ? ' checked' : ''}><i>Italic</i></label>`; break;
      case 'checkbox': ctl = `<input type="checkbox" id="${id}" data-key="${p.key}"${v ? ' checked' : ''}>`; break;
      case 'align': // segmented: how lines sit against each other (Justify needs a wrap width, so it is disabled until then)
        ctl = `<div class="seg-ctl" role="radiogroup" aria-label="Align">${ALIGNS.map(([k, n, d]) => { const off = k === 'justify' && !p.wraps;
          return `<button type="button" role="radio" data-alignv="${k}" class="${k === v ? 'on' : ''}" aria-checked="${k === v}"${off ? ' disabled' : ''} title="${off ? 'Justify (paragraph boxes only: drag with the text tool)' : n}"><svg viewBox="0 0 20 20"><path d="${d}"/></svg></button>`; }).join('')}</div>`; break;
      case 'color': ctl = colorBtn(p.key, v, p.nullable, p.fills); break;
      case 'width': ctl = `<input type="number" id="${id}" data-key="width" value="${typeof v === 'number' ? +v.toFixed(3) : ''}" min="0.25" step="0.25">` +
        `<button type="button" class="ddbtn" data-dd="width" title="Line width presets"><svg viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg></button><span class="val">px</span>`; break;
      case 'dash': ctl = `<button type="button" class="ddsel" id="${id}" data-dd="dash" title="Dash pattern">${dashPreview(v, 1.2)}<span>${esc(dashName(v))}</span>` +
        `<svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg></button>`; break;
      case 'tip': ctl = `<button type="button" class="ddsel" id="${id}" data-dd="${p.key}" title="${p.label}">${tipPreview(v || 'none')}<span>${esc(tipName(v))}</span>` +
        `<svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg></button>`; break;
      case 'shaft': ctl = `<button type="button" class="ddsel" id="${id}" data-dd="shaft" title="Shaft">${shaftPreview(v || 'single')}<span>${esc((TD.SHAFTS.find((x) => x[0] === v) || TD.SHAFTS[0])[1])}</span>` +
        `<svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg></button>`; break;
    }
    const html0 = `<div class="row"><label for="${id}">${labelOverride || p.label}</label><div class="ctl">${ctl}</div></div>`;
    let html = html0;
    if (p.hint) html += `<div class="hint">${esc(p.hint)}</div>`;
    return html;
  }

  function colorBtn(key, v, nullable, fills) {
    return `<button type="button" class="cbtn${v ? '' : ' none'}" data-color="${key}"${nullable ? ' data-nullable="1"' : ''}${fills ? ' data-fills="1"' : ''} title="${esc(TD.fillLabel(v))}"><span style="background:${TD.fillCss(v)}"></span></button><span class="cval">${esc(TD.fillLabel(v))}</span>`;
  }
  const TIP_KEYS = ['startTip', 'endTip', 'midTip', 'bpTip'];
  const tipName = (v) => (TD.TIPS.find((t) => t[0] === v) || TD.TIPS[0])[1];
  function tipPreview(v) {
    const t = TD.tip(v, { x: 40, y: 6 }, { x: 1, y: 0 }, 1.2, 'currentColor');
    return `<svg class="dprev tprev" viewBox="0 0 48 12"><path d="M4 6H${r2(40 - t.back)}" stroke="currentColor" stroke-width="1.2" fill="none"/>${t.svg}</svg>`;
  }
  function shaftPreview(v) {
    const s = { type: 'line', x1: 3, y1: 7, x2: 57, y2: 7, stroke: '#000000', width: 1, dash: 'solid', startTip: 'none', endTip: 'none', midTip: 'none', shaft: v, cross: 'none', opacity: 1 };
    return `<svg class="dprev sprev" viewBox="0 0 60 14">${TD.TYPES.line.svg(s, { export: true })}</svg>`;
  }
  // keys a shape has, counting the line extras older files lack
  const SYM_XF = new Set(['angle', 'skew']), TICK_KEYS = { tick: 6 / TD.PT_PER_PX, ticksz: 6 / TD.PT_PER_PX };
  const symParams = (s) => (s.type === 'sym' && TD.SYMS[s.kind] && TD.SYMS[s.kind].params) || null;
  const hasKey = (s, k) => s[k] !== undefined || (TD.LINEISH.has(s.type) && (k in TD.LINE_EXTRA || (k === 'bpTip' && s.type === 'poly'))) || (s.type === 'text' && (k === 'boxed' || k === 'align')) || (k === 'angle' && TD.ROT_TYPES.has(s.type)) ||
    (s.type === 'sym' && (SYM_XF.has(k) || !!(symParams(s) && k in symParams(s)))) || (TD.LINEISH.has(s.type) && k in TICK_KEYS && keyVal(s, 'shaft') === 'ticks');
  // text with no alignment set: centred lines, or left in a wrapping box
  const keyVal = (s, k) => s[k] ?? (k === 'align' && s.type === 'text' ? (s.tw > 0 ? 'left' : 'center') : undefined) ?? TD.LINE_EXTRA[k] ?? (k === 'bpTip' ? 'none' : SYM_XF.has(k) ? 0 : symParams(s) && k in symParams(s) ? symParams(s)[k] : k in TICK_KEYS && TD.LINEISH.has(s.type) ? TICK_KEYS[k] : undefined);
  const dashName = (v) => (TD.DASHES.find((d) => d[0] === v) || [0, TD.dashPat(v) ? 'Custom' : 'Solid'])[1];
  function dashPreview(v, w) {
    const da = TD.dashArray(v, w);
    return `<svg class="dprev" viewBox="0 0 48 8" preserveAspectRatio="none"><path d="M1 4H47" stroke="currentColor" stroke-width="${w}"${da ? ` stroke-dasharray="${da}"` : ''}/></svg>`;
  }
  // width / dash dropdowns
  const ddPop = document.createElement('div');
  ddPop.className = 'popover ddpop'; ddPop.hidden = true;
  document.body.appendChild(ddPop);
  let ddAnchor = null;
  function closeDd() { ddPop.hidden = true; ddAnchor = null; }
  function openDd(btn) {
    if (ddAnchor === btn) { closeDd(); return; }
    ddAnchor = btn;
    const kind = btn.dataset.dd, target = $('#props .sec[data-target]')?.dataset.target;
    const curS = selected().find((s) => hasKey(s, kind));
    const cur = target === 'defaults' ? state.defaults[kind] : curS && keyVal(curS, kind);
    if (TIP_KEYS.includes(kind)) {
      ddPop.innerHTML = `<div class="tipgrid">${TD.TIPS.map(([k, n]) => `<button type="button" data-ddv="${k}" class="${k === (cur || 'none') ? 'on' : ''}" title="${n}">${k === 'none' ? '<span class="none">None</span>' : tipPreview(k)}</button>`).join('')}</div>`;
    } else if (kind === 'shaft') {
      ddPop.innerHTML = TD.SHAFTS.map(([k, n]) => `<button type="button" data-ddv="${k}" class="${k === (cur || 'single') ? 'on' : ''}">${shaftPreview(k)}<span>${n}</span></button>`).join('');
    } else if (kind === 'width') {
      ddPop.innerHTML = TD.WIDTHS.map((w) => `<button type="button" data-ddv="${w}" class="${w === cur ? 'on' : ''}"><svg viewBox="0 0 60 10"><path d="M2 5H58" stroke="currentColor" stroke-width="${w}"/></svg><span>${w} px</span><i>${r2(w * TD.PT_PER_PX)}pt</i></button>`).join('');
    } else {
      const custom = TD.dashPat(cur) && !TD.DASHES.some((d) => d[0] === cur);
      ddPop.innerHTML = TD.DASHES.map(([k, n]) => `<button type="button" data-ddv="${k}" class="${k === cur ? 'on' : ''}">${dashPreview(k, 1.5)}<span>${n}</span></button>`).join('') +
        `<div class="dd-custom${custom ? ' on' : ''}"><label>Custom…</label><input data-ddcustom placeholder="on off … (pt)" value="${custom ? esc(cur.slice(2)) : ''}" title="Dash lengths in pt, e.g. 4 2 or 6 2 1 2"></div>`;
    }
    ddPop.hidden = false;
    const r = btn.getBoundingClientRect(), w = ddPop.offsetWidth, h = ddPop.offsetHeight;
    ddPop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    ddPop.style.top = (r.bottom + 4 + h > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
  }
  function pickDd(kind, v) {
    applyProp(kind, v, true);
    closeDd();
    renderProps();
  }
  ddPop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ddv]');
    if (!b || !ddAnchor) return;
    const kind = ddAnchor.dataset.dd;
    pickDd(kind, kind === 'width' ? parseFloat(b.dataset.ddv) : b.dataset.ddv);
  });
  ddPop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDd(); return; }
    if (e.key !== 'Enter' || !e.target.hasAttribute('data-ddcustom')) return;
    const nums = e.target.value.trim().split(/[\s,]+/).map(Number).filter((n) => isFinite(n) && n >= 0);
    if (nums.length && nums.some((n) => n > 0)) pickDd('dash', 'p:' + nums.join(' '));
  });
  document.addEventListener('pointerdown', (e) => { if (!ddPop.hidden && !ddPop.contains(e.target) && !e.target.closest('[data-dd]')) closeDd(); }, true);
  function renderProps() {
    if (TD.closeColorPicker) TD.closeColorPicker();
    const dp = document.querySelector('.ddpop'); if (dp) dp.hidden = true;
    const el = $('#props');
    if (state.mode === 'document') { if (TD.docview) TD.docview.renderSettings(el); return; }
    const sel = selected();
    if (!sel.length) {
      const d = state.defaults;
      const keys = ['stroke', 'fill', 'width', 'dash', 'color', 'size', 'font', 'ballColor'];
      el.innerHTML = (state.mode === 'page' ? pagePanel() : '') + `<h3>Default style <small>for new shapes</small></h3><div class="sec" data-target="defaults">` +
        PROPS.filter((p) => keys.includes(p.key)).map((p) => fieldHtml(p, d[p.key])).join('') + `</div>` +
        `<div class="sec"><div class="sec-title">Shortcuts</div><table class="keys">${[
          ['V L A C P', 'select · line · arrow · curve · polyline'], ['O S R E', 'arc · spring · rect · ellipse'], ['B D T', 'ball · dot · text'],
          ['Shift', 'constrain angle / square'], ['Alt', 'drag without snapping'], ...(state.mode === 'board' ? [['H', 'hand: drag the board'], ['wheel', 'move around']] : []), ['Space+drag', 'pan (or middle mouse)'], ['Ctrl+wheel', 'zoom'],
          ['Ctrl+G', 'group (Shift: ungroup)'], ['Ctrl+R', 'rotate 90°'], ['Ctrl+] / [', 'forward / backward'], ['Ctrl+D', 'duplicate'],
          ['Ctrl+E', 'TikZ code'], ['Ctrl+O', 'open file'], ['Right-click', 'object menu'],
        ].map(([k, d]) => `<tr><td>${k.split(' ').map((x) => `<kbd>${kb(x)}</kbd>`).join('')}</td><td>${d}</td></tr>`).join('')}</table></div>`;
      return;
    }
    const types = [...new Set(sel.map((s) => s.type))];
    const title = sel.length === 1 ? TYPES[sel[0].type].name : (sel[0].g && sel.every((q) => q.g === sel[0].g) ? `Group of ${sel.length}` : `${sel.length} objects`);
    const has = (k) => sel.some((s) => hasKey(s, k));
    const first = (k) => keyVal(sel.find((s) => hasKey(s, k)), k);
    const isText = types.includes('text');
    let html = `<h3>${esc(title)}</h3><div class="sec" data-target="sel">`;
    for (const p of PROPS) {
      if (p.key === 'mathStyle') { const ms = mathStyleOf(sel); if (ms) html += fieldHtml(p, ms, p.label); continue; }
      if (!has(p.key)) continue;
      // a Bloch sphere's colours live in its code (the Colours section), not in the shape
      if (p.key === 'color' && types.every((t) => t === 'bloch')) continue;
      if (p.needs && !sel.some((s) => s[p.needs])) continue;
      if (p.key === 'startTip' || p.key === 'endTip') { if (sel.every((s) => s.type === 'poly' && s.closed)) continue; }
      if (p.key === 'cross' && !sel.some((s) => s.type === 'line' || (s.type === 'poly' && !s.smooth))) continue;
      // a text's frame settings only matter once it is boxed
      if (['stroke', 'fill', 'width', 'dash', 'radius'].includes(p.key) && sel.every((s) => s.type === 'text' && !s.boxed)) continue;
      let lbl = p.label;
      if (!isText && p.key === 'size') lbl = 'Label size';
      if (!isText && p.key === 'color' && !types.includes('dot')) lbl = 'Label color';
      if (types.length === 1 && types[0] === 'dot' && p.key === 'color') lbl = 'Color';
      if (p.type === 'bi') html += fieldHtml({ ...p, italic: first('italic') }, first('bold'));
      else if (p.type === 'align') html += fieldHtml({ ...p, wraps: sel.some((s) => s.tw > 0) }, first('align'));
      else html += fieldHtml(p, first(p.key), lbl);
    }
    html += `</div>`;
    if (sel.length === 1 && sel[0].type === 'poly') {
      const s = sel[0], vi = state.vertex && state.vertex.id === s.id ? state.vertex.i : -1;
      html += `<div class="sec"><div class="sec-title">Points <small>${s.pts.length}</small></div><div class="btns">
        <button data-act="pt:add" title="Add a point after the chosen one (or on the longest segment). You can also drag a + on the shape.">Add Point</button>
        <button data-act="pt:rm" title="Remove the chosen point. You can also double-click a point."${vi < 0 ? ' disabled' : ''}>Remove Point${vi >= 0 ? ' ' + (vi + 1) : ''}</button></div>
        <div class="hint-line">Click a point to choose it. Drag a + to add a point there; double-click a point to remove it.</div></div>`;
    }
    const panel = sel.length === 1 && TD.panels && TD.panels[sel[0].type];
    if (panel) html += `<div class="panel" data-panel="${sel[0].type}">${panel.html(sel[0])}</div>`;
    if (sel.length === 1 && GEOM[sel[0].type]) html += `<div class="sec" id="geomSec"></div>`;
    const nu = units().length;
    if (nu > 1) html += `<div class="sec"><div class="sec-title">Align</div><div class="align-row">
      ${[['left', 'M3 2v16M6 5h10v3.5H6zM6 11.5h6V15H6z', 'Align left'], ['center', 'M10 2v16M4 5h12v3.5H4zM7 11.5h6V15H7z', 'Align centres'], ['right', 'M17 2v16M4 5h10v3.5H4zM8 11.5h6V15H8z', 'Align right'],
        ['top', 'M2 3h16M5 6v10h3.5V6zM11.5 6v6H15V6z', 'Align top'], ['middle', 'M2 10h16M5 4v12h3.5V4zM11.5 7v6H15V7z', 'Align middles'], ['bottom', 'M2 17h16M5 4v10h3.5V4zM11.5 8v6H15V8z', 'Align bottom']]
        .map(([k, d, t]) => `<button class="icon" data-act="l:${k}" title="${t}"><svg viewBox="0 0 20 20"><path d="${d}"/></svg></button>`).join('')}</div></div>`;
    if (combinable()) html += `<div class="sec"><div class="sec-title">Combine</div><div class="align-row">
      ${COMBINE.map(([k, t]) => `<button class="icon" data-act="cb:${k}" title="${t}${k === 'subtract' ? ': cut the shapes above out of the bottom one' : k === 'divide' ? ': split into every overlap piece' : ''}"><svg viewBox="0 0 20 20">${COMBINE_IC[k]}</svg></button>`).join('')}</div></div>`;
    html += `<div class="sec"><div class="btns">
      ${canGroup() ? '<button data-act="group" title="Ctrl+G">Group</button>' : ''}${canUngroup() ? '<button data-act="ungroup" title="Ctrl+Shift+G">Ungroup</button>' : ''}
      <button data-act="front">Bring to Front</button><button data-act="back">Send to Back</button>
      <button data-act="dup">Duplicate</button><button data-act="del">Delete</button></div>
      <div class="hint-line">Right-click for more: rotate, flip, arrange, distribute.</div></div>`;
    el.innerHTML = html;
    renderGeom();
  }
  function pagePanel() {
    const G = pageGeom();
    const pnum = (k, v) => `<input type="number" data-pp="${k}" value="${+(+v).toFixed(2)}" step="0.25" min="0">`;
    return `<h3>Page <small>${esc(TD.PAPERS[G.paper]?.name || 'Custom')} · ${+G.W.toFixed(2)} × ${+G.H.toFixed(2)} cm</small></h3><div class="sec">
      <div class="row"><label>Paper</label><div class="ctl"><select data-pp="paper">${Object.entries(TD.PAPERS).map(([k, v]) => `<option value="${k}"${k === G.paper ? ' selected' : ''}>${v.name}</option>`).join('')}</select></div></div>
      ${G.paper === 'custom' ? `<div class="row"><label>Size (cm)</label><div class="ctl">${pnum('w', G.w / PX)}<span class="x">×</span>${pnum('h', G.h / PX)}</div></div>` : ''}
      <div class="row"><label>Orientation</label><div class="ctl seg-ctl">
        <button data-ppo="portrait" class="${G.orient !== 'landscape' ? 'on' : ''}" title="Portrait"><svg viewBox="0 0 20 20"><path d="M6 3h8v14H6z"/></svg></button>
        <button data-ppo="landscape" class="${G.orient === 'landscape' ? 'on' : ''}" title="Landscape"><svg viewBox="0 0 20 20"><path d="M3 6h14v8H3z"/></svg></button></div></div>
      <div class="row"><label>Margins</label><div class="ctl">${pnum('mt', G.mt)}${pnum('ml', G.ml)}</div></div>
      <div class="hint-line">Margins (top/bottom · left/right, cm) are guides only: snap to them, or place things right to the edge. Shared with the Document view's page setup.</div>
    </div>
    <h3>Pages <small>${G.n} page${G.n > 1 ? 's' : ''} · PgUp / PgDn</small></h3><div class="sec pg-list">${pageList(G)}
      <button class="pg-add" data-pg="add" data-k="${G.n}" title="Add a page at the end"${G.n >= 50 ? ' disabled' : ''}>+ Add page</button></div>`;
  }
  function pageList(G) {
    const cur = currentPage(), ic = {
      up: '<path d="M10 15V5M6 9l4-4 4 4"/>', down: '<path d="M10 5v10M6 11l4 4 4-4"/>',
      dup: '<path d="M7 7h9v9H7z"/><path d="M4 13V4h9"/>', ins: '<path d="M10 5v10M5 10h10"/>', del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    };
    const b = (act, k, title, dis) => `<button class="icon" data-pg="${act}" data-k="${k}" title="${title}"${dis ? ' disabled' : ''}><svg viewBox="0 0 20 20">${ic[act]}</svg></button>`;
    let h = '';
    for (let k = 0; k < G.n; k++) {
      const n = onPage(k, G).length;
      h += `<div class="pg-item${k === cur ? ' on' : ''}" data-pg="go" data-k="${k}" title="Go to page ${k + 1}">
        <div class="pg-thumb" style="aspect-ratio:${G.w}/${G.h}">${pageThumb(k, G)}</div>
        <div class="pg-meta"><b>Page ${k + 1}</b><span>${n ? n + ' object' + (n > 1 ? 's' : '') : 'empty'}</span>
          <div class="pg-acts">${b('up', k, 'Move page up', k === 0)}${b('down', k, 'Move page down', k === G.n - 1)}${b('ins', k + 1, 'Insert a blank page after this one', G.n >= 50)}${b('dup', k, 'Duplicate this page', G.n >= 50)}${b('del', k, 'Delete this page', G.n < 2)}</div></div></div>`;
    }
    return h;
  }
  propsEl0().addEventListener('change', (e) => {
    const k = e.target.dataset.pp;
    if (!k || state.mode !== 'page') return;
    let v = e.target.value;
    const pg = { ...state.doc.page };
    if (k === 'paper') { if (v === 'custom') { const G = pageGeom(); pg.w = G.W; pg.h = G.H; } pg.paper = v; }
    else { v = parseFloat(v); if (!isFinite(v) || v < 0) { renderProps(); return; } if (k === 'mt') pg.mt = pg.mb = v; else if (k === 'ml') pg.ml = pg.mr = v; else pg[k] = Math.max(1, v); }
    state.doc.page = pg; render(); renderProps(); scheduleSave();
  });
  propsEl0().addEventListener('click', (e) => {
    if (state.mode !== 'page') return;
    const o = e.target.closest('[data-ppo]');
    if (o) { state.doc.page = { ...state.doc.page, orient: o.dataset.ppo }; render(); renderProps(); scheduleSave(); }
    const a = e.target.closest('[data-pg]');
    if (!a || a.disabled) return;
    const k = +a.dataset.k;
    ({ go: () => goToPage(k), add: () => insertPage(k), ins: () => insertPage(k), up: () => movePage(k, -1), down: () => movePage(k, 1), dup: () => duplicatePage(k), del: () => deletePage(k) })[a.dataset.pg]();
  });
  function renderGeom() {
    const sec = $('#geomSec');
    const sel = selected();
    if (!sec || sel.length !== 1) return;
    const s = sel[0];
    if (sec.contains(document.activeElement)) return;
    sec.innerHTML = `<div class="sec-title">Geometry (TikZ ${GEOM[s.type].some((g) => g[1] === 'deg') ? 'cm / °' : 'cm'})</div>` +
      GEOM[s.type].map(([k, kind]) => `<div class="row"><label>${k === 'tw' ? 'wrap width' : k === 'th' ? 'box height' : k}</label><div class="ctl"><input type="number" step="${kind === 'deg' ? 5 : 0.05}" data-geom="${k}" data-kind="${kind}" value="${toUnit(s[k] ?? 0, kind)}"${k === 'tw' ? ' min="0" title="Wrap width in cm (0 = no wrapping)"' : k === 'th' ? ' min="0" title="Paragraph box height in cm (0 = grows with the text). Needs a wrap width."' : ''}></div></div>`).join('');
  }

  // Inline vs display maths of text objects: 'inline' | 'display' | 'mixed', or null when there is no maths.
  function mathStyleOf(list) {
    const segs = list.filter((s) => s.type === 'text').flatMap((s) => String(s.text).split('\n').flatMap(TD.segments)).filter((g) => g.math);
    if (!segs.length) return null;
    return segs.every((g) => g.display) ? 'display' : segs.every((g) => !g.display) ? 'inline' : 'mixed';
  }
  function setMathStyle(s, style) {
    if (style === 'mixed') return;
    s.text = String(s.text).split('\n').map((line) => TD.segments(line).map((g) => {
      if (!g.math) return g.s;
      return style === 'display' ? `$$${g.s.trim()}$$` : `$${g.s.trim()}$`;
    }).join('')).join('\n');
  }
  function applyProp(key, value, isFinal) {
    const target = $('#props .sec[data-target]')?.dataset.target;
    if (target === 'defaults') { state.defaults[key] = value; savePrefs(); return; }
    if (key === 'mathStyle') {
      begin();
      for (const s of selected()) if (s.type === 'text') setMathStyle(s, value);
      render(); commit(); renderProps(); return;
    }
    begin();
    for (const s of selected()) if (hasKey(s, key)) {
      s[key] = value;
      if (key === 'boxed' && value && s.type === 'text') { s.stroke ??= '#000000'; s.fill ??= null; s.width ??= 1; s.dash ??= 'solid'; s.radius ??= 0; }
    }
    render();
    if (isFinal) commit();
  }
  const propsEl = $('#props');
  function readField(t) {
    const key = t.dataset.key;
    if (t.dataset.sizepx) { const v = parseFloat(t.value); return isFinite(v) && v > 0 ? { key: 'size', v: Math.min(200, Math.max(2, v)) } : undefined; }
    const p = key === 'italic' ? { type: 'checkbox' } : PROPS.find((q) => q.key === key);
    if (!p) return;
    let v = t.value;
    if (p.type === 'number' || p.type === 'width') { v = parseFloat(v); if (!isFinite(v)) return; if (p.min != null) v = Math.max(p.min, v); }
    if (p.type === 'range') { v = parseFloat(v); const sp = t.parentElement.querySelector('.val'); if (sp) sp.textContent = r2(v); }
    if (p.type === 'checkbox' || p.type === 'bi' || key === 'italic') v = t.checked;
    if (key === 'size' && v === 'custom') v = r2(TD.sizePx(selected()[0]?.size ?? state.defaults.size));
    return { key, v };
  }
  const panelOf = (t) => {
    const el = t.closest('[data-panel]');
    return el && selected().length === 1 ? { panel: TD.panels[el.dataset.panel], s: selected()[0] } : null;
  };
  propsEl.addEventListener('input', (e) => {
    const t = e.target;
    const pn = panelOf(t);
    // the panel follows each keystroke: other fields show what this one changed (TD.morph keeps this one as typed)
    if (pn) { begin(); pn.panel.apply(pn.s, t); render(); renderPanel(); return; }
    if (t.dataset.geom || t.dataset.sizepx) return;
    const r = readField(t);
    if (r) applyProp(r.key, r.v, false);
  });
  propsEl.addEventListener('change', (e) => {
    const t = e.target;
    const pn = panelOf(t);
    if (pn) {
      begin();
      const rerender = pn.panel.apply(pn.s, t);
      render(); commit();
      if (rerender || t.tagName === 'SELECT' || t.type === 'checkbox') renderPanel(); else refreshPanelErrors();
      return;
    }
    if (t.dataset.geom) {
      const v = parseFloat(t.value);
      if (!isFinite(v)) return;
      const s = selected()[0];
      begin();
      s[t.dataset.geom] = fromUnit(v, t.dataset.kind);
      if (CONNECT.has(s.type)) { const g = t.dataset.geom; if (g === 'x1' || g === 'y1') delete s.link1; if (g === 'x2' || g === 'y2') delete s.link2; } // typed coordinates let go
      if (s.type === 'arc' && t.dataset.geom === 'a2' && s.a2 <= s.a1) s.a2 += 360;
      if (t.dataset.geom === 'tw' || t.dataset.geom === 'th') {
        s.tw = Math.max(0, s.tw || 0); s.th = Math.max(0, s.th || 0);
        if (s.tw > 0 && !s.align) s.align = 'left';
        render(); commit(); renderProps(); return;
      }
      render(); commit();
      return;
    }
    const r = readField(t);
    if (r) {
      applyProp(r.key, r.v, true);
      if (['label', 'closed', 'boxed'].includes(r.key)) renderProps();
      if (r.key === 'size') { const px = t.closest('.ctl').querySelector('[data-sizepx]'), sl = t.closest('.ctl').querySelector('select'); if (px) px.value = r2(TD.sizePx(r.v)); if (sl) sl.value = typeof r.v === 'number' ? 'custom' : r.v; }
    }
  });
  // re-render only the custom panel (keeps generic fields untouched)
  function renderPanel() {
    const el = propsEl.querySelector('[data-panel]');
    const s = selected()[0];
    if (!el || !s) return;
    const sc = propsEl.scrollTop;
    TD.morph(el, TD.panels[s.type].html(s));
    propsEl.scrollTop = sc;
  }
  function refreshPanelErrors() {
    const el = propsEl.querySelector('[data-panel]');
    const s = selected()[0];
    if (!el || !s) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = TD.panels[s.type].html(s);
    const a = el.querySelectorAll('.ser'), b = tmp.querySelectorAll('.ser');
    a.forEach((sec, i) => {
      const e1 = sec.querySelector('.err'), e2 = b[i] && b[i].querySelector('.err');
      if (e1 && !e2) e1.remove();
      else if (e2 && !e1) sec.querySelector('.row:has([data-sk="expr"]), .row.col')?.after(e2);
      else if (e1 && e2) e1.textContent = e2.textContent;
    });
  }
  // colour buttons open the popover picker
  function openPicker(btn, get, set, nullable, rerender, fills) {
    let started = false;
    const paint = (v) => {
      btn.classList.toggle('none', !v);
      btn.querySelector('span').style.background = TD.fillCss(v);
      const cv = btn.parentElement.querySelector('.cval');
      if (cv) cv.textContent = TD.fillLabel(v);
    };
    TD.openColorPicker(btn, {
      value: get(), nullable, fills,
      onInput(v) { if (!started) { begin(); started = true; } set(v); paint(v); render(); },
      onChange(v) { if (!started) { begin(); started = true; } set(v); paint(v); render(); },
      onClose() { commit(); if (rerender) rerender(); },
    });
  }
  propsEl.addEventListener('click', (e) => {
    const cb = e.target.closest('[data-color]');
    if (cb) {
      const key = cb.dataset.color;
      const target = $('#props .sec[data-target]')?.dataset.target;
      const fills = !!cb.dataset.fills;
      if (target === 'defaults') openPicker(cb, () => state.defaults[key], (v) => { state.defaults[key] = v; savePrefs(); }, !!cb.dataset.nullable, null, fills);
      else {
        const list = selected().filter((s) => s[key] !== undefined);
        openPicker(cb, () => list[0] && list[0][key], (v) => { for (const s of list) s[key] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }, !!cb.dataset.nullable, null, fills);
      }
      return;
    }
    const dd = e.target.closest('[data-dd]');
    if (dd) { openDd(dd); return; }
    const al = e.target.closest('[data-alignv]');
    if (al) { applyProp('align', al.dataset.alignv, true); renderProps(); return; }
    const sc = e.target.closest('[data-sercolor]');
    if (sc) {
      const s = selected()[0], h = TD.panels[s.type].color(s, +sc.dataset.sercolor);
      openPicker(sc, h.get, h.set, h.nullable);
      return;
    }
    const pa = e.target.closest('[data-panel] [data-act]');
    if (pa) {
      const s = selected()[0];
      begin();
      const msg = TD.panels[s.type].action(s, pa.dataset.act, +pa.dataset.i);
      render(); commit(); renderPanel();
      if (typeof msg === 'string') showHint(msg, 1500);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'front' || act === 'back') reorder(act);
    if (act === 'group') groupSel();
    if (act?.startsWith('cb:')) combineSel(act.slice(3));
    if (act === 'ungroup') ungroupSel();
    if (act && act.startsWith('l:')) alignSel(act.slice(2));
    if (act === 'dup') duplicate();
    if (act === 'del') deleteSel();
    if (act === 'pt:add' || act === 'pt:rm') { const s = selected()[0]; if (s && s.type === 'poly') TD.polyPoints[act === 'pt:add' ? 'add' : 'remove'](s); }
  });
  propsEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });


  // ---------------- commands ----------------
  function deleteSel() {
    if (!state.sel.size) return;
    begin();
    state.doc.shapes = state.doc.shapes.filter((s) => !state.sel.has(s.id));
    state.sel.clear();
    commit(); render(); renderProps();
  }
  function reorder(dir) {
    begin();
    const sel = selected(), rest = shapes().filter((s) => !state.sel.has(s.id));
    state.doc.shapes = dir === 'front' ? rest.concat(sel) : sel.concat(rest);
    commit(); render();
  }
  function pasteShapes(list, dx, dy = dx) {
    begin();
    state.sel.clear();
    const gmap = new Map(), idmap = new Map(), made = [];
    for (const o of list) {
      const s = clone(o); s.id = uid(); idmap.set(o.id, s.id); made.push(s);
      if (s.g) { if (!gmap.has(s.g)) gmap.set(s.g, uid()); s.g = gmap.get(s.g); }
      TD.translate(s, dx, dy);
      addShape(s); state.sel.add(s.id);
    }
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
    const c = store.get(LS_CLIP, null);
    if (c && validShapes(c.shapes) && (!clipboard || c.t > clipboard.t)) clipboard = { shapes: c.shapes, n: 0, t: c.t };
    return clipboard;
  }
  // Paste lands centred in the visible canvas, moved by whole grid steps so it stays on the grid.
  // Pasting again without moving the view steps each copy down-right, so they don't stack.
  function paste() {
    const c = clip();
    if (!c) return;
    const r = stageSize(), v = state.view, G = TD.GRID;
    const cx = v.x + r.w / 2 / v.zoom, cy = v.y + r.h / 2 / v.zoom;
    const at = `${Math.round(cx / G)},${Math.round(cy / G)}`;
    if (c.at !== at) { c.at = at; c.n = 0; }
    const b = TD.bboxOf(c.shapes.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }));
    const step = G * 2 * c.n++;
    pasteShapes(c.shapes, Math.round((cx - b.x - b.w / 2) / G) * G + step, Math.round((cy - b.y - b.h / 2) / G) * G + step);
  }
  // ---------- combine (shape booleans) ----------
  const COMBINE = [['unite', 'Unite'], ['intersect', 'Intersect'], ['subtract', 'Subtract'], ['exclude', 'Exclude'], ['divide', 'Divide']];
  const COMBINE_IC = {
    unite: '<path d="M3 3h9v5h5v9H8v-5H3z" fill="currentColor" stroke="none"/>',
    intersect: '<path d="M3 3h9v9H3zM8 8h9v9H8z" fill="none"/><path d="M8 8h4v4H8z" fill="currentColor" stroke="none"/>',
    subtract: '<path d="M3 3h9v5H8v4H3z" fill="currentColor" stroke="none"/><path d="M8 8h9v9H8z" fill="none" stroke-dasharray="2 1.5"/>',
    exclude: '<path d="M3 3h9v5H8v4H3zM12 8h5v9H8v-5h4z" fill="currentColor" stroke="none"/><path d="M8 8h4v4H8z" fill="none"/>',
    divide: '<path d="M3 3h9v9H3zM8 8h9v9H8z" fill="none"/><path d="M8 8h4v4H8z" fill="currentColor" stroke="none" opacity=".5"/>',
  };
  const combinable = () => { const sel = selected(); return sel.length > 1 && sel.every((s) => TD.canCombine && TD.canCombine(s)); };
  function combineSel(op) {
    const sel = selected();
    if (sel.length < 2) return showHint('Select two or more closed shapes to combine', 1500);
    if (!combinable()) return showHint('Combine works on closed shapes: rectangles, ellipses, closed polylines, filled symbols, regions', 2200);
    const all = shapes(), list = sel.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b));
    let res;
    try { res = TD.combineGeom(list, op); } catch (e) { console.error(e); res = null; }
    if (!res) return showHint('Could not combine these shapes', 1500);
    begin();
    const at = all.indexOf(list[0]);
    const made = res.map((r) => ({ id: uid(), type: 'region', rings: r.rings, ...TD.regionStyle(r.from) }));
    const rest = all.filter((s) => !state.sel.has(s.id)), pos = rest.filter((s) => all.indexOf(s) < at).length;
    state.doc.shapes = [...rest.slice(0, pos), ...made, ...rest.slice(pos)];
    state.sel = new Set(made.map((s) => s.id));
    commit(); render(); renderProps();
    showHint(made.length ? `${COMBINE.find((c) => c[0] === op)[1]}: ${made.length} shape${made.length > 1 ? 's' : ''}` : 'Nothing left: the shapes do not overlap that way', 1500);
  }
  // ---------- groups ----------
  function groupIds(id) {
    const s = byId(id);
    return s && s.g ? shapes().filter((q) => q.g === s.g).map((q) => q.id) : [id];
  }
  function expandGroups() {
    const gs = new Set(selected().map((s) => s.g).filter(Boolean));
    if (gs.size) for (const q of shapes()) if (gs.has(q.g)) state.sel.add(q.id);
  }
  function unionBox(list) {
    return TD.bboxOf(list.flatMap((s) => { const b = TD.bbox(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0);
  }
  const canGroup = () => { const sel = selected(); return sel.length > 1 && !(sel[0].g && sel.every((s) => s.g === sel[0].g)); };
  const canUngroup = () => selected().some((s) => s.g);
  function groupSel() {
    if (!canGroup()) return;
    begin();
    const g = uid();
    for (const s of selected()) s.g = g;
    // keep members adjacent in z-order (at the topmost member's position)
    const sel = selected(), all = shapes();
    let top = 0;
    all.forEach((s, i) => { if (state.sel.has(s.id)) top = i; });
    const rest = all.filter((s) => !state.sel.has(s.id)), at = all.slice(0, top).filter((s) => !state.sel.has(s.id)).length;
    state.doc.shapes = [...rest.slice(0, at), ...sel, ...rest.slice(at)];
    commit(); render(); renderProps(); showHint(`Grouped ${sel.length} objects`, 1000);
  }
  function ungroupSel() {
    if (!canUngroup()) return;
    begin();
    for (const s of selected()) { delete s.g; delete s.gname; }
    commit(); render(); renderProps(); showHint('Ungrouped', 1000);
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
  let layersKey = '', layersRaf = 0, layerHover = null, layerAnchor = null, layerDrag = null, layerPressKey = null;
  const pickable = (s) => s && !s.hidden && !s.locked;
  function pruneSel() { for (const id of [...state.sel]) if (!pickable(byId(id))) state.sel.delete(id); }
  function autoName(s) {
    const t = ((s.type === 'text' ? s.text : s.label) || '').replace(/\s+/g, ' ').trim();
    return t ? (t.length > 48 ? t.slice(0, 48) + '…' : t) : (TYPES[s.type] && TYPES[s.type].name) || s.type;
  }
  const layerName = (s) => s.name || autoName(s);
  const groupName = (g) => (shapes().find((q) => q.g === g && q.gname) || {}).gname || 'Group';
  // a small picture of the shape, drawn as it exports; remembered against the shape's data
  const thumbs = new Map();
  function thumb(s) {
    const key = JSON.stringify(s), m = thumbs.get(s.id);
    if (m && m.key === key) return m.html;
    let html = '';
    try {
      const b = TD.bbox(s), pad = Math.max(b.w, b.h, 4) * 0.1;
      TD.takeFillDefs();
      const body = TYPES[s.type].svg(s, { zoom: 1, hit: 0, export: true, scene: [s] }), defs = TD.takeFillDefs() || '';
      html = `<svg viewBox="${r2(b.x - pad)} ${r2(b.y - pad)} ${r2(b.w + 2 * pad)} ${r2(b.h + 2 * pad)}" aria-hidden="true">${defs}${body}</svg>`;
    } catch (err) { html = ''; }
    thumbs.set(s.id, { key, html });
    return html;
  }
  const LIC = {
    chev: '<path d="M8 6l4 4-4 4"/>',
    folder: '<path d="M2.5 5.5v10h15v-8H9.5L8 5.5z"/>',
    text: '<path d="M5 5h10M10 5v11"/>',
  };
  const lsvg = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  // the rows, top of the stack first; a group at its topmost member
  function layerRows() {
    const all = shapes(), rows = [], seen = new Set();
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (!s.g) { rows.push({ s }); continue; }
      if (seen.has(s.g)) continue;
      seen.add(s.g);
      const m = all.filter((q) => q.g === s.g).reverse();
      rows.push({ g: s.g, m });
      if (openGroups.has(s.g)) for (const q of m) rows.push({ s: q, in: s.g });
    }
    return rows;
  }
  function rowHtml(r) {
    const flags = (list) => ({ on: list.every((q) => state.sel.has(q.id)), hid: list.every((q) => q.hidden), lk: list.every((q) => q.locked) });
    const cls = (f) => `${f.on ? ' on' : ''}${f.hid ? ' hid' : ''}${f.lk ? ' lk' : ''}`;
    const eye = (f) => `<button class="ly-eye" data-la="eye" title="${f.hid ? 'Show' : 'Hide'}" aria-label="${f.hid ? 'Show' : 'Hide'}">${lsvg(IC[f.hid ? 'eyeoff' : 'eye'])}</button>`;
    const lock = (f) => `<button class="ly-lock" data-la="lock" title="${f.lk ? 'Unlock' : 'Lock'}" aria-label="${f.lk ? 'Unlock' : 'Lock'}">${lsvg(IC[f.lk ? 'lock' : 'unlock'])}</button>`;
    if (r.g) {
      const f = flags(r.m), open = openGroups.has(r.g);
      return `<div class="ly-row ly-grp${cls(f)}" data-g="${r.g}" role="option" aria-selected="${f.on}" aria-expanded="${open}">${eye(f)}` +
        `<button class="ly-chev${open ? ' open' : ''}" data-la="fold" title="${open ? 'Fold' : 'Unfold'}" aria-label="${open ? 'Fold group' : 'Unfold group'}">${lsvg(LIC.chev)}</button>` +
        `<span class="ly-th ly-ic">${lsvg(LIC.folder)}</span><span class="ly-nm">${esc(groupName(r.g))}</span><small>${r.m.length}</small>${lock(f)}</div>`;
    }
    const s = r.s, f = flags([s]);
    return `<div class="ly-row${r.in ? ' ly-in' : ''}${cls(f)}" data-id="${s.id}" role="option" aria-selected="${f.on}">${eye(f)}<span class="ly-pad"></span>` +
      `<span class="ly-th${s.type === 'text' ? ' ly-ic' : ''}">${s.type === 'text' ? lsvg(LIC.text) : thumb(s)}</span><span class="ly-nm">${esc(layerName(s))}</span>${lock(f)}</div>`;
  }
  function scheduleLayers() {
    if (layersRaf) return;
    layersRaf = requestAnimationFrame(() => { layersRaf = 0; renderLayers(); });
  }
  function renderLayers() {
    if (!layersEl) return;
    const n = state.mode === 'document' ? 0 : shapes().length;
    $('#layersCount').textContent = n ? String(n) : '';
    if (state.mode === 'document' || layersWin.classList.contains('collapsed')) { layersKey = ''; return; }
    if (drag || layerDrag || layersEl.querySelector('.ly-ed')) return; // the call after the drag or rename catches up
    const key = [state.docId, state.mode, [...openGroups].join(), [...state.sel].join(), ...shapes().map((s) => JSON.stringify(s))].join('\u0001');
    if (key === layersKey) return;
    layersKey = key;
    const sc = layersEl.scrollTop;
    layersEl.innerHTML = n ? layerRows().map(rowHtml).join('') : '<div class="ly-empty">Shapes you draw are listed here, the top one first.</div>';
    layersEl.scrollTop = sc;
    const sel = state.sel.size;
    $('#layersFoot [data-la="newgroup"]').disabled = !canGroup();
    $('#layersFoot [data-la="ungroup"]').disabled = !canUngroup();
    $('#layersFoot [data-la="del"]').disabled = !sel;
    if (thumbs.size > n + 200) { const ids = new Set(shapes().map((s) => s.id)); for (const id of [...thumbs.keys()]) if (!ids.has(id)) thumbs.delete(id); }
  }
  // the shapes a row stands for, bottom first
  const rowIds = (row) => (row.dataset.g ? shapes().filter((q) => q.g === row.dataset.g).map((q) => q.id) : [row.dataset.id]);
  const rowKey = (row) => (row.dataset.g ? 'g:' + row.dataset.g : row.dataset.id);
  const rowByKey = (k) => (k ? layersEl.querySelector(k.startsWith('g:') ? `.ly-row[data-g="${k.slice(2)}"]` : `.ly-row[data-id="${k}"]`) : null);
  const keyIds = (k) => (k.startsWith('g:') ? shapes().filter((q) => q.g === k.slice(2)).map((q) => q.id) : [k]);
  function selectRow(row, e) {
    const ids = rowIds(row);
    if (!ids.some((id) => pickable(byId(id)))) { showHint(ids.every((id) => byId(id).hidden) ? 'Hidden: show it to select it' : 'Locked: unlock it to select it', 1400); return; }
    const rows = [...layersEl.querySelectorAll('.ly-row')], a = rowByKey(layerAnchor);
    if (e.shiftKey && a) {
      const i = rows.indexOf(a), j = rows.indexOf(row);
      state.sel = new Set();
      for (const r of rows.slice(Math.min(i, j), Math.max(i, j) + 1)) for (const id of rowIds(r)) state.sel.add(id);
    } else if (e.metaKey || e.ctrlKey) {
      const all = ids.every((id) => state.sel.has(id));
      for (const id of ids) all ? state.sel.delete(id) : state.sel.add(id);
      layerAnchor = rowKey(row);
    } else { state.sel = new Set(ids); layerAnchor = rowKey(row); }
    renderOverlay(); renderProps();
  }
  function setLayerFlag(ids, key, on) {
    begin();
    for (const id of ids) { const s = byId(id); if (!s) continue; if (on) s[key] = true; else delete s[key]; }
    commit(); render(); renderProps();
  }
  function deleteIds(ids) {
    const set = new Set(ids);
    begin();
    state.doc.shapes = shapes().filter((s) => !set.has(s.id));
    for (const id of ids) state.sel.delete(id);
    commit(); render(); renderProps();
  }
  function layerAction(a, key) {
    const ids = keyIds(key), ls = ids.map(byId).filter(Boolean);
    if (a === 'rename') { const r = rowByKey(key); if (r) renameRow(r); }
    if (a === 'hide' || a === 'show') setLayerFlag(ids, 'hidden', a === 'hide');
    if (a === 'lock' || a === 'unlock') setLayerFlag(ids, 'locked', a === 'lock');
    if (a === 'del' && ls.length) deleteIds(ids);
  }
  function renameRow(row) {
    const nm = row.querySelector('.ly-nm');
    if (!nm) return;
    const g = row.dataset.g, s = g ? null : byId(row.dataset.id), cur = g ? groupName(g) : layerName(s);
    const inp = document.createElement('input');
    inp.className = 'ly-ed'; inp.value = cur; inp.spellcheck = false; inp.setAttribute('aria-label', 'Layer name');
    nm.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      inp.replaceWith(nm);
      if (ok && v !== cur) {
        begin();
        if (g) { for (const q of shapes()) if (q.g === g) { if (v && v !== 'Group') q.gname = v; else delete q.gname; } }
        else if (s) { if (v && v !== autoName(s)) s.name = v; else delete s.name; }
        commit();
      }
      layersKey = ''; render(); renderProps();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } if (e.key === 'Escape') { e.preventDefault(); end(false); } });
    inp.addEventListener('blur', () => end(true));
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  // drop the dragged shapes above or below a row; a member row of an open group (or the lower half of an open
  // group's own row) takes them into that group, anywhere else takes them out. A dragged group stays whole.
  function dropTarget(e) {
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('#layers .ly-row');
    if (!row || row.classList.contains('drag')) return null;
    const r = row.getBoundingClientRect(), upper = e.clientY < r.top + r.height / 2;
    if (row.dataset.g && !upper && openGroups.has(row.dataset.g) && !layerDrag.group) return { row, mode: 'into' };
    return { row, mode: upper ? 'above' : 'below' };
  }
  function dropLayers(t) {
    const all = shapes(), moving = all.filter((s) => layerDrag.ids.has(s.id)), r = t.row;
    let anchor, above, into = null;
    if (r.dataset.g) {
      const m = all.filter((q) => q.g === r.dataset.g);
      if (t.mode === 'into') { anchor = m[m.length - 1]; above = true; into = r.dataset.g; }
      else if (t.mode === 'above') { anchor = m[m.length - 1]; above = true; }
      else { anchor = m[0]; above = false; }
    } else {
      anchor = byId(r.dataset.id); above = t.mode === 'above';
      if (r.classList.contains('ly-in')) {
        into = anchor.g;
        if (layerDrag.group) { const m = all.filter((q) => q.g === into); anchor = above ? m[m.length - 1] : m[0]; into = null; }
      }
    }
    if (!anchor || layerDrag.ids.has(anchor.id)) return;
    const rest = all.filter((s) => !layerDrag.ids.has(s.id));
    const i = rest.indexOf(anchor) + (above ? 1 : 0);
    begin();
    if (!layerDrag.group) for (const s of moving) {
      if (into) { s.g = into; const gn = rest.find((q) => q.g === into && q.gname); if (gn) s.gname = gn.gname; else delete s.gname; }
      else { delete s.g; delete s.gname; }
    }
    state.doc.shapes = [...rest.slice(0, i), ...moving, ...rest.slice(i)];
    commit(); render(); renderProps();
  }
  function clearDropMarks() { for (const el of layersEl.querySelectorAll('.drop-above, .drop-below, .drop-into, .drag')) el.classList.remove('drop-above', 'drop-below', 'drop-into', 'drag'); }
  if (layersEl) {
    layersEl.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.ly-row');
      if (!row || e.button !== 0 || e.target.closest('button, input')) return;
      layerPressKey = rowKey(row);
      const ids = rowIds(row), already = ids.every((id) => state.sel.has(id));
      // a click on a row of the selection keeps it until the pointer comes up, so the whole selection can be dragged
      if (!already || e.shiftKey || e.metaKey || e.ctrlKey) selectRow(row, e);
      const dragIds = ids.every((id) => state.sel.has(id)) ? new Set(state.sel) : new Set(ids);
      layerDrag = { row, y: e.clientY, on: false, ids: dragIds, group: !!row.dataset.g, plain: already && !(e.shiftKey || e.metaKey || e.ctrlKey), e };
      layersEl.setPointerCapture(e.pointerId);
    });
    layersEl.addEventListener('pointermove', (e) => {
      if (!layerDrag) {
        const row = e.target.closest('.ly-row'), ids = row ? rowIds(row) : null, k = ids ? ids.join() : '';
        if (k !== (layerHover || []).join()) { layerHover = ids; renderOverlay(); }
        return;
      }
      if (!layerDrag.on) {
        if (Math.abs(e.clientY - layerDrag.y) < 4) return;
        layerDrag.on = true;
        for (const r of layersEl.querySelectorAll('.ly-row')) if (rowIds(r).every((id) => layerDrag.ids.has(id))) r.classList.add('drag');
      }
      for (const el of layersEl.querySelectorAll('.drop-above, .drop-below, .drop-into')) el.classList.remove('drop-above', 'drop-below', 'drop-into');
      const t = dropTarget(e);
      if (t) t.row.classList.add('drop-' + t.mode);
      const r = layersEl.getBoundingClientRect(); // scroll near the ends
      if (e.clientY < r.top + 16) layersEl.scrollTop -= 8; else if (e.clientY > r.bottom - 16) layersEl.scrollTop += 8;
    });
    const endDrag = (e, ok) => {
      const d = layerDrag;
      if (!d) return;
      layerDrag = null;
      if (d.on) { const t = ok ? dropTarget(Object.assign({}, { clientX: e.clientX, clientY: e.clientY })) : null; clearDropMarks(); layerDrag = d; if (t) dropLayers(t); layerDrag = null; layersKey = ''; renderLayers(); }
      else if (ok && d.plain) selectRow(d.row, d.e);
      scheduleLayers(); // the rebuild skipped while the button was down
    };
    layersEl.addEventListener('pointerup', (e) => endDrag(e, true));
    layersEl.addEventListener('pointercancel', (e) => endDrag(e, false));
    layersEl.addEventListener('pointerleave', () => { if (!layerDrag && layerHover) { layerHover = null; renderOverlay(); } });
    layersEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-la]'), row = e.target.closest('.ly-row');
      if (!b || !row) return;
      const ids = rowIds(row), ls = ids.map(byId);
      if (b.dataset.la === 'eye') setLayerFlag(ids, 'hidden', !ls.every((q) => q.hidden));
      if (b.dataset.la === 'lock') setLayerFlag(ids, 'locked', !ls.every((q) => q.locked));
      if (b.dataset.la === 'fold') { const g = row.dataset.g; if (openGroups.has(g)) openGroups.delete(g); else openGroups.add(g); renderLayers(); }
    });
    layersEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input')) return;
      // the first click may have rebuilt the rows, so find the row again by what it stands for
      const hit = e.target.closest('.ly-row'), row = rowByKey(hit && hit.isConnected ? rowKey(hit) : layerPressKey);
      if (!row) return;
      renderLayers();
      const live = rowByKey(rowKey(row));
      if (live) renameRow(live);
    });
    layersEl.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.ly-row');
      e.preventDefault();
      if (!row) { openCtx(e.clientX, e.clientY); return; }
      const ids = rowIds(row);
      if (ids.some((id) => pickable(byId(id))) && !ids.every((id) => state.sel.has(id))) selectRow(row, { shiftKey: false, metaKey: false, ctrlKey: false });
      openCtx(e.clientX, e.clientY, { key: rowKey(row), ids });
    });
    $('#layersFoot').addEventListener('click', (e) => {
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
  function arrange(how) {
    if (!state.sel.size) return;
    if (how === 'front' || how === 'back') return reorder(how);
    begin();
    const a = shapes().slice(), inSel = (s) => state.sel.has(s.id);
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
  function transformSel(how) {
    const sel = selected();
    if (!sel.length) return;
    const b = unionBox(sel), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const M = { cw: (dx, dy) => [-dy, dx], ccw: (dx, dy) => [dy, -dx], fliph: (dx, dy) => [-dx, dy], flipv: (dx, dy) => [dx, -dy] }[how];
    const P = (x, y) => { const [u, v] = M(x - cx, y - cy); return [cx + u, cy + v]; };
    const quarter = how === 'cw' || how === 'ccw';
    begin();
    if (how === 'fliph' || how === 'flipv') for (const s of sel) if (TD.ROT_TYPES.has(s.type) && s.angle) s.angle = -s.angle;
    for (const s of sel) {
      const t = TYPES[s.type];
      if (s.type === 'poly') { s.pts = s.pts.map(([x, y]) => P(x, y)); continue; }
      if (s.type === 'region') { s.rings = s.rings.map((r) => r.map(([x, y]) => P(x, y))); continue; }
      if (s.type === 'sym') {
        const [ax, ay] = P(s.x, s.y), [bx, by] = P(s.x + s.w, s.y + s.h);
        Object.assign(s, { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
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
        Object.assign(s, { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
        continue;
      }
      if (['plot', 'cd', 'qc', 'cz', 'forest', 'zx', 'bloch'].includes(s.type)) {
        // content is not rotated: move the object so its centre follows the transform
        const bb = TD.bbox(s), [nx, ny] = P(bb.x + bb.w / 2, bb.y + bb.h / 2);
        TD.translate(s, nx - (bb.x + bb.w / 2), ny - (bb.y + bb.h / 2));
        continue;
      }
      for (const [kx, ky] of t.pts) [s[kx], s[ky]] = P(s[kx], s[ky]);
      if (s.type === 'ellipse' && quarter) [s.rx, s.ry] = [s.ry, s.rx];
      if (s.type === 'arc') {
        const [a1, a2] = [s.a1, s.a2];
        if (how === 'cw') { s.a1 = a1 - 90; s.a2 = a2 - 90; }
        else if (how === 'ccw') { s.a1 = a1 + 90; s.a2 = a2 + 90; }
        else if (how === 'fliph') { s.a1 = 180 - a2; s.a2 = 180 - a1; }
        else { s.a1 = -a2; s.a2 = -a1; }
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
  function alignSel(how) {
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
  function distributeSel(axis) {
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
  async function copyTikz() {
    if (!state.sel.size) return;
    copySel();
    const code = TD.toTikz(selected());
    try { await navigator.clipboard.writeText(code); showHint('TikZ code copied', 1200); }
    catch (e) { openTikz(); }
  }

  // ---------- context menu ----------
  const ctx = document.createElement('div');
  ctx.id = 'ctxMenu'; ctx.className = 'ctx'; ctx.hidden = true;
  document.body.appendChild(ctx);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  // macOS shows shortcuts as glyphs in the standard order ⌃⌥⇧⌘ (HIG keyboards); elsewhere as Ctrl+Shift+K
  const kb = (k) => {
    if (!isMac) return k;
    const parts = k.split('+'), mods = new Set();
    while (parts.length > 1 && ['Ctrl', 'Shift', 'Alt'].includes(parts[0])) mods.add(parts.shift());
    const key = parts.join('+');
    const glyph = { Del: '⌫', Enter: '↩', Esc: '⎋', Shift: '⇧', Alt: '⌥' }[key] || key;
    return (mods.has('Alt') ? '⌥' : '') + (mods.has('Shift') ? '⇧' : '') + (mods.has('Ctrl') ? '⌘' : '') + glyph;
  };
  const ctxOpen = () => !ctx.hidden;
  function closeCtx() { ctx.hidden = true; }
  const IC = {
    copy: '<path d="M7 7h9v10H7z"/><path d="M4 13V3h9"/>',
    cut: '<circle cx="5.5" cy="15" r="2.5"/><circle cx="14.5" cy="15" r="2.5"/><path d="M7 13.2L15 3M13 13.2L5 3"/>',
    paste: '<path d="M6 4H4v14h12V4h-2"/><path d="M7 2.5h6v3H7z"/>',
    dup: '<path d="M3 3h10v10H3z"/><path d="M7 17h10V7"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    group: '<path d="M2.5 2.5h15v15h-15z" stroke-dasharray="2 2"/><path d="M5 5h6v5H5zM9 8h6v6H9z"/>',
    ungroup: '<path d="M3 3h7v6H3zM10 11h7v6h-7z"/>',
    arrange: '<path d="M3 3h9v9H3z" class="f"/><path d="M8 8h9v9H8z"/>',
    rotate: '<path d="M15.5 8A6 6 0 104 11"/><path d="M15.5 3.5V8H11"/>',
    align: '<path d="M3 2v16"/><path d="M6 5h10v3.5H6zM6 11.5h6V15H6z"/>',
    dist: '<path d="M2 3v14M18 3v14"/><path d="M6 6h3v8H6zM11 6h3v8h-3z"/>',
    edit: '<path d="M4 16l1-4 8-8 3 3-8 8z"/>',
    tikz: '<path d="M7 5l-4 5 4 5M13 5l4 5-4 5"/>',
    all: '<path d="M3 3h14v14H3z" stroke-dasharray="2.5 2"/>',
    fit: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>',
    open: '<path d="M2.5 5.5v11h13l2-7H5l-2.5 7"/><path d="M2.5 5.5V3.5h5l1.5 2h6v4"/>',
    save: '<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/>',
    saveas: '<path d="M8 3v8M5 8l3 3 3-3"/><path d="M3.5 12v4.5h9"/><path d="M15 11v6M12 14h6"/>',
    unlink: '<path d="M8.5 11.5l-2 2a2.5 2.5 0 01-3.5-3.5l2-2M11.5 8.5l2-2a2.5 2.5 0 00-3.5-3.5l-2 2"/><path d="M13 13l3.5 3.5M3.5 3.5L7 7"/>',
    exp: '<path d="M10 12V3M6.5 6.5L10 3l3.5 3.5"/><path d="M3.5 10v6.5h13V10"/>',
    rename: '<path d="M3 6h9M3 10h6M3 14h5"/><path d="M11 17l.6-2.6L16 10l2 2-4.4 4.4z"/>',
    newdoc: '<path d="M5 2.5h6.5l3.5 3.5v11.5H5z"/><path d="M10 8.5v6M7 11.5h6"/>',
    eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.5"/>',
    eyeoff: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><path d="M3.5 16.5l13-13"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
    unlock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 015.8-1.1"/>',
  };
  const icon = (n) => (n ? `<svg viewBox="0 0 20 20">${IC[n]}</svg>` : '<span class="ic"></span>');
  function item(label, act, { ic, key, dis, sub } = {}) {
    if (sub) return `<div class="ctx-item has-sub${dis ? ' dis' : ''}">${icon(ic)}<span class="lb">${label}</span><span class="arr">›</span><div class="ctx sub">${sub}</div></div>`;
    return `<button class="ctx-item" data-ctx="${act}"${dis ? ' disabled' : ''}>${icon(ic)}<span class="lb">${label}</span>${key ? `<kbd>${kb(key)}</kbd>` : ''}</button>`;
  }
  const hr = '<hr>';
  // layer: { key, ids } when opened on a row of the Layers window; its Rename / Hide / Lock come first, and a
  // hidden or locked row (which can't be selected) gets only those and Delete
  function openCtx(x, y, layer) {
    const sel = selected(), n = sel.length, nu = n ? units().length : 0;
    let h = '';
    if (layer) {
      const ls = layer.ids.map(byId).filter(Boolean), hid = ls.every((q) => q.hidden), lk = ls.every((q) => q.locked);
      h += item('Rename', 'layer:rename', { ic: 'rename' }) +
        item(hid ? 'Show' : 'Hide', 'layer:' + (hid ? 'show' : 'hide'), { ic: hid ? 'eye' : 'eyeoff' }) +
        item(lk ? 'Unlock' : 'Lock', 'layer:' + (lk ? 'unlock' : 'lock'), { ic: lk ? 'unlock' : 'lock' }) + hr;
      if (ls.some((q) => q.hidden || q.locked)) {
        ctx.innerHTML = h + item('Delete', 'layer:del', { ic: 'del', key: 'Del' });
        ctx.dataset.doc = ''; ctx.dataset.layer = layer.key;
        placeCtx(x, y); return;
      }
    }
    if (n) {
      const one = n === 1 ? sel[0] : null;
      if (one && (one.type === 'text' || one.label !== undefined)) h += item(one.type === 'text' ? 'Edit Text' : 'Edit Label', 'edit', { ic: 'edit', key: 'Enter' }) + hr;
      h += item('Copy', 'copy', { ic: 'copy', key: 'Ctrl+C' }) +
        item('Copy TikZ Code', 'copytikz', { ic: 'tikz' }) +
        (sel.some((s) => (s.text || s.label || '').trim()) ? item('Copy Text', 'copytext', { ic: 'copy' }) : '') +
        item('Cut', 'cut', { ic: 'cut', key: 'Ctrl+X' }) +
        item('Paste', 'paste', { ic: 'paste', key: 'Ctrl+V', dis: !clip() }) +
        item('Duplicate', 'dup', { ic: 'dup', key: 'Ctrl+D' }) +
        item('Delete', 'del', { ic: 'del', key: 'Del' }) + hr;
      if (canGroup()) h += item('Group', 'group', { ic: 'group', key: 'Ctrl+G' });
      if (canUngroup()) h += item('Ungroup', 'ungroup', { ic: 'ungroup', key: 'Ctrl+Shift+G' });
      if (n > 1) h += item('Combine', '', { ic: 'group', dis: !combinable(), sub: COMBINE.map(([k, t]) => item(t, 'cb:' + k)).join('') });
      h += item('Arrange', '', { ic: 'arrange', sub:
          item('Bring to Front', 'a:front', { key: 'Ctrl+Shift+]' }) + item('Bring Forward', 'a:forward', { key: 'Ctrl+]' }) +
          item('Send Backward', 'a:backward', { key: 'Ctrl+[' }) + item('Send to Back', 'a:back', { key: 'Ctrl+Shift+[' }) }) +
        item('Rotate', '', { ic: 'rotate', sub:
          item('Rotate 90° Clockwise', 'r:cw', { key: 'Ctrl+R' }) + item('Rotate 90° Counterclockwise', 'r:ccw', { key: 'Ctrl+Shift+R' }) + hr +
          item('Flip Horizontal', 'r:fliph') + item('Flip Vertical', 'r:flipv') }) +
        item('Align', '', { ic: 'align', dis: nu < 2, sub:
          item('Left', 'l:left') + item('Center', 'l:center') + item('Right', 'l:right') + hr +
          item('Top', 'l:top') + item('Middle', 'l:middle') + item('Bottom', 'l:bottom') }) +
        item('Distribute', '', { ic: 'dist', dis: nu < 3, sub: item('Horizontally', 'd:h') + item('Vertically', 'd:v') });
    } else {
      h += item('Paste', 'paste', { ic: 'paste', key: 'Ctrl+V', dis: !clip() }) +
        item('Select All', 'all', { ic: 'all', key: 'Ctrl+A', dis: !shapes().length }) + hr +
        item('Zoom to Fit', 'fit', { ic: 'fit' }) +
        item(state.grid ? 'Hide Grid' : 'Show Grid', 'grid', { key: 'G' });
    }
    ctx.innerHTML = h;
    ctx.dataset.doc = ''; ctx.dataset.layer = layer ? layer.key : '';
    placeCtx(x, y); // also opens submenus to the left when there is no room on the right
  }
  // ---------- document list: right-click menu ----------
  // Rename, Duplicate, Save As, Copy, Paste and Delete work on the row's file without switching to it;
  // Download, Export and Print act on the open file, so they open the row's file first.
  let docClip = null; // last copied file (project JSON); the system clipboard gets the same text
  const docData = (id) => { if (id === state.docId) saveNow(); return store.get(LS_DOC + id, null); };
  const docEntry = (id) => index().find((d) => d.id === id);
  // project-file JSON for a stored file (the same format Save writes)
  // Project file: { app, version: 3, kind: 'page' | 'classic' | 'board', name, page, sheet | blocks }.
  function projectJson(d) {
    return JSON.stringify({ app: 'diagramtex', version: 3, kind: normKind(d.kind), name: d.name, page: d.page,
      ...(d.kind === 'page' ? { sheet: d.sheet } : { blocks: d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }] }) }, null, 1);
  }
  function docJson(id) {
    const d = docData(id);
    return d ? projectJson(d) : null;
  }
  // store a copy of a file under a new name, listed right after `afterId`; returns the new id
  function storeCopy(d, name, afterId) {
    const id = uid(), kind = normKind(d.kind);
    store.set(LS_DOC + id, { ...JSON.parse(JSON.stringify(d)), kind, name });
    const idx = index(), at = idx.findIndex((x) => x.id === afterId), it = { id, name, kind, updated: Date.now() };
    if (at >= 0) idx.splice(at + 1, 0, it); else idx.push(it);
    store.set(LS_INDEX, idx);
    return id;
  }
  const copyName = (n) => { const names = new Set(index().map((d) => d.name)); let k = 1, t = `${n} copy`; while (names.has(t)) t = `${n} copy ${++k}`; return t; };
  // A project file's contents: { kind, name, page, sheet } or { kind, name, page, blocks }; false if the text
  // isn't JSON, and an error if it is JSON but not a DiagramTeX file.
  function parseProject(text, fallbackName) {
    let d; try { d = JSON.parse(text); } catch { return false; }
    if (!d || typeof d !== 'object') return false;
    const name = d.name || fallbackName || 'Untitled';
    if (d.kind === 'page') {
      if (!d.sheet || !validShapes(d.sheet.shapes)) throw new Error('not a DiagramTeX page file');
      return { kind: 'page', name, page: d.page, sheet: { pages: Math.max(1, d.sheet.pages | 0), shapes: d.sheet.shapes } };
    }
    let blocks = d.blocks || (Array.isArray(d.shapes) ? [{ type: 'diagram', shapes: d.shapes }] : null);
    if (!blocks || blocks.some((b) => b.type === 'diagram' && !validShapes(b.shapes))) throw new Error('not a DiagramTeX file');
    const kind = d.kind === 'board' ? 'board' : 'classic';
    // a whiteboard holds one diagram: imported blocks are merged onto it
    if (kind === 'board') blocks = [{ type: 'diagram', shapes: blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes || []) }];
    return { kind, name, page: d.page, blocks };
  }
  // Open a project file's text (from a file or the clipboard) as a new file. Returns false if it isn't one.
  function openProjectText(text, fallbackName, unique) {
    const p = parseProject(text, fallbackName);
    if (!p) return false;
    let name = p.name;
    if (unique && index().some((x) => x.name === name)) name = copyName(name); // a pasted file never takes an existing name
    if (p.kind === 'page') newDoc(name, null, null, null, p.page, 'page', p.sheet);
    else { newDoc(name, null, null, p.blocks, p.page, p.kind); zoomFit(); }
    return true;
  }
  // Put a project file's contents into an existing file of the app (reopening it from disk).
  function replaceDoc(id, p) {
    const old = store.get(LS_DOC + id, null) || {};
    store.set(LS_DOC + id, p.kind === 'page'
      ? { kind: 'page', name: p.name, page: p.page, sheet: p.sheet, view: old.view, mode: 'page' }
      : { kind: p.kind, name: p.name, blocks: p.blocks, active: 0, page: p.page, view: old.view, mode: p.kind === 'board' ? 'board' : (old.mode === 'document' ? 'document' : 'diagram') });
    const idx = index(), it = idx.find((x) => x.id === id);
    if (it) { it.name = p.name; it.kind = p.kind; it.updated = Date.now(); store.set(LS_INDEX, idx); }
    if (state.docId === id) state.docId = null; // reopen without saving the old contents over the new
    openDoc(id);
  }
  async function pasteDoc() {
    let text = null;
    try { text = await navigator.clipboard.readText(); } catch { /* permission denied: use our own copy */ }
    try {
      if (text && /^\s*\{/.test(text) && openProjectText(text, null, true)) { showHint('Pasted as a new file', 1200); return; }
      if (docClip && openProjectText(docClip, null, true)) { showHint('Pasted as a new file', 1200); return; }
    } catch (err) { showHint('Could not paste: ' + err.message, 2000); return; }
    showHint('Nothing to paste: copy a file first', 1600);
  }
  function placeCtx(x, y) {
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
    ctx.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
    ctx.classList.toggle('flip', x + r.width * 2 > innerWidth);
  }
  function openDocCtx(id, x, y) {
    const it = id && docEntry(id), page = state.doc.kind === 'page', d = (k) => 'doc:' + k, lf = id && TD.files.fileOf(id);
    let h;
    if (it) {
      h = (id !== state.docId ? item('Open', d('open'), { ic: 'open' }) + hr : '') +
        item('Rename…', d('rename'), { ic: 'rename' }) +
        item('Duplicate', d('dup'), { ic: 'dup' }) +
        item('Save a Copy…', d('saveas'), { ic: 'dup' }) + hr +
        item('Copy', d('copy'), { ic: 'copy' }) +
        item('Paste', d('paste'), { ic: 'paste' }) + hr +
        (!TD.files.can ? item('Download (.diagramtex)', d('save'), { ic: 'save', key: id === state.docId ? 'Ctrl+Shift+S' : '' })
          : (lf ? item(`Save to ${lf.name}`, d('save'), { ic: 'save', key: id === state.docId ? 'Ctrl+S' : '' })
            : item('Save to File…', d('save'), { ic: 'save', key: id === state.docId ? 'Ctrl+Shift+S' : '' })) +
            item(lf ? 'Save to Another File…' : 'Save to New File…', d('savenew'), { ic: 'saveas' }) +
            (lf ? item(`Unlink ${lf.name}`, d('unlink'), { ic: 'unlink' }) : '')) +
        item('Export', '', { ic: 'exp', sub:
          item('LaTeX Document (.tex)', d('latex'), { key: id === state.docId ? 'Ctrl+Shift+E' : '' }) +
          (page ? '' : item('TikZ Code…', d('tikz'), { key: id === state.docId ? 'Ctrl+E' : '' })) +
          item('Web Page (.html)', d('html')) +
          item('Image (PNG, SVG, PDF)…', d('image')) + hr +
          item('Print or Save as PDF…', d('print'), { key: id === state.docId ? 'Ctrl+P' : '' }) }) + hr +
        item('Delete', d('del'), { ic: 'del' });
    } else {
      h = item(page ? 'New Page' : 'New Document', d('new'), { ic: 'newdoc' }) +
        item('Open File…', d('openfile'), { ic: 'open', key: 'Ctrl+O' }) + hr +
        item('Paste', d('paste'), { ic: 'paste' });
    }
    ctx.innerHTML = h;
    ctx.dataset.doc = id || '';
    placeCtx(x, y);
  }
  // Rename in place: the row's name becomes a field. Enter or leaving keeps it, Esc cancels; the file stays closed.
  function renameDoc(id, name) {
    if (id === state.docId) { state.doc.name = name; $('#docName').value = name; saveNow(); return; }
    const d = store.get(LS_DOC + id, null);
    if (d) store.set(LS_DOC + id, { ...d, name });
    const idx = index(), it = idx.find((x) => x.id === id);
    if (it) { it.name = name; store.set(LS_INDEX, idx); }
  }
  function renameInList(id) {
    const li = id && $(`#docList li[data-doc="${id}"]`), nm = li && li.querySelector('.nm');
    if (!nm || document.body.classList.contains('no-files')) { // sidebar hidden: rename the open file in the top bar
      if (id !== state.docId) openDoc(id);
      const n = $('#docName'); n.focus(); n.select(); return;
    }
    const old = docEntry(id)?.name || nm.textContent;
    const inp = document.createElement('input');
    inp.className = 'nm-ed'; inp.value = old; inp.setAttribute('aria-label', 'File name'); inp.spellcheck = false;
    nm.replaceWith(inp);
    li.classList.add('renaming');
    let done = false;
    const finish = (keep) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (keep && v && v !== old) renameDoc(id, v);
      renderDocList();
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.focus(); inp.select();
  }
  function docAction(a, id) {
    const it = id && docEntry(id);
    const openFirst = () => { if (id && id !== state.docId) openDoc(id); };
    switch (a) {
      case 'open': openFirst(); break;
      case 'new': newDoc(null, null, null, null, null, state.doc.kind); break;
      case 'openfile': openFile(); break;
      case 'rename': renameInList(id); break;
      case 'dup': { const src = docData(id); if (src) { const n = copyName(it.name); storeCopy(src, n, id); renderDocList(); showHint(`Duplicated as "${n}"`, 1200); } break; }
      case 'saveas': {
        const src = docData(id); if (!src) break;
        TD.prompt('Save a Copy As', copyName(it.name), { ok: 'Save' }).then((name) => {
          if (name != null && name.trim()) openDoc(storeCopy(src, name.trim(), id));
        });
        break;
      }
      case 'copy': {
        docClip = docJson(id);
        if (!docClip) break;
        navigator.clipboard.writeText(docClip).then(() => showHint(`Copied "${it.name}"`, 1000), () => showHint(`Copied "${it.name}" (in this tab only)`, 1400));
        break;
      }
      case 'paste': pasteDoc(); break;
      case 'save': openFirst(); saveFile(); break;
      case 'savenew': openFirst(); saveFile(true); break;
      case 'unlink': { const f = TD.files.fileOf(id); TD.files.unlink(id).then(() => { if (id === state.docId) showSaveState(); if (f) showHint(`No longer linked to ${f.name}`, 1400); }); break; }
      case 'latex': case 'tikz': case 'html': case 'print': openFirst(); runCmd(a); break;
      case 'image': {
        openFirst();
        if (state.mode === 'document') { showHint('Image export works on a diagram: switch to Diagram view first', 2000); break; }
        if (expOpts.fmt === 'html') expOpts.fmt = 'png'; // "Image…" opens on a picture format
        requestAnimationFrame(() => openExport($('#btnExport')));
        break;
      }
      case 'del': deleteDoc(id); break;
    }
  }
  $('#docList').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (editing) finishEdit();
    pop.hidden = true;
    const li = e.target.closest('[data-doc]');
    openDocCtx(li ? li.dataset.doc : null, e.clientX, e.clientY);
  });
  // the empty part of the sidebar's list area also offers New / Open / Paste
  $('#files')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#docList, input, textarea, button')) return;
    e.preventDefault();
    openDocCtx(null, e.clientX, e.clientY);
  });

  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (drag || polyDraft) return;
    if (editing) finishEdit();
    if (state.tool !== 'select') setTool('select');
    const hitG = e.target.closest && e.target.closest('[data-id]');
    if (hitG && !state.sel.has(hitG.dataset.id)) { state.sel = new Set(groupIds(hitG.dataset.id)); renderOverlay(); renderProps(); }
    if (!hitG && state.sel.size && !e.target.closest('[data-handle]')) {
      // right-click inside the current selection's box keeps it; elsewhere clears it
      const p = toWorld(e), b = unionBox(selected());
      if (!(p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)) { state.sel.clear(); renderOverlay(); renderProps(); }
    }
    pop.hidden = true;
    openCtx(e.clientX, e.clientY);
  });
  ctx.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctx]');
    if (!b || b.disabled) return;
    closeCtx();
    const [a, arg] = b.dataset.ctx.split(':');
    if (a === 'doc') { docAction(arg, ctx.dataset.doc); return; }
    if (a === 'edit') { const s = selected()[0]; if (s.type === 'cz') { openCircuit(s.id); return; } if (s.type === 'qc') { openQuantum(s.id); return; } if (s.type === 'forest') { openTree(s.id); return; } if (s.type === 'zx') { openZX(s.id); return; } if (s.type === 'cd') { openCD(s.id); return; } startEdit(s.id, s.type === 'text' ? 'text' : s.type === 'qc' ? 'src' : 'label'); }
    if (a === 'copy') copySel();
    if (a === 'copytikz') copyTikz();
    if (a === 'copytext') {
      const t = selected().map((s) => (s.text || s.label || '').trim()).filter(Boolean).join('\n');
      navigator.clipboard.writeText(t).then(() => showHint('Text copied', 1000), () => showHint('Clipboard not available', 1400));
    }
    if (a === 'cut') { copySel(); deleteSel(); }
    if (a === 'paste') paste();
    if (a === 'dup') duplicate();
    if (a === 'del') deleteSel();
    if (a === 'group') groupSel();
    if (a === 'cb') combineSel(arg);
    if (a === 'ungroup') ungroupSel();
    if (a === 'a') arrange(arg);
    if (a === 'r') transformSel(arg);
    if (a === 'l') alignSel(arg);
    if (a === 'd') distributeSel(arg);
    if (a === 'all') { state.sel = new Set(shapes().map((s) => s.id)); renderOverlay(); renderProps(); }
    if (a === 'layer') layerAction(arg, ctx.dataset.layer || '');
    if (a === 'fit') zoomFit();
    if (a === 'grid') toggleGrid();
  });
  ctx.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => { if (ctxOpen() && !e.target.closest('#ctxMenu')) closeCtx(); }, true);
  window.addEventListener('blur', closeCtx);
  window.addEventListener('resize', closeCtx);

  function nudge(dx, dy) {
    if (!state.sel.size) return;
    begin();
    for (const s of selected()) TD.translate(s, dx, dy);
    detachFrom(selected(), state.sel);
    commit(); render(); renderGeom();
  }

  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable);
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (!imp.hidden) { if (e.key === 'Escape') closeImport(); return; }
    if (e.key === 'Escape' && (openFly || ctxOpen())) { hideFly(); closeCtx(); return; }
    if (mod && !e.altKey) {
      const k0 = e.key.toLowerCase();
      if (k0 === 'e') { e.preventDefault(); runCmd(e.shiftKey ? 'latex' : (state.mode === 'document' ? 'latex' : 'tikz')); return; }
      if (k0 === 's') {
        e.preventDefault();
        if (e.shiftKey || TD.files.fileOf(state.docId)) runCmd('save'); // a file linked to one on disk saves to it
        else { saveNow(); showHint('Saved in this browser — Ctrl+Shift+S saves to a file', 1500); }
        return;
      }
      if (k0 === 'o') { e.preventDefault(); runCmd('open'); return; }
      if (k0 === 'p') { e.preventDefault(); runCmd('print'); return; }
    }
    if (isTyping(e.target)) return;
    if (state.mode === 'document') return;
    const k = e.key.toLowerCase();
    if (mod) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'c') { copySel(); }
      else if (k === 'x') { copySel(); deleteSel(); }
      else if (k === 'v') { e.preventDefault(); paste(); }
      else if (k === 'd') { e.preventDefault(); duplicate(); }
      else if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); }
      else if (k === 'r') { e.preventDefault(); transformSel(e.shiftKey ? 'ccw' : 'cw'); }
      else if (e.code === 'BracketRight') { e.preventDefault(); arrange(e.shiftKey ? 'front' : 'forward'); }
      else if (e.code === 'BracketLeft') { e.preventDefault(); arrange(e.shiftKey ? 'back' : 'backward'); }
      else if (k === 'a') { e.preventDefault(); state.sel = new Set(shapes().map((s) => s.id)); renderOverlay(); renderProps(); }
      return;
    }
    if (e.key === ' ') { spaceDown = true; svg.classList.add('pan-ready'); e.preventDefault(); return; }
    if (state.mode === 'page' && (e.key === 'PageUp' || e.key === 'PageDown')) { e.preventDefault(); goToPage(currentPage() + (e.key === 'PageUp' ? -1 : 1)); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    if (e.key === 'Enter') { if (polyDraft) finishPoly(); else if (state.sel.size === 1) { const s = selected()[0]; if (s.type === 'text' || (s.type === 'sym' && s.text !== undefined)) startEdit(s.id, 'text'); else if (s.type === 'qc') openQuantum(s.id); else if (s.type === 'cz') openCircuit(s.id); else if (s.type === 'forest') openTree(s.id); else if (s.type === 'zx') openZX(s.id); else if (s.type === 'cd') openCD(s.id); else if (s.label !== undefined) startEdit(s.id, 'label'); } return; }
    if (e.key === 'Escape') {
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
    if (TOOL_KEYS[k] && (k !== 'h' || state.mode === 'board')) setTool(TOOL_KEYS[k]);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; svg.classList.remove('pan-ready'); } });
  window.addEventListener('blur', () => { spaceDown = false; svg.classList.remove('pan-ready'); });

  // ---------------- appearance (sidebar) ----------------
  function syncThemeBox() {
    const cur = window.TDTheme ? TDTheme.get() : 'system';
    document.querySelectorAll('#themeBox [data-theme-pick]').forEach((b) => {
      b.classList.toggle('on', b.dataset.themePick === cur);
      b.setAttribute('aria-checked', b.dataset.themePick === cur);
    });
  }
  $('#themeBox').addEventListener('click', (e) => {
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
    const sync = (b) => b.setAttribute('aria-pressed', b.classList.contains('on') || b.classList.contains('active'));
    const sel = 'button.toggle, button[data-tool], button[data-fly]';
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.target.matches(sel) && sync(m.target)));
    ['#topbar', '#tools'].forEach((root) => {
      document.querySelectorAll(`${root} ${sel}`).forEach(sync);
      mo.observe($(root), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  }
  function updateTopbar() {
    const diagrams = state.doc.blocks.map((b, i) => [b, i]).filter(([b]) => b.type === 'diagram');
    const bs = $('#blockSel');
    // in a classic file the picker keeps its room in Document view too, so the view switch doesn't move
    bs.hidden = (state.mode !== 'diagram' && state.mode !== 'document') || diagrams.length < 2;
    bs.style.visibility = state.mode === 'document' ? 'hidden' : '';
    const what = state.mode === 'board' ? 'this whiteboard' : 'this diagram';
    $('#btnExport').title = state.mode === 'page' ? 'Export the page as PNG (choose DPI), SVG or PDF' : `Export ${what} as PNG (choose DPI), SVG or PDF`;
    $('#btnTikz').title = state.mode === 'page' ? 'LaTeX for this page (Ctrl+E)' : `TikZ code for ${what} (Ctrl+E)`;
    bs.innerHTML = diagrams.map(([b, i], n) => `<option value="${i}"${i === state.doc.active ? ' selected' : ''}>Diagram ${n + 1} of ${diagrams.length}</option>`).join('');
    $('#btnUndo').disabled = !state.undo.length;
    $('#btnRedo').disabled = !state.redo.length;
    $('#btnGrid').classList.toggle('on', state.grid);
    $('#btnSnap').classList.toggle('on', state.snap);
    $('#stage').classList.toggle('hide-grid', !state.grid);
    updateStatus();
  }
  function toggleGrid() { state.grid = !state.grid; savePrefs(); updateTopbar(); }
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnGrid').onclick = toggleGrid;
  $('#btnSnap').onclick = () => { state.snap = !state.snap; savePrefs(); updateTopbar(); };
  $('#zoomIn').onclick = () => { const r = stageSize(); zoomAt(1.25, r.w / 2, r.h / 2); };
  $('#zoomOut').onclick = () => { const r = stageSize(); zoomAt(0.8, r.w / 2, r.h / 2); };
  const zoomTo = (z) => { const r = stageSize(); zoomAt(z / state.view.zoom, r.w / 2, r.h / 2); };
  $('#zoomReset').onclick = () => zoomTo(1);
  { // the percentage is a field: click, type a number, Enter (or leave the field) applies, Esc reverts
    const zv = $('#zoomVal');
    const shown = () => Math.round(state.view.zoom * 100) + '%';
    zv.addEventListener('focus', () => requestAnimationFrame(() => zv.select()));
    zv.addEventListener('keydown', (e) => {
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
  { // grid spacing: a field like the zoom percentage (Enter or leaving applies, Esc reverts)
    const gv = $('#gridVal');
    gv.addEventListener('focus', () => requestAnimationFrame(() => gv.select()));
    gv.addEventListener('keydown', (e) => {
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
  $('#zoomFit').onclick = zoomFit;
  document.querySelectorAll('#tools button[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));

  $('#docName').addEventListener('input', (e) => { state.doc.name = e.target.value || 'Untitled'; scheduleSave(); });
  $('#docName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#btnNewDoc').onclick = () => newDoc(null, null, null, null, null, state.doc.kind);
  $('#docList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteDoc(del.dataset.del); return; }
    const li = e.target.closest('[data-doc]');
    if (li && li.dataset.doc !== state.docId) openDoc(li.dataset.doc);
  });

  const slug = () => (state.doc.name || 'diagram').replace(/[^\w\-]+/g, '_');
  function download(name, text, type) {
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
  async function saveFile(pick) {
    finishEdit(); finishPoly(); commit();
    if (state.docId) saveNow();
    const id = state.docId, text = projectJson(state.doc);
    if (!TD.files.can) { download(fileName(), text, FILE_TYPE); return; }
    try {
      const name = await TD.files.saveDoc(id, text, fileName(), pick);
      if (name) showHint(`Saved to ${name}`, 1200);
    } catch (e) {
      showHint(`Couldn't save the file (${e.message}). Downloaded a copy instead.`, 3500);
      download(fileName(), text, FILE_TYPE);
    }
    if (id === state.docId) showSaveState();
  }
  const validShapes = (a) => Array.isArray(a) && a.every((s) => s && TYPES[s.type]);
  const baseName = (n) => n.replace(/(\.diagramtex|(\.page|\.board)?\.json)$/i, '');
  // Open a file from disk: a project file opens as a file of the app (linked to the file on disk when the
  // browser hands over a handle), anything else goes to the LaTeX import.
  async function openText(text, name, handle) {
    if (!/\.(diagramtex|json)$/i.test(name) && !/^\s*\{/.test(text)) { openImport(text); return; }
    try {
      const known = handle && (await TD.files.docFor(handle, index().map((x) => x.id)));
      if (known) { await reopenLinked(known, text, name); return; }
      if (!openProjectText(text, baseName(name))) throw new Error('not valid JSON');
      // an older .json file is not linked: its first save makes a .diagramtex beside it
      if (handle && name.toLowerCase().endsWith(FILE_EXT)) { await TD.files.link(state.docId, handle, projectJson(state.doc), text); showSaveState(); }
    } catch (err) { TD.alert(`Couldn't open "${name}"`, `It isn't a DiagramTeX file (${err.message}).`); }
  }
  // A file already linked to one of the app's files: open that one, and take the file's contents if it
  // changed on disk since it was last saved or opened.
  async function reopenLinked(id, text, name) {
    const fresh = !TD.files.isOnDisk(id, text);
    if (id !== state.docId) openDoc(id);
    if (!fresh) { showHint(`"${name}" is open`, 1200); return; }
    const p = parseProject(text, baseName(name));
    if (!p) throw new Error('not valid JSON');
    if (!TD.files.isSaved(id, projectJson(state.doc)) &&
      !(await TD.confirm(`"${name}" changed on disk`, 'This file also has changes that are not saved to it. Replace them with the version on disk?', { ok: 'Use the Version on Disk' }))) return;
    replaceDoc(id, p);
    await TD.files.link(id, TD.files.fileOf(id).handle, projectJson(state.doc), text);
    showSaveState();
    showHint(`Reloaded "${name}" from disk`, 1400);
  }
  async function openFile() {
    if (!TD.files.can) { $('#fileInput').click(); return; }
    try {
      const f = await TD.files.pickOpen();
      if (f) await openText(await f.file.text(), f.file.name, f.handle);
    } catch (e) { showHint(`Couldn't open the file (${e.message})`, 2500); }
  }
  $('#fileInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) openText(await file.text(), file.name, null);
  };
  // Files opened with the installed app (double-click, or Open With in the system's file manager).
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (p) => {
      await TD.ready; await TD.files.ready;
      for (const h of p.files || []) if (h.kind === 'file') { const f = await h.getFile(); await openText(await f.text(), f.name, h); }
    });
  }

  // Render shapes, then prepend the gradient/pattern <defs> they referenced.
  function fillDefsAround(fn) { TD.takeFillDefs(); const body = fn(); return TD.takeFillDefs() + body; }
  // SVG string for a list of shapes (used for SVG export and the document view)
  function shapesSvg(list, pad = 8, standalone = true) {
    list = list.filter((s) => !s.hidden); // a hidden layer is not exported
    if (!list.length) return '';
    const ctx = { zoom: 1, hit: 0, export: true, scene: list };
    const b = TD.bboxOf(list.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), pad);
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    host.setAttribute('viewBox', `${r2(b.x)} ${r2(b.y)} ${r2(b.w)} ${r2(b.h)}`);
    host.setAttribute('width', r2(b.w)); host.setAttribute('height', r2(b.h));
    host.innerHTML = (standalone ? TD.math.exportStyle() : '') +
      fillDefsAround(() => list.map((s) => TYPES[s.type].svg(s, ctx)).join(''));
    return new XMLSerializer().serializeToString(host);
  }
  const exportSvg = () => { if (shapes().length) out(slug() + '.svg', shapesSvg(shapes()), 'image/svg+xml'); };

  // ---------------- top-bar commands & insert popover ----------------
  const pop = $('#insertPop');
  $('#topbar').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cmd]')?.dataset.cmd;
    if (c) runCmd(c);
  });
  function runCmd(c) {
    if (c === 'new') newDoc(null, null, null, null, null, state.doc.kind);
    if (c === 'open') openFile();
    if (c === 'save') saveFile();
    if (c === 'saveas') saveFile(true);
    if (c === 'tikz') openTikz();
    if (c === 'latex') out(slug() + '.tex', state.mode === 'page' ? TD.pageToLatex(state.doc) : TD.docToLatex(state.doc), 'text/x-tex');
    if (c === 'svg') { if (state.mode === 'page') exportPageSvg(); else if (shapes().length) exportSvg(); else showHint('This diagram is empty', 1200); }
    if (c === 'import') openImport('');
    if (c === 'print') printDoc();
    if (c === 'html') exportHtml();
    if (c === 'export') openExport($('#btnExport'));
  }
  // One self-contained web page (fonts and pictures embedded) of the whole file.
  async function exportHtml() {
    finishEdit();
    let body;
    if (state.doc.kind === 'page') {
      const G = pageGeom(), [defs, sh] = pageSvgs();
      body = `<div class="sheet-pages">${Array.from({ length: G.n }, (_, k) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${r2(pageTop(k, G))} ${r2(G.w)} ${r2(G.h)}" style="width:${G.W}cm;max-width:100%;height:auto;display:block;margin:0 auto 24px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.06)">${defs}${sh}</svg>`).join('')}</div>`;
    }
    await askDir();
    showHint('Building HTML…', 800);
    try {
      await out(slug() + '.html', await TD.docToHtml(body), 'text/html');
      if (TD.mathFontsLinked) showHint('Saved. Maths fonts could not be embedded, so the file loads them online.', 3200);
    }
    catch (e) { showHint('Could not build the HTML file: ' + e.message, 2500); }
  }
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  // Classic reopens the last Classic file in the view it was left in (Diagram or Document).
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { if (state.doc.kind !== b.dataset.kind) { finishEdit(); finishPoly(); commit(); switchKind(b.dataset.kind); } }));
  $('#blockSel').onchange = (e) => setActiveBlock(+e.target.value);

  // Page mode: the sheet as SVG, one <svg> per page (for print) or one tall SVG (for download).
  function pageSvgs() {
    const G = pageGeom(), ctx = { zoom: 1, hit: 0, export: true, scene: shapes() };
    return fillDefsAround(() => '<!--body-->' + shapes().map((s) => TYPES[s.type].svg(s, ctx)).join('')).split('<!--body-->');
  }
  function exportPageSvg() {
    const G = pageGeom(), b = sheetBox(), [defs, body] = pageSvgs();
    let bg = '';
    for (let k = 0; k < G.n; k++) bg += `<rect x="0" y="${r2(pageTop(k, G))}" width="${r2(G.w)}" height="${r2(G.h)}" fill="#fff"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(b.w)} ${r2(b.h)}" width="${G.W}cm" height="${r2(b.h / PX)}cm">${TD.math.exportStyle()}${defs}${bg}${body}</svg>`;
    out(slug() + '.svg', svg, 'image/svg+xml');
  }
  // ---------------- Export menu: PNG (chosen DPI), SVG, PDF ----------------
  // PNG is rasterised in the browser from the same SVG as the SVG export, with the maths fonts embedded
  // so they render inside the image. PDF goes through the browser's own PDF engine (print → Save as PDF)
  // on pages sized exactly to the diagram or the page, so shapes stay vector and text stays real text.
  const EXP_KEY = 'diagramtex.export';
  const expOpts = (() => { try { return { fmt: 'png', dpi: 300, transparent: false, ...JSON.parse(localStorage.getItem(EXP_KEY) || '{}') }; } catch (e) { return { fmt: 'png', dpi: 300, transparent: false }; } })();
  const saveExpOpts = () => { try { localStorage.setItem(EXP_KEY, JSON.stringify(expOpts)); } catch (e) { /* storage blocked */ } };
  let rasterCss = null;
  async function rasterStyle() {
    const eng = TD.math.engine;
    if (!rasterCss || rasterCss[0] !== eng) {
      let fonts = '';
      try { fonts = await TD.inlineMathCss(); } catch (e) { fonts = ''; }
      const own = TD.math.exportStyle().replace(/^<style>|<\/style>$/g, '').replace(/@import[^;]*;/g, '').replace(/@font-face\{[^}]*\}/g, '');
      rasterCss = [eng, fonts + own];
    }
    return `<style>${rasterCss[1].replace(/<\/style/gi, '')}</style>`;
  }
  // what to export: one entry per output page, each { vb: [x,y,w,h] in canvas px, inner: svg markup, bg }
  function exportSources() {
    if (state.mode === 'page') {
      const G = pageGeom(), [defs, body] = pageSvgs();
      return Array.from({ length: G.n }, (_, k) => ({ vb: [0, pageTop(k, G), G.w, G.h], inner: defs + body, page: true }));
    }
    const list = shapes();
    if (!list.length) return [];
    const b = TD.bboxOf(list.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 8);
    const svg = shapesSvg(list, 8, false);
    return [{ vb: [b.x, b.y, b.w, b.h], inner: svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') }];
  }
  const expScale = () => expOpts.dpi / 2.54 / PX; // canvas px → image px
  async function rasterise(src, transparent) {
    const sc = expScale(), [x, y, w, h] = src.vb;
    const W = Math.max(1, Math.round(w * sc)), H = Math.max(1, Math.round(h * sc));
    if (W * H > 16e7 / 4) throw new Error(`${W} × ${H} px is too large; lower the DPI`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}" width="${W}" height="${H}">${await rasterStyle()}${src.inner}</svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    await new Promise((r) => setTimeout(r, 60)); // let the embedded fonts settle
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!transparent) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
    g.drawImage(img, 0, 0, W, H);
    return c;
  }
  // PNG with its DPI recorded (pHYs chunk), so it prints at the diagram's true size
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (const b of u8) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function pngWithDpi(canvas, dpi) {
    const buf = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/png'))).arrayBuffer());
    const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const at = 33; // after the signature (8) and IHDR (25)
    const out = new Uint8Array(buf.length + 21);
    out.set(buf.subarray(0, at)); out.set(chunk, at); out.set(buf.subarray(at), at + 21);
    return new Blob([out], { type: 'image/png' });
  }
  function downloadBlob(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // An export: into the file's export folder when it has one (replacing the copy of the same name),
  // otherwise downloaded.
  async function out(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const dir = TD.files.dirOf(state.docId) && (await TD.files.exportDir(state.docId));
    if (dir) {
      try { await TD.files.writeIn(dir, name, blob); showHint(`Saved ${name} to ${dir.name}`, 1600); return; }
      catch (e) { showHint(`Couldn't save to ${dir.name} (${e.message}). Downloaded instead.`, 3000); }
    } else if (TD.files.dirOf(state.docId)) showHint(`No access to ${TD.files.dirOf(state.docId).name}. Downloaded instead.`, 2500);
    downloadBlob(name, blob);
  }
  // Ask for the export folder's access while the click is fresh, before slow work.
  const askDir = () => (TD.files.dirOf(state.docId) ? TD.files.exportDir(state.docId) : null);
  async function runExport() {
    finishEdit(); finishPoly();
    const fmt = expOpts.fmt;
    if (fmt === 'svg') { runCmd('svg'); return; }
    const srcs = exportSources();
    if (!srcs.length) { showHint('This diagram is empty', 1200); return; }
    if (fmt === 'pdf') { printVector(srcs); return; }
    await askDir();
    showHint(`Exporting ${fmt.toUpperCase()} at ${expOpts.dpi} DPI…`, 1500);
    try {
      for (let k = 0; k < srcs.length; k++) {
        const c = await rasterise(srcs[k], expOpts.transparent && !srcs[k].page);
        await out(slug() + (srcs.length > 1 ? `-p${k + 1}` : '') + '.png', await pngWithDpi(c, expOpts.dpi));
      }
    } catch (e) { showHint('Export failed: ' + (e.message || e), 3000); }
  }
  const expPop = document.createElement('div');
  expPop.className = 'popover exp-pop'; expPop.hidden = true;
  expPop.setAttribute('role', 'dialog'); expPop.setAttribute('aria-label', 'Export');
  document.body.appendChild(expPop);
  const DPIS = [72, 96, 150, 300, 600];
  // Formats: pictures of the diagram or pages, plus the whole file as one web page (the only one in Document view).
  const expFmts = () => (state.mode === 'document' ? [['html', 'Web page']] : [['png', 'PNG'], ['svg', 'SVG'], ['pdf', 'PDF'], ['html', 'Web page']]);
  const expFmt = () => (expFmts().some(([k]) => k === expOpts.fmt) ? expOpts.fmt : expFmts()[0][0]);
  function renderExpPop() {
    const o = expOpts, fmt = expFmt();
    if (fmt === 'html') {
      expPop.innerHTML = `<div class="exp-h">Export ${state.doc.kind === 'classic' ? 'document' : 'file'}</div>
        <div class="seg exp-fmt" role="radiogroup">${expFmts().map(([k, l]) => `<button type="button" role="radio" aria-checked="${fmt === k}" data-efmt="${k}" class="${fmt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="exp-note">The whole file as one self-contained page (.html), with fonts and pictures embedded. Opens in any browser, even offline.</div>
        ${dirRow()}<button type="button" class="primary exp-go" data-ego>${TD.files.dirOf(state.docId) ? 'Save' : 'Download'} web page</button>`;
      return;
    }
    const srcs = exportSources(), sc = expScale();
    const dim = srcs.length ? `${Math.round(srcs[0].vb[2] * sc)} × ${Math.round(srcs[0].vb[3] * sc)} px` : 'empty';
    const cm = srcs.length ? `${r2(srcs[0].vb[2] / PX)} × ${r2(srcs[0].vb[3] / PX)} cm` : '';
    const raster = o.fmt === 'png';
    expPop.innerHTML = `<div class="exp-h">Export ${state.mode === 'page' ? 'page' + (srcs.length > 1 ? 's' : '') : state.mode === 'board' ? 'whiteboard' : 'diagram'}</div>
      <div class="seg exp-fmt" role="radiogroup">${expFmts().map(([k, l]) => `<button type="button" role="radio" aria-checked="${o.fmt === k}" data-efmt="${k}" class="${o.fmt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${raster ? `<div class="exp-row"><label for="expDpi">Resolution</label><span class="exp-dpi"><select id="expDpiSel">${DPIS.map((d) => `<option value="${d}"${d === o.dpi ? ' selected' : ''}>${d} DPI</option>`).join('')}${DPIS.includes(o.dpi) ? '' : `<option value="${o.dpi}" selected>${o.dpi} DPI</option>`}</select><input id="expDpi" type="number" min="24" max="2400" step="1" value="${o.dpi}" aria-label="DPI"></span></div>
      <div class="exp-meta">${dim}${srcs.length > 1 ? ` per page · ${srcs.length} ${o.fmt === 'pdf' ? 'pages' : 'files'}` : ''}<span>${cm}</span></div>` : `<div class="exp-meta">Vector, scales to any size<span>${cm}</span></div>`}
      ${o.fmt === 'png' && state.mode !== 'page' ? `<label class="exp-chk"><input type="checkbox" id="expTr"${o.transparent ? ' checked' : ''}> Transparent background</label>` : ''}
      ${o.fmt === 'pdf' ? `<div class="exp-note">Vector PDF with selectable text${srcs.length > 1 ? `, ${srcs.length} pages` : ''}. In the print window, choose <b>Save as PDF</b> as the destination.</div>` : ''}
      ${o.fmt === 'pdf' ? '' : dirRow()}<button type="button" class="primary exp-go" data-ego>${o.fmt === 'pdf' ? 'Save PDF…' : (TD.files.dirOf(state.docId) ? 'Save ' : 'Download ') + o.fmt.toUpperCase()}</button>`;
  }
  // Where exports go: Downloads, or a folder picked once for this file (where the browser allows it).
  function dirRow() {
    if (!TD.files.can) return '';
    const f = TD.files.dirOf(state.docId);
    return `<div class="exp-row exp-dir"><label>Save to</label><span class="exp-dirv">
      <button type="button" class="exp-dirb" data-edir title="${f ? `Exports of this file go to the folder ${esc(f.name)}, replacing files of the same name. Click to pick another folder.` : 'Exports are downloaded. Click to pick a folder for this file’s exports instead.'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5v10h15v-8H9L7.5 5.5z"/></svg><span>${f ? esc(f.name) : 'Downloads'}</span></button>${f ? `<button type="button" class="icon flat exp-dirx" data-edirx title="Download exports instead" aria-label="Download exports instead"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg></button>` : ''}</span></div>`;
  }
  function openExport(btn) {
    if (!expPop.hidden) { expPop.hidden = true; return; }
    renderExpPop();
    expPop.hidden = false;
    const r = btn.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.body).zoom) || 1;
    expPop.style.top = r.bottom / z + 6 + 'px';
    expPop.style.left = Math.max(8, Math.min(r.right / z - expPop.offsetWidth, innerWidth / z - expPop.offsetWidth - 8)) + 'px';
  }
  expPop.addEventListener('click', (e) => {
    const f = e.target.closest('[data-efmt]');
    if (f) { expOpts.fmt = f.dataset.efmt; saveExpOpts(); renderExpPop(); return; }
    if (e.target.closest('[data-edir]')) { TD.files.pickDir(state.docId).then(() => { if (!expPop.hidden) renderExpPop(); }, (err) => showHint(`Couldn't use that folder (${err.message})`, 2500)); return; }
    if (e.target.closest('[data-edirx]')) { TD.files.clearDir(state.docId).then(() => { if (!expPop.hidden) renderExpPop(); }); return; }
    if (e.target.closest('[data-ego]')) { expPop.hidden = true; if (expFmt() === 'html') exportHtml(); else runExport(); }
  });
  expPop.addEventListener('change', (e) => {
    if (e.target.id === 'expDpiSel' || e.target.id === 'expDpi') { const v = Math.round(+e.target.value); if (v >= 24 && v <= 2400) expOpts.dpi = v; saveExpOpts(); renderExpPop(); }
    if (e.target.id === 'expTr') { expOpts.transparent = e.target.checked; saveExpOpts(); }
  });
  expPop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { expPop.hidden = true; $('#btnExport')?.focus(); } if (e.key === 'Enter' && e.target.id === 'expDpi') e.target.blur(); });
  document.addEventListener('pointerdown', (e) => { if (!expPop.hidden && !expPop.contains(e.target) && !e.target.closest('#btnExport')) expPop.hidden = true; });
  // Print one sheet per export source, each sized exactly to it: the browser's PDF output is vector,
  // with the fonts embedded, so "Save as PDF" here is the vector PDF export.
  function printVector(srcs) {
    let host = $('#pagePrint');
    if (!host) { host = document.createElement('div'); host.id = 'pagePrint'; document.body.appendChild(host); }
    const cm = (v) => r2(v / PX);
    // the live canvas (hidden while printing) holds the same gradient / clip / marker ids, and url(#id)
    // would resolve to those hidden copies, so the printed copy gets ids of its own
    const own = (m, k) => m.replace(/\bid="([^"]+)"/g, `id="pp${k}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#pp${k}-$1)`).replace(/href="#([^"]+)"/g, `href="#pp${k}-$1"`);
    // one @page size per sheet (named pages), so whiteboard diagrams and pages both print edge to edge
    host.innerHTML = srcs.map((s, k) => { const [x, y, w, h] = s.vb;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}" style="width:${cm(w)}cm;height:${cm(h)}cm;page:p${k}">${s.page ? `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="#fff"/>` : ''}${own(s.inner, k)}</svg>`; }).join('');
    let st = $('#pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = srcs.map((s, k) => `@page p${k} { size: ${cm(s.vb[2])}cm ${cm(s.vb[3])}cm; margin: 0; }`).join('\n') +
      `\n@page { size: ${cm(srcs[0].vb[2])}cm ${cm(srcs[0].vb[3])}cm; margin: 0; }`;
    const title = document.title;
    document.title = slug(); // the default file name in "Save as PDF"
    document.body.classList.add('printing-page');
    setTimeout(() => { window.print(); document.body.classList.remove('printing-page'); host.innerHTML = ''; document.title = title; }, 300);
  }
  const printPage = () => printVector(exportSources());
  function printDoc() {
    finishEdit(); finishPoly(); commit();
    if (state.mode === 'page') { printPage(); return; }
    if (TD.docview) TD.docview.render(true);
    document.body.classList.add('printing');
    setTimeout(() => { window.print(); document.body.classList.remove('printing'); if (state.mode === 'document' && TD.docview) TD.docview.render(); }, 300);
  }

  // ---------------- import ----------------
  const imp = $('#importModal');
  function openImport(text) {
    finishEdit(); finishPoly(); commit();
    $('#impText').value = text || '';
    $('#impMsg').textContent = '';
    imp.hidden = false;
    $('#impText').focus();
  }
  function closeImport() { imp.hidden = true; }
  function runImport(asNew) {
    const src = $('#impText').value;
    let res;
    try { res = TD.importLatex(src); } catch (err) { $('#impMsg').textContent = 'Could not parse: ' + err.message; return; }
    const nShapes = res.blocks.reduce((a, b) => a + (b.shapes ? b.shapes.length : 0), 0);
    if (!nShapes && !res.blocks.some((b) => b.type === 'text')) { $('#impMsg').textContent = 'Nothing recognised in this code.' + (res.warnings.length ? ' ' + res.warnings.join(' ') : ''); return; }
    if (asNew && state.doc.kind === 'board') { newDoc(res.title || 'Imported', null, null, res.blocks, res.page, 'board'); zoomFit(); }
    else if (asNew) {
      newDoc(res.title || 'Imported', null, null, res.blocks, res.page);
      if (res.blocks.filter((b) => b.type === 'diagram').length > 1 || res.blocks.some((b) => b.type === 'text')) setMode('document');
      else zoomFit();
    } else {
      begin();
      state.sel.clear();
      for (const b of res.blocks) if (b.type === 'diagram') for (const sh of b.shapes) { sh.id = uid(); addShape(sh); state.sel.add(sh.id); }
      commit();
      if (state.mode === 'document') setMode('diagram');
      render(); renderProps();
    }
    closeImport();
    showHint(`Imported ${nShapes} object${nShapes === 1 ? '' : 's'}${res.warnings.length ? ' · ' + res.warnings.length + ' command(s) skipped' : ''}`, 2500);
  }
  $('#impClose').onclick = closeImport;
  $('#impNew').onclick = () => runImport(true);
  $('#impInsert').onclick = () => runImport(false);
  $('#impFile').onclick = () => $('#fileInput').click();
  imp.addEventListener('pointerdown', (e) => { if (e.target === imp) closeImport(); });

  // TikZ modal
  function genTikz() {
    const selOnly = $('#tikzSelOnly').checked && state.sel.size;
    const list = selOnly ? selected() : shapes();
    $('#tikzOut').value = state.mode === 'page' ? TD.pageToLatex(state.doc, { only: selOnly ? list : null })
      : TD.toTikz(list, { standalone: $('#tikzStandalone').checked });
  }
  function openTikz() {
    finishEdit(); finishPoly(); commit();
    $('#tikzStandalone').parentElement.style.display = state.mode === 'page' ? 'none' : '';
    const ttl = $('#modal .modal-head strong'); if (ttl) ttl.textContent = state.mode === 'page' ? 'LaTeX for This Page' : 'TikZ Code';
    $('#tikzSelWrap').style.display = state.sel.size ? '' : 'none';
    $('#tikzSelOnly').checked = false;
    genTikz();
    $('#modal').hidden = false;
    $('#tikzOut').focus(); $('#tikzOut').setSelectionRange(0, 0); $('#tikzOut').scrollTop = 0;
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#tikzStandalone').onchange = genTikz;
  $('#tikzSelOnly').onchange = genTikz;
  $('#tikzCopy').onclick = async () => {
    const t = $('#tikzOut');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    $('#tikzCopy').textContent = 'Copied';
    setTimeout(() => ($('#tikzCopy').textContent = 'Copy'), 1200);
  };
  $('#tikzDownload').onclick = () => out(slug() + '.tex', $('#tikzOut').value, 'text/x-tex');

  // ---------------- sample diagram ----------------
  // The first file a new user sees: what the app does, in a few lines, and one of each kind of object
  // (text, formulae, shapes, a circuit, a quantum circuit, a plot, a commutative diagram), built from
  // each type's own defaults so it stays in step with the library.
  function sample() {
    const s = [], D = { ...state.defaults, stroke: '#000000', color: '#000000', size: 'normalsize' };
    const add = (type, tool, o) => { const t = TD.TYPES[type]; if (!t) return null; const it = { id: uid(), ...t.create({ x: 0, y: 0 }, D, tool || type), ...o }; s.push(it); return it; };
    const text = (x, y, t, o) => add('text', 'text', { x, y, text: t, ...o });
    const GREY = '#6b6b6b', BLUE = '#1e63c4';
    const head = (x, y, t) => text(x, y, t, { size: 'small', bold: true, color: GREY });
    // title and what to do
    text(440, 0, 'Welcome to DiagramTeX', { size: 'LARGE', bold: true });
    text(440, 40, 'Draw with the tools on the left, or drag anything in from the Library.', { color: GREY });
    text(440, 66, 'Double-click an object to edit it. Maths goes between \\textdollar\\ signs, as in \\LaTeX.', { color: GREY });
    text(440, 92, 'Export turns the drawing into TikZ code for your paper, or an SVG / PNG.', { color: GREY });
    // text and formulae
    head(130, 150, 'TEXT AND FORMULAE');
    text(130, 196, '$\\vec F = q\\left(\\vec E + \\vec v \\times \\vec B\\right)$', { size: 'large' });
    text(130, 252, '$\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$');
    text(130, 304, 'Plain text in \\textbf{bold}, \\textit{italic} or \\texttt{typewriter}', { size: 'small' });
    // shapes and arrows
    head(440, 150, 'SHAPES AND ARROWS');
    add('sym', 'sym:rrect', { x: 350, y: 178, w: 76, h: 40, text: 'Idea', fill: '#e8f0fb' });
    add('line', 'line', { x1: 426, y1: 198, x2: 462, y2: 198, startTip: 'none', endTip: 'stealth', label: '' });
    add('sym', 'sym:diamond', { x: 462, y: 172, w: 60, h: 52, text: '$?$' });
    add('line', 'line', { x1: 492, y1: 224, x2: 492, y2: 262, startTip: 'none', endTip: 'stealth', label: '' });
    add('sym', 'sym:rrect', { x: 454, y: 262, w: 76, h: 40, text: 'Done', fill: '#e6f4ea' });
    add('ball', 'ball', { cx: 372, cy: 282, r: 16 });
    add('spring', 'spring', { x1: 388, y1: 282, x2: 446, y2: 282 });
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
    text(440, 620, 'Double-click the circuit or the quantum circuit to open its editor. Delete this sample whenever you like.', { size: 'small', color: BLUE });
    return s.filter(Boolean);
  }

  // Older files held both diagram blocks and a page sheet. Give each file one kind; a file that
  // used both is split into a Classic file and a Page file.
  function migrateKinds() {
    const idx = index();
    let changed = false;
    for (const it of [...idx]) {
      if (it.kind) continue;
      const d = store.get(LS_DOC + it.id, null);
      changed = true;
      if (!d) { it.kind = 'classic'; continue; }
      const hasSheet = d.sheet && d.sheet.shapes && d.sheet.shapes.length;
      const hasBlocks = (d.blocks || []).some((b) => (b.type === 'text' && b.text) || (b.shapes && b.shapes.length)) || (d.shapes && d.shapes.length);
      if (hasSheet && hasBlocks) {
        const id = uid();
        store.set(LS_DOC + id, { kind: 'page', name: (d.name || 'Untitled') + ' (page)', page: d.page, sheet: d.sheet, view: (d.views || {}).page, mode: 'page' });
        idx.push({ id, name: (d.name || 'Untitled') + ' (page)', kind: 'page', updated: Date.now() });
      }
      it.kind = hasSheet && !hasBlocks ? 'page' : 'classic';
      if (it.kind === 'page') { d.view = (d.views || {}).page || (d.mode === 'page' ? d.view : null); d.mode = 'page'; }
      else if (d.mode === 'page') { d.mode = 'diagram'; d.view = (d.views || {}).diagram || null; }
      d.kind = it.kind; delete d.sheet; delete d.views;
      if (it.kind === 'page') d.sheet = { pages: 1, shapes: [], ...(store.get(LS_DOC + it.id, {}).sheet || {}) };
      store.set(LS_DOC + it.id, d);
    }
    if (changed) store.set(LS_INDEX, idx);
  }

  // ---------------- init ----------------
  async function init() {
    await TD.files.ready; // which files are linked to files on disk
    if (DS) {
      await DS.ready;
      DS.on({
        write: (ok, e) => reportSave(ok, !ok && !!e && e.name === 'QuotaExceededError'),
        // another tab changed the file list, or a file: keep the list current
        remote: (k) => { if (k === LS_INDEX) renderDocList(); },
      });
    }
    const prefs = store.get(LS_PREFS, null);
    if (prefs) {
      state.grid = prefs.grid ?? true; state.snap = prefs.snap ?? true;
      if (prefs.gridCm >= 0.05 && prefs.gridCm <= 5) state.gridCm = prefs.gridCm;
      Object.assign(state.defaults, prefs.defaults || {});
      if (prefs.sidebar === false) document.body.classList.add('no-files');
      if (prefs.props === false) setPropsOpen(false);
      if (prefs.layers === false) { $('#layersWin').classList.add('collapsed'); $('#layersToggle').setAttribute('aria-expanded', 'false'); $('#layersToggle').title = 'Expand panel'; }
    }
    // The document list folds open and shut (CSS). The drawing stays where it is on screen, at the same
    // scale: as the canvas's left edge moves, the view moves the other way by as much, so the list just
    // covers or uncovers the drawing's left side. It draws once at the new size when the fold ends.
    let filesAnim = 0, canvasLeft = 0;
    const holdView = () => {
      if (state.mode === 'document') return;
      const l = stageSize().left;
      state.view.x -= (canvasLeft - l) / state.view.zoom;
      canvasLeft = l;
      applyView();
      renderPageLayer(); // the dimming outside the paper covers the view, which grows each frame
    };
    // A top bar too narrow for its controls scrolls sideways; a plain mouse wheel scrolls it too, and the
    // side with more to see fades (more-l / more-r).
    {
      const bar = $('#topbar');
      const edges = () => {
        const max = bar.scrollWidth - bar.clientWidth;
        bar.classList.toggle('more-l', bar.scrollLeft > 1);
        bar.classList.toggle('more-r', max - bar.scrollLeft > 1);
      };
      bar.addEventListener('scroll', edges, { passive: true });
      const ro = new ResizeObserver(edges);
      ro.observe(bar);
      for (const c of bar.children) ro.observe(c); // the name field and hidden groups change the content's width
      bar.addEventListener('wheel', (e) => {
        if (bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || e.ctrlKey) return;
        bar.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });
      edges();
    }
    $('#propsHead').onclick = () => { setPropsOpen($('#propsWin').classList.contains('collapsed'), true); savePrefs(); };
    $('#btnSidebar').onclick = () => {
      const b = document.body, done = () => { if (state.mode !== 'document') render(); else TD.docview.render(); };
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
    if (idx.length) openDoc(idx.find((d) => d.id === last) ? last : idx[idx.length - 1].id);
    else { newDoc('Welcome to DiagramTeX', sample()); zoomFit(); }
    setTool('select');
    updateTopbar();
    // KaTeX fonts change metrics once loaded: re-measure.
    if (document.fonts) {
      document.fonts.ready.then(() => { TD.clearTextCache(); render(); });
      document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { TD.clearTextCache(); render(); });
    }
  }
  window.addEventListener('beforeunload', () => { commit(); saveNow(); });
  // a tab put away (or closed on a phone, where beforeunload may not come) saves what it has
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { commit(); if (state.docId) saveNow(); } });
  // Switching the maths engine re-measures every text box, so redraw whatever view is open.
  TD.math.onChange(() => {
    if (state.mode === 'document') { if (TD.docview) TD.docview.render(); }
    else render();
    renderProps();
    showHint(`Maths now rendered with ${TD.math.ENGINES[TD.math.engine].name}`, 1400);
  });
  TD.state = state; // for debugging
  TD.app = {
    state, render, renderProps, setActiveBlock, setMode, scheduleSave, saveNow, begin, commit, uid, shapesSvg, zoomFit, openImport,
    newSample: () => { newDoc('Welcome to DiagramTeX', sample()); zoomFit(); },
    get slug() { return slug(); },
  };
  // the files are read from IndexedDB first; the loading screen stays up until they are open
  TD.ready = init().catch((e) => { console.error(e); });
})();
