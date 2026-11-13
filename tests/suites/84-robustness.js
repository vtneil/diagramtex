// Robustness: hostile input to the domain parsers returns quickly (no hang, no exponential regex, no stack
// overflow, no Object.prototype key crash), and a 0 typed for a numeric option stays 0.
const quick = (name, fn, ms = 500) => {
  const t0 = performance.now();
  let r;
  try { r = fn(); } catch (e) { throw new Error(`${name} threw: ${(e && e.message) || e}`); }
  const dt = performance.now() - t0;
  T.ok(dt < ms, `${name} took ${Math.round(dt)} ms`);
  return r;
};
const plotOf = (o) => ({ id: 'p1', ...TD.TYPES.plot.create({ x: 0, y: 0 }, {}, 'plot:function'), w: 280, h: 200, ...o });
const imp = (src) => TD.importLatex(src).blocks;
const prevOf = (src) => TD.importLatex(src).blocks[0].shapes.flatMap((s) => (s.type === 'tikz' ? s.prev || [] : [s]));

T.test('robustness: plot ticks on an infinite or sub-precision range', () => {
  for (const [xmin, xmax] of [['-1e308', '1e308'], ['1e20', '100000000000000016384'], ['0', '1e-320']]) {
    const s = plotOf({ xmin, xmax });
    quick(`plot ${xmin}..${xmax}`, () => { TD.TYPES.plot.svg(s, {}); TD.toTikz([s]); });
  }
});

T.test('robustness: karnaugh map ranges, many warnings and prototype names', () => {
  const r = quick('range', () => TD.kmap.parse('\\begin{karnaugh-map}[4][4][1]\\minterms{0,...,99999999}\\end{karnaugh-map}'));
  T.ok(r.warnings.some((w) => /isn't understood/.test(w)), 'the huge range is not a cell list');
  T.eq(TD.kmap.parse('\\begin{karnaugh-map}[4][4][1]\\minterms{0,...,3}\\end{karnaugh-map}').cells.slice(0, 5), ['1', '1', '1', '1', null], 'a small range still fills');
  quick('many off-map cells', () => TD.kmap.parse('\\begin{karnaugh-map}[4][4][1]\\minterms{' + Array.from({ length: 30000 }, (_, i) => i + 100).join(',') + '}\\end{karnaugh-map}'));
  const src = '\\begin{karnaugh-map}[4][4][1]\\constructor{1}\\toString{2}\\__proto__\\minterms{1}\\implicant{0}{2}[constructor]\\end{karnaugh-map}';
  quick('prototype names', () => { TD.kmap.parse(src); TD.kmap.layout({ type: 'kmap', x: 0, y: 0, src, color: 'constructor' }); });
});

T.test('robustness: bloch sphere grid with a tiny or zero spacing', () => {
  for (const g of ['{1e-9}{1e-9}', '{0}{0}', '{-5}{-5}', '{nan}{inf}'])
    quick('grid ' + g, () => TD.bloch.layout({ type: 'bloch', x: 0, y: 0, src: `\\begin{blochsphere}[radius=1.5cm]\n\\drawBallGrid${g}\n\\end{blochsphere}` }));
});

T.test('robustness: tikz import regexes, loops, macros and arcs', () => {
  quick('unclosed picture with nested brackets', () => imp('\\begin{tikzpicture}[' + '[[[]'.repeat(40)));
  quick('unclosed picture in a document', () => imp('\\documentclass{article}\\begin{document}\\begin{tikzpicture}[' + '[[[[]'.repeat(40) + '\\end{document}'));
  quick('foreach variables without in', () => imp('\\begin{tikzpicture}\\foreach ' + '\\x     '.repeat(40) + 'z \\end{tikzpicture}'));
  quick('geo3d foreach variables without in', () => TD.geo3d.layout('\\begin{tikzpicture}\\foreach ' + '\\x     '.repeat(40) + 'z \\end{tikzpicture}'));
  quick('macro doubling itself', () => imp('\\begin{tikzpicture}\\def\\a{1}' + '\\def\\a{\\a+\\a}'.repeat(40) + '\\draw (0,0) -- (\\a,1);\\end{tikzpicture}'));
  quick('arc over a billion degrees', () => imp('\\begin{tikzpicture}\\draw (0,0) -- (1,0) arc (0:1e9:1) -- (2,2);\\end{tikzpicture}'));
  quick('nested loops', () => imp('\\begin{tikzpicture}' + '\\foreach \\a in {1,...,400} '.repeat(4) + '\\draw (0,0)--(1,1);\\end{tikzpicture}'));
  quick('a long chain of loops', () => imp('\\begin{tikzpicture}' + '\\foreach \\a in {1} '.repeat(20000) + '\\draw (0,0)--(1,1);\\end{tikzpicture}'), 2000);
  // the usual picture still reads its options and body
  const b = imp('\\begin{tikzpicture}[scale=2]\\draw (0,0) -- (1,0);\\end{tikzpicture}')[0];
  T.ok(b && b.shapes.length === 1, 'a plain picture still imports');
});

T.test('robustness: deep nesting does not overflow the stack', () => {
  quick('50k braces in a node', () => imp('\\begin{tikzpicture}\\node at (0,0) ' + '{'.repeat(50000) + '\\end{tikzpicture}'));
  quick('50k declarations in a node', () => imp('\\begin{tikzpicture}\\node at (0,0) {' + '\\bf '.repeat(50000) + 'x};\\end{tikzpicture}'));
  quick('5k nested environments', () => imp('\\begin{tikzpicture}' + '\\begin{pgfonlayer}{a}'.repeat(5000) + '\\draw (0,0)--(1,1);' + '\\end{pgfonlayer}'.repeat(5000) + '\\end{tikzpicture}'), 2000);
  quick('20k nested scopes', () => imp('\\begin{tikzpicture}' + '\\begin{scope}'.repeat(20000) + '\\draw (0,0)--(1,1);' + '\\end{scope}'.repeat(20000) + '\\end{tikzpicture}'), 2000);
  quick('forest 20k deep', () => TD.ft.layout({ type: 'forest', x: 0, y: 0, src: '\\begin{forest}' + '['.repeat(20000) + 'a' + ']'.repeat(20000) + '\\end{forest}' }));
  quick('geo3d 20k unclosed scopes', () => TD.geo3d.layout('\\begin{tikzpicture}' + '\\begin{scope}'.repeat(20000) + '\\end{tikzpicture}'));
  quick('geo3d 5k nested scopes', () => TD.geo3d.layout('\\begin{tikzpicture}' + '\\begin{scope}'.repeat(5000) + '\\draw (0,0,0)--(1,1,1);' + '\\end{scope}'.repeat(5000) + '\\end{tikzpicture}'));
  // a shallow scope still draws
  const R = TD.geo3d.layout('\\begin{tikzpicture}\\begin{scope}\\begin{scope}\\draw (0,0,0)--(1,1,1);\\end{scope}\\end{scope}\\end{tikzpicture}');
  T.ok(R && !(R.warnings || []).some((w) => /too deep/.test(w)), 'two nested scopes are fine');
});

T.test('robustness: prototype names in tikz-cd and imported pictures', () => {
  quick('tikz-cd', () => TD.cd.layout({ type: 'cd', x: 0, y: 0, src: '\\begin{tikzcd}[constructor, toString, row sep=toString] A \\arrow[r, constructor, toString, "x" constructor] & |[alias=__proto__]| B \\arrow[to=constructor] \\\\ \\constructor{a} & C \\arrow[from=__proto__]\\end{tikzcd}' }));
  quick('tikz-cd styles', () => TD.cd.layout({ type: 'cd', x: 0, y: 0, src: '\\tikzset{toString/.style={red}}\\begin{tikzcd} A \\arrow[r, toString, valueOf, hasOwnProperty] & B\\end{tikzcd}' }));
  quick('import', () => imp('\\begin{tikzpicture}\\node (constructor) at (0,0) {\\constructor a}; \\node (__proto__) at (1,0) {b}; \\draw[color=toString] (constructor) -- (__proto__) -- (hasOwnProperty);\\end{tikzpicture}'));
});

T.test('robustness: a 0 typed for bend, rounded corners and l* stays 0', () => {
  const b0 = prevOf('\\begin{tikzpicture}\\draw (0,0) to[bend left=0] (2,0);\\end{tikzpicture}');
  T.ok(b0.length === 1 && b0[0].type === 'line', 'bend left=0 is straight: ' + b0.map((s) => s.type));
  T.ok(prevOf('\\begin{tikzpicture}\\draw (0,0) to[bend left] (2,0);\\end{tikzpicture}')[0].type === 'curve', 'bend left alone is still 30°');
  const L = TD.ft.layout({ type: 'forest', x: 0, y: 0, src: '\\begin{forest}for tree={draw, rounded corners=0}[a[b, l*=0]]\\end{forest}' });
  T.eq(L.nodes[0].st.rc, 0, 'rounded corners=0');
  T.eq(L.nodes[1].st.l, 0, 'l*=0');
  const D = TD.ft.layout({ type: 'forest', x: 0, y: 0, src: '\\begin{forest}for tree={draw, rounded corners}[a]\\end{forest}' });
  T.ok(D.nodes[0].st.rc > 0, 'rounded corners alone keeps its default');
});
