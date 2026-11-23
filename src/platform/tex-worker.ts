// The in-browser LaTeX (served as tex/tex-worker.js, the engine named after #: pdftex, xetex or dvipdfm). It runs one
// of SwiftLaTeX's engines (tex/swiftlatex<engine>.js and .wasm: pdfTeX 1.40.21, XeTeX 0.999992 and dvipdfmx built for
// the web) on files from a TeX Live bundle made by scripts/tex-bundle.mjs: every file the app's LaTeX needs, and the
// format built by the engine. The engine looks each file up through kpse_find_file_impl, which on its own fetches it
// from SwiftLaTeX's server; here it finds it in the bundle, which is unpacked into the engine's memory once, so a
// compile never goes to the network. XeLaTeX is two of these: XeTeX writes main.xdv, which dvipdfmx (loading only the
// bundle's fonts, maps and encodings) makes into the PDF.
//
// Messages (the main thread's side is src/platform/tex-engine.ts):
//   { cmd: 'td:load', base, manifest } → { cmd: 'td:progress', done, total }…, then { cmd: 'td:loaded' } or { cmd: 'td:error', message }
//   { cmd: 'td:compile', src, files } → { cmd: 'td:result', ok, status, log, pdf?, missing }
//     (pdftex: src is the LaTeX and pdf the PDF; xetex: pdf is the .xdv; dvipdfm: src is the .xdv's bytes)
/* eslint-disable no-var */
declare var FS: any, allocate: any, intArrayFromString: any, UTF8ToString: any, ALLOC_NORMAL: any;
declare function importScripts(...urls: string[]): void;
declare function compileLaTeXRoutine(): void;
declare function compilePDFRoutine(): void;

interface Manifest {
  version: string; chunks: { file: string; size: number; raw: number }[]; files: Record<string, [chunk: number, offset: number, length: number]>;
  /** files fetched one by one the first time TeX asks for one (large fonts few documents use): name → [file, length] */
  lazy?: Record<string, [file: string, length: number]>;
}
const G = self as any;
// the worker's name (new Worker(url, { name })): not the URL, which a worker served from the service worker's cache
// doesn't keep whole
const ENGINE = (/^(pdftex|xetex|dvipdfm)$/.exec((self as unknown as { name: string }).name) || [, 'pdftex'])[1] as 'pdftex' | 'xetex' | 'dvipdfm';
const ROOT = '/tex/';
// what dvipdfmx never reads: TeX's own inputs and the format (it gets fonts, maps, encodings, CMaps and its configuration)
const TEX_ONLY = /\.(tex|sty|cls|clo|def|fd|ldf|ltx|fmt|bib|bst|lua|dtx|ins|cfg)$/;
const found = new Map<string, string>(); // file name → where it is in the engine's file system
let lazy: Record<string, [string, number]> = {}, lazyBase = '';
let missing = new Set<string>();
// files TeX looks for and is fine without (a first run's .aux, configuration files, virtual fonts)
const OPTIONAL = /\.(aux|toc|lof|lot|out|nav|snm|vrb|cfg|vf|fd|clo|ldf|def|mkii|bbl)$|^(main|texput)\b/;

// The engine says it is up by posting { result: 'ok' } once its WebAssembly has started; that, and its other
// messages, are taken here before they reach the page.
const send = G.postMessage.bind(G) as (m: unknown, t?: Transferable[]) => void;
let up: () => void = () => {}, failed: (e: unknown) => void = () => {};
const engineUp = new Promise<void>((res, rej) => { up = res; failed = rej; });
let booted = false;
G.postMessage = (m: any, transfer?: Transferable[]) => {
  if (!booted && m && m.result === 'ok' && !m.cmd) { booted = true; up(); return; }
  if (m && m.cmd === 'compile') {
    send({ cmd: 'td:result', ok: m.result === 'ok', status: m.status, log: String(m.log || ''), pdf: m.pdf, missing: [...missing] }, m.pdf ? [m.pdf] : []);
    return;
  }
  // the engine's replies to its own commands are not the page's business
};
// a document with an error is an answer, not a fault: the engine's own console line for it is dropped
const consoleError = console.error.bind(console);
console.error = (...a: unknown[]) => { if (!/^Compilation failed/.test(String(a[0]))) consoleError(...a); };
try { importScripts(`swiftlatex${ENGINE}.js`); } catch (e) { failed(e); }

// TeX asks for a name, with or without its extension, and a kpathsea format: the extension that format's files have
// (pdfTeX asks for a font's metrics as "cmmib9", format 3). A name with a path in it is the document's own, found in
// its folder.
const EXT: Record<number, string[]> = { 3: ['.tfm'], 6: ['.bib'], 7: ['.bst'], 10: ['.fmt'], 11: ['.map'], 26: ['.tex'], 32: ['.pfb', '.pfa'], 33: ['.vf'], 36: ['.ttf', '.ttc'], 44: ['.enc'], 47: ['.otf'] };
/** A file fetched now, while TeX waits for it (a worker may do that); the service worker keeps it after. */
function fetchNow(name: string) {
  const [file, length] = lazy[name];
  try {
    const x = new XMLHttpRequest();
    x.open('GET', lazyBase + file, false);
    x.responseType = 'arraybuffer';
    x.send();
    const data = x.status === 200 ? new Uint8Array(x.response) : null;
    if (!data || data.length !== length) return undefined;
    FS.writeFile(ROOT + name, data); found.set(name, ROOT + name);
    return ROOT + name;
  } catch { return undefined; }
}
function lookup(name: string, format: number) {
  for (const n of [name, ...(EXT[format] || []).filter((e) => !name.endsWith(e)).map((e) => name + e)]) {
    const at = found.get(n) || (lazy[n] ? fetchNow(n) : undefined);
    if (at) return at;
  }
  return undefined;
}
G.kpse_find_file_impl = (nameptr: number, format: number) => {
  const name = UTF8ToString(nameptr);
  if (name.includes('/')) return 0;
  const at = lookup(name, format);
  if (!at) { if (!OPTIONAL.test(name)) missing.add(name); return 0; }
  return allocate(intArrayFromString(at), 'i8', ALLOC_NORMAL);
};
G.kpse_find_pk_impl = () => 0; // bitmap fonts: the bundle has Type 1 fonts only

// (a server that sends the .gz with Content-Encoding: gzip has the browser unpack it already)
async function gunzip(res: Response) {
  if (!res.ok) throw new Error(`${res.url}: ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data[0] !== 0x1f || data[1] !== 0x8b) return data;
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
async function load(base: string, manifest: Manifest) {
  await engineUp;
  lazy = manifest.lazy || {}; lazyBase = base;
  const total = manifest.chunks.reduce((n, c) => n + c.size, 0);
  let done = 0;
  const byChunk = new Map<number, [string, number, number][]>();
  for (const [name, [c, off, len]] of Object.entries(manifest.files)) { if (!byChunk.has(c)) byChunk.set(c, []); byChunk.get(c)!.push([name, off, len]); }
  await Promise.all(manifest.chunks.map(async (chunk, i) => {
    const data = await gunzip(await fetch(base + chunk.file));
    if (data.length !== chunk.raw) throw new Error(`${chunk.file}: ${data.length} bytes, not ${chunk.raw}`);
    for (const [name, off, len] of byChunk.get(i) || []) {
      if (ENGINE === 'dvipdfm' && TEX_ONLY.test(name) && !/^dvipdfmx\.cfg$/.test(name)) continue;
      FS.writeFile(ROOT + name, data.subarray(off, off + len)); found.set(name, ROOT + name);
    }
    done += chunk.size;
    send({ cmd: 'td:progress', done, total });
  }));
}
function writeWork(name: string, data: string | Uint8Array) {
  const parts = name.split('/').filter(Boolean);
  let dir = '/work';
  for (const p of parts.slice(0, -1)) { dir += '/' + p; try { FS.mkdir(dir); } catch { /* there already */ } }
  FS.writeFile(dir + '/' + parts[parts.length - 1], data);
}
function clearWork(dir = '/work') {
  for (const item of FS.readdir(dir)) {
    if (item === '.' || item === '..') continue;
    const p = dir + '/' + item;
    if (FS.isDir(FS.stat(p).mode)) { clearWork(p); FS.rmdir(p); } else FS.unlink(p);
  }
}

G.onmessage = async (ev: MessageEvent) => {
  const m = ev.data || {};
  try {
    if (m.cmd === 'td:load') { await load(m.base, m.manifest); send({ cmd: 'td:loaded' }); return; }
    if (m.cmd === 'td:compile') {
      await engineUp;
      missing = new Set();
      clearWork();
      for (const [name, data] of Object.entries<string | Uint8Array>(m.files || {})) writeWork(name, data);
      if (ENGINE === 'dvipdfm') { writeWork('main.xdv', m.src); G.mainfile = 'main.xdv'; compilePDFRoutine(); return; }
      writeWork('main.tex', m.src);
      G.mainfile = 'main.tex';
      compileLaTeXRoutine(); // answers through postMessage (above)
    }
  } catch (e: any) { send({ cmd: 'td:error', message: String(e?.message || e) }); }
};
