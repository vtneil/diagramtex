import { captions } from '../i18n/messages';
import { t as uiText, message, caption, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import UmlsdeditorFrame from '../ui/editors/UmlsdeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// Sequence diagram editor: the overlay that opens on a pgf-umlsd block. A palette of instances and threads,
// the kinds of message (call, self call, message, call without return) and blocks; the diagram drawn as the
// package draws it, where a message is dragged from one lifeline to another (on the same one: a self call) and
// lands in the code where it was drawn, inside the activation it starts in; instances are dragged sideways
// to reorder them; the selected element's properties; and beside them the pgf-umlsd code, live both ways.
// Untouched code is handed back as written.
// TD.umlsdEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const U = TD.umlsd;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PX = TD.PX_PER_CM, CMPT = U.CM;

  // ---------------------------------------------------------------- palette
  const ic = (d: string) => `<svg class="zxmini" viewBox="0 0 64 28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">${d}</g></svg>`;
  const MINI: Record<string, string> = {
    inst: ic('<rect x="14" y="2" width="36" height="11"/><path d="M32 13V27" stroke-dasharray="1.5 2"/>'),
    thread: ic('<rect x="14" y="2" width="36" height="11"/><rect x="29.5" y="15" width="5" height="12" fill="currentColor" fill-opacity="0.25"/>'),
    call: ic('<path d="M6 9H50"/><path d="M50 5L57 9L50 13Z" fill="currentColor"/><path d="M57 21H10" stroke-dasharray="3 2"/><path d="M14 18L9 21L14 24"/>'),
    callself: ic('<rect x="14" y="2" width="5" height="24" fill="currentColor" fill-opacity="0.25"/><path d="M19 6H44V14H27"/><path d="M27 10L20 14L27 18Z" fill="currentColor"/><path d="M19 22H44" stroke-dasharray="3 2"/>'),
    mess: ic('<path d="M6 14H57"/><path d="M50 9L57 14L50 19"/>'),
    messcall: ic('<path d="M6 10H52"/><path d="M46 6L53 10L46 14"/><rect x="53" y="10" width="5" height="14" fill="currentColor" fill-opacity="0.25"/>'),
    block: ic('<rect x="4" y="3" width="56" height="22"/><path d="M4 11H20L23 8V3"/>'),
  };
  const PAL: any[] = [
    // names are caption descriptors, shown in the interface language when the palette is drawn
    [message('editor.umlsd.cat.lifelines', 'Lifelines'), [
      ['inst', message('editor.umlsd.instance', 'Instance'), 'I', message('editor.umlsd.instance', 'Instance')],
      ['thread', message('editor.umlsd.threadLong', 'Thread (active from the start)'), 'T', message('editor.umlsd.thread', 'Thread')],
    ]],
    [message('editor.umlsd.cat.messages', 'Messages'), [
      ['call', message('editor.umlsd.callLong', 'Call, with a return'), 'C', message('editor.umlsd.call', 'Call')],
      ['callself', message('editor.umlsd.selfCall', 'Self call'), 'S', message('editor.umlsd.selfCall', 'Self call')],
      ['mess', message('editor.umlsd.message', 'Message'), 'M', message('editor.umlsd.message', 'Message')],
      ['messcall', message('editor.umlsd.callNoReturn', 'Call without a return'), 'A', message('editor.umlsd.noReturn', 'No return')],
    ]],
    [message('editor.umlsd.cat.frames', 'Frames'), [
      ['block', message('editor.umlsd.blockLong', 'Block (frame round the selection)'), 'B', message('editor.umlsd.block', 'Block')],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, string> = {};
  for (const [, its] of PAL) for (const [k, name, key, short] of its) { ITEM[k] = { k, name, key, short }; if (key) KEYS[key.toLowerCase()] = k; }
  const KIND_NAMES: Record<string, string> = { call: 'call', callself: 'self call', mess: 'message', messcall: 'call without a return' };
  // a kind's name as a title, in the interface language
  const KIND_TITLE = (k: string) => (({ call: () => uiText('editor.umlsd.call', 'Call'), callself: () => uiText('editor.umlsd.selfCall', 'Self call'), mess: () => uiText('editor.umlsd.message', 'Message'), messcall: () => uiText('editor.umlsd.callNoReturn', 'Call without a return') }) as Record<string, () => string>)[k]?.() ?? '';

  // ---------------------------------------------------------------- model
  // M = TD.umlsd.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = U.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? U.write(M) : M.raw);
  const items = () => E.M.items as any[];
  // an item by its path in the tree ([i, j, …]: the i-th item, the j-th of its body…), and the list it is in
  function itemAt(ref: number[] | null) {
    if (!ref || !ref.length) return null;
    let list = items(), it: any = null;
    for (let d = 0; d < ref.length; d++) { it = list[ref[d]]; if (!it) return null; if (d < ref.length - 1) { if (!it.body) return null; list = it.body; } }
    return it;
  }
  function listOf(ref: number[]) {
    let list = items();
    for (let d = 0; d < ref.length - 1; d++) list = list[ref[d]].body;
    return list;
  }
  const same = (a: any, b: any) => !!a && !!b && a.join() === b.join();
  function* walk(list: any[] = items(), path: number[] = []): Generator<[any, number[]]> {
    for (let i = 0; i < list.length; i++) { yield [list[i], [...path, i]]; if (list[i].body) yield* walk(list[i].body, [...path, i]); }
  }
  const insts = () => [...walk()].filter(([it]) => it.k === 'inst').map(([it]) => it);
  const byVar = (v: string) => insts().find((it: any) => it.v === v) || null;
  const isArrow = (it: any) => it && (it.k === 'call' || it.k === 'mess');
  const kindOf = (it: any) => (it.k === 'mess' ? 'mess' : it.env === 'callself' || (it.env === 'call' && it.a === it.b) ? 'callself' : it.env === 'messcall' ? 'messcall' : 'call');
  const validVar = (t: string) => /^[^{}\\%,;.()[\]=$#]+$/.test(t) && !/^\s|\s$/.test(t);
  function newVar(base: string) { let n = 1; while (byVar(base + n)) n++; return base + n; }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'umlsdModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, UmlsdeditorFrame);
  document.body.appendChild(root);
  const svg = $('.sd-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search', 'Search'), searchLabel: message('ui.search.the.palette', 'Search the palette'), label: message('ui.elements', 'Elements'), listClass: 'sd-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: path | null, kind (of new messages), view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snapCode = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.typed = code; E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() { if (E.sel && !itemAt(E.sel)) E.sel = null; }
  const selIt = () => itemAt(E.sel);
  const lay = () => U.layout({ src: snapCode() });

  // ---------------------------------------------------------------- editing
  // a new instance goes after the selected one, else after the last; a thread is drawn active from the start
  function addInst(thread: boolean) {
    const s = selIt();
    let ref: number[];
    edit(() => {
      const v = newVar(thread ? 't' : 'i');
      const it = { k: 'inst', thread, o: null, v, t: `:${thread ? 'Thread' : 'Object'}${v.replace(/^\D+/, '')}` };
      if (s && s.k === 'inst') { const l = listOf(E.sel); const i = l.indexOf(s) + 1; l.splice(i, 0, it); ref = [...E.sel.slice(0, -1), i]; return; }
      // after the last instance at the top level (instances come before what uses them)
      let i = 0;
      items().forEach((x: any, j: number) => { if (x.k === 'inst') i = j + 1; });
      items().splice(i, 0, it); ref = [i];
    });
    E.sel = ref!; draw(); renderProps();
  }
  // where a message drawn at height y (pt) goes: in the innermost call or block it falls in, before the first
  // of that one's items that starts below it
  function slotAt(y: number) {
    const L = lay(), inside = L.spans.filter((s: any) => (s.k === 'call' || s.k === 'block') && y < s.y0 && y > s.y1).sort((a: any, b: any) => b.ref.length - a.ref.length)[0];
    const path = inside ? inside.ref : [], l = inside ? itemAt(inside.ref).body : items();
    const kids = L.spans.filter((s: any) => s.ref.length === path.length + 1 && same(s.ref.slice(0, -1), path));
    const next = kids.find((s: any) => s.y0 < y);
    let i = next ? next.ref[next.ref.length - 1] : l.length;
    // never before an instance it may use
    if (!path.length) items().forEach((x: any, j: number) => { if (x.k === 'inst' && j >= i) i = j + 1; });
    return { path, list: l, i };
  }
  function addArrow(a: string, b: string, y: number, kind = E.kind) {
    if (kind === 'mess' && a === b) { setTip(uiText('editor.umlsd.messOtherDrag', 'A message goes to another lifeline: drag to a different one')); return; }
    if (a === b) kind = 'callself';
    else if (kind === 'callself') kind = 'call';
    let ref: number[];
    edit(() => {
      const S = slotAt(y);
      const it = kind === 'mess' ? { k: 'mess', o: null, a, t: 'message', b }
        : kind === 'callself' ? { k: 'call', env: 'callself', o: null, a, t: 'self()', b: a, r: '', body: [] }
        : kind === 'messcall' ? { k: 'call', env: 'messcall', o: null, a, t: 'notify()', b, body: [] }
        : { k: 'call', env: 'call', o: null, a, t: 'call()', b, r: 'return', body: [] };
      S.list.splice(S.i, 0, it);
      ref = [...S.path, S.i];
    });
    E.sel = ref!; draw(); renderProps();
  }
  // a block round the selected item, or an empty one at the end
  function addBlock() {
    const s = selIt();
    let ref: number[];
    edit(() => {
      const b = { k: 'block', o: null, t: 'loop', c: '', body: [] as any[] };
      if (s && s.k !== 'inst') { const l = listOf(E.sel), i = l.indexOf(s); l.splice(i, 1, b); b.body.push(s); delete s.blank; ref = E.sel.slice(); return; }
      items().push(b); ref = [items().length - 1];
    });
    E.sel = ref!; draw(); renderProps();
  }
  // a call or message turned into another kind (a message has no body: one with messages inside stays a call)
  function setKind(it: any, kind: string) {
    if (!isArrow(it) || kindOf(it) === kind) return;
    if (kind === 'mess' && it.body && it.body.length) { setTip(uiText('editor.umlsd.onlyEmptyCall', 'Only a call with nothing inside it can become a message')); return; }
    if (kind === 'mess' && it.a === it.b) { setTip(uiText('editor.umlsd.messOther', 'A message goes to another lifeline')); return; }
    edit(() => {
      if (kind === 'mess') { it.k = 'mess'; delete it.env; delete it.r; delete it.body; if (it.o && !/^\s*[\d.]+\s*$/.test(it.o)) it.o = null; return; }
      if (it.k === 'mess') { it.k = 'call'; it.body = []; it.o = null; }
      if (kind === 'callself') { it.env = 'callself'; it.b = it.a; if (it.r == null) it.r = ''; return; }
      if (it.a === it.b) { const other = insts().find((x: any) => x.v !== it.a); if (!other) { setTip(uiText('editor.umlsd.addAnother', 'Add another instance first')); return; } it.b = other.v; }
      it.env = kind;
      if (kind === 'call' && it.r == null) it.r = '';
      if (kind === 'messcall') delete it.r;
    });
  }
  // the two ends of a call or message (to itself: a self call; from a self call to another: a call)
  function setEnds(it: any, a: string, b: string) {
    if (it.k === 'mess' && a === b) { setTip(uiText('editor.umlsd.messOther', 'A message goes to another lifeline')); return false; }
    it.a = a; it.b = b;
    if (it.k === 'call') {
      if (a === b) { it.env = 'callself'; if (it.r == null) it.r = ''; }
      else if (it.env === 'callself') it.env = 'call';
    }
    return true;
  }
  // taking out a call or block keeps what is inside it, in its place
  function lift(l: any[], i: number) { const it = l[i]; l.splice(i, 1, ...(it.body || [])); }
  function deleteSel() {
    const it = selIt();
    if (!it) return;
    edit(() => {
      const l = listOf(E.sel), i = l.indexOf(it);
      if (it.k === 'inst') {
        l.splice(i, 1);
        // and every message to or from it
        const strip = (list: any[]) => { for (let j = list.length - 1; j >= 0; j--) { const x = list[j]; if (x.body) strip(x.body); if (isArrow(x) && (x.a === it.v || x.b === it.v)) lift(list, j); } };
        strip(items());
        return;
      }
      lift(l, i);
    });
    E.sel = null; draw(); renderProps();
  }
  function renameVar(it: any, to: string) {
    to = to.trim();
    if (!to || to === it.v || !validVar(to) || byVar(to)) return false;
    const from = it.v;
    for (const [x] of walk()) {
      if (isArrow(x)) { if (x.a === from) x.a = to; if (x.b === from) x.b = to; }
      if (x.k === 'style' && x.name === `instcolor${from}`) x.name = `instcolor${to}`;
    }
    it.v = to;
    return true;
  }
  // an item moved one place up or down among its neighbours (an instance among the instances)
  function shift(d: number) {
    const it = selIt();
    if (!it) return;
    const l = listOf(E.sel), i = l.indexOf(it);
    let j = i + d;
    if (it.k === 'inst') { while (j >= 0 && j < l.length && l[j].k !== 'inst') j += d; }
    if (j < 0 || j >= l.length || (it.k !== 'inst' && l[j].k === 'inst')) return;
    edit(() => { l.splice(i, 1); l.splice(j, 0, it); });
    E.sel = [...E.sel.slice(0, -1), j]; draw(); renderProps();
  }
  // an instance dropped at x (pt): its place among the instances of its list (the places the instances hold
  // in the code stay theirs; they are dealt out again in the new order)
  function moveInst(ref: number[], x: number) {
    const it = itemAt(ref), l = listOf(ref), L = lay();
    const mine = L.order.filter((n: any) => same(n.ref.slice(0, -1), ref.slice(0, -1)));
    const others = mine.filter((n: any) => !same(n.ref, ref)).map((n: any) => itemAt(n.ref));
    const at = mine.filter((n: any) => !same(n.ref, ref) && n.x < x).length;
    const next = [...others.slice(0, at), it, ...others.slice(at)];
    const slots = l.map((x: any, j: number) => (x.k === 'inst' ? j : -1)).filter((j: number) => j >= 0);
    if (next.every((x: any, j: number) => l[slots[j]] === x)) { draw(); return; }
    edit(() => { slots.forEach((j: number, q: number) => { l[j] = next[q]; }); });
    E.sel = [...ref.slice(0, -1), l.indexOf(it)]; draw(); renderProps();
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([cat, its]: any) => ({
      id: cat.fallback, title: caption(cat),
      // the shown names, the English ones and the category's find it
      items: its.map(([k, label, key, short]: any) => ({
        id: k, label: caption(short) || caption(label), title: caption(label), key, alt: `${label.fallback} ${short.fallback}`, keywords: `${caption(label)} ${k} ${caption(cat)} ${cat.fallback}`,
        svg: MINI[k], on: !!E && !!KIND_NAMES[k] && E.kind === k,
      })),
    })));
  }
  list.addEventListener('click', (e: any) => { const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  // an instance or thread is added; a kind of message changes the selected one and is the kind new ones get;
  // a block goes round the selection
  function pick(k: string) {
    if (k === 'inst' || k === 'thread') {
      const s = selIt();
      if (s && s.k === 'inst' && s.thread !== (k === 'thread') && E.lastPick !== k) { edit(() => { s.thread = k === 'thread'; s.o = null; }); E.lastPick = k; return; }
      E.lastPick = null;
      addInst(k === 'thread');
      return;
    }
    if (k === 'block') { addBlock(); return; }
    E.kind = k;
    const s = selIt();
    if (isArrow(s)) setKind(s, k);
    buildPalette();
    setTip(isArrow(s) ? '' : k === 'callself' ? uiText('editor.umlsd.armTipSelf', '{name}: drag from one lifeline to another (or down along one)', { name: caption(ITEM[k].name) }) : uiText('editor.umlsd.armTip', '{name}: drag from one lifeline to another', { name: caption(ITEM[k].name) }));
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 600], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  // pt (y up) ↔ screen
  const P = (x: number, y: number) => [E.view.ox + (x / CMPT) * E.view.k, E.view.oy - (y / CMPT) * E.view.k];
  const toPt = (sx: number, sy: number) => [((sx - E.view.ox) / E.view.k) * CMPT, ((E.view.oy - sy) / E.view.k) * CMPT];
  // a box { x, y (top), w, h } in pt on screen
  const boxScr = (b: any) => { const [l, t] = P(b.x, b.y), [r, bt] = P(b.x + b.w, b.y - b.h); return { l, t, r, b: bt }; };
  const instBox = (n: any) => ({ x: n.x - n.w / 2, y: n.h / 2, w: n.w, h: n.h });
  const inBox = (s: any, x: number, y: number, pad = 0) => x >= s.l - pad && x <= s.r + pad && y >= s.t - pad && y <= s.b + pad;
  function instAt(e: any, pad = 2) {
    const [x, y] = pos(e);
    return lay().order.find((n: any) => inBox(boxScr(instBox(n)), x, y, pad)) || null;
  }
  // a lifeline near the pointer (its activation bars included), below its box
  function lifelineAt(e: any, px = 10) {
    const L = lay(), [x, y] = pos(e);
    let best: any = null, bd = px;
    for (const n of L.order) {
      const [X, top] = P(n.x, -n.h / 2), d = Math.abs(X - x);
      if (y > top && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function labelAt(e: any) {
    const [x, y] = pos(e), L = lay();
    for (let i = L.labels.length - 1; i >= 0; i--) { const lb = L.labels[i]; if (lb.t && inBox(boxScr(lb.box), x, y, 1)) return lb; }
    return null;
  }
  function lineAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e);
    let best: any = null, bd = px;
    for (const ln of L.lines) {
      const p = ln.pts;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = P(p[i - 1][0], p[i - 1][1]), [bx, by] = P(p[i][0], p[i][1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = ln; }
      }
    }
    return best;
  }
  function barAt(e: any) {
    const [x, y] = pos(e), L = lay();
    for (let i = L.bars.length - 1; i >= 0; i--) { const b = L.bars[i]; if (b.thread) continue; const [l, t] = P(b.x1, b.y2), [r, bt] = P(b.x2, b.y1); if (x >= l - 1 && x <= r + 1 && y >= t && y <= bt) return b; }
    return null;
  }
  // a block: its caption, or near its frame
  function frameAt(e: any) {
    const [x, y] = pos(e), L = lay();
    for (let i = L.frames.length - 1; i >= 0; i--) {
      const f = L.frames[i], [l, t] = P(f.x1, f.y2), [r, b] = P(f.x2, f.y1);
      if (inBox(boxScr(f.title.box), x, y, 2)) return f;
      const near = (Math.abs(x - l) < 5 || Math.abs(x - r) < 5) && y >= t - 5 && y <= b + 5 || (Math.abs(y - t) < 5 || Math.abs(y - b) < 5) && x >= l - 5 && x <= r + 5;
      if (near) return f;
    }
    return null;
  }
  function fit() {
    const L = lay();
    E.view = fitView(rect(), L.empty ? { x: 0, y: 0, w: 4 * PX, h: 2 * PX } : L.bb, { scale: PX, margin: 0.5, min: 20, max: 120 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  const path = (pts: number[][]) => pts.map((p, i) => { const [X, Y] = P(p[0], p[1]); return `${i ? 'L' : 'M'}${r2(X)},${r2(Y)}`; }).join('');
  // what the visual edits wrote, put in the order pgf-umlsd needs (an instance before every message that names
  // it); the selection stays on the same item. Code typed by hand is left as it is.
  function settle() {
    if (!E.M.dirty || E.drag) return;
    const it = itemAt(E.sel);
    if (!U.settle(E.M) || !it) return;
    for (const [x, ref] of walk()) if (x === it) { E.sel = ref; break; }
  }
  function draw() {
    if (!E) return;
    settle();
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    const L = lay(), kk = k / PX, sel = E.sel;
    // the selection under the drawing: a message's lines, a block's frame
    if (sel) {
      for (const ln of L.lines) if (same(ln.ref, sel)) out += `<path class="ze-wsel" d="${path(ln.pts)}" stroke-width="10"/>`;
      for (const b of L.bars) if (same(b.ref, sel) && !b.thread) { const [l, t] = P(b.x1, b.y2), [rr, bt] = P(b.x2, b.y1); out += `<rect class="ze-wsel" x="${r2(l)}" y="${r2(t)}" width="${r2(rr - l)}" height="${r2(bt - t)}" stroke-width="6"/>`; }
      for (const f of L.frames) if (same(f.ref, sel)) { const [l, t] = P(f.x1, f.y2), [rr, b] = P(f.x2, f.y1); out += `<rect class="ze-wsel" x="${r2(l)}" y="${r2(t)}" width="${r2(rr - l)}" height="${r2(b - t)}" fill="none" stroke-width="8"/>`; }
    }
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${U.draw({ type: 'umlsd', x: L.bb.x, y: L.bb.y, src: snapCode() }, { export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(uiText('editor.umlsd.emptyHint', 'Add an instance from the left to start'))}</text>`;
    for (const n of L.order) {
      const s = boxScr(instBox(n)), at = `x="${r2(s.l - 3)}" y="${r2(s.t - 3)}" width="${r2(s.r - s.l + 6)}" height="${r2(s.b - s.t + 6)}" rx="3"`;
      if (same(n.ref, sel)) out += `<rect class="uml-sel" ${at}/>`;
      else if (E.hover && E.hover.inst === n.v) out += `<rect class="fy-vhov" ${at}/>`;
    }
    const d = E.drag;
    // a message being drawn: from where it started, level, to the lifeline under the pointer
    if (d && d.mode === 'arrow' && d.moved) {
      const A = L.order.find((n: any) => n.v === d.from), [, sy] = P(0, d.y);
      if (A) {
        const [X0] = P(A.x, 0), T = d.to ? L.order.find((n: any) => n.v === d.to) : null;
        if (T && T.v === A.v) out += `<path class="ze-draft" d="M${r2(X0)},${r2(sy)}h${r2(0.9 * k)}v${r2(0.25 * k)}h${r2(-0.9 * k)}"/>`;
        else {
          const X1 = T ? P(T.x, 0)[0] : d.at[0];
          out += `<path class="ze-draft" d="M${r2(X0)},${r2(sy)}H${r2(X1)}"/>`;
          if (!T) out += `<circle class="cz-snap on" cx="${r2(X1)}" cy="${r2(sy)}" r="5"/>`;
        }
        if (T) { const s = boxScr(instBox(T)); out += `<rect class="fy-vtarget" x="${r2(s.l - 3)}" y="${r2(s.t - 3)}" width="${r2(s.r - s.l + 6)}" height="${r2(s.b - s.t + 6)}" rx="3"/>`; }
      }
    }
    // an instance being moved: where it goes
    if (d && d.mode === 'move' && d.moved) {
      const n = L.order.find((x: any) => same(x.ref, d.ref));
      if (n) {
        const s = boxScr(instBox(n)), dx = d.at[0] - d.sx;
        out += `<rect class="fy-vtarget" x="${r2(s.l + dx)}" y="${r2(s.t)}" width="${r2(s.r - s.l)}" height="${r2(s.b - s.t)}" rx="2"/>`;
      }
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
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
    try { svg.setPointerCapture(e.pointerId); } catch (er) { /* a pointer the browser does not track */ }
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const lb = labelAt(e);
    if (lb) {
      if (dbl && same(E.sel, lb.ref)) { editText(lb.ref, lb.key); return; }
      E.sel = lb.ref; E.drag = null; draw(); renderProps(); return;
    }
    const n = instAt(e);
    if (n) {
      if (dbl && same(E.sel, n.ref)) { editText(n.ref, 't'); return; }
      E.sel = n.ref; E.drag = { mode: 'move', ref: n.ref, sx, sy, at: [sx, sy], moved: false };
      draw(); renderProps(); return;
    }
    const ln = lineAt(e);
    if (ln) {
      if (dbl && same(E.sel, ln.ref)) { editText(ln.ref, ln.ret ? 'r' : 't'); return; }
      E.sel = ln.ref; E.drag = null; draw(); renderProps(); return;
    }
    // on a lifeline (or an activation on it): a click selects, a drag draws a message from it
    const life = lifelineAt(e), bar = barAt(e);
    if (life) { E.drag = { mode: 'arrow', from: life.v, sx, sy, y: toPt(sx, sy)[1], at: [sx, sy], moved: false, click: bar ? bar.ref : null }; return; }
    const f = frameAt(e);
    if (f) {
      if (dbl && same(E.sel, f.ref)) { editText(f.ref, 't'); return; }
      E.sel = f.ref; E.drag = null; draw(); renderProps(); return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const n = instAt(e, 4), life = n ? null : lifelineAt(e);
      const h = n ? { inst: n.v } : life ? { inst: life.v } : null;
      svg.style.cursor = n ? 'grab' : labelAt(e) || lineAt(e) || frameAt(e) ? 'pointer' : life ? 'crosshair' : '';
      if (JSON.stringify(h) !== JSON.stringify(E.hover)) { E.hover = h; draw(); }
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'arrow') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
      d.moved = true; d.at = [sx, sy];
      const T = instAt(e, 6) || lifelineAt(e, 16);
      // on its own lifeline: a self call once the pointer has gone down along it
      d.to = T ? (T.v !== d.from || sy - d.sy > 12 ? T.v : null) : null;
      const kind = KIND_TITLE(d.to === d.from ? 'callself' : E.kind === 'callself' ? 'call' : E.kind);
      setTip(d.to ? uiText('editor.umlsd.dragTip', '{kind} from {from} to {to}', { kind, from: d.from, to: d.to }) : uiText('editor.umlsd.dropOnLifeline', 'Drop on a lifeline (on this one, lower down: a self call)'));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.abs(sx - d.sx) < 5) return;
      d.moved = true; d.at = [sx, sy];
      setTip(uiText('editor.umlsd.dropInstance', 'Drop where the instance goes'));
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'arrow') {
      setTip('');
      if (!d.moved) { E.sel = d.click; draw(); renderProps(); return; }
      if (d.to) addArrow(d.from, d.to, d.y);
      draw(); return;
    }
    if (d.mode === 'move' && d.moved) {
      setTip('');
      const n = lay().order.find((x: any) => same(x.ref, d.ref));
      if (n) { const [X] = P(n.x, 0); moveInst(d.ref, toPt(X + (d.at[0] - d.sx), 0)[0]); }
      return;
    }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });

  // right-click: the element's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { rename: 'edit', up: 'moveUp', down: 'moveDown', block: 'block', del: 'delete' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: act === 'del' });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const hit = labelAt(e) || instAt(e) || lineAt(e) || barAt(e) || frameAt(e);
    if (!hit) { closeMenu(); return; }
    E.sel = hit.ref;
    const it = selIt(), alt = isMac ? '⌥' : 'Alt+';
    const del = it.k === 'inst' ? (it.thread ? uiText('editor.umlsd.deleteThread', 'Delete Thread') : uiText('editor.umlsd.deleteInstance', 'Delete Instance')) : it.k === 'block' ? uiText('editor.umlsd.deleteBlock', 'Delete Block') : uiText('editor.umlsd.deleteKind', 'Delete {kind}', { kind: KIND_TITLE(kindOf(it)) });
    menuRows = [mItem('text', uiText('editor.umlsd.editText', 'Edit Text'), 'rename', '↩'), ...(it.k === 'inst' ? [mItem('up', uiText('editor.umlsd.moveLeft', 'Move Left'), 'up', `${alt}←`), mItem('down', uiText('editor.umlsd.moveRight', 'Move Right'), 'down', `${alt}→`)] : [mItem('up', uiText('editor.umlsd.moveUp', 'Move Up'), 'up', `${alt}↑`), mItem('down', uiText('editor.umlsd.moveDown', 'Move Down'), 'down', `${alt}↓`)]), ...(it.k !== 'inst' ? [mItem('wrap', uiText('editor.umlsd.putInBlock', 'Put in a Block'), 'block')] : []), '-', mItem('del', del, 'del', '⌫')];
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- text in place
  // A floating box under the text (TD.input.popup); the whole edit is one undo step. key: 't' the text, 'r' a
  // call's return value, 'c' a block's comment.
  let Lb: any = null;
  function editText(ref: number[], key: string) {
    const it = itemAt(ref);
    if (!TD.input || !it) return false;
    if (key === 'r' && (it.k !== 'call' || it.env === 'messcall')) key = 't';
    closeLabel();
    begin();
    const me: any = (Lb = { ref });
    me.pop = TD.input.popup(stage, {
      text: it[key] || '', math: false, bare: true,
      at: () => textPos(ref, key),
      onInput: (t: any) => { it[key] = t; E.M.dirty = true; draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function textPos(ref: number[], key: string) {
    const L = lay(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    const lb = L.labels.find((l: any) => same(l.ref, ref) && l.key === key);
    let X = 0, Y = 0;
    if (lb) { const s = boxScr(lb.box); X = (s.l + s.r) / 2; Y = s.b + 6; }
    else {
      const n = L.order.find((x: any) => same(x.ref, ref));
      if (n) { const s = boxScr(instBox(n)); X = (s.l + s.r) / 2; Y = s.b + 6; }
      else { const ln = L.lines.find((l: any) => same(l.ref, ref) && (key === 'r') === l.ret); if (ln) { const a = P(ln.pts[0][0], ln.pts[0][1]), b = P(ln.pts[ln.pts.length - 1][0], ln.pts[ln.pts.length - 1][1]); X = (a[0] + b[0]) / 2; Y = (a[1] + b[1]) / 2 + 8; } }
    }
    return [vr.left - sr.left + X, vr.top - sr.top + Y];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField(key?: string) {
    const f = key ? $(`[data-f="${key}"]`, props) : $('[data-f]', props);
    if (f) { f.focus(); if (f.select && f.tagName !== 'TEXTAREA') f.select(); }
  }

  // ---------------------------------------------------------------- properties
  // "2 instances · 3 messages"
  const countText = (n: number, m: number) => `${n === 1 ? uiText('editor.umlsd.oneInstance', '1 instance') : uiText('editor.umlsd.nInstances', '{n} instances', { n })} · ${m === 1 ? uiText('editor.umlsd.oneMessage', '1 message') : uiText('editor.umlsd.nMessages', '{n} messages', { n: m })}`;
  function renderProps() {
    if (!E) return;
    const it = selIt();
    const show = (title: string, summary: string, rows: any[]) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const sel = (label: string, key: string, value: string, options: string[][]) => row(label, { kind: 'select' as const, attrs: { 'data-f': key, 'aria-label': label }, options, value });
    const actions = (buttons: any[]) => ({ kind: 'actions' as const, class: 'row', buttons });
    const colorRow = (label: string, key: string, value: string, dflt?: string) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, title: label, defaultLabel: dflt })), controlClass: 'ctl tc' });
    const vars = insts().map((x: any) => [x.v, `${x.v}  ${x.t}`]);
    const moves = (h: boolean) => actions([{ text: h ? uiText('editor.umlsd.moveLeft', 'Move Left') : uiText('editor.umlsd.moveUp', 'Move Up'), attrs: { 'data-ue': 'up' } }, { text: h ? uiText('editor.umlsd.moveRight', 'Move Right') : uiText('editor.umlsd.moveDown', 'Move Down'), attrs: { 'data-ue': 'down' } }]);
    if (it && it.k === 'inst') {
      const uses = [...walk()].filter(([x]) => isArrow(x) && (x.a === it.v || x.b === it.v)).length;
      show(it.thread ? uiText('editor.umlsd.thread', 'Thread') : uiText('editor.umlsd.instance', 'Instance'), `${it.v}${uses ? ` · ${uses === 1 ? uiText('editor.umlsd.oneMessage', '1 message') : uiText('editor.umlsd.nMessages', '{n} messages', { n: uses })}` : ''}`, [
        field(uiText('editor.umlsd.text', 'Text'), 'itext', it.t, { 'data-tx': 'text', placeholder: 'name:Class' }),
        field(uiText('editor.umlsd.name', 'Name'), 'ivar', it.v, { class: 'mono' }),
        note(uiText('editor.umlsd.nameNote', 'The name messages refer to it by.')),
        segments(uiText('editor.umlsd.kind', 'Kind'), 'ikind', it.thread ? 'thread' : 'inst', [['inst', uiText('editor.umlsd.instance', 'Instance'), uiText('editor.umlsd.instanceTitle', 'passive until called ({cmd})', { cmd: '\\newinst' })], ['thread', uiText('editor.umlsd.thread', 'Thread'), uiText('editor.umlsd.threadTitle', 'active from the start ({cmd})', { cmd: '\\newthread' })]]),
        ...(it.thread ? [colorRow(uiText('editor.umlsd.colour', 'Colour'), 'icol', it.o ? U.unbrace(it.o) : '', uiText('editor.umlsd.grey30', 'Grey 30%'))]
          : [numField(uiText('editor.umlsd.gap', 'Gap'), 'igap', U.num(gapOf(it)), 'cm', { step: '0.1', min: '0' })]),
        moves(true),
        actions([{ text: it.thread ? uiText('editor.umlsd.deleteThread', 'Delete Thread') : uiText('editor.umlsd.deleteInstance', 'Delete Instance'), attrs: { class: 'danger', 'data-ue': 'del' } }]),
        ...(uses ? [note(uiText('editor.umlsd.deleteInstNote', 'Deleting it takes out its messages too (what they hold stays).'))] : []),
      ]);
      return;
    }
    if (isArrow(it)) {
      const k = kindOf(it), self = k === 'callself';
      show(KIND_TITLE(k), self ? it.a : `${it.a} → ${it.b}`, [
        sel(uiText('editor.umlsd.kind', 'Kind'), 'akind', k, [['call', KIND_TITLE('call')], ['callself', KIND_TITLE('callself')], ['messcall', KIND_TITLE('messcall')], ['mess', KIND_TITLE('mess')]]),
        sel(uiText('editor.umlsd.from', 'From'), 'afrom', it.a, vars),
        ...(self ? [] : [sel(uiText('editor.umlsd.to', 'To'), 'ato', it.b, vars)]),
        field(uiText('editor.umlsd.text', 'Text'), 'atext', it.t, { 'data-tx': 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') }),
        ...(it.k === 'call' && it.env !== 'messcall' ? [field(uiText('editor.umlsd.returns', 'Returns'), 'aret', it.r || '', { 'data-tx': 'text', placeholder: uiText('editor.commonB.nonePlaceholder', 'none') })] : []),
        it.k === 'mess'
          ? numField(uiText('editor.umlsd.delay', 'Delay'), 'adelay', it.o || '0', uiText('editor.umlsd.levels', 'levels'), { step: '1', min: '0' })
          : numField(uiText('editor.umlsd.length', 'Length'), 'alevel', it.o || '1', uiText('editor.umlsd.levels', 'levels'), { step: '1', min: '0' }),
        note(it.k === 'mess' ? uiText('editor.umlsd.delayNote', 'A delay draws it sloping down: it arrives that many levels later.') : uiText('editor.umlsd.lengthNote', 'How many levels it lasts after what it holds.')),
        moves(false),
        actions([{ text: uiText('editor.umlsd.putInBlock', 'Put in a Block'), attrs: { 'data-ue': 'wrap' } }, { text: uiText('editor.umlsd.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'del' } }]),
        ...(it.body && it.body.length ? [note(uiText('editor.umlsd.keepsNote', 'Deleting it keeps what it holds.'))] : []),
      ]);
      return;
    }
    if (it && it.k === 'block') {
      show(uiText('editor.umlsd.block', 'Block'), it.body.length === 1 ? uiText('editor.umlsd.oneItem', '1 item') : uiText('editor.umlsd.nItems', '{n} items', { n: it.body.length }), [
        field(uiText('editor.umlsd.caption', 'Caption'), 'btext', it.t, { 'data-tx': 'text', placeholder: 'loop' }),
        field(uiText('editor.umlsd.comment', 'Comment'), 'bcomm', it.c || '', { 'data-tx': 'text', placeholder: uiText('editor.umlsd.commentPlaceholder', 'e.g. [while running]') }),
        colorRow(uiText('editor.umlsd.captionFill', 'Caption fill'), 'bcol', it.o ? U.unbrace(it.o) : '', uiText('editor.umlsd.white', 'White')),
        moves(false),
        actions([{ text: uiText('editor.umlsd.deleteBlock', 'Delete Block'), attrs: { class: 'danger', 'data-ue': 'del' } }]),
        note(uiText('editor.umlsd.keepsNote', 'Deleting it keeps what it holds.')),
      ]);
      return;
    }
    if (it) {
      const what: Record<string, string> = { pre: uiText('editor.umlsd.preNote', '{cmd}: what follows starts a level earlier', { cmd: '\\prelevel' }), post: uiText('editor.umlsd.postNote', '{cmd}: what follows starts a level later', { cmd: '\\postlevel' }), bias: uiText('editor.umlsd.biasNote', '{cmd}: where calls meet a lifeline from here on', { cmd: `\\setthreadbias{${it.v}}` }), style: uiText('editor.umlsd.styleNote', 'A style, as written in the code'), flag: uiText('editor.umlsd.flagNote', 'A switch, as written in the code'), unit: uiText('editor.umlsd.unitNote', '{cmd}: one level is {n} cm', { cmd: '\\unitfactor', n: it.v }), raw: uiText('editor.umlsd.rawNote', 'Code kept as written') };
      show(uiText('editor.commonB.code', 'Code'), '', [note(what[it.k] || ''), moves(false), actions([{ text: uiText('editor.umlsd.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'del' } }])]);
      return;
    }
    const L = lay(), under = !items().some((x: any) => x.k === 'flag' && x.name === 'underline' && !x.v);
    renderView(props, FormPanel, { sections: [
      { ...section(captions["ui.sequence.diagram"], [
        segments(uiText('editor.umlsd.names', 'Names'), 'under', under ? 'on' : 'off', [['on', uiText('editor.umlsd.underlined', 'Underlined'), uiText('editor.umlsd.underlinedTitle', 'instances, as UML writes them')], ['off', uiText('editor.umlsd.plain', 'Plain'), '\\pgfumlsdunderlinefalse']]),
        note(uiText('editor.umlsd.help', 'Add instances from the left. Drag from one lifeline to another for a message of the kind chosen under Messages; on one lifeline, drag down for a self call. A message drawn inside an activation goes inside that call. Drag an instance sideways to reorder; double-click any text to edit it.')),
      ], 'sec'), summary: countText(L.order.length, L.lines.filter((l: any) => !l.ret).length) },
      section(uiText('editor.commonB.code', 'Code'), [note(uiText('editor.umlsd.codeNote1', 'Written for '), { code: 'pgf-umlsd' }, uiText('editor.umlsd.codeNote2', '. '), { code: '\\prelevel' }, ', ', { code: '\\postlevel' }, ', ', { code: '\\setthreadbias' }, uiText('editor.umlsd.codeNote3', ' and '), { code: '\\tikzstyle{inststyle}' }, uiText('editor.umlsd.codeNote4', ' are read and drawn; edit them in the code.'))], 'sec'),
    ] });
  }
  const gapOf = (it: any) => { const v = String(it.o ?? '').trim(); if (!v) return 0.2; const m = /^(-?[\d.]+)\s*(cm|mm|pt)?$/.exec(v); if (!m) return 0.2; const n = parseFloat(m[1]); return m[2] === 'mm' ? n / 10 : m[2] === 'pt' ? n / CMPT : n; };
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select, textarea')) begin(); });
  props.addEventListener('focusout', (e: any) => {
    if (isViewUpdating() || !e.target.matches('input, select, textarea')) return;
    const it = selIt();
    if (e.target.dataset.f === 'ivar' && it && it.v !== e.target.value.trim()) e.target.value = it.v;
    commit(); renderProps();
  });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f, it = selIt();
    if (!f || !it) return;
    const v = t.value;
    if (it.k === 'inst') {
      if (f === 'itext') it.t = v;
      else if (f === 'ivar') { if (!renameVar(it, v)) return; }
      else if (f === 'icol') it.o = v ? TD.texColor.wrap(v) : null;
      else if (f === 'igap') { const n = parseFloat(v); if (!isFinite(n) || n < 0) return; it.o = Math.abs(n - 0.2) < 1e-9 ? null : U.num(n); }
      else return;
    } else if (isArrow(it)) {
      if (f === 'akind') { setKind(it, v); return; }
      if (f === 'afrom') { if (!setEnds(it, v, kindOf(it) === 'callself' ? v : it.b === v && it.k === 'mess' ? it.a : it.b)) return; }
      else if (f === 'ato') { if (!setEnds(it, it.a, v)) return; }
      else if (f === 'atext') it.t = v;
      else if (f === 'aret') it.r = v;
      else if (f === 'adelay' || f === 'alevel') { const n = parseFloat(v); if (!isFinite(n) || n < 0) return; it.o = (f === 'adelay' ? n === 0 : n === 1) ? null : U.num(n); }
      else return;
    } else if (it.k === 'block') {
      if (f === 'btext') it.t = v;
      else if (f === 'bcomm') it.c = v;
      else if (f === 'bcol') it.o = v ? TD.texColor.wrap(v) : null;
      else return;
    } else return;
    E.M.dirty = true; draw();
  });
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, it = selIt();
    if (f === 'ikind' && it && it.k === 'inst') edit(() => { it.thread = v === 'thread'; it.o = null; });
    else if (f === 'under') setUnderline(v === 'on');
  });
  // \pgfumlsdunderlinefalse at the top; taken out to underline again
  function setUnderline(on: boolean) {
    edit(() => {
      E.M.items = items().filter((x: any) => !(x.k === 'flag' && x.name === 'underline'));
      if (!on) items().unshift({ k: 'flag', name: 'underline', v: false });
    });
  }

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ue="undo"]', root).disabled = !E.undo.length;
    $('[data-ue="redo"]', root).disabled = !E.redo.length;
    $('[data-ue="delete"]', root).disabled = !E.sel;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-ue]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ue!, b);
  });
  function act(a: string, b?: any) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'del') deleteSel();
    else if (a === 'up') shift(-1);
    else if (a === 'down') shift(1);
    else if (a === 'wrap') addBlock();
    else if (a === 'text' && E.sel) { const it = selIt(); if (!editText(E.sel, 't')) focusField(); void it; }
    else if (a === 'copy') copyCode(b, codeTa.value);
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const L = lay(), n = L.order.length, m = L.lines.filter((l: any) => !l.ret).length;
    count.textContent = countText(n, m);
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, L.warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps(); updateTools();
    showCodeNotes(codeMsg, U.layout({ src: codeTa.value }).warnings);
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
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel) { e.preventDefault(); if (!editText(E.sel, 't')) focusField(); return; }
    if (e.altKey && e.key.startsWith('Arrow') && E.sel) {
      e.preventDefault();
      const it = selIt(), h = it && it.k === 'inst';
      const d = (h ? e.key === 'ArrowLeft' : e.key === 'ArrowUp') ? -1 : (h ? e.key === 'ArrowRight' : e.key === 'ArrowDown') ? 1 : 0;
      if (d) shift(d);
      return;
    }
    const k = !e.altKey && KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => uiText('editor.umlsd.discard', 'Discard changes to this sequence diagram?'),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, kind: 'call', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null, lastPick: null };
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
  // for the tests: the state, the layout, a point on screen, and selecting
  TD.umlsdEditor = { open, dockable: true, close: () => dock.detach(), _state: () => E, _lay: () => lay(), _P: (x: number, y: number) => P(x, y), _select: (ref: any) => { E.sel = ref; draw(); renderProps(); } };
})();
