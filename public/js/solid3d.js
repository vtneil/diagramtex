// Solid region: the textbook figure for a triple integral over a solid E that stands on a base D, between a
// lower surface u1 and an upper surface u2. The solid can stand along z (z = u(x, y)), x (x = u(y, z)) or
// y (y = u(x, z)). D can be an ellipse, a rectangle, a polar curve or a polar rectangle (a cylindrical
// wedge). In columns mode the solid becomes the boxes of a Riemann sum over D. Drawn with the 3D engine
// (view3d.js) and exported as plain TikZ.
(function () {
  const TD = window.TD;
  const T = TD.TYPES;
  const V3 = TD.V3;
  const D2R = Math.PI / 180;
  const N = 120; // samples round the edge of D

  // the solid's own axes (a, b along D, c along the solid) → x, y, z
  const AXES = {
    z: { map: ([a, b, c]) => [a, b, c], vars: ['x', 'y'], c: 'z' },
    x: { map: ([a, b, c]) => [c, a, b], vars: ['y', 'z'], c: 'x' },
    y: { map: ([a, b, c]) => [a, c, b], vars: ['x', 'z'], c: 'y', odd: true }, // a swap: faces turn inside out unless reversed
  };
  const defLabel = (ax, k) => { const A = AXES[ax]; return `$${A.c} = u_${k}(${A.vars[0]}, ${A.vars[1]})$`; };

  function boundary(s) {
    const n = V3.num, cx = n(s.cx, 0), cy = n(s.cy, 0);
    const a = Math.abs(n(s.a, 1)) || 1, b = Math.abs(n(s.b, 1)) || 1;
    const pts = [];
    if (s.base === 'rect') {
      const C = [[cx + a, cy - b], [cx + a, cy + b], [cx - a, cy + b], [cx - a, cy - b]];
      for (let k = 0; k < 4; k++) {
        const p = C[(k + 3) % 4], q = C[k];
        for (let i = 0; i < N / 4; i++) pts.push([p[0] + ((q[0] - p[0]) * i * 4) / N, p[1] + ((q[1] - p[1]) * i * 4) / N]);
      }
    } else if (s.base === 'sector') {
      const r1 = Math.max(0, n(s.r1, 0)), r2 = Math.max(r1 + 1e-3, n(s.r2, 1.5));
      let t1 = n(s.t1, 0), t2 = n(s.t2, 90);
      if (t2 <= t1) t2 += 360;
      const m = Math.max(8, Math.round(((t2 - t1) / 360) * N));
      for (let i = 0; i <= m; i++) { const t = (t1 + ((t2 - t1) * i) / m) * D2R; pts.push([cx + r2 * Math.cos(t), cy + r2 * Math.sin(t)]); }
      const side = 6;
      if (r1 > 0) {
        for (let i = 1; i < side; i++) { const r = r2 + ((r1 - r2) * i) / side, t = t2 * D2R; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
        for (let i = m; i >= 0; i--) { const t = (t1 + ((t2 - t1) * i) / m) * D2R; pts.push([cx + r1 * Math.cos(t), cy + r1 * Math.sin(t)]); }
        for (let i = 1; i < side; i++) { const r = r1 + ((r2 - r1) * i) / side, t = t1 * D2R; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
      } else if (t2 - t1 < 359.9) {
        for (let i = 1; i <= side; i++) { const r = r2 * (1 - i / side), t = t2 * D2R; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
        for (let i = 1; i < side; i++) { const r = (r2 * i) / side, t = t1 * D2R; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
      } else pts.pop();
    } else if (s.base === 'polar') {
      const r = V3.expr(s.r, ['t'], 'r(θ)');
      for (let i = 0; i < N; i++) {
        const t = (2 * Math.PI * i) / N, v = r(t, 0);
        if (!isFinite(v)) throw new Error('r(θ) is not a number at θ = ' + TD.fmt(t));
        pts.push([cx + a * v * Math.cos(t), cy + b * v * Math.sin(t)]);
      }
    } else for (let i = 0; i < N; i++) { const t = (2 * Math.PI * i) / N; pts.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]); }
    // counter-clockwise, so outward normals point out
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (area < 0) pts.reverse();
    return pts;
  }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function figure(s) {
    const A = AXES[s.axis] || AXES.z, M = A.map;
    const vw = V3.view(s.view?.[0] ?? 115, s.view?.[1] ?? 20);
    const D = boundary(s), n = D.length;
    const u1 = V3.expr(s.u1, A.vars, 'Bottom'), u2 = V3.expr(s.u2, A.vars, 'Top');
    const lo = D.map(([a, b]) => u1(a, b)), hi = D.map(([a, b]) => u2(a, b));
    if (lo.some((v) => !isFinite(v)) || hi.some((v) => !isFinite(v))) throw new Error('A surface is not a number somewhere on the edge of D');
    const solid = s.solidColor || '#2f7fc1', base = s.baseColor || '#e8703a';
    const items = [];
    // axes
    const ext = [0, 0, 0];
    for (let i = 0; i < n; i++) for (const c of [lo[i], hi[i]]) M([D[i][0], D[i][1], c]).forEach((v, k) => { ext[k] = Math.max(ext[k], v); });
    if (s.axes !== false) items.push(...V3.axes(vw, ext.map((v, k) => (v > 0 ? v * (k === 2 ? 1.15 : 1.2) : 1)), [s.xlabel, s.ylabel, s.zlabel]));
    // the base D on its coordinate plane
    const showBase = s.showBase !== false;
    const cen = D.reduce((m, p) => [m[0] + p[0] / n, m[1] + p[1] / n], [0, 0]);
    if (showBase) {
      items.push({ k: 'poly', pts: D.map(([a, b]) => vw.P(M([a, b, 0]))), fill: V3.col(base, 40), stroke: V3.col(base), w: V3.LW });
      if (s.baseLabel) items.push({ k: 'text', at: vw.P(M([cen[0], cen[1], 0])), text: s.baseLabel });
    }
    const calls = [];
    let rightX = null;

    if (s.columns) {
      // a Riemann sum: boxes over a grid on D's bounding rectangle, standing at the cell centre's height
      const nx = Math.max(1, Math.min(24, Math.round(V3.num(s.nx, 4)))), ny = Math.max(1, Math.min(24, Math.round(V3.num(s.ny, 3))));
      const xs = D.map((p) => p[0]), ys = D.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const faces = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const a0 = x0 + ((x1 - x0) * i) / nx, a1 = x0 + ((x1 - x0) * (i + 1)) / nx, b0 = y0 + ((y1 - y0) * j) / ny, b1 = y0 + ((y1 - y0) * (j + 1)) / ny;
        const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
        if (s.base !== 'rect' && !inside(D, am, bm)) continue;
        const c0 = u1(am, bm), c1 = u2(am, bm);
        if (!isFinite(c0) || !isFinite(c1) || Math.abs(c1 - c0) < 1e-9) continue;
        faces.push(...boxFaces([a0, b0, Math.min(c0, c1)], [a1, b1, Math.max(c0, c1)], M, solid, `${i},${j}`));
      }
      if (A.odd) faces.forEach((fc) => fc.pts.reverse());
      items.push(...V3.mesh(faces, { vw, closed: true, convex: false, hidden: false, ink: V3.ink(solid) }));
      const P = faces.flatMap((fc) => fc.pts.map(vw.P));
      if (P.length) rightX = Math.max(...P.map((p) => p[0]));
      if (s.topLabel && P.length) { const top = P.reduce((m, p) => (p[1] > m[1] ? p : m)); calls.push({ text: s.topLabel, tip: top, side: 'top' }); }
      return { items, calls, rightX };
    }

    // the solid: two caps and the side wall in strips
    const top = D.map(([a, b], i) => M([a, b, hi[i]])), bot = D.map(([a, b], i) => M([a, b, lo[i]]));
    const capTop = V3.col(solid, 22), faces = [
      { pts: top, color: capTop, flat: true, group: 'top' },
      { pts: [...bot].reverse(), color: capTop, flat: true, group: 'bot' },
    ];
    // which way is "up" along the solid (from u1 to u2), so the caps face outwards
    if (hi.reduce((m, v, i) => m + v - lo[i], 0) < 0) { faces[0].pts.reverse(); faces[1].pts.reverse(); }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push({ pts: hi[0] >= lo[0] ? [bot[i], bot[j], top[j], top[i]] : [top[i], top[j], bot[j], bot[i]], color: solid, group: 'wall' });
    }
    if (A.odd) faces.forEach((fc) => fc.pts.reverse());
    const hidden = s.hiddenEdges !== false;
    const convex = s.base === 'ellipse' || s.base === 'rect' || (s.base === 'sector' && V3.num(s.r1, 0) <= 0 && ((V3.num(s.t2, 90) - V3.num(s.t1, 0) + 360) % 360 || 360) <= 180);
    // drop lines from the solid's outline to D, where the wall turns from front to back
    if (s.dropLines !== false && showBase) {
      const facing = faces.slice(2).map((fc) => {
        const [p, q, r] = fc.pts, nn = V3.vec.cross(V3.vec.sub(q, p), V3.vec.sub(r, q));
        return V3.vec.dot(nn, vw.dv) > 0;
      });
      for (let i = 0; i < n; i++) if (facing[i] !== facing[(i + 1) % n]) {
        const k = (i + 1) % n, near = Math.abs(lo[k]) < Math.abs(hi[k]) ? bot[k] : top[k];
        items.push({ k: 'line', pts: [vw.P(near), vw.P(M([D[k][0], D[k][1], 0]))], stroke: V3.col('#000000'), w: V3.AW, dash: true });
      }
    }
    items.push(...V3.mesh(faces, { vw, closed: true, convex, hidden, ink: V3.ink(solid) }));
    if (s.solidLabel) {
      const z = u2(cen[0], cen[1]);
      items.push({ k: 'text', at: vw.P(M([cen[0], cen[1], isFinite(z) ? z : hi[0]])), text: s.solidLabel });
    }
    // callouts: one to the upper surface, one to the lower surface's far edge, both towards the right
    const Ptop = top.map(vw.P), Pbot = bot.map(vw.P);
    const avg = (arr) => arr.reduce((m, p) => [m[0] + p[0] / arr.length, m[1] + p[1] / arr.length], [0, 0]);
    const right = (arr) => arr.reduce((m, p) => (p[0] > m[0] ? p : m));
    const at = (p, q, t) => [p[0] * t + q[0] * (1 - t), p[1] * t + q[1] * (1 - t)];
    rightX = Math.max(...Ptop.map((p) => p[0]), ...Pbot.map((p) => p[0]));
    if (s.topLabel) calls.push({ text: s.topLabel, tip: at(right(Ptop), avg(Ptop), 0.35), side: 'top' });
    if (s.bottomLabel) {
      const back = Pbot.filter((p, i) => vw.depth(bot[i]) < vw.depth(M([cen[0], cen[1], lo[i]])));
      calls.push({ text: s.bottomLabel, tip: at(right(back.length ? back : Pbot), avg(Pbot), 0.55), side: 'bot' });
    }
    return { items, calls, rightX };
  }
  // the six faces of a box from p to q in the solid's own axes, counter-clockwise from outside
  function boxFaces(p, q, M, color, group) {
    const [a0, b0, c0] = p, [a1, b1, c1] = q;
    const v = (a, b, c) => M([a, b, c]);
    return [
      [v(a0, b0, c0), v(a0, b1, c0), v(a1, b1, c0), v(a1, b0, c0)],
      [v(a0, b0, c1), v(a1, b0, c1), v(a1, b1, c1), v(a0, b1, c1)],
      [v(a0, b0, c0), v(a1, b0, c0), v(a1, b0, c1), v(a0, b0, c1)],
      [v(a1, b1, c0), v(a0, b1, c0), v(a0, b1, c1), v(a1, b1, c1)],
      [v(a0, b1, c0), v(a0, b0, c0), v(a0, b0, c1), v(a0, b1, c1)],
      [v(a1, b0, c0), v(a1, b1, c0), v(a1, b1, c1), v(a1, b0, c1)],
    ].map((pts) => ({ pts, color, group }));
  }
  TD.V3.boxFaces = (p, q, color, group) => boxFaces(p, q, (x) => x, color, group);

  const DEFAULT = {
    w: 320, h: 240, axis: 'z', base: 'ellipse', cx: '1.8', cy: '2.2', a: '1.4', b: '1', r: '1 + 0.15*cos(3*t)',
    r1: '0.6', r2: '1.6', t1: '0', t2: '90',
    u1: '1', u2: '2.6 + 0.25*sin(2*x)', view: [115, 20],
    axes: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', showBase: true, dropLines: true, hiddenEdges: true,
    columns: false, nx: '5', ny: '4',
    solidColor: '#2f7fc1', baseColor: '#e8703a',
    solidLabel: '$E$', baseLabel: '$D$', topLabel: defLabel('z', 2), bottomLabel: defLabel('z', 1),
  };
  const PRESETS = {
    region: {},
    wedge: { base: 'sector', cx: '0', cy: '0', r1: '0.8', r2: '2', t1: '10', t2: '80', u1: '0', u2: '1.6', view: [120, 25], dropLines: false, showBase: false, solidLabel: '', baseLabel: '', topLabel: '', bottomLabel: '' },
    columns: { base: 'rect', cx: '1.5', cy: '1.5', a: '1.2', b: '1.2', u1: '0', u2: '1.2 + 0.6*exp(-((x-1.5)^2+(y-1.5)^2))', columns: true, nx: '5', ny: '5', view: [120, 25], dropLines: false, showBase: false, solidLabel: '', baseLabel: '', topLabel: '$z = f(x, y)$', bottomLabel: '' },
  };
  T.solid = V3.blockType('Solid region', DEFAULT, figure, PRESETS);

  const { sec, row, inp, chk, sel, color, err, help, view } = V3.ui;
  TD.panels = TD.panels || {};
  TD.panels.solid = {
    html(s) {
      const r = T.solid.run(s), A = AXES[s.axis] || AXES.z, [p, q] = A.vars;
      let h = sec('Base region D', row('Solid along', sel('axis', [['z', 'z, over D in the xy-plane'], ['x', 'x, over D in the yz-plane'], ['y', 'y, over D in the xz-plane']], s.axis || 'z'))
        + row('Shape', sel('base', [['ellipse', 'Ellipse or disk'], ['rect', 'Rectangle'], ['polar', 'Polar curve r(θ)'], ['sector', 'Polar rectangle (wedge)']], s.base))
        + row(`Centre (${p}, ${q})`, inp('cx', s.cx) + inp('cy', s.cy))
        + (s.base === 'sector' ? row('r from, to', inp('r1', s.r1) + inp('r2', s.r2)) + row('θ from, to (°)', inp('t1', s.t1) + inp('t2', s.t2))
          : row(s.base === 'polar' ? 'Stretch' : s.base === 'rect' ? 'Half sizes' : 'Radii', inp('a', s.a) + inp('b', s.b)))
        + (s.base === 'polar' ? row('r(θ)', inp('r', s.r, ' title="Use t for θ, in radians"')) : ''));
      h += sec('Solid E', row(`Top u₂(${p}, ${q})`, inp('u2', s.u2)) + row(`Bottom u₁(${p}, ${q})`, inp('u1', s.u1)) + err(r.error)
        + row('Riemann columns', chk('columns', !!s.columns))
        + (s.columns ? row('Columns', inp('nx', s.nx, ' title="Along the first variable"') + inp('ny', s.ny, ' title="Along the second variable"')) : '')
        + row('Solid colour', color(0, s.solidColor)) + row('Base colour', color(1, s.baseColor)));
      h += `<div class="sec"><div class="sec-title">View</div>${view(s)}${row('Axes', chk('axes', s.axes))}`
        + (s.axes !== false ? row('Axis labels', inp('xlabel', s.xlabel) + inp('ylabel', s.ylabel) + inp('zlabel', s.zlabel)) : '')
        + row('Show D', chk('showBase', s.showBase)) + row('Drop lines', chk('dropLines', s.dropLines)) + row('Hidden edges', chk('hiddenEdges', s.hiddenEdges)) + '</div>';
      h += `<div class="sec"><div class="sec-title">Labels</div>${row('Solid', inp('solidLabel', s.solidLabel, ' placeholder="(none)"'))}${row('Base', inp('baseLabel', s.baseLabel, ' placeholder="(none)"'))}`
        + `${row('Top callout', inp('topLabel', s.topLabel, ' placeholder="(none)"'))}${row('Bottom callout', inp('bottomLabel', s.bottomLabel, ' placeholder="(none)"'))}`
        + help(`Surfaces use <code>${p}</code>, <code>${q}</code>, <code>pi</code>, <code>^</code>, sin, cos, exp, sqrt… (radians). r(θ) uses <code>t</code>. Exported as plain TikZ.`) + '</div>';
      return h;
    },
    apply(s, t) {
      if (t.dataset.p === 'axis') {
        const old = s.axis || 'z', nw = t.value;
        if (s.topLabel === defLabel(old, 2)) s.topLabel = defLabel(nw, 2);
        if (s.bottomLabel === defLabel(old, 1)) s.bottomLabel = defLabel(nw, 1);
      }
      return V3.apply(['base', 'axes', 'axis', 'columns'])(s, t);
    },
    action() {},
    color: V3.colors(['solidColor', 'baseColor'], DEFAULT),
  };
})();
