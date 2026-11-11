// Karnaugh map editor: the overlay that opens on a Karnaugh map block. A palette of map sizes and cell
// values; the map drawn by the canvas renderer, where a click turns a cell through 0, 1 and don't care and
// a drag across cells draws a group (past an edge, it wraps round); the selected group's or the map's
// properties, with each group checked against the cells; and beside them the karnaugh-map code, live both
// ways. Untouched code is handed back as written.
// TD.kmapEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, F = TD.kmap;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const INK = '#1c1b19';
  const PX = TD.PX_PER_CM;

  // ---------------------------------------------------------------- palette
  // a size's tile shows its grids; its title says how many variables
  const SIZE_NAMES = { '2,2,1': '2 × 2', '4,2,1': '4 × 2', '2,4,1': '2 × 4', '4,4,1': '4 × 4', '4,4,2': '4 × 4 × 2', '4,4,4': '4 × 4 × 4' };
  const SIZE_TIPS = { '2,2,1': '2 variables', '4,2,1': '3 variables, 4 columns', '2,4,1': '3 variables, 4 rows', '4,4,1': '4 variables', '4,4,2': '5 variables: two 4 × 4 maps', '4,4,4': '6 variables: four 4 × 4 maps' };
  // a size: its sub maps as grids of cells, side by side and below as the package lays them out
  function mapMini(x, y, z) {
    const c = 7, gap = 5, W = (z > 1 ? 2 : 1) * x * c + (z > 1 ? gap : 0), H = (z > 2 ? 2 : 1) * y * c + (z > 2 ? gap : 0);
    let d = '';
    for (let m = 0; m < z; m++) {
      const ox = 1 + (m % 2) * (x * c + gap), oy = 1 + (m >> 1) * (y * c + gap);
      for (let i = 0; i <= x; i++) d += `M${ox + i * c},${oy}v${y * c}`;
      for (let j = 0; j <= y; j++) d += `M${ox},${oy + j * c}h${x * c}`;
    }
    return `<svg class="zxmini km-mmini" viewBox="0 0 ${W + 2} ${H + 2}" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  const cellMini = (v) => `<svg class="zxmini km-vmini" viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="3" width="24" height="24" rx="2"/>${v ? `<text x="15" y="16">${esc(v)}</text>` : ''}</svg>`;
  const groupMini = `<svg class="zxmini km-vmini" viewBox="0 0 46 30" aria-hidden="true"><path d="M3 3h40v24H3zM23 3v24M3 15h40" class="g"/><rect x="6" y="6" width="34" height="6" rx="2" class="grp"/></svg>`;
  const PAL = [
    ['Map', F.SIZES.map((s) => [`m:${s.join(',')}`, SIZE_NAMES[s.join(',')], mapMini(...s)])],
    ['Cells', [['v:1', 'One', cellMini('1'), '1'], ['v:0', 'Zero', cellMini('0'), '0'], ['v:-', 'Don’t care', cellMini('–'), 'D'], ['v:', 'Empty', cellMini(''), 'E'], ['g:', 'Group', groupMini, 'G']]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }
  KEYS['-'] = 'v:-';

  // ---------------------------------------------------------------- model
  // M = TD.kmap.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M) => (M.dirty ? F.write(M) : M.raw);
  const mathOf = (t) => { t = String(t || '').trim(); const m = /^\$([\s\S]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t) => (String(t).trim() ? `$${t.trim()}$` : '');
  const NEXT = { '0': '1', '1': '-', '-': '0' }, PREV = { '0': '-', '1': '0', '-': '1' };
  const VNAME = { '1': '1', '0': '0', '-': 'don’t care', '': 'empty' };
  const setOpt = (M, key, val) => {
    const l = M.opts ? M.opts.split(/,(?![^{]*\})/).map((x) => x.trim()).filter(Boolean) : [];
    const rest = l.filter((x) => !new RegExp(`^${key}\\s*(=|$)`).test(x));
    if (val != null) rest.push(`${key}=${val}`);
    M.opts = rest.join(', ');
  };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'kmModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  const TRASH = '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>';
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="kmTitle">
    <div class="modal-head">
      <strong id="kmTitle">Karnaugh map</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ke="delete" title="Delete the selected group (⌫)">${ic(TRASH)}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ke="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-ke="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-ke="fit" title="Fit the map in view (F)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ke="cancel">Cancel</button>
      <button class="primary" data-ke="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list km-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg km-svg" aria-label="Karnaugh map"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>karnaugh-map</span><small class="cz-count"></small><button class="flat" data-ke="copy" title="Copy the Karnaugh map code">Copy</button></div>
          <textarea spellcheck="false" aria-label="karnaugh-map code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.km-svg', root), stage = $('.cz-stage', root), list = $('.km-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: { g: index } | null, arm: 'v:1' … | 'g:' | null, mode: 'sop' | 'pos', view: { k (px per cm), ox, oy },
  //   undo, redo, pending, start, done, drag, hover: cell | null, codeAt, codeTimer }
  let E = null;
  const snapCode = () => codeOf(E.M);
  function begin() { if (E.pending == null) E.pending = snapCode(); }
  function commit() {
    if (E.pending == null) return;
    const now = snapCode();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  function edit(fn) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snapCode()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snapCode()); restore(E.redo.pop()); }
  function clampSel() { if (E.sel && !E.M.groups[E.sel.g]) E.sel = null; }
  const selG = () => (E.sel ? E.M.groups[E.sel.g] || null : null);
  const lay = () => F.layout({ src: snapCode() });

  // ---------------------------------------------------------------- editing
  function setCell(n, v) { E.M.cells[n] = v === '' ? null : v; }
  const valOf = (n) => { const v = E.M.cells[n]; return v == null ? '' : v; };
  function cycle(n, back) { edit(() => { const v = valOf(n); setCell(n, (back ? PREV : NEXT)[v] || (back ? '-' : '1')); }); }
  function addGroup(g) { edit(() => E.M.groups.push(g)); E.sel = { g: E.M.groups.length - 1 }; draw(); renderProps(); }
  function deleteGroup(i) { edit(() => E.M.groups.splice(i, 1)); E.sel = null; draw(); renderProps(); }
  // a new size keeps the cells that still exist and the groups that still fit
  function resize(x, y, z) {
    const M = E.M;
    if (M.X === x && M.Y === y && M.Z === z) return;
    edit(() => {
      const old = { X: M.X, Y: M.Y, Z: M.Z }, cells = M.cells, groups = M.groups;
      const keep = [], to = { X: x, Y: y, Z: z };
      for (const g of groups) {
        const R = F.rectOf(old, g), maps = g.maps.filter((m) => m < z);
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
    setTip(g.length ? `${g.length} group${g.length === 1 ? '' : 's'}: ${E.mode === 'pos' ? 'the 0s as sums' : 'the 1s as products'}` : `No ${E.mode === 'pos' ? '0s' : '1s'} to group`);
    setTimeout(() => { if (E && /^(No|\d)/.test(tip.textContent)) setTip(''); }, 1800);
  }

  // ---------------------------------------------------------------- palette
  function sizeMinis(el, maxW, maxH, top) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    const cur = E ? `m:${E.M.X},${E.M.Y},${E.M.Z}` : '';
    for (const [title, items] of PAL) {
      const hits = items.filter(([k, name]) => !q || `${name} ${title} ${SIZE_TIPS[k.slice(2)] || ''} ${k === 'v:-' ? 'dont care x indeterminant' : ''}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , key]) => {
        const on = E && (E.arm === k || k === cur);
        return `<button class="qe-item${on ? ' on' : ''}" data-item="${esc(k)}" title="${esc(k[0] === 'm' ? `${SIZE_TIPS[k.slice(2)]} (${name})` : name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${ITEM[k].mini}</span><span>${esc(name)}</span></button>`;
      }).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list, 64, 40, 1.6);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) pick(b.dataset.item); search.blur(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  // a size changes the map; a value is armed for painting cells; Group arms drawing groups (a click makes a one-cell group)
  function pick(k) {
    if (k[0] === 'm') { resize(...k.slice(2).split(',').map(Number)); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(!E.arm ? '' : k === 'g:' ? 'Group: click a cell or drag across cells. Esc when done.' : `${ITEM[k].name}: click or drag over cells to set them. Esc when done.`);
  }
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // layout px (y down) ↔ screen
  const S = (x, y) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const toCm = (e) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, -(y - v.oy) / v.k]; };
  // where the pointer is on the maps: { m, r, c } with r and c running past the edges (for wrapping), or null
  function placeAt(e, near) {
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
  const cellUnder = (e) => { const p = placeAt(e); return p && !p.out && p.r >= 0 && p.r < E.M.Y && p.c >= 0 && p.c < E.M.X ? F.cellAt(E.M, p.m, p.r, p.c) : null; };
  // a group's outlines on screen: [{ x, y, w, h, m }] for each drawn part (the bounds of the package's shape)
  function partsOf(g) {
    const out = [];
    for (const m of g.maps) for (const p of F.groupShapes(E.M, g, m)) {
      const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
      const [x1, y1] = S(Math.min(...xs), Math.min(...ys)), [x2, y2] = S(Math.max(...xs), Math.max(...ys));
      out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, m, d: p.edgeD, fd: p.fillD });
    }
    return out;
  }
  // the group whose outline is under the pointer (or, with inside, whose area is), the last drawn first
  function groupAt(e, inside = false) {
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
    const L = lay(), r = rect(), bb = L.bb;
    const w = bb.w / PX + 0.6, h = bb.h / PX + 0.6;
    const k = Math.max(20, Math.min(110, Math.min((r.width - 80) / w, (r.height - 80) / h)));
    const cx = (bb.x + bb.w / 2) / PX, cy = (bb.y + bb.h / 2) / PX;
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 - cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(400, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  // the handles on a group's four sides, where they can be seen: [{ side, x, y }]
  function handlesOf(i) {
    const M = E.M, g = M.groups[i], R = F.rectOf(M, g), m = g.maps[0];
    if (m == null) return [];
    const [ox, oy] = F.mapOrigin(m);
    // the visible run of rows (or columns) that holds the first one
    const run = (s, len, n) => (s + len > n ? [s, n - 1] : [s, s + len - 1]);
    const [r1, r2_] = run(R.r, R.h, M.Y), [c1, c2] = run(R.c, R.w, M.X);
    const ymid = oy + M.Y - (r1 + r2_ + 1) / 2, xmid = ox + (c1 + c2 + 1) / 2;
    const bot = (R.r + R.h - 1) % M.Y, right = (R.c + R.w - 1) % M.X;
    const at = (x, y) => S(x * PX, -y * PX);
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
    const L = lay(), M = E.M, tr = `translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})`;
    // the hovered cell, under the drawing
    if (E.hover != null && (!E.drag || E.drag.mode === 'paint')) {
      const c = L.cells.find((x) => x.n === E.hover);
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
      out += `<g transform="${tr}">${g.maps.flatMap((m) => F.groupShapes(M, g, m)).map((p) => `<path class="km-draft" d="${p.edgeD}" stroke-width="${r2(1.5 / kk)}" stroke-dasharray="${r2(4 / kk)} ${r2(3 / kk)}"/>`).join('')}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  // a rect from two places on one map, running the short way past an edge when the pointer went past it
  function rectFrom(a, b) {
    const M = E.M, span = (s, e, n) => {
      const lo = Math.min(s, e), hi = Math.max(s, e), len = Math.min(n, hi - lo + 1);
      return [((lo % n) + n) % n, len];
    };
    const [r, h] = span(a.r, b.r, M.Y), [c, w] = span(a.c, b.c, M.X);
    return { r, c, h, w };
  }
  const mapsBetween = (a, b) => {
    const ax = a % 2, ay = a >> 1, bx = b % 2, by = b >> 1, out = [];
    for (let m = 0; m < E.M.Z; m++) { const x = m % 2, y = m >> 1; if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) out.push(m); }
    return out;
  };
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
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
      E.drag = { mode: 'cell', n, from: p, sx, sy, back: e.shiftKey, draft: E.arm === 'g:' ? { kind: 'rect', a: F.cellAt(E.M, 0, p.r, p.c), b: F.cellAt(E.M, 0, p.r, p.c), maps: [p.m] } : null };
      if (E.drag.draft) draw();
      return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
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
      let maps = d.maps.map((m) => [(m % 2) + dmx, (m >> 1) + dmy]);
      maps = maps.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && x + 2 * y < E.M.Z) ? maps.map(([x, y]) => x + 2 * y) : d.maps;
      const R = { ...d.R, r: (((d.R.r + dr) % E.M.Y) + E.M.Y) % E.M.Y, c: (((d.R.c + dc) % E.M.X) + E.M.X) % E.M.X };
      const g = F.groupFor(E.M, R, maps);
      if (g) d.draft = g;
      if (d.draft) setTip(groupTip(d.draft));
      draw(); return;
    }
    if (d.mode === 'size') {
      const p = placeAt(e, d.m);
      if (!p) return;
      const M = E.M, R = d.R, near = (v, ref, n) => v + n * Math.round((ref - v) / n);
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
  svg.addEventListener('pointerup', (e) => {
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
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover != null) { E.hover = null; if (!E.arm) setTip(''); draw(); } });
  function cellTip(n) {
    const M = E.M, nv = F.varsOf(M.X, M.Y, M.Z), v = valOf(n);
    return `Cell ${n} · ${n.toString(2).padStart(nv, '0')} · ${VNAME[v] != null ? VNAME[v] : v}`;
  }
  function groupTip(g) {
    const R = F.rectOf(E.M, g), cells = R.h * R.w * g.maps.length;
    return `${cells} cell${cells === 1 ? '' : 's'}${R.wr || R.wc ? ` · wraps ${R.wr && R.wc ? 'at the corners' : R.wr ? 'top to bottom' : 'left to right'}` : ''}`;
  }

  // right-click: the cell's values, and the group's delete
  const MI = { del: TRASH, check: '<path d="M4 10.5l4 4 8-9"/>' };
  const mItem = (act, label, icon, key, danger) => `<button class="ctx-item${danger ? ' danger' : ''}" data-km="${act}">${icon ? `<svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg>` : '<span class="ic"></span>'}<span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const n = cellUnder(e), gi = groupAt(e, true);
    let html = '';
    if (n != null) {
      const v = valOf(n);
      E.menuCell = n;
      html += [['1', 'One', '1'], ['0', 'Zero', '0'], ['-', 'Don’t Care', 'D'], ['', 'Empty', 'E']].map(([val, nm, key]) => mItem(`set:${val}`, nm, v === val ? 'check' : null, key)).join('');
    }
    if (gi != null) { E.sel = { g: gi }; html += (html ? '<hr>' : '') + mItem('gdel', 'Delete Group', 'del', '⌫', true); }
    if (!html) { closeMenu(); return; }
    menu.innerHTML = html;
    draw(); renderProps();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-km]');
    if (!b) return;
    closeMenu();
    const a = b.dataset.km;
    if (a.startsWith('set:')) { const n = E.menuCell; edit(() => setCell(n, a.slice(4))); return; }
    act(a);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div>`);
  const seg = (f, cur, opts) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-fs="${f}" data-v="${esc(String(v))}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}>${n}</button>`).join('')}</div>`;
  const math = (t) => (TD.textHtml ? TD.textHtml(`$${t}$`) : esc(t));
  const swatch = (M, i) => (M.bw ? '<i class="km-sw bw"></i>' : `<i class="km-sw" style="background:${F.colour(F.colorList(M)[i] || 'cyan')}"></i>`);
  const OK = '<svg viewBox="0 0 20 20" class="km-st ok"><path d="M4 10.5l4 4 8-9"/></svg>', BAD = '<svg viewBox="0 0 20 20" class="km-st bad"><path d="M10 4v8M10 15.5v.5"/></svg>';
  function renderProps() {
    if (!E) return;
    const M = E.M, C = F.check(M, E.mode), g = selG();
    const want = E.mode === 'pos' ? '0' : '1';
    if (g) {
      const i = E.sel.g, G = C.groups[i], R = F.rectOf(M, g);
      const status = G.ok ? (G.redundant ? `Valid, but its ${want}s are all in other groups` : G.prime ? 'Valid and as large as it can be' : 'Valid, but it could be larger') : G.why;
      const mapsRow = M.Z > 1 ? row('Sub maps', `<div class="ctl seg-ctl ze-flags km-maps">${Array.from({ length: M.Z }, (_, m) => `<button data-fm="${m}" class="${g.maps.includes(m) ? 'on' : ''}" title="${esc(M.Z === 2 ? `Sub map ${m}` : `Sub map ${m} (${m.toString(2).padStart(2, '0')})`)}">${M.Z === 2 ? m : m.toString(2).padStart(2, '0')}</button>`).join('')}</div>`) : '';
      TD.morph(props, `<div class="sec"><div class="sec-title">${swatch(M, i)}Group ${i + 1} <small>${R.h} × ${R.w}${g.maps.length > 1 ? ` × ${g.maps.length}` : ''}</small></div>
        <div class="km-term">${G.ok ? math(G.term) : '—'}</div>
        <div class="km-status ${G.ok && G.prime && !G.redundant ? 'ok' : 'bad'}">${G.ok ? OK : BAD}<span>${esc(status)}</span></div>
        ${mapsRow}
        ${row('Code', `<div class="ctl"><code class="km-cmd">${esc(groupCode(g))}</code></div>`)}
        <div class="help">Drag its outline to move it, or a handle to resize it; past an edge it wraps round. Arrow keys move it, <kbd>⇧</kbd> arrows resize it.</div>
        <div class="row"><button class="danger" data-ke="gdel">Delete Group</button></div></div>`);
      return;
    }
    const lb = F.labelsOf(M), nv = F.varsOf(M.X, M.Y, M.Z);
    const labelRows = lb.old
      ? [field('Top', 'lx0', mathOf(M.labels[0]), ' data-tx="math"'), field('Side', 'lx1', mathOf(M.labels[1]), ' data-tx="math"'), M.Z > 1 ? field('Sub maps', 'lx2', mathOf(M.labels[2]), ' data-tx="math"') : ''].join('')
      : Array.from({ length: nv }, (_, k) => field(`Bit ${k}`, `l${k}`, mathOf(M.labels[k] != null ? M.labels[k] : ''), ` data-tx="math" placeholder="${esc(mathOf(F.DEF_LABEL(k)))}"`)).join('');
    const missing = C.missing.length ? `${C.missing.length === 1 ? 'A' : C.missing.length} ${want}${C.missing.length === 1 ? ' is' : 's are'} in no group: cell${C.missing.length === 1 ? '' : 's'} ${C.missing.slice(0, 12).join(', ')}${C.missing.length > 12 ? '…' : ''}` : C.ones ? `Every ${want} is in a group` : `No ${want}s on the map`;
    const allOk = !C.missing.length && C.groups.every((G) => G.ok);
    TD.morph(props, `<div class="sec"><div class="sec-title">Karnaugh map <small>${nv} variables · ${M.groups.length} group${M.groups.length === 1 ? '' : 's'}</small></div>
      ${labelRows}
      ${row('Labels', seg('lmode', F.labelMode(M), [['middle', 'Sides'], ['corner', 'Corner', 'label=corner: both names at the top left corner']]))}
      ${row('Groups', seg('bw', M.bw ? 1 : 0, [[0, 'Coloured'], [1, 'Outlined', 'karnaugh-map*: black and white']]))}</div>
      <div class="sec"><div class="sec-title">Check</div>
      ${row('Group the', seg('mode', E.mode, [['sop', '1s', 'Sum of products'], ['pos', '0s', 'Product of sums']]))}
      <div class="km-term">${math(`F = ${C.expr}`)}</div>
      <div class="km-status ${allOk ? 'ok' : 'bad'}">${allOk ? OK : BAD}<span>${esc(missing)}</span></div>
      ${C.groups.length ? `<div class="km-groups">${C.groups.map((G) => `<button data-gi="${G.i}" title="${esc(G.ok ? (G.redundant ? 'Its cells are all in other groups' : G.prime ? 'Valid' : 'Could be larger') : G.why)}">${swatch(M, G.i)}<span class="t">${G.ok ? math(G.term) : esc(G.why)}</span>${G.ok && G.prime && !G.redundant ? OK : BAD}</button>`).join('')}</div>` : ''}
      <div class="row km-acts"><button data-ke="solve" title="Replace the groups with a smallest cover of the ${want}s">Find Groups</button><button class="danger" data-ke="clear"${M.groups.length ? '' : ' disabled'}>Remove Groups</button></div>
      <div class="help">Click a cell to turn it through 0, 1 and don't care (<kbd>⇧</kbd> goes back). Drag across cells to group them; drag past an edge to wrap round. Right-click a cell or group for more.</div></div>`);
  }
  // the command the code has for a group
  const groupCode = (g) => F.write({ ...E.M, opts: '', bw: false, labels: [], cells: [], groups: [g], extra: [] }).split('\n')[1].trim();
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const M = E.M;
    let m = /^l(\d)$/.exec(f);
    if (m) { const k = +m[1]; while (M.labels.length < k) M.labels.push(null); M.labels[k] = t.value.trim() ? wrapMath(t.value) : null; }
    else if ((m = /^lx(\d)$/.exec(f))) M.labels[+m[1]] = wrapMath(t.value) || ' ';
    else return;
    E.M.dirty = true; draw();
  });
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    if (!E) return;
    const gb = ev.target.closest('[data-gi]');
    if (gb) { E.sel = { g: +gb.dataset.gi }; draw(); renderProps(); return; }
    const mb = ev.target.closest('[data-fm]');
    if (mb) {
      const g = selG(), m = +mb.dataset.fm;
      if (!g) return;
      const maps = g.maps.includes(m) ? g.maps.filter((x) => x !== m) : [...g.maps, m].sort();
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
    const b = e.target.closest('[data-ke]');
    if (!b || !E) return;
    act(b.dataset.ke, b);
  });
  function act(a, b) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'gdel') { if (selG()) deleteGroup(E.sel.g); }
    else if (a === 'solve') solve();
    else if (a === 'clear') { edit(() => { E.M.groups = []; }); E.sel = null; renderProps(); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const M = E.M, nv = F.varsOf(M.X, M.Y, M.Z);
    count.textContent = `${nv} variables · ${M.groups.length} group${M.groups.length === 1 ? '' : 's'}`;
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    codeMsg.innerHTML = F.layout({ src: c }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); buildPalette(); draw(); renderProps();
    codeMsg.innerHTML = F.layout({ src: codeTa.value }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  // arrow keys move the selected group a cell (round the edges); with ⇧ they grow or shrink it
  function nudge(key, grow) {
    const g = selG(), M = E.M;
    if (!g) return;
    const R = F.rectOf(M, g), dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0, dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    const N = grow ? { ...R, h: Math.max(1, Math.min(M.Y, R.h + dr)), w: Math.max(1, Math.min(M.X, R.w + dc)) } : { ...R, r: (R.r + dr + M.Y) % M.Y, c: (R.c + dc + M.X) % M.X };
    const n = F.groupFor(M, N, g.maps);
    if (!n) { setTip(grow ? 'The package can’t draw that shape' : 'The package can’t draw the group there'); return; }
    const i = E.sel.g;
    edit(() => { M.groups[i] = n; });
    setTip(groupTip(n));
  }
  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (selG()) deleteGroup(E.sel.g); return; }
    if (e.key.startsWith('Arrow') && selG()) { e.preventDefault(); nudge(e.key, e.shiftKey); return; }
    if (e.key === 'f' || e.key === 'F') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const k = KEYS[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    // a value key sets the cell under the pointer, or arms the value when there is none
    if (k[0] === 'v' && E.hover != null) { const n = E.hover; edit(() => setCell(n, k.slice(2))); setTip(cellTip(n)); return; }
    pick(k);
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the map back to the page (one undo step there) and keep editing
  function save() {
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snapCode();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.js, beforeunload)
  TD.unsaved.push(() => !!E && snapCode() !== E.start);
  async function finish(ok) {
    if (!E) return;
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = snapCode(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this map?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    // groups of 0s only: check them as a product of sums
    const C1 = F.check(M, 'sop'), C0 = F.check(M, 'pos');
    const mode = M.groups.length && C0.groups.filter((G) => G.ok).length > C1.groups.filter((G) => G.ok).length ? 'pos' : 'sop';
    E = { M, sel: null, arm: null, mode, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(() => { if (E) fit(); });
  }
  TD.kmapEditor = { open };
})();
