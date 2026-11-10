// circuitikz parts: logic gates, filters, generators, signal/DSP blocks and power converters.
// See czcore.js for units and the drawing API. Geometry follows circuitikz's pgfcirctripoles.tex
// (logic ports, transmission gates) and pgfcircquadpoles.tex (two-port blocks), default style.
(function () {
  const P = window.TD.CZ.part;
  const RLEN = 1.4; // bipoles/length (cm)
  const D2R = Math.PI / 180;
  // circuitikz draws component bodies at 2× the wire width (bipoles/tripoles thickness = 2); leads,
  // inner block symbols and the IEC negation stroke use the plain wire width, i.e. half of that.
  const THIN = 0.5;
  const FS = 0.35; // \normalsize (10pt) in cm
  const AH = [0.14, 0.05]; // the `latex` tip of tunable arrows (length, half width)

  // ---------- logic ports ----------
  // Input lead y positions for n inputs spread over a body of half height `up` (\pgf@circ@logicport@input).
  const inputsY = (up, n) => { const st = (2 * up) / n; return Array.from({ length: n }, (_, i) => up + st / 2 - (i + 1) * st); };

  // American and/nand/or/nor/xor/xnor port: width 1.1, height .8, port width .7, circle width .15,
  // angle 70, inner .3, xor distance .1. Legacy origin: the `center` anchor sits at .8 × right, so the
  // drawing is shifted left by that much.
  function american(kind, neg) {
    const up = 0.4 * RLEN, right = 0.55 * RLEN, pw = 0.7 * right, cw = 0.15 * right, ox = 0.8 * right;
    const ys = inputsY(up, 2);
    const a = 70 * D2R, xr = (0.3 * right) / (1 - Math.cos(a)), yr = up / Math.sin(a), xo = pw + xr * Math.cos(a);
    const dist = 0.1 * right, lw2 = 2 * 0.0141; // 2\pgflinewidth (0.4pt) shrink of the extra xor arc
    const xrA = xr - lw2, yrA = yr - lw2;
    const leadEnd = (y) => kind === 'and' ? -pw
      : kind === 'or' ? xr * Math.cos(Math.asin(y / yr)) - xo
        : xrA * Math.cos(Math.asin(y / yrA)) - xo - dist;
    const pins = { 'in 1': [-right - ox, ys[0]], 'in 2': [-right - ox, ys[1]], out: [right - ox, 0] };
    const draw = (g) => {
      const X = (x) => x - ox;
      g.width(THIN);
      for (const y of ys) g.line(X(-right), y, X(leadEnd(y)), y);
      g.line(X(right), 0, X(pw), 0);
      g.width(1);
      const tip = neg ? pw - cw : pw;
      if (kind === 'and') {
        g.M(X(-pw), up).L(X(-pw), -up).arc(X(-pw), 0, neg ? 2 * pw - cw : 2 * pw, up, -90, 90, true).Z();
      } else {
        // pointy (default) or shape: back arc, then two curves to the tip
        g.M(X(-pw), up).arc(X(-xo), 0, xr, yr, 70, -70, true)
          .C(X(0.3 * right), -up, X(0.3 * right), -0.5 * up, X(tip), 0)
          .C(X(0.3 * right), 0.5 * up, X(0.3 * right), up, X(-pw), up).Z();
        if (kind === 'xor') g.arc(X(-pw - dist - xrA * Math.cos(a)), 0, xrA, yrA, 70, -70);
      }
      if (neg) g.circle(X(tip + cw / 2), 0, cw / 2);
    };
    return { pins, draw };
  }

  // European (IEC) port: width 1.4, height .65, reserved .6; not = a slanted stroke from .9 right
  // to (reserved right, .3 up). Origin .8 × right (legacy).
  function european(label, n, neg) {
    const up = 0.325 * RLEN, right = 0.7 * RLEN, bx = 0.6 * right, ox = 0.8 * right;
    const ys = n === 1 ? [0] : inputsY(up, n);
    const pins = n === 1 ? { in: [-right - ox, 0] } : {};
    if (n > 1) ys.forEach((y, i) => { pins['in ' + (i + 1)] = [-right - ox, y]; });
    pins.out = [right - ox, 0];
    const draw = (g) => {
      const X = (x) => x - ox;
      g.width(THIN);
      for (const y of ys) g.line(X(-right), y, X(-bx), y);
      g.line(X(right), 0, X(bx), 0);
      if (neg) g.line(X(0.9 * right), 0, X(bx), 0.3 * up);
      g.width(1).rect(X(-bx), -up, X(bx), up);
      if (label) g.text(X(0), 0, label, FS);
    };
    return { pins, draw };
  }

  // American not/buffer and the Schmitt triggers: width 1, height .8 (bipoles/not port), circle .15;
  // the triangle spans .7 × left .. .7 × right, centre anchor at the middle.
  function triangle(neg, schmitt) {
    const right = 0.5 * RLEN, up = 0.4 * RLEN, cw = 0.15 * right, tip = neg ? 0.7 * right - cw : 0.7 * right;
    const pins = { in: [-right, 0], out: [right, 0] };
    const draw = (g) => {
      g.width(THIN).line(-right, 0, -0.7 * right, 0).line(right, 0, 0.7 * right, 0);
      g.width(1).poly(tip, 0, -0.7 * right, up, -0.7 * right, -up);
      if (neg) g.circle(tip + cw / 2, 0, cw / 2);
      if (schmitt) {
        const l = -right, y = 0.3 * up;
        g.line(0.6 * l, -y, 0.4 * l, -y, 0.4 * l, y, 0.05 * l, y).line(0.4 * l, -y, 0.25 * l, -y, 0.25 * l, y);
      }
    };
    return { pins, draw };
  }

  // IEEE transmission gates (tgate scale .7, ieeestd baselen .4, height 2, pin length .7, not radius .154)
  function tgate(dbl) {
    const stdH = 0.5 * 0.4 * 2 * RLEN, k = 0.7, L = 2 * 0.8660254 * stdH * k, up = (dbl ? 2 : 1) * stdH * k;
    const pin = 0.4 * 0.7 * RLEN, nr = 0.154 * stdH, mid = dbl ? 0.5 * up : 0;
    const pins = { in: [-L - pin, 0], out: [L + pin, 0], gate: [0, -mid - pin], notgate: [0, mid + pin] };
    const draw = (g) => {
      g.width(THIN).line(-L, 0, -L - pin, 0).line(L, 0, L + pin, 0)
        .line(0, -mid, 0, -mid - pin).line(0, mid + 2.1547 * nr, 0, mid + pin);
      g.width(1);
      if (dbl) {
        for (const s of [1, -1]) g.poly(-L, s * up, 0, s * mid, -L, 0).poly(L, s * up, 0, s * mid, L, 0);
      } else g.poly(-L, up, 0, 0, -L, -up).poly(L, up, 0, 0, L, -up);
      g.circle(0, mid + 1.1547 * nr, nr).paper();
    };
    return { pins, draw };
  }

  const L = (key, name, tikz, geo, keywords) => P({ key: 'logic:' + key, name, cat: 'logic', kind: 'node', tikz, pins: geo.pins, draw: geo.draw, keywords });
  L('and', 'AND gate', 'american and port', american('and', false), 'and port logic ansi');
  L('nand', 'NAND gate', 'american nand port', american('and', true), 'nand port logic ansi');
  L('or', 'OR gate', 'american or port', american('or', false), 'or port logic ansi');
  L('nor', 'NOR gate', 'american nor port', american('or', true), 'nor port logic ansi');
  L('xor', 'XOR gate', 'american xor port', american('xor', false), 'xor exclusive port logic ansi');
  L('xnor', 'XNOR gate', 'american xnor port', american('xor', true), 'xnor exclusive port logic ansi');
  L('buffer', 'Buffer', 'american buffer port', triangle(false, false), 'buffer port logic driver');
  L('not', 'NOT gate', 'american not port', triangle(true, false), 'not inverter port logic');
  L('eand', 'European AND gate', 'european and port', european('&', 2, false), 'and port logic iec');
  L('enand', 'European NAND gate', 'european nand port', european('&', 2, true), 'nand port logic iec');
  L('eor', 'European OR gate', 'european or port', european('≥1', 2, false), 'or port logic iec');
  L('enor', 'European NOR gate', 'european nor port', european('≥1', 2, true), 'nor port logic iec');
  L('exor', 'European XOR gate', 'european xor port', european('=1', 2, false), 'xor port logic iec');
  L('exnor', 'European XNOR gate', 'european xnor port', european('=1', 2, true), 'xnor port logic iec');
  L('ebuffer', 'European buffer gate', 'european buffer port', european('1', 1, false), 'buffer port logic iec');
  L('enot', 'European NOT gate', 'european not port', european('1', 1, true), 'not inverter port logic iec');
  L('eblank', 'European blank gate', 'european blank port', european('', 2, false), 'blank empty port logic iec');
  L('eblanknot', 'European blank NOT gate', 'european blank not port', european('', 2, true), 'blank empty not port logic iec');
  L('schmitt', 'Schmitt trigger', 'schmitt', triangle(false, true), 'schmitt trigger hysteresis buffer');
  L('invschmitt', 'Inverting Schmitt trigger', 'invschmitt', triangle(true, true), 'schmitt trigger inverting hysteresis not');
  L('tgate', 'Transmission gate', 'tgate', tgate(false), 'transmission gate tgate cmos switch');
  L('dtgate', 'Double transmission gate', 'double tgate', tgate(true), 'transmission gate double tgate cmos switch');

  // ---------- two-port blocks (bipoles) ----------
  // All are .7 × Rlen squares (0.98 cm); s = half side (\pgf@circ@res@step). Box at bipole thickness,
  // inner symbols at the wire width.
  const W = 0.98, S = W / 2; // .7 × Rlen
  const box = (g) => g.width(1).rect(-S, -S, S, S).width(THIN);
  // one sine period across ±.5s, amplitude .25s, at y = ys·s; crossed with a short slash
  const sine = (g, ys, crossed) => {
    g.curve((t) => [(t - 0.5) * S, ys * S + 0.25 * S * Math.sin(2 * Math.PI * t)]);
    if (crossed) g.line(0.15 * S, (ys + 0.15) * S, -0.15 * S, (ys - 0.15) * S);
  };
  // \pgfcirc@twoport@draw@narrowsine: from x = .125s, period .5s, amplitude .125s
  const narrow = (g, ys) => g.curve((t) => [(0.125 + 0.5 * t) * S, ys * S + 0.125 * S * Math.sin(2 * Math.PI * t)]);
  const split = (g) => g.line(-S, -S, S, S);
  const tune = (g, x1, y1, x2, y2) => g.arrow(x1, y1, x2, y2, AH[0], AH[1]);
  const vtune = (g) => tune(g, -0.7 * S, -0.5 * S, 0.7 * S, 0.8 * S); // (0.7 left, .5 down) → (.7 right, .8 up)
  // converter glyphs, centred at (cx, cy) × s
  const dc = (g, cx, cy) => g.line((cx - 0.25) * S, (cy + 0.125) * S, (cx + 0.25) * S, (cy + 0.125) * S)
    .line((cx - 0.25) * S, (cy - 0.125) * S, (cx + 0.25) * S, (cy - 0.125) * S);
  const ac = (g, cx, cy) => g.curve((t) => [(cx - 0.31 + 0.68 * t) * S, cy * S + 0.17 * S * Math.sin(2 * Math.PI * t)]);
  const tac = (g, cx, cy) => { for (const d of [0.15, 0, -0.15]) ac(g, cx, cy + d); };

  const B = (cat, key, name, tikz, draw, pins, keywords) =>
    P({ key: cat + ':' + key, name, cat, kind: 'bipole', tikz, w: W, pins: pins || {}, draw, keywords });

  // filters
  const filt = (key, name, tikz, waves, extra, kw) => B('filter', key, name, tikz, (g) => {
    box(g);
    for (const [ys, x] of waves) sine(g, ys, x);
    if (extra) extra(g);
  }, null, kw);
  filt('bandpass', 'Bandpass', 'bandpass', [[0.5, 1], [0, 0], [-0.5, 1]], null, 'filter band pass');
  filt('bandstop', 'Bandstop', 'bandstop', [[0.5, 0], [0, 1], [-0.5, 0]], null, 'filter band stop notch');
  filt('highpass', 'Highpass', 'highpass', [[0.5, 0], [0, 1], [-0.5, 1]], null, 'filter high pass');
  filt('lowpass', 'Lowpass', 'lowpass', [[0.5, 1], [0, 1], [-0.5, 0]], null, 'filter low pass');
  filt('allpass', 'Allpass', 'allpass', [[0.5, 0], [0, 0], [-0.5, 0]], null, 'filter all pass');
  filt('vallpass', 'Variable Allpass', 'vallpass', [[0.5, 0], [0, 0], [-0.5, 0]], vtune, 'filter all pass variable tunable');
  filt('highpass2', 'Highpass (two waves)', 'highpass2', [[0.25, 0], [-0.25, 1]], null, 'filter high pass simplified');
  filt('lowpass2', 'Lowpass (two waves)', 'lowpass2', [[0.25, 1], [-0.25, 0]], null, 'filter low pass simplified');

  // generators
  B('gen', 'bgenerator', 'Block Generator', 'bgenerator', (g) => { box(g); for (const y of [0.25, 0, -0.25]) narrow(g, y); }, null, 'generator block oscillator signal');
  B('gen', 'qgenerator', 'Crystal Generator', 'qgenerator', (g) => {
    box(g);
    for (const y of [0.45, 0.2, -0.05]) narrow(g, y);
    g.line(-0.7 * S, -0.4 * S, 0.7 * S, -0.4 * S).rect(-0.7 * S, -0.7 * S, 0.7 * S, -0.5 * S).line(-0.7 * S, -0.8 * S, 0.7 * S, -0.8 * S);
  }, null, 'generator crystal quartz oscillator');
  B('gen', 'cgenerator', 'Clock Generator', 'cgenerator', (g) => {
    box(g);
    const xs = [-0.7, -0.42, -0.42, -0.14, -0.14, 0.14, 0.14, 0.42, 0.42, 0.7], yv = [-1, -1, 1, 1, -1, -1, 1, 1, -1, -1];
    g.line(...xs.flatMap((x, i) => [x * S, yv[i] * 0.35 * S]));
  }, null, 'generator clock square wave');
  B('gen', 'ngenerator', 'Generic Generator', 'ngenerator', (g) => { box(g); sine(g, 0.5, false); }, null, 'generator generic signal sine');

  // signal & DSP
  const conv = (a, b) => (g) => { box(g); split(g); g.text(-0.45 * S, 0.45 * S, a, FS).text(0.45 * S, -0.45 * S, b, FS); };
  B('dsp', 'adc', 'A/D Converter', 'adc', conv('A', 'D'), null, 'adc analog digital converter');
  B('dsp', 'dac', 'D/A Converter', 'dac', conv('D', 'A'), null, 'dac digital analog converter');
  B('dsp', 'dsp', 'DSP', 'dsp', (g) => { box(g); g.text(0, 0, 'DSP', FS); }, null, 'dsp digital signal processor');
  B('dsp', 'fft', 'FFT', 'fft', (g) => { box(g); g.text(0, 0, 'FFT', FS); }, null, 'fft fourier transform');
  // amplifiers are not boxed: the triangle spans ±.5 × .98 cm, ±.55 × .98 cm
  const ampPins = (k) => ({ up: [0, k * S], down: [0, -k * S] });
  B('dsp', 'amp', 'Amplifier', 'amp', (g) => g.width(1).poly(-0.5 * W, 0.55 * W, 0.5 * W, 0, -0.5 * W, -0.55 * W), ampPins(0.55), 'amplifier amp gain triangle');
  B('dsp', 'iamp', 'Instrumentation amplifier', 'iamp', (g) => g.width(1).poly(-0.5 * W, 0.55 * W, 0.5 * W, 0.2 * W, 0.5 * W, -0.2 * W, -0.5 * W, -0.55 * W), ampPins(0.75), 'instrumentation amplifier iamp');
  B('dsp', 'vamp', 'VGA', 'vamp', (g) => {
    g.width(1).poly(-0.5 * W, 0.55 * W, 0.5 * W, 0, -0.5 * W, -0.55 * W);
    g.width(THIN); tune(g, -0.8 * W, -0.5 * W, 0.6 * W, 0.6 * W);
  }, ampPins(0.55), 'vga variable gain amplifier vamp');
  const pi = (g) => g.line(-0.4 * S, -0.4 * S, -0.4 * S, 0.4 * S).line(0.4 * S, -0.4 * S, 0.4 * S, 0.4 * S).line(-0.6 * S, 0.4 * S, 0.6 * S, 0.4 * S);
  const tt = (g) => g.line(0, -0.4 * S, 0, 0.4 * S).line(-0.6 * S, 0.4 * S, 0.6 * S, 0.4 * S);
  B('dsp', 'piatt', 'PI attenuator', 'piattenuator', (g) => { box(g); pi(g); }, null, 'pi attenuator');
  B('dsp', 'vpiatt', 'Var. PI attenuator', 'vpiattenuator', (g) => { box(g); pi(g); vtune(g); }, null, 'pi attenuator variable');
  B('dsp', 'tatt', 'T attenuator', 'tattenuator', (g) => { box(g); tt(g); }, null, 't attenuator');
  B('dsp', 'vtatt', 'Var. T attenuator', 'vtattenuator', (g) => { box(g); tt(g); vtune(g); }, null, 't attenuator variable');
  B('dsp', 'phase', 'Phase shifter', 'phaseshifter', (g) => { box(g); g.text(0, 0, 'φ', 0.5, { italic: true }); }, null, 'phase shifter phi');
  B('dsp', 'vphase', 'Var. phase shifter', 'vphaseshifter', (g) => {
    box(g); tune(g, -0.75 * S, -0.65 * S, 0.7 * S, 0.65 * S); g.text(0, 0, 'φ', 0.5, { italic: true });
  }, null, 'phase shifter variable phi');
  B('dsp', 'biast', 'BIAS-T circuit as block', 'biast', (g) => {
    box(g);
    const s = S;
    g.line(-0.8 * s, -0.5 * s, -0.5 * s, -0.5 * s).line(-0.5 * s, -0.2 * s, -0.5 * s, -0.8 * s).line(-0.3 * s, -0.2 * s, -0.3 * s, -0.8 * s)
      .line(-0.3 * s, -0.5 * s, 0.8 * s, -0.5 * s).line(0, -0.5 * s, 0, -0.2 * s);
    g.circle(0, -0.5 * s, 0.075 * s).ink();
    for (const y0 of [-0.2, -0.02, 0.16, 0.36]) g.arc(0, (y0 + 0.09) * s, 0.09 * s, 0.09 * s, -90, 90);
    g.line(0, 0.52 * s, 0, 0.8 * s);
  }, null, 'bias tee biast');
  B('dsp', 'sinetable', 'Sine lookup table', 'sinetable', (g) => {
    box(g); sine(g, 0, false);
    tune(g, -0.7 * S, -0.7 * S, 0.7 * S, -0.7 * S); tune(g, -0.7 * S, -0.7 * S, -0.7 * S, 0.7 * S);
  }, null, 'sine lookup table lut');
  B('dsp', 'register', 'Register', 'register', (g) => { box(g); g.line(-S, 0.7 * S, -0.6 * S, 0.5 * S, -S, 0.3 * S); }, { clk: [-S, 0.5 * S] }, 'register clock latch');
  // detector: a thin axis plus the empty diode (bipoles/diode .4 × .5) scaled by 2up / Rlen / .8
  B('dsp', 'detector', 'Detector', 'detector', (g) => {
    box(g);
    g.width(0.4).line(-0.75 * S, 0, 0.75 * S, 0);
    const k = (2 * S) / RLEN / 0.8, dx = 0.2 * RLEN * k, dy = 0.25 * RLEN * k;
    g.width(0.8).poly(-dx, dy, dx, 0, -dx, -dy).line(dx, -dy, dx, dy);
  }, null, 'detector diode envelope');
  B('dsp', 'saturation', 'Saturation', 'saturation', (g) => {
    box(g); g.width(0.6).line(-0.65 * S, -0.4 * S, -0.4 * S, -0.4 * S, 0.4 * S, 0.4 * S, 0.65 * S, 0.4 * S);
  }, null, 'saturation limiter clipping');
  B('dsp', 'sigmoid', 'Sigmoid', 'sigmoid', (g) => {
    box(g); g.width(0.6);
    // two parabolas with their vertices at (∓.45s, ∓.4s), meeting at the origin
    g.line(-0.65 * S, -0.4 * S, -0.45 * S, -0.4 * S);
    g.curve((t) => [(-0.45 + 0.45 * t) * S, (-0.4 + 0.4 * t * t) * S], 16);
    g.line(0.65 * S, 0.4 * S, 0.45 * S, 0.4 * S);
    g.curve((t) => [(0.45 - 0.45 * t) * S, (0.4 - 0.4 * t * t) * S], 16);
  }, null, 'sigmoid activation');
  B('dsp', 'allornothing', 'Comparison (all-or-nothing)', 'allornothing', (g) => {
    box(g); g.width(0.6).line(-0.55 * S, -0.4 * S, 0, -0.4 * S, 0, 0.4 * S, 0.55 * S, 0.4 * S);
  }, null, 'comparison comparator all or nothing step');
  B('dsp', 'fiber', 'Optical fiber', 'fiber', (g) => {
    box(g);
    for (const x of [-0.2, 0, 0.2]) g.circle(x * S, 0.4 * S, 0.4 * S);
    g.line(-S, 0, S, 0);
  }, null, 'optical fiber fibre');
  B('dsp', 'twoport', 'Generic two port', 'twoport', (g) => box(g), null, 'two port block box generic');
  B('dsp', 'twoportsplit', 'Generic two port split', 'twoportsplit', (g) => { box(g); split(g); }, null, 'two port split block generic');

  // power converters (anchors at ±.4 × half side; three-phase AC at 0, ±.6)
  const io = (inK, outK, three) => {
    const p = {};
    const side = (x, k, dir, tri) => {
      if (tri) { p[k + ' up ' + dir] = [x, 0.6 * S]; p[k + ' mid ' + dir] = [x, 0]; p[k + ' down ' + dir] = [x, -0.6 * S]; }
      else { p[k + ' up ' + dir] = [x, 0.4 * S]; p[k + ' down ' + dir] = [x, -0.4 * S]; }
    };
    side(-S, inK, 'in', three && inK === 'ac');
    side(S, outK, 'out', three && outK === 'ac');
    return p;
  };
  const C = (key, name, tikz, up, down, pins, kw) => B('power', key, name, tikz, (g) => { box(g); split(g); up(g); down(g); }, pins, kw);
  const dcU = (g) => dc(g, -0.5, 0.5), dcD = (g) => dc(g, 0.5, -0.5);
  const acU = (g) => ac(g, -0.45, 0.5), acD = (g) => ac(g, 0.45, -0.5);
  const tacU = (g) => tac(g, -0.45, 0.5), tacD = (g) => tac(g, 0.45, -0.5);
  C('dcdc', 'DC/DC converter', 'sdcdc', dcU, dcD, io('dc', 'dc'), 'dc dc converter power');
  C('acdc', 'AC/DC converter', 'sacdc', acU, dcD, io('ac', 'dc'), 'ac dc converter rectifier power');
  C('dcac', 'DC/AC converter', 'sdcac', dcU, acD, io('dc', 'ac'), 'dc ac converter inverter power');
  C('acac', 'AC/AC converter', 'sacac', acU, acD, io('ac', 'ac'), 'ac ac converter power');
  C('tacdc', '3ph AC/DC converter', 'tacdc', tacU, dcD, io('ac', 'dc', true), 'three phase ac dc converter rectifier power');
  C('tdcac', '3ph DC/AC converter', 'tdcac', dcU, tacD, io('dc', 'ac', true), 'three phase dc ac converter inverter power');
  C('tacac', '3ph AC/AC converter', 'tacac', tacU, tacD, io('ac', 'ac', true), 'three phase ac ac converter power');
})();
