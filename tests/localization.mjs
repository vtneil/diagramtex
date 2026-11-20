import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const defaults = new Map();
const errors = [];
const tags = s => [...s.matchAll(/<\/?(kbd|b|strong)>/g)].map(m => m[0]).sort().join('');
const placeholders = s => [...new Set([...s.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m => m[1]))].sort().join(',');
for (const file of walk(path.join(root, 'src')).filter(f => /\.(ts|svelte)$/.test(f) && !f.endsWith('/th.ts') && !f.includes('/i18n/th/'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  // Svelte expressions are scanned separately because markup isn't TypeScript.
  const text = source.text;
  const re = /\b(?:t|uiText|message|msg)\(\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))\s*,\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))/g;
  for (const m of text.matchAll(re)) {
    const literal = value => ts.createSourceFile('literal.ts', value, ts.ScriptTarget.Latest).statements[0].expression.text;
    const id = literal(m[1]), fallback = literal(m[2]);
    if (defaults.has(id) && defaults.get(id) !== fallback) errors.push(`${file}: conflicting English defaults for ${id}`);
    defaults.set(id, fallback);
  }
}
const catalogs = [path.join(root, 'src/i18n/th.ts'), ...fs.readdirSync(path.join(root, 'src/i18n/th')).map((f) => path.join(root, 'src/i18n/th', f))];
const seenThai = new Set();
// shape.<type> ids name a TYPES key (src/i18n/shapes.ts typeName); collect the keys the domain registers
const shapeTypes = new Set(), blockTypes = new Set();
for (const file of walk(path.join(root, 'src/domain'))) for (const m of fs.readFileSync(file, 'utf8').matchAll(/TD\.blocks\.register\(\s*['"]([^'"]+)['"]/g)) blockTypes.add(m[1]);
for (const file of walk(path.join(root, 'src/domain'))) for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bT(?:YPES)?\.([A-Za-z_$][\w$]*)\s*=|\bT(?:YPES)?\[['"]([^'"]+)['"]\]\s*=/g)) shapeTypes.add(m[1] || m[2]);
function visit(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) {
    const id = node.name.text, value = node.initializer.text;
    if (seenThai.has(id)) errors.push(`Thai id defined twice: ${id}`);
    seenThai.add(id);
    if (id.startsWith('block.')) { const [, type, part] = id.split('.'); if (!blockTypes.has(type) || !/^(label|title)$/.test(part)) errors.push(`Thai caption for an unknown block or part: ${id}`); return; }
    // the Circuit palette's parts and groups: read by id from the registry (checked against it in tests/suites/97-localization.js)
    if (id.startsWith('czpart.') || id.startsWith('czcat.')) return;
    if (id.startsWith('shape.')) { if (!shapeTypes.has(id.slice(6))) errors.push(`Thai name for an unknown shape type: ${id}`); else if (placeholders(value)) errors.push(`Placeholder in a shape name: ${id}`); return; }
    if (!defaults.has(id)) errors.push(`Unreferenced Thai id: ${id}`);
    else if (placeholders(value) !== placeholders(defaults.get(id))) errors.push(`Placeholder mismatch: ${id}`);
    else if (tags(value) !== tags(defaults.get(id))) errors.push(`Markup mismatch (kbd/b/strong): ${id}`);
  }
  ts.forEachChild(node, visit);
}
for (const f of catalogs) visit(ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true));
// every caption has its Thai, except content shown as written in both languages: package and program names, units,
// a placeholder reading, and the kit catalogue's demo page
const ASIS = new Set(['ui.diagramtex', 'ui.latex', 'ui.cm', 'ui.x.0.00.y.0.00.cm', 'ui.circuitikz', 'ui.tikz.automata', 'ui.forest', 'ui.tikz.feynman',
  'ui.tikz.3dplot', 'ui.tikz.timing', 'ui.pgf.umlsd', 'ui.zx.calculus', 'editor.xy.title', 'ui.reset']);
for (const id of defaults.keys()) if (!seenThai.has(id) && !ASIS.has(id) && !/\.lang$/.test(id)) errors.push(`No Thai for: ${id} ("${defaults.get(id)}")`);
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Localization catalog: ${defaults.size} message ids checked`);

// Exercise the public contract independently of DOM/controller setup.
const { build } = await import('esbuild');
const bundle = await build({ entryPoints: [path.join(root, 'src/i18n/index.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
api.locale.set('th');
assert(api.t('missing.caption', 'English {name}', { name: '$& <script>' }) === 'English $& <script>', 'fallback and literal substitution');
assert(api.t('hint.moved', 'Moved "{name}" to {folder}', { name: 'Copy', folder: 'Delete' }) === 'ย้าย "Copy" ไปยัง Delete', 'named Thai placeholders');
for (const value of ['Copy', 'Name', 'Delete', 'x^2', '\\draw', 'ui.copy']) assert(api.caption(value) === value, 'content must remain verbatim: ' + value);
assert(api.caption(api.message('ui.copy', 'Copy')) === 'คัดลอก', 'explicit caption');
let calls = 0;
const dispose = api.onLocale(() => calls++);
api.locale.set('en'); dispose(); api.locale.set('th');
assert(calls === 2, 'refresh runs once, on change, and disposes');
api.locale.set('en');

// First access follows only the primary browser language; saved choices always win.
const previousGlobals = Object.fromEntries(['navigator', 'localStorage', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  for (const [languages, language, saved, expected] of [
    [['th-TH', 'en-US'], 'th-TH', null, 'th'],
    [['th'], 'th', null, 'th'],
    [['TH-th'], 'TH-th', null, 'th'],
    [['en-GB', 'th-TH'], 'en-GB', null, 'en'],
    [['fr-FR', 'th-TH'], 'fr-FR', null, 'en'],
    [[], 'th-TH', null, 'th'],
    [[], '', null, 'en'],
    [['th-TH'], 'th-TH', 'en', 'en'],
    [['en-US'], 'en-US', 'th', 'th'],
    [['th-TH'], 'th-TH', 'invalid', 'th'],
  ]) {
    let stored = saved;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages, language } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => stored, setItem: (key, value) => { stored = value; },
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'en' } } });
    api.restoreLocale();
    let actual; const unsubscribe = api.locale.subscribe(value => { actual = value; }); unsubscribe();
    assert(actual === expected, `browser ${languages.join(',')} / ${language}, saved ${saved}: ${actual} should be ${expected}`);
    assert(document.documentElement.lang === expected, 'document language follows the chosen locale');
    assert(stored === expected, 'initial language is remembered');
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['th-TH'], language: 'th-TH' } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); },
  } });
  api.restoreLocale();
  assert(document.documentElement.lang === 'th', 'Thai browser preference works when storage is blocked');
} finally {
  for (const [key, descriptor] of Object.entries(previousGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  api.locale.set('en');
}
console.log('Browser language preference: Thai detection, English fallback, saved choice and blocked storage checked');
