// The supplied Page file exercises repeated maths, mixed prose and specialised
// symbols. Measure view-only work separately from parsing/layout. Timing is
// reported, not asserted: refresh rate and CI hardware vary. Cache invalidation
// or formula parsing during view-only gestures is a functional regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { performanceFixture } from './performance-fixture.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';

await prepare();
const server = await serve(APP_DIR);
const file = performanceFixture();
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-performance-'));
const results = [];
try {
  for (const name of testBrowsers()) {
    const b = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      for (const engine of ['katex', 'temml']) {
        await b.page.evaluate(async ({ file, engine }) => {
          TD.math.set(engine);
          const p = TD.app.parseProject(file);
          TD.app.newDoc(p.name, null, null, null, p.page, 'page', p.sheet);
          await TD.math.whenReady();
          await document.fonts.ready;
          await Promise.all([...document.querySelectorAll('#content image.svg-label')].map(e => {
            const image = new Image(); image.src = e.getAttribute('href'); return image.decode();
          }));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          window.__performanceProbe = { parses: 0, invalidations: 0, mutations: 0 };
          const render = TD.math.render, clear = TD.clearTextCache;
          TD.math.render = (...args) => { window.__performanceProbe.parses++; return render(...args); };
          TD.clearTextCache = (...args) => { window.__performanceProbe.invalidations++; return clear(...args); };
          window.__performanceProbe.restore = () => { TD.math.render = render; TD.clearTextCache = clear; };
        }, { file, engine });
        try {
          const invalidationsAfterNotification = await b.page.evaluate(() => {
            document.fonts.dispatchEvent(new Event('loadingdone'));
            return window.__performanceProbe.invalidations;
          });
          assert.equal(invalidationsAfterNotification, 0, 'An unrelated font notification must not invalidate drawing metrics');
          for (const zoom of [1, 4]) for (const gesture of ['scroll', 'zoom']) {
            const result = await b.page.evaluate(async ({ zoom, gesture }) => {
              const canvas = document.querySelector('#canvas'), probe = window.__performanceProbe;
              TD.state.view = { zoom, x: 250, y: 100 };
              canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              probe.parses = probe.invalidations = probe.mutations = 0;
              const observer = new MutationObserver(records => { probe.mutations += records.length; });
              observer.observe(document.querySelector('#content'), { childList: true, subtree: true });
              let rulerWrites = 0, pageWrites = 0;
              const viewObserver = new MutationObserver(records => {
                for (const record of records) {
                  if (record.target.closest('#rulerX, #rulerY')) rulerWrites++;
                  else pageWrites++;
                }
              });
              for (const selector of ['#rulerX svg', '#rulerY svg', '#pageLayer', '#pageLabels'])
                viewObserver.observe(document.querySelector(selector), { childList: true });
              const frames = [], handlers = [], rect = canvas.getBoundingClientRect();
              let previous = performance.now();
              for (let i = 0; i < 45; i++) {
                const start = performance.now();
                canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
                  deltaX: gesture === 'scroll' ? 4 : 0, deltaY: gesture === 'scroll' ? 2 : i < 22 ? -2 : 2,
                  ctrlKey: gesture === 'zoom', clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
                handlers.push(performance.now() - start);
                await new Promise(r => requestAnimationFrame(r));
                const now = performance.now(); frames.push(now - previous); previous = now;
              }
              observer.disconnect(); viewObserver.disconnect();
              const stats = values => {
                const ordered = values.slice(5).sort((a, b) => a - b);
                return { median: ordered[Math.floor(ordered.length / 2)], p95: ordered[Math.floor(ordered.length * .95)] };
              };
              return { frames: stats(frames), handlers: stats(handlers), parses: probe.parses,
                invalidations: probe.invalidations, mutations: probe.mutations, rulerWrites, pageWrites };
            }, { zoom, gesture });
            results.push({ browser: name, engine, zoom, gesture, ...result });
            console.log(`${name} ${engine} ${zoom * 100}% ${gesture}: ${result.frames.median.toFixed(1)} ms median frame, ${result.invalidations} invalidations, ${result.parses} parses`);
            assert.equal(result.invalidations, 0, 'View-only gestures must retain measured text');
            assert.equal(result.parses, 0, 'View-only gestures must retain parsed formulae');
            assert.equal(result.mutations, 0, 'View-only gestures must retain rendered shape nodes');
            assert.equal(result.rulerWrites, 90, 'Each view update must draw each ruler once');
            if (gesture === 'scroll') assert.equal(result.pageWrites, 0, 'Panning must retain paper and page-number nodes');
          }
          // Real pointer input covers the middle-button pan path as well.
          const canvas = await b.page.locator('#canvas').boundingBox();
          const point = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
          await b.page.mouse.move(point.x, point.y);
          await b.page.mouse.down({ button: 'middle' });
          await b.page.mouse.move(point.x + 80, point.y + 50, { steps: 15 });
          await b.page.mouse.up({ button: 'middle' });
          const afterPan = await b.page.evaluate(() => ({ parses: window.__performanceProbe.parses, invalidations: window.__performanceProbe.invalidations }));
          assert.equal(afterPan.parses, 0, 'Pointer pan must retain parsed formulae');
          assert.equal(afterPan.invalidations, 0, 'Pointer pan must retain measured text');
        } finally { await b.page.evaluate(() => window.__performanceProbe.restore()); }
      }
      assert.deepEqual(b.logs, [], name + ': no runtime errors');
    } finally { await b.close(); }
  }
} finally {
  await server.close();
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Performance results: ${artifacts}`);
}
