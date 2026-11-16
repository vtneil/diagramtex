// Graph block (src/domain/graph.ts): the TikZ graphs parser and writer, the readers for the usual graph
// formats, auto layout, drawing and compiling.
const G = TD.graph;
const gb = (src) => ({ type: 'graph', x: 0, y: 0, src, color: '#000000' });

T.test('graph: the default parses and writes back the same graph', () => {
  const M = G.parse(TD.GRAPH_DEFAULT);
  T.eq(M.nodes.length, 4, 'nodes');
  T.eq(M.edges.length, 5, 'edges');
  T.eq(M.nodes[1].x, 2, 'b at x=2');
  const w = G.parse(G.write(M));
  T.eq(JSON.stringify(w.nodes.map((n) => [n.name, n.text, n.x, n.y])), JSON.stringify(M.nodes.map((n) => [n.name, n.text, n.x, n.y])), 'nodes round trip');
  T.eq(JSON.stringify(w.edges.map((e) => [e.a, e.b, e.op, e.t, e.sw])), JSON.stringify(M.edges.map((e) => [e.a, e.b, e.op, e.t, e.sw])), 'edges round trip');
  T.eq(M.edges[4].sw, true, "quote with ' swaps");
});

T.test('graph: chains, groups and -!- in the graphs syntax', () => {
  const M = G.parse('\\begin{tikzpicture}\\graph { a -> {b, c} -> d; a -!- b; };\\end{tikzpicture}');
  T.eq(M.nodes.map((n) => n.name).join(','), 'a,b,c,d', 'nodes');
  T.eq(M.edges.map((e) => e.a + e.b).sort().join(','), 'ac,bd,cd', 'edges after removal');
  const L = G.layout(gb('\\begin{tikzpicture}\\graph { a -> b -> c; };\\end{tikzpicture}'));
  T.ok(L.nodes.get('b').x > L.nodes.get('a').x, 'a chain grows right');
});

T.test('graph: readers for common formats', () => {
  const m = G.fromText('0 1 1\n1 0 1\n1 1 0');
  T.eq(m.kind, 'matrix'); T.eq(m.nodes, 3); T.eq(m.edges, 3); T.eq(m.directed, false);
  const d = G.fromText('0 1 0\n0 0 1\n1 0 0');
  T.eq(d.edges, 3); T.eq(d.directed, true, 'unsymmetric matrix is directed');
  const w = G.fromText('0 4 0\n4 0 2\n0 2 0');
  T.ok(w.M.edges.some((e) => e.t === '$4$'), 'weights as labels: ' + w.kind + ' ' + JSON.stringify(w.M.edges));
  const al = G.fromText('a: b c\nb: c\nc: a');
  T.eq(al.kind, 'adjlist'); T.eq(al.nodes, 3); T.eq(al.edges, 4);
  const el = G.fromText('1 2\n2 3\n3 1\n3 4');
  T.eq(el.kind, 'edges'); T.eq(el.nodes, 4); T.eq(el.edges, 4);
  const ea = G.fromText('a -> b\nb -> c');
  T.eq(ea.directed, true); T.eq(ea.edges, 2);
  const ew = G.fromText('A B 5\nB C 3');
  T.ok(ew.M.edges.some((e) => e.t === '$5$'), 'weighted edge list');
  const dot = G.fromText('digraph G { a -> b; b -> c [label="x"]; c -> a }');
  T.eq(dot.kind, 'dot'); T.eq(dot.edges, 3); T.eq(dot.directed, true);
  const mm = G.fromText('graph TD\n  A[Start] --> B\n  B --- C');
  T.eq(mm.kind, 'mermaid'); T.eq(mm.nodes, 3);
  const js = G.fromText('{"nodes":["x","y","z"],"edges":[["x","y"],["y","z"]]}');
  T.eq(js.kind, 'json'); T.eq(js.edges, 2);
  const jm = G.fromText('[[0,1],[1,0]]');
  T.eq(jm.edges, 1);
  T.eq(G.fromText('hello world, this is prose.'), null, 'prose is not a graph');
});

T.test('graph: imported graphs are placed and drawn', () => {
  const r = G.fromText('a b\nb c\nc d\nd a\na c');
  T.ok(r.M.nodes.every((n) => n.x != null && n.y != null), 'every node placed');
  const s = G.draw(gb(r.src), { export: true, paper: '#ffffff' });
  T.ok(s.includes('<path') || s.includes('<circle'), 'drawn');
  for (const mode of ['spring', 'circle', 'layers', 'grid']) {
    const M = G.parse(r.src); G.autoLayout(M, mode);
    const ps = new Set(M.nodes.map((n) => n.x + ',' + n.y));
    T.eq(ps.size, M.nodes.length, mode + ' gives distinct places');
  }
});

T.test('graph: the code compiles', () => {
  T.tex('graph-default', TD.toTikz([{ ...gb(TD.GRAPH_DEFAULT), id: 'g' }], { standalone: true }));
  const r = G.fromText('digraph { a -> b [label=3]; b -> a; b -> c; c -> c }');
  T.tex('graph-dot', TD.toTikz([{ ...gb(r.src), id: 'g' }], { standalone: true }));
  T.tex('graph-styled', TD.toTikz([{ ...gb('\\begin{tikzpicture}[>=Stealth]\\graph[no placement, nodes={draw, rectangle, rounded corners}] { a/$x_1$ [at={(0,0)}, fill=red!20, label=above:{note}]; b/Text [at={(2,0)}, draw=none]; p/ [at={(1,-1)}, circle, fill, inner sep=0pt, minimum size=4pt]; a ->["w"\', bend left, dashed] b; a -- p; };\\end{tikzpicture}'), id: 'g' }], { standalone: true }));
});

T.test('graph and automata: parallel edges fan out, any number of them', () => {
  const bends = (es, a) => es.map((e) => { const it = e.o.find((x) => /^bend (left|right)/.test(x)); if (!it) return 0; const m = /^bend (left|right)(?:=(\d+))?/.exec(it); const t = (m[1] === 'left' ? 1 : -1) * (m[2] ? +m[2] : 30); return e.a === a ? t : -t; }).sort((p, q) => p - q);
  const mk = (n, rev) => Array.from({ length: n }, (_, i) => ({ a: rev && i % 2 ? 'b' : 'a', b: rev && i % 2 ? 'a' : 'b', o: [] }));
  let es = mk(2); G.fan(es, 'a'); T.eq(bends(es, 'a'), [-30, 30], 'two: ±30°');
  es = mk(3, true); G.fan(es, 'a'); T.eq(bends(es, 'a'), [-49, 0, 49], 'three, either way: one straight between');
  es = mk(5); G.fan(es, 'a'); T.eq(bends(es, 'a'), [-60, -26, 0, 26, 60], 'five: the outermost at 60°');
  // a new edge joins the left end, the others keep their order
  es = mk(2); G.fan(es, 'a'); const n = { a: 'a', b: 'b', o: [] }; es.push(n); G.fan(es, 'a', n);
  T.eq(bends([n], 'a'), [49], 'the new one on the left');
  T.eq(bends(es, 'a'), [-49, 0, 49], 'all three spread');
  // auto layout fans bundles in both blocks
  const M = G.parse('\\begin{tikzpicture}\\graph { a -- b; a -- b; a -- b; b -- c; };\\end{tikzpicture}');
  G.autoLayout(M, 'circle');
  T.eq(bends(M.edges.filter((e) => e.b === 'b'), 'a'), [-49, 0, 49], 'graph auto layout');
  const F = TD.fsm.parse('\\begin{tikzpicture}[->]\\node[state] (p) {}; \\node[state] (q) [right of=p] {}; \\path (p) edge (q) (p) edge (q) (q) edge (p);\\end{tikzpicture}');
  TD.fsm.autoLayout(F);
  T.eq(bends(F.edges, 'p'), [-49, 0, 49], 'automata auto layout');
});

T.test('graph and automata: labels of several lines', () => {
  const src = '\\begin{tikzpicture}\\graph[no placement] { a/ [at={(0,0)}]; b/ [at={(3,0)}]; };\\end{tikzpicture}';
  const M = G.parse(src);
  M.nodes[0].text = 'top \\\\ $x_1$';
  M.nodes[1].lab = { t: 'one \\\\ two', side: 'below' };
  M.edges.push({ a: 'a', b: 'b', op: '->', o: [], t: '$p$ \\\\ $q$', sw: false, lo: [] });
  const code = G.write(M);
  T.ok(/align=center/.test(code), 'node gets align=center');
  T.ok(code.includes('label={[align=center]below:one \\\\ two}'), 'note written with its alignment');
  T.ok(/"\$p\$ \\\\ \$q\$"[^;]*align=center/.test(code), 'edge label gets align=center');
  const W = G.parse(code);
  T.eq(W.nodes[0].text, 'top \\\\ $x_1$', 'node text back');
  T.eq(JSON.stringify(W.nodes[1].lab), JSON.stringify({ t: 'one \\\\ two', side: 'below' }), 'note back');
  T.eq(W.edges[0].t, '$p$ \\\\ $q$', 'edge label back');
  T.eq(W.warnings.length, 0, 'no warnings');
  T.eq(G.lines('a \\\\ b\\\\[2pt]c'), 'a\nb\nc', 'lines split at \\\\ with or without a length');
  // drawn taller than one line
  const one = TD.textBox('top', { size: 10 }), two = TD.textBox(G.lines('top \\\\ x'), { size: 10 });
  T.ok(two.h > one.h * 1.5, 'two lines are taller');
  T.ok(G.draw(gb(code), { export: true, paper: '#ffffff' }).length > 0, 'drawn');
  T.tex('graph-multiline', TD.toTikz([{ ...gb(code), id: 'g' }], { standalone: true }));
  // automata
  const A = TD.fsm.parse('\\begin{tikzpicture}[->]\\node[state] (p) at (0,0) {}; \\node[state] (q) at (3,0) {}; \\path (p) edge node {$a$} (q);\\end{tikzpicture}');
  A.states[0].text = '$p$ \\\\ $1$';
  A.edges[0].t = '$a$ \\\\ $b$';
  const ac = TD.fsm.write(A);
  T.ok((ac.match(/align=center/g) || []).length === 2, 'state and transition get align=center');
  const B = TD.fsm.parse(ac);
  T.eq(B.states[0].text, '$p$ \\\\ $1$', 'state text back');
  T.eq(B.edges[0].t, '$a$ \\\\ $b$', 'transition label back');
  T.tex('fsm-multiline', TD.toTikz([{ type: 'automata', x: 0, y: 0, src: ac, color: '#000000', id: 'f' }], { standalone: true }));
});
