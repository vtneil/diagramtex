// Karnaugh map: the simplified expression the map writes.

T.test('kmap: two barred variables side by side keep separate bars (B̄D̄, not NOT BD)', () => {
  const map = (cells) => TD.kmap.parse(`\\begin{karnaugh-map}[4][4][1][$D$][$C$][$B$][$A$]\\${cells}\\end{karnaugh-map}`);
  // the map's own groups (what Solve draws), then the expression they spell
  const solved = (M, mode) => { M.groups = TD.kmap.solve(M, mode); return TD.kmap.check(M, mode); };
  // the four corners: one group, both variables barred
  const sop = solved(map('minterms{0,2,8,10}'), 'sop');
  T.ok(/\\overline\{[A-D]\}\\,\\overline\{[A-D]\}/.test(sop.expr), `a thin space between the bars: ${sop.expr}`);
  T.ok(!/\}\\overline/.test(sop.expr), `no two bars touch: ${sop.expr}`);
  // product of sums: single-letter sums written side by side
  const pos = solved(map('maxterms{0,...,7,12,13,14,15}'), 'pos');
  T.ok(!/\}\\overline/.test(pos.expr), `no two bars touch in a product of sums: ${pos.expr}`);
  // a bar beside a plain letter needs no space
  T.ok(!/\\,(?!\\overline)/.test(solved(map('minterms{4,6,12,14}'), 'sop').expr), 'a plain letter is written straight on');
});
