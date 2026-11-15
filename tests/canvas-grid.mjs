import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/ui/canvas-grid.ts'], bundle: true, write: false, format: 'esm' });
const { snapCanvasGrid } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const g = 10, pitch = Math.sqrt(3) * g / 2;
for (const style of ['grid', 'dot']) assert.deepEqual(snapCanvasGrid({ x: 14, y: -16 }, g, style), { x: 10, y: -20 });
for (const style of ['isometric', 'isometric-dot']) {
  for (let column = -5; column <= 5; column++) for (let row = -5; row <= 5; row++) {
    const p = { x: column * pitch, y: row * g + ((column % 2 + 2) % 2) * g / 2 };
    const q = snapCanvasGrid({ x: p.x + 1, y: p.y - 1 }, g, style);
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1e-9, 'snaps to visible positive and negative lattice vertices');
  }
  for (let x = -21; x <= 21; x += 2) for (let y = -21; y <= 21; y += 2) {
    const q = snapCanvasGrid({ x, y }, g, style), distance = Math.hypot(q.x - x, q.y - y);
    for (let c = -4; c <= 4; c++) for (let r = -4; r <= 4; r++) assert.ok(distance <= Math.hypot(c * pitch - x, r * g + ((c % 2 + 2) % 2) * g / 2 - y) + 1e-9, 'nearest lattice vertex');
  }
}
console.log('Canvas grid snapping checks passed');
