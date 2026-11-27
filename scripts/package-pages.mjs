// Write each package page's example (public/<page>/index.html) from the app: the code the app writes for the Welcome
// file's example of the page's block (the one its guide screenshot shows), the "Open this example" share link (#share=, the example as a file) and the
// "Edit this example here" drawing (data-draft, the block's shape alone). Run it after the app's export changes, when
// tests/package-pages.mjs says a page's code is no longer what the app writes, and when adding a page.
//
//   node scripts/package-pages.mjs                 every page
//   node scripts/package-pages.mjs chemfig-editor  only these pages (comma-separated)
//   NOCOMPILE=1 …                                  skip compiling src/ into public/ first
//
// A page is written by hand; this fills in only its first code sample, every href="../#share=…", data-draft="…", each
// <span data-example> (the example's name) and its screenshot's alt text (the guide's, for the same picture).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { APP_DIR, ROOT, prepare, positional } from '../tests/args.mjs';
import { serve, launch } from '../tests/chrome.mjs';
import { scenes } from './guide-shots/scenes.mjs';

// page → the guide screenshot (scripts/guide-shots/scenes.mjs) it shows: the page's example is the Welcome example that
// scene opens, so the picture, the code and the links show the same drawing. [scene, name] trims the example's name to
// what the page's code shows (the Welcome example may hold other blocks too).
const beforeColon = (name) => name.split(':')[0].trim();
export const PAGES = {
  'circuitikz-editor': 'ed-circuit',
  'quantikz-editor': 'ed-quantum',
  'karnaugh-map-latex': 'ed-kmap',
  'chemfig-editor': ['ed-chemfig', beforeColon], // the mechanism; its laboratory set-up is a chemlab block
  'tikz-timing-editor': 'ed-timing',
  'tikz-cd-editor': 'ed-cd',
  'tikz-feynman-editor': 'ed-feynman',
};
// a scene's example heading and block type, from its script: editEx(title, type) writes `await open("title"); await edit('type'…`
function sceneExample(name) {
  const sc = scenes.find((x) => x.name === name);
  const m = sc && /open\(("(?:[^"\\]|\\.)*")\); await edit\('(\w+)'/.exec(sc.js);
  if (!m) throw new Error(`scene ${name} opens no Welcome example in a block editor`);
  return [JSON.parse(m[1]), m[2]];
}
// the guide's description of a screenshot (its alt text), for the same picture on the page
const guide = fs.readFileSync(path.join(ROOT, 'public/guide/index.html'), 'utf8');
const altOf = (name) => { const m = new RegExp(`<img src="img/${name}\\.webp"[^>]*? alt="([^"]*)"`).exec(guide); if (!m) throw new Error(`the guide shows no img/${name}.webp`); return m[1]; };

// as the app packs a share link (src/application/app.ts shareLink): numbers to 6 significant digits, deflated, base64url
const shareNum = (_k, v) => (typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(6)) : v);
const pack = (value) => '1.' + zlib.deflateRawSync(Buffer.from(JSON.stringify(value, shareNum))).toString('base64url');
const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pick = positional[0]?.split(',') || Object.keys(PAGES);
for (const p of pick) if (!PAGES[p]) throw new Error(`no page ${p} (known: ${Object.keys(PAGES).join(', ')})`);
if (!process.env.NOCOMPILE) await prepare();
const server = await serve(APP_DIR);
const b = await launch(`http://127.0.0.1:${server.port}/`);
let failed = 0;
try {
  for (const page of pick) {
    try {
      const [scene, nameOf = (n) => n] = [].concat(PAGES[page]);
      const [title, type] = sceneExample(scene);
      const r = JSON.parse(await b.ev(`
        const B = TD.state.doc.blocks;
        const i = B.findIndex((b) => b.type === 'text' && b.text.split('\\n')[0].startsWith('## ') && b.text.split('\\n')[0].includes(${JSON.stringify(title)}));
        if (i < 0 || B[i + 1]?.type !== 'diagram') throw Error('no Welcome example ' + ${JSON.stringify(title)});
        const shapes = B[i + 1].shapes, main = shapes.filter((s) => s.type === ${JSON.stringify(type)});
        if (main.length !== 1) throw Error('the example has ' + main.length + ' ${type} blocks, not one');
        const name = B[i].text.split('\\n')[0].replace(/^## \\d+\\.\\s*/, '');
        return JSON.stringify({ name, shape: main[0], tikz: TD.toTikz(main),
          project: JSON.parse(TD.projectFiles.stringify({ kind: 'classic', name, page: TD.state.doc.page, blocks: [{ type: 'diagram', shapes }] })) });`, 60000));
      const file = path.join(ROOT, 'public', page, 'index.html');
      let s = fs.readFileSync(file, 'utf8');
      const code = /(<div class="code"><button class="btn copy" type="button">Copy<\/button><pre><code>)[\s\S]*?(<\/code><\/pre><\/div>)/;
      if (!code.test(s) || !/href="\.\.\/#share=/.test(s) || !/data-draft="/.test(s)) throw Error('the page has no code sample, share link or data-draft to fill in');
      s = s.replace(code, (_m, a, z) => a + html(r.tikz.trimEnd()) + z)
        .replace(/href="\.\.\/#share=[^"]*"/g, `href="../#share=${pack(r.project)}"`)
        .replace(/data-draft="[^"]*"/, `data-draft="${pack(r.shape)}"`)
        .replace(/(<span data-example>)[^<]*(<\/span>)/g, (_m, a, z) => a + html(nameOf(r.name)) + z)
        .replace(new RegExp(`(<img src="\\.\\./guide/img/${scene}\\.webp"[^>]*? alt=")[^"]*"`), (_m, a) => a + altOf(scene) + '"');
      fs.writeFileSync(file, s);
      console.log(`[PASSED] ${page}: "${nameOf(r.name)}", ${r.tikz.split('\n').length} lines of code`);
    } catch (e) { failed++; console.log(`[FAILED] ${page}: ${e.message}`); }
  }
} finally { b.close(); server.close(); }
process.exitCode = failed ? 1 : 0;
