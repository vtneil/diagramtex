// The block editors' shared fit (src/editors/editor-stage.ts fitView) gives the camera each editor's own fit gave
// before it was shared: drawings with y down and y up, a minimum size about the centre, room kept under the drawing,
// and the zoom kept within its limits.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/editors/editor-stage.ts'], bundle: true, write: false, format: 'esm' });
const { fitView } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const near = (a, b, what) => {
  for (const key of ['k', 'ox', 'oy']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${what}: ${key} ${a[key]} ≠ ${b[key]}`);
};
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
const areas = [{ width: 900, height: 600 }, { width: 420, height: 700 }, { width: 1600, height: 300 }];
const boxes = [{ x: -30, y: -80, w: 240, h: 120 }, { x: 10, y: 5, w: 4, h: 3 }, { x: -500, y: 200, w: 1200, h: 50 }];
const PX = 28.45;

for (const r of areas) for (const bb of boxes) {
  // bit-field / K-map: y down, in points, a margin in cm
  {
    const w = bb.w / PX + 0.8, h = bb.h / PX + 0.8;
    const k = clamp(20, 160, Math.min((r.width - 80) / w, (r.height - 80) / h));
    const cx = (bb.x + bb.w / 2) / PX, cy = (bb.y + bb.h / 2) / PX;
    near(fitView(r, bb, { scale: PX, margin: 0.4, min: 20, max: 160 }), { k, ox: r.width / 2 - cx * k, oy: r.height / 2 - cy * k }, 'y down');
  }
  // state machine, graph, UML: written with y up (cy negated, oy added)
  {
    const w = bb.w / PX + 1, h = bb.h / PX + 1;
    const k = clamp(20, 220, Math.min((r.width - 80) / w, (r.height - 80) / h));
    const cx = (bb.x + bb.w / 2) / PX, cy = -(bb.y + bb.h / 2) / PX;
    near(fitView(r, bb, { scale: PX, margin: 0.5, min: 20, max: 220 }), { k, ox: r.width / 2 - cx * k, oy: r.height / 2 + cy * k }, 'y up');
  }
  // timing: room for the add-row buttons under the drawing
  {
    const w = bb.w / PX + 2, h = bb.h / PX + 2;
    const k = clamp(6, 80, Math.min((r.width - 80) / w, (r.height - 80 - 44) / h));
    const cx = (bb.x + bb.w / 2) / PX, cy = -(bb.y + bb.h / 2) / PX;
    near(fitView(r, bb, { scale: PX, margin: 1, min: 6, max: 80, below: 44 }), { k, ox: r.width / 2 - cx * k, oy: r.height / 2 + cy * k - 22 }, 'below');
  }
  // chemistry: in its own units, a wider pad
  {
    const k = clamp(0.5, 4, Math.min((r.width - 120) / bb.w, (r.height - 120) / bb.h));
    near(fitView(r, bb, { pad: 120, min: 0.5, max: 4 }), { k, ox: r.width / 2 - (bb.x + bb.w / 2) * k, oy: r.height / 2 - (bb.y + bb.h / 2) * k }, 'pad');
  }
  // circuit: y up, at least 2 cm each way about the centre
  {
    const b = { x1: bb.x / PX, y1: bb.y / PX, x2: (bb.x + bb.w) / PX, y2: (bb.y + bb.h) / PX };
    const w = Math.max(b.x2 - b.x1, 2), h = Math.max(b.y2 - b.y1, 2);
    const k = clamp(20, 110, Math.min((r.width - 80) / w, (r.height - 80) / h));
    const cx = (b.x1 + b.x2) / 2, cy = -(b.y1 + b.y2) / 2;
    near(fitView(r, { x: cx - w / 2, y: cy - h / 2, w, h }, { min: 20, max: 110 }),
      { k, ox: r.width / 2 - ((b.x1 + b.x2) / 2) * k, oy: r.height / 2 + ((b.y1 + b.y2) / 2) * k }, 'minimum size');
  }
  // physics: y up, corners x0..x1, y0..y1, half a unit round
  {
    const b = { x0: bb.x / PX, y0: bb.y / PX, x1: (bb.x + bb.w) / PX, y1: (bb.y + bb.h) / PX };
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const k = clamp(16, 160, Math.min((r.width - 80) / w, (r.height - 80) / h));
    near(fitView(r, { x: b.x0, y: -b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0 }, { margin: 0.5, min: 16, max: 160 }),
      { k, ox: r.width / 2 - ((b.x0 + b.x1) / 2) * k, oy: r.height / 2 + ((b.y0 + b.y1) / 2) * k }, 'corners');
  }
}
// the zoom stays within its limits
assert.equal(fitView({ width: 900, height: 600 }, { x: 0, y: 0, w: 0.001, h: 0.001 }, { min: 1, max: 5 }).k, 5);
assert.equal(fitView({ width: 900, height: 600 }, { x: 0, y: 0, w: 1e6, h: 1e6 }, { min: 1, max: 5 }).k, 1);

console.log('[PASSED] editor-stage: the shared fit matches each editor\'s own');
