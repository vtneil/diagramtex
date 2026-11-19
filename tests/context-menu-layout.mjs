import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-context-menu-')),server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`),p=b.page;
  try {
   for(const [width,height] of [[960,700],[700,500],[600,500]]) {
    await p.setViewportSize({width,height});
    await p.evaluate(()=>{
     document.body.classList.add('no-files');document.querySelector('#rightCol').style.display='none';
     const shapes=[0,1,2].map(i=>({...TD.TYPES.rect.create({x:40+i*100,y:40},{stroke:'#000000',fill:'#ffccaa',width:1}),id:'menu-'+i,w:80,h:40}));
     TD.app.newDoc('Menus',shapes,null,null,null,'classic');TD.app.setMode('diagram');TD.state.sel=new Set(shapes.map(s=>s.id));TD.app.render();TD.app.renderProps();
    });
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    // Open the genuine shape context handler at the lower-right window edge.
    await p.evaluate(()=>{const target=document.querySelector('#content [data-id="menu-0"]');target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}));});
    const within=async locator=>{const r=await locator.boundingBox();assert(r && r.x>=5 && r.y>=5 && r.x+r.width<=width-5 && r.y+r.height<=height-5,`${browser}/${width}x${height}: menu stays in viewport: ${JSON.stringify(r)}`);};
    const root=p.locator('#ctxMenu');await within(root);
    for(const action of ['img:copy-svg','a:back','l:bottom','d:v']) {
     const submenu=root.locator(`.sub:has([data-act="${action}"])`), row=submenu.locator('..');
     await row.scrollIntoViewIfNeeded();await row.hover();await within(submenu);
     const choice=submenu.locator(`[data-act="${action}"]`);await choice.scrollIntoViewIfNeeded();await choice.hover();assert(await submenu.isVisible(),'submenu remains open while moving into it');
    }
    await p.screenshot({path:path.join(artifacts,`${browser}-${width}.png`)});
    await root.locator('[data-act="d:v"]').click();assert(await root.isHidden(),'submenu action executes and closes menu');
   }
   assert.deepEqual(b.logs,[]);console.log(`✓ ${browser}: root menus and image/arrange/align/distribute submenus fit short/narrow windows`);
  } finally {await b.close();}
 }
} finally {server.close();}
console.log('Screenshots: '+artifacts);
