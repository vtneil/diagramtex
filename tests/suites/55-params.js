// Parameters (phase 5): variables and expressions in geometry fields, solved by TD.params.solve.
const PX = () => TD.PX_PER_CM;
const P = TD.params;
const solve = (S, V) => P.solve(S, V, TD.GEOM);
const near = (a, b) => Math.abs(a - b) < 1e-6;

T.test('params: expressions read and work out', () => {
  const v = (x, env = {}) => P.evaluate(P.parse(x), (r) => { if (r[0] in env) return env[r[0]]; throw new Error('nothing called ' + r[0]); });
  T.eq(v('1 + 2 * 3'), 7, 'precedence');
  T.eq(v('-2^2'), -4, 'unary minus binds looser than ^');
  T.eq(v('(1 + 2) * 3'), 9, 'parentheses');
  T.ok(near(v('sin(30)'), 0.5), 'degrees, as in TikZ');
  T.eq(v('max(w, 2) / 2', { w: 5 }), 2.5, 'functions and names');
  T.eq(v('= 3'), 3, 'a leading = is allowed');
  for (const bad of ['1 +', '(1', 'foo(1)', '2 $ 3', '']) { let ok = false; try { P.parse(bad); } catch (e) { ok = true; } T.ok(ok, 'rejected: ' + bad); }
});

T.test('params: variables, objects and anchors set geometry fields', () => {
  const a = T.make('rect', { set: { x: 0, y: -2 * PX(), w: 2 * PX(), h: PX(), name: 'a' } });
  const b = T.make('rect', { set: { x: 5 * PX(), y: 0, w: PX(), h: PX(), name: 'b' } });
  const c = T.make('ellipse', { set: { cx: 0, cy: 0, rx: PX(), ry: PX() } });
  const S = [a, b, c], V = { gap: '0.5', w: '2 * gap + 1' };
  b.ex = { x: 'a.east.x + gap', w: 'w', y: 'a.north.y' };
  c.ex = { rx: 'a.width / 4', cx: 'b.x' };
  const E = solve(S, V);
  T.eq([...E.keys()], [], 'no errors: ' + [...E.values()].join('; '));
  T.ok(near(b.x, 2.5 * PX()), 'b sits gap to the right of a: ' + b.x / PX());
  T.ok(near(b.w, 2 * PX()), 'b.w from the variable');
  T.ok(near(-b.y / PX(), 2), 'top of a is y = 2 (TikZ y up): ' + (-b.y / PX()));
  T.ok(near(c.rx, 0.5 * PX()) && near(c.cx, 2.5 * PX()), 'c follows b, which follows a');
  // the variable changes: everything that uses it follows
  V.gap = '1'; solve(S, V);
  T.ok(near(b.x, 3 * PX()) && near(b.w, 3 * PX()) && near(c.cx, 3 * PX()), 'gap = 1');
  // a moves: b and c follow
  TD.translate(a, PX(), 0); solve(S, V);
  T.ok(near(b.x, 4 * PX()) && near(c.cx, 4 * PX()), 'a moved right 1cm');
  // b dragged by hand: its moved fields let go, the others stay
  TD.translate(b, 0, PX()); solve(S, V);
  T.ok(!('y' in b.ex) && 'x' in b.ex, 'y let go, x kept (unchanged by the drag): ' + JSON.stringify(b.ex));
  // a and b dragged together: b keeps its expression
  TD.translate(a, PX(), 0); TD.translate(b, PX(), 0); solve(S, V);
  T.ok('x' in b.ex && near(b.x, 5 * PX()), 'moved together: kept');
});

T.test('params: errors are reported, not guessed', () => {
  const a = T.make('rect', { set: { name: 'a' } }), b = T.make('rect', { set: { name: 'b' } });
  a.ex = { w: 'b.w + 1' }; b.ex = { w: 'a.w + 1', x: 'nope * 2', y: 'a.north' };
  const E = solve([a, b], { p: 'q', q: 'p', r: '1/0' });
  T.ok(E.has('var:p') && E.has('var:q') && [E.get('var:p'), E.get('var:q')].some((m) => /itself/.test(m)), 'variables in a circle: ' + E.get('var:p') + ' / ' + E.get('var:q'));
  T.ok(E.has('var:r'), 'division by zero');
  T.ok(/nothing called nope/.test(E.get(b.id + ':x')), 'unknown name');
  T.ok(/\.x or \.y/.test(E.get(b.id + ':y')), 'a point where a number goes');
  T.ok(/circle/.test(E.get(a.id + ':w') || '') || /circle/.test(E.get(b.id + ':w') || ''), 'objects in a circle');
});

T.test('params: the export writes the values, and kept code is not rewritten for an expression that holds', () => {
  const S = TD.importLatex('\\begin{tikzpicture}\n  \\draw (0,0) rectangle (2,1);\n  \\draw (3,0) rectangle (4,1);\n\\end{tikzpicture}').blocks.flatMap((b) => b.shapes || []);
  const before = TD.toTikz(S);
  S[0].name = 'a';
  S[1].ex = { x: 'a.east.x + 1' };
  solve(S, {});
  T.eq(TD.toTikz(S), before, 'the expression gives the same place: as written');
  S[1].ex.x = 'a.east.x + 2'; solve(S, {});
  T.ok(/shift=\{\(1,0\)\}\]\s*\n\s*\\draw \(3,0\) rectangle \(4,1\)/.test(TD.toTikz(S)), 'moved 1cm by the expression: written as moved: ' + TD.toTikz(S));
  S[1].ex.w = '2'; solve(S, {});
  T.ok(/\(4,0\) rectangle \(6,1\)/.test(TD.toTikz(S)), 'resized too: numbers in the code');
});
