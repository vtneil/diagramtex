import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();const server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`),p=b.page;
  try {
   const button=p.locator('#btnSnap'), current=()=>button.getAttribute('data-snap-mode');
   const choose=async mode=>{for(let i=0;i<4 && await current()!==mode;i++)await button.click();assert.equal(await current(),mode);};
   const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const fixture=async kind=>{await p.evaluate(kind=>{
    const rect=(id,x,y,w=40,h=40)=>({...TD.TYPES.rect.create({x,y},{stroke:'#000000',fill:null,width:1}),id,x,y,w,h});
    const shapes=kind==='move'?[rect('moving',80,80)]:kind==='anchor'?[rect('target',205,78,37,43)]:[];
    TD.app.newDoc('Snap modes',shapes,null,null,null,'classic');TD.app.setMode('diagram');Object.assign(TD.state.view,{x:0,y:0,zoom:1});
    if(kind!=='anchor')TD.state.doc.blocks[0].guides=[{id:'snap-guide',axis:'x',position:kind==='move'?181:147}];
    TD.state.sel=kind==='move'?new Set(['moving']):new Set();TD.app.cmd.setTool('select');TD.app.render();TD.app.renderProps();
   },kind);await frame();};
   const at=(x,y)=>p.evaluate(({x,y})=>{const r=document.querySelector('#canvas').getBoundingClientRect(),v=TD.state.view;return{x:r.left+(x-v.x)*v.zoom,y:r.top+(y-v.y)*v.zoom};},{x,y});
   const click=async(x,y)=>{const q=await at(x,y);await p.mouse.click(q.x,q.y);};
   const drag=async(x,y,tx,ty)=>{const a=await at(x,y),b=await at(tx,ty);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:4});await p.mouse.up();await frame();};
   await p.evaluate(()=>TD.app.setMode('diagram'));
   await choose('objects');
   const icons=new Set();
   for(const expected of ['grid','both','off','objects']) {await button.click();assert.equal(await current(),expected,'mode cycle order');assert.equal(await button.getAttribute('aria-pressed'),String(expected!=='off'));assert.equal(await button.locator('svg').getAttribute('data-snap-icon'),expected);assert.equal(await button.locator('.snap-magnet').count(),1,'each mode retains the magnet badge');icons.add(await button.locator('svg').innerHTML());}
   assert.equal(icons.size,3,'object/grid modes have separate icons; all/off share the original magnet');
   const points={objects:[147,237],grid:[140,240],both:[147,240],off:[143,237]},moves={objects:[140.5,83],grid:[140,80],both:[140.5,80],off:[143,83]};
   for(const mode of ['objects','grid','both','off']) {
    await choose(mode);await fixture('point');
    await p.evaluate(()=>TD.app.cmd.setTool('dot'));await click(143,237);await frame();
    assert.deepEqual(await p.evaluate(()=>{const s=TD.state.doc.shapes.at(-1);return[s.cx,s.cy];}),points[mode],browser+'/'+mode+' point placement');
    await fixture('point');await p.evaluate(()=>TD.app.cmd.setTool('dot'));await p.keyboard.down('Alt');await click(143,237);await p.keyboard.up('Alt');
    assert.deepEqual(await p.evaluate(()=>{const s=TD.state.doc.shapes.at(-1);return[s.cx,s.cy];}),[143,237],mode+' Alt bypass');
    await fixture('move');await drag(90,80,153,83);
    const moved=await p.evaluate(()=>{const s=TD.state.doc.shapes[0];return[s.x,s.y];});
    for(let i=0;i<2;i++)assert(Math.abs(moved[i]-moves[mode][i])<1e-6,`${browser}/${mode} move: ${moved}`);
    await fixture('anchor');await p.evaluate(()=>TD.app.cmd.setTool('line'));await drag(100,200,246,103);
    assert.equal(await p.evaluate(()=>!!TD.state.doc.shapes.at(-1).link2),mode==='objects'||mode==='both',mode+' connector attachment');
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('diagramtex.prefs')).snapMode),mode,'chosen mode saved');
   }
   // Reload and migration from the previous boolean preference.
   await choose('grid');await p.reload();await p.waitForFunction(()=>!!window.TD?.ready);await p.evaluate(()=>TD.ready);assert.equal(await current(),'grid');
   for(const enabled of [false,true]) {
    await p.evaluate(enabled=>{const key='diagramtex.prefs',prefs=JSON.parse(localStorage.getItem(key));delete prefs.snapMode;prefs.snap=enabled;localStorage.setItem(key,JSON.stringify(prefs));},enabled);
    await p.reload();await p.waitForFunction(()=>!!window.TD?.ready);await p.evaluate(()=>TD.ready);assert.equal(await current(),enabled?'both':'off','legacy preference migration');
   }
   assert.deepEqual(b.logs,[]);console.log(`✓ ${browser}: four-mode cycle, point/drag snapping, Alt, attachments, persistence and legacy migration`);
  } finally {await b.close();}
 }
} finally {server.close();}
