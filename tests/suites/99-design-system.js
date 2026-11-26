// The design-system pass (the Linear-style review): a submenu's safe area, Increase Contrast in dark, undo in place of
// a question for what can be undone, and the palettes' and panels' shared left edges.
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const ptr = (type, el, x, y, related) => el.dispatchEvent(new PointerEvent(type, { bubbles: type === 'pointermove', clientX: x, clientY: y, relatedTarget: related || null }));

T.test('menus: heading for an open submenu across the next row keeps it open; leaving that path closes it', async () => {
  TD.app.newDoc('Menu aim', null, null, null, null, 'board');
  const s = T.make('rect'); TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render();
  const el = document.querySelector(`[data-id="${s.id}"]`), r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await tick(250); // the menu has popped in (a submenu is placed inside its scaling box until then)
  try {
    const menu = document.querySelector('#ctxMenu');
    const copy = menu.querySelector('[data-act="img:copy-png"]').closest('.has-sub'), save = menu.querySelector('[data-act="img:save-png"]').closest('.has-sub');
    const [a, b] = copy.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING ? [copy, save] : [save, copy];
    const ra = a.getBoundingClientRect();
    ptr('pointerenter', a, ra.left + 20, ra.top + ra.height / 2);
    T.ok(a.classList.contains('open'), 'entering a row opens its submenu');
    const sub = a.querySelector(':scope > .sub').getBoundingClientRect();
    const right = sub.left >= ra.right - 1, x = right ? ra.right - 12 : ra.left + 12, y = ra.bottom, edge = right ? sub.left : sub.right;
    ptr('pointerleave', a, x, y, b); // out through the bottom edge, onto the next row
    T.ok(a.classList.contains('open') && menu.classList.contains('aiming'), 'leaving towards the submenu keeps it open');
    ptr('pointerenter', b, x, y + 2);
    T.ok(!b.classList.contains('open'), 'the row crossed on the way opens nothing');
    ptr('pointermove', document, (x + edge) / 2, y + 2);
    T.ok(a.classList.contains('open'), 'still on the way: still open');
    ptr('pointermove', document, right ? x - 40 : x + 40, y + 30);
    T.ok(!a.classList.contains('open') && !menu.classList.contains('aiming'), 'off the way: it closes');
    ptr('pointerenter', a, ra.left + 20, ra.top + ra.height / 2);
    ptr('pointerleave', a, x, y, b);
    await tick(380);
    T.ok(!a.classList.contains('open') && !menu.classList.contains('aiming'), 'resting on the way (300ms): it closes too');
    ptr('pointerenter', a, ra.left + 20, ra.top + ra.height / 2);
    a.querySelector(':scope > .sub .ctx-item').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    ptr('pointerleave', a, x, y, b);
    T.ok(!a.classList.contains('open') && !menu.classList.contains('aiming'), 'leaving from inside the submenu: it closes at once');
  } finally { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
});

T.test('tokens: Increase Contrast strengthens secondary text in the dark appearance and on its page too', () => {
  const found = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const m of rules) {
      if (!(m instanceof CSSMediaRule) || !/prefers-contrast:\s*more/.test(m.media.mediaText)) continue;
      for (const r of m.cssRules) if (r.style?.getPropertyValue('--pencil').trim() === 'var(--graphite)') found.add(r.selectorText.replace(/"/g, ''));
    }
  }
  T.ok(found.has(':root'), 'light');
  T.ok(found.has(':root[data-theme=dark]'), 'dark: the dark --pencil is more specific than :root, so it needs its own');
  T.ok(found.has('[data-theme=dark] .doc-page'), 'the typeset page in dark');
});

T.test('undo over confirm: deleting a page with objects on it asks nothing, says how to undo, and undo brings it back', async () => {
  const confirm = TD.confirm; let asked = 0;
  TD.confirm = async () => { asked++; return true; };
  try {
    TD.app.newDoc('Pages', null, null, null, null, 'page');
    TD.app.cmd.addPage();
    T.eq(TD.state.doc.sheet.pages, 2, 'two pages');
    const s = T.make('rect', { x: 3, y: 3 }) /* cm: well inside page 1 */; TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit();
    TD.state.sel = new Set(); TD.app.render(); TD.app.renderProps(); await frames();
    const del = document.querySelector('#props [data-pg="del"][data-k="0"]');
    T.ok(del, 'the first page has a delete button');
    del.click(); await tick(20);
    T.eq(asked, 0, 'no question first');
    T.eq(TD.state.doc.sheet.pages, 1, 'the page is gone');
    T.ok(!TD.state.doc.shapes.some((q) => q.id === s.id), 'with its object');
    T.ok(/brings it back/.test(document.querySelector('#hint').textContent), 'the hint says how to undo');
    TD.app.cmd.undo();
    T.eq(TD.state.doc.sheet.pages, 2, 'undo: the page is back');
    T.ok(TD.state.doc.shapes.some((q) => q.id === s.id), 'and its object');
  } finally { TD.confirm = confirm; }
});

T.test('alignment: a block editor palette\'s search field lines up with its tiles; the file list\'s title with its icons', async () => {
  TD.czEditor.open({ items: [], raw: '' }, () => {});
  await frames(); await tick(100);
  try {
    const m = document.querySelector('#czModal');
    const field = m.querySelector('.cz-search .search-field, .cz-search input').getBoundingClientRect();
    const tile = m.querySelector('.cz-list .cz-part, .cz-list .qe-item').getBoundingClientRect();
    T.ok(Math.abs(field.left - tile.left) < 0.5, `search ${field.left} vs tiles ${tile.left}`);
    T.ok(Math.abs(field.right - tile.right) < 0.5 || tile.right < field.right, 'and stays inside the list\'s edges');
  } finally { document.querySelector('#czModal [data-cz="done"]')?.click(); await tick(300); }
  const title = document.querySelector('#filesTitle'), icon = document.querySelector('#docList .list-row svg');
  if (title && icon && title.getClientRects().length) T.ok(Math.abs(title.getBoundingClientRect().left - icon.getBoundingClientRect().left) < 0.5, 'file list title over its icons');
});
