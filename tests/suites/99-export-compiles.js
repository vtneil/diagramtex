// What an export needs to compile, beyond its drawing: the preamble definitions a picture's code uses (functions,
// environments, expandable xparse commands, pgfplots libraries), xcolor's dvipsnames and x11names by value, and code a
// block couldn't read kept so that it still compiles (a circuitikz environment of plain TikZ, a sequence diagram).
{
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
  const exportOf = (src) => TD.toTikz(shapesOf(src), { standalone: true });

  T.test('export compiles: a circuitikz environment of plain TikZ loses its \\begin and \\end together', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{circuitikz}
\usetikzlibrary{matrix}
\begin{document}
\begin{circuitikz}
\matrix[name=c, matrix of nodes, column sep=1cm] { a & b \\ };
\node (y) at (3,0) {y};
\draw (c-1-1) -- (c-1-2) -- (y);
\end{circuitikz}
\end{document}`);
    T.eq((code.match(/\\begin\{circuitikz\}/g) || []).length, (code.match(/\\end\{circuitikz\}/g) || []).length, 'as many \\begin as \\end:\n' + code);
    T.tex('export-compiles-circuitikz-plain', code);
  });

  T.test('export compiles: a sequence diagram kept as code sits in its node between \\pgfinterruptpicture and its end', () => {
    // a message by a macro of the document's: the block can't read it, so the diagram is kept as code
    const shapes = shapesOf(String.raw`\documentclass{standalone}
\usepackage{pgf-umlsd}
\newcommand{\ask}[2]{\begin{call}{#1}{ask()}{#2}{}\end{call}}
\begin{document}
\begin{sequencediagram}
  \newthread{t}{:Thread}
  \newinst[1]{i}{:Instance}
  \ask{t}{i}
\end{sequencediagram}
\end{document}`);
    const code = TD.toTikz(shapes, { standalone: true });
    T.ok(!/\\node at \(0,0\) \{\\begin\{sequencediagram\}/.test(code), 'not straight in a node (' + shapes.map((s) => s.type).join() + '):\n' + code);
    T.tex('export-compiles-umlsd-kept', code);
  });

  T.test('export compiles: preamble definitions a picture uses come with it (functions, expandable commands, environments)', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\pgfmathdeclarefunction{bell}{2}{\pgfmathparse{exp(-((#1)^2)/(2*#2^2))}}
\NewExpandableDocumentCommand{\twice}{m}{#1#1}
\newenvironment{shiftedby}{\begin{scope}[shift={(4,0)}]}{\end{scope}}
\begin{document}
\begin{tikzpicture}
\draw[domain=-2:2, samples=40] plot (\x, {bell(\x,1)});
\node at (0,-1) {\twice{ab}};
\begin{shiftedby}\draw (0,0) circle (1);\end{shiftedby}
\end{tikzpicture}
\end{document}`);
    for (const d of ['\\pgfmathdeclarefunction{bell}', '\\NewExpandableDocumentCommand{\\twice}', '\\newenvironment{shiftedby}'])
      T.ok(code.includes(d), d + ' in:\n' + code);
    T.tex('export-compiles-preamble-defs', code);
  });

  T.test('export compiles: pgfplots libraries load after pgfplots, from the source\'s \\usetikzlibrary or from the code', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{pgfplots}
\usetikzlibrary{pgfplots.fillbetween}
\pgfplotsset{compat=1.18}
\begin{document}
\begin{tikzpicture}
\begin{axis}[cycle list/Dark2]
\addplot[name path=A, domain=0:1] {x^2};
\addplot[name path=B, domain=0:1] {x};
\addplot fill between[of=A and B];
\end{axis}
\end{tikzpicture}
\end{document}`);
    T.ok(/\\usepackage\{pgfplots\}[\s\S]*\\usepgfplotslibrary\{[^}]*fillbetween/.test(code) && /\\usepgfplotslibrary\{[^}]*colorbrewer/.test(code), 'fillbetween and colorbrewer after pgfplots:\n' + code);
    T.ok(!/\\usetikzlibrary\{[^}]*pgfplots\./.test(code), 'not as TikZ libraries before pgfplots:\n' + code);
    T.tex('export-compiles-pgfplots-libs', code);
  });

  T.test('export compiles: dvipsnames and x11names colours are drawn with xcolor\'s values and defined by value', () => {
    const src = String.raw`\documentclass{standalone}
\usepackage[dvipsnames,x11names]{xcolor}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\draw[BrickRed, line width=2pt] (0,0) -- (2,0);
\fill[LightSteelBlue4] (0,1) rectangle (1,2);
\draw[Green] (0,3) -- (2,3);
\node[text=WildStrawberry, rotate=3.7, starburst] at (3,3) {x};
\end{tikzpicture}
\end{document}`;
    const shapes = shapesOf(src);
    const strokes = shapes.map((s) => String(s.stroke || s.fill || '').toLowerCase());
    T.ok(strokes.includes('#b80000') && strokes.includes('#6e7b8b'), 'BrickRed and LightSteelBlue4: ' + strokes.join(' '));
    T.ok(strokes.includes('#00ff00'), 'dvipsnames\' Green (with dvipsnames loaded), not CSS\'s: ' + strokes.join(' '));
    const code = TD.toTikz(shapes, { standalone: true });
    T.tex('export-compiles-named-colours', code);
  });

  T.test('export compiles: \\let\\a=\\b in a preamble is read whole', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\makeatletter
\let\widthof=\pgfmath@calc@widthof
\makeatother
\begin{document}
\begin{tikzpicture}\node[draw, text width=\widthof{Text}] {Text};\end{tikzpicture}
\end{document}`);
    T.ok(!/\\let\\widthof=\s*\n/.test(code) && code.includes('\\let\\widthof=\\pgfmath@calc@widthof'), 'the whole \\let:\n' + code);
    T.tex('export-compiles-let', code);
  });

  T.test('export compiles: a picture with a picture in a node ends at its own \\end{tikzpicture}', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\node[draw] (a) {\begin{tikzpicture}\draw (0,0) circle (0.3);\end{tikzpicture}};
\draw[->] (a) -- (2,0);
\end{tikzpicture}
\end{document}`);
    T.eq((code.match(/\\begin\{tikzpicture\}/g) || []).length, (code.match(/\\end\{tikzpicture\}/g) || []).length, 'as many \\begin as \\end:\n' + code);
    T.tex('export-compiles-nested-picture', code);
  });

  T.test('export compiles: a bare blochsphere is the Bloch block; a source\'s own \\bm loads no bm; latexsym\'s symbols load amssymb', () => {
    const bloch = shapesOf(String.raw`\documentclass{standalone}
\usepackage{blochsphere}
\begin{document}
\begin{blochsphere}[ball=3d,opacity=0.3]
  \drawBallGrid[style={opacity=1,ultra thin}]{30}{30}
  \labelLatLon{up}{90}{20};
\end{blochsphere}
\end{document}`);
    T.eq(bloch.map((s) => s.type).join(), 'bloch');
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\newcommand{\bm}[1]{\mathbf{#1}}
\begin{document}
\begin{tikzpicture}
\node at (0,0) {$\bm{x} \leadsto \Diamond y$};
\end{tikzpicture}
\end{document}`);
    T.ok(!code.includes('{bm}') && code.includes('\\usepackage{amssymb}'), 'no bm, amssymb:\n' + code);
    T.tex('export-compiles-own-bm', code);
  });

  T.test('export compiles: fillbetween loaded as a TikZ library by that name is written after pgfplots', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{pgfplots}
\usetikzlibrary{fillbetween}
\begin{document}
\begin{tikzpicture}
\draw[name path=a] (0,0) -- (2,1);
\draw[name path=b] (0,0) -- (2,0);
\tikzfillbetween[of=a and b]{gray!30};
\end{tikzpicture}
\end{document}`);
    T.ok(!/\\usetikzlibrary\{[^}]*\bfillbetween/.test(code) && /\\usepackage\{pgfplots\}[\s\S]*\\usepgfplotslibrary\{fillbetween\}/.test(code), 'after pgfplots:\n' + code);
    T.tex('export-compiles-fillbetween-name', code);
  });

  T.test('export compiles: a \\def with delimited parameters is read whole; \\qty{…} alone is physics\', \\unit siunitx\'s', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\makeatletter
\def\tikz@AngleOf(#1)(#2)#3{\pgfmathanglebetweenpoints{\pgfpointanchor{#1}{center}}{\pgfpointanchor{#2}{center}}\pgfmathsetmacro{#3}{\pgfmathresult}}
\newcommand{\AngleOf}{\tikz@AngleOf}
\makeatother
\begin{document}
\begin{tikzpicture}
\coordinate (a) at (0,0); \coordinate (b) at (1,1);
\AngleOf(a)(b){\ang}
\node at (2,0) {\ang};
\node at (0,-1) {$N \times \qty{0}$ and $\unit{\metre}$};
\end{tikzpicture}
\end{document}`);
    T.ok(!/^\{\\pgfmathresult\}$/m.test(code), 'no fragment of the \\def left:\n' + code);
    T.ok(code.includes('{physics}') && code.includes('{siunitx}') && !code.includes('{units}'), 'physics and siunitx, not units:\n' + code);
    T.tex('export-compiles-delimited-def', code);
  });

  T.test('export compiles: circuitikz\'s unit labels load it with siunitx; a picture\'s own \\newcommand loads no package for it', () => {
    const code = exportOf(String.raw`\documentclass{standalone}
\usepackage[siunitx]{circuitikz}
\begin{document}
\begin{circuitikz}
\newcommand{\shift}{2}
\draw (0,0) to[R, l^=200<\kilo\ohm>] (0,\shift) -- (2,2);
\draw[decorate] (0,0) -- (1,0);
\end{circuitikz}
\end{document}`);
    T.ok(code.includes('\\usepackage[siunitx]{circuitikz}'), 'circuitikz with siunitx:\n' + code);
    T.tex('export-compiles-cz-siunitx', code.replace('\\draw[decorate] (0,0) -- (1,0);', ''));
  });

  // every object written from what it is, as once edited (the corpus runner's --export-shapes)
  const editedOf = (src) => TD.toTikz(shapesOf(src).map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });

  T.test('export compiles, edited: names stay defined before the code that uses them', () => {
    const code = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\usetikzlibrary{backgrounds, patterns}
\begin{document}
\begin{tikzpicture}[every node/.style={circle, draw}]
\coordinate (A) at (0, 3)
 coordinate (B) at (5, 3)
 coordinate (C) at (0, 2);
\draw (A) -- (B) -- (C);
\node (234) at (0,0) {$234$};
\draw (234) -- ++(2,0) node[below] (x) {$x$} -- ++(1,1) node (top) {};
\draw[->] (x) -- (top);
\begin{scope}[on background layer]
\node[rectangle, draw, pattern=north east lines, minimum width=1cm, minimum height=1cm] at (234) {};
\end{scope}
\end{tikzpicture}
\end{document}`);
    for (const nm of ['A', 'B', 'C', '234', 'x', 'top']) T.ok(new RegExp(`\\(${nm}\\) at`).test(code), nm + ' defined:\n' + code);
    T.ok(code.includes('at (234)') && code.indexOf('(234) at') < code.indexOf('at (234)'), 'node 234 before the background code at it:\n' + code);
    T.eq((code.match(/\\coordinate \(B\)/g) || []).length, 1, 'B once:\n' + code);
    T.tex('export-compiles-edited-names', code);
  });

  T.test('export compiles, edited: statements share the scopes the source wrote them in', () => {
    const code = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\usetikzlibrary{patterns, chains, scopes}
\begin{document}
\begin{tikzpicture}[scale=2]
\clip (0,0) circle (1);
\pgfmathsetmacro{\x}{1}
\draw[name path=c, pattern=north west lines] (0,0) circle ({rad(atan(\x))});
\begin{scope}[shift={(0.2,0)}]
\foreach[evaluate=\z as \c using .3*\z] \z in {.1,.3} {
  \draw (0,0) circle (\z);
}
\end{scope}
\draw[very thick, line width=2*\pgflinewidth] (0,0) circle (0.9);
{[start chain=going right, node distance=2mm]
\node[on chain] {a};
\node[on chain, join] {b};
}
\end{tikzpicture}
\end{document}`);
    T.eq((code.match(/\\begin\{scope\}\[scale=2\]/g) || []).length, 1, 'one scale scope, the clip holding for all of it:\n' + code);
    T.ok(/\\clip[^]*\\pgfmathsetmacro[^]*\\begin\{scope\}\[shift[^]*\\foreach[^]*\\end\{scope\}[^]*very thick/.test(code), 'in the source\'s order and nesting:\n' + code);
    T.ok(!/NaN/.test(code), 'no NaN width:\n' + code);
    T.eq((code.match(/start chain/g) || []).length, 1, 'the chain in one scope:\n' + code);
    T.tex('export-compiles-edited-scopes', code);
  });

  T.test('export compiles, edited: every name the code uses is made (a point before a node, a path starting with a node, matrix cells, loop nodes, a tabular)', () => {
    const code = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\usetikzlibrary{matrix, fit, backgrounds}
\begin{document}
\begin{tikzpicture}
\coordinate (x) at (2,0) node[draw,right] {world};
\fill (x) circle (1pt);
\path node[draw] (q) {q} -- ++(2cm,0) node[draw] (p1) {p1};
\node[fit=(q)(p1), draw] {};
\matrix (m) [matrix of nodes, column sep=1em] { a & b \\ c & d \\ };
\foreach \pt/\ang in {1/90,2/210,3/330} { \node[circle,draw] (\pt) at (\ang:1){\pt}; }
\foreach \a/\b in {1/2,2/3,3/1} { \draw (\a) -- (\b); }
\node (t) at (0,-3) {\begin{tabular}{|c|}\hline A\\\hline\end{tabular}};
\draw[->] (m-1-1.east) -- (m-2-2) -- (t.north);
\begin{scope}[on background layer]
\fill[gray!20] (t.south west) rectangle (q.north east);
\end{scope}
\end{tikzpicture}
\end{document}`);
    for (const nm of ['x', 'm-1-1', 'm-2-2', '2', '3', 't']) T.ok(code.includes(`(${nm}) at`), nm + ' made:\n' + code);
    for (const nm of ['q', 'p1']) T.ok(code.includes(`(${nm}) {`), nm + ' made (its path kept as written):\n' + code);
    T.ok(code.indexOf('(t) at') < code.indexOf('(t.south west)'), 'the background statement after the node it names:\n' + code);
    T.tex('export-compiles-edited-made-names', code);
  });

  T.test('export compiles, edited: definitions are read whole and written once', () => {
    const code = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\usepackage{contour}
\tikzset{declare function={a(\x)=2*\x+3;}}
\def\setfpu#1#2{\begingroup\pgfmathsetmacro{#1}{#2}\pgfmathsmuggle#1\endgroup}
\DeclareSymbolFontAlphabet{\mathbbl}{bboldx}
\begin{document}
\begin{tikzpicture}[scale=2, declare function={w=.2;}]
\pgfmathsetmacro{\al}{asin(w)}
\setfpu{\myR}{5*sqrt(4)/14}
\def\Mark[#1](#2)#3{\begin{scope}[shift={(#1:1)}]\node[draw] (I#2) {#3};\end{scope}}
\Mark[0](1){a}
\Mark[90](2){b}
\begin{scope}[on background layer]
\draw (I1) -- (I2);
\end{scope}
\draw (0,0) circle[radius=\myR] (0,{a(0)}) -- (\al:1);
\foreach \k/\s in {0/1, 3/{N-1}} { \node at (\k,2) {$S_{\s}$}; }
\end{tikzpicture}
\end{document}`);
    T.eq((code.match(/declare function=\{a/g) || []).length, 1, 'the \\tikzset\'s function once:\n' + code);
    T.ok(!code.includes('bboldx'), 'no symbol-font statement for a font nothing declares:\n' + code);
    T.ok(code.indexOf('declare function={w') < code.indexOf('asin(w)'), 'the picture\'s function before the definition using it:\n' + code);
    T.tex('export-compiles-edited-definitions', code);
  });

  T.test('export compiles: a pie\'s style with values is a style of its own; a picture\'s braced option stays braced', () => {
    const pie = editedOf(String.raw`\documentclass{standalone}
\usepackage{pgf-pie}
\tikzset{lines/.style={draw=white, thick}}
\begin{document}
\begin{tikzpicture}
\pie[style={lines}]{60/A, 40/B}
\end{tikzpicture}
\end{document}`);
    const ed = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}[{x=(1mm,0)},{y=(0,1mm)}]
\draw (0,0) -- (10,10);
\path[draw] (0,0) circle (5);
\end{tikzpicture}
\end{document}`);
    T.ok(/\\pie\[style=tdpie\]/.test(pie), 'no keys with values in the pie\'s style:\n' + pie);
    T.tex('export-compiles-pie-style', pie);
    T.tex('export-compiles-braced-options', ed);
  });

  T.test('export compiles, edited: braces that are arguments stay arguments, and a definition used later stays where all see it', () => {
    const code = editedOf(String.raw`\documentclass{standalone}
\usepackage{tikz}
\usetikzlibrary{math, patterns}
\begin{document}
\begin{tikzpicture}
\tikzmath{ \a = 6; if \a <= 5 then { let \b = rectangle; } else { let \b = grid; }; { \draw (0,0) \b (1,1); }; }
\def\binary[h=#1] (#2) to (#3);{\draw (#2) -- ++(0,#1) node (#3) {#3};}
\binary[h=1] (0,0) to (A);
\draw (A) -- (2,2);
\begin{scope}[scale=2]
\definecolor{pallido}{RGB}{221,227,227}
\draw (0,0) -- (1,0);
\end{scope}
\fill[pattern=north west lines, pattern color=pallido] (3,0) rectangle (4,1);
\end{tikzpicture}
\end{document}`);
    T.ok(!/\\begin\{scope\}\s*\\draw \(0,0\) \\b/.test(code) && code.includes('{ \\draw (0,0) \\b (1,1); }'), 'the \\tikzmath group as written:\n' + code);
    T.ok(/\\binary\[h=1\] \(0,0\) to \(A\);/.test(code), 'the \\binary call whole:\n' + code);
    T.tex('export-compiles-edited-arguments', code);
  });
}
