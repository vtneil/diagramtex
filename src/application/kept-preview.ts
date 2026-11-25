// TikZ code kept as written (src/domain/rawtikz.ts), drawn on the canvas by the in-browser pdfLaTeX: the picture
// LaTeX makes, in place of the importer's approximation. Only for code outside the specialised editors: code written
// in a package or library that has a block editor of its own (circuits, commutative diagrams, trees, plots …) is
// drawn by the app, so it stays editable there. The exported LaTeX is unchanged; this is the preview alone.
//
// A kept statement is compiled in the picture it came from (its group, `g`): the rest of the picture is written too,
// for its names, styles and size, but drawn invisibly (TD.toTikz `only`), so the picture shows the statement's ink
// alone, placed by the bounding box TeX reports (TDBB in the log). When TeX stops in the picture, each statement is
// tried again with only the picture's definitions and the shapes the app draws round it. A package or TikZ library
// the engine hasn't is left out and the picture compiled again (a source's preamble loads many it doesn't use).
// Statements compile one at a time, in the background, once the LaTeX engine is in this browser (or the person asks
// for it: allow()); each result is kept here and in a cache of its own, by the code compiled, so a file opened again
// is drawn at once.
import { runtime as TD } from '../runtime';
import { texEngine, type TexSupport } from '../platform/tex-engine';
import { pdfImage } from '../platform/pdf-image';

const PT_PER_CM = 72.27 / 2.54, BP_PER_CM = 72 / 2.54;
const PREVIEW_CACHE = 'diagramtex-previews'; // public/sw.js keeps it
const ENGINE = 'pdflatex' as const;

// what has an editor of its own: packages, TikZ libraries, and the commands and environments that use them
const EDITOR_PKGS = new Set(['circuitikz', 'tikz-cd', 'forest', 'xy', 'tikz-feynman', 'tikz-timing', 'pgf-umlcd', 'pgf-umlsd', 'chemfig',
  'tikz-chemlab', 'quantikz', 'zx-calculus', 'karnaugh-map', 'bytefield', 'pgf-pie', 'blochsphere', 'pgfplots', 'tikz-3dplot', 'tkz-euclide']);
const EDITOR_LIBS = new Set(['automata', 'graphs', 'quantikz2', 'circuits.ee.IEC', 'circuits.logic.US', 'circuits.logic.IEC', 'circuits.logic.CDH']);
const EDITOR_CODE = new RegExp([
  String.raw`\\begin\s*\{(?:tikzcd|forest|axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|groupplot|circuitikz|quantikz|ZX|karnaugh-map|bytefield|tikztimingtable|sequencediagram|class|interface|abstractclass|object|blochsphere|feynman|feynmandiagram)\}`,
  String.raw`\\(?:addplot|addplot3|xymatrix|chemfig|feynmandiagram|Tree|graph|tdplotsetmaincoords|tdplotdrawarc|pie|texttiming|tikztiming|umlnote|ctikzset|tkz[A-Z][A-Za-z]*)(?![A-Za-z])`,
  String.raw`\btdplot_(?:main|rotated)_coords\b`,
  // circuitikz's components on a plain path: to[R=…], to[C], to[battery] …
  String.raw`\bto\s*\[\s*(?:R|C|L|V|I|D|vR|pR|short|open|battery1?|lamp|led|fuse|switch|nos|ncs|sV|sI|cV|cI|american|european)\b\s*[=,\]]`,
].join('|'));

const editorMemo = new Map<string, boolean>();
/** Whether kept code (with the scopes it sits in: \begin{scope}[tdplot_main_coords]) is a block's: an editor's package, library or command. */
function editorCode(x: any): boolean {
  const code = String(x.code || '') + (x.ctx && x.ctx.length ? '\n%' + x.ctx.join('\n%') : '');
  let ed = editorMemo.get(code);
  if (ed === undefined) {
    const u = TD.lint?.uses ? TD.lint.uses(code) : { libs: [], pkgs: [] };
    const v: boolean = EDITOR_CODE.test(code) || u.pkgs.some((p: string) => EDITOR_PKGS.has(p)) || u.libs.some((l: string) => EDITOR_LIBS.has(l));
    if (editorMemo.size > 2000) editorMemo.clear();
    editorMemo.set(code, ed = v);
  }
  return ed;
}
/**
 * Whether kept code may be drawn by LaTeX, by its own code: it draws, and nothing in it is a block's. (Its picture is
 * looked at too, when it is drawn: one that has a block, or a block's code, is the block's, all drawn by the app.)
 */
export function eligible(s: any): boolean {
  return !!s && s.type === 'tikz' && s.kind !== 'defs' && !s.pre && !!String(s.code || '').trim() && !editorCode(s);
}
// circuitikz's parts, by the Circuit block's own list (TD.CZ, src/domain/czcore.ts): what to[…] draws, what a node is
let parts: { bipole: Set<string>; node: Set<string> } | null = null;
function czParts() {
  if (!parts && TD.CZ?.parts) {
    parts = { bipole: new Set(), node: new Set() };
    for (const p of Object.values<any>(TD.CZ.parts)) if (p && p.tikz) (p.kind === 'node' ? parts.node : parts.bipole).add(String(p.tikz).split(/[=,]/)[0].trim());
  }
  return parts;
}
// an option list's keys: to[R=$R_1$, -*] → R, -*
const keysOf = (opts: string) => {
  const out: string[] = [];
  let d = 0, cur = '';
  for (const ch of opts + ',') {
    if (ch === '{') d++; else if (ch === '}') d--;
    if (ch === ',' && !d) { const k = cur.split('=')[0].trim(); if (k) out.push(k); cur = ''; } else cur += ch;
  }
  return out;
};
/**
 * The picture is a circuit's or an automaton's by what its code uses, the file loading the package or library:
 * circuitikz's parts on paths (to[cspst], with the package or without), its nodes (node[nmos], \pgfnode{nfet},
 * \pgfnode{resistorshape}) and automata's states (nodes={state}, every state), names a picture may also give its own
 * styles (adder, state/.style), so only with the package loaded and the style not the picture's.
 */
function circuitOrAutomaton(ctx: any[]): boolean {
  const pkgs = new Set<string>(), libs = new Set<string>();
  for (const x of ctx) { for (const p of x.pkgs || []) pkgs.add(p); for (const l of x.libs || []) libs.add(l); }
  const text = ctx.map((x) => (x.type === 'tikz' ? String(x.code || '') + '\n' + (x.ctx || []).join('\n') : '') + '\n' + (x.tex?.po || '')).join('\n');
  const own = (name: string) => new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*/\\.(?:style|code|append style|style args)`).test(text);
  const P = czParts();
  if (P) {
    for (const m of text.matchAll(/\bto\s*\[([^\]]*)\]/g)) if (keysOf(m[1]).some((k) => P.bipole.has(k.replace(/^\*/, '')))) return true;
    if (pkgs.has('circuitikz')) {
      for (const m of text.matchAll(/(?:\\node|\bnode)\s*(?:\([^()]*\)\s*)?(?:at\s*\([^()]*\)\s*)?\[([^\]]*)\]/g)) if (keysOf(m[1]).some((k) => P.node.has(k) && !own(k))) return true;
      for (const m of text.matchAll(/\\pgfnode\s*\{([^{}]*)\}/g)) if (P.node.has(m[1].trim()) || /shape$/.test(m[1].trim())) return true;
    }
  }
  if (libs.has('automata') && !own('state') && (/\bevery state\b/.test(text) || /[[{,]\s*(?:initial\s*,\s*|accepting\s*,\s*)*state\s*(?=[,\]}])/.test(text))) return true;
  return false;
}
// a block in the picture, or code that is one's (definitions too: \tikzset{every state/.style=…}; not the file's packages
// alone: a file that loads pgfplots for one figure may draw plain TikZ in the next)
const blockIn = (ctx: any[]) => ctx.some((x) => (x.type === 'tikz' ? !x.pre && editorCode(x) : !!TD.blocks?.get?.(x.type))) || circuitOrAutomaton(ctx);

// ---- results
interface Drawn { href: string; left: number; top: number; w: number; h: number } // cm: the page's top left, in picture coordinates
type Entry = { state: 'pending' } | { state: 'ok'; img: Drawn; shifted: boolean } | { state: 'error'; message: string };
const results = new Map<string, Entry>();

// the shapes a statement was imported with (its picture), in the file or in a Document's diagram (found by id: an
// export draws copies), with `s` itself in its place; null for a statement in neither (a preview of an import)
function siblings(s: any): any[] | null {
  const doc = TD.app?.state?.doc;
  const pools: any[][] = [doc?.shapes, ...((doc?.blocks || []) as any[]).map((b: any) => b && b.shapes)].filter(Array.isArray);
  for (const L of pools) {
    if (!L.some((x: any) => x.id === s.id)) continue;
    return s.g ? L.filter((x: any) => x.g === s.g && !x.hidden).map((x: any) => (x.id === s.id ? s : x)) : [s];
  }
  return null;
}
const draws = (x: any) => !(x.type === 'tikz' && (x.kind === 'defs' || x.pre));
interface Job { key: string; pic: string; list: any[]; only: string[] | undefined; shifted: boolean; id: string }
/**
 * What compiling a statement takes, and its key: its picture when other statements in it draw (exactly as exported,
 * the statement where it is now); alone (or with definitions only), it is compiled where it was imported and drawn
 * moved, so dragging it doesn't compile it again.
 */
function jobOf(s: any, ctx: any[]): Job {
  const others = ctx.some((x) => x !== s && draws(x));
  // copies, whole: the export writes a statement as it was imported only while every field matches what was imported
  // (else from the shape, without the picture's every node/.style); the key leaves out the approximate drawing
  const list = ctx.map((x) => (x === s && !others ? { ...x, x: 0, y: 0 } : { ...x }));
  const keyed = list.map((x) => { const c = { ...x }; delete c.prev; delete c.issues; return c; });
  const pic = JSON.stringify([ENGINE, TD.docMacros?.() || '', TD.docFontKey?.() || '', keyed]);
  return { key: JSON.stringify([others ? s.id : '', pic]), pic, list, only: others ? [s.id] : undefined, shifted: others, id: s.id };
}

// A statement's job for the task at hand: a drawing asks for its box many times (hit tests, snapping), and the
// shapes don't change within one task (a move made after, in the same task, changes only where the picture goes).
// An edit to the statement, another file opened or a shape added in the same task is seen; a statement in no file
// isn't kept (it may be in one before the task ends). BLOCK: the picture is a block's.
const BLOCK = 'block' as const;
let memo = new Map<any, { job: Job | typeof BLOCK; stamp: string; list: any[] }>();
function jobFor(s: any): Job | typeof BLOCK | null {
  const shapes = TD.app?.state?.doc?.shapes, n = Array.isArray(shapes) ? shapes.length : -1;
  const stamp = String(s.code) + '\u0000' + s.x + ',' + s.y + ',' + n + JSON.stringify(s.ctx || []), m = memo.get(s);
  if (m && m.stamp === stamp && m.list === shapes) return m.job;
  const ctx = siblings(s);
  if (!ctx) return null;
  const job = blockIn(ctx) ? BLOCK : jobOf(s, ctx);
  if (!memo.size) queueMicrotask(() => { memo = new Map(); });
  memo.set(s, { job, stamp, list: shapes });
  return job;
}

/**
 * Where a compiled statement is drawn on the canvas (px), or null while it isn't. Drawing it (`compile`) has it
 * compiled when it isn't yet; a size asked for (a bounding box) never does.
 */
export function drawnOf(s: any, compile = false): { href: string; x: number; y: number; w: number; h: number } | null {
  if (!eligible(s)) return null;
  const job = jobFor(s);
  if (!job || job === BLOCK) return null;
  const e = results.get(job.key);
  if (!e) { if (compile && allowed()) schedule(job); return null; }
  if (e.state !== 'ok') return null;
  const PX = TD.PX_PER_CM, dx = e.shifted ? 0 : s.x || 0, dy = e.shifted ? 0 : s.y || 0;
  return { href: e.img.href, x: e.img.left * PX + dx, y: -e.img.top * PX + dy, w: e.img.w * PX, h: e.img.h * PX };
}

// ---- when: the engine already in this browser (or running), or asked for
let support: TexSupport | null = null, running = false, asked = false;
const check = () => texEngine.support(ENGINE).then((r) => { const was = allowed(); support = r; if (!was && allowed()) changed(); }).catch(() => {});
const allowed = () => !!support && support.ok && (support.cached || running || asked);
if (typeof window !== 'undefined') {
  // (the engine started: for a compile, a print, or here)
  addEventListener('tex-offline', () => { running = true; void check(); });
  setTimeout(() => { void check(); }, 0);
}
/** Compile kept code from now on, downloading the engine if this browser hasn't it yet. */
export async function allow(onProgress?: (done: number, total: number) => void) {
  asked = true;
  await texEngine.prepare(ENGINE, onProgress);
  running = true;
  await check();
  changed();
}

// ---- compiling, one at a time
const queue: Job[] = [];
let busy = false, idle: (() => void)[] = [];
function schedule(job: Job) {
  if (results.has(job.key)) return;
  results.set(job.key, { state: 'pending' });
  queue.push(job);
  if (!busy) void pump();
}
async function pump() {
  busy = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      let e: Entry;
      try { e = await compileJob(job); } catch (err: any) { e = { state: 'error', message: String(err?.message || err) }; }
      results.set(job.key, e);
      changed();
    }
  } finally {
    busy = false;
    const fns = idle; idle = []; for (const f of fns) f();
  }
}
/** Resolves once nothing is waiting to compile (or after `ms`). */
export function settled(ms = 120e3): Promise<void> {
  if (!busy && !queue.length) return Promise.resolve();
  return new Promise((res) => { idle.push(res); setTimeout(res, ms); });
}

// the picture's bounding box in pt, from TikZ, when it ends (the outermost picture's is the last)
const BBOX = String.raw`\makeatletter\tikzset{every picture/.append style={execute at end picture={\typeout{TDBB:\the\pgf@picminx,\the\pgf@picminy,\the\pgf@picmaxx,\the\pgf@picmaxy}}}}\makeatother`;
const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function stored(hash: string): Promise<Drawn | null> {
  try { const c = await caches.open(PREVIEW_CACHE), r = await c.match(new URL('tex/previews/' + hash, document.baseURI).href); return r ? await r.json() : null; } catch { return null; }
}
async function store(hash: string, img: Drawn) {
  try {
    const c = await caches.open(PREVIEW_CACHE);
    await c.put(new URL('tex/previews/' + hash, document.baseURI).href, new Response(JSON.stringify(img), { headers: { 'Content-Type': 'application/json' } }));
    const keys = await c.keys(); // the oldest go past 400
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) await c.delete(k);
  } catch { /* storage unavailable: kept for this visit only */ }
}
/** TeX's message, naming the command when it is one TeX didn't know (the last read: the end of the context's first line). */
export function named(message: string | undefined, log: string): string | undefined {
  if (!message || !/^Undefined control sequence/.test(message)) return message;
  const at = log.indexOf('! Undefined control sequence'), line = at < 0 ? '' : log.slice(at).split('\n')[1] || '';
  const cs = line.match(/\\(?:[A-Za-z@]+|.)/g);
  return cs ? `Undefined control sequence ${cs[cs.length - 1]}` : message;
}
/** The document without the package or TikZ library TeX said it couldn't find (unchanged when it said neither). */
export function withoutMissing(doc: string, errors: string): string {
  const pkg = /File `([^'`]+)\.sty' not found/.exec(errors)?.[1], lib = /did not find the tikz library '([^']+)'/.exec(errors)?.[1];
  const drop = (re: RegExp, name: string) => doc.replace(re, (all, cmd, opt, list) => {
    const rest = String(list).split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== name);
    return rest.length ? `${cmd}${opt || ''}{${rest.join(', ')}}` : '';
  });
  if (pkg) return drop(/(\\(?:usepackage|RequirePackage))(\[[^\]]*\])?\{([^{}]*)\}/g, pkg);
  if (lib) return drop(/(\\usetikzlibrary)()\{([^{}]*)\}/g, lib);
  // a font this TeX hasn't (Font U/MnSymbolA/m/n/9=MnSymbolA9 … not loadable): the source's statements setting up its
  // family, and the symbol fonts and maths symbols on it, are left out; a family a package's own .fd gives (pifont's
  // pzd) takes the package. What used them is then undefined, which TeX goes past.
  const fam = /Font ([^/\s]+)\/([^/\s]+)\/[^=]*=\S+ at [^ ]+ not loadable/.exec(errors);
  if (fam) {
    const less = withoutFontFamily(doc, fam[1], fam[2]);
    if (less !== doc) return less;
    const owner = FONT_PACKAGES.find(([re]) => re.test(fam[2]))?.[1];
    if (owner) return drop(/(\\(?:usepackage|RequirePackage))(\[[^\]]*\])?\{([^{}]*)\}/g, owner);
  }
  return doc;
}
// families a package's own font definitions give, and the package
const FONT_PACKAGES: [RegExp, string][] = [[/^(pzd|psy)$/, 'pifont'], [/^math[abx]$/, 'mathabx'], [/^MnSymbol[A-F]$/, 'MnSymbol'], [/^wasy$/, 'wasysym'], [/^stmry$/, 'stmaryrd'], [/^(bbold|bbm)$/, 'bbm']];
// how many arguments each font statement takes
const FONT_STMTS: Record<string, number> = {
  DeclareFontFamily: 3, DeclareFontShape: 6, DeclareFontSubstitution: 4, DeclareSymbolFont: 5, SetSymbolFont: 6,
  DeclareMathSymbol: 4, DeclareMathDelimiter: 6, DeclareMathAccent: 4, DeclareMathRadical: 5, DeclareSymbolFontAlphabet: 2,
  DeclareMathAlphabet: 5, SetMathAlphabet: 6,
};
/** `doc` without the statements setting up font family `fam` in encoding `enc`, and the symbol fonts and maths on it. */
export function withoutFontFamily(doc: string, enc: string, fam: string): string {
  const stmts: { from: number; to: number; kind: string; args: string[] }[] = [];
  for (const m of doc.matchAll(/\\([A-Za-z]+)(?![A-Za-z])/g)) {
    const n = FONT_STMTS[m[1]];
    if (n == null) continue;
    let i = m.index! + m[0].length;
    const args: string[] = [];
    while (args.length < n) {
      while (/\s/.test(doc[i] || '')) i++;
      if (doc[i] === '{') {
        let d = 0, j = i;
        for (; j < doc.length; j++) { if (doc[j] === '\\') { j++; continue; } if (doc[j] === '{') d++; else if (doc[j] === '}' && --d === 0) break; }
        if (j >= doc.length) break;
        args.push(doc.slice(i + 1, j).trim()); i = j + 1;
      } else if (doc[i] === '\\') { const c = /^\\[A-Za-z@]+/.exec(doc.slice(i)); if (!c) break; args.push(c[0]); i += c[0].length; } else break;
    }
    if (args.length === n) stmts.push({ from: m.index!, to: i, kind: m[1], args });
  }
  const onFam = (s: any) => s.args.includes(fam) && s.args.includes(enc);
  const sym = new Set(stmts.filter((s) => (s.kind === 'DeclareSymbolFont' || s.kind === 'SetSymbolFont') && onFam(s)).map((s) => s.args[0]));
  const out = stmts.filter((s) => onFam(s) || ((/^DeclareMath|^DeclareSymbolFontAlphabet$/.test(s.kind)) && s.args.some((a) => sym.has(a))));
  if (!out.length) return doc;
  let r = doc;
  for (const s of out.sort((a, b) => b.from - a.from)) r = r.slice(0, s.from) + r.slice(s.to);
  return r;
}
// pictures TeX stopped in (the same for each statement in them), with its message
const failed = new Map<string, string>();
/**
 * A statement compiled in its picture; when TeX stops in the picture (another statement's code may be what it
 * stopped at), with only what the app draws of the picture and its definitions round it.
 */
async function compileJob(job: Job): Promise<Entry> {
  let first: Entry | null = null;
  if (!failed.has(job.pic)) {
    first = await compileList(job.list, job.only, job.shifted);
    if (first.state !== 'error' || !job.only) return first;
    if (failed.size > 200) failed.clear();
    failed.set(job.pic, first.message);
  }
  const own = job.list.filter((x) => x.id === job.id || !(x.type === 'tikz' && draws(x)));
  const alone = own.length < job.list.length ? await compileList(own, job.only, job.shifted) : null;
  return alone && alone.state === 'ok' ? alone : first || { state: 'error', message: failed.get(job.pic) || 'no PDF' };
}
async function compileList(list: any[], only: string[] | undefined, shifted: boolean): Promise<Entry> {
  const tex = TD.toTikz(list, { standalone: true, engine: ENGINE, only });
  const src = (TD.texImages?.noInkscape ? TD.texImages.noInkscape(tex) : tex).replace('\\begin{document}', BBOX + '\n\\begin{document}');
  const hash = await sha(src + '\n' + (support && support.ok ? support.texlive : ''));
  const kept = await stored(hash);
  if (kept) return { state: 'ok', img: kept, shifted };
  // a package or TikZ library the source loads that this engine hasn't is left out, and the picture tried again:
  // the source's preamble loads many a picture doesn't use
  let doc = src, r = await texEngine.compile(doc, {}, { engine: ENGINE, timeout: 30e3 });
  for (let n = 0; n < 4 && !r.ok && !r.timedOut; n++) {
    const less = withoutMissing(doc, r.errors.map((e) => e.message).join('\n'));
    if (less === doc) break;
    doc = less; r = await texEngine.compile(doc, {}, { engine: ENGINE, timeout: 30e3 });
  }
  if (!r.ok || !r.pdf) return { state: 'error', message: r.timedOut ? 'timed out' : named(r.errors[0]?.message, r.log) || 'no PDF' };
  const bb = [...r.log.matchAll(/TDBB:(-?[\d.]+)pt,(-?[\d.]+)pt,(-?[\d.]+)pt,(-?[\d.]+)pt/g)].pop();
  if (!bb) return { state: 'error', message: 'no bounding box' };
  const [x1, y1, x2, y2] = bb.slice(1).map((v) => +v / PT_PER_CM);
  if (!(x2 > x1) || !(y2 > y1)) return { state: 'error', message: 'nothing drawn' };
  // drawn at 4 times the canvas's own size, for zooming in
  const pic = await pdfImage(r.pdf, 4 * TD.PX_PER_CM / BP_PER_CM);
  const w = pic.width / BP_PER_CM, h = pic.height / BP_PER_CM;
  // the page is the picture with standalone's border round it
  const img: Drawn = { href: pic.href, left: x1 - (w - (x2 - x1)) / 2, top: y2 + (h - (y2 - y1)) / 2, w, h };
  void store(hash, img);
  return { state: 'ok', img, shifted };
}

// ---- drawing again when a result comes in
let frame = 0;
function changed() {
  if (frame || typeof requestAnimationFrame === 'undefined') return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (TD.app?.state?.mode === 'document') TD.docview?.render?.(); else TD.app?.render?.();
    TD.app?.renderProps?.();
  });
}

/** What the kept code's panel says about its drawing. */
export type KeptStatus = { kind: 'none' } | { kind: 'editor' } | { kind: 'drawn' } | { kind: 'compiling' } | { kind: 'error'; message: string } | { kind: 'offer'; size: number };
export function status(s: any): KeptStatus {
  if (!s || s.type !== 'tikz' || s.kind === 'defs' || s.pre) return { kind: 'none' };
  if (!eligible(s)) return { kind: 'editor' };
  const job = jobFor(s);
  if (job === BLOCK) return { kind: 'editor' };
  if (!support || !support.ok || !job) return { kind: 'none' };
  const e = results.get(job.key);
  if (e?.state === 'ok') return { kind: 'drawn' };
  if (e?.state === 'error') return { kind: 'error', message: e.message };
  if (e?.state === 'pending' || allowed()) return { kind: 'compiling' };
  return { kind: 'offer', size: support.size };
}

export const keptPreview = { eligible, drawnOf, allow, settled, status, withoutMissing, named };
TD.keptPreview = keptPreview;
