import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';

await prepare();
const server = await serve(APP_DIR);
try {
  for (const name of testBrowsers()) {
    const browser = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      const page = browser.page;
      await page.evaluate(async () => {
        const Native = window.Worker;
        window.__hold = false; window.__held = [];
        window.Worker = class {
          constructor(...args) {
            this.native = new Native(...args);
            this.native.onmessage = event => {
              const deliver = () => this.onmessage?.(event);
              if (window.__hold) window.__held.push(deliver); else deliver();
            };
            this.native.onerror = event => this.onerror?.(event);
          }
          postMessage(message) { this.native.postMessage(message); }
          terminate() { this.native.terminate(); }
        };
        const formula = String.raw`\dfrac{\displaystyle\sum_{j=0}^{17} x_j^{74281}}{1+\sqrt{a^2+b^2}}`;
        const sources = {
          qc: String.raw`\begin{quantikz} & \gate{${formula}} & \end{quantikz}`,
          forest: String.raw`[{$${formula}$} [{$x$}] [{$y$}]]`,
          cd: String.raw`\begin{tikzcd} ${formula} \arrow[r] & x \end{tikzcd}`,
        };
        window.__layoutShapes = Object.entries(sources).map(([type, src], i) => ({ ...TD.TYPES[type].create({ x: 100, y: 100 + i * 230 }, {}), src, id: 'engine-' + type }));
        TD.app.newDoc('Engine layouts', window.__layoutShapes, null, null, null, 'board');
        await TD.math.whenReady();
      });
      let changed = false;
      for (const mode of ['board', 'document']) {
        await page.evaluate(async mode => {
          window.__layoutMode = mode;
          if (mode === 'document') {
            TD.app.newDoc('Document engine layouts', window.__layoutShapes, null, null, null, 'classic');
            await TD.math.whenReady();
          }
        }, mode);
        const engines = await page.evaluate(() => TD.math.engine === 'katex' ? ['temml', 'katex'] : ['katex', 'temml']);
        for (const engine of engines) {
          const previous = await page.evaluate(() => TD.qcLayout(TD.state.doc.shapes[0]).ops.filter(o => o.gate).map(o => [o.w, o.h]));
          await page.evaluate(() => { window.__hold = true; });
          await page.locator(`#engineBox [data-engine="${engine}"]`).click();
          assert(await page.evaluate(() => TD.math.pending > 0), `${name}: transition exercises asynchronous compilation`);
          await page.evaluate(async () => {
            window.__hold = false; window.__held.splice(0).forEach(deliver => deliver());
            await TD.math.whenReady();
          });
          const result = await page.evaluate(() => {
            const shapes = TD.state.doc.shapes;
            const snapshot = () => ({ boxes: shapes.map(s => TD.bbox(s)), gate: TD.qcLayout(shapes[0]).ops.filter(o => o.gate).map(o => [o.w, o.h]) });
            const live = snapshot();
            const drawn = [...document.querySelectorAll(window.__layoutMode === 'document' ? '#docview .blk-diag rect' : '#content [data-id="engine-qc"] rect')].map(e => [Number(e.getAttribute('width')), Number(e.getAttribute('height'))]);
            TD.clearTextCache();
            const fresh = TD.math.synchronous(snapshot);
            return { live, fresh, drawn };
          });
          assert.deepEqual(result.live, result.fresh, `${name}/${engine}: settled layouts must match fresh target-engine measurements`);
          for (const [w, h] of result.fresh.gate) assert(result.drawn.some(([dw, dh]) => Math.abs(dw-w)<.02 && Math.abs(dh-h)<.02), `${name}/${engine}: visible gate resizes with its text`);
          changed ||= JSON.stringify(previous) !== JSON.stringify(result.live.gate);
        }
      }
      assert(changed, `${name}: fixture measures a genuine size difference between engines`);
      assert.deepEqual(browser.logs, [], `${name}: no runtime errors`);
      console.log(`✓ ${name}: quantum gate, forest and commutative-diagram sizes follow engine switches in canvas and Document views`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
