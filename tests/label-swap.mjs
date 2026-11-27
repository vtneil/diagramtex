// A maths label already on screen keeps its picture until the replacement has decoded, so
// resizing a text box (each width is a new picture) never paints a blank frame, and the
// label still follows the drag rather than waiting for the pointer to stop.
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare(); const server = await serve(APP_DIR);
try {
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, `http://127.0.0.1:${server.port}/`);
    try {
      await b.page.evaluate(async () => {
        const s = { ...TD.TYPES.text.create({ x: 300, y: 200 }, {}), id: 'swap', text: String.raw`Energy $E=mc^2$ and $\int_0^1 x^2\,dx$ in words that wrap` };
        TD.app.newDoc('Label swap', [s], null, null, null, 'classic'); TD.app.setMode('diagram');
        await TD.math.whenReady(); TD.state.sel = new Set(['swap']); TD.app.render();
        window.__swaps = 0; window.__blank = 0;
        new MutationObserver((list) => { for (const m of list) {
          if (!m.target.matches('image.svg-label')) continue;
          window.__swaps++; const probe = new Image(); probe.src = m.target.getAttribute('href'); if (!probe.complete) window.__blank++;
        } }).observe(document.querySelector('#content'), { subtree: true, attributes: true, attributeFilter: ['href'] });
      });
      let h = null; // the canvas may redraw the handle while it settles
      for (let i = 0; i < 50 && !h; i++) { h = await b.page.locator('[data-handle="tw"]').first().boundingBox().catch(() => null); if (!h) await b.page.waitForTimeout(100); }
      assert(h, 'the text box shows its width handle');
      const x0 = h.x + h.width / 2, y0 = h.y + h.height / 2;
      await b.page.mouse.move(x0, y0); await b.page.mouse.down();
      for (let i = 1; i <= 30; i++) await b.page.mouse.move(x0 - i * 5, y0);
      await b.page.mouse.up();
      await b.page.evaluate(() => TD.math.whenReady());
      await b.page.waitForTimeout(200);
      const r = await b.page.evaluate(() => {
        const image = document.querySelector('#content image.svg-label');
        const probe = new Image(); probe.src = image.getAttribute('href');
        const hit = image.parentElement.querySelector('rect.hitfill');
        return { swaps: window.__swaps, blank: window.__blank, settled: probe.complete, width: +image.getAttribute('width'), box: hit ? +hit.getAttribute('width') : NaN };
      });
      assert(r.swaps >= 3, `the label follows the drag (${r.swaps} swaps)`);
      assert.equal(r.blank, 0, 'no swap to a picture that has not decoded');
      assert(r.settled, 'the label ends on its final, decoded picture');
      assert(r.width <= r.box + 4, `the shown picture is the final, narrower one (${r.width} in a ${r.box} box)`);
      assert.deepEqual(b.logs, []);
      console.log(`[PASSED] ${browser}: ${r.swaps} label swaps while resizing, none blank`);
    } finally { await b.close(); }
  }
} finally { server.close(); }
