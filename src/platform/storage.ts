import { runtime as TD } from '../runtime';
import type { FileEntry } from '../core/autosave';
import type { FileKind } from '../core/contracts';
import type { CopyStore, RecoveryCopy } from '../core/recovery';
// Files and the file list live in IndexedDB, which holds far more than localStorage's ~5 MB. They are
// read once at start into memory, so the app reads them synchronously; writes go to the database in the
// background, gathered into one transaction. Other tabs of the app hear about each write and keep their
// copy current. Without IndexedDB (blocked, or failing to open) the app keeps using localStorage.
//
// Version 2 of the database keeps each file's earlier versions (src/core/recovery.ts) in a store of their own, one
// record per copy keyed [file id, time taken], instead of one array per file in `kv` that was written whole on
// every change. Opening version 2 over version 1 moves the arrays across inside the upgrade itself, so the database
// is either fully moved or, if anything fails, left at version 1 to try again next time.
(function () {
  const DB = 'diagramtex', VERSION = 2, OS = 'kv', RS = 'rec', INDEX = 'diagramtex.index', DOC = 'diagramtex.doc.', REC = 'diagramtex.rec.';
  // files and the file list (copies are in RS)
  const owns = (k: string) => k === INDEX || k.startsWith(DOC);
  const mem = new Map<string, string>(); // key → JSON text
  const queue = new Map<string, string | null>(); // key → JSON text, or null to delete
  const recs = new Map<string, Map<number, string>>(); // file id → time taken → the copy's JSON text
  const recQueue = new Map<string, { id: string; taken: number; text: string | null }>();
  let db: IDBDatabase | null = null, busy = false, asked = false, heardOld = false;
  let onWrite: (ok: boolean, error?: unknown) => void = () => {};
  let onRemote: (key: string) => void = () => {};
  let onOlder: () => void = () => {};
  const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('diagramtex.store') : null;

  const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onabort = tx.onerror = () => rej(tx.error || new Error('aborted')); });
  const parse = <T>(t: string | null | undefined, fb: T): T => { try { return t ? JSON.parse(t) : fb; } catch (e: any) { return fb; } };
  const copiesIn = (text: string | null | undefined) => parse(text, [] as RecoveryCopy[]).filter((c) => c && Number.isFinite(c.taken));

  /**
   * The upgrade (inside the versionchange transaction `tx`): makes the stores, and from version 1 moves each
   * file's array of copies out of `kv` into one record per copy. Anything thrown aborts the whole upgrade.
   */
  function upgradeSchema(d: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
    if (!d.objectStoreNames.contains(OS)) d.createObjectStore(OS);
    if (d.objectStoreNames.contains(RS)) return;
    const rec = d.createObjectStore(RS);
    if (oldVersion < 1) return;
    const kv = tx.objectStore(OS);
    kv.openCursor(IDBKeyRange.bound(REC, REC + '￿')).onsuccess = (e) => {
      const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cur) return;
      const id = String(cur.key).slice(REC.length);
      for (const c of copiesIn(cur.value as string)) rec.put(JSON.stringify(c), [id, c.taken]);
      cur.delete();
      cur.continue();
    };
  }
  function openDb() {
    return new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = (e) => upgradeSchema(r.result, r.transaction!, e.oldVersion);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      // a tab of an older version still has the database open: it closes on versionchange, so wait for it
      // (the timeout below still gives up, and the app then keeps using localStorage)
      r.onblocked = () => {};
      setTimeout(() => rej(new Error('timeout')), 5000);
    });
  }
  // localStorage keys to move in: files and the file list, and copies kept there without the database
  const movable = (k: string) => owns(k) || k.startsWith(REC);
  function lsKeys() {
    const out: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && movable(k)) out.push(k); } } catch (e: any) { /* storage blocked */ }
    return out;
  }
  // Files kept in localStorage (from before this, or from a session that could not open the database) move
  // into the database. A file in both places is taken from localStorage, the newer of the two; the lists
  // are merged. localStorage is cleared only once the database has them.
  async function moveIn() {
    const keys = lsKeys();
    if (!keys.length) return;
    const put = new Map<string, string | null>(), copies: [string, RecoveryCopy][] = [];
    for (const k of keys) {
      if (k.startsWith(REC)) { const id = k.slice(REC.length); for (const c of copiesIn(localStorage.getItem(k))) copies.push([id, c]); }
      else if (k !== INDEX) put.set(k, localStorage.getItem(k));
    }
    const mine = parse(mem.get(INDEX), [] as FileEntry[]), theirs = parse(localStorage.getItem(INDEX), [] as FileEntry[]);
    const byId = new Map(mine.map((x) => [x.id, x]));
    for (const it of theirs) { const m = byId.get(it.id); if (!m) { mine.push(it); byId.set(it.id, it); } else if ((it.updated || 0) > (m.updated || 0)) Object.assign(m, it); }
    // a file with no entry in the list is still listed, so nothing is left behind unseen
    for (const k of put.keys()) {
      const id = k.slice(DOC.length);
      if (!byId.has(id)) { const d = parse(put.get(k), {} as { name?: string; kind?: FileKind }); const it = { id, name: d.name || 'Untitled', kind: d.kind, updated: Date.now() }; mine.push(it); byId.set(id, it); }
    }
    if (theirs.length || put.size) put.set(INDEX, JSON.stringify(mine));
    const tx = db!.transaction([OS, RS], 'readwrite'), os = tx.objectStore(OS), rs = tx.objectStore(RS);
    for (const [k, v] of put) if (v != null) os.put(v, k);
    for (const [id, c] of copies) rs.put(JSON.stringify(c), [id, c.taken]);
    await done(tx);
    for (const [k, v] of put) if (v != null) mem.set(k, v);
    for (const [id, c] of copies) recOf(id).set(c.taken, JSON.stringify(c));
    for (const k of keys) try { localStorage.removeItem(k); } catch (e: any) { /* ignore */ }
  }
  const recOf = (id: string) => { let m = recs.get(id); if (!m) recs.set(id, m = new Map()); return m; };
  const ready = (async () => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
      db = await openDb();
      const tx = db.transaction([OS, RS]), os = tx.objectStore(OS), rs = tx.objectStore(RS);
      const [keys, vals, rkeys, rvals] = await Promise.all([req(os.getAllKeys()), req(os.getAll()), req(rs.getAllKeys()), req(rs.getAll())]);
      keys.forEach((k, i) => mem.set(k as string, vals[i] as string));
      rkeys.forEach((k, i) => { const [id, taken] = k as [string, number]; recOf(id).set(taken, rvals[i] as string); });
      await moveIn();
      db.onversionchange = () => { db?.close(); };
      return true;
    } catch (e: any) {
      db = null; mem.clear(); recs.clear();
      return false;
    }
  })();

  function flush() {
    if (busy || (!queue.size && !recQueue.size) || !db) return;
    busy = true;
    const batch = new Map(queue), recBatch = new Map(recQueue);
    queue.clear(); recQueue.clear();
    const requeue = () => {
      for (const [k, v] of batch) if (!queue.has(k)) queue.set(k, v);
      for (const [k, v] of recBatch) if (!recQueue.has(k)) recQueue.set(k, v);
    };
    let tx;
    try {
      tx = db.transaction(recBatch.size ? [OS, RS] : [OS], 'readwrite');
      const os = tx.objectStore(OS);
      for (const [k, v] of batch) if (v === null) os.delete(k); else os.put(v, k);
      if (recBatch.size) { const rs = tx.objectStore(RS); for (const { id, taken, text } of recBatch.values()) if (text === null) rs.delete([id, taken]); else rs.put(text, [id, taken]); }
      if (tx.commit) tx.commit();
    } catch (e: any) {
      // the connection is gone (closed by another version, or by the browser): keep the batch so it is not lost
      busy = false;
      requeue();
      onWrite(false, e);
      return;
    }
    done(tx).then(() => {
      busy = false;
      onWrite(true);
      persistIfLarge();
      flush();
    }, (e) => {
      busy = false;
      // a write that did not land is tried again with the next one, so nothing newer is lost behind it
      requeue();
      onWrite(false, e);
    });
  }
  // Ask the browser not to clear the files under storage pressure, once there is a lot to lose (some
  // browsers ask the person, so not for a few small files).
  // On leaving the page, a write still in flight is followed by whatever was queued behind it.
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => { if (busy && (queue.size || recQueue.size) && db) { busy = false; flush(); } });
  function persistIfLarge() {
    if (asked || !navigator.storage || !navigator.storage.persist) return;
    let n = 0;
    for (const v of mem.values()) n += v.length;
    for (const m of recs.values()) for (const v of m.values()) n += v.length;
    if (n < 5e6) return;
    asked = true;
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }
  // Every message carries `ver`, so a tab of this version can tell one from an older version (which sends
  // { k, v } only, and whose own writes stop once this version has upgraded the database).
  const post = (m: Record<string, unknown>) => { if (chan) try { chan.postMessage({ ...m, ver: VERSION }); } catch (e: any) { /* too large to pass on: other tabs read it next start */ } };
  function write(k: string, v: string | null) {
    if (v === null) mem.delete(k); else mem.set(k, v);
    queue.set(k, v);
    post({ k, v });
    queueMicrotask(flush);
  }
  function writeCopy(id: string, taken: number, text: string | null, tell = true) {
    if (text === null) { recs.get(id)?.delete(taken); if (!recs.get(id)?.size) recs.delete(id); } else recOf(id).set(taken, text);
    recQueue.set(id + '\n' + taken, { id, taken, text });
    if (tell) post({ rec: id, taken, v: text });
    queueMicrotask(flush);
  }
  const copies: CopyStore = {
    list(id) {
      const m = recs.get(id);
      if (!m) return [];
      return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([, t]) => parse(t, null as RecoveryCopy | null)).filter((c): c is RecoveryCopy => !!c);
    },
    put(id, copy) { writeCopy(id, copy.taken, JSON.stringify(copy)); },
    del(id, taken) { if (recs.get(id)?.has(taken)) writeCopy(id, taken, null); },
    clear(id) { for (const taken of [...(recs.get(id)?.keys() || [])]) writeCopy(id, taken, null); },
  };
  if (chan) chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.ver >= VERSION) {
      if (typeof m.rec === 'string' && Number.isFinite(m.taken)) {
        if (m.v === null) { recs.get(m.rec)?.delete(m.taken); if (!recs.get(m.rec)?.size) recs.delete(m.rec); } else if (typeof m.v === 'string') recOf(m.rec).set(m.taken, m.v);
        onRemote(REC + m.rec);
        return;
      }
      if (!m.k || !owns(m.k)) return;
      if (m.v === null) mem.delete(m.k); else mem.set(m.k, m.v);
      onRemote(m.k);
      return;
    }
    // A tab of an older version: it can no longer write to the database once this one has upgraded it, so its
    // changes are kept here on its behalf (without telling it back), and the person is told to reload it.
    const { k, v } = m;
    if (typeof k !== 'string' || (v !== null && typeof v !== 'string')) return;
    if (!heardOld) { heardOld = true; onOlder(); }
    if (k.startsWith(REC)) {
      if (!db || v === null) return; // its copies only ever grow here; deleting a file for good clears them
      const id = k.slice(REC.length);
      for (const c of copiesIn(v)) if (!recs.get(id)?.has(c.taken)) writeCopy(id, c.taken, JSON.stringify(c), false);
      onRemote(REC + id);
      return;
    }
    if (!owns(k)) return;
    if (v === null) mem.delete(k); else mem.set(k, v);
    if (db) { queue.set(k, v); queueMicrotask(flush); }
    onRemote(k);
  };

  TD.docStore = {
    ready,
    owns,
    get active() { return !!db; },
    get: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    set: (k: string, text: string) => write(k, text),
    del: (k: string) => write(k, null),
    copies,
    flush,
    upgradeSchema,
    // onWrite(ok, error) after each write to the database; onRemote(key) when another tab changed a key;
    // onOlder() once, when a tab of an older version is heard from
    on(h: { write?: (ok: boolean, error?: unknown) => void; remote?: (key: string) => void; older?: () => void }) {
      if (h.write) onWrite = h.write; if (h.remote) onRemote = h.remote;
      if (h.older) { onOlder = h.older; if (heardOld) onOlder(); } // heard before anyone listened
    },
  };
})();
