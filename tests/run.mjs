// DiagramTeX test runner: loads the app (public/) in headless Chrome on a throwaway profile, runs the suites in
// tests/suites/ inside the page, compares golden files and compiles the LaTeX the tests hand over with pdflatex.
//
//   node tests/run.mjs                 run everything
//   node tests/run.mjs import          only tests whose name contains "import"
//   node tests/run.mjs --update        rewrite golden files from the current output (review the diff!)
//   node tests/run.mjs --no-tex        skip the pdflatex compiles
//
// Exit code 0 when every test passed. Needs Chrome (or CHROME=/path) and, for compiles, pdflatex on PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { serve, launch } from './chrome.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update'), NOTEX = args.includes('--no-tex');
const filter = args.find((a) => !a.startsWith('--')) || '';
const GOLD = path.join(HERE, 'golden');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const fixtures = Object.fromEntries(walk(path.join(HERE, 'fixtures')).filter((f) => !path.basename(f).startsWith('.'))
  .map((f) => [path.relative(path.join(HERE, 'fixtures'), f), fs.readFileSync(f, 'utf8')]));
const suites = fs.readdirSync(path.join(HERE, 'suites')).filter((f) => f.endsWith('.js')).sort()
  .map((f) => fs.readFileSync(path.join(HERE, 'suites', f), 'utf8'));

// pdflatex, cached by content so unchanged documents are not compiled again
const CACHE = path.join(os.tmpdir(), 'dtx-tex-cache');
fs.mkdirSync(CACHE, { recursive: true });
function compile(src) {
  const h = crypto.createHash('sha1').update(src).digest('hex');
  const ok = path.join(CACHE, h + '.ok');
  if (fs.existsSync(ok)) return Promise.resolve({ ok: true, cached: true });
  const dir = fs.mkdtempSync(path.join(CACHE, 'run-'));
  fs.writeFileSync(path.join(dir, 'doc.tex'), src);
  return new Promise((res) => {
    const p = spawn('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'doc.tex'], { cwd: dir });
    let log = ''; p.stdout.on('data', (d) => { log += d; });
    p.on('error', (e) => res({ ok: false, log: 'pdflatex: ' + e.message }));
    p.on('close', (code) => {
      fs.rmSync(dir, { recursive: true, force: true });
      if (code === 0) fs.writeFileSync(ok, '');
      // the first error line and its context
      const i = log.indexOf('\n!');
      res({ ok: code === 0, log: i >= 0 ? log.slice(i + 1, i + 900) : log.slice(-900) });
    });
  });
}
async function pool(items, n, fn) {
  const out = []; let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}

const srv = await serve(path.join(ROOT, 'public'));
const b = await launch(`http://127.0.0.1:${srv.port}/`);
let results;
try {
  await b.ev(fs.readFileSync(path.join(HERE, 'lib.js'), 'utf8') + `\nT.fixtures = ${JSON.stringify(fixtures)};\nreturn true;`);
  // the parity figures (KIT) are shared with docs/latex-parity/tools
  const PT = path.join(ROOT, 'docs/latex-parity/tools');
  await b.ev(['harness.js', 'scenes.js', 'scenes-kit.js'].map((f) => fs.readFileSync(path.join(PT, f), 'utf8')).join('\n;\n') + '\nwindow.KIT = KIT; window.KIT_OPT = KIT_OPT; return true;');
  for (const s of suites) await b.ev(s + '\nreturn true;');
  results = await b.ev(`return await T.run(${JSON.stringify(filter)});`);
} finally { b.close(); srv.close(); }

let fail = 0, golds = 0, updated = 0;
const texJobs = [];
for (const r of results) {
  const errs = r.err ? [r.err] : [];
  for (const g of r.goldens) {
    golds++;
    const f = path.join(GOLD, g.name);
    const have = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (have === g.text) continue;
    if (UPDATE || have === null) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, g.text); updated++; if (have === null) console.log(`  new golden ${g.name}`); continue; }
    const A = have.split('\n'), B = g.text.split('\n'); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    errs.push(`golden ${g.name} differs at line ${i + 1}\n    golden: ${A[i] ?? '(end)'}\n    now:    ${B[i] ?? '(end)'}`);
  }
  if (!NOTEX) for (const t of r.tex) texJobs.push({ r, errs, ...t });
  r.errs = errs;
}
const texRes = await pool(texJobs, Math.max(2, os.cpus().length - 2), (j) => compile(j.src));
texJobs.forEach((j, i) => { if (!texRes[i].ok) j.errs.push(`LaTeX ${j.name} did not compile:\n${texRes[i].log.replace(/^/gm, '    ')}`); });
for (const r of results) {
  if (r.errs.length) { fail++; console.log(`✗ ${r.name}\n  ${r.errs.join('\n  ')}`); }
  else console.log(`✓ ${r.name} (${r.ms} ms)`);
}
if (b.logs.length) console.log('page errors:\n  ' + b.logs.join('\n  '));
console.log(`\n${results.length - fail}/${results.length} passed · ${golds} golden files${updated ? ` (${updated} written)` : ''} · ${NOTEX ? 'compiles skipped' : `${texJobs.length} compiles (${texRes.filter((x) => x.cached).length} cached)`}`);
process.exit(fail || b.logs.length ? 1 : 0);
