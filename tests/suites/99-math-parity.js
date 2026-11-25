// Formulas drawn as LaTeX draws them (src/domain/mathengine.ts, math-rewrite.ts, src/core/doc-macros.ts and the
// script-size faces in public/vendor/katex/katex-scripts.css). The numbers below are pdfLaTeX's (TeX Live 2026,
// article 10pt, amsmath, mathtools, physics, stmaryrd, xcolor, xparse, array): \setbox0\hbox{$…$} and its \wd, in pt.
{
  const wd = (f) => (TD.textBox('$' + f + '$', { size: 'normalsize' }).w - 2) * TD.PT_PER_PX; // 2px of slack round the glyphs
  const hd = (f) => TD.textBox('$' + f + '$', { size: 'normalsize' }).h * TD.PT_PER_PX;
  const fontsLoaded = async () => {
    await Promise.all(['TDScript_Main7', 'TDScript_Main5', 'TDScript_Math7', 'TDScript_Math5', 'TDScript_Caligraphic7'].flatMap((f) =>
      [document.fonts.load(`10px ${f}`, 'a'), document.fonts.load(`italic 10px ${f}`, 'a'), document.fonts.load(`bold 10px ${f}`, 'a')]));
    TD.clearTextCache?.();
  };
  // every formula within eps of TeX's width; the ones that are not, listed
  const widths = (cases, eps = 0.2) => {
    const off = cases.map(([f, w]) => [f, wd(f), w]).filter(([, a, b]) => !(Math.abs(a - b) < eps));
    T.eq(off.map(([f, a, b]) => `${f}: ${a.toFixed(3)}pt vs TeX ${b}pt`), [], 'as wide as TeX');
  };
  const errors = (fs) => fs.filter((f) => { try { TD.math.synchronous(() => TD.math.render(f, { throwOnError: true })); return false; } catch (e) { return true; } });

  T.test('math parity: scripts are set in the 7pt and 5pt fonts, as wide as TeX sets them', async () => {
    await fontsLoaded();
    // cmr7/cmmi7/cmsy7/cmbx7 for first-order scripts, cmr5/cmmi5 for second-order ones (\DeclareMathSizes{10}{10}{7}{5})
    widths([['x', 5.71527], ['x^2', 10.2014], ['e^{-A^T t}', 25.97063], ['U_{1,0}', 17.67503], ['\\sum_{i=1}^n a_i', 34.29172],
      ['x_{y_z}', 14.39934], ['\\frac{1}{2}', 6.38612], ['2^{\\mathbf{10}}', 14.56111], ['x^{\\mathcal{F}}', 12.64928], ['a_{n+1}', 20.85426],
      ['x_{ab}^{cd}', 14.06958], ['\\scriptstyle abc', 11.42805], ['\\scriptscriptstyle abc', 10.28595], ['\\scriptstyle 123', 11.95839],
      ['\\scriptscriptstyle 123', 10.2085], ['\\scriptstyle \\mathbf{ab}', 9.434], ['\\scriptstyle \\mathcal{ABC}', 16.55981]]);
  });

  T.test('math parity: the kernel\'s and amsmath\'s \\sp, \\mspace, \\slash, \\null and lengths, \\mathop\\cs, \\left\\llbracket', async () => {
    await fontsLoaded();
    T.eq(errors(['C\\sp{(1)}', 'x\\sb{2}', '\\mathpalette\\mathrm{x}\\m@th']), [], 'drawn');
    widths([['C\\sp{(1)}', 18.59865], ['a\\mspace{-12mu}x', 4.33466], ['a\\slash b', 14.57756], ['\\null+1', 17.22215],
      ['\\mathop\\bigoplus\\limits_{i=0}^\\infty L_i', 24.75581], ['\\kern-\\nulldelimiterspace x', 4.51527],
      // a factor before a length multiplies it
      ['a\\hspace{2\\arraycolsep}b', 19.57755], ['a\\kern-0.5\\nulldelimiterspace b', 8.97755]]);
    // stmaryrd's brackets keep their one size round an inner atom (KaTeX's \llbracket is [\mkern-3.2mu[, 0.25pt
    // narrower than stmaryrd's 4.028pt glyph)
    widths([['\\left\\llbracket 1,k\\right\\rrbracket', 23.02084]], 0.6);
    // \\[\jot] puts 3pt more between the rows
    const gap = hd('\\begin{aligned}a\\\\[\\jot]b\\end{aligned}') - hd('\\begin{aligned}a\\\\b\\end{aligned}');
    T.ok(Math.abs(gap - 3) < 0.2, '\\jot is 3pt: ' + gap);
    const gap2 = hd('\\begin{aligned}a\\\\[2\\jot]b\\end{aligned}') - hd('\\begin{aligned}a\\\\b\\end{aligned}');
    T.ok(Math.abs(gap2 - 6) < 0.2, '2\\jot is 6pt: ' + gap2);
  });

  T.test('math parity: physics\' bra-kets with their stars and optional argument', async () => {
    await fontsLoaded();
    widths([['\\ev{A}', 15.27782], ['\\ev{A}{\\psi}', 36.2454], ['\\vev{W_n}', 39.8878], ['\\ketbra{u_k}', 32.95624],
      ['\\mel**{Z_k}{\\frac{1}{2}}{Z_l}', 44.13966]]);
  });

  T.test('math parity: \\textcolor is a group (no space round a coloured +), xcolor\'s own colour values', async () => {
    await fontsLoaded();
    widths([['\\textcolor{red}{a}\\textcolor{red}{+}\\textcolor{blue}{b}\\textcolor{red}{=}c', 29.46071]]);
    const html = TD.math.synchronous(() => TD.math.render('\\color{green}x'));
    T.ok(/#00ff00/i.test(html) && !/#008000/i.test(html), 'xcolor\'s green is #00ff00');
  });

  T.test('math parity: array columns with @{…}, >{…} and <{…}, \\makebox widths', async () => {
    await fontsLoaded();
    widths([['\\left(\\begin{array}{@{}cc@{}}1&2\\end{array}\\right)', 29.16678], ['\\begin{array}{r@{}l}a&=b\\\\cc&=dd\\end{array}', 39.62039],
      ['\\begin{array}{r@{\\quad}l}a&b\\end{array}', 29.57759], ['\\begin{array}{>{\\bullet}c<{!}c}a&b\\end{array}', 37.35538],
      ['a\\makebox[2em]{x}b', 29.57758], ['a\\makebox[2em][l]{x}b', 29.57758], ['a\\makebox[3em]{}b', 39.57759],
      // \framebox: its frame inside the width (\fboxrule and \fboxsep a side)
      ['a\\framebox[5cm]{Top}b', 151.84132], ['\\framebox[2cm][l]{x}', 56.9055]]);
    // @{…} next to cells narrower than the paddings they take away (a column can't be narrower than nothing in the engine)
    widths([['\\begin{array}{@{}l@{\\quad}l@{}}a&b\\end{array}', 19.57759], ['\\begin{array}{@{}c@{}}x\\\\y\\end{array}', 5.71529],
      ['\\begin{array}{r@{}c@{}l}a&=&b\\end{array}', 27.3554], ['\\begin{array}{c@{}c@{}c}1&-&1\\end{array}', 27.77788],
      ['\\begin{array}{r@{\\quad}c@{}l}a&=&b\\\\aaaa&-&bb\\end{array}', 57.50473], ['\\left[\\begin{array}{c@{\\,}c@{\\,}c}1&2&3\\\\4&5&6\\end{array}\\right]', 38.88895]]);
    // … and each cell where TeX sets it (a at the 5pt padding, = after it or a \quad after it, b after that)
    const d = document.createElement('div'); d.className = 'tx'; document.body.append(d);
    try {
      for (const [f, at] of [['\\begin{array}{r@{}c@{}l}a&=&b\\end{array}', [5, 10.3, 18.1]], ['\\begin{array}{l@{\\quad}c@{}l}a&=&b\\end{array}', [5, 20.3, 28.1]]]) {
        d.innerHTML = TD.math.synchronous(() => TD.math.render(f));
        // (in pt: KaTeX's em is TeX's 10pt)
        const box = d.querySelector('.katex-html').getBoundingClientRect(), em = parseFloat(getComputedStyle(d.querySelector('.katex')).fontSize);
        const x = (c) => ([...d.querySelectorAll('.mord,.mrel')].find((e) => !e.children.length && e.textContent === c).getBoundingClientRect().left - box.left) / em * 10;
        T.eq([x('a'), x('='), x('b')].map((v) => +v.toFixed(1)), at, 'cells where TeX sets them: ' + f);
      }
    } finally { d.remove(); }
  });

  T.test('math parity: multlined as wide as mathtools sets it, its first line at the left and its last at the right', async () => {
    await fontsLoaded();
    widths([['\\begin{multlined}a+b+c+d+e\\\\ +f+g\\\\ =h\\end{multlined}', 82.65479], ['\\begin{multlined}[6cm]x\\\\y\\end{multlined}', 170.71652],
      // a line ending in a control space
      ['\\begin{multlined}a=\\ \\\\b+c+d+e+f+g\\\\c\\end{multlined}', 90.69176]]);
    const d = document.createElement('div'); d.className = 'tx'; document.body.append(d);
    try {
      d.innerHTML = TD.math.synchronous(() => TD.math.render('\\begin{multlined}[6cm]x\\\\y\\end{multlined}'));
      // (the line drawn, not its copy in the phantom that gives the width)
      const at = (c) => [...d.querySelectorAll('.mathnormal')].find((e) => e.textContent === c && !/transparent/.test(e.style.color)).getBoundingClientRect();
      const box = d.querySelector('.katex-html').getBoundingClientRect(), x = at('x'), y = at('y');
      T.ok(x.left - box.left < 2 && box.right - y.right < 4, `x flush left, y flush right: ${x.left - box.left}, ${box.right - y.right}`);
    } finally { d.remove(); }
  });

  T.test('math parity: a file\'s macros with optional arguments (\\newcommand [default], xparse s, o, D) and delimited \\def', async () => {
    await fontsLoaded();
    const was = TD.math.macroText;
    TD.math.useMacros(String.raw`\newcommand{\lmp}[1][t]{\lambda_{n,#1}}
\NewDocumentCommand{\val}{ s D<>{r} m }{\IfBooleanTF{#1}{V^*}{V}_{#2}(#3)}
\NewDocumentCommand\nrm{o m}{\IfNoValueTF{#1}{\|#2\|}{\|#2\|_{#1}}}
\def\pair#1,#2.{(#1;#2)}`);
    try {
      widths([['\\lmp', 16.67253], ['\\lmp[s]', 17.42601], ['\\val{s}', 22.72688], ['\\val*<q>{s}', 25.11809], ['\\nrm{x}', 15.7153],
        ['\\nrm[2]{x}', 20.20143], ['\\pair a,b.', 21.79976]]);
      // the definitions read at the formula's start are not part of its annotation
      const d = document.createElement('div');
      d.innerHTML = TD.math.synchronous(() => TD.math.render('\\lmp[s]'));
      const note = d.querySelector('annotation')?.textContent || '';
      T.ok(note === '\\lmp[s]', 'annotation: ' + note);
    } finally { TD.math.useMacros(was); }
  });

  T.test('math parity: \\cancel\'s line and a radical are drawn in a label\'s picture, in the text\'s colour', async () => {
    const previousId = TD.state.docId, previousMode = TD.state.mode, previousEngine = TD.math.engine;
    try {
      TD.math.set('katex');
      const shape = { ...TD.TYPES.text.create({ x: 100, y: 100 }, {}), id: 'cancel-label', text: '$\\cancel{x}+\\sqrt{y}$' };
      TD.app.newDoc('Cancel', null, null, null, null, 'page', { pages: 1, shapes: [shape] });
      await TD.math.whenReady();
      const exported = new DOMParser().parseFromString(TD.app.svgOf(TD.state.doc.sheet.shapes), 'image/svg+xml');
      const href = exported.querySelector('image.svg-label').getAttribute('href');
      const svg = decodeURIComponent(escape(atob(href.split(',')[1])));
      T.ok(/<svg[^>]*stroke="currentColor"[^>]*>(?:(?!<\/svg>)[\s\S])*<line/.test(svg), 'the strike is stroked');
      T.ok(/<path[^>]*stroke="none"/.test(svg), 'the radical is filled, not stroked');
    } finally { TD.math.set(previousEngine); TD.app.cmd.openDoc(previousId); TD.app.cmd.setMode(previousMode); }
  });

  // a formula's height and depth (KaTeX's strut: its height, and its vertical-align below the baseline), in pt
  const heightDepth = (f) => {
    const d = document.createElement('div');
    d.innerHTML = TD.math.synchronous(() => TD.math.render(f));
    let h = 0, dp = 0;
    for (const s of d.querySelectorAll('.katex-html > .katex-base > .katex-strut')) {
      const x = parseFloat(s.style.height) || 0, y = -(parseFloat(s.style.verticalAlign) || 0);
      h = Math.max(h, x - y); dp = Math.max(dp, y);
    }
    return [h * 10, dp * 10]; // (KaTeX's em is TeX's 10pt)
  };
  const heights = (cases, eps = 0.05) => {
    const off = cases.map(([f, h, d]) => [f, ...heightDepth(f), h, d]).filter(([, a, b, h, d]) => !(Math.abs(a - h) < eps && Math.abs(b - d) < eps));
    T.eq(off.map(([f, a, b, h, d]) => `${f}: ${a.toFixed(3)}+${b.toFixed(3)}pt vs TeX ${h}+${d}pt`), [], 'as tall and deep as TeX');
  };

  T.test('math parity: a file\'s macros that test their arguments (ifthen, xifthen, etoolbox, \\ifx&#1&), \\newrobustcmd, \\newenvironment, mathtools\' paired delimiters', async () => {
    await fontsLoaded();
    const was = TD.math.macroText;
    TD.math.useMacros(String.raw`\newcommand{\E}[2][]{\mathbb{E}\ifthenelse{\equal{#1}{}}{}{_{#1}}\!\left[{#2}\right]}
\newcommand{\pick}[1]{\ifthenelse{\isempty{#1}}{\alpha}{\beta_{#1}}}
\newcommand{\cmp}[1]{\ifthenelse{#1 > 2}{A}{BB}}
\newcommand{\nott}[1]{\ifthenelse{\not\equal{#1}{x}}{A}{BB}}
\newcommand{\bp}[2]{\ifstrequal{#1}{0}{}{\theta^{#1}}\ifstrempty{#2}{x}{y_{#2}}}
\newcommand{\ex}[2]{{\ifx&#1& \mathbb{E} \else \underset{#1}{\mathbb{E}} \fi \left[#2\right]}}
\newrobustcmd{\acu}[1]{\acute{#1}}
\newenvironment{sm}{\left[\begin{smallmatrix}}{\end{smallmatrix}\right]}
\DeclarePairedDelimiter{\abs}{\lvert}{\rvert}
\DeclarePairedDelimiterX{\set}[2]{\{}{\}}{#1\,\delimsize\vert\,#2}`);
    try {
      widths([['\\E{x}', 17.93753], ['\\E[\\pi]{\\frac{a}{b}}', 27.16518], ['\\pick{}+\\pick{n}', 29.75575], ['\\cmp{3}\\cmp{1}', 23.67363],
        ['\\nott{x}\\nott{y}', 23.67363], ['\\bp{0}{}\\bp{2}{k}', 24.99661], ['\\ex{}{y}\\ex{n}{y}', 38.30096], ['\\acu{u}+\\acu{v}', 23.15273],
        ['\\abs{x}+\\abs*{\\frac{a}{b}}+\\abs[\\Big]{x}', 61.50134], ['\\set{x}{\\frac{a}{b}}+\\set*{x}{\\frac{a}{b}}+\\set[\\big]{x}{y}', 113.10463]]);
      // (smallmatrix itself is the engine's: 0.56pt wider than amsmath's)
      widths([['2\\begin{sm}a&0\\\\0&b\\end{sm}', 26.65619]], 0.6);
      T.eq(errors(['\\ifthenelse{\\lengthtest{1pt<2pt}}{a}{b}']).length, 1, 'a test the preview can\'t decide stays an error');
    } finally { TD.math.useMacros(was); }
  });

  T.test('math parity: mleftright\'s \\mleft and \\mright, and \\left and \\right made theirs in a preamble', async () => {
    await fontsLoaded();
    widths([['f\\mleft(\\frac{a}{b}\\mright)+f\\left(\\frac{a}{b}\\right)', 57.642]]);
    const was = TD.math.macroText;
    TD.math.useMacros(String.raw`\let\originalleft\left
\let\originalright\right
\renewcommand{\left}{\mathopen{}\mathclose\bgroup\originalleft}
\renewcommand{\right}{\aftergroup\egroup\originalright}`);
    try { widths([['f\\left(\\frac{a}{b}\\right)+\\sin\\left(x\\right)^2', 64.35576], ['\\log\\left[x\\middle|y\\right]', 32.22691]]); }
    finally { TD.math.useMacros(was); }
    widths([['f\\left(\\frac{a}{b}\\right)+\\sin\\left(x\\right)^2', 67.68901]]);
  });

  T.test('math parity: \\nonscript, counters, \\nomenclature and \\ensuremath in text', async () => {
    await fontsLoaded();
    widths([['x\\nonscript\\;y+{\\scriptstyle x\\nonscript\\;y}+\\int_{a\\nonscript\\mskip-\\thinmuskip b}', 60.11687],
      ['a\\stepcounter{equation}b\\nomenclature{$a$}{Anything}c', 13.9051], ['\\text{a\\ensuremath{\\tau}b}+\\ensuremath{\\tau}', 33.78468]]);
  });

  T.test('math parity: amsmath\'s rows are lines of a paragraph (\\baselineskip, \\lineskip and \\jot), \\\\[dim] a \\vskip, [t] and [b]', async () => {
    await fontsLoaded();
    heights([['x\\begin{aligned}a\\\\b\\end{aligned}', 16, 11], ['x\\begin{aligned}\\dfrac12\\\\\\dfrac12\\end{aligned}', 24.56903, 19.56903],
      ['x\\begin{aligned}\\dfrac12\\\\\\dfrac12\\\\\\dfrac12\\end{aligned}', 36.60355, 31.60355], ['x\\begin{gathered}\\dfrac12\\\\\\dfrac12\\end{gathered}', 24.56903, 19.56903],
      ['x\\begin{aligned}a\\\\[10pt]b\\end{aligned}', 21, 16], ['x\\begin{aligned}\\dfrac12\\\\[10pt]b\\end{aligned}', 25.53452, 20.53452],
      ['x\\begin{aligned}a\\\\[-5pt]b\\end{aligned}', 13.5, 8.5],
      // an array's rows have no interline glue, and nor do amsmath's inside one (its \baselineskip and \lineskip are 0)
      ['x\\begin{array}{c}\\dfrac12\\\\\\dfrac12\\end{array}', 22.56903, 17.56903], ['\\begin{pmatrix}\\begin{aligned}\\dfrac12\\\\\\dfrac12\\end{aligned}\\end{pmatrix}', 24.06903, 19.06903],
      ['x\\begin{aligned}[t]a\\\\b\\end{aligned}', 8.39996, 18.60004], ['x\\begin{aligned}[b]a\\\\b\\end{aligned}', 23.39996, 3.60004],
      ['x\\begin{gathered}[t]a\\\\b\\end{gathered}', 8.39996, 18.60004],
      // mathtools' multlined: its first two lines 1pt nearer, unless the first is deeper and the second taller than the strut
      ['\\begin{multlined}a\\\\b\\\\c\\end{multlined}', 23, 18], ['\\begin{multlined}\\Big(\\\\b\\end{multlined}', 19.00009, 14.00008],
      ['\\begin{multlined}\\Big(\\\\\\dfrac12\\end{multlined}', 23.5346, 18.53459], ['\\begin{multlined}[t]a\\\\b\\\\c\\end{multlined}', 8.39996, 32.60004]]);
    // Temml reads no position option: it is left out for it
    const engine = TD.math.engine;
    TD.math.set('temml');
    try { T.eq(errors(['\\begin{multlined}[t]a\\\\b\\end{multlined}', '\\begin{aligned}[t]a\\\\b\\end{aligned}']), [], 'Temml draws them'); }
    finally { TD.math.set(engine); await TD.math.whenReady(); TD.clearTextCache?.(); }
    // aligned takes only [t], [c] or [b]: other brackets are the first row's
    widths([['\\begin{aligned}[x]a\\end{aligned}', 16.55673], ['\\begin{gathered}[xyz]a\\end{gathered}', 5.28589]]);
  });

  T.test('math parity: limits as wide as the widest of them (TeX moves them by half the italic correction), a one-column cases\' \\quad', async () => {
    await fontsLoaded();
    widths([['\\displaystyle\\int\\limits^{xxxxxx}', 27.20837], ['\\displaystyle\\int\\limits_{n\\tau_p}', 12.82974],
      ['\\displaystyle\\int\\limits_{n\\tau_p}^{(n+1)\\tau_p}', 29.20482], ['\\displaystyle\\sum\\limits_{xxxxxxxxxx}', 45.34729],
      ['\\begin{cases}a\\\\b\\end{cases}x', 31.92339], ['\\begin{cases}a&b\\\\c\\end{cases}x', 36.21504], ['\\begin{rcases}a\\\\b\\end{rcases}x', 21.92337]]);
  });
  T.test('math parity: maths inside \\text in a script is set at the script\'s size, in text style', async () => {
    await fontsLoaded();
    widths([['\\displaystyle x_{\\text{$abcabc$}}', 29.07138], ['\\displaystyle \\underbrace{x}_{\\text{$abcabcabc$}}', 34.28416]], 0.25);
  });
}
