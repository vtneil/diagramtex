import { captions } from '../i18n/messages';
import { t as uiText, message, onLocale } from '../i18n';
import FormPanel from '../ui/FormPanel.svelte';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { row, switchRow, section, txPlaceholder } from '../ui/forms';
import type { FormRow, FormSection, Control } from '../ui/forms';
import { note } from '../ui/editor-fields';
import PhyeditorFrame from '../ui/editors/PhyeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { marquee, marqueeSvg, marqueeTakes, boxShape } from './marquee';
// Physics editor: the overlay that opens on a Physics block. A palette of the domain's objects, grouped;
// the figure solved and drawn on a centimetre grid, where objects are selected, moved and reshaped by their
// handles (lens focus, ray angle, slope angle, …); the selected object's settings, generated from its
// schema, with what was computed for it and any warnings; and the source beside them, live both ways.
// Lines are edited one option at a time, so anything the block does not understand stays as written.
// TD.physicsEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const P = TD.physics, G = P.G;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PX = TD.PX_PER_CM, GRID = 0.25;
  const CMD = isMac ? '⌘' : 'Ctrl+';

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'phyModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, PhyeditorFrame);
  document.body.appendChild(root);
  const svg = $('.phy-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'phy-list', layout: 'rows', onpick: (k) => (k[0] === 'c' ? pick(k.slice(2)) : k[0] === 't' ? armTool(k.slice(2)) : loadExample(k.slice(2))) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);
  const title = $('#phyTitle', root);

  // ---------------------------------------------------------------- state
  // { src, M (parsed src), sel (line index) | null, arm (command name), view: { k, ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snapshot = () => E.src;
  const { begin, commit, undo, redo } = TD.editorSession.history({ state: () => E, snapshot, restore: (src) => { setSrc(src); clampSel(); draw(); renderProps(); }, updateTools: () => updateTools(), changed: () => session.changed() });
  function setSrc(src: any) { E.src = src; E.M = P.parse(src); E.poly = null; E.multi = null; }
  // write the parsed lines back; only the lines edited through P.setOpt/P.setArg change
  function flush() { E.src = P.serialize(E.M); }
  const R = () => P.solve(E.src);
  const D = () => P.domains[E.M.domain] || null;
  const lineAt = (i: any) => (i != null ? E.M.lines[i] : null);
  const specOf = (L: any) => { const d = D(); return L && L.kind === 'cmd' && d && d.commands[L.cmd] ? d.commands[L.cmd] : null; };
  function clampSel() { if (E.sel != null && !E.M.lines[E.sel]) E.sel = null; if (E.sel != null && E.M.lines[E.sel].kind === 'header') E.sel = null; }
  function edit(fn: any) { begin(); fn(); flush(); commit(); clampSel(); draw(); renderProps(); }
  const snapN = (n: any, on: any) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);
  // how handles snap: lengths to the grid, angles to 5° (⌥: free)
  const snapper = (free: any) => ({ angle: (a: any) => (free ? Math.round(a * 10) / 10 : Math.round(a / 5) * 5), len: (v: any) => (free ? Math.round(v * 1000) / 1000 : Math.round(v / GRID) * GRID) });

  // ---------------------------------------------------------------- palette
  // the domain's objects (data-cmd: placed), the main editor's drawing tools (data-tool) and the domain's examples
  // (data-ex: replace the figure)
  function palette() {
    const d = D();
    if (!d) return [];
    const cats = new Map();
    for (const [k, c] of Object.entries<any>(d.commands)) {
      const cat = c.cat || 'Objects';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push([k, c]);
    }
    return [...cats];
  }
  function buildPalette() {
    const d = D();
    if (!d) { pal.render([], { notice: `${esc(uiText('editor.phy.noDomain1', 'This figure names no domain: start the source with '))}<code>\\physics{optics}</code>${esc(uiText('editor.phy.noDomain2', ' (or mechanics, fields, waves, spacetime, levels).'))}` }); return; }
    const ex = Object.keys(d.examples || {});
    pal.render([
      // object names and categories come from the physics domains (English); only the fallback group is ours
      ...palette().map(([cat, items]: any) => ({
        id: `c:${cat}`, title: cat === 'Objects' ? uiText('editor.phy.objects', 'Objects') : cat,
        items: items.map(([k, c]: any) => ({ id: `c:${k}`, class: 'phy-part', label: c.label, title: `${c.label}${c.argHelp ? ` ${c.argHelp}` : ''}`, keywords: `${k} \\${k} ${c.cat || ''}`, svg: `<code>\\${esc(k)}</code>`, attrs: { 'data-cmd': k } })),
      })),
      // the main editor's drawing tools (TD.drawTools, from src/application/app.ts): shapes, lines, text and symbols beside the physics
      ...(TD.drawTools ? TD.drawTools() : []).map(([cat, items]: any) => ({
        id: `t:${cat}`, title: cat, layout: 'icons' as const, class: 'phy-tools',
        items: items.map(([t, n, icon]: any) => ({ id: `t:${t}`, label: n, keywords: `${t} ${cat}`, svg: icon, on: E.tool === t, attrs: { 'data-tool': t } })),
      })),
      ...(ex.length ? [{ id: 'examples', title: uiText('editor.phy.examples', 'Examples'), note: uiText('editor.phy.examplesNote', 'replace the figure'), items: ex.map((t) => ({ id: `x:${t}`, class: 'phy-part', label: t, svg: '', attrs: { 'data-ex': t } })) }] : []),
    ], { armed: E.arm ? `c:${E.arm}` : null });
  }
  // click: arm the object for placing (or add it, when it has no position); drag it onto the grid
  paletteDrag(list, {
    selector: '[data-cmd]',
    item: (b) => b.dataset.cmd!,
    keyboard: true,
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); place(d.k, x, y); }
      E.hover = null; draw();
    },
  });
  list.addEventListener('click', (e: any) => {
    const tb = e.target.closest('[data-tool]');
    if (tb) { armTool(tb.dataset.tool); return; }
    const b = e.target.closest('[data-ex]');
    if (b) loadExample(b.dataset.ex);
  });
  function armTool(t: any) {
    endPoly();
    E.tool = E.tool === t ? null : t; E.arm = null;
    buildPalette(); draw();
    const it = E.tool && TD.drawTools().flatMap((x: any) => x[1]).find((x: any) => x[0] === E.tool);
    const name = it ? it[1].split(/ [(—:]/)[0] : t;
    setTip(!E.tool ? '' : t === 'poly' || t === 'blob' ? uiText('editor.phy.tipPoly', 'Click to add points · double-click or Enter to finish · click the first point to close')
      : t === 'pencil' ? uiText('editor.phy.tipPencil', 'Draw freehand · end near the start to close')
      : t === 'text' || t === 'math' ? uiText('editor.phy.tipText', 'Click where the text goes, then type it on the right')
      : /^sym:|^(rect|ellipse|ball|dot)$/.test(t) ? uiText('editor.phy.tipDragOrClick', '{name}: drag on the grid, or click to place. Esc when done.', { name })
      : uiText('editor.phy.tipDrag', '{name}: drag on the grid. Esc when done.', { name }));
  }
  function pick(k: any) {
    const c = D() && D().commands[k];
    if (!c) return;
    E.tool = null;
    // settings and objects without a position are added (or selected, when one is there already) at once
    if (!c.args || c.cat === 'Settings') {
      const have = c.cat === 'Settings' ? E.M.lines.findIndex((L: any) => L.kind === 'cmd' && L.cmd === k) : -1;
      if (have >= 0) { E.sel = have; draw(); renderProps(); return; }
      place(k, 0, 0); return;
    }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? uiText('editor.phy.armTip', '{name}: click the grid to place it. Esc when done.', { name: c.label }) : '');
  }
  // a new line after the selection (settings go first, after the header), selected
  function place(k: any, x: any, y: any) {
    const c = D().commands[k];
    const text = c.make(snapN(x, true), snapN(y, true));
    let at = E.sel != null ? E.sel + 1 : E.M.lines.length;
    if (c.cat === 'Settings') { const h = E.M.lines.findIndex((L: any) => L.kind === 'header'); at = h + 1; }
    edit(() => E.M.lines.splice(at, 0, P.parseLine(text)));
    E.sel = at; draw(); renderProps();
  }
  async function loadExample(t: any) {
    const src = D() && D().examples[t];
    if (!src) return;
    edit(() => setSrc(src));
    E.sel = null; E.arm = null; buildPalette(); renderProps(); fit();
    setTip(uiText('editor.phy.loadedExample', 'Loaded “{name}”. {key} brings your figure back.', { name: t, key: `${CMD}Z` }));
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- shapes (the main editor's objects)
  // A \shape line holds one of the main editor's objects in px of the figure's frame (1cm = PX px, y down), so its
  // own code (TD.TYPES) creates, reshapes, draws and exports it, as on the main canvas.
  const DEF = { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' };
  const clone = (o: any) => JSON.parse(JSON.stringify(o));
  const toPx = (c: any) => ({ x: c[0] * PX, y: -c[1] * PX });
  const scr = (x: any, y: any) => m([x / PX, -y / PX]);
  const shapeOf = (i: any) => { const L = lineAt(i); return L && L.kind === 'shape' ? L.shape : null; };
  const typeOf = (sh: any) => TD.TYPES[sh.type];
  function touchShape(i: any) { const L = E.M.lines[i]; L.raw = P.shapeLine(L.shape); flush(); }
  // a new shape line after the selection, selected
  function addShape(sh: any) {
    const at = E.sel != null ? E.sel + 1 : E.M.lines.length;
    E.M.lines.splice(at, 0, { raw: P.shapeLine(sh), kind: 'shape' as const, shape: sh });
    flush(); E.sel = at;
    return at;
  }
  // the selection: E.sel is the one selected object; a marquee or ⇧-click selects several (E.multi, E.sel null)
  const selList = () => (E.multi ? E.multi.slice() : E.sel != null ? [E.sel] : []);
  function setSel(ids: any) {
    ids = [...new Set(ids)].sort((a, b) => (a as any) - (b as any));
    if (ids.length > 1) { E.sel = null; E.multi = ids; } else E.sel = ids.length ? ids[0] : null;  // E.sel's setter clears E.multi
  }
  // an object's extent in cm, [x0, y0, x1, y1], from what it draws
  function lineBox(i: any, r: any) {
    const sh = shapeOf(i);
    if (sh) { let b; try { b = TD.bbox(sh); } catch { return null; } return [b.x / PX, -(b.y + b.h) / PX, (b.x + b.w) / PX, -b.y / PX]; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (p: any, w = 0, h = 0) => { x0 = Math.min(x0, p[0] - w); x1 = Math.max(x1, p[0] + w); y0 = Math.min(y0, p[1] - h); y1 = Math.max(y1, p[1] + h); };
    for (const it of r.items) {
      if (it.obj !== i) continue;
      if (it.pts) it.pts.forEach((p: any) => add(p));
      else if (it.at) add(it.at, (it.w2 || 0), (it.h2 || 0));
    }
    return x0 <= x1 ? [x0, y0, x1, y1] : null;
  }
  // left to right: objects wholly inside; right to left: anything the box touches
  function marqueeSel(d: any) {
    const r = R(), M = marquee(d.a[0], d.a[1], d.b[0], d.b[1]);
    const ids = [...d.base];
    E.M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' && L.kind !== 'tikz' && L.kind !== 'shape') return;
      const q = lineBox(i, r);
      if (!q) return;
      if (marqueeTakes(M, boxShape(q[0], q[1], q[2], q[3]))) ids.push(i);
    });
    setSel(ids);
  }
  // move several objects by dv cm from their state at the start (raws): shapes translate, physics objects drag their move handle
  function moveGroup(g: any, dv: any) {
    for (const [i, raw] of g.raws) E.M.lines[i] = P.parseLine(raw);
    for (const [i, h] of g.hs) {
      const L = E.M.lines[i];
      if (L.kind === 'shape') { TD.translate(L.shape, dv[0] * PX, -dv[1] * PX); L.raw = P.shapeLine(L.shape); }
      else if (h) { try { h.drag(L, G.add(h.at, dv), snapper(true)); } catch {} }
    }
    flush();
  }
  function groupOf(ids: any) { return { raws: ids.map((i: any) => [i, E.M.lines[i].raw]), hs: ids.map((i: any) => [i, shapeOf(i) ? null : moveHandle(i)]) }; }
  function dropLine(i: any) { E.M.lines.splice(i, 1); flush(); if (E.sel === i) E.sel = null; }
  // distance in screen px from the pointer to a shape: its strokes for lines, else its box
  function shapeDist(sh: any, sx: any, sy: any) {
    let pts = null;
    if (sh.type === 'line') pts = [[sh.x1, sh.y1], [sh.x2, sh.y2]];
    else if (sh.type === 'poly' && !sh.closed && !sh.smooth) pts = sh.pts;
    else if (sh.type === 'curve') {
      pts = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        pts.push([a * sh.x1 + b * sh.cx1 + c * sh.cx2 + d * sh.x2, a * sh.y1 + b * sh.cy1 + c * sh.cy2 + d * sh.y2]);
      }
    }
    if (pts) {
      const q = pts.map(([x, y]: any) => scr(x, y));
      let d = Infinity;
      for (let k = 1; k < q.length; k++) d = Math.min(d, segD([sx, sy], q[k - 1], q[k]));
      return d;
    }
    let b;
    try { b = TD.bbox(sh); } catch { return Infinity; }
    const [X0, Y0] = scr(b.x, b.y), [X1, Y1] = scr(b.x + b.w, b.y + b.h);
    return Math.max(0, Math.min(X0, X1) - sx, sx - Math.max(X0, X1), Math.min(Y0, Y1) - sy, sy - Math.max(Y0, Y1));
  }
  function shapeOutline(sh: any) {
    if (sh.type === 'line') { const a = scr(sh.x1, sh.y1), b = scr(sh.x2, sh.y2); return `M${r2(a[0])},${r2(a[1])}L${r2(b[0])},${r2(b[1])}`; }
    let b;
    try { b = TD.bbox(sh); } catch { return ''; }
    const [X0, Y0] = scr(b.x, b.y), [X1, Y1] = scr(b.x + b.w, b.y + b.h);
    return `M${r2(X0)},${r2(Y0)}H${r2(X1)}V${r2(Y1)}H${r2(X0)}Z`;
  }
  function shapeHandleAt(e: any, px = 7) {
    const sh = shapeOf(E.sel);
    if (!sh || !typeOf(sh).handles) return null;
    const [sx, sy] = pos(e);
    let best = null, bd = px;
    for (const h of typeOf(sh).handles(sh)) { const [X, Y] = scr(h.x, h.y), d = Math.hypot(X - sx, Y - sy); if (d <= bd) { bd = d; best = h; } }
    return best;
  }
  // a click with a drawing tool: text at once, polylines point by point, the rest by dragging (or a click, for a default size)
  function toolDown(e: any, dbl: any) {
    const t = E.tool, q = toPx(toCm(e, !e.altKey)), [sx, sy] = pos(e);
    if (t === 'text' || t === 'math') {
      begin();
      const sh = TD.TYPES.text.create(q, DEF);
      sh.text = t === 'math' ? '$x$' : 'Text';
      addShape(sh); commit();
      E.tool = null; buildPalette(); setTip(''); draw(); renderProps();
      const f = $('[data-sf="text"]', props); if (f) { f.focus(); f.select(); }
      return;
    }
    if (t === 'poly' || t === 'blob') {
      if (E.poly == null) {
        begin();
        const sh = TD.TYPES.poly.create(q, DEF);
        sh.pts = [[q.x, q.y], [q.x, q.y]];
        if (t === 'blob') { sh.smooth = true; sh.closed = true; }
        E.poly = addShape(sh);
      } else {
        const sh = shapeOf(E.poly);
        if (!sh) { E.poly = null; return; }
        if (dbl) { endPoly(); return; }
        const [fx, fy] = scr(sh.pts[0][0], sh.pts[0][1]);
        if (sh.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 8) { sh.closed = true; endPoly(); return; }
        sh.pts[sh.pts.length - 1] = [q.x, q.y];
        sh.pts.push([q.x, q.y]);
        touchShape(E.poly);
      }
      draw(); return;
    }
    begin();
    if (t === 'pencil') {
      const sh = TD.TYPES.poly.create(q, DEF);
      sh.pts = [[q.x, q.y]]; sh.smooth = true;
      E.drag = { mode: 'pencil', i: addShape(sh) };
      draw(); return;
    }
    const type = TD.toolType ? TD.toolType(t) : t.split(':')[0];
    if (!TD.TYPES[type]) return;
    const sh = TD.TYPES[type].create(q, DEF, t);
    E.drag = { mode: 'create', i: addShape(sh), a: q, sx, sy, moved: false };
    draw();
  }
  function endPoly() {
    if (E.poly == null) return;
    const i = E.poly, sh = shapeOf(i);
    E.poly = null;
    if (sh) {
      sh.pts.pop();
      sh.pts = sh.pts.filter((p: any, k: any, a: any) => k === 0 || Math.hypot(p[0] - a[k - 1][0], p[1] - a[k - 1][1]) > 0.5);
      if (sh.smooth && sh.closed && sh.pts.length < 3) sh.closed = false;
      if (sh.pts.length < 2) dropLine(i); else touchShape(i);
    }
    commit();
    E.tool = null; buildPalette(); setTip(''); clampSel(); draw(); renderProps();
  }
  function endCreate(d: any) {
    const sh = shapeOf(d.i);
    if (!sh) return;
    const t = typeOf(sh);
    if (d.mode === 'pencil') {
      const tol = 3 * PX / E.view.k, out = [sh.pts[0]];
      for (const p of sh.pts.slice(1)) if (Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > tol) out.push(p);
      sh.pts = out;
      if (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 10 * PX / E.view.k) { out.pop(); sh.closed = true; }
    } else {
      if (t.fix) t.fix(sh);
      // a click with a box tool: a default size
      if (!t.valid(sh) && !d.moved && !TD.LINEISH.has(sh.type) && t.drag) { t.drag(sh, d.a, { x: d.a.x + 1.5 * PX, y: d.a.y + PX }, {}); if (t.fix) t.fix(sh); }
    }
    if ((d.mode === 'pencil' && sh.pts.length < 2) || (d.mode === 'create' && !t.valid(sh))) dropLine(d.i); else touchShape(d.i);
    commit();
    E.tool = null; buildPalette(); setTip(''); clampSel(); draw(); renderProps();
  }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [8, 600], redraw: () => { draw(); } });
  // cm (y up) ↔ screen
  const m = (p: any) => [E.view.ox + p[0] * E.view.k, E.view.oy - p[1] * E.view.k];
  const toCm = (e: any, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snapN((x - v.ox) / v.k, snapOn), snapN((v.oy - y) / v.k, snapOn)]; };
  function segD(p: any, a: any, b: any) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  }
  function inside(p: any, pts: any) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // the object (line index) under the pointer: the nearest stroke, dot or label within a few px; else a filled shape
  function objAt(e: any, px = 6) {
    const r = R(), [sx, sy] = pos(e);
    // shapes are drawn over the physics: the topmost one under the pointer wins
    for (const { i, s: sh } of [...r.shapes].reverse()) if (shapeDist(sh, sx, sy) <= px) return i;
    let best = null, bd = px, fill = null;
    for (const it of r.items) {
      if (it.obj == null || it.obj < 0) continue;
      let d = Infinity;
      if (it.k === 'line') { const q = it.pts.map(m); for (let i = 1; i < q.length; i++) d = Math.min(d, segD([sx, sy], q[i - 1], q[i])); }
      else if (it.k === 'dot') { const [X, Y] = m(it.at); d = Math.max(0, Math.hypot(X - sx, Y - sy) - (it.r || 2.2)); }
      else if (it.k === 'text') { const [X, Y] = m(it.at), w = (it.w2 || 0) * E.view.k, h = (it.h2 || 0) * E.view.k; d = Math.max(0, Math.abs(X - sx) - w, Math.abs(Y - sy) - h); }
      else if (it.k === 'poly') { const q = it.pts.map(m); if (inside([sx, sy], q)) { if (it.fill && it.fill !== 'none') d = 0; else fill = it.obj; } for (let i = 0; i < q.length; i++) d = Math.min(d, segD([sx, sy], q[i], q[(i + 1) % q.length])); }
      // ties go to what is drawn later (on top)
      if (d <= bd) { bd = d; best = it.obj; }
    }
    return best != null ? best : fill;
  }
  function handleAt(e: any, px = 8) {
    if (E.sel == null) return null;
    const [sx, sy] = pos(e);
    let best = null, bd = px;
    for (const h of R().handles) {
      if (h.obj !== E.sel) continue;
      const [X, Y] = m(h.at), d = Math.hypot(X - sx, Y - sy);
      if (d <= bd) { bd = d; best = h; }
    }
    return best;
  }
  const moveHandle = (i: any) => R().handles.find((h: any) => h.obj === i && h.kind === 'move') || null;
  function fit() {
    if (!E) return;
    const r = R(), b = r.empty ? { x0: -1, y0: -1, x1: 4, y1: 2 } : r.bb;
    // the figure's y runs up, the stage's down
    E.view = fitView(rect(), { x: b.x0, y: -b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0 }, { margin: 0.5, min: 16, max: 160 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  const HK: Record<string, any> = { move: 'move', rot: 'rot', size: 'size', focus: 'focus', corner: 'size', axisEnd: 'rot' };
  function draw() {
    if (!E) return;
    syncCode();
    const r0 = rect(), W = r0.width, H = r0.height, v = E.view, k = v.k;
    const step = k * GRID >= 7 ? GRID : 1, xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor((v.oy - H) / k / step), ye = Math.ceil(v.oy / k / step);
    let minor = '', major = '';
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy - j * step * k) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    const [OX, OY] = m([0, 0]);
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/><path class="cz-origin" d="M${OX - 6},${OY}h12M${OX},${OY - 6}v12"/>`;
    const r = R(), kk = k / PX;
    // the selection, as a halo under the drawing; objects with a problem get a red dashed outline
    const halo = (i: any, cls: any) => {
      const sh = shapeOf(i);
      if (sh) { const d = shapeOutline(sh); return d ? `<path class="${cls}${sh.type === 'line' ? '' : ' phy-box'}" d="${d}"/>` : ''; }
      let d = '';
      for (const it of r.items) {
        if (it.obj !== i) continue;
        if (it.k === 'line' || it.k === 'poly') d += 'M' + it.pts.map((p: any) => m(p).map(r2).join(',')).join('L') + (it.k === 'poly' ? 'Z' : '');
        else if (it.k === 'dot') { const [X, Y] = m(it.at); d += `M${r2(X - 0.1)},${r2(Y)}h0.2`; }
        else if (it.k === 'text') { const [X, Y] = m(it.at), w = it.w2 * k, h = it.h2 * k; d += `M${r2(X - w)},${r2(Y - h)}h${r2(2 * w)}v${r2(2 * h)}h${r2(-2 * w)}Z`; }
      }
      return d ? `<path class="${cls}" d="${d}"/>` : '';
    };
    for (const i of selList()) out += halo(i, 'phy-sel');
    if (E.hover && E.hover.obj != null && !selList().includes(E.hover.obj) && !E.drag) out += halo(E.hover.obj, 'phy-hov');
    if (!r.empty) {
      const b = r.bb;
      out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${P.draw({ src: E.src, x: b.x0 * PX, y: -b.y1 * PX }, { export: true })}</g>`;
    } else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(D() ? uiText('editor.phy.emptyStart', 'Place an object from the left to start') : uiText('editor.phy.emptyNoDomain', 'Name a domain in the first line of the source'))}</text>`;
    for (const i of r.bad) if (i >= 0 && i !== E.sel) out += halo(i, 'phy-bad');
    // the selected object's handles
    if (E.sel != null && !E.arm) {
      for (const h of r.handles) {
        if (h.obj !== E.sel) continue;
        const [X, Y] = m(h.at), kind = HK[h.kind] || 'move', on = E.drag && E.drag.h && E.drag.h.kind === h.kind && E.drag.h.label === h.label;
        const t = `<title>${esc(h.label ? uiText('editor.phy.dragHandle', 'Drag: {name}', { name: h.label }) : uiText('editor.phy.dragToMove', 'Drag to move'))}</title>`;
        if (kind === 'move') out += `<rect class="phy-h phy-hm${on ? ' on' : ''}" x="${r2(X - 4.5)}" y="${r2(Y - 4.5)}" width="9" height="9" rx="1.5">${t}</rect>`;
        else if (kind === 'rot') out += `<circle class="phy-h phy-hr${on ? ' on' : ''}" cx="${r2(X)}" cy="${r2(Y)}" r="5">${t}</circle>`;
        else out += `<path class="phy-h phy-hs${on ? ' on' : ''}" d="M${r2(X)},${r2(Y - 6)}L${r2(X + 6)},${r2(Y)}L${r2(X)},${r2(Y + 6)}L${r2(X - 6)},${r2(Y)}Z">${t}</path>`;
      }
    }
    if (E.drag && E.drag.mode === 'marquee' && E.drag.b) {
      const [ax, ay] = m(E.drag.a), [bx, by] = m(E.drag.b);
      out += marqueeSvg(ax, ay, bx, by);
    }
    const ss = shapeOf(E.sel);
    if (ss && !E.tool && E.poly == null && typeOf(ss).handles) {
      for (const h of typeOf(ss).handles(ss)) {
        const [X, Y] = scr(h.x, h.y), on = E.drag && E.drag.mode === 'shandle' && E.drag.k === h.k;
        out += h.ctrl ? `<circle class="phy-h phy-hr${on ? ' on' : ''}" cx="${r2(X)}" cy="${r2(Y)}" r="4"/>` : `<rect class="phy-h phy-hm${on ? ' on' : ''}" x="${r2(X - 4)}" y="${r2(Y - 4)}" width="8" height="8" rx="1.5"/>`;
      }
    }
    if ((E.arm || E.ghost || E.tool) && E.hover && E.hover.at) { const [X, Y] = m(E.hover.at); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!(E.arm || E.tool));
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (e.button === 1 || E.space) { e.preventDefault(); E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; svg.classList.add('panning'); return; }
    if (E.tool && e.button === 0) { toolDown(e, dbl); return; }
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); place(E.arm, x, y); return; }
    const sh0 = shapeHandleAt(e);
    if (sh0) { const s0 = shapeOf(E.sel); E.drag = { mode: 'shandle', i: E.sel, k: sh0.k, orig: clone(s0), p0: toPx(toCm(e, false)), sx, sy, moved: false }; draw(); return; }
    const h = handleAt(e);
    if (h) { E.drag = { mode: 'handle', h, i: E.sel, sx, sy, moved: false }; return; }
    const i = objAt(e);
    if (i != null && e.shiftKey) {
      const ids = selList();
      setSel(ids.includes(i) ? ids.filter((x: any) => x !== i) : [...ids, i]);
      draw(); renderProps(); return;
    }
    if (i != null && E.multi && E.multi.includes(i)) { E.drag = { mode: 'gmove', g: groupOf(E.multi), start: toCm(e, false), sx, sy, moved: false }; return; }
    if (i != null) {
      if (dbl && E.sel === i) { focusField(); return; }
      E.sel = i;
      if (shapeOf(i)) { E.drag = { mode: 'smove', i, orig: clone(shapeOf(i)), start: toCm(e, false), sx, sy, moved: false }; draw(); renderProps(); return; }
      const mh = moveHandle(i);
      E.drag = mh ? { mode: 'handle', h: mh, i, sx, sy, moved: false, body: true, at0: mh.at, start: toCm(e, false) } : null;
      draw(); renderProps(); return;
    }
    // an empty spot: a click clears the selection, a drag draws a marquee (⇧ adds to the selection)
    const base = e.shiftKey ? selList() : [];
    if (!e.shiftKey) E.sel = null;
    E.drag = { mode: 'marquee', base, a: toCm(e, false), b: null, sx, sy }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      if (E.poly != null) { const sh = shapeOf(E.poly); if (sh) { const q = toPx(toCm(e, !e.altKey)); sh.pts[sh.pts.length - 1] = [q.x, q.y]; touchShape(E.poly); } }
      const h: any = E.arm || E.tool ? { at: toCm(e, !e.altKey) } : handleAt(e) ? { handle: true } : (() => { const i = objAt(e); return i != null ? { obj: i } : null; })();
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover);
      E.hover = h;
      const hh = !E.arm && handleAt(e);
      const sho = !E.arm && !E.tool && !hh && shapeHandleAt(e);
      svg.style.cursor = E.arm || E.tool ? '' : sho ? 'move' : hh ? (hh.kind === 'move' ? 'move' : 'grab') : h && h.obj != null ? (moveHandle(h.obj) || shapeOf(h.obj) ? 'move' : 'default') : '';
      if (E.poly != null) { draw(); return; }
      if (hh && hh.label) setTip(hh.label); else if (E.tipHandle) setTip('');
      E.tipHandle = !!(hh && hh.label);
      if (ch) draw();
      return;
    }
    if (d.mode === 'marquee') {
      if (!d.b && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.b = toCm(e, false); marqueeSel(d); draw(); return;
    }
    if (d.mode === 'gmove') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const dv = G.sub(toCm(e, false), d.start);
      moveGroup(d.g, e.altKey ? dv : [snapN(dv[0], true), snapN(dv[1], true)]);
      draw(); return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (d.idle) svg.classList.add('panning');
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return;
    }
    if (d.mode === 'create' || d.mode === 'pencil') {
      const sh = shapeOf(d.i);
      if (!sh) return;
      if (d.mode === 'pencil') { const q = toPx(toCm(e, false)), l = sh.pts[sh.pts.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) > 2 * PX / E.view.k) sh.pts.push([q.x, q.y]); }
      else { if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return; d.moved = true; typeOf(sh).drag(sh, d.a, toPx(toCm(e, !e.altKey)), e); }
      touchShape(d.i); draw(); return;
    }
    if (d.mode === 'shandle' || d.mode === 'smove') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const L = lineAt(d.i);
      if (!L || L.kind !== 'shape') return;
      Object.assign(L.shape, clone(d.orig));
      if (d.mode === 'shandle') typeOf(L.shape).setHandle(L.shape, d.k, toPx(toCm(e, !e.altKey)), e, d.orig, d.p0);
      else { const dv = G.sub(toCm(e, false), d.start), f = e.altKey; TD.translate(L.shape, (f ? dv[0] : snapN(dv[0], true)) * PX, -(f ? dv[1] : snapN(dv[1], true)) * PX); }
      touchShape(d.i); draw(); return;
    }
    if (d.mode === 'handle') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; }
      const free = e.altKey, raw = toCm(e, false);
      // a handle lands on the grid; a body moves by whole grid steps, so it keeps its offset from the grid
      let p = raw;
      if (d.body) { const dv = G.sub(raw, d.start); p = G.add(d.at0, free ? dv : [snapN(dv[0], true), snapN(dv[1], true)]); }
      else if (!free) p = [snapN(p[0], true), snapN(p[1], true)];
      const L = lineAt(d.i);
      if (!L) return;
      try { d.h.drag(L, p, snapper(free)); } catch (err: any) { return; }
      flush();
      const s = specOf(L);
      setTip(`${s ? s.label : `\\${L.cmd}`}${d.h.label ? `: ${d.h.label}` : ''} · ${L.raw.length > 64 ? L.raw.slice(0, 63) + '…' : L.raw}${free ? '' : uiText('editor.phy.altFree', ' · ⌥ for free')}`);
      draw(); renderProps(); return;
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    svg.classList.remove('panning');
    if (d.mode === 'create' || d.mode === 'pencil') { endCreate(d); return; }
    if (d.mode === 'marquee') { renderProps(); }
    if (d.mode === 'gmove' && d.moved) { commit(); renderProps(); }
    if ((d.mode === 'shandle' || d.mode === 'smove') && d.moved) { const sh = shapeOf(d.i); if (sh && typeOf(sh).endHandle) { typeOf(sh).endHandle(sh); touchShape(d.i); } commit(); renderProps(); }
    if (d.mode === 'handle' && d.moved) { setTip(''); commit(); renderProps(); }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });
  svg.addEventListener('dblclick', (e: any) => e.preventDefault());

  // right-click: the object's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { dup: 'duplicate', up: 'moveUp', down: 'moveDown', del: 'delete' };
  const mItem = (a: string, label: string, icon: string, key: string, off?: boolean) => menuRow(a, label, MI[icon], key, { disabled: !!off, danger: a === 'delete' });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const i = objAt(e);
    if (i == null) { closeMenu(); return; }
    const many = !!(E.multi && E.multi.includes(i));
    if (!many) E.sel = i;
    draw(); renderProps();
    const n = E.M.lines.length;
    menuRows = [mItem('dup', uiText('editor.phy.duplicate', 'Duplicate'), 'dup', `${CMD}D`), '-', mItem('up', uiText('editor.phy.drawEarlier', 'Draw Earlier'), 'up', '', many || i <= firstObj()), mItem('down', uiText('editor.phy.drawLater', 'Draw Later'), 'down', '', many || i >= n - 1), '-', mItem('delete', uiText('editor.phy.delete', 'Delete'), 'del', '⌫')];
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) { act(a); }
  const firstObj = () => E.M.lines.findIndex((L: any) => L.kind === 'header') + 1;

  // ---------------------------------------------------------------- object actions
  function deleteSel() {
    const ids = selList();
    if (!ids.length) return;
    edit(() => ids.sort((a: any, b: any) => b - a).forEach((i: any) => E.M.lines.splice(i, 1)));
    E.sel = null; draw(); renderProps();
  }
  // a copy just after it, moved half a centimetre, with a fresh name when it has one
  function duplicate() {
    const ids = selList();
    if (!ids.length) return;
    if (ids.length > 1) {
      // copies go after the last one, in order, and become the selection
      const end = ids[ids.length - 1] + 1, cs = ids.map((i: any) => copyLine(E.M.lines[i]));
      edit(() => E.M.lines.splice(end, 0, ...cs));
      setSel(cs.map((c: any, k: any) => end + k)); draw(); renderProps(); return;
    }
    const i = ids[0], C = copyLine(E.M.lines[i]);
    edit(() => E.M.lines.splice(i + 1, 0, C));
    E.sel = i + 1; draw(); renderProps();
  }
  function copyLine(L: any) {
    const C = P.parseLine(L.raw);
    if (C.kind === 'cmd') {
      const nm = P.getOpt(C, 'name');
      if (nm) { let n = 2; const base = nm.replace(/\d+$/, '') || nm; while (E.M.lines.some((x: any) => x.kind === 'cmd' && P.getOpt(x, 'name') === base + n)) n++; P.setOpt(C, 'name', base + n); }
      C.args.forEach((a: any, k: any) => { const q = P.pos(C, k); if (q.p && !q.missing && !q.bad && !q.ref) P.setArg(C, k, q.one ? [q.p[0] + 0.5] : [q.p[0] + 0.5, q.p[1] - 0.5]); });
    }
    if (C.kind === 'shape') { TD.translate(C.shape, 0.5 * PX, 0.5 * PX); C.raw = P.shapeLine(C.shape); }
    return C;
  }
  function shift(dir: any) {
    if (E.sel == null) return;
    const i = E.sel, j = i + dir;
    if (j < firstObj() || j >= E.M.lines.length) return;
    edit(() => { const [L] = E.M.lines.splice(i, 1); E.M.lines.splice(j, 0, L); });
    E.sel = j; draw(); renderProps();
  }
  function nudge(dx: any, dy: any) {
    if (E.multi) { const g = groupOf(E.multi); edit(() => moveGroup(g, [dx, dy])); return; }
    if (shapeOf(E.sel)) { const i = E.sel; edit(() => { TD.translate(shapeOf(i), dx * PX, -dy * PX); touchShape(i); }); return; }
    const h = E.sel != null && moveHandle(E.sel);
    if (!h) return;
    edit(() => h.drag(E.M.lines[E.sel], [snapN(h.at[0] + dx, false), snapN(h.at[1] + dy, false)], snapper(true)));
  }

  // ---------------------------------------------------------------- properties
  function paramRow(L: any, p: any): FormRow {
    const raw = P.getOpt(L, p.k), def = typeof p.def === 'function' ? null : p.def;
    const base = (controls: Control[], controlClass = 'ctl'): FormRow => ({ kind: 'row', label: [p.label], labelTitle: p.help || (p.math ? uiText('editor.phy.useMaths', 'Use $…$ for maths') : undefined), controlClass, controls });
    if (p.kind === 'bool') {
      const on = raw == null ? !!def && def !== 'false' : !/^(false|no|0|off)$/i.test(raw);
      return switchRow([p.label], [[1, uiText('editor.phy.on', 'On')], [0, uiText('editor.phy.off', 'Off')]].map(([v, n]) => ({ text: String(n), on: +on === v, attrs: { 'data-pb': p.k, 'data-v': v } })),
        { labelTitle: p.help || (p.math ? uiText('editor.phy.useMaths', 'Use $…$ for maths') : undefined) });
    }
    if (p.kind === 'enum') return base([{ kind: 'select', value: raw != null ? raw : def, attrs: { 'data-pf': p.k }, options: p.opts.map(([v, n]: string[]) => [v, n || v]) }]);
    const ph = def == null || def === '' ? (p.kind === 'num' ? 'auto' : 'none') : p.kind === 'num' ? P.writeQ(def, { ...p, unit: p.dim ? p.unit : undefined }).replace(p.unit || '\u0000', '') : String(def);
    const unit = p.unit ? (p.unit === 'deg' ? '°' : p.unit) : '';
    return base([{ kind: 'input', value: raw ?? '', attrs: { type: 'text', 'data-pf': p.k, placeholder: p.math && ph === 'none' ? txPlaceholder('text', true) : ph, spellcheck: 'false', ...(p.kind === 'num' ? { class: 'mono' } : {}), ...(p.math ? { 'data-tx': 'text' } : {}) } }, ...(unit ? [{ kind: 'text' as const, text: unit }] : [])], unit ? 'ctl unit' : 'ctl');
  }
  function renderProps() {
    if (!E) return;
    const r = R(), d = D();
    title.textContent = d ? uiText('editor.phy.titleDomain', 'Physics: {name}', { name: d.label }) : uiText('ui.physics.figure', 'Physics figure');
    const show = (sections: FormSection[]) => renderView(props, FormPanel, { sections });
    const warnings = (only?: number): FormRow[] => r.warnings.filter((w: any) => only == null || w.obj === only).map((w: any) => ({ kind: 'error', text: w.msg }));
    const results = (only?: number): Extract<FormRow, {kind: 'physicsResults'}> => ({ kind: 'physicsResults', results: r.results.filter((q: any) => only == null || q.obj === only).map((q: any) => ({ ...q, status: (P.KIND[q.kind] || P.KIND.exact)[0], title: (P.KIND[q.kind] || P.KIND.exact)[1] + (q.note ? ' — ' + q.note : '') })) });
    if (E.multi) {
      show([section(uiText('editor.phy.nSelected', '{n} objects selected', { n: E.multi.length }), [note(uiText('editor.phy.multiHelp1', 'Drag any of them to move them together, or use the arrow keys. '), { kbd: '⇧' }, uiText('editor.phy.multiHelp2', '-click adds or removes one; '), { kbd: '⌫' }, uiText('editor.phy.multiHelp3', ' deletes them, '), { kbd: `${CMD}D` }, uiText('editor.phy.multiHelp4', ' duplicates them.'))], 'sec')]); return;
    }
    const L = lineAt(E.sel);
    if (L && L.kind === 'shape') { show([shapeProps(L.shape)]); return; }
    if (L) {
      const s = specOf(L);
      if (s) {
        const args: FormRow[] = L.args.map((a: any, k: number) => ({ ...row(k === 0 ? (s.args > 1 ? uiText('editor.phy.from', 'From') : uiText('editor.phy.position', 'Position')) : k === 1 ? uiText('editor.phy.to', 'To') : uiText('editor.phy.pointN', 'Point {n}', { n: k + 1 }), { kind: 'input', value: a.join(', '), attrs: { type: 'text', class: 'mono', 'data-pa': k, spellcheck: 'false' } }), labelTitle: s.argHelp || uiText('editor.phy.argHelp', 'x, y in cm, or a name') }));
        const known = new Set(s.params.map((p: any) => p.k)), extra = L.opts.filter((o: any) => !known.has(o.k)), computed = results(E.sel);
        show([{ ...section(s.label, [...args, ...s.params.map((p: any) => paramRow(L, p)), ...(extra.length ? [note(uiText('editor.phy.keptAsWritten', 'Kept as written: '), { code: extra.map((o: any) => o.v == null ? o.k : `${o.k}=${o.v}`).join(', ') })] : []), ...warnings(E.sel)], 'sec'), summary: uiText('editor.phy.cmdLine', '{cmd} · line {n}', { cmd: `\\${L.cmd}`, n: E.sel + 1 }) }, ...(computed.results.length ? [section(uiText('editor.phy.computed', 'Computed'), [computed], 'sec')] : [])]);
      } else show([{ ...section(L.kind === 'tikz' ? 'TikZ' : L.kind === 'comment' ? uiText('editor.phy.comment', 'Comment') : uiText('editor.phy.notUnderstood', 'Not understood'), [note(L.kind === 'tikz' ? uiText('editor.phy.plainTikz', 'Plain TikZ: drawn here and exported as written.') : uiText('editor.phy.keptInCode', 'Kept in the code as written. Edit it in the source below.')), ...warnings(E.sel)], 'sec'), summary: uiText('editor.phy.lineN', 'line {n}', { n: E.sel + 1 }) }]);
      return;
    }
    const n = E.M.lines.filter((x: any) => x.kind === 'cmd' || x.kind === 'tikz' || x.kind === 'shape').length;
    show([{ ...section(uiText('editor.phy.figure', 'Figure'), [...warnings(-1), note(uiText('editor.phy.figureHelp1', 'Place objects from the left; select one to change it or drag its handles ('), { kbd: '⌥' }, uiText('editor.phy.figureHelp2', ' turns snapping off). Values take units ('), { code: '500nm' }, ', ', { code: '30deg' }, ', ', { code: '2kg' }, uiText('editor.phy.figureHelp3', '); a plain number is in the unit shown.'))], 'sec'), summary: n === 1 ? uiText('editor.phy.oneObject', '1 object') : uiText('editor.phy.nObjects', '{n} objects', { n }) }, ...(r.results.length ? [section(uiText('editor.phy.computed', 'Computed'), [results(), note(uiText('editor.phy.resultsHelp1', 'Hover a result for its model. '), { bold: 'exact' }, uiText('editor.phy.resultsHelp2', ': from the model as stated · '), { bold: 'ideal' }, uiText('editor.phy.resultsHelp3', ': exact for an idealised setup · '), { bold: 'approx.' }, uiText('editor.phy.resultsHelp4', ': an approximation · '), { bold: 'schematic' }, uiText('editor.phy.resultsHelp5', ': drawn, not computed.'))], 'sec')] : [])]);
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, L = lineAt(E && E.sel);
    if (!L) return;
    if (t.dataset.pf != null) {
      const s = specOf(L), p = s && s.params.find((x: any) => x.k === t.dataset.pf);
      const v = t.value.trim();
      P.setOpt(L, t.dataset.pf, p && p.kind === 'enum' && v === p.def ? '' : v);
    } else if (t.dataset.pa != null) {
      const parts = t.value.split(',').map((x: any) => x.trim()).filter(Boolean);
      if (!parts.length) return;
      P.setArg(L, +t.dataset.pa, parts);
    } else return;
    flush(); draw();
    if (t.tagName === 'SELECT') { commit(); renderProps(); begin(); } else renderProps();
 });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const b = ev.target.closest('[data-pb]'), L = lineAt(E && E.sel);
    if (!b || !L) return;
    const s = specOf(L), p = s && s.params.find((x: any) => x.k === b.dataset.pb), on = b.dataset.v === '1';
    const def = p && (p.def === true || p.def === 'true');
    edit(() => P.setOpt(L, b.dataset.pb, on === def ? '' : on ? 'true' : 'false'));
  });
  // ---------------------------------------------------------------- a drawn shape's properties (the main editor's names)
  const SHAPE_NAMES = (type: string) => (({ line: () => uiText('editor.phy.shape.line', 'Line'), curve: () => uiText('editor.phy.shape.curve', 'Curve'), poly: () => uiText('editor.phy.shape.poly', 'Polyline'), arc: () => uiText('editor.phy.shape.arc', 'Arc'), rect: () => uiText('editor.phy.shape.rect', 'Rectangle'), ellipse: () => uiText('editor.phy.shape.ellipse', 'Ellipse'), text: () => uiText('editor.phy.shape.text', 'Text'), sym: () => uiText('editor.phy.shape.sym', 'Symbol'), ball: () => uiText('editor.phy.shape.ball', 'Ball'), dot: () => uiText('editor.phy.shape.dot', 'Dot'), spring: () => uiText('editor.phy.shape.spring', 'Spring') }) as Record<string, () => string>)[type]?.();
  function shapeProps(sh: any): FormSection {
    const has = (k: string) => Object.prototype.hasOwnProperty.call(sh, k);
    const input = (label: string, key: string) => ({ ...row(label, { kind: 'input' as const, value: sh[key] || '', attrs: { type: 'text', 'data-sf': key, 'data-tx': 'text', placeholder: uiText('editor.phy.textPlaceholder', 'Text, $math$'), spellcheck: 'false' } }), labelTitle: uiText('editor.phy.useMaths', 'Use $…$ for maths') });
    const select = (label: string, key: string, options: string[][]) => row(label, { kind: 'select', value: sh[key], attrs: { 'data-sf': key }, options });
    const color = (label: string, key: string, nullable: boolean, fills: boolean) => row(label, { kind: 'fillColour', none: !sh[key], label: TD.fillLabel(sh[key]), css: TD.fillCss(sh[key]), attrs: { 'data-sc': key, ...(nullable ? { 'data-nullable': '1' } : {}), ...(fills ? { 'data-fills': '1' } : {}), title: TD.fillLabel(sh[key]) } });
    const rows: FormRow[] = [];
    if (sh.type === 'text') rows.push(input(uiText('editor.phy.text', 'Text'), 'text')); else if (has('label')) rows.push(input(uiText('editor.phy.label', 'Label'), 'label'));
    if (has('stroke')) rows.push(color(uiText('editor.phy.stroke', 'Stroke'), 'stroke', true, false));
    if (has('fill')) rows.push(color(uiText('editor.phy.fill', 'Fill'), 'fill', true, true));
    if (has('color') && (sh.type === 'text' || has('label'))) rows.push(color(uiText('editor.phy.textColour', 'Text colour'), 'color', false, false));
    if (has('width')) rows.push(row(captions["ui.width"], { kind: 'input', value: r2(sh.width), attrs: { type: 'number', class: 'mono', 'data-sf': 'width', min: '0.25', step: '0.25' } }, { kind: 'text', text: 'px', class: 'val' }));
    if (has('dash')) rows.push(select(uiText('editor.phy.dash', 'Dash'), 'dash', TD.DASHES));
    if (has('startTip')) rows.push(select(uiText('editor.phy.startTip', 'Start tip'), 'startTip', TD.TIPS), select(uiText('editor.phy.endTip', 'End tip'), 'endTip', TD.TIPS));
    if (has('size')) rows.push(select(uiText('editor.phy.textSize', 'Text size'), 'size', TD.SIZES.map((x: any) => [x[0], x[0]])));
    rows.push(note(uiText('editor.phy.shapeNote', 'Drawn like on the main canvas: drag it to move it, its handles to reshape it. Exported as TikZ with the figure.')));
    return { ...section(SHAPE_NAMES(sh.type) || sh.type, rows, 'sec'), summary: uiText('editor.phy.cmdLine', '{cmd} · line {n}', { cmd: '\\shape', n: E.sel + 1 }) };
  }
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, sh = E && shapeOf(E.sel);
    if (!sh || t.dataset.sf == null) return;
    const k = t.dataset.sf;
    if (k === 'width') { const v = parseFloat(t.value); if (!(v > 0)) return; sh.width = v; } else sh[k] = t.value;
    touchShape(E.sel); draw();
    if (t.tagName === 'SELECT') { commit(); renderProps(); begin(); }
  });
  props.addEventListener('click', (ev: any) => {
    const b = ev.target.closest('[data-sc]'), sh = E && shapeOf(E.sel);
    if (!b || !sh) return;
    const k = b.dataset.sc, i = E.sel;
    begin();
    const set = (v: any) => { const s2 = shapeOf(i); if (!s2) return; s2[k] = v || null; if (k === 'stroke' && !v) s2[k] = null; touchShape(i); draw(); };
    TD.openColorPicker(b, { value: sh[k] || null, nullable: !!b.dataset.nullable, fills: !!b.dataset.fills, onInput: set, onChange: set, onClose() { commit(); renderProps(); } });
  });
  function focusField() { const f = $('input[data-sf], input[data-pf], input[data-pa]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-pe="undo"]', root).disabled = !E.undo.length;
    $('[data-pe="redo"]', root).disabled = !E.redo.length;
    $('[data-pe="delete"]', root).disabled = !selList().length;
    $('[data-pe="dup"]', root).disabled = !selList().length;
  }
  root.addEventListener('click', (e) => { const b = (e.target! as Element).closest('[data-pe]'); if (b && E) act((b as HTMLElement).dataset.pe, b); });
  function act(a: any, b?: any) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'dup') duplicate();
    else if (a === 'up') shift(-1);
    else if (a === 'down') shift(1);
    else if (a === 'copy') copyCode(b, codeTa.value);
    updateTools();
  }
  function syncCode() {
    const r = R(), n = E.M.lines.filter((x: any) => x.kind === 'cmd' || x.kind === 'tikz' || x.kind === 'shape').length;
    const nr = r.results.length;
    count.textContent = `${n === 1 ? uiText('editor.phy.oneObject', '1 object') : uiText('editor.phy.nObjects', '{n} objects', { n })} · ${nr === 1 ? uiText('editor.phy.oneResult', '1 result') : uiText('editor.phy.nResults', '{n} results', { n: nr })}`;
    // the first four warnings, each with its line, then how many more
    showCodeNotes(codeMsg, [...r.warnings.slice(0, 4).map((w: any) => (w.obj >= 0 ? uiText('editor.phy.warnLine', 'Line {n}: ', { n: w.obj + 1 }) : '') + w.msg),
      ...(r.warnings.length > 4 ? [uiText('editor.phy.andMore', 'and {n} more', { n: r.warnings.length - 4 })] : [])]);
    updateTools();
    if (document.activeElement === codeTa) return;
    if (E.src !== E.codeAt) { E.codeAt = E.src; codeTa.value = E.src; }
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    setSrc(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); buildPalette(); draw(); renderProps();
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !session.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      escape: () => {
        if (E.poly != null) { endPoly(); return true; }
        if (E.tool) { E.tool = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (selList().length) { E.sel = null; draw(); renderProps(); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicate(); return; }
    if (mod && (e.key === 'f' || e.key === 'k')) { e.preventDefault(); search.focus(); search.select(); return; } // ⌘F or ⌘K: the palette's search
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(E.M.lines.map((L: any, i: any) => (L.kind === 'cmd' || L.kind === 'tikz' || L.kind === 'shape' ? i : -1)).filter((i: any) => i >= 0)); draw(); renderProps(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; svg.classList.add('pan-ready'); return; }
    if (e.key === 'Enter' && E.poly != null) { e.preventDefault(); endPoly(); return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel != null) { e.preventDefault(); focusField(); return; }
    if (e.key === 'Tab') {
      // walk the objects in code order
      e.preventDefault();
      const ids = E.M.lines.map((L: any, i: any) => (L.kind === 'cmd' || L.kind === 'tikz' || L.kind === 'shape' ? i : -1)).filter((i: any) => i >= 0);
      if (!ids.length) return;
      const at = ids.indexOf(E.sel), nx = at < 0 ? (e.shiftKey ? ids.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + ids.length) % ids.length;
      E.sel = ids[nx]; draw(); renderProps(); return;
    }
    if (e.key.startsWith('Arrow') && selList().length) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID;
      nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
    }
  }, true);
  // space held: the open hand; moving the view: the closed hand, as on the main canvas
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') { E.space = false; svg.classList.remove('pan-ready'); } }, true);
  window.addEventListener('blur', () => { if (E) E.space = false; svg.classList.remove('pan-ready', 'panning'); });
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  const session = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot, commit, root, code: codeTa, readCode, note: stageNote,
    discardTitle: () => uiText('editor.phy.discard', 'Discard changes to this figure?'), settle: closeMenu,
  });
  const { save, finish } = session;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    E = { src: '', M: null, arm: null, view: { ox: 0, oy: 0, k: 40 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, ghost: null, tool: null, poly: null, multi: null, codeAt: null, codeTimer: null };
    // choosing one object (E.sel = i, or null) ends a multiple selection
    let sel1: any = null;
    Object.defineProperty(E, 'sel', { get: () => sel1, set: (v) => { sel1 = v; E.multi = null; }, enumerable: true });
    setSrc(String(block.src || ''));
    E.start = E.src;
    session.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, panel and drawing's captions follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (session.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.physicsEditor = { open, dockable: true, close: () => session.detach() };
})();
