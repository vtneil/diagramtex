// tikz-qtree trees (\Tree [.S …]) come in as Tree blocks written for forest (src/domain/forest-qtree.ts), with
// tikz-qtree's distances, packing and edge anchors; and what forest says that the Tree block now draws: where / if
// conditions, fit=rectangle, a node's anchor, parent and child anchors, edge labels beside their edge.
{
  const pic = (body, opts = '', pre = '') => `\\documentclass{article}\n\\usepackage{tikz,tikz-qtree}\n${pre}\\begin{document}\n\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
  const drawn = (src) => shapesOf(src).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const layout = (src) => TD.ft.layout({ type: 'forest', x: 0, y: 0, src, size: 'normalsize', font: 'default' });
  const near = (a, b, msg, eps = 0.01) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const PT = 1 / TD.PT_PER_PX; // px per pt

  T.test('qtree: a tree is a Tree block with tikz-qtree\'s distances, packing and edges', () => {
    const sh = drawn(pic('\\Tree [.S [.NP [.Det the ] [.N cat ] ] [.VP sat ] ]'));
    T.eq(sh.map((s) => s.type), ['forest']);
    const src = sh[0].src;
    T.ok(/for tree=\{anchor=base|for tree=\{l=30pt/.test(src) || src.includes('l=30pt, l sep=0pt, s sep=1.6pt, fit=rectangle, parent anchor=south, child anchor=north'), 'tikz-qtree\'s model:\n' + src);
    T.ok(src.includes('[S') && src.includes('[NP') && src.includes('[Det [the]]') && src.includes('[VP [sat]]'), 'the tree:\n' + src);
    // every level 30pt below the last, baseline to baseline
    const L = layout(src), [S, NP, Det] = L.nodes;
    near(NP.ay - S.ay, 30 * PT, 'level distance');
    near(Det.ay - NP.ay, 30 * PT, 'and the next');
    // edges from the parent's south to the child's north
    const e = L.edges.find((x) => x.i === NP.i);
    near(e.pts[0][1], S.y + S.h / 2 + S.osy, 'from the south of S'); near(e.pts[1][1], NP.y - NP.h / 2 - NP.osy, 'to the north of NP');
    // the root's anchor (its baseline) is at the picture's origin
    near(sh[0].x - L.bb.x, 0, 'origin x'); near(sh[0].y - L.bb.y, 0, 'origin y');
    T.tex('qtree-basic', TD.toTikz(sh, { standalone: true }));
  });

  T.test('qtree: settings from the preamble, the picture and \\tikzset; roofs, edges and their labels', () => {
    const src = pic(String.raw`\tikzset{sibling distance=1cm}
\Tree [.\node (a) {a}; [.NP [.Det the ] [.N cat ] ] \edge[roof]; {sat on the mat} \edge[dashed] node[auto=right]{x}; [.VP b ] ]`,
    "grow'=right, level distance=2cm", '\\tikzset{every tree node/.style={align=center,anchor=north}}\n');
    const sh = drawn(src);
    T.eq(sh.map((s) => s.type), ['forest']);
    const f = sh[0].src;
    for (const x of ['align=center', 'anchor=north', "grow'=east", 'l=2cm', 's sep=28.05pt', 'parent anchor=east', 'child anchor=west', 'name=a', '[sat on the mat, roof]', 'edge+={dashed}', 'edge label={node[auto=right]{x}}'])
      T.ok(f.includes(x), x + ' in\n' + f);
    T.tex('qtree-settings', TD.toTikz(shapesOf(src), { standalone: true }));
  });

  T.test('qtree: every tree node replaced without an anchor is centred (TikZ\'s default)', () => {
    const f = drawn(pic('\\Tree [.A B C ]', '', '\\tikzset{every tree node/.style={draw,circle}}\n'))[0].src;
    T.ok(f.includes('draw, circle') && f.includes('anchor=center'), f);
    const L = layout(f);
    near(L.nodes[1].ay - L.nodes[0].ay, 30 * PT, 'centre to centre');
    near(L.nodes[0].y, 0, 'the root centred on the origin');
  });

  T.test('qtree: square edges are forked edges; level and frontier styles; leaf and inner node styles', () => {
    const f = drawn(pic('\\Tree [.S [.NP a ] [.VP [.V b ] c ] ]', 'level 1/.style={level distance=40pt}, frontier/.style={distance from root=100pt}, every leaf node/.style={font=\\itshape}',
      '\\tikzset{edge from parent/.style={draw, edge from parent path={(\\tikzparentnode.south) -- +(0,-8pt) -| (\\tikzchildnode)}}}\n'))[0].src;
    for (const x of ['forked edges', 'fork sep=8pt', 'where level={1}{l=40pt}{}'])
      T.ok(f.includes(x), x + ' in\n' + f);
    T.ok(!f.includes('parent anchor=south'), 'the fork takes the anchors:\n' + f);
    const L = layout(f), by = (c) => L.nodes.find((n) => n.t === c);
    // the leaves are 100pt below the root, whatever their depth
    for (const leaf of ['a', 'b', 'c']) near(by(leaf).ay - by('S').ay, 100 * PT, `leaf ${leaf} on the frontier`, 0.05);
    near(by('NP').ay - by('S').ay, 40 * PT, 'level 1 at 40pt');
    T.ok(by('a').st.italic && !by('NP').st.italic, 'leaves in italics, inner nodes not');
    // the edge goes down, across, then down to the child
    const e = L.edges.find((x) => x.i === by('NP').i);
    T.eq(e.pts.length, 4, 'forked');
    T.tex('qtree-forked', `\\documentclass{standalone}\\usepackage[edges]{forest}\\begin{document}${f}\\end{document}`);
  });

  T.test('qtree: names in the tree are places for the statements after it', () => {
    const sh = drawn(pic('\\Tree [.\\node (s) {S}; [.\\node (n) {NP}; a ] [.VP b ] ]\n\\draw[->] (n) to[bend right] (s);'));
    T.eq(sh.map((s) => s.type), ['forest', 'curve']);
    const L = layout(sh[0].src), S = L.nodes[0], ox = sh[0].x - L.bb.x, oy = sh[0].y - L.bb.y;
    const c = sh[1], d = (x, y, n) => Math.hypot(x - (ox + n.x), y - (oy + n.y));
    T.ok(d(c.x1, c.y1, L.nodes[1]) < L.nodes[1].w && d(c.x2, c.y2, S) < S.w, 'from NP to S');
  });

  T.test('qtree: a tree whose nodes code kept as code names stays as code, drawn as the block would', () => {
    // \\linkto is a command the importer does not know: kept as written, and it names (s)
    const all = shapesOf(pic('\\Tree [.\\node (s) {S}; a b ]\n\\linkto (s) -- ++(1,0);', '', '\\newcommand{\\linkto}{\\draw[red]}\n'));
    const kept = all.filter((s) => s.type === 'tikz' && s.kind !== 'defs');
    const tree = kept.find((k) => /\\Tree/.test(k.code));
    T.ok(tree, 'the tree kept: ' + JSON.stringify(kept.map((k) => k.code)));
    T.eq(tree.prev.map((p) => p.type), ['forest'], 'previewed as the Tree block');
    T.ok(tree.issues.some((w) => /names its nodes/.test(w)), tree.issues.join('; '));
    T.ok(!all.some((s) => s.type === 'forest'), 'no block beside it');
    T.tex('qtree-kept', TD.toTikz(all, { standalone: true }));
  });

  T.test('qtree: an edited tree is written for forest; the tree as imported is written as it was, with its package', () => {
    const all = shapesOf(pic('\\Tree [.S [.NP a ] [.VP b ] ]'));
    const asIs = TD.toTikz(all, { standalone: true });
    T.ok(/\\Tree/.test(asIs) && /\\usepackage\{tikz-qtree\}/.test(asIs), asIs);
    const fresh = all.map((s) => { const q = { ...s }; delete q.tex; return q; });
    const ed = TD.toTikz(fresh, { standalone: true });
    T.ok(/\\begin\{forest\}/.test(ed) && !/\\Tree/.test(ed), ed);
    T.tex('qtree-forest', ed);
  });

  T.test('qtree: tikz-qtree-compat trees: \\qroof, _ and ^ as maths, primes', () => {
    const src = `\\documentclass{article}\n\\usepackage{tikz,tikz-qtree,tikz-qtree-compat}\n\\begin{document}\n\\begin{tikzpicture}\n\\Tree [.TP [.T\\1 N_1 \\qroof{the big cat}.DP ] ]\n\\end{tikzpicture}\n\\end{document}`;
    const f = drawn(src)[0].src;
    T.ok(f.includes("[T$'$") && f.includes('[N$_{1}$]') && f.includes('[DP [the big cat, roof]]'), f);
  });

  T.test('qtree: a tree in a node, and one pasted bare, are Tree blocks', () => {
    const sh = drawn(pic('\\node at (2,1) {\\Tree [.S a b ]};'));
    T.eq(sh.map((s) => s.type), ['forest']);
    const b = TD.ftLayout(sh[0]).bb;
    near(sh[0].x + b.w / 2, 2 * TD.PX_PER_CM, 'centred on the node', 0.5); near(sh[0].y + b.h / 2, -1 * TD.PX_PER_CM, 'and up', 0.5);
    T.eq([TD.pasteIn.kind('\\Tree [.S [.NP a ] b ]'), TD.pasteIn.blockOf('\\Tree [.S a b ]')], ['block', 'forest']);
    const pasted = drawn(TD.pasteIn.asPicture('\\Tree [.S [.NP a ] b ]'));
    T.eq(pasted.map((s) => s.type), ['forest']);
  });

  T.test('forest: a content with = is written in braces (forest would read it as an option)', () => {
    const f = TD.ft.code({ pre: [], root: { c: '$x_2=1$', o: [], k: [{ c: 'a', o: [], k: [] }] } });
    T.ok(f.includes('[{$x_2=1$} [a]]'), f);
  });

  T.test('forest: where and if conditions on level, n children and n', () => {
    const L = layout('\\begin{forest} where level=1{draw}{}, where n children=0{font=\\itshape}{}, for tree={if n=2{fill=red}{}} [r [a [x] [y]] [b]] \\end{forest}');
    const by = (c) => L.nodes.find((n) => n.t === c);
    T.ok(by('a').st.draw && by('b').st.draw && !by('r').st.draw && !by('x').st.draw, 'level 1 drawn');
    T.ok(by('x').st.italic && by('b').st.italic && !by('a').st.italic, 'leaves italic');
    T.ok(by('b').st.fill && by('y').st.fill && !by('a').st.fill, 'second children filled');
    const M = layout('\\begin{forest} where level<=1{draw}{}, where level>=2{circle}{} [r [a [x]]] \\end{forest}');
    const m = (c) => M.nodes.find((n) => n.t === c);
    T.ok(m('r').st.draw && m('a').st.draw && !m('x').st.draw && m('x').st.shape === 'circle' && m('a').st.shape !== 'circle', 'at most and at least');
    T.eq(L.warnings.filter((w) => /where|if/.test(w)), [], 'no warnings');
  });

  T.test('forest: fit=rectangle packs subtrees by their bounding boxes', () => {
    const t = '[r [a [wide wide wide] [x]] [b [y] [also wide wide]]]';
    const tight = layout(`\\begin{forest} for tree={s sep=2pt} ${t} \\end{forest}`), rect = layout(`\\begin{forest} for tree={s sep=2pt, fit=rectangle} ${t} \\end{forest}`);
    T.ok(rect.bb.w >= tight.bb.w - 0.01, `rectangles are never closer: ${rect.bb.w} vs ${tight.bb.w}`);
    const a = rect.nodes.find((n) => n.t === 'a'), b = rect.nodes.find((n) => n.t === 'b');
    const sub = (n) => rect.nodes.filter((m) => m === n || m.parent === n.i);
    // (each node's box out to its outer sep, half its line width)
    const right = Math.max(...sub(a).map((m) => m.x + m.w / 2 + m.osx)), left = Math.min(...sub(b).map((m) => m.x - m.w / 2 - m.osx));
    near(left - right, 2 * PT, 'the subtrees\' boxes 2pt apart', 0.05);
  });

  T.test('forest: a node\'s anchor, parent and child anchors, and edge labels beside their edge', () => {
    const L = layout('\\begin{forest} for tree={anchor=north, parent anchor=south, child anchor=north} [r [a, edge label={node[auto=left]{p} node[midway, right](q){}}]] \\end{forest}');
    const [r, a] = L.nodes;
    // (TikZ's anchors are on the outer sep, 0.2pt out from the border drawn)
    near(r.y - r.h / 2 - r.osy, 0, 'the root\'s north at its place'); near(r.osy, 0.2 * PT, 'outer sep');
    const e = L.edges[0];
    near(e.pts[0][1], r.y + r.h / 2 + r.osy, 'from r.south'); near(e.pts[1][1], a.y - a.h / 2 - a.osy, 'to a.north');
    // auto=left on an edge running down is to its east (right on the page)
    T.eq(e.labels.length, 1, 'the empty named node draws nothing');
    T.ok(e.labels[0].x > e.pts[0][0], 'p to the right of the edge');
  });

  T.test('forest: styles the tree and the document define, forest\'s stages, math content, labels', () => {
    const L = layout(String.raw`\begin{forest}
  my node/.style={draw, circle}, tag/.style={label={right:#1}}, pair/.style n args={2}{fill=#1, label={left:#2}},
  before typesetting nodes={where n children=0{my node}{}}, for tree={math content}
  [x [y, tag=new] [z, pair={red}{old}]] \end{forest}`);
    const by = (c) => L.nodes.find((n) => n.t === `$${c}$`);
    T.ok(by('y') && by('y').st.draw && by('y').st.shape === 'circle' && !by('x').st.draw, 'my node on the leaves, maths content: ' + L.nodes.map((n) => n.t));
    T.eq(L.marks.map((m) => m.t).sort(), ['new', 'old'], 'labels from styles with arguments');
    T.ok(by('z').st.fill, 'the second argument too');
    T.eq(L.warnings, [], 'nothing left out');
    // a document's \forestset styles, which the tree carries in its preamble
    const M = TD.ft.layout({ type: 'forest', x: 0, y: 0, src: '\\begin{forest} [a, boxed [b]] \\end{forest}', size: 'normalsize', font: 'default', tex: { preamble: '\\forestset{boxed/.style={draw, fill=yellow}}' } });
    T.ok(M.nodes[0].st.draw && M.nodes[0].st.fill, 'boxed from \\forestset');
  });

  T.test('forest: tiers line their nodes up with the deepest', () => {
    const L = layout('\\begin{forest} where n children=0{tier=word}{} [S [NP [the] [cat]] [V [sat]] [Adv]] \\end{forest}');
    const leaves = L.nodes.filter((n) => !n.kids.length), y = leaves.map((n) => n.ay);
    T.ok(Math.max(...y) - Math.min(...y) < 0.01, 'the leaves at one depth: ' + y.map((v) => v.toFixed(1)));
  });

  T.test('forest: TikZ code with the tree: after it, in tikz={…} and as an edge path, with forest\'s walks', () => {
    const L = layout(String.raw`\begin{forest}
  for tree={edge path={\noexpand\path[\forestoption{edge}] (!u.parent anchor) -- +(0,-5pt) -| (.child anchor)\forestoption{edge label};}, parent anchor=south, child anchor=north}
  [a, name=top [b, tikz={\draw[red] (.east) -- ++(1,0);}] [c, name=right]]
  \draw[->] (top) to[bend left] (right);
\end{forest}`);
    T.eq(L.warnings, [], 'all drawn');
    T.eq(L.under.length, 2, 'the two edges along their own path: ' + L.under.map((s) => s.type));
    T.ok(L.under.every((s) => s.type === 'poly' || s.type === 'line' || s.type === 'path'), L.under.map((s) => s.type).join());
    T.ok(L.over.some((s) => s.type === 'line' && s.stroke === '#ff0000'), 'tikz={…} on b: ' + JSON.stringify(L.over.map((s) => [s.type, s.stroke])));
    T.ok(L.over.some((s) => s.type === 'curve'), 'the arrow after the tree');
    const f = TD.ft.parse(TD.ft.unwrap(String.raw`\begin{forest} [a [b]] \draw (a) -- (b); \end{forest}`).inner);
    T.ok(TD.ft.code(f).includes('\\draw (a) -- (b);'), 'the code after the tree is written back');
  });
}
