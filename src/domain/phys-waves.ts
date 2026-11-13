import { runtime as TD } from '../runtime';
// Physics block, waves: two coherent point sources (wavefronts, and the antinodal and nodal lines, which are
// hyperbolas r₁ − r₂ = mλ), N-slit diffraction (Fraunhofer intensity on a screen), travelling sinusoids and
// their sum, and standing waves on a string or in a pipe. Positions are centimetres of the drawing.
(function () {
  const P = TD.physics, G = P.G;
  const RED = '#c0392b', BLUE = '#1f5fa8', GREY = '#888888';
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const LABEL = txt('label', 'Label', '', { math: true });
  const COLOR = (d: any) => txt('color', 'Colour', d, { color: true });
  const cm = { unit: 'cm' };

  const commands: Record<string, any> = {
    sources: { label: 'Two coherent sources', cat: 'Interference', args: 1, params: [num('d', 'Separation', 1.6, { ...cm, min: 0.05 }), num('lambda', 'Wavelength', 0.6, { ...cm, min: 0.05 }), num('n', 'Wavefronts', 6, { min: 1, max: 30, step: 1, int: true }), num('angle', 'Axis', 90, { unit: '°', step: 15, help: 'Direction from source 1 to source 2' }), txt('lines', 'Show', 'both', { kind: 'enum', opts: [['both', 'Antinodal and nodal lines'], ['antinodal', 'Antinodal lines'], ['nodal', 'Nodal lines'], ['none', 'Wavefronts only']] }), txt('side', 'Half', 'both', { kind: 'enum', opts: [['both', 'Both sides'], ['right', 'One side']] })], make: (x: any, y: any) => `\\sources[d=1.6, lambda=0.6](${P.fmt(x)}, ${P.fmt(y)})` },
    slits: { label: 'Slits and screen', cat: 'Interference', args: 1, params: [num('n', 'Slits', 2, { min: 1, max: 50, step: 1, int: true }), num('d', 'Slit spacing', 0.25e-3, { dim: 'len', unit: 'mm', min: 0 }), num('a', 'Slit width', 0.05e-3, { dim: 'len', unit: 'mm', min: 0 }), num('lambda', 'Wavelength', 600e-9, { dim: 'len', unit: 'nm', min: 1 }), num('L', 'Screen distance', 1, { dim: 'len', unit: 'm', min: 0 }), num('range', 'Screen half-height', 0, { dim: 'len', unit: 'mm', help: '0: three fringes or the central maximum, whichever is wider' }), num('dist', 'Drawn distance', 4, { ...cm, min: 1 }), num('h', 'Drawn height', 4, { ...cm, min: 1 })], make: (x: any, y: any) => `\\slits[n=2, d=0.25mm, a=0.05mm, lambda=600nm, L=1m](${P.fmt(x)}, ${P.fmt(y)})` },
    wave: { label: 'Travelling wave', cat: 'Waves', args: 1, params: [num('A', 'Amplitude', 0.6, cm), num('lambda', 'Wavelength', 2, { ...cm, min: 0.05 }), num('phase', 'Phase', 0, { unit: '°', step: 15 }), num('length', 'Length', 8, { ...cm, min: 0.2 }), COLOR('#000000'), LABEL, txt('marks', 'Mark λ and A', 'false', { kind: 'bool' })], make: (x: any, y: any) => `\\wave[A=0.6, lambda=2](${P.fmt(x)}, ${P.fmt(y)})` },
    sum: { label: 'Sum of the waves', cat: 'Waves', args: 1, params: [COLOR(RED), LABEL], make: (x: any, y: any) => `\\sum[label=sum](${P.fmt(x)}, ${P.fmt(y)})` },
    standing: { label: 'Standing wave', cat: 'Waves', args: 1, params: [num('n', 'Mode', 3, { min: 1, max: 20, step: 1, int: true }), num('L', 'Length', 6, { ...cm, min: 0.5 }), num('A', 'Amplitude', 0.6, { ...cm, min: 0 }), txt('ends', 'Ends', 'fixed', { kind: 'enum', opts: [['fixed', 'Both fixed (string)'], ['open', 'Both open (pipe)'], ['mixed', 'One closed, one open (pipe)']] }), LABEL], make: (x: any, y: any) => `\\standing[n=3, L=6](${P.fmt(x)}, ${P.fmt(y)})` },
  };
  const EXAMPLE = `\\physics{waves}
% two coherent sources: crests, antinodal (solid) and nodal (dashed) lines
\\sources[d=1.6, lambda=0.6, n=6](0, 0)`;
  const EXAMPLES = {
    'Two-source interference': EXAMPLE,
    'Double slit': `\\physics{waves}\n\\slits[n=2, d=0.25mm, a=0.05mm, lambda=600nm, L=1m](0, 0)`,
    'Diffraction grating (5 slits)': `\\physics{waves}\n\\slits[n=5, d=0.02mm, a=0.005mm, lambda=550nm, L=0.5m, range=60mm](0, 0)`,
    'Single slit': `\\physics{waves}\n\\slits[n=1, a=0.1mm, lambda=633nm, L=2m](0, 0)`,
    'Superposition (beats)': `\\physics{waves}\n\\wave[A=0.5, lambda=1.6, label=$y_1$](0, 2.6)\n\\wave[A=0.5, lambda=1.8, label=$y_2$](0, 1.3)\n\\sum[label=$y_1+y_2$](0, -0.4)`,
    'Standing wave, third harmonic': `\\physics{waves}\n\\standing[n=3, L=6, A=0.6](0, 0)`,
    'Pipe closed at one end': `\\physics{waves}\n\\standing[n=2, L=6, A=0.6, ends=mixed](0, 0)`,
  };

  function solve(M: any, S: any) {
    const waves: any[] = [], sums: any[] = [];
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const { v, warn } = P.read(L, commands[L.cmd]);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      const q = P.pos(L, 0);
      if (q.ref || q.bad) S.warn(`\\${L.cmd}: the position must be (x, y)`);
      const c = q.p || [0, 0];
      const move = () => S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
      if (L.cmd === 'sources') { sources(S, c, v); move(); }
      if (L.cmd === 'slits') { slits(S, c, v); move(); }
      if (L.cmd === 'standing') { standing(S, c, v); move(); }
      if (L.cmd === 'wave') { waves.push({ i, c, v }); }
      if (L.cmd === 'sum') sums.push({ i, c, v });
    });
    const f = (w: any, x: any) => w.v.A * Math.sin((2 * Math.PI * (x - w.c[0])) / w.v.lambda + (w.v.phase * Math.PI) / 180);
    for (const w of waves) {
      S.obj = w.i;
      const { c, v } = w, pts = [], N = Math.max(40, Math.ceil((v.length / v.lambda) * 32));
      S.line([[c[0], c[1]], [c[0] + v.length, c[1]]], { w: 'thin', color: GREY });
      for (let k = 0; k <= N; k++) { const x = c[0] + (v.length * k) / N; pts.push([x, c[1] + f(w, x)]); }
      S.line(pts, { color: v.color || '#000000' });
      if (v.label) S.text([c[0], c[1]], v.label, { anchor: 'east' });
      if (v.marks) {
        // one wavelength between two crests, and the amplitude at the first crest
        const ph = (v.phase * Math.PI) / 180, x1 = c[0] + ((Math.PI / 2 - ph) / (2 * Math.PI) - Math.floor((Math.PI / 2 - ph) / (2 * Math.PI))) * v.lambda;
        const top = c[1] + Math.abs(v.A) + 0.25;
        if (x1 + v.lambda <= c[0] + v.length + 1e-9) { S.line([[x1, top], [x1 + v.lambda, top]], { w: 'thin', arrow: true, arrow0: true }); S.text([x1 + v.lambda / 2, top], '$\\lambda$', { anchor: 'south' }); }
        S.line([[x1, c[1]], [x1, c[1] + v.A]], { w: 'thin', arrow: true, arrow0: true, color: BLUE }); S.text([x1, c[1] + v.A / 2], '$A$', { anchor: 'east', color: BLUE });
      }
      S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
      S.handle({ at: [c[0] + v.length, c[1]], kind: 'size', label: 'length', drag: (Ln: any, p: any, snap: any) => { const l = snap.len(p[0] - c[0]); if (l >= 0.2) P.setOpt(Ln, 'length', P.fmt(l, 3)); } });
    }
    for (const s of sums) {
      S.obj = s.i;
      if (!waves.length) { S.warn('\\sum: there are no waves to add'); continue; }
      const x0 = Math.max(...waves.map((w) => w.c[0])), x1 = Math.min(...waves.map((w) => w.c[0] + w.v.length));
      if (x1 <= x0) { S.warn('\\sum: the waves do not overlap along x'); continue; }
      const N = Math.ceil((x1 - x0) * 40), pts = [];
      let peak = 0;
      for (let k = 0; k <= N; k++) { const x = x0 + ((x1 - x0) * k) / N, y = waves.reduce((a, w) => a + f(w, x), 0); peak = Math.max(peak, Math.abs(y)); pts.push([s.c[0] + (x - x0), s.c[1] + y]); }
      S.line([[s.c[0], s.c[1]], [s.c[0] + (x1 - x0), s.c[1]]], { w: 'thin', color: GREY });
      S.line(pts, { color: s.v.color || RED, w: 'thick' });
      if (s.v.label) S.text(s.c, s.v.label, { anchor: 'east' });
      S.result('largest displacement of the sum', `${P.sig(peak, 3)} cm`, 'approx', 'superposition: the displacements add point by point; the peak is the largest of 40 samples per cm, so it can fall slightly short');
      S.handle({ at: s.c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
    }
  }

  function sources(S: any, c: any, v: any) {
    const ax = G.dir(v.angle), nn = [ax[1], -ax[0]], d = v.d, lam = v.lambda;
    const s1 = G.add(c, G.mul(ax, -d / 2)), s2 = G.add(c, G.mul(ax, d / 2)), R = v.n * lam;
    const one = v.side === 'right';
    // wavefronts (crests): circles of radius kλ, half circles when one side is shown
    for (const s of [s1, s2]) for (let k = 1; k <= v.n; k++) {
      const a0 = one ? G.ang(nn) - 90 : 0, a1 = one ? G.ang(nn) + 90 : 360;
      S.line(G.arc(s, k * lam, a0, a1, one ? 48 : 96), { w: 'thin', color: '#9bb7d4' });
    }
    // lines of constant path difference r₁ − r₂ = Δ: hyperbolas with foci at the sources
    const hyper = (D: any, dash: any) => {
      const a = Math.abs(D) / 2, cc = d / 2, b2 = cc * cc - a * a;
      if (b2 <= 1e-12) return false;
      const b = Math.sqrt(b2), sg = D > 0 ? 1 : -1;   // r₁ − r₂ > 0: nearer source 2, on its side
      const branch = (sy: any) => {
        const pts = [];
        for (let t = 0; t <= 6; t += 0.02) {
          const lx = sg * a * Math.cosh(t), ly = sy * b * Math.sinh(t), p = G.add(c, G.add(G.mul(ax, lx), G.mul(nn, ly)));
          if (Math.max(G.dist(p, s1), G.dist(p, s2)) > R) break;
          pts.push(p);
        }
        return pts;
      };
      const up = branch(1), down = branch(-1);
      const pts = one ? up : [...down.reverse(), ...up.slice(1)];
      if (pts.length > 1) S.line(pts, { w: dash ? 'thin' : 'normal', dash, color: dash ? '#555555' : RED });
      return true;
    };
    const mMax = Math.floor(d / lam + 1e-9);
    let anti = 0, nodal = 0;
    if (v.lines === 'both' || v.lines === 'antinodal') for (let m = -mMax; m <= mMax; m++) {
      if (m === 0) { S.line([one ? c : G.add(c, G.mul(nn, -R)), G.add(c, G.mul(nn, R))], { color: RED }); anti++; continue; }
      if (hyper(m * lam, false)) anti++;
    }
    if (v.lines === 'both' || v.lines === 'nodal') for (let m = -mMax - 1; m <= mMax; m++) if (hyper((m + 0.5) * lam, true)) nodal++;
    for (const s of [s1, s2]) S.dot(s, { r: 2.4 });
    S.text(s1, '$S_1$', { push: G.mul(ax, -1) }); S.text(s2, '$S_2$', { push: ax });
    const note = 'two coherent in-phase point sources; a point is on an antinodal line when r₁ − r₂ = mλ, on a nodal line when r₁ − r₂ = (m + ½)λ';
    S.result('antinodal lines', `${2 * Math.floor(d / lam - 1e-9) + 1}${Math.abs(d / lam - Math.round(d / lam)) < 1e-9 && d >= lam ? ' (and the source axis beyond each source)' : ''}`, 'exact', note);
    S.result('d / λ', P.sig(d / lam, 4), 'exact', note);
    const angs = []; for (let m = 1; m <= mMax && angs.length < 4; m++) if (m * lam < d) angs.push(`${P.fmt((Math.asin((m * lam) / d) * 180) / Math.PI, 2)}°`);
    if (angs.length) S.result('far-field maxima, sin θ = mλ/d', angs.join(', '), 'exact', 'the asymptotes of the antinodal hyperbolas, measured from the perpendicular bisector');
    S.handle({ at: s2, kind: 'size', label: 'separation', drag: (L: any, p: any, snap: any) => { const dd = snap.len(2 * G.dot(G.sub(p, c), ax)); if (dd >= 0.05) P.setOpt(L, 'd', P.fmt(dd, 3)); } });
    S.handle({ at: G.add(s2, G.mul(nn, lam)), kind: 'size', label: 'wavelength', drag: (L: any, p: any, snap: any) => { const l = snap.len(G.dist(p, s2)); if (l >= 0.05) P.setOpt(L, 'lambda', P.fmt(l, 3)); } });
  }

  function slits(S: any, c: any, v: any) {
    const { n, lambda: lam, L } = v;
    let { a, d } = v;
    if (n > 1 && d <= 0) { S.warn('\\slits: d, the slit spacing, must be more than 0'); d = 0.25e-3; }
    if (n > 1 && a > d) S.warn('\\slits: the slits are wider than their spacing, so they overlap');
    if (L <= 0) { S.warn('\\slits: L must be more than 0'); return; }
    const fringe = n > 1 ? (lam * L) / d : 0, centre = a > 0 ? (lam * L) / a : 0;
    let Y = v.range > 0 ? v.range : Math.max(n > 1 ? 3.5 * fringe : 0, a > 0 ? 1.6 * centre : 0);
    if (!(Y > 0)) Y = 5e-3;
    const H = v.h, D = v.dist, sx = c[0], scr = c[0] + D, k = H / 2 / Y;
    // the barrier, its slits drawn schematically (not to scale)
    const gap = Math.min(0.12, (H * 0.35) / Math.max(1, n)), pitch = n > 1 ? Math.min(0.4, (H * 0.6) / (n - 1)) : 0;
    const ys = []; for (let j = 0; j < n; j++) ys.push(c[1] + (j - (n - 1) / 2) * pitch);
    let yy = c[1] - H / 2;
    for (const y of ys) { S.line([[sx, yy], [sx, y - gap / 2]], { w: 'vthick' }); yy = y + gap / 2; }
    S.line([[sx, yy], [sx, c[1] + H / 2]], { w: 'vthick' });
    // incoming plane wave
    for (let j = 1; j <= 4; j++) S.line([[sx - 0.25 * j, c[1] - H / 3], [sx - 0.25 * j, c[1] + H / 3]], { w: 'thin', color: '#9bb7d4' });
    S.arrow([sx - 1.6, c[1]], [sx - 0.15, c[1]], { w: 'normal', color: BLUE });
    S.text([sx - 1.6, c[1]], '$\\lambda$', { anchor: 'east', color: BLUE });
    // screen, and the intensity on it (to the right, scaled to 1.6 cm)
    S.line([[scr, c[1] - H / 2], [scr, c[1] + H / 2]], { w: 'thick' });
    S.line([[sx, c[1]], [scr, c[1]]], { w: 'thin', dash: true, color: GREY });
    S.line([[sx, c[1] - H / 2 - 0.3], [scr, c[1] - H / 2 - 0.3]], { w: 'thin', arrow: true, arrow0: true });
    S.text([(sx + scr) / 2, c[1] - H / 2 - 0.3], `$L = ${P.sig(L, 3).replace('×10^', '\\times10^{').replace(/(\{-?\d+)$/, '$1}')}\\,\\mathrm{m}$`, { anchor: 'north' });
    const I = (y: any) => {
      const s = y / Math.hypot(y, L);
      const b = (Math.PI * a * s) / lam, al = (Math.PI * d * s) / lam;
      const env = a > 0 && Math.abs(b) > 1e-12 ? (Math.sin(b) / b) ** 2 : 1;
      const arr = n > 1 ? (Math.abs(Math.sin(al)) < 1e-12 ? 1 : (Math.sin(n * al) / (n * Math.sin(al))) ** 2) : 1;
      return env * arr;
    };
    const N = 1200, pts = [], A = 1.6;
    for (let j = 0; j <= N; j++) { const y = -Y + (2 * Y * j) / N; pts.push([scr + 0.1 + A * I(y), c[1] + y * k]); }
    S.line([[scr + 0.1, c[1] - H / 2], [scr + 0.1, c[1] + H / 2]], { w: 'thin', color: GREY });
    S.line(G.simplify(pts, 0.002), { color: RED });
    S.text([scr + 0.1 + A, c[1] + H / 2], '$I$', { anchor: 'south' });
    // the principal maxima of the grating term, with their order m
    // label every j-th order so the numbers keep at least a line's height apart
    const s1 = lam / d, y1 = s1 < 1 ? (L * s1) / Math.sqrt(1 - s1 * s1) : Infinity, jm = Math.max(1, Math.ceil(0.34 / (y1 * k)));
    if (n > 1) for (let m = -12; m <= 12; m++) {
      const s = (m * lam) / d; if (Math.abs(s) >= 1) continue;
      const y = (L * s) / Math.sqrt(1 - s * s); if (Math.abs(y) > Y) continue;
      S.line([[scr - 0.1, c[1] + y * k], [scr, c[1] + y * k]], { w: 'thin' });
      if (m % jm === 0 && Math.abs(m) <= 4 * jm) S.text([scr - 0.1, c[1] + y * k], `$${m}$`, { anchor: 'east' });
    }
    const unit = (y: any) => (Math.abs(y) < 1e-3 ? `${P.sig(y * 1e6, 4)} µm` : Math.abs(y) < 1 ? `${P.sig(y * 1e3, 4)} mm` : `${P.sig(y, 4)} m`);
    const fr = 'Fraunhofer (far-field) diffraction: I = (sin β/β)² (sin Nα / N sin α)², β = πa sin θ/λ, α = πd sin θ/λ';
    if (n > 1) S.result('fringe spacing λL/d', unit(fringe), 'approx', 'small angles (sin θ ≈ tan θ); the ticks on the screen are the exact grating maxima, sin θ = mλ/d');
    if (a > 0) S.result('first minimum of the envelope, λL/a', unit(centre), 'approx', 'small angles; the minimum is at sin θ = λ/a');
    if (n > 1 && a > 0) { const miss = d / a; if (Math.abs(miss - Math.round(miss)) < 1e-6) S.result('missing orders', `every ${Math.round(miss)}th`, 'ideal', 'where a grating maximum meets a zero of the single-slit envelope (d/a is an integer)'); }
    S.result('intensity curve', `relative to the central maximum, ±${unit(Y)} shown`, 'approx', fr);
    S.result('slits', 'drawn schematically, not to scale', 'schematic', '');
    const Fn = (a > 0 ? a * a : d * d) / (lam * L);
    if (Fn > 1) S.warn(`\\slits: the Fresnel number a²/(λL) = ${P.sig(Fn, 3)} is above 1, so the screen is not in the far field: the Fraunhofer curve does not hold`);
    if (n > 1 && d < lam) S.warn('\\slits: d < λ, so there is no maximum besides the central one');
  }

  function standing(S: any, c: any, v: any) {
    const { n, L, A } = v, ends = v.ends;
    // the mode shape along the length: sin for fixed ends, cos for open, a quarter-wave series for mixed
    const k = ends === 'mixed' ? ((2 * n - 1) * Math.PI) / (2 * L) : (n * Math.PI) / L;
    const shape = (x: any) => (ends === 'open' ? Math.cos(k * x) : Math.sin(k * x));
    const N = 200, up = [], dn = [];
    for (let j = 0; j <= N; j++) { const x = (L * j) / N; up.push([c[0] + x, c[1] + A * shape(x)]); dn.push([c[0] + x, c[1] - A * shape(x)]); }
    S.line([[c[0], c[1]], [c[0] + L, c[1]]], { w: 'thin', color: GREY });
    S.line(up, { color: '#000000' });
    S.line(dn, { dash: true, color: '#000000' });
    if (ends !== 'fixed') {
      // the pipe: walls above and below, closed ends drawn as a wall
      const h = A + 0.25;
      S.line([[c[0], c[1] + h], [c[0] + L, c[1] + h]], { w: 'thick' }); S.line([[c[0], c[1] - h], [c[0] + L, c[1] - h]], { w: 'thick' });
      if (ends === 'mixed') S.line([[c[0], c[1] - h], [c[0], c[1] + h]], { w: 'thick' });
    } else for (const x of [c[0], c[0] + L]) { S.line([[x, c[1] - 0.3], [x, c[1] + 0.3]], { w: 'thick' }); S.hatch([[x, c[1] - 0.3], [x, c[1] + 0.3]], x === c[0] ? 1 : -1, {}); }
    const nodes: any[] = [], antis: any[] = [];
    for (let j = 0; j <= 4 * n + 2; j++) {
      const x = (j * Math.PI) / (2 * k);
      if (x > L + 1e-9) break;
      (Math.abs(shape(x)) < 1e-6 ? nodes : antis).push(x);
    }
    for (const x of nodes) { S.dot([c[0] + x, c[1]], { r: 2 }); S.text([c[0] + x, c[1] - A], '$N$', { anchor: 'north' }); }
    for (const x of antis) S.text([c[0] + x, c[1] - A - 0.02], '$A$', { anchor: 'north', color: BLUE });
    if (v.label) S.text([c[0], c[1]], v.label, { anchor: 'east' });
    const lam = (2 * Math.PI) / k;
    const what = ends === 'fixed' ? 'λₙ = 2L/n, string fixed at both ends' : ends === 'open' ? 'λₙ = 2L/n, pipe open at both ends (no end correction)' : 'λₙ = 4L/(2n − 1), pipe closed at one end (no end correction)';
    S.result('wavelength', `${P.sig(lam, 4)} cm = ${P.sig(lam / L, 4)} L`, 'ideal', what);
    S.result('harmonic', ends === 'mixed' ? `${2 * n - 1} (odd harmonics only)` : String(n), 'ideal', what);
    S.result('nodes, antinodes', `${nodes.length}, ${antis.length}`, 'ideal', what);
    S.handle({ at: [c[0] + L, c[1]], kind: 'size', label: 'length', drag: (Ln: any, p: any, snap: any) => { const l = snap.len(p[0] - c[0]); if (l >= 0.5) P.setOpt(Ln, 'L', P.fmt(l, 3)); } });
  }

  P.domain('waves', { label: 'Waves', commands, example: EXAMPLE, examples: EXAMPLES, solve });
})();
