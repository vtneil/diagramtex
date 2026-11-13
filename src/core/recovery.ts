// Recovery copies: earlier states of a file, taken by autosave on its own. Not versions the person names or
// manages. While a file is being changed, the state it had before the change is kept, at most once per
// period, and only the newest few copies are kept. Between them, one more copy (`recent`) follows the edits
// every QUICK minutes, so a recent state is never a whole period away: `keep` + 1 copies at most. No DOM;
// storage goes through the JSON store.
import type { JsonStore } from '../platform/browser-store';

export interface RecoveryCopy {
  /** when the copy was taken */
  taken: number;
  /** when the file last had this content (what the list shows) */
  at: number;
  /** the stored file, without its view */
  doc: Record<string, unknown>;
  /** the one copy taken between periods; the next one taken between periods replaces it */
  recent?: boolean;
}
export interface RecoverySettings {
  /** minutes between copies; 0 turns copies off */
  every: number;
  /** how many copies are kept per file */
  keep: number;
}
export const RECOVERY_KEY = 'diagramtex.rec.';
export const RECOVERY_DEFAULTS: RecoverySettings = { every: 10, keep: 3 };
export const RECOVERY_EVERY = [0, 1, 5, 10, 30, 60];
export const RECOVERY_KEEP = [3, 5, 10, 20, 50];
/** minutes between the copies taken in between (only when the period is longer) */
export const RECOVERY_QUICK = 5;

const bare = (doc: Record<string, unknown>) => { const { view: _v, mode: _m, ...rest } = doc; return rest; };

export function createRecovery(store: JsonStore, settings: () => RecoverySettings, now: () => number = Date.now) {
  // when each file last had a copy taken (any, and a period's), so a save does not read the copies back every time
  const lastTaken = new Map<string, { any: number; period: number }>();
  const times = (copies: RecoveryCopy[]) => ({ any: copies[0]?.taken ?? 0, period: copies.find((c) => !c.recent)?.taken ?? 0 });
  const list = (id: string) => {
    const copies = store.get<RecoveryCopy[]>(RECOVERY_KEY + id, []);
    return Array.isArray(copies) ? copies : [];
  };
  function put(id: string, copies: RecoveryCopy[]) {
    if (copies.length) store.set(RECOVERY_KEY + id, copies); else store.del(RECOVERY_KEY + id);
    lastTaken.set(id, times(copies));
  }
  /** the period's copies (the newest `keep`) and the copy in between, newest first */
  const kept = (copies: RecoveryCopy[], keep: number) => {
    const period = copies.filter((c) => !c.recent).slice(0, Math.max(1, keep)), recent = copies.find((c) => c.recent);
    return (recent ? [recent, ...period] : period).sort((a, b) => b.taken - a.taken);
  };
  /**
   * The file `id` is about to be overwritten; `previous` is what storage holds now (last changed at `at`).
   * Keeps it as a copy when the last period's copy is older than the period, or always with `force`. Otherwise,
   * when the period is longer than QUICK and the newest copy is QUICK old, it replaces the copy in between.
   * Returns whether a copy was taken.
   */
  function take(id: string, previous: Record<string, unknown> | null, at: number | undefined, force = false) {
    const { every, keep } = settings();
    if (!previous || (!every && !force)) return false;
    const t = now();
    let last = lastTaken.get(id);
    if (last === undefined) { last = times(list(id)); lastTaken.set(id, last); }
    const due = force || t - last.period >= every * 6e4;
    const quick = !due && every > RECOVERY_QUICK && t - last.any >= RECOVERY_QUICK * 6e4;
    if (!due && !quick) return false;
    const copies = list(id), doc = bare(previous);
    // the same content as the newest copy: nothing new to keep. When a period's copy is due, that copy counts
    // as it and the period starts again; in between, only the wait for the next check starts again.
    if (copies[0] && JSON.stringify(copies[0].doc) === JSON.stringify(doc)) {
      if (!due) { lastTaken.set(id, { ...last, any: t }); return false; }
      copies[0].taken = t; delete copies[0].recent;
      put(id, kept(copies, keep)); return false;
    }
    // a copy in between replaces the last one; a period's copy leaves it
    const rest = due ? copies : copies.filter((c) => !c.recent);
    put(id, kept([{ taken: t, at: at || t, doc, ...(due ? {} : { recent: true }) }, ...rest], keep));
    return true;
  }
  /** Drop copies beyond the number kept (after the setting is lowered). */
  function trim(ids: string[]) {
    const { keep } = settings();
    for (const id of ids) { const copies = list(id), k = kept(copies, keep); if (k.length < copies.length) put(id, k); }
  }
  function forget(id: string) { store.del(RECOVERY_KEY + id); lastTaken.delete(id); }
  function remove(id: string, taken: number) { put(id, list(id).filter(c => c.taken !== taken)); }
  /** Another tab wrote copies: the next save reads them again. */
  function stale(id: string) { lastTaken.delete(id); }
  return { list, take, trim, forget, remove, stale };
}
