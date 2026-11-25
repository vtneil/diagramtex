// Importer additions for block libraries' pictures: function plots (plot (\x, {f(\x)}) sampled as TikZ samples them),
// tikz-3dplot's frames and points (\tdplotsetmaincoords, \tdplotsetrotatedcoords, \tdplotsetcoord), a \graph in a
// picture with more in it (a Graph block, its names for the rest), and tikz-cd's execute at end picture code.
{
  const doc = (body, { opts = '', pre = '', libs = '', before = '' } = {}) => `\\documentclass{article}\n\\usepackage{tikz}\n${libs}\n${pre}\\begin{document}\n${before}\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));
  const CM = TD.PX_PER_CM;
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

  T.test('import plots: a function plot is a line through TikZ\'s samples (domain and samples on the plot or its path)', () => {
    const sh = shapesOf(doc(String.raw`\draw[domain=0:2, samples=5] plot (\x, {\x*\x});
\draw plot[variable=\t, domain=0:90, samples=4, smooth] ({cos(\t)}, {sin(\t)});
\draw plot (\x, 1);`));
    T.eq(kept(sh), [], 'nothing kept');
    const [a, b, c] = sh.filter((s) => s.type === 'poly');
    T.eq(a.pts.length, 5, 'five samples');
    near(a.pts[2][0], 1 * CM, 'x at the middle sample'); near(a.pts[2][1], -1 * CM, 'y = x²');
    near(a.pts[4][1], -4 * CM, 'the last');
    T.ok(b.smooth && b.pts.length === 4, 'smooth, four samples');
    near(b.pts[3][0], 0, 'cos 90°'); near(b.pts[3][1], -1 * CM, 'sin 90°');
    T.eq(c.pts.length, 25, 'TikZ\'s 25 samples'); near(c.pts[0][0], -5 * CM, 'from -5'); near(c.pts[24][0], 5 * CM, 'to 5');
  });

  T.test('import tikz-3dplot: the main and rotated frames and \\tdplotsetcoord\'s points, set before the picture', () => {
    const before = '\\tdplotsetmaincoords{60}{110}\n';
    const sh = shapesOf(doc(String.raw`\draw[->] (0,0,0) -- (1,0,0);
\draw[->] (0,0,0) -- (0,0,1);
\tdplotsetcoord{P}{2}{30}{60}
\draw (0,0,0) -- (P);
\draw[dashed] (P) -- (Pxy);
\tdplotsetrotatedcoords{0}{90}{0}
\draw[tdplot_rotated_coords] (0,0,0) -- (1,0,0);`, { libs: '\\usepackage{tikz-3dplot}', opts: 'tdplot_main_coords', before }));
    T.eq(kept(sh), [], 'nothing kept');
    const lines = sh.filter((s) => s.type === 'line');
    // x on the page: (cos φ, -cos θ sin φ) cm; z: (0, sin θ)
    const th = 60 * Math.PI / 180, ph = 110 * Math.PI / 180;
    near(lines[0].x2 / CM, Math.cos(ph), 'x → page x', 0.01); near(-lines[0].y2 / CM, -Math.cos(th) * Math.sin(ph), 'x → page y', 0.01);
    near(lines[1].x2, 0, 'z is upright'); near(-lines[1].y2 / CM, Math.sin(th), 'z → page y', 0.01);
    // P = 2 (sin 30 cos 60, sin 30 sin 60, cos 30)
    const P = [2 * 0.5 * 0.5, 2 * 0.5 * Math.sqrt(3) / 2, 2 * Math.sqrt(3) / 2];
    const page = (x, y, z) => [Math.cos(ph) * x + Math.sin(ph) * y, -Math.cos(th) * Math.sin(ph) * x + Math.cos(th) * Math.cos(ph) * y + Math.sin(th) * z];
    near(lines[2].x2 / CM, page(...P)[0], 'P x', 0.01); near(-lines[2].y2 / CM, page(...P)[1], 'P y', 0.01);
    near(-lines[3].y2 / CM, page(P[0], P[1], 0)[1], 'Pxy', 0.01);
    // rotated by β = 90° about y: its x is the main frame's -z
    near(lines[4].x2, 0, 'rotated x on the page', 0.01); near(-lines[4].y2 / CM, -Math.sin(th), 'pointing down', 0.01);
  });

  T.test('import graphs: a \\graph in a picture with more in it is a Graph block; the code after it finds its nodes', () => {
    const sh = shapesOf(doc(String.raw`\graph[no placement, nodes={draw, circle}] { a [at={(0,0)}]; b [at={(2,0)}]; a -> b; };
\draw[red] (a) -- ++(0,1) node[above] {note};`, { libs: '\\usetikzlibrary{graphs}' }));
    const g = sh.find((s) => s.type === 'graph');
    T.ok(g, 'a Graph block: ' + sh.map((s) => s.type) + ' ' + kept(sh));
    const l = sh.find((s) => s.type === 'line' && s.stroke === '#ff0000');
    T.ok(l && Math.abs(l.x1) < 0.5 && l.y1 < -5, 'the red line starts on a\'s border: ' + (l && [l.x1, l.y1]));
  });

  T.test('import graphs: a \\graph joining the picture\'s nodes is their edges; a quote on to or edge is a label beside it', () => {
    const P = (b) => `\\begin{tikzpicture}\\node (a) at (0,0) {a}; \\node (b) at (2,0) {b}; \\node (c) at (1,-1) {c}; ${b}\\end{tikzpicture}`;
    const lines = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes).filter((s) => s.type !== 'text');
    let L = lines(P('\\graph[use existing nodes, edges={red}]{a -> {b, c}; b --["x"\'] c};'));
    T.eq(L.map((s) => s.type).join(','), 'line,line,line', 'three edges, no code');
    T.eq(L[2].label, 'x', 'the quote is the label'); T.eq(L[2].labelSide, 'right', "' swaps it");
    L = lines(P('\\graph{(a) -> new};'));
    T.eq(L[0].type, 'tikz', 'a graph making a node of its own is not edges');
    L = lines(P('\\draw[->] (a) to["$y$" near start] (b);'));
    T.eq(L[0].label, '$y$'); T.eq(L[0].labelPos, 0.25, 'near start'); T.eq(L[0].labelSide, 'left', 'auto');
    L = lines(P('\\draw[->] (a) to["one", "two"\'] (b);'));
    T.eq(L[0].type, 'tikz', 'two labels on one piece stay code');
  });
  T.test('import: what the background layer draws lies under the rest and keeps its code; exported back where it was written', () => {
    const src = String.raw`\begin{tikzpicture}
\node[draw] (a) {A};
\node[draw] (b) at (2,0) {B};
\begin{scope}[on background layer]
\fill[pattern=north lines] ([shift={(-2pt,-2pt)}]a.south west) rectangle ([shift={(2pt,2pt)}]b.north east);
\end{scope}
\draw[->] (a) -- (b);
\end{tikzpicture}`;
    const sh = TD.importLatex(src).blocks.flatMap((b) => b.shapes);
    T.eq(sh[0].type, 'tikz', 'the fill comes first (lowest)');
    T.ok(/\\fill\[pattern=north lines\]/.test(sh[0].code), 'with its own code: ' + sh[0].code);
    const out = TD.toTikz(sh);
    T.ok(out.indexOf('(b) at') < out.indexOf('on background layer'), 'written after the nodes it names:\n' + out);
    T.ok(out.indexOf('on background layer') < out.indexOf('\\draw[->]'), 'and before what came after it');
  });
  T.test('import tikz-cd: a diagram whose options draw (execute at end picture) is a diagram block that draws them', () => {
    const src = String.raw`\documentclass{article}
\usepackage{tikz-cd}
\begin{document}
\begin{tikzcd}[every matrix/.append style={name=m}, execute at end picture={\draw[red] (m-1-1) circle (10pt);}]
A \arrow[r] & B
\end{tikzcd}
\end{document}`;
    const sh = shapesOf(src);
    const cd = sh.find((s) => s.type === 'cd');
    T.ok(cd, 'a diagram block: ' + sh.map((s) => s.type));
    const L = TD.cdLayout(cd);
    T.ok(L.over && L.over.some((x) => x.type === 'ellipse' && x.stroke === '#ff0000'), 'the circle is drawn: ' + JSON.stringify(L.warnings));
    const A = L.nodes[0], c = L.over.find((x) => x.type === 'ellipse');
    near(c.cx, A.x, 'round A (x)', 0.5); near(c.rx, 10 / TD.PT_PER_PX, 'radius 10pt', 0.05);
  });
  T.test('import tikz-cd: an option whose value runs over several lines is read (execute at end picture={…})', () => {
    const src = String.raw`\begin{tikzcd}[every matrix/.append style={name=m},
  execute at end picture={
    \draw[red] (m-1-1) circle (10pt);
  }]
A \arrow[r] & B
\end{tikzcd}`;
    const cd = shapesOf(src).find((s) => s.type === 'cd');
    const L = TD.cdLayout(cd);
    T.eq(L.warnings, [], 'nothing left out');
    T.ok(L.over && L.over.some((x) => x.type === 'ellipse'), 'the circle is drawn');
  });
  // measured in TeX Live (\sbox round the diagram): the picture reaches a loop's control points, as pgf's does
  T.test('import tikz-cd: loop left/right/above/below are TikZ\'s loops; a bare loop is not drawn', () => {
    const K = TD.PT_PER_PX, box = (k) => TD.cdLayout(shapesOf(`\\begin{tikzcd} A \\ar[${k}] \\end{tikzcd}`).find((s) => s.type === 'cd'));
    for (const [k, w, h] of [['loop left', 30.25269, 14.15277], ['loop right', 30.25269, 14.15277], ['loop above', 16.11108, 28.29437], ['loop below', 16.11108, 28.29437]]) {
      const L = box(k);
      T.eq(L.warnings, [], k);
      T.ok(Math.abs(L.bb.w * K - w) < 0.1 && Math.abs(L.bb.h * K - h) < 0.1, `${k}: ${(L.bb.w * K).toFixed(3)} x ${(L.bb.h * K).toFixed(3)} vs ${w} x ${h}`);
    }
    T.ok(box('loop').warnings.some((w) => /loop/.test(w)), 'a loop with no angles is said to be left out');
    // a bent arrow's box: its control points (pdflatex: bend left 15.855pt high, bend right down 16.698pt wide,
    // out=90, in=90 30.306pt high)
    const cdBox = (src) => TD.cdLayout(shapesOf(`\\begin{tikzcd} ${src} \\end{tikzcd}`).find((s) => s.type === 'cd')).bb;
    T.ok(Math.abs(cdBox('A \\ar[r, bend left] & B').h * K - 15.855) < 0.2, 'bend left: ' + cdBox('A \\ar[r, bend left] & B').h * K);
    T.ok(Math.abs(cdBox('A \\ar[d, bend right] \\\\ B').w * K - 16.698) < 0.2, 'bend right: ' + cdBox('A \\ar[d, bend right] \\\\ B').w * K);
    T.ok(Math.abs(cdBox('A \\ar[r, out=90, in=90] & B').h * K - 30.306) < 0.2, 'out, in: ' + cdBox('A \\ar[r, out=90, in=90] & B').h * K);
  });
}
