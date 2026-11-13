// Deleting a file is undone with Ctrl+Z, and autosave keeps recovery copies of a file's earlier states.
{
  const inDb = k => TD.docStore.active && TD.docStore.owns(k);
  const get = k => { const t = inDb(k) ? TD.docStore.get(k) : localStorage.getItem(k); return t ? JSON.parse(t) : null; };
  const put = (k, v) => inDb(k) ? TD.docStore.set(k, JSON.stringify(v)) : localStorage.setItem(k, JSON.stringify(v));
  const rect = (id, x) => ({ id, type: 'rect', x, y: 0, w: 20, h: 20, stroke: '#000000', width: 1 });
  const C = TD.app.cmd, ids = () => get('diagramtex.index').map(x => x.id), inBin = id => (get('diagramtex.bin') || []).some(x => x.id === id);
  const edit = (x) => { TD.app.begin(); TD.state.doc.shapes[0].x = x; TD.app.commit(); TD.app.saveNow(); };
  const cleanup = (...list) => {
    put('diagramtex.index', get('diagramtex.index').filter(x => !list.includes(x.id)));
    put('diagramtex.bin', (get('diagramtex.bin') || []).filter(x => !list.includes(x.id)));
    for (const id of list) { TD.docStore.del?.('diagramtex.doc.' + id); TD.app.recovery.forget(id); }
  };

  T.test('recovery: undo brings a deleted file back to its place and reopens it; redo deletes it again', () => {
    const a = TD.app.newDoc('undo A', [rect('a', 0)], null, null), b = TD.app.newDoc('undo B', [rect('b', 0)], null, null);
    TD.app.newDoc('undo C', [rect('c', 0)], null, null);
    C.openDoc(b);
    const at = ids().indexOf(b);
    TD.app.resetHistory();
    C.docAction('del', b);
    T.ok(inBin(b) && !ids().includes(b), 'moved to the bin');
    T.ok(TD.state.docId !== b, 'another file opened');
    T.ok(C.canUndo(), 'undo is offered');
    C.undo();
    T.eq(TD.state.docId, b, 'the deleted file is open again');
    T.eq(ids().indexOf(b), at, 'at its old place in the list');
    T.ok(!inBin(b), 'out of the bin');
    T.ok(C.canRedo(), 'redo is offered');
    C.redo();
    T.ok(inBin(b) && !ids().includes(b), 'redo deletes it again');
    C.undo();
    T.eq(TD.state.docId, b);
    // a file deleted while another is open: undo does not switch files
    C.openDoc(a); TD.app.resetHistory();
    const c = ids().find(id => get('diagramtex.doc.' + id)?.name === 'undo C');
    C.docAction('del', c);
    T.eq(TD.state.docId, a, 'still on the open file');
    C.undo();
    T.eq(TD.state.docId, a, 'undo does not switch files'); T.ok(ids().includes(c));
    cleanup(a, b, c);
  });
  T.test("recovery: the file's own edits are undone before the delete", () => {
    const a = TD.app.newDoc('order A', [rect('a', 0)], null, null), b = TD.app.newDoc('order B', [rect('b', 0)], null, null);
    TD.app.resetHistory();
    C.docAction('del', b);
    const other = TD.state.docId;
    T.ok(other !== b);
    edit(77);
    C.undo();
    T.eq(TD.state.docId, other); T.ok(!ids().includes(b), 'the edit is undone first');
    C.undo();
    T.eq(TD.state.docId, b, 'then the delete');
    cleanup(a, b);
  });
  T.test('recovery: a file restored from the bin dialog is no longer an undo step', () => {
    const a = TD.app.newDoc('stale A', [rect('a', 0)], null, null), b = TD.app.newDoc('stale B', [rect('b', 0)], null, null);
    TD.app.resetHistory();
    C.docAction('del', b);
    put('diagramtex.bin', (get('diagramtex.bin') || []).filter(x => x.id !== b)); // erased for good elsewhere
    T.ok(!C.canUndo(), `nothing to undo (${TD.state.undo.length} steps)`);
    cleanup(a, b);
  });
  T.test('recovery: copies are taken once a period, newest first, and only the newest are kept', () => {
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 1, keep: 5 }));
    const id = TD.app.newDoc('copies', [rect('r', 0)], null, null), R = TD.app.recovery;
    TD.app.saveNow();
    edit(10);
    T.eq(R.list(id).length, 1, 'the first change keeps the state before it');
    T.eq(R.list(id)[0].doc.blocks[0].shapes[0].x, 0);
    edit(20);
    T.eq(R.list(id).length, 1, 'not again within the period');
    // the period passes
    const age = () => { const l = R.list(id); l[0].taken -= 61e3; put('diagramtex.rec.' + id, l); R.stale(id); };
    for (let i = 0; i < 7; i++) { age(); edit(30 + i); }
    const l = R.list(id);
    T.eq(l.length, 5, 'only the newest five');
    T.eq(l[0].doc.blocks[0].shapes[0].x, 35, 'newest first');
    T.ok(!('view' in l[0].doc), 'without the view');
    // restore puts the copy in place; the state before is a copy itself
    TD.app.restoreRecovery(id, l[2]);
    T.eq(TD.state.docId, id); T.eq(TD.state.doc.shapes[0].x, 33);
    T.eq(R.list(id)[0].doc.blocks[0].shapes[0].x, 36, 'the replaced state is kept');
    T.eq(TD.state.doc.name, 'copies', 'the name stays');
    // open as a new file
    TD.app.openRecoveryCopy(id, R.list(id)[0]);
    T.ok(TD.state.docId !== id); T.eq(TD.state.doc.shapes[0].x, 36); T.ok(TD.state.doc.name.startsWith('copies ('));
    const copyId = TD.state.docId;
    // off: no more copies
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 0, keep: 5 }));
    C.openDoc(id); const n = R.list(id).length; age(); edit(99);
    T.eq(R.list(id).length, n, 'none while turned off');
    localStorage.removeItem('diagramtex.recovery');
    cleanup(id, copyId);
    T.eq(R.list(id).length, 0, 'deleting for good removes the copies');
  });
  T.test('recovery: defaults every 10 minutes, the newest 3, and one more every 5 minutes in between (4 at most)', () => {
    localStorage.removeItem('diagramtex.recovery');
    const id = TD.app.newDoc('quick', [rect('r', 0)], null, null), R = TD.app.recovery;
    TD.app.saveNow();
    // move every copy back in time by `min` minutes, as if that much time had passed
    const pass = (min) => { put('diagramtex.rec.' + id, R.list(id).map((c) => ({ ...c, taken: c.taken - min * 6e4 }))); R.stale(id); };
    const xs = () => R.list(id).map((c) => c.doc.blocks[0].shapes[0].x + (c.recent ? 'r' : ''));
    edit(1);
    T.eq(xs(), ['0'], 'the first change keeps a period copy');
    pass(3); edit(2);
    T.eq(xs(), ['0'], 'nothing within 5 minutes');
    pass(3); edit(3);
    T.eq(xs(), ['2r', '0'], 'after 5 minutes, a copy in between');
    pass(5); edit(4);
    T.eq(xs(), ['3', '2r', '0'], 'after 10 minutes, a period copy; the one in between stays');
    pass(5); edit(5);
    T.eq(xs(), ['4r', '3', '0'], 'the next copy in between replaces the last one');
    for (let i = 0; i < 4; i++) { pass(5); edit(6 + 2 * i); pass(5); edit(7 + 2 * i); }
    const l = xs();
    T.eq(l.length, 4, 'the newest 3 period copies and one in between: ' + l.join(' '));
    T.eq(l.filter((x) => x.endsWith('r')).length, 1, 'one copy in between');
    // lowering the number kept keeps the copy in between
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 10, keep: 3 }));
    R.trim([id]); T.eq(xs().length, 4);
    // with a period of 5 minutes or less there is nothing in between
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 5, keep: 3 }));
    pass(5); edit(50);
    T.ok(!R.list(id)[0].recent, 'a period copy');
    cleanup(id);
    localStorage.removeItem('diagramtex.recovery');
  });
}

// ---- Undo history per file, and its order with deletes ----
{
  const inDb = k => TD.docStore.active && TD.docStore.owns(k);
  const get = k => { const t = inDb(k) ? TD.docStore.get(k) : localStorage.getItem(k); return t ? JSON.parse(t) : null; };
  const put = (k, v) => inDb(k) ? TD.docStore.set(k, JSON.stringify(v)) : localStorage.setItem(k, JSON.stringify(v));
  const rect = (id, x) => ({ id, type: 'rect', x, y: 0, w: 20, h: 20, stroke: '#000000', width: 1 });
  const C = TD.app.cmd, listed = id => get('diagramtex.index').some(x => x.id === id), inBin = id => (get('diagramtex.bin') || []).some(x => x.id === id);
  const x = () => TD.state.doc.shapes[0]?.x;
  const edit = v => { TD.app.begin(); TD.state.doc.shapes[0].x = v; TD.app.commit(); TD.app.saveNow(); };
  const fresh = (name, v = 0) => TD.app.newDoc(name, [rect('s', v)], null, null);
  const start = () => { TD.app.clearAllHistory(); };
  const cleanup = (...list) => {
    put('diagramtex.index', get('diagramtex.index').filter(e => !list.includes(e.id)));
    put('diagramtex.bin', (get('diagramtex.bin') || []).filter(e => !list.includes(e.id)));
    for (const id of list) { TD.docStore.del('diagramtex.doc.' + id); TD.app.recovery.forget(id); }
    TD.app.clearAllHistory();
  };

  T.test('history: each file keeps its own undo and redo across switching', () => {
    start();
    const a = fresh('hist A'); edit(1); edit(2);
    const b = fresh('hist B'); edit(10);
    C.openDoc(a);
    T.eq(x(), 2); T.ok(C.canUndo(), 'A has its steps back');
    C.undo(); T.eq(x(), 1);
    C.openDoc(b); T.eq(x(), 10);
    C.undo(); T.eq(x(), 0, "B's own step"); T.ok(!C.canUndo(), 'B has no more');
    C.openDoc(a); C.redo(); T.eq(x(), 2, "A's redo survives a switch");
    C.undo(); C.undo(); T.eq(x(), 0); T.ok(!C.canUndo());
    C.openDoc(b); C.redo(); T.eq(x(), 10, "B's redo too");
    cleanup(a, b);
  });
  T.test('history: switch, delete and go back: undo brings the deleted file back with its own steps, then stops', () => {
    start();
    const a = fresh('sdg A'); edit(1); edit(2);
    const b = fresh('sdg B'); edit(10); edit(11);
    C.docAction('del', b);
    C.openDoc(a);
    T.eq(x(), 2);
    C.undo(); // the delete is later than A's edits
    T.eq(TD.state.docId, b, 'B is back and open'); T.ok(listed(b) && !inBin(b));
    T.eq(x(), 11);
    C.undo(); T.eq(x(), 10, "B's steps came back with it");
    C.undo(); T.eq(x(), 0);
    T.ok(!C.canUndo(), "undo does not reach into A's steps from B");
    C.openDoc(a); T.eq(x(), 2); C.undo(); T.eq(x(), 1, "A's steps are still there");
    cleanup(a, b);
  });
  T.test('history: an edit after a delete is undone first, then the delete', () => {
    start();
    const a = fresh('ead A'), b = fresh('ead B');
    C.openDoc(a);
    C.docAction('del', b); // deleted from the list while A is open
    T.eq(TD.state.docId, a);
    edit(5);
    C.undo(); T.eq(x(), 0, 'the edit first'); T.ok(inBin(b));
    C.undo(); T.ok(listed(b), 'then the delete'); T.eq(TD.state.docId, a, 'B was not open: A stays open');
    T.ok(!C.canUndo());
    // redo in the order undone: the delete again, then the edit
    C.redo(); T.ok(inBin(b)); T.eq(x(), 0);
    C.redo(); T.eq(x(), 5);
    T.ok(!C.canRedo());
    cleanup(a, b);
  });
  T.test('history: a delete whose file is gone for good is skipped, and undo goes on to the step before it', () => {
    start();
    const a = fresh('gone A'); edit(3);
    const b = fresh('gone B');
    C.openDoc(a);
    C.docAction('del', b);
    put('diagramtex.bin', (get('diagramtex.bin') || []).filter(e => e.id !== b)); // emptied from the bin
    C.undo();
    T.eq(x(), 0, "A's edit is undone instead"); T.ok(!listed(b));
    // and one restored from the bin dialog is skipped too
    const c = fresh('gone C'); C.openDoc(a); C.redo(); T.eq(x(), 3);
    C.docAction('del', c);
    const entry = (get('diagramtex.bin') || []).find(e => e.id === c);
    put('diagramtex.bin', get('diagramtex.bin').filter(e => e.id !== c)); put('diagramtex.index', [...get('diagramtex.index'), { id: c, name: entry.name, kind: 'classic', updated: Date.now() }]);
    C.undo(); T.eq(x(), 0, 'skipped to A again'); T.eq(TD.state.docId, a);
    cleanup(a, b, c);
  });
  T.test('history: redo after undoing a delete of the open file goes back to the file undo came from', () => {
    start();
    const a = fresh('back A'), b = fresh('back B'); fresh('back Z'); // Z is last: a delete would open it
    const z = TD.state.docId;
    C.openDoc(b); C.docAction('del', b);
    C.openDoc(a);
    C.undo(); T.eq(TD.state.docId, b);
    C.redo(); T.ok(inBin(b)); T.eq(TD.state.docId, a, 'back on A, not on the last file');
    C.undo(); T.eq(TD.state.docId, b, 'and undo again');
    cleanup(a, b, z);
  });
  T.test('history: two deletes come back in reverse order, and redo deletes them in order', () => {
    start();
    const a = fresh('two A'), b = fresh('two B'), c = fresh('two C');
    C.openDoc(a);
    C.docAction('del', b); C.docAction('del', c);
    C.undo(); T.ok(listed(c) && inBin(b), 'C first');
    C.undo(); T.ok(listed(b), 'then B');
    C.redo(); T.ok(inBin(b) && listed(c));
    C.redo(); T.ok(inBin(c));
    T.ok(!C.canRedo());
    // a new delete ends the redo
    C.undo(); T.ok(listed(c)); C.docAction('del', a); T.ok(!C.canRedo(), 'a new action clears redo');
    cleanup(a, b, c);
  });
  T.test("history: a file changed elsewhere while away loses its steps instead of misapplying them", () => {
    start();
    const a = fresh('else A'); edit(1); edit(2);
    const b = fresh('else B');
    const d = get('diagramtex.doc.' + a); d.blocks[0].shapes[0].x = 99; put('diagramtex.doc.' + a, d); // another tab
    C.openDoc(a);
    T.eq(x(), 99); T.ok(!C.canUndo(), 'no steps for the changed file');
    cleanup(a, b);
  });
  T.test('history: each diagram of a classic file keeps its steps', () => {
    start();
    const a = TD.app.newDoc('blocks', null, null, [{ type: 'diagram', shapes: [rect('p', 0)] }, { type: 'diagram', shapes: [rect('q', 50)] }]);
    edit(1);
    TD.app.setActiveBlock(1); T.ok(!C.canUndo()); edit(51);
    TD.app.setActiveBlock(0); T.eq(x(), 1); C.undo(); T.eq(x(), 0);
    TD.app.setActiveBlock(1); C.undo(); T.eq(x(), 50);
    cleanup(a);
  });
  T.test('history: a deleted folder comes back with the steps of its open file', async () => {
    start();
    const a = fresh('Fold/one'); edit(7);
    const b = fresh('Fold/two'); edit(8);
    const keep = fresh('outside');
    C.openDoc(b);
    const confirm = TD.confirm; TD.confirm = async () => true;
    try {
      // the folder menu passes its path the way the sidebar does
      const row = document.querySelector('#docList [data-folder="Fold"]');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
      document.querySelector('[data-ctx="doc:delfolder"]').click();
      await new Promise(r => setTimeout(r, 20));
    } finally { TD.confirm = confirm; }
    T.ok(inBin(a) && inBin(b), 'both in the bin'); T.ok(TD.state.docId !== b);
    C.undo();
    T.ok(listed(a) && listed(b), 'both back'); T.eq(TD.state.docId, b, 'the open one reopens'); T.eq(x(), 8);
    C.undo(); T.eq(x(), 0, 'with its steps');
    C.openDoc(a); T.eq(x(), 7); C.undo(); T.eq(x(), 0, 'the other keeps its steps too');
    cleanup(a, b, keep);
  });
  T.test('history: deleting the only file of a kind and undoing drops the blank stand-in', () => {
    start();
    const before = get('diagramtex.index').filter(e => e.kind === 'board').map(e => e.id);
    put('diagramtex.index', get('diagramtex.index').filter(e => e.kind !== 'board'));
    const w = TD.app.newDoc('only board', [rect('w', 0)], null, null, null, 'board'); edit(4);
    C.docAction('del', w);
    const blank = TD.state.docId;
    T.ok(blank !== w && TD.state.doc.kind === 'board', 'a blank whiteboard stands in');
    C.undo();
    T.eq(TD.state.docId, w); T.eq(x(), 4); T.ok(!listed(blank) && !get('diagramtex.doc.' + blank), 'the blank is gone');
    C.undo(); T.eq(x(), 0, "the board's own step");
    C.redo(); C.redo(); T.ok(inBin(w), 'redo deletes it again');
    T.ok(TD.state.doc.kind === 'board');
    const blank2 = TD.state.docId;
    put('diagramtex.index', [...get('diagramtex.index'), ...before.map(id => ({ id, name: 'x', kind: 'board', updated: 1 }))].filter(e => e.id !== blank2));
    cleanup(w, blank2);
  });
  T.test('history: restoring a recovery copy drops the steps it would misapply', () => {
    start();
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 1, keep: 5 }));
    const a = fresh('rec hist'); edit(1); edit(2);
    const copy = TD.app.recovery.list(a)[0];
    TD.app.restoreRecovery(a, copy);
    T.eq(x(), 0); T.eq(TD.state.undo.length, 0, 'no stale steps'); T.eq(TD.state.redo.length, 0);
    localStorage.removeItem('diagramtex.recovery');
    cleanup(a);
  });
}
