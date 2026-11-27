// Hold real worker results and image decoding separately: no blank swap can
// precede decoding, and a finished preview must regain contrast monotonically.
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
    const Native=window.Worker,decode=Image.prototype.decode;
    window.__hold=false;window.__held=[];window.__holdDecode=false;window.__decoders=[];
    window.Worker=class {
     onmessage=null;onerror=null;
     constructor(...args){this.native=new Native(...args);this.native.onmessage=e=>{const fn=()=>this.onmessage?.(e);if(window.__hold)window.__held.push(fn);else fn();};this.native.onerror=e=>this.onerror?.(e);}
     postMessage(x){this.native.postMessage(x);}terminate(){this.native.terminate();}
    };
    Image.prototype.decode=function(){if(!window.__holdDecode)return decode.call(this);return new Promise((resolve,reject)=>window.__decoders.push(()=>decode.call(this).then(resolve,reject)));};
   });
   for(const reduced of [false,true]) for(const target of ['temml','katex']) {
    await b.page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await b.page.evaluate(async({target,reduced})=>{
     window.__hold=false;window.__holdDecode=false;window.__held.splice(0).forEach(f=>f());window.__decoders.splice(0).forEach(f=>f());
     TD.math.set(target==='temml'?'katex':'temml');await TD.math.whenReady();
     const text=String.raw`$\int_0^\infty e^{-x^2}\,dx+\hat{\mathbf v}_{`+(target==='temml'?6203:7203)+(reduced?10:0)+'}$';
     const shape={...TD.TYPES.text.create({x:150,y:180},{}),id:'fade-a',text};
     TD.app.newDoc('Preview fade',null,null,null,null,'page',{pages:1,shapes:[shape,{...shape,id:'fade-b',x:450}]});await TD.math.whenReady();
     await Promise.all([...document.querySelectorAll('#content image.svg-label')].map(e=>{const img=new Image();img.src=e.getAttribute('href');return img.decode();}));
     window.__before=[...document.querySelectorAll('#content image.svg-label')].map(e=>({node:e,href:e.getAttribute('href'),width:e.getAttribute('width'),height:e.getAttribute('height')}));
     window.__hold=true;TD.math.set(target);
    },{target,reduced});
    await b.page.waitForFunction(reduced=>{
     const image=document.querySelector('#content image.svg-label');return image?.classList.contains('math-pending')&&(reduced?+getComputedStyle(image).opacity===1:+getComputedStyle(image).opacity<=.46);
    },reduced);
    await b.page.waitForFunction(()=>window.__held.length>0);
    await b.page.evaluate(()=>{window.__holdDecode=true;window.__hold=false;window.__held.splice(0).forEach(f=>f());});
    await b.page.waitForFunction(()=>window.__decoders.length>0);
    assert(await b.page.evaluate(()=>window.__before.every(old=>old.node.isConnected&&old.node.getAttribute('href')===old.href&&old.node.getAttribute('width')===old.width&&old.node.getAttribute('height')===old.height)),'Keep the old decoded image and geometry while the replacement decodes');
    assert(await b.page.evaluate(()=>TD.math.pending>0&&document.querySelector('#btnExport').disabled));
    assert(await b.page.evaluate(()=>!TD.app.outputReady([TD.state.doc.sheet.shapes[0]])),'An element is not exportable while its finished image is still decoding');
    const samples=await b.page.evaluate(async()=>{
     const image=window.__before[0].node,old=window.__before[0].href,samples=[];
     window.__holdDecode=false;window.__decoders.splice(0).forEach(f=>f());
     let done=false;const ready=TD.math.whenReady().then(()=>{done=true;});
     do {await new Promise(r=>requestAnimationFrame(r));if(image.getAttribute('href')!==old)samples.push(+getComputedStyle(image).opacity);}while(!done);
     await ready;return samples;
    });
    assert(samples.length>0);assert(samples.every(v=>v>=.44&&v<=1));
    assert(samples.every((v,i)=>!i||v>=samples[i-1]-.015),'The finished preview must fade upward without flashing back down');
    assert(samples.at(-1)>.99);
    if(reduced)assert(samples.every(v=>v===1),'Reduced motion swaps decoded content without dimming or animation');
    else assert(samples.some(v=>v>.46&&v<.98),'Normal motion has an intermediate fade, not an abrupt replacement');
    assert.equal(await b.page.locator('#content .math-pending').count(),0);
    assert(!await b.page.locator('#btnExport').isDisabled());
    console.log(`[PASSED] ${browser} → ${target}, reduced-motion=${reduced}: decoded before swap; stable image identity; ${samples.length} monotonic fade samples`);
   }
   // A late decoded image from a cancelled switch must never replace the
   // current engine, or keep its readiness promise waiting indefinitely.
   await b.page.emulateMedia({reducedMotion:'no-preference'});
   await b.page.evaluate(async()=>{
    TD.math.set('katex');await TD.math.whenReady();
    const shape={...TD.TYPES.text.create({x:200,y:200},{}),id:'cancel-decode',text:'$z_{97531}$'};
    TD.app.newDoc('Cancel decoded preview',null,null,null,null,'page',{pages:1,shapes:[shape]});await TD.math.whenReady();
    window.__cancelSource=document.querySelector('#content image.svg-label').getAttribute('href');
    window.__hold=true;TD.math.set('temml');
   });
   await b.page.waitForFunction(()=>window.__held.length>0);
   await b.page.evaluate(()=>{window.__holdDecode=true;window.__hold=false;window.__held.splice(0).forEach(f=>f());});
   await b.page.waitForFunction(()=>window.__decoders.length>0);
   await b.page.evaluate(async()=>{
    TD.math.set('katex');
    await Promise.race([TD.math.whenReady(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cancelled decoding blocked readiness')),2000))]);
    window.__holdDecode=false;window.__decoders.splice(0).forEach(f=>f());
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   });
   assert(await b.page.evaluate(()=>document.querySelector('#content image.svg-label').getAttribute('href')===window.__cancelSource));
   console.log(`[PASSED] ${browser}: cancelled decoding cannot publish a stale preview`);
   await b.page.evaluate(async()=>{
    TD.math.set('katex');await TD.math.whenReady();
    TD.app.newDoc('Atomic Document preview',null,null,[{type:'text',text:'Together $a_{52231}$ and $b_{52232}$.'}],{title:false},'classic');await TD.math.whenReady();
    window.__docBody=document.querySelector('#docview .blk-body');window.__docBefore=window.__docBody.innerHTML;
    window.__hold=true;TD.math.set('temml');
   });
   await b.page.waitForFunction(()=>window.__held.length>0&&+getComputedStyle(window.__docBody).opacity<=.46);
   await b.page.evaluate(async()=>{window.__held.shift()();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   await b.page.waitForFunction(()=>window.__held.length>0);
   assert(await b.page.evaluate(()=>window.__docBody.innerHTML===window.__docBefore),'A Document block never publishes a mixture of finished and unfinished formulas');
   const documentSamples=await b.page.evaluate(async()=>{
    // the fade seen by the browser itself too: on a busy machine two frames may fall further apart than the fade lasts
    window.__faded=false;window.__docBody.addEventListener('transitionrun',e=>{if(e.propertyName==='opacity')window.__faded=true;});
    window.__hold=false;window.__held.splice(0).forEach(f=>f());let done=false;const samples=[];
    const ready=TD.math.whenReady().then(()=>{done=true;});
    // until the fade has run to the end, not only until the formulas are ready: on a busy machine it may start after
    const t0=performance.now();
    do {await new Promise(r=>requestAnimationFrame(r));if(window.__docBody.innerHTML!==window.__docBefore)samples.push(+getComputedStyle(window.__docBody).opacity);}while((!done||!(samples.at(-1)>.99))&&performance.now()-t0<3000);
    await ready;return samples;
   });
   const faded=await b.page.evaluate(()=>window.__faded);
   assert(faded||documentSamples.some(v=>v>.46&&v<.98),`the Document block fades in (samples ${documentSamples.map(v=>v.toFixed(2)).join(' ')})`);assert(documentSamples.at(-1)>.99);
   assert(documentSamples.every((v,i)=>!i||v>=documentSamples[i-1]-.015));
   console.log(`[PASSED] ${browser}: complete Document blocks fade once without partial replacements`);
   assert.deepEqual(b.logs,[]);
  }finally{await b.close();}
 }
}finally{server.close();}
