import { wireIntersections } from '../domain/circuit-crossings';
import { connectedWires, onWire, projectOnWire, wireJunctions } from './circuit-wires';
import { captions } from '../i18n/messages';
import { t as uiText, message, onLocale } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import FormPanel from '../ui/FormPanel.svelte';
import CircuitProperties from '../ui/editors/CircuitProperties.svelte';
import CzeditorFrame from '../ui/editors/CzeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette } from './editor-palette.svelte';
import { iconSvg } from '../ui/kit/icons';
import { marquee, marqueeSvg, marqueeTakes, boxPoly, ring } from './marquee';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName, pressesFocused } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { onLabelFontsChange } from '../domain/label-image';
// Circuit editor: the overlay that opens on a Circuit block. A searchable palette of circuitikz parts,
// a drafting grid where parts are dropped, dragged, rotated and wired (ends snap to pins), the selected
// part's properties, and beside them the circuitikz it writes, live both ways (edits there are read back).
// TD.czEditor.open(block, onDone) — block: { items, raw, size, font } (its labels drawn in the block's size and font, as on
// the canvas); onDone({ items, raw }) on Done.
(function () {
  const CZ = TD.CZ, C = TD.cz;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const GRID = 0.25;                 // cm
  const SNAP_PX = 10;                // pin snap radius on screen
  // the palette's top sections: everyday parts, then the ones placed lately (remembered in this browser)
  const COMMON = ['short', 'circ', 'ocirc', 'res:us', 'res:iec', 'cap:iec', 'cap:pol', 'ind:L', 'diode:d', 'diode:led', 'trans:npn', 'trans:pnp',
    'trans:nmos', 'trans:pmos', 'opamp:3', 'src:battery', 'src:vsource-us', 'src:isource-us', 'ground:gnd', 'ground:vcc', 'switch:open',
    'meter:ammeter', 'meter:voltmeter', 'meter:lamp'];
  const RECENT_KEY = 'diagramtex.cz.recent', OPEN_KEY = 'diagramtex.cz.open', RECENT_MAX = 12;
  const lsGet = (k: any, d: any) => { try { return JSON.parse(localStorage.getItem(k) as string) || d; } catch { return d; } };
  const lsSet = (k: any, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
  // which sections are open: only what the person opened (Common and Recent start open)
  const isOpen = (id: any) => { const o = lsGet(OPEN_KEY, {}); return id in o ? !!o[id] : id === 'common' || id === 'recent'; };
  function used(part: any) { lsSet(RECENT_KEY, [part, ...lsGet(RECENT_KEY, []).filter((k: any) => k !== part)].slice(0, RECENT_MAX)); }
  const r3 = (n: any) => Math.round(n * 1000) / 1000;
  const snapG = (v: any) => r3(Math.round(v / GRID) * GRID);
  const clone = (o: any) => JSON.parse(JSON.stringify(o));

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'czModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, CzeditorFrame);
  document.body.appendChild(root);
  const svg = $('.cz-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('ui.search.parts', 'Search parts'), label: message('ui.elements', 'Elements'), layout: 'rows', collapsible: true, isOpen, ontoggle: (id, open) => { if (isOpen(id) !== open) lsSet(OPEN_KEY, { ...lsGet(OPEN_KEY, {}), [id]: open }); }, empty: (query) => uiText('editor.cz.noPartMatches', 'No part matches “{query}”', { query }), onpick: (k) => arm(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  let stopLocale: (() => void) | null = null;
  let E: any = null; // { items, raw, sel: Set, tool, part, view: {ox, oy, k}, undo, redo, done, start, drag, hover, codeAt, codeTimer }
  // a served font read for the label pictures (src/domain/label-image.ts): an open editor draws its labels again in it
  onLabelFontsChange(() => { if (E) draw(); });
  const byId = (id: any) => E.items.find((it: any) => it.id === id);
  const sel = () => E.items.filter((it: any) => E.sel.has(it.id));
  const snap = () => JSON.stringify({ items: E.items, raw: E.raw });
  const history = TD.editorSession.history({ state: () => E, snapshot: () => snap(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed() });
  const { begin, commit } = history;
  function undo() { if (E.wire) endWire(); history.undo(); }
  function redo() { if (E.wire) endWire(); history.redo(); }
  function restore(j: any) { const v = JSON.parse(j); E.items = v.items; E.raw = v.raw; for (const id of [...E.sel]) if (!byId(id)) E.sel.delete(id); draw(); renderProps(); updateTools(); }

  // ---------------------------------------------------------------- palette
  // a part's name in the interface language (src/i18n/th/circuit.ts), else as the part defines it
  const partName = (k: string) => uiText(`czpart.${k}`, CZ.parts[k]?.name ?? k);
  // categories fold (opening or closing one is remembered; nothing else opens one); "Recently used" and "Common" are
  // shown while browsing, not in a search
  function buildPalette() {
    const row = (k: any) => {
      const d = CZ.parts[k], name = partName(k);
      // found by its English name too, whatever the interface language
      return { id: k, label: name, title: k === 'short' ? uiText('editor.cz.wireTip', 'Wire (W)') : d.tikz ? `${name} — ${d.kind === 'node' ? 'node' : 'to'}[${d.tikz}]` : `${name} — \\node at (…) {…}`, keywords: `${d.tikz} ${d.keywords || ''} ${d.cat} ${name === d.name ? '' : d.name}`, svg: d.icon ? iconSvg(d.icon) : CZ.icon(k, 44, 26), on: !!E && (E.part === k || (k === 'short' && E.tool === 'wire')), attrs: { 'data-part': k } };
    };
    const recent = lsGet(RECENT_KEY, []).filter((k: any) => CZ.parts[k]);
    pal.render([
      ...(recent.length ? [{ id: 'recent', title: uiText('editor.cz.recent', 'Recently used'), browse: true, items: recent.map(row) }] : []),
      { id: 'common', title: uiText('editor.cz.common', 'Common'), browse: true, items: COMMON.filter((k) => CZ.parts[k]).map(row) },
      ...CZ.CATS.map(([cat, title]: any) => ({ id: cat, title: uiText(`czcat.${cat}`, title), items: CZ.order.filter((k: any) => CZ.parts[k].cat === cat).map(row) })),
    ]);
  }
  // click a part to arm it; drag it onto the grid to drop it
  let palDrag: any = null;
  // the keyboard's click (Enter or Space on a focused item) chooses it, as a tap does
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.cz-part'); if (b) arm(b.dataset.part); });
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.cz-part');
    if (!b || e.button !== 0) return;
    if (b.dataset.part === 'short') { setTool('wire'); return; }
    palDrag = { part: b.dataset.part, x: e.clientX, y: e.clientY, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e: any) => {
    if (!palDrag) return;
    if (!palDrag.moved && Math.hypot(e.clientX - palDrag.x, e.clientY - palDrag.y) > 4) { palDrag.moved = true; E.part = palDrag.part; E.tool = 'place'; }
    if (palDrag.moved) { E.hover = overStage(e) ? toCm(e) : null; draw(); }
  });
  list.addEventListener('pointerup', (e: any) => {
    if (!palDrag) return;
    const d = palDrag; palDrag = null;
    if (!d.moved) { arm(d.part); return; }
    if (overStage(e)) { begin(); dropPart(d.part, toCm(e)); commit(); }
    E.tool = 'select'; E.part = null; E.hover = null;
    updateTools(); buildPalette(); draw(); renderProps();
  });
  function arm(part: any) {
    if (part === 'short') { setTool('wire'); return; }
    if (E.wire) endWire();
    E.part = E.part === part && E.tool === 'place' ? null : part;
    E.tool = E.part ? 'place' : 'select';
    updateTools(); buildPalette(); draw();
    setTip(E.part ? (CZ.parts[part].kind === 'node' ? uiText('editor.cz.armNodeTip', '{name}: click to place. Esc when done.', { name: partName(part) }) : uiText('editor.cz.armBipoleTip', '{name}: click, or drag from start to end. Esc when done.', { name: partName(part) })) : '');
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- view
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage } = editorStage(svg, stage, { view: () => E?.view, zoom: [15, 240], redraw: () => { draw(); } });
  function toCm(e: any) { const r = rect(), v = E.view; return [(e.clientX - r.left - v.ox) / v.k, (v.oy - (e.clientY - r.top)) / v.k]; }
  const m = (x: any, y: any) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  function fit() {
    if (!E) return;
    const r = rect(), b = C.itemsBox(E.items, { ...E.st, ...C.markStyle(E.raw) }) || { x1: -2, y1: -1, x2: 2, y2: 1 };
    // at least 2 cm each way, about the circuit's centre (its y runs up, the stage's down)
    const w = Math.max(b.x2 - b.x1, 2), h = Math.max(b.y2 - b.y1, 2), cx = (b.x1 + b.x2) / 2, cy = -(b.y1 + b.y2) / 2;
    E.view = fitView(r, { x: cx - w / 2, y: cy - h / 2, w, h }, { min: 20, max: 110 });
    draw();
  }

  // ---------------------------------------------------------------- snapping
  // all pins: [{ id, name, p }]; skip: ids whose pins don't count (the ones being moved)
  function allPins(skip?: any) {
    const out = [];
    for (const it of E.items) { if (skip && skip.has(it.id)) continue; for (const [name, p] of Object.entries<any>(C.pinsOf(it))) out.push({ id: it.id, name, p }); }
    return out;
  }
  function snapPt(q: any, skip?: any, free?: any) {
    const lim = SNAP_PX / E.view.k;
    let best = null, bd = lim;
    if (E.tool === 'place' && ['wires:jump-crossing', 'wires:plain-crossing'].includes(E.part)) {
      for (const p of wireIntersections(E.items)) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < bd) { bd = d; best = { id: '', name: 'crossing', p }; }
      }
      if (best) return { p: best.p.slice(), pin: best };
    }
    for (const pin of allPins(skip)) { const d = Math.hypot(pin.p[0] - q[0], pin.p[1] - q[1]); if (d < bd) { bd = d; best = pin; } }
    // Snap to wire interiors too, so a branch terminates exactly on its run.
    if (!best) for (const it of E.items) {
      if (!C.isWire(it) || skip?.has(it.id)) continue;
      const p = projectOnWire([snapG(q[0]), snapG(q[1])], it), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; best = { id: it.id, name: 'wire', p }; }
    }
    if (best) return { p: best.p.slice(), pin: best };
    return { p: free ? [r3(q[0]), r3(q[1])] : [snapG(q[0]), snapG(q[1])], pin: null };
  }
  // keep a path horizontal or vertical from a, unless free (Shift) or the end snapped to a pin
  function ortho(a: any, b: any, free: any) {
    if (free) return b;
    return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
  }

  // Confirmed segments belong to one undo step; the rubber-band segment is
  // only a preview, so Escape keeps exactly the points already clicked.
  function wireEnd(q: any, free = false) {
    const s = snapPt(q, undefined, free);
    return s.pin ? s.p : ortho(E.wire.p, s.p, free);
  }
  function endWire() {
    E.wire = null; E.wireDown = null;
    commit(); setTool('select'); renderProps();
  }
  function wireClick(q: any, free = false) {
    if (!E.wire) {
      begin(); E.sel.clear(); E.wire = { p: snapPt(q, undefined, free).p };
    } else {
      const b = wireEnd(q, free);
      if (C.same(E.wire.p, b)) { endWire(); return; }
      const it = newBip('short', E.wire.p.slice(), b.slice());
      E.items.push(it); E.sel.add(it.id); E.wire.p = b.slice();
    }
    draw(); renderProps();
  }

  // ---------------------------------------------------------------- items
  // parts with pins of their own (a potentiometer's wiper) get a name, so wires can reach them as (P1.wiper)
  const newBip = (part: any, a: any, b: any) => ({ id: C.uid(), part, a, b, l: '', ann: '', v: '', i: '', poles: '', name: Object.keys(CZ.parts[part].pins).length ? freshName(part) : '', opts: '' });
  const PREFIX: Record<string, any> = { trans: 'Q', opamp: 'U', logic: 'U', ff: 'U', ic: 'U', ind: 'T', switch: 'S', meter: 'M', conn: 'J', power: 'U', dsp: 'U', filter: 'F', gen: 'G' };
  function freshName(part: any) {
    const p = PREFIX[CZ.parts[part].cat] || 'N', used = new Set(E.items.map((it: any) => it.name));
    let n = 1;
    while (used.has(p + n)) n++;
    return p + n;
  }
  function newNode(part: any, p: any) {
    const def = CZ.parts[part], pins = Object.keys(def.pins).filter((n) => n !== 'center');
    return { id: C.uid(), part, p, rot: 0, flip: false, name: pins.length ? freshName(part) : '', text: part === 'text' ? 'Text' : '', opts: '' }; // a Text node is its text: never placed empty
  }
  const defLen = (part: any) => Math.max(2, Math.ceil(((CZ.parts[part].w || 0) + 0.6) * 2) / 2);
  function dropPart(part: any, q: any) {
    const def = CZ.parts[part];
    let it;
    if (def.kind === 'node') it = newNode(part, snapPt(q).p);
    else { const L = defLen(part), a = [snapG(q[0] - L / 2), snapG(q[1])]; it = newBip(part, a, [r3(a[0] + L), a[1]]); }
    E.items.push(it); used(part);
    E.sel = new Set([it.id]);
    return it;
  }
  // wire ends attached to items' pins, so they can follow when the items move / turn
  function attachments(ids: any) {
    const out = [];
    const pins = [];
    for (const id of ids) for (const [name, p] of Object.entries<any>(C.pinsOf(byId(id)))) pins.push({ id, name, p });
    for (const it of E.items) {
      if (ids.has(it.id) || !C.isWire(it)) continue;
      for (const end of ['a', 'b']) { const pin = pins.find((q) => C.same(q.p, it[end])); if (pin) out.push({ it, end, pin }); }
    }
    return out;
  }
  // what rides on a moved wire's middle without touching its ends: a T-branch's end and a junction dot. They move with it,
  // so dragging one segment of a run keeps the run joined (its ends' neighbours follow through attachments).
  function riders(ids: Set<string>) {
    const moved = E.items.filter((it: any) => ids.has(it.id) && C.isWire(it)), out: any[] = [];
    if (!moved.length) return out;
    const on = (p: any) => moved.some((w: any) => onWire(p, w));
    for (const it of E.items) {
      if (ids.has(it.id)) continue;
      if (C.isWire(it)) { for (const end of ['a', 'b']) if (on(it[end]) && !moved.some((w: any) => C.same(w.a, it[end]) || C.same(w.b, it[end]))) out.push({ it, end, o: it[end].slice() }); }
      else if (it.p && ['circ', 'ocirc'].includes(it.part) && on(it.p)) out.push({ it, o: it.p.slice() });
    }
    return out;
  }
  // what a moved selection can snap to (worked out once per drag): `ends` pairs each moved wire end o with a pin p it may
  // land on; `lines` pairs a point o that moves with a fixed point f its wire would run level or plumb to (a neighbour's
  // fixed end, a T-branch's other end, the pin a wire end sits on)
  function moveSnaps(d: any) {
    if (d.snapTo) return d.snapTo;
    const wires = [...d.orig.values()].filter((o: any) => C.isWire(o)), lines: any[] = [], skip = new Set<string>(d.orig.keys());
    for (const { it, end, pin } of d.att) {
      skip.add(it.id);
      const other = end === 'a' ? 'b' : 'a';
      if (!d.att.some((x: any) => x.it === it && x.end === other)) lines.push({ o: pin.p, f: it[other].slice() });
    }
    for (const r of d.riders || []) if (r.end) { skip.add(r.it.id); lines.push({ o: r.o, f: r.it[r.end === 'a' ? 'b' : 'a'].slice() }); }
    for (const c of d.contacts || []) if (C.isWire(byId(c.id))) lines.push({ o: c.p, f: c.p });
    const pins = allPins(skip), ends: any[] = [];
    for (const w of wires) for (const o of [w.a, w.b]) for (const pin of pins) if (!C.same(pin.p, o)) ends.push({ o, p: pin.p });
    return (d.snapTo = { ends, lines });
  }
  function follow(att: any) { for (const { it, end, pin } of att) { const p = C.pinsOf(byId(pin.id))[pin.name]; if (p) it[end] = [r3(p[0]), r3(p[1])]; } }
  // A direct terminal-to-terminal contact needs an explicit wire when separated.
  function terminalContacts(ids: Set<string>) {
    const contacts: any[] = [];
    const fixed = E.items.filter((it: any) => !ids.has(it.id) && !C.isWire(it)).flatMap((it: any) => Object.values<any>(C.pinsOf(it)));
    for (const id of ids) {
      const it = byId(id);
      for (const [name, p] of Object.entries<any>(C.pinsOf(it))) {
        if (!fixed.some((q: any) => C.same(p, q))) continue;
        if (contacts.some(c => c.id === id && C.same(c.p, p))) continue;
        contacts.push({ id, name, p: p.slice() });
      }
    }
    return contacts;
  }
  function contactWires(contacts: any[] = []) {
    const wires: any[] = [];
    for (const c of contacts) {
      const end = C.pinsOf(byId(c.id))[c.name];
      if (!end || C.same(c.p, end)) continue;
      const corner = [end[0], c.p[1]];
      for (const [a, b] of [[c.p, corner], [corner, end]]) {
        if (C.same(a, b) || wires.some(w => C.same(w.a, a) && C.same(w.b, b))) continue;
        wires.push(newBip('short', a.slice(), b.slice()));
      }
    }
    return wires;
  }
  function rotateSel() {
    const s = sel();
    if (!s.length) return;
    begin();
    const att = attachments(E.sel);
    for (const it of s) {
      if (it.p) it.rot = ((it.rot || 0) + 90) % 360;
      else {
        const mx = snapG((it.a[0] + it.b[0]) / 2), my = snapG((it.a[1] + it.b[1]) / 2), R = (q: any) => [r3(mx - (q[1] - my)), r3(my + (q[0] - mx))];
        it.a = R(it.a); it.b = R(it.b);
      }
    }
    follow(att); commit(); draw(); renderProps();
  }
  // Mirror the selection about its centre, about the given axis: 'x' mirrors top to bottom (about the X axis, key Y),
  // 'y' left to right (about the Y axis, key X). A node keeps one flip (xscale=-1, before its rotation), so a
  // mirror toggles it and turns the angle. A two-terminal part's ends are mirrored and then swapped, so its
  // labels (placed to the left of a→b) land where the mirror puts them, and `mirror` is toggled so the
  // drawing itself is reflected: reflect + reverse = flip along the path.
  function mirrorSel(axis: any) {
    const s = sel();
    if (!s.length) return;
    begin();
    const att = attachments(E.sel), pts = s.flatMap((it: any) => (it.p ? [it.p] : [it.a, it.b]));
    const c = axis === 'x' ? snapG((Math.min(...pts.map((q: any) => q[1])) + Math.max(...pts.map((q: any) => q[1]))) / 2) : snapG((Math.min(...pts.map((q: any) => q[0])) + Math.max(...pts.map((q: any) => q[0]))) / 2);
    const M = (q: any) => (axis === 'x' ? [q[0], r3(2 * c - q[1])] : [r3(2 * c - q[0]), q[1]]);
    for (const it of s) {
      if (it.p) {
        it.p = M(it.p); it.flip = !it.flip;
        const r = it.rot || 0;
        it.rot = axis === 'x' ? (540 - r) % 360 : (360 - r) % 360;
      } else {
        if (C.isWire(it)) { it.a = M(it.a); it.b = M(it.b); continue; }
        [it.a, it.b] = [M(it.b), M(it.a)];
        const o = (it.opts || '').split(',').map((t: any) => t.trim()).filter(Boolean), i = o.indexOf('mirror');
        if (i >= 0) o.splice(i, 1); else o.push('mirror');
        it.opts = o.join(', ');
      }
    }
    follow(att); commit(); draw(); renderProps();
  }
  function deleteSel() {
    if (!E.sel.size) return;
    begin(); E.items = E.items.filter((it: any) => !E.sel.has(it.id)); E.sel.clear(); commit(); draw(); renderProps();
  }
  function duplicateSel() {
    const s = sel();
    if (!s.length) return;
    begin();
    const made = s.map((it: any) => {
      const c = clone(it); c.id = C.uid(); delete c.cmt; // the copy is new: the comments stay with the original
      if (c.p) { c.p = [c.p[0] + 1, c.p[1] - 1]; if (c.name) c.name = freshName(c.part); }
      else { c.a = [c.a[0] + 1, c.a[1] - 1]; c.b = [c.b[0] + 1, c.b[1] - 1]; c.name = ''; }
      E.items.push(c); return c.id;
    });
    E.sel = new Set(made); commit(); draw(); renderProps();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), v = E.view, k = v.k;
    const W = r.width, H = r.height;
    // grid: minor every 0.25cm (hidden when too dense), major every 1cm
    let grid = '';
    const step = k * GRID >= 7 ? GRID : 1, xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor((v.oy - H) / k / step), ye = Math.ceil(v.oy / k / step);
    let minor = '', major = '';
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; (maj ? (major += `M${X},0V${H}`) : (minor += `M${X},0V${H}`)); }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy - j * step * k) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; (maj ? (major += `M0,${Y}H${W}`) : (minor += `M0,${Y}H${W}`)); }
    grid = `<path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/>`;
    const colorOf = (it: any, ic: any) => (E.sel.has(it.id) ? 'var(--redpen)' : ic || '#1c1b19');
    const wrap = (it: any, s: any) => {
      let hit;
      if (it.part === 'text') {
        // a Text node is clicked anywhere on its text
        const b = C.itemsBox([it], E.st) || { x1: it.p[0] - 0.15, y1: it.p[1] - 0.15, x2: it.p[0] + 0.15, y2: it.p[1] + 0.15 };
        hit = `<path class="cz-hit" d="M${[[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map((q) => m(...(q as [any, any])).map((n) => n.toFixed(1)).join(',')).join('L')}Z"/>`;
      } else if (it.p) {
        const G = CZ.parts[it.part] && CZ.geom(it.part), T = C.nodeXf(it), b = G ? G.box : { x1: -0.15, y1: -0.15, x2: 0.15, y2: 0.15 };
        hit = `<path class="cz-hit" d="M${[[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map((q) => m(...(T(...q) as [any, any])).map((n) => n.toFixed(1)).join(',')).join('L')}Z"/>`;
      } else {
        hit = `<path class="cz-hit cz-hitline" d="M${m(...(it.a as [any, any])).join(',')}L${m(...(it.b as [any, any])).join(',')}"/>`;
        // a part's body (a resistor's zigzag, a capacitor's plates) is clickable all over, not only on its strokes
        const G = !C.isWire(it) && CZ.parts[it.part] && CZ.geom(it.part);
        if (G) {
          const T = C.bipXf(it), b = G.box, pad = 0.06;
          hit += `<path class="cz-hit" d="M${[[b.x1 - pad, b.y1 - pad], [b.x2 + pad, b.y1 - pad], [b.x2 + pad, b.y2 + pad], [b.x1 - pad, b.y2 + pad]].map((q) => m(...(T(...q) as [any, any])).map((n) => n.toFixed(1)).join(',')).join('L')}Z"/>`;
        }
      }
      return `<g data-id="${it.id}">${s}${hit}</g>`;
    };
    let body = C.itemsSvg(E.items, m, k, { colorOf, paper: '#fffdf8', wrap, st: { ...E.st, ...C.markStyle(E.raw) } });
    // pins: shown while wiring, placing or dragging an end
    let pins = '';
    const showPins = E.tool !== 'select' || (E.drag && (E.drag.mode === 'end' || E.drag.mode === 'new'));
    if (showPins) for (const pin of allPins()) { const [X, Y] = m(...(pin.p as [any, any])); pins += `<circle class="cz-pin" cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="3"/>`; }
    // handles on a selected two-terminal part's ends
    let hs = '';
    if (E.tool === 'select' && E.sel.size === 1) {
      const it = sel()[0];
      if (it && !it.p) for (const end of ['a', 'b']) { const [X, Y] = m(...(it[end] as [any, any])); hs += `<rect class="cz-h" data-end="${end}" x="${(X - 4).toFixed(1)}" y="${(Y - 4).toFixed(1)}" width="8" height="8"/>`; }
    }
    for (const joint of wireJunctions(E.items)) {
      const [x, y] = m(...(joint.p as [any, any]));
      // a hint that the wires meet here, never exported: a hollow blue-pen ring, so it can't pass for a Junction (circ) node's solid dot
      body += `<circle class="cz-junction${E.sel.has(joint.id) ? ' on' : ''}" data-id="${joint.id}" cx="${x}" cy="${y}" r="3.5"/>`;
    }
    if (E.drag?.contacts) body += `<g class="cz-contact-preview">${C.itemsSvg(contactWires(E.drag.contacts), m, k, { color: '#1c1b19', paper: '#fffdf8' })}</g>`;
    // the part being placed, under the pointer
    let ghost = '';
    if (E.tool === 'place' && E.part && E.hover && !E.drag) {
      const def = CZ.parts[E.part];
      const g = def.kind === 'node' ? newNode(E.part, snapPt(E.hover).p) : (() => { const L = defLen(E.part), a = [snapG(E.hover[0] - L / 2), snapG(E.hover[1])]; return newBip(E.part, a, [r3(a[0] + L), a[1]]); })();
      ghost = `<g class="cz-ghost">${C.itemsSvg([g], m, k, { color: 'var(--bluepen)', paper: '#fffdf8', st: E.st })}</g>`;
    }
    if (E.wire && E.hover) {
      const b = wireEnd(E.hover, E.wireFree);
      ghost += `<g class="cz-wire-preview">${C.itemsSvg([newBip('short', E.wire.p, b)], m, k, { color: 'var(--bluepen)', paper: '#fffdf8' })}</g>`;
    }
    if (E.tool === 'wire' && E.hover && !E.drag) { const q = snapPt(E.hover); const [X, Y] = m(...(q.p as [any, any])); ghost += `<circle class="cz-snap${q.pin ? ' on' : ''}" cx="${X}" cy="${Y}" r="5"/>`; }
    if (E.drag && E.drag.snapAt) { const [X, Y] = m(...(E.drag.snapAt as [any, any])); ghost += `<circle class="cz-snap on" cx="${X}" cy="${Y}" r="6"/>`; }
    let mq = '';
    if (E.drag && E.drag.mode === 'marquee') { const d = E.drag; mq = marqueeSvg(d.sx, d.sy, d.ex, d.ey); }
    // origin cross
    const [OX, OY] = m(0, 0);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, `<rect width="${W}" height="${H}" class="cz-bg"/>${grid}<path class="cz-origin" d="M${OX - 6},${OY}h12M${OX},${OY - 6}v12"/>${body}${pins}${hs}${ghost}${mq}`);
    svg.classList.toggle('placing', E.tool !== 'select');
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (dbl && E.tool === 'select' && !e.target.closest('.cz-h')) { const g = e.target.closest('[data-id]'); if (g && editLabel(g.dataset.id)) return; }
    const q = toCm(e), r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    if (E.tool === 'wire') {
      wireClick(q, e.shiftKey);
      if (E.wire) E.wireDown = { x: e.clientX, y: e.clientY };
      return;
    }
    if (E.tool === 'place') {
      const part = E.part, def = CZ.parts[part];
      begin();
      if (E.tool !== 'wire') used(part);
      if (def.kind === 'node') { const it = newNode(part, snapPt(q).p); E.items.push(it); E.sel = new Set([it.id]); E.drag = { mode: 'node', id: it.id }; }
      else { const a = snapPt(q).p, it = newBip(part, a, a.slice()); E.items.push(it); E.sel = new Set([it.id]); E.drag = { mode: 'new', id: it.id, sx, sy, q }; }
      draw(); return;
    }
    const h = e.target.closest('.cz-h');
    if (h) {
      begin();
      const wire = C.isWire(sel()[0]), att = attachments(E.sel);
      // a segment's end handle reshapes that end and its neighbours follow; it is meant to leave a part's pin, so no stub back to it
      E.drag = { mode: 'end', id: sel()[0].id, end: h.dataset.end, att, contacts: wire ? [] : terminalContacts(E.sel), skip: wire ? new Set([sel()[0].id, ...att.map((x: any) => x.it.id)]) : null };
      return;
    }
    const g = e.target.closest('[data-id]');
    if (g) {
      const id = g.dataset.id;
      if (e.shiftKey) { if (E.sel.has(id)) E.sel.delete(id); else E.sel.add(id); draw(); renderProps(); return; }
      // a click takes one wire segment; a double-click takes the whole connected wire (its runs, branches and dots)
      const run = C.isWire(byId(id)) || ['circ', 'ocirc'].includes(byId(id).part);
      if (dbl && run) E.sel = connectedWires(E.items, new Set([id]));
      else if (!E.sel.has(id)) E.sel = new Set([id]);
      begin();
      E.drag = { mode: 'move', q0: q, orig: new Map(sel().map((it: any) => [it.id, clone(it)])), att: attachments(E.sel), riders: riders(E.sel), contacts: terminalContacts(E.sel), moved: false };
      draw(); renderProps(); return;
    }
    E.drag = { mode: 'marquee', sx, sy, ex: sx, ey: sy, add: e.shiftKey, base: new Set(E.sel) };
    if (!e.shiftKey) { E.sel.clear(); renderProps(); }
    draw();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const q = toCm(e), d = E.drag;
    if (!d) { E.wireFree = e.shiftKey; E.hover = q; if (E.tool !== 'select') draw(); return; }
    const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (d.mode === 'pan') { E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return; }
    if (d.mode === 'node') { const it = byId(d.id); it.p = snapPt(q, new Set([d.id])).p; draw(); return; }
    if (d.mode === 'new' || d.mode === 'end') {
      const it = byId(d.id), end = d.mode === 'new' ? 'b' : d.end, other = end === 'a' ? it.b : it.a;
      const s = snapPt(q, d.skip || new Set([d.id]), e.shiftKey);
      it[end] = s.pin ? s.p : ortho(other, s.p, e.shiftKey);
      d.snapAt = s.pin ? s.p : null;
      if (d.att) follow(d.att);
      draw(); return;
    }
    if (d.mode === 'move') {
      let dx = q[0] - d.q0[0], dy = q[1] - d.q0[1];
      if (!d.moved && Math.hypot(dx, dy) * E.view.k < 3) return;
      d.moved = true;
      // snap by a point already on the grid (per axis), so every on-grid point stays on it; a wire's end on an
      // off-grid pin would otherwise carry the whole run off the grid. With none on it, snap the first item's point.
      const first = d.orig.values().next().value, ref = first.p || first.a;
      const pts = [...d.orig.values()].flatMap((o: any) => o.p ? [o.p] : [o.a, o.b]);
      const onG = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-6;
      const rx = (pts.find((p: any) => onG(p[0])) || ref)[0], ry = (pts.find((p: any) => onG(p[1])) || ref)[1];
      const raw = [dx, dy], lim = SNAP_PX / E.view.k;
      dx = snapG(rx + dx) - rx; dy = snapG(ry + dy) - ry;
      // pins and straight wires win over the grid near the pointer: a moved wire's end lands on a pin, and each wire that
      // stretches to stay joined (or ends on a pin) snaps level or plumb with its fixed end, so off-grid pins still get straight wires
      const snapTo = moveSnaps(d), gap = (t: any) => Math.hypot(t.p[0] - t.o[0] - raw[0], t.p[1] - t.o[1] - raw[1]);
      const hit = snapTo.ends.reduce((m: any, t: any) => gap(t) < (m ? gap(m) : lim) ? t : m, null);
      d.snapAt = null;
      if (hit) { dx = hit.p[0] - hit.o[0]; dy = hit.p[1] - hit.o[1]; d.snapAt = hit.p; }
      else for (const ax of [0, 1]) {
        let best = lim, pick = null;
        for (const t of snapTo.lines) { const v = t.f[ax] - t.o[ax], e = Math.abs(v - raw[ax]); if (e < best) { best = e; pick = v; } }
        if (pick !== null) { if (ax) dy = pick; else dx = pick; }
      }
      for (const [id, o] of d.orig) {
        const it = byId(id);
        if (o.p) it.p = [r3(o.p[0] + dx), r3(o.p[1] + dy)];
        else { it.a = [r3(o.a[0] + dx), r3(o.a[1] + dy)]; it.b = [r3(o.b[0] + dx), r3(o.b[1] + dy)]; }
      }
      for (const r of d.riders) { const v = r.o; if (r.end) r.it[r.end] = [r3(v[0] + dx), r3(v[1] + dy)]; else r.it.p = [r3(v[0] + dx), r3(v[1] + dy)]; }
      follow(d.att); draw(); return;
    }
    if (d.mode === 'marquee') {
      d.ex = sx; d.ey = sy;
      // as on the main canvas: left to right takes what is wholly inside, right to left anything it touches
      const M = marquee(d.sx, d.sy, d.ex, d.ey);
      E.sel = new Set(d.add ? d.base : []);
      for (const it of E.items) if (marqueeTakes(M, drawnAs(it))) E.sel.add(it.id);
      draw(); return;
    }
  });
  // what an item is drawn as, on screen, for the marquee: a wire its line; a part its body's box (and its leads);
  // a Text node its text's box
  function drawnAs(it: any) {
    const M = (q: any) => m(q[0], q[1]);
    if (it.part === 'text') { const b = C.itemsBox([it], E.st); if (b) { const p = boxPoly(b.x1, b.y1, b.x2, b.y2).map(M); return { pts: p, areas: [p] }; } }
    const G = CZ.parts[it.part] && !C.isWire(it) && CZ.geom(it.part);
    if (it.p) {
      const T = C.nodeXf(it), b = G ? G.box : { x1: -0.15, y1: -0.15, x2: 0.15, y2: 0.15 }, p = boxPoly(b.x1, b.y1, b.x2, b.y2).map((q: any) => M(T(q[0], q[1])));
      return { pts: p, areas: [p] };
    }
    const a = M(it.a), z = M(it.b);
    if (!G) return { pts: [a, z], segs: [[a, z]] as any };
    const T = C.bipXf(it), b = G.box, body = boxPoly(b.x1, b.y1, b.x2, b.y2).map((q: any) => M(T(q[0], q[1])));
    return { pts: [a, z, ...body], segs: [[a, z], ...ring(body)] as any, areas: [body] };
  }
  svg.addEventListener('pointerup', (e: any) => {
    if (!E) return;
    if (E.wireDown) {
      const d = E.wireDown; E.wireDown = null;
      if (E.wire && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) { wireClick(toCm(e), e.shiftKey); if (E.wire) endWire(); }
      return;
    }
    if (!E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'new') {
      const it = byId(d.id);
      if (C.same(it.a, it.b)) {
        if (C.isWire(it)) { E.items = E.items.filter((x: any) => x !== it); E.sel.clear(); }
        else { const L = defLen(it.part); it.a = [snapG(d.q[0] - L / 2), snapG(d.q[1])]; it.b = [r3(it.a[0] + L), it.a[1]]; } // as its preview showed it
      }
    }
    if (d.mode === 'end') { const it = byId(d.id); if (C.same(it.a, it.b)) it.b = [r3(it.a[0] + defLen(it.part)), it.a[1]]; }
    if (d.contacts) E.items.push(...contactWires(d.contacts));
    commit(); draw(); renderProps();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag) { E.hover = null; draw(); } });
  // ---------------------------------------------------------------- label editor
  // Double-click a part: its label (a node's text) in a floating box under it (TD.input.popup), LaTeX or
  // MathLive as the Text input setting says. Enter, Esc or clicking away finishes; one undo step.
  let lastDown = { t: 0, x: 0, y: 0 }, pop: any = null;
  function editLabel(id: any) {
    const it = byId(id);
    if (!it || !TD.input || C.isWire(it)) return false;
    const f = it.p ? 'text' : 'l';
    if (pop) pop.close();
    E.sel = new Set([id]); draw(); renderProps();
    begin();
    const me = (pop = TD.input.popup(stage, {
      text: it[f] || '',
      at: () => labelAt(it),
      onInput: (v: any) => { it[f] = v; draw(); renderProps(); },
      onDone: () => { if (pop === me) pop = null; commit(); draw(); renderProps(); },
    }));
    return true;
  }
  // under the item's drawing, in stage pixels
  function labelAt(it: any) {
    const g = svg.querySelector(`[data-id="${it.id}"]`), sr = stage.getBoundingClientRect();
    if (g) { const b = g.getBoundingClientRect(); return [b.left + b.width / 2 - sr.left, b.bottom - sr.top + 8]; }
    const [X, Y] = m(...((it.p || it.a) as [any, any])), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + X, vr.top - sr.top + Y + 24];
  }
  svg.addEventListener('wheel', () => pop && pop.place(), { passive: true }); // panning or zooming carries it along

  // ---------------------------------------------------------------- right-click menu
  // The same .ctx menu as the quantum and tree editors: it acts on the selection when the click is inside it,
  // otherwise selects the item under the pointer first.
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', rotate: 'rotate', mirrory: 'mirrorH', mirrorx: 'mirrorV', dup: 'duplicate', del: 'delete' };
  const mItem = (act: string, label: string, icon: string, key: string, off?: boolean, danger?: boolean) => menuRow(act, label, MI[icon], key, { disabled: !!off, danger: !!danger });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const g = e.target.closest('[data-id]');
    if (!g) { closeMenu(); return; }
    if (pop) pop.close();
    if (E.tool !== 'select') setTool('select');
    if (!E.sel.has(g.dataset.id)) { E.sel = new Set([g.dataset.id]); draw(); renderProps(); }
    const s = sel(), n = s.length, one = n === 1 ? s[0] : null, mod = isMac ? '⌘' : 'Ctrl+';
    menuRows = [mItem('label', uiText('editor.cz.editLabel', 'Edit Label'), 'label', '', !one || C.isWire(one)), '-', mItem('rotate', uiText('editor.cz.rotate90', 'Rotate 90°'), 'rotate', 'R'), mItem('mirrory', uiText('editor.cz.mirrorLR', 'Mirror Left to Right'), 'mirrory', 'X'), mItem('mirrorx', uiText('editor.cz.mirrorTB', 'Mirror Top to Bottom'), 'mirrorx', 'Y'), mItem('dup', uiText('editor.cz.duplicate', 'Duplicate'), 'dup', mod + 'D'), '-', mItem('delete', n > 1 ? uiText('editor.cz.deleteItems', 'Delete {n} Items', { n }) : uiText('editor.cz.delete', 'Delete'), 'del', '⌫', false, true)];
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    if (!E) return;
    if (a === 'label') editLabel(sel()[0].id);
    else if (a === 'rotate') rotateSel();
    else if (a === 'mirrorx' || a === 'mirrory') mirrorSel(a.slice(-1));
    else if (a === 'dup') duplicateSel();
    else if (a === 'delete') deleteSel();
  }

  // ---------------------------------------------------------------- properties
  const POLES = () => [['', uiText('editor.cz.poleNone', 'None')], ['*', uiText('editor.cz.poleDot', 'Dot ●')], ['o', uiText('editor.cz.poleOpen', 'Open ○')]];
  function renderProps() {
    if (!E) return;
    const selected = sel();
    props.hidden = !selected.length;
    if (!selected.length) { renderView(props, FormPanel, { sections: [] }); return; }
    if (selected.length > 1) {
      renderView(props, FormPanel, { sections: [section(uiText('editor.cz.nItems', '{n} items', { n: selected.length }), [{ kind: 'help' as const, text: [uiText('editor.cz.multiHelp', 'Right-click for Rotate, Mirror (X, Y), Duplicate and Delete.')] }], 'sec')] });
      return;
    }
    const it = selected[0], def = CZ.parts[it.part] || { name: it.part, tikz: it.part, pins: {} };
    const field = (f: any, label: any, placeholder = '', mono = false) => ({ ...row(label, { kind: 'input' as const, value: it[f] || '', attrs: { type: 'text', id: 'czf-' + f, 'data-f': f, placeholder: placeholder || (mono ? '' : uiText('editor.cz.textPlaceholder', 'Text, $math$')), spellcheck: 'false', ...(mono ? { class: 'mono' } : { 'data-tx': 'text' }) } }), labelFor: 'czf-' + f });
    const rows = [];
    if (it.p) {
      if (Object.keys(def.pins).some(name => name !== 'center')) rows.push(field('name', uiText('editor.cz.name', 'Name'), 'Q1', true));
      rows.push(field('text', uiText('editor.cz.text', 'Text')));
      rows.push(switchRow(captions["ui.rotation"], [0, 90, 180, 270].map(angle => ({ text: angle + '°', on: (it.rot || 0) === angle, attrs: { 'data-rot': angle } }))));
      rows.push({ ...row(uiText('editor.cz.mirrored', 'Mirrored'), { kind: 'input' as const, value: '', checked: !!it.flip, attrs: { type: 'checkbox', id: 'czf-flip', 'data-f': 'flip' } }), labelFor: 'czf-flip' });
    } else {
      if (!C.isWire(it)) rows.push(field('l', uiText('editor.cz.label', 'Label'), '$R_1$'), field('ann', uiText('editor.cz.annotation', 'Annotation'), '$1\\,\\mathrm{k\\Omega}$'),
        field('v', uiText('editor.cz.voltage', 'Voltage'), '$v_1$'), markRow(it, 'v'), field('i', uiText('editor.cz.current', 'Current'), '$i_1$'), markRow(it, 'i'));
      const poles = /^([*o]?)-([*o]?)$/.exec(it.poles || '') || ['', '', ''];
      rows.push(row(uiText('editor.cz.ends', 'Ends'), ...[0, 1].map(end => ({ kind: 'select' as const, options: POLES(), value: poles[end + 1], attrs: { 'data-pole': end } }))));
      if (Object.keys(def.pins).length) rows.push(field('name', uiText('editor.cz.name', 'Name'), 'P1', true));
    }
    rows.push(field('opts', uiText('editor.commonB.options', 'Options'), it.p ? uiText('editor.cz.optsPlaceholder', 'e.g. {code}', { code: 'fill=blue!10' }) : uiText('editor.cz.optsPlaceholder', 'e.g. {code}', { code: 'mirror, color=red' }), true));
    const pins = Object.keys(def.pins).filter(name => name !== 'center');
    if (pins.length) rows.push({ kind: 'help' as const, text: [uiText('editor.cz.pins', 'Pins: '), ...pins.flatMap((name, i) => [...(i ? [' '] : []), { code: name }])] });
    renderView(props, CircuitProperties, { name: partName(it.part), command: `${it.p ? 'node' : 'to'}[${def.tikz}]`, rows });
  }
  // where a voltage's arrow or a current's arrow goes: its side of the part and the way it points. The icons
  // turn with the part, so they match the canvas. Each choice is written as circuitikz's `v^<=` style mods.
  const MARKS: [number, boolean][] = [[1, false], [1, true], [-1, false], [-1, true]];
  function markIcon(kind: 'v' | 'i', it: any, s: number, back: boolean) {
    const deg = -Math.atan2(it.b[1] - it.a[1], it.b[0] - it.a[0]) * 180 / Math.PI, y = (d: number) => 12 - s * d;
    const head = (x: number, yy: number, dx: number, dy: number) => { const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l; return `M${x - 3.5 * ux - 2.5 * uy},${yy - 3.5 * uy + 2.5 * ux}L${x},${yy}L${x - 3.5 * ux + 2.5 * uy},${yy - 3.5 * uy - 2.5 * ux}`; };
    let mark;
    if (kind === 'v') {
      const [x0, x1] = back ? [19, 5] : [5, 19];
      mark = `<path d="M${x0},${y(4)}Q12,${y(13)} ${x1},${y(4)}"/><path d="${head(x1, y(4), x1 - 12, y(4) - y(13))}"/>`;
    } else {
      const x = back ? 4 : 20, d = back ? -1 : 1;
      mark = `<path d="${head(x, 12, d, 0)}"/><circle cx="${x - d * 2}" cy="${y(5)}" r="1.2" fill="currentColor" stroke="none"/>`;
    }
    return `<svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke-width:1.25"><g transform="rotate(${Math.round(deg)} 12 12)"><path d="M1.5 12h7M15.5 12h7"/><rect x="8.5" y="10.5" width="7" height="3"/>${mark}</g></svg>`;
  }
  function markRow(it: any, kind: 'v' | 'i') {
    const now = C.markOf(kind, it);
    return switchRow(kind === 'v' ? uiText('editor.cz.voltageArrow', 'Voltage arrow') : uiText('editor.cz.currentArrow', 'Current arrow'),
      MARKS.map(([s, back]) => ({ svg: markIcon(kind, it, s, back), title: `${kind}${C.markMods(kind, s, back)}=`, name: (kind === 'v' ? 'Voltage' : 'Current') + ' arrow ' + C.markMods(kind, s, back),
        on: now.s === s && now.back === back, disabled: !it[kind], attrs: { 'data-mark': `${kind}:${C.markMods(kind, s, back)}` } })));
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) commit(); });
  props.addEventListener('input', (e: any) => {
    const it = sel()[0], t = e.target;
    if (!it) return;
    begin();
    if (t.dataset.f === 'flip') { const att = attachments(new Set([it.id])); it.flip = t.checked; follow(att); }
    else if (t.dataset.f === 'name') it.name = t.value.replace(/[^\w-]/g, '');
    else if (t.dataset.f) it[t.dataset.f] = t.value;
    else if (t.dataset.pole != null) { const v = [...props.querySelectorAll('[data-pole]')].map((x) => x.value); it.poles = v[0] || v[1] ? `${v[0]}-${v[1]}` : ''; }
    draw();
    if (t.type === 'checkbox' || t.tagName === 'SELECT') commit();
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('click', (e: any) => {
    const mk = e.target.closest('[data-mark]');
    if (mk) {
      const it = sel()[0], [kind, mods] = mk.dataset.mark.split(':');
      begin(); it[kind + 'm'] = mods; commit(); draw(); renderProps(); return;
    }
    const b = e.target.closest('[data-rot]');
    if (!b) return;
    const it = sel()[0];
    begin(); const att = attachments(new Set([it.id])); it.rot = +b.dataset.rot; follow(att); commit();
    draw(); renderProps();
  });

  // ---------------------------------------------------------------- toolbar, tabs, keys
  function setTool(t: any) { if (E.wire) { E.wire = null; E.wireDown = null; commit(); } E.tool = t; if (t !== 'place') E.part = null; updateTools(); buildPalette(); draw(); setTip(t === 'wire' ? uiText('editor.cz.wireClickTip', 'Click to start a wire, then click each corner. Click the last point again or press Esc to finish. Shift: any angle.') : ''); }
  function updateTools() {
    if (!E) return;
    root.querySelectorAll('[data-cz="select"],[data-cz="wire"]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.cz === E.tool));
    const u = $('[data-cz="undo"]', root), r = $('[data-cz="redo"]', root);
    u.disabled = !E.undo.length; r.disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-cz]');
    if (!b || !E) return;
    const a = (b as HTMLElement).dataset.cz;
    if (a === 'select' || a === 'wire') setTool(a);
    else if (a === 'rotate') rotateSel();
    else if (a === 'mirrorx' || a === 'mirrory') mirrorSel(a.slice(-1));
    else if (a === 'delete') deleteSel();
    else if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'copy') { navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = uiText('ui.copied', 'Copied'); setTimeout(() => (b.textContent = uiText('ui.copy', 'Copy')), 1200); }); }
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
  });
  // ---------------------------------------------------------------- code (live, both ways)
  // The drawing writes the code whenever it changes, except while the code is being typed in; typing
  // is read back after a short pause, and the whole typing spell is one undo step.
  function syncCode() {
    const n = E.items.filter((it: any) => !C.isWire(it)).length;
    const w = E.items.length - n;
    count.textContent = `${n === 1 ? uiText('editor.cz.onePart', '1 part') : uiText('editor.cz.nParts', '{n} parts', { n })} · ${w === 1 ? uiText('editor.cz.oneWire', '1 wire') : uiText('editor.cz.nWires', '{n} wires', { n: w })}`;
    if (document.activeElement === codeTa) return;
    const c = C.code(E.items, E.raw);
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showRaw();
  }
  function showRaw() {
    const n = E.raw ? E.raw.split('\n').filter((l: any) => l.trim() && !/^\s*%/.test(l)).length : 0; // comment lines are not drawn either, but need no note
    showCodeNotes(codeMsg, n ? [n === 1 ? uiText('editor.cz.rawOne', "1 line can't be drawn here and will be kept as written.") : uiText('editor.cz.rawMany', "{n} lines can't be drawn here and will be kept as written.", { n })] : []);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    const res = C.parse(codeTa.value);
    begin();
    E.items = res.items; E.raw = res.raw; E.codeAt = codeTa.value;
    for (const id of [...E.sel]) if (!byId(id)) E.sel.delete(id);
    draw(); renderProps(); showRaw();
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (inEditorMenu(e)) return; // the right-click menu's own keys: arrows, Enter, Esc
    // a focused palette button keeps its own Enter and Space (they click it); ⌘Enter still reaches Done
    if (pressesFocused(e)) return;
    if (!E || root.hidden || dock.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; } // never the browser's Save Page
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return; // a label popup handles its own keys
    if (document.querySelector('.td-dialog')) return; // a confirm dialog on top handles its own keys
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select'));
    e.stopPropagation(); // the main editor's shortcuts stay off while this is open
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editorMenuOpen()) { closeMenu(); return; }
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (E.tool !== 'select') { setTool('select'); setTip(''); return; }
      if (E.sel.size) { E.sel.clear(); draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); E.sel = new Set(E.items.map((it: any) => it.id)); draw(); renderProps(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    else if (k === 'w') setTool('wire');
    else if (k === 'r') rotateSel();
    else if (k === 'x' || k === 'f') mirrorSel('y'); // X: left to right (F: the old Mirror key)
    else if (k === 'y') mirrorSel('x'); // Y: top to bottom
    else if (k === '0') fit();
    else if (k === '/') { e.preventDefault(); search.focus(); }
    else if (k === ' ') { e.preventDefault(); E.space = true; }
    else if (e.key.startsWith('Arrow') && E.sel.size) {
      e.preventDefault();
      const st = e.shiftKey ? 1 : GRID, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? st : e.key === 'ArrowDown' ? -st : 0;
      begin();
      // as a drag does: wires on its pins follow, and a terminal touching another part's gets a wire to it
      const att = attachments(E.sel), ride = riders(E.sel), contacts = terminalContacts(E.sel);
      for (const it of sel()) { if (it.p) it.p = [r3(it.p[0] + dx), r3(it.p[1] + dy)]; else { it.a = [r3(it.a[0] + dx), r3(it.a[1] + dy)]; it.b = [r3(it.b[0] + dx), r3(it.b[1] + dy)]; } }
      for (const r of ride) { if (r.end) r.it[r.end] = [r3(r.o[0] + dx), r3(r.o[1] + dy)]; else r.it.p = [r3(r.o[0] + dx), r3(r.o[1] + dy)]; }
      follow(att); E.items.push(...contactWires(contacts)); commit(); draw();
    }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // Ctrl+S: write the circuit back to the page (one undo step there) and keep editing; Esc then has nothing to discard
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot: () => snap(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeMenu(); if (pop) pop.close(); }, discardTitle: () => uiText('editor.cz.discardCircuit', 'Discard changes to this circuit?'),
    result: () => ({ items: clone(E.items), raw: E.raw }),
  });
  const { save, finish } = dock;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    E = { items: clone(block.items || []), raw: block.raw || '', st: { size: block.size || 'normalsize', font: block.font || 'default' }, sel: new Set(), tool: 'select', part: null, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], done, pending: null, hover: null, drag: null, codeAt: null, codeTimer: null };
    E.start = snap();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, panel and counts follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.czEditor = { open, dockable: true, close: () => dock.detach() };
})();
