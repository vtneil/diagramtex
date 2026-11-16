// Compile the module graph, then write a minified static site with a complete offline cache.
// Source assets stay in public/; production compilation writes only to dist/.
// dist/ contains one app script, one app stylesheet, local vendor assets and fonts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { compileApp, renderIndex } = require('./compile');

async function main() {
  const application = await compileApp({ minify: true, write: false });

  const SRC = path.join(__dirname, '..', 'public');
  const OUT = path.join(__dirname, '..', 'dist');

  fs.rmSync(OUT, { recursive: true, force: true });

  const minify = (code, ext, name) => esbuild.transformSync(code, {
    // Keep CSS values and selectors exact: syntax rewrites can round alpha colours
    // and change antialiased borders even when the computed layout is identical.
    loader: ext, ...(ext === 'css' ? { minifyWhitespace: true } : { minify: true }),
    target: 'es2020', legalComments: 'inline', sourcefile: name,
  }).code;
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, rel), text);
  };

  // ---- index.html: one compiled script and one joined stylesheet
  let html = await renderIndex();
  // a run of tags on consecutive lines; each run must be one block, or the load order could change
  function takeRun(re, what) {
    const runs = html.match(new RegExp(`(?:[ \\t]*${re.source}[ \\t]*\\r?\\n)+`, 'g')) || [];
    if (runs.length !== 1) throw new Error(`index.html: expected one run of ${what} tags, found ${runs.length}`);
    const files = [...runs[0].matchAll(new RegExp(re.source, 'g'))].map((m) => m[1]);
    return { block: runs[0], files };
  }
  const scripts = takeRun(/<script src="(js\/[\w.-]+\.js)"><\/script>/, 'app <script>');
  const styles = takeRun(/<link rel="stylesheet" href="(css\/[\w-]+\.css)">/, 'app stylesheet');
  const indent = (block) => block.match(/^[ \t]*/)[0];
  html = html.replace(scripts.block, `${indent(scripts.block)}<script src="js/bundle.js"></script>\n`);
  html = html.replace(styles.block, `${indent(styles.block)}<link rel="stylesheet" href="css/app.css">\n`);
  const joined = new Set([...scripts.files, ...styles.files]);
  // other pages (the guides) may link a file the app joins, like css/language-menu.css: those still ship on their own
  const linked = new Set();
  (function pages(rel) {
    for (const ent of fs.readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) { if (r !== 'vendor') pages(r); continue; }
      if (!ent.name.endsWith('.html') || r === 'index.html') continue;
      for (const m of read(r).matchAll(/(?:href|src)="([^"#?]+\.(?:css|js))"/g)) linked.add(path.posix.normalize(path.posix.join(rel, m[1])));
    }
  })('');

  let before = 0, after = 0, count = 0;
  function walk(rel) {
    for (const ent of fs.readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
      if (ent.name === '.DS_Store') continue;
      const r = path.join(rel, ent.name).split(path.sep).join('/');
      if (ent.isDirectory()) { walk(r); continue; }
      if ((joined.has(r) && !linked.has(r)) || r.startsWith('js/') || r === 'index.html' || r === 'sw.js') continue; // written below
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

  // Ship the application's licence and output-licensing clarification with the static distribution.
  for (const name of ['LICENSE', 'LICENSING.md']) {
    write(name, fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
  }

  // Styles retain their original cascade order.
  function bundle(files, ext, name, sep) {
    const code = files.map((f) => `/* ${f} */\n${read(f)}`).join(sep);
    const out = minify(code, ext, name);
    write(name, out);
    before += Buffer.byteLength(code); after += Buffer.byteLength(out); count += files.length;
  }
  const app = application.outputFiles.find(file => file.path.endsWith('app.bundle.js'));
  // A second pass removes the `if (!1) {...}` branches that esbuild's cross-module constant inlining leaves behind
  // (Svelte's dev-only error and warning texts, behind esm-env's DEV), which the bundling pass cannot drop.
  const appCode = esbuild.transformSync(app.text, { minify: true, target: 'es2020', legalComments: 'inline' }).code;
  write('js/bundle.js', appCode);
  write('math-render-worker.js', application.outputFiles.find(file => file.path.endsWith('math-render-worker.js')).text);
  bundle(styles.files, 'css', 'css/app.css', '\n');
  write('index.html', html);

  // ---- version.json: the release this build is, read by the app once on load to spot a newer deploy
  const VERSION = (/TD\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '../src/domain/shapes.ts'), 'utf8')) || [])[1];
  if (!VERSION) throw new Error('src/domain/shapes.ts: TD.VERSION not found');
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
  const precache = ['./', ...files];
  sw = sw.replace(listRe, `const PRECACHE = ${JSON.stringify(precache)};`);
  // The cache name is a hash of every precached file's name and contents, so any change to what is served installs a
  // new worker and its activate step deletes the old cache. (public/sw.js keeps its literal name for the dev server.)
  const hash = crypto.createHash('sha256');
  for (const url of precache) {
    hash.update(url + '\0');
    hash.update(fs.readFileSync(path.join(OUT, url.endsWith('/') ? url + 'index.html' : url)));
    hash.update('\0');
  }
  const cacheRe = /const CACHE = '[^']*';/;
  if (!cacheRe.test(sw)) throw new Error('sw.js: CACHE name not found');
  const cacheName = `diagramtex-${hash.digest('hex').slice(0, 12)}`;
  sw = sw.replace(cacheRe, `const CACHE = '${cacheName}';`);
  write('sw.js', minify(sw, 'js', 'sw.js'));

  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`compiled application: ${kb(Buffer.byteLength(appCode))}; minified ${count} CSS/worker files: ${kb(before)} -> ${kb(after)} (dist/); `
    + `${styles.files.length} stylesheets -> css/app.css, `
    + `${files.length + 1} files precached as ${cacheName}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
