// Measure transition responsiveness separately from steady-state camera work.
// Formula count, device speed and worker startup vary; report timings, assert
// that target compilation stays off the UI thread and input runs while pending.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepare, APP_DIR, args } from './args.mjs';
import { performanceFixture } from './performance-fixture.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR), file = performanceFixture();
try {
  for (const name of testBrowsers()) {
    const b = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      const profiler = args.includes('--profile') && name === 'chromium' ? await b.context.newCDPSession(b.page) : null;
      if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
      const metrics = await b.page.evaluate(async ({ file, documentMode, reverse }) => {
        const target = reverse ? 'katex' : 'temml';
        if (reverse) TD.math.set('temml');
        const p = TD.app.parseProject(file);
        if (documentMode) {
          const text = String.raw`Repeated maths: $\vec F=q(\vec E+\vec v\times\vec B)$ and $\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$.`;
          TD.app.newDoc('Loading document', null, null, Array.from({ length: 100 }, () => ({ type: 'text', text })), { title: false }, 'classic');
        } else TD.app.newDoc(p.name, null, null, null, p.page, 'page', p.sheet);
        await TD.math.whenReady();
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('#content image.svg-label')].map(e => {
          const image = new Image(); image.src = e.getAttribute('href'); return image.decode();
        }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let mainCompiles = 0;
        const render = window[target].renderToString;
        window[target].renderToString = (tex, options) => { if (options?.macros) mainCompiles++; return render(tex, options); };
        let inputWhilePending = false, frames = 0, done = false, maxFrame = 0, last = performance.now();
        const canvas = document.querySelector('#canvas');
        const tick = () => {
          const now = performance.now();
          maxFrame = Math.max(maxFrame, now - last); last = now; frames++;
          if (!done) {
            if (documentMode) document.querySelector('#docview').scrollTop += 1;
            else canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 1, deltaY: 1 }));
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
        const start = performance.now();
        document.querySelector(`#engineBox [data-engine="${target}"]`).click();
        const handler = performance.now() - start, initialPending = TD.math.pending;
        await new Promise(resolve => setTimeout(() => {
          document.querySelector('#docName').value = 'Input remains usable';
          document.querySelector('#docName').dispatchEvent(new Event('input', { bubbles: true }));
          inputWhilePending = TD.math.pending > 0; resolve();
        }, 0));
        await TD.math.whenReady(); done = true;
        window[target].renderToString = render;
        return { browser: navigator.userAgent, target, handlerMs: handler, totalMs: performance.now() - start,
          initialPending, inputWhilePending, frames, maxFrameMs: maxFrame, mainCompiles, worker: TD.math.usingWorker };
      }, { file, documentMode: args.includes('--document'), reverse: args.includes('--reverse') });
      if (profiler) { const { profile } = await profiler.send('Profiler.stop'); fs.writeFileSync('/tmp/diagramtex-loading-profile.json', JSON.stringify(profile)); }
      console.log(name + ': ' + JSON.stringify(metrics));
      assert(metrics.worker && metrics.initialPending > 0, 'The cold transition must use a worker');
      assert(metrics.inputWhilePending, 'Input must execute before compilation finishes');
      assert.equal(metrics.mainCompiles, 0, 'No target formula compilation on the UI thread');
      assert.deepEqual(b.logs, [], name + ': no runtime errors');
    } finally { await b.close(); }
  }
} finally { await server.close(); }
