import { captions } from '../i18n/messages';
import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import { field, numField, segments, note } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import FteditorFrame from '../ui/editors/FteditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { TREE_CHILD, TREE_SIBLING } from '../ui/kit/icons';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName, pressesFocused } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
import { onLabelFontsChange } from '../domain/label-image';
// Tree editor: the overlay that opens on a Tree block. A palette of subtrees, templates and node and edge
// styles; the tree drawn by the canvas renderer, where nodes are selected, added, relabelled and dragged
// onto other nodes; the selection's properties; and beside them the forest code, live both ways.
// TD.ftEditor.open(block, onDone) — block: { src, size, font }; onDone({ src }) on Done.
(function () {
  const F = TD.ft;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8';

  // ---------------------------------------------------------------- palette
  // [key, name, kind, payload, mini]: kind 'tree' adds a subtree, 'template' replaces the tree,
  // 'shape' / 'edge' / 'fill' style the selected nodes (or every node when none is selected)
  const SHAPES: Record<string, any> = { plain: [], box: ['draw'], round: ['draw', 'rounded corners'], circle: ['circle', 'draw'], ellipse: ['ellipse', 'draw'] };
  const SHAPE_KEYS = ['draw', 'circle', 'ellipse', 'rectangle', 'rounded corners', 'sharp corners'];
  const EDGES: Record<string, any> = { line: [], arrow: ['edge={->}'], dashed: ['edge=dashed'], roof: ['roof'], fork: ['forked edge'], none: ['no edge'] };
  const EDGE_KEYS = ['edge', 'no edge', 'roof', 'forked edge'];
  const FILLS: any[] = [['none', message('editor.ft.fill.none', 'None'), null], ['black!8', message('editor.ft.fill.grey', 'Grey')], ['blue!12', message('editor.ft.fill.blue', 'Blue')], ['green!15', message('editor.ft.fill.green', 'Green')], ['yellow!30', message('editor.ft.fill.yellow', 'Yellow')], ['red!12', message('editor.ft.fill.red', 'Red')]];
  const wrapF = (body: any, pre = '') => `\\begin{forest}\n${pre ? `  ${pre}\n` : ''}${body}\n\\end{forest}`;
  const PAL: any[] = [
    [message('editor.ft.cat.add', 'Add'), [
      ['node', message('editor.ft.node', 'Node'), 'tree', '[Node]', wrapF('[\\phantom{x}, phantom [Node, draw]]')],
      ['two', message('editor.ft.twoChildren', 'Two children'), 'tree', '[Node [A] [B]]'],
      ['three', message('editor.ft.threeChildren', 'Three children'), 'tree', '[Node [A] [B] [C]]'],
      ['bin', message('editor.ft.binarySubtree', 'Binary subtree'), 'tree', '[Node [A [A1] [A2]] [B [B1] [B2]]]'],
    ]],
    [message('editor.ft.cat.templates', 'Templates'), [
      ['syntax', message('editor.ft.syntaxTree', 'Syntax tree'), 'template', wrapF("  [S\n    [NP [D [the]] [N [cat]]]\n    [VP [V [sat]] [PP [P [on]] [NP [the mat, roof]]]]\n  ]")],
      ['org', message('editor.ft.orgChart', 'Org chart'), 'template', wrapF('  [Director\n    [Design [UX] [Brand]]\n    [Engineering [Web] [Mobile] [Data]]\n    [Sales [EMEA] [APAC]]\n  ]', 'forked edges, for tree={draw, rounded corners, fill=black!4, align=center}')],
      ['dir', message('editor.ft.directory', 'Directory'), 'template', wrapF('  [project/\n    [src/ [main.tex] [figures.tex]]\n    [figures/ [plot.pdf]]\n    [README.md]\n  ]', 'for tree={folder, grow\'=0, font=\\ttfamily}')],
      ['decision', message('editor.ft.decisionTree', 'Decision tree'), 'template', wrapF('  [{$x_1 \\le 3$?}\n    [{$x_2 \\le 1$?}, edge label={node[midway, left]{yes}}\n      [A, ellipse] [B, ellipse]]\n    [C, ellipse, edge label={node[midway, right]{no}}]\n  ]', 'for tree={draw, edge={->}, s sep=8mm, l sep=8mm}')],
      ['binary', message('editor.ft.binaryTree', 'Binary tree'), 'template', wrapF('  [8\n    [3 [1] [6 [4] [7]]]\n    [10 [, phantom] [14 [13] [, phantom]]]\n  ]', 'for tree={circle, draw, minimum size=2em}')],
      ['prob', message('editor.ft.probabilityTree', 'Probability tree'), 'template', wrapF('  [, circle, fill=black, inner sep=1.5pt\n    [$H$ [$HH$] [$HT$]]\n    [$T$ [$TH$] [$TT$]]\n  ]', "for tree={grow'=0, l=18mm, s sep=3mm}")],
    ]],
    [message('editor.ft.cat.nodeShape', 'Node shape'), [
      ['plain', message('editor.ft.plain', 'Plain'), 'shape', 'plain', wrapF('[Node]')],
      ['box', message('editor.ft.box', 'Box'), 'shape', 'box', wrapF('[Node, draw]')],
      ['round', message('editor.ft.rounded', 'Rounded'), 'shape', 'round', wrapF('[Node, draw, rounded corners]')],
      ['circle', message('editor.ft.circle', 'Circle'), 'shape', 'circle', wrapF('[$n$, circle, draw]')],
      ['ellipse', message('editor.ft.ellipse', 'Ellipse'), 'shape', 'ellipse', wrapF('[Node, ellipse, draw]')],
      ['shade', message('editor.ft.shaded', 'Shaded'), 'fill', 'black!8', wrapF('[Node, draw, fill=black!8]')],
      ['phantom', message('editor.ft.phantom', 'Phantom'), 'phantom', 'phantom', wrapF('[A [B] [, phantom] [C]]')],
    ]],
    [message('editor.ft.cat.edge', 'Edge'), [
      ['line', message('editor.ft.line', 'Line'), 'edge', 'line', wrapF('[A [B]]')],
      ['arrow', message('editor.ft.arrow', 'Arrow'), 'edge', 'arrow', wrapF('[A [B, edge={->}]]')],
      ['dashed', message('editor.ft.dashed', 'Dashed'), 'edge', 'dashed', wrapF('[A [B, edge=dashed]]')],
      ['roof', message('editor.ft.roof', 'Roof'), 'edge', 'roof', wrapF('[NP [the big cat, roof]]')],
      ['fork', message('editor.ft.forked', 'Forked'), 'edge', 'fork', wrapF('[A [B, forked edge] [C, forked edge]]')],
      ['none', message('editor.ft.noEdge', 'No edge'), 'edge', 'none', wrapF('[A [B, no edge]]')],
    ]],
  ];
  const ITEM: Record<string, any> = {};
  for (const [cat, items] of PAL) for (const [k, name, kind, payload, mini] of items) ITEM[k] = { k, name, kind, payload, cat, mini: mini || wrapF(payload) };

  // ---------------------------------------------------------------- model
  // T: { pre: [options], root: node | null }; node: { c, o: [options], k: [children] }
  const load = (src: any) => F.parse(F.unwrap(src).inner);
  const codeOf = (T: any) => F.code(T);
  const keyOf = (str: any) => F.opt(str).k;
  const clone = (n: any) => JSON.parse(JSON.stringify(n));
  const subtree = (txt: any) => F.parse(txt).root;
  function order(T: any) { const out: any[] = []; const go = (n: any) => { out.push(n); n.k.forEach(go); }; if (T.root) go(T.root); return out; }
  function parentOf(T: any, n: any) { let hit = null; const go = (p: any) => { for (const c of p.k) { if (c === n) hit = p; else go(c); } }; if (T.root) go(T.root); return hit; }
  const inside = (a: any, b: any) => { if (a === b) return true; return b.k.some((c: any) => inside(a, c)); }; // a is in b's subtree
  function detach(T: any, n: any) {
    if (T.root === n) { T.root = null; return; }
    const p: any = parentOf(T, n);
    if (p) p.k.splice(p.k.indexOf(n), 1);
  }
  // the selected nodes, minus those inside another selected node's subtree
  const tops = (nodes: any) => nodes.filter((n: any) => !nodes.some((m: any) => m !== n && inside(n, m)));
  // `for tree={…}` in the preamble: read / write its list
  function forTree(T: any) { const o = T.pre.find((x: any) => keyOf(x) === 'for tree'); return o ? F.optList(F.opt(o).v) : []; }
  function setForTree(T: any, list: any) {
    const i = T.pre.findIndex((x: any) => keyOf(x) === 'for tree'), v = list.length ? `for tree={${list.join(', ')}}` : null;
    if (i >= 0) { if (v) T.pre[i] = v; else T.pre.splice(i, 1); } else if (v) T.pre.push(v);
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'ftModal';
  root.className = 'modal';
  root.hidden = true;
  const FI: Record<string, any> = {
    child: TREE_CHILD, // src/ui/kit/icons.ts: the head's Add Child button draws the same
    // the filled box is the new node: after puts it right of the selected (outlined) one, before puts it left
    sib: TREE_SIBLING,
    sibBefore: '<path class="qo" d="M10 1.5v3M5.5 4.5h9M5.5 4.5v3M14.5 4.5v3"/><rect class="qf" x="1.5" y="7" width="8" height="6"/><rect class="qo" x="11" y="7.5" width="7" height="5"/>',
    // the crossed-out node goes; its children stay, joined to its parent
    unwrap: '<rect class="qo" x="6.5" y="1.5" width="7" height="5"/><path class="qo" d="M6.5 1.5l7 5M13.5 1.5l-7 5M10 6.5v3M3.5 9.5h13M3.5 9.5v2M10 9.5v2M16.5 9.5v2"/><rect class="qf" x="1.5" y="11.5" width="4" height="5"/><rect class="qf" x="8" y="11.5" width="4" height="5"/><rect class="qf" x="14.5" y="11.5" width="4" height="5"/>',
    parent: '<rect class="qf" x="6" y="1.5" width="8" height="6"/><path class="qo" d="M10 7.5v4"/><rect class="qo" x="6.5" y="11.5" width="7" height="5"/>',
    earlier: '<path class="qo" d="M8 6l-4 4 4 4M4 10h12"/>',
    later: '<path class="qo" d="M12 6l4 4-4 4M16 10H4"/>',
    lift: '<rect class="qo" x="6.5" y="1.5" width="7" height="5"/><path class="qo" d="M3 18.5h14M10 6.5v6"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    copy: '<rect class="qo" x="6.5" y="6.5" width="10" height="11"/><path class="qo" d="M3.5 13.5v-10h10"/>',
    paste: '<rect class="qo" x="4.5" y="3.5" width="11" height="14"/><path class="qo" d="M7.5 3.5v-1h5v1M7.5 9.5h5M7.5 12.5h5"/>',
    // a phantom keeps its place but isn't drawn: a dashed node; making one visible again draws it solid
    phantom: '<rect class="qo" x="4.5" y="6" width="11" height="8" stroke-dasharray="2 1.6"/>',
    visible: '<rect class="qo" x="4.5" y="6" width="11" height="8"/>',
  };
  // tree icons are drawn growing down with siblings left to right; TURNS says which follow the tree's direction
  const TURNS = new Set(['child', 'sib', 'sibBefore', 'parent', 'earlier', 'later', 'lift', 'unwrap']);
  // the drawing inside the icon (a menu row draws it in its own svg), turned to follow the tree where it points
  const ficIn = (k: any, L?: any) => (TURNS.has(k) ? `<g class="fe-turn" transform="${turnXf(L)}">${FI[k]}</g>` : FI[k]);
  // the 20×20 icon's x axis along the siblings (U) and y axis along the growth (G), about its centre
  function turnXf(L: any) {
    const U = (L && L.U) || [1, 0], G = (L && L.G) || [0, 1], r = (v: any) => Math.round(v * 1000) / 1000;
    return `matrix(${r(U[0])} ${r(U[1])} ${r(G[0])} ${r(G[1])} ${r(10 - 10 * (U[0] + G[0]))} ${r(10 - 10 * (U[1] + G[1]))})`;
  }
  mountFrame(root, FteditorFrame);
  document.body.appendChild(root);
  const svg = $('.fe-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'fe-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { T, sel: [nodes], view: {ox, oy, k}, undo, redo, pending, start, done, drag, hover, drop, ghost, st, codeAt, codeTimer, clip, L }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  // a served font read for the label pictures (src/domain/label-image.ts): an open editor draws its labels again in it
  onLabelFontsChange(() => { if (E) draw(); });
  let stopLocale: (() => void) | null = null;
  const snap = () => (E.typed = keepComments(E.typed, codeOf(E.T))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snap(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); commit(); cleanSel(); draw(); keepInView(); renderProps(); }
  function restore(code: any) {
    const idx = E.sel.map((n: any) => order(E.T).indexOf(n));
    E.typed = code; E.T = load(code);
    const o = order(E.T);
    E.sel = idx.map((i: any) => o[i]).filter(Boolean);
    draw(); renderProps(); updateTools();
  }
  function cleanSel() { const o = new Set(order(E.T)); E.sel = E.sel.filter((n: any) => o.has(n)); }
  const one = () => (E.sel.length === 1 ? E.sel[0] : null);
  const select = (nodes: any) => { E.sel = nodes; draw(); renderProps(); };
  const blockOf = () => ({ type: 'forest', x: 0, y: 0, src: snap(), size: E.st.size, font: E.st.font, color: '#1c1b19' });
  // the layout's record of a node (same preorder as the model)
  const geoOf = (n: any) => { const i = order(E.T).indexOf(n); return i >= 0 && E.L ? E.L.nodes[i] : null; };

  // ---------------------------------------------------------------- tree edits
  const newNode = (c = 'Node') => ({ c, o: [], k: ([] as any[]) });
  function addChild(p: any, n = newNode(), at = p.k.length) { p.k.splice(at, 0, n); return n; }
  function addRoot() { edit(() => { E.T.root = newNode('Root'); }); select([E.T.root]); editLabel(E.T.root); }
  function addChildTo(p: any) { let n; edit(() => { n = addChild(p); }); select([n]); editLabel(n); }
  function addSibling(n: any, before?: any) {
    const p: any = parentOf(E.T, n);
    if (!p) { addChildTo(n); return; }
    let m;
    edit(() => { m = addChild(p, newNode(), p.k.indexOf(n) + (before ? 0 : 1)); });
    select([m]); editLabel(m);
  }
  function addParent(n: any) {
    const p: any = parentOf(E.T, n);
    let m;
    edit(() => {
      m = newNode();
      if (p) p.k.splice(p.k.indexOf(n), 1, m); else E.T.root = m;
      m.k.push(n);
    });
    select([m]); editLabel(m);
  }
  function removeSel(keepChildren: any) {
    const ns = tops(E.sel);
    if (!ns.length) return;
    const next = (() => { const n = ns[0], p: any = parentOf(E.T, n); if (!p) return null; const i = p.k.indexOf(n); return p.k[i + 1] && !ns.includes(p.k[i + 1]) ? p.k[i + 1] : p.k[i - 1] && !ns.includes(p.k[i - 1]) ? p.k[i - 1] : p; })();
    edit(() => {
      for (const n of ns) {
        const p: any = parentOf(E.T, n);
        if (keepChildren) {
          if (p) p.k.splice(p.k.indexOf(n), 1, ...n.k);
          else if (n.k.length === 1) E.T.root = n.k[0];
          else if (n.k.length) { n.c = ''; n.o = ['phantom']; continue; } // a forest has one root: an invisible one holds the rest
          else E.T.root = null;
        } else detach(E.T, n);
      }
    });
    E.sel = next && order(E.T).includes(next) ? [next] : [];
    draw(); renderProps();
  }
  // a node one place earlier (-1) or later (+1) among its siblings
  function shift(n: any, dir: any) {
    const p: any = parentOf(E.T, n);
    if (!p) return;
    const i = p.k.indexOf(n), j = i + dir;
    if (j < 0 || j >= p.k.length) return;
    edit(() => { p.k.splice(i, 1); p.k.splice(j, 0, n); });
  }
  // a node becomes its parent's next sibling
  function outdent(n: any) {
    const p: any = parentOf(E.T, n), g: any = p && parentOf(E.T, p);
    if (!g) return;
    edit(() => { p.k.splice(p.k.indexOf(n), 1); g.k.splice(g.k.indexOf(p) + 1, 0, n); });
  }
  // a node becomes the last child of its previous sibling
  function indent(n: any) {
    const p: any = parentOf(E.T, n);
    if (!p) return;
    const i = p.k.indexOf(n);
    if (i < 1) return;
    edit(() => { p.k.splice(i, 1); p.k[i - 1].k.push(n); });
  }
  // put a node (moved, copied or new) at a drop target { n, where: 'child' | 'before' | 'after' }
  function putAt(m: any, t: any) {
    if (t.where === 'child') { t.n.k.push(m); return; }
    const p: any = parentOf(E.T, t.n);
    if (!p) { t.n.k.push(m); return; }
    p.k.splice(p.k.indexOf(t.n) + (t.where === 'after' ? 1 : 0), 0, m);
  }
  function moveTo(n: any, t: any, copy: any) {
    if (!copy && inside(t.n, n)) return;
    let m;
    edit(() => {
      m = copy ? clone(n) : n;
      if (!copy) detach(E.T, n);
      putAt(m, t);
    });
    select([m]);
  }

  // ---------------------------------------------------------------- styles
  const drop = (o: any, keys: any) => o.filter((x: any) => !keys.includes(keyOf(x)));
  // the style a node has now: from the layout's resolved options
  function shapeOf(g: any) { const s = g.st; return !s.draw ? 'plain' : s.shape === 'circle' ? 'circle' : s.shape === 'ellipse' ? 'ellipse' : s.rc ? 'round' : 'box'; }
  // the edge's style; straight or forked is the path, shown on its own (Edges), and combines with any style but roof
  function edgeOf(g: any) { const e = g.st.edge; return e.none ? 'none' : g.st.roof ? 'roof' : e.end || e.start ? 'arrow' : e.dash ? 'dashed' : 'line'; }
  function fillOf(g: any) { const f = g.st.fill; if (!f) return 'none'; const hit = FILLS.find((x) => TD.tikzColor && TD.tikzColor(x[0]) === f); return hit ? hit[0] : 'custom'; }
  // a style on the selected nodes, or on every node through `for tree` when none is selected
  function applyStyle(kind: any, v: any, nodes = E.sel) {
    if (kind === 'phantom') { // a node at a time: a whole tree of phantoms draws nothing
      if (nodes.length) { setPhantom(true, nodes); return; }
      const m = uiText('editor.ft.phantomPick', 'Select a node first, or drag Phantom onto one');
      stageNote.flash(m, 2400);
      return;
    }
    const opts = kind === 'shape' ? SHAPES[v] : kind === 'edge' ? EDGES[v] : v === 'none' ? [] : [`fill=${v}`];
    // line, arrow and dashed are styles: they keep a forked path; roof and fork are paths and replace each other
    // (fork keeps the style; it can't be hidden or a roof)
    const keys = kind === 'shape' ? SHAPE_KEYS : kind !== 'edge' ? ['fill'] : v === 'roof' ? EDGE_KEYS : v === 'fork' ? ['no edge', 'roof', 'forked edge'] : ['edge', 'no edge', 'roof'];
    edit(() => {
      if (!nodes.length) {
        let l = drop(forTree(E.T), keys);
        if (kind === 'edge' && v === 'fork') { E.T.pre = drop(E.T.pre, ['forked edges']); E.T.pre.unshift('forked edges'); }
        else { if (kind === 'edge' && v === 'roof') E.T.pre = drop(E.T.pre, ['forked edges']); l = [...opts, ...l]; }
        setForTree(E.T, l);
        // a node's own style gives way
        for (const n of order(E.T)) n.o = drop(n.o, keys);
        return;
      }
      for (const n of nodes) n.o = [...drop(n.o, keys), ...opts];
    });
    // what the node inherits (from `for tree`) can still win: add the options that override it, so the
    // node looks like what was picked (a box under `rounded corners` needs `sharp corners`, and so on)
    if ((kind === 'shape' || kind === 'edge') && nodes.length) {
      E.L = TD.ft.layout(blockOf());
      const fix = [];
      for (const n of nodes) {
        const g = geoOf(n);
        if (!g) continue;
        const add = [];
        if (kind === 'shape') {
          if (v === 'plain' && g.st.draw) add.push('draw=none');
          if ((v === 'box' || v === 'round') && g.st.shape !== 'rect') add.push('rectangle');
          if (v === 'box' && g.st.rc) add.push('sharp corners');
        } else if (v === 'line' && n !== E.T.root) {
          const e = g.st.edge;
          if (e.start || e.end || e.dash || e.color) add.push('edge={-}');
        }
        if (add.length) fix.push([n, add]);
      }
      if (fix.length) { E.pending = null; begin(); for (const [n, add] of fix) n.o.push(...add); commit(); draw(); renderProps(); }
    }
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, items]: any) => ({
      id: cat.fallback, title: caption(cat),
      // the shown name, the English one and the category's both find it
      items: items.map(([k, name]: any) => ({ id: k, label: caption(name), title: tipOf(ITEM[k]), alt: name.fallback, keywords: `${caption(cat)} ${cat.fallback}`, svg: fitMini(TD.ftMini(ITEM[k].mini, 1e3), 64, 44, 1.2) })),
    })));
  }
  function tipOf(it: any) {
    const name = caption(it.name);
    if (it.kind === 'tree') return uiText('editor.ft.tipTree', '{name}: added under the selected node, or drag it onto a node', { name });
    if (it.kind === 'phantom') return uiText('editor.ft.tipPhantom', '{name}: the selected nodes keep their place but are not drawn, nor their edges; or drag it onto a node', { name });
    if (it.kind === 'template') return uiText('editor.ft.tipTemplate', '{name}: replaces the tree (undo brings it back)', { name });
    return uiText('editor.ft.tipStyle', '{name}: for the selected nodes, or for every node when none is selected', { name });
  }
  let palDrag: any = null;
  // the keyboard's click (Enter or Space on a focused item) chooses it, as a tap does
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.qe-item');
    if (!b || e.button !== 0) return;
    palDrag = { k: b.dataset.item, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e: any) => {
    if (!palDrag) return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) palDrag.moved = true;
    if (!palDrag.moved) return;
    const it = ITEM[palDrag.k];
    E.drop = overStage(e) ? dropAt(e, null, it.kind !== 'tree') : null;
    E.ghost = { src: it.mini, e: pos(e) };
    draw();
  });
  list.addEventListener('pointerup', (e: any) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null; E.ghost = null;
    const t = E.drop; E.drop = null;
    if (!d.moved) { pick(d.k); return; }
    const it = ITEM[d.k];
    if (it.kind === 'template' && overStage(e)) pick(d.k);
    else if (t && it.kind === 'tree') { let m; edit(() => { m = subtree(it.payload); putAt(m, t); }); select([m]); }
    else if (t) applyStyle(it.kind, it.payload, [t.n]);
    else if (it.kind === 'tree' && !E.T.root && overStage(e)) pick(d.k);
    draw();
  });
  function pick(k: any) {
    const it = ITEM[k];
    if (it.kind === 'template') { edit(() => { E.typed = String(it.payload); E.T = load(it.payload); }); E.sel = []; fit(); renderProps(); return; }
    if (it.kind === 'tree') {
      let m;
      edit(() => { m = subtree(it.payload); if (!E.T.root) E.T.root = m; else (one() || E.T.root).k.push(m); });
      select([m]);
      return;
    }
    applyStyle(it.kind, it.payload);
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [0.3, 6], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  const toL = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  // the node under the pointer (index into the preorder), or -1
  function nodeAt(e: any, pad = 3) {
    if (!E.L || E.L.empty) return -1;
    const [x, y] = toL(e), p = pad / E.view.k;
    for (let i = E.L.nodes.length - 1; i >= 0; i--) {
      const g = E.L.nodes[i];
      if (Math.abs(x - g.x) <= g.w / 2 + p && Math.abs(y - g.y) <= g.h / 2 + p) return i;
    }
    return -1;
  }
  // where a drop lands: on a node as its child, or beside it (along the siblings) as a sibling
  function dropAt(e: any, moving: any, childOnly?: any) {
    const i = nodeAt(e, 8);
    if (i < 0) return null;
    const n = order(E.T)[i], g = E.L.nodes[i], U = E.L.U;
    if (moving && inside(n, moving)) return null;
    const [x, y] = toL(e), t = ((x - g.x) * U[0] + (y - g.y) * U[1]) / (g.hs || 1);
    const isRoot = n === E.T.root;
    const where = childOnly || isRoot ? 'child' : t < -0.55 ? 'before' : t > 0.55 ? 'after' : 'child';
    if (moving && where === 'child' && parentOf(E.T, moving) === n && n.k[n.k.length - 1] === moving) return null; // already there
    return { n, i, where };
  }
  function fit() {
    if (!E) return;
    E.L = TD.ft.layout(blockOf());
    E.view = fitView(rect(), E.L.empty ? { x: -60, y: -30, w: 120, h: 60 } : E.L.bb, { margin: 30, pad: 60, min: 0.5, max: 2.5 });
    draw();
  }
  function keepInView() {
    const L = E.L, r = rect(), v = E.view;
    if (!L || L.empty) return;
    const b = L.bb;
    if (v.ox + b.x * v.k < 0 || v.oy + b.y * v.k < 0 || v.ox + (b.x + b.w) * v.k > r.width || v.oy + (b.y + b.h) * v.k > r.height) fit();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const L = (E.L = TD.ft.layout(blockOf())), r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    const xf = turnXf(L);
    for (const g of root.querySelectorAll('.modal-head .fe-turn')) if (g.getAttribute('transform') !== xf) g.setAttribute('transform', xf);
    const X = (x: any) => r2(v.ox + x * k), Y = (y: any) => r2(v.oy + y * k);
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    if (L.empty) {
      out += `<g class="fe-start" data-fe-start="1"><rect x="${X(-60)}" y="${Y(-30)}" width="${r2(120 * k)}" height="${r2(60 * k)}" rx="6"/><path d="M${X(0) - 6},${Y(-6)}h12M${X(0)},${Y(-6) - 6}v12"/><text x="${X(0)}" y="${Y(16)}">${esc(uiText('editor.ft.addRoot', 'Add a root node'))}</text></g>`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); patchSvg(svg, out); return;
    }
    const b = L.bb;
    out += `<rect class="qe-paper" x="${X(b.x - 16)}" y="${Y(b.y - 16)}" width="${r2((b.w + 32) * k)}" height="${r2((b.h + 32) * k)}"/>`;
    out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})">${TD.ft.draw({ ...blockOf(), x: b.x, y: b.y }, { paper: PAPER, export: true })}</g>`;
    const box = (g: any, cls: any, pad = 3) => `<rect class="${cls}" x="${r2(X(g.x - g.w / 2) - pad)}" y="${r2(Y(g.y - g.h / 2) - pad)}" width="${r2(g.w * k + 2 * pad)}" height="${r2(g.h * k + 2 * pad)}" rx="3"/>`;
    // phantom nodes: an outline, so they can be found
    for (const g of L.nodes) if (g.st.phantom) out += box(g, 'fe-phantom', 0);
    const nodes = order(E.T), dragging = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if (E.hover >= 0 && !E.drag && L.nodes[E.hover] && !E.sel.includes(nodes[E.hover])) out += box(L.nodes[E.hover], 'qe-hover');
    for (const n of E.sel) { const g = geoOf(n); if (g) out += box(g, 'qe-sel'); }
    if (dragging) { const g = geoOf(E.drag.n); if (g) out += box(g, 'fe-moving'); }
    // the drop: the node lit up (a child) or a bar beside it (a sibling)
    const t = E.drop;
    if (t) {
      const g = L.nodes[t.i];
      if (t.where === 'child') out += box(g, 'qe-target', 5);
      else {
        const U = L.U, s = (t.where === 'before' ? -1 : 1) * (g.hs + 4 / k), cx = g.x + U[0] * s, cy = g.y + U[1] * s;
        const half = (Math.abs(U[0]) * g.h + Math.abs(U[1]) * g.w) / 2 + 4 / k, px = -U[1], py = U[0];
        out += `<path class="fe-bar" d="M${X(cx - px * half)},${Y(cy - py * half)}L${X(cx + px * half)},${Y(cy + py * half)}"/>`;
      }
    }
    // a selected node's quick adds: a child (along the growth) and a sibling (across)
    const s = one();
    if (s && !E.drag && !E.ghost) {
      const g = geoOf(s), G = L.G, U = L.U;
      if (g) {
        const knob = (x: any, y: any, a: any, title: any) => `<g class="fe-add" data-add="${a}"><title>${esc(title)}</title><circle cx="${x}" cy="${y}" r="8"/><path d="M${x - 4},${y}h8M${x},${y - 4}v8"/></g>`;
        // the child's below the node; the sibling's on its far corner, clear of the next node
        const dc = g.hd * k + 16, ds = g.hs * k + 3, du = g.hd * k + 3;
        out += knob(r2(X(g.x) + G[0] * dc), r2(Y(g.y) + G[1] * dc), 'child', uiText('ui.add.a.child.tab', 'Add a child (Tab)'));
        if (s !== E.T.root) out += knob(r2(X(g.x) + U[0] * ds - G[0] * du), r2(Y(g.y) + U[1] * ds - G[1] * du), 'sib', uiText('ui.add.a.sibling.enter', 'Add a sibling (Enter)'));
      }
    }
    // what is being dragged, under the pointer
    const gsrc = E.ghost ? E.ghost.src : dragging ? `\\begin{forest}${F.code({ pre: [], root: E.drag.n }).replace(/^\\begin\{forest\}|\\end\{forest\}$/g, '')}\\end{forest}` : null;
    if (gsrc) {
      const [gx, gy] = E.ghost ? E.ghost.e : E.drag.e;
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${TD.ftMini(gsrc, 40)}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    if (e.target.closest('.fe-start')) { addRoot(); return; }
    const add = e.target.closest('.fe-add');
    if (add && one()) { if (add.dataset.add === 'child') addChildTo(one()); else addSibling(one()); return; }
    const i = nodeAt(e);
    if (i < 0) { if (!e.shiftKey) select([]); E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; return; }
    const n = order(E.T)[i];
    if (dbl && one() === n) { editLabel(n); return; }
    if (e.shiftKey) { select(E.sel.includes(n) ? E.sel.filter((x: any) => x !== n) : [...E.sel, n]); return; }
    if (!E.sel.includes(n)) select([n]);
    E.drag = { mode: 'move', n, sx, sy, e: [sx, sy], moved: false };
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) { const h = nodeAt(e); if (h !== E.hover) { E.hover = h; draw(); } return; }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (d.n === E.T.root && !e.altKey) return; // the root stays the root
      d.moved = true; d.e = [sx, sy];
      E.drop = dropAt(e, e.altKey ? null : d.n);
      { const name = E.drop ? E.drop.n.c || uiText('editor.ft.nodeFallback', 'node') : ''; setTip(E.drop ? (E.drop.where === 'child' ? uiText('editor.ft.dropInto', 'Into “{name}”', { name }) : E.drop.where === 'before' ? uiText('editor.ft.dropBefore', 'Before “{name}”', { name }) : uiText('editor.ft.dropAfter', 'After “{name}”', { name })) + (e.altKey ? uiText('editor.ft.dropCopy', ' (copy)') : '') : uiText('editor.ft.dropHelp', 'Drop on a node: into it, or on its side to go beside it. ⌥ copies.')); }
      draw();
    }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'move' && d.moved) {
      const t = E.drop; E.drop = null; setTip('');
      if (t) moveTo(d.n, t, e.altKey); else draw();
      return;
    }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover >= 0) { E.hover = -1; draw(); } });

  // right-click: around the node under the pointer
  const mItem = (act: string, label: string, icon: string, key: string, off?: boolean) => menuRow(act, label, null, key, { svg: ficIn(icon, E.L), disabled: !!off, danger: act === 'delete' || act === 'lift' });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const i = nodeAt(e);
    if (i < 0) { closeMenu(); return; }
    const n = order(E.T)[i];
    if (!E.sel.includes(n)) select([n]);
    const isRoot = n === E.T.root, p: any = parentOf(E.T, n), at = p ? p.k.indexOf(n) : 0, many = E.sel.length > 1, alt = isMac ? '⌥' : 'Alt+';
    menuRows = [mItem('child', uiText('editor.ft.addChild', 'Add Child'), 'child', 'Tab', many), mItem('before', uiText('editor.ft.addSiblingBefore', 'Add Sibling Before'), 'sibBefore', '⇧↵', many || isRoot), mItem('after', uiText('editor.ft.addSiblingAfter', 'Add Sibling After'), 'sib', '↵', many || isRoot), mItem('parent', uiText('editor.ft.addParent', 'Add Parent'), 'parent', '', many), '-', mItem('earlier', uiText('editor.ft.moveEarlier', 'Move Earlier'), 'earlier', alt + '←', many || !p || at === 0), mItem('later', uiText('editor.ft.moveLater', 'Move Later'), 'later', alt + '→', many || !p || at === p.k.length - 1), mItem('outdent', uiText('editor.ft.moveUpLevel', 'Move Up a Level'), 'lift', '⇧Tab', many || !p || isRoot || !parentOf(E.T, p)), '-', ...(allPhantom() ? [mItem('visible', uiText('editor.ft.makeVisible', 'Make Visible'), 'visible', '')] : [mItem('phantom', uiText('editor.ft.makePhantom', 'Make Phantom'), 'phantom', '')]), '-', mItem('copy', uiText('ui.copy', 'Copy'), 'copy', isMac ? '⌘C' : 'Ctrl+C'), mItem('paste', uiText('editor.ft.pasteAsChild', 'Paste as Child'), 'paste', isMac ? '⌘V' : 'Ctrl+V', many || !E.clip), '-', mItem('lift', uiText('editor.ft.deleteKeepChildren', 'Delete, Keep Children'), 'unwrap', '', !n.k.length), mItem('delete', many ? uiText('editor.ft.deleteNodes', 'Delete {n} Nodes', { n: E.sel.length }) : uiText('ui.delete', 'Delete'), 'del', '⌫')];
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the node (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null; // { n, pop }
  function editLabel(n: any, typed?: any) {
    if (!TD.input) return;
    closeLabel();
    begin();
    const me: any = (Lb = { n });
    me.pop = TD.input.popup(stage, {
      text: typed != null ? typed : n.c, math: false, bare: true,
      at: () => labelAt(n),
      onInput: (v: any) => { n.c = v; draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); keepInView(); renderProps(); },
    });
    if (typed != null) {
      n.c = typed; draw();
      // a key typed on the tree starts the label: the caret goes after it, not over it
      requestAnimationFrame(() => requestAnimationFrame(() => { const ta = $('.td-pop-ta:not(.leaving)', stage); if (ta) ta.setSelectionRange(ta.value.length, ta.value.length); }));
    }
  }
  function labelAt(n: any) {
    const g = geoOf(n), v = E.view;
    if (!g) return [0, 0];
    const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + v.ox + g.x * v.k, vr.top - sr.top + v.oy + (g.y + g.h / 2) * v.k + 8];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }

  // ---------------------------------------------------------------- properties
  const SHAPE_SEG = () => [['plain', uiText('editor.ft.plain', 'Plain')], ['box', uiText('editor.ft.box', 'Box')], ['round', uiText('editor.ft.round', 'Round')], ['circle', uiText('editor.ft.circle', 'Circle')]];
  const EDGE_SEG = () => [['line', uiText('editor.ft.line', 'Line')], ['arrow', uiText('editor.ft.arrow', 'Arrow')], ['dashed', uiText('editor.ft.dash', 'Dash')], ['roof', uiText('editor.ft.roof', 'Roof'), uiText('editor.ft.roofTitle', 'A triangle over the node (linguistics)')], ['none', uiText('editor.ft.fill.none', 'None')]];
  const countText = (L: any) => `${L.n === 1 ? uiText('editor.ft.oneNode', '1 node') : uiText('editor.ft.nNodes', '{n} nodes', { n: L.n })} · ${L.levels === 1 ? uiText('editor.ft.oneLevel', '1 level') : uiText('editor.ft.nLevels', '{n} levels', { n: L.levels })}`;
  const same = (vals: any) => vals.every((x: any) => x === vals[0]) ? vals[0] : null;
  function renderProps() {
    if (!E) return;
    const L = E.L || (E.L = TD.ft.layout(blockOf()));
    props.hidden = false;
    const edgeField = (value: any, forked: any) => segments(uiText('editor.ft.edge', 'Edge'), 'edge', value, forked ? EDGE_SEG().filter(([v]) => v !== 'roof' && v !== 'none') : EDGE_SEG());
    const fills = (value: any) => switchRow(captions["ui.fill"], FILLS.map(([v, n]) => ({ title: caption(n), on: value === v, attrs: { 'data-fs': 'fill', 'data-v': v }, swatch: { css: v === 'none' ? 'transparent' : TD.css(TD.tikzColor(v) || '#ffffff'), none: v === 'none' } })), { class: 'fe-sw' });
    if (!E.sel.length) {
      const dir = L.empty ? 'down' : L.grow === 0 && L.rev ? 'right' : L.grow === 90 ? 'up' : L.grow === 180 ? 'left' : 'down';
      const ft = forTree(E.T), get = (k: any) => { const o = ft.map(F.opt).find((x: any) => x.k === k); return o && o.v != null ? F.len(o.v, 10) : NaN; };
      const toMm = (px: any) => isFinite(px) ? Math.round(px / TD.PX_PER_CM * 100) / 10 : '';
      const shapes = L.nodes.map(shapeOf), edges = L.nodes.slice(1).map(edgeOf), forked = E.T.pre.some((x: any) => keyOf(x) === 'forked edges');
      renderView(props, FormPanel, { sections: [
        { ...section(captions["ui.tree"], [segments(uiText('editor.ft.grows', 'Grows'), 'dir', dir, [['down', uiText('editor.ft.down', 'Down')], ['right', uiText('editor.ft.right', 'Right')], ['up', uiText('editor.ft.up', 'Up')], ['left', uiText('editor.ft.left', 'Left')]]),
          segments(uiText('editor.ft.edges', 'Edges'), 'treeedge', forked ? 'fork' : 'straight', [['straight', uiText('editor.ft.straight', 'Straight')], ['fork', uiText('editor.ft.forked', 'Forked'), uiText('editor.ft.forkedTitle', 'Org-chart elbows (edges library)')]]),
          numField(uiText('editor.ft.levelStep', 'Level step'), 'l', toMm(get('l')), 'mm', { min: '0', step: '1', placeholder: uiText('editor.ft.autoPlaceholder', 'auto') }), numField(uiText('editor.ft.siblingGap', 'Sibling gap'), 'ssep', toMm(get('s sep')), 'mm', { min: '0', step: '1', placeholder: uiText('editor.ft.autoPlaceholder', 'auto') })], 'sec'), summary: countText(L) },
        section(uiText('editor.ft.everyNode', 'Every node'), [segments(uiText('editor.ft.shape', 'Shape'), 'shape', same(shapes), SHAPE_SEG()), edgeField(same(edges), forked), fills(same(L.nodes.map(fillOf))),
          field(uiText('editor.commonB.options', 'Options'), 'pre', E.T.pre.join(', '), { class: 'mono' }), note(uiText('editor.ft.help1', 'Click a node to select it. '), { kbd: 'Tab' }, uiText('editor.ft.help2', ' adds a child, '), { kbd: 'Enter' }, uiText('editor.ft.help3', ' a sibling; type to rename.'))], 'sec'),
      ] }); return;
    }
    const gs = E.sel.map(geoOf).filter(Boolean);
    const style = [segments(uiText('editor.ft.show', 'Show'), 'vis', same(gs.map((g: any) => (g.st.phantom ? 'phantom' : 'visible'))), [['visible', uiText('editor.ft.visible', 'Visible')], ['phantom', uiText('editor.ft.phantom', 'Phantom'), uiText('editor.ft.phantomTitle', 'Keeps its place in the tree, but neither the node nor its edge is drawn')]]),
      segments(uiText('editor.ft.shape', 'Shape'), 'shape', same(gs.map(shapeOf)), SHAPE_SEG()), edgeField(same(gs.map(edgeOf)), gs.length > 0 && gs.every((g: any) => g.st.fork)), fills(same(gs.map(fillOf)))];
    if (E.sel.length > 1) {
      renderView(props, FormPanel, { sections: [section(uiText('editor.ft.nNodes', '{n} nodes', { n: E.sel.length }), [...style, note(uiText('editor.ft.dragHelp', 'Drag a node to move it; ⌥-drag copies.'))], 'sec')] }); return;
    }
    const n = E.sel[0], g = gs[0], p = parentOf(E.T, n), where = !p ? uiText('editor.ft.root', 'root') : uiText('editor.ft.level', 'level {n}', { n: g ? g.depth + 1 : '' });
    renderView(props, FormPanel, { sections: [{ ...section(uiText('editor.ft.node', 'Node'), [field(uiText('editor.ft.label', 'Label'), 'label', n.c, { 'data-tx': 'text' }), ...style, field(uiText('editor.commonB.options', 'Options'), 'opts', n.o.join(', '), { class: 'mono' })], 'sec'), summary: where + (n.k.length ? ' · ' + (n.k.length === 1 ? uiText('editor.ft.oneChild', '1 child') : uiText('editor.ft.nChildren', '{n} children', { n: n.k.length })) : '') }] });
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e: any) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    const n = one();
    if (f === 'label' && n) n.c = t.value;
    else if (f === 'opts' && n) n.o = F.optList(t.value);
    else if (f === 'pre') E.T.pre = F.optList(t.value);
    else if (f === 'l' || f === 'ssep') {
      const key = f === 'l' ? 'l' : 's sep', v = parseFloat(t.value);
      const l = forTree(E.T).filter((x: any) => keyOf(x) !== key);
      if (v > 0) l.push(`${key}=${Math.round(v * 10) / 10}mm`);
      setForTree(E.T, l);
    }
    draw();
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('click', (e: any) => {
    const b = e.target.closest('[data-fs]');
    if (!b || !E) return;
    const f = b.dataset.fs, v = b.dataset.v;
    if (f === 'shape' || f === 'edge' || f === 'fill') applyStyle(f, v);
    else if (f === 'vis') setPhantom(v === 'phantom');
    else if (f === 'dir') edit(() => {
      // forest gives a node's own children the default south: a direction for the whole tree goes in `for tree`,
      // as a bare `grow` in the preamble turns the root's children only
      E.T.pre = E.T.pre.filter((x: any) => keyOf(x) !== 'grow' && keyOf(x) !== 'reversed');
      const ft = forTree(E.T).filter((x: any) => keyOf(x) !== 'grow' && keyOf(x) !== 'reversed');
      const g = ({ right: "grow'=0", up: "grow'=north", left: 'grow=west' } as Record<string, any>)[v];
      setForTree(E.T, g ? [g, ...ft] : ft);
    });
    else if (f === 'treeedge') {
      if (v === 'fork') applyStyle('edge', 'fork', []);
      else edit(() => { E.T.pre = drop(E.T.pre, ['forked edges']); for (const n of order(E.T)) n.o = drop(n.o, ['forked edge']); setForTree(E.T, drop(forTree(E.T), ['forked edge'])); });
    }
    if (f === 'dir') fit();
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
    const n = one();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') removeSel(false);
    else if (a === 'lift') removeSel(true);
    else if (a === 'copy' && b && b.closest('.cz-code-head')) navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = uiText('ui.copied', 'Copied'); setTimeout(() => (b.textContent = uiText('ui.copy', 'Copy')), 1200); });
    else if (a === 'copy') { if (E.sel.length) E.clip = tops(E.sel).map(clone); }
    else if (a === 'paste') paste();
    else if (a === 'phantom' || a === 'visible') setPhantom(a === 'phantom');
    else if (a === 'child') { if (n) addChildTo(n); else if (!E.T.root) addRoot(); else addChildTo(E.T.root); }
    else if (!n) return;
    else if (a === 'sib' || a === 'after') addSibling(n, false);
    else if (a === 'before') addSibling(n, true);
    else if (a === 'parent') addParent(n);
    else if (a === 'earlier') shift(n, -1);
    else if (a === 'later') shift(n, 1);
    else if (a === 'outdent') outdent(n);
  }
  // phantom: the node keeps its place in the layout, but neither it nor its edge is drawn (forest's `phantom`)
  const allPhantom = () => E.sel.length > 0 && E.sel.every((n: any) => geoOf(n)?.st.phantom);
  function setPhantom(on: boolean, nodes = E.sel) {
    if (!nodes.length) return;
    edit(() => { for (const n of nodes) n.o = [...drop(n.o, ['phantom']), ...(on ? ['phantom'] : [])]; });
  }
  function paste() {
    if (!E.clip || !E.clip.length) return;
    const p = one() || E.T.root;
    let added: any[] = [];
    edit(() => {
      added = E.clip.map(clone);
      if (!p) { E.T.root = added[0]; added = [added[0]]; } else p.k.push(...added);
    });
    select(added);
  }
  // the tree writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const L = E.L || TD.ft.layout(blockOf());
    count.textContent = countText(L);
    if (document.activeElement === codeTa) return;
    const c = snap();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, TD.ft.layout(blockOf()).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    const idx = E.sel.map((n: any) => order(E.T).indexOf(n));
    E.typed = codeTa.value; E.T = load(codeTa.value); E.codeAt = codeTa.value;
    const o = order(E.T); E.sel = idx.map((i: any) => o[i]).filter(Boolean);
    draw(); keepInView(); renderProps();
    showCodeNotes(codeMsg, TD.ft.layout({ type: 'forest', src: codeTa.value, size: E.st.size, font: E.st.font }).warnings);
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  // the nearest of a node's neighbours (parent, children, siblings) in an arrow's direction
  function neighbour(n: any, dx: any, dy: any) {
    const p: any = parentOf(E.T, n), cand = [...(p ? [p, ...p.k] : []), ...n.k].filter((m) => m !== n);
    const g = geoOf(n);
    let best = null, score = -Infinity;
    for (const m of cand) {
      const h = geoOf(m);
      if (!h) continue;
      const vx = h.x - g.x, vy = h.y - g.y, l = Math.hypot(vx, vy) || 1, cos = (vx * dx + vy * dy) / l;
      if (cos < 0.5) continue;
      const sc = cos * 2 - l / 400 - (m === p ? 0.1 : 0);
      if (sc > score) { score = sc; best = m; }
    }
    return best;
  }
  window.addEventListener('keydown', (e) => {
    if (inEditorMenu(e)) return; // the right-click menu's own keys: arrows, Enter, Esc
    // a focused palette button keeps its own Enter and Space (they click it); ⌘Enter still reaches Done
    if (pressesFocused(e)) return;
    if (!E || root.hidden || dock.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (editorMenuOpen()) { closeMenu(); return; }
      if (E.sel.length) { select([]); return; }
      finish(false); return;
    }
    if (inField) { if (e.key === 'Enter' && (e.target! as Element).matches('#ftModal .cz-props input')) (e.target! as HTMLElement).blur(); return; }
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && e.key === 'a') { e.preventDefault(); select(order(E.T)); return; }
    if (mod && (e.key === 'c' || e.key === 'x')) { e.preventDefault(); if (E.sel.length) { E.clip = tops(E.sel).map(clone); if (e.key === 'x') removeSel(false); } return; }
    if (mod && e.key === 'v') { e.preventDefault(); paste(); return; }
    if (mod) return;
    const n = one();
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeSel(false); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (n && e.shiftKey) outdent(n); else act('child'); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (n) { if (n === E.T.root) editLabel(n); else addSibling(n, e.shiftKey); } else if (!E.T.root) addRoot(); return; }
    if (e.key === 'F2') { e.preventDefault(); if (n) editLabel(n); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!n) { if (E.T.root) select([E.T.root]); return; }
      if (e.altKey) {
        // move among the siblings, in the direction they run on screen
        const U = E.L.U, along = dx * U[0] + dy * U[1];
        if (along) shift(n, along > 0 ? 1 : -1);
        return;
      }
      const m = neighbour(n, dx, dy);
      if (m) select([m]);
      return;
    }
    // typing on a node renames it
    if (n && e.key.length === 1 && !e.altKey && TD.input && TD.input.mode !== 'mathlive') { e.preventDefault(); editLabel(n, e.key); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snap(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.ft.discardTree', 'Discard changes to this tree?'),
    selOut: () => E.sel.map((n: any) => order(E.T).indexOf(n)), selIn: (idx: any) => { const o = order(E.T); E.sel = (idx || []).map((i: any) => o[i]).filter(Boolean); },
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const T = load(block.src);
    E = { T, sel: [], view: { ox: 0, oy: 0, k: 1.5 }, undo: [], redo: [], pending: null, done, drag: null, hover: -1, drop: null, ghost: null, st: { size: block.size || 'normalsize', font: block.font || 'default' }, codeAt: null, codeTimer: null, clip: null, L: null };
    // an untouched tree hands its own text back
    E.typed = String(block.src || ''); E.start = snap();
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
  TD.ftEditor = { open, dockable: true, close: () => dock.detach() };
})();
