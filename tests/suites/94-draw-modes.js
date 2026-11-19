// Draw modes of the Rectangle and Ellipse tools: corner to corner, from the centre, three points (a turned
// rectangle); for the ellipse also a circle from its centre, by two points (a diameter) and through three points.
T.test('Draw modes: the menu on the Rectangle and Ellipse buttons sets how they draw', () => {
  let saved = null; try { saved = localStorage.getItem('diagramtex.drawModes'); } catch (e) { /* blocked */ }
  try {
    const rect = document.querySelector('#fly-shapes [data-modes="rect"]');
    T.ok(rect && document.querySelector('#fly-shapes [data-modes="ellipse"]'), 'both buttons have a menu');
    rect.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = () => document.querySelector('#modeMenu'); // the open one: a closed menu is gone
    T.ok(menu(), 'opens');
    T.eq([...menu().querySelectorAll('[data-act]')].map((b) => b.textContent).join(','), 'Corner to corner,From the centre,Three points');
    T.eq(menu().querySelector('[aria-checked="true"]').dataset.act, 'rect:corner', 'corner to corner by default');
    menu().querySelector('[data-act="rect:three"]').click();
    T.ok(!menu(), 'a choice closes it');
    T.eq(TD.state.tool, 'rect', 'and takes the tool');
    T.eq(JSON.parse(localStorage.getItem('diagramtex.drawModes')).rect, 'three', 'remembered');
    rect.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    T.eq(menu().querySelector('[aria-checked="true"]').dataset.act, 'rect:three', 'ticked next time');
    T.ok(rect.querySelector('svg path'), 'the button shows the turned rectangle');
    document.querySelector('#fly-shapes [data-modes="ellipse"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    T.eq([...menu().querySelectorAll('[data-act]')].map((b) => b.dataset.act.split(':')[1]).join(' '), 'corner center circle circle2 circle3');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    T.ok(!menu(), 'a click elsewhere closes it');
  } finally {
    try { saved == null ? localStorage.removeItem('diagramtex.drawModes') : localStorage.setItem('diagramtex.drawModes', saved); } catch (e) { /* blocked */ }
    TD.app.cmd.setTool('select');
  }
});

T.test('Draw modes: each mode draws the shape it says', () => {
  const pick = (tool, m) => {
    const b = document.querySelector(`#fly-shapes [data-modes="${tool}"]`);
    b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    document.querySelector(`#modeMenu [data-act="${tool}:${m}"]`).click();
  };
  TD.app.newDoc('Draw modes', null, null, null, null, 'board');
  const svg = document.querySelector('#canvas'), r = svg.getBoundingClientRect();
  const cap = svg.setPointerCapture, snap = TD.state.snap;
  svg.setPointerCapture = () => {}; TD.state.snap = false;
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1 }));
  const drag = (x1, y1, x2, y2) => { ev('pointerdown', x1, y1); ev('pointermove', (x1 + x2) / 2, (y1 + y2) / 2); ev('pointermove', x2, y2); ev('pointerup', x2, y2); };
  const click = (x, y) => { ev('pointerdown', x, y); ev('pointerup', x, y); };
  const z = TD.state.view.zoom, near = (a, b) => Math.abs(a - b) < 0.01;
  const last = () => TD.state.doc.shapes[TD.state.doc.shapes.length - 1];
  let saved = null; try { saved = localStorage.getItem('diagramtex.drawModes'); } catch (e) { /* blocked */ }
  try {
    pick('rect', 'corner'); drag(100, 100, 200, 150);
    T.ok(near(last().w, 100 / z) && near(last().h, 50 / z), 'corner to corner: ' + JSON.stringify(last()));
    pick('rect', 'center'); drag(300, 300, 340, 320);
    let s = last();
    T.ok(near(s.w, 80 / z) && near(s.h, 40 / z), 'from the centre: twice the drag');
    const c0 = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    pick('rect', 'three'); click(100, 400); ev('pointermove', 160, 340); click(200, 300);
    T.eq(TD.state.tool, 'rect', 'still drawing after two clicks');
    ev('pointermove', 260, 360); click(300, 400);
    s = last();
    T.eq(s.type, 'rect');
    T.eq(s.angle, 45, 'turned along the first side');
    T.ok(near(s.w, Math.hypot(100, 100) / z) && near(s.h, Math.hypot(100, 100) / z), 'sides from the clicks: ' + JSON.stringify(s));
    T.eq(TD.state.tool, 'select', 'done after the third click');
    T.ok(/rotate around=\{45:/.test(TD.TYPES.rect.tikz(s, TD.makeTikzContext())), 'exported turned');

    pick('ellipse', 'center'); drag(500, 300, 530, 310);
    s = last(); T.ok(near(s.rx, 30 / z) && near(s.ry, 10 / z), 'ellipse from the centre');
    pick('ellipse', 'circle'); drag(500, 100, 530, 140);
    s = last(); T.ok(near(s.rx, 50 / z) && near(s.ry, 50 / z), 'circle from the centre: radius 50');
    const cc = { x: s.cx, y: s.cy };
    pick('ellipse', 'circle2'); drag(600, 100, 700, 100);
    s = last(); T.ok(near(s.rx, 50 / z) && near(s.cx - cc.x, 150 / z) && near(s.cy, cc.y), 'circle by 2 points: a diameter');
    pick('ellipse', 'circle3'); click(600, 300); click(700, 300); ev('pointermove', 660, 260); click(650, 250);
    s = last(); T.ok(near(s.rx, 50 / z) && near(s.ry, 50 / z) && near(s.cx - cc.x, 150 / z) && near(s.cy - cc.y, 200 / z), 'circle through three points: ' + JSON.stringify(s));
    T.ok(near(c0.x - cc.x, -200 / z), 'positions agree');
    // Esc between the clicks leaves nothing behind
    const n = TD.state.doc.shapes.length;
    click(100, 600); click(200, 600);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.eq(TD.state.doc.shapes.length, n, 'Esc cancels');
  } finally {
    svg.setPointerCapture = cap; TD.state.snap = snap;
    try { saved == null ? localStorage.removeItem('diagramtex.drawModes') : localStorage.setItem('diagramtex.drawModes', saved); } catch (e) { /* blocked */ }
    TD.app.cmd.setTool('select');
  }
});

T.test('Draw modes: a rectangle or ellipse also draws with two clicks; a symbol still goes in with one', () => {
  const pick = (tool, m) => {
    document.querySelector(`#fly-shapes [data-modes="${tool}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    document.querySelector(`#modeMenu [data-act="${tool}:${m}"]`).click();
  };
  TD.app.newDoc('Two-click boxes', null, null, null, null, 'board');
  const svg = document.querySelector('#canvas'), r = svg.getBoundingClientRect();
  const cap = svg.setPointerCapture, snap = TD.state.snap;
  svg.setPointerCapture = () => {}; TD.state.snap = false;
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1 }));
  const click = (x, y) => { ev('pointerdown', x, y); ev('pointerup', x, y); };
  const z = TD.state.view.zoom, near = (a, b) => Math.abs(a - b) < 0.01;
  const shapes = () => TD.state.doc.shapes, last = () => shapes()[shapes().length - 1];
  let saved = null; try { saved = localStorage.getItem('diagramtex.drawModes'); } catch (e) { /* blocked */ }
  try {
    const cases = [
      ['rect', 'corner', (s) => near(s.w, 100 / z) && near(s.h, 50 / z)],
      ['rect', 'center', (s) => near(s.w, 200 / z) && near(s.h, 100 / z)],
      ['ellipse', 'corner', (s) => near(s.rx, 50 / z) && near(s.ry, 25 / z)],
      ['ellipse', 'center', (s) => near(s.rx, 100 / z) && near(s.ry, 50 / z)],
      ['ellipse', 'circle', (s) => near(s.rx, Math.hypot(100, 50) / z)],
      ['ellipse', 'circle2', (s) => near(s.rx, Math.hypot(100, 50) / 2 / z)],
    ];
    for (const [tool, m, ok] of cases) {
      pick(tool, m);
      const n = shapes().length;
      click(200, 200);
      T.eq(TD.state.tool, tool, `${tool} ${m}: still drawing after the first click`);
      ev('pointermove', 260, 230);
      click(300, 250);
      T.eq(shapes().length, n + 1, `${tool} ${m}: one shape`);
      T.ok(ok(last()), `${tool} ${m}: sized by the second click: ` + JSON.stringify(last()));
      T.eq(TD.state.tool, 'select');
    }
    // Esc between the clicks leaves nothing behind
    pick('rect', 'corner');
    const n = shapes().length;
    click(100, 300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.eq(shapes().length, n, 'Esc cancels');
    // a symbol takes its own size from one click
    TD.app.cmd.setTool('sym:diamond');
    click(400, 400);
    T.eq(shapes().length, n + 1, 'a symbol is placed by a click');
    T.eq(TD.state.tool, 'select');
  } finally {
    svg.setPointerCapture = cap; TD.state.snap = snap;
    try { saved == null ? localStorage.removeItem('diagramtex.drawModes') : localStorage.setItem('diagramtex.drawModes', saved); } catch (e) { /* blocked */ }
    TD.app.cmd.setTool('select');
  }
});
