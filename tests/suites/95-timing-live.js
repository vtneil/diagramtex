// The timing editor (editors/tmeditor.ts) shows a drag's result while it goes on: painting a value repaints the row
// and the code as the pointer moves, a new arrow is drawn with its label, and each is one undo step on release. A value
// can also be painted by clicking, pointing (it shows as the pointer moves) and clicking again. Segments are selected
// several at a time (a drag over empty space, ⇧-click), and palette items are dragged onto the drawing.
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const root = () => document.querySelector('#tmModal');
  const code = () => root().querySelector('.cz-code textarea').value;
  const svg = () => root().querySelector('.cz-svg');
  const ptr = (type, x, y, o = {}) => svg().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pointerId: 1, ...o }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const undoKey = () => key('z', navigator.platform.includes('Mac') ? { metaKey: true } : { ctrlKey: true });
  // the drawing's box on screen (its rows start at the top)
  const box = () => {
    const g = [...svg().querySelectorAll(':scope > g[transform]')].find(x => x.querySelector('path'));
    const r = g.getBBox(), m = g.getScreenCTM(), pt = (x, y) => new DOMPoint(x, y).matrixTransform(m);
    const a = pt(r.x, r.y), b = pt(r.x + r.width, r.y + r.height);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, at: f => a.x + (b.x - a.x) * f };
  };
  const open = async () => { TD.timingEditor.open({ ...TD.TYPES.timing.create({ x: 0, y: 0 }, TD.state.defaults) }, () => {}); await wait(80); };

  T.test('timing editor: painting a value repaints the row while dragging, Esc meanwhile is harmless, one undo step', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 + 12;
      root().querySelector('.qe-item[data-item="v:X"]').click(); await wait();
      ptr('pointerdown', B.at(0.45), y);
      for (const f of [0.5, 0.6, 0.7, 0.8]) ptr('pointermove', B.at(f), y);
      await wait();
      const mid = code();
      T.ok(mid !== start, 'the code changes while dragging');
      T.ok(/X/.test(mid.split('\n')[1]), 'the first row is painted with X: ' + mid.split('\n')[1]);
      key('Escape'); // the value is put down in the middle of the drag
      ptr('pointerup', B.at(0.8), y); await wait();
      T.eq(code(), mid, 'letting go keeps what was shown');
      undoKey(); await wait();
      T.eq(code(), start, 'one undo goes back to the start');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });

  T.test('timing editor: a new arrow is drawn, label and all, while dragging; none while it has no length; one undo step', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 - 20;
      root().querySelector('.qe-item[data-item="a:<->"]').click(); await wait();
      ptr('pointerdown', B.at(0.4), y);
      for (const f of [0.5, 0.6, 0.7]) ptr('pointermove', B.at(f), y);
      await wait();
      const n = s => (s.match(/\\draw/g) || []).length;
      T.eq(n(code()), n(start) + 1, 'the arrow is in the code while dragging');
      ptr('pointermove', B.at(0.4), y); await wait();
      T.eq(code(), start, 'dragged back to where it began: no arrow');
      ptr('pointermove', B.at(0.75), y); ptr('pointerup', B.at(0.75), y); await wait(80);
      T.eq(n(code()), n(start) + 1, 'kept on release');
      T.ok(document.querySelector('.td-pop-ta, .td-pop-ml'), 'its label opens to type');
      key('Escape'); await wait(50);
      undoKey(); await wait();
      T.eq(code(), start, 'one undo removes it');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });

  const click = (x, y) => { ptr('pointerdown', x, y); ptr('pointerup', x, y); };
  const row1 = () => code().split('\n')[1];

  T.test('timing editor: click, point and click again paints a value; it shows the clicked segment, then a range, as one undo step', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 + 12;
      root().querySelector('.qe-item[data-item="v:X"]').click(); await wait();
      click(B.at(0.5), y); await wait(400); // past a double-click
      ptr('pointermove', B.at(0.5) + 2, y); await wait();
      const seg = row1();
      T.ok(seg !== start.split('\n')[1] && /X/.test(seg), 'pointing inside the clicked segment shows it painted: ' + seg);
      ptr('pointermove', B.at(0.85), y); await wait();
      const range = row1();
      T.ok(range !== seg && /X/.test(range), 'pointing further shows a range from the click: ' + range);
      click(B.at(0.85), y); await wait();
      T.eq(row1(), range, 'the second click places what was shown');
      ptr('pointermove', B.at(0.3), y); await wait();
      T.eq(row1(), range, 'and nothing follows the pointer after that');
      undoKey(); await wait();
      T.eq(code(), start, 'one undo goes back to the start');
      // clicking twice on a segment paints just that one
      click(B.at(0.5), y); await wait(400); click(B.at(0.5), y); await wait();
      T.eq(row1(), seg, 'two clicks on a segment paint it');
      undoKey(); await wait();
      T.eq(code(), start, 'undone');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });

  T.test('timing editor: a click\'s paint not yet placed is dropped by Esc or a press outside the drawing, leaving nothing to undo', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 + 12;
      root().querySelector('.qe-item[data-item="v:X"]').click(); await wait();
      click(B.at(0.5), y); await wait(400); ptr('pointermove', B.at(0.85), y); await wait();
      T.ok(code() !== start, 'shown while pointing');
      key('Escape'); await wait();
      T.eq(code(), start, 'Esc drops it');
      T.ok(root().querySelector('.qe-item[data-item="v:X"].on, .qe-item[data-item="v:X"][aria-pressed="true"]'), 'and the value stays picked');
      click(B.at(0.5), y); await wait(400); ptr('pointermove', B.at(0.85), y); await wait();
      root().querySelector('.cz-code textarea').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await wait();
      T.eq(code(), start, 'a press outside the drawing drops it');
      undoKey(); await wait();
      T.eq(code(), start, 'nothing was added to undo');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });
  const sel = () => root().querySelectorAll('.tm-ssel').length;

  T.test('timing editor: a drag over empty space selects the segments it crosses; ⇧-click selects up to a segment; a value, the panel and Delete act on all', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 + 12;
      // from below the drawing up across its first rows, a third of the way along
      ptr('pointerdown', B.at(0.05), B.y2 + 40);
      ptr('pointermove', B.at(0.2), B.y2); ptr('pointermove', B.at(0.35), B.y1 + 4); await wait();
      T.ok(root().querySelector('.marquee'), 'the selection box is drawn');
      ptr('pointerup', B.at(0.35), B.y1 + 4); await wait();
      const n = sel();
      T.ok(n > 2, 'several segments are selected: ' + n);
      T.ok(/segments/.test(root().querySelector('.cz-props').textContent), 'the panel speaks of them all');
      T.ok(!root().querySelector('.marquee'), 'the box goes on release');
      root().querySelector('.qe-item[data-item="v:X"]').click(); await wait();
      const painted = code();
      T.ok(painted !== start && sel() > 1, 'a value paints them all and they stay selected');
      undoKey(); await wait();
      T.eq(code(), start, 'one undo');
      // click the first segment of the D row (3U 4D{A} 4D{B} 5U, a row distance of 3 below CLK), then ⇧-click its
      // last; times are found on the ruler
      const tick = n => { const r = [...root().querySelectorAll('.tm-tick')].find(x => x.textContent === String(n)).getBoundingClientRect(); return r.left + r.width / 2; };
      const X = t => tick(0) + (tick(2) - tick(0)) * t / 2, k = X(1) - X(0), yD = B.y1 + 4 * k;
      click(X(1.5), yD); await wait(400);
      T.eq(sel(), 1, 'a click selects one');
      ptr('pointerdown', X(13), yD, { shiftKey: true }); ptr('pointerup', X(13), yD, { shiftKey: true }); await wait();
      T.eq(sel(), 4, '⇧-click selects up to it');
      key('Delete'); await wait();
      T.ok(code() !== start && sel() === 0, 'Delete removes them');
      undoKey(); await wait();
      T.eq(code(), start, 'as one undo step');
      // a click on empty space selects nothing
      click(B.at(0.3), y); await wait(400); click(B.x2 + 40, B.y2 + 40); await wait();
      T.eq(sel(), 0, 'a click on empty space clears the selection');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });

  // drag a palette item: pressed on its button, moved over the drawing (its button keeps the pointer)
  const item = k => root().querySelector(`.qe-item[data-item="${k}"]`);
  const pal = (type, k, x, y) => item(k).dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pointerId: 1 }));
  const from = k => { const r = item(k).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  T.test('timing editor: a palette item dragged onto the drawing shows there as it moves and is placed on release as one undo step; off it, or Esc, nothing', async () => {
    const confirm = TD.confirm;
    try {
      await open();
      const start = code(), B = box(), y = B.y1 + 12;
      // a value onto a segment
      pal('pointerdown', 'v:X', ...from('v:X'));
      pal('pointermove', 'v:X', B.at(0.5), y); await wait();
      const shown = code();
      T.ok(shown !== start && /X/.test(row1()), 'the segment under it shows painted: ' + row1());
      pal('pointermove', 'v:X', B.x2 + 200, B.y2 + 200); await wait();
      T.eq(code(), start, 'off the drawing it shows nothing');
      pal('pointermove', 'v:X', B.at(0.5), y); pal('pointerup', 'v:X', B.at(0.5), y); await wait();
      T.eq(code(), shown, 'dropped where it showed');
      undoKey(); await wait();
      T.eq(code(), start, 'one undo');
      // let go off the drawing, or Esc meanwhile
      pal('pointerdown', 'v:X', ...from('v:X')); pal('pointermove', 'v:X', B.at(0.5), y); pal('pointerup', 'v:X', B.x2 + 200, B.y2 + 200); await wait();
      T.eq(code(), start, 'let go elsewhere: nothing');
      pal('pointerdown', 'v:X', ...from('v:X')); pal('pointermove', 'v:X', B.at(0.5), y); await wait();
      key('Escape'); await wait();
      T.eq(code(), start, 'Esc drops it');
      pal('pointerup', 'v:X', B.at(0.5), y); await wait();
      T.eq(code(), start, 'and the release after does nothing');
      undoKey(); await wait();
      T.eq(code(), start, 'nothing to undo');
      // a row, between the first two
      pal('pointerdown', 'r:clock', ...from('r:clock')); pal('pointermove', 'r:clock', B.at(0.5), y + 20); await wait();
      T.ok(root().querySelector('.ze-draft'), 'a line shows where the row goes');
      pal('pointerup', 'r:clock', B.at(0.5), y + 20); await wait();
      T.ok(code().split('\n').length === start.split('\n').length + 1, 'a row is added');
      undoKey(); await wait();
      T.eq(code(), start, 'one undo');
      // an arrow above the first row
      const n = s => (s.match(/\\draw/g) || []).length;
      pal('pointerdown', 'a:<->', ...from('a:<->')); pal('pointermove', 'a:<->', B.at(0.3), B.y1 - 20); await wait();
      T.eq(n(code()), n(start) + 1, 'the arrow is drawn while it hovers');
      pal('pointerup', 'a:<->', B.at(0.3), B.y1 - 20); await wait(80);
      T.eq(n(code()), n(start) + 1, 'and kept');
      key('Escape'); await wait(50);
      undoKey(); await wait();
      T.eq(code(), start, 'one undo');
      // a press without a drag picks it, as a click
      pal('pointerdown', 'v:H', ...from('v:H')); pal('pointerup', 'v:H', ...from('v:H')); await wait();
      T.ok(item('v:H').matches('.on, [aria-pressed="true"]'), 'a press picks the value');
    } finally { TD.confirm = async () => true; key('Escape'); await wait(); key('Escape'); await wait(50); TD.confirm = confirm; }
  });
}
