// Quick: one formula, typed as LaTeX or edited in MathLive, copied or downloaded as a picture (PNG or SVG).
// It is not a file: the formula and its options are kept in this browser, and the file that was open stays
// open underneath. The picture is the app's own export of a text box holding the formula, so it looks
// exactly like the same maths on the canvas, with the maths fonts embedded in the PNG.
(function () {
  'use strict';
  const TD = window.TD;
  const KEY = 'diagramtex.quick.opts';
  const SIZES = [['normalsize', 'Normal'], ['Large', 'Large'], ['Huge', 'Huge']];
  // PNG sharpness: image pixels per pixel of the formula at its size on the canvas. 8× (the default) looks crisp
  // when pasted into a chat or slide at any size people usually make it; the PNG also records its DPI, so
  // documents that read it (Word, Pages) still place it at the formula's true size.
  const SCALES = [4, 8, 16, 32];
  const host = document.getElementById('quick');
  if (!host) return;

  const opts = { tex: 'E = mc^2', size: 'Large', scale: 8, transparent: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
  if (opts.v !== 2) { opts.v = 2; opts.scale = 8; delete opts.dpi; } // earlier versions chose DPI, then defaulted to 4×
  if (!SCALES.includes(+opts.scale)) opts.scale = 8;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* storage blocked */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const canCopy = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

  // the formula as the export sees it: a text box holding display maths, one line
  const tex = () => opts.tex.replace(/\s*\n\s*/g, ' ').trim();
  const shape = () => ({ type: 'text', x: 0, y: 0, text: `$$${tex()}$$`, tw: 0, size: opts.size, font: 'default', bold: false, italic: false, color: '#000000', opacity: 1 });

  const seg = (name, list, cur) => `<div class="seg qk-seg" role="radiogroup" aria-label="${name}">${list.map(([k, l]) =>
    `<button type="button" role="radio" data-${name.toLowerCase()}="${k}" aria-checked="${k === cur}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const DL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/></svg>';

  function build() {
    const input = TD.input ? TD.input.mode : 'latex';
    host.innerHTML = `<div class="qk">
      <div class="qk-field">
        <div class="qk-row"><label class="qk-label" for="quickTex">Formula</label>${seg('Input', Object.entries(TD.input ? TD.input.MODES : { latex: { name: 'LaTeX' } }).map(([k, v]) => [k, v.name]), input)}</div>
        <div class="qk-edit"></div>
      </div>
      <div class="qk-stage${opts.transparent ? ' clear' : ''}"><div class="qk-prev" aria-live="polite"></div></div>
      <div class="qk-msg" role="status"></div>
      <div class="qk-bar">
        <div class="qk-opts">
          ${seg('Size', SIZES, opts.size)}
          <select class="qk-dpi" aria-label="PNG sharpness" title="PNG sharpness: pixels per pixel of the formula">${SCALES.map((d) => `<option value="${d}"${d === +opts.scale ? ' selected' : ''}>${d}× PNG</option>`).join('')}</select>
          <label class="qk-chk"><input type="checkbox" data-clear${opts.transparent ? ' checked' : ''}> Transparent</label>
        </div>
        <div class="qk-acts">
          ${canCopy ? `<button type="button" class="primary" data-q="png" title="Copy the formula as a PNG picture (${mac ? '⌘' : 'Ctrl+'}Enter)">Copy PNG</button>
          <button type="button" data-q="svg" title="Copy the formula as SVG">Copy SVG</button>` : ''}
          <button type="button" class="qk-dl" data-q="dl-png" title="Download as PNG">${DL}PNG</button>
          <button type="button" class="qk-dl" data-q="dl-svg" title="Download as SVG">${DL}SVG</button>
        </div>
      </div>
      <p class="qk-foot">Paste the PNG into slides, documents or chats. The SVG keeps the maths as text, with its fonts loaded from the web.<button type="button" class="qk-src" data-q="tex">Copy LaTeX</button></p>
    </div>`;
    editor();
    preview();
  }

  // ---- the input: a LaTeX field, or one MathLive field ----
  function editor() {
    const box = host.querySelector('.qk-edit');
    if (TD.input && TD.input.mode === 'mathlive') {
      box.innerHTML = '<div class="qk-loading">Loading MathLive…</div>';
      TD.input.load().then(() => {
        if (!box.isConnected) return;
        const mf = new window.MathfieldElement();
        mf.id = 'quickTex';
        mf.mathVirtualKeyboardPolicy = 'manual';
        mf.smartFence = true;
        mf.value = opts.tex;
        mf.addEventListener('input', () => { opts.tex = mf.value; changed(); });
        box.replaceChildren(mf);
        mf.focus();
      }, () => { box.innerHTML = ''; TD.input.set('latex'); }); // offline before it was cached
      return;
    }
    box.innerHTML = `<textarea id="quickTex" class="qk-ta" data-tx="math" rows="3" spellcheck="false" autocomplete="off" placeholder="\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}">${esc(opts.tex)}</textarea>`;
    const ta = box.firstElementChild;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 240) + 'px'; };
    ta.addEventListener('input', () => { opts.tex = ta.value; fit(); changed(); });
    requestAnimationFrame(() => { fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  }

  let timer = null;
  function changed() { save(); clearTimeout(timer); timer = setTimeout(preview, 60); }
  // the preview: the formula at twice the chosen size, on white (or a checkerboard when transparent)
  let good = false;
  function preview() {
    const p = host.querySelector('.qk-prev'), msg = host.querySelector('.qk-msg');
    if (!p) return;
    const t = tex();
    p.style.fontSize = TD.sizePx(opts.size) * 2 + 'px';
    if (!t) { p.innerHTML = '<span class="qk-empty">Type a formula above</span>'; good = false; note(''); return; }
    try {
      p.innerHTML = TD.math.render(t, { display: true, throwOnError: true });
      p.classList.remove('stale'); good = true; note('');
    } catch (e) {
      p.classList.add('stale'); good = false; // the last good picture stays, faded, while the error shows
      note(String(e.message || e).replace(/^KaTeX parse error: /, ''), true);
    }
    void msg;
  }
  function note(text, err) {
    const m = host.querySelector('.qk-msg');
    if (!m) return;
    m.textContent = text; m.classList.toggle('err', !!err);
  }

  // ---- output ----
  const png = () => TD.app.pngOf([shape()], opts.scale * 2.54 * TD.PX_PER_CM, opts.transparent);
  const svg = () => TD.app.svgOf([shape()]);
  function flash(btn, text) {
    if (!btn) return;
    const old = btn.dataset.label || btn.innerHTML;
    btn.dataset.label = old;
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.innerHTML = old; delete btn.dataset.label; }, 1200);
  }
  async function act(what, btn) {
    if (!tex() || !good) { note(tex() ? 'Fix the formula first' : 'Type a formula first', true); return; }
    try {
      if (what === 'png') {
        // the item is made at once, with the picture still to come: Safari allows a copy only during the click
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
        flash(btn, 'Copied');
      } else if (what === 'svg') {
        const s = svg(), item = { 'text/plain': new Blob([s], { type: 'text/plain' }) };
        if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = new Blob([s], { type: 'image/svg+xml' });
        await navigator.clipboard.write([new ClipboardItem(item)]);
        flash(btn, 'Copied');
      } else if (what === 'tex') {
        await navigator.clipboard.writeText(tex());
        flash(btn, 'Copied');
      } else if (what === 'dl-png') TD.app.downloadBlob('formula.png', await png());
      else if (what === 'dl-svg') TD.app.downloadBlob('formula.svg', new Blob([svg()], { type: 'image/svg+xml' }));
    } catch (e) { note(`Couldn't ${what.startsWith('dl') ? 'make the file' : 'copy'} (${String(e.message || e).replace('lower the DPI', 'choose a lower sharpness')})`, true); }
  }

  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.input) { TD.input.set(b.dataset.input); return; } // rebuilt by the listener below
    if (b.dataset.size) { opts.size = b.dataset.size; save(); host.querySelectorAll('[data-size]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); preview(); return; }
    if (b.dataset.q) act(b.dataset.q, b);
  });
  host.addEventListener('change', (e) => {
    if (e.target.matches('.qk-dpi')) { opts.scale = +e.target.value; save(); }
    if (e.target.matches('[data-clear]')) { opts.transparent = e.target.checked; save(); host.querySelector('.qk-stage').classList.toggle('clear', opts.transparent); }
  });
  host.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); act(canCopy ? 'png' : 'dl-png', host.querySelector(canCopy ? '[data-q="png"]' : '[data-q="dl-png"]')); }
  });

  let shown = false;
  if (TD.input) TD.input.onChange(() => { if (shown) build(); });
  TD.math.onChange(() => { if (shown) preview(); });

  TD.quick = {
    show() { shown = true; host.hidden = false; build(); },
    hide() { shown = false; host.hidden = true; host.innerHTML = ''; },
  };
})();
