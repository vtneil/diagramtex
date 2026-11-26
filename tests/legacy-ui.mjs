// Ratchet for the move to the interface kit (src/ui/kit). Counts hand-written markup for controls the kit now
// provides, and colours and type sizes written into the stylesheets instead of taken from tokens, per file, and fails when any count grows past tests/legacy-ui.json: new code uses the kit, old code
// only shrinks. When a count falls, the baseline is lowered (run with --update) in the same change, so the
// ground gained can't be lost again.
//   node tests/legacy-ui.mjs           check
//   node tests/legacy-ui.mjs --update  write the current counts as the new baseline (only ever lower)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests/legacy-ui.json');
// pattern → the kit piece that replaces it
const PATTERNS = {
  'button-element': { re: /createElement\(\s*['"]button['"]\s*\)/g, use: 'Button / IconButton (src/ui/kit)' },
  'icon-flat-markup': { re: /class="icon flat/g, use: 'IconButton (src/ui/kit)' },
  'primary-markup': { re: /<button class="primary/g, use: 'Button variant="primary" (src/ui/kit)' },
  'inline-svg-icon': { re: /<svg viewBox="0 0 20 20"/g, use: 'Icon / iconSvg() (src/ui/kit/icons.ts)' },
  'ctx-item-markup': { re: /class="ctx-item/g, use: 'the shared context menu (coming in the kit)' },
  'switch-markup': { re: /class="seg[\s"]|seg-ctl/g, use: 'Segmented (src/ui/kit)' },
  'select-element': { re: /<select[\s>]/g, use: 'Select (src/ui/kit)' },
  'text-input': { re: /<input type="text"/g, use: 'TextField / TexField (src/ui/kit)' },
  'number-input': { re: /type="number"/g, use: 'NumberField (src/ui/kit)' },
  'checkbox-input': { re: /type="checkbox"/g, use: 'Checkbox / Switch (src/ui/kit)' },
  'range-input': { re: /type="range"/g, use: 'Slider (src/ui/kit)' },
  'colour-button': { re: /class=["']cbtn/g, use: 'ColourButton (src/ui/kit)' },
  'toolbar-separator': { re: /class="cz-sep/g, use: 'Separator (src/ui/kit)' },
  'style-assignment': { re: /\.style\.[a-zA-Z]+\s*=(?!=)/g, use: 'a class, or style: in Svelte' },
  // the stylesheets (public/css, all but tokens.css, which holds the values): colours and type sizes come from tokens
  'css-colour-literal': { css: true, re: /#[0-9a-fA-F]{3,8}\b|rgba?\(/g, use: 'a colour token (css/tokens.css; --canvas-* for what is drawn on the light canvas)' },
  'css-font-px': { css: true, re: /font(?:-size)?:[^;}]*?\d(?:\.\d+)?px/g, use: 'the type scale (--fs-caption, -small, -label, -body, -title)' },
};
const SKIP = new Set(['src/ui/kit']);

function files(dir) {
  const out = [];
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`;
    if (SKIP.has(rel)) continue;
    if (ent.isDirectory()) out.push(...files(rel));
    else if (/\.(ts|svelte)$/.test(ent.name)) out.push(rel);
  }
  return out;
}

const counts = {};
const sheets = fs.readdirSync(path.join(ROOT, 'public/css')).filter((f) => f.endsWith('.css') && f !== 'tokens.css').map((f) => `public/css/${f}`);
for (const rel of [...files('src'), ...sheets].sort()) {
  const css = rel.endsWith('.css');
  // a data: URL's colours (an SVG chevron drawn in the stylesheet) are the picture's, not the interface's
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/url\("data:[^"]*"\)/g, 'url()');
  for (const [name, { re, css: forCss }] of Object.entries(PATTERNS)) {
    if (!!forCss !== css) continue;
    const n = (text.match(re) || []).length;
    if (n) (counts[name] ??= {})[rel] = n;
  }
}

const update = process.argv.includes('--update');
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
const failures = [], lowered = [];
// a pattern new to this script has no baseline yet: --update records it as it stands
const unrecorded = base ? Object.keys(PATTERNS).filter((name) => !(name in base) && counts[name]) : [];
if (base) for (const [name, perFile] of Object.entries(counts)) {
  if (unrecorded.includes(name)) continue;
  for (const [rel, n] of Object.entries(perFile)) {
    const was = base[name]?.[rel] ?? 0;
    if (n > was) failures.push(`${rel}: ${n} × ${name} (baseline ${was}). Use ${PATTERNS[name].use}.`);
  }
}
if (base) for (const [name, perFile] of Object.entries(base)) for (const [rel, was] of Object.entries(perFile)) {
  if ((counts[name]?.[rel] ?? 0) < was) lowered.push(`${rel}: ${name} ${was} → ${counts[name]?.[rel] ?? 0}`);
}

if (failures.length && !update) {
  console.error('Legacy UI markup grew; use the interface kit instead:\n  ' + failures.join('\n  '));
  process.exit(1);
}
if (update || !base) {
  if (failures.length) { console.error('Refusing to raise the baseline:\n  ' + failures.join('\n  ')); process.exit(1); }
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log(`Legacy UI baseline written (${Object.entries(counts).map(([k, v]) => `${k} ${Object.values(v).reduce((a, b) => a + b, 0)}`).join(', ')})`);
} else if (unrecorded.length) {
  console.error(`New legacy UI patterns without a baseline (${unrecorded.join(', ')}); record them with \`node tests/legacy-ui.mjs --update\``);
  process.exit(1);
} else if (lowered.length) {
  console.error('Legacy UI markup shrank; lower the baseline with `node tests/legacy-ui.mjs --update`:\n  ' + lowered.join('\n  '));
  process.exit(1);
} else {
  const total = (name) => Object.values(counts[name] ?? {}).reduce((a, b) => a + b, 0);
  console.log(`Legacy UI markup at baseline: ${Object.keys(PATTERNS).map((k) => `${k} ${total(k)}`).join(', ')}`);
}
