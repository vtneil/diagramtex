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

T.test('robustness: a block of a kind this version does not know is shown as a note, kept on save and left out of the LaTeX', async () => {
  const text = JSON.stringify({ app: 'diagramtex', version: 3, kind: 'classic', name: 'Unknown block test',
    blocks: [{ type: 'text', text: 'Before.' }, { type: 'whatever', data: { x: 1 } }, { type: 'diagram', shapes: [] }] });
  const p = TD.app.parseProject(text, 'x');
  const id = TD.app.newDoc(p.name, null, null, p.blocks, p.page, p.kind);
  TD.app.setMode('document');
  await new Promise((r) => setTimeout(r, 50));
  T.eq(TD.state.docId, id);
  T.ok(document.querySelector('.blk-other .ph')?.textContent.includes('(whatever)'), 'a note where the block is');
  const back = JSON.parse(TD.app.projectJson(TD.state.doc)).blocks;
  T.eq(back[1], { type: 'whatever', data: { x: 1 } }, 'saved as it came');
  const tex = TD.docToLatex(TD.state.doc);
  T.ok(tex.includes("% A block this version of DiagramTeX can't export (whatever) is left out here.") && tex.includes('Before.'), tex);
  TD.app.cmd.docAction('del', id);
});

T.test('robustness: a drawing far from the origin is written moved back within TeX\'s reach; one too big says why', () => {
  const P = TD.PX_PER_CM, d = { stroke: '#000000', fill: null, width: 1 };
  const far = { ...TD.TYPES.rect.create({ x: 2000 * P, y: 10 * P }, d), id: 'far', w: 2 * P, h: P };
  const out = TD.toTikz([far], { standalone: true });
  T.ok(out.includes('(0,-1) rectangle (2,0)') && !/Note/.test(out), out);
  T.eq(far.x, 2000 * P, 'the drawing itself is not moved');
  T.tex('far from the origin', out);
  const near = { ...TD.TYPES.rect.create({ x: 0, y: 0 }, d), id: 'near', w: 2 * P, h: P };
  T.ok(/% Note: The drawing reaches 2002 cm across/.test(TD.toTikz([far, near])), 'too big to fit: a note');
});

T.test('document import: numbered sections, the author, a figure caption and the preamble\'s packages come back as they were', () => {
  const src = String.raw`\documentclass{article}
\usepackage{amsmath, amssymb}
\usepackage{tikz}
\title{Lab report}
\author{A. Writer \and B. Writer}
\begin{document}
\maketitle
\section{Method}
Some text.
\begin{figure}[h]
  \centering
  \begin{tikzpicture}\draw (0,0) rectangle (1,1);\end{tikzpicture}
  \caption{The apparatus}
\end{figure}
More text.
\end{document}`;
  const r = TD.importLatex(src);
  T.ok(r.page.numbered, '\\section (not \\section*) numbers the headings');
  T.eq(r.page.author, 'A. Writer, B. Writer');
  const at = r.blocks.findIndex((b) => b.type === 'diagram'), cap = r.blocks[at + 1];
  T.eq([cap.text, cap.align], ['The apparatus', 'center'], 'the caption sits centred under its picture');
  T.ok(!r.blocks.some((b) => b.type === 'text' && /apparatus/.test(b.text) && b !== cap), 'and is not in a paragraph');
  const tex = TD.docToLatex({ kind: 'classic', name: 'Lab report', blocks: r.blocks, page: r.page });
  T.ok(/\\section\{Method\}/.test(tex), 'exported numbered');
  T.ok(/\\author\{A\. Writer, B\. Writer\}/.test(tex), 'the author is exported');
  for (const p of ['amsmath', 'amssymb']) T.eq((tex.match(new RegExp(`\\\\usepackage\\{[^}]*\\b${p}\\b`, 'g')) || []).length, 1, `${p} loaded once`);
  T.tex('imported-report', tex);
});

T.test('document import: itemize and enumerate become the page\'s own lists, and export as they came', async () => {
  const src = String.raw`\documentclass{article}
\begin{document}
Intro text.
\begin{itemize}
  \item First \textbf{bold}
  \item Second $x^2$
  \begin{enumerate}
    \item One
    \item Two
      continued
  \end{enumerate}
  \item[$\square$] Open task
  \item[$\boxtimes$] Done task
\end{itemize}
After the list.
\end{document}`;
  const r = TD.importLatex(src), text = r.blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  T.eq(text, 'Intro text.\n- First \\textbf{bold}\n- Second $x^2$\n  1. One\n  2. Two continued\n- [ ] Open task\n- [x] Done task\n\nAfter the list.');
  TD.app.newDoc('Imported lists', null, null, r.blocks, null, 'classic');
  TD.app.setMode('document');
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const pg = document.querySelector('#docview .doc-page');
  T.ok(pg.querySelectorAll('li').length >= 6 && !/\\begin|\\item|beginitemize/.test(pg.textContent), 'drawn as lists, no raw commands');
  // the app's own Welcome export comes back with the same lists
  TD.app.newSample();
  const tex = TD.docToLatex(TD.state.doc), back = TD.importLatex(tex);
  const env = (s) => (s.match(/\\(begin|end)\{(itemize|enumerate)\}|\\item(\[[^\]]*\])?/g) || []).join(' ');
  T.ok(env(tex).length > 0, 'the Welcome document has lists');
  T.eq(env(TD.docToLatex({ ...TD.state.doc, blocks: back.blocks })), env(tex));
});
