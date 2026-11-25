// ZX diagrams' circuit commands, \zxMatrix and long phases drawn as zx-calculus draws them (src/domain/zx.ts). The
// numbers are pdfLaTeX's (TeX Live, tikzlibraryzx-calculus 2023): \pgfpointanchor of a= aliases and of the cells
// (\zxCurrentDiagram-r-c), in pt.
{
  const K = TD.PT_PER_PX;
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const lay = (src) => TD.zxLayout({ src });
  const node = (L, r, c) => L.nodes.find((n) => n.cell && n.cell[0] === r && n.cell[1] === c);
  const gapX = (L, a, b) => (L.geo.cx[b] - L.geo.cx[a]) * K, gapY = (L, a, b) => (L.geo.cy[b] - L.geo.cy[a]) * K;

  T.test('zx parity: gates are 1.83em boxes (18.3pt) with their maths; controls, NOT and swap cross at their sizes', () => {
    const L = lay(String.raw`\begin{ZX}[circuit]
\zxN{} \rar & \zxGate{Y} \rar & \zxGate{R_z(\theta)} \rar & \zxGate{\zxMeter{}} \rar & \zxN{}\\
\zxN{} \rar & \zxCtrl{} \rar & \zxOCtrl{} \rar & \zxNot{} \rar & \zxN{}
\end{ZX}`);
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    const g = node(L, 0, 1);
    near(g.w * K, 18.3, 'Y: minimum width'); near(g.h * K, 18.3, 'and height');
    T.ok(L.texts.some((t) => t.t === '$Y$'), 'Y in maths');
    // R_z(\theta): 32.348pt between its west and east anchors (the text and 1.3mm a side)
    near(node(L, 0, 2).w * K, 32.348, 'R_z(θ)', 0.6);
    near(node(L, 0, 3).w * K, 19.181, 'the meter\'s box: 11.78pt and 1.3mm a side');
    T.ok(L.nodes.some((n) => n.shape === 'meter'), 'the meter drawn');
    near(node(L, 1, 1).w * K, 5.657, '\\zxCtrl'); T.ok(node(L, 1, 1).nostroke, 'filled, not drawn');
    near(node(L, 1, 2).w * K, 5.657, '\\zxOCtrl'); near(node(L, 1, 3).w * K, 7.071, '\\zxNot'); T.ok(node(L, 1, 3).plus, '⊕');
    // the rows' centres 24.467pt apart: the gate's 18.7pt (with its line) and the NOT's 7.47pt, 4mm between
    near(gapY(L, 0, 1), 24.467, 'rows');
    near(gapX(L, 0, 1), 20.731, 'the gate\'s column after a point');
  });

  T.test('zx parity: \\zxCross is a point with a 6pt cross; \\zxGateMulti fits round blocks of its cells', () => {
    const X = lay('\\begin{ZX}[circuit]\n\\zxN{} \\rar & \\zxCross{} \\rar & \\zxN{}\n\\end{ZX}');
    near(gapX(X, 0, 1), 14.581, 'the cross\'s cell 6.4pt wide');
    T.ok(X.nodes.some((n) => n.shape === 'cross'), 'the cross drawn');
    const L = lay(String.raw`\begin{ZX}[circuit]
  \rar & \zxGate{H} \rar & \zxGateMulti{2}{3}{H} &  & \rar & \\
  \rar & \zxGate{H} \rar &                       &  & \rar &
\end{ZX}`);
    // measured: the box from -23.891 to 54.972 (78.863pt) by 48.781pt, its columns 30.081pt apart
    const box = L.nodes.find((n) => n.shape === 'rect' && n.w * K > 70);
    T.ok(box, 'the fitted box');
    near(box.w * K, 78.863, 'its width'); near(box.h * K, 48.781, 'its height');
    near(gapX(L, 2, 3), 30.081, 'blocks of 18.7pt'); near(gapY(L, 0, 1), 30.081, 'rows too');
    const W = lay(String.raw`\begin{ZX}[circuit]
  \rar & \zxGateMulti{2}{1}{\mathrm{ABCDEFGHIJ}} \rar & \\
  \rar & \rar &
\end{ZX}`);
    const wb = W.nodes.find((n) => n.shape === 'rect');
    near(wb.w * K, 74.795, 'a wide content sets the box', 0.8);
  });

  T.test('zx parity: a box\'s label (add label) is maths at 6pt above it; slices are kept as code', () => {
    const L = lay('\\begin{ZX}[circuit]\n\\rar & \\zxGate[add label={Measure}]{H} \\rar \\zxSlice{1} & \n\\end{ZX}');
    const t = L.texts.find((x) => x.t === '$Measure$');
    T.ok(t, 'the label');
    near(t.st.size * K, 6, '6pt');
    T.ok(t.y < node(L, 0, 1).y - node(L, 0, 1).h / 2, 'above the box');
    T.ok(L.warnings.some((w) => /zxSlice/.test(w)), 'the slice is named as kept');
    T.ok(!L.texts.some((x) => /zxSlice/.test(x.t)), 'and not drawn as text');
  });

  T.test('zx parity: \\zxMatrix is a grey chevron 8pt wide, its label above (- below), * pointing west', () => {
    const L = lay('\\begin{ZX}\n\\zxN{} \\rar & \\zxMatrix{A} \\rar & \\zxN{}\n\\end{ZX}');
    T.eq(L.warnings, [], 'drawn: ' + L.warnings.join('; '));
    const m = L.nodes.find((n) => n.shape === 'zxmatrix');
    near(m.w * K, 8, 'from the tail to the point'); near(m.h * K, 6, 'minimum height 6pt');
    // measured: the cells 9.451pt apart (the label's half width with its inner sep 2pt); an empty one 8.468pt
    near(gapX(L, 0, 1), 9.451, 'beside A', 0.4);
    near(gapX(lay('\\begin{ZX}\n\\zxN{} \\rar & \\zxMatrix{} \\rar & \\zxN{}\n\\end{ZX}'), 0, 1), 8.468, 'beside an empty one');
    // the row reaches 3.2pt under the centre and 12.467pt over it (the label)
    near((L.geo.rowT[0] + L.geo.rowH[0] - L.geo.cy[0]) * K, 3.2, 'under');
    near((L.geo.cy[0] - L.geo.rowT[0]) * K, 12.467, 'over', 0.15);
    const below = lay('\\begin{ZX}\n\\zxN{} \\rar & \\zxMatrix-*{A} \\rar & \\zxN{}\n\\end{ZX}');
    const bm = below.nodes.find((n) => n.shape === 'zxmatrix'), bt = below.texts.find((x) => x.t === '$A$');
    T.ok(bm.star, 'transposed'); T.ok(bt.y > bm.y, 'the label below');
    T.ok(lay('\\begin{ZX}\n\\zxMatrix\'{G}\n\\end{ZX}').warnings.some((w) => /zxMatrix/.test(w)), 'a rotated one is kept');
  });

  T.test('zx parity: a long phase is shapes.misc\'s rounded rectangle at 0.8 (\\zxX{\\alpha+\\beta} 22.953pt)', () => {
    const L = lay('\\begin{ZX}\n\\zxN{} \\rar & \\zxX{\\alpha+\\beta} \\rar & \\zxZ{\\alpha} \\rar & \\zxN{}\n\\end{ZX}');
    const a = node(L, 0, 1), b = node(L, 0, 2);
    // TeX: 0.8 · (19.958 + 2 · 3.414 + 2 · 0.953) = 22.953pt, the text 19.958pt wide at 8pt and each end's chord
    // 0.953pt; here the text's width is the drawing's own (its 6.4pt box over 0.8)
    const t = L.texts.find((x) => /alpha\+|alpha\{\+\}/.test(x.t)), tw = (t.b.w - 2) * K / 0.8;
    near(a.w * K, 0.8 * (tw + 2 * 3.414 + 2 * 0.953), 'α+β: the text, 1.2mm a side and the ends\' chords, scaled 0.8', 0.02);
    T.ok(Math.abs(tw - 19.958) < 1.5, `the text about TeX's width: ${tw}`);
    near(a.h * K, 11.381, '4mm high');
    near(b.w * K, 11.381, 'α: the 5mm minimum, scaled 0.8');
  });

  T.test('zx parity: to= reaches a node named with a= (a gate\'s name is its whole box); the last direction word wins; a gate\'s main and main text colours', () => {
    const L = lay(String.raw`\begin{ZX}[circuit]
\zxBox{H} & \zxGateMulti[a=G]{2}{2}{U} & & \\
\zxBox{H} & & & \\
\zxBox[a=S]{H} \ar[to=G] \rar[rd] & & \\
& \zxBox[a=T]{X} & \zxGateMulti[a=O][main={fill=orange!50!white}, main text={red}]{1}{2}{H} &
\end{ZX}`);
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    // measured: S.center (-45.122, -14.841), G.center (0, 30.281), T.center (-15.041, -45.122) (y up)
    const w = L.wires.map((x) => x.segs[0]), d = (s) => [(s.p1.x - s.p0.x) * K, -(s.p1.y - s.p0.y) * K];
    const toG = w.find((s) => d(s)[1] > 20), toT = w.find((s) => d(s)[1] < -20);
    T.ok(toG && toT, 'both wires drawn');
    near(d(toG)[0], 45.122, 'to=G: across to the box\'s centre'); near(d(toG)[1], 45.122, 'and up');
    near(d(toT)[0], 30.081, '\\rar[rd]: one column right'); near(d(toT)[1], -30.281, 'and one row down');
    // O: 48.781pt × 19.1pt, filled orange!50!white, its H red
    const o = L.nodes.find((n) => n.shape === 'rect' && n.cell && n.cell[0] === 3 && n.cell[1] === 2);
    T.ok(o, 'the orange gate'); near(o.w * K, 48.781, 'its width'); near(o.h * K, 19.1, 'its height');
    T.eq(TD.parseColor(o.fill).hex, TD.parseColor(TD.tikzColor('orange!50!white')).hex, 'main={fill=…}');
    T.ok(L.texts.some((t) => t.t === '$H$' && t.color && TD.parseColor(t.color).hex === '#ff0000'), 'main text={red}');
  });

  T.test('zx parity: a \\zxGateMulti\'s label is text (its box is made after the matrix), its lines 6pt apart above the box', () => {
    const L = lay(String.raw`\begin{ZX}[circuit]
\zxGateMulti[add label={Bell \\measurement}]{2}{1}{U} & \zxN{} \\
& \zxN{}
\end{ZX}`);
    const t = L.texts.find((x) => /Bell/.test(x.t));
    T.ok(t && !/\$/.test(t.t), 'in text, not maths: ' + (t && t.t));
    // measured: G.north 24.391 above the box's centre, the picture's top 38.357: the label's baselines 32.391 and
    // 26.391 (1.8pt inner sep, 0.2pt outer sep, no depth); drawn lines are centred 0.347 × 6pt over their middle baseline
    const box = L.nodes.find((n) => n.shape === 'rect');
    T.eq(L.warnings, [], 'drawn: ' + L.warnings.join('; ')); near(box.h * K, 48.781, 'the box');
    near((box.y - t.y) * K - 0.347 * 6, 29.391, 'the middle baseline', 0.25);
  });
  T.test('zx parity: a \\zxGateMulti reaching past the diagram is named, and a huge one is laid out at once', () => {
    const t0 = Date.now();
    const L = lay('\\begin{ZX}[circuit]\n\\rar & \\zxGateMulti{99999}{99999}{U} & \\\\\n\\rar & & \n\\end{ZX}');
    T.ok(Date.now() - t0 < 2000, 'quick');
    T.ok(L.warnings.some((w) => /reaches past/.test(w)), 'named');
  });
  T.test('zx parity: tikz-cd\'s --| and |-- (connect -|) bend the wire once; a bare -| is an arrow tip, not drawn', () => {
    const L = lay('\\begin{ZX}\n\\zxZ{} \\ar[rd, --|] \\ar[rd, connect |-] & \\\\\n& \\zxX{}\n\\end{ZX}');
    T.eq(L.wires.map((w) => w.segs.length), [2, 2], 'two segments each');
    const [h, v] = L.wires.map((w) => w.segs[0]);
    T.ok(Math.abs(h.p1.y - h.p0.y) < 0.01 && h.p1.x > h.p0.x, '--|: across first');
    T.ok(Math.abs(v.p1.x - v.p0.x) < 0.01 && v.p1.y > v.p0.y, '|--: down first');
    T.ok(lay('\\begin{ZX}\n\\zxZ{} \\ar[r, -|] & \\zxX{}\n\\end{ZX}').warnings.some((w) => /-\|/.test(w)), '-| is named as not drawn');
  });
}
