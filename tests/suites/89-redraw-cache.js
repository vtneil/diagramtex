// A redraw with nothing changed draws no shape again: each shape's markup is kept against its JSON.
// The measuring pass used to count as "may hold placeholder sizes" even when nothing needed measuring,
// so nothing was kept and every frame drew every label (and rebuilt every maths picture) again.
T.test('redraw cache: an unchanged canvas draws no shape again, maths labels and blocks included', async () => {
  const text = (i) => ({ ...TD.TYPES.text.create({ x: 40 + i * 70, y: 40 }, {}), id: 'rc-t' + i, text: `$x_{${i}}^2$ and words` });
  TD.app.newDoc('Redraw cache', [text(0), text(1), { ...TD.TYPES.rect.create({ x: 40, y: 120 }, {}), id: 'rc-r', w: 40, h: 20 },
    { ...TD.TYPES.graph.create({ x: 40, y: 200 }), id: 'rc-g' }], null, null, null, 'classic');
  TD.app.setMode('diagram'); await TD.math.whenReady(); TD.app.render();
  const doc = TD.state.doc, live = (doc.blocks ? doc.blocks.flatMap((b) => b.shapes || []) : doc.shapes).find((s) => s.id === 'rc-t0');
  T.ok(live, 'the label is in the document');
  const counts = {};
  const wraps = Object.keys(TD.TYPES).map((k) => { const was = TD.TYPES[k].svg; TD.TYPES[k].svg = function (...a) { counts[k] = (counts[k] || 0) + 1; return was.apply(this, a); }; return [k, was]; });
  try {
    TD.app.render(); TD.app.render();
    T.eq(JSON.stringify(counts), '{}', 'no shape is drawn again');
    live.x += 10; TD.app.render();
    T.eq(JSON.stringify(counts), '{"text":1}', 'moving one label draws only that label');
  } finally { for (const [k, was] of wraps) TD.TYPES[k].svg = was; }
});
