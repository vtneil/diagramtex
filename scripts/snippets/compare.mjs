#!/usr/bin/env node
// The snippet corpus's comparison runner: an offline parity run, not a test (never in npm test or CI; see
// scripts/snippets/README.md). Each snippet goes into the app the way a paste would take it, is drawn at 100 px/cm
// and scored against LaTeX's drawing of the same snippet; the app's TikZ export is compiled in the container and
// scored too.
//
//   node scripts/snippets/compare.mjs [phase] [options]
//
//   phases   all (default): refs, render, score, export, report in turn
//            refs     draw the LaTeX references (the cases' PDFs) at 254 dpi, in the container (cached)
//            render   import and draw each case in the app (headless Chromium, -j at once), keep its PNG and export
//            score    score the app's PNGs against the references (worker threads)
//            export   compile the app's exports in the container, draw them and score them
//            report   REPORT.md and gallery.html in the run's folder
//   options  --set curated|raw   the curated cases (manifest.json) or every clean raw diagram (raw-diagrams.jsonl)
//            --split dev|heldout|all   tune on dev; report held-out once (raw cases outside the curated set count as dev)
//            --class math,tikz,lib  --lib tikz-cd,chemfig  --ids FILE  --sample N [--seed S]   which cases
//            --engine katex|temml   the app's maths engine    --run NAME   the run's folder (default set-split-engine)
//            -j N   browsers (and containers) at once    --timeout-ms MS   per case    --force   redo cached work
//            --retry-failed   render again the cases that timed out or failed in the runner
//            --no-kept-tex   draw code kept as written with the importer's approximation, not the in-browser pdfLaTeX
//            --export-shapes   write each export from the shapes (as a picture once edited is), not the source as imported
//                   (src/application/kept-preview.ts: its sandboxed WebAssembly engine reads only the app's TeX bundle)
//            --gallery N   cases in the gallery    --dist   use the production build in dist/
//            diff --base OTHER-RUN   this run against another, case by case: DIFF-<other>.md in this run's folder
//
// Output: ext/snippets/compare/runs/<run>/{render,score,export-score}.jsonl, app/, export/, overlay/, REPORT.md,
// gallery.html; the reference rasters are shared in ext/snippets/compare/refs/. Results are resumable: a phase
// skips the cases it has already done (by the PNG's or the source's hash) unless --force.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { prepare, APP_DIR, ROOT } from '../../tests/args.mjs';
import { serve } from '../../tests/chrome.mjs';
import { launchBrowser } from '../../tests/browser.mjs';

const { values: O, positionals } = parseArgs({ allowPositionals: true, allowNegative: true, options: {
  set: { type: 'string', default: 'curated' }, split: { type: 'string', default: 'dev' },
  class: { type: 'string' }, lib: { type: 'string' }, ids: { type: 'string' },
  sample: { type: 'string' }, seed: { type: 'string', default: '20261124' },
  engine: { type: 'string', default: 'katex' }, run: { type: 'string' }, browser: { type: 'string', default: 'chromium' },
  j: { type: 'string', short: 'j', default: String(Math.max(2, Math.min(8, Math.floor(os.availableParallelism() / 2)))) },
  'timeout-ms': { type: 'string', default: '120000' }, recycle: { type: 'string', default: '250' }, 'kept-tex': { type: 'boolean', default: true }, 'export-shapes': { type: 'boolean', default: false },
  force: { type: 'boolean', default: false }, base: { type: 'string' }, 'retry-failed': { type: 'boolean', default: false }, gallery: { type: 'string', default: '150' }, dist: { type: 'boolean', default: false },
} });
const PHASES = ['refs', 'render', 'score', 'export', 'report'], EXTRA = ['diff'];
const phase = positionals[0] || 'all';
if (phase !== 'all' && !PHASES.includes(phase) && !EXTRA.includes(phase)) throw new Error(`unknown phase ${phase}: one of all, ${[...PHASES, ...EXTRA].join(', ')}`);
if (!['curated', 'raw'].includes(O.set)) throw new Error('--set is curated or raw');
if (!['dev', 'heldout', 'all'].includes(O.split)) throw new Error('--split is dev, heldout or all');
if (!['katex', 'temml'].includes(O.engine)) throw new Error('--engine is katex or temml');
const J = Math.max(1, +O.j), TIMEOUT = Math.max(1000, +O['timeout-ms']), DPI = 254;

const EXT = path.join(ROOT, 'ext', 'snippets'), COMPARE = path.join(EXT, 'compare'), REFS = path.join(COMPARE, 'refs');
const RUN_NAME = O.run || `${O.set}-${O.split}-${O.engine}`;
if (!/^[\w.-]+$/.test(RUN_NAME)) throw new Error('--run: letters, digits, dot, dash and underscore only');
const RUN = path.join(COMPARE, 'runs', RUN_NAME);
for (const d of [REFS, RUN, path.join(RUN, 'app'), path.join(RUN, 'export'), path.join(RUN, 'overlay')]) fs.mkdirSync(d, { recursive: true });
const PY = 'python3', TOOLS = import.meta.dirname;

// the libraries that have a block of their own in the app: a case of one is "hit" when that block comes out
const OWN_BLOCK = { 'tikz-cd': ['cd'], circuitikz: ['cz'], quantikz: ['qc'], forest: ['forest'], 'tikz-timing': ['timing'],
  bytefield: ['bytefield'], 'karnaugh-map': ['kmap'], 'pgf-umlsd': ['umlsd'], 'pgf-umlcd': ['uml'], blochsphere: ['bloch'],
  xymatrix: ['xy'], chemfig: ['chemfig'], 'tikz-chemlab': ['chemlab'], 'tikz-feynman': ['feynman'], 'zx-calculus': ['zx'],
  'pgf-pie': ['pie'], pgfplots: ['plot'], 'tkz-euclide': ['geo2d'], automata: ['automata'], graphs: ['graph'] };
const PRIMITIVE = new Set(['line', 'curve', 'poly', 'region', 'rect', 'ellipse', 'ball', 'dot', 'arc', 'spring', 'text', 'coord']);

// ------------------------------------------------------------------ helpers
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function readJsonl(f) {
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const latest = (f) => new Map(readJsonl(f).map((r) => [r.id, r])); // later rows replace earlier ones
const append = (f, row) => fs.appendFileSync(f, JSON.stringify(row) + '\n');
const stratum = (c) => (c.class === 'lib' ? 'lib/' + c.lib : c.class);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(list, rnd) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function python(args) {
  const p = spawnSync(PY, ['-I', '-B', ...args], { stdio: 'inherit' }); // -B: no __pycache__ beside the scripts
  if (p.status !== 0) throw new Error(`${args[0]} exited ${p.status}`);
}
function appInfo() {
  const pkg = readJson(path.join(ROOT, 'package.json'), {});
  let commit = null, dirty = null;
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'public'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch { /* not a checkout */ }
  const version = /TD\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'src', 'domain', 'shapes.ts'), 'utf8'))?.[1] || pkg.version;
  return { version, commit, dirty, build: O.dist ? 'dist' : 'public' };
}

// ------------------------------------------------------------------ the cases
function selectCases() {
  const manifest = readJson(path.join(EXT, 'manifest.json'));
  if (!manifest) throw new Error('ext/snippets/manifest.json is missing: run curate.py final first');
  const curated = manifest.cases.map((c) => ({ ...c, tex: c.path, pdf: c.path.replace(/\.tex$/, '.pdf') }));
  let cases = curated;
  if (O.set === 'raw') {
    const split = new Map(curated.map((c) => [c.id, c.split]));
    cases = readJsonl(path.join(EXT, 'raw-diagrams.jsonl')).map((c) => ({ ...c, tex: c.tex_path, pdf: c.pdf_path, split: split.get(c.id) || 'dev' }));
  }
  if (O.split !== 'all') cases = cases.filter((c) => c.split === O.split);
  if (O.class) { const k = new Set(O.class.split(',')); cases = cases.filter((c) => k.has(c.class)); }
  if (O.lib) { const k = new Set(O.lib.split(',')); cases = cases.filter((c) => k.has(c.lib)); }
  if (O.ids) { const k = new Set(fs.readFileSync(O.ids, 'utf8').split(/\s+/).filter(Boolean)); cases = cases.filter((c) => k.has(c.id)); }
  if (O.sample) {
    // stratified by class/library, in proportion, at least 3 of each stratum
    const n = +O.sample, rnd = mulberry32(+O.seed), by = new Map();
    for (const c of cases) { const k = stratum(c); if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
    cases = [...by.values()].flatMap((g) => shuffle(g, rnd).slice(0, Math.max(Math.min(3, g.length), Math.round(n * g.length / cases.length))));
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ refs
function phaseRefs(cases) {
  const list = path.join(RUN, '.refs.tsv');
  fs.writeFileSync(list, cases.map((c) => `${c.id}\t${c.pdf}`).join('\n') + '\n');
  log(`refs: ${cases.length} reference PDFs`);
  python([path.join(TOOLS, 'raster.py'), '--root', EXT, '--list', list, '--out', REFS, '-j', String(Math.max(J, 8)), ...(O.force ? ['--force'] : [])]);
}

// ------------------------------------------------------------------ render (in the page)
// A picture goes through the importer as the Import dialog takes it: the whole document, or for a bare block
// (\begin{tikzcd}, \chemfig, \xymatrix …) the block as one node of a picture with the preamble as the dialog's
// definitions (what a paste does with a block, takeText in src/application/app.ts). How a paste would read the
// snippet (TD.pasteIn.kind) is recorded beside it: a picture it reads as text or a formula is a paste misread. A
// formula is set in a text object as LaTeX set it. Runs in the page, so it must not use anything from outside.
async function caseInPage({ cls, tex, dpi, keptTex, settleMs, fromShapes }) {
  const t0 = performance.now(), out = { warnings: [], issues: [], math_errors: [] };
  const sleep = (ms) => new Promise((q) => setTimeout(q, ms));
  const finite = (s) => { try { const b = TD.bbox(s); return [b.x, b.y, b.w, b.h].every(Number.isFinite); } catch { return false; } };
  const doc = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(tex);
  const pre = doc ? tex.slice(0, doc.index) : '', body = doc ? doc[1].trim() : tex.trim();
  const P = TD.pasteIn;
  const mathErrors = (text) => {
    const errs = [];
    // the formulas as the app reads them (TD.textSegments: a $ inside \text{…} stays in its formula)
    for (const line of String(text).split('\n')) for (const seg of TD.textSegments(line)) {
      if (!seg.math) continue;
      try { TD.math.synchronous(() => TD.math.render(TD.mathTex(seg), { throwOnError: true })); } catch (e) { errs.push(String(e.message || e).slice(0, 300)); }
    }
    return errs;
  };
  const textShape = (text) => { const s = TD.TYPES.text.create({ x: 0, y: 0 }, TD.app.defaults()); s.id = 'cmp-text'; s.text = text; return s; };
  const imported = (src, opt) => {
    const r = TD.importLatex(src, opt), diagrams = r.blocks.filter((b) => b.type === 'diagram');
    const shapes = diagrams.flatMap((b) => b.shapes || []), drawable = shapes.filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
    return { r, diagrams, shapes, drawable, native: drawable.filter((s) => s.type !== 'tikz'), opaque: drawable.filter((s) => s.type === 'tikz') };
  };
  // the file's macros (page.macros): what an import of the snippet's preamble brings, as it would into an empty file
  const useMacros = (m) => { if (TD.app.setMacros) TD.app.setMacros(m || ''); };
  let shapes = [], list = [];
  if (cls === 'math') {
    useMacros(pre && TD.importLatex(pre + '\\begin{document}\\end{document}').macros);
    // the formula as LaTeX set it ($…$, or $\displaystyle …$ for a displayed one) in a text object, on one line as a
    // paste puts it (TD.pasteIn.asText): a text object's lines are lines of text, and $…$ does not run across them
    const one = body.replace(/\s*\n\s*/g, ' '), s = textShape(one);
    out.via = 'text';
    out.math_errors = mathErrors(one);
    out.status = out.math_errors.length ? 'math-error' : 'ok';
    shapes = list = [s];
  } else {
    const k = P.kind(body);
    out.paste_kind = k;
    // a block inside $…$ or \[…\] (\xymatrix) is still that block
    const inner = body.replace(/^\$\$?\s*([\s\S]*?)\s*\$\$?$/, '$1').replace(/^\\\[\s*([\s\S]*?)\s*\\\]$/, '$1');
    const block = k === 'block' ? body : k !== 'tex' && P.blockOf(inner) ? inner : null;
    let R = block ? imported(P.asPicture(block), { definitions: pre }) : imported(tex);
    out.via = block ? 'block' : 'document';
    useMacros(R.r.macros);
    // a block whose body reads as TikZ (\begin{tikzcd} with \draw in its options): the block route
    if (!R.drawable.length && !block && P.blockOf(inner)) { R = imported(P.asPicture(inner), { definitions: pre }); out.via = 'block-retry'; useMacros(R.r.macros); }
    // a paste would make a text object of it, or would not reach the block
    out.paste_misread = !['tex', 'block'].includes(k) || out.via === 'block-retry';
    out.warnings = [...new Set(R.r.warnings || [])].slice(0, 20);
    out.issues = [...new Set(R.opaque.flatMap((s) => s.issues || []))].slice(0, 20);
    // what a block's panel says it leaves out (the tree's "Not drawn: …"): not part of the status, so runs stay comparable
    const bw = [];
    for (const s of R.native) {
      const P = TD.panels?.[s.type];
      if (!P?.model) continue;
      try {
        const seen = new Set();
        const dig = (o, d) => {
          if (!o || typeof o !== 'object' || d > 6 || seen.has(o)) return;
          seen.add(o);
          if (Array.isArray(o.warnings)) bw.push(...o.warnings.map((w) => (typeof w === 'string' ? w : w?.text ?? w?.message ?? w?.fallback ?? JSON.stringify(w))));
          for (const v of Object.values(o)) dig(v, d + 1);
        };
        dig(P.model(s), 0);
      } catch { /* a panel that needs the page */ }
    }
    out.block_warnings = [...new Set(bw.map(String))].slice(0, 20);
    const invalid = R.native.filter((s) => !finite(s)).length;
    out.status = invalid ? 'invalid-geometry' : !R.drawable.length ? 'empty' : !R.native.length ? 'opaque' : R.opaque.length || out.warnings.length ? 'partial' : 'native';
    const textBlocks = R.r.blocks.filter((b) => b.type === 'text').length, kept = (R.r.kept || []).length;
    out.counts = { native: R.native.length, opaque: R.opaque.length, invalid, diagrams: R.diagrams.length, text_blocks: textBlocks, kept };
    // takeText places a clean result straight away; anything else opens the Import dialog
    out.paste_clean = !out.paste_misread && !!R.shapes.length && !kept && !(R.r.warnings || []).length && !textBlocks;
    out.types = R.native.reduce((o, s) => ((o[s.type] = (o[s.type] || 0) + 1), o), {});
    out.math_errors = [...new Set(R.drawable.flatMap((s) => (typeof s.text === 'string' ? mathErrors(s.text) : [])))].slice(0, 10);
    shapes = R.shapes; list = R.drawable;
    // in the scratch file, each picture's shapes grouped as an import groups them (groupPictures in src/application/app.ts):
    // kept code is compiled in its picture (src/application/kept-preview.ts)
    R.diagrams.forEach((b, i) => { if (b.shapes.length > 1) for (const x of b.shapes) { x.g = 'cmp' + i; delete x.gname; } });
    TD.app.state.doc.shapes = shapes;
  }
  list = list.filter(finite);
  let png = null;
  if (list.length) {
    // a picture larger than 6000 px at 100 px/cm is drawn at a lower resolution (the scorer brings both to one)
    const bb = TD.bboxOf(list.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 4);
    const side = Math.max(bb.w, bb.h) / TD.PX_PER_CM;
    out.dpi = side * dpi / 2.54 > 6000 ? Math.max(10, Math.floor(6000 * 2.54 / side)) : dpi;
    out.size_cm = [+(bb.w / TD.PX_PER_CM).toFixed(2), +(bb.h / TD.PX_PER_CM).toFixed(2)];
    if (keptTex && cls !== 'math' && TD.keptPreview) {
      // drawn once to start the compiles, then waited for
      TD.app.shapesSvg(list, 4, false);
      await TD.keptPreview.settled(settleMs);
      const st = list.filter((s) => s.type === 'tikz').map((s) => TD.keptPreview.status(s));
      out.kept_tex = { drawn: st.filter((x) => x.kind === 'drawn').length, editor: st.filter((x) => x.kind === 'editor').length,
        failed: st.filter((x) => x.kind === 'error').length, errors: [...new Set(st.filter((x) => x.kind === 'error').map((x) => x.message))].slice(0, 5),
        // still compiling when the wait ran out, or never started (the engine not loaded): a slow run, not the case
        unfinished: st.filter((x) => x.kind === 'compiling').length, idle: st.filter((x) => x.kind === 'none' || x.kind === 'offer').length };
    }
    for (let n = 0; ; n++) {
      try { TD.app.shapesSvg(list, 4, false); await TD.math.whenReady(); png = await TD.app.pngOf(list, out.dpi, false); break; }
      catch (e) { if (n > 80 || !/render/i.test(String(e.message))) { out.render_error = String(e.message || e).slice(0, 300); break; } await sleep(100); }
    }
  }
  out.png = png ? await new Promise((q) => { const f = new FileReader(); f.onload = () => q(f.result); f.readAsDataURL(png); }) : null;
  // (--export-shapes: every object as if edited, so it is written from what it is, not from its source; what the
  // import brought along for it, such as the preamble's definitions, stays)
  const written = fromShapes ? shapes.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)) : shapes;
  try { out.export = shapes.length ? TD.toTikz(written, { standalone: true }) : null; } catch (e) { out.export_error = String(e.message || e).slice(0, 300); }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

async function phaseRender(cases) {
  const done = latest(path.join(RUN, 'render.jsonl'));
  const info = appInfo();
  const todo = cases.filter((c) => O.force || !done.has(c.id) || (O['retry-failed'] && ['timeout', 'error'].includes(done.get(c.id).status)));
  log(`render: ${todo.length} to draw, ${cases.length - todo.length} done before (app ${info.version} ${info.commit}${info.dirty ? '+dirty' : ''}, ${O.engine}, ${J} browsers)`);
  if (!todo.length) return;
  fs.writeFileSync(path.join(RUN, 'meta.json'), JSON.stringify({ run: RUN_NAME, set: O.set, split: O.split, engine: O.engine,
    browser: O.browser, updated: new Date().toISOString(), app: info, dpi: DPI }, null, 1) + '\n');
  await prepare();
  const server = await serve(APP_DIR), origin = `http://127.0.0.1:${server.port}`;
  const open = async () => {
    const b = await launchBrowser(O.browser, origin + '/');
    // nothing in a snippet may reach the network: only the app's own server, data: and blob:
    await b.context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      return u.origin === origin || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort();
    });
    const engine = await b.page.evaluate(async ([e, keptTex]) => {
      TD.math.set(e); await TD.math.whenReady();
      // the cases' macros go into a scratch file of their own, drawn in Diagram mode
      TD.app.newDoc('corpus scratch'); TD.app.setMode('diagram');
      // code kept as written drawn by the in-browser pdfLaTeX (its bundle from the app's own server)
      if (keptTex) await TD.keptPreview.allow();
      return TD.math.engine;
    }, [O.engine, O['kept-tex']]);
    if (engine !== O.engine) throw new Error(`maths engine ${O.engine} did not load (got ${engine})`);
    return b;
  };
  let next = 0, finished = 0;
  const t0 = Date.now(), tally = {};
  const worker = async () => {
    let b = await open(), uses = 0;
    try {
      while (next < todo.length) {
        const c = todo[next++];
        const tex = fs.readFileSync(path.join(EXT, c.tex), 'utf8');
        let res, timer;
        try {
          res = await Promise.race([b.page.evaluate(caseInPage, { cls: c.class, tex, dpi: DPI, keptTex: O['kept-tex'], settleMs: Math.max(1000, TIMEOUT - 20000), fromShapes: O['export-shapes'] }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('case timeout')), TIMEOUT); })]);
        } catch (error) {
          res = { status: /case timeout/.test(error.message) ? 'timeout' : 'error', error: String(error.message || error).slice(0, 500) };
          await b.close().catch(() => {}); b = await open(); uses = 0;
        } finally { clearTimeout(timer); }
        if (++uses >= +O.recycle) { await b.close().catch(() => {}); b = await open(); uses = 0; }
        const { png, export: exported, ...rest } = res;
        const row = { id: c.id, class: c.class, lib: c.lib || null, split: c.split, source: c.source, tags: c.tags || [],
          engine: O.engine, app: info.commit + (info.dirty ? '+dirty' : ''), at: new Date().toISOString(), ...rest };
        const pngFile = path.join(RUN, 'app', c.id + '.png'), texFile = path.join(RUN, 'export', c.id + '.tex');
        if (png) fs.writeFileSync(pngFile, Buffer.from(png.split(',')[1], 'base64')); else fs.rmSync(pngFile, { force: true });
        row.png = !!png;
        if (exported) {
          const engine = /\\usepackage(\[[^\]]*\])?\{fontspec\}/.test(exported) ? 'xelatex' : 'pdflatex';
          fs.writeFileSync(texFile, `% DiagramTeX export of corpus case ${c.id} (compare run ${RUN_NAME})\n% engine: ${engine}\n${exported}`);
        } else fs.rmSync(texFile, { force: true });
        row.exported = !!exported;
        append(path.join(RUN, 'render.jsonl'), row);
        tally[row.status] = (tally[row.status] || 0) + 1;
        if (++finished % 50 === 0 || finished === todo.length) {
          const rate = finished / ((Date.now() - t0) / 1000);
          log(`render: ${finished}/${todo.length} (${rate.toFixed(1)}/s, ~${Math.round((todo.length - finished) / rate / 60)} min left) ${JSON.stringify(tally)}`);
        }
      }
    } finally { await b.close().catch(() => {}); }
  };
  try { await Promise.all(Array.from({ length: Math.min(J, todo.length) }, worker)); } finally { server.close(); }
}

// ------------------------------------------------------------------ scoring (worker threads)
async function scoreAll(jobs, onDone, threads = Math.max(2, os.availableParallelism() - 2)) {
  let next = 0;
  const one = () => new Promise((resolve) => {
    let w = null, current = null;
    const spawn = () => {
      w = new Worker(new URL('./ink-worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 4096 } });
      w.on('message', (m) => { onDone(current, m); feed(); });
      w.on('error', (e) => { if (current) onDone(current, { key: current.key, error: String(e.message || e) }); w = null; feed(); });
    };
    const feed = () => {
      if (next >= jobs.length) { if (w) w.terminate(); resolve(); return; }
      if (!w) spawn();
      current = jobs[next++];
      w.postMessage(current);
    };
    feed();
  });
  await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, one));
}

function refOf(id) {
  const r = readJson(path.join(REFS, id + '.json'));
  return r && r.status === 'ok' && fs.existsSync(path.join(REFS, id + '.png')) ? r : null;
}

async function phaseScore(cases) {
  const renders = latest(path.join(RUN, 'render.jsonl')), scored = latest(path.join(RUN, 'score.jsonl'));
  const jobs = [];
  let noRef = 0;
  for (const c of cases) {
    const r = renders.get(c.id);
    if (!r?.png) continue;
    const ref = refOf(c.id);
    if (!ref) { noRef++; continue; }
    const app = path.join(RUN, 'app', c.id + '.png'), appSha = sha(fs.readFileSync(app));
    const old = scored.get(c.id);
    if (!O.force && old && old.app_sha === appSha && old.ref_sha === ref.pdf_sha) continue;
    jobs.push({ key: c.id, ref: path.join(REFS, c.id + '.png'), app, refDpi: ref.dpi, appDpi: r.dpi || DPI, appSha, refSha: ref.pdf_sha });
  }
  log(`score: ${jobs.length} to score${noRef ? `, ${noRef} without a reference raster (run the refs phase)` : ''}`);
  let n = 0;
  const t0 = Date.now();
  await scoreAll(jobs, (job, m) => {
    append(path.join(RUN, 'score.jsonl'), { id: job.key, app_sha: job.appSha, ref_sha: job.refSha, ...(m.error ? { error: m.error } : m.result) });
    if (++n % 500 === 0 || n === jobs.length) log(`score: ${n}/${jobs.length} (${(n / ((Date.now() - t0) / 1000)).toFixed(1)}/s)`);
  });
}

// ------------------------------------------------------------------ export: compile, draw, score
/** the control sequence of the first "Undefined control sequence" in a TeX log: the last one on its l.N line */
function undefinedIn(logFile) {
  let text = '';
  try { text = fs.readFileSync(logFile, 'utf8'); } catch { return null; }
  const m = /Undefined control sequence\.\s*\n(?:[^\n]*\n)*?l\.\d+ ([^\n]*)/.exec(text);
  const cs = m ? m[1].match(/\\(?:[A-Za-z@]+|.)/g) : null;
  return cs ? cs[cs.length - 1] : null;
}
async function phaseExport(cases) {
  const renders = latest(path.join(RUN, 'render.jsonl'));
  const ids = cases.filter((c) => renders.get(c.id)?.exported && fs.existsSync(path.join(RUN, 'export', c.id + '.tex'))).map((c) => c.id);
  log(`export: ${ids.length} exports`);
  if (!ids.length) return;
  const compiled = path.join(RUN, 'export-compile'), drawn = path.join(RUN, 'export-png');
  const idList = path.join(RUN, '.export-ids.txt');
  fs.writeFileSync(idList, ids.join('\n') + '\n');
  python([path.join(TOOLS, 'compile.py'), '--dir', path.join(RUN, 'export'), '--out', compiled, '--ids', idList, '-j', String(Math.max(J, 8)), ...(O.force ? ['--force'] : [])]);
  const ok = ids.filter((id) => readJson(path.join(compiled, id + '.json'))?.status === 'ok');
  const list = path.join(RUN, '.export.tsv');
  fs.writeFileSync(list, ok.map((id) => `${id}\t${id}.pdf`).join('\n') + '\n');
  python([path.join(TOOLS, 'raster.py'), '--root', compiled, '--list', list, '--out', drawn, '-j', String(Math.max(J, 8)), ...(O.force ? ['--force'] : [])]);
  const old = latest(path.join(RUN, 'export-score.jsonl')), jobs = [], rows = new Map();
  for (const id of ids) {
    const comp = readJson(path.join(compiled, id + '.json')) || { status: 'not-run' }, ex = readJson(path.join(drawn, id + '.json'));
    const row = { id, tex_sha: comp.tex_sha || null, compile: comp.status, errors: (comp.errors || []).slice(0, 3), missing_file: comp.missing_file || null };
    if (comp.status === 'error' && comp.undefined) row.undefined_cs = undefinedIn(path.join(compiled, id + '.log'));
    const prev = O.force ? null : old.get(id);
    if (comp.status !== 'ok' || ex?.status !== 'ok') {
      if (ex && ex.status !== 'ok') row.raster = ex.status;
      if (!prev || ['tex_sha', 'compile', 'raster', 'undefined_cs'].some((k) => prev[k] !== row[k])) rows.set(id, row);
      continue;
    }
    const exPng = path.join(drawn, id + '.png'), exSha = ex.pdf_sha, ref = refOf(id), app = path.join(RUN, 'app', id + '.png');
    const appSha = fs.existsSync(app) ? sha(fs.readFileSync(app)) : null;
    if (prev && prev.ex_sha === exSha && prev.ref_sha === (ref?.pdf_sha || null) && prev.app_sha === appSha) continue;
    rows.set(id, { ...row, ex_sha: exSha, ref_sha: ref?.pdf_sha || null, app_sha: appSha });
    // B: the export against LaTeX's drawing of the snippet; C: the export against the app's own picture
    if (ref) jobs.push({ key: id + ' B', ref: path.join(REFS, id + '.png'), app: exPng, refDpi: ref.dpi, appDpi: ex.dpi });
    if (appSha) jobs.push({ key: id + ' C', ref: app, app: exPng, refDpi: renders.get(id).dpi || DPI, appDpi: ex.dpi });
  }
  log(`export: ${ok.length}/${ids.length} compiled; ${jobs.length} scores to compute`);
  await scoreAll(jobs, (job, m) => { const [id, k] = job.key.split(' '); rows.get(id)[k] = m.error ? { error: m.error } : m.result; });
  for (const row of rows.values()) append(path.join(RUN, 'export-score.jsonl'), row);
}

// ------------------------------------------------------------------ report
const DRAWN_STATUS = new Set(['native', 'partial', 'opaque']);
/** drawn: an image with ink (a kept picture whose preview is a blank placeholder was not drawn) */
const drawnOf = (c, r, s) => !!r?.png && !(s?.ink && !s.ink.app) && (c.class === 'math' ? r.status === 'ok' : DRAWN_STATUS.has(r.status));
/** end to end: r5, and 0 for a case the app could not draw */
const e2eOf = (c, r, s) => (drawnOf(c, r, s) && s?.r5 != null ? s.r5 : 0);
const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const pc = (v, d = 0) => (v == null ? '–' : (100 * v).toFixed(d) + '%');
const num = (v, d = 2) => (v == null ? '–' : v.toFixed(d));
// an error message without its position, so the same failure counts once: and the command it names, if any
function errorKey(e) {
  return String(e).replace(/^(KaTeX|Temml) parse error: /, '').replace(/ at position \d+[\s\S]*$/, '').replace(/^s\.tex:\d+: /, '')
    .replace(/^[^\s:]+\.(sty|tex|cls|def|code\.tex):\d+: /, '$1: ').replace(/\s+/g, ' ').slice(0, 140);
}
// importer warnings that name a coordinate or quote a stretch of path text count as one kind each
function warnKey(w) {
  const t = String(w);
  let m;
  if (/^Unknown path text “/.test(t)) return 'Unknown path text “…”';
  if ((m = /^Unsupported coordinate \(([\s\S]*)\)$/.exec(t))) return /^[\w\s.-]+$/.test(m[1]) ? 'Unsupported coordinate (a name: (A), (b1) …)' : 'Unsupported coordinate (an expression)';
  if ((m = /^Unresolved pic \(\s*([\w ]*?)\s*(=|\))/.exec(t))) return `Unresolved pic (${m[1]}=…)`;
  if ((m = /^Unresolved transform (\w+)/.exec(t))) return `Unresolved transform ${m[1]}=…`;
  return t;
}
function count(list) { const m = new Map(); for (const k of list) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }

async function phaseReport(cases) {
  const renders = latest(path.join(RUN, 'render.jsonl')), scores = latest(path.join(RUN, 'score.jsonl')), exports = latest(path.join(RUN, 'export-score.jsonl'));
  const meta = readJson(path.join(RUN, 'meta.json'), {});
  const rows = cases.map((c) => ({ c, r: renders.get(c.id), s: scores.get(c.id), x: exports.get(c.id) })).filter((q) => q.r);
  const missing = cases.length - rows.length;
  const rendered = (q) => drawnOf(q.c, q.r, q.s);
  const r5 = (q) => (q.s && q.s.r5 != null ? q.s.r5 : null);
  // end to end: a case the app could not draw scores 0
  const e2e = (q) => e2eOf(q.c, q.r, q.s);
  const hit = (q) => { const want = OWN_BLOCK[q.c.lib]; return want ? want.some((t) => q.r.types?.[t]) : null; };
  const statusCols = ['native', 'partial', 'opaque', 'ok', 'math-error', 'empty', 'invalid-geometry', 'error', 'timeout'];
  const groups = (key) => { const m = new Map(); for (const q of rows) { const k = key(q); if (!m.has(k)) m.set(k, []); m.get(k).push(q); } return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); };
  const line = (name, qs) => {
    const st = count(qs.map((q) => q.r.status)), stm = Object.fromEntries(st);
    const sc = qs.map(r5).filter((v) => v != null), fit = qs.map((q) => q.s?.fit).filter((v) => v != null);
    const hits = qs.map(hit).filter((v) => v != null), clean = qs.map((q) => q.r.paste_clean).filter((v) => v != null);
    const scale = qs.map((q) => (q.s?.scale ? Math.sqrt(q.s.scale[0] * q.s.scale[1]) : null)).filter((v) => v != null);
    const xs = qs.filter((q) => q.x), xok = xs.filter((q) => q.x.compile === 'ok'), xb = xs.map((q) => q.x.B?.r5).filter((v) => v != null);
    return `| ${name} | ${qs.length} | ${statusCols.filter((k) => stm[k]).map((k) => `${k} ${stm[k]}`).join(', ')} | ${pc(qs.filter(rendered).length / qs.length)} | `
      + `${hits.length ? pc(hits.filter(Boolean).length / hits.length) : '–'} | ${clean.length ? pc(clean.filter(Boolean).length / clean.length) : '–'} | `
      + `${num(median(sc))} | ${num(mean(qs.map(e2e)))} | ${sc.length ? pc(sc.filter((v) => v >= 0.9).length / sc.length) : '–'} | ${num(median(fit))} | ${num(median(scale))} | `
      + `${xs.length ? pc(xok.length / xs.length) : '–'} | ${num(median(xb))} |`;
  };
  const head = '| | cases | status | drawn | own block | pastes clean | r5 median | r5 end-to-end | r5 ≥ 0.9 | fit median | size ratio | export compiles | export r5 |\n|---|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|';
  const md = [];
  const apps = count(rows.map((q) => q.r.app)).map(([k, v]) => `${k} (${v})`).join(', ');
  md.push(`# Snippet corpus: app vs LaTeX (${RUN_NAME})`, '',
    `${rows.length} cases of ${cases.length} selected (${O.set}, split ${O.split}${O.class ? ', class ' + O.class : ''}${O.lib ? ', lib ' + O.lib : ''}${O.sample ? ', sample ' + O.sample : ''})`
    + `${missing ? `; ${missing} not rendered yet` : ''}. Maths engine ${meta.engine || O.engine}; app ${apps}; references ${readJson(path.join(EXT, 'manifest.json'), {}).compiler_image || ''}.`, '',
    'How to read this: **drawn** = the app drew something (a formula without an engine error; a picture with native objects or code it kept). '
    + '**r5** = share of ink (both pictures) within 0.5 mm of the other\'s, at the same scale (100 px/cm), after the best shift; '
    + '**end-to-end** counts a case the app could not draw as 0. **fit** = the same at 1% tolerance after fitting the app\'s picture to the reference\'s size; '
    + '**size ratio** = app ink box / LaTeX ink box (geometric mean of width and height). **own block** = a library with a block of its own came out as that block. '
    + '**pastes clean** = a paste would place it straight away (no Import dialog). **export** = the app\'s TikZ export compiled with LaTeX and scored against the reference (r5).', '');
  md.push('## By class', '', head, line('**all**', rows), ...groups((q) => q.c.class).map(([k, qs]) => line(k, qs)));
  if (O.split === 'all') md.push(...groups((q) => q.c.split).map(([k, qs]) => line('split ' + k, qs)));
  md.push('', '## Libraries', '', head, ...groups((q) => q.c.lib || '').filter(([k]) => k).map(([k, qs]) => line(k, qs)));
  md.push('', '## By source', '', head, ...groups((q) => q.c.source).map(([k, qs]) => line(k, qs)));
  // maths
  const maths = rows.filter((q) => q.c.class === 'math');
  if (maths.length) {
    const own = maths.filter((q) => q.c.tags.includes('user-macros')), plain = maths.filter((q) => !q.c.tags.includes('user-macros'));
    md.push('', '## Maths', '', `Formulas that use the document's own macros (${own.length}, tagged user-macros) can't render in a text object, which has only the engine's commands; they are listed apart.`, '',
      head, line('without user macros', plain), line('user macros', own), '', '### By feature (without user macros)', '', head);
    const tags = [...new Set(plain.flatMap((q) => q.c.tags))].sort();
    for (const t of tags) md.push(line(t, plain.filter((q) => q.c.tags.includes(t))));
    const errs = count(plain.flatMap((q) => [...new Set((q.r.math_errors || []).map(errorKey))]));
    md.push('', '### Engine errors (without user macros), cases per message', '', '| cases | message |', '|--:|---|', ...errs.slice(0, 40).map(([k, v]) => `| ${v} | \`${k.replace(/`/g, "'").replace(/\|/g, '\\|')}\` |`));
  }
  // diagrams
  const pics = rows.filter((q) => q.c.class !== 'math');
  if (pics.length) {
    const table = (title, list, n = 40) => md.push('', title, '', '| cases | |', '|--:|---|', ...count(list).slice(0, n).map(([k, v]) => `| ${v} | ${String(k).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)} |`));
    table('## Importer warnings, cases per warning', pics.flatMap((q) => [...new Set((q.r.warnings || []).map(warnKey))]));
    table('## Code kept as written: issues, cases per issue', pics.flatMap((q) => [...new Set(q.r.issues || [])]));
    table('## Block warnings (what a block leaves out), cases per warning', pics.flatMap((q) => [...new Set(q.r.block_warnings || [])]));
    table('## Formula errors in picture labels, cases per message', pics.flatMap((q) => [...new Set((q.r.math_errors || []).map(errorKey))]), 25);
    md.push('', '## Paste misreads', '', 'How TD.pasteIn.kind reads each picture: a picture it takes for text or a formula would become a text object on paste '
      + '(the Import dialog still imports it, which is what the scores above measure).', '');
    table('### Misread pictures, by library', pics.filter((q) => q.r.paste_misread).map((q) => `${q.r.paste_kind} → ${q.r.via} · ${q.c.lib || q.c.class}`), 40);
    table('## Render and runner errors', rows.filter((q) => q.r.error || q.r.render_error || q.r.export_error).map((q) => errorKey(q.r.error || q.r.render_error || q.r.export_error)), 25);
    table('## Export: LaTeX errors, cases per first error', rows.filter((q) => q.x && q.x.compile !== 'ok').map((q) => `${q.x.compile}: ${errorKey(q.x.errors?.[0] || q.x.missing_file || '')}${q.x.undefined_cs ? ' ' + q.x.undefined_cs : ''}`), 40);
  }
  // the gallery: the lowest scores, and a sample of what could not be drawn
  const G = +O.gallery, rnd = mulberry32(+O.seed);
  const worst = rows.filter((q) => rendered(q) && r5(q) != null).sort((a, b) => r5(a) - r5(b)).slice(0, Math.ceil(G * 2 / 3));
  const failed = shuffle(rows.filter((q) => !rendered(q)), rnd).slice(0, G - worst.length);
  const shown = [...worst, ...failed];
  const jobs = shown.filter((q) => q.r.png && refOf(q.c.id)).map((q) => ({ key: q.c.id, ref: path.join(REFS, q.c.id + '.png'), app: path.join(RUN, 'app', q.c.id + '.png'),
    refDpi: refOf(q.c.id).dpi, appDpi: q.r.dpi || DPI, overlay: path.join(RUN, 'overlay', q.c.id + '.png') }));
  await scoreAll(jobs, () => {});
  const img = (rel, alt) => (fs.existsSync(path.join(RUN, rel)) ? `<img loading="lazy" alt="${esc(alt)}" src="${esc(rel)}">` : `<p class="none">${esc(alt)}: none</p>`);
  const card = (q) => {
    const tex = fs.readFileSync(path.join(EXT, q.c.tex), 'utf8'), uri = q.c.meta?.uri;
    const scoresTxt = q.s && q.s.r5 != null ? `r2 ${pc(q.s.r2, 1)} · r5 ${pc(q.s.r5, 1)} · r10 ${pc(q.s.r10, 1)} · fit ${pc(q.s.fit, 1)} · size ${q.s.scale.join(' × ')}` : 'not scored';
    const x = q.x?.B?.r5 != null ? ` · export r5 ${pc(q.x.B.r5, 1)}` : q.x ? ` · export ${esc(q.x.compile)}` : '';
    const notes = [...(q.r.math_errors || []), ...(q.r.warnings || []), ...(q.r.issues || []), ...(q.r.block_warnings || []), q.r.error, q.r.render_error, q.r.export_error, ...(q.x?.errors || [])].filter(Boolean);
    return `<article id="${esc(q.c.id)}"><h2>${esc(q.c.id)} <span>${esc(stratum(q.c))} · ${esc(q.r.status)}</span></h2>
<p>${esc(scoresTxt)}${x} · ${esc(q.r.via || '')}${q.r.paste_misread ? ` (a paste reads it as ${esc(q.r.paste_kind)})` : ''} · ${q.r.ms ?? '–'} ms · ${uri ? `<a href="${esc(uri)}">${esc(q.c.source)}</a>` : esc(q.c.source)} · ${esc(q.c.split)}</p>
<div class="row"><figure>${img(`../../refs/${q.c.id}.png`, 'LaTeX')}<figcaption>LaTeX</figcaption></figure><figure>${img(`app/${q.c.id}.png`, 'App')}<figcaption>App</figcaption></figure>
<figure>${img(`overlay/${q.c.id}.png`, 'Overlay')}<figcaption>Overlay: grey both, red app only, blue LaTeX only</figcaption></figure><figure>${img(`export-png/${q.c.id}.png`, 'Export')}<figcaption>Export, compiled</figcaption></figure></div>
${notes.length ? `<ul class="notes">${notes.slice(0, 12).map((n) => `<li>${esc(String(n).slice(0, 300))}</li>`).join('')}</ul>` : ''}
<details><summary>Snippet</summary><pre>${esc(tex)}</pre></details></article>`;
  };
  fs.writeFileSync(path.join(RUN, 'gallery.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Corpus parity gallery</title>
<style>:root{--bg:#f6f5f2;--card:#fff;--ink:#222;--line:#ddd;--warn:#8a310f}@media(prefers-color-scheme:dark){:root{--bg:#1c1c1e;--card:#2a2a2c;--ink:#eee;--line:#444;--warn:#f0a07a}}
body{font:14px/1.5 system-ui,sans-serif;margin:24px auto;max-width:1400px;padding:0 16px;color:var(--ink);background:var(--bg)}article{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:18px 0}
h2{font-size:16px;margin:0 0 4px}h2 span{float:right;font-weight:400;font-size:13px}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;min-width:0}
img{display:block;max-width:100%;max-height:360px;margin:auto;background:#fff;border:1px solid var(--line)}figcaption{font-size:12px;text-align:center}.notes{font-size:12px;color:var(--warn)}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;font-size:12px}.none{font-size:12px;text-align:center;opacity:.6}@media(max-width:800px){.row{grid-template-columns:1fr 1fr}}</style>
<h1>Corpus parity: ${esc(RUN_NAME)}</h1><p>The ${worst.length} lowest-scoring drawn cases, then ${failed.length} of the ${rows.filter((q) => !rendered(q)).length} the app could not draw (a random sample). Local only: the snippets are third-party text.</p>
${shown.map(card).join('\n')}</html>`);
  md.push('', `Gallery of the lowest scores and the failures: gallery.html (${shown.length} cases).`, '');
  fs.writeFileSync(path.join(RUN, 'REPORT.md'), md.join('\n') + '\n');
  log(`report: ${path.join(RUN, 'REPORT.md')} and gallery.html (${rows.length} cases)`);
}

// ------------------------------------------------------------------ diff
function phaseDiff(cases) {
  if (!O.base) throw new Error('diff needs --base OTHER-RUN');
  const other = path.join(COMPARE, 'runs', O.base);
  if (!fs.existsSync(other)) throw new Error('no run ' + O.base);
  const load = (dir) => ({ r: latest(path.join(dir, 'render.jsonl')), s: latest(path.join(dir, 'score.jsonl')) });
  const A = load(other), B = load(RUN);
  // (a snippet that draws with random numbers differs from LaTeX's run to run: left out of the comparison)
  const random = (c) => { try { return /\\pgfmathrandom|\\pgfmathdeclarerandomlist|\brand\b|\brnd\b|\brandom\s*\(/.test(fs.readFileSync(path.join(EXT, c.tex), 'utf8')); } catch { return false; } };
  const skipped = cases.filter((c) => A.r.has(c.id) && B.r.has(c.id) && random(c)).length;
  if (skipped) log(`diff: ${skipped} cases drawn with random numbers left out`);
  const rows = cases.filter((c) => A.r.has(c.id) && B.r.has(c.id) && !random(c)).map((c) => {
    const a = e2eOf(c, A.r.get(c.id), A.s.get(c.id)), b = e2eOf(c, B.r.get(c.id), B.s.get(c.id));
    return { c, a, b, d: b - a, sa: A.r.get(c.id).status, sb: B.r.get(c.id).status };
  });
  if (!rows.length) { log('diff: no cases rendered in both runs'); return; }
  const by = new Map([['all', rows]]);
  for (const q of rows) for (const k of [q.c.class, ...(q.c.lib ? ['lib/' + q.c.lib] : [])]) { if (!by.has(k)) by.set(k, []); by.get(k).push(q); }
  const md = [`# ${RUN_NAME} against ${O.base}`, '', `${rows.length} cases in both runs. End to end: r5, and 0 for a case not drawn. A change counts past ±0.05.`, '',
    '| | cases | before | after | change | better | worse |', '|---|--:|--:|--:|--:|--:|--:|'];
  for (const [k, qs] of [...by.entries()].sort((x, y) => (x[0] === 'all' ? -1 : y[0] === 'all' ? 1 : x[0].localeCompare(y[0])))) {
    const a = mean(qs.map((q) => q.a)), b = mean(qs.map((q) => q.b));
    md.push(`| ${k === 'all' ? '**all**' : k} | ${qs.length} | ${num(a, 3)} | ${num(b, 3)} | ${(b - a >= 0 ? '+' : '') + num(b - a, 3)} | ${qs.filter((q) => q.d > 0.05).length} | ${qs.filter((q) => q.d < -0.05).length} |`);
  }
  const list = (title, qs) => md.push('', title, '', '| case | | before | after | status |', '|---|---|--:|--:|---|',
    ...qs.map((q) => `| ${q.c.id} | ${stratum(q.c)} | ${num(q.a)} | ${num(q.b)} | ${q.sa}${q.sa !== q.sb ? ' → ' + q.sb : ''} |`));
  list('## Worse', rows.filter((q) => q.d < -0.05).sort((x, y) => x.d - y.d).slice(0, 40));
  list('## Better', rows.filter((q) => q.d > 0.05).sort((x, y) => y.d - x.d).slice(0, 40));
  const file = path.join(RUN, `DIFF-${O.base}.md`);
  fs.writeFileSync(file, md.join('\n') + '\n');
  const all = by.get('all');
  log(`diff: ${num(mean(all.map((q) => q.a)), 3)} → ${num(mean(all.map((q) => q.b)), 3)} over ${all.length} cases (${all.filter((q) => q.d > 0.05).length} better, ${all.filter((q) => q.d < -0.05).length} worse): ${file}`);
}

// ------------------------------------------------------------------ main
const cases = selectCases();
log(`${cases.length} cases selected (${O.set}, ${O.split}) → ${path.relative(ROOT, RUN)}`);
if (!cases.length) process.exit(0);
const run = phase === 'all' ? PHASES : [phase];
if (run.includes('refs')) phaseRefs(cases);
if (run.includes('render')) await phaseRender(cases);
if (run.includes('score')) await phaseScore(cases);
if (run.includes('export')) await phaseExport(cases);
if (run.includes('report')) await phaseReport(cases);
if (phase === 'diff') phaseDiff(cases);
