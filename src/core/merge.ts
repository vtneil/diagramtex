import type { Block, Shape } from './contracts';

// Two tabs on one file. This tab has changes it has not saved yet, and the other tab saved first: a three-way merge
// from what the two last shared (`base`, what this tab last read or wrote). What only one side changed comes from
// that side; where both changed the same thing, this tab's version is kept (and `clash` says so). Shapes are
// matched by id, so a shape drawn in each tab is kept from both. Blocks have no ids: they merge one by one only while
// both sides keep the same blocks in the same order; otherwise the side that changed the list wins.

/** A stored file's content, as autosave writes it (the open document's are the same fields). */
export interface FileContent { kind?: string; name: string; page?: Record<string, unknown>; blocks?: Block[]; active?: number; sheet?: { shapes?: Shape[]; [key: string]: unknown } }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function mergeFile(base: FileContent, local: FileContent, remote: FileContent): { merged: FileContent; clash: boolean } | null {
  if ((base.kind || 'classic') !== (local.kind || 'classic') || (local.kind || 'classic') !== (remote.kind || 'classic')) return null;
  let clash = false;
  // one value: the side that changed it; this tab's when both did (and differently)
  const pick = <T>(b: T, l: T, r: T): T => {
    if (same(l, b)) return r;
    if (!same(r, b) && !same(l, r)) clash = true;
    return l;
  };
  const shapes = (b: Shape[] = [], l: Shape[] = [], r: Shape[] = []): Shape[] => {
    const B = new Map(b.map(s => [s.id, s])), R = new Map(r.map(s => [s.id, s])), here = new Set(l.map(s => s.id));
    const out: Shape[] = [];
    for (const s of l) {
      const was = B.get(s.id), there = R.get(s.id);
      if (!was) out.push(s); // drawn here
      else if (!there) { if (!same(s, was)) { clash = true; out.push(s); } } // deleted there: gone, unless changed here
      else out.push(pick(was, s, there));
    }
    // drawn there (deleted here stays deleted): after the shape before it in that tab's order, so the stacking holds
    r.forEach((s, i) => {
      if (B.has(s.id) || here.has(s.id)) return;
      let at = 0;
      for (let k = i - 1; k >= 0; k--) { const j = out.findIndex(q => q.id === r[k].id); if (j >= 0) { at = j + 1; break; } }
      out.splice(at, 0, s);
    });
    return out;
  };
  const owner = <T extends { shapes?: Shape[] }>(b: T, l: T, r: T): T => {
    const rest = (o: T) => { const { shapes: _, ...x } = o; return x; };
    return { ...pick(rest(b), rest(l), rest(r)), shapes: shapes(b.shapes, l.shapes, r.shapes) } as T;
  };
  const merged: FileContent = { ...local, name: pick(base.name, local.name, remote.name), page: pick(base.page, local.page, remote.page) };
  if (local.kind === 'page') merged.sheet = owner(base.sheet || {}, local.sheet || {}, remote.sheet || {});
  else {
    const b = base.blocks || [], l = local.blocks || [], r = remote.blocks || [];
    const types = (x: Block[]) => x.map(k => k.type).join();
    if (b.length === l.length && l.length === r.length && types(b) === types(l) && types(l) === types(r))
      merged.blocks = l.map((k, i) => k.type === 'diagram' ? owner(b[i], k, r[i]) : pick(b[i], k, r[i]));
    else merged.blocks = pick(b, l, r);
  }
  return { merged, clash };
}
