// tkz-euclide (src/domain/tkzeuclide.ts): each command read as the TikZ it expands to, so a picture's points are
// coordinates plain TikZ finds, its constructions land where tkz-euclide's own arithmetic puts them, and its drawings,
// labels and marks are shapes with tkz-euclide.cfg's styles. The numbers are pdfLaTeX's (TeX Live 2026, tkz-euclide
// 5.14c): \pgfpointanchor of each point and node, and the drawing's operators in the uncompressed PDF, in pt.
{
  const doc = (body, opts = '', pre = '') => `\\documentclass{article}\n\\usepackage{tkz-euclide}\n${pre}\\begin{document}\n\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));
  const PT = 1 / TD.PT_PER_PX; // px per pt
  const near = (a, b, msg, eps = 0.01) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  // a named point's place in pt (x right, y up), as \pgfpointanchor gives it
  const at = (sh, nm) => { const c = sh.find((s) => s.type === 'coord' && s.tikzName === nm); T.ok(c, 'point ' + nm + ': ' + sh.map((s) => s.tikzName || s.type)); return c ? [c.x / PT, -c.y / PT] : [NaN, NaN]; };
  const pt = (sh, nm, x, y, eps = 0.01) => { const [a, b] = at(sh, nm); near(a, x, nm + ' x', eps); near(b, y, nm + ' y', eps); };
  const ABC = '\\tkzDefPoints{0/0/a,4/0/b,1/3/c}\n';

  T.test('tkz-euclide: points are coordinates in the \\tkzInit frame (l3fp numbers, polar), and plain TikZ finds them', () => {
    let sh = shapesOf(doc(String.raw`\tkzDefPoint(30:2){p1}
\tkzDefPoint(2*sqrt(2),sind(30)+1){p2}
\tkzDefPoints{0/0/a, 1/3/c}
\tkzDefShiftPoint[c](30:2){k}
\draw (a) -- (k);`));
    T.eq(kept(sh), [], 'nothing kept');
    pt(sh, 'p1', 49.28172, 28.45274); pt(sh, 'p2', 80.4766, 42.67911); pt(sh, 'k', 77.73447, 113.81097);
    const l = sh.find((s) => s.type === 'line');
    T.ok(l && Math.abs(l.x2 / PT - 77.73447) < 0.01, 'the \\draw through a tkz point is a line');
    // \tkzInit: an axis whose ends have the same sign starts at its min; points divide by the step
    sh = shapesOf(doc('\\tkzInit[xmin=1,xmax=5,ymin=-1,ymax=3,xstep=2]\n\\tkzDefPoint(3,2){Z}'));
    pt(sh, 'Z', 28.45274, 56.90549);
    sh = shapesOf(doc('\\tkzInit[xmin=-1,xmax=3,ymin=1,ymax=4,ystep=.5]\n\\tkzDefPoint(2,2){Z}'));
    pt(sh, 'Z', 56.90549, 56.90549);
    // a loop's values, braced, and \foreach's ranges in a point list
    sh = shapesOf(doc('\\foreach \\i in {0,...,3} {\\tkzDefPoint(\\i,1){\\i}}\n\\tkzDrawPoints(0,...,3)'));
    T.eq(kept(sh), [], 'loop and range read');
    T.eq(sh.filter((s) => s.type === 'ellipse').length, 4, 'four points drawn');
  });

  T.test('tkz-euclide: constructions land where tkz-euclide puts them', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzDefPoints{2/0/R}
\tkzInterLL(a,c)(b,R)\tkzGetPoint{I}
\tkzDefPointBy[projection=onto a--b](c)\tkzGetPoint{p}
\tkzDefPointBy[rotation=center a angle 90](b)\tkzGetPoint{q}
\tkzDefPointBy[homothety=center a ratio .5](c)\tkzGetPoint{h}
\tkzDefPointBy[symmetry=center c](b)\tkzGetPoint{s}
\tkzDefPointBy[reflection=over a--c](b)\tkzGetPoint{r}
\tkzDefPointBy[translation=from a to c](b)\tkzGetPoint{t}
\tkzDefLine[perpendicular=through c](a,b)\tkzGetPoint{d}
\tkzDefLine[parallel=through c](a,b)\tkzGetPoint{e}
\tkzDefLine[bisector](b,a,c)\tkzGetPoint{f}
\tkzDefLine[mediator](a,b)\tkzGetPoints{g}{gg}
\tkzDefLine[mediator,K=.5](a,b)\tkzGetPoints{m1}{m2}
\tkzDefMidPoint(a,c)\tkzGetPoint{m}
\tkzCircumCenter(a,b,c)\tkzGetPoint{o}
\tkzDefSquare(a,b)\tkzGetPoints{s1}{s2}
\tkzDefPointWith[colinear=at c](a,b)\tkzGetPoint{w1}
\tkzDefPointWith[orthogonal,K=.5](a,b)\tkzGetPoint{w2}
\tkzDefParallelogram(a,b,c)\tkzGetPoint{pg}
\tkzInterCC(a,c)(b,c)\tkzGetPoints{i1}{i2}
\tkzInterCC[R](a,2)(b,3)\tkzGetPoints{i3}{i4}
\tkzDefTriangle[equilateral](a,b)\tkzGetPoint{t1}
\tkzDefTriangle[egyptian](a,b)\tkzGetPoint{t2}
\tkzDefTriangle[two one,swap](a,b)\tkzGetPoint{t3}
\tkzDefCircle[circum](a,b,c)\tkzGetPoints{o1}{o2}
\tkzDefCircle[R](c,2)\tkzGetPoint{o3}
\tkzDefPointOnCircle[through=center a angle 30 point c]\tkzGetPoint{q1}
\tkzDefPointOnCircle[R=center a angle 120 radius 2]\tkzGetPoint{q2}
\tkzDefPointOnLine[pos=.3](a,c)\tkzGetPoint{q3}
\tkzDefRegPolygon[side,sides=5,name=Q](a,b)\tkzGetPoint{ce}
\tkzDefRegPolygon[center,sides=6,name=H](c,b)`));
    T.eq(kept(sh), [], 'nothing kept');
    const want = {
      I: [0, 0], p: [28.45274, 0], q: [0, 113.81097], h: [14.22636, 42.67911], s: [-56.90549, 170.71646], r: [-91.04913, 68.2864],
      t: [142.26372, 85.35823], d: [28.45274, 199.1692], e: [142.26372, 85.35823], f: [74.90053, 53.98514], g: [56.90549, 98.56346],
      gg: [56.90549, -98.56346], m1: [56.90549, 49.28172], m2: [56.90549, -49.28172], m: [14.22636, 42.67911], o: [56.90549, 28.45274],
      s1: [113.81097, 113.81097], s2: [0, 113.81097], w1: [142.26372, 85.35823], w2: [0, 56.90549], pg: [-85.35823, 85.35823],
      i1: [28.45258, 85.3583], i2: [28.45258, -85.3583], i3: [39.12251, 41.32391], i4: [39.12251, -41.32391],
      t1: [56.90549, 98.56346], t2: [113.81097, -85.35823], t3: [113.81097, 56.90549], o1: [56.90549, 28.45274], o2: [0, 0],
      o3: [85.35823, 85.35823], q1: [77.92116, 44.9875], q2: [-28.45274, 49.28172], q3: [8.5359, 25.60773], ce: [56.90549, 78.32327],
      Q1: [0, 0], Q2: [113.81104, -0.00107], Q3: [148.98035, 108.24031], H1: [113.81097, 0], H2: [145.05444, 116.60172], H6: [-2.79074, -31.24347],
    };
    for (const [nm, [x, y]] of Object.entries(want)) pt(sh, nm, x, y, 0.02);
  });

  T.test('tkz-euclide: a line against a circle, first and second as tkz-euclide orders them', () => {
    const sh = shapesOf(doc(String.raw`\tkzDefPoints{0/0/a,1/3/c,-3/1/L1,3/2/L2,-3/0/M1,3/0/M2,0/0/O,2/0/R}
\tkzInterLC(L1,L2)(a,c)\tkzGetPoints{e1}{e2}
\tkzInterLC[near](L2,L1)(a,c)\tkzGetPoints{e3}{e4}
\tkzInterLC(M1,M2)(O,R)\tkzGetPoints{e5}{e6}
\tkzInterLC[R](a,M2)(a,1.5)\tkzGetPoints{e7}{e8}`));
    T.eq(kept(sh), [], 'nothing kept');
    pt(sh, 'e1', 71.51074, 54.59262, 0.02); pt(sh, 'e2', -85.35056, 28.45032, 0.02);
    pt(sh, 'e3', 71.51074, 54.59262, 0.02); pt(sh, 'e4', -85.35056, 28.45032, 0.02);
    // through the centre: first against the line's direction, second along it
    pt(sh, 'e5', -56.90549, 0); pt(sh, 'e6', 56.90549, 0);
    pt(sh, 'e7', -42.67912, 0); pt(sh, 'e8', 42.67912, 0);
  });

  T.test('tkz-euclide: under x= and y=, tkz-euclide\'s xy results land scaled as LaTeX\'s do; scalars become macros', () => {
    let sh = shapesOf(doc(String.raw`\tkzDefPoints{0/0/a,2/0/b,0/1/c}
\tkzInterLL(a,b)(c,b)\tkzGetPoint{i}
\tkzCircumCenter(a,b,c)\tkzGetPoint{o}`, 'x=2cm,y=2cm'));
    T.eq(kept(sh), [], 'nothing kept');
    pt(sh, 'b', 113.811, 0); pt(sh, 'i', 227.62201, 0); pt(sh, 'o', 113.811, 56.9055);
    sh = shapesOf(doc(ABC + String.raw`\tkzFindAngle(b,a,c)\tkzGetAngle{an}
\tkzCalcLength(a,c)\tkzGetLength{ln}
\coordinate (u) at (\an:\ln);`));
    // (71.56523° and 3.16228cm in LaTeX)
    pt(sh, 'u', 3.16228 * 28.45274 * Math.cos(71.56523 * Math.PI / 180), 3.16228 * 28.45274 * Math.sin(71.56523 * Math.PI / 180), 0.02);
  });

  T.test('tkz-euclide: lines, polygons, circles, arcs and points in tkz-euclide.cfg\'s styles', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzDrawLine(a,b)
\tkzDrawSegment[red,thick](a,c)
\tkzDrawSegment[add=.5 and 1cm](a,c)
\tkzDrawPolygon(a,b,c)
\tkzDrawCircle(a,c)
\tkzDrawArc[rotate](a,b)(-60)
\tkzDrawArc(a,b)(c)
\tkzDrawPoint(a)
\tkzDrawPoints[size=4,color=red](b)
\tkzDrawPoints[fill=blue](c)`));
    T.eq(kept(sh), [], 'nothing kept');
    const lines = sh.filter((s) => s.type === 'line');
    // \tkzDrawLine: add=.2 and .2 (−0.8 to 4.8cm), 0.2pt, round caps (PDF: 0.19926 w, 1 J)
    const L = lines[0];
    near(L.x1 / PT, -22.6768 * 1.00375, 'line from'); near(L.x2 / PT, 136.06259 * 1.00375, 'line to', 0.02);
    near(L.width / PT, 0.2, '0.2pt'); T.eq(L.cap, 'round', 'round caps'); T.eq(L.stroke, '#000000', 'black');
    T.eq([lines[1].stroke, +(lines[1].width / PT).toFixed(3), lines[1].cap], ['#ff0000', 0.8, 'round'], 'red, thick (0.797bp)');
    // add=.5 and 1cm: half of AC before a, 1cm past c
    const n = Math.hypot(1, 3);
    near(lines[2].x1 / PT, -0.5 * 28.45274, 'add .5'); near(lines[2].x2 / PT, 28.45274 * (1 + 1 / n), 'add 1cm');
    const poly = sh.find((s) => s.type === 'poly');
    T.eq([poly.closed, poly.join, poly.cap], [true, 'round', 'round'], 'polygon: closed, round joins (1 j)');
    // the circle through c: black!50, 0.2pt, radius |ac| (89.96pt at its node's north anchor)
    const circ = sh.find((s) => s.type === 'ellipse' && s.rx > 50);
    near(circ.rx / PT, Math.sqrt(10) * 28.45274, 'radius'); T.eq(circ.stroke, '#808080', 'black!50');
    // arcs: black, 0.2pt, butt caps; rotate: −60° to 0° at 4cm; towards: 0° to 71.57°
    const arcs = sh.filter((s) => s.type === 'arc');
    near(arcs[0].a1, -60, 'rotate from'); near(arcs[0].a2, 0, 'rotate to'); near(arcs[0].r / PT, 113.81097, 'radius 4cm', 0.02);
    T.ok(!arcs[0].cap, 'butt caps'); near(arcs[1].a2, 71.56505, 'towards c', 0.001);
    // points: a 1pt circle drawn black (0.4pt) and filled black!10; size=4: 2pt; color sets both, fill only the fill
    const dots = sh.filter((s) => s.type === 'ellipse' && s.rx < 5);
    near(dots[0].rx / PT, 1, '1pt'); T.eq([dots[0].stroke, dots[0].fill], ['#000000', '#e6e6e6'], 'black, black!10');
    near(dots[1].rx / PT, 2, 'size=4: 2pt'); T.eq([dots[1].stroke, dots[1].fill], ['#ff0000', '#ff0000'], 'color=red');
    T.eq([dots[2].stroke, dots[2].fill], ['#000000', '#0000ff'], 'fill=blue');
  });

  T.test('tkz-euclide: labels below their points, at a segment\'s middle and on an angle\'s bisector', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzLabelPoint(c){$C$}
\tkzLabelSegment(a,b){$a$}
\tkzLabelAngle(b,a,c){$\alpha$}
\tkzLabelAngle[pos=1.5](b,a,c){$\beta$}
\tkzLabelAngle[dist=2,angle=10](b,a,c){$\gamma$}
\tkzLabelPoints(a,b)`));
    T.eq(kept(sh), [], 'nothing kept');
    const tx = (t) => sh.find((s) => s.type === 'text' && s.text === t);
    // below: the node's north anchor on the point (north 28.45274, 85.35823); centres measured
    T.ok(tx('$C$') && Math.abs(tx('$C$').x / PT - 28.45274) < 0.01 && -tx('$C$').y / PT < 85.35, 'C below c');
    near(tx('$a$').x / PT, 56.90549, 'segment label at the middle');
    near(tx('$\\alpha$').x / PT, 23.08095, 'angle label x'); near(-tx('$\\alpha$').y / PT, 16.63548, 'angle label y');
    near(tx('$\\beta$').x / PT, 34.62141, 'pos=1.5 x'); near(-tx('$\\beta$').y / PT, 24.95322, 'pos=1.5 y');
    near(tx('$\\gamma$').x / PT, 56.04152, 'dist=2, angle=10 x'); near(-tx('$\\gamma$').y / PT, 9.88135, 'y');
    T.ok(tx('$a$') && tx('$b$'), '\\tkzLabelPoints: each point\'s name in maths');
  });

  T.test('tkz-euclide: angle, right-angle and segment marks; filled angles', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzDefPoints{1/0/p}
\tkzMarkAngle[mark=|](b,a,c)
\tkzMarkAngle[size=0.5,arc=ll](b,a,c)
\tkzMarkRightAngle(c,p,a)
\tkzMarkSegment[mark=||](a,b)
\tkzFillAngle[fill=green!20,size=.5](b,a,c)`));
    T.eq(kept(sh), [], 'nothing kept');
    const arcs = sh.filter((s) => s.type === 'arc');
    // the arc at 1cm, 0° to 71.57°, at the current width (0.4pt); arc=ll: 0.5cm ∓ 2.5 × 0.4pt
    near(arcs[0].r / PT, 28.45274, 'size 1'); near(arcs[0].a2, 71.56505, 'to c', 0.001); near(arcs[0].width / PT, 0.4, '0.4pt');
    near(arcs[1].r / PT, 14.22637 - 1, 'll inner'); near(arcs[2].r / PT, 14.22637 + 1, 'll outer');
    // mark=|: a radial tick 8pt long at the middle of the arc (PDF: 19.762 14.243 m 26.227 18.904 l, in bp)
    const tick = sh.filter((s) => s.type === 'line').find((l) => Math.abs(l.x1 / PT - 19.762 * 1.00375) < 0.05 || Math.abs(l.x2 / PT - 19.762 * 1.00375) < 0.05);
    T.ok(tick, 'the tick: ' + JSON.stringify(sh.filter((s) => s.type === 'line').map((l) => [l.x1 / PT, -l.y1 / PT, l.x2 / PT, -l.y2 / PT])));
    // the right angle: an open path of 0.25cm sides from p, back to p
    const ra = sh.find((s) => s.type === 'poly' && !s.closed);
    T.eq(ra.pts.length, 5, 'four sides, open'); near(ra.pts[2][0] / PT, 28.45274 - 7.11319, 'corner x'); near(-ra.pts[2][1] / PT, 7.11319, 'corner y');
    // mark=||: ticks 2 × 0.4pt either side of the middle, 4pt up and down (PDF: x 57.490 and 55.896bp)
    const ticks = sh.filter((s) => s.type === 'line' && Math.abs(s.x1 - s.x2) < 1e-6 && Math.abs(s.x1 / PT - 56.90549) < 1);
    T.eq(ticks.map((l) => +(l.x1 / PT).toFixed(2)).sort(), [56.11, 57.71], 'two ticks');
    near(Math.abs(ticks[0].y1 - ticks[0].y2) / PT, 8, '8pt long');
    const fa = sh.find((s) => s.type === 'poly' && s.closed && s.fill);
    T.ok(fa && !fa.stroke && fa.fill === '#ccffcc', 'filled sector, no stroke (0.8 1 0.8 rg, f): ' + JSON.stringify(fa && [fa.fill, fa.stroke]));
  });

  T.test('tkz-euclide: marks keep their size on the page in a scaled picture; a segment\'s dimension line', () => {
    let sh = shapesOf(doc(ABC + '\\tkzMarkAngle[mark=|](b,a,c)\n\\tkzMarkSegment[mark=||](a,b)', 'scale=2'));
    T.eq(kept(sh), [], 'nothing kept');
    const L = sh.filter((s) => s.type === 'line').map((l) => [l.x1 / PT, -l.y1 / PT, l.x2 / PT, -l.y2 / PT]);
    // PDF (bp): 42.75627 30.81781 m 49.22128 35.4783 l (8pt on a 2cm arc); 114.18277 ±3.98506 and 112.58878 ±3.98506
    const tick = L.find((q) => Math.abs(Math.min(q[0], q[2]) - 42.75627 * 1.00375) < 0.02);
    T.ok(tick && Math.abs(Math.hypot(tick[2] - tick[0], tick[3] - tick[1]) - 8) < 0.01, 'an 8pt tick: ' + JSON.stringify(L));
    T.eq(L.filter((q) => q[0] === q[2]).map((q) => +q[0].toFixed(2)).sort(), [+(112.58878 * 1.00375).toFixed(2), +(114.18277 * 1.00375).toFixed(2)], '|| at ±0.8pt');
    // dim={text, offset, options}: fences 1.2 × offset to the left of AB, the dimension line at offset, latex-latex,
    // the text in a white \footnotesize node at its middle; the segment's colour on all, dim style on line and text
    sh = shapesOf(doc('\\tkzDefPoints{0/3/A, 1/-3/B}\n\\tkzDrawSegment[red,dim={$m$,2cm,},dim style/.append style={blue}](A,B)'));
    T.eq(kept(sh), [], 'nothing kept');
    const ln = sh.filter((s) => s.type === 'line');
    T.eq(ln.length, 4, 'segment, two fences, dimension line');
    // fence from A: 0.0 85.03934 m 67.10222 96.22252 l (bp)
    near(ln[1].x2 / PT, 67.10222 * 1.00375, 'fence x', 0.02); near(-ln[1].y2 / PT, 96.22252 * 1.00375, 'fence y', 0.02);
    T.eq([ln[1].stroke, ln[3].stroke, ln[3].startTip, ln[3].endTip], ['#ff0000', '#0000ff', 'latex', 'latex'], 'red fences, a blue latex-latex line');
    // (a filled node: a box holding its text)
    const m = sh.find((s) => s.type === 'rect' && JSON.stringify(s).includes('$m$'));
    T.ok(m && m.fill === '#ffffff' && !m.stroke, 'the text in a white box: ' + JSON.stringify(m));
    const mc = [m.x + m.w / 2, m.y + m.h / 2];
    near(mc[0] / PT, 70.35472, 'text at the middle x', 0.02); near(-mc[1] / PT, 9.35428, 'y', 0.02);
  });

  T.test('tkz-euclide: what it can\'t hold stays code with why, and a kept command keeps only its own arguments', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzDrawSegment[dim={$l$,1,right=2mm}](a,b)
\tkzDrawCompass(a,b)
\draw (0,0) -- (1,0);
\tkzInterLL(a,b)(a,b)\tkzGetPoint{x}`));
    const why = kept(sh).join(' | ');
    T.ok(/dim/.test(why), 'dim kept: ' + why);
    T.ok(/tkzDrawCompass is kept as code/.test(why), 'an unread command kept');
    T.ok(sh.some((s) => s.type === 'line' && Math.abs(s.x2 - TD.PX_PER_CM) < 1e-6), 'the \\draw after it is its own statement');
    T.ok(/parallel/.test(why) && /Unresolved node or coordinate \(tkzPointResult\)/.test(why), 'no intersection, no point: ' + why);
  });

  T.test('tkz-euclide: line cap and line join on a picture are held and written back; a shift without unit is in pt', () => {
    const sh = shapesOf(doc('\\draw (0,0) -- (1,0) -- (1,1);\n\\node[yshift=-3] at (0,0) {x};', 'line cap=round, line join=round, domain=0:1'));
    T.eq(kept(sh), [], 'nothing kept');
    const p = sh.find((s) => s.type === 'poly');
    T.eq([p.cap, p.join], ['round', 'round'], 'cap and join held');
    near(-sh.find((s) => s.type === 'text').y / PT, -3, 'yshift=-3 is 3pt');
    const tex = TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/line cap=round/.test(tex) && /line join=round/.test(tex), 'written back:\n' + tex);
    T.tex('tkz-euclide-cap-join', tex);
  });

  T.test('tkz-euclide: an edited tkz picture exports as plain TikZ that compiles', () => {
    const sh = shapesOf(doc(ABC + String.raw`\tkzDrawPolygon(a,b,c)
\tkzDrawPoints(a,b,c)
\tkzLabelPoints(a,b,c)
\tkzMarkAngle[mark=|](b,a,c)
\tkzMarkRightAngle(a,b,c)`));
    T.eq(kept(sh), [], 'nothing kept');
    const tex = TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/line cap=round, line join=round/.test(tex), 'the polygon\'s style:\n' + tex);
    T.tex('tkz-euclide-edited', tex);
  });

  T.test('tkz-euclide: a style the document appends to is drawn with it; one redefined or set up, and a result a command not read may have changed, stay code', () => {
    // \tikzset{line style/.append style={red}, label style/.append style={above}} (PDF: 1 0 0 RG, 0.19926 w, 1 J; X's
    // node 3.53pt above c); dim style/.style={blue} replaces latex-latex (0 28.34645 m 113.38579 28.34645 l, no tips)
    let sh = shapesOf(doc(ABC + String.raw`\tkzDrawSegment(a,c)
\tkzDrawSegment[dim={$m$,1cm,},dim style/.style={blue}](a,b)
\tkzLabelPoint(c){X}`, '', '\\tikzset{line style/.append style={red}, label style/.append style={above}}\n'));
    T.eq(kept(sh), [], 'nothing kept');
    const ln = sh.filter((s) => s.type === 'line');
    T.eq([ln[0].stroke, +(ln[0].width / PT).toFixed(2), ln[0].cap], ['#ff0000', 0.2, 'round'], 'line style appended to: red, 0.2pt, round caps');
    const dl = ln.find((l) => Math.abs(-l.y1 / PT - 28.45274) < 0.02 && Math.abs(-l.y2 / PT - 28.45274) < 0.02);
    const tip = (t) => t && t !== 'none';
    T.ok(dl && dl.stroke === '#0000ff' && !tip(dl.startTip) && !tip(dl.endTip), 'the dimension line blue, no tips: ' + JSON.stringify(dl));
    const X = sh.find((s) => s.type === 'text' && s.text === 'X');
    T.ok(X && -X.y / PT > 85.36, 'X above c');
    // \tkzSetUpLine and point style/.style redefine what tkz-euclide draws with; \tkzSetUpStyle[red, thick]{mine} is a
    // style (PDF: 1 0 0 RG, 0.79703 w); \tkzDefTriangleCenter, not read, sets tkzPointResult (the centroid, 47.42123pt,
    // 28.45274pt), so the midpoint before it is not there to get
    sh = shapesOf(doc(ABC + String.raw`\tkzSetUpLine[color=blue]
\tkzDrawSegment(a,c)
\tkzDrawPolygon(a,b,c)
\tkzDrawPoints(a)
\tkzSetUpStyle[red, thick]{mine}
\tkzDrawCircle[mine](a,b)
\tkzDefMidPoint(a,b)
\tkzDefTriangleCenter[centroid](a,b,c)\tkzGetPoint{g}
\draw (tkzPointResult) -- (b);`, '', '\\tikzset{point style/.style={draw=red}}\n'));
    const why = kept(sh);
    T.ok(why.filter((w) => /line style is redefined/.test(w)).length === 2, 'segment and polygon kept: ' + why.join(' | '));
    T.ok(why.some((w) => /tkzDrawPoints: point style is redefined/.test(w)), 'points kept');
    T.ok(why.some((w) => /tkzDefTriangleCenter is kept as code/.test(w)) && why.filter((w) => /Unresolved node or coordinate \(tkzPointResult\)/.test(w)).length === 2, 'no stale result: ' + why.join(' | '));
    T.ok(!sh.some((s) => s.type === 'coord' && s.tikzName === 'g'), 'g is not placed');
    const circ = sh.find((s) => s.type === 'ellipse');
    T.ok(circ && circ.stroke === '#ff0000' && Math.abs(circ.width / PT - 0.8) < 0.01, 'the circle in mine: ' + JSON.stringify(circ));
    // (spot checks, PDF in bp: \tkzDrawSemiCircle(a,b) 113.38579 0.0 m … black 0.19926 w, an arc 0° to 180°;
    // \tkzDrawArc[R](c,2cm)(30,90) from 77.44408 113.38579; rotation in rad by pi/3: 56.90375pt, 98.56172pt)
    sh = shapesOf(doc(ABC + '\\tkzDrawSemiCircle(a,b)\n\\tkzDrawArc[R](c,2cm)(30,90)\n\\tkzDefPointBy[rotation in rad=center a angle pi/3](b)\\tkzGetPoint{r}'));
    T.eq(kept(sh), [], 'nothing kept');
    const [semi, arcR] = sh.filter((s) => s.type === 'arc');
    T.eq([semi.a1, semi.a2, semi.stroke], [0, 180, '#000000'], 'a semicircle in black'); near(semi.r / PT, 113.81097, 'its radius', 0.02);
    near(arcR.r / PT, 56.90549, 'R: 2cm'); T.eq([arcR.a1, arcR.a2], [30, 90], 'R: 30° to 90°');
    pt(sh, 'r', 56.90375, 98.56172);
    // a clip with code after it that shows nothing (it may draw anywhere) stays the clip TikZ applies
    sh = shapesOf(doc(ABC + '\\tkzClip\n\\tkzDrawCompass(a,b)'));
    T.ok(kept(sh).some((w) => /the clip is kept as code/.test(w)), 'clip kept: ' + kept(sh).join(' | '));
  });

  T.test('tkz-euclide: a second \\tkzInit starts from the first one\'s keys; \\tkzGrid between two corners; a set-up outside the picture', () => {
    // \tkzInit stores its keys, the moved ends with them: after [xmin=-2,xmax=4,xstep=2], [ymax=5] keeps the step
    // (S at 28.45274pt, 56.90549pt); after [xmin=1,xmax=5] (moved: xmin 0, xmax 4), [ymax=3] has no origin left
    // (T at 56.90549pt, 56.90549pt)
    let sh = shapesOf(doc('\\tkzInit[xmin=-2,xmax=4,xstep=2]\n\\tkzDefPoint(60:2){P}\n\\tkzInit[ymax=5]\n\\tkzDefPoint(2,2){S}'));
    pt(sh, 'P', 14.22636, 49.28172); pt(sh, 'S', 28.45274, 56.90549);
    sh = shapesOf(doc('\\tkzInit[xmin=1,xmax=5]\n\\tkzDefPoint(2,2){R}\n\\tkzInit[ymax=3]\n\\tkzDefPoint(2,2){T}'));
    pt(sh, 'R', 28.45274, 56.90549); pt(sh, 'T', 56.90549, 56.90549);
    // \tkzGrid(0,0)(2,1) in that frame: (x − origin)/step, gray at 0.4pt (PDF: 0.5 G, 0.39851 w; x 0 and 28.3365bp,
    // y 0 and 28.3365bp)
    sh = shapesOf(doc('\\tkzInit[xmin=-2,xmax=4,xstep=2]\n\\tkzGrid(0,0)(2,1)'));
    T.eq(kept(sh), [], 'nothing kept');
    const g = sh.filter((s) => s.type === 'line');
    T.eq(g.length, 4, 'two lines each way');
    T.ok(g.every((l) => l.stroke === '#808080' && Math.abs(l.width / PT - 0.4) < 1e-6), 'gray, 0.4pt');
    T.eq([...new Set(g.flatMap((l) => [l.x1, l.x2]).map((x) => +(x / PT).toFixed(2)))].sort((a, b) => a - b), [0, 28.45], 'from 0 to 1cm');
    // \tkzSetUpLine between the pictures restyles the lines in the next one
    sh = TD.importLatex(String.raw`\documentclass{article}
\usepackage{tkz-euclide}
\begin{document}
\tkzSetUpLine[color=blue]
\begin{tikzpicture}
\tkzDefPoints{0/0/a,4/0/b}
\tkzDrawSegment(a,b)
\end{tikzpicture}
\end{document}`).blocks.flatMap((b) => b.shapes || []);
    T.ok(kept(sh).some((w) => /line style is redefined/.test(w)), 'segment kept: ' + kept(sh).join(' | '));
  });

  T.test('tkz-euclide: a rectangle draws the line join it holds; an unheld >= keeps the tips a style draws', () => {
    const sh = shapesOf(doc('\\draw[line join=round] (0,0) rectangle (1,1);'));
    const r = sh.find((s) => s.type === 'rect');
    T.ok(r && r.join === 'round' && /stroke-linejoin="round"/.test(TD.TYPES.rect.svg(r, {})), 'round corners');
    // >=Triangle[open] (not held): \draw[->] and a style's -> stay code, a line with no tip is drawn
    const sh2 = TD.importLatex(String.raw`\documentclass{article}
\usepackage{tikz}
\usetikzlibrary{arrows.meta}
\begin{document}
\begin{tikzpicture}[>={Triangle[open]}, vec/.style={->}]
\draw[vec] (0,0) -- (1,0);
\draw[->] (0,0) -- (0,1);
\draw (0,0) -- (1,1);
\end{tikzpicture}
\end{document}`).blocks.flatMap((b) => b.shapes || []);
    T.eq(sh2.filter((s) => s.type === 'tikz').length, 2, 'the two arrows kept: ' + kept(sh2).join(' | '));
    T.eq(sh2.filter((s) => s.type === 'line').length, 1, 'the plain line drawn');
  });
}
