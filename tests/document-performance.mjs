// A camera change must preserve the document's natural layout and pagination.
// Timings are diagnostic; structural work is asserted independently of hardware.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';

await prepare();
const server = await serve(APP_DIR);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-document-performance-'));
const results = [];
try {
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, `http://127.0.0.1:${server.port}/`);
    try {
      for (const engine of ['katex', 'temml']) {
        await b.page.evaluate(async ({ engine, containment }) => {
          TD.math.set(engine);
          const text = String.raw`Repeated mathematics: $\vec F=q(\vec E+\vec v\times\vec B)$ and $\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$.`;
          TD.app.newDoc('Document performance', null, null, Array.from({ length: 100 }, () => ({ type: 'text', text })));
          if (containment) document.querySelector('#docview .doc-page').style.contain = 'layout style';
          await TD.math.whenReady();
          await document.fonts.ready;
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          document.querySelector('#docview [data-zoom="1"]').click();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }, { engine, containment: args.includes('--containment-experiment') });
        const result = await b.page.evaluate(async () => {
          const root = document.querySelector('#docview'), paper = root.querySelector('.doc-page');
          const breaks = [...paper.querySelectorAll('.pg-brk')];
          const rect = root.getBoundingClientRect();
          let mutations = 0, parses = 0, naturalReads = 0;
          const observer = new MutationObserver(records => { mutations += records.length; });
          observer.observe(paper, { subtree: true, childList: true });
          const render = TD.math.render;
          TD.math.render = (...args) => { parses++; return render(...args); };
          const restore = [];
          for (const key of ['offsetTop', 'offsetHeight']) {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
            Object.defineProperty(HTMLElement.prototype, key, { ...descriptor, get() {
              if (paper.contains(this)) naturalReads++;
              return descriptor.get.call(this);
            } });
            restore.push(() => Object.defineProperty(HTMLElement.prototype, key, descriptor));
          }
          const frames = [], handlers = [];
          try {
            let previous = performance.now();
            for (let i = 0; i < 45; i++) {
              const start = performance.now();
              root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true,
                deltaY: i < 22 ? -2 : 2, clientX: rect.left + 100, clientY: rect.top + 150 }));
              handlers.push(performance.now() - start);
              await new Promise(r => requestAnimationFrame(r));
              const now = performance.now(); frames.push(now - previous); previous = now;
            }
            const stats = values => {
              const sorted = values.slice(5).sort((a, b) => a - b);
              return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)] };
            };
            return { frames: stats(frames), handlers: stats(handlers), parses, mutations, naturalReads,
              pages: breaks.length + 1, retainedDividers: breaks.every(e => e.isConnected),
              paperZoomVariable: paper.style.getPropertyValue('--unzoom') };
          } finally {
            observer.disconnect(); TD.math.render = render; restore.forEach(f => f());
          }
        });
        results.push({ browser, engine, ...result });
        console.log(JSON.stringify(results.at(-1)));
        if (!args.includes('--measure-only')) {
          assert.equal(result.parses, 0, 'Zoom must retain parsed maths');
          assert.equal(result.mutations, 0, 'Zoom must retain document content and divider nodes');
          assert.equal(result.naturalReads, 0, 'Zoom must not remeasure natural block layout');
          assert(result.retainedDividers, 'Zoom must retain pagination');
          assert.equal(result.paperZoomVariable, '', 'Fast-changing control styles must not invalidate the whole paper');
        }
      }
      assert.deepEqual(b.logs, [], browser + ': no runtime errors');
    } finally { await b.close(); }
  }
} finally {
  await server.close();
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Document performance report: ' + artifacts);
}
