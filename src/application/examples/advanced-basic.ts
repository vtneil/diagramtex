import type { ExampleTools } from '../example-diagrams';
import { referenceFigures } from './reference-figures';

export function advancedBasicExamples(g: ExampleTools) {
  const { add, text, line, arrow, sym, ellipse, example, clone, blue, red, grey } = g;
  const green = '#32785e', gold = '#a67617';
  const poly = (pts: number[][], props = {}) => add('poly', 'poly', { pts, closed: true, ...props });
  const arc = (cx: number, cy: number, r: number, a1: number, a2: number, props = {}) => add('arc', 'arc', { cx, cy, r, a1, a2, ...props });
  const curve = (p: number[], props = {}) => add('curve', 'curve', { x1: p[0], y1: p[1], cx1: p[2], cy1: p[3], cx2: p[4], cy2: p[5], x2: p[6], y2: p[7], ...props });
  const point = (x: number, y: number, label = '', color = '#000000') => { ellipse(x, y, 3, 3, { stroke: color, fill: color }); if (label) text(x + 15, y - 16, label, { color }); };
  const hatch = { p: 'ne', size: 8, lw: 0.65, color: grey };
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string) => arrow(x1, y1, x2, y2, { startTip: 'stealth', label, labelSide: 'on', width: 1 });
  example('Pendulum: trajectory, forces and phase portrait', 'The original pendulum is accompanied by a separate force decomposition and a small-angle phase ellipse. Basic shapes, coloured vectors, arcs, dashed guides and maths remain individually editable.', () => {
    clone(referenceFigures[0]);
    text(850, 40, 'Force decomposition', { bold: true });
    ellipse(850, 170, 12, 12, { fill: '#000000' });
    arrow(850, 170, 770, 103, { stroke: blue, label: '$T$' });
    arrow(850, 170, 850, 290, { stroke: red, label: '$mg$' });
    arrow(850, 170, 791, 241, { stroke: green, label: '$mg\\sin\\theta$' });
    line(791, 241, 850, 290, { dash: 'dashed', stroke: grey });
    text(850, 337, '$\\ddot\\theta+\\frac{g}{l}\\sin\\theta=0$');
    arrow(745, 470, 970, 470); arrow(850, 540, 850, 385);
    ellipse(850, 470, 80, 45, { stroke: blue });
    text(978, 487, '$\\theta$'); text(875, 390, '$\\dot\\theta$'); text(850, 573, 'Small-angle phase portrait', { size: 15 });
  });
  example('Coaxial geometry and a Gaussian surface', 'The original native hatch-filled annulus and cylinder are paired with radial field arrows and a piecewise field-magnitude plot. Pattern fills, compound regions, ellipses and labelled polylines are editable.', () => {
    clone(referenceFigures[1]);
    text(875, 36, 'Radial cross-section', { bold: true });
    ellipse(875, 155, 82, 82, { fill: hatch }); ellipse(875, 155, 67, 67, { fill: '#ffffff' }); ellipse(875, 155, 25, 25, { fill: '#e8f0fb' });
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; arrow(875 + 33 * Math.cos(a), 155 + 33 * Math.sin(a), 875 + 60 * Math.cos(a), 155 + 60 * Math.sin(a), { stroke: blue, width: 1 }); }
    text(875, 155, '$+\\lambda$', { size: 14 }); text(875, 57, '$-\\lambda$', { size: 14 });
    dim(875, 155, 900, 155, '$a$'); text(970, 150, '$b$');
    arrow(765, 390, 995, 390); arrow(765, 390, 765, 265);
    text(1007, 402, '$r$'); text(750, 264, '$E$');
    const pts = [[765, 390], [800, 305]];
    for (let x = 801; x <= 930; x += 3) pts.push([x, 390 - 85 * 35 / (x - 765)]);
    poly(pts, { closed: false, stroke: blue, width: 2 });
    line(930, 372, 930, 390, { stroke: blue }); line(930, 390, 985, 390, { stroke: blue, width: 2 });
    text(800, 415, '$a$'); text(930, 415, '$b$'); text(875, 455, '$E\\propto r,\\quad E\\propto 1/r,\\quad E=0$');
  });
  example('Iterative solver with validation and convergence', 'A multi-branch flowchart uses process, decision and terminal shapes, routed return paths, colour-coded outcomes and mathematical termination conditions.', () => {
    sym('rrect', 280, 20, 150, 42, { text: 'Start', fill: '#e6f4ea' });
    sym('para', 265, 100, 180, 55, { text: 'Read data, tolerance' });
    sym('diamond', 275, 200, 160, 85, { text: 'Data valid?' });
    sym('rect', 260, 335, 190, 55, { text: '$x_{k+1}=F(x_k)$', fill: '#e8f0fb' });
    sym('diamond', 255, 440, 200, 100, { text: '$\\|x_{k+1}-x_k\\|<\\varepsilon$' });
    sym('rrect', 285, 600, 140, 45, { text: 'Save result', fill: '#e6f4ea' });
    sym('rect', 545, 215, 150, 55, { text: 'Report error', fill: '#ffedea' });
    sym('rect', 35, 455, 145, 55, { text: '$k\\leftarrow k+1$', fill: '#fff1db' });
    arrow(355, 62, 355, 100); arrow(355, 155, 355, 200); arrow(355, 285, 355, 335, { label: 'Yes' });
    arrow(435, 242, 545, 242, { label: 'No', stroke: red }); arrow(355, 390, 355, 440);
    arrow(355, 540, 355, 600, { label: 'Yes', stroke: green }); arrow(255, 490, 180, 490, { label: 'No' });
    poly([[105, 455], [105, 362], [260, 362]], { closed: false, endTip: 'stealth' });
    poly([[620, 215], [620, 128], [445, 128]], { closed: false, endTip: 'stealth', stroke: red, dash: 'dashed' });
    text(110, 315, 'Iterate', { color: blue }); text(630, 88, 'Correct inputs', { color: red });
  });
  example('Coupled spring–mass oscillators and normal modes', 'Three native springs couple two masses between Hatch walls. Displacement dimensions and two mode diagrams expose spring, pattern-fill, arrow and label controls.', () => {
    sym('p-wall', 25, 60, 14, 155); sym('p-wall', 690, 60, 14, 155, { fx: true });
    [[39, 205], [285, 430], [510, 690]].forEach(([a, b], i) => { add('spring', 'spring', { x1: a, y1: 135, x2: b, y2: 135, amplitude: 10, coils: 8 }); text((a + b) / 2, 100, '$k_' + (i + 1) + '$'); });
    [205, 430].forEach((x, i) => { sym('rect', x, 95, 80, 80, { fill: '#e8f0fb', text: '$m_' + (i + 1) + '$' }); ellipse(x + 20, 183, 7, 7); ellipse(x + 60, 183, 7, 7); line(x + 40, 192, x + 40, 248, { dash: 'dashed' }); arrow(x + 40, 237, x + 100, 237, { label: '$x_' + (i + 1) + '$', stroke: blue }); });
    line(39, 192, 690, 192); text(360, 285, '$M\\ddot{\\mathbf x}+K\\mathbf x=0,\\quad k_i=k,\\ m_i=m$');
    text(130, 355, 'Symmetric mode'); text(470, 355, 'Antisymmetric mode');
    [90, 220, 430, 560].forEach((x, i) => { ellipse(x, 410, 15, 15, { fill: i < 2 ? '#e8f0fb' : '#fff1db' }); arrow(x, 438, x + (i === 3 ? -55 : 55), 438, { stroke: i < 2 ? blue : red }); });
    text(155, 492, '$\\omega_1=\\sqrt{k/m}$'); text(495, 492, '$\\omega_2=\\sqrt{3k/m}$');
  });
  example('Thin-lens imaging with three principal rays', 'An original ray construction has focal and double-focal marks, object/image distances, three coloured principal rays and the thin-lens equation. It is built entirely from basic shapes.', () => {
    const axis = 210, lens = 350, f = 120, object = 80, image = 566;
    line(15, axis, 740, axis, { dash: 'dashed', stroke: grey }); sym('p-convex', lens - 10, 65, 20, 290);
    arrow(object, axis, object, 110, { stroke: '#000000', width: 2 }); arrow(image, axis, image, 290, { width: 2 });
    for (const [x, label] of [[lens - 2 * f, '$2F$'], [lens - f, '$F$'], [lens + f, "$F'$"], [lens + 2 * f, "$2F'$" ]] as const) { line(x, axis - 5, x, axis + 5); text(x, axis + 23, label); }
    line(object, 110, lens, 110, { stroke: red }); arrow(lens, 110, image, 290, { stroke: red });
    arrow(object, 110, image, 290, { stroke: blue });
    line(object, 110, lens, 290, { stroke: green }); arrow(lens, 290, image, 290, { stroke: green });
    text(object, 78, 'Object'); text(image + 55, 315, 'Inverted image'); text(lens, 36, 'Converging lens');
    line(object, 340, object, 380); line(lens, 340, lens, 380); line(image, 340, image, 380);
    dim(object, 372, lens, 372, '$d_o$'); dim(lens, 372, image, 372, '$d_i$');
    text(350, 430, '$\\frac{1}{f}=\\frac{1}{d_o}+\\frac{1}{d_i},\\qquad M=-\\frac{d_i}{d_o}$');
  });
  example('Incline forces and a resolved free-body inset', 'The corrected block and force placements are retained. A separate slope-aligned inset resolves weight into parallel and normal components; neither construction is a physics block.', () => {
    poly([[60, 260], [470, 260], [470, 70]], { fill: '#f4f1ea' });
    sym('rect', 254, 106, 70, 45, { angle: 25, fill: '#e8f0fb' });
    arrow(289, 129, 289, 254, { label: '$mg$', labelSide: 'right' }); arrow(298, 149, 248, 44, { stroke: blue, label: '$N$' }); arrow(298, 149, 393, 105, { stroke: red, label: '$f$' });
    arc(60, 260, 80, 0, 25); text(168, 236, '$\\alpha$');
    const x = 665, y = 150, a = Math.atan2(190, 410), W = 120;
    const tx = Math.cos(a), ty = -Math.sin(a), nx = -Math.sin(a), ny = -Math.cos(a);
    const parallel = [x - W * Math.sin(a) * tx, y - W * Math.sin(a) * ty];
    arrow(x - 120 * tx, y - 120 * ty, x + 130 * tx, y + 130 * ty, { stroke: grey, width: 1 });
    arrow(x - 65 * nx, y - 65 * ny, x + 125 * nx, y + 125 * ny, { stroke: grey, width: 1 });
    arrow(x, y, x, y + W, { stroke: '#000000', label: '$mg$' });
    arrow(x, y, parallel[0], parallel[1], { stroke: red });
    arrow(x, y, x - W * Math.cos(a) * nx, y - W * Math.cos(a) * ny, { stroke: gold });
    line(parallel[0], parallel[1], x, y + W, { dash: 'dashed', stroke: grey }); point(x, y);
    text(690, 20, 'Slope-aligned weight components', { bold: true });
    text(675, 325, '$W_\\parallel=mg\\sin\\alpha$'); text(675, 360, '$W_\\perp=mg\\cos\\alpha$');
    text(300, 345, '$N=mg\\cos\\alpha,\\quad f_s\\leq\\mu_s N$');
  });
  example('Euclid construction and perpendicular bisectors', 'Two compass circles locate an equilateral vertex. A second construction shows perpendicular bisectors meeting at a circumcentre; circle intersections and all annotations are basic shapes.', () => {
    const A = [170, 220], B = [350, 220], C = [260, 220 - 90 * Math.sqrt(3)];
    ellipse(...A as [number, number], 180, 180, { stroke: blue, dash: 'dashed', width: 1 }); ellipse(...B as [number, number], 180, 180, { stroke: red, dash: 'dashed', width: 1 });
    poly([A, B, C], { fill: '#fff1db' }); [A, B, C].forEach((p, i) => point(p[0], p[1], '$' + ['A', 'B', 'C'][i] + '$'));
    text(260, 435, '$AB=BC=CA$');
    const O = [735, 225], r = 125, pts = [20, 145, 260].map(a => [O[0] + r * Math.cos(a * Math.PI / 180), O[1] - r * Math.sin(a * Math.PI / 180)]);
    ellipse(O[0], O[1], r, r, { stroke: grey }); poly(pts);
    pts.forEach((p, i) => { const q = pts[(i + 1) % 3], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; line(m[0], m[1], O[0], O[1], { stroke: blue, dash: 'dashed' }); point(p[0], p[1]); }); point(...O as [number, number], '$O$');
    text(735, 435, 'Circumcentre from bisectors');
  });
  example('RLC phasors and impedance triangle', 'Rotating voltage phasors for an inductive series RLC circuit: the resistor voltage follows the current, the inductor leads by 90 degrees, and the capacitor lags by 90 degrees. Their vector sum is the supply voltage; the impedance triangle has the same phase angle.', () => {
    const O = [240, 300], theta = 35, phi = 20, vr = 180, vl = 160;
    const vc = vl - vr * Math.tan(phi * Math.PI / 180);
    const vector = (length: number, angle: number) => [length * Math.cos(angle * Math.PI / 180), -length * Math.sin(angle * Math.PI / 180)];
    const R = vector(vr, theta), L = vector(vl, theta + 90), C = vector(vc, theta - 90);
    const at = (v: number[]) => [O[0] + v[0], O[1] + v[1]];
    const E = [R[0] + L[0] + C[0], R[1] + L[1] + C[1]];
    const violet = '#921b95', orange = '#e87800', supply = '#080884', resistor = '#008000';
    arrow(40, O[1], 480, O[1]); arrow(O[0], 480, O[0], 75);
    text(490, 315, '$x$'); text(222, 65, '$y$');
    for (const [v, color] of [[L, violet], [C, orange], [R, resistor], [E, supply]] as const) {
      const end = at(v); arrow(O[0], O[1], end[0], end[1], { stroke: color, width: 3 });
    }
    const r = at(R), e = at(E);
    arrow(r[0], r[1], e[0], e[1], { stroke: violet, width: 3 });
    text(105, 140, '$V_L$', { color: violet, size: 23 });
    text(330, 405, '$V_C$', { color: orange, size: 23 });
    text(425, 208, '$V_R$', { color: resistor, size: 23 });
    text(335, 117, '$\\mathcal{E}$', { color: supply, size: 25 });
    text(435, 140, '$V_C+V_L$', { color: violet, size: 21 });
    arc(...O as [number, number], 55, 0, theta + phi, { endTip: 'stealth' });
    arc(...O as [number, number], 105, 0, theta, { endTip: 'stealth' });
    arc(...O as [number, number], 90, theta, theta + phi, { startTip: 'stealth' });
    text(315, 274, '$\\omega t$'); text(386, 266, '$\\omega t-\\phi$'); text(321, 222, '$\\phi$');
    const u = vector(22, theta), n = vector(22, theta + 90);
    for (const sign of [-1, 1]) add('poly', 'poly', { pts: [at(u), at([u[0]+sign*n[0],u[1]+sign*n[1]]), at([sign*n[0],sign*n[1]])], closed: false, stroke: supply, width: 1 });
    text(245, 450, '$\\mathcal{E}=V_R+V_L+V_C$');
    const resistance = 230, reactance = resistance * Math.tan(phi * Math.PI / 180);
    poly([[560, 300], [560 + resistance, 300], [560 + resistance, 300 - reactance]], { fill: '#e8f0fb' });
    text(675, 330, '$R$'); text(855, 258, '$X_L-X_C$'); text(655, 230, '$|Z|$');
    arc(560, 300, 70, 0, phi); text(645, 283, '$\\phi$');
    text(690, 420, '$Z=R+j(\\omega L-1/\\omega C)$'); text(690, 460, '$\\tan\\phi=(X_L-X_C)/R$');
  });
  example('De Casteljau subdivision of a cubic Bézier', 'The control polygon, two interpolation levels and the split point at t = 0.4 are separate editable shapes. The curve uses the app’s native Bézier tool.', () => {
    const P = [[70, 315], [160, 30], [520, 440], [690, 90]], t = 0.4;
    curve(P.flat(), { stroke: '#000000', width: 3 });
    const mix = (a: number[], b: number[]) => a.map((x, i) => x * (1 - t) + b[i] * t);
    let level = P;
    [grey, blue, red].forEach((c, depth) => { for (let i = 1; i < level.length; i++) line(level[i - 1][0], level[i - 1][1], level[i][0], level[i][1], { stroke: c, dash: depth ? 'solid' : 'dashed', width: depth ? 2 : 1 }); level.forEach((p, i) => point(p[0], p[1], depth === 0 ? '$P_' + i + '$' : '', c)); level = level.slice(1).map((p, i) => mix(level[i], p)); });
    point(level[0][0], level[0][1], '$B(0.4)$', green);
    text(385, 505, '$P_i^{(r)}=(1-t)P_i^{(r-1)}+tP_{i+1}^{(r-1)}$');
    text(385, 550, '$B(t)=(1-t)^3P_0+3t(1-t)^2P_1+3t^2(1-t)P_2+t^3P_3$');
  });
  example('Weighted network with a highlighted shortest path', 'A layered directed graph combines weighted edges, a highlighted route, a dashed alternative and a distance table. Nodes and edges remain independent canvas shapes.', () => {
    const P = [[50, 190], [220, 65], [220, 190], [220, 320], [420, 95], [420, 290], [630, 190]];
    const E = [[0, 1, 4], [0, 2, 2], [0, 3, 7], [1, 4, 3], [2, 1, 1], [2, 4, 5], [2, 5, 4], [3, 5, 2], [4, 6, 2], [5, 4, 1], [5, 6, 5]];
    E.forEach(([a, b, w]) => { const A = P[a], B = P[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]), dx = (B[0] - A[0]) * 22 / L, dy = (B[1] - A[1]) * 22 / L; const chosen = [[0, 2], [2, 1], [1, 4], [4, 6]].some(([x, y]) => a === x && b === y); arrow(A[0] + dx, A[1] + dy, B[0] - dx, B[1] - dy, { label: '$' + w + '$', stroke: chosen ? blue : grey, width: chosen ? 3 : 1 }); });
    P.forEach(([x, y], i) => { ellipse(x, y, 22, 22, { fill: '#ffffff' }); text(x, y, ['s', 'a', 'b', 'c', 'd', 'e', 't'][i]); });
    text(340, 420, '$s\\to b\\to a\\to d\\to t,\\quad d(s,t)=8$', { color: blue });
    text(340, 465, '$d(s,a)=3,\\quad d(s,d)=6,\\quad d(s,e)=6$');
  });
  example('Three-set Venn diagram and inclusion–exclusion', 'Three transparent sets show every overlap inside a universal set. Mathematical region labels and the inclusion–exclusion identity accompany the editable ellipses.', () => {
    sym('rect', 25, 15, 620, 440, { fill: '#ffffff' }); text(605, 40, '$U$');
    [[260, 190, '#2459a640'], [420, 190, '#bd3b3640'], [340, 300, '#32785e40']].forEach(([x, y, fill]) => ellipse(Number(x), Number(y), 155, 140, { fill, stroke: '#555555' }));
    [[190, 140, '$A$'], [490, 140, '$B$'], [340, 390, '$C$'], [340, 125, '$A\\cap B$'], [240, 295, '$A\\cap C$'], [440, 295, '$B\\cap C$'], [340, 230, '$A\\cap B\\cap C$']].forEach(([x, y, t]) => text(Number(x), Number(y), String(t), { size: 16 }));
    text(340, 495, '$|A\\cup B\\cup C|=|A|+|B|+|C|$');
    text(340, 535, '$-|A\\cap B|-|A\\cap C|-|B\\cap C|+|A\\cap B\\cap C|$');
  });
  example('Hatched retaining wall and triangular pressure load', 'Hatch presets become soil, foundation and wall sections with independent edges and angles. A graded set of load arrows, a resultant and dimensions form a technical section.', () => {
    sym('p-hatch', 35, 350, 675, 45, { hatchTop: true, hatchAngle: 30, hatch: 12, hatchWidth: 0.6 });
    poly([[260, 70], [305, 70], [355, 350], [210, 350]], { fill: hatch, width: 2 });
    sym('p-hatch', 355, 70, 335, 280, { hatchTop: true, hatchRight: true, hatchAngle: 135, hatch: 14 });
    line(305, 70, 355, 350, { stroke: blue, width: 2 });
    for (let i = 1; i <= 7; i++) { const y = 70 + i * 36, x = 305 + (y - 70) * 50 / 280; arrow(x + i * 15 + 8, y, x + 3, y, { stroke: blue, width: 1 }); }
    arrow(490, 257, 340, 257, { stroke: red, width: 3, label: '$P_a$' });
    dim(150, 70, 150, 350, '$H$'); line(150, 70, 260, 70, { width: 1 }); line(150, 350, 210, 350, { width: 1 });
    dim(540, 257, 540, 350, '$H/3$'); text(520, 30, 'Retained soil'); text(260, 430, 'Foundation');
    text(410, 490, '$p(z)=K_a\\gamma z,\\qquad P_a=\\frac12K_a\\gamma H^2$');
  });
  example('Dense neural network with weighted connections', 'A four-layer network uses gradient-filled neurons, translucent weighted connectors, layer labels and a loss/gradient annotation. All neurons and weights are ordinary editable shapes.', () => {
    const layers = [[100, [100, 220, 340]], [290, [65, 155, 245, 335]], [480, [100, 220, 340]], [670, [160, 280]]] as [number, number[]][];
    for (let l = 1; l < layers.length; l++) for (const [i, y] of layers[l - 1][1].entries()) for (const [j, v] of layers[l][1].entries()) line(layers[l - 1][0] + 22, y, layers[l][0] - 22, v, { stroke: (i + j) % 2 ? '#bd3b3670' : '#2459a670', width: 0.7 + (i + j) % 3 * 0.5 });
    layers.forEach(([x, ys], l) => { ys.forEach((y, i) => { ellipse(x, y, 23, 23, { fill: { g: 'radial', stops: [[0, '#ffffff'], [1, l === 0 ? '#8fd3f4' : l === 3 ? '#e8a33d' : '#8fd1b0']] } }); text(x, y, '$' + (l === 0 ? 'x_' : l === 3 ? 'y_' : 'h_') + (i + 1) + '$', { size: 15 }); }); text(x, 410, ['Input', 'Hidden 1', 'Hidden 2', 'Output'][l]); });
    text(385, 475, '$h^{(l)}=\\sigma(W^{(l)}h^{(l-1)}+b^{(l)})$');
    arrow(640, 535, 120, 535, { stroke: red, label: 'Backpropagation' }); text(385, 585, '$W\\leftarrow W-\\eta\\nabla_W\\mathcal L$');
  });
  example('Pulse-width modulation from carrier comparison', 'Sampled smooth and triangular paths generate an aligned PWM signal. Vertical comparison guides, a period dimension and a duty-ratio annotation make the relationship visible.', () => {
    const left = 90, right = 730, period = 160;
    const carrier = (x: number) => { const p = ((x - left) % period) / period; return 1 - 4 * Math.abs(p - 0.5); };
    const mod = (x: number) => 0.65 * Math.sin((x - left) * Math.PI * 2 / 640);
    for (const y of [130, 350]) arrow(60, y, 760, y, { stroke: grey, width: 1 });
    const c: number[][] = [], m: number[][] = [], pwm: number[][] = [];
    for (let x = left; x <= right; x += 2) { c.push([x, 130 - carrier(x) * 75]); m.push([x, 130 - mod(x) * 75]); const y = mod(x) >= carrier(x) ? 280 : 350; if (pwm.length && pwm[pwm.length - 1][1] !== y) pwm.push([x, pwm[pwm.length - 1][1]]); pwm.push([x, y]); }
    poly(c, { closed: false, stroke: grey }); poly(m, { closed: false, stroke: blue, width: 2.5 }); poly(pwm, { closed: false, stroke: red, width: 2 });
    for (let x = left; x <= right; x += period) line(x, 35, x, 370, { dash: 'dashed', stroke: '#aaaaaa', width: 0.7 });
    text(35, 80, '$v$'); text(38, 310, 'PWM'); text(420, 12, 'Reference versus carrier', { bold: true });
    dim(250, 405, 410, 405, '$T_s$'); text(420, 460, '$D=t_{\\rm on}/T_s,\\qquad v_{\\rm ref}\\geq v_{\\rm carrier}$');
  });
  example('Converging–diverging nozzle section', 'A technical drawing combines native cubic curves, closed hatched wall sections, centreline, inlet/throat/exit dimensions and a flow arrow. Dimensions are illustrative, not manufacturing specifications.', () => {
    const upper = [[70, 80], [220, 80], [280, 160], [350, 160], [420, 160], [560, 65], [710, 65]];
    curve([70, 80, 220, 80, 280, 160, 350, 160], { width: 2 }); curve([350, 160, 420, 160, 560, 65, 710, 65], { width: 2 });
    curve([70, 320, 220, 320, 280, 240, 350, 240], { width: 2 }); curve([350, 240, 420, 240, 560, 335, 710, 335], { width: 2 });
    // Sample the same cubics to close the wall regions above and below the flow passage.
    const bez = (p: number[][]) => Array.from({ length: 41 }, (_, i) => { const t = i / 40, u = 1 - t; return [0, 1].map(k => u ** 3 * p[0][k] + 3 * t * u ** 2 * p[1][k] + 3 * t ** 2 * u * p[2][k] + t ** 3 * p[3][k]); });
    const inside = [...bez(upper.slice(0, 4)), ...bez(upper.slice(3))];
    poly([[70, 35], [710, 35], ...inside.slice().reverse()], { fill: hatch, width: 1 });
    poly([[70, 365], ...inside.map(([x, y]) => [x, 400 - y]), [710, 365]], { fill: hatch, width: 1 });
    line(25, 200, 760, 200, { dash: 'dashed', stroke: grey, width: 1 }); arrow(180, 200, 570, 200, { stroke: blue, width: 3, label: 'Flow' });
    dim(30, 80, 30, 320, '$D_i$'); dim(350, 160, 350, 240, '$D_t$'); dim(750, 65, 750, 335, '$D_e$');
    line(70, 365, 70, 430); line(350, 365, 350, 430); line(710, 365, 710, 430);
    dim(70, 415, 350, 415, '$L_c$'); dim(350, 415, 710, 415, '$L_d$'); text(390, 475, 'Axisymmetric section · schematic');
  });
  example('Two-stage passive filter from individual symbols', 'Individual resistor, capacitor and source symbols are wired into a two-stage ladder. Voltage probes, current direction, node dots and a frequency-response inset remain editable without a circuit block.', () => {
    ellipse(60, 175, 30, 30); text(20, 175, '$v_i$'); line(60, 65, 60, 145); line(60, 205, 60, 290);
    sym('e-res', 105, 49, 120, 32); sym('e-res', 340, 49, 120, 32); line(60, 65, 105, 65); line(225, 65, 340, 65); line(460, 65, 650, 65);
    [280, 550].forEach((x, i) => { line(x, 65, x, 135); sym('e-cap', x - 16, 135, 32, 80, { rot: 1 }); line(x, 215, x, 290); point(x, 65); text(x + 48, 175, '$C_' + (i + 1) + '$'); });
    line(60, 290, 650, 290); text(165, 25, '$R_1$'); text(400, 25, '$R_2$'); arrow(640, 250, 640, 105, { stroke: blue, label: '$v_o$' }); arrow(225, 110, 260, 110, { stroke: red, label: '$i$' });
    text(350, 350, '$H(s)=\\frac{1}{1+s(R_1C_1+R_1C_2+R_2C_2)+s^2R_1R_2C_1C_2}$');
    arrow(120, 525, 615, 525); arrow(120, 525, 120, 395); text(650, 535, '$\\log f$'); text(75, 395, 'dB');
    poly([[130, 410], [300, 410], [430, 455], [600, 515]], { closed: false, stroke: blue, width: 2 });
    line(300, 410, 300, 525, { dash: 'dashed', stroke: grey }); text(300, 550, '$f_c$'); text(525, 455, '$-40\\,\\mathrm{dB/dec}$');
  });
  example('Closed-loop control with disturbance and sensor noise', 'Summing junctions, a controller, plant and sensor are joined by routed arrows. Disturbance and noise inputs, a feedback branch and the closed-loop transfer function show a fuller control diagram.', () => {
    const box = (x: number, y: number, w: number, label: string) => sym('rect', x, y, w, 65, { fill: '#e8f0fb', text: label });
    ellipse(150, 165, 18, 18); ellipse(390, 165, 18, 18); ellipse(720, 165, 18, 18);
    box(205, 133, 120, '$C(s)$'); box(450, 133, 140, '$G(s)$'); box(390, 340, 150, '$H(s)$');
    arrow(25, 165, 132, 165, { label: '$r$' }); arrow(168, 165, 205, 165, { label: '$e$' }); arrow(325, 165, 372, 165, { label: '$u$' }); arrow(408, 165, 450, 165); arrow(590, 165, 702, 165, { label: '$y$' }); arrow(738, 165, 840, 165, { label: '$y_m$' });
    arrow(390, 40, 390, 147, { stroke: red, label: '$d$' }); arrow(720, 40, 720, 147, { stroke: red, label: '$n$' });
    poly([[795, 165], [795, 373], [540, 373]], { closed: false, endTip: 'stealth' });
    poly([[390, 373], [150, 373], [150, 183]], { closed: false, endTip: 'stealth' }); point(795, 165);
    text(139, 145, '+', { size: 13 }); text(138, 193, '$-$', { size: 15 });
    text(420, 455, '$\\frac{Y(s)}{R(s)}=\\frac{C(s)G(s)}{1+C(s)G(s)H(s)}$');
    text(420, 510, 'Negative feedback · disturbance rejection · measurement noise', { size: 16 });
  });
  example('Green’s theorem on a region with a hole', 'A compound hatched region has an outer positive boundary and an inner negative boundary. Native arcs carry orientation arrows; a tangent, an outward normal and the integral identity complete the construction.', () => {
    const ring = (cx: number, cy: number, rx: number, ry: number) => Array.from({ length: 100 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 50), cy + ry * Math.sin(i * Math.PI / 50)]);
    add('region', 'region', { rings: [ring(350, 220, 260, 160), ring(400, 215, 70, 55)], fill: hatch });
    arc(350, 220, 260, 15, 65, { ry: 160, endTip: 'stealth', stroke: blue, width: 3 });
    arc(400, 215, 70, 165, 245, { ry: 55, startTip: 'stealth', stroke: red, width: 3 });
    text(170, 115, '$C_{\\rm outer}$', { color: blue }); text(400, 215, '$C_{\\rm inner}$', { color: red }); text(265, 240, '$\\Omega$');
    point(350, 60, '$P$'); arrow(350, 60, 260, 60, { stroke: blue, label: '$\\mathbf t$' }); arrow(350, 60, 350, 5, { stroke: green, label: '$\\mathbf n$' });
    text(355, 450, '$\\oint_{\\partial\\Omega}(P\\,dx+Q\\,dy)=\\int\\!\\!\\int_\\Omega(Q_x-P_y)\\,dA$');
    text(355, 500, 'Outer boundary counterclockwise; inner boundary clockwise', { size: 16 });
  });
}
