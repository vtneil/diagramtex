import { MathRenderQueue } from '../platform/math-render-queue';
import { mathmlSvg } from './mathml-svg';
import { parseMacros, expandEnvironments } from '../core/doc-macros';
import { rewriteMath, textcolorGroups, asMleftright } from './math-rewrite';
import { defineFunctions } from './math-functions';
import { runtime as TD } from '../runtime';
import { t } from '../i18n';
import { escapeHtml } from '../core/html';
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

  const esc = escapeHtml;
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
    return textcolorGroups(tex
      .replace(/\\(textcolor|color|colorbox)\s*\[\s*(rgb|RGB|HTML|gray)\s*\]\s*\{([^{}]*)\}/g, (all: any, c: any, model: any, v: any) => { const h = modelHex(model, v); return h ? `\\${c}{${h}}` : all; })
      .replace(/\\(textcolor|color|colorbox)\s*\{([^{}]*:[^{}]*)\}/g, (all: any, c: any, v: any) => { const h = xcolorExpr(v); return h ? `\\${c}{${h}}` : all; })
      // xcolor's own colours, which the engines would read as CSS's (CSS green is #008000, xcolor's #00ff00)
      .replace(/\\(textcolor|color|colorbox)\s*\{\s*([a-z]+)\s*\}/g, (all: any, c: any, v: any) => (BASIC[v] ? `\\${c}{${BASIC[v]}}` : all)));
  }
  // Style commands LaTeX has (with a package, or a definition the export adds: TD.texNeeds) that an engine lacks,
  // drawn with the nearest one it has. Preview only: the exported LaTeX keeps what was typed. Each engine gets just
  // the ones it can't already render (Temml has \textsc, KaTeX doesn't).
  // The engines give a macro as many arguments as its body names, counting #1, #2 … up to the first one it doesn't:
  // a stand-in that keeps only its last argument names the others in a comment, which reads them and draws nothing.
  const LAST = (n: number) => '%' + Array.from({ length: n - 1 }, (_, k) => '#' + (k + 1)).join('') + '\n#' + n;
  const GOBBLE = '%#1\n'; // takes an argument and draws nothing (\vspace{2pt})
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega'];
  const CAPITALS = ['gamma', 'delta', 'theta', 'lambda', 'xi', 'pi', 'sigma', 'upsilon', 'phi', 'psi', 'omega'];
  const STAND_INS: Record<string, string> = {
    mathbfit: '\\boldsymbol{#1}', // bold italic letters, upright bold digits, as isomath and unicode-math draw them
    mathds: '\\mathbb{#1}', mathbbm: '\\mathbb{#1}',
    textsl: '\\textit{#1}', textsc: '\\text{#1}',
    mbox: '\\text{#1}', // LaTeX's \mbox{…}: text in a box, as chemfig labels use it
    // text-mode declarations, as typed inside \text{…}
    bfseries: '\\bf', itshape: '\\it', slshape: '\\it', sl: '\\it', em: '\\it', upshape: '\\rm', rmfamily: '\\rm',
    sffamily: '\\sf', ttfamily: '\\tt', normalfont: '\\rm', mdseries: '', scshape: '', sc: '',
    // in a document's own macros: \ensuremath{…} (maths, in text too) and xspace's \xspace
    ensuremath: '\\TextOrMath{$#1$}{#1}', xspace: '',
    // counters and paragraph settings, which draw nothing in a formula
    stepcounter: GOBBLE, refstepcounter: GOBBLE, addtocounter: '%#1#2\n', setcounter: '%#1#2\n', centering: '', raggedright: '',
    raggedleft: '',
    // amsmath's capital accents (for use with \boldsymbol), and the LaTeX kernel's
    Hat: '\\hat{#1}', Check: '\\check{#1}', Tilde: '\\tilde{#1}', Acute: '\\acute{#1}', Grave: '\\grave{#1}', Dot: '\\dot{#1}',
    Ddot: '\\ddot{#1}', Breve: '\\breve{#1}', Bar: '\\bar{#1}', Vec: '\\vec{#1}', hdots: '\\ldots', strut: '\\vphantom{(}',
    vspace: GOBBLE, qedhere: '', boldmath: '', unboldmath: '', framebox: '\\fbox{#1}', makebox: '\\mbox{#1}', mathmakebox: '#1',
    textsubscript: '_{\\text{#1}}', textsuperscript: '^{\\text{#1}}', multicolumn: LAST(3),
    // packages: amsmath's \sideset, mathtools' \prescript, cancel, nicefrac / xfrac, graphicx, tensor, slashed,
    // centernot, booktabs, multirow, euscript and the like
    sideset: '{}#1{#3}#2', prescript: '{}^{#1}_{#2}{#3}', cancelto: '{\\cancel{#2}}^{#1}', nicefrac: '{}^{#1}\\!/_{#2}',
    sfrac: '{}^{#1}\\!/_{#2}', scalebox: LAST(2), rotatebox: LAST(2), resizebox: LAST(3), tensor: '{#1}#2', indices: '#1', slashed: '{\\not{#1}}',
    centernot: '\\mathrel{\\cancel{#1}}', midrule: '\\hline', toprule: '\\hline', bottomrule: '\\hline', multirow: LAST(3),
    EuScript: '\\mathcal{#1}', pazocal: '\\mathcal{#1}', mathpzc: '\\mathcal{#1}', mathbfcal: '\\boldsymbol{\\mathcal{#1}}',
    mathbold: '\\boldsymbol{#1}', mathbbmss: '\\mathbb{#1}', mathbbb: '\\mathbb{#1}',
    // ⫫ (independence; cmll's and Temml's \Perp): two ⊥ drawn together as one relation, as it is written by hand
    Perp: '\\mathrel{\\perp\\!\\!\\!\\perp}',
    // physics (its \qty(…) is rewritten: src/domain/math-rewrite.ts)
    abs: '\\left|#1\\right|', norm: '\\left\\|#1\\right\\|', dd: '\\mathrm{d}', dv: '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
    pdv: '\\frac{\\partial #1}{\\partial #2}', vb: '\\mathbf{#1}', vu: '\\hat{\\mathbf{#1}}', va: '\\vec{#1}',
    expval: '\\left\\langle #1\\right\\rangle', mel: '\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle',
    comm: '\\left[#1,#2\\right]', acomm: '\\left\\{#1,#2\\right\\}', order: '\\mathcal{O}\\left(#1\\right)',
    pqty: '\\left(#1\\right)', bqty: '\\left[#1\\right]', vqty: '\\left|#1\\right|', Bqty: '\\left\\{#1\\right\\}',
    Tr: '\\operatorname{Tr}', tr: '\\operatorname{tr}', Res: '\\operatorname{Res}', grad: '\\nabla', curl: '\\nabla\\times',
    laplacian: '\\nabla^2',
    // the kernel's and amsmath's: \let\sp=^ and \let\sb=_, \mspace{#1} = \mskip#1, \slash = /, \null = \hbox{} (an
    // empty ordinary atom, as {} is), \mathpalette, \m@th (\mathsurround, nothing in a formula)
    sp: '^', sb: '_', mspace: '\\mskip{#1}', slash: '/', null: '{}', 'm@th': '',
    mathpalette: '\\mathchoice{#1\\displaystyle{#2}}{#1\\textstyle{#2}}{#1\\scriptstyle{#2}}{#1\\scriptscriptstyle{#2}}',
    // LaTeX's lengths, read where a size goes (\\[\jot], \kern-\nulldelimiterspace): their values at 10pt
    jot: '3pt', nulldelimiterspace: '1.2pt', scriptspace: '0.5pt', arraycolsep: '5pt', tabcolsep: '6pt', fboxsep: '3pt',
    fboxrule: '0.4pt', thinmuskip: '3mu', medmuskip: '4mu', thickmuskip: '5mu',
    // upgreek: the upright Greek letters, drawn as the engine's own
    ...Object.fromEntries(GREEK.map((g) => ['up' + g, '\\' + g])),
    ...Object.fromEntries(CAPITALS.map((g) => ['Up' + g, '\\' + g[0].toUpperCase() + g.slice(1)])),
  };
  const macroCache: Record<string, any> = {};
  function standIns(e: any) {
    if (macroCache[e]) return macroCache[e];
    const L = lib(e), out: Record<string, any> = {};
    defineFunctions(L); // the tests and look-aheads (\ifthenelse, \nonscript …): math-functions.ts
    for (const [k, v] of Object.entries<any>(STAND_INS)) {
      // tried with as many arguments as the stand-in takes: the engine's own is kept when it has the command
      const n = Math.max(1, ...[...v.matchAll(/#(\d)/g)].map((m: RegExpMatchArray) => +m[1]));
      try { L.renderToString(`\\${k}` + '{A}'.repeat(n), { throwOnError: true, ...(e === 'katex' ? { strict: 'ignore' } : {}) }); } catch (err: any) { out['\\' + k] = v; }
    }
    return (macroCache[e] = out);
  }
  // The open file's own macros (page.macros, src/core/doc-macros.ts), over the stand-ins. Formulas are cached by
  // them too (docKey), so a change of macros draws every formula again.
  let docText = '', docMacros: Record<string, string> = {}, docKey = '', docNames = new Set<string>();
  // definitions the engines read from a \def with its parameter text (doc-macros.ts: optional arguments, delimited
  // ones), at the start of every formula; left out of the formula's annotation again (KaTeX's escaping)
  let docPrelude = '', preludeText = '';
  // the file's environments written out, and its \left and \right read as \mleft and \mright when they are mleftright's
  // (doc-macros.ts), in every formula and macro
  let ownText = (t: string) => t;
  const merged: Record<string, any> = {};
  function macros(e: any) {
    const k = e + ':' + docKey;
    return merged[k] ??= { ...standIns(e), ...docMacros };
  }
  const ownMacro = (name: string) => docNames.has('\\' + name);
  const hashText = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); };
  /** Draw formulas with these definitions (the open file's macros): true when they changed. */
  function useMacros(text: any) {
    const t = String(text || '');
    if (t === docText) return false;
    docText = t; docKey = t ? hashText(t) : '';
    const parsed = t ? parseMacros(t) : { macros: {}, prelude: [], environments: {}, statements: [], mleftright: false };
    docNames = new Set([...Object.keys(parsed.macros), ...parsed.statements.map((s) => s.name)]);
    const envs = parsed.environments, anyEnv = Object.keys(envs).length > 0, lr = parsed.mleftright;
    ownText = (x: string) => { const y = anyEnv ? expandEnvironments(x, envs) : x; return lr ? asMleftright(y) : y; };
    // their bodies drawn as formulas are (siunitx in a macro: \newcommand{\speed}{\SI{3}{m/s}})
    docMacros = Object.fromEntries(Object.entries(parsed.macros).map(([k, v]) => [k, rewriteMath(ownText(v), ownMacro)]));
    docPrelude = parsed.prelude.map((d) => rewriteMath(ownText(d), ownMacro)).join('');
    preludeText = docPrelude.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c]!);
    for (const key of Object.keys(merged)) delete merged[key];
    TD.clearTextCache?.();
    return true;
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
    // KaTeX's strict mode only warns in the console (an accent like \r in maths, met while a command is still being
    // typed); the drawing is the same. Temml's strict is a switch, left off.
    const options = { displayMode: work.display, macros: { ...work.macros }, throwOnError: true, ...(work.engine === 'katex' ? { strict: 'ignore' } : {}) };
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
  const resultKey = (e: string, source: string, display: boolean) => e + ':' + JSON.stringify([source, display, docKey]);
  function markup(e: string, result: { html: string; error?: string }, prepared: string, display: boolean) {
    if (preludeText) result = { ...result, html: result.html.replace(preludeText, '') };
    return languageNeutral(e === 'temml' && !result.error
      ? `<span class="td-math${display ? ' td-math-display' : ''}" role="math" aria-label="${esc(prepared)}">${result.html}</span>` : result.html);
  }
  function render(tex: any, opts: Record<string, any> = {}) {
    const source = String(tex), display = !!opts.display, key = resultKey(engine, source, display);
    if (!lib(engine)) return `<i>${esc(source)}</i>`;
    let prepared = rewriteMath(ownText(colors(source)), ownMacro);
    const M = macros(engine);
    if (M['\\textsc']) prepared = smallCaps(prepared);
    // aligned's and gathered's position option, which only KaTeX reads (scripts/patch-katex.js): Temml would draw it
    if (engine === 'temml') prepared = prepared.replace(/\\begin\s*\{(aligned|gathered)\}\s*\[(?:[tcb]|[^\]]*\\tdmultlined)\]/g, '\\begin{$1}');
    const input = docPrelude + prepared;
    let result = queue.results.get(key);
    if (!result && previewDepth && (engine === 'temml' || transitioning || deferDepth > 0 || syncSpent > SYNC_BUDGET_MS)) {
      const id = queue.request(key, { engine: engine as 'katex' | 'temml', tex: input, display, macros: M }, priority);
      const previousEngine = engine === 'temml' ? 'katex' : 'temml';
      const previous = queue.cached(resultKey(previousEngine, source, display));
      return (previous ? markup(previousEngine, previous, prepared, display)
        : `<span class="td-math-placeholder" style="display:inline-block;width:${Math.min(24, Math.max(2, source.length * .35))}em;height:1em" role="img" aria-label="${esc(source)}"></span>`) + `<!--td-math-pending:${id}-->`;
    }
    if (!result) {
      const start = previewDepth ? performance.now() : 0;
      result = { id: 0, ...compileResult({ engine: engine as 'katex' | 'temml', tex: input, display, macros: M }) };
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

  // the engine's readiness changed (rendering started or finished): the sidebar's picker
  // (ui/services/sidebar-settings.ts) and the views that wait on it hear of it
  function updateNote() { for (const fn of readiness) fn(); }
  document.addEventListener('click', (e) => { const b = (e.target! as Element).closest && (e.target! as Element).closest('#engineBox [data-engine]'); if (b) set((b as HTMLElement).dataset.engine); });

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
    drawsAs: (name: any) => !!standIns(engine)['\\' + name],
    /** every command a stand-in draws, with how many arguments it takes (the LaTeX suggestions offer them) */
    standInCommands: (): [string, number][] => Object.entries(STAND_INS).map(([k, v]) => [k, Math.max(0, ...[...v.matchAll(/#(\d)/g)].map((m) => +m[1]))]),
    useMacros,
    /** whether the open file's macros define \name */
    ownMacro,
    get macroText() { return docText; },
    get engine() { return engine; },
    /** formulae are being drawn (the engine's library loading, or a view's labels) */
    get busy() { return queue.pending > 0 || viewWork.size > 0; },
    /** the engine's library is here (an engine without it can't be chosen) */
    available: (e: string) => !!lib(e),
    onBeforeChange(fn: () => void) { beforeChange.push(fn); },
    onChange(fn: any) { listeners.push(fn); },
  };
})();
