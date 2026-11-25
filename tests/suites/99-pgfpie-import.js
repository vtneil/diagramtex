// pgf-pie's \pie: a Pie chart with its pgf-pie options (src/domain/pgfpie.ts), drawn as tikzlibrarypie.code.tex draws
// it and written back as \pie. The numbers below are pdfLaTeX's (TeX Live, pgf-pie 1.x): node centres and the picture's
// bounding box, in pt about the pie's centre.
{
  const doc = (body, opts = '') => `\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{pgf-pie}\n\\begin{document}\n\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const texts = (L) => L.items.filter((x) => x.k === 'text');
  const textAt = (L, t) => texts(L).find((x) => x.text === t);
  // (a text's measured width has 2px of slack round the glyphs: TeX's width is without it)

  T.test('import pgf-pie: a \\pie is a Pie chart with pgf-pie\'s options, its slices, numbers and labels where pdflatex puts them', () => {
    const sh = shapesOf(doc('\\pie[radius=2]{30/A, 70/B}'));
    T.eq(kept(sh), [], 'nothing kept');
    const p = sh.find((s) => s.type === 'pie');
    T.ok(p && p.pgf, 'a pgf-pie pie: ' + sh.map((s) => s.type));
    near(p.r, 2 * TD.PX_PER_CM, 'radius 2');
    T.eq(p.data, 'A 30\nB 70', 'the slices as the pie\'s data');
    const L = TD.pgfPie.layout(p);
    // pgf's arc pieces' handles and half the thick line: the bounding box's left, bottom and right
    near(L.bb[0], -64.231, 'left'); near(L.bb[1], -64.231, 'bottom'); near(L.bb[2], 57.305, 'right');
    const n = textAt(L, '30\\%');
    near(n.x, 17.82, 'the number inside (x)'); near(n.y, 24.52, 'the number inside (y)');
    // the label hangs by its south west corner off the empty node on the rim: its text starts at 37.51pt
    const a = textAt(L, 'A'), w = (TD.textBox('A', { size: 'normalsize' }).w - 2) * TD.PT_PER_PX;
    near(a.x - w / 2, 37.51, 'label A\'s left', 0.1);
    T.ok(a.y > 46.74, 'label A above the rim point');
  });

  T.test('import pgf-pie: a legend right of the pie, rotate and explode in turn', () => {
    const sh = shapesOf(doc('\\pie[text=legend, rotate=30, explode={0.2,0}]{25/A, 35/B, 40/C}'));
    T.eq(kept(sh), [], 'nothing kept');
    const p = sh.find((s) => s.type === 'pie'), L = TD.pgfPie.layout(p);
    near(textAt(L, '25\\%').x, 14.327, 'the exploded slice\'s number (x)'); near(textAt(L, '25\\%').y, 53.468, '(y)');
    const boxes = L.items.filter((x) => x.k === 'box');
    T.eq(boxes.length, 3, 'a box per slice');
    boxes.forEach((b, k) => { near(b.x, 116.478, 'box ' + k + ' x', 0.1); near(b.y, [22.355, 8.129, -6.098][k], 'box ' + k + ' y', 0.1); });
    const a = textAt(L, 'A'), w = (TD.textBox('A', { size: 'normalsize' }).w - 2) * TD.PT_PER_PX;
    near(a.x - w / 2, 127.494 - 3.75, 'legend label A\'s left', 0.1);
    near(a.y, 22.355, 'beside its box');
    T.ok(!textAt(L, 'B') || textAt(L, 'B').x > 120, 'no labels on the rim');
  });

  T.test('import pgf-pie: polar area, change direction and sum=auto', () => {
    const sh = shapesOf(doc('\\pie[polar, change direction, sum=auto]{10/A, 20/B, 40/C}'));
    T.eq(kept(sh), [], 'nothing kept');
    const L = TD.pgfPie.layout(sh.find((s) => s.type === 'pie'));
    // no % (the sum is not 100); each slice a third of the turn, its radius √value
    [['10', 17.071, 29.568], ['20', -48.284, 0.002], ['40', 34.138, -59.139]].forEach(([t, x, y]) => { const n = textAt(L, t); T.ok(n, t); near(n.x, x, t + ' x'); near(n.y, y, t + ' y'); });
    near(L.bb[2], 85.756, 'right');
  });

  T.test('import pgf-pie: written back as \\pie with its options, and read again the same', () => {
    const sh = shapesOf(doc('\\pie[text=pin, rotate=40, explode=0.2, color={red!60, blue!30}, sum=auto, after number=\\,u, hide number]{65/{Amps, and more}, 35/Cooling}', 'scale=0.5'));
    T.eq(kept(sh), [], 'nothing kept');
    const p = sh.find((s) => s.type === 'pie');
    near(p.r, 1.5 * TD.PX_PER_CM, 'the picture\'s scale on the radius');
    near(p.pgf.explode[0], 0.1, 'and on the explode');
    // (as edited: written from the pie, not the source as imported)
    const tex = TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/\\usepackage\{pgf-pie\}/.test(tex), 'pgf-pie loaded:\n' + tex);
    const m = /\\pie\[([^\n]*)\]\{([^\n]*)\}/.exec(tex);
    T.ok(m, 'a \\pie:\n' + tex);
    for (const k of ['radius=1.5', 'color={red!60, blue!30}', 'explode=0.1', 'rotate=40', 'sum=auto', 'text=pin', 'hide number', 'after number={\\,u}']) T.ok(m[1].includes(k), k + ' in ' + m[1]);
    T.eq(m[2], '65/{Amps, and more}, 35/Cooling', 'the data');
    const again = shapesOf(tex).find((s) => s.type === 'pie');
    T.ok(again && again.data === p.data && JSON.stringify(again.pgf) === JSON.stringify(p.pgf), 'read again the same: ' + JSON.stringify(again && again.pgf));
    T.tex('pgfpie-export', tex);
  });

  T.test('import pgf-pie: what the pie can\'t draw stays code, with why', () => {
    const why = (body, opts) => kept(shapesOf(doc(body, opts))).join(' | ');
    T.ok(/square/.test(why('\\pie[square]{30/A, 70/B}')), 'square');
    T.ok(/legend placed beside/.test(why('\\draw (5,0) circle (1);\n\\pie[text=legend]{30/A, 70/B}')), 'a legend after other drawing');
    T.ok(/before number/.test(why('\\pie[before number=\\phantom]{30/A, 70/B}')), 'a command before the number');
    T.ok(/turn/.test(why('\\pie{30/A, 70/B}', 'rotate=30')), 'a turned picture');
    T.eq(why('\\pie[/tikz/every pin/.style={align=center}, text=pin]{30/A\\\\a, 70/B}', 'pin distance=9mm, font=\\scriptsize'), '', 'align, the picture\'s pin distance and font are held');
  });

  T.test('import pgf-pie: the panel edits pgf-pie\'s options; the number after the values follows the sum', () => {
    const p = shapesOf(doc('\\pie{30/A, 70/B}')).find((s) => s.type === 'pie');
    const M = TD.panels.pie.model(p);
    T.ok(M.sections.length === 2, 'data and pgf-pie sections');
    TD.panels.pie.apply(p, { dataset: { p: 'pgf.sum' }, type: 'text', value: 'auto' });
    T.eq([p.pgf.sum, p.pgf.after], ['auto', ''], 'auto: no %');
    TD.panels.pie.apply(p, { dataset: { p: 'pgf.text' }, type: 'select-one', value: 'legend' });
    TD.panels.pie.apply(p, { dataset: { p: 'pgf.explode' }, type: 'text', value: '0.1, 0' });
    T.eq([p.pgf.text, p.pgf.explode], ['legend', [0.1, 0]], 'legend, explode');
    T.ok(TD.pgfPie.layout(p).items.some((x) => x.k === 'box'), 'the legend drawn');
  });
}
