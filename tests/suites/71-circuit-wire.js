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

T.test('circuit wire: double-click-dragging a section carries the whole wire, elbows and T-junctions, with one undo', async () => {
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
    pointer(line, 'pointerdown', x, y); pointer(svg, 'pointerup', x, y);
    pointer(q('[data-id="run-a"] .cz-hitline'), 'pointerdown', x, y);
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

T.test('circuit wire: dragging a run whose ends sit on off-grid pins keeps its corners on the grid', async () => {
  const wire = (id, a, b) => ({ id, part: 'short', a, b, l: '', opts: '' });
  // ends at x = 3.1 (an off-grid pin), corners at x = 0
  const original = [wire('top', [3.1, 2], [0, 2]), wire('side', [0, 2], [0, 0]), wire('foot', [0, 0], [3.1, 0])];
  TD.czEditor.open({ items: original, raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const code = () => TD.cz.parse(q('.cz-code textarea').value).items;
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  const onGrid = (v) => Math.abs(v / 0.25 - Math.round(v / 0.25)) < 1e-6;
  try {
    const line = q('[data-id="side"] .cz-hitline'), b = line.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    pointer(line, 'pointerdown', x, y); pointer(svg, 'pointerup', x, y);
    pointer(q('[data-id="side"] .cz-hitline'), 'pointerdown', x, y);
    pointer(svg, 'pointermove', x - 37, y + 23);
    pointer(svg, 'pointerup', x - 37, y + 23);
    const side = code().find((it) => it.a[0] === it.b[0] && it.a[1] !== it.b[1]);
    T.ok(side && side.a[0] !== 0, 'run moved');
    T.ok(onGrid(side.a[0]) && onGrid(side.a[1]) && onGrid(side.b[1]), 'moved corners stay on the grid');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
});

T.test('circuit wire: a click selects one segment; dragging it keeps its neighbours and T-branches joined', async () => {
  const wire = (id, a, b) => ({ id, part: 'short', a, b, l: '', opts: '' });
  const original = [wire('run-a', [0, 0], [2, 0]), wire('run-b', [2, 0], [2, 2]), wire('branch', [1, 0], [1, -1]), wire('apart', [5, 0], [6, 0])];
  TD.czEditor.open({ items: original, raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const code = () => TD.cz.parse(q('.cz-code textarea').value).items;
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  try {
    const line = q('[data-id="run-a"] .cz-hitline'), b = line.getBoundingClientRect();
    const x = b.x + b.width / 4, y = b.y + b.height / 2;
    pointer(line, 'pointerdown', x, y);
    T.eq(root.querySelectorAll('.cz-h').length, 2, 'only the clicked segment is selected (its two end handles)');
    pointer(svg, 'pointermove', x, y + 60);
    pointer(svg, 'pointerup', x, y + 60);
    const [a, bb, br, ap] = code(), dy = a.a[1];
    T.ok(dy !== 0 && a.a[0] === 0 && a.b[0] === 2 && a.b[1] === dy, 'segment moved');
    T.ok(TD.cz.same(bb.a, a.b) && TD.cz.same(bb.b, original[1].b), 'neighbour stretches to stay joined');
    T.ok(TD.cz.same(br.a, [1, dy]) && TD.cz.same(br.b, original[2].b), 'T-branch end rides along');
    T.ok(TD.cz.same(ap.a, original[3].a), 'separate wire stays put');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
});

T.test('circuit wire: a dragged wire snaps level with an off-grid pin, and onto it, ahead of the grid', async () => {
  const wire = (id, a, b) => ({ id, part: 'short', a, b, l: '', opts: '' });
  const gate = { id: 'gate', part: 'logic:and', p: [0, 0], rot: 0, flip: false, name: 'U1', text: '', opts: '' };
  const pin = TD.cz.pinsOf(gate)['in 2'];
  // a run on the grid whose last section slants up to the gate's off-grid input
  const original = [gate, wire('run', [-4, -0.5], [-2, -0.5]), wire('slant', [-2, -0.5], pin.slice()), wire('loose', [-4, -2], [-2, -2])];
  TD.czEditor.open({ items: original, raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const code = () => TD.cz.parse(q('.cz-code textarea').value).items;
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  const drag = (id, cmx, cmy) => {
    const line = q(`[data-id="${id}"] .cz-hitline`), b = line.getBoundingClientRect();
    const [x1, x2] = /M([\d.-]+),[\d.-]+L([\d.-]+)/.exec(line.getAttribute('d')).slice(1).map(Number), k = Math.abs(x2 - x1) / 2; // each wire is 2cm long; the path, not the box (Firefox counts the hit stroke)
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    pointer(line, 'pointerdown', x, y); pointer(svg, 'pointermove', x + cmx * k, y - cmy * k); pointer(svg, 'pointerup', x + cmx * k, y - cmy * k);
  };
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  try {
    drag('run', 0, 0.2); // the grid alone would give -0.25
    const run = code().find((it) => it.id === 'run' || (TD.cz.isWire(it) && near(it.a[0], -4) && !near(it.a[1], -2)));
    T.ok(near(run.a[1], pin[1]) && near(run.b[1], pin[1]), 'run lines up level with the pin, so the next section is straight');
    T.ok(near(run.a[0], -4) && near(run.b[0], -2), 'run keeps its grid x');
    drag('loose', pin[0] + 2 - (-2) - 2, pin[1] + 2 - 0.02); // drop its right end just short of the pin
    const loose = code().find((it) => TD.cz.isWire(it) && Math.abs(it.a[0] - (pin[0] - 2)) < 0.01 && near(it.b[0], pin[0]) && near(it.a[1], pin[1]) && near(it.b[1], pin[1]));
    T.ok(loose, 'wire end lands exactly on the pin');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
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

T.test('circuit marquee: left to right takes what is wholly inside, right to left anything it touches, as on the canvas', async () => {
  const B = (id, part, a, b) => ({ id, part, a, b, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
  TD.czEditor.open({ items: [B('r', 'res:us', [0, 0], [3, 0]), B('w', 'short', [3, 0], [3, -2]), B('far', 'short', [6, 0], [6, -2])], raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s), svg = q('.cz-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const pointer = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
  const drag = (x0, y0, x1, y1) => { pointer('pointerdown', x0, y0); pointer('pointermove', x1, y1); const box = q('.marquee'); pointer('pointerup', x1, y1); return box; };
  const sel = () => [...root.querySelectorAll('[data-id]')].filter((g) => g.querySelector('[stroke="var(--redpen)"]')).map((g) => g.dataset.id).sort().join(',');
  try {
    const r = q('[data-id="r"] .cz-hitline').getBoundingClientRect(), w = q('[data-id="w"] .cz-hitline').getBoundingClientRect();
    // a box round the resistor alone, the wire's top end inside it but not the wire's whole length
    let box = drag(r.left - 20, r.top - 40, r.right + 10, r.bottom + 40);
    T.ok(box && !box.classList.contains('cross'), 'left to right draws the window box');
    T.eq(sel(), 'r', 'only the resistor lies wholly inside');
    // a small box over the middle of the wire, dragged right to left: it touches the wire alone
    const my = (w.top + w.bottom) / 2;
    box = drag(w.right + 15, my - 10, w.left - 15, my + 10);
    T.ok(box && box.classList.contains('cross'), 'right to left draws the crossing box');
    T.eq(sel(), 'w', 'the wire it crosses is taken, though neither end is inside');
    // the same small box left to right takes nothing
    drag(w.left - 15, my - 10, w.right + 15, my + 10);
    T.eq(sel(), '', 'left to right over part of a wire takes nothing');
  } finally {
    svg.setPointerCapture = capture;
    q('[data-cz="done"]').click();
  }
  T.ok(!document.querySelector('.td-dialog'), 'closed with nothing asked');
});

T.test('circuit editor: Ctrl/Cmd+A selects every item, with Caps Lock too, but not while typing', async () => {
  const B = (id, part, a, b) => ({ id, part, a, b, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
  TD.czEditor.open({ items: [B('r', 'res:us', [0, 0], [3, 0]), B('w', 'short', [3, 0], [3, -2]), { id: 'n', part: 'circ', p: [3, -2], rot: 0, flip: false, name: '', text: '', opts: '' }], raw: '' }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#czModal'), q = (s) => root.querySelector(s);
  const key = (k, o = {}, t = window) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const sel = () => [...root.querySelectorAll('[data-id]')].filter((g) => g.querySelector('[stroke="var(--redpen)"], [fill="var(--redpen)"]')).length;
  try {
    key('a', { ctrlKey: true });
    T.eq(sel(), 3, 'Ctrl+A selects all three');
    key('Escape'); T.eq(sel(), 0, 'Esc clears it');
    key('A', { metaKey: true });
    T.eq(sel(), 3, 'Cmd+A with Caps Lock too');
    key('Escape');
    const ta = q('.cz-code textarea'); ta.focus();
    key('a', { ctrlKey: true }, ta);
    T.eq(sel(), 0, 'in the code field it is the field’s own Select All');
    ta.blur();
  } finally {
    q('[data-cz="done"]').click();
  }
});

