import { wheelZoomFactor } from '../ui/wheel-zoom';
import { captions } from '../i18n/messages';
import { onLocale, t, message } from '../i18n';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { section, row, switchRow } from '../ui/forms';
import { field, numField, segments, codeRow, note, actionRow, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import BfeditorFrame from '../ui/editors/BfeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, editorMenuOpen, inEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
// Bit field editor: the overlay that opens on a bit field block. A palette of fields (bit boxes, word
// boxes, bits, skipped words, the bit header) and word groups; the field drawn as the package draws it over
// a grid of its bit columns, where a click selects a field, a drag on the line between two fields moves it
// a bit at a time, a drag on a word box's bottom changes its rows, and a double-click edits a label; the
// selected field's, group's or whole field's properties; and beside them the bytefield code, live both
// ways. Only the items that were edited are rewritten: untouched code is handed back as written.
// TD.bytefieldEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const F = TD.bytefield;
  const { r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const INK = '#1c1b19';
  const PX = TD.PX_PER_CM;
  const BOXES = new Set(['bitbox', 'bitboxes', 'wordbox']);
  const CONTENT = new Set(['bitbox', 'bitboxes', 'wordbox', 'bitheader', 'skip']);

  // ---------------------------------------------------------------- palette
  const mini = (d: any, w = 46, h = 30, extra = '') => `<svg class="zxmini bf-mini" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/>${extra}</svg>`;
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
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, m, key, tip] of items) { ITEM[k] = { k, name, mini: m, key, tip }; if (key) KEYS[key.toLowerCase()] = k; }
  // the palette as shown (PAL keeps the English for search): [name, tooltip]
  const palTitle = (title: any) => (title === 'Fields' ? t('editor.bf.pal.fields', 'Fields') : t('editor.bf.pal.groups', 'Groups'));
  const palText = (k: string): [string, string] => (({
    bitbox: () => [t('editor.bf.bitBox', 'Bit box'), t('editor.bf.pal.bitboxTip', 'A field some bits wide, in the row')],
    wordbox: () => [t('editor.bf.wordBox', 'Word box'), t('editor.bf.pal.wordboxTip', 'A field the width of the whole row, one or more rows tall')],
    bitboxes: () => [t('editor.bf.bits', 'Bits'), t('editor.bf.pal.bitboxesTip', 'One box per bit, each with its own label (\\bitboxes)')],
    skip: () => [t('editor.bf.pal.skip', 'Skipped'), t('editor.bf.pal.skipTip', 'Skipped words: rows left out, drawn as the package\'s slanted lines (\\skippedwords)')],
    bitheader: () => [t('editor.bf.pal.header', 'Header'), t('editor.bf.pal.headerTip', 'Bit header: the bit numbers above the first row')],
    gr: () => [t('ui.right', 'Right'), t('editor.bf.pal.grTip', 'Right word group: a brace and label to the right of the selected rows')],
    gl: () => [t('ui.left', 'Left'), t('editor.bf.pal.glTip', 'Left word group: a brace and label to the left of the selected rows')],
  } as Record<string, () => [string, string]>)[k]?.() ?? [ITEM[k].name, ITEM[k].tip]);
  const rowsText = (n: any) => (n === 1 ? t('editor.bf.oneRow', '1 row') : t('editor.bf.nRows', '{n} rows', { n: String(n) }));

  // ---------------------------------------------------------------- model
  // M = TD.bytefield.parse(src) plus { raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { const M = F.parse(src); M.raw = String(src || ''); M.dirty = false; return M; }
  const codeOf = (M: any) => (M.dirty ? F.write(M) : M.raw);
  // a new item, written out by the code writer
  const mk = (k: any, props: any, pre?: any) => ({ k, sides: null, opts: null, ...props, pre, src: null, dirty: true });
  const BR = (pre = ' ') => mk('br', { len: null }, pre);
  const ROWPRE = '\n  ', FIELDPRE = ' & ';
  const touch = (it: any) => { it.dirty = true; E.M.dirty = true; };
  // the rows of the item list: { a, b, br } — items a … b−1, ended by the \\ at br (or by the end)
  function rowsOf(M = E.M) {
    const out = [];
    let a = 0;
    M.items.forEach((it: any, i: any) => { if (it.k === 'br') { out.push({ a, b: i, br: i }); a = i + 1; } });
    out.push({ a, b: M.items.length, br: null });
    return out;
  }
  const rowOfItem = (ii: any) => rowsOf().findIndex((r) => ii >= r.a && ii < (r.br == null ? Infinity : r.br + 1));
  const contentIn = (r: any) => E.M.items.slice(r.a, r.b).map((it: any, k: any) => [it, r.a + k]).filter(([it]: any) => CONTENT.has(it.k));
  const bitsOf = () => F.bitsOf(E.M);
  // how many bits a row's fields take
  const usedIn = (r: any) => contentIn(r).reduce((n: any, [it]: any) => n + (it.k === 'bitbox' ? +it.w || 0 : it.k === 'bitboxes' ? (+it.w || 0) * F.tokens(it.text).length : bitsOf()), 0);
  const num = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const nstr = (n: any) => String(Math.round(n * 1000) / 1000);

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'bfModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d: any) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  const TRASH = '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>';
  mountFrame(root, BfeditorFrame);
  document.body.appendChild(root);
  const svg = $('.bf-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.commonA.elements', 'Elements'), listClass: 'bf-list', onpick: (k) => add(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { t: 'box', ii, sub, fo, all } | { t: 'group', beg } | null (fo: a range's far field, see selBoxes),
  //   view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null;
  const snapCode = () => codeOf(E.M);
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: snapCode, restore, updateTools, changed: () => session.changed(),
  });
  function edit(fn: any) { begin(); fn(); E.M.dirty = true; commit(); clampSel(); draw(); renderProps(); }
  function restore(code: any) { E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  function clampSel() {
    const s = E.sel, it = s && (s.t === 'box' ? E.M.items[s.ii] : E.M.items[s.beg]);
    if (!s) return;
    if (s.t === 'box' && (!it || !CONTENT.has(it.k))) E.sel = null;
    if (s.t === 'group' && (!it || it.k !== 'gbeg')) E.sel = null;
  }
  const selItem = () => (E.sel && E.sel.t === 'box' ? E.M.items[E.sel.ii] || null : null);
  const selGroup = () => (E.sel && E.sel.t === 'group' ? lay().groups.find((g: any) => g.beg === E.sel.beg) || null : null);
  const lay = () => F.layout({ src: snapCode() });

  // ---------------------------------------------------------------- editing
  function removeAt(ii: any) {
    const items = E.M.items, it = items[ii];
    items.splice(ii, 1);
    // the next item takes over the line break or the space before the removed one
    const nx = items[ii];
    if (nx && /\n/.test(it.pre) && !/\n/.test(nx.pre)) nx.pre = it.pre;
  }
  // a row with nothing left in it goes, with its \\
  function dropEmptyRow(r: any) {
    const R = rowsOf()[r];
    if (!R || contentIn(R).length) return;
    const rows = rowsOf();
    if (R.br != null) removeAt(R.br);
    else if (r > 0 && rows[r - 1].br != null) removeAt(rows[r - 1].br);
  }
  function deleteField(ii: any) {
    const it = E.M.items[ii];
    if (!it || !CONTENT.has(it.k)) return;
    const r = rowOfItem(ii);
    edit(() => { removeAt(ii); dropEmptyRow(r); });
    E.sel = null; renderProps(); draw();
  }
  // rows r1 … r2, as one undo step; word group begins and ends stay where they are
  function deleteRows(r1: any, r2 = r1) {
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
  const deleteRow = (r: any) => deleteRows(r, r);
  function deleteGroup(g: any) {
    edit(() => { removeAt(g.end); removeAt(g.beg); });
    E.sel = null; renderProps(); draw();
  }
  function flipGroup(g: any) {
    edit(() => { for (const i of [g.beg, g.end]) { const it = E.M.items[i]; it.side = it.side === 'r' ? 'l' : 'r'; touch(it); } });
  }
  // split a field in two (a word box into two rows), or into single bits
  function split(ii: any, bits: any) {
    const it = E.M.items[ii];
    if (!it) return;
    if (it.k === 'bitbox') {
      const w = num(it.w);
      if (!(w! >= 2) || w !== Math.round(w!)) { setTip(t('editor.bf.tip.split2', 'A field must be at least 2 whole bits to split')); return; }
      if (bits && w > 64) { setTip(t('editor.bf.tip.tooMany', 'Too many bits to split one by one')); return; }
      edit(() => {
        const ws = bits ? Array(w).fill(1) : [Math.ceil(w / 2), Math.floor(w / 2)];
        it.w = String(ws[0]); touch(it);
        E.M.items.splice(ii + 1, 0, ...ws.slice(1).map((x) => mk('bitbox', { w: String(x), text: '', sides: it.sides, opts: it.opts }, FIELDPRE)));
      });
      return;
    }
    if (it.k === 'wordbox') {
      const n = num(it.w);
      if (!(n! >= 2) || n !== Math.round(n!)) { setTip(t('editor.bf.tip.split2rows', 'A word box must be at least 2 rows to split')); return; }
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
        E.M.items.splice(ii, 1, ...tk.map((t: any, k: any) => mk('bitbox', { w: it.w, text: t, sides: it.sides, opts: it.opts }, k ? FIELDPRE : it.pre)));
      });
      return;
    }
    setTip(t('editor.bf.tip.onlySplit', 'Only bit boxes and word boxes split'));
  }
  // the content item next to ii in its row (dir ±1)
  function neighbour(ii: any, dir: any) {
    const R = rowsOf()[rowOfItem(ii)], c = contentIn(R), k = c.findIndex(([, i]: any) => i === ii);
    const n = c[k + dir];
    return n ? n[1] : null;
  }
  function merge(ii: any, dir: any) {
    const jj = neighbour(ii, dir), a = E.M.items[ii], b = jj != null ? E.M.items[jj] : null;
    if (!b) { setTip(dir > 0 ? t('editor.bf.tip.noAfter', 'No field after it in the row') : t('editor.bf.tip.noBefore', 'No field before it in the row')); return; }
    if (a.k !== 'bitbox' || b.k !== 'bitbox') { setTip(t('editor.bf.tip.onlyMerge', 'Only bit boxes merge')); return; }
    const L = dir > 0 ? a : b, R = dir > 0 ? b : a, li = dir > 0 ? ii : jj, ri = dir > 0 ? jj : ii;
    edit(() => {
      L.w = nstr((num(L.w) || 0) + (num(R.w) || 0));
      if (!String(L.text).trim() && String(R.text).trim()) L.text = R.text;
      touch(L);
      removeAt(ri);
    });
    E.sel = { t: 'box', ii: li, sub: null }; renderProps(); draw();
  }
  function insertField(ii: any, after: any) {
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
    if (room <= 0) setTip(t('editor.bf.tip.wider', 'The row is now wider than {n} bits', { n: bitsOf() }));
  }
  // a new row holding item, before or after row r; returns the new item's index
  function insertRow(r: any, after: any, item: any) {
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
  function groupRows(side: any, r1: any, r2: any) {
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
  function pairing(items: any) {
    const st: Record<string, any> = { r: [], l: [] }, m = new Map();
    for (const it of items) {
      if (it.k === 'gbeg') st[it.side].push(it);
      else if (it.k === 'gend') m.set(it, st[it.side].pop() || null);
    }
    return m;
  }
  const FIELD = (it: any) => CONTENT.has(it.k) && it.k !== 'bitheader';
  // the rows with fields (a header row can't start or end a group)
  const fieldRows = (items: any) => rowsOf({ items }).map((R, ri) => (items.slice(R.a, R.b).some(FIELD) ? ri : -1)).filter((ri) => ri >= 0);
  // a word group's rows: the first and last row with fields between its \begin and \end
  function groupSpan(items: any, bo: any, eo: any) {
    const b = items.indexOf(bo), e = items.indexOf(eo);
    let r1: any = null, r2 = null;
    rowsOf({ items }).forEach((R, ri) => {
      for (let i = Math.max(R.a, b + 1); i < Math.min(R.b, e); i++) if (FIELD(items[i])) { if (r1 == null) r1 = ri; r2 = ri; break; }
    });
    return [r1, r2];
  }
  // each line indented two spaces a level of word group, or null when the code isn't laid out that way
  function indents(items: any) {
    let d = 0;
    return items.map((it: any) => {
      if (it.k === 'gend') d = Math.max(0, d - 1);
      const s = '  '.repeat(1 + d);
      if (it.k === 'gbeg') d++;
      return s;
    });
  }
  const evenlyIndented = (items: any) => { const w = indents(items); return items.every((it: any, i: any) => !/\n/.test(it.pre) || (/\n([ \t]*)$/.exec(it.pre))![1] === w[i]); };
  const reindent = (items: any) => indents(items).forEach((w: any, i: any) => { const it = items[i]; if (/\n/.test(it.pre)) it.pre = it.pre.replace(/[ \t]*$/, w); });
  // the items with a group's \begin moved to row r1 and its \end to row r2, every group still paired as it
  // was (so it never crosses one on its side), or null when it can't be
  function placeGroup(items0: any, bo: any, eo: any, r1: any, r2: any) {
    const base = items0.filter((it: any) => it !== bo && it !== eo), rows = rowsOf({ items: base }), A = rows[r1], B = rows[r2];
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
  function add(k: any) {
    const s = selItem(), rows = rowsOf();
    const r = s ? rowOfItem(E.sel.ii) : rows.length - 1;
    if (k === 'gr' || k === 'gl') {
      const sr = selRowRange();
      if (!sr) { setTip(t('editor.bf.tip.selectRows', 'Select the rows to group first (⇧-click for more than one)')); return; }
      groupRows(k === 'gr' ? 'r' : 'l', sr[0], sr[1]);
      return;
    }
    if (k === 'bitheader') {
      if (E.M.items.some((it: any) => it.k === 'bitheader')) setTip(t('editor.bf.tip.header', 'The field already has a bit header: this adds another'));
      const n = bitsOf();
      const spec = n <= 16 ? `0-${n - 1}` : Array.from<any, any>({ length: Math.ceil(n / 8) }, (_, i) => [i * 8, Math.min(n - 1, i * 8 + 7)]).flat().filter((v, i, a) => a.indexOf(v) === i).join(',');
      insertRow(0, false, mk('bitheader', { spec }));
      return;
    }
    if (k === 'wordbox') { insertRow(r, true, mk('wordbox', { w: '1', text: '' })); return; }
    if (k === 'skip') { insertRow(r, true, mk('skip', { len: null })); return; }
    // a bit box (or bits) joins the row when there's room, else starts a new one
    const R = rows[r] || rows[rows.length - 1], c = contentIn(R), room = bitsOf() - usedIn(R);
    const boxRow = c.length && c.every(([it]: any) => it.k === 'bitbox' || it.k === 'bitboxes');
    const make = (w: any) => (k === 'bitboxes' ? mk('bitboxes', { w: '1', text: '0'.repeat(Math.max(1, Math.min(8, w))), star: false }) : mk('bitbox', { w: String(w), text: '' }));
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
    const bs = lay().boxes.filter((b: any) => b.k !== 'bitheader');
    if (!bs.length) return;
    const a = bs[0], z = bs[bs.length - 1];
    E.sel = { t: 'box', ii: a.ii, sub: a.sub, fo: { ii: z.ii, sub: z.sub }, all: true };
    const n = fr[fr.length - 1] - fr[0] + 1;
    setTip(n === 1 ? t('editor.bf.tip.rowSelected', '1 row selected · R or L groups them, ⌫ deletes them') : t('editor.bf.tip.rowsSelected', '{n} rows selected · R or L groups them, ⌫ deletes them', { n }));
    draw(); renderProps();
  }
  // A selection is a field (the anchor) and, for a range, the field at its other end (fo): it covers every
  // field the rectangle between the two touches, rows down and bit columns across. all: every field.
  function selBoxes() {
    const s = E.sel;
    if (!s || s.t !== 'box') return [];
    const a = boxOf(s.ii, s.sub);
    if (!a) return [];
    const bs = lay().boxes.filter((b: any) => b.k !== 'bitheader');
    if (s.all) return bs;
    const f = s.fo ? boxOf(s.fo.ii, s.fo.sub) : a;
    if (!f || f === a) return [a];
    // the rectangle grows to take in the whole of every field it touches, until nothing more joins
    let r1 = Math.min(a.row, f.row), r2 = Math.max(a.row, f.row), x1 = Math.min(a.x, f.x), x2 = Math.max(a.x + a.w, f.x + f.w), got;
    for (;;) {
      got = bs.filter((b: any) => b.row >= r1 && b.row <= r2 && b.x < x2 - 0.5 && b.x + b.w > x1 + 0.5);
      const n1 = Math.min(x1, ...got.map((b: any) => b.x)), n2 = Math.max(x2, ...got.map((b: any) => b.x + b.w));
      if (n1 >= x1 - 0.5 && n2 <= x2 + 0.5) return got;
      x1 = n1; x2 = n2;
    }
  }
  const isRange = () => selBoxes().length > 1;
  // the rows a selection covers
  function selRowRange() {
    const bs = selBoxes();
    if (!bs.length) return null;
    const rs = bs.map((b: any) => b.row);
    return [Math.min(...rs), Math.max(...rs)];
  }
  // a range that takes in every field of its rows: deleting it deletes the rows
  function wholeRows() {
    const bs = selBoxes(), rr = selRowRange();
    if (bs.length < 2) return false;
    return lay().boxes.filter((b: any) => b.k !== 'bitheader' && b.row >= rr![0] && b.row <= rr![1]).every((b: any) => bs.includes(b));
  }
  // what ⌫ does to a range, for the menu and the panel
  function rangeDelLabel() {
    const bs = selBoxes();
    if (bs.length < 2) return null;
    const rr = selRowRange(), n = rr![1] - rr![0] + 1;
    if (wholeRows()) return n === 1 ? t('editor.commonA.menu.deleteRow', 'Delete Row') : t('editor.commonA.menu.deleteRows', 'Delete {n} Rows', { n });
    const m = new Set(bs.map((b: any) => b.ii)).size;
    return m === 1 ? t('editor.bf.deleteOneField', 'Delete 1 Field') : t('editor.bf.deleteFields', 'Delete {n} Fields', { n: m });
  }
  function deleteRange() {
    if (wholeRows()) { const rr = selRowRange(); deleteRows(rr![0], rr![1]); return; }
    const iis = [...new Set(selBoxes().map((b: any) => b.ii))].sort((p, q) => (q as any) - (p as any));
    edit(() => { for (const ii of iis) { const r = rowOfItem(ii); removeAt(ii); dropEmptyRow(r); } });
    E.sel = null; renderProps(); draw();
  }
  function rangeTip() {
    const bs = selBoxes(), rr = selRowRange();
    if (bs.length < 2) { if (bs[0]) setTip(boxTip(bs[0])); return; }
    const n = rr![1] - rr![0] + 1;
    setTip(n > 1 ? t('editor.bf.tip.fieldsRows', '{n} fields in {rows} rows selected', { n: bs.length, rows: n }) : t('editor.bf.tip.fields', '{n} fields selected', { n: bs.length }));
  }
  function setText(ii: any, sub: any, v: any) {
    const it = E.M.items[ii];
    if (it.k === 'bitboxes' && sub != null) {
      const tk = F.tokens(it.text);
      tk[sub] = v;
      it.text = tk.map((t: any) => (t.length === 1 || /^\\[A-Za-z]+$/.test(t) ? t : `{${t}}`)).join('');
    } else it.text = v;
    touch(it);
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([title, items]: any) => ({
      id: title, title: palTitle(title),
      // the shown name and tooltip, the English ones and the category's find it
      items: items.map(([k, name, , key, tp]: any) => { const [label, tip] = palText(k); return { id: k, label, title: tip, key, alt: name, keywords: `${tp} ${title} ${palTitle(title)}`, svg: fitMini(ITEM[k].mini, 64, 40, 1.6) }; }),
    })));
  }
  list.addEventListener('click', (e: any) => { const b = e.target.closest('.qe-item'); if (b) add(b.dataset.item); });
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const pos = (e: any) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // layout px ↔ screen
  const S = (x: any, y: any) => [E.view.ox + (x / PX) * E.view.k, E.view.oy + (y / PX) * E.view.k];
  const toL = (sx: any, sy: any) => [((sx - E.view.ox) / E.view.k) * PX, ((sy - E.view.oy) / E.view.k) * PX];
  const scr = (b: any) => { const [x1, y1] = S(b.x, b.y), [x2, y2] = S(b.x + b.w, b.y + b.h); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  // what is under the pointer: { t: 'box', b, edge: 'r' | 'b' | null } | { t: 'group', g, edge: 't' | 'b' | undefined } | null
  function hit(e: any) {
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
  const boxOf = (ii: any, sub?: any) => lay().boxes.find((b: any) => b.ii === ii && (sub == null || b.sub === sub)) || lay().boxes.find((b: any) => b.ii === ii);
  function fit() {
    const L = lay(), r = rect(), bb = L.bb;
    const w = bb.w / PX + 0.8, h = bb.h / PX + 0.8;
    const k = Math.max(20, Math.min(160, Math.min((r.width - 80) / w, (r.height - 80) / h)));
    const cx = (bb.x + bb.w / 2) / PX, cy = (bb.y + bb.h / 2) / PX;
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 - cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e: any) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(600, v.k * wheelZoomFactor(e)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (LB) LB.pop.place();
  }, { passive: false });

  // the bits a box covers, as the header numbers them
  function bitRange(b: any) {
    const L = lay(), c = L.cfg, bwpx = c.bw / TD.PT_PER_PX, a = Math.round((b.x - L.cols[0]) / bwpx), w = Math.round(b.w / bwpx), N = L.bits;
    if (c.endian === 'b') return [N - 1 + c.lsb - (a + w - 1), N - 1 + c.lsb - a];
    return [c.lsb + a, c.lsb + a + w - 1];
  }
  function boxTip(b: any) {
    const it = E.M.items[b.ii];
    if (!it) return '';
    if (b.k === 'skip') return t('editor.bf.skippedWords', 'Skipped words');
    const txt = F.shown(b.sub != null ? F.tokens(it.text)[b.sub] : it.text).replace(/\n/g, ' ');
    if (b.k === 'wordbox') return `${t('editor.bf.wordBox', 'Word box')} · ${rowsText(num(it.w))}${txt ? ` · ${txt}` : ''}`;
    const n = bitRange(b)[1] - bitRange(b)[0] + 1;
    return `${bitsHead(b)} · ${n === 1 ? t('editor.bf.oneBit', '1 bit') : t('editor.bf.nBits', '{n} bits', { n })}${txt ? ` · ${txt}` : ''}`;
  }
  // a bit box's bits: "Bit 3" or "Bits 0–7"
  function bitsHead(b: any) {
    const [lo, hi] = bitRange(b);
    return lo === hi ? t('editor.bf.bitN', 'Bit {n}', { n: lo }) : t('editor.bf.bitsRange', 'Bits {lo}–{hi}', { lo, hi });
  }

  // ---------------------------------------------------------------- drawing
  // the selected fields as one shape: each tinted, outlined only where it doesn't meet another selected field
  function selShape(qs: any) {
    const near = (a: any, b: any) => Math.abs(a - b) < 0.75;
    // what is left of [a, b] once the given spans are taken out
    const cut = (a: any, b: any, spans: any) => {
      let parts = [[a, b]];
      for (const [c, d] of spans) parts = parts.flatMap(([p, q]) => (d <= p || c >= q ? [[p, q]] : [[p, Math.max(p, c)], [Math.min(q, d), q]].filter(([u, v]) => v - u > 0.75)));
      return parts;
    };
    let fill = '', d = '';
    for (const q of qs) {
      fill += `<rect class="bf-selfill" x="${r2(q.x)}" y="${r2(q.y)}" width="${r2(q.w)}" height="${r2(q.h)}"/>`;
      const o = qs.filter((p: any) => p !== q);
      for (const [y, at] of [[q.y, (p: any) => p.y + p.h], [q.y + q.h, (p: any) => p.y]]) for (const [a, b] of cut(q.x, q.x + q.w, o.filter((p: any) => near(at(p), y)).map((p: any) => [p.x, p.x + p.w]))) d += `M${r2(a)},${r2(y)}H${r2(b)}`;
      for (const [x, at] of [[q.x, (p: any) => p.x + p.w], [q.x + q.w, (p: any) => p.x]]) for (const [a, b] of cut(q.y, q.y + q.h, o.filter((p: any) => near(at(p), x)).map((p: any) => [p.y, p.y + p.h]))) d += `M${r2(x)},${r2(a)}V${r2(b)}`;
    }
    return `${fill}<path class="bf-sel" d="${d}"/>`;
  }
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, kk = v.k / PX;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    const L = lay(), tr = `translate(${r2(v.ox)},${r2(v.oy)}) scale(${kk})`;
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
      const bs = selBoxes();
      out += selShape(bs.map(scr));
      const b = bs.length === 1 ? bs[0] : null;
      if (b) {
        const q = scr(b);
        // its handles: the right edge of a bit box, the bottom of a word box
        if (b.k === 'bitbox' || b.k === 'bitboxes') out += `<rect class="bf-handle" x="${r2(q.x + q.w - 3)}" y="${r2(q.y + q.h / 2 - 6)}" width="6" height="12" rx="1.5"/>`;
        if (b.k === 'wordbox') out += `<rect class="bf-handle" x="${r2(q.x + q.w / 2 - 6)}" y="${r2(q.y + q.h - 3)}" width="12" height="6" rx="1.5"/>`;
      }
    }
    const g = selGroup();
    if (g) {
      const q = scr(g), [cx] = S(g.cx, 0);
      out += `<rect class="bf-sel bf-selfill" x="${r2(q.x - 2)}" y="${r2(q.y - 2)}" width="${r2(q.w + 4)}" height="${r2(q.h + 4)}" rx="3"/>`;
      // its handles: the top and bottom of the brace, dragged to another row
      for (const y of [q.y, q.y + q.h]) out += `<rect class="bf-handle" x="${r2(cx - 6)}" y="${r2(y - 3)}" width="12" height="6" rx="1.5"/>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    if (LB) LB.pop.close();
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const h = hit(e);
    // a second press on the same field or brace, soon and close: edit its label. Each press redraws the stage,
    // which may replace the element under the pointer, so the browser's click and dblclick can't be relied on.
    const key = e.button === 0 && !e.shiftKey && h && !h.edge ? (h.t === 'box' ? `b${h.b.ii}:${h.b.sub}` : `g${h.g.beg}`) : null;
    const now = performance.now(), lp = E.lastPress;
    E.lastPress = key ? { key, t: now, x: sx, y: sy } : null;
    if (key && lp && lp.key === key && now - lp.t < 450 && Math.hypot(sx - lp.x, sy - lp.y) < 5) {
      E.lastPress = null; E.drag = null;
      E.sel = h!.t === 'box' ? { t: 'box', ii: h!.b.ii, sub: h!.b.sub } : { t: 'group', beg: h!.g.beg };
      draw(); renderProps(); editLabel();
      return;
    }
    if (h && h.t === 'box') {
      const b = h.b, it = E.M.items[b.ii];
      // ⇧-click: the range from the selected field to this one
      if (e.shiftKey && E.sel && E.sel.t === 'box') { E.sel = { t: 'box', ii: E.sel.ii, sub: E.sel.sub, fo: { ii: b.ii, sub: b.sub } }; draw(); renderProps(); rangeTip(); return; }
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
      if (bo && eo) { begin(); E.drag = { mode: 'g', edge: h.edge, bo, eo, items0: items.slice(), pre0: items.map((it: any) => it.pre), span: groupSpan(items, bo, eo), at: null }; return; }
    }
    if (h && h.t === 'group') { E.sel = { t: 'group', beg: h.g.beg }; E.drag = { mode: 'sel', sx, sy }; draw(); renderProps(); return; }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const h = hit(e), key = h ? (h.t === 'box' ? `b${h.b.ii}:${h.b.sub}:${h.edge}` : `g${h.g.beg}:${h.edge}`) : '';
      svg.style.cursor = h && h.edge ? (h.edge === 'r' ? 'ew-resize' : 'ns-resize') : '';
      if (key !== E.hoverKey) { E.hoverKey = key; E.hover = h; draw(); setTip(h ? (h.t === 'box' ? boxTip(h.b) + (h.edge === 'r' ? ` · ${t('editor.bf.tip.dragResize', 'drag to resize')}` : h.edge === 'b' ? ` · ${t('editor.bf.tip.dragRows', 'drag to change its rows')}` : '') : `${t('editor.bf.wordGroup', 'Word group')} · ${F.shown(h.g.text).replace(/\n/g, ' ') || t('editor.bf.noLabel', 'no label')}${h.edge ? ` · ${h.edge === 't' ? t('editor.bf.tip.dragFirst', 'drag to change its first row') : t('editor.bf.tip.dragLast', 'drag to change its last row')}` : ''}`) : ''); }
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
      // press on a field and drag: the fields from that one to the one under (or nearest) the pointer
      if (!d.box) return;
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false;
      let best = null, bd = Infinity;
      for (const b of lay().boxes) {
        if (b.k === 'bitheader') continue;
        const q = scr(b), dx = Math.max(q.x - sx, 0, sx - q.x - q.w), dy = Math.max(q.y - sy, 0, sy - q.y - q.h), dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = b; }
      }
      if (!best) return;
      const fo = best.ii === d.box.ii && best.sub === d.box.sub ? null : { ii: best.ii, sub: best.sub };
      const cur = E.sel && E.sel.t === 'box' ? E.sel.fo || null : undefined;
      if (cur !== undefined && (cur && fo ? cur.ii === fo.ii && cur.sub === fo.sub : cur === fo)) return;
      E.sel = { t: 'box', ii: d.box.ii, sub: d.box.sub, ...(fo ? { fo } : {}) };
      draw(); renderProps(); rangeTip();
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
      d.items0.forEach((it: any, i: any) => (it.pre = d.pre0[i])); // a placement may re-indent: start again from the code as it was
      const placed = want[0] === s1 && want[1] === s2 ? d.items0.slice() : placeGroup(d.items0, d.bo, d.eo, want[0], want[1]);
      if (!placed) { setTip(t('editor.bf.tip.nest', 'A word group can\'t cross another on its side: they nest')); return; }
      E.M.items = placed; E.M.dirty = true;
      E.sel = { t: 'group', beg: placed.indexOf(d.bo) };
      const n = want[1] - want[0] + 1;
      setTip(`${t('editor.bf.wordGroup', 'Word group')} · ${rowsText(n)}`);
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

  // ---------------------------------------------------------------- label editor
  // A floating box under the field (TD.input.popup); Enter, Esc or clicking away finishes, as one undo step.
  let LB: any = null;
  function editLabel() {
    const s = E.sel;
    if (!s || !TD.input) return false;
    let it: any, get, set;
    if (s.t === 'box') {
      it = E.M.items[s.ii];
      if (!it || !BOXES.has(it.k)) return false;
      get = () => (it.k === 'bitboxes' && s.sub != null ? F.tokens(it.text)[s.sub] || '' : it.text);
      set = (v: any) => setText(s.ii, s.sub, v);
    } else {
      it = E.M.items[s.beg];
      if (!it) return false;
      get = () => it.text; set = (v: any) => { it.text = v; touch(it); };
    }
    if (LB) LB.pop.close();
    begin();
    const me: any = (LB = {});
    me.pop = TD.input.popup(stage, {
      text: get(), math: false, bare: true,
      at: () => labelAt(),
      onInput: (v: any) => { set(v); draw(); renderProps(); },
      onDone: () => { if (LB === me) LB = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelAt() {
    const s = E.sel, L = lay();
    const b = s && s.t === 'box' ? boxOf(s.ii, s.sub) : s ? L.groups.find((g: any) => g.beg === s.beg) : null;
    if (!b) return [0, 0];
    const q = scr(b), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + q.x + q.w / 2, vr.top - sr.top + q.y + q.h + 8];
  }

  // ---------------------------------------------------------------- context menu
  // the menu rows' icons: inserting and deleting rows and fields are the grids' three-bar icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { del: 'delete', above: 'rowAbove', below: 'rowBelow', rowdel: 'rowDelete', before: 'colBefore', after: 'colAfter' };
  const mItem = (act: string, label: string, icon?: string | null, key?: string, danger?: boolean, off?: boolean) => menuRow(act, label, icon ? MI[icon] : null, key, { danger: !!danger, disabled: !!off });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const h = hit(e);
    const menuRows: MenuEntry[] = [];
    if (h && h.t === 'box') {
      // inside a row range the range stays, and the menu is the range's first field's
      const keep = isRange() && selBoxes().some((q: any) => q.ii === h.b.ii && q.sub === h.b.sub);
      if (!keep) E.sel = { t: 'box', ii: h.b.ii, sub: h.b.sub };
      const b = keep ? boxOf(E.sel.ii, E.sel.sub) : h.b, it = E.M.items[b.ii];
      const box = BOXES.has(it.k), bit = it.k === 'bitbox', w = num(it.w);
      if (box) menuRows.push(mItem('label', t('editor.commonA.menu.editLabel', 'Edit Label…'), null, '↩'));
      if (bit) menuRows.push(mItem('half', t('editor.bf.menu.half', 'Split in Half'), null, 'S', false, !(w! >= 2 && w === Math.round(w!))), mItem('bits', t('editor.bf.menu.bits', 'Split into Bits'), null, '', false, !(w! >= 2 && w === Math.round(w!) && w <= 64)));
      if (it.k === 'wordbox') menuRows.push(mItem('half', t('editor.bf.menu.rows', 'Split into Rows'), null, 'S', false, !(w! >= 2 && w === Math.round(w!))));
      if (it.k === 'bitboxes') menuRows.push(mItem('half', t('editor.bf.menu.boxes', 'Split into Bit Boxes'), null, 'S'));
      if (bit) {
        const nx = neighbour(b.ii, 1), pv = neighbour(b.ii, -1);
        menuRows.push(mItem('mnext', t('editor.bf.menu.mergeNext', 'Merge with Next'), null, 'M', false, !(nx != null && E.M.items[nx].k === 'bitbox')), mItem('mprev', t('editor.bf.menu.mergePrev', 'Merge with Previous'), null, '⇧M', false, !(pv != null && E.M.items[pv].k === 'bitbox')));
      }
      menuRows.push('-');
      if (it.k === 'bitbox' || it.k === 'bitboxes') menuRows.push(mItem('fbefore', t('editor.bf.menu.fieldBefore', 'Insert Field Before'), 'before'), mItem('fafter', t('editor.bf.menu.fieldAfter', 'Insert Field After'), 'after'));
      menuRows.push(mItem('rabove', t('editor.commonA.menu.rowAbove', 'Insert Row Above'), 'above'), mItem('rbelow', t('editor.commonA.menu.rowBelow', 'Insert Row Below'), 'below'));
      menuRows.push('-', mItem('gright', t('editor.bf.menu.groupRight', 'Group Rows Right'), null, 'R'), mItem('gleft', t('editor.bf.menu.groupLeft', 'Group Rows Left'), null, 'L'));
      const dl = rangeDelLabel();
      if (dl) menuRows.push('-', mItem('fdel', dl, wholeRows() ? 'rowdel' : 'del', '⌫', true));
      else {
        menuRows.push('-', mItem('fdel', it.k === 'wordbox' || it.k === 'skip' ? t('editor.commonA.menu.deleteRow', 'Delete Row') : t('editor.bf.deleteField', 'Delete Field'), it.k === 'wordbox' || it.k === 'skip' ? 'rowdel' : 'del', '⌫', true));
        if (it.k !== 'wordbox' && it.k !== 'skip' && it.k !== 'bitheader') menuRows.push(mItem('rdel', t('editor.commonA.menu.deleteRow', 'Delete Row'), 'rowdel', '', true));
      }
    } else if (h && h.t === 'group') {
      E.sel = { t: 'group', beg: h.g.beg };
      menuRows.push(mItem('label', t('editor.commonA.menu.editLabel', 'Edit Label…'), null, '↩'), mItem('gflip', h.g.side === 'r' ? t('editor.bf.menu.toLeft', 'Move to the Left') : t('editor.bf.menu.toRight', 'Move to the Right')), '-', mItem('gdel', t('editor.bf.deleteGroup', 'Delete Group'), 'del', '⌫', true));
    }
    if (!menuRows.length) { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- properties
  const ENDS = () => [['', t('ui.default', 'Default')], ['little', t('editor.bf.end.little', 'Little'), t('editor.bf.end.littleTitle', 'Bit 0 at the left')], ['big', t('editor.bf.end.big', 'Big'), t('editor.bf.end.bigTitle', 'Bit 0 at the right')]];
  function renderProps() {
    if (!E) return;
    const M = E.M, L = lay(), it = selItem(), g = selGroup();
    const show = (title: any, summary: any, rows: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), ...(summary ? { summary } : {}) }] });
    if (it) {
      const b = boxOf(E.sel.ii, E.sel.sub), rr = selRowRange(), delN = rangeDelLabel(), multi = !!delN, nsel = selBoxes().length;
      const code = F.fmt(it);
      if (it.k === 'bitheader') {
        show(t('editor.bf.bitHeader', 'Bit header'), t('editor.bf.nNumbers', '{n} numbers', { n: F.headerNums(it.spec).length }), [field(t('editor.bf.numbers', 'Numbers'), 'spec', it.spec, { placeholder: '0,7,8,15' }),
          segments(t('editor.bf.endianness', 'Endianness'), 'hend', F.getKey(it.opts, 'endianness') || '', ENDS()), numField(t('editor.bf.lowestBit', 'Lowest bit'), 'hlsb', F.getKey(it.opts, 'lsb'), '', { step: '1', placeholder: '0' }), codeRow(code),
          note(t('editor.bf.help.numbers', 'Numbers are a list like '), { code: '0,7,8,15' }, t('editor.bf.help.ranges', ' or ranges like '), { code: '0-31' }, t('editor.bf.help.end', '.')), actionRow('be', 'fdel', delN || t('editor.bf.deleteHeader', 'Delete Bit Header'))]);
        return;
      }
      if (it.k === 'skip') {
        show(t('editor.bf.skippedWords', 'Skipped words'), '', [field(t('ui.height', 'Height'), 'len', it.len ?? '', { placeholder: '2ex' }), codeRow(code), actionRow('be', 'fdel', delN || t('editor.commonA.menu.deleteRow', 'Delete Row'))]); return;
      }
      const sd = F.sides(it.sides), word = it.k === 'wordbox', many = it.k === 'bitboxes';
      const label = many && E.sel.sub != null ? F.tokens(it.text)[E.sel.sub] || '' : it.text;
      const title = word ? t('editor.bf.wordBox', 'Word box') : many ? t('editor.bf.bits', 'Bits') : t('editor.bf.bitBox', 'Bit box');
      const small = b ? (b.k === 'skip' ? t('editor.bf.skippedWords', 'Skipped words') : b.k === 'wordbox' ? rowsText(num(it.w)) : bitsHead(b)) : '';
      const BORDERS = [['l', 'L', t('editor.bf.border.left', 'Left line')], ['r', 'R', t('editor.bf.border.right', 'Right line')], ['t', 'T', t('editor.bf.border.top', 'Top line')], ['b', 'B', t('editor.bf.border.bottom', 'Bottom line')]];
      const flags = switchRow(t('editor.bf.borders', 'Borders'), BORDERS.map(([key, text, title]) => ({ text, title, on: !!sd[key], attrs: { 'data-fb': key } })), { many: true });
      show(title, small, [field(many ? t('editor.bf.bitLabel', 'Bit {n} label', { n: E.sel.sub != null ? E.sel.sub + 1 : '' }) : t('ui.label', 'Label'), 'text', label, { 'data-tx': 'text', placeholder: 'none' }),
        ...(many ? [field(t('editor.bf.allLabels', 'All labels'), 'all', it.text, { 'data-tx': 'text' })] : []), numField(word ? t('editor.bf.rows', 'Rows') : many ? t('editor.bf.bitsEach', 'Bits each') : t('editor.bf.bits', 'Bits'), 'w', it.w, '', { min: '0', step: '1' }), flags,
        { ...row(captions["ui.fill"], texColour(TD.texColor.unwrap(F.getKey(it.opts, 'bgcolor')), { 'data-f': 'bg' }, { nullable: true, defaultLabel: t('ui.none', 'None'), title: t('ui.fill', 'Fill') })), controlClass: 'ctl tc' },
        field(t('ui.options', 'Options'), 'opts', it.opts || '', { placeholder: 'boxformatting=…' }), codeRow(code),
        note(multi ? (rr![1] > rr![0] ? t('editor.bf.help.multiRows', '{n} fields selected, rows {r1}–{r2}: R or L groups the rows. This panel edits the first.', { n: nsel, r1: rr![0] + 1, r2: rr![1] + 1 }) : t('editor.bf.help.multi', '{n} fields selected. This panel edits the first.', { n: nsel })) : word ? t('editor.bf.help.word', 'Drag its bottom edge to change its rows; double-click to edit its label. Drag across fields, ⇧-click or ⇧-arrow to select a range.') : t('editor.bf.help.bit', 'Drag its right edge to move the line between it and the next field (⌥ for this field alone); double-click to edit its label. Drag across fields, ⇧-click or ⇧-arrow to select a range.')),
        actionRow('be', 'fdel', delN || (word ? t('editor.commonA.menu.deleteRow', 'Delete Row') : t('editor.bf.deleteField', 'Delete Field')))]); return;
    }
    if (g) {
      const gi = M.items[g.beg];
      show(t('editor.bf.wordGroup', 'Word group'), g.side === 'r' ? t('editor.bf.side.right', 'right') : t('editor.bf.side.left', 'left'), [field(t('ui.label', 'Label'), 'gtext', gi.text, { 'data-tx': 'text', placeholder: 'none' }), segments(t('editor.bf.side', 'Side'), 'gside', g.side, [['l', t('ui.left', 'Left')], ['r', t('ui.right', 'Right')]]),
        field(t('ui.options', 'Options'), 'gopts', gi.opts || '', { placeholder: 'rightcurly=., …' }), note(t('editor.bf.help.break', 'A '), { code: '\\\\' }, t('editor.bf.help.breakRest', ' in the label breaks the line.')), actionRow('be', 'gdel', t('editor.bf.deleteGroup', 'Delete Group'))]); return;
    }
    const o = M.head.opts, c = L.cfg;
    show(t('editor.bf.title', 'Bit field'), F.summary(L), [numField(t('editor.bf.bitsWide', 'Bits wide'), 'bits', M.head.bits, '', { min: '1', step: '1' }),
      field(t('editor.bf.bitWidth', 'Bit width'), 'bitwidth', F.getKey(o, 'bitwidth') || '', { placeholder: `${r2(c.bw)}pt` }), field(t('editor.bf.bitHeight', 'Bit height'), 'bitheight', F.getKey(o, 'bitheight') || '', { placeholder: '4ex' }),
      segments(t('editor.bf.endianness', 'Endianness'), 'end', F.getKey(o, 'endianness') || '', ENDS()), numField(t('editor.bf.lowestBit', 'Lowest bit'), 'lsb', F.getKey(o, 'lsb'), '', { step: '1', placeholder: '0' }),
      field(t('editor.bf.bitNumbers', 'Bit numbers'), 'bitformatting', F.getKey(o, 'bitformatting') || '', { placeholder: '\\tiny' }),
      field(t('editor.bf.fieldText', 'Field text'), 'boxformatting', F.getKey(o, 'boxformatting') || '', { placeholder: '\\centering' }),
      note(t('editor.bf.help.field', 'Click a field to edit it; drag the line between two fields to move it; right-click for more. '), { kbd: 'S' }, t('editor.bf.help.splits', ' splits, '), { kbd: 'M' }, t('editor.bf.help.merges', ' merges, arrow keys move between fields.')),
    ]);
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f || !E) return;
    const M = E.M, it = selItem(), g = selGroup(), v = t.value;
    const opt = (o: any, k: any, val: any) => F.setKey(o, k, val === '' ? null : val);
    if (it) {
      if (f === 'text') setText(E.sel.ii, E.sel.sub, v);
      else if (f === 'all') { it.text = v; touch(it); }
      else if (f === 'w') { if ((num(v))! > 0) { it.w = nstr(num(v)); touch(it); } }
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
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('change', (ev: any) => { if (E && ev.target.matches('select')) { commit(); renderProps(); } });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
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
    const b = (e.target! as Element).closest('[data-be]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.be, b);
  });
  function act(a: any, b?: any) {
    const s = E.sel, it = selItem(), g = selGroup();
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'fdel' || a === 'gdel' || a === 'rdel') {
      const rr = selRowRange();
      if (g && a !== 'fdel' && a !== 'rdel') deleteGroup(g);
      else if (it && isRange()) deleteRange();
      else if (it && a === 'rdel') deleteRows(rr![0], rr![1]);
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
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = t('ui.copied', 'Copied'); setTimeout(() => (b.textContent = t('ui.copy', 'Copy')), 1200); });
    updateTools();
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    count.textContent = F.summary(lay());
    updateTools();
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, lay().warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps();
    showCodeNotes(codeMsg, F.layout({ src: codeTa.value }).warnings);
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  // arrow keys move between fields: along the row, or to the field above or below
  // ⇧ moves the range's far end instead, from the field it is on
  function step(key: any, extend: any) {
    const L = lay(), bs = L.boxes.filter((b: any) => b.k !== 'bitheader');
    if (!bs.length) return;
    const S0 = E.sel && E.sel.t === 'box' ? E.sel : null, fo = extend && S0 && S0.fo && !S0.all ? S0.fo : S0;
    const s = fo ? boxOf(fo.ii, fo.sub) : null;
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
    if (!best) return;
    if (extend && S0) {
      const back = best.ii === S0.ii && best.sub === S0.sub;
      E.sel = { t: 'box', ii: S0.ii, sub: S0.sub, ...(back ? {} : { fo: { ii: best.ii, sub: best.sub } }) };
      draw(); renderProps(); rangeTip(); return;
    }
    E.sel = { t: 'box', ii: best.ii, sub: best.sub }; draw(); renderProps(); setTip(boxTip(best));
  }
  window.addEventListener('keydown', (e) => {
    if (inEditorMenu(e)) return; // the right-click menu's own keys: arrows, Enter, Esc
    // a focused palette button keeps its own Enter and Space (they click it) instead of the canvas shortcuts
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('.qe-item, .cz-part, [data-cmd], [data-tool], [data-ex]')) return;
    if (!E || root.hidden || session.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (document.querySelector('.td-dialog')) return;
    // the label popup handles its own keys (Enter and Esc finish it); this listener runs first, in capture
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select, [contenteditable], math-field'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (editorMenuOpen()) { closeMenu(); return; }
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
    if (e.key.startsWith('Arrow')) { e.preventDefault(); step(e.key, e.shiftKey); return; }
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
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // ⌘S: write the field back to the page (one undo step there) and keep editing
  const session = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; }, snapshot: snapCode, commit,
    root, code: codeTa, readCode, setTip, tip, discardTitle: () => t('editor.bf.discard', 'Discard changes to this bit field?'), beforeClose: () => { if (LB) LB.pop.close(); },
  });
  const { save, finish } = session;
  let localeOff: (() => void) | undefined;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, view: { ox: 0, oy: 0, k: 60 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, hoverKey: '', codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    session.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette and properties follow the interface language while the editor is open
    localeOff?.();
    localeOff = onLocale(() => { if (E) { buildPalette(); renderProps(); } });
    if (session.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.bytefieldEditor = { open, dockable: true, close: () => session.detach(), _state: () => E, _placeGroup: placeGroup, _groupSpan: groupSpan, _rows: () => selRowRange(), _scr: (b: any) => scr(b), _lay: () => lay() };
})();
