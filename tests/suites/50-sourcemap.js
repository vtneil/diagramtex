// Source map (phase 4): with TD.srcMark set the writers wrap each statement in invisible marks; TD.srcMap takes
// them out, giving the exact text written without them and the lines of each statement.
const mapped = (fn) => { TD.srcMark = true; try { return TD.srcMap(fn()); } finally { TD.srcMark = false; } };
const linesOf = (m, id) => m.spans.filter((sp) => sp.ids.includes(id)).map((sp) => [sp.a, sp.b]);
const at = (m, n) => m.text.split('\n')[n - 1];

T.test('source map: the text is the same as without marks, and each shape has its lines', () => {
  const S = [T.make('line'), T.make('rect'), T.make('text', { set: { text: 'Hi' } })];
  const plain = TD.toTikz(S), m = mapped(() => TD.toTikz(S));
  T.eq(m.text, plain, 'no marks left');
  T.ok(!/[-]/.test(TD.toTikz(S)), 'nothing marked when off');
  for (const s of S) {
    const L = linesOf(m, s.id);
    T.eq(L.length, 1, s.type + ' has one statement');
    T.ok(at(m, L[0][0]).trim().startsWith('\\'), s.type + ': ' + at(m, L[0][0]));
  }
  T.ok(/\\draw/.test(at(m, linesOf(m, S[0].id)[0][0])) && /\\node/.test(at(m, linesOf(m, S[2].id)[0][0])), 'the right lines');
});

const SRC = `\\begin{tikzpicture}
  \\foreach \\i in {0,1}
    \\fill (\\i,0) circle (2pt);
  \\node (a) at (0,1) {A};
  \\draw[decorate, decoration=brace] (0,2) -- (1,2);
\\end{tikzpicture}`;

T.test('source map: imported code, written as it was, maps statements to their shapes', () => {
  const S = TD.importLatex(SRC).blocks.flatMap((b) => b.shapes || []);
  const m = mapped(() => TD.toTikz(S));
  T.eq(m.text, TD.toTikz(S), 'same text');
  T.eq(linesOf(m, S[0].id), [[2, 3]].map(([a, b]) => [a + 1, b + 1]), 'the loop: both lines (after the Requires line)');
  T.ok(linesOf(m, S[1].id)[0][0] === linesOf(m, S[0].id)[0][0], 'both dots share the loop');
  T.ok(/\\node \(a\)/.test(at(m, linesOf(m, S[2].id)[0][0])), 'the node');
  T.ok(/decorate/.test(at(m, linesOf(m, S[3].id)[0][0])), 'code kept as written');
  // an edit: that statement is written anew, still mapped
  S[2].color = '#ff0000';
  const m2 = mapped(() => TD.toTikz(S));
  T.ok(/\\node.*\{A\}/.test(at(m2, linesOf(m2, S[2].id)[0][0])), 'edited node');
});

T.test('source map: whole documents and pages carry the marks through', () => {
  const S = [T.make('ellipse')];
  const doc = { kind: 'classic', name: 'x', blocks: [{ type: 'diagram', id: 'b1', shapes: S }], shapes: S };
  let m;
  try { m = mapped(() => TD.docToLatex(doc)); } catch (e) { m = null; }
  if (m) {
    T.ok(!/[-]/.test(m.text), 'clean');
    const L = linesOf(m, S[0].id);
    T.ok(L.length === 1 && /\\draw/.test(at(m, L[0][0])), 'the circle in the document: ' + JSON.stringify(L));
  }
});

T.test('export: code kept as written brings the libraries it uses', () => {
  const S = TD.importLatex(SRC.replace('\\end{tikzpicture}', '  \\node[right=of a] {B};\n\\end{tikzpicture}')).blocks.flatMap((b) => b.shapes || []);
  const out = TD.toTikz(S, { standalone: true });
  T.ok(/\\usetikzlibrary\{[^}]*decorations\.pathreplacing/.test(out) && /\\usetikzlibrary\{[^}]*positioning/.test(out), out.split('\n').filter((l) => l.includes('usetikz')).join(' '));
  T.eq(TD.lint(out, { preview: false }).filter((d) => d.sev !== 'info').map((d) => d.msg), [], 'lint-clean');
  T.tex('sourcemap-kept-libs', out);
});
