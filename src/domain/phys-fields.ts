import { runtime as TD } from '../runtime';
// Physics block, fields: point charges in vacuum (Coulomb), long straight wires (Biot–Savart, currents through
// the page) and a uniform field. Electric field lines are integrated (RK4) from the charges; equipotentials and
// magnetic field lines are level curves (marching squares) of V and of the vector potential A_z, so magnetic
// line density follows |B| exactly. Positions are centimetres of the drawing; `unit` says how long that is.
(function () {
  const P = TD.physics, G = P.G;
  const K_E = 8.9875517923e9, MU0_2PI = 2e-7;
  const RED = '#c0392b', BLUE = '#1f5fa8', GREEN = '#2e7d32';
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const LABEL = txt('label', 'Label', '', { math: true });

  const commands: Record<string, any> = {
    charge: { label: 'Point charge', cat: 'Sources', args: 1, params: [num('q', 'Charge', 1e-9, { dim: 'charge', unit: 'nC', nonzero: true }), LABEL], make: (x: any, y: any) => `\\charge[q=1nC](${P.fmt(x)}, ${P.fmt(y)})` },
    wire: { label: 'Wire (through the page)', cat: 'Sources', args: 1, params: [num('I', 'Current', 1, { dim: 'current', unit: 'A', nonzero: true, help: 'Positive: out of the page (⊙); negative: into it (⊗)' }), LABEL], make: (x: any, y: any) => `\\wire[I=1A](${P.fmt(x)}, ${P.fmt(y)})` },
    uniform: { label: 'Uniform field', cat: 'Sources', args: 0, params: [num('E', 'Field strength', 1000, { dim: 'efield', unit: 'N/C', min: 0 }), num('angle', 'Direction', 0, { unit: '°', step: 15 })], make: () => '\\uniform[E=1000N/C, angle=0]' },
    fieldlines: { label: 'Electric field lines', cat: 'Fields', args: 0, params: [num('n', 'Lines per largest charge', 12, { min: 1, max: 48, step: 1, int: true }), txt('color', 'Colour', '#000000', { color: true })], make: () => '\\fieldlines[n=12]' },
    equipotentials: { label: 'Equipotentials', cat: 'Fields', args: 0, params: [num('n', 'Levels per sign', 4, { min: 1, max: 20, step: 1, int: true }), txt('levels', 'Levels (V)', '', { help: 'A list such as {-20, 0, 20}; empty: chosen for the figure' }), txt('color', 'Colour', BLUE, { color: true })], make: () => '\\equipotentials[n=4]' },
    Blines: { label: 'Magnetic field lines', cat: 'Fields', args: 0, params: [num('n', 'Density', 6, { min: 1, max: 24, step: 1, int: true }), txt('color', 'Colour', GREEN, { color: true })], make: () => '\\Blines[n=6]' },
    probe: { label: 'Field probe', cat: 'Fields', args: 1, params: [LABEL, num('len', 'Arrow length', 1.2, { unit: 'cm', min: 0.2, help: 'The longest probe arrow; the others scale with the field' })], make: (x: any, y: any) => `\\probe[label=$P$](${P.fmt(x)}, ${P.fmt(y)})` },
    region: { label: 'Region', cat: 'Settings', args: 2, argHelp: '(x0, y0)(x1, y1)', params: [txt('frame', 'Frame', 'false', { kind: 'bool', help: 'Draw a thin frame round the region' })], make: (x: any, y: any) => `\\region(${P.fmt(x - 3)}, ${P.fmt(y - 2)})(${P.fmt(x + 3)}, ${P.fmt(y + 2)})` },
    setup: { label: 'Settings', cat: 'Settings', args: 0, params: [num('unit', 'Drawing unit', 0.01, { dim: 'len', unit: 'cm', help: 'The physical length of 1 cm of the drawing' })], make: () => '\\setup[unit=1cm]' },
  };
  const EXAMPLE = `\\physics{fields}
% an electric dipole: field lines and equipotentials
\\charge[q=1nC, label=$+q$](-1.2, 0)
\\charge[q=-1nC, label=$-q$](1.2, 0)
\\fieldlines[n=12]
\\equipotentials[n=3]
\\probe[label=$P$](0, 1.5)`;
  const EXAMPLES = {
    'Dipole': EXAMPLE,
    'Unequal charges (null point)': `\\physics{fields}\n\\charge[q=2nC, label=$+2q$](-1, 0)\n\\charge[q=1nC, label=$+q$](1.2, 0)\n\\fieldlines[n=14]\n\\region(-4, -3)(4, 3)`,
    'Charge in a uniform field': `\\physics{fields}\n\\uniform[E=40kV/m, angle=0]\n\\charge[q=1nC, label=$+q$](0.5, 0)\n\\fieldlines[n=10]\n\\region(-3, -2.4)(3, 2.4)`,
    'Antiparallel currents': `\\physics{fields}\n\\wire[I=2A, label=$I$](-1, 0)\n\\wire[I=-2A, label=$-I$](1, 0)\n\\Blines[n=6]\n\\probe[label=$P$](0, 1)\n\\region(-3.5, -2.5)(3.5, 2.5)`,
    'Single wire': `\\physics{fields}\n\\wire[I=5A, label=$I$](0, 0)\n\\Blines[n=5]\n\\probe(1.5, 0)\n\\region(-2.5, -2.5)(2.5, 2.5)`,
  };

  function solve(M: any, S: any) {
    const Q: any[] = [], W: any[] = [], probes: any[] = [], setup = { unit: 0.01 };
    let uni: any = null, FL: any = null, EQ: any = null, BL: any = null, region: any = null;
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const { v, warn } = P.read(L, commands[L.cmd]);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      const at = () => { const q = P.pos(L, 0); if (q.ref || q.bad) S.warn(`\\${L.cmd}: the position must be (x, y)`); return q.p || [0, 0]; };
      switch (L.cmd) {
        case 'setup': Object.assign(setup, v); break;
        case 'charge': Q.push({ i, q: v.q, c: at(), v }); break;
        case 'wire': W.push({ i, I: v.I, c: at(), v }); break;
        case 'probe': probes.push({ i, c: at(), v }); break;
        case 'uniform': if (uni) S.warn('\\uniform: only one uniform field; this one is ignored'); else uni = { i, E: G.mul(G.dir(v.angle), v.E), v }; break;
        case 'fieldlines': FL = { i, v }; break;
        case 'equipotentials': EQ = { i, v }; break;
        case 'Blines': BL = { i, v }; break;
        case 'region': {
          const a = P.pos(L, 0), b = P.pos(L, 1);
          if (a.ref || b.ref || a.missing || b.missing) break;
          region = { i, frame: P.read(L, commands.region).v.frame, x0: Math.min(a.p[0], b.p[0]), x1: Math.max(a.p[0], b.p[0]), y0: Math.min(a.p[1], b.p[1]), y1: Math.max(a.p[1], b.p[1]) };
          if (region.x1 - region.x0 < 0.5 || region.y1 - region.y0 < 0.5) { S.warn('\\region is too small'); region = null; }
        }
      }
    });
    const u = setup.unit;
    // fields in SI at a point of the drawing (cm → m by `unit`)
    const E = (p: any) => {
      let ex = uni ? uni.E[0] : 0, ey = uni ? uni.E[1] : 0;
      for (const c of Q) { const dx = (p[0] - c.c[0]) * u, dy = (p[1] - c.c[1]) * u, r2 = dx * dx + dy * dy, r3 = r2 * Math.sqrt(r2); ex += (K_E * c.q * dx) / r3; ey += (K_E * c.q * dy) / r3; }
      return [ex, ey];
    };
    const V = (p: any) => {
      let v = uni ? -(uni.E[0] * p[0] + uni.E[1] * p[1]) * u : 0;
      for (const c of Q) v += (K_E * c.q) / (G.dist(p, c.c) * u);
      return v;
    };
    const A = (p: any) => { let a = 0; for (const w of W) a -= MU0_2PI * w.I * Math.log(G.dist(p, w.c) * u); return a; };
    const B = (p: any) => { let bx = 0, by = 0; for (const w of W) { const dx = (p[0] - w.c[0]) * u, dy = (p[1] - w.c[1]) * u, r2 = dx * dx + dy * dy; bx -= (MU0_2PI * w.I * dy) / r2; by += (MU0_2PI * w.I * dx) / r2; } return [bx, by]; };

    // the region
    let F = region;
    if (!F) {
      const pts = [...Q, ...W, ...probes].map((o) => o.c);
      if (!pts.length) pts.push([0, 0]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      F = { x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, y0: Math.min(...ys) - 2, y1: Math.max(...ys) + 2 };
      const cx = (F.x0 + F.x1) / 2, cy = (F.y0 + F.y1) / 2;
      if (F.x1 - F.x0 < 5) { F.x0 = cx - 2.5; F.x1 = cx + 2.5; }
      if (F.y1 - F.y0 < 4) { F.y0 = cy - 2; F.y1 = cy + 2; }
    }
    if (!Q.length && !W.length && !uni) { S.obj = -1; S.warn('add a charge, a wire or a uniform field'); }
    S.obj = region ? region.i : -1;
    // a thin frame round the region, when asked for
    if (region && region.frame) S.line([[F.x0, F.y0], [F.x1, F.y0], [F.x1, F.y1], [F.x0, F.y1], [F.x0, F.y0]], { w: 'thin', color: '#999999' });
    if (region) {
      S.handle({ at: [F.x0, F.y0], kind: 'corner', drag: (L: any, p: any) => { P.setArg(L, 0, [p[0], p[1]]); } });
      S.handle({ at: [F.x1, F.y1], kind: 'corner', drag: (L: any, p: any) => { P.setArg(L, 1, [p[0], p[1]]); } });
    }
    const inF = (p: any, m = 0) => p[0] >= F.x0 - m && p[0] <= F.x1 + m && p[1] >= F.y0 - m && p[1] <= F.y1 + m;
    for (const c of [...Q, ...W]) if (!inF(c.c)) { S.obj = c.i; S.warn(`\\${Q.includes(c) ? 'charge' : 'wire'} lies outside the region`); }

    // equipotentials first: they sit under the field lines
    const nx = Math.min(220, Math.max(60, Math.round((F.x1 - F.x0) * 24))), ny = Math.min(220, Math.max(60, Math.round((F.y1 - F.y0) * 24)));
    if (EQ) {
      S.obj = EQ.i;
      if (!Q.length && !uni) S.warn('\\equipotentials: there are no charges or uniform field');
      else {
        let levels;
        if (EQ.v.levels) {
          levels = P.parse('\\x(' + EQ.v.levels.replace(/^\{|\}$/g, '') + ')').lines[0].args[0].map((x: any) => parseFloat(x)).filter(isFinite);
          if (!levels.length) S.warn('\\equipotentials: levels is a list of numbers, in volts');
        } else {
          // evenly spaced levels between the potential near the strongest charge and zero
          const n = EQ.v.n;
          let vmax = 0;
          for (const c of Q) vmax = Math.max(vmax, Math.abs(V(G.add(c.c, [0.55, 0.0001]))));
          if (!Q.length) { const corners = [[F.x0, F.y0], [F.x1, F.y0], [F.x1, F.y1], [F.x0, F.y1]].map(V); vmax = Math.max(...corners.map(Math.abs)); }
          const step = vmax / n, has = (s: any) => Q.some((c) => Math.sign(c.q) === s);
          const nice = niceStep(step);
          levels = [];
          for (let k = 1; k <= n; k++) { if (has(1) || !Q.length) levels.push(k * nice); if (has(-1) || !Q.length) levels.push(-k * nice); }
          if ((has(1) && has(-1)) || (!Q.length && uni)) levels.push(0);
          if (!Q.length && uni) { levels = []; const vs = [[F.x0, F.y0], [F.x1, F.y0], [F.x1, F.y1], [F.x0, F.y1]].map(V); const lo = Math.min(...vs), hi = Math.max(...vs), st = niceStep((hi - lo) / (2 * n + 1)); for (let x = Math.ceil(lo / st) * st; x <= hi; x += st) levels.push(x); }
        }
        const col = EQ.v.color || BLUE;
        let drawn = 0;
        for (const lv of levels) {
          for (const pl of G.contours(V, F, nx, ny, lv)) {
            const pts = G.simplify(pl, 0.006);
            if (pts.length < 2 || polyLen(pts) < 0.15) continue;
            S.line(pts, { w: 'thin', color: col, dash: true });
            drawn++;
          }
        }
        S.result('equipotential levels', levels.slice().sort((a: any, b: any) => a - b).map((x: any) => P.sig(x, 3)).join(', ') + ' V', 'exact', 'V = Σ kq/r for point charges in vacuum' + (uni ? ', minus E·r for the uniform field (V = 0 at the origin)' : ''));
        if (!drawn) S.warn('\\equipotentials: no level crosses the region');
      }
    }
    if (BL) {
      S.obj = BL.i;
      if (!W.length) S.warn('\\Blines: there are no wires');
      else {
        const Imax = Math.max(...W.map((w) => Math.abs(w.I)));
        const ratio = 1 + 2.2 / BL.v.n, dA = MU0_2PI * Imax * Math.log(ratio);
        const vals = [];
        for (let j = 0; j <= ny; j += 2) for (let i = 0; i <= nx; i += 2) { const a = A([F.x0 + ((F.x1 - F.x0) * i) / nx, F.y0 + ((F.y1 - F.y0) * j) / ny]); if (isFinite(a)) vals.push(a); }
        const lo = Math.min(...vals), hi = Math.max(...vals), w0 = W.reduce((a, b) => (Math.abs(b.I) > Math.abs(a.I) ? b : a)), base = A(G.add(w0.c, [0.25, 0]));
        const col = BL.v.color || GREEN;
        let count = 0;
        for (let k = Math.ceil((lo - base) / dA); k <= Math.floor((hi - base) / dA) && count < 60; k++, count++) {
          for (const pl of G.contours(A, F, nx, ny, base + k * dA)) {
            let pts = G.simplify(pl, 0.006);
            if (pts.length < 2 || polyLen(pts) < 0.3) continue;
            // orient along B, then mark the direction
            const m = Math.floor(pts.length / 2), b = B(pts[m]), t = G.sub(pts[Math.min(m + 1, pts.length - 1)], pts[Math.max(0, m - 1)]);
            if (G.dot(b, t) < 0) pts = pts.reverse();
            S.line(pts, { w: 'thin', color: col });
            markAt(S, pts, 0.5, col);
          }
        }
        S.result('B lines', `spaced so that their density is proportional to |B|`, 'exact', 'level curves of A_z = −(μ₀/2π) Σ I ln r for infinitely long straight wires; equal steps in A_z give line density ∝ |B|');
      }
    }
    if (FL) {
      S.obj = FL.i;
      if (!Q.length && !uni) S.warn('\\fieldlines: there are no charges or uniform field');
      else fieldLines(S, Q, uni, E, F, FL.v);
    }
    // null points of E (where the charges' fields cancel): a coarse search, then Newton's method
    if (Q.length + (uni ? 1 : 0) >= 2) {
      S.obj = FL ? FL.i : Q[0].i;
      for (const z of nulls(E, F, Q)) {
        S.line(G.arc(z, 0.07, 0, 360, 16), { w: 'thin', color: '#000000' });
        S.result('null point', `(${P.fmt(z[0], 3)}, ${P.fmt(z[1], 3)}) cm`, 'exact', 'where E = 0, solved numerically (Newton’s method) to better than 10⁻⁶ cm');
      }
    }
    // charges and wires on top
    for (const c of Q) {
      S.obj = c.i;
      const col = c.q > 0 ? RED : BLUE, r = 0.17;
      S.circle(c.c, r, { fill: col, stroke: '#000000', w: 'thin' });
      S.line([G.add(c.c, [-0.09, 0]), G.add(c.c, [0.09, 0])], { color: '#ffffff', w: 1 });
      if (c.q > 0) S.line([G.add(c.c, [0, -0.09]), G.add(c.c, [0, 0.09])], { color: '#ffffff', w: 1 });
      if (c.v.label) S.text(G.add(c.c, [0, -r]), c.v.label, { anchor: 'north' });
      S.handle({ at: c.c, kind: 'move', drag: (L: any, p: any) => P.setArg(L, 0, [p[0], p[1]]) });
    }
    for (const w of W) {
      S.obj = w.i;
      const r = 0.17;
      S.circle(w.c, r, { fill: '#ffffff', stroke: '#000000', w: 'normal' });
      if (w.I > 0) S.dot(w.c, { r: 1.6 });
      else { const d = 0.1; S.line([G.add(w.c, [-d, -d]), G.add(w.c, [d, d])], { w: 'normal' }); S.line([G.add(w.c, [-d, d]), G.add(w.c, [d, -d])], { w: 'normal' }); }
      if (w.v.label) S.text(G.add(w.c, [0, -r]), w.v.label, { anchor: 'north' });
      S.handle({ at: w.c, kind: 'move', drag: (L: any, p: any) => P.setArg(L, 0, [p[0], p[1]]) });
    }
    if (uni) {
      S.obj = uni.i;
      S.result('uniform field', `${P.sig(uni.v.E, 4)} N/C at ${P.fmt(uni.v.angle, 2)}°`, 'exact', 'added to the fields of the charges');
    }
    // probes: the field there, drawn to a common scale
    const pv = probes.map((pr) => {
      const near = [...Q, ...W].some((o) => G.dist(o.c, pr.c) < 1e-6);
      return { pr, e: near ? null : (Q.length || uni ? E(pr.c) : null), b: near ? null : (W.length ? B(pr.c) : null), near };
    });
    const eMax = Math.max(0, ...pv.map((x) => (x.e ? G.len(x.e) : 0))), bMax = Math.max(0, ...pv.map((x) => (x.b ? G.len(x.b) : 0)));
    for (const { pr, e, b, near } of pv) {
      S.obj = pr.i;
      S.dot(pr.c, { r: 1.8 });
      if (pr.v.label) S.text(pr.c, pr.v.label, { anchor: 'south east' });
      S.handle({ at: pr.c, kind: 'move', drag: (L: any, p: any) => P.setArg(L, 0, [p[0], p[1]]) });
      if (near) { S.warn('\\probe sits on a charge or wire, where the field is infinite'); continue; }
      const L = pr.v.len;
      if (e && eMax > 0 && G.len(e) > 0) {
        const tip = G.add(pr.c, G.mul(G.norm(e), (L * G.len(e)) / eMax));
        S.arrow(pr.c, tip, { color: RED, w: 'thick' });
        S.text(tip, '$\\vec E$', { push: G.norm(e), color: RED });
        S.result('|E|', `${P.sig(G.len(e), 4)} N/C at ${P.fmt(G.ang(e), 1)}°`, 'exact', 'Coulomb’s law for point charges in vacuum, superposed' + (uni ? ' with the uniform field' : ''));
      }
      if (Q.length) S.result('V', `${P.sig(V(pr.c), 4)} V`, 'exact', 'V = Σ kq/r, zero at infinity' + (uni ? ' (the uniform field’s part is zero at the origin)' : ''));
      if (b && bMax > 0 && G.len(b) > 0) {
        const tip = G.add(pr.c, G.mul(G.norm(b), (L * G.len(b)) / bMax));
        S.arrow(pr.c, tip, { color: GREEN, w: 'thick' });
        S.text(tip, '$\\vec B$', { push: G.norm(b), color: GREEN });
        S.result('|B|', `${P.sig(G.len(b) * 1e6, 4)} µT at ${P.fmt(G.ang(b), 1)}°`, 'exact', 'B = μ₀I/(2πr) for infinitely long straight wires, superposed');
      }
    }
  }
  function nulls(E: any, F: any, Q: any) {
    const nx = 48, ny = 36, cand = [], out: any[] = [], mag = (p: any) => { const e = E(p); return Math.hypot(e[0], e[1]); };
    const far = (p: any) => Q.every((c: any) => G.dist(c.c, p) > 0.15);
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const p = [F.x0 + ((F.x1 - F.x0) * i) / nx, F.y0 + ((F.y1 - F.y0) * j) / ny];
      if (!far(p)) continue;
      const m = mag(p), dx = (F.x1 - F.x0) / nx, dy = (F.y1 - F.y0) / ny;
      if ([[dx, 0], [-dx, 0], [0, dy], [0, -dy]].every((d) => mag(G.add(p, d)) >= m)) cand.push(p);   // a local minimum of |E|
    }
    for (let p of cand) {
      for (let k = 0; k < 40; k++) {
        const e = E(p), h = 1e-6, ex = E([p[0] + h, p[1]]), ey = E([p[0], p[1] + h]);
        const a = (ex[0] - e[0]) / h, b = (ey[0] - e[0]) / h, c = (ex[1] - e[1]) / h, d = (ey[1] - e[1]) / h, det = a * d - b * c;
        if (!isFinite(det) || Math.abs(det) < 1e-30) break;
        const st = [(d * e[0] - b * e[1]) / det, (-c * e[0] + a * e[1]) / det];
        p = G.sub(p, st);
        if (Math.hypot(st[0], st[1]) < 1e-9) break;
      }
      const e = E(p), scale = Math.max(...Q.map((c: any) => mag(G.add(c.c, [0.5, 0]))));   // |E| half a centimetre from a charge
      if (Math.hypot(e[0], e[1]) < scale * 1e-9 && far(p) && p[0] >= F.x0 && p[0] <= F.x1 && p[1] >= F.y0 && p[1] <= F.y1 && !out.some((z) => G.dist(z, p) < 1e-4)) out.push(p);
    }
    return out;
  }
  const polyLen = (pts: any) => { let s = 0; for (let i = 1; i < pts.length; i++) s += G.dist(pts[i - 1], pts[i]); return s; };
  function niceStep(x: any) { if (!(x > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
  function markAt(S: any, pts: any, f: any, color: any) {
    const total = polyLen(pts);
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = G.dist(pts[i - 1], pts[i]);
      if (s + d >= total * f && d > 1e-6) { const t = (total * f - s) / d, m = G.lerp(pts[i - 1], pts[i], t), u = G.norm(G.sub(pts[i], pts[i - 1])); S.line([G.sub(m, G.mul(u, 0.04)), G.add(m, G.mul(u, 0.04))], { color, arrow: true, w: 'thin' }); return; }
      s += d;
    }
  }
  // field lines from the positive charges (n per largest |q|, evenly in angle), then from the negative charges
  // into the gaps the incoming lines leave; with no charges, a uniform field's straight lines
  function fieldLines(S: any, Q: any, uni: any, E: any, F: any, v: any) {
    const col = v.color || '#000000', R0 = 0.2, H = 0.035;
    const qref = Math.max(...Q.map((c: any) => Math.abs(c.q)), 0);
    const want = (c: any) => Math.max(1, Math.round((v.n * Math.abs(c.q)) / qref));
    const out = (p: any) => p[0] < F.x0 || p[0] > F.x1 || p[1] < F.y0 || p[1] > F.y1;
    const dirAt = (p: any, s: any) => { const e = E(p), l = Math.hypot(e[0], e[1]); return l > 0 && isFinite(l) ? [(s * e[0]) / l, (s * e[1]) / l] : null; };
    function integrate(p0: any, s: any, from: any) {
      const pts = [p0];
      let p = p0, end = null;
      for (let k = 0; k < 2400; k++) {
        const k1 = dirAt(p, s); if (!k1) break;
        const k2 = dirAt(G.add(p, G.mul(k1, H / 2)), s); if (!k2) break;
        const k3 = dirAt(G.add(p, G.mul(k2, H / 2)), s); if (!k3) break;
        const k4 = dirAt(G.add(p, G.mul(k3, H)), s); if (!k4) break;
        const q = G.add(p, G.mul(G.add(G.add(k1, G.mul(k2, 2)), G.add(G.mul(k3, 2), k4)), H / 6));
        const hit = Q.find((c: any) => c !== from && G.dist(q, c.c) < R0);
        if (hit) { pts.push(G.add(hit.c, G.mul(G.norm(G.sub(q, hit.c)), R0 * 0.9))); end = hit; break; }
        if (out(q)) { const T = G.clip(p, G.sub(q, p), F, 0, 1); pts.push(T ? T[1] : q); break; }
        pts.push(q); p = q;
        if (k > 40 && G.dist(q, pts[pts.length - 41]) < H * 2) break;   // stuck at a null point
      }
      return { pts, end };
    }
    const lines = [], arrive = new Map();
    const pos = Q.filter((c: any) => c.q > 0), neg = Q.filter((c: any) => c.q < 0);
    for (const c of pos) {
      const n = want(c);
      // start one line toward the nearest opposite charge, so symmetric figures stay symmetric
      const other = neg.slice().sort((a: any, b: any) => G.dist(a.c, c.c) - G.dist(b.c, c.c))[0];
      const a0 = other ? G.ang(G.sub(other.c, c.c)) : uni ? G.ang(uni.E) : 90;
      for (let k = 0; k < n; k++) {
        const a = a0 + (360 * k) / n, L = integrate(G.add(c.c, G.mul(G.dir(a), R0)), 1, c);
        lines.push(L.pts);
        if (L.end && L.end.q < 0) { if (!arrive.has(L.end)) arrive.set(L.end, []); arrive.get(L.end).push(G.ang(G.sub(L.pts[L.pts.length - 1], L.end.c))); }
      }
    }
    for (const c of neg) {
      const got = arrive.get(c) || [], n = want(c);
      const angs = got.slice();
      const a0 = pos.length ? null : uni ? G.ang(uni.E) + 180 : 90;
      for (let k = got.length; k < n; k++) {
        let a;
        if (!angs.length) a = a0 ?? 0;
        else {
          // the middle of the widest gap between the lines already there
          const s = angs.map((x: any) => ((x % 360) + 360) % 360).sort((x: any, y: any) => x - y);
          let best = 0, at = s[0] + 180;
          for (let j = 0; j < s.length; j++) { const nx = j + 1 < s.length ? s[j + 1] : s[0] + 360, g = nx - s[j]; if (g > best) { best = g; at = s[j] + g / 2; } }
          a = at;
        }
        angs.push(a);
        const L = integrate(G.add(c.c, G.mul(G.dir(a), R0)), -1, c);
        lines.push(L.pts.reverse());
      }
    }
    if (!Q.length && uni) {
      const d = G.norm(uni.E), nn = [-d[1], d[0]], c = [(F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2], half = Math.hypot(F.x1 - F.x0, F.y1 - F.y0) / 2, n = v.n;
      for (let k = 0; k < n; k++) {
        const o = G.add(c, G.mul(nn, -half + (2 * half * (k + 0.5)) / n)), seg = G.clip(o, d, F);
        if (seg && G.dist(seg[0], seg[1]) > 0.2) lines.push(seg);
      }
    }
    let total = 0;
    for (const pts of lines) {
      const s = G.simplify(pts, 0.004);
      if (s.length < 2) continue;
      S.line(s, { color: col, w: 'normal' });
      if (polyLen(s) > 0.5) markAt(S, s, 0.5, col);
      total++;
    }
    S.result('field lines', `${total} drawn`, 'schematic', 'each line follows E exactly (RK4); how many start at a charge is proportional to its |q|, but in a plane drawing their spacing is not a measure of |E|');
  }

  P.domain('fields', { label: 'Fields', commands, example: EXAMPLE, examples: EXAMPLES, solve, K_E, MU0_2PI });
})();
