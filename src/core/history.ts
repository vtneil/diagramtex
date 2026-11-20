// Document transactions, independent of DOM, input devices, rendering, and persistence.
import type { HistoryState, HistoryStep, Shape, ShapeChange, ShapeOwner } from './contracts';

// One clock for every undo step in the app (each file's own, and the file list's), so undo and redo can take
// whichever of them is the latest.
let clock = 0;
export const stamp = () => ++clock;

interface Snapshot {
  owner: ShapeOwner;
  ids: string[];
  json: Map<string, string>;
  pages?: number;
  vars: string;
  name: string;
  guides: string;
  setup?: string;
}
export function createDocumentHistory(state: HistoryState, hooks: {
  syncLinks(): void;
  changed(): void;
  applied(): void;
  updateTools(): void;
}) {
  let pending = false, base: Snapshot | null = null;
  const owner = () => state.doc.kind === 'page' ? state.doc.sheet : state.doc.blocks[state.doc.active];
  const capture = (): Snapshot => ({
    owner: owner(), ids: state.doc.shapes.map(s => s.id),
    json: new Map(state.doc.shapes.map(s => [s.id, JSON.stringify(s)])),
    pages: state.doc.kind === 'page' ? state.doc.sheet.pages : undefined,
    vars: JSON.stringify(owner().vars || null),
    name: JSON.stringify(owner().name ?? null),
    guides: JSON.stringify(owner().guides || null),
    // a Page file's paper is part of its drawing: its pages stack by the paper's height
    setup: state.doc.kind === 'page' ? JSON.stringify(state.doc.page || null) : undefined,
  });
  function begin() {
    if (pending) return;
    pending = true;
    if (!base || base.owner !== owner()) base = capture();
  }
  function sameOrder(a: Snapshot, b: Snapshot) {
    let i = 0, j = 0;
    for (;;) {
      while (i < a.ids.length && !b.json.has(a.ids[i])) i++;
      while (j < b.ids.length && !a.json.has(b.ids[j])) j++;
      if (i >= a.ids.length || j >= b.ids.length) return i >= a.ids.length && j >= b.ids.length;
      if (a.ids[i++] !== b.ids[j++]) return false;
    }
  }
  function trim() {
    if (state.undo.length > 300) state.undo.shift();
    let total = state.undo.reduce((sum, step) => sum + step.size, 0);
    while (total > 40e6 && state.undo.length > 5) total -= state.undo.shift()!.size;
  }
  function commit() {
    if (!pending) return;
    pending = false;
    hooks.syncLinks();
    const previous = base!;
    const now = capture(), before: ShapeChange[] = [], after: ShapeChange[] = [];
    const positions = new Map(previous.ids.map((id, i) => [id, i]));
    now.ids.forEach((id, i) => {
      const json = now.json.get(id)!, old = previous.json.get(id);
      if (old !== json) {
        after.push([id, json, i]);
        if (old !== undefined) before.push([id, old, positions.get(id)!]);
      }
    });
    for (const [id, old] of previous.json) if (!now.json.has(id)) before.push([id, old, positions.get(id)!]);
    const moved = !sameOrder(previous, now);
    if (before.length || after.length || moved || now.pages !== previous.pages || now.vars !== previous.vars || now.name !== previous.name || now.guides !== previous.guides || now.setup !== previous.setup) {
      const step: HistoryStep = { before, after, size: 64, t: stamp() };
      if (moved) { step.ib = previous.ids; step.ia = now.ids; step.size += 12 * (previous.ids.length + now.ids.length); }
      if (now.pages !== previous.pages) { step.pb = previous.pages; step.pa = now.pages; }
      if (now.vars !== previous.vars) { step.vb = previous.vars; step.va = now.vars; }
      if (now.name !== previous.name) { step.nb = previous.name; step.na = now.name; step.size += previous.name.length + now.name.length; }
      if (now.guides !== previous.guides) { step.gb = previous.guides; step.ga = now.guides; step.size += previous.guides.length + now.guides.length; }
      if (now.setup !== previous.setup) { step.sb = previous.setup; step.sa = now.setup; step.size += (previous.setup || '').length + (now.setup || '').length; }
      for (const entry of [...before, ...after]) step.size += entry[1].length;
      state.undo.push(step); trim(); state.redo = [];
      hooks.changed();
    }
    base = now;
    hooks.updateTools();
  }
  function apply(step: HistoryStep, back: boolean) {
    const to = back ? step.before : step.after, from = back ? step.after : step.before;
    const order = back ? step.ib : step.ia;
    const toMap = new Map(to.map(e => [e[0], e[1]])), fromIds = new Set(from.map(e => e[0]));
    let list: Shape[];
    if (order) {
      const current = new Map(state.doc.shapes.map(s => [s.id, s]));
      list = order.map(id => toMap.has(id) ? JSON.parse(toMap.get(id)!) as Shape : current.get(id))
        .filter((s): s is Shape => !!s);
    } else {
      const kept: Shape[] = [];
      for (const shape of state.doc.shapes) {
        if (toMap.has(shape.id)) kept.push(JSON.parse(toMap.get(shape.id)!));
        else if (!fromIds.has(shape.id)) kept.push(shape);
      }
      const inserted = to.filter(e => !fromIds.has(e[0])).sort((a, b) => a[2] - b[2]);
      list = []; let k = 0;
      for (const shape of kept) {
        while (k < inserted.length && inserted[k][2] <= list.length) list.push(JSON.parse(inserted[k++][1]));
        list.push(shape);
      }
      while (k < inserted.length) list.push(JSON.parse(inserted[k++][1]));
    }
    state.doc.shapes = list;
    const pages = back ? step.pb : step.pa, vars = back ? step.vb : step.va;
    if (pages !== undefined) state.doc.sheet.pages = pages;
    if (vars !== undefined) { const value = JSON.parse(vars); if (value) owner().vars = value; else delete owner().vars; }
    const name = back ? step.nb : step.na;
    if (name !== undefined) { const value = JSON.parse(name); if (value === null) delete owner().name; else owner().name = value; }
    const guides = back ? step.gb : step.ga;
    if (guides !== undefined) { const value = JSON.parse(guides); if (value) owner().guides = value; else delete owner().guides; }
    const setup = back ? step.sb : step.sa;
    if (setup !== undefined) state.doc.page = JSON.parse(setup) || {};
    if (base && base.owner === owner()) {
      for (const id of fromIds) if (!toMap.has(id)) base.json.delete(id);
      for (const [id, json] of toMap) base.json.set(id, json);
      base.ids = list.map(s => s.id);
      if (pages !== undefined) base.pages = pages;
      if (vars !== undefined) base.vars = vars;
      if (name !== undefined) base.name = name;
      if (guides !== undefined) base.guides = guides;
      if (setup !== undefined) base.setup = setup;
    } else base = null;
    const ids = new Set(list.map(s => s.id));
    for (const id of state.sel) if (!ids.has(id)) state.sel.delete(id);
    hooks.applied();
  }
  return { begin, commit, apply, trim,
    reset: () => { base = null; },
    cancel: () => { pending = false; },
  };
}
