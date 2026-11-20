import { runtime as TD } from '../runtime';
// circuitikz parts: resistors, capacitors, inductors/transformers, mechanics, audio, grounds & supplies.
// Geometry follows pgfcircbipoles/monopoles/quadpoles.tex (default, non-cute unless named). See czcore.ts.
(function () {
  const P = TD.CZ.part;
  const RLEN = 1.4; // bipoles/length (cm)
  const PT = 2.54 / 72.27; // 1 TeX pt in cm
  const THIN = 0.5; // wire width (0.4pt) relative to the component width (bipoles/thickness 2 → 0.8pt)

  // ---------- helpers ----------
  // circuitikz `latexslim` arrowhead, tip at (x,y) pointing along (dx,dy); k = line width factor
  function lhead(g: any, x: any, y: any, dx: any, dy: any, k: any) {
    const t = (0.28 + 0.24 * k) * PT, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const p = (u: any, v: any) => [x + (u - 6) * t * ux - v * t * uy, y + (u - 6) * t * uy + v * t * ux];
    const c = (a: any, b: any, e: any) => { const q = [...p(...(a as [any, any])), ...p(...(b as [any, any])), ...p(...(e as [any, any]))]; g.C(...q); };
    g.M(...p(6, 0));
    c([3.5, 0.5], [-1, 1.5], [-4, 3.75]);
    c([-1.5, 1], [-1.5, -1], [-4, -3.75]);
    c([-1, -1.5], [3.5, -0.5], [6, 0]);
    return g.Z().ink();
  }
  // a line with a latexslim tip at its end, drawn with width factor k
  function arrow(g: any, x1: any, y1: any, x2: any, y2: any, k = 1) {
    const l = Math.hypot(x2 - x1, y2 - y1), s = (5 * (0.28 + 0.24 * k) * PT) / l;
    g.width(k).line(x1, y1, x2 - (x2 - x1) * s, y2 - (y2 - y1) * s);
    lhead(g, x2, y2, x2 - x1, y2 - y1, k);
    return g.width(1);
  }
  // polyline with arced corners (pgf \pgfsetcornersarced), inset r clamped to half the segments
  function rounded(g: any, pts: any, r: any) {
    g.M(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
      const d1 = Math.min(r, l1 / 2), d2 = Math.min(r, l2 / 2);
      g.L(bx - ((bx - ax) * d1) / l1, by - ((by - ay) * d1) / l1);
      g.Q(bx, by, bx + ((cx - bx) * d2) / l2, by + ((cy - by) * d2) / l2);
    }
    const e = pts[pts.length - 1];
    return g.L(e[0], e[1]);
  }
  // american zigzag (resistors/zigs = 3) from -hw to hw, amplitude a
  function zigzag(g: any, hw: any, a: any) {
    const st = (2 * hw) / 12, p = [-hw, 0];
    let x = -hw + st, s = 1;
    p.push(x, a);
    for (let i = 0; i < 5; i++) { x += 2 * st; s = -s; p.push(x, s * a); }
    p.push(hw, 0);
    return g.line(...p);
  }
  // cute inductor coil (5 coils, aspect .5), length 2·hw from x0 along the path; up/down are the big/small
  // loop heights. rot: 0 (along +x), -90 (path pointing down), 90 (path pointing up); (ox,oy) = centre
  function coil(g: any, hw: any, up: any, dn: any, rot = 0, ox = 0, oy = 0) {
    const n = 5, other = (0.5 * 0.5 * 2 * hw) / (n - 1), step = (2 * hw + (n - 1) * 2 * other) / n / 2;
    const A = (lcx: any, rx: any, ry: any, a1: any, a2: any, cont: any) => {
      if (rot === 0) g.arc(ox + lcx, oy, rx, ry, a1, a2, cont);
      else if (rot === -90) g.arc(ox, oy - lcx, ry, rx, a1 - 90, a2 - 90, cont);
      else g.arc(ox, oy + lcx, ry, rx, a1 + 90, a2 + 90, cont);
    };
    let x = -hw;
    for (let i = 0; i < n; i++) {
      A(x + step, step, up, 180, 0, i > 0); x += 2 * step;
      if (i < n - 1) { A(x - other, other, dn, 0, -180, true); x -= 2 * other; }
    }
    return g;
  }
  const bip = (key: any, name: any, cat: any, tikz: any, w: any, draw: any, extra: any) => P(Object.assign({ key, name, cat, kind: 'bipole', tikz, w: Math.round(w * 1e4) / 1e4, draw }, extra));
  const node = (key: any, name: any, cat: any, tikz: any, pins: any, draw: any, extra: any) => P(Object.assign({ key, name, cat, kind: 'node', tikz, pins, draw }, extra));

  // ---------- resistors ----------
  const RW = 0.8 * RLEN, RH = RW / 2; // standard resistor body 1.12 cm, half 0.56
  const GU = (0.3 * RLEN) / 2; // generic box half-height 0.21
  const box = (g: any, u = GU) => g.rect(-RH, -u, RH, u);
  const TU = (0.428 * RLEN) / 2, TM = 0.7 * TU; // thermistor/varistor: res@up and box half-height

  bip('res:iec', 'Resistor (IEC)', 'res', 'european resistor', RW, (g: any) => box(g), { keywords: 'IEC european box generic R' });
  bip('res:us', 'American Resistor', 'res', 'american resistor', RW, (g: any) => zigzag(g, RH, GU), { keywords: 'zigzag ANSI R' });
  bip('res:mem', 'Memristor', 'res', 'memristor', RW, (g: any) => {
    box(g);
    const h = 0.5 * GU;
    g.width(THIN).line(-RH, 0, -0.72 * RH, 0, -0.72 * RH, h, -0.35 * RH, h, -0.35 * RH, -h, 0.05 * RH, -h, 0.05 * RH, h, 0.42 * RH, h, 0.42 * RH, 0, 0.8 * RH, 0).width(1);
    g.rect(0.7 * RH, -GU, RH, GU).ink();
  }, { keywords: 'memory Mr' });
  bip('res:xgen', 'Crossed Generic', 'res', 'xgeneric', RW, (g: any) => { box(g); g.line(-RH, GU, RH, -GU).line(RH, GU, -RH, -GU); }, { keywords: 'cross box' });
  bip('res:sgen', 'Slashed Generic', 'res', 'sgeneric', RW, (g: any) => { box(g); g.line(RH, GU, -RH, -GU); }, { keywords: 'slash box' });
  bip('res:agen', 'Asymmetric Generic', 'res', 'ageneric', RW, (g: any) => { box(g); g.rect(0.7 * RH, -GU, RH, GU).ink(); }, { keywords: 'asymmetric box' });
  bip('res:var', 'Varistor', 'res', 'varistor', RW, (g: any) => {
    box(g, TM);
    g.line(RH, TU, -0.4 * RH, -TU, -RH, -TU);
    g.text(-0.65 * RH, -1.2 * TU - 0.09, 'U', 0.18);
  }, { keywords: 'VDR voltage dependent' });
  const thermo = (ntc: any) => (g: any) => {
    const dn = (0.75 * RLEN) / 2;
    box(g, TM);
    g.line(RH, TU, -0.4 * RH, -TU, -RH, -TU);
    arrow(g, -0.62 * RH, -dn, -0.62 * RH, -0.7 * dn, THIN);
    if (ntc) arrow(g, -0.45 * RH, -0.7 * dn, -0.45 * RH, -dn, THIN);
    else arrow(g, -0.45 * RH, -dn, -0.45 * RH, -0.7 * dn, THIN);
    g.text(-0.85 * RH, -0.75 * dn - 0.08, 'ϑ', 0.18, { italic: true });
  };
  bip('res:ptc', 'PTC Thermistor', 'res', 'thermistor ptc', RW, thermo(false), { keywords: 'thermistor temperature thRp' });
  bip('res:ntc', 'NTC Thermistor', 'res', 'thermistor ntc', RW, thermo(true), { keywords: 'thermistor temperature thRn' });
  // light dependent resistors: circle r = height/2, inner symbol scaled by .8, opto arrows
  const ldr = (inner: any) => (g: any) => {
    const R = (0.8 * RLEN) / 2, s = 0.8;
    g.circle(0, 0, R);
    arrow(g, 1.4 * R, 1.4 * R, 0.8 * R, 0.8 * R);
    arrow(g, 1.6 * R, 1.2 * R, 1.0 * R, 0.6 * R);
    g.line(-R, 0, -s * R, 0).line(s * R, 0, R, 0);
    if (inner) zigzag(g, s * R, s * 0.4 * R); else g.rect(-s * R, -s * GU, s * R, s * GU);
  };
  bip('res:ldr-us', 'LDR (American)', 'res', 'american light dependent resistor', RW, ldr(true), { keywords: 'light dependent photo ldR' });
  bip('res:ldr-iec', 'LDR (European)', 'res', 'european light dependent resistor', RW, ldr(false), { keywords: 'light dependent photo ldR IEC' });
  bip('res:var-us', 'Variable Resistor (American)', 'res', 'variable american resistor', RW, (g: any) => {
    const u = (0.6 * RLEN) / 2;
    zigzag(g, RH, 0.5 * u);
    arrow(g, -0.4 * RH, -u, 0.4 * RH, u);
  }, { keywords: 'variable tunable rheostat vR' });
  bip('res:var-iec', 'Variable Resistor (European)', 'res', 'variable european resistor', RW, (g: any) => {
    const u = (0.7 * RLEN) / 2;
    box(g, 0.4 * u);
    arrow(g, -0.5 * RH, -u, 0.5 * RH, u);
  }, { keywords: 'variable tunable rheostat vR IEC' });
  bip('res:sens-us', 'Resistive Sensor (American)', 'res', 'american resistive sensor', RW, (g: any) => {
    const u = (0.6 * RLEN) / 2;
    zigzag(g, RH, 0.5 * u);
    g.line(0.4 * RH, u, -0.4 * RH, -u, -0.9 * RH, -u);
  }, { keywords: 'sensor sR' });
  bip('res:sens-iec', 'Resistive Sensor (European)', 'res', 'european resistive sensor', RW, (g: any) => {
    box(g, TM);
    g.line(RH, TU, -0.4 * RH, -1.2 * TU, -RH, -1.2 * TU);
  }, { keywords: 'sensor thermistor sR IEC' });
  const PU = (0.8 * RLEN) / 2; // potentiometer res@up (wiper)
  bip('res:pot-iec', 'Potentiometer (IEC)', 'res', 'european potentiometer', RW, (g: any) => {
    box(g);
    arrow(g, 0, PU, 0, GU, THIN);
  }, { pins: { wiper: [0, PU] }, keywords: 'potentiometer wiper trimmer pR IEC' });
  bip('res:pot-us', 'Potentiometer (American)', 'res', 'american potentiometer', RW, (g: any) => {
    zigzag(g, RH, GU);
    arrow(g, 0, PU, 0, GU);
  }, { pins: { wiper: [0, PU] }, keywords: 'potentiometer wiper trimmer pR' });
  bip('res:photo', 'Photoresistor', 'res', 'photoresistor', RW, (g: any) => {
    const u = (0.6 * RLEN) / 2, d = (0.3 * RLEN) / 2;
    box(g, d);
    arrow(g, 0.7 * RH, u, 0.3 * RH, 1.2 * d, THIN);
    arrow(g, 0.45 * RH, u, 0.05 * RH, 1.2 * d, THIN);
  }, { keywords: 'light photo phR' });
  bip('res:mov', 'Metal-Oxide Varistor', 'res', 'mov', RW, (g: any) => {
    box(g, TM);
    g.line(RH, 1.1 * TU, 0.7 * RH, 1.1 * TU, -0.7 * RH, -1.1 * TU, -RH, -1.1 * TU);
  }, { keywords: 'MOV varistor surge' });

  // ---------- capacitors ----------
  const CW = 0.2 * RLEN, CR = CW / 2, CU = (0.6 * RLEN) / 2; // plates at ±0.14, half-height 0.42
  const plates = (g: any, u = CU) => g.line(-CR, u, -CR, -u).line(CR, u, CR, -u);
  bip('cap:iec', 'Capacitor (IEC)', 'cap', 'capacitor', CW, (g: any) => plates(g), { keywords: 'C plates' });
  bip('cap:var', 'Variable Capacitor', 'cap', 'variable capacitor', CW, (g: any) => {
    plates(g);
    arrow(g, -3 * CR, -CU, 3 * CR, CU);
  }, { keywords: 'tunable trimmer vC' });
  bip('cap:pol', 'Polarised Capacitor', 'cap', 'curved capacitor', CW, (g: any) => {
    g.line(-CR, CU, -CR, -CU);
    g.curve((t: any) => { const y = CU - 2 * CU * t; return [CR - 1.1 * CR * Math.cos((Math.PI * y) / (2 * CU)), y]; }, 24);
    g.width(THIN).line(CR - 1.1 * CR, 0, CR, 0).width(1);
  }, { keywords: 'polar curved cC' });
  bip('cap:sens', 'Capacitive Sensor', 'cap', 'capacitive sensor', CW, (g: any) => {
    plates(g);
    g.line(2.6 * CR, CU, -2.6 * CR, -1.2 * CU, -4.4 * CR, -1.2 * CU);
  }, { keywords: 'sensor sC' });
  bip('cap:elec', 'Electrolytic Capacitor', 'cap', 'ecapacitor', CW, (g: any) => {
    const u = (0.5 * RLEN) / 2;
    g.rect(-CR, -u, -0.4 * CR, u);
    g.rect(0.4 * CR, -u, CR, u).ink();
    g.text(-1.2 * CR - 0.07, 0.6 * u, '+', 0.21, { bold: true });
  }, { keywords: 'electrolytic polarised polarized elko eC' });
  bip('cap:cpe', 'Constant Phase Element', 'cap', 'cpe', 0.4 * RLEN, (g: any) => {
    const r = 0.2 * RLEN;
    g.width(THIN).line(-r, 0, 0, 0).width(1);
    g.line(-r, CU, 0, 0, -r, -CU).line(0, CU, r, 0, 0, -CU);
  }, { keywords: 'CPE fractional impedance' });
  bip('cap:ferro', 'Ferroelectric Capacitor', 'cap', 'ferrocap', CW, (g: any) => {
    plates(g);
    rounded(g, [[-1.8 * CR, CU], [-1.8 * CR, 0.5 * CU], [1.8 * CR, -0.5 * CU], [1.8 * CR, -CU]], 0.2 * CU);
  }, { keywords: 'ferroelectric feC FeRAM' });

  // ---------- inductors & transformers ----------
  const LW = 0.6 * RLEN, LH = LW / 2, LU = (0.3 * RLEN) / 2, LD = (0.15 * RLEN) / 2;
  bip('ind:L', 'Inductor', 'ind', 'cute inductor', LW, (g: any) => coil(g, LH, LU, LD), { keywords: 'coil cute L' });
  bip('ind:choke', 'Choke', 'ind', 'cute choke', LW, (g: any) => {
    coil(g, LH, LU, LD);
    g.line(-LH, 1.3 * LU, LH, 1.3 * LU);
  }, { keywords: 'choke core coil' });
  bip('ind:var', 'Variable Inductor', 'ind', 'variable cute inductor', LW, (g: any) => {
    const u = (0.6 * RLEN) / 2, d = (0.3 * RLEN) / 2;
    arrow(g, -0.4 * LH, -d, 0.4 * LH, u);
    coil(g, LH, 0.5 * u, 0.5 * d);
  }, { keywords: 'variable tunable coil vL' });
  // quadpoles: corners at ±0.75·Rlen, coils at ±inner(.4)·0.75·Rlen
  const QX = 0.75 * RLEN, QI = 0.4 * QX;
  const QP = { A1: [-QX, QX], A2: [-QX, -QX], B1: [QX, QX], B2: [QX, -QX] };
  const trafo = (g: any) => {
    coil(g, LH, LU, LD, -90, -QI, 0);
    coil(g, LH, LU, LD, 90, QI, 0);
    g.width(THIN).line(-QX, QX, -QI, QX, -QI, LH).line(-QI, -LH, -QI, -QX, -QX, -QX)
      .line(QX, QX, QI, QX, QI, LH).line(QI, -LH, QI, -QX, QX, -QX).width(1);
  };
  node('ind:trafo', 'Transformer', 'ind', 'transformer', QP, trafo, { keywords: 'transformer coupled inductors' });
  node('ind:trafo-core', 'Transformer core', 'ind', 'transformer core', QP, (g: any) => {
    trafo(g);
    const c = 2.5 * 0.4 * 0.05 * QX, h = 0.5 * QX;
    g.line(c, -h, c, h).line(-c, -h, -c, h);
  }, { keywords: 'transformer iron core' });
  node('ind:gyrator', 'Gyrator', 'ind', 'gyrator', QP, (g: any) => {
    g.width(THIN).line(-QX, QX, -QI, QX, -QI, -QX, -QX, -QX).line(QX, QX, QI, QX, QI, -QX, QX, -QX).width(1);
    const r = Math.min(0.7 * 0.4 * QX, 0.8 * QX);
    g.arc(-QI, 0, r, r, -90, 90).Z();
    g.arc(QI, 0, r, r, 90, 270).Z();
  }, { keywords: 'gyrator two-port' });

  // ---------- mechanics ----------
  const DU = (0.35 * RLEN) / 2, DR = (0.4 * RLEN) / 2, DL = 0.3 * DR; // damper half-height, half-width, piston x
  const damperBox = (g: any) => { g.line(-DR, -DU, DR, -DU, DR, DU, -DR, DU); g.line(DL, -0.8 * DU, DL, 0.8 * DU); };
  bip('mech:damper', 'Damper', 'mech', 'damper', 0.4 * RLEN, (g: any) => {
    g.width(THIN).line(-DR, 0, DL, 0).width(1);
    damperBox(g);
  }, { keywords: 'damper dashpot friction' });
  bip('mech:spring', 'Spring', 'mech', 'spring', 0.5 * RLEN, (g: any) => {
    const h = (0.5 * RLEN) / 2, st = (0.5 * RLEN) / 16, p = [[-h, 0]];
    let x = -h + st;
    for (let i = 0; i < 8; i++) { p.push([x, i % 2 ? -h : h]); x += 2 * st; }
    p.push([h, 0]);
    rounded(g, p, 0.5 * h);
  }, { keywords: 'spring stiffness' });
  bip('mech:inerter', 'Inerter', 'mech', 'inerter', 0.175 * RLEN, (g: any) => {
    const r = (0.175 * RLEN) / 2, u = (0.7 * RLEN) / 2;
    g.rect(-r, -u, r, u);
  }, { keywords: 'inerter' });
  bip('mech:viscoe', 'Viscoelastic Element', 'mech', 'viscoe', 0.4 * RLEN, (g: any) => {
    const a = 0.75 * DU;
    rounded(g, [[-DR, 0], [-0.95 * DR, 0], [-0.75 * DR, a], [-0.5 * DR, -a], [-0.25 * DR, a], [0, -a], [DL, a]], 0.25 * DU);
    damperBox(g);
  }, { keywords: 'viscoelastic spring damper' });
  bip('mech:mass', 'Mass', 'mech', 'mass', 0.5 * RLEN, (g: any) => {
    const r = (0.5 * RLEN) / 2, u = (0.55 * RLEN) / 2, d = (0.4 * RLEN) / 2;
    g.rect(-r, -d, -r + 2 * d, d);
    g.line(r, -d, r, u, -r, u);
  }, { keywords: 'mass inertia' });

  // ---------- audio ----------
  bip('audio:speaker', 'Speaker', 'audio', 'loudspeaker', 0.8 * RLEN, (g: any) => {
    const r = (0.8 * RLEN) / 2, u = (0.8 * RLEN) / 2, d = (0.3 * RLEN) / 2;
    g.rect(-r, -d, r, 0.4 * u);
    g.poly(-0.5 * r, 0.4 * u, -0.8 * r, u, 0.8 * r, u, 0.5 * r, 0.4 * u);
  }, { keywords: 'loudspeaker sound' });
  bip('audio:mic', 'Microphone', 'audio', 'mic', 0.8 * RLEN, (g: any) => {
    const r = (0.8 * RLEN) / 2, u = (1.2 * RLEN) / 2;
    g.circle(0, 0.6 * u, 0.4 * u);
    g.line(-0.4 * u, u, 0.4 * u, u);
    g.width(THIN).line(-r, 0, -0.2 * u, 0, -0.2 * u, 0.25358 * u).line(0.2 * u, 0.25358 * u, 0.2 * u, 0, r, 0).width(1);
  }, { keywords: 'microphone sound' });
  const BR = (0.4 * RLEN) / 2, BU = (0.6 * RLEN) / 2, BS = 0.6; // buzzer half-width, height, pin span
  bip('audio:buzzer', 'Buzzer', 'audio', 'buzzer', 0.4 * RLEN, (g: any) => {
    const o = BU - BR;
    g.M(-BR, o).L(BR, o).arc(0, o, BR, BR, 0, 180, true).Z();
    g.width(THIN).line(-BS * BR, o, -BS * BR, 0, -BR, 0).line(BS * BR, o, BS * BR, 0, BR, 0).width(1);
  }, { keywords: 'buzzer beeper sound' });
  bip('audio:rbuzzer', 'Buzzer (reversed)', 'audio', 'rbuzzer', 0.4 * RLEN, (g: any) => {
    const t = BU - BR * Math.sqrt(1 - BS * BS);
    g.M(-BR, BU).L(BR, BU).arc(0, BU, BR, BR, 0, -180, true).Z();
    g.width(THIN).line(-BS * BR, t, -BS * BR, 0, -BR, 0).line(BS * BR, t, BS * BR, 0, BR, 0).width(1);
  }, { keywords: 'reversed buzzer beeper sound' });
  node('audio:waves', 'Waves', 'audio', 'waves', { left: [-0.7, 0], right: [0.7, 0] }, (g: any) => {
    const s = (0.5 * RLEN) / 2, cx = -2 * s, th = (Math.atan2(2 * s, 4.1 * s) * 180) / Math.PI;
    g.width(THIN);
    for (let k = 8; k > 1; k--) g.arc(cx, 0, k * 0.5 * s, k * 0.5 * s, -th, th);
    g.width(1);
  }, { keywords: 'waves sound radio emission' });

  // ---------- grounds & supplies ----------
  const GS = 0.25 * RLEN; // monopoles/ground/width · Rlen
  const G0 = { center: [0, 0] };
  const stem = (g: any, y: any) => g.width(THIN).line(0, 0, 0, y).width(1);
  const bars = (g: any, y: any) => g.line(-0.6 * GS, y, 0.6 * GS, y).line(-0.4 * GS, y - 0.2 * GS, 0.4 * GS, y - 0.2 * GS).line(-0.25 * GS, y - 0.4 * GS, 0.25 * GS, y - 0.4 * GS);
  node('ground:gnd', 'Ground', 'ground', 'ground', G0, (g: any) => { stem(g, -1.2 * GS); bars(g, -1.2 * GS); }, { keywords: 'ground earth GND' });
  node('ground:noiseless', 'Noiseless Ground', 'ground', 'nground', G0, (g: any) => {
    stem(g, -1.2 * GS); bars(g, -1.2 * GS);
    g.arc(0, -1.6 * GS, 0.9 * GS, 0.9 * GS, 0, 180);
  }, { keywords: 'noiseless clean ground' });
  node('ground:protective', 'Protective Ground', 'ground', 'pground', G0, (g: any) => {
    g.circle(0, -0.9 * GS, 0.9 * GS);
    stem(g, -GS); bars(g, -GS);
  }, { keywords: 'protective earth PE ground' });
  node('ground:chassis', 'Chassis Ground', 'ground', 'cground', G0, (g: any) => {
    stem(g, -1.5 * GS);
    g.line(-GS, -2.1 * GS, -0.75 * GS, -1.5 * GS, 0.75 * GS, -1.5 * GS, 0.5 * GS, -2.1 * GS).line(0, -1.5 * GS, -0.25 * GS, -2.1 * GS);
  }, { keywords: 'chassis frame ground' });
  node('ground:signal', 'Signal Ground', 'ground', 'sground', G0, (g: any) => {
    stem(g, -GS);
    g.poly(-0.6 * GS, -GS, 0.6 * GS, -GS, 0, -1.8 * GS);
  }, { keywords: 'signal ground triangle' });
  const eground = (xs: any) => (g: any) => {
    stem(g, -GS);
    g.width(1.5).line(-GS, -GS, GS, -GS).width(THIN);
    for (const [a, b] of xs) g.line(a * GS, -1.7 * GS, b * GS, -GS);
    g.width(1);
  };
  node('ground:eu', 'European Ground', 'ground', 'eground', G0, eground([[-1.1, -0.6], [-0.6, -0.1], [-0.1, 0.4], [0.4, 0.9]]), { keywords: 'european ground hatched' });
  node('ground:eu2', 'European Ground (v2)', 'ground', 'eground2', G0, eground([[-1.1, -0.4], [-0.45, 0.25], [0.2, 0.9]]), { keywords: 'european ground hatched' });
  const VS = 0.2 * RLEN; // monopoles/vcc/width · Rlen
  node('ground:vcc', 'VCC/VDD', 'ground', 'vcc', G0, (g: any) => {
    g.line(-0.5 * VS, 0.8 * VS, 0, 1.5 * VS, 0.5 * VS, 0.8 * VS);
    stem(g, 1.5 * VS);
  }, { keywords: 'vcc vdd supply rail positive' });
  node('ground:vee', 'VEE/VSS', 'ground', 'vee', G0, (g: any) => {
    g.line(-0.5 * VS, -0.8 * VS, 0, -1.5 * VS, 0.5 * VS, -0.8 * VS);
    stem(g, -1.5 * VS);
  }, { keywords: 'vee vss supply rail negative' });
})();
