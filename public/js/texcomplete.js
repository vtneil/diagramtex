// LaTeX command suggestions: type "\" in any text field that takes LaTeX (the canvas text editor,
// the Text / Label fields in the properties panel, Document text blocks) and a list of matching
// commands appears at the caret with a rendered preview. ↑↓ choose, Enter / Tab insert, Esc close.
(function () {
  const TD = window.TD;

  // Fields that get suggestions.
  const FIELDS = '#inlineEditor, #props textarea[data-key="text"], #props input[data-key="label"], .blk-ed, #props textarea[data-p="src"], .td-pop-ta, #quickTex';
  // Quantum circuit code (the canvas code editor, or the panel's code field): quantikz commands at cell
  // level, maths inside a command's {argument}, nothing inside [options].
  const isQc = (el) => el.matches('#props textarea[data-p="src"]') || (el.id === 'inlineEditor' && el.classList.contains('code'));

  // Command list, roughly by how often it is used. Each entry: name, then optionally what to
  // insert ("|" marks where the caret goes) and the TeX to preview it with.
  // Group tags: m = maths, t = text mode (preview rendered via \text).
  const C = [];
  const add = (group, list) => { for (const e of list) { const [name, ins, prev] = Array.isArray(e) ? e : [e]; C.push({ name, ins: ins || '\\' + name, prev, group }); } };

  add('Structure', [
    ['frac', '\\frac{|}{}', '\\frac{a}{b}'], ['dfrac', '\\dfrac{|}{}', '\\dfrac{a}{b}'], ['tfrac', '\\tfrac{|}{}', '\\tfrac{a}{b}'],
    ['sqrt', '\\sqrt{|}', '\\sqrt{x}'], ['sqrt[n]', '\\sqrt[|]{}', '\\sqrt[n]{x}'], ['binom', '\\binom{|}{}', '\\binom{n}{k}'],
    ['vec', '\\vec{|}', '\\vec{v}'], ['hat', '\\hat{|}', '\\hat{x}'], ['bar', '\\bar{|}', '\\bar{x}'], ['dot', '\\dot{|}', '\\dot{x}'],
    ['ddot', '\\ddot{|}', '\\ddot{x}'], ['tilde', '\\tilde{|}', '\\tilde{x}'], ['widehat', '\\widehat{|}', '\\widehat{AB}'],
    ['widetilde', '\\widetilde{|}', '\\widetilde{AB}'], ['overline', '\\overline{|}', '\\overline{AB}'], ['underline', '\\underline{|}', '\\underline{x}'],
    ['overrightarrow', '\\overrightarrow{|}', '\\overrightarrow{AB}'], ['overbrace', '\\overbrace{|}^{}', '\\overbrace{a+b}^{n}'],
    ['underbrace', '\\underbrace{|}_{}', '\\underbrace{a+b}_{n}'], ['overset', '\\overset{|}{}', '\\overset{!}{=}'], ['underset', '\\underset{|}{}', '\\underset{x}{\\max}'],
    ['stackrel', '\\stackrel{|}{}', '\\stackrel{def}{=}'], ['cancel', '\\cancel{|}', '\\cancel{x}'], ['boxed', '\\boxed{|}', '\\boxed{E=mc^2}'],
    ['left(', '\\left( | \\right)', '\\left(\\frac{a}{b}\\right)'], ['left[', '\\left[ | \\right]', '\\left[\\frac{a}{b}\\right]'],
    ['left\\{', '\\left\\{ | \\right\\}', '\\left\\{\\frac{a}{b}\\right\\}'], ['left|', '\\left| | \\right|', '\\left|\\frac{a}{b}\\right|'],
    ['displaystyle', '\\displaystyle ', '\\displaystyle\\sum_{i}'],
  ]);
  add('Environment', [
    ['begin{aligned}', '\\begin{aligned} | &= \\\\ &= \\end{aligned}', '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}'],
    ['begin{cases}', '\\begin{cases} | & \\text{if } \\\\ & \\text{otherwise} \\end{cases}', '\\begin{cases}1&x>0\\\\0&x\\le0\\end{cases}'],
    ['begin{pmatrix}', '\\begin{pmatrix} | & \\\\ & \\end{pmatrix}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'],
    ['begin{bmatrix}', '\\begin{bmatrix} | & \\\\ & \\end{bmatrix}', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}'],
    ['begin{vmatrix}', '\\begin{vmatrix} | & \\\\ & \\end{vmatrix}', '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}'],
    ['begin{matrix}', '\\begin{matrix} | & \\\\ & \\end{matrix}', '\\begin{matrix}a&b\\\\c&d\\end{matrix}'],
    ['begin{array}', '\\begin{array}{cc} | & \\\\ & \\end{array}', '\\begin{array}{|c|c|}a&b\\\\c&d\\end{array}'],
    ['begin{gathered}', '\\begin{gathered} | \\\\ \\end{gathered}', '\\begin{gathered}a\\\\b+c\\end{gathered}'],
  ]);
  add('Greek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi',
    'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega']);
  add('Big operator', [['sum', '\\sum_{|}^{}', '\\sum_{i=1}^{n}'], ['prod', '\\prod_{|}^{}', '\\prod_{i=1}^{n}'], ['int', '\\int_{|}^{}', '\\int_{a}^{b}'],
    'iint', 'iiint', 'oint', ['lim', '\\lim_{| \\to }', '\\lim_{x\\to 0}'], 'coprod', 'bigcup', 'bigcap', 'bigoplus', 'bigotimes']);
  add('Function', ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp',
    'max', 'min', 'sup', 'inf', 'limsup', 'liminf', 'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'Pr', ['operatorname', '\\operatorname{|}', '\\operatorname{tr}']]);
  add('Relation', ['leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong', 'propto', 'll', 'gg', 'le', 'ge', 'ne', 'in', 'notin', 'ni',
    'subset', 'supset', 'subseteq', 'supseteq', 'perp', 'parallel', 'mid', 'prec', 'succ', 'preceq', 'succeq', 'doteq', 'models', 'vdash', 'coloneqq']);
  add('Operator', ['pm', 'mp', 'times', 'div', 'cdot', 'ast', 'star', 'circ', 'bullet', 'oplus', 'otimes', 'ominus', 'odot', 'cup', 'cap', 'setminus',
    'wedge', 'vee', 'land', 'lor', 'neg', 'nabla', 'partial']);
  add('Arrow', ['to', 'rightarrow', 'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'implies', 'iff', 'mapsto',
    'longrightarrow', 'longleftarrow', 'Longrightarrow', 'uparrow', 'downarrow', 'updownarrow', 'nearrow', 'searrow', 'nwarrow', 'swarrow',
    'hookrightarrow', 'rightharpoonup', 'rightleftharpoons', 'gets', ['xrightarrow', '\\xrightarrow{|}', '\\xrightarrow{f}']]);
  add('Symbol', ['infty', 'forall', 'exists', 'nexists', 'emptyset', 'varnothing', 'ell', 'hbar', 'Re', 'Im', 'aleph', 'angle', 'measuredangle', 'triangle',
    'prime', 'degree', 'ldots', 'cdots', 'vdots', 'ddots', 'therefore', 'because', 'square', 'Box', 'dagger', 'checkmark', 'circledR',
    'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil', 'lVert', 'rVert', 'vert', 'lbrace', 'rbrace', 'clubsuit', 'heartsuit', 'spadesuit']);
  // maths alphabets first, then the text styles; preview samples as in the KaTeX font table (Ab0)
  const font = (n, sample = 'Ab0') => [n, `\\${n}{|}`, `\\${n}{${sample}}`];
  add('Font', [font('mathbf'), font('mathbb', 'R'), font('mathcal', 'L'), font('mathscr', 'L'), font('mathrm'), font('mathit'),
    font('mathbfit'), font('boldsymbol', '\\alpha'), font('bm', '\\alpha'), font('mathfrak', 'g'), font('mathsf'), font('mathsfit'), font('mathtt'),
    font('mathnormal'), font('mathds', 'R'), font('mathbbm', '1'),
    ['text', '\\text{|}', '\\text{text}'], font('textbf'), font('textit'), ['emph', '\\emph{|}', '\\emph{Ab0}'], font('textsl'), font('textsc'),
    font('texttt'), font('textsf'), font('textrm'), font('textup'), font('textmd'), font('textnormal')]);
  // declarations: the style for the rest of a {group}
  add('Font', ['bfseries', 'itshape', 'em', 'slshape', 'scshape', 'ttfamily', 'sffamily', 'rmfamily', 'upshape', 'mdseries', 'normalfont']
    .map((n) => [n, `{\\${n} |}`, `\\text{\\${n} Ab0}`]));
  add('Spacing', [['quad', null, 'a\\quad b'], ['qquad', null, 'a\\qquad b']]);

  for (const c of C) {
    if (!c.prev) c.prev = c.ins.replace('|', '').replace(/\{\}/g, '{\\square}');
    c.after = c.ins.indexOf('|') >= 0 ? c.ins.length - c.ins.indexOf('|') - 1 : 0; // chars after the caret
    c.text = c.ins.replace('|', '');
  }

  // quantikz2: what goes in a circuit cell. `ex` is a snippet drawn as the preview (cells joined by &, rows by \\).
  const QC = [];
  const qadd = (group, list) => { for (const [name, ins, ex, prev] of list) QC.push({ name, ins, ex, prev, group, qc: true }); };
  qadd('Gate', [
    ['gate', '\\gate{|}', '& \\gate{U} &'],
    ['gate[wires]', '\\gate[|]{}', '& \\gate[2]{U} & \\\\ & &'],
    ['phase', '\\phase{|}', '& \\phase{\\alpha} &'],
    ['ghost', '\\ghost{|}', null],
  ]);
  qadd('Control', [
    ['ctrl', '\\ctrl{|}', '& \\ctrl{1} & \\\\ & \\targ{} &'],
    ['octrl', '\\octrl{|}', '& \\octrl{1} & \\\\ & \\targ{} &'],
    ['control', '\\control{}', '& \\control{} &'],
    ['ocontrol', '\\ocontrol{}', '& \\ocontrol{} &'],
    ['targ', '\\targ{}', '& \\targ{} &'],
    ['swap', '\\swap{|}', '& \\swap{1} & \\\\ & \\targX{} &'],
    ['targX', '\\targX{}', '& \\targX{} &'],
  ]);
  qadd('Measure', [
    ['meter', '\\meter{}', '& \\meter{} &'],
    ['meterD', '\\meterD{|}', '& \\meterD{0} &'],
    ['measuretab', '\\measuretab{|}', '& \\measuretab{Z} &'],
    ['measure', '\\measure{|}', '& \\measure{Z} &'],
  ]);
  qadd('Wire', [
    ['qw', '\\qw', '& \\qw &'],
    ['cw', '\\cw', '& \\cw &'],
    ['qwbundle', '\\qwbundle{|}', '& \\qwbundle{n} &'],
    ['setwiretype', '\\setwiretype{|}', '& \\setwiretype{c} &'],
    ['wireoverride', '\\wireoverride{|}', '& & \\wireoverride{n} & &'],
    ['wire', '\\wire[|][1]{q}', '& \\wire[d][1]{c} & \\\\ & &'],
    ['vqw', '\\vqw{|}', '& \\vqw{1} & \\\\ & &'],
    ['vcw', '\\vcw{|}', '& \\vcw{1} & \\\\ & &'],
    ['cwbend', '\\cwbend{|}', '& \\cwbend{1} & \\\\ & &'],
    ['ground', '\\ground{}', '& \\ground{}'],
  ]);
  qadd('Label', [
    ['lstick', '\\lstick{|}', '\\lstick{\\ket{0}} &'],
    ['lstick[wires]', '\\lstick[|]{}', '\\lstick[2]{$\\psi$} & \\\\ &'],
    ['rstick', '\\rstick{|}', '& \\rstick{\\ket{0}}'],
    ['push', '\\push{|}', '& \\push{x} &'],
    ['midstick', '\\midstick{|}', '& \\midstick{x} &'],
    ['ket', '\\ket{|}', null, '\\ket{0}'],
    ['bra', '\\bra{|}', null, '\\bra{0}'],
  ]);
  qadd('Group', [
    ['slice', '\\slice{|}', '& \\slice{1} & &'],
    ['gategroup', '\\gategroup[wires=|,steps=1]{}', '& \\gate{U} \\gategroup[wires=1,steps=1]{g} &'],
  ]);
  qadd('Environment', [['begin{quantikz}', '\\begin{quantikz}\n|\n\\end{quantikz}', '\\lstick{} & \\gate{} &']]);
  for (const c of QC) {
    c.after = c.ins.length - c.ins.indexOf('|') - 1;
    c.text = c.ins.replace('|', '');
  }
  // Where the caret sits in quantikz code: 'cell', 'arg' (inside {…}) or 'opt' (inside […]).
  function qcPlace(text, at) {
    const st = [];
    for (let i = 0; i < at; i++) {
      const ch = text[i];
      // a cell or row boundary: whatever was left open before it (a half-typed bracket) doesn't carry over
      if (ch === '&' || (ch === '\\' && text[i + 1] === '\\')) { st.length = 0; if (ch === '\\') i++; continue; }
      if (ch === '\\') { i++; continue; }
      if (ch === '%') { const n = text.indexOf('\n', i); if (n < 0 || n >= at) return 'cell'; i = n; continue; } // a comment
      if (ch === '{' || ch === '[') st.push(ch);
      else if ((ch === '}' && st[st.length - 1] === '{') || (ch === ']' && st[st.length - 1] === '[')) st.pop();
    }
    return st.includes('{') ? 'arg' : st.length ? 'opt' : 'cell';
  }

  // Everything else the engines know (js/texcommands.js, generated from KaTeX and Temml):
  // appended after the hand-picked list, with {} slots for its arguments.
  const ROWS = TD.TEX_COMMANDS || [];
  const ENGINE_COL = { katex: 1, temml: 2 };
  const support = new Map(ROWS.map((r) => [r[0], r]));
  const baseName = (n) => n.match(/^[A-Za-z]+/)?.[0] || n;
  function guessGroup(n, textOnly) {
    if (textOnly || /^text/.test(n)) return 'Text';
    if (/arrow|harpoon|mapsto|leadsto/i.test(n)) return 'Arrow';
    if (/^(math|bold|Bbb|frak|mit|rm|bf|it|sf|tt|cal|scr)/.test(n)) return 'Font';
    if (/space|quad|^(enskip|thinspace|negthinspace)$/.test(n)) return 'Spacing';
    if (/^(var)?[a-z]*(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|digamma)$/i.test(n)) return 'Greek';
    if (/^(n?[lg]eq?|n?sub|n?sup|n?sim|n?approx|n?equiv|n?prec|n?succ|n?less|n?gtr|nmid|nparallel|ncong)/.test(n)) return 'Relation';
    if (/^(big|over|under|wide|x)/.test(n)) return 'Structure';
    return 'Symbol';
  }
  const curated = new Set(C.map((c) => baseName(c.name)));
  const generated = [];
  for (const [n, ka, ta, tx] of ROWS) {
    if (curated.has(n)) continue;
    const arity = Math.max(ka, ta);
    const ins = '\\' + n + (arity > 0 ? '{|}' + '{}'.repeat(arity - 1) : '');
    const sample = ['{x}', '{x}{y}', '{x}{y}{z}'][arity - 1] || '';
    const prev = tx ? `\\text{\\${n}${sample}}` : `\\${n}${sample}`;
    generated.push({ name: n, ins, prev, tx: !!tx, group: guessGroup(n, tx), text: ins.replace('|', ''), after: arity > 0 ? ins.length - ins.indexOf('|') - 1 : 0 });
  }
  // The list for the engine in use: hand-picked first, then the rest A–Z; unsupported ones dropped.
  const lists = {};
  function list() {
    const e = (TD.math && TD.math.engine) || 'katex';
    if (lists[e]) return lists[e];
    const col = ENGINE_COL[e] || 1;
    const usable = (c) => { const r = support.get(baseName(c.name)); return !r || r[col] >= 0 || TD.math.drawsAs(baseName(c.name)); };
    return (lists[e] = [...C.filter(usable), ...generated.filter(usable)]);
  }
  // Outside $…$ only text commands are offered: a maths command there would not compile.
  const proseLists = {};
  const isText = (c) => c.tx || TD.prose.textOk(baseName(c.name));
  function proseList() {
    const e = (TD.math && TD.math.engine) || 'katex';
    return proseLists[e] || (proseLists[e] = list().filter(isText));
  }

  // ----- popup -----
  const pop = document.createElement('div');
  pop.id = 'texComplete';
  pop.setAttribute('role', 'listbox');
  pop.hidden = true;
  document.body.appendChild(pop);
  let field = null, start = 0, items = [], idx = 0, quiet = false;
  const preview = new Map();
  function render1(tex) {
    const key = TD.math.engine + '|' + tex;
    if (preview.has(key)) return preview.get(key);
    let h = '';
    try { h = TD.math.render(tex, { throwOnError: true }); } catch (e) { h = ''; }
    preview.set(key, h);
    return h;
  }

  // a quantikz snippet, drawn by the circuit renderer itself (cached; the drawing depends on the maths engine)
  function qcPrev(src) {
    const key = 'qc|' + TD.math.engine + '|' + src;
    if (!preview.has(key)) { let h = ''; try { h = TD.qcMini ? TD.qcMini(src) : ''; } catch (e) { h = ''; } preview.set(key, h); }
    return preview.get(key);
  }

  // Command being typed just before the caret: "\" plus letters (or one symbol for \, \; \!).
  function current(el) {
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd) return null;
    const before = el.value.slice(0, pos);
    const m = before.match(/\\([A-Za-z]*)$/);
    if (!m) return null;
    const at = pos - m[0].length;
    // "\\" is a line break, not a command
    let k = at - 1, n = 0;
    while (k >= 0 && before[k] === '\\') { n++; k--; }
    if (n % 2) return null;
    return { at, q: m[1] };
  }
  function rank(q, prose, from) {
    const all = from || (prose ? proseList() : list());
    if (!q) return all.slice(0, 40);
    const ql = q.toLowerCase();
    const exact = [], pre = [], preCI = [], sub = [];
    for (const c of all) {
      const n = c.name;
      if (n === q) exact.push(c);
      else if (n.startsWith(q)) pre.push(c);
      else if (n.toLowerCase().startsWith(ql)) preCI.push(c);
      else if (ql.length > 1 && n.toLowerCase().includes(ql)) sub.push(c);
    }
    return [...exact, ...pre, ...preCI, ...sub].slice(0, 40);
  }
  function update(el) {
    const cur = current(el);
    if (!cur) return close();
    if (isQc(el)) {
      const where = qcPlace(el.value, cur.at);
      if (where === 'opt') return close();
      items = where === 'arg' ? rank(cur.q, false) : rank(cur.q, false, QC);
    } else items = rank(cur.q, !(el.dataset.tx === 'math' || TD.texMath.inMath(el.value, cur.at))); // data-tx="math": the whole field is maths (a gate label)
    if (!items.length) return close();
    field = el; start = cur.at; idx = 0;
    pop.innerHTML = '<ul>' + items.map((c, i) => `<li role="option" data-i="${i}"${i === 0 ? ' class="on" aria-selected="true"' : ''}>` +
      `<span class="tc-name">\\${esc(c.name)}</span><span class="tc-prev">${c.ex ? qcPrev(c.ex) : c.prev ? render1(c.prev) : ''}</span><span class="tc-grp">${c.group}</span></li>`).join('') +
      '</ul><div class="tc-foot"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> / <kbd>Tab</kbd> insert · <kbd>Esc</kbd> close</div>';
    pop.hidden = false;
    place(el, cur.at);
  }
  function close() { pop.hidden = true; field = null; items = []; }
  function move(d) {
    if (!items.length) return;
    idx = (idx + d + items.length) % items.length;
    pop.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('on', i === idx); li.setAttribute('aria-selected', i === idx); });
    const li = pop.querySelectorAll('li')[idx];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
  function accept(i = idx) {
    const c = items[i], el = field;
    if (!c || !el) return;
    const end = el.selectionStart;
    el.setRangeText(c.text, start, end, 'end');
    const caret = el.selectionStart - c.after;
    el.setSelectionRange(caret, caret);
    close();
    // tell the editor the text changed, without reopening the list on the command just inserted
    quiet = true;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } finally { quiet = false; }
    el.focus();
  }

  // Screen position of a character in a textarea / input, via an off-screen mirror.
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  document.body.appendChild(mirror);
  const COPY = ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle'];
  function caretXY(el, pos) {
    const cs = getComputedStyle(el), st = mirror.style;
    for (const k of COPY) st[k] = cs[k];
    const isInput = el.tagName === 'INPUT';
    Object.assign(st, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden',
      whiteSpace: isInput ? 'pre' : 'pre-wrap', overflowWrap: isInput ? 'normal' : 'break-word', height: 'auto' });
    mirror.textContent = el.value.slice(0, pos);
    const mark = document.createElement('span');
    mark.textContent = '​';
    mirror.appendChild(mark);
    const r = el.getBoundingClientRect();
    return { x: r.left + mark.offsetLeft - el.scrollLeft, y: r.top + mark.offsetTop - el.scrollTop, h: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 };
  }
  function place(el, at) {
    const p = caretXY(el, at);
    pop.style.left = '0px'; pop.style.top = '0px';
    const w = pop.offsetWidth, h = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let x = Math.min(Math.max(8, p.x - 4), vw - w - 8), y = p.y + p.h + 4;
    if (y + h > vh - 8) y = Math.max(8, p.y - h - 4); // flip above the caret near the bottom edge
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ----- wiring (document level, so fields created later are covered too) -----
  const isField = (t) => t && t.matches && t.matches(FIELDS);
  document.addEventListener('input', (e) => { if (quiet) return; if (isField(e.target)) update(e.target); else if (field) close(); }, true);
  // Capture phase: runs before each editor's own Enter / Esc handling.
  document.addEventListener('keydown', (e) => {
    if (pop.hidden || e.target !== field) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { move(k === 'ArrowDown' ? 1 : -1); }
    else if ((k === 'Enter' && !e.shiftKey) || k === 'Tab') { accept(); }
    else if (k === 'Escape') { close(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') { setTimeout(() => field && update(field), 0); return; }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  document.addEventListener('click', (e) => { if (e.target === field) update(field); }, true);
  document.addEventListener('focusout', (e) => { if (e.target === field) setTimeout(() => { if (document.activeElement !== field) close(); }, 0); }, true);
  document.addEventListener('scroll', (e) => { if (field && !pop.contains(e.target)) close(); }, true);
  // Clicking an item must not blur the field (the canvas editor closes on blur).
  pop.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const li = e.target.closest('li[data-i]');
    if (li) accept(+li.dataset.i);
  });
  pop.addEventListener('mousemove', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li && +li.dataset.i !== idx) move(+li.dataset.i - idx);
  });

  TD.texComplete = { get commands() { return list(); }, close };
})();
