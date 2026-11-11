// Bit field editor: the overlay that opens on a bit field block. A palette of fields (bit boxes, word
// boxes, bits, skipped words, the bit header) and word groups; the field drawn as the package draws it over
// a grid of its bit columns, where a click selects a field, a drag on the line between two fields moves it
// a bit at a time, a drag on a word box's bottom changes its rows, and a double-click edits a label; the
// selected field's, group's or whole field's properties; and beside them the bytefield code, live both
// ways. Only the items that were edited are rewritten: untouched code is handed back as written.
// TD.bytefieldEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, F = TD.bytefield;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const INK = '#1c1b19';
  const PX = TD.PX_PER_CM;
  const BOXES = new Set(['bitbox', 'bitboxes', 'wordbox']);
  const CONTENT = new Set(['bitbox', 'bitboxes', 'wordbox', 'bitheader', 'skip']);

  // ---------------------------------------------------------------- palette
  const mini = (d, w = 46, h = 30, extra = '') => `<svg class="zxmini bf-mini" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/>${extra}</svg>`;
  const PAL = [
    ['Fields', [
      ['bitbox', 'Bit box', mini('M3 9h40v12H3zM17 9v12M29 9v12'), 'B', 'A field some bits wide, in the row'],
      ['wordbox', 'Word box', mini('M3 5h40v20H3z'), 'W', 'A field the width of the whole row, one or more rows tall'],
      ['bitboxes', 'Bits', mini('M3 9h40v12H3zM8 9v12M13 9v12M18 9v12M23 9v12M28 9v12M33 9v12M38 9v12'), 'I', 'One box per bit, each with its own label (\\bitboxes)'],
      ['skip', 'Skipped', mini('M3 5h40M3 25h40M3 5l40 7M43 25L3 18M3 25v-7M43 5v7'), 'K', 'Skipped words: rows left out, drawn as the package\'s slanted lines (\\skippedwords)'],
      ['bitheader', 'Header', mini('M3 21h40M5 10v6M41 10v6M23 12v4M14 13v3M32 13v3'), 'H', 'Bit header: the bit numbers above the first row'],
    ]],
    ['Groups', [
      ['gr', 'Right', mini('M3 6h22v18H3zM29 6q3 0 3 3v3q0 3 3 3q-3 0-3 3v3q0 3-3 3M37 15h6'), 'R', 'Right word group: a brace and label to the right of the selected rows'],
      ['gl', 'Left', mini('M21 6h22v18H21zM17 6q-3 0-3 3v3q0 3-3 3q3 0 3 3v3q0 3 3 3M3 15h6'), 'L', 'Left word group: a brace and label to the left of the selected rows'],
    ]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, m, key, tip] of items) { ITEM[k] = { k, name, mini: m, key, tip }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = TD.bytefield.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M) => (M.dirty ? F.write(M) : M.raw);
  // a new item, written out by the code writer
  const mk = (k, props, pre) => ({ k, sides: null, opts: null, ...props, pre, src: null, dirty: true });
  const BR = (pre = ' ') => mk('br', { len: null }, pre);
  const ROWPRE = '\n  ', FIELDPRE = ' & ';
  const touch = (it) => { it.dirty = true; E.M.dirty = true; };
  // the rows of the item list: { a, b, br } — items a … b−1, ended by the \\ at br (or by the end)
  function rowsOf(M = E.M) {
    const out = [];
    let a = 0;
    M.items.forEach((it, i) => { if (it.k === 'br') { out.push({ a, b: i, br: i }); a = i + 1; } });
    out.push({ a, b: M.items.length, br: null });
    return out;
  }
  const rowOfItem = (ii) => rowsOf().findIndex((r) => ii >= r.a && ii < (r.br == null ? Infinity : r.br + 1));
  const contentIn = (r) => E.M.items.slice(r.a, r.b).map((it, k) => [it, r.a + k]).filter(([it]) => CONTENT.has(it.k));
  const bitsOf = () => F.bitsOf(E.M);
  // how many bits a row's fields take
  const usedIn = (r) => contentIn(r).reduce((n, [it]) => n + (it.k === 'bitbox' ? +it.w || 0 : it.k === 'bitboxes' ? (+it.w || 0) * F.tokens(it.text).length : bitsOf()), 0);
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const nstr = (n) => String(Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'bfModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  const TRASH = '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>';
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="bfTitle">
    <div class="modal-head">
      <strong id="bfTitle">Bit field</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-be="delete" title="Delete the selected field or group (⌫)">${ic(TRASH)}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-be="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-be="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-be="fit" title="Fit the field in view (F)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-be="cancel">Cancel</button>
      <button class="primary" data-be="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list bf-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg bf-svg" aria-label="Bit field"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>bytefield</span><small class="cz-count"></small><button class="flat" data-be="copy" title="Copy the bit field code">Copy</button></div>
          <textarea spellcheck="false" aria-label="bytefield code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.bf-svg', root), stage = $('.cz-stage', root), list = $('.bf-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: { t: 'box', ii, sub, to } | { t: 'group', beg } | null (to: the last row of a ⇧-click range),
  //   view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
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
  function clampSel() {
    const s = E.sel, it = s && (s.t === 'box' ? E.M.items[s.ii] : E.M.items[s.beg]);
    if (!s) return;
    if (s.t === 'box' && (!it || !CONTENT.has(it.k))) E.sel = null;
    if (s.t === 'group' && (!it || it.k !== 'gbeg')) E.sel = null;
  }
  const selItem = () => (E.sel && E.sel.t === 'box' ? E.M.items[E.sel.ii] || null : null);
  const selGroup = () => (E.sel && E.sel.t === 'group' ? lay().groups.find((g) => g.beg === E.sel.beg) || null : null);
  const lay = () => F.layout({ src: snapCode() });

  // ---------------------------------------------------------------- editing
  function removeAt(ii) {
    const items = E.M.items, it = items[ii];
    items.splice(ii, 1);
    // the next item takes over the line break or the space before the removed one
    const nx = items[ii];
    if (nx && /\n/.test(it.pre) && !/\n/.test(nx.pre)) nx.pre = it.pre;
  }
  // a row with nothing left in it goes, with its \\
  function dropEmptyRow(r) {
    const R = rowsOf()[r];
    if (!R || contentIn(R).length) return;
    const rows = rowsOf();
    if (R.br != null) removeAt(R.br);
    else if (r > 0 && rows[r - 1].br != null) removeAt(rows[r - 1].br);
  }
  function deleteField(ii) {
    const it = E.M.items[ii];
    if (!it || !CONTENT.has(it.k)) return;
    const r = rowOfItem(ii);
    edit(() => { removeAt(ii); dropEmptyRow(r); });
    E.sel = null; renderProps(); draw();
  }
  // rows r1 … r2, as one undo step; word group begins and ends stay where they are
  function deleteRows(r1, r2 = r1) {
    edit(() => {
      for (let r = r2; r >= r1; r--) {
        const R = rowsOf()[r];
        if (!R) continue;
        for (let i = R.b - 1; i >= R.a; i--) if (!/^g(beg|end)$/.test(E.M.items[i].k)) removeAt(i);
        dropEmptyRow(r);
      }
    });
    E.sel = null; renderProps(); draw();
  }
  const deleteRow = (r) => deleteRows(r, r);
  function deleteGroup(g) {
    edit(() => { removeAt(g.end); removeAt(g.beg); });
    E.sel = null; renderProps(); draw();
  }
  function flipGroup(g) {
    edit(() => { for (const i of [g.beg, g.end]) { const it = E.M.items[i]; it.side = it.side === 'r' ? 'l' : 'r'; touch(it); } });
  }
  // split a field in two (a word box into two rows), or into single bits
  function split(ii, bits) {
    const it = E.M.items[ii];
    if (!it) return;
    if (it.k === 'bitbox') {
      const w = num(it.w);
      if (!(w >= 2) || w !== Math.round(w)) { setTip('A field must be at least 2 whole bits to split'); return; }
      if (bits && w > 64) { setTip('Too many bits to split one by one'); return; }
      edit(() => {
        const ws = bits ? Array(w).fill(1) : [Math.ceil(w / 2), Math.floor(w / 2)];
        it.w = String(ws[0]); touch(it);
        E.M.items.splice(ii + 1, 0, ...ws.slice(1).map((x) => mk('bitbox', { w: String(x), text: '', sides: it.sides, opts: it.opts }, FIELDPRE)));
      });
      return;
    }
    if (it.k === 'wordbox') {
      const n = num(it.w);
      if (!(n >= 2) || n !== Math.round(n)) { setTip('A word box must be at least 2 rows to split'); return; }
      edit(() => {
        it.w = String(Math.ceil(n / 2)); touch(it);
        E.M.items.splice(ii + 1, 0, BR(), mk('wordbox', { w: String(Math.floor(n / 2)), text: '', sides: it.sides, opts: it.opts }, ROWPRE));
      });
      return;
    }
    if (it.k === 'bitboxes') {
      // \bitboxes{w}{abc} → one \bitbox per token
      const tk = F.tokens(it.text);
      edit(() => {
        E.M.items.splice(ii, 1, ...tk.map((t, k) => mk('bitbox', { w: it.w, text: t, sides: it.sides, opts: it.opts }, k ? FIELDPRE : it.pre)));
      });
      return;
    }
    setTip('Only bit boxes and word boxes split');
  }
  // the content item next to ii in its row (dir ±1)
  function neighbour(ii, dir) {
    const R = rowsOf()[rowOfItem(ii)], c = contentIn(R), k = c.findIndex(([, i]) => i === ii);
    const n = c[k + dir];
    return n ? n[1] : null;
  }
  function merge(ii, dir) {
    const jj = neighbour(ii, dir), a = E.M.items[ii], b = jj != null ? E.M.items[jj] : null;
    if (!b) { setTip(`No field ${dir > 0 ? 'after' : 'before'} it in the row`); return; }
    if (a.k !== 'bitbox' || b.k !== 'bitbox') { setTip('Only bit boxes merge'); return; }
    const L = dir > 0 ? a : b, R = dir > 0 ? b : a, li = dir > 0 ? ii : jj, ri = dir > 0 ? jj : ii;
    edit(() => {
      L.w = nstr((num(L.w) || 0) + (num(R.w) || 0));
      if (!String(L.text).trim() && String(R.text).trim()) L.text = R.text;
      touch(L);
      removeAt(ri);
    });
    E.sel = { t: 'box', ii: li, sub: null }; renderProps(); draw();
  }
  function insertField(ii, after) {
    const it = E.M.items[ii], R = rowsOf()[rowOfItem(ii)];
    const room = bitsOf() - usedIn(R);
    if (it.k === 'wordbox' || it.k === 'skip' || it.k === 'bitheader') { insertRow(rowOfItem(ii), after, mk('bitbox', { w: String(Math.min(8, bitsOf())), text: '' })); return; }
    const w = room > 0 ? Math.min(room, 8) : 1;
    edit(() => {
      const nw = mk('bitbox', { w: String(w), text: '' }, after ? FIELDPRE : it.pre);
      if (!after) it.pre = FIELDPRE, touch(it);
      E.M.items.splice(after ? ii + 1 : ii, 0, nw);
    });
    E.sel = { t: 'box', ii: after ? ii + 1 : ii, sub: null }; renderProps(); draw();
    if (room <= 0) setTip(`The row is now wider than ${bitsOf()} bits`);
  }
  // a new row holding item, before or after row r; returns the new item's index
  function insertRow(r, after, item) {
    let at;
    edit(() => {
      const rows = rowsOf(), R = rows[r] || rows[rows.length - 1], items = E.M.items;
      item.pre = ROWPRE;
      if (!after) {
        // above: before any word group that starts on the row
        at = R.a;
        items.splice(at, 0, item, BR());
      } else if (R.br != null) {
        // below: after the row's \\, ended by one of its own
        at = R.br + 1;
        items.splice(at, 0, item, BR());
      } else {
        const has = contentIn(R).length;
        // the last row: after its group ends
        if (has) { items.push(BR()); }
        at = items.length;
        items.push(item);
      }
    });
    E.sel = CONTENT.has(item.k) ? { t: 'box', ii: at, sub: null } : E.sel;
    renderProps(); draw();
    return at;
  }
  // a word group round rows r1 … r2
  function groupRows(side, r1, r2) {
    const rows = rowsOf();
    if (r1 > r2) [r1, r2] = [r2, r1];
    const A = rows[r1], B = rows[r2];
    if (!A || !B) return;
    edit(() => {
      const items = E.M.items;
      // the end goes after the last field of the last row (before its \\), the begin before the first row
      let endAt = B.b;
      items.splice(endAt, 0, mk('gend', { side }, ROWPRE));
      items.splice(A.a, 0, mk('gbeg', { side, text: 'Label', opts: null }, ROWPRE));
      const nx = items[A.a + 1];
      if (nx && !/\n/.test(nx.pre)) nx.pre = ROWPRE + '  ', touch(nx);
      E.sel = { t: 'group', beg: A.a };
    });
    renderProps(); draw();
    editLabel();
  }
  // which \\end each \\begin of a word group pairs with (they nest on each side)
  function pairing(items) {
    const st = { r: [], l: [] }, m = new Map();
    for (const it of items) {
      if (it.k === 'gbeg') st[it.side].push(it);
      else if (it.k === 'gend') m.set(it, st[it.side].pop() || null);
    }
    return m;
  }
  const FIELD = (it) => CONTENT.has(it.k) && it.k !== 'bitheader';
  // the rows with fields (a header row can't start or end a group)
  const fieldRows = (items) => rowsOf({ items }).map((R, ri) => (items.slice(R.a, R.b).some(FIELD) ? ri : -1)).filter((ri) => ri >= 0);
  // a word group's rows: the first and last row with fields between its \begin and \end
  function groupSpan(items, bo, eo) {
    const b = items.indexOf(bo), e = items.indexOf(eo);
    let r1 = null, r2 = null;
    rowsOf({ items }).forEach((R, ri) => {
      for (let i = Math.max(R.a, b + 1); i < Math.min(R.b, e); i++) if (FIELD(items[i])) { if (r1 == null) r1 = ri; r2 = ri; break; }
    });
    return [r1, r2];
  }
  // each line indented two spaces a level of word group, or null when the code isn't laid out that way
  function indents(items) {
    let d = 0;
    return items.map((it) => {
      if (it.k === 'gend') d = Math.max(0, d - 1);
      const s = '  '.repeat(1 + d);
      if (it.k === 'gbeg') d++;
      return s;
    });
  }
  const evenlyIndented = (items) => { const w = indents(items); return items.every((it, i) => !/\n/.test(it.pre) || /\n([ \t]*)$/.exec(it.pre)[1] === w[i]); };
  const reindent = (items) => indents(items).forEach((w, i) => { const it = items[i]; if (/\n/.test(it.pre)) it.pre = it.pre.replace(/[ \t]*$/, w); });
  // the items with a group's \begin moved to row r1 and its \end to row r2, every group still paired as it
  // was (so it never crosses one on its side), or null when it can't be
  function placeGroup(items0, bo, eo, r1, r2) {
    const base = items0.filter((it) => it !== bo && it !== eo), rows = rowsOf({ items: base }), A = rows[r1], B = rows[r2];
    if (!A || !B || r1 > r2) return null;
    const want = pairing(items0);
    // the begin may go anywhere before the first row's first field, the end after the last row's last field
    let fa = A.a; while (fa < A.b && !CONTENT.has(base[fa].k)) fa++;
    let lb = B.b; while (lb > B.a && !CONTENT.has(base[lb - 1].k)) lb--;
    for (let i = fa; i >= A.a; i--) for (let j = lb; j <= B.b; j++) {
      if (j < i) continue;
      const t = base.slice();
      t.splice(j, 0, eo); t.splice(i, 0, bo);
      const got = pairing(t);
      if ([...want].every(([e, b]) => got.get(e) === b)) { if (evenlyIndented(items0)) reindent(t); return t; }
    }
    return null;
  }
  // the palette's items go after the selection, or at the end
  function add(k) {
    const s = selItem(), rows = rowsOf();
    const r = s ? rowOfItem(E.sel.ii) : rows.length - 1;
    if (k === 'gr' || k === 'gl') {
      const sr = selRowRange();
      if (!sr) { setTip('Select the rows to group first (⇧-click for more than one)'); return; }
      groupRows(k === 'gr' ? 'r' : 'l', sr[0], sr[1]);
      return;
    }
    if (k === 'bitheader') {
      if (E.M.items.some((it) => it.k === 'bitheader')) setTip('The field already has a bit header: this adds another');
      const n = bitsOf();
      const spec = n <= 16 ? `0-${n - 1}` : Array.from({ length: Math.ceil(n / 8) }, (_, i) => [i * 8, Math.min(n - 1, i * 8 + 7)]).flat().filter((v, i, a) => a.indexOf(v) === i).join(',');
      insertRow(0, false, mk('bitheader', { spec }));
      return;
    }
    if (k === 'wordbox') { insertRow(r, true, mk('wordbox', { w: '1', text: '' })); return; }
    if (k === 'skip') { insertRow(r, true, mk('skip', { len: null })); return; }
    // a bit box (or bits) joins the row when there's room, else starts a new one
    const R = rows[r] || rows[rows.length - 1], c = contentIn(R), room = bitsOf() - usedIn(R);
    const boxRow = c.length && c.every(([it]) => it.k === 'bitbox' || it.k === 'bitboxes');
    const make = (w) => (k === 'bitboxes' ? mk('bitboxes', { w: '1', text: '0'.repeat(Math.max(1, Math.min(8, w))), star: false }) : mk('bitbox', { w: String(w), text: '' }));
    if (boxRow && room > 0) {
      const after = s && R === rows[rowOfItem(E.sel.ii)] ? E.sel.ii : c[c.length - 1][1];
      const it = make(Math.min(8, room));
      it.pre = FIELDPRE;
      edit(() => E.M.items.splice(after + 1, 0, it));
      E.sel = { t: 'box', ii: after + 1, sub: null }; renderProps(); draw();
      return;
    }
    if (!c.length && R.br == null && E.M.items.length === 0) { const it = make(Math.min(8, bitsOf())); edit(() => { it.pre = ROWPRE; E.M.items.push(it); }); E.sel = { t: 'box', ii: 0, sub: null }; renderProps(); draw(); return; }
    insertRow(r, true, make(Math.min(8, bitsOf())));
  }
  // every row with fields (a bit header row at either end is left out), as a row range
  function selectAll() {
    const fr = fieldRows(E.M.items);
    if (!fr.length) return;
    const R = rowsOf()[fr[0]], first = E.M.items.slice(R.a, R.b).findIndex(FIELD);
    E.sel = { t: 'box', ii: R.a + first, sub: null, to: fr[fr.length - 1] };
    const n = fr[fr.length - 1] - fr[0] + 1;
    setTip(`${n} row${n === 1 ? '' : 's'} selected · R or L groups them, ⌫ deletes them`);
    draw(); renderProps();
  }
  // the rows a selection covers: the selected field's row to the ⇧-clicked one
  function selRowRange() {
    const s = E.sel;
    if (!s || s.t !== 'box') return null;
    const r = rowOfItem(s.ii), t = s.to != null ? s.to : r;
    return [Math.min(r, t), Math.max(r, t)];
  }
  function setText(ii, sub, v) {
    const it = E.M.items[ii];
    if (it.k === 'bitboxes' && sub != null) {
      const tk = F.tokens(it.text);
      tk[sub] = v;
      it.text = tk.map((t) => (t.length === 1 || /^\\[A-Za-z]+$/.test(t) ? t : `{${t}}`)).join('');
    } else it.text = v;
    touch(it);
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
    for (const [title, items] of PAL) {
      const hits = items.filter(([k, name, , , t]) => !q || `${name} ${title} ${t} ${k}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , key, t]) => `<button class="qe-item" data-item="${esc(k)}" title="${esc(t)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${ITEM[k].mini}</span><span>${esc(name)}</span></button>`).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list, 64, 40, 1.6);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) add(b.dataset.item); search.blur(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.qe-item'); if (b) add(b.dataset.item); });
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // layout px ↔ screen
  const S = (x, y) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const toL = (sx, sy) => [((sx - E.view.ox) / E.view.k) * PX, ((sy - E.view.oy) / E.view.k) * PX];
  const scr = (b) => { const [x1, y1] = S(b.x, b.y), [x2, y2] = S(b.x + b.w, b.y + b.h); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  // what is under the pointer: { t: 'box', b, edge: 'r' | 'b' | null } | { t: 'group', g, edge: 't' | 'b' | undefined } | null
  function hit(e) {
    const [x, y] = pos(e), L = lay(), near = 5;
    const sg = selGroup();
    if (sg) {
      const q = scr(sg), [cx] = S(sg.cx, 0);
      if (Math.abs(x - cx) <= 8 && Math.abs(y - q.y) <= near) return { t: 'group', g: sg, edge: 't' };
      if (Math.abs(x - cx) <= 8 && Math.abs(y - (q.y + q.h)) <= near) return { t: 'group', g: sg, edge: 'b' };
    }
    for (const b of L.boxes) {
      const s = scr(b);
      if (b.k === 'bitheader' || x < s.x - near || x > s.x + s.w + near || y < s.y - near || y > s.y + s.h + near) continue;
      if ((b.k === 'bitbox' || b.k === 'bitboxes') && Math.abs(x - (s.x + s.w)) <= near && y > s.y && y < s.y + s.h) return { t: 'box', b, edge: 'r' };
      if (b.k === 'wordbox' && Math.abs(y - (s.y + s.h)) <= near && x > s.x && x < s.x + s.w) return { t: 'box', b, edge: 'b' };
    }
    for (const b of L.boxes) {
      const s = scr(b);
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { t: 'box', b, edge: null };
    }
    for (const g of L.groups) {
      const s = scr(g);
      if (x >= s.x - 3 && x <= s.x + s.w + 3 && y >= s.y - 3 && y <= s.y + s.h + 3) return { t: 'group', g };
    }
    return null;
  }
  const boxOf = (ii, sub) => lay().boxes.find((b) => b.ii === ii && (sub == null || b.sub === sub)) || lay().boxes.find((b) => b.ii === ii);
  function fit() {
    const L = lay(), r = rect(), bb = L.bb;
    const w = bb.w / PX + 0.8, h = bb.h / PX + 0.8;
    const k = Math.max(20, Math.min(160, Math.min((r.width - 80) / w, (r.height - 80) / h)));
    const cx = (bb.x + bb.w / 2) / PX, cy = (bb.y + bb.h / 2) / PX;
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 - cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(600, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (LB) LB.pop.place();
  }, { passive: false });

  // the bits a box covers, as the header numbers them
  function bitRange(b) {
    const L = lay(), c = L.cfg, bwpx = c.bw / TD.PT_PER_PX, a = Math.round((b.x - L.cols[0]) / bwpx), w = Math.round(b.w / bwpx), N = L.bits;
    if (c.endian === 'b') return [N - 1 + c.lsb - (a + w - 1), N - 1 + c.lsb - a];
    return [c.lsb + a, c.lsb + a + w - 1];
  }
  function boxTip(b) {
    const it = E.M.items[b.ii];
    if (!it) return '';
    if (b.k === 'skip') return 'Skipped words';
    const t = F.shown(b.sub != null ? F.tokens(it.text)[b.sub] : it.text).replace(/\n/g, ' ');
    if (b.k === 'wordbox') { const n = num(it.w); return `Word box · ${n} row${n === 1 ? '' : 's'}${t ? ` · ${t}` : ''}`; }
    const [lo, hi] = bitRange(b), n = hi - lo + 1;
    return `${n === 1 ? `Bit ${lo}` : `Bits ${lo}–${hi}`} · ${n} bit${n === 1 ? '' : 's'}${t ? ` · ${t}` : ''}`;
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, kk = v.k / PX;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    const L = lay(), tr = `translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(kk)})`;
    // the bit columns, under everything: a line a bit, darker every eight from the lowest bit
    const bwpx = L.cfg.bw / TD.PT_PER_PX, x0 = L.cols[0], t = L.tbox;
    if (bwpx * kk >= 3) {
      let d = '', d8 = '';
      for (let i = 0; i <= L.bits; i++) {
        const [sx] = S(x0 + i * bwpx, 0), [, y1] = S(0, t.y), [, y2] = S(0, t.y + t.h);
        const bit = L.cfg.endian === 'b' ? L.bits - i : i;
        const p = `M${r2(sx)},${r2(y1)}V${r2(y2)}`;
        if (bit % 8 === 0) d8 += p; else d += p;
      }
      out += `<path class="bf-grid" d="${d}"/><path class="bf-grid8" d="${d8}"/>`;
    }
    // the hovered field, under the drawing
    const hv = E.hover;
    if (hv && hv.t === 'box' && !E.drag) { const s = scr(hv.b); out += `<rect class="bf-hov" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}"/>`; }
    if (hv && hv.t === 'group' && !E.drag) { const s = scr(hv.g); out += `<rect class="bf-hov" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" rx="3"/>`; }
    out += `<g transform="${tr}">${F.draw({ type: 'bytefield', x: L.bb.x, y: L.bb.y, src: snapCode(), color: INK }, { export: true, editor: true })}</g>`;
    // the selection: the field (and the rest of a ⇧-click range of rows), or the group
    const s = E.sel;
    if (s && s.t === 'box') {
      const rr = selRowRange();
      if (rr && rr[0] !== rr[1]) for (const b of L.boxes) if (b.row >= rr[0] && b.row <= rr[1] && b.k !== 'bitheader') { const q = scr(b); out += `<rect class="bf-range" x="${r2(q.x)}" y="${r2(q.y)}" width="${r2(q.w)}" height="${r2(q.h)}"/>`; }
      const b = boxOf(s.ii, s.sub);
      if (b) {
        const q = scr(b);
        out += `<rect class="bf-sel" x="${r2(q.x)}" y="${r2(q.y)}" width="${r2(q.w)}" height="${r2(q.h)}"/>`;
        // its handles: the right edge of a bit box, the bottom of a word box
        if (b.k === 'bitbox' || b.k === 'bitboxes') out += `<rect class="bf-handle" x="${r2(q.x + q.w - 3)}" y="${r2(q.y + q.h / 2 - 6)}" width="6" height="12" rx="1.5"/>`;
        if (b.k === 'wordbox') out += `<rect class="bf-handle" x="${r2(q.x + q.w / 2 - 6)}" y="${r2(q.y + q.h - 3)}" width="12" height="6" rx="1.5"/>`;
      }
    }
    const g = selGroup();
    if (g) {
      const q = scr(g), [cx] = S(g.cx, 0);
      out += `<rect class="bf-sel" x="${r2(q.x - 2)}" y="${r2(q.y - 2)}" width="${r2(q.w + 4)}" height="${r2(q.h + 4)}" rx="3"/>`;
      // its handles: the top and bottom of the brace, dragged to another row
      for (const y of [q.y, q.y + q.h]) out += `<rect class="bf-handle" x="${r2(cx - 6)}" y="${r2(y - 3)}" width="12" height="6" rx="1.5"/>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
    if (LB) LB.pop.close();
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const h = hit(e);
    if (h && h.t === 'box') {
      const b = h.b, it = E.M.items[b.ii];
      // ⇧-click: a range of rows, for grouping
      if (e.shiftKey && E.sel && E.sel.t === 'box') { E.sel = { ...E.sel, to: b.row }; draw(); renderProps(); return; }
      E.sel = { t: 'box', ii: b.ii, sub: b.sub };
      if (h.edge === 'r') {
        begin();
        const nx = neighbour(b.ii, 1), nit = nx != null ? E.M.items[nx] : null;
        E.drag = { mode: 'w', ii: b.ii, sx, b, w0: num(it.w) || 1, nx: nit && nit.k === 'bitbox' && !e.altKey ? nx : null, nw0: nit ? num(nit.w) : null, moved: false };
      } else if (h.edge === 'b') {
        begin();
        E.drag = { mode: 'h', ii: b.ii, sy, b, n0: num(it.w) || 1, moved: false };
      } else E.drag = { mode: 'sel', sx, sy, box: { ii: b.ii, sub: b.sub, row: b.row }, idle: true };
      draw(); renderProps(); return;
    }
    if (h && h.t === 'group' && h.edge) {
      const items = E.M.items, bo = items[h.g.beg], eo = items[h.g.end];
      if (bo && eo) { begin(); E.drag = { mode: 'g', edge: h.edge, bo, eo, items0: items.slice(), pre0: items.map((it) => it.pre), span: groupSpan(items, bo, eo), at: null }; return; }
    }
    if (h && h.t === 'group') { E.sel = { t: 'group', beg: h.g.beg }; E.drag = { mode: 'sel', sx, sy }; draw(); renderProps(); return; }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const h = hit(e), key = h ? (h.t === 'box' ? `b${h.b.ii}:${h.b.sub}:${h.edge}` : `g${h.g.beg}:${h.edge}`) : '';
      svg.style.cursor = h && h.edge ? (h.edge === 'r' ? 'ew-resize' : 'ns-resize') : '';
      if (key !== E.hoverKey) { E.hoverKey = key; E.hover = h; draw(); setTip(h ? (h.t === 'box' ? boxTip(h.b) + (h.edge === 'r' ? ' · drag to resize' : h.edge === 'b' ? ' · drag to change its rows' : '') : `Word group · ${F.shown(h.g.text).replace(/\n/g, ' ') || 'no label'}${h.edge ? ` · drag to change its ${h.edge === 't' ? 'first' : 'last'} row` : ''}`) : ''); }
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return;
    }
    if (d.mode === 'w') {
      // a bit at a time; the field after it gives up (or takes) the bits, unless ⌥ is held
      const L = lay(), bwpx = L.cfg.bw / TD.PT_PER_PX, [lx] = toL(sx, sy), [l0] = toL(d.sx, 0);
      const step = d.b.sub != null || E.M.items[d.ii].k === 'bitboxes' ? F.tokens(E.M.items[d.ii].text).length : 1;
      let dw = Math.round((lx - l0) / bwpx / step);
      dw = Math.max(dw, 1 - d.w0);
      if (d.nx != null) dw = Math.min(dw, d.nw0 - 1);
      const it = E.M.items[d.ii];
      if (String(it.w) !== nstr(d.w0 + dw)) {
        it.w = nstr(d.w0 + dw); touch(it);
        if (d.nx != null) { const n = E.M.items[d.nx]; n.w = nstr(d.nw0 - dw); touch(n); }
        d.moved = true; draw(); renderProps();
      }
      const b = boxOf(d.ii, d.b.sub);
      if (b) setTip(boxTip(b));
      return;
    }
    if (d.mode === 'sel') {
      // press on a field and drag: the rows from that field's to the one under the pointer
      if (!d.box) return;
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false;
      const [, ly] = toL(0, sy), R = lay().rows;
      let best = d.box.row, bd = Infinity;
      for (const ri of fieldRows(E.M.items)) {
        const r = R[ri]; if (!r) continue;
        const dd = ly < r.top ? r.top - ly : ly > r.base ? ly - r.base : 0;
        if (dd < bd) { bd = dd; best = ri; }
      }
      const to = best === d.box.row ? undefined : best;
      if (E.sel && E.sel.t === 'box' && E.sel.to === to) return;
      E.sel = { t: 'box', ii: d.box.ii, sub: d.box.sub, ...(to != null ? { to } : {}) };
      const n = Math.abs(best - d.box.row) + 1;
      setTip(`${n} row${n === 1 ? '' : 's'} selected`);
      draw(); renderProps();
      return;
    }
    if (d.mode === 'g') {
      // the row under the pointer (the nearest row with fields), no further than the group's other end
      const [, ly] = toL(0, sy), R = lay().rows, [s1, s2] = d.span;
      if (s1 == null) return;
      let best = null, bd = Infinity;
      for (const ri of fieldRows(d.items0)) {
        if (d.edge === 't' ? ri > s2 : ri < s1) continue;
        const r = R[ri]; if (!r) continue;
        const dd = ly < r.top ? r.top - ly : ly > r.base ? ly - r.base : 0;
        if (dd < bd) { bd = dd; best = ri; }
      }
      if (best == null) return;
      const want = d.edge === 't' ? [best, s2] : [s1, best], k = want.join();
      if (k === d.at) return;
      d.at = k;
      d.items0.forEach((it, i) => (it.pre = d.pre0[i])); // a placement may re-indent: start again from the code as it was
      const t = want[0] === s1 && want[1] === s2 ? d.items0.slice() : placeGroup(d.items0, d.bo, d.eo, want[0], want[1]);
      if (!t) { setTip('A word group can\'t cross another on its side: they nest'); return; }
      E.M.items = t; E.M.dirty = true;
      E.sel = { t: 'group', beg: t.indexOf(d.bo) };
      const n = want[1] - want[0] + 1;
      setTip(`Word group · ${n} row${n === 1 ? '' : 's'}`);
      draw(); renderProps();
      return;
    }
    if (d.mode === 'h') {
      const L = lay(), bh = L.cfg.bh / TD.PT_PER_PX, [, ly] = toL(0, sy), [, l0] = toL(0, d.sy);
      const n = Math.max(1, d.n0 + Math.round((ly - l0) / bh)), it = E.M.items[d.ii];
      if (num(it.w) !== n) { it.w = String(n); touch(it); d.moved = true; draw(); renderProps(); }
      setTip(boxTip(boxOf(d.ii)));
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'w' || d.mode === 'h' || d.mode === 'g') { commit(); renderProps(); }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; E.hoverKey = ''; setTip(''); draw(); } });
  svg.addEventListener('dblclick', (e) => {
    if (!E) return;
    const h = hit(e);
    if (!h) return;
    if (h.t === 'box') E.sel = { t: 'box', ii: h.b.ii, sub: h.b.sub };
    else E.sel = { t: 'group', beg: h.g.beg };
    draw(); renderProps(); editLabel();
  });

  // ---------------------------------------------------------------- label editor
  // A floating box under the field (TD.input.popup); Enter, Esc or clicking away finishes, as one undo step.
  let LB = null;
  function editLabel() {
    const s = E.sel;
    if (!s || !TD.input) return false;
    let it, get, set;
    if (s.t === 'box') {
      it = E.M.items[s.ii];
      if (!it || !BOXES.has(it.k)) return false;
      get = () => (it.k === 'bitboxes' && s.sub != null ? F.tokens(it.text)[s.sub] || '' : it.text);
      set = (v) => setText(s.ii, s.sub, v);
    } else {
      it = E.M.items[s.beg];
      if (!it) return false;
      get = () => it.text; set = (v) => { it.text = v; touch(it); };
    }
    if (LB) LB.pop.close();
    begin();
    const me = (LB = {});
    me.pop = TD.input.popup(stage, {
      text: get(), math: false, bare: true,
      at: () => labelAt(),
      onInput: (v) => { set(v); draw(); renderProps(); },
      onDone: () => { if (LB === me) LB = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelAt() {
    const s = E.sel, L = lay();
    const b = s && s.t === 'box' ? boxOf(s.ii, s.sub) : s ? L.groups.find((g) => g.beg === s.beg) : null;
    if (!b) return [0, 0];
    const q = scr(b), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + q.x + q.w / 2, vr.top - sr.top + q.y + q.h + 8];
  }

  // ---------------------------------------------------------------- context menu
  // the Quantum editor's three-bar icons (qceditor.js): outlined bars stay, the filled one is inserted (offset to
  // where it goes) or deleted (with a knocked-out ×); rows are horizontal bars, fields the same transposed
  function blocks(at, del, cols) {
    const P = (x, y) => { const r = (v) => +v.toFixed(2); return cols ? `${r(y)},${r(x)}` : `${r(x)},${r(y)}`; };
    const box = (x, y, w, h) => `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`;
    const out = (x, y, w, h) => `<path class="qo" d="${box(x + 0.5, y + 0.5, w - 1, h - 1)}"/>`;
    const solid = (d) => `<path class="qf" fill-rule="evenodd" d="${d}"/>`;
    if (del) {
      const a = 2.6, t = 0.75, k = Math.SQRT1_2, cx = 12, cy = 10;
      const arm = [[t, a], [t, t], [a, t], [a, -t], [t, -t], [t, -a], [-t, -a], [-t, -t], [-a, -t], [-a, t], [-t, t], [-t, a]]
        .map(([x, y], i) => `${i ? 'L' : 'M'}${P(cx + (x - y) * k, cy + (x + y) * k)}`).join('') + 'Z';
      return out(1.5, 1, 12, 4) + out(1.5, 15, 12, 4) + solid(box(5.5, 6.5, 13, 7) + arm);
    }
    return [1.5, 8, 14.5].map((y, i) => (i === at ? solid(box(6.5, y, 12, 4)) : out(1.5, y, 12, 4))).join('');
  }
  const MI = {
    del: TRASH, check: '<path d="M4 10.5l4 4 8-9"/>',
    above: blocks(0, false, false), below: blocks(2, false, false), rowdel: blocks(0, true, false),
    before: blocks(0, false, true), after: blocks(2, false, true),
  };
  const mItem = (act, label, icon, key, danger, off) => `<button class="ctx-item${danger ? ' danger' : ''}" data-bm="${act}"${off ? ' disabled' : ''}>${icon ? `<svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg>` : '<span class="ic"></span>'}<span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const h = hit(e);
    let html = '';
    if (h && h.t === 'box') {
      // inside a row range the range stays, and the menu is the range's first field's
      const r0 = selRowRange(), keep = r0 && r0[0] !== r0[1] && h.b.row >= r0[0] && h.b.row <= r0[1];
      if (!keep) E.sel = { t: 'box', ii: h.b.ii, sub: h.b.sub };
      const b = keep ? boxOf(E.sel.ii, E.sel.sub) : h.b, it = E.M.items[b.ii];
      const box = BOXES.has(it.k), bit = it.k === 'bitbox', w = num(it.w);
      html += box ? mItem('label', 'Edit Label…', null, '↩') : '';
      if (bit) html += mItem('half', 'Split in Half', null, 'S', false, !(w >= 2 && w === Math.round(w))) + mItem('bits', 'Split into Bits', null, '', false, !(w >= 2 && w === Math.round(w) && w <= 64));
      if (it.k === 'wordbox') html += mItem('half', 'Split into Rows', null, 'S', false, !(w >= 2 && w === Math.round(w)));
      if (it.k === 'bitboxes') html += mItem('half', 'Split into Bit Boxes', null, 'S');
      if (bit) {
        const nx = neighbour(b.ii, 1), pv = neighbour(b.ii, -1);
        html += mItem('mnext', 'Merge with Next', null, 'M', false, !(nx != null && E.M.items[nx].k === 'bitbox')) + mItem('mprev', 'Merge with Previous', null, '⇧M', false, !(pv != null && E.M.items[pv].k === 'bitbox'));
      }
      html += '<hr>';
      if (it.k === 'bitbox' || it.k === 'bitboxes') html += mItem('fbefore', 'Insert Field Before', 'before') + mItem('fafter', 'Insert Field After', 'after');
      html += mItem('rabove', 'Insert Row Above', 'above') + mItem('rbelow', 'Insert Row Below', 'below');
      html += '<hr>' + mItem('gright', 'Group Rows Right', null, 'R') + mItem('gleft', 'Group Rows Left', null, 'L');
      const rr = selRowRange();
      if (rr && rr[0] !== rr[1]) html += '<hr>' + mItem('rdel', `Delete ${rr[1] - rr[0] + 1} Rows`, 'rowdel', '⌫', true);
      else {
        html += '<hr>' + mItem('fdel', it.k === 'wordbox' || it.k === 'skip' ? 'Delete Row' : 'Delete Field', it.k === 'wordbox' || it.k === 'skip' ? 'rowdel' : 'del', '⌫', true);
        if (it.k !== 'wordbox' && it.k !== 'skip' && it.k !== 'bitheader') html += mItem('rdel', 'Delete Row', 'rowdel', '', true);
      }
    } else if (h && h.t === 'group') {
      E.sel = { t: 'group', beg: h.g.beg };
      html += mItem('label', 'Edit Label…', null, '↩') + mItem('gflip', h.g.side === 'r' ? 'Move to the Left' : 'Move to the Right') + '<hr>' + mItem('gdel', 'Delete Group', 'del', '⌫', true);
    }
    if (!html) { closeMenu(); return; }
    menu.innerHTML = html;
    draw(); renderProps();
    menu.hidden = false;
    const rr = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - rr.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - rr.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bm]');
    if (!b || b.disabled) return;
    closeMenu();
    act(b.dataset.bm);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value == null ? '' : value)}" spellcheck="false"${extra}></div>`);
  const numF = (label, f, value, unit, extra = '') => row(label, `<div class="ctl${unit ? ' unit' : ''}"><input type="number" data-f="${f}" value="${value == null ? '' : esc(value)}"${extra}>${unit ? `<span>${unit}</span>` : ''}</div>`);
  const seg = (f, cur, opts) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-fs="${f}" data-v="${esc(String(v))}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}>${n}</button>`).join('')}</div>`;
  // the fill: the colour picker, written as an xcolor spec (None: no bgcolor)
  const fillSel = (cur) => TD.texColor.field('data-f="bg"', TD.texColor.unwrap(cur), { nullable: true, dflt: 'None', title: 'Fill' });

  const flags = (sd) => `<div class="ctl seg-ctl ze-flags">${[['l', 'L', 'Left'], ['r', 'R', 'Right'], ['t', 'T', 'Top'], ['b', 'B', 'Bottom']].map(([k, n, t]) => `<button data-fb="${k}" class="${sd[k] ? 'on' : ''}" title="${t} line">${n}</button>`).join('')}</div>`;
  const ENDS = [['', 'Default'], ['little', 'Little', 'Bit 0 at the left'], ['big', 'Big', 'Bit 0 at the right']];
  function renderProps() {
    if (!E) return;
    const M = E.M, L = lay(), it = selItem(), g = selGroup();
    if (it) {
      const b = boxOf(E.sel.ii, E.sel.sub), rr = selRowRange(), multi = rr && rr[0] !== rr[1], delN = multi ? `Delete ${rr[1] - rr[0] + 1} Rows` : null;
      const code = F.fmt(it);
      if (it.k === 'bitheader') {
        TD.morph(props, `<div class="sec"><div class="sec-title">Bit header <small>${F.headerNums(it.spec).length} numbers</small></div>
          ${field('Numbers', 'spec', it.spec, ' placeholder="0,7,8,15"')}
          ${row('Endianness', seg('hend', F.getKey(it.opts, 'endianness') || '', ENDS))}
          ${numF('Lowest bit', 'hlsb', F.getKey(it.opts, 'lsb'), '', ' step="1" placeholder="0"')}
          ${row('Code', `<div class="ctl"><code class="km-cmd">${esc(code)}</code></div>`)}
          <div class="help">Numbers are a list like <code>0,7,8,15</code> or ranges like <code>0-31</code>.</div>
          <div class="row"><button class="danger" data-be="fdel">${delN || 'Delete Bit Header'}</button></div></div>`);
        return;
      }
      if (it.k === 'skip') {
        TD.morph(props, `<div class="sec"><div class="sec-title">Skipped words</div>
          ${field('Height', 'len', it.len == null ? '' : it.len, ' placeholder="2ex"')}
          ${row('Code', `<div class="ctl"><code class="km-cmd">${esc(code)}</code></div>`)}
          <div class="row"><button class="danger" data-be="fdel">${delN || 'Delete Row'}</button></div></div>`);
        return;
      }
      const sd = F.sides(it.sides), word = it.k === 'wordbox', many = it.k === 'bitboxes';
      const label = many && E.sel.sub != null ? F.tokens(it.text)[E.sel.sub] || '' : it.text;
      const title = word ? 'Word box' : many ? 'Bits' : 'Bit box';
      const small = b ? boxTip(b).split(' · ').slice(0, word ? 1 : 1).join('').replace(/^Word box/, `${num(it.w)} row${num(it.w) === 1 ? '' : 's'}`) : '';
      TD.morph(props, `<div class="sec"><div class="sec-title">${title} <small>${esc(small)}</small></div>
        ${field(many ? `Bit ${E.sel.sub != null ? E.sel.sub + 1 : ''} label` : 'Label', 'text', label, ' placeholder="none"')}
        ${many ? field('All labels', 'all', it.text) : ''}
        ${numF(word ? 'Rows' : many ? 'Bits each' : 'Bits', 'w', it.w, '', ' min="0" step="1"')}
        ${row('Borders', flags(sd))}
        ${row('Fill', fillSel(F.getKey(it.opts, 'bgcolor')))}
        ${field('Options', 'opts', it.opts || '', ' placeholder="boxformatting=…"')}
        ${row('Code', `<div class="ctl"><code class="km-cmd">${esc(code)}</code></div>`)}
        <div class="help">${multi ? `Rows ${rr[0] + 1}–${rr[1] + 1} selected: add a word group from the palette.` : `Drag its ${word ? 'bottom edge to change its rows' : 'right edge to move the line between it and the next field (⌥ for this field alone)'}; double-click to edit its label. ⇧-click another row to select rows for a word group.`}</div>
        <div class="row"><button class="danger" data-be="fdel">${delN || (word ? 'Delete Row' : 'Delete Field')}</button></div></div>`);
      return;
    }
    if (g) {
      const gi = M.items[g.beg];
      TD.morph(props, `<div class="sec"><div class="sec-title">Word group <small>${g.side === 'r' ? 'right' : 'left'}</small></div>
        ${field('Label', 'gtext', gi.text, ' placeholder="none"')}
        ${row('Side', seg('gside', g.side, [['l', 'Left'], ['r', 'Right']]))}
        ${field('Options', 'gopts', gi.opts || '', ' placeholder="rightcurly=., …"')}
        <div class="help">A <code>\\\\</code> in the label breaks the line.</div>
        <div class="row"><button class="danger" data-be="gdel">Delete Group</button></div></div>`);
      return;
    }
    const o = M.head.opts, c = L.cfg;
    TD.morph(props, `<div class="sec"><div class="sec-title">Bit field <small>${esc(F.summary(L))}</small></div>
      ${numF('Bits wide', 'bits', M.head.bits, '', ' min="1" step="1"')}
      ${field('Bit width', 'bitwidth', F.getKey(o, 'bitwidth') || '', ` placeholder="${r2(c.bw)}pt"`)}
      ${field('Bit height', 'bitheight', F.getKey(o, 'bitheight') || '', ' placeholder="4ex"')}
      ${row('Endianness', seg('end', F.getKey(o, 'endianness') || '', ENDS))}
      ${numF('Lowest bit', 'lsb', F.getKey(o, 'lsb'), '', ' step="1" placeholder="0"')}
      ${field('Bit numbers', 'bitformatting', F.getKey(o, 'bitformatting') || '', ' placeholder="\\tiny"')}
      ${field('Field text', 'boxformatting', F.getKey(o, 'boxformatting') || '', ' placeholder="\\centering"')}
      <div class="help">Click a field to edit it; drag the line between two fields to move it; right-click for more. <kbd>S</kbd> splits, <kbd>M</kbd> merges, arrow keys move between fields.</div></div>`);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f || !E) return;
    const M = E.M, it = selItem(), g = selGroup(), v = t.value;
    const opt = (o, k, val) => F.setKey(o, k, val === '' ? null : val);
    if (it) {
      if (f === 'text') setText(E.sel.ii, E.sel.sub, v);
      else if (f === 'all') { it.text = v; touch(it); }
      else if (f === 'w') { if (num(v) > 0) { it.w = nstr(num(v)); touch(it); } }
      else if (f === 'bg') { it.opts = opt(it.opts, 'bgcolor', TD.texColor.wrap(v)); touch(it); }
      else if (f === 'opts') { it.opts = v.trim() || null; touch(it); }
      else if (f === 'spec') { it.spec = v; touch(it); }
      else if (f === 'hlsb') { it.opts = opt(it.opts, 'lsb', v.trim()); touch(it); }
      else if (f === 'len') { it.len = v.trim() || null; touch(it); }
    } else if (g) {
      const gi = M.items[g.beg];
      if (f === 'gtext') { gi.text = v; touch(gi); }
      else if (f === 'gopts') { gi.opts = v.trim() || null; touch(gi); }
    } else {
      if (f === 'bits') { if (parseInt(v, 10) > 0) M.head.bits = String(parseInt(v, 10)); else return; }
      else if (f === 'lsb') M.head.opts = opt(M.head.opts, 'lsb', v.trim());
      else M.head.opts = opt(M.head.opts, f, v.trim());
      M.head.dirty = true;
    }
    M.dirty = true; draw();
  });
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('change', (ev) => { if (E && ev.target.matches('select')) { commit(); renderProps(); } });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    if (!E) return;
    const fb = ev.target.closest('[data-fb]');
    if (fb) {
      const it = selItem();
      if (!it) return;
      const sd = F.sides(it.sides);
      sd[fb.dataset.fb] = !sd[fb.dataset.fb];
      const str = 'lrtb'.split('').filter((k) => sd[k]).join('');
      edit(() => { it.sides = str === 'lrtb' ? null : str; touch(it); });
      return;
    }
    const bt = ev.target.closest('[data-fs]');
    if (!bt) return;
    const f = bt.dataset.fs, v = bt.dataset.v, M = E.M;
    edit(() => {
      if (f === 'end') { M.head.opts = F.setKey(M.head.opts, 'endianness', v || null); M.head.dirty = true; }
      else if (f === 'hend') { const it = selItem(); it.opts = F.setKey(it.opts, 'endianness', v || null); touch(it); }
      else if (f === 'gside') { const g = selGroup(); if (g && g.side !== v) for (const i of [g.beg, g.end]) { M.items[i].side = v; touch(M.items[i]); } }
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-be="undo"]', root).disabled = !E.undo.length;
    $('[data-be="redo"]', root).disabled = !E.redo.length;
    $('[data-be="delete"]', root).disabled = !E.sel;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-be]');
    if (!b || !E) return;
    act(b.dataset.be, b);
  });
  function act(a, b) {
    const s = E.sel, it = selItem(), g = selGroup();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'fdel' || a === 'gdel' || a === 'rdel') {
      const rr = selRowRange();
      if (g && a !== 'fdel' && a !== 'rdel') deleteGroup(g);
      else if (it && (a === 'rdel' || (rr && rr[0] !== rr[1]))) deleteRows(rr[0], rr[1]);
      else if (it) { if (it.k === 'wordbox' || it.k === 'skip') deleteRow(rowOfItem(s.ii)); else deleteField(s.ii); }
    }
    else if (a === 'label') editLabel();
    else if (a === 'half' && it) split(s.ii, false);
    else if (a === 'bits' && it) split(s.ii, true);
    else if (a === 'mnext' && it) merge(s.ii, 1);
    else if (a === 'mprev' && it) merge(s.ii, -1);
    else if (a === 'fbefore' && it) insertField(s.ii, false);
    else if (a === 'fafter' && it) insertField(s.ii, true);
    else if (a === 'rabove' && it) insertRow(rowOfItem(s.ii), false, mk('wordbox', { w: '1', text: '' }));
    else if (a === 'rbelow' && it) insertRow(rowOfItem(s.ii), true, mk('wordbox', { w: '1', text: '' }));
    else if (a === 'gright' || a === 'gleft') add(a === 'gright' ? 'gr' : 'gl');
    else if (a === 'gflip' && g) flipGroup(g);
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    count.textContent = F.summary(lay());
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    codeMsg.innerHTML = lay().warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps();
    codeMsg.innerHTML = F.layout({ src: codeTa.value }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  // arrow keys move between fields: along the row, or to the field above or below
  function step(key) {
    const L = lay(), bs = L.boxes.filter((b) => b.k !== 'bitheader');
    if (!bs.length) return;
    const s = E.sel && E.sel.t === 'box' ? boxOf(E.sel.ii, E.sel.sub) : null;
    if (!s) { const b = bs[0]; E.sel = { t: 'box', ii: b.ii, sub: b.sub }; draw(); renderProps(); return; }
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    let best = null, bd = Infinity;
    for (const b of bs) {
      if (b === s) continue;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2, dx = bx - cx, dy = by - cy;
      const ok = key === 'ArrowRight' ? b.row === s.row && dx > 0 : key === 'ArrowLeft' ? b.row === s.row && dx < 0 : key === 'ArrowDown' ? dy > 1 && b.y >= s.y + s.h - 1 : dy < -1 && b.y + b.h <= s.y + 1;
      if (!ok) continue;
      const dist = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy) * 4 + (bx < b.x + b.w && cx > b.x && cx < b.x + b.w ? 0 : Math.abs(dx));
      if (dist < bd) { bd = dist; best = b; }
    }
    if (best) { E.sel = { t: 'box', ii: best.ii, sub: best.sub }; draw(); renderProps(); setTip(boxTip(best)); }
  }
  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (document.querySelector('.td-dialog')) return;
    // the label popup handles its own keys (Enter and Esc finish it); this listener runs first, in capture
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select, [contenteditable], math-field'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && (e.key === 'a' || e.key === 'A') && !e.shiftKey) { e.preventDefault(); selectAll(); return; }
    if (mod) return;
    const it = selItem(), g = selGroup();
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); act('delete'); return; }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); step(e.key); return; }
    if (e.key === 'Enter' && (it || g)) { e.preventDefault(); editLabel(); return; }
    if ((e.key === 's' || e.key === 'S') && it) { e.preventDefault(); split(E.sel.ii, false); return; }
    if ((e.key === 'm' || e.key === 'M') && it) { e.preventDefault(); merge(E.sel.ii, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'f' || e.key === 'F') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const k = KEYS[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    add(k);
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the field back to the page (one undo step there) and keep editing
  function save() {
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snapCode();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  async function finish(ok) {
    if (!E) return;
    if (LB) LB.pop.close();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = snapCode(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this bit field?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    E = { M, sel: null, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, hoverKey: '', codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(() => { if (E) fit(); });
  }
  TD.bytefieldEditor = { open, _state: () => E, _placeGroup: placeGroup, _groupSpan: groupSpan, _rows: () => selRowRange(), _scr: (b) => scr(b), _lay: () => lay() };
})();
