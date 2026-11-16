// Evaluate sampled external TikZ as data through our importer; never execute/compile its TeX.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser } from './browser.mjs';
const { values } = parseArgs({ options: {
  corpus: { type:'string', default:'artifacts/datikz' }, browser: { type:'string', default:'chromium' },
  'timeout-ms': { type:'string', default:'30000' }, 'require-native': { type:'boolean', default:false }
} });
const root=path.resolve(values.corpus), manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const timeout=Number(values['timeout-ms']);
if (!Number.isFinite(timeout)||timeout<100) throw new Error('timeout-ms must be at least 100');
const withinRoot = file => { const full=path.resolve(root,file); if(!full.startsWith(root+path.sep)) throw new Error('Corpus path escapes its directory'); return full; };
const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await prepare();
const server=await serve(APP_DIR), results=[];
let browser;
const open=async()=>{
  const b=await launchBrowser(values.browser,`http://127.0.0.1:${server.port}/`);
  // External assets in imported documents must not produce arbitrary network requests.
  await b.context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin===`http://127.0.0.1:${server.port}` || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await b.page.evaluate(fs.readFileSync(path.join(import.meta.dirname,'ink-match.js'),'utf8'));
  return b;
};
try {
  browser=await open();
  for(const entry of manifest.cases){
    const code=fs.readFileSync(withinRoot(entry.code_path),'utf8');
    if(crypto.createHash('sha256').update(code).digest('hex')!==entry.sha256) throw new Error('Source hash mismatch: '+entry.id);
    let timer;
    let result;
    const reference=entry.image_path&&fs.existsSync(withinRoot(entry.image_path))?`data:image/${entry.image_path.endsWith('.png')?'png':'jpeg'};base64,`+fs.readFileSync(withinRoot(entry.image_path)).toString('base64'):null;
    const start=Date.now();
    try {
      result=await Promise.race([
        browser.page.evaluate(async ({source,reference})=>{
          try {
            const r=TD.importLatex(source), diagrams=r.blocks.filter(b=>b.type==='diagram');
            const shapes=diagrams.flatMap(b=>b.shapes||[]), drawable=shapes.filter(s=>!(s.type==='tikz'&&s.kind==='defs'));
            const native=drawable.filter(s=>s.type!=='tikz'), opaque=drawable.filter(s=>s.type==='tikz');
            const warnings=[...new Set(r.warnings||[])];
            const invalid=native.filter(s=>{try {const b=TD.bbox(s);return ![b.x,b.y,b.w,b.h].every(Number.isFinite);}catch{return true;}}).length;
            const status=invalid?'invalid-geometry':!drawable.length?'empty':!native.length?'opaque':opaque.length||warnings.length?'partial':'native';
            const svg=diagrams.map(b=>TD.app.shapesSvg(b.shapes.filter(s=>s.type!=='tikz'),8,true)).filter(Boolean);
            const exported=diagrams.map(b=>TD.toTikz(b.shapes,{standalone:true}));
            // the canvas view (native objects and the previews of code kept as written) and native objects alone,
            // at 100 px/cm, each scored against the dataset image
            const png=async list=>{
              list=list.filter(s=>{try {const b=TD.bbox(s);return [b.x,b.y,b.w,b.h].every(Number.isFinite);}catch{return false;}});
              if(!list.length) return null;
              for(let n=0;;n++){
                try { TD.app.shapesSvg(list,4,false); await TD.math.whenReady(); return await TD.app.pngOf(list,254,false); }
                catch(error){ if(n>40||!/render/i.test(String(error.message))) throw error; await new Promise(q=>setTimeout(q,100)); }
              }
            };
            const url=blob=>new Promise(q=>{const f=new FileReader();f.onload=()=>q(f.result);f.readAsDataURL(blob);});
            const visual={};
            for(const [kind,list] of [['display',drawable],['native',native]]){
              const blob=await png(list);
              if(!blob) continue;
              visual[kind]={png:await url(blob),...(reference?await inkMatch(reference,blob):{})};
            }
            return {status,native:native.length,opaque:opaque.length,invalid,diagrams:diagrams.length,textBlocks:r.blocks.filter(b=>b.type==='text').length,
              statements:{native:native.filter(s=>!s.tex||s.tex.i===0).length,code:opaque.length},
              types:native.reduce((out,s)=>(out[s.type]=(out[s.type]||0)+1,out),{}),warnings,
              issues:[...new Set(opaque.flatMap(s=>s.issues||[]))],svg,exported,visual};
          } catch(error){return {status:'error',error:String(error.stack||error)};}
        },{source:code,reference}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('case timeout')),timeout);})
      ]);
    } catch(error){
      result={status:error.message==='case timeout'?'timeout':'error',error:String(error)};
      await browser.close();
      browser=await open();
    } finally {clearTimeout(timer);}
    result={...entry,...result,elapsed_ms:Date.now()-start};
    fs.mkdirSync(path.join(root,'rendered'),{recursive:true});
    for(const [i,svg] of (result.svg||[]).entries()) fs.writeFileSync(path.join(root,'rendered',`${entry.id}-${i}.svg`),svg);
    for(const [i,tex] of (result.exported||[]).entries()) fs.writeFileSync(path.join(root,'rendered',`${entry.id}-${i}.tex`),tex);
    for(const [kind,v] of Object.entries(result.visual||{})) if(v.png){fs.writeFileSync(path.join(root,'rendered',`${entry.id}-${kind}.png`),Buffer.from(v.png.split(',')[1],'base64'));delete v.png;}
    result.source=code;
    results.push(result);
    const vs=k=>result.visual?.[k]?.match!=null?(100*result.visual[k].match).toFixed(1)+'%':'-';
    console.log(`${entry.id}: ${result.status} · ${result.native||0} native, ${result.opaque||0} opaque · display ${vs('display')}, native ${vs('native')} · ${result.elapsed_ms} ms`);
  }
} finally {if(browser) await browser.close(); server.close();}
const counts=results.reduce((out,r)=>(out[r.status]=(out[r.status]||0)+1,out),{});
const featureResults={};
for(const r of results) for(const tag of r.tags){featureResults[tag]??={cases:0,native:0};featureResults[tag].cases++;if(r.status==='native') featureResults[tag].native++;}
// visual match against the dataset images: mean and median over the cases that have one
const stat=kind=>{const v=results.map(r=>r.visual?.[kind]?.match).filter(Number.isFinite).sort((a,b)=>a-b);
  return v.length?{cases:v.length,mean:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(4),median:v[Math.floor(v.length/2)],at_least_80:v.filter(x=>x>=.8).length}:null;};
const visual={display:stat('display'),native:stat('native')};
const statements=results.reduce((out,r)=>({native:out.native+(r.statements?.native||0),code:out.code+(r.statements?.code||0)}),{native:0,code:0});
const report={dataset:manifest.dataset,visual,statements,revision:manifest.revision,split:manifest.split,seed:manifest.seed,scanned_rows:manifest.scanned_rows,
  sampled_rows:results.length,browser:values.browser,counts,feature_results:featureResults,
  note:'Native is a structural conversion result; visual is a scale-free ink match (1% tolerance) against the dataset image, a guide rather than a verdict. This mixed random/coverage sample is not an estimate of whole-dataset support.',
  cases:results.map(({svg,exported,source,...r})=>r)};
fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(report,null,2)+'\n');
const image=(mime,data)=>`data:${mime};base64,${Buffer.from(data).toString('base64')}`;
const cards=results.map(r=>{
  const ref=r.image_path?`<img alt="Dataset reference" src="${image(r.image_path.endsWith('.png')?'image/png':'image/jpeg',fs.readFileSync(withinRoot(r.image_path)))}">`:'<p>No local reference image</p>';
  const shot=kind=>{const f=path.join(root,'rendered',`${r.id}-${kind}.png`);return fs.existsSync(f)?`<img alt="DiagramTeX ${kind}" src="${image('image/png',fs.readFileSync(f))}">`:'<p>Nothing drawn</p>';};
  const pct=kind=>r.visual?.[kind]?.match!=null?` · match ${(100*r.visual[kind].match).toFixed(1)} %`:'';
  return `<article id="${escape(r.id)}"><h2>${escape(r.id)} <span>${escape(r.status)}</span></h2><p>${escape(r.origin)} · ${r.native||0} native · ${r.opaque||0} opaque · ${r.elapsed_ms} ms</p>
  <p><a href="${escape(/^https?:\/\//.test(r.uri||'')?r.uri:'#')}">Original source</a> · dataset row ${r.row_index} · ${escape(r.tags.join(', '))}</p>
  <div class="pair"><section><h3>Dataset image</h3>${ref}</section><section><h3>Canvas view${pct('display')}</h3>${shot('display')}</section><section><h3>Native objects only${pct('native')}</h3>${shot('native')}</section></div>
  <p class="issues">${escape([...(r.warnings||[]),...(r.issues||[]),r.error||''].filter(Boolean).join('; '))}</p>
  <details><summary>TikZ input</summary><pre>${escape(r.source)}</pre></details></article>`;
}).join('\n');
const featureTable=Object.entries(featureResults).sort((a,b)=>b[1].cases-a[1].cases).map(([name,s])=>`<tr><td>${escape(name)}</td><td>${s.cases}</td><td>${s.native}</td></tr>`).join('');
fs.writeFileSync(path.join(root,'report.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DaTikZ native import coverage</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1180px;margin:36px auto;padding:0 20px;color:#222;background:#f6f5f2}h1{font-size:28px}article{background:white;padding:22px;margin:24px 0;border:1px solid #ddd;border-radius:10px}h2{font-size:18px}h2 span{float:right;font-size:14px}h3{font-size:14px}.pair{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}.pair section{border:1px solid #ddd;padding:12px;min-width:0}.pair img{display:block;max-width:100%;max-height:420px;margin:auto;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:500px;overflow:auto;font-size:12px}.issues{font-size:12px;color:#8a310f}table{border-collapse:collapse}td,th{text-align:left;padding:4px 16px;border-bottom:1px solid #ddd}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>
<h1>DaTikZ → native DiagramTeX coverage</h1><p>${escape(manifest.dataset)} · revision ${escape(manifest.revision)} · ${escape(manifest.split)} · ${results.length} cases selected from ${manifest.scanned_rows} scanned rows</p>
<p><strong>${escape(JSON.stringify(counts))}</strong></p><p>Visual match (canvas view): ${escape(JSON.stringify(visual.display))} · native only: ${escape(JSON.stringify(visual.native))} · statements: ${escape(JSON.stringify(statements))}</p><p>${escape(report.note)}</p><p>Reference images, the canvas view (native objects plus previews of code kept as written) and native objects alone appear side by side for manual review. External source assets are blocked. No dataset TeX was executed.</p>
<details><summary>Feature coverage in this sample</summary><table><tr><th>Feature</th><th>Cases</th><th>Native results</th></tr>${featureTable}</table></details>${cards}</html>`);
console.log(JSON.stringify({report:path.join(root,'report.html'),counts,visual,statements},null,2));
if(values['require-native']&&results.some(r=>r.status!=='native')) process.exitCode=1;
