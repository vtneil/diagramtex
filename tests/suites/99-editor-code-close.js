// A block editor docked in a pane (Quick) and closed straight after typing in its code pane: the code typed in the last
// moment (before the 250ms read) is kept, and the read still due does not throw once the editor is closed.
T.test('block editor: docked, closed within 250ms of typing in the code pane, keeps the code and throws nothing', async () => {
  TD.app.newDoc(); TD.app.setMode('diagram');
  const ed = TD.bytefieldEditor, typed = '\\begin{bytefield}{16}\n  \\bitbox{16}{Marker}\n\\end{bytefield}';
  const errors = [], onErr = (e) => errors.push(String(e.error || e.message));
  const dock = document.createElement('div');
  dock.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px';
  document.body.appendChild(dock);
  window.addEventListener('error', onErr);
  let got = null;
  try {
    ed.open({ src: TD.BYTEFIELD_DEFAULT }, (r) => { got = r; }, undefined, { dock });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ta = document.querySelector('#bfModal .cz-code textarea');
    T.ok(ta && dock.contains(ta), 'docked, with its code pane');
    ta.focus();
    ta.value = typed;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ed.close(); // the host's close: out of the pane and closed as Done would
    T.ok(!ed._state(), 'closed');
    await new Promise((r) => setTimeout(r, 400)); // past the 250ms read
    T.eq(errors, [], 'no error after closing');
    T.ok(got && /Marker/.test(got.src), 'the typed code reached the block: ' + JSON.stringify(got));
  } finally {
    window.removeEventListener('error', onErr);
    if (ed._state()) document.querySelector('#bfModal [data-ge="done"], #bfModal .cz-done')?.click();
    dock.remove();
  }
});
