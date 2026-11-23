// The in-browser pdfLaTeX, from the page's side: whether this browser can run it, its one-time download (the TeX Live
// bundle, kept by the service worker in a cache of its own), and compiles, one at a time, in a worker
// (src/platform/tex-worker.ts). Nothing leaves the browser: the engine and bundle come from this site, and a compile
// reads only them and the document's own files.
import { runtime as TD } from '../runtime';

interface Manifest { version: string; texlive: string; engine: string; chunks: { file: string; size: number; raw: number }[]; files: Record<string, unknown>; lazy?: Record<string, [string, number]> }
export type { TexEngine } from '../core/doc-fonts';
import type { TexEngine } from '../core/doc-fonts';
export interface TexError { line: number | null; message: string }
export interface TexResult { ok: boolean; pdf?: Uint8Array; log: string; errors: TexError[]; missing: string[]; ms: number; timedOut?: boolean }
/** Whether this browser can compile with an engine; when it can, how much the first compile downloads (nothing once `cached`). */
export type TexSupport = { ok: true; size: number; cached: boolean; texlive: string } | { ok: false; reason: 'wasm' | 'worker' | 'stream' | 'memory' | 'bundle' | 'space' };
export type Progress = (done: number, total: number) => void;

const TEX_CACHE = 'diagramtex-tex'; // public/sw.js keeps the bundles here
// each engine's bundle (scripts/tex-bundle.mjs --engine …) and the workers that run it: XeLaTeX is XeTeX, then dvipdfmx
const BUNDLE: Record<TexEngine, string> = { pdflatex: 'pdftex', xelatex: 'xetex' };
const base = () => new URL('tex/', document.baseURI).href;
const dir = (e: TexEngine) => base() + 'bundle/' + BUNDLE[e] + '/';
const manifestP: Partial<Record<TexEngine, Promise<Manifest | null>>> = {};
const manifest = (e: TexEngine) => (manifestP[e] ??= fetch(dir(e) + 'manifest.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() as Promise<Manifest> : null)).catch(() => null).then((m) => { if (!m) delete manifestP[e]; return m; }));
const bytes = (m: Manifest) => m.chunks.reduce((n, c) => n + c.size, 0);

/** Every chunk of the bundle is already in this browser. */
async function cached(e: TexEngine, m: Manifest) {
  if (typeof caches === 'undefined') return false;
  try {
    const c = await caches.open(TEX_CACHE);
    return (await Promise.all(m.chunks.map((k) => c.match(dir(e) + k.file)))).every(Boolean);
  } catch { return false; }
}
/**
 * Chunks (and fonts fetched as needed) of an earlier bundle of this engine go once this one has loaded. The fonts
 * both engines share (tex/bundle/fonts, named from the manifest's folder as ../fonts/…) are outside it and stay.
 */
async function prune(e: TexEngine, m: Manifest) {
  if (typeof caches === 'undefined') return;
  try {
    const c = await caches.open(TEX_CACHE), keep = new Set([...m.chunks.map((k) => k.file), ...Object.values(m.lazy || {}).map(([f]) => f)].map((f) => new URL(f, dir(e)).href));
    for (const req of await c.keys()) if (req.url.startsWith(dir(e)) && /\.(gz|bin)$/.test(req.url) && !keep.has(req.url)) await c.delete(req);
  } catch { /* storage unavailable: nothing to tidy */ }
}

const supportP: Partial<Record<TexEngine, Promise<TexSupport>>> = {};
/** Checked once per engine: WebAssembly (and memory for it), workers, gzip streams, the bundle on this site, and room to keep it. */
function support(engine: TexEngine = 'pdflatex'): Promise<TexSupport> {
  return supportP[engine] ??= (async (): Promise<TexSupport> => {
    try { if (typeof WebAssembly !== 'object' || !WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))) return { ok: false, reason: 'wasm' }; }
    catch { return { ok: false, reason: 'wasm' }; }
    if (typeof Worker !== 'function') return { ok: false, reason: 'worker' };
    if (typeof DecompressionStream !== 'function') return { ok: false, reason: 'stream' };
    try { new WebAssembly.Memory({ initial: 2048 }); } catch { return { ok: false, reason: 'memory' }; } // 128 MB
    const m = await manifest(engine);
    if (!m) { delete supportP[engine]; return { ok: false, reason: 'bundle' }; }
    const size = bytes(m), have = await cached(engine, m);
    if (!have) {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      if (est && est.quota && est.quota - (est.usage || 0) < size * 1.5) { delete supportP[engine]; return { ok: false, reason: 'space' }; }
    }
    return { ok: true, size, cached: have, texlive: m.texlive };
  })();
}

// one running engine: its workers (pdfTeX; or XeTeX and dvipdfmx), each loaded with the bundle
interface Running { workers: Worker[]; listen: ((m: any) => void)[]; ready: Promise<Manifest> }
const running: Partial<Record<TexEngine, Running>> = {};
function stop(engine?: TexEngine) {
  for (const e of engine ? [engine] : (Object.keys(running) as TexEngine[])) { running[e]?.workers.forEach((w) => w.terminate()); delete running[e]; }
}
/** A worker for one of SwiftLaTeX's engines, loaded with the bundle; `onProgress` hears the download. */
function startWorker(kind: 'pdftex' | 'xetex' | 'dvipdfm', e: TexEngine, m: Manifest, R: Running, i: number, onProgress?: Progress) {
  return new Promise<void>((res, rej) => {
    const w = new Worker(base() + 'tex-worker.js', { name: kind });
    R.workers[i] = w;
    w.onerror = (ev) => rej(new Error(ev.message || 'the LaTeX engine did not start'));
    w.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.cmd === 'td:progress') onProgress?.(d.done, bytes(m));
      else if (d.cmd === 'td:loaded') { w.onmessage = (x) => R.listen[i]?.(x.data); res(); }
      else if (d.cmd === 'td:error') rej(new Error(d.message));
    };
    w.postMessage({ cmd: 'td:load', base: dir(e), manifest: m });
  });
}
/** Start an engine and load its bundle (downloading it the first time); `onProgress` hears the download. */
function prepare(engine: TexEngine = 'pdflatex', onProgress?: Progress): Promise<Manifest> {
  const have = running[engine];
  if (have) return have.ready;
  const R: Running = { workers: [], listen: [], ready: null as any };
  running[engine] = R;
  R.ready = (async () => {
    const m = await manifest(engine);
    if (!m) throw new Error('the LaTeX bundle is not on this site');
    if (engine === 'pdflatex') await startWorker('pdftex', engine, m, R, 0, onProgress);
    // the second loads from the cache the first filled
    else { await startWorker('xetex', engine, m, R, 0, onProgress); await startWorker('dvipdfm', engine, m, R, 1); }
    delete supportP[engine]; // the bundle is in this browser now
    void prune(engine, m);
    dispatchEvent(new Event('tex-offline'));
    return m;
  })().catch((err) => { stop(engine); throw err; });
  return R.ready;
}

/**
 * TeX's errors: each "! message" with the line it stopped on ("l.12 …"), at most `max`. A missing file is said
 * plainly. The engine also runs BibTeX after LaTeX; what that prints is not looked at.
 */
function parseLog(log: string, max = 8): TexError[] {
  const tex = log.split(/\nThis is BibTeX/)[0], out: TexError[] = [];
  const lines = tex.split('\n');
  for (let i = 0; i < lines.length && out.length < max; i++) {
    if (!lines[i].startsWith('! ') || /^!\s+==> Fatal error occurred/.test(lines[i])) continue; // (that one follows any error)
    let message = lines[i].slice(2).trim();
    // a message TeX wraps at 79 columns continues on the next lines, up to an empty one or the help
    for (let k = i + 1; k < lines.length && lines[k] && !lines[k].startsWith('l.') && !/^(See the|Type {2}H|\s*\.\.\.)/.test(lines[k]) && message.length < 300; k++) {
      if (lines[k - 1].length < 79) break;
      message += lines[k];
    }
    let line: number | null = null;
    for (let k = i + 1; k < Math.min(lines.length, i + 30); k++) { const m = /^l\.(\d+)/.exec(lines[k]); if (m) { line = +m[1]; break; } if (lines[k].startsWith('! ')) break; }
    if (!out.some((e) => e.line === line && e.message === message)) out.push({ line, message });
  }
  if (!out.length && /Emergency stop|Fatal error/.test(tex)) out.push({ line: null, message: (/^!?\s*(.*(?:Emergency stop|Fatal error).*)$/m.exec(tex) || [])[1] || 'Fatal error' });
  return out;
}

let queue: Promise<unknown> = Promise.resolve();
/** One message to one of an engine's workers, and its answer (td:result or td:error). */
function ask(R: Running, i: number, msg: unknown, transfer: Transferable[] = []) {
  return new Promise<any>((res) => {
    R.listen[i] = (d) => { if (d.cmd !== 'td:result' && d.cmd !== 'td:error') return; R.listen[i] = () => {}; res(d); };
    R.workers[i].postMessage(msg, transfer);
  });
}
/**
 * Compile a LaTeX document (`files`: what it includes, by the name it uses) with pdfLaTeX or XeLaTeX and get the PDF,
 * or TeX's errors. One compile at a time; one that runs over `timeout` stops the engine, which starts again on the next.
 */
function compile(src: string, files: Record<string, string | Uint8Array> = {}, { engine = 'pdflatex', timeout = 90e3, onProgress }: { engine?: TexEngine; timeout?: number; onProgress?: Progress } = {}): Promise<TexResult> {
  const run = queue.then(async (): Promise<TexResult> => {
    await prepare(engine, onProgress);
    const R = running[engine]!, t0 = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<TexResult>((res) => { timer = setTimeout(() => { stop(engine); res({ ok: false, log: '', errors: [], missing: [], ms: performance.now() - t0, timedOut: true }); }, timeout); });
    const work = (async (): Promise<TexResult> => {
      const d = await ask(R, 0, { cmd: 'td:compile', src, files });
      const log = String(d.log || d.message || ''), made = d.cmd === 'td:result' && d.ok && !!d.pdf;
      if (!made) return { ok: false, log, errors: parseLog(log), missing: d.missing || [], ms: performance.now() - t0 };
      if (engine === 'pdflatex') return { ok: true, pdf: new Uint8Array(d.pdf), log, errors: [], missing: [], ms: performance.now() - t0 };
      // XeTeX made main.xdv: dvipdfmx makes the PDF (the document's pictures with it, which it embeds)
      const x = await ask(R, 1, { cmd: 'td:compile', src: new Uint8Array(d.pdf), files });
      const ok = x.cmd === 'td:result' && x.ok && !!x.pdf;
      return { ok, pdf: ok ? new Uint8Array(x.pdf) : undefined, log: ok ? log : log + '\n' + String(x.log || x.message || ''), errors: ok ? [] : parseLog(String(x.log || x.message || '')), missing: x.missing || [], ms: performance.now() - t0 };
    })();
    try { return await Promise.race([work, late]); } finally { clearTimeout(timer); }
  });
  queue = run.catch(() => {});
  return run;
}

// ---- offline: both engines kept in this browser ahead of time (the installed app's Download TeX engine button)
const ENGINES: TexEngine[] = ['pdflatex', 'xelatex'];
// the engine's own files beside the bundle (tex/): the worker, and SwiftLaTeX's scripts and WebAssembly
const ENGINE_FILES: Record<TexEngine, string[]> = { pdflatex: ['tex-worker.js', 'swiftlatexpdftex.js', 'swiftlatexpdftex.wasm'], xelatex: ['tex-worker.js', 'swiftlatexxetex.js', 'swiftlatexxetex.wasm', 'swiftlatexdvipdfm.js', 'swiftlatexdvipdfm.wasm'] };
const files = (e: TexEngine, m: Manifest) => [...ENGINE_FILES[e].map((f) => base() + f), dir(e) + 'manifest.json', ...m.chunks.map((k) => dir(e) + k.file)];
// the WebAssembly's sizes (SwiftLaTeX v20022022, vendored in public/tex: they never change), for the size shown
const WASM_BYTES: Record<string, number> = { 'swiftlatexpdftex.wasm': 1782913, 'swiftlatexxetex.wasm': 3073718, 'swiftlatexdvipdfm.wasm': 700674 };
/** The engines this site has that this browser doesn't keep yet, and what downloading them takes. */
async function offlineNeed(): Promise<{ engines: TexEngine[]; size: number }> {
  if (typeof caches === 'undefined') return { engines: [], size: 0 };
  const out: TexEngine[] = [];
  let size = 0;
  const c = await caches.open(TEX_CACHE).catch(() => null);
  if (!c) return { engines: [], size: 0 };
  for (const e of ENGINES) {
    if (!(await support(e)).ok) continue; // not on this site, or this browser can't run it
    const m = await manifest(e);
    if (!m) continue;
    const all = files(e, m), have = await Promise.all(all.map((u) => c.match(u)));
    if (have.every(Boolean)) continue;
    out.push(e);
    size += m.chunks.reduce((n, k, i) => n + (have[i + ENGINE_FILES[e].length + 1] ? 0 : k.size), 0);
    for (const [i, f] of ENGINE_FILES[e].entries()) if (!have[i]) size += WASM_BYTES[f] || 0;
  }
  return { engines: out, size };
}
/**
 * Keep both engines in this browser now, for compiling, printing and exporting offline: their files go straight into
 * the cache the service worker reads them from (nothing is started). `onProgress` hears the bytes.
 */
async function downloadOffline(onProgress?: Progress) {
  const need = await offlineNeed();
  if (!need.engines.length) return;
  // asked, not waited for: Firefox asks the person, and the download needn't wait for the answer
  try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* the browser decides */ }
  const c = await caches.open(TEX_CACHE);
  let done = 0;
  for (const e of need.engines) {
    const m = (await manifest(e))!;
    for (const url of files(e, m)) {
      if (await c.match(url)) continue;
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const body = await r.clone().arrayBuffer();
      await c.put(url, r);
      done += url.endsWith('.wasm') ? WASM_BYTES[url.slice(url.lastIndexOf('/') + 1)] || 0 : /\.gz$/.test(url) ? body.byteLength : 0;
      onProgress?.(done, need.size);
    }
    delete supportP[e];
    void prune(e, m);
  }
  dispatchEvent(new Event('tex-offline'));
}

export const texEngine = { support, prepare, compile, parseLog, stop, offlineNeed, downloadOffline };
TD.texEngine = texEngine;
