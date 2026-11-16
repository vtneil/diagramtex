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
