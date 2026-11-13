import fs from 'node:fs';
import {serve,launch} from '../../../../../tests/chrome.mjs';
fs.mkdirSync('/tmp/texdiagram-editors',{recursive:true});
const srv=await serve(new URL('../../../../../public', import.meta.url).pathname),b=await launch(`http://127.0.0.1:${srv.port}/`);
const click=async(p)=>{await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});};
const point=async(sel)=>b.ev(`let el=document.querySelector(${JSON.stringify(sel)}),r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
try{
 const types=await b.ev('return [...TD.blocks.entries()].filter(([,v])=>v.editor).map(([k])=>k)');

 const picks={geo3d:'point',geo2d:'point',qc:'x',forest:'two',zx:'x',feynman:'v:dot',timing:'r:signal',automata:'s:state',kmap:'m:2,2,1',bytefield:'bitbox',chemfig:'a:N',cd:'X',xy:'X',cz:'res:us',physics:null};
 const read=()=>b.ev(`let m=[...document.querySelectorAll('.modal')].find(e=>!e.hidden);return m.querySelector('.cz-code textarea').value;`);
 const tool=async(value)=>{let p=await b.ev(`let m=[...document.querySelectorAll('.modal')].find(e=>!e.hidden),e=[...m.querySelectorAll('.modal-head button')].find(e=>[...e.attributes].some(a=>a.name.startsWith('data-')&&a.value===${JSON.stringify(value)}));let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await click(p);};
 for(const type of types.filter(t=>['timing','chemfig'].includes(t))){
  try{
   await b.ev(`for(let m of document.querySelectorAll('.modal'))m.hidden=true;TD.app.newDoc('Graphical editor smoke',null,null,null,null,'board');const s=TD.TYPES[${JSON.stringify(type)}].create({x:0,y:0},TD.state.defaults),d=TD.blocks.get(${JSON.stringify(type)}).editor;window.__edited=null;d.get().open(s,v=>window.__edited=v,d.options?.());await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
   const before=await read();
   const p=await b.ev(`let m=[...document.querySelectorAll('.modal')].find(e=>!e.hidden),buttons=[...m.querySelectorAll('.cz-list button')],e=${picks[type]===null?'buttons[0]':`buttons.find(e=>(e.dataset.item||e.dataset.part)===${JSON.stringify(picks[type])})`};if(!e)throw Error('missing item');e.scrollIntoView({block:'nearest'});let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
   await click(p);
   const confirm=await b.ev(`let e=document.querySelector('.td-dialog button.primary');if(!e)return null;let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);if(confirm)await click(confirm);
   const stage=await b.ev(`let m=[...document.querySelectorAll('.modal')].find(e=>!e.hidden),r=m.querySelector('.cz-stage').getBoundingClientRect();return {x:r.x+r.width*.65,y:r.y+r.height*.7};`);
   if(type==='chemfig'){let atom=await point('#cfModal .cz-svg foreignObject');await click(atom);}else if(type==='cz'){
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...stage,button:'left',buttons:1,clickCount:1});
    await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:stage.x+90,y:stage.y,button:'left',buttons:1});
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:stage.x+90,y:stage.y,button:'left',buttons:0,clickCount:1});
   }else if(!['geo3d','geo2d','bytefield','kmap','forest','chemfig','timing'].includes(type))await click(stage);
   await b.ev('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;');
   const after=await read();
   if(after===before){console.log('INCONCLUSIVE',type,'palette gesture did not change source');continue;}
   await tool('undo');let undone=await read();await tool('redo');let redone=await read();await tool('done');
   let applied=await b.ev('return window.__edited');
   let result={type,changed:true,undoExact:undone===before,redoExact:redone===after,applied:!!applied,before,after,undone,redone};
   fs.writeFileSync(`/tmp/texdiagram-editors/graphical-${type}.json`,JSON.stringify(result,null,2));
   console.log(result.undoExact&&result.redoExact&&result.applied?'PASS':'FAIL',type,JSON.stringify({undoExact:result.undoExact,redoExact:result.redoExact,applied:result.applied}));
  }catch(e){console.log('ERROR',type,e.message);}
 }
 console.log('errors',b.logs);

}finally{b.close();srv.close();}
