// View-position preservation, sequential diagram controls, and quantum/classical boundaries.
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve, launch } from './chrome.mjs';
await prepare();
const server=await serve(APP_DIR);let browser;
try {
  browser=await launch(`http://127.0.0.1:${server.port}/`);
  assert.equal(await browser.ev(`
    const check=(v,m)=>{if(!v)throw Error(m)};
    const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    TD.app.cmd.setMode('document');await frame();
    const root=document.querySelector('#docview');root.scrollTop=4200;root.scrollLeft=30;
    const pos={top:root.scrollTop,left:root.scrollLeft};check(pos.top>0,'document is scrollable');
    TD.app.cmd.setMode('diagram');await frame();
    const select=document.querySelector('#blockSel'),prev=document.querySelector('#blockPrev'),next=document.querySelector('#blockNext');
    check(!document.querySelector('#blockNav').hidden,'diagram navigation shown');
    select.value=select.options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}));
    check(prev.disabled && !next.disabled,'first diagram boundary');
    const first=TD.state.doc.active;next.click();check(TD.state.doc.active!==first,'next changes diagram');
    prev.click();check(TD.state.doc.active===first,'previous changes diagram');
    select.value=select.options[select.options.length-1].value;select.dispatchEvent(new Event('change',{bubbles:true}));
    check(next.disabled && !prev.disabled,'last diagram boundary');
    const last=TD.state.doc.active;next.click();check(TD.state.doc.active===last,'disabled next is harmless');
    TD.app.cmd.setMode('document');await frame();
    check(Math.abs(root.scrollTop-pos.top)<2 && Math.abs(root.scrollLeft-pos.left)<2,'document scroll restored');
    const block=root.querySelector('.blk-diag');block.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await frame();
    check(TD.state.mode==='diagram','double click opens diagram');
    TD.app.cmd.setMode('document');await frame();check(Math.abs(root.scrollTop-pos.top)<2,'double-click round trip restores scroll');
    return true;
  `),true);
  const quantum=await browser.ev(`
    const check=(v,m)=>{if(!v)throw Error(m)};
    const samples=['meter','metercw','meterD','measure','measuretab'];
    for(const name of samples) {
      const src='\\\\lstick{0} & \\\\gate{H} & \\\\'+name+'{} \\\\setwiretype{c} & \\\\cw & \\\\rstick{m}';
      const s={type:'qc',x:0,y:0,src,size:'normalsize',font:'default',color:'#000000'};
      const L=TD.qc.layout(s),w=L.ops.filter(o=>o.k==='wire' && o.y1===o.y2);
      check(w[0].t==='q' && w[1].t==='q' && w[2].t==='c',name+': classical output must start after measurement');
      const exported=TD.qc.fullCode(src),M=TD.qc.grid(TD.qc.unwrap(exported).inner);
      check(!M[0][2].includes('setwiretype') && M[0][3].includes('setwiretype'),name+': export boundary');
      check(TD.qc.fullCode(exported)===exported,name+': export normalization is idempotent');
    }
    const q=TD.qc.layout({type:'qc',x:0,y:0,src:'\\\\lstick{0} & \\\\meter{} \\\\setwiretype{c} & \\\\meter{} & \\\\cw',size:'normalsize'});
    check(q.ops.filter(o=>o.k==='wire')[1].t==='c','consecutive measurements retain prior classical output');
    return true;
  `);
  assert.equal(quantum,true);assert.deepEqual(browser.logs,[]);
  console.log('[PASSED] Scroll round trips, diagram chevrons/boundaries, five measurement styles, quantum export parity');
} finally {browser?.close();server.close();}
