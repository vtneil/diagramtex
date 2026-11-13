import fs from 'node:fs';import {serve,launch} from '../../../../../tests/chrome.mjs';
fs.mkdirSync('/tmp/texdiagram-editors',{recursive:true});
const srv=await serve(new URL('../../../../../public',import.meta.url).pathname),b=await launch(`http://127.0.0.1:${srv.port}/`);
const click=async(p)=>{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});};
const center=sel=>b.ev(`let r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
const key=async(k,v,mod=0)=>{await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,windowsVirtualKeyCode:v,modifiers:mod});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,windowsVirtualKeyCode:v,modifiers:mod});};
try{
 const types=await b.ev('return [...TD.blocks.entries()].filter(([,v])=>v.editor).map(([k])=>k)');const results=[];
 for(let type of types){
  await b.ev(`for(let m of document.querySelectorAll('.modal'))m.hidden=true;TD.app.newDoc('Invalid-source QA',null,null,null,null,'board');window.__edited=null;const s=TD.TYPES[${JSON.stringify(type)}].create({x:0,y:0},TD.state.defaults),d=TD.blocks.get(${JSON.stringify(type)}).editor;d.get().open(s,v=>window.__edited=v,d.options?.());await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
  const id=await b.ev(`return [...document.querySelectorAll('.modal')].find(e=>!e.hidden).id`);
  const before=await b.ev(`return document.querySelector('#${id} textarea').value`);
  await click(await center(`#${id} textarea`));await b.ev(`document.querySelector('#${id} textarea').select();return true;`);await b.send('Input.insertText',{text:type==='physics'?'\\physics{optics}\n\\lens[f=oops](':'\\begin{'});await key('Tab',9);
  const state=await b.ev(`let m=document.querySelector('#${id}');return {source:m.querySelector('textarea').value,message:m.querySelector('.cz-msg').textContent,undo:!m.querySelector('.modal-head button[data-${{qc:'qe',forest:'fe',zx:'ze',feynman:'fe',timing:'te',automata:'fe',kmap:'ke',bytefield:'be',chemfig:'ce',cd:'ce',xy:'ce',cz:'cz',geo2d:'ge',geo3d:'ge',physics:'pe'}[type]}=undo]').disabled};`);
  let restored=null;if(state.undo){const p=await b.ev(`let e=[...document.querySelectorAll('#${id} .modal-head button')].find(e=>[...e.attributes].some(a=>a.name.startsWith('data-')&&a.value==='undo')),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await click(p);restored=(await b.ev(`return document.querySelector('#${id} textarea').value`))===before;}
  const p=await b.ev(`let e=[...document.querySelectorAll('#${id} .modal-head button')].find(e=>e.textContent==='Cancel'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await click(p);
  const dialog=await b.ev(`return document.querySelector('.td-dialog')?.textContent||''`);if(dialog)await click(await center('.td-dialog button.primary'));
  const leaked=await b.ev('return window.__edited');const result={type,...state,restored,discardPrompt:!!dialog,parentUnchanged:leaked===null};results.push(result);console.log(JSON.stringify(result));
 }
 fs.writeFileSync('/tmp/texdiagram-editors/malformed.json',JSON.stringify(results,null,2));console.log('console errors',b.logs);
}finally{b.close();srv.close();}
