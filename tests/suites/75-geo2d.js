// 2D geometry (js/geo2d.js): plain TikZ read by the geo3d interpreter seen straight on. Points (x,y) and
// (angle:radius) become handles, (A |- B) and (A -| B) resolve, grids and angle marks draw, labels print
// computed values, and the export is the code in a shifted scope with the libraries it uses.
const G2 = TD.geo2d, G3 = TD.geo3d;
const L2 = (src) => G2.layout(src);
const near2 = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const pic = (body) => `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
const texts = (L) => L.items.filter((it) => it.k === 'text').map((it) => it.text);

T.test('geo2d: the default figure draws without warnings and prints its computed values', () => {
  const L = L2(TD.GEO2D_DEFAULT);
  T.eq(L.warnings.length, 0, 'warnings: ' + L.warnings.join('; '));
  const tx = texts(L);
  T.ok(tx.some((t) => /\\Delta x = 2\.4\b/.test(t)), 'Δx printed: ' + tx.join(' | '));
  T.ok(tx.some((t) => /\\Delta y = 3\.2\b/.test(t)), 'Δy printed: ' + tx.join(' | '));
  T.ok(tx.some((t) => /\\theta/.test(t)), 'the angle label');
  T.ok(L.items.filter((it) => it.k === 'line').length > 15, 'grid, axes, ticks, vector');
  const q = L.handles.find((h) => h.polar);
  T.ok(q && q.writable, 'Q at (\\vang:\\vlen) is a polar handle');
});

T.test('geo2d: (A |- B) and (A -| B) take x from one point and y from the other', () => {
  const src = pic('\\coordinate (A) at (3,1);\n\\coordinate (B) at (1,2);\n\\coordinate (C) at (A |- B);\n\\coordinate (D) at (A -| B);\n\\draw (C) -- (D);');
  const L = L2(src);
  T.eq(L.names.get('C').m.slice(0, 2).map((v) => +v.toFixed(6)), [3, 2], 'A |- B');
  T.eq(L.names.get('D').m.slice(0, 2).map((v) => +v.toFixed(6)), [1, 1], 'A -| B');
});

T.test('geo2d: 2D points are handles; dragging writes x, y or the angle and radius', () => {
  const src = pic('\\coordinate (A) at (1,2);\n\\coordinate (B) at (30:2);\n\\draw (A) -- (B);');
  const L = L2(src);
  const a = L.handles.find((h) => !h.polar), b = L.handles.find((h) => h.polar);
  T.ok(a && a.writable, 'a 2-component point'); T.ok(b && b.writable, 'a polar point');
  const s1 = G3.edits(src, G3.moveHandle(L, a, [2.5, -1, 0]));
  T.ok(/\(A\) at \(2\.5\s*,\s*-1\)/.test(s1), s1);
  const s2 = G3.edits(src, G3.moveHandle(L, b, [0, 3, 0]));
  T.ok(/\(B\) at \(90\s*:\s*3\)/.test(s2), s2);
});

T.test('geo2d: grid lines fall on multiples of the step inside the rectangle', () => {
  const L = L2(pic('\\draw[step=0.5] (0,0) grid (1,1);'));
  const lines = L.items.filter((it) => it.k === 'line');
  T.eq(lines.length, 6, 'three vertical and three horizontal');
});

T.test('geo2d: angle and right angle marks, with their quoted labels', () => {
  const src = pic('\\coordinate (A) at (2,0);\n\\coordinate (B) at (0,0);\n\\coordinate (C) at (0,2);\n\\pic[draw, "$\\alpha$", angle radius=1cm] {angle = A--B--C};\n\\pic[draw] {right angle = A--B--C};');
  const L = L2(src);
  T.eq(L.warnings.length, 0, L.warnings.join('; '));
  const lines = L.items.filter((it) => it.k === 'line');
  T.eq(lines.length, 2, 'an arc and a square');
  const tx = L.items.find((it) => it.k === 'text');
  T.ok(tx && /alpha/.test(tx.text), 'the label');
  // the arc runs at 1cm from B, a quarter turn
  const pts = lines[0].pts;
  const r = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  near2(r, Math.SQRT2, 0.02, 'chord of a quarter arc of radius 1');
});

T.test('geo2d: \\pgfmathprintnumber follows precision and zerofill', () => {
  const L = L2(pic('\\pgfmathsetmacro{\\a}{1.5}\n\\node at (0,0) {$\\pgfmathprintnumber[fixed,precision=3]{\\a*2}$};\n\\node at (1,0) {$\\pgfmathprintnumber[fixed,zerofill,precision=2]{\\a}$};'));
  T.eq(texts(L), ['$3$', '$1.50$']);
});

T.test('geo2d: function, polar and parametric plots draw', () => {
  const L = L2(pic('\\draw[domain=-2:2, samples=40] plot (\\x, {0.5*\\x*\\x});\n\\draw[domain=0:360, samples=90] plot (\\x:{1+0.5*cos(3*\\x)});\n\\draw[variable=\\t, domain=0:360, samples=90] plot ({2*cos(\\t)}, {sin(2*\\t)});'));
  T.eq(L.warnings.length, 0, L.warnings.join('; '));
  const lines = L.items.filter((it) => it.k === 'line');
  T.eq(lines.length, 3);
  T.ok(lines.every((l) => l.pts.length >= 40), 'sampled');
});

T.test('geo2d: the panel slides literal values and sets the scale', () => {
  const s = TD.TYPES.geo2d.create({ x: 0, y: 0 });
  const S = G2.sliders(L2(s.src));
  T.eq(S.map((x) => x.name).sort(), ['vang', 'vlen'], 'only the values set to numbers');
  const t = { dataset: { g2: 'vlen' }, value: '3' };
  T.ok(TD.panels.geo2d.apply(s, t), 'redrawn');
  T.ok(/\\pgfmathsetmacro\{\\vlen\}\{3\}/.test(s.src), s.src.slice(0, 120));
  TD.panels.geo2d.apply(s, { dataset: { g2: 'scale' }, value: '0.8' });
  T.ok(/\\begin\{tikzpicture\}\[scale=0\.8\]/.test(s.src), s.src.slice(0, 60));
  T.eq(L2(s.src).scale, 0.8);
});

T.test('geo2d: exports a shifted scope with the libraries it uses, and compiles', () => {
  const s = TD.TYPES.geo2d.create({ x: 40, y: 20 });
  const out = TD.toTikz([s], { standalone: true });
  T.ok(/\\usetikzlibrary\{[^}]*angles/.test(out) && /quotes/.test(out), 'angles and quotes');
  T.ok(!/tikz-3dplot/.test(out), 'no 3D package');
  T.ok(/\\begin\{scope\}\[shift=/.test(out), 'a shifted scope');
  T.ok(/\\pic\[draw, "\$\\theta\$", angle radius=8mm\] \{angle = R--P--Q\};/.test(out), 'the code as written');
  T.tex('geo2d-default', out);
  const more = { ...s, src: pic('\\coordinate (A) at (2,0);\n\\coordinate (B) at (0,0);\n\\coordinate (C) at (40:1.5);\n\\draw[-{Stealth}] (B) -- (A);\n\\draw (B) -- (C);\n\\pic[draw, fill=blue!10, "$\\beta$", angle radius=6mm, angle eccentricity=1.4] {angle = A--B--C};\n\\pic[draw] {right angle = C--B--A};\n\\draw[domain=0:360, samples=90, red] plot (\\x:{1+0.3*cos(3*\\x)});\n\\draw (A) -- (A |- C) -- (C);') };
  const out2 = TD.toTikz([more], { standalone: true });
  T.ok(/arrows\.meta/.test(out2), 'arrows.meta');
  T.tex('geo2d-angles', out2);
});

T.test('geo2d: a circle\'s rim sets its radius: a number, a number in cm, or the macro it names', () => {
  const src = pic('\\pgfmathsetmacro{\\r}{1.5}\n\\coordinate (O) at (1,1);\n\\draw (O) circle (\\r);\n\\draw (0,0) circle (2cm);\n\\draw (3,0) circle[radius=0.5];\n\\draw (0,3) circle (2*\\r);\n\\draw (0,0) ellipse (2 and 1);');
  const L = L2(src);
  T.eq(L.rings.length, 4, 'four circles; the ellipse has none');
  T.eq(L.rings.map((g) => +g.r.toFixed(6)), [1.5, 2, 0.5, 3]);
  T.eq(L.rings.map((g) => g.writable), [true, true, true, false], 'an expression is computed in the code');
  T.eq(L.rings.map((g) => !!g.abs), [false, true, false, false], '2cm is on the page, unscaled');
  near2(L.rings[0].c.m[0], 1, 1e-9, 'centred on O');
  const set = (i, r) => G3.edits(src, [G3.setRadius(L, L.rings[i], r)]);
  T.ok(/\\pgfmathsetmacro\{\\r\}\{2\.25\}/.test(set(0, 2.25)) && /circle \(\\r\)/.test(set(0, 2.25)), 'the macro holds the new radius');
  T.ok(/\(0,0\) circle \(1\.2cm\)/.test(set(1, 1.2)), 'keeps cm');
  T.ok(/circle\[radius=0\.75\]/.test(set(2, 0.75)), 'radius= option');
  const mm = pic('\\draw (0,0) circle (5mm);'), Lm = L2(mm);
  T.ok(Lm.rings[0].writable && /circle \(8mm\)/.test(G3.edits(mm, [G3.setRadius(Lm, Lm.rings[0], 0.8)])), 'keeps mm');
  T.eq(L2(set(2, 0.75)).rings[2].r, 0.75, 'redrawn at the new size');
  T.eq(L2(pic('\\fill (1,1) circle (1.5pt);')).rings.length, 0, 'a point\'s dot is not a circle to size');
  T.eq(L2(pic('\\foreach \\i in {1,2} \\draw (0,0) circle (\\i);')).rings.length, 0, 'circles in a loop have no rim to drag');
});

T.test('geo2d: dragging a path moves the whole object: its literal points, or the named points it uses', () => {
  const shift = (src, i, d) => { const L = L2(src), si = [...L.moves.keys()][i]; return G3.edits(src, G3.shiftEdits(L, si, d)); };
  // a polygon of literal points
  const poly = pic('\\draw (0,0) -- (2,0) -- (1,1.5) -- cycle;');
  T.ok(/\(0\.5,-1\) -- \(2\.5,-1\) -- \(1\.5,0\.5\) -- cycle/.test(shift(poly, 0, [0.5, -1, 0])), shift(poly, 0, [0.5, -1, 0]));
  // a segment between named points moves their \coordinate values
  const seg = pic('\\coordinate (A) at (1,1);\n\\coordinate (B) at (3,2);\n\\draw (A) -- (B);');
  const s2 = shift(seg, 0, [1, 0, 0]);
  T.ok(/\(A\) at \(2\s*,\s*1\)/.test(s2) && /\(B\) at \(4\s*,\s*2\)/.test(s2) && /\\draw \(A\) -- \(B\)/.test(s2), s2);
  // a vector to a polar point moves both ends; the polar point is rewritten as an angle and a radius
  const vec = pic('\\coordinate (P) at (0,0);\n\\coordinate (Q) at (90:2);\n\\draw[->] (P) -- (Q);');
  const L3 = L2(G3.edits(vec, G3.shiftEdits(L2(vec), [...L2(vec).moves.keys()][0], [1, 0, 0])));
  T.eq(L3.names.get('P').m.slice(0, 2).map((v) => +v.toFixed(4)), [1, 0], 'P');
  const q = L3.names.get('Q').m; near2(q[0], 1, 0.01, 'Q x (angle and radius are rounded)'); near2(q[1], 2, 0.01, 'Q y');
  // a point shared through one macro is written once
  const mac = pic('\\pgfmathsetmacro{\\a}{1}\n\\draw (\\a,0) -- (\\a,2);');
  T.ok(/\\pgfmathsetmacro\{\\a\}\{1\.5\}/.test(shift(mac, 0, [0.5, 0, 0])), shift(mac, 0, [0.5, 0, 0]));
  // computed points: the path does not move as a whole
  const L4 = L2(pic('\\coordinate (A) at (2,0);\n\\coordinate (B) at (0,1);\n\\draw (B) -- (A |- B);\n\\draw (0,0) -- ($(A)!0.5!(B)$);\n\\foreach \\i in {1,2} \\draw (\\i,0) -- (\\i,1);\n\\draw[domain=0:1] plot (\\x,\\x);\n\\draw[step=1] (0,0) grid (2,2);'));
  T.eq(L4.moves.size, 0, 'projections, calc, loops, plots and grids stay put');
});

T.test('geo2d: a circle moves by its rim, through its centre; the radius stays', () => {
  const src = pic('\\pgfmathsetmacro{\\r}{1.5}\n\\coordinate (O) at (1,1);\n\\draw (O) circle (\\r);\n\\draw (3,0) circle (2cm);\n\\coordinate (A) at (2,0);\n\\coordinate (B) at (0,1);\n\\draw (A |- B) circle (1);');
  const L = L2(src);
  const [g0, g1, g2] = L.rings;
  T.ok(L.moves.has(g0.si) && L.moves.has(g1.si), 'circles round a named or a literal centre move');
  T.ok(!L.moves.has(g2.si) && g2.writable, 'a computed centre stays put; its radius can still be set');
  const s1 = G3.edits(src, G3.shiftEdits(L, g0.si, [0.5, 0.5, 0]));
  T.ok(/\(O\) at \(1\.5\s*,\s*1\.5\)/.test(s1) && /\\pgfmathsetmacro\{\\r\}\{1\.5\}/.test(s1), s1);
  const s2 = G3.edits(src, G3.shiftEdits(L, g1.si, [-1, 0, 0]));
  T.ok(/\(2,0\) circle \(2cm\)/.test(s2), s2);
});

T.test('geo2d: several commands move together, with every writable point they hold, each written once', () => {
  const src = pic('\\pgfmathsetmacro{\\a}{1}\n\\draw[step=1] (0,0) grid (2,2);\n\\coordinate (P) at (\\a,0);\n\\draw (P) -- (2,1);\n\\draw (0,0) -- (P);');
  const L = L2(src), all = L.S.map((x, i) => i).filter((i) => ['path', 'coordinate'].includes(L.S[i].k));
  const s = G3.edits(src, G3.shiftEdits(L, all, [1, 1, 0]));
  T.ok(/\(1,1\) grid \(3,3\)/.test(s), 'the grid moves with everything: ' + s);
  T.ok(/\\pgfmathsetmacro\{\\a\}\{2\}/.test(s) && /\(P\) at \(\\a,1\)/.test(s), 'P through its value, once');
  T.ok(/\(P\) -- \(3,2\)/.test(s) && /\(1,1\) -- \(P\)/.test(s), s);
});

T.test('geo2d: straight segments are listed, so a dragged end can keep 15° steps to the other end', () => {
  const L = L2(pic('\\coordinate (P) at (1,1);\n\\draw (P) -- (3,2) -| (4,0);\n\\draw (0,0) -- (1,0) -- (0,1) -- cycle;\n\\draw (0,0) to (2,2);'));
  const key = (k) => k.map((m) => m.slice(0, 2).map((v) => +v.toFixed(6)).join(',')).join(' ');
  const ks = L.links.map(key);
  T.ok(ks.includes('1,1 3,2'), 'P to a literal point: ' + ks.join(' | '));
  T.ok(!ks.some((k) => k.endsWith('4,0')), '-| is not a straight segment');
  T.ok(ks.includes('0,1 0,0'), 'cycle closes the triangle');
  T.ok(!ks.includes('0,0 2,2'), '`to` is left out');
});
