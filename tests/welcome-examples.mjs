// Verify every welcome gallery figure through the real renderer and project codec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_DIR, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';
await prepare();
const server = await serve(APP_DIR);
let browser;
try {
  browser = await launch(`http://127.0.0.1:${server.port}/`);
  const report = await browser.ev(`
    const check=(v,m)=>{if(!v)throw Error(m)};
    const blocks=TD.state.doc.blocks;
    const start=blocks.findIndex(b=>b.type==='text' && b.text.startsWith('# Example Diagrams'));
    check(start===4,'gallery must follow existing welcome content; start='+start);
    const captions=blocks.slice(start).filter(b=>b.type==='text' && /^## [0-9]+[.]/.test(b.text));
    check(captions.length===40 && captions.every(b=>b.text.includes('Reference:') && b.text.includes('https://')), 'all examples need research links');
    const figures=blocks.slice(start).filter(b=>b.type==='diagram');
    check(figures.length===40,'expected 40 figures, got '+figures.length);
    const phasors=figures[7].shapes.filter(s=>s.type==='line' && s.x1===240 && s.y1===300 && s.width===3);
    check(phasors.length===4,'four phasors share the origin');
    const vector=color=>{const s=phasors.find(s=>s.stroke===color);check(s,'phasor '+color);return[s.x2-s.x1,s.y2-s.y1];};
    const vr=vector('#008000'),vl=vector('#921b95'),vc=vector('#e87800'),emf=vector('#080884');
    check(Math.abs(vr[0]*vl[0]+vr[1]*vl[1])<1e-8 && Math.abs(vr[0]*vc[0]+vr[1]*vc[1])<1e-8,'reactive voltages are perpendicular to resistor voltage');
    check(vl[0]*vc[0]+vl[1]*vc[1]<0,'inductor and capacitor oppose');
    check(emf.every((x,i)=>Math.abs(x-vr[i]-vl[i]-vc[i])<1e-8),'supply equals vector sum');

    const ids=figures.flatMap(b=>b.shapes.map(s=>s.id));check(new Set(ids).size===ids.length,'unique IDs');
    const rendered=[], warnings=[];
    for(let i=0;i<figures.length;i++) {
      const b=figures[i];check(b.shapes.length>0,'empty figure '+(i+1));
      check(b.shapes.every(s=>s.type!=='image' && s.type!=='tikz'),'figures must use native tools');
      for(const s of b.shapes) {
        check(TD.TYPES[s.type],'unknown shape '+s.type);
        if(s.type==='sym')check(TD.SYMS[s.kind],'unknown symbol '+s.kind);
        const layout = TD.blocks.get(s.type)?.editor?.layout;
        const L = layout ? layout(s) : s.type==='bloch' ? TD.bloch.layout(s) : null;
        if(L?.warnings?.length) warnings.push({figure:i+1,type:s.type,warnings:L.warnings});
        const box=TD.bbox(s);check(['x','y','w','h'].every(k=>Number.isFinite(box[k])),'invalid bounds '+(i+1)+' '+s.type);
      }
      const svg=TD.app.svgOf(b.shapes);
      const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
      check(!parsed.querySelector('parsererror'),'invalid SVG '+(i+1));
      const geometryAttrs=[...parsed.querySelectorAll('*')].flatMap(el=>[...el.attributes]).filter(a=>['d','transform','x','y','x1','y1','x2','y2','width','height','cx','cy','r','rx','ry','viewBox','stroke-width','points'].includes(a.name));
      check(geometryAttrs.every(a=>!/NaN|Infinity|undefined/.test(a.value)),'invalid SVG geometry '+(i+1));
      const view=parsed.documentElement.getAttribute('viewBox').split(' ').map(Number);
      check(view[2]>0 && view[3]>0 && view[2]<1600 && view[3]<1200,'unexpected size '+(i+1)+' '+view);
      const X=TD.makeTikzContext();
      for(const s of b.shapes) {
        const tex=TD.TYPES[s.type].tikz(s,X);
        check(typeof tex==='string' && !/NaN|undefined/.test(tex),'invalid TikZ '+(i+1)+' '+s.type);
      }
      const index=blocks.indexOf(b),title=blocks[index-1].text.split('\\n')[0].replace(/^## /,'');
      rendered.push({title,svg,tex:TD.toTikz(b.shapes,{standalone:true}),types:[...new Set(b.shapes.map(s=>s.type))]});
    }
    check([...TD.blocks.entries()].filter(([,b])=>b.editor).every(([type])=>figures.some(f=>f.shapes.some(s=>s.type===type))), 'gallery must cover every block editor');
    TD.app.cmd.setMode('document');TD.docview.render();
    check(document.querySelectorAll('#docview .blk-diag').length===42,'all diagrams appear in document');
    const round=TD.app.parseProject(TD.app.projectJson(TD.state.doc));
    check(round.blocks.length===blocks.length,'project round trip');
    const original=figures[0].shapes[0];original.stroke='#ff0000';TD.app.newSample();
    const fresh=TD.state.doc.blocks.slice(start).find(b=>b.type==='diagram');check(fresh.shapes[0].stroke!=='#ff0000','examples share mutable data');
    await document.fonts.ready;
    return {blocks:blocks.length,rendered,warnings};
  `, 120000);
  assert.equal(report.rendered.length,40);
  assert.deepEqual(report.warnings, [], 'native editor layouts must have no unsupported features');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-welcome-'));
  // Preserve a reviewable native project and an overview built from the actual SVG exports.
  fs.writeFileSync(path.join(dir,'welcome.diagramtex'), await browser.ev('return TD.app.projectJson(TD.state.doc);'));
  for(let i=0;i<report.rendered.length;i++) {fs.writeFileSync(path.join(dir,`${i+1}.svg`),report.rendered[i].svg);fs.writeFileSync(path.join(dir,`${i+1}.tex`),report.rendered[i].tex);}
  await browser.ev(`
    document.body.insertAdjacentHTML('beforeend','<main id="review"></main>');
    document.head.insertAdjacentHTML('beforeend','<style>body{margin:0;background:#f4f1ea;color:#222;font:14px system-ui}#review{position:absolute;inset:0;z-index:9999;min-height:100vh;background:#f4f1ea;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px}article{height:240px;background:white;padding:12px;border-radius:8px;overflow:hidden}article h3{font-size:13px;margin:0 0 8px}article svg{width:100%;height:200px}</style>');
    document.querySelector('#review').innerHTML=${JSON.stringify(report.rendered.map(f=>`<article><h3>${f.title}</h3>${f.svg}</article>`).join(''))};
    await document.fonts.ready;return true;
  `,30000);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1600,height:2820,deviceScaleFactor:1,mobile:false});
  const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(dir,'gallery.png'),Buffer.from(shot.result.data,'base64'));
  // Larger sheets make dense block labels inspectable without enlarging the whole 40-item overview.
  for (let start=0;start<40;start+=10) {
    const html=report.rendered.slice(start,start+10).map(f=>`<article><h3>${f.title}</h3>${f.svg}</article>`).join('');
    await browser.ev(`document.querySelector('#review').innerHTML=${JSON.stringify(html)};
      document.head.insertAdjacentHTML('beforeend','<style>#review{grid-template-columns:repeat(2,1fr)}article{height:420px}article svg{height:370px}</style>');return true;`);
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1600,height:2360,deviceScaleFactor:1,mobile:false});
    const detail=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(dir,`gallery-${start/10+1}.png`),Buffer.from(detail.result.data,'base64'));
  }
  assert.deepEqual(browser.logs,[]);
  console.log(`✓ 40 figures: SVG, TikZ, bounds, symbols, IDs, persistence and fresh copies (${report.blocks} document blocks)`);
  console.log('Review artifacts: '+dir);
  if (process.argv.includes('--tex')) {
    const run=promisify(execFile), results=[];
    let next=1;
    await Promise.all(Array.from({length:4},async()=>{
      while(next<=40) {
        const n=next++, output=path.join(dir,'tex-'+n);fs.mkdirSync(output);
        try { await run('pdflatex',['-interaction=nonstopmode','-halt-on-error','-output-directory='+output,path.join(dir,n+'.tex')],{cwd:dir,timeout:90000,maxBuffer:4*1024*1024});results.push({figure:n,passed:true}); }
        catch(error) {results.push({figure:n,passed:false,error:error.stdout?.slice(-3000)||error.message});}
      }
    }));
    fs.writeFileSync(path.join(dir,'tex-results.json'),JSON.stringify(results,null,2));
    assert.deepEqual(results.filter(r=>!r.passed),[],'standalone TeX exports compile');
    console.log('✓ All 40 standalone exports compiled with pdfLaTeX');
  }

} catch (error) { console.error(browser?.logs); throw error; } finally {browser?.close();server.close();}
