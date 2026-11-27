import { message, onLocale, t } from '../i18n';
import type { FormRow } from '../ui/forms';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import { field, segments, codeRow, note, actionRow } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import KmeditorFrame from '../ui/editors/KmeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// Karnaugh map editor: the overlay that opens on a Karnaugh map block. A palette of map sizes and cell
// values; the map drawn by the canvas renderer, where a click turns a cell through 0, 1 and don't care and
// a drag across cells draws a group (past an edge, it wraps round); the selected group's or the map's
// properties, with each group checked against the cells; and beside them the karnaugh-map code, live both
// ways. Untouched code is handed back as written.
// TD.kmapEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const F = TD.kmap;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const INK = '#1c1b19';
  const PX = TD.PX_PER_CM;

  // ---------------------------------------------------------------- palette
  // a size's tile shows its grids; its title says how many variables
  const SIZE_NAMES: Record<string, any> = { '2,2,1': '2 × 2', '4,2,1': '4 × 2', '2,4,1': '2 × 4', '4,4,1': '4 × 4', '4,4,2': '4 × 4 × 2', '4,4,4': '4 × 4 × 4' };
  const sizeTip = (k: string): string => ({
    '2,2,1': () => t('editor.km.size.2', '2 variables'), '4,2,1': () => t('editor.km.size.3cols', '3 variables, 4 columns'), '2,4,1': () => t('editor.km.size.3rows', '3 variables, 4 rows'),
    '4,4,1': () => t('editor.km.size.4', '4 variables'), '4,4,2': () => t('editor.km.size.5', '5 variables: two 4 × 4 maps'), '4,4,4': () => t('editor.km.size.6', '6 variables: four 4 × 4 maps'),
  } as Record<string, () => string>)[k]?.() ?? '';
  // a size: its sub maps as grids of cells, side by side and below as the package lays them out
  function mapMini(x: any, y: any, z: any) {
    const c = 7, gap = 5, W = (z > 1 ? 2 : 1) * x * c + (z > 1 ? gap : 0), H = (z > 2 ? 2 : 1) * y * c + (z > 2 ? gap : 0);
    let d = '';
    for (let m = 0; m < z; m++) {
      const ox = 1 + (m % 2) * (x * c + gap), oy = 1 + (m >> 1) * (y * c + gap);
      for (let i = 0; i <= x; i++) d += `M${ox + i * c},${oy}v${y * c}`;
      for (let j = 0; j <= y; j++) d += `M${ox},${oy + j * c}h${x * c}`;
    }
    return `<svg class="zxmini km-mmini" viewBox="0 0 ${W + 2} ${H + 2}" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  const cellMini = (v: any) => `<svg class="zxmini km-vmini" viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="3" width="24" height="24" rx="2"/>${v ? `<text x="15" y="16">${esc(v)}</text>` : ''}</svg>`;
  const groupMini = `<svg class="zxmini km-vmini" viewBox="0 0 46 30" aria-hidden="true"><path d="M3 3h40v24H3zM23 3v24M3 15h40" class="g"/><rect x="6" y="6" width="34" height="6" rx="2" class="grp"/></svg>`;
  const PAL = [
    ['Map', F.SIZES.map((s: any) => [`m:${s.join(',')}`, SIZE_NAMES[s.join(',')], mapMini(...(s as [any, any, any]))])],
    ['Cells', [['v:1', 'One', cellMini('1'), '1'], ['v:0', 'Zero', cellMini('0'), '0'], ['v:-', 'Don’t care', cellMini('–'), 'D'], ['v:', 'Empty', cellMini(''), 'E'], ['g:', 'Group', groupMini, 'G']]],
  ];
  // the palette's names as shown (PAL keeps the English for search)
  const palTitle = (title: string) => (title === 'Map' ? t('editor.km.pal.map', 'Map') : t('editor.km.pal.cells', 'Cells'));
  const itemName = (k: string, name: string): string => ({
    'v:1': () => t('editor.km.v.one', 'One'), 'v:0': () => t('editor.km.v.zero', 'Zero'), 'v:-': () => t('editor.km.v.dontCare', 'Don’t care'),
    'v:': () => t('editor.km.v.empty', 'Empty'), 'g:': () => t('editor.km.group', 'Group'),
  } as Record<string, () => string>)[k]?.() ?? name;
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }
  KEYS['-'] = 'v:-';

  // ---------------------------------------------------------------- model
  // M = TD.kmap.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? F.write(M) : M.raw);
  const mathOf = (t: any) => { t = String(t || '').trim(); const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t: any) => { const v = mathOf(t).trim(); return v ? `$${v}$` : ''; };
  const NEXT = { '0': '1', '1': '-', '-': '0' }, PREV = { '0': '-', '1': '0', '-': '1' };
  const vName = (v: string) => (v === '-' ? t('editor.km.vname.dontCare', 'don’t care') : v === '' ? t('editor.km.vname.empty', 'empty') : v);
  const setOpt = (M: any, key: any, val: any) => {
    const l = M.opts ? M.opts.split(/,(?![^{]*\})/).map((x: any) => x.trim()).filter(Boolean) : [];
    const rest = l.filter((x: any) => !new RegExp(`^${key}\\s*(=|$)`).test(x));
    if (val != null) rest.push(`${key}=${val}`);
    M.opts = rest.join(', ');
  };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'kmModal';
  root.className = 'modal';
  root.hidden = true;
  const TRASH = '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>';
  mountFrame(root, KmeditorFrame);
  document.body.appendChild(root);
  const svg = $('.km-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.commonA.elements', 'Elements'), listClass: 'km-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { g: index } | null, arm: 'v:1' … | 'g:' | null, mode: 'sop' | 'pos', view: { k (px per cm), ox, oy },
  //   undo, redo, pending, start, done, drag, hover: cell | null, codeAt, codeTimer }
  let E: any = null;
  const snapCode = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: snapCode, restore, updateTools, changed: () => session.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.typed = code; E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() { if (E.sel && !E.M.groups[E.sel.g]) E.sel = null; }
  const selG = () => (E.sel ? E.M.groups[E.sel.g] || null : null);
  const lay = () => F.layout({ src: snapCode() });

  // ---------------------------------------------------------------- editing
  function setCell(n: any, v: any) { E.M.cells[n] = v === '' ? null : v; }
  const valOf = (n: any) => { const v = E.M.cells[n]; return v == null ? '' : v; };
  function cycle(n: any, back: any) { edit(() => { const v = valOf(n); setCell(n, ((back ? PREV : NEXT) as Record<string, any>)[v] || (back ? '-' : '1')); }); }
  function addGroup(g: any) { edit(() => E.M.groups.push(g)); E.sel = { g: E.M.groups.length - 1 }; draw(); renderProps(); }
  function deleteGroup(i: any) { edit(() => E.M.groups.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  // a new size keeps the cells that still exist and the groups that still fit
  function resize(x: any, y: any, z: any) {
    const M = E.M;
    if (M.X === x && M.Y === y && M.Z === z) return;
    edit(() => {
      const old = { X: M.X, Y: M.Y, Z: M.Z }, cells = M.cells, groups = M.groups;
      const keep = [], to = { X: x, Y: y, Z: z };
      for (const g of groups) {
        const R = F.rectOf(old, g), maps = g.maps.filter((m: any) => m < z);
        if (!maps.length || (y < old.Y && R.r + R.h > y) || (x < old.X && R.c + R.w > x)) continue;
        const n = F.groupFor(to, { ...R, h: Math.min(R.h, y), w: Math.min(R.w, x) }, maps);
        if (n) keep.push(n);
      }
      // cells by their place (map, row, column) on both maps
      const next = new Array(x * y * z).fill(null);
      for (let m = 0; m < Math.min(z, old.Z); m++) for (let r = 0; r < Math.min(y, old.Y); r++) for (let c = 0; c < Math.min(x, old.X); c++) {
        next[F.cellAt({ X: x, Y: y }, m, r, c)] = cells[F.cellAt(old, m, r, c)];
      }
      M.X = x; M.Y = y; M.Z = z; M.cells = next; M.groups = keep;
      // the old API's two or three labels don't fit a size with another count
      if (F.labelsOf({ ...M, labels: M.labels }).old !== F.labelsOf({ ...old, labels: M.labels }).old) M.labels = [];
    });
    E.sel = null; buildPalette(); fit();
  }
  function solve() {
    const g = F.solve(E.M, E.mode);
    edit(() => { E.M.groups = g; });
    E.sel = null; renderProps();
    const how = E.mode === 'pos' ? t('editor.km.solve.sums', 'the 0s as sums') : t('editor.km.solve.products', 'the 1s as products');
    const msg = g.length ? (g.length === 1 ? t('editor.km.solve.one', '1 group: {how}', { how }) : t('editor.km.solve.many', '{n} groups: {how}', { n: g.length, how })) : t('editor.km.solve.none', 'No {value}s to group', { value: E.mode === 'pos' ? '0' : '1' });
    stageNote.flash(msg, 1800);
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    const cur = E ? `m:${E.M.X},${E.M.Y},${E.M.Z}` : '';
    pal.render(PAL.map(([title, items]: any) => ({
      id: title, title: palTitle(title),
      // the shown name, the English one, the category's and a size's description find it
      items: items.map(([k, name0, , key]: any) => {
        const name = itemName(k, name0);
        return { id: k, label: name, title: k[0] === 'm' ? `${sizeTip(k.slice(2))} (${name})` : name, key, alt: name0, keywords: `${title} ${palTitle(title)} ${sizeTip(k.slice(2))} ${k === 'v:-' ? 'dont care x indeterminant' : ''}`, svg: fitMini(ITEM[k].mini, 64, 40, 1.6), on: k === cur };
      }),
    })), { armed: E?.arm });
  }
  list.addEventListener('click', (e: any) => { const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  // a size changes the map; a value is armed for painting cells; Group arms drawing groups (a click makes a one-cell group)
  function pick(k: any) {
    if (k[0] === 'm') { resize(...(k.slice(2).split(',').map(Number) as [any, any, any])); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(!E.arm ? '' : k === 'g:' ? t('editor.km.tip.group', 'Group: click a cell or drag across cells. Esc when done.') : t('editor.km.tip.value', '{value}: click or drag over cells to set them. Esc when done.', { value: itemName(k, ITEM[k].name) }));
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [12, 400], redraw: () => { draw(); } });
  // layout px (y down) ↔ screen
  const S = (x: any, y: any) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const toCm = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, -(y - v.oy) / v.k]; };
  // where the pointer is on the maps: { m, r, c } with r and c running past the edges (for wrapping), or null
  function placeAt(e: any, near?: any) {
    const M = E.M, [x, y] = toCm(e);
    let best = null, bd = Infinity;
    for (let m = 0; m < M.Z; m++) {
      if (near != null && m !== near) continue;
      const [ox, oy] = F.mapOrigin(m), c = Math.floor(x - ox), r = Math.floor(oy + M.Y - y);
      const d = Math.max(0, ox - x, x - (ox + M.X)) + Math.max(0, oy - y, y - (oy + M.Y));
      if (d < bd) { bd = d; best = { m, r, c, out: d > 0 }; }
    }
    return best;
  }
  const cellUnder = (e: any) => { const p = placeAt(e); return p && !p.out && p.r >= 0 && p.r < E.M.Y && p.c >= 0 && p.c < E.M.X ? F.cellAt(E.M, p.m, p.r, p.c) : null; };
  // a group's outlines on screen: [{ x, y, w, h, m }] for each drawn part (the bounds of the package's shape)
  function partsOf(g: any) {
    const out = [];
    for (const m of g.maps) for (const p of F.groupShapes(E.M, g, m)) {
      const xs = p.pts.map((q: any) => q[0]), ys = p.pts.map((q: any) => q[1]);
      const [x1, y1] = S(Math.min(...xs), Math.min(...ys)), [x2, y2] = S(Math.max(...xs), Math.max(...ys));
      out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, m, d: p.edgeD, fd: p.fillD });
    }
    return out;
  }
  // the group whose outline is under the pointer (or, with inside, whose area is), the last drawn first
  function groupAt(e: any, inside = false) {
    const [x, y] = pos(e), G = E.M.groups;
    for (let i = G.length - 1; i >= 0; i--) for (const p of partsOf(G[i])) {
      const inBox = x >= p.x - 5 && x <= p.x + p.w + 5 && y >= p.y - 5 && y <= p.y + p.h + 5;
      if (!inBox) continue;
      if (inside) return i;
      if (Math.min(x - p.x, p.x + p.w - x, y - p.y, p.y + p.h - y) <= 5) return i;
    }
    return null;
  }
  function fit() {
    E.view = fitView(rect(), lay().bb, { scale: PX, margin: 0.3, min: 20, max: 110 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  // the handles on a group's four sides, where they can be seen: [{ side, x, y }]
  function handlesOf(i: any) {
    const M = E.M, g = M.groups[i], R = F.rectOf(M, g), m = g.maps[0];
    if (m == null) return [];
    const [ox, oy] = F.mapOrigin(m);
    // the visible run of rows (or columns) that holds the first one
    const run = (s: any, len: any, n: any) => (s + len > n ? [s, n - 1] : [s, s + len - 1]);
    const [r1, r2_] = run(R.r, R.h, M.Y), [c1, c2] = run(R.c, R.w, M.X);
    const ymid = oy + M.Y - (r1 + r2_ + 1) / 2, xmid = ox + (c1 + c2 + 1) / 2;
    const bot = (R.r + R.h - 1) % M.Y, right = (R.c + R.w - 1) % M.X;
    const at = (x: any, y: any) => S(x * PX, -y * PX);
    return [
      { side: 't', p: at(xmid, oy + M.Y - R.r - 0.2) }, { side: 'b', p: at(xmid, oy + M.Y - bot - 0.8) },
      { side: 'l', p: at(ox + R.c + 0.2, ymid) }, { side: 'r', p: at(ox + right + 0.8, ymid) },
    ];
  }
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k, kk = k / PX;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    const L = lay(), M = E.M, tr = `translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})`;
    // the hovered cell, under the drawing
    if (E.hover != null && (!E.drag || E.drag.mode === 'paint')) {
      const c = L.cells.find((x: any) => x.n === E.hover);
      if (c) { const [x, y] = S(c.x - PX / 2, c.y - PX / 2); out += `<rect class="km-hov" x="${r2(x)}" y="${r2(y)}" width="${r2(k)}" height="${r2(k)}"/>`; }
    }
    out += `<g transform="${tr}">${F.draw({ type: 'kmap', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { export: true, editor: true })}</g>`;
    // the selected group: a halo round each of its parts, and its side handles
    const sg = selG();
    if (sg) {
      out += `<g transform="${tr}">${partsOf(sg).map((p) => `<path class="km-gsel" d="${p.d}" stroke-width="${r2(5 / kk)}"/>`).join('')}</g>`;
      if (!E.drag || E.drag.mode !== 'move') for (const h of handlesOf(E.sel.g)) out += `<rect class="km-handle" data-side="${h.side}" x="${r2(h.p[0] - 4)}" y="${r2(h.p[1] - 4)}" width="8" height="8" rx="1.5"/>`;
    }
    // a group being drawn, moved or resized
    const d = E.drag;
    if (d && d.draft) {
      const g = d.draft;
      out += `<g transform="${tr}">${g.maps.flatMap((m: any) => F.groupShapes(M, g, m)).map((p: any) => `<path class="km-draft" d="${p.edgeD}" stroke-width="${r2(1.5 / kk)}" stroke-dasharray="${r2(4 / kk)} ${r2(3 / kk)}"/>`).join('')}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  // a rect from two places on one map, running the short way past an edge when the pointer went past it
  function rectFrom(a: any, b: any) {
    const M = E.M, span = (s: any, e: any, n: any) => {
      const lo = Math.min(s, e), hi = Math.max(s, e), len = Math.min(n, hi - lo + 1);
      return [((lo % n) + n) % n, len];
    };
    const [r, h] = span(a.r, b.r, M.Y), [c, w] = span(a.c, b.c, M.X);
    return { r, c, h, w };
  }
  const mapsBetween = (a: any, b: any) => {
    const ax = a % 2, ay = a >> 1, bx = b % 2, by = b >> 1, out = [];
    for (let m = 0; m < E.M.Z; m++) { const x = m % 2, y = m >> 1; if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) out.push(m); }
    return out;
  };
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const hd = e.target.closest('.km-handle');
    if (hd && selG()) {
      const g = selG();
      begin();
      E.drag = { mode: 'size', side: hd.dataset.side, i: E.sel.g, R: F.rectOf(E.M, g), maps: g.maps.slice(), m: g.maps[0], draft: null };
      return;
    }
    const gi = E.arm ? null : groupAt(e);
    if (gi != null) {
      E.sel = { g: gi };
      const g = E.M.groups[gi], p = placeAt(e);
      E.drag = { mode: 'move', i: gi, sx, sy, from: p, R: F.rectOf(E.M, g), maps: g.maps.slice(), moved: false, draft: null };
      draw(); renderProps(); return;
    }
    const p = placeAt(e), n = cellUnder(e);
    if (n != null && E.arm && E.arm[0] === 'v') {
      begin(); setCell(n, E.arm.slice(2)); E.M.dirty = true;
      E.drag = { mode: 'paint', last: n }; draw(); renderProps(); return;
    }
    if (n != null) {
      E.drag = { mode: 'cell', n, from: p, sx, sy, back: e.shiftKey, draft: E.arm === 'g:' ? { kind: 'rect' as const, a: F.cellAt(E.M, 0, p!.r, p!.c), b: F.cellAt(E.M, 0, p!.r, p!.c), maps: [p!.m] } : null };
      if (E.drag.draft) draw();
      return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const n = cellUnder(e), gi = E.arm ? null : groupAt(e), hd = e.target.closest('.km-handle');
      if (n !== E.hover) { E.hover = n; draw(); }
      svg.style.cursor = hd ? (/[tb]/.test(hd.dataset.side) ? 'ns-resize' : 'ew-resize') : gi != null ? 'move' : '';
      if (!E.arm) setTip(n != null ? cellTip(n) : '');
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return;
    }
    if (d.mode === 'paint') {
      const n = cellUnder(e);
      if (n != null && n !== d.last) { d.last = n; setCell(n, E.arm.slice(2)); E.hover = n; draw(); }
      return;
    }
    if (d.mode === 'cell') {
      if (!d.draft && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
      // a drag across cells draws a group; past an edge it wraps round to the other side
      const a = d.from, b = placeAt(e, a.m) || a, bm = placeAt(e);
      const maps = bm && !bm.out ? mapsBetween(a.m, bm.m) : [a.m];
      const same = bm && !bm.out && bm.m !== a.m ? { ...bm } : b;
      const R = rectFrom(a, same);
      const g = F.groupFor(E.M, R, maps);
      if (g) d.draft = g;
      if (d.draft) setTip(groupTip(d.draft));
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
      d.moved = true;
      // the cell under the pointer, on whichever sub map it is over (or past the edges of the first)
      const over = placeAt(e), tp = over && !over.out ? over : placeAt(e, d.from.m) || d.from;
      const dr = tp.r - d.from.r, dc = tp.c - d.from.c, dmx = (tp.m % 2) - (d.from.m % 2), dmy = (tp.m >> 1) - (d.from.m >> 1);
      let maps = d.maps.map((m: any) => [(m % 2) + dmx, (m >> 1) + dmy]);
      maps = maps.every(([x, y]: any) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && x + 2 * y < E.M.Z) ? maps.map(([x, y]: any) => x + 2 * y) : d.maps;
      const R = { ...d.R, r: (((d.R.r + dr) % E.M.Y) + E.M.Y) % E.M.Y, c: (((d.R.c + dc) % E.M.X) + E.M.X) % E.M.X };
      const g = F.groupFor(E.M, R, maps);
      if (g) d.draft = g;
      if (d.draft) setTip(groupTip(d.draft));
      draw(); return;
    }
    if (d.mode === 'size') {
      const p = placeAt(e, d.m);
      if (!p) return;
      const M = E.M, R = d.R, near = (v: any, ref: any, n: any) => v + n * Math.round((ref - v) / n);
      let { r, c, h, w } = R;
      // the side moves to the pointer's row or column, the nearest copy of it round the map
      if (d.side === 'b') h = Math.max(1, Math.min(M.Y, near(p.r, R.r + R.h - 1, M.Y) - R.r + 1));
      if (d.side === 'r') w = Math.max(1, Math.min(M.X, near(p.c, R.c + R.w - 1, M.X) - R.c + 1));
      if (d.side === 't') { const bot = R.r + R.h - 1, t = Math.min(bot, near(p.r, R.r, M.Y)); h = Math.min(M.Y, bot - t + 1); r = (((bot - h + 1) % M.Y) + M.Y) % M.Y; }
      if (d.side === 'l') { const rt = R.c + R.w - 1, l = Math.min(rt, near(p.c, R.c, M.X)); w = Math.min(M.X, rt - l + 1); c = (((rt - w + 1) % M.X) + M.X) % M.X; }
      const g = F.groupFor(M, { r, c, h, w }, d.maps);
      if (g) d.draft = g;
      if (d.draft) setTip(groupTip(d.draft));
      draw(); return;
    }
  });
  const up = (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'paint') { commit(); renderProps(); draw(); return; }
    if (d.mode === 'cell') {
      setTip('');
      if (d.draft) { addGroup(d.draft); return; }
      E.sel = null; cycle(d.n, d.back); return;
    }
    if (d.mode === 'move' || d.mode === 'size') {
      setTip('');
      if (d.draft) { begin(); E.M.groups[d.i] = { ...d.draft }; E.M.dirty = true; commit(); E.sel = { g: d.i }; }
      else commit();
      renderProps(); draw(); return;
    }
    draw();
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up); // a cancelled drag ends as a release
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover != null) { E.hover = null; if (!E.arm) setTip(''); draw(); } });
  function cellTip(n: any) {
    const M = E.M, nv = F.varsOf(M.X, M.Y, M.Z), v = valOf(n);
    return t('editor.km.cellTip', 'Cell {n} · {bits} · {value}', { n, bits: n.toString(2).padStart(nv, '0'), value: vName(v) });
  }
  function groupTip(g: any) {
    const R = F.rectOf(E.M, g), cells = R.h * R.w * g.maps.length;
    return `${cells === 1 ? t('editor.km.oneCell', '1 cell') : t('editor.commonA.nCells', '{n} cells', { n: cells })}${R.wr || R.wc ? ` · ${R.wr && R.wc ? t('editor.km.wrap.corners', 'wraps at the corners') : R.wr ? t('editor.km.wrap.rows', 'wraps top to bottom') : t('editor.km.wrap.cols', 'wraps left to right')}` : ''}`;
  }

  // right-click: the cell's values, and the group's delete
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { del: 'delete' };
  const mItem = (act: string, label: string, icon: string | null, key: string, danger?: boolean, on?: boolean) => menuRow(act, label, icon ? MI[icon] : null, key, { danger: !!danger, checked: on });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const n = cellUnder(e), gi = groupAt(e, true);
    const menuRows: MenuEntry[] = [];
    if (n != null) {
      const v = valOf(n);
      E.menuCell = n;
      // a pick-one group: the cell's value is ticked
      menuRows.push(...[['1', t('editor.km.v.one', 'One'), '1'], ['0', t('editor.km.v.zero', 'Zero'), '0'], ['-', t('editor.km.menu.dontCare', 'Don’t Care'), 'D'], ['', t('editor.km.v.empty', 'Empty'), 'E']].map(([val, nm, key]) => mItem(`set:${val}`, nm, null, key, false, v === val)));
    }
    if (gi != null) { E.sel = { g: gi }; menuRows.push('-', mItem('gdel', t('editor.km.deleteGroup', 'Delete Group'), 'del', '⌫', true)); }
    if (!menuRows.length) { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    if (a.startsWith('set:')) { const n = E.menuCell; edit(() => setCell(n, a.slice(4))); return; }
    act(a);
  }

  // ---------------------------------------------------------------- properties
  const math = (t: any) => TD.textHtml ? TD.textHtml(`$${t}$`) : esc(t);
  // a group's mark: a check when it is a valid prime implicant, else the attention mark (kmap.css colours them)
  const OK = { icon: 'check', iconClass: 'km-st ok' } as const, BAD = { icon: 'attention', iconClass: 'km-st bad' } as const;
  function renderProps() {
    if (!E) return;
    const M = E.M, C = F.check(M, E.mode), g = selG(), want = E.mode === 'pos' ? '0' : '1';
    const swatch = (i: any) => ({ bw: !!M.bw, css: F.colour(F.colorList(M)[i] || 'cyan') });
    if (g) {
      const i = E.sel.g, G = C.groups[i], R = F.rectOf(M, g);
      const status = G.ok ? (G.redundant ? t('editor.km.status.redundant', 'Valid, but its {value}s are all in other groups', { value: want }) : G.prime ? t('editor.km.status.prime', 'Valid and as large as it can be') : t('editor.km.status.larger', 'Valid, but it could be larger')) : G.why;
      const rows: FormRow[] = [{ kind: 'rendered' as const, class: 'km-term', svgOrMath: G.ok ? math(G.term) : '—' },
        { kind: 'status' as const, class: 'km-status ' + (G.ok && G.prime && !G.redundant ? 'ok' : 'bad'), ...(G.ok ? OK : BAD), text: status }];
      if (M.Z > 1) rows.push(switchRow(t('editor.km.subMaps', 'Sub maps'), Array.from<any, any>({ length: M.Z }, (_, m) => ({ text: M.Z === 2 ? String(m) : m.toString(2).padStart(2, '0'), on: g.maps.includes(m), title: M.Z === 2 ? t('editor.km.subMap', 'Sub map {n}', { n: m }) : t('editor.km.subMapBits', 'Sub map {n} ({bits})', { n: m, bits: m.toString(2).padStart(2, '0') }), attrs: { 'data-fm': m } })), { many: true, class: 'km-maps' }));
      rows.push(codeRow(groupCode(g)), note(t('editor.km.help.group', 'Drag its outline to move it, or a handle to resize it; past an edge it wraps round. Arrow keys move it, '), { kbd: '⇧' }, t('editor.km.help.groupResize', ' arrows resize it.')), actionRow('ke', 'gdel', t('editor.km.deleteGroup', 'Delete Group')));
      renderView(props, FormPanel, { sections: [{ ...section(t('editor.km.groupN', 'Group {n}', { n: i + 1 }), rows, 'sec'), swatch: swatch(i), summary: `${R.h} × ${R.w}${g.maps.length > 1 ? ` × ${g.maps.length}` : ''}` }] }); return;
    }
    const lb = F.labelsOf(M), nv = F.varsOf(M.X, M.Y, M.Z);
    const labels = lb.old ? [field(t('ui.top', 'Top'), 'lx0', mathOf(M.labels[0]), { 'data-tx': 'math' }), field(t('editor.km.side', 'Side'), 'lx1', mathOf(M.labels[1]), { 'data-tx': 'math' }),
      ...(M.Z > 1 ? [field(t('editor.km.subMaps', 'Sub maps'), 'lx2', mathOf(M.labels[2]), { 'data-tx': 'math' })] : [])]
      : Array.from<any, any>({ length: nv }, (_, k) => field(t('editor.km.bit', 'Bit {n}', { n: k }), `l${k}`, mathOf(M.labels[k] != null ? M.labels[k] : ''), { 'data-tx': 'math', placeholder: mathOf(F.DEF_LABEL(k)) }));
    const cellList = `${C.missing.slice(0, 12).join(', ')}${C.missing.length > 12 ? '…' : ''}`;
    const missing = C.missing.length ? (C.missing.length === 1 ? t('editor.km.missing.one', 'A {value} is in no group: cell {cells}', { value: want, cells: cellList }) : t('editor.km.missing.many', '{n} {value}s are in no group: cells {cells}', { n: C.missing.length, value: want, cells: cellList })) : C.ones ? t('editor.km.missing.none', 'Every {value} is in a group', { value: want }) : t('editor.km.missing.empty', 'No {value}s on the map', { value: want });
    const allOk = !C.missing.length && C.groups.every((G: any) => G.ok);
    renderView(props, FormPanel, { sections: [
      { ...section(message('editor.km.title', 'Karnaugh map'), [...labels, segments(t('ui.labels', 'Labels'), 'lmode', F.labelMode(M), [['middle', t('editor.km.labels.sides', 'Sides')], ['corner', t('editor.km.labels.corner', 'Corner'), t('editor.km.labels.cornerTitle', 'label=corner: both names at the top left corner')]]), segments(t('editor.km.groups', 'Groups'), 'bw', M.bw ? 1 : 0, [[0, t('editor.km.groups.coloured', 'Coloured')], [1, t('editor.km.groups.outlined', 'Outlined'), t('editor.km.groups.outlinedTitle', 'karnaugh-map*: black and white')]])], 'sec'), summary: `${t('editor.km.nVariables', '{n} variables', { n: nv })} · ${M.groups.length === 1 ? t('editor.km.oneGroup', '1 group') : t('editor.km.nGroups', '{n} groups', { n: M.groups.length })}` },
      section(t('editor.km.check', 'Check'), [segments(t('editor.km.groupThe', 'Group the'), 'mode', E.mode, [['sop', '1s', t('editor.km.sop', 'Sum of products')], ['pos', '0s', t('editor.km.pos', 'Product of sums')]]),
        { kind: 'rendered' as const, class: 'km-term', svgOrMath: math(`F = ${C.expr}`) }, { kind: 'status' as const, class: 'km-status ' + (allOk ? 'ok' : 'bad'), ...(allOk ? OK : BAD), text: missing },
        ...(C.groups.length ? [{ kind: 'kmapGroups' as const, groups: C.groups.map((G: any) => ({ index: G.i, title: G.ok ? (G.redundant ? t('editor.km.groupTitle.redundant', 'Its cells are all in other groups') : G.prime ? t('editor.km.groupTitle.valid', 'Valid') : t('editor.km.groupTitle.larger', 'Could be larger')) : G.why,
          ...swatch(G.i), valid: G.ok, math: G.ok ? math(G.term) : '', text: G.why, ...(G.ok && G.prime && !G.redundant ? OK : BAD) })) }] : []),
        { kind: 'actions' as const, class: 'row km-acts', buttons: [{ text: t('editor.km.findGroups', 'Find Groups'), attrs: { 'data-ke': 'solve', title: t('editor.km.findGroupsTitle', 'Replace the groups with a smallest cover of the {value}s', { value: want }) } }, { text: t('editor.km.removeGroups', 'Remove Groups'), attrs: { class: 'danger', 'data-ke': 'clear', ...(!M.groups.length ? { disabled: true } : {}) } }] },
        note(t('editor.km.help.map', "Click a cell to turn it through 0, 1 and don't care ("), { kbd: '⇧' }, t('editor.km.help.mapRest', ' goes back). Drag across cells to group them; drag past an edge to wrap round. Right-click a cell or group for more.')),
      ], 'sec'),
    ] });
  }
  // the command the code has for a group
  const groupCode = (g: any) => F.write({ ...E.M, opts: '', bw: false, labels: [], cells: [], groups: [g], extra: [] }).split('\n')[1].trim();
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const M = E.M;
    let m = /^l(\d)$/.exec(f);
    if (m) { const k = +m[1]; while (M.labels.length < k) M.labels.push(null); M.labels[k] = t.value.trim() ? wrapMath(t.value) : null; }
    else if ((m = /^lx(\d)$/.exec(f))) M.labels[+m[1]] = wrapMath(t.value) || ' ';
    else return;
    E.M.dirty = true; draw();
  });
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    if (!E) return;
    const gb = ev.target.closest('[data-gi]');
    if (gb) { E.sel = { g: +gb.dataset.gi }; draw(); renderProps(); return; }
    const mb = ev.target.closest('[data-fm]');
    if (mb) {
      const g = selG(), m = +mb.dataset.fm;
      if (!g) return;
      const maps = g.maps.includes(m) ? g.maps.filter((x: any) => x !== m) : [...g.maps, m].sort();
      if (!maps.length) return;
      edit(() => { g.maps = maps; });
      return;
    }
    const bt = ev.target.closest('[data-fs]');
    if (!bt) return;
    const f = bt.dataset.fs, v = bt.dataset.v;
    if (f === 'mode') { E.mode = v; renderProps(); return; }
    edit(() => {
      if (f === 'lmode') setOpt(E.M, 'label', v === 'corner' ? 'corner' : null);
      else if (f === 'bw') E.M.bw = v === '1';
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ke="undo"]', root).disabled = !E.undo.length;
    $('[data-ke="redo"]', root).disabled = !E.redo.length;
    $('[data-ke="delete"]', root).disabled = !selG();
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-ke]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ke, b);
  });
  function act(a: any, b?: any) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'gdel') { if (selG()) deleteGroup(E.sel.g); }
    else if (a === 'solve') solve();
    else if (a === 'clear') { edit(() => { E.M.groups = []; }); E.sel = null; renderProps(); }
    else if (a === 'copy') copyCode(b, codeTa.value);
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M, nv = F.varsOf(M.X, M.Y, M.Z);
    count.textContent = `${t('editor.km.nVariables', '{n} variables', { n: nv })} · ${M.groups.length === 1 ? t('editor.km.oneGroup', '1 group') : t('editor.km.nGroups', '{n} groups', { n: M.groups.length })}`;
    updateTools();
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
    clampSel(); buildPalette(); draw(); renderProps();
    showCodeNotes(codeMsg, F.layout({ src: codeTa.value }).warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  // arrow keys move the selected group a cell (round the edges); with ⇧ they grow or shrink it
  function nudge(key: any, grow: any) {
    const g = selG(), M = E.M;
    if (!g) return;
    const R = F.rectOf(M, g), dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0, dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    const N = grow ? { ...R, h: Math.max(1, Math.min(M.Y, R.h + dr)), w: Math.max(1, Math.min(M.X, R.w + dc)) } : { ...R, r: (R.r + dr + M.Y) % M.Y, c: (R.c + dc + M.X) % M.X };
    const n = F.groupFor(M, N, g.maps);
    if (!n) { setTip(grow ? t('editor.km.cantShape', 'The package can’t draw that shape') : t('editor.km.cantThere', 'The package can’t draw the group there')); return; }
    const i = E.sel.g;
    edit(() => { M.groups[i] = n; });
    setTip(groupTip(n));
  }
  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !session.elsewhere(e),
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
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (selG()) deleteGroup(E.sel.g); return; }
    if (e.key.startsWith('Arrow') && selG()) { e.preventDefault(); nudge(e.key, e.shiftKey); return; }
    if (e.key === 'f' || e.key === 'F') { fit(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const k = KEYS[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    // a value key sets the cell under the pointer, or arms the value when there is none
    if (k[0] === 'v' && E.hover != null) { const n = E.hover; edit(() => setCell(n, k.slice(2))); setTip(cellTip(n)); return; }
    pick(k);
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('blur', () => { if (E) E.space = false; }); // Space let go in another window
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the map back to the page (one undo step there) and keep editing
  const session = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; }, snapshot: snapCode, commit,
    root, code: codeTa, readCode, note: stageNote, discardTitle: () => t('editor.km.discard', 'Discard changes to this map?'),
  });
  const { save, finish } = session;
  let localeOff: (() => void) | undefined;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    // groups of 0s only: check them as a product of sums
    const C1 = F.check(M, 'sop'), C0 = F.check(M, 'pos');
    const mode = M.groups.length && C0.groups.filter((G: any) => G.ok).length > C1.groups.filter((G: any) => G.ok).length ? 'pos' : 'sop';
    E = { M, sel: null, arm: null, mode, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null };
    E.typed = String(block.src || ''); E.start = snapCode();
    session.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette and properties follow the interface language while the editor is open
    localeOff?.();
    localeOff = onLocale(() => { if (E) { buildPalette(); renderProps(); syncCode(); } });
    if (session.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.kmapEditor = { open, dockable: true, close: () => session.detach() };
})();
