// Hatch presets, independent borders/widths, and native pattern-filled holes.
// Uses the existing isolated Chrome test profile; never touches an open user document.
import assert from 'node:assert/strict';
import { APP_DIR, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';
await prepare();
const server = await serve(APP_DIR);
let browser;
try {
  browser = await launch(`http://127.0.0.1:${server.port}/`);
  const result = await browser.ev(`
    const check = (v, m) => { if (!v) throw Error(m); };
    const d = {width:2,stroke:'#000000',dash:'solid'};
    const keys=['p-hatch','p-ground','p-ceiling','p-wall','p-mirror','p-screen'];
    const presets=keys.map(k=>TD.TYPES.sym.create({x:0,y:0},d,'sym:'+k));
    check(presets.every(s=>s.kind==='p-hatch'),'presets must create Hatch');
    check(presets[1].hatchTop && presets[2].hatchBottom && presets[3].hatchRight && presets[4].hatchLeft,'preset edges');
    check(['Top','Right','Bottom','Left'].every(k=>presets[5]['hatch'+k]),'screen edges');
    const shape={...presets[0],id:'hatch',w:120,h:35,hatchWidth:0.75,hatchAngle:30};
    for(let mask=0;mask<16;mask++) {
      const s={...shape};['Top','Right','Bottom','Left'].forEach((k,i)=>s['hatch'+k]=!!(mask&(1<<i)));
      const g=TD.symGeom(s);
      check(g.filter(p=>p.hatchWidth==null).length===mask.toString(2).replaceAll('0','').length,'independent edges');
      check(g.filter(p=>p.hatchWidth!=null).every(p=>p.hatchWidth===0.75),'hatch width');
      check(TD.TYPES.sym.svg(s,{export:true}).includes('stroke-width="0.75"'),'SVG hatch width');
      const tex=TD.TYPES.sym.tikz(s,TD.makeTikzContext());check(!/NaN|undefined/.test(tex),'TikZ geometry');
    }
    TD.app.newDoc('Hatch test',[shape],null,null,null,'board');
    TD.state.sel=new Set(['hatch']);TD.app.renderProps();
    const input=document.querySelector('[data-key="hatchWidth"]');check(input,'width input');
    const widths=document.querySelector('select.attached[data-key="hatchWidth"]');check(widths,'width presets');
    input.value='1.25';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    check(TD.state.doc.shapes[0].hatchWidth===1.25 && TD.state.doc.shapes[0].width===2,'width independent of outline');
    check([...widths.options].some(o=>o.value==='0.5'),'shared width menu');widths.value='0.5';widths.dispatchEvent(new Event('change',{bubbles:true}));
    check(TD.state.doc.shapes[0].hatchWidth===0.5 && TD.state.doc.shapes[0].width===2,'width menu updates hatch only');
    const top=document.querySelector('[data-key="hatchTop"]');top.click();
    const right=document.querySelector('[data-key="hatchRight"]');right.click();
    check(TD.state.doc.shapes[0].hatchTop && TD.state.doc.shapes[0].hatchRight,'edge multiselection');
    const saved=TD.app.parseProject(TD.app.projectJson(TD.state.doc));
    check(saved.blocks[0].shapes[0].hatchWidth===0.5 && saved.blocks[0].shapes[0].hatchRight,'round trip');
    return true;
  `);
  assert.equal(result,true);
  assert.deepEqual(browser.logs,[]);
  console.log('[PASSED] Hatch presets, 16 edge combinations, numeric/preset widths, UI edits, SVG/TikZ, persistence');
} finally { browser?.close(); server.close(); }
