import fs from 'node:fs';import assert from 'node:assert/strict';
import {serve,launch} from '../../../../../tests/chrome.mjs';
fs.mkdirSync('/tmp/texdiagram-editors',{recursive:true});
const srv=await serve(new URL('../../../../../public', import.meta.url).pathname),b=await launch(`http://127.0.0.1:${srv.port}/`);
const click=async(p)=>{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});};
const center=sel=>b.ev(`let r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
const drag=async(a,z)=>{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});for(let t of [.25,.5,.75,1])await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(z.x-a.x)*t,y:a.y+(z.y-a.y)*t,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...z,button:'left',buttons:0,clickCount:1});};
const open=async(type)=>b.ev(`for(let m of document.querySelectorAll('.modal'))m.hidden=true;TD.app.newDoc('Connections',null,null,null,null,'board');window.__shape=TD.TYPES[${JSON.stringify(type)}].create({x:0,y:0},TD.state.defaults);window.__edited=null;const d=TD.blocks.get(${JSON.stringify(type)}).editor;d.get().open(window.__shape,v=>window.__edited=v,d.options?.());await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
try{
 await open('cz');await click(await center('#czModal [data-cz=wire]'));
 const pins=await b.ev(`return [...document.querySelectorAll('#czModal .cz-pin')].map(e=>{let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}).sort((a,b)=>a.x-b.x||a.y-b.y);`);
 await drag(pins[0],pins[pins.length-1]);await click(await center('#czModal [data-cz=select]'));
 const cap=await b.ev(`return window.__shape.items.find(i=>i.part.startsWith('cap')).id`);
 const body=await center(`#czModal g[data-id="${cap}"] .cz-hitline`);await drag(body,{x:body.x+70,y:body.y});
 await click(await center('#czModal [data-cz=done]'));const result=await b.ev('return {before:window.__shape.items,after:window.__edited.items}');
 assert.equal(result.after.length,result.before.length+1);const c=result.after.find(i=>i.id===cap),c0=result.before.find(i=>i.id===cap),w=result.after.at(-1);assert.notDeepEqual(c.a,c0.a);assert([c.a,c.b].some(p=>JSON.stringify(p)===JSON.stringify(w.b)||JSON.stringify(p)===JSON.stringify(w.a)));
 fs.writeFileSync('/tmp/texdiagram-editors/circuit-connections.json',JSON.stringify(result,null,2));console.log('PASS circuit: wire between pins, move capacitor, attached wire follows');
 for(let type of ['geo2d','geo3d']){
  await open(type);const before=await b.ev(`return document.querySelector('#g3Modal textarea').value`);const p=await center('#g3Modal .g3-pt:not(.off)');await drag(p,{x:p.x+35,y:p.y-25});
  const after=await b.ev(`return document.querySelector('#g3Modal textarea').value`);assert.notEqual(before,after);await click(await center('#g3Modal [data-ge=undo]'));assert.equal(await b.ev(`return document.querySelector('#g3Modal textarea').value`),before);await click(await center('#g3Modal [data-ge=redo]'));assert.equal(await b.ev(`return document.querySelector('#g3Modal textarea').value`),after);
  fs.writeFileSync(`/tmp/texdiagram-editors/drag-${type}.json`,JSON.stringify({before,after},null,2));console.log('PASS',type,'drag a writable point, exact Undo/Redo');
 }
 console.log('errors',b.logs);
}catch(e){console.log('FAIL',e.stack);process.exitCode=1;}finally{b.close();srv.close();}
