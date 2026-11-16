/** Measure a menu at its natural width, constrain its scroll area, then clamp to the viewport. */
export function positionMenu(menu: HTMLElement, x: number, y: number, anchor?: DOMRect) {
  const gap = 6, width = Math.max(1,innerWidth-gap*2), height = Math.max(1,innerHeight-gap*2);
  Object.assign(menu.style,{display:'block',left:gap+'px',top:gap+'px',maxWidth:width+'px',maxHeight:height+'px',minWidth:Math.min(anchor?180:240,width)+'px'});
  const bounds=menu.getBoundingClientRect();
  if(anchor) x=anchor.right+bounds.width<=innerWidth-gap ? anchor.right : anchor.left-bounds.width;
  menu.style.left=Math.max(gap,Math.min(x,innerWidth-gap-bounds.width))+'px';
  menu.style.top=Math.max(gap,Math.min(y,innerHeight-gap-bounds.height))+'px';
}
