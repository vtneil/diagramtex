// Names made inside a transformed scope mean the same page point inside and outside it (checked with pdflatex:
// tests/import-parity/scope-names.tex)
T.test('import scope names: a name made in a shifted or rotated scope is the same point everywhere', () => {
  const src = String.raw`\begin{tikzpicture}
\begin{scope}[shift={(1,0)}]
\node[inner sep=0pt, outer sep=0pt] (a) at (0,0) {};
\coordinate (k) at (0,2);
\draw (a) -- (0,1);
\draw (k) -- (1,1);
\end{scope}
\draw (a) -- (2,2);
\draw (k) -- (3,3);
\begin{scope}[rotate=90]
\draw (k) -- (0,0);
\node[draw] (r) at (1,0) {R};
\end{scope}
\draw (r) -- (3,1);
\end{tikzpicture}`;
  const r = TD.importLatex(src), sh = r.blocks[0].shapes, CM = TD.PX_PER_CM;
  T.eq(r.kept.length, 0);
  const lines = sh.filter((s) => s.type === 'line');
  const near = (x, y, X, Y) => Math.hypot(x - X, y - Y) < 0.5;
  // (a) is at (1,0) and (k) at (1,2), whichever side of the scope they are used on
  T.ok(near(lines[0].x1, lines[0].y1, CM, 0), 'node used in its own shifted scope: shifted once');
  T.ok(near(lines[1].x1, lines[1].y1, CM, -2 * CM), 'coordinate used in its own shifted scope');
  T.ok(near(lines[2].x1, lines[2].y1, CM, 0), 'node used after the scope');
  T.ok(near(lines[3].x1, lines[3].y1, CM, -2 * CM), 'coordinate used after the scope');
  T.ok(near(lines[4].x1, lines[4].y1, CM, -2 * CM) && near(lines[4].x2, lines[4].y2, 0, 0), 'coordinate used in a rotated scope');
  // a node in a rotated scope moves with it but stays upright (no transform shape)
  const box = sh.find((s) => s.nodeName === 'r');
  T.ok(!box.angle, 'node stays upright');
  T.ok(near(box.x + box.w / 2, box.y + box.h / 2, 0, -CM), 'node centre turned to (0,1)');
  T.ok(Math.abs(lines[5].y1 + CM) < 0.5 && lines[5].x1 > box.x + box.w - 1, 'line leaves the upright border');
  T.tex('import scope names', TD.toTikz(sh, { standalone: true }));
});
