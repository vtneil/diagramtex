// Check painted line positions: correct alignment must reach both canvas labels
// and standalone SVGs, for natural multiline width and explicit text width.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-alignment-'));
const server = await serve(APP_DIR, { '/__alignment/': artifacts });
try {
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, `http://127.0.0.1:${server.port}/`);
    const exportedPage = await b.context.newPage();
    try {
      for (const engine of ['katex', 'temml']) for (const fixed of [false, true]) for (const exported of [false, true]) {
        const positions = {};
        for (const align of ['left', 'center', 'right']) {
          const name = `${browser}-${engine}-${fixed ? 'fixed' : 'natural'}-${exported ? 'export' : 'canvas'}-${align}`;
          const markup = await b.page.evaluate(async ({ engine, fixed, exported, align }) => {
            TD.math.set(engine);
            await TD.math.whenReady();
            document.querySelector('#alignment-check')?.remove();
            const host = document.createElement('div'); host.id = 'alignment-check';
            host.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:120px;z-index:2147483647;background:white';
            const text = 'word $xxxxxxxx$\n$x$';
            const style = { size: 'Large', align, ...(fixed ? { tw: 220 } : {}) };
            host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><style>.hitfill{fill:transparent;stroke:none}</style>${TD.textSvg(text, style, '#e00070', 180, 60, { export: exported })}</svg>`;
            document.body.append(host);
            return new XMLSerializer().serializeToString(host.firstElementChild);
          }, { engine, fixed, exported, align });
          let target = b.page, locator = b.page.locator('#alignment-check');
          if (exported) {
            fs.writeFileSync(path.join(artifacts, name + '.svg'), markup);
            await exportedPage.goto(`http://127.0.0.1:${server.port}/__alignment/${name}.svg`);
            target = exportedPage; locator = target.locator('svg').first();
            assert.equal(await target.locator('parsererror').count(), 0);
          }
          await target.evaluate(async () => {
            await Promise.all([...document.querySelectorAll('image.svg-label')].map(e => {
              const i = new Image(); i.src = e.getAttribute('href'); return i.decode();
            }));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          const png = PNG.sync.read(await locator.screenshot({ path: path.join(artifacts, name + '.png') }));
          const rows = [];
          for (let y = 0; y < png.height; y++) {
            const xs = [];
            for (let x = 0; x < png.width; x++) {
              const at = (y * png.width + x) * 4;
              if (png.data[at] > 150 && png.data[at + 1] < 90 && png.data[at + 2] > 65 && png.data[at + 2] < 180) xs.push(x);
            }
            if (xs.length) rows.push({ y, left: Math.min(...xs), right: Math.max(...xs) });
          }
          const lines = [];
          for (const row of rows) {
            if (!lines.length || row.y > lines.at(-1).at(-1).y + 1) lines.push([]);
            lines.at(-1).push(row);
          }
          assert.equal(lines.length, 2, name + ': both text lines paint');
          positions[align] = Math.min(...lines[1].map(row => row.left));
        }
        assert(positions.left + 20 < positions.center && positions.center + 20 < positions.right,
          `${browser}/${engine}/${fixed}/${exported}: short line must move left → centre → right: ${JSON.stringify(positions)}`);
        console.log(`${browser} ${engine} ${fixed ? 'fixed width' : 'multiline'} ${exported ? 'SVG export' : 'canvas'}: alignment follows the selected setting`);
      }
      assert.deepEqual(b.logs, [], browser + ': no runtime errors');
    } finally { await exportedPage.close(); await b.close(); }
  }
} finally { await server.close(); }
console.log(`Alignment screenshots: ${artifacts}`);
