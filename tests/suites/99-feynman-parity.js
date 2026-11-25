// tikz-feynman as pdfLaTeX draws it (src/domain/feynman.ts): there the package's automatic layouts are ignored and
// \graph places the nodes it makes itself, a \vertex with no place is at the origin, the environment is on grid, and
// the picture's scale reaches `at` positions only. The numbers below are pdfLaTeX's (TeX Live 2026, tikz-feynman
// 1.1): node centres from \pgfpointanchor after \pgftransformreset, and bounding boxes, in pt.
{
  const doc = (body, opts = '', pre = '') => `\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{tikz-feynman}\n\\usetikzlibrary{calc}\n${pre}\\begin{document}\n${opts == null ? body : `\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}`}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));
  const K = TD.PT_PER_PX;
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  // a vertex's centre in pt on the page about the block's origin (y up)
  const at = (L, nm) => { const n = L.nodes.get(nm); return n ? [n.x * K, -n.y * K] : [NaN, NaN]; };
  const nearAt = (L, nm, x, y, eps = 0.05) => { const [a, b] = at(L, nm); near(a, x, nm + ' x', eps); near(b, y, nm + ' y', eps); };
  const feyn = (sh) => sh.find((s) => s.type === 'feynman');
  const edited = (sh) => TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });

  T.test('feynman parity: \\feynmandiagram is a picture with a Feynman block, its nodes where \\graph puts them', () => {
    const sh = shapesOf(doc('\\feynmandiagram[large]{a -- {b,c} -- d, e -- f; g -- {h,{i,j}} -- k};', null));
    const q = feyn(sh);
    T.ok(q, 'a Feynman block: ' + sh.map((s) => s.type));
    T.eq(q.src, '\\feynmandiagram[large]{a -- {b,c} -- d, e -- f; g -- {h,{i,j}} -- k};', 'its code as written');
    const L = TD.feyn.layout(q);
    // each chain a row down (a group's chains each a row), each new node a column on; 1cm whatever the size
    const C = 28.45274;
    for (const [nm, x, y] of [['a', 0, 0], ['b', 1, 0], ['c', 1, -1], ['d', 2, 0], ['e', 0, -2], ['f', 1, -2], ['g', 0, -3], ['h', 1, -3], ['i', 1, -4], ['j', 1, -5], ['k', 2, -3]]) nearAt(L, nm, x * C, y * C);
    T.eq(L.edges.length, 11, 'every edge (into a group: each chain\'s first node; out of one: each chain\'s last)');
    // large: the graph's edges thick
    near(L.paths[0].sw * K, 0.8, 'large edges are thick');
    T.eq(L.warnings, ['\\feynmandiagram lays the diagram out itself under LuaLaTeX: it is drawn as pdfLaTeX and XeLaTeX draw it, each chain a row and each new vertex 1cm on'], 'no guess, only what it is drawn as');
    // written into a picture as the same graph in a feynman environment (a \tikz in a picture is a picture in one)
    const tex = edited(sh);
    T.ok(/\\begin\{feynman\}\[large\]\s*\\diagram \[large\] \{a -- \{b,c\}/.test(tex), 'as \\diagram in the environment:\n' + tex);
    T.tex('feynman-parity-feynmandiagram', tex);
  });

  T.test('feynman parity: \\diagram syntax: ; between chains, \\diagram *, - - and {[edges=…] …} groups', () => {
    const sh = shapesOf(doc(String.raw`\begin{feynman}
\vertex (a) at (0,0); \vertex (b) at (1,0); \vertex (c) at (2,0); \vertex (d) at (3,0);
\newcommand\len{0.7cm}
\diagram * {(a) - - [photon] (b); {[edges=fermion] (b) -- (c), (c) -- [scalar] (d)}};
\end{feynman}`));
    T.eq(kept(sh), [], 'nothing kept');
    const L = TD.feyn.layout(feyn(sh));
    T.eq(L.edges.map((e) => `${e.a}-${e.b}:${e.type}`), ['a-b:photon', 'b-c:fermion', 'c-d:scalar'], 'every edge, the group\'s edges=fermion before the edge\'s own');
    T.eq(L.warnings, [], 'nothing it can\'t draw');
  });

  T.test('feynman parity: a \\vertex with no place is at the origin; placed from a coordinate, the new node\'s anchor goes there', () => {
    const sh = shapesOf(doc(String.raw`\begin{feynman}[node distance=8mm and 8mm]
\vertex (a) {\(g\)}; \vertex [below right=of a] (b); \vertex [below left=of b] (c) {\(g\)}; \vertex [right=of b] (e) {X}; \vertex [right=of e] (f);
\vertex [dot, above=of b] (d) {};
\diagram*{(a) -- [gluon] (b) -- [fermion] (c), (b) -- (e) -- (f), (b) -- (d)};
\end{feynman}`));
    T.eq(kept(sh), [], 'nothing kept');
    const L = TD.feyn.layout(feyn(sh));
    nearAt(L, 'a', 0, 0);
    // y and x: no 0.707 along the diagonal; centre to centre from a node with a border (on grid)
    nearAt(L, 'b', 22.762, -22.762);
    // from the coordinate b: the north east corner of c, the west side of e, the south of the dot d (its radius)
    nearAt(L, 'c', -6.097, -52.182, 0.4);
    nearAt(L, 'd', 22.762, 2.134);
    nearAt(L, 'e', 52.807, -22.762, 0.4);
    nearAt(L, 'f', 75.570, -22.762, 0.4);
  });

  T.test('feynman parity: the picture\'s scale reaches `at` only; under transform shape placing and \\graph scale too', () => {
    const body = String.raw`\begin{feynman}\vertex (a) at (2,0); \vertex [right=of a] (b) {X}; \diagram*{(a) -- (b), c -- d};\end{feynman}`;
    for (const [opts, b, d] of [['scale=0.5', 78.415, 28.453], ['scale=0.5, transform shape', 53.434, 14.226]]) {
      const sh = shapesOf(doc(body, opts));
      T.eq(kept(sh), [], 'nothing kept: ' + opts);
      const q = feyn(sh), L = TD.feyn.layout(q);
      T.ok(/scale=0\.5/.test(q.wrap), 'the block holds the scale: ' + q.wrap);
      nearAt(L, 'a', 28.453, 0); nearAt(L, 'b', b, 0, 0.4); nearAt(L, 'c', 0, 0); nearAt(L, 'd', d, 0);
      const tex = edited(sh);
      T.ok(new RegExp(`\\\\begin\\{scope\\}\\[shift=\\{[^}]*\\}, ${opts.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`).test(tex), 'written in its scope:\n' + tex);
    }
  });

  T.test('feynman parity: \\node, \\coordinate and calc in the environment, and its \\draw as the picture\'s own', () => {
    const sh = shapesOf(doc(String.raw`\begin{feynman}
\node[circle, fill=black, inner sep=0pt, minimum size=20pt] (m) at (0,0) {};
\vertex (a) at (225:2cm) {\(e^+\)}; \vertex (b) at (45:2cm);
\coordinate (h) at ($(m)!0.5!(b)$);
\vertex (k) at ($(h) + (0,1)$);
\diagram*{(a) -- [photon] (m) -- [fermion] (b), (h) -- (k)};
\draw (a) -- (k);
\end{feynman}
\draw (b) -- (k);`));
    T.eq(kept(sh), [], 'nothing kept');
    const q = feyn(sh), L = TD.feyn.layout(q);
    T.ok(!/\\draw/.test(q.src), 'the \\draw is not the block\'s: ' + q.src);
    nearAt(L, 'a', -40.238, -40.238); nearAt(L, 'b', 40.238, 40.238); nearAt(L, 'h', 20.119, 20.119); nearAt(L, 'k', 20.119, 48.572);
    T.ok(L.shapes.some((s) => s.kind === 'disc' && Math.abs(s.r * K - 10) < 0.01), 'the 20pt disc');
    // the line from a starts on its border; both lines are lines of the picture
    const lines = sh.filter((s) => s.type === 'line');
    T.eq(lines.length, 2, 'the two \\draw lines: ' + sh.map((s) => s.type));
    const kx = q.x - L.bb.x + L.nodes.get('k').x;
    T.ok(lines.every((l) => Math.abs(l.x2 - kx) < 0.5), 'both end at k');
    T.eq(L.warnings, [], 'nothing it can\'t draw');
  });

  T.test('feynman parity: a node \\graph makes placed from another (off grid outside an environment), and loops', () => {
    const L = TD.feyn.layout({ src: '\\feynmandiagram{a[dot] -- c[dot] -- b[dot], c -- d[dot, above=2cm of c]};' });
    // the place above=2cm of c (c's north to d's south), then the graph's own column and row (0, -1cm)
    nearAt(L, 'a', 0, 0); nearAt(L, 'c', 28.453, 0); nearAt(L, 'd', 28.453, 32.721);
    // a loop of the graph's own names is drawn, controls at min distance out of the dot; one between (refs) is not
    const bb = (src) => { const M = TD.feyn.layout({ src }); return [M.bb.x * K, -(M.bb.y + M.bb.h) * K, (M.bb.x + M.bb.w) * K, -M.bb.y * K]; };
    const b1 = bb('\\feynmandiagram{a -- b [dot] -- [out=135, in=45, loop, min distance=3cm] b -- c};');
    near(b1[3], 62.066, 'the loop\'s top', 0.1); near(b1[2], 90.519, 'its right', 0.1);
    const b2 = bb('\\begin{feynman}\\vertex[dot] (b) at (0,0) {};\\diagram*{(b) -- [out=135,in=45,loop,min distance=3cm] (b)};\\end{feynman}');
    near(b2[3], 2.334, 'no loop between refs', 0.1);
  });

  T.test('feynman parity: small and large arrows, and a vertex without {…} is a coordinate', () => {
    // a fermion arrow at the end of a 2cm line: its tip ahead of the end, half its base across
    for (const [sz, top, half] of [['small', 59.58, 2.194], ['medium', 60.604, 2.743], ['large', 60.946, 2.925]]) {
      const L = TD.feyn.layout({ src: `\\begin{feynman}[${sz}]\\vertex (a) at (0,0); \\vertex (b) at (0,2);\\diagram*{(a) -- [with arrow=1] (b)};\\end{feynman}` });
      near(-L.bb.y * K, top, sz + ' tip', 0.1);
      near(L.bb.w / 2 * K, half, sz + ' half the base', 0.05);
    }
    const L = TD.feyn.layout({ src: '\\begin{feynman}\\vertex [dot] (a) at (0,0); \\vertex (b) at (2,0);\\diagram*{(a) -- (b)};\\end{feynman}' });
    T.eq(L.shapes.filter((s) => s.kind === 'dot').length, 0, 'no dot without {}');
  });

  T.test('feynman parity: written back, a node \\graph placed is a \\vertex where it was', () => {
    const src = '\\feynmandiagram[scale=0.5]{i1 [particle=\\(e^-\\)] -- [fermion] a -- [photon] b, a -- f1};';
    const M = TD.feyn.parse(src), L0 = TD.feyn.layout({ src });
    const code = TD.feyn.write(M), L1 = TD.feyn.layout({ src: code });
    T.ok(/\\vertex \(i1\) at \(0,0\) \{\\\(e\^-\\\)\};/.test(code) && /\\vertex \(b\) at \(4,0\);/.test(code), 'at the graph\'s place over the scale:\n' + code);
    for (const nm of ['i1', 'a', 'b', 'f1']) { const [x, y] = at(L0, nm); nearAt(L1, nm, x, y); }
    T.tex('feynman-parity-written', doc(code, ''));
  });

  T.test('feynman parity: every vertex set in the environment, macros and pgfmath in places, calc turned', () => {
    const L = TD.feyn.layout({ src: String.raw`\begin{feynman}
\vertex (a) at (0,0); \tikzfeynmanset{every vertex={dot,minimum size=4mm}} \vertex [right=1.5cm of a] (v);
\vertex (d) at ($(a)!0.5!(v)!0.7cm!90:(v)$);
\newcommand\w{0.5cm}
\pgfmathsetmacro\h{2*sin(pi/6 r)}
\vertex [above=\h cm of a] (u);
\vertex [left={2*\w} of a] (l);
\diagram*{(a) -- (v), (a) -- [draw=none, fermion] (d)};
\end{feynman}` });
    // the vertices after the set are 4mm dots: placed from the coordinate a, by their border
    nearAt(L, 'v', 48.370, 0); nearAt(L, 'd', 24.185, 19.917); nearAt(L, 'u', 0, 34.142); nearAt(L, 'l', -34.143, 0);
    T.eq(L.shapes.filter((s) => s.kind === 'dot').length, 4, 'four dots');
    T.eq(L.paths.length, 1, 'draw=none: no line (its arrow stays)');
    T.eq(L.shapes.filter((s) => s.kind === 'tri').length, 1, 'the arrow');
    T.eq(L.warnings, [], 'nothing it can\'t draw');
  });
}
{
  // tikz-feynman's every diagram sets medium (node distance 1.5cm) before the diagram's own keys, so a node the diagram
  // makes and places by `of` takes the diagram's distance, not the environment's; small and large on the diagram (not
  // medium) size its dots, and on a vertex only before its style. Measured in TeX Live 2026 (pgfpointanchor, pt)
  const K = TD.PT_PER_PX;
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const xOf = (L, nm) => L.nodes.get(nm).x * K;
  const half = (L) => (L.bb.h / 2) * K;
  T.test('feynman parity: a node the diagram places by `of` takes the diagram\'s node distance; its sizes size its dots', () => {
    for (const [src, b, c] of [
      ['\\begin{feynman}[large]\\vertex (a) at (0,0);\\diagram*{(a) -- b[right=of a]};\\vertex [right=of a] (c);\\end{feynman}', 42.679, 56.906],
      ['\\begin{feynman}[node distance=3cm]\\vertex (a) at (0,0);\\diagram*{(a) -- b[right=of a]};\\vertex [right=of a] (c);\\end{feynman}', 42.679, 85.358],
      ['\\begin{feynman}\\vertex (a) at (0,0);\\diagram*[large]{(a) -- b[right=of a]};\\end{feynman}', 56.906, null],
    ]) {
      const L = TD.feyn.layout({ src });
      near(xOf(L, 'b'), b, 'b: ' + src); if (c != null) near(xOf(L, 'c'), c, 'c: ' + src);
    }
    // \feynmandiagram[#1][#2]: the graph's distance is #2's (one group serves as both)
    for (const [o, b] of [['[large][]', 73.977], ['[small]', 58.328], ['[large, node distance=3cm][]', 73.977], ['[large][node distance=3cm]', 116.656], ['[][large]', 88.204]])
      near(xOf(TD.feyn.layout({ src: `\\feynmandiagram${o}{a[dot] -- b[right=of a]};` }), 'b'), b, o);
    // the dot's half bounding box: a large dot 3.045, medium 2.334, small 1.623
    for (const [src, h] of [['\\begin{feynman}\\diagram*[large]{a[dot]};\\end{feynman}', 3.045], ['\\begin{feynman}\\diagram*[small]{a[dot]};\\end{feynman}', 1.623],
      ['\\begin{feynman}[large]\\diagram*[medium]{a[dot]};\\end{feynman}', 3.045], ['\\begin{feynman}\\vertex[large, dot] (a) at (0,0) {};\\end{feynman}', 3.045],
      ['\\begin{feynman}\\vertex[dot, large] (a) at (0,0) {};\\end{feynman}', 2.334]]) near(half(TD.feyn.layout({ src })), h, src, 0.01);
  });
  T.test('feynman parity: written back under the picture\'s scale, the diagram\'s nodes stay where they were', () => {
    const wrap = 'scale=0.5';
    for (const src of ['\\begin{feynman}\\diagram*[large]{a[dot] -- b[right=of a] -- c};\\end{feynman}', '\\feynmandiagram[][large]{a[dot] -- b};', '\\feynmandiagram[small]{a -- [fermion] b[dot] -- c};']) {
      const code = TD.feyn.write(TD.feyn.parse(src), wrap), L0 = TD.feyn.layout({ src, wrap }), L1 = TD.feyn.layout({ src: code, wrap });
      for (const [nm, n] of L0.nodes) { const m = L1.nodes.get(nm); T.ok(m && Math.abs(m.x - n.x) < 0.01 && Math.abs(m.y - n.y) < 0.01 && Math.abs(m.r - n.r) < 0.01, `${nm} where it was:\n${code}`); }
      T.eq(L1.edges.map((e) => e.type), L0.edges.map((e) => e.type), 'the same propagators');
      T.tex('feynman-parity-wrap-' + src.length, `\\documentclass{article}\n\\usepackage{tikz-feynman}\n\\begin{document}\n\\begin{tikzpicture}[${wrap}]\n${code}\n\\end{tikzpicture}\n\\end{document}`);
    }
    // a place the drawing can't read is written as it was
    const code = TD.feyn.write(TD.feyn.parse('\\begin{feynman}\\vertex (a) at (\\q,0);\\vertex (b) at (1,0);\\diagram*{(a)--(b)};\\end{feynman}'));
    T.ok(/\\vertex \(a\) at \(\\q,0\);/.test(code), code);
  });
  T.test('feynman parity: an unclosed [ in a diagram ends the reading with a warning', () => {
    for (const src of ['\\begin{feynman}\\vertex (a); \\vertex [right=of a] (b);\\diagram*{(a) -- [fermion (b)};\\end{feynman}', '\\begin{feynman}\\diagram*[small {a -- b};\\end{feynman}',
      '\\feynmandiagram{a [dot -- b};', '\\feynmandiagram{{[edges=fermion a -- b}};', '\\feynmandiagram{(a) [dot -- b};']) {
      const L = TD.feyn.layout({ src });
      T.ok(L.warnings.some((w) => /not closed/.test(w)), src + ': ' + JSON.stringify(L.warnings));
    }
  });
}
