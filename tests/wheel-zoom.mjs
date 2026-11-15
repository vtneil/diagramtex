import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/ui/wheel-zoom.ts'], bundle: true, write: false, format: 'esm' });
const { wheelZoomFactor } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const factor = (deltaY, deltaMode = 0) => wheelZoomFactor({ deltaY, deltaMode });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);

near(factor(0), 1);
assert.ok(factor(-1) > 1 && factor(-1) < factor(-10));
// Small pixel deltas from trackpad gestures retain the original zoom response.
for (const delta of [-10, -2, -0.5, 0.5, 2, 10]) {
  near(factor(delta), Math.exp(-delta * 0.01));
}
near(factor(3, 1), factor(48));
near(factor(0.1, 2), factor(80));
for (const mode of [0, 1, 2]) {
  near(factor(-10000, mode), 1.25);
  near(factor(10000, mode), 0.8);
  near(factor(10, mode) * factor(-10, mode), 1);
}
// Editor keyboard shortcuts synthesize a wheel event for their existing 25% step.
near(factor(-100 * Math.log(1.25)), 1.25);
near(factor(100 * Math.log(1.25)), 0.8);
near(factor(NaN), 1);
near(factor(Infinity), 1);
console.log('Wheel zoom checks passed');
