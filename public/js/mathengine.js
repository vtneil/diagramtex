// Maths renderer: KaTeX (HTML + CSS, looks the same in every browser) or Temml (MathML laid out
// by the browser with Latin Modern Math: wider LaTeX coverage, closer to MathJax / TeX).
// Everything that draws maths calls TD.math.render(); the choice is a per-browser preference.
(function () {
  const TD = (window.TD = window.TD || {});
  const KEY = 'diagramtex.engine';
  const ENGINES = {
    katex: { name: 'KaTeX', note: 'Same look in every browser' },
    temml: { name: 'Temml', note: 'MathML: more LaTeX, closer to TeX output' },
  };
  let engine = 'katex';
  try { const v = localStorage.getItem(KEY); if (v && ENGINES[v]) engine = v; } catch (e) { /* storage blocked */ }
  const lib = (e) => (e === 'temml' ? window.temml : window.katex);
  if (!lib(engine)) engine = 'katex';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // TeX → HTML string. With throwOnError, a parse error throws; otherwise it is shown in red.
  function render(tex, opts = {}) {
    const L = lib(engine);
    if (!L) return `<i>${esc(tex)}</i>`;
    try { return L.renderToString(tex, { displayMode: !!opts.display, throwOnError: !!opts.throwOnError }); }
    catch (e) { if (opts.throwOnError) throw e; return `<i>${esc(tex)}</i>`; }
  }
  // Standalone SVG files carry their own stylesheet. No fonts are linked from anywhere: the exports embed the
  // local copies (TD.inlineMathCss in docview.js), so nothing is requested from another site.
  const CSS = {
    katex: '.tx{font-family:KaTeX_Main,"Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}.tx .katex{font-size:1em}',
    temml: '.tx{font-family:"Latin Modern Roman","Latin Modern Math","Times New Roman",serif;line-height:1.2;white-space:pre;text-align:center;display:inline-block}',
  };
  const exportStyle = () => `<style>${CSS[engine]}</style>`;
  // In a standalone SVG (XML), <math> needs its namespace to be rendered as MathML.
  const forXml = (html) => html.replace(/<math(?![^>]*\bxmlns=)/g, '<math xmlns="http://www.w3.org/1998/Math/MathML"');

  const listeners = [];
  function set(e) {
    if (!ENGINES[e] || e === engine || !lib(e)) return;
    engine = e;
    try { localStorage.setItem(KEY, e); } catch (err) { /* ignore */ }
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
      <div class="eng-seg" role="radiogroup">${Object.entries(ENGINES).map(([k, v]) =>
        `<button type="button" role="radio" data-engine="${k}" aria-checked="${k === engine}" class="${k === engine ? 'on' : ''}"${lib(k) ? '' : ' disabled'} title="${v.note}">${v.name}</button>`).join('')}</div>
      <div class="eng-note">${ENGINES[engine].note}. Preview only: the exported LaTeX is the same.</div>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#engineBox [data-engine]'); if (b) set(b.dataset.engine); });
  listeners.push(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  TD.math = {
    render, set, exportStyle, forXml, ENGINES,
    get engine() { return engine; },
    onChange(fn) { listeners.push(fn); },
  };
})();
