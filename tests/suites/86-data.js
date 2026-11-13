// Documents from outside, and the open file's storage, must not lose or corrupt work.
// the app's file storage: IndexedDB through TD.docStore when open, else localStorage (both hold JSON text)
const inDb = k => TD.docStore.active && TD.docStore.owns(k);
const get = k => { const t = inDb(k) ? TD.docStore.get(k) : localStorage.getItem(k); return t ? JSON.parse(t) : null; };
const put = (k, v) => inDb(k) ? TD.docStore.set(k, JSON.stringify(v)) : localStorage.setItem(k, JSON.stringify(v));
const dataRect = (id, x) => ({ id, type: 'rect', x, y: 0, w: 20, h: 20, stroke: '#000000', width: 1 });
T.test('data: repeated shape ids get new ones, so undo restores the right shape', () => {
  TD.app.newDoc('dup', [dataRect('aaa', 0), dataRect('aaa', 50), dataRect('bbb', 100)], null, null);
  const ids = TD.state.doc.shapes.map(s => s.id);
  T.eq(new Set(ids).size, 3, 'ids are unique'); T.eq(ids[0], 'aaa'); T.eq(ids[2], 'bbb');
  TD.app.begin(); TD.state.doc.shapes.splice(1, 1); TD.app.commit();
  TD.app.cmd.undo();
  T.eq(TD.state.doc.shapes.map(s => s.x).join(','), '0,50,100');
});
T.test('data: a shape that cannot be drawn is left out instead of breaking the file', () => {
  TD.app.newDoc('bad', [dataRect('ok', 0), { id: 'p', type: 'poly' }], null, null);
  T.eq(TD.state.doc.shapes.map(s => s.id).join(','), 'ok');
  T.ok(document.querySelectorAll('#docList li').length > 0, 'the file list still renders');
});
T.test('data: a project file with a wrong page or a null block is handled', () => {
  const p = TD.app.parseProject(JSON.stringify({ blocks: [{ type: 'diagram', shapes: [] }], page: 'abc', name: 5 }), 'fallback');
  T.eq(p.page, undefined); T.eq(p.name, 'fallback');
  let err = null;
  try { TD.app.parseProject(JSON.stringify({ blocks: [null] })); } catch (e) { err = e.message; }
  T.eq(err, 'not a DiagramTeX file');
  err = null;
  try { TD.app.parseProject(JSON.stringify({ blocks: [{ type: 'diagram', shapes: [{ type: 'constructor' }] }] })); } catch (e) { err = e.message; }
  T.eq(err, 'not a DiagramTeX file', 'an inherited name is not a shape type');
});
T.test('data: saving an unchanged file does not overwrite what another tab stored', () => {
  const id = TD.app.newDoc('two tabs', [dataRect('r1', 0)], null, null);
  TD.app.saveNow();
  const key = 'diagramtex.doc.' + id, other = get(key);
  other.blocks[0].shapes.push(dataRect('fromB', 40));
  put(key, other); // what another tab wrote
  TD.app.saveNow(); // this tab, unchanged, saves on hide
  T.eq(get(key).blocks[0].shapes.map(s => s.id).join(','), 'r1,fromB');
});
T.test('data: a file deleted in another tab is not put back in the list by a save here', () => {
  const id = TD.app.newDoc('binned elsewhere', [dataRect('r1', 0)], null, null);
  TD.app.saveNow();
  const entry = get('diagramtex.index').find(x => x.id === id);
  put('diagramtex.index', get('diagramtex.index').filter(x => x.id !== id));
  put('diagramtex.bin', [...(get('diagramtex.bin') || []), { id, name: entry.name, kind: 'classic', deleted: Date.now() }]);
  TD.app.begin(); TD.state.doc.shapes[0].x = 30; TD.app.commit(); TD.app.saveNow();
  T.ok(!get('diagramtex.index').some(x => x.id === id), 'stays in the bin');
  T.eq(get('diagramtex.doc.' + id).blocks[0].shapes[0].x, 30, 'its data is kept current');
  put('diagramtex.bin', (get('diagramtex.bin') || []).filter(x => x.id !== id));
});
