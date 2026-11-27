// Real worker dispatch order and real DOM publication order, including cached
// results and the cooperative fallback. Background source order stays intact.
// The worker takes batches (an array of jobs, in priority order), one batch at a time.
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();const server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`);
  try {
   await b.page.evaluate(()=>{
    const Native=window.Worker;window.__hold=false;window.__held=[];window.__sent=[];
    window.Worker=class {
     onmessage=null;onerror=null;
     constructor(...args){this.native=new Native(...args);this.native.onmessage=e=>{const fn=()=>this.onmessage?.(e);if(window.__hold)window.__held.push(fn);else fn();};this.native.onerror=e=>this.onerror?.(e);}
     postMessage(job){window.__posts=(window.__posts||0)+1;for(const j of [job].flat())window.__sent.push(j);this.native.postMessage(job);}terminate(){this.native.terminate();}
    };
   });
   let nonce=60000;
   for(const target of ['temml','katex']) {
    nonce+=100;
    await b.page.evaluate(async({target,nonce})=>{
     window.__hold=false;window.__held.splice(0).forEach(f=>f());
     TD.math.set(target==='temml'?'katex':'temml');await TD.math.whenReady();
     const step=(29.7+1)*TD.PX_PER_CM;
     const label=(id,y,n)=>({...TD.TYPES.text.create({x:150,y},{}),id,text:`$x_{${nonce+n}}$`});
     TD.app.newDoc('Priority pages',null,null,null,{paper:'a4'},'page',{pages:3,shapes:[
      label('page-one',100,1),label('page-two',step+100,2),label('current-offscreen',step*2+1000,3),label('visible-last',step*2+150,4)
     ]});await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     TD.state.view={x:0,y:step*2+40,zoom:2};TD.app.render();await TD.math.whenReady();
     TD.state.sel=new Set(['visible-last']);TD.app.renderProps();
     if(document.querySelector('#props .pg-item'))throw new Error('The priority fixture must not rely on the page thumbnail panel');
     window.__sent=[];window.__posts=0;window.__held=[];window.__hold=true;TD.math.set(target);
    },{target,nonce});
    await b.page.waitForFunction(()=>window.__held.length>0);
    const first=await b.page.evaluate(()=>window.__sent.map(j=>j.tex));
    assert.equal(await b.page.evaluate(()=>window.__posts),1,'Only one batch may be in flight');
    assert(first[0].includes(String(nonce+4)),`${browser}/${target}: the visible last object starts first: ${first}`);
    await b.page.evaluate(()=>window.__held.shift()());
    await b.page.waitForFunction(()=>window.__sent.length>=2);
    assert((await b.page.evaluate(()=>window.__sent[1].tex)).includes(String(nonce+3)),'The rest of the current page precedes earlier pages');
    await b.page.evaluate(async()=>{window.__hold=false;window.__held.splice(0).forEach(f=>f());await TD.math.whenReady();});
    assert.equal(await b.page.locator('#content .math-pending').count(),0);
    console.log(`[PASSED] ${browser} → ${target}: visible object, current page, then earlier background pages`);
   }
   for(const shared of [false,true]) {
    nonce+=100;
    const expected=await b.page.evaluate(async({nonce,shared})=>{
     TD.math.set('katex');await TD.math.whenReady();
     TD.app.newDoc('Priority Document',null,null,Array.from({length:20},(_,i)=>({type:'text',text:`\\section{Section ${i+1}}\n$z_{${nonce+(shared?0:i)}}$\n`+'A paragraph of ordinary prose to give each block a useful height. '.repeat(12)})),{title:false,numbered:true},'classic');
     await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const root=document.querySelector('#docview'),target=root.querySelector('.blk[data-i="15"]');
     root.scrollTop+=target.getBoundingClientRect().top-root.getBoundingClientRect().top-80;
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const viewport=root.getBoundingClientRect();
     const first=[...root.querySelectorAll('.blk')].find(e=>{const r=e.getBoundingClientRect();return r.bottom>=viewport.top&&r.top<=viewport.bottom;});
     window.__visibleIndex=+first.dataset.i;window.__headingBefore=first.querySelector('h1,h2,h3')?.textContent;
     window.__published=[];
     window.__observer?.disconnect();window.__observer=new MutationObserver(records=>{
      for(const record of records){const body=record.target;if(body.matches('.blk-body')&&!body.classList.contains('math-pending'))window.__published.push(+body.closest('.blk').dataset.i);}
     });window.__observer.observe(root,{subtree:true,attributes:true,attributeFilter:['class']});
     window.__sent=[];window.__held=[];window.__hold=true;TD.math.set('temml');
     return window.__visibleIndex;
    },{nonce,shared});
    assert(expected>5,'The Document fixture is scrolled far from its beginning');
    await b.page.waitForFunction(()=>window.__held.length>0);
    assert((await b.page.evaluate(()=>window.__sent[0].tex)).includes(String(nonce+(shared?0:expected))),'Compilation begins with a visible Document block');
    await b.page.evaluate(async()=>{window.__hold=false;window.__held.splice(0).forEach(f=>f());await TD.math.whenReady();});
    assert.equal(await b.page.evaluate(()=>window.__published[0]),expected,'Shared-result DOM updates also publish visible blocks first');
    assert(await b.page.evaluate(()=>document.querySelector(`#docview .blk[data-i="${window.__visibleIndex}"] h1`)?.textContent===window.__headingBefore),'Priority cannot renumber headings');
    {
     const firstCached=await b.page.evaluate(async()=>{
      TD.math.set('katex');await TD.math.whenReady();window.__published=[];window.__sent=[];
      TD.math.set('temml');await TD.math.whenReady();return {first:window.__published[0],sent:window.__sent.length};
     });
     assert.equal(firstCached.first,expected);assert.equal(firstCached.sent,0,'Cached transitions do not recompile');
    }
    console.log(`[PASSED] ${browser}: scrolled Document ${shared?'shared/cached':'unique'} formulas compile/publish in view order; numbering retained`);
   }
   // Active Classic diagram: other blocks must not start generating first.
   nonce+=100;
   await b.page.evaluate(async nonce=>{
    TD.math.set('katex');await TD.math.whenReady();
    const text=(id,n)=>({...TD.TYPES.text.create({x:180,y:180},{}),id,text:`$y_{${nonce+n}}$`});
    TD.app.newDoc('Active diagram',null,null,[{type:'diagram',shapes:[text('inactive',1)]},{type:'diagram',shapes:[text('active',2)]}],null,'classic');
    TD.app.setActiveBlock(1);TD.app.cmd.setMode('diagram');await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    window.__sent=[];window.__held=[];window.__hold=true;TD.math.set('temml');
   },nonce);
   await b.page.waitForFunction(()=>window.__held.length>0);
   assert((await b.page.evaluate(()=>window.__sent[0].tex)).includes(String(nonce+2)));
   await b.page.evaluate(async()=>{window.__hold=false;window.__held.splice(0).forEach(f=>f());await TD.math.whenReady();});
   console.log(`[PASSED] ${browser}: the active Classic diagram takes precedence over other blocks`);
   // The fallback uses the same view priorities and still yields between jobs.
   nonce+=100;
   const fallback=await b.page.evaluate(async nonce=>{
    TD.math.set('katex');await TD.math.whenReady();window.Worker=undefined;
    const label=(id,x,n)=>({...TD.TYPES.text.create({x,y:150},{}),id,text:`$w_{${nonce+n}}$`});
    TD.app.newDoc('Priority Whiteboard',[label('offscreen-first',10000,1),label('visible-last',180,2)],null,null,null,'board');
    await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    TD.state.view={x:0,y:0,zoom:1};TD.app.render();window.__fallback=[];
    const render=window.temml.renderToString;window.temml.renderToString=(tex,options)=>{if(tex.includes('w_'))window.__fallback.push(tex);return render(tex,options);};
    TD.math.set('temml');await TD.math.whenReady();window.temml.renderToString=render;return window.__fallback;
   },nonce);
   assert(fallback[0]?.includes(String(nonce+2)),'Fallback compiles the on-screen Whiteboard element before offscreen elements');
   console.log(`[PASSED] ${browser}: cooperative fallback also prioritizes on-screen elements`);
   assert.deepEqual(b.logs,[]);
  }finally{await b.close();}
 }
}finally{server.close();}
