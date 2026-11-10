// State machine editor: the overlay that opens on a State machine block. A palette of states, transitions
// and loops; the machine drawn by the canvas renderer on a centimetre grid, where states are placed and
// moved (their transitions follow) and transitions are dragged from state to state; Auto layout places
// every state; the selected state's or transition's properties; and beside them the TikZ code, live both
// ways. Untouched code is handed back as written.
// TD.fsmEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, F = TD.fsm;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const PX = TD.PX_PER_CM, GRID = 0.25;
  const kv = F.kv;

  // ---------------------------------------------------------------- palette
  const pic = (body) => `\\begin{tikzpicture}[->, >=Stealth, shorten >=1pt, initial text=]${body}\\end{tikzpicture}`;
  const sMini = (o) => pic(`\\node[state${o}] (a) at (0,0) {};`);
  const eMini = (o) => pic(`\\node (a) at (0,0) {}; \\node (b) at (1.4,0) {}; \\path (a) edge [${o}] (b);`);
  const lMini = (side) => pic(`\\node[state] (a) at (0,0) {}; \\path (a) edge [loop ${side}] ();`);
  const PAL = [
    ['States', [
      ['s:state', 'State', sMini(''), 'S'], ['s:initial', 'Initial', sMini(', initial'), 'I'],
      ['s:accepting', 'Accepting (final)', sMini(', accepting'), 'A', 'Final'], ['s:both', 'Initial and accepting', sMini(', initial, accepting'), null, 'Both'],
    ]],
    ['Transitions', [
      ['e:straight', 'Straight', eMini(''), 'T'], ['e:bend', 'Bent', eMini('bend left'), 'B'],
    ]],
    ['Loops', [
      ['l:above', 'Loop above', lMini('above'), 'L', 'Above'], ['l:below', 'Loop below', lMini('below'), null, 'Below'],
      ['l:left', 'Loop left', lMini('left'), null, 'Left'], ['l:right', 'Loop right', lMini('right'), null, 'Right'],
    ]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, mini, key, short] of items) { ITEM[k] = { k, name, mini, key, short }; if (key) KEYS[key.toLowerCase()] = k; }
  const KIND_NAMES = { straight: 'straight transition', bend: 'bent transition' };

  // ---------------------------------------------------------------- model
  // M = TD.fsm.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M) => (M.dirty ? F.write(M) : M.raw);
  const sOf = (name) => E.M.states.find((s) => s.name === name) || null;
  // maths in a label: $x$ or \(x\) → x; written back as $x$
  const mathOf = (t) => { t = F.unbrace(t || ''); const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t) => (String(t).trim() ? `$${t.trim()}$` : '');
  const val = (t) => (/[,=\]]/.test(t) || t === '' ? `{${t}}` : t);
  // state options by kind
  const isInitW = (it) => kv(it).k === 'initial where';
  const isInitT = (it) => kv(it).k === 'initial text';
  const isFlag = (it) => F.isInitial(it) || F.isAccepting(it) || isInitW(it) || isInitT(it) || /^state( without output)?$/.test(kv(it).k);
  const flags = (s) => { const S = F.applyNodeOpts({ ...lay().P0, initial: false, accepting: false, state: false }, s.o, null); return { initial: S.initial, accepting: S.accepting, side: S.initWhere, text: S.initText, state: S.state }; };
  function setFlags(s, init, acc) {
    const f = flags(s), side = f.side, keepW = s.o.find(isInitW), keepT = s.o.find(isInitT);
    const rest = s.o.filter((it) => !isFlag(it));
    const o = ['state'];
    if (init) o.push(side === 'left' || !F.DIRS[side] || /\s/.test(side) ? 'initial' : `initial ${side}`);
    if (init && keepT) o.push(keepT);
    if (init && keepW && /\s/.test(side)) o.push(keepW);
    if (acc) o.push('accepting');
    s.o = o.concat(rest);
  }
  function setInitSide(s, side) {
    const acc = flags(s).accepting, keepT = s.o.find(isInitT), rest = s.o.filter((it) => !isFlag(it));
    s.o = ['state', side === 'left' ? 'initial' : `initial ${side}`].concat(keepT ? [keepT] : [], acc ? ['accepting'] : [], rest);
  }
  function setInitText(s, t) {
    const def = lay().P0.initText;
    const i = s.o.findIndex(isInitT), it = t === def ? null : `initial text=${val(t)}`;
    if (i >= 0) { if (it) s.o[i] = it; else s.o.splice(i, 1); } else if (it) { const j = s.o.findIndex(F.isInitial); s.o.splice(j >= 0 ? j + 1 : s.o.length, 0, it); }
  }
  // transition options by kind
  const isBend = (it) => /^(bend left|bend right|out|in|looseness)$/.test(kv(it).k);
  const isLoop = (it) => /^loop( (above|below|left|right))?$/.test(kv(it).k);
  const isSwap = (it) => /^(swap|')$/.test(kv(it).k);
  function bendOf(e) {
    for (const it of e.o) { const { k, v } = kv(it); if (k === 'bend left' || k === 'bend right') return { kind: k.slice(5), a: v == null ? 30 : parseFloat(v) || 30 }; }
    return { kind: e.o.some(isBend) ? 'custom' : '', a: 30 };
  }
  function setBend(e, kind, a = 30) {
    e.o = e.o.filter((x) => !isBend(x));
    if (kind === 'left' || kind === 'right') e.o.push(`bend ${kind}${a !== 30 ? `=${F.num(a)}` : ''}`);
  }
  const loopOf = (e) => { for (const it of e.o) { const m = /^loop (above|below|left|right)$/.exec(kv(it).k); if (m) return m[1]; } return 'above'; };
  function setLoop(e, side) {
    e.o = e.o.filter((x) => !isLoop(x)); e.o.unshift(`loop ${side}`);
    if (e.lo) e.lo = e.lo.filter((it) => F.DIRS[kv(it).k] == null);
  }
  const sideOf = (e) => ((e.lo || []).concat(e.o).filter(isSwap).length % 2 ? -1 : 1);
  function setSide(e, side) {
    e.o = e.o.filter((x) => !isSwap(x));
    e.lo = (e.lo || []).filter((x) => !isSwap(x));
    if (side < 0) e.lo.push('swap');
  }
  function setLabel(e, t) {
    if (t) { e.t = wrapMath(t); if (!e.lo) e.lo = []; }
    else { e.t = null; e.lo = null; }
  }
  const qLabel = (name) => { const i = name.slice(1); return `$q_${i.length > 1 ? `{${i}}` : i}$`; };
  function newName() { let n = 0; while (sOf('q' + n)) n++; return 'q' + n; }
  // every state gets its drawn place written down (before a state it depends on moves or goes)
  function pin(names) {
    const L = lay();
    for (const s of E.M.states) {
      if (s.x != null || (names && !names.includes(s.name))) continue;
      const n = L.nodes.get(s.name);
      if (n) { s.x = snap(n.x / PX, true); s.y = snap(-n.y / PX, true); s.rel = null; }
    }
  }
  const dependents = (name) => E.M.states.filter((s) => s.x == null && s.rel && s.rel.of === name).map((s) => s.name);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'fsmModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="fsmTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <strong id="fsmTitle">State machine</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-fe="delete" title="Delete the selection (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-fe="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-fe="layout" title="Auto layout: place the states in layers from the initial state">${ic('<circle cx="4.5" cy="10" r="2.2"/><circle cx="15.5" cy="5" r="2.2"/><circle cx="15.5" cy="15" r="2.2"/><path d="M6.6 9l6.8-3.2M6.6 11l6.8 3.2"/>')}</button>
        <button class="icon flat" data-fe="fit" title="Fit the diagram in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">Cancel</button>
      <button class="primary" data-fe="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list fsm-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fsm-svg" aria-label="State machine"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>TikZ automata</span><small class="cz-count"></small><button class="flat" data-fe="copy" title="Copy the TikZ code">Copy</button></div>
          <textarea spellcheck="false" aria-label="TikZ automata code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.fsm-svg', root), stage = $('.cz-stage', root), list = $('.fsm-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: { s: name } | { e: index } | null, arm, kind, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
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
    if (s && s.s != null && !sOf(s.s)) E.sel = null;
    if (s && s.e != null && !E.M.edges[s.e]) E.sel = null;
  }
  const selS = () => (E.sel && E.sel.s != null ? sOf(E.sel.s) : null);
  const selE = () => (E.sel && E.sel.e != null ? E.M.edges[E.sel.e] || null : null);
  const lay = () => F.layout({ src: snapCode() });
  const snap = (n, on) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- editing
  const KINDS = { 's:state': [false, false], 's:initial': [true, false], 's:accepting': [false, true], 's:both': [true, true] };
  function addState(key, x, y) {
    let name;
    edit(() => {
      name = newName();
      const s = { name, o: ['state'], x, y, rel: null, text: qLabel(name) };
      if (!E.M.states.length && E.M.env == null) E.M.env = '';
      E.M.states.push(s);
      const [i, a] = KINDS[key] || KINDS['s:state'];
      setFlags(s, i, a);
    });
    E.sel = { s: name }; draw(); renderProps();
    return name;
  }
  // the group new transitions join: the last \path, or a new one (with -> unless the picture has it)
  function groupFor() {
    const M = E.M;
    for (let g = M.groups.length - 1; g >= 0; g--) if (M.edges.some((e) => e.g === g)) return g;
    M.groups.push({ cmd: 'path', o: lay().P0.arrow.e ? '' : '->' });
    return M.groups.length - 1;
  }
  function addEdge(a, b, extra) {
    const loop = a === b;
    edit(() => {
      const g = groupFor();
      // a transition beside one between the same states (either way) bends, so neither hides the other
      const twin = !loop && E.M.edges.filter((f) => !f.loop && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
      const o = loop ? [`loop ${extra || freeSide(a)}`] : E.kind === 'bend' || (twin && twin.length) ? ['bend left'] : [];
      if (twin) for (const f of twin) if (f.a === b && !f.o.some(isBend)) f.o.push('bend left');
      E.M.edges.push({ a, b, o, lo: null, t: null, g, loop });
    });
    E.sel = { e: E.M.edges.length - 1 }; draw(); renderProps();
    editLabel({ e: E.M.edges.length - 1 });
  }
  // the side of a state with the most room for a loop
  function freeSide(name) {
    const L = lay(), n = L.nodes.get(name);
    if (!n) return 'above';
    const dirs = [];
    for (const ed of L.edges) {
      const p = ed.P.pts;
      if (p.length < 2) continue;
      if (ed.a === name) dirs.push(Math.atan2(-(p[1][1] - p[0][1]), p[1][0] - p[0][0]));
      if (ed.b === name) { const k = p.length; dirs.push(Math.atan2(-(p[k - 2][1] - p[k - 1][1]), p[k - 2][0] - p[k - 1][0])); }
    }
    const s = sOf(name);
    if (s && flags(s).initial) dirs.push((F.DIRS[flags(s).side] * Math.PI) / 180);
    let best = 'above', gap = -1;
    for (const [side, a] of [['above', 90], ['below', 270], ['right', 0], ['left', 180]]) {
      const r = (a * Math.PI) / 180, g = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(r - d), Math.cos(r - d))))) : 9;
      if (g > gap + 1e-6) { gap = g; best = side; }
    }
    return best;
  }
  function deleteState(name) {
    edit(() => {
      pin(dependents(name));
      E.M.states = E.M.states.filter((s) => s.name !== name);
      E.M.edges = E.M.edges.filter((e) => e.a !== name && e.b !== name);
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteEdge(i) { edit(() => E.M.edges.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { const s = selS(), e = selE(); if (s) deleteState(s.name); else if (e) deleteEdge(E.sel.e); }
  // the picture stays but for the arrow: the label keeps its side, a bend keeps its side
  function reverseEdge(e) {
    if (e.loop) return;
    const t = e.a; e.a = e.b; e.b = t;
    if (e.t) setSide(e, -sideOf(e));
    const b = bendOf(e);
    if (b.kind === 'left' || b.kind === 'right') setBend(e, b.kind === 'left' ? 'right' : 'left', b.a);
  }
  function rename(s, to) {
    to = to.trim();
    if (!to || to === s.name || !/^[A-Za-z0-9_.']+$/.test(to) || sOf(to)) return false;
    for (const e of E.M.edges) { if (e.a === s.name) e.a = to; if (e.b === s.name) e.b = to; }
    for (const w of E.M.states) if (w.rel && w.rel.of === s.name) w.rel.of = to;
    s.name = to; E.sel = { s: to };
    return true;
  }
  function autoLayout(mode) {
    if (!E.M.states.length) return;
    const step = Math.max(2, lay().P0.nd[1]);
    edit(() => F.autoLayout(E.M, mode, step));
    fit();
    setTip(mode === 'circle' ? 'States placed on a circle' : 'States placed in layers from the initial state');
    setTimeout(() => { if (E && /^States placed/.test(tip.textContent)) setTip(''); }, 1800);
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
        const on = E && (E.arm === k || k === `e:${E.kind}`);
        return `<button class="qe-item${on ? ' on' : ''}" data-item="${esc(k)}" title="${esc(name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${TD.fsmMini(ITEM[k].mini, 1e3)}</span><span>${esc(ITEM[k].short || name)}</span></button>`;
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
  // click: a state kind restyles the selected state or is armed for placing; a transition kind restyles the
  // selected transition and is the kind new ones get; a loop goes on the selected state, or is armed.
  // Drag a state kind onto the canvas.
  let palDrag = null;
  list.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!palDrag || palDrag.k[0] !== 's') return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (palDrag.moved) { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = palDrag.k; draw(); }
  });
  list.addEventListener('pointerup', (e) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    if (!d.moved) { pick(d.k); return; }
    if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); addState(d.k, x, y); }
    E.hover = null; draw();
  });
  function pick(k) {
    if (k[0] === 'e') {
      E.kind = k.slice(2);
      const e = selE();
      if (e && !e.loop) edit(() => setBend(e, E.kind === 'bend' ? 'left' : '', 30));
      buildPalette();
      setTip(e ? '' : `${ITEM[k].name}: point at a state, then drag its blue handle to another state (or back onto itself for a loop)`);
      return;
    }
    const s = selS(), e = selE();
    if (k[0] === 'l') {
      const side = k.slice(2);
      if (e && e.loop) { edit(() => setLoop(e, side)); return; }
      if (s && !E.arm) { addEdge(s.name, s.name, side); return; }
    } else if (s && !E.arm) { const [i, a] = KINDS[k]; edit(() => setFlags(s, i, a)); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? (k[0] === 'l' ? `${ITEM[k].name}: click a state to give it a loop. Esc when done.` : `${ITEM[k].name}: click the grid to place it. Esc when done.`) : '');
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
  function stateAt(e, px = 8) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, nodeR(n) + 3) && d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function edgeAt(e, px = 6) {
    const L = lay(), [x, y] = pos(e), kk = E.view.k / PX;
    let best = null, bd = px;
    for (const ed of L.edges) {
      // its label too
      if (ed.label) {
        const [X, Y] = S(ed.label.x, ed.label.y), hw = (ed.label.b.w / 2) * kk + 2, hh = (ed.label.b.h / 2) * kk + 2;
        if (Math.abs(x - X) <= hw && Math.abs(y - Y) <= hh) return ed.i;
      }
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
    const k = Math.max(20, Math.min(160, Math.min((r.width - 80) / w, (r.height - 80) / h)));
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
    // the selected transition, as a halo under the drawing
    const se = selE(), sl = se && L.edges.find((x) => x.i === E.sel.e);
    if (sl) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})"><path class="ze-wsel" d="${sl.d}" stroke-width="${r2(10 / kk)}"/></g>`;
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})">${F.draw({ type: 'automata', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">Place a state from the left to start</text>`;
    const ss = selS(), dragE = E.drag && E.drag.mode === 'edge', armLoop = E.arm && E.arm[0] === 'l';
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), rr = Math.max(4, nodeR(n) + 3);
      if (ss && ss.name === name) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (dragE && E.hover && E.hover.v === name) out += `<circle class="fy-vtarget" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (E.hover && E.hover.v === name && (!E.drag || armLoop)) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr)}"/>`;
    }
    // a transition being drawn
    if (dragE) {
      const d = E.drag, n = L.nodes.get(d.from);
      if (n) {
        const [x0, y0] = S(n.x, n.y);
        if (E.hover && E.hover.v === d.from) {
          // back onto itself: a loop
          const rr = nodeR(n) + 4;
          out += `<path class="ze-draft" d="M${r2(x0 - rr * 0.4)},${r2(y0 - rr * 0.92)}C${r2(x0 - rr)},${r2(y0 - rr * 2.6)} ${r2(x0 + rr)},${r2(y0 - rr * 2.6)} ${r2(x0 + rr * 0.4)},${r2(y0 - rr * 0.92)}"/>`;
        } else {
          const t = E.hover && E.hover.v ? S(L.nodes.get(E.hover.v).x, L.nodes.get(E.hover.v).y) : m(...(E.hover && E.hover.at ? E.hover.at : d.at));
          out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(t[0])},${r2(t[1])}"/>`;
          if (!(E.hover && E.hover.v)) out += `<circle class="cz-snap on" cx="${r2(t[0])}" cy="${r2(t[1])}" r="5"/>`;
        }
      }
    }
    // the knob: a selected (or hovered) state's handle for drawing transitions
    const kn_ = !E.drag && !E.arm && !E.ghost && (E.knobAt || (ss && ss.name));
    const kn = kn_ && L.nodes.get(kn_);
    E.knobPos = null;
    if (kn) {
      // in the widest gap between the state's transitions, so it never sits on one
      const dirs = [];
      for (const ed of L.edges) {
        const p = ed.P.pts;
        if (p.length < 2) continue;
        if (ed.a === kn_) dirs.push(Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]));
        if (ed.b === kn_) { const n = p.length; dirs.push(Math.atan2(p[n - 2][1] - p[n - 1][1], p[n - 2][0] - p[n - 1][0])); }
      }
      const st = sOf(kn_);
      if (st && flags(st).initial) dirs.push((-F.DIRS[flags(st).side] * Math.PI) / 180);
      let ang = 0;
      if (dirs.length) {
        let best = -1;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * 2 * Math.PI, gap = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d)))));
          if (gap > best + 1e-6) { best = gap; ang = a; }
        }
      }
      const [X, Y] = S(kn.x, kn.y), off = Math.max(4, nodeR(kn)) + 12, kx = r2(X + off * Math.cos(ang)), ky = r2(Y + off * Math.sin(ang));
      E.knobPos = { v: kn_, X, Y, kx, ky };
      out += `<g class="ze-knob" data-v="${esc(kn_)}"><title>Drag to another state to draw a ${esc(KIND_NAMES[E.kind])}, or back onto this one for a loop</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // placing: where it lands
    if (E.arm && !armLoop && E.hover && E.hover.at || E.ghost && E.hover && E.hover.at) { const [X, Y] = m(...E.hover.at); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm && !armLoop);
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
    const sn = stateAt(e);
    if (E.arm && E.arm[0] === 'l') { if (sn != null) addEdge(sn, sn, E.arm.slice(2)); return; }
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); addState(E.arm, x, y); return; }
    const ei = sn == null ? edgeAt(e) : null;
    if (sn != null) {
      if (dbl && E.sel && E.sel.s === sn) { editLabel({ s: sn }); return; }
      E.sel = { s: sn };
      const s = sOf(sn), n = lay().nodes.get(sn);
      if (!s) { draw(); renderProps(); return; }
      E.drag = { mode: 'move', s: sn, sx, sy, moved: false, x0: s.x != null ? s.x : n.x / PX, y0: s.y != null ? s.y : -n.y / PX };
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
      const sn = stateAt(e, 14), kb = e.target.closest('.ze-knob');
      const h = E.arm && E.arm[0] !== 'l' ? { at: toCm(e, !e.altKey) } : sn ? { v: sn } : null;
      // the handle stays up while the pointer travels from its state to it
      const kp = E.knobPos, onWay = (() => {
        if (!kp || kp.v !== E.knobAt) return false;
        const dx = kp.kx - kp.X, dy = kp.ky - kp.Y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - kp.X) * dx + (sy - kp.Y) * dy) / l2));
        return Math.hypot(kp.X + dx * t - sx, kp.Y + dy * t - sy) <= 12;
      })();
      const knob = sn || (kb || onWay ? E.knobAt : null);
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.style.cursor = E.arm ? (E.arm[0] === 'l' && sn ? 'copy' : '') : stateAt(e) != null ? 'move' : edgeAt(e) != null ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'edge') {
      const sn = stateAt(e, 14);
      E.hover = sn ? { v: sn } : { at: toCm(e, !e.altKey) };
      setTip(sn === d.from ? `Loop at ${sn}` : sn ? `Transition to ${sn}` : 'Drop on a state, or on the grid for a new one');
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); pin(dependents(d.s)); d.moved = true; }
      const s = sOf(d.s), k = E.view.k;
      s.x = snap(d.x0 + (sx - d.sx) / k, !e.altKey); s.y = snap(d.y0 - (sy - d.sy) / k, !e.altKey); s.rel = null;
      E.M.dirty = true;
      setTip(`${d.s} at (${F.num(s.x)}, ${F.num(s.y)})${e.altKey ? '' : ' · ⌥ to place freely'}`);
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', (e) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'edge') {
      setTip('');
      const sn = stateAt(e, 14);
      E.hover = null;
      if (sn) addEdge(d.from, sn);
      else if (overStage(e)) {
        const [x, y] = toCm(e, !e.altKey);
        begin();
        const name = newName();
        E.M.states.push({ name, o: ['state'], x, y, rel: null, text: qLabel(name) });
        const g = groupFor();
        E.M.edges.push({ a: d.from, b: name, o: E.kind === 'bend' ? ['bend left'] : [], lo: null, t: null, g, loop: false });
        E.M.dirty = true; commit();
        E.sel = { e: E.M.edges.length - 1 }; renderProps(); draw();
        editLabel({ e: E.M.edges.length - 1 });
      }
      draw(); return;
    }
    if (d.mode === 'move' && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the state's or transition's actions
  const MI = {
    label: '<path d="M4 15l2-5 6-6 3 3-6 6zM11 5l3 3"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    rev: '<path d="M3 7h12l-3-3M17 13H5l3 3"/>',
    left: '<path d="M3 15C5 6 15 6 17 15"/>',
    right: '<path d="M3 5c2 9 12 9 14 0"/>',
    straight: '<path d="M3 10h14"/>',
    initial: '<circle cx="13" cy="10" r="4.5"/><path d="M2 10h5.5M5.5 7.5L8 10l-2.5 2.5"/>',
    accepting: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="4"/>',
    loop: '<circle cx="10" cy="13" r="4"/><path d="M8 9.3C5 3 15 3 12 9.3M12.6 6.6l-.6 2.7-2.5-1"/>',
    swap: '<path d="M4 10h12"/><path d="M8 6.5h4M8 13.5h4" stroke-dasharray="1.5 1.5"/>',
  };
  const mItem = (act, label, icon, key, on) => `<button class="ctx-item${/^(sdel|edel)$/.test(act) ? ' danger' : ''}${on ? ' on' : ''}" data-fm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const sn = stateAt(e), ei = sn == null ? edgeAt(e) : null;
    if (sn != null && sOf(sn)) {
      E.sel = { s: sn };
      const f = flags(sOf(sn));
      menu.innerHTML = mItem('label', 'Edit Label', 'label', '↩') + '<hr>' +
        mItem('init', f.initial ? 'Not Initial' : 'Make Initial', 'initial', 'I') + mItem('acc', f.accepting ? 'Not Accepting' : 'Make Accepting', 'accepting', 'A') +
        mItem('addloop', 'Add Loop', 'loop', 'L') + '<hr>' + mItem('sdel', 'Delete State', 'del', '⌫');
    } else if (ei != null) {
      E.sel = { e: ei };
      const ed = E.M.edges[ei];
      menu.innerHTML = mItem('label', 'Edit Label', 'label', '↩') + (ed.t ? mItem('swap', 'Label on the Other Side', 'swap') : '') + (ed.loop ? '' : mItem('rev', 'Reverse Direction', 'rev')) + '<hr>' +
        (ed.loop ? mItem('la', 'Loop Above', 'loop') + mItem('lb', 'Loop Below', 'loop') + mItem('ll', 'Loop Left', 'loop') + mItem('lr', 'Loop Right', 'loop')
          : mItem('bleft', 'Bend Left', 'left') + mItem('bright', 'Bend Right', 'right') + mItem('bnone', 'Straight', 'straight')) +
        '<hr>' + mItem('edel', ed.loop ? 'Delete Loop' : 'Delete Transition', 'del', '⌫');
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
  // A floating box under the state or transition (TD.input.popup); the whole edit is one undo step.
  let Lb = null;
  function editLabel(target) {
    if (!TD.input) return false;
    closeLabel();
    const s = target.s != null ? sOf(target.s) : null, e = target.e != null ? E.M.edges[target.e] : null;
    if (!s && !e) return false;
    begin();
    const me = (Lb = { target });
    const text = s ? mathOf(s.text || '') : mathOf(e.t || '');
    me.pop = TD.input.popup(stage, {
      text, math: true, bare: true,
      at: () => labelPos(target),
      onInput: (t) => {
        if (s) s.text = wrapMath(t);
        else setLabel(e, t);
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.s != null) { const n = L.nodes.get(target.s); if (n) { [X, Y] = S(n.x, n.y); Y += Math.max(6, nodeR(n)) + 10; } }
    else {
      const ed = L.edges.find((x) => x.i === target.e);
      if (ed) { const q = ed.label || F.along(ed.P, ed.P.len / 2); [X, Y] = S(q.x, q.y); Y += 14; }
    }
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
    const M = E.M, s = selS(), e = selE();
    if (s) {
      const L = lay(), n = L.nodes.get(s.name), f = flags(s);
      const x = s.x != null ? s.x : n ? n.x / PX : null, y = s.y != null ? s.y : n ? -n.y / PX : null;
      const rest = s.o.filter((it) => !isFlag(it));
      const outs = M.edges.filter((ed) => ed.a === s.name).length;
      const kind = f.initial && f.accepting ? 'Initial, accepting state' : f.initial ? 'Initial state' : f.accepting ? 'Accepting state' : f.state ? 'State' : 'Node';
      const side = /\s/.test(f.side) ? '' : f.side;
      TD.morph(props, `<div class="sec"><div class="sec-title">${esc(kind)} <small>${outs} transition${outs === 1 ? '' : 's'} out</small></div>
        ${field('Name', 'name', s.name, ' class="mono"')}
        ${field('Label', 'text', mathOf(s.text || ''), ' data-tx="math" placeholder="none"')}
        ${row('Initial', seg('init', f.initial ? 1 : 0, [[0, 'No'], [1, 'Yes', 'initial: an arrow comes in from outside']]))}
        ${row('Arrow from', seg('iside', side, [['left', 'Left'], ['above', 'Above'], ['below', 'Below'], ['right', 'Right']], !f.initial))}
        ${field('Start text', 'itext', f.initial ? f.text : '', `${f.initial ? '' : ' disabled'} placeholder="none"`)}
        ${row('Accepting', seg('acc', f.accepting ? 1 : 0, [[0, 'No'], [1, 'Yes', 'accepting: drawn with a double line']]))}
        ${numField('x', 'x', x)}${numField('y', 'y', y)}
        ${s.x == null ? `<div class="help">${s.rel ? `Placed ${esc(s.rel.dir)} of ${esc(s.rel.of)}. Moving it writes its position.` : 'No position in the code: moving it writes one.'}</div>` : ''}
        ${field('Options', 'sopts', rest.join(', '), ' class="mono" placeholder="e.g. fill=blue!10"')}
        <div class="row"><button class="danger" data-fe="sdel">Delete State</button></div></div>`);
      return;
    }
    if (e) {
      const b = bendOf(e), side = sideOf(e), lp = e.loop ? loopOf(e) : '';
      const rest = e.o.filter((it) => !isBend(it) && !isLoop(it) && !isSwap(it));
      TD.morph(props, `<div class="sec"><div class="sec-title">${e.loop ? 'Loop' : 'Transition'} <small>${e.loop ? `at ${esc(e.a)}` : `${esc(e.a)} → ${esc(e.b)}`}</small></div>
        ${field('Label', 'label', mathOf(e.t || ''), ' data-tx="math" placeholder="none"')}
        ${row('Label side', seg('side', side, [[1, 'Left', 'Left of the arrow’s direction'], [-1, 'Right', 'swap: right of the arrow’s direction']], !e.t))}
        ${e.loop ? row('Loop', seg('loop', lp, [['above', 'Above'], ['below', 'Below'], ['left', 'Left'], ['right', 'Right']]))
          : row('Bend', seg('bend', b.kind === 'custom' ? '' : b.kind, [['', 'Straight'], ['left', 'Left'], ['right', 'Right']]))}
        ${e.loop ? '' : row('Angle', `<div class="ctl unit"><input type="number" data-f="angle" value="${b.kind === 'left' || b.kind === 'right' ? F.num(b.a) : ''}" min="5" max="90" step="5"${b.kind === 'left' || b.kind === 'right' ? '' : ' disabled'}><span>°</span></div>`)}
        ${field('Options', 'eopts', rest.join(', '), ' class="mono" placeholder="e.g. dashed"')}
        <div class="row">${e.loop ? '' : '<button data-fe="rev">Reverse Direction</button>'}<button class="danger" data-fe="edel">${e.loop ? 'Delete Loop' : 'Delete Transition'}</button></div></div>`);
      return;
    }
    TD.morph(props, `<div class="sec"><div class="sec-title">State machine <small>${M.states.length} states · ${M.edges.length} transitions</small></div>
      <div class="help">Place states from the left on the grid; drag them to move (<kbd>⌥</kbd> places freely), and their transitions follow. Select a state and drag its blue handle to another state for a transition, or back onto the same state for a loop. Double-click a state or transition to label it.</div></div>
      <div class="sec"><div class="sec-title">Auto layout</div>
      <div class="row fsm-auto"><button data-fe="layers" title="Columns by distance from the initial state">In Layers</button><button data-fe="circle" title="On a circle, in the order they are reached">On a Circle</button></div>
      <div class="help">Places every state and bends transitions that would cross a state or their reverse. One undo step.</div></div>`);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { if (e.target.dataset.f === 'name') { const s = selS(); if (s && s.name !== e.target.value.trim()) e.target.value = s.name; } commit(); renderProps(); } });
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const s = selS(), e = selE();
    if (s) {
      if (f === 'name') { if (!rename(s, t.value)) return; }
      else if (f === 'text') s.text = wrapMath(t.value);
      else if (f === 'itext') setInitText(s, t.value);
      else if (f === 'x' || f === 'y') { const n = parseFloat(t.value); if (!isFinite(n)) return; pin([s.name, ...dependents(s.name)]); s[f] = n; s.rel = null; }
      else if (f === 'sopts') { s.o = s.o.filter(isFlag).concat(F.opts(t.value)); }
    } else if (e) {
      if (f === 'label') setLabel(e, t.value);
      else if (f === 'angle') { const n = parseFloat(t.value); if (!isFinite(n)) return; setBend(e, bendOf(e).kind, n); }
      else if (f === 'eopts') { const keep = e.o.filter((it) => isBend(it) || isLoop(it) || isSwap(it)); e.o = keep.concat(F.opts(t.value)); }
    } else return;
    E.M.dirty = true; draw();
  });
  // the panel follows each keystroke: the other fields show what this one changed (TD.morph keeps this one as typed)
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, e = selE(), s = selS();
    if (s) edit(() => {
      const fl = flags(s);
      if (f === 'init') setFlags(s, v === '1', fl.accepting);
      else if (f === 'acc') setFlags(s, fl.initial, v === '1');
      else if (f === 'iside') setInitSide(s, v);
    });
    else if (e) edit(() => {
      if (f === 'side') setSide(e, +v);
      else if (f === 'bend') setBend(e, v, bendOf(e).a || 30);
      else if (f === 'loop') setLoop(e, v);
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-fe="undo"]', root).disabled = !E.undo.length;
    $('[data-fe="redo"]', root).disabled = !E.redo.length;
    $('[data-fe="layout"]', root).disabled = !E.M.states.length;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fe]');
    if (!b || !E) return;
    act(b.dataset.fe, b);
  });
  function act(a, b) {
    const e = selE(), s = selS();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'layout' || a === 'layers') autoLayout('layers');
    else if (a === 'circle') autoLayout('circle');
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'sdel') { if (s) deleteState(s.name); }
    else if (a === 'edel') { if (e) deleteEdge(E.sel.e); }
    else if (a === 'label') { if (E.sel) editLabel(E.sel); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    else if (s) {
      const f = flags(s);
      if (a === 'init') edit(() => setFlags(s, !f.initial, f.accepting));
      else if (a === 'acc') edit(() => setFlags(s, f.initial, !f.accepting));
      else if (a === 'addloop') addEdge(s.name, s.name);
    } else if (e) {
      if (a === 'rev') edit(() => reverseEdge(e));
      else if (a === 'swap') edit(() => setSide(e, -sideOf(e)));
      else if (a === 'bleft') edit(() => setBend(e, 'left'));
      else if (a === 'bright') edit(() => setBend(e, 'right'));
      else if (a === 'bnone') edit(() => setBend(e, ''));
      else if (/^l[ablr]$/.test(a)) edit(() => setLoop(e, { la: 'above', lb: 'below', ll: 'left', lr: 'right' }[a]));
    }
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M;
    count.textContent = `${M.states.length} state${M.states.length === 1 ? '' : 's'} · ${M.edges.length} transition${M.edges.length === 1 ? '' : 's'}`;
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
    clampSel(); draw(); renderProps(); updateTools();
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
    const s = selS();
    if (e.key.startsWith('Arrow') && s) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      edit(() => { pin([s.name, ...dependents(s.name)]); s.x = snap(s.x + dx, false); s.y = snap(s.y + dy, false); s.rel = null; });
      return;
    }
    // on a selected state, I and A toggle; L adds a loop
    if (s && /^[ial]$/i.test(e.key)) {
      e.preventDefault();
      act(e.key.toLowerCase() === 'i' ? 'init' : e.key.toLowerCase() === 'a' ? 'acc' : 'addloop');
      return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the machine back to the page (one undo step there) and keep editing
  function save() {
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snapCode();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  async function finish(ok) {
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = snapCode(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this state machine?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, kind: 'straight', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(() => { if (E) fit(); });
  }
  TD.fsmEditor = { open };
})();
