// TikZ code kept as written, drawn by the in-browser pdfLaTeX (src/application/kept-preview.ts): only code outside the
// specialised editors; a statement in a picture compiled with the rest of the picture invisible (TD.toTikz `only`);
// the drawing placed where LaTeX puts it, and moved with the code without compiling again.
{
  const kept = (id, code, extra = {}) => ({ ...TD.TYPES.tikz.create({ x: 0, y: 0 }), id, code, ...extra });
  const KP = () => TD.keptPreview;

  T.test('kept preview: code in a block\'s package is drawn by the app; plain TikZ and packages without a block are compiled', () => {
    for (const code of [String.raw`\draw (0,0) circle (1);`, String.raw`\foreach \i in {1,...,5} \draw (\i,0) -- (\i,1);`, String.raw`\smartdiagram[circular diagram]{a,b,c}`, String.raw`\Vertex{A}`])
      T.ok(KP().eligible(kept('a', code)), 'compiled: ' + code);
    for (const code of [String.raw`\begin{axis}\addplot {x};\end{axis}`, String.raw`\draw (0,0) to[R=$R_1$] (2,0);`, String.raw`\graph { a -> b };`,
      String.raw`\node[state, initial] (q0) {$q_0$};`, String.raw`\begin{scope}[tdplot_main_coords]\draw (0,0,0) -- (1,0,0);\end{scope}`, String.raw`\tkzDrawPoints(A,B)`])
      T.ok(!KP().eligible(kept('a', code)), 'drawn by the app: ' + code);
    T.ok(!KP().eligible({ ...kept('a', '\\tikzset{x/.style={red}}'), kind: 'defs' }), 'definitions draw nothing');
    T.ok(!KP().eligible(kept('a', '\\draw (0,0,0) -- (1,0,0);', { ctx: ['tdplot_main_coords, scale=2'] })), 'in a 3-D picture (its options)');
  });

  T.test('kept preview: plain code in a picture that uses a block\'s package is the block\'s, drawn by the app', () => {
    const state = kept('ks', '\\node[state, initial] (A) {$q_0$};', { g: 'fsm' }), edge = kept('ke', '\\path[->] (A) edge[loop above] (A);', { g: 'fsm' });
    const plain = kept('kq', '\\draw (0,0) -- (1,1);', { g: 'other' }), alone = kept('kz', '\\draw (0,0) -- (1,0);', { g: 'other' });
    const id = TD.app.newDoc('kept block picture', [state, edge, plain, alone], null, null);
    TD.app.setMode('diagram');
    const live = (k) => TD.state.doc.shapes.find((x) => x.id === k);
    T.ok(KP().eligible(live('ke')), 'its own code is plain TikZ');
    T.eq(KP().status(live('ke')).kind, 'editor', 'but its picture is an automaton');
    T.ok(KP().drawnOf(live('ke'), true) === null, 'never compiled');
    T.ok(KP().status(live('kq')).kind !== 'editor', 'a plain picture: compiled');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: a circuit or an automaton is known by its parts and states, with its package loaded', () => {
    const pre = (extra) => ({ ...kept('p' + Math.random().toString(36).slice(2, 7), ''), kind: 'defs', pre: true, ...extra });
    const cases = [
      ['a switch on a path', [kept('c1', '\\draw (0,0) to[cspst] (2,0);')], true],
      ['a transistor node, circuitikz loaded', [pre({ pkgs: ['circuitikz'] }), kept('c2', '\\node[nmos, xscale=-1] (m) at (0,0) {};')], true],
      ['a circuitikz shape by pgf, circuitikz loaded', [pre({ pkgs: ['circuitikz'] }), kept('c3', '\\pgfnode{resistorshape}{center}{}{}{\\pgfusepath{draw}}')], true],
      ['states through nodes={…}, automata loaded', [pre({ libs: ['automata'] }), kept('c4', '\\matrix[matrix of nodes, nodes={state}] {a & b\\\\};')], true],
      ['a node of the picture\'s own style named like a part', [pre({ pkgs: ['circuitikz'] }), kept('c5', '\\tikzset{adder/.style={circle, draw}}\\node[adder] (s) at (0,0) {};')], false],
      ['no package: a style that happens to share a name', [kept('c6', '\\node[nmos] at (0,0) {};')], false],
      ['states of the picture\'s own style', [pre({ libs: ['automata'] }), kept('c7', '\\tikzset{state/.style={draw}}\\matrix[matrix of nodes, nodes={state}] {a & b\\\\};')], false],
    ];
    for (const [what, list, block] of cases) {
      for (const x of list) x.g = 'cz';
      const id = TD.app.newDoc('kept ' + what, list, null, null);
      TD.app.setMode('diagram');
      const live = TD.state.doc.shapes.find((x) => x.type === 'tikz' && !x.pre);
      T.eq(KP().status(live).kind === 'editor', block, what + ': ' + JSON.stringify(KP().status(live)));
      TD.app.cmd.docAction?.('del', id);
    }
  });

  T.test('kept preview: a package or TikZ library the engine hasn\'t is left out and the picture compiled again', () => {
    const doc = '\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath, stmaryrd,bbm}\n\\usepackage[all]{tikz-network}\n\\usetikzlibrary{arrows.meta, hobby}\n';
    const W = KP().withoutMissing;
    T.eq(W(doc, "! LaTeX Error: File `stmaryrd.sty' not found."), doc.replace('{amsmath, stmaryrd,bbm}', '{amsmath, bbm}'), 'a package in a list');
    T.ok(!W(doc, "! LaTeX Error: File `tikz-network.sty' not found.").includes('tikz-network'), 'a package with options');
    T.eq(W(doc, "I did not find the tikz library 'hobby'"), doc.replace('arrows.meta, hobby', 'arrows.meta'));
    T.eq(W(doc, 'Undefined control sequence'), doc, 'anything else: unchanged');
    const log = 'x\n! Undefined control sequence.\n<argument> \\pgfmathparse {\\myLen \n                                 }\nl.12 \\draw (0,0) -- (\\myLen\n                   ,1);\n';
    T.eq(KP().named('Undefined control sequence.', log), 'Undefined control sequence \\myLen', 'the command TeX didn\'t know');
    T.eq(KP().named('Missing $ inserted.', log), 'Missing $ inserted.');
  });

  T.test('kept preview: a statement is written with the rest of its picture drawn invisibly, definitions untouched', () => {
    const rect = { ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.app.defaults()), id: 'r', x: 0, y: 0, w: 40, h: 40 };
    const defs = { ...kept('d', '\\tikzset{red line/.style={red, thick}}'), kind: 'defs' };
    const a = kept('a', '\\draw[red line] (0,0) -- (1,1);'), b = kept('b', '\\draw (2,0) -- (3,1);');
    const code = TD.toTikz([defs, rect, a, b], { standalone: true, only: ['a'] });
    const body = code.slice(code.indexOf('\\begin{tikzpicture}'));
    const off = '\\TDoff\n', on = '\\TDon\n';
    const at = (t) => body.indexOf(t);
    T.ok(at('red line/.style') < at(off), 'the definition before any switch:\n' + body);
    T.ok(at(off) < at('rectangle') && at('rectangle') < at(on) && at(on) < at('(0,0) -- (1,1)') && at('(0,0) -- (1,1)') < body.lastIndexOf(off) && body.lastIndexOf(off) < at('(2,0) -- (3,1)'),
      'the rectangle and the other statement off, the statement on:\n' + body);
    T.ok(!TD.toTikz([defs, rect, a, b], { standalone: true }).includes('TDoff'), 'an ordinary export switches nothing');
  });

  T.test('kept preview: a picture\'s definitions hold for its statements written in scopes of their own', () => {
    const src = String.raw`\begin{tikzpicture}[scale=2]
\tikzstyle{vertex}=[draw,circle,fill,minimum size=10,inner sep=0]
\node[vertex] (a) at (0,0) {};
\node[vertex] at (1,1) {} edge[bend left] (a);
\end{tikzpicture}`;
    const shapes = TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
    const code = shapes.find((s) => s.type === 'tikz' && s.kind === 'code'), native = shapes.find((s) => s.type !== 'tikz');
    T.ok(code && native && shapes.some((s) => s.kind === 'defs'), 'a definition, a node drawn by the app and a statement kept: ' + shapes.map((s) => s.type + ':' + (s.kind || '')));
    for (const x of shapes) x.g = 'dv';
    // the compile's source (the rest drawn invisibly), and the picture edited (its node moved): each statement in scopes of its own
    T.tex('kept-defs-only', TD.toTikz(shapes.map((x) => ({ ...x })), { standalone: true, only: [code.id] }));
    TD.translate(native, 8, 0);
    T.tex('kept-defs-edited', TD.toTikz(shapes, { standalone: true }));
  });

  // the alpha of the drawn picture at a canvas point
  const alphaAt = async (D, x, y) => {
    const img = new Image(); img.src = D.href; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = Math.floor((x - D.x) / D.w * c.width), py = Math.floor((y - D.y) / D.h * c.height);
    return g.getImageData(Math.max(0, Math.min(c.width - 1, px)), Math.max(0, Math.min(c.height - 1, py)), 1, 1).data[3];
  };

  T.test('kept preview: kept code is drawn by pdfLaTeX where LaTeX puts it, and a move doesn\'t compile it again', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return; // no bundle on this site (made locally by scripts/tex-bundle.mjs)
    await KP().allow();
    const PX = TD.PX_PER_CM, BORDER = 4 / 72.27 * 2.54; // standalone's border, cm
    const s = kept('k1', '\\fill (0,0) rectangle (2,1);', { g: undefined });
    const id = TD.app.newDoc('kept preview', [s], null, null);
    TD.app.setMode('diagram');
    const live = TD.state.doc.shapes.find((x) => x.id === 'k1');
    TD.app.render();
    await KP().settled();
    const D = KP().drawnOf(live);
    T.ok(D, 'drawn: ' + JSON.stringify(KP().status(live)));
    T.eq(KP().status(live).kind, 'drawn');
    // the rectangle from (0,0) to (2,1) cm, y up: on the canvas from (0,-40) to (80,0), with the border round it
    const near = (a, b, msg) => T.ok(Math.abs(a - b) < 1, `${msg}: ${a} vs ${b}`);
    near(D.x, -BORDER * PX, 'left'); near(D.y, -(1 + BORDER) * PX, 'top');
    near(D.w, (2 + 2 * BORDER) * PX, 'width'); near(D.h, (1 + 2 * BORDER) * PX, 'height');
    T.ok(await alphaAt(D, 40, -20) > 200, 'ink inside the rectangle');
    T.ok(await alphaAt(D, -3, 3) < 10, 'none outside it');
    T.ok(TD.app.shapesSvg([live], 4, false).includes('<image class="rawtikz-tex"'), 'the canvas draws LaTeX\'s picture');
    // moved: drawn moved, from the same compile
    TD.translate(live, 40, 20);
    const M = KP().drawnOf(live);
    T.eq(M.href, D.href, 'the same picture');
    near(M.x, D.x + 40, 'moved left'); near(M.y, D.y + 20, 'moved top');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: a statement in a picture is drawn alone, by the names of the rest of the picture', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    // a native rectangle (drawn by the app) and a named point in one picture; the kept statement draws from the point
    const rect = { ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.app.defaults()), id: 'kr', x: 0, y: -40, w: 40, h: 40, g: 'pic', fill: '#000000' };
    const P = { ...TD.TYPES.coord.create({ x: 2 * PX, y: 0 }), id: 'kp', tikzName: 'P', g: 'pic' };
    const s = kept('kk', '\\draw[line width=4pt] (P) -- ++(1,0);', { g: 'pic' });
    const id = TD.app.newDoc('kept fragment', [rect, P, s], null, null);
    TD.app.setMode('diagram');
    const live = TD.state.doc.shapes.find((x) => x.id === 'kk');
    TD.app.render();
    await KP().settled();
    const D = KP().drawnOf(live);
    T.ok(D, 'drawn: ' + JSON.stringify(KP().status(live)));
    T.ok(await alphaAt(D, 2.5 * PX, 0) > 200, 'the statement\'s line, from P');
    T.ok(await alphaAt(D, 0.5 * PX, -0.5 * PX) < 10, 'not the rectangle, which the app draws');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: a statement drawn invisibly stays so with an opacity of its own', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    const faint = kept('kf', '\\fill[opacity=.5] (0,0) rectangle (1,1);', { g: 'op' }), line = kept('kl', '\\draw[line width=4pt] (2,0) -- (3,0);', { g: 'op' });
    const id = TD.app.newDoc('kept opacity', [faint, line], null, null);
    TD.app.setMode('diagram');
    const live = TD.state.doc.shapes.find((x) => x.id === 'kl');
    TD.app.render();
    await KP().settled();
    const D = KP().drawnOf(live);
    T.ok(D, 'drawn: ' + JSON.stringify(KP().status(live)));
    T.ok(await alphaAt(D, 2.5 * PX, 0) > 200, 'its line');
    T.ok(await alphaAt(D, 0.5 * PX, -0.5 * PX) < 10, 'not the half-transparent square');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: a statement on a layer is drawn invisibly too, and shows in its own picture', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    const layers = { ...kept('kL0', '\\pgfdeclarelayer{background}\\pgfsetlayers{background,main}', { g: 'ly' }), kind: 'defs', pre: true };
    const back = kept('kL1', '\\begin{pgfonlayer}{background}\\fill (0,0) rectangle (1,1);\\end{pgfonlayer}', { g: 'ly' });
    const line = kept('kL2', '\\draw[line width=4pt] (2,0) -- (3,0);', { g: 'ly' });
    const id = TD.app.newDoc('kept layer', [layers, back, line], null, null);
    TD.app.setMode('diagram');
    const L = (k) => TD.state.doc.shapes.find((x) => x.id === k);
    TD.app.render();
    await KP().settled();
    const DL = KP().drawnOf(L('kL2')), DB = KP().drawnOf(L('kL1'));
    T.ok(DL && DB, 'drawn: ' + JSON.stringify([KP().status(L('kL2')), KP().status(L('kL1'))]));
    T.ok(await alphaAt(DL, 2.5 * PX, 0) > 200, 'the line');
    T.ok(await alphaAt(DL, 0.5 * PX, -0.5 * PX) < 10, 'not the square on the background layer');
    T.ok(await alphaAt(DB, 0.5 * PX, -0.5 * PX) > 200, 'the square, in its own picture');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: an unchanged picture is compiled as written, switched statement by statement', async () => {
    // a local bounding box a statement in its scope names: the scope must stay one, as written
    const src = String.raw`\begin{tikzpicture}
\begin{scope}[local bounding box=box]
\node (a) at (0,0) {A};
\path[fill=black, postaction={draw}] (2,0) circle (0.2);
\node[below=3mm of box] {Caption};
\end{scope}
\end{tikzpicture}`;
    const shapes = TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
    for (const x of shapes) x.g = 'lb';
    const k = shapes.find((s) => s.type === 'tikz' && /postaction/.test(s.code));
    T.ok(k, 'kept: ' + shapes.map((s) => s.type));
    const code = TD.toTikz(shapes.map((x) => ({ ...x })), { standalone: true, only: [k.id] });
    T.eq((code.match(/local bounding box=box/g) || []).length, 1, 'one scope, as written:\n' + code);
    T.ok(/\\TDon \\path\[fill=black/.test(code) && /\\TDoff \\node \(a\)/.test(code), 'each statement switched where it starts:\n' + code);
    T.tex('kept-whole-only', code);
    // a \clip clips the statements after it
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    const clipped = TD.importLatex(String.raw`\begin{tikzpicture}
\clip (0,0) rectangle (1,1);
\path[fill=black, postaction={draw}] (0,0) circle (2);
\end{tikzpicture}`).blocks.flatMap((b) => b.shapes || []);
    for (const x of clipped) x.g = 'cl';
    const id = TD.app.newDoc('kept clip', clipped, null, null);
    TD.app.setMode('diagram');
    const live = TD.state.doc.shapes.find((x) => x.type === 'tikz' && /postaction/.test(x.code));
    TD.app.render();
    await KP().settled();
    const D = KP().drawnOf(live);
    T.ok(D, 'drawn: ' + JSON.stringify(KP().status(live)));
    T.ok(await alphaAt(D, 0.5 * PX, -0.5 * PX) > 200, 'inside the clip');
    T.ok(D.x + D.w < 1.3 * PX || await alphaAt(D, 1.5 * PX, -0.5 * PX) < 10, 'not outside it');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: what a picture draws as it ends goes with its first statement; a transparency group shows its own statement', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    const dot = (x) => String.raw`\path[fill=black, postaction={draw}] (${x},0) circle (0.2);`;
    const picture = async (name, src) => {
      const shapes = TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
      for (const x of shapes) x.g = name;
      const id = TD.app.newDoc('kept ' + name, shapes, null, null);
      TD.app.setMode('diagram');
      TD.app.render();
      await KP().settled();
      const live = TD.state.doc.shapes.filter((x) => x.type === 'tikz' && /postaction/.test(x.code));
      return { id, D: live.map((x) => { const d = KP().drawnOf(x); T.ok(d, name + ' drawn: ' + JSON.stringify(KP().status(x))); return d; }) };
    };
    const bg = await picture('background', String.raw`\documentclass{article}\usepackage{tikz}\usetikzlibrary{backgrounds}\begin{document}
\begin{tikzpicture}[show background rectangle, background rectangle/.style={fill=black}]
${dot(0)}
${dot(2)}
\end{tikzpicture}\end{document}`);
    T.ok(await alphaAt(bg.D[1], 2 * PX, 0) > 200, 'the second dot');
    T.ok(await alphaAt(bg.D[1], 1 * PX, 0) < 10, 'not the background rectangle, in the second\'s picture');
    T.ok(await alphaAt(bg.D[0], 1 * PX, 0) > 200, 'the background rectangle, once, with the first (the lowest)');
    TD.app.cmd.docAction?.('del', bg.id);
    const tg = await picture('group', String.raw`\begin{tikzpicture}
${dot(0)}
\begin{scope}[transparency group]
${dot(2)}
\end{scope}
\end{tikzpicture}`);
    T.ok(await alphaAt(tg.D[1], 2 * PX, 0) > 200, 'the dot in the group, in its picture');
    T.ok(await alphaAt(tg.D[1], 0, 0) < 10, 'not the other dot');
    T.ok(await alphaAt(tg.D[0], 2 * PX, 0) < 10, 'the group\'s dot not in the other\'s picture');
    TD.app.cmd.docAction?.('del', tg.id);
  });

  T.test('kept preview: a statement compiled in its picture keeps the picture\'s node style', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const PX = TD.PX_PER_CM;
    const src = String.raw`\begin{tikzpicture}[every node/.style = {shape = rectangle, rounded corners, draw, double=red, double distance =1pt, fill = black!30!white, minimum width = 3cm, minimum height = 1.5cm, align = center, text = black}]
\node (a) at (0,0) {A};
\node (b) at (5,0) {B};
\end{tikzpicture}`;
    const shapes = TD.importLatex(src).blocks.flatMap((b) => b.shapes || []);
    T.ok(shapes.length === 2 && shapes.every((s) => s.type === 'tikz'), 'kept as written: ' + shapes.map((s) => s.type));
    for (const x of shapes) x.g = 'ns';
    const id = TD.app.newDoc('kept node style', shapes, null, null);
    TD.app.setMode('diagram');
    const live = TD.state.doc.shapes.find((x) => x.type === 'tikz' && /\{A\}/.test(x.code));
    TD.app.render();
    await KP().settled();
    const D = KP().drawnOf(live);
    T.ok(D, 'drawn: ' + JSON.stringify(KP().status(live)));
    T.ok(await alphaAt(D, 1.2 * PX, 0) > 200, 'the box round A, filled beyond its letter');
    T.ok(await alphaAt(D, 5 * PX, 0) < 10, 'not B');
    TD.app.cmd.docAction?.('del', id);
  });

  T.test('kept preview: a statement TeX stops at doesn\'t keep the rest of its picture from being drawn', async () => {
    const s0 = await TD.texEngine.support();
    if (!s0.ok) return;
    await KP().allow();
    const good = kept('kg', '\\fill (0,0) rectangle (1,1);', { g: 'bad' }), bad = kept('kb', '\\draw (0,0) -- (\\notDefinedAnywhere,1);', { g: 'bad' });
    const id = TD.app.newDoc('kept bad statement', [good, bad], null, null);
    TD.app.setMode('diagram');
    const [G, B] = ['kg', 'kb'].map((k) => TD.state.doc.shapes.find((x) => x.id === k));
    TD.app.render();
    await KP().settled();
    T.eq(KP().status(G).kind, 'drawn', 'the good statement: ' + JSON.stringify(KP().status(G)));
    const sb = KP().status(B);
    T.eq(sb.kind, 'error');
    T.ok(/notDefinedAnywhere/.test(sb.message), 'the command named: ' + sb.message);
    TD.app.cmd.docAction?.('del', id);
  });
}
