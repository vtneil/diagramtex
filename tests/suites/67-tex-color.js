// One colour control everywhere (js/colorpicker.js TD.texColor): a picked colour is written as an xcolor name
// when it is one, else as rgb,255:red,R;green,G;blue,B (braced in key=value lists). Each block reads it back
// onto the canvas, and the code compiles.
const TC = TD.texColor;
const RGB = 'rgb,255:red,18;green,52;blue,86', HEX = '#123456';
const lc = (s) => String(s || '').toLowerCase();

T.test('tex colour: presets by name, the rest as rgb,255; wrap braces lists', () => {
  T.eq(TC.spec('#ff0000'), 'red', 'a base name');
  T.eq(TC.spec(TD.tikzColor('blue!20')), 'blue!20', 'a preset tint');
  T.eq(TC.spec(HEX), RGB, 'anything else');
  T.eq(lc(TD.tikzColor(RGB)), HEX, 'reads back');
  T.eq(TC.wrap(RGB), `{${RGB}}`, 'braced');
  T.eq(TC.wrap('red'), 'red', 'a name stays bare');
  T.eq(TC.unwrap(`{${RGB}}`), RGB, 'unwrap');
  T.eq(TC.label(RGB), 'RGB 18, 52, 86', 'label');
});

const qc = (src) => ({ type: 'qc', x: 0, y: 0, src, size: 'normalsize', font: 'default', color: '#000000' });
const QSRC = `\\begin{quantikz}\n& \\gate[style={fill={${RGB}},draw=red}]{H} & \\ctrl{1} & \\\\\n& \\gategroup[1,steps=2,background,style={dashed,fill={${RGB}}}]{g} & \\targ{} &\n\\end{quantikz}`;
const FSRC = `\\begin{tikzpicture}[shorten >=1pt,node distance=2cm,on grid,auto]\n  \\node[state,initial,fill={${RGB}},text=red] (q0) {$q_0$};\n  \\node[state,accepting,draw={${RGB}}] (q1) [right=of q0] {$q_1$};\n  \\path[->] (q0) edge[color={${RGB}},text=blue] node {a} (q1);\n\\end{tikzpicture}`;
const BSRC = `\\begin{bytefield}{16}\n  \\bitbox{8}[bgcolor={${RGB}}]{A} & \\bitbox{8}[bgcolor=red!20]{B}\n\\end{bytefield}`;

T.test('tex colour: quantikz, automata and bytefield read braced rgb,255', () => {
  const qs = TD.qc.draw(qc(QSRC), { export: true, paper: '#ffffff' });
  T.ok(lc(qs).includes(HEX), 'quantikz fill');
  const L = TD.fsm.layout({ type: 'automata', x: 0, y: 0, src: FSRC, color: '#000000' });
  T.ok(L.circles.some((c) => lc(c.fill) === HEX), 'state fill');
  T.ok(L.circles.some((c) => lc(c.color) === HEX), 'state line');
  T.ok(L.texts.some((t) => lc(t.color) === '#ff0000'), 'state text');
  T.ok(L.paths.some((p) => lc(p.color) === HEX), 'transition colour');
  const bs = TD.bytefield.draw({ type: 'bytefield', x: 0, y: 0, src: BSRC, color: '#000000' }, { export: true, paper: '#ffffff' });
  T.ok(lc(bs).includes(HEX), 'bytefield bgcolor');
});

T.test('tex colour: the code compiles', () => {
  T.tex('texcolor-qc', TD.toTikz([{ ...qc(QSRC), id: 'q' }], { standalone: true }));
  T.tex('texcolor-fsm', TD.toTikz([{ type: 'automata', x: 0, y: 0, src: FSRC, color: '#000000', id: 'f' }], { standalone: true }));
  T.tex('texcolor-bf', TD.toTikz([{ type: 'bytefield', x: 0, y: 0, src: BSRC, color: '#000000', id: 'b' }], { standalone: true }));
});
