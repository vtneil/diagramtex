export let panelServices: any;
import { runtime as TD } from '../runtime';
// Basic 3D solids (box, cylinder, cone, frustum, sphere, prism, pyramid, spherical wedge) and solids of
// revolution (disks, washers, shells, with a cutaway and a highlighted slice). Both are built as meshes for
// the 3D engine (view3d.ts), drawn shaded or as line drawings with dashed hidden edges, and exported as
// plain TikZ.
(function () {
  const T = TD.TYPES;
  const V3 = TD.V3;
  const { dot, sub, cross, norm, mul, add } = V3.vec;
  const D2R = Math.PI / 180;

  // a face whose normal is turned to agree with `out` (a direction that points out of the solid there)
  function face(pts: any, out: any, color: any, group: any, extra?: any) {
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
    if (Math.hypot(...n) < 1e-10) return null; // no area (a band on the axis)
    return { pts: dot(n, out) < 0 ? [...pts].reverse() : pts, color, group, ...extra };
  }
  const centroid = (pts: any) => pts.reduce((m: any, p: any) => add(m, mul(p, 1 / pts.length)), [0, 0, 0]);
  const ring = (r: any, z: any, n: any, t0 = 0, t1 = 2 * Math.PI, closed = true) => Array.from<any, any>({ length: closed ? n : n + 1 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / n; return [r * Math.cos(t), r * Math.sin(t), z]; });

  // ================================================================ basic solids
  const KINDS = [['box', 'Box (cuboid)'], ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['frustum', 'Frustum'], ['sphere', 'Sphere'],
    ['prism', 'Prism'], ['pyramid', 'Pyramid'], ['swedge', 'Spherical wedge']];
  function solidFigure(s: any) {
    const vw = V3.view(s.view?.[0] ?? 30, s.view?.[1] ?? 20);
    const n = V3.num, kind = s.kind || 'box', color = s.solidColor || '#2f7fc1', line = s.style === 'line';
    const a = Math.max(1e-3, n(s.a, 2)), b = Math.max(1e-3, n(s.b, 1.5)), c = Math.max(1e-3, n(s.c, 1.2)), r2 = Math.max(0, n(s.r2, 0.6));
    const sides = Math.max(3, Math.min(24, Math.round(n(s.n, 6))));
    const faces = [], curves = [], items = [], dims = [];
    const ink = V3.ink(line ? '#000000' : color);
    const M = 64;
    let convex = true, ballAt = null;
    if (kind === 'box') {
      faces.push(...V3.boxFaces([0, 0, 0], [a, b, c], color, null).map((fc: any, i: any) => ({ ...fc, group: 'f' + i })));
      // dimension labels on the three edges at the front-bottom corner
      const C = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0]];
      const k = C.reduce((m, p) => (vw.depth(p) > vw.depth(m) ? p : m));
      const ctr = [a / 2, b / 2, c / 2];
      const along = (d: any, lab: any) => { if (!lab) return; const q = [...k]; q[d] = k[d] === 0 ? (d === 0 ? a : b) : 0; if (d === 2) q[2] = c; dims.push({ p: k, q, lab, ctr }); };
      along(0, s.la); along(1, s.lb);
      // the height goes on the vertical edge at the right of the outline, beside the solid rather than on a face
      if (s.lc) { const r = C.reduce((m, p) => (vw.P(p)[0] > vw.P(m)[0] ? p : m)); dims.push({ p: r, q: [r[0], r[1], c], lab: s.lc, ctr: [a / 2, b / 2, c / 2] }); }
    } else if (kind === 'cylinder' || kind === 'cone' || kind === 'frustum') {
      const rt = kind === 'cylinder' ? a : kind === 'cone' ? 0 : r2;
      const B = ring(a, 0, M), Tp = ring(rt, c, M);
      for (let i = 0; i < M; i++) {
        const j = (i + 1) % M, mid = (i + 0.5) / M * 2 * Math.PI;
        const out = [Math.cos(mid) * c, Math.sin(mid) * c, a - rt];
        const f = rt > 0 ? face([B[i], B[j], Tp[j], Tp[i]], out, color, 'side') : face([B[i], B[j], [0, 0, c]], out, color, 'side');
        if (f) faces.push(f);
      }
      faces.push(face([...B], [0, 0, -1], color, 'bot'));
      if (rt > 0) faces.push(face([...Tp], [0, 0, 1], color, 'top'));
      const t = bestAngle(vw, a);
      if (s.la) dims.push({ p: [0, 0, 0], q: [a * Math.cos(t), a * Math.sin(t), 0], lab: s.la, ctr: [0, 0, c / 2], inner: true });
      if (s.lc) dims.push({ p: [0, 0, 0], q: [0, 0, c], lab: s.lc, ctr: [a, 0, c / 2], inner: true, at: kind === 'cone' ? 0.4 : 0.5 });
      if (kind === 'frustum' && s.lb) dims.push({ p: [0, 0, c], q: [rt * Math.cos(t), rt * Math.sin(t), c], lab: s.lb, ctr: [0, 0, 0], inner: true, up: true });
    } else if (kind === 'sphere') {
      ballAt = true;
      const eq = ring(a, 0, 96);
      curves.push({ pts: [...eq, eq[0]], normals: [...eq, eq[0]].map((p) => norm(p)) });
      if (s.lb) { // a second circle through the poles, seen edge-on-ish
        const mer = Array.from<any, any>({ length: 97 }, (_, i) => { const t = (i / 96) * 2 * Math.PI; return [a * Math.cos(t) * Math.cos(D2R * 90), a * Math.cos(t) * Math.sin(D2R * 90), a * Math.sin(t)]; });
        curves.push({ pts: mer, normals: mer.map((p) => norm(p)) });
      }
      const t = bestAngle(vw, a);
      if (s.la) dims.push({ p: [0, 0, 0], q: [a * Math.cos(t), a * Math.sin(t), 0], lab: s.la, ctr: [0, 0, a], inner: true, solid: true });
    } else if (kind === 'prism' || kind === 'pyramid') {
      const B = ring(a, 0, sides, Math.PI / sides - Math.PI / 2), Tp = ring(a, c, sides, Math.PI / sides - Math.PI / 2);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides, out = sub(centroid([B[i], B[j]]), [0, 0, c / 2]);
        faces.push(face(kind === 'prism' ? [B[i], B[j], Tp[j], Tp[i]] : [B[i], B[j], [0, 0, c]], out, color, 's' + i));
      }
      faces.push(face([...B], [0, 0, -1], color, 'bot'));
      if (kind === 'prism') faces.push(face([...Tp], [0, 0, 1], color, 'top'));
      if (s.lc) dims.push({ p: [0, 0, 0], q: [0, 0, c], lab: s.lc, ctr: [a, 0, c / 2], inner: true, at: kind === 'pyramid' ? 0.4 : 0.5 });
      if (s.la) { const i = B.reduce((m, p, k) => (vw.depth(centroid([p, B[(k + 1) % sides]])) > vw.depth(centroid([B[m], B[(m + 1) % sides]])) ? k : m), 0); dims.push({ p: B[i], q: B[(i + 1) % sides], lab: s.la, ctr: [0, 0, c / 2] }); }
    } else if (kind === 'swedge') {
      convex = false;
      const p1 = Math.max(0, n(s.r1, 0.8)), p2 = Math.max(p1 + 1e-3, n(s.r2, 2));
      let t1 = n(s.t1, 0), t2 = n(s.t2, 70); if (t2 <= t1) t2 += 360;
      const f1 = Math.max(0, Math.min(180, n(s.p1, 20))), f2 = Math.max(f1 + 0.5, Math.min(180, n(s.p2, 60)));
      const nt = 16, nf = 12;
      const S = (rho: any, t: any, f: any) => [rho * Math.sin(f * D2R) * Math.cos(t * D2R), rho * Math.sin(f * D2R) * Math.sin(t * D2R), rho * Math.cos(f * D2R)];
      const T_ = (i: any) => t1 + ((t2 - t1) * i) / nt, F_ = (j: any) => f1 + ((f2 - f1) * j) / nf;
      for (let i = 0; i < nt; i++) for (let j = 0; j < nf; j++) {
        const q = (rho: any) => [S(rho, T_(i), F_(j)), S(rho, T_(i + 1), F_(j)), S(rho, T_(i + 1), F_(j + 1)), S(rho, T_(i), F_(j + 1))];
        const o = q(p2), ce = centroid(o);
        faces.push(face(o, ce, color, 'outer'));
        if (p1 > 0) { const inn = q(p1); const fc = face(inn, mul(centroid(inn), -1), color, 'inner'); if (fc) faces.push(fc); }
      }
      const R = 6;
      const rho = (k: any) => p1 + ((p2 - p1) * k) / R;
      for (let k = 0; k < R; k++) {
        for (let j = 0; j < nf; j++) for (const [t, sg] of [[t1, -1], [t2, 1]]) { // the two half-planes θ = θ1, θ2
          const pts = [S(rho(k), t, F_(j)), S(rho(k + 1), t, F_(j)), S(rho(k + 1), t, F_(j + 1)), S(rho(k), t, F_(j + 1))];
          const fc = face(pts, [-Math.sin(t * D2R) * sg, Math.cos(t * D2R) * sg, 0], color, 't' + t); if (fc) faces.push(fc);
        }
        for (let i = 0; i < nt; i++) for (const [f, sg] of [[f1, -1], [f2, 1]]) { // the two cones φ = φ1, φ2
          const pts = [S(rho(k), T_(i), f), S(rho(k + 1), T_(i), f), S(rho(k + 1), T_(i + 1), f), S(rho(k), T_(i + 1), f)];
          const tm = (T_(i) + T_(i + 1)) / 2;
          const fc = face(pts, mul([Math.cos(f * D2R) * Math.cos(tm * D2R), Math.cos(f * D2R) * Math.sin(tm * D2R), -Math.sin(f * D2R)], sg), color, 'f' + f); if (fc) faces.push(fc);
        }
      }
    }
    // extents for the axes and the scene
    let ext = [a, a, c];
    if (kind === 'box') ext = [a, b, c];
    if (kind === 'sphere') ext = [a, a, a];
    if (kind === 'swedge') { const R = Math.max(1e-3, n(s.r2, 2)); ext = [R * 0.75, R * 0.75, R * 0.75]; }
    if (s.axes) {
      const neg = kind === 'box' || kind === 'swedge' ? [0, 0, 0] : kind === 'sphere' ? [a, a, a] : [a, a, 0];
      items.push(...V3.axes(vw, ext.map((v) => v * 1.45), [s.xlabel, s.ylabel, s.zlabel], [0, 0, 0], s.axesNeg === false ? [0, 0, 0] : neg));
    }
    if (ballAt) items.push({ k: 'ball', at: vw.P([0, 0, 0]), r: a, color, shaded: !line, stroke: ink, w: V3.LW });
    items.push(...V3.mesh(faces.filter(Boolean), { vw, closed: true, convex, style: line ? 'line' : 'shaded', hidden: s.hiddenEdges !== false, ink, curves }));
    for (const d of dims) {
      const P = vw.P(d.p), Q = vw.P(d.q), C = vw.P(d.ctr);
      if (d.inner) items.push({ k: 'line', pts: [P, Q], stroke: ink, w: V3.AW, dash: !d.solid });
      const t = d.at ?? 0.5, m = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
      let u = [m[0] - C[0], m[1] - C[1]];
      if (d.inner) { const e = [Q[0] - P[0], Q[1] - P[1]]; u = [-e[1], e[0]]; if (d.up ? u[1] < 0 : u[0] < 0) u = [-u[0], -u[1]]; }
      // a label on a top face goes above the solid's rim, clear of the outline
      if (d.up) { const rimTop = Math.max(...Array.from<any, any>({ length: 36 }, (_, i) => vw.P([d.q[2] === 0 ? 0 : Math.hypot(d.q[0], d.q[1]) * Math.cos(i / 18 * Math.PI), Math.hypot(d.q[0], d.q[1]) * Math.sin(i / 18 * Math.PI), d.q[2]])[1])); m[1] = Math.max(m[1], rimTop); u = [0, 1]; }
      const l = Math.hypot(u[0], u[1]) || 1;
      items.push({ k: 'text', at: m, text: d.lab, push: [u[0] / l, u[1] / l] });
    }
    if (s.name) items.push({ k: 'text', at: vw.P(kind === 'box' ? [a / 2, b / 2, c] : kind === 'sphere' ? [0, 0, a] : [0, 0, c]), text: s.name, push: [0, 1] });
    return { items };
  }
  // the angle round the z-axis whose rim point shows best: in front, towards the right
  function bestAngle(vw: any, r: any) {
    let best = 0, bv = -Infinity;
    for (let i = 0; i < 72; i++) { const t = (i / 72) * 2 * Math.PI, p = [r * Math.cos(t), r * Math.sin(t), 0], v = vw.P(p)[0] + 0.6 * vw.depth(p); if (v > bv) { bv = v; best = t; } }
    return best;
  }

  const SDEF = {
    w: 240, h: 220, kind: 'box', style: 'shaded', a: '2', b: '1.5', c: '1.2', r2: '0.6', n: '6',
    r1: '0.8', t1: '0', t2: '70', p1: '20', p2: '60',
    view: [30, 20], axes: false, axesNeg: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', hiddenEdges: true,
    solidColor: '#2f7fc1', la: '$a$', lb: '$b$', lc: '$c$', name: '',
  };
  const SPRE = {
    box: {},
    cylinder: { kind: 'cylinder', a: '1', c: '2', la: '$r$', lb: '', lc: '$h$', w: 200, h: 240 },
    cone: { kind: 'cone', a: '1', c: '2', la: '$r$', lb: '', lc: '$h$', w: 200, h: 240 },
    frustum: { kind: 'frustum', a: '1.2', r2: '0.6', c: '1.6', la: '$R$', lb: '$r$', lc: '$h$', w: 200, h: 220 },
    sphere: { kind: 'sphere', a: '1.2', la: '$r$', lb: '', lc: '', w: 200, h: 200 },
    prism: { kind: 'prism', a: '1', c: '1.8', n: '6', la: '$a$', lb: '', lc: '$h$', w: 200, h: 240 },
    pyramid: { kind: 'pyramid', a: '1.2', c: '1.8', n: '4', la: '$a$', lb: '', lc: '$h$', w: 200, h: 240 },
    swedge: { kind: 'swedge', r1: '0.9', r2: '2', t1: '0', t2: '60', p1: '25', p2: '65', view: [35, 25], axes: true, la: '', lb: '', lc: '', w: 240, h: 240 },
  };
  T.prim3d = V3.blockType('3D solid', SDEF, solidFigure, SPRE);
  // the spherical wedge keeps its radii apart from the frustum's top radius
  

  // ================================================================ solids of revolution
  // The region between y = g(x) and y = f(x) for a ≤ x ≤ b turns about the x-axis (disks, washers) or the
  // y-axis (shells). Every edge of the region sweeps a band; the cut faces close the solid when it is cut away.
  function revolveFigure(s: any) {
    const vw = V3.view(s.view?.[0] ?? 25, s.view?.[1] ?? 18);
    const fx = V3.expr(s.f, ['x'], 'f(x)'), gx = V3.expr(String(s.g ?? '').trim() || '0', ['x'], 'g(x)');
    const a = V3.num(s.a, 0), b = V3.num(s.b, 2);
    if (!(b > a)) throw new Error('The interval needs a < b');
    const about = s.axis === 'y' ? 'y' : 'x';
    if (about === 'y' && a < 0) throw new Error('Turning about the y-axis needs a ≥ 0');
    const color = s.solidColor || '#2f7fc1', ink = V3.ink(color);
    const ns = 18, nt = Math.max(12, Math.round(36 * (V3.num(s.sweep, 360) / 360)));
    const sweep = Math.max(10, Math.min(360, V3.num(s.sweep, 360))) * D2R;
    // the region's edge, counter-clockwise in the (x, y) plane
    const R = [];
    for (let i = 0; i <= ns; i++) { const x = a + ((b - a) * i) / ns; R.push({ p: [x, gx(x)], side: 'g' }); }
    for (let i = 0; i <= ns; i++) { const x = b - ((b - a) * i) / ns; R.push({ p: [x, fx(x)], side: 'f' }); }
    if (R.some((q) => !q.p.every(isFinite))) throw new Error('f or g is not a number on [a, b]');
    if (about === 'x' && R.some((q) => q.p[1] < -1e-9)) throw new Error('About the x-axis, f and g must be ≥ 0');
    let area = 0;
    for (let i = 0; i < R.length; i++) { const p = R[i].p, q = R[(i + 1) % R.length].p; area += p[0] * q[1] - q[0] * p[1]; }
    if (area < 0) R.reverse();
    // math (X, Y) turned by θ into the world; θ = 0 is the xz-plane (math y up)
    const full = sweep > 2 * Math.PI - 1e-6;
    // a cut-open solid turns so that the missing wedge faces the viewer
    const dv = vw.dv, tv = about === 'x' ? Math.atan2(-dv[1], dv[2]) : Math.atan2(dv[1], dv[0]);
    const t0 = full ? 0 : tv - sweep - (2 * Math.PI - sweep) / 2;
    const W = about === 'x' ? ([X, Y]: any, t: any) => [X, -Y * Math.sin(t + t0), Y * Math.cos(t + t0)] : ([X, Y]: any, t: any) => [X * Math.cos(t + t0), X * Math.sin(t + t0), Y];
    const Wn = about === 'x' ? ([nX, nY]: any, t: any) => [nX, -nY * Math.sin(t + t0), nY * Math.cos(t + t0)] : ([nX, nY]: any, t: any) => [nX * Math.cos(t + t0), nX * Math.sin(t + t0), nY];
    const slice = s.slice !== false && s.slice !== '' && s.showSlice;
    const faces = [];
    for (let i = 0; i < R.length; i++) {
      const A = R[i], B = R[(i + 1) % R.length];
      const e = [B.p[0] - A.p[0], B.p[1] - A.p[1]], out2 = [e[1], -e[0]];
      if (Math.hypot(...e) < 1e-12) continue;
      const group = A.side === B.side ? A.side : 'v' + i;
      for (let j = 0; j < nt; j++) {
        const t0 = (sweep * j) / nt, t1 = (sweep * (j + 1)) / nt;
        const fc = face([W(A.p, t0), W(B.p, t0), W(B.p, t1), W(A.p, t1)], Wn(out2, (t0 + t1) / 2), color, group);
        if (fc) faces.push(fc);
      }
    }
    if (!full) { // the cut faces show the region itself
      const cut = V3.col(s.regionColor || '#e8703a', 55);
      const tan = (t: any) => (about === 'x' ? [0, -Math.cos(t + t0), -Math.sin(t + t0)] : [-Math.sin(t + t0), Math.cos(t + t0), 0]);
      faces.push(face(R.map((q) => W(q.p, 0)), mul(tan(0), -1), cut, 'cut0', { flat: true }));
      faces.push(face(R.map((q) => W(q.p, sweep)), tan(sweep), cut, 'cut1', { flat: true }));
    }
    const items = [];
    // axes: x along the world x-axis, y up (world z), z towards the viewer (world y)
    const pts = faces.flatMap((fc) => fc.pts);
    const mx = Math.max(...pts.map((p) => p[0]), 0), my = Math.max(...pts.map((p) => Math.abs(p[1])), 0), mz = Math.max(...pts.map((p) => p[2]), 0);
    const nx = Math.max(...pts.map((p) => -p[0]), 0), nz = Math.max(...pts.map((p) => -p[2]), 0);
    if (s.axes !== false) items.push(...V3.axes(vw, [mx * 1.25 + 0.3, s.zaxis ? my * 1.3 + 0.3 : 0, mz * 1.25 + 0.3], [s.xlabel, s.zlabel, s.ylabel], [0, 0, 0], [nx + 0.3, s.zaxis ? my * 1.3 : 0, nz + 0.3]));
    const sliceOn = !!s.showSlice;
    items.push(...V3.mesh(faces, { vw, closed: true, convex: false, style: sliceOn ? 'line' : 'shaded', hidden: s.hiddenEdges !== false, ink }));
    // the generating curves drawn in the plane θ = 0, and the region, when the solid is shown whole
    if (s.showCurve) {
      const fcurve = R.filter((q) => q.side === 'f').map((q) => vw.P(W(q.p, 0)));
      items.push({ k: 'line', pts: fcurve, stroke: V3.col(s.regionColor || '#e8703a', 100, 'white'), w: V3.LW * 1.4 });
    }
    // a slice: a disk or washer (about x) or a shell (about y) at x0, of width dx
    if (sliceOn) {
      const x0 = V3.num(s.x0, (a + b) / 2), dx = Math.max(1e-3, V3.num(s.dx, (b - a) / 12));
      const lo = Math.max(a, x0 - dx / 2), hi = Math.min(b, x0 + dx / 2);
      const SR = [[lo, gx((lo + hi) / 2)], [hi, gx((lo + hi) / 2)], [hi, fx((lo + hi) / 2)], [lo, fx((lo + hi) / 2)]];
      const sc = s.sliceColor || '#e8703a', sf = [];
      for (let i = 0; i < 4; i++) {
        const A = SR[i], B = SR[(i + 1) % 4], e = [B[0] - A[0], B[1] - A[1]], out2 = [e[1], -e[0]];
        for (let j = 0; j < 48; j++) {
          const t0 = (2 * Math.PI * j) / 48, t1 = (2 * Math.PI * (j + 1)) / 48;
          const fc = face([W(A, t0), W(B, t0), W(B, t1), W(A, t1)], Wn(out2, (t0 + t1) / 2), sc, 's' + i);
          if (fc) sf.push(fc);
        }
      }
      items.push(...V3.mesh(sf, { vw, closed: true, convex: about === 'x' && Math.abs(gx(x0)) < 1e-9, style: 'shaded', hidden: false, ink: V3.ink(sc) }));
      if (s.sliceLabel) items.push({ k: 'text', at: vw.P(W([(lo + hi) / 2, fx((lo + hi) / 2)], 0)), text: s.sliceLabel, push: [0, 1] });
    }
    if (s.curveLabel) {
      const xm = a + (b - a) * 0.7;
      items.push({ k: 'text', at: vw.P(W([xm, fx(xm)], 0)), text: s.curveLabel, push: [0.4, 1] });
    }
    return { items };
  }
  const RDEF = {
    w: 320, h: 240, f: 'sqrt(x) + 0.3', g: '', a: '0', b: '3', axis: 'x', sweep: '360', view: [25, 18],
    axes: true, zaxis: false, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', hiddenEdges: true,
    showSlice: false, x0: '', dx: '', showCurve: false, curveLabel: '$y = f(x)$', sliceLabel: '',
    solidColor: '#2f7fc1', regionColor: '#e8703a', sliceColor: '#e8703a',
  };
  const RPRE = {
    disk: { sweep: '360' },
    washer: { f: '2 - (x-1.5)^2/2.25*1.2', g: '0.5', a: '0', b: '3', sweep: '270', curveLabel: '', view: [30, 20] },
    shell: { f: '2 - (x-1.5)^2/2.25*1.6', g: '', a: '0.5', b: '2.5', axis: 'y', sweep: '270', curveLabel: '', view: [30, 22], w: 300, h: 260 },
    slice: { showSlice: true, x0: '2', dx: '0.25', sliceLabel: '$\\Delta x$', curveLabel: '' },
  };
  T.revolve = V3.blockType('Solid of revolution', RDEF, revolveFigure, RPRE);
  
  panelServices = { T, KINDS, SPRE, SDEF, V3, RDEF };
})();
