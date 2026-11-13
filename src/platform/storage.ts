import { runtime as TD } from '../runtime';
import type { FileEntry } from '../core/autosave';
import type { FileKind } from '../core/contracts';
// Files and the file list live in IndexedDB, which holds far more than localStorage's ~5 MB. They are
// read once at start into memory, so the app reads them synchronously; writes go to the database in the
// background, gathered into one transaction. Other tabs of the app hear about each write and keep their
// copy current. Without IndexedDB (blocked, or failing to open) the app keeps using localStorage.
(function () {
  const DB = 'diagramtex', OS = 'kv', INDEX = 'diagramtex.index', DOC = 'diagramtex.doc.', REC = 'diagramtex.rec.';
  // files, the file list and the files' recovery copies (src/core/recovery.ts)
  const owns = (k: string) => k === INDEX || k.startsWith(DOC) || k.startsWith(REC);
  const mem = new Map<string, string>(); // key → JSON text
  const queue = new Map<string, string | null>(); // key → JSON text, or null to delete
  let db: IDBDatabase | null = null, busy = false, asked = false;
  let onWrite: (ok: boolean, error?: unknown) => void = () => {};
  let onRemote: (key: string) => void = () => {};
  const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('diagramtex.store') : null;

  const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onabort = tx.onerror = () => rej(tx.error || new Error('aborted')); });
  function openDb() {
    return new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
      setTimeout(() => rej(new Error('timeout')), 5000);
    });
  }
  function lsKeys() {
    const out: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && owns(k)) out.push(k); } } catch (e: any) { /* storage blocked */ }
    return out;
  }
  const parse = <T>(t: string | null | undefined, fb: T): T => { try { return t ? JSON.parse(t) : fb; } catch (e: any) { return fb; } };
  // Files kept in localStorage (from before this, or from a session that could not open the database) move
  // into the database. A file in both places is taken from localStorage, the newer of the two; the lists
  // are merged. localStorage is cleared only once the database has them.
  async function moveIn() {
    const keys = lsKeys();
    if (!keys.length) return;
    const put = new Map<string, string | null>();
    for (const k of keys) if (k !== INDEX) put.set(k, localStorage.getItem(k));
    const mine = parse(mem.get(INDEX), [] as FileEntry[]), theirs = parse(localStorage.getItem(INDEX), [] as FileEntry[]);
    const byId = new Map(mine.map((x) => [x.id, x]));
    for (const it of theirs) { const m = byId.get(it.id); if (!m) { mine.push(it); byId.set(it.id, it); } else if ((it.updated || 0) > (m.updated || 0)) Object.assign(m, it); }
    // a file with no entry in the list is still listed, so nothing is left behind unseen
    for (const k of put.keys()) {
      const id = k.slice(DOC.length);
      if (!byId.has(id)) { const d = parse(put.get(k), {} as { name?: string; kind?: FileKind }); const it = { id, name: d.name || 'Untitled', kind: d.kind, updated: Date.now() }; mine.push(it); byId.set(id, it); }
    }
    put.set(INDEX, JSON.stringify(mine));
    const tx = db!.transaction(OS, 'readwrite'), os = tx.objectStore(OS);
    for (const [k, v] of put) if (v != null) os.put(v, k);
    await done(tx);
    for (const [k, v] of put) if (v != null) mem.set(k, v);
    for (const k of keys) try { localStorage.removeItem(k); } catch (e: any) { /* ignore */ }
  }
  const ready = (async () => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
      db = await openDb();
      const os = db.transaction(OS).objectStore(OS);
      const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
      keys.forEach((k, i) => mem.set(k as string, vals[i] as string));
      await moveIn();
      db.onversionchange = () => { db?.close(); };
      return true;
    } catch (e: any) {
      db = null; mem.clear();
      return false;
    }
  })();

  function flush() {
    if (busy || !queue.size || !db) return;
    busy = true;
    const batch = new Map(queue);
    queue.clear();
    let tx;
    try {
      tx = db.transaction(OS, 'readwrite');
      const os = tx.objectStore(OS);
      for (const [k, v] of batch) if (v === null) os.delete(k); else os.put(v, k);
      if (tx.commit) tx.commit();
    } catch (e: any) {
      // the connection is gone (closed by another version, or by the browser): keep the batch so it is not lost
      busy = false;
      for (const [k, v] of batch) if (!queue.has(k)) queue.set(k, v);
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
      for (const [k, v] of batch) if (!queue.has(k)) queue.set(k, v);
      onWrite(false, e);
    });
  }
  // Ask the browser not to clear the files under storage pressure, once there is a lot to lose (some
  // browsers ask the person, so not for a few small files).
  // On leaving the page, a write still in flight is followed by whatever was queued behind it.
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => { if (busy && queue.size && db) { busy = false; flush(); } });
  function persistIfLarge() {
    if (asked || !navigator.storage || !navigator.storage.persist) return;
    let n = 0;
    for (const v of mem.values()) n += v.length;
    if (n < 5e6) return;
    asked = true;
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }
  function write(k: string, v: string | null) {
    if (v === null) mem.delete(k); else mem.set(k, v);
    queue.set(k, v);
    if (chan) try { chan.postMessage({ k, v }); } catch (e: any) { /* too large to pass on: other tabs read it next start */ }
    queueMicrotask(flush);
  }
  if (chan) chan.onmessage = (e) => {
    const { k, v } = e.data || {};
    if (!k || !owns(k)) return;
    if (v === null) mem.delete(k); else mem.set(k, v);
    onRemote(k);
  };

  TD.docStore = {
    ready,
    owns,
    get active() { return !!db; },
    get: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    set: (k: string, text: string) => write(k, text),
    del: (k: string) => write(k, null),
    flush,
    // onWrite(ok, error) after each write to the database; onRemote(key) when another tab changed a key
    on(h: { write?: (ok: boolean, error?: unknown) => void; remote?: (key: string) => void }) { if (h.write) onWrite = h.write; if (h.remote) onRemote = h.remote; },
  };
})();
