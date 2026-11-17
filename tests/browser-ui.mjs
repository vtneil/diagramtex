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
  await test('Document text toolbar is pinned to the view and shown only while editing text in place', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Compact document editor', null, null,
        [{ type: 'text', text: 'Compact text with $x^2$.' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    await page.locator('#docview [data-zoom="1"]').click();
    const strip = page.locator('#docview .doc-fmt'), bar = strip.locator('.tb-bar'), editor = page.locator('#docview .blk-ie');
    const text = () => page.evaluate(() => TD.state.doc.blocks[0].text);
    const select = (from, to) => editor.evaluate((ed, [a, z]) => { ed.focus(); const t = ed.querySelector('p').firstChild; const r = document.createRange(); r.setStart(t, a); r.setEnd(t, z); getSelection().removeAllRanges(); getSelection().addRange(r); }, [from, to]);
    const pageTop = () => page.evaluate(() => document.querySelector('#docview .doc-page').getBoundingClientRect().top);
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'hidden', 'no toolbar until a text block is edited');
    const top0 = await pageTop();
    await page.locator('#docview .blk-text .blk-body').click();
    await editor.waitFor();
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'visible', 'editing text shows the toolbar');
    assert.equal(await pageTop(), top0, 'showing the toolbar does not move the page');
    const source = await text();
    assert.equal(await editor.locator('.ie-m').count(), 1, 'the formula shows as maths while editing');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('blk-ie')), true, 'the block is edited where it is');
    const metrics = await bar.evaluate(element => ({
      top: element.getBoundingClientRect().top - document.querySelector('#docview').getBoundingClientRect().top,
      tops: [...element.children].map(e => Math.round(e.getBoundingClientRect().top)),
      fits: element.scrollWidth <= element.clientWidth,
    }));
    assert(metrics.top <= 8, 'the toolbar sits at the top of the view');
    assert(Math.max(...metrics.tops) - Math.min(...metrics.tops) <= 1, 'controls share one row');
    assert(metrics.fits, 'the toolbar fits on one line at 1400px');
    await select(0, 7);
    await bar.locator('[data-fmt="b"]').click();
    assert((await text()).startsWith('\\textbf{Compact}'), 'bold writes \\textbf into the source');
    assert.equal(await editor.locator('b').count(), 1, 'and shows the text bold');
    await bar.locator('[data-fal][data-v="r"]').click();
    assert.equal(await page.evaluate(() => TD.state.doc.blocks[0].align), 'right', 'the alignment switch aligns the block');
    assert.equal(await bar.locator('[data-fal].on').getAttribute('data-v'), 'r');
    assert((await text()).includes(source.slice(7)), 'formatting retains the rest of the text');
    await editor.evaluate(ed => { ed.focus(); const t = ed.querySelector('p b').nextSibling; const r = document.createRange(); r.setStart(t, 1); r.setEnd(t, 5); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await bar.locator('[data-fapply="color"]').click();
    assert((await text()).includes('\\textcolor{'), 'the colour button applies the last colour at once');
    assert.equal(await page.evaluate(() => { const c = document.querySelector('.cp'); return !!c && getComputedStyle(c).display !== 'none'; }), false, 'without the picker');
    await bar.locator('[data-fpick="color"]').click();
    await page.locator('.cp .cp-edit').waitFor();
    assert(await page.locator('.cp .cp-edit').isVisible(), "the arrow opens the app's own palette, with its editable presets");
    await page.keyboard.press('Escape');
    assert(await bar.locator('.tb-math').count(), 'inline maths shows a maths italic x');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#docview .blk-ie'));
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'hidden', 'leaving the text hides the toolbar');
    assert.equal(await pageTop(), top0, 'hiding the toolbar does not move the page');
  });
  await test('Document text is edited in place and written back as its LaTeX source', async () => {
    const SRC = '# Intro\n\nSome \\textbf{bold}, $x^2$, ``quotes\'\' -- \\LaTeX{} and \\foo{bar}.\n\n- one\n  - nested\n- [ ] task\n\n$$\\int_0^1 f$$\n\nLast.';
    await page.evaluate((text) => {
      TD.app.newDoc('Inline editor', null, null, [{ type: 'text', text }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    }, SRC);
    const editor = page.locator('#docview .blk-ie'), text = () => page.evaluate(() => TD.state.doc.blocks[0].text);
    const geo = () => page.evaluate(() => { const r = document.querySelector('#docview .blk[data-i="0"] .blk-body').getBoundingClientRect(); return [r.top, r.height]; });
    const before = await geo();
    await page.locator('#docview .blk-text p').last().click();
    await editor.waitFor();
    assert.deepEqual(await geo(), before, 'the editor lays the text out as the page does');
    await editor.evaluate(ed => { const p = [...ed.querySelectorAll(':scope > p')].pop(); const r = document.createRange(); r.setStart(p.firstChild, p.firstChild.nodeValue.length); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    assert.equal(await text(), SRC, 'opening the editor keeps the source exactly');
    await page.keyboard.type(' Then $y$ ok');
    assert((await text()).endsWith('Last. Then $y$ ok'), 'a closing $ turns the formula into maths');
    assert.equal(await editor.locator('p:last-child .ie-m').count(), 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item');
    await page.keyboard.press('Enter');
    await page.keyboard.type('sub');
    await page.keyboard.press('Tab');
    assert((await text()).endsWith('\n\n- item\n  - sub'), '"- " starts a list, Enter adds an item and Tab nests it');
    await page.keyboard.press('ControlOrMeta+z');
    assert(!(await text()).includes('  - sub'), 'undo takes back the last step');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert((await text()).endsWith('  - sub'), 'redo puts it back');
    assert((await text()).startsWith(SRC), 'what was not edited keeps its source');
    await editor.locator('.cbx').click();
    assert((await text()).includes('- [x] task'), 'a checkbox ticks in place');
    await editor.locator('.ie-m').first().click();
    const box = page.locator('#docPop .td-pop-ta');
    await box.waitFor();
    await box.fill('a+b');
    await box.press('Enter');
    assert((await text()).includes('$a+b$'), 'a formula opens in a box and its edit is written back');
    await page.locator('#docview .doc-fmt [data-fmt="src"]').click();
    assert.equal(await page.locator('#docview .blk-ed').inputValue(), await text(), 'the source button shows the LaTeX');
    await page.locator('#docview .doc-fmt [data-fmt="src"]').click();
    await editor.waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#docview .blk-ie'));
  });
  await test('Document undo and redo cover blocks, typing, tables and page setup, and spare diagram edits', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Document undo', null, null, [{ type: 'text', text: 'First.' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    const sum = () => page.evaluate(() => TD.state.doc.blocks.map(b => b.type === 'text' ? 't:' + b.text : b.type === 'table' ? 'T:' + b.rows[0][0] : b.type[0] + b.shapes.length).join('|'));
    const key = async (redo = false) => { await page.keyboard.press(redo ? 'ControlOrMeta+Shift+z' : 'ControlOrMeta+z'); };
    const away = () => page.locator('#docview').click({ position: { x: 20, y: 400 } });
    await page.locator('#docview .doc-page > .ins:last-child [data-add="text"]').click();
    await page.keyboard.type('Hello');
    assert.equal(await sum(), 't:First.|d0|t:Hello');
    await key();
    assert.equal(await sum(), 't:First.|d0|t:', 'undo takes back the typing, in the editor');
    assert.equal(await page.locator('#docview .blk-ie').count(), 1);
    await key();
    assert.equal(await sum(), 't:First.|d0', 'then the new block');
    await key(true); await key(true);
    assert.equal(await sum(), 't:First.|d0|t:Hello', 'redo brings both back');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#docview .blk[data-i="0"] [data-rm]').click());
    assert.equal(await sum(), 'd0|t:Hello');
    // a diagram edited on the canvas keeps its edit through the document's undo
    await page.evaluate(() => { TD.app.cmd.setMode('diagram'); TD.state.doc.shapes.push({ ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'undo-kept' }); TD.app.cmd.setMode('document'); });
    await away(); await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello', 'undo puts the deleted block back and leaves the diagram as edited');
    await page.locator('#docview .doc-page > .ins:last-child [data-add="table"]').click();
    await page.keyboard.type('abc');
    await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello|T:', 'undo in a cell takes back its typing');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cell')), true, 'and keeps the cell focused');
    await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello');
    const mt = await page.evaluate(() => TD.state.doc.page.mt);
    await page.locator('#props button', { hasText: 'Narrow' }).click();
    assert.notEqual(await page.evaluate(() => TD.state.doc.page.mt), mt);
    await away(); await key();
    assert.equal(await page.evaluate(() => TD.state.doc.page.mt), mt, 'page setup is undone too');
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
