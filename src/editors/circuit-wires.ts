import { isCrossing } from '../domain/circuit-crossings';
type Point = number[];
const EPS = 1e-3;
export function projectOnWire(p: Point, wire: any): Point {
  const dx = wire.b[0] - wire.a[0], dy = wire.b[1] - wire.a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - wire.a[0]) * dx + (p[1] - wire.a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return [wire.a[0] + t * dx, wire.a[1] + t * dy];
}
export function onWire(p: Point, wire: any): boolean {
  const q = projectOnWire(p, wire);
  return Math.hypot(q[0] - p[0], q[1] - p[1]) < EPS;
}
// Code roundtrips split runs at crossing terminals. Opposite terminals are
// connected internally, while the two directions remain electrically separate.
function throughCrossing(a: any, b: any, nodes: any[]): boolean {
  for (const node of nodes) {
    const angle = (node.rot || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const local = (p: Point) => { const x = p[0] - node.p[0], y = p[1] - node.p[1]; return [x * c + y * s, -x * s + y * c]; };
    for (const p of [a.a, a.b].map(local)) for (const q of [b.a, b.b].map(local)) {
      for (const axis of [0, 1]) {
        const other = 1 - axis;
        if (Math.abs(p[other]) < EPS && Math.abs(q[other]) < EPS && p[axis] * q[axis] < 0 && Math.abs(Math.abs(p[axis]) - .14) < EPS && Math.abs(Math.abs(q[axis]) - .14) < EPS) return true;
      }
    }
  }
  return false;
}
// Endpoints and explicit junction nodes connect. A bare crossing does not.
export function connectedWires(items: any[], seeds: Set<string>): Set<string> {
  const crossings = items.filter(isCrossing);
  const ids = new Set(seeds), wires = items.filter(it => it.part === 'short');
  const dots = items.filter(it => (it.part === 'circ' || it.part === 'ocirc') && it.p);
  let changed = true;
  while (changed) {
    changed = false;
    const active = wires.filter(it => ids.has(it.id)), nodes = dots.filter(it => ids.has(it.id));
    for (const wire of wires) {
      if (ids.has(wire.id)) continue;
      if (active.some(other => onWire(wire.a, other) || onWire(wire.b, other) || onWire(other.a, wire) || onWire(other.b, wire) || throughCrossing(wire, other, crossings)) || nodes.some(dot => onWire(dot.p, wire))) {
        ids.add(wire.id); changed = true;
      }
    }
    for (const dot of dots) if (!ids.has(dot.id) && wires.some(w => ids.has(w.id) && onWire(dot.p, w))) { ids.add(dot.id); changed = true; }
  }
  return ids;
}
export function wireJunctions(items: any[]): { p: Point; id: string }[] {
  const wires = items.filter(it => it.part === 'short'), result: { p: Point; id: string }[] = [];
  for (const wire of wires) for (const p of [wire.a, wire.b]) {
    if (result.some(j => Math.hypot(j.p[0] - p[0], j.p[1] - p[1]) < EPS)) continue;
    let degree = 0;
    for (const other of wires) if (onWire(p, other)) {
      const atEnd = [other.a, other.b].some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < EPS);
      degree += atEnd ? 1 : 2;
    }
    if (degree >= 3) result.push({ p, id: wire.id });
  }
  return result;
}
