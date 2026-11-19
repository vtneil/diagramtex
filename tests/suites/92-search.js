// The "/" search: groups while browsing, ranked results while searching, the arrow keys, Enter runs, Esc closes.
const searchKey = (k, target) => (target || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

T.test('search: "/" opens it; it finds, picks with the arrows, runs with Enter and closes with Esc', async () => {
  const inp = () => document.querySelector('#cmdkIn'), rows = () => [...document.querySelectorAll('#cmdk .cmdk-row')];
  const type = (v) => { inp().value = v; inp().dispatchEvent(new Event('input', { bubbles: true })); };
  const was = TD.state.tool;
  try {
    document.body.focus();
    searchKey('/');
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
    searchKey('/');
    T.eq(inp().value, '', 'it opens empty');
    searchKey('Escape', inp());
    await new Promise((r) => setTimeout(r, 160));
    T.ok(!TD.palette.isOpen, 'Esc closes it');
  } finally {
    TD.palette.close();
    if (TD.app.cmd.setTool) TD.app.cmd.setTool(was);
  }
});
