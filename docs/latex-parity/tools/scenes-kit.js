// Named test figures for the parity harness (load after harness.js and scenes.js). KIT[name]() returns the
// shapes; KIT_OPT[name] holds options for P.run. PARITY.md scores the figures listed in its table.
var KIT = {}, KIT_OPT = {};
KIT.lines = () => SC.lines(); KIT.shapes = () => SC.shapes(); KIT.text = () => SC.text(); KIT.labels = () => SC.labels();
KIT.pie = () => SC.pie();
for (const p of ['function', 'line', 'scatter', 'area', 'bar', 'contour', 'heatmap', 'param3d', 'curve3d', 'function3d', 'surface3d', 'mesh3d', 'scatter3d'])
  KIT['plot_' + p] = () => SC.plot(p);
for (const [n, t] of [['blk_qc', 'qc'], ['blk_cd', 'cd'], ['blk_forest', 'forest'], ['blk_cz', 'cz'], ['blk_zx', 'zx'], ['blk_feynman', 'feynman'],
  ['blk_bloch', 'bloch'], ['blk_timing', 'timing'], ['blk_kmap', 'kmap'], ['blk_automata', 'automata'], ['blk_geo3d', 'geo3d'], ['blk_chem', 'chemfig']])
  KIT[n] = () => SC.block(t);
KIT.sym_basic = () => SC.syms(['basic', 'rect']); KIT.sym_flow = () => SC.syms(['flow', 'arrow']);
KIT.sym_elec = () => SC.syms(['misc', 'elec', 'wave']); KIT.sym_phys = () => SC.syms(['mech', 'optics']);
// tip_* (worker 6): every tip at a given line width in pt, four per row
for (const [nm, lwpt] of [['w04', 0.4], ['w1', 1], ['w2', 2]])
  KIT['tip_' + nm] = () => { const K = 72.27 / 2.54 / 40, w = lwpt / K, L = [];
    TD.TIPS.map((t) => t[0]).filter((t) => t !== 'none').forEach((t, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      L.push(P.mk('line', 'line', { x1: col * 120, y1: row * 30, x2: col * 120 + 90, y2: row * 30, endTip: t, width: w }));
    }); return L; };
// op_* (worker 6): translucent shapes; bl_* bloch; pat_* patterns
KIT.op_shapes = () => [
  P.mk('rect', 'rect', { x: 0, y: 0, w: 80, h: 50, fill: '#1f77b4', stroke: '#d62728', width: 6, opacity: 0.5 }),
  P.mk('ellipse', 'ellipse', { cx: 150, cy: 25, rx: 40, ry: 25, fill: '#2ca02c', stroke: '#000000', width: 4, opacity: 0.4 }),
  P.mk('line', 'line', { x1: 0, y1: 90, x2: 120, y2: 90, endTip: 'latex', startTip: 'stealth', width: 4, stroke: '#1e5bd6', opacity: 0.5 }),
  P.mk('line', 'line', { x1: 0, y1: 120, x2: 120, y2: 120, shaft: 'ticks', endTip: 'to', width: 2, stroke: '#d62728', opacity: 0.5 }),
  P.mk('curve', 'curve', { x1: 160, y1: 90, cx1: 190, cy1: 60, cx2: 220, cy2: 130, x2: 250, y2: 100, endTip: 'latex', width: 4, stroke: '#9467bd', opacity: 0.5 }),
];
KIT.tip_ticks = () => [
  P.mk('line', 'line', { x1: 0, y1: 0, x2: 150, y2: 0, shaft: 'ticks', endTip: 'stealth', width: 1 }),
  P.mk('line', 'line', { x1: 0, y1: 30, x2: 147, y2: 30, shaft: 'ticks', startTip: 'latex', endTip: 'to', width: 1 }),
  P.mk('line', 'line', { x1: 0, y1: 60, x2: 150, y2: 60, shaft: 'ticks', width: 1 }),
  P.mk('curve', 'curve', { x1: 0, y1: 100, cx1: 40, cy1: 70, cx2: 90, cy2: 130, x2: 150, y2: 100, shaft: 'ticks', endTip: 'latex', width: 1 }),
];
KIT.pat_all =() => { const L = []; (TD.PATTERNS || []).forEach((p, i) => { const k = Array.isArray(p) ? p[0] : (p.id || p); L.push(P.mk('rect', 'rect', { x: (i % 5) * 80, y: Math.floor(i / 5) * 80, w: 60, h: 60, stroke: '#000000', width: 1, fill: { p: k, color: '#1f77b4', size: 16, lw: 1.5 } })); }); return L; };

// ---- worker 3: circuit / automata scenes
const czScene = (src) => () => { const s = SC.block('cz'); const r = TD.cz.parse(src); s[0].items = r.items; s[0].raw = r.raw; return s; };
KIT.cz_a = czScene(`\\draw (0,0) to[european resistor, l=$R_1$] (3,0);
\\draw (0,2) to[european resistor, l_=$R_2$] (3,2);
\\draw (0,4) to[capacitor, l=$C_1$, a=$a$] (3,4);
\\draw (0,6) to[cute inductor, l_=$L_1$] (3,6);
\\draw (4,0) to[european resistor, l=$R_3$] (4,3);
\\draw (6,0) to[european resistor, l_=$R_4$] (6,3);
\\draw (8,3) to[capacitor, l=$C_2$] (8,0);
\\draw (10,3) to[cute inductor, l_=$L_2$] (10,0);
\\draw (4,5) to[D*, l=$D_1$] (7,5);
\\draw (8,5) to[european voltage source, l=$V_s$] (8,8);
\\draw (10,5) to[battery1, l_=$E$] (10,8);`);
KIT.cz_b = czScene(`\\draw (0,0) to[european resistor, v=$u$] (3,0);
\\draw (0,2) to[european resistor, i=$i$] (3,2);
\\draw (0,4) to[capacitor, v_=$u_C$] (3,4);
\\draw (0,6) to[cute inductor, i_=$i_L$] (3,6);
\\draw (4,0) to[european resistor, v=$u$] (4,3);
\\draw (6,0) to[european resistor, i=$i$] (6,3);
\\draw (8,3) to[capacitor, l=$C$, v=$u$] (8,0);
\\draw (10,3) to[cute inductor, l=$L$, i=$i$] (10,0);
\\draw (0,8) to[european resistor, l=$R$, v=$u$, i=$i$] (3,8);`);
KIT.cz_c = czScene(`\\node[ground] at (0,0) {};
\\node[vcc] at (2,0) {$V_{cc}$};
\\node[npn] at (5,0) {};
\\node[pnp] at (8,0) {};
\\node[op amp] at (3,4) {};
\\node[nmos] at (7,4) {};
\\node[pmos] at (10,4) {};`);
KIT.cz_d = czScene(`\\draw (0,0) to[short, *-] (2,0) to[european resistor, l=$R$] (2,3) to[short] (0,3);
\\draw (4,0) to[ospst, l=$S$] (7,0);
\\draw (4,2) to[american voltage source, l=$V$] (4,5);
\\draw (6,2) to[american current source, l_=$I$] (6,5);
\\draw (8,2) to[cute inductor, l=$L$] (8,5);
\\draw (9,2) to[american resistor, l=$R$] (9,5);
\\draw (0,5) to[leD*, l=$D$] (3,5);
\\draw (0,7) to[zD*, l_=$Z$] (3,7);
\\draw (4,7) to[ammeter] (7,7);
\\draw (8,7) to[lamp, l=$L$] (11,7);`);
KIT.fsm_a = () => { const s = SC.block('automata'); s[0].src = `\\begin{tikzpicture}[->, >=Stealth, shorten >=1pt, auto, node distance=2.5cm, semithick]
  \\node[state, initial] (q0) at (0,0) {$q_0$};
  \\node[state] (q1) at (2.5,0) {$q_1$};
  \\node[state, accepting] (q2) at (5,0) {$q_2$};
  \\node[state] (q3) at (2.5,-2.5) {$q_3$};
  \\path (q0) edge node {$a$} (q1)
        (q1) edge [loop above] node {$b$} ()
        (q1) edge [bend left] node {$a$} (q2)
        (q2) edge [bend left] node {$b$} (q1)
        (q0) edge [bend right] node[swap] {$c$} (q3)
        (q3) edge [loop below] node {$d$} ()
        (q3) edge [loop left] node {$e$} ()
        (q2) edge [loop right] node {$f$} ()
        (q3) edge node {$g$} (q2);
\\end{tikzpicture}`; return s; };
KIT.fsm_b = () => { const s = SC.block('automata'); s[0].src = `\\begin{tikzpicture}[->, >=Stealth, auto, node distance=2.5cm, semithick]
  \\node[state, initial, initial text=start] (a) {$s_0$};
  \\node[state, accepting] (b) [right of=a] {$s_1$};
  \\node[state, initial above] (c) [below of=a] {$s_2$};
  \\node[state, initial left, accepting] (d) [below of=b] {longer};
  \\path (a) edge node {$0$} (b)
        (b) edge [bend left] node {$1$} (a)
        (a) edge node {$0,1$} (c)
        (c) edge node {$x$} (d)
        (d) edge node[swap] {$y$} (b)
        (b) edge [loop right] node {$z$} ();
\\end{tikzpicture}`; return s; };
const forestScene = (src) => () => { const s = SC.block('forest'); s[0].src = src; return s; };
const FW = (body, pre = '') => `\\begin{forest}\n${pre ? `  ${pre}\n` : ''}${body}\n\\end{forest}`;
KIT.forest_syntax = forestScene(FW("  [S\n    [NP [D [the]] [N [cat]]]\n    [VP [V [sat]] [PP [P [on]] [NP [the mat, roof]]]]\n  ]"));
KIT.forest_org = forestScene(FW('  [Director\n    [Design [UX] [Brand]]\n    [Engineering [Web] [Mobile] [Data]]\n    [Sales [EMEA] [APAC]]\n  ]', 'forked edges, for tree={draw, rounded corners, fill=black!4, align=center}'));
KIT.forest_dir = forestScene(FW('  [project/\n    [src/ [main.tex] [figures.tex]]\n    [figures/ [plot.pdf]]\n    [README.md]\n  ]', "for tree={folder, grow'=0, font=\\ttfamily}"));
KIT.forest_decision = forestScene(FW('  [{$x_1 \\le 3$?}\n    [{$x_2 \\le 1$?}, edge label={node[midway, left]{yes}}\n      [A, ellipse] [B, ellipse]]\n    [C, ellipse, edge label={node[midway, right]{no}}]\n  ]', 'for tree={draw, edge={->}, s sep=8mm, l sep=8mm}'));
KIT.forest_binary = forestScene(FW('  [8\n    [3 [1] [6 [4] [7]]]\n    [10 [, phantom] [14 [13] [, phantom]]]\n  ]', 'for tree={circle, draw, minimum size=2em}'));
KIT.forest_prob = forestScene(FW('  [, circle, fill=black, inner sep=1.5pt\n    [$H$ [$HH$] [$HT$]]\n    [$T$ [$TH$] [$TT$]]\n  ]', "grow'=0, for tree={l=18mm, s sep=3mm}"));
for (const z of ['small', 'normalsize', 'Large']) KIT['forest_sz_' + z] = () => { const s = forestScene(FW('  [Root [Branch [Leaf] [Leaf]] [Branch [Leaf]]]', 'for tree={draw, rounded corners}'))(); s[0].size = z; return s; };
for (const z of ['0pt', '10pt', '30pt']) KIT['forest_ls_' + z] = () => { const s = forestScene(FW('  [Root [Branch [Leaf] [Leaf]] [Branch [Leaf]]]', 'for tree={draw, l sep=' + z + ', s sep=' + z + '}'))(); s[0].size = 'normalsize'; return s; };
KIT.forest_nd = forestScene(FW('  [S [NP [D] [N]] [VP]]'));
KIT.forest_nd2 = forestScene(FW('  [S [NP [D] [N]] [VP]]', 'for tree={draw}'));
KIT.forest_east = forestScene(FW('  [Root [alpha [x] [y]] [beta] [gamma [z]]]', 'for tree={draw, grow=east}'));
KIT.forest_north = forestScene(FW('  [Root [alpha [x] [y]] [beta] [gamma [z]]]', 'for tree={draw, rounded corners, grow=north}'));
KIT.forest_deep = forestScene(FW('  [A [B [C [D [E]]]] [F [G]]]', 'for tree={draw}'));
KIT.forest_wide = forestScene(FW('  [Root [alpha] [beta] [gamma] [delta] [epsilon] [zeta]]', 'for tree={draw}'));
KIT.forest_unbal = forestScene(FW('  [Root [a [b [c] [d]] [e]] [f] [g [h]]]', 'for tree={draw, rounded corners}'));

// ---- worker 4: timing and K-map extras (tm_*, km_*)
{
  const TM = (src) => () => SC.block('timing', { src });
  const KM = (src) => () => SC.block('kmap', { src });
  KIT.tm_opts = TM(String.raw`\begin{tikztimingtable}[timing/rowdist=2, timing/coldist=2, timing/slope=0.4]
  clk & 6{c} \\
  data & 2z 3D{x1} 2U 1x \\
  en & l 2h 3l 2h 1t \\
  q & 2D{a} 2z 3d{ab} 1l \\
\extracode
  \tablegrid
\end{tikztimingtable}`);
  KIT.tm_many = TM(String.raw`\begin{tikztimingtable}
  A & 4L 4H 4L \\
  B & 3H 2L 3H 2L 2H \\
  Cc & 2L 3D{v} 4D{w} 3L \\
  Dd & 3Z 4M 3X 2U \\
  Ee & 12G \\
  Ff & 3{HL} 3{LH} \\
  Gg & 4H 4S 4L \\
\extracode
  \vertlines[gray]{2,4,8}
  \horlines{1,3,5}
  \draw [<->] (2,-1) -- node [below] {$t$} (4,-1);
\end{tikztimingtable}`);
  KIT.tm_big = TM(String.raw`\begin{tikztimingtable}[timing/rowdist=4, timing/coldist=0.5]
  X & 2L 4H 2L \\
  Longer name & 3D{abc} 3D{de} 2L \\
\extracode
  \fulltablegrid
  \draw [->] (1,-2) -- node [right] {\footnotesize x} (3,-5);
\end{tikztimingtable}`);
  const K = (hdr, body) => KM(`\\begin{karnaugh-map}${hdr}\n${body}\n\\end{karnaugh-map}`);
  KIT.km_2 = K('[2][2][1][$B$][$A$]', '  \\minterms{1,3}\n  \\implicant{1}{3}');
  KIT.km_3a = K('[4][2][1][$C$][$B$][$A$]', '  \\minterms{0,1,3,5,7}\n  \\indeterminants{2}\n  \\implicant{1}{3}\n  \\implicantedge{0}{4}{2}{6}');
  KIT.km_3b = K('[2][4][1][$C$][$B$][$A$]', '  \\maxterms{1,2,4}\n  \\implicant{0}{2}\n  \\implicantedge{0}{4}{2}{6}');
  KIT.km_4 = K('[4][4][1][$D$][$C$][$B$][$A$]', '  \\minterms{0,2,5,7,8,10,13,15}\n  \\indeterminants{1,3}\n  \\autoterms[0]\n  \\implicant{5}{15}\n  \\implicant{0}{2}\n  \\implicantedge{0}{2}{8}{10}\n  \\implicantcorner');
  KIT.km_4b = K('[4][4][1][$D$][$C$][$B$][$A$]', '  \\terms{0,1,2,3}{1}\n  \\minterms{4,6,12,14}\n  \\implicant{4}{14}\n  \\implicant{0}{1}\n  \\implicant{12}{8}');
  KIT.km_5 = K('[4][4][2][$E$][$D$][$C$][$B$][$A$]', '  \\minterms{0,1,2,17,19,21,31}\n  \\implicant{1}{3}\n  \\implicant{1}{3}[1]');
  KIT.km_6 = K('[4][4][4][$F$][$E$][$D$][$C$][$B$][$A$]', '  \\minterms{0,1,2,17,19,21,31,50,60}\n  \\implicant{1}{3}\n  \\implicant{1}{3}[1,2]');
}
KIT.cz_h1 = czScene(`\\draw (0,0) to[european resistor, l=$R$, a=$a$] (3,0);`);
KIT.cz_v1 = czScene(`\\draw (0,0) to[european resistor, v=$u$] (3,0);`);
KIT.cz_i1 = czScene(`\\draw (0,0) to[european resistor, i=$i$] (3,0);`);
KIT.cz_vv = czScene(`\\draw (0,0) to[european resistor, l=$R$, a=$a$, v=$u$] (0,3);`);
KIT.cz_v2 = czScene(`\\draw (0,0) to[european resistor, v_=$u$] (3,0);`);
KIT.cz_i2 = czScene(`\\draw (0,0) to[european resistor, i_=$i$] (3,0);`);
KIT.cz_l2 = czScene(`\\draw (0,0) to[european resistor, l_=$R$, a_=$a$] (3,0);`);
KIT.cz_v3 = czScene(`\\draw (0,0) to[capacitor, v=$u$] (3,0);`);
KIT.cz_v4 = czScene(`\\draw (0,0) to[european resistor, v=$u$] (0,3);`);
KIT.cz_i4 = czScene(`\\draw (0,0) to[european resistor, i=$i$] (0,3);`);
// voltage and current forms, voltage styles, colour and the path syntax (relative coordinates, corners)
KIT.cz_vup = czScene(`\\draw (0,0) to[european resistor, v^=$u$] (3,0);
\\draw (0,2) to[european resistor, v<=$u$] (3,2);
\\draw (0,4) to[capacitor, v^<=$u$] (3,4);`);
KIT.cz_vst = czScene(`\\draw (0,0) to[european resistor, straight voltages, v=$u$] (3,0);
\\draw (0,2) to[european resistor, straight voltages, v^<=$u$] (3,2);
\\draw (0,4) to[capacitor, straight voltages, v=$u$] (3,4);`);
KIT.cz_vam = czScene(`\\draw (0,0) to[european resistor, american voltages, v=$u$] (3,0);
\\draw (0,2) to[european resistor, american voltages, v^<=$u$] (3,2);
\\draw (0,4) to[capacitor, american voltages, v=$u$] (3,4);`);
KIT.cz_vra = czScene(`\\draw (0,0) to[european resistor, raised voltages, v=$u$] (3,0);
\\draw (0,2) to[european resistor, raised voltages, v^=$u$] (3,2);`);
KIT.cz_vset = czScene(`\\ctikzset{voltage=american}
\\draw (0,0) to[european resistor, v=$u$] (3,0);
\\draw (0,2) to[capacitor, v<=$u$] (3,2);`);
KIT.cz_vsrc = czScene(`\\draw (0,0) to[european voltage source, v=$E$] (3,0);
\\draw (0,2.5) to[european current source, v=$u$] (3,2.5);
\\draw (0,5) to[european voltage source, american voltages, v=$E$] (3,5);
\\draw (0,7.5) to[european voltage source, v_<=$E$] (3,7.5);`);
KIT.cz_idir = czScene(`\\draw (0,0) to[european resistor, i<=$i$] (3,0);
\\draw (0,1.5) to[european resistor, i>_=$i$] (3,1.5);
\\draw (0,3) to[european resistor, i_<=$i$] (3,3);
\\draw (0,4.5) to[european resistor, i<^=$i$] (3,4.5);
\\draw (0,6) to[european voltage source, i=$i$] (3,6);`);
KIT.cz_color = czScene(`\\draw (0,0) to[european resistor, color=red, l=$R$, v=$u$] (3,0);
\\draw (0,2) to[capacitor, blue!70!black, i=$i$] (3,2);`);
KIT.cz_path = czScene(`\\coordinate (A) at (0,3);
\\draw (0,0) to[european resistor] ++(3,0) |- (A) -- (0,0);
\\draw (4,0) -| (6,2) to[capacitor] +(0,-2);`);
// generated parts (scripts/cz-extract.py): every family, as pdflatex draws it
KIT.czg_amp1 = czScene(`\\node[en amp] at (0,0) {};
\\node[fd op amp] at (4,0) {};
\\node[gm amp] at (8,0) {};
\\node[inst amp] at (12,0) {};
\\node[fd inst amp] at (0,-4) {};
\\node[inst amp ra] at (4,-4) {};
\\node[plain amp] at (8,-4) {};
\\node[plain mono amp] at (12,-4) {};
\\node[plain gm mono amp] at (0,-8) {};
\\node[buffer] at (4,-8) {};`);
KIT.czg_logic1 = czScene(`\\node[ieeestd and port] at (0,0) {};
\\node[ieeestd nand port] at (4,0) {};
\\node[ieeestd or port] at (8,0) {};
\\node[ieeestd nor port] at (12,0) {};
\\node[ieeestd xor port] at (0,-4) {};
\\node[ieeestd xnor port] at (4,-4) {};
\\node[ieeestd buffer port] at (8,-4) {};
\\node[ieeestd not port] at (12,-4) {};
\\node[ieeestd schmitt port] at (0,-8) {};
\\node[ieeestd invschmitt port] at (4,-8) {};
\\node[ieee tgate] at (8,-8) {};
\\node[ieee double tgate] at (12,-8) {};`);
KIT.czg_logic2 = czScene(`\\node[notcirc] at (0,0) {};
\\node[schmitt symbol] at (4,0) {};`);
KIT.czg_mosd1 = czScene(`\\node[nmosd] at (0,0) {};
\\node[pmosd] at (4,0) {};
\\node[nfetd] at (8,0) {};
\\node[pfetd] at (12,0) {};
\\node[nigfetd] at (0,-4) {};
\\node[pigfetd] at (4,-4) {};
\\node[nigfetebulk] at (8,-4) {};
\\node[pigfetebulk] at (12,-4) {};`);
KIT.czg_src1 = czScene(`\\draw (-1,0) to[sinusoidal current source] (1,0);
\\draw (3,0) to[controlled sinusoidal voltage source] (5,0);
\\draw (7,0) to[controlled sinusoidal current source] (9,0);
\\draw (11,0) to[ioosource] (13,0);
\\draw (-1,-4) to[voosource] (1,-4);
\\draw (3,-4) to[dcvsource] (5,-4);
\\draw (7,-4) to[dcisource] (9,-4);
\\draw (11,-4) to[rmeter] (13,-4);
\\draw (-1,-8) to[tlmic] (1,-8);`);
KIT.czg_ind1 = czScene(`\\draw (-1,0) to[american inductor] (1,0);
\\draw (3,0) to[variable american inductor] (5,0);
\\draw (7,0) to[american inductive sensor] (9,0);
\\draw (11,0) to[european inductor] (13,0);
\\draw (-1,-4) to[variable european inductor] (1,-4);
\\draw (3,-4) to[european inductive sensor] (5,-4);
\\draw (7,-4) to[cute inductive sensor] (9,-4);
\\draw (11,-4) to[generic] (13,-4);
\\draw (-1,-8) to[tgeneric] (1,-8);
\\draw (3,-8) to[thermistor] (5,-8);`);
KIT.czg_dio1 = czScene(`\\draw (-1,0) to[empty diode] (1,0);
\\draw (3,0) to[empty Schottky diode] (5,0);
\\draw (7,0) to[empty Zener diode] (9,0);
\\draw (11,0) to[empty tunnel diode] (13,0);
\\draw (-1,-4) to[empty photodiode] (1,-4);
\\draw (3,-4) to[empty led] (5,-4);
\\draw (7,-4) to[empty varcap] (9,-4);
\\draw (11,-4) to[full ZZener diode] (13,-4);
\\draw (-1,-8) to[full laser diode] (1,-8);
\\draw (3,-8) to[full TVS diode] (5,-8);
\\draw (7,-8) to[full Shockley diode] (9,-8);
\\draw (11,-8) to[full bidirectionaldiode] (13,-8);`);
KIT.czg_dio2 = czScene(`\\draw (-1,0) to[full triac] (1,0);
\\draw (3,0) to[full thyristor] (5,0);
\\draw (7,0) to[full put] (9,0);
\\draw (11,0) to[full gto] (13,0);
\\draw (-1,-4) to[full gtobar] (1,-4);
\\draw (3,-4) to[full agtobar] (5,-4);
\\draw (7,-4) to[stroke diode] (9,-4);
\\draw (11,-4) to[stroke Schottky diode] (13,-4);
\\draw (-1,-8) to[stroke Zener diode] (1,-8);
\\draw (3,-8) to[stroke ZZener diode] (5,-8);
\\draw (7,-8) to[stroke tunnel diode] (9,-8);
\\draw (11,-8) to[stroke photodiode] (13,-8);`);
KIT.czg_dio3 = czScene(`\\draw (-1,0) to[stroke led] (1,0);
\\draw (3,0) to[stroke laser diode] (5,0);
\\draw (7,0) to[stroke varcap] (9,0);
\\draw (11,0) to[stroke triac] (13,0);
\\draw (-1,-4) to[stroke thyristor] (1,-4);
\\draw (3,-4) to[stroke put] (5,-4);
\\draw (7,-4) to[stroke gto] (9,-4);
\\draw (11,-4) to[stroke gtobar] (13,-4);
\\draw (-1,-8) to[stroke agtobar] (1,-8);`);
KIT.czg_wire1 = czScene(`\\node[jump crossing] at (0,0) {};
\\node[plain crossing] at (4,0) {};
\\node[currarrow] at (8,0) {};
\\node[inputarrow] at (12,0) {};
\\node[trarrow] at (0,-4) {};
\\node[flowarrow] at (4,-4) {};
\\node[diamondpole] at (8,-4) {};
\\node[odiamondpole] at (12,-4) {};
\\node[squarepole] at (0,-8) {};
\\node[osquarepole] at (4,-8) {};
\\draw (7,-8) to[iecconn] (9,-8);
\\node[iecplugL] at (12,-8) {};`);
KIT.czg_wire2 = czScene(`\\node[iecplugR] at (0,0) {};
\\node[iecsocketL] at (4,0) {};
\\node[iecsocketR] at (8,0) {};
\\draw (11,0) to[multiwire] (13,0);
\\draw (-1,-4) to[bmultiwire] (1,-4);
\\draw (3,-4) to[tmultiwire] (5,-4);
\\node[tlground] at (8,-4) {};
\\node[rground] at (12,-4) {};
\\node[tground] at (0,-8) {};`);
KIT.czg_sw1 = czScene(`\\node[cute spdt up] at (0,0) {};
\\node[cute spdt mid] at (4,0) {};
\\node[cute spdt down] at (8,0) {};
\\node[cute spdt up arrow] at (12,0) {};
\\node[cute spdt mid arrow] at (0,-4) {};
\\node[cute spdt down arrow] at (4,-4) {};
\\node[proximeter] at (8,-4) {};
\\draw (11,-4) to[ncs] (13,-4);
\\draw (-1,-8) to[oncs] (1,-8);
\\draw (3,-8) to[cncs] (5,-8);
\\draw (7,-8) to[onos] (9,-8);
\\draw (11,-8) to[cnos] (13,-8);`);
KIT.czg_sw2 = czScene(`\\draw (-1,0) to[cute closed switch] (1,0);
\\draw (3,0) to[cute open switch] (5,0);
\\draw (7,0) to[cute closing switch] (9,0);
\\draw (11,0) to[cute opening switch] (13,0);`);
KIT.czg_tube1 = czScene(`\\node[diodetube] at (0,0) {};
\\node[triode] at (4,0) {};
\\node[tetrode] at (8,0) {};
\\node[pentode] at (12,0) {};
\\node[pentode suppressor to cathode] at (0,-4) {};
\\node[magnetron] at (4,-4) {};
\\node[dynode] at (8,-4) {};`);
KIT.czg_rf1 = czScene(`\\node[antenna] at (0,0) {};
\\node[rxantenna] at (4,0) {};
\\node[txantenna] at (8,0) {};
\\node[bareRXantenna] at (12,0) {};
\\node[bareTXantenna] at (0,-4) {};
\\node[harmonics] at (4,-4) {};
\\node[match] at (8,-4) {};
\\node[mixer] at (12,-4) {};
\\node[adder] at (0,-8) {};
\\node[oscillator] at (4,-8) {};
\\draw (7,-8) to[vco] (9,-8);
\\node[circulator] at (12,-8) {};`);
KIT.czg_rf2 = czScene(`\\node[wilkinson] at (0,0) {};
\\node[splitter] at (4,0) {};
\\node[genericsplitter] at (8,0) {};
\\node[gridnode] at (12,0) {};
\\node[mzm] at (0,-4) {};
\\node[fourport] at (4,-4) {};
\\node[coupler] at (8,-4) {};
\\node[coupler2] at (12,-4) {};
\\node[double bipole] at (0,-8) {};`);

// ---- qc_*/cd_* scenes (worker 1)
const qcS = (src, o) => () => SC.block('qc', Object.assign({ src }, o || {}));
KIT.qc_long = qcS('\\begin{quantikz}\n\\lstick{$q_0$} & \\gate{H} & \\gate{X} & \\ctrl{1} & \\gate{Z} & \\meter{} & \\qw \\\\\n\\lstick{$q_1$} & \\gate{Y} & \\qw & \\targ{} & \\gate{R_x(\\theta)} & \\qw & \\qw\n\\end{quantikz}');
KIT.qc_multi = qcS('\\begin{quantikz}\n\\lstick{$q_0$} & \\gate[3]{U} & \\ctrl{1} & \\qw & \\rstick{out} \\\\\n\\lstick{$q_1$} & & \\ctrl{1} & \\swap{1} & \\qw \\\\\n\\lstick{$q_2$} & & \\targ{} & \\targX{} & \\qw\n\\end{quantikz}');
KIT.qc_group = qcS('\\begin{quantikz}\n\\lstick{$\\ket{0}$} & \\gate{H} & \\ctrl{1} & \\gategroup[2,steps=2,style={dashed,rounded corners,inner xsep=2pt},label style={label position=below}]{grp} \\slice{A} & \\meter{} & \\qw \\\\\n\\lstick{$\\ket{0}$} & \\qw & \\targ{} & \\gate{X} & \\meter{} & \\cw\n\\end{quantikz}');
KIT.qc_cw = qcS('\\begin{quantikz}\n\\lstick{$\\ket{\\psi}$} & \\gate{H} & \\meter{} & \\cw & \\cw \\\\\n\\lstick{$\\ket{0}$} & \\qw & \\qw & \\gate{X} & \\meter{} \\\\\n\\lstick[2]{$\\ket{00}$} & \\gate{A} & \\qw & \\phase{\\pi} & \\qw \\\\\n & \\qw & \\octrl{-1} & \\qw & \\qw\n\\end{quantikz}');
KIT.qc_small = qcS('\\begin{quantikz}\n\\lstick{$\\ket{0}$} & \\gate{H} & \\ctrl{1} & \\meter{} \\\\\n\\lstick{$\\ket{0}$} & \\qw & \\targ{} & \\meter{}\n\\end{quantikz}', { size: 'small' });
KIT.qc_large = qcS('\\begin{quantikz}\n\\lstick{$\\ket{0}$} & \\gate{H} & \\ctrl{1} & \\meter{} \\\\\n\\lstick{$\\ket{0}$} & \\qw & \\targ{} & \\meter{}\n\\end{quantikz}', { size: 'Large' });
KIT.cz_e = czScene(`\\node[ground] at (0,0) {$G$};
\\node[nground] at (2,0) {$N$};
\\node[pground] at (4,0) {$P$};
\\node[cground] at (6,0) {$C$};
\\node[sground] at (8,0) {$S$};
\\node[eground] at (10,0) {$E$};
\\node[vcc] at (0,3) {$V_{cc}$};
\\node[vee] at (3,3) {$V_{ee}$};
\\node[npn] at (6,3) {$Q_1$};
\\node[nmos] at (9,3) {$M$};
\\node[op amp] at (13,3) {$A$};`);

// plt_* (worker 5): plot variants
KIT.plt_legend_sw = () => SC.plot("line", { legendPos: "south west" });
KIT.plt_legend_se = () => SC.plot("function", { legendPos: "south east", axisLines: "box" });
KIT.plt_middle_line = () => SC.plot("line", { axisLines: "middle", grid: false });

const cdS = (src, o) => () => SC.block('cd', Object.assign({ src }, o || {}));
KIT.cd_long = cdS('\\begin{tikzcd}\n  0 \\arrow[r] & A \\arrow[r, "\\alpha"] \\arrow[d, "f"\'] & B \\arrow[r, "\\beta"\'] \\arrow[d, "g"] & C \\arrow[r] \\arrow[d, "h"] & 0 \\\\\n  0 \\arrow[r] & A\' \\arrow[r, "\\alpha\'"\'] & B\' \\arrow[r, "\\beta\'"] & C\' \\arrow[r] & 0\n\\end{tikzcd}');
KIT.cd_bend = cdS('\\begin{tikzcd}\n  X \\arrow[r, bend left=40, "f"] \\arrow[r, bend right, "g"\'] & Y \\arrow[d, shift left=2, "p"] \\arrow[d, shift right=2, "q"\'] \\\\\n  Z \\arrow[ru, dashed, "r"] & W \\arrow[l, hook\', "i" description]\n\\end{tikzcd}');
KIT.cd_tips = cdS('\\begin{tikzcd}[row sep=large, column sep=large]\n  G \\arrow[r, two heads] \\arrow[d, tail] & H \\arrow[d, Rightarrow] \\\\\n  K \\arrow[r, "\\phi" above, mapsto] & L \\arrow[u, equal, "e" near start]\n\\end{tikzcd}');
KIT.cd_big = cdS('\\begin{tikzcd}[row sep=2cm, column sep=3cm]\n  \Z[x] \\arrow[r, "\\mathrm{ev}_0", "\\sim"\'] & Z \\\\\n  \\prod_i A_i \\arrow[u] \\arrow[r, "\\pi_1" pos=0.3] & A_1\n\\end{tikzcd}');
KIT.cd_lab = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r, "f"] & B\n\\end{tikzcd}' });
KIT.cd_labb = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r, "f"\'] & B\n\\end{tikzcd}' });
KIT.cd_nolab = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r] & B\n\\end{tikzcd}' });
KIT.cd_vlab = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[d, "g"] \\\\ C\n\\end{tikzcd}' });
KIT.cd_vlabb = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[d, "g"\'] \\\\ C\n\\end{tikzcd}' });
// the older 3D figures of PARITY.md, rebuilt from presets
KIT.prim3d_a = () => SC.fig3d('prim3d', ['box', 'cylinder', 'cone', 'frustum']);
KIT.prim3d_b = () => SC.fig3d('prim3d', ['sphere', 'prism', 'pyramid', 'swedge']);
KIT.solid = () => SC.fig3d('solid', ['region', 'wedge', 'columns']);
KIT.revolve = () => SC.fig3d('revolve', ['disk', 'washer', 'shell']);

// ---- xy_* : xymatrix blocks
const xyS = (src) => () => SC.block('xy', { src });
KIT.blk_xy = () => SC.block('xy');
KIT.xy_long = xyS('\\xymatrix{ 0 \\ar[r] & A \\ar[r]^{\\alpha} \\ar[d]_{f} & B \\ar[r]_{\\beta} \\ar[d]^{g} & C \\ar[r] \\ar[d]^{h} & 0 \\\\ 0 \\ar[r] & A\' \\ar[r]_{\\alpha\'} & B\' \\ar[r]^{\\beta\'} & C\' \\ar[r] & 0 }');
KIT.xy_tips = xyS('\\xymatrix@R=3pc@C=3pc{ G \\ar@{->>}[r] \\ar@{>->}[d] & H \\ar@{=>}[d] \\\\ K \\ar@{|->}[r]^{\\phi} & L \\ar@{=}[u]^(.2){e} }');
KIT.xy_bend = xyS('\\xymatrix{ X \\ar@/^/[r]^{f} \\ar@/_1pc/[r]_{g} & Y \\ar@<.5ex>[d]^{p} \\ar@<-.5ex>[d]_{q} \\\\ Z \\ar@{-->}[ur]^{r} & W \\ar@{_{(}->}[l]|{i} }');
KIT.xy_lab = xyS('\\xymatrix{ A \\ar[r]^{f} & B }');
KIT.xy_nolab = xyS('\\xymatrix{ A \\ar[r] & B }');
KIT.xy_vlab = xyS('\\xymatrix{ A \\ar[d]^{g} \\\\ C }');
KIT.cd_hook = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r, hook] & B \\arrow[d, hook] \\\\ C & D \\arrow[l, hook\']\n\\end{tikzcd}' });
KIT.xy_hook = xyS('\\xymatrix{ A \\ar@{^{(}->}[r] & B \\ar@{^{(}->}[d] \\\\ C & D \\ar@{_{(}->}[l] }');
KIT.xy_curves = xyS('\\xymatrix@C=4pc{ A \\ar@/^/[r] \\ar@/_/[r] & B \\ar@/^1pc/[r] \\ar@/_2pc/[r] & C }');
KIT.cd_hook2 = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r, hook\'] & B \\arrow[d, hook\'] \\\\ C & D \\arrow[l, hook]\n\\end{tikzcd}' });
KIT.cd_hookl = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r, hookleftarrow] & B \\arrow[d, hookrightarrow] \\\\ & D\n\\end{tikzcd}' });
KIT.xy_mix = xyS('\\xymatrix@C=3pc{ A \\ar[r]^{f} \\ar@{^{(}->}[d]_{g} \\ar@/^1.5pc/[rr]^{h} & B \\ar@{->>}[d]^(.3){p} \\ar@<.5ex>[r] \\ar@<-.5ex>[r]_{q} & C \\\\ D \\ar@{=>}[r] & E \\ar@{-->}[ur] \\ar@{}[r]|{\\circ} & F \\ar@{|->}[u] }');
KIT.xy_sep = xyS('\\xymatrix@R=1pc@C=4pc{ A \\ar[r] \\ar[d] & B \\ar[d] \\\\ C \\ar[r] & D }');

// ---- routes: xy turns, tikz-cd to paths, from=
KIT.xy_turn = xyS("\\xymatrix{\n& H^{k+1}(M) \\ar[r]^<<<<<<<<<<<{i^*} & \\cdots \\\\\n& H^k(M) \\ar[r]^>>>>>{i^*} \n& H^k(U) \\oplus H^k(V) \\ar[r]^>>>>>{j^*} \n& H^k(U \\cap V) \\ar `[ul] `[l] `[lllu] |{d^*} `[l] [rlllu] \\\\\n&  *{}  & \\cdots \\ar[r]^<<<<<<<<<<{j^*} \n& H^{k-1}(U \\cap V) \\ar `[ul] `[l] `[lllu] |{d^*} `[l] [rlllu] }");
KIT.cd_topath = () => SC.block('cd', { src: "\\tikzset{\ncurarrow/.style={\nrounded corners=8pt,\nexecute at begin to={every node/.style={fill=red}},\nto path={-- ([xshift=50pt]\\tikztostart.center)\n  |- (#1) node[fill=white] {$\\scriptstyle d^*$}\n  -| ([xshift=-40pt]\\tikztotarget.center)\n  -- (\\tikztotarget)}\n  }\n}\n\\begin{tikzcd}[cells={nodes={text height=2ex,text depth=0.75ex}}]\n  {} & & H^{k+1}(M) \\arrow{r}{i^*} & \\cdots \\\\\n  {} & & H^k(M) \\arrow{r}{i^*} & H^k(U) \\oplus H^k(V) \\arrow{r}{j^*}\n  \\arrow[draw=none]{u}[name=Y, shape=coordinate]{}\n  \\arrow[draw=none]{d}[name=Z,shape=coordinate]{}\n  & H^k(U \\cap V) \\arrow[curarrow=Y]{ull}{} \\\\\n  & & & \\cdots \\arrow{r}{j^*} & H^{k-1}(U \\cap V)\n  \\arrow[curarrow=Z]{ull}{} \\\\\n\\end{tikzcd}" });
KIT.cd_from = () => SC.block('cd', { src: "\\begin{tikzcd}\n%first row\nA \\ar[rr] \\ar[dd] \n& \n& B \\ar[dd] \\ar[dr] \\ar[from=ddll,bend left=30]\n& \n\\\\\n%second row\n& E \\ar[rr] \\ar[dd] \\ar[from=ul,crossing over]\n& \n& F \\ar[dd]\n\\\\\n%third row\nC \\ar[rr] \\ar[dr] \n& \n& D \\ar[dr]\n& \n\\\\\n%forth row\n& G \\ar[rr] \\ar[from=uurr,bend left=30,crossing over]\n& \n& H\n\\end{tikzcd}" });
KIT.cd_trail = () => SC.block('cd', { src: '\\begin{tikzcd}\n A \\arrow[r] & B \\\\\n C & D \\\\\n\\end{tikzcd}' });

// ---- chem_* : chemfig blocks (submols, Cram bonds, charges, \chemmove, schemes, \hreac)
const chS = (src) => () => SC.block('chemfig', { src });
KIT.chem_sugar = chS(String.raw`\setchemfig{cram width=2pt}
\definesubmol{c1}{-[:200]-[:120]O-[:190]}
\definesubmol{c2}{-[:170](-[:200,0.7]HO)<[:300](-[:170,0.6]HO)
-[:10,,,,line width=2pt](-[:-40,0.6]OH)>[:-10]}
\definesubmol{csub}{-[:155,0.65]-[:90,0.65]}
\chemfig{O(!{c1}(!{csub}O(!{c1}(!{csub}OH)!{c2}))!{c2})-[:-30](-[:-90]CN)-[:30]*6(=-=-=-)}`);
KIT.chem_move = chS(String.raw`\schemestart
  \chemfig{C([3]-)([5]-)=[@{db,.5}]@{atoo}\charge{0=\|,-90=\|}{O}}
  \arrow(.mid east--.mid west){<->}
  \chemfig{\charge{90:3pt=$\scriptstyle\oplus$}{C}([3]-)([5]-)-%
    \charge{0=\|,90=\|,-90=\|,45:3pt=$\scriptstyle\ominus$}{O}}
\schemestop
\chemmove{\draw[shorten <=2pt, shorten >=2pt](db) ..controls +(up:5mm) and +(up:5mm)..(atoo);}`);
KIT.chem_nitro = chS(String.raw`\schemestart
  \chemfig{R-\charge{225:3pt=$\scriptstyle\oplus$}{N}([1]=[@{db}]@{atoo1}O)([7]-[@{sb}]@{atoo2}
  \charge{45=\|,-45=\|,-135=\|,45:5pt=$\scriptstyle\ominus$}{O})}
  \arrow(.mid east--.mid west){<->}
  \chemfig{R-\charge{135:3pt=$\scriptstyle\oplus$}{N}([1]-\charge{90:3pt=$\scriptstyle\ominus$}{O})([7]=O)}
\schemestop
\chemmove{
  \draw[shorten <=2pt, shorten >=2pt](db) ..controls +(120:5mm) and +(120:7mm)..(atoo1);
  \draw[shorten <=3pt, shorten >=2pt](atoo2) ..controls +(225:10mm) and +(225:10mm)..(sb);
}`);
KIT.chem_hreac = chS(String.raw`\definesubmol{0}{-[-3,.15,,,draw=none]}% invisible bond to stack
\definesubmol{COO/Na+}1{-[7]((-[-3,.66]COO^{-}!0N|a^+#1))}
\definesubmol{chain}{-[5]!{COO/Na+}{}-[5]!{COO/Na+}{}-[5]-[7]}
\definesubmol{COO/Ca2+}1{-[7]((-[-3,.66]COO^{-}!0C|a^{2+}!0COO^{-}-[-3,.66](-[7]-[5])#1))}
\hreac[fixed length,atom sep=2.5em,angle increment=30]
  \chemfig{-[5]!{COO/Na+}{!0\phantom{C}!0(!{COO/Na+}{}!{chain})(-[-1])}!{chain}}
  >[\printatom{Ca^{2+}}]
  \chemfig{-[5]!{COO/Ca2+}{(-[-1]-[1])}-[5]!{COO/Ca2+}{}-[5]!{COO/Ca2+}{}-[5]-[7]}
\endhreac`);
KIT.chem_text = chS(String.raw`\schemestart
  \chemfig{H_2C=CH_2}\quad or \quad\chemfig{*6(=-=-=-)}
  \arrow{->[$h\nu$]}
  \chemfig{A-B}
\schemestop`);
