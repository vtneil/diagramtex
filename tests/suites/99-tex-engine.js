// The in-browser pdfLaTeX (src/platform/tex-engine.ts): reading TeX's log, and, where the TeX Live bundle has been
// made (scripts/tex-bundle.mjs; it is not in the repository), compiling a picture, an error and a missing package.
{
  const E = () => TD.texEngine;

  T.test('tex engine: errors are read from the log with their lines; the fatal-error line and BibTeX are not', () => {
    const log = [
      'This is pdfTeX, Version 3.14159265-2.6-1.40.21',
      '(main.tex',
      '! Undefined control sequence.',
      '<recently read> \\nosuch ',
      '',
      'l.3 $\\nosuch',
      '             x$',
      '! Missing $ inserted.',
      '<inserted text> ',
      'l.7 a^b',
      '!  ==> Fatal error occurred, no output PDF file produced!',
      'This is BibTeX, Version 0.99d',
      '! I couldn\'t open file name `main.aux\'',
    ].join('\n');
    T.eq(E().parseLog(log), [{ line: 3, message: 'Undefined control sequence.' }, { line: 7, message: 'Missing $ inserted.' }]);
    T.eq(E().parseLog('(main.tex\n!  ==> Fatal error occurred, no output PDF file produced!\n'), [{ line: null, message: '==> Fatal error occurred, no output PDF file produced!' }], 'on its own it is still said');
  });

  T.test('tex engine: a picture compiles to a PDF; an error stops it on its line; a missing package is named', async () => {
    const s = await E().support();
    if (!s.ok) return; // no bundle on this site (made locally by scripts/tex-bundle.mjs)
    const doc = (body, pre = '') => `\\documentclass{standalone}\n\\usepackage{tikz}${pre}\n\\begin{document}\n${body}\n\\end{document}\n`;
    let r = await E().compile(doc('\\begin{tikzpicture}\\draw[->] (0,0) -- (1,0) node[above] {$\\vec F$};\\end{tikzpicture}'));
    T.ok(r.ok, 'compiled:\n' + r.log.slice(-600));
    T.eq(String.fromCharCode(...r.pdf.slice(0, 5)), '%PDF-');
    r = await E().compile(doc('\\begin{tikzpicture}\n\\node {$\\nosuch x$};\n\\end{tikzpicture}'));
    T.ok(!r.ok && !r.pdf);
    T.eq(r.errors.map((e) => [e.line, e.message]), [[5, 'Undefined control sequence.']]);
    r = await E().compile(doc('x', '\n\\usepackage{nosuchpackage}'));
    T.ok(!r.ok); T.ok(r.missing.includes('nosuchpackage.sty'), 'missing: ' + r.missing.join(', '));
    T.ok(r.errors.some((e) => e.message.includes('`nosuchpackage.sty\'')), 'TeX says so: ' + JSON.stringify(r.errors));
  });

  T.test('tex engine: fonts TeX asks for by name alone: bold maths at 9 pt, Times and Helvetica, and T1 text (fetched as needed)', async () => {
    const s = await E().support();
    if (!s.ok) return;
    const r = await E().compile('\\documentclass{article}\n\\usepackage{amsmath,bm}\n\\begin{document}\n{\\small $\\boldsymbol{x}\\bm{\\alpha}$ \\textbf{$x$}}\n'
      + '{\\fontfamily{ptm}\\selectfont Times \\textbf{bold}} {\\fontfamily{phv}\\selectfont Helvetica \\textit{it}}\n'
      + '{\\fontencoding{T1}\\selectfont\\char34 \\bfseries\\char34}\n\\end{document}\n');
    T.ok(r.ok, 'compiled; missing: ' + r.missing.join(', ') + '\n' + r.errors.map((e) => e.line + ': ' + e.message).join('\n'));
  });

  T.test('tex engine: what the installed app offers to download for offline (both engines, only what this browser lacks)', async () => {
    const need = await E().offlineNeed();
    T.ok(Array.isArray(need.engines) && need.engines.every((e) => e === 'pdflatex' || e === 'xelatex'), JSON.stringify(need));
    T.eq(need.size > 0, need.engines.length > 0, 'a size exactly when something is missing');
    for (const e of ['pdflatex', 'xelatex']) {
      const s = await E().support(e);
      if (!s.ok) T.ok(!need.engines.includes(e), e + ' is not on this site: not offered');
      else if (need.engines.includes(e)) T.ok(need.size >= (s.cached ? 0 : s.size), e + ': at least its bundle');
    }
  });
}
