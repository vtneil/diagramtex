// Chemistry: \chemmove names on bare atoms, shifted coordinates, a size for the whole drawing and \kern between compounds.
{
  const build = (src) => TD.chem.build(src);

  T.test('chemistry names: @{name} on a bare atom is known to \\chemmove', () => {
    const r = build('\\chemfig{Cl-[4]@{a0}(=[:120]O)-[:-120]Cl}\\chemmove{\\draw(a0)..controls +(90:5mm) and +(90:5mm)..(a0);}');
    T.eq(r.warnings, [], 'no warnings');
    T.eq(r.moves.length, 1, 'the arrow is drawn');
    const v = r.verts.find((x) => x.label === '@{a0}');
    T.ok(v, 'the named carbon is a vertex');
    const p = r.moves[0].segs.pts[0];
    T.ok(Math.hypot(p[0] - v.X, p[1] - v.Y) < 1, `the arrow starts on the carbon (${p} vs ${v.X},${v.Y})`);
  });

  T.test('chemistry names: ([xshift=…]name.anchor) moves the point', () => {
    const a = build('\\chemfig{@{o}O-C}\\chemmove{\\draw(o.315)--(o.east);}');
    const b = build('\\chemfig{@{o}O-C}\\chemmove{\\draw([xshift=-1.5mm,yshift=1mm]o.315)--(o.east);}');
    T.eq(b.warnings, [], 'no warnings');
    const p = a.moves[0].segs.pts[0], q = b.moves[0].segs.pts[0], mm = TD.PX_PER_CM / 10;
    T.ok(Math.abs(q[0] - (p[0] - 1.5 * mm)) < 0.01 && Math.abs(q[1] - (p[1] - mm)) < 0.01, `shifted left and up (${p} → ${q})`);
  });

  T.test('chemistry size: \\scriptsize sets the drawing in 7pt and is not printed', () => {
    const n = build('\\chemfig{A-B}'), s = build('\\scriptsize\\chemfig{A-B}');
    T.eq(s.warnings, [], 'no warnings');
    T.ok(!s.texts.some((t) => /scriptsize/.test(t.t)), 'the command is not printed');
    // its em is cmr7's own, 7.97pt (pdfLaTeX's \fontdimen6), not 7: the atoms 3em apart are 0.797 as far apart
    const gap = (L) => L.verts[1].X - L.verts[0].X;
    T.ok(Math.abs(gap(s) / gap(n) - 0.797) < 0.005, `the atoms 3em of cmr7 apart (${gap(s)} / ${gap(n)})`);
    T.ok(s.bb.w < n.bb.w * 0.82, 'and the drawing smaller');
    T.eq(build('\\chemfig{A-B}').bb.w, n.bb.w, 'the size does not leak into the next drawing');
  });

  T.test('chemistry spacing: \\kern and \\quad between compounds are space, not text', () => {
    const src = (k) => `\\schemestart\\chemfig{A-B-C}${k}\\arrow\\chemfig{B}\\schemestop`;
    const a = build(src('')), b = build(src('\\kern-1em ')), c = build(src('\\quad '));
    T.ok(![...b.texts, ...c.texts].some((t) => /kern|quad/.test(t.t)), 'nothing printed');
    const em = TD.chem.EM, x = (r) => r.arrows[0].x1;
    T.ok(Math.abs(x(a) - x(b) - em) < 0.01, `\\kern-1em starts the arrow 1em earlier (${x(a)} → ${x(b)}, em ${em})`);
    T.ok(Math.abs(x(c) - x(a) - em) < 0.01, `\\quad starts it 1em later (${x(a)} → ${x(c)})`);
  });
}

// Schemes: \tikzset compound styles (delimiters, inner sep, shifts), arrow options after a % line end, -U> arcs,
// shorten on arrows, @{names} inside arrow labels and {\tiny …} as text in its own size.
{
  const build = (src) => TD.chem.build(src);
  const S = (body) => `\\schemestart ${body}\\schemestop`;

  T.test('chemistry scheme: \\tikzset styles draw delimiters and grow the compound', () => {
    const tz = '\\tikzset{ob/.style={left delimiter={[},inner sep=3pt},cb/.style={right delimiter={]},inner sep=3pt}}';
    const a = build(S('\\chemfig{A}\\arrow\\chemfig{B}\\arrow\\chemfig{C}'));
    const b = build(tz + S('\\chemfig{A}\\arrow(--[ob])\\chemfig{B}\\arrow(--[cb])\\chemfig{C}'));
    T.eq(b.warnings, [], 'no warnings');
    T.ok(!b.texts.some((t) => /tikzset/.test(t.t)), '\\tikzset is not printed');
    T.eq(b.paths.length - a.paths.length, 2, 'two brackets drawn');
    const pt = 1 / TD.PT_PER_PX;
    T.ok(Math.abs(b.comps[1].box.w - a.comps[1].box.w - 6 * pt) < 0.01, 'inner sep=3pt on both sides');
  });

  T.test('chemistry scheme: [xshift/yshift] in a compound style moves it', () => {
    const a = build(S('\\chemfig{A}\\arrow\\chemfig{B}')), b = build(S('\\chemfig{A}\\arrow(--[yshift=-5pt])\\chemfig{B}'));
    T.eq(b.warnings, [], 'no warnings');
    T.ok(Math.abs(b.comps[1].box.y - a.comps[1].box.y - 5 / TD.PT_PER_PX) < 0.01, 'moved 5pt down');
  });

  T.test('chemistry scheme: arrow options after a % line end belong to the arrow', () => {
    const r = build(S('\\chemfig{A}\\arrow{->}%\n    [,1.5]\\chemfig{B}'));
    T.ok(!r.texts.some((t) => /1\.5/.test(t.t)), 'the options are not printed');
    const q = build(S('\\chemfig{A}\\arrow{->}[,1.5]\\chemfig{B}'));
    T.eq(r.arrows[0].x2, q.arrows[0].x2, 'same arrow as written on one line');
  });

  T.test('chemistry scheme: -U> draws its arcs, labels at their ends, and shorten trims each path', () => {
    const r = build(S('\\chemfig{A}\\arrow{-U>[x][y][][.25]}[,1.5]\\chemfig{B}'));
    T.eq(r.warnings, [], 'no warnings');
    const arcs = r.arrows[0].prim.filter((p) => p.pts);
    T.eq(arcs.length, 2, 'two arcs');
    T.eq(arcs.map((p) => p.head), [null, 'end'], 'the one ahead has the tip');
    const ends = arcs.map((p) => p.q2), labs = r.arrows[0].labs;
    for (let j = 0; j < 2; j++) T.ok(Math.abs(labs[j].bx - ends[j][0]) < 0.5 && labs[j].by < ends[j][1], `label ${j} above its arc's end`);
    const s = build(S('\\chemfig{A}\\arrow{-U>[x][y][][.25]}[,1.5,shorten >=6pt]\\chemfig{B}'));
    const pt = 1 / TD.PT_PER_PX, a0 = r.arrows[0].prim[0], a1 = s.arrows[0].prim[0];
    T.ok(Math.abs(a0.q2[0] - a1.q2[0] - 6 * pt) < 0.01, 'the line ends 6pt earlier');
    const L = (p) => p.pts.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - p.pts[i][0], q[1] - p.pts[i][1]), 0);
    T.ok(Math.abs(L(arcs[1]) - L(s.arrows[0].prim.filter((p) => p.pts)[1]) - 6 * pt) < 0.05, 'the arc is 6pt shorter');
  });

  T.test('chemistry scheme: @{name} in an arrow label is where the label is drawn', () => {
    const r = build(S('\\chemfig{@{a}A}\\arrow{->[*{0}\\scriptsize\\chemfig{@{b}O}]}\\chemfig{B}') + '\\chemmove{\\draw(b)--(a);}');
    T.eq(r.warnings, [], 'no warnings');
    const lab = r.arrows[0].labs[0], start = r.moves[0].segs.pts[0];
    T.ok(Math.abs(start[0] - lab.bx) < lab.bw && Math.abs(start[1] - lab.by) < lab.bh, `the arrow starts at the label (${start} vs ${lab.bx},${lab.by})`);
  });

  T.test('chemistry scheme: {\\tiny text} is text in its size, not the size of the drawing', () => {
    const n = build(S('\\chemfig{A-B}\\arrow\\chemfig{C}')), r = build(S('\\chemfig{A-B}\\arrow\\chemfig{C}\\arrow{0}{\\tiny protolysis}'));
    T.eq(r.warnings, [], 'no warnings');
    T.eq(r.verts[0].X - r.verts[1].X, n.verts[0].X - n.verts[1].X, 'the molecules keep 10pt');
    const t = r.texts.find((x) => /protolysis/.test(x.t));
    T.ok(t && !/tiny/.test(t.t) && t.st && Math.abs(t.st.size - 5 / TD.PT_PER_PX) < 1e-9, 'the text is 5pt and prints no command');
  });
  T.test('chemistry names: a ring that opens with an atom, *6(R\\rlap{$\'$}-N…), starts on that atom', () => {
    const r = build("\\chemfig{*6(R\\rlap{$'$}-N=(-R)-OH)}");
    T.eq(r.warnings, [], 'no warnings');
    const v = r.verts.find((x) => x.label === "R\\rlap{$'$}"), n = r.verts.find((x) => x.label === 'N');
    T.ok(v && n, 'R′ and N are vertices');
    T.eq(r.bonds.length, 4, 'four bonds: R′–N, N=C, C–R, C–O');
    T.ok(Math.abs(r.bonds[0].X0) < 20 && r.bonds[0].angle === 330, `the first bond leaves R′ down to N (${r.bonds[0].X0}, ${r.bonds[0].angle})`);
    const t = r.texts.find((x) => /R/.test(x.t) && /lap/.test(x.t));
    T.ok(t && /\\mathrlap\{'\}/.test(t.t) && !/\$'\$/.test(t.t), `\\rlap{$'$} is set as \\mathrlap ({t && t.t})`);
  });

  T.test('chemistry names: \\subscheme[90] is settings for chemfig, not an angle', () => {
    const r = build('\\schemestart\\chemfig{A}\\arrow\\subscheme[90]{\\chemfig{B}\\arrow\\chemfig{C}}\\schemestop');
    T.eq(r.warnings, [], 'no warnings');
    const y = ['A', 'B', 'C'].map((l) => r.verts.find((v) => v.label === l).Y);
    T.ok(Math.abs(y[0] - y[1]) < 0.01 && Math.abs(y[1] - y[2]) < 0.01, `all on one line (${y})`);
  });

  T.test('chemistry names: \\chemabove text overhangs the box; \\chemleft centres on the contents', () => {
    const a = build('\\chemfig{N}'), b = build('\\chemfig{\\chemabove{N}{\\scriptstyle\\oplus}}');
    T.ok(Math.abs(a.bb.h - b.bb.h) < 0.01 && Math.abs(a.bb.y - b.bb.y) < 0.01, `the same box as N alone (${a.bb.h} vs ${b.bb.h})`);
    const r = build('\\chemleft[\\chemfig{N}\\chemright]');
    const ys = [...r.paths.map((p) => p.d).join(' ').matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((m) => +m[1]);
    const top = Math.min(...ys), bot = Math.max(...ys), ax = 2.5 / TD.PT_PER_PX;
    const nb = r.verts[0], mid = nb.Y;
    T.ok(Math.abs((top + bot) / 2 - mid) < 0.6, `centred on N (${(top + bot) / 2} vs ${mid})`);
    T.ok(bot - top > 2 * ax, 'taller than the axis gap');
  });
}
