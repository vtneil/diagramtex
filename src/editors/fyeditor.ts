import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, actionRow } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import FyeditorFrame from '../ui/editors/FyeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { t as uiText, message, caption, onLocale } from '../i18n';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
import { planeGrid, uprightPlane } from '../ui/plane-grid';
// Feynman editor: the overlay that opens on a Feynman block. A palette of vertices and propagators; the
// diagram drawn by the canvas renderer on a centimetre grid, where vertices are placed and moved and
// propagators are dragged from vertex to vertex; the selected vertex's or line's properties; and beside
// them the tikz-feynman code, live both ways. Untouched code is handed back as written.
// TD.feynEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const F = TD.feyn;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const PX = TD.PX_PER_CM, GRID = 0.25;

  // ---------------------------------------------------------------- palette
  // names in the interface language, looked up when shown
  const TYPE_NAMES: Record<string, any> = {
    plain: message('editor.fy.plain', 'Plain'), fermion: message('editor.fy.fermion', 'Fermion'), 'anti fermion': message('editor.fy.antifermion', 'Antifermion'), photon: message('editor.fy.photon', 'Photon'), boson: message('editor.fy.boson', 'Boson'), 'charged boson': message('editor.fy.chargedBoson', 'Charged boson'),
    'anti charged boson': message('editor.fy.antiChargedBoson', 'Anti charged boson'), gluon: message('editor.fy.gluon', 'Gluon'), scalar: message('editor.fy.scalar', 'Scalar'), 'charged scalar': message('editor.fy.chargedScalar', 'Charged scalar'),
    'anti charged scalar': message('editor.fy.antiChargedScalar', 'Anti charged scalar'), ghost: message('editor.fy.ghost', 'Ghost'), majorana: message('editor.fy.majorana', 'Majorana'), 'anti majorana': message('editor.fy.antiMajorana', 'Anti Majorana'),
  };
  const STYLE_NAMES: Record<string, any> = { '': message('editor.fy.vertex', 'Vertex'), dot: message('editor.fy.dot', 'Dot'), 'empty dot': message('editor.fy.emptyDot', 'Empty dot'), 'square dot': message('editor.fy.squareDot', 'Square dot'), 'crossed dot': message('editor.fy.crossedDot', 'Crossed dot'), blob: message('editor.fy.blob', 'Blob') };
  const typeName = (k: any) => (TYPE_NAMES[k] ? caption(TYPE_NAMES[k]) : undefined);
  const styleName = (k: any) => (STYLE_NAMES[k] ? caption(STYLE_NAMES[k]) : undefined);
  const fey = (body: any) => `\\begin{feynman}${body}\\end{feynman}`;
  const vMini = (st: any) => fey(`\\vertex${st ? ` [${st}]` : ''} (a) at (0,0)${st ? ' {}' : ''};\\vertex (l) at (-.7,.45);\\vertex (r) at (.7,.45);\\vertex (d) at (0,-.7);\\diagram*{(l)--(a)--(r),(a)--(d)};`);
  const eMini = (t: any) => fey(`\\vertex (a) at (0,0);\\vertex (b) at (1.6,0);\\diagram*{(a) -- [${t}] (b)};`);
  const PAL: any[] = [
    [message('editor.fy.cat.vertices', 'Vertices'), [
      ['v:', STYLE_NAMES[''], vMini(''), 'V'], ['v:dot', STYLE_NAMES.dot, vMini('dot'), 'D'], ['v:empty dot', STYLE_NAMES['empty dot'], vMini('empty dot')],
      ['v:square dot', STYLE_NAMES['square dot'], vMini('square dot')], ['v:crossed dot', STYLE_NAMES['crossed dot'], vMini('crossed dot')], ['v:blob', STYLE_NAMES.blob, vMini('blob')],
      ['v:particle', message('editor.fy.particle', 'Particle'), fey('\\vertex (a) at (0,0) {\\(e^-\\)};\\vertex (b) at (1.2,0);\\diagram*{(a) -- [fermion] (b)};'), 'T'],
    ]],
    [message('editor.fy.cat.propagators', 'Propagators'), [
      ['e:fermion', TYPE_NAMES.fermion, eMini('fermion'), 'F'], ['e:anti fermion', TYPE_NAMES['anti fermion'], eMini('anti fermion')], ['e:photon', TYPE_NAMES.photon, eMini('photon'), 'P'],
      ['e:gluon', TYPE_NAMES.gluon, eMini('gluon'), 'G'], ['e:scalar', TYPE_NAMES.scalar, eMini('scalar'), 'S'], ['e:charged scalar', TYPE_NAMES['charged scalar'], eMini('charged scalar')],
      ['e:ghost', TYPE_NAMES.ghost, eMini('ghost')], ['e:majorana', TYPE_NAMES.majorana, eMini('majorana'), 'M'], ['e:boson', TYPE_NAMES.boson, eMini('boson'), 'B'],
      ['e:charged boson', TYPE_NAMES['charged boson'], eMini('charged boson')], ['e:plain', TYPE_NAMES.plain, eMini('plain'), 'L'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.feyn.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  // (with the picture's macros and options round the block, wrap: as it is drawn on the page)
  function load(src: any) { const M = F.parse(src, E?.macros); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? F.write(M, E?.wrap) : M.raw);
  const kv = F.kv;
  const vOf = (name: any) => E.M.vertices.find((v: any) => v.name === name) || null;
  // maths in a label: \(x\) or $x$ → x; written back as \(x\)
  const mathOf = (t: any) => { t = F.unbrace(t || ''); const m = /^\\\(([\s\S]*)\\\)$/.exec(t) || /^\$([\s\S]*)\$$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t: any) => { const v = mathOf(t).trim(); return v ? `\\(${v}\\)` : ''; };
  const val = (t: any) => (/[,=\]]/.test(t) ? `{${t}}` : t);
  // edge options by kind
  const isType = (it: any) => F.EDGE_TYPES.includes(it.trim());
  const isLabel = (it: any) => /^edge label'?$/.test(kv(it).k);
  const isMom = (it: any) => /^(reversed momentum|rmomentum|momentum)'?$/.test(kv(it).k);
  const isBend = (it: any) => /^(bend left|bend right|half left|half right|quarter left|quarter right|out|in|looseness)$/.test(kv(it).k);
  const isIns = (it: any) => kv(it).k === 'insertion';
  const typeOf = (e: any) => (e.o.find(isType) || 'plain').trim();
  function setType(e: any, t: any) { e.o = e.o.filter((x: any) => !isType(x)); if (t !== 'plain' || !e.o.length) e.o.unshift(t); }
  function labelOf(e: any) { const it = e.o.find(isLabel); if (!it) return { t: '', side: 1 }; const { k, v } = kv(it); return { t: mathOf(v), side: k.endsWith("'") ? -1 : 1 }; }
  function setLabel(e: any, t: any, side: any) {
    const i = e.o.findIndex(isLabel), it = t ? `edge label${side < 0 ? "'" : ''}=${val(wrapMath(t))}` : null;
    if (i >= 0) { if (it) e.o[i] = it; else e.o.splice(i, 1); } else if (it) e.o.push(it);
  }
  function momOf(e: any) {
    const it = e.o.find(isMom);
    if (!it) return null;
    const { k, v } = kv(it);
    let t = F.unbrace(v || ''), pre = '';
    if (t[0] === '[') { const j = t.indexOf(']'); pre = t.slice(0, j + 1); t = t.slice(j + 1).trim(); }
    return { t: mathOf(t), side: k.endsWith("'") ? -1 : 1, rev: !/^momentum/.test(k), pre };
  }
  function setMom(e: any, m: any) {
    const i = e.o.findIndex(isMom);
    let it = null;
    if (m) { const body = m.pre ? `{${m.pre}${wrapMath(m.t)}}` : val(wrapMath(m.t)); it = `${m.rev ? 'reversed momentum' : 'momentum'}${m.side < 0 ? "'" : ''}=${body}`; }
    if (i >= 0) { if (it) e.o[i] = it; else e.o.splice(i, 1); } else if (it) e.o.push(it);
  }
  function bendOf(e: any) {
    const R = F.readEdgeOpts(e.o, null);
    if (e.o.some((x: any) => /^half (left|right)$/.test(x.trim()))) return { kind: R.bend > 0 ? 'half left' : 'half right', a: 90 };
    if (R.bend == null) return { kind: R.out != null || R.in != null ? 'custom' : '', a: 30 };
    return { kind: R.bend > 0 ? 'left' : 'right', a: Math.abs(R.bend) };
  }
  function setBend(e: any, kind: any, a = 30) {
    e.o = e.o.filter((x: any) => !isBend(x));
    if (kind === 'left' || kind === 'right') e.o.push(`bend ${kind}${a !== 30 ? `=${F.num(a)}` : ''}`);
    else if (kind) e.o.push(kind);
  }
  const vStyle = (v: any) => F.styleOf(v);
  function setVStyle(v: any, st: any) { v.o = v.o.filter((x: any) => !F.VERTEX_STYLES.includes(kv(x).k)); if (st) { v.o.unshift(st); v.bare = false; } }
  function newName(base = 'v') { let n = 1; while (vOf(base + n)) n++; return base + n; }
  // every vertex gets its drawn place written down (before a vertex it depends on moves or goes)
  function pin(names: any) {
    const L = lay();
    for (const v of E.M.vertices) {
      if (v.x != null || (names && !names.includes(v.name))) continue;
      const n = L.nodes.get(v.name);
      if (n) { const [x, y] = F.envXY(L, n); v.x = snap(x, true); v.y = snap(y, true); v.rel = null; v.at = null; }
    }
  }
  const dependents = (name: any) => E.M.vertices.filter((v: any) => v.x == null && v.rel && v.rel.of === name).map((v: any) => v.name);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'fyModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, FyeditorFrame);
  document.body.appendChild(root);
  const svg = $('.fy-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'fy-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { v: name } | { e: index } | null, arm, prop, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
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
    if (s && s.v != null && !vOf(s.v)) E.sel = null;
    if (s && s.e != null && !E.M.edges[s.e]) E.sel = null;
  }
  const selV = () => (E.sel && E.sel.v != null ? vOf(E.sel.v) : null);
  const selE = () => (E.sel && E.sel.e != null ? E.M.edges[E.sel.e] || null : null);
  const lay = () => F.layout({ src: snapCode(), wrap: E.wrap, macros: E.macros });
  const snap = (n: any, on: any) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- editing
  // a place on the page (cm) in the environment's coordinates, as `at (x,y)` writes it (under its scale and shift)
  const envPt = (x: number, y: number) => { const X = lay().X; return X.k === 1 && !X.ox && !X.oy ? [x, y] : [snap((x - X.ox) / X.k, false), snap((y - X.oy) / X.k, false)]; };
  function addVertex(key: any, px: any, py: any) {
    const st = key.slice(2), [x, y] = envPt(px, py);
    let name;
    edit(() => {
      name = newName(st === 'particle' ? 'p' : 'v');
      const v = { name, o: ([] as any[]), x, y, rel: null, text: (null as any), decl: true };
      if (st === 'particle') v.text = '\\(e^-\\)';
      else if (st) v.o.push(st);
      E.M.vertices.push(v);
    });
    E.sel = { v: name }; draw(); renderProps();
    if (st === 'particle') editLabel({ v: name });
    return name;
  }
  function addEdge(a: any, b: any) {
    if (a === b) return;
    edit(() => {
      const ch = Math.max(-1, ...E.M.edges.map((e: any) => e.ch)) + 1;
      E.M.edges.push({ a, b, o: E.prop === 'plain' ? [] : [E.prop], ch });
    });
    E.sel = { e: E.M.edges.length - 1 }; draw(); renderProps();
  }
  function deleteVertex(name: any) {
    edit(() => {
      pin(dependents(name));
      E.M.vertices = E.M.vertices.filter((v: any) => v.name !== name);
      E.M.edges = E.M.edges.filter((e: any) => e.a !== name && e.b !== name);
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteEdge(i: any) { edit(() => E.M.edges.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { const v = selV(), e = selE(); if (v) deleteVertex(v.name); else if (e) deleteEdge(E.sel.e); }
  function reverseEdge(e: any) {
    const t = e.a; e.a = e.b; e.b = t;
    // the picture stays but for the line's own arrow: labels, bends and momentum keep their side and sense
    const lb = labelOf(e); if (lb.t) setLabel(e, lb.t, -lb.side);
    const m = momOf(e); if (m) setMom(e, { ...m, side: -m.side, rev: !m.rev });
    const b = bendOf(e);
    if (b.kind === 'left' || b.kind === 'right') setBend(e, b.kind === 'left' ? 'right' : 'left', b.a);
    else if (/^half/.test(b.kind)) setBend(e, b.kind === 'half left' ? 'half right' : 'half left');
    e.ch = Math.max(-1, ...E.M.edges.map((x: any) => x.ch)) + 1;
  }
  function rename(v: any, to: any) {
    to = to.trim();
    if (!to || to === v.name || !/^[A-Za-z0-9_.']+$/.test(to) || vOf(to)) return false;
    for (const e of E.M.edges) { if (e.a === v.name) e.a = to; if (e.b === v.name) e.b = to; }
    for (const w of E.M.vertices) if (w.rel && w.rel.of === v.name) w.rel.of = to;
    v.name = to; E.sel = { v: to };
    return true;
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      // the shown name, the English one and the category's both find it
      items: items.map(([k, label, , key]: any) => ({
        id: k, label: caption(label), key, alt: label.fallback, keywords: `${k.slice(2)} ${caption(cat)} ${cat.fallback}`,
        svg: fitMini(TD.feynMini(ITEM[k].mini, 1e3), 64, 40, 1.6), on: !!E && k === `e:${E.prop}`,
      })),
    })), { armed: E?.arm });
  }
  // click: a vertex kind restyles the selected vertex or is armed for placing; a propagator kind
  // restyles the selected line and is the kind new lines get. Drag a vertex kind onto the canvas.
  paletteDrag(list, {
    keyboard: true,
    drags: (k) => k[0] === 'v',
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); addVertex(d.k, x, y); }
      E.hover = null; draw();
    },
  });
  function pick(k: any) {
    if (k[0] === 'e') {
      if (E.arm) { E.arm = null; draw(); }
      E.prop = k.slice(2);
      const e = selE();
      if (e) edit(() => setType(e, E.prop));
      buildPalette();
      setTip(e ? '' : uiText('editor.fy.propTip', '{name}: point at a vertex, then drag its blue handle to another vertex', { name: caption(ITEM[k].name) }));
      return;
    }
    const v = selV(), st = k.slice(2);
    if (v && !E.arm && st !== 'particle') { edit(() => setVStyle(v, st)); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? uiText('editor.fy.armTip', '{name}: click the grid to place it. Esc when done.', { name: caption(ITEM[k].name) }) : '');
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
  function vertexAt(e: any, px = 8) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const [name, n] of L.nodes) {
      const [X, Y] = S(n.x, n.y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, nodeR(n) + 3) && d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function edgeAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e);
    let best = null, bd = px;
    for (const ed of L.edges) {
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
    if (!E) return;
    const L = lay();
    E.view = fitView(rect(), L.empty ? { x: 0, y: -2 * PX, w: 4 * PX, h: 2 * PX } : L.bb, { scale: PX, margin: 0.5, min: 20, max: 220 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // the grid: minor every 0.25cm (left out when too dense), major every 1cm, and the origin
    let out = planeGrid(uprightPlane(v.ox, v.oy, k), W, H);
    const L = lay(), kk = k / PX;
    // the selected line, as a halo under the drawing
    const se = selE(), sl = se && L.edges.find((x: any) => x.i === E.sel.e);
    if (sl) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})"><path class="ze-wsel" d="${sl.d}" stroke-width="${r2(10 / kk)}"/></g>`;
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${F.draw({ type: 'feynman', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(uiText('editor.fy.emptyStart', 'Place a vertex from the left to start'))}</text>`;
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
        const [x0, y0] = S(n.x, n.y), t = E.hover && E.hover.v && E.hover.v !== d.from ? S(L.nodes.get(E.hover.v).x, L.nodes.get(E.hover.v).y) : m(...((E.hover && E.hover.at ? E.hover.at : d.at) as [any, any]));
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
      out += `<g class="ze-knob" data-v="${esc(kv_)}"><title>${esc(uiText('editor.fy.knobTitle', 'Drag to another vertex to draw a {type}', { type: (typeName(E.prop) || E.prop).toLowerCase() }))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // placing: where it lands
    if ((E.arm || E.ghost) && E.hover && E.hover.at) { const [X, Y] = m(...(E.hover.at as [any, any])); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
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
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); addVertex(E.arm, x, y); return; }
    const vn = vertexAt(e), ei = vn == null ? edgeAt(e) : null;
    if (vn != null) {
      if (dbl && E.sel && E.sel.v === vn) { editLabel({ v: vn }); return; }
      E.sel = { v: vn };
      const v = vOf(vn), L = lay(), n = L.nodes.get(vn);
      E.drag = { mode: 'move', v: vn, sx, sy, moved: false, xk: L.X.k, x0: v.x != null ? v.x : F.envXY(L, n)[0], y0: v.y != null ? v.y : F.envXY(L, n)[1] };
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
      setTip(vn && vn !== d.from ? uiText('editor.fy.edgeTo', '{type} to {vertex}', { type: typeName(E.prop) || E.prop, vertex: vn }) : uiText('editor.fy.dropEdge', 'Drop on a vertex, or on the grid for a new one'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); pin(dependents(d.v)); d.moved = true; }
      const v = vOf(d.v), k = E.view.k * d.xk; // (screen px per cm in the environment's coordinates)
      v.x = snap(d.x0 + (sx - d.sx) / k, !e.altKey); v.y = snap(d.y0 - (sy - d.sy) / k, !e.altKey); v.rel = null;
      E.M.dirty = true;
      setTip(e.altKey ? uiText('editor.fy.moveTip', '{name} at ({x}, {y})', { name: d.v, x: F.num(v.x), y: F.num(v.y) }) : uiText('editor.fy.moveTipSnap', '{name} at ({x}, {y}) · ⌥ to place freely', { name: d.v, x: F.num(v.x), y: F.num(v.y) }));
      draw(); return;
    }
  });
  const up = (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'edge') {
      // a click on the handle, without dragging, does nothing
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) { setTip(''); E.hover = null; draw(); return; }
      setTip('');
      const vn = vertexAt(e, 14);
      if (vn && vn !== d.from) addEdge(d.from, vn);
      else if (!vn && overStage(e)) {
        const [x, y] = envPt(...(toCm(e, !e.altKey) as [number, number]));
        begin();
        const name = newName();
        E.M.vertices.push({ name, o: [], x, y, rel: null, text: null, decl: true });
        E.M.edges.push({ a: d.from, b: name, o: E.prop === 'plain' ? [] : [E.prop], ch: Math.max(-1, ...E.M.edges.map((x: any) => x.ch)) + 1 });
        E.M.dirty = true; commit();
        E.sel = { e: E.M.edges.length - 1 }; renderProps();
      }
      E.hover = null; draw(); return;
    }
    if (d.mode === 'move' && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    draw();
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', (e: any) => { if (E?.drag?.mode === 'edge') { E.drag = null; E.hover = null; setTip(''); draw(); } else up(e); }); // a cancelled drag ends as a release, with no new edge where it was let go
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the vertex's or line's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', del: 'delete', rev: 'reverse', left: 'bendLeft', right: 'bendRight', straight: 'straight' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /^(vdel|edel)$/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const vn = vertexAt(e), ei = vn == null ? edgeAt(e) : null;
    if (vn != null) { E.sel = { v: vn }; menuRows = [mItem('label', uiText('editor.fy.editLabel', 'Edit Label'), 'label', '↩'), '-', mItem('vdel', uiText('editor.fy.deleteVertex', 'Delete Vertex'), 'del', '⌫')]; }
    else if (ei != null) {
      E.sel = { e: ei };
      menuRows = [mItem('label', uiText('editor.fy.editLabel', 'Edit Label'), 'label', '↩'), mItem('rev', uiText('editor.fy.reverse', 'Reverse Direction'), 'rev'), '-', mItem('bleft', uiText('editor.fy.bendLeft', 'Bend Left'), 'left'), mItem('bright', uiText('editor.fy.bendRight', 'Bend Right'), 'right'), mItem('bnone', uiText('editor.fy.straight', 'Straight'), 'straight'), '-', mItem('edel', uiText('editor.fy.deleteLine', 'Delete Line'), 'del', '⌫')];
    } else { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the vertex or line (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null;
  function editLabel(target: any) {
    if (!TD.input) return false;
    closeLabel();
    const v = target.v != null ? vOf(target.v) : null, e = target.e != null ? E.M.edges[target.e] : null;
    if (!v && !e) return false;
    begin();
    const me: any = (Lb = { target });
    const text = v ? mathOf(v.text || '') : labelOf(e).t;
    me.pop = TD.input.popup(stage, {
      text, math: true, bare: true,
      at: () => labelPos(target),
      onInput: (t: any) => {
        if (v) v.text = wrapMath(t) || null;
        else { const lb = labelOf(e); setLabel(e, t, lb.side); }
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target: any) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.v != null) { const n = L.nodes.get(target.v); if (n) { [X, Y] = S(n.x, n.y); Y += Math.max(6, nodeR(n)) + 10; } }
    else { const ed = L.edges.find((x: any) => x.i === target.e); if (ed) { const q = F.along(ed.P, ed.P.len / 2); [X, Y] = S(q.x, q.y); Y += 14; } }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  function renderProps() {
    if (!E) return;
    const M = E.M, vertex = selV(), edge = selE();
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const selectField = (label: any, key: any, options: any, value: any) => row(label, { kind: 'select' as const, attrs: { 'data-f': key }, options, value });
    if (vertex) {
      const v = vertex, L = lay(), n = L.nodes.get(v.name), st = vStyle(v);
      const x = v.x != null ? v.x : n ? n.x / PX : null, y = v.y != null ? v.y : n ? -n.y / PX : null;
      const rest = v.o.filter((it: any) => !F.VERTEX_STYLES.includes(kv(it).k));
      const links = M.edges.filter((ed: any) => ed.a === v.name || ed.b === v.name).length;
      show(styleName(st) || caption(STYLE_NAMES['']), links === 1 ? uiText('editor.fy.oneLine', '1 line') : uiText('editor.fy.nLines', '{n} lines', { n: links }), [
        field(uiText('editor.fy.name', 'Name'), 'name', v.name, { class: 'mono' }), selectField(uiText('editor.fy.shape', 'Shape'), 'style', Object.entries<any>(STYLE_NAMES).map(([k, m]) => [k, caption(m)]), st),
        field(uiText('editor.fy.label', 'Label'), 'text', mathOf(v.text || ''), { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }),
        numField('x', 'x', x == null ? '' : F.num(x), 'cm', { step: '0.25' }), numField('y', 'y', y == null ? '' : F.num(y), 'cm', { step: '0.25' }),
        ...(v.x == null ? [note(v.rel ? uiText('editor.fy.placedRel', 'Placed {dir} of {of}. Moving it writes its position.', { dir: v.rel.dir, of: v.rel.of }) : uiText('editor.fy.noPosition', 'No position in the code: moving it writes one.'))] : []),
        field(uiText('editor.commonB.options', 'Options'), 'vopts', rest.join(', '), { class: 'mono', placeholder: uiText('editor.fy.vOptsPlaceholder', 'e.g. {example}', { example: 'label=above:\\(x\\)' }) }), actionRow('fe', 'vdel', uiText('editor.fy.deleteVertex', 'Delete Vertex')),
      ]); return;
    }
    if (edge) {
      const e = edge, t = typeOf(e), lb = labelOf(e), mo = momOf(e), b = bendOf(e), ins = e.o.some(isIns);
      const rest = e.o.filter((it: any) => !isType(it) && !isLabel(it) && !isMom(it) && !isBend(it) && !isIns(it));
      const bending = b.kind === 'left' || b.kind === 'right';
      const left = uiText('editor.fy.left', 'Left'), right = uiText('editor.fy.right', 'Right');
      show(typeName(t) || t, `${e.a} → ${e.b}`, [selectField(uiText('editor.fy.type', 'Type'), 'type', F.EDGE_TYPES.map((k: any) => [k, typeName(k)]), t),
        field(uiText('editor.fy.label', 'Label'), 'label', lb.t, { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }), segments(uiText('editor.fy.labelSide', 'Label side'), 'lside', lb.side, [[1, left], [-1, right]], !lb.t),
        field(uiText('editor.fy.momentum', 'Momentum'), 'mom', mo ? mo.t : '', { 'data-tx': 'math', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }), segments(uiText('editor.fy.arrowSide', 'Arrow side'), 'mside', mo ? mo.side : 1, [[1, left], [-1, right]], !mo),
        segments(uiText('editor.fy.points', 'Points'), 'mrev', mo && mo.rev ? 1 : 0, [[0, uiText('editor.fy.along', 'Along'), uiText('editor.fy.alongTitle', 'In the line’s direction')], [1, uiText('editor.fy.against', 'Against'), 'reversed momentum']], !mo),
        segments(uiText('editor.fy.bend', 'Bend'), 'bend', b.kind === 'custom' ? '' : b.kind, [['', uiText('editor.fy.straight', 'Straight')], ['left', left], ['right', right], ['half left', uiText('editor.fy.halfL', 'Half L'), uiText('editor.fy.halfLeftTitle', '{option}: a semicircle', { option: 'half left' })], ['half right', uiText('editor.fy.halfR', 'Half R'), uiText('editor.fy.halfRightTitle', '{option}: a semicircle', { option: 'half right' })]]),
        numField(uiText('editor.fy.angle', 'Angle'), 'angle', bending ? F.num(b.a) : '', '°', { min: '5', max: '90', step: '5', ...(!bending ? { disabled: true } : {}) }),
        segments(uiText('editor.fy.insertion', 'Insertion'), 'ins', ins ? 1 : 0, [[0, uiText('editor.fy.none', 'None')], [1, uiText('editor.fy.cross', 'Cross'), uiText('editor.fy.crossTitle', '{option}: a × at the middle', { option: 'insertion' })]]), field(uiText('editor.commonB.options', 'Options'), 'eopts', rest.join(', '), { class: 'mono' }),
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.fy.reverse', 'Reverse Direction'), attrs: { 'data-fe': 'rev' } }, { text: uiText('editor.fy.deleteLine', 'Delete Line'), attrs: { class: 'danger', 'data-fe': 'edel' } }] },
      ]); return;
    }
    show(uiText('editor.fy.diagram', 'Diagram'), uiText('editor.fy.diagramSummary', '{v} vertices · {e} lines', { v: M.vertices.length, e: M.edges.length }), [note(uiText('editor.fy.help1', 'Place vertices from the left on the grid; drag them to move ('), { kbd: '⌥' }, uiText('editor.fy.help2', ' places freely). Select a vertex and drag its blue handle to another vertex to draw a line of the kind chosen on the left. Double-click a vertex or line to label it.'))]);
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { if (e.target.dataset.f === 'name') { const v = selV(); if (v && v.name !== e.target.value.trim()) e.target.value = v.name; } commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
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
      else if (f === 'eopts') { const keep = e.o.filter((it: any) => isType(it) || isLabel(it) || isMom(it) || isBend(it) || isIns(it)); e.o = keep.concat(F.opts(t.value)); }
    } else return;
    E.M.dirty = true; draw();
    if (f === 'type' || f === 'style') { commit(); renderProps(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, val_ = bt.dataset.v, e = selE();
    if (!e) return;
    edit(() => {
      if (f === 'lside') { const lb = labelOf(e); setLabel(e, lb.t, +val_); }
      else if (f === 'mside') { const mo = momOf(e); if (mo) setMom(e, { ...mo, side: +val_ }); }
      else if (f === 'mrev') { const mo = momOf(e); if (mo) setMom(e, { ...mo, rev: val_ === '1' }); }
      else if (f === 'bend') setBend(e, val_, bendOf(e).a || 30);
      else if (f === 'ins') { e.o = e.o.filter((x: any) => !isIns(x)); if (val_ === '1') e.o.push('insertion=0.5'); }
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-fe="undo"]', root).disabled = !E.undo.length;
    $('[data-fe="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-fe]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.fe, b);
  });
  function act(a: any, b?: any) {
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
    else if (a === 'copy') copyCode(b, codeTa.value);
    else if (!e) return;
    else if (a === 'rev') edit(() => reverseEdge(e));
    else if (a === 'bleft') edit(() => setBend(e, 'left'));
    else if (a === 'bright') edit(() => setBend(e, 'right'));
    else if (a === 'bnone') edit(() => setBend(e, ''));
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M;
    count.textContent = `${M.vertices.length === 1 ? uiText('editor.fy.oneVertex', '1 vertex') : uiText('editor.fy.nVertices', '{n} vertices', { n: M.vertices.length })} · ${M.edges.length === 1 ? uiText('editor.fy.oneLine', '1 line') : uiText('editor.fy.nLines', '{n} lines', { n: M.edges.length })}`;
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
    clampSel(); draw(); renderProps();
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
    if (mod && (e.key === 'f' || e.key === 'k')) { e.preventDefault(); search.focus(); search.select(); return; } // ⌘F or ⌘K: the palette's search
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
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
  window.addEventListener('blur', () => { if (E) E.space = false; }); // Space let go in another window
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the diagram back to the page (one undo step there) and keep editing
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.commonB.discardDiagram', 'Discard changes to this diagram?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    E = { wrap: block.wrap || '', macros: block.macros };
    const M = load(block.src);
    E = { ...E, M, sel: null, arm: null, prop: 'fermion', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
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
  TD.feynEditor = { open, dockable: true, close: () => dock.detach() };
})();
