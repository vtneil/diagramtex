// Usage: node scripts/build.js   (wrangler runs it before `wrangler deploy` / `wrangler dev`, see wrangler.toml)
// Copy public/ to dist/ and minify every .js and .css file on the way. Files already named *.min.* and
// everything else (HTML, fonts, icons, manifest) are copied unchanged. public/ itself is never modified.
// The app's scripts are classic <script> files sharing globals, so they are minified one by one with no
// bundling: esbuild keeps top-level names when no output format is given.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');

fs.rmSync(OUT, { recursive: true, force: true });

let before = 0, after = 0, count = 0;
function walk(rel) {
  const from = path.join(SRC, rel);
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (ent.name === '.DS_Store') continue;
    const r = path.join(rel, ent.name);
    if (ent.isDirectory()) { walk(r); continue; }
    const src = path.join(SRC, r), dst = path.join(OUT, r);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const ext = path.extname(ent.name);
    if ((ext === '.js' || ext === '.css') && !ent.name.includes('.min.')) {
      const code = fs.readFileSync(src, 'utf8');
      const out = esbuild.transformSync(code, {
        loader: ext.slice(1), minify: true, target: 'es2020', legalComments: 'inline', sourcefile: r,
      }).code;
      fs.writeFileSync(dst, out);
      before += Buffer.byteLength(code); after += Buffer.byteLength(out); count++;
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}
walk('');
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`minified ${count} files: ${kb(before)} -> ${kb(after)} (dist/)`);
