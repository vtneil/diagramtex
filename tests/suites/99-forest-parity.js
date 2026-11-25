// forest trees drawn as forest packs them (src/domain/forest.ts): fit=band forward only, l and s set before computing
// xy, every calign, the tabular of align=, the linguistics option and a default preamble, outer sep, coordinates and a
// bare fill, the folder style, edges in the packing, inserted nodes, pgfmath conditions. The numbers are pdfLaTeX's
// (TeX Live, forest 2.1): each node's x and y in pt from the root's anchor (y up), as forest's own x and y options read.
{
  const layout = (src, tex) => TD.ft.layout({ type: 'forest', x: 0, y: 0, src: `\\begin{forest}\n${src}\n\\end{forest}`, size: 'normalsize', font: 'default', ...(tex ? { tex } : {}) });
  const K = TD.PT_PER_PX, PT = 1 / K;
  const near = (a, b, msg, eps = 0.02) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  // [x, y] of each node in reading order, in pt
  const at = (L) => L.nodes.filter((m) => !m.added).map((m) => [m.ax * K, -m.ay * K]);
  const check = (L, want, msg, eps = 0.02, epsX = eps) => {
    const got = at(L);
    T.eq(got.length, want.length, msg + ': the nodes');
    want.forEach(([x, y], i) => { near(got[i][0], x, `${msg}: node ${i + 1} x`, epsX); near(got[i][1], y, `${msg}: node ${i + 1} y`, eps); });
  };

  T.test('forest parity: fit=band reaches forward only, and a leaf\'s band leaves its box alone', () => {
    // a band two levels down does not push the root's other child: P where it is without the band
    check(layout('[R [X [Y [Z, fit=band [Z1][Z2][Z3]]]] [P]]'), [[0, 0], [-10.442, -27.688], [-10.442, -55.376], [-10.442, -83.063], [-35.285, -110.751], [-10.442, -110.751], [14.401, -110.751], [10.442, -27.688]], 'band', 0.02, 0.05);
    // a directory tree: every leaf banded, l=15pt set before computing xy, rows 19.843pt apart (outer sep included)
    const L = layout("for tree={font=\\ttfamily, grow'=0, child anchor=west, parent anchor=south, anchor=west, calign=first, fit=band, before computing xy={l=15pt}}\n[text1 [text1.1 [text1.1.1][text1.1.2]] [text1.2 [text1.2.1]]]");
    check(L, [[0, 0], [15, 0], [30, 0], [30, -19.843], [15, -39.686], [30, -39.686]], 'dirtree');
    T.ok(L.bb.w < 200 * PT && L.bb.h < 100 * PT, `drawn at its size: ${L.bb.w} × ${L.bb.h}`);
  });

  T.test('forest parity: l and s set before computing xy place the node after packing', () => {
    check(layout('for tree={child anchor=north, parent anchor=south}\n[A [B, before computing xy={l=\\baselineskip}, no edge [C, before computing xy={l=\\baselineskip}, no edge [D [E][F]]]]]'),
      [[0, 0], [0, -12], [0, -24], [0, -51.688], [-10.199, -79.376], [10.199, -79.376]], 'prooftree', 0.02, 0.05);
    // s'+= moves the node across from where packing put it
    const b0 = at(layout('[R [a][b]]'))[2], b1 = at(layout("[R [a][b, before computing xy={s'+=30pt}]]"))[2];
    near(b1[0] - b0[0], 30, 'b 30pt further'); near(b1[1], b0[1], 'at its level');
  });

  T.test('forest parity: calign child, child edge, with current edge, edge midpoint and fixed edge angles', () => {
    check(layout('[R, calign=child edge, parent anchor=south east [a, child anchor=north west][bb][c]]'), [[0, 0], [13.247, -27.688], [35.035, -27.688], [56.550, -27.688]], 'child edge', 0.02, 0.05);
    check(layout('for tree={parent anchor=south, child anchor=north}\n[R [a][b, calign with current edge][ccc]]'), [[0, 0], [-19.011, -27.688], [0, -27.688], [23.181, -27.688]], 'calign with current edge', 0.02, 0.05);
    check(layout('for tree={child anchor=north west}\n[R, calign=edge midpoint [a][bbbb]]'), [[0, 0], [-3.334, -27.688], [24.011, -27.688]], 'edge midpoint', 0.02, 0.05);
    check(layout('[R, calign=child, calign primary child=2 [a][b][c]]'), [[0, 0], [-19.011, -27.688], [0, -27.688], [18.736, -27.688]], 'primary child 2', 0.02, 0.05);
    // fixed edge angles: the children's s scaled to make 35° edges (an empty node's centre is at its base)
    const F = at(layout("for tree={calign=fixed edge angles}\n[CP [,phantom] [C' [C] [TP [,phantom] [T' [T] [VP]]]]]"));
    near(F[1][0], -21.779, 'phantom', 0.05); near(F[2][0], 19.347, "C'", 0.1);
    // or every child's l when the s distance is already wider; coordinates s sep from P2's octagon (its north point)
    const G = at(layout('for tree={l sep=4em,s sep=8em,calign=fixed edge angles}\n[$P_1$,draw,circle [,shape=coordinate,no edge] [$P_2$,draw,circle,anchor=north [a] [b]] [,shape=coordinate,no edge]]'));
    near(G[1][0], -80, 'coordinate s', 0.02); near(G[1][1], -111.590, 'coordinate l', 0.05); near(G[5][0], 80, 'the other coordinate', 0.02);
    near(G[2][1], -125.771, 'P2 l', 0.2);
    // calign angle=45 on empty coordinates: the edges at 45°
    const H = layout('for tree={minimum width=4em, delay={where content={}{shape=coordinate}{}}, calign=fixed edge angles, calign angle=45, grow=north}\n[ [ [ ] [ [] [] ] ] ]');
    const [, p, c] = H.nodes;
    T.ok(H.nodes.every((m) => m.st.shape === 'coordinate' && m.w === 0), 'coordinates');
    near(Math.abs(c.ax - p.ax), Math.abs(c.ay - p.ay), 'a 45° edge (px)', 0.05);
  });

  T.test('forest parity: align= is a tabular: rows at least a strut each, the baseline on the first row (base=bottom: the last, any other base: centred)', () => {
    const L = layout('for tree={draw}\n[root [ab\\\\cd, align=center] [x\\\\y\\\\z, align=center] [one, align=center] [pq\\\\rs, align=center, base=bottom]]');
    const NS = L.nodes.slice(1).map((m) => [-(m.y - m.h / 2 - m.osy) * K, -(m.y + m.h / 2 + m.osy) * K, -m.ay * K]);
    // north and south anchors (on the outer sep) about the baseline at -39.199
    [[-27.266, -58.332], [-27.266, -70.332], [-27.266, -46.332], [-15.266, -46.332]].forEach(([n, s], i) => { near(NS[i][2], -39.199, `node ${i + 1} baseline`); near(NS[i][0], n, `node ${i + 1} north`); near(NS[i][1], s, `node ${i + 1} south`); });
    T.eq(L.nodes[2].rows.map((r) => r.t), ['x', 'y', 'z'], 'three rows');
    // base=b (or t, c …) is no tabular position to forest (base/.unknown): the rows centred on the math axis; the
    // first row's baseline on that level, the second node's box 5.9pt higher than base=bottom would put it
    const C = layout('[root [ab\\\\cd, align=center, draw] [x\\\\y, align=left, base=b, draw]]');
    const NC = C.nodes.slice(1).map((m) => [-(m.y - m.h / 2 - m.osy) * K, -(m.y + m.h / 2 + m.osy) * K, -m.ay * K]);
    [[-21.366, -52.432], [-15.266, -46.332]].forEach(([n, s], i) => { near(NC[i][2], -33.299, `centred: node ${i + 1} baseline`); near(NC[i][0], n, `centred: node ${i + 1} north`); near(NC[i][1], s, `centred: node ${i + 1} south`); });
    // without align or text width TikZ drops a \\
    T.eq(layout('[TRANSMISSION \\\\LINE]').nodes[0].t, 'TRANSMISSION LINE', 'one line');
  });

  T.test('forest parity: the linguistics option and a default preamble are applied before the tree\'s own', () => {
    const doc = (pre) => `\\documentclass{article}\n${pre}\n\\begin{document}\n\\begin{forest}\n[A [B][C [D]]]\n\\end{forest}\n\\end{document}`;
    const sh = TD.importLatex(doc('\\usepackage[linguistics]{forest}')).blocks.flatMap((b) => b.shapes || []).find((s) => s.type === 'forest');
    T.ok(sh && sh.tex.pkgs.includes('forest[linguistics]'), 'the option kept: ' + JSON.stringify(sh && sh.tex));
    const L = TD.ftLayout(sh);
    check(L, [[0, 0], [-10.442, -30.799], [10.442, -30.799], [10.442, -61.598]], 'align=center: a strut in every node', 0.02, 0.05);
    // sn edges: from the parent's children anchor (south) to the child's parent anchor (north)
    const [A, B] = L.nodes, e = L.edges.find((x) => x.i === B.i);
    near(e.pts[0][1], A.y + A.h / 2 + A.osy, 'from A.south'); near(e.pts[1][1], B.y - B.h / 2 - B.osy, 'to B.north');
    T.ok(/\\usepackage\[linguistics\]\{forest\}/.test(TD.toTikz([sh], { standalone: true })), 'written back');
    // \forestset{default preamble=…}: grow=east and boxes for every tree
    const G = layout('[R [a][b]]', { preamble: '\\forestset{default preamble={for tree={draw}, grow=east}}' });
    check(G, [[0, 0], [27.688, -9.019], [27.688, 9.019]], 'default preamble', 0.02, 0.02);
    T.ok(G.nodes.every((m) => m.st.draw), 'drawn');
  });

  T.test('forest parity: outer sep in the packing, coordinates, shape=, a bare fill', () => {
    check(layout('for tree={outer sep=2pt}\n[R [a][b][c]]'), [[0, 0], [-22.475, -29.343], [0.137, -29.343], [22.475, -29.343]], 'outer sep 2pt', 0.02, 0.05);
    check(layout('[R [,coordinate][A][,coordinate]]'), [[0, 0], [-13.952, -27.688], [0, -27.688], [13.952, -27.688]], 'coordinates', 0.02, 0.05);
    const L = layout('[R, shape=circle, draw [a, fill] [b, fill, red] [c, color=blue, fill]]');
    T.eq(L.nodes[0].st.shape, 'circle', 'shape=circle');
    T.eq(L.nodes[1].st.fill, true, 'fill alone: the ink');
    T.eq(L.nodes[2].st.fill, TD.tikzColor('red'), 'a colour after it'); T.eq(L.nodes[3].st.fill, TD.tikzColor('blue'), 'color=');
    T.ok(/<rect[^>]*fill="(#000000|#000|black)"/.test(TD.TYPES.forest.svg({ type: 'forest', x: 0, y: 0, src: '\\begin{forest}[a, fill]\\end{forest}', size: 'normalsize', font: 'default', color: '#000000' }, { export: true })), 'drawn filled');
  });

  T.test('forest parity: the folder style, edges in the packing, insert before', () => {
    // forest-lib-edges' folder: first child l sep out, children past the parent's s extent, edges from the
    // -children last corner; a leaf with outer sep=1pt and the edge from m to b keep p down
    check(layout("highlight/.style={fill=cyan,rounded corners,inner sep=1pt,outer sep=1pt},\nfor tree={folder,grow'=0,s sep=0.4ex, where n children=0{highlight}{}}\n[q [m [a][b]] [p]]"),
      [[0, 0], [11.733, -14.638], [23.466, -27.332], [23.466, -37.359], [11.733, -41.433]], 'folder', 0.02);
    check(layout("for tree={folder,grow'=0,s sep=0.4ex}\n[q [m [a][b]] [p]]"), [[0, 0], [11.733, -14.638], [23.466, -27.332], [23.466, -40.425], [11.733, -56.165]], 'folder plain', 0.02);
    // an edge from a south west corner pushes the next sibling down
    check(layout("for tree={grow'=0, anchor=west, child anchor=west, parent anchor=south west, calign=first}\n[sys [lib [A][P]] [t]]"),
      [[0, 0], [31.966, 0], [61.876, 0], [61.876, -20.566], [31.966, -25.246]], 'edge packed', 0.02, 0.05);
    check(layout('[R [A [x, l=60pt][y, l=60pt]] [BBBBBBBBB]]'), [[0, 0], [-24.679, -27.688], [-34.184, -87.688], [-15.173, -87.688], [24.679, -27.688]], 'edges between subtrees', 0.02, 0.05);
    // insert before={[,phantom]} on each first child: forest adds the phantom, the children one row down
    const I = layout("for tree={grow'=0, anchor=west, child anchor=west, parent anchor=south, calign=first, before typesetting nodes={if n=1{insert before={[,phantom]}}{}}, before computing xy={l=15pt}}\n[sys [conf] [lib [A][P]] [t]]");
    T.eq(I.nodes.filter((m) => m.added).length, 2, 'two phantoms');
    const P = at(I);
    [[15, -17.212], [15, -37.889], [30, -55.043], [30, -75.609]].forEach(([x, y], i) => { near(P[i + 1][0], x, `node ${i + 2} x`); near(P[i + 1][1], y, `node ${i + 2} y`, 0.05); });
  });

  T.test('forest parity: pgfmath conditions, .wrap pgfmath arg, tiers, a non-uniform subtree\'s level', () => {
    const W = layout('where={iseven(level())}{fill=red}{}, if={n_children()>1}{draw}{},\n[R [a [b]] [c]]');
    T.eq(W.nodes.map((m) => !!m.st.fill), [true, false, true, false], 'iseven(level())');
    T.eq(W.nodes.map((m) => m.st.draw), [true, false, false, false], 'n_children()>1');
    const D = layout('where n children=0{label/.wrap pgfmath arg={right:#1}{content()}, content={}}{},\n[R [a1][b2]]');
    T.eq(D.marks.map((m) => m.t), ['a1', 'b2'], 'labels from the content'); T.eq(D.nodes.map((m) => m.t), ['R', '', ''], 'the content emptied');
    // tier=word with align=center: every leaf at 3 × 30.799 (the l sep push is not counted twice)
    const T1 = layout('for tree={parent anchor=south, child anchor=north,align=center,base=bottom,where n children=0{tier=word,edge=dotted}{}}\n[V [N [D [the] ] [child] ] [reads] [N [D [a] ] [book] ] ]');
    T1.nodes.filter((m) => !m.kids.length).forEach((m) => near(-m.ay * K, -92.397, `${m.t} on the tier`));
    // a child growing another way: its whole subtree is pushed clear by l sep
    check(layout("[R [A, grow'=0 [x][y][z]] [B]]"), [[0, 0], [-23.803, -42.117], [3.885, -23.104], [3.885, -41.148], [3.885, -61.131], [23.803, -42.117]], 'non-uniform growth', 0.03, 0.05);
  });

  T.test('forest parity: tikz-qtree\'s sibling distance between the nodes\' bounding boxes, drawn or not', () => {
    // (TeX: the base anchors of S, NP, the, dog, VP; a drawn node's box takes in half its line width)
    const tree = (pic) => {
      const doc = `\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{tikz-qtree}\n\\begin{document}\n\\begin{tikzpicture}${pic}\n\\Tree [.S [.NP the dog ] VP ]\n\\end{tikzpicture}\n\\end{document}`;
      return TD.ftLayout(TD.importLatex(doc).blocks.flatMap((b) => b.shapes || []).find((x) => x.type === 'forest'));
    };
    check(tree(''), [[0, 0], [-17.645, -30], [-29.339, -60], [-5.951, -60], [17.645, -30]], 'plain', 0.02);
    check(tree('[sibling distance=10pt, every node/.style={draw, thick}]'), [[0, 0], [-24.245, -30], [-40.339, -60], [-8.151, -60], [24.245, -30]], 'drawn thick', 0.02);
    // the: east, dog: west (on the outer sep), 6.4pt apart with draw and outer sep=2pt, 6pt without draw
    for (const [pic, d] of [['[sibling distance=10pt, every node/.style={draw, outer sep=2pt}]', 6.4], ['[sibling distance=10pt, every node/.style={outer sep=2pt}]', 6], ['[sibling distance=10pt, every node/.style={thick}]', 9.2]]) {
      const L = tree(pic), [x, y] = [L.nodes[2], L.nodes[3]];
      near(((y.x - y.w / 2 - y.osx) - (x.x + x.w / 2 + x.osx)) * K, d, pic);
    }
    // drawn boxes with a text width of one line (a minipage: the glyphs' height and depth, no strut), 0.25in apart
    const doc = String.raw`\documentclass{article}
\usepackage{tikz}
\usepackage{tikz-qtree}
\begin{document}
\begin{tikzpicture}[grow'=right,level distance=1.25in,sibling distance=.25in]
\tikzset{every tree node/.style={draw,minimum width=1in,text width=1in,align=center}}
\Tree [. parent [.{nice child0} [.{grandchild0-0 } ] [.{grandchild0-1 } ] ] [.child1 ] ]
\end{tikzpicture}
\end{document}`;
    const W = TD.ftLayout(TD.importLatex(doc).blocks.flatMap((b) => b.shapes || []).find((x) => x.type === 'forest'));
    const C = W.nodes.map((m) => [(m.x - W.nodes[0].x) * K, -(m.y - W.nodes[0].y) * K]);
    [[90.338, 25.031], [180.675, 42.042], [180.675, 8.019], [90.338, -25.031]].forEach(([x, y], i) => { near(C[i + 1][0], x, `text width: node ${i + 2} x`, 0.05); near(C[i + 1][1], y, `text width: node ${i + 2} y`, 0.05); });
    near(W.nodes[2].h * K, 15.555, 'one line: its glyphs, no strut', 0.05);
  });

  T.test('forest parity: name/.pic is a pic, and a macro after a digit joins the number', () => {
    const R = TD.importInternals.drawWith('\\draw (0,0) pic {folder};', {}, '\\def\\Size{4pt}\n\\tikzset{folder/.pic={\\draw (-1.05*\\Size,0.2\\Size+5pt) rectangle ++(.75*\\Size,-0.2\\Size-5pt);}}');
    T.eq(R.issues, [], 'no issues');
    T.eq(R.shapes.length, 1, 'the pic drawn');
    const b = TD.bbox(R.shapes[0]);
    // 0.2\Size+5pt is 0.24pt+5pt, as TeX reads it (the box with the line's half width each side)
    near(b.h * K, 5.24 + 0.4, 'its height (pt)', 0.05);
  });
}
