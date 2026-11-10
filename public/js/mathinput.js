// Text input mode for the on-canvas editor: "LaTeX" (a plain text field, maths typed as $…$) or
// "MathLive" (an interactive maths editor: fractions, roots, matrices are edited as they look).
// Both edit the same stored text, so switching modes never changes a document.
//
// MathLive mode shows one <math-field> per line. Prose is MathLive's text mode, maths its maths mode;
// "$" switches between them, as it opens and closes maths in LaTeX. A line converts as
//   Force $F = ma$ here   ⇄   \text{Force }F = ma\text{ here}
// and a line is rewritten only once it has been edited, so untouched lines keep their exact source.
// MathLive (vendor/mathlive) loads on first use and shares KaTeX's fonts (the same files).
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const KEY = 'diagramtex.input';
  const MODES = {
    latex: { name: 'LaTeX', note: 'Type text and $maths$ as LaTeX source.' },
    mathlive: { name: 'MathLive', note: 'Edit maths visually. $ switches between text and maths.' },
  };
  let mode = 'latex';
  try { const v = localStorage.getItem(KEY); if (v && MODES[v]) mode = v; } catch (e) { /* storage blocked */ }

  // ---------- loading ----------
  let loading = null;
  function load() {
    if (window.MathfieldElement) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/mathlive/mathlive.min.js';
      s.onload = () => {
        const M = window.MathfieldElement;
        if (!M) { reject(new Error('MathLive did not load')); return; }
        M.fontsDirectory = new URL('vendor/katex/fonts', document.baseURI).href;
        M.soundsDirectory = null;
        resolve();
      };
      s.onerror = () => { loading = null; reject(new Error('MathLive did not load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // ---------- conversion ----------
  const TEXT_ESC = { '\\': '\\textbackslash ', '{': '\\{', '}': '\\}', $: '\\$', '%': '\\%', '&': '\\&', '#': '\\#', _: '\\_', '^': '\\textasciicircum ', '~': '\\textasciitilde ' };
  // one stored line → MathLive LaTeX
  function toMath(line) {
    return TD.textSegments(line).map((g) => {
      if (g.math) return g.display ? `\\displaystyle ${g.s.trim()}` : g.s;
      // prose keeps its text commands (\textbf{…}); only plain characters are escaped for MathLive
      return `\\text{${TD.prose.source(TD.prose.parse(g.s), (t) => t.replace(/[\\{}$%&#_^~]/g, (c) => TEXT_ESC[c]))}}`;
    }).join('');
  }
  // the body of a \text{…} → stored prose: text commands kept, $ _ { } escaped (% & # are escaped on export)
  // MathLive spells some typed characters as words (a typed "{" is \textbraceleft): stored as the usual escapes
  const ML_CHARS = { textbraceleft: '\\{', textbraceright: '\\}', textunderscore: '\\_', textdollar: '\\$' };
  const fromText = (t) => TD.prose.source(TD.prose.parse(t.replace(/\\(textbraceleft|textbraceright|textunderscore|textdollar)(?![A-Za-z]) ?/g, (m, w) => ML_CHARS[w])), (x) => x.replace(/[$_{}]/g, (c) => '\\' + c));
  // text commands MathLive may write outside \text{…}; they are prose, not maths
  const PROSE_TOP = 'text|textrm|textup|mbox|textbf|textit|emph|textsl|texttt|textsf|textsc|textmd|textnormal';
  // MathLive LaTeX → one stored line: top-level \text{…} groups are prose, everything else is maths
  function fromMath(tex) {
    let out = '', math = '', i = 0;
    const flushMath = () => { if (math.trim()) out += `$${math.trim()}$`; math = ''; };
    while (i < tex.length) {
      const m = new RegExp(`^\\\\(${PROSE_TOP})\\s*\\{`).exec(tex.slice(i));
      if (m) {
        let j = i + m[0].length, depth = 1;
        for (; j < tex.length && depth; j++) {
          if (tex[j] === '\\') { j++; continue; }
          if (tex[j] === '{') depth++;
          else if (tex[j] === '}') depth--;
        }
        flushMath();
        const body = fromText(tex.slice(i + m[0].length, j - 1));
        out += /^(text|textrm|textup|mbox)$/.test(m[1]) ? body : `\\${m[1]}{${body}}`;
        i = j;
        continue;
      }
      if (tex[i] === '\\') { // copy a command (or escaped character) whole
        const c = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
        math += c[0]; i += c[0].length; continue;
      }
      if (tex[i] === '{') { // copy a group whole, so \text inside it stays maths
        let j = i + 1, depth = 1;
        for (; j < tex.length && depth; j++) {
          if (tex[j] === '\\') { j++; continue; }
          if (tex[j] === '{') depth++;
          else if (tex[j] === '}') depth--;
        }
        math += tex.slice(i, j); i = j; continue;
      }
      math += tex[i++];
    }
    flushMath();
    return out;
  }

  // ---------- editor ----------
  // Builds the editor in `host`. opts: { text, start: 'text' | 'math' | 'end', prose, para, onInput(text), onDone() }.
  // `prose`: new lines start as text (a text box) rather than maths (a label, or the maths tool).
  // Enter finishes (Shift+Enter: new line); in a paragraph Enter is a new line and ⌘/Ctrl+Enter finishes.
  function mount(host, opts) {
    const lines = String(opts.text || '').split('\n');
    host.innerHTML = '<div class="ml-lines"></div><div class="ml-hint"></div>';
    const list = host.firstElementChild;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    host.lastElementChild.textContent = `$ text ↔ maths · ${opts.para ? `Enter new line · ${mac ? '⌘' : 'Ctrl+'}Enter done` : 'Enter done · Shift+Enter new line'} · Esc done`;
    let done = false;
    const off = new AbortController(), on = { signal: off.signal }; // the host is reused: every listener goes with destroy()
    const finish = () => { if (!done) { done = true; opts.onDone(); } };
    const emit = () => opts.onInput(lines.join('\n'));

    function field(i, tex) {
      const mf = new window.MathfieldElement();
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.smartFence = true;
      mf.value = tex;
      if (opts.prose) mf.addEventListener('focus', () => { if (!mf.value) mf.mode = 'text'; }); // an empty line in a text box starts as prose
      mf.addEventListener('input', () => { const k = fields().indexOf(mf); if (k >= 0) { lines[k] = fromMath(mf.value); emit(); } });
      return mf;
    }
    const fields = () => [...list.children];
    lines.forEach((l, i) => list.appendChild(field(i, toMath(l))));

    function newLine(after) {
      const k = fields().indexOf(after);
      lines.splice(k + 1, 0, '');
      const mf = field(k + 1, '');
      after.after(mf);
      emit();
      mf.focus(); // a new math-field takes focus only once it has rendered: try now, then on the next frame
      mf.mode = opts.prose ? 'text' : 'math';
      requestAnimationFrame(() => { if (!done && document.activeElement !== mf) { mf.focus(); mf.mode = opts.prose ? 'text' : 'math'; } });
    }
    function dropLine(mf) {
      const all = fields(), k = all.indexOf(mf);
      if (k <= 0) return false;
      lines.splice(k, 1);
      mf.remove();
      emit();
      const prev = all[k - 1];
      prev.focus();
      prev.position = prev.lastOffset;
      return true;
    }

    // capture: decide before MathLive sees the key
    host.addEventListener('keydown', (e) => {
      const mf = e.target.closest && e.target.closest('math-field');
      if (!mf) return;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'Escape') { stop(); finish(); return; }
      if (e.key === 'Enter') {
        const mod = e.metaKey || e.ctrlKey;
        if (opts.para ? mod : !e.shiftKey) { stop(); finish(); return; }
        stop(); newLine(mf); return;
      }
      if (e.key === '$' && !e.altKey && !e.metaKey && !e.ctrlKey) { stop(); mf.executeCommand(['switchMode', mf.mode === 'math' ? 'text' : 'math']); return; }
      if (e.key === 'Backspace' && !mf.value && fields().length > 1) { stop(); dropLine(mf); return; }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
        const all = fields(), k = all.indexOf(mf), to = all[k + (e.key === 'ArrowUp' ? -1 : 1)];
        const atEdge = e.key === 'ArrowUp' ? mf.position === 0 : mf.position === mf.lastOffset;
        if (to && atEdge) { stop(); to.focus(); to.position = e.key === 'ArrowUp' ? to.lastOffset : 0; }
      }
    }, { capture: true, signal: off.signal });
    // "$" typed without a keydown (input methods, on-screen keyboards, paste of a lone "$")
    host.addEventListener('beforeinput', (e) => {
      const mf = e.target.closest && e.target.closest('math-field');
      if (!mf || e.data !== '$') return;
      e.preventDefault(); e.stopPropagation();
      mf.executeCommand(['switchMode', mf.mode === 'math' ? 'text' : 'math']);
    }, { capture: true, signal: off.signal });
    // bubble: keep typing away from the app's shortcuts
    host.addEventListener('keydown', (e) => e.stopPropagation(), on);
    // leaving the editor finishes it (MathLive's own menu and keyboard don't count)
    host.addEventListener('focusout', () => setTimeout(() => {
      const a = document.activeElement;
      if (done || (a && (host.contains(a) || a.closest('.ui-menu-container, .MLK__backdrop, .ML__keyboard')))) return;
      if (document.querySelector('.ui-menu-container')) return;
      finish();
    }, 0), on);

    const first = fields()[0];
    requestAnimationFrame(() => {
      if (done) return;
      const target = opts.start === 'end' ? fields()[fields().length - 1] : first;
      target.focus();
      if (opts.start === 'end') { target.position = target.lastOffset; if (lines.length === 1) target.executeCommand('selectAll'); }
      else target.mode = opts.start;
    });
    return { destroy() { done = true; off.abort(); host.innerHTML = ''; } };
  }

  // ---------- label popup (the circuit and quantum editors) ----------
  // A floating box in `host` (a positioned element), like the canvas's inline editor: a LaTeX text field
  // or MathLive, whichever the Text input setting picks. Enter, Esc or clicking away finishes.
  // opts: { text, math: the content is maths without $ (a quantikz gate), bare: a lone command such as
  //   \ket{0} is maths, at(): [x, y] in host pixels for the box's top centre, onInput(text), onDone() }
  // Returns { place() } to follow the anchor (after a pan or zoom) and close().
  function popup(host, opts) {
    const v0 = String(opts.text || '');
    let box = null, ml = null, closed = false;
    const place = () => {
      if (closed || !box) return;
      const [X, Y] = opts.at(), w = box.offsetWidth, h = box.offsetHeight, W = host.clientWidth, H = host.clientHeight;
      box.style.left = Math.max(w / 2 + 8, Math.min(X, W - w / 2 - 8)) + 'px';
      box.style.top = Math.max(8, Math.min(Y, H - h - 8)) + 'px';
    };
    const close = () => { if (closed) return; closed = true; if (ml) ml.destroy(); if (box) box.remove(); opts.onDone(); };
    function plain() {
      const ta = (box = document.createElement('textarea'));
      ta.className = 'td-pop-ta'; ta.spellcheck = false; ta.rows = 1; ta.value = v0;
      if (opts.math) ta.dataset.tx = 'math'; // highlighted all through as maths (texhighlight.js)
      ta.placeholder = opts.math ? 'Maths, without $ — Enter to finish' : 'Text, $math$ — Enter to finish';
      const size = () => { ta.style.height = 'auto'; ta.style.height = Math.min(Math.max(ta.scrollHeight + 2, 40), 160) + 'px'; };
      ta.addEventListener('input', () => { opts.onInput(ta.value); size(); place(); });
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); close(); }
      });
      ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) close(); }, 0));
      host.appendChild(ta); size(); place();
      requestAnimationFrame(() => { if (!closed) { ta.focus(); ta.select(); } });
    }
    if (mode !== 'mathlive') plain();
    else {
      box = document.createElement('div');
      box.className = 'td-pop-ml';
      box.innerHTML = '<div class="ml-load">Loading MathLive…</div>';
      host.appendChild(box); place();
      load().then(() => {
        if (closed) return;
        const wrap = opts.math ? !!v0 : !!opts.bare && /^\s*\\[A-Za-z]/.test(v0) && !v0.includes('$');
        ml = mount(box, {
          text: wrap ? `$${v0}$` : v0, prose: !opts.math, start: v0 ? 'end' : opts.math ? 'math' : 'text',
          // a line that is all maths goes back without its $ where the content is maths already
          onInput: (v) => { const u = /^\$([^$]*)\$$/.exec(v); opts.onInput(wrap && u ? u[1] : v); place(); },
          onDone: close,
        });
        place();
      }, () => { if (closed) return; box.remove(); set('latex'); plain(); }); // offline before it was cached
    }
    return { place, close };
  }

  // ---------- setting (left sidebar, above the LaTeX engine) ----------
  const listeners = [];
  function set(m) {
    if (!MODES[m] || m === mode) return;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) { /* ignore */ }
    for (const fn of listeners) fn(m);
    if (m === 'mathlive') load().catch(() => {});
  }
  function render() {
    const box = document.getElementById('inputBox');
    if (!box) return;
    box.innerHTML = `<div class="eng-head">Text input</div>
      <div class="eng-seg" role="radiogroup" aria-label="Text input">${Object.entries(MODES).map(([k, v]) =>
        `<button type="button" role="radio" data-input="${k}" aria-checked="${k === mode}" class="${k === mode ? 'on' : ''}" title="${v.name} mode: ${v.note}">${v.name}</button>`).join('')}</div>
      <div class="eng-note">${MODES[mode].note}</div>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#inputBox [data-input]'); if (b) set(b.dataset.input); });
  listeners.push(render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  // warm the library up after start when it will be needed
  if (mode === 'mathlive') window.addEventListener('load', () => setTimeout(() => load().catch(() => {}), 300));

  TD.input = {
    MODES, set, load, mount, popup, toMath, fromMath,
    get mode() { return mode; },
    onChange(fn) { listeners.push(fn); },
  };
})();
