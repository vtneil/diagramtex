import { runtime as TD } from '../runtime';
// Physics block, spacetime: Minkowski diagrams in units with c = 1 (both axes in the same unit; 1 cm of the
// drawing is one unit of x and of ct). Moving frames are drawn with their axes and with ticks calibrated by the
// invariant hyperbolas; events, world lines, light cones, lines of simultaneity and intervals use exact
// Lorentz transformations.
(function () {
  const P = TD.physics, G = P.G;
  const RED = '#c0392b', BLUE = '#1f5fa8', ORANGE = '#d68910', GREY = '#888888';
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const LABEL = txt('label', 'Label', '', { math: true });
  const BETA = num('beta', 'Speed β = v/c', 0.5, { min: -0.99, max: 0.99, step: 0.05 });

  const commands: Record<string, any> = {
    range: { label: 'Axes', cat: 'Frames', args: 2, argHelp: '(x0, x1)(ct0, ct1)', params: [txt('x', 'x label', '$x$', { math: true }), txt('t', 'ct label', '$ct$', { math: true }), txt('ticks', 'Ticks', 'true', { kind: 'bool' })], make: () => '\\range(-3, 3)(-0.5, 4)' },
    frame: { label: 'Moving frame', cat: 'Frames', args: 0, params: [BETA, txt('name', 'Name', "S'", { help: 'Events and lines refer to the frame by this name' }), txt('prime', 'Axis mark', "'", { help: "Added to the axis labels: x' and ct'" }), txt('color', 'Colour', BLUE, { color: true }), txt('ticks', 'Ticks', 'true', { kind: 'bool' })], make: () => "\\frame[beta=0.5, name=S']" },
    event: { label: 'Event', cat: 'Events', args: 1, params: [LABEL, txt('name', 'Name', '', { help: 'Lines refer to the event by this name; empty: the label without $' }), txt('in', 'Coordinates in', '', { help: "A frame's name: the position is that frame's (x', ct')" }), txt('guides', 'Coordinate lines', 'false', { kind: 'enum', opts: [['false', 'None'], ['true', 'In every frame'], ['rest', 'Rest frame only']] })], make: (x: any, y: any) => `\\event[label=$A$](${P.fmt(x)}, ${P.fmt(y)})` },
    worldline: { label: 'World line', cat: 'Lines', args: 1, minArgs: 1, argHelp: '(x, ct) with beta, or (A)(B) between two events', params: [num('beta', 'Speed β', 0, { min: -0.99, max: 0.99, step: 0.05 }), LABEL, txt('color', 'Colour', RED, { color: true })], make: (x: any, y: any) => `\\worldline[beta=0.3, label=particle](${P.fmt(x)}, ${P.fmt(y)})` },
    lightcone: { label: 'Light cone', cat: 'Lines', args: 1, params: [txt('fill', 'Shade the future', 'true', { kind: 'bool' })], make: (x: any, y: any) => `\\lightcone(${P.fmt(x)}, ${P.fmt(y)})` },
    simultaneity: { label: 'Line of simultaneity', cat: 'Lines', args: 1, params: [txt('frame', 'Frame', "S'"), txt('color', 'Colour', BLUE, { color: true })], make: () => "\\simultaneity[frame=S'](A)" },
    interval: { label: 'Interval', cat: 'Lines', args: 2, argHelp: '(A)(B), two events', params: [], make: () => '\\interval(A)(B)' },
    hyperbola: { label: 'Invariant hyperbola', cat: 'Lines', args: 0, params: [num('s', 'Interval s', 1, { min: 0.05 }), txt('type', 'Kind', 'time', { kind: 'enum', opts: [['time', 'Timelike: (ct)² − x² = s²'], ['space', 'Spacelike: x² − (ct)² = s²']] })], make: () => '\\hyperbola[s=1]' },
  };
  const EXAMPLE = `\\physics{spacetime}
% a frame moving at 0.5c: its axes tilt toward the light line; drag the event
\\range(-1, 4)(-0.5, 4)
\\frame[beta=0.5, name=S']
\\lightcone(0, 0)
\\event[label=$A$, guides=true](2, 3)`;
  const EXAMPLES = {
    'Moving frame': EXAMPLE,
    'Relativity of simultaneity': "\\physics{spacetime}\n\\range(-1, 4)(-0.5, 3.5)\n\\frame[beta=0.4, name=S']\n\\event[label=$A$](1, 1.5)\n\\event[label=$B$](3, 1.5)\n\\simultaneity[frame=S'](A)\n\\simultaneity[frame=S'](B)",
    'Twin paradox': "\\physics{spacetime}\n\\range(-0.5, 3)(-0.3, 6)\n\\event[label=$O$](0, 0)\n\\event[label=$T$](2.4, 3)\n\\event[label=$R$](0, 6)\n\\worldline[label=home twin](O)(R)\n\\worldline[label=out](O)(T)\n\\worldline[label=back](T)(R)\n\\interval(O)(R)",
    'Calibration hyperbolas': "\\physics{spacetime}\n\\range(-0.5, 3)(-0.5, 3)\n\\frame[beta=0.6, name=S']\n\\hyperbola[s=1]\n\\hyperbola[s=2]\n\\hyperbola[s=1, type=space]",
  };

  const lorentz = (b: any) => { const g = 1 / Math.sqrt(1 - b * b); return { b, g, to: ([x, t]: any) => [g * (x - b * t), g * (t - b * x)], from: ([x, t]: any) => [g * (x + b * t), g * (t + b * x)] }; };
  const nameOf = (v: any) => (v.name || (v.label || '').replace(/[$\\{}]/g, '').trim());
  const mathName = (s: any) => (/[$]/.test(s) ? s : `$${s}$`);

  function solve(M: any, S: any) {
    let F: any = null;
    const frames = new Map(), events = new Map(), list: any[] = [];
    // first pass: the range, the frames and the events (other lines refer to them by name)
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const { v, warn } = P.read(L, commands[L.cmd]);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      list.push({ L, i, v });
      if (L.cmd === 'range') {
        const a = P.pos(L, 0), b = P.pos(L, 1);
        if (a.missing || b.missing || a.ref || b.ref || a.one || b.one) S.warn('\\range needs (x0, x1)(ct0, ct1)');
        else if (a.p[1] - a.p[0] < 0.5 || b.p[1] - b.p[0] < 0.5) S.warn('\\range is too small, or its numbers are in the wrong order');
        else F = { i, v, x0: a.p[0], x1: a.p[1], y0: b.p[0], y1: b.p[1] };
      }
      if (L.cmd === 'frame') { if (frames.has(v.name)) S.warn(`\\frame: two frames are named ${v.name}`); frames.set(v.name, { i, v, T: lorentz(v.beta) }); }
    });
    list.filter((o) => o.L.cmd === 'event').forEach(({ L, i, v }) => {
      S.obj = i;
      const q = P.pos(L, 0);
      if (q.ref || q.bad || q.missing || q.one) { S.warn('\\event needs a position (x, ct)'); return; }
      let p = q.p, fr = null;
      if (v.in) { fr = frames.get(v.in); if (!fr) S.warn(`\\event: there is no frame named ${v.in}`); else p = fr.T.from(q.p); }
      const nm = nameOf(v);
      if (nm && events.has(nm)) S.warn(`\\event: two events are named ${nm}`);
      events.set(nm, { i, v, p, fr, given: q.p });
    });
    if (!F) {
      const pts = [...events.values()].map((e) => e.p);
      const xs = [0, ...pts.map((p) => p[0])], ts = [0, ...pts.map((p) => p[1])];
      F = { i: -1, v: { x: '$x$', t: '$ct$', ticks: true }, x0: Math.min(-1, ...xs) - 0.5, x1: Math.max(3, ...xs) + 0.5, y0: Math.min(-0.5, ...ts) - 0.3, y1: Math.max(3, ...ts) + 0.5 };
    }
    const box = { x0: F.x0, x1: F.x1, y0: F.y0, y1: F.y1 };
    const ev = (ref: any) => { const e = events.get(ref); if (!e) S.warn(`there is no event named ${ref}`); return e; };
    const argRef = (L: any, k: any) => (L.args[k] && L.args[k].length === 1 && !/^[-+−.\d]/.test(L.args[k][0]) ? L.args[k][0] : null);

    // rest frame axes
    S.obj = F.i;
    S.line([[F.x0, 0], [F.x1, 0]], { arrow: true }); S.line([[0, F.y0], [0, F.y1]], { arrow: true });
    S.text([F.x1, 0], F.v.x, { anchor: 'north east' }); S.text([0, F.y1], F.v.t, { anchor: 'north east' });
    if (F.v.ticks) {
      for (let k = Math.ceil(F.x0); k <= F.x1 - 0.3; k++) if (k) S.line([[k, -0.06], [k, 0.06]], { w: 'thin' });
      for (let k = Math.ceil(F.y0); k <= F.y1 - 0.3; k++) if (k) S.line([[-0.06, k], [0.06, k]], { w: 'thin' });
    }
    if (F.i >= 0) {
      S.handle({ at: [F.x1, 0], kind: 'size', label: 'x range', drag: (L: any, p: any, snap: any) => P.setArg(L, 0, [F.x0, Math.max(F.x0 + 0.5, snap.len(p[0]))]) });
      S.handle({ at: [0, F.y1], kind: 'size', label: 'ct range', drag: (L: any, p: any, snap: any) => P.setArg(L, 1, [F.y0, Math.max(F.y0 + 0.5, snap.len(p[1]))]) });
    }
    // light lines through the origin
    for (const s of [1, -1]) { const seg = G.clip([0, 0], [s, 1], box); if (seg) S.line(seg, { w: 'thin', dash: true, color: ORANGE }); }

    for (const { L, i, v } of list) {
      S.obj = i;
      switch (L.cmd) {
        case 'frame': {
          const { T } = frames.get(v.name) || {}; if (!T) break;
          const col = v.color || BLUE, tA = G.clip([0, 0], [T.b, 1], box, 0), xA = G.clip([0, 0], [1, T.b], box, 0);
          const tB = G.clip([0, 0], [T.b, 1], box, -Infinity, 0), xB = G.clip([0, 0], [1, T.b], box, -Infinity, 0);
          if (tA) { S.line([tB ? tB[0] : [0, 0], tA[1]], { color: col, arrow: true }); S.text(tA[1], `$ct${v.prime}$`, { anchor: 'north east', color: col }); }
          if (xA) { S.line([xB ? xB[0] : [0, 0], xA[1]], { color: col, arrow: true }); S.text(xA[1], `$x${v.prime}$`, { anchor: 'south east', color: col }); }
          if (v.ticks) for (let k = -12; k <= 12; k++) {
            if (!k) continue;
            const pt = T.from([0, k]), px = T.from([k, 0]), d = 0.07;
            const nt = G.norm([1, T.b]), nx = G.norm([T.b, 1]);
            if (inside(pt, box, 0.3)) S.line([G.add(pt, G.mul(nt, -d)), G.add(pt, G.mul(nt, d))], { w: 'thin', color: col });
            if (inside(px, box, 0.3)) S.line([G.add(px, G.mul(nx, -d)), G.add(px, G.mul(nx, d))], { w: 'thin', color: col });
          }
          S.result(`γ for ${v.name}`, P.sig(T.g, 5), 'exact', 'γ = 1/√(1 − β²)');
          S.result(`axis angle of ${v.name}`, `${P.fmt((Math.atan(Math.abs(T.b)) * 180) / Math.PI, 2)}° from the rest axes`, 'exact', "ct' tilts toward the light line by arctan β, and so does x'");
          S.result(`tick spacing of ${v.name}`, `${P.sig(Math.sqrt((1 + T.b * T.b) / (1 - T.b * T.b)), 5)} cm per unit`, 'exact', "one unit of x' or ct' is √((1 + β²)/(1 − β²)) on the page: the ticks lie on the invariant hyperbolas");
          if (tA) S.handle({ at: G.add([0, 0], G.mul(G.norm([T.b, 1]), Math.min(2, G.len(tA[1])))), kind: 'rot', label: 'speed', drag: (Ln: any, p: any, snap: any) => { if (p[1] <= 0.05) return; const b = Math.max(-0.99, Math.min(0.99, p[0] / p[1])); P.setOpt(Ln, 'beta', P.fmt(snap.step ? Math.round(b / 0.05) * 0.05 : b, 3)); } });
          break;
        }
        case 'lightcone': {
          const ref = argRef(L, 0), e = ref ? ev(ref) : null, q = ref ? null : P.pos(L, 0);
          const c = e ? e.p : q && !q.ref && !q.bad ? q.p : null;
          if (!c) break;
          const a = G.clip(c, [1, 1], box, 0), b = G.clip(c, [-1, 1], box, 0);
          if (v.fill && a && b) S.poly([c, a[1], ...cornersBetween(a[1], b[1], box, c), b[1]], { fill: '#fdf0d5', stroke: null, back: true });
          for (const d of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const s = G.clip(c, d, box, 0); if (s) S.line(s, { w: 'normal', color: ORANGE }); }
          if (!ref) S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
          break;
        }
        case 'hyperbola': {
          const s = v.s, pts = [], time = v.type !== 'space';
          for (let u = -4; u <= 4; u += 0.02) { const p = time ? [s * Math.sinh(u), s * Math.cosh(u)] : [s * Math.cosh(u), s * Math.sinh(u)]; if (inside(p, box)) pts.push(p); else if (pts.length > 1) break; }
          if (pts.length > 1) S.line(pts, { w: 'thin', color: GREY });
          S.handle({ at: time ? [0, s] : [s, 0], kind: 'size', label: 'interval', drag: (Ln: any, p: any, snap: any) => { const r = snap.len(time ? p[1] : p[0]); if (r >= 0.05) P.setOpt(Ln, 's', P.fmt(r, 3)); } });
          break;
        }
      }
    }
    // world lines, intervals, simultaneity: after the frames, before the events (which sit on top)
    for (const { L, i, v } of list) {
      S.obj = i;
      if (L.cmd === 'worldline') {
        const r0 = argRef(L, 0), r1 = argRef(L, 1), col = v.color || RED;
        if (r0 && r1) {
          const a = ev(r0), b = ev(r1); if (!a || !b) continue;
          const dx = b.p[0] - a.p[0], dt = b.p[1] - a.p[1];
          if (Math.abs(dt) <= Math.abs(dx) + 1e-12) { S.warn(`\\worldline from ${r0} to ${r1} would be at or faster than light (|Δx| ≥ |cΔt|)`); S.line([a.p, b.p], { dash: true, color: col }); continue; }
          S.line([a.p, b.p], { w: 'thick', color: col });
          S.mark(a.p, b.p, { color: col });
          if (v.label) S.text(G.lerp(a.p, b.p, 0.5), v.label, { push: [1, -dx / dt] });
          const beta = dx / dt, tau = Math.sqrt(dt * dt - dx * dx);
          S.result(`β from ${r0} to ${r1}`, P.sig(beta, 4), 'exact', 'β = Δx / (cΔt)');
          S.result(`proper time ${r0}→${r1}`, `${P.sig(tau, 5)} (c·τ, in units of the axes)`, 'exact', 'cτ = √((cΔt)² − Δx²) along a straight (inertial) world line');
        } else {
          const q = P.pos(L, 0); if (q.ref || q.bad || q.missing) { S.warn('\\worldline needs (x, ct) and beta, or two events (A)(B)'); continue; }
          const s = G.clip(q.p, [v.beta, 1], box);
          if (s) { S.line(s, { w: 'thick', color: col }); S.mark(s[0], s[1], { color: col }); if (v.label) S.text(s[1], v.label, { anchor: 'south', color: col }); }
          S.result('γ', P.sig(1 / Math.sqrt(1 - v.beta * v.beta), 5), 'exact', 'γ = 1/√(1 − β²)');
          S.handle({ at: q.p, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
          S.handle({ at: G.add(q.p, G.mul(G.norm([v.beta, 1]), 1.2)), kind: 'rot', label: 'speed', drag: (Ln: any, p: any) => { const d = G.sub(p, q.p); if (d[1] <= 0.05) return; P.setOpt(Ln, 'beta', P.fmt(Math.max(-0.99, Math.min(0.99, d[0] / d[1])), 3)); } });
        }
      }
      if (L.cmd === 'interval') {
        const r0 = argRef(L, 0), r1 = argRef(L, 1);
        if (!r0 || !r1) { S.warn('\\interval needs two events: (A)(B)'); continue; }
        const a = ev(r0), b = ev(r1); if (!a || !b) continue;
        const dx = b.p[0] - a.p[0], dt = b.p[1] - a.p[1], s2 = dt * dt - dx * dx;
        S.line([a.p, b.p], { w: 'thin', dash: true });
        const kind = Math.abs(s2) < 1e-9 ? 'lightlike (null)' : s2 > 0 ? 'timelike' : 'spacelike';
        S.result(`(Δs)² for ${r0}${r1}`, `${P.sig(s2, 5)} = (cΔt)² − Δx²`, 'exact', 'the invariant interval, the same in every inertial frame (signature + − )');
        S.result('separation', kind, 'exact', 'timelike: one can cause the other; spacelike: no frame sees them at one place');
        if (s2 > 1e-9) S.result('proper time', `cτ = ${P.sig(Math.sqrt(s2), 5)}`, 'exact', 'the time on a clock moving inertially from one event to the other');
        if (s2 < -1e-9) S.result('proper distance', P.sig(Math.sqrt(-s2), 5), 'exact', 'the distance in the frame where the events are simultaneous');
      }
      if (L.cmd === 'simultaneity') {
        const r = argRef(L, 0), e = r ? ev(r) : null; if (!e) { if (!r) S.warn('\\simultaneity needs an event: (A)'); continue; }
        const fr = v.frame ? frames.get(v.frame) : null;
        if (v.frame && !fr) { S.warn(`\\simultaneity: there is no frame named ${v.frame}`); continue; }
        const b = fr ? fr.T.b : 0, s = G.clip(e.p, [1, b], box);
        if (s) S.line(s, { w: 'thin', dash: true, color: v.color || BLUE });
        const t = fr ? fr.T.to(e.p)[1] : e.p[1];
        S.result(`ct${fr ? fr.v.prime : ''} of ${r}`, P.sig(t, 5), 'exact', 'events on this line happen at the same time in that frame');
      }
    }
    // events on top, with their coordinates in every frame
    for (const [nm, e] of events) {
      S.obj = e.i;
      const p = e.p, { v } = e;
      if (v.guides !== 'false') {
        S.line([[p[0], 0], p], { w: 'thin', dash: true, color: GREY }); S.line([[0, p[1]], p], { w: 'thin', dash: true, color: GREY });
        if (v.guides === 'true') for (const fr of frames.values()) {
          const T = fr.T, [xp, tp] = T.to(p), col = fr.v.color || BLUE;
          S.line([T.from([xp, 0]), p], { w: 'thin', dash: true, color: col }); S.line([T.from([0, tp]), p], { w: 'thin', dash: true, color: col });
        }
      }
      S.dot(p, { r: 2.4 });
      if (v.label) S.text(p, v.label, { anchor: 'south west' });
      if (!inside(p, box)) S.warn(`\\event ${nm} is outside the axes`);
      S.result(`${nm || 'event'} in the rest frame`, `(x, ct) = (${P.sig(p[0], 4)}, ${P.sig(p[1], 4)})`, 'exact', 'the axes drawn upright');
      for (const fr of frames.values()) { const q = fr.T.to(p); S.result(`${nm || 'event'} in ${fr.v.name}`, `(x${fr.v.prime}, ct${fr.v.prime}) = (${P.sig(q[0], 4)}, ${P.sig(q[1], 4)})`, 'exact', `Lorentz transformation with β = ${P.fmt(fr.T.b, 4)}`); }
      // dragging moves the event in the frame its coordinates are written in
      S.handle({ at: p, kind: 'move', drag: (L: any, q: any) => { const w = e.fr ? e.fr.T.to(q) : q; P.setArg(L, 0, [P.fmt(w[0], 3), P.fmt(w[1], 3)]); } });
    }
  }
  const inside = (p: any, b: any, m = 0) => p[0] >= b.x0 - 1e-9 + m && p[0] <= b.x1 + 1e-9 - m && p[1] >= b.y0 - 1e-9 + m && p[1] <= b.y1 + 1e-9 - m;
  // the box corners that lie inside the future cone of c, in order from a (right side) round to b (left side)
  function cornersBetween(a: any, b: any, box: any, c: any) {
    const cs = [[box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [box.x0, box.y0]].filter((p) => p[1] - c[1] >= Math.abs(p[0] - c[0]) - 1e-9);
    return cs.sort((p, q) => Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]));
  }

  P.domain('spacetime', { label: 'Spacetime', commands, example: EXAMPLE, examples: EXAMPLES, solve, lorentz });
})();
