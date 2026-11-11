// Colours in tikz-cd and xymatrix (js/cd.js, js/xy.js): read from the code onto the canvas, written back by the
// editor in the code's own form, kept through the tikz-cd ↔ xymatrix converters, and compiled by pdflatex.
const CD = TD.cd, XY = TD.xy;
const cdL = (src) => TD.cdLayout({ type: 'cd', x: 0, y: 0, src, color: '#000000' });
const xyL = (src) => XY.layout({ type: 'xy', x: 0, y: 0, src, color: '#000000' });
const lc = (s) => String(s || '').toLowerCase();

// what quiver writes
const QUIVER = `\\begin{tikzcd}
  \\textcolor{rgb,255:red,92;green,214;blue,92}{X} \\\\
  & {\\textcolor{red!50!black}{Y}} & Z
  \\arrow[from=1-1, to=2-2, draw={rgb,255:red,214;green,92;blue,92}]
  \\arrow["b"{text={rgb,255:red,214;green,92;blue,92}}, from=1-1, to=2-3]
\\end{tikzcd}`;

T.test('cd colour: names, rgb,255 expressions and mixes reach the canvas', () => {
  const L = cdL('\\begin{tikzcd} |[red]| A \\arrow[r, blue, "f"] \\arrow[d, draw=green, "g"] & B \\arrow[d, "h" {text=orange}] \\\\ C & D \\end{tikzcd}');
  const n = (t) => L.nodes.find((x) => x.t === `$${t}$`);
  T.eq(lc(n('A').color), '#ff0000', 'node |[red]|');
  T.eq(n('B').color, null, 'an uncoloured node');
  const ar = (r, c, i) => L.arrows.find((a) => a.src[0] === r && a.src[1] === c && a.src[2] === i).A;
  T.eq(lc(ar(0, 0, 0).color), '#0000ff', 'bare colour on an arrow'); T.eq(lc(ar(0, 0, 0).lcolor), '#0000ff', '…and its label');
  T.eq(lc(ar(0, 0, 1).color), '#00ff00', 'draw=green'); T.ok(!ar(0, 0, 1).lcolor, 'draw= leaves the label alone');
  const h = L.labels.find((l) => /h/.test(l.t));
  T.eq(lc(h.color), '#ff8000', 'label text=orange');
  const Q = cdL(QUIVER);
  T.ok(/#5cd65c/i.test(Q.nodes[0].t), 'quiver \\textcolor{rgb,255:…} becomes a hex KaTeX reads: ' + Q.nodes[0].t);
  T.ok(/#800000/i.test(Q.nodes[1].t), 'a mix red!50!black: ' + Q.nodes[1].t);
  T.eq(lc(Q.arrows[0].A.color), '#d65c5c', 'draw={rgb,255:…}');
  T.eq(lc(Q.labels.find((l) => /b/.test(l.t)).color), '#d65c5c', 'text={rgb,255:…}');
});

T.test('cd colour: the helpers the editor writes with', () => {
  T.eq(CD.colorSpec('#ff0000'), 'red'); T.eq(CD.colorSpec('#5cd65c'), 'rgb,255:red,92;green,214;blue,92');
  T.eq(CD.colorItem('red'), 'red'); T.eq(CD.colorItem('red', 'draw'), 'draw={red}');
  T.eq(CD.colorItem('rgb,255:red,1;green,2;blue,3'), 'color={rgb,255:red,1;green,2;blue,3}');
  T.eq(CD.colorOpt('draw={myblue}').spec, 'myblue', 'an unknown spec after a key still counts (kept verbatim)');
  T.eq(CD.colorOpt('myblue'), null, 'an unknown bare word is not taken for a colour');
  T.eq(CD.colorOpt('hook'), null); T.eq(CD.colorOpt('dashed'), null);
  T.eq(CD.splitColor('\\textcolor{red!50!black}{Y}').body, 'Y'); T.eq(CD.splitColor('\\textcolor{red}{a}+b').spec, null, 'only a wrapper round it all');
  T.eq(CD.joinColor('blue', 'X'), '\\textcolor{blue}{X}'); T.eq(CD.joinColor(null, 'X'), 'X');
  T.eq(CD.nodeColor('draw, red').spec, 'red'); T.eq(CD.nodeColor('draw=red'), null, 'a border colour is not the object\'s');
});

const XSRC = '\\xymatrix{\\textcolor{blue}{A} \\ar@[red][r]^{\\textcolor{green}{f}} \\ar@[myblue][d] & B \\\\ C & D}';

T.test('xy colour: @[colour] and \\textcolor read, drawn, and written back', () => {
  const cd = XY.toCd(XSRC);
  T.ok(/draw=\{red\}/.test(cd), '@[red] is a line colour: ' + cd);
  T.ok(/xy=\{@\[myblue\]\}/.test(cd), 'an unknown colour stays a raw part: ' + cd);
  const ws = (t) => t.replace(/\s+/g, '');
  T.eq(ws(XY.fromCd(cd)), ws(XSRC), 'back unchanged (laid out as a grid)');
  const L = xyL(XSRC);
  T.ok(L.arrows.some((a) => lc(a.A.color) === '#ff0000'), 'the arrow is red');
  T.ok(L.labels.some((l) => /#00ff00/i.test(l.t) || lc(l.color) === '#00ff00'), 'the label is green');
  T.ok(L.nodes.some((n) => /#0000ff/i.test(n.t) || lc(n.color) === '#0000ff'), 'the object is blue');
});

T.test('xy colour: the tikz-cd ↔ xymatrix converters keep colours', () => {
  const x = XY.fromTikzcd('\\begin{tikzcd} |[red]| A \\arrow[r, blue, "f"] \\arrow[d, draw={rgb,255:red,1;green,2;blue,3}, "g"\' {text=orange}] & B \\\\ C \\end{tikzcd}');
  T.ok(/\\textcolor\{red\}\{A\}/.test(x.code), 'object: ' + x.code);
  T.ok(/@\[blue\]/.test(x.code) && /\\textcolor\{blue\}\{f\}/.test(x.code), 'blue arrow and label: ' + x.code);
  T.ok(/@\[rgb,255:red,1;green,2;blue,3\]/.test(x.code), 'rgb line: ' + x.code);
  T.ok(/\\textcolor\{orange\}\{g\}/.test(x.code), 'label text=: ' + x.code);
  T.ok(!x.warnings.some((w) => /colou?r|blue|orange|red/i.test(w)), 'no warnings about colours: ' + x.warnings.join('; '));
  const back = XY.toTikzcd(x.code);
  T.ok(/\\textcolor\{red\}\{A\}/.test(back.code) && /draw=\{blue\}/.test(back.code), 'and back: ' + back.code);
});

T.test('xy colour: the export loads xy with its colour option only when it needs it', () => {
  const tik = (src) => TD.toTikz([{ type: 'xy', x: 0, y: 0, src, color: '#000000' }], { standalone: true });
  const a = tik(XSRC), b = tik('\\xymatrix{A \\ar[r] & B}');
  T.ok(/\\usepackage\[all,color\]\{xy\}/.test(a), a);
  T.ok(/\\usepackage\[all\]\{xy\}/.test(b) && !/xy:color/.test(a + b), b);
  T.tex('xy-colour', a);
  T.tex('cd-colour', TD.toTikz([{ type: 'cd', x: 0, y: 0, src: QUIVER, color: '#000000' }], { standalone: true }));
});
