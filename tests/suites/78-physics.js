// Physics block (js/physics.js and js/phys-*.js): each domain checked against analytic results, limits and
// degenerate inputs; the source round-trips with unknown lines kept; preview and export draw the same items;
// every example compiles; and the editor edits lines one option at a time with undo, keys and Done.
const P = TD.physics;
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const num = (s) => { const m = String(s).replace(/−/g, '-').match(/-?\d+(?:\.\d+)?(?:×10\^-?\d+|e-?\d+)?/); if (!m) return NaN; return +m[0].replace('×10^', 'e'); };
const solve = (dom, body) => P.solve(`\\physics{${dom}}\n${body}`);
// the value of the result whose label matches, on the given line (or any)
function val(R, label, obj) {
  const r = R.results.find((x) => (obj == null || x.obj === obj) && (label instanceof RegExp ? label.test(x.label) : x.label === label));
  return r ? r.value : null;
}
const nv = (R, label, obj) => num(val(R, label, obj));
const kindOf = (R, label) => (R.results.find((x) => x.label === label) || {}).kind;
const warns = (R) => R.warnings.map((w) => w.msg).join('; ');

// ---------------------------------------------------------------- source model
T.test('physics: parse and serialize round-trip every example byte for byte', () => {
  for (const [d, D] of Object.entries(P.domains)) {
    for (const [t, src] of Object.entries(D.examples)) T.eq(P.serialize(P.parse(src)), src, `${d}: ${t}`);
  }
});

T.test('physics: unknown commands, comments and plain TikZ are kept as written, and editing one option touches only its line', () => {
  const src = '\\physics{optics}\n% keep me\n\\axis(-5, 9)\n\\frobnicate[x=1]{weird}\n\\lens[f=2,   h=3.4, label=$L$, colour=teal](0)  % trailing\n\\draw[dashed] (0,0) -- (1,1);\n';
  const M = P.parse(src);
  T.eq(M.domain, 'optics');
  T.eq(M.lines.map((L) => L.kind), ['header', 'comment', 'cmd', 'unknown', 'cmd', 'tikz', 'comment']);
  const L = M.lines[4];
  P.setOpt(L, 'f', '3cm');
  const out = P.serialize(M).split('\n');
  T.eq(out[1], '% keep me'); T.eq(out[3], '\\frobnicate[x=1]{weird}'); T.eq(out[5], '\\draw[dashed] (0,0) -- (1,1);');
  T.ok(/^\\lens\[f=3cm, h=3\.4, label=\$L\$, colour=teal\]\(0\)\s*% trailing$/.test(out[4]), out[4]);
  P.setOpt(L, 'h', '');
  T.ok(!/h=/.test(P.serialize(M).split('\n')[4]), 'an empty value removes the option');
  const R = P.solve(src);
  T.ok(R.warnings.some((w) => w.obj === 3), 'the unknown line is reported: ' + warns(R));
  T.ok(R.tikz.some((t) => t.includes('\\draw[dashed]')), 'TikZ lines pass through to the export');
});

T.test('physics: quantities read units; a bare number is in the field\'s unit; bad values warn and fall back', () => {
  const R1 = solve('optics', '\\setup[lambda=0.5um]\n\\laser(-3,0)\n\\detector(2,0)');
  T.eq(R1.warnings.length, 0, warns(R1));
  const p = { k: 'lambda', kind: 'num', dim: 'len', unit: 'nm' };
  near(P.quantity('500nm', p), 5e-7, 1e-15, '500nm');
  near(P.quantity('500', p), 5e-7, 1e-15, 'bare number in nm');
  near(P.quantity('0.5um', p), 5e-7, 1e-15, 'µm');
  const a = { k: 'angle', kind: 'num', dim: 'angle', unit: 'deg' };
  near(P.quantity('30deg', a), 30, 1e-12, 'degrees');
  near(P.quantity(String(Math.PI / 6) + 'rad', a), 30, 1e-9, 'radians in degrees');
  const R = solve('optics', '\\axis(-5, 9)\n\\object[h=banana](-3)\n\\lens[f=2](0)');
  T.ok(R.warnings.length >= 1 && /h/.test(warns(R)), 'a value that is not a number warns: ' + warns(R));
  T.ok(nv(R, 'image at') > 0, 'and the default is used');
});

T.test('physics: an empty or unknown domain does not throw', () => {
  for (const src of ['', '\\physics{}', '\\physics{nonsense}\n\\lens(0)', '\\physics{optics}', 'just text']) {
    const R = P.solve(src);
    T.ok(R && Array.isArray(R.items), JSON.stringify(src));
  }
  T.ok(P.solve('\\physics{nonsense}').warnings.length > 0, 'an unknown domain warns');
});

// ---------------------------------------------------------------- optics
T.test('physics optics: thin lens 1/v − 1/u = 1/f and m = v/u, real and virtual', () => {
  for (const [u, f] of [[-3.5, 2], [-6, 2], [-1.2, 2], [-4, -2], [-3, 1.5]]) {
    const R = solve('optics', `\\axis(-8, 12)\n\\object[h=1](${u})\n\\lens[f=${f}](0)`);
    const v = 1 / (1 / f + 1 / u), m = v / u;
    near(nv(R, 'image at'), v, 0.001 * Math.max(1, Math.abs(v)), `v for u=${u}, f=${f}`);
    near(nv(R, 'magnification'), m, 0.001 * Math.max(1, Math.abs(m)), `m for u=${u}, f=${f}`);
    T.ok(new RegExp(v > 0 ? 'real' : 'virtual').test(val(R, 'magnification')), val(R, 'magnification'));
    T.eq(kindOf(R, 'image at'), 'ideal', 'thin-lens results are ideal (paraxial)');
  }
});

T.test('physics optics: an object at the focus has its image at infinity; f = 0 is refused', () => {
  const R = solve('optics', '\\axis(-5, 9)\n\\object[h=1](-2)\n\\lens[f=2](0)');
  T.ok(/infinit|∞|parallel/i.test(R.results.map((r) => r.value).join(' ')), R.results.map((r) => r.value).join(' | '));
  const Z = solve('optics', '\\axis(-5, 9)\n\\object[h=1](-2)\n\\lens[f=0](0)');
  T.ok(Z.warnings.length > 0, 'f = 0 warns');
});

T.test('physics optics: concave mirror forms the image in front of it, 1/v + 1/u = 1/f', () => {
  const R = solve('optics', '\\axis(-8, 1)\n\\mirror[f=2, h=3.4](0)\n\\object[h=1](-5)');
  near(nv(R, 'image at'), -10 / 3, 0.002, 'image distance 3.333 in front');
  near(nv(R, 'magnification'), -2 / 3, 0.002, 'm = −v/u');
});

T.test('physics optics: two lenses at f₁ + f₂ are afocal with angular magnification −f₁/f₂', () => {
  const R = solve('optics', '\\axis(-2, 12)\n\\beam[angle=0, width=1.6, n=5](-1.5, 0)\n\\lens[f=6, h=3](0)\n\\lens[f=2, h=2](8)');
  T.ok(/afocal/.test(val(R, 'lens system')), val(R, 'lens system'));
  near(num(val(R, 'lens system').split('magnification')[1]), -3, 1e-6, 'M = −f₁/f₂');
});

T.test('physics optics: Snell\'s law at an interface and total internal reflection past the critical angle', () => {
  const R = solve('optics', '\\interface[n1=1.5, n2=1, h=7, angle=180](0, 0)\n\\source[from=35, to=80, n=7](0, -2.5)');
  near(nv(R, 'critical angle'), (Math.asin(1 / 1.5) * 180) / Math.PI, 0.01, 'θc = asin(n₂/n₁)');
  // n₁ is on the left of the surface's direction: with angle=0 that is above. A ray from the glass below meets
  // the surface at 40° from the normal and leaves into the air at asin(1.5 sin 40°)
  const S = solve('optics', '\\interface[n1=1, n2=1.5, h=6, angle=0](0, 0)\n\\ray[angle=50](-2, -2.3835)');
  const segs = S.items.filter((it) => it.k === 'line' && it.obj === 2);
  const last = segs[segs.length - 1].pts, d = [last[1][0] - last[0][0], last[1][1] - last[0][1]];
  T.ok(Math.abs(last[0][1]) < 1e-6 && d[1] > 0, 'the last segment leaves the interface upwards');
  const theta2 = (Math.atan2(Math.abs(d[0]), d[1]) * 180) / Math.PI;
  near(theta2, (Math.asin(Math.sin((40 * Math.PI) / 180) * 1.5) * 180) / Math.PI, 0.05, 'refracted angle from the normal');
});

T.test('physics optics: prism minimum deviation 2·asin(n sin(A/2)) − A', () => {
  const R = solve('optics', '\\prism[n=1.5, apex=60, side=3](0, 0)\n\\ray[angle=12](-3.5, 0.2)');
  near(nv(R, 'minimum deviation'), 2 * (Math.asin(1.5 * Math.sin(Math.PI / 6)) * 180) / Math.PI - 60, 0.01, 'D_min');
});

T.test('physics optics: Malus\'s law through a chain of polarisers, unpolarised light halves', () => {
  const R = solve('optics', '\\laser(-4, 0)\n\\polarizer[axis=0, label=$P_1$](-1.5, 0)\n\\polarizer[axis=30, label=$P_2$](0.5, 0)\n\\detector(3, 0)');
  near(nv(R, 'I after P_1'), 0.5, 1e-6, 'unpolarised → ½');
  near(nv(R, 'I after P_2'), 0.5 * Math.cos(Math.PI / 6) ** 2, 1e-3, '½ cos² 30°');
  const X = solve('optics', '\\laser(-4, 0)\n\\polarizer[axis=0](-1.5, 0)\n\\polarizer[axis=90](0.5, 0)\n\\detector(3, 0)');
  T.ok(!X.results.some((r) => r.label === 'intensity') || nv(X, 'intensity') === 0, 'crossed polarisers pass nothing');
});

T.test('physics optics: Michelson and Mach–Zehnder: equal arms, phase plates and the arm length', () => {
  const base = (phi, m1) => `\\setup[lambda=500nm, unit=1um]\n\\laser(-4, 0)\n\\splitter[angle=45](0, 0)\n\\phase[phi=${phi}](1.5, 0)\n\\mirror[angle=90, h=1.2](${m1}, 0)\n\\mirror[angle=0, h=1.2](0, 3)\n\\detector[angle=0](0, -2.5)`;
  const R0 = solve('optics', base(0, 3));
  near(nv(R0, 'path difference'), 0, 1e-9, 'equal arms');
  T.ok(!/e-|×10/.test(val(R0, 'path difference')), 'no float noise: ' + val(R0, 'path difference'));
  near(nv(R0, 'intensity'), 1, 1e-6, 'constructive: all the light (ideal 50:50 splitter)');
  const R1 = solve('optics', base(90, 3));
  near(Math.abs(nv(R1, 'phase difference')), 180, 1e-6, 'a 90° plate is passed twice');
  near(nv(R1, 'intensity'), 0, 1e-9, 'destructive');
  // moving M₁ by λ/8 (0.0625 µm ... with 1 cm of drawing = 1 µm, by 0.0625 cm) changes the path by λ/4 → 90°
  const R2 = solve('optics', base(0, 3.0625));
  near(Math.abs(nv(R2, 'path difference')), 0.25, 1e-6, 'path difference in λ');
  near(nv(R2, 'intensity'), 0.5, 1e-6, 'quadrature');
  const MZ = P.solve(P.domains.optics.examples['Mach–Zehnder with a phase plate']);
  const Is = MZ.results.filter((r) => r.label === 'intensity').map((r) => num(r.value));
  T.eq(Is.length, 2, 'two detectors');
});

// ---------------------------------------------------------------- fields
const K = 8.9875517923e9, MU0 = 4e-7 * Math.PI;
T.test('physics fields: Coulomb E and V at a probe add as vectors and scalars', () => {
  const R = solve('fields', '\\charge[q=2nC](0, 0)\n\\probe(3, 0)');
  near(nv(R, '|E|'), (K * 2e-9) / 0.03 ** 2, 1, '|E| = kq/r²');
  near(nv(R, 'V'), (K * 2e-9) / 0.03, 0.5, 'V = kq/r');
  const D = P.solve(P.domains.fields.examples.Dipole);
  const r = Math.hypot(0.012, 0.015);
  near(nv(D, '|E|'), ((2 * K * 1e-9) / r ** 2) * (0.012 / r), 2, 'dipole on the bisector');
  near(nv(D, 'V'), 0, 1e-6, 'V = 0 on the bisector');
  T.eq(kindOf(D, '|E|'), 'exact');
  T.eq(kindOf(D, 'field lines'), 'schematic', 'drawn field lines are marked schematic');
});

T.test('physics fields: null point between unequal like charges', () => {
  const R = solve('fields', '\\charge[q=4nC](0, 0)\n\\charge[q=1nC](3, 0)\n\\fieldlines[n=8]');
  near(num(val(R, 'null point')), 2, 0.002, '√(4/1) = (x)/(3 − x) → x = 2');
});

T.test('physics fields: B = μ₀I / 2πr around a wire, and two antiparallel currents add between them', () => {
  const R = solve('fields', '\\wire[I=5A](0, 0)\n\\probe(1.5, 0)');
  near(nv(R, '|B|'), ((MU0 * 5) / (2 * Math.PI * 0.015)) * 1e6, 0.01, 'µT');
  const A = solve('fields', '\\wire[I=2A](-1, 0)\n\\wire[I=-2A](1, 0)\n\\probe(0, 0)');
  near(nv(A, '|B|'), 2 * ((MU0 * 2) / (2 * Math.PI * 0.01)) * 1e6, 0.01, 'doubles at the midpoint');
});

T.test('physics fields: a probe on a charge and a zero charge are handled', () => {
  const R = solve('fields', '\\charge[q=1nC](0, 0)\n\\probe(0, 0)');
  T.ok(R.warnings.length > 0 || !Number.isFinite(nv(R, '|E|')) || /∞|undefined|on a/.test(val(R, '|E|') || ''), 'a probe on a charge: ' + warns(R));
  const Z = solve('fields', '\\charge[q=0nC](0, 0)\n\\fieldlines');
  T.ok(Array.isArray(Z.items), 'q = 0 draws without throwing');
});

// ---------------------------------------------------------------- waves
T.test('physics waves: two-source maxima at sin θ = mλ/d and the count of antinodal lines', () => {
  const R = solve('waves', '\\sources[d=1.6, lambda=0.6, n=6](0, 0)');
  near(nv(R, 'd / λ'), 1.6 / 0.6, 0.001, 'd/λ');
  T.eq(nv(R, 'antinodal lines'), 2 * Math.floor(1.6 / 0.6) + 1, 'antinodal lines');
  const angles = val(R, /far-field maxima/).split(',').map(num);
  near(angles[0], (Math.asin(0.6 / 1.6) * 180) / Math.PI, 0.01, 'm = 1');
  near(angles[1], (Math.asin(1.2 / 1.6) * 180) / Math.PI, 0.01, 'm = 2');
});

T.test('physics waves: double slit and grating fringe spacing λL/d, envelope λL/a, missing orders', () => {
  const R = solve('waves', '\\slits[n=2, d=0.25mm, a=0.05mm, lambda=600nm, L=1m](0, 0)');
  near(nv(R, /fringe spacing/), 2.4, 1e-6, 'mm');
  near(nv(R, /first minimum/), 12, 1e-6, 'mm');
  T.ok(/5th/.test(val(R, 'missing orders')), val(R, 'missing orders'));
  T.eq(kindOf(R, 'fringe spacing λL/d'), 'approx', 'the small-angle result is marked approximate');
  const G = solve('waves', '\\slits[n=5, d=0.02mm, a=0.005mm, lambda=550nm, L=0.5m](0, 0)');
  near(nv(G, /fringe spacing/), 13.75, 1e-6, 'grating');
  const O = solve('waves', '\\slits[n=2, d=0.3mm, a=0.07mm, lambda=600nm, L=1m](0, 0)');
  T.ok(!val(O, 'missing orders'), 'no missing orders when d/a is not a whole number');
});

T.test('physics waves: standing waves on a string and in a pipe closed at one end', () => {
  const R = solve('waves', '\\standing[n=3, L=6, A=0.6](0, 0)');
  near(nv(R, 'wavelength'), 4, 1e-9, 'λ = 2L/n');
  T.eq(val(R, 'nodes, antinodes'), '4, 3');
  const C = solve('waves', '\\standing[n=2, L=6, A=0.6, ends=mixed](0, 0)');
  near(nv(C, 'wavelength'), 8, 1e-9, 'λ = 4L/(2n − 1)');
  T.ok(/odd/.test(val(C, 'harmonic')), val(C, 'harmonic'));
});

T.test('physics waves: beats: the sum of two equal amplitudes peaks near 2A', () => {
  const R = P.solve(P.domains.waves.examples['Superposition (beats)']);
  T.ok(nv(R, /largest displacement/) <= 1 + 1e-9 && nv(R, /largest displacement/) > 0.9, val(R, /largest displacement/));
});

// ---------------------------------------------------------------- spacetime
T.test('physics spacetime: Lorentz transform of an event; the interval is invariant', () => {
  for (const beta of [0.3, 0.5, 0.8, -0.6]) {
    const R = solve('spacetime', `\\range(-1, 4)(-0.5, 4)\n\\frame[beta=${beta}, name=S']\n\\event[label=$A$](2, 3)`);
    const g = 1 / Math.sqrt(1 - beta * beta);
    near(nv(R, "γ for S'"), g, 1e-4, 'γ');
    const xs = val(R, "A in S'").split('=')[1].replace(/[()]/g, '').split(',').map(num);
    near(xs[0], g * (2 - beta * 3), 1e-3, "x'");
    near(xs[1], g * (3 - beta * 2), 1e-3, "ct'");
    near(xs[1] ** 2 - xs[0] ** 2, 9 - 4, 2e-3, 's² invariant');
    near(nv(R, "axis angle of S'"), (Math.atan(Math.abs(beta)) * 180) / Math.PI, 0.01, 'axes tilt by atan β');
  }
});

T.test('physics spacetime: twin paradox proper times and the separation type', () => {
  const R = P.solve(P.domains.spacetime.examples['Twin paradox']);
  near(nv(R, 'proper time O→R'), 6, 1e-9, 'home');
  near(nv(R, 'proper time O→T') + nv(R, 'proper time T→R'), 2 * Math.sqrt(9 - 2.4 * 2.4), 1e-6, 'travelling');
  T.eq(val(R, 'separation'), 'timelike');
  const S = solve('spacetime', '\\event[label=$A$](0, 0)\n\\event[label=$B$](3, 1)\n\\interval(A)(B)');
  T.eq(val(S, 'separation'), 'spacelike');
  const L = solve('spacetime', '\\event[label=$A$](0, 0)\n\\event[label=$B$](2, 2)\n\\interval(A)(B)');
  T.ok(/lightlike|null/.test(val(L, 'separation')), val(L, 'separation'));
});

T.test('physics spacetime: |β| ≥ 1 is refused; a worldline faster than light warns', () => {
  const R = solve('spacetime', '\\frame[beta=1, name=S\']');
  T.ok(R.warnings.length > 0, 'β = 1: ' + warns(R));
  const W = solve('spacetime', '\\event[label=$A$](0, 0)\n\\event[label=$B$](3, 1)\n\\worldline(A)(B)');
  T.ok(W.warnings.length > 0, 'a spacelike worldline: ' + warns(W));
});

// ---------------------------------------------------------------- levels
const HC = 1239.84198;   // eV·nm
T.test('physics levels: hydrogen lines λ = hc/ΔE with Eₙ = −13.6 eV/n²', () => {
  const R = solve('levels', '\\hydrogen[n=4]\n\\transition(3)(2)\n\\transition(2)(1)');
  const Ry = 13.605693;
  const dE = Ry * (1 / 4 - 1 / 9);
  near(nv(R, '3→2 photon energy'), dE, 1e-3, 'ΔE');
  near(nv(R, '3→2 wavelength'), HC / dE, 0.2, 'Hα ≈ 656 nm');
  T.ok(/visible/.test(val(R, '3→2 wavelength')));
  T.ok(/ultraviolet/.test(val(R, '2→1 wavelength')), 'Lyman α is UV');
  T.eq(kindOf(R, 'E_n'), 'approx', 'the Bohr levels are an approximation (no fine structure)');
});

T.test('physics levels: absorbed vs emitted, selection rules and a missing level', () => {
  const R = solve('levels', '\\level[E=0eV, l=0](a)\n\\level[E=2eV, l=0](b)\n\\transition(a)(b)');
  T.ok(/absorbed/.test(val(R, 'a→b photon energy')), val(R, 'a→b photon energy'));
  T.ok(/forbidden/.test(val(R, 'a→b') || ''), 'Δl = 0 is forbidden');
  near(nv(R, 'a→b wavelength'), HC / 2, 0.2, 'λ');
  const M = solve('levels', '\\level[E=0eV](a)\n\\transition(a)(zz)');
  T.ok(M.warnings.length > 0, 'unknown level: ' + warns(M));
  const Z = solve('levels', '\\level[E=1eV](a)\n\\level[E=1eV](b)\n\\transition(a)(b)');
  T.ok(Z.warnings.length > 0 || /0 eV/.test(val(Z, 'a→b photon energy') || ''), 'ΔE = 0: ' + warns(Z));
});

// ---------------------------------------------------------------- mechanics
const g = 9.80665;
T.test('physics mechanics: block on an incline: holds below the friction angle, slides above it', () => {
  const run = (a, mu) => solve('mechanics', `\\incline[angle=${a}, L=5, mu=${mu}](0, 0)\n\\block[m=2](incline)`);
  const R = run(30, 0.4);
  near(nv(R, 'normal force N'), 2 * g * Math.cos(Math.PI / 6), 0.01, 'N = mg cos θ');
  near(nv(R, 'acceleration'), g * (Math.sin(Math.PI / 6) - 0.4 * Math.cos(Math.PI / 6)), 0.002, 'a = g(sin θ − μ cos θ)');
  near(nv(R, 'critical angle'), (Math.atan(0.4) * 180) / Math.PI, 0.01, 'tan θc = μ');
  const H = run(15, 0.4);
  T.ok(/rest|holds|static/i.test(val(H, 'state')), val(H, 'state'));
  near(nv(H, /friction/), 2 * g * Math.sin((15 * Math.PI) / 180), 0.01, 'static friction balances mg sin θ');
  const F = run(30, 0);
  near(nv(F, 'acceleration'), g / 2, 0.002, 'frictionless: g sin θ');
});

T.test('physics mechanics: Atwood machine a = (m₂ − m₁)g/(m₁ + m₂), T = 2m₁m₂g/(m₁ + m₂); equal masses balance', () => {
  const R = solve('mechanics', '\\atwood[m1=2, m2=3](0, 0)');
  near(nv(R, 'acceleration'), g / 5, 0.002, 'a');
  near(nv(R, 'tension'), (12 * g) / 5, 0.01, 'T');
  const E = solve('mechanics', '\\atwood[m1=2, m2=2](0, 0)');
  near(nv(E, 'acceleration'), 0, 1e-9, 'balanced');
  const Z = solve('mechanics', '\\atwood[m1=0, m2=0](0, 0)');
  T.ok(Z.warnings.length > 0, 'zero masses: ' + warns(Z));
});

T.test('physics mechanics: pendulum period: small angle 2π√(L/g) and the exact (AGM) period', () => {
  const R = solve('mechanics', '\\pendulum[L=1m, theta=40](0, 0)');
  near(nv(R, 'period, small-angle'), 2 * Math.PI * Math.sqrt(1 / g), 1e-4, 'T₀');
  // exact: T = T₀ / AGM(1, cos(θ₀/2))
  let a = 1, b = Math.cos((20 * Math.PI) / 180);
  for (let i = 0; i < 20; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  near(nv(R, 'period at this amplitude'), (2 * Math.PI * Math.sqrt(1 / g)) / a, 1e-4, 'T(θ₀)');
  near(nv(R, 'speed at the bottom'), Math.sqrt(2 * g * (1 - Math.cos((40 * Math.PI) / 180))), 1e-3, 'v = √(2gL(1 − cos θ))');
  const S = solve('mechanics', '\\pendulum[L=1m, theta=1](0, 0)');
  near(nv(S, 'period at this amplitude'), nv(S, 'period, small-angle'), 1e-4, 'small amplitude limit');
});

T.test('physics mechanics: projectile range, height and time; spring force and energy', () => {
  const R = solve('mechanics', '\\projectile[v=12, angle=50](0, 0)');
  const t = (50 * Math.PI) / 180;
  near(nv(R, 'range'), (144 * Math.sin(2 * t)) / g, 0.01, 'R = v² sin 2θ / g');
  near(nv(R, 'greatest height'), (144 * Math.sin(t) ** 2) / (2 * g), 0.002, 'H');
  near(nv(R, 'time of flight'), (24 * Math.sin(t)) / g, 0.001, 'T');
  const S = solve('mechanics', '\\setup[unit=1cm]\n\\spring[k=50, rest=3](0, 0)(4, 0)');
  near(nv(S, 'extension'), 1, 1e-9, 'cm');
  near(nv(S, 'spring force'), 0.5, 1e-9, 'F = kx');
  near(nv(S, 'stored energy'), 0.0025, 1e-9, '½kx²');
});

T.test('physics mechanics: four-bar Grashof classes and loop closure; slider–crank position', () => {
  const run = (a, b, c, d, th = 60) => solve('mechanics', `\\fourbar[a=${a}, b=${b}, c=${c}, d=${d}, theta=${th}](0, 0)`);
  T.ok(/crank–rocker/.test(val(run(1, 3, 2.2, 3), 'Grashof class')), 'shortest is the crank');
  T.ok(/double-crank|drag/.test(val(run(3, 3, 2.2, 1), 'Grashof class')), 'shortest is the ground: ' + val(run(3, 3, 2.2, 1), 'Grashof class'));
  T.ok(/non-Grashof|triple-rocker/i.test(val(run(2, 3, 2.5, 3.6), 'Grashof class')), val(run(2, 3, 2.5, 3.6), 'Grashof class'));
  // loop closure: a e^{iθ2} + b e^{iθ3} = d + c e^{iθ4}
  const R = run(1, 3, 2.2, 3), rad = Math.PI / 180;
  const t2 = 60 * rad, t3 = nv(R, 'coupler angle θ₃') * rad, t4 = nv(R, 'rocker angle θ₄') * rad;
  near(Math.cos(t2) + 3 * Math.cos(t3), 3 + 2.2 * Math.cos(t4), 2e-3, 'x closes');
  near(Math.sin(t2) + 3 * Math.sin(t3), 2.2 * Math.sin(t4), 2e-3, 'y closes');
  const X = run(1, 1, 1, 5);
  T.ok(X.warnings.length > 0, 'a linkage that cannot close warns: ' + warns(X));
  const C = solve('mechanics', '\\slidercrank[r=1, l=3, theta=45](0, 0)');
  near(nv(C, 'slider position'), Math.cos(Math.PI / 4) + Math.sqrt(9 - 0.5), 1e-4, 'x = r cos θ + √(l² − r² sin² θ)');
  near(nv(C, 'stroke'), 2, 1e-9, '2r');
});

// ---------------------------------------------------------------- drawing, export, determinism
T.test('physics: solving is deterministic and the preview draws exactly the exported items', () => {
  for (const [d, D] of Object.entries(P.domains)) {
    for (const [t, src] of Object.entries(D.examples)) {
      const a = P.solve(src), b = P.solve(src + '');
      T.eq(JSON.stringify(a.items), JSON.stringify(b.items), `${d}: ${t} deterministic`);
      T.eq(a.warnings.map((w) => w.msg), [], `${d}: ${t} has no warnings`);
      T.ok(!a.empty && a.items.length > 0, `${d}: ${t} draws`);
      const s = { type: 'physics', id: 'p', x: 0, y: 0, src };
      const tk = TD.toTikz([s], { standalone: false });
      // every drawn line becomes a \draw or \fill, every text a \node
      const nLines = a.items.filter((it) => it.k === 'line' || it.k === 'poly').length, nText = a.items.filter((it) => it.k === 'text').length;
      const nodes = (tk.match(/\\node\b/g) || []).length, paths = (tk.match(/\\(draw|fill|filldraw|path)\b/g) || []).length;
      T.ok(nodes >= nText, `${d}: ${t}: ${nodes} nodes for ${nText} labels`);
      T.ok(paths >= nLines, `${d}: ${t}: ${paths} paths for ${nLines} lines`);
      T.ok(!/NaN|Infinity|undefined/.test(tk), `${d}: ${t}: no NaN in the TikZ`);
    }
  }
});

T.test('physics: every example compiles with pdflatex', () => {
  for (const [d, D] of Object.entries(P.domains)) {
    let i = 0;
    for (const src of Object.values(D.examples)) T.tex(`physics-${d}-${++i}`, TD.toTikz([{ type: 'physics', id: 'p', x: 0, y: 0, src }], { standalone: true }));
  }
});

T.test('physics: the default figure exports the same TikZ as before', () => {
  T.golden('physics-optics.tex', TD.toTikz([{ type: 'physics', id: 'p', x: 0, y: 0, src: P.domains.optics.example }], { standalone: true }));
  T.golden('physics-mechanics.tex', TD.toTikz([{ type: 'physics', id: 'p', x: 0, y: 0, src: P.domains.mechanics.example }], { standalone: true }));
});

T.test('physics: dragging a handle writes only its own option, and snaps', () => {
  const src = '\\physics{optics}\n\\axis(-5, 9)\n\\object[h=1.2, label=$O$](-3.5)\n\\lens[f=2, h=3.4, label=$L$](0)';
  const M = P.parse(src), R = P.solve(src);
  const h = R.handles.find((x) => x.obj === 3 && x.kind === 'focus');
  T.ok(h, 'the lens has a focus handle');
  const snap = { angle: (a) => Math.round(a / 5) * 5, len: (v) => Math.round(v / 0.25) * 0.25 };
  h.drag(M.lines[3], [2.6, 0], snap);
  T.eq(P.serialize(M).split('\n')[3], '\\lens[f=2.5, h=3.4, label=$L$](0)');
  T.eq(P.serialize(M).split('\n').slice(0, 3).join('\n'), src.split('\n').slice(0, 3).join('\n'), 'other lines untouched');
});

// ---------------------------------------------------------------- editor
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
T.test('physics editor: places, selects, edits, undoes and applies; Done returns the source', async () => {
  const root = document.getElementById('phyModal'), code = root.querySelector('.cz-code textarea');
  let out = null;
  TD.physicsEditor.open({ src: P.domains.optics.example }, (r) => { out = r; });
  await tick(30);
  try {
    T.ok(!root.hidden, 'opens');
    T.eq(code.value, P.domains.optics.example);
    const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
    // walk to the lens, change its focal length in the inspector
    key('Tab'); key('Tab'); key('Tab');
    T.ok(/Thin lens/.test(root.querySelector('.cz-props .sec-title').textContent), 'Tab selects objects in order');
    const f = root.querySelector('[data-pf="f"]');
    f.dispatchEvent(new Event('focusin', { bubbles: true }));
    f.value = '3'; f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('focusout', { bubbles: true }));
    T.ok(/\\lens\[f=3, h=3\.4/.test(code.value), code.value);
    key('Tab', { shiftKey: true });
    T.ok(/Computed[\s\S]*image at/.test(root.querySelector('.cz-props').textContent), 'the object shows its image');
    key('Tab');
    // nudge, duplicate, delete, undo
    key('ArrowRight');
    T.ok(/\\lens\[f=3, h=3\.4, label=\$L\$\]\(0\.25\)/.test(code.value), 'arrow nudges by the grid: ' + code.value);
    key('d', { metaKey: true, ctrlKey: true });
    T.eq((code.value.match(/\\lens/g) || []).length, 2, 'duplicated');
    key('Backspace');
    T.eq((code.value.match(/\\lens/g) || []).length, 1, 'deleted');
    key('z', { metaKey: true, ctrlKey: true }); key('z', { metaKey: true, ctrlKey: true }); key('z', { metaKey: true, ctrlKey: true }); key('z', { metaKey: true, ctrlKey: true });
    T.eq(code.value, P.domains.optics.example, 'undo back to the start');
    key('z', { metaKey: true, ctrlKey: true, shiftKey: true });
    T.ok(/f=3/.test(code.value), 'redo');
    // place a screen from the palette
    const b = root.querySelector('[data-cmd="screen"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, clientX: 5, clientY: 5, pointerId: 9 }));
    b.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, clientX: 5, clientY: 5, pointerId: 9 }));
    const svg = root.querySelector('.phy-svg'), r = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + r.height / 2, pointerId: 9 }));
    svg.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, clientX: r.left + r.width * 0.8, clientY: r.top + r.height / 2, pointerId: 9 }));
    T.ok(/\\screen/.test(code.value), 'placed: ' + code.value);
    key('Escape');
    // the domain comes from the menu entry, so the editor offers no Domain choice
    key('Escape');
    T.ok(!root.querySelector('[data-dom]'), 'no Domain option');
    root.querySelector('[data-pe="done"]').click();
    await tick(300);
    T.ok(root.hidden, 'Done closes');
    T.ok(out && /\\screen/.test(out.src) && /f=3/.test(out.src), 'Done returns the edited source');
  } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-pe="cancel"]').click(); await tick(300); TD.confirm = c; } }
});

T.test('physics: the toolbar’s Physics menu lists one entry per domain, and Blocks no longer lists it', () => {
  const fly = document.getElementById('fly-phys'), blocks = document.getElementById('fly-blocks');
  const keys = [...fly.querySelectorAll('[data-insert^="physics:"]')].map((b) => b.dataset.insert.slice(8));
  T.eq(keys.join(' '), 'mechanics optics fields waves spacetime levels');
  T.ok(!blocks.querySelector('[data-insert="physics"]'), 'not in the Blocks menu');
  // every entry places a block of its own domain
  for (const k of keys) {
    const s = TD.TYPES.physics.create({ x: 1, y: 2 }, null, 'physics:' + k);
    T.eq(P.solve(s.src).domain.name, k);
  }
  T.ok(fly.querySelector('.sym-grid'), 'the mechanics and optics symbols stay below');
});

// ---------------------------------------------------------------- drawn shapes and the marquee
T.test('physics: a \\shape line holds a main-editor shape: drawn, in the bounds and exported as TikZ', () => {
  const sh = { type: 'rect', x: 200, y: -160, w: 80, h: 40, stroke: '#000000', fill: null, width: 1, dash: 'solid' };
  const src = `\\physics{optics}\n\\lens[f=2](0)\n${P.shapeLine(sh)}`;
  const R = P.solve(src);
  T.eq(R.shapes.length, 1);
  T.ok(R.bb.x1 >= 7 - 1e-9 && R.bb.y1 >= 4 - 1e-9, 'bounds grow to the shape: ' + JSON.stringify(R.bb));
  T.eq(P.serialize(P.parse(src)), src, 'round-trips');
  const tex = TD.toTikz([{ type: 'physics', id: 'p', x: 0, y: 0, src }], { standalone: true });
  T.ok(/\\draw[^;]*rectangle/.test(tex), 'exported: ' + tex);
  T.tex('physics-shape', tex);
  const bad = P.solve('\\physics{optics}\n\\shape{"type":"plot"}\n\\shape{oops}');
  T.ok(/not a shape the figure can hold/.test(warns(bad)) && /not valid JSON/.test(warns(bad)), warns(bad));
});
T.test('physics editor: draws a rectangle and text with the main tools; marquee selects, moves and deletes several', async () => {
  const root = document.getElementById('phyModal'), code = root.querySelector('.cz-code textarea');
  TD.physicsEditor.open({ src: '\\physics{optics}\n\\lens[f=2](0)' }, () => {});
  await tick(30);
  try {
    T.ok(/not LaTeX/.test(root.querySelector('.cz-code-note').textContent), 'the source says it is custom syntax');
    const svg = root.querySelector('.phy-svg'), r = svg.getBoundingClientRect();
    const ev = (t, x, y, o = {}) => svg.dispatchEvent(new PointerEvent(t, { button: 0, bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 9, ...o }));
    const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
    root.querySelector('[data-tool="rect"]').click();
    ev('pointerdown', 40, 40); ev('pointermove', 90, 70); ev('pointermove', 140, 100); ev('pointerup', 140, 100);
    T.ok(/\\shape\{"type":"rect"/.test(code.value), 'rectangle drawn: ' + code.value);
    T.ok(/Rectangle/.test(root.querySelector('.cz-props .sec-title').textContent), 'and selected');
    root.querySelector('[data-tool="text"]').click();
    ev('pointerdown', 60, r.height - 40); ev('pointerup', 60, r.height - 40);
    T.ok(/\\shape\{"type":"text"/.test(code.value), 'text placed');
    const tf = root.querySelector('[data-sf="text"]');
    tf.value = '$F$'; tf.dispatchEvent(new Event('input', { bubbles: true }));
    T.ok(/"text":"\$F\$"/.test(code.value), 'text edited');
    key('Escape');
    // a marquee over the whole stage (left to right) takes everything
    ev('pointerdown', 2, 2); ev('pointermove', 100, 100); ev('pointermove', r.width - 2, r.height - 2); ev('pointerup', r.width - 2, r.height - 2);
    T.ok(/3 objects selected/.test(root.querySelector('.cz-props').textContent), root.querySelector('.cz-props').textContent);
    const before = code.value;
    key('ArrowRight');
    T.ok(/\\lens\[f=2\]\(0\.25\)/.test(code.value) && code.value !== before, 'arrows move them all: ' + code.value);
    key('Backspace');
    T.eq(code.value.trim(), '\\physics{optics}', 'deleted together');
    key('z', { metaKey: true, ctrlKey: true });
    T.ok(/\\lens/.test(code.value) && /"rect"/.test(code.value), 'undo brings them back');
  } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-pe="cancel"]').click(); await tick(300); TD.confirm = c; } }
});
