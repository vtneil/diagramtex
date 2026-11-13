export interface DocumentStore {
  readonly active: boolean;
  owns(key: string): boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  del(key: string): void;
}
export interface JsonStore {
  full: boolean;
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): boolean;
  del(key: string): void;
}
/** Preserve the IndexedDB/localStorage routing and failure semantics behind one API. */
export function createBrowserStore(database: DocumentStore | undefined, local: () => Storage) {
  const inDatabase = (key: string) => !!database?.active && database.owns(key);
  const store: JsonStore = {
    full: false,
    get<T>(key: string, fallback: T): T {
      try { const value = inDatabase(key) ? database!.get(key) : local().getItem(key); return value ? JSON.parse(value) as T : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try {
        const text = JSON.stringify(value);
        if (inDatabase(key)) database!.set(key, text); else { local().setItem(key, text); store.full = false; }
        return true;
      } catch (error: any) {
        const cause = error as { name?: string; code?: number } | null;
        store.full = !!cause && (cause.name === 'QuotaExceededError' || cause.code === 22);
        return false;
      }
    },
    del(key) { try { if (inDatabase(key)) database!.del(key); else local().removeItem(key); } catch { /* storage may be blocked */ } },
  };
  return { store, inDatabase };
}
