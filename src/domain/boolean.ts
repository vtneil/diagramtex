import { runtime as TD } from '../runtime';
// Shape booleans (Combine): unite, intersect, subtract, exclude, divide.
// Each shape is turned into closed polygon rings (even-odd). All edges are split where they cross,
// and an edge piece is kept when the result is inside on exactly one side of it. Coincident edges
// are handled because the test looks a hair to each side instead of at the edge itself.
(function () {
  'use strict';
  const EPS = 1e-9;

  // ---------- outlines ----------
  const ellRing = (cx: any, cy: any, rx: any, ry: any, n = 96) => {
    const r = [];
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; r.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return r;
  };
  const cubic = (p0: any, p1: any, p2: any, p3: any, t: any) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };
  const rot = (s: any, ring: any) => {
    // shapes with a free rotation (angle°, counter-clockwise) about their unrotated box centre
    if (!s.angle || s.type === 'sym' || !TD.rotOf) return ring;
    const f = TD.rotOf(s);
    return ring.map(([x, y]: any) => f(x, y));
  };
  function outline(s: any) {
    if (s.type === 'region') return s.rings.map((r: any) => r.map((p: any) => [p[0], p[1]]));
    if (s.type === 'rect') {
      const { x, y, w, h } = s, r = Math.min(+s.radius || 0, w / 2, h / 2);
      if (r <= 0.01) return [rot(s, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]])];
      const R: any[] = [], arc = (cx: any, cy: any, a0: any) => { for (let i = 0; i <= 8; i++) { const a = ((a0 + (90 * i) / 8) * Math.PI) / 180; R.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
      arc(x + w - r, y + r, -90); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, 90); arc(x + r, y + r, 180);
      return [rot(s, R)];
    }
    if (s.type === 'ellipse') return [rot(s, ellRing(s.cx, s.cy, s.rx, s.ry))];
    if (s.type === 'ball' || s.type === 'dot') return [ellRing(s.cx, s.cy, s.r, s.r)];
    if (s.type === 'poly' && s.closed) {
      if (!s.smooth || s.pts.length < 3) return [s.pts.map((p: any) => [p[0], p[1]])];
      const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] })), R = [];
      let prev = s.pts[0];
      for (const [a, b, c] of TD.smoothSegs(P, true)) {
        for (let i = 1; i <= 12; i++) R.push(cubic(prev, [a.x, a.y], [b.x, b.y], [c.x, c.y], i / 12));
        prev = [c.x, c.y];
      }
      return [R];
    }
    if (s.type === 'sym' && TD.symGeom) {
      const rings = [];
      for (const sp of TD.symGeom(s)) {
        if (!sp.closed && !sp.solid) continue;
        let R: any[] = [], cur = null;
        for (const g of sp.segs) {
          if (g[0] === 'M') { if (R.length > 2) rings.push(R); R = [[g[1], g[2]]]; cur = [g[1], g[2]]; }
          else if (g[0] === 'L') { R.push([g[1], g[2]]); cur = [g[1], g[2]]; }
          else if (g[0] === 'C') {
            for (let i = 1; i <= 10; i++) R.push(cubic(cur, [g[1], g[2]], [g[3], g[4]], [g[5], g[6]], i / 10));
            cur = [g[5], g[6]];
          }
        }
        if (R.length > 2) rings.push(R);
      }
      return rings;
    }
    return null;
  }
  TD.canCombine = (s: any) => !!s && (s.type === 'region' || s.type === 'rect' || s.type === 'ellipse' || s.type === 'ball' || s.type === 'dot' ||
    (s.type === 'poly' && s.closed) || (s.type === 'sym' && (() => { try { return TD.symGeom(s).some((sp: any) => sp.closed && !sp.solid); } catch (e: any) { return false; } })()));

  TD.containsClosedShape = (s: any, p: any) => { const rings = outline(s); return !!rings && inRings(rings, p.x, p.y); };

  // ---------- geometry ----------
  const inRings = (rings: any, x: any, y: any) => {
    let c = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
    }
    return c;
  };
  // drop repeated and collinear points
  const clean = (r: any) => {
    let a = r.filter((p: any, i: any) => { const q = r[(i + r.length - 1) % r.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
    let changed = true;
    while (changed && a.length > 3) {
      changed = false;
      for (let i = 0; i < a.length; i++) {
        const p = a[(i + a.length - 1) % a.length], q = a[i], n = a[(i + 1) % a.length];
        const cr = (q[0] - p[0]) * (n[1] - p[1]) - (q[1] - p[1]) * (n[0] - p[0]);
        const L = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
        if (Math.abs(cr) / L < 1e-4 && (q[0] - p[0]) * (n[0] - q[0]) + (q[1] - p[1]) * (n[1] - q[1]) >= 0) { a.splice(i, 1); changed = true; break; }
      }
    }
    return a;
  };
  const area = (r: any) => { let A = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) A += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return A / 2; };

  // Split every edge of every input at crossings. Returns pieces [[x1,y1],[x2,y2]].
  function pieces(all: any) {
    const E: any[] = [];
    all.forEach((rings: any) => rings.forEach((r: any) => r.forEach((p: any, i: any) => E.push([p, r[(i + 1) % r.length]]))));
    const out = [];
    for (let i = 0; i < E.length; i++) {
      const [a, b] = E[i], rx = b[0] - a[0], ry = b[1] - a[1], rr = rx * rx + ry * ry;
      if (rr < EPS) continue;
      const ts = [0, 1];
      const minx = Math.min(a[0], b[0]) - 1e-6, maxx = Math.max(a[0], b[0]) + 1e-6, miny = Math.min(a[1], b[1]) - 1e-6, maxy = Math.max(a[1], b[1]) + 1e-6;
      for (let j = 0; j < E.length; j++) {
        if (j === i) continue;
        const [c, d] = E[j];
        if (Math.max(c[0], d[0]) < minx || Math.min(c[0], d[0]) > maxx || Math.max(c[1], d[1]) < miny || Math.min(c[1], d[1]) > maxy) continue;
        const sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
        const qx = c[0] - a[0], qy = c[1] - a[1];
        if (Math.abs(den) > 1e-12 * Math.sqrt(rr * (sx * sx + sy * sy))) {
          const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
          if (t > 1e-9 && t < 1 - 1e-9 && u > -1e-9 && u < 1 + 1e-9) ts.push(t);
        } else if (Math.abs(qx * ry - qy * rx) / Math.sqrt(rr) < 1e-6) {
          // collinear: split at the other edge's end points
          for (const p of [c, d]) { const t = ((p[0] - a[0]) * rx + (p[1] - a[1]) * ry) / rr; if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); }
        }
      }
      ts.sort((x, y) => x - y);
      for (let k = 1; k < ts.length; k++) {
        if (ts[k] - ts[k - 1] < 1e-9) continue;
        out.push([[a[0] + rx * ts[k - 1], a[1] + ry * ts[k - 1]], [a[0] + rx * ts[k], a[1] + ry * ts[k]]]);
      }
    }
    return out;
  }

  const key = (p: any) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
  // keep pieces where res() differs on the two sides; orient with the inside on the left; chain into rings
  function build(P: any, sigOf: any, res: any) {
    const seen = new Set(), edges = [];
    for (const [p, q] of P) {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
      if (L < 1e-7) continue;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, e = Math.min(0.02, L / 4), nx = (-dy / L) * e, ny = (dx / L) * e;
      const A = res(sigOf(mx + nx, my + ny)), B = res(sigOf(mx - nx, my - ny));
      if (A === B) continue;
      const [s, t] = A ? [p, q] : [q, p], k = key(s) + '>' + key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({ s, t, ks: key(s), kt: key(t), used: false });
    }
    const from = new Map();
    for (const e of edges) { if (!from.has(e.ks)) from.set(e.ks, []); from.get(e.ks).push(e); }
    const rings = [];
    for (const e0 of edges) {
      if (e0.used) continue;
      const R = [];
      let e = e0;
      while (e && !e.used) {
        e.used = true;
        R.push(e.s);
        if (e.kt === e0.ks) break;
        e = (from.get(e.kt) || []).find((x: any) => !x.used);
      }
      const c = clean(R);
      if (c.length >= 3 && Math.abs(area(c)) > 0.05) rings.push(c);
    }
    return rings;
  }

  // shapes: bottom → top (z-order). Returns [{rings, from}] where from is the shape to take style from.
  TD.combineGeom = function (shapes: any, op: any) {
    const all = shapes.map(outline);
    if (all.some((r: any) => !r || !r.length)) return null;
    const P = pieces(all);
    const sigOf = (x: any, y: any) => all.map((rings: any) => inRings(rings, x, y));
    const n = shapes.length;
    const RES: Record<string, any> = {
      unite: (g: any) => g.some(Boolean),
      intersect: (g: any) => g.every(Boolean),
      subtract: (g: any) => g[0] && !g.slice(1).some(Boolean),
      exclude: (g: any) => g.filter(Boolean).length % 2 === 1,
    };
    if (op !== 'divide') {
      const rings = build(P, sigOf, RES[op]);
      return rings.length ? [{ rings, from: shapes[0] }] : [];
    }
    // divide: one region per distinct overlap pattern
    const pats = new Map();
    for (const [p, q] of P) {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
      if (L < 1e-7) continue;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, e = Math.min(0.02, L / 4);
      for (const sgn of [1, -1]) {
        const g = sigOf(mx - (sgn * dy * e) / L, my + (sgn * dx * e) / L);
        if (g.some(Boolean)) pats.set(g.map(Number).join(''), g);
      }
    }
    const out = [];
    for (const [k, g] of pats) {
      const rings = build(P, sigOf, (h: any) => h.map(Number).join('') === k);
      if (rings.length) out.push({ rings, from: shapes[g.lastIndexOf(true)], order: g.lastIndexOf(true) * (n + 1) + g.filter(Boolean).length });
    }
    out.sort((a, b) => a.order - b.order);
    return out;
  };

  // style for a region made from shape s
  TD.regionStyle = function (s: any) {
    if (s.type === 'ball') return { stroke: null, width: 0.8, dash: 'solid', fill: s.ballColor, opacity: s.opacity ?? 1 };
    if (s.type === 'dot') return { stroke: null, width: 0.8, dash: 'solid', fill: s.color, opacity: s.opacity ?? 1 };
    return { stroke: s.stroke ?? '#000000', width: s.width ?? 0.8, dash: s.dash || 'solid', fill: s.fill || null, opacity: s.opacity ?? 1 };
  };
})();
