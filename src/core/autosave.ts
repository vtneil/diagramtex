import type { DiagramDocument, FileKind } from './contracts';
import type { JsonStore } from '../platform/browser-store';
export interface FileEntry { id: string; name: string; kind?: FileKind; updated?: number }
export function createAutosave(state: { docId: string | null; doc: DiagramDocument; view: { x: number; y: number; zoom: number }; mode: string },
  store: JsonStore, hooks: { index(): FileEntry[]; inBin(id: string): boolean; inDatabase(key: string): boolean; report(ok: boolean, full: boolean): void; showState(): void; renderList(): void;
    /** the stored file `id` (last changed at `updated`) is about to be replaced by new content */
    replacing?(id: string, stored: Record<string, unknown> | null, updated: number | undefined): void }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // What this tab last read or wrote for the open file. A save with no change since then writes only the view, so
  // a tab left open (and saved on hide) does not put its stale copy over another tab's edit.
  let synced: { id: string | null; content: string } = { id: null, content: '' };
  const contentOf = (doc: DiagramDocument) => JSON.stringify({ kind: doc.kind, name: doc.name, page: doc.page,
    ...(doc.kind === 'page' ? { sheet: doc.sheet } : { blocks: doc.blocks, active: doc.active }) });
  /** The open file now matches storage (just opened or reloaded); or, given `stored` (another tab's version just
   *  merged into this one), storage holds that, and this tab's merged file is a change to save. */
  function markSynced(stored?: DiagramDocument) { synced = { id: state.docId, content: contentOf(stored || state.doc) }; }
  /** What this tab last read or wrote for the open file: what it shares with another tab's save. */
  function base(): Record<string, unknown> | null { return synced.id === state.docId && synced.content ? JSON.parse(synced.content) : null; }
  /** The open file has changes this tab has not written. */
  function isDirty() { return !!state.docId && (synced.id !== state.docId || synced.content !== contentOf(state.doc)); }
  function saveNow() {
    clearTimeout(timer);
    if (!state.docId) return;
    const doc = state.doc, id = state.docId;
    const key = 'diagramtex.doc.' + id, content = contentOf(doc);
    if (synced.id === id && synced.content === content) {
      const stored = store.get<Record<string, unknown> | null>(key, null);
      if (stored) { store.set(key, { ...stored, view: state.view, mode: state.mode }); hooks.showState(); return; }
    }
    const index = hooks.index(), entry = index.find(file => file.id === id);
    hooks.replacing?.(id, store.get<Record<string, unknown> | null>(key, null), entry?.updated);
    const ok = store.set(key, { ...JSON.parse(content), view: state.view, mode: state.mode });
    if (ok) synced = { id, content };
    if (entry) { entry.name = doc.name; entry.kind = doc.kind; entry.updated = Date.now(); }
    // a file deleted in another tab stays in the Recycle Bin (its data kept current), not back in the list
    else if (!hooks.inBin(id)) index.push({ id, name: doc.name, kind: doc.kind, updated: Date.now() });
    store.set('diagramtex.index', index);
    if (!ok || !hooks.inDatabase(key)) hooks.report(ok, store.full); else hooks.showState();
    hooks.renderList();
  }
  function scheduleSave() { clearTimeout(timer); timer = setTimeout(saveNow, 400); }
  return { saveNow, scheduleSave, markSynced, isDirty, base };
}
