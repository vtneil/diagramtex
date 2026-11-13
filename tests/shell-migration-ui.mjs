// Compare shared application properties and document/page settings to the saved checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_DIR, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';
if (!process.env.DIAGRAMTEX_BASELINE) throw Error('Set DIAGRAMTEX_BASELINE');
await prepare();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dtx-shell-ui-'));
const servers = [], browsers = [];
try {
  for (const directory of [path.join(process.env.DIAGRAMTEX_BASELINE, 'public'), APP_DIR]) {
    const server = await serve(directory); servers.push(server); browsers.push(await launch(`http://127.0.0.1:${server.port}/`));
  }
  let count = 0;
  for (const width of [1600, 820]) for (const theme of ['light', 'dark']) for (const scenario of (process.env.MIGRATION_SCENARIOS?.split(',') || ['defaults', 'variables', 'page', 'document', 'custom-document', 'component', 'multiple', 'polyline'])) {
    const snapshots = [], pictures = [];
    for (const [i, browser] of browsers.entries()) {
      await browser.send('Emulation.setDeviceMetricsOverride', {width, height:1000, deviceScaleFactor:1, mobile:false});
      const snapshot = await browser.ev(`
        document.head.appendChild(Object.assign(document.createElement('style'), {textContent:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'}));
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const scenario = ${JSON.stringify(scenario)}, kind = scenario.includes('document') ? 'classic' : scenario === 'page' ? 'page' : 'board';
        TD.app.newDoc('Shell comparison', null, null, null, null, kind);
        if (scenario === 'variables') TD.state.doc.blocks[TD.state.doc.active].vars = {gap:'2',width:'gap * 3',bad:'missing + 1'};
        if (scenario === 'page') { TD.state.doc.sheet.pages = 3; TD.state.doc.page = {...TD.state.doc.page,paper:'custom',w:18,h:24,orient:'landscape'}; }
        if (scenario.includes('document')) { if (scenario === 'custom-document') TD.state.doc.page = {...TD.state.doc.page,paper:'custom',w:18,h:24,orient:'landscape',font:12,spread:1.3,title:true,numbered:true}; TD.app.setMode('document'); }
        if (['component','multiple','polyline'].includes(scenario)) {
          const shape = TD.TYPES[scenario === 'component' ? 'comp' : scenario === 'polyline' ? 'poly' : 'rect'].create({x:0,y:0}, TD.state.defaults);
          shape.id='test-shape'; if(scenario === 'component') {shape.ref='test-part';shape.cname='Widget';shape.def=[{...TD.TYPES.rect.create({x:0,y:0},TD.state.defaults),id:'part-rect'}];}
          if(scenario === 'polyline') shape.pts=[[0,0],[40,0],[40,40]];
          TD.state.doc.shapes.push(shape); TD.state.sel = new Set([shape.id]);
          if(scenario === 'multiple') {const second=TD.TYPES.ellipse.create({x:80,y:0},TD.state.defaults);second.id='second-shape';TD.state.doc.shapes.push(second);TD.state.sel.add(second.id);}
        }
        TD.app.render(); TD.app.renderProps();
        await document.fonts.ready; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const pane=document.querySelector('#propsWin'), origin=pane.getBoundingClientRect(), round=n=>Math.round(n*100)/100;
        return {clip:{x:origin.x,y:origin.y,width:origin.width,height:origin.height},elements:[...pane.querySelectorAll('*')].filter(el=>!el.closest('.seg-thumb')).map(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName,class:el.className?.baseVal??el.className,text:el.children.length||el.tagName==='TEXTAREA'?null:el.textContent.trim(),value:'value'in el?el.value:null,checked:'checked'in el?el.checked:null,data:Object.fromEntries(Object.entries(el.dataset).filter(([k])=>k!=='tip')),box:[b.x-origin.x,b.y-origin.y,b.width,b.height].map(round),style:[s.fontFamily,s.fontSize,s.fontWeight,s.color,s.backgroundColor,s.borderRadius]}}),source:TD.projectFiles.stringify(TD.state.doc)};
      `);
      snapshots.push(snapshot);
      const png=await browser.send('Page.captureScreenshot',{format:'png',clip:{...snapshot.clip,scale:1}});
      const picture=Buffer.from(png.result.data,'base64');pictures.push(picture);fs.writeFileSync(path.join(output,`${width}-${theme}-${scenario}-${i}.png`),picture);
    }
    try {assert.deepEqual(snapshots[1],snapshots[0]);assert.ok(pictures[0].equals(pictures[1]),'pixels differ');}
    catch(error){fs.writeFileSync(path.join(output,'baseline.json'),JSON.stringify(snapshots[0],null,2));fs.writeFileSync(path.join(output,'migrated.json'),JSON.stringify(snapshots[1],null,2));throw Error(`${width} ${theme} ${scenario}: ${error.message.slice(0,1800)}; ${output}`);}
    console.log(`✓ ${width} ${theme} ${scenario}: matching controls, layout, pixels and file bytes`);count++;
  }
  for(const browser of browsers)assert.deepEqual(browser.logs,[]);
  console.log(`${count} shared UI comparisons passed; ${output}`);
} finally {browsers.forEach(b=>b.close());servers.forEach(s=>s.close());}
