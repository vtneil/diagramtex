// quantikz circuits as LaTeX draws them (src/domain/quantum.ts): a circuit whose document loads the old library
// (\usetikzlibrary{quantikz}, quantikz 0.9.8) is built and exported by that library's rules, text in a cell is the
// cell's content, a bundle's slash sits halfway along its wire, and ampersand replacement splits the cells. The
// numbers are pdfLaTeX's (TeX Live 2026): cell centres logged with \pgfpointanchor{\tikzcdmatrixname-r-c}, in pt.
{
  const QC = TD.qc, PT = 1 / TD.PT_PER_PX; // px per pt
  const qc = (src, lib) => ({ type: 'qc', x: 0, y: 0, src, size: 'normalsize', font: 'default', color: '#000000', ...(lib ? { lib } : {}) });
  const near = (a, b, msg, eps = 0.5) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const doc = (pre, body) => `\\documentclass{article}\n\\usepackage{tikz}\n${pre}\n\\begin{document}\n${body}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(TD.pasteIn.asPicture(src.body), { definitions: src.pre }).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  // the wires (k: 'wire') of a row, as [from column, to column, type, y offset in pt]
  const wiresOf = (Lo, r) => {
    const { cx, cy } = Lo.geo, col = (x) => cx.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(cx[b] - x) ? i : b), 0);
    return Lo.ops.filter((o) => o.k === 'wire' && o.y1 === o.y2 && Math.abs(o.y1 - cy[r]) < 0.2 * TD.PX_PER_CM)
      .map((o) => [col(o.x1), col(o.x2), o.t, Math.round(((cy[r] - o.y1) / PT) * 100) / 100]).sort((a, b) => a[1] - b[1] || a[3] - b[3] || a[0] - b[0]);
  };
  const OLD = String.raw`\begin{quantikz}
\lstick{a} & & \gate{H} & & \targX{} & \cdots & \meter{} \\
\lstick{b} & \qw & \ctrl{-1} & \cw & \targX{}\vqw{-1} & \qwbundle[alternate]{} & \qw \\
\lstick{c} & \qwbundle{n} & \gate[nwires=1]{U} & \qw & \octrl{-1} & \cwbend{-1} & \push{x}
\end{quantikz}`;

  T.test('quantikz parity: \\usetikzlibrary{quantikz} alone is the old library; the block keeps it and exports with it alone', () => {
    const old = shapesOf({ pre: '\\usetikzlibrary{quantikz}', body: OLD.replace('\\lstick{a}', '\\lstick{\\ket{0}}') }).find((s) => s.type === 'qc');
    T.eq(old && old.lib, 'quantikz', 'the old library');
    for (const pre of ['\\usepackage{quantikz}', '\\usetikzlibrary{quantikz2}']) T.eq(shapesOf({ pre, body: OLD }).find((s) => s.type === 'qc').lib, undefined, pre + ': quantikz2');
    // the old library and quantikz2 both define the quantikz environment: LaTeX stops when both are loaded
    const tex = TD.toTikz([{ ...old, id: 'q' }], { standalone: true });
    T.ok(/\\usetikzlibrary\{[^}]*\bquantikz\b/.test(tex) && !/quantikz2/.test(tex), 'only the old library:\n' + tex);
    // (its own \ket, as quantikz2's: not braket's, which is maths only and stops a text-mode \lstick)
    T.ok(!/braket/.test(tex), 'no braket for \\ket:\n' + tex);
    T.tex('quantikz-parity-old', tex);
    const both = TD.toTikz([{ ...old, id: 'q' }, { ...qc('\\begin{quantikz} & \\gate{H} & \\end{quantikz}'), x: 300, id: 'r' }], { standalone: true });
    T.ok(/quantikz2/.test(both) && !/\bquantikz\s*[,}]/.test(both.split('\\begin{document}')[0]), 'with a quantikz2 circuit beside it, quantikz2 alone:\n' + both);
    T.eq(TD.panels.qc.model(old).package, '\\usetikzlibrary{quantikz}', 'the panel names the library');
  });

  T.test('quantikz parity: the old library draws a wire only where a command draws one, and sizes controls and swaps as cells', () => {
    const Lo = QC.layout(qc(OLD, 'quantikz')), { cx, cy } = Lo.geo;
    // columns and rows (pdflatex): a swap's 1em circle widens its column by 5pt a side; controls are 4pt cells
    const X = [-72.475, -58.249, -35.460, -12.671, 6.556, 31.615, 62.075], Y = [25.420, -1.706, -28.349];
    // (a gate's and a text's width are the browser's measure of the text: within about a point of TeX's)
    for (let c = 1; c < X.length; c++) near((cx[c] - cx[c - 1]) / PT, X[c] - X[c - 1], `column ${c} from ${c - 1}`, 1.2);
    for (let r = 1; r < Y.length; r++) near((cy[r] - cy[r - 1]) / PT, Y[r - 1] - Y[r], `row ${r} from ${r - 1}`);
    // \qw is \arrow[arrows]{l}, and the commands that end with one; none into empty cells or text (\cdots);
    // \cw at ±0.05cm, an alternate bundle three lines at 0 and ±0.1cm, nwires=1 none into the gate
    T.eq(wiresOf(Lo, 0), [[1, 2, 'q', 0], [3, 4, 'q', 0], [5, 6, 'q', 0]], 'row a');
    T.eq(wiresOf(Lo, 1).map((w) => w.slice(0, 3).concat(w[3] && Math.abs(w[3]) > 2 ? [w[3]] : [])), [[0, 1, 'q'], [1, 2, 'q'], [2, 3, 'c'], [3, 4, 'q'], [4, 5, 'q', -2.85], [4, 5, 'q'], [4, 5, 'q', 2.85], [5, 6, 'q']], 'row b');
    T.eq(wiresOf(Lo, 2).map((w) => w.slice(0, 3)), [[0, 1, 'q'], [2, 3, 'q'], [3, 4, 'q'], [4, 5, 'c'], [5, 6, 'q']], 'row c');
    // a control: a filled 4pt circle; the bend's dot: a circle round a 4pt square (2√2pt)
    const dots = Lo.ops.filter((o) => o.k === 'dot').map((o) => Math.round(((o.r + (o.open ? 0 : Lo.look.lw / 2)) / PT) * 100) / 100).sort();
    T.eq(dots, [2, 2, 2.83], 'dot radii');
    T.ok(!Lo.warnings.length, Lo.warnings.join(' | '));
    // \arrow[arrows]{ll}: quantikz's own wire style, from this cell's border to the cell two to the left
    const L3 = QC.layout(qc('\\begin{quantikz}\n\\lstick{a} & \\gate{H} & & \\gate{X}\\arrow[arrows]{ll}\n\\end{quantikz}', 'quantikz'));
    T.eq(wiresOf(L3, 0).map((w) => w.slice(0, 3)), [[0, 1, 'q'], [1, 3, 'q'], [2, 3, 'q']], 'the arrow and the gates\' \\qw');
  });

  T.test('quantikz parity: a bundle\'s slash is halfway along its wire, 0.08cm by 0.12cm, its number by its top end', () => {
    // \qwbundle is \arrow[strike arrow={0.08cm}{0.12cm}{#2}, phantom]{l}: a mark at 0.5 between the nodes' borders
    const Lo = QC.layout(qc(String.raw`\begin{quantikz}
\lstick{a} & \gate{H} & \qwbundle{n} & \gate{XYZ} \\
\lstick{b} & & \gate{V}\qwbundle{m} &
\end{quantikz}`));
    const { cx } = Lo.geo, gates = Lo.ops.filter((o) => o.k === 'rect');
    const slash = Lo.ops.filter((o) => o.k === 'path' && /^M[\d.-]+,[\d.-]+L[\d.-]+,[\d.-]+$/.test(o.d)).map((o) => o.d.match(/-?[\d.]+/g).map(Number));
    T.eq(slash.length, 2, 'two slashes');
    const [s0, s1] = slash.sort((a, b) => a[1] - b[1]);
    const H = gates.find((g) => Math.abs(g.x + g.w / 2 - cx[1]) < 1);
    near((s0[0] + s0[2]) / 2, (H.x + H.w + cx[2]) / 2, 'between H\'s border and the empty cell', 0.05);
    near((s0[2] - s0[0]) / PT, 2 * 0.08 * 28.4528, 'width', 0.05); near((s0[1] - s0[3]) / PT, 2 * 0.12 * 28.4528, 'height', 0.05);
    const V = gates.find((g) => g.y > H.y + 5);
    near((s1[0] + s1[2]) / 2, (cx[1] + V.x) / 2, 'in a gate\'s cell: from the empty cell to the gate\'s border', 0.05);
    const n = Lo.ops.find((o) => o.k === 'text' && o.t === '$n$');
    near(n.x - (n.b.w - 2) / 2, s0[2], 'the number by its south west corner', 0.6);
  });

  T.test('quantikz parity: text in a cell is the cell\'s content; a file\'s macro of quantikz commands is read as them', () => {
    const Lo = QC.layout(qc(String.raw`\begin{quantikz}
\lstick{a} & \gate{H} & \ \ldots\ & \phantom{a}\cdots\phantom{a} & \ket{0} & |[meter]| {} \\
\lstick{b} & & \vdots & & \qw &
\end{quantikz}`));
    T.ok(!Lo.warnings.length, Lo.warnings.join(' | '));
    const texts = Lo.ops.filter((o) => o.k === 'text').map((o) => o.t);
    for (const t of ['$\\ \\ldots\\ $', '$\\phantom{a}\\cdots\\phantom{a}$', '$\\ket{0}$', '$\\vdots$']) T.ok(texts.includes(t), t + ' in ' + texts.join(' '));
    T.ok(Lo.ops.some((o) => o.k === 'rect' && Math.abs(o.w - 2 * TD.sizePx('normalsize')) < 1), '|[meter]| on an empty cell: a meter');
    // the wires stop at the text's border
    const { cx } = Lo.geo, w = Lo.ops.filter((o) => o.k === 'wire' && o.y1 === Lo.geo.cy[0]);
    T.ok(w.some((o) => o.x2 < cx[3] - 5) && !w.some((o) => o.x1 < cx[3] && o.x2 > cx[3]), 'no wire through the dots');
    // a macro the file defines, holding quantikz commands, is read as those commands (and its cell kept as written)
    const keep = TD.docMacros;
    TD.docMacros = () => '\\newcommand{\\qwtwice}[1]{\\gate{#1}\\qw}';
    try {
      const L2 = QC.layout(qc('\\begin{quantikz}\n & \\qwtwice{Y} & \n\\end{quantikz}'));
      T.ok(L2.ops.some((o) => o.k === 'text' && o.t === '$Y$') && !L2.warnings.length, 'its gate: ' + L2.warnings.join(' | '));
      T.ok(QC.cell('\\qwtwice{Y}', () => {}).expanded, 'kept as written in the editor');
    } finally { TD.docMacros = keep; }
  });

  T.test('quantikz parity: ampersand replacement=\\& splits the cells at \\&, from the environment or the preamble', () => {
    const body = '\\lstick{a} \\& \\gate{H} \\& \\qw \\\\\n\\lstick{b} \\& \\qw \\& \\qw';
    for (const src of [`\\begin{quantikz}[ampersand replacement=\\&]\n${body}\n\\end{quantikz}`, `\\begin{quantikz}\n${body}\n\\end{quantikz}`]) {
      const Lo = QC.layout(qc(src));
      T.eq([Lo.R, Lo.C], [2, 3], 'two rows of three cells');
    }
    const tex = TD.toTikz([{ ...qc(`\\begin{quantikz}[ampersand replacement=\\&]\n${body}\n\\end{quantikz}`), id: 'q' }], { standalone: true });
    T.tex('quantikz-parity-amp', tex);
  });

  T.test('quantikz parity: the libraries\' other commands are kept, not set as text; a macro\'s arguments and cells as LaTeX reads them', () => {
    // \ctrlbundle and \alias (old quantikz) and the like: listed and skipped with their arguments
    for (const [src, rest] of [['\\ctrlbundle{1}', []], ['\\alias{x}\\gate{H}', ['gate']], ['\\vqwexplicitcenter{1-2}{2-2}\\qw', ['qw']]]) {
      const w = [], items = QC.cell(src, (x) => w.push(x));
      T.eq(items.map((it) => it.name), rest, src);
      T.ok(w.length === 1 && /kept in the code/.test(w[0]), src + ': ' + w.join(' | '));
    }
    const keep = TD.docMacros;
    // \newcommand{\foo}[2]{\gate{#1}} takes both groups (#2 unused); a macro holding & makes cells: listed, not drawn
    TD.docMacros = () => '\\newcommand{\\foo}[2]{\\gate{#1}}\n\\newcommand{\\two}{\\qw & \\qw}';
    try {
      T.eq(QC.cell('\\foo{A}{B}', () => {}).map((it) => [it.name, it.a[0]]), [['gate', 'A']], 'both arguments');
      const w = [];
      T.eq(QC.cell('\\two', (x) => w.push(x)).length, 0, 'nothing drawn for \\two');
      T.ok(/holds &/.test(w[0] || ''), w.join(' | '));
    } finally { TD.docMacros = keep; }
    // old \qwbundle[alternate=0]: \helper 0, so the slash and \qw, not three wires
    const Lo = QC.layout(qc('\\begin{quantikz}\n\\lstick{a} & \\qwbundle[alternate=0]{n} & \\qw\n\\end{quantikz}', 'quantikz'));
    T.eq(wiresOf(Lo, 0).map((w) => w.slice(0, 3)), [[0, 1, 'q'], [1, 2, 'q']], 'one wire into the bundle\'s cell');
    T.ok(Lo.ops.some((o) => o.k === 'text' && o.t === '$n$'), 'its number');
  });
}
