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
      const coverage = await page.evaluate(() => {
        const results = [];
        TD.math.synchronous(() => {
          for (const [type, t] of Object.entries(TD.TYPES)) {
            if (!t.objectScalable || !t.create) continue;
            const s = { ...t.create({ x: 100, y: 100 }, TD.state.defaults, type + ":function"), id: 'scale-' + type };
            if (type === 'rect') Object.assign(s, { x: 10, y: 20, w: 80, h: 40 });
            const b = TD.bbox(s), handles = t.handles?.(s) || [];
            const svg = t.svg(s, { zoom: 1, export: true, scene: [s] });
            s.objectScale = 2;
            const scaled = TD.bbox(s), scaledHandles = t.handles?.(s) || [];
            
            // Real exports use the application export context (tested below for a rectangle).
            const scaledSvg = t.svg(s, { zoom: 1, export: true, scene: [s] });
            results.push({ type, b, scaled, svg: !!svg, scaledSvg, handles, scaledHandles, tikz: TD.toTikz([s]) });
          }
        });
        return results;
      });
      assert(coverage.length > 20, 'shared scale covers shapes and scientific blocks');
      for (const r of coverage) {
        assert(Math.abs(r.scaled.w - r.b.w * 2) < 0.01, `${name}: ${r.type} width doubles`);
        assert(Math.abs(r.scaled.h - r.b.h * 2) < 0.01, `${name}: ${r.type} height doubles`);
        assert(Math.abs(r.scaled.x + r.scaled.w / 2 - r.b.x - r.b.w / 2) < 0.01, `${name}: ${r.type} centre stays fixed`);
        if (r.svg) assert(r.scaledSvg.includes('class="object-scaled"'), `${name}: ${r.type} preview is scaled`);
        assert(!/NaN|Infinity/.test(r.tikz), `${name}: ${r.type} TikZ stays finite`);
        assert(!/NaN|Infinity/.test(r.scaledSvg), `${name}: ${r.type} SVG stays finite`);
      }
      await page.evaluate(() => {
        const s = { ...TD.TYPES.rect.create({ x: 10, y: 20 }, TD.state.defaults), id: 'scale-test', w: 80, h: 40 };
        TD.app.newDoc('Scale test', [s], null, null, null, 'board');
        TD.state.sel.add(s.id); TD.app.render(); TD.app.renderProps();
      });
      const input = page.locator('[data-object-scale]');
      assert.equal(await input.inputValue(), '1');
      await input.fill('2'); await input.press('Tab');
      assert.equal(await page.evaluate(() => TD.state.doc.shapes[0].objectScale), 2);
      const saved = await page.evaluate(() => {
        const parsed = TD.app.parseProject(TD.app.projectJson(TD.state.doc));
        return parsed.blocks[0].shapes[0].objectScale;
      });
      assert.equal(saved, 2, `${name}: scale survives project file round trip`);
      const handle = await page.evaluate(() => {
        const t = TD.TYPES.rect, s = { ...TD.state.doc.shapes[0] };
        const h = t.handles(s).find(h => h.k === 'se') || t.handles(s).at(-1);
        const q = { x: h.x + 30, y: h.y + 20 };
        t.setHandle(s, h.k, q, {}, { ...s });
        const moved = t.handles(s).find(p => p.k === h.k);
        return Math.hypot(q.x - moved.x, q.y - moved.y);
      });
      assert(handle < 0.01, `${name}: resizing a scaled object follows the pointer`);
      await page.locator('#btnTikz').click();
      await page.waitForFunction(() => document.querySelector('#tikzOut').textContent.includes('scale around={2:'));
      await page.locator('#modalClose').click();
      await page.locator('#btnUndo').click();
      assert.equal(await input.inputValue(), '1');
      await page.locator('#btnRedo').click();
      assert.equal(await input.inputValue(), '2');
      await input.fill('0'); await input.press('Tab');
      assert.equal(await input.inputValue(), '2');
      await input.fill('1'); await input.press('Tab');
      assert.equal(await page.evaluate(() => TD.state.doc.shapes[0].objectScale), undefined, `${name}: reset restores the original source signature`);
      assert.deepEqual(browser.logs, [], `${name}: no runtime errors`);
      console.log(`✓ ${name}: Scale input, undo/redo, TikZ scope and ${coverage.length} shape/block bounds`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
