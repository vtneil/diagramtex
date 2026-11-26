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
    const age = () => { const l = R.list(id); l[0].taken -= 61e3; R.replace(id, l); R.stale(id); };
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
    const pass = (min) => { R.replace(id, R.list(id).map((c) => ({ ...c, taken: c.taken - min * 6e4 }))); R.stale(id); };
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
  T.test('versions: a saved version is named, kept beyond the newest copies, renamed, unnamed and deleted', async () => {
    localStorage.setItem('diagramtex.recovery', JSON.stringify({ every: 1, keep: 3 }));
    const id = TD.app.newDoc('versions', [rect('r', 0)], null, null), R = TD.app.recovery;
    TD.app.saveNow();
    const cur = () => get('diagramtex.doc.' + id), at = () => get('diagramtex.index').find((x) => x.id === id).updated;
    const v = R.save(id, cur(), at(), 'Before review');
    T.eq(R.list(id).length, 1); T.eq(R.list(id)[0].name, 'Before review'); T.ok(!('view' in R.list(id)[0].doc), 'without the view');
    // many automatic copies later, the version is still there
    const age = () => { R.replace(id, R.list(id).map((c) => ({ ...c, taken: c.taken - 61e3 }))); R.stale(id); };
    for (let i = 1; i <= 6; i++) { age(); edit(i); }
    const l = R.list(id);
    T.eq(l.filter((c) => !c.name).length, 3, 'the newest 3 automatic copies');
    T.ok(l.some((c) => c.name === 'Before review' && c.doc.blocks[0].shapes[0].x === 0), 'the version is kept');
    R.trim([id]); T.ok(R.list(id).some((c) => c.name), 'trimming keeps it too');
    // saving what the newest copy already holds names that copy instead of adding one
    TD.app.restoreRecovery(id, R.list(id).find((c) => !c.name));
    const n = R.list(id).length, same = R.list(id)[0];
    R.save(id, { ...same.doc, view: {} }, same.at, 'Same');
    T.eq(R.list(id).length, n, 'no new copy'); T.eq(R.list(id)[0].name, 'Same');
    // rename, then unname: it becomes an automatic copy again (moving copies back in time moved it too: find it by name)
    const vk = R.list(id).find((c) => c.name === v.name).taken;
    R.rename(id, vk, 'Submitted');
    T.eq(R.list(id).find((c) => c.taken === vk).name, 'Submitted');
    R.rename(id, vk, '  ');
    T.ok(!R.list(id).find((c) => c.taken === vk)?.name, 'unnamed');
    age(); edit(77); T.ok(!R.list(id).some((c) => c.taken === vk), 'the next copy pushes it out, being the oldest automatic one');
    // delete
    const k = R.list(id)[0].taken; R.remove(id, k);
    T.ok(!R.list(id).some((c) => c.taken === k), 'deleted');
    // restoring a version keeps the state before it
    const named = R.save(id, cur(), at(), 'Keep me');
    edit(42);
    TD.app.restoreRecovery(id, named);
    T.eq(TD.state.doc.shapes[0].x, named.doc.blocks[0].shapes[0].x);
    T.eq(R.list(id)[0].doc.blocks[0].shapes[0].x, 42, 'the state before the restore is kept');
    cleanup(id);
    localStorage.removeItem('diagramtex.recovery');
  });
  T.test('versions: copies are one record each in the database', async () => {
    if (!TD.docStore.active) return;
    const id = TD.app.newDoc('records', [rect('r', 0)], null, null), R = TD.app.recovery;
    TD.app.saveNow();
    R.save(id, get('diagramtex.doc.' + id), Date.now(), 'One');
    edit(5); R.save(id, get('diagramtex.doc.' + id), Date.now() + 1, 'Two');
    TD.docStore.flush();
    await new Promise((r) => setTimeout(r, 300));
    const db = await new Promise((res, rej) => { const r = indexedDB.open('diagramtex'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      T.eq(db.version, 2);
      const keys = await new Promise((res) => { const r = db.transaction('rec').objectStore('rec').getAllKeys(IDBKeyRange.bound([id, -Infinity], [id, Infinity])); r.onsuccess = () => res(r.result); });
      T.eq(keys.length, 2, 'two records'); T.ok(keys.every((k) => k[0] === id));
      const arr = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('diagramtex.rec.' + id); r.onsuccess = () => res(r.result); });
      T.eq(arr, undefined, 'no array in kv');
    } finally { db.close(); }
    cleanup(id);
  });

  // ---- The move from version 1 of the database (one array of copies per file in kv) ----
  const MIG = 'dtx-test-migration';
  const open = (version, upgrade) => new Promise((res, rej) => {
    const r = version ? indexedDB.open(MIG, version) : indexedDB.open(MIG);
    if (upgrade) r.onupgradeneeded = (e) => upgrade(r.result, r.transaction, e.oldVersion);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const dropMig = () => new Promise((res) => { const r = indexedDB.deleteDatabase(MIG); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  const all = (db, os) => new Promise((res) => { const tx = db.transaction(os), s = tx.objectStore(os), k = s.getAllKeys(), v = s.getAll(); tx.oncomplete = () => res(k.result.map((x, i) => [x, v.result[i]])); });
  const copy = (taken, x) => ({ taken, at: taken, doc: { kind: 'classic', name: 'm', blocks: [{ type: 'diagram', shapes: [rect('r', x)] }] } });
  async function seedV1() {
    await dropMig();
    const db = await open(1, (d) => d.createObjectStore('kv'));
    await new Promise((res) => {
      const tx = db.transaction('kv', 'readwrite'), s = tx.objectStore('kv');
      s.put(JSON.stringify([{ id: 'f1', name: 'one', updated: 1 }, { id: 'f2', name: 'two', updated: 2 }]), 'diagramtex.index');
      s.put(JSON.stringify({ kind: 'classic', name: 'one', blocks: [] }), 'diagramtex.doc.f1');
      s.put(JSON.stringify([copy(300, 3), copy(200, 2), copy(100, 1)]), 'diagramtex.rec.f1');
      s.put(JSON.stringify([copy(50, 9)]), 'diagramtex.rec.f2');
      s.put('not json', 'diagramtex.rec.f3');
      tx.oncomplete = res;
    });
    db.close();
  }
  T.test('migration: version 1 copies become one record each in version 2, files untouched', async () => {
    await seedV1();
    const db = await open(2, TD.docStore.upgradeSchema);
    try {
      T.eq(db.version, 2);
      const rec = await all(db, 'rec'), kv = await all(db, 'kv');
      T.eq(rec.map(([k]) => k.join('/')).sort(), ['f1/100', 'f1/200', 'f1/300', 'f2/50']);
      T.eq(JSON.parse(rec.find(([k]) => k[0] === 'f1' && k[1] === 300)[1]).doc.blocks[0].shapes[0].x, 3);
      T.eq(kv.map(([k]) => k).sort(), ['diagramtex.doc.f1', 'diagramtex.index'], 'the arrays are gone, the files stay (an unreadable array goes too)');
      T.eq(JSON.parse(kv.find(([k]) => k === 'diagramtex.index')[1]).length, 2);
    } finally { db.close(); await dropMig(); }
  });
  T.test('migration: an upgrade that fails part way leaves version 1 as it was', async () => {
    await seedV1();
    let failed = false;
    try { const db = await open(2, (d, tx, old) => { TD.docStore.upgradeSchema(d, tx, old); tx.objectStore('kv').openCursor().onsuccess = () => tx.abort(); }); db.close(); }
    catch (e) { failed = true; }
    T.ok(failed, 'the open fails');
    const db = await open(0);
    try {
      T.eq(db.version, 1, 'still version 1');
      T.ok(!db.objectStoreNames.contains('rec'), 'no rec store');
      const kv = await all(db, 'kv');
      T.eq(kv.length, 5, 'every key still there');
      T.eq(JSON.parse(kv.find(([k]) => k === 'diagramtex.rec.f1')[1]).length, 3, 'the copies still there');
    } finally { db.close(); }
    // the next start tries again, and it works
    const db2 = await open(2, TD.docStore.upgradeSchema);
    try { T.eq((await all(db2, 'rec')).length, 4); } finally { db2.close(); await dropMig(); }
  });
  T.test('migration: a tab of the older version is heard, and its changes are kept for it', async () => {
    if (!TD.docStore.active || typeof BroadcastChannel !== 'function') return;
    const id = 'oldtab' + Date.now().toString(36), key = 'diagramtex.doc.' + id;
    const old = new BroadcastChannel('diagramtex.store');
    try {
      // what an older version sends: { k, v } and no version
      old.postMessage({ k: key, v: JSON.stringify({ kind: 'classic', name: 'from the old tab', blocks: [] }) });
      old.postMessage({ k: 'diagramtex.rec.' + id, v: JSON.stringify([copy(1000, 7)]) });
      await new Promise((r) => setTimeout(r, 300));
      T.eq(get(key)?.name, 'from the old tab', 'this tab has it');
      T.eq(TD.app.recovery.list(id).map((c) => c.taken), [1000], 'and its copy');
      await new Promise((r) => setTimeout(r, 200));
      const db = await new Promise((res) => { const r = indexedDB.open('diagramtex'); r.onsuccess = () => res(r.result); });
      try {
        const v = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); });
        T.eq(JSON.parse(v).name, 'from the old tab', 'written to the database for it');
        const c = await new Promise((res) => { const r = db.transaction('rec').objectStore('rec').get([id, 1000]); r.onsuccess = () => res(r.result); });
        T.ok(!!c, 'its copy too');
      } finally { db.close(); }
    } finally { old.close(); TD.docStore.del(key); TD.app.recovery.forget(id); }
  });
  T.test('versions: a merge with another tab keeps what this tab had as a copy', async () => {
    if (!TD.docStore.active || typeof BroadcastChannel !== 'function') return;
    const id = TD.app.newDoc('merge copy', [rect('a', 0), rect('b', 0)], null, null), R = TD.app.recovery, key = 'diagramtex.doc.' + id;
    TD.app.saveNow();
    const stored = get(key);
    // this tab changes a (not saved yet); another tab saves a change to b
    TD.app.begin(); TD.state.doc.shapes[0].x = 11; TD.app.commit();
    const theirs = JSON.parse(JSON.stringify(stored)); theirs.blocks[0].shapes[1].x = 22;
    const other = new BroadcastChannel('diagramtex.store');
    try {
      other.postMessage({ k: key, v: JSON.stringify(theirs), ver: 2 });
      await new Promise((r) => setTimeout(r, 300));
    } finally { other.close(); }
    T.eq(TD.state.doc.shapes.map((s) => s.x), [11, 22], 'merged');
    const c = R.list(id)[0];
    T.ok(c && c.doc.blocks[0].shapes[0].x === 11 && c.doc.blocks[0].shapes[1].x === 0, "this tab's state before the merge is kept");
    cleanup(id);
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
    const confirm = TD.confirm; let asked = 0; TD.confirm = async () => { asked++; return true; };
    try {
      // the folder menu passes its path the way the sidebar does; it asks nothing first (undo brings it back)
      const row = document.querySelector('#docList [data-folder="Fold"]');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
      document.querySelector('[data-act="doc:delfolder"]').click();
      await new Promise(r => setTimeout(r, 20));
    } finally { TD.confirm = confirm; }
    T.eq(asked, 0, 'no question first');
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
  T.test('history: a file made after a delete or its undo has nothing to undo or redo; the files there then still do', () => {
    start();
    const c = fresh('new C'), a = fresh('new A'), beta = fresh('new Beta');
    C.docAction('del', beta); // Beta was open: another file opens
    C.undo();
    T.eq(TD.state.docId, beta, 'undo brings Beta back');
    const n = fresh('new N');
    T.ok(!C.canUndo() && !C.canRedo(), 'a new file has nothing to undo or redo');
    C.redo(); C.undo();
    T.ok(listed(beta) && !inBin(beta), 'redo in it does not delete Beta again');
    // a delete made from an older file, then a new file: undo there does not bring the deleted file back
    C.openDoc(a); C.docAction('del', c);
    const m = fresh('new M');
    C.undo();
    T.ok(inBin(c), 'undo in a newer file leaves the deleted file in the bin');
    C.openDoc(a); C.undo();
    T.ok(listed(c), 'from the file it was deleted from, undo still brings it back');
    const late = fresh('new P');
    T.ok(!C.canRedo(), 'a file made after the undo cannot redo it');
    C.openDoc(a); C.redo();
    T.ok(inBin(c), 'the file it was undone from can');
    cleanup(a, beta, n, m, late, c);
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
