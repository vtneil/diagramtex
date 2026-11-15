// Native Safari diagnosis, separate from Playwright WebKit. Start safaridriver
// first and enable Remote Automation in Safari. This owns only its new session.
// --bitmap-experiment replaces the scene's label resources for an A/B trial;
// it does not change application code or export rendering.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { performanceFixture } from './performance-fixture.mjs';

if (process.platform !== 'darwin') throw new Error('Native Safari requires macOS');
await prepare();
const driver = process.env.SAFARIDRIVER_URL || 'http://127.0.0.1:48484';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-safari-'));
const server = await serve(APP_DIR);
const file = performanceFixture();
const results = [];
let session;
async function request(method, route, body) {
  const response = await fetch(driver + route, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json.value));
  return json.value;
}
const command = (method, route, body) => request(method, `/session/${session}${route}`, body);
const evaluate = (fn, ...values) => command('POST', '/execute/async', {
  script: `const done=arguments[arguments.length-1];
    Promise.resolve((${fn.toString()}).apply(null,Array.from(arguments).slice(0,-1)))
      .then(value=>done({result:value}),error=>done({failure:String(error),stack:error.stack}));`,
  args: values,
}).then(value => {
  if (value.failure) throw new Error(value.failure + '\n' + value.stack);
  return value.result;
});
try {
  const created = await request('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari', 'safari:automaticProfiling': !args.includes('--no-profiling') } },
  });
  session = created.sessionId;
  console.log(`Safari ${created.capabilities.browserVersion}; profiling=${created.capabilities['safari:automaticProfiling']}`);
  await command('POST', '/timeouts', { script: 60000, pageLoad: 60000, implicit: 0 });
  await command('POST', '/window/rect', { x: 0, y: 0, width: 1600, height: 1000 });
  await command('POST', '/url', { url: `http://127.0.0.1:${server.port}/` });
  // Set the first-visit preference before the measured page starts. Closing a
  // not-yet-visible tour would leave its delayed opening callback queued.
  await evaluate(async () => {
    for (let i = 0; i < 300 && !window.TD?.ready; i++) await new Promise(r => setTimeout(r, 50));
    await TD.ready;
    localStorage.setItem('diagramtex.tour', 'seen');
  });
  await command('POST', '/refresh');
  const environment = await evaluate(async () => {
    for (let i = 0; i < 300 && !window.TD?.ready; i++) await new Promise(r => setTimeout(r, 50));
    await TD.ready; await document.fonts.ready;
    TD.tour?.close();
    localStorage.setItem('diagramtex.tour', 'seen');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (document.querySelector('.td-dialog')) throw new Error('Dismiss the dialog before profiling the canvas');
    return { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
  });
  fs.writeFileSync(path.join(artifacts, 'environment.json'), JSON.stringify({ ...environment, capabilities: created.capabilities }, null, 2));
  console.log(environment);
  for (const engine of args.includes('--katex') || args.includes('--transition') ? ['katex'] : args.includes('--temml') ? ['temml'] : ['katex', 'temml']) {
    await evaluate(async (file, engine, documentMode) => {
      // Start mutations in an application task, after its initial mount flush.
      await new Promise(r => setTimeout(r, 0));
      TD.math.set(engine);
      const p = TD.app.parseProject(file);
      if (documentMode) {
        const text = String.raw`Repeated mathematics: $\vec F=q(\vec E+\vec v\times\vec B)$ and $\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$.`;
        TD.app.newDoc('Document performance', null, null, Array.from({ length: 100 }, () => ({ type: 'text', text })));
      } else TD.app.newDoc(p.name, null, null, null, p.page, 'page', p.sheet);
      await TD.math.whenReady();
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('#content .svg-label')].map(e => {
        const image = new Image(); image.src = e.getAttribute('href') || e.querySelector('img')?.src; return Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Label decode timeout: ' + e.closest('[data-id]')?.dataset.id)), 10000))]);
      }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const render = TD.math.render, clear = TD.clearTextCache;
      window.__safariProbe = { render, clear, parses: 0, invalidations: 0, content: document.querySelector('#content').innerHTML };
      TD.math.render = (...args) => { window.__safariProbe.parses++; return render(...args); };
      TD.clearTextCache = (...args) => { window.__safariProbe.invalidations++; return clear(...args); };
    }, file, engine, args.includes('--document'));
    if (args.includes('--transition')) {
      const metrics = await evaluate(async () => {
        let mainCompiles = 0;
        const original = window.temml.renderToString;
        window.temml.renderToString = (source, options) => { if (options?.macros) mainCompiles++; return original(source, options); };
        let frames = 0, maximumFrame = 0, last = performance.now(), done = false, inputWhilePending = false;
        const tick = () => {
          const now = performance.now(); maximumFrame = Math.max(maximumFrame, now - last); last = now; frames++;
          if (!done) { document.querySelector('#canvas').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 1 })); requestAnimationFrame(tick); }
        };
        requestAnimationFrame(tick);
        const start = performance.now(); document.querySelector('#engineBox [data-engine="temml"]').click();
        const handlerMs = performance.now() - start, initialPending = TD.math.pending;
        await new Promise(resolve => setTimeout(() => {
          inputWhilePending = TD.math.pending > 0;
          document.querySelector('#docName').dispatchEvent(new Event('input', { bubbles: true })); resolve();
        }, 0));
        await TD.math.whenReady(); done = true; window.temml.renderToString = original;
        return { handlerMs, initialPending, totalMs: performance.now() - start, frames, maximumFrame, inputWhilePending, mainCompiles, worker: TD.math.usingWorker };
      });
      results.push({ surface: 'engine-transition', ...metrics }); console.log(JSON.stringify(results.at(-1)));
      assert(metrics.worker && metrics.inputWhilePending); assert.equal(metrics.mainCompiles, 0);
      continue;
    }
    const screenshot = await command('GET', '/screenshot');
    fs.writeFileSync(path.join(artifacts, `${engine}-initial.png`), Buffer.from(screenshot, 'base64'));
    const variants = args.includes('--document') || args.includes('--baseline-only') ? ['all'] : args.includes('--compare-images') ? ['all', 'no-label-images'] : ['all', 'no-label-images', 'no-prose', 'empty'];
    if (args.includes('--bitmap-experiment')) variants.push('bitmap-images');
    if (args.includes('--html-image-experiment')) variants.push('html-images');
    if (args.includes('--blob-image-experiment')) variants.push('blob-images');
    if (args.includes('--data-image-control')) variants.push('data-images');
    for (const zoom of args.includes('--one-zoom') ? [1] : [1, 4]) for (const variant of variants) {
      await evaluate(async (zoom, variant, documentMode) => {
        if (documentMode) {
          document.querySelector('#docview [data-zoom="1"]').click();
          if (zoom === 4) for (let i = 0; i < 16; i++) document.querySelector('#docview [data-zoom="in"]').click();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return;
        }
        const content = document.querySelector('#content');
        for (const url of window.__blobLabels || []) URL.revokeObjectURL(url);
        window.__blobLabels = [];
        content.innerHTML = window.__safariProbe.content;
        if (variant === 'no-label-images') content.querySelectorAll('.svg-label').forEach(e => e.remove());
        if (variant === 'no-prose') content.querySelectorAll('foreignObject:not(.svg-label)').forEach(e => e.remove());
        if (variant === 'empty') content.replaceChildren();
        TD.state.view = { zoom, x: 250, y: 100 };
        document.querySelector('#canvas').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
        if (variant === 'data-images') {
          for (const e of content.querySelectorAll('image.svg-label')) {
            const source = await (await fetch(e.getAttribute('href'))).text();
            const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
            e.setAttribute('href', url); const image = new Image(); image.src = url; await image.decode();
          }
        }
        if (variant === 'blob-images') {
          for (const e of content.querySelectorAll('image.svg-label')) {
            const source = await (await fetch(e.getAttribute('href'))).text();
            const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
            window.__blobLabels.push(url); e.setAttribute('href', url);
            const image = new Image(); image.src = url; await image.decode();
          }
        }
        if (variant === 'html-images') {
          // Diagnostic only: this improves frame time but fails high-zoom KaTeX
          // display/export parity. Do not promote it without fixing that cause.
          for (const e of content.querySelectorAll('image.svg-label')) {
            const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            for (const a of e.attributes) if (a.name !== 'href') foreign.setAttribute(a.name, a.value);
            const image = document.createElementNS('http://www.w3.org/1999/xhtml', 'img');
            image.src = e.getAttribute('href'); image.style.cssText = 'display:block;width:100%;height:100%';
            foreign.append(image); e.replaceWith(foreign); await image.decode();
          }
        }
        if (variant === 'bitmap-images') {
          // Fixed-density experimental resources isolate SVG image rendering cost.
          // Production caching would need zoom/DPR-aware density and memory bounds.
          for (const e of content.querySelectorAll('.svg-label')) {
            const image = new Image(); image.src = e.getAttribute('href') || e.querySelector('img')?.src; await image.decode();
            const bitmap = document.createElement('canvas');
            bitmap.width = Math.ceil(+e.getAttribute('width') * 2);
            bitmap.height = Math.ceil(+e.getAttribute('height') * 2);
            bitmap.getContext('2d').drawImage(image, 0, 0, bitmap.width, bitmap.height);
            const href = bitmap.toDataURL('image/png');
            const decoded = new Image(); decoded.src = href; await decoded.decode();
            if (e.localName === 'image') e.setAttribute('href', href); else e.querySelector('img').src = href;
          }
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, zoom, variant, args.includes('--document'));
      if (args.includes('--capture-variants')) {
        const capture = await command('GET', '/screenshot');
        fs.writeFileSync(path.join(artifacts, `${engine}-${zoom}-${variant}.png`), Buffer.from(capture, 'base64'));
      }
      for (const gesture of args.includes('--document') ? ['zoom'] : ['scroll', 'zoom']) {
        const metrics = await evaluate(async (gesture, label, frameCount, traceReads, documentMode) => {
          if (document.querySelector('.td-dialog')) throw new Error('A dialog obscures the measured canvas');
          console.timeStamp('DiagramTeX ' + label);
          const canvas = document.querySelector(documentMode ? '#docview' : '#canvas'), rect = canvas.getBoundingClientRect();
          const probe = window.__safariProbe; probe.parses = probe.invalidations = 0;
          const frames = [], handlers = [];
          const layoutReads = {}, restorers = [];
          const measured = (name, original) => function (...values) {
            const start = performance.now(), result = original.apply(this, values), elapsed = performance.now() - start;
            const key = `${name} ${this.id ? '#' + this.id : this.tagName}`;
            const count = layoutReads[key] ||= { calls: 0, total: 0, max: 0 };
            count.calls++; count.total += elapsed; count.max = Math.max(count.max, elapsed);
            return result;
          };
          if (traceReads) {
            const original = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = measured('getBoundingClientRect', original);
            restorers.push(() => { Element.prototype.getBoundingClientRect = original; });
            for (const key of ['clientWidth', 'clientHeight']) {
              const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key);
              if (descriptor?.get && descriptor.configurable) {
                Object.defineProperty(Element.prototype, key, { ...descriptor, get: measured(key, descriptor.get) });
                restorers.push(() => Object.defineProperty(Element.prototype, key, descriptor));
              }
            }
          }
          let previous = performance.now();
          for (let i = 0; i < frameCount; i++) {
            const start = performance.now();
            canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
              deltaX: gesture === 'scroll' ? 4 : 0, deltaY: gesture === 'scroll' ? 2 : i < frameCount / 2 ? -2 : 2,
              ctrlKey: gesture === 'zoom', clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
            handlers.push(performance.now() - start);
            await new Promise(r => requestAnimationFrame(r));
            const now = performance.now(); frames.push(now - previous); previous = now;
          }
          for (const restore of restorers) restore();
          const stats = values => {
            const ordered = values.slice(5).sort((a, b) => a - b);
            return { median: ordered[Math.floor(ordered.length * .5)], p95: ordered[Math.floor(ordered.length * .95)] };
          };
          return { frames: stats(frames), handlers: stats(handlers), parses: probe.parses, invalidations: probe.invalidations, ...(traceReads ? { layoutReads } : {}) };
        }, gesture, `${engine} ${zoom} ${variant} ${gesture}`, args.includes('--quick') ? 15 : 45, args.includes('--layout-reads'), args.includes('--document'));
        const result = { surface: args.includes('--document') ? 'document' : 'canvas', engine, zoom, variant, gesture, ...metrics };
        results.push(result); console.log(JSON.stringify(result));
        assert.equal(metrics.parses, 0, 'Camera movement must retain parsed formulae');
        assert.equal(metrics.invalidations, 0, 'Camera movement must retain measured text');
      }
    }
    await evaluate(() => { TD.math.render = window.__safariProbe.render; TD.clearTextCache = window.__safariProbe.clear; });
  }
} finally {
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Native Safari report: ${artifacts}`);
  try { if (session) await command('DELETE', ''); } finally { await server.close(); }
}
