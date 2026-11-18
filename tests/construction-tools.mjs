import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'diagramtex-construction-')), server=await serve(APP_DIR);
try {
 for(const browser of testBrowsers()) {
  const b=await launchBrowser(browser,`http://127.0.0.1:${server.port}/`), p=b.page;
  try {
   const frame=()=>p.evaluate(async()=>{await TD.math.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   await p.evaluate(()=>{
    const rect=(id,x,y,w=80,h=60)=>({...TD.TYPES.rect.create({x,y},{}),id,x,y,w,h,stroke:'#000000',fill:null,width:1});
    const shapes=[rect('left',80,80),rect('middle',240,140),rect('right',460,210),{...TD.TYPES.ellipse.create({x:0,y:0},{}),id:'circle',cx:140,cy:110,rx:24,ry:24,stroke:'#000000',width:1,fill:null}];
    TD.app.newDoc('Construction tools',shapes,null,null,null,'classic');TD.app.setMode('diagram');Object.assign(TD.state.view,{x:0,y:0,zoom:1});TD.app.render();TD.app.clearAllHistory();
   });await frame();
   const at=async(x,y)=>p.evaluate(({x,y})=>{const r=document.querySelector('#canvas').getBoundingClientRect(),v=TD.state.view;return{x:r.left+(x-v.x)*v.zoom,y:r.top+(y-v.y)*v.zoom};},{x,y});
   const click=async(x,y)=>{const q=await at(x,y);await p.mouse.click(q.x,q.y);};
   // Unfilled interiors and overlapping curved boundaries, without raster flood filling.
   await p.locator('[data-tool="bucket"]').click();
   await p.locator('#props [data-color="fill"]').click();
   const hex=p.locator('.cp-inputs [data-f="hex"]');await hex.fill('88ccff');await p.locator('[data-tool="bucket"]').click();await click(140,110);await frame();
   assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='circle').fill),'#88ccff');
   assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='left').fill),null,'topmost closed region wins');
   await p.keyboard.down('Alt');await click(140,110);await p.keyboard.up('Alt');
   assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='circle').fill),null);
   await p.locator('#btnUndo').click();assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='circle').fill),'#88ccff');
   await p.evaluate(()=>{TD.state.doc.shapes.find(s=>s.id==='circle').locked=true;TD.app.render();});await click(140,110);
   assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='left').fill),'#88ccff','locked shapes do not block fillable regions below');
   await p.locator('[data-tool="select"]').click();
   await p.evaluate(()=>{TD.state.defaults.fill='#ffaa00';TD.state.sel=new Set(['left','middle','circle']);TD.app.render();TD.app.renderProps();});
   const bucketUndo=await p.evaluate(()=>TD.state.undo.length);
   await p.locator('[data-tool="bucket"]').click();
   assert(await p.evaluate(()=>['left','middle'].every(id=>TD.state.doc.shapes.find(s=>s.id===id).fill==='#ffaa00')),'activating bucket fills eligible selected shapes immediately');
   assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='circle').fill),'#88ccff','locked selections are excluded');
   assert.equal(await p.evaluate(()=>TD.state.undo.length),bucketUndo+1,'immediate fill is one undo step');
   await p.locator('#btnUndo').click();await p.evaluate(()=>{TD.state.defaults.fill='#88ccff';});
   await p.evaluate(()=>{TD.state.sel=new Set(['left','middle']);TD.app.render();TD.app.renderProps();});
   await p.keyboard.down('Shift');await click(280,160);await p.keyboard.up('Shift');
   assert(await p.evaluate(()=>['left','middle'].every(id=>TD.state.doc.shapes.find(s=>s.id===id).fill==='#88ccff')),'Shift-bucket fills selected closed shapes');
   await p.locator('#props [data-color="fill"]').click();await p.locator('.cp-none').click();
   assert(await p.evaluate(()=>['left','middle'].every(id=>TD.state.doc.shapes.find(s=>s.id===id).fill===null)),'bucket Fill changes immediately update selected shapes');
   await click(280,160);assert.equal(await p.evaluate(()=>TD.state.doc.shapes.find(s=>s.id==='middle').fill),null,'None clears fill without an implicit black fallback');
   await p.evaluate(()=>{TD.state.sel.clear();TD.app.render();});
   const baseline=await p.evaluate(()=>({doc:TD.app.projectJson(TD.state.doc),view:JSON.stringify(TD.state.view),undo:TD.state.undo.length}));
   await p.locator('[data-tool="magnify"]').click();const q=await at(140,110);await p.mouse.move(q.x,q.y);await frame();
   assert(await p.locator('.canvas-magnifier').isVisible(), JSON.stringify(await p.evaluate(()=>({tool:TD.state.tool,lens:TD.app.magnifier.element.outerHTML,errors:window.__errors}))) + JSON.stringify(b.logs));
   assert.equal(await p.locator('.canvas-magnifier use[href="#content"]').count(),1);
   const factor=await p.evaluate(()=>TD.app.magnifier.factor);await p.mouse.wheel(0,-120);await frame();
   assert(await p.evaluate(f=>TD.app.magnifier.factor>f,factor));
   assert.deepEqual(await p.evaluate(()=>({doc:TD.app.projectJson(TD.state.doc),view:JSON.stringify(TD.state.view),undo:TD.state.undo.length})),baseline,'magnifying never changes drawing, camera or history');
   await p.screenshot({path:path.join(artifacts,browser+'-magnifier.png')});
   await p.keyboard.press('Escape');assert(await p.locator('.canvas-magnifier').isHidden());
   // Existing grouping and layout have discoverable controls and emit real scopes.
   await click(280,140);await p.keyboard.down('Shift');await click(500,210);await click(100,80);await p.keyboard.up('Shift');
   assert.equal(await p.evaluate(()=>TD.state.sel.size),3,'Shift-click selects multiple objects');
   await p.locator('#props [data-act="l:top"]').click();
   assert(await p.evaluate(()=>{const a=TD.state.doc.shapes.filter(s=>s.type==='rect');return a.every(s=>s.y===a[0].y);}));
   await p.locator('#props [data-act="d:h"]').click();
   assert(await p.evaluate(()=>{const a=TD.state.doc.shapes.filter(s=>s.type==='rect');return Math.abs(a[1].x-a[0].x-a[0].w-(a[2].x-a[1].x-a[1].w))<1e-6;}));
   await p.locator('#props [data-act="group"]').click();
   assert(await p.evaluate(()=>/\\begin\{scope\}/.test(TD.toTikz(TD.state.doc.shapes))),'groups export as scopes');
   await p.locator('#props [data-act="ungroup"]').click();
   // Guides are created only from rulers; the toolbar cycles visibility/locking.
   assert.equal(await p.locator('#props .construction-guides').count(),0);
   assert.equal(await p.locator('#btnGuides').getAttribute('data-guide-mode'),'show');
   const rulerY=await p.locator('#rulerY').boundingBox(), vertical=await at(200,350);
   await p.mouse.move(rulerY.x+rulerY.width/2,rulerY.y+150);await p.mouse.down();await p.mouse.move(vertical.x,vertical.y);await p.mouse.up();await frame();
   const guideId=await p.evaluate(()=>TD.state.doc.blocks[0].guides[0].id);
   const guidePoint=await at(200,350);await p.mouse.dblclick(guidePoint.x,guidePoint.y);await p.locator('.td-dialog input').fill('5');await p.locator('.td-dialog [data-r="1"]').click();await frame();
   assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides[0].position),200);
   await p.locator('#btnGuides').click();assert.equal(await p.locator('#btnGuides').getAttribute('data-guide-mode'),'locked');
   assert.equal(await p.locator('.guide-hit').count(),0,'locked guides do not intercept objects');
   assert.equal(await p.locator('.construction-guide').count(),1);
   assert(await p.evaluate(()=>['rulerX','rulerY'].every(id=>getComputedStyle(document.getElementById(id)).cursor==='default')),'locked guides use the normal ruler cursor');
   await p.locator('#btnGuides').click();assert.equal(await p.locator('#btnGuides').getAttribute('data-guide-mode'),'off');assert.equal(await p.locator('.construction-guide').count(),0);
   assert(await p.evaluate(()=>['rulerX','rulerY'].every(id=>getComputedStyle(document.getElementById(id)).cursor==='default')),'disabled guides use the normal ruler cursor');
   await p.locator('#btnGuides').click();assert.equal(await p.locator('#btnGuides').getAttribute('data-guide-mode'),'show');
   // Direct editing clamps out-of-range values to the visible canvas.
   await p.mouse.dblclick(guidePoint.x,guidePoint.y);await p.locator('.td-dialog input').fill('-999999');await p.locator('.td-dialog input').press('Enter');await frame();
   assert(await p.evaluate(()=>TD.state.doc.blocks[0].guides[0].position>=TD.state.view.x),'guide coordinates cannot disappear offscreen');
   await p.locator('#btnUndo').click();await frame();
   const ruler=await p.locator('#rulerX').boundingBox(), target=await at(400,260);
   await p.mouse.move(ruler.x+300,ruler.y+ruler.height/2);await p.mouse.down();await p.mouse.move(target.x,target.y);await p.mouse.up();await frame();
   assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),2);
   const saved=await p.evaluate(()=>TD.app.parseProject(TD.app.projectJson(TD.state.doc)));
   assert.equal(saved.blocks[0].guides.length,2);
   assert(!await p.evaluate(()=>TD.app.svgOf(TD.state.doc.shapes).includes('construction-guide')));
   await p.locator('#btnUndo').click();assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),1);
   await p.locator('#btnRedo').click();assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),2);
   const guideState=await p.evaluate(()=>({json:JSON.stringify(TD.state.doc.blocks[0].guides),undo:TD.state.undo.length}));
   await p.mouse.move(ruler.x+350,ruler.y+ruler.height/2);await p.mouse.down();await p.mouse.move(target.x,target.y);await p.keyboard.press('Escape');await p.mouse.up();await frame();
   assert.deepEqual(await p.evaluate(()=>({json:JSON.stringify(TD.state.doc.blocks[0].guides),undo:TD.state.undo.length})),guideState,'Escape cancels guide creation without an undo entry');
   // Right-click edit/delete and keyboard delete act on guides, leaving artwork intact.
   await p.mouse.click(target.x,target.y,{button:'right'});await p.locator('#ctxMenu [data-ctx="guide:edit"]').click();await p.locator('.td-dialog input').fill('-6');await p.locator('.td-dialog [data-r="1"]').click();await frame();
   const horizontalPoint=await at(400,240);await p.mouse.click(horizontalPoint.x,horizontalPoint.y);await p.keyboard.press('Delete');
   assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),1);
   await p.locator('#btnUndo').click();await frame();
   await p.mouse.click(horizontalPoint.x,horizontalPoint.y,{button:'right'});await p.locator('#ctxMenu [data-ctx="guide:delete"]').click();assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),1);
   await p.locator('#btnUndo').click();await frame();
   const beforeClear=await p.evaluate(()=>({guides:JSON.stringify(TD.state.doc.blocks[0].guides),shapes:JSON.stringify(TD.state.doc.shapes),undo:TD.state.undo.length}));
   await p.mouse.click(horizontalPoint.x,horizontalPoint.y,{button:'right'});await p.locator('#ctxMenu [data-ctx="guide:deleteAll"]').click();
   assert.equal(await p.evaluate(()=>TD.state.doc.blocks[0].guides.length),0,'Delete all guides clears the active diagram');
   assert.equal(await p.evaluate(()=>TD.state.undo.length),beforeClear.undo+1,'clearing guides is one undo action');
   assert.equal(await p.evaluate(()=>JSON.stringify(TD.state.doc.shapes)),beforeClear.shapes,'clearing guides leaves artwork unchanged');
   await p.locator('#btnUndo').click();await frame();assert.equal(await p.evaluate(()=>JSON.stringify(TD.state.doc.blocks[0].guides)),beforeClear.guides,'undo restores every guide and coordinate');
   await p.evaluate(()=>{TD.state.sel=new Set(['middle']);TD.app.render();TD.app.renderProps();});
   const middle=await p.evaluate(()=>{const s=TD.state.doc.shapes.find(s=>s.id==='middle');return{x:s.x+s.w/4,y:s.y};}), start=await at(middle.x,middle.y), finish=await at(222,middle.y);
   await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(finish.x,finish.y,{steps:4});await p.mouse.up();await frame();
   assert(await p.evaluate(()=>Math.abs(TD.bbox(TD.state.doc.shapes.find(s=>s.id==='middle')).x-200)<1e-6),'drag snaps a visible shape edge to the guide: '+JSON.stringify(await p.evaluate(()=>({shape:TD.state.doc.shapes.find(s=>s.id==='middle'),guides:TD.state.doc.blocks[0].guides,selection:[...TD.state.sel]}))));
   // Node annotations update through the actual inspector, retaining maths rendering.
   await p.evaluate(()=>{TD.state.sel=new Set(['left']);TD.app.renderProps();});
   for(const [key,value] of [['nodeName','inputNode'],['nodeLabel','Input $x$'],['nodePin','Control $u$']]) {const el=p.locator(`#props [data-native="${key}"]`);await el.fill(value);await el.press('Tab');await p.waitForTimeout(5);assert.equal(await el.inputValue(),value,'native inspector retains committed text');}
   await frame();
   const result=await p.evaluate(()=>({box:TD.bbox(TD.state.doc.shapes[0]),code:TD.toTikz(TD.state.doc.shapes,{standalone:true}),svg:TD.app.svgOf(TD.state.doc.shapes)}));
   assert(result.code.includes('(inputNode)') && result.code.includes('label=') && result.code.includes('pin='));
   assert(result.svg.includes('Input $x$') && result.svg.includes('Control $u$'));
   await p.screenshot({path:path.join(artifacts,browser+'-annotations.png')});
   await p.evaluate(()=>{
    const target=TD.state.doc.shapes.find(s=>s.id==='right');target.nodeName='outputNode';
    const edge={...TD.TYPES.line.create({x:0,y:0},{stroke:'#000000',width:1},'arrow'),id:'edge',label:'$f(x)$',link1:{id:'left',u:1,v:.5},link2:{id:'right',u:0,v:.5}};
    TD.state.doc.shapes.unshift(edge);TD.state.sel=new Set(['edge']);TD.app.render();TD.app.renderProps();
   });await frame();
   assert.equal(await p.locator('#props [data-native-link="link1"]').inputValue(),'left');
   await p.locator('#props [data-native-anchor="link2"]').selectOption('north');await frame();
   const code=await p.evaluate(()=>TD.toTikz(TD.state.doc.shapes,{standalone:true}));
   assert(code.includes('(inputNode.east)') && code.includes('(outputNode.north)'));
   assert(code.indexOf('(outputNode)')<code.indexOf('(outputNode.north)'),'nodes precede attached edges');
   fs.writeFileSync(path.join(artifacts,browser+'.tex'),code);
   for (const engine of ['temml','katex']) {
    await p.evaluate(async engine=>{TD.math.set(engine);await TD.math.whenReady();TD.app.render();},engine);await frame();
    assert(await p.evaluate(()=>TD.app.svgOf(TD.state.doc.shapes).includes('Control')),'annotations render under '+engine);
   }
   const columns=()=>p.evaluate(()=>new Set([...document.querySelectorAll('#tools button')].filter(b=>b.getClientRects().length).map(b=>Math.round(b.getBoundingClientRect().left))).size);
   assert.equal(await columns(),1,'tall windows use one tool column');
   for (const mode of ['diagram','page','board']) {
    await p.evaluate(mode=>TD.app.setMode(mode),mode);
    await p.setViewportSize({width:960,height:700});await frame();
    if(mode==='board') {
     for(const expected of ['locked','off','show']) {
      await p.locator('#btnGuides').click();assert.equal(await p.locator('#btnGuides').getAttribute('data-guide-mode'),expected);
      for(const axis of ['X','Y']) {
       assert(await p.locator('#ruler'+axis).isVisible(),'Whiteboard ruler remains visible with guides '+expected);
       assert(await p.locator('#ruler'+axis+' svg .tk').count()>0,'Whiteboard ruler remains painted with guides '+expected);
       assert.equal(await p.locator('#ruler'+axis).evaluate(el=>getComputedStyle(el).cursor),expected==='show'?(axis==='X'?'ns-resize':'ew-resize'):'default');
      }
     }
    }

    assert.equal(await columns(),2,mode+': short windows use two columns');
    assert(await p.evaluate(()=>{const rail=document.querySelector('#tools'),r=rail.getBoundingClientRect();return rail.scrollHeight<=rail.clientHeight+1 && [...rail.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>{const q=b.getBoundingClientRect();return q.top>=r.top && q.bottom<=r.bottom && q.left>=r.left && q.right<=r.right && q.width===32 && q.height===32;});}),mode+': every tool fits without shrinking or scrolling');
    await p.locator('[data-tool="pencil"]').click();assert.equal(await p.evaluate(()=>TD.state.tool),'pencil');
   }
   await p.locator('#tools [data-fly="shapes"]').click();assert(await p.locator('#fly-shapes').isVisible(),'flyouts open from the two-column rail');
   await p.keyboard.press('Escape');
   await p.screenshot({path:path.join(artifacts,browser+'-compact.png')});
   await p.setViewportSize({width:960,height:500});await frame();await p.locator('[data-tool="pencil"]').scrollIntoViewIfNeeded();await p.locator('[data-tool="pencil"]').click();
   assert.equal(await p.evaluate(()=>TD.state.tool),'pencil','tiny windows retain scrolling as a fallback');
   await p.setViewportSize({width:1600,height:1000});await frame();assert.equal(await columns(),1,'resizing taller restores one column');
   await p.setViewportSize({width:390,height:844});await frame();assert(await p.locator('#phoneWall').isVisible(),'existing portrait-phone screen guard is preserved');
   await p.setViewportSize({width:960,height:499});await frame();assert(await p.locator('#phoneWall').isVisible(),'a window too short for the editor shows the phone page');
   await p.setViewportSize({width:599,height:900});await frame();assert(await p.locator('#phoneWall').isVisible(),'a window too narrow for the editor shows the phone page');
   assert.deepEqual(b.logs,[]);console.log(`✓ ${browser}: bucket, local magnifier, grouping/layout, guides/history/persistence, native node labels/pins/anchors`);
  } finally {await b.close();}
 }
} finally {server.close();}
console.log('Construction artifacts: '+artifacts);
