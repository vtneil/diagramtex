// A Classic document's blocks come from untrusted files and share links: their settings go into the page's markup
// (the live view and the exported web page) only as the values the app itself writes.
const BAD = '"><img src=x onerror="window.__pwnDoc=1"><div class="';
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

T.test('security: a text block\'s align and size and a table\'s borders put no markup in the document view or its HTML export', async () => {
  const text = JSON.stringify({ app: 'diagramtex', version: 3, kind: 'classic', name: 'Hostile blocks', blocks: [
    { type: 'text', text: 'hi', align: BAD, size: BAD },
    { type: 'text', text: 'centred', align: 'center' },
    { type: 'table', rows: [['a', 'b']], borders: BAD, colAlign: BAD },
    { type: 'table', rows: [['c', 'd']], borders: 'header' },
    { type: 'diagram', shapes: [] }] });
  const p = TD.app.parseProject(text, 'x');
  const id = TD.app.newDoc(p.name, null, null, p.blocks, p.page, p.kind);
  try {
    TD.app.setMode('document');
    await frames();
    const page = document.querySelector('#docview .doc-page');
    T.ok(page, 'the document view is drawn');
    T.eq(page.querySelectorAll('img').length, 0, 'no element made from a setting');
    T.ok(!page.innerHTML.includes('__pwnDoc'), 'the payload is not in the page');
    const bodies = [...page.querySelectorAll('.blk-text .blk-body')];
    T.eq(bodies[0].style.textAlign, 'justify', 'an unknown alignment is drawn as the default');
    T.eq(bodies[1].style.textAlign, 'center', 'a known one is kept');
    const tables = [...page.querySelectorAll('table.dtab')];
    T.ok(tables[0].classList.contains('b-all') && tables[1].classList.contains('b-header'), tables.map((t) => t.className).join(' | '));
    const html = await TD.docToHtml();
    T.ok(!html.includes('__pwnDoc') && !/<img\b/.test(html), 'the exported page has no payload either');
    const tex = TD.docToLatex(TD.state.doc);
    T.ok(!tex.includes('__pwnDoc'), 'nor the LaTeX');
    T.ok(!window.__pwnDoc, 'nothing ran');
  } finally { TD.app.cmd.docAction('del', id); }
});

T.test('components: the context menu\'s Make Component makes a component of the selection', () => {
  TD.app.newDoc('Make component', null, null, null, null, 'board');
  const a = T.make('rect', { set: { x: 0, y: 0, w: 40, h: 20 } }), b = T.make('rect', { set: { x: 60, y: 0, w: 40, h: 20 } });
  TD.state.doc.shapes.push(a, b); TD.state.sel = new Set([a.id, b.id]);
  TD.app.cmd.ctxAct('comp:make');
  const s = TD.state.doc.shapes;
  T.eq(s.length, 1, 'the two shapes became one');
  T.eq(s[0].type, 'comp'); T.eq(s[0].def.length, 2, 'holding both');
  TD.app.cmd.docAction('del', TD.state.docId);
});
