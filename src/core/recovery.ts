// Version history: earlier states of a file. Autosave takes copies on its own: while a file is being changed,
// the state it had before the change is kept, at most once per period, and only the newest few are kept. Between
// them, one more copy (`recent`) follows the edits every QUICK minutes, so a recent state is never a whole period
// away: `keep` + 1 automatic copies at most. A copy the person names (a saved version) is kept until they delete
// it, and does not count towards `keep`. No DOM; copies go through a CopyStore.
import type { JsonStore } from '../platform/browser-store';

export interface RecoveryCopy {
  /** when the copy was taken (with the file, what identifies it) */
  taken: number;
  /** when the file last had this content (what the list shows) */
  at: number;
  /** the stored file, without its view */
  doc: Record<string, unknown>;
  /** the one copy taken between periods; the next one taken between periods replaces it */
  recent?: boolean;
  /** a saved version: named by the person, kept until they delete it */
  name?: string;
}
export interface RecoverySettings {
  /** minutes between copies; 0 turns copies off */
  every: number;
  /** how many automatic copies are kept per file */
  keep: number;
}
/** Where a file's copies are kept: IndexedDB, one record per copy (src/platform/storage.ts), or without it one
 *  array per file in localStorage (arrayCopies). `list` is newest first. */
export interface CopyStore {
  list(id: string): RecoveryCopy[];
  put(id: string, copy: RecoveryCopy): void;
  del(id: string, taken: number): void;
  clear(id: string): void;
}
export const RECOVERY_KEY = 'diagramtex.rec.';
export const RECOVERY_DEFAULTS: RecoverySettings = { every: 10, keep: 3 };
export const RECOVERY_EVERY = [0, 1, 5, 10, 30, 60];
export const RECOVERY_KEEP = [3, 5, 10, 20, 50];
/** minutes between the copies taken in between (only when the period is longer) */
export const RECOVERY_QUICK = 5;

const bare = (doc: Record<string, unknown>) => { const { view: _v, mode: _m, ...rest } = doc; return rest; };
const newestFirst = (a: RecoveryCopy, b: RecoveryCopy) => b.taken - a.taken;

/** Copies as one array per file in a JSON store (localStorage when IndexedDB is unavailable; before version 2 of
 *  the database, the IndexedDB layout too). */
export function arrayCopies(store: JsonStore): CopyStore {
  const list = (id: string) => {
    const copies = store.get<RecoveryCopy[]>(RECOVERY_KEY + id, []);
    return Array.isArray(copies) ? copies.sort(newestFirst) : [];
  };
  const save = (id: string, copies: RecoveryCopy[]) => { if (copies.length) store.set(RECOVERY_KEY + id, copies); else store.del(RECOVERY_KEY + id); };
  return {
    list,
    put(id, copy) { save(id, [copy, ...list(id).filter((c) => c.taken !== copy.taken)].sort(newestFirst)); },
    del(id, taken) { save(id, list(id).filter((c) => c.taken !== taken)); },
    clear(id) { store.del(RECOVERY_KEY + id); },
  };
}

export function createRecovery(copies: CopyStore, settings: () => RecoverySettings, now: () => number = Date.now) {
  // when each file last had a copy taken (any, and a period's), so a save does not read the copies back every time
  const lastTaken = new Map<string, { any: number; period: number }>();
  const auto = (c: RecoveryCopy) => !c.name;
  // A copy is identified by the file and the time it was taken, so no two copies get the same time: each is later
  // than the last this tab took and than the file's newest.
  let lastStamp = 0;
  const stamp = (list: RecoveryCopy[]) => (lastStamp = Math.max(now(), lastStamp + 1, (list[0]?.taken ?? 0) + 1));
  const times = (list: RecoveryCopy[]) => {
    const a = list.filter(auto);
    return { any: a[0]?.taken ?? 0, period: a.find((c) => !c.recent)?.taken ?? 0 };
  };
  const list = (id: string) => copies.list(id);
  /** Write `next` (the copies to keep) over `before`: only what changed is written or deleted. */
  function put(id: string, before: RecoveryCopy[], next: RecoveryCopy[]) {
    const keep = new Set(next.map((c) => c.taken)), had = new Map(before.map((c) => [c.taken, c]));
    for (const c of before) if (!keep.has(c.taken)) copies.del(id, c.taken);
    for (const c of next) if (had.get(c.taken) !== c) copies.put(id, c);
    lastTaken.set(id, times(next));
  }
  /** Saved versions, the period's copies (the newest `keep`) and the copy in between, newest first. */
  const kept = (list: RecoveryCopy[], keep: number) => {
    const a = list.filter(auto), period = a.filter((c) => !c.recent).slice(0, Math.max(1, keep)), recent = a.find((c) => c.recent);
    return [...list.filter((c) => !auto(c)), ...period, ...(recent ? [recent] : [])].sort(newestFirst);
  };
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(a) === JSON.stringify(b);
  /**
   * The file `id` is about to be overwritten; `previous` is what storage holds now (last changed at `at`).
   * Keeps it as a copy when the last period's copy is older than the period, or always with `force`. Otherwise,
   * when the period is longer than QUICK and the newest copy is QUICK old, it replaces the copy in between.
   * Returns whether a copy was taken.
   */
  function take(id: string, previous: Record<string, unknown> | null, at: number | undefined, force = false) {
    const { every, keep } = settings();
    if (!previous || (!every && !force)) return false;
    const t = Math.max(now(), lastStamp); // never before a copy this tab already took
    let last = lastTaken.get(id);
    if (last === undefined) { last = times(list(id)); lastTaken.set(id, last); }
    const due = force || t - last.period >= every * 6e4;
    const quick = !due && every > RECOVERY_QUICK && t - last.any >= RECOVERY_QUICK * 6e4;
    if (!due && !quick) return false;
    const before = list(id), doc = bare(previous), newest = before[0];
    // the same content as the newest copy: nothing new to keep. When a period's copy is due, that copy counts
    // as it and the period starts again (a saved version stays as it is); in between, only the wait starts again.
    if (newest && same(newest.doc, doc)) {
      if (!due || !auto(newest)) { lastTaken.set(id, { ...last, any: t, ...(due ? { period: t } : {}) }); return false; }
      const { recent: _r, ...rest } = newest;
      put(id, before, kept([{ ...rest, taken: stamp(before) }, ...before.slice(1)], keep)); return false;
    }
    // a copy in between replaces the last one; a period's copy leaves it
    const rest = due ? before : before.filter((c) => !auto(c) || !c.recent);
    const taken = stamp(before);
    put(id, before, kept([{ taken, at: at || taken, doc, ...(due ? {} : { recent: true }) }, ...rest], keep));
    return true;
  }
  /**
   * Keep `current` (what storage holds for the file, last changed at `at`) as a saved version named `name`. When
   * the newest copy already holds it, that copy is named instead of adding another. Returns the version.
   */
  function save(id: string, current: Record<string, unknown>, at: number | undefined, name: string) {
    const before = list(id), doc = bare(current), newest = before[0];
    let copy: RecoveryCopy;
    if (newest && same(newest.doc, doc)) { const { recent: _r, ...rest } = newest; copy = { ...rest, name }; }
    else { const taken = stamp(before); copy = { taken, at: at || taken, doc, name }; }
    put(id, before, [copy, ...before.filter((c) => c.taken !== copy.taken)].sort(newestFirst));
    return copy;
  }
  /** Name a copy (it becomes a saved version), rename a version, or with an empty name make it an automatic copy
   *  again (which the next trim may drop). */
  function rename(id: string, taken: number, name: string) {
    const before = list(id), c = before.find((x) => x.taken === taken);
    if (!c) return;
    const { name: _n, recent: _r, ...rest } = c, next: RecoveryCopy = name.trim() ? { ...rest, name: name.trim() } : rest;
    put(id, before, before.map((x) => (x === c ? next : x)));
  }
  /** Drop automatic copies beyond the number kept (after the setting is lowered). */
  function trim(ids: string[]) {
    const { keep } = settings();
    for (const id of ids) { const before = list(id), k = kept(before, keep); if (k.length < before.length) put(id, before, k); }
  }
  function forget(id: string) { copies.clear(id); lastTaken.delete(id); }
  function remove(id: string, taken: number) { const before = list(id); put(id, before, before.filter((c) => c.taken !== taken)); }
  /** Another tab wrote copies: the next save reads them again. */
  function stale(id: string) { lastTaken.delete(id); }
  /** Replace every copy of a file (tests, to move copies back in time). */
  function replace(id: string, next: RecoveryCopy[]) { put(id, list(id), [...next].sort(newestFirst)); }
  return { list, take, save, rename, trim, forget, remove, stale, replace };
}
