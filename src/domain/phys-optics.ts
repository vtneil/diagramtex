import { runtime as TD } from '../runtime';
// Physics block, optics: a 2D ray tracer. Thin lenses and curved mirrors are ideal (paraxial: every ray from a
// point meets again at one image point); refraction at interfaces, prisms and slabs is Snell's law, exact,
// with total internal reflection; beam splitters split a ray in two; polarizers follow Malus's law; detectors
// add the beams that reach them (two-beam interference). Lengths are centimetres of the drawing.
(function () {
  const P = TD.physics, G = P.G;
  const RED = '#c0392b', BLUE = '#1f5fa8', GLASS = '#e3f0fa';
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const cm = { unit: 'cm' }, deg = { unit: '°', step: 15 };
  const LABEL = txt('label', 'Label', '', { math: true });
  const ANGLE = (def: any) => num('angle', 'Angle', def, { ...deg, help: 'Direction of the element’s surface, from the +x axis' });
  const COLOR = txt('color', 'Colour', RED, { color: true });

  const commands: Record<string, any> = {
    axis: { label: 'Optical axis', args: 1, argHelp: '(from, to)', params: [txt('label', 'Label')], make: (x: any) => `\\axis(${P.fmt(x - 3)}, ${P.fmt(x + 9)})` },
    object: { label: 'Object', cat: 'Sources', args: 1, params: [num('h', 'Height', 1.2, cm), LABEL, txt('rays', 'Rays', 'principal', { kind: 'enum', opts: [['principal', 'Principal rays'], ['none', 'None']] }), COLOR], make: (x: any) => `\\object[h=1.2, label=$O$](${P.fmt(x)})` },
    ray: { label: 'Ray', cat: 'Sources', args: 1, params: [num('angle', 'Direction', 0, deg), COLOR, txt('label', 'Label')], make: (x: any, y: any) => `\\ray[angle=0](${P.fmt(x)}, ${P.fmt(y)})` },
    beam: { label: 'Parallel beam', cat: 'Sources', args: 1, params: [num('angle', 'Direction', 0, deg), num('width', 'Width', 1.2, { ...cm, min: 0 }), num('n', 'Rays', 5, { min: 1, max: 41, step: 1, int: true }), COLOR], make: (x: any, y: any) => `\\beam[width=1.2, n=5](${P.fmt(x)}, ${P.fmt(y)})` },
    source: { label: 'Point source', cat: 'Sources', args: 1, params: [num('from', 'From', -15, deg), num('to', 'To', 15, deg), num('n', 'Rays', 5, { min: 1, max: 61, step: 1, int: true }), COLOR, LABEL], make: (x: any, y: any) => `\\source[from=-15, to=15, n=5](${P.fmt(x)}, ${P.fmt(y)})` },
    laser: { label: 'Laser', cat: 'Sources', args: 1, params: [num('angle', 'Direction', 0, deg), txt('pol', 'Polarisation', '', { help: 'Angle of linear polarisation in degrees; empty: unpolarised' }), COLOR, LABEL], make: (x: any, y: any) => `\\laser(${P.fmt(x)}, ${P.fmt(y)})` },
    lens: { label: 'Thin lens', cat: 'Elements', args: 1, params: [num('f', 'Focal length', 2, { ...cm, nonzero: true, help: 'Positive: converging; negative: diverging' }), num('h', 'Height', 3, { ...cm, min: 0.2 }), ANGLE(90), LABEL, txt('foci', 'Show foci', 'true', { kind: 'bool' })], make: (x: any, y: any) => `\\lens[f=2](${P.fmt(x)}${y ? ', ' + P.fmt(y) : ''})` },
    mirror: { label: 'Mirror', cat: 'Elements', args: 1, params: [num('f', 'Focal length', 0, { ...cm, help: '0: plane; positive: concave; negative: convex' }), num('h', 'Height', 3, { ...cm, min: 0.2 }), ANGLE(90), LABEL, txt('foci', 'Show focus', 'true', { kind: 'bool' })], make: (x: any, y: any) => `\\mirror(${P.fmt(x)}${y ? ', ' + P.fmt(y) : ''})` },
    splitter: { label: 'Beam splitter', cat: 'Elements', args: 1, params: [num('R', 'Reflectance', 0.5, { min: 0, max: 1, step: 0.05 }), num('h', 'Size', 1.2, { ...cm, min: 0.2 }), ANGLE(45), LABEL], make: (x: any, y: any) => `\\splitter(${P.fmt(x)}, ${P.fmt(y)})` },
    interface: { label: 'Interface', cat: 'Elements', args: 1, params: [num('n1', 'Index n₁', 1, { min: 1, step: 0.05, help: 'On the left, looking along the line’s direction (angle)' }), num('n2', 'Index n₂', 1.5, { min: 1, step: 0.05, help: 'On the right, looking along the line’s direction' }), num('h', 'Length', 4, { ...cm, min: 0.2 }), ANGLE(90), LABEL], make: (x: any, y: any) => `\\interface[n1=1, n2=1.5](${P.fmt(x)}, ${P.fmt(y)})` },
    prism: { label: 'Prism', cat: 'Elements', args: 1, params: [num('n', 'Index', 1.5, { min: 1, step: 0.05 }), num('apex', 'Apex angle', 60, { unit: '°', min: 5, max: 150, step: 5 }), num('side', 'Side', 2.4, { ...cm, min: 0.3 }), num('angle', 'Rotation', 0, deg), LABEL], make: (x: any, y: any) => `\\prism[n=1.5](${P.fmt(x)}, ${P.fmt(y)})` },
    slab: { label: 'Glass slab', cat: 'Elements', args: 1, params: [num('n', 'Index', 1.5, { min: 1, step: 0.05 }), num('w', 'Width', 1.5, { ...cm, min: 0.1 }), num('h', 'Height', 3, { ...cm, min: 0.1 }), num('angle', 'Rotation', 0, deg), LABEL], make: (x: any, y: any) => `\\slab[n=1.5](${P.fmt(x)}, ${P.fmt(y)})` },
    polarizer: { label: 'Polariser', cat: 'Elements', args: 1, params: [num('axis', 'Transmission axis', 0, { unit: '°', step: 15 }), num('h', 'Size', 1.2, { ...cm, min: 0.2 }), ANGLE(90), LABEL], make: (x: any, y: any) => `\\polarizer[axis=45](${P.fmt(x)}, ${P.fmt(y)})` },
    phase: { label: 'Phase plate', cat: 'Elements', args: 1, params: [num('phi', 'Phase shift', 90, { unit: '°', step: 15 }), num('h', 'Size', 1.2, { ...cm, min: 0.2 }), ANGLE(90), LABEL], make: (x: any, y: any) => `\\phase[phi=90](${P.fmt(x)}, ${P.fmt(y)})` },
    screen: { label: 'Screen', cat: 'Detectors', args: 1, params: [num('h', 'Height', 4, { ...cm, min: 0.2 }), ANGLE(90), LABEL], make: (x: any, y: any) => `\\screen(${P.fmt(x)}${y ? ', ' + P.fmt(y) : ''})` },
    detector: { label: 'Detector', cat: 'Detectors', args: 1, params: [num('h', 'Size', 0.8, { ...cm, min: 0.2 }), ANGLE(90), LABEL], make: (x: any, y: any) => `\\detector(${P.fmt(x)}, ${P.fmt(y)})` },
    setup: { label: 'Settings', cat: 'Settings', args: 0, params: [num('lambda', 'Wavelength', 633e-9, { dim: 'len', unit: 'nm', min: 1, help: 'For the phase at detectors' }), num('unit', 'Drawing unit', 0.01, { dim: 'len', unit: 'cm', help: 'The physical length of 1 cm of the drawing (for path differences)' }), num('extent', 'Margin', 1.5, { ...cm, min: 0.2, help: 'How far rays run past the outermost element' })], make: () => '\\setup[lambda=633nm]' },
  };

  const EXAMPLE = `\\physics{optics}
% a converging lens forms a real, inverted image: drag the object or the focus
\\axis(-5, 9)
\\object[h=1.2, label=$O$](-3.5)
\\lens[f=2, h=3.4, label=$L$](0)`;
  const EXAMPLES = {
    'Converging lens': EXAMPLE,
    'Magnifying glass (virtual image)': `\\physics{optics}\n\\axis(-4, 4)\n\\object[h=0.8, label=$O$](-1.2)\n\\lens[f=2, h=3, label=$L$](0)`,
    'Concave mirror': `\\physics{optics}\n\\axis(-8, 1)\n\\mirror[f=2, h=3.4, label=$M$](0)\n\\object[h=1, label=$O$](-5)`,
    'Two-lens telescope': `\\physics{optics}\n\\axis(-2, 12)\n\\beam[angle=0, width=1.6, n=5](-1.5, 0)\n\\lens[f=6, h=3, label=$L_1$](0)\n\\lens[f=2, h=2, label=$L_2$](8)`,
    'Refraction and total internal reflection': `\\physics{optics}\n% from glass into air: rays beyond the critical angle are reflected back\n\\interface[n1=1.5, n2=1, h=7, angle=180](0, 0)\n\\source[from=35, to=80, n=7](0, -2.5)`,
    'Prism': `\\physics{optics}\n\\prism[n=1.5, apex=60, side=3](0, 0)\n\\ray[angle=12](-3.5, 0.2)`,
    'Michelson interferometer': `\\physics{optics}\n% equal arms, but a 90° plate in one arm is passed twice: the beams meet out of phase at D\n\\setup[lambda=633nm, unit=1cm]\n\\laser[pol=0, label=laser](-4, 0)\n\\splitter[angle=45, label=BS](0, 0)\n\\phase[phi=90, label=$\\varphi$](1.5, 0)\n\\mirror[angle=90, h=1.2, label=$M_1$](3, 0)\n\\mirror[angle=0, h=1.2, label=$M_2$](0, 3)\n\\detector[angle=0, label=D](0, -2.5)`,
    'Mach–Zehnder with a phase plate': `\\physics{optics}\n\\setup[lambda=633nm]\n\\laser[pol=0, label=laser](-3, 0)\n\\splitter[angle=45, label=$BS_1$](0, 0)\n\\mirror[angle=45, h=1, label=$M_1$](0, 3)\n\\mirror[angle=45, h=1, label=$M_2$](4, 0)\n\\phase[phi=180, label=$\\varphi$](2, 3)\n\\splitter[angle=45, label=$BS_2$](4, 3)\n\\detector[angle=90, label=$D_1$](6, 3)\n\\detector[angle=0, label=$D_2$](4, 5)`,
    'Crossed polarisers (Malus)': `\\physics{optics}\n\\laser(-4, 0)\n\\polarizer[axis=0, label=$P_1$](-1.5, 0)\n\\polarizer[axis=45, label=$P_2$](0.5, 0)\n\\polarizer[axis=90, label=$P_3$](2.5, 0)\n\\detector(4.5, 0)`,
  };

  // ---------------------------------------------------------------- elements
  const onAxis = (el: any) => el.one || (Math.abs(el.c[1]) < 1e-9 && Math.abs(Math.abs(el.angle) - 90) < 1e-9);
  function element(cmd: any, v: any, c: any, i: any, one: any) {
    const angle = v.angle ?? 90, u = G.dir(angle), n = [u[1], -u[0]];
    const el: Record<string, any> = { cmd, v, c, i, u, n, angle, one, segs: [] };
    const seg = (a: any, b: any, extra?: any) => el.segs.push({ a, b, el, ...extra });
    if (cmd === 'prism' || cmd === 'slab') {
      let pts;
      if (cmd === 'prism') {
        // isosceles: apex up (before rotation), the two equal sides `side` long, centred on its centroid
        const A = (v.apex * Math.PI) / 360, s = v.side, hgt = s * Math.cos(A), half = s * Math.sin(A);
        pts = [[0, hgt], [-half, 0], [half, 0]];
        const cy = hgt / 3;
        pts = pts.map((p) => G.add(c, G.rot([p[0], p[1] - cy], v.angle ?? 0)));
      } else pts = [[-v.w / 2, -v.h / 2], [v.w / 2, -v.h / 2], [v.w / 2, v.h / 2], [-v.w / 2, v.h / 2]].map((p) => G.add(c, G.rot(p, v.angle ?? 0)));
      el.poly = pts;
      // counter-clockwise: the outward normal of a→b is (dy, −dx)
      const ccw = G.cross(G.sub(pts[1], pts[0]), G.sub(pts[2], pts[0])) > 0;
      pts.forEach((a, k) => { const b = pts[(k + 1) % pts.length], e = G.norm(G.sub(b, a)); seg(a, b, { out: ccw ? [e[1], -e[0]] : [-e[1], e[0]] }); });
      return el;
    }
    const h = v.h, a = G.add(c, G.mul(u, -h / 2)), b = G.add(c, G.mul(u, h / 2));
    if (cmd === 'detector') { seg(a, b); return el; }
    seg(a, b);
    return el;
  }
  // a ray meeting an element: the rays that leave (each { d, I, pol, nIdx, phase })
  function refract(d: any, N: any, eta: any) {
    const ci = -G.dot(N, d), k = 1 - eta * eta * (1 - ci * ci);
    if (k < 0) return { d: G.sub(d, G.mul(N, 2 * G.dot(d, N))), tir: true };
    return { d: G.norm(G.add(G.mul(d, eta), G.mul(N, eta * ci - Math.sqrt(k)))), tir: false };
  }
  function act(r: any, hp: any, hit: any, rec: any) {
    const el = hit.el, v = el.v, d = r.d;
    const dt = G.dot(d, el.n), ds = G.dot(d, el.u), s = G.dot(G.sub(hp, el.c), el.u);
    switch (el.cmd) {
      case 'lens': {
        const m = ds / Math.abs(dt) - s / v.f;
        return [{ d: G.norm(G.add(G.mul(el.n, Math.sign(dt)), G.mul(el.u, m))) }];
      }
      case 'mirror': {
        const f = v.f ? (dt > 0 ? v.f : -v.f) : Infinity, m = ds / Math.abs(dt) - (isFinite(f) ? s / f : 0);
        return [{ d: G.norm(G.add(G.mul(el.n, -Math.sign(dt)), G.mul(el.u, m))) }];
      }
      case 'splitter': {
        const R = v.R, out = [];
        if (R > 0) out.push({ d: G.norm(G.sub(d, G.mul(el.n, 2 * dt))), I: r.I * R, branch: true });
        if (R < 1) out.push({ d, I: r.I * (1 - R) });
        return out;
      }
      case 'polarizer': {
        const I = r.pol == null ? r.I / 2 : r.I * Math.cos(((r.pol - v.axis) * Math.PI) / 180) ** 2;
        rec.push({ el, I, I0: r.I, pol0: r.pol });
        return I > 1e-9 ? [{ d, I, pol: v.axis }] : [];
      }
      case 'phase': return [{ d, phase: (r.phase || 0) + v.phi }];
      case 'interface': {
        const fwd = dt > 0, eta = fwd ? v.n1 / v.n2 : v.n2 / v.n1, N = fwd ? G.mul(el.n, -1) : el.n;
        const o = refract(d, N, eta);
        if (o.tir) rec.push({ el, tir: true, at: hp });
        return [{ d: o.d, nIdx: o.tir ? r.nIdx : fwd ? v.n2 : v.n1 }];
      }
      case 'prism': case 'slab': {
        const out = hit.seg.out, entering = G.dot(d, out) < 0;
        const o = refract(d, entering ? out : G.mul(out, -1), entering ? 1 / v.n : v.n);
        if (o.tir) rec.push({ el, tir: true, at: hp });
        return [{ d: o.d, nIdx: o.tir ? r.nIdx : entering ? v.n : 1 }];
      }
      case 'screen': case 'detector': rec.push({ el, ray: r, at: hp }); return [];
    }
    return [];
  }
  // where a ray leaves the frame
  function exitT(p: any, d: any, F: any) {
    let t = Infinity;
    for (const [k, lo, hi] of [[0, F.x0, F.x1], [1, F.y0, F.y1]]) {
      if (d[k] > 1e-12) t = Math.min(t, (hi - p[k]) / d[k]);
      else if (d[k] < -1e-12) t = Math.min(t, (lo - p[k]) / d[k]);
    }
    return Math.max(0, t);
  }
  /** Rays from one start, through every element: { segs: [{ a, b, I, chain, last }], rec: [events] }. */
  function trace(start: any, els: any, F: any, opt: Record<string, any> = {}) {
    const segs = [], rec: any[] = [];
    const queue = [{ I: 1, pol: null, nIdx: 1, opl: 0, phase: 0, chain: 0, depth: 0, ...start }];
    let chains = 1, budget = opt.budget || 300;
    while (queue.length && budget-- > 0) {
      const r = queue.shift();
      let best = null;
      for (const el of els) {
        for (const sg of el.segs) {
          const h = G.raySeg(r.p, r.d, sg.a, sg.b);
          if (!h || h.t <= 1e-6) continue;
          const ext = opt.ext && (el.cmd === 'lens' || el.cmd === 'mirror') && onAxis(el);
          if (!ext && (h.s < -1e-9 || h.s > 1 + 1e-9)) continue;
          if (!best || h.t < best.t) best = { t: h.t, s: h.s, el, seg: sg };
        }
      }
      const tf = exitT(r.p, r.d, F);
      if (!best || best.t > tf + 1e-9) { segs.push({ a: r.p, b: G.add(r.p, G.mul(r.d, tf)), I: r.I, chain: r.chain, free: true, d: r.d, depth: r.depth }); continue; }
      const hp = G.add(r.p, G.mul(r.d, best.t));
      segs.push({ a: r.p, b: hp, I: r.I, chain: r.chain, d: r.d, depth: r.depth, ext: best.s < 0 || best.s > 1 ? best.el : null });
      const opl = r.opl + best.t * r.nIdx;
      if (r.depth >= 40) continue;
      for (const o of act({ ...r, opl }, hp, best, rec)) {
        const q = { ...r, ...o, opl: opl + 1e-7 * ((o as any).nIdx ?? r.nIdx), I: (o as any).I ?? r.I, p: G.add(hp, G.mul(o.d, 1e-7)), depth: r.depth + 1 };   // the nudge off the surface counts in the path
        if ((o as any).branch) q.chain = chains++;
        queue.push(q);
      }
    }
    return { segs, rec };
  }

  // ---------------------------------------------------------------- solving
  function solve(M: any, S: any) {
    const els: any[] = [], srcs: any[] = [], setup = { lambda: 633e-9, unit: 0.01, extent: 1.5 };
    let axis: any = null;
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const spec = commands[L.cmd], { v, warn } = P.read(L, spec);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      if (L.cmd === 'setup') { Object.assign(setup, v); return; }
      if (L.cmd === 'axis') { const a = L.args[0] || []; const x0 = parseFloat(a[0]), x1 = parseFloat(a[1]); axis = { i, x0: isFinite(x0) ? x0 : -5, x1: isFinite(x1) ? x1 : 5, label: v.label }; return; }
      const q = P.pos(L, 0);
      if (q.ref) { S.warn(`\\${L.cmd}: the position is a pair of numbers, (x, y), or (x) on the axis`); return; }
      if (q.bad) S.warn(`\\${L.cmd}: the position must be numbers`);
      const one = !!q.one;
      if (['ray', 'beam', 'source', 'laser', 'object'].includes(L.cmd)) srcs.push({ cmd: L.cmd, v, c: q.p, i, one });
      else els.push(element(L.cmd, v, q.p, i, one));
    });
    // the frame rays run to: everything, plus a margin
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const grow = (p: any) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    els.forEach((el) => el.segs.forEach((sg: any) => { grow(sg.a); grow(sg.b); }));
    srcs.forEach((s) => { grow(s.c); if (s.cmd === 'object') grow([s.c[0], s.v.h]); });
    if (axis) { grow([axis.x0, 0]); grow([axis.x1, 0]); }
    if (!isFinite(x0)) return;
    const m = setup.extent;
    let F = { x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m };
    if (axis) { F.x0 = Math.min(F.x0, axis.x0); F.x1 = Math.max(F.x1, axis.x1); }

    // images of objects first: the frame grows to show them
    const images = [];
    for (const o of srcs.filter((s) => s.cmd === 'object' && s.v.rays === 'principal')) {
      S.obj = o.i;
      const im = imageOf(o, els, S);
      if (im) {
        images.push(im);
        if (im.at && Math.abs(im.at[0]) < 80 && Math.abs(im.at[1]) < 40) {
          F.x0 = Math.min(F.x0, im.at[0] - 0.5); F.x1 = Math.max(F.x1, im.at[0] + 0.5);
          F.y0 = Math.min(F.y0, im.at[1] - 0.5, -0.5); F.y1 = Math.max(F.y1, im.at[1] + 0.5);
        }
      }
    }
    if (axis) { S.obj = axis.i; S.line([[axis.x0, 0], [axis.x1, 0]], { w: 'thin', dash: true, color: '#555555' }); if (axis.label) S.text([axis.x1, 0], axis.label, { anchor: 'west' }); S.handle({ at: [axis.x1, 0], kind: 'axisEnd', drag: (L: any, p: any) => P.setArg(L, 0, [axis.x0, Math.max(axis.x0 + 0.5, p[0])]) }); S.handle({ at: [axis.x0, 0], kind: 'axisEnd', drag: (L: any, p: any) => P.setArg(L, 0, [Math.min(axis.x1 - 0.5, p[0]), axis.x1]) }); }
    const onLens = els.filter((el) => el.cmd === 'lens' && onAxis(el)).sort((a, b) => a.c[0] - b.c[0]);
    if (onLens.length > 1) onLens.forEach((el, k) => { el.k = k + 1; });
    for (const el of els) { S.obj = el.i; drawElement(el, S); }
    if (onLens.length > 1 && !els.some((el) => el.cmd === 'mirror' && onAxis(el))) system(onLens, S);

    // rays
    const det = new Map();
    for (const s of srcs) {
      S.obj = s.i;
      const v = s.v, color = v.color || RED;
      const starts = [];
      if (s.cmd === 'ray') starts.push({ p: s.c, d: G.dir(v.angle) });
      if (s.cmd === 'laser') {
        const pol = v.pol === '' ? null : parseFloat(v.pol);
        if (v.pol !== '' && !isFinite(pol!)) S.warn('\\laser: pol is an angle in degrees, or empty for unpolarised light');
        starts.push({ p: s.c, d: G.dir(v.angle), pol: isFinite(pol!) ? pol : null });
        const d = G.dir(v.angle), nn = [-d[1], d[0]], back = G.add(s.c, G.mul(d, -1));
        S.poly([G.add(back, G.mul(nn, 0.22)), G.add(s.c, G.mul(nn, 0.22)), G.add(s.c, G.mul(nn, -0.22)), G.add(back, G.mul(nn, -0.22))], { fill: '#3a3a3a', stroke: '#000000', w: 'thin' });
        if (v.label) S.text(G.add(G.lerp(back, s.c, 0.5), G.mul(nn, 0.22)), v.label, { push: nn });
      }
      if (s.cmd === 'beam') {
        const d = G.dir(v.angle), nn = [-d[1], d[0]], n = Math.round(v.n);
        for (let k = 0; k < n; k++) starts.push({ p: G.add(s.c, G.mul(nn, n === 1 ? 0 : -v.width / 2 + (v.width * k) / (n - 1))), d });
      }
      if (s.cmd === 'source') {
        const n = Math.round(v.n);
        for (let k = 0; k < n; k++) starts.push({ p: s.c, d: G.dir(n === 1 ? (v.from + v.to) / 2 : v.from + ((v.to - v.from) * k) / (n - 1)) });
        S.dot(s.c, { r: 2.6 });
        if (v.label) S.text(s.c, v.label, { anchor: 'east' });
      }
      if (s.cmd === 'object') { drawObject(s, S); continue; }
      starts.forEach((st, k) => {
        const T = trace({ ...st, src: s.i }, els, F);
        T.segs.forEach((sg) => {
          S.line([sg.a, sg.b], { color, w: 'normal', opacity: sg.I < 0.999 ? Math.max(0.25, 0.25 + 0.75 * sg.I) : undefined });
          if (sg.depth === 0 && G.dist(sg.a, sg.b) > 0.6 && (starts.length <= 3 || k === Math.floor(starts.length / 2))) S.mark(sg.a, sg.b, { color, at: Math.min(0.5, 0.8 / G.dist(sg.a, sg.b)) });
          if (sg.ext) dashedExt(sg.ext, sg.b, S);
        });
        for (const e of T.rec) {
          if (e.tir) { S.obj = e.el.i; S.result('total internal reflection', `at (${P.fmt(e.at[0], 2)}, ${P.fmt(e.at[1], 2)})`, 'exact', 'Snell’s law has no refracted ray: sin θ > n₂/n₁'); S.obj = s.i; }
          if (e.ray || e.I != null) { if (!det.has(e.el)) det.set(e.el, []); det.get(e.el).push({ ...e, src: s.i }); }
        }
      });
      if (s.cmd === 'ray' || s.cmd === 'laser' || s.cmd === 'beam') S.handle({ at: G.add(s.c, G.mul(G.dir(v.angle), 0.8)), kind: 'rot', label: 'direction', drag: (L: any, p: any, snap: any) => P.setOpt(L, 'angle', P.fmt(snap.angle(G.ang(G.sub(p, s.c)))), 2) });
      if (s.cmd !== 'object') S.handle({ at: s.c, kind: 'move', drag: (L: any, p: any) => P.setArg(L, 0, [p[0], p[1]]) });
      if (s.cmd === 'source') {
        S.handle({ at: G.add(s.c, G.mul(G.dir(v.from), 1)), kind: 'rot', label: 'from', drag: (L: any, p: any, snap: any) => P.setOpt(L, 'from', P.fmt(snap.angle(G.ang(G.sub(p, s.c))), 2)) });
        S.handle({ at: G.add(s.c, G.mul(G.dir(v.to), 1)), kind: 'rot', label: 'to', drag: (L: any, p: any, snap: any) => P.setOpt(L, 'to', P.fmt(snap.angle(G.ang(G.sub(p, s.c))), 2)) });
      }
    }
    for (const im of images) drawImage(im, S, els);
    // what reaches polarisers and detectors
    for (const [el, list] of det) {
      S.obj = el.i;
      if (el.cmd === 'polarizer') {
        for (const e of list.slice(0, 3)) S.result(`I after ${el.v.label ? el.v.label.replace(/\$/g, '') : 'polariser'}`, `${P.sig(e.I, 3)} I₀ (in: ${P.sig(e.I0, 3)} I₀${e.pol0 == null ? ', unpolarised' : `, at ${P.fmt(e.pol0, 1)}°`})`, 'ideal', e.pol0 == null ? 'ideal polariser: unpolarised light keeps half its intensity' : 'Malus’s law I = I₀ cos²(θ − θ_axis), ideal polariser');
        continue;
      }
      if (el.cmd !== 'detector') continue;
      const rays = list.filter((e: any) => e.ray);
      if (!rays.length) continue;
      const lam = setup.lambda, unit = setup.unit;
      if (rays.length === 1) { S.result('intensity', `${P.sig(rays[0].ray.I, 3)} I₀`, 'ideal', 'one beam: no interference; ideal splitters and polarisers'); continue; }
      const [a, b] = rays, dd = a.ray.opl - b.ray.opl, dL = (Math.abs(dd) < 1e-9 ? 0 : dd) * unit, phi = (2 * Math.PI * dL) / lam + (((a.ray.phase || 0) - (b.ray.phase || 0)) * Math.PI) / 180;
      const I1 = a.ray.I, I2 = b.ray.I, dp = a.ray.pol != null && b.ray.pol != null ? Math.cos(((a.ray.pol - b.ray.pol) * Math.PI) / 180) : 1;
      const I = I1 + I2 + 2 * Math.sqrt(I1 * I2) * Math.cos(phi) * dp;
      let wrap = ((((phi * 180) / Math.PI) % 360) + 540) % 360 - 180;
      if (wrap < -179.9999) wrap = 180;   // (−180°, 180°]
      S.result('path difference', `${P.sig(dL / lam, 4)} λ (${P.sig(dL * 1e6, 4)} µm)`, 'ideal', `optical path lengths of the two beams, with 1 cm of the drawing = ${P.sig(unit * 100, 3)} cm; λ = ${P.sig(lam * 1e9, 4)} nm`);
      S.result('phase difference', `${P.fmt(wrap, 1)}°`, 'ideal', 'from the path difference and phase plates; phase shifts on reflection are not included');
      S.result('intensity', `${P.sig(I, 3)} I₀`, 'ideal', 'two coherent monochromatic beams: I = I₁ + I₂ + 2√(I₁I₂) cos Δφ' + (dp !== 1 ? ' × cos of the angle between their polarisations' : ''));
      if (rays.length > 2) S.warn(`${rays.length} beams reach this detector: the result adds the first two`);
    }
  }
  // thin lenses on the axis as one system, by ray-transfer (ABCD) matrices: [y, θ] → M [y, θ]
  function system(lenses: any, S: any) {
    let M = [[1, 0], [0, 1]];
    const mul = (A: any, B: any) => [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
    lenses.forEach((el: any, k: any) => {
      if (k) M = mul([[1, el.c[0] - lenses[k - 1].c[0]], [0, 1]], M);
      M = mul([[1, 0], [-1 / el.v.f, 1]], M);
    });
    S.obj = lenses[0].i;
    const C = M[1][0], note = 'thin lenses in paraxial optics, combined by ray-transfer (ABCD) matrices';
    if (Math.abs(C) < 1e-9) S.result('lens system', `afocal (a telescope): angular magnification ${P.sig(M[1][1], 4)}`, 'ideal', note + '; for two lenses M = −f₁/f₂');
    else {
      const f = -1 / C, back = lenses[lenses.length - 1].c[0] - M[0][0] / C;
      S.result('lens system', `effective focal length ${P.sig(f, 4)} cm`, 'ideal', note);
      S.result('back focal point', `x = ${P.sig(back, 4)} cm`, 'ideal', note + ': where light from a far point on the axis is brought to focus');
    }
  }
  function dashedExt(el: any, b: any, S: any) {
    // a ray met the plane of a lens or mirror beyond its rim: extend the element there, dashed
    const s = G.dot(G.sub(b, el.c), el.u), h = el.v.h / 2, end = G.add(el.c, G.mul(el.u, Math.sign(s) * h));
    S.line([end, b], { w: 'thin', dash: true, color: '#777777', obj: el.i });
  }
  function drawElement(el: any, S: any) {
    const { c, u, n, v } = el, L = (s: any, t: any) => G.add(c, G.add(G.mul(u, s), G.mul(n, t))), h = v.h / 2;
    const lab = (o: any) => { if (v.label) S.text(G.add(c, G.mul(u, (el.poly ? 0 : h) + 0.05)), v.label, { push: o || u }); };
    const top = () => G.add(c, G.mul(u, h));
    switch (el.cmd) {
      case 'lens': {
        const b = Math.min(0.32, 0.5 / Math.abs(v.f) + 0.06), N = 16, pts = [];
        if (v.f > 0) { for (let k = 0; k <= N; k++) { const t = -1 + (2 * k) / N; pts.push(L(t * h, b * (1 - t * t))); } for (let k = N; k >= 0; k--) { const t = -1 + (2 * k) / N; pts.push(L(t * h, -b * (1 - t * t))); } }
        else { for (let k = 0; k <= N; k++) { const t = -1 + (2 * k) / N; pts.push(L(t * h, 0.04 + b * t * t)); } for (let k = N; k >= 0; k--) { const t = -1 + (2 * k) / N; pts.push(L(t * h, -0.04 - b * t * t)); } }
        S.poly(pts, { fill: GLASS, stroke: '#000000', w: 'normal' });
        lab(u[1] >= 0 ? u : G.mul(u, -1));
        if (v.foci && onAxis(el)) {
          // F below the axis, F' above: where one lens's F' is the next one's F, the two labels do not collide
          const sub = el.k ? `_${el.k}` : '';
          for (const sgn of [-1, 1]) { const F = G.add(c, G.mul(n, sgn * v.f)); S.dot(F, { r: 1.8 }); S.text(F, sgn > 0 ? `$F'${sub}$` : `$F${sub}$`, { anchor: sgn > 0 ? 'south' : 'north' }); }
        }
        S.handle({ at: G.add(c, G.mul(n, v.f)), kind: 'focus', label: 'focal length', drag: (Ln: any, p: any, snap: any) => { const f = snap.len(G.dot(G.sub(p, c), n)); if (Math.abs(f) >= 0.1) P.setOpt(Ln, 'f', P.fmt(f, 3)); } });
        break;
      }
      case 'mirror': {
        const N = 24, curve = [];
        for (let k = 0; k <= N; k++) { const s = -h + (2 * h * k) / N; curve.push(L(s, v.f ? -(s * s) / (4 * v.f) : 0)); }
        S.line(curve, { w: 'thick' });
        S.hatch(curve, 1, { obj: el.i });
        lab(u[1] >= 0 ? u : G.mul(u, -1));
        if (v.f) {
          if (v.foci && onAxis(el)) { const F = G.add(c, G.mul(n, -v.f)); S.dot(F, { r: 1.8 }); S.text(F, '$F$', { anchor: 'north' }); }
          S.handle({ at: G.add(c, G.mul(n, -v.f)), kind: 'focus', label: 'focal length', drag: (Ln: any, p: any, snap: any) => { const f = snap.len(G.dot(G.sub(c, p), n)); P.setOpt(Ln, 'f', Math.abs(f) < 0.1 ? null : P.fmt(f, 3)); } });
        }
        break;
      }
      case 'splitter': {
        const t = 0.06;
        S.poly([L(-h, -t), L(h, -t), L(h, t), L(-h, t)], { fill: GLASS, stroke: '#000000', w: 'thin' });
        S.line([L(-h, 0), L(h, 0)], { w: 'normal', color: '#555555' });
        lab([0, 1]);
        break;
      }
      case 'interface': {
        if (v.n1 !== v.n2) { const t = v.n2 > v.n1 ? 0.35 : -0.35; S.poly([L(-h, 0), L(h, 0), L(h, t), L(-h, t)], { fill: GLASS, stroke: null }); }   // the denser side
        S.line([L(-h, 0), L(h, 0)], { w: 'normal' });
        S.text(L(h * 0.85, -0.25), `$n_1 = ${P.fmt(v.n1, 3)}$`, {});
        S.text(L(h * 0.85, 0.6), `$n_2 = ${P.fmt(v.n2, 3)}$`, {});
        if (v.label) S.text(L(-h, 0), v.label, { push: G.mul(u, -1) });
        S.result('critical angle', v.n1 > v.n2 ? `${P.fmt((Math.asin(v.n2 / v.n1) * 180) / Math.PI, 2)}° (from the n₁ side)` : v.n2 > v.n1 ? `${P.fmt((Math.asin(v.n1 / v.n2) * 180) / Math.PI, 2)}° (from the n₂ side)` : 'none (same index)', 'exact', 'θc = arcsin(n_low / n_high), Snell’s law');
        break;
      }
      case 'prism': case 'slab': {
        S.poly(el.poly, { fill: GLASS, stroke: '#000000', w: 'normal' });
        if (v.label) S.text(c, v.label, {});
        if (el.cmd === 'prism') {
          const A = v.apex, Dmin = 2 * (Math.asin(v.n * Math.sin((A * Math.PI) / 360)) * 180) / Math.PI - A;
          S.result('minimum deviation', isFinite(Dmin) ? `${P.fmt(Dmin, 2)}°` : 'none: every ray is totally reflected', 'exact', 'δmin = 2 arcsin(n sin(A/2)) − A, at symmetric passage');
          S.handle({ at: el.poly[0], kind: 'rot', label: 'rotation', drag: (Ln: any, p: any, snap: any) => P.setOpt(Ln, 'angle', P.fmt(snap.angle(G.ang(G.sub(p, c)) - 90), 2)) });
        }
        S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
        return;
      }
      case 'polarizer': {
        const t = 0.07;
        S.poly([L(-h, -t), L(h, -t), L(h, t), L(-h, t)], { fill: '#f2f2f2', stroke: '#000000', w: 'thin' });
        // the transmission axis, seen as a double arrow on the element's face
        const a = G.dir(v.axis), q = (k: any) => G.add(c, G.add(G.mul(u, a[1] * k), G.mul(n, a[0] * k * 0.25)));
        S.line([q(-h * 0.7), q(h * 0.7)], { w: 'thin', arrow: true, arrow0: true });
        lab([0, 1]);
        break;
      }
      case 'phase': {
        const t = 0.12;
        S.poly([L(-h, -t), L(h, -t), L(h, t), L(-h, t)], { fill: '#fdf3d8', stroke: '#000000', w: 'thin' });
        lab([0, 1]);
        break;
      }
      case 'screen': {
        const pts = [L(-h, 0), L(h, 0)];
        S.line(pts, { w: 'thick' });
        S.hatch(pts, 1, { obj: el.i });
        lab(u[1] >= 0 ? u : G.mul(u, -1));
        break;
      }
      case 'detector': {
        const w = 0.35;
        S.poly([L(-h, 0), L(h, 0), L(h, w), L(-h, w)], { fill: '#3a3a3a', stroke: '#000000', w: 'thin' });
        if (v.label) S.text(L(0, w), v.label, { push: n });
        break;
      }
    }
    // move (on the axis it stays on the axis) and turn (off the axis)
    S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => (el.one ? P.setArg(Ln, 0, [p[0]]) : P.setArg(Ln, 0, [p[0], p[1]])) });
    if (!el.one) S.handle({ at: top(), kind: 'rot', label: 'angle', drag: (Ln: any, p: any, snap: any) => P.setOpt(Ln, 'angle', P.fmt(snap.angle(G.ang(G.sub(p, c))), 2)) });
    else S.handle({ at: top(), kind: 'size', label: 'height', drag: (Ln: any, p: any, snap: any) => { const hh = snap.len(2 * Math.abs(G.dot(G.sub(p, c), u))); if (hh >= 0.2) P.setOpt(Ln, 'h', P.fmt(hh, 3)); } });
  }
  function drawObject(o: any, S: any) {
    const x = o.c[0], h = o.v.h, color = '#000000';
    S.line([[x, 0], [x, h]], { w: 'thick', arrow: true, color });
    if (o.v.label) S.text([x, 0], o.v.label, { anchor: h >= 0 ? 'north' : 'south' });
    S.handle({ at: [x, h], kind: 'move', label: 'object top', drag: (L: any, p: any, snap: any) => { P.setArg(L, 0, [p[0]]); const hh = snap.len(p[1]); if (Math.abs(hh) >= 0.1) P.setOpt(L, 'h', P.fmt(hh, 3)); } });
    if (!o.one) S.warn('\\object stands on the axis: give its position as (x)');
  }
  // the image of an object: three principal rays through the first lens or mirror on the axis, traced on
  // through every element; their final directions meet at the image (in front: real; behind: virtual)
  function imageOf(o: any, els: any, S: any) {
    const x = o.c[0], h = o.v.h, T = [x, h];
    const ax = els.filter((el: any) => (el.cmd === 'lens' || el.cmd === 'mirror') && onAxis(el) && el.c[0] > x + 1e-9).sort((a: any, b: any) => a.c[0] - b.c[0])[0];
    if (!ax) { S.warn('\\object: no lens or mirror on the axis to its right, so there are no principal rays'); return null; }
    const f = ax.v.f, BIG = { x0: -1e4, x1: 1e4, y0: -1e4, y1: 1e4 };
    const dirs = [[1, 0], G.norm(G.sub(ax.c, T))];
    if (f) {
      const F = G.add(ax.c, G.mul(ax.n, -f));
      if (Math.abs(F[0] - x) > 1e-6) dirs.push(F[0] > x ? G.norm(G.sub(F, T)) : G.norm(G.sub(T, F)));
    }
    const finals = dirs.map((d) => {
      const tr = trace({ p: T, d }, els, BIG, { ext: true, budget: 60 });
      const chain = tr.segs.filter((sg) => sg.chain === 0);
      const last = chain[chain.length - 1];
      // a ray that reaches a screen or detector stops there: its final direction is its last segment's
      return { tr, last, d: last.d, a: last.a, n: chain.length };
    });
    const A = finals[0], B = finals[1];
    if (A.n < 2 || B.n < 2) { S.warn('\\object: the principal rays do not reach the lens or mirror'); return { o, ax, finals, at: null }; }
    const den = G.cross(A.d, B.d);
    if (Math.abs(den) < 1e-9) return { o, ax, finals, at: null, inf: true };
    const w = G.sub(B.a, A.a), t = G.cross(w, B.d) / den, s = G.cross(w, A.d) / den;
    const at = G.add(A.a, G.mul(A.d, t));
    return { o, ax, finals, at, real: t > 1e-6 && s > 1e-6, t, s };
  }
  function drawImage(im: any, S: any, els: any) {
    const { o } = im, col = o.v.color || RED, h = o.v.h;
    S.obj = o.i;
    const BIGF = (() => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const it of S.items) for (const p of it.pts || [it.at]) { if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return { x0: x0 - 0.6, x1: x1 + 0.6, y0: y0 - 0.6, y1: y1 + 0.6 }; })();
    if (im.at) { BIGF.x0 = Math.min(BIGF.x0, im.at[0] - 0.6); BIGF.x1 = Math.max(BIGF.x1, im.at[0] + 0.6); BIGF.y0 = Math.min(BIGF.y0, im.at[1] - 0.6); BIGF.y1 = Math.max(BIGF.y1, im.at[1] + 0.6); }
    im.finals.forEach((fn: any, k: any) => {
      const tr = trace({ p: [o.c[0], h], d: fn.tr.segs[0].d }, els, BIGF, { ext: true, budget: 60 });
      tr.segs.filter((sg) => sg.chain === 0).forEach((sg, j) => {
        S.line([sg.a, sg.b], { color: col, w: 'normal' });
        if (j === 0 && G.dist(sg.a, sg.b) > 0.5) S.mark(sg.a, sg.b, { color: col, at: Math.min(0.5, 0.7 / G.dist(sg.a, sg.b)) });
        if (sg.ext) dashedExt(sg.ext, sg.b, S);
      });
      if (im.at && !im.real) {
        const last = tr.segs.filter((sg) => sg.chain === 0).pop();
        if (last) S.line([last.a, im.at], { color: col, w: 'thin', dash: true });
      }
    });
    if (im.inf) { S.result('image', 'at infinity (object in the focal plane)', 'ideal', 'thin lenses and mirrors, paraxial optics'); return; }
    if (!im.at) return;
    const xi = im.at[0], hi = im.at[1], mag = hi / h;
    const far = Math.abs(xi) > 80 || Math.abs(hi) > 40;
    if (!far) {
      S.line([[xi, 0], [xi, hi]], { w: 'thick', arrow: true, dash: !im.real, color: BLUE });
      S.text([xi, 0], o.v.label ? `${o.v.label.replace(/\$$/, '')}'$`.replace(/^([^$])/, '$1') : "$O'$", { anchor: hi >= 0 ? 'north' : 'south', color: BLUE });
    }
    const note = 'thin lenses and mirrors in paraxial (Gaussian) optics: every ray from a point meets again at one image point';
    S.result('image at', `x = ${P.sig(xi, 4)} cm${far ? ' (outside the figure)' : ''}`, 'ideal', note);
    S.result('image height', `${P.sig(hi, 4)} cm`, 'ideal', note);
    S.result('magnification', `${P.sig(mag, 4)} (${im.real ? 'real' : 'virtual'}, ${mag < 0 ? 'inverted' : 'upright'}, ${Math.abs(mag) > 1 + 1e-9 ? 'enlarged' : Math.abs(mag) < 1 - 1e-9 ? 'reduced' : 'same size'})`, 'ideal', note);
  }

  P.domain('optics', { label: 'Optics', commands, example: EXAMPLE, examples: EXAMPLES, solve, trace: (start: any, els: any, F: any, o: any) => trace(start, els, F, o), element });
})();
