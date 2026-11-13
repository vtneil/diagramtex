import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row } from '../ui/forms';
import FormPanel from '../ui/FormPanel.svelte';
import CircuitProperties from '../ui/editors/CircuitProperties.svelte';
import CzeditorFrame from '../ui/editors/CzeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
// Circuit editor: the overlay that opens on a Circuit block. A searchable palette of circuitikz parts,
// a drafting grid where parts are dropped, dragged, rotated and wired (ends snap to pins), the selected
// part's properties, and beside them the circuitikz it writes, live both ways (edits there are read back).
// TD.czEditor.open(block, onDone) — block: { items, raw }; onDone({ items, raw }) on Done.
(function () {
  const CZ = TD.CZ, C = TD.cz;
  const { esc } = TD.util;
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
  const ic = (d: any) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  mountFrame(root, CzeditorFrame, { p0: ic('<path d="M5 3l10 7-5 1-2 5z" class="f"/>'), p1: ic('<path d="M3 15h6V5h8"/><circle cx="3" cy="15" r="1.6" class="f"/><circle cx="17" cy="5" r="1.6" class="f"/>'), p2: ic('<path d="M15.5 8.5A6 6 0 1 0 16 12"/><path d="M16.5 4v4.5H12"/>'), p3: ic('<path d="M10 3v14" stroke-dasharray="2 2"/><path d="M7.5 6L3 14h4.5zM12.5 6l4.5 8h-4.5z"/>'), p4: ic('<path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 7.5L14 3v4.5zM6 12.5l8 4.5v-4.5z"/>'), p5: ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>'), p6: isMac ? '⌘' : 'Ctrl+', p7: ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>'), p8: isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z', p9: ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>'), p10: ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'), p11: isMac ? '⌘' : 'Ctrl+' });
  document.body.appendChild(root);
  const svg = $('.cz-svg', root), stage = $('.cz-stage', root), list = $('.cz-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  let E: any = null; // { items, raw, sel: Set, tool, part, view: {ox, oy, k}, undo, redo, done, start, drag, hover, codeAt, codeTimer }
  const byId = (id: any) => E.items.find((it: any) => it.id === id);
  const sel = () => E.items.filter((it: any) => E.sel.has(it.id));
  const snap = () => JSON.stringify({ items: E.items, raw: E.raw });
  function begin() { if (E.pending == null) E.pending = snap(); }
  function commit() {
    if (E.pending == null) return;
    const now = snap();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  function restore(j: any) { const v = JSON.parse(j); E.items = v.items; E.raw = v.raw; for (const id of [...E.sel]) if (!byId(id)) E.sel.delete(id); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snap()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snap()); restore(E.redo.pop()); }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    const match = (d: any) => !q || q.split(/\s+/).every((w: any) => `${d.name} ${d.tikz} ${d.keywords || ''} ${d.cat}`.toLowerCase().includes(w));
    let html = '';
    const section = (id: any, title: any, keys: any) => {
      const rows = keys.map((k: any) => `<button class="cz-part${E && E.part === k ? ' on' : ''}" data-part="${k}" title="${esc(CZ.parts[k].name)} — ${CZ.parts[k].kind === 'node' ? 'node' : 'to'}[${esc(CZ.parts[k].tikz)}]">${CZ.icon(k, 44, 26)}<span>${esc(CZ.parts[k].name)}</span></button>`).join('');
      html += q ? `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div>${rows}</div>`
        : `<details class="cz-cat" data-cat="${id}"${isOpen(id) ? ' open' : ''}><summary class="cz-cat-t">${esc(title)} <small>${keys.length}</small></summary>${rows}</details>`;
    };
    if (!q) {
      const recent = lsGet(RECENT_KEY, []).filter((k: any) => CZ.parts[k]);
      if (recent.length) section('recent', 'Recently used', recent);
      section('common', 'Common', COMMON.filter((k) => CZ.parts[k]));
    }
    for (const [cat, title] of CZ.CATS) {
      const keys = CZ.order.filter((k: any) => CZ.parts[k].cat === cat && match(CZ.parts[k]));
      if (keys.length) section(cat, title, keys);
    }
    list.innerHTML = html || `<div class="cz-empty">No part matches “${esc(search.value)}”</div>`;
  }
  // opening or closing a section is remembered; nothing else opens one
  list.addEventListener('toggle', (e: any) => {
    const d = e.target, id = d.dataset && d.dataset.cat;
    if (!id || !d.matches('details') || isOpen(id) === d.open) return;
    lsSet(OPEN_KEY, { ...lsGet(OPEN_KEY, {}), [id]: d.open });
  }, true);
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e: any) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.cz-part', list); if (b) arm(b.dataset.part); search.blur(); }
  });
  // click a part to arm it; drag it onto the grid to drop it
  let palDrag: any = null;
  // the keyboard's click (Enter or Space on a focused item) chooses it, as a tap does
  list.addEventListener('click', (e: any) => { if (e.detail !== 0) return; const b = e.target.closest('.cz-part'); if (b) arm(b.dataset.part); });
  list.addEventListener('pointerdown', (e: any) => {
    const b = e.target.closest('.cz-part');
    if (!b || e.button !== 0) return;
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
    E.part = E.part === part && E.tool === 'place' ? null : part;
    E.tool = E.part ? 'place' : 'select';
    updateTools(); buildPalette(); draw();
    setTip(E.part ? `${CZ.parts[part].name}: ${CZ.parts[part].kind === 'node' ? 'click to place' : 'click, or drag from start to end'}. Esc when done.` : '');
  }
  function setTip(t: any) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- view
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e: any) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  function toCm(e: any) { const r = rect(), v = E.view; return [(e.clientX - r.left - v.ox) / v.k, (v.oy - (e.clientY - r.top)) / v.k]; }
  const m = (x: any, y: any) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];
  function fit() {
    const r = rect(), b = C.itemsBox(E.items, { size: 'normalsize', font: 'default', vstyle: C.vstyleOf(E.raw) }) || { x1: -2, y1: -1, x2: 2, y2: 1 };
    const w = Math.max(b.x2 - b.x1, 2), h = Math.max(b.y2 - b.y1, 2);
    const k = Math.max(20, Math.min(110, Math.min((r.width - 80) / w, (r.height - 80) / h)));
    E.view = { k, ox: r.width / 2 - ((b.x1 + b.x2) / 2) * k, oy: r.height / 2 + ((b.y1 + b.y2) / 2) * k };
    draw();
  }
  svg.addEventListener('wheel', (e: any) => {
    e.preventDefault();
    const v = E.view, r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(15, Math.min(240, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
  }, { passive: false });

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
    for (const pin of allPins(skip)) { const d = Math.hypot(pin.p[0] - q[0], pin.p[1] - q[1]); if (d < bd) { bd = d; best = pin; } }
    if (best) return { p: best.p.slice(), pin: best };
    return { p: free ? [r3(q[0]), r3(q[1])] : [snapG(q[0]), snapG(q[1])], pin: null };
  }
  // keep a path horizontal or vertical from a, unless free (Shift) or the end snapped to a pin
  function ortho(a: any, b: any, free: any) {
    if (free) return b;
    return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
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
    return { id: C.uid(), part, p, rot: 0, flip: false, name: pins.length ? freshName(part) : '', text: '', opts: '' };
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
      if (ids.has(it.id) || it.p) continue;
      for (const end of ['a', 'b']) { const pin = pins.find((q) => C.same(q.p, it[end])); if (pin) out.push({ it, end, pin }); }
    }
    return out;
  }
  function follow(att: any) { for (const { it, end, pin } of att) { const p = C.pinsOf(byId(pin.id))[pin.name]; if (p) it[end] = [r3(p[0]), r3(p[1])]; } }
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
      const c = clone(it); c.id = C.uid();
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
      if (it.p) {
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
    let body = C.itemsSvg(E.items, m, k, { colorOf, paper: '#fffdf8', wrap, st: { size: 'normalsize', font: 'default', vstyle: C.vstyleOf(E.raw) } });
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
    // the part being placed, under the pointer
    let ghost = '';
    if (E.tool === 'place' && E.part && E.hover && !E.drag) {
      const def = CZ.parts[E.part];
      const g = def.kind === 'node' ? newNode(E.part, snapPt(E.hover).p) : (() => { const L = defLen(E.part), a = [snapG(E.hover[0] - L / 2), snapG(E.hover[1])]; return newBip(E.part, a, [r3(a[0] + L), a[1]]); })();
      ghost = `<g class="cz-ghost">${C.itemsSvg([g], m, k, { color: 'var(--bluepen)', paper: '#fffdf8' })}</g>`;
    }
    if (E.tool === 'wire' && E.hover && !E.drag) { const q = snapPt(E.hover); const [X, Y] = m(...(q.p as [any, any])); ghost += `<circle class="cz-snap${q.pin ? ' on' : ''}" cx="${X}" cy="${Y}" r="5"/>`; }
    if (E.drag && E.drag.snapAt) { const [X, Y] = m(...(E.drag.snapAt as [any, any])); ghost += `<circle class="cz-snap on" cx="${X}" cy="${Y}" r="6"/>`; }
    let mq = '';
    if (E.drag && E.drag.mode === 'marquee') { const d = E.drag; mq = `<rect class="cz-mq" x="${Math.min(d.sx, d.ex)}" y="${Math.min(d.sy, d.ey)}" width="${Math.abs(d.ex - d.sx)}" height="${Math.abs(d.ey - d.sy)}"/>`; }
    // origin cross
    const [OX, OY] = m(0, 0);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<rect width="${W}" height="${H}" class="cz-bg"/>${grid}<path class="cz-origin" d="M${OX - 6},${OY}h12M${OX},${OY - 6}v12"/>${body}${pins}${hs}${ghost}${mq}`;
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
    if (E.tool === 'place' || E.tool === 'wire') {
      const part = E.tool === 'wire' ? 'short' : E.part, def = CZ.parts[part];
      begin();
      if (E.tool !== 'wire') used(part);
      if (def.kind === 'node') { const it = newNode(part, snapPt(q).p); E.items.push(it); E.sel = new Set([it.id]); E.drag = { mode: 'node', id: it.id }; }
      else { const a = snapPt(q).p, it = newBip(part, a, a.slice()); E.items.push(it); E.sel = new Set([it.id]); E.drag = { mode: 'new', id: it.id, sx, sy, q }; }
      draw(); return;
    }
    const h = e.target.closest('.cz-h');
    if (h) { begin(); E.drag = { mode: 'end', id: sel()[0].id, end: h.dataset.end }; return; }
    const g = e.target.closest('[data-id]');
    if (g) {
      const id = g.dataset.id;
      if (e.shiftKey) { if (E.sel.has(id)) E.sel.delete(id); else E.sel.add(id); draw(); renderProps(); return; }
      if (!E.sel.has(id)) E.sel = new Set([id]);
      begin();
      E.drag = { mode: 'move', q0: q, orig: new Map(sel().map((it: any) => [it.id, clone(it)])), att: attachments(E.sel), moved: false };
      draw(); renderProps(); return;
    }
    E.drag = { mode: 'marquee', sx, sy, ex: sx, ey: sy, add: e.shiftKey, base: new Set(E.sel) };
    if (!e.shiftKey) { E.sel.clear(); renderProps(); }
    draw();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const q = toCm(e), d = E.drag;
    if (!d) { E.hover = q; if (E.tool !== 'select') draw(); return; }
    const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (d.mode === 'pan') { E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return; }
    if (d.mode === 'node') { const it = byId(d.id); it.p = snapPt(q, new Set([d.id])).p; draw(); return; }
    if (d.mode === 'new' || d.mode === 'end') {
      const it = byId(d.id), end = d.mode === 'new' ? 'b' : d.end, other = end === 'a' ? it.b : it.a;
      const s = snapPt(q, new Set([d.id]), e.shiftKey);
      it[end] = s.pin ? s.p : ortho(other, s.p, e.shiftKey);
      d.snapAt = s.pin ? s.p : null;
      draw(); return;
    }
    if (d.mode === 'move') {
      let dx = q[0] - d.q0[0], dy = q[1] - d.q0[1];
      if (!d.moved && Math.hypot(dx, dy) * E.view.k < 3) return;
      d.moved = true;
      // snap the first item's reference point (a node's centre, a part's start) to the grid
      const first = d.orig.values().next().value, ref = first.p || first.a;
      dx = snapG(ref[0] + dx) - ref[0]; dy = snapG(ref[1] + dy) - ref[1];
      for (const [id, o] of d.orig) {
        const it = byId(id);
        if (o.p) it.p = [r3(o.p[0] + dx), r3(o.p[1] + dy)];
        else { it.a = [r3(o.a[0] + dx), r3(o.a[1] + dy)]; it.b = [r3(o.b[0] + dx), r3(o.b[1] + dy)]; }
      }
      follow(d.att); draw(); return;
    }
    if (d.mode === 'marquee') {
      d.ex = sx; d.ey = sy;
      const [x1, y1] = [Math.min(d.sx, d.ex), Math.min(d.sy, d.ey)], [x2, y2] = [Math.max(d.sx, d.ex), Math.max(d.sy, d.ey)];
      const inside = (p: any) => { const [X, Y] = m(...(p as [any, any])); return X >= x1 && X <= x2 && Y >= y1 && Y <= y2; };
      E.sel = new Set(d.add ? d.base : []);
      for (const it of E.items) if (it.p ? inside(it.p) : inside(it.a) && inside(it.b)) E.sel.add(it.id);
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'new') {
      const it = byId(d.id);
      if (C.same(it.a, it.b)) {
        if (C.isWire(it)) { E.items = E.items.filter((x: any) => x !== it); E.sel.clear(); }
        else { const L = defLen(it.part); it.a = [snapG(d.q[0] - L / 2), snapG(d.q[1])]; it.b = [r3(it.a[0] + L), it.a[1]]; } // as its preview showed it
      }
    }
    if (d.mode === 'end') { const it = byId(d.id); if (C.same(it.a, it.b)) it.b = [r3(it.a[0] + defLen(it.part)), it.a[1]]; }
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
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const MI: Record<string, any> = {
    label: '<path d="M4 15l1-4 8-8 3 3-8 8z"/><path d="M11 5l3 3"/>',
    rotate: '<path d="M15.5 8.5A6 6 0 1 0 16 12"/><path d="M16.5 4v4.5H12"/>',
    mirrory: '<path d="M10 3v14" stroke-dasharray="2 2"/><path d="M7.5 6L3 14h4.5zM12.5 6l4.5 8h-4.5z"/>',
    mirrorx: '<path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 7.5L14 3v4.5zM6 12.5l8 4.5v-4.5z"/>',
    dup: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 015.5 3H13"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
  };
  const mItem = (act: any, label: any, icon: any, key: any, off?: any, danger?: any) => `<button class="ctx-item${danger ? ' danger' : ''}" data-cm="${act}"${off ? ' disabled' : ''}><svg viewBox="0 0 20 20">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const g = e.target.closest('[data-id]');
    if (!g) { closeMenu(); return; }
    if (pop) pop.close();
    if (E.tool !== 'select') setTool('select');
    if (!E.sel.has(g.dataset.id)) { E.sel = new Set([g.dataset.id]); draw(); renderProps(); }
    const s = sel(), n = s.length, one = n === 1 ? s[0] : null, mod = isMac ? '⌘' : 'Ctrl+';
    menu.innerHTML = mItem('label', 'Edit Label', 'label', '', !one || C.isWire(one)) + '<hr>' +
      mItem('rotate', 'Rotate 90°', 'rotate', 'R') + mItem('mirrory', 'Mirror Left to Right', 'mirrory', 'X') + mItem('mirrorx', 'Mirror Top to Bottom', 'mirrorx', 'Y') + mItem('dup', 'Duplicate', 'dup', mod + 'D') + '<hr>' +
      mItem('delete', n > 1 ? `Delete ${n} Items` : 'Delete', 'del', '⌫', false, true);
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-cm]');
    if (!b || (b as HTMLButtonElement).disabled || !E) return;
    closeMenu();
    const a = (b as HTMLElement).dataset.cm;
    if (a === 'label') editLabel(sel()[0].id);
    else if (a === 'rotate') rotateSel();
    else if (a === 'mirrorx' || a === 'mirrory') mirrorSel(a.slice(-1));
    else if (a === 'dup') duplicateSel();
    else if (a === 'delete') deleteSel();
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !(e.target! as Element).closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- properties
  const POLES = [['', 'None'], ['*', 'Dot ●'], ['o', 'Open ○']];
  function renderProps() {
    if (!E) return;
    const selected = sel();
    props.hidden = !selected.length;
    if (!selected.length) { renderView(props, FormPanel, { sections: [] }); return; }
    if (selected.length > 1) {
      renderView(props, FormPanel, { sections: [section(`${selected.length} items`, [{ kind: 'help' as const, text: ['Right-click for Rotate, Mirror (X, Y), Duplicate and Delete.'] }], 'sec')] });
      return;
    }
    const it = selected[0], def = CZ.parts[it.part] || { name: it.part, tikz: it.part, pins: {} };
    const field = (f: any, label: any, placeholder = '', mono = false) => ({ ...row(label, { kind: 'input' as const, value: it[f] || '', attrs: { type: 'text', id: 'czf-' + f, 'data-f': f, placeholder, spellcheck: 'false', ...(mono ? { class: 'mono' } : {}) } }), labelFor: 'czf-' + f });
    const rows = [];
    if (it.p) {
      if (Object.keys(def.pins).some(name => name !== 'center')) rows.push(field('name', 'Name', 'Q1', true));
      rows.push(field('text', 'Text'));
      rows.push({ ...row('Rotation', ...[0, 90, 180, 270].map(angle => ({ kind: 'button' as const, text: angle + '°', attrs: { 'data-rot': angle, class: (it.rot || 0) === angle ? 'on' : '' } }))), controlClass: 'ctl seg-ctl' });
      rows.push({ ...row('Mirrored', { kind: 'input' as const, value: '', checked: !!it.flip, attrs: { type: 'checkbox', id: 'czf-flip', 'data-f': 'flip' } }), labelFor: 'czf-flip' });
    } else {
      if (!C.isWire(it)) rows.push(field('l', 'Label', '$R_1$'), field('ann', 'Annotation', '$1\\,\\mathrm{k\\Omega}$'), field('v', 'Voltage', '$v_1$'), field('i', 'Current', '$i_1$'));
      const poles = /^([*o]?)-([*o]?)$/.exec(it.poles || '') || ['', '', ''];
      rows.push(row('Ends', ...[0, 1].map(end => ({ kind: 'select' as const, options: POLES, value: poles[end + 1], attrs: { 'data-pole': end } }))));
      if (Object.keys(def.pins).length) rows.push(field('name', 'Name', 'P1', true));
    }
    rows.push(field('opts', 'Options', it.p ? 'e.g. fill=blue!10' : 'e.g. mirror, color=red', true));
    const pins = Object.keys(def.pins).filter(name => name !== 'center');
    if (pins.length) rows.push({ kind: 'help' as const, text: ['Pins: ', ...pins.flatMap((name, i) => [...(i ? [' '] : []), { code: name }])] });
    renderView(props, CircuitProperties, { name: def.name, command: `${it.p ? 'node' : 'to'}[${def.tikz}]`, rows });
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
    const b = e.target.closest('[data-rot]');
    if (!b) return;
    const it = sel()[0];
    begin(); const att = attachments(new Set([it.id])); it.rot = +b.dataset.rot; follow(att); commit();
    draw(); renderProps();
  });

  // ---------------------------------------------------------------- toolbar, tabs, keys
  function setTool(t: any) { E.tool = t; if (t !== 'place') E.part = null; updateTools(); buildPalette(); draw(); setTip(t === 'wire' ? 'Drag to draw a wire. Shift: any angle. Esc when done.' : ''); }
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
    else if (a === 'copy') { navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); }); }
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
  });
  // ---------------------------------------------------------------- code (live, both ways)
  // The drawing writes the code whenever it changes, except while the code is being typed in; typing
  // is read back after a short pause, and the whole typing spell is one undo step.
  function syncCode() {
    const n = E.items.filter((it: any) => !C.isWire(it)).length;
    count.textContent = `${n} part${n === 1 ? '' : 's'} · ${E.items.length - n} wire${E.items.length - n === 1 ? '' : 's'}`;
    if (document.activeElement === codeTa) return;
    const c = C.code(E.items, E.raw);
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showRaw();
  }
  function showRaw() {
    const n = E.raw ? E.raw.split('\n').filter((l: any) => l.trim()).length : 0;
    codeMsg.textContent = n ? `${n} line${n === 1 ? '' : 's'} can't be drawn here and will be kept as written.` : '';
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
    // a focused palette button keeps its own Enter and Space (they click it) instead of the canvas shortcuts
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('.qe-item, .cz-part, [data-cmd], [data-tool], [data-ex]')) return;
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; } // never the browser's Save Page
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return; // a label popup handles its own keys
    if (document.querySelector('.td-dialog')) return; // a confirm dialog on top handles its own keys
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select'));
    e.stopPropagation(); // the main editor's shortcuts stay off while this is open
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!menu.hidden) { closeMenu(); return; }
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (E.tool !== 'select') { setTool('select'); setTip(''); return; }
      if (E.sel.size) { E.sel.clear(); draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && e.key === 'a') { e.preventDefault(); E.sel = new Set(E.items.map((it: any) => it.id)); draw(); renderProps(); return; }
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
      const att = attachments(E.sel);
      for (const it of sel()) { if (it.p) it.p = [r3(it.p[0] + dx), r3(it.p[1] + dy)]; else { it.a = [r3(it.a[0] + dx), r3(it.a[1] + dy)]; it.b = [r3(it.b[0] + dx), r3(it.b[1] + dy)]; } }
      follow(att); commit(); draw();
    }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // Ctrl+S: write the circuit back to the page (one undo step there) and keep editing; Esc then has nothing to discard
  function save() {
    if (pop) pop.close();
    if (document.activeElement === codeTa) readCode();
    commit();
    const now = snap();
    if (now !== E.start) { E.start = now; E.done({ items: clone(E.items), raw: E.raw }); }
    flashSaved();
  }
  let savedT = 0;
  function flashSaved() { setTip('Saved to the page'); clearTimeout(savedT); savedT = setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500); }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.ts, beforeunload)
  TD.unsaved.push(() => !!E && snap() !== E.start);
  async function finish(ok: any) {
    closeMenu();
    if (!E) return;
    if (pop) pop.close();
    if (document.activeElement === codeTa) readCode();
    commit();
    const changed = snap() !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this circuit?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done, res = { items: E.items, raw: E.raw };
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done(res);
  }
  function open(block: any, done: any) {
    E = { items: clone(block.items || []), raw: block.raw || '', sel: new Set(), tool: 'select', part: null, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], done, pending: null, hover: null, drag: null, codeAt: null, codeTimer: null };
    E.start = snap();
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    requestAnimationFrame(fit);
  }
  TD.czEditor = { open };
})();
