// Maths highlighting in the LaTeX text fields: $…$, $$…$$ and \[…\] show in the maths green, as in a
// LaTeX editor. A field can't colour its own text, so while it has focus a copy of its text is laid
// over it (same box, font and scroll, pointer-transparent) and the field's own text goes transparent;
// the field keeps the caret, selection and spell-check underlines.
(function () {
  const TD = window.TD;
  // the circuit and quantum editors: their label popups and the label fields in their side panels
  const SUB = '.td-pop-ta, .cz-props input[data-f="l"], .cz-props input[data-f="ann"], .cz-props input[data-f="v"], .cz-props input[data-f="i"], .cz-props input[data-f="text"], .cz-props input[data-tx]';
  const FIELDS = '#inlineEditor, #props textarea[data-key="text"], #props input[data-key="label"], .blk-ed, #props textarea[data-p="src"], ' + SUB;

  // Maths spans of one line as [start, end) offsets, delimiters included. Same rules as the renderer
  // (TD.textSegments), except an unclosed $ runs to the end of the line, so maths lights up as it is typed.
  // In maths, the argument of these is text again: not green, and only text commands are suggested there
  // ($…$ inside it is maths once more)
  const TEXT_ARG = /^\\(text(?:bf|it|rm|sf|tt|up|sl|sc|md|normal)?|mbox|hbox|emph|textnormal)\s*\{/;
  function spans(line) {
    const out = [];
    let at = -1, display = false;
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
          for (const [x, y] of spans(line.slice(open + 1, Math.min(k, line.length)))) out.push([open + 1 + x, open + 1 + y]);
          if (k >= line.length) return out; // still typing the argument: the caret is in text
          at = k; i = k; continue;
        }
      }
      if (c === '\\') {
        if (at < 0 && line[i + 1] === '[') { at = i; display = true; i++; continue; }
        if (at >= 0 && display && line[i + 1] === ']') { out.push([at, i + 2]); at = -1; i++; continue; }
        i++; continue;
      }
      if (c !== '$') continue;
      if (at < 0) { display = line[i + 1] === '$'; at = i; if (display) i++; continue; }
      if (display) { if (line[i + 1] === '$') { out.push([at, i + 2]); at = -1; i++; } continue; }
      out.push([at, i + 1]); at = -1;
    }
    if (at >= 0) out.push([at, line.length, true]); // unclosed
    return out;
  }
  // Is offset `pos` of `text` inside maths (after an opening $ that is not yet closed)?
  function inMath(text, pos) {
    const sp = spans(text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos));
    return !!(sp.length && sp[sp.length - 1][2]);
  }

  // Quantum circuit code (quantikz): what LaTeX sets as maths. quantikz cells are tikz-cd cells, so a
  // gate's text, \push, the meter and phase labels and bare text in a cell are maths; stick, slice and
  // group labels are text, where only $…$ is maths.
  const QC_FIELDS = '#props textarea[data-p="src"]';
  const isQc = (el) => el.matches(QC_FIELDS) || (el.id === 'inlineEditor' && el.classList.contains('code'));
  const QC_MATH = new Set(['gate', 'phase', 'push', 'meter', 'meterD', 'measure', 'measuretab', 'qwbundle']);
  const QC_TEXT = new Set(['lstick', 'rstick', 'midstick', 'slice', 'gategroup']);
  // index just past the group opened at t[i] ({ or [), or the end of the text when it isn't closed
  function past(t, i) {
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
  function qcSpans(t) {
    const out = [];
    const textArg = (s, e) => { // $…$ inside a text argument, line by line
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
          else if (QC_TEXT.has(m[1])) textArg(...inner);
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

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function paint(text, sp) {
    let h = '', k = 0;
    for (const [s, e] of sp) { if (s < k) continue; h += esc(text.slice(k, s)) + `<span class="tx-m">${esc(text.slice(s, e))}</span>`; k = e; }
    return h + esc(text.slice(k));
  }
  // qc: true for quantikz code, 'all' for a field whose whole text is maths (data-tx="math": a quantikz gate label)
  function html(text, qc) {
    // a trailing newline still gets its line
    if (qc === 'all') return text.split('\n').map((line) => paint(line, line ? [[0, line.length]] : [])).join('\n') + '\n';
    if (qc) return paint(text, qcSpans(text)) + '\n';
    return text.split('\n').map((line) => paint(line, spans(line))).join('\n') + '\n';
  }

  // ----- the overlay -----
  const COPY = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantLigatures', 'letterSpacing', 'lineHeight', 'wordSpacing', 'tabSize', 'textIndent',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'zoom'];
  let ta = null, ov = null, raf = 0, last = null;
  function attach(el) {
    detach();
    ta = el;
    ov = document.createElement('div');
    ov.className = 'tx-hl';
    ov.setAttribute('aria-hidden', 'true');
    el.after(ov);
    el.classList.add('tx-hl-on');
    last = null;
    tick();
  }
  function detach() {
    cancelAnimationFrame(raf);
    if (ov) ov.remove();
    if (ta) ta.classList.remove('tx-hl-on');
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
    for (const k of COPY) st[k] = cs[k];
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

  const isField = (t) => t && t.matches && t.matches(FIELDS);
  document.addEventListener('focusin', (e) => { if (isField(e.target)) attach(e.target); }, true);

  TD.texMath = { spans, inMath, qcSpans };
})();
