// Compare painted identical words inside labels of different natural widths.
// This catches SVG-image scaling drift which DOM geometry alone cannot detect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { prepare, APP_DIR, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR), artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-repeated-text-'));
const results = [], failures = [];
function firstWord(png, zoom, reference) {
  const dark = (x,y) => { const i=(y*png.width+x)*4; return png.data[i+3]>128 && Math.max(...png.data.subarray(i,i+3))<140; };
  let top=-1, bottom=-1, blank=0;
  for(let y=0;y<png.height;y++) {
    let ink=false;for(let x=0;x<png.width;x++) if(dark(x,y)){ink=true;break;}
    if(ink){if(top<0)top=y;bottom=y;blank=0;}else if(top>=0 && ++blank>=Math.max(2,Math.ceil(zoom*2)))break;
  }
  assert(top>=0,'Text must paint');
  const cols=Array.from({length:png.width},(_,x)=>{for(let y=top;y<=bottom;y++)if(dark(x,y))return true;return false;});
  const left=cols.indexOf(true);let right=cols.lastIndexOf(true);
  if(reference) {
    // Pick the word space, not a small inter-letter gap (e.g. before the
    // final s at low zoom). Inter-word spaces are the widest nearby gaps.
    const gaps=[];let start=-1;
    for(let x=left+Math.floor(reference*.8);x<Math.min(png.width,left+reference*1.35);x++) {
      if(!cols[x]) {if(start<0)start=x;}
      else if(start>=0) {
        if(start<=left+reference*1.2)gaps.push({start,length:x-start});start=-1;
      }
    }
    gaps.sort((a,b)=>b.length-a.length || Math.abs(a.start-left-reference)-Math.abs(b.start-left-reference));
    assert(gaps.length,'Find the space after the repeated word');
    right=gaps[0].start-1;
  }
  return {width:right-left+1,height:bottom-top+1,left,top};
}
try {
  for(const dpr of [1,2]) for(const browser of testBrowsers()) {
    const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`,{deviceScaleFactor:dpr});
    try {
      await b.page.setViewportSize({width:2400,height:2400});
      await b.page.addStyleTag({content:'#stage{position:fixed!important;inset:0!important;width:2400px!important;height:2400px!important;margin:0!important}#files,#tools,#rightCol,#topbar{display:none!important}#grid{display:none!important}'});
      for(const engine of ['katex','temml']) for(const zoom of [.75,1.75,4]) for(const kind of ['prose','math']) {
        const text = word => kind==='math' ? `$\\textbf{${word}}$` : word;
        const cases=[text('permutes'),text('permutes row'),text('permutes col.'),text('permutes row')+'\n'+String.raw`$\begin{pmatrix}a&b&c&d\\e&f&g&h\end{pmatrix}$`];
        await b.page.evaluate(async({engine,cases,kind})=>{
          TD.math.set(engine);
          const shapes=cases.map((text,index)=>({...TD.TYPES.text.create({x:0,y:0},{}),id:'repeated-word-'+index,text,size:20,bold:kind==='prose',align:'left',valign:'middle'}));
          TD.app.newDoc('Repeated text on one board',shapes,null,null,null,'board');
          await TD.math.whenReady();await document.fonts.ready;
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          TD.state.doc.shapes.forEach((shape,index)=>{
            const box=TD.textBox(shape.text,shape);
            shape.x=box.w/2+40+index*.125;shape.y=box.h/2+80+index*110;
          });
        },{engine,cases,kind});
        const widths=[];
        for(const phase of [0,.375]) {
          await b.page.evaluate(async({zoom,phase})=>{
            TD.state.view={x:phase,y:phase,zoom};TD.app.render();await TD.math.whenReady();
            await Promise.all([...document.querySelectorAll('#content image.svg-label')].map(e=>{const img=new Image();img.src=e.getAttribute('href');return img.decode();}));
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            if(Math.abs(TD.state.view.zoom-zoom)>1e-9)throw new Error('Camera zoom changed during capture');
          },{zoom,phase});
          let reference;
          for(let index=0;index<cases.length;index++) {
            const shot=await b.page.locator(`#content > [data-id="repeated-word-${index}"]`).screenshot();
            fs.writeFileSync(path.join(artifacts,`${browser}-${dpr}-${engine}-${zoom}-${kind}-${phase}-${index}.png`),shot);
            const png=PNG.sync.read(shot),word=firstWord(png,zoom*dpr,index?reference:undefined);
            if(!index)reference=word.width;
            widths.push(word.width);
            results.push({browser,dpr,engine,zoom,kind,phase,index,...word});
          }
        }
        const spread=Math.max(...widths)-Math.min(...widths);
        if(spread>2*dpr)failures.push({browser,dpr,engine,zoom,kind,widths,spread});
        console.log(`${browser} DPR${dpr} ${engine} ${kind} ${zoom*100}%: repeated word widths ${widths.join(', ')} px; spread ${spread}px`);
      }
      assert.deepEqual(b.logs,[]);
    }finally{await b.close();}
  }
  fs.writeFileSync(path.join(artifacts,'measurements.json'),JSON.stringify({results,failures},null,2));
  assert.deepEqual(failures,[],'Repeated-word width drift; '+artifacts);
  console.log(`${results.length} painted labels checked; ${artifacts}`);
}finally{server.close();}
