/** Camera-independent construction geometry. Distances and tolerances are world units. */
export interface Box { x: number; y: number; w: number; h: number }
export interface Guide { id: string; axis: 'x' | 'y'; position: number }
export interface SnapLine { x1: number; y1: number; x2: number; y2: number; spacing?: boolean }
interface SnapValue { value: number; box: Box }
export interface SnapIndex { values: { x: SnapValue[]; y: SnapValue[] }; ordered: { x: Box[]; y: Box[] }; orderedEnd: { x: Box[]; y: Box[] }; bounds: Box | null }
export function createSnapIndex(others: Box[]): SnapIndex {
  const values = (axis: 'x' | 'y', size: 'w' | 'h') => others.flatMap(box => [box[axis],box[axis]+box[size]/2,box[axis]+box[size]].map(value=>({value,box}))).sort((a,b)=>a.value-b.value);
  let bounds: Box | null = null;
  for (const b of others) { if (!bounds) bounds={...b}; else { const x=Math.min(bounds.x,b.x), y=Math.min(bounds.y,b.y); bounds={x,y,w:Math.max(bounds.x+bounds.w,b.x+b.w)-x,h:Math.max(bounds.y+bounds.h,b.y+b.h)-y}; } }
  return { values:{x:values('x','w'),y:values('y','h')}, ordered:{x:[...others].sort((a,b)=>a.x-b.x),y:[...others].sort((a,b)=>a.y-b.y)}, orderedEnd:{x:[...others].sort((a,b)=>(a.x+a.w)-(b.x+b.w)),y:[...others].sort((a,b)=>(a.y+a.h)-(b.y+b.h))}, bounds };
}
function lowerBound(values: SnapValue[], value: number) { let lo=0,hi=values.length; while(lo<hi) { const mid=(lo+hi)>>>1; if(values[mid].value<value)lo=mid+1;else hi=mid; } return lo; }
export function snapTranslation(box: Box, dx: number, dy: number, others: Box[], guides: Guide[], tolerance: number, spacing = true, index = createSnapIndex(others)) {
  const lines: SnapLine[] = [];
  let snappedX = false, snappedY = false;
  const moved = {...box,x:box.x+dx,y:box.y+dy};
  const distance = (other: Box) => Math.hypot(Math.max(0,other.x-moved.x-moved.w,moved.x-other.x-other.w), Math.max(0,other.y-moved.y-moved.h,moved.y-other.y-other.h));
  let nearest = Infinity;
  for (const other of others) nearest = Math.min(nearest,distance(other));
  const neighbourhood = nearest + Math.max(tolerance*8,1);
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'w' : 'h', cross = axis === 'x' ? 'y' : 'x', extent = axis === 'x' ? 'h' : 'w';
    const move = axis === 'x' ? dx : dy, origin = box[axis] + move;
    const anchors = [origin, origin + box[size] / 2, origin + box[size]];
    let best = Infinity, proximity = Infinity, correction = 0, match: number | null = null, equal = false, target: Box | null = null;
    const consider = (delta: number, at: number, gap = false, near = -1, other: Box | null = null) => {
      if (near > neighbourhood) return;
      // Rank eligible targets by spatial neighbourhood before correction distance.
      // A distant, perfectly aligned object cannot steal a nearby object's snap.
      const tier = near < 0 ? -1 : Math.floor(near / Math.max(tolerance * 8,1));
      const score = Math.abs(delta) + Math.max(0,near) * .01;
      if (Math.abs(delta) <= tolerance && (tier < proximity || (tier === proximity && score < best))) { best = score; proximity = tier; correction = delta; match = at; equal = gap; target = other; }
    };
    // Explicit guides are intentional targets and take precedence over automatic suggestions.
    for (const g of guides) if (g.axis === axis) for (const a of anchors) consider(g.position - a, g.position);
    for (const a of anchors) { const values=index.values[axis]; for(let i=lowerBound(values,a-tolerance); i<values.length && values[i].value<=a+tolerance; i++) { const entry=values[i]; consider(entry.value-a,entry.value,false,distance(entry.box),entry.box); } }
    if (spacing && box[size] > 0) {
      const start = box[cross] + (axis === 'x' ? dy : dx), end = start + box[extent];
      const neighbours = index.ordered[axis].filter(o => o[cross] <= end + tolerance && o[cross] + o[extent] >= start - tolerance);
      const left = index.orderedEnd[axis].filter(o => o[cross] <= end + tolerance && o[cross] + o[extent] >= start - tolerance && o[axis]+o[size] <= origin+tolerance);
      const right = neighbours.filter(o => o[axis] >= origin + box[size] - tolerance);
      if (left.length && right.length) {
        const lo = left[left.length - 1], hi = right[0];
        const at = (lo[axis] + lo[size] + hi[axis] - box[size]) / 2;
        consider(at - origin, at, true, Math.max(distance(lo),distance(hi)), lo);
      }
      if (left.length >= 2) {
        const a = left[left.length - 2], b = left[left.length - 1], gap = b[axis] - a[axis] - a[size];
        if (gap >= 0) { const at = b[axis] + b[size] + gap; consider(at - origin, at, true, distance(b), b); }
      }
      if (right.length >= 2) {
        const a = right[0], b = right[1], gap = b[axis] - a[axis] - a[size];
        if (gap >= 0) { const at = a[axis] - gap - box[size]; consider(at - origin, at, true, distance(a), a); }
      }
    }
    if (match !== null) {
      if (axis === 'x') { dx += correction; snappedX = true; } else { dy += correction; snappedY = true; }
      const lo = Math.min(box[cross],target?.[cross] ?? box[cross]), hi = Math.max(box[cross] + box[extent],target ? target[cross]+target[extent] : box[cross]+box[extent]);
      lines.push(axis === 'x' ? { x1: match, y1: lo, x2: match, y2: hi, spacing: equal } : { x1: lo, y1: match, x2: hi, y2: match, spacing: equal });
    }
  }
  return { dx, dy, snappedX, snappedY, lines };
}
