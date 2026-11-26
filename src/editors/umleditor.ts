import { message, onLocale, t } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import UmleditorFrame from '../ui/editors/UmleditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// Class diagram editor: the overlay that opens on a UML block. A palette of classes (class, interface,
// abstract, static, object), notes and relations; the diagram drawn at pgf-umlcd's sizes on a centimetre
// grid, where classes and notes are placed and moved (their lines follow) and relations are dragged from
// one class to another; the selected element's properties (name, members, kind, roles, colours); and beside
// them the pgf-umlcd code, live both ways. Untouched code is handed back as written.
// TD.umlEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const U = TD.uml;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PX = TD.PX_PER_CM, CMPT = U.CMPT, GRID = 0.25, OSEP = 0.2;
  const kv = U.kv;

  // ---------------------------------------------------------------- palette
  const pic = (body: string) => `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
  const cMini = (env: string, name: string, extra = '') => pic(`\\begin{${env}}[text width=${env === 'class' ? 1.7 : 2.3}cm]{${name}}{0,0}${extra}\\attribute{x}\\operation{f()}\\end{${env}}`);
  const ic = (d: string) => `<svg class="zxmini" viewBox="0 0 64 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">${d}</g></svg>`;
  const RMINI: Record<string, string> = {
    inherit: ic('<path d="M6 12H48"/><path d="M48 5.5L59 12L48 18.5Z"/>'),
    implement: ic('<path d="M6 12H48" stroke-dasharray="4 3"/><path d="M48 5.5L59 12L48 18.5Z"/>'),
    association: ic('<path d="M6 12H58"/>'),
    uni: ic('<path d="M6 12H57"/><path d="M50 6.5L58 12L50 17.5"/>'),
    aggregation: ic('<path d="M5 12L13 7L21 12L13 17Z"/><path d="M21 12H57"/><path d="M50 6.5L58 12L50 17.5"/>'),
    composition: ic('<path d="M5 12L13 7L21 12L13 17Z" fill="currentColor"/><path d="M21 12H57"/><path d="M50 6.5L58 12L50 17.5"/>'),
    dependency: ic('<path d="M6 12H57" stroke-dasharray="4 3"/><path d="M50 6.5L58 12L50 17.5"/>'),
    notelink: ic('<path d="M6 12H58" stroke-dasharray="4 3"/>'),
  };
  const PAL: any[] = [
    ['Elements', [
      ['n:class', 'Class', () => cMini('class', 'Class'), 'C'],
      ['n:interface', 'Interface', () => cMini('interface', 'Iface'), 'I'],
      ['n:abstractclass', 'Abstract class', () => cMini('abstractclass', 'Shape'), 'A', 'Abstract'],
      ['n:staticclass', 'Static class', () => cMini('staticclass', 'Util'), null, 'Static'],
      ['n:object', 'Object', () => pic('\\begin{object}[text width=1.7cm]{obj}{0,0}\\instanceOf{C}\\attribute{x = 1}\\end{object}'), 'O'],
      ['n:note', 'Note', () => pic('\\umlnote[text width=1.6cm] at (0,0) {A note};'), 'N'],
    ]],
    ['Relations', [
      ['r:inherit', 'Inheritance (generalisation)', null, 'G', 'Inherit'],
      ['r:implement', 'Realisation (implements)', null, null, 'Implement'],
      ['r:association', 'Association', null, null, 'Association'],
      ['r:uni', 'Directed association', null, null, 'Directed'],
      ['r:aggregation', 'Aggregation', null, null, 'Aggregation'],
      ['r:composition', 'Composition', null, null, 'Composition'],
      ['r:dependency', 'Dependency', null, 'D', 'Dependency'],
      ['r:notelink', 'Link to a note', null, null, 'Note link'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, string> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key, short] of items) { ITEM[k] = { k, name, mini, key, short }; if (key) KEYS[key.toLowerCase()] = k; }
  const KIND_NAMES: Record<string, string> = { inherit: 'inheritance', implement: 'realisation', association: 'association', uni: 'directed association', aggregation: 'aggregation', composition: 'composition', dependency: 'dependency', notelink: 'note link' };
  const REL_CMD: Record<string, string> = { association: 'association', uni: 'unidirectionalAssociation', aggregation: 'aggregation', composition: 'composition' };
  const CMD_KIND: Record<string, string> = { association: 'association', unidirectionalAssociation: 'uni', aggregation: 'aggregation', composition: 'composition' };
  const ENV_NAMES: Record<string, string> = { class: 'Class', interface: 'Interface', abstractclass: 'Abstract class', staticclass: 'Static class', object: 'Object' };
  const DEP_O = 'umlcd style dashed line, ->', LINK_O = 'umlcd style dashed line';
  // the names as shown (the tables above keep the English for search)
  const palText = (k: string): [string, string | undefined] => (({
    'n:class': () => [t('editor.uml.env.class', 'Class'), undefined], 'n:interface': () => [t('editor.uml.env.interface', 'Interface'), undefined],
    'n:abstractclass': () => [t('editor.uml.env.abstractclass', 'Abstract class'), t('editor.uml.short.abstract', 'Abstract')],
    'n:staticclass': () => [t('editor.uml.env.staticclass', 'Static class'), t('editor.uml.short.static', 'Static')],
    'n:object': () => [t('editor.uml.env.object', 'Object'), undefined], 'n:note': () => [t('editor.uml.note', 'Note'), undefined],
    'r:inherit': () => [t('editor.uml.pal.inherit', 'Inheritance (generalisation)'), t('editor.uml.short.inherit', 'Inherit')],
    'r:implement': () => [t('editor.uml.pal.implement', 'Realisation (implements)'), t('editor.uml.short.implement', 'Implement')],
    'r:association': () => [t('editor.uml.kindTitle.association', 'Association'), t('editor.uml.kindTitle.association', 'Association')],
    'r:uni': () => [t('editor.uml.kindTitle.uni', 'Directed association'), t('editor.uml.short.uni', 'Directed')],
    'r:aggregation': () => [t('editor.uml.kindTitle.aggregation', 'Aggregation'), t('editor.uml.kindTitle.aggregation', 'Aggregation')],
    'r:composition': () => [t('editor.uml.kindTitle.composition', 'Composition'), t('editor.uml.kindTitle.composition', 'Composition')],
    'r:dependency': () => [t('editor.uml.kindTitle.dependency', 'Dependency'), t('editor.uml.kindTitle.dependency', 'Dependency')],
    'r:notelink': () => [t('editor.uml.pal.notelink', 'Link to a note'), t('editor.uml.kindTitle.notelink', 'Note link')],
  } as Record<string, () => [string, string | undefined]>)[k]?.() ?? [ITEM[k].name, ITEM[k].short]);
  const palTitle = (title: string) => (title === 'Elements' ? t('editor.uml.pal.elements', 'Elements') : t('editor.uml.pal.relations', 'Relations'));
  const envName = (env: string) => (({
    class: () => t('editor.uml.env.class', 'Class'), interface: () => t('editor.uml.env.interface', 'Interface'), abstractclass: () => t('editor.uml.env.abstractclass', 'Abstract class'),
    staticclass: () => t('editor.uml.env.staticclass', 'Static class'), object: () => t('editor.uml.env.object', 'Object'),
  } as Record<string, () => string>)[env]?.() ?? ENV_NAMES[env]);
  // a relation kind: its name as a title ("Directed association"), and with its article ("a directed association")
  const kindTitle = (k: string) => (({
    inherit: () => t('editor.uml.kindTitle.inherit', 'Inheritance'), implement: () => t('editor.uml.kindTitle.implement', 'Realisation'), association: () => t('editor.uml.kindTitle.association', 'Association'),
    uni: () => t('editor.uml.kindTitle.uni', 'Directed association'), aggregation: () => t('editor.uml.kindTitle.aggregation', 'Aggregation'), composition: () => t('editor.uml.kindTitle.composition', 'Composition'),
    dependency: () => t('editor.uml.kindTitle.dependency', 'Dependency'), notelink: () => t('editor.uml.kindTitle.notelink', 'Note link'),
  } as Record<string, () => string>)[k]?.() ?? k);
  const kindA = (k: string) => (({
    inherit: () => t('editor.uml.kindA.inherit', 'an inheritance'), implement: () => t('editor.uml.kindA.implement', 'a realisation'), association: () => t('editor.uml.kindA.association', 'an association'),
    uni: () => t('editor.uml.kindA.uni', 'a directed association'), aggregation: () => t('editor.uml.kindA.aggregation', 'an aggregation'), composition: () => t('editor.uml.kindA.composition', 'a composition'),
    dependency: () => t('editor.uml.kindA.dependency', 'a dependency'), notelink: () => t('editor.uml.kindA.notelink', 'a note link'),
  } as Record<string, () => string>)[k]?.() ?? k);
  // a label's side, as the tip names it
  const sideName = (p: string | null) => (({
    right: () => t('editor.commonA.side.right', 'Right'), 'above right': () => t('editor.commonA.side.aboveRight', 'Above right'), above: () => t('editor.commonA.side.above', 'Above'),
    'above left': () => t('editor.commonA.side.aboveLeft', 'Above left'), left: () => t('editor.commonA.side.left', 'Left'), 'below left': () => t('editor.commonA.side.belowLeft', 'Below left'),
    below: () => t('editor.commonA.side.below', 'Below'), 'below right': () => t('editor.commonA.side.belowRight', 'Below right'),
  } as Record<string, () => string>)[p || '']?.() ?? (p ? p[0].toUpperCase() + p.slice(1) : t('editor.uml.side.on', 'On the line')));

  // ---------------------------------------------------------------- model
  // M = TD.uml.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = U.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? U.write(M) : M.raw);
  const items = () => E.M.items as any[];
  const isNode = (it: any) => it && (it.k === 'class' || it.k === 'note');
  const byName = (name: string) => items().find((it: any) => isNode(it) && it.name && it.name === name) || null;
  const idxOf = (it: any) => items().indexOf(it);
  const baseName = (ref: string) => String(ref || '').replace(/\.(north east|north west|south east|south west|north|south|east|west|center)$/, '').trim();
  const oList = (it: any) => U.opts(it.o || '');
  const setO = (it: any, list: string[]) => { it.o = list.join(', ') || (it.k === 'note' ? '' : null); };
  const getOpt = (it: any, k: string) => { const x = oList(it).find((y: string) => kv(y).k === k && kv(y).v != null); return x ? U.unbrace(kv(x).v) : ''; };
  function setOpt(it: any, k: string, v: string | null) {
    const l = oList(it), i = l.findIndex((y: string) => kv(y).k === k && kv(y).v != null), x = v ? `${k}=${v}` : null;
    if (i < 0) { if (x) l.unshift(x); } else if (x) l[i] = x; else l.splice(i, 1);
    setO(it, l);
  }
  const OWN = ['text width', 'fill', 'draw', 'text'];
  const isOwn = (x: string) => { const { k, v } = kv(x); return v != null && OWN.includes(k); };
  const twOf = (it: any) => { const v = getOpt(it, 'text width'), m = /^(-?[\d.]+)\s*(cm|mm|pt)?$/.exec(v); if (!m) return it.k === 'note' ? 4 : 5; const n = parseFloat(m[1]); return m[2] === 'mm' ? n / 10 : m[2] === 'pt' ? n / CMPT : n; };
  // the package an item sits in (by the order of the code), or null
  function pkgOf(i: number) {
    let p: any = null;
    for (let k = 0; k < i && k < items().length; k++) { const it = items()[k]; if (it.k === 'pkg') p = it; else if (it.k === 'endpkg') p = null; }
    return p;
  }
  // a class's place as written, or where the drawing put it
  function posOf(it: any) {
    if (it.x != null) return [it.x, it.y];
    const b = lay().boxes.find((x: any) => x.idx === idxOf(it));
    return b ? [snap((b.x + b.w / 2) / CMPT, false), snap((b.y + OSEP) / CMPT, false)] : [0, 0];
  }
  function newName(base: string) { let n = 1; while (byName(base + n)) n++; return base + n; }
  const validName = (t: string) => /^[^{}\\%,;.()[\]=$]+$/.test(t) && !/^\s|\s$/.test(t) && !/^-?[\d.]/.test(t);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'umlModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, UmleditorFrame);
  document.body.appendChild(root);
  const svg = $('.uml-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.commonA.elements', 'Elements'), listClass: 'uml-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { n: item index } (class or note) | { r: item index } (relation or line) | { h: { child, parent, kind } } | null,
  //   arm, kind, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, knobAt, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  const snapCode = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.typed = code; E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() {
    const s = E.sel;
    if (!s) return;
    if (s.n != null && !isNode(items()[s.n])) E.sel = null;
    else if (s.r != null && !/^(rel|draw)$/.test((items()[s.r] || {}).k)) E.sel = null;
    else if (s.h && !hasLink(s.h)) E.sel = null;
  }
  const hasLink = (h: any) => { const c = byName(h.child); return !!c && c.k === 'class' && (h.kind === 'inherit' ? c.inherits : c.implements).includes(h.parent); };
  const selN = () => (E.sel && E.sel.n != null ? items()[E.sel.n] || null : null);
  const selR = () => (E.sel && E.sel.r != null ? items()[E.sel.r] || null : null);
  const selH = () => (E.sel && E.sel.h ? E.sel.h : null);
  const lay = () => U.layout({ src: snapCode() });
  const snap = (n: any, on: any) => (on ? Math.round(n / GRID) * GRID : Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- editing
  // new classes and notes go before the first relation or line outside a package, so the lines that use them come after them
  function insertAt() {
    let depth = 0;
    for (let i = 0; i < items().length; i++) {
      const it = items()[i];
      if (it.k === 'pkg') depth++;
      else if (it.k === 'endpkg') depth = Math.max(0, depth - 1);
      else if (!depth && (it.k === 'rel' || it.k === 'draw')) return i;
    }
    return items().length;
  }
  const BASES: Record<string, string> = { class: 'Class', interface: 'Interface', abstractclass: 'Abstract', staticclass: 'Static', object: 'obj' };
  function addNode(key: string, x: number, y: number) {
    let at = 0;
    edit(() => {
      if (E.M.env == null) E.M.env = '';
      const env = key.slice(2);
      const it = env === 'note'
        ? { k: 'note', o: 'text width=3cm', name: '', x, y, text: 'Note' }
        : { k: 'class', env, o: 'text width=3cm', name: newName(BASES[env]), x, y, pos: null, attrs: [], ops: [], inherits: [], implements: [], instanceOf: null, extra: [] };
      at = insertAt();
      items().splice(at, 0, it);
    });
    E.sel = { n: at }; draw(); renderProps();
    return at;
  }
  // a note gets a name once a line goes to it
  function ensureName(it: any) {
    if (!it.name) it.name = newName('note');
    return it.name;
  }
  // links: { from, to } as names. Inheritance: from the subclass to its parent.
  function linkEnds(sel: any) {
    if (sel.h) return { from: sel.h.child, to: sel.h.parent, kind: sel.h.kind };
    const it = items()[sel.r];
    if (!it) return null;
    if (it.k === 'rel') return { from: it.a, to: it.b, kind: CMD_KIND[it.cmd] };
    return { from: it.a, to: it.b, kind: drawKind(it) };
  }
  const drawKind = (it: any) => { const l = U.opts(it.o).map((x: string) => kv(x).k); return l.includes('umlcd style dashed line') || l.includes('dashed') ? (l.some((k: string) => /^[^-]*-[^-]*$/.test(k) && /[>]/.test(k)) ? 'dependency' : 'notelink') : 'line'; };
  function removeLink(sel: any) {
    if (sel.h) {
      const c = byName(sel.h.child);
      if (c && c.k === 'class') { if (sel.h.kind === 'inherit') c.inherits = c.inherits.filter((p: string) => p !== sel.h.parent); else c.implements = c.implements.filter((p: string) => p !== sel.h.parent); }
      return;
    }
    if (sel.r != null) items().splice(sel.r, 1);
  }
  // the parent must come before its subclass in the code: the subclass moves down after it (within the same package)
  function order(parent: any, child: any) {
    const pi = idxOf(parent), ci = idxOf(child);
    if (pi < ci || pkgOf(pi) !== pkgOf(ci)) return;
    items().splice(ci, 1);
    items().splice(idxOf(parent) + 1, 0, child);
  }
  // returns the new selection, or null when the link can't be made
  function makeLink(from: any, to: any, kind: string) {
    if (from === to) return null;
    const notes = from.k === 'note' || to.k === 'note';
    if (notes) kind = kind === 'dependency' ? 'dependency' : 'notelink';
    if (kind === 'inherit' || kind === 'implement') {
      const key = kind === 'inherit' ? 'inherits' : 'implements';
      if (!from[key].includes(to.name)) from[key].push(to.name);
      order(to, from);
      return { h: { child: from.name, parent: to.name, kind } };
    }
    const a = ensureName(from), b = ensureName(to);
    if (REL_CMD[kind]) items().push({ k: 'rel', cmd: REL_CMD[kind], o: null, a, b, ra: '', ma: '', rb: '', mb: '' });
    else items().push({ k: 'draw', cmd: 'draw', o: kind === 'dependency' ? DEP_O : LINK_O, a, b, op: '--', labels: [] });
    return { r: items().length - 1 };
  }
  function addLink(fromIdx: number, toIdx: number, kind = E.kind) {
    const from = items()[fromIdx], to = items()[toIdx];
    if (!from || !to || from === to) return;
    if ((kind === 'inherit' || kind === 'implement') && (from.k !== 'class' || to.k !== 'class')) kind = 'notelink';
    if ((kind === 'inherit' || kind === 'implement') && (kind === 'inherit' ? from.inherits : from.implements).includes(to.name)) { setTip(kind === 'inherit' ? t('editor.uml.tip.alreadyInherits', '{from} already inherits from {to}', { from: from.name, to: to.name }) : t('editor.uml.tip.alreadyImplements', '{from} already implements {to}', { from: from.name, to: to.name })); return; }
    let sel: any = null;
    edit(() => { sel = makeLink(from, to, kind); });
    E.sel = sel; draw(); renderProps();
  }
  // a relation turned into another kind, between the same two
  function setLinkKind(kind: string) {
    const sel = E.sel, L = sel && linkEnds(sel);
    if (!L || L.kind === kind) return;
    const r = selR();
    if (r && r.k === 'rel' && REL_CMD[kind]) {
      edit(() => { if (r.cmd === 'association' && kind !== 'association') { r.ra = ''; r.ma = ''; } r.cmd = REL_CMD[kind]; });
      return;
    }
    if (r && r.k === 'draw' && (kind === 'dependency' || kind === 'notelink')) { edit(() => { r.o = kind === 'dependency' ? DEP_O : LINK_O; }); return; }
    const from = byName(baseName(L.from)), to = byName(baseName(L.to));
    if (!from || !to) return;
    if ((kind === 'inherit' || kind === 'implement') && (from.k !== 'class' || to.k !== 'class')) { setTip(t('editor.uml.tip.betweenClasses', 'Inheritance and realisation go between classes')); return; }
    let next: any = null;
    edit(() => { removeLink(sel); next = makeLink(from, to, kind); });
    E.sel = next; draw(); renderProps();
  }
  function reverseLink() {
    const sel = E.sel;
    if (!sel) return;
    if (sel.h) {
      const c = byName(sel.h.child), p = byName(sel.h.parent);
      if (!c || !p) return;
      let next: any = null;
      edit(() => { removeLink(sel); next = makeLink(p, c, sel.h.kind); });
      E.sel = next; draw(); renderProps();
      return;
    }
    const r = selR();
    if (!r) return;
    if (r.steps) { setTip(t('editor.uml.tip.routed', 'This line is routed in the code: reverse it there')); return; }
    edit(() => {
      const t = r.a; r.a = r.b; r.b = t;
      if (r.k === 'rel' && r.cmd === 'association') { [r.ra, r.rb] = [r.rb, r.ra]; [r.ma, r.mb] = [r.mb, r.ma]; }
      if (r.k === 'draw') for (const l of r.labels) l.after = 0;
    });
  }
  function deleteNode(i: number) {
    const it = items()[i];
    if (!isNode(it)) return;
    edit(() => {
      const name = it.name;
      items().splice(i, 1);
      if (!name) return;
      E.M.items = items().filter((x: any) => !((x.k === 'rel' || x.k === 'draw') && (baseName(x.a) === name || baseName(x.b) === name)));
      for (const x of items()) if (x.k === 'class') { x.inherits = x.inherits.filter((p: string) => p !== name); x.implements = x.implements.filter((p: string) => p !== name); }
    });
    E.sel = null; draw(); renderProps();
  }
  function deleteLink() { const sel = E.sel; if (!sel || sel.n != null) return; edit(() => removeLink(sel)); E.sel = null; draw(); renderProps(); }
  function deleteSel() { if (!E.sel) return; if (E.sel.n != null) deleteNode(E.sel.n); else deleteLink(); }
  function rename(it: any, to: string) {
    to = to.trim();
    if (!to || to === it.name || !validName(to) || byName(to)) return false;
    const from = it.name;
    if (from) for (const x of items()) {
      if (x.k === 'class') { x.inherits = x.inherits.map((p: string) => (p === from ? to : p)); x.implements = x.implements.map((p: string) => (p === from ? to : p)); }
      if (x.k === 'rel' || x.k === 'draw') for (const e of ['a', 'b']) if (baseName(x[e]) === from) x[e] = to + x[e].trim().slice(from.length);
    }
    it.name = to;
    return true;
  }
  function fitWidth(it: any) {
    if (it.k !== 'class') return;
    edit(() => setOpt(it, 'text width', `${U.num(U.fitWidth(it))}cm`));
  }
  function setEnv(it: any, env: string) {
    it.env = env;
    if (env !== 'object' && it.instanceOf != null && !it.instanceOf) it.instanceOf = null;
  }
  // operations as lines: a leading * marks an abstract one (\operation[0], set in italics)
  const opsText = (it: any) => it.ops.map((o: any) => (o.n === '0' ? '* ' : '') + o.t).join('\n');
  const readOps = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^\*\s*/.test(l) ? { t: l.replace(/^\*\s*/, ''), n: '0' } : { t: l, n: null }));
  const readLines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
  const noteText = (t: string) => String(t || '').split(/\s*\\\\\s*/).join('\n');
  const writeNote = (t: string) => t.split('\n').map((l) => l.trim()).join(' \\\\ ').trim();

  // ---------------------------------------------------------------- palette
  const miniCache = new Map<string, string>();
  function mini(k: string) {
    const it = ITEM[k];
    if (k[0] === 'r') return RMINI[k.slice(2)];
    if (miniCache.has(k)) return miniCache.get(k)!;
    const src = it.mini(), bb = U.layout({ src }).bb;
    const svgT = `<svg class="zxmini" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${U.draw({ x: 0, y: 0, src }, { export: true })}</svg>`;
    miniCache.set(k, svgT);
    return svgT;
  }
  function buildPalette() {
    pal.render(PAL.map(([title, its]: any) => ({
      id: title, title: palTitle(title),
      // the shown names, the English ones and the category's find it
      items: its.map(([k, name0, , key, short0]: any) => {
        const [name, short] = palText(k);
        return { id: k, label: short || name, title: name, key, alt: `${name0} ${short0 || ''}`, keywords: `${name} ${k.slice(2)} ${title} ${palTitle(title)}`, svg: fitMini(mini(k), 64, 44, 1.2), on: !!E && k === `r:${E.kind}` };
      }),
    })), { armed: E?.arm });
  }
  // click: an element kind restyles the selected class or is armed for placing; a relation kind changes the
  // selected relation and is the kind new ones get. Drag an element onto the canvas.
  paletteDrag(list, {
    keyboard: true,
    drags: (k) => k[0] === 'n',
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: toCm(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) { const [x, y] = toCm(e, !e.altKey); addNode(d.k, x, y); }
      E.hover = null; draw();
    },
  });
  function pick(k: string) {
    if (k[0] === 'r') {
      if (E.arm) { E.arm = null; draw(); }
      E.kind = k.slice(2);
      const linked = E.sel && E.sel.n == null;
      if (linked) setLinkKind(E.kind);
      buildPalette();
      setTip(linked ? '' : t('editor.uml.tip.relation', '{kind}: point at a class, then drag its blue handle to another one', { kind: palText(k)[0] }));
      return;
    }
    const n = selN();
    if (n && n.k === 'class' && k !== 'n:note' && !E.arm) { edit(() => setEnv(n, k.slice(2))); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? t('editor.uml.tip.place', '{kind}: click the grid to place it. Esc when done.', { kind: palText(k)[0] }) : '');
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 600], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  // screen ↔ cm (y up); pt (y up) → screen
  const m = (x: any, y: any) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  const P = (x: number, y: number) => [E.view.ox + (x / CMPT) * E.view.k, E.view.oy - (y / CMPT) * E.view.k];
  const toCm = (e: any, snapOn = true) => { const [x, y] = pos(e), v = E.view; return [snap((x - v.ox) / v.k, snapOn), snap((v.oy - y) / v.k, snapOn)]; };
  // a box on screen: { l, t, r, b }
  const boxScr = (b: any) => { const [l, t] = P(b.x, b.y), [r, bt] = P(b.x + b.w, b.y - b.h); return { l, t, r, b: bt }; };
  function boxAt(e: any, pad = 2) {
    const L = lay(), [x, y] = pos(e);
    for (let i = L.boxes.length - 1; i >= 0; i--) {
      const B = L.boxes[i], s = boxScr(B);
      if (x >= s.l - pad && x <= s.r + pad && y >= s.t - pad && y <= s.b + pad) return B;
    }
    return null;
  }
  const refSel = (ref: any) => (ref.kind === 'rel' || ref.kind === 'draw' ? { r: ref.idx } : { h: { child: ref.b, parent: ref.a, kind: ref.kind } });
  const sameSel = (a: any, b: any) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  function lineAt(e: any, px = 6) {
    const L = lay(), [x, y] = pos(e);
    let best: any = null, bd = px;
    for (const ln of L.lines) {
      for (const lb of ln.labels) {
        const s = boxScr(lb.box);
        if (x >= s.l && x <= s.r && y >= s.t && y <= s.b) return refSel(ln.ref);
      }
      const p = ln.d;
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = P(p[i - 1][0], p[i - 1][1]), [bx, by] = P(p[i][0], p[i][1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (d < bd) { bd = d; best = refSel(ln.ref); }
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
  // what the visual edits wrote, put in the order pgf-umlcd needs (a parent typed into "Inherits from", a link to a
  // class in a later package…); the selection stays on the same item. Code typed by hand is left as it is.
  function settle() {
    if (!E.M.dirty || E.drag || Lb) return; // a name being typed: once it is done
    const s = E.sel, it = s && (s.n != null ? items()[s.n] : s.r != null ? items()[s.r] : null);
    if (!U.settle(E.M) || !it) return;
    if (s.n != null) s.n = idxOf(it); else s.r = idxOf(it);
  }
  function draw() {
    if (!E) return;
    settle();
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
    if (E.sel && E.sel.n == null) for (const ln of L.lines) if (sameSel(refSel(ln.ref), E.sel)) {
      out += `<path class="ze-wsel" d="${ln.d.map((p: number[], i: number) => { const [X, Y] = P(p[0], p[1]); return `${i ? 'L' : 'M'}${r2(X)},${r2(Y)}`; }).join('')}" stroke-width="10"/>`;
    }
    if (!L.empty) out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})">${U.draw({ type: 'uml', x: L.bb.x, y: L.bb.y, src: snapCode() }, { export: true })}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(t('editor.uml.empty', 'Place a class from the left to start'))}</text>`;
    const dragE = E.drag && E.drag.mode === 'edge';
    for (const B of L.boxes) {
      const s = boxScr(B), at = `x="${r2(s.l - 3)}" y="${r2(s.t - 3)}" width="${r2(s.r - s.l + 6)}" height="${r2(s.b - s.t + 6)}" rx="3"`;
      if (E.sel && E.sel.n === B.idx) out += `<rect class="uml-sel" ${at}/>`;
      else if (dragE && E.hover && E.hover.i === B.idx && B.idx !== E.drag.from) out += `<rect class="fy-vtarget" ${at}/>`;
      else if (E.hover && E.hover.i === B.idx && !E.drag) out += `<rect class="fy-vhov" ${at}/>`;
    }
    // a relation being drawn
    if (dragE) {
      const B = L.boxes.find((x: any) => x.idx === E.drag.from);
      if (B) {
        const s = boxScr(B), x0 = (s.l + s.r) / 2, y0 = (s.t + s.b) / 2;
        const T = E.hover && E.hover.i != null ? L.boxes.find((x: any) => x.idx === E.hover.i) : null;
        const t = T ? (() => { const q = boxScr(T); return [(q.l + q.r) / 2, (q.t + q.b) / 2]; })() : m(...((E.hover && E.hover.at ? E.hover.at : E.drag.at) as [any, any]));
        out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(t[0])},${r2(t[1])}"/>`;
        if (!T) out += `<circle class="cz-snap on" cx="${r2(t[0])}" cy="${r2(t[1])}" r="5"/>`;
      }
    }
    // the knob: a selected (or hovered) class's handle for drawing relations, right of its box
    const ki = !E.drag && !E.arm && !E.ghost ? (E.knobAt != null ? E.knobAt : E.sel && E.sel.n != null ? E.sel.n : null) : null;
    const KB = ki != null ? L.boxes.find((x: any) => x.idx === ki) : null;
    E.knobPos = null;
    if (KB) {
      const s = boxScr(KB), kx = r2(s.r + 14), ky = r2(Math.min(s.t + 16, (s.t + s.b) / 2));
      E.knobPos = { i: ki, X: s.r, Y: ky, kx, ky };
      out += `<g class="ze-knob" data-i="${ki}"><title>${esc(t('editor.uml.knob', 'Drag to another class to draw {what}', { what: KB.note ? t('editor.uml.knob.line', 'a line to it') : kindA(E.kind) }))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6"/></g>`;
    }
    // placing: where it lands
    if ((E.arm || E.ghost) && E.hover && E.hover.at) { const [X, Y] = m(...(E.hover.at as [any, any])); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  // which compartment of a class a point is in: 0 name, 1 attributes, 2 operations
  function partAt(B: any, e: any) {
    if (!B.splits || !B.splits.length) return 0;
    const [, y] = pos(e);
    let p = 0;
    for (const sy of B.splits) if (y > P(0, sy)[1]) p++;
    return p;
  }
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
    const kb = e.target.closest('.ze-knob');
    if (kb) { E.drag = { mode: 'edge', from: +kb.dataset.i, at: toCm(e), cx: e.clientX, cy: e.clientY }; E.knobAt = null; return; }
    if (E.arm) { const [x, y] = toCm(e, !e.altKey); addNode(E.arm, x, y); return; }
    const B = boxAt(e);
    if (B) {
      if (dbl && E.sel && E.sel.n === B.idx) { openPart(B.idx, B.note ? 1 : partAt(B, e), e); return; }
      E.sel = { n: B.idx };
      const it = items()[B.idx], [x0, y0] = posOf(it);
      E.drag = { mode: 'move', i: B.idx, sx, sy, moved: false, x0, y0 };
      draw(); renderProps(); return;
    }
    const ln = lineAt(e);
    if (ln) {
      if (dbl && sameSel(E.sel, ln)) { if (!editLine(ln, e)) focusField(); return; }
      // a label of a drawn line moves along it and to either side
      const lu = labelUnder(e);
      E.sel = ln; E.drag = lu && sameSel(ln, { r: lu.idx }) ? { mode: 'label', idx: lu.idx, key: lu.lb.key, span: lu.lb.span, sx, sy, moved: false } : null;
      draw(); renderProps(); return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const B = boxAt(e, 10), kb = e.target.closest('.ze-knob');
      const h = E.arm ? { at: toCm(e, !e.altKey) } : B ? { i: B.idx } : null;
      // the handle stays up while the pointer travels from its box to it
      const kp = E.knobPos, onWay = !!kp && kp.i === E.knobAt && sx >= kp.X - 4 && sx <= kp.kx + 8 && Math.abs(sy - kp.ky) <= 12;
      const knob = B ? B.idx : kb || onWay ? E.knobAt : null;
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.style.cursor = E.arm ? '' : boxAt(e) ? 'move' : labelUnder(e) ? 'move' : lineAt(e) ? 'pointer' : '';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'edge') {
      const B = boxAt(e, 6);
      E.hover = B ? { i: B.idx } : { at: toCm(e, !e.altKey) };
      const to = B && items()[B.idx];
      setTip(B && B.idx === d.from ? t('editor.uml.tip.dropOther', 'Drop on another class') : to ? t('editor.uml.tip.kindTo', '{kind} to {name}', { kind: kindTitle(E.kind), name: to.name || t('editor.uml.theNote', 'the note') }) : t('editor.uml.tip.dropClass', 'Drop on a class, or on the grid for a new one'));
      draw(); return;
    }
    if (d.mode === 'label') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); d.moved = true; }
      const r = items()[d.idx], ln = lineOf(d.idx);
      if (!r || !ln) return;
      const where = dropLabel(ln.pts, d.span, sx, sy);
      labelSlot(r, d.key).place(where.pos, where.place);
      E.M.dirty = true;
      setTip(t('editor.uml.tip.labelAt', '{side} at {pos}', { side: sideName(where.place), pos: where.pos }));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      if (!d.moved) { begin(); d.moved = true; }
      const it = items()[d.i], k = E.view.k;
      it.x = snap(d.x0 + (sx - d.sx) / k, !e.altKey); it.y = snap(d.y0 - (sy - d.sy) / k, !e.altKey);
      if (it.k === 'class') it.pos = null;
      E.M.dirty = true;
      setTip(`${t('editor.uml.tip.at', '{name} at ({x}, {y})', { name: it.name || t('editor.uml.note', 'Note'), x: U.num(it.x), y: U.num(it.y) })}${e.altKey ? '' : ` · ${t('editor.uml.tip.free', '⌥ to place freely')}`}`);
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
      const B = boxAt(e, 6);
      E.hover = null;
      if (B && B.idx !== d.from) addLink(d.from, B.idx);
      else if (!B && overStage(e)) {
        // on the grid: a new class (or note, from a note) there, joined to this one
        const from = items()[d.from], [x, y] = toCm(e, !e.altKey);
        begin();
        const it = from.k === 'note' || E.kind === 'notelink'
          ? { k: 'note', o: 'text width=3cm', name: newName('note'), x, y, text: 'Note' }
          : { k: 'class', env: E.kind === 'implement' ? 'interface' : 'class', o: 'text width=3cm', name: '', x, y, pos: null, attrs: [], ops: [], inherits: [], implements: [], instanceOf: null, extra: [] };
        if (it.k === 'class') it.name = newName(BASES[(it as any).env]);
        if (E.M.env == null) E.M.env = '';
        items().splice(insertAt(), 0, it);
        // a new parent goes before the subclass
        const sel = makeLink(from, it, E.kind);
        E.M.dirty = true; commit();
        E.sel = sel || { n: idxOf(it) }; renderProps(); draw();
      }
      draw(); return;
    }
    if ((d.mode === 'move' || d.mode === 'label') && d.moved) { setTip(''); commit(); renderProps(); draw(); return; }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt != null)) { E.hover = null; E.knobAt = null; draw(); } });

  // right-click: the element's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { rename: 'edit', attr: 'umlAttributes', op: 'umlOperations', fit: 'fitWidth', del: 'delete', rev: 'reverse', line: 'straight', tri: 'arrowTriangle', dia: 'arrowDiamond' };
  // `on`: the current choice of a pick-one group, ticked
  const mItem = (act: string, label: string, icon: string, key?: string, on?: boolean) => menuRow(act, label, MI[icon], key, { danger: /^(ndel|ldel)$/.test(act), checked: on });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const B = boxAt(e), ln = B ? null : lineAt(e);
    if (B) {
      E.sel = { n: B.idx };
      const it = items()[B.idx];
      menuRows = it.k === 'note'
        ? [mItem('text', t('editor.uml.menu.editText', 'Edit Text'), 'rename', '↩'), '-', mItem('ndel', t('editor.uml.deleteNote', 'Delete Note'), 'del', '⌫')]
        : [mItem('rename', t('ui.rename', 'Rename'), 'rename', '↩'), mItem('attr', t('editor.uml.menu.attrs', 'Edit Attributes'), 'attr'), mItem('op', t('editor.uml.menu.ops', 'Edit Operations'), 'op'), mItem('fitw', t('editor.uml.fitWidth', 'Fit Width to Text'), 'fit'), '-', mItem('ndel', t('editor.uml.deleteKind', 'Delete {kind}', { kind: envName(it.env) }), 'del', '⌫')];
    } else if (ln) {
      E.sel = ln;
      const L = linkEnds(ln)!, ck = L.kind;
      const kinds = [['association', kindTitle('association'), 'line'], ['uni', t('editor.uml.menu.uni', 'Directed Association'), 'tri'], ['aggregation', kindTitle('aggregation'), 'dia'], ['composition', kindTitle('composition'), 'dia'], ['inherit', kindTitle('inherit'), 'tri'], ['implement', kindTitle('implement'), 'tri'], ['dependency', kindTitle('dependency'), 'tri']];
      const ends = [byName(baseName(L.from)), byName(baseName(L.to))], classes = ends.every((x: any) => x && x.k === 'class');
      // a path routed in the code keeps its route: it changes kind only as a line does, and isn't reversed
      const routed = !!(selR() && selR().steps);
      const plain = [mItem('k:notelink', t('editor.uml.menu.plainLink', 'Plain Link'), 'line', undefined, ck === 'notelink'), mItem('k:dependency', kindTitle('dependency'), 'tri', undefined, ck === 'dependency')];
      menuRows = [...(routed ? [] : [mItem('rev', t('editor.uml.reverse', 'Reverse Direction'), 'rev'), '-' as const]), ...(routed ? plain : classes ? kinds.map(([k, label, i]) => mItem('k:' + k, label, i, undefined, ck === k)) : plain), '-', mItem('ldel', t('editor.uml.menu.deleteLine', 'Delete Line'), 'del', '⌫')];
    } else { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- name editor
  // A floating box under the class's name (TD.input.popup); the whole edit is one undo step.
  let Lb: any = null;
  function editName(i: number) {
    const it = items()[i];
    if (!TD.input || !it || it.k !== 'class') return false;
    closeLabel();
    begin();
    const me: any = (Lb = { i });
    me.pop = TD.input.popup(stage, {
      text: it.name, math: false, bare: true,
      at: () => namePos(i),
      onInput: (t: any) => { if (rename(it, t)) { E.M.dirty = true; draw(); renderProps(); } },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function namePos(i: number) {
    const B = lay().boxes.find((x: any) => x.idx === i), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    if (!B) return [0, 0];
    const s = boxScr(B), y = B.splits && B.splits.length ? P(0, B.splits[0])[1] : s.b;
    return [vr.left - sr.left + (s.l + s.r) / 2, vr.top - sr.top + y + 8];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  // a label on a line, by its key: a relation's field ('ra', 'mb'…), a draw's label ([j]) or a routed draw's ([step, j])
  const lineOf = (idx: number) => lay().lines.find((ln: any) => (ln.ref.kind === 'rel' || ln.ref.kind === 'draw') && ln.ref.idx === idx);
  function labelAt(e: any, idx: number) {
    const ln = lineOf(idx), [x, y] = pos(e);
    if (!ln) return null;
    for (const lb of ln.labels) { const b = boxScr(lb.box); if (x >= b.l && x <= b.r && y >= b.t && y <= b.b) return lb.key; }
    return null;
  }
  function labelSlot(r: any, key: any) {
    if (typeof key === 'string') return { get: () => r[key] || '', set: (t: string) => { r[key] = t; }, done: () => {}, place: (_p: number, _s: string | null) => {} };
    const list = () => (key.length === 2 ? r.steps[key[0]].labels : r.labels), j = key[key.length - 1];
    return {
      get: () => (list()[j] ? list()[j].t : ''),
      set: (t: string) => { const l = list(); if (l[j]) l[j].t = t; else l[j] = { o: 'midway, auto', t, after: 0 }; },
      // a label left empty is taken out
      done: () => { const l = list(); if (l[j] && !l[j].t.trim()) l.splice(j, 1); },
      // its place: where along the line (pos) and on which side (above, below left…; none: on the line)
      place: (pos: number, place: string | null) => {
        const lb = list()[j];
        if (!lb) return;
        const keep = U.opts(lb.o || '').filter((x: string) => { const { k, v } = kv(x); return !(k === 'pos' || k === 'auto' || k === 'swap' || k === "'" || k === 'anchor' || (U.POS[k] != null && v == null) || U.PLACE[k]); });
        const name = Object.keys(U.POS).find((k) => U.POS[k] === pos && !/very/.test(k));
        lb.o = [...keep, name || `pos=${U.num(pos)}`, ...(place ? [place] : ['anchor=center'])].join(', ');
      },
    };
  }
  // a label of a drawn line under the pointer (a relation's are pgf-umlcd's own)
  function labelUnder(e: any) {
    const [x, y] = pos(e);
    for (const ln of lay().lines) {
      if (ln.ref.kind !== 'draw') continue;
      for (const lb of ln.labels) { if (!Array.isArray(lb.key)) continue; const b = boxScr(lb.box); if (x >= b.l && x <= b.r && y >= b.t && y <= b.b) return { idx: ln.ref.idx, lb }; }
    }
    return null;
  }
  // where a label dropped at (x, y) goes: the nearest point of its stretch of the line (pos 0…1, in 0.05s),
  // and the side the pointer is on (TikZ's above, below right…, or on the line within 6px)
  function dropLabel(pts: number[][], span: number[], x: number, y: number) {
    const [k0, k1] = span || [0, pts.length - 1];
    let best: any = null;
    for (let k = k0; k < k1; k++) {
      const [ax, ay] = P(pts[k][0], pts[k][1]), [bx, by] = P(pts[k + 1][0], pts[k + 1][1]);
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const X = ax + dx * u, Y = ay + dy * u, d = Math.hypot(x - X, y - Y);
      if (!best || d < best.d) best = { d, k, u, X, Y };
    }
    let p = (best.k - k0 + best.u) / Math.max(1, k1 - k0);
    p = Math.round(p * 20) / 20;
    const ox = x - best.X, oy = best.Y - y;
    if (Math.hypot(ox, oy) < 6) return { pos: p, place: null };
    const SIDES = ['right', 'above right', 'above', 'above left', 'left', 'below left', 'below', 'below right'];
    const a = (Math.atan2(oy, ox) * 180) / Math.PI;
    return { pos: p, place: SIDES[((Math.round(a / 45) % 8) + 8) % 8] };
  }
  // a double-click on a line edits a label in place: the one under the pointer; else a relation's role at the
  // nearer end, a straight line's label, or a routed line's only label
  function editLine(sel: any, e: any) {
    const r = sel && sel.r != null ? items()[sel.r] : null;
    if (!TD.input || !r) return false;
    let key: any = labelAt(e, sel.r);
    if (key == null && r.k === 'rel') {
      const ln = lineOf(sel.r), [x, y] = pos(e);
      if (!ln) return false;
      const d = (p: number[]) => { const [px, py] = P(p[0], p[1]); return Math.hypot(px - x, py - y); };
      key = r.cmd === 'association' && d(ln.d[0]) < d(ln.d[ln.d.length - 1]) ? 'ra' : 'rb';
    } else if (key == null && r.k === 'draw') {
      if (!r.steps) key = [0];
      else { const all = r.steps.flatMap((st: any, k: number) => st.labels.map((_: any, j: number) => [k, j])); if (all.length !== 1) return false; key = all[0]; }
    }
    if (key == null) return false;
    closeLabel();
    begin();
    const slot = labelSlot(r, key), at = toCm(e, false), me: any = (Lb = { i: sel.r });
    me.pop = TD.input.popup(stage, {
      text: slot.get(), math: false, bare: true,
      at: () => {
        const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(), ln = lineOf(sel.r);
        const lb = ln && ln.labels.find((l: any) => JSON.stringify(l.key) === JSON.stringify(key));
        const [X, Y] = lb ? (({ l, r: rr, b }) => [(l + rr) / 2, b + 6])(boxScr(lb.box)) : ((p) => [p[0], p[1] + 14])(m(at[0], at[1]));
        return [vr.left - sr.left + X, vr.top - sr.top + Y];
      },
      onInput: (t: any) => { slot.set(t); E.M.dirty = true; draw(); renderProps(); },
      onDone: () => { slot.done(); if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function focusField(key?: string) {
    const f = key ? $(`[data-f="${key}"]`, props) : $('[data-f]', props);
    if (f) { f.focus(); if (f.select && f.tagName !== 'TEXTAREA') f.select(); }
  }
  // a double-click on a compartment edits it in place: the name, or the attribute or operation under the
  // pointer (in an empty compartment: a new one); a note in its field
  function openPart(i: number, part: number, e?: any) {
    const it = items()[i];
    if (!it) return;
    if (it.k === 'note') { focusField('ntext'); return; }
    if (part === 0) { editName(i); return; }
    if (!e || !editEntry(i, part, e)) focusField(part === 1 ? 'attrs' : 'ops');
  }
  function editEntry(i: number, part: number, e: any) {
    const it = items()[i], B = lay().boxes.find((b: any) => b.idx === i);
    if (!TD.input || !it || it.k !== 'class' || !B || !B.rows) return false;
    const list = part === 1 ? it.attrs : it.ops, y = pos(e)[1];
    const rows = B.rows.filter((r: any) => r.part === part).map((r: any) => ({ j: r.j, t: P(0, r.top)[1], b: P(0, r.bot)[1] }));
    // the row under the pointer, else the nearest; in an empty compartment, a new entry
    const hit = rows.find((r: any) => y >= r.t - 2 && y <= r.b + 2) || (rows.length ? rows.reduce((a: any, r: any) => (Math.abs((r.t + r.b) / 2 - y) < Math.abs((a.t + a.b) / 2 - y) ? r : a)) : null);
    closeLabel();
    begin();
    const j = hit ? hit.j : list.length;
    if (!hit) list.push(part === 1 ? '' : { t: '', n: null });
    const get = () => (part === 1 ? it.attrs[j] : it.ops[j] && it.ops[j].t) || '';
    const set = (t: string) => { if (part === 1) it.attrs[j] = t; else it.ops[j].t = t; };
    const me: any = (Lb = { i });
    me.pop = TD.input.popup(stage, {
      text: get(), math: false, bare: true,
      at: () => {
        const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(), Bx = lay().boxes.find((b: any) => b.idx === i);
        if (!Bx) return [0, 0];
        const s = boxScr(Bx), r = Bx.rows.find((q: any) => q.part === part && q.j === j);
        return [vr.left - sr.left + (s.l + s.r) / 2, vr.top - sr.top + (r ? P(0, r.bot)[1] : s.b) + 8];
      },
      onInput: (t: any) => { set(t); E.M.dirty = true; draw(); renderProps(); },
      // an entry left empty is taken out
      onDone: () => { if (!get().trim() && list[j] !== undefined) list.splice(j, 1); if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }

  // ---------------------------------------------------------------- properties
  const COLK: Record<string, string> = { cfill: 'fill', cdraw: 'draw', ctext: 'text' };
  function renderProps() {
    if (!E) return;
    const n = selN(), r = selR(), h = selH();
    const show = (title: string, summary: string, rows: any[]) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const colorRow = (label: string, key: string, value: string, o: Record<string, any> = {}) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, title: label, defaultLabel: o.dflt, defaultSwatch: o.dfltSw })), controlClass: 'ctl tc' });
    const area = (label: string, key: string, value: string, rows: number, placeholder: string) => ({ kind: 'column' as const, label: [label], labelTitle: t('editor.commonA.useMaths', 'Use $…$ for maths'), value, attrs: { 'data-f': key, 'data-tx': 'text', rows, spellcheck: 'false', class: 'mono', placeholder, 'aria-label': label } });
    const sel = (label: string, key: string, value: string, options: string[][]) => row(label, { kind: 'select' as const, attrs: { 'data-f': key, 'aria-label': label }, options, value });
    // one end of a relation: its role name and multiplicity side by side
    const end = (name: string, rk: string, rv: string, mk: string, mv: string, eg: string) => {
      const inp = (key: string, value: string, placeholder: string, label: string) => ({ kind: 'input' as const, value: value || '', attrs: { type: 'text', 'data-f': key, 'data-tx': 'text', spellcheck: 'false', placeholder, 'aria-label': label, title: label } });
      return row(t('editor.uml.at', 'At {name}', { name }), inp(rk, rv, t('editor.uml.role', 'role'), t('editor.uml.roleAt', 'Role at {name}', { name })), inp(mk, mv, eg, t('editor.uml.multAt', 'Multiplicity at {name}', { name })));
    };
    const actions = (buttons: any[]) => ({ kind: 'actions' as const, class: 'row', buttons });
    const colours = (it: any) => [colorRow(t('ui.fill', 'Fill'), 'cfill', getOpt(it, 'fill'), { dflt: t('editor.uml.yellow', 'Yellow') }), colorRow(t('ui.line', 'Line'), 'cdraw', getOpt(it, 'draw'), { dflt: t('editor.uml.purple', 'Purple') }), colorRow(t('ui.text', 'Text'), 'ctext', getOpt(it, 'text'), { dfltSw: TD.css('#000000') })];
    const eg = (example: string) => t('editor.commonA.eg', 'e.g. {example}', { example });
    if (n && n.k === 'class') {
      const [x, y] = posOf(n), rest = oList(n).filter((o: string) => !isOwn(o));
      const rels = items().filter((it: any) => (it.k === 'rel' || it.k === 'draw') && (baseName(it.a) === n.name || baseName(it.b) === n.name)).length + n.inherits.length + n.implements.length;
      const counts = [n.attrs.length === 1 ? t('editor.uml.oneAttr', '1 attribute') : t('editor.uml.nAttrs', '{n} attributes', { n: n.attrs.length }), n.ops.length === 1 ? t('editor.uml.oneOp', '1 operation') : t('editor.uml.nOps', '{n} operations', { n: n.ops.length })];
      if (rels) counts.push(rels === 1 ? t('editor.uml.oneLine', '1 line') : t('editor.uml.nLines', '{n} lines', { n: rels }));
      show(envName(n.env) || t('editor.uml.env.class', 'Class'), counts.join(' · '), [
        field(t('ui.name', 'Name'), 'name', n.name, { class: 'mono' }),
        sel(t('editor.uml.kind', 'Kind'), 'env', n.env, U.KINDS.map((k: string) => [k, envName(k)])),
        ...(n.env === 'object' ? [field(t('editor.uml.instanceOf', 'Instance of'), 'inst', n.instanceOf || '', { 'data-tx': 'text', placeholder: t('editor.uml.className', 'class name') })] : []),
        area(t('editor.uml.attributes', 'Attributes'), 'attrs', n.attrs.join('\n'), Math.max(2, Math.min(8, n.attrs.length + 1)), '- name : String'),
        area(t('editor.uml.operations', 'Operations'), 'ops', opsText(n), Math.max(2, Math.min(8, n.ops.length + 1)), '+ area() : double'),
        note(t('editor.uml.help.members', 'One per line. A leading '), { code: '*' }, t('editor.uml.help.abstract', ' marks an abstract operation ('), { code: '\\operation[0]' }, t('editor.uml.help.italics', ', in italics).')),
        field(t('editor.uml.inheritsFrom', 'Inherits from'), 'inh', n.inherits.join(', '), { placeholder: 'none' }),
        field(t('editor.uml.implements', 'Implements'), 'impl', n.implements.join(', '), { placeholder: 'none' }),
        { ...numField(t('editor.uml.textWidth', 'Text width'), 'tw', U.num(twOf(n)), 'cm', { step: '0.1', min: '0.5' }) },
        actions([{ text: t('editor.uml.fitWidth', 'Fit Width to Text'), attrs: { 'data-ue': 'fitw', title: t('editor.uml.fitWidthTitle', 'The width of the widest line') } }]),
        numField('x', 'x', U.num(x), 'cm', { step: '0.25' }), numField('y', 'y', U.num(y), 'cm', { step: '0.25' }),
        ...(n.x == null ? [note(t('editor.uml.help.position', 'Its position in the code is not one the drawing reads. Moving it writes one.'))] : []),
        ...colours(n),
        field(t('ui.options', 'Options'), 'opts', rest.join(', '), { class: 'mono', placeholder: eg('thick') }),
        actions([{ text: t('editor.uml.deleteKind', 'Delete {kind}', { kind: envName(n.env) || t('editor.uml.env.class', 'Class') }), attrs: { class: 'danger', 'data-ue': 'ndel' } }]),
      ]);
      return;
    }
    if (n && n.k === 'note') {
      const rest = oList(n).filter((o: string) => !isOwn(o));
      show(t('editor.uml.note', 'Note'), n.name ? t('editor.uml.named', 'named {name}', { name: n.name }) : t('editor.uml.notLinked', 'not linked'), [
        area(t('ui.text', 'Text'), 'ntext', noteText(n.text), 3, t('editor.uml.aNote', 'A note')),
        note(t('editor.uml.help.noteLines', 'Each line is a line of the note (written with '), { code: '\\\\' }, t('editor.uml.help.noteLinesEnd', ').')),
        field(t('ui.name', 'Name'), 'nname', n.name, { class: 'mono', placeholder: t('editor.uml.noteNamePh', 'given when a line goes to it') }),
        numField(t('editor.uml.textWidth', 'Text width'), 'tw', U.num(twOf(n)), 'cm', { step: '0.1', min: '0.5' }),
        numField('x', 'x', U.num(n.x), 'cm', { step: '0.25' }), numField('y', 'y', U.num(n.y), 'cm', { step: '0.25' }),
        ...colours(n),
        field(t('ui.options', 'Options'), 'opts', rest.join(', '), { class: 'mono', placeholder: eg('thick') }),
        actions([{ text: t('editor.uml.deleteNote', 'Delete Note'), attrs: { class: 'danger', 'data-ue': 'ndel' } }]),
      ]);
      return;
    }
    if (r && r.k === 'rel') {
      const assoc = r.cmd === 'association';
      show(kindTitle(CMD_KIND[r.cmd]), `${r.a} → ${r.b}`, [
        sel(t('editor.uml.kind', 'Kind'), 'rkind', CMD_KIND[r.cmd], [['association', kindTitle('association')], ['uni', kindTitle('uni')], ['aggregation', t('editor.uml.kindOpt.aggregation', 'Aggregation (open diamond)')], ['composition', t('editor.uml.kindOpt.composition', 'Composition (filled diamond)')], ['inherit', kindTitle('inherit')], ['implement', kindTitle('implement')], ['dependency', kindTitle('dependency')]]),
        ...(assoc ? [end(r.a, 'ra', r.ra, 'ma', r.ma, eg('1'))] : []),
        end(r.b, 'rb', r.rb, 'mb', r.mb, eg('0..*')),
        ...(r.cmd === 'aggregation' || r.cmd === 'composition' ? [note(t('editor.uml.help.diamond', 'The diamond is at {whole}, the whole; {part} is the part.', { whole: r.a, part: r.b }))] : []),
        field(t('ui.options', 'Options'), 'ropts', r.o || '', { class: 'mono', placeholder: eg('dashed') }),
        actions([{ text: t('editor.uml.reverse', 'Reverse Direction'), attrs: { 'data-ue': 'rev' } }, { text: t('ui.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'ldel' } }]),
      ]);
      return;
    }
    if (r && r.k === 'draw' && r.steps) {
      // a path through several points: its route and labels are the code's
      const dk = drawKind(r), n = r.steps.filter((x: any) => x.op !== 'move').length, labs = r.steps.reduce((a: number, x: any) => a + x.labels.length, 0);
      show(drawTitle(dk), `${r.a} → ${r.b || t('editor.uml.aPoint', 'a point')}`, [
        ...(dk === 'line' ? [] : [arrowRow(dk)]),
        field(t('ui.options', 'Options'), 'dopts', r.o || '', { class: 'mono', placeholder: eg('->') }),
        note(labs === 0 ? t('editor.uml.help.routed', 'Routed in {n} steps; it follows its classes when they move. Change the route and labels in the code.', { n }) : labs === 1 ? t('editor.uml.help.routedLabel', 'Routed in {n} steps with 1 label; it follows its classes when they move. Change the route and labels in the code.', { n }) : t('editor.uml.help.routedLabels', 'Routed in {n} steps with {labels} labels; it follows its classes when they move. Change the route and labels in the code.', { n, labels: labs })),
        actions([{ text: t('ui.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'ldel' } }]),
      ]);
      return;
    }
    if (r && r.k === 'draw') {
      const dk = drawKind(r), first = r.labels[0];
      show(drawTitle(dk), `${r.a} ${r.op} ${r.b}`, [
        ...(dk === 'line' ? [] : [arrowRow(dk)]),
        field(t('ui.label', 'Label'), 'dlabel', first ? first.t : '', { 'data-tx': 'text', placeholder: 'none' }),
        routeRow(r.op),
        field(t('ui.options', 'Options'), 'dopts', r.o || '', { class: 'mono', placeholder: eg('->') }),
        actions([{ text: t('editor.uml.reverse', 'Reverse Direction'), attrs: { 'data-ue': 'rev' } }, { text: t('ui.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'ldel' } }]),
      ]);
      return;
    }
    if (h) {
      show(kindTitle(h.kind === 'inherit' ? 'inherit' : 'implement'), `${h.child} → ${h.parent}`, [
        segments(t('editor.uml.kind', 'Kind'), 'hk', h.kind, [['inherit', t('editor.uml.inherits', 'Inherits'), t('editor.uml.inheritsTitle', 'solid line: a subclass')], ['implement', t('editor.uml.implements', 'Implements'), t('editor.uml.implementsTitle', 'dashed line: realises an interface')]]),
        note(t('editor.uml.help.writtenIn', 'Written in {name} as ', { name: h.child }), { code: `\\${h.kind}{${h.parent}}` }, t('editor.uml.help.writtenInEnd', '.')),
        actions([{ text: t('editor.uml.reverse', 'Reverse Direction'), attrs: { 'data-ue': 'rev' } }, { text: t('ui.delete', 'Delete'), attrs: { class: 'danger', 'data-ue': 'ldel' } }]),
      ]);
      return;
    }
    const nc = items().filter((it: any) => it.k === 'class').length;
    renderView(props, FormPanel, { sections: [
      { ...section(message('editor.uml.title', 'Class diagram'), [note(t('editor.uml.help.diagram', 'Place classes from the left on the grid and drag them to move ('), { kbd: '⌥' }, t('editor.uml.help.diagramRest', ' places freely); their lines follow. Select a class and drag its blue handle to another one for a relation of the kind chosen under Relations. Double-click a class’s name to rename it, an attribute or operation to edit it, or a line to edit its label; drag a line’s label to move it.'))], 'sec'), summary: countText(nc, relCount()) },
      section(t('editor.commonA.code', 'Code'), [note(t('editor.uml.help.codeFor', 'Written for '), { code: 'pgf-umlcd' }, t('editor.uml.help.macros', '. Its style macros ('), { code: '\\umldrawcolor' }, ', ', { code: '\\umlfillcolor' }, '), ', { code: '\\switchUmlcdSchool' }, t('editor.uml.help.macrosRest', ' and package environments are read and drawn; edit them in the code.'))], 'sec'),
    ] });
  }
  const countText = (nc: number, nr: number) => `${nc === 1 ? t('editor.uml.oneClass', '1 class') : t('editor.uml.nClasses', '{n} classes', { n: nc })} · ${nr === 1 ? t('editor.uml.oneRelation', '1 relation') : t('editor.uml.nRelations', '{n} relations', { n: nr })}`;
  const drawTitle = (dk: string) => (dk === 'dependency' ? kindTitle('dependency') : dk === 'notelink' ? kindTitle('notelink') : t('ui.line', 'Line'));
  const arrowRow = (dk: string) => segments(t('ui.arrow', 'Arrow'), 'dk', dk, [['notelink', t('ui.none', 'None')], ['dependency', kindTitle('dependency'), t('editor.uml.dependencyTitle', 'dashed with an arrow')]]);
  // the Route control: an icon for each shape of line, each drawn centred in the same 16 × 16 box
  const ROUTE_ICON: Record<string, string> = { '--': 'M3.5 12.5 12.5 3.5', '-|': 'M3.5 3.5H12.5V12.5', '|-': 'M3.5 3.5V12.5H12.5' };
  function routeRow(op: string) {
    const straight = t('editor.uml.route.straight', 'Straight'), across = t('editor.uml.route.across', 'Across, then up or down'), updown = t('editor.uml.route.updown', 'Up or down, then across');
    const R = segments(t('editor.uml.route', 'Route'), 'op', op, [['--', '', `${straight} (--)`, straight], ['-|', '', `${across} (-|)`, across], ['|-', '', `${updown} (|-)`, updown]]) as any;
    for (const c of R.options) c.svg = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${ROUTE_ICON[c.attrs['data-v']]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;
    return R;
  }
  const relCount = () => items().reduce((n: number, it: any) => n + (it.k === 'rel' || it.k === 'draw' ? 1 : it.k === 'class' ? it.inherits.length + it.implements.length : 0), 0);
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select, textarea')) begin(); });
  props.addEventListener('focusout', (e: any) => {
    if (isViewUpdating() || !e.target.matches('input, select, textarea')) return;
    const f = e.target.dataset.f, n = selN();
    if ((f === 'name' || f === 'nname') && n && (n.name || '') !== e.target.value.trim()) e.target.value = n.name;
    commit(); renderProps();
  });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const n = selN(), r = selR();
    if (n) {
      if (f === 'name' || f === 'nname') { if (!t.value.trim() && n.k === 'note' && !items().some((x: any) => x.k === 'draw' && (baseName(x.a) === n.name || baseName(x.b) === n.name))) n.name = ''; else if (!rename(n, t.value)) return; }
      else if (f === 'env') setEnv(n, t.value);
      else if (f === 'inst') n.instanceOf = t.value.trim() || null;
      else if (f === 'attrs') n.attrs = readLines(t.value);
      else if (f === 'ops') n.ops = readOps(t.value);
      else if (f === 'inh') n.inherits = U.opts(t.value);
      else if (f === 'impl') n.implements = U.opts(t.value);
      else if (f === 'ntext') n.text = writeNote(t.value) || 'Note';
      else if (f === 'tw') { const v = parseFloat(t.value); if (!isFinite(v) || v <= 0) return; setOpt(n, 'text width', `${U.num(v)}cm`); }
      else if (f === 'x' || f === 'y') { const v = parseFloat(t.value); if (!isFinite(v)) return; if (n.k === 'class' && n.x == null) { const [x, y] = posOf(n); n.x = x; n.y = y; n.pos = null; } n[f] = v; }
      else if (f === 'opts') setO(n, oList(n).filter(isOwn).concat(U.opts(t.value)));
      else if (COLK[f]) setOpt(n, COLK[f], t.value ? TD.texColor.wrap(t.value) : null);
      else return;
    } else if (r) {
      if (f === 'rkind') { setLinkKind(t.value); return; }
      if (r.k === 'rel' && /^(ra|ma|rb|mb)$/.test(f)) r[f] = t.value;
      else if (f === 'ropts' || f === 'dopts') r.o = t.value.trim() || (r.k === 'rel' ? null : '');
      else if (f === 'dlabel') { if (t.value) { if (r.labels[0]) r.labels[0].t = t.value; else r.labels.push({ o: 'midway, auto', t: t.value, after: 0 }); } else r.labels.shift(); }
      else return;
    } else return;
    E.M.dirty = true; draw();
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, r = selR(), h = selH();
    if (f === 'hk' && h) setLinkKind(v);
    else if (f === 'dk' && r) setLinkKind(v);
    else if (f === 'op' && r && r.k === 'draw') edit(() => { r.op = v; });
  });

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
    const n = selN();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'ndel') { if (E.sel && E.sel.n != null) deleteNode(E.sel.n); }
    else if (a === 'ldel') deleteLink();
    else if (a === 'rev') reverseLink();
    else if (a.startsWith('k:')) { E.kind = a.slice(2); setLinkKind(a.slice(2)); buildPalette(); }
    else if (a === 'copy') copyCode(b, codeTa.value);
    else if (n) {
      if (a === 'rename') editName(E.sel.n);
      else if (a === 'text') focusField('ntext');
      else if (a === 'attr') focusField('attrs');
      else if (a === 'op') focusField('ops');
      else if (a === 'fitw') fitWidth(n);
    }
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const nc = items().filter((it: any) => it.k === 'class').length, nr = relCount();
    count.textContent = countText(nc, nr);
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, U.layout({ src: c }).warnings);
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
    const n = selN();
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel) { e.preventDefault(); if (!(n && n.k === 'class' && editName(E.sel.n))) focusField(n && n.k === 'note' ? 'ntext' : undefined); return; }
    if (e.key.startsWith('Arrow') && n) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      edit(() => { const [x, y] = posOf(n); n.x = snap(x + dx, false); n.y = snap(y + dy, false); if (n.k === 'class') n.pos = null; });
      return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); pick(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the diagram back to the page (one undo step there) and keep editing
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => t('editor.uml.discard', 'Discard changes to this class diagram?'),
  });
  const { save, finish } = dock;
  let localeOff: (() => void) | undefined;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, kind: 'association', view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, ghost: null, codeAt: null, codeTimer: null };
    E.typed = String(block.src || ''); E.start = snapCode();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, properties and drawing's hints follow the interface language while the editor is open
    localeOff?.();
    localeOff = onLocale(() => { if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  // for the tests: the state, the layout and a box on screen
  TD.umlEditor = { open, dockable: true, close: () => dock.detach(), _state: () => E, _lay: () => lay(), _scr: (b: any) => boxScr(b), _select: (sel: any) => { E.sel = sel; draw(); renderProps(); } };
})();
