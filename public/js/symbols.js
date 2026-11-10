// Symbol library: one generic box-based shape type ("sym") whose outline is generated from a
// small path builder. Covers rectangle variants, basic shapes, flowchart, block arrows,
// misc (axis, wave, brace, ruler…) and electrical symbols. TikZ export emits the exact
// same path (lines + cubic Béziers), so the canvas and the PDF match.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const f = TD.fmt;

  // ---------- path builder (normalised 0..1 box coords, y down) ----------
  function builder(w, h) {
    const subs = [];
    let cur = null, px = 0, py = 0;
    const X = (u) => u * w, Y = (v) => v * h;
    const push = (seg) => { cur.segs.push(seg); px = seg[seg.length - 2]; py = seg[seg.length - 1]; };
    const b = {
      w, h, subs, labs: [],
      // text label centred at (u,v) — used for axis numbers
      lab(u, v, t) { b.labs.push([X(u), Y(v), t]); return b; },
      u: (pxv) => pxv / w, v: (pxv) => pxv / h, // absolute px → normalised
      M(u, v) { cur = { segs: [], solid: false }; subs.push(cur); push(['M', X(u), Y(v)]); return b; },
      L(u, v) { push(['L', X(u), Y(v)]); return b; },
      C(a, c, d, e, g, k) { push(['C', X(a), Y(c), X(d), Y(e), X(g), Y(k)]); return b; },
      Q(a, c, g, k) {
        const qx = X(a), qy = Y(c), ex = X(g), ey = Y(k);
        push(['C', px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
        return b;
      },
      Z() { cur.segs.push(['Z']); return b; },
      solid() { cur.solid = true; return b; },
      pg(...p) { b.M(p[0], p[1]); for (let i = 2; i < p.length; i += 2) b.L(p[i], p[i + 1]); return b.Z(); },
      pl(...p) { b.M(p[0], p[1]); for (let i = 2; i < p.length; i += 2) b.L(p[i], p[i + 1]); return b; },
      // elliptic arc, angles in degrees (counter-clockwise, y up). cont: continue current subpath
      arc(cu, cv, ru, rv, a1, a2, cont) {
        const rx = ru * w, ry = rv * h, cx = X(cu), cy = Y(cv);
        const P = (a) => [cx + rx * Math.cos(a), cy - ry * Math.sin(a)];
        const D = (a) => [-rx * Math.sin(a), -ry * Math.cos(a)];
        const A1 = (a1 * Math.PI) / 180, A2 = (a2 * Math.PI) / 180;
        const n = Math.max(1, Math.ceil(Math.abs(A2 - A1) / (Math.PI / 2) - 1e-9));
        const d = (A2 - A1) / n, k = (4 / 3) * Math.tan(d / 4);
        const s = P(A1);
        if (cont && cur) push(['L', s[0], s[1]]); else { cur = { segs: [], solid: false }; subs.push(cur); push(['M', s[0], s[1]]); }
        for (let i = 0; i < n; i++) {
          const a = A1 + i * d, e = a + d, p0 = P(a), p1 = P(e), d0 = D(a), d1 = D(e);
          push(['C', p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1]]);
        }
        return b;
      },
      ell(cu, cv, ru, rv) { b.arc(cu, cv, ru, rv, 0, 360); return b.Z(); },
      circ(cu, cv, rpx) { return b.ell(cu, cv, rpx / w, rpx / h); },
      // rectangle with per-corner style: [tl, tr, br, bl], each 0 | 'r' | 's' (round / snip)
      box(u0, v0, u1, v1, corners = [0, 0, 0, 0], rpx = Math.min(w, h) * 0.2) {
        const ru = rpx / w, rv = rpx / h;
        const [tl, tr, br, bl] = corners;
        b.M(u0 + (tl ? ru : 0), v0);
        b.L(u1 - (tr ? ru : 0), v0);
        if (tr === 'r') b.arc(u1 - ru, v0 + rv, ru, rv, 90, 0, true); else if (tr) b.L(u1, v0 + rv);
        b.L(u1, v1 - (br ? rv : 0));
        if (br === 'r') b.arc(u1 - ru, v1 - rv, ru, rv, 0, -90, true); else if (br) b.L(u1 - ru, v1);
        b.L(u0 + (bl ? ru : 0), v1);
        if (bl === 'r') b.arc(u0 + ru, v1 - rv, ru, rv, -90, -180, true); else if (bl) b.L(u0, v1 - rv);
        b.L(u0, v0 + (tl ? rv : 0));
        if (tl === 'r') b.arc(u0 + ru, v0 + rv, ru, rv, 180, 90, true); else if (tl) b.L(u0 + ru, v0);
        return b.Z();
      },
      ngon(n, rot = 90) { const p = []; for (let i = 0; i < n; i++) { const a = ((rot + (360 * i) / n) * Math.PI) / 180; p.push(0.5 + 0.5 * Math.cos(a), 0.5 - 0.5 * Math.sin(a)); } return b.pg(...p); },
      // sampled function y=f(t) for t in [0,1] mapped into [u0,u1]×[v0,v1]
      fn(fun, u0, u1, n = 48) { for (let i = 0; i <= n; i++) { const t = i / n, q = fun(t); i ? b.L(u0 + (u1 - u0) * t, q) : b.M(u0, q); } return b; },
      // filled arrowhead at (u,v) pointing in direction (du,dv) (px-space direction), size px
      head(u, v, du, dv, size = 7) {
        const l = Math.hypot(du, dv) || 1, ux = du / l, uy = dv / l, x = X(u), y = Y(v);
        const p = (a, c) => [(x - ux * a - uy * c) / w, (y - uy * a + ux * c) / h];
        const A = p(size, size * 0.42), B = p(size, -size * 0.42), Cc = p(size * 0.7, 0);
        return b.pg(u, v, A[0], A[1], Cc[0], Cc[1], B[0], B[1]).solid();
      },
    };
    return b;
  }

  // ---------- library ----------
  const LIB = (TD.SYMS = {});
  const CATS = (TD.SYM_CATS = {});
  function S(key, name, cat, opt) {
    LIB[key] = { key, name, cat, size: opt.size || [80, 60], fill: opt.fill !== false, text: opt.text ?? opt.fill !== false, draw: opt.draw, params: opt.params };
    (CATS[cat] = CATS[cat] || []).push(key);
  }

  // rectangles
  const R = (k, n, c) => S(k, n, 'rect', { size: [80, 50], draw: (b) => b.box(0, 0, 1, 1, c) });
  R('rect', 'Rectangle', [0, 0, 0, 0]);
  R('rrect', 'Rounded rectangle', ['r', 'r', 'r', 'r']);
  R('round1', 'Round one corner', ['r', 0, 0, 0]);
  R('round2', 'Round top corners', ['r', 'r', 0, 0]);
  R('rounddiag', 'Round diagonal corners', ['r', 0, 'r', 0]);
  R('snip1', 'Snip one corner', [0, 's', 0, 0]);
  R('snip2', 'Snip top corners', ['s', 's', 0, 0]);
  R('snipdiag', 'Snip diagonal corners', [0, 's', 0, 's']);
  R('sniground', 'Snip and round', ['r', 's', 0, 0]);

  // basic shapes
  const B = (k, n, draw, o = {}) => S(k, n, 'basic', { size: o.size || [60, 60], fill: o.fill, text: o.text, draw });
  B('square', 'Square', (b) => b.box(0, 0, 1, 1));
  B('para', 'Parallelogram', (b) => b.pg(0.25, 0, 1, 0, 0.75, 1, 0, 1), { size: [80, 50] });
  B('tri', 'Triangle', (b) => b.pg(0.5, 0, 1, 1, 0, 1));
  B('rtri', 'Right triangle', (b) => b.pg(0, 0, 1, 1, 0, 1));
  B('trap', 'Trapezoid', (b) => b.pg(0.22, 0, 0.78, 0, 1, 1, 0, 1), { size: [80, 50] });
  B('diamond', 'Diamond', (b) => b.pg(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5));
  B('pent', 'Pentagon', (b) => b.ngon(5));
  B('hex', 'Hexagon', (b) => b.ngon(6, 0));
  B('oct', 'Octagon', (b) => b.ngon(8, 22.5));
  B('dec', 'Decagon', (b) => b.ngon(10, 0));
  B('circle', 'Circle', (b) => b.ell(0.5, 0.5, 0.5, 0.5));
  B('oval', 'Ellipse', (b) => b.ell(0.5, 0.5, 0.5, 0.5), { size: [80, 50] });
  B('chord', 'Chord', (b) => { b.arc(0.5, 0.5, 0.5, 0.5, 60, 300); return b.Z(); });
  B('pie', 'Pie', (b) => { b.M(0.5, 0.5); b.arc(0.5, 0.5, 0.5, 0.5, 45, 315, true); return b.Z(); });
  B('frame', 'Frame', (b) => { b.box(0, 0, 1, 1); b.box(0.15, 0.15, 0.85, 0.85); return b; });
  B('halfframe', 'Half frame', (b) => b.pg(0, 0, 1, 0, 0.8, 0.2, 0.2, 0.2, 0.2, 0.8, 0, 1));
  B('lshape', 'L-shape', (b) => b.pg(0, 0, 0.4, 0, 0.4, 0.6, 1, 0.6, 1, 1, 0, 1));
  B('stripe', 'Diagonal stripe', (b) => b.pg(0, 0.5, 0.5, 0, 1, 0, 0, 1));
  B('cross', 'Cross', (b) => b.pg(0.33, 0, 0.67, 0, 0.67, 0.33, 1, 0.33, 1, 0.67, 0.67, 0.67, 0.67, 1, 0.33, 1, 0.33, 0.67, 0, 0.67, 0, 0.33, 0.33, 0.33));
  B('plaque', 'Plaque', (b) => {
    const r = 0.16;
    b.M(r, 0).L(1 - r, 0).arc(1, 0, r, r, 180, 270, true).L(1, 1 - r).arc(1, 1, r, r, 90, 180, true)
      .L(r, 1).arc(0, 1, r, r, 0, 90, true).L(0, r).arc(0, 0, r, r, 270, 360, true);
    return b.Z();
  }, { size: [80, 50] });
  B('can', 'Can', (b) => {
    const e = 0.12;
    b.M(0, e).arc(0.5, e, 0.5, e, 180, 360, true).L(1, 1 - e).arc(0.5, 1 - e, 0.5, e, 0, -180, true).Z();
    b.arc(0.5, e, 0.5, e, 0, 180); return b;
  }, { size: [50, 70] });
  B('cube', 'Cube', (b) => {
    const d = 0.25;
    b.pg(0, d, 1 - d, d, 1 - d, 1, 0, 1); b.pg(0, d, d, 0, 1, 0, 1, 1 - d, 1 - d, 1, 1 - d, d); b.pl(1 - d, d, 1, 0); return b;
  });
  B('bevel', 'Bevel', (b) => { b.box(0, 0, 1, 1); b.box(0.15, 0.15, 0.85, 0.85); b.pl(0, 0, 0.15, 0.15); b.pl(1, 0, 0.85, 0.15); b.pl(1, 1, 0.85, 0.85); b.pl(0, 1, 0.15, 0.85); return b; });
  B('donut', 'Donut', (b) => { b.ell(0.5, 0.5, 0.5, 0.5); b.ell(0.5, 0.5, 0.25, 0.25); return b; });
  B('blockarc', 'Block arc', (b) => { b.arc(0.5, 0.5, 0.5, 0.5, 40, 320); b.arc(0.5, 0.5, 0.25, 0.25, 320, 40, true); return b.Z(); });
  B('folded', 'Folded corner', (b) => { b.pg(0, 0, 1, 0, 1, 0.75, 0.75, 1, 0, 1); b.pl(1, 0.75, 0.8, 0.8, 0.75, 1); return b; });
  B('moon', 'Moon', (b) => { b.arc(0.6, 0.5, 0.5, 0.5, 90, 270); b.C(0.2, 0.9, 0.2, 0.1, 0.6, 0); return b.Z(); }, { size: [50, 60] });
  B('teardrop', 'Teardrop', (b) => { b.M(1, 0).L(1, 0.5); b.arc(0.5, 0.5, 0.5, 0.5, 0, -270, true); return b.Z(); });
  B('cloud', 'Cloud', (b) => {
    b.M(0.18, 0.78).C(0.0, 0.78, 0.0, 0.48, 0.16, 0.46).C(0.1, 0.22, 0.36, 0.12, 0.44, 0.24).C(0.5, 0.04, 0.78, 0.06, 0.78, 0.26)
      .C(0.98, 0.24, 1.04, 0.5, 0.9, 0.58).C(1.02, 0.78, 0.84, 0.94, 0.7, 0.86).C(0.62, 1.0, 0.36, 1.0, 0.32, 0.86).C(0.26, 0.9, 0.18, 0.86, 0.18, 0.78);
    return b.Z();
  }, { size: [90, 60] });
  B('smiley', 'Smiley', (b) => { b.ell(0.5, 0.5, 0.5, 0.5); b.ell(0.35, 0.38, 0.05, 0.06); b.ell(0.65, 0.38, 0.05, 0.06); b.arc(0.5, 0.5, 0.28, 0.25, 200, 340); return b; }, { text: false });
  B('corner', 'Corner', (b) => b.pl(0, 0, 1, 0, 1, 1), { fill: false });
  B('star', 'Star', (b) => { const p = []; for (let i = 0; i < 10; i++) { const a = ((90 + 36 * i) * Math.PI) / 180, r = i % 2 ? 0.2 : 0.5; p.push(0.5 + r * Math.cos(a), 0.55 - r * Math.sin(a)); } return b.pg(...p); });
  B('spiral', 'Spiral', (b) => { const n = 120; for (let i = 0; i <= n; i++) { const t = (i / n) * 3 * 2 * Math.PI, r = 0.5 * (i / n); const u = 0.5 + r * Math.cos(t), v = 0.5 - r * Math.sin(t); i ? b.L(u, v) : b.M(u, v); } return b; }, { fill: false });

  // flowchart
  const F = (k, n, draw, o = {}) => S(k, n, 'flow', { size: o.size || [90, 50], fill: o.fill, draw });
  F('fc-process', 'Process', (b) => b.box(0, 0, 1, 1));
  F('fc-alt', 'Alternate process', (b) => b.box(0, 0, 1, 1, ['r', 'r', 'r', 'r']));
  F('fc-decision', 'Decision', (b) => b.pg(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5), { size: [90, 60] });
  F('fc-data', 'Data', (b) => b.pg(0.2, 0, 1, 0, 0.8, 1, 0, 1));
  F('fc-predef', 'Predefined process', (b) => { b.box(0, 0, 1, 1); b.pl(0.1, 0, 0.1, 1); b.pl(0.9, 0, 0.9, 1); return b; });
  F('fc-storage', 'Internal storage', (b) => { b.box(0, 0, 1, 1); b.pl(0.15, 0, 0.15, 1); b.pl(0, 0.22, 1, 0.22); return b; });
  F('fc-doc', 'Document', (b) => b.M(0, 0).L(1, 0).L(1, 0.85).C(0.75, 0.65, 0.5, 1.1, 0, 0.9).Z());
  F('fc-multidoc', 'Multidocument', (b) => {
    b.pl(0.12, 0.08, 0.12, 0, 1, 0, 1, 0.72, 0.94, 0.7); b.pl(0.06, 0.16, 0.06, 0.08, 0.94, 0.08, 0.94, 0.8, 0.88, 0.78);
    return b.M(0, 0.16).L(0.88, 0.16).L(0.88, 0.88).C(0.66, 0.72, 0.44, 1.08, 0, 0.92).Z();
  });
  F('fc-term', 'Terminator', (b) => b.box(0, 0, 1, 1, ['r', 'r', 'r', 'r'], 25));
  F('fc-prep', 'Preparation', (b) => b.pg(0.15, 0, 0.85, 0, 1, 0.5, 0.85, 1, 0.15, 1, 0, 0.5));
  F('fc-manin', 'Manual input', (b) => b.pg(0, 0.3, 1, 0, 1, 1, 0, 1));
  F('fc-manop', 'Manual operation', (b) => b.pg(0, 0, 1, 0, 0.8, 1, 0.2, 1));
  F('fc-conn', 'Connector', (b) => b.ell(0.5, 0.5, 0.5, 0.5), { size: [40, 40] });
  F('fc-offpage', 'Off-page connector', (b) => b.pg(0, 0, 1, 0, 1, 0.7, 0.5, 1, 0, 0.7), { size: [50, 50] });
  F('fc-card', 'Card', (b) => b.pg(0.2, 0, 1, 0, 1, 1, 0, 1, 0, 0.35));
  F('fc-tape', 'Punched tape', (b) => b.M(0, 0.1).C(0.25, -0.15, 0.25, 0.35, 0.5, 0.1).C(0.75, -0.15, 0.75, 0.35, 1, 0.1).L(1, 0.9).C(0.75, 1.15, 0.75, 0.65, 0.5, 0.9).C(0.25, 1.15, 0.25, 0.65, 0, 0.9).Z());
  F('fc-sumjunc', 'Summing junction', (b) => { b.ell(0.5, 0.5, 0.5, 0.5); const d = 0.3536; b.pl(0.5 - d, 0.5 - d, 0.5 + d, 0.5 + d); b.pl(0.5 + d, 0.5 - d, 0.5 - d, 0.5 + d); return b; }, { size: [40, 40] });
  F('fc-or', 'Or', (b) => { b.ell(0.5, 0.5, 0.5, 0.5); b.pl(0.5, 0, 0.5, 1); b.pl(0, 0.5, 1, 0.5); return b; }, { size: [40, 40] });
  F('fc-collate', 'Collate', (b) => b.pg(0, 0, 1, 0, 0, 1, 1, 1), { size: [40, 50] });
  F('fc-sort', 'Sort', (b) => { b.pg(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5); b.pl(0, 0.5, 1, 0.5); return b; }, { size: [50, 60] });
  F('fc-extract', 'Extract', (b) => b.pg(0.5, 0, 1, 1, 0, 1), { size: [50, 45] });
  F('fc-merge', 'Merge', (b) => b.pg(0, 0, 1, 0, 0.5, 1), { size: [50, 45] });
  F('fc-stored', 'Stored data', (b) => b.M(0.15, 0).L(1, 0).C(0.88, 0.25, 0.88, 0.75, 1, 1).L(0.15, 1).C(0.03, 0.75, 0.03, 0.25, 0.15, 0).Z());
  F('fc-delay', 'Delay', (b) => { b.M(0, 0).L(0.6, 0); b.arc(0.6, 0.5, 0.4, 0.5, 90, -90, true); b.L(0, 1); return b.Z(); });
  F('fc-seq', 'Sequential access storage', (b) => { b.arc(0.5, 0.5, 0.5, 0.5, -90, 270); b.L(1, 1); return b; }, { size: [50, 50] });
  F('fc-disk', 'Magnetic disk', LIB.can.draw, { size: [60, 60] });
  F('fc-direct', 'Direct access storage', (b) => {
    const e = 0.12;
    b.M(e, 0).L(1 - e, 0).arc(1 - e, 0.5, e, 0.5, 90, -90, true).L(e, 1).arc(e, 0.5, e, 0.5, 270, 90, true).Z();
    b.arc(1 - e, 0.5, e, 0.5, 90, 270); return b;
  });
  F('fc-display', 'Display', (b) => { b.M(0, 0.5).L(0.2, 0).L(0.8, 0); b.arc(0.8, 0.5, 0.2, 0.5, 90, -90, true); b.L(0.2, 1); return b.Z(); });

  // block arrows (pointing right unless named otherwise; rotate with Ctrl+R)
  const A = (k, n, draw, o = {}) => S(k, n, 'arrow', { size: o.size || [80, 50], fill: o.fill, text: o.text ?? false, draw });
  A('ar-open', 'Arrowhead', (b) => b.pl(0, 0, 1, 0.5, 0, 1), { fill: false, size: [30, 40] });
  A('ar-double', 'Double arrowhead', (b) => { b.pl(0, 0, 0.55, 0.5, 0, 1); b.pl(0.45, 0, 1, 0.5, 0.45, 1); return b; }, { fill: false, size: [40, 40] });
  A('ar-stealth', 'Stealth head', (b) => b.pg(0, 0, 1, 0.5, 0, 1, 0.3, 0.5), { size: [36, 40] });
  A('ar-thin', 'Thin arrowhead', (b) => b.pl(0, 0.1, 1, 0.5, 0, 0.9), { fill: false, size: [30, 30] });
  A('ar-oplus', 'Circled plus', (b) => { b.ell(0.5, 0.5, 0.5, 0.5); b.pl(0.5, 0, 0.5, 1); b.pl(0, 0.5, 1, 0.5); return b; }, { size: [30, 30] });
  A('ar-plus', 'Plus mark', (b) => { b.pl(0.5, 0, 0.5, 1); b.pl(0, 0.5, 1, 0.5); return b; }, { fill: false, size: [30, 30] });
  const right = [0, 0.25, 0.6, 0.25, 0.6, 0, 1, 0.5, 0.6, 1, 0.6, 0.75, 0, 0.75];
  A('ar-right', 'Right arrow', (b) => b.pg(...right));
  A('ar-left', 'Left arrow', (b) => b.pg(...right.map((v, i) => (i % 2 ? v : 1 - v))));
  A('ar-up', 'Up arrow', (b) => b.pg(...right.map((v, i, a) => (i % 2 ? 1 - a[i - 1] : a[i + 1]))), { size: [50, 80] });
  A('ar-down', 'Down arrow', (b) => b.pg(...right.map((v, i, a) => (i % 2 ? a[i - 1] : a[i + 1]))), { size: [50, 80] });
  A('ar-lr', 'Left-right arrow', (b) => b.pg(0, 0.5, 0.25, 0, 0.25, 0.25, 0.75, 0.25, 0.75, 0, 1, 0.5, 0.75, 1, 0.75, 0.75, 0.25, 0.75, 0.25, 1), { size: [90, 45] });
  A('ar-ud', 'Up-down arrow', (b) => b.pg(0.5, 0, 1, 0.25, 0.75, 0.25, 0.75, 0.75, 1, 0.75, 0.5, 1, 0, 0.75, 0.25, 0.75, 0.25, 0.25, 0, 0.25), { size: [45, 90] });
  A('ar-quad', 'Quad arrow', (b) => b.pg(0.5, 0, 0.65, 0.15, 0.56, 0.15, 0.56, 0.44, 0.85, 0.44, 0.85, 0.35, 1, 0.5, 0.85, 0.65, 0.85, 0.56, 0.56, 0.56, 0.56, 0.85, 0.65, 0.85, 0.5, 1, 0.35, 0.85, 0.44, 0.85, 0.44, 0.56, 0.15, 0.56, 0.15, 0.65, 0, 0.5, 0.15, 0.35, 0.15, 0.44, 0.44, 0.44, 0.44, 0.15, 0.35, 0.15), { size: [70, 70] });
  A('ar-lru', 'Left-right-up arrow', (b) => b.pg(0.5, 0, 0.65, 0.2, 0.57, 0.2, 0.57, 0.64, 0.82, 0.64, 0.82, 0.5, 1, 0.75, 0.82, 1, 0.82, 0.86, 0.18, 0.86, 0.18, 1, 0, 0.75, 0.18, 0.5, 0.18, 0.64, 0.43, 0.64, 0.43, 0.2, 0.35, 0.2), { size: [80, 60] });
  A('ar-bent', 'Bent arrow', (b) => { b.M(0, 1).L(0, 0.55); b.arc(0.45, 0.55, 0.45, 0.3, 180, 90, true); b.L(0.7, 0.25).L(0.7, 0).L(1, 0.4).L(0.7, 0.8).L(0.7, 0.55).L(0.45, 0.55); b.arc(0.45, 0.85, 0.2, 0.3, 90, 180, true); b.L(0.25, 1); return b.Z(); }, { size: [70, 70] });
  A('ar-uturn', 'U-turn arrow', (b) => { b.M(0, 1).L(0, 0.45); b.arc(0.42, 0.45, 0.42, 0.45, 180, 0, true); b.L(1, 0.55).L(0.67, 0.55).L(0.67, 0.45); b.arc(0.42, 0.45, 0.25, 0.25, 0, 180, true); b.L(0.17, 1); b.Z(); b.pg(0.62, 0.55, 1.05, 0.55, 0.835, 0.85); return b; }, { size: [70, 70] });
  A('ar-leftup', 'Left-up arrow', (b) => b.pg(0.15, 0.5, 0.35, 0.3, 0.35, 0.42, 0.62, 0.42, 0.62, 0.2, 0.5, 0.2, 0.7, 0, 0.9, 0.2, 0.78, 0.2, 0.78, 0.58, 0.35, 0.58, 0.35, 0.7), { size: [60, 60] });
  A('ar-bentup', 'Bent-up arrow', (b) => b.pg(0, 0.7, 0.6, 0.7, 0.6, 0.3, 0.45, 0.3, 0.75, 0, 1, 0.3, 0.85, 0.3, 0.85, 1, 0, 1), { size: [60, 60] });
  A('ar-circl', 'Circular arrow (left)', (b) => { b.arc(0.5, 0.55, 0.5, 0.35, 20, 340); b.arc(0.5, 0.55, 0.33, 0.2, 330, 30, true); b.L(0.68, 0.32).L(0.95, 0.25).L(0.88, 0.5).Z(); return b; }, { size: [70, 60] });
  A('ar-circr', 'Circular arrow (right)', (b) => { b.arc(0.5, 0.55, 0.5, 0.35, 160, -160); b.arc(0.5, 0.55, 0.33, 0.2, -150, 150, true); b.L(0.32, 0.32).L(0.05, 0.25).L(0.12, 0.5).Z(); return b; }, { size: [70, 60] });
  A('ar-striped', 'Striped right arrow', (b) => { b.pg(0.22, 0.25, 0.62, 0.25, 0.62, 0, 1, 0.5, 0.62, 1, 0.62, 0.75, 0.22, 0.75); b.box(0, 0.25, 0.05, 0.75); b.box(0.09, 0.25, 0.16, 0.75); return b; });
  A('ar-notched', 'Notched right arrow', (b) => b.pg(0, 0.25, 0.6, 0.25, 0.6, 0, 1, 0.5, 0.6, 1, 0.6, 0.75, 0, 0.75, 0.15, 0.5));
  A('ar-home', 'Pentagon', (b) => b.pg(0, 0, 0.75, 0, 1, 0.5, 0.75, 1, 0, 1), { text: true });
  A('ar-chevron', 'Chevron', (b) => b.pg(0, 0, 0.7, 0, 1, 0.5, 0.7, 1, 0, 1, 0.3, 0.5), { text: true });
  A('ar-callout', 'Right arrow callout', (b) => b.pg(0, 0, 0.6, 0, 0.6, 0.3, 0.8, 0.3, 0.8, 0.15, 1, 0.5, 0.8, 0.85, 0.8, 0.7, 0.6, 0.7, 0.6, 1, 0, 1), { text: true, size: [90, 55] });
  A('ar-lrcallout', 'Left-right arrow callout', (b) => b.pg(0.25, 0, 0.75, 0, 0.75, 0.3, 0.85, 0.3, 0.85, 0.15, 1, 0.5, 0.85, 0.85, 0.85, 0.7, 0.75, 0.7, 0.75, 1, 0.25, 1, 0.25, 0.7, 0.15, 0.7, 0.15, 0.85, 0, 0.5, 0.15, 0.15, 0.15, 0.3, 0.25, 0.3), { text: true, size: [110, 55] });
  A('ar-quadc', 'Quad arrow callout', (b) => b.pg(0.5, 0, 0.62, 0.12, 0.56, 0.12, 0.56, 0.3, 0.7, 0.3, 0.7, 0.44, 0.88, 0.44, 0.88, 0.38, 1, 0.5, 0.88, 0.62, 0.88, 0.56, 0.7, 0.56, 0.7, 0.7, 0.56, 0.7, 0.56, 0.88, 0.62, 0.88, 0.5, 1, 0.38, 0.88, 0.44, 0.88, 0.44, 0.7, 0.3, 0.7, 0.3, 0.56, 0.12, 0.56, 0.12, 0.62, 0, 0.5, 0.12, 0.38, 0.12, 0.44, 0.3, 0.44, 0.3, 0.3, 0.44, 0.3, 0.44, 0.12, 0.38, 0.12), { size: [70, 70] });
  A('ar-move', 'Move arrows', (b) => {
    const H = (u, v, du, dv) => b.head(u, v, du, dv, 9);
    b.pl(0.5, 0.06, 0.5, 0.94); b.pl(0.06, 0.5, 0.94, 0.5); H(0.5, 0, 0, -1); H(0.5, 1, 0, 1); H(0, 0.5, -1, 0); H(1, 0.5, 1, 0); return b;
  }, { fill: false, size: [50, 50] });

  // misc
  // Fixed-size details (wavelength, coil pitch, tick spacing, grid cell…) are in px, so resizing
  // these adds periods / loops / ticks / cells instead of stretching them (as Mathcha does).
  const Mi = (k, n, draw, o = {}) => S(k, n, 'misc', { size: o.size || [80, 50], fill: !!o.fill, text: false, draw, params: o.params });
  // cubic Hermite through samples of a parametric curve: P(t) → [x,y] px, D(t) → [dx/dt, dy/dt]
  const herm = (b, P, D, t0, t1, dt) => {
    const n = Math.max(1, Math.ceil((t1 - t0) / dt - 1e-9)), h = (t1 - t0) / n;
    let p = P(t0), d = D(t0);
    b.M(b.u(p[0]), b.v(p[1]));
    for (let i = 1; i <= n; i++) {
      const t = t0 + i * h, q = P(t), e = D(t);
      b.C(b.u(p[0] + (d[0] * h) / 3), b.v(p[1] + (d[1] * h) / 3), b.u(q[0] - (e[0] * h) / 3), b.v(q[1] - (e[1] * h) / 3), b.u(q[0]), b.v(q[1]));
      p = q; d = e;
    }
    return b;
  };
  const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  Mi('m-axis', 'Axis', (b, s) => {
    const W = b.w, H = b.h, o = 8, tk = +s.tick || 0, X0 = o, Y0 = H - o;
    b.pl(0, b.v(Y0), 1, b.v(Y0)); b.pl(b.u(X0), 1, b.u(X0), 0);
    b.head(1, b.v(Y0), 1, 0); b.head(b.u(X0), 0, 0, -1);
    if (tk >= 4) {
      for (let k = 1; X0 + k * tk <= W - 10; k++) { const x = X0 + k * tk; b.pl(b.u(x), b.v(Y0 - 3), b.u(x), b.v(Y0 + 3)); if (s.nums) b.lab(b.u(x), b.v(Y0 + 11), String(k)); }
      for (let k = 1; Y0 - k * tk >= 10; k++) { const y = Y0 - k * tk; b.pl(b.u(X0 - 3), b.v(y), b.u(X0 + 3), b.v(y)); if (s.nums) b.lab(b.u(X0 - 10), b.v(y), String(k)); }
    }
    return b;
  }, { size: [120, 100], params: { tick: 0, nums: false } });
  Mi('m-wave', 'Wave', (b, s) => {
    const wl = num(s.wl, 45), A = b.h / 2, k = (2 * Math.PI) / wl, ph = ((+s.phase || 0) / 100) * 2 * Math.PI;
    return herm(b, (x) => [x, A - A * Math.sin(k * x + ph)], (x) => [1, -A * k * Math.cos(k * x + ph)], 0, b.w, wl / 4);
  }, { size: [135, 40], params: { wl: 45, phase: 0 } });
  Mi('m-parab', 'y = x²', (b) => b.fn((t) => (2 * t - 1) ** 2, 0, 1), { size: [60, 60] });
  Mi('m-cubic', 'y = x³', (b) => b.fn((t) => 0.5 - 0.5 * (2 * t - 1) ** 3, 0, 1), { size: [60, 60] });
  Mi('m-coil', 'Coil spring', (b, s) => {
    // prolate cycloid: advances `pitch` px per loop; `loop` px is how far each loop swings back
    const p = num(s.pitch, 20), c = p / (2 * Math.PI), R = c + num(s.loop, 6), A = b.h / 2;
    const n = Math.max(1, Math.round((b.w - 2 * R) / p)), T = 2 * Math.PI * n, t0 = ((+s.phase || 0) / 100) * 2 * Math.PI;
    const raw = (t) => c * (t - t0) + R * Math.sin(t);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 400; i++) { const x = raw(t0 + (T * i) / 400); lo = Math.min(lo, x); hi = Math.max(hi, x); }
    const k = b.w / Math.max(1e-6, hi - lo);
    return herm(b, (t) => [(raw(t) - lo) * k, A - A * Math.cos(t)], (t) => [(c + R * Math.cos(t)) * k, A * Math.sin(t)], t0, t0 + T, Math.PI / 4);
  }, { size: [120, 30], params: { pitch: 20, loop: 6, phase: 0 } });
  // curls keep their size; stretching only lengthens the straight parts
  Mi('m-brace', 'Brace', (b) => {
    const W = b.w, H = b.h, r = Math.min(H, W / 4), m = W / 2, U = b.u, V = b.v, q = V(H / 2 - r * 0.28);
    return b.M(0, 1).C(0, V(H - r * 0.55), U(r * 0.45), 0.5, U(r), 0.5).L(U(m - r), 0.5).C(U(m - r * 0.45), 0.5, U(m), q, U(m), 0)
      .M(U(m), 0).C(U(m), q, U(m + r * 0.45), 0.5, U(m + r), 0.5).L(U(W - r), 0.5).C(U(W - r * 0.45), 0.5, 1, V(H - r * 0.55), 1, 1);
  }, { size: [120, 16] });
  Mi('m-ruler', 'Ruler', (b, s) => {
    const g = num(s.tick, 10), t = num(s.ticksz, 8), H = b.h / 2;
    b.pl(0, 0.5, 1, 0.5);
    for (let i = 0; i * g <= b.w + 1e-6; i++) { const l = Math.min(H, (i % 5 ? t : t * 1.75) / 2); b.pl(b.u(i * g), b.v(H - l), b.u(i * g), b.v(H + l)); }
    return b;
  }, { size: [120, 16], params: { tick: 10, ticksz: 8 } });
  Mi('m-arcruler', 'Arc ruler', (b) => {
    b.arc(0.5, 1, 0.45, 0.8, 150, 30);
    for (let i = 0; i <= 12; i++) { const a = ((150 - i * 10) * Math.PI) / 180, l = i % 6 ? 0.06 : 0.12; b.pl(0.5 + (0.45 - l) * Math.cos(a), 1 - (0.8 - 2 * l) * Math.sin(a), 0.5 + (0.45 + l) * Math.cos(a), 1 - (0.8 + 2 * l) * Math.sin(a)); }
    return b;
  }, { size: [100, 60] });
  Mi('m-grid', 'Grid', (b, s) => {
    const g = num(s.cell, 20), sh = (((+s.shift || 0) % g) + g) % g;
    if (s.frame !== false) b.box(0, 0, 1, 1);
    for (let x = sh; x <= b.w + 1e-6; x += g) if (s.frame === false || (x > 0.5 && x < b.w - 0.5)) b.pl(b.u(x), 0, b.u(x), 1);
    for (let y = sh; y <= b.h + 1e-6; y += g) if (s.frame === false || (y > 0.5 && y < b.h - 0.5)) b.pl(0, b.v(y), 1, b.v(y));
    return b;
  }, { size: [100, 80], fill: true, params: { cell: 20, shift: 0, frame: true } });

  // electrical (leads exit at left/right middle)
  const E = (k, n, draw, o = {}) => S(k, n, 'elec', { size: o.size || [80, 40], fill: false, text: false, draw });
  const lead = (b, a = 0.25, c = 0.75) => { b.pl(0, 0.5, a, 0.5); b.pl(c, 0.5, 1, 0.5); };
  const inputs = (b, x) => { b.pl(0, 0.3, x, 0.3); b.pl(0, 0.7, x, 0.7); };
  const bub = (b, u) => b.ell(u, 0.5, b.u(4), b.v(4));
  const andBody = (b) => { b.M(0.2, 0.05).L(0.5, 0.05); b.arc(0.5, 0.5, 0.25, 0.45, 90, -90, true); b.L(0.2, 0.95); return b.Z(); };
  const orBody = (b) => b.M(0.2, 0.05).C(0.5, 0.05, 0.68, 0.15, 0.75, 0.5).C(0.68, 0.85, 0.5, 0.95, 0.2, 0.95).C(0.3, 0.75, 0.3, 0.25, 0.2, 0.05).Z();
  E('e-and', 'AND gate', (b) => { andBody(b); inputs(b, 0.2); return b.pl(0.75, 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-nand', 'NAND gate', (b) => { andBody(b); inputs(b, 0.2); bub(b, 0.75 + b.u(4)); return b.pl(0.75 + b.u(8), 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-or', 'OR gate', (b) => { orBody(b); inputs(b, 0.26); return b.pl(0.75, 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-xor', 'XOR gate', (b) => { orBody(b); b.M(0.13, 0.05).C(0.23, 0.25, 0.23, 0.75, 0.13, 0.95); inputs(b, 0.2); return b.pl(0.75, 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-nor', 'NOR gate', (b) => { orBody(b); inputs(b, 0.26); bub(b, 0.75 + b.u(4)); return b.pl(0.75 + b.u(8), 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-not', 'NOT gate', (b) => { b.pg(0.25, 0.1, 0.68, 0.5, 0.25, 0.9); bub(b, 0.68 + b.u(4)); b.pl(0, 0.5, 0.25, 0.5); return b.pl(0.68 + b.u(8), 0.5, 1, 0.5); }, { size: [80, 50] });
  E('e-res', 'Resistor (box)', (b) => { lead(b); return b.box(0.25, 0.3, 0.75, 0.7); });
  E('e-resz', 'Resistor (zigzag)', (b) => { b.M(0, 0.5).L(0.2, 0.5); for (let i = 0; i < 6; i++) b.L(0.2 + (i + 0.5) * (0.6 / 6), i % 2 ? 0.8 : 0.2); return b.L(0.8, 0.5).L(1, 0.5); });
  E('e-heater', 'Heating element', (b) => { b.M(0, 0.5).L(0.15, 0.5); for (let i = 0; i < 5; i++) { const x = 0.15 + i * 0.14; b.L(x, 0.2).L(x + 0.07, 0.2).L(x + 0.07, 0.8).L(x + 0.14, 0.8); } return b.L(0.85, 0.5).L(1, 0.5); });
  E('e-cap', 'Capacitor', (b) => { lead(b, 0.45, 0.55); b.pl(0.45, 0.1, 0.45, 0.9); return b.pl(0.55, 0.1, 0.55, 0.9); });
  E('e-ind', 'Inductor', (b) => { b.pl(0, 0.7, 0.2, 0.7); for (let i = 0; i < 4; i++) b.arc(0.275 + i * 0.15, 0.7, 0.075, 0.5, 180, 0, true); return b.L(1, 0.7); });
  E('e-indcore', 'Inductor (core)', (b) => { LIB['e-ind'].draw(b); return b.pl(0.2, 0.08, 0.8, 0.08); });
  E('e-coil', 'Coil', (b) => { b.pl(0, 0.5, 0.15, 0.5); for (let i = 0; i < 5; i++) b.arc(0.22 + i * 0.13, 0.5, 0.08, 0.4, 180, -180, true); return b.L(1, 0.5); });
  E('e-switch', 'Switch', (b) => { b.pl(0, 0.6, 0.3, 0.6); b.pl(0.3, 0.6, 0.68, 0.15); b.pl(0.7, 0.6, 1, 0.6); bub(b, 0.3); return bub(b, 0.7); });
  E('e-spdt', 'Two-way switch', (b) => { b.pl(0, 0.55, 0.3, 0.55); b.pl(0.3, 0.55, 0.68, 0.2); b.pl(0.7, 0.25, 1, 0.25); b.pl(0.7, 0.85, 1, 0.85); bub(b, 0.3); return bub(b, 0.7); }, { size: [80, 40] });
  E('e-push', 'Push button', (b) => { b.pl(0, 0.75, 0.3, 0.75); b.pl(0.7, 0.75, 1, 0.75); bub(b, 0.3); b.pl(0.25, 0.45, 0.75, 0.45); b.pl(0.5, 0.45, 0.5, 0.1); return b; });
  E('e-diode', 'Diode', (b) => { lead(b, 0.35, 0.65); b.pg(0.35, 0.15, 0.65, 0.5, 0.35, 0.85); return b.pl(0.65, 0.15, 0.65, 0.85); });
  E('e-speaker', 'Speaker', (b) => { b.pl(0, 0.4, 0.3, 0.4); b.pl(0, 0.6, 0.3, 0.6); b.box(0.3, 0.3, 0.45, 0.7); return b.pg(0.45, 0.3, 0.75, 0.05, 0.75, 0.95, 0.45, 0.7); }, { size: [60, 50] });
  E('e-headph', 'Earphone', (b) => { b.arc(0.5, 0.65, 0.4, 0.55, 180, 0); b.box(0.04, 0.6, 0.18, 1); return b.box(0.82, 0.6, 0.96, 1); }, { size: [50, 45] });
  E('e-battery', 'Battery', (b) => { lead(b, 0.45, 0.55); b.pl(0.45, 0.05, 0.45, 0.95); return b.pl(0.55, 0.3, 0.55, 0.7); });
  E('e-fuse', 'Fuse', (b) => { b.pl(0, 0.5, 1, 0.5); return b.box(0.3, 0.38, 0.7, 0.62); });
  E('e-lamp', 'Lamp', (b) => { lead(b, 0.32, 0.68); b.circ(0.5, 0.5, 14); const d = 10 / 80, e = 10 / 40; b.pl(0.5 - d, 0.5 - e, 0.5 + d, 0.5 + e); return b.pl(0.5 + d, 0.5 - e, 0.5 - d, 0.5 + e); });
  E('e-bell', 'Bell', (b) => { b.arc(0.5, 0.6, 0.3, 0.5, 180, 0); b.L(0.8, 0.6).L(0.2, 0.6).Z(); b.pl(0.4, 0.6, 0.4, 1); return b.pl(0.6, 0.6, 0.6, 1); }, { size: [40, 40] });
  E('e-capplain', 'Capacitor (gap)', (b) => { b.pl(0, 0.5, 0.42, 0.5); b.pl(0.42, 0.15, 0.42, 0.85); b.pl(0.58, 0.15, 0.58, 0.85); return b.pl(0.58, 0.5, 1, 0.5); });
  E('e-capvar', 'Variable capacitor', (b) => { LIB['e-cap'].draw(b); return b.pl(0.3, 0.9, 0.7, 0.1); });
  E('e-cappol', 'Polarised capacitor', (b) => { lead(b, 0.45, 0.58); b.pl(0.45, 0.1, 0.45, 0.9); return b.M(0.62, 0.1).Q(0.52, 0.5, 0.62, 0.9); });
  E('e-source', 'Source / meter', (b) => { lead(b, 0.32, 0.68); return b.circ(0.5, 0.5, 14); });
  E('e-antenna', 'Antenna', (b) => b.pl(0, 0, 0.5, 0.45, 1, 0).M(0.5, 0.45).L(0.5, 1), { size: [40, 40] });
  E('e-ground', 'Ground', (b) => { b.pl(0.5, 0, 0.5, 0.35); return b.pg(0, 0.35, 1, 0.35, 0.5, 1); }, { size: [40, 30] });
  E('e-memristor', 'Memristor', (b) => {
    lead(b, 0.2, 0.8); b.box(0.2, 0.22, 0.8, 0.78);
    b.pl(0.2, 0.5, 0.28, 0.5, 0.28, 0.35, 0.38, 0.35, 0.38, 0.65, 0.48, 0.65, 0.48, 0.35, 0.58, 0.35, 0.58, 0.65, 0.66, 0.65, 0.66, 0.5, 0.72, 0.5);
    return b.box(0.72, 0.22, 0.8, 0.78).solid();
  });
  E('e-indair', 'Inductor (air core)', (b) => {
    // looped coil (prolate trochoid): four overlapping turns
    const n = 4, a = 0.6 / (2 * Math.PI * n), r = 0.055;
    b.pl(0, 0.62, 0.2 - r, 0.62);
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * 2 * Math.PI * n + Math.PI;
      b.L(0.2 + a * (t - Math.PI) + r * Math.cos(t) + r, 0.62 + 0.42 * Math.sin(t) * (Math.sin(t) < 0 ? 1 : 0.35));
    }
    return b.L(1, 0.62);
  });
  E('e-stayput', 'Stay-put switch', (b) => {
    b.pl(0, 0.65, 0.3, 0.65); b.pl(0.3, 0.65, 0.68, 0.2); b.pl(0.7, 0.65, 1, 0.65); bub(b, 0.3); bub(b, 0.7);
    // detent: a small notch under the blade that holds it in place
    return b.pl(0.42, 0.5, 0.5, 0.62, 0.58, 0.5);
  }, { size: [80, 40] });
  E('e-bulb', 'Light bulb', (b) => {
    lead(b, 0.32, 0.68); b.ell(0.5, 0.5, 0.18, 0.36);
    // filament: up from each side and a loop over the top
    b.pl(0.32, 0.5, 0.42, 0.5, 0.42, 0.42); b.pl(0.68, 0.5, 0.58, 0.5, 0.58, 0.42);
    return b.M(0.42, 0.42).C(0.42, 0.12, 0.58, 0.12, 0.58, 0.42);
  });
  E('e-contact', 'Contact (normally open)', (b) => { lead(b, 0.42, 0.58); b.pl(0.42, 0.2, 0.42, 0.8); return b.pl(0.58, 0.2, 0.58, 0.8); });
  E('e-ncontact', 'Contact (normally closed)', (b) => { LIB['e-contact'].draw(b); return b.pl(0.32, 0.9, 0.68, 0.1); });
  E('e-output', 'Output terminal', (b) => { b.pl(0, 0.5, 0.4, 0.5); return b.pg(0.4, 0.2, 0.8, 0.2, 1, 0.5, 0.8, 0.8, 0.4, 0.8); }, { size: [70, 30] });

  // waveforms: periodic like the Wave, so resizing adds periods. One period is a list of pieces on
  // t ∈ [a, b] (y: 0 trough, 1 crest); a piece with a slope d is curved (cubic Hermite), else straight.
  // A file from before wavelengths had none: then one period fills the width, as it used to.
  const periodic = (B, s, pieces) => {
    const W = B.w, wl = num(s.wl, W), ph = ((((+s.phase || 0) / 100) % 1) + 1) % 1;
    const X = (k, t) => (k + t - ph) * wl;
    let last = null;
    const pt = (x, y) => {
      if (!last) B.M(x / W, 1 - y);
      else if (Math.abs(last[0] - x) > 1e-6 || Math.abs(last[1] - y) > 1e-6) B.L(x / W, 1 - y);
      last = [x, y];
    };
    for (let k = -1; X(k, 0) < W - 1e-9; k++) for (const p of pieces) {
      const x0 = X(k, p.a), x1 = X(k, p.b);
      if (x1 <= 1e-9 || x0 >= W - 1e-9) continue;
      const ta = x0 < 0 ? p.a - x0 / wl : p.a, tb = x1 > W ? p.b - (x1 - W) / wl : p.b;
      pt(X(k, ta), p.f(ta));
      if (!p.d) { pt(X(k, tb), p.f(tb)); continue; }
      const n = Math.max(1, Math.ceil((tb - ta) / 0.125 - 1e-9)), h = (tb - ta) / n;
      for (let i = 1; i <= n; i++) {
        const t0 = ta + (i - 1) * h, t1 = ta + i * h, y0 = p.f(t0), y1 = p.f(t1), xa = X(k, t0), xb = X(k, t1);
        B.C((xa + (wl * h) / 3) / W, 1 - (y0 + (p.d(t0) * h) / 3), (xb - (wl * h) / 3) / W, 1 - (y1 - (p.d(t1) * h) / 3), xb / W, 1 - y1);
        last = [xb, y1];
      }
    }
    return B;
  };
  const PI2 = 2 * Math.PI;
  const flat = (a, b, y) => ({ a, b, f: () => y });
  const ramp = (a, b, y0, y1) => ({ a, b, f: (t) => y0 + ((y1 - y0) * (t - a)) / (b - a) });
  const sine = (a, b) => ({ a, b, f: (t) => 0.5 + 0.5 * Math.sin(PI2 * t), d: (t) => Math.PI * Math.cos(PI2 * t) });
  const duty = (s, d) => Math.min(0.95, Math.max(0.05, (Number.isFinite(+s.duty) ? +s.duty : d) / 100));
  const Wv = (k, n, pieces, params = {}) => S(k, n, 'wave', { size: [135, 40], fill: false, text: false, params: { wl: 45, phase: 0, ...params }, draw: (b, s) => periodic(b, s, pieces(s)) });
  Wv('e-sine', 'Sine', () => [sine(0, 1)]);
  Wv('e-square', 'Square wave', (s) => { const d = duty(s, 50); return [flat(0, d, 1), flat(d, 1, 0)]; }, { duty: 50 });
  Wv('e-pulse', 'Pulse', (s) => { const d = duty(s, 30), a = (1 - d) / 2; return [flat(0, a, 0), flat(a, a + d, 1), flat(a + d, 1, 0)]; }, { duty: 30 });
  Wv('e-npulse', 'Negative pulse', (s) => { const d = duty(s, 30), a = (1 - d) / 2; return [flat(0, a, 1), flat(a, a + d, 0), flat(a + d, 1, 1)]; }, { duty: 30 });
  Wv('e-tri', 'Triangle wave', () => [ramp(0, 0.5, 0, 1), ramp(0.5, 1, 1, 0)]);
  Wv('e-saw', 'Sawtooth', () => [ramp(0, 1, 0, 1)]);
  Wv('e-trap', 'Trapezoid wave', () => [flat(0, 0.25, 0), ramp(0.25, 0.4, 0, 1), flat(0.4, 0.6, 1), ramp(0.6, 0.75, 1, 0), flat(0.75, 1, 0)]);
  Wv('e-rect', 'Rectified sine', () => [{ a: 0, b: 1, f: (t) => Math.sin(Math.PI * t), d: (t) => Math.PI * Math.cos(Math.PI * t) }]);
  Wv('e-halfrect', 'Half-wave rectified', () => [{ a: 0, b: 0.5, f: (t) => Math.sin(PI2 * t), d: (t) => PI2 * Math.cos(PI2 * t) }, flat(0.5, 1, 0)]);
  // phase-cut sine: each half cycle switches on at the firing angle
  Wv('e-chopped', 'Chopped wave', (s) => {
    const a = Math.min(175, Math.max(0, Number.isFinite(+s.fire) ? +s.fire : 60)) / 360;
    return [flat(0, a, 0.5), sine(a, 0.5), flat(0.5, 0.5 + a, 0.5), sine(0.5 + a, 1)];
  }, { fire: 60 });

  // ---------- geometry with rotation / flips ----------
  // rot: clockwise quarter turns (on screen). fx/fy: mirror in the shape's own frame (applied first).
  function geom(s) {
    const def = LIB[s.kind] || LIB.rect;
    const odd = (s.rot || 0) % 2 === 1;
    const lw = odd ? s.h : s.w, lh = odd ? s.w : s.h;
    const b = builder(Math.max(lw, 1e-6), Math.max(lh, 1e-6));
    def.draw(b, def.params ? { ...def.params, ...s } : s);
    const k = (s.rot || 0) % 4;
    const xf = symXf(s);
    const map = (u, v) => {
      if (s.fx) u = lw - u;
      if (s.fy) v = lh - v;
      let x, y;
      if (k === 0) [x, y] = [u, v];
      else if (k === 1) [x, y] = [lh - v, u];
      else if (k === 2) [x, y] = [lw - u, lh - v];
      else [x, y] = [v, lw - u];
      return xf(s.x + x, s.y + y);
    };
    const out = b.subs.map((sp) => ({
      solid: sp.solid,
      closed: sp.segs[sp.segs.length - 1][0] === 'Z',
      segs: sp.segs.map((g) => {
        if (g[0] === 'Z') return g;
        const o = [g[0]];
        for (let i = 1; i < g.length; i += 2) o.push(...map(g[i], g[i + 1]));
        return o;
      }),
    }));
    out.labs = b.labs.map(([u, v, t]) => [...map(u, v), t]);
    return out;
  }
  // free rotation (degrees, counter-clockwise) and horizontal skew about the box centre
  function symXf(s) {
    const a = (-(+s.angle || 0) * Math.PI) / 180, k = Math.tan(((+s.skew || 0) * Math.PI) / 180);
    if (!a && !k) return (x, y) => [x, y];
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2, c = Math.cos(a), n = Math.sin(a);
    return (x, y) => { let dx = x - cx; const dy = y - cy; dx -= k * dy; return [cx + c * dx - n * dy, cy + n * dx + c * dy]; };
  }
  function symInv(s) {
    const a = ((+s.angle || 0) * Math.PI) / 180, k = Math.tan(((+s.skew || 0) * Math.PI) / 180);
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2, c = Math.cos(a), n = Math.sin(a);
    return (x, y) => { const X = x - cx, Y = y - cy, dx = c * X - n * Y, dy = n * X + c * Y; return [cx + dx + k * dy, cy + dy]; };
  }
  TD.symXf = symXf;
  TD.symGeom = geom;
  const dOf = (subs) => subs.map((sp) => sp.segs.map((g) => g[0] + (g.length > 1 ? g.slice(1).map(r2).join(',') : '')).join('')).join('');

  // small icon for menus (fits a 34×24 viewBox)
  TD.symIcon = function (key) {
    const def = LIB[key];
    const [w0, h0] = def.size, sc = Math.min(28 / w0, 18 / h0);
    const w = w0 * sc, h = h0 * sc;
    // px-parametric symbols are drawn at their natural size, then shrunk to the icon
    const big = !!def.params || def.cat === 'misc';
    const subs = big ? geom({ kind: key, x: 0, y: 0, w: w0, h: h0 }) : geom({ kind: key, x: (34 - w) / 2, y: (24 - h) / 2, w, h });
    const main = subs.filter((p) => !p.solid), solid = subs.filter((p) => p.solid);
    const inner = `<path d="${dOf(main)}" fill="none" fill-rule="evenodd"${big ? ' vector-effect="non-scaling-stroke"' : ''}/>${solid.length ? `<path d="${dOf(solid)}" class="f"/>` : ''}`;
    return `<svg viewBox="0 0 34 24">${big ? `<g transform="translate(${r2((34 - w) / 2)} ${r2((24 - h) / 2)}) scale(${r2(sc)})">${inner}</g>` : inner}</svg>`;
  };

  // ---------- the shape type ----------
  const css = TD.css;
  const LAB_ST = { size: 'scriptsize', font: 'default' };
  const TYPE_SYM = (TD.TYPES.sym = {
    name: 'Shape',
    pts: [['x', 'y']],
    create(p, d, tool) {
      const kind = (tool || '').split(':')[1] || 'rect', def = LIB[kind] || LIB.rect;
      const s = { type: 'sym', kind, x: p.x, y: p.y, w: 0, h: 0, rot: 0, fx: false, fy: false, stroke: d.stroke || '#000000', width: d.width, dash: d.dash, opacity: 1 };
      if (def.fill) s.fill = d.fill || null;
      if (def.params) Object.assign(s, def.params);
      s.angle = 0; s.skew = 0;
      if (def.text) Object.assign(s, { text: '', size: d.size || 'normalsize', font: d.font || 'default', bold: false, italic: false, color: d.color || '#000000' });
      return s;
    },
    drag(s, a, q, e) { Object.assign(s, TD.box.drag(a, q, e)); },
    fix(s) {
      if (s.w < 4 && s.h < 4) { const [w, h] = LIB[s.kind].size; s.x -= w / 2; s.y -= h / 2; s.w = w; s.h = h; }
    },
    valid: (s) => s.w > 2 || s.h > 2,
    // handles turn with a free rotation / skew; resizing keeps the opposite handle where it is
    handles(s) { const t = symXf(s); return TD.box.handles(s).map((h) => { const [x, y] = t(h.x, h.y); return { k: h.k, x, y }; }); },
    setHandle(s, k, q, e, o) {
      if (!+o.angle && !+o.skew) { Object.assign(s, TD.box.resize(o, k, q, e)); return; }
      const [lx, ly] = symInv(o)(q.x, q.y);
      const r = TD.box.resize(o, k, { x: lx, y: ly }, e);
      const opp = k.replace(/[nsew]/g, (c) => ({ n: 's', s: 'n', e: 'w', w: 'e' })[c]);
      const at = (b) => TD.box.handles(b).find((h) => h.k === opp) || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      // the opposite handle keeps its place in the box frame (even when the drag crosses over it)
      const A = at(o), [ax, ay] = symXf(o)(A.x, A.y), [bx, by] = symXf({ ...o, ...r })(A.x, A.y);
      Object.assign(s, r, { x: r.x + ax - bx, y: r.y + ay - by });
    },
    anchors: (s) => TYPE_SYM.handles(s).map((h) => ({ x: h.x, y: h.y })).concat([{ x: s.x + s.w / 2, y: s.y + s.h / 2 }]),
    samples(s) { const t = symXf(s); return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map(([x, y]) => { const [X, Y] = t(x, y); return { x: X, y: Y }; }); },
    svg(s, ctx) {
      const def = LIB[s.kind] || LIB.rect;
      const subs = geom(s), main = subs.filter((p) => !p.solid), solid = subs.filter((p) => p.solid);
      const d = dOf(main), ds = dOf(solid);
      const col = s.stroke ? css(s.stroke) : 'none';
      const dar = TD.dashArray(s.dash, s.width), da = dar ? `stroke-dasharray="${dar}"` : '';
      let out = `<path d="${d}" fill="${def.fill && s.fill ? css(s.fill) : 'none'}" fill-rule="evenodd" stroke="${col}" stroke-width="${s.width}" ${da} stroke-linejoin="round"/>`;
      if (ds) out += `<path d="${ds}" fill="${css(s.stroke || '#000000')}" stroke="none"/>`;
      for (const [x, y, t] of subs.labs) out += TD.textSvg(`$${t}$`, LAB_ST, s.stroke || '#000000', x, y, ctx);
      if (s.text) out += TD.textSvg(s.text, s, s.color || '#000', s.x + s.w / 2, s.y + s.h / 2, ctx);
      if (s.opacity != null && s.opacity < 1) out = `<g opacity="${s.opacity}">${out}</g>`;
      if (!ctx.export) {
        out += `<path class="hit" d="${d}${ds}" stroke-width="${ctx.hit}"/>`;
        if (def.fill || def.text) out += `<path class="hitfill" d="${d}"/>`;
      }
      return out;
    },
    tikz(s, X) {
      const def = LIB[s.kind] || LIB.rect;
      const subs = geom(s);
      const path = (list) => list.map((sp) => {
        let o = '';
        for (const g of sp.segs) {
          if (g[0] === 'M') o += (o ? ' ' : '') + X.c(g[1], g[2]);
          else if (g[0] === 'L') o += ' -- ' + X.c(g[1], g[2]);
          else if (g[0] === 'C') o += ` .. controls ${X.c(g[1], g[2])} and ${X.c(g[3], g[4])} .. ${X.c(g[5], g[6])}`;
          else o += ' -- cycle';
        }
        return o;
      }).join(' ');
      const lines = [];
      const main = subs.filter((p) => !p.solid), solid = subs.filter((p) => p.solid);
      const fill = def.fill && s.fill;
      if (main.length && (s.stroke || fill)) {
        const o = TD.styleOpts(s, X, { fill: !!fill });
        if (fill && main.length > 1) o.push('even odd rule');
        o.push('line join=round');
        lines.push(`${s.stroke ? '\\draw' : typeof fill === 'object' ? '\\path' : '\\fill'}${TD.tikzOpts(o)} ${path(main)};`);
      }
      if (solid.length && s.stroke) {
        const o = [X.col(s.stroke)];
        if (s.opacity != null && s.opacity < 1) o.push(`opacity=${f(s.opacity)}`);
        lines.push(`\\fill[${o.join(', ')}] ${path(solid)};`);
      }
      for (const [x, y, t] of subs.labs) lines.push(`\\node[font=\\scriptsize${s.stroke && s.stroke !== '#000000' ? ', ' + X.col(s.stroke) : ''}] at ${X.c(x, y)} {$${t}$};`);
      if (s.text && s.text.trim()) {
        const o = TD.textOpts(s, X);
        o.push('align=center');
        if (s.opacity != null && s.opacity < 1) o.push(`opacity=${f(s.opacity)}`);
        lines.push(`\\node${TD.tikzOpts(o)} at ${X.c(s.x + s.w / 2, s.y + s.h / 2)} {${TD.tikzText(s.text)}};`);
      }
      return lines.join('\n');
    },
  });

  // ---------- image ----------
  const extOf = (src) => ((/^data:image\/(png|jpe?g|gif|webp|svg)/.exec(src || '') || [])[1] || 'png').replace('jpeg', 'jpg').replace('svg', 'svg');
  TD.TYPES.image = {
    name: 'Image',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'image', x: p.x, y: p.y, w: 0, h: 0, src: '', file: '', opacity: 1 }),
    drag(s, a, q, e) { Object.assign(s, TD.box.drag(a, q, e)); },
    valid: (s) => !!s.src && s.w > 2 && s.h > 2,
    handles: (s) => TD.box.handles(s),
    setHandle(s, k, q, e, o) {
      const b = TD.box.resize(o, k, q, e);
      if (k.length === 2 && !e.altKey) { // corners keep the aspect ratio (Alt to stretch)
        const r = o.w / o.h;
        if (b.w / b.h > r) b.w = b.h * r; else b.h = b.w / r;
        if (k.includes('w')) b.x = o.x + o.w - b.w;
        if (k.includes('n')) b.y = o.y + o.h - b.h;
      }
      if (b.w > 4 && b.h > 4) Object.assign(s, b);
    },
    anchors: (s) => TD.box.handles(s).map((h) => ({ x: h.x, y: h.y })),
    samples: (s) => [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }],
    fileName: (s) => s.file || `${s.id || 'image'}.${extOf(s.src)}`,
    svg(s, ctx) {
      const op = s.opacity != null && s.opacity < 1 ? ` opacity="${s.opacity}"` : '';
      return `<image href="${esc(s.src)}" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" preserveAspectRatio="none"${op}/>` +
        (ctx.export ? '' : `<rect class="hitfill" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}"/>`);
    },
    tikz(s, X) {
      X.pkgs.add('graphicx');
      const name = this.fileName(s);
      const o = ['anchor=north west', 'inner sep=0pt'];
      if (s.opacity != null && s.opacity < 1) o.push(`opacity=${f(s.opacity)}`);
      return `% image file: ${name} (Image panel → Download)\n\\node[${o.join(', ')}] at ${X.c(s.x, s.y)} {\\includegraphics[width=${X.len(s.w)}cm, height=${X.len(s.h)}cm]{${name}}};`;
    },
  };
  TD.panels = TD.panels || {};
  TD.panels.image = {
    html: (s) => `<div class="sec"><div class="sec-title">Image file</div>
      <div class="row"><label>File name</label><div class="ctl"><input type="text" data-img="file" value="${esc(TD.TYPES.image.fileName(s))}"></div></div>
      <div class="btns"><button type="button" data-imgact="download">Download</button><button type="button" data-imgact="replace">Replace…</button></div>
      <div class="hint-line">Save the file next to your .tex; the export uses <code>\\includegraphics</code>. Drag a corner to resize (Alt stretches).</div></div>`,
    apply(s, t) { if (t.dataset.img === 'file') s.file = t.value.trim(); },
  };
})();
