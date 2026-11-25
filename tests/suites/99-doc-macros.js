// A file's own macros (page.macros, src/core/doc-macros.ts): formulas drawn with them, undo, an import bringing its
// preamble's, and every export defining each command once (the file's definition, ahead of a picture's own copy).
{
  const cleanup = (id) => { TD.app.cmd.docAction?.('del', id); };
  const text = (id, x, s) => ({ id, type: 'text', x, y: 0, text: s, tw: 0, valign: 'top', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 });
  // what the maths engine says of a formula: 'ok', or its error
  const engine = (f) => { try { TD.math.synchronous(() => TD.math.render(f, { throwOnError: true })); return 'ok'; } catch (e) { return String(e.message || e); } };
  const MACROS = String.raw`\newcommand{\norm}[1]{\left\lVert#1\right\rVert}
\newcommand{\inner}[2][x]{\langle #1, #2\rangle}
\DeclareMathOperator{\Tr}{Tr}
\DeclarePairedDelimiter\abs{\lvert}{\rvert}
\def\eps{\varepsilon}
\let\vphi\varphi`;

  T.test('doc macros: formulas are drawn with the file\'s macros, and undo takes them back', () => {
    const id = TD.app.newDoc('macros draw', [text('a', 0, '$\\norm{v} + \\Tr A + \\abs{x} + \\eps + \\vphi + \\inner{y}$')], null, null);
    TD.app.setMode('diagram');
    const f = '\\norm{v} + \\Tr A + \\abs{x} + \\eps + \\vphi + \\inner{y}';
    T.ok(/Undefined control sequence/.test(engine(f)), 'undefined before: ' + engine(f));
    TD.app.setMacros(MACROS);
    T.eq(engine(f), 'ok');
    TD.app.cmd.undo(); TD.app.render();
    T.eq(TD.state.doc.page.macros, undefined, 'undo takes the macros away');
    T.ok(/Undefined control sequence/.test(engine(f)), 'and the formula is undefined again');
    TD.app.cmd.redo(); TD.app.render();
    T.eq(engine(f), 'ok', 'redo brings them back');
    cleanup(id);
  });

  T.test('doc macros: an xparse command draws as used without its optional arguments (unstarred, no value)', () => {
    const id = TD.app.newDoc('macros xparse', [], null, null);
    TD.app.setMode('diagram');
    TD.app.setMacros(String.raw`\DeclareDocumentCommand\ket{ s m }
{ \IfBooleanTF{#1}
	{\vphantom{#2}\left\lvert\smash{#2}\right\rangle} {\left\lvert{#2}\right\rangle} }
\NewDocumentCommand{\f}{o m}{\IfNoValueTF{#1}{f(#2)}{f_{#1}(#2)}}
\NewDocumentCommand{\g}{O{k} m}{\IfValueT{#1}{g_{#1}}(#2)}`);
    T.eq(engine('\\ket{\\psi} + \\f{x} + \\g{y}'), 'ok');
    T.eq(TD.math.synchronous(() => TD.math.render('\\f{x}')).includes('katex-error'), false);
    cleanup(id);
  });

  T.test('doc macros: the export writes the file\'s macros with their packages, and they compile', () => {
    const id = TD.app.newDoc('macros export', [text('a', 0, '$\\norm{v} = \\Tr A$'), text('b', 0, '$\\abs{x} \\le \\eps\\,\\vphi$')], null, null);
    TD.app.setMode('diagram');
    TD.app.setMacros(MACROS);
    const code = TD.toTikz(TD.state.doc.shapes, { standalone: true });
    for (const def of ['\\newcommand{\\norm}', '\\DeclareMathOperator{\\Tr}{Tr}', '\\DeclarePairedDelimiter\\abs', '\\def\\eps{\\varepsilon}', '\\let\\vphi\\varphi'])
      T.ok(code.includes(def), def + ' in the preamble:\n' + code);
    T.ok(/\\usepackage\{mathtools\}/.test(code) && /\\usepackage\{amsmath\}/.test(code), 'mathtools and amsmath for their definitions:\n' + code);
    T.ok(code.indexOf('\\newcommand{\\norm}') < code.indexOf('\\begin{document}'), 'in the preamble');
    T.tex('doc-macros-export', code);
    cleanup(id);
  });

  T.test('doc macros: an import brings its preamble\'s macros; the picture keeps its copy and the export defines each once', () => {
    const src = String.raw`\documentclass{article}
\usepackage{tikz}
\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\lVert#1\rVert}
\makeatletter\newcommand{\at}{\@ifnextchar}\makeatother
\begin{document}
\begin{tikzpicture}\node at (0,0) {$\norm{x} \in \R$};\end{tikzpicture}
\end{document}`;
    const res = TD.importLatex(src);
    T.eq(res.macros, '\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norm}[1]{\\lVert#1\\rVert}\n\\makeatletter\n\\newcommand{\\at}{\\@ifnextchar}\n\\makeatother',
      'the definitions, the one with @ between \\makeatletter and \\makeatother');
    const id = TD.app.newDoc('macros import', [], null, null);
    TD.app.setMode('diagram');
    // the file already defines \norm its own way: it keeps it
    TD.app.setMacros('\\newcommand{\\norm}[1]{\\|#1\\|}');
    TD.app.begin(); TD.app.takeMacros(res); TD.app.commit();
    T.eq(TD.state.doc.page.macros, '\\newcommand{\\norm}[1]{\\|#1\\|}\n\\newcommand{\\R}{\\mathbb{R}}\n\\makeatletter\n\\newcommand{\\at}{\\@ifnextchar}\n\\makeatother');
    const shapes = res.blocks.flatMap((b) => b.shapes || []);
    const code = TD.toTikz(shapes, { standalone: true });
    T.eq((code.match(/\\newcommand\{\\norm\}/g) || []).length, 1, '\\norm once:\n' + code);
    T.ok(code.includes('\\newcommand{\\norm}[1]{\\|#1\\|}'), 'the file\'s \\norm:\n' + code);
    T.eq((code.match(/\\newcommand\{\\R\}/g) || []).length, 1, '\\R once:\n' + code);
    T.tex('doc-macros-import', code);
    cleanup(id);
  });

  T.test('doc macros: a definition inside another command (a TikZ key\'s code) stays there', () => {
    const src = String.raw`\documentclass{article}
\usepackage{tikz,amssymb}
\newcommand{\R}{\mathbb{R}}
\tikzset{quiver/.code={\def\pv##1{\pgfkeysvalueof{/tikz/q/##1}}}}
\AtBeginDocument{\def\late{x}}
\begin{document}
\begin{tikzpicture}\node at (0,0) {$\R$};\end{tikzpicture}
\end{document}`;
    const res = TD.importLatex(src);
    T.eq(res.macros, '\\newcommand{\\R}{\\mathbb{R}}', 'the top-level definition alone');
    const code = TD.toTikz(res.blocks.flatMap((b) => b.shapes || []), { standalone: true });
    T.ok(!/^\\def\\pv/m.test(code) && code.includes('\\def\\pv##1'), 'the key\'s \\def where it was:\n' + code);
    T.tex('doc-macros-nested', code);
  });

  T.test('doc macros: a preamble definition read after \\makeatletter is written with it', () => {
    const src = String.raw`\documentclass{article}
\usepackage{tikz}
\makeatletter
\renewcommand{\small}{\@setfontsize\small\@ixpt\@xpt}
\tikzset{box/.style={draw, font=\small}}
\begin{document}
\begin{tikzpicture}\node[box] at (0,0) {small};\draw (0,0) -- (1,1);\end{tikzpicture}
\end{document}`;
    const code = TD.toTikz(TD.importLatex(src).blocks.flatMap((b) => b.shapes || []), { standalone: true });
    T.ok(/\\makeatletter\s*\\renewcommand\{\\small\}\{\\@setfontsize[^\n]*\s*\\makeatother/.test(code), 'between \\makeatletter and \\makeatother:\n' + code);
    T.tex('doc-macros-makeatletter', code);
  });

  T.test('doc macros: the Document\'s LaTeX defines them in its preamble', () => {
    const id = TD.app.newDoc('macros document', null, null, [{ type: 'text', text: 'A norm $\\norm{v}$ and $\\Tr A$.' }]);
    TD.app.setMode('document');
    TD.app.setMacros('\\newcommand{\\norm}[1]{\\lVert#1\\rVert}\n\\DeclareMathOperator{\\Tr}{Tr}');
    const tex = TD.docToLatex(TD.state.doc);
    const pre = tex.slice(0, tex.indexOf('\\begin{document}'));
    T.ok(pre.includes('\\newcommand{\\norm}[1]{\\lVert#1\\rVert}') && pre.includes('\\DeclareMathOperator{\\Tr}{Tr}'), 'both in the preamble:\n' + pre);
    T.tex('doc-macros-document', tex);
    cleanup(id);
  });

  T.test('doc macros: definitions with @ or in expl3 syntax come with their \\makeatletter or \\ExplSyntaxOn, and export', () => {
    const pre = String.raw`\documentclass{article}
\usepackage{amsmath}
\makeatletter
\DeclareRobustCommand{\ggeq}{\mathrel{\mathpalette\gg@eq\gg}}
\newcommand{\gg@eq}[2]{\mathrel{\ooalign{$\m@th#1#2$\cr\hidewidth$\m@th#1-$\hidewidth}}}
\makeatother
\ExplSyntaxOn
\NewDocumentCommand{\twice}{m}{ \prg_replicate:nn { 2 } { #1 } }
\ExplSyntaxOff
\begin{document}\end{document}`;
    const res = TD.importLatex(pre);
    T.ok(/\\makeatletter\n\\newcommand\{\\gg@eq\}[^\n]*\n\\makeatother/.test(res.macros) && /\\ExplSyntaxOn\n\\NewDocumentCommand\{\\twice\}[^\n]*\n\\ExplSyntaxOff/.test(res.macros),
      'each with its wrapper:\n' + res.macros);
    T.ok(/\\makeatletter\n\\DeclareRobustCommand\{\\ggeq\}/.test(res.macros), '\\ggeq uses \\gg@eq, so it is wrapped too:\n' + res.macros);
    const id = TD.app.newDoc('macros at', [text('a', 0, '$a \\ggeq b$ \\twice{x}')], null, null);
    TD.app.setMode('diagram');
    TD.app.setMacros(res.macros);
    const code = TD.toTikz(TD.state.doc.shapes, { standalone: true });
    T.tex('doc-macros-at-expl', code);
    cleanup(id);
  });

  T.test('doc macros: a preamble\'s maths alphabets and symbols stay; a symbol font no command uses is left out', () => {
    const pre = String.raw`\documentclass{article}
\DeclareMathAlphabet\mathbfcal{OMS}{cmsy}{b}{n}
\DeclareFontFamily{OT1}{pzc}{}
\DeclareFontShape{OT1}{pzc}{m}{it}{<-> s * [1.13] pzcmi7t}{}
\DeclareMathAlphabet{\mathpzc}{OT1}{pzc}{m}{it}
\DeclareFontFamily{U}{mathx}{\hyphenchar\font45}
\DeclareFontShape{U}{mathx}{m}{n}{<-> mathx10}{}
\DeclareSymbolFont{mathx}{U}{mathx}{m}{n}
`;
    const mac = String(TD.importLatex(pre + '\\begin{document}\\end{document}').macros || '');
    T.ok(mac.includes('\\mathbfcal') && mac.includes('\\mathpzc') && mac.includes('{OT1}{pzc}{m}{it}'), 'the alphabets and their family:\n' + mac);
    T.ok(!/mathx/.test(mac), 'no symbol font no command uses:\n' + mac);
  });
}
