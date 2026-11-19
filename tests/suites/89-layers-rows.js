// The Layers panel's rows are keyed: an edit updates only its own row and the others keep their elements, so an
// edit on a large drawing doesn't lay out every row again. Selection, order and groups still show.
T.test('layers: an edit replaces only its own row; selection, order and group names still show', async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = (i, extra = {}) => ({ ...TD.TYPES.rect.create({ x: 20 + i * 30, y: 20 }, {}), id: 'ly' + i, w: 20, h: 20, ...extra });
  TD.app.newDoc('Layers rows', [rect(0), rect(1), rect(2), rect(3, { g: 'lg', gname: 'Pair' }), rect(4, { g: 'lg' })], null, null, null, 'classic');
  TD.app.setMode('diagram');
  const win = document.querySelector('#layersWin'), wasCollapsed = win.classList.contains('collapsed');
  win.classList.remove('collapsed');
  try {
    TD.app.render(); await frame();
    const doc = TD.state.doc, all = () => doc.blocks.flatMap((b) => b.shapes || []), live = (id) => all().find((s) => s.id === id);
    const row = (id) => document.querySelector(`#layers .ly-row[data-id="${id}"]`);
    const keep = { a: row('ly0'), b: row('ly1'), g: document.querySelector('#layers .ly-row[data-g="lg"]') };
    T.ok(keep.a && keep.b && keep.g, 'rows for shapes and the group');
    T.eq(keep.g.querySelector('.nm').textContent, 'Pair', 'the group row shows its name');
    const before = row('ly2').querySelector('.ly-th').innerHTML;
    live('ly2').stroke = '#ff0000'; TD.app.render(); await frame();
    T.ok(row('ly2').querySelector('.ly-th').innerHTML !== before, 'the edited row shows the change');
    T.ok(row('ly0') === keep.a && row('ly1') === keep.b && document.querySelector('#layers .ly-row[data-g="lg"]') === keep.g, 'the other rows keep their elements');
    TD.state.sel = new Set(['ly1']); TD.app.render(); await frame();
    T.ok(row('ly1').classList.contains('on') && !row('ly0').classList.contains('on'), 'selection shows on its row');
    const b = doc.blocks.find((x) => (x.shapes || []).some((s) => s.id === 'ly0')), i = b.shapes.findIndex((s) => s.id === 'ly0');
    b.shapes.push(...b.shapes.splice(i, 1)); TD.app.render(); await frame();
    T.eq(document.querySelector('#layers .ly-row').dataset.id, 'ly0', 'a shape brought to the front is listed first');
  } finally { win.classList.toggle('collapsed', wasCollapsed); TD.state.sel = new Set(); }
});
