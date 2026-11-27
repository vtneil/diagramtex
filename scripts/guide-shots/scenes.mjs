// The guide's screenshots: each scene sets the app up as a reader would see it and may set window.__clip to the
// part to keep: a selector, a list of selectors (their union), or { x, y, width, height }; `pad` widens it.
// Examples come from the Welcome file (its "## n. Title" headings), so they stay current with it.

export const HELPERS = String.raw`
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const vis = e => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
const clipRect = spec => {
  const W = innerWidth, H = innerHeight;
  let r;
  if (spec.x != null) r = { ...spec };
  else {
    const sels = [].concat(spec.sel || spec), els = sels.flatMap(s => typeof s === 'string' ? $$(s).filter(vis) : [s]);
    if (!els.length) throw Error('clip: nothing matches ' + sels);
    const bs = els.map(e => e.getBoundingClientRect());
    const x = Math.min(...bs.map(b => b.left)), y = Math.min(...bs.map(b => b.top));
    r = { x, y, width: Math.max(...bs.map(b => b.right)) - x, height: Math.max(...bs.map(b => b.bottom)) - y };
  }
  const p = spec.pad ?? 0;
  const x = Math.max(0, r.x - p), y = Math.max(0, r.y - p);
  return { x, y, width: Math.min(W, r.x + r.width + p) - x, height: Math.min(H, r.y + r.height + p) - y };
};
// the Welcome file's examples: "## 19. Loaded RLC ladder…" heads the diagram after it
const ex = t => { const B = TD.state.doc.blocks; const i = B.findIndex(b => b.type === 'text' && b.text.split('\n')[0].startsWith('## ') && b.text.split('\n')[0].includes(t)); if (i < 0) throw Error('no example ' + t); return i + 1; };
const shapes = () => TD.state.doc.blocks[TD.state.doc.active ?? 0]?.shapes || TD.state.doc.sheet?.shapes;
const open = async (t, keepSide) => { if (t != null) TD.app.setActiveBlock(typeof t === 'number' ? t : ex(t)); TD.app.setMode('diagram'); await frame(); if (!keepSide) await hideSide(); TD.app.zoomFit(); await sleep(500); };
const hideSide = async () => { if ($('#files')?.offsetWidth > 0) $('#btnSidebar').click(); await sleep(300); };
const foldLayers = async () => { const t = $('#layersToggle'); if (t && t.getAttribute('aria-expanded') !== 'false') t.click(); await frame(); };
const select = ids => { TD.state.sel.clear(); for (const id of ids) TD.state.sel.add(id); TD.app.render?.(); TD.app.renderProps?.(); };
const edit = async (type, pick) => { const s = (pick || (x => x))(shapes().filter(x => x.type === type))[0] || shapes().find(x => x.type === type); if (!s) throw Error('no ' + type + ' in ' + shapes().map(x => x.type)); TD[TD.blocks.get(type).editor.alias](s.id); await sleep(1400); return s; };
// a block that the Welcome file has no example of: added to the open diagram, then opened
const inject = async (shape) => { const s = { id: 'g' + Math.random().toString(36).slice(2, 8), x: 200, y: 160, color: '#000000', ...shape }; TD.state.doc.blocks.push({ type: 'diagram', shapes: [s] }); TD.app.setActiveBlock(TD.state.doc.blocks.length - 1); TD.app.setMode('diagram'); await frame(); TD.app.zoomFit(); await sleep(400); return s; };
const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const mod = TD.app.cmd.isMac ? { metaKey: true } : { ctrlKey: true };
const svgPt = (s) => { const b = TD.bbox(s); const v = TD.state.view; const st = $('#stage').getBoundingClientRect(); return { x: st.left + (b.x + b.w / 2 - v.x) * v.zoom, y: st.top + (b.y + b.h / 2 - v.y) * v.zoom }; };
const editor = () => $$('.modal-box').find(vis);
`;

// LaTeX pasted into the import dialog
const IMPORT = String.raw`\begin{tikzpicture}[>=stealth, thick, box/.style={draw, rounded corners, minimum width=2.4cm, minimum height=1.1cm}]
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
const GRAPH = String.raw`\begin{tikzpicture}
  \graph[nodes={draw, circle, minimum size=7mm}, edges={thick}] {
    a -- {b, c, d};
    b -- c -- e;
    d -- e -- f;
    c -- f;
  };
\end{tikzpicture}`;
const FORMULA = String.raw`\hat f(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx`;
const flyClip = id => `const f = $('#${id}').getBoundingClientRect(), t = $('#tools').getBoundingClientRect(); window.__clip = { x: t.left, y: Math.max(0, f.top - 72), width: f.right - t.left + 20, height: Math.min(innerHeight, f.bottom + 72) - Math.max(0, f.top - 72) };`;
const rightClick = `const rc = async (id, sub) => { const el = $$('#canvas [data-id]').find(e => e.dataset.id === id) || $('#canvas'); const b = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 2 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('contextmenu', o)); await sleep(400); if (sub) { const r = $$('#ctxMenu *').find(e => e.children.length <= 3 && (e.textContent || '').trim().startsWith(sub)); r?.closest('[role=menuitem], button, .row, li')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); r?.closest('[role=menuitem], button, .row, li')?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })); await sleep(500); } };`;
const editEx = (title, type, pick = '') => `await open(${JSON.stringify(title)}); await edit('${type}'${pick ? ', ' + pick : ''});`;

export const scenes = [
  // ---- the window, appearance and language
  { name: 'window', js: `await open(1, true); const p = shapes().find(x => x.type === 'plot'); select([p.id]);` },
  { name: 'window-dark', dark: true, js: `await open('Pendulum'); const s = shapes().find(x => x.type === 'line' && x.label) || shapes()[0]; select([s.id]);` },
  { name: 'window-thai', langs: ['en'], locale: 'th', js: `await open('Damped oscillation', true); select([shapes().find(x => x.type === 'plot').id]);` },

  // ---- the five modes
  { name: 'mode-document', js: `TD.app.setMode('document'); await sleep(900); const h = $$('#docview *').find(e => e.children.length === 0 && /^5\\. Thin-lens/.test(e.textContent || '')); h?.scrollIntoView({ block: 'start' }); $('#docview').scrollTop -= 60; await sleep(400);` },
  { name: 'mode-page', js: `TD.app.setActiveBlock(ex('Thin-lens')); const lens = structuredClone(shapes()); TD.app.setMode('page'); await sleep(900); TD.app.cmd.placeOnCanvas(lens); await sleep(300); select([]); TD.app.cmd.zoomFit(); await sleep(600);` },
  { name: 'mode-board', js: `TD.app.setActiveBlock(ex('Closed-loop control')); const a = structuredClone(shapes()); TD.app.setMode('board'); await sleep(900); TD.app.cmd.placeOnCanvas(a); await sleep(300); select([]); TD.app.cmd.zoomFit(); await sleep(600);` },
  { name: 'mode-table', js: `await open('Scientific results table', true); await edit('table');` },
  { name: 'mode-quick', js: `TD.app.cmd.setQuick(true); await sleep(700); const q = $('#quickTex'); q.value = ${JSON.stringify(FORMULA)}; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(1200);` },
  { name: 'quick-block', js: `TD.app.cmd.setQuick(true); await sleep(700); $('#quickList [data-view=qc]').click(); await sleep(900); const nb = $$('#quick button').filter(vis).find(e => /^New/.test(e.textContent.trim())); nb?.click(); await sleep(1800);` },

  // ---- drawing
  { name: 'fly-lines', js: `await open('Bézier'); $('#tools [data-fly=lines]').click(); await sleep(500); ${flyClip('fly-lines')}` },
  { name: 'fly-shapes', js: `await open('Bézier'); $('#tools [data-fly=shapes]').click(); await sleep(500); ${flyClip('fly-shapes')}` },
  { name: 'fly-phys', js: `await open('Bézier'); $('#tools [data-fly=phys]').click(); await sleep(500); ${flyClip('fly-phys')}` },
  { name: 'physics', js: editEx('Atwood', 'physics') },
  { name: 'rulers', js: `await open('Incline forces'); await foldLayers(); const s = shapes().filter(x => x.type === 'poly' || x.type === 'sym')[0]; select([s.id]); await sleep(300); const ry = $('#rulerY').getBoundingClientRect(), rx = $('#rulerX').getBoundingClientRect(); window.__clip = { x: ry.left, y: rx.top, width: 900, height: 540 };` },
  { name: 'context-menu', js: `await open('Venn diagram'); await foldLayers(); ${rightClick} const e = shapes().filter(x => x.type === 'ellipse'); select(e.slice(0, 2).map(x => x.id)); await rc(e[0].id, 'Align');` },
  { name: 'style', js: `await open('Green'); const r = shapes().find(x => x.type === 'region') || shapes().find(x => x.fill && x.fill !== 'none'); select([r.id]); await foldLayers(); await sleep(300); const p = $('#props'); if (p) p.scrollTop = 0; window.__out = r.type;` },

  // ---- text and maths
  { name: 'maths-dock', js: `await open(1); const t = shapes().filter(x => x.type === 'text' && (x.text || '').includes('\\int'))[0]; select([t.id]); key('Enter'); await sleep(900); const b = $$('.text-dock').filter(vis)[0].getBoundingClientRect(), rc = $('#rightCol').getBoundingClientRect(); const top = Math.max(0, b.top - 300); window.__clip = { x: 0, y: top, width: rc.left - 4, height: b.bottom - top + 2 }; window.__out = t.text;` },

  // ---- plots and 3D
  { name: 'plot-2d', js: `await open('Damped oscillation'); select([shapes().find(x => x.type === 'plot').id]);` },
  { name: 'plot-3d', js: `await open('Peaks surface'); await foldLayers(); select([shapes().filter(x => x.type === 'plot')[0].id]);` },
  { name: 'solid-3d', js: `await open('Washer and shell'); await foldLayers(); select([shapes().find(x => x.type === 'revolve').id]);` },

  // ---- blocks
  { name: 'blocks-menu', js: `await open('Weighted network'); $('#btnBlocks').click(); await sleep(600); ${flyClip('fly-blocks')}` },
  { name: 'ed-circuit', js: editEx('RLC ladder', 'cz') },
  { name: 'ed-quantum', js: editEx('quantum Fourier', 'qc') },
  { name: 'ed-cd', js: editEx('commutative cube', 'cd') },
  { name: 'ed-xy', js: editEx('XyMatrix', 'xy') },
  { name: 'ed-forest', js: editEx('Decision tree', 'forest') },
  { name: 'ed-graph', js: `await open(1); const s = await inject({ type: 'graph', src: ${JSON.stringify(GRAPH)} }); TD.graphOpen(s.id); await sleep(1400);` },
  { name: 'ed-zx', js: editEx('ZX representation', 'zx') },
  { name: 'ed-feynman', js: editEx('four-photon', 'feynman') },
  { name: 'ed-geo2d', js: editEx('Circle geometry', 'geo2d') },
  { name: 'ed-geo3d', js: editEx('Spherical position', 'geo3d') },
  { name: 'ed-timing', js: editEx('Synchronous bus', 'timing') },
  { name: 'ed-automata', js: editEx('TCP active-open', 'automata') },
  { name: 'ed-network', js: `await open(1); const s = await inject({ type: 'network', src: TD.NETWORK_DEFAULT, files: {} }); TD.networkOpen(s.id); await sleep(1400);` },
  { name: 'ed-uml', js: editEx('Abstract Factory', 'uml') },
  { name: 'ed-umlsd', js: editEx('Simulation loop', 'umlsd') },
  { name: 'ed-kmap', js: editEx('Karnaugh', 'kmap') },
  { name: 'ed-bytefield', js: editEx('IPv4', 'bytefield') },
  { name: 'ed-chemfig', js: editEx('Imine formation', 'chemfig') },
  { name: 'ed-chemlab', js: editEx('Imine formation', 'chemlab') },
  { name: 'bloch', js: `await open('Bloch sphere'); await foldLayers(); select([shapes().find(x => x.type === 'bloch').id]);` },

  // ---- documents
  { name: 'doc-edit', js: `TD.app.setMode('document'); await sleep(900); const p = $$('#docview p, #docview li').filter(vis).find(e => /Draw figures for/.test(e.textContent || '')) || $$('#docview p').filter(vis)[0]; const b = p.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: b.left + 40, clientY: b.top + 8, button: 0 }; p.dispatchEvent(new PointerEvent('pointerdown', o)); p.dispatchEvent(new MouseEvent('mousedown', o)); p.dispatchEvent(new PointerEvent('pointerup', o)); p.dispatchEvent(new MouseEvent('mouseup', o)); p.dispatchEvent(new MouseEvent('click', o)); await sleep(800); const f = $('#files').getBoundingClientRect(), rc = $('#rightCol').getBoundingClientRect(); window.__clip = { x: f.right, y: 44, width: rc.left - f.right, height: 480 };` },

  // ---- output
  { name: 'latex', js: `await open('Pendulum', true); $('#btnTikz').click(); await sleep(900);` },
  { name: 'compile', wait: 2000, js: `await open('Pendulum'); $('#btnTikz').click(); await sleep(900); $('#tikzCompile').click(); for (let k = 0; k < 240 && !$$('#tikzPdfPane canvas, #tikzPdfPane img, #tikzPdfPane iframe').some(vis); k++) await sleep(500); await sleep(1500);` },
  { name: 'export', js: `await open('Damped oscillation'); select([shapes().find(x => x.type === 'plot').id]); $('#btnExport').click(); await sleep(700); window.__clip = { x: innerWidth - 840, y: 0, width: 840, height: 560 };` },

  // ---- import
  { name: 'import', js: `await hideSide(); TD.app.setMode('diagram'); TD.app.openImport(${JSON.stringify(IMPORT)}); await sleep(800);` },
  { name: 'imported', js: `await hideSide(); await foldLayers(); TD.app.openImport(${JSON.stringify(IMPORT)}); await sleep(400); $('#impNew').click(); await sleep(900); TD.app.setMode('diagram'); await frame(); TD.app.zoomFit(); await sleep(500); const r = shapes().find(x => x.type === 'rect' || x.type === 'sym'); if (r) select([r.id]);` },

  // ---- files
  { name: 'files', js: `for (const n of ['Thesis/Chapter 2 figures', 'Thesis/Chapter 3 figures', 'Lectures/Week 4 Fourier', 'Lectures/Week 5 Laplace', 'Problem set 5']) TD.app.newDoc(n); await sleep(500); const li = $$('#docList [data-doc]').find(e => /Chapter 3/.test(e.textContent)); const b = li.getBoundingClientRect(); li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 60, clientY: b.top + 12, button: 2 })); await sleep(600); const m = $$('#ctxMenu, .ctx').filter(vis).pop(); const mb = m ? m.getBoundingClientRect() : b; window.__clip = { x: 0, y: 44, width: Math.max($('#files').getBoundingClientRect().right, mb.right) + 16, height: Math.max(b.bottom, mb.bottom) - 44 + 24 };` },

  // ---- search
  { name: 'cmdk', js: `await open('Pendulum'); key('k', mod); await sleep(500); const i = $('#cmdkIn'); i.value = document.documentElement.lang === 'th' ? 'เส้น' : 'rot'; i.dispatchEvent(new Event('input', { bubbles: true })); await sleep(600); window.__out = $('#cmdkList')?.children.length;` },
];
