const scaledImport = (options, body) => TD.importLatex(`\\begin{tikzpicture}[${options}]\n${body}\n\\end{tikzpicture}`).blocks[0].shapes;
T.test('Import scale: picture scaling includes explicit dimensions and preserves source', () => {
  const src = String.raw`\begin{tikzpicture}[scale=2]\draw (1,0) circle[radius=5mm];\end{tikzpicture}`;
  const s = TD.importLatex(src).blocks[0].shapes[0];
  T.eq(s.type, 'ellipse'); T.eq(s.cx, 80); T.eq(s.rx, 40);
  T.ok(TD.toTikz([s]).includes(src), 'unchanged source retained');
  s.stroke = '#ff0000';
  T.tex('import scale edited circle', TD.toTikz([s], { standalone: true }));
});
T.test('Import scale: nested scopes and option order compose', () => {
  const a = scaledImport('scale=2', String.raw`\begin{scope}[xshift=1cm,scale=3]\draw (1,0)--(2,0);\end{scope}`)[0];
  T.eq(a.type, 'line'); T.eq(a.x1, 320); T.eq(a.x2, 560);
  const b = scaledImport('', String.raw`\draw[scale=2,xshift=1cm] (1,0)--(2,0);`)[0];
  T.eq(b.x1, 160); T.eq(b.x2, 240);
});
T.test('Import scale: node size follows transform shape', () => {
  const plain = scaledImport('', String.raw`\node at (1,0) {$\left(x\right)$};`)[0];
  const kept = scaledImport('scale=2', String.raw`\node at (1,0) {$\left(x\right)$};`)[0];
  const scaled = scaledImport('scale=2,transform shape', String.raw`\node at (1,0) {$\left(x\right)$};`)[0];
  T.eq(kept.type, 'text'); T.eq(scaled.type, 'text'); T.eq(scaled.objectScale, 2);
  const a = TD.bbox(plain), b = TD.bbox(kept), c = TD.bbox(scaled);
  T.ok(Math.abs(a.w-b.w)<.01, 'untransformed text keeps its size');
  T.ok(Math.abs(c.w-2*a.w)<.01, 'transform shape scales text');
  T.eq(scaled.text, String.raw`$\left(x\right)$`);
  T.tex('import scale transformed math node', TD.toTikz([scaled], { standalone: true }));
});
T.test('Import scale: scale around and invalid values', () => {
  const s = scaledImport('', String.raw`\draw[scale around={2:(1,0)}] (1,0)--(2,0);`)[0];
  T.eq(s.type, 'line'); T.eq(s.x1, 40); T.eq(s.x2, 120);
  const bad = scaledImport('scale=unknown', String.raw`\draw (1,0)--(2,0);`)[0];
  T.eq(bad.type, 'tikz'); T.eq(bad.prev.length, 0);
});
T.test('LaTeX delimiters: recognize math-only commands and complete delimiter tokens', () => {
  for (const command of ['left', 'right', 'middle', 'bigl', 'Bigr', 'biggl', 'Biggr'])
    T.ok(TD.prose.html(TD.prose.parse('\\'+command)).includes('tx-warn'), command+' is a math command');
  const el = document.createElement('textarea'); el.dataset.tx = 'math'; document.body.append(el);
  try {
    for (const command of [String.raw`\left(`, String.raw`\left[`, String.raw`\left\{`, String.raw`\right)`, String.raw`\bigl(`, String.raw`\left\langle`]) {
      el.focus(); el.value = command; el.setSelectionRange(command.length,command.length);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      const pop = document.querySelector('#texComplete');
      T.ok(!pop.hidden, command+' suggestions visible');
      T.ok([...pop.querySelectorAll('.tc-name')].some(e=>e.textContent===command), command+' token recognized');
    }
  } finally { TD.texComplete.close(); el.remove(); }
});
const scaledQftSource = String.raw`% Requires: \usepackage{tikz} \usetikzlibrary{quantikz2} \usepackage{amsmath}
\begin{tikzpicture}[x=1cm, y=1cm]
\begin{scope}[scale around={1.5:(12.92,-26.05)}, transform shape]
\node[font=\small] at (12.92,-26.05) {\pgfinterruptpicture%
\begin{quantikz}
\lstick{$q_3$} & \gate{H} \gategroup[1,steps=4,style={draw=none}]{$\pi\left(x_3+\dfrac{x_2}{2}+\dfrac{x_1}{4}+\dfrac{x_0}{8}\right)$} \gategroup[1,steps=13,style={draw=none}]{QFT 4 qubits} & \gate{R_1} & \gate{R_2} & \gate{R_3} & & & & & & & & \swap{3} & \\
\lstick{$q_2$} & & \ctrl{-1} & & & \gate{H} \gategroup[1,steps=3,style={draw=none}]{$\pi\left(x_2+\dfrac{x_1}{2}+\dfrac{x_0}{4}\right)$} & \gate{R_1} & \gate{R_2} & & & & & & \swap{1} \\
\lstick{$q_1$} & & & \ctrl{-2} & & & \ctrl{-1} & & \gate{H} \gategroup[1,steps=2,style={draw=none}]{$\pi\left(x_1+\dfrac{x_0}{2}\right)$} & \gate{R_1} & & & & \targX{} \\
\lstick{$q_0$} & & & & \ctrl{-3} & & & \ctrl{-2} & & \ctrl{-1} & \gate{H} \gategroup[1,steps=1,style={draw=none}]{$\pi\left(x_0\right)$} & & \targX{} &
\end{quantikz}%
\endpgfinterruptpicture};
\end{scope}
\end{tikzpicture}`;
T.test('Import scale: QFT block preserves small font, scaling and math group labels', () => {
  const shapes = TD.importLatex(scaledQftSource).blocks[0].shapes;
  T.eq(shapes.length, 1); const s = shapes[0];
  T.eq(s.type, 'qc'); T.eq(s.objectScale, 1.5); T.eq(s.size, 'small');
  const L = TD.qcLayout(s), b = TD.bbox(s);
  T.eq(L.R, 4); T.ok(!L.warnings.some(w=>/left|right/.test(w)), 'math subcommands are not circuit commands');
  T.ok(L.ops.some(o=>o.t?.includes(String.raw`\pi\left(x_3`)), 'formula remains a complete math label');
  T.ok(Math.abs(b.w - L.bb.w*1.5)<.01, 'scaled block width');
  T.ok(Math.abs(b.x+b.w/2-12.92*40)<.01, 'scale around keeps node centre');
  const exported = TD.toTikz(shapes, { standalone: true });
  T.ok(exported.includes(String.raw`font=\small`), 'font retained on export');
  T.tex('import scaled QFT', exported);
  s.size = 'footnotesize';
  const edited = TD.toTikz(shapes, { standalone: true });
  T.ok(edited.includes('footnotesize') && edited.includes('scale around={1.5:'), 'editing keeps imported scale and formulas');
  T.tex('import scaled QFT edited labels', edited);
});
T.test('Import scale: node and inherited font sizes apply to scientific blocks', () => {
  for (const size of ['tiny', 'scriptsize', 'footnotesize', 'small', 'large', 'Large']) {
    const s = scaledImport('', `\\node[font=\\${size}] at (0,0) {\\begin{quantikz} & \\gate{H} & \\end{quantikz}};`)[0];
    T.eq(s.type, 'qc'); T.eq(s.size, size);
  }
  const s = scaledImport('font=\\footnotesize', String.raw`\begin{scope}[font=\small]\node[font=\bfseries] at (0,0) {\begin{quantikz} & \gate{H} & \end{quantikz}};\end{scope}`)[0];
  T.eq(s.type, 'qc'); T.eq(s.size, 'small'); T.eq(s.bold, true);
});
