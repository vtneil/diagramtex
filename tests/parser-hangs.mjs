// Malformed input must not hang or crash the readers (docs/qa/2026-11-27-audit, findings 1-5 and 15): an unclosed
// { or [ used to send a scan back to the start (close() is -1, so i = e + 1 is 0), a repeat count or a range step
// could run for ever, and user text went into new RegExp unescaped. Each case runs in a child process of its own with
// a time limit and a heap cap, so a hang or a runaway allocation fails the case instead of the runner (a worker thread
// that runs out of memory can take the whole process down).
// node tests/parser-hangs.mjs
import { build } from 'esbuild';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 2000, JOBS = Math.max(2, Math.min(6, os.cpus().length - 1));
// The readers and what they register on: shapes (util, fmt, the shape types), the block registry, raw TikZ (dedent),
// plots and the cd / zx helpers xy reads. None of them need a page to parse; shapes and the label fonts touch
// `document` and `FontFace` when they load, which the child stubs.
const MODS = ['domain/shapes.ts', 'register-blocks.ts', 'domain/rawtikz.ts', 'domain/plots.ts', 'domain/pgfplots-import.ts',
  'domain/zx.ts', 'domain/cd.ts', 'domain/timing.ts', 'domain/chemfig.ts', 'domain/xy.ts', 'domain/tikzimport.ts'];
const J = JSON.stringify;
const contents = `import { runtime } from './src/runtime';\n${MODS.map((m) => `import './src/${m}';`).join('\n')}\nexport default runtime;`;
const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm',
  loader: { '.css': 'text', '.woff2': 'dataurl' }, logLevel: 'error' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-hangs-'));
const bundle = path.join(dir, 'readers.mjs');
fs.writeFileSync(bundle, result.outputFiles[0].text);

const child = path.join(dir, 'case.mjs');
fs.writeFileSync(child, `
const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub(), apply: () => stub(), construct: () => stub(), set: () => true });
globalThis.document = stub();
globalThis.FontFace = class { load() { return Promise.resolve(this); } };
const { default: TD } = await import(${J(pathToFileURL(bundle).href)});
// (text is measured by the page: here every text is a box from its length, and the math engine is idle)
TD.textBox = (t) => ({ w: 6 * String(t).length + 2, h: 12, px: 10, css: '', html: String(t) });
const within = (o, k) => (fn) => { o[k] = true; try { return fn(); } finally { o[k] = false; } };
const math = { previewing: false, finalizing: false, pending: false };
Object.assign(math, { preview: within(math, 'previewing'), synchronous: within(math, 'finalizing') });
TD.math = new Proxy(math, { get: (o, k) => k in o ? o[k] : () => '' });
const warn = () => {};
process.on('message', (code) => {
  try { new Function('TD', 'warn', code)(TD, warn); process.send({ ok: true }); }
  catch (e) { process.send({ ok: false, error: (e && e.name) + ': ' + (e && e.message) }); }
});
process.send('ready');
`);

const axis = (opts, body) => `TD.pgfplotsImport.fromAxis('axis', ${J(opts)}, ${J(body)});`;
const tikz = (body) => `TD.importLatex(${J(`\\begin{tikzpicture}${body}\\end{tikzpicture}`)});`;
const timing = (rows, extra = '') => { const src = `\\begin{tikztimingtable}\n${rows}\n${extra ? `\\extracode\n${extra}\n` : ''}\\end{tikztimingtable}`; return `TD.timing.parse(${J(src)}); TD.timingMini(${J(src)});`; };
const chem = (src) => `TD.chem.parseDoc(${J(src)}, warn); TD.chemMini(${J(src)});`;
const xy = (src) => `TD.xy.toTikzcd(${J(src)});`;
const CASES = [
  // 1: pgfplots, unclosed legend entry or definition
  ['pgfplots: \\addlegendentry{ unclosed', axis('', '\\addplot {x}; \\addlegendentry{unclosed')],
  ['pgfplots: \\addlegendentry[ unclosed', axis('', '\\addplot {x}; \\addlegendentry[unclosed')],
  ['pgfplots: \\legend[ unclosed', axis('', '\\addplot {x}; \\legend[unclosed')],
  ['pgfplots: \\newcommand{ unclosed', axis('', '\\newcommand{unclosed')],
  ['pgfplots: \\addlegendentry{ unclosed, through the TikZ reader', tikz('\\begin{axis}\\addplot {x}; \\addlegendentry{unclosed\\end{axis}')],
  ['pgfplots: scope [ unclosed', axis('', '\\begin{scope}[unclosed \\addplot {x}; \\end{scope}')],
  ['pgfplots: table [ unclosed', axis('', '\\addplot table [unclosed;')],
  // 15: pgfplots, range steps below one ulp and regex metacharacters
  ['pgfplots: xtick list below one ulp', axis('xtick={1e16,...,10000000000000010}', '\\addplot {x};')],
  ['pgfplots: xtick list below one ulp, stepped', axis('xtick={1e16,10000000000000001,...,10000000000000010}', '\\addplot {x};')],
  ['pgfplots: invokeforeach list below one ulp', axis('', '\\pgfplotsinvokeforeach{1e16,...,10000000000000010}{\\draw (0,0) -- (1,#1);}')],
  ['pgfplots: xtick distance below one ulp', axis('xmin=1e16, xmax=10000000000000100, ymin=0, ymax=1, xtick distance=1', '\\addplot coordinates {(1e16,0)};')],
  ['pgfplots: environment name with (', axis('', '\\begin{foo(bar}\\addplot {x};\\end{foo(bar}')],
  ['pgfplots: declare function parameter x[1]', axis('declare function={f(x[1])=x;}', '\\addplot {f(1)};')],
  ['pgfplots: declare function parameter x[', axis('declare function={f(x[)=x;}', '\\addplot {f(1)};')],
  ['pgfplots: declare function parameter *', axis('declare function={f(*)=1;}', '\\addplot {f(1)};')],
  ['pgfplots: variable with (', axis('', '\\addplot[variable=\\t(] ({cos(t)}, {sin(t)});')],
  ['pgfplots: 3D variable with (', axis('', '\\addplot3[variable=\\t(] ({cos(t)}, {sin(t)}, {t});')],
  // 2: timing, unclosed groups in a row and in the extra code, and a huge repeat count
  ['timing: !{ unclosed', timing('A & !{unclosed \\\\')],
  ['timing: @{ unclosed', timing('A & H @{unclosed \\\\')],
  ['timing: repeat 99999999{H}', timing('A & 99999999{H} \\\\')],
  ['timing: nested repeats', timing('A & 9999{9999{9999{HL}}} \\\\')],
  ['timing: a zigzag 99999999 wide', timing('A & 99999999M \\\\')],
  ['timing: \\vertlines[ unclosed', timing('A & HL \\\\', '\\vertlines[unclosed')],
  ['timing: \\vertlines{ unclosed', timing('A & HL \\\\', '\\vertlines{unclosed')],
  ['timing: \\horlines[ unclosed', timing('A & HL \\\\', '\\horlines[unclosed')],
  ['timing: \\tablegrid[ unclosed', timing('A & HL \\\\', '\\tablegrid[unclosed')],
  ['timing: \\begin{pgfonlayer}{ unclosed', timing('A & HL \\\\', '\\begin{pgfonlayer}{unclosed')],
  ['timing: \\tablegrid with a step below one ulp', timing('A & HL \\\\', '\\tablegrid[step=1e-300]')],
  // 3: TikZ, an ampersand replacement of spaces
  ['tikz: ampersand replacement={ }', tikz('\\matrix[ampersand replacement={ }] {a & b \\\\};')],
  ['tikz: matrix of nodes, ampersand replacement={ }', tikz('\\matrix[matrix of nodes, ampersand replacement={ }] {a & b \\\\};')],
  ['tikz: environment name with (', tikz('\\begin{foo(bar} \\draw (0,0) -- (1,1); \\end{foo(bar}')],
  ['tikz: scope [ unclosed', tikz('\\begin{scope}[unclosed \\draw (0,0) -- (1,1); \\end{scope}')],
  // 4: chemfig, a hashed wedge with no dash step and an unclosed to[ in \chemmove
  ['chemfig: cram dash width=0pt, cram dash sep=0pt', chem('\\setchemfig{cram dash width=0pt, cram dash sep=0pt}\\chemfig{A>:B}')],
  ['chemfig: cram dash step below zero', chem('\\setchemfig{cram dash width=-2pt, cram dash sep=1pt}\\chemfig{A>:B}')],
  ['chemfig: cram dash step below one ulp', chem('\\setchemfig{cram dash width=0pt, cram dash sep=1e-300pt}\\chemfig{A>:B}')],
  ['chemfig: \\chemmove to[ unclosed', chem('\\chemfig{@{a}A-@{b}B}\\chemmove{\\draw (a) to[bend left (b);}')],
  ['chemfig: arrow label *{ unclosed', chem('\\schemestart A \\arrow{->[*{45 x]} B \\schemestop')],
  // 5: xy, an unclosed ^{ in an arrow style and a backslash at the end or before a line break
  ['xy: @{^{ unclosed', xy('\\xymatrix{ A \\ar@{^{-> [r] & B }')],
  ['xy: @{_{ unclosed', xy('\\xymatrix{ A \\ar@{_{-> [r] & B }')],
  ['xy: @{^{ unclosed to the end', xy('\\xymatrix{ A \\ar@{^{-> [r]')],
  ['xy: an arrow style ^{ unclosed', `TD.xy.specItems('^{->', false); TD.xy.specItems('_{(', true);`],
  ['xy: \\ at the end', xy('\\xymatrix{ A \\')],
  ['xy: \\ before a line break', xy('\\xymatrix{ A \\\n& B }')],
  ['xy: label \\ at the end', xy('\\xymatrix{ A \\ar[r]^\\')],
];

const run = ([name, code]) => new Promise((resolve) => {
  const c = fork(child, [], { execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let timer = null, settled = false;
  const done = (ok, why) => { if (settled) return; settled = true; clearTimeout(timer); c.kill('SIGKILL'); resolve({ name, ok, why }); };
  c.on('message', (m) => {
    if (m === 'ready') { timer = setTimeout(() => done(false, `still running after ${LIMIT} ms`), LIMIT); c.send(code); }
    else done(m.ok, m.error);
  });
  c.on('error', (e) => done(false, `${e.code || e.name}: ${e.message}`));
  c.on('exit', (code, signal) => done(false, `exited (${signal || code}${signal === 'SIGABRT' || code === 134 ? ': out of memory' : ''})`));
});

const results = [];
for (let k = 0; k < CASES.length; k += JOBS) results.push(...await Promise.all(CASES.slice(k, k + JOBS).map(run)));
fs.rmSync(dir, { recursive: true, force: true });
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`[PASSED] parser-hangs: ${r.name}`);
  else { failed++; console.log(`[FAILED] parser-hangs: ${r.name}: ${r.why}`); }
}
if (failed) { console.log(`[FAILED] parser-hangs: ${failed} of ${results.length} cases hang or throw`); process.exit(1); }
console.log(`[PASSED] parser-hangs: ${results.length} malformed inputs read without hanging or throwing`);
