// xymatrix diagrams as xy draws them (src/domain/xy.ts, laid out by src/domain/cd.ts): every entry, an empty one
// too, is an \entrybox with 3pt margins; entries and labels keep their text through the tikz-cd form (line breaks,
// \\ and &, groups, a closing control space, a leading [); xy's places and position language read as xy reads them.
// The numbers are pdfLaTeX's (TeX Live 2026, xy 3.8): entries' reference points logged with \pdfsavepos, in pt.
{
  const XY = TD.xy, PT = 1 / TD.PT_PER_PX; // px per pt
  const xy = (src) => ({ type: 'xy', x: 0, y: 0, src, color: '#000000' });
  const L = (src) => XY.layout(xy(src));
  const near = (a, b, msg, eps = 0.1) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const xs = (Lo) => Lo.nodes.map((n) => n.x).sort((a, b) => a - b);
  const doc = (body) => `\\documentclass{article}\n\\usepackage[all]{xy}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n$${body}$\n\\end{document}`;

  T.test('xymatrix parity: an empty entry is a 6pt box (2 \\objectmargin), and arrows stop at its margin', () => {
    // x is 5.715pt wide: adjacent at @C=0em 11.715pt apart, each empty column between adds 6pt
    const gap = (src) => { const x = xs(L(src)); return (x[x.length - 1] - x[0]) / PT; };
    near(gap('\\xymatrix@C=0em{x & x}'), 11.715, 'adjacent');
    near(gap('\\xymatrix@C=0em{x & & x}'), 17.715, 'one empty column');
    near(gap('\\xymatrix@C=0em{x & & & x}'), 23.715, 'two');
    near(gap('\\xymatrix@C=10pt{x & & x}'), 37.715, 'one at @C=10pt');
    near(gap('\\xymatrix{x & & x}'), 65.715, 'one at 2pc');
    near(gap('\\xymatrix@C=0em{x & {} & x}'), 17.715, '{} is empty');
    near(gap('\\xymatrix@C=0em{x \\ar[rr] & & x}'), 17.715, 'an arrow passing');
    const rows = (src) => { const y = L(src).nodes.map((n) => n.y); return (Math.max(...y) - Math.min(...y)) / PT; };
    near(rows('\\xymatrix@R=0pt{x \\\\ x}'), 10.305, 'rows adjacent at @R=0pt');
    near(rows('\\xymatrix@R=0pt{x \\\\ \\\\ x}'), 16.305, 'an empty row adds 6pt');
    // \ar@{-}[r] between two empty entries at @C=10pt: 16pt between their centres, the line 10pt (its ink 10.36pt with
    // xy's round caps)
    const a = L('\\xymatrix@C=10pt{\\ar@{-}[r] & }').arrows[0].seg;
    near((a.p1.x - a.p0.x) / PT, 10, 'the line between the margins');
    T.eq(L('\\xymatrix@C=10pt{\\ar@{-}[r] & }').nodes.length, 0, 'nothing drawn for the empty entries');
  });

  T.test('xymatrix parity: entries and labels keep their text (line breaks, \\\\ and &, groups, control space, a leading [)', () => {
    const src = String.raw`\xymatrix{
  \mathfrak{m}_x
    \otimes N \ar[r]^{\left(\begin{smallmatrix} a & b \\ c & d \end{smallmatrix}\right)} \ar[d]_{{proj}_{\ast}} & [0,2\pi]\times X \ar[d]^{\ \text{(U)}\ } \\
  [\,\Sigma\,] \ar[r] & B
}`;
    const Lo = L(src);
    T.eq([Lo.R, Lo.C], [2, 2], 'two rows of two');
    const t = Lo.nodes.map((n) => n.t);
    T.ok(t.includes('$\\mathfrak{m}_x \\otimes N$'), 'the line break is a space: ' + t.join(' | '));
    T.ok(t.includes('${}[0,2\\pi]\\times X$') && t.includes('${}[\\,\\Sigma\\,]$'), 'an entry starting with [ (an empty Ord before it adds no space): ' + t.join(' | '));
    const labs = Lo.labels.map((l) => l.t.replace(/^\$|\$$/g, ''));
    T.ok(labs.some((x) => /smallmatrix/.test(x) && /\\\\/.test(x) && /&/.test(x)), 'the matrix label whole: ' + labs.join(' | '));
    T.ok(labs.includes('{proj}_{\\ast}'), 'two groups stay two: ' + labs.join(' | '));
    T.ok(labs.includes('\\ \\text{(U)}\\ '), 'the closing control space kept: ' + labs.join(' | '));
    // written back from the tikz-cd form as it was
    const back = XY.fromCd(XY.toCd(src));
    for (const k of ['[0,2\\pi]\\times X', '[\\,\\Sigma\\,]', '_{{proj}_{\\ast}}', '^{\\ \\text{(U)}\\ }']) T.ok(back.includes(k), k + ' in\n' + back);
    T.tex('xymatrix-parity-text', doc(back));
  });

  T.test('xymatrix parity: xy\'s places and position language read as xy reads them, the rest kept as written', () => {
    // |-(.35){t}: - is <>(.5), so the factor that follows sets where the label is along the arrow
    const Lo = L('\\xymatrix{A \\ar[rr]|-(.35){t} & & B}');
    const a = Lo.arrows[0].seg, lab = Lo.labels[0];
    near((lab.x - a.p0.x) / (a.p1.x - a.p0.x), 0.35, 'the label at .35 of the arrow', 0.01);
    // '[d][dd]: a segment through [d] that does not stop, along the arrow's line: the straight arrow
    const p = L("\\xymatrix{A \\ar'[d][dd]_{\\rho} \\\\ \\\\ B}");
    T.eq([p.arrows.length, p.labels.length, p.warnings.length], [1, 1, 0], 'one arrow and its label: ' + p.warnings.join(' | '));
    T.ok(!p.nodes.some((n) => /rho|'/.test(n.t)), 'nothing left in the entry');
    // after an \ar, xy's position language (named labels and targets, an object as a label, a break, -<…>{}) draws no text
    const src = String.raw`\xymatrix@C=3pc{
  A \ar@{}@<0.6pc>[r]^{}="1" \ar@{}@<-0.6pc>[r]_{}="2" \ar@/^/[r]^{f} \ar[d]|!{[r];[d]}\hole \ar@{=>}^{\beta}"1";"2" & B \ar[d]^*+<8pt>[o][F]{\ell} \\
  C \ar[r]-<3pt,0pt>{} & D
}`;
    const q = L(src);
    T.ok(q.nodes.every((n) => /^\$[ABCD]\$$/.test(n.t)), 'the entries are their letters: ' + q.nodes.map((n) => n.t).join(' | '));
    T.eq(q.labels.map((l) => l.t).sort(), ['$f$'], 'only the label drawn here');
    T.ok(q.warnings.length >= 3 && q.warnings.every((w) => /kept in the code/.test(w)), 'each one said: ' + q.warnings.join(' | '));
    const back = XY.fromCd(XY.toCd(src));
    for (const k of ['^{}="1"', '|!{[r];[d]}\\hole', '"1";"2"', '^*+<8pt>[o][F]{\\ell}', '-<3pt,0pt>{}']) T.ok(back.includes(k), k + ' in\n' + back);
    T.tex('xymatrix-parity-pos', doc(back));
  });

  T.test('xymatrix parity: a \\txt label is kept whole, its text not left in the entry', () => {
    const Lo = L('\\xymatrix{A \\ar[r]^\\txt<2pc>{foo} & B}');
    T.eq(Lo.nodes.map((n) => n.t), ['$A$', '$B$'], 'the entries');
    T.ok(Lo.warnings.some((w) => /\\txt<2pc>\{foo\}/.test(w)), Lo.warnings.join(' | '));
    const src = '\\xymatrix{A \\ar[r]^\\txt{foo} & B}';
    T.ok(XY.fromCd(XY.toCd(src)).includes('^\\txt{foo}'), XY.fromCd(XY.toCd(src)));
  });

  T.test('xymatrix parity: an arrow through an entry (\'[d][dd]) has its labels on the last segment', () => {
    // pdfLaTeX: the label's centre (\rho: 4.306pt high, 1.944pt deep) below the first x's axis. The last segment starts
    // where the line leaves the passed entry (|<{} sits 4.25pt below its axis), so the label is not at the arrow's middle
    for (const [src, y] of [["\\xymatrix{x \\ar'[d][dd]|{\\rho} \\\\ \\\\ x}", 47.876], ["\\xymatrix{x \\ar'[d][ddd]|{\\rho} \\\\ \\\\ \\\\ x}", 62.876]]) {
      const Lo = L(src);
      near((Lo.labels[0].y - Lo.nodes[0].y) / PT, y, src, 0.5);
      T.eq(Lo.warnings, [], src);
    }
    // the straight arrow's label is at its middle (31.799pt)
    near((L("\\xymatrix{x \\ar[dd]|{\\rho} \\\\ \\\\ x}").labels[0].y - L("\\xymatrix{x \\ar[dd]|{\\rho} \\\\ \\\\ x}").nodes[0].y) / PT, 31.799, 'straight', 1);
  });
}
