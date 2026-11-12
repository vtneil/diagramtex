// Maths alphabets and text styles: the KaTeX font table, plus the LaTeX ones the engines lack (\mathbfit, \textsl,
// \textsc in KaTeX, \mathds, \mathbbm), drawn with stand-ins; declarations ({\bfseries …}) in prose; the export
// loads what they need and compiles.
const STYLES = ['mathrm', 'mathbf', 'mathsf', 'mathnormal', 'textbf', 'textsf', 'textrm', 'mathsfit', 'textnormal', 'boldsymbol', 'text',
  'bm', 'textup', 'textmd', 'mathit', 'mathtt', 'mathfrak', 'textit', 'texttt', 'mathcal', 'emph', 'mathscr', 'mathbb', 'Bbb', 'bold', 'frak',
  'mathbfit', 'mathds', 'mathbbm', 'textsl', 'textsc'];
const DECLS = ['bf', 'rm', 'sf', 'it', 'tt', 'cal', 'bfseries', 'itshape', 'em', 'slshape', 'scshape', 'ttfamily', 'sffamily', 'rmfamily', 'upshape', 'mdseries', 'normalfont'];

T.test('text styles: every style renders in both engines', () => {
  const was = TD.math.engine;
  try {
    for (const e of ['katex', 'temml']) {
      TD.math.set(e);
      for (const c of STYLES) TD.math.render(`\\${c}{AB}`, { throwOnError: true });
      for (const c of DECLS) TD.math.render(`\\text{\\${c} AB}`.replace('\\text{\\cal AB}', '\\cal AB'), { throwOnError: true });
      TD.math.render('\\mathbfit{\\alpha x_1}', { throwOnError: true });
    }
  } finally { TD.math.set(was); }
});

T.test('text styles: declarations in prose style the rest of their group and write back as typed', () => {
  const src = 'a {\\bfseries b c} d {\\em e \\emph{f}} \\itshape g';
  const nodes = TD.prose.parse(src);
  T.eq(TD.prose.source(nodes, (t) => t), src, 'source round trip');
  const h = TD.textHtml(src);
  T.ok(/font-weight:bold'>b c</.test(h), 'bold group');
  T.ok(/font-style:italic'>e <span style='font-style:normal'>f</.test(h), '\\emph inside \\em is upright');
  T.ok(/font-style:italic'>g</.test(h), 'a top-level declaration runs to the end');
  T.ok(!/tx-warn/.test(TD.textHtml('\\bf x \\it y')), '\\bf and \\it are fine in text');
  T.ok(/tx-warn/.test(TD.textHtml('\\mathbfit{x}')), '\\mathbfit outside $…$ is flagged as maths');
});

const label = (text) => ({ type: 'text', x: 0, y: 0, text, tw: 0, size: 'normalsize', font: 'default', color: '#000000', id: 't' + text.length });

T.test('text styles: the export loads packages and defines \\mathbfit, \\mathsfit; it compiles', () => {
  const shapes = [label('$\\mathbfit{Ab0}\\,\\mathsfit{Ab0}\\,\\mathscr{L}\\,\\mathds{R}\\,\\mathbb{R}\\,\\bm{\\alpha}\\,\\text{\\bfseries x}\\,\\Bbb{Z}\\,\\frak{g}$ \\textsl{sl} \\textsc{Sc} {\\em e}')];
  const snip = TD.toTikz(shapes);
  for (const p of ['amsmath', 'amssymb', 'mathrsfs', 'dsfont', 'bm']) T.ok(snip.includes(`\\usepackage{${p}}`), 'requires ' + p);
  T.ok(/in the preamble, these lines:\n%\s+\\ifdefined\\mathbfit/.test(snip), 'snippet notes the \\mathbfit definition');
  const doc = TD.toTikz(shapes, { standalone: true });
  T.ok(doc.includes('\\DeclareMathAlphabet{\\mathsfit}'), 'standalone defines \\mathsfit');
  T.ok(!TD.toTikz([label('$x$')]).includes('amsmath'), 'plain maths needs nothing');
  T.tex('text-styles', doc);
});
