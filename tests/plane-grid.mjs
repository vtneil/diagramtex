// src/ui/plane-grid.ts: the grid on span{u1, u2}. Upright, it draws what the block editors drew before it took over
// their copies; skewed (a layer of a 3D picture), its lines run along the plane's axes and a point snaps to the
// nearest grid point of that plane.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/ui/plane-grid.ts'], bundle: true, write: false, format: 'esm' });
const { planeGrid, uprightPlane, planeToScreen, screenToPlane, snapOnPlane } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

// the editors' own grid, as each of them drew it
function old(W, H, v, GRID = 0.25) {
  const k = v.k, step = k * GRID >= 7 ? GRID : 1, xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor((v.oy - H) / k / step), ye = Math.ceil(v.oy / k / step);
  let minor = '', major = '';
  for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
  for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy - j * step * k) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
  return { minor, major };
}
const paths = (svg) => ({ minor: /d="([^"]*)" class="cz-gmin"/.exec(svg)[1], major: /d="([^"]*)" class="cz-gmaj"/.exec(svg)[1] });
for (const v of [{ ox: 100, oy: 200, k: 60 }, { ox: -37.3, oy: 412.8, k: 20 }, { ox: 640, oy: -15, k: 160 }, { ox: 3, oy: 3, k: 27.9 }]) {
  const svg = planeGrid(uprightPlane(v.ox, v.oy, v.k), 800, 500);
  assert.deepEqual(paths(svg), old(800, 500, v), 'upright: the same lines as before at ' + JSON.stringify(v));
  assert.ok(svg.startsWith('<rect width="800" height="500" class="cz-bg"/>'), 'the background first');
  assert.ok(svg.includes(`class="cz-origin" d="M${Math.round((v.ox - 6) * 100) / 100},`), 'the origin cross');
}
assert.ok(!planeGrid(uprightPlane(0, 0, 60), 100, 100, { bg: false, origin: false }).includes('cz-bg'), 'no background when asked');
assert.ok(!planeGrid(uprightPlane(0, 0, 60), 100, 100, { origin: false }).includes('cz-origin'), 'no origin when asked');

// a skewed plane: x along 37°, y along −12° (tikz-network's 3D axes), 60 px per unit, origin at (300, 200)
const deg = Math.PI / 180, P = { o: [300, 200], u1: [60 * Math.cos(37 * deg), -60 * Math.sin(37 * deg)], u2: [60 * Math.cos(-12 * deg), -60 * Math.sin(-12 * deg)] };
for (const [a, b] of [[0, 0], [1.25, -2], [-3, 0.5]]) {
  const [X, Y] = planeToScreen(P, a, b), back = screenToPlane(P, X, Y);
  assert.ok(Math.abs(back[0] - a) < 1e-9 && Math.abs(back[1] - b) < 1e-9, 'screen and plane points round-trip');
}
const sn = snapOnPlane(P, ...planeToScreen(P, 1.1, -0.62), 0.25);
assert.deepEqual(sn.at.map((n) => Math.round(n * 1000) / 1000), [1, -0.5], 'snaps to the nearest grid point of the plane');
assert.ok(Math.hypot(sn.screen[0] - planeToScreen(P, 1, -0.5)[0], sn.screen[1] - planeToScreen(P, 1, -0.5)[1]) < 1e-9, 'and says where that is on screen');
const skew = planeGrid(P, 800, 500), maj = paths(skew).major;
const segs = [...maj.matchAll(/M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
assert.ok(segs.length > 4, 'major lines drawn');
for (const [x0, y0, x1, y1] of segs) {
  const d = [x1 - x0, y1 - y0], along = (u) => Math.abs(d[0] * u[1] - d[1] * u[0]) / (Math.hypot(...d) * Math.hypot(...u)) < 1e-3;
  assert.ok(along(P.u1) || along(P.u2), 'each line runs along one of the plane\'s axes');
}
assert.ok(segs.some(([x0, y0, x1, y1]) => Math.abs((x1 - x0) * (200 - y0) - (y1 - y0) * (300 - x0)) / Math.hypot(x1 - x0, y1 - y0) < 0.05), 'a major line through the origin');
const cross = /class="cz-origin" d="([^"]*)"/.exec(skew)[1].match(/-?[\d.]+/g).map(Number);
assert.equal(cross.length, 8, 'the origin: an arm along each axis');
assert.ok(Math.abs((cross[3] - cross[1]) / (cross[2] - cross[0]) - P.u1[1] / P.u1[0]) < 0.01, 'its first arm along x');
// seen edge on: only the background
assert.equal(planeGrid({ o: [0, 0], u1: [10, 0], u2: [20, 0] }, 100, 100), '<rect width="100" height="100" class="cz-bg"/>');
// steps: the finest whose lines lie 7 px apart, else the last
assert.ok(paths(planeGrid(uprightPlane(0, 0, 4), 100, 100, { steps: [0.25, 1, 5] })).minor === '', 'very far out: every 5 units, all major');
console.log('Plane grid checks passed');
