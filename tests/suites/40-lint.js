// TD.lint: the app's own exports are clean (no false alarms), and each check finds what it is for.
T.test('lint: every parity figure exports without warnings', () => {
  const noisy = [];
  for (const n of Object.keys(KIT)) {
    const tex = TD.toTikz(KIT[n](), { standalone: true });
    const bad = TD.lint(tex, { preview: false }).filter((d) => d.sev !== 'info');
    if (bad.length) noisy.push(`${n}: ${bad.map((d) => `line ${d.line} ${d.msg}`).join('; ')}`);
  }
  T.eq(noisy, []);
});
T.test('lint: the hand-written fixture is clean', () => {
  T.eq(TD.lint(T.fixtures['import/handwritten.tex']).filter((d) => d.sev !== 'info'), []);
});
T.test('lint: finds what each check is for', () => {
  const doc = (pre, body) => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`;
  const msgs = (src, o) => TD.lint(src, o).map((d) => `${d.sev}@${d.line}: ${d.msg}`);
  const cases = [
    ['brace', '\\draw (0,0) -- (1,1) node {a;\n', {}],
    ['extra brace', '\\node {a}};', {}],
    ['env mismatch', '\\begin{tikzpicture}\n\\begin{scope}\n\\end{tikzpicture}', {}],
    ['escaped braces are fine', '\\node {\\{a\\}};', {}],
    ['comment brace is fine', '\\node {a}; % {', {}],
    ['positioning', doc('\\usepackage{tikz}', '\\begin{tikzpicture}\\node (a) {}; \\node[right=of a] {};\\end{tikzpicture}'), {}],
    ['arrows.meta', doc('\\usepackage{tikz}', '\\begin{tikzpicture}\\draw[-{Stealth}] (0,0) -- (1,0);\\end{tikzpicture}'), {}],
    ['libs loaded', doc('\\usepackage{tikz}\\usetikzlibrary{positioning,arrows.meta}', '\\begin{tikzpicture}\\node (a) {}; \\node[right=of a] {}; \\draw[->, >=Stealth] (0,0) -- (1,0);\\end{tikzpicture}'), {}],
    ['pgfplots', doc('\\usepackage{tikz}', '\\begin{tikzpicture}\\begin{axis}\\addplot {x};\\end{axis}\\end{tikzpicture}'), {}],
    ['no tikz', doc('', '\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}'), {}],
    ['standalone tikz option', '\\documentclass[tikz]{standalone}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}\n\\end{document}', {}],
    ['quantikz2 + tikz-cd', doc('\\usepackage{tikz}\\usetikzlibrary{quantikz2}\\usepackage{tikz-cd}', '\\begin{tikzcd} A \\end{tikzcd}'), {}],
    ['lualatex', '\\usegdlibrary{trees}\n\\begin{tikzpicture}\\end{tikzpicture}', {}],
    ['snippet libs', '\\node (a) {}; \\node[right=of a] {};', { libs: new Set() }],
    ['preview', '\\node {$\\R \\alpha \\foo$};', {}],
    ['defined macro', '\\newcommand{\\foo}{x}\n\\node {$\\foo$};', {}],
  ];
  T.golden('lint.txt', cases.map(([n, src, o]) => `${n}:\n${msgs(src, o).map((m) => '  ' + m).join('\n') || '  (nothing)'}`).join('\n') + '\n');
});
