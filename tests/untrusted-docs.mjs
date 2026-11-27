// Untrusted documents (share links, opened or pasted files, storage): the pure repair paths keep markup and
// non-numbers out of the fields that are written into SVG and HTML strings.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  stdin: {
    contents: `export { conformShape, conformColour, conformStyleKeys } from './src/core/conform.ts';
      export { stylesOf, sync, STYLE_KEYS } from './src/core/named-styles.ts';
      export { createDocumentFactory } from './src/core/document.ts';
      export { createProjectFiles } from './src/core/project-files.ts';
      export { imageUrl } from './src/platform/download.ts';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm',
});
const M = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`[PASSED] ${name}`); } catch (err) { failed++; console.log(`[FAILED] ${name}\n  ${err.message}`); }
};
const MARKUP = /[<>"'`&]/;
const PAYLOAD = '1"/><img src=x onerror="window.__pwn=1">';

check('text radius becomes a number', () => {
  const s = { id: 'a', type: 'text', x: 0, y: 0, text: 'x', boxed: true, radius: PAYLOAD };
  M.conformShape(s, { type: 'text', x: 0, y: 0, text: '' }, {});
  assert.equal(typeof s.radius, 'number');
});

check('gradient fill: stops rebuilt, markup colours replaced', () => {
  const s = { id: 'a', type: 'rect', fill: { g: 'linear', angle: PAYLOAD, stops: [[0, '#"><svg onload=x>'], 'junk', [1, '#ffffff']], extra: PAYLOAD } };
  M.conformShape(s, { fill: null }, {});
  assert.deepEqual(s.fill, { g: 'linear', angle: 0, stops: [[0, '#000000'], [1, '#ffffff']] });
});

check('pattern fill: kind, sizes and colour safe', () => {
  const s = { id: 'a', type: 'rect', fill: { p: 'ne"><x', size: '6', lw: PAYLOAD, color: '#000"><x' } };
  M.conformShape(s, { fill: null }, {});
  assert.deepEqual(s.fill, { p: 'ne', size: 6, lw: 0.75, color: '#000000' });
});

check('a non-colour value in a colour field falls back', () => {
  const s = { id: 'a', type: 'line', stroke: ['#000'], color: 7 };
  M.conformShape(s, { stroke: '#000000' }, {});
  assert.equal(s.stroke, '#000000'); assert.equal(s.color, null);
  assert.equal(M.conformColour('#12ab34'), '#12ab34'); assert.equal(M.conformColour(null), null);
});

check('named styles: only style fields, with values a shape can hold, and a TikZ name', () => {
  const page = { styles: [
    { id: 's1', name: 'block', keys: { stroke: '#000"><img>', width: PAYLOAD, opacity: '0.5', bold: 'yes', size: 'large', dash: 'p:1 2', font: 'cmr', x: PAYLOAD, text: PAYLOAD, fill: { g: 'radial', stops: [[0, '<b>']] } } },
    { id: 's2', name: 'x}/.style={draw}, evil', keys: {} },
  ] };
  const list = M.stylesOf(page);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].keys, { opacity: 0.5, size: 'large', dash: 'p:1 2', font: 'cmr', fill: { g: 'radial', stops: [[0, '#000000']] } });
  for (const k of Object.keys(list[0].keys)) assert.ok(M.STYLE_KEYS.includes(k), k);
});

check('named styles: syncing a linked shape copies no markup', () => {
  const page = { styles: [{ id: 's1', name: 'block', keys: { stroke: PAYLOAD, x: PAYLOAD, width: 2 } }] };
  const shape = { id: 'a', type: 'line', x: 5, stroke: '#000000', width: 1, style: 's1' };
  M.sync([{ shapes: [shape] }], M.stylesOf(page));
  assert.equal(shape.x, 5); assert.equal(shape.stroke, '#000000'); assert.equal(shape.width, 2);
});

check('kept TikZ code: its drawn shapes are repaired on load, a nested tikz left out', () => {
  const seen = [];
  const make = M.createDocumentFactory({ uid: () => 'u' + seen.length, pageDefaults: {},
    upgrade(sh) { seen.push(sh.type); if (typeof sh.x !== 'number') sh.x = 0; return sh.type !== 'broken'; } });
  const tikz = { id: 't', type: 'tikz', x: 0, y: 0, prev: [{ type: 'rect', x: PAYLOAD }, { type: 'tikz', prev: [] }, { type: 'broken' }, null, 'x'] };
  make('d', [{ type: 'diagram', shapes: [tikz] }]);
  assert.deepEqual(tikz.prev.map((p) => p.type), ['rect']);
  assert.equal(tikz.prev[0].x, 0);
  const bad = { id: 'b', type: 'tikz', x: 0, y: 0, prev: 'oops' };
  make('d', [{ type: 'diagram', shapes: [bad] }]);
  assert.deepEqual(bad.prev, []);
});

check('project file with non-array blocks fails as invalid, not with a TypeError', () => {
  const P = M.createProjectFiles({ rect: {} });
  for (const blocks of [{}, 5, true]) {
    let err = null;
    try { P.parse(JSON.stringify({ app: 'diagramtex', version: 3, blocks })); } catch (e) { err = e; }
    assert.ok(err && err.code === 'invalid', `blocks=${JSON.stringify(blocks)}: ${err && err.message}`);
  }
});

check('image download: only image data, blobs and web addresses', () => {
  const base = 'https://app.example/';
  for (const bad of ['java\tscript:alert(1)', '\x01javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\nscript:x', 'data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc/passwd']) {
    assert.equal(M.imageUrl(bad, base), null, JSON.stringify(bad));
  }
  assert.equal(M.imageUrl('data:image/png;base64,AA', base), 'data:image/png;base64,AA');
  assert.equal(M.imageUrl('img/a.png', base), 'https://app.example/img/a.png');
  assert.equal(M.imageUrl('https://x.example/y.png', base), 'https://x.example/y.png');
  assert.ok(!MARKUP.test(M.imageUrl('https://x.example/"><b>', base)));
});

if (failed) { console.log(`[FAILED] untrusted documents: ${failed} check(s)`); process.exitCode = 1; }
else console.log('[PASSED] untrusted documents');
