// Real input is essential: HTMLElement.click() skips Safari's mouse focus behaviour.
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { waitForAppReady, reloadApp, STARTUP_TIMEOUT } from './browser.mjs';

export async function runBrowserUI(page, filter = '') {
  const results = [];
  async function test(name, fn) {
    name = 'Browser UI: ' + name;
    if (filter && !name.includes(filter)) return;
    const start = Date.now(), result = { name, err: null, goldens: [], tex: [] };
    try { await fn(); } catch (error) { result.err = error.stack; }
    result.ms = Date.now() - start; results.push(result);
  }
  async function language(value) {
    await page.locator('#languageTrigger').click();
    await page.locator(`[data-language="${value}"]`).click();
    await page.waitForFunction(value => document.documentElement.lang === value, value);
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    assert.equal(await page.locator('#languageTrigger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('diagramtex.language')), value);
  }
  await test('language selection with mouse, persistence and both themes', async () => {
    const original = await page.evaluate(() => TD.app.projectJson(TD.state.doc));
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-theme-pick="${theme}"]`).click();
      await language('th');
      assert.equal((await page.locator('#btnExport').textContent()).trim(), 'ส่งออก');
      assert.equal(await page.evaluate(() => TD.app.projectJson(TD.state.doc)), original, 'language preserves project');
      await reloadApp(page);
      assert.equal(await page.locator('html').getAttribute('lang'), 'th', 'choice survives reload');
      await language('en');
      assert.equal((await page.locator('#btnExport').textContent()).trim(), 'Export');
    }
    await page.locator('[data-theme-pick="system"]').click();
  });
  await test('language selection with keyboard and outside dismissal', async () => {
    const trigger = page.locator('#languageTrigger');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.language), 'th');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.lang === 'th');
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'languageTrigger');
    await trigger.click();
    await page.locator('.brand').click();
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    await language('en');
  });
  await test('real document and diagram controls stay usable', async () => {
    await page.evaluate(() => TD.app.newDoc('Browser UI scratch', null, null, null, null, 'classic'));
    await page.locator('#classicSeg [data-mode="document"]').click();
    await page.waitForFunction(() => TD.state.mode === 'document');
    await page.locator('#docName').fill('Browser UI renamed');
    await page.locator('#docName').press('Enter');
    await page.waitForFunction(() => document.querySelector('#docview .doc-title')?.textContent === 'Browser UI renamed');
    await page.locator('#classicSeg [data-mode="diagram"]').click();
    await page.waitForFunction(() => TD.state.mode === 'diagram');
    await page.locator('#engineBox [data-engine="temml"]').click();
    assert.equal(await page.evaluate(() => TD.math.engine), 'temml');
    await page.locator('#engineBox [data-engine="katex"]').click();
    assert.equal(await page.evaluate(() => TD.math.engine), 'katex');
  });
  await test('Document text formatting stays compact and usable on narrow pages', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Compact document editor', null, null,
        [{ type: 'text', text: 'Compact text with $x^2$.' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    await page.locator('#docview [data-zoom="1"]').click();
    await page.locator('#docview .blk-text .blk-body').click();
    const bar = page.locator('#docview .fmt-bar'), editor = page.locator('#docview .blk-ed');
    await editor.waitFor();
    const source = await editor.inputValue();
    const metrics = await bar.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      tops: [...element.querySelectorAll('button, select, .fmt-col')].map(e => e.getBoundingClientRect().top),
    }));
    assert(metrics.height <= 40, 'formatting toolbar stays a compact single row at 100%');
    assert(Math.max(...metrics.tops) - Math.min(...metrics.tops) <= 1, 'controls share one row');
    await editor.evaluate(element => { element.focus(); element.setSelectionRange(0, 7); });
    await bar.locator('[data-fmt="b"]').click();
    assert((await editor.inputValue()).startsWith('\\textbf{Compact}'), 'bold keeps the editor selection');
    await page.evaluate(() => {
      Object.assign(TD.state.doc.page, { paper: 'custom', w: 10, h: 20, ml: 2, mr: 2 });
      TD.docview.render();
    });
    assert(await bar.evaluate(e => e.scrollWidth > e.clientWidth), 'narrow paper uses horizontal toolbar scrolling');
    await bar.locator('[data-fmt="al:right"]').click();
    assert.equal(await page.evaluate(() => TD.state.doc.blocks[0].align), 'right', 'offscreen alignment button remains reachable');
    assert((await editor.inputValue()).includes(source.slice(7)), 'formatting retains the rest of the text');
    assert((await bar.boundingBox()).height <= 40, 'narrow paper does not add toolbar rows');
  });
  await test('PWA Install follows browser eligibility, language and installation', async () => {
    const button = page.locator('#btnInstall');
    assert.equal(await button.count(), 0, 'no install offer means no install button');
    const offer = async (outcome = 'dismissed', fails = false) => page.evaluate(({ outcome, fails }) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      window.__installCalls = 0;
      Object.assign(event, { prompt: async () => { window.__installCalls++; if (fails) throw new Error('Offer expired'); },
        userChoice: Promise.resolve({ outcome }) });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }, { outcome, fails });
    assert(await offer(), 'browser offer is retained for the user click');
    await button.waitFor();
    assert.equal(await button.evaluate(e => e.nextElementSibling.id), 'languagePicker');
    assert.equal(await page.evaluate(() => window.__installCalls), 0, 'never prompts without a click');
    await language('th');
    assert.equal(await button.innerText(), 'ติดตั้ง');
    await language('en');
    assert.equal(await button.innerText(), 'Install');
    await button.click();
    assert.equal(await page.evaluate(() => window.__installCalls), 1);
    await button.waitFor({ state: 'detached' });
    await offer('accepted'); await button.click();
    await button.waitFor({ state: 'detached' });
    // A browser can issue a new offer after uninstalling, so no sticky local flag.
    await offer(); await button.waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await button.waitFor({ state: 'detached' });
    await offer('dismissed', true); await button.click();
    await button.waitFor({ state: 'detached' });
    // Installation from another tab also hides an already displayed offer.
    await offer(); await button.waitFor();
    await page.evaluate(async () => {
      const channel = new BroadcastChannel('diagramtex-pwa-install');
      channel.postMessage('installed');
      await new Promise(r => setTimeout(r, 0)); channel.close();
    });
    await button.waitFor({ state: 'detached' });
  });
  await test('PWA Install stays hidden in installed app windows', async () => {
    for (const legacy of [false, true]) {
      const context = await page.context().browser().newContext({ serviceWorkers: 'block' });
      try {
        await context.addInitScript(legacy => {
          localStorage.setItem('diagramtex.tour', 'seen');
          if (legacy) Object.defineProperty(navigator, 'standalone', { value: true });
          else {
            const original = window.matchMedia.bind(window);
            window.matchMedia = query => {
              const result = original(query);
              if (query.includes('display-mode: standalone')) Object.defineProperty(result, 'matches', { value: true });
              return result;
            };
          }
        }, legacy);
        const app = await context.newPage(); app.setDefaultNavigationTimeout(STARTUP_TIMEOUT); await app.goto(page.url());
        await waitForAppReady(app);
        await app.evaluate(() => {
          const event = new Event('beforeinstallprompt', { cancelable: true });
          Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
          window.dispatchEvent(event);
        });
        assert.equal(await app.locator('#btnInstall').count(), 0);
      } finally { await context.close(); }
    }
  });
  await test('UI language preserves math pixels and measurements', async () => {
    await language('en');
    await page.evaluate(() => {
      const text = [String.raw`$\vec F=q(\vec E+\vec v\times\vec B)$`,
        String.raw`$\hat x+\bar y+\overline{AB}$`,
        String.raw`$\frac{a+b}{c+d}+\sqrt{x^2+y^2}$`,
        String.raw`$\displaystyle\sum_{n=1}^\infty\frac1{n^2}$`,
        String.raw`$\begin{pmatrix}a&b\\c&d\end{pmatrix}$`,
        String.raw`$\text{ภาษาไทย }\alpha\to\beta$`].join('\n');
      const shape = { ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'locale-math', text };
      TD.app.newDoc('Language-independent math', null, null,
        [{ type: 'diagram', shapes: [shape] }, { type: 'text', text: text.replaceAll('\n', '\n\n') }],
        { title: false }, 'classic');
    });
    const project = await page.evaluate(() => TD.app.projectJson(TD.state.doc));
    try {
    for (const engine of ['katex', 'temml']) {
      await page.locator(`#engineBox [data-engine="${engine}"]`).click();
      await page.evaluate(() => TD.math.whenReady());
      for (const mode of ['diagram', 'document']) {
        await page.locator(`#classicSeg [data-mode="${mode}"]`).click();
        if (mode === 'document') await page.locator('#docview [data-zoom="1"]').click();
        else await page.evaluate(() => { TD.app.zoomFit(); });
        const targets = mode === 'diagram' ? ['#content image.svg-label']
          : ['#docview .blk-diag image.svg-label', '#docview .blk-text .blk-body'];
        let baseline;
        for (const locale of ['en', 'th', 'en']) {
          await language(locale);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            TD.clearTextCache();
            await Promise.all([...document.querySelectorAll('image.svg-label')].map(element => new Promise((resolve, reject) => {
              const image = new Image(); image.onload = () => image.decode().then(resolve, resolve); image.onerror = reject; image.src = element.getAttribute('href');
            })));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          const metrics = await page.evaluate(() => {
            const shape = TD.state.doc.blocks[0].shapes[0], { w, h } = TD.textBox(shape.text, shape);
            return { w, h, engine: TD.math.engine, project: TD.app.projectJson(TD.state.doc) };
          });
          assert.equal(metrics.engine, engine); assert.equal(metrics.project, project);
          const pictures = [];
          for (const selector of targets) {
            // SVG labels are transparent: element screenshots include the canvas
            // grid below them. Chromium can rasterise that pattern at a different
            // subpixel phase after repainting; compare the math on plain paper.
            const png = PNG.sync.read(await page.locator(selector).screenshot({
              style: '#gridRect, #origin { visibility: hidden !important; }',
            }));
            pictures.push({ width: png.width, height: png.height, data: png.data });
          }
          if (!baseline) baseline = { metrics, pictures };
          else {
            assert.deepEqual(metrics, baseline.metrics, `${engine}/${mode}/${locale}: math measurements and source`);
            for (let i = 0; i < pictures.length; i++) {
              const actual = pictures[i], expected = baseline.pictures[i];
              assert.equal(actual.width, expected.width, `${engine}/${mode}/${locale}: image width`);
              assert.equal(actual.height, expected.height, `${engine}/${mode}/${locale}: image height`);
              assert(actual.data.equals(expected.data), `${engine}/${mode}/${locale}: math pixels changed after UI translation`);
            }
          }
        }
      }
    }
    } finally {
      await language('en');
      await page.locator('#engineBox [data-engine="katex"]').click();
    }
  });
  await test('guide language links remain clickable', async () => {
    const guide = await page.context().newPage();
    try {
      await guide.goto(new URL('guide/#files', page.url()).href);
      await guide.locator('.language-picker > summary').click();
      await guide.locator('[data-guide-lang="th"]').click();
      await guide.waitForURL('**/guide/th.html#files');
      assert.equal(await guide.locator('html').getAttribute('lang'), 'th');
      await guide.locator('.language-picker > summary').click();
      await guide.locator('[data-guide-lang="en"]').click();
      await guide.waitForURL('**/guide/#files');
      assert.equal(await guide.locator('html').getAttribute('lang'), 'en');
    } finally { await guide.close(); }
  });
  return results;
}
