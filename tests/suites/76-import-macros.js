// Import: numeric macros a picture defines (\def\r{1.5}, \newcommand, \pgfmathsetmacro) are written into the
// coordinates and lengths that use them, so code kept as written previews in the right place; xcolor's
// svgnames (DarkBlue) are read, and defined in the preamble so the export compiles.
const LOOP = String.raw`\begin{tikzpicture}[very thick,q0/.style={->,DarkBlue,semithick,yshift=5pt,shorten >=5pt,shorten <=5pt}]
  \def\radius{1.5}
  \draw (0,0) circle (\radius);
  \node[above] (1) at (0,\radius) {$m_1^2$, $\gamma_1^2$};
  \node[below] (2) at (0,-\radius) {$m_2^2$, $\gamma_2^2$};
  \draw[q0] (140:0.75*\radius) arc (140:40:0.75*\radius) node[midway,below] {$q_0$};
  \filldraw
  (-2*\radius,0) -- (-\radius,0) circle (2pt)
  (\radius,0) circle (2pt) -- (2*\radius,0);
  \draw[q0] (-2*\radius,0) -- (-\radius,0) node[midway,above] {$q_0$};
  \draw[q0] (\radius,0) -- (2*\radius,0) node[midway,above] {$q_0$};
\end{tikzpicture}`;
const CM = TD.PX_PER_CM;
const near = (a, b, tol = 0.6) => Math.abs(a - b) < tol;

T.test('import macros: \\def values place circles, nodes, arcs and lines', () => {
  const sh = TD.importLatex(LOOP).blocks[0].shapes;
  const prev = sh.flatMap((s) => (s.type === 'tikz' ? s.prev || [] : [s]));
  const issues = sh.flatMap((s) => s.issues || []);
  T.ok(!issues.some((w) => /Unsupported coordinate|circle without radius|arc not understood/.test(w)), 'no unread coordinates: ' + issues.join('; '));
  T.ok(prev.some((p) => p.type === 'ellipse' && near(p.rx, 1.5 * CM) && near(p.cx, 0) && near(p.cy, 0)), 'the loop, radius \\radius');
  const texts = prev.filter((p) => p.type === 'text');
  T.ok(texts.some((t) => /m_1/.test(t.text) && t.y < -1.5 * CM + 1), 'm1 above the loop');
  T.ok(texts.some((t) => /m_2/.test(t.text) && t.y > 1.5 * CM - 1), 'm2 below the loop');
  const arc = prev.find((p) => p.type === 'arc');
  T.ok(arc && near(arc.r, 0.75 * 1.5 * CM), 'the arc, radius 0.75*\\radius');
  const q = texts.find((t) => t.text === '$q_0$' && Math.abs(t.x) < 1);
  T.ok(q, 'the arc\'s midway label sits at its middle (x = 0)');
  T.ok(prev.some((p) => p.type === 'line' && near(p.x1, -2 * 1.5 * CM) && near(p.x2, -1.5 * CM)), 'the left line from -2\\radius');
  T.ok(prev.some((p) => p.stroke && p.stroke.toLowerCase() === '#00008b'), 'DarkBlue (svgnames) read');
  // an edit of kept code previews with the macro it uses
  const c = sh.find((s) => s.type === 'tikz' && /circle \(\\radius\)/.test(s.code || ''));
  T.ok(c && c.macros && c.macros.radius === '1.5', 'the code object carries \\radius');
  const r = TD.importInternals.preview('\\draw (0,0) circle (2*\\radius);', c.ctx, c.names, c.macros);
  T.ok(r.shapes.some((p) => p.type === 'ellipse' && near(p.rx, 3 * CM)), 'edited code previews with \\radius');
});

T.test('import macros: \\newcommand and \\pgfmathsetmacro values', () => {
  const src = String.raw`\begin{tikzpicture}
  \newcommand{\w}{2}
  \pgfmathsetmacro{\h}{\w/2+0.5}
  \draw (0,0) rectangle (\w,\h);
\end{tikzpicture}`;
  const prev = TD.importLatex(src).blocks[0].shapes.flatMap((s) => (s.type === 'tikz' ? s.prev || [] : [s]));
  const b = prev.map((p) => TD.bbox(p)).find((q) => q && q.w > 1);
  T.ok(b && near(b.w, 2 * CM) && near(b.h, 1.5 * CM), 'a 2 × 1.5 rectangle: ' + JSON.stringify(b));
});

T.test('import macros: the export defines svgnames colours and compiles', () => {
  const sh = TD.importLatex(LOOP).blocks[0].shapes;
  const tex = TD.toTikz(sh, { standalone: true });
  T.ok(/\\definecolor\{DarkBlue\}\{HTML\}\{00008B\}/.test(tex), 'DarkBlue defined');
  T.tex('import macros loop', tex);
});
