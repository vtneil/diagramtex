// Real compilation in a worker, with controllable message delivery so loading
// interactions, progressive replacement and cancellation are deterministic.
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);
try {
  for (const name of testBrowsers()) {
    const b = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      await b.page.evaluate(() => {
        const Native = window.Worker;
        window.__held = []; window.__hold = true; window.__mainTemml = []; window.__mainKatex = [];
        window.Worker = class {
          onmessage = null; onerror = null;
          constructor(...args) {
            this.native = new Native(...args);
            // the worker answers batches: each result is held on its own
            this.native.onmessage = event => {
              for (const data of [event.data].flat()) {
                const deliver = () => this.onmessage?.({ data });
                if (window.__hold) window.__held.push(deliver); else deliver();
              }
            };
            this.native.onerror = event => this.onerror?.(event);
          }
          postMessage(message) { this.native.postMessage(message); }
          terminate() { this.native.terminate(); }
        };
        const render = window.temml.renderToString;
        window.temml.renderToString = (tex, options) => { window.__mainTemml.push(tex); return render(tex, options); };
        const katexRender = window.katex.renderToString;
        window.katex.renderToString = (tex, options) => { window.__mainKatex.push(tex); return katexRender(tex, options); };
        const shapes = Array.from({ length: 12 }, (_, i) => ({ ...TD.TYPES.text.create({ x: 120 + i % 3 * 190, y: 120 + Math.floor(i / 3) * 90 }, {}),
          id: 'loading-' + i, text: `$\\sum_{i=0}^{${i + 1}}i^2+\\hat{x}_{${i}}$` }));
        TD.app.newDoc('Progressive math', null, null, null, null, 'page', { pages: 1, shapes });
        window.__previousNodes = [...document.querySelectorAll('#content image.svg-label')];
        window.__previousImages = window.__previousNodes.map(e => e.getAttribute('href'));
        window.__shapes = JSON.stringify(TD.state.doc.sheet.shapes);
      });
      await b.page.locator('#engineBox [data-engine="temml"]').click();
      const initial = await b.page.evaluate(() => ({ pending: TD.math.pending, worker: TD.math.usingWorker,
        faded: document.querySelectorAll('#content .math-pending').length,
        images: [...document.querySelectorAll('#content image.svg-label')].map(e => e.getAttribute('href')),
        previous: window.__previousImages, mainCompiles: window.__mainTemml.filter(t => t.includes('\\sum')).length }));
      assert(initial.pending > 0 && initial.worker, name + ': compilation runs in a worker');
      assert.equal(initial.faded, 12, 'Existing labels stay visible as provisional previews');
      assert.deepEqual(initial.images, initial.previous, 'Keep the exact existing KaTeX image resources');
      assert(await b.page.evaluate(() => [...document.querySelectorAll('#content image.svg-label')].every((e, i) => e === window.__previousNodes[i])), 'Keep the existing decoded image elements');
      assert.equal(initial.mainCompiles, 0, 'The switch must not compile these formulae on the main thread');
      await b.page.locator('#docName').fill('Editing while loading');
      await b.page.evaluate(() => { window.__beforePan = TD.state.view.x; });
      const rect = await b.page.locator('#canvas').boundingBox();
      await b.page.mouse.move(rect.x + 300, rect.y + 300); await b.page.mouse.down({ button: 'middle' });
      await b.page.mouse.move(rect.x + 360, rect.y + 330, { steps: 5 }); await b.page.mouse.up({ button: 'middle' });
      assert(await b.page.evaluate(() => TD.state.view.x !== window.__beforePan), 'Panning remains usable');
      await b.page.locator('#content [data-id="loading-0"] .hitfill').click();
      assert.equal(await b.page.evaluate(() => window.__mainTemml.filter(t => t.includes('\\sum')).length), 0, 'Selection and geometry queries must not force synchronous compilation');
      await b.page.locator('#docName').focus();
      await b.page.waitForFunction(() => window.__held.length > 0);
      await b.page.evaluate(() => window.__held.shift()());
      await b.page.waitForFunction(() => document.querySelectorAll('#content .math-pending').length < 12);
      assert(await b.page.locator('#content .math-pending').count() > 0, 'Replace ready labels progressively');
      assert.equal(await b.page.evaluate(() => document.activeElement.id), 'docName', 'Progress preserves focus');
      await b.page.evaluate(async () => { window.__hold = false; window.__held.splice(0).forEach(f => f()); await TD.math.whenReady(); });
      assert.equal(await b.page.locator('#content .math-pending').count(), 0);
      assert(await b.page.evaluate(() => [...document.querySelectorAll('#content image.svg-label')].every((e, i) => e === window.__previousNodes[i])), 'Final swaps retain image elements');
      assert.equal(await b.page.locator('#engineBox').getAttribute('aria-busy'), 'false');
      assert.equal(await b.page.locator('#props .math-pending, #layers .math-pending').count(), 0, 'Sidebar previews finish with the canvas');
      assert.equal(await b.page.locator('#props .pg-thumb .hitfill').count(), 0, 'Sidebar previews never inherit canvas interaction geometry');
      assert.equal(await b.page.evaluate(() => JSON.stringify(TD.state.doc.sheet.shapes)), await b.page.evaluate(() => window.__shapes), 'Loading never changes project data');

      // Warm reverse switches stage cached output and preserve decoded Temml images.
      const warmReverse = await b.page.evaluate(() => {
        const nodes = [...document.querySelectorAll('#content image.svg-label')];
        const images = nodes.map(e => e.getAttribute('href'));
        TD.math.set('katex');
        return { pending: TD.math.pending, images, after: nodes.map(e => e.getAttribute('href')),
          retained: nodes.every((e, i) => e === document.querySelectorAll('#content image.svg-label')[i]) };
      });
      assert(warmReverse.pending > 0, 'Cached reverse switches publish progressively');
      assert(warmReverse.retained); assert.deepEqual(warmReverse.after, warmReverse.images);
      await b.page.evaluate(() => TD.math.whenReady());
      await b.page.evaluate(async () => { TD.math.set('temml'); await TD.math.whenReady(); });

      // Cold reverse compilation belongs in the worker too, including formulas
      // first created in Temml which have never been rendered by KaTeX.
      await b.page.evaluate(async () => {
        TD.state.doc.sheet.shapes.forEach((s, i) => { s.text = `$\\frac{x^{${831 + i}}}{1+x}$`; });
        TD.app.render(); await TD.math.whenReady();
        window.__hold = true; window.__mainKatex.length = 0;
        window.__previousNodes = [...document.querySelectorAll('#content image.svg-label')];
        window.__previousImages = window.__previousNodes.map(e => e.getAttribute('href'));
        TD.math.set('katex');
      });
      assert(await b.page.evaluate(() => TD.math.pending > 0 && TD.math.usingWorker));
      assert.deepEqual(await b.page.evaluate(() => [...document.querySelectorAll('#content image.svg-label')].map(e => e.getAttribute('href'))),
        await b.page.evaluate(() => window.__previousImages), 'Keep exact Temml images during reverse compilation');
      await b.page.locator('#docName').fill('Editing during reverse switch');
      await b.page.evaluate(() => {
        window.__exportPhysics = [{ type: 'physics', id: 'export-physics', x: 0, y: 0, src: TD.physics.domains.mechanics.example }];
        window.__pendingTikz = TD.toTikz(window.__exportPhysics, { standalone: true });
      });
      assert.equal(await b.page.evaluate(() => window.__mainKatex.filter(t => t.includes('831')).length), 0);
      await b.page.waitForFunction(() => window.__held.length > 0);
      await b.page.evaluate(() => window.__held.shift()());
      await b.page.waitForFunction(() => document.querySelectorAll('#content .math-pending').length < 12);
      assert(await b.page.locator('#content .math-pending').count() > 0);
      await b.page.evaluate(async () => { window.__hold = false; window.__held.splice(0).forEach(f => f()); await TD.math.whenReady(); });
      assert.equal(await b.page.locator('#content .math-pending').count(), 0);
      assert.equal(await b.page.evaluate(() => window.__mainKatex.filter(t => t.includes('831')).length), 0);
      assert(await b.page.evaluate(() => window.__pendingTikz === TD.toTikz(window.__exportPhysics, { standalone: true })),
        'TikZ export uses final measurements even while previews are pending');
      assert(await b.page.evaluate(() => [...document.querySelectorAll('#content image.svg-label')].every((e, i) => e === window.__previousNodes[i])));
      await b.page.evaluate(async () => { TD.math.set('temml'); await TD.math.whenReady(); });

      // A fresh equation is pending when an export or cancellation is requested.
      await b.page.evaluate(() => {
        window.__hold = true;
        TD.state.doc.sheet.shapes[0].text = '$\\int_0^{73}x^3\\,dx$'; TD.app.render();
      });
      const output = await b.page.evaluate(() => TD.app.svgOf(TD.state.doc.sheet.shapes));
      assert(!output.includes('math-pending') && !output.includes('blob:'), 'Exports contain only complete self-contained target rendering');
      await b.page.locator('#engineBox [data-engine="katex"]').click();
      await b.page.evaluate(async () => { window.__hold = false; window.__held.splice(0).forEach(f => f()); await TD.math.whenReady(); });
      await b.page.waitForTimeout(50);
      assert.equal(await b.page.evaluate(() => TD.math.engine), 'katex');
      assert.equal(await b.page.evaluate(() => TD.math.pending), 0);
      assert.equal(await b.page.locator('#content .math-pending').count(), 0, 'Late worker messages cannot restore cancelled previews');

      // Document progress must preserve a live editor and its selection.
      await b.page.evaluate(() => {
        window.__hold = true;
        TD.app.newDoc('Loading editor', null, null, [
          { type: 'diagram', shapes: [{ ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'doc-loading', text: '$\\frac{x^{91}}{1+x}$' }] },
          { type: 'text', text: 'Keep this editor open.' },
          { type: 'text', text: 'Repeated $\\frac{x^{91}}{1+x}$.' },
          { type: 'text', text: 'Again $\\frac{x^{91}}{1+x}$.' },
        ], { title: false }, 'classic');
      });
      await b.page.locator('#engineBox [data-engine="temml"]').click();
      await b.page.locator('#docview .blk-text .blk-body').first().click();
      await b.page.locator('#docview .blk-ie').fill('Typing while Temml is loading.');
      await b.page.evaluate(() => {
        const editor = document.querySelector('#docview .blk-ie'), t = editor.querySelector('p')?.firstChild || editor.firstChild;
        const r = document.createRange(); r.setStart(t, 3); r.setEnd(t, 9); getSelection().removeAllRanges(); getSelection().addRange(r);
        window.__editor = editor; window.__text = t;
      });
      await b.page.waitForFunction(() => window.__held.length > 0);
      await b.page.evaluate(async () => { window.__hold = false; window.__held.splice(0).forEach(f => f()); await TD.math.whenReady(); });
      assert.deepEqual(await b.page.evaluate(() => {
        const e = document.querySelector('#docview .blk-ie'), r = getSelection().getRangeAt(0);
        return { same: e === window.__editor, focus: document.activeElement === e, value: e.textContent, start: r.startContainer === window.__text && r.startOffset, end: r.endOffset };
      }), { same: true, focus: true, value: 'Typing while Temml is loading.', start: 3, end: 9 });
      assert.equal(await b.page.locator('#docview .math-pending').count(), 0);
      assert.equal(await b.page.locator('#docview .td-math style').count(), 0, 'Inline formula styles are shared instead of duplicated');
      assert(await b.page.locator('style[data-math-preview]').count() > 0, 'Shared inline styles remain available');
      await b.page.evaluate(async () => { TD.math.set('katex'); await TD.math.whenReady(); });
      assert(await b.page.evaluate(() => {
        const e = document.querySelector('#docview .blk-ie'), r = getSelection().getRangeAt(0);
        return e === window.__editor && document.activeElement === e && r.startContainer === window.__text && r.startOffset === 3 && r.endOffset === 9;
      }), 'Reverse Document updates also preserve the editor and selection');
      assert.equal(await b.page.locator('#docview .math-pending').count(), 0);
      // Cancelling midway through staged Document publication must also cancel
      // its animation frame and let the new engine's readiness promise finish.
      await b.page.evaluate(() => {
        TD.math.set('katex');
        TD.app.newDoc('Cancel staged document', null, null, Array.from({ length: 30 }, () => ({ type: 'text', text: 'Repeated $x_{987654}$.' })), { title: false }, 'classic');
      });
      await b.page.locator('#engineBox [data-engine="temml"]').click();
      await b.page.waitForFunction(() => [...document.querySelectorAll('#docview [data-math-pending]')].some(e => e.getAttribute('data-math-pending').split(',').some(id => !TD.math.hasPendingJob(+id))));
      await b.page.locator('#engineBox [data-engine="katex"]').click();
      await b.page.evaluate(() => TD.math.whenReady());
      assert.equal(await b.page.locator('#docview .math-pending').count(), 0, 'Cancelled staged views cannot leave stale loading treatments');

      // Browsers that prohibit workers still yield between individual formulae.
      const fallback = await b.page.evaluate(async () => {
        TD.math.set('katex'); window.Worker = undefined;
        const shapes = Array.from({ length: 8 }, (_, i) => ({ ...TD.TYPES.text.create({ x: i * 70, y: 100 }, {}), id: 'fallback-' + i,
          text: `$\\sum_{j=0}^{${211 + i}}j$` }));
        TD.app.newDoc('Fallback', null, null, null, null, 'page', { pages: 1, shapes });
        TD.math.set('temml');
        let pendingDuringInput = 0;
        const input = new Promise(resolve => setTimeout(() => { pendingDuringInput = TD.math.pending; resolve(); }, 0));
        await input; await TD.math.whenReady();
        return { pendingDuringInput, worker: TD.math.usingWorker, unfinished: document.querySelectorAll('#content .math-pending').length };
      });
      assert(fallback.pendingDuringInput > 0, 'Fallback yields to queued input before all formulae finish');
      assert.equal(fallback.worker, false); assert.equal(fallback.unfinished, 0);
      const reverseFallback = await b.page.evaluate(async () => {
        TD.state.doc.sheet.shapes.forEach((s, i) => { s.text = `$x^{${99121 + i}}$`; });
        TD.app.render(); await TD.math.whenReady();
        TD.math.set('katex');
        let pendingDuringInput = 0;
        await new Promise(resolve => setTimeout(() => { pendingDuringInput = TD.math.pending; resolve(); }, 0));
        await TD.math.whenReady();
        return { pendingDuringInput, worker: TD.math.usingWorker, unfinished: document.querySelectorAll('#content .math-pending').length };
      });
      assert(reverseFallback.pendingDuringInput > 0, 'Reverse fallback yields to queued input');
      assert.equal(reverseFallback.worker, false); assert.equal(reverseFallback.unfinished, 0);
      assert.deepEqual(b.logs, [], name + ': no runtime errors');
      console.log(`✓ ${name}: bidirectional reused previews, worker compilation, progressive updates, editing, cancellation and complete exports`);
    } finally { await b.close(); }
  }
} finally { await server.close(); }
