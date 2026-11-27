import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import { field, numField, segments, note, actionRow, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import NetworkeditorFrame from '../ui/editors/NetworkeditorFrame.svelte';
import NetworkLayers from '../ui/editors/NetworkLayers.svelte';
import { mountFrame } from '../ui/mount-frame';
import { patchSvg } from '../ui/svg-patch';
import { runtime as TD } from '../runtime';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
import { planeGrid, type Plane } from '../ui/plane-grid';
// Network editor: the overlay that opens on a Network block (tikz-network). A palette of vertices, edges, loops,
// text and planes; the network drawn by the canvas renderer on a centimetre grid, where vertices are placed and moved
// (their edges follow) and edges are dragged from vertex to vertex; auto layout on a circle or by springs; the
// selected item's properties; the CSV data files the code reads (\Vertices, \Edges), loaded from disk and, where the
// browser keeps a handle, linked to them; and beside it all the code, live both ways. Untouched code is handed back
// as written. A vertex or edge from a data file is edited in its row of that file.
// TD.networkEditor.open(block, onDone) — block: { id, src, files }; onDone({ src, files }) on Done.
(function () {
  const N = TD.network;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PX = TD.PX_PER_CM, PT = 1 / TD.PT_PER_PX, CM = 28.45274, GRID = 0.25, INK = '#1c1b19', PAPER = '#fffdf8';
  const { getOpt, setOpt, flag, kv } = N;

  // ---------------------------------------------------------------- palette
  const pic = (body: string) => `\\begin{tikzpicture}${body}\\end{tikzpicture}`;
  const vMini = (o: string) => pic(`\\Vertex[${o}]{a}`);
  const eMini = (o: string) => pic(`\\Vertex[x=0,y=0,size=.35]{a}\\Vertex[x=1.5,y=0,size=.35]{b}\\Edge[${o}](a)(b)`);
  const lMini = (o: string) => pic(`\\Vertex[size=.45]{a}\\Edge[loopsize=.6cm,${o}](a)(a)`);
  const PAL: any[] = [
    [message('editor.network.cat.vertices', 'Vertices'), [
      ['v:circle', message('editor.network.circle', 'Circle'), vMini(''), 'V'], ['v:rectangle', message('editor.network.square', 'Square'), vMini('shape=rectangle')],
      ['v:diamond', message('editor.network.diamond', 'Diamond'), vMini('shape=diamond')], ['v:regular polygon', message('editor.network.pentagon', 'Pentagon'), vMini('shape=regular polygon')],
      ['v:star', message('editor.network.star', 'Star'), vMini('shape=star')], ['v:ellipse', message('editor.network.ellipse', 'Ellipse'), vMini('shape=ellipse,style={minimum width=1cm}')],
      ['v:triangle', message('editor.network.triangle', 'Triangle'), vMini('shape=regular polygon,style={regular polygon sides=3}')],
      ['v:pseudo', message('editor.network.hidden', 'Hidden'), vMini('style={dashed,fill=none}'), null, null, message('editor.network.hiddenTitle', 'Hidden vertex (Pseudo): not drawn, but its edges still meet it; an edge can be routed through one')],
    ]],
    [message('editor.network.cat.edges', 'Edges'), [
      ['e:plain', message('editor.network.undirected', 'Undirected'), eMini(''), 'E'], ['e:direct', message('editor.network.directed', 'Directed'), eMini('Direct'), 'D'],
      ['e:bend', message('editor.network.bent', 'Bent'), eMini('bend=30'), 'B'], ['e:dbend', message('editor.network.directedBent', 'Directed, bent'), eMini('Direct,bend=30'), null, message('editor.network.dirBentShort', 'Bent arrow')],
      ['e:via', message('editor.network.viaEdge', 'Edge through a point'), pic('\\Vertex[x=0,y=0,size=.35]{a}\\Vertex[x=1.5,y=0,size=.35]{b}\\Vertex[x=.75,y=.5,Pseudo]{c}\\Edge[path=c](a)(b)'), null, message('editor.network.viaShort', 'Through point'), message('editor.network.viaTitle', 'Edge through a point: it runs through a hidden vertex halfway; drag that to route it')],
    ]],
    [message('editor.network.cat.loops', 'Loops'), [
      ['l:90', message('editor.network.loopAbove', 'Loop above'), lMini('loopposition=90'), 'L', message('editor.network.above', 'Above')], ['l:270', message('editor.network.loopBelow', 'Loop below'), lMini('loopposition=270'), null, message('editor.network.below', 'Below')],
      ['l:180', message('editor.network.loopLeft', 'Loop left'), lMini('loopposition=180'), null, message('editor.network.left', 'Left')], ['l:0', message('editor.network.loopRight', 'Loop right'), lMini(''), null, message('editor.network.right', 'Right')],
    ]],
    [message('editor.network.cat.annotations', 'Annotations'), [
      ['t:text', message('editor.network.text', 'Text'), pic('\\Text{Text}'), 'T'], ['p:plane', message('editor.network.plane', 'Plane'), pic('\\Plane[width=1.2,height=1.8]'), 'P'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, string> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key, short, title] of items) { ITEM[k] = { k, name, mini, key, short, title }; if (key) KEYS[key.toLowerCase()] = k; }
  const EDGE_OPTS: Record<string, string[]> = { plain: [], direct: ['Direct'], bend: ['bend=30'], dbend: ['Direct', 'bend=30'], via: [] };
  // a vertex's shape as options. TikZ has no triangle shape: tikz-network draws one as a three-sided regular polygon. An
  // ellipse with nothing in it is as wide as it is tall, so it is given a width (taken away again when the shape changes)
  const SIDES3 = 'regular polygon sides=3', WIDE = 'minimum width=1cm';
  const shapeOptsFor = (shape: string) => shape === 'circle' ? [] : shape === 'pseudo' ? ['Pseudo'] : shape === 'triangle' ? ['shape=regular polygon', `style={${SIDES3}}`] : shape === 'ellipse' ? ['shape=ellipse', `style={${WIDE}}`] : [`shape=${N.val(shape)}`];
  const isTriangle = (o: string[]) => getOpt(o, 'shape') === 'regular polygon' && N.opts(getOpt(o, 'style') || '').some((x: string) => kv(x).k === 'regular polygon sides' && parseFloat(kv(x).v) === 3);
  function setShape(en: any, v: string) {
    const o = en.item?.o ?? en.o, st = N.opts(getOpt(o, 'style') || '').filter((x: string) => (kv(x).k !== 'regular polygon sides' || !isTriangle(o)) && x.replace(/\s+/g, ' ').trim() !== WIDE);
    if (v === 'triangle') st.push(SIDES3);
    if (v === 'ellipse' && !st.some((x: string) => kv(x).k === 'minimum width')) st.push(WIDE);
    en.set('style', st.length ? st.join(',') : null);
    en.set('shape', v === 'triangle' ? 'regular polygon' : v || null);
  }

  // ---------------------------------------------------------------- model
  // M = TD.network.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M: any = N.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? N.write(M) : M.raw);
  const filesKey = (f: Record<string, string>) => JSON.stringify(Object.keys(f).sort().map((k) => [k, f[k]]));

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'networkModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, NetworkeditorFrame);
  document.body.appendChild(root);
  const svg = $('.network-svg', root), stage = $('.cz-stage', root);
  const pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'network-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, files, edited (names changed here since read or written), sel: { k: 'v'|'e'|'t'|'p', i, file?, row?, id? } | null,
  //   arm, kind, view, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer, blockId }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const code = () => (E.typed = keepComments(E.typed, codeOf(E.M)));
  // what undo and the unsaved check compare: the code and the data files
  const snapshot = () => code() + '\u0000' + filesKey(E.files);
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot, restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); sortLayers(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  // what is selected stays selected while the code moves round it (by its item, not its place)
  function keepSel(fn: () => any) {
    const all = [E.sel, ...(E.more || [])], objs = all.map((s: any) => (s ? E.M.items[s.i] : null));
    const r = fn();
    all.forEach((s: any, j: number) => { if (s && objs[j]) { const i = E.M.items.indexOf(objs[j]); if (i >= 0) s.i = i; } });
    return r;
  }
  // the code kept in the order its layers lie, the farthest painted first (TD.network.layerOrder)
  const sortLayers = () => keepSel(() => N.layerOrder(E.M));
  // Bring to Front, Bring Forward, Send Backward, Send to Back: among what is on the same layer
  function arrangeSel(how: 'front' | 'forward' | 'backward' | 'back') {
    const at = sels().filter((x: any) => x.file == null && ['v', 't', 'p', 'e', 'layer'].includes(x.k)).map((x: any) => x.i);
    if (!at.length) return;
    begin();
    const moved = keepSel(() => N.arrange(E.M, at, how));
    if (moved) E.M.dirty = true;
    commit(); draw(); renderProps();
    if (!moved) stageNote.flash(how === 'front' || how === 'forward' ? uiText('editor.network.atFront', 'Already in front of everything on its layer') : uiText('editor.network.atBack', 'Already behind everything on its layer'), 1600);
  }
  function restore(v: string) {
    const at = v.indexOf('\u0000'), src = at < 0 ? v : v.slice(0, at);
    let files: Record<string, string> = {};
    try { files = at < 0 ? {} : Object.fromEntries(JSON.parse(v.slice(at + 1))); } catch { /* the code alone */ }
    E.typed = src; E.M = load(src); E.files = files; clampSel(); draw(); renderProps(); updateTools();
  }
  const lay = () => N.layout({ src: code(), files: E.files });
  // what is selected still there (after an undo, or code typed)
  function clampSel() {
    const L = lay(), ok = (s: any) => s && (s.k === 'v' ? L.nodes.has(s.id) : s.k === 'e' ? L.edges.some((e: any) => same(e.src, s)) : !!E.M.items[s.i] && E.M.items[s.i].k === s.k);
    const keep = [E.sel, ...(E.more || [])].filter(ok);
    E.sel = keep[0] || null; E.more = keep.slice(1);
  }
  const same = (src: any, s: any) => !!src && src.item === s.i && (src.row ?? null) === (s.row ?? null);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const snap = (n: number, on: boolean) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- what is selected: its options, and how to set them
  // An item's own options, or the row of a data file: the same keys, so the panel needn't tell them apart
  function ent(s: any): any {
    if (!s) return null;
    if (s.file != null) {
      const T = N.csv(E.files[s.file] || ''), r = T.rows[s.row];
      if (!r) return null;
      const o = T.head.map((h: string, j: number) => (r[j] === '' || r[j] == null ? null : `${h}=${N.val(r[j])}`)).filter(Boolean);
      return {
        o, file: s.file, row: s.row, id: s.k === 'v' ? cell(T, r, 'id') : null, a: cell(T, r, 'u'), b: cell(T, r, 'v'),
        set(k: string, v: any) {
          const T2 = N.csv(E.files[s.file] || ''), row2 = T2.rows[s.row];
          if (!row2) return;
          let j = T2.head.indexOf(k);
          if (j < 0) { if (v == null || v === '' || v === false) return; T2.head.push(k); for (const rr of T2.rows) rr.push(''); j = T2.head.length - 1; }
          row2[j] = v === true ? 'true' : v === false || v == null ? '' : String(v);
          E.files[s.file] = N.csvText(T2); E.edited.add(s.file);
        },
      };
    }
    const it = E.M.items[s.i];
    if (!it) return null;
    return { o: it.o, item: it, id: it.id, a: it.a, b: it.b, set(k: string, v: any) { it.o = setOpt(it.o, k, v); } };
  }
  const cell = (T: any, r: string[], k: string) => { const j = T.head.indexOf(k); return j < 0 ? '' : r[j] || ''; };
  const selEnt = () => ent(E.sel);

  // ---------------------------------------------------------------- editing
  const letters = (n: number) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  function newId() { const L = lay(); let n = 0; while (L.nodes.has(letters(n))) n++; return letters(n); }
  // where a new item goes: never inside a Layer environment
  function outsideLayer(at: number) {
    let depth = 0;
    for (let i = 0; i < at; i++) { const k = E.M.items[i].k; if (k === 'layer') depth++; else if (k === 'endlayer') depth = Math.max(0, depth - 1); }
    while (depth > 0 && at < E.M.items.length) { const k = E.M.items[at].k; if (k === 'layer') depth++; else if (k === 'endlayer') depth--; at++; }
    return at;
  }
  function insertVertexAt() {
    const its = E.M.items;
    let at = -1;
    its.forEach((it: any, i: number) => { if (it.k === 'v' || it.k === 'vs') at = i; });
    if (at < 0) { const e = its.findIndex((it: any) => it.k === 'e' || it.k === 'es' || it.k === 't'); return outsideLayer(e < 0 ? its.length : e); }
    return outsideLayer(at + 1);
  }
  function ensureEnv() { if (E.M.env == null) E.M.env = ''; }
  // the 2×2 map from an item's x and y to the page (pt per unit): plain vertices are in \DefaultUnit, layered ones
  // on their canvas; \Text and \Plane have no unit (the picture's x and y vectors, or the canvas's centimetre)
  function placeMap(kind: string, layered: boolean) {
    const L = lay(), S = L.S, k = L.k, du = S.unit * S.DS;
    if (kind === 'v') return layered ? L.C2.map((x: number) => x * k * du) : [k * du, 0, 0, k * du];
    if (kind === 't' && !layered) return [k * S.DS * L.X[0], k * S.DS * L.Y[0], k * S.DS * L.X[1], k * S.DS * L.Y[1]];
    return L.C2.map((x: number) => x * k * S.DS * CM);
  }
  const toUnits = (kind: string, layered: boolean, dx: number, dy: number) => N.mul(N.inv(placeMap(kind, layered)), [dx, dy]);
  // a click at (x, y) cm on the page as a new item's x and y: on the layer new items go on (a plane always is on
  // one: layer 1 without), found back through that layer's canvas
  function placeAt(kind: string, cx: number, cy: number) {
    const L = lay(), layer = newLayer(kind);
    if (layer == null) return toUnits(kind, false, cx * CM, cy * CM).map(r3);
    const z = (layer - 1) * L.S.LD;
    return toUnits(kind, true, cx * CM - L.k * z * L.Z[0], cy * CM - L.k * z * L.Z[1]).map(r3);
  }
  const onLayer = () => (E.layer ? [`layer=${E.layer}`] : []);
  // a click on something puts the grid, and new items, on its layer (on none for what is on none)
  function layerOf(h: any): number | null | undefined {
    const L = lay(), LD = L.S.LD, n = (z: any) => (z == null ? null : LD ? Math.round(z / LD) + 1 : undefined);
    if (h.k === 'v') { const v = L.nodes.get(h.id); return v ? n(v.layer) : undefined; }
    if (h.k === 'p') { const p = L.planes.find((q: any) => q.src.item === h.i); return p ? n(p.layer) : undefined; }
    if (h.k === 't') { const t = L.texts.find((q: any) => q.src.item === h.i); return t ? n(t.layer) : undefined; }
    if (h.k === 'e') { const ed = L.edges.find((q: any) => same(q.src, h)); if (!ed) return undefined; const a = n(L.nodes.get(ed.a)?.layer), b = n(L.nodes.get(ed.b)?.layer); return a === b ? a : undefined; }
    return undefined;
  }
  function followLayer(h: any) {
    const n = layerOf(h);
    if (n === undefined || n === E.layer) return;
    E.layer = n; if (n == null) E.focus = false;
  }
  // the layer selector: a layer chosen is focused (the rest faded, only its items clicked, new items on it); none, not
  function setFocus(n: number | null) {
    if (n == null) E.focus = false; else { E.layer = n; E.focus = true; }
    if (E.focus) {
      // what is selected on another layer is let go
      const L = lay(), F = focusZ(), keep = sels().filter((x: any) => {
        if (x.k === 'v') return zIn(L.nodes.get(x.id)?.layer, F);
        if (x.k === 'e') { const ed = L.edges.find((q: any) => same(q.src, x)); return !ed || edgeIn(ed, F); }
        if (x.k === 't') return zIn(L.texts.find((q: any) => q.src.item === x.i)?.layer, F);
        if (x.k === 'p') return zIn(L.planes.find((q: any) => q.src.item === x.i)?.layer, F);
        return true;
      });
      E.sel = keep[0] || null; E.more = keep.slice(1);
    }
    setTip(E.focus ? uiText('editor.network.focusTip', 'Layer {n} focused', { n: E.layer }) : '');
    draw(); renderProps();
  }
  const layersHost = document.createElement('div');
  stage.appendChild(layersHost);
  layersHost.addEventListener('click', (e: any) => {
    const b = e.target.closest('[data-nl]');
    if (!b || !E) return;
    if (e.detail) b.blur(); // a click: the keys go back to the stage
    setFocus(b.dataset.nl === '' ? null : Number(b.dataset.nl));
  });
  // right-click on a layer: delete it
  layersHost.addEventListener('contextmenu', (e: any) => {
    const b = e.target.closest('.nw-layers-list [data-nl]');
    if (!b || !E || b.classList.contains('nw-layers-add')) return;
    e.preventDefault();
    const n = Number(b.dataset.nl);
    openEditorMenu(e, [menuRow('dellayer', uiText('editor.network.deleteLayer', 'Delete Layer {n}', { n }), 'delete', undefined, { danger: true })], (a: string) => { if (a === 'dellayer') deleteLayer(n); });
  });
  // a layer deleted: what is written on it goes (a vertex with its edges, planes, texts, a Layer environment with what
  // is in it), and the layers behind it move up one, so the numbers stay without a gap. Rows of data files stay as
  // they are. One undo step.
  function deleteLayer(n: number) {
    const lnum = (o: string[]) => { const v = getOpt(o || [], 'layer'); return v == null || v === '' ? null : parseInt(v, 10); };
    edit(() => {
      const items = E.M.items, drop = new Set<number>(), ids = new Set<string>();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.k === 'layer' && (lnum(it.o) ?? 1) === n) {
          let d = 0, j = i;
          for (; j < items.length; j++) { if (items[j].k === 'layer') d++; else if (items[j].k === 'endlayer' && --d === 0) break; }
          for (let q = i; q <= Math.min(j, items.length - 1); q++) { drop.add(q); if (items[q].k === 'v') ids.add(items[q].id); }
          i = j; continue;
        }
        if (['v', 't', 'p'].includes(it.k) && (lnum(it.o) ?? (it.k === 'p' ? 1 : null)) === n) { drop.add(i); if (it.k === 'v') ids.add(it.id); }
      }
      E.M.items = items.filter((it: any, i: number) => !drop.has(i) && !(it.k === 'e' && (ids.has(it.a) || ids.has(it.b))));
      for (const it of E.M.items) { const l = lnum(it.o); if (['v', 't', 'p', 'layer'].includes(it.k) && l != null && l > n) it.o = setOpt(it.o, 'layer', String(l - 1)); }
      if (E.layer != null && E.layer >= n) { if (E.layer === n) { E.focus = false; E.layer = layersInUse()[0] ?? null; } else E.layer--; }
      E.sel = null; E.more = [];
    });
    setTip('');
  }
  // nearest first (the highest z: layer 1 with the default distance of −2), then a new layer; shown for a multilayer
  // picture or once anything is on a layer
  function renderLayers() {
    if (!E) return;
    const L = lay(), used = layersInUse(), ml = N.opts(E.M.env || '').some((x: string) => kv(x).k === 'multilayer');
    const list = [...new Set([...used, ...(E.layer != null ? [E.layer] : [])])].sort((a, b) => (b - a) * (L.S.LD < 0 ? -1 : 1));
    const next = (list.length ? Math.max(...list) : 0) + 1;
    renderView(layersHost, NetworkLayers, {
      hidden: !ml && !used.length, label: uiText('editor.network.layers', 'Layers'),
      layers: list.map((n) => ({ n, on: !!E.focus && E.layer === n, title: uiText('editor.network.focusLayer', 'Layer {n}', { n }) })),
      add: { n: next, title: uiText('editor.network.focusNew', 'New layer {n}', { n: next }) },
      none: { on: !E.focus, title: uiText('editor.network.focusNone', 'All layers (Esc)') },
    });
  }
  // the layer nearest the top that something is on (1 when none is)
  function firstLayer() {
    const ns = E.M.items.map((it: any) => parseInt(getOpt(it.o || [], 'layer') || '', 10)).filter((n: number) => n > 0);
    return ns.length ? Math.min(...ns) : 1;
  }
  // the plane an item of `kind` lies on, as the stage shows it: its origin and one unit along its x and y. A layer's
  // plane (z = (layer − 1) × the layer distance) in a 3D picture is in perspective; with no layer, the page.
  function planeOn(kind: string, layered: boolean, z: number): Plane {
    const L = lay(), pm = placeMap(kind, layered), kv = E.view.k / CM, o = m((L.k * z * L.Z[0]) / CM, (L.k * z * L.Z[1]) / CM);
    return { o: [o[0], o[1]], u1: [pm[0] * kv, -pm[2] * kv], u2: [pm[1] * kv, -pm[3] * kv] };
  }
  // where new items go: the layer chosen for them (a plane is always on one: layer 1 without)
  const newLayer = (kind: string) => E.layer || (kind === 'p' ? 1 : null);
  // the grid's plane: the one new items go on, or while something is dragged, the one it moves on (it snaps there)
  function gridPlane(): Plane {
    const d = E.drag;
    if (d && d.mode === 'move' && d.moved) { const lead = d.group.find((g: any) => g.sel === E.sel) || d.group[0]; return planeOn(lead.sel.k, lead.layered, lead.z); }
    if (d && d.mode === 'corner') return planeOn('p', true, d.B.z);
    const layer = newLayer('v');
    return planeOn('v', layer != null, layer != null ? (layer - 1) * lay().S.LD : 0);
  }
  // the pointer as a point (cm on the page, y up) on the plane a new `kind` goes on, at the nearest grid point there
  function placeCm(e: any, snapOn: boolean, kind = 'v') {
    const [cx, cy] = toCm(e, false);
    if (!snapOn) return [cx, cy];
    const L = lay(), layer = newLayer(kind), z = layer != null ? (layer - 1) * L.S.LD : 0, [u, v] = placeAt(kind, cx, cy);
    const page = N.mul(placeMap(kind, layer != null), [snap(u, true), snap(v, true)]);
    return [(page[0] + L.k * z * L.Z[0]) / CM, (page[1] + L.k * z * L.Z[1]) / CM];
  }
  function addVertex(key: string, cx: number, cy: number) {
    let id = '';
    edit(() => {
      ensureEnv();
      id = newId();
      const [x, y] = placeAt('v', cx, cy), shape = key.slice(2);
      const o = [`x=${N.num(snap(x, false))}`, `y=${N.num(snap(y, false))}`, ...onLayer(), ...shapeOptsFor(shape), ...(shape === 'pseudo' ? [] : ['IdAsLabel'])];
      E.M.items.splice(insertVertexAt(), 0, { k: 'v', id, o });
    });
    E.sel = { k: 'v', i: E.M.items.findIndex((it: any) => it.k === 'v' && it.id === id), id }; draw(); renderProps();
    return id;
  }
  function addText(cx: number, cy: number) {
    const it: any = { k: 't', o: [], text: uiText('editor.network.newText', 'Text') };
    edit(() => { ensureEnv(); const [x, y] = placeAt('t', cx, cy); it.o = [`x=${N.num(x)}`, `y=${N.num(y)}`, ...onLayer()]; E.M.items.push(it); });
    E.sel = { k: 't', i: E.M.items.indexOf(it) }; E.more = []; draw(); renderProps();
    editLabel(E.sel);
  }
  function addPlane(cx: number, cy: number) {
    edit(() => {
      ensureEnv();
      const [x, y] = placeAt('p', cx, cy), at = E.M.items.findIndex((it: any) => it.k === 'v' || it.k === 'vs' || it.k === 'e' || it.k === 'es');
      E.M.items.splice(outsideLayer(at < 0 ? E.M.items.length : at), 0, { k: 'p', o: [`x=${N.num(snap(x, false))}`, `y=${N.num(snap(y, false))}`, 'width=4', 'height=3', ...onLayer()] });
    });
    E.sel = { k: 'p', i: E.M.items.findIndex((it: any) => it.k === 'p') }; E.more = []; draw(); renderProps();
  }
  function addEdge(a: string, b: string, extra?: string[]) {
    const loop = a === b;
    let added: any = null;
    edit(() => {
      ensureEnv();
      const o = loop ? (extra || []) : EDGE_OPTS[E.kind].slice();
      // an edge beside one between the same vertices (either way) bends, so neither hides the other
      if (!loop && E.kind !== 'via' && !o.some((x) => kv(x).k === 'bend')) {
        const twins = E.M.items.filter((it: any) => it.k === 'e' && it.a !== it.b && ((it.a === a && it.b === b) || (it.a === b && it.b === a)));
        if (twins.length) {
          const all = [...twins, { k: 'e', a, b, o }], n = all.length, step = 40 / Math.max(1, n - 1);
          all.forEach((it: any, j: number) => { const bend = Math.round(-20 + j * step) * (n === 1 ? 0 : 1) * (it.a === a ? 1 : -1); it.o = setOpt(it.o, 'bend', bend ? N.num(bend) : null); });
          o.splice(0, o.length, ...all[all.length - 1].o);
        }
      }
      E.M.items.push(added = { k: 'e', a, b, o });
      if (!loop) routeVia(added);
    });
    E.sel = { k: 'e', i: E.M.items.indexOf(added) }; E.more = []; draw(); renderProps();
  }
  // an edge through a point, tikz-network's way to route one: a hidden (Pseudo) vertex halfway, on its path; dragging
  // that vertex routes the edge. Ends without a written place (rows of a data file) keep the edge straight
  function routeVia(ed: any) {
    if (E.kind !== 'via' || ed.a === ed.b) return;
    const at = (id: string) => {
      const it = E.M.items.find((x: any) => x.k === 'v' && x.id === id), x = it ? parseFloat(getOpt(it.o, 'x')) : NaN, y = it ? parseFloat(getOpt(it.o, 'y')) : NaN;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y, layer: getOpt(it.o, 'layer') } : null;
    };
    const A = at(ed.a), B = at(ed.b);
    if (!A || !B) return;
    const id = newId();
    E.M.items.splice(insertVertexAt(), 0, { k: 'v', id, o: [`x=${N.num((A.x + B.x) / 2)}`, `y=${N.num((A.y + B.y) / 2)}`, ...(A.layer ? [`layer=${A.layer}`] : []), 'Pseudo'] });
    ed.o = setOpt(ed.o, 'path', id);
  }
  function deleteSel() {
    const list = sels();
    if (!list.length) return;
    edit(() => {
      const ids = new Set<string>(), drop = new Set<number>(), rows: Record<string, number[]> = {};
      for (const s of list) {
        if (s.file != null) { (rows[s.file] = rows[s.file] || []).push(s.row); if (s.k === 'v') { const en = ent(s); if (en) ids.add(en.id); } continue; }
        const it = E.M.items[s.i];
        if (!it) continue;
        drop.add(s.i);
        if (s.k === 'v') ids.add(it.id);
        // a Layer environment goes, its contents stay: its \end{Layer} too
        if (s.k === 'layer') { let d = 0; for (let j = s.i + 1; j < E.M.items.length; j++) { const k = E.M.items[j].k; if (k === 'layer') d++; else if (k === 'endlayer') { if (!d) { drop.add(j); break; } d--; } } }
      }
      for (const [f, rs] of Object.entries(rows)) { const T = N.csv(E.files[f] || ''); for (const r of rs.sort((x, y) => y - x)) T.rows.splice(r, 1); E.files[f] = N.csvText(T); E.edited.add(f); }
      // a vertex's edges in the code go with it
      E.M.items = E.M.items.filter((it: any, j: number) => !drop.has(j) && !(it.k === 'e' && (ids.has(it.a) || ids.has(it.b))));
    });
    E.sel = null; E.more = []; draw(); renderProps();
  }
  // ⌘C / ⌘V / ⌘D: the selected vertices (written ones), the edges among them, texts and planes; pasted beside, the
  // vertices renamed where their names are taken
  function copySel() {
    const its = sels().filter((s: any) => s.file == null && ['v', 't', 'p', 'e'].includes(s.k)).map((s: any) => E.M.items[s.i]).filter(Boolean);
    const ids = new Set(its.filter((it: any) => it.k === 'v').map((it: any) => it.id));
    const edges = E.M.items.filter((it: any) => it.k === 'e' && ids.has(it.a) && ids.has(it.b) && !its.includes(it));
    E.clip = JSON.parse(JSON.stringify([...its.filter((it: any) => it.k !== 'e' || (ids.has(it.a) && ids.has(it.b))), ...edges]));
    return E.clip.length;
  }
  function paste() {
    if (!E.clip || !E.clip.length) return;
    const L = lay(), taken = new Set<string>(L.nodes.keys()), map: Record<string, string> = {}, added: any[] = [];
    const fresh = (id: string) => { const m = /^(.*?)(\d*)$/.exec(id)!; let n = m[2] ? +m[2] + 1 : 1, t = m[1] + n; while (taken.has(t)) t = m[1] + ++n; taken.add(t); return t; };
    edit(() => {
      ensureEnv();
      for (const it0 of E.clip) {
        const it = JSON.parse(JSON.stringify(it0));
        if (it.k === 'v') { map[it.id] = taken.has(it.id) ? fresh(it.id) : (taken.add(it.id), it.id); it.id = map[it.id]; }
        if (it.k === 'e') { it.a = map[it.a] ?? it.a; it.b = map[it.b] ?? it.b; }
        if (it.k !== 'e') for (const key of ['x', 'y']) it.o = setOpt(it.o, key, N.num((parseFloat(getOpt(it.o, key) || '0') || 0) + 0.5 * (key === 'x' ? 1 : -1)));
        if (it.k === 'v') E.M.items.splice(insertVertexAt(), 0, it); else E.M.items.push(it);
        added.push(it);
      }
    });
    const sel = added.filter((it) => it.k !== 'e').map((it) => ({ k: it.k, i: E.M.items.indexOf(it), ...(it.k === 'v' ? { id: it.id } : {}) }));
    E.sel = sel[0] || null; E.more = sel.slice(1); draw(); renderProps();
  }
  function rename(s: any, to: string) {
    to = to.trim();
    const en = ent(s);
    if (!en || !to || to === en.id || /[(),{}\s]/.test(to) || lay().nodes.has(to)) return false;
    const from = en.id;
    if (s.file != null) en.set('id', to); else en.item.id = to;
    for (const it of E.M.items) if (it.k === 'e') { if (it.a === from) it.a = to; if (it.b === from) it.b = to; }
    // and the edges in data files
    for (const name of Object.keys(E.files)) {
      const T = N.csv(E.files[name]), iu = T.head.indexOf('u'), iv = T.head.indexOf('v');
      if (iu < 0 || iv < 0) continue;
      let ch = false;
      for (const r of T.rows) { if (r[iu] === from) { r[iu] = to; ch = true; } if (r[iv] === from) { r[iv] = to; ch = true; } }
      if (ch) { E.files[name] = N.csvText(T); E.edited.add(name); }
    }
    E.sel = { ...s, id: to };
    return true;
  }
  function reverseEdge(en: any) {
    if (!en || en.a === en.b) return;
    if (E.sel.file != null) { const a = en.a; en.set('u', en.b); en.set('v', a); }
    else { const t = en.item.a; en.item.a = en.item.b; en.item.b = t; }
    const b = parseFloat(getOpt(en.o, 'bend') || '0');
    if (b) en.set('bend', N.num(-b));
  }
  function autoLayout(mode: string) {
    if (!E.M.items.some((it: any) => it.k === 'v')) { stageNote.flash(uiText('editor.network.noAuto', 'Auto layout places the vertices written as \\Vertex; those from data files keep their places'), 2400); return; }
    edit(() => N.autoLayout(E.M, mode, 2));
    fit();
    stageNote.flash(mode === 'spring' ? uiText('editor.network.placedSpring', 'Vertices placed by their edges') : uiText('editor.network.placedCircle', 'Vertices placed on a circle'), 1800);
  }

  // ---------------------------------------------------------------- data files
  const linkKey = (name: string) => `${TD.state?.docId || 'doc'}:${E.blockId || 'block'}:${name}`;
  const linked = (name: string) => !!(TD.files?.data && TD.files.data.of(linkKey(name)));
  const safeName = (n: string) => (String(n).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'data.csv').replace(/(\.csv)?$/i, '.csv');
  // a CSV from disk: linked where the browser keeps a handle, else read once through a file input
  async function pickCsv(name: string | null): Promise<{ name: string; text: string } | null> {
    if (TD.files?.data?.can) {
      const cur = E, key = name ? linkKey(name) : linkKey('\u0001new');
      const r = await TD.files.data.pick(key, { 'text/csv': ['.csv'] });
      if (!r || E !== cur) return null;
      const nm = name || safeName(r.name);
      if (!name) await TD.files.data.move(key, linkKey(nm));
      return E === cur ? { name: nm, text: r.text } : null;
    }
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv,text/csv';
      inp.onchange = async () => { const f = inp.files && inp.files[0]; res(f ? { name: name || safeName(f.name), text: await f.text() } : null); };
      inp.click();
    });
  }
  async function loadFile(name: string) {
    const cur = E, r = await pickCsv(name);
    if (!r || !cur || E !== cur) return;
    begin(); E.files[name] = r.text; E.edited.delete(name); commit(); draw(); renderProps();
    stageNote.flash(linked(name) ? uiText('editor.network.loadedLinked', '{name} read in and linked to the file on disk', { name }) : uiText('editor.network.loaded', '{name} read in', { name }), 2000);
  }
  async function addDataFile() {
    const cur = E, r = await pickCsv(null);
    if (!r || !cur || E !== cur) return;
    const T = N.csv(r.text), isEdges = T.head.includes('u') && T.head.includes('v'), isVertices = T.head.includes('id');
    if (!isEdges && !isVertices) { const key = linkKey(r.name); await TD.alert(uiText('editor.network.badCsv', 'That file has no id column (vertices) nor u and v columns (edges)'), uiText('editor.network.badCsvMsg', 'tikz-network reads a CSV file with a header row: id, x, y … for vertices; u, v … for edges.')); if (TD.files?.data?.of(key)) await TD.files.data.unlink(key); return; }
    let name = r.name;
    if (E.files[name] != null && E.files[name] !== r.text) { let k = 2; const base = name.replace(/\.csv$/i, ''); while (E.files[`${base}-${k}.csv`] != null) k++; const to = `${base}-${k}.csv`; if (linked(name)) await TD.files.data.move(linkKey(name), linkKey(to)); name = to; }
    if (E !== cur) return;
    edit(() => {
      ensureEnv();
      E.files[name] = r.text;
      if (isEdges) E.M.items.push({ k: 'es', o: [], file: name });
      else E.M.items.splice(insertVertexAt(), 0, { k: 'vs', o: [], file: name });
    });
    fit();
    stageNote.flash(uiText('editor.network.added', '{name}: {n} rows', { name, n: T.rows.length }), 2000);
  }
  // read a linked file again: when it changed on disk, and was changed here too, ask which to keep
  async function reloadFile(name: string, ask: boolean) {
    if (!linked(name) || !E) return;
    const cur = E, key = linkKey(name), r = await TD.files.data.look(key, ask);
    if (E !== cur) return;
    if (r.state === 'changed') {
      if (E.edited.has(name)) {
        const c = await TD.ask(uiText('editor.network.bothChanged', '{name} changed on disk and here', { name }), uiText('editor.network.bothChangedMsg', 'Read the file from disk, losing the changes made here, or keep the ones made here?'), { ok: uiText('editor.network.useDisk', 'Use Disk'), alt: uiText('editor.network.keepHere', 'Keep These') });
        if (c !== 'ok' || E !== cur) return;
      }
      begin(); E.files[name] = r.text; E.edited.delete(name); commit(); await TD.files.data.mark(key, r.text!);
      if (E !== cur) return;
      draw(); renderProps();
      stageNote.flash(uiText('editor.network.reread', '{name} read in again: it changed on disk', { name }), 2400);
    } else if (ask) {
      stageNote.flash(r.state === 'same' ? uiText('editor.network.unchanged', '{name} is as on disk', { name }) : r.state === 'missing' ? uiText('editor.network.missing', '{name} isn\'t where it was on disk', { name }) : uiText('editor.network.noAccess', 'No access to {name}', { name }), 2000);
    }
  }
  async function writeFile(name: string, force = false) {
    if (!linked(name) || !E) return;
    const cur = E, r = await TD.files.data.write(linkKey(name), E.files[name] || '', force);
    if (E !== cur) return;
    if (r === 'changed') {
      const c = await TD.ask(uiText('editor.network.diskNewer', '{name} changed on disk since it was read', { name }), uiText('editor.network.diskNewerMsg', 'Write the version here over it, or keep the file on disk as it is?'), { ok: uiText('editor.network.overwrite', 'Write Over It'), alt: uiText('editor.network.keepDisk', 'Keep the File') });
      if (c === 'ok' && E === cur) return writeFile(name, true);
      return;
    }
    if (r === 'saved') { E.edited.delete(name); renderProps(); stageNote.flash(uiText('editor.network.written', '{name} written to disk', { name }), 1800); }
    else stageNote.flash(uiText('editor.network.noAccess', 'No access to {name}', { name }), 2000);
  }
  // a CSV file's rows as text, edited in a dialog
  async function editCsv(name: string) {
    const cur = E, t = await TD.prompt(uiText('editor.network.editRowsTitle', 'Rows of {name}', { name }), E.files[name] ?? '', { multiline: true, message: uiText('editor.network.editRowsMsg', 'A header row, then one row per line, the values separated by commas'), ok: uiText('ui.done', 'Done') });
    if (t == null || !cur || E !== cur || t === E.files[name]) return;
    begin(); E.files[name] = t.endsWith('\n') ? t : t + '\n'; E.edited.add(name); commit(); clampSel(); draw(); renderProps();
  }
  // a picture for the selected plane(s): read in, kept in the block like the CSV files, its name in image=
  function addImage() {
    const cur = E, inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f || !cur || E !== cur) return;
      const rd = new FileReader();
      rd.onload = () => {
        if (E !== cur) return;
        let name = (String(f.name).replace(/[^\w.-]+/g, '-') || 'plane.png');
        if (E.files[name] != null && E.files[name] !== rd.result) { const base = name.replace(/\.\w+$/, ''), ext = /\.\w+$/.exec(name)?.[0] || '.png'; let k = 2; while (E.files[`${base}-${k}${ext}`] != null) k++; name = `${base}-${k}${ext}`; }
        edit(() => { E.files[name] = String(rd.result); for (const q of ents()) q.set('image', name); });
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  }
  async function unlinkFile(name: string) { const cur = E; if (!cur) return; await TD.files.data.unlink(linkKey(name)); if (E === cur) renderProps(); }
  function removeFile(name: string) { edit(() => { delete E.files[name]; E.edited.delete(name); }); }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      items: items.map(([k, label, , key]: any) => ({
        id: k, label: ITEM[k].short ? caption(ITEM[k].short) : caption(label), title: caption(ITEM[k].title || label), key,
        alt: label.fallback, keywords: `${k.slice(2)} ${caption(cat)} ${cat.fallback}`,
        svg: fitMini(TD.networkMini(ITEM[k].mini, 1e3), 64, 40, 1.6), on: !!E && k === `e:${E.kind}`,
      })),
    })), { armed: E?.arm });
  }
  paletteDrag(list, {
    keyboard: true,
    drags: (k) => k[0] === 'v' || k[0] === 't' || k[0] === 'p',
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: placeCm(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) { const [x, y] = placeCm(e, !e.altKey, d.k[0]); place(d.k, x, y); }
      E.hover = null; draw();
    },
  });
  function place(k: string, x: number, y: number) {
    if (k[0] === 'v') addVertex(k, x, y);
    else if (k[0] === 't') addText(x, y);
    else if (k[0] === 'p') addPlane(x, y);
  }
  // click: a vertex kind reshapes the selected vertex or is armed for placing; an edge kind restyles the selected edge
  // and is the kind new ones get; a loop goes on the selected vertex, or is armed; text and planes are armed
  function pick(k: string) {
    const en = selEnt(), s = E.sel;
    if (k[0] === 'e') {
      if (E.arm) { E.arm = null; draw(); }
      E.kind = k.slice(2);
      if (s && s.k === 'e' && en && en.a !== en.b) edit(() => { const o = EDGE_OPTS[E.kind]; if (E.kind === 'via') { if (!getOpt(en.item.o, 'path')) { en.set('bend', null); routeVia(en.item); } return; } en.set('Direct', o.includes('Direct')); en.set('bend', o.some((x) => x.startsWith('bend')) ? '30' : null); });
      buildPalette();
      setTip(s && s.k === 'e' ? '' : uiText('editor.network.edgeTip', '{name}: point at a vertex, then drag its blue handle to another vertex (or back onto itself for a loop)', { name: caption(ITEM[k].name) }));
      return;
    }
    if (k[0] === 'l') {
      const lp = k.slice(2);
      if (s && s.k === 'e' && en && en.a === en.b) { edit(() => en.set('loopposition', lp === '0' ? null : lp)); return; }
      if (s && s.k === 'v' && !E.arm) { addEdge(en.id, en.id, lp === '0' ? [] : [`loopposition=${lp}`]); return; }
    } else if (k[0] === 'v' && s && s.k === 'v' && en && !E.arm) { edit(() => { if (k === 'v:pseudo') en.set('Pseudo', true); else setShape(en, k.slice(2) === 'circle' ? '' : k.slice(2)); }); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? (k[0] === 'l' ? uiText('editor.network.armLoopTip', '{name}: click a vertex to give it a loop. Esc when done.', { name: caption(ITEM[k].name) }) : uiText('editor.network.armTip', '{name}: click the grid to place it. Esc when done.', { name: caption(ITEM[k].name) })) : '');
  }
  function setTip(t: string) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 600], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  const m = (x: number, y: number) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k]; // cm (y up) → screen
  const toCm = (e: any, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snap((x - v.ox) / v.k, snapOn), snap((v.oy - y) / v.k, snapOn)]; };
  const S = (x: number, y: number) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k]; // layout px (y down) → screen
  const kk = () => E.view.k / PX;
  // a focused layer (the layer selector): only what lies on it can be clicked; the rest is faded
  const focusZ = () => (E && E.focus && E.layer != null ? (E.layer - 1) * lay().S.LD : null);
  const zIn = (z: any, F: number | null) => F == null || (z != null && Math.abs(z - F) < 1e-9);
  // an edge is on a layer when either end is (so an edge between two layers can be clicked from both)
  const edgeIn = (ed: any, F: number | null) => { const L = lay(); return F == null || [ed.a, ed.b].some((id: string) => zIn(L.nodes.get(id)?.layer, F)); };
  // `any`: every vertex, focused or not (an edge being drawn may end on another layer)
  function vertexAt(e: any, px = 8, any = false) {
    const L = lay(), [x, y] = pos(e), F = any ? null : focusZ();
    let best: string | null = null, bd = Infinity;
    for (const [id, n] of L.nodes) {
      if (!n.src && !n.pseudo) continue;
      if (!zIn(n.layer, F)) continue;
      const [X, Y] = S(n.px, n.py), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, n.r * kk() + 3) && d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function edgeAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e), F = focusZ();
    let best: any = null, bd = px;
    for (const ed of L.edges) {
      if (!edgeIn(ed, F)) continue;
      if (ed.label) { const [X, Y] = S(ed.label.x, ed.label.y), r = (ed.label.r || 6) * kk() + 2; if (Math.hypot(x - X, y - Y) <= r) return ed; }
      const p = ed.P.pts;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = S(p[i - 1][0], p[i - 1][1]), [bx, by] = S(p[i][0], p[i][1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = ed; }
      }
    }
    return best;
  }
  function textAt(e: any) {
    const L = lay(), [x, y] = pos(e), F = focusZ();
    for (let i = L.texts.length - 1; i >= 0; i--) { const T = L.texts[i]; if (!zIn(T.layer, F)) continue; const [X, Y] = S(T.label.x, T.label.y), hw = T.label.hw * kk(), hh = T.label.hh * kk(); if (Math.abs(x - X) <= hw && Math.abs(y - Y) <= hh) return T; }
    return null;
  }
  function planeAt(e: any) {
    const L = lay(), [x, y] = pos(e), F = focusZ();
    for (let i = L.planes.length - 1; i >= 0; i--) {
      if (!zIn(L.planes[i].layer, F)) continue;
      const P = L.planes[i].pts.map((p: number[]) => S(p[0], p[1]));
      let inside = false;
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > y) !== (P[b][1] > y) && x < ((P[b][0] - P[a][0]) * (y - P[a][1])) / (P[b][1] - P[a][1]) + P[a][0]) inside = !inside;
      if (inside) return L.planes[i];
    }
    return null;
  }
  // what is under the pointer, as a selection
  function hit(e: any) {
    const L = lay(), v = vertexAt(e);
    if (v) { const n = L.nodes.get(v); if (n.src) return { k: 'v', i: n.src.item, file: n.src.file, row: n.src.row, id: v }; }
    const ed = edgeAt(e);
    if (ed) return { k: 'e', i: ed.src.item, file: ed.src.file, row: ed.src.row };
    const t = textAt(e);
    if (t) return { k: 't', i: t.src.item };
    const p = planeAt(e);
    if (p) return { k: 'p', i: p.src.item };
    return null;
  }
  function fit() {
    const L = lay();
    E.view = fitView(rect(), L.empty ? { x: 0, y: -2 * PX, w: 4 * PX, h: 2 * PX } : L.bb, { scale: PX, margin: 0.5, min: 20, max: 160 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  // a vertex's ring (r and transform), `gap` px clear of it all round: upright, a circle; on a layer of a 3D picture,
  // drawn through the vertex's own map (its m: page, y up) about (X, Y), so it lies in the layer's plane, its line 1px
  function ring(n: any, X: number, Y: number, gap: number) {
    const m = n.m, K = kk(), R = Math.max(1, n.r * K);
    if (!m || (Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[0] - m[3]) < 1e-9)) return ` r="${r2(Math.max(4, R + gap))}"`;
    // the map's smallest stretch: the gap is kept along the ellipse's short axis too
    const det = Math.abs(m[0] * m[3] - m[1] * m[2]) || 1, a = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] + m[3] * m[3], smin = Math.sqrt(Math.max(1e-6, (a - Math.sqrt(Math.max(0, a * a - 4 * det * det))) / 2));
    const local = R / Math.sqrt(det) + gap / smin, f = (v: number) => Math.round(v * 1e4) / 1e4;
    return ` r="${r2(local)}" transform="translate(${r2(X)} ${r2(Y)}) matrix(${f(m[0])} ${f(-m[2])} ${f(-m[1])} ${f(m[3])} 0 0) translate(${r2(-X)} ${r2(-Y)})" vector-effect="non-scaling-stroke"`;
  }
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view;
    // the grid and its origin on the plane things are placed on (in a 3D picture, a layer in perspective)
    let out = planeGrid(gridPlane(), W, H, { steps: [GRID, 1] });
    const L = lay(), K = kk(), g = `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${K})">`, s = E.sel;
    const all = sels(), selV = new Set(all.filter((x: any) => x.k === 'v').map((x: any) => x.id));
    // the selected edges, as a halo under the drawing
    for (const x of all.filter((y: any) => y.k === 'e')) { const ed = L.edges.find((q: any) => same(q.src, x)); if (ed) out += `${g}<path class="ze-wsel" d="${ed.P.pts.map((p: number[], i: number) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('')}" stroke-width="${r2(10 / K)}"/></g>`; }
    if (!L.empty) out += `${g}${N.draw({ type: 'network', x: L.bb.x, y: L.bb.y, src: code(), files: E.files }, { paper: PAPER, export: true, focus: focusZ() })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(uiText('editor.network.empty', 'Place a vertex from the left to start'))}</text>`;
    for (const x of all.filter((y: any) => y.k === 'p')) {
      const p = L.planes.find((q: any) => q.src.item === x.i);
      if (!p) continue;
      const P = p.pts.map((q: number[]) => S(q[0], q[1]));
      out += `<path class="fy-vsel" d="${P.map(([X, Y]: number[], i: number) => `${i ? 'L' : 'M'}${r2(X)},${r2(Y)}`).join('')}Z" fill-opacity="0.15"/>`;
      // the plane alone selected: its corners resize it
      if (all.length === 1) P.forEach(([X, Y]: number[], c: number) => { out += `<rect class="cz-h nw-corner" data-c="${c}" x="${r2(X - 4)}" y="${r2(Y - 4)}" width="8" height="8"/>`; });
    }
    for (const x of all.filter((y: any) => y.k === 't')) { const T = L.texts.find((q: any) => q.src.item === x.i); if (T) { const [X, Y] = S(T.label.x, T.label.y), hw = T.label.hw * K, hh = T.label.hh * K; out += `<rect class="fy-vsel" x="${r2(X - hw)}" y="${r2(Y - hh)}" width="${r2(2 * hw)}" height="${r2(2 * hh)}" rx="3" fill-opacity="0.15"/>`; } }
    if (E.drag && E.drag.mode === 'box') { const d = E.drag; out += `<rect class="marquee" x="${r2(Math.min(d.sx, d.x))}" y="${r2(Math.min(d.sy, d.y))}" width="${r2(Math.abs(d.x - d.sx))}" height="${r2(Math.abs(d.y - d.sy))}"/>`; }
    const dragE = E.drag && E.drag.mode === 'edge', armLoop = E.arm && E.arm[0] === 'l';
    for (const [id, n] of L.nodes) {
      if (!n.src) continue;
      const [X, Y] = S(n.px, n.py);
      // a hidden (Pseudo) vertex isn't drawn, so the editor marks where it is: a dashed ring (not exported)
      if (n.pseudo && zIn(n.layer, focusZ())) out += `<circle class="nw-ghost" cx="${r2(X)}" cy="${r2(Y)}"${ring(n, X, Y, 0)}/>`;
      // the ring lies as the vertex does: on a layer of a 3D picture, in its plane (an ellipse), its line kept 1px
      if (selV.has(id)) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}"${ring(n, X, Y, 4)}/>`;
      else if (dragE && E.hover && E.hover.v === id) out += `<circle class="fy-vtarget" cx="${r2(X)}" cy="${r2(Y)}"${ring(n, X, Y, 4)}/>`;
      else if (E.hover && E.hover.v === id && (!E.drag || armLoop)) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}"${ring(n, X, Y, 3)}/>`;
    }
    // an edge being drawn
    if (dragE) {
      const d = E.drag, n = L.nodes.get(d.from);
      if (n) {
        const [x0, y0] = S(n.px, n.py);
        if (E.hover && E.hover.v === d.from) {
          const rr = n.r * K + 4;
          out += `<path class="ze-draft" d="M${r2(x0 + rr * 0.92)},${r2(y0 - rr * 0.4)}C${r2(x0 + rr * 2.6)},${r2(y0 - rr)} ${r2(x0 + rr * 2.6)},${r2(y0 + rr)} ${r2(x0 + rr * 0.92)},${r2(y0 + rr * 0.4)}"/>`;
        } else {
          const tn = E.hover && E.hover.v ? L.nodes.get(E.hover.v) : null, t = tn ? S(tn.px, tn.py) : m(...((E.hover && E.hover.at ? E.hover.at : d.at) as [number, number]));
          out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(t[0])},${r2(t[1])}"/>`;
          if (!tn) out += `<circle class="cz-snap on" cx="${r2(t[0])}" cy="${r2(t[1])}" r="5"/>`;
        }
      }
    }
    // the knob: a selected (or hovered) vertex's handle for drawing edges, in the widest gap between its edges
    const knId = !E.drag && !E.arm && !E.ghost && (E.knobAt || (all.length === 1 && s && s.k === 'v' && s.id));
    const kn = knId && L.nodes.get(knId);
    E.knobPos = null;
    if (kn) {
      const dirs: number[] = [];
      for (const ed of L.edges) {
        const p = ed.P.pts;
        if (p.length < 2) continue;
        if (ed.a === knId) dirs.push(Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]));
        if (ed.b === knId) { const q = p.length; dirs.push(Math.atan2(p[q - 2][1] - p[q - 1][1], p[q - 2][0] - p[q - 1][0])); }
      }
      let ang = 0;
      if (dirs.length) {
        let best = -1;
        for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI, gap = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))))); if (gap > best + 1e-6) { best = gap; ang = a; } }
      }
      const [X, Y] = S(kn.px, kn.py), off = Math.max(4, kn.r * K) + 12, kx = r2(X + off * Math.cos(ang)), ky = r2(Y + off * Math.sin(ang));
      E.knobPos = { v: knId, X, Y, kx, ky };
      out += `<g class="ze-knob" data-v="${esc(knId)}"><title>${esc(uiText('editor.network.knob', 'Drag to another vertex to draw an edge, or back onto this one for a loop'))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    if ((E.arm && !armLoop && E.hover && E.hover.at) || (E.ghost && E.hover && E.hover.at)) { const [X, Y] = m(...(E.hover.at as [number, number])); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm && !armLoop);
  }

  // ---------------------------------------------------------------- pointer
  // where an item is now (its x and y), for a drag: from the code, or from where it is drawn
  function xyOf(en: any) { return [parseFloat(getOpt(en.o, 'x') || '0') || 0, parseFloat(getOpt(en.o, 'y') || '0') || 0]; }
  const isSel = (h: any) => sels().some((x: any) => x.k === h.k && x.i === h.i && (x.row ?? null) === (h.row ?? null));
  // a plane's x, y, width and height (its canvas's units) and its z
  function planeBox(en: any) {
    const L = lay(), num0 = (k: string, d: number) => { const v = parseFloat(getOpt(en.o, k) ?? ''); return isFinite(v) ? v : d; };
    return { x: num0('x', 0), y: num0('y', 0), w: num0('width', parseFloat(String(L.S.PW)) || 5), h: num0('height', parseFloat(String(L.S.PH)) || 5), z: (num0('layer', 1) - 1) * L.S.LD };
  }
  // the pointer as a point of the canvas at z (its units)
  function canvasAt(e: any, z: number, snapOn: boolean) {
    const L = lay(), [cx, cy] = toCm(e, false), [u, v] = toUnits('p', true, cx * CM - L.k * z * L.Z[0], cy * CM - L.k * z * L.Z[1]);
    return [snap(u, snapOn), snap(v, snapOn)];
  }
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    try { svg.setPointerCapture(e.pointerId); } catch { /* not tracked */ }
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'edge', from: kb.dataset.v, at: toCm(e), cx: e.clientX, cy: e.clientY }; E.knobAt = null; return; }
    // a selected plane's corner: resized from the opposite one, on its canvas
    const cn = e.target.closest('.nw-corner');
    if (cn && E.sel && E.sel.k === 'p') { const en = ent(E.sel), B = planeBox(en); E.drag = { mode: 'corner', c: Number(cn.dataset.c), B, moved: false }; return; }
    const vid = vertexAt(e);
    if (E.arm && E.arm[0] === 'l') { if (vid) { const lp = E.arm.slice(2); addEdge(vid, vid, lp === '0' ? [] : [`loopposition=${lp}`]); } return; }
    if (E.arm) { const [x, y] = placeCm(e, !e.altKey, E.arm[0]); place(E.arm, x, y); return; }
    const h = hit(e);
    if (h) {
      // ⇧: added to the selection, or taken out of it
      if (e.shiftKey) {
        if (isSel(h)) { const rest = sels().filter((x: any) => !(x.k === h.k && x.i === h.i && (x.row ?? null) === (h.row ?? null))); E.sel = rest[0] || null; E.more = rest.slice(1); }
        else if (E.sel) E.more = [...(E.more || []), h]; else { E.sel = h; E.more = []; }
        E.drag = null; draw(); renderProps(); return;
      }
      const wasSel = E.sel && E.sel.k === h.k && E.sel.i === h.i && (E.sel.row ?? null) === (h.row ?? null);
      if (dbl && wasSel && h.k !== 'p') { editLabel(h); return; }
      if (!isSel(h)) { E.sel = h; E.more = []; }
      else if (!wasSel) { const rest = sels().filter((x: any) => !(x.k === h.k && x.i === h.i && (x.row ?? null) === (h.row ?? null))); E.sel = h; E.more = rest; }
      if (!wasSel) followLayer(h);
      // what moves: the vertices, texts and planes selected, the one under the pointer leading (it snaps)
      const L = lay(), group = sels().filter((x: any) => x.k === 'v' || x.k === 't' || x.k === 'p').map((x: any) => {
        const en = ent(x);
        if (!en) return null;
        const layered = x.k === 'p' ? true : !!getOpt(en.o, 'layer') || (x.k === 'v' && !!L.nodes.get(x.id)?.canvas);
        const z = x.k === 'p' ? planeBox(en).z : x.k === 'v' ? L.nodes.get(x.id)?.layer ?? 0 : (parseFloat(getOpt(en.o, 'layer') || '1') - 1) * L.S.LD;
        return { sel: x, xy0: xyOf(en), layered, z: layered ? z : 0 };
      }).filter(Boolean);
      E.drag = group.length && (h.k === 'v' || h.k === 't' || h.k === 'p') ? { mode: 'move', group, sx, sy, moved: false } : null;
      draw(); renderProps(); return;
    }
    if (e.shiftKey) { E.drag = { mode: 'box', sx, sy, x: sx, y: sy, keep: sels() }; return; }
    E.sel = null; E.more = []; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const vid = vertexAt(e, 14), kb = e.target.closest('.ze-knob');
      const h = E.arm && E.arm[0] !== 'l' ? { at: placeCm(e, !e.altKey) } : vid ? { v: vid } : null;
      const kp = E.knobPos, onWay = (() => {
        if (!kp || kp.v !== E.knobAt) return false;
        const dx = kp.kx - kp.X, dy = kp.ky - kp.Y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - kp.X) * dx + (sy - kp.Y) * dy) / l2));
        return Math.hypot(kp.X + dx * t - sx, kp.Y + dy * t - sy) <= 12;
      })();
      const knob = vid || (kb || onWay ? E.knobAt : null);
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.dataset.cursor = E.arm ? (E.arm[0] === 'l' && vid ? 'copy' : '') : vertexAt(e) || textAt(e) ? 'move' : edgeAt(e) ? 'pointer' : planeAt(e) ? 'move' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'edge') {
      const vid = vertexAt(e, 14, true);
      E.hover = vid ? { v: vid } : { at: placeCm(e, !e.altKey) };
      setTip(vid === d.from ? uiText('editor.network.loopAt', 'Loop at {name}', { name: vid || '' }) : vid ? uiText('editor.network.edgeTo', 'Edge to {name}', { name: vid }) : uiText('editor.network.dropTip', 'Drop on a vertex, or on the grid for a new one'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); d.moved = true; }
      // the pointer's move on the page (pt, y up), as a move of the leading item's x and y (snapped); the others
      // move as far on the page
      const dpx = ((sx - d.sx) / E.view.k) * CM, dpy = (-(sy - d.sy) / E.view.k) * CM, free = e.altKey;
      const lead = d.group.find((g: any) => g.sel === E.sel) || d.group[0];
      const [du, dv] = toUnits(lead.sel.k, lead.layered, dpx, dpy);
      const x = snap(lead.xy0[0] + du, !free), y = snap(lead.xy0[1] + dv, !free);
      const page = N.mul(placeMap(lead.sel.k, lead.layered), [x - lead.xy0[0], y - lead.xy0[1]]);
      for (const g of d.group) {
        const en = ent(g.sel);
        if (!en) continue;
        if (g === lead) { en.set('x', N.num(x)); en.set('y', N.num(y)); continue; }
        const [gu, gv] = toUnits(g.sel.k, g.layered, page[0], page[1]);
        en.set('x', N.num(snap(g.xy0[0] + gu, false))); en.set('y', N.num(snap(g.xy0[1] + gv, false)));
      }
      E.M.dirty = true;
      setTip(free ? uiText('editor.network.atFree', '({x}, {y})', { x: N.num(x), y: N.num(y) }) : uiText('editor.network.at', '({x}, {y}) · ⌥ to place freely', { x: N.num(x), y: N.num(y) }));
      draw(); return;
    }
    if (d.mode === 'corner') {
      if (!d.moved) { begin(); d.moved = true; }
      const B = d.B, corners = [[B.x, B.y], [B.x + B.w, B.y], [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], o = corners[(d.c + 2) % 4];
      const [u, v] = canvasAt(e, B.z, !e.altKey), en = ent(E.sel);
      if (!en) return;
      const nx = Math.min(u, o[0]), ny = Math.min(v, o[1]), w = Math.abs(u - o[0]), hh = Math.abs(v - o[1]);
      if (w < 0.1 || hh < 0.1) return;
      en.set('x', N.num(r3(nx))); en.set('y', N.num(r3(ny))); en.set('width', N.num(r3(w))); en.set('height', N.num(r3(hh)));
      E.M.dirty = true; setTip(`${N.num(r3(w))} × ${N.num(r3(hh))}`); draw(); return;
    }
    if (d.mode === 'box') { d.x = sx; d.y = sy; draw(); return; }
  });
  const up = (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'edge') {
      if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) { setTip(''); E.hover = null; draw(); return; }
      setTip('');
      const vid = vertexAt(e, 14, true);
      E.hover = null;
      if (vid) addEdge(d.from, vid);
      else if (overStage(e)) {
        const [x, y] = placeCm(e, !e.altKey);
        begin();
        const id = newId(), [ux, uy] = placeAt('v', x, y), ed = { k: 'e', a: d.from, b: id, o: EDGE_OPTS[E.kind].slice() };
        E.M.items.splice(insertVertexAt(), 0, { k: 'v', id, o: [`x=${N.num(ux)}`, `y=${N.num(uy)}`, ...onLayer(), 'IdAsLabel'] });
        E.M.items.push(ed); routeVia(ed);
        sortLayers(); E.M.dirty = true; commit();
        E.sel = { k: 'e', i: E.M.items.indexOf(ed) }; E.more = []; renderProps(); draw();
      }
      draw(); return;
    }
    if ((d.mode === 'move' || d.mode === 'corner') && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    if (d.mode === 'box') {
      // what lies in the box (by its centre) joins what was selected
      const L = lay(), x0 = Math.min(d.sx, d.x), x1 = Math.max(d.sx, d.x), y0 = Math.min(d.sy, d.y), y1 = Math.max(d.sy, d.y), inBox = (X: number, Y: number) => X >= x0 && X <= x1 && Y >= y0 && Y <= y1;
      const got: any[] = [...d.keep];
      const F = focusZ();
      for (const [id, n] of L.nodes) { const [X, Y] = S(n.px, n.py); if (n.src && zIn(n.layer, F) && inBox(X, Y)) got.push({ k: 'v', i: n.src.item, file: n.src.file, row: n.src.row, id }); }
      for (const T of L.texts) { const [X, Y] = S(T.label.x, T.label.y); if (zIn(T.layer, F) && inBox(X, Y)) got.push({ k: 't', i: T.src.item }); }
      for (const P of L.planes) { const c = P.pts.reduce((a: number[], p: number[]) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]), [X, Y] = S(c[0], c[1]); if (zIn(P.layer, F) && inBox(X, Y)) got.push({ k: 'p', i: P.src.item }); }
      const uniq = got.filter((g, j) => got.findIndex((x) => x.k === g.k && x.i === g.i && (x.row ?? null) === (g.row ?? null)) === j);
      E.sel = uniq[0] || null; E.more = uniq.slice(1); renderProps();
    }
    draw();
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', (e: any) => { if (E?.drag?.mode === 'edge') { E.drag = null; E.hover = null; setTip(''); draw(); } else up(e); }); // a cancelled drag ends as a release, with no new edge where it was let go
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the item's actions
  const MI: Record<string, IconName> = { label: 'edit', del: 'delete', straight: 'straight', rev: 'reverse', left: 'bendLeft', right: 'bendRight', loop: 'loop', direct: 'arrow' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: act === 'delete' });
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const h = hit(e);
    if (!h) return;
    // on what is selected: the selection stays (Arrange and Delete act on all of it), the item under the pointer first
    if (isSel(h)) { const rest = sels().filter((x: any) => !(x.k === h.k && x.i === h.i && (x.row ?? null) === (h.row ?? null))); E.sel = h; E.more = rest; }
    else { E.sel = h; E.more = []; }
    const en = ent(h);
    let rows: MenuEntry[] = [];
    if (h.k === 'v') rows = [mItem('label', uiText('editor.network.editLabel', 'Edit Label'), 'label', '↩'), mItem('addloop', uiText('editor.network.addLoop', 'Add Loop'), 'loop', 'L'), '-', mItem('delete', uiText('editor.network.deleteVertex', 'Delete Vertex'), 'del', '⌫')];
    else if (h.k === 'e') {
      const loop = en.a === en.b, dir = flag(en.o, 'Direct');
      rows = [mItem('label', uiText('editor.network.editLabel', 'Edit Label'), 'label', '↩'), mItem('direct', dir ? uiText('editor.network.makeUndirected', 'Make Undirected') : uiText('editor.network.makeDirected', 'Make Directed'), 'direct', 'D'),
        ...(loop ? [] : [mItem('rev', uiText('editor.network.reverse', 'Reverse Direction'), 'rev'), '-' as const, mItem('bleft', uiText('editor.network.bendLeft', 'Bend Left'), 'left'), mItem('bright', uiText('editor.network.bendRight', 'Bend Right'), 'right'), mItem('bnone', uiText('editor.network.straight', 'Straight'), 'straight')]),
        '-', mItem('delete', loop ? uiText('editor.network.deleteLoop', 'Delete Loop') : uiText('editor.network.deleteEdge', 'Delete Edge'), 'del', '⌫')];
    } else if (h.k === 't') rows = [mItem('label', uiText('editor.network.editText', 'Edit Text'), 'label', '↩'), '-', mItem('delete', uiText('editor.network.deleteText', 'Delete Text'), 'del', '⌫')];
    else rows = [mItem('delete', uiText('editor.network.deletePlane', 'Delete Plane'), 'del', '⌫')];
    // the order they are painted in, among what lies on the same layer (not for a row of a data file)
    if (h.file == null) {
      const arrange = menuRow('', uiText('ctx.arrange', 'Arrange'), 'arrange', undefined, { sub: [
        menuRow('front', uiText('ctx.front', 'Bring to Front'), null, 'Ctrl+Shift+]'), menuRow('forward', uiText('ctx.forward', 'Bring Forward'), null, 'Ctrl+]'),
        menuRow('backward', uiText('ctx.backward', 'Send Backward'), null, 'Ctrl+['), menuRow('back', uiText('ctx.back', 'Send to Back'), null, 'Ctrl+Shift+['),
      ] });
      const at = rows.lastIndexOf('-');
      rows.splice(at < 0 ? rows.length - 1 : at, 0, '-', arrange);
    }
    draw(); renderProps();
    openEditorMenu(e, rows, (a: string) => act(a));
  });

  // ---------------------------------------------------------------- label editor
  // A floating box under the vertex, edge or text (TD.input.popup); the whole edit is one undo step. A label with Math
  // set is edited as maths; otherwise as text, $maths$ in it.
  let Lb: any = null;
  function editLabel(target: any) {
    if (!TD.input || !target) return false;
    closeLabel();
    const en = ent(target);
    if (!en || target.k === 'p') return false;
    begin();
    const me: any = (Lb = { target });
    const math = target.k !== 't' && flag(en.o, 'Math');
    const text = target.k === 't' ? en.item.text : flag(en.o, 'IdAsLabel') && !getOpt(en.o, 'label') ? en.id : getOpt(en.o, 'label') || '';
    me.pop = TD.input.popup(stage, {
      text, math, bare: math,
      at: () => labelPos(target),
      onInput: (t: string) => {
        const e2 = ent(target);
        if (!e2) return;
        if (target.k === 't') e2.item.text = t.replace(/\n/g, ' \\\\ ');
        else { e2.set('label', t ? t : null); if (target.k === 'v') e2.set('IdAsLabel', false); }
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target: any) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    let X = 0, Y = 0;
    if (target.k === 'v') { const n = L.nodes.get(target.id); if (n) { [X, Y] = S(n.px, n.py); Y += Math.max(6, n.r * kk()) + 10; } }
    else if (target.k === 'e') { const ed = L.edges.find((x: any) => same(x.src, target)); if (ed) { const q = ed.label || ed.P.pts[Math.floor(ed.P.pts.length / 2)]; [X, Y] = S(q.x ?? q[0], q.y ?? q[1]); Y += 14; } }
    else { const T = L.texts.find((x: any) => x.src.item === target.i); if (T) { [X, Y] = S(T.label.x, T.label.y); Y += T.label.hh * kk() + 8; } }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }

  // ---------------------------------------------------------------- properties
  // Every key tikz-network reads, for what is selected (one item, or several of a kind: a field then sets them all),
  // and with nothing selected the picture: multilayer and its 3D axes (\SetCoordinates), the layer distance, units,
  // where edges go, the default styles (\SetVertexStyle …), the layer new items go on, auto layout, data files and an
  // outline of what the code holds that can't be clicked on the stage (\Vertices, \Edges, Layer environments …).
  const FONT_NAMES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];
  const fontOpts = () => [['', uiText('editor.network.default', 'Default')], ...FONT_NAMES.map((f) => ['\\' + f, f])];
  const dirOpts = (centre: string) => [['', centre], ['above', uiText('editor.network.above', 'Above')], ['below', uiText('editor.network.below', 'Below')], ['left', uiText('editor.network.left', 'Left')], ['right', uiText('editor.network.right', 'Right')],
    ['above left', uiText('editor.network.aboveLeft', 'Above left')], ['above right', uiText('editor.network.aboveRight', 'Above right')], ['below left', uiText('editor.network.belowLeft', 'Below left')], ['below right', uiText('editor.network.belowRight', 'Below right')]];
  const shapeOpts = () => [['', uiText('editor.network.circle', 'Circle')], ['rectangle', uiText('editor.network.square', 'Square')], ['diamond', uiText('editor.network.diamond', 'Diamond')],
    ['regular polygon', uiText('editor.network.pentagon', 'Pentagon')], ['star', uiText('editor.network.star', 'Star')], ['ellipse', uiText('editor.network.ellipse', 'Ellipse')], ['triangle', uiText('editor.network.triangle', 'Triangle')]];
  const colRow = (label: string, key: string, value: string, o: Record<string, any> = {}) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, title: label, defaultLabel: o.dflt ?? uiText('editor.network.default', 'Default'), defaultSwatch: o.sw })), controlClass: 'ctl tc' });
  const choose = (label: string, key: string, value: string, options: any[][]) => row(label, { kind: 'select' as const, attrs: { 'data-f': key }, options, value: options.some((o) => o[0] === value) ? value : options[0][0] });
  const txt = (label: string, key: string, value: string, ph = '') => field(label, key, value, { class: 'mono', placeholder: ph || uiText('editor.commonB.nonePlaceholder', 'none') });
  const num = (label: string, key: string, value: string, unit = '', o: Record<string, any> = {}) => numField(label, key, value, unit, { step: o.step ?? '0.1', ...(o.min != null ? { min: String(o.min) } : {}), ...(o.max != null ? { max: String(o.max) } : {}), placeholder: o.ph ?? '', ...(o.write ? { 'data-unit': o.write } : {}), ...(o.disabled ? { disabled: true } : {}) });
  const flags = (label: string, list: [string, string, string, boolean][]) => switchRow(label, list.map(([k, text, title, on]) => ({ text, title, on, attrs: { 'data-fs': 'flag', 'data-v': k } })), { many: true });
  const sec = (title: string, rows: any[], summary = '') => ({ ...section(title, rows.filter(Boolean), 'sec'), ...(summary ? { summary } : {}) });

  // the selection: one item or several; what a field shows is their common value ('' where they differ)
  const sels = () => [E.sel, ...(E.more || [])].filter(Boolean);
  const ents = () => sels().filter((s: any) => s.k === E.sel?.k).map(ent).filter(Boolean);
  const common = (list: any[], k: string, strip = '') => { const v = list.map((en) => (getOpt(en.o, k) ?? '').replace(strip ? new RegExp(strip + '$') : /$^/, '')); return v.every((x) => x === v[0]) ? v[0] : ''; };
  const allFlag = (list: any[], k: string) => list.every((en) => flag(en.o, k));
  const yes = () => uiText('editor.network.yes', 'Yes'), no = () => uiText('editor.network.no', 'No');

  function vertexRows(list: any[]) {
    const one = list.length === 1 ? list[0] : null, c = (k: string, strip = '') => common(list, k, strip), s = E.sel;
    const n = one && lay().nodes.get(s.id), labelMode = allFlag(list, 'NoLabel') ? 'none' : allFlag(list, 'IdAsLabel') ? 'id' : 'text';
    return [
      sec(list.length > 1 ? uiText('editor.network.nSelected', '{n} vertices', { n: list.length }) : uiText('editor.network.vertex', 'Vertex'), [
        ...(one && s.file != null ? [note(uiText('editor.network.fromFile', 'Row {row} of {file}: edits change that file', { row: s.row + 1, file: s.file })),
          { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.allRows', 'Every Row of the File…'), attrs: { 'data-ne': 'pickitem', 'data-i': String(s.i) } }] }] : []),
        one ? field(uiText('editor.network.id', 'Name'), 'id', s.id, { class: 'mono' }) : null,
        num('x', 'x', c('x'), '', { step: '0.25' }), num('y', 'y', c('y'), '', { step: '0.25' }),
        num(uiText('editor.network.layer', 'Layer'), 'layer', c('layer'), '', { step: '1', min: 1, ph: uiText('editor.commonB.nonePlaceholder', 'none') }),
        ...(n && n.canvas ? [note(uiText('editor.network.onLayer', 'On a layer: x and y are its place on that layer\'s plane'))] : []),
      ], one && s.file == null ? (() => { const d = lay().edges.filter((ed: any) => ed.a === s.id || ed.b === s.id).length; return d === 1 ? uiText('editor.network.oneEdge', '1 edge') : uiText('editor.network.nEdges', '{n} edges', { n: d }); })() : ''),
      sec(uiText('editor.network.look', 'Look'), [
        choose(uiText('editor.network.shape', 'Shape'), 'shape', list.every((en: any) => isTriangle(en.o)) ? 'triangle' : c('shape'), shapeOpts()),
        num(uiText('editor.network.size', 'Size'), 'size', c('size'), 'cm', { step: '0.1', min: 0, ph: '0.6' }),
        colRow(uiText('editor.network.fill', 'Fill'), 'color', list.some((en) => flag(en.o, 'RGB')) ? '' : c('color'), { sw: '#abd7e6' }),
        num(uiText('editor.network.opacity', 'Opacity'), 'opacity', c('opacity'), '', { step: '0.1', min: 0, max: 1, ph: '1' }),
        choose(uiText('editor.network.shading', 'Shading'), 'shading', /shading\s*=\s*ball|ball color/.test(c('style')) ? 'ball' : '', [['', uiText('editor.network.none', 'None')], ['ball', uiText('editor.network.ball', 'Ball')]]),
        txt(uiText('editor.network.style', 'TikZ style'), 'style', c('style'), uiText('editor.network.egDashed', 'e.g. dashed')),
        flags(uiText('editor.network.options', 'Options'), [['Pseudo', uiText('editor.network.hiddenShort', 'Hidden'), uiText('editor.network.pseudoTitle', 'Pseudo: not drawn, but its edges still meet it'), allFlag(list, 'Pseudo')],
          ['RGB', 'RGB', uiText('editor.network.rgbTitle', 'RGB: the colours are written as R,G,B (0–255)'), allFlag(list, 'RGB')]]),
      ]),
      sec(uiText('editor.network.label', 'Label'), [
        segments(uiText('editor.network.shows', 'Shows'), 'labelmode', labelMode, [['id', uiText('editor.network.itsName', 'Its name')], ['text', uiText('editor.network.text', 'Text')], ['none', uiText('editor.network.none', 'None')]]),
        labelMode === 'text' ? field(uiText('editor.network.label', 'Label'), 'label', c('label'), { 'data-tx': allFlag(list, 'Math') ? 'math' : 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }) : null,
        choose(uiText('editor.network.labelAt', 'Label at'), 'position', c('position'), dirOpts(uiText('editor.network.posCentre', 'Centre'))),
        txt(uiText('editor.network.distance', 'Distance'), 'distance', c('distance'), '0pt'),
        choose(uiText('editor.network.fontSize', 'Font size'), 'fontsize', c('fontsize'), fontOpts()),
        colRow(uiText('editor.network.fontColour', 'Font colour'), 'fontcolor', c('fontcolor'), { sw: '#000000' }),
        num(uiText('editor.network.fontScale', 'Font scale'), 'fontscale', c('fontscale'), '×', { step: '0.1', min: 0, ph: '1' }),
        flags(uiText('editor.network.maths', 'Math style'), [['Math', uiText('editor.network.mathsShort', 'Math'), uiText('editor.network.mathTitle', 'Math: the label is set as math'), allFlag(list, 'Math')]]),
      ]),
    ];
  }
  function edgeRows(list: any[]) {
    const one = list.length === 1 ? list[0] : null, c = (k: string, strip = '') => common(list, k, strip), s = E.sel;
    const loops = list.every((en) => en.a === en.b), lines = list.every((en) => en.a !== en.b), labelled = !!c('label') || list.some((en) => getOpt(en.o, 'label'));
    return [
      sec(list.length > 1 ? uiText('editor.network.nSelectedEdges', '{n} edges', { n: list.length }) : loops ? uiText('editor.network.loop', 'Loop') : uiText('editor.network.edge', 'Edge'), [
        ...(one && s.file != null ? [note(uiText('editor.network.fromFile', 'Row {row} of {file}: edits change that file', { row: s.row + 1, file: s.file }))] : []),
        flags(uiText('editor.network.options', 'Options'), [['Direct', uiText('editor.network.arrow', 'Arrow'), uiText('editor.network.directTitle', 'Direct: an arrow at its end'), allFlag(list, 'Direct')],
          ['NotInBG', uiText('editor.network.inFront', 'In front'), uiText('editor.network.notInBgTitle', 'NotInBG: drawn over the vertices, not behind them'), allFlag(list, 'NotInBG')],
          ['RGB', 'RGB', uiText('editor.network.rgbTitle', 'RGB: the colours are written as R,G,B (0–255)'), allFlag(list, 'RGB')]]),
        ...(loops ? [choose(uiText('editor.network.loopSide', 'Loop at'), 'loopposition', c('loopposition'), [['', uiText('editor.network.right', 'Right')], ['90', uiText('editor.network.above', 'Above')], ['180', uiText('editor.network.left', 'Left')], ['270', uiText('editor.network.below', 'Below')], ['45', uiText('editor.network.aboveRight', 'Above right')], ['135', uiText('editor.network.aboveLeft', 'Above left')], ['225', uiText('editor.network.belowLeft', 'Below left')], ['315', uiText('editor.network.belowRight', 'Below right')]]),
          num(uiText('editor.network.loopSize', 'Loop size'), 'loopsize', c('loopsize', 'cm'), 'cm', { step: '0.1', min: 0.1, ph: '1', write: 'cm' }),
          num(uiText('editor.network.loopShape', 'Loop opening'), 'loopshape', c('loopshape'), '°', { step: '5', min: 0, ph: '90' })] : []),
        ...(lines ? [num(uiText('editor.network.bend', 'Bend'), 'bend', c('bend'), '°', { step: '5', ph: '0' }),
          txt(uiText('editor.network.via', 'Through'), 'path', c('path'), uiText('editor.network.viaPh', 'e.g. C,{1,-1}'))] : []),
      ]),
      sec(uiText('editor.network.look', 'Look'), [
        num(uiText('editor.network.width', 'Width'), 'lw', c('lw', 'pt'), 'pt', { step: '0.25', min: 0, ph: '1.5', write: 'pt' }),
        colRow(uiText('editor.network.colour', 'Colour'), 'color', list.some((en) => flag(en.o, 'RGB')) ? '' : c('color'), { sw: '#404040' }),
        num(uiText('editor.network.opacity', 'Opacity'), 'opacity', c('opacity'), '', { step: '0.1', min: 0, max: 1, ph: '1' }),
        txt(uiText('editor.network.style', 'TikZ style'), 'style', c('style'), uiText('editor.network.egDashed', 'e.g. dashed')),
      ]),
      sec(uiText('editor.network.label', 'Label'), [
        field(uiText('editor.network.label', 'Label'), 'label', c('label'), { 'data-tx': allFlag(list, 'Math') ? 'math' : 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }),
        choose(uiText('editor.network.labelAt', 'Label at'), 'position', c('position'), dirOpts(uiText('editor.network.onEdge', 'On'))),
        num(uiText('editor.network.along', 'Along'), 'distance', c('distance'), '', { step: '0.05', min: 0, max: 1, ph: '0.5', disabled: !labelled }),
        choose(uiText('editor.network.fontSize', 'Font size'), 'fontsize', c('fontsize'), fontOpts()),
        colRow(uiText('editor.network.fontColour', 'Font colour'), 'fontcolor', c('fontcolor'), { sw: '#404040' }),
        num(uiText('editor.network.fontScale', 'Font scale'), 'fontscale', c('fontscale'), '×', { step: '0.1', min: 0, ph: '1' }),
        flags(uiText('editor.network.maths', 'Math style'), [['Math', uiText('editor.network.mathsShort', 'Math'), uiText('editor.network.mathTitle', 'Math: the label is set as math'), allFlag(list, 'Math')]]),
      ]),
      ...(one && lines ? [{ kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.reverse', 'Reverse Direction'), attrs: { 'data-ne': 'rev' } }] }] : []),
    ];
  }
  function textRows(list: any[]) {
    const one = list.length === 1 ? list[0] : null, c = (k: string) => common(list, k);
    return [
      sec(list.length > 1 ? uiText('editor.network.nTexts', '{n} texts', { n: list.length }) : uiText('editor.network.text', 'Text'), [
        one ? field(uiText('editor.network.text', 'Text'), 'text', one.item.text, { 'data-tx': 'text' }) : null,
        num('x', 'x', c('x'), '', { step: '0.25' }), num('y', 'y', c('y'), '', { step: '0.25' }),
        num(uiText('editor.network.layer', 'Layer'), 'layer', c('layer'), '', { step: '1', min: 1, ph: uiText('editor.commonB.nonePlaceholder', 'none') }),
        choose(uiText('editor.network.placed', 'Placed'), 'position', c('position'), dirOpts(uiText('editor.network.onPoint', 'On the point'))),
        txt(uiText('editor.network.distance', 'Distance'), 'distance', c('distance'), '0cm'),
        choose(uiText('editor.network.anchor', 'Anchor'), 'anchor', c('anchor'), [['', uiText('editor.network.default', 'Default')], ['center', uiText('editor.network.posCentre', 'Centre')], ['north', uiText('editor.network.top', 'Top')], ['south', uiText('editor.network.bottom', 'Bottom')], ['west', uiText('editor.network.left', 'Left')], ['east', uiText('editor.network.right', 'Right')], ['north west', uiText('editor.network.topLeft', 'Top left')], ['north east', uiText('editor.network.topRight', 'Top right')], ['south west', uiText('editor.network.bottomLeft', 'Bottom left')], ['south east', uiText('editor.network.bottomRight', 'Bottom right')]]),
        txt(uiText('editor.network.width', 'Width'), 'width', c('width'), uiText('editor.network.oneLine', 'one line')),
      ]),
      sec(uiText('editor.network.look', 'Look'), [
        colRow(uiText('editor.network.colour', 'Colour'), 'color', c('color'), { sw: '#000000' }),
        num(uiText('editor.network.opacity', 'Opacity'), 'opacity', c('opacity'), '', { step: '0.1', min: 0, max: 1, ph: '1' }),
        choose(uiText('editor.network.fontSize', 'Font size'), 'fontsize', c('fontsize'), fontOpts()),
        num(uiText('editor.network.rotation', 'Rotation'), 'rotation', c('rotation'), '°', { step: '15', ph: '0' }),
        txt(uiText('editor.network.style', 'TikZ style'), 'style', c('style'), uiText('editor.network.egBox', 'e.g. draw, fill=yellow')),
        flags(uiText('editor.network.options', 'Options'), [['RGB', 'RGB', uiText('editor.network.rgbTitle', 'RGB: the colours are written as R,G,B (0–255)'), allFlag(list, 'RGB')]]),
      ]),
    ];
  }
  function planeRows(list: any[]) {
    const c = (k: string) => common(list, k), image = c('image');
    return [
      sec(list.length > 1 ? uiText('editor.network.nPlanes', '{n} planes', { n: list.length }) : uiText('editor.network.plane', 'Plane'), [
        num('x', 'x', c('x'), '', { step: '0.25', ph: '0' }), num('y', 'y', c('y'), '', { step: '0.25', ph: '0' }),
        num(uiText('editor.network.width', 'Width'), 'width', c('width'), '', { step: '0.25', min: 0, ph: '5' }), num(uiText('editor.network.height', 'Height'), 'height', c('height'), '', { step: '0.25', min: 0, ph: '5' }),
        num(uiText('editor.network.layer', 'Layer'), 'layer', c('layer'), '', { step: '1', min: 1, ph: '1' }),
        note(uiText('editor.network.planeNote', 'A plane lies on its layer\'s canvas (canvas is yx plane): without multilayer=3d its width runs up the page')),
      ]),
      sec(uiText('editor.network.look', 'Look'), [
        colRow(uiText('editor.network.fill', 'Fill'), 'color', list.some((en) => flag(en.o, 'RGB')) ? '' : c('color'), { sw: '#abd7e6' }),
        num(uiText('editor.network.opacity', 'Opacity'), 'opacity', c('opacity'), '', { step: '0.1', min: 0, max: 1, ph: '0.3' }),
        num(uiText('editor.network.grid', 'Grid'), 'grid', c('grid'), '', { step: '0.25', min: 0, ph: uiText('editor.commonB.nonePlaceholder', 'none') }),
        txt(uiText('editor.network.borderStyle', 'Border style'), 'style', c('style'), uiText('editor.network.egDashed', 'e.g. dashed')),
        flags(uiText('editor.network.options', 'Options'), [['NoFill', uiText('editor.network.noFill', 'No fill'), uiText('editor.network.noFillTitle', 'NoFill: only its border and grid'), allFlag(list, 'NoFill')],
          ['NoBorder', uiText('editor.network.noBorder', 'No border'), uiText('editor.network.noBorderTitle', 'NoBorder: no line round it'), allFlag(list, 'NoBorder')],
          ['InBG', uiText('editor.network.behind', 'Behind'), uiText('editor.network.inBgTitle', 'InBG: on the background layer, behind the edges'), allFlag(list, 'InBG')],
          ['RGB', 'RGB', uiText('editor.network.rgbTitle', 'RGB: the colours are written as R,G,B (0–255)'), allFlag(list, 'RGB')]]),
      ]),
      sec(uiText('editor.network.image', 'Picture'), [
        image ? note({ code: image }, E.files[image] != null ? '' : ' · ' + uiText('editor.network.fileMissing', 'not loaded')) : note(uiText('editor.network.noImage', 'No picture on this plane')),
        { kind: 'actions' as const, class: 'row', buttons: [{ text: image ? uiText('editor.network.replaceImage', 'Replace…') : uiText('editor.network.addImage', 'Add Picture…'), attrs: { 'data-ne': 'image' } }, ...(image ? [{ text: uiText('editor.network.remove', 'Remove'), attrs: { 'data-ne': 'noimage', class: 'danger' } }] : [])] },
        image ? flags(uiText('editor.network.options', 'Options'), [['ImageAndFill', uiText('editor.network.andFill', 'With fill'), uiText('editor.network.imageFillTitle', 'ImageAndFill: the fill under the picture too'), allFlag(list, 'ImageAndFill')]]) : null,
      ]),
    ];
  }
  // \Vertices[…]{file} and \Edges[…]{file}: what every row of the file gets (a row's own cells come first)
  function dataRows(it: any) {
    const c = (k: string) => getOpt(it.o, k) ?? '', V = it.k === 'vs';
    const T = E.files[it.file] != null ? N.csv(E.files[it.file]) : null;
    return [
      sec(V ? uiText('editor.network.verticesCmd', 'Vertices from a file') : uiText('editor.network.edgesCmd', 'Edges from a file'), [
        note({ code: it.file }, T ? ` · ${T.rows.length === 1 ? uiText('editor.network.oneRow', '1 row') : uiText('editor.network.nRows', '{n} rows', { n: T.rows.length })} · ${T.head.join(', ')}` : ' · ' + uiText('editor.network.fileMissing', 'not loaded')),
        V ? num(uiText('editor.network.onlyLayer', 'Only layer'), 'layer', c('layer'), '', { step: '1', min: 1, ph: uiText('editor.network.all', 'all') }) : txt(uiText('editor.network.onlyLayers', 'Only layers'), 'layer', c('layer'), uiText('editor.network.layersPh', 'e.g. 1,2')),
        V ? null : txt(uiText('editor.network.vertexFile', 'Vertex file'), 'vertices', c('vertices'), uiText('editor.network.lastRead', 'the last one read')),
        ...(V ? [choose(uiText('editor.network.shape', 'Shape'), 'shape', isTriangle(it.o) ? 'triangle' : c('shape'), shapeOpts()), num(uiText('editor.network.size', 'Size'), 'size', c('size'), 'cm', { step: '0.1', min: 0, ph: uiText('editor.network.fromRows', 'rows') })]
          : [num(uiText('editor.network.width', 'Width'), 'lw', c('lw'), 'pt', { step: '0.25', min: 0, ph: uiText('editor.network.fromRows', 'rows') })]),
        colRow(V ? uiText('editor.network.fill', 'Fill') : uiText('editor.network.colour', 'Colour'), 'color', flag(it.o, 'RGB') ? '' : c('color'), { dflt: uiText('editor.network.fromRows', 'rows') }),
        num(uiText('editor.network.opacity', 'Opacity'), 'opacity', c('opacity'), '', { step: '0.1', min: 0, max: 1, ph: uiText('editor.network.fromRows', 'rows') }),
        txt(uiText('editor.network.style', 'TikZ style'), 'style', c('style'), uiText('editor.network.egDashed', 'e.g. dashed')),
        flags(uiText('editor.network.options', 'Options'), (V ? [['IdAsLabel', uiText('editor.network.namesShort', 'Names'), uiText('editor.network.idAsLabelTitle', 'IdAsLabel: each vertex labelled with its id'), flag(it.o, 'IdAsLabel')], ['NoLabel', uiText('editor.network.noLabels', 'No labels'), uiText('editor.network.noLabelTitle', 'NoLabel: no labels'), flag(it.o, 'NoLabel')],
          ['Math', uiText('editor.network.mathsShort', 'Math'), uiText('editor.network.mathTitle', 'Math: the label is set as math'), flag(it.o, 'Math')], ['Pseudo', uiText('editor.network.hiddenShort', 'Hidden'), uiText('editor.network.pseudoTitle', 'Pseudo: not drawn, but its edges still meet it'), flag(it.o, 'Pseudo')], ['RGB', 'RGB', uiText('editor.network.rgbRowsTitle', 'RGB: the rows\' R, G and B columns give the colour'), flag(it.o, 'RGB')]]
          : [['Direct', uiText('editor.network.arrow', 'Arrow'), uiText('editor.network.directTitle', 'Direct: an arrow at its end'), flag(it.o, 'Direct')], ['NoLabel', uiText('editor.network.noLabels', 'No labels'), uiText('editor.network.noLabelTitle', 'NoLabel: no labels'), flag(it.o, 'NoLabel')], ['Math', uiText('editor.network.mathsShort', 'Math'), uiText('editor.network.mathTitle', 'Math: the label is set as math'), flag(it.o, 'Math')],
            ['NotInBG', uiText('editor.network.inFront', 'In front'), uiText('editor.network.notInBgTitle', 'NotInBG: drawn over the vertices, not behind them'), flag(it.o, 'NotInBG')], ['RGB', 'RGB', uiText('editor.network.rgbRowsTitle', 'RGB: the rows\' R, G and B columns give the colour'), flag(it.o, 'RGB')]]) as any),
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.editRows', 'Edit Rows…'), attrs: { 'data-ne': 'editcsv', 'data-file': it.file } }, { text: uiText('editor.network.deleteCommand', 'Delete'), attrs: { 'data-ne': 'delete', class: 'danger' } }] },
      ]),
    ];
  }
  function layerRows(it: any) {
    return [sec(uiText('editor.network.layerEnv', 'Layer environment'), [
      num(uiText('editor.network.layer', 'Layer'), 'layer', getOpt(it.o, 'layer') ?? '', '', { step: '1', min: 1, ph: '1' }),
      num('z', 'z', getOpt(it.o, 'z') ?? '', '', { step: '0.5', ph: uiText('editor.network.fromLayer', 'from the layer') }),
      num(uiText('editor.network.fillOpacity', 'Fill opacity'), 'opacity', getOpt(it.o, 'opacity') ?? '', '', { step: '0.1', min: 0, max: 1, ph: '1' }),
      note(uiText('editor.network.layerEnvNote', 'What is inside is drawn on that layer\'s canvas: vertices without a layer of their own, and TikZ (\\draw, \\node …)')),
      actionRow('ne', 'delete', uiText('editor.network.deleteLayerEnv', 'Remove Environment (Keep Contents)')),
    ])];
  }
  function rawRows(it: any) {
    return [sec(uiText('editor.network.tikzCode', 'TikZ'), [
      field(uiText('editor.network.code', 'Code'), 'raw', it.s, { class: 'mono' }),
      note(uiText('editor.network.rawNote', 'Drawn as TikZ draws it where DiagramTeX can read it; exported as written')),
      actionRow('ne', 'delete', uiText('editor.network.deleteCode', 'Delete Code')),
    ])];
  }

  // ---- the picture
  // a \Set… command in the code: the first one (at the top of the picture, or before it for \SetCoordinates)
  function setItem(cmd: string, make: boolean) {
    const list = cmd === 'SetCoordinates' ? (E.M.pre = E.M.pre || []) : E.M.items;
    let it = list.find((x: any) => x.k === 'set' && x.cmd === cmd);
    if (!it && make) { it = { k: 'set', cmd, ...(['SetLayerDistance', 'SetDistanceScale', 'SetDefaultUnit', 'SetPlaneWidth', 'SetPlaneHeight'].includes(cmd) ? { arg: '' } : { o: [] }) }; list.splice(0, 0, it); }
    return it;
  }
  const STYLE_KEYS: Record<string, [string, string, string, string, Record<string, any>?][]> = {
    SetVertexStyle: [['Shape', 'shape', 'circle', 'pick'], ['MinSize', 'size', '0.6\\DefaultUnit', 'text'], ['LineWidth', 'line', '1pt', 'text'], ['LineColor', 'lineColour', 'black', 'colour'], ['LineOpacity', 'lineOpacity', '1', 'num'],
      ['FillColor', 'fill', 'vertexfill', 'colour'], ['FillOpacity', 'fillOpacity', '1', 'num'], ['TextColor', 'textColour', 'black', 'colour'], ['TextFont', 'font', '\\scriptsize', 'font'], ['TextRotation', 'textRotation', '0', 'num'], ['TextOpacity', 'textOpacity', '1', 'num'], ['InnerSep', 'innerSep', '2pt', 'text'], ['OuterSep', 'outerSep', '0pt', 'text']],
    SetEdgeStyle: [['Arrow', 'arrowTip', '-latex', 'arrow'], ['LineWidth', 'line', '1.5pt', 'text'], ['Color', 'colour', 'black!75', 'colour'], ['Opacity', 'opacity', '1', 'num'], ['TextFillColor', 'labelFill', 'white', 'colour'], ['TextFillOpacity', 'labelFillOpacity', '1', 'num'],
      ['TextFont', 'font', '\\scriptsize', 'font'], ['TextRotation', 'textRotation', '0', 'num'], ['TextOpacity', 'textOpacity', '1', 'num'], ['InnerSep', 'innerSep', '0pt', 'text'], ['OuterSep', 'outerSep', '1pt', 'text']],
    SetPlaneStyle: [['LineWidth', 'line', '1.5pt', 'text'], ['LineColor', 'lineColour', 'black', 'colour'], ['LineOpacity', 'lineOpacity', '1', 'num'], ['GridLineWidth', 'gridLine', '.5pt', 'text'], ['GridColor', 'gridColour', 'black', 'colour'], ['GridOpacity', 'gridOpacity', '.5', 'num'],
      ['FillColor', 'fill', 'vertexfill', 'colour'], ['FillOpacity', 'fillOpacity', '.3', 'num']],
    SetTextStyle: [['TextFont', 'font', '\\normalsize', 'font'], ['TextColor', 'textColour', 'black', 'colour'], ['TextRotation', 'textRotation', '0', 'num'], ['TextOpacity', 'textOpacity', '1', 'num'], ['InnerSep', 'innerSep', '2pt', 'text'], ['OuterSep', 'outerSep', '0pt', 'text']],
  };
  function styleLabel(id: string) {
    switch (id) {
      case 'shape': return uiText('editor.network.shape', 'Shape');
      case 'size': return uiText('editor.network.size', 'Size');
      case 'line': return uiText('editor.network.lineWidth', 'Line width');
      case 'lineColour': return uiText('editor.network.lineColour', 'Line colour');
      case 'lineOpacity': return uiText('editor.network.lineOpacity', 'Line opacity');
      case 'fill': return uiText('editor.network.fill', 'Fill');
      case 'fillOpacity': return uiText('editor.network.fillOpacity', 'Fill opacity');
      case 'textColour': return uiText('editor.network.fontColour', 'Font colour');
      case 'font': return uiText('editor.network.fontSize', 'Font size');
      case 'textRotation': return uiText('editor.network.textRotation', 'Text rotation');
      case 'textOpacity': return uiText('editor.network.textOpacity', 'Text opacity');
      case 'innerSep': return uiText('editor.network.innerSep', 'Inner sep');
      case 'outerSep': return uiText('editor.network.outerSep', 'Outer sep');
      case 'arrowTip': return uiText('editor.network.arrowTip', 'Arrow tip');
      case 'colour': return uiText('editor.network.colour', 'Colour');
      case 'opacity': return uiText('editor.network.opacity', 'Opacity');
      case 'labelFill': return uiText('editor.network.labelFill', 'Label fill');
      case 'labelFillOpacity': return uiText('editor.network.labelFillOpacity', 'Label fill opacity');
      case 'gridLine': return uiText('editor.network.gridLine', 'Grid line');
      case 'gridColour': return uiText('editor.network.gridColour', 'Grid colour');
      default: return uiText('editor.network.gridOpacity', 'Grid opacity');
    }
  }
  function styleSection(cmd: string, title: string) {
    const it = setItem(cmd, false), o = it?.o || [];
    const rows = STYLE_KEYS[cmd].map(([k, id, dflt, kind]) => {
      const v = getOpt(o, k) ?? '', key = `S:${cmd}:${k}`, label = styleLabel(id);
      if (kind === 'colour') return colRow(label, key, v, { dflt: dflt, sw: TD.tikzColor?.(dflt === 'vertexfill' ? 'cyan' : dflt) && dflt === 'vertexfill' ? '#abd7e6' : undefined });
      if (kind === 'font') return choose(label, key, v, fontOpts());
      if (kind === 'pick') return choose(label, key, v, [['', uiText('editor.network.default', 'Default')], ...shapeOpts().slice(1).filter(([v]) => v !== 'triangle')]);
      if (kind === 'arrow') return choose(label, key, v, [['', 'latex'], ['-stealth', 'stealth'], ['->', 'to'], ['-{Latex}', 'Latex'], ['-{Stealth}', 'Stealth']]);
      if (kind === 'num') return num(label, key, v, '', { step: '0.1', ph: dflt });
      return txt(label, key, v, dflt);
    });
    const more = (cmd === 'SetCoordinates' ? E.M.pre || [] : E.M.items).filter((x: any) => x.k === 'set' && x.cmd === cmd).length;
    return sec(title, [...rows, ...(more > 1 ? [note(uiText('editor.network.moreStyles', 'The code restyles them again further on: these are the first settings'))] : [])]);
  }
  const argOf = (cmd: string) => setItem(cmd, false)?.arg ?? '';
  function layersInUse() {
    const L = lay(), s = new Set<number>();
    for (const n of L.nodes.values()) if (n.canvas && L.S.LD) s.add(Math.round(n.layer / L.S.LD) + 1);
    for (const p of L.planes) if (L.S.LD) s.add(Math.round(p.layer / L.S.LD) + 1);
    return [...s].filter((x) => x >= 1).sort((a, b) => a - b);
  }
  function pictureRows() {
    const L = lay(), env = N.opts(E.M.env || ''), ml = env.map((x: string) => kv(x)).find((p: any) => p.k === 'multilayer'), mode = ml ? (N.unbrace(ml.v || '') === '3d' ? '3d' : '2d') : '';
    const cs = setItem('SetCoordinates', false)?.o || [], C3 = (k: string) => getOpt(cs, k) ?? '';
    const layers = layersInUse(), next = (layers.length ? Math.max(...layers) : 0) + 1;
    const bg = E.M.items.filter((x: any) => x.k === 'set' && (x.cmd === 'EdgesInBG' || x.cmd === 'EdgesNotInBG')).pop();
    return [
      sec(uiText('editor.network.picture', 'Picture'), [
        segments(uiText('editor.network.multilayer', 'Multilayer'), 'multilayer', mode, [['', uiText('editor.network.off', 'Off')], ['2d', '2D'], ['3d', '3D', uiText('editor.network.ml3dTitle', 'multilayer=3d: each layer drawn as a plane in perspective')]]),
        num(uiText('editor.network.layerDistance', 'Layer distance'), 'A:SetLayerDistance', argOf('SetLayerDistance'), '', { step: '0.25', ph: '-2' }),
        segments(uiText('editor.network.newOn', 'New items on'), 'activelayer', E.layer ?? '', [['', uiText('editor.network.noLayer', 'No layer')], ...layers.map((n) => [n, String(n)]), [next, '+' + next, uiText('editor.network.newLayerTitle', 'A new layer: items placed now go on layer {n}', { n: next })]]),
        segments(uiText('editor.network.edges', 'Edges'), 'edgesbg', bg && bg.cmd === 'EdgesNotInBG' ? 'front' : 'back', [['back', uiText('editor.network.behindVertices', 'Behind vertices')], ['front', uiText('editor.network.inFront', 'In front')]]),
        txt(uiText('editor.network.unit', 'Unit'), 'A:SetDefaultUnit', argOf('SetDefaultUnit'), 'cm'),
        num(uiText('editor.network.distanceScale', 'Distance scale'), 'A:SetDistanceScale', argOf('SetDistanceScale'), '×', { step: '0.1', min: 0, ph: '1' }),
        txt(uiText('editor.network.planeWidth', 'Plane width'), 'A:SetPlaneWidth', argOf('SetPlaneWidth'), '5\\DefaultUnit'),
        txt(uiText('editor.network.planeHeight', 'Plane height'), 'A:SetPlaneHeight', argOf('SetPlaneHeight'), '5\\DefaultUnit'),
        // code written with a farther layer after a nearer one paints it over: edits sort it, or this does now
        ...(N.layerOrder(N.parse(code())) ? [note(uiText('editor.network.outOfOrder', 'The code paints a farther layer over a nearer one. Any edit puts it in layer order.')), actionRow('ne', 'layerorder', uiText('editor.network.sortLayers', 'Put in Layer Order'), false)] : []),
      ], uiText('editor.network.summary', '{v} vertices · {e} edges', { v: L.nodes.size, e: L.edges.length })),
      ...(mode === '3d' ? [sec(uiText('editor.network.axes3d', '3D axes'), [
        num(uiText('editor.network.xAngle', 'x angle'), 'C:xAngle', C3('xAngle'), '°', { step: '1', ph: '-12' }), num(uiText('editor.network.xLength', 'x length'), 'C:xLength', C3('xLength'), '', { step: '0.1', ph: '1' }),
        num(uiText('editor.network.yAngle', 'y angle'), 'C:yAngle', C3('yAngle'), '°', { step: '1', ph: '37' }), num(uiText('editor.network.yLength', 'y length'), 'C:yLength', C3('yLength'), '', { step: '0.1', ph: '1' }),
        num(uiText('editor.network.zAngle', 'z angle'), 'C:zAngle', C3('zAngle'), '°', { step: '1', ph: '90' }), num(uiText('editor.network.zLength', 'z length'), 'C:zLength', C3('zLength'), '', { step: '0.1', ph: '1' }),
        note(uiText('editor.network.axesNote', '\\SetCoordinates, written before the picture: a layer\'s x runs along the y axis and its y along the x axis, as tikz-network draws it')),
      ])] : []),
      sec(uiText('editor.network.autoLayout', 'Auto layout'), [{ kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.onCircle', 'On a Circle'), attrs: { 'data-ne': 'circle' } }, { text: uiText('editor.network.bySprings', 'By Springs'), attrs: { 'data-ne': 'spring', title: uiText('editor.network.springTitle', 'Auto layout: place the vertices by their edges (spring layout)') } }] },
        note(uiText('editor.network.autoNote', 'Places the vertices written as \\Vertex (not those on layers or from data files). One undo step.'))]),
      styleSection('SetVertexStyle', uiText('editor.network.vertexStyle', 'Every vertex')),
      styleSection('SetEdgeStyle', uiText('editor.network.edgeStyle', 'Every edge')),
      styleSection('SetPlaneStyle', uiText('editor.network.planeStyle', 'Every plane')),
      styleSection('SetTextStyle', uiText('editor.network.textStyle', 'Every text')),
      dataSection(),
      outlineSection(),
    ];
  }
  function dataSection() {
    const used = N.dataFiles(code()), names = [...new Set([...used, ...Object.keys(E.files)])];
    const rows: any[] = names.flatMap((name) => {
      const text = E.files[name], image = /^data:/.test(text || '') || /\.(png|jpe?g|pdf)$/i.test(name), isLinked = linked(name), edited = E.edited.has(name);
      const rowsN = text != null && !image ? N.csv(text).rows.length : 0;
      const status = text == null ? uiText('editor.network.fileMissing', 'not loaded') : `${image ? uiText('editor.network.picture1', 'picture') : rowsN === 1 ? uiText('editor.network.oneRow', '1 row') : uiText('editor.network.nRows', '{n} rows', { n: rowsN })}${isLinked ? ' · ' + (edited ? uiText('editor.network.linkedEdited', 'linked, changed here') : uiText('editor.network.linked', 'linked')) : ''}${!used.includes(name) ? ' · ' + uiText('editor.network.unused', 'not used') : ''}`;
      const btn = (a: string, t: string, more: Record<string, string> = {}) => ({ text: t, attrs: { 'data-ne': a, 'data-file': name, ...more } });
      return [note({ code: name }, ` · ${status}`), { kind: 'actions' as const, class: 'row', buttons: [
        btn('load', text == null ? uiText('editor.network.loadFile', 'Load…') : uiText('editor.network.replaceFile', 'Replace…')),
        ...(text != null && !image ? [btn('editcsv', uiText('editor.network.editRows', 'Edit Rows…'))] : []),
        ...(isLinked ? [btn('reload', uiText('editor.network.reload', 'Reload'))] : []),
        ...(isLinked && edited ? [btn('writefile', uiText('editor.network.writeDisk', 'Write to Disk'))] : []),
        ...(isLinked ? [btn('unlink', uiText('editor.network.unlink', 'Unlink'))] : []),
        ...(!used.includes(name) ? [btn('rmfile', uiText('editor.network.remove', 'Remove'), { class: 'danger' })] : []),
      ] }];
    });
    return sec(uiText('editor.network.dataFiles', 'Data files'), [...rows,
      { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.addData', 'Add CSV File…'), attrs: { 'data-ne': 'adddata' } }] },
      note(TD.files?.data?.can ? uiText('editor.network.dataNote', '\\Vertices and \\Edges read CSV files (a header row: id, x, y … or u, v …). The block keeps a copy for drawing and export; a file loaded from disk stays linked, read in again when it changes.') : uiText('editor.network.dataNoteCopy', '\\Vertices and \\Edges read CSV files (a header row: id, x, y … or u, v …). The block keeps a copy for drawing and export.'))]);
  }
  // what the code holds that the stage doesn't show as one thing to click
  function outlineSection() {
    const its = E.M.items.map((it: any, i: number) => ({ it, i })).filter(({ it }: any) => ['vs', 'es', 'layer', 'raw'].includes(it.k) && !(it.k === 'raw' && !it.s.trim()));
    const label = (it: any) => it.k === 'vs' ? `\\Vertices{${it.file}}` : it.k === 'es' ? `\\Edges{${it.file}}` : it.k === 'layer' ? `Layer ${getOpt(it.o, 'layer') || '1'}` : it.s.length > 28 ? it.s.slice(0, 28) + '…' : it.s;
    const pseudo = [...lay().nodes.values()].filter((n: any) => n.pseudo && n.src);
    if (!its.length && !pseudo.length) return null;
    return sec(uiText('editor.network.inCode', 'In the code'), [
      ...its.map(({ it, i }: any) => ({ kind: 'actions' as const, class: 'row', buttons: [{ text: label(it), attrs: { 'data-ne': 'pickitem', 'data-i': String(i), class: 'mono' } }] })),
      ...pseudo.map((n: any) => ({ kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.network.hiddenVertex', 'Hidden vertex {name}', { name: n.id }), attrs: { 'data-ne': 'pickvertex', 'data-id': n.id } }] })),
    ]);
  }

  function renderProps() {
    if (!E) return;
    renderLayers();
    const s = E.sel, list = s ? ents() : [];
    let sections: any[];
    if (s && (E.more || []).some((x: any) => x.k !== s.k)) sections = [sec(uiText('editor.network.nItems', '{n} items', { n: sels().length }), [actionRow('ne', 'delete', uiText('editor.network.deleteAll', 'Delete Them'))])];
    else if (s && list.length && s.k === 'v') sections = [...vertexRows(list), actionRow('ne', 'delete', list.length > 1 ? uiText('editor.network.deleteAll', 'Delete Them') : uiText('editor.network.deleteVertex', 'Delete Vertex'))];
    else if (s && list.length && s.k === 'e') sections = [...edgeRows(list), actionRow('ne', 'delete', list.length > 1 ? uiText('editor.network.deleteAll', 'Delete Them') : list[0].a === list[0].b ? uiText('editor.network.deleteLoop', 'Delete Loop') : uiText('editor.network.deleteEdge', 'Delete Edge'))];
    else if (s && list.length && s.k === 't') sections = [...textRows(list), actionRow('ne', 'delete', list.length > 1 ? uiText('editor.network.deleteAll', 'Delete Them') : uiText('editor.network.deleteText', 'Delete Text'))];
    else if (s && list.length && s.k === 'p') sections = [...planeRows(list), actionRow('ne', 'delete', list.length > 1 ? uiText('editor.network.deleteAll', 'Delete Them') : uiText('editor.network.deletePlane', 'Delete Plane'))];
    else if (s && (s.k === 'vs' || s.k === 'es') && E.M.items[s.i]) sections = dataRows(E.M.items[s.i]);
    else if (s && s.k === 'layer' && E.M.items[s.i]) sections = layerRows(E.M.items[s.i]);
    else if (s && s.k === 'raw' && E.M.items[s.i]) sections = rawRows(E.M.items[s.i]);
    else sections = [sec(uiText('ui.network', 'Network'), [note(uiText('editor.network.help', 'Place vertices from the left; drag them to move (⌥ places freely), and their edges follow. Select a vertex and drag its blue handle to another vertex for an edge, or back onto it for a loop. Double-click to label.'))]), ...pictureRows()];
    // loose action rows become sections of their own
    renderView(props, FormPanel, { sections: sections.filter(Boolean).map((x: any) => (x.rows ? x : { class: 'sec', rows: [x] })) });
  }
  // the item the panel's fields set: a \Vertices / \Edges / Layer / TikZ item (by index) or the selection's entities
  function targets() {
    const s = E.sel;
    if (s && ['vs', 'es', 'layer'].includes(s.k)) { const it = E.M.items[s.i]; return it ? [{ o: it.o, set(k: string, v: any) { it.o = setOpt(it.o, k, v); } }] : []; }
    return s ? ents() : [];
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { if (e.target.dataset.f === 'id' && E.sel) e.target.value = E.sel.id; commit(); renderProps(); } });
  function setField(f: string, v: string, unit: string, isNum: boolean) {
    const s = E.sel;
    if (isNum && v && !isFinite(parseFloat(v))) return false;
    // the picture's settings
    if (f.startsWith('S:')) { const [, cmd, k] = f.split(':'); ensureEnv(); const it = setItem(cmd, !!v); if (it) it.o = setOpt(it.o || [], k, v || null); return true; }
    if (f.startsWith('A:')) { const cmd = f.slice(2); ensureEnv(); if (v) setItem(cmd, true).arg = v; else { const it = setItem(cmd, false); if (it) E.M.items.splice(E.M.items.indexOf(it), 1); } return true; }
    if (f.startsWith('C:')) { ensureEnv(); const it = setItem('SetCoordinates', !!v); if (it) { it.o = setOpt(it.o || [], f.slice(2), v || null); if (!it.o.length) E.M.pre.splice(E.M.pre.indexOf(it), 1); } return true; }
    if (f === 'raw' && s && E.M.items[s.i]) { E.M.items[s.i].s = v; return true; }
    if (f === 'id') return rename(s, v);
    const list = targets();
    if (!list.length) return false;
    for (const en of list) {
      if (f === 'label') { en.set('label', v || null); if (s.k === 'v') { en.set('IdAsLabel', false); en.set('NoLabel', false); } }
      else if (f === 'text') en.item.text = v;
      else if (f === 'color') { en.set('RGB', false); en.set('color', v || null); }
      else if (f === 'shape') setShape(en, v);
      else if (f === 'shading') { const st = N.opts(getOpt(en.o, 'style') || '').filter((x: string) => !/^(shading|ball color)\b/.test(kv(x).k)); if (v) st.push('shading=ball'); en.set('style', st.length ? st.join(',') : null); }
      else en.set(f, v ? v + unit : null);
    }
    return true;
  }
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f || !E || t.matches('select')) return;
    if (setField(f, t.value.trim(), t.dataset.unit || '', t.type === 'number')) { E.M.dirty = true; draw(); }
  });
  props.addEventListener('change', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!t.matches('select') || !f || !E || isViewUpdating()) return;
    begin(); if (setField(f, t.value, '', false)) E.M.dirty = true; commit(); clampSel(); draw(); renderProps();
  });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v;
    if (f === 'multilayer') { edit(() => { ensureEnv(); const o = N.opts(E.M.env || '').filter((x: string) => kv(x).k !== 'multilayer'); if (v) o.unshift(`multilayer=${v}`); E.M.env = o.join(', '); }); if (v === '3d' && E.layer == null) { E.layer = firstLayer(); renderProps(); } fit(); return; }
    if (f === 'activelayer') { E.layer = v ? Number(v) : null; if (E.layer == null) E.focus = false; draw(); renderProps(); setTip(E.layer ? uiText('editor.network.layerTip', 'New vertices, texts and planes go on layer {n}', { n: E.layer }) : ''); return; }
    if (f === 'edgesbg') { edit(() => { ensureEnv(); E.M.items = E.M.items.filter((x: any) => !(x.k === 'set' && (x.cmd === 'EdgesInBG' || x.cmd === 'EdgesNotInBG'))); if (v === 'front') E.M.items.splice(0, 0, { k: 'set', cmd: 'EdgesNotInBG' }); }); return; }
    const list = targets();
    if (!list.length) return;
    edit(() => {
      for (const en of list) {
        if (f === 'flag') en.set(v, !list.every((x: any) => flag(x.o, v)));
        else if (f === 'labelmode') { en.set('IdAsLabel', v === 'id'); en.set('NoLabel', v === 'none'); if (v !== 'text') en.set('label', null); }
      }
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ne="undo"]', root).disabled = !E.undo.length;
    $('[data-ne="redo"]', root).disabled = !E.redo.length;
    $('[data-ne="spring"]', root).disabled = !E.M.items.some((it: any) => it.k === 'v');
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-ne]') as HTMLElement | null;
    if (!b || !E) return;
    act(b.dataset.ne!, b);
  });
  function act(a: string, b?: HTMLElement) {
    const en = selEnt(), s = E.sel, file = b?.dataset.file;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'spring') autoLayout('spring');
    else if (a === 'circle') autoLayout('circle');
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'label') editLabel(s);
    else if (a === 'layerorder') edit(() => {});
    else if (a === 'front' || a === 'forward' || a === 'backward' || a === 'back') arrangeSel(a);
    else if (a === 'copy' && b) copyCode(b, codeTa.value);
    else if (a === 'adddata') addDataFile();
    else if (a === 'load' && file) loadFile(file);
    else if (a === 'reload' && file) reloadFile(file, true);
    else if (a === 'writefile' && file) writeFile(file);
    else if (a === 'unlink' && file) unlinkFile(file);
    else if (a === 'rmfile' && file) removeFile(file);
    else if (a === 'editcsv' && file) editCsv(file);
    else if (a === 'pickitem' && b) { const i = Number(b.dataset.i), it = E.M.items[i]; if (it) { E.sel = { k: it.k, i }; E.more = []; draw(); renderProps(); } }
    else if (a === 'pickvertex' && b) { const n = lay().nodes.get(b.dataset.id); if (n && n.src) { E.sel = { k: 'v', i: n.src.item, file: n.src.file, row: n.src.row, id: b.dataset.id }; E.more = []; draw(); renderProps(); } }
    else if (a === 'image' && s && s.k === 'p') addImage();
    else if (a === 'noimage' && s && s.k === 'p') edit(() => { for (const q of ents()) { q.set('image', null); q.set('ImageAndFill', false); } });
    else if (s && en && s.k === 'v' && a === 'addloop') addEdge(en.id, en.id);
    else if (s && en && s.k === 'e') {
      if (a === 'direct') edit(() => en.set('Direct', !flag(en.o, 'Direct')));
      else if (a === 'rev') edit(() => reverseEdge(en));
      else if (a === 'bleft') edit(() => en.set('bend', '30'));
      else if (a === 'bright') edit(() => en.set('bend', '-30'));
      else if (a === 'bnone') edit(() => en.set('bend', null));
    }
  }
  function syncCode() {
    const L = lay();
    count.textContent = `${L.nodes.size === 1 ? uiText('editor.network.oneVertex', '1 vertex') : uiText('editor.network.nVertices', '{n} vertices', { n: L.nodes.size })} · ${L.edges.length === 1 ? uiText('editor.network.oneEdge', '1 edge') : uiText('editor.network.nEdges', '{n} edges', { n: L.edges.length })}`;
    if (document.activeElement === codeTa) return;
    const c = code();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, L.warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit();
    clampSel(); draw(); renderProps(); updateTools();
    showCodeNotes(codeMsg, lay().warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !dock.elsewhere(e),
      save, finish, undo, redo,
      escape: () => {
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.sel) { E.sel = null; E.more = []; draw(); renderProps(); return true; }
        if (E.focus) { setFocus(null); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
    if (mod && (e.key === 'f' || e.key === 'k')) { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && e.key === 'c' && !e.shiftKey) { if (copySel()) { e.preventDefault(); stageNote.flash(uiText('editor.network.copied', 'Copied'), 1200); } return; }
    if (mod && e.key === 'v' && !e.shiftKey && E.clip?.length) { e.preventDefault(); paste(); return; }
    if (mod && e.key === 'd') { e.preventDefault(); if (copySel()) paste(); return; }
    // ⌘] / ⌘[ bring forward and send backward; with ⇧, to the front and to the back (of its layer)
    if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && E.sel) { e.preventDefault(); arrangeSel(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); return; }
    if (mod && e.key === 'a') {
      // every vertex, text and plane
      e.preventDefault();
      const L = lay(), got: any[] = [];
      const F = focusZ();
      for (const [id, n] of L.nodes) if (n.src && zIn(n.layer, F)) got.push({ k: 'v', i: n.src.item, file: n.src.file, row: n.src.row, id });
      for (const T of L.texts) if (zIn(T.layer, F)) got.push({ k: 't', i: T.src.item });
      for (const P of L.planes) if (zIn(P.layer, F)) got.push({ k: 'p', i: P.src.item });
      E.sel = got[0] || null; E.more = got.slice(1); draw(); renderProps(); return;
    }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const s = E.sel, en = selEnt();
    if ((e.key === 'Enter' || e.key === 'F2') && s) { e.preventDefault(); editLabel(s); return; }
    if (e.key.startsWith('Arrow') && s && en && (s.k === 'v' || s.k === 't' || s.k === 'p')) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      edit(() => { for (const x of sels().filter((y: any) => y.k === 'v' || y.k === 't' || y.k === 'p')) { const q = ent(x); if (!q) continue; const [px, py] = xyOf(q); q.set('x', N.num(snap(px + dx, false))); q.set('y', N.num(snap(py + dy, false))); } });
      return;
    }
    if (s && en && s.k === 'v' && e.key.toLowerCase() === 'l') { e.preventDefault(); addEdge(en.id, en.id); return; }
    if (s && en && s.k === 'e' && e.key.toLowerCase() === 'd') { e.preventDefault(); act('direct'); return; }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('blur', () => { if (E) E.space = false; }); // Space let go in another window
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapshot(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.network.discard', 'Discard changes to this network?'),
    result: () => ({ src: code(), files: { ...E.files } }),
  });
  const { save, finish } = dock;
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, files: { ...(block.files || {}) }, edited: new Set<string>(), blockId: block.id, sel: null, more: [], layer: null, focus: false, clip: null, arm: null, kind: 'plain', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.typed = String(block.src || ''); E.start = snapshot();
    // in a 3D picture new items go on a layer (the nearest one used), so the grid lies on its plane
    if (lay().edge3d) E.layer = firstLayer();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw();
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
    // linked data files changed on disk since: read in (no question asked yet: that needs a click)
    for (const name of Object.keys(E.files)) if (linked(name)) reloadFile(name, false);
  }
  TD.networkEditor = { open, dockable: true, close: () => dock.detach() };
})();
