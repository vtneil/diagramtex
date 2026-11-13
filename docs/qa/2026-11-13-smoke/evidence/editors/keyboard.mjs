import {serve,launch} from '../../../../../tests/chrome.mjs';
const srv=await serve(new URL('../../../../../public', import.meta.url).pathname);const b=await launch(`http://127.0.0.1:${srv.port}/`);
const key=async(k,c)=>{await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,windowsVirtualKeyCode:c});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,windowsVirtualKeyCode:c});};
try{
 await b.ev(`const s=TD.TYPES.qc.create({x:0,y:0},TD.state.defaults);TD.qcEditor.open(s,()=>{});await document.fonts.ready;document.querySelector('#qcModal input[type=search]').focus();return true;`);
 await key('Tab',9);
 const inspect=()=>b.ev(`const r=document.querySelector('#qcModal');return {focus:document.activeElement.outerHTML.slice(0,260),armed:!!r.querySelector('.qe-item.on'),tip:r.querySelector('.cz-tip').textContent};`);
 console.log('focus',await inspect());await key('Enter',13);console.log('Enter',await inspect());await key(' ',32);console.log('Space',await inspect());
 const p=await b.ev(`const r=document.activeElement.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
 console.log('Mouse',await inspect());console.log('errors',b.logs);
}finally{b.close();srv.close();}
