// DiagramTeX test runner: loads the app (public/) in isolated Chromium, WebKit AND Firefox profiles, runs the suites in
// tests/suites/ inside the page, compares golden files and compiles the LaTeX the tests hand over with pdflatex.
//
//   node tests/run.mjs                 run everything
//   node tests/run.mjs import          only tests whose name contains "import"
//   node tests/run.mjs --webkit        run only WebKit (also --chromium or --firefox)
//   node tests/run.mjs --chromium --update        rewrite golden files from the current output (review the diff!)
//   node tests/run.mjs --no-tex        skip the pdflatex compiles
//   node tests/run.mjs --no-cache      compile every document again instead of trusting the pdflatex cache
//   node tests/run.mjs --dist          test the production build in dist/ (run node scripts/build.js first);
//                                      the bare `dist` works too and is never taken as a filter
//
// A golden file a test asks for that does not exist yet fails the test unless --update is given. A filter that matches
// no test fails the run. An unfiltered run lists golden files no test refers to any more.
//
// Exit code 0 when every test passed. Install Playwright browsers; CHROME=/path optionally selects Chrome.
// Compiling LaTeX needs pdflatex on PATH (use --no-tex when unavailable).
import './localization.mjs';
import './console-errors.test.mjs';
import './qc-span.mjs';
import './tex-groups.mjs';
import './editor-stage.mjs';
import './circuit-wires.mjs';
import './canvas-grid.mjs';
import './plane-grid.mjs';
import './smart-snap.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers, BROWSER_NAMES } from './browser.mjs';
import { runBrowserUI } from './browser-ui.mjs';
import { ROOT, APP_DIR, args, positional, flag, prepare } from './args.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FLAGS = ['--update', '--no-tex', '--no-cache', '--dist', ...BROWSER_NAMES.map(name => '--' + name)];
if (flag('--update') && !flag('--chromium')) throw new Error('Update shared goldens with --chromium --update, then verify all browsers');
const browsers = testBrowsers(args);
const unknown = args.filter((a) => a.startsWith('--') && !FLAGS.includes(a));
if (unknown.length) { console.error(`unknown option ${unknown.join(' ')} (known: ${FLAGS.join(' ')})`); process.exit(2); }
if (positional.length > 1) { console.error(`one test filter at most, got: ${positional.join(' ')}`); process.exit(2); }
const UPDATE = flag('--update'), NOTEX = flag('--no-tex'), NOCACHE = flag('--no-cache');
const filter = positional[0] || '';
await prepare();
const GOLD = path.join(HERE, 'golden');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const fixtures = Object.fromEntries(walk(path.join(HERE, 'fixtures')).filter((f) => !path.basename(f).startsWith('.'))
  .map((f) => [path.relative(path.join(HERE, 'fixtures'), f), fs.readFileSync(f, 'utf8')]));
const suites = fs.readdirSync(path.join(HERE, 'suites')).filter((f) => f.endsWith('.js')).sort()
  .map((f) => fs.readFileSync(path.join(HERE, 'suites', f), 'utf8'));

// pdflatex, cached by the document and the pdflatex version (its first --version line, which names the TeX
// distribution), so unchanged documents are not compiled again until TeX itself changes. --no-cache ignores it.
const CACHE = path.join(os.tmpdir(), 'dtx-tex-cache');
fs.mkdirSync(CACHE, { recursive: true });
let TEXVERSION = '';
if (!NOTEX) {
  try { TEXVERSION = execFileSync('pdflatex', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim(); }
  catch (e) { TEXVERSION = 'pdflatex unavailable'; }
}
function compile(src, files, engine = 'pdflatex') {
  const h = crypto.createHash('sha1').update(TEXVERSION + '\0' + (engine === 'pdflatex' ? '' : engine + '\0') + src + (files ? '\0' + JSON.stringify(files) : '')).digest('hex');
  const ok = path.join(CACHE, h + '.ok');
  if (!NOCACHE && fs.existsSync(ok)) return Promise.resolve({ ok: true, cached: true });
  const dir = fs.mkdtempSync(path.join(CACHE, 'run-'));
  fs.writeFileSync(path.join(dir, 'doc.tex'), src);
  // files beside it (base64), with their times when given: [base64, seconds since 1970]
  for (const [name, v] of Object.entries(files || {})) {
    const f = path.join(dir, name), [b64, t] = Array.isArray(v) ? v : [v];
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    if (t) fs.utimesSync(f, t, t);
  }
  return new Promise((res) => {
    const p = spawn(engine, ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'doc.tex'], { cwd: dir });
    let log = ''; p.stdout.on('data', (d) => { log += d; });
    p.on('error', (e) => res({ ok: false, log: engine + ': ' + e.message }));
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

const srv = await serve(APP_DIR);
const results = [], logs = [], warnings = [], expectedConsole = [];
try {
  for (const name of browsers) {
    const b = await launchBrowser(name, `http://127.0.0.1:${srv.port}/`);
    console.log('Running shared suites in ' + name);
    try {
      await b.page.exposeFunction('__testInlineHandlerCsp', (phase, test) => {
        if (phase === 'begin') b.consoleErrors.beginInlineHandlerCsp(test);
        else if (phase === 'end') b.consoleErrors.endInlineHandlerCsp(test);
        else throw new Error('Unknown console expectation phase');
      });
      const ui = await runBrowserUI(b.page, filter);
      results.push(...ui.map(result => ({ ...result, browser: name, name: name + ': ' + result.name })));
      await b.ev(fs.readFileSync(path.join(HERE, 'lib.js'), 'utf8') + `\nT.fixtures = ${JSON.stringify(fixtures)};\nreturn true;`);
      // the parity figures (KIT) are shared with docs/latex-parity/tools
      const PT = path.join(ROOT, 'docs/latex-parity/tools');
      await b.ev(['harness.js', 'scenes.js', 'scenes-kit.js'].map((f) => fs.readFileSync(path.join(PT, f), 'utf8')).join('\n;\n') + '\nwindow.KIT = KIT; window.KIT_OPT = KIT_OPT; return true;');
      for (const s of suites) await b.ev(s + '\nreturn true;');
      const run = await b.ev(`return await T.run(${JSON.stringify(filter)});`);
      results.push(...run.map(result => ({ ...result, browser: name, name: name + ': ' + result.name })));
      expectedConsole.push(...b.consoleErrors.expected.map(item => name + ': ' + item.test + ': ' + item.message));
      logs.push(...b.logs.map(log => name + ': ' + log));
      warnings.push(...b.warnings.map(log => name + ': ' + log));
    } finally { await b.close(); }
  }
} finally { srv.close(); }

if (!results.length) { console.error(`no test matches the filter ${JSON.stringify(filter)}`); process.exit(1); }

let fail = 0, golds = 0, updated = 0;
const texJobs = [], referenced = new Set();
for (const r of results) {
  const errs = r.err ? [r.err] : [];
  for (const g of r.goldens) {
    golds++; referenced.add(path.normalize(g.name));
    const f = path.join(GOLD, g.name);
    const have = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (have === g.text) continue;
    if (UPDATE) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, g.text); updated++; if (have === null) console.log(`  new golden ${g.name}`); continue; }
    if (have === null) { errs.push(`golden ${g.name} does not exist (run with --${r.browser} --update to write it, then review it)`); continue; }
    const A = have.split('\n'), B = g.text.split('\n'); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    errs.push(`golden ${g.name} differs at line ${i + 1}\n    golden: ${A[i] ?? '(end)'}\n    now:    ${B[i] ?? '(end)'}`);
  }
  if (!NOTEX) for (const t of r.tex) texJobs.push({ r, errs, ...t });
  r.errs = errs;
}
const texRes = await pool(texJobs, Math.max(2, os.cpus().length - 2), (j) => compile(j.src, j.files, j.engine));
texJobs.forEach((j, i) => { if (!texRes[i].ok) j.errs.push(`LaTeX ${j.name} did not compile:\n${texRes[i].log.replace(/^/gm, '    ')}`); });
for (const r of results) {
  if (r.errs.length) { fail++; console.log(`✗ ${r.name}\n  ${r.errs.join('\n  ')}`); }
  else console.log(`✓ ${r.name} (${r.ms} ms)`);
}
if (expectedConsole.length) console.log('expected security rejections:\n  ' + expectedConsole.join('\n  '));
if (logs.length) console.log('page errors:\n  ' + logs.join('\n  '));
if (warnings.length) console.log(`page warnings (${warnings.length}, not failures):\n  ` + [...new Set(warnings)].join('\n  '));
// golden files no test produced (only known after an unfiltered run)
const orphans = filter || browsers.length < 2 ? [] : walk(GOLD).map((f) => path.relative(GOLD, f)).filter((f) => !path.basename(f).startsWith('.') && !referenced.has(path.normalize(f)));
if (orphans.length) console.log(`golden files no test refers to (delete them if they are stale):\n  ${orphans.join('\n  ')}`);
console.log(`\n${results.length - fail}/${results.length} passed · ${golds} golden files${updated ? ` (${updated} written)` : ''} · ${NOTEX ? 'compiles skipped' : `${texJobs.length} compiles (${texRes.filter((x) => x.cached).length} cached)`}`);
process.exit(fail || logs.length ? 1 : 0);
