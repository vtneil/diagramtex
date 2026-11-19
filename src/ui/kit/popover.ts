// Where a popover goes. `below` (a control's panel: Export, dash and width): 6px under the control, above it when
// there is no room; in the right 40% of the window it lines up with the control's right edge and grows left,
// elsewhere their left edges meet. `beside` (a tool group's flyout): 6px to the right of the control (left when
// there is no room), its top `inset` above the control's so the first row lines up with it. Always 8px inside the
// window, and in the page's own pixels when the interface is zoomed (body zoom).
export type PopoverPlacement = 'below' | 'beside';

export const pageZoom = () => (typeof document === 'undefined' ? 1 : parseFloat(getComputedStyle(document.body).zoom) || 1);

/** Places `el` (position: fixed) by `anchor`; returns the corner it grows from, for its transform-origin. */
export function placePopover(el: HTMLElement, anchor: Element | DOMRect, placement: PopoverPlacement = 'below', inset = 0): string {
  const z = pageZoom(), a = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  const r = { left: a.left / z, right: a.right / z, top: a.top / z, bottom: a.bottom / z };
  const W = innerWidth / z, H = innerHeight / z, w = el.offsetWidth, h = el.offsetHeight, gap = 6, edge = 8;
  const clampX = (x: number) => Math.max(edge, Math.min(x, W - w - edge)), clampY = (y: number) => Math.max(edge, Math.min(y, H - h - edge));
  if (placement === 'beside') {
    const left = r.right + gap + w <= W - edge;
    el.style.left = clampX(left ? r.right + gap : r.left - gap - w) + 'px';
    el.style.top = clampY(r.top - inset) + 'px';
    return 'top ' + (left ? 'left' : 'right');
  }
  const up = r.bottom + gap + h > H - edge && r.top - gap - h >= edge;
  const right = (r.left + r.right) / 2 > W * 0.6;
  el.style.left = clampX(right ? r.right - w : r.left) + 'px';
  el.style.top = clampY(up ? r.top - gap - h : r.bottom + gap) + 'px';
  return (up ? 'bottom ' : 'top ') + (right ? 'right' : 'left');
}
