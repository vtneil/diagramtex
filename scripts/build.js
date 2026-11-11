// Usage: node scripts/build.js   (wrangler runs it before `wrangler deploy` / `wrangler dev`, see wrangler.toml)
// Copy public/ to dist/ and minify every .js and .css file on the way. Files already named *.min.* and
// everything else (fonts, icons, manifest) are copied unchanged. public/ itself is never modified, so
// development (serving public/ directly) keeps one file per script.
//
// To cut the number of requests, dist/ also gets:
// - js/bundle.js: the app's scripts, joined in the order index.html loads them, in place of the separate
//   <script src="js/…"> tags. They are classic scripts sharing globals, so joining them changes nothing;
//   esbuild keeps top-level names when no output format is given.
// - css/app.css: the app's stylesheets joined the same way, in place of their <link> tags.
// - sw.js with its PRECACHE list written from the files actually in dist/, so the offline copy always
//   holds everything the app can load (every font, both maths engines, MathLive).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');

fs.rmSync(OUT, { recursive: true, force: true });

const minify = (code, ext, name) => esbuild.transformSync(code, {
  loader: ext, minify: true, target: 'es2020', legalComments: 'inline', sourcefile: name,
}).code;
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), text);
};

// ---- index.html: one script and one stylesheet instead of a run of each
let html = read('index.html');
// a run of tags on consecutive lines; each run must be one block, or the load order could change
function takeRun(re, what) {
  const runs = html.match(new RegExp(`(?:[ \\t]*${re.source}[ \\t]*\\r?\\n)+`, 'g')) || [];
  if (runs.length !== 1) throw new Error(`index.html: expected one run of ${what} tags, found ${runs.length}`);
  const files = [...runs[0].matchAll(new RegExp(re.source, 'g'))].map((m) => m[1]);
  return { block: runs[0], files };
}
const scripts = takeRun(/<script src="(js\/[\w-]+\.js)"><\/script>/, 'app <script>');
const styles = takeRun(/<link rel="stylesheet" href="(css\/[\w-]+\.css)">/, 'app stylesheet');
const indent = (block) => block.match(/^[ \t]*/)[0];
html = html.replace(scripts.block, `${indent(scripts.block)}<script src="js/bundle.js"></script>\n`);
html = html.replace(styles.block, `${indent(styles.block)}<link rel="stylesheet" href="css/app.css">\n`);
const joined = new Set([...scripts.files, ...styles.files]);

let before = 0, after = 0, count = 0;
function walk(rel) {
  for (const ent of fs.readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
    if (ent.name === '.DS_Store') continue;
    const r = path.join(rel, ent.name).split(path.sep).join('/');
    if (ent.isDirectory()) { walk(r); continue; }
    if (joined.has(r) || r === 'index.html' || r === 'sw.js') continue; // written below
    const ext = path.extname(ent.name);
    if ((ext === '.js' || ext === '.css') && !ent.name.includes('.min.')) {
      const code = read(r), out = minify(code, ext.slice(1), r);
      write(r, out);
      before += Buffer.byteLength(code); after += Buffer.byteLength(out); count++;
    } else {
      fs.mkdirSync(path.dirname(path.join(OUT, r)), { recursive: true });
      fs.copyFileSync(path.join(SRC, r), path.join(OUT, r));
    }
  }
}
walk('');

// join in load order; ';' between files so one without a trailing semicolon can't run into the next
function bundle(files, ext, name, sep) {
  const code = files.map((f) => `/* ${f} */\n${read(f)}`).join(sep);
  const out = minify(code, ext, name);
  write(name, out);
  before += Buffer.byteLength(code); after += Buffer.byteLength(out); count += files.length;
}
bundle(scripts.files, 'js', 'js/bundle.js', '\n;\n');
bundle(styles.files, 'css', 'css/app.css', '\n');
write('index.html', html);

// ---- version.json: the release this build is, read by the app once on load to spot a newer deploy
const VERSION = (/TD\.VERSION = '([^']+)'/.exec(read('js/shapes.js')) || [])[1];
if (!VERSION) throw new Error('js/shapes.js: TD.VERSION not found');
write('version.json', JSON.stringify({ version: VERSION }) + '\n');

// ---- sw.js: precache every file the app can load, as it is in dist/ (not version.json: it must come from the network)
const SKIP = /^(index\.html|sw\.js|version\.json|robots\.txt|sitemap\.xml|404\.html)$|LICENSE|\.txt$|^icons\/og-image\./;
const files = [];
(function list(rel) {
  for (const ent of fs.readdirSync(path.join(OUT, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    // a folder's index.html is served at the folder's URL (guide/index.html redirects to guide/)
    if (ent.isDirectory()) list(r); else if (!SKIP.test(r)) files.push(r.replace(/(^|\/)index\.html$/, '$1'));
  }
})('');
files.sort();
let sw = read('sw.js');
const listRe = /const PRECACHE = \[[\s\S]*?\];/;
if (!listRe.test(sw)) throw new Error('sw.js: PRECACHE list not found');
sw = sw.replace(listRe, `const PRECACHE = ${JSON.stringify(['./', ...files])};`);
write('sw.js', minify(sw, 'js', 'sw.js'));

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`minified ${count} files: ${kb(before)} -> ${kb(after)} (dist/); `
  + `${scripts.files.length} scripts -> js/bundle.js, ${styles.files.length} stylesheets -> css/app.css, `
  + `${files.length + 1} files precached`);
