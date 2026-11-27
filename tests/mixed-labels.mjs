// Exact user regressions: compare vector baselines/advances to an independently
// compiled LaTeX reference, then measure actual image ink at high camera zoom.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
import { mixedLabels } from './mixed-labels-fixture.mjs';
const reference = JSON.parse(fs.readFileSync(new URL('./rendering-references/mixed-labels.json', import.meta.url)));
assert.equal(crypto.createHash('sha256').update(JSON.stringify(mixedLabels)).digest('hex'), reference.sourceHash, 'Regenerate the LaTeX reference after changing its source');
await prepare();
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-mixed-labels-'));
const server = await serve(APP_DIR), results = [];
function inkWidth(bytes) {
  const png = PNG.sync.read(bytes); let left = png.width, right = -1, top = png.height, bottom = -1;
  for (let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
    const i=(y*png.width+x)*4;
    if(Math.max(...png.data.subarray(i,i+3))>=140)continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  assert(right>left && bottom>top,'The measured word must actually paint');
  return { width:right-left+1,height:bottom-top+1 };
}
try {
  for(const browser of testBrowsers()) for(const dpr of [1,2]) {
    const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`,{deviceScaleFactor:dpr});
    try {
      await b.page.setViewportSize({width:3200,height:2200});
      for(const engine of ['katex','temml']) {
        const geometry=await b.page.evaluate(async({engine,fixtures})=>{
          document.querySelector('#mixed-label-check')?.remove();TD.math.set(engine);
          const shapes=fixtures.map((f,i)=>({...TD.TYPES.text.create({x:115.5,y:50+i*110},{}),id:'mixed-'+i,text:f.text,size:'normalsize',tw:231,align:'left'}));
          TD.app.newDoc('Mixed-label reference',null,null,null,null,'page',{pages:1,shapes});await TD.math.whenReady();
          window.__mixedSources=[];const metrics=[];
          for(let i=0;i<fixtures.length;i++) {
            const image=document.querySelector(`#content [data-id="mixed-${i}"] image.svg-label`);
            if(!image)throw new Error('The real app label is missing');
            const source=await(await fetch(image.getAttribute('href'))).text();window.__mixedSources.push({source,width:+image.getAttribute('width'),height:+image.getAttribute('height')});
            const doc=new DOMParser().parseFromString(source,'image/svg+xml');
            if(doc.querySelector('foreignObject,text'))throw new Error('These bundled-font fixtures must use explicit outlines, not HTML/native text');
            const word=doc.querySelector(`[data-label-text="${i?'permutes':'unitary'}"]`);
            if(!word)throw new Error('The expected prose word is missing');
            const baseline=word.transform.baseVal.consolidate().matrix.f;
            const previous=engine==='katex'?[...doc.querySelectorAll('[data-label-text="A"]')].at(-1):[...doc.querySelectorAll('[data-label-math-baseline]')].at(-1);
            const mathBox=engine==='temml'&&previous?previous.getAttribute('viewBox').split(/\s+/).map(Number):null;
            const mathBaseline=i?null:previous?(engine==='katex'?previous.transform.baseVal.consolidate().matrix.f:+previous.getAttribute('y')-mathBox[1]*(+previous.getAttribute('height'))/mathBox[3]):null;
            metrics.push({name:fixtures[i].name,word:word.dataset.labelText,advanceEm:+word.dataset.advance/1024,baselineDifferenceEm:mathBaseline==null?null:(baseline-mathBaseline)/1024,path:word.getAttribute('d')});
          }
          return metrics;
        },{engine,fixtures:mixedLabels});
        assert.equal(geometry[1].path,geometry[2].path,'Identical prose has identical glyph geometry after different equations');
        assert.equal(geometry[1].advanceEm,geometry[2].advanceEm,'Identical prose has exactly equal advances');
        assert(Math.abs(geometry[0].baselineDifferenceEm-reference.unitaryBaselineDifferenceEm)<.00002,`${browser}/${engine}: prose and the preceding A share the LaTeX baseline`);
        for(const m of geometry) assert(Math.abs(m.advanceEm-reference.measurements['word-'+m.word])<.002,`${browser}/${engine}/${m.name}: font advances resemble independently compiled Computer Modern within .002em`);
        if(dpr===1) {
          const proof=await b.page.evaluate(({reference})=>{
            const em=80, [w,h]=reference.pageSizeEm.map(x=>x*em);
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/>`+window.__mixedSources.map(({source,width,height},i)=>{
              const xml=new DOMParser().parseFromString(source,'image/svg+xml'),root=xml.documentElement;
              const vb=root.getAttribute('viewBox').split(/\s+/).map(Number),base=+root.querySelector(`[data-label-text="${i?'permutes':'unitary'}"]`).dataset.baseline;
              const href='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(source)));
              return `<image x="${reference.originXEm*em}" y="${reference.baselinesEm[i]*em-(base-vb[1])/1024*em}" width="${width/14.06*em}" height="${height/14.06*em}" href="${href}"/>`;
            }).join('')+'</svg>';
          },{reference});
          fs.writeFileSync(path.join(artifacts,`${browser}-${engine}.svg`),proof);
        }
        for(const zoom of [1,4,12]) for(const phase of [0,.375]) {
          const clips=await b.page.evaluate(async({zoom,phase})=>{
            document.querySelector('#mixed-label-check')?.remove();
            const host=document.createElement('div');host.id='mixed-label-check';host.style.cssText='position:fixed;inset:0;z-index:2147483647;background:white';
            host.innerHTML='<svg width="3200" height="2200"></svg>';document.body.append(host);const svg=host.firstChild;const clips=[];
            for(let i=0;i<window.__mixedSources.length;i++){
              const {source,width,height}=window.__mixedSources[i],group=document.createElementNS('http://www.w3.org/2000/svg','g');
              group.setAttribute('transform',`translate(${30+phase} ${[30,550,1250][i]+phase}) scale(${zoom})`);
              const href='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(source)));
              group.innerHTML=`<image x="0" y="0" width="${width}" height="${height}" href="${href}"/>`;svg.append(group);
              const load=new Image();load.src=href;await load.decode();
              const measuring=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
              measuring.setAttribute('visibility','hidden');group.append(document.importNode(measuring,true));
              const path=group.querySelector(`[data-label-text="${i?'permutes':'unitary'}"]`),rect=path.getBoundingClientRect();
              clips.push({x:Math.floor(rect.left)-2,y:Math.floor(rect.top)-2,width:Math.ceil(rect.right)-Math.floor(rect.left)+4,height:Math.ceil(rect.bottom)-Math.floor(rect.top)+4});
              group.lastChild.remove();
            }
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return clips;
          },{zoom,phase});
          const ink=[];
          for(let i=0;i<clips.length;i++){
            const bytes=await b.page.screenshot({clip:clips[i]});ink.push(inkWidth(bytes));
            fs.writeFileSync(path.join(artifacts,`${browser}-${dpr}-${engine}-${zoom}-${phase}-${mixedLabels[i].name}.png`),bytes);
          }
          assert(Math.abs(ink[1].width-ink[2].width)<=2,`${browser}/${dpr}/${engine}/${zoom}/${phase}: repeated words differ only at antialiasing edges: ${JSON.stringify(ink)}`);
          results.push({browser,dpr,engine,zoom,phase,geometry:geometry.map(({path,...m})=>m),ink});
        }
        console.log(`[PASSED] ${browser} DPR${dpr} ${engine}: exact mixed-label baselines and repeated outlines; LaTeX advances; 100–1200% painted widths`);
      }
      assert.deepEqual(b.logs,[]);
    }finally{await b.close();}
  }
  fs.copyFileSync(new URL('./rendering-references/mixed-labels.png',import.meta.url),path.join(artifacts,'latex-reference.png'));
  const escape=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  fs.writeFileSync(path.join(artifacts,'comparison.html'),`<!doctype html><meta charset="utf-8"><title>Mixed labels: LaTeX and browser vectors</title><style>body{font:16px system-ui;margin:24px;color:#222}figure{margin:0}img{width:100%;border:1px solid #ddd}section{display:grid;grid-template-columns:repeat(${testBrowsers().length + 1},minmax(0,1fr));gap:16px;margin:24px 0}pre{white-space:pre-wrap}h2{grid-column:1/-1}</style><h1>Mixed-label baseline and width regression</h1><p>Every panel uses the same nominal font size and the baseline positions measured from the compiled PDF. The engines retain their own mathematical fonts and spacing; no output is stretched to match LaTeX. Identical prose advances/outlines and the A–unitary baseline are checked independently.</p>${['katex','temml'].map(engine=>`<section><h2>${engine}</h2><figure><figcaption>pdfLaTeX / Computer Modern</figcaption><img src="latex-reference.png"></figure>${testBrowsers().map(browser=>`<figure><figcaption>${browser}</figcaption><img src="${browser}-${engine}.svg"></figure>`).join('')}</section>`).join('')}<p>Both engines in every selected browser, DPR 1/2, 100–1200% zoom and fractional camera positions passed. Prose advances are within .002em of compiled Computer Modern; repeated words use exactly the same paths and advances. Raster tolerance is limited to two physical pixels at antialiasing edges.</p>${mixedLabels.map(f=>`<pre>${escape(f.text)}</pre>`).join('')}`);
  fs.writeFileSync(path.join(artifacts,'measurements.json'),JSON.stringify({reference,results},null,2));
  console.log('Mixed-label screenshots and LaTeX comparisons: '+artifacts);
}finally{server.close();}
