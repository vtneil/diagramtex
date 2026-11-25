import { runtime as TD } from '../runtime';
// Drop shadows for closed shapes: rectangles, ellipses, closed polylines and curves, Combine's regions, boxed text,
// images and the library's closed symbols (basic shapes, flowchart symbols, block arrows: every symbol that takes a fill).
// A shape with `shadow: true` casts its own outline, filled black at `shadowOpacity` (0.35 by default) and moved
// `shadowOffset` px (4 by default) right and down the page. A negative offset casts it up and to the left.
// The export is TikZ's drop shadow (the shadows library), which moves the shadow with `transform canvas`: along the
// page, not the shape, so a rotated shape's shadow still falls down and to the right. The canvas draws the same thing:
// the outline turned with the shape, then moved along the page.
// Each type says what casts the shadow with `shadowShape(s)`: SVG markup of the outline in the shape's own (unrotated)
// frame, without a fill (the shadow sets it). A symbol's, a polyline's or a region's outline is already turned (its
// points carry the rotation), so it is only moved.
(function () {
  'use strict';
  const T = TD.TYPES;
  const DEF = { offset: 4, opacity: 0.35 };
  TD.SHADOW = DEF;
  const TYPES = ['rect', 'ellipse', 'poly', 'region', 'text', 'image', 'sym'];
  TD.SHADOW_TYPES = new Set(TYPES);
  TD.SHADOW_KEYS = ['shadow', 'shadowOffset', 'shadowOpacity'];
  /** whether this shape can cast a shadow (text only in a box; a polyline or symbol only a closed one) */
  TD.canShadow = (s: any) => !!s && TD.SHADOW_TYPES.has(s.type) && (s.type === 'text' ? !!s.boxed : s.type === 'sym' ? !!TD.SYMS?.[s.kind]?.fill : s.type === 'poly' ? !!s.closed : true);
  const casts = (s: any) => !!s.shadow && TD.canShadow(s);
  const offset = (s: any) => (Number.isFinite(+s.shadowOffset) ? +s.shadowOffset : DEF.offset);
  const alpha = (s: any) => Math.max(0, Math.min(1, Number.isFinite(+s.shadowOpacity) ? +s.shadowOpacity : DEF.opacity));
  // a translucent rectangle, ellipse, polyline or region fades as one group in TikZ (shapeCode in shapes.ts), its shadow with it
  const GROUPED = new Set(['rect', 'ellipse', 'poly', 'region']);

  /** the TikZ options for the shape's shadow, if it casts one: drop shadow={…}, with the shadows library. `evenOdd`:
   * the path has holes (even odd rule), which the shadow's own fill must keep too, or it fills them */
  TD.shadowTikz = function (s: any, X: any, evenOdd = false): string[] {
    if (!casts(s)) return [];
    X.libs.add('shadows');
    const d = offset(s);
    return [`drop shadow={shadow xshift=${X.pt(d)}, shadow yshift=${X.pt(-d)}, opacity=${TD.fmt(alpha(s))}, fill=black${evenOdd ? ', even odd rule' : ''}}`];
  };

  // the outline, turned with the shape about its box's centre, moved along the page, filled black
  function shadowSvg(t: any, s: any) {
    if (!casts(s) || !t.shadowShape) return '';
    const shape = t.shadowShape(s);
    if (!shape) return '';
    const d = offset(s), op = alpha(s) * (GROUPED.has(s.type) && s.opacity != null && s.opacity < 1 ? s.opacity : 1);
    let tf = d ? `translate(${TD.fmt(d)} ${TD.fmt(d)})` : '';
    if (s.angle && t._samples) {
      const b = TD.bboxOf(t._samples(s), 0);
      tf += `${tf ? ' ' : ''}rotate(${TD.fmt(-s.angle)} ${TD.fmt(b.x + b.w / 2)} ${TD.fmt(b.y + b.h / 2)})`;
    }
    return `<g class="shadow"${tf ? ` transform="${tf}"` : ''} fill="#000000" stroke="none" opacity="${TD.fmt(op)}" pointer-events="none">${shape}</g>`;
  }
  TD.shadowSvg = (s: any) => shadowSvg(T[s.type], s);

  for (const k of TYPES) {
    const t = T[k];
    if (!t || t._shadowed) continue;
    const svg = t.svg;
    t._shadowed = true;
    t.svg = (s: any, ctx: any) => shadowSvg(t, s) + svg(s, ctx);
  }
})();
