import { runtime as TD } from '../runtime';
// Physics block, mechanics: free-body diagrams of blocks on surfaces and inclines (Coulomb friction, solved for
// rest or sliding), applied forces, the Atwood machine, springs (Hooke), the simple pendulum (exact period by
// the arithmetic–geometric mean, beside the small-angle one), projectiles without air resistance, and two
// linkages, the four-bar and the slider–crank, solved by exact closure. Force arrows share one scale.
(function () {
  const P = TD.physics, G = P.G;
  const RED = '#c0392b', BLUE = '#1f5fa8', GREEN = '#2e7d32', GREY = '#888888', WOOD = '#f3e3c3';
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const bool = (k: any, label: any, def: any) => txt(k, label, def ? 'true' : 'false', { kind: 'bool' });
  const LABEL = txt('label', 'Label', '', { math: true });
  const cm = { unit: 'cm' };
  const MASS = (k = 'm', def = 2) => num(k, 'Mass', def, { dim: 'mass', unit: 'kg', min: 0, nonzero: true });

  const commands: Record<string, any> = {
    setup: { label: 'Settings', cat: 'Settings', args: 0, params: [num('g', 'g', 9.80665, { dim: 'accel', unit: 'm/s^2', min: 0 }), num('fscale', 'Force scale', 0, { unit: 'cm/N', min: 0, help: '0: the largest force is drawn 1.6 cm long' }), num('unit', 'Drawing unit', 0.01, { dim: 'len', unit: 'cm', help: 'The physical length of 1 cm of the drawing (springs)' })], make: () => '\\setup[g=9.81]' },
    ground: { label: 'Ground', cat: 'Surfaces', args: 1, params: [num('length', 'Length', 6, { ...cm, min: 0.2 }), num('angle', 'Angle', 0, { unit: '°', step: 15 })], make: (x: any, y: any) => `\\ground[length=6](${P.fmt(x)}, ${P.fmt(y)})` },
    incline: { label: 'Incline', cat: 'Surfaces', args: 1, params: [num('angle', 'Angle', 30, { unit: '°', min: 1, max: 80, step: 5 }), num('L', 'Slope length', 5, { ...cm, min: 0.5 }), num('mu', 'Static friction μs', 0, { min: 0, step: 0.05 }), num('muk', 'Kinetic friction μk', -1, { min: -1, step: 0.05, help: '−1: the same as μs' }), txt('name', 'Name', 'incline')], make: (x: any, y: any) => `\\incline[angle=30, L=5, mu=0.3](${P.fmt(x)}, ${P.fmt(y)})` },
    block: { label: 'Block', cat: 'Bodies', args: 1, argHelp: '(incline name) or (x, y)', params: [MASS(), num('s', 'Place on the slope', 0.5, { min: 0, max: 1, step: 0.05 }), num('size', 'Size', 0.8, { ...cm, min: 0.2 }), LABEL, txt('name', 'Name', 'block'), bool('forces', 'Draw the forces', true), bool('surface', 'Resting on a surface', true)], make: () => '\\block[m=2](incline)' },
    force: { label: 'Applied force', cat: 'Bodies', args: 1, argHelp: '(block name)', params: [num('F', 'Magnitude', 10, { dim: 'force', unit: 'N', min: 0 }), num('angle', 'Direction', 0, { unit: '°', step: 15, help: 'From the +x axis' }), LABEL, bool('components', 'Show components', false)], make: () => '\\force[F=10, angle=0](block)' },
    atwood: { label: 'Atwood machine', cat: 'Machines', args: 1, params: [MASS('m1', 2), MASS('m2', 3), num('r', 'Pulley radius', 0.5, { ...cm, min: 0.1 }), num('l1', 'Left string', 2.5, { ...cm, min: 0.3 }), num('l2', 'Right string', 3.2, { ...cm, min: 0.3 }), bool('forces', 'Draw the forces', true)], make: (x: any, y: any) => `\\atwood[m1=2, m2=3](${P.fmt(x)}, ${P.fmt(y)})` },
    spring: { label: 'Spring', cat: 'Machines', args: 2, argHelp: '(x1, y1)(x2, y2)', params: [num('k', 'Stiffness', 50, { dim: 'stiff', unit: 'N/m', min: 0 }), num('rest', 'Natural length', 3, { ...cm, min: 0 }), num('coils', 'Coils', 8, { min: 2, max: 40, step: 1, int: true }), num('width', 'Width', 0.35, { ...cm, min: 0.05 }), LABEL], make: (x: any, y: any) => `\\spring[k=50, rest=3](${P.fmt(x)}, ${P.fmt(y)})(${P.fmt(x + 3.5)}, ${P.fmt(y)})` },
    pendulum: { label: 'Pendulum', cat: 'Machines', args: 1, params: [num('L', 'Length', 1, { dim: 'len', unit: 'm', min: 0, nonzero: true }), num('theta', 'Amplitude', 30, { unit: '°', min: -179, max: 179, step: 5 }), num('size', 'Drawn length', 3, { ...cm, min: 0.5 }), LABEL], make: (x: any, y: any) => `\\pendulum[L=1m, theta=30](${P.fmt(x)}, ${P.fmt(y)})` },
    projectile: { label: 'Projectile', cat: 'Motion', args: 1, params: [num('v', 'Launch speed', 10, { dim: 'speed', unit: 'm/s', min: 0, nonzero: true }), num('angle', 'Launch angle', 45, { unit: '°', min: 0, max: 90, step: 5 }), num('scale', 'Scale', 0, { unit: 'cm/m', min: 0, help: '0: the range is drawn 8 cm long' }), bool('marks', 'Mark range and height', true)], make: (x: any, y: any) => `\\projectile[v=10, angle=45](${P.fmt(x)}, ${P.fmt(y)})` },
    fourbar: { label: 'Four-bar linkage', cat: 'Linkages', args: 1, params: [num('a', 'Crank a', 1, { ...cm, min: 0.05 }), num('b', 'Coupler b', 3, { ...cm, min: 0.05 }), num('c', 'Rocker c', 2.2, { ...cm, min: 0.05 }), num('d', 'Ground d', 3, { ...cm, min: 0.05 }), num('theta', 'Crank angle', 60, { unit: '°', step: 5 }), num('branch', 'Assembly', 1, { kind: 'enum', opts: [['1', 'Open'], ['-1', 'Crossed']] }), bool('labels', 'Label the links', true)], make: (x: any, y: any) => `\\fourbar[a=1, b=3, c=2.2, d=3, theta=60](${P.fmt(x)}, ${P.fmt(y)})` },
    slidercrank: { label: 'Slider–crank', cat: 'Linkages', args: 1, params: [num('r', 'Crank r', 1, { ...cm, min: 0.05 }), num('l', 'Rod l', 3, { ...cm, min: 0.05 }), num('theta', 'Crank angle', 45, { unit: '°', step: 5 }), num('offset', 'Offset e', 0, cm), bool('labels', 'Label the links', true)], make: (x: any, y: any) => `\\slidercrank[r=1, l=3, theta=45](${P.fmt(x)}, ${P.fmt(y)})` },
  };
  commands.fourbar.params[5] = txt('branch', 'Assembly', 'open', { kind: 'enum', opts: [['open', 'Open'], ['crossed', 'Crossed']] });
  const EXAMPLE = `\\physics{mechanics}
% a block on a rough incline: drag the top corner to change the angle
\\incline[angle=30, L=5, mu=0.4](0, 0)
\\block[m=2, s=0.55, label=$m$](incline)`;
  const EXAMPLES = {
    'Block on an incline': EXAMPLE,
    'Pushed up a slope': `\\physics{mechanics}\n\\incline[angle=25, L=5, mu=0.2](0, 0)\n\\block[m=2, s=0.4](incline)\n\\force[F=20, angle=25, label=$F$](block)`,
    'Pulled along the floor': `\\physics{mechanics}\n\\ground[length=5](-2.5, 0)\n\\block[m=5, size=1](0, 0)\n\\force[F=30, angle=30, label=$F$, components=true](block)`,
    'Atwood machine': `\\physics{mechanics}\n\\atwood[m1=2, m2=3](0, 0)`,
    'Spring': `\\physics{mechanics}\n\\setup[unit=1cm]\n\\spring[k=50, rest=3, label=$k$](0, 0)(4, 0)`,
    'Pendulum': `\\physics{mechanics}\n\\pendulum[L=1m, theta=40, label=$m$](0, 0)`,
    'Projectile': `\\physics{mechanics}\n\\projectile[v=12, angle=50](0, 0)`,
    'Four-bar linkage': `\\physics{mechanics}\n\\fourbar[a=1, b=3, c=2.2, d=3, theta=60](0, 0)`,
    'Slider–crank': `\\physics{mechanics}\n\\slidercrank[r=1, l=3, theta=45](0, 0)`,
  };

  function solve(M: any, S: any) {
    const set = { g: 9.80665, fscale: 0, unit: 0.01 }, inclines = new Map(), blocks = new Map(), forces: any[] = [], items: any[] = [];
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const { v, warn } = P.read(L, commands[L.cmd]);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      if (L.cmd === 'setup') { Object.assign(set, v); return; }
      const ref = L.args[0] && L.args[0].length === 1 && !/^[-+−.\d]/.test(L.args[0][0]) ? L.args[0][0] : null;
      const o = { L, i, v, ref, q: P.pos(L, 0) };
      if (L.cmd === 'incline') inclines.set(v.name, o);
      if (L.cmd === 'block') { if (blocks.has(v.name)) S.warn(`two blocks are named ${v.name}`); blocks.set(v.name, o); }
      if (L.cmd === 'force') forces.push(o);
      items.push(o);
    });
    const g = set.g, arrows: any[] = [], tags = [];   // force arrows, drawn once their common scale is known; labels on bodies, placed clear of them
    const F = (at: any, vec: any, o: any) => arrows.push({ at, vec, ...o, obj: S.obj });

    for (const o of items) {
      const { L, i, v } = o;
      S.obj = i;
      switch (L.cmd) {
        case 'ground': { const c = o.q.p || [0, 0], u = G.dir(v.angle), pts = [c, G.add(c, G.mul(u, v.length))]; S.line(pts, { w: 'thick' }); S.hatch(pts, 1, {}); S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) }); S.handle({ at: pts[1], kind: 'size', label: 'length', drag: (Ln: any, p: any, snap: any) => { const l = snap.len(G.dist(p, c)); if (l >= 0.2) P.setOpt(Ln, 'length', P.fmt(l, 3)); } }); break; }
        case 'incline': {
          const c = o.q.p || [0, 0], th = v.angle, R = [c[0] + v.L * Math.cos((th * Math.PI) / 180), c[1]], T = [R[0], c[1] + v.L * Math.sin((th * Math.PI) / 180)];
          S.poly([c, R, T], { fill: WOOD, stroke: '#000000', w: 'normal' });
          S.hatch([[c[0] - 0.3, c[1]], [R[0] + 0.3, c[1]]], 1, {});
          S.line(G.arc(c, 0.7, 0, th), { w: 'thin' });
          S.text(G.add(c, G.mul(G.dir(th / 2), 0.7)), `$${P.fmt(th, 1)}^\\circ$`, { push: G.dir(th / 2) });
          if (v.mu > 0) S.result('critical angle', `${P.fmt((Math.atan(v.mu) * 180) / Math.PI, 2)}° (tan θ = μs)`, 'ideal', 'a block with no other force stays put up to this angle (Coulomb friction)');
          S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
          S.handle({ at: T, kind: 'rot', label: 'angle', drag: (Ln: any, p: any, snap: any) => { const a = snap.angle(G.ang(G.sub(p, c))); if (a >= 1 && a <= 80) { P.setOpt(Ln, 'angle', P.fmt(a, 2)); P.setOpt(Ln, 'L', P.fmt(Math.max(0.5, snap.len(G.dist(p, c))), 3)); } } });
          o.geo = { c, th, u: G.dir(th), n: G.dir(th + 90), Lslope: v.L, R, T };
          break;
        }
      }
    }
    // blocks: geometry, then the forces on them, then rest or sliding
    for (const b of blocks.values()) {
      const { v } = b;
      S.obj = b.i;
      let th = 0, base, inc = null;
      if (b.ref) {
        inc = inclines.get(b.ref);
        if (!inc || !inc.geo) { S.warn(`\\block: there is no incline named ${b.ref}`); continue; }
        th = inc.geo.th;
        const s = Math.max(0, Math.min(1, v.s)) * inc.geo.Lslope;
        base = G.add(inc.geo.c, G.mul(inc.geo.u, Math.max(v.size / 2, Math.min(inc.geo.Lslope - v.size / 2, s))));
      } else {
        if (b.q.bad || b.q.missing) S.warn('\\block needs an incline name or a position (x, y)');
        base = b.q.p || [0, 0];
      }
      const u = G.dir(th), n = G.dir(th + 90), on = !!inc || v.surface, h = v.size / 2;
      const ctr = on ? G.add(base, G.mul(n, h)) : base;
      const corner = (a: any, c: any) => G.add(ctr, G.add(G.mul(u, a * h), G.mul(n, c * h)));
      S.poly([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], { fill: '#d9e4f2', stroke: '#000000', w: 'normal' });
      if (v.label) tags.push({ at: ctr, text: v.label, u, n, half: h, obj: S.obj });
      if (inc) S.handle({ at: ctr, kind: 'move', label: 'place on the slope', drag: (Ln: any, p: any, snap: any) => { const s = G.dot(G.sub(p, inc.geo.c), inc.geo.u) / inc.geo.Lslope; P.setOpt(Ln, 's', P.fmt(Math.max(0, Math.min(1, Math.round(s * 20) / 20)), 2)); } });
      else S.handle({ at: ctr, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], on ? p[1] - h : p[1]]) });
      // forces on it
      const m = v.m, W = [0, -m * g], app = forces.filter((f) => f.ref === v.name);
      let Fa = [0, 0];
      for (const f of app) Fa = G.add(Fa, G.mul(G.dir(f.v.angle), f.v.F));
      const out = [];
      // on a surface the weight reaches the ground, so its label goes beside the arrow, not under it on the hatching
      out.push({ vec: W, label: '$mg$', color: '#000000', kind: 'weight', push: on ? [th > 0 ? 1 : -1, 0] : null });
      let N = 0, fr = 0, a = [0, 0], state = 'free';
      if (on) {
        const mus = inc ? inc.v.mu : 0, muk = inc ? (inc.v.muk < 0 ? inc.v.mu : inc.v.muk) : 0;
        const perp = G.dot(G.add(W, Fa), n);              // the push into the surface is −perp
        N = Math.max(0, -perp);
        const par = G.dot(G.add(W, Fa), u);
        if (perp > 1e-9) { state = 'lifts'; S.warn('\\block: the forces lift it off the surface (the normal force would be negative)'); a = G.mul(G.add(W, Fa), 1 / m); }
        else if (Math.abs(par) <= mus * N + 1e-9) { state = 'rest'; fr = -par; }
        else { state = 'slides'; fr = -Math.sign(par) * muk * N; a = G.mul(u, (par + fr) / m); }
        if (N > 1e-9) out.push({ vec: G.mul(n, N), label: '$N$', color: BLUE, kind: 'normal' });
        if (Math.abs(fr) > 1e-9) out.push({ vec: G.mul(u, fr), label: '$f$', color: GREEN, kind: 'friction' });
        const note = 'rigid block starting at rest, Coulomb friction (|f| ≤ μs N at rest, μk N when sliding)';
        S.result('normal force N', `${P.sig(N, 4)} N`, 'ideal', note);
        S.result('friction f', state === 'rest' ? `${P.sig(Math.abs(fr), 4)} N, static (needs μs ≥ ${P.sig(N > 0 ? Math.abs(fr) / N : 0, 3)})` : `${P.sig(Math.abs(fr), 4)} N, kinetic`, 'ideal', note);
        S.result('state', state === 'rest' ? 'at rest' : state === 'slides' ? `slides ${G.dot(a, u) > 0 ? (th ? 'up the slope' : 'to the right') : th ? 'down the slope' : 'to the left'}` : 'leaves the surface', 'ideal', note);
      } else a = G.mul(G.add(W, Fa), 1 / m);
      S.result('acceleration', `${P.sig(G.len(a), 4)} m/s²${G.len(a) > 1e-9 ? ` at ${P.fmt(G.ang(a), 1)}°` : ''}`, on ? 'ideal' : 'exact', on ? 'rigid block starting at rest, Coulomb friction' : 'Newton’s second law, a = ΣF/m');
      for (const f of app) {
        S.obj = f.i;
        const vec = G.mul(G.dir(f.v.angle), f.v.F);
        out.push({ vec, label: f.v.label || '$F$', color: RED, kind: 'applied', comp: f.v.components, f });
      }
      S.obj = b.i;
      if (v.forces) for (const e of out) F(ctr, e.vec, e);
      else for (const e of out.filter((x) => x.kind === 'applied')) F(ctr, e.vec, e);
      b.ctr = ctr; b.u = u; b.n = n;
    }
    for (const f of forces) if (!blocks.has(f.ref)) { S.obj = f.i; S.warn(`\\force: there is no block named ${f.ref || '(none)'}`); }

    for (const o of items) {
      const { L, i, v } = o;
      S.obj = i;
      const c = o.q.p || [0, 0];
      if (L.cmd === 'atwood') atwood(S, c, v, g, F, tags);
      if (L.cmd === 'spring') spring(S, o, v, set);
      if (L.cmd === 'pendulum') pendulum(S, c, v, g);
      if (L.cmd === 'projectile') projectile(S, c, v, g);
      if (L.cmd === 'fourbar') fourbar(S, c, v);
      if (L.cmd === 'slidercrank') slidercrank(S, c, v);
      if (['atwood', 'pendulum', 'projectile', 'fourbar', 'slidercrank'].includes(L.cmd)) S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
    }

    // every force arrow at one scale: the largest is 1.6 cm unless the scale is set
    const big = Math.max(0, ...arrows.map((a) => G.len(a.vec)));
    const k = set.fscale > 0 ? set.fscale : big > 0 ? 1.6 / big : 0;
    // the arrows first, then their labels, so each label can keep clear of every arrow
    const tipOf = (a: any) => G.add(a.at, G.mul(a.vec, k));
    const drawn = arrows.filter((a) => G.len(a.vec) * k >= 1e-6);
    for (const a of drawn) {
      S.obj = a.obj;
      if (a.comp) {
        const x = [a.vec[0] * k, 0], y = [0, a.vec[1] * k];
        S.line([a.at, G.add(a.at, x)], { dash: true, arrow: true, color: a.color, w: 'thin' });
        S.line([a.at, G.add(a.at, y)], { dash: true, arrow: true, color: a.color, w: 'thin' });
        S.result('components', `Fx = ${P.sig(a.vec[0], 4)} N, Fy = ${P.sig(a.vec[1], 4)} N`, 'exact', 'F cos θ and F sin θ');
      }
      S.line([a.at, tipOf(a)], { arrow: true, color: a.color, w: 'thick' });
    }
    for (const a of drawn) {
      S.obj = a.obj;
      const tip = tipOf(a), d = G.norm(a.vec), side = [-d[1], d[0]], near = G.sub(tip, G.mul(a.vec, k * 0.25)), mid = G.sub(tip, G.mul(a.vec, k * 0.5));
      // beyond the tip, else beside the arrow near its tip or half way along, on either side
      const places = [{ at: tip, push: d }, { at: near, push: side }, { at: near, push: G.mul(side, -1) }, { at: mid, push: side }, { at: mid, push: G.mul(side, -1) }];
      if (a.push) places.unshift({ at: near, push: a.push });
      if (a.label) S.textAt(places, a.label, { color: a.color });
      if (a.f) { const f = a.f, at = a.at; S.obj = f.i; S.handle({ at: tip, kind: 'rot', label: 'force', drag: (Ln: any, p: any, snap: any) => { const dd = G.sub(p, at); P.setOpt(Ln, 'angle', P.fmt(snap.angle(G.ang(dd)), 2)); if (k > 0) P.setOpt(Ln, 'F', P.fmt(Math.max(0, G.len(dd) / k), 3) + 'N'); } }); }
    }
    // a body's label: in the centre when no arrow leaves it, else beside the arrows' shared tail: inside the body
    // where it fits and keeps clear, else just outside; among those, the place farthest (in angle) from every arrow
    for (const t of tags) {
      S.obj = t.obj;
      const dirs = drawn.filter((a) => G.dist(a.at, t.at) < 1e-6).map((a) => G.ang(a.vec));
      if (!dirs.length) { S.text(t.at, t.text, {}); continue; }
      const b = P.box(t.text), PAD = 0.05;
      // half-extent of the label along u and n (the body may be tilted)
      const eu = Math.abs(t.u[0]) * b.w / 2 + Math.abs(t.u[1]) * b.h / 2, en = Math.abs(t.n[0]) * b.w / 2 + Math.abs(t.n[1]) * b.h / 2;
      const iu = t.half - eu - PAD, inn = t.half - en - PAD;
      const score = ([su, sn]: any) => { const ang = G.ang(G.add(G.mul(t.u, su), G.mul(t.n, sn))); return Math.min(...dirs.map((x) => Math.abs(((x - ang) % 360 + 540) % 360 - 180))); };
      const cands = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]].sort((p, q) => score(q) - score(p));
      const at = ([su, sn]: any, inside: any) => G.add(t.at, G.add(G.mul(t.u, su * (inside ? Math.max(0, iu) : t.half + eu + PAD)), G.mul(t.n, sn * (inside ? Math.max(0, inn) : t.half + en + PAD))));
      const fits = ([su, sn]: any) => (su ? iu >= 0 : eu <= t.half - PAD) && (sn ? inn >= 0 : en <= t.half - PAD);
      S.textAt([...cands.filter(fits).map((c) => ({ at: at(c, true) })), ...cands.map((c) => ({ at: at(c, false) }))], t.text, {});
    }
    if (arrows.length) { S.obj = -1; S.result('force scale', `${P.sig(k, 3)} cm per N`, 'exact', 'all force arrows in the figure share this scale'); }
  }

  function atwood(S: any, c: any, v: any, g: any, F: any, tags: any) {
    const { m1, m2, r } = v;
    const a = ((m2 - m1) * g) / (m1 + m2), T = (2 * m1 * m2 * g) / (m1 + m2);
    const top = c[1] + r + 0.5;
    S.line([[c[0] - 1, top], [c[0] + 1, top]], { w: 'thick' }); S.hatch([[c[0] + 1, top], [c[0] - 1, top]], 1, {});
    S.line([c, [c[0], top]], { w: 'normal' });
    S.circle(c, r, { fill: '#eeeeee', stroke: '#000000', w: 'normal' });
    S.dot(c, { r: 1.6 });
    const mx = Math.max(m1, m2), size = (m: any) => 0.45 + 0.45 * Math.cbrt(m / mx);
    const masses = [[-1, m1, v.l1, '$m_1$'], [1, m2, v.l2, '$m_2$']];
    for (const [sd, m, l, lab] of masses) {
      const x = c[0] + sd * r, y = c[1] - l, s = size(m);
      S.line([[x, c[1]], [x, y]], { w: 'normal' });
      S.poly([[x - s / 2, y], [x + s / 2, y], [x + s / 2, y - s], [x - s / 2, y - s]], { fill: '#d9e4f2', stroke: '#000000', w: 'normal' });
      tags.push({ at: [x, y - s / 2], text: lab, u: [1, 0], n: [0, 1], half: s / 2, obj: S.obj });
      // the tension acts where the rope is tied (the top), the weight is drawn from the bottom, so the label has the middle
      if (v.forces) { F([x, y], [0, T], { label: '$T$', color: BLUE, push: [sd, 0] }); F([x, y - s], [0, -m * g], { label: `$m_${sd < 0 ? 1 : 2}g$`, color: '#000000' }); }
      // the direction it accelerates (length not to scale)
      const dir = sd < 0 ? Math.sign(a) : -Math.sign(a);
      if (Math.abs(a) > 1e-9) { const ax = x + sd * (s / 2 + 0.35); S.line([[ax, y - s / 2 - dir * 0.35], [ax, y - s / 2 + dir * 0.35]], { arrow: true, color: GREEN, w: 'normal' }); S.text([ax, y - s / 2], '$a$', { anchor: sd < 0 ? 'east' : 'west', color: GREEN }); }
    }
    const note = 'ideal Atwood machine: massless, inextensible string; massless, frictionless pulley';
    S.result('acceleration', `${P.sig(Math.abs(a), 4)} m/s²${Math.abs(a) > 1e-9 ? `, m${m2 > m1 ? '₂' : '₁'} goes down` : ' (balanced)'}`, 'ideal', note + ': a = (m₂ − m₁)g/(m₁ + m₂)');
    S.result('tension', `${P.sig(T, 4)} N`, 'ideal', note + ': T = 2m₁m₂g/(m₁ + m₂)');
  }
  function spring(S: any, o: any, v: any, set: any) {
    const a = P.pos(o.L, 0), b = P.pos(o.L, 1);
    if (a.missing || b.missing || a.ref || b.ref || a.bad || b.bad) { S.warn('\\spring needs two points: (x1, y1)(x2, y2)'); return; }
    const p = a.p, q = b.p, len = G.dist(p, q);
    if (len < 1e-6) { S.warn('\\spring: its ends are at the same point'); return; }
    const u = G.norm(G.sub(q, p)), n = [-u[1], u[0]], lead = Math.min(0.25, len * 0.12), body = len - 2 * lead, N = v.coils * 2;
    const pts = [p, G.add(p, G.mul(u, lead))];
    for (let j = 1; j < N; j++) pts.push(G.add(G.add(p, G.mul(u, lead + (body * j) / N)), G.mul(n, (j % 2 ? 1 : -1) * v.width / 2)));
    pts.push(G.add(p, G.mul(u, len - lead)), q);
    S.line(pts, { w: 'normal' });
    S.dot(p, { r: 1.6 }); S.dot(q, { r: 1.6 });
    if (v.label) S.text(G.lerp(p, q, 0.5), v.label, { push: n });
    const ext = (len - v.rest) * set.unit, Fs = v.k * ext;
    const note = `ideal (Hooke) spring, F = kΔx, with 1 cm of the drawing = ${P.sig(set.unit * 100, 3)} cm`;
    S.result('extension', `${P.sig(ext * 100, 4)} cm${ext < 0 ? ' (compressed)' : ''}`, 'ideal', note);
    S.result('spring force', `${P.sig(Math.abs(Fs), 4)} N, ${ext > 0 ? 'pulling the ends together' : ext < 0 ? 'pushing the ends apart' : 'none'}`, 'ideal', note);
    S.result('stored energy', `${P.sig(0.5 * v.k * ext * ext, 4)} J`, 'ideal', note + '; E = ½kΔx²');
    S.handle({ at: p, kind: 'move', drag: (Ln: any, x: any) => P.setArg(Ln, 0, [x[0], x[1]]) });
    S.handle({ at: q, kind: 'move', drag: (Ln: any, x: any) => P.setArg(Ln, 1, [x[0], x[1]]) });
  }
  // the complete elliptic integral K(k) by the arithmetic–geometric mean: K = π / (2 AGM(1, √(1 − k²)))
  function agm(a: any, b: any) { for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]; return a; }
  function pendulum(S: any, c: any, v: any, g: any) {
    const th = (v.theta * Math.PI) / 180, Ld = v.size, bob = G.add(c, [Ld * Math.sin(th), -Ld * Math.cos(th)]);
    S.line([[c[0] - 0.8, c[1]], [c[0] + 0.8, c[1]]], { w: 'thick' }); S.hatch([[c[0] + 0.8, c[1]], [c[0] - 0.8, c[1]]], 1, {});
    S.line([c, [c[0], c[1] - Ld]], { w: 'thin', dash: true, color: GREY });
    S.line([c, bob], { w: 'normal' });
    const a0 = -90, a1 = -90 + v.theta;
    if (Math.abs(v.theta) > 0.5) { S.line(G.arc(c, Math.min(1, Ld * 0.4), Math.min(a0, a1), Math.max(a0, a1)), { w: 'thin' }); S.text(G.add(c, G.mul(G.dir(-90 + v.theta / 2), Math.min(1, Ld * 0.4))), '$\\theta_0$', { push: G.dir(-90 + v.theta / 2) }); }
    S.circle(bob, 0.18, { fill: '#555555', stroke: '#000000', w: 'thin' });
    if (v.label) S.text(bob, v.label, { push: G.norm(G.sub(bob, c)) });
    const T0 = 2 * Math.PI * Math.sqrt(v.L / g), Tx = T0 / agm(1, Math.cos(th / 2));
    S.result('period, small-angle', `${P.sig(T0, 5)} s`, 'approx', 'T₀ = 2π√(L/g): good while θ₀ is small (0.2 % low at 10°)');
    if (Math.abs(v.theta) >= 1) S.result('period at this amplitude', `${P.sig(Tx, 5)} s (${P.sig((Tx / T0 - 1) * 100, 3)} % longer)`, 'ideal', 'ideal pendulum (point mass, massless rod, no friction), exact: T = T₀ / AGM(1, cos(θ₀/2))');
    S.result('speed at the bottom', `${P.sig(Math.sqrt(2 * g * v.L * (1 - Math.cos(th))), 4)} m/s`, 'ideal', 'energy conservation, v = √(2gL(1 − cos θ₀))');
    S.handle({ at: bob, kind: 'rot', label: 'amplitude', drag: (Ln: any, p: any, snap: any) => { const d = G.sub(p, c); const a = snap.angle((Math.atan2(d[0], -d[1]) * 180) / Math.PI); P.setOpt(Ln, 'theta', P.fmt(Math.max(-179, Math.min(179, a)), 2)); } });
  }
  function projectile(S: any, c: any, v: any, g: any) {
    if (!(g > 0)) { S.warn('\\projectile needs g > 0'); return; }
    const th = (v.angle * Math.PI) / 180, vx = v.v * Math.cos(th), vy = v.v * Math.sin(th);
    const T = (2 * vy) / g, R = vx * T, H = (vy * vy) / (2 * g);
    const k = v.scale > 0 ? v.scale : R > 1e-9 ? 8 / R : H > 0 ? 4 / H : 1;
    const pts = [];
    for (let j = 0; j <= 80; j++) { const t = (T * j) / 80; pts.push([c[0] + vx * t * k, c[1] + (vy * t - (g * t * t) / 2) * k]); }
    S.line([[c[0] - 0.3, c[1]], [c[0] + R * k + 0.5, c[1]]], { w: 'thick' }); S.hatch([[c[0] + R * k + 0.5, c[1]], [c[0] - 0.3, c[1]]], 1, {});
    if (T > 0) { S.line(pts, { color: RED, w: 'normal' }); S.mark(pts[20], pts[21], { color: RED }); }
    const tip = G.add(c, G.mul(G.dir(v.angle), 1.2));
    S.line([c, tip], { arrow: true, w: 'thick', color: BLUE }); S.text(tip, '$\\vec v_0$', { push: G.dir(v.angle), color: BLUE });
    if (v.marks && T > 0) {
      const top = [c[0] + (R * k) / 2, c[1] + H * k];
      S.line([[top[0], c[1]], top], { w: 'thin', dash: true });
      S.text([top[0], c[1] + (H * k) / 2], '$h$', { anchor: 'west' });
      S.text([c[0] + (R * k) / 2, c[1] - 0.2], '$R$', { anchor: 'north' });
    }
    const note = 'no air resistance, uniform g, landing at the launch height';
    S.result('range', `${P.sig(R, 4)} m`, 'ideal', note + ': R = v² sin 2θ / g');
    S.result('greatest height', `${P.sig(H, 4)} m`, 'ideal', note + ': h = v² sin²θ / 2g');
    S.result('time of flight', `${P.sig(T, 4)} s`, 'ideal', note + ': t = 2v sin θ / g');
    S.result('drawing scale', `${P.sig(k, 3)} cm per m`, 'exact', 'the path is drawn to scale');
    S.handle({ at: tip, kind: 'rot', label: 'launch angle', drag: (Ln: any, p: any, snap: any) => { const a = snap.angle(G.ang(G.sub(p, c))); P.setOpt(Ln, 'angle', P.fmt(Math.max(0, Math.min(90, a)), 2)); } });
  }
  function pivot(S: any, p: any) {
    S.poly([p, G.add(p, [-0.2, -0.3]), G.add(p, [0.2, -0.3])], { fill: '#eeeeee', stroke: '#000000', w: 'thin' });
    S.hatch([[p[0] + 0.3, p[1] - 0.3], [p[0] - 0.3, p[1] - 0.3]], 1, { step: 0.12, len: 0.12 });
  }
  const joint = (S: any, p: any) => S.circle(p, 0.07, { fill: '#ffffff', stroke: '#000000', w: 'normal' });
  function fourbar(S: any, c: any, v: any) {
    const { a, b, c: cc, d } = v, O2 = c, O4 = [c[0] + d, c[1]], A = G.add(O2, G.mul(G.dir(v.theta), a));
    const sorted = [a, b, cc, d].slice().sort((x, y) => x - y), [s, p, q, l] = sorted;
    const gsum = s + l, osum = p + q;
    const shortest = s === a ? 'crank' : s === d ? 'ground' : s === b ? 'coupler' : 'rocker';
    const cls = Math.abs(gsum - osum) < 1e-9 ? 'change point (Grashof, s + l = p + q): it can fold flat' : gsum < osum ? (shortest === 'crank' ? 'Grashof crank–rocker: the crank turns fully' : shortest === 'ground' ? 'Grashof double crank (drag link)' : shortest === 'coupler' ? 'Grashof double rocker' : 'Grashof rocker–crank: the rocker c turns fully') : 'non-Grashof triple rocker: no link turns fully';
    S.result('Grashof class', cls, 'exact', 's + l vs p + q, with s and l the shortest and longest links');
    pivot(S, O2); pivot(S, O4);
    S.line([O2, O4], { w: 'thin', dash: true, color: GREY });
    const X = G.circles(A, b, O4, cc);
    if (!X.length) {
      S.warn(`\\fourbar cannot close at θ = ${P.fmt(v.theta, 1)}°: the coupler and rocker cannot reach each other`);
      S.line([O2, A], { w: 'thick', color: RED });
      S.circle(A, b, { w: 'thin', dash: true, color: GREY }); S.circle(O4, cc, { w: 'thin', dash: true, color: GREY });
      joint(S, O2); joint(S, A); joint(S, O4);
    } else {
      const want = v.branch === 'crossed' ? -1 : 1;
      const B = X.find((x: any) => Math.sign(G.cross(G.sub(O4, A), G.sub(x, A))) === want) || X[0];
      S.line([O2, A], { w: 'thick', color: RED }); S.line([A, B], { w: 'thick', color: BLUE }); S.line([O4, B], { w: 'thick', color: GREEN });
      joint(S, O2); joint(S, A); joint(S, B); joint(S, O4);
      if (v.labels) {
        S.text(G.lerp(O2, A, 0.5), '$a$', { push: [-(A[1] - O2[1]), A[0] - O2[0]], color: RED });
        S.text(G.lerp(A, B, 0.5), '$b$', { push: [-(B[1] - A[1]), B[0] - A[0]], color: BLUE });
        S.text(G.lerp(O4, B, 0.5), '$c$', { push: [B[1] - O4[1], -(B[0] - O4[0])], color: GREEN });
        S.text(G.lerp(O2, O4, 0.5), '$d$', { anchor: 'north' });
      }
      const mu = (Math.acos(Math.max(-1, Math.min(1, G.dot(G.norm(G.sub(A, B)), G.norm(G.sub(O4, B)))))) * 180) / Math.PI;
      S.result('rocker angle θ₄', `${P.fmt(G.ang(G.sub(B, O4)), 2)}°`, 'exact', 'from loop closure: B is where circles of radius b about A and c about O₄ meet');
      S.result('coupler angle θ₃', `${P.fmt(G.ang(G.sub(B, A)), 2)}°`, 'exact', 'from loop closure');
      S.result('transmission angle μ', `${P.fmt(mu, 2)}°${mu < 40 || mu > 140 ? ' (poor: outside 40°–140°)' : ''}`, 'exact', 'the angle between coupler and rocker; near 90° transmits force best');
    }
    S.handle({ at: A, kind: 'rot', label: 'crank angle', drag: (Ln: any, p: any, snap: any) => P.setOpt(Ln, 'theta', P.fmt(snap.angle(G.ang(G.sub(p, O2))), 2)) });
    S.handle({ at: O4, kind: 'size', label: 'ground length', drag: (Ln: any, p: any, snap: any) => { const dd = snap.len(p[0] - c[0]); if (dd >= 0.05) P.setOpt(Ln, 'd', P.fmt(dd, 3)); } });
  }
  function slidercrank(S: any, c: any, v: any) {
    const { r, l, offset: e } = v, A = G.add(c, G.mul(G.dir(v.theta), r)), dy = c[1] + e - A[1];
    pivot(S, c);
    const reach = l * l - dy * dy;
    const sw = 0.8, sh = 0.5, trackY = c[1] + e - sh / 2;
    const xs = [c[0] - r - 0.2, c[0] + r + l + sw];
    S.line([[xs[0], trackY], [xs[1], trackY]], { w: 'thick' }); S.hatch([[xs[1], trackY], [xs[0], trackY]], 1, {});
    if (reach < 0) {
      S.warn(`\\slidercrank cannot close at θ = ${P.fmt(v.theta, 1)}°: the rod is shorter than the crank pin's height above the track line`);
      S.line([c, A], { w: 'thick', color: RED }); joint(S, c); joint(S, A);
    } else {
      const B = [A[0] + Math.sqrt(reach), c[1] + e];
      S.poly([[B[0] - sw / 2, B[1] - sh / 2], [B[0] + sw / 2, B[1] - sh / 2], [B[0] + sw / 2, B[1] + sh / 2], [B[0] - sw / 2, B[1] + sh / 2]], { fill: '#d9e4f2', stroke: '#000000', w: 'normal' });
      S.line([c, A], { w: 'thick', color: RED }); S.line([A, B], { w: 'thick', color: BLUE });
      joint(S, c); joint(S, A); joint(S, B);
      if (v.labels) { S.text(G.lerp(c, A, 0.5), '$r$', { push: [-(A[1] - c[1]), A[0] - c[0]], color: RED }); S.text(G.lerp(A, B, 0.5), '$l$', { push: [-(B[1] - A[1]), B[0] - A[0]], color: BLUE }); }
      S.result('slider position', `${P.sig(B[0] - c[0], 5)} cm from the crank pivot`, 'exact', 'x = r cos θ + √(l² − (e − r sin θ)²)');
      S.result('rod angle', `${P.fmt(G.ang(G.sub(B, A)), 2)}°`, 'exact', 'from loop closure');
      if (l - r > Math.abs(e)) S.result('stroke', `${P.sig(Math.sqrt((l + r) ** 2 - e * e) - Math.sqrt((l - r) ** 2 - e * e), 5)} cm`, 'exact', 'between the two dead centres');
      else S.result('crank', 'cannot turn fully (l − r ≤ |e|)', 'exact', '');
    }
    S.handle({ at: A, kind: 'rot', label: 'crank angle', drag: (Ln: any, p: any, snap: any) => P.setOpt(Ln, 'theta', P.fmt(snap.angle(G.ang(G.sub(p, c))), 2)) });
  }

  P.domain('mechanics', { label: 'Mechanics', commands, example: EXAMPLE, examples: EXAMPLES, solve, agm });
})();
