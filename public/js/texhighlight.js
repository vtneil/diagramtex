// Maths highlighting in the LaTeX text fields: $…$, $$…$$ and \[…\] show in the maths green, as in a
// LaTeX editor. A field can't colour its own text, so while it has focus a copy of its text is laid
// over it (same box, font and scroll, pointer-transparent) and the field's own text goes transparent;
// the field keeps the caret, selection and spell-check underlines.
(function () {
  const TD = window.TD;
  const FIELDS = '#inlineEditor, #props textarea[data-key="text"], #props input[data-key="label"], .blk-ed';

  // Maths spans of one line as [start, end) offsets, delimiters included. Same rules as the renderer
  // (TD.textSegments), except an unclosed $ runs to the end of the line, so maths lights up as it is typed.
  function spans(line) {
    const out = [];
    let at = -1, display = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
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

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function html(text) {
    return text.split('\n').map((line) => {
      let h = '', k = 0;
      for (const [s, e] of spans(line)) { h += esc(line.slice(k, s)) + `<span class="tx-m">${esc(line.slice(s, e))}</span>`; k = e; }
      return h + esc(line.slice(k));
    }).join('\n') + '\n'; // a trailing newline still gets its line
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
    if (ta.value !== last) { last = ta.value; ov.innerHTML = html(last); }
    // place it over the field, whatever transform or zoom the field has
    st.left = '0px'; st.top = '0px';
    const r = ta.getBoundingClientRect(), o = ov.getBoundingClientRect(), z = o.width / (parseFloat(cs.width) || 1) || 1;
    st.left = (r.left - o.left) / z + 'px'; st.top = (r.top - o.top) / z + 'px';
    ov.scrollTop = ta.scrollTop; ov.scrollLeft = ta.scrollLeft;
  }

  const isField = (t) => t && t.matches && t.matches(FIELDS);
  document.addEventListener('focusin', (e) => { if (isField(e.target)) attach(e.target); }, true);

  TD.texMath = { spans, inMath };
})();
