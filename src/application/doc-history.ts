import { stamp } from '../core/history';

// Undo for a Classic document's page: its blocks (added, moved, deleted, edited) and its page setup.
// A step keeps only the blocks it changed, each as JSON, with the block order before and after, so undoing it
// leaves alone what changed elsewhere (a diagram edited on the canvas has that diagram's own undo).
// Blocks are known by identity (a key per block object); a block put back from JSON keeps its key.
//
// `edit`: the step typed into one block (text, a table cell, an image's width). Typing in the same place
// within a second joins the last step, and undo puts the caret back where it was.

export interface DocEdit { key: number; typing?: boolean; caret?: number | null; before?: number | null; cell?: [number, number] }
interface Step {
  order0: number[]; order1: number[];
  b0: Map<number, string>; b1: Map<number, string>;
  p0?: string; p1?: string;
  t: number; r?: number; at: number;
  edit?: DocEdit;
}
interface Doc { blocks: any[]; page: any; active: number }

export function createDocHistory() {
  let doc: Doc | null = null;
  const keys = new WeakMap<object, number>();
  let next = 1;
  let base = new Map<number, string>(), order: number[] = [], page = '';
  let undo: Step[] = [], redo: Step[] = [];
  const carets = new Map<number, number | null>(); // where the caret was after each block's last edit
  const keyOf = (b: object) => { let k = keys.get(b); if (!k) { k = next++; keys.set(b, k); } return k; };

  // Take what the document is now as the starting point, without a step (an edit elsewhere, or a new file).
  function sync(d: Doc) {
    if (d !== doc) { doc = d; undo = []; redo = []; carets.clear(); }
    base = new Map();
    order = d.blocks.map((b) => { const k = keyOf(b); base.set(k, JSON.stringify(b)); return k; });
    page = JSON.stringify(d.page);
  }
  function trim() {
    if (undo.length > 200) undo.shift();
    let total = 0;
    for (const s of undo) for (const m of [s.b0, s.b1]) for (const j of m.values()) total += j.length;
    while (total > 40e6 && undo.length > 5) { const s = undo.shift()!; for (const m of [s.b0, s.b1]) for (const j of m.values()) total -= j.length; }
  }

  // After a change: one step for what differs from the last state. `dirty`: the only blocks that may have
  // changed (their indices), so typing doesn't write every block again; null compares them all.
  function record(d: Doc, dirty: number[] | null, edit?: { index: number; typing?: boolean; caret?: number | null; cell?: [number, number] }) {
    if (d !== doc) { sync(d); return false; }
    const now = new Map<number, string>(), nowOrder = d.blocks.map(keyOf);
    const b0 = new Map<number, string>(), b1 = new Map<number, string>();
    d.blocks.forEach((b, i) => {
      const k = nowOrder[i], was = base.get(k);
      const j = dirty && was !== undefined && !dirty.includes(i) ? was : JSON.stringify(b);
      now.set(k, j);
      if (was !== j) { if (was !== undefined) b0.set(k, was); b1.set(k, j); }
    });
    for (const [k, j] of base) if (!now.has(k)) b0.set(k, j);
    const p = JSON.stringify(d.page);
    const moved = nowOrder.length !== order.length || nowOrder.some((k, i) => k !== order[i]);
    if (!b0.size && !b1.size && !moved && p === page) return false;
    const key = edit ? nowOrder[edit.index] : 0;
    const e: DocEdit | undefined = edit && key ? { key, typing: edit.typing, caret: edit.caret, before: carets.has(key) ? carets.get(key) : null, cell: edit.cell } : undefined;
    if (e) carets.set(key, edit!.caret ?? null);
    const last = undo[undo.length - 1];
    if (e && e.typing && last?.edit?.typing && last.edit.key === key && !redo.length && Date.now() - last.at < 1000 && !moved && p === page
      && [...b1.keys()].every((k) => last.b1.has(k)) && String(last.edit.cell) === String(e.cell)) {
      for (const [k, j] of b1) last.b1.set(k, j);
      last.edit = { ...e, before: last.edit.before };
      last.at = Date.now();
    } else {
      undo.push({ order0: order, order1: nowOrder, b0, b1, p0: p !== page ? page : undefined, p1: p !== page ? p : undefined,
        t: stamp(), at: Date.now(), edit: e });
      redo = [];
      trim();
    }
    base = now; order = nowOrder; page = p;
    return true;
  }
  // a step with no typing after it: what is typed next starts a new one
  function cut() { const last = undo[undo.length - 1]; if (last) last.at = 0; }

  function apply(s: Step, back: boolean) {
    const d = doc!;
    const ord = back ? s.order0 : s.order1, js = back ? s.b0 : s.b1;
    const cur = new Map(d.blocks.map((b) => [keyOf(b), b])), act = d.blocks[d.active];
    const blocks: any[] = [];
    for (const k of ord) {
      if (js.has(k)) { const o = JSON.parse(js.get(k)!); keys.set(o, k); blocks.push(o); }
      else if (cur.has(k)) blocks.push(cur.get(k));
    }
    d.blocks = blocks;
    const p = back ? s.p0 : s.p1;
    if (p !== undefined) d.page = JSON.parse(p);
    // the open diagram stays open when it is still there
    const ai = blocks.indexOf(act);
    d.active = ai >= 0 && blocks[ai].type === 'diagram' ? ai : Math.max(0, blocks.findIndex((b) => b.type === 'diagram'));
    base = new Map(blocks.map((b) => { const k = keyOf(b); return [k, js.get(k) ?? base.get(k) ?? JSON.stringify(b)]; }));
    order = blocks.map(keyOf);
    if (p !== undefined) page = p;
    if (s.edit) carets.set(s.edit.key, back ? s.edit.before ?? null : s.edit.caret ?? null);
  }
  function step(back: boolean): Step | null {
    const s = (back ? undo : redo).pop();
    if (!s) return null;
    if (back) { s.r = stamp(); redo.push(s); } else { s.t = stamp(); undo.push(s); }
    s.at = 0;
    apply(s, back);
    return s;
  }
  return {
    sync, record, cut, keyOf,
    undo: () => step(true), redo: () => step(false),
    // when the last step was done or undone: undo and redo take turns with the file list's by these
    lastDone: () => undo[undo.length - 1]?.t || 0,
    lastUndone: () => redo[redo.length - 1]?.r || 0,
    owns: (d: Doc) => d === doc,
  };
}
