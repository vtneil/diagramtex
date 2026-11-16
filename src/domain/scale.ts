import { runtime as TD } from '../runtime';
import type { Shape } from '../core/contracts';

// A separate field avoids colliding with source-language scale settings.
export const objectScale = (s: Shape) => typeof s.objectScale === 'number' && Number.isFinite(s.objectScale) && s.objectScale > 0 ? s.objectScale : 1;
export const canScale = (s: Shape) => !!TD.TYPES[s.type]?.objectScalable && !(s.type === 'tikz' && s.kind === 'defs');

for (const [key, t] of Object.entries<any>(TD.TYPES)) {
  // Geometry engines already expose their own source-backed Scale input.
  if (['geo2d', 'geo3d'].includes(key) || !t.svg || !t.tikz || !t.samples) continue;
  const original = { ...t };
  const raw = (s: Shape): Shape => ({ ...s, objectScale: 1 });
  const centre = (s: Shape) => {
    const b = TD.bboxOf(original.samples.call(t, raw(s)), 0);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  const point = (s: Shape, p: any, inverse = false) => {
    const c = centre(s), k = inverse ? 1 / objectScale(s) : objectScale(s);
    return { ...p, x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  };
  t.objectScalable = true;
  for (const method of ['samples', 'anchors', 'handles', 'frame']) if (original[method]) {
    t[method] = (s: Shape, ...args: any[]) => {
      if (objectScale(s) === 1) return original[method].call(t, s, ...args);
      const points = original[method].call(t, raw(s), ...args);
      const c = centre(s), k = objectScale(s);
      const scale = (x: number, y: number) => ({ x: c.x + (x - c.x) * k, y: c.y + (y - c.y) * k });
      return points.map((p: any) => {
        if (Array.isArray(p)) { const q = scale(p[0], p[1]); return [q.x, q.y]; }
        return { ...p, ...scale(p.x, p.y) };
      });
    };
  }
  if (original.setHandle) t.setHandle = (s: Shape, key: any, q: any, event: any, orig: Shape = { ...s }, start?: any) => {
    if (objectScale(orig) === 1) return original.setHandle.call(t, s, key, q, event, orig, start);
    const target = raw(s);
    original.setHandle.call(t, target, key, point(orig, q, true), event, raw(orig), start && point(orig, start, true));
    Object.assign(s, target, { objectScale: objectScale(orig) });
    // Scaling about a changing centre otherwise makes the dragged handle lag.
    const moved = original.handles?.call(t, raw(s)).find((h: any) => h.k === key);
    if (moved) {
      const at = point(s, moved);
      TD.translate(s, q.x - at.x, q.y - at.y);
    }
  };
  t.svg = (s: Shape, ctx: any) => {
    const k = objectScale(s);
    if (k === 1) return original.svg.call(t, s, ctx);
    const out = original.svg.call(t, raw(s), ctx);
    if (!out) return out;
    const c = centre(s);
    return `<g class="object-scaled" transform="translate(${TD.fmt(c.x)} ${TD.fmt(c.y)}) scale(${k}) translate(${TD.fmt(-c.x)} ${TD.fmt(-c.y)})">${out}</g>`;
  };
  t.tikz = (s: Shape, X: any) => {
    const k = objectScale(s);
    if (k === 1) return original.tikz.call(t, s, X);
    const shape = raw(s);
    // TikZ coordinate transforms leave explicit stroke widths and rounded
    // corners unchanged; scale those dimensions to match the SVG transform.
    if (typeof shape.width === 'number') shape.width *= k;
    if (typeof shape.radius === 'number') shape.radius *= k;
    const out = original.tikz.call(t, shape, X);
    if (!out) return out;
    const c = centre(s);
    return `\\begin{scope}[scale around={${k}:${X.c(c.x, c.y)}}, transform shape]\n${out}\n\\end{scope}`;
  };
}

const frame = TD.rotFrame;
TD.rotFrame = (s: Shape) => {
  if (!canScale(s) || objectScale(s) === 1) return frame(s);
  const points = frame({ ...s, objectScale: 1 });
  if (!points) return points;
  const t = TD.TYPES[s.type], b = TD.bboxOf(t.samples({ ...s, objectScale: 1 }), 0);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, k = objectScale(s);
  return points.map(([x, y]: number[]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
};

// Include scaled text labels and stroke padding in document/export bounds too.
const bbox = TD.bbox;
TD.bbox = (s: Shape) => {
  const k = objectScale(s);
  if (!canScale(s) || k === 1) return bbox(s);
  const raw = { ...s, objectScale: 1 };
  const b = bbox(raw), geometry = TD.bboxOf(TD.TYPES[s.type].samples(raw), 0);
  const cx = geometry.x + geometry.w / 2, cy = geometry.y + geometry.h / 2;
  return { x: cx + (b.x - cx) * k, y: cy + (b.y - cy) * k, w: b.w * k, h: b.h * k };
};
