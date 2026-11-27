// Builds the TeX Live bundles of the in-browser LaTeX (public/tex/bundle/<engine>/, read by src/platform/tex-worker.ts).
// Needs a TeX Live on PATH (kpsewhich, pdflatex) and the Playwright browsers. Run it on a machine with TeX Live:
//
//   node scripts/tex-bundle.mjs                       both engines, documents from ext/tex-corpus/ (made by --capture)
//   node scripts/tex-bundle.mjs --engine xetex        one engine: pdftex (pdfLaTeX) or xetex (XeLaTeX, with dvipdfmx)
//   node scripts/tex-bundle.mjs --capture             first collect every document the test suite compiles
//   node scripts/tex-bundle.mjs --capture --dist      the same, the suite run against dist/ (npm run build first; CI)
//
// What it does, for each engine:
//   1. builds the format (swiftlatexpdftex.fmt, swiftlatexxetex.fmt) with the engine itself, from this TeX Live's LaTeX
//   2. compiles every corpus document, and one that loads each package the app's documents may use (EXTRA), with the
//      engine reading this TeX Live through kpsewhich, and keeps every file they open
//      (and FONT_DOCS: every document font of src/core/doc-fonts.ts with every object font, size, series and shape
//      the app writes, with bold maths and T1 text, and Thai: every letter, in each TLWG face); XeLaTeX's go through dvipdfmx too
//   3. adds the whole of each package the app writes (TREES) and the fonts (FONTS)
//   4. packs the files into gzipped chunks named after their contents, with manifest.json (name → chunk, offset, length);
//      the T1 Type 1 fonts (cm-super, LAZY: 58 MB that hardly compress, for text in T1 such as a straight ") are each
//      their own file instead (tex/bundle/fonts, shared by both engines), fetched only when a document first uses one
//   5. compiles every document again, now through tex/tex-worker.js with the bundle alone, and fails if one that
//      compiled in step 2 does not
//
// The bundles stay out of the repository: scripts/tex-bundle-pack.mjs packs them for a GitHub release and pins that in
// scripts/tex-bundle.lock.json, and scripts/tex-bundle-fetch.mjs (CI, before every build) puts them back.
//
// Usually run on GitHub instead: the TeX bundle workflow (.github/workflows/tex-bundle.yml, run by hand) installs TeX Live,
// runs this with --capture, packs and publishes the archive and opens a pull request pinning it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEX = path.join(ROOT, 'public/tex'), CORPUS = path.join(ROOT, 'ext/tex-corpus');
const LIMIT = 90e6, CHUNK = 16e6; // each engine's whole download (gzipped), and one chunk (unpacked)
const args = process.argv.slice(2);
const say = (...a) => console.log(...a);
const ENGINES = args.includes('--engine') ? [args[args.indexOf('--engine') + 1]] : ['pdftex', 'xetex'];
if (ENGINES.some((e) => e !== 'pdftex' && e !== 'xetex')) { console.error('--engine pdftex or --engine xetex'); process.exit(2); }
const { DOC_FONTS, docFontPreamble, objectFont, thaiFallback, THAI_BREAK_DEF, THAI_PDF, thaiBreaks, thaiRuns } = await import('../src/core/doc-fonts.ts');
const { PACKAGE_COMMANDS } = await import('../src/domain/package-commands.ts');

// Packages the app writes or a document may load: these files' whole packages go in (step 3).
const TREES = ['tikz.sty', 'pgf.revision.tex', 'pgfplots.sty', 'pgfplots.revision.tex', 'circuitikz.sty', 'tikz-cd.sty', 'forest.sty',
  'tikzlibraryquantikz2.code.tex', 'zx-calculus.sty', 'tikz-feynman.sty', 'tikz-3dplot.sty', 'tikz-timing.sty', 'pgf-umlcd.sty',
  'pgf-umlsd.sty', 'karnaugh-map.sty', 'bytefield.sty', 'chemfig.sty', 'chemfig.tex', 'tikz-chemlab.sty', 'tikz-network.sty', 'datatool.sty', 'xifthen.sty', 'blochsphere.sty', 'booktabs.sty',
  'xy.tex', 'amsmath.sty', 'amssymb.sty', 'amsfonts.sty', 'mathtools.sty', 'siunitx.sty', 'geometry.sty', 'xcolor.sty', 'graphicx.sty',
  'array.sty', 'colortbl.sty', 'multirow.sty', 'standalone.cls', 'svg.sty', 'eso-pic.sty', 'mathrsfs.sty', 'dsfont.sty', 'physics.sty',
  'braket.sty', 'cancel.sty', 'xparse.sty', 'etoolbox.sty', 'pgfopts.sty', 'trimspaces.sty', 'environ.sty', 'tcolorbox.sty', 'enumitem.sty',
  'caption.sty', 'subcaption.sty', 'float.sty', 'hyperref.sty', 'url.sty', 'microtype.sty', 'lmodern.sty', 'fontenc.sty', 'textcomp.sty',
  'times.sty', 'bm.sty', 'newtxtext.sty', 'newpxtext.sty', 'tgheros.sty',
  // what labels' maths may need (TD.lint.mathNeeds: the commands the maths engines draw)
  'mhchem.sty', 'nicefrac.sty', 'xfrac.sty', 'tensor.sty', 'slashed.sty', 'centernot.sty', 'upgreek.sty', 'euscript.sty',
  // every package an export loads by itself for a command it uses (src/domain/package-commands.ts: TD.lint.mathNeeds)
  ...PACKAGE_COMMANDS.map(([pkg]) => pkg + '.sty')];
const TREES_XE = ['fontspec.sty', 'xunicode.sty']; // XeLaTeX only
// A document that loads them, so what they load in turn is recorded too (step 2).
const EXTRA = String.raw`\documentclass{article}
\usepackage[T1]{fontenc}\usepackage{lmodern}\usepackage{amsmath,amssymb,mathtools,siunitx,geometry,xcolor,graphicx}
\usepackage{array,booktabs,colortbl,multirow,longtable,tabularx,hhline,bm,mathrsfs,dsfont,physics,braket,cancel}
\usepackage[version=4]{mhchem}\usepackage{nicefrac,xfrac,tensor,slashed,centernot,upgreek,euscript}
\usepackage{enumitem,caption,subcaption,float,eso-pic,microtype,url,hyperref}
\usepackage{tikz,pgfplots,circuitikz,tikz-cd,forest,zx-calculus,tikz-3dplot,tikz-timing,karnaugh-map,bytefield,chemfig,blochsphere}
\usepackage{pgf-umlcd}\usepackage{pgf-umlsd}\usepackage{tikz-network}\usepackage{tcolorbox}\usepackage[all]{xy}
\usetikzlibrary{arrows.meta,positioning,calc,decorations.pathmorphing,decorations.pathreplacing,decorations.markings,patterns.meta,
  shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,matrix,graphs,quotes,angles,automata,fit,backgrounds,
  intersections,through,shadings,fadings,quantikz2}
\pgfplotsset{compat=1.18}
\begin{document}
\section{Text} $\mathbb{R}\ \mathscr{L}\ \mathds{1}\ \bm{x}\ \SI{3}{\metre\per\second}$ \textbf{bold} \textit{it} \texttt{tt} \textsf{sf}
\begin{tikzpicture}\begin{axis}\addplot {x^2};\end{axis}\end{tikzpicture}
\begin{circuitikz}\draw (0,0) to[R] (2,0);\end{circuitikz}
\begin{tikzcd} A \arrow[r] & B \end{tikzcd}
\chemfig{A-B} \begin{tcolorbox}x\end{tcolorbox}
\end{document}
`;
// Fonts the documents' text and maths use, as Type 1 (fonts/type1/…) with their metrics (fonts/tfm/…).
const FONTS = ['fonts/type1/public/amsfonts', 'fonts/tfm/public/amsfonts', 'fonts/tfm/public/cm', 'fonts/type1/public/lm', 'fonts/tfm/public/lm',
  'fonts/enc/dvips/lm', 'fonts/map/pdftex/updmap', 'fonts/tfm/public/rsfs', 'fonts/type1/public/rsfs', 'fonts/tfm/public/doublestroke', 'fonts/type1/public/doublestroke',
  // T1 and TS1 metrics (EC, TC) and their encodings, for text in T1; the Type 1 fonts themselves are LAZY
  'fonts/tfm/jknappen/ec', 'fonts/enc/dvips/cm-super', 'fonts/enc/dvips/base',
  // Times, Helvetica and Courier (the app's \fontfamily{ptm}, {phv}, {pcr}): URW's Type 1 fonts, Adobe metrics
  'fonts/type1/urw/times', 'fonts/type1/urw/helvetic', 'fonts/type1/urw/courier', 'fonts/tfm/adobe/times', 'fonts/tfm/adobe/helvetic',
  'fonts/tfm/adobe/courier', 'fonts/vf/adobe/times', 'fonts/vf/adobe/helvetic', 'fonts/vf/adobe/courier', 'fonts/tfm/urw35vf/times',
  'fonts/tfm/urw35vf/helvetic', 'fonts/tfm/urw35vf/courier', 'fonts/vf/urw35vf/times', 'fonts/vf/urw35vf/helvetic', 'fonts/vf/urw35vf/courier',
  // symbol packages an export or a preview may load (package-commands.ts, kept-preview.ts): their Type 1 fonts (ifsym's
  // and yhmath's are METAFONT only, which this engine can't draw)
  'fonts/tfm/urw35vf/zapfding', 'fonts/tfm/adobe/zapfding', 'fonts/type1/urw/zapfding', 'fonts/tfm/public/marvosym', 'fonts/type1/public/marvosym',
  'fonts/tfm/public/bbding', 'fonts/type1/public/niceframe-type1', 'fonts/tfm/public/cmll', 'fonts/type1/public/cmll', 'fonts/tfm/public/mathabx',
  'fonts/type1/public/mathabx-type1', 'fonts/tfm/public/mnsymbol', 'fonts/type1/public/mnsymbol', 'fonts/enc/dvips/mnsymbol'];
const LAZY = ['fonts/type1/public/cm-super'];
// XeLaTeX's OpenType fonts (fontspec by file name) and what dvipdfmx reads to write the PDF
const FONTS_XE = ['fonts/opentype/public/lm', 'fonts/map/dvipdfmx', 'fonts/map/glyphlist', 'fonts/cmap/dvipdfmx'];
const OTF_XE = [[/^(texgyre(termes|pagella|heros|cursor)-(regular|bold|italic|bolditalic)\.otf)$/, 'fonts/opentype/public/tex-gyre'],
  [/^(Kinnari|Garuda|Laksaman)(-(Bold|Italic|BoldItalic|Oblique|BoldOblique))?\.otf$/, 'fonts/opentype/public/fonts-tlwg']];
// Every size, family, series and shape the app's labels and documents write, each with bold maths and a T1 character
// (the document class's 10, 11 and 12 pt): what TeX asks for here must all be in the bundle.
const PROBE = String.raw`x\textbf{b}\textit{i}\textbf{\textit{bi}}\textsl{s}\textsc{Sc}{\fontencoding{T1}\selectfont\char34}$x^2_i\boldsymbol{x\alpha}\bm{y}\mathbf{B}\mathcal{C}\mathbb{R}\mathfrak{g}\mathscr{L}\mathds{1}\sum\int$`;
const PROBE_XE = PROBE + String.raw` ภาษาไทย\tdbr ตัว\tdbr หนา`;
// pdfLaTeX: every Thai letter (U+0E01–U+0E5B), in a run as the app writes it (\tdth{…}: the TLWG fonts' LTH faces)
const THAI_ALL = Array.from({ length: 0x5B }, (_, i) => String.fromCharCode(0x0E01 + i)).filter((c) => /\p{L}|\p{M}|\p{N}|\p{P}|\p{S}/u.test(c)).join('');
const PROBE_PDF_THAI = PROBE + ' ' + thaiRuns(THAI_ALL);
const OBJ = ['cmr', 'cmss', 'cmtt', 'times', 'arial', 'courier', 'garuda', 'kinnari', 'laksaman'];
function fontDocs(engine) {
  const tex = engine === 'xetex' ? 'xelatex' : 'pdflatex', probe = engine === 'xetex' ? PROBE_XE : PROBE_PDF_THAI;
  return DOC_FONTS.flatMap((font) => [10, 11, 12].map((pt) => {
    const objs = OBJ.map((k) => objectFont(k, tex, font.key)), pre = [...new Set(objs.flatMap((o) => o.pre))];
    const thai = engine === 'xetex' ? [...(font.thai ? [] : thaiFallback()), THAI_BREAK_DEF] : [...THAI_PDF, THAI_BREAK_DEF];
    return { name: `fonts-${engine}-${font.key}-${pt}pt`, files: {}, src: String.raw`\documentclass[${pt}pt]{article}
\usepackage{amsmath,amssymb}
\usepackage{tikz}
${docFontPreamble(font.key, tex).join('\n')}
\usepackage{bm,mathrsfs,dsfont}
${[...new Set([...pre, ...thai])].filter((l) => !docFontPreamble(font.key, tex).includes(l)).join('\n')}
\newcommand\probe{${probe} {\bfseries ${probe}} {\itshape ${probe}} {\bfseries\itshape ${probe}} {\boldmath ${probe}}}
\newcommand\fams{\probe\ {\sffamily\probe} {\ttfamily\probe} ${objs.filter((o) => o.code).map((o) => String.raw`{${o.code}\probe}`).join(' ')}\par}
\begin{document}
{\tiny\fams}{\scriptsize\fams}{\footnotesize\fams}{\small\fams}{\normalsize\fams}{\large\fams}{\Large\fams}{\LARGE\fams}{\huge\fams}{\Huge\fams}
\tikz\node[font=\footnotesize]{${probe}};
\end{document}
` };
  }));
}

const kpse = (...a) => { try { return execFileSync('kpsewhich', a, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const DIST = kpse('-var-value', 'TEXMFDIST');
if (!DIST) { console.error('kpsewhich not found: this needs a TeX Live on PATH'); process.exit(2); }
const TLYEAR = (/TeX Live (\d{4})/.exec(spawnSync('pdflatex', ['--version'], { encoding: 'utf8' }).stdout) || [])[1] || '?';
const WORK = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tex-bundle-'));

// ---- 0. the corpus: every document the test suite compiles (a pdflatex on PATH that keeps a copy of each)
if (args.includes('--capture')) {
  const bin = path.join(WORK, 'bin'), real = execFileSync('which', ['pdflatex'], { encoding: 'utf8' }).trim();
  fs.mkdirSync(bin); fs.rmSync(CORPUS, { recursive: true, force: true }); fs.mkdirSync(CORPUS, { recursive: true });
  fs.writeFileSync(path.join(bin, 'pdflatex'), `#!/bin/sh
if [ -f doc.tex ]; then h=$(shasum doc.tex | cut -c1-16); cp doc.tex "${CORPUS}/$h.tex"; mkdir -p "${CORPUS}/$h.files"; cp -R . "${CORPUS}/$h.files/"; rm -f "${CORPUS}/$h.files/doc.tex"; fi
exec "${real}" "$@"
`, { mode: 0o755 });
  say('collecting the test suite\'s documents (a full Chromium run)…');
  const r = spawnSync('node', ['tests/run.mjs', '--chromium', '--no-cache', ...(args.includes('--dist') ? ['--dist'] : [])], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, PATH: bin + ':' + process.env.PATH } });
  if (r.status) { console.error('the test run failed'); process.exit(1); }
}
if (!fs.existsSync(CORPUS)) { console.error(`no corpus in ${path.relative(ROOT, CORPUS)}: run with --capture`); process.exit(2); }
const corpus = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.tex')).sort().map((f) => {
  const dir = path.join(CORPUS, f.slice(0, -4) + '.files'), files = {};
  (function walk(rel) { if (!fs.existsSync(path.join(dir, rel))) return; for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(r); else files[r] = fs.readFileSync(path.join(dir, r)).toString('base64'); } })('');
  return { name: f.slice(0, -4), src: fs.readFileSync(path.join(CORPUS, f), 'utf8'), files };
});
// Each of those packages with every command it defines typeset (with two arguments: what it doesn't take is text), so
// the fonts its symbols are drawn in are opened and kept too. Not all of them compile, and need not: an error only
// stops a command, and whatever the package opened before it is recorded. They go last: one can leave the engine unable to run
// another (XeLaTeX's does), and the documents before them must all have their turn.
const packageDocs = () => PACKAGE_COMMANDS.map(([pkg, names]) => ({ name: 'package-' + pkg, files: {}, src: String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}\usepackage{tikz}\usepackage{${pkg}}
\begin{document}
${names.split(' ').filter((n) => !n.endsWith('*')).map((n) => '\\par\\hbox{$\\' + n + '{a}{b}$}').join('\n')}
\end{document}
` }));
// … and those fonts drawn: these must compile with the bundle alone
const SYMBOLS = [['pifont', '\\ding{51}'], ['marvosym', '\\Mobilefone'], ['bbding', '\\Checkmark'], ['cmll', '$\\parr$'], ['wasysym', '\\smiley'],
  ['stmaryrd', '$\\llbracket$'], ['esint', '$\\oiint$'], ['mathabx', '$\\divides$'], ['MnSymbol', '$\\powerset$'], ['extarrows', '$\\xlongequal{a}$']];
const symbolDocs = () => SYMBOLS.map(([pkg, use]) => ({ name: 'symbols-' + pkg, files: {}, src: String.raw`\documentclass{article}
\usepackage{${pkg}}
\begin{document}
${use}
\end{document}
` }));
// the documents the app writes for XeLaTeX mark where Thai lines may break (thaiBreaks)
const docsFor = (engine) => [{ name: 'extra-packages', src: EXTRA, files: {} }, ...fontDocs(engine), ...symbolDocs(), ...corpus, ...packageDocs()] // (those that must compile first)
  .map((d) => engine === 'xetex' ? { ...d, src: thaiBreaks(d.src) } : d);
const must = (name) => name === 'extra-packages' || name.startsWith('fonts-') || name.startsWith('symbols-');

// ---- a local server: the engines, the page that drives them, and TeX Live through kpsewhich (the engines' own
// protocol: GET texlive/<pdftex|xetex>/<kpathsea format>/<name>, the file's name in a fileid header, 301 when there is none)
const KFMT = { 3: 'tfm', 4: 'afm', 6: 'bib', 7: 'bst', 10: 'fmt', 11: 'map', 26: 'tex', 32: 'type1 fonts', 33: 'vf', 36: 'truetype fonts', 37: 'type42 fonts', 39: 'other text files', 41: 'misc fonts', 44: 'enc files', 45: 'cmap files', 46: 'subfont definition files', 47: 'opentype fonts', 53: 'cid maps' };
const FMT = { pdftex: 'swiftlatexpdftex.fmt', xetex: 'swiftlatexxetex.fmt' };
const FMT_ALIASES = new Set(['swiftlatexpdftex.fmt', 'swiftlatexxetex.fmt', 'xelatex.fmt', 'pdflatex.fmt']);
let opened = new Map(), fmtFile = null; // for the engine being built: name → file in TeX Live, for every file it opened
const PAGE = `<!doctype html><meta charset="utf-8"><title>tex-bundle</title><script>
const run = (w, msg, until) => new Promise((res) => { w.onmessage = (e) => { if (until(e.data)) res(e.data); }; if (msg) w.postMessage(msg); });
const boot = async (js) => { const w = new Worker(js); await run(w, null, (d) => d.result); w.postMessage({ cmd: 'settexliveurl', url: location.origin + '/texlive/' }); return w; };
window.stock = async (engine) => { window.E = engine; window.W = await boot('tex/swiftlatex' + engine + '.js'); if (engine === 'xetex') window.D = await boot('tex/swiftlatexdvipdfm.js'); };
window.format = async () => { const d = await run(W, { cmd: 'compileformat' }, (d) => d.cmd === 'compile'); if (d.result !== 'ok') return { log: d.log.slice(-2000) }; await fetch('/fmt', { method: 'POST', body: d.pdf }); return { ok: true, size: d.pdf.byteLength }; };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const put = (w, files) => { for (const [n, v] of Object.entries(files)) { const dir = n.split('/').slice(0, -1).join('/'); if (dir) w.postMessage({ cmd: 'mkdir', url: dir }); w.postMessage({ cmd: 'writefile', url: n, src: b64(v) }); } };
window.compileStock = async (src, files) => {
  W.postMessage({ cmd: 'flushcache' }); put(W, files);
  W.postMessage({ cmd: 'writefile', url: 'main.tex', src }); W.postMessage({ cmd: 'setmainfile', url: 'main.tex' });
  const d = await run(W, { cmd: 'compilelatex' }, (d) => d.cmd === 'compile');
  if (d.result !== 'ok') return { ok: false, log: d.log.slice(-1500) };
  if (E !== 'xetex') return { ok: true };
  D.postMessage({ cmd: 'flushcache' }); put(D, files);
  D.postMessage({ cmd: 'writefile', url: 'main.xdv', src: new Uint8Array(d.pdf) }); D.postMessage({ cmd: 'setmainfile', url: 'main.xdv' });
  const x = await run(D, { cmd: 'compilepdf' }, (d) => d.cmd === 'compile');
  return { ok: x.result === 'ok', log: x.result === 'ok' ? '' : 'dvipdfmx: ' + x.log.slice(-1500) };
};
window.ours = async (engine) => {
  window.E = engine; const base = new URL('tex/bundle/' + engine + '/', location.href).href, m = await (await fetch(base + 'manifest.json')).json();
  const start = async (kind) => { const w = new Worker('tex/tex-worker.js', { name: kind }); const d = await run(w, { cmd: 'td:load', base, manifest: m }, (d) => d.cmd === 'td:loaded' || d.cmd === 'td:error'); if (d.cmd !== 'td:loaded') throw new Error(d.message); return w; };
  try { window.O = await start(engine); if (engine === 'xetex') window.P = await start('dvipdfm'); return { cmd: 'td:loaded' }; } catch (e) { return { message: String(e) }; }
};
window.compileOurs = async (src, files) => {
  const fs = Object.fromEntries(Object.entries(files).map(([n, v]) => [n, b64(v)]));
  const d = await run(O, { cmd: 'td:compile', src, files: fs }, (d) => d.cmd === 'td:result' || d.cmd === 'td:error');
  if (!d.ok || E !== 'xetex') return { ok: !!d.ok, missing: d.missing || [], log: d.ok ? '' : String(d.log || d.message).slice(-1500) };
  const x = await run(P, { cmd: 'td:compile', src: new Uint8Array(d.pdf), files: fs }, (d) => d.cmd === 'td:result' || d.cmd === 'td:error');
  return { ok: !!x.ok, missing: x.missing || [], log: x.ok ? '' : 'dvipdfmx: ' + String(x.log || x.message).slice(-1500) };
};
</script>`;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
  if (u === '/fmt' && req.method === 'POST') { const b = []; req.on('data', (d) => b.push(d)); req.on('end', () => { fs.writeFileSync(fmtFile, Buffer.concat(b)); res.end('ok'); }); return; }
  const m = /^\/texlive\/(?:pdftex|xetex)\/(\d+)\/(.+)$/.exec(u);
  if (m) {
    const [, f, name] = m;
    const file = FMT_ALIASES.has(name) ? (fs.existsSync(fmtFile) ? fmtFile : null) : (KFMT[f] ? kpse('-format=' + KFMT[f], name) : kpse(name)) || null; // (by its format only: a TFM's name finds the OpenType font otherwise)
    if (!file) { res.writeHead(301); res.end(); return; }
    if (!FMT_ALIASES.has(name)) opened.set(path.basename(file), file); // by its own name: the worker adds the extension TeX leaves off
    // saved under the file's own name: a font's .tfm and .vf share the name TeX asks for, and one would replace the other
    res.writeHead(200, { fileid: FMT_ALIASES.has(name) ? name : path.basename(file), 'Access-Control-Expose-Headers': 'fileid' });
    fs.createReadStream(file).pipe(res); return;
  }
  const f = path.join(ROOT, 'public', path.normalize(u));
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = async () => { const p = await browser.newPage(); await p.goto(URL0); return p; };

async function build(ENGINE) {
  const OUT = path.join(TEX, 'bundle', ENGINE), FONTS_OUT = path.join(TEX, 'bundle', 'fonts'), docs = docsFor(ENGINE);
  opened = new Map(); fmtFile = path.join(WORK, FMT[ENGINE]); fs.rmSync(fmtFile, { force: true });
  say(`\n== ${ENGINE}: ${docs.length} documents; TeX Live ${TLYEAR} at ${DIST}`);
  // ---- 1. the format
  let p = await page();
  await p.evaluate((e) => window.stock(e), ENGINE);
  const fmt = await p.evaluate(() => window.format());
  if (!fmt.ok) throw new Error('building the format failed:\n' + fmt.log);
  say(`format: ${(fmt.size / 1e6).toFixed(1)} MB`);
  await p.close();

  // ---- 2. every document, with this TeX Live
  p = await page();
  await p.evaluate((e) => window.stock(e), ENGINE);
  const passed = new Set();
  // (one engine runs them all: XeLaTeX's gives out after a couple of hundred, so a document that fails is tried once more
  // with a fresh one)
  const stock = (d) => p.evaluate(({ src, files }) => window.compileStock(src, files), d);
  for (const d of docs) { let r = await stock(d); if (!r.ok) { await p.close(); p = await page(); await p.evaluate((e) => window.stock(e), ENGINE); r = await stock(d); } if (r.ok) passed.add(d.name); else if (must(d.name)) throw new Error(`the ${d.name} document failed:\n` + r.log); process.stdout.write(r.ok ? '.' : 'x'); }
  say(`\n${passed.size} of ${docs.length} compiled; ${opened.size} files opened`);
  await p.close();

  // ---- 3. whole packages and fonts
  const files = new Map(opened); // name → file
  const add = (file) => { const n = path.basename(file); if (!files.has(n)) files.set(n, file); };
  const walk = (dir, only) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, only); else if ((!only || only.test(e.name)) && !/\.(pdf|md|txt|html|lua|pl|py|sh|bat|ps|eps|png|jpg|dtx|ins|zip)$|README|Makefile|^\./i.test(e.name)) add(f); } };
  for (const main of [...TREES, ...(ENGINE === 'xetex' ? TREES_XE : [])]) {
    const f = kpse(main);
    if (!f) { say(`  (not in this TeX Live: ${main})`); continue; }
    const rel = path.relative(DIST, f).split(path.sep), i = rel.indexOf('tex');
    walk(path.join(DIST, ...rel.slice(0, i + 3))); // tex/<latex|generic|xelatex>/<package>
  }
  for (const dir of FONTS) walk(path.join(DIST, dir));
  if (ENGINE === 'xetex') {
    for (const dir of FONTS_XE) walk(path.join(DIST, dir));
    for (const [only, dir] of OTF_XE) walk(path.join(DIST, dir), only);
    for (const glyphs of ['glyphlist.txt', 'texglyphlist.txt', 'pdfglyphlist.txt', 'dvipdfmx.cfg']) { const f = kpse(glyphs); if (f) files.set(glyphs, f); }
  }
  files.set(FMT[ENGINE], fmtFile);
  // the LAZY fonts: all of them, each a file of its own (and none in a chunk, even when a document opened it)
  const lazyFiles = new Map();
  for (const dir of LAZY) {
    const root = path.join(DIST, dir);
    for (const [n, f] of files) if (f.startsWith(root + path.sep)) files.delete(n);
    for (const e of fs.readdirSync(root)) if (/\.(pfb|pfa)$/.test(e)) lazyFiles.set(e, path.join(root, e));
  }

  // ---- 4. pack
  const names = [...files.keys()].sort((a, b) => (a === FMT[ENGINE] ? -1 : b === FMT[ENGINE] ? 1 : a < b ? -1 : 1));
  const chunks = [], manifest = { version: '', engine: ENGINE === 'xetex' ? 'SwiftLaTeX XeTeX 0.999992 and dvipdfmx (20 Feb 2022)' : 'SwiftLaTeX pdfTeX 1.40.21 (20 Feb 2022)', texlive: TLYEAR, chunks: [], files: {}, lazy: {} };
  let cur = [], size = 0;
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; size = 0; };
  for (const n of names) { const len = fs.statSync(files.get(n)).size; if (size && size + len > CHUNK) flush(); cur.push(n); size += len; }
  flush();
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  const all = crypto.createHash('sha256');
  chunks.forEach((list, i) => {
    const parts = list.map((n) => fs.readFileSync(files.get(n)));
    let off = 0;
    list.forEach((n, k) => { manifest.files[n] = [i, off, parts[k].length]; off += parts[k].length; });
    const raw = Buffer.concat(parts), gz = zlib.gzipSync(raw, { level: 9 });
    const hash = crypto.createHash('sha256').update(gz).digest('hex');
    const file = `tex-${hash.slice(0, 12)}.bin.gz`;
    fs.writeFileSync(path.join(OUT, file), gz);
    manifest.chunks.push({ file, size: gz.length, raw: raw.length, sha256: hash });
    all.update(hash); total += gz.length;
  });
  // shared by both engines (tex/bundle/fonts, named after their contents): the manifest names them from its own folder
  fs.mkdirSync(FONTS_OUT, { recursive: true });
  let lazyTotal = 0;
  for (const [n, f] of [...lazyFiles].sort()) {
    const data = fs.readFileSync(f), hash = crypto.createHash('sha256').update(data).digest('hex'), name = `${hash.slice(0, 12)}.bin`, file = `../fonts/${name}`;
    if (!fs.existsSync(path.join(FONTS_OUT, name))) fs.writeFileSync(path.join(FONTS_OUT, name), data);
    manifest.lazy[n] = [file, data.length]; all.update(n + hash); lazyTotal += data.length;
  }
  say(`${lazyFiles.size} fonts fetched as needed: ${(lazyTotal / 1e6).toFixed(1)} MB on the site`);
  manifest.version = `${TLYEAR}-${all.digest('hex').slice(0, 12)}`;
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  say(`bundle ${ENGINE} ${manifest.version}: ${names.length} files in ${chunks.length} chunks, ${(total / 1e6).toFixed(1)} MB to download`);
  if (total > LIMIT) throw new Error(`the bundle is ${(total / 1e6).toFixed(1)} MB, more than ${LIMIT / 1e6} MB`);

  // ---- 5. every document again, with the bundle alone
  p = await page();
  const loaded = await p.evaluate((e) => window.ours(e), ENGINE);
  if (loaded.cmd !== 'td:loaded') throw new Error('the worker could not load the bundle: ' + loaded.message);
  const lost = [];
  for (const d of docs) {
    const ours = () => p.evaluate(({ src, files }) => window.compileOurs(src, files), d);
    let r = await ours();
    if (!r.ok && passed.has(d.name)) { await p.close(); p = await page(); await p.evaluate((e) => window.ours(e), ENGINE); r = await ours(); } // a fresh engine, as in step 2
    process.stdout.write(r.ok ? '.' : passed.has(d.name) ? 'X' : 'x');
    if (!r.ok && passed.has(d.name)) lost.push(`${d.name}: missing ${r.missing.join(', ') || '-'}\n${r.log}`);
  }
  await p.close();
  say('');
  if (lost.length) throw new Error(`${lost.length} documents compile with TeX Live but not with the bundle:\n${lost.slice(0, 5).join('\n\n')}`);
  say(`checked: every document that compiles with TeX Live ${TLYEAR} compiles with the ${ENGINE} bundle`);
}

try {
  for (const e of ENGINES) await build(e);
} finally {
  await browser.close(); server.close(); fs.rmSync(WORK, { recursive: true, force: true });
}
