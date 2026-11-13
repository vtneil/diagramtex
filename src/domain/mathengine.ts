import { runtime as TD } from '../runtime';
// Maths renderer: KaTeX (HTML + CSS, looks the same in every browser) or Temml (MathML laid out
// by the browser with Latin Modern Math: wider LaTeX coverage, closer to MathJax / TeX).
// Everything that draws maths calls TD.math.render(); the choice is a per-browser preference.
(function () {
  const KEY = 'diagramtex.engine';
  const ENGINES: Record<string, any> = {
    katex: { name: 'KaTeX', note: 'Same look in every browser' },
    temml: { name: 'Temml', note: 'MathML: more LaTeX, closer to TeX output' },
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
  // TeX → HTML string. With throwOnError, a parse error throws; otherwise it is shown in red.
  function render(tex: any, opts: Record<string, any> = {}) {
    const L = lib(engine);
    if (!L) return `<i>${esc(tex)}</i>`;
    tex = colors(String(tex));
    const M = macros(engine);
    if (M['\\textsc']) tex = smallCaps(tex);
    try { return L.renderToString(tex, { displayMode: !!opts.display, throwOnError: !!opts.throwOnError, macros: { ...M } }); }
    catch (e: any) { if (opts.throwOnError) throw e; return `<i>${esc(tex)}</i>`; }
  }
  // Standalone SVG files carry their own stylesheet. No fonts are linked from anywhere: the exports embed the
  // local copies (TD.inlineMathCss in src/application/docview.ts), so nothing is requested from another site.
  const CSS: Record<string, any> = {
    katex: '.tx{font-family:KaTeX_Main,"Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}.tx .katex{font-size:1em}',
    temml: '.tx{font-family:"Latin Modern Roman","Latin Modern Math","Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}',
  };
  const exportStyle = () => `<style>${CSS[engine]}</style>`;
  // In a standalone SVG (XML), <math> needs its namespace to be rendered as MathML.
  const forXml = (html: any) => html.replace(/<math(?![^>]*\bxmlns=)/g, '<math xmlns="http://www.w3.org/1998/Math/MathML"');

  const listeners: any[] = [];
  function set(e: any) {
    if (!ENGINES[e] || e === engine || !lib(e)) return;
    engine = e;
    try { localStorage.setItem(KEY, e); } catch (err: any) { /* ignore */ }
    document.documentElement.dataset.engine = e;
    if (TD.clearTextCache) TD.clearTextCache();
    for (const fn of listeners) fn(e);
  }
  document.documentElement.dataset.engine = engine;

  // Picker in the left sidebar, under the file list: one segmented switch, the active engine's note below.
  function mount() {
    const box = document.getElementById('engineBox');
    if (!box) return;
    box.innerHTML = `<div class="eng-head">LaTeX engine</div>
      <div class="eng-seg" role="radiogroup">${Object.entries<any>(ENGINES).map(([k, v]) =>
        `<button type="button" role="radio" data-engine="${k}" aria-checked="${k === engine}" class="${k === engine ? 'on' : ''}"${lib(k) ? '' : ' disabled'} title="${v.note}">${v.name}</button>`).join('')}</div>
      <div class="eng-note">${ENGINES[engine].note}. Preview only: the exported LaTeX is the same.</div>`;
  }
  document.addEventListener('click', (e) => { const b = (e.target! as Element).closest && (e.target! as Element).closest('#engineBox [data-engine]'); if (b) set((b as HTMLElement).dataset.engine); });
  listeners.push(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  TD.xcolorExpr = xcolorExpr;
  TD.math = {
    render, set, exportStyle, forXml, ENGINES,
    // a command the engine in use lacks but draws with a stand-in (STAND_INS)
    drawsAs: (name: any) => !!macros(engine)['\\' + name],
    get engine() { return engine; },
    onChange(fn: any) { listeners.push(fn); },
  };
})();
