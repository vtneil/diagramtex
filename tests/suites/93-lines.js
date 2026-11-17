// Line types in PowerPoint's order: double arrow, elbow and curved connectors, a curve through points.
const L = TD.TYPES.line;
const mk = (tool, o) => ({ ...L.create({ x: 0, y: 0 }, { width: 1, dash: 'solid' }, tool), x1: 0, y1: 0, x2: 200, y2: 100, id: 'ln', ...o });
const tz = (s) => L.tikz(s, TD.makeTikzContext());

T.test('Lines: the menu runs straight, connectors, curves, then freeform', () => {
  const picks = [...document.querySelectorAll('#fly-lines [data-pick]')].map((b) => b.dataset.pick);
  T.eq(picks.join(' '), 'line arrow darrow elbow curvedconn curve curvearrow curvpen smoothcurve poly blob arc arc3 spring');
  T.eq([...document.querySelectorAll('#fly-lines .pop-title')].map((t) => t.textContent).join(','), 'Lines,Freeform');
  for (const t of ['darrow', 'elbow', 'curvedconn']) T.eq(TD.toolType(t), 'line', t + ' draws a line');
  T.eq(TD.toolType('smoothcurve'), 'poly');
  T.eq(TD.toolType('curvpen'), 'poly');
});

T.test('Lines: a double arrow has a tip at each end', () => {
  const s = mk('darrow');
  T.eq(s.startTip, 'stealth'); T.eq(s.endTip, 'stealth');
  T.ok(tz(s).includes('{Stealth}-{Stealth}'), tz(s));
});

T.test('Lines: an elbow connector routes at right angles', () => {
  const s = mk('elbow');
  T.eq(s.route, 'elbow');
  T.eq(TD.routeDir(s), 'hh', 'a wide line leaves sideways');
  T.eq(tz(s), '\\draw[line width=0.71pt] (0,0) -- (2.5,0) -- (2.5,-2.5) -- (5,-2.5);');
  T.eq(tz({ ...s, dir: 'vv' }), '\\draw[line width=0.71pt] (0,0) -- (0,-1.25) -- (5,-1.25) -- (5,-2.5);');
  T.eq(tz({ ...s, dir: 'hv' }), '\\draw[line width=0.71pt] (0,0) -- (5,0) -- (5,-2.5);');
  T.eq(tz({ ...s, dir: 'vh' }), '\\draw[line width=0.71pt] (0,0) -- (0,-2.5) -- (5,-2.5);');
  T.eq(TD.routeDir({ ...s, x2: 50, y2: 200 }), 'vv', 'a tall one leaves up or down');
  // the label sits on the middle segment, in the code too
  T.ok(tz({ ...s, label: '$x$' }).includes('(2.5,0) -- node[auto, pos=0.5] {$x$} (2.5,-2.5)'), 'label on the middle segment');
  // the end tip points along the last segment
  const svg = L.svg({ ...s, endTip: 'stealth' }, { export: true });
  T.ok(/M0,0L100,0L100,100L\d/.test(svg.replace(/\s+/g, '')), 'path through the corners: ' + svg.slice(0, 200));
});

T.test('Lines: the elbow middle handle slides the bend', () => {
  const s = mk('elbow');
  T.ok(L.handles(s).some((h) => h.k === 'mid'), 'has a middle handle');
  L.setHandle(s, 'mid', { x: 160, y: 999 }, {});
  T.eq(s.mc, 160);
  T.ok(tz(s).includes('(4,0) -- (4,-2.5)'), tz(s));
  T.ok(!L.handles({ ...s, dir: 'hv' }).some((h) => h.k === 'mid'), 'an L has no middle to move');
  // a quarter turn turns its directions too
  const r = mk('elbow', { dir: 'hv' });
  TD.rotateShape(r, 100, 50, 90);
  T.eq(r.dir, 'vh');
});

T.test('Lines: a curved connector is TikZ to[out, in] with the same controls', () => {
  const s = mk('curvedconn');
  T.eq(tz(s), '\\draw[line width=0.71pt] (0,0) to[out=0, in=180] (5,-2.5);');
  T.ok(tz({ ...s, dir: 'vv' }).includes('to[out=-90, in=90]'));
  T.ok(tz({ ...s, dir: 'hv', x2: -200 }).includes('to[out=180, in=90]'));
  T.ok(tz({ ...s, dir: 'vh', y2: -100 }).includes('to[out=90, in=180]'));
  // TikZ puts both controls 0.3915 × the distance out
  const k = 0.3915 * Math.hypot(200, 100);
  const m = L.svg(s, { export: true }).match(/C([\d.]+),([\d.-]+) ([\d.]+),([\d.-]+)/);
  T.ok(m, 'drawn as a cubic');
  T.ok(Math.abs(+m[1] - k) < 0.02 && Math.abs(+m[2]) < 0.02 && Math.abs(+m[3] - (200 - k)) < 0.02 && Math.abs(+m[4] - 100) < 0.02, m && m[0]);
  const b = TD.bbox(s);
  T.ok(b.w >= 199 && b.h >= 99, 'the box covers the curve');
});

T.test('Lines: Route and Direction in the panel', () => {
  TD.app.newDoc('Line routes', null, null, null, null, 'board');
  const s = mk('elbow'); s.id = 'lnPanel';
  TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render(); TD.app.renderProps();
  const on = (k) => document.querySelector(`#props [data-pk="${k}"].on`)?.dataset.pv;
  T.eq(on('route'), 'elbow');
  T.eq(on('dir'), 'hh');
  T.eq(document.querySelectorAll('#props [data-pk="dir"]').length, 4);
  const row = document.querySelector('#props [data-pk="dir"]').closest('.seg-ctl'), r = row.getBoundingClientRect();
  T.ok([...row.children].every((b) => b.getBoundingClientRect().right <= r.right + 0.5), 'the four directions fit the field');
  document.querySelector('#props [data-pv="curved"]').click();
  const cur = () => TD.state.doc.shapes.find((x) => x.id === s.id);
  T.eq(cur().route, 'curved');
  document.querySelector('#props [data-pk="dir"][data-pv="vv"]').click();
  T.eq(cur().dir, 'vv');
  document.querySelector('#props [data-pv="straight"]').click();
  T.ok(!document.querySelector('#props [data-pk="dir"]'), 'a straight line has no direction');
  T.ok(tz(cur()).includes('(0,0) -- (5,-2.5)'));
});

T.test('Lines: a curve through points is an open smooth polyline', () => {
  TD.app.cmd.setTool('smoothcurve');
  T.eq(TD.state.tool, 'smoothcurve');
  TD.app.cmd.setTool('select');
  const s = { ...TD.TYPES.poly.create({ x: 0, y: 0 }, { width: 1, dash: 'solid' }), pts: [[0, 0], [50, -40], [100, 20], [150, -10]], smooth: true, id: 'sc' };
  const code = TD.TYPES.poly.tikz(s, TD.makeTikzContext());
  T.ok(/\.\. controls/.test(code) && !/cycle/.test(code), code);
});

T.test('Lines: a curve through points is TikZ’s plot[smooth], handles and all', () => {
  const P = TD.TYPES.poly, X = () => TD.makeTikzContext();
  const pts = [[0, 0], [50, -40], [100, 20], [150, -10]];
  const s = { ...P.create({ x: 0, y: 0 }, { width: 1, dash: 'solid' }), pts, smooth: true, tension: 0.5, id: 'sc' };
  const code = P.tikz(s, X());
  T.ok(/ plot\[smooth\] coordinates \{\(0,0\) \(/.test(code) && !/tension/.test(code), code);
  T.ok(/plot\[smooth cycle, tension=0\.8\]/.test(P.tikz({ ...s, closed: true, tension: 0.8 }, X())), 'cycle and tension');
  // pgflibraryplothandlers: handles ± 0.2775·tension·(next − previous); an open curve's end handles on its ends
  const Q = pts.map(([x, y]) => ({ x, y })), g = TD.polySegs(Q, s), k = 0.2775 * 0.5;
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  T.ok(near(g[0][0], Q[0]) && near(g[2][1], Q[3]), 'ends');
  T.ok(near(g[0][1], { x: 50 - k * 100, y: -40 - k * 20 }) && near(g[1][0], { x: 50 + k * 100, y: -40 + k * 20 }), 'inner');
  const c = TD.polySegs(Q, { ...s, closed: true });
  T.eq(c.length, 4); T.ok(near(c[0][0], { x: k * (50 - 150), y: k * (-40 + 10) }), 'closed wraps');
  // older smooth shapes (no tension) keep their spline and their output
  T.ok(/\.\. controls/.test(P.tikz({ ...s, tension: undefined }, X())), 'old shapes unchanged');
  // and TikZ's plot reads back as the same curve
  const sh = TD.importLatex('\\begin{tikzpicture}\n\\draw[->] plot[smooth cycle, tension=0.7] coordinates {(0,0) (1,1) (2,0)};\n\\end{tikzpicture}').blocks[0].shapes;
  T.eq(sh.length, 1); T.eq(sh[0].type, 'poly'); T.ok(sh[0].smooth && sh[0].closed && sh[0].tension === 0.7 && sh[0].pts.length === 3, JSON.stringify(sh[0]));
});

T.test('Lines: a flat elbow’s middle pulls out into a U; stacked ends make a ⊐', () => {
  const s = mk('elbow', { x2: 300, y2: 0 });
  T.ok(TD.elbowFlat(s), 'ends level');
  L.setHandle(s, 'mid', { x: 150, y: -100 }, {});
  T.eq(s.dir, 'vv'); T.eq(s.mc, -100);
  T.eq(tz(s), '\\draw[line width=0.71pt] (0,0) -- (0,2.5) -- (7.5,2.5) -- (7.5,0);', 'an upside-down U');
  L.setHandle(s, 'mid', { x: 150, y: 60 }, {});
  T.eq(s.dir, 'vv', 'stays a U as it is dragged on'); T.eq(s.mc, 60);
  const c = mk('elbow', { x1: 300, y1: 0, x2: 300, y2: 160, dir: 'hh' });
  L.setHandle(c, 'mid', { x: 160, y: 80 }, {});
  T.eq(tz(c), '\\draw[line width=0.71pt] (7.5,0) -- (4,0) -- (4,-4) -- (7.5,-4);', 'out left and back: ⊐');
  // a quarter turn keeps the bend where the turn takes it
  TD.rotateShape(c, 300, 80, 90);
  const m = L.handles(c).find((h) => h.k === 'mid');
  T.ok(Math.abs(m.x - 300) < 0.01 && Math.abs(m.y - (80 - 140)) < 0.01, JSON.stringify(m));
});

T.test('Lines: click, then click again, draws a line', () => {
  TD.app.newDoc('Two clicks', null, null, null, null, 'board');
  const svg = document.querySelector('#canvas'), r = svg.getBoundingClientRect();
  const cap = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1 }));
  const click = (x, y) => { ev('pointerdown', x, y); ev('pointerup', x, y); };
  try {
    for (const tool of ['arrow', 'elbow', 'curve']) {
      TD.app.cmd.setTool(tool);
      const n = TD.state.doc.shapes.length;
      click(100, 100);
      T.eq(TD.state.tool, tool, tool + ': still drawing after the first click');
      ev('pointermove', 260, 180);
      click(300, 200);
      T.eq(TD.state.doc.shapes.length, n + 1, tool + ': one shape');
      const s = TD.state.doc.shapes[n];
      T.ok(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 100, tool + ': ends at the second click');
      T.eq(TD.state.tool, 'select');
    }
    // Esc between the clicks leaves nothing behind
    TD.app.cmd.setTool('line');
    const n = TD.state.doc.shapes.length;
    click(100, 300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.eq(TD.state.doc.shapes.length, n, 'Esc cancels');
  } finally { svg.setPointerCapture = cap; TD.app.cmd.setTool('select'); }
});

T.test('Lines: an elbow’s middle stays put when its ends move', () => {
  // ⊐ round two shapes: the far side stays where it is
  const at = (q) => TD.elbowMid(q);
  const c = mk('elbow', { x1: 300, y1: 0, x2: 300, y2: 160, dir: 'hh' });
  L.setHandle(c, 'mid', { x: 160, y: 80 }, {});
  L.setHandle(c, 'p2', { x: 500, y: 200 }, {});
  T.eq(at(c), 160, 'moving the lower end right leaves the middle');
  L.setHandle(c, 'p1', { x: 220, y: 0 }, {});
  T.eq(at(c), 160, 'so does moving the upper end left, while it is still 20 px clear');
  L.setHandle(c, 'p1', { x: 150, y: 0 }, {});
  T.eq(at(c), 130, 'closer than that, the end pushes the middle along');
  L.setHandle(c, 'p1', { x: 300, y: 0 }, {});
  T.eq(at(c), 160, 'and it springs back when the end goes back');
  T.ok(tz(c).includes('(4,0) -- (4,'), tz(c));
  // a Z keeps its middle between the ends
  const z = mk('elbow');
  L.setHandle(z, 'p2', { x: 400, y: 100 }, {});
  T.eq(at(z), 100, 'the middle did not follow the end');
  L.setHandle(z, 'p2', { x: 110, y: 100 }, {});
  T.eq(at(z), 90, 'kept 20 px from the end that came back');
  L.setHandle(z, 'p2', { x: 400, y: 100 }, {});
  T.eq(at(z), 100, 'back where it was put');
  // a middle put nearer than 20 px keeps that distance, no more
  const n = mk('elbow', { x1: 300, y1: 0, x2: 300, y2: 160, dir: 'hh' });
  L.setHandle(n, 'mid', { x: 292, y: 80 }, {});
  L.setHandle(n, 'p1', { x: 296, y: 0 }, {});
  T.eq(at(n), 288, 'kept 8 px clear');
  // moving the whole line moves its middle too
  TD.translate(z, 50, 0);
  T.eq(at(z), 150);
  // an attached end follows its shape, the middle stays
  TD.app.newDoc('Elbow keeps', null, null, null, null, 'board');
  const R = (id, x, y) => ({ ...TD.TYPES.rect.create({ x, y }, TD.state.defaults), id, x, y, w: 100, h: 60 });
  const a = R('ka', 300, 0), b = R('kb', 300, 200);
  const e = mk('elbow', { id: 'ke', x1: 300, y1: 30, x2: 300, y2: 230, dir: 'hh', mc: 200, link1: { id: 'ka', u: 0, v: 0.5 }, link2: { id: 'kb', u: 0, v: 0.5 } });
  TD.state.doc.shapes.push(a, b, e); TD.app.render();
  TD.state.sel = new Set(['kb']); TD.app.nudge ? TD.app.nudge(80, 0) : (TD.translate(b, 80, 0), TD.app.render());
  const e2 = TD.state.doc.shapes.find((s) => s.id === 'ke');
  T.eq(e2.x2, 380, 'the end followed its shape');
  T.eq(TD.elbowMid(e2), 200, 'the middle stayed');
});

T.test('Lines: an elbow alone can be flipped but not rotated', () => {
  TD.app.newDoc('Elbow no turn', null, null, null, null, 'board');
  const e = mk('elbow', { id: 'nt' });
  TD.state.doc.shapes.push(e); TD.state.sel = new Set(['nt']); TD.app.render(); TD.app.renderProps();
  const before = JSON.stringify(TD.state.doc.shapes.find((s) => s.id === 'nt'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, metaKey: true, bubbles: true }));
  T.eq(JSON.stringify(TD.state.doc.shapes.find((s) => s.id === 'nt')), before, '⌘R leaves it as it is');
  T.ok(!/rotate,/.test(document.querySelector('#props').textContent), 'the panel hint offers flip, not rotate');
  // a straight line still turns
  const l = mk('line', { id: 'nt2' });
  TD.state.doc.shapes.push(l); TD.state.sel = new Set(['nt2']); TD.app.render(); TD.app.renderProps();
  T.ok(/rotate, flip/.test(document.querySelector('#props').textContent), 'a straight line can be rotated');
});

T.test('Lines: the curvature pen passes through its points; corners and straight runs', () => {
  const P = TD.TYPES.poly;
  const mkc = (pts, o = {}) => ({ ...P.create({ x: 0, y: 0 }, { width: 1, dash: 'solid' }), pts, smooth: true, curv: true, id: 'cv', ...o });
  // four points on a square, closed: a circle (the handles 0.39 of a chord)
  const ring = mkc([[0, -100], [100, 0], [0, 100], [-100, 0]], { closed: true });
  const r = P.samples(ring).map((q) => Math.hypot(q.x, q.y));
  T.ok(Math.min(...r) > 99 && Math.max(...r) < 101, 'round: ' + Math.min(...r) + '..' + Math.max(...r));
  const code = P.tikz(ring, TD.makeTikzContext());
  T.ok(/\.\. controls .* \.\. cycle;$/.test(code), code);
  // the curve passes through every point
  const open = mkc([[0, 0], [100, -80], [200, 0], [300, -80]]);
  const S = P.samples(open);
  for (const p of open.pts) T.ok(S.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 1e-6), 'through ' + p);
  // a smooth point's handles are in line; a corner's are not
  const segs = TD.polySegs(open.pts.map((p) => ({ x: p[0], y: p[1] })), open);
  const cross = (g0, g1, p) => (p.x - g0[1].x) * (g1[0].y - p.y) - (p.y - g0[1].y) * (g1[0].x - p.x);
  T.ok(Math.abs(cross(segs[0], segs[1], { x: 100, y: -80 })) < 1e-6, 'smooth point');
  const cor = { ...open, corner: [0, 1, 0, 0] };
  const sc = TD.polySegs(cor.pts.map((p) => ({ x: p[0], y: p[1] })), cor);
  T.ok(Math.abs(cross(sc[0], sc[1], { x: 100, y: -80 })) > 1, 'corner point');
  // two corners in a row (or a corner and an end) make a straight segment, written with --
  T.ok(P.tikz({ ...open, corner: [0, 1, 1, 0] }, TD.makeTikzContext()).includes(' -- '), 'straight run');
  // a smooth point's tangent is that of the circle through it and its neighbours (as Photoshop's)
  const tri = mkc([[0, 0], [100, -100], [300, 0]]), tg = TD.polySegs(tri.pts.map((p) => ({ x: p[0], y: p[1] })), tri);
  const cx = 150, cy = 50; // the circle through the three points
  const hv = { x: tg[1][0].x - 100, y: tg[1][0].y + 100 };
  T.ok(Math.abs(hv.x * (100 - cx) + hv.y * (-100 - cy)) < 1e-6 * Math.hypot(hv.x, hv.y) * 200, 'tangent to the circle');
  // the + on a segment sits on the curve, and adding a point there keeps the shape
  const before = P.samples(open).length;
  T.ok(before > open.pts.length, 'sampled along the curve');
});
