// Import parity: TikZ written by hand → TD.importLatex → the app's drawing, against pdflatex's drawing of the same
// source, at the same scale (100 px/cm). Both carry two registration dots at fixed page positions (drawn with
// `reset cm`, so no picture transform moves them), are cut to those dots and scored like
// docs/latex-parity/tools/match.py: the share of all ink pixels that have ink of the other picture within r px.
//
//   node tests/import-parity.mjs              every fixture in tests/import-parity/
//   node tests/import-parity.mjs edge         fixtures whose name contains "edge"
//   node tests/import-parity.mjs --no-cache   compile again instead of reusing artifacts/import-parity/cache
//   node tests/import-parity.mjs --report-only  write the report without failing on thresholds
//
// Each fixture is a .tex file holding one tikzpicture (and \usetikzlibrary lines above it). A first-line comment
// sets what it must reach: `% expect: native match>=0.95` (native: every statement becomes native objects;
// display: code may be kept, scored on what the canvas shows). Only fixtures written for this test belong here:
// the sources are compiled.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serve } from './chrome.mjs';
import { launchBrowser } from './browser.mjs';
import { prepare, APP_DIR, ROOT, positional, flag } from './args.mjs';

const DIR = path.join(ROOT, 'tests', 'import-parity'), OUT = path.join(ROOT, 'artifacts', 'import-parity'), CACHE = path.join(OUT, 'cache');
const filter = positional[0] || '';
const fixtures = fs.readdirSync(DIR).filter((f) => f.endsWith('.tex') && f.includes(filter)).sort().map((f) => {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8'), head = /^%\s*expect:\s*(.*)$/m.exec(code)?.[1] || '';
  return { name: f.slice(0, -4), code, mode: /\bdisplay\b/.test(head) ? 'display' : 'native', min: +(/match>=([\d.]+)/.exec(head)?.[1] ?? 0.95) };
});
if (!fixtures.length) throw new Error('no fixtures match ' + filter);
fs.mkdirSync(CACHE, { recursive: true });

// a standalone page: the fixture's libraries and picture, plus the registration dots at the frame's corners
const LIBS = /\\usetikzlibrary\{[^}]*\}|\\usepackage(?:\[[^\]]*\])?\{[^}]*\}|\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}|\\tikzset\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
function page(code, frame) {
  const pre = (code.match(LIBS) || []).filter((l) => !l.startsWith('\\tikzset')).join('\n');
  const pic = code.slice(code.indexOf('\\begin{tikzpicture}'));
  const end = pic.lastIndexOf('\\end{tikzpicture}');
  const [x0, y0, x1, y1] = frame;
  // the page is the frame: anything drawn outside it is cut off (and so scores as missing)
  const dots = `\\pgfresetboundingbox\n\\fill[reset cm,black] (${x0}cm,${y0}cm) circle (0.04cm) (${x1}cm,${y1}cm) circle (0.04cm);\n`
    + `\\path[reset cm,use as bounding box] (${x0 - 0.04}cm,${y0 - 0.04}cm) rectangle (${x1 + 0.04}cm,${y1 + 0.04}cm);`;
  const between = code.slice(0, code.indexOf('\\begin{tikzpicture}')).match(/\\tikzset\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g) || [];
  return `\\documentclass[border=0pt]{standalone}\n\\usepackage{tikz}\n${pre}\n\\begin{document}\n${between.join('\n')}\n${pic.slice(0, end)}\n${dots}\n\\end{tikzpicture}\n\\end{document}\n`;
}
function compile(tex) {
  const key = crypto.createHash('sha256').update(tex).digest('hex').slice(0, 20), png = path.join(CACHE, key + '.png');
  if (fs.existsSync(png) && !flag('--no-cache')) return png;
  const work = fs.mkdtempSync(path.join(CACHE, 'run-'));
  try {
    fs.writeFileSync(path.join(work, 'f.tex'), tex);
    try { execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', 'f.tex'], { cwd: work, stdio: 'pipe', timeout: 60000 }); }
    catch (e) { throw new Error('pdflatex failed:\n' + (fs.existsSync(path.join(work, 'f.log')) ? fs.readFileSync(path.join(work, 'f.log'), 'utf8').split('\n').filter((l) => /^!|^l\.\d/.test(l)).slice(0, 8).join('\n') : e.message)); }
    execFileSync('gs', ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=png16m', '-r254', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-sOutputFile=' + png, path.join(work, 'f.pdf')], { stdio: 'pipe', timeout: 60000 });
    return png;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

await prepare();
const server = await serve(APP_DIR), results = [];
const b = await launchBrowser('chromium', `http://127.0.0.1:${server.port}/`);
try {
  await b.page.evaluate(fs.readFileSync(path.join(import.meta.dirname, 'ink-match.js'), 'utf8'));
  for (const fx of fixtures) {
    // 1. import, and the frame: the imported drawing's box with a margin (cm, y up)
    const imp = await b.page.evaluate(({ code, mode }) => {
      const r = TD.importLatex(code), shapes = r.blocks.filter((q) => q.type === 'diagram').flatMap((q) => q.shapes);
      const drawable = shapes.filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
      const native = drawable.filter((s) => s.type !== 'tikz'), kept = drawable.filter((s) => s.type === 'tikz');
      const list = mode === 'native' ? native : drawable;
      window.__parity = list;
      const pts = list.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; });
      const bb = pts.length ? TD.bboxOf(pts, 0) : { x: 0, y: 0, w: 0, h: 0 }, CM = TD.PX_PER_CM;
      const fl = (v) => Math.floor(v * 2) / 2, ce = (v) => Math.ceil(v * 2) / 2;
      return { native: native.length, kept: kept.length, issues: [...new Set(kept.flatMap((s) => s.issues || []))],
        frame: [fl(bb.x / CM) - 1, fl(-(bb.y + bb.h) / CM) - 1, ce((bb.x + bb.w) / CM) + 1, ce(-bb.y / CM) + 1] };
    }, fx);
    const res = { name: fx.name, mode: fx.mode, min: fx.min, ...imp };
    try {
      // 2. pdflatex's drawing, and the app's with the same dots
      const ref = compile(page(fx.code, imp.frame));
      const scored = await b.page.evaluate(async ({ frame, ref }) => {
        const CM = TD.PX_PER_CM, [x0, y0, x1, y1] = frame;
        const dot = (x, y) => ({ id: 'reg' + x + y, type: 'dot', cx: x * CM, cy: -y * CM, r: 0.04 * CM, color: '#000000', opacity: 1 });
        const list = [...window.__parity, dot(x0, y0), dot(x1, y1)];
        for (let n = 0; ; n++) {
          try { TD.app.shapesSvg(list, 4, false); await TD.math.whenReady(); var blob = await TD.app.pngOf(list, 254, false); break; }
          catch (e) { if (n > 40 || !/render/i.test(e.message)) throw e; await new Promise((q) => setTimeout(q, 100)); }
        }
        const url = (bl) => new Promise((q) => { const f = new FileReader(); f.onload = () => q(f.result); f.readAsDataURL(bl); });
        return { app: await url(blob), score: await window.inkMatchExact(ref, blob) };
      }, { frame: imp.frame, ref: 'data:image/png;base64,' + fs.readFileSync(ref).toString('base64') });
      Object.assign(res, scored.score);
      fs.mkdirSync(path.join(OUT, 'png'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'png', fx.name + '.app.png'), Buffer.from(scored.app.split(',')[1], 'base64'));
      fs.copyFileSync(ref, path.join(OUT, 'png', fx.name + '.tex.png'));
      if (scored.score.overlay) { fs.writeFileSync(path.join(OUT, 'png', fx.name + '.cmp.png'), Buffer.from(scored.score.overlay.split(',')[1], 'base64')); delete res.overlay; }
    } catch (e) { res.error = String(e.message || e); }
    res.ok = !res.error && res.r5 >= fx.min && (fx.mode !== 'native' || res.kept === 0);
    results.push(res);
    console.log(`${res.ok ? '✓' : '✗'} ${fx.name}: ${res.error ? 'ERROR ' + res.error.split('\n')[0] : `≤0.2mm ${pc(res.r2)} · ≤0.5mm ${pc(res.r5)} · ≤1mm ${pc(res.r10)}`} · ${res.native} native, ${res.kept} kept${res.issues.length ? ' · ' + res.issues.slice(0, 3).join('; ') : ''}`);
  }
} finally { await b.close(); server.close(); }
function pc(v) { return v == null ? '-' : (100 * v).toFixed(1) + '%'; }
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (f) => fs.existsSync(f) ? `<img alt="" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">` : '';
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Import parity</title>
<style>body{font:14px system-ui;margin:24px}article{margin:24px 0;border-top:1px solid #ccc}div{display:flex;gap:12px;flex-wrap:wrap}img{max-width:420px;border:1px solid #ddd}pre{font-size:12px;white-space:pre-wrap}</style>
<h1>Import parity: app vs pdflatex</h1>${results.map((r) => `<article><h2>${r.ok ? '✓' : '✗'} ${esc(r.name)} · ≤0.5 mm ${pc(r.r5)} (min ${pc(r.min)}, ${r.mode})</h2><p>${esc(r.error || r.issues.join('; '))}</p>
<div>${img(path.join(OUT, 'png', r.name + '.app.png'))}${img(path.join(OUT, 'png', r.name + '.tex.png'))}${img(path.join(OUT, 'png', r.name + '.cmp.png'))}</div>
<details><summary>source</summary><pre>${esc(fixtures.find((f) => f.name === r.name).code)}</pre></details></article>`).join('')}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · mean ≤0.5mm ${pc(results.reduce((a, r) => a + (r.r5 || 0), 0) / results.length)} · report ${path.join(OUT, 'report.html')}`);
if (failed.length && !flag('--report-only')) process.exitCode = 1;
