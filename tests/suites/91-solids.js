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

T.test('3D solids: the Shape menu is a grid of pictures, without 3D axes', () => {
  TD.app.newDoc('Solid menu', null, null, null, null, 'board');
  const s = make('cone'); s.id = 'solidMenu'; TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render(); TD.app.renderProps();
  const sel = document.querySelector('#props select[data-p="kind"]');
  T.eq(sel.dataset.pics, 'solid');
  T.ok(![...sel.options].some((o) => o.value === 'axes'), '3D axes is no longer offered');
  sel.focus(); const key = (k) => sel.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('ArrowDown');
  const menu = document.querySelector('.selmenu');
  try {
    T.ok(!menu.hidden && menu.classList.contains('pics'), 'opens as a picture grid');
    const tiles = [...menu.querySelectorAll('.selmenu-item')];
    T.eq(tiles.length, sel.options.length);
    T.ok(tiles.every((t) => t.querySelector('svg .a1') && t.textContent.trim()), 'every tile has a picture and a name');
    T.ok(menu.querySelector('.selmenu-item.on').textContent.includes('Cone'), 'the current shape is marked');
    const across = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length;
    T.eq(across, 4, 'four across');
    const hi = () => +menu.querySelector('.selmenu-item.hi').dataset.i, at = hi();
    key('ArrowRight'); T.eq(hi(), at + 1, '→ next tile');
    key('ArrowDown'); T.eq(hi(), at + 1 + across, '↓ the row below');
    key('Enter');
    T.eq(getComputedStyle(menu).display, 'none', 'picking closes the grid on screen, not just in its flag');
    T.eq(TD.state.doc.shapes.find((x) => x.id === s.id).kind, sel.options[at + 1 + across]?.value || 'tube', 'Enter picks it');
  } finally { if (!menu.hidden) key('Escape'); }
  // a solid saved as 3D axes still shows its kind
  const ax = make('axes'); ax.id = 'solidAxes'; TD.state.doc.shapes.push(ax); TD.state.sel = new Set([ax.id]); TD.app.render(); TD.app.renderProps();
  T.eq(document.querySelector('#props select[data-p="kind"]').value, 'axes', 'an existing 3D axes keeps its entry');
});
