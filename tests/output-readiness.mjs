// Gate real worker delivery to exercise global output and per-object exceptions.
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);
try {
  for (const browser of testBrowsers()) {
    const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`);
    const downloads=[];b.page.on('download',d=>downloads.push(d));
    try {
      await b.page.evaluate(()=>{
        const Native=window.Worker;
        window.__hold=false;window.__held=[];window.__jobs={};window.__compiles=[];window.__prints=0;
        window.print=()=>{window.__prints++;};
        window.Worker=class {
          onmessage=null;onerror=null; // the worker takes and answers batches: each result is held on its own
          constructor(...args){this.native=new Native(...args);this.native.onmessage=event=>{for(const data of [event.data].flat()){const deliver=()=>this.onmessage?.({data});if(window.__hold)window.__held.push({id:data.id,deliver});else deliver();}};this.native.onerror=e=>this.onerror?.(e);}
          postMessage(job){for(const j of [job].flat())window.__jobs[j.id]=j;this.native.postMessage(job);}
          terminate(){this.native.terminate();}
        };
        for(const engine of ['katex','temml']) {const render=window[engine].renderToString;window[engine].renderToString=(tex,opts)=>{if(/431|907|619/.test(tex))window.__compiles.push({engine,tex});return render(tex,opts);};}
      });
      for(const target of ['temml','katex']) {
        await b.page.evaluate(async target=>{
          window.__hold=false;window.__held.splice(0).forEach(x=>x.deliver());
          TD.math.set(target==='temml'?'katex':'temml');await TD.math.whenReady();
          const offset=target==='temml'?0:1000;
          const label=(id,x,y,n)=>({...TD.TYPES.text.create({x,y},{}),id,text:`$\\hat x_{${n+offset}}$`});
          const shapes=[label('ready-soon',150,160,431),label('still-loading',400,160,907),
            {...TD.TYPES.rect.create({x:100,y:300},{stroke:'#000000',width:1}),id:'ready-rect',w:100,h:60},
            {...TD.TYPES.comp.create({x:450,y:320}),id:'nested-loading',ref:'output-part',def:[label('nested-label',0,0,619)]}];
          TD.app.newDoc('Output readiness',null,null,null,null,'page',{pages:1,shapes});await TD.math.whenReady();
        },target);
        await b.page.locator('#btnExport').click();
        assert(await b.page.locator('.exp-pop').isVisible());
        await b.page.evaluate(()=>{window.__hold=true;window.__compiles.length=0;});
        await b.page.locator(`#engineBox [data-engine="${target}"]`).click();
        await b.page.waitForFunction(()=>TD.math.pending>0 && document.querySelector('#btnExport').disabled);
        assert(await b.page.locator('#topbar [data-cmd="print"]').isDisabled());
        assert(await b.page.locator('#btnTikz').isDisabled());
        // it fades out (120ms), then goes
        await b.page.locator('.exp-pop').waitFor({state:'hidden',timeout:1000}).catch(()=>assert.fail('An open export menu closes when rendering begins'));
        const before=downloads.length;
        await b.page.evaluate(()=>{
          for(const command of ['print','export','svg','html','latex','tikz'])TD.app.cmd.runCmd(command);
          // Stale menu controls must not bypass the action guard, including PDF.
          for(const format of ['png','svg','pdf']) {
            document.querySelector(`.exp-pop [data-efmt="${format}"]`)?.click();
            document.querySelector('.exp-pop [data-ego]')?.click();
          }
        });
        await b.page.keyboard.press('Control+p');await b.page.keyboard.press('Meta+p');
        assert.equal(await b.page.evaluate(()=>window.__prints),0);
        assert.equal(downloads.length,before);
        assert.equal(await b.page.evaluate(()=>window.__compiles.length),0,'Blocked actions never force main-thread target compilation');
        assert(await b.page.evaluate(()=>JSON.parse(TD.app.projectJson(TD.state.doc)).sheet.shapes.length===4),'Project data remains saveable');

        // Browser-menu print cannot be cancelled; only a readiness notice may print.
        await b.page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
        await b.page.emulateMedia({media:'print'});
        assert.equal(await b.page.locator('#main').evaluate(e=>getComputedStyle(e).display),'none');
        assert.equal(await b.page.locator('#printBlocked').evaluate(e=>getComputedStyle(e).display),'block');
        await b.page.emulateMedia({media:'screen'});
        await b.page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
        assert(!await b.page.locator('body').evaluate(e=>e.classList.contains('print-blocked')));

        const openMenu=async id=>{
          await b.page.evaluate(id=>{TD.state.sel=new Set([id]);TD.app.render();},id);
          await b.page.locator(`#content > [data-id="${id}"]`).dispatchEvent('contextmenu',{clientX:300,clientY:300,bubbles:true});
        };
        await openMenu('still-loading');
        assert(await b.page.locator('#ctxMenu [data-act="img:save-svg"]').isDisabled());
        await openMenu('nested-loading');
        assert(await b.page.locator('#ctxMenu [data-act="img:save-png"]').isDisabled(),'Nested unfinished labels block the containing object');
        await openMenu('ready-rect');
        assert(!await b.page.locator('#ctxMenu [data-act="img:save-svg"]').isDisabled(),'Ready geometry exports while other objects load');
        const elementDownload=b.page.waitForEvent('download');
        await b.page.locator('#ctxMenu [data-act="img:save-svg"]').evaluate(e=>e.click());
        await elementDownload;
        assert(await b.page.evaluate(()=>TD.math.pending>0));
        assert.equal(downloads.length,before+1,'Ready element SVG downloads without waiting for the rest');

        await openMenu('ready-soon');
        assert(await b.page.locator('#ctxMenu [data-act="img:save-svg"]').isDisabled());
        await b.page.waitForFunction(()=>window.__held.some(x=>window.__jobs[x.id]?.tex.includes('431')));
        await b.page.evaluate(()=>{const i=window.__held.findIndex(x=>window.__jobs[x.id]?.tex.includes('431'));window.__held.splice(i,1)[0].deliver();});
        await b.page.waitForFunction(()=>!document.querySelector('#ctxMenu [data-act="img:save-svg"]').disabled);
        assert(await b.page.evaluate(()=>TD.math.pending>0),'Unrelated elements are still loading');
        const objectPng=await b.page.evaluate(async()=>{
          const shape=TD.state.doc.sheet.shapes.find(s=>s.id==='ready-soon');
          let globallyBlocked=false;try{await TD.app.pngOf([shape],96,false);}catch{globallyBlocked=true;}
          const image=await TD.app.pngOf([shape],96,false,true);
          return {globallyBlocked,type:image.type,size:image.size,pending:TD.math.pending};
        });
        assert(objectPng.globallyBlocked && objectPng.pending>0 && objectPng.type==='image/png' && objectPng.size>100);
        assert.equal(await b.page.evaluate(()=>window.__compiles.length),0);
        await b.page.evaluate(async()=>{window.__hold=false;window.__held.splice(0).forEach(x=>x.deliver());await TD.math.whenReady();});
        assert(!await b.page.locator('#btnExport').isDisabled());
        assert(!await b.page.locator('#topbar [data-cmd="print"]').isDisabled());
        await b.page.evaluate(()=>TD.app.cmd.runCmd('print'));
        await b.page.waitForFunction(()=>window.__prints===1);
        await b.page.evaluate(()=>{window.__prints=0;});
        console.log(`✓ ${browser} → ${target}: global output blocked; ready object SVG/PNG allowed; nested pending objects blocked; print protected`);
      }
      assert.deepEqual(b.logs,[]);
    }finally{await b.close();}
  }
}finally{server.close();}
