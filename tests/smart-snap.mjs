import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['src/core/smart-snap.ts'],bundle:true,write:false,format:'esm'});
const {snapTranslation:snap}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const box={x:0,y:0,w:20,h:20};
let r=snap(box,97,0,[{x:0,y:0,w:40,h:20},{x:180,y:0,w:40,h:20}],[],8);
assert.equal(r.dx,100);assert(r.lines.some(l=>l.spacing),'equal gaps between neighbours');
r=snap(box,160,1,[{x:0,y:0,w:40,h:20},{x:80,y:0,w:40,h:20}],[],8);assert.equal(r.dx,160);assert(r.lines.some(l=>l.spacing),'repeat the preceding gap');
r=snap(box,99,32,[],[{id:'x',axis:'x',position:100},{id:'y',axis:'y',position:50}],8);assert.equal(r.dx,100);assert.equal(r.dy,30);
r=snap(box,-102,-102,[],[{id:'x',axis:'x',position:-100}],4);assert.equal(r.dx,-100);assert.equal(r.dy,-102);
for(const zoom of [.25,1,4]) { const tolerance=8/zoom; assert(snap(box,100-tolerance/2,0,[],[{id:'g',axis:'x',position:100}],tolerance).snappedX); }
r=snap(box,74,74,[],[],8);assert(!r.snappedX && !r.snappedY);assert.deepEqual(r.lines,[]);
console.log('Smart snapping: independent axes, edge/centre guides, equal gaps, negative coordinates and zoom-scaled tolerance passed');

// Axis alignment alone must not let distant objects outvote nearby neighbours.
const close={x:103,y:30,w:20,h:20}, distant={x:100,y:900,w:20,h:20};
r=snap(box,100,0,[distant,close],[],8,false);assert.equal(r.dx,103,'nearby target wins over a perfect distant alignment');
r=snap(box,100,0,[distant],[],8,false);assert.equal(r.dx,100,'distant target remains available when no closer candidate exists');
r=snap(box,100,0,[distant,close],[{id:'manual',axis:'x',position:101}],8,false);assert.equal(r.dx,101,'explicit construction guides remain intentional targets');
console.log('Spatial snap priority: nearby candidates, distant fallback and guide precedence passed');
r=snap(box,100,0,[distant,{x:145,y:30,w:20,h:20}],[],8,false);assert(!r.snappedX,'a distant line does not attract the object while nearer objects are present, even when they do not align');
