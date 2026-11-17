import { MathRenderQueue } from '../platform/math-render-queue';
import { mathmlSvg } from './mathml-svg';
import { runtime as TD } from '../runtime';
import { t, onLocale } from '../i18n';
// Maths parsing: KaTeX HTML or Temml MathML with deterministic SVG layout.
// Scene labels isolate the resulting layout before applying SVG scene transforms.
// Everything that draws maths calls TD.math.render(); the choice is a per-browser preference.
(function () {
  const KEY = 'diagramtex.engine';
  const ENGINES: Record<string, any> = {
    katex: { name: 'KaTeX', note: () => t('engine.katex.note', 'Thicker text, better for displays') },
    temml: { name: 'Temml', note: () => t('engine.temml.note', 'Closer to CMU, better for print') },
  };
  let engine = 'katex';
  try { const v = localStorage.getItem(KEY); if (v && ENGINES[v]) engine = v; } catch (e: any) { /* storage blocked */ }
  const lib = (e: any) => (e === 'temml' ? window.temml : window.katex);
  if (!lib(engine)) engine = 'katex';

  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  // xcolor's colour expressions, which KaTeX and Temml don't read: rgb,255:red,92;green,214;blue,92 is the named
  // colours mixed by their weights (over 255, or over the weights' sum when no divisor is given) → #rrggbb
  const BASIC: Record<string, string> = { red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff', yellow: '#ffff00', black: '#000000', white: '#ffffff', gray: '#808080', orange: '#ff8000', violet: '#800080', purple: '#bf0040', brown: '#bf8040', lime: '#bfff00', olive: '#808000', pink: '#ffbfbf', teal: '#008080', darkgray: '#404040', lightgray: '#bfbfbf' };
  const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  function xcolorExpr(spec: string, base: (name: string) => string | undefined = (n: string) => BASIC[n]): string | null {
    const m = /^\s*(rgb|RGB)\s*(?:,\s*([\d.]+))?\s*:\s*([\s\S]+)$/.exec(String(spec || ''));
    if (!m) return null;
    const acc = [0, 0, 0];
    let sum = 0;
    for (const part of m[3].split(';')) {
      const q = /^\s*([^,]+?)\s*,\s*([\d.]+)\s*$/.exec(part), h = q && base(q[1]);
      if (!h) return null;
      const w = parseFloat(q![2]);
      [1, 3, 5].forEach((i, k) => { acc[k] += w * parseInt(h.slice(i, i + 2), 16); });
      sum += w;
    }
    const div = m[2] != null ? parseFloat(m[2]) : sum;
    if (!(div > 0)) return null;
    return '#' + acc.map((v) => hex2(v / div)).join('');
  }
  // \textcolor[RGB]{92,214,92}, [rgb]{…}, [HTML]{…}, [gray]{…} and {rgb,255:…}: written as #rrggbb for the renderer
  function modelHex(model: string, v: string): string | null {
    const n = v.split(',').map((x: any) => parseFloat(x));
    if (model === 'HTML') return /^[0-9a-f]{6}$/i.test(v.trim()) ? '#' + v.trim() : null;
    if (model === 'gray') return isFinite(n[0]) ? '#' + hex2(n[0] * 255).repeat(3) : null;
    if (n.length !== 3 || !n.every(isFinite)) return null;
    return '#' + n.map((x: any) => hex2(model === 'RGB' ? x : x * 255)).join('');
  }
  function colors(tex: string): string {
    if (!/\\(text)?color|\\colorbox/.test(tex)) return tex;
    return tex
      .replace(/\\(textcolor|color|colorbox)\s*\[\s*(rgb|RGB|HTML|gray)\s*\]\s*\{([^{}]*)\}/g, (all: any, c: any, model: any, v: any) => { const h = modelHex(model, v); return h ? `\\${c}{${h}}` : all; })
      .replace(/\\(textcolor|color|colorbox)\s*\{([^{}]*:[^{}]*)\}/g, (all: any, c: any, v: any) => { const h = xcolorExpr(v); return h ? `\\${c}{${h}}` : all; });
  }
  // Style commands LaTeX has (with a package, or a definition the export adds: TD.texNeeds) that an engine lacks,
  // drawn with the nearest one it has. Preview only: the exported LaTeX keeps what was typed. Each engine gets just
  // the ones it can't already render (Temml has \textsc, KaTeX doesn't).
  const STAND_INS = {
    mathbfit: '\\boldsymbol{#1}', // bold italic letters, upright bold digits, as isomath and unicode-math draw them
    mathds: '\\mathbb{#1}', mathbbm: '\\mathbb{#1}',
    textsl: '\\textit{#1}', textsc: '\\text{#1}',
    // text-mode declarations, as typed inside \text{…}
    bfseries: '\\bf', itshape: '\\it', slshape: '\\it', sl: '\\it', em: '\\it', upshape: '\\rm', rmfamily: '\\rm',
    sffamily: '\\sf', ttfamily: '\\tt', normalfont: '\\rm', mdseries: '', scshape: '', sc: '',
  };
  const macroCache: Record<string, any> = {};
  function macros(e: any) {
    if (macroCache[e]) return macroCache[e];
    const L = lib(e), out: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(STAND_INS)) {
      try { L.renderToString(`\\${k}{A}`, { throwOnError: true }); } catch (err: any) { out['\\' + k] = v; }
    }
    return (macroCache[e] = out);
  }
  // \textsc{Small caps} where the engine has no small caps: lowercase letters as smaller capitals
  const smallCaps = (tex: any) => tex.replace(/\\textsc\s*\{([^{}\\$]*)\}/g, (all: any, s: any) =>
    `\\text{${s.replace(/[a-z]+/g, (w: any) => `{\\footnotesize ${w.toUpperCase()}}`)}}`);
  let transitioning = false;
  const progress: ((ids: number[]) => void)[] = [];
  const readiness: (() => void)[] = [];
  const viewWork = new Set<Promise<void>>();
  const liveStyles = new Set<string>();
  function liveMarkup(html: string): string {
    return html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, (_, css: string) => {
      if (!liveStyles.has(css)) {
        liveStyles.add(css); const style = document.createElement('style');
        style.dataset.mathPreview = ''; style.textContent = css; document.head.append(style);
      }
      return '';
    });
  }
  let previewDepth = 0, finalDepth = 0, deferDepth = 0, priority = 2;
  // KaTeX is quick enough to compile in place, but thousands of new formulae at once would hold the page for
  // seconds. A preview draw compiles in place for SYNC_BUDGET_MS, then hands the rest to the worker like Temml.
  const SYNC_BUDGET_MS = 12;
  let syncSpent = 0;
  const pendingIds = (html: string): number[] => [...html.matchAll(/<!--td-math-pending:(\d+)-->/g)].map(match => +match[1]);
  const isPending = (html: string) => html.includes('<!--td-math-pending:');
  const cleanPreview = (html: string) => html.replace(/<!--td-math-pending:\d+-->/g, '');
  const languageNeutral = (html: string) => html.replace(/^<([a-z][\w-]*)(?=[\s>])/i, '<$1 lang=""');
  function compileResult(work: { engine: 'katex' | 'temml'; tex: string; display: boolean; macros: Record<string, string> }) {
    const options = { displayMode: work.display, macros: { ...work.macros }, throwOnError: true };
    try {
      const html = lib(work.engine).renderToString(work.tex, options);
      return { html: work.engine === 'temml' ? mathmlSvg(html) : html };
    } catch (error) {
      const html = lib(work.engine).renderToString(work.tex, { ...options, throwOnError: false });
      return { html: /(?:temml|katex)-error/.test(html) ? html : `<i>${esc(work.tex)}</i>`, error: String((error as Error).message || error) };
    }
  }
  const queue = new MathRenderQueue(compileResult, ids => {
    try { if (ids.length) { TD.clearPendingTextCache?.(ids); for (const fn of progress) fn(ids); } } finally { if (!queue.pending && !viewWork.size) transitioning = false; updateNote(); }
  });
  const resultKey = (e: string, source: string, display: boolean) => e + ':' + JSON.stringify([source, display]);
  function markup(e: string, result: { html: string; error?: string }, prepared: string, display: boolean) {
    return languageNeutral(e === 'temml' && !result.error
      ? `<span class="td-math${display ? ' td-math-display' : ''}" role="math" aria-label="${esc(prepared)}">${result.html}</span>` : result.html);
  }
  function render(tex: any, opts: Record<string, any> = {}) {
    const source = String(tex), display = !!opts.display, key = resultKey(engine, source, display);
    if (!lib(engine)) return `<i>${esc(source)}</i>`;
    let prepared = colors(source);
    const M = macros(engine);
    if (M['\\textsc']) prepared = smallCaps(prepared);
    let result = queue.results.get(key);
    if (!result && previewDepth && (engine === 'temml' || transitioning || deferDepth > 0 || syncSpent > SYNC_BUDGET_MS)) {
      const id = queue.request(key, { engine: engine as 'katex' | 'temml', tex: prepared, display, macros: M }, priority);
      const previousEngine = engine === 'temml' ? 'katex' : 'temml';
      const previous = queue.cached(resultKey(previousEngine, source, display));
      return (previous ? markup(previousEngine, previous, prepared, display)
        : `<span class="td-math-placeholder" style="display:inline-block;width:${Math.min(24, Math.max(2, source.length * .35))}em;height:1em" aria-label="${esc(source)}"></span>`) + `<!--td-math-pending:${id}-->`;
    }
    if (!result) {
      const start = previewDepth ? performance.now() : 0;
      result = { id: 0, ...compileResult({ engine: engine as 'katex' | 'temml', tex: prepared, display, macros: M }) };
      if (previewDepth) syncSpent += performance.now() - start;
      queue.remember(key, result);
    }
    if (result.error && opts.throwOnError) throw new Error(result.error);
    return markup(engine, result, prepared, display);
  }
  function preview<T>(draw: () => T, defer = false): T {
    if (!previewDepth) syncSpent = 0; // each outermost draw has its own budget
    previewDepth++; if (defer) deferDepth++;
    try { return draw(); } finally { previewDepth--; if (defer) deferDepth--; }
  }
  function synchronous<T>(draw: () => T): T {
    const previous = previewDepth; previewDepth = 0; finalDepth++;
    try { return draw(); } finally { previewDepth = previous; finalDepth--; }
  }
  // Standalone SVG files carry their own stylesheet. No fonts are linked from anywhere: the exports embed the
  // local copies (TD.inlineMathCss in src/application/docview.ts), so nothing is requested from another site.
  const CSS: Record<string, any> = {
    katex: '.tx{font-family:KaTeX_Main,"Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}.tx .katex{font-size:1em}',
    temml: '.tx{font-family:KaTeX_Main,"Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}',
  };
  const exportStyle = () => `<style>${CSS[engine]}.td-math{display:inline-block;line-height:0;white-space:nowrap}.td-math-display{display:block;text-align:center;margin:1em 0}</style>`;

  // Standalone SVGs need the MathML namespace on their embedded formulae.
  const forXml = (html: any) => html.replace(/<math(?![^>]*\bxmlns=)/g, '<math xmlns="http://www.w3.org/1998/Math/MathML"');

  const listeners: any[] = [];
  const beforeChange: (() => void)[] = [];
  function set(e: any) {
    if (!ENGINES[e] || e === engine || !lib(e)) return;
    for (const fn of beforeChange) fn();
    queue.cancel(); TD.docview?.cancelProgress?.(); TD.app?.cancelMathViews?.(); viewWork.clear();
    TD.retainPreviewSizes?.();
    transitioning = true;
    queue.deferCached(e + ':');
    engine = e;
    try { localStorage.setItem(KEY, e); } catch (err: any) { /* ignore */ }
    document.documentElement.dataset.engine = e;
    if (TD.clearTextCache) TD.clearTextCache();
    for (const fn of listeners) fn(e);
    updateNote();
  }
  document.documentElement.dataset.engine = engine;

  // Picker in the left sidebar, under the file list: one segmented switch, the active engine's note below.
  function updateNote() {
    for (const fn of readiness) fn();
    const box = document.getElementById('engineBox'), note = box?.querySelector('.eng-note');
    if (!box || !note) return;
    box.setAttribute('aria-busy', String(queue.pending > 0 || viewWork.size > 0));
    const text = (queue.pending || viewWork.size)
      ? t('engine.loading', 'Rendering {name}… You can keep editing.', { name: ENGINES[engine].name })
      : t('engine.note', '{note}. Exported LaTeX is the same for both engines.', { note: ENGINES[engine].note() });
    if (note.textContent !== text) note.textContent = text;
  }
  function mount() {
    const box = document.getElementById('engineBox');
    if (!box) return;
    box.innerHTML = `<div class="eng-head">${esc(t('ui.latex.engine', 'LaTeX engine'))}</div>
      <div class="eng-seg" role="radiogroup">${Object.entries<any>(ENGINES).map(([k, v]) =>
        `<button type="button" role="radio" data-engine="${k}" aria-checked="${k === engine}" class="${k === engine ? 'on' : ''}"${lib(k) ? '' : ' disabled'} title="${esc(v.note())}">${v.name}</button>`).join('')}</div>
      <div class="eng-note" role="status">${esc(t('engine.note', '{note}. Exported LaTeX is the same for both engines.', { note: ENGINES[engine].note() }))}</div>`;
  }
  document.addEventListener('click', (e) => { const b = (e.target! as Element).closest && (e.target! as Element).closest('#engineBox [data-engine]'); if (b) set((b as HTMLElement).dataset.engine); });
  listeners.push(() => { mount(); updateNote(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => onLocale(() => { mount(); updateNote(); })); else onLocale(() => { mount(); updateNote(); });

  TD.xcolorExpr = xcolorExpr;
  TD.math = {
    render, set, exportStyle, forXml, ENGINES, preview, synchronous, isPending, cleanPreview, pendingIds, liveMarkup,
    get previewing() { return previewDepth > 0; },
    get finalizing() { return finalDepth > 0; },
    get pending() { return queue.pending + viewWork.size; },
    hasPendingJob: (id: number) => queue.has(id),
    trackView(work: Promise<void>) { const first = !viewWork.size && !queue.pending; viewWork.add(work); if (first) updateNote(); void work.finally(() => { viewWork.delete(work); if (!queue.pending && !viewWork.size) { transitioning = false; TD.clearPendingTextCache?.([]); } updateNote(); }); },
    get usingWorker() { return queue.usingWorker; },
    async whenReady() { do { await queue.ready(); await Promise.all([...viewWork]); } while (queue.pending || viewWork.size); }, cancelPending: () => { transitioning = false; queue.cancel(); TD.docview?.cancelProgress?.(); TD.app?.cancelMathViews?.(); viewWork.clear(); TD.clearPendingTextCache?.(); updateNote(); },
    withPriority<T>(rank: number, draw: () => T): T {
      const previous = priority; priority = rank;
      try { return draw(); } finally { priority = previous; }
    },
    prioritize: (ids: number[], rank: number) => queue.promote(ids, rank),
    onReadiness(fn: () => void) { readiness.push(fn); fn(); },
    onProgress(fn: (ids: number[]) => void) { progress.push(fn); }, // ids: the formulae just finished
    // a command the engine in use lacks but draws with a stand-in (STAND_INS)
    drawsAs: (name: any) => !!macros(engine)['\\' + name],
    get engine() { return engine; },
    onBeforeChange(fn: () => void) { beforeChange.push(fn); },
    onChange(fn: any) { listeners.push(fn); },
  };
})();
