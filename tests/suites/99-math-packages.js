// Formulas with commands from LaTeX packages the maths engines lack: mhchem's \ce (the engines' extension), siunitx,
// physics, cancel, mathtools and others drawn with stand-ins or rewritten (src/domain/mathengine.ts, math-rewrite.ts);
// a $ inside \text{…} in a formula; and the export loading each package, which compiles.
{
  const label = (id, text) => ({ id, type: 'text', x: 0, y: 0, text, tw: 0, valign: 'top', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 });
  const DRAWN = [
    String.raw`\ce{2H2 + O2 -> 2H2O}`, String.raw`\pu{3 m/s}`,
    String.raw`\SI{1.5e3}{\kilo\metre\per\second\squared}`, String.raw`\si{\joule\per\mole\per\kelvin}`, String.raw`\num{12345.678}`,
    String.raw`\qty{4}{\newton\metre}`, String.raw`\SI[per-mode=symbol]{3}{\metre\per\second}`, String.raw`\ang{30;15;10}`,
    String.raw`\SIrange{1}{5}{\milli\second}`, String.raw`\SI{20}{\degreeCelsius}`, String.raw`\SI{10}{\kilo\ohm}`,
    String.raw`\qty(\frac{a}{b})`, String.raw`\qty[x]`, String.raw`\abs{x} + \norm{v} + \dv{f}{x} + \pdv{f}{x} + \dd x`,
    String.raw`\expval{A} + \mel{a}{H}{b} + \vb{F} + \comm{A}{B}`,
    String.raw`\cancelto{0}{x}`, String.raw`\sideset{_a}{^b}\sum`, String.raw`\prescript{14}{6}{C}`, String.raw`\Tilde{x}\Hat{y}\Vec{v}`,
    String.raw`\upphi + \Upgamma`, String.raw`\nicefrac{1}{2} + \sfrac{3}{4}`, String.raw`\tensor{T}{^a_b}`, String.raw`\slashed{p}`,
    String.raw`a \centernot\implies b`, String.raw`X \Perp Y \mid Z`, String.raw`\EuScript{F}`, String.raw`\hdots\strut\vspace{2pt}`, String.raw`\scalebox{2}{x}`,
    String.raw`\begin{array}[t]{r@{}l*{2}{c}p{2cm}}a&b&c&d&e\end{array}`, String.raw`\begin{multlined}[t] a + b \\ = c\end{multlined}`,
    String.raw`f(x) = \begin{cases} 1 & \text{if $x > 0$} \\ 0 & \text{otherwise}\end{cases}`,
    String.raw`\makebox[20pt][c]{$T$} + \framebox{a}`, String.raw`\begin{array}{cc}\multirow{2}{*}{$x$} & \multicolumn{1}{l}{y}\end{array}`, String.raw`\begin{array}{c|c}\multicolumn{2}{c}{\cfrac{t}{e \to t}} \\ \multicolumn{1}{l}{x \mid y} & \multirow[t]{2}{*}[1ex]{\neg x}\end{array}`,
  ];

  T.test('math packages: formulas with package commands draw in both engines', async () => {
    const was = TD.math.engine;
    try {
      for (const e of ['katex', 'temml']) {
        TD.math.set(e);
        for (const f of DRAWN) {
          let err = '';
          try { TD.math.synchronous(() => TD.math.render(f, { throwOnError: true })); } catch (x) { err = String(x.message || x); }
          T.eq(err, '', e + ' draws ' + f);
        }
      }
    } finally { TD.math.set(was); await TD.math.whenReady(); }
  });

  // a formula's drawing, without the source it carries for screen readers and copying
  const drawn = (f) => {
    const d = document.createElement('div');
    d.innerHTML = TD.math.synchronous(() => TD.math.render(f, { throwOnError: true }));
    d.querySelectorAll('annotation').forEach((a) => a.remove());
    d.querySelectorAll('[aria-label]').forEach((a) => a.removeAttribute('aria-label'));
    return d.innerHTML;
  };
  // the text a piece of HTML shows (formulas without their source)
  const shown = (html) => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('annotation').forEach((a) => a.remove()); return d.textContent; };

  T.test('math packages: \\Perp (⫫) is Temml\'s own and, in KaTeX, two ⊥ drawn as one relation', async () => {
    const was = TD.math.engine;
    try {
      TD.math.set('temml'); T.ok(!TD.math.drawsAs('Perp'), 'Temml draws its own');
      TD.math.set('katex'); T.ok(TD.math.drawsAs('Perp'), 'KaTeX through the stand-in');
      T.eq(drawn(String.raw`X \Perp Y`), drawn(String.raw`X \mathrel{\perp\!\!\!\perp} Y`));
      T.ok(TD.lint.mathNeeds(String.raw`$X \Perp Y$`).pkgs.includes('cmll'), 'the export loads cmll for it');
    } finally { TD.math.set(was); await TD.math.whenReady(); }
  });

  T.test('math packages: siunitx is drawn as siunitx sets it', () => {
    T.eq(drawn(String.raw`\SI{1.5e3}{\kilo\metre\per\second}`), drawn(String.raw`{1.5\times 10^{3}\,\mathrm{k}\mathrm{m}\,\mathrm{s}^{-1}}`));
    T.eq(drawn(String.raw`\SI{30}{\degree}`), drawn(String.raw`{30{}^{\circ}}`), 'a degree sits against its number');
    T.eq(drawn(String.raw`\num{12345}`), drawn(String.raw`{12\,345}`), 'five digits are grouped');
    T.eq(drawn(String.raw`\qty(x)`), drawn(String.raw`\left(x\right)`), 'physics\' \\qty(…)');
  });

  T.test('math packages: a $ inside \\text{…} is part of the formula, in text objects and the Document', () => {
    const t = TD.textHtml(String.raw`$f = \text{1 if $x>0$, else 0}$ and $y$`);
    T.ok(!/katex-error|temml-error|tx-warn/.test(t), 'drawn without errors:\n' + t);
    T.ok(!shown(t).includes('$'), 'no stray dollar: ' + shown(t));
    const d = TD.docview.inl(String.raw`Let $g = \text{1 if $x>0$}$ here.`);
    T.ok(!/katex-error|temml-error/.test(d), 'the Document draws it whole:\n' + d);
    T.ok(!shown(d).includes('$'), 'no stray dollar in the Document: ' + shown(d));
  });

  T.test('math packages: the export loads what the labels use, and compiles', () => {
    const shapes = [
      label('a', String.raw`$\ce{H2O}$ and $\SI{3}{\metre\per\second}$ and $\cancel{x}$`),
      label('b', String.raw`$\ket{0}$, $\nicefrac{1}{2}$, $\upphi$, $\centernot\implies$, $\prescript{14}{6}{C}$`),
    ];
    const code = TD.toTikz(shapes, { standalone: true });
    for (const p of ['\\usepackage[version=4]{mhchem}', '\\usepackage{siunitx}', '\\usepackage{cancel}', '\\usepackage{braket}', '\\usepackage{nicefrac}', '\\usepackage{upgreek}', '\\usepackage{centernot}', '\\usepackage{mathtools}'])
      T.ok(code.includes(p), p + ' in:\n' + code);
    T.ok(!code.includes('{physics}'), 'no physics for \\ket alone');
    // the in-browser bundle has every one but mhchem, nicefrac and upgreek (rebuilt with them: scripts/tex-bundle.mjs)
    T.tex('math-packages', code);
  });

  T.test('math packages: physics comes for its commands, not for a file that defines them itself', () => {
    const id = TD.app.newDoc('physics macros', [label('a', String.raw`$\abs{x} + \dv{f}{x} + \qty(a+b)$`)], null, null);
    TD.app.setMode('diagram');
    let code = TD.toTikz(TD.state.doc.shapes, { standalone: true });
    T.ok(code.includes('\\usepackage{physics}'), 'physics:\n' + code);
    TD.app.setMacros(String.raw`\newcommand{\abs}[1]{\lvert#1\rvert}
\newcommand{\dv}[2]{\frac{d#1}{d#2}}
\newcommand{\qty}[1]{#1}`);
    code = TD.toTikz(TD.state.doc.shapes, { standalone: true });
    T.ok(!code.includes('{physics}'), 'the file\'s own \\abs, \\dv and \\qty need no physics:\n' + code);
    // the file's \qty is drawn as theirs, not physics'
    T.eq(drawn(String.raw`\qty(x)`), drawn(String.raw`(x)`));
    T.tex('math-packages-own', code);
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('math packages: any command or environment of a package TeX Live has loads it (src/domain/package-commands.ts)', () => {
    const id = TD.app.newDoc('table packages', [
      label('a', String.raw`$a \lesssim b \triangleq c$, $\llbracket x \rrbracket$, $\begin{gathered} a \\ b \end{gathered}$`),
      label('b', String.raw`\contour{white}{Name}\xspace and \ding{51}, $\overleftrightarrow{AB}$, \href{https://example.org}{a link}, \cref{x}`),
    ], null, null);
    TD.app.setMode('diagram');
    // the file's own \bm: no bm package (it would say "\bm already defined"); \xspace in a macro's body loads xspace
    TD.app.setMacros(String.raw`\newcommand{\bm}[1]{\boldsymbol{#1}}
\newcommand{\TR}{\textrm{true}\xspace}`);
    const code = TD.toTikz(TD.state.doc.shapes, { standalone: true });
    for (const p of ['amssymb', 'stmaryrd', 'amsmath', 'contour', 'xspace', 'pifont', 'hyperref', 'cleveref'])
      T.ok(code.includes(`\\usepackage{${p}}`), p + ' in:\n' + code);
    T.ok(!code.includes('{bm}'), 'no bm for the file\'s own \\bm:\n' + code);
    T.ok(code.indexOf('{hyperref}') < code.indexOf('{cleveref}') && code.indexOf('{amsmath}') < code.indexOf('{hyperref}'), 'hyperref after the rest, cleveref last:\n' + code);
    T.tex('math-packages-table', code);
    TD.app.cmd.docAction?.('del', id);
  });
}

T.test('math packages: siunitx and mhchem in text (no $) are drawn as formulas, and written as typed', () => {
  const h = TD.textHtml(String.raw`R = \SI{10}{\kilo\ohm}, \ce{H2O} and \textbf{bold}`);
  T.ok(!/\\SI|\\ce|katex-error|temml-error/.test(h.replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/aria-label="[^"]*"/g, '')), 'drawn, not shown as source:\n' + h);
  T.ok(/font-weight:bold'>bold</.test(h), 'the prose around them is prose');
  const code = TD.toTikz([{ id: 'u', type: 'text', x: 0, y: 0, text: String.raw`R = \SI{10}{\kilo\ohm}`, tw: 0, valign: 'top', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 }], { standalone: true });
  T.ok(code.includes(String.raw`{R = \SI{10}{\kilo\ohm}}`) && code.includes('\\usepackage{siunitx}'), 'exported as typed, with siunitx:\n' + code);
});

T.test('math packages: the linter doesn\'t call commands the preview draws undrawn', () => {
  const notes = TD.lint(String.raw`\begin{tikzpicture}\node {$\SI{3}{\kilo\metre\per\second} + \ce{H2O} + \cancelto{0}{x} + \abs{y} + \notacommand$};\end{tikzpicture}`, { libs: new Set(), pkgs: new Set(['tikz', 'siunitx', 'mhchem', 'cancel', 'physics']) })
    .filter((n) => /not drawn by the preview/.test(n.msg)).map((n) => n.msg);
  T.eq(notes, ['\\notacommand is not drawn by the preview (LaTeX output is unaffected if it is defined)']);
});
