import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import GrapheditorFrame from '../ui/editors/GrapheditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
// Graph editor: the overlay that opens on a Graph block. A palette of node kinds, edge kinds and whole
// graphs; the graph drawn on a centimetre grid, where nodes are placed, dragged (alone or several at once)
// and joined by dragging a node's blue handle to another; a selected edge's middle handle bends it; Auto
// layout places every node; text in the usual graph formats (adjacency matrix or list, edge list, DOT,
// Mermaid, JSON) is read by Import and by pasting; and beside them the selection's properties and the
// TikZ code, live both ways. Untouched code is handed back as written.
// TD.graphEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const F = TD.graph;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const PX = TD.PX_PER_CM, GRID = 0.25;
  const kv = F.kv;

  // ---------------------------------------------------------------- node and edge kinds
  // the options each node kind writes (less what the graph's nodes={…} already gives)
  const KIND: Record<string, any> = {
    circle: { o: ['circle'] }, box: { o: ['rectangle'] }, rounded: { o: ['rectangle', 'rounded corners'] }, ellipse: { o: ['ellipse'] },
    diamond: { o: ['diamond'] }, point: { o: ['circle', 'fill', 'inner sep=0pt', 'minimum size=4pt'], text: '' }, text: { o: ['rectangle', 'draw=none'], text: 'Text' },
  };
  const KIND_OPTS = new Set(Object.values(KIND).flatMap((k: any) => k.o).concat(['draw', 'draw=none', 'shape=circle', 'shape=rectangle', 'shape=ellipse', 'shape=diamond']));
  const isKindOpt = (it: string) => KIND_OPTS.has(it.trim()) || /^(circle|rectangle|ellipse|diamond)$/.test(kv(it).k);
  // ---------------------------------------------------------------- palette
  const pic = (body: string) => `\\begin{tikzpicture}[>=Stealth]\\graph[no placement] {${body}};\\end{tikzpicture}`;
  const nMini = (o: string, t = '') => pic(`a/${t} [at={(0,0)}, draw, minimum size=6mm, ${o}]`);
  const eMini = (op: string, o = '') => pic(`a/ [at={(0,0)}, draw, circle, inner sep=1.6pt]; b/ [at={(1.4,0)}, draw, circle, inner sep=1.6pt]; a ${op}${o ? `[${o}]` : ''} b`);
  // whole graphs: n nodes, the edges between them (by index), where they go (cm)
  const ring = (n: number, r: number, a0 = 90) => (i: number) => [r * Math.cos(((a0 - (360 * i) / n) * Math.PI) / 180), r * Math.sin(((a0 - (360 * i) / n) * Math.PI) / 180)];
  const complete = (n: number) => { const e: number[][] = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e.push([i, j]); return e; };
  const cycle = (n: number) => Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
  const TPL: Record<string, any> = {
    k3: { n: 3, e: complete(3), at: ring(3, 1) },
    c5: { n: 5, e: cycle(5), at: ring(5, 1.2) },
    k4: { n: 4, e: complete(4), at: ring(4, 1.2, 45) },
    k5: { n: 5, e: complete(5), at: ring(5, 1.4) },
    k33: { n: 6, e: [0, 1, 2].flatMap((i) => [3, 4, 5].map((j) => [i, j])), at: (i: number) => [(i % 3) * 1.5, i < 3 ? 1 : -1] },
    petersen: { n: 10, e: [...cycle(5), ...[0, 1, 2, 3, 4].map((i) => [i, i + 5]), ...[0, 1, 2, 3, 4].map((i) => [i + 5, ((i + 2) % 5) + 5])], at: (i: number) => (i < 5 ? ring(5, 2)(i) : ring(5, 1)(i - 5)) },
    star: { n: 6, e: [1, 2, 3, 4, 5].map((j) => [0, j]), at: (i: number) => (i ? ring(5, 1.4)(i - 1) : [0, 0]) },
    path: { n: 4, e: [[0, 1], [1, 2], [2, 3]], at: (i: number) => [i * 1.5, 0] },
    tree: { n: 7, e: [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]], at: (i: number) => (i === 0 ? [0, 0] : i < 3 ? [i === 1 ? -1.5 : 1.5, -1.25] : [-2.25 + (i - 3) * 1.5, -2.5]) },
    grid: { n: 9, e: [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8]], at: (i: number) => [(i % 3) * 1.5, -Math.floor(i / 3) * 1.5] },
    cube: { n: 8, e: [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]], at: (i: number) => [(i & 1 ? 2 : 0) + (i & 4 ? 0.9 : 0), (i & 2 ? 2 : 0) + (i & 4 ? 0.9 : 0)] },
    digraph: { n: 4, e: [[0, 1, '4'], [0, 2, '1'], [2, 1, '2'], [1, 3, '1'], [2, 3, '5']], at: (i: number) => [[0, 0], [2, 1], [2, -1], [4, 0]][i], directed: true },
  };
  const tplSrc = (k: string, mini = false) => {
    const T = TPL[k], o = mini ? 'inner sep=2pt' : 'minimum size=7mm';
    const nodes = Array.from({ length: T.n }, (_, i) => { const [x, y] = T.at(i); return `v${i}/ [at={(${F.num(x)},${F.num(y)})}]`; });
    const edges = T.e.map(([a, b, w]: any) => `v${a} ${T.directed ? '->' : '--'}${w && !mini ? `["$${w}$"]` : ''} v${b}`);
    return `\\begin{tikzpicture}[>=Stealth]\\graph[no placement, nodes={draw, circle, ${o}}] {${nodes.concat(edges).join('; ')}};\\end{tikzpicture}`;
  };
  // names are caption descriptors, shown in the interface language when the palette is drawn
  const PAL: any[] = [
    [message('editor.graph.cat.nodes', 'Nodes'), [
      ['n:circle', message('editor.graph.circle', 'Circle'), nMini('circle'), 'C'], ['n:box', message('editor.graph.box', 'Box'), nMini('rectangle'), 'B'],
      ['n:rounded', message('editor.graph.rounded', 'Rounded'), nMini('rectangle, rounded corners'), 'R'], ['n:ellipse', message('editor.graph.ellipse', 'Ellipse'), nMini('ellipse, minimum width=9mm'), 'E'],
      ['n:diamond', message('editor.graph.diamond', 'Diamond'), nMini('diamond'), null], ['n:point', message('editor.graph.point', 'Point'), nMini('circle, fill, inner sep=0pt, minimum size=4pt'), 'P'],
      ['n:text', message('editor.graph.textBox', 'Text box'), pic('a/Text [at={(0,0)}]'), 'T', message('editor.graph.text', 'Text')],
    ]],
    [message('editor.graph.cat.edges', 'Edges'), [
      ['e:line', message('editor.graph.line', 'Line'), eMini('--'), 'L'], ['e:arrow', message('editor.graph.arrow', 'Arrow'), eMini('->'), 'A'],
      ['e:both', message('editor.graph.both', 'Both ways'), eMini('<->'), null, message('editor.graph.bothShort', 'Both')], ['e:bent', message('editor.graph.bent', 'Bent'), eMini('--', 'bend left'), null],
      ['e:dashed', message('editor.graph.dashed', 'Dashed'), eMini('--', 'dashed'), null],
    ]],
    [message('editor.graph.cat.graphs', 'Graphs'), [
      ['t:k3', message('editor.graph.tplK3', 'Triangle K₃'), tplSrc('k3', true), null, 'K₃'], ['t:c5', message('editor.graph.tplC5', 'Cycle C₅'), tplSrc('c5', true), null, 'C₅'],
      ['t:k4', message('editor.graph.tplK4', 'Complete K₄'), tplSrc('k4', true), null, 'K₄'], ['t:k5', message('editor.graph.tplK5', 'Complete K₅'), tplSrc('k5', true), null, 'K₅'],
      ['t:k33', message('editor.graph.tplK33', 'Bipartite K₃,₃'), tplSrc('k33', true), null, 'K₃,₃'], ['t:petersen', message('editor.graph.tplPetersen', 'Petersen'), tplSrc('petersen', true), null],
      ['t:star', message('editor.graph.tplStar', 'Star'), tplSrc('star', true), null], ['t:path', message('editor.graph.tplPath', 'Path'), tplSrc('path', true), null],
      ['t:tree', message('editor.graph.tplTree', 'Binary tree'), tplSrc('tree', true), null, message('editor.graph.tplTreeShort', 'Tree')], ['t:grid', message('editor.graph.tplGrid', 'Grid'), tplSrc('grid', true), null],
      ['t:cube', message('editor.graph.tplCube', 'Cube'), tplSrc('cube', true), null], ['t:digraph', message('editor.graph.tplDigraph', 'Weighted digraph'), tplSrc('digraph', true), null, message('editor.graph.tplDigraphShort', 'Weighted')],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key, short] of items) { ITEM[k] = { k, name, mini, key, short }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.graph.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? F.write(M) : M.raw);
  const nOf = (name: any) => E.M.nodes.find((n: any) => n.name === name) || null;
  // a label of several lines is kept as "a \\ b"; the popup shows it one line under another
  const toLines = (t: string) => String(t || '').split(/\s*\\\\(?:\[[^\]]*\])?\s*/);
  const mathOf = (t: string) => {
    const ms = toLines(t).map((l) => /^\$([^$]*)\$$/.exec(l.trim()));
    return ms.every(Boolean) ? ms.map((m) => m![1]).join('\n') : null;
  };
  const fromLines = (t: string, math: boolean) => {
    const ls = t.split('\n').map((l) => l.trim());
    while (ls.length > 1 && !ls[ls.length - 1]) ls.pop();
    if (!ls.some(Boolean)) return '';
    return ls.map((l) => (math ? (l ? `$${l}$` : '') : l)).join(' \\\\ ');
  };
  const shownOf = (n: any) => (n.text == null ? n.name : n.text);
  const lay = () => F.layout({ src: snapCode() });
  const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v * 1000) / 1000);
  // the graph's nodes={…} and edges={…}
  const gGet = (key: string) => { const it = E.M.gopts.find((x: string) => kv(x).k === key && kv(x).v != null); return it ? F.opts(F.unbrace(kv(it).v)) : []; };
  function gSet(key: string, list: string[]) {
    const i = E.M.gopts.findIndex((x: string) => kv(x).k === key && kv(x).v != null), it = list.length ? `${key}={${list.join(', ')}}` : null;
    if (i >= 0) { if (it) E.M.gopts[i] = it; else E.M.gopts.splice(i, 1); } else if (it) E.M.gopts.push(it);
  }
  // every node gets its drawn place written down, so nothing moves when one of them does
  function pinAll() {
    if (!E.M.gopts.some((it: string) => kv(it).k === 'no placement')) {
      const L = lay();
      for (const n of E.M.nodes) if (n.x == null) { const q = L.nodes.get(n.name); if (q) { n.x = snap(q.x / PX, true); n.y = snap(-q.y / PX, true); } }
      E.M.gopts.unshift('no placement');
    }
    if (E.M.env == null) E.M.env = '>=Stealth';
  }
  const posOf = (n: any) => { if (n.x != null) return [n.x, n.y]; const q = lay().nodes.get(n.name); return q ? [q.x / PX, -q.y / PX] : [0, 0]; };
  // a node's kind, from how it is drawn
  function kindOf(n: any) {
    const L = lay(), q = L.nodes.get(n.name);
    if (!q) return '';
    const N = q.N;
    if (!N.draw && !N.fill) return 'text';
    if (N.fill && !q.t && N.shape === 'circle' && q.r <= 3 * (PX / 28.45)) return 'point';
    if (N.shape === 'rectangle') return N.rc ? 'rounded' : 'box';
    return N.shape;
  }
  // the options a kind adds to a node, less what the graph's own node style gives already
  function kindOpts(k: string) {
    const def = gGet('nodes'), D = F.nodeOpts(F.nodeBase(), def, null), K = KIND[k];
    if (!K) return [];
    return K.o.filter((it: string) => {
      if (def.includes(it)) return false;
      if (it === 'rectangle' && D.shape === 'rectangle') return false;
      return true;
    }).concat(k !== 'text' && !D.draw && !(k === 'point') ? ['draw'] : []);
  }
  function setKind(n: any, k: string) {
    const was = kindOf(n);
    n.o = n.o.filter((it: string) => !isKindOpt(it) && !(was === 'point' && /^(fill|inner sep|minimum size)$/.test(kv(it).k)));
    n.o = kindOpts(k).concat(n.o);
    if (k === 'point') n.text = '';
    else if (was === 'point' && !n.text) n.text = labelFor(n.name);
    if (k === 'text' && (n.text === '' || n.text == null && !n.name)) n.text = 'Text';
  }
  const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
  function newName(taken?: Set<string>) {
    const has = (s: string) => !!nOf(s) || !!(taken && taken.has(s));
    const ns = E.M.nodes.map((n: any) => n.name);
    if (ns.length && ns.every((s: string) => /^\d+$/.test(s))) { let k = Math.max(...ns.map(Number)) + 1; while (has(String(k))) k++; return String(k); }
    for (const c of ALPHA) if (!has(c)) return c;
    let k = 1; while (has('v' + k)) k++; return 'v' + k;
  }
  const labelFor = (name: string) => (/^\d+$/.test(name) ? null : F.labelTex(name));
  // edges
  const isBend = F.isBendOpt;
  const isLoopOpt = (it: string) => /^loop( (above|below|left|right))?$/.test(kv(it).k);
  const isDash = (it: string) => /^((densely|loosely) )?(dashed|dotted)$|^solid$/.test(kv(it).k);
  function bendOf(e: any) {
    for (const it of e.o) { const { k, v } = kv(it); if (k === 'bend left' || k === 'bend right') { const a = v == null ? 30 : parseFloat(v); return { kind: k.slice(5), a: isFinite(a) ? a : 30 }; } }
    return { kind: e.o.some(isBend) ? 'custom' : '', a: 30 };
  }
  function setBend(e: any, kind: string, a = 30) {
    e.o = e.o.filter((x: string) => !isBend(x));
    if ((kind === 'left' || kind === 'right') && a) e.o.unshift(`bend ${kind}${a !== 30 ? `=${F.num(a)}` : ''}`);
  }
  const loopOf = (e: any) => { for (const it of e.o) { const m = /^loop (above|below|left|right)$/.exec(kv(it).k); if (m) return m[1]; } return 'above'; };
  function setLoop(e: any, side: string) { e.o = e.o.filter((x: string) => !isLoopOpt(x)); e.o.unshift(`loop ${side}`); }
  const dashOf = (e: any) => { const it = e.o.find(isDash); return it ? (/dot/.test(it) ? 'dotted' : /dash/.test(it) ? 'dashed' : '') : ''; };
  function setDash(e: any, d: string) { e.o = e.o.filter((x: string) => !isDash(x)); if (d) e.o.push(d); }
  const OP_OF: Record<string, string> = { line: '--', arrow: '->', both: '<->' };
  const kindOfOp = (op: string) => (op === '--' ? 'line' : op === '<->' ? 'both' : 'arrow');
  function reverseEdge(e: any) {
    if (e.a === e.b) return;
    [e.a, e.b] = [e.b, e.a];
    if (e.op === '->') e.op = '<-'; else if (e.op === '<-') e.op = '->';
    // the picture stays: bend and label keep their sides
    if (e.op !== '--' && e.op !== '<->') {
      e.op = e.op === '<-' ? '->' : e.op;
    }
    const b = bendOf(e);
    if (b.kind === 'left' || b.kind === 'right') setBend(e, b.kind === 'left' ? 'right' : 'left', b.a);
    if (e.t != null) e.sw = !e.sw;
  }
  // an edge that runs the other way along an existing one bends, so neither hides the other
  function addEdge(a: string, b: string, extra?: string) {
    const loop = a === b;
    edit(() => {
      pinAll();
      const o: string[] = [];
      if (loop) o.push(`loop ${extra || freeSide(a)}`);
      else if (E.bent) o.push('bend left');
      if (E.dashed) o.push('dashed');
      const e = { a, b, op: OP_OF[E.kind] || '--', o, t: null, sw: false, lo: [] };
      // edges already between the two nodes (either way) fan out with the new one, so none hides another
      const twin = loop ? [] : E.M.edges.filter((f: any) => f.a !== f.b && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
      E.M.edges.push(e);
      if (twin.length) F.fan(twin.concat(e), a, e);
    });
    E.sel = { e: E.M.edges.length - 1 }; draw(); renderProps();
  }
  // the side of a node with the most room for a loop
  function freeSide(name: string) {
    const L = lay(), q = L.nodes.get(name);
    if (!q) return 'above';
    const dirs: number[] = [];
    for (const ed of L.edges) {
      const p = ed.P.pts;
      if (p.length < 2) continue;
      if (ed.a === name) dirs.push(Math.atan2(-(p[1][1] - p[0][1]), p[1][0] - p[0][0]));
      if (ed.b === name) { const k = p.length; dirs.push(Math.atan2(-(p[k - 2][1] - p[k - 1][1]), p[k - 2][0] - p[k - 1][0])); }
    }
    let best = 'above', gap = -1;
    for (const [side, a] of [['above', 90], ['below', 270], ['right', 0], ['left', 180]] as [string, number][]) {
      const r = (a * Math.PI) / 180, g = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(r - d), Math.cos(r - d))))) : 9;
      if (g > gap + 1e-6) { gap = g; best = side; }
    }
    return best;
  }
  function addNode(k: string, x: number, y: number) {
    let name = '';
    edit(() => {
      pinAll();
      name = newName();
      const n = { name, text: labelFor(name), o: [] as string[], x, y, lab: null };
      if (KIND[k]) { n.o = kindOpts(k); if (KIND[k].text != null) n.text = KIND[k].text; }
      E.M.nodes.push(n);
    });
    E.sel = { n: [name] }; draw(); renderProps();
    return name;
  }
  function deleteNodes(names: string[]) {
    edit(() => {
      pinAll();
      E.M.nodes = E.M.nodes.filter((n: any) => !names.includes(n.name));
      E.M.edges = E.M.edges.filter((e: any) => !names.includes(e.a) && !names.includes(e.b));
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteEdge(i: number) { edit(() => E.M.edges.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { const ns = selNs(), e = selE(); if (ns.length) deleteNodes(ns.map((n: any) => n.name)); else if (e) deleteEdge(E.sel.e); }
  function rename(n: any, to: string) {
    to = to.trim();
    if (!to || to === n.name || !/^[A-Za-z0-9_]+$/.test(to) || nOf(to)) return false;
    if (n.text == null) n.text = n.name;
    for (const e of E.M.edges) { if (e.a === n.name) e.a = to; if (e.b === n.name) e.b = to; }
    n.name = to; E.sel = { n: [to] };
    return true;
  }
  // nodes and edges from another model, renamed where the names are taken, moved by (dx, dy)
  function merge(M2: any, dx: number, dy: number) {
    const map = new Map<string, string>(), taken = new Set<string>();
    for (const n of M2.nodes) {
      const name = nOf(n.name) || taken.has(n.name) ? newName(taken) : n.name;
      taken.add(name); map.set(n.name, name);
      const keepText = n.text == null && name !== n.name ? n.name : n.text;
      E.M.nodes.push({ ...n, name, text: keepText, o: n.o.slice(), x: n.x + dx, y: n.y + dy, lab: n.lab ? { ...n.lab } : null });
    }
    for (const e of M2.edges) if (map.has(e.a) && map.has(e.b)) E.M.edges.push({ ...e, a: map.get(e.a), b: map.get(e.b), o: e.o.slice(), lo: (e.lo || []).slice() });
    return [...map.values()];
  }
  const isFresh = () => !E.M.nodes.length || snapCode().trim() === String(TD.GRAPH_DEFAULT).trim();
  // where something new goes: to the right of the drawing (cm)
  function besideAt(M2: any) {
    const xs = M2.nodes.map((n: any) => n.x), ys = M2.nodes.map((n: any) => n.y);
    const mx = Math.min(...xs), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (!E.M.nodes.length) return [-mx, -cy];
    const L = lay();
    return [snap((L.bb.x + L.bb.w) / PX + 1.25 - mx, true), snap(-(L.bb.y + L.bb.h / 2) / PX - cy, true)];
  }
  // a graph read from text replaces a new block's sample graph; otherwise it goes beside the drawing
  function takeGraph(r: any, at?: number[]) {
    const M2 = r.M;
    for (const n of M2.nodes) if (n.x == null) { n.x = 0; n.y = 0; }
    let names: string[] = [];
    if (isFresh() && !at) {
      begin();
      const keep = E.M;
      E.M = M2; E.M.dirty = true; E.M.raw = null;
      if (!M2.pre.length && keep.pre.length) M2.pre = keep.pre;
      commit();
      names = M2.nodes.map((n: any) => n.name);
      clampSel(); fit();
    } else {
      edit(() => {
        pinAll();
        const [dx, dy] = at ? [at[0] - avg(M2, 'x'), at[1] - avg(M2, 'y')] : besideAt(M2);
        names = merge(M2, snap(dx, true), snap(dy, true));
      });
    }
    E.sel = names.length ? { n: names } : null;
    E.kind = M2.edges.some((e: any) => e.op !== '--') ? 'arrow' : 'line';
    buildPalette(); draw(); renderProps(); updateTools();
    if (!at) fitIfOut();
    return names;
  }
  const avg = (M2: any, k: string) => { const v = M2.nodes.map((n: any) => n[k]); return (Math.min(...v) + Math.max(...v)) / 2; };
  function tplModel(k: string) {
    const T = TPL[k], src = tplSrc(k), M2 = F.parse(src);
    // the template's own names would rarely fit: number them on from the graph's
    const taken = new Set<string>();
    const ren = new Map<string, string>();
    for (const n of M2.nodes) { const nm = newName(taken); taken.add(nm); ren.set(n.name, nm); n.name = nm; n.text = labelFor(nm); }
    for (const e of M2.edges) { e.a = ren.get(e.a); e.b = ren.get(e.b); }
    // the template's node style is the graph's own
    M2.gopts = [];
    if (T.directed && E.kind === 'line') for (const e of M2.edges) e.op = '->';
    return { M: M2, kind: 'template', nodes: M2.nodes.length, edges: M2.edges.length };
  }
  function autoLayout(mode: string) {
    if (!E.M.nodes.length) return;
    const ns = selNs();
    edit(() => F.autoLayout(E.M, mode, E.M.nodes.length > 12 ? 1.5 : 1.75));
    if (ns.length) E.sel = { n: ns.map((n: any) => n.name) };
    fit();
    const said: Record<string, string> = { spring: uiText('editor.graph.placedSpring', 'Nodes spread out by their edges'), circle: uiText('editor.graph.placedCircle', 'Nodes placed on a circle'), layers: uiText('editor.graph.placedLayers', 'Nodes placed in layers from the sources'), grid: uiText('editor.graph.placedGrid', 'Nodes placed on a grid') };
    flash(said[mode]);
  }
  function flash(t: string, ms = 1800) { stageNote.flash(t, ms); }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'graphModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, GrapheditorFrame);
  document.body.appendChild(root);
  const svg = $('.graph-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'graph-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { n: [name] } | { e: index } | null, arm, kind, bent, dashed, view: { k (px per cm), ox, oy }, undo, redo,
  //   pending, start, done, drag, hover, knobAt, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 }, clip: any = null;
  let stopLocale: (() => void) | null = null;
  const snapCode = () => codeOf(E.M);
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); if (E.M.nodes.length) fitIfOut(); }
  function clampSel() {
    const s = E.sel;
    if (s && s.n) { s.n = s.n.filter((x: string) => nOf(x)); if (!s.n.length) E.sel = null; }
    if (s && s.e != null && !E.M.edges[s.e]) E.sel = null;
  }
  const selNs = () => (E.sel && E.sel.n ? E.sel.n.map(nOf).filter(Boolean) : []);
  const selN = () => { const ns = selNs(); return ns.length === 1 ? ns[0] : null; };
  const selE = () => (E.sel && E.sel.e != null ? E.M.edges[E.sel.e] || null : null);
  const isSel = (name: string) => !!(E.sel && E.sel.n && E.sel.n.includes(name));

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    const on = (k: string) => !!E && (k === `e:${E.kind}` || (k === 'e:bent' && !!E.bent) || (k === 'e:dashed' && !!E.dashed));
    pal.render([
      ...PAL.map(([cat, items]: any) => ({
        id: cat.fallback, title: caption(cat),
        // the shown name, the English one and the category's find it
        items: items.map(([k, label, , key]: any) => ({ id: k, label: ITEM[k].short ? caption(ITEM[k].short) : caption(label), title: caption(label), key, alt: label.fallback, keywords: `${k.slice(2)} ${caption(cat)} ${cat.fallback}`, svg: fitMini(TD.graphMini(ITEM[k].mini, 1e3), 64, 40, 1.6), on: on(k) })),
      })),
      { id: 'import', title: uiText('editor.graph.cat.import', 'Import'), items: [{
        id: 'i:text', class: 'ge-import', label: uiText('editor.graph.importText', 'From text…'), title: uiText('editor.graph.importTitle', 'Read a graph from text: an adjacency matrix or list, an edge list, DOT, Mermaid or JSON'),
        keywords: 'import adjacency matrix list dot mermaid json', svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h9l4 4v12H6z"/><path d="M15 4v4h4M9 12h7M9 15h7M9 18h4"/></svg>',
      }] },
    ], { armed: E?.arm });
  }
  // click: a node kind restyles the selected nodes or is armed for placing; an edge kind restyles the
  // selected edge and is the kind new ones get; a whole graph goes beside the drawing. Drag nodes and
  // graphs onto the canvas.
  let palDrag: any = null;
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e: any) => {
    if (!palDrag || !/^[nt]/.test(palDrag.k)) return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (palDrag.moved) { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = palDrag.k; draw(); }
  });
  list.addEventListener('pointerup', (e: any) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    if (!d.moved) { pick(d.k); return; }
    if (overStage(e)) {
      const at = toCm(e, !e.altKey);
      if (d.k[0] === 'n') addNode(d.k.slice(2), at[0], at[1]);
      else takeGraph(tplModel(d.k.slice(2)), at);
    }
    E.hover = null; draw();
  });
  function pick(k: string) {
    if (k === 'i:text') { importText(); return; }
    if (k[0] === 't') { takeGraph(tplModel(k.slice(2))); return; }
    if (k[0] === 'e') {
      if (E.arm) { E.arm = null; draw(); }
      const what = k.slice(2), e = selE();
      if (what === 'bent') { E.bent = !E.bent; if (e && e.a !== e.b) edit(() => setBend(e, E.bent ? 'left' : '', 30)); }
      else if (what === 'dashed') { E.dashed = !E.dashed; if (e) edit(() => setDash(e, E.dashed ? 'dashed' : '')); }
      else { E.kind = what; if (e) edit(() => { e.op = OP_OF[what]; }); }
      buildPalette();
      setTip(e ? '' : uiText('editor.graph.edgeTip', '{name}: point at a node, then drag its blue handle to another node (or back onto itself for a loop)', { name: caption(ITEM[k].name) }));
      return;
    }
    const ns = selNs(), kind = k.slice(2);
    if (ns.length && !E.arm) { edit(() => { for (const n of ns) setKind(n, kind); }); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? uiText('editor.graph.armTip', '{name}: click the grid to place it. Esc when done.', { name: caption(ITEM[k].name) }) : '');
  }
  function setTip(t: string) { stageNote.set(t); }

  // ---------------------------------------------------------------- reading text
  const FORMATS = (): Record<string, string> => ({ tikz: uiText('editor.graph.fmtTikz', 'TikZ graph'), matrix: uiText('editor.graph.fmtMatrix', 'adjacency matrix'), adjlist: uiText('editor.graph.fmtAdjList', 'adjacency list'), edges: uiText('editor.graph.fmtEdges', 'edge list'), dot: 'DOT', mermaid: 'Mermaid', json: 'JSON', template: '' });
  function readSaid(r: any) {
    const what = FORMATS()[r.kind] || r.kind;
    return uiText('editor.graph.readTip', 'Read {nodes} nodes and {edges} edges ({format}, {kind})', { nodes: r.nodes, edges: r.edges, format: what, kind: r.directed ? uiText('editor.graph.directed', 'directed') : uiText('editor.graph.undirected', 'undirected') });
  }
  async function importText() {
    const text = await TD.prompt(uiText('editor.graph.importTitleShort', 'Import a Graph'), '', {
      multiline: true, ok: uiText('editor.graph.import', 'Import'),
      message: uiText('editor.graph.importHelp', 'Paste an adjacency matrix (rows of 0 and 1, or weights), an adjacency list (a: b c), an edge list (a b, a -> b, 1 2 5), DOT, Mermaid, JSON or a TikZ \\graph. Edges with arrows or an unsymmetric matrix make a directed graph; numbers become edge labels.'),
      placeholder: '0 1 1\n1 0 1\n1 1 0',
    });
    if (text == null || !E) return;
    const r = F.fromText(String(text));
    if (!r) { await TD.alert(uiText('editor.graph.notGraph', 'No graph found'), uiText('editor.graph.notGraphBody', 'The text isn’t a graph in any of the formats this reads. Try one edge per line, like “a b” or “a -> b”.')); return; }
    takeGraph(r);
    flash(readSaid(r), 3000);
  }
  // nodes copied in this editor; anything else on the clipboard is read as a graph
  function copySel() {
    const ns = selNs();
    if (!ns.length) return false;
    const names = new Set(ns.map((n: any) => n.name));
    const M2 = { env: E.M.env, gopts: E.M.gopts.slice(), nodes: ns.map((n: any) => ({ ...n, o: n.o.slice() })), edges: E.M.edges.filter((e: any) => names.has(e.a) && names.has(e.b)).map((e: any) => ({ ...e, o: e.o.slice(), lo: (e.lo || []).slice() })), pre: [], post: [], warnings: [] };
    for (const n of M2.nodes) { const [x, y] = posOf(n); n.x = x; n.y = y; }
    const text = F.write(M2);
    clip = { text, M: M2, n: 0 };
    navigator.clipboard?.writeText(text).catch(() => {});
    flash(ns.length === 1 ? uiText('editor.graph.copiedOne', 'Copied 1 node') : uiText('editor.graph.copiedN', 'Copied {n} nodes', { n: ns.length }), 1200);
    return true;
  }
  function pasteText(text: string) {
    if (clip && text.trim() === clip.text.trim()) {
      clip.n++;
      const M2 = F.parse(clip.text);
      let names: string[] = [];
      edit(() => { pinAll(); names = merge(M2, 0.5 * clip.n, -0.5 * clip.n); });
      E.sel = { n: names }; draw(); renderProps();
      return;
    }
    const r = F.fromText(text);
    if (!r) { flash(uiText('editor.graph.pasteNone', 'The clipboard holds no graph this can read'), 2200); return; }
    takeGraph(r);
    flash(readSaid(r), 3000);
  }
  function duplicate() { if (!copySel()) return; pasteText(clip.text); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 600], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  const m = (x: number, y: number) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  const toCm = (e: any, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snap((x - v.ox) / v.k, snapOn), snap((v.oy - y) / v.k, snapOn)]; };
  const S = (x: number, y: number) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const nodeR = (q: any) => Math.max(q.r || 0, q.hw || 0, q.hh || 0) * (E.view.k / PX);
  function nodeAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e), kk = E.view.k / PX;
    let best = null, bd = Infinity;
    for (const [name, q] of L.nodes) {
      const [X, Y] = S(q.x, q.y), hw = Math.max(px, q.hw * kk + 3), hh = Math.max(px, q.hh * kk + 3);
      if (Math.abs(x - X) > hw || Math.abs(y - Y) > hh) continue;
      const d = Math.hypot(X - x, Y - y);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function edgeAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e), kk = E.view.k / PX;
    let best = null, bd = px;
    for (const ed of L.edges) {
      if (ed.label) {
        const [X, Y] = S(ed.label.x, ed.label.y), hw = (ed.label.b.w / 2) * kk + 2, hh = (ed.label.b.h / 2) * kk + 2;
        if (Math.abs(x - X) <= hw && Math.abs(y - Y) <= hh) return ed.i;
      }
      const p = ed.P.pts;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = S(p[i - 1][0], p[i - 1][1]), [bx, by] = S(p[i][0], p[i][1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = ed.i; }
      }
    }
    return best;
  }
  function fit() {
    const L = lay();
    E.view = fitView(rect(), L.empty ? { x: 0, y: -2 * PX, w: 4 * PX, h: 2 * PX } : L.bb, { scale: PX, margin: 0.5, min: 20, max: 140 });
    draw();
  }
  // fit only when part of the drawing is out of view
  function fitIfOut() {
    const L = lay(), r = rect(), [x1, y1] = S(L.bb.x, L.bb.y), [x2, y2] = S(L.bb.x + L.bb.w, L.bb.y + L.bb.h);
    if (x1 < 0 || y1 < 0 || x2 > r.width || y2 > r.height) fit();
  }

  // ---------------------------------------------------------------- drawing
  function outline(q: any, cls: string, pad: number) {
    const [X, Y] = S(q.x, q.y), kk = E.view.k / PX;
    if (q.shape === 'circle' || (q.hw * kk < 6 && q.hh * kk < 6)) return `<circle class="${cls}" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(Math.max(5, nodeR(q)) + pad)}"/>`;
    const hw = Math.max(5, q.hw * kk) + pad, hh = Math.max(5, q.hh * kk) + pad;
    return `<rect class="${cls}" x="${r2(X - hw)}" y="${r2(Y - hh)}" width="${r2(2 * hw)}" height="${r2(2 * hh)}" rx="${r2(Math.min(6, hh))}"/>`;
  }
  // the middle of an edge as drawn (screen)
  const midOf = (ed: any) => { const q = F.along(ed.P, ed.P.len / 2); return S(q.x, q.y); };
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    const step = k * GRID >= 7 ? GRID : 1, xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor((v.oy - H) / k / step), ye = Math.ceil(v.oy / k / step);
    let minor = '', major = '';
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy - j * step * k) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    const [OX, OY] = m(0, 0);
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/><path class="cz-origin" d="M${OX - 6},${OY}h12M${OX},${OY - 6}v12"/>`;
    const L = lay(), kk = k / PX;
    const se = selE(), sl = se && L.edges.find((x: any) => x.i === E.sel.e);
    if (sl) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})"><path class="ze-wsel" d="${sl.d}" stroke-width="${r2(10 / kk)}"/></g>`;
    for (const [name, q] of L.nodes) if (isSel(name)) out += outline(q, 'fy-vsel', 4);
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${F.draw({ type: 'graph', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { paper: PAPER, export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(uiText('editor.graph.empty', 'Place a node from the left, double-click the grid, or paste a graph'))}</text>`;
    const dragE = E.drag && E.drag.mode === 'edge';
    for (const [name, q] of L.nodes) {
      if (isSel(name)) continue;
      if (dragE && E.hover && E.hover.v === name) out += outline(q, 'fy-vtarget', 4);
      else if (E.hover && E.hover.v === name && !E.drag) out += outline(q, 'fy-vhov', 3);
    }
    if (dragE) {
      const d = E.drag, q = L.nodes.get(d.from);
      if (q) {
        const [x0, y0] = S(q.x, q.y);
        if (E.hover && E.hover.v === d.from) {
          const rr = nodeR(q) + 4;
          out += `<path class="ze-draft" d="M${r2(x0 - rr * 0.4)},${r2(y0 - rr * 0.92)}C${r2(x0 - rr)},${r2(y0 - rr * 2.6)} ${r2(x0 + rr)},${r2(y0 - rr * 2.6)} ${r2(x0 + rr * 0.4)},${r2(y0 - rr * 0.92)}"/>`;
        } else {
          const tq = E.hover && E.hover.v ? L.nodes.get(E.hover.v) : null, t = tq ? S(tq.x, tq.y) : m(...((E.hover && E.hover.at ? E.hover.at : d.at) as [number, number]));
          out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(t[0])},${r2(t[1])}"/>`;
          if (!tq) out += `<circle class="cz-snap on" cx="${r2(t[0])}" cy="${r2(t[1])}" r="5"/>`;
        }
      }
    }
    // the selected edge's bend handle, at its middle
    if (sl && !sl.loop && !E.drag) {
      const [X, Y] = midOf(sl);
      out += `<g class="ze-knob ze-mctl ge-bend"><title>${esc(uiText('editor.graph.bendHandle', 'Drag to bend the edge (⌥ for any angle)'))}</title><circle cx="${r2(X)}" cy="${r2(Y)}" r="5"/></g>`;
    }
    if (E.drag && E.drag.mode === 'bend' && sl) { const [X, Y] = midOf(sl); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    // the knob: a selected (or hovered) node's handle for drawing edges
    const one = selN();
    const kn_ = !E.drag && !E.arm && !E.ghost && (E.knobAt || (one && one.name));
    const kn = kn_ && L.nodes.get(kn_);
    E.knobPos = null;
    if (kn) {
      const dirs: number[] = [];
      for (const ed of L.edges) {
        const p = ed.P.pts;
        if (p.length < 2) continue;
        if (ed.a === kn_) dirs.push(Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]));
        if (ed.b === kn_) { const n = p.length; dirs.push(Math.atan2(p[n - 2][1] - p[n - 1][1], p[n - 2][0] - p[n - 1][0])); }
      }
      if (kn.label) dirs.push(Math.atan2(kn.label.y - kn.y, kn.label.x - kn.x));
      let ang = 0;
      if (dirs.length) {
        let best = -1;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * 2 * Math.PI, gap = Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d)))));
          if (gap > best + 1e-6) { best = gap; ang = a; }
        }
      }
      const [X, Y] = S(kn.x, kn.y), off = Math.max(4, Math.abs(Math.cos(ang)) * kn.hw * kk + Math.abs(Math.sin(ang)) * kn.hh * kk) + 12, kx = r2(X + off * Math.cos(ang)), ky = r2(Y + off * Math.sin(ang));
      E.knobPos = { v: kn_, X, Y, kx, ky };
      out += `<g class="ze-knob" data-v="${esc(kn_)}"><title>${esc(uiText('editor.graph.knob', 'Drag to another node for an edge, onto the grid for a new node, or back onto this one for a loop'))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    if ((E.arm || E.ghost) && E.hover && E.hover.at) { const [X, Y] = m(...(E.hover.at as [number, number])); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    if (E.drag && E.drag.mode === 'marquee' && E.drag.moved) { const d = E.drag; out += `<rect class="marquee" x="${r2(Math.min(d.sx, d.x))}" y="${r2(Math.min(d.sy, d.y))}" width="${r2(Math.abs(d.x - d.sx))}" height="${r2(Math.abs(d.y - d.sy))}"/>`; }
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
    if (kb && kb.classList.contains('ge-bend')) { begin(); E.drag = { mode: 'bend', e: E.sel.e }; return; }
    if (kb) { E.drag = { mode: 'edge', from: kb.dataset.v, at: toCm(e), cx: e.clientX, cy: e.clientY }; E.knobAt = null; return; }
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); addNode(E.arm.slice(2), x, y); return; }
    const vn = nodeAt(e);
    if (vn != null) {
      if (dbl && isSel(vn)) { editLabel({ n: vn }); return; }
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const cur = E.sel && E.sel.n ? E.sel.n.slice() : [];
        E.sel = { n: cur.includes(vn) ? cur.filter((x: string) => x !== vn) : cur.concat(vn) };
        if (!E.sel.n.length) E.sel = null;
        draw(); renderProps(); return;
      }
      if (!isSel(vn)) E.sel = { n: [vn] };
      const start = selNs().map((n: any) => ({ name: n.name, p: posOf(n) }));
      E.drag = { mode: 'move', v: vn, sx, sy, moved: false, start };
      draw(); renderProps(); return;
    }
    const ei = edgeAt(e);
    if (ei != null) {
      if (dbl && E.sel && E.sel.e === ei) { editLabel({ e: ei }); return; }
      E.sel = { e: ei }; E.drag = null; draw(); renderProps(); return;
    }
    if (dbl) { const [x, y] = toCm(e, !e.altKey); const name = addNode('', x, y); editLabel({ n: name }); return; }
    const base = e.shiftKey && E.sel && E.sel.n ? E.sel.n.slice() : [];
    if (!e.shiftKey) E.sel = null;
    E.drag = { mode: 'marquee', sx, sy, x: sx, y: sy, base, moved: false };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const vn = nodeAt(e, 10), kb = e.target.closest('.ze-knob');
      const h = E.arm ? { at: toCm(e, !e.altKey) } : vn ? { v: vn } : null;
      const kp = E.knobPos, onWay = (() => {
        if (!kp || kp.v !== E.knobAt) return false;
        const dx = kp.kx - kp.X, dy = kp.ky - kp.Y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - kp.X) * dx + (sy - kp.Y) * dy) / l2));
        return Math.hypot(kp.X + dx * t - sx, kp.Y + dy * t - sy) <= 12;
      })();
      const knob = vn || (kb && !kb.classList.contains('ge-bend') || onWay ? E.knobAt : null);
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.style.cursor = E.arm ? '' : nodeAt(e) != null ? 'move' : edgeAt(e) != null ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') { E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return; }
    if (d.mode === 'marquee') {
      d.x = sx; d.y = sy;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.moved = true;
      const L = lay(), x1 = Math.min(d.sx, sx), x2 = Math.max(d.sx, sx), y1 = Math.min(d.sy, sy), y2 = Math.max(d.sy, sy);
      const inside = [...L.nodes.values()].filter((q: any) => { const [X, Y] = S(q.x, q.y); return X >= x1 && X <= x2 && Y >= y1 && Y <= y2; }).map((q: any) => q.name);
      const all = [...new Set([...d.base, ...inside])];
      E.sel = all.length ? { n: all } : null;
      draw(); return;
    }
    if (d.mode === 'edge') {
      const vn = nodeAt(e, 10);
      E.hover = vn ? { v: vn } : { at: toCm(e, !e.altKey) };
      setTip(vn === d.from ? uiText('editor.graph.loopAt', 'Loop at {name}', { name: vn }) : vn ? uiText('editor.graph.edgeTo', 'Edge to {name}', { name: vn }) : uiText('editor.graph.dropTip', 'Drop on a node, or on the grid for a new one'));
      draw(); return;
    }
    if (d.mode === 'bend') {
      const ed = E.M.edges[d.e], L = lay();
      const A = L.nodes.get(ed.a), B = L.nodes.get(ed.b);
      if (!A || !B) return;
      // the bend angle whose curve passes the pointer: a bend θ puts the middle 0.2936·L·sin θ off the line
      const [px, py] = toCm(e, false), ax = A.x / PX, ay = -A.y / PX, bx = B.x / PX, by = -B.y / PX;
      const Ln = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / Ln, uy = (by - ay) / Ln;
      const h = (px - (ax + bx) / 2) * -uy + (py - (ay + by) / 2) * ux;
      let th = (Math.asin(Math.max(-1, Math.min(1, h / (0.2936 * Ln)))) * 180) / Math.PI;
      if (!e.altKey) th = Math.round(th / 5) * 5;
      th = Math.max(-85, Math.min(85, th));
      setBend(ed, Math.abs(th) < 3 ? '' : th > 0 ? 'left' : 'right', Math.abs(th));
      E.M.dirty = true;
      setTip(Math.abs(th) < 3 ? uiText('editor.graph.straightTip', 'Straight') : uiText('editor.graph.bendTip', 'Bend {side} {angle}°', { side: th > 0 ? uiText('editor.graph.left', 'left') : uiText('editor.graph.right', 'right'), angle: F.num(Math.abs(th)) }));
      draw(); renderProps(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); pinAll(); d.moved = true; }
      const k = E.view.k, lead = d.start.find((s: any) => s.name === d.v) || d.start[0];
      // the node under the pointer snaps to the grid; the others keep their distance from it
      const lx = snap(lead.p[0] + (sx - d.sx) / k, !e.altKey), ly = snap(lead.p[1] - (sy - d.sy) / k, !e.altKey), dx = lx - lead.p[0], dy = ly - lead.p[1];
      for (const s of d.start) { const n = nOf(s.name); if (n) { n.x = snap(s.p[0] + dx, false); n.y = snap(s.p[1] + dy, false); } }
      E.M.dirty = true;
      const ln = nOf(d.v);
      setTip(d.start.length > 1 ? uiText('editor.graph.movingN', 'Moving {n} nodes · ⌥ to place freely', { n: d.start.length }) : e.altKey ? uiText('editor.graph.nodeAt', '{name} at ({x}, {y})', { name: d.v, x: F.num(ln.x), y: F.num(ln.y) }) : uiText('editor.graph.nodeAtFree', '{name} at ({x}, {y}) · ⌥ to place freely', { name: d.v, x: F.num(ln.x), y: F.num(ln.y) }));
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
      const vn = nodeAt(e, 10);
      E.hover = null;
      if (vn) addEdge(d.from, vn);
      else if (overStage(e)) {
        const [x, y] = toCm(e, !e.altKey);
        begin();
        pinAll();
        const name = newName(), from = nOf(d.from), kinds = from ? from.o.filter(isKindOpt) : [];
        E.M.nodes.push({ name, text: from && from.text === '' ? '' : labelFor(name), o: kinds, x, y, lab: null });
        E.M.edges.push({ a: d.from, b: name, op: OP_OF[E.kind] || '--', o: [...(E.bent ? ['bend left'] : []), ...(E.dashed ? ['dashed'] : [])], t: null, sw: false, lo: [] });
        E.M.dirty = true; commit();
        E.sel = { n: [name] }; renderProps(); draw();
      }
      draw(); return;
    }
    if (d.mode === 'bend') { setTip(''); commit(); renderProps(); draw(); return; }
    if (d.mode === 'move' && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    if (d.mode === 'marquee') { renderProps(); draw(); return; }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the node's, edge's or canvas's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', note: 'note', loop: 'loop', circle: 'nodeCircle', box: 'nodeBox', rounded: 'nodeRounded', ellipse: 'nodeEllipse', text: 'nodeText', copy: 'copy', dup: 'duplicate', del: 'delete', swap: 'swapLabel', rev: 'reverse', line: 'straight', arrow: 'arrow', both: 'arrowBoth', left: 'bendLeft', right: 'bendRight', straight: 'straight', add: 'addNode', paste: 'paste', all: 'selectAll', import: 'importText' };
  // `on`: the current choice of a pick-one group, ticked
  const mItem = (act: string, label: string, icon: string, key?: string, on?: boolean) => menuRow(act, label, MI[icon], key, { danger: /^(ndel|edel)$/.test(act), checked: on });
  const cmd = isMac ? '⌘' : 'Ctrl+';
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const vn = nodeAt(e), ei = vn == null ? edgeAt(e) : null;
    if (vn != null && nOf(vn)) {
      if (!isSel(vn)) E.sel = { n: [vn] };
      const ns = selNs(), many = ns.length > 1, k = many ? '' : kindOf(ns[0]);
      menuRows = [...(many ? [] : [mItem('label', uiText('editor.graph.editLabel', 'Edit Label'), 'label', '↩'), mItem('note', ns[0].lab ? uiText('editor.graph.editNote', 'Edit Note') : uiText('editor.graph.addNote', 'Add Note'), 'note'), mItem('addloop', uiText('editor.graph.addLoop', 'Add Loop'), 'loop'), '-' as const]), mItem('k:circle', uiText('editor.graph.circle', 'Circle'), 'circle', 'C', k === 'circle'), mItem('k:box', uiText('editor.graph.box', 'Box'), 'box', 'B', k === 'box'), mItem('k:rounded', uiText('editor.graph.rounded', 'Rounded'), 'rounded', 'R', k === 'rounded'), mItem('k:ellipse', uiText('editor.graph.ellipse', 'Ellipse'), 'ellipse', 'E', k === 'ellipse'), mItem('k:text', uiText('editor.graph.text', 'Text'), 'text', 'T', k === 'text'), '-', mItem('copy', uiText('editor.graph.copy', 'Copy'), 'copy', cmd + 'C'), mItem('dup', uiText('editor.graph.duplicate', 'Duplicate'), 'dup', cmd + 'D'), '-', mItem('ndel', many ? uiText('editor.graph.deleteNodes', 'Delete {n} Nodes', { n: ns.length }) : uiText('editor.graph.deleteNode', 'Delete Node'), 'del', '⌫')];
    } else if (ei != null) {
      E.sel = { e: ei };
      const ed = E.M.edges[ei], loop = ed.a === ed.b, kk = kindOfOp(ed.op);
      menuRows = [mItem('label', uiText('editor.graph.editLabel', 'Edit Label'), 'label', '↩'), ...(ed.t != null ? [mItem('swap', uiText('editor.graph.labelOtherSide', 'Label on the Other Side'), 'swap')] : []), ...(loop ? [] : [mItem('rev', uiText('editor.graph.reverse', 'Reverse Direction'), 'rev')]), '-', mItem('op:line', uiText('editor.graph.line', 'Line'), 'line', '', kk === 'line'), mItem('op:arrow', uiText('editor.graph.arrow', 'Arrow'), 'arrow', '', kk === 'arrow'), mItem('op:both', uiText('editor.graph.both', 'Both ways'), 'both', '', kk === 'both'), '-', ...(loop ? [mItem('la', uiText('editor.graph.loopAbove', 'Loop Above'), 'loop'), mItem('lb', uiText('editor.graph.loopBelow', 'Loop Below'), 'loop'), mItem('ll', uiText('editor.graph.loopLeft', 'Loop Left'), 'loop'), mItem('lr', uiText('editor.graph.loopRight', 'Loop Right'), 'loop')] : [mItem('bleft', uiText('editor.graph.bendLeft', 'Bend Left'), 'left'), mItem('bright', uiText('editor.graph.bendRight', 'Bend Right'), 'right'), mItem('bnone', uiText('editor.graph.straight', 'Straight'), 'straight')]), '-', mItem('edel', uiText('editor.graph.deleteEdge', 'Delete Edge'), 'del', '⌫')];
    } else {
      E.ctxAt = toCm(e);
      menuRows = [mItem('addhere', uiText('editor.graph.addNodeHere', 'Add Node Here'), 'add'), mItem('paste', uiText('editor.graph.paste', 'Paste'), 'paste', cmd + 'V'), mItem('all', uiText('editor.graph.selectAll', 'Select All'), 'all', cmd + 'A'), '-', mItem('import', uiText('editor.graph.importText', 'From text…'), 'import')];
    }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the node or edge (TD.input.popup); the whole edit is one undo step. A label that
  // is all maths is edited as maths; anything else as text with $…$.
  let Lb: any = null;
  function editLabel(target: any) {
    if (!TD.input) return false;
    closeLabel();
    const n = target.n != null ? nOf(target.n) : null, e = target.e != null ? E.M.edges[target.e] : null, note = target.note ? nOf(target.note) : null;
    if (!n && !e && !note) return false;
    begin();
    const cur = note ? (note.lab ? note.lab.t : '') : n ? shownOf(n) : e.t || '';
    // MathLive has no line breaks: there a label of several lines is edited as its code
    const raw = TD.input.mode === 'mathlive' && F.isMultiline(cur), inner = raw ? null : mathOf(cur), math = inner != null || (!cur && !note && !(n && kindOf(n) === 'text'));
    const me: any = (Lb = { target });
    me.pop = TD.input.popup(stage, {
      text: math ? inner ?? '' : raw ? cur : toLines(cur).join('\n'), math, bare: true,
      at: () => labelPos(target),
      onInput: (t: string) => {
        const v = /\n/.test(t) ? fromLines(t, math) : math ? (t.trim() ? `$${t.trim()}$` : '') : t;
        if (note) note.lab = v ? { t: v, side: note.lab ? note.lab.side : 'above' } : null;
        else if (n) n.text = v === n.name ? null : v;
        else e.t = v === '' ? null : v;
        E.M.dirty = true; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(target: any) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(), kk = E.view.k / PX;
    let X = 0, Y = 0;
    const nn = target.n ?? target.note;
    if (nn != null) { const q = L.nodes.get(nn); if (q) { [X, Y] = S(q.x, q.y); Y += Math.max(6, q.hh * kk) + 10; } }
    else {
      const ed = L.edges.find((x: any) => x.i === target.e);
      if (ed) { const q = ed.label || F.along(ed.P, ed.P.len / 2); [X, Y] = S(q.x, q.y); Y += 14; }
    }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const COLK: Record<string, string> = { nfill: 'fill', ndraw: 'draw', ntext: 'text', ecol: 'color', etext: 'text', gfill: 'fill' };
  const isCol = (keys: string[]) => (it: string) => { const { k, v } = kv(it); return v != null && keys.includes(k) && F.unbrace(v) !== 'none'; };
  const isNCol = isCol(['fill', 'draw', 'text']), isECol = isCol(['color', 'text']);
  const getOpt = (o: string[], k: string) => { const it = o.find((x) => kv(x).k === k && kv(x).v != null && F.unbrace(kv(x).v) !== 'none'); return it ? F.unbrace(kv(it).v) : ''; };
  function setOpt(o: string[], k: string, v: string) {
    const i = o.findIndex((x) => kv(x).k === k && kv(x).v != null && F.unbrace(kv(x).v) !== 'none'), it = v ? `${k}=${TD.texColor.wrap(v)}` : null, r = o.slice();
    if (i < 0) { if (it) r.push(it); } else if (it) r[i] = it; else r.splice(i, 1);
    return r;
  }
  const SIDES = () => [['above', uiText('editor.graph.above', 'Above')], ['below', uiText('editor.graph.below', 'Below')], ['left', uiText('editor.graph.leftCap', 'Left')], ['right', uiText('editor.graph.rightCap', 'Right')]];
  const shapeSeg = (key: string, value: string, withPoint: boolean) => segments(uiText('editor.graph.shape', 'Shape'), key, value, [
    ['circle', '○', uiText('editor.graph.circle', 'Circle'), uiText('editor.graph.circle', 'Circle')], ['box', '□', uiText('editor.graph.box', 'Box'), uiText('editor.graph.box', 'Box')],
    ['rounded', '▢', uiText('editor.graph.rounded', 'Rounded'), uiText('editor.graph.rounded', 'Rounded')], ['ellipse', '⬭', uiText('editor.graph.ellipse', 'Ellipse'), uiText('editor.graph.ellipse', 'Ellipse')],
    ...(withPoint ? [['point', '•', uiText('editor.graph.point', 'Point'), uiText('editor.graph.point', 'Point')]] : []), ['text', 'T', withPoint ? uiText('editor.graph.text', 'Text') : uiText('editor.graph.plain', 'No outline'), withPoint ? uiText('editor.graph.text', 'Text') : uiText('editor.graph.plain', 'No outline')],
  ]);
  function defKind() {
    const D = F.nodeOpts(F.nodeBase(), gGet('nodes'), null);
    if (!D.draw && !D.fill) return 'text';
    if (D.shape === 'rectangle') return D.rc ? 'rounded' : 'box';
    return D.shape;
  }
  function setDefKind(k: string) {
    const keep = gGet('nodes').filter((it: string) => !isKindOpt(it) && !/^(rounded corners|sharp corners)$/.test(kv(it).k));
    const add: Record<string, string[]> = { circle: ['draw', 'circle'], box: ['draw', 'rectangle'], rounded: ['draw', 'rounded corners'], ellipse: ['draw', 'ellipse'], diamond: ['draw', 'diamond'], text: [] };
    gSet('nodes', (add[k] || []).concat(keep));
  }
  function renderProps() {
    if (!E) return;
    const M = E.M, ns = selNs(), n = ns.length === 1 ? ns[0] : null, e = selE();
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const colorRow = (label: string, key: string, value: string, options: Record<string, any> = {}) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, title: label, defaultLabel: options.dflt, defaultSwatch: options.dfltSw })), controlClass: 'ctl tc' });
    const none = uiText('editor.commonB.nonePlaceholder', 'none');
    if (n) {
      const [x, y] = posOf(n), deg = M.edges.filter((ed: any) => ed.a === n.name || ed.b === n.name).length;
      const rest = n.o.filter((it: string) => !isKindOpt(it) && !isNCol(it));
      show(uiText('editor.graph.node', 'Node'), deg === 1 ? uiText('editor.graph.oneEdge', '1 edge') : uiText('editor.graph.nEdges', '{n} edges', { n: deg }), [
        field(uiText('editor.graph.label', 'Label'), 'text', shownOf(n), { 'data-tx': 'text', placeholder: none }), field(uiText('editor.graph.name', 'Name'), 'name', n.name, { class: 'mono' }),
        shapeSeg('kind', kindOf(n), true),
        colorRow(uiText('editor.graph.fill', 'Fill'), 'nfill', getOpt(n.o, 'fill'), { dflt: uiText('editor.graph.colourDefault', 'Default') }), colorRow(uiText('editor.graph.outline', 'Outline'), 'ndraw', getOpt(n.o, 'draw'), { dfltSw: TD.css('#000000') }), colorRow(uiText('editor.graph.textColour', 'Text'), 'ntext', getOpt(n.o, 'text'), { dfltSw: TD.css('#000000') }),
        field(uiText('editor.graph.note', 'Note'), 'note', n.lab ? n.lab.t : '', { 'data-tx': 'text', placeholder: none }), segments(uiText('editor.graph.noteSide', 'Note side'), 'nside', n.lab ? n.lab.side : 'above', SIDES(), !n.lab),
        numField('x', 'x', F.num(x), 'cm', { step: '0.25' }), numField('y', 'y', F.num(y), 'cm', { step: '0.25' }),
        ...(n.x == null ? [note(uiText('editor.graph.noPosition', 'Placed by TikZ: moving it writes positions for every node.'))] : []),
        field(uiText('editor.commonB.options', 'Options'), 'nopts', rest.join(', '), { class: 'mono', placeholder: uiText('editor.graph.egThick', 'e.g. thick') }),
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.addLoop', 'Add Loop'), attrs: { 'data-ge': 'addloop' } }, { text: uiText('editor.graph.deleteNode', 'Delete Node'), attrs: { class: 'danger', 'data-ge': 'ndel' } }] },
      ]); return;
    }
    if (ns.length > 1) {
      const kinds: string[] = [...new Set<string>(ns.map(kindOf))], fills: string[] = [...new Set<string>(ns.map((q: any) => getOpt(q.o, "fill")))];
      show(uiText('editor.graph.nNodes', '{n} nodes', { n: ns.length }), uiText('editor.graph.multiHint', '⇧-click or drag a box to change the selection'), [
        shapeSeg('kind', kinds.length === 1 ? kinds[0] : '', true),
        colorRow(uiText('editor.graph.fill', 'Fill'), 'nfill', fills.length === 1 ? fills[0] : '', { dflt: fills.length === 1 ? uiText('editor.graph.colourDefault', 'Default') : uiText('editor.graph.mixed', 'Mixed') }),
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.alignH', 'Align Rows'), attrs: { 'data-ge': 'alignh', title: uiText('editor.graph.alignHTitle', 'Give them all the same y') } }, { text: uiText('editor.graph.alignV', 'Align Columns'), attrs: { 'data-ge': 'alignv', title: uiText('editor.graph.alignVTitle', 'Give them all the same x') } }] },
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.joinAll', 'Join Them All'), attrs: { 'data-ge': 'clique', title: uiText('editor.graph.joinAllTitle', 'An edge between every two of them') } }, { text: uiText('editor.graph.deleteNodes', 'Delete {n} Nodes', { n: ns.length }), attrs: { class: 'danger', 'data-ge': 'ndel' } }] },
      ]); return;
    }
    if (e) {
      const loop = e.a === e.b, b = bendOf(e), bending = b.kind === 'left' || b.kind === 'right';
      const rest = e.o.filter((it: string) => !isBend(it) && !isLoopOpt(it) && !isECol(it) && !isDash(it));
      const left = uiText('editor.graph.leftCap', 'Left'), right = uiText('editor.graph.rightCap', 'Right');
      show(loop ? uiText('editor.graph.loop', 'Loop') : uiText('editor.graph.edge', 'Edge'), loop ? uiText('editor.graph.atNode', 'at {name}', { name: e.a }) : `${e.a} ${e.op === '--' ? '—' : e.op === '<-' ? '←' : e.op === '<->' ? '↔' : '→'} ${e.b}`, [
        field(uiText('editor.graph.label', 'Label'), 'label', e.t || '', { 'data-tx': 'text', placeholder: none }),
        segments(uiText('editor.graph.labelSide', 'Label side'), 'side', e.sw ? -1 : 1, [[1, left, uiText('editor.graph.leftOfArrow', 'Left of the edge’s direction')], [-1, right, uiText('editor.graph.swapRight', 'Right of the edge’s direction (’)')]], e.t == null),
        segments(uiText('editor.graph.ends', 'Ends'), 'op', kindOfOp(e.op), [['line', '—', uiText('editor.graph.line', 'Line')], ['arrow', '→', uiText('editor.graph.arrow', 'Arrow')], ['both', '↔', uiText('editor.graph.both', 'Both ways')]]),
        loop ? segments(uiText('editor.graph.loop', 'Loop'), 'loop', loopOf(e), SIDES())
          : segments(uiText('editor.graph.bend', 'Bend'), 'bend', b.kind === 'custom' ? '' : b.kind, [['', uiText('editor.graph.straight', 'Straight')], ['left', left], ['right', right]]),
        ...(loop ? [] : [numField(uiText('editor.graph.angle', 'Angle'), 'angle', bending ? F.num(b.a) : '', '°', { min: '5', max: '90', step: '5', ...(!bending ? { disabled: true } : {}) })]),
        segments(uiText('editor.graph.lineStyle', 'Line'), 'dash', dashOf(e), [['', uiText('editor.graph.solid', 'Solid')], ['dashed', uiText('editor.graph.dashed', 'Dashed')], ['dotted', uiText('editor.graph.dotted', 'Dotted')]]),
        colorRow(uiText('editor.graph.colour', 'Colour'), 'ecol', getOpt(e.o, 'color'), { dfltSw: TD.css('#000000') }),
        field(uiText('editor.commonB.options', 'Options'), 'eopts', rest.join(', '), { class: 'mono', placeholder: uiText('editor.graph.egThick', 'e.g. thick') }),
        { kind: 'actions' as const, class: 'row', buttons: [...(loop ? [] : [{ text: uiText('editor.graph.reverse', 'Reverse Direction'), attrs: { 'data-ge': 'rev' } }]), { text: uiText('editor.graph.deleteEdge', 'Delete Edge'), attrs: { class: 'danger', 'data-ge': 'edel' } }] },
      ]); return;
    }
    const def = gGet('nodes'), D = F.nodeOpts(F.nodeBase(), def, null), size = D.minW ? F.num(Math.round((D.minW / PX) * 100) / 10) : '';
    const dir = M.edges.length && M.edges.every((ed: any) => ed.op !== '--') ? 'arrow' : M.edges.length && M.edges.every((ed: any) => ed.op === '--') ? 'line' : '';
    renderView(props, FormPanel, { sections: [
      { ...section(uiText('editor.graph.title', 'Graph'), [
        shapeSeg('defkind', defKind(), false),
        numField(uiText('editor.graph.size', 'Size'), 'defsize', size, 'mm', { min: '0', step: '1', placeholder: uiText('editor.graph.sizeAuto', 'fit') }),
        colorRow(uiText('editor.graph.fill', 'Fill'), 'gfill', getOpt(def, 'fill'), { dflt: uiText('editor.graph.colourNone', 'None') }),
        segments(uiText('editor.graph.edges', 'Edges'), 'alldir', dir, [['line', uiText('editor.graph.undirectedCap', 'Undirected')], ['arrow', uiText('editor.graph.directedCap', 'Directed')]], !M.edges.length),
        note(uiText('editor.graph.help1', 'Double-click the grid for a node, drag a node’s blue handle to another for an edge, and double-click either to label it. Drag a box round nodes to select several; ⌥ places freely. Paste an adjacency matrix, an edge list or other graph text straight onto the canvas.')),
      ], 'sec'), summary: uiText('editor.graph.summary', '{nodes} nodes · {edges} edges', { nodes: M.nodes.length, edges: M.edges.length }) },
      section(uiText('editor.graph.autoLayout', 'Auto layout'), [
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.spring', 'Spread Out'), attrs: { 'data-ge': 'spring', title: uiText('editor.graph.springTitle', 'Joined nodes pull together, the rest push apart') } }, { text: uiText('editor.graph.onCircle', 'On a Circle'), attrs: { 'data-ge': 'circle' } }] },
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.inLayers', 'In Layers'), attrs: { 'data-ge': 'layers', title: uiText('editor.graph.inLayersTitle', 'Rows down from the nodes nothing points to') } }, { text: uiText('editor.graph.onGrid', 'On a Grid'), attrs: { 'data-ge': 'grid' } }] },
        note(uiText('editor.graph.autoNote', 'Places every node. One undo step.')),
      ], 'sec'),
      section(uiText('editor.graph.cat.import', 'Import'), [
        { kind: 'actions' as const, class: 'row', buttons: [{ text: uiText('editor.graph.importButton', 'Import From Text…'), attrs: { 'data-ge': 'import' } }] },
        note(uiText('editor.graph.importNote', 'Adjacency matrix or list, edge list, DOT, Mermaid or JSON. It replaces the sample graph, or goes beside your own.')),
      ], 'sec'),
    ] });
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { if (e.target.dataset.f === 'name') { const n = selN(); if (n && n.name !== e.target.value.trim()) e.target.value = n.name; } commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const ns = selNs(), n = ns.length === 1 ? ns[0] : null, e = selE();
    if (n) {
      if (f === 'name') { if (!rename(n, t.value)) return; }
      else if (f === 'text') n.text = t.value === n.name ? null : t.value;
      else if (f === 'note') n.lab = t.value ? { t: t.value, side: n.lab ? n.lab.side : 'above' } : null;
      else if (f === 'x' || f === 'y') { const v = parseFloat(t.value); if (!isFinite(v)) return; pinAll(); n[f] = v; }
      else if (f === 'nopts') n.o = n.o.filter((it: string) => isKindOpt(it) || isNCol(it)).concat(F.opts(t.value));
      else if (COLK[f]) n.o = setOpt(n.o, COLK[f], t.value);
    } else if (ns.length > 1) {
      if (f === 'nfill') for (const q of ns) q.o = setOpt(q.o, 'fill', t.value);
      else return;
    } else if (e) {
      if (f === 'label') e.t = t.value === '' ? null : t.value;
      else if (f === 'angle') { const v = parseFloat(t.value); if (!isFinite(v)) return; setBend(e, bendOf(e).kind, v); }
      else if (f === 'eopts') { const keep = e.o.filter((it: string) => isBend(it) || isLoopOpt(it) || isECol(it) || isDash(it)); e.o = keep.concat(F.opts(t.value)); }
      else if (COLK[f]) e.o = setOpt(e.o, COLK[f], t.value);
    } else {
      if (f === 'defsize') { const v = parseFloat(t.value), keep = gGet('nodes').filter((it: string) => kv(it).k !== 'minimum size'); gSet('nodes', isFinite(v) && v > 0 ? keep.concat(`minimum size=${F.num(v)}mm`) : keep); }
      else if (f === 'gfill') gSet('nodes', setOpt(gGet('nodes'), 'fill', t.value));
      else return;
    }
    E.M.dirty = true; draw();
  });
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, ns = selNs(), e = selE();
    if (ns.length) edit(() => {
      if (f === 'kind') for (const n of ns) setKind(n, v);
      else if (f === 'nside' && ns[0].lab) ns[0].lab.side = v;
    });
    else if (e) edit(() => {
      if (f === 'side') e.sw = +v < 0;
      else if (f === 'op') e.op = OP_OF[v];
      else if (f === 'bend') setBend(e, v, bendOf(e).a || 30);
      else if (f === 'loop') setLoop(e, v);
      else if (f === 'dash') setDash(e, v);
    });
    else edit(() => {
      if (f === 'defkind') setDefKind(v);
      else if (f === 'alldir') for (const ed of E.M.edges) ed.op = OP_OF[v];
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ge="undo"]', root).disabled = !E.undo.length;
    $('[data-ge="redo"]', root).disabled = !E.redo.length;
    $('[data-ge="spring"]', root).disabled = !E.M.nodes.length;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-ge]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ge as string, b);
  });
  function act(a: string, b?: any) {
    const e = selE(), ns = selNs(), n = ns.length === 1 ? ns[0] : null;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (/^(spring|circle|layers|grid)$/.test(a)) autoLayout(a);
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'ndel') { if (ns.length) deleteNodes(ns.map((q: any) => q.name)); }
    else if (a === 'edel') { if (e) deleteEdge(E.sel.e); }
    else if (a === 'label') { if (E.sel) editLabel(n ? { n: n.name } : E.sel); }
    else if (a === 'note') { if (n) editLabel({ note: n.name }); }
    else if (a === 'import') importText();
    else if (a === 'copy' && b && b.dataset.ge === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = uiText('ui.copied', 'Copied'); setTimeout(() => (b.textContent = uiText('ui.copy', 'Copy')), 1200); });
    else if (a === 'copy') copySel();
    else if (a === 'dup') duplicate();
    else if (a === 'paste') navigator.clipboard?.readText().then((t) => { if (E && t) pasteText(t); }).catch(() => flash(uiText('editor.graph.pasteKeys', 'Press {key}V to paste', { key: cmd }), 2000));
    else if (a === 'all') { E.sel = E.M.nodes.length ? { n: E.M.nodes.map((q: any) => q.name) } : null; draw(); renderProps(); }
    else if (a === 'addhere') { const [x, y] = E.ctxAt || [0, 0]; const name = addNode('', x, y); editLabel({ n: name }); }
    else if (a.startsWith('k:')) { if (ns.length) edit(() => { for (const q of ns) setKind(q, a.slice(2)); }); }
    else if (ns.length > 1 && (a === 'alignh' || a === 'alignv')) edit(() => {
      pinAll();
      const k = a === 'alignh' ? 'y' : 'x', v = ns.reduce((s: number, q: any) => s + q[k], 0) / ns.length;
      for (const q of ns) q[k] = snap(v, true);
    });
    else if (ns.length > 1 && a === 'clique') edit(() => {
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const p = ns[i].name, q = ns[j].name;
        if (!E.M.edges.some((ed: any) => (ed.a === p && ed.b === q) || (ed.a === q && ed.b === p))) E.M.edges.push({ a: p, b: q, op: OP_OF[E.kind] || '--', o: [], t: null, sw: false, lo: [] });
      }
    });
    else if (n && a === 'addloop') addEdge(n.name, n.name);
    else if (e) {
      if (a === 'rev') edit(() => reverseEdge(e));
      else if (a === 'swap') edit(() => { e.sw = !e.sw; });
      else if (a === 'bleft') edit(() => setBend(e, 'left'));
      else if (a === 'bright') edit(() => setBend(e, 'right'));
      else if (a === 'bnone') edit(() => setBend(e, ''));
      else if (a.startsWith('op:')) edit(() => { e.op = OP_OF[a.slice(3)]; });
      else if (/^l[ablr]$/.test(a)) edit(() => setLoop(e, ({ la: 'above', lb: 'below', ll: 'left', lr: 'right' } as Record<string, string>)[a]));
    }
  }
  function syncCode() {
    const M = E.M;
    count.textContent = `${M.nodes.length === 1 ? uiText('editor.graph.oneNode', '1 node') : uiText('editor.graph.nNodes', '{n} nodes', { n: M.nodes.length })} · ${M.edges.length === 1 ? uiText('editor.graph.oneEdge', '1 edge') : uiText('editor.graph.nEdges', '{n} edges', { n: M.edges.length })}`;
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, F.layout({ src: c }).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit();
    clampSel(); draw(); renderProps(); updateTools();
    showCodeNotes(codeMsg, F.layout({ src: codeTa.value }).warnings);
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (inEditorMenu(e)) return; // the right-click menu's own keys: arrows, Enter, Esc
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('.qe-item, .cz-part, [data-cmd], [data-tool], [data-ex]')) return;
    if (!E || root.hidden || dock.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if ((e.target as Element).closest && (e.target as Element).closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target as Element).closest && (e.target as Element).closest('input, textarea, select'));
    // ⌘V reaches the paste event below, ⌘C copies the field's text in a field
    if (mod && (e.key === 'v' || e.key === 'V')) return;
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { (e.target as HTMLElement).blur(); return; }
      if (editorMenuOpen()) { closeMenu(); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && e.key === 'a') { e.preventDefault(); act('all'); return; }
    if (mod && e.key === 'c') { if (selNs().length) { e.preventDefault(); copySel(); } return; }
    if (mod && e.key === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel) { e.preventDefault(); const n = selN(); if (!editLabel(n ? { n: n.name } : E.sel)) focusField(); return; }
    const ns = selNs();
    if (e.key.startsWith('Arrow') && ns.length) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      edit(() => { pinAll(); for (const n of ns) { n.x = snap(n.x + dx, false); n.y = snap(n.y + dy, false); } });
      return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });
  // pasting onto the canvas: copied nodes, or a graph written down in any of the formats
  window.addEventListener('paste', (e: ClipboardEvent) => {
    if (!E || root.hidden || document.querySelector('.td-dialog')) return;
    const t = e.target as Element;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], .td-pop-ml')) return;
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault(); e.stopPropagation();
    if (text.trim()) pasteText(text);
  }, true);

  // ---------------------------------------------------------------- open / close
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.graph.discard', 'Discard changes to this graph?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    const directed = M.edges.length && M.edges.filter((e: any) => e.op !== '--').length > M.edges.length / 2;
    E = { M, sel: null, arm: null, kind: directed ? 'arrow' : 'line', bent: false, dashed: false, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.graphEditor = { open, dockable: true, close: () => dock.detach() };
})();
