// A selection of two or more objects (a group, several, loose shapes) has eight resize handles on its frame: dragging one scales every member with the group's box
// (TD.scaleShape), the opposite side holding still; Shift at a corner keeps the proportions; Esc puts it back.
T.test('groups: the frame\'s handles resize every member; Shift keeps proportions; Esc and undo put it back', () => {
  TD.app.newDoc('Group resize', null, null, null, null, 'board');
  const snap = TD.state.snap; TD.state.snap = false;
  const svg = document.querySelector('#canvas');
  const cap = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const ev = (el, t, x, y, o = {}) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1, ...o }));
  try {
    const r = T.make('rect', { x: 2, y: 2, set: { w: 120, h: 60 } }), e = T.make('ellipse'), t = T.make('text');
    Object.assign(e, { cx: r.x + r.w + 60, cy: r.y + r.h / 2, rx: 30, ry: 20 });
    Object.assign(t, { x: r.x + r.w / 2, y: r.y + r.h + 30, text: 'Label' });
    for (const s of [r, e, t]) s.g = 'gr';
    TD.app.begin(); TD.state.doc.shapes.push(r, e, t); TD.app.commit();
    TD.state.sel = new Set([r.id, e.id, t.id]); TD.app.render();
    const before = JSON.parse(JSON.stringify([r, e, t].map((s) => TD.state.doc.shapes.find((q) => q.id === s.id))));
    const box = (list) => TD.bboxOf(list.flatMap((s) => { const b = TD.bbox(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0);
    const B = box([r, e, t]), z = TD.state.view.zoom;
    const hs = [...document.querySelectorAll('#overlay [data-frame][data-handle]')].map((h) => h.dataset.handle).sort();
    T.eq(hs.join(','), 'e,n,ne,nw,s,se,sw,w', 'eight handles on the group\'s frame');
    const at = (k) => { const h = document.querySelector(`#overlay [data-frame][data-handle="${k}"]`), b = h.getBoundingClientRect(); return { h, x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    const cur = () => TD.state.doc.shapes.filter((q) => [r.id, e.id, t.id].includes(q.id));
    const find = (id) => TD.state.doc.shapes.find((q) => q.id === id);

    // the east handle: twice as wide, the west side and the height held
    let p = at('e');
    ev(p.h, 'pointerdown', p.x, p.y); ev(svg, 'pointermove', p.x + B.w * z, p.y); ev(svg, 'pointerup', p.x + B.w * z, p.y);
    let nb = box(cur()), R = find(r.id), E = find(e.id), X = find(t.id);
    T.ok(Math.abs(nb.x - B.x) < 1 && Math.abs(nb.w - 2 * B.w) < 2, `twice as wide (line widths keep theirs) from the left: ${nb.x},${nb.w} vs ${B.x},${B.w}`);
    T.ok(Math.abs(R.w - 2 * before[0].w) < 0.01 && Math.abs(R.h - before[0].h) < 0.01, 'the rectangle stretches across');
    T.ok(Math.abs(E.rx - 2 * before[1].rx) < 0.01 && Math.abs(E.ry - before[1].ry) < 0.01, 'the ellipse too');
    T.eq(X.size, before[2].size, 'text keeps its size');
    T.ok(Math.abs(X.x - (B.x + (before[2].x - B.x) * 2)) < 0.01, 'and moves with the group');
    TD.app.cmd.undo();
    T.eq(JSON.stringify(cur().map((s) => [s.x, s.w, s.cx, s.rx])), JSON.stringify(before.map((s) => [s.x, s.w, s.cx, s.rx])), 'undo puts it back');

    // Shift at a corner keeps the proportions; the north-west corner holds the south-east one
    TD.state.sel = new Set([r.id, e.id, t.id]); TD.app.render();
    p = at('se');
    ev(p.h, 'pointerdown', p.x, p.y); ev(svg, 'pointermove', p.x + B.w * z / 2, p.y + 5, { shiftKey: true }); ev(svg, 'pointerup', p.x + B.w * z / 2, p.y + 5, { shiftKey: true });
    nb = box(cur());
    R = find(r.id); E = find(e.id);
    T.ok(Math.abs(R.w / R.h - before[0].w / before[0].h) < 1e-6 && Math.abs(R.w / before[0].w - 1.5) < 0.05, `Shift: the same proportions, half as big again (${R.w}×${R.h})`);
    T.ok(Math.abs(E.rx / E.ry - before[1].rx / before[1].ry) < 1e-6, 'every member keeps them');
    T.ok(Math.abs(nb.x - B.x) < 1 && Math.abs(nb.y - B.y) < 1, 'the opposite corner holds');
    TD.app.cmd.undo();

    // Esc while dragging: nothing changed, nothing to undo
    TD.state.sel = new Set([r.id, e.id, t.id]); TD.app.render();
    p = at('w');
    ev(p.h, 'pointerdown', p.x, p.y); ev(svg, 'pointermove', p.x - 80, p.y);
    T.ok(Math.abs(box(cur()).w - B.w) > 10, 'the drag resizes as it goes');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ev(svg, 'pointerup', p.x - 80, p.y);
    T.eq(JSON.stringify(cur().map((s) => [s.x, s.w, s.cx, s.rx])), JSON.stringify(before.map((s) => [s.x, s.w, s.cx, s.rx])), 'Esc puts it back');

    // dragged past the opposite side, it stops there: never inside out
    p = at('e');
    ev(p.h, 'pointerdown', p.x, p.y); ev(svg, 'pointermove', p.x - 3 * B.w * z, p.y); ev(svg, 'pointerup', p.x - 3 * B.w * z, p.y);
    R = find(r.id);
    T.ok(Math.abs(R.x - before[0].x) < 1 && R.w > 0 && find(e.id).rx > 0 && find(e.id).cx > R.x, `held at the west side, nothing turned inside out: ${R.x}, ${R.w}`);
    TD.app.cmd.undo();

    // one shape alone has its own handles, not the frame's
    TD.state.sel = new Set([r.id]); TD.app.render();
    T.ok(!document.querySelector('#overlay [data-frame]'), 'one member alone: its own handles');
  } finally { svg.setPointerCapture = cap; TD.state.snap = snap; }
});

T.test('groups: loose shapes, several groups, or a mix of both resize as one, as a group does', () => {
  TD.app.newDoc('Selection resize', null, null, null, null, 'board');
  const snap = TD.state.snap; TD.state.snap = false;
  const svg = document.querySelector('#canvas');
  const cap = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const ev = (el, t, x, y) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1 }));
  try {
    const mk = (cm, g) => { const s = T.make('rect', { x: cm, y: 2, set: { w: 40, h: 40 } }); if (g) s.g = g; return s; };
    const a1 = mk(1, 'ga'), a2 = mk(3, 'ga'), b1 = mk(5, 'gb'), b2 = mk(7, 'gb'), c = mk(9), d = mk(11);
    const all = [a1, a2, b1, b2, c, d];
    TD.app.begin(); TD.state.doc.shapes.push(...all); TD.app.commit();
    const find = (id) => TD.state.doc.shapes.find((q) => q.id === id);
    const at = (k) => { const h = document.querySelector(`#overlay [data-frame][data-handle="${k}"]`), b = h.getBoundingClientRect(); return { h, x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    const z = TD.state.view.zoom;
    for (const [name, list] of [['loose shapes', [c, d]], ['two groups', [a1, a2, b1, b2]], ['groups and a loose shape', [a1, a2, b1, b2, c]]]) {
      TD.state.sel = new Set(list.map((s) => s.id)); TD.app.render();
      T.eq(document.querySelectorAll('#overlay [data-frame][data-handle]').length, 8, name + ': eight handles round the selection');
      T.eq(document.querySelectorAll('#overlay .grp-box').length, new Set(list.map((s) => s.g).filter(Boolean)).size + 1, name + ': a frame round all of it, and each group its own');
      const was = list.map((s) => ({ ...find(s.id) })), x0 = Math.min(...was.map((s) => s.x)), x1 = Math.max(...was.map((s) => s.x + s.w));
      const p = at('e'), dx = (x1 - x0) * z;
      ev(p.h, 'pointerdown', p.x, p.y); ev(svg, 'pointermove', p.x + dx, p.y); ev(svg, 'pointerup', p.x + dx, p.y);
      list.forEach((s, i) => {
        const q = find(s.id);
        T.ok(Math.abs(q.w - 2 * was[i].w) < 0.5 && Math.abs(q.h - was[i].h) < 0.01, `${name}: each twice as wide (${q.w} vs ${was[i].w})`);
        T.ok(Math.abs(q.x - (x0 + 2 * (was[i].x - x0))) < 1, `${name}: and spread out from the left`);
      });
      T.ok(all.filter((s) => !list.includes(s)).every((s) => find(s.id).w === 40), name + ': what is not selected stays');
      T.eq(find(a1.id).g, a1.g, name + ': groups stay groups');
      TD.app.cmd.undo();
    }
  } finally { svg.setPointerCapture = cap; TD.state.snap = snap; }
});

T.test('groups: TD.scaleShape scales points, boxes and radii, and keeps dots and line widths', () => {
  const B = { x: 0, y: 0, w: 100, h: 100 }, nb = { x: 10, y: 0, w: 200, h: 50 };
  const P = { type: 'poly', pts: [[0, 0], [100, 100]], width: 2 };
  TD.scaleShape(P, B, nb);
  T.eq(JSON.stringify(P.pts), '[[10,0],[210,50]]', 'poly points'); T.eq(P.width, 2, 'line width kept');
  const L = { type: 'line', x1: 0, y1: 50, x2: 100, y2: 50 };
  TD.scaleShape(L, B, nb);
  T.eq([L.x1, L.y1, L.x2, L.y2].join(','), '10,25,210,25', 'line ends');
  const D = { type: 'dot', cx: 50, cy: 50, r: 3 };
  TD.scaleShape(D, B, nb);
  T.eq([D.cx, D.cy, D.r].join(','), '110,25,3', 'a dot moves and keeps its size');
  const A = { type: 'arc', cx: 50, cy: 50, r: 10, a1: 0, a2: 90 };
  TD.scaleShape(A, B, nb);
  T.eq([A.cx, A.cy, A.r, A.ry].join(','), '110,25,20,5', 'an arc becomes elliptical');
  const E = { type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 20, angle: 90 };
  TD.scaleShape(E, B, nb);
  T.ok(Math.abs(E.rx - 5) < 1e-9 && Math.abs(E.ry - 40) < 1e-9, `turned a quarter, it scales along its own axes: ${E.rx}, ${E.ry}`);
});
