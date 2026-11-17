// Compose the 15 promo images (1920×1080) from real app captures in raw/, then render final/*.png.
// Usage: node build.mjs            (captures come from: node shoot.mjs scenes.mjs)
// Each slide: one plain title that says what the app does, and the capture. No taglines.
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const DIR = import.meta.dirname;
const VW = 1440, VH = 900; // capture viewport (CSS px); raw PNGs are 2× this
// Ordered by first-impression impact. crop: CSS-px box [x,y,w,h] of the capture.
// inset: a second capture cropped to a box, drawn at width w at (x,y), with a small tag.
const slides = [
  { file: 'f01-hero', title: 'A visual TikZ editor: draw instead of guessing coordinates, and get readable tikzpicture code',
    inset: { file: 'f01-code', box: [291, 141, 858, 362], w: 720, x: 110, y: 690, label: 'LaTeX for the selection' } },
  { file: 'f02-plot3d', title: '2D and 3D pgfplots: functions, parametric, polar, implicit, contour, heatmap, bar and scatter' },
  { file: 'f02b-blocks', title: 'Blocks for tikz-cd, quantikz, circuitikz, forest, chemfig, tikz-feynman and more, each with its own editor', crop: [0, 290, 1000, 610] },
  { file: 'f03-circuit', title: 'A drag-and-drop circuit editor with 415 circuitikz components that exports circuitikz code' },
  { file: 'f04-table', title: 'Tables that work like a spreadsheet: import from Excel or CSV, and copy clean booktabs LaTeX' },
  { file: 'f05-shapes', title: 'Build figures from basic shapes and lines, with LaTeX maths labels that render as you type' },
  { file: 'f06-physics', title: 'Physics figures that are computed, not just drawn: Atwood machines, inclines, pendulums and linkages' },
  { file: 'f07-quantum', title: 'A drag-and-drop quantikz editor for gates, controls and measurements, with the code live beside it' },
  { file: 'f08-document', title: 'Lay out text, maths and figures on A4 or Letter pages and export a complete LaTeX article' },
  { file: 'f09-geo3d', title: '3D geometry in tikz-3dplot: turn the view by dragging, and add points, vectors, planes and surfaces' },
  { file: 'f10-imported', title: 'Import existing TikZ: paste code or open a .tex file to keep editing figures you already have',
    inset: { file: 'f10-import', box: [291, 141, 858, 383], w: 640, x: 110, y: 700, label: 'Pasted source' } },
  { file: 'f11-chem', title: 'A chemfig editor for structural formulas and reaction schemes, with charges, lone pairs and arrows' },
  { file: 'f12-cd', title: 'A tikz-cd editor: type objects on a grid and drag arrows from cell to cell, with live code' },
  { file: 'f14-quick', title: 'Quick mode turns one formula into a picture: copy a PNG or SVG for slides, documents or chats', crop: [300, 80, 960, 520] },
  { file: 'f15-export', title: 'Export PNG at any DPI, vector SVG or PDF, and TikZ for everything or only the selection', light: true },
];
const FONT = '../../../../public/fonts';
const css = `
@font-face{font-family:Inter;src:url(${FONT}/InterDisplay-SemiBold.woff2);font-weight:600}
@font-face{font-family:Inter;src:url(${FONT}/InterDisplay-Bold.woff2);font-weight:700}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
body{position:relative;font-family:Inter,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;color:#f3efe8;
  background:radial-gradient(1100px 700px at 50% 60%,#2a2620 0%,transparent 70%),#141311}
body.light{color:#1f1d1a;background:radial-gradient(1100px 700px at 50% 60%,#fffaf0 0%,transparent 70%),#ece7de}
.brand{position:absolute;right:64px;top:58px;display:flex;align-items:center;font-size:20px;font-weight:600;letter-spacing:-.2px;opacity:.85}
.mark{width:13px;height:13px;border-radius:50%;background:#e76c4c;box-shadow:8px 8px 0 #4f62d8;margin-right:20px}
h1{position:absolute;left:64px;top:44px;margin:0;font-size:48px;line-height:1.14;letter-spacing:-1.2px;font-weight:700;width:1460px;text-wrap:balance}
.shot{position:absolute;overflow:hidden;border-radius:14px;border:1px solid #3a3731;box-shadow:0 30px 80px #0009,0 0 0 1px #0004}
.light .shot{border-color:#c9c1b3;box-shadow:0 30px 70px #3a2d1430}
.shot img,.inset img{position:absolute;max-width:none}
.inset{position:relative;border-radius:0 12px 12px 12px;overflow:hidden;border:1px solid #57524a;box-shadow:0 24px 60px #000b}
.inset-wrap{position:absolute}
.inset-wrap .tag{display:block;font-size:14px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#f3efe8;background:#e76c4c;padding:6px 12px;border-radius:7px 7px 0 0;width:max-content}
`;
// Show a CSS-px box of a capture at a given width.
const crop = (file, [x, y, w, h], width) => {
  const s = width / w;
  return { html: `<img src="../raw/${file}.png" style="width:${VW * s}px;height:${VH * s}px;left:${-x * s}px;top:${-y * s}px">`, w: width, h: h * s };
};
for (const [dir, ext] of [['pages', '.html'], ['final', '.png']]) {
  fs.mkdirSync(path.join(DIR, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(DIR, dir))) if (f.endsWith(ext)) fs.unlinkSync(path.join(DIR, dir, f));
}
const TOP = 196, BOTTOM = 36, SIDE = 64;
const pages = slides.map((sl, i) => {
  const box = sl.crop || [0, 0, VW, VH];
  const maxW = 1920 - 2 * SIDE, maxH = 1080 - TOP - BOTTOM;
  const width = Math.min(maxW, maxH * box[2] / box[3]);
  const c = crop(sl.file, box, width);
  const left = (1920 - c.w) / 2, top = TOP + (maxH - c.h) / 2;
  let inset = '';
  if (sl.inset) {
    const k = crop(sl.inset.file, sl.inset.box, sl.inset.w);
    inset = `<div class="inset-wrap" style="left:${sl.inset.x}px;top:${sl.inset.y}px"><span class="tag">${sl.inset.label}</span><div class="inset" style="width:${k.w}px;height:${k.h}px">${k.html}</div></div>`;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${sl.title}</title><style>${css}</style></head>
<body class="${sl.light ? 'light' : ''}"><h1>${sl.title}</h1><div class="brand"><i class="mark"></i>DiagramTeX</div>
<div class="shot" style="left:${left}px;top:${top}px;width:${c.w}px;height:${c.h}px">${c.html}</div>${inset}</body></html>`;
  const name = `${String(i + 1).padStart(2, '0')}-${sl.file.replace(/^f\d+b?-/, '')}`;
  fs.writeFileSync(path.join(DIR, 'pages', name + '.html'), html);
  return { name, title: sl.title };
});
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(pages.map(p => ({ file: p.name + '.png', title: p.title })), null, 2));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const p of pages) {
  await page.goto('file://' + path.join(DIR, 'pages', p.name + '.html'));
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
  const bad = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const out = [...document.querySelectorAll('h1,.brand,.shot,.inset-wrap')].filter(e => r(e).right > 1920 || r(e).bottom > 1080).map(e => e.className || e.tagName);
    if (r(document.querySelector('h1')).right > r(document.querySelector('.brand')).left - 24) out.push('title runs into brand');
    if (r(document.querySelector('h1')).bottom > r(document.querySelector('.shot')).top - 12) out.push('title overlaps shot');
    return out;
  });
  if (bad.length) console.log('!', p.name, bad);
  await page.screenshot({ path: path.join(DIR, 'final', p.name + '.png') });
  console.log('✓', p.name);
}
await browser.close();
