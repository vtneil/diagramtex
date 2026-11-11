// Bit fields (js/bytefield.js): bytefield code read into items that keep their text, drawn to the package's
// measurements (bytefield.sty 2.9 under pdflatex, 10pt), exported unchanged and read back on import.
const BF = TD.bytefield;
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const bf = (src) => ({ type: 'bytefield', x: 0, y: 0, src, color: '#000000' });
const L = (src) => BF.layout(bf(src));
const doc = (body) => `\\documentclass{article}\n\\usepackage{bytefield}\n\\usepackage{xcolor}\n\\begin{document}\n${body}\n\\end{document}\n`;

const HAND = `\\bytefieldsetup{bitwidth=1.5em}
\\begin{bytefield}[endianness=big]{16} % a register
  \\bitheader{0-15} \\\\
  \\bitbox{4}{Op}&\\bitbox[lrt]{4}{Rd}   & \\bitbox{8}[bgcolor=lightgray]{Imm} \\\\[2pt]
  % the next word
  \\begin{leftwordgroup}{Body}
    \\wordbox{2}{Payload \\\\ (two words)}
  \\end{leftwordgroup}
\\end{bytefield}`;

T.test('bytefield: hand-written code comes back exactly, and an edit rewrites only what it touched', () => {
  for (const src of [TD.BYTEFIELD_DEFAULT, HAND]) T.eq(BF.write(BF.parse(src)), src, 'unchanged');
  const M = BF.parse(HAND);
  T.eq(M.head.bits, '16'); T.eq(M.head.opts, 'endianness=big');
  T.ok(/bytefieldsetup/.test(M.pre), 'the setup before the environment is kept');
  const boxes = M.items.filter((it) => it.k === 'bitbox');
  T.eq(boxes.length, 3); T.eq(boxes[1].sides, 'lrt'); T.eq(boxes[2].opts, 'bgcolor=lightgray');
  T.ok(M.items.some((it) => it.k === 'br' && it.len === '2pt'), '\\\\[2pt]');
  boxes[0].text = 'Opcode'; boxes[0].dirty = true;
  const out = BF.write(M);
  T.eq(out, HAND.replace('\\bitbox{4}{Op}', '\\bitbox{4}{Opcode}'), 'only that box changes:\n' + out);
});

T.test('bytefield: version 1 word groups are read as the version 2 environments and written as them', () => {
  const src = '\\begin{bytefield}{16}\n  \\wordgroupr{Head}\n  \\wordbox{1}{A}\n  \\endwordgroupr \\\\\n  \\wordbox{1}{B}\n\\end{bytefield}';
  const Lo = L(src);
  T.eq(Lo.groups.length, 1, 'a group');
  T.ok(Lo.warnings.some((w) => /version 1/.test(w)), 'warned');
  const out = BF.exportCode(src);
  T.ok(/\\begin\{rightwordgroup\}\{Head\}/.test(out) && /\\end\{rightwordgroup\}/.test(out) && !/wordgroupr/.test(out), out);
});

T.test('bytefield: sizes match the package (bits, rows, skipped words, the bit header above its row)', () => {
  // 16 bits of 8.82pt; header 3.22 + bit box 17.22 + wordbox{2} 34.44 + skippedwords 32.13 + wordbox 17.22 = 104.24
  const Lo = L('\\begin{bytefield}{16}\n\\bitheader{0-15} \\\\\n\\bitbox{8}{a} & \\bitbox{8}{b} \\\\\n\\wordbox{2}{c} \\\\\n\\skippedwords \\\\\n\\wordbox{1}{d}\n\\end{bytefield}');
  near(Lo.pt.w, 141.11, 0.05, 'width');
  near(Lo.pt.h, 104.24, 0.1, 'height');
  T.eq(Lo.warnings.length, 0, Lo.warnings.join('; '));
  near(L('\\begin{bytefield}{16}\\skippedwords\\end{bytefield}').pt.h, 32.13, 0.05, 'skipped words alone');
  // two bit headers: the second is 3.22 high, 11pt below the first's baseline
  near(L('\\begin{bytefield}{16}\\bitheader{0-15}\\\\\\bitheader{0-15}\\end{bytefield}').pt.h, 14.22, 0.05, 'two headers');
  // bitwidth and bitheight
  const W = L('\\begin{bytefield}[bitwidth=1em, bitheight=20pt]{8}\\bitbox{8}{x}\\end{bytefield}');
  near(W.pt.w, 80, 0.01, 'bitwidth=1em'); near(W.pt.h, 20, 0.01, 'bitheight=20pt');
});

T.test('bytefield: word groups take the room the package gives them', () => {
  // a right group: 1ex, the brace TeX picks (with its null delimiter), 0.5ex, the label
  const lw = (t) => L(`\\begin{bytefield}{16}\\begin{rightwordgroup}{${t}}\\wordbox{1}{}\\end{rightwordgroup}\\end{bytefield}`).pt.w - 141.11;
  const lab = lw('Hdr') - 4.30554 - 7.87 - 2.15277; // 16.97pt in Computer Modern
  near(lab, 16.97, 2, 'label width');
  const one = L('\\begin{bytefield}{16}\\begin{rightwordgroup}{Hdr}\\wordbox{1}{}\\end{rightwordgroup}\\end{bytefield}');
  const two = L('\\begin{bytefield}{16}\\begin{rightwordgroup}{Hdr}\\wordbox{2}{}\\end{rightwordgroup}\\end{bytefield}');
  near(two.pt.w - one.pt.w, 174.63 - 172.41, 0.05, 'a taller brace is wider');
  near(BF.brace(17.22 - 5).w, 6.67, 0.01, 'one row: the 18pt brace');
  // a left group is drawn at the end, to the left of the boxes, in the room the row after its \\ makes
  const lg = L('\\begin{bytefield}{16}\\begin{leftwordgroup}{Left}\\wordbox{1}{a}\\\\\\wordbox{1}{b}\\end{leftwordgroup}\\end{bytefield}');
  T.eq(lg.groups.length, 1); T.eq(lg.groups[0].side, 'l');
  T.ok(lg.cols[0] > 0, 'room on the left');
  T.ok(lg.groups[0].x >= -0.5, 'inside the box: ' + lg.groups[0].x);
  // a one-row left group makes no room: its label hangs out to the left
  const lg1 = L('\\begin{bytefield}{16}\\begin{leftwordgroup}{Left}\\wordbox{1}{a}\\end{leftwordgroup}\\end{bytefield}');
  near(lg1.pt.w, 141.11, 0.05, 'no extra width'); T.ok(lg1.bb.x < -10, 'its label sticks out');
  // nested groups each get a brace
  T.eq(L('\\begin{bytefield}{8}\\begin{rightwordgroup}{A}\\begin{rightwordgroup}{B}\\wordbox{1}{}\\end{rightwordgroup}\\\\\\wordbox{1}{}\\end{rightwordgroup}\\end{bytefield}').groups.length, 2, 'nested');
});

T.test('bytefield: a word group label over several lines, bare or in \\parbox, tabular or \\shortstack', () => {
  // widths of the whole field, measured with pdflatex (\wd of the bytefield box)
  const W = (lab) => L(`\\begin{bytefield}{16}\\begin{rightwordgroup}{${lab}}\\wordbox{3}{x}\\end{rightwordgroup}\\end{bytefield}`);
  const two = 'Header\\\\(20 bytes)';
  for (const [lab, w] of [
    [`Header \\\\ (20 bytes)`, 201.61],
    [`\\parbox{6em}{\\raggedright ${two}}`, 217.66], // the parbox's width, not its text's
    [`\\begin{tabular}{@{}l@{}}${two}\\end{tabular}`, 201.61],
    [`\\shortstack[l]{${two}}`, 201.61],
    [`\\begin{tabular}{c}${two}\\end{tabular}`, 213.61], // \tabcolsep at each end
    ['\\parbox{4em}{\\centering A long header label}', 197.66],
  ]) {
    const Lo = W(lab);
    near(Lo.pt.w, w, 1, lab);
    const t = Lo.texts.find((x) => x.label);
    T.ok(t && !/\\(parbox|shortstack|begin|end)/.test(t.t), 'no command shown: ' + (t && t.t));
  }
  T.eq(W(two).texts.find((x) => x.label).t.split('\n').length, 2, 'two lines');
  T.eq(W(`\\shortstack{${two}}`).texts.find((x) => x.label).st.align, 'center', '\\shortstack centres by default');
  T.eq(W('\\parbox{4em}{\\centering A long header label}').texts.find((x) => x.label).st.align, 'center', '\\centering in a \\parbox');
});

T.test('bytefield: the bit header numbers by endianness and lsb; borders and \\bitboxes*', () => {
  const pos = (opt) => L(`\\begin{bytefield}${opt}{8}\\bitheader{0,7}\\end{bytefield}`).marks.map((m) => [m.v, Math.round(m.x / (BF.BITWIDTH / TD.PT_PER_PX))]);
  T.eq(JSON.stringify(pos('')), '[[0,0],[7,7]]', 'little endian: 0 at the left');
  T.eq(JSON.stringify(pos('[endianness=big]')), '[[0,7],[7,0]]', 'big endian: 0 at the right');
  T.eq(JSON.stringify(pos('[lsb=4]')), '[[0,-4],[7,3]]', 'lsb shifts the numbers');
  T.eq(BF.headerNums('0-3,8').join(','), '0,1,2,3,8');
  const s = BF.sides('lrB'); T.ok(s.l && s.r && !s.t && !s.b, 'lr, B off');
  T.ok(BF.sides(null).t, 'all four by default');
  const st = L('\\begin{bytefield}{4}\\bitboxes*{1}{01{10}x}\\end{bytefield}');
  T.eq(st.boxes.length, 4, 'one box per token');
  // the starred form draws only the outer verticals: 2 verticals + 4 tops + 4 bottoms
  T.eq(st.lines.filter((l) => typeof l === 'string').length, 10, 'outer lines only');
});

T.test('bytefield: fills, rotated text and the manual\'s \\color{…}\\rule{\\width}{\\height}', () => {
  const Lo = L('\\begin{bytefield}{16}\\bitbox{8}[bgcolor=yellow]{a} & \\bitbox{8}{\\color{lightgray}\\rule{\\width}{\\height}}\\\\\\bitbox{16}{\\rotatebox{90}{r}}\\end{bytefield}');
  T.eq(Lo.fills.length, 2, 'two fills');
  T.eq(Lo.fills[1].c, 'lightgray');
  T.ok(Lo.texts.some((t) => t.rot === 90), 'rotated');
  const svg = BF.draw(bf(TD.BYTEFIELD_DEFAULT), { export: true });
  T.ok(/<path/.test(svg) && /Version/.test(svg), 'draws');
});

T.test('bytefield: the export writes the code in a node with the package; import reads it back', () => {
  const s = T.make('bytefield');
  T.eq(s.src, TD.BYTEFIELD_DEFAULT);
  const out = TD.toTikz([s], { standalone: true });
  T.ok(/\\usepackage\{bytefield\}/.test(out), 'package:\n' + out);
  T.ok(out.includes(TD.BYTEFIELD_DEFAULT.split('\n').join('\n  ')), 'the code as written, indented with the picture:\n' + out);
  T.tex('bytefield-default', out);
  // a figure with a bare environment becomes a bit field block, its code kept
  const back = TD.importLatex(doc(`\\begin{figure}\n${HAND}\n\\end{figure}`)).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'bytefield');
  T.eq(back.length, 1, 'one bit field');
  T.eq(back[0].src, HAND, 'its code, \\bytefieldsetup included');
  // and the exported picture comes back the same, in the same place
  s.x = 120; s.y = 80;
  const again = TD.importLatex(TD.toTikz([s], { standalone: true })).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'bytefield');
  T.eq(again.length, 1, 'read from the picture');
  T.eq(again[0].src, s.src, 'same code');
  near(again[0].x, s.x, 0.5, 'x'); near(again[0].y, s.y, 0.5, 'y');
});

T.test('bytefield: features compile with pdflatex', () => {
  const s = T.make('bytefield');
  s.src = HAND + '';
  const t = T.make('bytefield', { set: { x: 0, y: 300 } });
  t.src = '\\begin{bytefield}[bitwidth=auto, bitformatting=\\small\\bfseries]{8}\n  \\bitheader[endianness=big]{0-7} \\\\\n  \\begin{rightwordgroup}[rightcurly=., labelspace=1em]{Flags}\n    \\bitboxes*{1}{01x1z0{10}1}\n  \\end{rightwordgroup} \\\\\n  \\wordbox[lrt]{1}{Data} \\\\\n  \\skippedwords[3ex] \\\\\n  \\wordbox[lrb]{1}{}\n\\end{bytefield}';
  T.eq(L(t.src).warnings.length, 0, L(t.src).warnings.join('; '));
  T.tex('bytefield-features', TD.toTikz([s, t], { standalone: true }));
});

T.test('bytefield: a word group\'s brace handles move its first and last row, and groups stay nested', () => {
  const ED = TD.bytefieldEditor;
  const src = '\\begin{bytefield}{16}\n  \\bitheader{0-15} \\\\\n  \\begin{rightwordgroup}{Outer}\n    \\begin{rightwordgroup}{Inner}\n      \\bitbox{16}{A}\n    \\end{rightwordgroup} \\\\\n    \\bitbox{16}{B}\n  \\end{rightwordgroup} \\\\\n  \\begin{leftwordgroup}{Side}\n    \\bitbox{16}{C} \\\\\n    \\bitbox{16}{D}\n  \\end{leftwordgroup}\n\\end{bytefield}';
  const M = BF.parse(src), it = M.items, gb = it.filter((x) => x.k === 'gbeg'), ge = it.filter((x) => x.k === 'gend');
  const [outer, inner, side] = gb, [innerE, outerE, sideE] = ge;
  T.eq(ED._groupSpan(it, outer, outerE), [1, 2], 'Outer covers rows 1–2');
  T.eq(ED._groupSpan(it, inner, innerE), [1, 1], 'Inner covers row 1');
  // the inner group's end down a row: still inside Outer, which ends on that row too
  let t = ED._placeGroup(it, inner, innerE, 1, 2);
  T.ok(t, 'Inner can take row 2');
  T.eq(ED._groupSpan(t, inner, innerE), [1, 2]); T.eq(ED._groupSpan(t, outer, outerE), [1, 2]);
  T.ok(t.indexOf(innerE) < t.indexOf(outerE), 'Inner still ends first');
  M.items = t; M.dirty = true;
  T.eq(L(BF.write(M)).warnings.length, 0, 'clean code');
  // past Outer's end: Inner now begins first and holds Outer
  t = ED._placeGroup(it, inner, innerE, 1, 3);
  T.ok(t && t.indexOf(inner) < t.indexOf(outer) && t.indexOf(outerE) < t.indexOf(innerE), 'Inner wraps Outer');
  // a group can't cross one on its side: with Side on the right, rows 2–4 would cross Outer (rows 1–2)
  const X = BF.parse(src.replace('\\begin{leftwordgroup}{Side}', '\\begin{rightwordgroup}{Side}').replace('\\end{leftwordgroup}', '\\end{rightwordgroup}'));
  const xb = X.items.filter((x) => x.k === 'gbeg'), xe = X.items.filter((x) => x.k === 'gend');
  T.eq(ED._placeGroup(X.items, xb[2], xe[2], 2, 4), null, 'Side would cross Outer');
  // Outer over row 3 too: Side is on the other side, so that's fine
  t = ED._placeGroup(it, outer, outerE, 1, 3);
  T.ok(t, 'Outer can take row 3'); T.eq(ED._groupSpan(t, outer, outerE), [1, 3]); T.eq(ED._groupSpan(t, side, sideE), [3, 4]);
  // Side starts a row earlier; its code is drawn with both groups' labels
  t = ED._placeGroup(it, side, sideE, 2, 4);
  T.ok(t, 'Side can start at row 2'); T.eq(ED._groupSpan(t, side, sideE), [2, 4]);
  M.items = t;
  const L2 = L(BF.write(M));
  T.eq(L2.warnings.length, 0, L2.warnings.join('; '));
  T.eq(L2.groups.length, 3);
  // evenly indented code stays so; code laid out by hand keeps its layout
  const one = '\\begin{bytefield}{16}\n  \\begin{rightwordgroup}{H}\n    \\bitbox{16}{A}\n  \\end{rightwordgroup} \\\\\n  \\bitbox{16}{B}\n\\end{bytefield}';
  for (const [code, want] of [
    [one, '\\begin{bytefield}{16}\n  \\begin{rightwordgroup}{H}\n    \\bitbox{16}{A} \\\\\n    \\bitbox{16}{B}\n  \\end{rightwordgroup}\n\\end{bytefield}'],
    [one.replace('    \\bitbox{16}{A}', ' \\bitbox{16}{A}'), '\\begin{bytefield}{16}\n  \\begin{rightwordgroup}{H}\n \\bitbox{16}{A} \\\\\n  \\bitbox{16}{B}\n  \\end{rightwordgroup}\n\\end{bytefield}'],
  ]) {
    const N = BF.parse(code), b = N.items.find((x) => x.k === 'gbeg'), e = N.items.find((x) => x.k === 'gend');
    N.items = ED._placeGroup(N.items, b, e, 0, 1);
    T.eq(BF.write(N), want);
  }
  // the handles sit on the brace: between the fields and the label
  for (const g of L2.groups) T.ok(g.side === 'r' ? g.cx > g.x && g.cx < g.lx : g.cx > g.x && g.cx < g.x + g.w, `${g.side} brace centre`);
});

T.test('bytefield editor: ⌘A selects every row with fields; dragging from a field selects the rows it crosses', async () => {
  const ED = TD.bytefieldEditor;
  const src = '\\begin{bytefield}{16}\n  \\bitheader{0-15} \\\\\n  \\bitbox{8}{A} & \\bitbox{8}{B} \\\\\n  \\wordbox{2}{C} \\\\\n  \\bitbox{16}{D} \\\\\n  \\bitbox{16}{E}\n\\end{bytefield}';
  let got = null;
  ED.open(bf(src), (r) => { got = r; });
  await new Promise((r) => setTimeout(r, 50));
  const E = ED._state(), svg = document.querySelector('#bfModal .bf-svg'), R = svg.getBoundingClientRect();
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...o }));
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const mid = (txt) => { const it = E.M.items.findIndex((x) => x.text === txt), q = ED._scr(ED._lay().boxes.find((b) => b.ii === it)); return [q.x + q.w / 2, q.y + q.h / 2]; };
  try {
    key('a');
    T.eq(ED._rows(), [1, 4], '⌘A: rows 1–4, the header row left out');
    T.eq(E.M.items[E.sel.ii].text, 'A', 'anchored on the first field');
    // a press that moves under 3px is a click: one field
    let [x, y] = mid('B');
    ev('pointerdown', x, y); ev('pointermove', x + 2, y + 1); ev('pointerup', x + 2, y + 1);
    T.eq(E.sel.to, undefined, 'a click selects one field'); T.eq(E.M.items[E.sel.ii].text, 'B'); T.eq(ED._rows(), [1, 1]);
    // dragging from B down over D: rows 1–3
    const [, yd] = mid('D');
    E.lastPress = null; // a second press here would be a double-click
    ev('pointerdown', x, y); ev('pointermove', x, y + 10); ev('pointermove', x, yd); ev('pointerup', x, yd);
    T.eq(ED._rows(), [1, 3], 'the drag covers rows 1–3');
    // and up past the top stops at the first row with fields
    [x, y] = mid('E');
    ev('pointerdown', x, y); ev('pointermove', x, y - 10); ev('pointermove', x, -50); ev('pointerup', x, -50);
    T.eq(ED._rows(), [1, 4], 'dragged up from E');
    // a right-click inside the range keeps it, and offers to delete its rows
    const [xd, yd2] = mid('D');
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: R.left + xd, clientY: R.top + yd2 }));
    T.eq(ED._rows(), [1, 4], 'the range stays');
    T.ok(/Delete 4 Rows/.test(document.querySelector('#bfModal .ctx').textContent), 'the menu deletes the rows');
    T.ok(/Delete 4 Rows/.test(document.querySelector('#bfModal .cz-props').textContent), 'so does the panel');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.eq(ED._rows(), [1, 4], 'Esc closes the menu, the range stays');
    // ⌫ deletes the rows of a range, as one undo step
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    T.ok(!/bitbox|wordbox/.test(TD.bytefield.write(E.M)), 'rows gone:\n' + TD.bytefield.write(E.M));
    T.ok(/\\bitheader/.test(TD.bytefield.write(E.M)), 'the header stays');
    key('z');
    T.eq(document.querySelector('#bfModal .cz-code textarea').value, src, 'undo brings them back');
    // ⌘A in the code pane is the text's own
    const ta = document.querySelector('#bfModal .cz-code textarea');
    ta.focus(); E.sel = null;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }));
    T.eq(E.sel, null, 'not while typing'); ta.blur();
    // a double press on a field edits its label in place (draw() on pointerdown eats the native dblclick)
    [x, y] = mid('D');
    E.lastPress = null;
    ev('pointerdown', x, y); ev('pointerup', x, y); ev('pointerdown', x, y); ev('pointerup', x, y);
    const pop = document.querySelector('.td-pop-ta');
    T.ok(pop && pop.offsetParent !== null, 'the label editor opens');
    T.eq(pop.value, 'D', 'holding the label');
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } finally {
    key('Enter');
  }
  T.eq(got, null, 'nothing changed, nothing saved');
});
