// Compare editor frame and selection controls with the recorded baseline checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { APP_DIR, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';
if (!process.env.DIAGRAMTEX_BASELINE) throw Error('Set DIAGRAMTEX_BASELINE');
await prepare();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dtx-editor-ui-'));
const servers = [], browsers = [];
try {
  for (const directory of [path.join(process.env.DIAGRAMTEX_BASELINE, 'public'), APP_DIR]) {
    const server = await serve(directory); servers.push(server); browsers.push(await launch(`http://127.0.0.1:${server.port}/`));
  }
  const types = process.env.MIGRATION_TYPES?.split(',') || await browsers[0].ev('return [...TD.blocks.entries()].filter(([, b]) => b.editor).map(([type]) => type);');
  let count = 0;
  for (const theme of ['light', 'dark']) for (const type of types) {
    const snapshots = [], pictures = [];
    for (const [index, browser] of browsers.entries()) {
      const snapshot = await browser.ev(`
        document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' }));
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        TD.app.newDoc('Editor comparison', null, null, null, null, 'board');
        const random = Math.random; let seed = 12345; Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        const shape = TD.TYPES[${JSON.stringify(type)}].create({x:0,y:0}, TD.state.defaults); shape.id = 'editor-comparison'; Math.random = random;
        const def = TD.blocks.get(${JSON.stringify(type)}).editor;
        def.get().open(shape, () => {}, def.options?.());
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const modal = [...document.querySelectorAll('.modal')].find(el => !el.hidden);
        if (${JSON.stringify(type)} === 'cz') {
          const item = modal.querySelector('svg [data-id]');
          item?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: item.getBoundingClientRect().x + item.getBoundingClientRect().width / 2, clientY: item.getBoundingClientRect().y + item.getBoundingClientRect().height / 2, button: 0 }));
          item?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0 }));
        }
        if (${JSON.stringify(!!process.env.MIGRATION_PICK)}) {
          const type = ${JSON.stringify(type)};
          if (type === 'geo2d' || type === 'geo3d') modal.querySelector('.qe-item[data-item]')?.click();
          else if (type === 'physics') modal.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true}));
          else if (['qc', 'cd', 'xy'].includes(type)) modal.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true}));
          if (${JSON.stringify(process.env.MIGRATION_PICK === 'arrow')}) modal.querySelector('[data-ce="pickarrow"]')?.click();
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const origin = modal.querySelector('.modal-box').getBoundingClientRect();
        const controls = modal.querySelector('.cz-props');
        const crop = (controls && !controls.hidden && controls.getBoundingClientRect().height ? controls : modal.querySelector('.modal-head')).getBoundingClientRect();
        const round = n => Math.round(n * 100) / 100;
        return { clip: {x: origin.x,y:origin.y,width:origin.width,height:origin.height}, controlClip: {x:crop.x,y:crop.y,width:crop.width,height:crop.height},
          elements: [...modal.querySelectorAll('.modal-head *, .cz-props *')].filter(el => !el.closest('.seg-thumb')).map(el => {
            const box=el.getBoundingClientRect(), css=getComputedStyle(el);
            return { tag:el.tagName, class:el.className?.baseVal ?? el.className, text:el.children.length || el.tagName==='TEXTAREA' ? null : el.textContent.trim(),
              value:'value' in el ? el.value : null,
              data:Object.fromEntries(Object.entries(el.dataset).filter(([k]) => k!=='tip')),
              box:[box.x-origin.x,box.y-origin.y,box.width,box.height].map(round),
              style:[css.fontFamily,css.fontSize,css.fontWeight,css.color,css.backgroundColor,css.borderRadius] };
          }) };
      `);
      snapshots.push(snapshot);
      // Compare the framework-controlled property view. Imperative canvas output is
      // covered by the domain parity/export suites; frame geometry is checked above.
      await browser.ev('await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true;');
      const png = await browser.send('Page.captureScreenshot', {format:'png',clip:{...snapshot.controlClip,scale:1}});
      const picture = Buffer.from(png.result.data, 'base64'); pictures.push(picture);
      fs.writeFileSync(path.join(output,`${theme}-${type}-${index?'migrated':'baseline'}.png`),picture);
      await browser.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',windowsVirtualKeyCode:13,modifiers:2});
      await browser.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',windowsVirtualKeyCode:13});
    }
    try {assert.deepEqual(snapshots[1],snapshots[0]);}
    catch(error){fs.writeFileSync(path.join(output,'baseline.json'),JSON.stringify(snapshots[0],null,2));fs.writeFileSync(path.join(output,'migrated.json'),JSON.stringify(snapshots[1],null,2));throw Error(`${theme} ${type}: ${error.message.slice(0,1800)}; ${output}`);}
    assert.ok(pictures[0].equals(pictures[1]),`${theme} ${type}: pixels differ; ${output}`);
    console.log(`[PASSED] ${theme} ${type}: frame geometry, controls and panel pixels match`);count++;
  }
  for(const browser of browsers)assert.deepEqual(browser.logs,[]);
  console.log(`${count} editor comparisons passed; ${output}`);
} finally {browsers.forEach(b=>b.close());servers.forEach(s=>s.close());}
