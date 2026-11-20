// Basic 3D solids: every kind in the Shape list draws, exports plain TikZ, and keeps to the sizes typed.
const KINDS = ['box', 'cube', 'cylinder', 'cone', 'frustum', 'tube', 'sphere', 'hemisphere', 'cap', 'ellipsoid', 'torus',
  'prism', 'hexprism', 'pyramid', 'tetra', 'octa', 'swedge', 'axes'];
const make = (kind) => { const s = TD.TYPES.prim3d.create({ x: 0, y: 0 }, {}, 'prim3d:' + kind); s.w = s._pw; s.h = s._ph; delete s._pw; delete s._ph; s.id = 'x'; return s; };

T.test('3D solids: every kind draws and exports TikZ without a failure', () => {
  for (const k of KINDS) {
    const s = make(k), r = TD.TYPES.prim3d.run(s);
    T.ok(!r.error, k + ': ' + r.error);
    const X = { pkgs: new Set(), libs: new Set(), opts: {} };
    const code = TD.TYPES.prim3d.tikz(s, TD.makeTikzContext ? TD.makeTikzContext() : X);
    T.ok(typeof code === 'string' && code.length > 20, k + ' exports code');
    T.ok(!/NaN|Infinity|undefined/.test(code), k + ' has no NaN in its code');
    T.ok(TD.TYPES.prim3d.svg(s, { export: true }).includes('<'), k + ' draws');
  }
});

T.test('3D solids: shapes with a derived size', () => {
  const ext = (k, set) => { const s = { ...make(k), ...set }; return TD.TYPES.prim3d.run(s).items; };
  T.ok(ext('tetra', { a: '2' }).length > 0, 'a regular tetrahedron from its edge');
  T.ok(ext('cap', { a: '1', c: '2' }).length > 0, 'a cap as tall as the sphere is across');
  T.ok(ext('cap', { a: '1', c: '5' }).length > 0, 'a cap taller than the sphere is limited, not broken');
  T.ok(ext('tube', { a: '1', r2: '5' }).length > 0, 'an inner radius past the outer one is limited');
  T.ok(ext('torus', { a: '1', r2: '3' }).length > 0, 'a tube thicker than the ring is limited');
});

T.test('3D solids: the Shape menu is a grid of pictures, without 3D axes', async () => {
  TD.app.newDoc('Solid menu', null, null, null, null, 'board');
  const s = make('cone'); s.id = 'solidMenu'; TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render(); TD.app.renderProps();
  const sel = document.querySelector('#props select[data-p="kind"]');
  T.ok(![...sel.options].some((o) => o.value === 'axes'), '3D axes is no longer offered');
  sel.focus(); const key = (k) => sel.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('ArrowDown');
  const menu = document.querySelector('.selmenu');
  try {
    T.ok(!menu.hidden && menu.classList.contains('pics'), 'opens as a picture grid');
    const tiles = [...menu.querySelectorAll('.selmenu-item')];
    T.eq(tiles.length, sel.options.length);
    T.ok(tiles.every((t) => t.querySelector('svg .a1') && t.textContent.trim()), 'every tile has a picture and a name');
    T.ok(tiles.every((t) => t.classList.contains('tile') && t.getAttribute('role') === 'option'), 'the tiles are the kit\'s Tile, as options of the list');
    T.ok(menu.querySelector('.selmenu-item.on').getAttribute('aria-selected') === 'true', 'the current one is the selected option');
    T.ok(tiles.every((t) => { const a = t.getBoundingClientRect(), p = t.querySelector('svg').getBoundingClientRect(); return Math.abs(p.left + p.width / 2 - (a.left + a.width / 2)) < 0.5; }), 'every picture is centred in its tile');
    const cur = menu.querySelector('.selmenu-item.on');
    T.eq(getComputedStyle(cur).borderTopColor, getComputedStyle(document.body).color, 'the current one keeps its ink edge, highlighted or not');
    T.ok(menu.querySelector('.selmenu-item.on').textContent.includes('Cone'), 'the current shape is marked');
    const across = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length;
    T.eq(across, 4, 'four across');
    const hi = () => +menu.querySelector('.selmenu-item.hi').dataset.i, at = hi();
    key('ArrowRight'); T.eq(hi(), at + 1, '→ next tile');
    key('ArrowDown'); T.eq(hi(), at + 1 + across, '↓ the row below');
    key('Enter');
    T.ok(menu.hidden, 'picking closes it');
    await new Promise((r) => setTimeout(r, 200)); // it fades out
    T.eq(getComputedStyle(menu).display, 'none', 'and the grid goes from the screen, not just its flag');
    T.eq(TD.state.doc.shapes.find((x) => x.id === s.id).kind, sel.options[at + 1 + across]?.value || 'tube', 'Enter picks it');
  } finally { if (!menu.hidden) key('Escape'); }
  // a solid saved as 3D axes still shows its kind
  const ax = make('axes'); ax.id = 'solidAxes'; TD.state.doc.shapes.push(ax); TD.state.sel = new Set([ax.id]); TD.app.render(); TD.app.renderProps();
  T.eq(document.querySelector('#props select[data-p="kind"]').value, 'axes', 'an existing 3D axes keeps its entry');
});

// seen from straight above, the base of a prism is its true polygon
T.test('3D solids: a prism or pyramid base has equal sides, or the sides typed', () => {
  const top = (k, set) => {
    const r = TD.TYPES.prim3d.run({ ...make(k), view: [30, 90], hiddenEdges: false, axes: false, ...set });
    T.ok(!r.error, k + ': ' + r.error);
    // the largest filled polygon is the top face
    const polys = r.items.filter((i) => i.pts && i.pts.length >= 3 && i.k !== 'line');
    const area = (p) => Math.abs(p.reduce((m, q, i) => m + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
    return polys.sort((a, b) => area(b.pts) - area(a.pts))[0].pts;
  };
  const sides = (p) => p.map((q, i) => Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]));
  const equal = (l) => Math.max(...l) - Math.min(...l) < 1e-3 * Math.max(...l);
  for (const [k, n] of [['hexprism', 6], ['prism', 5], ['prism', 3], ['prism', 8]]) {
    const l = sides(top(k, { n: String(n) }));
    T.eq(l.length, n, k + ' ' + n + ' corners');
    T.ok(equal(l), k + ' ' + n + ' sides are equal: ' + l.join(', '));
  }
  const l = sides(top('prism', { n: '4', sl: '1, 2, 1, 2' }));
  T.ok(Math.abs(l[1] / l[0] - 2) < 1e-3 && Math.abs(l[3] / l[2] - 2) < 1e-3 && Math.abs(l[0] - l[2]) < 1e-3, 'side lengths 1, 2, 1, 2 give a 1 : 2 rectangle');
  T.ok(TD.TYPES.prim3d.run({ ...make('prism'), n: '4', sl: '1, 5, 1, 1' }).error, 'a side longer than the rest together is refused');
  T.ok(!TD.TYPES.prim3d.run({ ...make('hexprism'), sl: '1, 2, 3, 2' }).error, 'a short list leaves the rest regular');
});

T.test('3D solids: the name sits above the solid, not on it', () => {
  for (const k of ['box', 'hexprism', 'cylinder', 'sphere', 'pyramid', 'torus']) {
    const r = TD.TYPES.prim3d.run({ ...make(k), name: 'hello' });
    const t = r.items.find((i) => i.k === 'text' && i.text === 'hello');
    T.ok(t && t.push[1] > 0, k + ' name is pushed up');
    const ys = r.items.flatMap((i) => (i.k === 'poly' || i.pts ? i.pts.map((p) => p[1]) : i.k === 'ball' ? [i.at[1] + i.r] : []));
    T.ok(ys.length && t.at[1] >= Math.max(...ys) - 1e-6, k + ' name is anchored at the top of the outline');
  }
});

T.test('3D solids: a bottom label sits below the solid', () => {
  for (const k of ['box', 'hexprism', 'sphere']) {
    const r = TD.TYPES.prim3d.run({ ...make(k), name: 'top', nameBelow: 'bottom' });
    const up = r.items.find((i) => i.text === 'top'), dn = r.items.find((i) => i.text === 'bottom');
    T.ok(up && dn && dn.push[1] < 0 && up.at[1] > dn.at[1], k + ': top above bottom');
    const ys = r.items.flatMap((i) => (i.pts ? i.pts.map((p) => p[1]) : i.k === 'ball' ? [i.at[1] - i.r] : []));
    T.ok(dn.at[1] <= Math.min(...ys) + 1e-6, k + ': bottom label under the outline');
  }
});

T.test('solid of revolution: a sweep outside 10–360° is reported, not quietly changed', () => {
  const s = TD.TYPES.revolve.create({ x: 0, y: 0 }, TD.state.defaults, 'revolve');
  Object.assign(s, { w: 300, h: 200 });
  for (const v of ['-90', '0', '400']) {
    s.sweep = v;
    const rows = TD.panels.revolve.model(s).sections.flatMap((x) => x.rows || x.items || []);
    T.ok(rows.some((r) => r.kind === 'error' && /10° to 360°/.test(r.text)), `the panel says so for ${v}`);
    T.ok(/10° to 360°/.test(TD.TYPES.revolve.tikz(s, {})), `and the code does not draw ${v} as 10°`);
  }
  s.sweep = '270';
  T.ok(!TD.panels.revolve.model(s).sections.flatMap((x) => x.rows || x.items || []).some((r) => r.kind === 'error'), '270 is fine');
});
