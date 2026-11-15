export const isCrossing = (it: any) => ['wires:jump-crossing', 'wires:plain-crossing'].includes(it.part) && !!it.p;
// Render/export the same gaps around the four terminals of a crossing symbol.
export function crossingSections(wire: any, items: any[]): number[][][] {
  const dx = wire.b[0] - wire.a[0], dy = wire.b[1] - wire.a[1], length = Math.hypot(dx, dy);
  if (!length) return [[wire.a, wire.b]];
  const ux = dx / length, uy = dy / length, cuts: number[][] = [];
  for (const node of items.filter(isCrossing)) {
    const a = (node.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (Math.min(Math.abs(ux * c + uy * s), Math.abs(-ux * s + uy * c)) > 1e-3) continue;
    const x = node.p[0] - wire.a[0], y = node.p[1] - wire.a[1], t = x * ux + y * uy;
    if (Math.abs(x * uy - y * ux) > 1e-3 || t <= 0 || t >= length) continue;
    cuts.push([Math.max(0, t - .14), Math.min(length, t + .14)]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const point = (t: number) => [Math.round((wire.a[0] + ux * t) * 1e6) / 1e6, Math.round((wire.a[1] + uy * t) * 1e6) / 1e6];
  const result: number[][][] = []; let start = 0;
  for (const [from, to] of cuts) { if (from > start) result.push([point(start), point(from)]); start = Math.max(start, to); }
  if (start < length) result.push([point(start), point(length)]);
  return result;
}
export function wireIntersections(items: any[]): number[][] {
  const wires = items.filter(it => it.part === 'short'), out: number[][] = [];
  for (let i = 0; i < wires.length; i++) for (let j = i + 1; j < wires.length; j++) {
    const a = wires[i], b = wires[j], u = [a.b[0] - a.a[0], a.b[1] - a.a[1]], v = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
    const det = u[0] * v[1] - u[1] * v[0]; if (Math.abs(det) < 1e-9) continue;
    if (Math.abs(u[0] * v[0] + u[1] * v[1]) > 1e-6) continue;
    const q = [b.a[0] - a.a[0], b.a[1] - a.a[1]], t = (q[0] * v[1] - q[1] * v[0]) / det, s = (q[0] * u[1] - q[1] * u[0]) / det;
    if (t <= 1e-6 || t >= 1 - 1e-6 || s <= 1e-6 || s >= 1 - 1e-6) continue;
    const p = [a.a[0] + t * u[0], a.a[1] + t * u[1]];
    if (!out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3)) out.push(p);
  }
  return out;
}
