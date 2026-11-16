// Regression for the complete Import -> Insert flow, not just parser output.
const intersectionSource = String.raw`\begin{tikzpicture}
\draw[gray, thick] (-1,2) -- (2,-4);
\draw[gray, thick] (-1,-1) -- (2,2);
\filldraw[black] (0,0) circle (2pt) node[anchor=west]{Intersection point};
\end{tikzpicture}`;

T.test('intersection import: anchored terminal node is fully editable and keeps its position', () => {
  const r = TD.importLatex(intersectionSource), sh = r.blocks[0].shapes;
  T.eq(sh.map(s => s.type), ['line', 'line', 'ellipse', 'text']);
  T.eq(r.kept.length, 0);
  T.ok(r.analysis.every(a => a.status === 'editable'), JSON.stringify(r.analysis));
  const text = sh[3], box = TD.bbox(text);
  T.eq(text.text, 'Intersection point');
  T.ok(Math.abs(box.x) < .01 && Math.abs(text.y) < .01, 'west anchor starts the label at the intersection');
  T.eq(sh[2].fill, '#000000');
  T.tex('intersection import source', TD.toTikz(sh, { standalone:true }));
});

for (const [kind, mode] of [['classic','document'], ['classic','diagram'], ['board','board'], ['page','page']]) {
  for (const how of ['code', 'shapes']) T.test(`intersection import: Insert renders in ${mode}, ${how}`, async () => {
    TD.app.newDoc('Intersection regression', null, null, null, null, kind);
    if (kind === 'classic') TD.app.setMode(mode);
    TD.app.openImport(intersectionSource);
    const before = document.querySelector('#impHow .on').dataset.how;
    try {
      document.querySelector(`#impHow [data-how="${how}"]`).click();
      document.querySelector('#impInsert').click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sh = TD.app.state.doc.shapes;
      T.eq(sh.map(s=>s.type), ['line', 'line', 'ellipse', 'text']);
      T.ok(document.querySelector('#importModal').hidden, 'dialog closes');
      const root = mode === 'document' ? document.querySelector('#docview .blk-diag.active .blk-body > svg') : document.querySelector('#content');
      T.ok(root, 'visible rendering root');
      T.ok(root.querySelector('ellipse[fill="#000000"]'), 'filled intersection dot painted');
      T.ok(root.querySelectorAll('path[stroke="#808080"]').length >= 2, 'both gray lines painted');
      T.ok(root.textContent.includes('Intersection point') || root.querySelector('image.svg-label'), 'label painted');
      const canvas = mode === 'document' ? root : document.querySelector('#canvas');
      const view = canvas.getBoundingClientRect(), dot = root.querySelector('ellipse').getBoundingClientRect();
      T.ok(view.width > 0 && dot.width > 0 && dot.right >= view.left && dot.left <= view.right && dot.bottom >= view.top && dot.top <= view.bottom, 'dot inside the visible figure/canvas');
    } finally {
      document.querySelector(`#impHow [data-how="${before}"]`).click();
      document.querySelector('#impClose').click();
    }
  });
}
