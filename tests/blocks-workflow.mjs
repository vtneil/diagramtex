// Real-pointer smoke check for every registered visual block editor.
// node tests/blocks-workflow.mjs [public|dist] — the latter checks the production bundle.
import path from 'node:path';
import { serve, launch } from './chrome.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', process.argv[2] || 'public');
const srv = await serve(root), browser = await launch(`http://127.0.0.1:${srv.port}/`);
try {
  const types = await browser.ev('return [...TD.blocks.entries()].filter(([, b]) => b.editor).map(([type]) => type);');
  for (const type of types) {
    const point = await browser.ev(`
      TD.app.newDoc('Pointer test', null, null, null, null, 'board');
      const s = TD.TYPES[${JSON.stringify(type)}].create({ x: 0, y: 0 }, TD.state.defaults);
      s.id = 'pointer-block'; TD.state.doc.shapes.push(s); TD.app.render(); TD.app.zoomFit();
      await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.querySelector('#content [data-id="pointer-block"]').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    `);
    for (const count of [1, 2]) {
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: count });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: count });
    }
    const opened = await browser.ev(`await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return [...document.querySelectorAll('.modal')].filter(el => !el.hidden).map(el => el.id);`);
    if (opened.length !== 1) throw new Error(`${type}: double-click opened ${JSON.stringify(opened)}`);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
    const closed = await browser.ev(`await new Promise(r => setTimeout(r, 20)); return [...document.querySelectorAll('.modal')].every(el => el.hidden);`);
    if (!closed) throw new Error(type + ': unchanged editor did not close on Escape');
    console.log('✓ ' + type + ': double-click opens, Escape closes');
  }
  if (browser.logs.length) throw new Error(browser.logs.join('\n'));
  console.log(`${types.length} block editors passed (${path.basename(root)})`);
} finally { browser.close(); srv.close(); }
