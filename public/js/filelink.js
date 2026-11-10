// Files on disk without a dialog each time (File System Access API: Chrome, Edge and other Chromium browsers).
// A document can be linked to a file: the first save picks it, later saves write straight to it. A document
// can also have an export folder, where PNG, SVG, web page and .tex exports go, replacing the previous copy.
// The handles are kept in IndexedDB (a database of their own, so the documents' store is untouched), so the
// links survive a reload; after one, the browser asks once to allow editing again, or never if the person
// chose "Allow on every visit". Browsers without the API keep downloading files as before.
(function () {
  const TD = (window.TD = window.TD || {});
  const DB = 'diagramtex-files', OS = 'h';
  const can = typeof window.showSaveFilePicker === 'function' && typeof window.showDirectoryPicker === 'function';
  const mem = new Map(); // key → record, read once at start
  let dbp = null;

  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function put(key, val) {
    if (val == null) mem.delete(key); else mem.set(key, val);
    try {
      const tx = (await db()).transaction(OS, 'readwrite'), os = tx.objectStore(OS);
      if (val == null) os.delete(key); else os.put(val, key);
    } catch { /* the link lasts until reload */ }
  }
  // Read every record into memory, so the app can ask synchronously whether a document is linked.
  const ready = !can ? Promise.resolve() : db().then((d) => new Promise((res) => {
    const tx = d.transaction(OS, 'readonly'), os = tx.objectStore(OS), keys = os.getAllKeys(), vals = os.getAll();
    tx.oncomplete = () => { keys.result.forEach((k, i) => mem.set(k, vals.result[i])); res(); };
    tx.onerror = tx.onabort = () => res();
  })).catch(() => {});

  // A short fingerprint of a file's text, to tell whether a document changed since it was last written.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  // Ask for read/write access when it isn't granted yet. Asking needs a recent click or key press.
  async function allowed(h) {
    const o = { mode: 'readwrite' };
    try {
      if ((await h.queryPermission(o)) === 'granted') return true;
      return (await h.requestPermission(o)) === 'granted';
    } catch { return false; }
  }
  async function write(h, data) {
    const w = await h.createWritable();
    try { await w.write(data); await w.close(); } catch (e) { try { await w.abort(); } catch { /* already closed */ } throw e; }
  }
  const aborted = (e) => e && e.name === 'AbortError';
  // Show a picker starting in the last folder used; if that folder is gone, start in the default one.
  async function picker(fn, o) {
    try { return await window[fn](o); }
    catch (e) { if (aborted(e) || typeof o.startIn === 'string') throw e; return window[fn]({ ...o, startIn: undefined }); }
  }

  // ---- documents linked to files ----
  const fileOf = (id) => mem.get('doc:' + id) || null;
  // `text` is the document as the file holds it; `disk`, the file's own text when it was read from disk.
  async function link(id, handle, text, disk = text) { await put('doc:' + id, { handle, name: handle.name, hash: hash(text), disk: hash(disk) }); }
  async function unlink(id) { await put('doc:' + id, null); }
  // Save `text` to the document's file, or pick one first (always, with `pick`). Returns the file name,
  // null if the person cancelled, or throws.
  async function saveDoc(id, text, suggestedName, pick) {
    let rec = !pick && fileOf(id), h = rec && rec.handle;
    if (h && !(await allowed(h))) h = null; // no access: pick the file again
    if (!h) {
      try {
        h = await picker('showSaveFilePicker', { id: 'diagramtex-doc', suggestedName, startIn: fileOf(id)?.handle || mem.get('lastDir') || 'documents',
          types: [{ description: 'DiagramTeX file', accept: { 'application/vnd.diagramtex+json': ['.diagramtex'] } }] });
      } catch (e) { if (aborted(e)) return null; throw e; }
    }
    try { await write(h, text); }
    catch (e) {
      if (!rec || e.name !== 'NotFoundError') throw e;
      return saveDoc(id, text, suggestedName, true); // the file was moved or deleted: pick another
    }
    await link(id, h, text);
    await put('lastDir', h);
    return h.name;
  }
  // Is the document's text the same as when it was last written to its file?
  const isSaved = (id, text) => { const r = fileOf(id); return !!r && r.hash === hash(text); };
  // Is this the file's text as it was when last saved or opened (not changed on disk since)?
  const isOnDisk = (id, text) => { const r = fileOf(id); return !!r && r.disk === hash(text); };
  // Which linked document, if any, is this file?
  async function docFor(handle, ids) {
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
    } catch (e) { if (aborted(e)) return null; throw e; }
  }

  // ---- export folders, one per document ----
  const dirOf = (id) => mem.get('dir:' + id) || null;
  async function pickDir(id) {
    let h;
    try { h = await picker('showDirectoryPicker', { id: 'diagramtex-export', mode: 'readwrite', startIn: dirOf(id)?.handle || fileOf(id)?.handle || mem.get('lastDir') || 'pictures' }); }
    catch (e) { if (aborted(e)) return null; throw e; }
    await put('dir:' + id, { handle: h, name: h.name });
    await put('lastDir', h);
    return h.name;
  }
  async function clearDir(id) { await put('dir:' + id, null); }
  // The export folder, with access granted, or null (no folder, or access refused): call it first thing
  // after the click, before slow work, since asking needs a recent click.
  async function exportDir(id) {
    const r = dirOf(id);
    return r && (await allowed(r.handle)) ? r.handle : null;
  }
  // Write a file into a folder, replacing one of the same name.
  async function writeIn(dir, name, data) { await write(await dir.getFileHandle(name, { create: true }), data); }

  async function forget(id) { await unlink(id); await clearDir(id); }

  TD.files = { can, ready, hash, fileOf, link, unlink, saveDoc, isSaved, isOnDisk, docFor, pickOpen, dirOf, pickDir, clearDir, exportDir, writeIn, forget, allowed };
})();
