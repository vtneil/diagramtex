// pgfplots parity: what an axis holds besides its \addplot commands (src/domain/pgfplots-import.ts, pgfplots-annot.ts,
// plots.ts). The numbers below are pdfLaTeX's (TeX Live 2025, pgfplots 1.18.x, standalone class): \pgfpointanchor of
// coordinates and axis anchors, in pt from the picture's origin, y up.
{
  const K = TD.PT_PER_PX;
  const doc = (body, pre = '\\pgfplotsset{compat=1.18}') => `\\documentclass[border=4pt]{standalone}\n\\usepackage{pgfplots}\n${pre}\n\\begin{document}\n\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const plotsOf = (sh) => sh.flatMap((s) => (s.type === 'plot' ? [s] : s.type === 'tikz' ? (s.prev || []).filter((p) => p.type === 'plot') : []));
  const kept = (sh) => sh.filter((s) => s.type === 'tikz' && s.kind !== 'defs').map((s) => s.issues.join('; '));
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  // a point in px (y down) as pt, y up
  const pt = (x, y) => [x * K, -y * K];
  const box = (p) => ({ sw: pt(p.x, p.y + p.h), ne: pt(p.x + p.w, p.y) });

  T.test('pgfplots parity: TikZ in the axis is drawn in the axis\' coordinates and written back inside it', () => {
    const sh = shapesOf(doc(String.raw`\begin{axis}[xmin=0, xmax=10, ymin=0, ymax=5]
\addplot coordinates {(0,0) (10,5)};
\draw (axis cs:1,1) -- (2,1) -- ++(1,0) -- (rel axis cs:0.5,0.5);
\fill (axis cs:4,2) circle (1pt);
\end{axis}`));
    T.eq(kept(sh), [], 'nothing kept');
    const p = plotsOf(sh)[0];
    T.eq(p.annot.map((a) => a.at), [1, 1], 'after the plot');
    const D = TD.pgfAnnot.annotShapes(p, TD.plotLimits(p));
    T.eq(D.issues, [], 'drawn whole');
    const line = D.groups[0].shapes.find((s) => s.type === 'poly'), dot = D.groups[0].shapes.find((s) => s.type === 'dot');
    // axis cs:1,1 at (19.5, 32.4); compat 1.18: (2,1) is axis cs, ++(1,0) one x unit (19.5pt); rel axis cs:0.5,0.5 the centre
    [[19.5, 32.399], [39, 32.399], [58.5, 32.399], [97.5, 80.997]].forEach(([x, y], k) => { const q = pt(...line.pts[k]); near(q[0], x, `point ${k} x`); near(q[1], y, `point ${k} y`); });
    const c = pt(dot.cx, dot.cy); near(c[0], 78, 'axis cs:4,2 x'); near(c[1], 64.8, 'axis cs:4,2 y');
    const tex = TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/\\draw \(axis cs:1,1\) -- \(2,1\) -- \+\+\(1,0\) -- \(rel axis cs:0\.5,0\.5\);[\s\S]*\\end\{axis\}/.test(tex), 'written inside the axis:\n' + tex);
    T.tex('pgfplots-parity-annot', tex);
  });

  T.test('pgfplots parity: what pgfplots reads in its own units stays code, with why', () => {
    const why = (body, pre) => kept(shapesOf(doc(`\\begin{axis}[xmin=0, xmax=10, ymin=0, ymax=5]\n\\addplot coordinates {(0,0) (1,1)};\n${body}\n\\end{axis}`, pre))).join(' | ');
    // no compat set: a plain (1,1) is pgfplots' internal units (1.95pt, 0.324pt), a unitless radius too
    T.ok(/plain coordinates in the axis before compat=1\.11/.test(why('\\draw (1,1) -- (2,2);', '')), 'plain point, no compat');
    T.ok(/circle's radius/.test(why('\\draw (axis cs:1,1) circle [radius=1];', '')), 'radius, no compat');
    T.ok(/arc's radius/.test(why('\\draw (axis cs:1,1) arc [start angle=0, end angle=90, radius=1];', '\\pgfplotsset{compat=1.9}')), 'arc radius, compat 1.9');
    T.eq(why('\\draw (axis cs:1,1) circle [radius=1];', '\\pgfplotsset{compat=1.9}'), '', 'circle radius in axis units from 1.5.1');
    T.ok(/a point in lengths/.test(why('\\draw (1cm,1cm) -- (axis cs:2,2);')), 'a point in lengths (from the box\' corner)');
    // a \clip of the axis' own (what it cuts among the plots after it): not held
    T.ok(/a \\clip in the axis/.test(why('\\clip (axis cs:0,0) rectangle (axis cs:5,5);')) && /a \\clip in the axis/.test(why('\\path[draw, clip] (axis cs:0,0) rectangle (axis cs:5,5);')), 'a \\clip: code');
  });

  T.test('pgfplots parity: with no compat set, labels sit where pgfplots\' default (before 1.3) puts them', () => {
    // pgfplots.code.tex: compat=default is labels pre 1.3, xlabel absolute (at (0.5,0), below, yshift=-15pt) and
    // ylabel absolute (at (0,0.5), xshift=-35pt, rotate=90); the export writes compat=1.18, so the axis stays code
    const sh = shapesOf(doc('\\begin{axis}[xlabel=$t$, ylabel=$v$]\\addplot coordinates {(0,0) (1,1)};\\end{axis}', ''));
    T.ok(/axis labels placed as compat=default/.test(kept(sh).join()), kept(sh).join());
    T.eq(plotsOf(sh)[0].labelCompat, 'pre1.3');
    T.eq(kept(shapesOf(doc('\\begin{axis}[xlabel=$t$]\\addplot coordinates {(0,0) (1,1)};\\end{axis}'))), [], 'compat=1.18: native');
    const m = plotsOf(shapesOf(doc('\\begin{axis}[axis lines=middle, xlabel=$t$]\\addplot coordinates {(0,0) (1,1)};\\end{axis}', '\\pgfplotsset{compat=1.5}')))[0];
    T.eq(m.labelCompat, 'pre1.8', 'a middle axis before 1.8');
  });

  T.test('pgfplots parity: \\pgfplotsset sizes, styles and every axis, and \\textwidth in the standalone class', () => {
    const pre = '\\pgfplotsset{compat=1.18, width=10cm, height=6cm, myaxis/.style={scale only axis}, every axis/.append style={xmin=0}}';
    const sh = shapesOf(doc(String.raw`\begin{axis}[name=a]
\addplot coordinates {(1,0) (2,1)};
\end{axis}
\begin{axis}[name=b, myaxis, at={(12cm,0)}]
\addplot coordinates {(1,0) (2,1)};
\end{axis}`, pre));
    const [a, b] = plotsOf(sh);
    near(box(a).ne[0], 239.525, 'width=10cm less 45pt'); near(box(a).ne[1], 125.716, 'height=6cm less 45pt');
    near(box(b).ne[0] - box(b).sw[0], 284.529, 'a pgfplots style: scale only axis'); near(box(b).ne[1], 170.716, '(height)');
    // every axis/.append style={xmin=0}: axis cs:0,0 at x=0, y data [0,1] enlarged 10% (10.477pt)
    const L = TD.plotLimits(a);
    T.eq(L.xmin, 0, 'xmin from every axis'); near(-L.ymin / (L.ymax - L.ymin) * 125.716, 10.477, 'y of axis cs:0,0');
    // a picture's own \pgfplotsset ends with the picture
    const two = TD.importLatex(`\\documentclass[border=4pt]{standalone}\n\\usepackage{pgfplots}\n${pre}\n\\begin{document}\n\\begin{tikzpicture}\\pgfplotsset{width=5cm}\\begin{axis}\\addplot coordinates {(1,0) (2,1)};\\end{axis}\\end{tikzpicture}\n\\begin{tikzpicture}\\begin{axis}\\addplot coordinates {(1,0) (2,1)};\\end{axis}\\end{tikzpicture}\n\\end{document}`).blocks.filter((q) => q.shapes).map((q) => plotsOf(q.shapes)[0]);
    near(box(two[0]).ne[0], 97.264, 'width=5cm in the first picture'); near(box(two[1]).ne[0], 239.525, 'the preamble\'s in the next');
    // \textwidth: 345pt in standalone (article, 10pt, letter paper)
    const t = plotsOf(shapesOf(doc('\\begin{axis}[width=0.5\\textwidth]\\addplot coordinates {(0,0) (1,1)};\\end{axis}')))[0];
    near(box(t).ne[0], 127.499, '0.5\\textwidth less 45pt'); near(box(t).ne[1], 103.782, 'height by the default ratio');
  });

  T.test('pgfplots parity: axis equal widens the limits, xshift and yshift move the axis', () => {
    const sh = shapesOf(doc(String.raw`\begin{axis}[axis equal, xmin=-2, xmax=4, ymin=-10, ymax=10]
\addplot coordinates {(0,0) (1,1)};
\end{axis}`));
    T.eq(kept(sh), [], 'nothing kept');
    const p = plotsOf(sh)[0], L = TD.plotLimits(p);
    near(box(p).ne[0], 194.999, 'the box kept'); near(box(p).ne[1], 162, '(height)');
    near((0 - L.xmin) / (L.xmax - L.xmin) * 195, 89.399, 'axis cs:0,0 x'); near((1 - L.xmin) / (L.xmax - L.xmin) * 195, 97.499, 'axis cs:1,1 x');
    near((0 - L.ymin) / (L.ymax - L.ymin) * 162, 81, 'axis cs:0,0 y');
    const q = plotsOf(shapesOf(doc('\\begin{axis}[xshift=1cm, yshift=-2cm, xmin=0, xmax=1, ymin=0, ymax=1]\\end{axis}')))[0];
    near(box(q).sw[0], 28.453, 'xshift'); near(box(q).sw[1], -56.906, 'yshift');
  });

  T.test('pgfplots parity: an axis with no data, hide axis and axis line style={draw=none}', () => {
    // no data and no limits: pgfplots clears the axis to [0,1] (enlarged), ticks automatic, its drawing gone
    const sh = shapesOf(doc('\\begin{axis}[ytick={5,6}]\n\\draw (axis cs:0,0) -- (axis cs:1,1);\n\\end{axis}'));
    const p = plotsOf(sh)[0], L = TD.plotLimits(p);
    T.ok(L.cleared, 'cleared'); near(L.xmin, -0.1, 'xmin', 1e-9); near(L.ymax, 1.1, 'ymax', 1e-9);
    near(box(p).ne[0], 195, 'default width'); near(box(p).ne[1], 162, 'default height');
    T.ok(/clears it/.test(kept(sh).join()), 'its drawing: code, with why');
    const svg = TD.TYPES.plot.svg({ ...p, id: 'c' }, {});
    T.ok(!/\$5\$/.test(svg) && /\$0\.2\$/.test(svg), 'automatic ticks');
    // hide axis: the plots only; axis y line=none hides y; draw=none takes the box away
    const h = plotsOf(shapesOf(doc('\\begin{axis}[hide axis, title=T]\\addplot coordinates {(0,0) (1,1)};\\end{axis}')))[0];
    T.ok(h.hideX && h.hideY, 'hide axis');
    const hs = TD.TYPES.plot.svg({ ...h, id: 'h' }, {});
    T.ok(!/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="none" stroke="#000"/.test(hs) && !/\$0\.5\$/.test(hs), 'no frame, no tick labels');
    const y = plotsOf(shapesOf(doc('\\begin{axis}[axis x line=bottom, axis y line=none]\\addplot coordinates {(0,0) (1,1)};\\end{axis}')))[0];
    T.eq([!!y.hideX, !!y.hideY, y.axisLines], [false, true, 'left'], 'axis y line=none');
    const n = plotsOf(shapesOf(doc('\\begin{axis}[axis line style={draw=none}]\\addplot coordinates {(0,0) (1,1)};\\end{axis}')))[0];
    T.ok(n.axisLineNone, 'axis line style={draw=none}');
    // (as edited: written from the plots, not the source as imported)
    const tex = TD.toTikz([h, n].map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/hide x axis/.test(tex) && /axis line style=\{draw=none\}/.test(tex), 'written back:\n' + tex);
  });

  T.test('pgfplots parity: groupplot cells placed as the groupplots library places them', () => {
    const sh = shapesOf(doc(String.raw`\begin{groupplot}[group style={group size=2 by 2, xticklabels at=edge bottom}, height=4cm]
\nextgroupplot[width=5cm] \addplot coordinates {(0,0) (1,1)};
\nextgroupplot[width=9cm] \addplot coordinates {(0,0) (1,1)};
\nextgroupplot[width=5cm] \addplot coordinates {(0,0) (1,1)};
\nextgroupplot[width=4cm] \addplot coordinates {(0,0) (1,1)};
\end{groupplot}
\node (n) at (group c2r2.north east) {};`, '\\usepgfplotslibrary{groupplots}\\pgfplotsset{compat=1.18}'));
    const P = plotsOf(sh);
    T.eq(P.map((p) => p.name), ['group c1r1', 'group c2r1', 'group c1r2', 'group c2r2']);
    near(box(P[0]).sw[0], 0, 'c1r1'); near(box(P[0]).sw[1], 0, 'c1r1 y');
    near(box(P[1]).sw[0], 125.716, 'c2r1 x'); near(box(P[1]).sw[1], 0, 'c2r1 y');
    near(box(P[2]).sw[1], -97.264, 'c1r2 y');
    near(box(P[3]).sw[0], 196.847, 'c2r2 under c2r1\'s centre'); near(box(P[3]).ne[0], 265.659, 'c2r2 east'); near(box(P[3]).ne[1], -28.453, 'c2r2 north');
    T.eq(P.map((p) => !!p.xticklabelsNone), [true, true, false, false], 'tick labels on the bottom row only');
    T.ok(/groupplot\} is kept as code/.test(kept(sh).join()), 'kept as code');
  });

  T.test('pgfplots parity: symbolic x coords, fill between, and plots after \\label or in \\pgfplotsinvokeforeach', () => {
    const p = plotsOf(shapesOf(doc('\\begin{axis}[ybar, symbolic x coords={aa,bb,cc}, xtick=data]\n\\addplot coordinates {(aa,1) (bb,2) (cc,3)};\n\\end{axis}')))[0];
    const L = TD.plotLimits(p), X = (v) => (v - L.xmin) / (L.xmax - L.xmin) * 195, Y = (v) => (v - L.ymin) / (L.ymax - L.ymin) * 162;
    near(X(0), 16.251, 'aa'); near(X(2), 178.748, 'cc'); near(Y(1), 13.501, 'y=1 (no zero pulled in)'); near(Y(3), 148.498, 'y=3');
    T.eq(p.xsym, ['aa', 'bb', 'cc']);
    T.ok(/>aa</.test(TD.TYPES.plot.svg({ ...p, id: 's' }, { export: true })) || /aa/.test(TD.TYPES.plot.svg({ ...p, id: 's' }, {})), 'the symbols at the ticks');
    // fill between: the paths' own ways (reverse=auto): (0.15,1)→(0,1) runs −, (0,0)→(0.15,0) +, so no reversal: a box
    const f = plotsOf(shapesOf(doc(String.raw`\begin{axis}[xmin=0, xmax=1, ymin=0, ymax=1]
\path[name path=A] (axis cs:0.15,1) -- (axis cs:0,1);
\path[name path=B] (axis cs:0,0) -- (axis cs:0.15,0);
\addplot [blue] fill between[of=A and B, soft clip={domain=0:1}];
\addplot[name path=C, domain=0:1] {x}; \addplot[name path=D, domain=0:1] {0};
\addplot [red] fill between[of=C and D, soft clip={domain=0.5:1}];
\end{axis}`, '\\usepgfplotslibrary{fillbetween}\\pgfplotsset{compat=1.18}')))[0];
    const fills = f.series.filter((s) => s.kind === 'fill');
    T.eq(TD.fillBetween(f, TD.plotLimits(f), fills[0]), [[0.15, 1], [0, 1], [0, 0], [0.15, 0]], 'the box');
    // both + : the second reversed; each clipped to 0.5 ≤ x ≤ 1
    const r = TD.fillBetween(f, TD.plotLimits(f), fills[1]);
    near(r[0][0], 0.5, 'clipped at 0.5'); near(r[r.length - 1][0], 0.5, 'and back', 1e-9); near(r[r.length - 1][1], 0, 'on D');
    T.eq(fills.map((s) => s.fill), ['#0000ff', '#ff0000'], 'the plots\' colours');
    // \label after a plot and \pgfplotsinvokeforeach do not hide the plots after them
    const q = plotsOf(shapesOf(doc('\\begin{axis}\n\\addplot coordinates {(0,0) (1,1)}; \\label{a}\n\\pgfplotsinvokeforeach{1,2}{\\addplot coordinates {(0,#1) (1,#1)};}\n\\end{axis}')))[0];
    T.eq(q.series.map((s) => s.data.split('\n')[0]), ['0 0', '0 1', '0 2'], 'three plots read');
  });

  T.test('pgfplots parity: a radius without a unit is in the axis units (an ellipse), as TikZ reads it', () => {
    // pdfLaTeX: axis 195pt × 162pt over [0,10] × [0,5] (19.5pt and 32.4pt a unit); the circle at axis cs:5,2.5 of
    // radius 1 meets y=2.5 at x 78.014 and 116.986, x=5 at y 48.602 and 113.392; the arc (0:180:1) and
    // arc[radius=1] from there meet x=4.5 at y 109.053
    const sh = shapesOf(doc(String.raw`\begin{axis}[xmin=0, xmax=10, ymin=0, ymax=5]
\addplot coordinates {(0,0) (10,5)};
\draw (axis cs:5,2.5) circle[radius=1];
\draw (axis cs:5,2.5) ellipse (1 and 1);
\draw (axis cs:6,2.5) arc (0:180:1);
\draw[red] (axis cs:6,2.5) arc[start angle=0, end angle=180, radius=1];
\fill (axis cs:4,2) circle (1pt);
\end{axis}`));
    T.eq(kept(sh), [], 'nothing kept');
    const p = plotsOf(sh)[0], D = TD.pgfAnnot.annotShapes(p, TD.plotLimits(p));
    T.eq(D.issues, [], 'drawn whole');
    const all = D.groups.flatMap((g) => g.shapes);
    for (const e of all.filter((s) => s.type === 'ellipse')) {
      const c = pt(e.cx, e.cy);
      near(c[0] - e.rx * K, 78.014, 'west'); near(c[0] + e.rx * K, 116.986, 'east'); near(c[1] - e.ry * K, 48.602, 'south'); near(c[1] + e.ry * K, 113.392, 'north');
    }
    T.eq(all.filter((s) => s.type === 'ellipse').length, 2, 'two ellipses');
    const arcs = all.filter((s) => s.type === 'arc');
    T.eq(arcs.length, 2, 'two arcs');
    for (const a of arcs) {
      const c = pt(a.cx, a.cy), rx = a.r * K, ry = (a.ry ?? a.r) * K;
      near(rx, 19.5, 'arc x radius'); near(ry, 32.4, 'arc y radius');
      near(c[1] + ry * Math.sqrt(1 - ((4.5 * 19.5 - c[0]) / rx) ** 2), 109.053, 'at x=4.5');
    }
    const dot = all.find((s) => s.type === 'dot');
    near(dot.r * K, 1, 'a radius in pt stays');
    // a radius in axis units written as an expression: kept as code
    const why = kept(shapesOf(doc('\\begin{axis}[xmin=0, xmax=10, ymin=0, ymax=5]\n\\addplot coordinates {(0,0) (1,1)};\n\\def\\r{1}\\draw (axis cs:5,2.5) circle (\\r);\n\\end{axis}'))).join();
    T.ok(/a radius in axis units given as an expression/.test(why), why);
  });

  T.test('pgfplots parity: \\pgfplotsset every axis plot is drawn, other every … styles keep the axis as code', () => {
    const one = (pre) => shapesOf(doc('\\begin{axis}\\addplot coordinates {(0,0) (1,1)};\\addlegendentry{a}\\end{axis}', `\\pgfplotsset{compat=1.18, ${pre}}`));
    const sh = one('every axis plot/.append style={line width=2pt}');
    T.eq(kept(sh), [], 'native');
    near(plotsOf(sh)[0].series[0].width * K, 2, 'line width from every axis plot');
    T.ok(/every axis legend\} not held/.test(kept(one('every axis legend/.append style={at={(0.5,-0.2)}, anchor=north}')).join()), 'every axis legend: code');
    // loops in loops stop at a bound (an issue), not run on
    const big = kept(shapesOf(doc('\\begin{axis}\\pgfplotsinvokeforeach{1,...,900}{\\pgfplotsinvokeforeach{1,...,900}{\\pgfplotsinvokeforeach{1,...,900}{\\addplot coordinates {(0,0) (1,#1)};}}}\\end{axis}'))).join();
    T.ok(/pgfplotsinvokeforeach not read/.test(big), big);
    // a \foreach over a list macro ends with its body: the plot after it is still read; one with [options] holding
    // braces is held with the plots
    const fe = plotsOf(shapesOf(doc('\\begin{axis}\\addplot coordinates {(0,0) (1,1)};\n\\foreach \\x in \\lst {\\draw (axis cs:\\x,0) -- (axis cs:\\x,1);}\n\\addplot coordinates {(0,1) (1,0)};\n\\foreach \\x [evaluate=\\x as \\y using {2*\\x}] in {1,2} {\\draw (axis cs:\\x,0) -- (axis cs:\\y,1);}\n\\end{axis}')))[0];
    T.eq(fe.series.length, 2, 'both plots read');
    T.eq(fe.annot.map((a) => a.code.slice(0, 20)), ['\\foreach \\x [evaluat'], 'the loop with options held');
  });

  T.test('pgfplots parity: a cleared axis keeps its declared limits unenlarged and is written with automatic ticks', () => {
    // pdfLaTeX: xmin=0, xmax=2 and no data: cleared to [0,1] in x (declared, so not enlarged) and [-0.1,1.1] in y;
    // axis cs:0,0 at (0, 13.501), axis cs:1,1 at (195, 148.498); the declared ytick goes with the clearing
    const p = plotsOf(shapesOf(doc('\\begin{axis}[xmin=0, xmax=2, ytick={5,6}]\n\\end{axis}')))[0], L = TD.plotLimits(p);
    T.eq([L.xmin, L.xmax], [0, 1], 'x');
    near((0 - L.ymin) / (L.ymax - L.ymin) * 162, 13.501, 'y of axis cs:0,0'); near((1 - L.ymin) / (L.ymax - L.ymin) * 162, 148.498, 'y of axis cs:1,1');
    // (as edited: written from the plot, not the source as imported)
    const tex = TD.toTikz([p].map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(!/ytick=\{5,6\}/.test(tex) && /ytick=\{0,/.test(tex), 'automatic ticks written:\n' + tex);
    T.tex('pgfplots-parity-cleared', tex);
  });

  T.test('pgfplots parity: \\linewidth on A5 paper, \\pgfplotsset number formats, odd axis lines and groups, fill between written', () => {
    // pdfLaTeX: article on a5paper has \textwidth = \linewidth = 276pt (whole points), so width=\linewidth is a
    // 231pt × 193.052pt box
    const a5 = TD.importLatex('\\documentclass[a5paper]{article}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\begin{document}\n\\begin{tikzpicture}\\begin{axis}[width=\\linewidth]\\addplot coordinates {(0,0) (1,1)};\\end{axis}\\end{tikzpicture}\n\\end{document}').blocks.flatMap((b) => b.shapes || []);
    const q = plotsOf(a5)[0];
    near(q.w * K, 230.999, 'width'); near(q.h * K, 193.052, 'height');
    // geometry sets its own text width: not read
    const g = TD.importLatex('\\documentclass{article}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\begin{document}\n\\begin{tikzpicture}\\begin{axis}[width=\\linewidth]\\addplot coordinates {(0,0) (1,1)};\\end{axis}\\end{tikzpicture}\n\\end{document}').blocks.flatMap((b) => b.shapes || []);
    T.ok(kept(g).length === 1, 'with geometry: code');
    // /pgf/number format/… in \pgfplotsset changes the tick labels: the axis says so
    T.ok(/number format/.test(kept(shapesOf(doc('\\begin{axis}\\addplot coordinates {(0,0) (1,1)};\\end{axis}', '\\pgfplotsset{compat=1.18, /pgf/number format/use comma}'))).join()), 'number format: code');
    // pdfLaTeX: axis x line=bottom (or center), axis y line=none puts axis cs:0,0 at (0, 13.501): x not enlarged (a
    // non-boxed axis), y enlarged 10% (none is not)
    for (const xl of ['bottom', 'center']) {
      const h = plotsOf(shapesOf(doc(`\\begin{axis}[axis x line=${xl}, axis y line=none]\\addplot coordinates {(0,0) (1,1)};\\end{axis}`)))[0], L = TD.plotLimits(h);
      near((0 - L.xmin) / (L.xmax - L.xmin) * 195, 0, `${xl}: x of axis cs:0,0`); near((0 - L.ymin) / (L.ymax - L.ymin) * 162, 13.501, `${xl}: y of axis cs:0,0`);
    }
    // axis x line=none alone names what was given
    T.ok(/axis x line=none, axis y line=box not held/.test(kept(shapesOf(doc('\\begin{axis}[axis x line=none]\\addplot coordinates {(0,0) (1,1)};\\end{axis}'))).join()), 'axis x line=none alone');
    // a group whose first cell is not read: the rest is not placed, nothing thrown
    const G = TD.pgfplotsImport.fromGroup('group style={group size=2 by 1}', '\\nextgroupplot \\addplot coordinates {(0,0) \\nextgroupplot \\addplot coordinates {(0,0) (1,1)};', {});
    T.ok(G.issues.includes('cell c1r1 not read'), G.issues.join('; '));
    // fill between, as edited: a filled polygon under the plots, which pdfLaTeX compiles
    const f = plotsOf(shapesOf(doc(String.raw`\begin{axis}[xmin=0, xmax=1, ymin=0, ymax=1]
\addplot[name path=C, domain=0:1] {x}; \addplot[name path=D, domain=0:1] {0};
\addplot [red!30] fill between[of=C and D, soft clip={domain=0.5:1}];
\end{axis}`, '\\usepgfplotslibrary{fillbetween}\\pgfplotsset{compat=1.18}')))[0];
    const tex = TD.toTikz([f].map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/\\addplot\[fill=[^\]]*draw=none, forget plot\] coordinates \{\(0\.5,0\.5\)[^}]*\} --cycle;/.test(tex), tex);
    T.tex('pgfplots-parity-fill', tex);
  });
}
