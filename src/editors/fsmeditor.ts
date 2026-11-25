import { captions } from '../i18n/messages';
import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, actionRow, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import FsmeditorFrame from '../ui/editors/FsmeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { patchSvg } from '../ui/svg-patch';
import { runtime as TD } from '../runtime';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// State machine editor: the overlay that opens on a State machine block. A palette of states, transitions
// and loops; the machine drawn by the canvas renderer on a centimetre grid, where states are placed and
// moved (their transitions follow) and transitions are dragged from state to state; Auto layout places
// every state; the selected state's or transition's properties; and beside them the TikZ code, live both
// ways. Untouched code is handed back as written.
// TD.fsmEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const F = TD.fsm;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const PX = TD.PX_PER_CM, GRID = 0.25;
  const kv = F.kv;

  // ---------------------------------------------------------------- palette
  const pic = (body: any) => `\\begin{tikzpicture}[->, >=Stealth, shorten >=1pt, initial text=]${body}\\end{tikzpicture}`;
  const sMini = (o: any) => pic(`\\node[state${o}] (a) at (0,0) {};`);
  const eMini = (o: any) => pic(`\\node (a) at (0,0) {}; \\node (b) at (1.4,0) {}; \\path (a) edge [${o}] (b);`);
  const lMini = (side: any) => pic(`\\node[state] (a) at (0,0) {}; \\path (a) edge [loop ${side}] ();`);
  // names are caption descriptors, shown in the interface language when the palette is drawn
  const PAL: any[] = [
    [message('editor.fsm.cat.states', 'States'), [
      ['s:state', message('editor.fsm.state', 'State'), sMini(''), 'S'], ['s:initial', message('editor.fsm.initial', 'Initial'), sMini(', initial'), 'I'],
      ['s:accepting', message('editor.fsm.acceptingFinal', 'Accepting (final)'), sMini(', accepting'), 'A', message('editor.fsm.final', 'Final')], ['s:both', message('editor.fsm.initialAccepting', 'Initial and accepting'), sMini(', initial, accepting'), null, message('editor.fsm.both', 'Both')],
    ]],
    [message('editor.fsm.cat.transitions', 'Transitions'), [
      ['e:straight', message('editor.fsm.straight', 'Straight'), eMini(''), 'T'], ['e:bend', message('editor.fsm.bent', 'Bent'), eMini('bend left'), 'B'],
    ]],
    [message('editor.fsm.cat.loops', 'Loops'), [
      ['l:above', message('editor.fsm.loopAbove', 'Loop above'), lMini('above'), 'L', message('editor.fsm.above', 'Above')], ['l:below', message('editor.fsm.loopBelow', 'Loop below'), lMini('below'), null, message('editor.fsm.below', 'Below')],
      ['l:left', message('editor.fsm.loopLeft', 'Loop left'), lMini('left'), null, message('editor.fsm.left', 'Left')], ['l:right', message('editor.fsm.loopRight', 'Loop right'), lMini('right'), null, message('editor.fsm.right', 'Right')],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key, short] of items) { ITEM[(k as any)] = { k, name, mini, key, short }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.fsm.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? F.write(M) : M.raw);
  const sOf = (name: any) => E.M.states.find((s: any) => s.name === name) || null;
  // maths in a label: $x$ or \(x\) → x; written back as $x$
  const BR = /\s*\\\\(?:\[[^\]]*\])?\s*/;
  const math1 = (t: string) => { const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1] : t; };
  // a label of several lines ($a$ \\ $b$) shows its lines joined by sep: a new line in the popup, \\ in a field
  const mathOf = (t: any, sep = ' \\\\ ') => F.unbrace(t || '').split(BR).map((l: string) => math1(l.trim())).join(sep);
  const wrapMath = (t: any) => {
    const ls = String(t || '').split(/\n|\s*\\\\(?:\[[^\]]*\])?\s*/).map((l) => math1(l.trim()).trim());
    while (ls.length > 1 && !ls[ls.length - 1]) ls.pop();
    return ls.some(Boolean) ? ls.map((l) => (l ? `$${l}$` : '')).join(' \\\\ ') : '';
  };
  const val = (t: any) => (/[,=\]]/.test(t) || t === '' ? `{${t}}` : t);
  // state options by kind
  const isInitW = (it: any) => kv(it).k === 'initial where';
  const isInitT = (it: any) => kv(it).k === 'initial text';
  const isFlag = (it: any) => F.isInitial(it) || F.isAccepting(it) || isInitW(it) || isInitT(it) || /^state( without output)?$/.test(kv(it).k);
  const flags = (s: any) => { const S = F.applyNodeOpts({ ...lay().P0, initial: false, accepting: false, state: false }, s.o, null); return { initial: S.initial, accepting: S.accepting, side: S.initWhere, text: S.initText, state: S.state }; };
  function setFlags(s: any, init: any, acc: any) {
    const f = flags(s), side = f.side, keepW = s.o.find(isInitW), keepT = s.o.find(isInitT);
    const rest = s.o.filter((it: any) => !isFlag(it));
    const o = ['state'];
    if (init) o.push(side === 'left' || !F.DIRS[side] || /\s/.test(side) ? 'initial' : `initial ${side}`);
    if (init && keepT) o.push(keepT);
    if (init && keepW && /\s/.test(side)) o.push(keepW);
    if (acc) o.push('accepting');
    s.o = o.concat(rest);
  }
  function setInitSide(s: any, side: any) {
    const acc = flags(s).accepting, keepT = s.o.find(isInitT), rest = s.o.filter((it: any) => !isFlag(it));
    s.o = ['state', side === 'left' ? 'initial' : `initial ${side}`].concat(keepT ? [keepT] : [], acc ? ['accepting'] : [], rest);
  }
  function setInitText(s: any, t: any) {
    const def = lay().P0.initText;
    const i = s.o.findIndex(isInitT), it = t === def ? null : `initial text=${val(t)}`;
    if (i >= 0) { if (it) s.o[i] = it; else s.o.splice(i, 1); } else if (it) { const j = s.o.findIndex(F.isInitial); s.o.splice(j >= 0 ? j + 1 : s.o.length, 0, it); }
  }
  // transition options by kind
  const isBend = (it: any) => /^(bend left|bend right|out|in|looseness)$/.test(kv(it).k);
  const isLoop = (it: any) => /^loop( (above|below|left|right))?$/.test(kv(it).k);
  const isSwap = (it: any) => /^(swap|')$/.test(kv(it).k);
  function bendOf(e: any) {
    for (const it of e.o) { const { k, v } = kv(it); if (k === 'bend left' || k === 'bend right') return { kind: k.slice(5), a: v == null ? 30 : parseFloat(v) || 30 }; }
    return { kind: e.o.some(isBend) ? 'custom' : '', a: 30 };
  }
  function setBend(e: any, kind: any, a = 30) {
    e.o = e.o.filter((x: any) => !isBend(x));
    if (kind === 'left' || kind === 'right') e.o.push(`bend ${kind}${a !== 30 ? `=${F.num(a)}` : ''}`);
  }
  const loopOf = (e: any) => { for (const it of e.o) { const m = /^loop (above|below|left|right)$/.exec(kv(it).k); if (m) return m[1]; } return 'above'; };
  function setLoop(e: any, side: any) {
    e.o = e.o.filter((x: any) => !isLoop(x)); e.o.unshift(`loop ${side}`);
    if (e.lo) e.lo = e.lo.filter((it: any) => F.DIRS[kv(it).k] == null);
  }
  const sideOf = (e: any) => ((e.lo || []).concat(e.o).filter(isSwap).length % 2 ? -1 : 1);
  function setSide(e: any, side: any) {
    e.o = e.o.filter((x: any) => !isSwap(x));
    e.lo = (e.lo || []).filter((x: any) => !isSwap(x));
    if (side < 0) e.lo.push('swap');
  }
  function setLabel(e: any, t: any) {
    if (t) { e.t = wrapMath(t); if (!e.lo) e.lo = []; }
    else { e.t = null; e.lo = null; }
  }
  const qLabel = (name: any) => { const i = name.slice(1); return `$q_${i.length > 1 ? `{${i}}` : i}$`; };
  function newName() { let n = 0; while (sOf('q' + n)) n++; return 'q' + n; }
  // every state gets its drawn place written down (before a state it depends on moves or goes)
  function pin(names: any) {
    const L = lay();
    for (const s of E.M.states) {
      if (s.x != null || (names && !names.includes(s.name))) continue;
      const n = L.nodes.get(s.name);
      if (n) { s.x = snap(n.x / PX, true); s.y = snap(-n.y / PX, true); s.rel = null; }
    }
  }
  const dependents = (name: any) => E.M.states.filter((s: any) => s.x == null && s.rel && s.rel.of === name).map((s: any) => s.name);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'fsmModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, FsmeditorFrame);
  document.body.appendChild(root);
  const svg = $('.fsm-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'fsm-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { s: name } | { e: index } | null, arm, kind, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snapCode = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.typed = code; E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() {
    const s = E.sel;
    if (s && s.s != null && !sOf(s.s)) E.sel = null;
    if (s && s.e != null && !E.M.edges[s.e]) E.sel = null;
  }
  const selS = () => (E.sel && E.sel.s != null ? sOf(E.sel.s) : null);
  const selE = () => (E.sel && E.sel.e != null ? E.M.edges[E.sel.e] || null : null);
  const lay = () => F.layout({ src: snapCode() });
  const snap = (n: any, on: any) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- editing
  const KINDS: Record<string, any> = { 's:state': [false, false], 's:initial': [true, false], 's:accepting': [false, true], 's:both': [true, true] };
  function addState(key: any, x: any, y: any) {
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
    for (let g = M.groups.length - 1; g >= 0; g--) if (M.edges.some((e: any) => e.g === g)) return g;
    M.groups.push({ cmd: 'path', o: lay().P0.arrow.e ? '' : '->' });
    return M.groups.length - 1;
  }
  function addEdge(a: any, b: any, extra?: any) {
    const loop = a === b;
    edit(() => {
      const g = groupFor();
      // a transition beside one between the same states (either way) bends, so neither hides the other
      const twin = loop ? [] : E.M.edges.filter((f: any) => !f.loop && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
      const o = loop ? [`loop ${extra || freeSide(a)}`] : E.kind === 'bend' ? ['bend left'] : [];
      const e = { a, b, o, lo: null, t: null, g, loop };
      E.M.edges.push(e);
      // transitions already between the two states (either way) fan out with the new one
      if (twin.length) F.fan(twin.concat(e), a, e);
    });
    E.sel = { e: E.M.edges.length - 1 }; draw(); renderProps();
    editLabel({ e: E.M.edges.length - 1 });
  }
  // the side of a state with the most room for a loop
  function freeSide(name: any) {
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
    let best: any = 'above', gap = -1;
    for (const [side, a] of [['above', 90], ['below', 270], ['right', 0], ['left', 180]]) {
      const r = ((a as any) * Math.PI) / 180, g = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(r - d), Math.cos(r - d))))) : 9;
      if (g > gap + 1e-6) { gap = g; best = side; }
    }
    return best;
  }
  function deleteState(name: any) {
    edit(() => {
      pin(dependents(name));
      E.M.states = E.M.states.filter((s: any) => s.name !== name);
      E.M.edges = E.M.edges.filter((e: any) => e.a !== name && e.b !== name);
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteEdge(i: any) { edit(() => E.M.edges.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { const s = selS(), e = selE(); if (s) deleteState(s.name); else if (e) deleteEdge(E.sel.e); }
  // the picture stays but for the arrow: the label keeps its side, a bend keeps its side
  function reverseEdge(e: any) {
    if (e.loop) return;
    const t = e.a; e.a = e.b; e.b = t;
    if (e.t) setSide(e, -sideOf(e));
    const b = bendOf(e);
    if (b.kind === 'left' || b.kind === 'right') setBend(e, b.kind === 'left' ? 'right' : 'left', b.a);
  }
  function rename(s: any, to: any) {
    to = to.trim();
    if (!to || to === s.name || !/^[A-Za-z0-9_.']+$/.test(to) || sOf(to)) return false;
    for (const e of E.M.edges) { if (e.a === s.name) e.a = to; if (e.b === s.name) e.b = to; }
    for (const w of E.M.states) if (w.rel && w.rel.of === s.name) w.rel.of = to;
    s.name = to; E.sel = { s: to };
    return true;
  }
  function autoLayout(mode: any) {
    if (!E.M.states.length) return;
    const step = Math.max(2, lay().P0.nd[1]);
    edit(() => F.autoLayout(E.M, mode, step));
    fit();
    const placed = mode === 'circle' ? uiText('editor.fsm.placedCircle', 'States placed on a circle') : uiText('editor.fsm.placedLayers', 'States placed in layers from the initial state');
    stageNote.flash(placed, 1800);
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      items: items.map(([k, label, , key]: any) => ({
        id: k, label: ITEM[k].short ? caption(ITEM[k].short) : caption(label), title: caption(label), key,
        // the shown name, the English one and the category's both find it
        alt: label.fallback, keywords: `${k.slice(2)} ${caption(cat)} ${cat.fallback}`,
        svg: fitMini(TD.fsmMini(ITEM[k].mini, 1e3), 64, 40, 1.6), on: !!E && E.kind != null && k === `e:${E.kind}`,
      })),
    })), { armed: E?.arm });
  }
  // click: a state kind restyles the selected state or is armed for placing; a transition kind restyles the
  // selected transition and is the kind new ones get; a loop goes on the selected state, or is armed.
  // Drag a state kind onto the canvas.
  paletteDrag(list, {
    keyboard: true,
    drags: (k) => k[0] === 's',
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); addState(d.k, x, y); }
      E.hover = null; draw();
    },
  });
  function pick(k: any) {
    if (k[0] === 'e') {
      if (E.arm) { E.arm = null; draw(); }
      E.kind = k.slice(2);
      const e = selE();
      if (e && !e.loop) edit(() => setBend(e, E.kind === 'bend' ? 'left' : '', 30));
      buildPalette();
      setTip(e ? '' : uiText('editor.fsm.edgeTip', '{name}: point at a state, then drag its blue handle to another state (or back onto itself for a loop)', { name: caption(ITEM[k].name) }));
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
    setTip(E.arm ? (k[0] === 'l' ? uiText('editor.fsm.armLoopTip', '{name}: click a state to give it a loop. Esc when done.', { name: caption(ITEM[k].name) }) : uiText('editor.fsm.armTip', '{name}: click the grid to place it. Esc when done.', { name: caption(ITEM[k].name) })) : '');
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 600], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  // screen ↔ cm (y up)
  const m = (x: any, y: any) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  const toCm = (e: any, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snap((x - v.ox) / v.k, snapOn), snap((v.oy - y) / v.k, snapOn)]; };
  // layout px (y down) → screen
  const S = (x: any, y: any) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const nodeR = (n: any) => Math.max(n.r || 0, n.hw || 0, n.hh || 0) * (E.view.k / PX);
  function stateAt(e: any, px = 8) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, nodeR(n) + 3) && d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function edgeAt(e: any, px = 6) {
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
        const [ax, ay] = S(...(p[i - 1] as [any, any])), [bx, by] = S(...(p[i] as [any, any]));
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = ed.i; }
      }
    }
    return best;
  }
  function fit() {
    const L = lay();
    E.view = fitView(rect(), L.empty ? { x: 0, y: -2 * PX, w: 4 * PX, h: 2 * PX } : L.bb, { scale: PX, margin: 0.5, min: 20, max: 160 });
    draw();
  }

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
    const se = selE(), sl = se && L.edges.find((x: any) => x.i === E.sel.e);
    if (sl) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})"><path class="ze-wsel" d="${sl.d}" stroke-width="${r2(10 / kk)}"/></g>`;
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${F.draw({ type: 'automata', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
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
          const t = E.hover && E.hover.v ? S(L.nodes.get(E.hover.v).x, L.nodes.get(E.hover.v).y) : m(...((E.hover && E.hover.at ? E.hover.at : d.at) as [any, any]));
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
      out += `<g class="ze-knob" data-v="${esc(kn_)}"><title>${esc(E.kind === 'bend' ? uiText('editor.fsm.knobBent', 'Drag to another state to draw a bent transition, or back onto this one for a loop') : uiText('editor.fsm.knobStraight', 'Drag to another state to draw a straight transition, or back onto this one for a loop'))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // placing: where it lands
    if (E.arm && !armLoop && E.hover && E.hover.at || E.ghost && E.hover && E.hover.at) { const [X, Y] = m(...(E.hover.at as [any, any])); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm && !armLoop);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    // a double-click is detected here: a redraw between the clicks may replace the target, so a native dblclick can't be relied on
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'edge', from: kb.dataset.v, at: toCm(e), cx: e.clientX, cy: e.clientY }; E.knobAt = null; return; }
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
  svg.addEventListener('pointermove', (e: any) => {
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
      setTip(sn === d.from ? uiText('editor.fsm.loopAt', 'Loop at {name}', { name: sn }) : sn ? uiText('editor.fsm.transitionTo', 'Transition to {name}', { name: sn }) : uiText('editor.fsm.dropTip', 'Drop on a state, or on the grid for a new one'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); pin(dependents(d.s)); d.moved = true; }
      const s = sOf(d.s), k = E.view.k;
      s.x = snap(d.x0 + (sx - d.sx) / k, !e.altKey); s.y = snap(d.y0 - (sy - d.sy) / k, !e.altKey); s.rel = null;
      E.M.dirty = true;
      setTip(e.altKey ? uiText('editor.fsm.stateAt', '{name} at ({x}, {y})', { name: d.s, x: F.num(s.x), y: F.num(s.y) }) : uiText('editor.fsm.stateAtFree', '{name} at ({x}, {y}) · ⌥ to place freely', { name: d.s, x: F.num(s.x), y: F.num(s.y) }));
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'edge') {
      // a click on the handle, without dragging, does nothing
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) { setTip(''); E.hover = null; draw(); return; }
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
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', del: 'delete', straight: 'straight', rev: 'reverse', left: 'bendLeft', right: 'bendRight', initial: 'stateInitial', accepting: 'stateAccepting', loop: 'loop', swap: 'swapLabel' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /^(sdel|edel)$/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const sn = stateAt(e), ei = sn == null ? edgeAt(e) : null;
    if (sn != null && sOf(sn)) {
      E.sel = { s: sn };
      const f = flags(sOf(sn));
      menuRows = [mItem('label', uiText('editor.fsm.editLabel', 'Edit Label'), 'label', '↩'), '-', mItem('init', f.initial ? uiText('editor.fsm.notInitial', 'Not Initial') : uiText('editor.fsm.makeInitial', 'Make Initial'), 'initial', 'I'), mItem('acc', f.accepting ? uiText('editor.fsm.notAccepting', 'Not Accepting') : uiText('editor.fsm.makeAccepting', 'Make Accepting'), 'accepting', 'A'), mItem('addloop', uiText('editor.fsm.addLoop', 'Add Loop'), 'loop', 'L'), '-', mItem('sdel', uiText('editor.fsm.deleteState', 'Delete State'), 'del', '⌫')];
    } else if (ei != null) {
      E.sel = { e: ei };
      const ed = E.M.edges[ei];
      menuRows = [mItem('label', uiText('editor.fsm.editLabel', 'Edit Label'), 'label', '↩'), ...(ed.t ? [mItem('swap', uiText('editor.fsm.labelOtherSide', 'Label on the Other Side'), 'swap')] : []), ...(ed.loop ? [] : [mItem('rev', uiText('editor.fsm.reverse', 'Reverse Direction'), 'rev')]), '-', ...(ed.loop ? [mItem('la', uiText('editor.fsm.menuLoopAbove', 'Loop Above'), 'loop'), mItem('lb', uiText('editor.fsm.menuLoopBelow', 'Loop Below'), 'loop'), mItem('ll', uiText('editor.fsm.menuLoopLeft', 'Loop Left'), 'loop'), mItem('lr', uiText('editor.fsm.menuLoopRight', 'Loop Right'), 'loop')] : [mItem('bleft', uiText('editor.fsm.bendLeft', 'Bend Left'), 'left'), mItem('bright', uiText('editor.fsm.bendRight', 'Bend Right'), 'right'), mItem('bnone', uiText('editor.fsm.straight', 'Straight'), 'straight')]), '-', mItem('edel', ed.loop ? uiText('editor.fsm.deleteLoop', 'Delete Loop') : uiText('editor.fsm.deleteTransition', 'Delete Transition'), 'del', '⌫')];
    } else { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the state or transition (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null;
  function editLabel(target: any) {
    if (!TD.input) return false;
    closeLabel();
    const s = target.s != null ? sOf(target.s) : null, e = target.e != null ? E.M.edges[target.e] : null;
    if (!s && !e) return false;
    begin();
    const me: any = (Lb = { target });
    // MathLive has no line breaks: there the lines stay joined by \\
    const sep = TD.input.mode === 'mathlive' ? ' \\\\ ' : '\n', text = s ? mathOf(s.text || '', sep) : mathOf(e.t || '', sep);
    me.pop = TD.input.popup(stage, {
      text, math: true, bare: true,
      at: () => labelPos(target),
      onInput: (t: any) => {
        if (s) s.text = wrapMath(t);
        else setLabel(e, t);
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target: any) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.s != null) { const n = L.nodes.get(target.s); if (n) { [X, Y] = S(n.x, n.y); Y += Math.max(6, nodeR(n)) + 10; } }
    else {
      const ed = L.edges.find((x: any) => x.i === target.e);
      if (ed) { const q = ed.label || F.along(ed.P, ed.P.len / 2); [X, Y] = S(q.x, q.y); Y += 14; }
    }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  // colour options get a picker each; the rest stay in Options
  const COLK: Record<string, any> = { sfill: 'fill', sdraw: 'draw', stext: 'text', ecol: 'color', etext: 'text' };
  const isCol = (keys: any) => (it: any) => { const { k, v } = kv(it); return v != null && keys.includes(k); };
  const isSCol = isCol(['fill', 'draw', 'text']), isECol = isCol(['color', 'text']);
  const getOpt = (o: any, k: any) => { const it = o.find((x: any) => kv(x).k === k && kv(x).v != null); return it ? F.unbrace(kv(it).v) : ''; };
  function setOpt(o: any, k: any, v: any) {
    const i = o.findIndex((x: any) => kv(x).k === k && kv(x).v != null), it = v ? `${k}=${TD.texColor.wrap(v)}` : null, r = o.slice();
    if (i < 0) { if (it) r.push(it); } else if (it) r[i] = it; else r.splice(i, 1);
    return r;
  }
  function renderProps() {
    if (!E) return;
    const M = E.M, s = selS(), e = selE();
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const colorRow = (label: any, key: any, value: any, options: Record<string, any> = {}) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, title: label, defaultLabel: options.dflt, defaultSwatch: options.dfltSw })), controlClass: 'ctl tc' });
    if (s) {
      const L = lay(), n = L.nodes.get(s.name), f = flags(s), x = s.x != null ? s.x : n ? n.x / PX : null, y = s.y != null ? s.y : n ? -n.y / PX : null;
      const rest = s.o.filter((it: any) => !isFlag(it) && !isSCol(it)), outs = M.edges.filter((ed: any) => ed.a === s.name).length;
      const kind = f.initial && f.accepting ? uiText('editor.fsm.initialAcceptingState', 'Initial, accepting state') : f.initial ? uiText('editor.fsm.initialState', 'Initial state') : f.accepting ? uiText('editor.fsm.acceptingState', 'Accepting state') : f.state ? uiText('editor.fsm.state', 'State') : uiText('editor.fsm.node', 'Node'), side = /\s/.test(f.side) ? '' : f.side;
      const sides = [['left', uiText('editor.fsm.left', 'Left')], ['above', uiText('editor.fsm.above', 'Above')], ['below', uiText('editor.fsm.below', 'Below')], ['right', uiText('editor.fsm.right', 'Right')]];
      const no = uiText('editor.fsm.no', 'No'), yes = uiText('editor.fsm.yes', 'Yes'), none = uiText('editor.commonB.nonePlaceholder', 'none');
      show(kind, outs === 1 ? uiText('editor.fsm.oneOut', '1 transition out') : uiText('editor.fsm.nOut', '{n} transitions out', { n: outs }), [field(uiText('editor.fsm.name', 'Name'), 'name', s.name, { class: 'mono' }), field(uiText('editor.fsm.label', 'Label'), 'text', mathOf(s.text || ''), { 'data-tx': 'math', placeholder: none }),
        segments(uiText('editor.fsm.initial', 'Initial'), 'init', f.initial ? 1 : 0, [[0, no], [1, yes, uiText('editor.fsm.initialTitle', 'initial: an arrow comes in from outside')]]), segments(uiText('editor.fsm.arrowFrom', 'Arrow from'), 'iside', side, sides, !f.initial),
        field(uiText('editor.fsm.startText', 'Start text'), 'itext', f.initial ? f.text : '', { 'data-tx': 'text', ...(!f.initial ? { disabled: true } : {}), placeholder: none }), segments(uiText('editor.fsm.accepting', 'Accepting'), 'acc', f.accepting ? 1 : 0, [[0, no], [1, yes, uiText('editor.fsm.acceptingTitle', 'accepting: drawn with a double line')]]),
        numField('x', 'x', x == null ? '' : F.num(x), 'cm', { step: '0.25' }), numField('y', 'y', y == null ? '' : F.num(y), 'cm', { step: '0.25' }),
        ...(s.x == null ? [note(s.rel ? uiText('editor.fsm.placedRel', 'Placed {dir} of {of}. Moving it writes its position.', { dir: s.rel.dir, of: s.rel.of }) : uiText('editor.fsm.noPosition', 'No position in the code: moving it writes one.'))] : []),
        colorRow(uiText('editor.fsm.fill', 'Fill'), 'sfill', getOpt(s.o, 'fill'), { dflt: uiText('editor.fsm.colourNone', 'None') }), colorRow(uiText('editor.fsm.line', 'Line'), 'sdraw', getOpt(s.o, 'draw'), { dfltSw: TD.css('#000000') }), colorRow(uiText('editor.fsm.text', 'Text'), 'stext', getOpt(s.o, 'text'), { dfltSw: TD.css('#000000') }),
        field(uiText('editor.commonB.options', 'Options'), 'sopts', rest.join(', '), { class: 'mono', placeholder: uiText('editor.fsm.egThick', 'e.g. thick') }), actionRow('fe', 'sdel', uiText('editor.fsm.deleteState', 'Delete State'))]); return;
    }
    if (e) {
      const b = bendOf(e), side = sideOf(e), lp = e.loop ? loopOf(e) : '', bending = b.kind === 'left' || b.kind === 'right';
      const rest = e.o.filter((it: any) => !isBend(it) && !isLoop(it) && !isSwap(it) && !isECol(it));
      const left = uiText('editor.fsm.left', 'Left'), right = uiText('editor.fsm.right', 'Right');
      show(e.loop ? uiText('editor.fsm.loop', 'Loop') : uiText('editor.fsm.transition', 'Transition'), e.loop ? uiText('editor.fsm.atState', 'at {name}', { name: e.a }) : `${e.a} → ${e.b}`, [field(uiText('editor.fsm.label', 'Label'), 'label', mathOf(e.t || ''), { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }),
        segments(uiText('editor.fsm.labelSide', 'Label side'), 'side', side, [[1, left, uiText('editor.fsm.leftOfArrow', 'Left of the arrow’s direction')], [-1, right, uiText('editor.fsm.swapRight', 'swap: right of the arrow’s direction')]], !e.t),
        e.loop ? segments(uiText('editor.fsm.loop', 'Loop'), 'loop', lp, [['above', uiText('editor.fsm.above', 'Above')], ['below', uiText('editor.fsm.below', 'Below')], ['left', left], ['right', right]]) : segments(uiText('editor.fsm.bend', 'Bend'), 'bend', b.kind === 'custom' ? '' : b.kind, [['', uiText('editor.fsm.straight', 'Straight')], ['left', left], ['right', right]]),
        ...(e.loop ? [] : [numField(uiText('editor.fsm.angle', 'Angle'), 'angle', bending ? F.num(b.a) : '', '°', { min: '5', max: '90', step: '5', ...(!bending ? { disabled: true } : {}) })]),
        colorRow(uiText('editor.fsm.colour', 'Colour'), 'ecol', getOpt(e.o, 'color'), { dfltSw: TD.css('#000000') }), colorRow(uiText('editor.fsm.labelColour', 'Label colour'), 'etext', getOpt(e.o, 'text'), { dfltSw: TD.css('#000000'), dflt: uiText('editor.fsm.same', 'Same') }), field(uiText('editor.commonB.options', 'Options'), 'eopts', rest.join(', '), { class: 'mono', placeholder: uiText('editor.fsm.egDashed', 'e.g. dashed') }),
        { kind: 'actions' as const, class: 'row', buttons: [...(e.loop ? [] : [{ text: uiText('editor.fsm.reverse', 'Reverse Direction'), attrs: { 'data-fe': 'rev' } }]), { text: e.loop ? uiText('editor.fsm.deleteLoop', 'Delete Loop') : uiText('editor.fsm.deleteTransition', 'Delete Transition'), attrs: { class: 'danger', 'data-fe': 'edel' } }] },
      ]); return;
    }
    renderView(props, FormPanel, { sections: [
      { ...section(captions["ui.state.machine"], [note(uiText('editor.fsm.help1', 'Place states from the left on the grid; drag them to move ('), { kbd: '⌥' }, uiText('editor.fsm.help2', ' places freely), and their transitions follow. Select a state and drag its blue handle to another state for a transition, or back onto the same state for a loop. Double-click a state or transition to label it.'))], 'sec'), summary: uiText('editor.fsm.summary', '{states} states · {edges} transitions', { states: M.states.length, edges: M.edges.length }) },
      section(uiText('editor.fsm.autoLayout', 'Auto layout'), [{ kind: 'actions' as const, class: 'row fsm-auto', buttons: [{ text: uiText('editor.fsm.inLayers', 'In Layers'), attrs: { 'data-fe': 'layers', title: uiText('editor.fsm.inLayersTitle', 'Columns by distance from the initial state') } }, { text: uiText('editor.fsm.onCircle', 'On a Circle'), attrs: { 'data-fe': 'circle', title: uiText('editor.fsm.onCircleTitle', 'On a circle, in the order they are reached') } }] }, note(uiText('editor.fsm.autoNote', 'Places every state and bends transitions that would cross a state or their reverse. One undo step.'))], 'sec'),
    ] });
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { if (e.target.dataset.f === 'name') { const s = selS(); if (s && s.name !== e.target.value.trim()) e.target.value = s.name; } commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const s = selS(), e = selE();
    if (s) {
      if (f === 'name') { if (!rename(s, t.value)) return; }
      else if (f === 'text') s.text = wrapMath(t.value);
      else if (f === 'itext') setInitText(s, t.value);
      else if (f === 'x' || f === 'y') { const n = parseFloat(t.value); if (!isFinite(n)) return; pin([s.name, ...dependents(s.name)]); s[f] = n; s.rel = null; }
      else if (f === 'sopts') { s.o = s.o.filter((it: any) => isFlag(it) || isSCol(it)).concat(F.opts(t.value)); }
      else if (COLK[f]) s.o = setOpt(s.o, COLK[f], t.value);
    } else if (e) {
      if (f === 'label') setLabel(e, t.value);
      else if (f === 'angle') { const n = parseFloat(t.value); if (!isFinite(n)) return; setBend(e, bendOf(e).kind, n); }
      else if (f === 'eopts') { const keep = e.o.filter((it: any) => isBend(it) || isLoop(it) || isSwap(it) || isECol(it)); e.o = keep.concat(F.opts(t.value)); }
      else if (COLK[f]) e.o = setOpt(e.o, COLK[f], t.value);
    } else return;
    E.M.dirty = true; draw();
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
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
    const b = (e.target! as Element).closest('[data-fe]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.fe, b);
  });
  function act(a: any, b?: any) {
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
    else if (a === 'copy') copyCode(b, codeTa.value);
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
      else if (/^l[ablr]$/.test(a)) edit(() => setLoop(e, ({ la: 'above', lb: 'below', ll: 'left', lr: 'right' } as Record<string, any>)[a]));
    }
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M;
    count.textContent = `${M.states.length === 1 ? uiText('editor.fsm.oneState', '1 state') : uiText('editor.fsm.nStates', '{n} states', { n: M.states.length })} · ${M.edges.length === 1 ? uiText('editor.fsm.oneTransition', '1 transition') : uiText('editor.fsm.nTransitions', '{n} transitions', { n: M.edges.length })}`;
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, F.layout({ src: c }).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps(); updateTools();
    showCodeNotes(codeMsg, F.layout({ src: codeTa.value }).warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !dock.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      escape: () => {
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.sel) { E.sel = null; draw(); renderProps(); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
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
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the machine back to the page (one undo step there) and keep editing
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.fsm.discard', 'Discard changes to this state machine?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, kind: 'straight' as const, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.typed = String(block.src || ''); E.start = snapCode();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, panel and drawing's captions follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.fsmEditor = { open, dockable: true, close: () => dock.detach() };
})();
