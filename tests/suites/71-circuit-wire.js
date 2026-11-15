T.test('circuit wire: library maps to W, multi-click corners commit together, Escape keeps confirmed sections', async () => {
  let result;
  TD.czEditor.open({ items: [], raw: '' }, (r) => { result = r; });
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const bounds = svg.getBoundingClientRect();
  const origin = /M([\d.-]+),([\d.-]+)/.exec(q('.cz-origin').getAttribute('d'));
  const x = bounds.x + Number(origin[1]) + 6, y = bounds.y + Number(origin[2]);
  const pointer = (type, cx, cy) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: cx, clientY: cy }));
  const click = (cx, cy) => { pointer('pointerdown', cx, cy); pointer('pointerup', cx, cy); };
  const items = () => TD.cz.parse(q('.cz-code textarea').value).items;
  const key = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
  try {
    q('[data-part="short"]').click();
    T.ok(q('[data-cz="wire"]').classList.contains('on'), 'Wire library entry activates W tool');
    T.eq(items().length, 0, 'arming Wire places no element');
    click(x, y); click(x + 90, y); click(x + 90, y - 90);
    T.eq(items().length, 2, 'two confirmed straight sections');
    T.ok(TD.cz.same(items()[0].b, items()[1].a), 'sections share elbow');
    pointer('pointermove', x + 160, y - 90);
    T.ok(q('.cz-wire-preview'), 'unconfirmed section previews');
    key('Escape');
    T.eq(items().length, 2, 'Escape preserves only confirmed sections');
    T.ok(q('[data-cz="select"]').classList.contains('on'), 'Escape exits Wire');
    T.ok(!q('.cz-wire-preview'), 'preview cleared');
    q('[data-cz="undo"]').click(); T.eq(items().length, 0, 'whole route is one undo');
    q('[data-cz="redo"]').click(); T.eq(items().length, 2, 'redo restores route');
    key('w'); click(x, y); click(x - 90, y); click(x - 90, y);
    T.eq(items().length, 3, 'same point commits without zero-length wire');
    T.ok(q('[data-cz="select"]').classList.contains('on'), 'same point exits Wire');
    key('w'); click(x, y); key('Escape');
    T.eq(items().length, 3, 'start then Escape adds no wire');
    key('w'); pointer('pointerdown', x, y); pointer('pointermove', x, y + 90); pointer('pointerup', x, y + 90);
    T.eq(items().length, 4, 'single-section press-and-drag still works');
    T.ok(items().every((it) => !TD.cz.same(it.a, it.b)), 'no zero-length sections');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
  T.eq(result.items.length, 4, 'Done hands committed route back');
});

T.test('circuit wire: dragging one section carries connected elbows and T-junctions with one undo', async () => {
  const wire = (id, a, b) => ({ id, part: 'short', a, b, l: '', opts: '' });
  const original = [wire('run-a', [0, 0], [2, 0]), wire('run-b', [2, 0], [2, 2]), wire('branch', [1, 0], [1, -1]), wire('apart', [5, 0], [6, 0])];
  let got;
  TD.czEditor.open({ items: original, raw: '' }, (r) => { got = r; });
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const code = () => TD.cz.parse(q('.cz-code textarea').value).items;
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  try {
    T.ok(q('.cz-junction'), 'T-junction is visible');
    const line = q('[data-id="run-a"] .cz-hitline'), b = line.getBoundingClientRect();
    const x = b.x + b.width / 4, y = b.y + b.height / 2;
    pointer(line, 'pointerdown', x, y);
    pointer(svg, 'pointermove', x + 60, y + 60);
    pointer(svg, 'pointerup', x + 60, y + 60);
    const moved = code(), dx = moved[0].a[0], dy = moved[0].a[1];
    T.ok(dx !== 0 && dy !== 0, 'run moved');
    for (let i = 0; i < 3; i++) for (const end of ['a', 'b']) {
      T.ok(TD.cz.same(moved[i][end], [original[i][end][0] + dx, original[i][end][1] + dy]), 'connected section translated intact');
    }
    T.ok(TD.cz.same(moved[3].a, original[3].a), 'separate wire stays put');
    q('[data-cz="undo"]').click();
    T.ok(TD.cz.same(code()[0].a, original[0].a) && TD.cz.same(code()[2].b, original[2].b), 'undo restores whole run');
    q('[data-cz="redo"]').click();
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
  T.eq(got.items.length, 4, 'connected model persists without losing sections');
});

for (const mode of ['terminal', 'component']) T.test(`circuit wire: separating coincident component pins by ${mode} drag creates a wire`, async () => {
  const part = (id, type, a, b) => ({ id, part: type, a, b, l: '', opts: '' });
  const original = [part('contact-r', 'res:iec', [0, 0], [2, 0]), part('contact-c', 'cap:iec', [2, 0], [2, -2])];
  TD.czEditor.open({ items: original, raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  const code = () => TD.cz.parse(q('.cz-code textarea').value).items;
  try {
    let target = q('[data-id="contact-r"] .cz-hitline'), box = target.getBoundingClientRect();
    let x = box.x + box.width / 3, y = box.y + box.height / 2;
    if (mode === 'terminal') {
      pointer(target, 'pointerdown', x, y); pointer(svg, 'pointerup', x, y);
      target = q('.cz-h[data-end="b"]'); box = target.getBoundingClientRect();
      x = box.x + box.width / 2; y = box.y + box.height / 2;
    }
    pointer(target, 'pointerdown', x, y);
    const dx = mode === 'terminal' ? 60 : 0, dy = mode === 'component' ? 60 : 0;
    pointer(svg, 'pointermove', x + dx, y + dy);
    T.ok(q('.cz-contact-preview path'), 'connecting wire previews while dragging');
    pointer(svg, 'pointerup', x + dx, y + dy);
    const items = code(), resistor = items.find(it => it.part === 'res:iec'), capacitor = items.find(it => it.part === 'cap:iec'), wires = items.filter(TD.cz.isWire);
    T.ok(wires.length > 0, 'separating direct contact creates wire');
    T.ok(TD.cz.same(capacitor.a, original[1].a), 'stationary capacitor stays put');
    T.ok(wires.some(w => TD.cz.same(w.a, capacitor.a) || TD.cz.same(w.b, capacitor.a)), 'wire reaches stationary terminal');
    T.ok(wires.some(w => TD.cz.same(w.a, resistor.b) || TD.cz.same(w.b, resistor.b)), 'wire reaches moved terminal');
    T.ok(wires.every(w => !TD.cz.same(w.a, w.b)), 'no zero-length wires');
    q('[data-cz="undo"]').click(); T.eq(code().length, 2, 'one undo restores contact and removes generated wires');
    q('[data-cz="redo"]').click(); T.eq(code().length, items.length, 'redo restores generated connection');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
});
