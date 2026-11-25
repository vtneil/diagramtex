// circuitikz as LaTeX draws it (src/domain/circuit.ts, czimport.ts, and the Circuit block's place in the importer):
// the document's package options, labels at the document's size, siunitx labels, TeX's anchors (base, drain, up …),
// anchor=, the T<transistor> paths, TikZ's |- -| and calc, path coordinates and nodes, pictures that mix circuitikz with
// other TikZ, voltage arcs and line widths. The numbers are pdfLaTeX's (TeX Live, circuitikz 1.8), in cm, measured with
// \pgfpointanchor on named nodes and on a voltage's Vfrom/Vto/Vcont coordinates.
{
  const doc = (body, pkg = '', env = 'circuitikz') => `\\documentclass{standalone}\n\\usepackage${pkg ? `[${pkg}]` : ''}{circuitikz}\n\\begin{document}\n\\begin{${env}}\n${body}\n\\end{${env}}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const near = (a, b, msg, eps = 0.002) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const nearPt = (p, q, msg, eps = 0.002) => T.ok(p && Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps, `${msg}: ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));
  const block = (sh) => sh.find((s) => s.type === 'cz');
  const named = (items, name) => items.find((it) => it.name === name);

  T.test('circuitikz parity: package options are the block\'s settings, labels are at the document\'s size, siunitx labels', () => {
    const sh = shapesOf(doc('\\draw (0,0) to[R, l=560<\\ohm>] (2,0) to[L] (2,-2) to[V, v=5<\\volt>] (0,-2) -- (0,0);\n\\node[and port] at (4,0) {};', 'european, siunitx, RPvoltages'));
    const q = block(sh);
    T.ok(q, 'a Circuit block: ' + sh.map((s) => s.type));
    // circuitikz.sty: european = voltage, current, inductor, resistor and logic ports european; RPvoltages = voltage dir=RP
    T.ok(/\\ctikzset\{[^}]*resistor=european[^}]*logic ports=european[^}]*voltage dir=RP\}/.test(q.raw), 'the options as \\ctikzset: ' + q.raw);
    T.eq(q.items.filter((it) => it.p || it.part !== 'short').map((it) => it.part).join(' '), 'res:iec ind:european-inductor src:vsource-eu logic:eand', 'R, L and the port as European');
    T.eq(q.size, 'normalsize', 'labels in the surrounding font (10pt), not the block default');
    // \pgf@circ@handleSI: value<unit> is $\SI{value}{unit}$
    T.eq(q.items[0].l, '$\\SI{560}{\\ohm}$', 'siunitx label');
    T.eq(q.items.find((it) => it.part === 'src:vsource-eu').v, '$\\SI{5}{\\volt}$', 'siunitx voltage');
    // written back: the settings first, in the block's scope, so any document draws it the same
    const tex = TD.toTikz(sh, { standalone: true });
    T.ok(/\\ctikzset\{voltage=european/.test(tex) && /\\SI\{560\}\{\\ohm\}/.test(tex), 'exported with its settings:\n' + tex);
    T.tex('circuitikz-parity-options', tex);
    // option order is the package's (\ProcessOptions), not the one written; spaces are dropped
    const q2 = block(shapesOf(doc('\\draw (0,0) to[R] (2,0);', 'european resistors, american')));
    T.eq(q2.items[0].part, 'res:iec', 'americanresistors then europeanresistors: European');
  });

  T.test('circuitikz parity: voltage directions under RP and EF, fixed batteries', () => {
    // measured: to[R, v=] under voltage dir=RP has Vfrom (1.736,-0.112) and Vto (0.264,-0.112): below and backward
    const spot = (pkg, part) => {
      const q = block(shapesOf(doc(`\\draw (0,0) to[${part}, v=$u$] (2,0);`, pkg)));
      return { q, st: TD.cz.markStyle(q.raw) };
    };
    const svgOf = (q) => TD.cz.itemsSvg(q.items, (x, y) => [x * 100, -y * 100], 100, { st: { ...TD.cz.markStyle(q.raw), size: 'normalsize' } });
    const rp = spot('RPvoltages', 'R'), ef = spot('EFvoltages', 'R');
    T.eq([rp.st.vdir, ef.st.vdir], ['RP', 'EF'], 'the directions read');
    // the arc's arrowhead (its tip, the last path's first point) is at the start of the path under RP, at the end under EF
    const tipX = (q) => { const m = [...svgOf(q).matchAll(/<path d="M([\d.-]+),[\d.-]+L[^"]*Z" fill/g)]; return m.length ? +m[m.length - 1][1] : NaN; };
    T.ok(tipX(rp.q) < 100 && tipX(ef.q) > 100, `RP points back, EF forward: ${tipX(rp.q)} ${tipX(ef.q)}`);
    // pgfcircbipoles.tex: fixed batteries (RP, EF) swap the plates: the long one at the left end comes to the right
    const plates = (pkg) => { const q = block(shapesOf(doc('\\draw (0,0) to[battery1] (2,0);', pkg))); return svgOf(q); };
    T.ok(plates('RPvoltages') !== plates(''), 'the cell is mirrored under RP');
  });

  T.test('circuitikz parity: TeX\'s anchors, anchor=, T paths, |- -| and calc, path coordinates and nodes', () => {
    const P = (src) => TD.cz.parse(src);
    // npn: base = B (-0.84,0), collector = C (0,0.77); nmos: drain (0,0.77), gate (-0.98,0); nfet: B is the bulk (0,0)
    let r = P('\\draw (0,0) node[npn] (Q) {} (Q.base) -- ++(-1,0) coordinate (b) (Q.collector) -- (Q.collector |- b);\n\\node[nfet] (F) at (3,0) {};\n\\draw (F.B) -- (F.drain);');
    T.eq(r.raw.split('\n').filter((l) => !/^\\coordinate/.test(l)), [], 'all read: ' + r.raw);
    nearPt(r.items[1].a, [-0.84, 0], 'Q.base'); nearPt(r.items[1].b, [-1.84, 0], '++ from it');
    nearPt(r.items[2].b, [0, 0], '(Q.collector |- b)');
    nearPt(r.items.at(-1).a, [3, 0], 'nfet B is its bulk'); nearPt(r.items.at(-1).b, [3, 0.77], 'drain');
    // op amp up/down (-0.0833, ±0.539), in up = −; mixer 1..4 at ±0.49; not port in 1 = in (-0.7, 0)
    r = P('\\draw (0,0) node[op amp] (A) {} (A.up) -- ++(0,1) (A.in up) -- ++(-1,0);\n\\draw (5,0) node[mixer] (M) {} (M.4) -- ++(0,1);\n\\draw (8,0) node[not port] (N) {} (N.in 1) -- ++(-1,0);');
    nearPt(r.items[1].a, [-0.0833, 0.539], 'A.up'); nearPt(r.items[2].a, [-1.19, 0.49], 'A.in up');
    nearPt(r.items[4].a, [5, 0.49], 'M.4'); nearPt(r.items.at(-1).a, [7.3, 0], 'N.in 1');
    // anchor=: \path (5,0) node[npn, anchor=B](qb){} has qb.center (5.84,0) and qb.B (5,0)
    r = P('\\path (5,0) node[npn, anchor=B] (qb) {};\n\\draw (qb.E) -- ++(0,-1);');
    T.eq(r.items[0].anc, 'B', 'the anchor is held');
    nearPt(TD.cz.pinsOf(r.items[0]).B, [5, 0], 'B on the point'); nearPt(r.items[1].a, [5.84, -0.77], 'E from there');
    T.ok(/\[npn, anchor=B\] \(qb\) at \(5,0\)/.test(TD.cz.code(r.items, r.raw)), 'written back with it');
    T.eq(P('\\node[pnp, anchor=north] at (0,0) {};').items.length, 0, 'an anchor not measured for the part: kept');
    // compass anchors are the node's box: npn north (-0.42, 0.77), west (-0.84, 0)
    nearPt(TD.cz.anchorsOf(P('\\node[npn] (q) at (0,0) {};').items[0]).north, [-0.42, 0.77], 'npn north');
    T.eq(P('\\node[npn, right=of a] (q) {};').items.length, 0, 'positioning moves the part: kept');
    // to[Tnpn]: the transistor at the middle turned by the path's angle − 90, mirror flips it (measured centre (2,1),
    // B (1.16,1); mirrored B (10.84,1)), wired to its pathstart (0,−0.77) and pathend (0,0.77)
    r = P('\\draw (2,0) to[Tnpn, n=q2] (2,2);\n\\draw (10,0) to[Tnpn, n=q4, mirror] (10,2);');
    nearPt(r.items[0].p, [2, 1], 'q2 centre'); nearPt(TD.cz.pinsOf(r.items[0]).B, [1.16, 1], 'q2.B');
    nearPt(r.items[1].b, [2, 0.23], 'wired to its emitter'); nearPt(TD.cz.pinsOf(r.items[3]).B, [10.84, 1], 'q4.B mirrored');
    // calc, a path coordinate and an empty named node (its centre only: a path ends at a node's border)
    r = P('\\draw (0,0) to[R] (2,0) coordinate (x) node[] (n) {};\n\\draw ($(x)!0.5!(0,0)+(0,1)$) to[C] ($(n)+(1,0)$);\n\\draw (n) -- (4,0);');
    nearPt(r.items[1].a, [1, 1], '$(x)!.5!(0,0)+(0,1)$'); nearPt(r.items[1].b, [3, 0], 'an empty node\'s centre in calc');
    T.ok(/\\draw \(n\) -- \(4,0\);/.test(r.raw), 'a path from the bare node is kept: ' + r.raw);
    // \def without arguments is expanded; a label on a path coordinate is a text node on that side
    r = P('\\def\\Ba{0,.5}\n\\draw (\\Ba) to[R] ++(2,0) coordinate[label=left:$x$] (e);');
    nearPt(r.items[0].a, [0, 0.5], '\\Ba'); T.eq([r.items[1].part, r.items[1].opts], ['text', 'left'], 'the label');
  });

  T.test('circuitikz parity: a path piece the circuit can\'t hold is kept by itself; mixed pictures draw both', () => {
    let r = TD.cz.parse('\\draw (0,0) to[R, name=r] (2,0) coordinate[above=10pt of r] (top) node[fit=(r)(top), draw] {} to[C] (2,-2) to[short] (U.west);');
    T.eq(r.items.map((it) => it.part).join(' '), 'res:us cap:iec', 'what it holds');
    T.ok(r.raw.includes('\\draw (2,0) coordinate[above=10pt of r] (top);') && r.raw.includes('\\draw (2,0) node[fit=(r)(top), draw] {};') && r.raw.includes('\\draw (2,-2) to[short] (U.west);'), 'each piece from where the pen was: ' + r.raw);
    T.eq(TD.cz.parse('\\draw (0,0) to[R] (2,0) node[midway, fit=(a)] {};').items.length, 0, 'a node placed along the path needs it whole');
    // a picture with parts among other TikZ: the circuit is a block, the rest shapes that find its anchors
    const sh = shapesOf(doc('\\draw (0,0) node[npn] (Q) {};\n\\draw[->, red] (Q.B) -- ++(-1,0);\n\\node[draw] at (2,0) {box};', '', 'tikzpicture'));
    T.ok(block(sh) && block(sh).items.length === 1, 'the transistor: ' + sh.map((s) => s.type));
    const arrow = sh.find((s) => s.type === 'line');
    T.ok(arrow && Math.abs(arrow.x1 - -0.84 * TD.PX_PER_CM) < 0.5 && arrow.endTip, 'the arrow starts at Q.B: ' + JSON.stringify(sh.map((s) => [s.type, s.x1, s.y1])));
    T.ok(sh.some((s) => s.type === 'rect' || (s.type === 'text' && s.text === 'box')), 'the box drawn');
    T.eq(kept(sh), [], 'nothing kept');
    T.ok(sh.indexOf(block(sh)) === 0, 'the block where the circuit\'s first statement was');
    const tex = TD.toTikz(sh, { standalone: true });
    T.ok(/\\usepackage\{circuitikz\}/.test(tex) && /node\[npn\] \(Q\)/.test(tex), 'written with the circuit first:\n' + tex);
    T.tex('circuitikz-parity-mixed', tex);
    // positioning on parts (measured: right=of U1 with anchor=in 2 puts U2's centre at (2.54, 0.28); below=4 of an
    // op amp at (0,-5) at (0,-10.96); node distance=0.35cm and 2.5cm, below right=of g0.out at (4.04,-0.91))
    const pc = (src, name) => { const it = named(TD.cz.parse(src).items, name); return it && TD.cz.nodeXf(it)(0, 0); };
    nearPt(pc('\\node[and port] (U1) {}; \\node[xor port, right=of U1, anchor=in 2] (U2) {};', 'U2'), [2.54, 0.28], 'right=of');
    nearPt(pc('\\node[op amp] (A) at (0,-5) {}; \\node[op amp, below=4 of A] (B) {};', 'B'), [0, -10.96], 'below=4 of');
    nearPt(pc('\\node[op amp] (A) at (0,-5) {}; \\node[op amp, below right=1cm of A.out] (D) {};', 'D'), [3.0871, -6.6871], 'one length on the diagonal');
    nearPt(pc('\\begin{circuitikz}[node distance=0.35cm and 2.5cm] \\node[and port] (g0) {}; \\node[xor port, below right=of g0.out] (g1) {}; \\end{circuitikz}', 'g1'), [4.04, -0.91], 'the picture\'s node distance');
  });

  T.test('circuitikz parity: European voltage arcs and line widths as circuitikz draws them', () => {
    // to[X, v^>=$v$] (0,0)--(2,0): Vfrom, Vcont1 (x, y) measured
    const arc = (part, from, cx, cy) => {
      const it = TD.cz.parse(`\\draw (0,0) to[${part}, v^>=$v$] (2,0);`).items[0], A = TD.cz.voltageArc(it);
      near(A.p0[0] + 1, from, part + ' arc start'); near(-A.c1[0], 1 - cx, part + ' control x'); near(-A.c1[1], cy, part + ' control height');
    };
    arc('R', 0.26375, 0.87389, 0.4585); arc('european resistor', 0.22849, 0.83185, 0.574); arc('C', 0.47374, 0.769, 0.74684);
    arc('L', 0.33374, 0.87389, 0.4585); arc('D', 0.40375, 0.78981, 0.6895); arc('cC', 0.47374, 0.66121, 1.0431); arc('fuse', 0.36874, 0.91592, 0.34299);
    // wires the path's width, bodies twice it (bipoles/thickness 2); the picture's line width=1pt, a \draw's thick
    const q = block(shapesOf(doc('\\draw (0,0) to[R] (2,0);\n\\draw[thick] (0,-1) -- (2,-1);').replace('\\begin{circuitikz}', '\\begin{circuitikz}[line width=1pt]')));
    const widths = TD.cz.itemsSvg(q.items, (x, y) => [x * 100, -y * 100], 100, { st: TD.cz.markStyle(q.raw) }).match(/stroke-width="[\d.]+"/g).map((w) => +w.slice(14, -1));
    const px = (pt) => +(pt / TD.PT_PER_PX / TD.PX_PER_CM * 100).toFixed(2);
    T.ok(widths.includes(px(1)) && widths.includes(px(2)) && widths.includes(px(0.8)), `1pt wires, 2pt body, 0.8pt thick wire: ${widths}`);
  });
  T.test('circuitikz parity: a part\'s text at its centre with anchor=, the picture font, cuts that would move relative steps', () => {
    // \node[op amp, anchor=+] (A) at (0,0) {A1}: A.center is (1.19, 0.49), where TeX sets the text
    const r = TD.cz.parse('\\node[op amp, anchor=+] (A) at (0,0) {A1};');
    const m = /translate\(([\d.-]+),([\d.-]+)\) scale/.exec(TD.cz.itemsSvg(r.items, (x, y) => [x * 100, -y * 100], 100, { st: { size: 'normalsize', font: 'default' } }));
    nearPt(m && [+m[1] / 100, -m[2] / 100], [1.19, 0.49], 'the text at the centre', 0.01);
    // font=\small on the picture sets the labels' size, in a whole circuit and in a split one
    T.eq(block(shapesOf(doc('\\draw (0,0) to[R, l=$R$] (2,0);').replace('\\begin{circuitikz}', '\\begin{circuitikz}[font=\\small]'))).size, 'small', 'circuitikz[font=\\small]');
    T.eq(block(shapesOf(doc('\\draw (0,0) node[npn] (Q) {};\n\\draw[->] (Q.B) -- ++(-1,0);', '', 'tikzpicture').replace('\\begin{tikzpicture}', '\\begin{tikzpicture}[font=\\small]'))).size, 'small', 'a split picture');
    // after +(1,0) the pen is at (3,0) but relative steps still count from (2,0): such a path is kept whole
    let p = TD.cz.parse('\\draw (0,0) to[R] (2,0) +(1,0) to[foo] +(0,1);');
    T.eq([p.items.length, p.raw], [0, '\\draw (0,0) to[R] (2,0) +(1,0) to[foo] +(0,1);'], 'kept whole');
    p = TD.cz.parse('\\draw (0,0) to[R] (2,0) to[foo] ++(0,1);');
    T.eq([p.items.length, p.raw], [1, '\\draw (2,0) to[foo] ++(0,1);'], 'from (2,0) a cut keeps its steps');
  });
  T.test('circuitikz parity: an inverted T path\'s poles, a \\draw\'s voltage dir, every node\'s font, coordinates that draw', () => {
    // \draw (0,0) to[Tnpn, invert, *-o] (0,4): the filled pole is drawn at (0,0), where the path starts, the open one at (0,4)
    const r = TD.cz.parse('\\draw (0,0) to[Tnpn, invert, *-o] (0,4);');
    const poleAt = (q) => { for (const w of r.items.filter((it) => it.part === 'short')) { const m = /^([*o]?)-([*o]?)$/.exec(w.poles || '-'); if (TD.cz.same(w.a, q) && m[1]) return m[1]; if (TD.cz.same(w.b, q) && m[2]) return m[2]; } return ''; };
    T.eq([poleAt([0, 0]), poleAt([0, 4])], ['*', 'o'], 'poles where the path starts and ends');
    // pgfcircvoltage.tex: v= reads the direction set when it is read; \draw[voltage dir=RP] and an earlier voltage dir=
    // point R's voltage back (as RPvoltages does), one after v= is kept as code
    const tip = (src) => {
      const q = TD.cz.parse(src), svg = TD.cz.itemsSvg(q.items, (x, y) => [x * 100, -y * 100], 100, { st: { ...TD.cz.markStyle(q.raw), size: 'normalsize' } });
      const m = [...svg.matchAll(/<path d="M([\d.-]+),[\d.-]+L[^"]*Z" fill/g)];
      return m.length ? +m[m.length - 1][1] : NaN;
    };
    T.ok(tip('\\draw[voltage dir=RP] (0,0) to[R, v=$u$] (2,0);') < 100 && tip('\\draw (0,0) to[R, voltage dir=RP, v=$u$] (2,0);') < 100, 'RP from the \\draw and before v=');
    T.ok(tip('\\draw (0,0) to[R, v=$u$] (2,0);') > 100, 'forward by default');
    T.eq(TD.cz.parse('\\draw (0,0) to[R, v=$u$, voltage dir=RP] (2,0);').items.length, 0, 'voltage dir after v=: kept');
    // the labels take every node's font (measured: the picture is 21.909bp high with \tiny, 26.094bp without), not a style's
    const sized = (opt, pre = '') => block(shapesOf(doc(pre + '\\draw (0,0) to[R, l=MMMMMMMMMM] (4,0);').replace('\\begin{circuitikz}', `\\begin{circuitikz}${opt}`))).size;
    T.eq([sized('[every node/.style={font=\\tiny}]'), sized('', '\\tikzset{foo/.style={font=\\tiny}}\n')], ['tiny', 'normalsize'], 'every node, a style of its own');
    // a coordinate with a label draws it: the picture is not wholly the circuit's
    const sh = shapesOf(doc('\\draw (0,0) to[R] (2,0);\n\\coordinate[label=above:$x$] (a) at (1,1);', '', 'tikzpicture'));
    T.ok(block(sh) && !/label=/.test(block(sh).raw) && sh.length > 1, 'the label is drawn by the picture: ' + sh.map((s) => s.type));
    // on grid measures between centres (not read: kept); a braced node distance is the same distance
    T.eq(TD.cz.parse('\\node[and port] (U1) {}; \\node[xor port, right=of U1, on grid] (U2) {};').items.length, 1, 'on grid: kept');
    T.eq(TD.cz.parse('\\begin{circuitikz}[on grid] \\node[and port] (U1) {}; \\node[xor port, right=of U1] (U2) {}; \\end{circuitikz}').items.length, 1, 'the picture on grid: kept');
    const g1 = named(TD.cz.parse('\\begin{circuitikz}[node distance={0.35cm and 2.5cm}] \\node[and port] (g0) {}; \\node[xor port, below right=of g0.out] (g1) {}; \\end{circuitikz}').items, 'g1');
    nearPt(g1 && TD.cz.nodeXf(g1)(0, 0), [4.04, -0.91], 'node distance={…}');
  });
}
