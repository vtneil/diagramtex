// The keys every block editor shares (src/editors/editor-keys.ts), in each editor the blocks registry opens: ⌘Z stays
// in the editor (the page behind never sees it), Esc in a field only leaves the field, Esc closes an unchanged
// editor, ⌘Enter is Done.
T.test('block editors: shared keys (⌘Z kept in, Esc leaves a field then closes, ⌘Enter is Done) in every editor', async () => {
  TD.app.newDoc(); TD.app.setMode('diagram');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const press = (target, key, mod = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: mod, metaKey: mod, bubbles: true, cancelable: true }));
  const shown = () => [...document.querySelectorAll('[id$="Modal"]')].find((m) => !m.hidden && m.querySelector('.cz-box'));
  let leaked = 0;
  const spy = () => leaked++;
  document.addEventListener('keydown', spy);
  try {
    let n = 0;
    for (const [type, d] of TD.blocks.entries()) {
      // (a Table opens the Table view, not an editor window)
      if (!d.editor || type === 'table' || (d.editor.available && !d.editor.available())) continue;
      const open = async () => { const done = []; T.ok(TD.blocks.open(T.make(type), (op) => done.push(op)), type + ' opens'); await frame(); return done; };
      let done = await open();
      const root = shown();
      T.ok(root, type + ': its editor is showing');
      if (!root) continue;
      n++;
      leaked = 0;
      press(root.querySelector('.cz-stage') || root, 'z', true);
      T.eq(leaked, 0, type + ': ⌘Z stays in the editor');
      const code = root.querySelector('.cz-code textarea');
      if (code) {
        code.focus(); press(code, 'Escape');
        T.ok(!root.hidden && document.activeElement !== code, type + ': Esc in a field leaves the field, the editor stays');
      }
      press(document.body, 'Escape'); await frame();
      T.ok(root.hidden && !document.querySelector('.td-dialog'), type + ': Esc closes the unchanged editor');
      done = await open();
      press(document.body, 'Enter', true); await frame();
      T.ok(root.hidden, type + ': ⌘Enter is Done');
    }
    T.ok(n >= 17, 'every block editor was checked: ' + n);
  } finally {
    document.removeEventListener('keydown', spy);
    document.querySelector('.td-dialog [data-r="0"]')?.click();
    for (const m of document.querySelectorAll('[id$="Modal"]')) if (!m.hidden && m.querySelector('.cz-box')) press(document.body, 'Escape');
  }
});
