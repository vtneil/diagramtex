// circuitikz parts: sources & cells, meters & devices, electro-mechanical. See czcore.js for units and the
// drawing API. Geometry follows pgfcircbipoles.tex / pgfcircquadpoles.tex / pgfcircmultipoles.tex with the
// default settings (bipoles/length 1.4 cm, class scales 1, no fill, voltage dir "noold", fixbatteries false).
// Line widths: 1 = component (bipoles/thickness 2 × wire), 0.5 = wire width, 3 = circuitikz's "3×" plates.
(function () {
  // register, rounding w and pin positions to 1e-4 cm
  const rnd = (v) => Math.round(v * 1e4) / 1e4;
  const P = (d) => {
    if (d.w) d.w = rnd(d.w);
    if (d.pins) for (const k in d.pins) d.pins[k] = d.pins[k].map(rnd);
    return window.TD.CZ.part(d);
  };
  const R = 1.4; // bipoles/length (cm)
  const NODE_R = 0.04 * R; // nodes width × Rlen (circ / ocirc radius)
  const S = R / 16; // currarrow unit (Rlen / current arrow scale)
  const D2R = Math.PI / 180;

  // ---------- helpers ----------
  // currarrow node centred at (x,y), pointing +x
  const carrow = (g, x, y) => g.poly(x - 0.7 * S, y - 0.8 * S, x + S, y, x - 0.7 * S, y + 0.8 * S).ink();
  // diamond of half-size h (controlled sources)
  const diamond = (g, h) => g.poly(-h, 0, 0, h, h, 0, 0, -h);
  // american signs, as circuitikz draws them on a left→right path with the default "sign rotation":
  // "+" towards the start, "−" (rotated 90°, so a bar across the path) towards the end. c: glyph centre
  const signs = (g, c) => {
    const a = 0.105;
    g.width(0.5).line(-c - a, 0, -c + a, 0).line(-c, -a, -c, a).line(c, -a, c, a).width(1);
  };
  // source symbol (sources/symbol/rotate = 90): points given in the symbol frame, rotated by 90°
  const rot = (pts) => { const o = []; for (let i = 0; i < pts.length; i += 2) o.push(-pts[i + 1], pts[i]); return o; };
  const sine = (g, u) => g.curve((t) => { const x = -u + 2 * u * t, y = 0.5 * u * Math.sin(2 * Math.PI * t); return [-y, x]; }, 40);
  // polar point
  const pol = (a, r, ry) => [r * Math.cos(a * D2R), (ry === undefined ? r : ry) * Math.sin(a * D2R)];
  // rounded rectangle (pgf arced corners, radius k)
  const rrect = (g, x1, y1, x2, y2, k) => {
    g.M(x1 + k, y1).L(x2 - k, y1);
    g.arc(x2 - k, y1 + k, k, k, -90, 0, true).L(x2, y2 - k);
    g.arc(x2 - k, y2 - k, k, k, 0, 90, true).L(x1 + k, y2);
    g.arc(x1 + k, y2 - k, k, k, 90, 180, true).L(x1, y1 + k);
    g.arc(x1 + k, y1 + k, k, k, 180, 270, true);
    return g.Z();
  };
  // the metering window of smeter / qucs probes: arcs r1..r2 between angles a1>a2, centre (0,cy), index at ai
  const meterWindow = (g, cy, r1, r2, a1, a2, ai, ri) => {
    const p = pol(a1, r1);
    g.width(0.5).M(p[0], cy + p[1]);
    g.arc(0, cy, r1, r1, a1, a2, true);
    g.arc(0, cy, r2, r2, a2, a1, true).Z();
    const q1 = pol(ai, r1), q2 = pol(ai, ri);
    g.line(q1[0], cy + q1[1], q2[0], cy + q2[1]).width(1);
  };
  // legacy round meter (ammeter / voltmeter / ohmmeter): r = 0.42
  const legacyMeter = (g, txt) => {
    const r = 0.42;
    g.width(0.5).line(-r, 0, -0.9 * r, 0).line(0.9 * r, 0, r, 0);
    g.width(1).circle(0, 0, 0.9 * r);
    g.width(0.5).line(-r, -r, r - 0.07, r - 0.07).head(r, r, 1, 1, 0.1, 0.04).width(1);
    g.text(0, 0, txt, 0.3, { bold: true });
  };

  // ======================= Sources & cells =======================
  // batteries: width .3, height .6 → half-length 0.21, half-height 0.42
  const BX = 0.21, BY = 0.42, BS = (0.3 * R) / 6;
  const plate = (g, x, h) => g.line(x, -h, x, h);
  // single cells: stubs at the component width, plates at ±.33 × half-length
  const cell = (g, leftLong, thick) => {
    const x = 0.33 * BX;
    g.line(x, 0, BX, 0).line(-x, 0, -BX, 0);
    plate(g, leftLong ? -x : x, BY);
    g.width(thick ? 3 : 1);
    plate(g, leftLong ? x : -x, 0.5 * BY);
    g.width(1);
  };
  P({ key: 'src:cell', name: 'Cell', cat: 'src', kind: 'bipole', tikz: 'battery1', w: 2 * BX, keywords: 'battery1 single cell',
    draw: (g) => cell(g, true, false) });
  P({ key: 'src:cell2', name: 'Cell2', cat: 'src', kind: 'bipole', tikz: 'battery2', w: 2 * BX, keywords: 'battery2 single cell thick',
    draw: (g) => cell(g, true, true) });
  P({ key: 'src:battery', name: 'Battery', cat: 'src', kind: 'bipole', tikz: 'battery', w: 2 * BX, keywords: 'battery cells',
    draw: (g) => { plate(g, -BX, BY); plate(g, -BS, 0.5 * BY); plate(g, BS, BY); plate(g, BX, 0.5 * BY); } });
  P({ key: 'src:baertty', name: 'Battery (baertty)', cat: 'src', kind: 'bipole', tikz: 'baertty', w: 2 * BX, keywords: 'baertty battery xkcd joke',
    draw: (g) => { plate(g, -BX, 0.5 * BY); plate(g, -BS, 0.5 * BY); plate(g, BS, BY); plate(g, BX, BY); } });
  P({ key: 'src:solar', name: 'Solar', cat: 'src', kind: 'bipole', tikz: 'solar', w: 2 * BX, keywords: 'solar cell photovoltaic battery',
    draw: (g) => {
      cell(g, true, true);
      // photodiode-style arrows (wire width, latexslim tips) pointing at the cell
      g.width(0.5);
      g.arrow(0.6 * BX, 2 * BY, -0.4 * BX, BY, 0.09, 0.035);
      g.arrow(1.2 * BX, 1.8 * BY, 0.2 * BX, 0.8 * BY, 0.09, 0.035);
      g.width(1);
    } });

  // round sources: width = height = .6 → r 0.42
  const r6 = 0.42;
  P({ key: 'src:vsource-us', name: 'Voltage Source (American)', cat: 'src', kind: 'bipole', tikz: 'american voltage source', w: 2 * r6,
    keywords: 'vsourceAM independent dc voltage', draw: (g) => { g.circle(0, 0, r6); signs(g, 0.7 * r6 - 0.117); } });
  P({ key: 'src:vsource-eu', name: 'Voltage Source (European)', cat: 'src', kind: 'bipole', tikz: 'european voltage source', w: 2 * r6,
    keywords: 'vsource vsourceEU independent voltage', draw: (g) => g.circle(0, 0, r6).line(-r6, 0, r6, 0) });
  P({ key: 'src:vsource-cute', name: 'Cute European Voltage Source', cat: 'src', kind: 'bipole', tikz: 'cute european voltage source', w: 2 * r6,
    keywords: 'vsourceC ceV voltage', draw: (g) => g.circle(0, 0, r6).width(3).line(-0.6 * r6, 0, 0.6 * r6, 0).width(1) });
  P({ key: 'src:isource-cute', name: 'Cute European Current Source', cat: 'src', kind: 'bipole', tikz: 'cute european current source', w: 2 * r6,
    keywords: 'isourceC ceI current', draw: (g) => g.circle(0, 0, r6).width(3).line(0, -0.6 * r6, 0, 0.6 * r6).width(1) });
  P({ key: 'src:isource-us', name: 'Current Source (American)', cat: 'src', kind: 'bipole', tikz: 'american current source', w: 2 * r6,
    keywords: 'isourceAM independent current arrow', draw: (g) => { g.circle(0, 0, r6).line(-0.7 * r6, 0, 0.7 * r6, 0); carrow(g, 0.5 * r6, 0); } });
  P({ key: 'src:isource-eu', name: 'Current Source (European)', cat: 'src', kind: 'bipole', tikz: 'european current source', w: 2 * r6,
    keywords: 'isource isourceEU independent current', draw: (g) => g.circle(0, 0, r6).line(0, -r6, 0, r6) });

  // controlled (diamond) sources: width = height = .7 → half 0.49
  const d7 = 0.49;
  P({ key: 'src:cvsource-eu', name: 'Controlled Voltage Source (European)', cat: 'src', kind: 'bipole', tikz: 'european controlled voltage source', w: 2 * d7,
    keywords: 'cvsource cvsourceEU dependent voltage diamond', draw: (g) => { diamond(g, d7); g.line(-d7, 0, d7, 0); } });
  P({ key: 'src:cisource-eu', name: 'Controlled Current Source (European)', cat: 'src', kind: 'bipole', tikz: 'european controlled current source', w: 2 * d7,
    keywords: 'cisource cisourceEU dependent current diamond', draw: (g) => { diamond(g, d7); g.line(0, -d7, 0, d7); } });
  P({ key: 'src:cvsource-cute', name: 'Cute European Controlled Voltage Source', cat: 'src', kind: 'bipole', tikz: 'cute european controlled voltage source', w: 2 * d7,
    keywords: 'cvsourceC cceV dependent voltage diamond', draw: (g) => { diamond(g, d7); g.width(3).line(-0.6 * d7, 0, 0.6 * d7, 0).width(1); } });
  P({ key: 'src:cisource-cute', name: 'Cute European Controlled Current Source', cat: 'src', kind: 'bipole', tikz: 'cute european controlled current source', w: 2 * d7,
    keywords: 'cisourceC cceI dependent current diamond', draw: (g) => { diamond(g, d7); g.width(3).line(0, -0.6 * d7, 0, 0.6 * d7).width(1); } });
  P({ key: 'src:ecsource', name: 'Empty Controlled Source', cat: 'src', kind: 'bipole', tikz: 'empty controlled source', w: 2 * d7,
    keywords: 'ecsource dependent diamond', draw: (g) => diamond(g, d7) });

  // noise sources: grey-filled circle (bipoles/noise sources/fillcolor = gray!50)
  P({ key: 'src:vsource-noise', name: 'Noise Voltage Source', cat: 'src', kind: 'bipole', tikz: 'noise voltage source', w: 2 * r6,
    keywords: 'vsourceN nV noise', draw: (g) => { g.circle(0, 0, r6).grey(); g.width(3).line(-0.6 * r6, 0, 0.6 * r6, 0).width(1); } });
  P({ key: 'src:isource-noise', name: 'Noise Current Source', cat: 'src', kind: 'bipole', tikz: 'noise current source', w: 2 * r6,
    keywords: 'isourceN nI noise', draw: (g) => { g.circle(0, 0, r6).grey(); g.width(3).line(0, -0.6 * r6, 0, 0.6 * r6).width(1); } });

  P({ key: 'src:cvsource-us', name: 'Controlled Voltage Source (American)', cat: 'src', kind: 'bipole', tikz: 'american controlled voltage source', w: 2 * d7,
    keywords: 'cvsourceAM dependent voltage diamond', draw: (g) => { diamond(g, d7); signs(g, 0.7 * d7 - 0.117); } });
  P({ key: 'src:cisource-us', name: 'Controlled Current Source (American)', cat: 'src', kind: 'bipole', tikz: 'american controlled current source', w: 2 * d7,
    keywords: 'cisourceAM dependent current diamond arrow', draw: (g) => { diamond(g, d7); g.line(-0.7 * d7, 0, 0.7 * d7, 0); carrow(g, 0.5 * d7, 0); } });

  // waveform sources: symbol half-size u = r/2, rotated by sources/symbol/rotate = 90
  const u6 = r6 / 2;
  P({ key: 'src:vsource-sin', name: 'Sinewave Source', cat: 'src', kind: 'bipole', tikz: 'sinusoidal voltage source', w: 2 * r6,
    keywords: 'vsourcesin sV ac sine', draw: (g) => { g.circle(0, 0, r6); sine(g, u6); } });
  P({ key: 'src:vsource-square', name: 'Squarewave Source', cat: 'src', kind: 'bipole', tikz: 'square voltage source', w: 2 * r6,
    keywords: 'vsourcesquare sqV square pulse', draw: (g) => { g.circle(0, 0, r6); g.line(...rot([-u6, 0, -u6, u6, 0, u6, 0, -u6, u6, -u6, u6, 0])); } });
  P({ key: 'src:vsource-tri', name: 'Trianglewave Source', cat: 'src', kind: 'bipole', tikz: 'vsourcetri', w: 2 * r6,
    keywords: 'vsourcetri tV triangle', draw: (g) => { g.circle(0, 0, r6); g.line(...rot([-u6, 0, -0.5 * u6, 0.75 * u6, 0.5 * u6, -0.75 * u6, u6, 0])); } });

  P({ key: 'src:esource', name: 'Empty Voltage Source', cat: 'src', kind: 'bipole', tikz: 'esource', w: 2 * r6,
    keywords: 'esource empty circle', draw: (g) => g.circle(0, 0, r6) });
  P({ key: 'src:pvsource', name: 'Photovoltaic Voltage Source', cat: 'src', kind: 'bipole', tikz: 'pvsource', w: 2 * r6,
    keywords: 'pvsource solar pv', draw: (g) => {
      g.circle(0, 0, r6).line(0.15 * r6, 0, r6, 0).line(-0.15 * r6, 0, -r6, 0);
      g.line(-0.15 * r6, -0.4 * r6, -0.15 * r6, 0.4 * r6).line(0.15 * r6, -0.6 * r6, 0.15 * r6, 0.6 * r6);
      const a = pol(-45, 2.2 * r6), b = pol(-45, 1.3 * r6);
      g.arrow(a[0] - 0.3 * r6, a[1], b[0] - 0.3 * r6, b[1], 0.1, 0.04);
      g.arrow(a[0], a[1] + 0.3 * r6, b[0], b[1] + 0.3 * r6, 0.1, 0.04);
    } });
  P({ key: 'src:pvmodule', name: 'Photovoltaic Module Source', cat: 'src', kind: 'bipole', tikz: 'pvmodule', w: 1.2 * R,
    keywords: 'pvmodule solar panel pv', draw: (g) => {
      const x = 0.6 * R, y = r6;
      g.rect(-x, -y, x, y).line(x, y, 0.5 * x, 0, x, -y);
    } });

  // oo-style transformer source (oosourcetrans): height .36 → circle r 0.252, width .6 → half 0.42
  {
    const r = 0.18 * R, hw = 0.3 * R, c = hw - r, k = 0.70711 * r;
    P({ key: 'src:oosourcetrans', name: 'Transformer Source', cat: 'src', kind: 'bipole', tikz: 'oosourcetrans', w: 2 * hw,
      keywords: 'oosourcetrans oosource transformer two windings three phase',
      pins: { primup: [-c - k, k], primdown: [-c - k, -k], secup: [c + k, k], secdown: [c + k, -k] },
      draw: (g) => g.circle(-c, 0, r).circle(c, 0, r) });
  }
  // ooosource: three circles; sizes derived from width .564 / height .6 as in the source
  {
    const W = 0.564, H = 0.6, q = (2 * W) / H, s3 = Math.sqrt(3);
    const cs = (3 - s3 * q) / ((2 - s3) * q - 1), co = 1 - cs; // circle size, circle offset
    const up = (H * R) / 2, other = up / ((co * s3) / 2 + cs), dx = (co * other) / 4, rr = cs * other;
    const cP = [-co * other + dx, 0], cS = [co * other * 0.5 + dx, co * other * (s3 / 2)], cT = [cS[0], -cS[1]];
    const at = (c, a) => { const p = pol(a, rr); return [c[0] + p[0], c[1] + p[1]]; };
    const right = (co * 0.5 + Math.sqrt(Math.abs(cs * cs - Math.pow((co * s3) / 2, 2)))) * other + dx;
    const hw = (W * R) / 2;
    P({ key: 'src:ooosource', name: 'Three Winding Transformer', cat: 'src', kind: 'bipole', tikz: 'ooosource', w: 2 * hw,
      keywords: 'ooosource three winding transformer',
      pins: { prim1: at(cP, 135), prim2: at(cP, -135), sec1: at(cS, 0), sec2: at(cS, 45), sec3: at(cS, 90),
        tert1: at(cT, 0), tert2: at(cT, -45), tert3: at(cT, -90) },
      draw: (g) => {
        g.circle(cP[0], cP[1], rr).circle(cS[0], cS[1], rr).circle(cT[0], cT[1], rr);
        // circuitikz's `right` anchor is where the two right circles cross (x ≈ 0.30), inside the body box:
        // bridge it to the lead end at +w/2
        g.width(0.5).line(right, 0, hw, 0).width(1);
      } });
  }

  // nullator (ellipse .6 × .3) and norator (two circles joined by crossing lines)
  P({ key: 'src:nullator', name: 'Nullator', cat: 'src', kind: 'bipole', tikz: 'nullator', w: 0.6 * R,
    keywords: 'nullator nullor', draw: (g) => g.ellipse(0, 0, 0.3 * R, 0.15 * R) });
  {
    const up = 0.125 * R, hw = 0.3 * R, o = hw - up, a = Math.atan2(o, up) / D2R;
    P({ key: 'src:norator', name: 'Norator', cat: 'src', kind: 'bipole', tikz: 'norator', w: 2 * hw,
      keywords: 'norator nullor', draw: (g) => {
        g.arc(o, 0, up, up, 180 - a, -180 + a);
        g.arc(-o, 0, up, up, a, 360 - a, true);
        g.Z();
      } });
  }

  // ======================= Meters & devices =======================
  P({ key: 'meter:ammeter', name: 'Ammeter', cat: 'meter', kind: 'bipole', tikz: 'ammeter', w: 2 * r6, keywords: 'ammeter current meter',
    draw: (g) => legacyMeter(g, 'A') });
  P({ key: 'meter:voltmeter', name: 'Voltmeter', cat: 'meter', kind: 'bipole', tikz: 'voltmeter', w: 2 * r6, keywords: 'voltmeter voltage meter',
    draw: (g) => legacyMeter(g, 'V') });
  P({ key: 'meter:ohmmeter', name: 'Ohmmeter', cat: 'meter', kind: 'bipole', tikz: 'ohmmeter', w: 2 * r6, keywords: 'ohmmeter resistance meter',
    draw: (g) => legacyMeter(g, 'Ω') });
  P({ key: 'meter:galvanometer', name: 'Galvanometer', cat: 'meter', kind: 'bipole', tikz: 'rmeterwa', w: 2 * r6,
    keywords: 'rmeterwa round meter with arrow galvanometer', draw: (g) => {
      g.circle(0, 0, r6);
      // arrow (wire width) with a hole of radius .6r around the centre
      const ex = 0.8 * r6, ey = 1.2 * r6, L = Math.hypot(ex, ey), ux = ex / L, uy = ey / L, h = 0.6 * r6;
      g.width(0.5).line(-ex, -ey, -ux * h, -uy * h).arrow(ux * h, uy * h, ex, ey, 0.09, 0.035).width(1);
    } });
  P({ key: 'meter:lamp', name: 'Lamp', cat: 'meter', kind: 'bipole', tikz: 'lamp', w: 2 * r6, keywords: 'lamp light cross',
    draw: (g) => { const k = 0.7071 * r6; g.circle(0, 0, r6).line(-k, k, k, -k).line(-k, -k, k, k); } });
  {
    const hb = 0.4 * R; // bulb half-width 0.56
    const bulbBody = (g) => { g.width(0.5).line(-hb, 0, -0.8 * hb, 0).line(0.8 * hb, 0, hb, 0).width(1); g.circle(0, 0, 0.8 * hb); };
    P({ key: 'meter:bulb', name: 'Bulb', cat: 'meter', kind: 'bipole', tikz: 'bulb', w: 2 * hb, keywords: 'bulb lamp light filament',
      draw: (g) => { bulbBody(g); g.M(-0.8 * hb, 0).L(-0.4 * hb, 0); g.arc(0, 0, 0.4 * hb, 0.4 * hb, 180, 0, true).L(0.8 * hb, 0); } });
    P({ key: 'meter:wbulb', name: 'White Bulb', cat: 'meter', kind: 'bipole', tikz: 'wbulb', w: 2 * hb, keywords: 'wbulb wiggly bulb lamp light',
      draw: (g) => {
        bulbBody(g);
        const l = -hb, r = hb;
        g.M(0.8 * l, 0).C(0.5 * l, 0, 0.4 * l, 0.6 * l, 0, 0).C(0.2 * r, 0.2 * r, 0.2 * r, 0.6 * r, 0, 0.6 * r)
          .C(0.2 * l, 0.6 * r, 0.2 * l, 0.2 * r, 0, 0).C(0.4 * r, 0.6 * l, 0.5 * r, 0, 0.8 * r, 0);
      } });
  }
  P({ key: 'meter:neonlampcc', name: 'Neon Lamp (CC)', cat: 'meter', kind: 'bipole', tikz: 'neonlampcc', w: 2 * r6,
    keywords: 'neonlampcc neon lamp double cathode glow', draw: (g) => {
      g.circle(0, 0, r6);
      g.width(0.5).line(-r6, 0, -0.2 * r6, 0).line(r6, 0, 0.2 * r6, 0).width(1);
      g.line(0.2 * r6, -0.6 * r6, 0.2 * r6, 0.6 * r6).line(-0.2 * r6, -0.6 * r6, -0.2 * r6, 0.6 * r6);
      g.circle(-0.2 * r6 - 3 * NODE_R, -0.6 * r6 + 2 * NODE_R, NODE_R).ink();
    } });
  P({ key: 'meter:neonlampac', name: 'Neon Lamp (AC)', cat: 'meter', kind: 'bipole', tikz: 'neonlampac', w: 2 * r6,
    keywords: 'neonlampac neon lamp anode cathode glow', draw: (g) => {
      g.circle(0, 0, r6);
      g.width(0.5).line(-r6, 0, -0.5 * r6, 0).line(r6, 0, 0.5 * r6, 0).width(1);
      g.line(-0.5 * r6, -0.5 * r6, -0.5 * r6, 0.5 * r6);
      g.width(0.5).circle(0.5 * r6, 0, NODE_R).paper();
      g.circle(0, -0.5 * r6, NODE_R).ink().width(1);
    } });
  // thermocouple: up .25, down .6, width .14 (only the lower half is drawn)
  {
    const x = 0.07 * R, dn = -0.3 * R;
    P({ key: 'meter:thermocouple', name: 'Thermocouple', cat: 'meter', kind: 'bipole', tikz: 'thermocouple', w: 2 * x,
      keywords: 'thermocouple temperature sensor junction', draw: (g) => {
        g.width(0.5).line(-x, 0, -x, 0.5 * dn, 0, dn, x, 0.5 * dn, x, 0);
        g.width(1).line(-x, 0.5 * dn, 0, dn);
      } });
  }
  P({ key: 'meter:relais', name: 'Relais', cat: 'meter', kind: 'bipole', tikz: 'relais', w: 0.3 * R, keywords: 'relais relay coil',
    draw: (g) => { const x = 0.15 * R, y = 0.4 * R; g.rect(-x, -y, x, y).line(-x, y, x, -y); } });
  P({ key: 'meter:squid', name: 'Squid', cat: 'meter', kind: 'bipole', tikz: 'squid', w: 2 * r6, keywords: 'squid superconducting josephson',
    draw: (g) => {
      const x = 0.35 * r6;
      g.circle(0, 0, r6);
      for (const s of [1, -1]) g.line(-x, 1.35 * r6 * s, x, 0.65 * r6 * s).line(-x, 0.65 * r6 * s, x, 1.35 * r6 * s);
    } });

  // TV / radio blocks (twoport boxes; inner symbols at wire width)
  P({ key: 'meter:camera', name: 'Videocamera', cat: 'meter', kind: 'bipole', tikz: 'camera', w: 0.4 * R, keywords: 'camera video tv',
    draw: (g) => {
      const x = 0.2 * R, up = 0.6 * R, dn = -0.15 * R;
      g.rect(-x, dn, x, 0.7 * up).poly(-0.5 * x, 0.7 * up, -0.8 * x, up, 0.8 * x, up, 0.5 * x, 0.7 * up);
    } });
  {
    const box = (g, w, h) => g.rect((-w * R) / 2, (-h * R) / 2, (w * R) / 2, (h * R) / 2);
    P({ key: 'meter:tvset', name: 'Television (TV)', cat: 'meter', kind: 'bipole', tikz: 'tvset', w: 0.6 * R, keywords: 'tvset television tv',
      draw: (g) => {
        const s = 0.3 * R;
        box(g, 0.6, 0.4);
        g.width(1).line(0.6 * s, -1.1 * s, 0.3 * s, -0.7 * s).line(-0.6 * s, -1.1 * s, -0.3 * s, -0.7 * s);
      } });
    {
      const s = 0.5 * R, hw = 0.5 * R, hh = 0.2 * R;
      P({ key: 'meter:trx', name: 'Radio transceiver (HAM)', cat: 'meter', kind: 'bipole', tikz: 'trx', w: 1 * R,
        keywords: 'trx radio transceiver ham', pins: { plus: [-hw, hh - 0.2 * hw], minus: [-hw, -(hh - 0.2 * hw)] },
        draw: (g) => {
          box(g, 1, 0.4);
          g.width(0.5).circle(0.6 * s, 0, 0.25 * s).circle(0.68 * s, 0.1 * s, 0.06 * s)
            .circle(-0.8 * s, 0.15 * s, 0.1 * s).circle(-0.8 * s, -0.15 * s, 0.1 * s)
            .rect(-0.55 * s, -0.25 * s, 0.2 * s, 0.25 * s).width(1);
        } });
    }
    {
      const s = 0.3 * R;
      P({ key: 'meter:swr', name: 'SWR meter', cat: 'meter', kind: 'bipole', tikz: 'swr', w: 0.6 * R, keywords: 'swr standing wave ratio meter',
        draw: (g) => {
          box(g, 0.6, 0.4);
          // gray dashed scale arcs (drawn plain and thin here)
          const r = 1.1 * s, c = [-0.5 * s - r * Math.cos(160 * D2R), -0.25 * s - r * Math.sin(160 * D2R)];
          g.width(0.35).arc(c[0], c[1], r, r, 160, 110).arc(-c[0], c[1], r, r, 20, 70);
          g.width(0.5).poly(-0.7 * s, 0.5 * s, 0.7 * s, 0.5 * s, 0.7 * s, -0.2 * s, 0, -0.4 * s, -0.7 * s, -0.2 * s)
            .line(-0.35 * s, -0.3 * s, 0.3 * s, 0.3 * s).line(0.35 * s, -0.3 * s, -0.3 * s, 0.3 * s).width(1);
        } });
    }
    {
      const s = 0.5 * R, hw = 0.5 * R, hh = 0.2 * R, ay = hh - 0.2 * hw;
      P({ key: 'meter:power', name: 'Power Supply', cat: 'meter', kind: 'bipole', tikz: 'power', w: 1 * R,
        keywords: 'power supply bench psu', pins: { u1: [-hw, ay], u2: [-hw, -ay], plus: [0.75 * hw, ay], minus: [0.75 * hw, -ay] },
        draw: (g) => {
          box(g, 1, 0.4);
          g.width(0.5).rect(-0.5 * s, 0, -0.1 * s, 0.25 * s).rect(0, 0, 0.4 * s, 0.25 * s).circle(-0.3 * s, -0.2 * s, 0.075 * s)
            .rect(-0.9 * s, 0, -0.75 * s, 0.25 * s).line(-0.9 * s, 0.125 * s, -0.75 * s, 0.125 * s);
          g.circle(0.75 * s, 0.2 * s, 0.075 * s).ink().circle(0.75 * s, -0.2 * s, 0.075 * s).ink();
          g.line(0.5 * s, 0.2 * s, 0.6 * s, 0.2 * s).line(0.55 * s, 0.25 * s, 0.55 * s, 0.15 * s).line(0.5 * s, -0.2 * s, 0.6 * s, -0.2 * s).width(1);
        } });
    }
  }

  // square instruments: smeter / oscope .6 × .6 (half 0.42), corner radius .25 × half-height
  const sq = 0.42, sqIn = { 'in 1': [-0.4 * sq, -0.75 * sq], 'in 2': [0.4 * sq, -0.75 * sq] };
  P({ key: 'meter:smeter', name: 'Generic square meter', cat: 'meter', kind: 'bipole', tikz: 'smeter', w: 2 * sq,
    keywords: 'smeter square meter instrument', pins: sqIn, draw: (g) => {
      rrect(g, -sq, -sq, sq, sq, 0.25 * sq);
      meterWindow(g, -1.8 * sq, 2 * sq, 2.5 * sq, 105, 75, 105 - 0.8 * 30, 2.4 * sq);
    } });
  P({ key: 'meter:oscope', name: 'Oscilloscope', cat: 'meter', kind: 'bipole', tikz: 'oscope', w: 2 * sq,
    keywords: 'oscope oscilloscope scope', pins: sqIn, draw: (g) => {
      const st = 0.25 * sq * 0.995;
      rrect(g, -sq, -sq, sq, sq, 0.25 * sq);
      g.width(0.25);
      for (let i = -3; i <= 3; i++) g.line(i * st, -0.5 * sq, i * st, 0.5 * sq);
      for (let i = -2; i <= 2; i++) g.line(-0.75 * sq, i * st, 0.75 * sq, i * st);
      g.width(1).line(...[-0.75, -0.25, -0.05, 0.25, -0.05, -0.25, 0.65, 0.25, 0.65, -0.25].map((v) => v * sq));
    } });
  // qucs probes: height .8 (up 0.56), depth .4 (down -0.28), width .6 (half 0.42)
  {
    const up = 0.4 * R, dn = -0.2 * R, x = 0.3 * R, o = NODE_R;
    const qbody = (g) => {
      rrect(g, -x, dn, x, up, 0.25 * up);
      meterWindow(g, -1.7 * up, 2.1 * up, 2.5 * up, 103, 77, 103 - 0.8 * 26, 2.4 * up);
    };
    P({ key: 'meter:qiprobe', name: 'QUCS current probe', cat: 'meter', kind: 'bipole', tikz: 'qiprobe', w: 2 * x,
      keywords: 'qiprobe qucs current probe', draw: (g) => { qbody(g); g.width(0.5).line(-x, 0, x, 0).width(1); carrow(g, 0, 0); } });
    P({ key: 'meter:qvprobe', name: 'QUCS voltage probe', cat: 'meter', kind: 'bipole', tikz: 'qvprobe', w: 2 * x,
      keywords: 'qvprobe qucs voltage probe', draw: (g) => {
        qbody(g);
        const a = 0.6 * x;
        g.width(0.5).line(-x, 0, -a, 0).circle(-a + o, 0, o).line(a, 0, x, 0).circle(a - o, 0, o);
        g.width(1).line(-a + o, -1.5 * o, -a + o, -3.5 * o).line(-a, -2.5 * o, -a + 2 * o, -2.5 * o).line(a, -2.5 * o, a - 2 * o, -2.5 * o);
      } });
    P({ key: 'meter:qpprobe', name: 'QUCS power probe', cat: 'meter', kind: 'bipole', tikz: 'qpprobe', w: 2 * x,
      keywords: 'qpprobe qucs power probe', pins: { 'v+': [-0.6 * x, dn], 'v-': [0.6 * x, dn] }, draw: (g) => {
        qbody(g);
        const a = 0.6 * x;
        g.width(0.5).line(-x, 0, x, 0).width(1);
        carrow(g, 0, 0);
        g.width(0.5).circle(-a, -3 * o, o).line(-a, -4 * o, -a, dn).circle(a, -3 * o, o).line(a, -4 * o, a, dn);
        g.width(1).line(-a + 3 * o, -2 * o, -a + 3 * o, -4 * o).line(-a + 2 * o, -3 * o, -a + 4 * o, -3 * o).line(a - 4 * o, -3 * o, a - 2 * o, -3 * o);
      } });
  }
  // current loops: width .4 (half 0.28), height .6 (half 0.42); ellipse .4·half-w × .8·half-h, open on the left
  {
    const x = 0.2 * R, y = 0.3 * R, ex = 0.4 * x, ey = 0.8 * y;
    const gap = Math.asin((0.1 * y) / ey) / D2R; // clip: |y| < .1 half-h on the left half
    const wire = (g) => g.width(0.5).line(-x, 0, 0.3 * x, 0).line(0.5 * x, 0, x, 0);
    P({ key: 'meter:iloop', name: 'Current loop (symbolic)', cat: 'meter', kind: 'bipole', tikz: 'iloop', w: 2 * x,
      keywords: 'iloop current loop clamp probe', pins: { i: [0, y] }, draw: (g) => {
        g.arc(0, 0, ex, ey, 180 + gap, 540 - gap);
        wire(g).line(0, ey, 0, y).width(1);
      } });
    const pp = pol(105, ex, ey), pm = pol(75, ex, ey);
    P({ key: 'meter:iloop2', name: 'Current loop (real)', cat: 'meter', kind: 'bipole', tikz: 'iloop2', w: 2 * x,
      keywords: 'iloop2 current loop clamp probe', pins: { 'i+': [pp[0], y], 'i-': [pm[0], y] }, draw: (g) => {
        g.arc(0, 0, ex, ey, 105, 180 - gap).arc(0, 0, ex, ey, 180 + gap, 435);
        wire(g).line(pp[0], pp[1], pp[0], y).line(pm[0], pm[1], pm[0], y).width(1);
      } });
  }
  // current tap: .4 × .4 (half 0.28); arc and dot at wire width, dot filled
  {
    const h = 0.2 * R;
    P({ key: 'meter:currtap', name: 'Current tap', cat: 'meter', kind: 'bipole', tikz: 'currtap', w: 2 * h,
      keywords: 'currtap current tap probe', pins: { tap: [0, -0.5 * h] }, draw: (g) => {
        g.width(0.5).M(-h, 0).L(-0.95 * h, 0);
        g.arc(0, 0, 0.95 * h, 0.95 * h, 180, 0, true).L(h, 0);
        g.circle(0, 0, 0.5 * h).ink().width(1);
      } });
  }

  // seven segment display (bare7seg via `seven segment val`): width .4·Rlen, segments 4pt, gaps 0.2pt, box sep 1pt
  {
    const PT = 2.54 / 72.27, W = 0.4 * R, T = 4 * PT, G = 0.2 * PT, B = PT;
    const bx = W / 2 + T / 2 + B, by = W + T / 2 + B, h = W / 2, t = T / 2;
    // a thick line with Triangle Cap ends → hexagon
    const seg = (g, x1, y1, x2, y2) => {
      const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy * t, ny = ux * t;
      g.poly(x1 - ux * t, y1 - uy * t, x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 + ux * t, y2 + uy * t, x2 - nx, y2 - ny, x1 - nx, y1 - ny).ink();
    };
    P({ key: 'meter:sevenseg', name: 'Seven segment display', cat: 'meter', kind: 'node', tikz: 'seven segment val=8 dot none box on',
      keywords: 'seven segment display 7seg bare7seg digit led',
      pins: { a: [0, W], b: [h, W / 2], c: [h, -W / 2], d: [0, -W], e: [-h, -W / 2], f: [-h, W / 2], g: [0, 0] },
      draw: (g) => {
        g.rect(-bx, -by, bx, by);
        seg(g, -h + G, W, h - G, W); seg(g, h, W - G, h, G); seg(g, h, -G, h, -W + G); seg(g, h - G, -W, -h + G, -W);
        seg(g, -h, -W + G, -h, -G); seg(g, -h, G, -h, W - G); seg(g, -h + G, 0, h - G, 0);
      } });
  }

  // ======================= Electro-mechanical =======================
  // elmech (width .6, height .8) used as a path component (Telmech): the bar lies along the path.
  // circle r 0.42 filled white over a solid bar 1.12 × 0.42
  {
    const L = 0.4 * R, r = 0.3 * R, b = 0.15 * R;
    const elmech = (g, txt) => {
      g.rect(-L, -b, L, b).ink();
      g.circle(0, 0, r).paper();
      if (txt) g.text(0, 0, txt, 0.32);
    };
    P({ key: 'emech:motor', name: 'Motor', cat: 'emech', kind: 'bipole', tikz: 'Telmech=M', w: 2 * L, keywords: 'motor elmech electromechanical',
      draw: (g) => elmech(g, 'M') });
    P({ key: 'emech:generator', name: 'Generator', cat: 'emech', kind: 'bipole', tikz: 'Telmech=G', w: 2 * L, keywords: 'generator dynamo elmech electromechanical',
      draw: (g) => elmech(g, 'G') });
    P({ key: 'emech:elmech', name: 'Electro-mechanical', cat: 'emech', kind: 'bipole', tikz: 'Telmech=', w: 2 * L, keywords: 'elmech electromechanical device',
      draw: (g) => elmech(g, '') });
  }
})();
