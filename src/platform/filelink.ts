import { runtime as TD } from '../runtime';
// Files on disk without a dialog each time (File System Access API: Chrome, Edge and other Chromium browsers).
// A document can be linked to a file: the first save picks it, later saves write straight to it. A document
// can also have an export folder, where PNG, SVG, web page and .tex exports go, replacing the previous copy.
// The handles are kept in IndexedDB (a database of their own, so the documents' store is untouched), so the
// links survive a reload; after one, the browser asks once to allow editing again, or never if the person
// chose "Allow on every visit". Browsers without the API keep downloading files as before.
(function () {
  const DB = 'diagramtex-files', OS = 'h';
  const can = typeof window.showSaveFilePicker === 'function' && typeof window.showDirectoryPicker === 'function';
  const mem = new Map(); // key → record, read once at start
  let dbp: any = null;

  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function put(key: any, val: any) {
    if (val == null) mem.delete(key); else mem.set(key, val);
    try {
      const tx = (await db()).transaction(OS, 'readwrite'), os = tx.objectStore(OS);
      if (val == null) os.delete(key); else os.put(val, key);
    } catch { /* the link lasts until reload */ }
  }
  // Read every record into memory, so the app can ask synchronously whether a document is linked.
  const ready = !can ? Promise.resolve() : db().then((d: any) => new Promise<void>((res) => {
    const tx = d.transaction(OS, 'readonly'), os = tx.objectStore(OS), keys = os.getAllKeys(), vals = os.getAll();
    tx.oncomplete = () => {
      keys.result.forEach((k: any, i: any) => mem.set(k, vals.result[i]));
      Promise.all(keys.result.filter((k: any) => String(k).startsWith('doc:')).map((k: any) => check(String(k).slice(4)))).then(() => res(), () => res());
    };
    tx.onerror = tx.onabort = () => res();
  })).catch(() => {});

  // A short fingerprint of a file's text, to tell whether a document changed since it was last written.
  function hash(s: any) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  // Ask for read/write access when it isn't granted yet. Asking needs a recent click or key press.
  async function allowed(h: any) {
    const o = { mode: 'readwrite' };
    try {
      if ((await h.queryPermission(o)) === 'granted') return true;
      return (await h.requestPermission(o)) === 'granted';
    } catch { return false; }
  }
  async function write(h: any, data: any) {
    const w = await h.createWritable();
    try { await w.write(data); await w.close(); } catch (e: any) { try { await w.abort(); } catch { /* already closed */ } throw e; }
  }
  const aborted = (e: any) => e && e.name === 'AbortError';
  // Show a picker starting in the last folder used; if that folder is gone, start in the default one.
  async function picker(fn: any, o: any) {
    try { return await (window[fn] as unknown as (options: any) => Promise<any>)(o); }
    catch (e: any) { if (aborted(e) || typeof o.startIn === 'string') throw e; return (window[fn] as unknown as (options: any) => Promise<any>)({ ...o, startIn: undefined }); }
  }

  // ---- documents linked to files ----
  const fileOf = (id: any) => mem.get('doc:' + id) || null;
  // `text` is the document as the file holds it; `disk`, the file's own text when it was read from disk.
  // `mtime`: when the file was last written, to tell whether something else changed it since.
  async function link(id: any, handle: any, text: any, disk = text) {
    let mtime = null;
    try { mtime = (await handle.getFile()).lastModified; } catch { /* no read access yet */ }
    held.delete(id); missing.delete(id);
    await put('doc:' + id, { handle, name: handle.name, hash: hash(text), disk: hash(disk), mtime });
    await check(id);
  }
  async function unlink(id: any) { writable.delete(id); held.delete(id); missing.delete(id); await put('doc:' + id, null); }

  // ---- autosave to the linked file ----
  // Only while the browser already lets the page write to the file: asking needs a click, so after a reload the
  // document autosaves in the browser until a save (which asks) allows the file again. A file changed on disk by
  // something else is not written over (held): autosave stops for it until the next save, which asks which to keep.
  // A file moved or deleted (missing) stops it too, until a save picks where it goes.
  const writable = new Set(), held = new Set(), missing = new Set();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  async function check(id: any) {
    const r = fileOf(id), was = writable.has(id);
    let ok = false;
    try { ok = !!r && (await r.handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { ok = false; }
    if (ok) writable.add(id); else writable.delete(id);
    if (ok !== was) changed();
    return ok;
  }
  const autoSaving = (id: any) => !!fileOf(id) && writable.has(id) && !held.has(id) && !missing.has(id);
  const writing = new Map<any, Promise<any>>();
  // one at a time per file: a look at the disk never runs while a write is under way, which would find the file
  // changed by the write itself
  const queue = <T>(id: any, run: () => Promise<T>): Promise<T> => { const p = (writing.get(id) || Promise.resolve()).then(run, run); writing.set(id, p); return p; };
  const notFound = (e: any) => e && e.name === 'NotFoundError';
  // What the file on disk holds now, against what was last written to it or read from it: 'same', 'changed' (with
  // its text), 'missing' (moved or deleted), 'unknown' (no access yet: the browser asks only on a click) or 'none'
  // (not linked). Rewritten with the same contents (a sync, a touch) counts as the same.
  async function look(id: any): Promise<{ state: 'same' | 'changed' | 'missing' | 'unknown' | 'none'; text?: string }> {
    const r = fileOf(id);
    if (!r) return { state: 'none' };
    try {
      if ((await r.handle.queryPermission({ mode: 'read' })) !== 'granted') return { state: 'unknown' };
      const f = await r.handle.getFile();
      if (missing.delete(id)) changed();
      if (r.mtime != null && f.lastModified === r.mtime) return { state: 'same' };
      const text = await f.text(), h = hash(text);
      if (h === r.hash || h === r.disk) { await put('doc:' + id, { ...r, mtime: f.lastModified }); return { state: 'same' }; }
      return { state: 'changed', text };
    } catch (e: any) {
      if (notFound(e)) { if (!missing.has(id)) { missing.add(id); changed(); } return { state: 'missing' }; }
      return { state: 'unknown' };
    }
  }
  const diskState = (id: any) => queue(id, () => look(id));
  /** Stop autosave writing over a file changed on disk; true when it wasn't stopped already. */
  const hold = (id: any) => { if (held.has(id)) return false; held.add(id); changed(); return true; };
  // Write the document's text to its file. 'saved', 'off' (no file, no access or a write that failed), or
  // 'changed' (the file changed on disk since it was last written or opened).
  // 'missing' (moved or deleted since).
  function autoWrite(id: any, text: any): Promise<string> {
    return queue(id, async () => {
      const r = fileOf(id);
      if (!r || !autoSaving(id)) return 'off';
      if (r.hash === hash(text)) return 'saved';
      try {
        if ((await r.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') { writable.delete(id); changed(); return 'off'; }
        const now = await look(id);
        if (now.state === 'changed') { hold(id); return 'changed'; }
        if (now.state === 'missing') return 'missing';
        await write(r.handle, text);
        await link(id, r.handle, text);
        return 'saved';
      } catch (e: any) {
        if (notFound(e)) { missing.add(id); changed(); return 'missing'; }
        writable.delete(id); changed(); return 'off';
      }
    });
  }
  // Save `text` to the document's file, or pick one first (always, with `pick`). Returns the file name,
  // null if the person cancelled, or throws. A file changed on disk since it was last written or opened here is not
  // written over at once: `changedOnDisk` gets its text and says whether to ('overwrite') or not ('cancel').
  async function saveDoc(id: any, text: any, suggestedName: any, pick: any, changedOnDisk?: (disk: string) => Promise<'overwrite' | 'cancel'>) {
    let rec = !pick && fileOf(id), h = rec && rec.handle;
    if (h && !(await allowed(h))) h = null; // no access: pick the file again
    if (h && changedOnDisk) {
      const now = await queue(id, () => look(id));
      if (now.state === 'changed' && (await changedOnDisk(now.text!)) !== 'overwrite') return null;
    }
    if (!h) {
      try {
        h = await picker('showSaveFilePicker', { id: 'diagramtex-doc', suggestedName, startIn: fileOf(id)?.handle || mem.get('lastDir') || 'documents',
          types: [{ description: 'DiagramTeX file', accept: { 'application/vnd.diagramtex+json': ['.diagramtex'] } }] });
      } catch (e: any) { if (aborted(e)) return null; throw e; }
    }
    try { await write(h, text); }
    catch (e: any) {
      if (!rec || e.name !== 'NotFoundError') throw e;
      missing.add(id); changed();
      return saveDoc(id, text, suggestedName, true); // the file was moved or deleted: pick another
    }
    await link(id, h, text);
    writable.add(id); changed(); // written just now, so access is granted
    await put('lastDir', h);
    return h.name;
  }
  // Is the document's text the same as when it was last written to its file?
  const isSaved = (id: any, text: any) => { const r = fileOf(id); return !!r && r.hash === hash(text); };
  // Is this the file's text as it was when last saved or opened (not changed on disk since)?
  const isOnDisk = (id: any, text: any) => { const r = fileOf(id); return !!r && r.disk === hash(text); };
  // Which linked document, if any, is this file?
  async function docFor(handle: any, ids: any) {
    for (const id of ids) {
      const r = fileOf(id);
      try { if (r && (await r.handle.isSameEntry(handle))) return id; } catch { /* stale handle */ }
    }
    return null;
  }
  // Open a file with the picker: { handle, file } or null if cancelled.
  async function pickOpen() {
    try {
      const [h] = await picker('showOpenFilePicker', { id: 'diagramtex-doc', startIn: mem.get('lastDir') || 'documents',
        types: [{ description: 'DiagramTeX or LaTeX file', accept: { 'application/vnd.diagramtex+json': ['.diagramtex'], 'application/json': ['.json'], 'text/x-tex': ['.tex', '.tikz'], 'text/plain': ['.txt'] } }] });
      await put('lastDir', h);
      return { handle: h, file: await h.getFile() };
    } catch (e: any) { if (aborted(e)) return null; throw e; }
  }

  // ---- export folders, one per document ----
  const dirOf = (id: any) => mem.get('dir:' + id) || null;
  async function pickDir(id: any) {
    let h;
    try { h = await picker('showDirectoryPicker', { id: 'diagramtex-export', mode: 'readwrite', startIn: dirOf(id)?.handle || fileOf(id)?.handle || mem.get('lastDir') || 'pictures' }); }
    catch (e: any) { if (aborted(e)) return null; throw e; }
    await put('dir:' + id, { handle: h, name: h.name });
    await put('lastDir', h);
    return h.name;
  }
  async function clearDir(id: any) { await put('dir:' + id, null); }
  // The export folder, with access granted, or null (no folder, or access refused): call it first thing
  // after the click, before slow work, since asking needs a recent click.
  async function exportDir(id: any) {
    const r = dirOf(id);
    return r && (await allowed(r.handle)) ? r.handle : null;
  }
  // Write a file into a folder, replacing one of the same name.
  async function writeIn(dir: any, name: any, data: any) { await write(await dir.getFileHandle(name, { create: true }), data); }

  async function forget(id: any) { await unlink(id); await clearDir(id); }

  // ---- data files a block reads (a network's CSVs), linked to files on disk ----
  // key: '<document id>:<object id>:<file name>'. The block keeps the file's text as well, so it draws and exports
  // without the link; the link lets it be read in again when the file changes, and written back on request. As
  // with documents, nothing is written over a file that changed on disk since it was last read or written.
  const dataOf = (key: string) => mem.get('data:' + key) || null;
  /** pick a file to read; linked under `key` where the browser can keep a handle. { name, text } or null */
  async function pickData(key: string, accept: Record<string, string[]>) {
    if (typeof window.showOpenFilePicker !== 'function') return null;
    let hs;
    try { hs = await picker('showOpenFilePicker', { id: 'diagramtex-data', types: [{ description: Object.keys(accept).join(', '), accept }], startIn: mem.get('lastDir') || 'documents' }); }
    catch (e: any) { if (aborted(e)) return null; throw e; }
    const h = hs[0], f = await h.getFile(), text = await f.text();
    await put('data:' + key, { handle: h, name: h.name, hash: hash(text), mtime: f.lastModified });
    return { name: h.name, text };
  }
  /** what the linked file holds now: 'same', 'changed' (with its text), 'missing', 'unknown' (no access yet; `ask`
   *  asks for it, which needs a recent click) or 'none' (not linked) */
  async function lookData(key: string, ask = false): Promise<{ state: 'same' | 'changed' | 'missing' | 'unknown' | 'none'; text?: string }> {
    const r = dataOf(key);
    if (!r) return { state: 'none' };
    try {
      const ok = ask ? await allowed(r.handle) : (await r.handle.queryPermission({ mode: 'read' })) === 'granted';
      if (!ok) return { state: 'unknown' };
      const f = await r.handle.getFile();
      if (r.mtime != null && f.lastModified === r.mtime) return { state: 'same' };
      const text = await f.text();
      if (hash(text) === r.hash) { await put('data:' + key, { ...r, mtime: f.lastModified }); return { state: 'same' }; }
      return { state: 'changed', text };
    } catch (e: any) { return { state: notFound(e) ? 'missing' : 'unknown' }; }
  }
  /** the text now read in (or written), so the next look compares against it */
  async function markData(key: string, text: string) {
    const r = dataOf(key);
    if (!r) return;
    let mtime = null;
    try { mtime = (await r.handle.getFile()).lastModified; } catch { /* no access */ }
    await put('data:' + key, { ...r, hash: hash(text), mtime });
  }
  /** write the block's copy back to the linked file: 'saved', 'changed' (changed on disk since: not written), 'off' */
  async function writeData(key: string, text: string, force = false): Promise<'saved' | 'changed' | 'off'> {
    const r = dataOf(key);
    if (!r || !(await allowed(r.handle))) return 'off';
    if (!force) { const now = await lookData(key); if (now.state === 'changed') return 'changed'; }
    try { await write(r.handle, text); await markData(key, text); return 'saved'; } catch { return 'off'; }
  }
  const unlinkData = (key: string) => put('data:' + key, null);
  /** the link moves with its object (a copy keeps the text, not the link) */
  async function moveData(from: string, to: string) { const r = dataOf(from); if (!r) return; await put('data:' + to, r); await put('data:' + from, null); }
  const canPickData = typeof window.showOpenFilePicker === 'function';

  TD.files = { can, ready, hash, fileOf, link, unlink, saveDoc, isSaved, isOnDisk, docFor, diskState, hold,
    conflict: (id: any) => held.has(id), missing: (id: any) => missing.has(id), pickOpen, dirOf, pickDir, clearDir, exportDir, writeIn, forget, allowed,
    autoSaving, autoWrite, check, onChange: (f: () => void) => { listeners.add(f); },
    data: { can: canPickData, of: dataOf, pick: pickData, look: lookData, mark: markData, write: writeData, unlink: unlinkData, move: moveData } };
})();
