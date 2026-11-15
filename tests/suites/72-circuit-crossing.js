T.test('circuit crossing: wires terminate at all four crossing terminals in SVG and LaTeX', () => {
  for (const type of ['jump', 'plain']) for (const rot of [0, 90]) {
    const items = [{ id: 'x', part: `wires:${type}-crossing`, p: [0, 0], name: 'X', rot },
      { id: 'h', part: 'short', a: [-2, 0], b: [2, 0] }, { id: 'v', part: 'short', a: [0, -2], b: [0, 2] }];
    const code = TD.cz.code(items, '');
    T.eq((code.match(/\\draw/g) || []).length, 4, 'both wires cut into two outside symbol');
    for (const pin of ['left', 'right', 'north', 'south']) T.ok(code.includes(`X.${pin}`), `${pin} connected`);
    const svg = TD.cz.itemsSvg(items, (x, y) => [x * 100, -y * 100], 100);
    T.ok(!svg.includes('M-200,0L200,0'), 'horizontal stroke does not run through jump');
    T.ok(!svg.includes('M0,200L0,-200'), 'vertical stroke does not run through jump');
    T.tex(`circuit-${type}-${rot}`, `\\documentclass{standalone}\n\\usepackage{circuitikz}\n\\begin{document}\n\\begin{circuitikz}\n${code}\n\\end{circuitikz}\n\\end{document}`);
    const parsed = TD.cz.parse(code);
    T.ok(parsed.items.some(it => it.part === `wires:${type}-crossing`), 'crossing survives code roundtrip');
    T.ok(!/NaN|undefined/.test(TD.cz.itemsSvg(parsed.items, (x, y) => [x * 100, -y * 100], 100)), 'roundtrip geometry valid');
  }
});

T.test('circuit crossing: placing a jump snaps to the intersection rather than a nearby grid point', async () => {
  TD.czEditor.open({ items: [{ id: 'snap-h', part: 'short', a: [-2, .1], b: [2, .1] }, { id: 'snap-v', part: 'short', a: [.1, -2], b: [.1, 2] }], raw: '' }, () => {});
  await new Promise(r => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = s => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  try {
    const search = q('.cz-search input'); search.value = 'jump crossing'; search.dispatchEvent(new Event('input', { bubbles: true }));
    q('[data-part="wires:jump-crossing"]').click();
    const h = q('[data-id="snap-h"] .cz-hitline').getBoundingClientRect(), v = q('[data-id="snap-v"] .cz-hitline').getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: v.x + v.width / 2 + 2, clientY: h.y + h.height / 2 + 2 }));
    const node = TD.cz.parse(q('.cz-code textarea').value).items.find(it => it.part === 'wires:jump-crossing');
    T.ok(node && TD.cz.same(node.p, [.1, .1]), 'snapped to actual nongrid intersection');
    T.eq(Object.keys(TD.cz.pinsOf(node)).length, 4, 'four available wire terminals');
  } finally { svg.setPointerCapture = capture; q('[data-cz="done"]').click(); }
});
