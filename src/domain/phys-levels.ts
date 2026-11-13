import { runtime as TD } from '../runtime';
// Physics block, energy levels: level diagrams drawn to an energy scale, with transitions whose photon energy,
// wavelength and frequency are computed (λ = hc/ΔE, exact constants), electric-dipole selection rules when the
// levels give l, the Bohr hydrogen levels, and a line spectrum built from the transitions.
(function () {
  const P = TD.physics, G = P.G;
  const HC = 1239.8419843320026; // eV·nm, exact (h, c and e are defined in the SI)
  const H_EV = 4.135667696e-15;   // eV·s
  const RY = 13.605693122994;     // eV, the Rydberg energy for an infinitely heavy nucleus
  const num = (k: any, label: any, def: any, o = {}) => ({ k, label, def, kind: 'num', ...o });
  const txt = (k: any, label: any, def = '', o = {}) => ({ k, label, def, kind: 'text', ...o });
  const LABEL = txt('label', 'Label', '', { math: true });

  const commands: Record<string, any> = {
    setup: { label: 'Scale', cat: 'Settings', args: 0, params: [num('scale', 'Height per eV', 0.3, { unit: 'cm', min: 0.001 }), num('width', 'Level width', 3, { unit: 'cm', min: 0.5 }), txt('values', 'Show energies', 'true', { kind: 'bool' })], make: () => '\\setup[scale=0.3]' },
    level: { label: 'Level', cat: 'Levels', args: 1, argHelp: '(name)', params: [num('E', 'Energy', 0, { dim: 'energy', unit: 'eV' }), LABEL, txt('l', 'Orbital l', '', { help: 'For the selection rule Δl = ±1 (s = 0, p = 1, d = 2 …)' }), num('x', 'Left edge', 0, { unit: 'cm' }), num('width', 'Width', 0, { unit: 'cm', help: '0: the width from \\setup' })], make: () => '\\level[E=-1eV, label=$E_1$](a)' },
    hydrogen: { label: 'Hydrogen-like levels', cat: 'Levels', args: 0, params: [num('n', 'Levels', 5, { min: 1, max: 12, step: 1, int: true }), num('Z', 'Nuclear charge Z', 1, { min: 1, max: 100, step: 1, int: true }), num('x', 'Left edge', 0, { unit: 'cm' })], make: () => '\\hydrogen[n=5]' },
    transition: { label: 'Transition', cat: 'Transitions', args: 2, argHelp: '(from)(to), two level names', params: [LABEL, num('x', 'Across the level', 0, { min: 0, max: 1, step: 0.05, help: 'Where the arrow sits, 0 to 1 across the level; 0: spread automatically' }), txt('color', 'Colour', 'auto', { help: 'auto: the colour of the light, when visible' })], make: () => '\\transition(3)(2)' },
    spectrum: { label: 'Line spectrum', cat: 'Transitions', args: 1, params: [num('from', 'From', 380e-9, { dim: 'len', unit: 'nm', min: 1e-12 }), num('to', 'To', 750e-9, { dim: 'len', unit: 'nm', min: 1e-12 }), num('length', 'Length', 6, { unit: 'cm', min: 1 }), txt('labels', 'Label the lines', 'true', { kind: 'bool' })], make: (x: any, y: any) => `\\spectrum(${P.fmt(x)}, ${P.fmt(y)})` },
  };
  const EXAMPLE = `\\physics{levels}
% the Balmer series of hydrogen and its visible spectrum
\\setup[scale=0.32]
\\hydrogen[n=6]
\\transition(3)(2)
\\transition(4)(2)
\\transition(5)(2)
\\transition(6)(2)
\\spectrum(0, -6)`;
  const EXAMPLES = {
    'Balmer series': EXAMPLE,
    'Lyman and Balmer': `\\physics{levels}\n\\setup[scale=0.3, width=4]\n\\hydrogen[n=4]\n\\transition(2)(1)\n\\transition(3)(1)\n\\transition(4)(1)\n\\transition(3)(2)\n\\transition(4)(2)`,
    'Sodium D line (selection rules)': `\\physics{levels}\n\\setup[scale=1.2]\n\\level[E=0eV, l=0, label=$3s$](g)\n\\level[E=2.104eV, l=1, label=$3p$](p)\n\\level[E=3.191eV, l=0, label=$4s$](s4)\n\\transition(p)(g)\n\\transition(s4)(p)\n\\transition(s4)(g)`,
    'Three-level laser': `\\physics{levels}\n\\setup[scale=1]\n\\level[E=0eV, label=ground](1)\n\\level[E=1.79eV, label=metastable](2)\n\\level[E=2.25eV, label=pump band](3)\n\\transition[label=pump](1)(3)\n\\transition[label=fast](3)(2)\n\\transition[label=laser](2)(1)`,
  };

  // an approximate RGB for a visible wavelength in nm (for drawing only)
  function lightColor(nm: any) {
    if (nm < 380 || nm > 750) return null;
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else r = 1;
    const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
    // darkened a little so the line reads on white paper
    const h = (x: any) => Math.round(Math.pow(x * f, 0.8) * 215).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  const lamText = (nm: any) => (nm >= 1e4 ? `${P.sig(nm / 1000, 4)} µm` : nm < 1 ? `${P.sig(nm * 1000, 4)} pm` : `${P.sig(nm, 4)} nm`);
  const band = (nm: any) => (nm < 10 ? 'X-ray' : nm < 380 ? 'ultraviolet' : nm <= 750 ? 'visible' : nm < 1e6 ? 'infrared' : 'microwave');

  function solve(M: any, S: any) {
    const set = { scale: 0.3, width: 3, values: true }, levels = new Map(), order: any[] = [], trans: any[] = [], specs: any[] = [];
    M.lines.forEach((L: any, i: any) => {
      if (L.kind !== 'cmd' || !commands[L.cmd]) return;
      S.obj = i;
      const { v, warn } = P.read(L, commands[L.cmd]);
      warn.forEach((w: any) => S.warn(`\\${L.cmd}: ${w}`));
      if (L.cmd === 'setup') Object.assign(set, v);
      if (L.cmd === 'level') {
        const nm = L.args[0] && L.args[0][0];
        if (!nm) { S.warn('\\level needs a name: (a)'); return; }
        if (levels.has(nm)) S.warn(`two levels are named ${nm}`);
        const lv = { i, name: nm, E: v.E, label: v.label, l: v.l === '' ? null : parseInt(v.l, 10), x: v.x, w: v.width, own: true };
        levels.set(nm, lv); order.push(lv);
      }
      if (L.cmd === 'hydrogen') {
        for (let n = 1; n <= v.n; n++) {
          const E = (-RY * v.Z * v.Z) / (n * n), lv = { i, name: String(n), E, label: `$n=${n}$`, l: null, x: v.x, w: 0, hyd: true };
          if (levels.has(lv.name)) S.warn(`two levels are named ${lv.name}`);
          levels.set(lv.name, lv); order.push(lv);
        }
        S.result('E_n', `−${P.sig(RY * v.Z * v.Z, 6)} eV / n²`, 'approx', 'Bohr model: infinitely heavy nucleus, no fine structure, Lamb shift or reduced-mass correction (about 0.05 % for hydrogen)');
        S.result('ionisation energy', `${P.sig(RY * v.Z * v.Z, 6)} eV`, 'approx', 'from n = 1, Bohr model');
        S.hydro = { i, x: v.x, Z: v.Z };
      }
      if (L.cmd === 'transition') trans.push({ i, L, v });
      if (L.cmd === 'spectrum') specs.push({ i, L, v });
    });
    if (!order.length) { S.obj = -1; S.warn('add a level or \\hydrogen'); return; }
    const y = (E: any) => E * set.scale, W = (lv: any) => lv.w || set.width;
    // levels; their labels on the left, energies on the right. Labels closer than a line apart are spread
    // upwards and joined to their level by a short leader, so crowded levels near a limit stay readable.
    const left = [], right = [];
    for (const lv of order) {
      S.obj = lv.i;
      const a = [lv.x, y(lv.E)], b = [lv.x + W(lv), y(lv.E)];
      S.line([a, b], { w: 'thick' });
      if (lv.label) left.push({ at: a, text: lv.label, obj: lv.i });
      if (set.values) right.push({ at: b, text: `$${P.fmt(lv.E, 3)}\\,\\mathrm{eV}$`, obj: lv.i });
      if (lv.own) S.handle({ at: G.lerp(a, b, 0.5), kind: 'move', label: 'energy', drag: (Ln: any, p: any, snap: any) => { P.setOpt(Ln, 'E', P.fmt(snap.len(p[1]) / set.scale, 3) + 'eV'); } });
    }
    if (S.hydro) {
      S.obj = S.hydro.i;
      const x = S.hydro.x;
      S.line([[x, 0], [x + set.width, 0]], { w: 'thin', dash: true });
      left.push({ at: [x, 0], text: '$n=\\infty$', obj: S.hydro.i });
      if (set.values) right.push({ at: [x + set.width, 0], text: '$0$', obj: S.hydro.i });
    }
    const LEAD = 0.3;
    for (const [list, side] of [[left, -1], [right, 1]]) {
      // spread per column (labels at the same x), bottom to top
      const cols = new Map();
      for (const t of (list as any)) { const k = t.at[0].toFixed(3); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(t); }
      for (const col of cols.values()) {
        col.sort((p: any, q: any) => p.at[1] - q.at[1]);
        const gap = Math.max(...col.map((t: any) => P.box(t.text).h)) + 0.06;
        const crowded = col.some((t: any, j: any) => j && t.at[1] - col[j - 1].at[1] < gap);
        let prev = -Infinity;
        for (const t of col) {
          const yy = Math.max(t.at[1], prev + gap);
          prev = yy;
          S.obj = t.obj;
          if (crowded) {
            const e = [t.at[0] + (side as any) * LEAD, yy];
            S.line([t.at, [t.at[0] + (side as any) * LEAD * 0.35, t.at[1]], e], { w: 'thin', color: '#808080' });
            S.text(e, t.text, { anchor: (side as any) < 0 ? 'east' : 'west' });
          } else S.text(t.at, t.text, { anchor: (side as any) < 0 ? 'east' : 'west' });
        }
      }
    }
    // transitions, spread across the level width in the order they are written
    const lines: any[] = [];
    trans.forEach((t, k) => {
      S.obj = t.i;
      const ra = t.L.args[0] && t.L.args[0][0], rb = t.L.args[1] && t.L.args[1][0];
      const a = levels.get(ra), b = levels.get(rb);
      if (!a || !b) { S.warn(`\\transition: there is no level named ${!a ? ra : rb}`); return; }
      const dE = b.E - a.E;
      if (Math.abs(dE) < 1e-12) { S.warn('\\transition between levels of equal energy'); return; }
      const nm = HC / Math.abs(dE), emit = dE < 0;
      const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + W(a), b.x + W(b));
      const f = t.v.x > 0 ? t.v.x : (k + 1) / (trans.length + 1);
      const x = x1 > x0 ? x0 + (x1 - x0) * f : (a.x + W(a) / 2 + b.x + W(b) / 2) / 2;
      const col = t.v.color && t.v.color !== 'auto' ? t.v.color : lightColor(nm) || '#000000';
      const forbidden = a.l != null && b.l != null && Math.abs(a.l - b.l) !== 1;
      S.line([[x, y(a.E)], [x, y(b.E)]], { arrow: true, color: col, w: 'thick', dash: forbidden });
      if (t.v.label) S.text([x, (y(a.E) + y(b.E)) / 2], t.v.label, { anchor: 'west' });
      S.result(`${ra}→${rb} photon energy`, `${P.sig(Math.abs(dE), 5)} eV (${emit ? 'emitted' : 'absorbed'})`, 'exact', 'the difference of the level energies');
      S.result(`${ra}→${rb} wavelength`, `${lamText(nm)} (${band(nm)})`, 'exact', 'λ = hc/ΔE, with hc = 1239.84198 eV·nm (exact in the SI); in vacuum');
      S.result(`${ra}→${rb} frequency`, `${P.sig(Math.abs(dE) / H_EV, 5)} Hz`, 'exact', 'f = ΔE/h');
      if (forbidden) S.result(`${ra}→${rb}`, `forbidden: Δl = ${b.l - a.l}`, 'ideal', 'electric-dipole selection rule Δl = ±1; drawn dashed');
      lines.push({ nm, col, label: t.v.label, i: t.i });
    });
    for (const sp of specs) {
      S.obj = sp.i;
      const q = P.pos(sp.L, 0);
      if (q.ref || q.bad) { S.warn('\\spectrum: the position must be (x, y)'); continue; }
      const { from, to, length } = sp.v, c = q.p, h = 0.6;
      if (to <= from) { S.warn('\\spectrum: “to” must be longer than “from”'); continue; }
      const X = (m: any) => c[0] + ((m * 1e-9 - from) / (to - from)) * length;
      // a rainbow strip where the range is visible, white elsewhere
      const N = 60;
      for (let j = 0; j < N; j++) {
        const m0 = (from + ((to - from) * j) / N) * 1e9, m1 = (from + ((to - from) * (j + 1)) / N) * 1e9, col = lightColor((m0 + m1) / 2);
        if (col) S.poly([[X(m0), c[1]], [X(m1), c[1]], [X(m1), c[1] + h], [X(m0), c[1] + h]], { fill: col, stroke: null, opacity: 0.18 });
      }
      S.line([[c[0], c[1]], [c[0] + length, c[1]], [c[0] + length, c[1] + h], [c[0], c[1] + h], [c[0], c[1]]], { w: 'thin' });
      // ticks every 50 or 100 nm
      const span = (to - from) * 1e9, st = span > 600 ? 200 : span > 250 ? 100 : span > 100 ? 50 : span > 40 ? 10 : 5;
      for (let m = Math.ceil((from * 1e9) / st) * st; m <= to * 1e9 + 1e-9; m += st) { S.line([[X(m), c[1]], [X(m), c[1] - 0.08]], { w: 'thin' }); S.text([X(m), c[1] - 0.08], `$${m}$`, { anchor: 'north' }); }
      S.text([c[0] + length, c[1] - 0.08], '$\\lambda/\\mathrm{nm}$', { anchor: 'north west' });
      let inside = 0;
      const tags = [];
      for (const ln of lines) {
        if (ln.nm < from * 1e9 - 1e-9 || ln.nm > to * 1e9 + 1e-9) continue;
        inside++;
        S.line([[X(ln.nm), c[1]], [X(ln.nm), c[1] + h]], { color: ln.col, w: 'vthick' });
        if (sp.v.labels) tags.push({ x: X(ln.nm), text: `$${P.fmt(ln.nm, 1)}$` });
      }
      // line labels: one row while they fit, staggered upwards (with a thin leader) where they would touch
      tags.sort((p, q) => p.x - q.x);
      const ends = [];
      for (const t of tags) {
        const b = P.box(t.text);
        let row = 0;
        while (ends[row] != null && t.x - b.w / 2 < ends[row] + 0.06) row++;
        ends[row] = t.x + b.w / 2;
        const top = c[1] + h + row * (b.h + 0.04);
        if (row) S.line([[t.x, c[1] + h], [t.x, top + 0.04]], { w: 'thin', color: '#808080' });
        S.text([t.x, top], t.text, { anchor: 'south' });
      }
      S.result('lines in the range', `${inside} of ${lines.length}`, 'exact', 'line positions from λ = hc/ΔE; the background colours are approximate');
      S.handle({ at: c, kind: 'move', drag: (Ln: any, p: any) => P.setArg(Ln, 0, [p[0], p[1]]) });
      S.handle({ at: [c[0] + length, c[1] + h / 2], kind: 'size', label: 'length', drag: (Ln: any, p: any, snap: any) => { const l = snap.len(p[0] - c[0]); if (l >= 1) P.setOpt(Ln, 'length', P.fmt(l, 3)); } });
    }
  }

  P.domain('levels', { label: 'Energy levels', commands, example: EXAMPLE, examples: EXAMPLES, solve, lightColor, HC, RY });
})();
