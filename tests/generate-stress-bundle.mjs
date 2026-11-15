// Synthetic, reproducible stress data. Never reads the optional private project.
// node tests/generate-stress-bundle.mjs --dist [--repeats=24]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { prepare, APP_DIR, ROOT, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser } from './browser.mjs';
const stem = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'all-modes';
assert(/^[a-z0-9-]+$/.test(stem));
const repeats = Number(args.find(a => a.startsWith('--repeats='))?.split('=')[1] || 24);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 100);
await prepare();
const server = await serve(APP_DIR);
const b = await launchBrowser('chromium', `http://127.0.0.1:${server.port}/`);
try {
  const result = await b.page.evaluate(({ repeats }) => {
    let seed = 1474;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const clone = s => JSON.parse(JSON.stringify(s));
    const formulas = [String.raw`\displaystyle\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}`,
      String.raw`\hat{x}+\widehat{AB}+\vec{F}`, String.raw`\sum_{k=1}^{n}k^2=\frac{n(n+1)(2n+1)}6`,
      String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`, String.raw`\cos^2u-\sin^2u`,
      String.raw`\frac{\partial^2 f}{\partial x\partial y}`, String.raw`\sqrt[3]{1+x^2}`, String.raw`\overbrace{a+b+c}^{n}`,
      String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`, String.raw`\mathbf A\boldsymbol\alpha=\lambda\mathbf v`,
      String.raw`\begin{aligned}a&=b+c\\d&=e-f\end{aligned}`, String.raw`\prod_{j=1}^{n}\left(1+\frac1{j^2}\right)`];
    const defaults = { stroke: '#243b53', width: 1, dash: 'solid', color: '#102a43', size: 'normalsize' };
    const make = (type, tool = type) => {
      if (type === 'region') return { type, rings: [[[0,0],[180,0],[180,100],[0,100]],[[50,25],[50,75],[130,75],[130,25]]], ...defaults, fill: '#d9e8f5' };
      const s = TD.TYPES[type].create({ x: 0, y: 0 }, defaults, tool); s.type = type;
      if ('x2' in s) { s.x2 = 180; s.y2 = 70; }
      if (type === 'curve') Object.assign(s, { cx1: 40, cy1: -60, cx2: 140, cy2: 130 });
      if (type === 'poly') Object.assign(s, { pts: [[0,0],[70,90],[150,10],[200,70]], closed: true, fill: '#e0f2f1' });
      if ('w' in s && !s.w) { s.w = s._pw || 180; s.h = s._ph || 110; }
      if ('rx' in s) { s.rx = 80; s.ry = 45; }
      if ('r' in s && typeof s.r === 'number' && !s.r) s.r = 60;
      if (type === 'line' || type === 'curve') { s.endTip = 'stealth'; s.label = '$\\vec v$'; }
      if (type === 'text') s.text = '$' + formulas[0] + '$';
      if (type === 'sym' && 'text' in s) s.text = '$\\hat x$';
      if (type === 'image') { s.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="#d9e8f5"/><path d="M10 85L50 35L90 65L135 10L170 85Z" fill="#486581"/></svg>'); s.file = 'synthetic.svg'; }
      if (type === 'table') s.table.cells.forEach((row, r) => row.forEach((cell, c) => { cell.t = r ? `$x_{${r+c}}^2$` : ['Quantity', 'Value'][c]; }));
      if (type === 'comp') { s.ref = 'stress-component'; s.cname = 'Synthetic component'; s.def = [make('rect'), { ...make('text'), x: 90, y: 55, text: '$\\vec F=m\\vec a$' }]; }
      if (type === 'tikz') { s.code = '\\draw[blue,->] (0,0)--(3,1);'; s.prev = [{ ...make('line'), label: '$\\alpha$' }]; }
      TD.TYPES[type].fix?.(s);
      return s;
    };
    const templates = Object.keys(TD.TYPES).map(type => ({ name: type, shape: make(type) }));
    const add = (type, tool) => templates.push({ name: tool, shape: make(type, tool) });
    const symbols = Object.keys(TD.SYMS);
    // Include every symbol family, evenly sampled rather than hundreds of near-identical variants.
    const categories = new Map();
    for (const key of symbols) {
      const category = TD.SYMS[key].cat || key.split(':')[0];
      if (!categories.has(category)) categories.set(category, key);
    }
    const sampled = new Set([...categories.values(), ...Array.from({ length: 24 }, (_, i) => symbols[Math.floor(i * symbols.length / 24)])]);
    for (const key of sampled) add('sym', 'sym:' + key);
    for (const kind of ['function','line','scatter','area','bar','contour','heatmap','param3d','curve3d','function3d','surface3d','mesh3d','scatter3d']) add('plot', 'plot:' + kind);
    for (const kind of Object.keys(TD.physics.domains)) add('physics', 'physics:' + kind);
    for (const kind of ['box','sphere','cylinder','cone','frustum','torus','prism','pyramid','cube','tube','hemisphere','cap','ellipsoid','hexprism','tetra','octa','axes','swedge']) add('prim3d', 'prim3d:' + kind);
    for (const kind of ['region','wedge','columns']) add('solid', 'solid:' + kind);
    for (const kind of ['disk','washer','shell','slice']) add('revolve', 'revolve:' + kind);
    for (let i = 0; i < formulas.length; i++) templates.push({ name: 'math:' + i, shape: { ...make('text'), text: '$' + formulas[i] + '$', align: ['left','center','right'][i % 3] } });
    const bounds = [];
    for (const [index, t] of templates.entries()) {
      const assignIds = (s, prefix) => {
        s.id = prefix;
        for (const key of ['def','prev','items','series']) s[key]?.forEach((child,j) => { child.id = `${prefix}-${key}-${j}`; if (child.type && TD.TYPES[child.type]) assignIds(child, child.id); });
      };
      assignIds(t.shape, `template-${index}`);
      if (TD.TYPES[t.shape.type].valid && !TD.TYPES[t.shape.type].valid(t.shape)) throw new Error('Invalid template: ' + t.name);
      const box = TD.bbox(t.shape);
      if (![box.x,box.y,box.w,box.h].every(Number.isFinite)) throw new Error('Invalid bounds: ' + t.name);
      TD.translate(t.shape, -box.x, -box.y); bounds.push(box);
    }
    // Exercise every template through the actual renderer in both engines.
    for (const engine of ['temml','katex']) {
      TD.math.set(engine);
      TD.math.synchronous(() => templates.forEach(t => {
        const html = TD.TYPES[t.shape.type].svg(t.shape, { export: true, hit: 0, zoom: 1, scene: templates.map(t => t.shape) });
        if ((t.shape.type !== 'coord' && !html) || /(?:NaN|undefined)/.test(html.replace(/(?:href|src)="[^"]*"/g, ''))) throw new Error('Invalid ' + engine + ' preview: ' + t.name + ' ' + html.match(/.{0,60}(?:NaN|undefined).{0,60}/)?.[0]);
      }));
      TD.math.cancelPending();
    }
    const cellW = Math.ceil(Math.max(...bounds.map(b => b.w)) + 100), cellH = Math.ceil(Math.max(...bounds.map(b => b.h)) + 100);
    const count = templates.length * repeats, px = TD.PX_PER_CM;
    function shapes(prefix, placement) {
      return Array.from({ length: count }, (_, i) => {
        const s = clone(templates[i % templates.length].shape), [x,y] = placement(i);
        s.id = `${prefix}-${i}`; TD.translate(s, x, y);
        // Distinct expressions expose cold-cache compilation costs as well as repeated-formula caching.
        if (s.type === 'text') s.text += ` $+a_{${i}}$`;
        if (s.type === 'table') s.table.cells[1][1].t = `$\\frac{${i+1}}{1+x^2}$`;
        if (s.type === 'coord') s.tikzName = `P${i}`;
        if (s.items) s.items.forEach((item, j) => { item.id = `${prefix}-${i}-part-${j}`; });
        return s;
      });
    }
    const diagram = shapes('diagram', i => [40 + i % 8 * cellW, 40 + Math.floor(i / 8) * cellH]);
    const board = shapes('board', i => [(i % 12 - 6) * cellW, (Math.floor(i / 12) - Math.ceil(count / 24)) * cellH]);
    const pageW = cellW * 4 + 80, pageH = cellH * 4 + 80, pages = Math.ceil(count / 16);
    const paged = shapes('page', i => [40 + i % 4 * cellW, Math.floor(i / 16) * (pageH + px) + 40 + Math.floor(i % 16 / 4) * cellH]);
    const documentShapes = shapes('document', i => [40 + i % 4 * cellW, 40 + Math.floor(i % 12 / 4) * cellH]);
    const blocks = [{ type: 'text', text: '\\section{Synthetic rendering stress test}\nUse both engines, pan, zoom and scroll while rendering. All data is generated; no private project is included.' }];
    for (let i = 0; i < count; i += 12) {
      blocks.push({ type: 'text', text: `\\subsection{Mixed batch ${i / 12 + 1}}\n` + formulas.map((f,j) => `$${f}+b_{${i+j}}$`).join(' · ') });
      blocks.push({ type: 'diagram', shapes: documentShapes.slice(i, i + 12), caption: `Mixed elements ${i+1}–${Math.min(count,i+12)}` });
      blocks.push({ type: 'table', rows: [['Quantity','Value'],['$\\hat x$','$\\frac{1}{1+x^2}$'],['Index',String(i)]], header: true, borders: 'all', colAlign: 'c' });
    }
    const classicPage = { ...TD.PAGE_DEFAULT, title: true };
    const file = (name, kind, body, page = classicPage) => ({ app: 'diagramtex', version: 3, kind, name, page, ...body });
    const files = [file('Stress — Document', 'classic', { blocks }),
      file('Stress — Diagram (select Diagram)', 'classic', { blocks: [{ type: 'diagram', shapes: diagram }] }),
      file('Stress — Page', 'page', { sheet: { pages, shapes: paged } }, { ...classicPage, paper: 'custom', w: pageW / px, h: pageH / px, orient: 'portrait' }),
      file('Stress — Whiteboard', 'board', { blocks: [{ type: 'diagram', shapes: board }] })];
    files.forEach(f => { if (!TD.app.parseProject(JSON.stringify(f))) throw new Error('File failed codec: ' + f.name); });
    const types = Object.keys(TD.TYPES).sort();
    return { bundle: { app: 'diagramtex', version: 3, kind: 'bundle', files }, manifest: {
      synthetic: true, seed: 1474, repeats, templates: templates.length, supportedTypes: types, coveredTypes: [...new Set(templates.map(t=>t.shape.type))].sort(),
      templateNames: templates.map(t => t.name),
      symbolVariants: sampled.size, formulaVariants: formulas.length, pageCount: pages,
      files: files.map(f => ({ name: f.name, kind: f.kind, elements: count, blocks: f.blocks?.length || 0 })),
      totalElements: count * 4, documentInlineFormulae: Math.ceil(count / 12) * formulas.length,
    } };
  }, { repeats });
  assert.deepEqual(result.manifest.coveredTypes, result.manifest.supportedTypes);
  assert.deepEqual(b.logs, [], 'No rendering errors while generating templates');
  const dir = path.join(ROOT, 'tests/stress-fixtures'); fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(result.bundle);
  fs.writeFileSync(path.join(dir, stem + '.diagramtex'), text);
  fs.writeFileSync(path.join(dir, stem === 'all-modes' ? 'manifest.json' : stem + '.manifest.json'), JSON.stringify({ ...result.manifest, bytes: Buffer.byteLength(text) }, null, 2) + '\n');
  console.log(JSON.stringify({ ...result.manifest, bytes: Buffer.byteLength(text), output: path.join(dir,stem + '.diagramtex') }, null, 2));
} finally { await b.close(); server.close(); }
