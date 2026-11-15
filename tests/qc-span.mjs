import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/editors/qc-span.ts'], bundle: true, write: false, format: 'esm' });
const { isSwapGate, boundedSpan } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const opts = (s) => ({ list: s.split(',').map((x) => x.trim()) });
for (const option of ['2,swap', 'swap, wires=8', 'swap']) {
  assert.equal(isSwapGate({ name: 'gate', o: [option] }, opts), true);
}
for (const name of ['meter', 'lstick', 'rstick', 'midstick']) {
  assert.equal(isSwapGate({ name, o: ['2,swap'] }, opts), false);
}
assert.equal(isSwapGate({ name: 'gate', o: [] }, opts), false);
const free = () => true;
assert.equal(boundedSpan(0, 99, 1, 4, free), 4, 'cannot exceed circuit');
assert.equal(boundedSpan(3, 99, 1, 4, free), 1, 'last wire');
assert.equal(boundedSpan(0, 0, 3, 4, free), 1, 'shrink to one wire');
assert.equal(boundedSpan(1, 4, 1, 6, (r) => r !== 3), 2, 'stop before occupied cell');
assert.equal(boundedSpan(0, 4, 1, 4, () => false), 1, 'adjacent blocker');
assert.equal(boundedSpan(0, 4, 3, 5, () => false), 3, 'retain existing span');
assert.equal(boundedSpan(0, 2, 3, 5, () => false), 2, 'shrink existing span');
// Exhaust boundary and blocker positions, including a gate away from wire zero.
for (let rows = 1; rows <= 8; rows++) for (let top = 0; top < rows; top++) {
  for (let blocker = top + 1; blocker <= rows; blocker++) {
    assert.equal(boundedSpan(top, 100, 1, rows, (r) => r !== blocker), blocker - top);
  }
}
console.log('Quantum span checks passed');
