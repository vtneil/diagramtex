// The status line: the pointer's place, then the marquee's size (w × h in cm) while one is dragged, 0 × 0 otherwise,
// then the snap state. The size cell keeps its width, so the snap state never moves.
T.test('status line: the marquee\'s size beside the pointer, 0 × 0 without one', async () => {
  TD.app.newDoc('Status size', null, null, null, null, 'board');
  const size = document.querySelector('#selSize'), stage = document.querySelector('#canvas');
  T.ok(size && size.previousElementSibling.id === 'cursorPos', 'the size sits after x · y');
  const s = T.make('rect'); Object.assign(s, { x: 0, y: 0, w: 120, h: 80 }); TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render();
  T.eq(size.textContent, 'w 0.00 · h 0.00 cm', 'a selection, no marquee: 0 × 0');
  const r = stage.getBoundingClientRect(), z = TD.state.view.zoom, x0 = r.left + r.width - 420, y0 = r.top + r.height - 300;
  const ev = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  const snap = TD.state.snap; TD.state.snap = false;
  stage.setPointerCapture = () => {}; // (Firefox refuses to capture a synthetic pointer)
  try {
    ev('pointerdown', x0, y0); ev('pointermove', x0 + 2 * 40 * z, y0 + 1.5 * 40 * z);
    for (let i = 0; i < 25 && !document.querySelector('.marquee'); i++) await new Promise((res) => setTimeout(res, 20));
    T.ok(document.querySelector('.marquee'), 'a marquee drawn');
    T.eq(size.textContent, 'w 2.00 · h 1.50 cm', 'the marquee\'s size');
    ev('pointerup', x0 + 2 * 40 * z, y0 + 1.5 * 40 * z); TD.app.render();
    T.eq(size.textContent, 'w 0.00 · h 0.00 cm', 'let go: 0 × 0');
  } finally { TD.state.snap = snap; delete stage.setPointerCapture; }
});
