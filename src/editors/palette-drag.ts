// A block editor's palette, pressed: a tap (or the keyboard's click, Enter or Space on a focused item) chooses an item;
// pressed and moved more than 4px, it is dragged, followed by the editor (move) and dropped where it is let go (drop).
// The editor draws the drag and does the drop; this only tells a tap from a drag, the same way in every editor.

export interface PaletteDrag {
  /** the item: its data-item (or what `item` reads) */
  k: string;
  x: number;
  y: number;
  moved: boolean;
  btn: HTMLElement;
}

export function paletteDrag(list: HTMLElement, h: {
  /** the items: '.qe-item' unless the palette's own */
  selector?: string;
  /** an item's name: its data-item unless the palette's own */
  item?: (b: HTMLElement) => string;
  /** whether the editor is open (a press before it is, or after, is nobody's) */
  ready?: () => boolean;
  /** a press done at once, not dragged (true when it was) */
  press?: (b: HTMLElement) => boolean;
  /** whether an item can be dragged at all (one that can't is only tapped) */
  drags?: (k: string) => boolean;
  /** the keyboard's click chooses an item too (the palette's buttons have no Enter and Space of their own) */
  keyboard?: boolean;
  /** a tap */
  pick: (k: string) => void;
  /** the drag begins: the first move past 4px */
  start?: (d: PaletteDrag) => void;
  move?: (d: PaletteDrag, e: PointerEvent) => void;
  /** let go after a drag */
  drop: (d: PaletteDrag, e: PointerEvent) => void;
  /** the browser took the pointer during a drag */
  cancel?: (d: PaletteDrag) => void;
}) {
  const sel = h.selector || '.qe-item', name = h.item || ((b: HTMLElement) => b.dataset.item!);
  const ready = () => !h.ready || h.ready();
  let d: PaletteDrag | null = null;
  const take = () => { const x = d; d = null; return x; };
  if (h.keyboard) list.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const b = (e.target as Element).closest<HTMLElement>(sel);
    if (b && !h.press?.(b)) h.pick(name(b));
  });
  list.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element).closest<HTMLElement>(sel);
    if (!b || e.button !== 0 || !ready() || h.press?.(b)) return;
    d = { k: name(b), x: e.clientX, y: e.clientY, moved: false, btn: b };
    try { b.setPointerCapture(e.pointerId); } catch { /* a pointer the browser doesn't track */ }
  });
  list.addEventListener('pointermove', (e) => {
    if (!d || !ready()) return;
    if (!d.moved) {
      if ((h.drags && !h.drags(d.k)) || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4) return;
      d.moved = true;
      h.start?.(d);
    }
    h.move?.(d, e);
  });
  list.addEventListener('pointerup', (e) => {
    if (!d || !ready()) return;
    const x = take()!;
    if (x.moved) h.drop(x, e); else h.pick(x.k);
  });
  const cancel = () => { const x = take(); if (!x) return false; if (x.moved) h.cancel?.(x); return true; };
  list.addEventListener('pointercancel', cancel);
  /** cancel(): ends a press or drag in progress (Esc), true when there was one */
  return { cancel };
}
