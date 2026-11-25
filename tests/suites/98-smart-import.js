// Smart import contracts: no invented geometry, context travels with the figure, and source edits stay local.
T.test('smart import: definitions outside a picture and parameterized styles survive export', () => {
  const src = String.raw`\tikzset{ink/.style={draw=#1, line width=2pt}, ink/.default=blue}
\begin{tikzpicture}
\draw[ink=red] (0,0) -- (1,0);
\draw[ink] (0,1) -- (1,1);
\end{tikzpicture}`;
  const r = TD.importLatex(src), sh = r.blocks[0].shapes;
  const lines = sh.filter(s => s.type === 'line');
  T.eq(lines.length, 2);
  T.eq(lines[0].stroke, '#ff0000'); T.eq(lines[1].stroke, '#0000ff');
  const out = TD.toTikz(sh, { standalone: true });
  T.ok(out.includes('ink/.style={draw=#1, line width=2pt}'), 'definition retained');
  T.ok(out.includes('ink=red'), 'invocation retained');
  T.tex('smart import parameterized style', out);
});

T.test('smart import: composable calc coordinates and symbolic directions', () => {
  const src = String.raw`\begin{tikzpicture}
\coordinate (A) at (1,2);
\coordinate (B) at (5,6);
\coordinate (C) at ($(A |- B)!.5!(B |- A)$);
\coordinate (D) at ($(A)+(2,1)$);
\coordinate (E) at (left:2);
\end{tikzpicture}`;
  const r = TD.importLatex(src), sh = r.blocks[0].shapes;
  const c = sh.find(s => s.tikzName === 'C'), d = sh.find(s => s.tikzName === 'D'), e = sh.find(s => s.tikzName === 'E');
  const cm = TD.PX_PER_CM;
  T.ok(c && Math.abs(c.x - 3*cm) < .01 && Math.abs(c.y + 4*cm) < .01, 'nested projection midpoint');
  T.ok(d && Math.abs(d.x - 3*cm) < .01 && Math.abs(d.y + 3*cm) < .01, 'coordinate addition');
  T.ok(e && Math.abs(e.x + 2*cm) < .01, 'left polar direction');
});

T.test('smart import: missing positions and dependent nodes have no invented previews', () => {
  const src = String.raw`\begin{tikzpicture}
\node (A) at (missing) {A};
\node[below=of A] (B) {B};
\draw (A) -- (B);
\end{tikzpicture}`;
  const r = TD.importLatex(src);
  T.eq(r.analysis.length, 3);
  T.ok(r.analysis.every(a => a.status === 'unresolved' && !a.preview), JSON.stringify(r.analysis));
  const editable = TD.importLatex(src, { editable: true });
  T.ok(editable.blocks[0].shapes.every(s => s.type === 'tikz'), 'no unresolved geometry converted');
  T.ok(TD.toTikz(r.blocks[0].shapes).includes('(missing)'), 'unknown source retained');
});

T.test('smart import: a label edit patches only its source span', () => {
  const src = String.raw`\begin{tikzpicture}
  % keep this comment
  \node [text=blue] (A) at (1,2) {Original {label}}; % trailing comment
\end{tikzpicture}`;
  const sh = TD.importLatex(src).blocks[0].shapes;
  const label = sh.find(s => s.type === 'text');
  T.ok(label && label.tex.label, 'source label span recorded');
  label.text = 'New $x^2$';
  const out = TD.toTikz(sh);
  T.ok(out.includes('\\node [text=blue] (A) at (1,2) {New $x^2$}; % trailing comment'), out);
  T.ok(out.includes('% keep this comment'), out);
});

T.test('smart import: optional definitions and library-only preambles travel with a figure', () => {
  const r = TD.importLatex(String.raw`\begin{tikzpicture}\draw[ink] (0,0)--(1,0);\end{tikzpicture}`, {
    definitions: String.raw`\usetikzlibrary{calc}\tikzset{ink/.style={blue}}`
  });
  T.ok(r.blocks[0].shapes.some(s => s.type === 'line' && s.stroke === '#0000ff'), 'context applied');
  const out = TD.toTikz(r.blocks[0].shapes, { standalone: true });
  T.ok(out.includes('calc') && out.includes('ink/.style'), out);
  const libs = TD.importLatex(String.raw`\usetikzlibrary{positioning-plus}\begin{tikzpicture}\draw (0,0)--(1,0);\end{tikzpicture}`);
  T.ok(TD.toTikz(libs.blocks[0].shapes, { standalone: true }).includes('positioning-plus'), 'external library preserved even without definitions');
});

T.test('smart import: DMFT library-dependent flowchart is preserved with unresolved layout', () => {
  const src = T.fixtures['import/dmft-flowchart.tex'];
  const r = TD.importLatex(src);
  T.ok(r.analysis.some(a => a.status === 'unresolved' && a.issues.some(w => /Minimum Width/.test(w))), 'shared node sizing diagnosed');
  T.ok(r.analysis.some(a => a.issues.some(w => /append after command/.test(w))), 'procedural header diagnosed');
  const sh = r.blocks.filter(b => b.type === 'diagram').flatMap(b => b.shapes);
  const out = TD.toTikz(sh, { standalone: true });
  for (const text of ['positioning-plus', 'node-families', 'basic box/.style', 'header/.style', 'h-rho', 'every edge/.append style']) T.ok(out.includes(text), text + ' preserved');
  const plain = src.slice(src.indexOf('\\begin{tikzpicture}'), src.indexOf('\\end{tikzpicture}') + '\\end{tikzpicture}'.length);
  const bare = TD.importLatex(plain);
  T.ok(bare.analysis.some(a => a.status === 'unresolved'), 'picture-only failure is explicit');
});

T.test('smart import: styles are scoped to their scope and picture', () => {
  const src = String.raw`\tikzset{ink/.style={blue}}
\begin{tikzpicture}
\begin{scope}\tikzset{ink/.style={red}}\draw[ink] (0,0)--(1,0);\end{scope}
\draw[ink] (0,1)--(1,1);
\end{tikzpicture}
\begin{tikzpicture}\draw[ink] (0,0)--(1,0);\end{tikzpicture}`;
  const r = TD.importLatex(src);
  const lines = r.blocks.filter(b=>b.type==='diagram').flatMap(b=>b.shapes).filter(s=>s.type==='line');
  T.eq(lines.map(s=>s.stroke), ['#ff0000', '#0000ff', '#0000ff']);
});

T.test('smart import: recursive styles terminate and stay as code', () => {
  const r = TD.importLatex(String.raw`\tikzset{a/.style={b,b},b/.style={a,a}}\begin{tikzpicture}\draw[a] (0,0)--(1,0);\end{tikzpicture}`);
  T.ok(r.kept.length > 0, 'recursive style not marked editable');
});

T.test('smart import: unresolved transforms suppress node and scope previews', () => {
  const r = TD.importLatex(String.raw`\begin{tikzpicture}
\node[shift=(left:missing_distance)] (A) {A};
\begin{scope}[xshift=missing_distance]\draw (0,0)--(1,0);\end{scope}
\end{tikzpicture}`);
  T.ok(r.analysis.every(a=>a.status==='unresolved' && !a.preview), JSON.stringify(r.analysis));
});

T.test('smart import: saved source bindings patch multiline labels without losing node names', () => {
  const src = String.raw`\begin{tikzpicture}\node (A) at (1,2) {Old};\end{tikzpicture}`;
  const sh = JSON.parse(JSON.stringify(TD.importLatex(src).blocks[0].shapes));
  const label = sh.find(s => s.type === 'text');
  label.text = 'First\nSecond';
  const out = TD.toTikz(sh, { standalone:true });
  T.ok(out.includes(String.raw`\node (A) at (1,2) {First\\Second};`), out);
  T.tex('smart import multiline source patch', out);
});

T.test('smart import: dialog updates when optional definitions change', async () => {
  document.querySelector('[data-cmd="import"]').click();
  const input = document.querySelector('#impText'), defs = document.querySelector('#impDefs'), msg = document.querySelector('#impMsg');
  const mode = document.querySelector('#impHow .on').dataset.how;
  try {
    document.querySelector('#impHow [data-how="code"]').click();
    input.value = String.raw`\begin{tikzpicture}\node at (\x,0) {A};\end{tikzpicture}`;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    for (let i=0;i<30 && !msg.textContent.includes('unresolved');i++) await new Promise(r=>setTimeout(r,20));
    T.ok(msg.textContent.includes('unresolved'), msg.textContent);
    defs.value = String.raw`\def\x{2}`;
    defs.dispatchEvent(new Event('input', { bubbles:true }));
    for (let i=0;i<30 && msg.textContent.includes('unresolved');i++) await new Promise(r=>setTimeout(r,20));
    T.ok(!msg.textContent.includes('unresolved') && msg.textContent.includes('1 shape'), msg.textContent);
  } finally {
    input.value=''; defs.value='';
    document.querySelector(`#impHow [data-how="${mode}"]`).click();
    document.querySelector('#impClose').click();
  }
});

// Measured in TeX Live (\pgfgetlastxy after \path): the options are a transformation in the picture's coordinates,
// the last applied first; a shifted node name is still cut at the node's border, unshifted, so it stays code.
T.test('smart import: ([xshift=…]a.north) and the other option-prefixed coordinates are where TikZ puts them', () => {
  const K = TD.PT_PER_PX;
  const cases = [
    ['', '(a.north) -- ([xshift=1cm]a.north)', [28.45274, 0]],
    ['scale=2', '(a.north) -- ([shift={(1,2)}]a.north)', [56.90549, 113.81097]],
    ['rotate=90', '(a.north) -- ([xshift=1cm]a.north)', [0, 28.45275]],
    ['', '(0,0) -- ([rotate=90]a.north)', [-35.40237, 28.45274]],
    ['', '(0,0) -- ([scale=2]a.north)', [56.90549, 70.80475]],
    ['', '(0,0) -- ([xshift=1cm,yshift=2mm]a.east)', [64.18846, 34.14328]],
    ['', '(0,0) -- ([shift={(a.east)}]1,0)', [64.18846, 28.45274]],
    ['scale=2', '(0,0) -- ([xshift=1cm]1,1)', [113.81097, 56.90549]],
  ];
  for (const [po, path, want] of cases) {
    const sh = TD.importLatex(`\\begin{tikzpicture}[${po}]\\node[draw] (a) at (1,1) {A};\\draw ${path};\\end{tikzpicture}`).blocks.flatMap((b) => b.shapes);
    const L = sh.find((s) => s.type === 'line');
    T.ok(L, `${po} ${path}: a line, not code (${sh.map((s) => s.type)})`);
    const dx = (L.x2 - L.x1) * K, dy = -(L.y2 - L.y1) * K;
    T.ok(Math.abs(dx - want[0]) < 0.12 && Math.abs(dy - want[1]) < 0.12, `${po} ${path}: ${dx.toFixed(3)},${dy.toFixed(3)} vs ${want}`);
  }
  const sh = TD.importLatex('\\begin{tikzpicture}\\node[draw] (a) {A};\\draw ([xshift=1mm]a) -- (3,0);\\end{tikzpicture}').blocks.flatMap((b) => b.shapes);
  T.eq(sh.map((s) => s.type).join(','), 'rect,tikz', 'a shifted node name stays code');
  // an angle anchor below zero or with a fraction is the same angle's
  const end = (a) => TD.importLatex(`\\begin{tikzpicture}\\node[draw, minimum width=2cm] (a) {A};\\draw (0,0) -- (a.${a});\\end{tikzpicture}`).blocks.flatMap((b) => b.shapes).find((s) => s.type === 'line');
  const p = end('-20'), q = end('340');
  T.ok(p && q && Math.abs(p.x2 - q.x2) < 1e-6 && Math.abs(p.y2 - q.y2) < 1e-6, 'a.-20 is a.340');
  T.ok(end('12.5'), 'a.12.5 is read');
});

// Measured in TeX Live (\sbox round the picture, line width 0): a radius without a unit is along the x and y vectors
T.test('smart import: a circle\'s radius in x/y units is an ellipse as wide and high as TikZ draws it', () => {
  const K = TD.PT_PER_PX;
  for (const [po, path, w, h] of [['x=2cm,y=1cm', '(0,0) circle (1)', 113.811, 56.90549], ['x=2cm,y=1cm', '(0,0) circle[radius=1]', 113.811, 56.90549],
    ['x=2cm,y=1cm', '(0,0) ellipse (1 and 2)', 113.811, 113.81097], ['x=2cm,y=1cm', '(0,0) circle (5mm)', 28.45273, 28.45273],
    ['x=2cm,y=-1cm', '(0,0) circle (1)', 113.811, 56.90549], ['x=0.5cm,y=0.5cm', '(0,0) circle (1) (3,0) circle[x radius=1, y radius=2]', 71.13182, 56.90546]]) {
    const sh = TD.importLatex(`\\begin{tikzpicture}[${po}]\\draw ${path};\\end{tikzpicture}`).blocks.flatMap((b) => b.shapes);
    T.ok(sh.length && sh.every((s) => s.type === 'ellipse'), `${po} ${path}: ellipses (${sh.map((s) => s.type)})`);
    const x1 = Math.min(...sh.map((s) => s.cx - s.rx)), x2 = Math.max(...sh.map((s) => s.cx + s.rx));
    const y1 = Math.min(...sh.map((s) => s.cy - s.ry)), y2 = Math.max(...sh.map((s) => s.cy + s.ry));
    T.ok(Math.abs((x2 - x1) * K - w) < 0.01 && Math.abs((y2 - y1) * K - h) < 0.01, `${po} ${path}: ${((x2 - x1) * K).toFixed(3)} x ${((y2 - y1) * K).toFixed(3)} vs ${w} x ${h}`);
  }
});
T.test('smart import: an arc\'s radius in x/y units follows them when they point right and up; flipped ones stay code', () => {
  const K = TD.PT_PER_PX, one = (po, path) => TD.importLatex(`\\begin{tikzpicture}[${po}, line width=0pt]\\draw ${path};\\end{tikzpicture}`).blocks.flatMap((b) => b.shapes);
  for (const [po, path, w, h] of [['x=2cm,y=1cm', '(0,0) arc (0:180:1)', 113.811, 28.45274], ['x=2cm,y=1cm', '(0,0) arc[start angle=0, end angle=90, radius=1]', 56.9055, 28.45274],
    ['x=2cm,y=1cm', '(0,0) arc (0:90:1cm)', 28.45274, 28.45274]]) {
    const sh = one(po, path), b = TD.bbox(sh[0]);
    T.eq(sh.map((s) => s.type).join(','), 'arc', `${po} ${path}`);
    T.ok(Math.abs(b.w * K - w) < 0.01 && Math.abs(b.h * K - h) < 0.01, `${po} ${path}: ${(b.w * K).toFixed(3)} x ${(b.h * K).toFixed(3)} vs ${w} x ${h}`);
  }
  T.eq(one('x=2cm,y=-1cm', '(0,0) arc (0:90:1)').map((s) => s.type).join(','), 'tikz', 'flipped y: code');
});
