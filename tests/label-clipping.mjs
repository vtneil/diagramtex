// Compare the actual label image with an unclipped viewport of exactly the same
// contents. Cross-browser parity alone cannot detect clipping shared by both.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);
try {
  for (const name of testBrowsers()) {
    const browser = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      for (const source of ['$\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}$', '$\\cos^2 u-\\sin^2 u$']) {
        for (const size of [10, 14.06, 18, 24]) {
          const bounds = await browser.page.evaluate(({ source, size }) => {
            document.querySelector('#clipping-check')?.remove();
            const host = document.createElement('div');
            host.id = 'clipping-check';
            host.style.cssText = 'position:fixed;inset:0;z-index:100000;background:white';
            const markup = TD.textSvg(source, { size }, '#000', 0, 0, { export: true });
            const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
            const image = svg.querySelector('image');
            const width = +image.getAttribute('width'), height = +image.getAttribute('height');
            const src = image.getAttribute('href');
            host.innerHTML = `<svg width="1600" height="1000"><image x="${100 / 6}" y="${100 / 6}" width="${width}" height="${height}" transform="scale(6)" href="${src}"/></svg>`;
            host.dataset.src = src;
            document.body.append(host); return {width: width * 6, height: height * 6};
          }, { source, size });
          const settle = () => browser.page.evaluate(async () => {
            const element = document.querySelector('#clipping-check image');
            const img = new Image(); img.src = element.getAttribute('href'); await img.decode();
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          await settle();
          const actual = PNG.sync.read(await browser.page.screenshot());
          await browser.page.evaluate(() => {
            const host = document.querySelector('#clipping-check'), image = host.querySelector('image');
            const svg = new DOMParser().parseFromString(decodeURIComponent(escape(atob(host.dataset.src.split(',')[1]))), 'image/svg+xml');
            const root = svg.documentElement, w = +root.getAttribute('width'), h = +root.getAttribute('height');
            const margin = 10;
            const fo = root.querySelector('foreignObject');
            if (fo) {
              fo.setAttribute('width', w + margin * 2); fo.setAttribute('height', h + margin * 2);
              const wrapper = svg.createElementNS('http://www.w3.org/1999/xhtml', 'div');
              wrapper.setAttribute('style', `padding:${margin}px;width:${w}px;font-size:0`);
              while (fo.firstChild) wrapper.append(fo.firstChild);
              fo.append(wrapper);
            } else {
              const [x, y, vw, vh] = root.getAttribute('viewBox').split(/\s+/).map(Number);
              const sx = vw / w, sy = vh / h;
              root.setAttribute('viewBox', `${x - margin * sx} ${y - margin * sy} ${vw + 2 * margin * sx} ${vh + 2 * margin * sy}`);
            }
            root.setAttribute('width', w + margin * 2); root.setAttribute('height', h + margin * 2);
            image.setAttribute('x', 100 / 6 - margin); image.setAttribute('y', 100 / 6 - margin);
            image.setAttribute('width', w + margin * 2); image.setAttribute('height', h + margin * 2);
            image.setAttribute('href', 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg)))));
          });
          await settle();
          const reference = PNG.sync.read(await browser.page.screenshot());
          let lostInk = 0, ink = 0, minX = Infinity, maxX = 0;
          for (let i = 0; i < actual.data.length; i += 4) {
            const x = (i / 4) % actual.width, y = Math.floor(i / 4 / actual.width);
            if (actual.data[i] < 200) { ink++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
            if ((x < 100 || y < 100 || x >= 100 + bounds.width || y >= 100 + bounds.height) && reference.data[i] < 200) lostInk++;
          }
          assert.ok(ink > 400 && maxX - minX > bounds.width * 0.65, `${name}: formula must paint at the requested magnification`);
          if (lostInk >= 3) {
            const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-clipping-'));
            fs.writeFileSync(path.join(artifacts, 'actual.png'), PNG.sync.write(actual));
            fs.writeFileSync(path.join(artifacts, 'unclipped.png'), PNG.sync.write(reference));
            console.error(`Clipping screenshots: ${artifacts}`);
          }
          assert.ok(lostInk < 3, `${name}, ${source}, ${size}px: ${lostInk} clipped ink pixels`);
          console.log(`${name} ${size}px ${source}: no clipped ink`);
        }
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
