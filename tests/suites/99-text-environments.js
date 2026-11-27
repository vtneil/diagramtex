// Maths environments in a canvas text (src/core/tex-envs.ts): align*, gather*, equation*, the matrices and cases,
// typed outside $…$ and over several lines, are one display formula. Drawn as the engines read them, and exported as
// the inline environment in display style, which a TikZ node can hold (align* inside a node is a LaTeX error).
const text = (s) => ({ ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), text: s });
const nodeOf = (tex) => (tex.match(/\\node[^\n]*\};/) || [''])[0];

T.test('text environments: a display over several lines is one row, drawn as maths, exported as aligned', () => {
  const src = 'Laws:\n\\begin{align*}\n  E &= mc^2 \\label{e} \\\\ % energy\n  p &= mv\n\\end{align*}\nafter';
  T.eq(TD.textLines(src).length, 3, 'three rows: the text, the environment, the text');
  const html = TD.textHtml(src);
  T.ok(!/begin\{align/.test(html.replace(/aria-label="[^"]*"|<annotation[\s\S]*?<\/annotation>/g, '')), 'no environment left as typed text');
  T.ok(!/katex-error|temml-error/.test(html), 'drawn without an error');
  const node = nodeOf(TD.toTikz([text(src)]));
  T.ok(node.includes('Laws: \\\\ $\\displaystyle \\begin{aligned}'), 'align* written as aligned in display style: ' + node);
  T.ok(!/\\label|% energy|\\&/.test(node), 'no \\label, no comment, & left as maths: ' + node);
});

T.test('text environments: each display written as its inline form; bare inner environments are maths', () => {
  const cases = [
    ['\\begin{gather*} a \\\\ b \\end{gather*}', '\\begin{gathered} a \\\\ b \\end{gathered}'],
    ['\\begin{equation*} E = mc^2 \\end{equation*}', '{ E = mc^2 }'],
    ['\\begin{alignat*}{2} a &= b & c &= d \\end{alignat*}', '\\begin{alignedat}{2} a &= b & c &= d \\end{alignedat}'],
    ['\\begin{equation}\\begin{split} a &= b \\\\ &= c \\end{split}\\end{equation}', '{\\begin{aligned} a &= b \\\\ &= c \\end{aligned}}'],
    ['v = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}', '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}'],
    ['$$\\begin{align*} x &= 1 \\end{align*}$$', '\\begin{aligned} x &= 1 \\end{aligned}'],
  ];
  for (const [src, want] of cases) {
    const node = nodeOf(TD.toTikz([text(src)]));
    T.ok(node.includes(want), `${src} → ${want}: ${node}`);
    T.ok(!/katex-error|temml-error/.test(TD.textHtml(src)), 'drawn: ' + src);
  }
  // an environment still being typed stays text, and a plain $$ with no environment keeps its line
  T.eq(TD.textLines('a\n\\begin{cases} 1').length, 2, 'unclosed: joined to the end');
  T.eq(TD.textLines('x $$y$$\nz').length, 2, 'a one-line display is unchanged');
});

T.test('text environments: the export compiles', () => {
  const S = [
    text('Laws:\n\\begin{align*}\n  E &= mc^2 \\\\\n  p &= mv\n\\end{align*}'),
    { ...text('$A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$ and \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}'), y: 120 },
    { ...text('\\begin{gather*} a + b \\\\ c \\end{gather*}'), y: 240 },
    { ...text('\\begin{multline*} a + b + c \\\\ + d \\end{multline*}'), y: 360 },
  ];
  T.tex('text-environments', TD.toTikz(S, { standalone: true }));
});

T.test('text environments: suggestions stay while an environment name is typed, and \\end{ offers the open one', async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const h = TD.input.popup(document.getElementById('stage'), { text: '', at: () => [200, 40], onDone() {} });
  try {
    await frame();
    const ta = document.querySelector('.td-pop-ta:not(.leaving)');
    if (!ta) return; // the MathLive editor, which has its own suggestions
    const pop = document.getElementById('texComplete');
    const type = async (v, caret = v.length) => { ta.focus(); ta.value = v; ta.setSelectionRange(caret, caret); ta.dispatchEvent(new Event('input', { bubbles: true })); await frame(); };
    const enter = async () => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await frame(); };
    for (const typed of ['\\begin{', '\\begin{al', 'x $\\begin{al']) {
      await type(typed);
      T.ok(!pop.hidden && pop.textContent.includes('aligned'), `${typed} offers aligned: ${pop.textContent.slice(0, 60)}`);
    }
    await type('\\begin{al');
    await enter();
    T.eq(ta.value, '\\begin{aligned}\n   &= \\\\\n  &=\n\\end{aligned}', 'chosen: on lines of its own, rows indented');
    T.eq(ta.selectionStart, '\\begin{aligned}\n  '.length, 'the caret in the first row');
    // under an indented line: indented with it; a matrix stays on one line
    await type('  \\begin{ca');
    await enter();
    T.eq(ta.value, '  \\begin{cases}\n     & \\text{if } \\\\\n    & \\text{otherwise}\n  \\end{cases}', 'cases under the line\'s indent');
    await type('$\\begin{pm');
    await enter();
    T.eq(ta.value, '$\\begin{pmatrix}  & \\\\ & \\end{pmatrix}', 'a matrix on one line');
    // the name's } already there (maths types { as {}): replaced, not doubled
    await type('$\\begin{bmatrix} a \\end{}$', '$\\begin{bmatrix} a \\end{'.length);
    T.ok(!pop.hidden && /^\\?end\{bmatrix\}/.test(pop.querySelector('[role=option], li')?.textContent.trim() ?? ''), 'the open environment first: ' + pop.textContent.slice(0, 60));
    await enter();
    T.eq(ta.value, '$\\begin{bmatrix} a \\end{bmatrix}$', 'closed once');
  } finally { TD.texComplete.close(); h.close(); }
});
