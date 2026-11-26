// ⌘B / ⌘I / ⌘U in the LaTeX text popup (src/ui/tex-format.ts): the LaTeX for bold, italic and underline round the
// selection, as text or as maths, whichever the selection is in; pressed again, or with the caret inside, they take it off.
T.test('text popup: Ctrl+B, Ctrl+I and Ctrl+U write text or maths commands, and toggle them off', async () => {
  const was = TD.input.mode;
  TD.input.set('latex');
  const host = document.body; // shown in every mode (the stage is hidden in the Document view), so the field takes the focus
  const open = (text, math = false) => {
    const p = TD.input.popup(host, { text, math, at: () => [200, 120], onDone: () => {} });
    return { p, ta: document.querySelector('.td-pop-ta:not(.leaving)') };
  };
  const key = (ta, k) => ta.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
  const sel = (ta) => ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const pick = (ta, part, from = 0) => { const i = ta.value.indexOf(part, from); ta.setSelectionRange(i, i + part.length); };
  try {
    let { p, ta } = open('ab $x + \\alpha$ cd');
    pick(ta, 'ab'); key(ta, 'b');
    T.eq(ta.value, '\\textbf{ab} $x + \\alpha$ cd', 'text: \\textbf'); T.eq(sel(ta), 'ab', 'the words stay selected');
    key(ta, 'b');
    T.eq(ta.value, 'ab $x + \\alpha$ cd', 'pressed again: off');
    pick(ta, 'x'); key(ta, 'b');
    T.eq(ta.value, 'ab $\\mathbf{x} + \\alpha$ cd', 'in $…$: \\mathbf');
    pick(ta, '\\alpha'); key(ta, 'b');
    T.eq(ta.value, 'ab $\\mathbf{x} + \\boldsymbol{\\alpha}$ cd', 'a Greek letter: \\boldsymbol (\\mathbf leaves it as it is)');
    const inside = ta.value.indexOf('{x}') + 1; ta.setSelectionRange(inside, inside); key(ta, 'b');
    T.eq(ta.value, 'ab $x + \\boldsymbol{\\alpha}$ cd', 'the caret inside \\mathbf{…}: off');
    pick(ta, 'cd'); key(ta, 'i');
    T.eq(ta.value, 'ab $x + \\boldsymbol{\\alpha}$ \\textit{cd}', 'text: \\textit');
    pick(ta, 'x'); key(ta, 'i');
    T.ok(ta.value.startsWith('ab $\\mathit{x}'), 'maths: \\mathit');
    pick(ta, 'ab'); key(ta, 'u');
    T.ok(ta.value.startsWith('\\underline{ab} $'), 'underline: \\underline');
    const end = ta.value.length; ta.setSelectionRange(end, end); key(ta, 'b');
    T.ok(ta.value.endsWith('\\textbf{}') && ta.selectionStart === ta.value.length - 1, 'nothing selected: the empty command, the caret inside');
    T.ok(!key(ta, 'i'), 'the browser\'s own key is stopped');
    p.close?.(); await new Promise((r) => setTimeout(r, 150));

    ({ p, ta } = open('$a \\text{hi} b$ \\(c\\) \\ensuremath{d}'));
    pick(ta, 'hi'); key(ta, 'b');
    T.ok(ta.value.includes('\\text{\\textbf{hi}}'), '\\text{…} inside maths is text: ' + ta.value);
    pick(ta, 'c'); key(ta, 'b');
    T.ok(ta.value.includes('\\(\\mathbf{c}\\)'), '\\(…\\) is maths');
    pick(ta, 'd', ta.value.indexOf('ensuremath')); key(ta, 'b');
    T.ok(ta.value.includes('\\ensuremath{\\mathbf{d}}'), '\\ensuremath{…} is maths');
    p.close?.(); await new Promise((r) => setTimeout(r, 150));

    ({ p, ta } = open('x + y', true));
    pick(ta, 'y'); key(ta, 'b');
    T.eq(ta.value, 'x + \\mathbf{y}', 'a field that is all maths (a gate): maths');
    p.close?.(); await new Promise((r) => setTimeout(r, 150));

    ({ p, ta } = open('a $b$ c'));
    pick(ta, 'a $b$ c'); key(ta, 'b');
    T.eq(ta.value, '\\textbf{a $b$ c}', 'from text into maths: text');
    pick(ta, '\\textbf{a $b$ c}'); key(ta, 'b');
    T.eq(ta.value, 'a $b$ c', 'the whole command selected: off');
    pick(ta, 'c'); key(ta, 'u');
    T.eq(ta.value, 'a $b$ \\underline{c}');
    document.execCommand('undo');
    T.eq(ta.value, 'a $b$ c', 'typed as the browser types: its undo takes it back: ' + JSON.stringify(ta.value));
  } finally {
    document.querySelectorAll('.td-pop-ta').forEach((el) => el.blur());
    await new Promise((r) => setTimeout(r, 150));
    TD.input.set(was);
  }
});
