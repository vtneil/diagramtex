// Document zoom must scale a fixed paper layout, never reflow text or move page boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser, testBrowsers } from './browser.mjs';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';

await prepare();
const server = await serve(APP_DIR);
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-document-'));
try {
  for (const name of testBrowsers()) {
    const browser = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      const page = browser.page;
      await page.evaluate(async () => {
        TD.app.newSample(); TD.app.cmd.setMode('document');
        await document.fonts.ready; TD.clearTextCache(); TD.docview.render();
      });
      await page.locator('#docview [data-zoom="1"]').click();
      const measure = async () => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return page.evaluate(() => {
          const paper = document.querySelector('#docview .doc-page'), rect = paper.getBoundingClientRect();
          const z = rect.width / paper.offsetWidth;
          const paragraph = paper.querySelector('.blk-text p'), range = document.createRange();
          range.selectNodeContents(paragraph);
          const lines = new Set([...range.getClientRects()].filter(r => r.height > 0).map(r => Math.round((r.top - rect.top) / z)));
          return {
            width: paper.offsetWidth, height: paper.offsetHeight, lines: lines.size,
            blocks: [...paper.querySelectorAll('.blk')].map(e => (e.getBoundingClientRect().top - rect.top) / z),
            breaks: [...paper.querySelectorAll('.pg-brk')].map(e => (e.getBoundingClientRect().top - rect.top) / z),
          };
        });
      };
      const scrollbar = await page.evaluate(() => {
        const root = document.querySelector('#docview'), panel = document.querySelector('#rightCol');
        const gutter = Math.max(16, root.offsetWidth - root.clientWidth);
        return { panelRight: panel.getBoundingClientRect().right, scrollbarLeft: root.getBoundingClientRect().right - gutter };
      });
      assert(scrollbar.panelRight <= scrollbar.scrollbarLeft - 7, `${name}: sidebar overlaps the document scrollbar`);
      await page.evaluate(() => { document.querySelector('#docview').scrollTop = 0; });
      const scrollPoint = await page.locator('#docview').evaluate(root => {
        const rect = root.getBoundingClientRect();
        return { x: rect.right - 4, y: rect.top + rect.height / 2 };
      });
      await page.mouse.move(scrollPoint.x, scrollPoint.y);
      await page.mouse.wheel(0, 240);
      await page.waitForFunction(() => document.querySelector('#docview').scrollTop > 0, null, { timeout: 5000 });
      const initial = await measure();
      let capturedMinimum = false;
      for (const [direction, times] of [['out', 12], ['in', 4], ['in', 16], ['out', 12]]) {
        for (let i = 0; i < times; i++) await page.locator(`#docview [data-zoom="${direction}"]`).click();
        const actual = await measure();
        if (!capturedMinimum && direction === 'out') {
          await page.evaluate(() => { document.querySelector('#docview').scrollTop = 0; });
          await page.mouse.move(1, 1);
          await page.screenshot({ path: path.join(screenshots, name.toLowerCase() + '-minimum.png') });
          capturedMinimum = true;
          const overflow = await page.evaluate(() => {
            const root = document.querySelector('#docview'), sheet = root.querySelector('.doc-sheet');
            const css = getComputedStyle(root);
            // the content ends at the sheet's bottom (below the text toolbar, which keeps its room when hidden)
            const bottom = sheet.getBoundingClientRect().bottom - root.getBoundingClientRect().top + root.scrollTop;
            return root.scrollHeight - Math.max(root.clientHeight, bottom + parseFloat(css.paddingBottom));
          });
          assert(overflow < 2, `${name}: zooming out cannot leave a tall blank scroll area`);
        }
        assert.equal(actual.width, initial.width, `${name}: paper width cannot reflow`);
        assert.equal(actual.lines, initial.lines, `${name}: paragraph wrapping cannot change`);
        assert.equal(actual.breaks.length, initial.breaks.length, `${name}: page count stays fixed`);
        for (const key of ['blocks', 'breaks']) actual[key].forEach((top, i) => assert(Math.abs(top - initial[key][i]) < 2, `${name}: ${key}[${i}] moved by ${top - initial[key][i]} paper pixels`));
      }

      // Fit changes only the displayed scale when the viewport gets narrower.
      await page.locator('#docview [data-zoom="fit"]').click();
      await page.setViewportSize({ width: 1200, height: 850 });
      const resized = await measure();
      assert.equal(resized.lines, initial.lines, `${name}: resizing cannot rewrap the paper`);
      resized.breaks.forEach((top, i) => assert(Math.abs(top - initial.breaks[i]) < 2, `${name}: divider moved on resize`));
      await page.locator('#docview [data-zoom="1"]').click();
      await page.evaluate(() => { const root = document.querySelector('#docview'); root.scrollTop = 500; root.scrollLeft = 40; });
      const point = () => page.evaluate(() => {
        const root = document.querySelector('#docview'), paper = root.querySelector('.doc-page');
        const view = root.getBoundingClientRect(), rect = paper.getBoundingClientRect(), z = rect.width / paper.offsetWidth;
        return { x: (view.left + root.clientWidth / 2 - rect.left) / z, y: (view.top + root.clientHeight / 2 - rect.top) / z };
      });
      const before = await point();
      await page.locator('#docview [data-zoom="in"]').click();
      const after = await point();
      assert(Math.abs(before.x - after.x) < 2 && Math.abs(before.y - after.y) < 2, `${name}: zoom keeps the paper point under the view centre`);
      const savedScroll = await page.locator('#docview').evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
      await page.locator('[data-mode="diagram"]').click();
      await page.locator('[data-mode="document"]').click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const returnedScroll = await page.locator('#docview').evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }));
      assert(Math.abs(savedScroll.top - returnedScroll.top) < 2 && Math.abs(savedScroll.left - returnedScroll.left) < 2, `${name}: Document/Diagram round trip preserves both scroll axes`);
      // Document navigation uses the same selector and follows the first visible diagram.
      await page.evaluate(() => {
        const d = TD.app.state.doc;
        d.blocks = [
          { type: 'diagram', shapes: [], name: 'First' },
          { type: 'text', text: Array(100).fill('Document spacing paragraph.').join('\n\n') },
          { type: 'diagram', shapes: [], name: 'Second' },
        ];
        d.active = 0;
        TD.docview.render();
        TD.app.setActiveBlock(0);
      });
      await page.waitForFunction(() => document.querySelector('#blockSel').textContent === 'First');
      assert(await page.locator('#blockNav').isVisible(), `${name}: document diagram selector is visible`);
      await page.locator('#blockNext').click();
      await page.waitForFunction(() => TD.app.state.doc.active === 2 && document.querySelector('#blockSel').textContent === 'Second');
      await page.evaluate(() => { const root = document.querySelector('#docview'); root.dispatchEvent(new WheelEvent('wheel')); root.scrollTop = 0; });
      await page.waitForFunction(() => TD.app.state.doc.active === 0 && document.querySelector('#blockSel').textContent === 'First');
      await page.locator('#blockSel').click();
      await page.locator('.diagram-gallery [data-block="2"]').click();
      await page.waitForFunction(() => TD.app.state.mode === 'document' && TD.app.state.doc.active === 2);
      await page.emulateMedia({ media: 'print' });
      const print = await page.evaluate(() => ({
        transform: getComputedStyle(document.querySelector('.doc-page')).transform,
        overflow: getComputedStyle(document.querySelector('.doc-sheet')).overflow,
        position: getComputedStyle(document.querySelector('.doc-page')).position,
      }));
      assert.deepEqual(print, { transform: 'none', overflow: 'visible', position: 'static' }, `${name}: printing restores the natural paper layout`);
      assert.deepEqual(browser.logs, [], name + ': no runtime errors');
      console.log(`✓ ${name}: sidebar clears the scrollbar; document layout stays fixed through zoom`);
    } finally { await browser.close(); }
  }
  console.log('Document screenshots: ' + screenshots);
} finally { server.close(); }
