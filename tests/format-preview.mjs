// Exercise the real shared dropdown and Properties panel, including non-persistence of hover state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers, reloadApp } from './browser.mjs';
await prepare();
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-format-preview-'));
const server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`),p=b.page;
  try {
   for(const engine of ['katex','temml']) {
   await p.evaluate(async engine=>{TD.math.set(engine);await TD.math.whenReady();},engine);
   await p.evaluate(async()=>{
    const label=(id,y)=>({...TD.TYPES.text.create({x:120,y},{}),id,text:'Preview $x^2$\nShort',tw:260});
    TD.app.newDoc('Formatting previews',null,null,[{type:'diagram',shapes:[label('a',100),label('b',230)]}]);
    TD.app.setMode('diagram');TD.state.sel=new Set(['a','b']);TD.app.render();TD.app.renderProps();TD.app.clearAllHistory();
    await TD.math.whenReady();
    window.original=JSON.stringify(TD.state.doc.blocks);
    window.originalExport=TD.app.svgOf(TD.state.doc.shapes);
   });
   const settle=()=>p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(r));await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const markup=()=>p.evaluate(async()=>{
    const root=document.querySelector('#content').cloneNode(true);
    for(const img of root.querySelectorAll('image.svg-label')) { const source=await (await fetch(img.getAttribute('href'))).text(); img.removeAttribute('href'); img.dataset.source=source; }
    return root.innerHTML;
   });
   const unchanged=async()=>assert(await p.evaluate(()=>JSON.stringify(TD.state.doc.blocks)===original && TD.state.undo.length===0),'tentative formatting never changes project or undo history');
   const select=p.locator('#props select[data-key="font"]');
   await settle();const before=await markup();
   await select.click();
   const index=await select.evaluate(s=>[...s.options].findIndex(o=>o.value==='cmss'));
   await p.locator(`.selmenu-item[data-i="${index}"]`).hover();await settle();
   assert.notEqual(await markup(),before,'font hover repaints selected text');await unchanged();
   assert(await p.evaluate(()=>TD.app.svgOf(TD.state.doc.shapes)===originalExport),'SVG output uses committed formatting during hover');
   await p.screenshot({path:path.join(artifacts,`${browser}-${engine}-font-hover.png`)});
   await p.keyboard.press('Escape');await settle();
   assert.equal(await markup(),before,'Escape restores original rendering');await unchanged();
   await select.click();await p.keyboard.press('ArrowDown');await settle();await unchanged();
   await p.keyboard.press('Escape');await settle();assert.equal(await markup(),before,'keyboard preview cancels');
   await select.click();await p.locator(`.selmenu-item[data-i="${index}"]`).click();await settle();
   assert(await p.evaluate(()=>TD.state.doc.shapes.every(s=>s.font==='cmss') && TD.state.undo.length===1),'pick applies to every selected label in one undo step');
   await p.locator('#btnUndo').click();await settle();await unchanged();
   const size=p.locator('#props [data-sizepx]');
   await size.fill('28');await settle();assert.notEqual(await markup(),before,'numeric size previews while typing');await unchanged();
   await size.press('Escape');await settle();assert.equal(await markup(),before,'Escape restores numeric size');
   await size.fill('30');await settle();await size.press('Enter');await settle();
   assert(await p.evaluate(()=>TD.state.doc.shapes.every(s=>s.size===30) && TD.state.undo.length===1));
   await p.locator('#btnUndo').click();await settle();await unchanged();
   for(const [key,value] of [['mathStyle','display'],['size','Huge']]) {
    const s=p.locator(`#props select[data-key="${key}"]`);await s.click();
    const i=await s.evaluate((s,v)=>[...s.options].findIndex(o=>o.value===v),value);
    assert(i>=0);await p.locator(`.selmenu-item[data-i="${i}"]`).hover();await settle();await unchanged();
    assert.notEqual(await markup(),before,`${key} hover repaints`);
    await p.keyboard.press('Escape');await settle();assert.equal(await markup(),before);
   }
   // Outside clicks and selection changes dismiss a tentative choice.
   await select.click();await p.locator(`.selmenu-item[data-i="${index}"]`).hover();await settle();
   await p.locator('#docName').click();await settle();assert.equal(await markup(),before);await unchanged();
   await select.click();await p.locator(`.selmenu-item[data-i="${index}"]`).hover();await settle();
   await p.evaluate(()=>{TD.state.sel=new Set(['b']);TD.app.render();TD.app.renderProps();});await settle();
   assert.equal(await markup(),before);await unchanged();
   await p.keyboard.press('Escape');
   await p.evaluate(()=>{TD.state.sel=new Set(['a','b']);TD.app.renderProps();});
   // Other formatting controls paint immediately; every completed edit is independently undoable.
   for(const key of ['bold','italic','boxed']) {
    await p.locator(`#props [data-key="${key}"]`).check();await settle();
    assert(await p.evaluate(key=>TD.state.doc.shapes.every(s=>s[key]===true),key));
    await p.locator('#btnUndo').click();await settle();await unchanged();
   }
   await p.locator('#props [data-alignv="right"]').hover();await settle();await unchanged();
   assert.notEqual(await markup(),before,'alignment hover repaints without committing');
   await p.locator('#props [data-alignv="right"]').click();await settle();
   assert(await p.evaluate(()=>TD.state.doc.shapes.every(s=>s.align==='right')));
   await p.locator('#btnUndo').click();await settle();await unchanged();
   const vertical=p.locator('#props [data-valign="bottom"]');
   await vertical.focus();await settle();await unchanged();
   await vertical.press('Enter');await settle();
   assert(await p.evaluate(()=>TD.state.doc.shapes.every(s=>s.valign==='bottom')));
   await p.locator('#btnUndo').click();await settle();await unchanged();
   await p.locator('#props [data-color="color"]').click();
   await p.locator('.cp [data-f="hex"]').fill('c62828');await p.locator('.cp [data-f="hex"]').press('Tab');await settle();
   assert(await p.evaluate(()=>TD.state.doc.shapes.every(s=>s.color==='#c62828')),'colour edits repaint both labels');
   await p.keyboard.press('Escape');await p.locator('#btnUndo').click();await settle();await unchanged();
   // Opening another control cancels the hover before starting its edit.
   await select.click();await p.locator(`.selmenu-item[data-i="${index}"]`).hover();await settle();
   await p.locator('#blockRename').click();await p.locator('.tdd-in').fill('Circuit <A> & B');await p.locator('.tdd-btns [data-r="1"]').click();
   await p.waitForFunction(()=>TD.state.doc.blocks[0].name==='Circuit <A> & B');
   assert.equal(await p.locator('#blockSel').textContent(),'Circuit <A> & B');
   assert(await p.evaluate(()=>TD.app.parseProject(TD.app.projectJson(TD.state.doc)).blocks[0].name==='Circuit <A> & B'));
   await p.screenshot({path:path.join(artifacts,`${browser}-${engine}-named-diagram.png`)});
   await p.locator('#btnUndo').click();await p.waitForFunction(()=>!TD.state.doc.blocks[0].name);
   assert.match(await p.locator('#blockSel').textContent(),/Diagram 1 of 1/);
   await p.locator('#btnRedo').click();await p.waitForFunction(()=>TD.state.doc.blocks[0].name==='Circuit <A> & B');
   await reloadApp(p);
   assert.equal(await p.locator('#blockSel').textContent(),'Circuit <A> & B','name survives autosave/reload');
   await p.locator('#blockRename').click();await p.locator('.tdd-in').fill('Cancelled');await p.keyboard.press('Escape');
   assert.equal(await p.locator('#blockSel').textContent(),'Circuit <A> & B');
   await p.locator('#blockRename').click();await p.locator('.tdd-in').fill('   ');await p.locator('.tdd-btns [data-r="1"]').click();
   await p.waitForFunction(()=>!TD.state.doc.blocks[0].name);
   assert.match(await p.locator('#blockSel').textContent(),/Diagram 1 of 1/);
   await p.evaluate(()=>{TD.state.doc.blocks.push({type:'diagram',shapes:[]});TD.app.setActiveBlock(1);});
   await p.locator('#blockRename').click();await p.locator('.tdd-in').fill('Second diagram');await p.locator('.tdd-btns [data-r="1"]').click();
   await p.waitForFunction(()=>TD.state.doc.blocks[1].name==='Second diagram');
   await p.evaluate(()=>TD.app.setActiveBlock(0));await p.locator('#btnUndo').click();
   assert(await p.evaluate(()=>TD.state.doc.blocks[0].name==='Circuit <A> & B' && TD.state.doc.blocks[1].name==='Second diagram'),'rename history belongs to its diagram');
   await p.evaluate(()=>TD.app.setActiveBlock(1));await p.locator('#btnUndo').click();
   assert(await p.evaluate(()=>!TD.state.doc.blocks[1].name && TD.state.doc.blocks[0].name==='Circuit <A> & B'));
   assert.deepEqual(b.logs,[]);console.log(`✓ ${browser}/${engine}: hover/keyboard/cancel/commit, live size, formatting undo, names/round trip/reload`);
   }
  } finally {await b.close();}
 }
} finally {server.close();}
console.log(`Screenshots: ${artifacts}`);
