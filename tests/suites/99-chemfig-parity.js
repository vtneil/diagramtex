// chemfig code as LaTeX draws it (src/domain/chemfig.ts): documents whose TikZ is only inside chemfig's arguments and
// text-only schemes reach the Chemistry block; the preamble's \setchemfig and \definesubmol come with it; atom style
// and chemfig style scale, compound style frames, snake, dashed, see-through and shortened bonds, \polymerdelim, a
// \charge in braces, an atom opening a branch. The numbers are pdfLaTeX's (TeX Live, chemfig 1.84): box widths and
// heights in pt, from \setbox0\hbox{…} of each drawing.
{
  const PT = 1 / TD.PT_PER_PX;
  const L = (src) => TD.chem.layout({ type: 'chemfig', x: 0, y: 0, src });
  const box = (src) => { const b = L(src).bb; return { w: b.w / PT, h: b.h / PT }; };
  // within 0.6pt: the drawing's letters are KaTeX's, a little off Computer Modern's own widths
  const near = (got, want, why, eps = 0.6) => T.ok(Math.abs(got - want) <= eps, `${why}: ${got.toFixed(2)}pt, LaTeX ${want}pt`);
  const doc = (pre, body) => `\\documentclass{article}\n\\usepackage{chemfig}\n${pre}\n\\begin{document}\n${body}\n\\end{document}`;
  const shapesOf = (src, opt) => TD.importLatex(src, opt).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));

  T.test('chemfig parity: chemfig code whose TikZ is in \\chemmove or a bond\'s options, and a scheme of text, are the Chemistry block', () => {
    const mv = '\\chemfig{@{a}A-B}\\chemmove{\\draw[->](a)..controls +(90:5mm) and +(90:5mm)..(a);}';
    T.eq(TD.pasteIn.kind(mv), 'block', 'a paste of it');
    T.eq(TD.pasteIn.kind('\\chemfig{A-[,,,,decoration={markings,mark=at position .5 with {\\fill circle (1pt);}}]B}'), 'block', 'TikZ in a bond\'s options');
    T.eq(TD.pasteIn.kind('\\chemfig{A-B}\n\\draw (0,0) -- (1,1);'), 'tex', 'a \\draw beside it is still a picture');
    T.eq(TD.pasteIn.kind('\\schemestart A\\arrow B\\schemestop'), 'block', 'a scheme of text compounds');
    for (const body of [mv, '\\schemestart A\\arrow B\\schemestop']) {
      const sh = shapesOf(doc('', body));
      T.eq(sh.map((s) => s.type), ['chemfig'], 'one Chemistry block from the document: ' + body);
    }
    near(box('\\schemestart A\\arrow B\\schemestop').w, 64.58, 'A → B wide');
  });

  T.test('chemfig parity: the preamble\'s \\setchemfig and \\definesubmol hold for the block, written at its head', () => {
    const pre = '\\setchemfig{atom sep=2em}\n\\definesubmol{\\me}{CH_3}';
    for (const [why, sh] of [['a document', shapesOf(doc(pre, '\\chemfig{!\\me-OH}'))], ['a paste with the preamble', shapesOf(TD.pasteIn.asPicture('\\chemfig{!\\me-OH}'), { definitions: doc(pre, '').replace(/\\begin\{document\}[\s\S]*/, '') })]]) {
      const q = sh.find((s) => s.type === 'chemfig');
      T.ok(q, why + ': ' + sh.map((s) => s.type));
      T.ok(q.src.startsWith('\\setchemfig{atom sep=2em}%\n\\definesubmol{\\me}{CH_3}%\n\\chemfig'), why + ': ' + q.src);
      const b = box(q.src);
      near(b.w, 44.6, why + ': CH3-OH at 2em, wide');
      near(b.h, 8.33, why + ': and tall');
    }
    // \tikzset styles only when the code names them; other preamble commands stay out
    const q = shapesOf(doc('\\tikzset{a/.style={red}}\\tikzset{hl/.style={draw}}\\newcommand\\x{1}', '\\schemestart A\\arrow(--[hl])B\\schemestop'))[0];
    T.eq(q.src.split('%\n').slice(0, -1), ['\\tikzset{hl/.style={draw}}'], 'only the style the code uses: ' + q.src);
    // a block written out and read back keeps its setup once, still the Chemistry block
    const tz = shapesOf(doc('\\tikzset{hl/.style={draw}}', '\\schemestart A\\arrow(--[hl])B\\schemestop'));
    const back = shapesOf(TD.toTikz(tz, { standalone: true }));
    T.eq(back.map((s) => s.type), ['chemfig'], 'read back: the Chemistry block');
    T.eq(back[0].src.split('\\tikzset{hl/').length, 2, 'with the \\tikzset once: ' + back[0].src);
    T.eq(TD.pasteIn.kind(tz[0].src), 'block', 'its code pasted is the block');
    // a body with a \draw beside the chemfig code, or with sections, isn't one Chemistry block
    T.ok(!shapesOf(doc('', '\\chemfig{A-B}\n\\draw (0,0) -- (1,1);')).every((s) => s.type === 'chemfig'), 'a \\draw beside it');
    T.eq(TD.importLatex(doc('', '\\chemfig{A-B}\n\\section{X} text')).blocks.map((b) => b.type), ['text'], 'sections: the document\'s text');
    near(box('\\setchemfig{atom sep=1em}\\setchemfig{atom sep={}}\\chemfig{A-B}').w, 37.29, 'an empty value is chemfig\'s default again');
    near(box('\\setchemfig{+ sep left=2em}\\schemestart\\chemfig{A}\\+\\chemfig{B}\\schemestop').w, 47.36, '+ sep left');
  });

  T.test('chemfig parity: atom style={scale=k} scales the atoms and atom sep, chemfig style={scale=k} the bond offset and the circle', () => {
    near(box('\\setchemfig{atom sep=2em,atom style={scale=0.5}}\\chemfig{C-H}').w, 13.68, 'C-H at half size');
    const r = box('\\setchemfig{atom sep=2em,atom style={scale=0.5}}\\chemfig{**6(------)}');
    near(r.w, 28.55, 'an aromatic ring: its circle keeps its radius, off the centre');
    near(r.h, 26.38, 'and tall');
    const c = box('\\setchemfig{atom sep=2em,atom style={scale=0.5},chemfig style={scale=0.5}}\\chemfig{**6(---C----)}');
    near(c.w, 19.33, 'with chemfig style too, the circle is back in the middle');
    near(c.h, 20.4, 'and tall');
    // C-H: the bond from C's border + the bond offset, 2pt (1pt under chemfig style scale=0.5)
    const off = (src) => { const M = L(src), b = M.bonds[0], C = M.verts[0].boxes[0]; return (b.p0[0] - (C.x + C.w)) / PT; };
    near(off('\\chemfig{C-H}'), 2, 'bond offset', 0.05);
    near(off('\\setchemfig{chemfig style={scale=0.5}}\\chemfig{C-H}'), 1, 'bond offset under chemfig style', 0.05);
    near(off('\\setchemfig{atom style={scale=0.5}}\\chemfig{C-H}'), 2, 'not under atom style', 0.05);
    const red = L('\\setchemfig{atom style=red}\\chemfig{C-H}').texts;
    T.ok(red.length === 2 && red.every((t) => t.color), 'atom style=red: the atoms\' colour');
  });

  T.test('chemfig parity: compound style frames each compound with its inner sep', () => {
    const src = '\\setchemfig{compound style={draw,inner sep=8pt,rounded corners=1mm}}\\schemestart A\\arrow B\\schemestop';
    const b = box(src);
    near(b.w, 96.98, 'A → B with 8pt round each');
    near(b.h, 23.23, 'and tall');
    T.eq(L(src).paths.filter((p) => /a[\d.]+,[\d.]+ 0 0,1/.test(p.d)).length, 2, 'a rounded frame round each');
  });

  T.test('chemfig parity: snake, dash pattern, opacity and shorten on bonds', () => {
    const sn = L('\\chemfig{A-[,3,,,decorate,decoration=snake]B}');
    near(sn.bb.w / PT, 97.29, 'a snake bond 3 atom seps long');
    T.ok(/C/.test(sn.paths[0].d) && !sn.warnings.length, 'drawn as pgf\'s snake: ' + sn.paths[0].d.slice(0, 60) + ' ' + sn.warnings);
    T.eq(L('\\chemfig{A-[,,,,dash pattern=on 2pt off 1pt]B}').paths[0].dash.map((x) => +(x / PT).toFixed(2)), [2, 1], 'the dash pattern');
    // (on 2pt alone: on 2pt, off 2pt, as pgf writes [2pt] for PDF)
    T.eq(L('\\chemfig{A-[,,,,dash pattern=on 2pt]B}').paths[0].dash.map((x) => +(x / PT).toFixed(2)), [2], 'an odd dash pattern repeats');
    const op = L('\\chemfig{A-[,,,,opacity=0]B}');
    T.ok(op.paths[0].op === 0 && Math.abs(op.bb.w / PT - 37.29) < 0.6, 'opacity=0: not seen, still in the box');
    const sh = L('\\chemfig{A-[,,,,shorten <=3pt,shorten >=5pt]B}'), pl = L('\\chemfig{A-B}');
    near((sh.bonds[0].X0 - pl.bonds[0].X0) / PT, 0, 'the bond\'s ends as chemfig places them', 0.05);
    const ends = (d) => d.match(/-?[\d.]+/g).map(Number);
    const [a0, , a1] = ends(sh.paths[0].d), [b0, , b1] = ends(pl.paths[0].d);
    near((a0 - b0) / PT, 3, 'shorten <', 0.05);
    near((b1 - a1) / PT, 5, 'shorten >', 0.05);
    near(sh.bb.w / PT, 37.29, 'A-B wide');
  });

  T.test('chemfig parity: \\polymerdelim draws its delimiters at the named points, over the drawing', () => {
    // (chemfig.tex: a node at each point, shifted by open xshift, close xshift negated, and (height − depth)/2 up;
    // the defaults run in order, so depth= takes height=10pt and close xshift= takes −0pt)
    const mol = '\\chemfig{-[@{l,0.5}]M-[@{r,0.5}]}', plain = L(mol);
    const delims = (o) => { const M = L(`${mol}\\polymerdelim[${o}]{l}{r}`); T.ok(!M.warnings.length, o + ': ' + M.warnings); return M.paths.slice(plain.paths.length).map((p) => p.d.match(/-?[\d.]+/g).map(Number)); };
    const xs = (d) => d.filter((_, k) => k % 2 === 0), ys = (d) => d.filter((_, k) => k % 2 === 1);
    const mid = (v) => (Math.min(...v) + Math.max(...v)) / 2;
    const [l, r] = delims('delimiters={[]}');
    T.ok(l && r, 'a [ and a ]');
    const at = plain.bonds.map((b) => [(b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2]);
    T.ok(Math.abs(mid(xs(l)) - at[0][0]) < 3 * PT && Math.abs(mid(xs(r)) - at[1][0]) < 3 * PT, 'the [ on l, the ] on r');
    near(L(`${mol}\\polymerdelim{l}{r}`).bb.w / PT, box(mol).w, 'an overlay: the box is the molecule\'s', 0.05);
    const [, r3] = delims('delimiters={[]},close xshift=3pt');
    near((mid(xs(r3)) - mid(xs(r))) / PT, -3, 'close xshift=3pt moves the ] left', 0.05);
    const [l2, r2] = delims('delimiters={[]},open xshift=5pt');
    near((mid(xs(l2)) - mid(xs(l))) / PT, 5, 'open xshift=5pt moves the [', 0.05);
    near((mid(xs(r2)) - mid(xs(r))) / PT, 0, 'and not the ]', 0.05);
    const [h2] = delims('delimiters={[]},height=20pt');
    near((mid(ys(l)) - mid(ys(h2))) / PT, 5, 'height=20pt alone (depth stays 10pt): 5pt up', 0.6);
    T.eq(L(`${mol}\\polymerdelim[indice=k]{l}{r}`).texts.filter((t) => /scriptstyle k/.test(t.t)).length, 1, 'the indice beside the closing one');
    // the closing node's box holds its subscript: ) with n is 10.5pt deep and 7.86pt wide (14.5pt high), so the ) sits
    // (10.5 − 10)/2 = 0.25pt higher and 0.25pt further left than with no indice
    const rn = delims('delimiters={()}').at(-1), r0 = delims('delimiters={()},indice=').at(-1);
    near((mid(ys(r0)) - mid(ys(rn))) / PT, 0.25, 'indice n: the ) 0.25pt up', 0.05);
    near((mid(xs(r0)) - mid(xs(rn))) / PT, 0.25, 'and 0.25pt left', 0.05);
  });

  T.test('chemfig parity: a \\charge in braces, a control space, an atom opening a branch, a short bond, \\textcolor{red}7', () => {
    near(box('\\chemfig{{\\charge{90=\\.}O}H}').w, 15.28, '{\\charge{90=\\.}O}H wide');
    T.ok(L('\\chemfig{{\\charge{90=\\.}O}H}').dots.length === 1, 'the dot drawn');
    near(box('\\schemestart \\chemfig{A} \\\n\\chemfig{B}\\schemestop').w, 21.25, 'a space and \\<line end> between A and B');
    T.ok(L('\\chemfig{A}\\').bb.w > 0, 'a lone \\ at the end reads');
    const br = L('\\chemfig{([::+90]C-H)}');
    near(br.bb.w / PT, 7.5, '([::+90]C-H) wide');
    near(br.bb.h / PT, 36.83, 'and tall');
    T.eq(br.verts.filter((v) => v.label).map((v) => v.label), ['C', 'H'], 'C and H both drawn: ' + br.warnings);
    // (on the last node chemfig drew: B, which the first branch left, not A)
    const b2 = box('\\chemfig{A(-[2]B)(C-[6]D)}');
    near(b2.w, 7.64, 'A(-[2]B)(C-[6]D): C on B, D on A, wide');
    near(b2.h, 36.83, 'and tall');
    near(box('\\chemfig{A(-[2]B)-C(D-[6]E)}').h, 66.83, 'A(-[2]B)-C(D-[6]E): D on C, tall');
    near(box('\\chemfig{A(C-[6]D)}').h, 40.25, 'A(C-[6]D): C on A\'s base point, tall');
    const s = box('\\chemfig{-[,0.1]M}');
    near(s.w, 9.17, 'a bond shorter than its atom: drawn backwards, as TikZ runs it');
    near(s.h, 6.83, 'and tall');
    const ch = L('\\chemfig{\\charge{270=\\textcolor{red}7}{N}}');
    T.ok(ch.texts.some((t) => /\\textcolor\{red\}\{7\}/.test(t.t)), '\\textcolor{red}7 is \\textcolor{red}{7}');
  });

  T.test('chemfig parity: \\chemmove draws a filled, closed path with shifted points', () => {
    const M = L('\\schemestart P\\arrow Q\\schemestop\\chemmove{\\draw[red,fill=red,fill opacity=0.5] ([shift={(-5pt,1em)}]c1.north west) -- ([yshift=1em]c2.north) -- (c2.south) -- cycle;}');
    T.eq(M.moves.length, 1, 'the path read: ' + M.warnings);
    const mv = M.moves[0];
    T.ok(mv.segs.closed && mv.fill && mv.fop === 0.5, 'closed and filled half see-through');
    T.ok(!M.warnings.some((w) => /shift|cycle|fill/.test(w)), 'nothing left out: ' + M.warnings);
    const c1 = M.comps.find((c) => c.name === 'c1').box, p0 = mv.segs.pts[0];
    near((p0[0] - c1.x) / PT, -5, 'shift={(-5pt,1em)}: x', 0.05);
    near((c1.y - p0[1]) / PT, 10, 'and y', 0.05);
  });

  T.test('chemfig parity: a \\parbox compound, and a \\chemmove \\node placed from where the \\chemmove stands', () => {
    const b = box('\\schemestart\\parbox{1cm}{\\centering A}\\arrow B\\schemestop');
    near(b.w, 85.54, '\\parbox{1cm}{…} → B wide');
    near(b.h, 6.83, 'its middle on the maths axis: tall');
    // a line wider than the box, which TeX breaks: not set as one line, and said so
    T.ok(L('\\schemestart\\parbox{1cm}{\\centering Long words here}\\arrow B\\schemestop').warnings.some((w) => /wider than its box/.test(w)), 'a \\parbox line wider than its box warns');
    // one word wider than the box can't break: one line from the box's left edge (\centering's glue can't shrink)
    const w1 = L('\\schemestart\\parbox{.5cm}{\\centering{\\textbf{14THQ}}}\\schemestop');
    T.ok(!w1.warnings.length && w1.texts.length === 1, 'one overfull word: ' + w1.warnings);
    near(w1.texts[0].cx / PT, (w1.texts[0].b.w - 2) / 2 / PT, 'from the left edge', 0.05);
    near(w1.bb.w / PT, 14.23, 'the box still .5cm wide', 0.05);
    const q = L('\\schemestart\\parbox{1cm}{\\centering{\\textbf{Q}}}\\schemestop');
    T.ok(q.texts.length === 1 && !/parbox|centering/.test(q.texts[0].t), 'the line, not the command: ' + q.texts.map((t) => t.t));
    near(q.texts[0].cx / PT, 14.23, 'centred in the box', 0.3);
    const M = L('\\chemfig{A}\\chemmove{\\node at (2pt,6pt) {x};}'), a = M.verts[0].boxes[0];
    const t = M.texts.find((x) => x.t === 'x');
    T.ok(t, 'the node\'s text drawn: ' + M.warnings);
    near((t.cx - (a.x + a.w + M.verts[0].dx)) / PT, 2, '(2pt,6pt) from after A: x', 0.05);
    near(-t.cy / PT, 6, 'y', 0.05);
  });
}
