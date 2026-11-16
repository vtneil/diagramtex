// pgfplots import: \begin{axis} … \end{axis} becomes the app's own plot (src/domain/pgfplots-import.ts)
const pgfPic = (axis) => `\\begin{tikzpicture}\n${axis}\n\\end{tikzpicture}`;
const pgfShapes = (src) => TD.importLatex(src).blocks.find((b) => b.shapes).shapes;
const pgfNative = (src) => { const sh = pgfShapes(src); T.eq(sh.map((s) => s.type), ['plot'], 'one native plot'); return sh[0]; };
const pgfNear = (a, b, msg, eps = 1e-6) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const pgfPts = 1 / TD.PT_PER_PX; // px per pt

T.test('pgfplots import: a function plot with domain, labels, grid and legend', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[xlabel=$x$, ylabel=$y$, grid=major, title={Waves}]
\addplot[domain=0:360, samples=60, blue, thick] {sin(x)};
\addplot[domain=0:360, samples=60, red, dashed] {cos(\x)};
\legend{$\sin x$, $\cos x$}
\end{axis}`));
  T.eq([p.xlabel, p.ylabel, p.title, p.grid, p.axisLines], ['$x$', '$y$', 'Waves', true, 'box']);
  const [a, b] = p.series;
  T.eq([a.kind, a.source, a.domain, a.samples, a.color, a.dash, a.mark], ['line', 'expr', ['0', '360'], 60, '#0000ff', 'solid', 'none']);
  T.eq([b.color, b.dash, a.legend, b.legend], ['#ff0000', 'dashed', '$\\sin x$', '$\\cos x$']);
  pgfNear(a.width, 0.8 * pgfPts, 'thick is 0.8pt');
  // pgfplots' trig is in degrees: sin(90°) = 1 in the plot's radians
  const e = TD.getExpr(a.expr, ['x']);
  pgfNear(e.fn(90, 0), 1, 'sin(90) in degrees');
  pgfNear(TD.getExpr(b.expr, ['x']).fn(180, 0), -1, 'cos(\\x) in degrees');
  // default size: 240pt x 207pt less 45pt each for the labels, anchored south west at the origin
  pgfNear(p.w, 195 * pgfPts, 'axis width', 1e-6); pgfNear(p.h, 162 * pgfPts, 'axis height', 1e-6);
  T.eq([p.x, Math.round(p.y + p.h)], [0, 0]);
  // automatic limits are enlarged by 10% like pgfplots', ticks follow pgfplots' rule
  const svg = TD.TYPES.plot.svg({ ...p, id: 't' }, {});
  T.ok(svg.includes('<path'), 'renders');
  T.tex('pgfplots function plot export', TD.toTikz([p], { standalone: true }));
});

T.test('pgfplots import: coordinates take the cycle list (blue circles, red squares)', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[legend pos=north west]
\addplot coordinates {(0,0) (1,1.8) (2,3.1) (3,3.9)};
\addplot+[only marks] coordinates {(0,0.5) (1,1.2) (2,2.0) (3,2.4)};
\addplot[green!50!black] coordinates {(0,1) (3,1)};
\addlegendentry{flat}
\end{axis}`));
  const [a, b, c] = p.series;
  T.eq([a.kind, a.source, a.color, a.mark], ['line', 'data', '#0000ff', '*']);
  T.eq(a.data.split('\n').length, 4);
  T.eq([b.kind, b.color, b.mark], ['scatter', '#ff0000', 'square*']);
  T.eq([c.color, c.mark, c.legend], ['#008000', 'none', 'flat']);
  T.eq(p.legendPos, 'north west');
});

T.test('pgfplots import: axis lines=middle has no enlarged limits', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[axis lines=middle, xlabel=$x$, ylabel=$y$, domain=-2:2, samples=80, xmin=-2.5]
\addplot[thick, blue] {x^3 - 2*x};
\end{axis}`));
  T.eq([p.axisLines, p.enlarge, p.xmin], ['middle', 0, '-2.5']);
  T.eq([p.series[0].domain, p.series[0].samples], [['-2', '2'], 80]);
  const q = pgfNative(pgfPic(String.raw`\begin{axis}[axis lines=center]\addplot {x};\end{axis}`));
  T.eq(q.axisLines, 'middle');
});

T.test('pgfplots import: bars with the bar cycle list, table data and closedcycle areas', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[ybar, ymin=0]
\addplot coordinates {(1,3) (2,5) (3,2)};
\addplot coordinates {(1,4) (2,1) (3,3)};
\legend{A, B}
\end{axis}`));
  T.eq(p.series.map((s) => [s.kind, s.color, s.fill]), [['bar', '#0000ff', '#b3b3ff'], ['bar', '#ff0000', '#ffb3b3']]);
  pgfNear(p.series[0].barWidth, 10 * pgfPts, 'bar width 10pt');
  pgfNear(p.barGap, 2 * pgfPts, 'ybar gap 2pt');
  const t = pgfNative(pgfPic(String.raw`\begin{axis}[axis lines=left]
\addplot table[x=n, y=t] {
t n
2 1
5 2
9 3
};
\end{axis}`));
  T.eq([t.axisLines, t.series[0].data], ['left', '1 2\n2 5\n3 9']);
  const r = pgfNative(pgfPic(String.raw`\begin{axis}[width=9cm, height=6cm, scale only axis]
\addplot[fill=blue!20, draw=blue, domain=-3:3] {exp(-x^2/2)} \closedcycle;
\end{axis}`));
  T.eq([r.series[0].kind, r.series[0].fill, r.series[0].color], ['area', '#ccccff', '#0000ff']);
  pgfNear(r.w, 9 * TD.PX_PER_CM, 'scale only axis width', 1e-3);
  T.tex('pgfplots bars and area export', TD.toTikz([p, { ...r, y: r.y + 300 }], { standalone: true }));
});

T.test('pgfplots import: parametric, 3D surface and a bare axis', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[axis equal image]
\addplot[domain=0:360, samples=120, red] ({cos(x)}, {sin(2*x)});
\end{axis}`));
  T.eq(p.series[0].kind, 'param');
  pgfNear(TD.getExpr(p.series[0].expr.replace(/\bt\b/g, 'x'), ['x']).fn(180, 0), -1, 'parametric x(t) in degrees');
  pgfNear(p.w, p.h, 'equal image of a square range', 1);
  const s = pgfNative(pgfPic(String.raw`\begin{axis}[view={60}{30}]
\addplot3[surf, domain=-2:2, samples=20] {exp(-x^2-y^2)};
\end{axis}`));
  T.eq([s.dim, s.view, s.series[0].kind, s.series[0].ydomain], [3, [60, 30], 'surface', ['-2', '2']]);
  const bare = pgfNative(String.raw`\begin{axis}
\addplot {x^2};
\end{axis}`);
  T.eq(bare.series[0].domain, ['-5', '5']);
  T.eq(pgfShapes(String.raw`\begin{semilogyaxis}\addplot {exp(x)};\end{semilogyaxis}`)[0].type, 'tikz', 'a log axis stays code');
});

T.test('pgfplots import: declared functions and tick distances', () => {
  const p = pgfNative(pgfPic(String.raw`\begin{axis}[declare function={f(\x)=\x^2/4; g(\a,\b)=\a+2*\b;}, xtick distance=2, domain=-4:4]
\addplot {g(f(x), 1)};
\end{axis}`));
  pgfNear(TD.getExpr(p.series[0].expr, ['x']).fn(2, 0), 3, 'g(f(2), 1)');
  T.eq(p.xtick, [-4, -2, 0, 2, 4]);
});

T.test('pgfplots import: what the plot does not hold keeps the code, previewed by the plot', () => {
  const sh = pgfShapes(pgfPic(String.raw`\begin{axis}[xticklabels={a,b,c}]
\addplot[const plot] coordinates {(0,0) (1,1) (2,0)};
\node at (axis cs:1,1) {top};
\end{axis}`));
  T.eq(sh.map((s) => s.type), ['tikz']);
  T.eq(sh[0].prev.map((s) => s.type), ['plot'], 'the plot previews the code');
  const iss = sh[0].issues.join('; ');
  T.ok(/xticklabels/.test(iss) && /const plot/.test(iss) && /\\node/.test(iss), iss);
  T.ok(sh[0].code.includes('\\begin{axis}'), 'code kept as written');
});
