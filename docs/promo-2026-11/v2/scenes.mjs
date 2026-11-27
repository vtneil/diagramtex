// Final scenes: each featured object shows its settings (block editor open, or object selected with its panel).
import {Q} from './lib.mjs';
import fs from 'node:fs';
const FIGS=fs.readFileSync(new URL('./figs.json',import.meta.url),'utf8'); // figures prepared by hand in the app
const inject=k=>`const f=(${FIGS})[${JSON.stringify(k)}];TD.state.doc.blocks.push({type:'diagram',shapes:[f]});TD.app.setActiveBlock(TD.state.doc.blocks.length-1);TD.app.setMode('diagram');await frame();TD.app.zoomFit();await sleep(400);TD[TD.blocks.get(f.type).editor.alias](f.id);await sleep(1200);`;
export const W=1440, H=900;
const L = Q + `const foldLayers=async()=>{const t=$('#layersToggle');if(t&&t.getAttribute('aria-expanded')!=='false')t.click();await frame();};`;
const IMPORT=String.raw`\begin{tikzpicture}[>=stealth, thick, box/.style={draw, rounded corners, minimum width=2.4cm, minimum height=1.1cm}]
  \node[box, fill=blue!10] (enc) at (0,0) {Encoder};
  \node[box, fill=orange!15] (z) at (4,0) {Latent $z$};
  \node[box, fill=green!12] (dec) at (8,0) {Decoder};
  \node (x) at (-2.6,0) {$x$};
  \node (xh) at (10.6,0) {$\hat x$};
  \draw[->] (x) -- (enc);
  \draw[->] (enc) -- node[above] {$\mu,\sigma$} (z);
  \draw[->] (z) -- node[above] {$z\sim q_\phi$} (dec);
  \draw[->] (dec) -- (xh);
  \draw[->, dashed, red] (dec.north) .. controls (8,2.4) and (0,2.4) .. (enc.north);
  \node[red] at (4,2.3) {$\mathcal{L} = \mathbb{E}[\log p_\theta(x\mid z)] - D_{\mathrm{KL}}$};
\end{tikzpicture}`;
export const scenes=[
{name:'f01-hero',js:L+`await hideSide();await foldLayers();await open('Pendulum');const s=shapes().find(x=>x.type==='line'&&x.label==='$mg\\\\sin\\\\theta$')||shapes().find(x=>x.type==='line'&&x.label);select([s.id]);window.__out=s.label;`},
{name:'f01-code',js:L+`await hideSide();await open('Pendulum');select(shapes().filter(x=>TD.bbox(x).x>740&&TD.bbox(x).y<360).map(x=>x.id));$('#btnTikz').click();await sleep(500);const c=$('#tikzSelOnly');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));await sleep(800);`},
{name:'f02-plot3d',js:L+`await hideSide();await foldLayers();await open('Peaks surface');const p=shapes().filter(x=>x.type==='plot')[0];select([p.id]);`},
{name:'f02b-blocks',js:L+`await hideSide();await open('Weighted network');$('#btnBlocks').click();await sleep(600);const p=$$('.pop-title').find(e=>e.offsetWidth>0)?.parentElement;const r=p?.getBoundingClientRect();window.__out=r&&[r.x,r.y,r.width,r.height].map(Math.round);`},
{name:'f03-circuit',js:L+`await hideSide();await open('RLC ladder');await edit('cz');`},
{name:'f04-table',js:L+`await hideSide();await open('Scientific results table');await edit('table');`},
{name:'f05-shapes',js:L+`await hideSide();await foldLayers();await open('neural network');const ids=shapes().filter(x=>x.type==='ellipse').slice(3,7).map(x=>x.id);select(ids);`},
{name:'f06-physics',js:L+`await hideSide();await open('Atwood');await edit('physics');`},
{name:'f07-quantum',js:L+`await hideSide();`+inject('qc')},
{name:'f08-document',js:L+`await hideSide();TD.app.setMode('document');await sleep(700);const h=$$('#docview *').find(e=>e.children.length===0&&/^5\\. Thin-lens/.test(e.textContent||''));h?.scrollIntoView({block:'start'});$('#docview').scrollTop-=120;await sleep(300);`},
{name:'f09-geo3d',js:L+`await hideSide();await open('Spherical position');await edit('geo3d');`},
{name:'f10-import',js:L+`await hideSide();TD.app.setMode('diagram');TD.app.openImport(${JSON.stringify(IMPORT)});await sleep(700);`},
{name:'f10-imported',js:L+`await hideSide();await foldLayers();TD.app.openImport(${JSON.stringify(IMPORT)});await sleep(400);$('#impNew').click();await sleep(900);TD.app.setMode('diagram');await frame();TD.app.zoomFit();await sleep(500);const r=shapes().find(x=>x.type==='rect'||x.type==='node'||x.type==='box');if(r)select([r.id]);window.__out=shapes().map(s=>s.type+':'+(s.text||s.label||'').slice(0,12));`},
{name:'f11-chem',js:L+`await hideSide();`+inject('chem')},
{name:'f12-cd',js:L+`await hideSide();await open('commutative cube');await edit('cd');`},
{name:'f13-hatch',js:L+`await hideSide();await foldLayers();await open('retaining wall');const s=shapes().filter(x=>x.fill&&typeof x.fill==='object');select([s[1]?.id||s[0].id]);window.__out=s.map(x=>x.type);`},
{name:'f14-quick',js:L+`TD.app.cmd.setQuick(true);await sleep(600);const q=$('#quickTex');q.value=String.raw\`\\\hat f(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi}\\, dx\`;q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(1200);`},
{name:'f15-export',js:L+`theme('light');await hideSide();await open('Damped oscillation');select([shapes().find(x=>x.type==='plot').id]);$('#btnExport').click();await sleep(700);`},
];
