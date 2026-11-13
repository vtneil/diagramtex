import { runtime as TD } from '../runtime';
// circuitikz parts: switches & jumpers, fuses & protection, antennas & RF, connectors, ICs, flip-flops.
// See czcore.ts for units and the drawing API. Geometry follows circuitikz's shape code (default settings):
// pgfcircbipoles.tex, pgfcircmonopoles.tex, pgfcircshapes.tex, pgfcircmultipoles.tex.
(function () {
  const P = TD.CZ.part;
  const R = 1.4; // bipoles/length (cm)
  const PT = 2.54 / 72.27; // 1pt in cm
  const NR = 0.04 * R; // ocirc radius (nodes width × Rlen)
  const THIN = 0.5; // wire line width relative to the component width (bipoles/thickness = 2)

  // ---------- helpers ----------
  // an open pole (ocirc): thin outline, white fill
  const ocirc = (g: any, x: any, y: any) => { g.width(THIN).circle(x, y, NR).paper(); g.width(1); };
  // arrow tip drawn from a pgf outline given in units of t, with the tip (local u = u0) at (x,y) along (dx,dy)
  function tip(g: any, x: any, y: any, dx: any, dy: any, t: any, u0: any, segs: any) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const T = (u: any, v: any) => [x + (u - u0) * t * ux - v * t * uy, y + (u - u0) * t * uy + v * t * ux];
    for (const s of segs) {
      const p = [];
      for (let i = 1; i < s.length; i += 2) p.push(...T(s[i], s[i + 1]));
      if (s[0] === 'M') g.M(...p); else if (s[0] === 'L') g.L(...p); else g.C(...p);
    }
    g.Z().ink();
    return g;
  }
  // circuitikz's latexslim (switch arrows), lw = line width in pt
  const slim = (g: any, x: any, y: any, dx: any, dy: any, lw: any) => { g.width(0.05); tip(g, x, y, dx, dy, (0.28 + 0.3 * lw) * PT, 6,
    [['M', 6, 0], ['C', 3.5, 0.5, -1, 1.5, -4, 3.75], ['C', -1.5, 1, -1.5, -1, -4, -3.75], ['C', -1, -1.5, 3.5, -0.5, 6, 0]]); g.width(1); };
  // pgf's (old) latex tip
  const latex = (g: any, x: any, y: any, dx: any, dy: any, lw: any) => { g.width(0.05); tip(g, x, y, dx, dy, (0.28 + 0.3 * lw) * PT, 9,
    [['M', 9, 0], ['C', 6.3333, 0.5, 2, 2, -1, 3.75], ['L', -1, -3.75], ['C', 2, -2, 6.3333, -0.5, 9, 0]]); g.width(1); };
  // line (x1,y1)→(x2,y2) ending in a tip, shortened so the line hides under the head
  function lineTip(g: any, x1: any, y1: any, x2: any, y2: any, kind: any, lw: any) {
    const l = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / l, uy = (y2 - y1) / l, back = 0.06;
    g.line(x1, y1, x2 - ux * back, y2 - uy * back);
    kind(g, x2, y2, ux, uy, lw);
  }
  // arc around (cx,cy) radius r from a1 to a2 (deg) with a latexslim tip at a2 (switch "action" arrows)
  function arcArrow(g: any, cx: any, cy: any, r: any, a1: any, a2: any) {
    const ccw = a2 > a1, sh = (0.09 / r) * (180 / Math.PI) * (ccw ? 1 : -1);
    g.arc(cx, cy, r, r, a1, a2 - sh);
    const a = (a2 * Math.PI) / 180, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    slim(g, x, y, ccw ? -Math.sin(a) : Math.sin(a), ccw ? Math.cos(a) : -Math.cos(a), 0.8);
  }
  // arrows.meta Triangle[scale=2] at wire width (spark gap)
  const tri = (g: any, x: any, y: any, dx: any, dy: any) => { const l = 0.3, h = 0.15, s = Math.sign(dx); g.width(0.05).poly(x, y, x - s * l, y + h, x - s * l, y - h).ink(); g.width(1); };

  // ---------- switches ----------
  const SW = (key: any, name: any, tikz: any, w: any, draw: any, extra = {}) => P({ key: 'switch:' + key, name, cat: 'switch', kind: 'bipole', tikz, w, draw, ...extra });

  // nos: width .35, height .3 → lever from left to (.9 right, up)
  SW('open', 'Open Switch', 'nos', 0.35 * R, (g: any) => { const r = 0.175 * R, u = 0.15 * R; g.line(-r, 0, 0.9 * r, u); },
    { keywords: 'spst normally open switch nos' });
  // ospst / cspst: width .35, height .35; lever to (.6 right, up); arc radius 1.2 right around the left end
  const spst = (a1: any, a2: any) => (g: any) => { const r = 0.175 * R; g.line(-r, 0, 0.6 * r, r); arcArrow(g, -r, 0, 1.2 * r, a1, a2); };
  SW('opening', 'Opening Switch', 'ospst', 0.35 * R, spst(-10, 90), { keywords: 'spst opening switch' });
  SW('closing', 'Closing Switch', 'cspst', 0.35 * R, spst(90, -20), { keywords: 'spst closing switch' });

  // push buttons: width .5, height .5 → right = up = .35; poles at the ends
  const PB = 0.25 * R;
  const pb = (bar: any, top: any) => (g: any) => { g.line(-PB, bar, PB, bar).line(0, bar, 0, top); ocirc(g, -PB, 0); ocirc(g, PB, 0); };
  SW('pushbutton', 'Push Button', 'nopb', 0.5 * R, pb(PB / 2, PB), { keywords: 'push button normally open nopb' });
  SW('pushbutton-closed', 'Closed Push Button', 'nopbc', 0.5 * R, pb(NR, PB / 2 + NR), { keywords: 'push button normally open closed nopbc' });
  SW('ncpb-open', 'Normally Closed Button Open', 'ncpbo', 0.5 * R, pb(-PB / 2, PB / 2 + NR), { keywords: 'push button normally closed open ncpbo' });
  SW('ncpb', 'Normally Closed Button', 'ncpb', 0.5 * R, pb(-NR, PB), { keywords: 'push button normally closed ncpb' });

  // reed: width .8, height .4; a nos-sized lever inside a rounded glass envelope
  SW('reed', 'Reed Switch', 'reed', 0.8 * R, (g: any) => {
    const r = 0.4 * R, u = 0.2 * R, kx = (0.9 * 0.35) / 0.8, ky = 0.3 / 0.4;
    g.arc(r - u, 0, u, u, 90, -90).L(-r + u, -u); g.arc(-r + u, 0, u, u, 270, 90, true).Z();
    g.line(-kx * r, 0, kx * r, ky * u);
    g.width(THIN).line(-r, 0, -kx * r, 0).line(r, 0, kx * r, 0).width(1);
  }, { keywords: 'reed magnetic switch' });

  // spdt (node): width .85, height .45, margin .45
  (function () {
    const x = 0.425 * R, y = 0.225 * R, o = 0.45 * x;
    P({ key: 'switch:spdt', name: 'SPDT', cat: 'switch', kind: 'node', tikz: 'spdt', keywords: 'single pole double throw changeover switch',
      pins: { in: [-x, 0], 'out 1': [x, y], 'out 2': [x, -y] },
      draw: (g: any) => {
        g.width(THIN).line(x, y, o, y).line(x, -y, o, -y).line(-x, 0, -o, 0).width(1);
        g.line(-o + NR, 0, o - 0.05 * y, y - NR - 0.05 * y);
        ocirc(g, o, y); ocirc(g, o, -y); ocirc(g, -o, 0);
      } });
  })();

  // toggle switch: width .8, height .8 (depth 0)
  SW('toggle', 'Toggle switch', 'toggle switch', 0.8 * R, (g: any) => {
    const r = 0.4 * R, u = 0.4 * R;
    g.width(THIN).line(-r, 0, -0.3 * r, 0).line(r, 0, 0.5 * r, 0).line(r, 0.8 * u, 0.5 * r, 0.8 * u, 0.5 * r, 0.15 * u)
      .line(-0.2 * r, u, 0.2 * r, u);
    // dashed actuator: dash pattern .08u on, .04u off, .7u on, .04u off, .8u on
    g.line(0, u, 0, 0.92 * u).line(0, 0.88 * u, 0, 0.8 * u, -0.2 * r, 0.6 * u, 0, 0.4 * u, 0, 0.3457 * u)
      .line(0, 0.3057 * u, 0, 0.2 * u).width(1);
    g.line(-0.3 * r, 0, 0.7 * r, 0.5 * u);
  }, { pins: { 'out 2': [0.4 * R, 0.8 * 0.4 * R] }, keywords: 'toggle changeover switch' });

  // inline proximeter: diamond of half-size proximeter/width = .3
  SW('proximeter', 'Proximeter', 'inline proximeter', 0.6 * R, (g: any) => {
    const s = 0.3 * R, h = 0.3 * s;
    g.poly(-s, 0, 0, s, s, 0, 0, -s);
    g.width(THIN).line(-(s - h), h, s - h, h).line(-(s - h), -h, s - h, -h).width(1);
  }, { keywords: 'proximity switch sensor' });

  // jumpers: width .4 (poles at the ends), link arc of curvature 2 × radius, open shift 3
  const jumper = (b: any) => (g: any) => {
    const r = 0.2 * R;
    if (b) g.width(THIN).M(-0.9 * r, b * NR).C(-0.5 * r, (b + 2) * NR, 0.5 * r, (b + 2) * NR, 0.9 * r, b * NR).width(1);
    ocirc(g, -r, 0); ocirc(g, r, 0);
  };
  SW('jumper-bare', 'Bare Jumper', 'bare jumper', 0.4 * R, jumper(0), { keywords: 'jumper pins header' });
  SW('jumper-open', 'Open Jumper', 'open jumper', 0.4 * R, jumper(3), { keywords: 'jumper link open' });
  SW('jumper-closed', 'Closed Jumper', 'closed jumper', 0.4 * R, jumper(1), { keywords: 'jumper link closed' });

  // solder jumpers: height .3; half-disc pads (filled), closing bar .6 of the height
  const SJU = 0.15 * R, SJC = 0.6 * SJU;
  const pads = (g: any, r: any) => {
    g.width(THIN).arc(-r + SJU, 0, SJU, SJU, 90, 270).Z().ink();
    g.arc(r - SJU, 0, SJU, SJU, 90, -90).Z().ink().width(1);
  };
  const bar = (g: any, x1: any, x2: any) => { g.width(THIN).rect(x1, SJC, x2, -SJC).ink().width(1); };
  const sj = (closed: any) => (g: any) => { const r = 0.18 * R; pads(g, r); if (closed) bar(g, -r + SJU, r - SJU); };
  SW('solder-open', 'Open Solder Jumper', 'open solder jumper', 0.36 * R, sj(false), { keywords: 'solder jumper pad open' });
  SW('solder-closed', 'Closed Solder Jumper', 'closed solder jumper', 0.36 * R, sj(true), { keywords: 'solder jumper pad closed bridged' });
  const dsj = (l: any, rt: any) => (g: any) => {
    const r = 0.285 * R, c = SJU / 2;
    pads(g, r); g.width(THIN).rect(-c, SJU, c, -SJU).ink().width(1);
    if (l) bar(g, -r + SJU, -c);
    if (rt) bar(g, c, r - SJU);
  };
  const dsjPins = { pins: { tap: [0, SJU], 'tap down': [0, -SJU] } };
  SW('dsolder-open', 'Open Double Solder Jumper', 'open double solder jumper', 0.57 * R, dsj(0, 0), { ...dsjPins, keywords: 'double solder jumper three pad' });
  SW('dsolder-left', 'Left Double Solder Jumper', 'left double solder jumper', 0.57 * R, dsj(1, 0), { ...dsjPins, keywords: 'double solder jumper three pad' });
  SW('dsolder-right', 'Right Double Solder Jumper', 'right double solder jumper', 0.57 * R, dsj(0, 1), { ...dsjPins, keywords: 'double solder jumper three pad' });
  SW('dsolder-closed', 'Closed Double Solder Jumper', 'closed double solder jumper', 0.57 * R, dsj(1, 1), { ...dsjPins, keywords: 'double solder jumper three pad' });

  // ---------- fuses & protection ----------
  const FU = (key: any, name: any, tikz: any, w: any, draw: any, kw: any) => P({ key: 'fuse:' + key, name, cat: 'fuse', kind: 'bipole', tikz, w, draw, keywords: kw });
  // fuse / afuse: width .5, height .2
  const fuse = (asym: any) => (g: any) => {
    const r = 0.25 * R, u = 0.1 * R;
    g.rect(-r, u, r, -u);
    g.width(THIN).line(-r, 0, r, 0);
    if (asym) g.rect(0.7 * r, u, r, -u).ink();
    g.width(1);
  };
  FU('fuse', 'Fuse', 'fuse', 0.5 * R, fuse(false), 'fuse');
  FU('afuse', 'Asymmetric Fuse', 'afuse', 0.5 * R, fuse(true), 'asymmetric fuse slow');
  // wfuse: two half-circle bumps (radius right/2) between two poles
  FU('wiggly', 'Wiggly Fuse', 'wfuse', 0.5 * R, (g: any) => {
    const r = 0.25 * R, h = r / 2;
    g.width(THIN).arc(-h, 0, h, h, 180, 360).arc(h, 0, h, h, 180, 0, true).width(1);
    ocirc(g, -r, 0); ocirc(g, r, 0);
  }, 'wiggly fuse');
  // barrier: height .21, width 0 → a cross on the wire; openbarrier: width .3
  const cross = (g: any) => { const u = 0.105 * R; g.line(-u, u, u, -u).line(-u, -u, u, u); };
  FU('barrier', 'Barrier', 'barrier', 0, cross, 'barrier cross');
  FU('openbarrier', 'Open Barrier', 'openbarrier', 0.3 * R, cross, 'open barrier cross gap');
  // european gas filled surge arrester: rectangle .8 × .3 with one latexslim arrow from the left side
  FU('gas-eu', 'Gas Surge Arrester (European)', 'european gas filled surge arrester', 0.8 * R, (g: any) => {
    const r = 0.4 * R, u = 0.15 * R;
    g.rect(-r, u, r, -u);
    lineTip(g, -r, 0, -0.3 * r, 0, slim, 0.8);
  }, 'gas filled surge arrester gdt european');
  // american: circle .9 up, two latex arrows facing each other, a dot
  FU('gas-us', 'Gas Surge Arrester (American)', 'american gas filled surge arrester', 0.6 * R, (g: any) => {
    const r = 0.3 * R;
    g.circle(0, 0, 0.9 * r);
    g.width(THIN);
    lineTip(g, r, 0, 0.15 * r, 0, latex, 0.4);
    lineTip(g, -r, 0, -0.15 * r, 0, latex, 0.4);
    g.width(0.05).circle(-0.25 * r, -0.45 * r, 0.1 * r).ink().width(1);
  }, 'gas filled surge arrester gdt american');
  // spark gap: height .6 (square), two Triangle[scale=2] tips with a gap of .05; optional circle
  const spark = (enc: any) => (g: any) => {
    const r = 0.3 * R, gp = 0.05 * r;
    if (enc) g.circle(0, 0, r);
    g.width(THIN).line(-r, 0, -gp - 0.15, 0).line(r, 0, gp + 0.15, 0).width(1);
    tri(g, -gp, 0, 1, 0); tri(g, gp, 0, -1, 0);
  };
  FU('sparkgap', 'Spark Gap', 'sparkgap', 0.6 * R, spark(false), 'spark gap');
  FU('sparkgap-enclosed', 'Spark Gap (Enclosed)', 'sparkgap, sparkgap/circle', 0.6 * R, spark(true), 'spark gap enclosed');

  // ---------- antennas & RF ----------
  // tline: width .6, height .3; a cylinder seen from the side, ellipse half-width .4 up
  P({ key: 'rf:tline', name: 'Transmission line', cat: 'rf', kind: 'bipole', tikz: 'TL', w: 0.6 * R, keywords: 'transmission line tline coax',
    draw: (g: any) => {
      const r = 0.3 * R, u = 0.15 * R, s = 0.4 * u;
      g.M(r - s, u).L(-r + s, u); g.arc(-r + s, 0, s, u, 90, 270, true).L(r - s, -u); g.arc(r - s, 0, s, u, -90, 90, true).Z();
      g.arc(r - s, 0, s, u, 90, 270);
      g.width(THIN).line(r - s, 0, r, 0).width(1);
    } });
  // bareantenna: triangle 2×.25 tall on a mast; center is the feed point (bottom)
  P({ key: 'rf:bareantenna', name: 'Bare Antenna', cat: 'rf', kind: 'node', tikz: 'bareantenna', keywords: 'antenna aerial',
    pins: { center: [0, 0] },
    draw: (g: any) => { const s = 0.25 * R; g.poly(0, 0, -s, 2 * s, s, 2 * s); g.width(THIN).line(0, 0, 0, 2 * s).width(1); } });
  // dinantenna: width .2, height .6
  P({ key: 'rf:dinantenna', name: 'DIN Antenna', cat: 'rf', kind: 'node', tikz: 'dinantenna', keywords: 'antenna aerial din',
    pins: { center: [0, 0] },
    draw: (g: any) => { const w = 0.2 * R, h = 0.6 * R; g.line(0, 0, 0, h).line(0, h / 2, -w, h).line(0, h / 2, w, h); } });
  // msrstub: radial fan, height 1 (radius .5 R), inner radius .25 of it; center at the apex
  P({ key: 'rf:msrstub', name: 'Microstrip radial stub', cat: 'rf', kind: 'node', tikz: 'msrstub', keywords: 'microstrip radial stub',
    pins: { center: [0, 0] },
    draw: (g: any) => {
      const up = 0.5 * R, s = 0.25 * up, c = Math.SQRT1_2;
      g.line(0, 0, 0, s);
      g.arc(0, 0, s, s, 135, 45).L(up * c, up * c); g.arc(0, 0, up, up, 45, 135, true).Z();
    } });
  // msport: width .5, height .3 (mstline height); center (and left) on the pointed end
  P({ key: 'rf:msport', name: 'Microstrip port', cat: 'rf', kind: 'node', tikz: 'msport', keywords: 'microstrip port',
    pins: { left: [0, 0], right: [0.5 * R, 0] },
    draw: (g: any) => { const w = 0.5 * R, u = 0.15 * R; g.poly(0, 0, u / 2, u, w, u, w, -u, u / 2, -u); } });
  // mstline: width 1.2, height .3
  P({ key: 'rf:mstline', name: 'Microstrip transmission line', cat: 'rf', kind: 'bipole', tikz: 'mstline', w: 1.2 * R, keywords: 'microstrip line',
    draw: (g: any) => g.rect(-0.6 * R, 0.15 * R, 0.6 * R, -0.15 * R) });
  // mslstub: same rectangle as mstline; center on its left side
  P({ key: 'rf:mslstub', name: 'Microstrip linear stub', cat: 'rf', kind: 'node', tikz: 'mslstub', keywords: 'microstrip linear stub',
    pins: { left: [0, 0], right: [1.2 * R, 0] },
    draw: (g: any) => g.rect(0, 0.15 * R, 1.2 * R, -0.15 * R) });
  // tlinestub: a short tline (step = tline width .6 R) fed from the left; center on the feed end
  const stub = (m: any) => (g: any) => {
    const s = 0.6 * R, e = 0.125 * s, h = 0.25 * s, x0 = 0.5 * s, x1 = 1.5 * s;
    g.M(m * x0, h).L(m * x1, h); g.arc(m * x1, 0, m * e, h, 90, -90, true).L(m * x0, -h); g.arc(m * x0, 0, -m * e, -h, 90, -90, true).Z();
    g.arc(m * x0, 0, m * e, h, 90, -90);
    g.width(THIN).line(0, 0, m * x0, 0).width(1);
  };
  P({ key: 'rf:tlinestub', name: 'Transmission line stub', cat: 'rf', kind: 'node', tikz: 'tlinestub', keywords: 'transmission line stub',
    pins: { center: [0, 0] }, draw: stub(1) });
  P({ key: 'rf:tlinestub-rev', name: 'Transmission line stub reversed', cat: 'rf', kind: 'node', tikz: 'tlinestub, xscale=-1',
    keywords: 'transmission line stub reversed', pins: { center: [0, 0] }, draw: stub(-1) });
  // piezoelectric (crystal): width .4, height .7; two plates and an inner box
  P({ key: 'rf:crystal', name: 'Crystal Oscillator', cat: 'rf', kind: 'bipole', tikz: 'piezoelectric', w: 0.4 * R,
    keywords: 'crystal quartz xtal piezoelectric resonator',
    draw: (g: any) => {
      const r = 0.2 * R, u = 0.35 * R, s = r / 10;
      g.line(-r, u, -r, -u).line(r, u, r, -u);
      g.rect(-r + 4 * s, u - s, r - 4 * s, -u + s);
    } });

  // ---------- connectors ----------
  // bnc: outer circle 2.5 × ocirc radius, opened to the right; `center` (= hot) is on the opening
  (function () {
    const ro = 2.5 * NR, ri = NR, a = (Math.asin(ri / ro) * 180) / Math.PI;
    P({ key: 'conn:bnc', name: 'BNC Connector', cat: 'conn', kind: 'node', tikz: 'bnc', keywords: 'bnc coax connector',
      pins: { hot: [0, 0], shield: [-ro, -ro] },
      draw: (g: any) => {
        g.arc(-ro, 0, ro, ro, a, 360 - a);
        g.circle(-ro, 0, ri);
        g.width(THIN).line(-ro + ri, 0, 0, 0).width(1);
      } });
  })();
  // iec connector: width .3, height .2; socket arc on the left, filled plug on the right
  P({ key: 'conn:iec', name: 'IEC Connector', cat: 'conn', kind: 'bipole', tikz: 'iec connector', w: 0.3 * R, keywords: 'iec 60617 plug socket connector',
    draw: (g: any) => {
      const r = 0.15 * R, u = 0.1 * R;
      g.arc(-r / 3, 0, (2 / 3) * r, u, 90, 270);
      g.rect(-r / 3, u / 2, r, -u / 2).ink();
    } });

  // ---------- ICs ----------
  // dipchip: 8 pins, spacing .4, width 1.2, external pins .2, top mark, pin numbers (\tiny)
  (function () {
    const n = 8, sp = 0.4 * R, W = 1.2 * R, H = (n * sp) / 2, ext = 0.2 * R, h = n / 2;
    const x = W / 2, y = H / 2, pins: Record<string, any> = {};
    const py = (k: any) => (k <= h ? y + (0.5 - k) * sp : -y + (0.5 - h + k - 1) * sp);
    for (let k = 1; k <= n; k++) pins['pin ' + k] = [k <= h ? -x - ext : x + ext, py(k)];
    P({ key: 'ic:dip', name: 'Dual in-line package', cat: 'ic', kind: 'node', tikz: 'dipchip', text: true, keywords: 'dip chip ic package',
      pins,
      draw: (g: any) => {
        g.rect(-x, -y, x, y);
        g.arc(0, y, 0.2 * x, 0.2 * x, 180, 360);
        g.width(THIN);
        const fs = 5 * PT, sp1 = fs / 3;
        for (let k = 1; k <= n; k++) {
          const left = k <= h, xx = left ? -x : x;
          g.line(xx, py(k), xx + (left ? -ext : ext), py(k));
          g.text(xx + (left ? sp1 : -sp1), py(k), String(k), fs, { anchor: left ? 'w' : 'e' });
        }
        g.width(1);
      } });
  })();
  // muxdemux: base len .4, Lh 8, Rh 6, w 3, NL 8, NR 1, NB 3, NT 0, no inset
  (function () {
    const b = 0.4 * R, xl = (-b * 3) / 2, yl = (b * 8) / 2, xr = -xl, yr = (b * 6) / 2, ext = 0.2 * R, pins: Record<string, any> = {}, leads: any[] = [];
    const NL = 8, NRt = 1, NB = 3;
    for (let k = 1; k <= NL; k++) { const yy = yl + (0.5 - k) * ((2 * yl) / NL); pins['lpin ' + k] = [xl - ext, yy]; leads.push([xl, yy, xl - ext, yy]); }
    for (let k = 1; k <= NRt; k++) { const yy = yr + (0.5 - k) * ((2 * yr) / NRt); pins['rpin ' + k] = [xr + ext, yy]; leads.push([xr, yy, xr + ext, yy]); }
    const st = (2 * xr) / NB, oth = ((yr - yl) / (xr - xl)) * st;
    for (let k = 1; k <= NB; k++) {
      const xx = xl + (k - 0.5) * st, yy = -yr + (NB - k + 0.5) * oth;
      pins['bpin ' + k] = [xx, yy - ext]; leads.push([xx, yy, xx, yy - ext]);
    }
    P({ key: 'ic:muxdemux', name: 'Mux/Demux', cat: 'ic', kind: 'node', tikz: 'muxdemux', text: true, keywords: 'multiplexer demultiplexer mux demux',
      pins,
      draw: (g: any) => {
        g.poly(xl, yl, xr, yr, xr, -yr, xl, -yl);
        g.width(THIN); for (const l of leads) g.line(...l); g.width(1);
      } });
  })();

  // ---------- flip-flops ----------
  // flipflop: 6 pins, spacing .6, width 1.2, external pins .2, clock wedge .2 of the spacing, labels in \small
  const FF = { sp: 0.6 * R, x: 0.6 * R, y: (6 * 0.6 * R) / 4, ext: 0.2 * R };
  const ffy = (k: any) => (k <= 3 ? FF.y + (0.5 - k) * FF.sp : -FF.y + (0.5 - 3 + k - 1) * FF.sp);
  function flipflop(key: any, name: any, tikz: any, t: any, clocks: any, kw: any) {
    const pins: Record<string, any> = {};
    for (const k of Object.keys(t).map(Number).sort()) {
      const left = k <= 3;
      pins['pin ' + k] = [left ? -FF.x - FF.ext : FF.x + FF.ext, ffy(k)];
      pins['bpin ' + k] = [left ? -FF.x : FF.x, ffy(k)];
    }
    P({ key: 'ff:' + key, name, cat: 'ff', kind: 'node', tikz, keywords: kw, pins,
      draw: (g: any) => {
        g.rect(-FF.x, -FF.y, FF.x, FF.y);
        const fs = 9 * PT, sp1 = fs / 3, wd = 0.2 * FF.sp;
        g.width(THIN);
        for (const [ks, lab] of Object.entries<any>(t)) {
          const k = Number(ks), left = k <= 3, sx = left ? -1 : 1, xx = sx * FF.x, yy = ffy(k);
          g.line(xx, yy, xx + sx * FF.ext, yy);
          let off = 0;
          if (clocks.includes(k)) { g.line(xx, yy + wd, xx - sx * wd, yy, xx, yy - wd); off = wd; }
          if (lab) {
            const o: any = typeof lab === 'string' ? { s: lab } : lab;
            g.text(xx - sx * (off + sp1), yy, o.s, fs, { anchor: left ? 'w' : 'e', over: !!o.over });
          }
        }
        g.width(1);
      } });
  }
  const NQ = { s: 'Q', over: true };
  flipflop('latch', 'Latch', 'latch', { 1: 'D', 3: 'CLK', 4: NQ, 6: 'Q' }, [], 'latch d type');
  flipflop('sr', 'SR flip-flop', 'flipflop SR', { 1: 'S', 3: 'R', 4: NQ, 6: 'Q' }, [], 'flip flop sr set reset latch');
  flipflop('d', 'D flip-flop', 'flipflop D', { 1: 'D', 3: '', 4: NQ, 6: 'Q' }, [3], 'flip flop d data register');
  flipflop('t', 'T flip-flop', 'flipflop T', { 1: 'T', 3: '', 4: NQ, 6: 'Q' }, [3], 'flip flop t toggle');
  flipflop('jk', 'JK flip-flop', 'flipflop JK', { 1: 'J', 2: '', 3: 'K', 4: NQ, 6: 'Q' }, [2], 'flip flop jk');
})();
