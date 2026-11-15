import { previewFadeFinished } from '../../platform/preview-fade';
import { runtime as TD } from '../../runtime';
import { t, onLocale } from '../../i18n';
// Quick: one formula, typed as LaTeX or edited in MathLive, copied or downloaded as a picture (PNG or SVG).
// It is not a file: the formula and its options are kept in this browser, and the file that was open stays
// open underneath. The picture is the app's own export of a text box holding the formula, so it looks
// exactly like the same maths on the canvas, with the maths fonts embedded in the PNG.
(function () {
  'use strict';
  const KEY = 'diagramtex.quick.opts';
  const SIZES = () => [['normalsize', t('ui.normal', 'Normal')], ['Large', t('quick.size.large', 'Large')], ['Huge', t('quick.size.huge', 'Huge')]];
  // PNG sharpness: image pixels per pixel of the formula at its size on the canvas. 8× (the default) looks crisp
  // when pasted into a chat or slide at any size people usually make it; the PNG also records its DPI, so
  // documents that read it (Word, Pages) still place it at the formula's true size.
  const SCALES = [4, 8, 16, 32];
  const host = document.getElementById('quick');
  if (!host) return;

  const opts: Record<string, any> = { tex: 'E = mc^2', size: 'Large', scale: 8, transparent: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e: any) { /* storage blocked */ }
  if (opts.v !== 2) { opts.v = 2; opts.scale = 8; delete opts.dpi; } // earlier versions chose DPI, then defaulted to 4×
  if (!SCALES.includes(+opts.scale)) opts.scale = 8;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e: any) { /* storage blocked */ } };
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const canCopy = !!(navigator.clipboard && (navigator.clipboard as { write?: unknown }).write && window.ClipboardItem);

  // the formula as the export sees it: a text box holding display maths, one line
  const tex = () => opts.tex.replace(/\s*\n\s*/g, ' ').trim();
  const shape = () => ({ type: 'text', x: 0, y: 0, text: `$$${tex()}$$`, tw: 0, size: opts.size, font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 });

  const seg = (name: any, label: string, list: any, cur: any) => `<div class="seg qk-seg" role="radiogroup" aria-label="${esc(label)}">${list.map(([k, l]: any) =>
    `<button type="button" role="radio" data-${name.toLowerCase()}="${k}" aria-checked="${k === cur}" class="${k === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const DL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/></svg>';

  function build() {
    const input = TD.input ? TD.input.mode : 'latex';
    host!.innerHTML = `<div class="qk">
      <div class="qk-field">
        <div class="qk-row"><label class="qk-label" for="quickTex">${esc(t('quick.formula', 'Formula'))}</label>${seg('Input', t('quick.input', 'Input'), Object.entries<any>(TD.input ? TD.input.MODES : { latex: { name: 'LaTeX' } }).map(([k, v]) => [k, v.name]), input)}</div>
        <div class="qk-edit"></div>
      </div>
      <div class="qk-stage${opts.transparent ? ' clear' : ''}"><div class="qk-prev" aria-live="polite"></div></div>
      <div class="qk-msg" role="status"></div>
      <div class="qk-bar">
        <div class="qk-opts">
          ${seg('Size', t('ui.size', 'Size'), SIZES(), opts.size)}
          <select class="qk-dpi" aria-label="${esc(t('quick.sharp', 'PNG sharpness'))}" title="${esc(t('quick.sharpTip', 'PNG sharpness: pixels per pixel of the formula'))}">${SCALES.map((d) => `<option value="${d}"${d === +opts.scale ? ' selected' : ''}>${d}× PNG</option>`).join('')}</select>
          <label class="qk-chk"><input type="checkbox" data-clear${opts.transparent ? ' checked' : ''}> ${esc(t('quick.transparent', 'Transparent'))}</label>
        </div>
        <div class="qk-acts">
          ${canCopy ? `<button type="button" class="primary" data-q="png" title="${esc(t('quick.copyPngTip', 'Copy the formula as a PNG picture ({key})', { key: (mac ? '⌘' : 'Ctrl+') + 'Enter' }))}">${esc(t('table.copyPng', 'Copy PNG'))}</button>
          <button type="button" data-q="svg" title="${esc(t('quick.copySvgTip', 'Copy the formula as SVG'))}">${esc(t('quick.copySvg', 'Copy SVG'))}</button>` : ''}
          <button type="button" class="qk-dl" data-q="dl-png" title="${esc(t('quick.dlPng', 'Download as PNG'))}">${DL}PNG</button>
          <button type="button" class="qk-dl" data-q="dl-svg" title="${esc(t('quick.dlSvg', 'Download as SVG'))}">${DL}SVG</button>
        </div>
      </div>
      <p class="qk-foot">${esc(t('quick.foot', 'Paste the PNG into slides, documents or chats. The SVG keeps the maths as text, with its fonts loaded from the web.'))}<button type="button" class="qk-src" data-q="tex">${esc(t('table.copyLatex', 'Copy LaTeX'))}</button></p>
    </div>`;
    editor();
    preview();
  }

  // ---- the input: a LaTeX field, or one MathLive field ----
  function editor() {
    const box = host!.querySelector('.qk-edit');
    if (TD.input && TD.input.mode === 'mathlive') {
      box!.innerHTML = `<div class="qk-loading">${esc(t('quick.loadingMathlive', 'Loading MathLive…'))}</div>`;
      TD.input.load().then(() => {
        if (!box!.isConnected) return;
        const mf = new window.MathfieldElement();
        mf.id = 'quickTex';
        mf.mathVirtualKeyboardPolicy = 'manual';
        mf.smartFence = true;
        mf.value = opts.tex;
        mf.addEventListener('input', () => { opts.tex = mf.value; changed(); });
        box!.replaceChildren(mf);
        mf.focus();
      }, () => { box!.innerHTML = ''; TD.input.set('latex'); }); // offline before it was cached
      return;
    }
    box!.innerHTML = `<textarea id="quickTex" class="qk-ta" data-tx="math" rows="3" spellcheck="false" autocomplete="off" placeholder="\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}">${esc(opts.tex)}</textarea>`;
    const ta = box!.firstElementChild;
    const fit = () => { (ta! as HTMLElement).style.height = 'auto'; (ta! as HTMLElement).style.height = Math.min(ta!.scrollHeight + 2, 240) + 'px'; };
    ta!.addEventListener('input', () => { opts.tex = (ta! as HTMLInputElement).value; fit(); changed(); });
    requestAnimationFrame(() => { fit(); (ta! as HTMLElement).focus(); (ta! as HTMLTextAreaElement).setSelectionRange((ta! as HTMLInputElement).value.length, (ta! as HTMLInputElement).value.length); });
  }

  let timer: any = null;
  function changed() { save(); clearTimeout(timer); timer = setTimeout(preview, 60); }
  // the preview: the formula at twice the chosen size, on white (or a checkerboard when transparent)
  let good = false;
  function preview(): void {
    if (!TD.math.previewing) return TD.math.preview(preview);
    const p = host!.querySelector('.qk-prev'), msg = host!.querySelector('.qk-msg');
    if (!p) return;
    const src = tex();
    (p as HTMLElement).style.fontSize = TD.sizePx(opts.size) * 2 + 'px';
    if (!src) { p.classList.remove('math-pending'); p.innerHTML = `<span class="qk-empty">${esc(t('quick.empty', 'Type a formula above'))}</span>`; good = false; note(''); return; }
    try {
      const html = TD.math.render(src, { display: true, throwOnError: true });
      p.innerHTML = TD.math.cleanPreview(TD.math.liveMarkup(html)); p.classList.toggle('math-pending', TD.math.isPending(html));
      if (!TD.math.isPending(html)) TD.math.trackView(previewFadeFinished(p));
      p.classList.remove('stale'); good = true; note('');
    } catch (e: any) {
      p.classList.remove('math-pending'); p.classList.add('stale'); good = false; // the last good picture stays, faded, while the error shows
      note(String(e.message || e).replace(/^KaTeX parse error: /, ''), true);
    }
    void msg;
  }
  function note(text: any, err?: any) {
    const m = host!.querySelector('.qk-msg');
    if (!m) return;
    m.textContent = text; m.classList.toggle('err', !!err);
  }

  // ---- output ----
  const png = () => TD.app.pngOf([shape()], opts.scale * 2.54 * TD.PX_PER_CM, opts.transparent);
  const svg = () => TD.app.svgOf([shape()]);
  function flash(btn: any, text: any) {
    if (!btn) return;
    const old = btn.dataset.label || btn.innerHTML;
    btn.dataset.label = old;
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.innerHTML = old; delete btn.dataset.label; }, 1200);
  }
  async function act(what: any, btn: any) {
    if (!TD.app.outputAllowed()) return;
    if (!tex() || !good) { note(tex() ? t('quick.fixFirst', 'Fix the formula first') : t('quick.typeFirst', 'Type a formula first'), true); return; }
    try {
      if (what === 'png') {
        // the item is made at once, with the picture still to come: Safari allows a copy only during the click
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
        flash(btn, t('ui.copied', 'Copied'));
      } else if (what === 'svg') {
        const s = svg(), item: Record<string, any> = { 'text/plain': new Blob([s], { type: 'text/plain' }) };
        if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = new Blob([s], { type: 'image/svg+xml' });
        await navigator.clipboard.write([new ClipboardItem(item)]);
        flash(btn, t('ui.copied', 'Copied'));
      } else if (what === 'tex') {
        await navigator.clipboard.writeText(tex());
        flash(btn, t('ui.copied', 'Copied'));
      } else if (what === 'dl-png') TD.app.downloadBlob('formula.png', await png());
      else if (what === 'dl-svg') TD.app.downloadBlob('formula.svg', new Blob([svg()], { type: 'image/svg+xml' }));
    } catch (e: any) { const why = String(e.message || e).replace('lower the DPI', 'choose a lower sharpness');
      note(what.startsWith('dl') ? t('quick.fileFailed', "Couldn't make the file ({error})", { error: why }) : t('quick.copyFailed', "Couldn't copy ({error})", { error: why }), true); }
  }

  host.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('button');
    if (!b) return;
    if (b.dataset.input) { TD.input.set(b.dataset.input); return; } // rebuilt by the listener below
    if (b.dataset.size) { opts.size = b.dataset.size; save(); host.querySelectorAll('[data-size]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); preview(); return; }
    if (b.dataset.q) act(b.dataset.q, b);
  });
  host.addEventListener('change', (e) => {
    if ((e.target! as Element).matches('.qk-dpi')) { opts.scale = +(e.target! as HTMLInputElement).value; save(); }
    if ((e.target! as Element).matches('[data-clear]')) { opts.transparent = (e.target! as HTMLInputElement).checked; save(); (host.querySelector('.qk-stage'))!.classList.toggle('clear', opts.transparent); }
  });
  host.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); act(canCopy ? 'png' : 'dl-png', host.querySelector(canCopy ? '[data-q="png"]' : '[data-q="dl-png"]')); }
  });

  let shown = false;
  if (TD.input) TD.input.onChange(() => { if (shown) build(); });
  let firstLocale = true;
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (shown) build(); });
  TD.math.onChange(() => { if (shown) preview(); });
  TD.math.onProgress(() => { if (shown) preview(); });

  TD.quick = {
    show() { shown = true; host.hidden = false; build(); },
    hide() { shown = false; host.hidden = true; host.innerHTML = ''; },
  };
})();
