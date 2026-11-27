import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-modal-layout-')), server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`),p=b.page;
  try {
   for(const language of ['en','th']) {
    await p.evaluate(language=>{document.querySelector('#languagePicker summary').click();document.querySelector(`[data-language="${language}"]`).click();},language);
    // 600×500 and up: a smaller window gets the phone page instead of the app (v1.54.2)
    for(const [width,height] of [[1600,1000],[960,700],[800,560],[600,500]]) {
     await p.setViewportSize({width,height});
     for(const kind of ['import','code','chemistry']) {
      // LaTeX output (the code dialog) opens only once the maths has rendered; a slow runner can still be busy
      if(kind==='code')await p.waitForFunction(()=>TD.app.outputReady());
      await p.evaluate(kind=>{if(kind==='import')TD.app.openImport('');else if(kind==='code')TD.app.cmd.runCmd('tikz');else TD.chemEditor.open({src:'\\chemfig{-[:30]-[:-30]}'},()=>{});},kind);
      const selector=kind==='import'?'#importModal':kind==='code'?'#modal':'#cfModal',modal=p.locator(selector);
      await modal.locator('.modal-head strong').waitFor({state:'visible'});
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const metrics=await modal.evaluate(modal=>{
       const box=modal.querySelector('.modal-box'),head=box.querySelector('.modal-head'),r=box.getBoundingClientRect(),h=head.getBoundingClientRect();
       const controls=[...head.querySelectorAll('strong,button,select,label')].filter(e=>e.getClientRects().length);
       const bounds=controls.map(e=>{const q=e.getBoundingClientRect();return {tag:e.tagName,text:e.textContent,left:q.left,right:q.right,top:q.top,bottom:q.bottom};});
       return {box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},head:{top:h.top,bottom:h.bottom},bounds,overflow:box.scrollWidth-box.clientWidth,title:head.querySelector('strong').getBoundingClientRect().width};
      });
      const context=`${browser}/${language}/${width}x${height}/${kind}: ${JSON.stringify(metrics)}`;
      assert(metrics.box.left>=0 && metrics.box.right<=width+1 && metrics.box.top>=0 && metrics.box.bottom<=height+1,context);
      assert(metrics.title>(kind==='import'?100:20), 'heading must retain readable width: '+context);
      assert(metrics.overflow<=1,'dialog must not overflow horizontally: '+context);
      for(const q of metrics.bounds)assert(q.left>=metrics.box.left && q.right<=metrics.box.right && q.top>=metrics.head.top && q.bottom<=metrics.head.bottom,'header controls fit: '+context);
      if(kind==='chemistry') {
       const actions=metrics.bounds.filter(q=>q.tag==='BUTTON').slice(-2);
       assert.equal(actions[0].top,actions[1].top,'Cancel and Done stay together: '+context);
      }
      if(width===600 && language==='en')await p.screenshot({path:path.join(artifacts,`${browser}-${kind}.png`)});
      const close=modal.locator(kind==='import'?'#impClose':kind==='code'?'#modalClose':'[data-ce="cancel"]');
      await close.click();await modal.waitFor({state:'hidden',timeout:1000}).catch(()=>assert.fail('close remains usable: '+context)); // it fades out
     }
    }
   }
   assert.deepEqual(b.logs,[]);console.log(`[PASSED] ${browser}: responsive import, code and Chemistry modals in English/Thai, four window sizes from 600×500 up`);
  } finally {await b.close();}
 }
} finally {server.close();}
console.log('Screenshots: '+artifacts);
