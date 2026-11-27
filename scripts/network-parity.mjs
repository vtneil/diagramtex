// Network parity (offline, never CI): every tikz-network example in ext/tikz-network-manual/ (the package manual's
// listings, extracted from TeX Live's doc/latex/tikz-network with its data/ folder) drawn by the Network block and by
// pdfLaTeX, at the same scale with registration dots, scored for shape (tests/ink-match.js: ink of the other within
// r px) and for colour (mean RGB difference where either has ink).
//
//   node scripts/network-parity.mjs            every example
//   node scripts/network-parity.mjs m04        examples whose name contains "m04"
//   node scripts/network-parity.mjs --dist     against the production build
//
// Writes artifacts/network-parity/report.html (app | pdfLaTeX | overlay, worst first) and results.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serve } from '../tests/chrome.mjs';
import { launchBrowser } from '../tests/browser.mjs';
import { prepare, APP_DIR, ROOT, positional, flag } from '../tests/args.mjs';

const DIR = path.join(ROOT, 'ext', 'tikz-network-manual'), OUT = path.join(ROOT, 'artifacts', 'network-parity'), CACHE = path.join(OUT, 'cache');
const filter = positional[0] || '';
const fixtures = fs.readdirSync(DIR).filter((f) => f.endsWith('.tex') && f.includes(filter)).sort().map((f) => ({ name: f.slice(0, -4), code: fs.readFileSync(path.join(DIR, f), 'utf8') }));
if (!fixtures.length) throw new Error('no examples match ' + filter);
fs.mkdirSync(CACHE, { recursive: true });

// the listing as the block's code: a whole document's body (what is set before the picture stays before it)
function picture(code) {
  const at = code.indexOf('\\begin{document}'), body = at < 0 ? code : code.slice(at + '\\begin{document}'.length);
  return body.replace(/\\end\{document\}[\s\S]*$/, '').trim();
}
function page(pic, frame) {
  const [x0, y0, x1, y1] = frame, end = pic.lastIndexOf('\\end{tikzpicture}');
  // the dots first (a \\clip in the picture would hide them), the box last
  const dots = `\\fill[reset cm,black] (${x0}cm,${y0}cm) circle (0.04cm) (${x1}cm,${y1}cm) circle (0.04cm);`;
  const box = `\\pgfresetboundingbox\n\\path[reset cm,use as bounding box] (${x0 - 0.04}cm,${y0 - 0.04}cm) rectangle (${x1 + 0.04}cm,${y1 + 0.04}cm);`;
  const m = /\\begin\{tikzpicture\}(\[[^\]]*\])?/.exec(pic), head = pic.slice(0, m.index + m[0].length), body = pic.slice(m.index + m[0].length, end);
  return `\\documentclass[border=0pt]{standalone}\n\\usepackage{tikz-network}\n\\graphicspath{{data/}}\n\\begin{document}\n${head}\n${dots}\n\\begin{scope}\n${body}\n\\end{scope}\n${box}\n\\end{tikzpicture}\n\\end{document}\n`;
}
function compile(tex) {
  const key = crypto.createHash('sha256').update(tex).digest('hex').slice(0, 20), png = path.join(CACHE, key + '.png');
  if (fs.existsSync(png) && !flag('--no-cache')) return png;
  const work = fs.mkdtempSync(path.join(CACHE, 'run-'));
  try {
    fs.writeFileSync(path.join(work, 'f.tex'), tex);
    fs.cpSync(path.join(DIR, 'data'), path.join(work, 'data'), { recursive: true });
    try { execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', 'f.tex'], { cwd: work, stdio: 'pipe', timeout: 60000 }); }
    catch (e) { throw new Error('pdflatex failed:\n' + (fs.existsSync(path.join(work, 'f.log')) ? fs.readFileSync(path.join(work, 'f.log'), 'utf8').split('\n').filter((l) => /^!|^l\.\d/.test(l)).slice(0, 8).join('\n') : e.message)); }
    execFileSync('gs', ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=png16m', '-r254', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-sOutputFile=' + png, path.join(work, 'f.pdf')], { stdio: 'pipe', timeout: 60000 });
    return png;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf' };
const filesOf = (names) => Object.fromEntries(names.map((n) => {
  const f = [n, n + '.png', n + '.jpg', n + '.pdf'].map((x) => path.join(DIR, x)).find((x) => fs.existsSync(x));
  if (!f) return null;
  const ext = path.extname(f).slice(1).toLowerCase();
  return [n, ext === 'csv' ? fs.readFileSync(f, 'utf8') : `data:${MIME[ext] || 'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`];
}).filter(Boolean));

await prepare();
const server = await serve(APP_DIR), results = [];
const b = await launchBrowser('chromium', `http://127.0.0.1:${server.port}/`);
try {
  await b.page.evaluate(fs.readFileSync(path.join(ROOT, 'tests', 'ink-match.js'), 'utf8'));
  for (const fx of fixtures) {
    const pic = picture(fx.code);
    const names = await b.page.evaluate((src) => TD.network.dataFiles(src), pic);
    const files = filesOf(names);
    const res = { name: fx.name };
    try {
      const imp = await b.page.evaluate(({ src, files }) => {
        const s = { ...TD.TYPES.network.create({ x: 0, y: 0 }), id: 'np', src, files };
        const L = TD.network.layout(s);
        // the picture's origin at the canvas origin, as an import puts it
        s.x = L.bb.x; s.y = L.bb.y;
        window.__np = s;
        const CM = TD.PX_PER_CM, fl = (v) => Math.floor(v * 2) / 2, ce = (v) => Math.ceil(v * 2) / 2, bb = L.bb;
        return { warnings: L.warnings, frame: [fl(bb.x / CM) - 1, fl(-(bb.y + bb.h) / CM) - 1, ce((bb.x + bb.w) / CM) + 1, ce(-bb.y / CM) + 1] };
      }, { src: pic, files });
      Object.assign(res, imp);
      const ref = compile(page(pic, imp.frame));
      const scored = await b.page.evaluate(async ({ frame, ref }) => {
        const CM = TD.PX_PER_CM, [x0, y0, x1, y1] = frame;
        const dot = (x, y) => ({ id: 'reg' + x + y, type: 'dot', cx: x * CM, cy: -y * CM, r: 0.04 * CM, color: '#000000', opacity: 1 });
        const list = [window.__np, dot(x0, y0), dot(x1, y1)];
        for (let n = 0; ; n++) {
          try { TD.app.shapesSvg(list, 4, false); await TD.math.whenReady(); var blob = await TD.app.pngOf(list, 254, false); break; }
          catch (e) { if (n > 40 || !/render/i.test(e.message)) throw e; await new Promise((q) => setTimeout(q, 100)); }
        }
        const url = (bl) => new Promise((q) => { const f = new FileReader(); f.onload = () => q(f.result); f.readAsDataURL(bl); });
        const app = await url(blob);
        // colour: both rasters at the reference's size, mean RGB difference over pixels where either has ink
        const load = (s) => new Promise((q, j) => { const i = new Image(); i.onload = () => q(i); i.onerror = j; i.src = s; });
        const [A, R] = await Promise.all([load(app), load(ref)]);
        const W = R.width, H = R.height, px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, -Math.round((img.width - W) / 2), -Math.round((img.height - H) / 2)); return g.getImageData(0, 0, W, H).data; };
        const a = px(A), r = px(R);
        let sum = 0, n = 0;
        for (let i = 0; i < a.length; i += 4) {
          const ink = (d) => d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245;
          if (!ink(a) && !ink(r)) continue;
          sum += (Math.abs(a[i] - r[i]) + Math.abs(a[i + 1] - r[i + 1]) + Math.abs(a[i + 2] - r[i + 2])) / 3; n++;
        }
        return { app, score: await window.inkMatchExact(ref, blob), colour: n ? 1 - sum / n / 255 : 1, size: [A.width, A.height, W, H] };
      }, { frame: imp.frame, ref: 'data:image/png;base64,' + fs.readFileSync(ref).toString('base64') });
      Object.assign(res, scored.score, { colour: scored.colour, size: scored.size });
      fs.mkdirSync(path.join(OUT, 'png'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'png', fx.name + '.app.png'), Buffer.from(scored.app.split(',')[1], 'base64'));
      fs.copyFileSync(ref, path.join(OUT, 'png', fx.name + '.tex.png'));
      if (scored.score.overlay) { fs.writeFileSync(path.join(OUT, 'png', fx.name + '.cmp.png'), Buffer.from(scored.score.overlay.split(',')[1], 'base64')); delete res.overlay; }
    } catch (e) { res.error = String(e.message || e); }
    results.push(res);
    console.log(`${fx.name}: ${res.error ? 'ERROR ' + res.error.split('\n').slice(0, 3).join(' | ') : `≤0.2mm ${pc(res.r2)} · ≤0.5mm ${pc(res.r5)} · colour ${pc(res.colour)}`}${res.warnings?.length ? ' · ' + res.warnings.join('; ') : ''}`);
  }
} finally { await b.close(); server.close(); }
function pc(v) { return v == null ? '-' : (100 * v).toFixed(1) + '%'; }
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (f) => fs.existsSync(f) ? `<img alt="" src="png/${path.basename(f)}">` : '';
const rank = (r) => (r.error ? -1 : Math.min(r.r2 ?? 0, r.colour ?? 0));
const sorted = [...results].sort((a, b) => rank(a) - rank(b));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Network parity</title>
<style>body{font:14px system-ui;margin:24px}article{margin:24px 0;border-top:1px solid #ccc}div{display:flex;gap:12px;flex-wrap:wrap}img{max-width:460px;border:1px solid #ddd}pre{font-size:12px;white-space:pre-wrap}</style>
<h1>Network parity: app vs pdfLaTeX (worst first)</h1>${sorted.map((r) => `<article><h2>${esc(r.name)} · ≤0.2mm ${pc(r.r2)} · ≤0.5mm ${pc(r.r5)} · colour ${pc(r.colour)}</h2><p>${esc(r.error || (r.warnings || []).join('; '))}</p>
<div>${img(path.join(OUT, 'png', r.name + '.app.png'))}${img(path.join(OUT, 'png', r.name + '.tex.png'))}${img(path.join(OUT, 'png', r.name + '.cmp.png'))}</div>
<details><summary>source</summary><pre>${esc(fixtures.find((f) => f.name === r.name).code)}</pre></details></article>`).join('')}`);
const ok = results.filter((r) => !r.error);
console.log(`\n${results.length} examples · ${results.length - ok.length} errors · mean ≤0.2mm ${pc(ok.reduce((a, r) => a + (r.r2 || 0), 0) / (ok.length || 1))} · mean colour ${pc(ok.reduce((a, r) => a + (r.colour || 0), 0) / (ok.length || 1))} · report ${path.join(OUT, 'report.html')}`);
