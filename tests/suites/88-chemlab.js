// Chemistry Laboratory (src/domain/chemlab.ts): tikz-chemlab pictures read and written back as they were, drawn as pdflatex draws
// them (each picture's box against the one pdflatex gives it), exported as a scope moved to where the block sits and
// read back on import; and the visual editor (src/editors/cleditor.ts).
const CL = TD.chemlab;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lab = (src) => ({ type: 'chemlab', x: 0, y: 0, src });
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// pictures and the box pdflatex gives each (pt: left, bottom, right, top), measured with tikz-chemlab 2026
const BOXES = JSON.parse(T.fixtures['chemlab-boxes.json']);
const shapesOf = (r) => r.blocks.flatMap((b) => b.shapes || []);
const pic = (body, opts = '') => `\\begin{tikzpicture}${opts}\n${body}\n\\end{tikzpicture}`;

T.test('chemlab: the code is read and written back as it was; only an edited item changes', () => {
  for (const [name, { src }] of Object.entries(BOXES)) T.eq(CL.write(CL.parse(src)), src, name);
  T.eq(CL.write(CL.parse(TD.CHEMLAB_DEFAULT)), TD.CHEMLAB_DEFAULT, 'the default');
  const M = CL.parse(TD.CHEMLAB_DEFAULT);
  T.eq(M.items.map((it) => it.k), ['app', 'app']);
  T.eq([M.items[0].at, M.items[1].at], [null, [3, 0]], 'a bare call, and one in its own scope');
  T.eq(M.items[1].ops.map((o) => o.k), ['glassType', 'liquidStyle1']);
  // a moved call: its scope's shift written again, nothing else
  M.items[1].at = [4, 1]; M.items[1].dirty = true;
  T.eq(CL.write(M), TD.CHEMLAB_DEFAULT.replace('shift={(3,0)}', 'shift={(4,1)}'));
  // a bare call that moves gets a scope of its own
  M.items[0].at = [-1, 0]; M.items[0].dirty = true;
  T.ok(CL.write(M).includes('  \\begin{scope}[shift={(-1,0)}]\n    \\tkzTestTube[liquidLevel1=40]\n  \\end{scope}'), CL.write(M));
  // a scope's leading shifts are where it moves its origin; the rest of its options stay as written
  const S = CL.parse(pic('  \\begin{scope}[xshift=2cm, yshift=1cm, rotate=30, shift={(1,0)}]\\tkzStand\\end{scope}'));
  T.eq(S.items[0].at, [2, 1]);
  S.items[0].at = [0, 0]; S.items[0].dirty = true;
  T.ok(CL.write(S).includes('\\begin{scope}[rotate=30, shift={(1,0)}]\\tkzStand\\end{scope}'), 'one-line scope kept:\n' + CL.write(S));
  // labels, leader lines, settings, comments and code the drawing doesn't read are items of their own
  const N = CL.parse(pic('  % samples\n  \\chemlabset{style=bold}\n  \\node[red] at (1,2) {A};\n  \\draw[->] (0,0) -- (1,1);\n  \\draw (0,0) circle (1);'));
  T.eq(N.items.map((it) => it.k), ['comment', 'set', 'label', 'line', 'raw']);
  T.eq([N.items[2].at, N.items[2].t, N.items[3].pts], [[1, 2], 'A', [[0, 0], [1, 1]]]);
});

T.test('chemlab: pictures are the size pdflatex makes them', () => {
  const k = TD.PT_PER_PX;
  for (const [name, { src, bb, tol }] of Object.entries(BOXES)) {
    const L = CL.layout(lab(src)), b = L.bb, me = [b.x * k, -(b.y + b.h) * k, (b.x + b.w) * k, -b.y * k];
    me.forEach((v, i) => near(v, bb[i], tol || 0.06, `${name} ${['left', 'bottom', 'right', 'top'][i]}`));
    T.eq(L.warnings, [], name);
  }
});

T.test('chemlab: titrations and flasks are set beside the ones before them, and their settings carry on', () => {
  // three bare \tkzTitration at scale 0.4: 4 units apart, 8 after one with a pH meter
  const L = CL.layout(lab(BOXES.chain.src)), o = L.origins.map((m) => [m[4], m[5]].map((v) => Math.round(v * 1000) / 1000));
  T.eq(o, [[0, 0], [1.6, 0], [4.8, 0]]);
  // in a scope of its own, one starts from where the group it is in has got to, and moves nothing after it
  const S = CL.layout(lab(pic('  \\tkzTitration\n  \\begin{scope}[shift={(0,5)}]\\tkzTitration\\end{scope}\n  \\tkzTitration')));
  T.eq(S.origins.map((m) => [m[4], m[5]]), [[0, 0], [4, 5], [4, 0]]);
  // \tkzRoundFlask with no glass type draws a test tube, as the package does
  const R = CL.layout(lab(pic('  \\tkzRoundFlask'))).bb;
  T.ok(R.w < 1.2 * TD.PX_PER_CM, 'a test tube is narrow: ' + R.w);
});

T.test('chemlab: what pdflatex stops at, and what isn\'t drawn, is named', () => {
  const ids = (body) => CL.layout(lab(pic(body))).warnings.map((w) => w.msg.id);
  T.eq(ids('  \\tkzTestTube[colour=red]'), ['chemlab.warn.key']);
  T.eq(ids('  \\tkzTestTube[glassType=jar]'), ['chemlab.warn.glass']);
  T.eq(ids('  \\tkzTestTube[liquidLevel1=37.5]'), ['chemlab.warn.whole']);
  T.eq(ids('  \\tkzTestTube[liquidStyle1=Mud]'), ['chemlab.warn.style']);
  // a substance that takes a colour, written without one: pdflatex draws it in black (tests/chemlab-parity.mjs)
  T.eq(ids('  \\tkzTestTube[substance=\\tkzFilaments]'), []);
  T.eq(ids('  \\tkzStand[x=1]'), ['chemlab.warn.noOptions']);
  T.eq(ids('  \\tkzBeaker'), ['chemlab.warn.command']);
  T.eq(ids('  \\draw (0,0) circle (1);'), ['chemlab.warn.raw']);
  T.eq(ids('  \\tkzSeparatoryFunnel[clamp]'), ['chemlab.warn.sepKey']);
  // a style defined in the picture's options is one
  T.eq(ids('  \\tkzTestTube[liquidStyle1=Mud]').length, 1);
  T.eq(CL.layout(lab(pic('  \\tkzTestTube[liquidStyle1=Mud]', '[Mud/.style={fill=brown}]'))).warnings, []);
});

T.test('chemlab: exported as a scope moved to where the block sits; import reads it back', () => {
  const s = T.make('chemlab');
  T.eq(s.src, TD.CHEMLAB_DEFAULT);
  s.x = 120; s.y = 80;
  const out = TD.toTikz([s], { standalone: true });
  T.ok(/\\usepackage\{tikz-chemlab\}/.test(out), 'package:\n' + out);
  T.ok(/\\begin\{scope\}\[shift=\{\([-\d.]+,[-\d.]+\)\}, scale=0\.5\]\n {4}\\tkzTestTube\[liquidLevel1=40\]/.test(out), 'a scope with the picture\'s scale:\n' + out);
  T.eq(TD.lint(out).filter((d) => d.sev !== 'info'), [], 'nothing missing');
  T.ok(TD.lint(out.replace('\\usepackage{tikz-chemlab}\n', '')).some((d) => /tikz-chemlab/.test(d.msg)), 'the package is asked for');
  T.tex('chemlab-default', out);
  const back = shapesOf(TD.importLatex(out)).filter((x) => x.type === 'chemlab');
  T.eq(back.length, 1, 'read back as a lab picture');
  T.eq(back[0].src, s.src, 'the same code');
  near(back[0].x, s.x, 0.5, 'x'); near(back[0].y, s.y, 0.5, 'y');
  // beside another object, each comes back as itself
  const r = T.make('rect', { x: 10, y: 3 }); r.x2 = r.x + 80; r.y2 = r.y + 40;
  const both = shapesOf(TD.importLatex(TD.toTikz([s, r], { standalone: true })));
  T.eq(both.map((x) => x.type).sort(), ['chemlab', 'rect']);
  T.eq(both.find((x) => x.type === 'chemlab').src, s.src);
  // one written by hand is a block; one with other drawing in it is TikZ
  const doc = (body) => `\\documentclass{article}\n\\usepackage{tikz-chemlab}\n\\begin{document}\n${body}\n\\end{document}\n`;
  const h = shapesOf(TD.importLatex(doc(pic('\\tkzTitration[glassType=erlenmeyer]\n\\node at (3,8) {NaOH};')))).filter((x) => x.type === 'chemlab');
  T.eq(h.length, 1);
  T.eq(h[0].src, pic('  \\tkzTitration[glassType=erlenmeyer]\n  \\node at (3,8) {NaOH};'));
  const mixed = shapesOf(TD.importLatex(doc(pic('\\draw (0,0) circle (1);\n\\begin{scope}[shift={(3,0)}]\\tkzTestTube\\end{scope}'))));
  T.eq(mixed.filter((x) => x.type === 'chemlab').length, 1, 'its scope of apparatus');
  T.ok(mixed.some((x) => x.type !== 'chemlab'), 'and the circle');
  // a call pasted on its own
  T.eq(TD.pasteIn.blockOf('\\tkzTestTube[glassType=beaker]'), 'chemlab');
});

T.test('chemlab: every apparatus compiles with pdflatex', () => {
  const blocks = Object.values(BOXES).map(({ src }, i) => T.make('chemlab', { x: (i % 4) * 12, y: Math.floor(i / 4) * 12, set: { src } }));
  T.tex('chemlab-all', TD.toTikz(blocks, { standalone: true }));
});

T.test('chemlab editor: place apparatus, set it up, move it while the rest stay put, with undo', async () => {
  const ED = TD.chemlabEditor, root = document.getElementById('clModal');
  let got = null;
  ED.open(lab(TD.CHEMLAB_DEFAULT), (r) => { got = r; });
  await sleep(50);
  const E = ED._state(), svg = root.querySelector('.cl-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y, target = svg) => target.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => root.querySelector('.cz-code textarea').value;
  // the stage point of a point in the picture's own units
  const at = (u, v) => { const c = CL.ap(CL.layout({ src: E.src }).pm, u, v); return [E.view.ox + c[0] * E.view.k, E.view.oy - c[1] * E.view.k]; };
  const drag = async (a, b) => { await sleep(400); ev('pointerdown', ...a); ev('pointermove', a[0] + 6, a[1]); ev('pointermove', ...b); ev('pointerup', ...b); };
  const origins = () => CL.layout({ src: E.src }).origins.map((m) => (m ? [m[4], m[5]].map((v) => Math.round(v * 1000) / 1000) : null));
  try {
    // the palette: each category fills its columns top to bottom, a tile as tall as its drawing; a test tube is framed
    // by its glass, not by the wide band of liquid clipped to it (fit-item.ts measures inside clip paths)
    await sleep(300);
    const tile = (k) => root.querySelector(`.cz-pal [data-cl="${k}"]`).getBoundingClientRect();
    const tube = tile('tube'), flask = tile('flask'), watch = tile('watch'), sep = tile('sep');
    T.ok(Math.abs(flask.left - tube.left) < 1 && flask.top > tube.bottom - 1, 'the round flask under the test tube');
    T.ok(watch.left > tube.left + 10, 'the next column further on');
    T.ok(sep.height > tube.height + 30, 'a separatory funnel taller than a test tube');
    const fig = root.querySelector('.cz-pal [data-cl="tube"] svg'), wb = fig.getAttribute('viewBox').split(' ').map(Number);
    T.ok(wb[3] > wb[2] * 2 && fig.getBoundingClientRect().height > 40, 'a test tube drawn upright and tall: ' + fig.getAttribute('viewBox'));
    // a titration from the palette, placed with its base where the grid is clicked
    const item = root.querySelector('.cz-pal [data-cl="titration"]');
    item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }));
    item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 2 }));
    T.eq(E.arm, 'titration', 'armed');
    ev('pointerdown', ...at(8, 0)); ev('pointerup', ...at(8, 0));
    T.ok(code().includes('  \\begin{scope}[shift={(8,0)}]\n    \\tkzTitration[glassType=erlenmeyer]\n  \\end{scope}\n\\end{tikzpicture}'), 'placed:\n' + code());
    T.eq(E.sel, 2, 'and selected');
    T.ok(/Titration/.test(root.querySelector('.cz-props').textContent), 'its settings');
    // its settings: a pH meter, a beaker
    root.querySelector('.cz-props [data-lb="pHMeter"][data-v="1"]').click();
    T.ok(code().includes('\\tkzTitration[glassType=erlenmeyer, pHMeter]'), code());
    const glass = root.querySelector('.cz-props select[data-lf="glassType"]');
    glass.value = 'beaker'; glass.dispatchEvent(new Event('input', { bubbles: true }));
    T.ok(code().includes('\\tkzTitration[glassType=beaker, pHMeter]'), code());
    key('z', { metaKey: true, ctrlKey: true });
    T.ok(code().includes('\\tkzTitration[glassType=erlenmeyer, pHMeter]'), 'undo:\n' + code());
    key('Escape');
    // the bare test tube dragged two units left gets a scope; the others stay where they were
    const before = origins();
    await drag(at(0, 1.5), at(-2, 1.5));
    T.ok(code().includes('  \\begin{scope}[shift={(-2,0)}]\n    \\tkzTestTube[liquidLevel1=40]\n  \\end{scope}'), 'moved:\n' + code());
    T.eq(origins().slice(1), before.slice(1), 'nothing else moved');
    // bare titrations each set beside the one before: moving the first keeps the others where they were
    E.sel = null;
    const ta = root.querySelector('.cz-code textarea');
    ta.focus(); ta.value = BOXES.chain.src; ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300); ta.blur();
    const chain = origins();
    T.eq(chain, [[0, 0], [1.6, 0], [4.8, 0]]);
    E.sel = 0;
    key('ArrowUp', { shiftKey: true });
    T.eq(origins(), [[0, 0.4], [1.6, 0], [4.8, 0]], 'one unit up, the others in place:\n' + code());
    T.ok(code().includes('\\begin{scope}[shift={(0,1)}]\n    \\tkzTitration\n  \\end{scope}\n  \\begin{scope}[shift={(4,0)}]\n    \\tkzTitration[pHMeter'), code());
    // duplicated beside itself; deleted
    E.sel = 2;
    key('d', { metaKey: true, ctrlKey: true });
    T.eq(E.sel, 3);
    T.ok(origins()[3][0] > origins()[2][0], 'to its right');
    key('Backspace');
    T.eq(CL.parse(E.src).items.length, 3);
    // a label from the palette, its text typed in the panel
    const lb = root.querySelector('.cz-pal [data-cl="label"]');
    lb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }));
    lb.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 2 }));
    ev('pointerdown', ...at(2, 12)); ev('pointerup', ...at(2, 12));
    const t = root.querySelector('.cz-props [data-lt]');
    T.ok(t && document.activeElement === t, 'its text is focused');
    t.value = 'NaOH'; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur();
    T.ok(code().includes('  \\node at (2,12) {NaOH};\n\\end{tikzpicture}'), code());
    T.eq(CL.layout({ src: E.src }).warnings, []);
    const now = code();
    key('Enter', { metaKey: true, ctrlKey: true });
    await sleep(20);
    T.ok(got && got.src === now, 'onDone gets the code');
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('chemlab: a piece is scaled by its scope (the package has no scale key)', () => {
  T.eq(CL.withScale(null, '0.5'), 'scale=0.5');
  T.eq(CL.withScale('shift={(3,0)}, rotate=10', '0.5'), 'shift={(3,0)}, scale=0.5, rotate=10', 'after the leading shift');
  T.eq(CL.withScale('rotate=10,scale=2', '0.5'), 'rotate=10, scale=0.5', 'one already written keeps its place');
  T.eq(CL.withScale('shift={(3,0)},scale=2', null), 'shift={(3,0)}');
  T.eq(CL.withScale('scale=2', null), null);
  T.eq(CL.scaleIn('shift={(3,0)}, scale={0.5}'), '0.5');
  T.eq(CL.layout({ src: '\\begin{tikzpicture}\\tkzTestTube[scale=0.5]\\end{tikzpicture}' }).warnings.map((w) => w.key), ['chemlab.warn.key{"key":"scale"}'], 'pdflatex stops at scale= on the call');
});

T.test('chemlab: every drawing the package defines is drawn, pasted in alone, and its widths read as the package reads them', () => {
  for (const m of ['tkzCurvedTubeShortDoubleTube', 'tkzRoundFlaskGrill', 'tkzFunnelOutline', 'tkzNails', 'tkzCopper', 'tkzZinc', 'tkzCondenser', 'tkzDrop']) {
    const L = CL.layout({ src: `\\begin{tikzpicture}\\${m}\\end{tikzpicture}` });
    T.eq(L.warnings, [], m);
    T.ok(L.boxes[0] && L.boxes[0].x2 > L.boxes[0].x1, `${m} draws something`);
    T.eq(TD.pasteIn.blockOf(`\\${m}`), 'chemlab', `${m} pasted alone`);
  }
  T.ok(TD.pasteIn.blockOf('\\tkzDrawPoint(A)') !== 'chemlab', "tkz-euclide's \\tkzDraw… is not apparatus");
  // a substance on its own keeps its count and colour, and writes them back when it is moved
  const circles = (src) => (CL.markup(CL.layout({ src: `\\begin{tikzpicture}${src}\\end{tikzpicture}` }), { export: true }).match(/<ellipse|<circle|<path[^>]*fill="url/g) || []).length;
  T.ok(circles('\\tkzBalls[3]') < circles('\\tkzBalls'), 'a count of 3 draws fewer than the 50 it would');
  T.ok(/#00ff00|rgb\(0,\s*255,\s*0\)|lime|green/i.test(CL.markup(CL.layout({ src: '\\begin{tikzpicture}\\tkzBubblesThreeD{green}\\end{tikzpicture}' }), { export: true })), 'in its colour');
  const M = CL.parse('\\begin{tikzpicture}\n  \\tkzFilaments[8]{blue}\n\\end{tikzpicture}');
  M.items[0].at = [2, 0]; M.items[0].dirty = true;
  T.ok(CL.write(M).includes('\\tkzFilaments[8]{blue}'), 'moved, its colour kept:\n' + CL.write(M));
  // \chemlabset's widths: the package's five words or a length; very thin and ultra thin stop pdflatex
  T.eq(CL.layout({ src: '\\begin{tikzpicture}\\chemlabset{outline width=very thick, graduation width=3}\\tkzTestTube\\end{tikzpicture}' }).warnings, []);
  T.eq(CL.layout({ src: '\\begin{tikzpicture}\\chemlabset{outline width=very thin}\\tkzTestTube\\end{tikzpicture}' }).warnings.map((w) => w.key), ['chemlab.warn.width{"key":"outline width","value":"very thin"}']);
});

T.test('chemlab editor: parts, fittings and contents fold; a funnel takes a fitting and a clamp; the Picture panel sets widths and the flame', async () => {
  const ED = TD.chemlabEditor, root = document.getElementById('clModal');
  let stored = null;
  try { stored = localStorage.getItem('diagramtex.cl.open'); localStorage.removeItem('diagramtex.cl.open'); } catch { /* no storage */ }
  ED.open(lab('\\begin{tikzpicture}\n  \\tkzFunnel\n\\end{tikzpicture}'), () => {});
  await sleep(50);
  const E = ED._state(), svg = root.querySelector('.cl-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => root.querySelector('.cz-code textarea').value;
  const at = (u, v) => { const c = CL.ap(CL.layout({ src: E.src }).pm, u, v); return [E.view.ox + c[0] * E.view.k, E.view.oy - c[1] * E.view.k]; };
  const click = async (p) => { await sleep(400); ev('pointerdown', ...p); ev('pointerup', ...p); await sleep(20); };
  const field = (sel, v) => { const f = root.querySelector(`.cz-props ${sel}`); f.focus?.(); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur?.(); };
  const pickTile = (k) => { const b = root.querySelector(`.cz-pal [data-cl="${k}"]`); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 2 })); };
  try {
    await sleep(300);
    const open = Object.fromEntries([...root.querySelectorAll('.cz-cat')].map((d) => [d.dataset.cat, d.open]));
    T.eq(open, { glass: true, setup: true, kit: true, note: true, parts: false, fittings: false, contents: false }, 'the parts, fittings and contents folded');
    T.ok(root.querySelector('.cz-cat[data-cat="parts"] [data-cl="tkzBuretteBody"]'), 'a burette body among the parts');
    // the funnel: a bent tube and a clamp on the test tube under it
    await click(at(0, 2));
    T.eq(E.sel, 0, 'the funnel selected');
    const fit = root.querySelector('.cz-props select[data-lfit]');
    T.eq([...fit.options].map((o) => o.value), ['none', 'straightTube', 'elbowTube', 'uTube', 'stopper']);
    field('select[data-lfit]', 'elbowTube');
    T.ok(code().includes('\\tkzFunnel[elbowTube]'), code());
    root.querySelector('.cz-props [data-lb="clamp"][data-v="1"]').click();
    T.ok(code().includes('\\tkzFunnel[elbowTube, clamp]'), code());
    // nothing selected: the picture's line widths and flame, written in a \chemlabset at the top
    key('Escape'); await sleep(20);
    T.ok(root.querySelector('.cz-props input[data-lset="outline width"]').placeholder === '1.51pt', 'the default outline as its placeholder');
    field('input[data-lset="outline width"]', 'thick');
    T.ok(code().startsWith('\\begin{tikzpicture}\n  \\chemlabset{outline width=thick}\n  \\tkzFunnel'), code());
    field('select[data-lstyle]', 'bold');
    T.ok(code().includes('\\chemlabset{style=bold, outline width=thick}'), 'the preset before the width, so the width holds:\n' + code());
    T.eq(root.querySelector('.cz-props input[data-lset="ellipse width"]').placeholder, '1.6pt', "the preset's rim width");
    field('input[data-lset="graduation width"]', '2');
    T.ok(code().includes('graduation width=2pt'), 'a bare number is pt:\n' + code());
    field('input[data-lset="tube ellipse width"]', 'very thin');
    T.ok(!code().includes('very thin'), 'a word the package doesn’t know is not written');
    field('input[data-lset="flame scale"]', '1.5');
    field('input[type="hidden"][data-lset="flame outer color"]', 'red');
    T.ok(code().includes('\\chemlabset{style=bold, outline width=thick, graduation width=2pt, flame scale=1.5, flame outer color=red}'), code());
    field('input[data-lset="outline width"]', '');
    T.ok(code().includes('\\chemlabset{style=bold, graduation width=2pt, flame scale=1.5, flame outer color=red}'), 'emptied, the key goes:\n' + code());
    T.eq(CL.layout({ src: E.src }).warnings, []);
    // a coloured substance from Contents: placed with its colour, which a move keeps
    pickTile('tkzFilaments');
    await click(at(6, 0));
    T.ok(code().includes('\\begin{scope}[shift={(6,0)}]\n    \\tkzFilaments{red}\n  \\end{scope}'), code());
    key('ArrowRight', { shiftKey: true });
    T.ok(/\\begin\{scope\}\[shift=\{\(7,0\)\}\]\n {4}\\tkzFilaments\{red\}/.test(code()), 'moved, still red:\n' + code());
    // the folding is remembered
    const parts = root.querySelector('.cz-cat[data-cat="parts"]');
    parts.open = true; parts.dispatchEvent(new Event('toggle'));
    await sleep(20);
    T.eq(JSON.parse(localStorage.getItem('diagramtex.cl.open') || '{}').parts, true);
  } finally {
    try { if (stored == null) localStorage.removeItem('diagramtex.cl.open'); else localStorage.setItem('diagramtex.cl.open', stored); } catch { /* no storage */ }
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('chemlab editor: Scale sizes one piece about its origin and the others stay put', async () => {
  const ED = TD.chemlabEditor, root = document.getElementById('clModal');
  ED.open(lab('\\begin{tikzpicture}\n  \\tkzTestTube\n  \\begin{scope}[shift={(8,0)}]\n    \\tkzTitration\n  \\end{scope}\n  \\tkzTitration\n\\end{tikzpicture}'), () => {});
  await sleep(50);
  const E = ED._state(), key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => root.querySelector('.cz-code textarea').value;
  const lay = () => CL.layout({ src: E.src }), origins = () => lay().origins.map((m) => [m[4], m[5]].map((v) => Math.round(v * 1000) / 1000));
  const h = (i) => { const b = lay().boxes[i]; return b.y2 - b.y1; };
  const field = () => root.querySelector('.cz-props input[data-lscale]');
  const set = (v) => { const f = field(); f.focus(); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur(); };
  // a click in the middle of the item's box
  const pick = async (i) => {
    await sleep(400);
    const svg = root.querySelector('.cl-svg'), R = svg.getBoundingClientRect(), b = lay().boxes[i], k = E.view.k / CL.PX;
    const x = R.left + E.view.ox + ((b.x1 + b.x2) / 2) * k, y = R.top + E.view.oy + ((b.y1 + b.y2) / 2) * k;
    for (const t of ['pointerdown', 'pointerup']) svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    await sleep(20);
    T.eq(E.sel, i, 'picked');
  };
  try {
    const o0 = origins(), h0 = h(0), h1 = h(1);
    await pick(0);
    T.ok(field(), 'a Scale field');
    T.eq(field().value, '');
    set('0.5');
    T.ok(code().includes('  \\begin{scope}[scale=0.5]\n    \\tkzTestTube\n  \\end{scope}\n  \\begin{scope}[shift={(8,0)}]'), 'a bare call gets a scope:\n' + code());
    T.ok(Math.abs(h(0) - h0 / 2) < 0.5, `half as tall: ${h(0)} of ${h0}`);
    T.eq(origins(), o0, 'every origin where it was');
    key('z', { metaKey: true, ctrlKey: true });
    T.ok(code().startsWith('\\begin{tikzpicture}\n  \\tkzTestTube\n  \\begin{scope}'), 'one undo step:\n' + code());
    key('z', { metaKey: true, ctrlKey: true, shiftKey: true });
    await pick(0);
    T.eq(field().value, '0.5', 'read back');
    set('');
    T.ok(code().startsWith('\\begin{tikzpicture}\n  \\tkzTestTube\n  \\begin{scope}[shift'), 'cleared, the scope goes:\n' + code());
    // a placed titration: the scale after its shift; the bare titration after it is shifted back where it was drawn
    await pick(1);
    set('1.5');
    T.ok(code().includes('\\begin{scope}[shift={(8,0)}, scale=1.5]\n    \\tkzTitration\n  \\end{scope}'), code());
    T.ok(Math.abs(h(1) - h1 * 1.5) < 0.5, `one and a half times as tall: ${h(1)} of ${h1}`);
    T.eq(origins(), o0, 'the next titration stays put:\n' + code());
    set('1');
    T.ok(code().includes('\\begin{scope}[shift={(8,0)}]\n    \\tkzTitration\n  \\end{scope}'), 'scale 1 is taken out:\n' + code());
    T.eq(origins(), o0);
    T.eq(lay().warnings, []);
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('chemlab editor: a tilt handle turns glass about its foot, level bars set each liquid, with undo', async () => {
  const ED = TD.chemlabEditor, root = document.getElementById('clModal');
  ED.open(lab('\\begin{tikzpicture}\n  \\tkzTestTube[liquidLevel1=40, liquidLevel2=20]\n  \\begin{scope}[shift={(8,0)}]\n    \\tkzTitration\n  \\end{scope}\n\\end{tikzpicture}'), () => {});
  await sleep(50);
  const E = ED._state(), svg = root.querySelector('.cl-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => root.querySelector('.cz-code textarea').value;
  const ctr = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2 - R.left, b.top + b.height / 2 - R.top]; };
  const at = (u, v) => { const c = CL.ap(CL.layout({ src: E.src }).pm, u, v); return [E.view.ox + c[0] * E.view.k, E.view.oy - c[1] * E.view.k]; };
  const click = async (p) => { await sleep(400); ev('pointerdown', ...p); ev('pointerup', ...p); await sleep(20); };
  const drag = async (a, b) => { await sleep(400); ev('pointerdown', ...a); ev('pointermove', a[0] + 4, a[1] + 4); ev('pointermove', ...b); const tip = root.querySelector('.cz-tip').textContent; ev('pointerup', ...b); await sleep(20); return tip; };
  const bars = () => [...svg.querySelectorAll('.cl-hl')];
  try {
    await click(at(0, 1.5));
    T.eq(E.sel, 0, 'the test tube selected');
    const turn = svg.querySelector('.phy-hr');
    T.ok(turn, 'a tilt handle');
    T.eq(bars().map((b) => b.querySelector('title').textContent), ['Drag: Level 1', 'Drag: Level 2'], 'a bar on each liquid it draws');
    // the handle on the tube's axis, past its mouth; dragged round to the right it leans right (a negative angle)
    const [hx, hy] = ctr(turn), [fx, fy] = at(0, 0);
    T.ok(Math.abs(hx - fx) < 1 && hy < at(0, 3)[1], 'above the foot: ' + [hx, hy, fx, fy]);
    const r = Math.hypot(hx - fx, hy - fy), a = -45 * Math.PI / 180;
    const tip = await drag([hx, hy], [fx - r * Math.sin(a), fy - r * Math.cos(a)]);
    T.ok(code().includes('\\tkzTestTube[liquidLevel1=40, liquidLevel2=20, tiltAngle=-45]'), 'tilted:\n' + code());
    T.ok(/Tilt -45°/.test(tip), tip);
    // the liquid stays level: its bars are drawn flat on the tilted tube
    T.ok(bars().every((b) => !/rotate\((?!0 )/.test(b.getAttribute('transform') || '')), bars().map((b) => b.getAttribute('transform')).join(' '));
    // the first level dragged down to 10%
    const [lx, ly] = ctr(bars()[0]);
    // 30% of the 3cm tube, measured along it, is 0.9·cos 45° cm straight down
    await drag([lx, ly], [lx, ly + 0.9 * Math.cos(Math.PI / 4) * E.view.k]);
    T.ok(/\\tkzTestTube\[liquidLevel1=10, liquidLevel2=20, tiltAngle=-45\]/.test(code()), 'level 1 at 10%:\n' + code());
    key('z', { metaKey: true, ctrlKey: true });
    T.ok(code().includes('\\tkzTestTube[liquidLevel1=40, liquidLevel2=20, tiltAngle=-45]'), 'undo:\n' + code());
    // a titration: its flask's liquid and its burette's level; no tilt handle (it takes no tiltAngle)
    await click(at(8, 1));
    T.eq(E.sel, 1, 'the titration selected');
    T.ok(!svg.querySelector('.phy-hr'), 'no tilt handle');
    T.eq(bars().map((b) => b.querySelector('title').textContent), ['Drag: Level', 'Drag: Burette level']);
    const [bx, by] = ctr(bars()[1]);
    await drag([bx, by], [bx, by + 0.32 * 5 * E.view.k]);
    T.ok(/\\tkzTitration\[buretteLevel=15\]/.test(code()), 'the burette five marks lower:\n' + code());
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});
