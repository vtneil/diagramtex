// Safari's native print preview is checked separately. Playwright WebKit has no
// PDF endpoint; Firefox also has no Playwright PDF endpoint. All engines verify the actual prepared print layout, and
// Chromium additionally verifies the paginated PDF's page count.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();const server=await serve(APP_DIR),artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-page-print-'));
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`);
  try {
   await b.page.evaluate(async()=>{
    const px=TD.PX_PER_CM,step=(29.7+1)*px;
    const rect=(id,y,fill)=>({...TD.TYPES.rect.create({x:40,y},{stroke:'#000000',width:1,fill}),id,w:300,h:200});
    TD.app.newDoc('Print two pages',null,null,null,{paper:'a4',orient:'portrait'},'page',{pages:2,shapes:[rect('p1',40,'#cc3344'),rect('p2',step+40,'#3366cc')]});await TD.math.whenReady();
    window.print=()=>{
     const host=document.querySelector('#pagePrint');
     window.__printSheets=host.querySelectorAll(':scope > .print-sheet').length;
     window.__printSnapshot='<!doctype html><html><head><meta charset="utf-8"><style>'+[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(r=>r.cssText)}catch{return[]}}).join('\n')+'</style></head><body class="printing-page">'+host.outerHTML+'</body></html>';
    };
    TD.app.cmd.runCmd('print');
   });
   // with the in-browser TeX engines here, Print asks how to render first: As shown (the first choice) is this check's
   await b.page.waitForFunction(()=>!!window.__printSnapshot||!!document.querySelector('.td-dialog [data-r="1"]'));
   if(await b.page.locator('.td-dialog [data-r="1"]').count()) await b.page.locator('.td-dialog [data-r="1"]').click();
   await b.page.waitForFunction(()=>!!window.__printSnapshot);
   assert.equal(await b.page.evaluate(()=>window.__printSheets),2);
   const snapshot=await b.page.evaluate(()=>window.__printSnapshot);
   fs.writeFileSync(path.join(artifacts,browser+'.html'),snapshot);
   const proof=await b.context.newPage();
   try {
    await proof.setContent(snapshot);await proof.emulateMedia({media:'print'});
    const geometry=await proof.evaluate(()=>[...document.querySelectorAll('.print-sheet')].map(sheet=>{
     const svg=sheet.querySelector('svg'),r=sheet.getBoundingClientRect(),s=svg.getBoundingClientRect();
     return {height:r.height,available:innerHeight,width:r.width,svgWidth:s.width,svgHeight:s.height,position:getComputedStyle(svg).position,breakBefore:getComputedStyle(sheet).breakBefore,breakInside:getComputedStyle(sheet).breakInside};
    }));
    for(const sheet of geometry){assert(Math.abs(sheet.height-sheet.available)<.1);assert.equal(sheet.position,'absolute');assert(Math.abs(sheet.svgHeight-sheet.height)<.1);assert(Math.abs(sheet.svgWidth-sheet.width)<.1);assert.equal(sheet.breakInside,'avoid');}
    assert.equal(geometry[0].breakBefore,'auto');assert.equal(geometry[1].breakBefore,'page');
    if(browser==='chromium') {
     const pdf=await proof.pdf({preferCSSPageSize:true,printBackground:true});
     fs.writeFileSync(path.join(artifacts,'chromium.pdf'),pdf);
     assert.equal([...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length,2,'Two source pages produce two PDF pages');
    }
   }finally{await proof.close();}
   assert.deepEqual(b.logs,[]);
   console.log(`[PASSED] ${browser}: two isolated print sheets fill their page areas${browser==='chromium'?'; PDF has exactly two pages':''}`);
  }finally{await b.close();}
 }
 console.log('Print artifacts: '+artifacts);
}finally{server.close();}
