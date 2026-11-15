import { runtime as TD } from '../../runtime';
// Maths highlighting in the LaTeX text fields: $…$, $$…$$ and \[…\] show in the maths green, as in a
// LaTeX editor. A field can't colour its own text, so while it has focus a copy of its text is laid
// over it (same box, font and scroll, pointer-transparent) and the field's own text goes transparent;
// the field keeps the caret, selection and spell-check underlines.
(function () {
  // the block editors and panels: their label popups and any field tagged data-tx="math" or data-tx="text"
  const SUB = '.td-pop-ta, [data-tx], .cz-props input[data-f="l"], .cz-props input[data-f="ann"], .cz-props input[data-f="v"], .cz-props input[data-f="i"], .cz-props input[data-f="text"]';
  const FIELDS = '#inlineEditor, #props textarea[data-key="text"], #props input[data-key="label"], .blk-ed, #props textarea[data-p="src"], #qcModal .cz-code textarea, ' + SUB; // other panels' source: $…$ as in text

  // Maths spans of one line as [start, end) offsets, delimiters included. Same rules as the renderer
  // (TD.textSegments), except an unclosed $ runs to the end of the line, so maths lights up as it is typed.
  // In maths, the argument of these is text again: not green, and only text commands are suggested there
  // ($…$ inside it is maths once more)
  const TEXT_ARG = /^\\(text(?:bf|it|rm|sf|tt|up|sl|sc|md|normal)?|mbox|hbox|emph|textnormal)\s*\{/;
  function spans(line: any, math = false) : any {
    const out = [];
    let at = math ? 0 : -1, display = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '\\' && at >= 0) {
        const m = TEXT_ARG.exec(line.slice(i));
        if (m) { // maths up to the {, then the text argument, then maths again after its }
          const open = i + m[0].length - 1;
          let d = 0, k = open;
          for (; k < line.length; k++) {
            if (line[k] === '\\') { k++; continue; }
            if (line[k] === '{') d++; else if (line[k] === '}' && --d === 0) break;
          }
          out.push([at, open + 1]);
          for (const [x, y] of spans(line.slice(open + 1, Math.min(k, line.length)), false)) out.push([open + 1 + x, open + 1 + y]);
          if (k >= line.length) return out; // still typing the argument: the caret is in text
          at = k; i = k; continue;
        }
      }
      if (c === '\\') {
        if (!math && at < 0 && line[i + 1] === '[') { at = i; display = true; i++; continue; }
        if (!math && at >= 0 && display && line[i + 1] === ']') { out.push([at, i + 2]); at = -1; i++; continue; }
        i++; continue;
      }
      if (c !== '$' || math) continue;
      if (at < 0) { display = line[i + 1] === '$'; at = i; if (display) i++; continue; }
      if (display) { if (line[i + 1] === '$') { out.push([at, i + 2]); at = -1; i++; } continue; }
      out.push([at, i + 1]); at = -1;
    }
    if (at >= 0) out.push([at, line.length, true]); // unclosed
    return out;
  }
  // Is offset `pos` of `text` inside maths (after an opening $ that is not yet closed, or in a data-tx="math" field outside \text{…})?
  function inMath(text: any, pos: any, math = false) {
    const sp = spans(text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos), math);
    return !!(sp.length && sp[sp.length - 1][2]);
  }

  // Quantum circuit code (quantikz): what LaTeX sets as maths. quantikz cells are tikz-cd cells, so a
  // gate's text, \push, the meter and phase labels and bare text in a cell are maths; stick, slice and
  // group labels are text, where only $…$ is maths.
  const QC_FIELDS = '#props [data-panel="qc"] textarea[data-p="src"], #qcModal .cz-code textarea';
  const isQc = (el: any) => el.matches(QC_FIELDS) || (el.id === 'inlineEditor' && el.classList.contains('code'));
  const QC_MATH = new Set(['gate', 'phase', 'push', 'meter', 'metercw', 'meterD', 'inputD', 'measure', 'measuretab', 'qwbundle', 'phantomgate', 'hphantomgate', 'ghost']);
  const QC_TEXT = new Set(['lstick', 'rstick', 'midstick', 'slice', 'gategroup', 'ground', 'trash', 'makeebit', 'gateinput', 'gateoutput']);
  // index just past the group opened at t[i] ({ or [), or the end of the text when it isn't closed
  function past(t: any, i: any) {
    const open = t[i], shut = open === '{' ? '}' : ']';
    let d = 0;
    for (let k = i; k < t.length; k++) {
      const c = t[k];
      if (c === '\\') { k++; continue; }
      if (c === '%') { const n = t.indexOf('\n', k); if (n < 0) return t.length; k = n; continue; }
      if (c === open) d++; else if (c === shut && --d === 0) return k + 1;
    }
    return t.length;
  }
  function qcSpans(t: any) {
    const out = [];
    const textArg = (s: any, e: any) => { // $…$ inside a text argument, line by line
      let a = s;
      for (const line of t.slice(s, e).split('\n')) { for (const [x, y] of spans(line)) out.push([a + x, a + y]); a += line.length + 1; }
    };
    for (let i = 0; i < t.length;) {
      const c = t[i];
      if (c === '%') { const n = t.indexOf('\n', i); i = n < 0 ? t.length : n + 1; continue; }
      if (c === '\\') {
        if (t[i + 1] === '\\') { // row break, and its [space]
          i += 2;
          let k = i; while (k < t.length && /[ \t]/.test(t[k])) k++;
          if (t[k] === '[') i = past(t, k);
          continue;
        }
        const m = /^\\([A-Za-z]+)\*?/.exec(t.slice(i));
        if (!m) { i += 2; continue; }
        i += m[0].length;
        for (;;) { // [options] and {arguments}
          let k = i;
          while (k < t.length && /[ \t]/.test(t[k])) k++;
          if (t[k] === '[') { i = past(t, k); continue; }
          if (t[k] !== '{') break;
          const e = past(t, k), inner = [k + 1, t[e - 1] === '}' ? e - 1 : e];
          if (QC_MATH.has(m[1]) && inner[1] > inner[0]) out.push(inner);
          else if (QC_TEXT.has(m[1])) textArg(...(inner as [any, any]));
          i = e;
          if (QC_MATH.has(m[1]) || QC_TEXT.has(m[1])) break; // their last argument is the label
        }
        continue;
      }
      if (c === '{') { i = past(t, i); continue; }
      if (/[\s&]/.test(c)) { i++; continue; }
      // bare text in a cell is \push'd: maths
      let j = i;
      while (j < t.length && !/[\\{&%\n]/.test(t[j])) j++;
      let e = j; while (e > i && /\s/.test(t[e - 1])) e--;
      if (e > i) out.push([i, e]);
      i = j;
    }
    return out;
  }

  const esc = (s: any) => s.replace(/[&<>]/g, (c: any) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }) as Record<string, any>)[c]);
  function paint(text: any, sp: any) {
    let h = '', k = 0;
    for (const [s, e] of sp) { if (s < k) continue; h += esc(text.slice(k, s)) + `<span class="tx-m">${esc(text.slice(s, e))}</span>`; k = e; }
    return h + esc(text.slice(k));
  }
  // qc: true for quantikz code, 'all' for a field whose whole text is maths (data-tx="math": a quantikz gate label)
  function html(text: any, qc: any) {
    // a trailing newline still gets its line
    if (qc === 'all') return text.split('\n').map((line: any) => paint(line, line ? spans(line, true) : [])).join('\n') + '\n';
    if (qc) return paint(text, qcSpans(text)) + '\n';
    return text.split('\n').map((line: any) => paint(line, spans(line))).join('\n') + '\n';
  }

  // ----- the overlay -----
  const COPY = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantLigatures', 'letterSpacing', 'lineHeight', 'wordSpacing', 'tabSize', 'textIndent',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'zoom'];
  let ta: any = null, ov: any = null, raf = 0, last: any = null;
  function attach(el: any) {
    detach();
    ta = el;
    ov = document.createElement('div');
    ov.className = 'tx-hl';
    ov.setAttribute('aria-hidden', 'true');
    el.after(ov);
    // the copy and the caret take the field's own text colour (read before it goes transparent): a field on
    // the paper (a Table cell, a label) keeps black text in dark mode, where the interface ink is light
    const ink = getComputedStyle(el).color;
    ov.style.color = ink;
    el.style.setProperty('--tx-ink', ink);
    el.classList.add('tx-hl-on');
    last = null;
    tick();
  }
  function detach() {
    cancelAnimationFrame(raf);
    if (ov) ov.remove();
    if (ta) { ta.classList.remove('tx-hl-on'); ta.style.removeProperty('--tx-ink'); }
    ta = ov = null;
  }
  function tick() {
    if (!ta || !ta.isConnected || document.activeElement !== ta) { detach(); return; }
    sync();
    raf = requestAnimationFrame(tick);
  }
  function sync() {
    const cs = getComputedStyle(ta), st = ov.style;
    if (cs.display === 'none') { st.display = 'none'; return; }
    for (const k of COPY) st[k] = cs[k as keyof CSSStyleDeclaration];
    const input = ta.tagName === 'INPUT';
    const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth), bt = parseFloat(cs.borderTopWidth), bb = parseFloat(cs.borderBottomWidth);
    // a scrollbar takes width from the text area: give the copy the same
    st.paddingRight = parseFloat(cs.paddingRight) + Math.max(0, ta.offsetWidth - ta.clientWidth - bl - br) + 'px';
    st.width = cs.width; st.height = cs.height;
    st.display = 'block';
    st.whiteSpace = input ? 'pre' : 'pre-wrap';
    st.overflowWrap = input ? 'normal' : 'break-word';
    // a one-line input centres its text vertically
    if (input) st.lineHeight = parseFloat(cs.height) - bt - bb - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + 'px';
    st.zIndex = /^\d+$/.test(cs.zIndex) ? +cs.zIndex + 1 : '';
    // the code editor's mode can be set after it takes focus, so a mode change repaints too
    const mode = isQc(ta) ? 'q' : ta.dataset.tx === 'math' ? 'm' : 't', key = mode + ta.value;
    if (key !== last) { last = key; ov.innerHTML = html(ta.value, mode === 'q' ? true : mode === 'm' ? 'all' : false); }
    // place it over the field, whatever transform or zoom the field has
    st.left = '0px'; st.top = '0px';
    const r = ta.getBoundingClientRect(), o = ov.getBoundingClientRect(), z = o.width / (parseFloat(cs.width) || 1) || 1;
    st.left = (r.left - o.left) / z + 'px'; st.top = (r.top - o.top) / z + 'px';
    ov.scrollTop = ta.scrollTop; ov.scrollLeft = ta.scrollLeft;
  }

  const isField = (t: any) => t && t.matches && t.matches(FIELDS);
  document.addEventListener('focusin', (e) => { if (isField(e.target)) attach(e.target); }, true);
  document.addEventListener('input', (e) => { rest(e.target); if (ta === e.target && ov?.isConnected) sync(); else if (document.activeElement === e.target && isField(e.target)) attach(e.target); }, true);
  // At rest (no overlay) a data-tx="math" field is green throughout by CSS; one holding \text{…} is marked
  // tx-mixed and stays ink, so text never shows green
  const TEXT_IN = /\\(text(?:bf|it|rm|sf|tt|up|sl|sc|md|normal)?|mbox|hbox|emph|textnormal)\s*\{/;
  function rest(el: any) { if (el && el.dataset && el.dataset.tx === 'math') el.classList.toggle('tx-mixed', TEXT_IN.test(el.value)); }
  document.addEventListener('td-value', (e) => rest(e.target), true);
  document.addEventListener('focusout', (e) => setTimeout(() => rest(e.target), 0), true);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes as any) if (n.nodeType === 1 && !(n instanceof SVGElement)) { if (n.matches('[data-tx="math"]')) rest(n); for (const f of n.querySelectorAll('[data-tx="math"]')) rest(f); }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ----- brackets in maths -----
  // In maths (green), ( [ { type their closing partner after the caret, or wrap a selection in the pair;
  // typing the closer just before an auto-typed one steps over it, and Backspace between an empty pair
  // removes both. \{ pairs with \}. Outside maths, keys type as usual.
  const PAIR: Record<string, any> = { '(': ')', '[': ']', '{': '}' }, SHUT: Record<string, any> = { ')': '(', ']': '[', '}': '{' };
  const BRACKET_FIELDS = FIELDS + ', #quickTex';
  function mathAt(el: any, pos: any) {
    if (el.dataset.tx === 'math') return inMath(el.value, pos, true);
    if (isQc(el)) return TD.texMath.qcSpans(el.value).some(([a, b]: any) => pos >= a && pos <= b);
    return inMath(el.value, pos);
  }
  // does the line around pos have as many closers as openers of this kind (escaped ones aside)?
  function balanced(t: any, pos: any, open: any) {
    const a = t.lastIndexOf('\n', pos - 1) + 1, b = t.indexOf('\n', pos), line = t.slice(a, b < 0 ? t.length : b);
    let d = 0;
    for (let i = 0; i < line.length; i++) { if (line[i] === '\\') { i++; continue; } if (line[i] === open) d++; else if (line[i] === PAIR[open]) d--; }
    return d === 0;
  }
  function put(el: any, text: any, a: any, b: any, selA: any, selB: any) {
    el.setSelectionRange(a, b);
    // insertText keeps the field's own undo; setRangeText is the fallback
    if (!document.execCommand('insertText', false, text)) { el.setRangeText(text, a, b, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.setSelectionRange(selA, selB);
  }
  document.addEventListener('keydown', (e) => {
    const el = e.target, k = e.key;
    if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || !(PAIR[k] || SHUT[k] || k === 'Backspace')) return;
    if (!el || !(el as Element).matches || !(el as Element).matches(BRACKET_FIELDS) || (el as HTMLInputElement).readOnly) return;
    const t = (el as HTMLInputElement).value, a = (el as HTMLTextAreaElement).selectionStart, b = (el as HTMLTextAreaElement).selectionEnd;
    if (!mathAt(el, a)) return;
    const esc = t[a - 1] === '\\' && !(t[a - 2] === '\\');
    if (PAIR[k]) {
      if (esc && k !== '{') return; // \( and \[ are delimiters of their own
      const close = esc ? '\\}' : PAIR[k];
      if (a !== b) { put(el, k + t.slice(a, b) + close, a, b, a + 1, b + 1); e.preventDefault(); return; }
      if (a < t.length && !/[\s$]/.test(t[a])) return; // only at the end, or before a space or the $ that ends the maths: elsewhere just the opener
      put(el, k + close, a, a, a + 1, a + 1);
      e.preventDefault();
    } else if (SHUT[k]) {
      if (a !== b || t[a] !== k || !balanced(t, a, SHUT[k])) return;
      (el as HTMLTextAreaElement).setSelectionRange(a + 1, a + 1);
      e.preventDefault();
    } else if (a === b && a > 0 && PAIR[t[a - 1]] && t[a] === PAIR[t[a - 1]] && t[a - 2] !== '\\' && balanced(t, a, t[a - 1])) {
      put(el, '', a - 1, a + 1, a - 1, a - 1);
      e.preventDefault();
    }
  }, true); // capture: fields such as the label popup stop their keys from bubbling

  TD.texMath = { spans, inMath, qcSpans };
})();
