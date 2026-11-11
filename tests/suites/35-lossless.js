// Hand-written TikZ (tests/fixtures/import/handwritten.tex): comments, \tikzset, \foreach, \coordinate, relative
// positioning, scopes, a pgfplots axis. Imported and exported again it must come back as written; editing one
// shape regenerates that statement only; a kept statement that is dragged is wrapped in a shift scope.
const HW = () => T.fixtures['import/handwritten.tex'];
const picOf = (tex) => tex.slice(tex.indexOf('\\begin{tikzpicture}'), tex.indexOf('\\end{tikzpicture}') + 17);
const imp = () => TD.importLatex(HW()).blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes);

T.test('lossless: hand-written picture exports as written', () => {
  const shapes = imp();
  const out = TD.toTikz(shapes, { standalone: true });
  T.eq(picOf(out), picOf(HW()), 'picture body');
  for (const l of ['\\definecolor{accent}', '\\tikzset{box/.style', '\\newcommand{\\R}', '\\pgfplotsset{compat']) T.ok(out.includes(l), 'preamble keeps ' + l);
  T.tex('lossless-handwritten', out);
  // what was kept as code, and why: a diff here means the importer models something new
  T.golden('import/handwritten-kept.txt', shapes.map((s) => s.type === 'tikz' ? `tikz ${s.kind}: ${s.code.split('\n').find((l) => l.trim() && !/^\s*%/.test(l)).trim()}${s.issues && s.issues.length ? '  [' + s.issues.join('; ') + ']' : ''}` : s.type).join('\n') + '\n');
});

T.test('lossless: editing one shape regenerates only its statement', () => {
  const shapes = imp();
  const base = shapes.find((s) => s.type === 'line' && s.tex && /accent/.test(s.tex.src || ''));
  T.ok(base, 'the base line is a shape');
  base.width *= 2;
  const out = picOf(TD.toTikz(shapes, { standalone: true }));
  const A = picOf(HW()).split('\n'), B = out.split('\n');
  const changed = B.filter((l) => !A.includes(l));
  T.eq(changed, ['\\begin{tikzpicture}[x=1cm, y=1cm, >=Stealth]', '  \\draw[draw=accent, line width=1.6pt] (0,0) -- (3,0);'], 'only the opening line and the edited statement change');
  T.ok(out.includes('% --- named points ---') && out.includes('% inside a scope'), 'comments kept');
  T.tex('lossless-edited', TD.toTikz(shapes, { standalone: true }));
});

T.test('lossless: a dragged kept statement gets a shift', () => {
  const shapes = imp();
  const loop = shapes.find((s) => s.type === 'tikz' && /\\foreach/.test(s.code));
  T.ok(loop, 'the \\foreach is kept as code');
  TD.translate(loop, TD.PX_PER_CM, 0);
  const out = TD.toTikz(shapes, { standalone: true });
  T.ok(/\\begin\{scope\}\[shift=\{\(1,0\)\}\]\s*\n\s*\\foreach/.test(out), 'shift scope around the loop');
  T.tex('lossless-moved', out);
});

T.test('lossless: kept colour names do not clash with generated ones', () => {
  const src = '\\begin{tikzpicture}\n\\definecolor{tdc1}{RGB}{0,0,255}\n\\draw[tdc1] (0,0) -- (1,0);\n\\end{tikzpicture}';
  const shapes = TD.importLatex(src).blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes);
  shapes.push({ ...T.make('line', { set: { x1: 0, y1: 40, x2: 40, y2: 40, stroke: '#ff0000' } }) });
  const out = TD.toTikz(shapes, { standalone: true });
  T.ok(!/\\definecolor\{tdc1\}\{HTML\}\{FF0000\}/i.test(out), 'red is not named tdc1');
  T.tex('lossless-colors', out);
});

// Unbalanced brackets (code half typed in the import box) must not send the reader into a loop.
T.test('import: unbalanced input ends quickly', () => {
  const cases = [
    '\\begin{tikzpicture}\n\\foreach \\i in {1,2} { \\draw (\\i,1) circle (2pt);\n\\end{tikzpicture}',
    '\\begin{tikzpicture}\n\\foreach \\i in {1,2\n\\end{tikzpicture}',
    '\\begin{tikzpicture}\n\\node[draw at (0,0) {a};\n\\end{tikzpicture}',
    '\\begin{tikzpicture}\n\\node at (0,0 {a};\n\\draw (0,0) -- (1,1;\n\\end{tikzpicture}',
    '\\begin{tikzpicture}\n\\begin{scope}[shift={(1,0)]\n\\draw (0,0) -- (1,0);\n\\end{scope}\n\\end{tikzpicture}',
    '\\definecolor{a}{HTML}{FF0000\n\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}',
    '\\begin{tikzpicture}\n\\tddata{ {"x":1}\n\\end{tikzpicture}',
  ];
  for (const c of cases) {
    const t0 = Date.now();
    try { TD.importLatex(c); } catch (e) { /* an error is fine, a hang is not */ }
    T.ok(Date.now() - t0 < 2000, 'slow on: ' + c.split('\n')[1]);
  }
});
