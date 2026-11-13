import { runtime as TDRegistry } from '../runtime';
// circuitikz parts: diodes, thyristors, transistors and op-amps. See czcore.ts for units and the drawing API.
// Geometry follows pgfcircbipoles.tex / pgfcirctripoles.tex with default (legacy) settings.
(function () {
  const P = TDRegistry.CZ.part;
  const R = 1.4; // bipoles/length (cm)
  const THIN = 0.5; // circuitikz draws leads/gate wires at the plain line width (half the component width)
  const LW = 0.4 * 2.54 / 72.27; // 0.4pt in cm: the plain TikZ line width

  // ---------- arrows ----------
  // circuitikz `trarrow` (filled transistor arrow) centred at (x,y) pointing along (dx,dy)
  function trarrow(g: any, x: any, y: any, dx: any, dy: any) {
    const W = R / 16, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    const t = (a: any, b: any) => [x + a * ux - b * uy, y + a * uy + b * ux];
    const back = -0.7 * W - 0.5 * LW, half = 0.8 * W + 0.7593 * LW, tip = W + 1.743 * LW;
    g.width(0.05).poly(...t(back, half), ...t(tip, 0), ...t(back, -half)).ink();
  }
  // trarrow at time s of the segment (x1,y1)→(x2,y2), pointing along it
  const trarrowAt = (g: any, x1: any, y1: any, x2: any, y2: any, s: any) => trarrow(g, x1 + s * (x2 - x1), y1 + s * (y2 - y1), x2 - x1, y2 - y1);
  // thin line ending in a `latexslim` tip at (x2,y2) (opto arrows)
  function slim(g: any, x1: any, y1: any, x2: any, y2: any) {
    const t = 0.28 / 72.27 * 2.54 + 0.3 * LW, l = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / l, uy = (y2 - y1) / l;
    const ox = x2 - 6 * t * ux, oy = y2 - 6 * t * uy;
    const p = (a: any, b: any) => [ox + t * (a * ux - b * uy), oy + t * (a * uy + b * ux)];
    g.width(THIN).line(x1, y1, ...p(-2, 0));
    g.width(0.05).M(...p(6, 0)).C(...p(3.5, 0.5), ...p(-1, 1.5), ...p(-4, 3.75))
      .C(...p(-1.5, 1), ...p(-1.5, -1), ...p(-4, -3.75)).C(...p(-1, -1.5), ...p(3.5, -0.5), ...p(6, 0)).Z().ink();
  }

  // ---------- diodes ----------
  const DW = 0.4 * R / 2, DH = 0.5 * R / 2; // diode body half-width 0.28, half-height 0.35
  // triangle with its base at x = xb (height ±h) and tip at (xt, 0)
  function tri(g: any, xb: any, xt: any, h: any, full: any) {
    g.width(1).poly(xb, h, xt, 0, xb, -h);
    if (full) g.ink();
  }
  const bar = (g: any, x: any, h: any) => g.width(1).line(x, -h, x, h);
  const basic = (g: any, full: any) => { tri(g, -DW, DW, DH, full); bar(g, DW, DH); };
  // Zener / Schottky / tunnel / ZZener cathode shapes (whisker variants of the bar)
  const zener = (g: any) => g.width(1).line(DW, -DH, DW, DH, 0.6 * DW, DH);
  const tunnel = (g: any) => g.width(1).line(0.6 * DW, -DH, DW, -DH, DW, DH, 0.6 * DW, DH);
  const schottky = (g: any) => g.width(1).line(0.6 * DW, -0.6 * DH, 0.6 * DW, -DH, DW, -DH, DW, DH, 1.4 * DW, DH, 1.4 * DW, 0.6 * DH);
  const zzener = (g: any) => g.width(1).line(1.8 * DW, -1.5 * DH, DW, -DH, DW, DH, 0.2 * DW, 1.5 * DH);
  // LED arrows leave the diode, photodiode arrows point to it
  const ledArrows = (g: any) => { slim(g, -0.4 * DW, DH, 0.6 * DW, 2 * DH); slim(g, 0.2 * DW, 0.8 * DH, 1.2 * DW, 1.8 * DH); };
  const pdArrows = (g: any) => { slim(g, 0.6 * DW, 2 * DH, -0.4 * DW, DH); slim(g, 1.2 * DW, 1.8 * DH, 0.2 * DW, 0.8 * DH); };
  const laserArrows = (g: any) => { slim(g, -0.4 * DW, 1.1 * DH, -0.4 * DW, 2.1 * DH); slim(g, 0.2 * DW, 1.1 * DH, 0.2 * DW, 2.1 * DH); };

  const D = (key: any, name: any, tikz: any, draw: any, keywords: any, w = 2 * DW) =>
    P({ key: 'diode:' + key, name, cat: 'diode', kind: 'bipole', tikz, w, keywords, draw });

  D('d', 'Diode', 'D*', (g: any) => basic(g, true), 'rectifier pn junction');
  D('zener', 'Zener Diode', 'zD*', (g: any) => { tri(g, -DW, DW, DH, true); zener(g); }, 'zener voltage reference');
  D('tunnel', 'Tunnel Diode', 'tD*', (g: any) => { tri(g, -DW, DW, DH, true); tunnel(g); }, 'esaki');
  D('photo', 'Photo Diode', 'pD*', (g: any) => { basic(g, true); pdArrows(g); }, 'photodiode light sensor optical');
  D('led', 'Light emitting diode (LED)', 'leD*', (g: any) => { basic(g, true); ledArrows(g); }, 'led light emitting');
  D('schottky', 'Schottky Diode', 'sD*', (g: any) => { tri(g, -DW, DW, DH, true); schottky(g); }, 'schottky barrier');
  // varcap: width .45, the triangle stops two (thick) line widths before the plate
  const VW = 0.45 * R / 2, VT = 2 * (2 * LW);
  D('varicap', 'Varicap Diode', 'VC*', (g: any) => { tri(g, -VW, VW - VT, DH, true); bar(g, VW - VT, DH); bar(g, VW, DH); },
    'varactor varcap variable capacitance', 2 * VW);
  // TVS: two half-width triangles meeting at the centre bar, double width (.8)
  D('tvs', 'Empty TVS Diode', 'tvsDo', (g: any) => {
    tri(g, -2 * DW, 0, DH, false); tri(g, 2 * DW, 0, DH, false);
    g.width(1).line(-0.4 * 2 * DW, 1.3 * DH, 0, DH, 0, -DH, 0.4 * 2 * DW, -1.3 * DH);
  }, 'transorb transient voltage suppressor', 4 * DW);
  D('laser', 'Empty Laser Diode', 'lasDo', (g: any) => { basic(g, false); bar(g, 0, DH); laserArrows(g); }, 'laser');
  D('zzener', 'Empty ZZener Diode', 'zzDo', (g: any) => { tri(g, -DW, DW, DH, false); zzener(g); }, 'zener zigzag');
  D('shockley', 'Empty Shockley Diode', 'shDo', (g: any) => {
    g.width(1).poly(-DW, -DH, -DW, DH, DW, 0, -DW, 0); bar(g, DW, DH);
  }, 'shockley four layer pnpn');

  // bidirectional diode / triac: two opposed triangles with their bars, total width 1.0, height 1.1
  function biDiodes(g: any, wl: any, wr: any, hw: any) {
    const o = -wl * hw, s = wr * hw, d = o - s; // other (left), step (right)
    g.width(1).line(o, 0, 0.95 * s, 0.707 * d, o, 1.414 * d, o, -1.414 * d);
    g.width(1).line(s, 0, 0.95 * o, -0.707 * d, s, -1.414 * d, s, 1.414 * d);
    g.width(THIN).line(o, 0, -hw, 0).line(s, 0, hw, 0);
    return { o, s, d };
  }
  D('bidir', 'Empty Bidirectional Diode', 'biDo', (g: any) => { biDiodes(g, 0.3, 0.3, 1 * R / 2); },
    'diac bidirectional trigger', 1 * R);
  const TRW = 1 * R / 2, TRH = 1.1 * R / 2; // triac half-width .7, half-height .77
  P({ key: 'diode:triac', name: 'Empty Triac', cat: 'diode', kind: 'bipole', tikz: 'Tro', w: 2 * TRW, keywords: 'triac ac switch',
    pins: { G: [TRW, TRH] },
    draw(g: any) { const { s, d } = biDiodes(g, 0.3, 0.3, TRW); g.width(THIN).line(s, -0.707 * d, TRW, -1.414 * d, TRW, TRH); } });

  // thyristor family (legacy style): width 1.0, height 1.1 up / .5 down, diode .4 left /.3 right of half-width
  const TW = 1.0 * R / 2, TU = 1.1 * R / 2, TD = 0.5 * R / 2, TO = -0.4 * TW, TS = 0.3 * TW;
  const KINK = 1.0, GH = 0.0, DHT = 0.5; // gate kink, gate height, diode height
  function thyBody(g: any) {
    tri(g, TO, TS, TD, false); bar(g, TS, TD);
    g.width(THIN).line(TO, 0, -TW, 0).line(TS, 0, TW, 0);
  }
  const gateK = (g: any) => g.width(THIN).line(TS, GH * DHT * TU, KINK * TW, DHT * TU, KINK * TW, TU);
  const gateA = (g: any) => g.width(THIN).line(TO, GH * DHT * TU, -KINK * TW, DHT * TU, -KINK * TW, TU);
  const gtoBar = (g: any, sgn: any) => g.width(THIN).line(sgn * (KINK - 0.2) * TW, (1 + DHT) * 0.5 * TU, sgn * (KINK + 0.2) * TW, (1 + DHT) * 0.5 * TU);
  const TH = (key: any, name: any, tikz: any, gx: any, extra: any, keywords: any) => P({ key: 'diode:' + key, name, cat: 'diode', kind: 'bipole', tikz, w: 2 * TW, keywords,
    pins: { G: [gx, TU] }, draw(g: any) { thyBody(g); extra(g); } });
  TH('thyristor', 'Empty Thyristor', 'Tyo', KINK * TW, gateK, 'thyristor scr silicon controlled rectifier');
  TH('put', 'Empty PUT', 'PUTo', -KINK * TW, gateA, 'programmable unijunction transistor anode gate');
  TH('gto', 'Empty GTO', 'GTOo', KINK * TW, (g: any) => {
    const up = 0.5, dn = 0.0; // gto space up / down
    g.width(THIN).line(KINK * TW, DHT * TU - dn * DHT * TU, KINK * TW, TU);
    g.line(TS, (GH - dn) * DHT * TU, KINK * TW, DHT * TU - dn * DHT * TU);
    g.line(KINK * TW, DHT * TU + up * DHT * TU, TS, (GH + up) * DHT * TU);
  }, 'gate turn off thyristor');
  TH('gtobar', 'Empty GTO Bar', 'GTObo', KINK * TW, (g: any) => { gateK(g); gtoBar(g, 1); }, 'gate turn off thyristor bar');
  TH('agtobar', 'Empty AGTO Bar', 'aGTObo', -KINK * TW, (g: any) => { gateA(g); gtoBar(g, -1); }, 'anode gate turn off thyristor bar');

  // ---------- transistors (nodes; origin = circuitikz `center`, C/D up for n-type) ----------
  const T = (key: any, name: any, tikz: any, pins: any, draw: any, keywords: any) => P({ key: 'trans:' + key, name, cat: 'trans', kind: 'node', tikz, pins, keywords, draw });
  const UP = 1.1 * R / 2; // all transistors: height 1.1 → terminals at y = ±0.77
  const thick = (g: any, x: any, y1: any, y2: any) => g.width(1).line(x, y1, x, y2);
  const wire = (g: any, ...p: any[]) => g.width(THIN).line(...p);

  // BJT (npn/pnp: width .6, base height .4, base height 2 .15, base width .5); n = +1 npn, -1 pnp
  function bjt(g: any, n: any) {
    const L = -0.6 * R, bx = 0.5 * L, bh = 0.4 * UP, bh2 = 0.15 * UP;
    wire(g, 0, UP, 0, bh, bx, bh2);
    thick(g, bx, bh, -bh);
    wire(g, bx, -bh2, 0, -bh, 0, -UP);
    if (n > 0) trarrowAt(g, bx, -bh2, 0, -bh, 0.5); else trarrowAt(g, 0, bh, bx, bh2, 0.5);
    wire(g, bx, 0, L, 0);
  }
  T('npn', 'NPN transistor', 'npn', { C: [0, UP], B: [-0.6 * R, 0], E: [0, -UP] }, (g: any) => bjt(g, 1), 'bjt bipolar');
  T('pnp', 'PNP transistor', 'pnp', { C: [0, -UP], B: [-0.6 * R, 0], E: [0, UP] }, (g: any) => bjt(g, -1), 'bjt bipolar');

  // IGBT (width .6, gate height .45/.15, base height .4, outer base height .4, gate width .62, base width .5)
  function igbt(g: any, n: any, conn: any) {
    const L = -0.6 * R, bx = 0.5 * L, gx = 0.62 * L, gh = 0.45 * UP, gh2 = 0.15 * UP, bh = 0.4 * UP;
    wire(g, 0, UP, 0, gh, bx, gh2);
    thick(g, gx, 0.4 * UP, -0.4 * UP);
    thick(g, bx, bh, -bh);
    wire(g, bx, -gh2, 0, -gh, 0, -UP);
    if (n > 0) trarrowAt(g, bx, -gh2, 0, -gh, 0.5); else trarrowAt(g, 0, gh, bx, gh2, 0.5);
    const gy = n > 0 ? -conn * UP : conn * UP;
    wire(g, gx, gy, L, gy);
  }
  const IG = (key: any, name: any, tikz: any, n: any, conn: any) => T(key, name, tikz,
    { C: [0, n * UP], G: [-0.6 * R, -n * conn * UP], E: [0, -n * UP] }, (g: any) => igbt(g, n, conn), 'igbt insulated gate bipolar');
  IG('nigbt', 'NIGBT transistor', 'nigbt', 1, 0);
  IG('pigbt', 'PIGBT transistor', 'pigbt', -1, 0);
  IG('lnigbt', 'LNIGBT transistor', 'Lnigbt', 1, 0.4);
  IG('lpigbt', 'LPIGBT transistor', 'Lpigbt', -1, 0.4);

  // MOS (width .7, gate height .35, base height .5, base width .5, gate width .62)
  const ML = -0.7 * R, MB = 0.5 * ML, MG = 0.62 * ML, MGH = 0.35 * UP, MBH = 0.5 * UP;
  function mos(g: any, p: any) {
    wire(g, 0, UP, 0, MGH, MB, MGH);
    wire(g, MB, -MGH, 0, -MGH, 0, -UP);
    thick(g, MB, MBH, -MBH);
    thick(g, MG, MGH, -MGH);
    wire(g, MG, 0, ML, 0);
    if (p) { const r = 0.04 * R; g.width(THIN).circle(MG - r, 0, r).ink(); }
  }
  const MOS = { D: [0, UP], G: [ML, 0], S: [0, -UP] }, PMOS = { D: [0, -UP], G: [ML, 0], S: [0, UP] };
  T('nmos', 'NMOS transistor', 'nmos', MOS, (g: any) => mos(g, false), 'mosfet field effect');
  T('pmos', 'PMOS transistor', 'pmos', PMOS, (g: any) => mos(g, true), 'mosfet field effect');

  // HEMT (base width .5; GaN hemt: base height .6, gate height .5, gate asym -.1, split gate, source arrow)
  function hemt(g: any, gan: any) {
    const gh = (gan ? 0.5 : 0.35) * UP, bh = (gan ? 0.6 : 0.5) * UP, a = gan ? -0.1 : 0;
    const y = (k: any) => (k + a) * UP + (2 - k - a) * -UP; // (k+asym)·up + (2-k-asym)·down
    wire(g, 0, UP, 0, gh, MB, gh);
    wire(g, MB, -gh, 0, -gh, 0, -UP);
    if (gan) {
      thick(g, MB, bh, y(1.1)); thick(g, MB, y(1.05), y(0.95)); thick(g, MB, y(0.9), -bh);
      trarrow(g, 0.5 * MB, -gh, 1, 0);
    } else thick(g, MB, bh, -bh);
    wire(g, MB, y(1), ML, y(1));
  }
  T('hemt', 'HEMT transistor', 'hemt', MOS, (g: any) => hemt(g, false), 'high electron mobility');
  T('ganhemt', 'GaN HEMT transistor', 'GaN hemt', { D: [0, UP], G: [ML, -0.2 * UP], S: [0, -UP] }, (g: any) => hemt(g, true),
    'gallium nitride high electron mobility');

  // FET core (nfet/pfet/nigfete/pigfete): broken (enhancement) channel, bulk line with arrow
  function fet(g: any, n: any, conn: any, srcTie: any) {
    wire(g, 0, UP, 0, MGH, MB, MGH);
    thick(g, MB, MBH, 0.45 * MBH); thick(g, MB, 0.25 * MBH, -0.25 * MBH); thick(g, MB, -0.45 * MBH, -MBH);
    wire(g, MB, 0, 0, 0);
    wire(g, MB, -MGH, 0, -MGH, 0, -UP);
    thick(g, MG, MGH, -MGH);
    trarrow(g, 0.6 * MB, 0, n > 0 ? -1 : 1, 0);
    const gy = n > 0 ? -conn * UP : conn * UP;
    wire(g, MG, gy, ML, gy);
    if (srcTie) wire(g, 0, 0, 0, n > 0 ? -UP : UP);
  }
  T('nfet', 'NFET transistor', 'nfet', { ...MOS, bulk: [0, 0] }, (g: any) => fet(g, 1, 0, false), 'mosfet enhancement');
  T('nigfet', 'NIGFET transistor', 'nigfete', { D: [0, UP], G: [ML, -0.35 * UP], S: [0, -UP] }, (g: any) => fet(g, 1, 0.35, true),
    'igfet insulated gate enhancement mosfet');
  T('pfet', 'PFET transistor', 'pfet', { ...PMOS, bulk: [0, 0] }, (g: any) => fet(g, -1, 0, false), 'mosfet enhancement');
  T('pigfet', 'PIGFET transistor', 'pigfete', { D: [0, -UP], G: [ML, 0.35 * UP], S: [0, UP] }, (g: any) => fet(g, -1, 0.35, true),
    'igfet insulated gate enhancement mosfet');

  // junction transistors (width .7, gate height .5/.35, gate width .5, conn height .35);
  // JFET: union height .35, conn kink 1; UJT: union height 0, conn kink .82
  function junction(g: any, n: any, ujt: any) {
    const gx = 0.5 * ML, gh2 = 0.35 * UP, conn = 0.35, union = ujt ? 0 : 0.35, kink = ujt ? 0.82 : 1;
    wire(g, 0, UP, 0, gh2, gx, gh2);
    wire(g, gx, -gh2, 0, -gh2, 0, -UP);
    thick(g, gx, 0.5 * UP, -0.5 * UP);
    let x1, y1, x2, y2, s;
    if (n > 0) { x1 = kink * ML; x2 = gx; y2 = -union * UP; y1 = -conn * UP; s = 0.6; }
    else { x1 = gx; x2 = kink * ML; y2 = conn * UP; y1 = union * UP; s = 0.4; }
    wire(g, x1, y1, x2, y2);
    if (n > 0) wire(g, x1, y1, ML, y1); else wire(g, x2, y2, ML, y2);
    trarrowAt(g, x1, y1, x2, y2, s);
  }
  T('njfet', 'NJFET transistor', 'njfet', { D: [0, UP], G: [ML, -0.35 * UP], S: [0, -UP] }, (g: any) => junction(g, 1, false), 'jfet junction field effect');
  T('pjfet', 'PJFET transistor', 'pjfet', { D: [0, -UP], G: [ML, 0.35 * UP], S: [0, UP] }, (g: any) => junction(g, -1, false), 'jfet junction field effect');
  T('nujt', 'NUJT transistor', 'nujt', { E: [ML, -0.35 * UP], B1: [0, UP], B2: [0, -UP] }, (g: any) => junction(g, 1, true), 'ujt unijunction');
  T('pujt', 'PUJT transistor', 'pujt', { E: [ML, 0.35 * UP], B1: [0, UP], B2: [0, -UP] }, (g: any) => junction(g, -1, true), 'ujt unijunction');

  // ISFET (width 1, gate height .35, base height .5, base width .3; three electrolyte waves)
  T('isfet', 'ISFET transistor', 'isfet', { D: [0, UP], S: [0, -UP] }, (g: any) => {
    const L = -1 * R, bx = 0.3 * L, gh = 0.35 * UP;
    wire(g, 0, UP, 0, gh, bx, gh);
    thick(g, bx, 0.5 * UP, -0.5 * UP);
    wire(g, bx, 0, 0, 0);
    wire(g, bx, -gh, 0, -gh);
    wire(g, 0, 0, 0, -UP);
    trarrow(g, 0.6 * bx, 0, -1, 0);
    const x0 = -0.8 * UP, ww = 0.16 * UP, A = 0.06 * UP;
    for (const y0 of [0.22 * UP, 0, -0.22 * UP])
      g.width(THIN).curve((t: any) => [x0 - t * 4 * ww, y0 - A * Math.sin(2 * Math.PI * t)], 32);
  }, 'ion sensitive fet chemical sensor');

  // graphene FET (width .6, gate height .5/.25, outer base height .25, gate width .5, base width .36084)
  function gfet(g: any, n: any) {
    const L = -0.6 * R, bx = 0.36084 * L, gx = 0.5 * L, gh = 0.5 * UP, gh2 = 0.25 * UP;
    wire(g, 0, UP, 0, gh).line(0, -gh, 0, -UP);
    g.width(THIN).poly(bx, gh2, 0, gh, -bx, gh2, -bx, -gh2, 0, -gh, bx, -gh2);
    thick(g, gx, 0.25 * UP, -0.25 * UP);
    thick(g, bx, 0.5 * UP, -0.5 * UP);
    if (n > 0) trarrowAt(g, bx, -gh2, 0, -gh, 0.5); else trarrowAt(g, 0, gh, bx, gh2, 0.5);
    wire(g, gx, 0, L, 0);
  }
  T('ngfet', 'NGFET transistor', 'ngfet', { D: [0, UP], G: [-0.6 * R, 0], S: [0, -UP] }, (g: any) => gfet(g, 1), 'graphene fet');
  T('pgfet', 'PGFET transistor', 'pgfet', { D: [0, -UP], G: [-0.6 * R, 0], S: [0, UP] }, (g: any) => gfet(g, -1), 'graphene fet');

  // ---------- op amps (width 1.7, port width .7, height 1.4, input height .5, up pos .45) ----------
  const OL = -1.7 * R / 2, OU = 1.4 * R / 2, OX = 0.7 * OL, OIH = 0.5 * OU;
  const OUPX = OX + 0.45 * (-2 * OX), OUPY = 0.55 * OU; // `up`: 45% along the upper edge from (OX,OU) to (-OX,0)
  function opamp(g: any) {
    g.width(1).poly(OX, OU, -OX, 0, OX, -OU);
    wire(g, OL, OIH, OX, OIH).line(OL, -OIH, OX, -OIH).line(-OL, 0, -OX, 0);
    const fs = 10 / 72.27 * 2.54; // 10pt bold
    g.text(OX + 0.04, OIH, '−', fs, { bold: true, anchor: 'w' }).text(OX + 0.04, -OIH, '+', fs, { bold: true, anchor: 'w' });
  }
  const OA = { '-': [OL, OIH], '+': [OL, -OIH], out: [-OL, 0] };
  P({ key: 'opamp:3', name: 'Op-amp', cat: 'opamp', kind: 'node', tikz: 'op amp', pins: OA, keywords: 'operational amplifier opamp', draw: opamp });
  P({ key: 'opamp:5', name: 'Op-amp (supply pins)', cat: 'opamp', kind: 'node', tikz: 'op amp', keywords: 'operational amplifier opamp supply power',
    pins: { ...OA, up: [OUPX, OUPY], down: [OUPX, -OUPY] }, draw: opamp });
})();
