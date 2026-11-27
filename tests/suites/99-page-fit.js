// Page mode's Fit frames the pages the drawing is on (the first to the last holding an object), not always page 1;
// with nothing drawn, the page in view. Fit Width fits the width and keeps the place in view.
T.test('page mode: Fit frames the pages the drawing is on, not page 1', async () => {
  TD.app.newDoc('Page fit', null, null, null, null, 'page');
  TD.app.cmd.addPage(); TD.app.cmd.addPage();
  T.eq(TD.state.doc.sheet.pages, 3, 'three pages');
  const P = TD.pageSize(TD.state.doc.page), h = P.H * TD.PX_PER_CM, step = h + TD.PX_PER_CM /* 1 cm between pages */, z = () => TD.state.view.zoom;
  const r = document.querySelector('#stage').getBoundingClientRect();
  // the middle of the view, in canvas y
  const mid = () => TD.state.view.y + r.height / 2 / z();
  const s = T.make('rect'); Object.assign(s, { x: 100, y: 2 * step + h / 2 - 20, w: 80, h: 40 }); // on page 3
  TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit();
  TD.app.cmd.zoomFit();
  T.ok(Math.abs(mid() - (2 * step + h / 2)) < 2, `Fit centres page 3 (view middle at ${Math.round(mid())}, page 3's at ${Math.round(2 * step + h / 2)})`);
  T.ok(h * z() <= r.height, 'the whole page in view');
  // Fit Width keeps the place in view: the middle of the view stays where it was
  const before = mid();
  TD.app.cmd.zoomFitWidth();
  T.ok(Math.abs(mid() - before) < 1, `Fit Width keeps the middle of the view (${Math.round(before)} → ${Math.round(mid())})`);
  // the drawing over pages 2 and 3: both in view
  const t = T.make('rect'); Object.assign(t, { x: 100, y: step + 40, w: 80, h: 40 });
  TD.app.begin(); TD.state.doc.shapes.push(t); TD.app.commit();
  TD.app.cmd.zoomFit();
  T.ok(Math.abs(mid() - (step + (step + h) / 2)) < 2, `Fit centres pages 2 and 3 (view middle at ${Math.round(mid())}, theirs at ${Math.round(step + (step + h) / 2)})`);
  T.ok((step + h) * z() <= r.height, 'both pages in view');
});
