// Feynman editor: the overlay that opens on a Feynman block. A palette of vertices and propagators; the
// diagram drawn by the canvas renderer on a centimetre grid, where vertices are placed and moved and
// propagators are dragged from vertex to vertex; the selected vertex's or line's properties; and beside
// them the tikz-feynman code, live both ways. Untouched code is handed back as written.
// TD.feynEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, F = TD.feyn;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const PX = TD.PX_PER_CM, GRID = 0.25;

  // ---------------------------------------------------------------- palette
  const TYPE_NAMES = {
    plain: 'Plain', fermion: 'Fermion', 'anti fermion': 'Antifermion', photon: 'Photon', boson: 'Boson', 'charged boson': 'Charged boson',
    'anti charged boson': 'Anti charged boson', gluon: 'Gluon', scalar: 'Scalar', 'charged scalar': 'Charged scalar',
    'anti charged scalar': 'Anti charged scalar', ghost: 'Ghost', majorana: 'Majorana', 'anti majorana': 'Anti Majorana',
  };
  const STYLE_NAMES = { '': 'Vertex', dot: 'Dot', 'empty dot': 'Empty dot', 'square dot': 'Square dot', 'crossed dot': 'Crossed dot', blob: 'Blob' };
  const fey = (body) => `\\begin{feynman}${body}\\end{feynman}`;
  const vMini = (st) => fey(`\\vertex${st ? ` [${st}]` : ''} (a) at (0,0)${st ? ' {}' : ''};\\vertex (l) at (-.7,.45);\\vertex (r) at (.7,.45);\\vertex (d) at (0,-.7);\\diagram*{(l)--(a)--(r),(a)--(d)};`);
  const eMini = (t) => fey(`\\vertex (a) at (0,0);\\vertex (b) at (1.6,0);\\diagram*{(a) -- [${t}] (b)};`);
  const PAL = [
    ['Vertices', [
      ['v:', 'Vertex', vMini(''), 'V'], ['v:dot', 'Dot', vMini('dot'), 'D'], ['v:empty dot', 'Empty dot', vMini('empty dot')],
      ['v:square dot', 'Square dot', vMini('square dot')], ['v:crossed dot', 'Crossed dot', vMini('crossed dot')], ['v:blob', 'Blob', vMini('blob')],
      ['v:particle', 'Particle', fey('\\vertex (a) at (0,0) {\\(e^-\\)};\\vertex (b) at (1.2,0);\\diagram*{(a) -- [fermion] (b)};'), 'T'],
    ]],
    ['Propagators', [
      ['e:fermion', 'Fermion', eMini('fermion'), 'F'], ['e:anti fermion', 'Antifermion', eMini('anti fermion')], ['e:photon', 'Photon', eMini('photon'), 'P'],
      ['e:gluon', 'Gluon', eMini('gluon'), 'G'], ['e:scalar', 'Scalar', eMini('scalar'), 'S'], ['e:charged scalar', 'Charged scalar', eMini('charged scalar')],
      ['e:ghost', 'Ghost', eMini('ghost')], ['e:majorana', 'Majorana', eMini('majorana'), 'M'], ['e:boson', 'Boson', eMini('boson'), 'B'],
      ['e:charged boson', 'Charged boson', eMini('charged boson')], ['e:plain', 'Plain', eMini('plain'), 'L'],
    ]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.feyn.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M) => (M.dirty ? F.write(M) : M.raw);
  const kv = F.kv;
  const vOf = (name) => E.M.vertices.find((v) => v.name === name) || null;
  // maths in a label: \(x\) or $x$ → x; written back as \(x\)
  const mathOf = (t) => { t = F.unbrace(t || ''); const m = /^\\\(([\s\S]*)\\\)$/.exec(t) || /^\$([\s\S]*)\$$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t) => (String(t).trim() ? `\\(${t.trim()}\\)` : '');
  const val = (t) => (/[,=\]]/.test(t) ? `{${t}}` : t);
  // edge options by kind
  const isType = (it) => F.EDGE_TYPES.includes(it.trim());
  const isLabel = (it) => /^edge label'?$/.test(kv(it).k);
  const isMom = (it) => /^(reversed momentum|rmomentum|momentum)'?$/.test(kv(it).k);
  const isBend = (it) => /^(bend left|bend right|half left|half right|quarter left|quarter right|out|in|looseness)$/.test(kv(it).k);
  const isIns = (it) => kv(it).k === 'insertion';
  const typeOf = (e) => (e.o.find(isType) || 'plain').trim();
  function setType(e, t) { e.o = e.o.filter((x) => !isType(x)); if (t !== 'plain' || !e.o.length) e.o.unshift(t); }
  function labelOf(e) { const it = e.o.find(isLabel); if (!it) return { t: '', side: 1 }; const { k, v } = kv(it); return { t: mathOf(v), side: k.endsWith("'") ? -1 : 1 }; }
  function setLabel(e, t, side) {
    const i = e.o.findIndex(isLabel), it = t ? `edge label${side < 0 ? "'" : ''}=${val(wrapMath(t))}` : null;
    if (i >= 0) { if (it) e.o[i] = it; else e.o.splice(i, 1); } else if (it) e.o.push(it);
  }
  function momOf(e) {
    const it = e.o.find(isMom);
    if (!it) return null;
    const { k, v } = kv(it);
    let t = F.unbrace(v || ''), pre = '';
    if (t[0] === '[') { const j = t.indexOf(']'); pre = t.slice(0, j + 1); t = t.slice(j + 1).trim(); }
    return { t: mathOf(t), side: k.endsWith("'") ? -1 : 1, rev: !/^momentum/.test(k), pre };
  }
  function setMom(e, m) {
    const i = e.o.findIndex(isMom);
    let it = null;
    if (m) { const body = m.pre ? `{${m.pre}${wrapMath(m.t)}}` : val(wrapMath(m.t)); it = `${m.rev ? 'reversed momentum' : 'momentum'}${m.side < 0 ? "'" : ''}=${body}`; }
    if (i >= 0) { if (it) e.o[i] = it; else e.o.splice(i, 1); } else if (it) e.o.push(it);
  }
  function bendOf(e) {
    const R = F.readEdgeOpts(e.o, null);
    if (e.o.some((x) => /^half (left|right)$/.test(x.trim()))) return { kind: R.bend > 0 ? 'half left' : 'half right', a: 90 };
    if (R.bend == null) return { kind: R.out != null || R.in != null ? 'custom' : '', a: 30 };
    return { kind: R.bend > 0 ? 'left' : 'right', a: Math.abs(R.bend) };
  }
  function setBend(e, kind, a = 30) {
    e.o = e.o.filter((x) => !isBend(x));
    if (kind === 'left' || kind === 'right') e.o.push(`bend ${kind}${a !== 30 ? `=${F.num(a)}` : ''}`);
    else if (kind) e.o.push(kind);
  }
  const vStyle = (v) => F.styleOf(v);
  function setVStyle(v, st) { v.o = v.o.filter((x) => !F.VERTEX_STYLES.includes(kv(x).k)); if (st) v.o.unshift(st); }
  function newName(base = 'v') { let n = 1; while (vOf(base + n)) n++; return base + n; }
  // every vertex gets its drawn place written down (before a vertex it depends on moves or goes)
  function pin(names) {
    const L = lay();
    for (const v of E.M.vertices) {
      if (v.x != null || (names && !names.includes(v.name))) continue;
      const n = L.nodes.get(v.name);
      if (n) { v.x = snap(n.x / PX, true); v.y = snap(-n.y / PX, true); v.rel = null; }
    }
  }
  const dependents = (name) => E.M.vertices.filter((v) => v.x == null && v.rel && v.rel.of === name).map((v) => v.name);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'fyModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="fyTitle">
    <div class="modal-head">
      <strong id="fyTitle">Feynman diagram</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-fe="delete" title="Delete the selection (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-fe="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-fe="fit" title="Fit the diagram in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">Cancel</button>
      <button class="primary" data-fe="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list fy-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fy-svg" aria-label="Feynman diagram"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>tikz-feynman</span><small class="cz-count"></small><button class="flat" data-fe="copy" title="Copy the Feynman code">Copy</button></div>
          <textarea spellcheck="false" aria-label="tikz-feynman code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.fy-svg', root), stage = $('.cz-stage', root), list = $('.fy-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: { v: name } | { e: index } | null, arm, prop, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E = null, lastDown = { t: 0, x: 0, y: 0 };
  const snapCode = () => codeOf(E.M);
  function begin() { if (E.pending == null) E.pending = snapCode(); }
  function commit() {
    if (E.pending == null) return;
    const now = snapCode();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  function edit(fn) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snapCode()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snapCode()); restore(E.redo.pop()); }
  function clampSel() {
    const s = E.sel;
    if (s && s.v != null && !vOf(s.v)) E.sel = null;
    if (s && s.e != null && !E.M.edges[s.e]) E.sel = null;
  }
  const selV = () => (E.sel && E.sel.v != null ? vOf(E.sel.v) : null);
  const selE = () => (E.sel && E.sel.e != null ? E.M.edges[E.sel.e] || null : null);
  const lay = () => F.layout({ src: snapCode() });
  const snap = (n, on) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- editing
  function addVertex(key, x, y) {
    const st = key.slice(2);
    let name;
    edit(() => {
      name = newName(st === 'particle' ? 'p' : 'v');
      const v = { name, o: [], x, y, rel: null, text: null, decl: true };
      if (st === 'particle') v.text = '\\(e^-\\)';
      else if (st) v.o.push(st);
      E.M.vertices.push(v);
    });
    E.sel = { v: name }; draw(); renderProps();
    if (st === 'particle') editLabel({ v: name });
    return name;
  }
  function addEdge(a, b) {
    if (a === b) return;
    edit(() => {
      const ch = Math.max(-1, ...E.M.edges.map((e) => e.ch)) + 1;
      E.M.edges.push({ a, b, o: E.prop === 'plain' ? [] : [E.prop], ch });
    });
    E.sel = { e: E.M.edges.length - 1 }; draw(); renderProps();
  }
  function deleteVertex(name) {
    edit(() => {
      pin(dependents(name));
      E.M.vertices = E.M.vertices.filter((v) => v.name !== name);
      E.M.edges = E.M.edges.filter((e) => e.a !== name && e.b !== name);
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteEdge(i) { edit(() => E.M.edges.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { const v = selV(), e = selE(); if (v) deleteVertex(v.name); else if (e) deleteEdge(E.sel.e); }
  function reverseEdge(e) {
    const t = e.a; e.a = e.b; e.b = t;
    // the picture stays but for the line's own arrow: labels, bends and momentum keep their side and sense
    const lb = labelOf(e); if (lb.t) setLabel(e, lb.t, -lb.side);
    const m = momOf(e); if (m) setMom(e, { ...m, side: -m.side, rev: !m.rev });
    const b = bendOf(e);
    if (b.kind === 'left' || b.kind === 'right') setBend(e, b.kind === 'left' ? 'right' : 'left', b.a);
    else if (/^half/.test(b.kind)) setBend(e, b.kind === 'half left' ? 'half right' : 'half left');
    e.ch = Math.max(-1, ...E.M.edges.map((x) => x.ch)) + 1;
  }
  function rename(v, to) {
    to = to.trim();
    if (!to || to === v.name || !/^[A-Za-z0-9_.']+$/.test(to) || vOf(to)) return false;
    for (const e of E.M.edges) { if (e.a === v.name) e.a = to; if (e.b === v.name) e.b = to; }
    for (const w of E.M.vertices) if (w.rel && w.rel.of === v.name) w.rel.of = to;
    v.name = to; E.sel = { v: to };
    return true;
  }

  // ---------------------------------------------------------------- palette
  function sizeMinis(el, maxW, maxH, top) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    for (const [title, items] of PAL) {
      const hits = items.filter(([k, name]) => !q || `${name} ${k.slice(2)} ${title}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , key]) => {
        const on = E && (E.arm === k || (k === `e:${E.prop}`));
        return `<button class="qe-item${on ? ' on' : ''}" data-item="${esc(k)}" title="${esc(name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${TD.feynMini(ITEM[k].mini, 1e3)}</span><span>${esc(name)}</span></button>`;
      }).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list, 64, 40, 1.6);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) pick(b.dataset.item); search.blur(); }
  });
  // click: a vertex kind restyles the selected vertex or is armed for placing; a propagator kind
  // restyles the selected line and is the kind new lines get. Drag a vertex kind onto the canvas.
  let palDrag = null;
  list.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!palDrag || palDrag.k[0] !== 'v') return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (palDrag.moved) { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = palDrag.k; draw(); }
  });
  list.addEventListener('pointerup', (e) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    if (!d.moved) { pick(d.k); return; }
    if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); addVertex(d.k, x, y); }
    E.hover = null; draw();
  });
  function pick(k) {
    if (k[0] === 'e') {
      E.prop = k.slice(2);
      const e = selE();
      if (e) edit(() => setType(e, E.prop));
      buildPalette();
      setTip(e ? '' : `${ITEM[k].name}: point at a vertex, then drag its blue handle to another vertex`);
      return;
    }
    const v = selV(), st = k.slice(2);
    if (v && !E.arm && st !== 'particle') { edit(() => setVStyle(v, st)); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? `${ITEM[k].name}: click the grid to place it. Esc when done.` : '');
  }
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // screen ↔ cm (y up)
  const m = (x, y) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  const toCm = (e, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snap((x - v.ox) / v.k, snapOn), snap((v.oy - y) / v.k, snapOn)]; };
  // layout px (y down) → screen
  const S = (x, y) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const nodeR = (n) => Math.max(n.r || 0, n.hw || 0, n.hh || 0) * (E.view.k / PX);
  function vertexAt(e, px = 8) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, nodeR(n) + 3) && d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function edgeAt(e, px = 6) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = px;
    for (const ed of L.edges) {
      const p = ed.P.pts;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = S(...p[i - 1]), [bx, by] = S(...p[i]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = ed.i; }
      }
    }
    return best;
  }
  function fit() {
    const L = lay(), r = rect(), bb = L.empty ? { x: 0, y: -2 * PX, w: 4 * PX, h: 2 * PX } : L.bb;
    const w = bb.w / PX + 1, h = bb.h / PX + 1;
    const k = Math.max(20, Math.min(220, Math.min((r.width - 80) / w, (r.height - 80) / h)));
    const cx = (bb.x + bb.w / 2) / PX, cy = -(bb.y + bb.h / 2) / PX;
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 + cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(600, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Lb) Lb.pop.place();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // grid: minor every 0.25cm (hidden when too dense), major every 1cm
    const step = k * GRID >= 7 ? GRID : 1, xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor((v.oy - H) / k / step), ye = Math.ceil(v.oy / k / step);
    let minor = '', major = '';
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy - j * step * k) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    const [OX, OY] = m(0, 0);
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/><path class="cz-origin" d="M${OX - 6},${OY}h12M${OX},${OY - 6}v12"/>`;
    const L = lay(), kk = k / PX;
    // the selected line, as a halo under the drawing
    const se = selE(), sl = se && L.edges.find((x) => x.i === E.sel.e);
    if (sl) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})"><path class="ze-wsel" d="${sl.d}" stroke-width="${r2(10 / kk)}"/></g>`;
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})">${F.draw({ type: 'feynman', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">Place a vertex from the left to start</text>`;
    // every vertex has a point to grab, coordinates included
    const sv = selV(), dragE = E.drag && E.drag.mode === 'edge';
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), rr = Math.max(4, nodeR(n) + 3);
      if (sv && sv.name === name) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (dragE && E.hover && E.hover.v === name && name !== E.drag.from) out += `<circle class="fy-vtarget" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (E.hover && E.hover.v === name && !E.drag) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr)}"/>`;
      if (!n.r && !n.hw) out += `<circle class="fy-pt" cx="${r2(X)}" cy="${r2(Y)}" r="2.5"/>`;
    }
    // a line being drawn
    if (dragE) {
      const d = E.drag, n = L.nodes.get(d.from);
      if (n) {
        const [x0, y0] = S(n.x, n.y), t = E.hover && E.hover.v && E.hover.v !== d.from ? S(L.nodes.get(E.hover.v).x, L.nodes.get(E.hover.v).y) : m(...(E.hover && E.hover.at ? E.hover.at : d.at));
        out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(t[0])},${r2(t[1])}"/>`;
        if (!(E.hover && E.hover.v)) out += `<circle class="cz-snap on" cx="${r2(t[0])}" cy="${r2(t[1])}" r="5"/>`;
      }
    }
    // the knob: a selected (or hovered) vertex's handle for drawing lines
    const kv_ = !E.drag && !E.arm && !E.ghost && (E.knobAt || (sv && sv.name));
    const kn = kv_ && L.nodes.get(kv_);
    E.knobPos = null;
    if (kn) {
      // in the widest gap between the vertex's lines, so it never sits on one
      const dirs = [];
      for (const ed of L.edges) {
        const p = ed.P.pts;
        if (p.length < 2) continue;
        if (ed.a === kv_) dirs.push(Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]));
        if (ed.b === kv_) { const n = p.length; dirs.push(Math.atan2(p[n - 2][1] - p[n - 1][1], p[n - 2][0] - p[n - 1][0])); }
      }
      let ang = 0;
      if (dirs.length) {
        let best = -1;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * 2 * Math.PI, gap = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d)))));
          if (gap > best + 1e-6) { best = gap; ang = a; }
        }
      }
      const [X, Y] = S(kn.x, kn.y), off = Math.max(4, nodeR(kn)) + 12, kx = r2(X + off * Math.cos(ang)), ky = r2(Y + off * Math.sin(ang));
      E.knobPos = { v: kv_, X, Y, kx, ky };
      out += `<g class="ze-knob" data-v="${esc(kv_)}"><title>Drag to another vertex to draw a ${esc(TYPE_NAMES[E.prop].toLowerCase())}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // placing: where it lands
    if ((E.arm || E.ghost) && E.hover && E.hover.at) { const [X, Y] = m(...E.hover.at); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
    // a double-click is detected here: redraws between the clicks swap the target, so no native dblclick arrives
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'edge', from: kb.dataset.v, at: toCm(e) }; E.knobAt = null; return; }
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); addVertex(E.arm, x, y); return; }
    const vn = vertexAt(e), ei = vn == null ? edgeAt(e) : null;
    if (vn != null) {
      if (dbl && E.sel && E.sel.v === vn) { editLabel({ v: vn }); return; }
      E.sel = { v: vn };
      const v = vOf(vn), n = lay().nodes.get(vn);
      E.drag = { mode: 'move', v: vn, sx, sy, moved: false, x0: v.x != null ? v.x : n.x / PX, y0: v.y != null ? v.y : -n.y / PX };
      draw(); renderProps(); return;
    }
    if (ei != null) {
      if (dbl && E.sel && E.sel.e === ei) { editLabel({ e: ei }); return; }
      E.sel = { e: ei }; E.drag = null; draw(); renderProps(); return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const vn = vertexAt(e, 14), kb = e.target.closest('.ze-knob');
      const h = E.arm ? { at: toCm(e, !e.altKey) } : vn ? { v: vn } : null;
      // the handle stays up while the pointer travels from its vertex to it
      const kp = E.knobPos, onWay = (() => {
        if (!kp || kp.v !== E.knobAt) return false;
        const dx = kp.kx - kp.X, dy = kp.ky - kp.Y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - kp.X) * dx + (sy - kp.Y) * dy) / l2));
        return Math.hypot(kp.X + dx * t - sx, kp.Y + dy * t - sy) <= 12;
      })();
      const knob = vn || (kb || onWay ? E.knobAt : null);
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.style.cursor = E.arm ? '' : vertexAt(e) != null ? 'move' : edgeAt(e) != null ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'edge') {
      const vn = vertexAt(e, 14);
      E.hover = vn && vn !== d.from ? { v: vn } : { at: toCm(e, !e.altKey) };
      setTip(vn && vn !== d.from ? `${TYPE_NAMES[E.prop]} to ${vn}` : `Drop on a vertex, or on the grid for a new one`);
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); pin(dependents(d.v)); d.moved = true; }
      const v = vOf(d.v), k = E.view.k;
      v.x = snap(d.x0 + (sx - d.sx) / k, !e.altKey); v.y = snap(d.y0 - (sy - d.sy) / k, !e.altKey); v.rel = null;
      E.M.dirty = true;
      setTip(`${d.v} at (${F.num(v.x)}, ${F.num(v.y)})${e.altKey ? '' : ' · ⌥ to place freely'}`);
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', (e) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'edge') {
      setTip('');
      const vn = vertexAt(e, 14);
      if (vn && vn !== d.from) addEdge(d.from, vn);
      else if (!vn && overStage(e)) {
        const [x, y] = toCm(e, !e.altKey);
        begin();
        const name = newName();
        E.M.vertices.push({ name, o: [], x, y, rel: null, text: null, decl: true });
        E.M.edges.push({ a: d.from, b: name, o: E.prop === 'plain' ? [] : [E.prop], ch: Math.max(-1, ...E.M.edges.map((x) => x.ch)) + 1 });
        E.M.dirty = true; commit();
        E.sel = { e: E.M.edges.length - 1 }; renderProps();
      }
      E.hover = null; draw(); return;
    }
    if (d.mode === 'move' && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the vertex's or line's actions
  const MI = {
    label: '<path d="M4 15l2-5 6-6 3 3-6 6zM11 5l3 3"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    rev: '<path d="M3 7h12l-3-3M17 13H5l3 3"/>',
    left: '<path d="M3 15C5 6 15 6 17 15"/>',
    right: '<path d="M3 5c2 9 12 9 14 0"/>',
    straight: '<path d="M3 10h14"/>',
  };
  const mItem = (act, label, icon, key) => `<button class="ctx-item${/^(vdel|edel)$/.test(act) ? ' danger' : ''}" data-fm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const vn = vertexAt(e), ei = vn == null ? edgeAt(e) : null;
    if (vn != null) { E.sel = { v: vn }; menu.innerHTML = mItem('label', 'Edit Label', 'label', '↩') + '<hr>' + mItem('vdel', 'Delete Vertex', 'del', '⌫'); }
    else if (ei != null) {
      E.sel = { e: ei };
      menu.innerHTML = mItem('label', 'Edit Label', 'label', '↩') + mItem('rev', 'Reverse Direction', 'rev') + '<hr>' +
        mItem('bleft', 'Bend Left', 'left') + mItem('bright', 'Bend Right', 'right') + mItem('bnone', 'Straight', 'straight') + '<hr>' + mItem('edel', 'Delete Line', 'del', '⌫');
    } else { closeMenu(); return; }
    draw(); renderProps();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fm]');
    if (!b) return;
    closeMenu();
    act(b.dataset.fm);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- label editor
  // A floating box under the vertex or line (TD.input.popup); the whole edit is one undo step.
  let Lb = null;
  function editLabel(target) {
    if (!TD.input) return false;
    closeLabel();
    const v = target.v != null ? vOf(target.v) : null, e = target.e != null ? E.M.edges[target.e] : null;
    if (!v && !e) return false;
    begin();
    const me = (Lb = { target });
    const text = v ? mathOf(v.text || '') : labelOf(e).t;
    me.pop = TD.input.popup(stage, {
      text, math: true, bare: true,
      at: () => labelPos(target),
      onInput: (t) => {
        if (v) v.text = wrapMath(t) || null;
        else { const lb = labelOf(e); setLabel(e, t, lb.side); }
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.v != null) { const n = L.nodes.get(target.v); if (n) { [X, Y] = S(n.x, n.y); Y += Math.max(6, nodeR(n)) + 10; } }
    else { const ed = L.edges.find((x) => x.i === target.e); if (ed) { const q = F.along(ed.P, ed.P.len / 2); [X, Y] = S(q.x, q.y); Y += 14; } }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div>`);
  const numField = (label, f, value) => row(label, `<div class="ctl unit"><input type="number" data-f="${f}" value="${value == null ? '' : F.num(value)}" step="0.25"><span>cm</span></div>`);
  const seg = (f, cur, opts, off) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-fs="${f}" data-v="${esc(String(v))}" class="${!off && String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}${off ? ' disabled' : ''}>${n}</button>`).join('')}</div>`;
  function renderProps() {
    if (!E) return;
    const M = E.M, v = selV(), e = selE();
    if (v) {
      const L = lay(), n = L.nodes.get(v.name), st = vStyle(v);
      const x = v.x != null ? v.x : n ? n.x / PX : null, y = v.y != null ? v.y : n ? -n.y / PX : null;
      const rest = v.o.filter((it) => !F.VERTEX_STYLES.includes(kv(it).k));
      const links = M.edges.filter((ed) => ed.a === v.name || ed.b === v.name).length;
      TD.morph(props, `<div class="sec"><div class="sec-title">${esc(STYLE_NAMES[st] || 'Vertex')} <small>${links} line${links === 1 ? '' : 's'}</small></div>
        ${field('Name', 'name', v.name, ' class="mono"')}
        ${row('Shape', `<div class="ctl"><select data-f="style">${Object.entries(STYLE_NAMES).map(([k, nm]) => `<option value="${esc(k)}"${k === st ? ' selected' : ''}>${esc(nm)}</option>`).join('')}</select></div>`)}
        ${field('Label', 'text', mathOf(v.text || ''), ' data-tx="math" placeholder="none"')}
        ${numField('x', 'x', x)}${numField('y', 'y', y)}
        ${v.x == null ? `<div class="help">${v.rel ? `Placed ${esc(v.rel.dir)} of ${esc(v.rel.of)}. Moving it writes its position.` : 'No position in the code: moving it writes one.'}</div>` : ''}
        ${field('Options', 'vopts', rest.join(', '), ' class="mono" placeholder="e.g. label=above:\\(x\\)"')}
        <div class="row"><button class="danger" data-fe="vdel">Delete Vertex</button></div></div>`);
      return;
    }
    if (e) {
      const t = typeOf(e), lb = labelOf(e), mo = momOf(e), b = bendOf(e), ins = e.o.some(isIns);
      const rest = e.o.filter((it) => !isType(it) && !isLabel(it) && !isMom(it) && !isBend(it) && !isIns(it));
      TD.morph(props, `<div class="sec"><div class="sec-title">${esc(TYPE_NAMES[t] || t)} <small>${esc(e.a)} → ${esc(e.b)}</small></div>
        ${row('Type', `<div class="ctl"><select data-f="type">${F.EDGE_TYPES.map((k) => `<option value="${esc(k)}"${k === t ? ' selected' : ''}>${esc(TYPE_NAMES[k])}</option>`).join('')}</select></div>`)}
        ${field('Label', 'label', lb.t, ' data-tx="math" placeholder="none"')}
        ${row('Label side', seg('lside', lb.side, [[1, 'Left'], [-1, 'Right']], !lb.t))}
        ${field('Momentum', 'mom', mo ? mo.t : '', ' data-tx="math" placeholder="none"')}
        ${row('Arrow side', seg('mside', mo ? mo.side : 1, [[1, 'Left'], [-1, 'Right']], !mo))}${row('Points', seg('mrev', mo && mo.rev ? 1 : 0, [[0, 'Along', 'In the line’s direction'], [1, 'Against', 'reversed momentum']], !mo))}
        ${row('Bend', seg('bend', b.kind === 'custom' ? '' : b.kind, [['', 'Straight'], ['left', 'Left'], ['right', 'Right'], ['half left', 'Half L', 'half left: a semicircle'], ['half right', 'Half R', 'half right: a semicircle']]))}
        ${row('Angle', `<div class="ctl unit"><input type="number" data-f="angle" value="${b.kind === 'left' || b.kind === 'right' ? F.num(b.a) : ''}" min="5" max="90" step="5"${b.kind === 'left' || b.kind === 'right' ? '' : ' disabled'}><span>°</span></div>`)}
        ${row('Insertion', seg('ins', ins ? 1 : 0, [[0, 'None'], [1, 'Cross', 'insertion: a × at the middle']]))}
        ${field('Options', 'eopts', rest.join(', '), ' class="mono"')}
        <div class="row"><button data-fe="rev">Reverse Direction</button><button class="danger" data-fe="edel">Delete Line</button></div></div>`);
      return;
    }
    TD.morph(props, `<div class="sec"><div class="sec-title">Diagram <small>${M.vertices.length} vertices · ${M.edges.length} lines</small></div>
      <div class="help">Place vertices from the left on the grid; drag them to move (<kbd>⌥</kbd> places freely). Select a vertex and drag its blue handle to another vertex to draw a line of the kind chosen on the left. Double-click a vertex or line to label it.</div></div>`);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { if (e.target.dataset.f === 'name') { const v = selV(); if (v && v.name !== e.target.value.trim()) e.target.value = v.name; } commit(); renderProps(); } });
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const v = selV(), e = selE();
    if (v) {
      if (f === 'name') { if (!rename(v, t.value)) return; }
      else if (f === 'style') setVStyle(v, t.value);
      else if (f === 'text') v.text = wrapMath(t.value) || null;
      else if (f === 'x' || f === 'y') { const n = parseFloat(t.value); if (!isFinite(n)) return; pin([v.name, ...dependents(v.name)]); v[f] = n; v.rel = null; }
      else if (f === 'vopts') { const st = vStyle(v); v.o = (st ? [st] : []).concat(F.opts(t.value)); }
    } else if (e) {
      if (f === 'type') setType(e, t.value);
      else if (f === 'label') setLabel(e, t.value, labelOf(e).side);
      else if (f === 'mom') { const mo = momOf(e); setMom(e, t.value ? { side: 1, rev: false, pre: '', ...(mo || {}), t: t.value } : null); }
      else if (f === 'angle') { const n = parseFloat(t.value); if (!isFinite(n)) return; setBend(e, bendOf(e).kind, n); }
      else if (f === 'eopts') { const keep = e.o.filter((it) => isType(it) || isLabel(it) || isMom(it) || isBend(it) || isIns(it)); e.o = keep.concat(F.opts(t.value)); }
    } else return;
    E.M.dirty = true; draw();
    if (f === 'type' || f === 'style') { commit(); renderProps(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (TD.morph keeps this one as typed)
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, val_ = bt.dataset.v, e = selE();
    if (!e) return;
    edit(() => {
      if (f === 'lside') { const lb = labelOf(e); setLabel(e, lb.t, +val_); }
      else if (f === 'mside') { const mo = momOf(e); if (mo) setMom(e, { ...mo, side: +val_ }); }
      else if (f === 'mrev') { const mo = momOf(e); if (mo) setMom(e, { ...mo, rev: val_ === '1' }); }
      else if (f === 'bend') setBend(e, val_, bendOf(e).a || 30);
      else if (f === 'ins') { e.o = e.o.filter((x) => !isIns(x)); if (val_ === '1') e.o.push('insertion=0.5'); }
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-fe="undo"]', root).disabled = !E.undo.length;
    $('[data-fe="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fe]');
    if (!b || !E) return;
    act(b.dataset.fe, b);
  });
  function act(a, b) {
    const e = selE();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'vdel') { const v = selV(); if (v) deleteVertex(v.name); }
    else if (a === 'edel') { if (e) deleteEdge(E.sel.e); }
    else if (a === 'label') { if (E.sel) editLabel(E.sel); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    else if (!e) return;
    else if (a === 'rev') edit(() => reverseEdge(e));
    else if (a === 'bleft') edit(() => setBend(e, 'left'));
    else if (a === 'bright') edit(() => setBend(e, 'right'));
    else if (a === 'bnone') edit(() => setBend(e, ''));
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M;
    count.textContent = `${M.vertices.length} vert${M.vertices.length === 1 ? 'ex' : 'ices'} · ${M.edges.length} line${M.edges.length === 1 ? '' : 's'}`;
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    codeMsg.innerHTML = F.layout({ src: c }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps();
    codeMsg.innerHTML = F.layout({ src: codeTa.value }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
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
    const v = selV();
    if (e.key.startsWith('Arrow') && v) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      edit(() => { pin([v.name, ...dependents(v.name)]); v.x = snap(v.x + dx, false); v.y = snap(v.y + dy, false); v.rel = null; });
      return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the diagram back to the page (one undo step there) and keep editing
  function save() {
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snapCode();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.js, beforeunload)
  TD.unsaved.push(() => !!E && snapCode() !== E.start);
  async function finish(ok) {
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = snapCode(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this diagram?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, prop: 'fermion', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(fit);
  }
  TD.feynEditor = { open };
})();
