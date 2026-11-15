// Static-host and local-file startup, persistence, precache and genuine offline reload.
// node tests/runtime.mjs [--dist]
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIST as dist, APP_DIR as root, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';

await prepare();
const server = await serve(root);
let browser;
try {
  const shared = Buffer.from(JSON.stringify({ app: 'diagramtex', version: 3, kind: 'board', name: 'Shared migration check',
    blocks: [{ type: 'diagram', shapes: [] }] })).toString('base64url');
  browser = await launch(`http://127.0.0.1:${server.port}/#share=0.${shared}`);
  assert.equal(await browser.ev('return TD.state.doc.name;'), 'Shared migration check');
  assert.equal(await browser.ev('return location.hash;'), '', 'shared link is consumed once');
  console.log('✓ shared-link startup and browser history');
  await browser.send('Network.setBypassServiceWorker', { bypass: false });
  await browser.ev(`
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const shape = TD.TYPES.bloch.create({ x: 0, y: 0 }); shape.id = 'offline-bloch';
    const label = { ...TD.TYPES.text.create({ x: 100, y: 100 }, {}), id: 'offline-math', text: '$x^2$' };
    TD.app.newDoc('Offline migration check', [shape, label], null, null, null, 'board');
    TD.app.saveNow();
    await new Promise(queueMicrotask);
    // Wait for the database transaction, rather than navigating with queued writes.
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('diagramtex', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('kv');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        tx.objectStore('kv').get('diagramtex.doc.' + TD.state.docId);
      };
    });
    return true;
  `, 30000);
  const entries = await browser.ev(`const keys = await caches.keys();
    return (await Promise.all(keys.map(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname)))).flat();`);
  assert.ok(entries.some(p => p.endsWith(dist ? '/js/bundle.js' : '/js/app.bundle.js')), 'application bundle is precached');
  assert.ok(entries.some(p => p.endsWith('/vendor/mathlive/mathlive.min.js')), 'local maths editor is precached');
  assert.ok(entries.some(p => p.endsWith('.woff2')), 'fonts are precached');
  assert.ok(entries.some(p => p.endsWith('/math-render-worker.js')), 'the maths worker is precached');
  await browser.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await browser.ev('window.__beforeMigrationReload = true; return true;');
  await browser.send('Network.setCacheDisabled', { cacheDisabled: true });
  await browser.send('Page.reload');
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    try {
      loaded = await browser.ev(`if (window.__beforeMigrationReload || !window.TD?.ready) return false; await TD.ready;
        return TD.state.doc.name === 'Offline migration check' && TD.state.doc.shapes[0]?.id === 'offline-bloch';`, 1000);
      if (loaded) break;
    } catch { /* navigation creates a new execution context */ }
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(loaded, 'offline reload restores saved document');
  assert.equal(await browser.ev(`TD.state.sel = new Set(['offline-bloch']); TD.app.renderProps();
    return document.querySelector('[data-panel="bloch"] [data-bk="tilt"]')?.value;`), '15', 'Svelte panel renders offline');
  assert.equal(await browser.ev(`
    TD.math.set('temml'); await TD.math.whenReady();
    const resource = document.querySelector('#content [data-id="offline-math"] image.svg-label').getAttribute('href');
    const image = new Image(); image.src = resource; await image.decode();
    return TD.math.usingWorker && resource.startsWith('blob:') && (await (await fetch(resource)).text()).includes('<svg');`), true, 'offline labels use valid local SVG resources');
  assert.equal(await browser.ev(`
    const label = TD.state.doc.shapes.find(s => s.id === 'offline-math');
    label.text = '$x^{89123}$'; TD.app.render(); await TD.math.whenReady();
    TD.math.set('katex'); await TD.math.whenReady();
    const resource = document.querySelector('#content [data-id="offline-math"] image.svg-label').getAttribute('href');
    const image = new Image(); image.src = resource; await image.decode();
    const output = new DOMParser().parseFromString(await (await fetch(resource)).text(), 'image/svg+xml');
    return TD.math.usingWorker && TD.math.engine === 'katex' && !!output.querySelector('path[data-label-text="89123"]');`), true, 'offline reverse compilation loads KaTeX in the worker');
  assert.deepEqual(browser.logs, []);
  console.log('✓ static hosting, persistence, precache and offline reload (' + (dist ? 'dist' : 'public') + ')');
  browser.close(); browser = null;
  browser = await launch(pathToFileURL(path.join(root, 'index.html')).href);
  assert.equal(await browser.ev('return !!TD.state.doc && [...TD.blocks.entries()].length > 10;'), true);
  assert.equal(await browser.ev(`TD.app.newDoc('File startup', null, null, null, null, 'board');
    const s = TD.TYPES.bloch.create({ x: 0, y: 0 }); s.id = 'file-bloch';
    TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.renderProps();
    return document.querySelector('[data-panel="bloch"] [data-bk="tilt"]')?.value;`), '15');
  assert.equal(await browser.ev(`
    const label = { ...TD.TYPES.text.create({ x: 100, y: 100 }, {}), id: 'file-math', text: '$x^2$' };
    TD.state.doc.shapes.push(label); TD.app.render();
    TD.math.set('temml'); await TD.math.whenReady();
    const resource = document.querySelector('#content [data-id="file-math"] image.svg-label').getAttribute('href');
    const image = new Image(); image.src = resource; await image.decode();
    return !TD.math.usingWorker && resource.startsWith('blob:') && (await (await fetch(resource)).text()).includes('<svg');`), true, 'file:// labels use valid local SVG resources');
  assert.deepEqual(browser.logs, []);
  console.log('✓ file:// startup and Svelte panel (' + (dist ? 'dist' : 'public') + ')');
} finally { browser?.close(); server.close(); }
