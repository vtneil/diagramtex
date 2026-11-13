import { runtime as TD } from '../runtime';
// Free rotation for every shape.
// Box-like shapes (rectangle, ellipse, text, image) keep an `angle` (degrees, counter-clockwise, like
// symbols) about the centre of their unrotated box; point-based shapes (lines, curves, polylines,
// regions, arcs, springs) are rotated by moving their points. TD.rotateShape does either.
(function () {
  'use strict';
  const T = TD.TYPES;
  const RAD = Math.PI / 180;
  const ANG = ['rect', 'ellipse', 'text', 'image'];
  TD.ROT_TYPES = new Set(ANG);
  const normDeg = (d: any) => { d = ((d % 360) + 360) % 360; if (d > 180) d -= 360; return Math.round(d * 100) / 100; };
  TD.normDeg = normDeg;

  const rawBox = (t: any, s: any) => TD.bboxOf(t._samples(s), 0);
  // screen rotation by `th` radians (clockwise on screen, y down) about (cx, cy)
  const rotAbout = (cx: any, cy: any, th: any) => { const c = Math.cos(th), n = Math.sin(th); return (x: any, y: any) => { const dx = x - cx, dy = y - cy; return [cx + c * dx - n * dy, cy + n * dx + c * dy]; }; };

  // rotation of a box-like shape: (x, y) in its own frame → screen
  TD.rotOf = function (s: any) {
    const t = T[s.type];
    if (!s.angle || !t || !t._samples) return (x: any, y: any) => [x, y];
    const b = rawBox(t, s);
    return rotAbout(b.x + b.w / 2, b.y + b.h / 2, -s.angle * RAD);
  };
  const rotInv = (s: any) => {
    const t = T[s.type], b = rawBox(t, s);
    return rotAbout(b.x + b.w / 2, b.y + b.h / 2, s.angle * RAD);
  };
  // the shape's own box corners on screen (rotated): nw, ne, se, sw
  TD.rotFrame = function (s: any) {
    const t = T[s.type];
    if (s.type === 'sym') {
      const f = TD.symXf(s);
      return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map(([x, y]) => f(x, y));
    }
    if (t.frame) return t.frame(s);
    if (!t._samples) return null;
    const b = rawBox(t, s), f = TD.rotOf(s);
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => f(x, y));
  };

  for (const k of ANG) {
    const t = T[k];
    if (!t || t._samples) continue;
    const o = { samples: t.samples, handles: t.handles, setHandle: t.setHandle, anchors: t.anchors, svg: t.svg, tikz: t.tikz };
    t._samples = o.samples;
    t.samples = (s: any) => {
      if (!s.angle) return o.samples(s);
      if (k === 'ellipse') { // exact extent of a rotated ellipse
        const a = s.angle * RAD, c = Math.cos(a), n = Math.sin(a);
        const hw = Math.hypot(s.rx * c, s.ry * n), hh = Math.hypot(s.rx * n, s.ry * c);
        return [{ x: s.cx - hw, y: s.cy - hh }, { x: s.cx + hw, y: s.cy + hh }];
      }
      const b = rawBox(t, s), f = TD.rotOf(s);
      return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => { const [X, Y] = f(x, y); return { x: X, y: Y }; });
    };
    if (o.handles) {
      t.handles = (s: any) => {
        const H = o.handles(s);
        if (!s.angle) return H;
        const f = TD.rotOf(s);
        return H.map((h: any) => { const [x, y] = f(h.x, h.y); return { ...h, x, y }; });
      };
    }
    if (o.anchors) {
      t.anchors = (s: any) => {
        const A = o.anchors(s);
        if (!s.angle) return A;
        const f = TD.rotOf(s);
        return A.map((a: any) => { const [x, y] = f(a.x, a.y); return { ...a, x, y }; });
      };
    }
    if (o.setHandle) {
      // resize in the shape's own frame, then shift so the point opposite the dragged handle stays put
      t.setHandle = (s: any, key: any, q: any, e: any, orig: any) => {
        if (!orig.angle) return o.setHandle(s, key, q, e, orig);
        const [lx, ly] = rotInv(orig)(q.x, q.y);
        const h0 = o.handles(orig).find((h: any) => h.k === key), b0 = rawBox(t, orig);
        o.setHandle(s, key, { ...q, x: lx, y: ly }, e, orig);
        if (!h0) return;
        // the point opposite the handle stays put in the shape's own frame (even when the drag
        // crosses over it), so pin it on screen too
        const fx = b0.x + b0.w - (h0.x - b0.x), fy = b0.y + b0.h - (h0.y - b0.y);
        const F0 = TD.rotOf(orig)(fx, fy), F1 = TD.rotOf(s)(fx, fy);
        TD.translate(s, F0[0] - F1[0], F0[1] - F1[1]);
      };
    }
    t.svg = (s: any, ctx: any) => {
      const out = o.svg(s, ctx);
      if (!s.angle) return out;
      const b = rawBox(t, s);
      return `<g transform="rotate(${TD.fmt(-s.angle)} ${TD.fmt(b.x + b.w / 2)} ${TD.fmt(b.y + b.h / 2)})">${out}</g>`;
    };
    t.tikz = (s: any, X: any) => {
      // Shape exporters can call sibling methods (image.fileName, for example).
      // The saved-method holder is not the shape definition's receiver.
      const out = o.tikz.call(t, s, X);
      if (!s.angle || !out) return out;
      const b = rawBox(t, s);
      return `\\begin{scope}[rotate around={${TD.fmt(s.angle)}:${X.c(b.x + b.w / 2, b.y + b.h / 2)}}, transform shape]\n  ${out.replace(/\n/g, '\n  ')}\n\\end{scope}`;
    };
  }

  // Rotate shape s (already reset to its original) by `deg` degrees clockwise on screen about (cx, cy).
  TD.rotateShape = function (s: any, cx: any, cy: any, deg: any) {
    const th = deg * RAD, P = rotAbout(cx, cy, th), t = T[s.type];
    const moveCentre = (bx: any, by: any) => { const [nx, ny] = P(bx, by); TD.translate(s, nx - bx, ny - by); };
    if (TD.ROT_TYPES.has(s.type) && t._samples) {
      const b = rawBox(t, s);
      moveCentre(b.x + b.w / 2, b.y + b.h / 2);
      s.angle = normDeg((s.angle || 0) - deg);
      return;
    }
    if (s.type === 'sym') {
      moveCentre(s.x + s.w / 2, s.y + s.h / 2);
      s.angle = normDeg((s.angle || 0) - deg);
      return;
    }
    if (s.type === 'poly') { s.pts = s.pts.map(([x, y]: any) => P(x, y)); return; }
    if (s.type === 'region') { s.rings = s.rings.map((r: any) => r.map(([x, y]: any) => P(x, y))); return; }
    if (s.type === 'arc') { // a round arc just shifts its angles; an elliptical one turns its axes
      [s.cx, s.cy] = P(s.cx, s.cy);
      if (s.ry > 0 || +s.angle) s.angle = normDeg((+s.angle || 0) - deg); else { s.a1 -= deg; s.a2 -= deg; }
      return;
    }
    if (['line', 'curve', 'spring'].includes(s.type) && t.pts) {
      for (const [kx, ky] of t.pts) [s[kx], s[ky]] = P(s[kx], s[ky]);
      return;
    }
    // everything else (plots, diagrams, balls, dots…) keeps its look and moves with the rotation
    const b = TD.bbox(s);
    moveCentre(b.x + b.w / 2, b.y + b.h / 2);
  };
})();
