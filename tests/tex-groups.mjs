// The shared brace helpers (src/domain/tex-groups.ts): outer braces come off only when they are one group round the
// whole value, so `{a}{b}` keeps its braces (the five readers that matched only the first and last character turned
// it into `a}{b`).
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/domain/tex-groups.ts'], bundle: true, write: false, format: 'esm' });
const { closeBrace, unbrace, unbraceOnce } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

assert.equal(closeBrace('{a}', 0), 2);
assert.equal(closeBrace('{a{b}c}d', 0), 6);
assert.equal(closeBrace('{a\\}b}', 0), 5, 'an escaped brace is text');
assert.equal(closeBrace('{a', 0), -1, 'unclosed');

for (const f of [unbrace, unbraceOnce]) {
  assert.equal(f('{a}'), 'a');
  assert.equal(f('  { a b }  '), 'a b', 'trimmed inside and out');
  assert.equal(f('{a}{b}'), '{a}{b}', 'two groups keep their braces');
  assert.equal(f('{a} b {c}'), '{a} b {c}');
  assert.equal(f('{\\{}'), '\\{', 'an escaped brace inside');
  assert.equal(f('\\{a\\}'), '\\{a\\}', 'escaped braces are not a group');
  assert.equal(f('{a'), '{a', 'unclosed');
  assert.equal(f('a'), 'a');
  assert.equal(f(''), '');
  assert.equal(f(null), '');
  assert.equal(f(undefined), '');
  assert.equal(f(2), '2');
}
assert.equal(unbraceOnce('{{a}}'), '{a}', 'one layer');
assert.equal(unbrace('{{ {a} }}'), 'a', 'every layer');
assert.equal(unbrace('{{a}{b}}'), '{a}{b}', 'stops at two groups');

console.log('✓ tex-groups: braces come off only round the whole value');
