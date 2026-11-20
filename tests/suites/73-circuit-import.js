// Circuit code as exporters and hand edits write it: options after `at`, mirrored and scaled transistors, braced
// part values, plain `to`, polar steps, text nodes, \tikzstyle settings and \draw options all read as parts
T.test('circuit import: an exported H-bridge reads whole, with flipped transistors wired to the right pins', () => {
  const src = [
    '\\node[nmos, rotate=180, bodydiode, arrowmos, xscale=1.02, yscale=-1.02] (Tr2) at (15,-6.25) {\\ctikzflipy{\\rotatebox{180}{$Q_{4}$}}};',
    '\\draw (Tr2.D) -- (15,-5.25);',
    '\\tikzstyle{every node}=[font=\\fontsize{14.0pt}{18.2pt}\\selectfont]',
    '      \\node[nmos, bodydiode, arrowmos, rotate=0, xscale=1.02, yscale=1.02] (Tr0) at (11.25,-6.25) {\\rotatebox{0}{$Q_{3}$}};',
    '\\draw (Tr0.D) -- (11.25,-5.25);',
    '\\draw (11.25,-5.25) to[Telmech={M}] (15,-5.25);',
    '\\node at (15,-5.25) [circ] {};',
    '\\draw (13.125,-7.25) to (13.125,-7.375) node[ground, rotate=0]{};',
    '\\draw (13.125,-3.25) to (13.125,-3.125) node[vcc, rotate=-360]{} ++(-270:0.42) node[above] {$V_{CC}$};',
    '\\node at (9.5,-4.25) {$\\overline{FWD}$};',
  ].join('\n');
  const { items, raw } = TD.cz.parse(src);
  T.eq(raw, '\\tikzstyle{every node}=[font=\\fontsize{14.0pt}{18.2pt}\\selectfont]', 'only the setting is kept as code');
  const by = (name) => items.find((it) => it.name === name);
  const q2 = by('Tr2');
  T.ok(q2 && q2.flip && q2.rot === 0, 'rotate=180 with yscale=-1 is a mirror');
  T.eq(JSON.stringify(q2.sc), '[1.02,1.02]', 'the scale is kept');
  T.ok(TD.cz.pinsOf(q2).D[1] > -6.25, 'the mirrored transistor’s drain is on top');
  T.ok(items.some((it) => it.part === 'emech:motor'), 'Telmech={M} is the motor');
  T.eq(items.filter((it) => it.part === 'text').map((it) => it.text).join(' '), '$V_{CC}$ $\\overline{FWD}$', 'text nodes');
  const vcc = items.find((it) => it.text === '$V_{CC}$');
  T.eq(vcc.p.join(','), '13.125,-2.705', 'a polar step moves the pen');
  T.ok(items.some((it) => it.part === 'ground:gnd') && items.filter((it) => it.part === 'short').length >= 4, 'plain to is a wire');
  // written back: the same circuit, read the same way again
  const code = TD.cz.code(items, raw);
  T.ok(/^\\tikzstyle/.test(code), 'settings first');
  T.ok(code.includes('\\node[nmos, xscale=-1.02, yscale=1.02, bodydiode, arrowmos] (Tr2) at (15,-6.25)'), 'mirror and scale written');
  T.ok(code.includes('\\node[above] at (13.125,-2.705) {$V_{CC}$};') && code.includes('\\node at (9.5,-4.25) {$\\overline{FWD}$};'), 'text nodes written');
  const again = TD.cz.parse(code);
  T.eq(again.items.length, items.length, 'reads back to as many items');
  T.eq(TD.cz.code(again.items, again.raw), code, 'and writes the same code');
  T.tex('circuit-import-hbridge', `\\documentclass{standalone}\n\\usepackage{circuitikz}\n\\begin{document}\n\\begin{circuitikz}\n${code}\n\\end{circuitikz}\n\\end{document}\n`);
});

T.test('circuit import: draw options, cycle, units, name= and option order', () => {
  const one = (s) => { const r = TD.cz.parse(s); T.eq(r.raw, '', s); return r.items; };
  T.eq(one('\\draw (0,0) to[R] (2,0) -- (2,-2) to[C] (0,-2) -- cycle;').at(-1).b.join(','), '0,0', 'cycle closes the run');
  T.eq(one('\\draw[thick, red] (0,0) to[R] (2,0);')[0].opts, 'thick, red', '\\draw options go on the part');
  T.eq(one('\\node[circ] at (1.5mm, 3pt) {};')[0].p[0], 0.15, 'units');
  T.eq(one('\\draw (0,0) to[R, name=R1] (2,0);')[0].name, 'R1', 'name= names the part');
  const npn = one('\\node[npn, xscale=-1, rotate=90] at (0,0) {};')[0];
  T.ok(npn.flip && npn.rot === 270, 'a turn after a mirror turns the other way');
  T.eq(TD.cz.parse('\\node[draw] at (0,0) {box};').items.length, 0, 'a boxed node is not plain text');
  T.eq(TD.cz.parse('\\node (A) at (1,2) {};').items.length, 0, 'an empty node names a point, it is not text');
});

T.test('circuit editor: Text is in the palette, places with its text and is clicked on its text', async () => {
  let result;
  TD.czEditor.open({ items: [], raw: '' }, (r) => { result = r; });
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  try {
    const item = q('[data-part="text"]');
    T.ok(item && item.querySelector('svg path'), 'Text has a palette item with a drawing');
    pointer(item, 'pointerdown', 0, 0); pointer(item, 'pointerup', 0, 0);
    const b = svg.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    pointer(svg, 'pointerdown', x, y); pointer(svg, 'pointerup', x, y);
    const code = q('.cz-code textarea').value;
    T.ok(/^\\node at \([^)]*\) \{Text\};$/m.test(code), 'placed as \\node at (…) {Text}: ' + code);
    const hit = q('[data-id] .cz-hit').getBoundingClientRect();
    T.ok(hit.width > 15 && hit.height > 8, 'its click area covers the text');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
  T.eq(result.items.filter((it) => it.part === 'text').length, 1, 'Done hands the Text back');
});
