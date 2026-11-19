/** Measure a menu at its natural width, constrain its scroll area, then clamp to the viewport. */
export function positionMenu(menu: HTMLElement, x: number, y: number, anchor?: DOMRect, minWidth?: number) {
  const gap = 6, width = Math.max(1,innerWidth-gap*2), height = Math.max(1,innerHeight-gap*2);
  Object.assign(menu.style,{display:'block',left:gap+'px',top:gap+'px',maxWidth:width+'px',maxHeight:height+'px',minWidth:Math.min(minWidth ?? (anchor?180:240),width)+'px'});
  const bounds={width:menu.offsetWidth,height:menu.offsetHeight}; // offset sizes: the opening animation scales the box
  if(anchor) x=anchor.right+bounds.width<=innerWidth-gap ? anchor.right : anchor.left-bounds.width;
  menu.style.left=Math.max(gap,Math.min(x,innerWidth-gap-bounds.width))+'px';
  menu.style.top=Math.max(gap,Math.min(y,innerHeight-gap-bounds.height))+'px';
}

/** A menu opened from a control: 4px below it (above when there is no room). In the right 40% of the window its right
 *  edge meets the control's and it grows left; elsewhere the left edges meet. `align: 'end'` lines up the right edges
 *  anywhere (a control at the end of a sidebar's head, its menu kept over the sidebar). */
export function positionMenuBelow(menu: HTMLElement, control: DOMRect, { align = 'auto', minWidth }: { align?: 'auto' | 'end'; minWidth?: number } = {}) {
  positionMenu(menu, control.left, control.bottom + 4, undefined, minWidth);
  const gap = 6, w = menu.offsetWidth, h = menu.offsetHeight; // offset sizes: the opening animation scales the box
  const right = align === 'end' || control.left + control.width / 2 > innerWidth * 0.6;
  const x = right ? control.right - w : control.left;
  const y = control.bottom + 4 + h <= innerHeight - gap ? control.bottom + 4 : Math.max(gap, control.top - 4 - h);
  Object.assign(menu.style, { left: Math.max(gap, Math.min(x, innerWidth - gap - w)) + 'px', top: y + 'px',
    transformOrigin: (y < control.top ? 'bottom ' : 'top ') + (right ? 'right' : 'left') });
}
