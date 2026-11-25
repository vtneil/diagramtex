// tikz-timing tables drawn as the package draws them (src/domain/timing.ts): the table's options (scale, units, fonts,
// rowdist and coldist with units, wscale, line widths), blank rows, an initial [C], row names' fonts, and the extra
// code's layers, scopes, nodes, \foreach, \tablerules and \tableheader. The numbers are pdfLaTeX's (TeX Live,
// tikz-timing 0.7f): \pgfpointanchor of the rows, names and nodes, in pt in the picture's coordinates.
{
  const K = TD.PT_PER_PX, PT = 1 / K;
  const near = (a, b, msg, eps = 0.02) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const lay = (src) => TD.timing.layout({ src });
  const label = (L, r) => L.texts.find((t) => t.row === r);
  // a name's right edge and baseline (pt, picture's y up): its text box ends there
  const right = (L, t) => (t.x + (t.b.w - 2) / 2) * K;

  T.test('timing parity: timing/xunit and yunit (bare numbers are pt) set both the picture and the rows', () => {
    const L = lay('\\begin{tikztimingtable}[timing/xunit=30,timing/yunit=30]\nClock & 4{c} \\\\\nSignal & z4D{Text}z \\\\\n\\end{tikztimingtable}');
    near(L.G.X, 30, 'picture x'); near(L.G.RX, 30, 'row x'); near(L.G.RY, 30, 'row y');
    near(L.G.rd, 60, 'rows 2 units apart'); near(right(L, label(L, 0)), -30, 'names end 1 unit left');
    T.eq(L.warnings.filter((w) => /table option/.test(w)), [], 'no table option left out');
  });

  T.test('timing parity: font=\\tiny sets the rows\' units (1.6ex of 5pt sans), not the picture\'s', () => {
    const L = lay('\\begin{tikztimingtable}[font=\\tiny]\nAb & 4H \\\\\n\\end{tikztimingtable}');
    // measured: row1.high end (14.222, 3.556), label1.base east (-7.111, 0), its strut 4.2pt up and 1.8pt down
    near(4 * L.G.RX, 14.222, 'four periods'); near(L.G.RY, 3.556, 'a signal\'s height');
    near(right(L, label(L, 0)), -7.111, 'the name ends where the picture\'s units put it');
    near(label(L, 0).st.size * K, 5, 'the name at \\tiny');
  });

  T.test('timing parity: a timing/.style of the table\'s own gives the rows x and y; x= only the picture\'s; rowdist=3ex is 13.33pt', () => {
    const L = lay('\\begin{tikztimingtable}[timing/.style={x=3ex,y=2ex}, x=2ex, timing/rowdist=3ex]\nA & 4H \\\\\nB & 4L \\\\\n\\end{tikztimingtable}');
    near(L.G.RX, 13.333, 'rows: 3ex'); near(L.G.RY, 8.889, 'rows: 2ex'); near(L.G.X, 8.889, 'picture: x=2ex');
    near(L.G.rd, 13.333, 'rowdist 3ex of the table\'s sans'); near(right(L, label(L, 0)), -8.889, 'names 1 picture unit left');
    near(L.rows[1].oy, -13.333, 'the second row');
  });

  T.test('timing parity: scale scales the coordinates, not the names or the line width; semithick and line width', () => {
    const L = lay('\\begin{tikztimingtable}[scale=2,timing/rowdist=3ex,semithick]\nAb & 4H \\\\\nCd & 4L \\\\\n\\end{tikztimingtable}');
    near(L.G.sx, 2, 'x scale'); near(L.G.rlw, 0.6, 'semithick rows');
    // label2.base east (-7.111, -13.333) in the picture: on the page twice that; the name's size is unchanged
    near(right(L, label(L, 1)), -14.222, 'name 2 ends at 2 × 7.111pt');
    near(label(L, 1).st.size * K, 10, 'names stay 10pt');
    const top = Math.min(...L.rows[0].R.lines.flatMap((l) => l.pts.map((p) => p[1])));
    T.ok(top === 0 || top === 1, 'rows drawn in their own units');
    near(lay('\\begin{tikztimingtable}[line width=.5]\nA & H \\\\\n\\end{tikztimingtable}').G.rlw, 0.5, 'line width=.5 is 0.5pt');
  });

  T.test('timing parity: timing/wscale stretches every width (2{C} l with wscale=3 ends at 53.33pt)', () => {
    const L = lay('\\begin{tikztimingtable}[timing/wscale=3]\nA & 2{C} l \\\\\n\\end{tikztimingtable}');
    near(L.rows[0].R.end * L.G.RX, 53.333, 'row1.high end');
  });

  T.test('timing parity: a blank \\\\ row takes its place; [C] starts high, rising at 0', () => {
    const L = lay('\\begin{tikztimingtable}\n\\\\\nA & [C]CC \\\\\n\\\\\nB & CC \\\\\n\\end{tikztimingtable}');
    T.eq(L.M.rows.length, 4, 'four rows');
    near(L.rows[1].oy, -14.222, 'row2.low start'); near(L.rows[3].oy, -42.667, 'row4.low start');
    near(right(L, label(L, 3)), -7.111, 'label4.base east x');
    const a = L.rows[1].R, b = L.rows[3].R;
    T.eq(a.spans.map((s) => s.c), ['H', 'L'], '[C]CC: high, then low');
    T.eq(b.spans.map((s) => s.c), ['L', 'H'], 'CC: low, then high');
    T.eq(a.lines[0].pts.slice(0, 2), [[0, 0], [0, 1]], 'the first clock edge rises at 0');
  });

  T.test('timing parity: a row name\'s size, family and colour switches, \\textnormal, \\makebox', () => {
    const L = lay('\\begin{tikztimingtable}\n\\tiny Ab & 4H \\\\\n\\textnormal{Ab} & 4H \\\\\n\\color{red}\\small Cd & 4H \\\\\n\\makebox[5ex]{Ef} & 4H \\\\\n\\end{tikztimingtable}');
    T.eq(label(L, 0).t, 'Ab', 'the switch is not drawn'); near(label(L, 0).st.size * K, 5, '\\tiny');
    T.eq(label(L, 1).st.font, 'cmr', '\\textnormal is roman');
    near(label(L, 2).st.size * K, 9, '\\small'); T.ok(label(L, 2).color, 'coloured');
    // \makebox[5ex]: 22.22pt of sans wide, the text centred in it
    near(label(L, 3).x * K, -7.111 - 22.222 / 2, 'centred in its box', 0.05);
  });

  T.test('timing parity: lines inside layers and scopes are drawn, with the scopes\' styles; \\tablegrid step', () => {
    const L = lay(String.raw`\begin{tikztimingtable}
A & 4H \\
\extracode
\makeatletter
\begin{pgfonlayer}{background}
\begin{scope}[gray,semitransparent,semithick]
\vertlines[dashed]{1,3}
\end{scope}
\end{pgfonlayer}
\tablegrid[step=1]
\end{tikztimingtable}`);
    T.eq(L.warnings, [], 'nothing left out: ' + L.warnings.join('; '));
    const v = L.extra.filter((e) => e.k === 'line');
    T.eq(v.length, 2, 'two lines');
    T.ok(v[0].back, 'on the background layer');
    near(v[0].st.width * K, 0.6, 'semithick from the scope'); near(v[0].st.opacity, 0.5, 'semitransparent'); T.eq(v[0].st.dash, 'dashed', 'its own dashes');
    near(v[1].x, 3, 'at 3');
    // vertlines: from 1.5 units over the first row to half a unit under the last
    const m = /M(-?[\d.]+),(-?[\d.]+)V(-?[\d.]+)/.exec(v[0].d);
    near(+m[2] * K, -10.667, 'top', 0.05); near(+m[3] * K, 3.556, 'bottom', 0.05);
    const g = L.extra.find((e) => e.k === 'grid');
    T.eq((g.d.match(/V/g) || []).length, 5, 'step=1: five vertical lines over 4 periods');
  });

  T.test('timing parity: \\tablerules and \\tableheader where tikz-timing puts them', () => {
    const rules = (L) => L.extra.filter((e) => e.k === 'line').map((e) => { const m = /M(-?[\d.]+),(-?[\d.]+)H(-?[\d.]+)/.exec(e.d); return { x1: +m[1] * K, y: -m[2] * K, x2: +m[3] * K, w: e.st.width * K }; });
    // measured: the bounding box (-18.944, 8.4)-(28.445, -3.6) before; the rules 6pt beyond it, 0.8pt thick
    const A = rules(lay('\\begin{tikztimingtable}\nAb & 4H \\\\\n\\extracode\n\\tablerules\n\\end{tikztimingtable}'));
    T.eq(A.length, 2, 'two rules');
    near(A[0].y, -7.111, 'under the last row'); near(A[1].y, 14.222, 'over the first'); near(A[0].w, 0.8, '0.08em');
    near(A[0].x2, 34.445, 'right', 0.05);
    T.ok(Math.abs(A[0].x1 - -24.944) < 0.6, `left (the name's measured width): ${A[0].x1}`);
    const L = lay('\\begin{tikztimingtable}\nAb & 4H \\\\\nCd & 4L \\\\\n\\extracode\n\\tableheader{Name}{Signal}\\tablerules\n\\end{tikztimingtable}');
    const B = rules(L);
    T.eq(B.length, 3, 'bottom, header and mid rules');
    [-21.333, 35.556, 14.222].forEach((y, k) => near(B[k].y, y, 'rule ' + k));
    near(B[2].w, 0.5, 'the mid rule 0.05em');
    const name = L.texts.find((t) => t.t === 'Name'), sig = L.texts.find((t) => t.t === 'Signal');
    near(right(L, name), -7.111, 'label header ends at the names\' right');
    near((sig.x - (sig.b.w - 2) / 2) * K, 0, 'row header starts at the rows\' left');
  });

  T.test('timing parity: \\node at a row\'s anchor and \\foreach of nodes; the text is not scaled', () => {
    const L = lay(String.raw`\begin{tikztimingtable}[scale=2]
A & 4H \\
\extracode
\node[anchor=east] at (row1.north west) {\tiny +5V};
\foreach [count=\x] \b in {0,1} {
  \node[below,font=\tiny] at (\x-.5,-1.5) {\b};
}
\end{tikztimingtable}`);
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    const v = L.texts.find((t) => t.t === '+5V');
    // its east anchor at (0, 7.111) of the picture: on the page (0, 14.222); inner sep .3333em, outer sep 0.333pt
    near(right(L, v), -3.667, 'ends 3.667pt left of the rows');
    near(v.st.size * K, 5, '\\tiny');
    const bits = L.texts.filter((t) => t.t === '0' || t.t === '1');
    T.eq(bits.length, 2, 'one node per value');
    near(bits[0].x * K, 2 * 0.5 * 7.111, 'the first under the first period'); near(bits[1].x * K, 2 * 1.5 * 7.111, 'the second');
  });

  T.test('timing parity: the visual editor keeps drawing in the stock units', () => {
    const src = '\\begin{tikztimingtable}[scale=2, timing/wscale=3]\nA & 2H \\\\\n\\end{tikztimingtable}';
    const P = TD.timing.layout({ src, plain: true });
    near(P.G.sx, 1, 'no scale'); near(P.rows[0].R.end, 2, 'no wscale');
    near(lay(src).rows[0].R.end, 6, 'drawn with it');
  });

  // a table with the document's preamble (an import keeps it on the block) and the file's macros
  const layPre = (src, preamble) => TD.timing.layout({ src, tex: { preamble } });

  T.test('timing parity: a preamble\'s timing/.style replaces the package\'s: its x, y and line width, in the document\'s ex', () => {
    const L = layPre('\\begin{tikztimingtable}\nAB & 4{CL CH} \\\\\nCD & 2H \\\\\n\\end{tikztimingtable}',
      '\\tikzset{timing/.style={x=1ex, y=2ex, line cap=round, line join=round, line width=1.3pt}}');
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    // measured: \pgfpointxy{1}{1} (4.306, 8.611), row1.high end (68.889, 8.611), row2 at -17.222, label1.base east
    // -4.306; the rows' line 1.3pt, the picture's 0.15ex of cmr 0.6458pt
    near(L.G.X, 4.306, 'picture x'); near(L.G.Y, 8.611, 'picture y'); near(L.G.RX, 4.306, 'row x'); near(L.G.RY, 8.611, 'row y');
    near(L.rows[0].R.end * L.G.RX, 68.889, 'row1.high end'); near(L.rows[1].oy, -17.222, 'row2.low start');
    near(right(L, label(L, 0)), -4.306, 'label1.base east');
    near(L.G.rlw, 1.3, 'rows\' line width'); near(L.G.plw, 0.6458, 'the picture\'s line width', 0.002);
  });

  T.test('timing parity: a preamble\'s timing/table/.style without \\sffamily (units of cmr, 6.889pt); its own name style\'s seps', () => {
    const L = layPre('\\begin{tikztimingtable}\nAB & 2D \\\\\n\\end{tikztimingtable}',
      '\\tikzset{timing/table/.style={timing,line width=0.15ex}, timing/name/.style={font=\\ttfamily} }');
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    near(L.G.X, 6.889, 'x'); near(L.rows[0].R.end * L.G.RX, 13.778, 'row1.high end');
    // label1.base east -6.889, its text from -21.045 (10.5pt of \ttfamily AB): .3333em and half the line between
    const t = label(L, 0);
    T.eq(t.st.font, 'cmtt', 'typewriter'); near(right(L, t), -6.889 - 3.656, 'the text ends inner and outer sep before', 0.05);
  });

  T.test('timing parity: the document\'s macros are expanded (\\def\\tcMT{16}, \\newcommand{\\degr}{degr}); text width and align of names', () => {
    const L = layPre('\\begin{tikztimingtable}[timing/name/.append style={align=left, text width=1.4in}]\nAB0\\degr & \\tcMT D \\\\\n\\end{tikztimingtable}',
      '\\def\\tcMT{16}\n\\newcommand{\\degr}{degr}');
    T.eq(L.warnings, [], 'all drawn: ' + L.warnings.join('; '));
    near(L.rows[0].R.end * L.G.RX, 113.778, 'row1.high end: 16 periods');
    const t = label(L, 0);
    T.eq(t.t, 'AB0degr', 'the macro in the name');
    // label1.base west -108.289: the text at the left of a 1.4in box ending at -7.111
    near((t.x - (t.b.w - 2) / 2) * K, -108.289, 'label1.base west');
    T.ok(lay('\\begin{tikztimingtable}\nA & \\tcMT D \\\\\n\\end{tikztimingtable}').rows[0].R.end !== 16, 'without the definition it is not read as 16');
    // a \foreach variable named like a document macro is the loop's own
    const F = layPre('\\begin{tikztimingtable}\nA & 4H \\\\\n\\extracode\n\\foreach \\x in {1,3} {\\node at (\\x,0) {a};}\n\\end{tikztimingtable}', '\\def\\x{2}');
    T.eq(F.texts.filter((t) => t.t === 'a').map((t) => Math.round(t.x * K / 7.111)), [1, 3], 'nodes at the loop\'s values');
  });
  T.test('timing parity: \\foreach ranges as pgffor reads them (5,...,2 counts down; 0,2,...,5 stops at 4); the table\'s own \\nrows', () => {
    // measured: \foreach \x in {5,...,2} gives 5, 4, 3, 2 and {0,2,...,5} gives 0, 2, 4
    const L = lay(String.raw`\begin{tikztimingtable}
A & 6H \\
\extracode
\foreach \v in {5,...,2} {\node at (\v,-3) {d};}
\foreach \v in {0,2,...,5} {\node at (\v,-4) {e};}
\vertlines{1,3,...,6}
\end{tikztimingtable}`);
    const at = (s) => L.texts.filter((t) => t.t === s).map((t) => Math.round(t.x * K / L.G.X));
    T.eq(at('d'), [5, 4, 3, 2], 'counting down by 1');
    T.eq(at('e'), [0, 2, 4], 'the end only when a step lands on it');
    T.eq(L.extra.filter((e) => e.k === 'line').map((e) => e.x), [1, 3, 5], '\\vertlines{1,3,...,6}');
    T.ok(lay('\\begin{tikztimingtable}\nA & H \\\\\n\\extracode\n\\foreach \\v in {a,...,c} {\\node at (1,1) {\\v};}\n\\end{tikztimingtable}').warnings.some((w) => /foreach/.test(w)), 'a range of letters is kept as code');
    // tikz-timing defines \nrows, \slope … in the table: a document's macro of that name isn't the one read there
    const S = layPre('\\begin{tikztimingtable}\nA & H \\\\\n\\extracode\n\\vertlines{\\nrows}\n\\end{tikztimingtable}', '\\def\\slope{9}\\def\\nrows{7}');
    T.eq(S.extra.filter((e) => e.k === 'line').map((e) => e.x), [1], '\\nrows is the table\'s');
  });
}
