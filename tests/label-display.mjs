// The retained screen image and vector-export image must paint the same resource,
// including scripts/accents at fractional pan, rotation and high zoom.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { prepare, APP_DIR, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-label-display-'));
let comparisons = 0; const failures = [];
function ink(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return false;
  const i = (y * png.width + x) * 4;
  return Math.min(...png.data.subarray(i, i + 3)) < 180;
}
function missing(a, b) {
  let total = 0, unmatched = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (ink(a, x, y)) {
    total++;
    let found = false;
    for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1; dx++) if (ink(b, x + dx, y + dy)) { found = true; break; }
    if (!found) unmatched++;
  }
  assert(total > 5, 'Labels must actually paint; ink=' + total);
  return { unmatched, total };
}
try {
  for (const name of testBrowsers()) {
    const b = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      for (const engine of ['katex', 'temml']) for (const zoom of [.25, 1, 1.75, 4]) for (const angle of [0, 27]) {
        await b.page.evaluate(async ({ engine, zoom, angle, candidate, blob }) => {
          document.querySelector('#display-check')?.remove();
          TD.math.set(engine);
          const host = document.createElement('div'); host.id = 'display-check';
          host.style.cssText = 'position:fixed;inset:0;z-index:100000;background:white';
          const text = String.raw`$\cos^2u-\sin^2u$` + '\n' + String.raw`$\displaystyle\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$` + '\n' + String.raw`$\hat x+\vec F$`;
          const style = { size: 14.06, align: 'left' };
          const shape = { ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'display-fixture', text, ...style };
          TD.app.newDoc('Display fixture', null, null, null, null, 'page', { pages: 1, shapes: [shape] });
          await TD.math.whenReady();
          const mounted = document.querySelector('#content [data-id="display-fixture"] image.svg-label');
          const exported = new DOMParser().parseFromString(TD.app.svgOf(TD.state.doc.sheet.shapes), 'image/svg+xml').querySelector('image.svg-label');
          const canonical = exported.getAttribute('href');
          if (!mounted.getAttribute('href').startsWith('blob:')) throw new Error('The mounted label must use a reusable resource');
          const bytes = await (await fetch(mounted.getAttribute('href'))).text();
          if (bytes !== decodeURIComponent(escape(atob(canonical.split(',')[1])))) throw new Error('Display/export SVG bytes differ');
          host.innerHTML = `<svg width="1200" height="850"><g transform="translate(600.25 425.75) rotate(${angle}) scale(${zoom})">${mounted.outerHTML}</g></svg>`;
          document.body.append(host);
          let live = host.querySelector('.svg-label');
          let href = live.getAttribute('href');
          for (const url of window.__labelBlobUrls || []) URL.revokeObjectURL(url);
          window.__labelBlobUrls = [];
          if (blob) {
            const source = await (await fetch(href)).text();
            href = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
            window.__labelBlobUrls.push(href); live.setAttribute('href', href);
          }
          if (candidate) {
            const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            for (const a of live.attributes) if (a.name !== 'href') foreign.setAttribute(a.name, a.value);
            const img = document.createElementNS('http://www.w3.org/1999/xhtml', 'img');
            img.src = href; img.style.cssText = 'display:block;width:100%;height:100%';
            foreign.append(img); live.replaceWith(foreign); live = foreign;
          }
          const img = new Image(); img.src = href; await img.decode();
          window.__vectorLabel = document.importNode(exported, true);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }, { engine, zoom, angle, candidate: args.includes('--html-image-experiment'), blob: args.includes('--blob-image-experiment') });
        const live = PNG.sync.read(await b.page.locator('#display-check > svg').screenshot());
        await b.page.evaluate(async () => {
          document.querySelector('#display-check .svg-label').replaceWith(window.__vectorLabel);
          const image = new Image(); image.src = window.__vectorLabel.getAttribute('href'); await image.decode();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const vector = PNG.sync.read(await b.page.locator('#display-check > svg').screenshot());
        const differences = [missing(live, vector), missing(vector, live)];
        const passed = differences.every(d => d.unmatched <= Math.max(3, d.total * .015));
        if (!passed) {
          const prefix = `${name}-${engine}-${zoom}-${angle}`;
          fs.writeFileSync(path.join(artifacts, prefix + '-screen.png'), PNG.sync.write(live));
          fs.writeFileSync(path.join(artifacts, prefix + '-export.png'), PNG.sync.write(vector));
        }
        if (!passed) failures.push(`${name}/${engine}/${zoom}/${angle}: ${JSON.stringify(differences)}`);
        comparisons++;
      }
      assert.deepEqual(b.logs, [], name + ': no runtime errors');
    } finally { await b.close(); }
  }
  if (args.includes('--report-only')) console.log('Display/export differences:', failures);
  else assert.deepEqual(failures, [], 'Display/export differences; ' + artifacts);
  console.log(`${comparisons - failures.length}/${comparisons} display/export comparisons passed (fractional pan, rotation, 25–400% zoom); ${artifacts}`);
} finally { await server.close(); }
