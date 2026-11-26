// The ⌘K search: groups while browsing, ranked results while searching, the arrow keys, Enter runs, Esc closes.
const searchKey = (k, target, mods = {}) => (target || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
const cmdK = (target) => searchKey('k', target, { ctrlKey: true });

T.test('search: Ctrl+K opens it; it finds, picks with the arrows, runs with Enter and closes with Esc', async () => {
  const inp = () => document.querySelector('#cmdkIn'), rows = () => [...document.querySelectorAll('#cmdk .cmdk-row')];
  const type = (v) => { inp().value = v; inp().dispatchEvent(new Event('input', { bubbles: true })); };
  const was = TD.state.tool;
  try {
    document.body.focus();
    cmdK();
    T.ok(TD.palette.isOpen && document.activeElement === inp(), 'open, the field focused');
    T.ok(document.querySelectorAll('#cmdk .cmdk-sec').length >= 3, 'browsing: a heading over each group');
    type('rect');
    T.ok(/Rectangle/.test(rows()[0].textContent), 'searching: the best match first');
    T.ok(!document.querySelector('#cmdk .cmdk-sec') && rows()[0].querySelector('.cmdk-grp'), 'each result says its group instead');
    T.eq(document.querySelector('#cmdk .cmdk-row.on').dataset.i, '0');
    searchKey('ArrowDown', inp());
    T.eq(document.querySelector('#cmdk .cmdk-row.on').dataset.i, '1', '↓ moves the choice');
    T.eq(inp().getAttribute('aria-activedescendant'), 'cmdk-1', 'and tells assistive technology');
    searchKey('ArrowUp', inp());
    type('zzzqqq');
    T.ok(/zzzqqq/.test(document.querySelector('#cmdk .empty-state').textContent), 'nothing found says so');
    type('rect');
    searchKey('Enter', inp());
    await new Promise((r) => setTimeout(r, 160)); // it fades out
    T.ok(!TD.palette.isOpen, 'Enter closes it');
    T.eq(TD.state.tool, 'rect', 'and runs the choice');
    cmdK();
    T.eq(inp().value, '', 'it opens empty');
    searchKey('Escape', inp());
    await new Promise((r) => setTimeout(r, 160));
    T.ok(!TD.palette.isOpen, 'Esc closes it');
  } finally {
    TD.palette.close();
    if (TD.app.cmd.setTool) TD.app.cmd.setTool(was);
  }
});

T.test('search: no two results read the same (the TikZ ellipse and the library oval, the arrows and hatches by their side)', async () => {
  const inp = () => document.querySelector('#cmdkIn'), rows = () => [...document.querySelectorAll('#cmdk .cmdk-row')];
  try {
    document.body.focus();
    cmdK();
    for (const q of ['ellipse', 'oval', 'arrow', 'hatch', ...'abcdefghijklmnopqrstuvwxyz']) {
      inp().value = q; inp().dispatchEvent(new Event('input', { bubbles: true }));
      // the app's own entries; the user's files may share a name (earlier suites leave several called "x")
      const text = rows().filter((r) => r.querySelector('.cmdk-grp')?.textContent.trim() !== 'Files').map((r) => r.textContent.replace(/\s+/g, ' ').trim());
      T.eq(text.length, new Set(text).size, `"${q}": ${text.join(' | ')}`);
    }
  } finally { searchKey('Escape', inp()); }
});

T.test('search: Ctrl+K opens it from a text field and closes it again; "/" is only a character now', async () => {
  const field = document.createElement('input');
  document.body.append(field);
  try {
    await new Promise((r) => setTimeout(r, 200)); // the last test's search has faded out
    document.body.focus();
    searchKey('/');
    T.ok(!TD.palette.isOpen, '"/" opens nothing');
    field.focus();
    T.ok(!cmdK(field), 'Ctrl+K in a text field is taken (the browser\'s own is stopped)');
    T.ok(TD.palette.isOpen, 'and opens the search');
    cmdK(document.querySelector('#cmdkIn'));
    await new Promise((r) => setTimeout(r, 160));
    T.ok(!TD.palette.isOpen, 'pressed again, it closes');
    searchKey('k', document, { ctrlKey: true, altKey: true });
    T.ok(!TD.palette.isOpen, 'Ctrl+Alt+K stays Make Component');
  } finally { TD.palette.close(); field.remove(); }
});
