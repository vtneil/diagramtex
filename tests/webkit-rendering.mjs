// Verify painted glyphs, not just DOM bounds: WebKit bug 23113 reports correct geometry
// while painting positioned KaTeX spans outside their transformed foreignObject.
// npm run test:rendering [-- --dist]; install browsers: npx playwright install chromium webkit firefox
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser, testBrowsers } from './browser.mjs';
import { PNG } from 'pngjs';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';

await prepare();
const server = await serve(APP_DIR);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-rendering-'));
try {
 for (const name of testBrowsers()) {
  const artifacts = path.join(root, name); fs.mkdirSync(artifacts);
  const browser = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
  try {
  const page = browser.page;
  const errors = browser.logs;
  await page.evaluate(async () => {
    TD.app.newSample(); TD.app.cmd.setMode('document');
    await TD.math.whenReady(); await document.fonts.ready;
    TD.clearTextCache(); TD.docview.render();
    // Mode entry restores scroll on its next animation frame. Scroll to the
    // fixture only after that lifecycle and its unscaled page layout finish.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.locator('#docview .blk-diag').first().scrollIntoViewIfNeeded();
  // A unique colour separates diagram labels from paths, borders and normal document text.
  const diagnostic = 'foreignObject > .tx, foreignObject > .tx * { color: rgb(240, 0, 100) !important; }';
  const colourProbe = await page.addStyleTag({ content: diagnostic });
  async function checkPaint(scenario, target = page) {
    await target.evaluate(async () => {
      if (window.TD?.math) await window.TD.math.whenReady();
      for (const image of document.querySelectorAll('image.svg-label')) {
        const href = image.getAttribute('href');
        const xml = await (await fetch(href)).text();
        const svg = new DOMParser().parseFromString(xml, 'image/svg+xml');
        const style = svg.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = '.tx,.tx *,svg{color:rgb(240,0,100)!important}path[data-label-text],text{fill:rgb(240,0,100)!important}';
        svg.documentElement.append(style);
        const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
        image.setAttribute('href', src);
        await new Promise((resolve, reject) => { const load = new Image(); load.onload = resolve; load.onerror = reject; load.src = src; });
      }
      await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    const boxes = await target.locator('foreignObject,image.svg-label').evaluateAll(elements => elements.map(element => {
      const r = element.getBoundingClientRect();
      return { label: (element.getAttribute('aria-label') || element.textContent).slice(0, 60), left: r.left - 3, right: r.right + 3, top: r.top - 3, bottom: r.bottom + 3 };
    }));
    const file = path.join(artifacts, scenario + '.png');
    const png = PNG.sync.read(await target.screenshot({ path: file }));
    fs.writeFileSync(file + '.json', JSON.stringify(boxes));
    let ink = 0, outside = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4, [r, g, b] = png.data.subarray(i, i + 3);
      if (r < 200 || g > 80 || b < 70 || b > 150 || Math.abs((b - g) * 2.4 - (r - g)) > 12) continue;
      ink++;
      if (!boxes.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) outside++;
    }
    assert(ink > 100, `${scenario}: labels must actually paint`);
    assert(outside / ink < 0.015, `${scenario}: ${(100 * outside / ink).toFixed(1)}% of label pixels painted outside their SVG boxes (${file})`);
    console.log(`✓ ${name} ${scenario}: ${ink} label pixels, ${outside} outside`);
  }
  await checkPaint('document-fit');
  await page.locator('#docview [data-zoom="1"]').click();
  await checkPaint('document-100-percent');
  await page.evaluate(() => { document.querySelector('#docview').scrollTop += 120; });
  await checkPaint('document-scrolled');
  await page.evaluate(() => {
    TD.app.setActiveBlock(1); TD.app.cmd.setMode('diagram'); TD.app.zoomFit();
  });
  await checkPaint('canvas-fit');
  await page.evaluate(() => {
    TD.state.view.zoom *= 1.4; TD.state.view.x += 40; TD.state.view.y -= 30; TD.app.render();
  });
  await checkPaint('canvas-pan-zoom');
  await page.evaluate(() => {
    const shape = TD.state.doc.shapes.find(shape => shape.type === 'qc');
    TD.blocks.open(shape, operation => operation(shape));
  });
  await checkPaint('quantum-editor');
  await page.locator('[data-qe="cancel"]').click();
  await page.evaluate(() => {
    const model = TD.table.create(4, 2, 'booktabs');
    model.cells[0][0].t = 'Trial'; model.cells[0][1].t = '$x^2$';
    for (let i = 1; i < 4; i++) { model.cells[i][0].t = '$x_' + i + '$'; model.cells[i][1].t = '$' + i + '^2=' + i * i + '$'; }
    TD.app.cmd.setTable(true); TD.tableWs.model = model;
  });
  await page.waitForFunction(() => document.querySelector('.tb-pic')?.textContent.includes('Trial'));
  await checkPaint('table-preview');
  await page.evaluate(() => TD.app.cmd.setTable(false));
  const svg = await page.evaluate(() => TD.app.svgWithFonts(TD.app.shapesSvg(TD.state.doc.shapes)));
  assert(svg.includes('class="svg-label"') && svg.includes('data:image/svg+xml;base64,'), 'SVG embeds isolated label images with their fonts');
  const exported = await browser.context.newPage();
  await exported.setContent('<style>body{margin:60px;background:white}svg{width:1000px;height:auto}</style><div style="zoom:1.25">' + svg + '</div>');
  await exported.addStyleTag({ content: diagnostic });
  await checkPaint('standalone-svg', exported);
  const html = await page.evaluate(() => TD.docToHtml());
  await exported.setContent(html);
  await exported.addStyleTag({ content: diagnostic });
  await exported.locator('.blk-diag').first().scrollIntoViewIfNeeded();
  await checkPaint('standalone-html', exported);
  await exported.close();
  await page.evaluate(() => { TD.math.set('temml'); TD.app.render(); });
  await checkPaint('temml-canvas');
  // Accent and base must move together, not merely remain somewhere in the SVG.
  for (const engine of ['katex', 'temml']) {
    await page.evaluate(engine => {
      TD.math.set(engine);
      const shapes = ['hat', 'vec'].map((accent, i) => ({
        ...TD.TYPES.text.create({ x: i * 160, y: i * 120 }, {}), id: 'accent-' + accent,
        size: 'Large', text: '$\\' + accent + '{x}$',
      }));
      TD.app.newDoc('Accent movement', shapes, null, null, null, 'board');
    }, engine);
    for (const [zoom, x, y] of [[.75, -160, -120], [1.5, -100, -80], [2, -80, -60]]) {
      await page.evaluate(({ zoom, x, y }) => { Object.assign(TD.state.view, { zoom, x, y }); TD.app.render(); }, { zoom, x, y });
      await page.evaluate(() => TD.math.whenReady());
      const images = page.locator('#content image.svg-label');
      assert.equal(await images.count(), 2);
      for (let i = 0; i < 2; i++) {
        await images.nth(i).evaluate(async image => {
          const xml = await (await fetch(image.getAttribute('href'))).text();
          const svg = new DOMParser().parseFromString(xml, 'image/svg+xml');
          const style = svg.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = '.tx{color:black!important}.accent-body,[data-label-accent],[data-mml-node="mover"]>g:last-child{color:rgb(240,0,100)!important;fill:rgb(240,0,100)!important}';
          svg.documentElement.append(style);
          const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
          image.setAttribute('href', src);
          await new Promise((resolve, reject) => { const load = new Image(); load.onload = resolve; load.onerror = reject; load.src = src; });
        });
        const png = PNG.sync.read(await images.nth(i).screenshot({ path: path.join(artifacts, `${engine}-accent-${i}-${zoom}.png`) }));
        const bounds = predicate => {
          let left = png.width, right = -1, top = png.height, bottom = -1;
          for (let py = 0; py < png.height; py++) for (let px = 0; px < png.width; px++) {
            const offset = (py * png.width + px) * 4;
            if (!predicate(...png.data.subarray(offset, offset + 3))) continue;
            left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
          }
          return { left, right, top, bottom };
        };
        const accent = bounds((r, g, b) => r - g > 40 && b - g > 8);
        const base = bounds((r, g, b) => Math.max(r, g, b) < 130);
        assert(accent.right >= accent.left && base.right >= base.left, `${engine}: accent and base must both paint`);
        const centre = (accent.left + accent.right) / 2;
        assert(centre >= base.left && centre <= base.right, `${engine}/${i}/${zoom}: accent ${JSON.stringify(accent)} vs base ${JSON.stringify(base)}`);
        assert(accent.bottom < base.bottom && accent.top < base.top, `${engine}: accent must stay above its base`);
      }
      console.log(`✓ ${name} ${engine}: hats and vectors stay attached at ${zoom * 100}% after pan`);
    }
  }

  await colourProbe.evaluate(element => element.remove());
  await page.evaluate(() => {
    TD.math.set('katex'); TD.app.cmd.setMode('document');
    document.querySelector('#docview [data-zoom="1"]').click();
    const root = document.querySelector('#docview');
    root.scrollTop += root.querySelector('.blk-diag').getBoundingClientRect().top - root.getBoundingClientRect().top - 40;
  });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await page.screenshot({ path: path.join(artifacts, 'document.png') });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(name + ' screenshots: ' + artifacts);
  } finally { await browser.close(); }
 }
} finally { server.close(); }
