// Brackets in TeX code coloured by depth (src/ui/tex-brackets.ts), here in the LaTeX view: {{{1}2}3} takes three
// colours in and the same three out, \{ \} (braces drawn) are left alone, and copying part of a line copies its text.
T.test('LaTeX view: brackets coloured by depth, escaped braces left plain, a partial copy still exact', async () => {
  TD.app.newDoc(); TD.app.setMode('diagram');
  TD.state.doc.shapes.push(T.make('text', { set: { text: '$x^{{{1}2}3}$' } }), T.make('text', { y: 2, set: { text: '$\\{a\\}$' } }));
  TD.app.render();
  TD.app.cmd.runCmd('tikz');
  await new Promise((r) => setTimeout(r, 300));
  const view = document.querySelector('#tikzOut');
  try {
    const at = (el, node) => { const r = document.createRange(); r.setStart(el, 0); r.setStart(el, 0); r.setEnd(node, 0); return r.toString().length; };
    const marksIn = (needle) => {
      const line = [...view.querySelectorAll('.cl')].find((l) => l.textContent.includes(needle));
      T.ok(line, 'a line holds ' + needle);
      const i = line.textContent.indexOf(needle);
      return { line, i, spans: [...line.querySelectorAll('[class^="tx-b"]')].map((s) => [at(line, s.firstChild), +s.className.slice(4)]).filter(([o]) => o >= i && o < i + needle.length) };
    };
    const { spans } = marksIn('{{{1}2}3}');
    T.eq(spans.length, 6, 'all six brackets coloured');
    const k = spans[0][1], d = spans.map(([, c]) => (c - k + 3) % 3).join('');
    T.eq(d, '012210', 'depths in and out');
    const esc = marksIn('\\{a\\}');
    T.eq(esc.spans.filter(([o]) => o === esc.i + 1 || o === esc.i + 4).length, 0, '\\{ and \\} are not brackets');
    // copy from inside a coloured line, starting and ending within text between brackets
    const { line, i } = marksIn('{{{1}2}3}');
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), texts = [];
    for (let n; (n = walker.nextNode());) texts.push(n);
    const find = (pos) => { let o = 0; for (const n of texts) { if (pos <= o + n.length) return [n, pos - o]; o += n.length; } };
    const [a, ao] = find(i + 3), [b, bo] = find(i + 8); // "1}2}3"
    const R = document.createRange(); R.setStart(a, ao); R.setEnd(b, bo);
    getSelection().removeAllRanges(); getSelection().addRange(R);
    const dt = new DataTransfer();
    view.dispatchEvent(T.clipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    T.eq(dt.getData('text/plain'), '1}2}3', 'a partial copy is the text selected');
  } finally { getSelection().removeAllRanges(); TD.app.cmd.closeModal?.(); document.querySelector('#modal [data-close], #modal .modal-close')?.click(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
});

T.test('block editor code pane: brackets coloured while it has focus', async () => {
  TD.app.newDoc(); TD.app.setMode('diagram');
  TD.graphEditor.open({ src: TD.GRAPH_DEFAULT }, () => {});
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const code = document.querySelector('#graphModal .cz-code textarea');
    code.focus();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ov = code.parentElement.querySelector('.tx-hl');
    T.ok(ov, 'the code pane has the highlighting copy over it');
    T.ok(ov && ov.querySelector('.tx-b0') && ov.textContent === code.value + '\n', 'its brackets are coloured, its text the same');
  } finally { document.activeElement?.blur(); document.querySelector('#graphModal [data-ge="done"]')?.click(); } // Done closes it; TD.graphEditor.close only undocks it from Quick
});
