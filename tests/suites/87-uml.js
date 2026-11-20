// UML class diagrams (src/domain/uml.ts): pgf-umlcd code read into items, drawn to the package's sizes
// (pgf-umlcd 0.3 under pdflatex, 10pt), exported unchanged in a shifted scope and read back on import; and the
// visual editor (src/editors/umleditor.ts).
const U = TD.uml;
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const uml = (src) => ({ type: 'uml', x: 0, y: 0, src });
const L = (src) => U.layout(uml(src));
const pic = (body) => `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HAND = `\\begin{tikzpicture}[font=\\small] % a zoo
  \\renewcommand{\\umlfillcolor}{blue!10}
  \\begin{package}{zoo}
    \\begin{abstractclass}[text width=4cm]{Animal}{0,0}
      \\attribute{\\# name : String}
      \\operation[0]{+ speak() : String}
    \\end{abstractclass}
    \\begin{interface}[text width=3cm]{Pet}{5,0}
      \\operation{+ owner() : Person}
    \\end{interface}
    \\begin{class}[text width=3cm]{Dog}{0,-3.5}
      \\inherit{Animal}
      \\implement{Pet}
      \\operation{+ speak() : String}
    \\end{class}
  \\end{package}
  \\begin{object}[text width=3cm]{rex}{5,-3.5}
    \\instanceOf{Dog}
    \\attribute{name = "Rex"}
  \\end{object}
  \\association{Dog}{owner}{1}{rex}{pets}{0..*}
  \\composition{Animal}{legs}{4}{Pet}
  \\umlnote (n) at (9,-1) {Notes are \\\\ kept};
  \\draw[umlcd style dashed line] (n) -- (Pet);
\\end{tikzpicture}`;

T.test('uml: hand-written code is read into items, and writing the items gives the code back', () => {
  T.eq(U.write(U.parse(TD.UML_DEFAULT)), TD.UML_DEFAULT, 'the default is written as it is');
  const M = U.parse(HAND);
  T.eq(M.env, 'font=\\small');
  const k = (x) => M.items.filter((it) => it.k === x);
  T.eq(k('class').map((c) => `${c.env}:${c.name}`), ['abstractclass:Animal', 'interface:Pet', 'class:Dog', 'object:rex']);
  const dog = k('class')[2];
  T.eq(dog.inherits, ['Animal']); T.eq(dog.implements, ['Pet']); T.eq([dog.x, dog.y], [0, -3.5]);
  T.eq(k('class')[0].ops, [{ t: '+ speak() : String', n: '0' }], 'an abstract operation');
  T.eq(k('class')[3].instanceOf, 'Dog');
  const [as, co] = k('rel');
  T.eq([as.cmd, as.a, as.ra, as.ma, as.b, as.rb, as.mb], ['association', 'Dog', 'owner', '1', 'rex', 'pets', '0..*']);
  T.eq([co.cmd, co.a, co.b, co.rb, co.mb], ['composition', 'Animal', 'Pet', 'legs', '4'], 'four arguments: the role and multiplicity at the second');
  T.eq(k('note')[0], { k: 'note', o: '', name: 'n', x: 9, y: -1, text: 'Notes are \\\\ kept' });
  T.eq(k('draw')[0].o, 'umlcd style dashed line');
  T.eq(k('color')[0], { k: 'color', which: 'fill', v: 'blue!10', def: false });
  T.eq(k('pkg').length, 1); T.eq(k('endpkg').length, 1);
  T.eq(M.warnings, [], 'nothing it can not read');
  // written back: the same statements (the comment and spacing are the writer's own)
  const again = U.parse(U.write(M));
  T.eq(JSON.stringify(again.items), JSON.stringify(M.items), 'the same items:\n' + U.write(M));
});

T.test('uml: warnings for names that are missing or used before they are defined', () => {
  const w = L(pic('\\begin{class}{B}{0,0}\\inherit{A}\\end{class}\n\\begin{class}{A}{0,3}\\end{class}\n\\association{A}{}{}{C}{}{}\n\\fancything{x}')).warnings;
  T.ok(w.some((x) => /"A" is used in \\inherit in "B" before it is defined/.test(x)), w.join('; '));
  T.ok(w.some((x) => /"C" is used in \\association but there is no class/.test(x)), w.join('; '));
  T.ok(w.some((x) => /fancything/.test(x)), 'unknown commands are kept and named');
  T.eq(L(TD.UML_DEFAULT).warnings, [], 'the default reads cleanly');
});

T.test('uml: class boxes match pgf-umlcd (widths, compartments, object, note)', () => {
  // node extents measured with pdflatex (north west and south east anchors, outer sep included), in pt
  const Lo = L(pic([
    '\\begin{class}{Empty}{0,0}\\end{class}',
    '\\begin{class}[text width=3cm]{One}{6,0}\\attribute{- name : String}\\operation{+ go() : void}\\end{class}',
    '\\begin{class}[text width=3cm]{Two}{10,0}\\attribute{- a : int}\\attribute{- b : int}\\attribute{- c : int}\\operation{+ f()}\\operation[0]{+ g()}\\end{class}',
    '\\begin{interface}[text width=3cm]{Iface}{0,-4}\\operation{+ h()}\\end{interface}',
    '\\begin{object}[text width=3cm]{rex}{6,-4}\\instanceOf{Dog}\\attribute{name = Rex}\\end{object}',
    '\\begin{class}[text width=1cm]{Narrow}{10,-4}\\end{class}',
    '\\umlnote (n) at (6,-8) {A note};',
  ].join('\n')));
  const ext = (name) => { const n = Lo.nodes.get(name); return { w: 2 * n.hw, h: 2 * n.hh, x: n.x, top: n.y + n.hh }; };
  for (const [name, w, h] of [['Empty', 149.33, 30.40], ['One', 92.42, 47.24], ['Two', 92.42, 81.14], ['Iface', 92.42, 50.54], ['rex', 92.42, 32.17], ['Narrow', 57.31, 28.46]]) {
    const e = ext(name);
    near(e.w, w, 0.05, `${name} width`);
    near(e.h, h, 0.6, `${name} height`);
    near(e.top, Lo.M.items.find((it) => it.name === name).y * U.CMPT, 0.01, `${name} hangs from its position`);
  }
  const box = (name) => Lo.boxes.find((b) => b.name === name);
  T.eq(box('One').splits.length, 2, 'three compartments');
  T.eq(box('rex').splits.length, 1, 'an object without operations has two');
  // the note: 4cm of text, its outline on the outer edge
  const n = ext('n');
  near(n.w, 231.15 - 110.28, 0.05, 'note width'); near(n.h, 13.90, 0.3, 'note height');
});

T.test('uml: relations, inheritance and their arrow tips; labels on the sides TikZ puts them', () => {
  const Lo = L(HAND);
  T.eq(Lo.under.length, 2, 'inheritance and realisation, under the boxes');
  T.eq(Lo.over.length, 3, 'two relations and a line');
  const inh = Lo.lines.find((l) => l.ref.kind === 'inherit'), imp = Lo.lines.find((l) => l.ref.kind === 'implement');
  T.eq([inh.ref.a, inh.ref.b], ['Animal', 'Dog']); T.eq(inh.S.dash, ''); T.eq(imp.S.dash, 'dash');
  // an open triangle at the parent's end
  const w = Lo.under.find((x) => x.L === inh);
  T.eq(w.tips.length, 1); T.ok(w.tips[0].closed && !w.tips[0].fill, 'open triangle');
  // composition: a filled diamond at the first class and an arrow at the second
  const comp = Lo.over.find((x) => x.L.ref.kind === 'rel' && Lo.M.items[x.L.ref.idx].cmd === 'composition');
  T.eq(comp.tips.length, 2); T.ok(comp.tips[0].fill, 'filled diamond'); T.ok(!comp.tips[1].closed, 'angle 90 at the end');
  // an association's four labels: role above and multiplicity below at each end (going right)
  const as = Lo.lines.find((l) => l.ref.kind === 'rel' && Lo.M.items[l.ref.idx].cmd === 'association');
  T.eq(as.labels.map((l) => l.t), ['owner', '1', 'pets', '0..*']);
  const y0 = as.d[0][1];
  T.ok(as.labels[0].box.y - as.labels[0].box.h >= y0 - 0.5, 'the role sits above the line');
  T.ok(as.labels[1].box.y <= y0 + 0.5, 'the multiplicity below');
  // the package frames its classes, and its fill is the colour set before it
  T.eq(Lo.pkgs.length, 1); T.eq(Lo.pkgs[0].members.map((m) => m.name), ['Animal', 'Pet', 'Dog']);
  T.eq(Lo.boxes.find((b) => b.name === 'Dog').S.fill, TD.tikzColor('blue!10'));
});

T.test('uml: the export puts the code in a shifted scope with the package; import reads it back', () => {
  const s = T.make('uml');
  T.eq(s.src, TD.UML_DEFAULT);
  s.x = 120; s.y = 80;
  const out = TD.toTikz([s], { standalone: true });
  T.ok(/\\usepackage\{pgf-umlcd\}/.test(out), 'package:\n' + out);
  T.ok(/\\begin\{scope\}\[shift=\{\(/.test(out), 'a shifted scope:\n' + out);
  T.ok(out.includes('\\begin{abstractclass}[text width=3.6cm]{Shape}{0,0}'), 'the code as written');
  T.tex('uml-default', out);
  const back = TD.importLatex(out).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'uml');
  T.eq(back.length, 1, 'read back as a class diagram');
  T.eq(back[0].src, s.src, 'the same code');
  near(back[0].x, s.x, 0.5, 'x'); near(back[0].y, s.y, 0.5, 'y');
  // a picture written by hand comes in as one too, its code kept
  const doc = `\\documentclass{article}\n\\usepackage{pgf-umlcd}\n\\begin{document}\n\\begin{figure}\n${HAND}\n\\end{figure}\n\\end{document}\n`;
  const h = TD.importLatex(doc).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'uml');
  T.eq(h.length, 1, 'one class diagram');
  T.eq(U.parse(h[0].src).items.length, U.parse(HAND).items.length, 'all of it');
});

T.test('uml: features compile with pdflatex', () => {
  const s = T.make('uml');
  s.src = HAND;
  const t = T.make('uml', { set: { x: 0, y: 500 } });
  t.src = pic(['\\switchUmlcdSchool', '\\begin{object}[text width=2.5cm]{o1}{0,0}\\instanceOf{A}\\attribute{x = 1}\\end{object}',
    '\\begin{staticclass}[text width=2.5cm]{Util}{4,0}\\operation{+ f()}\\end{staticclass}', '\\unidirectionalAssociation{o1}{uses}{1}{Util}',
    '\\begin{class}[text width=2.5cm]{Box}{4,-3}\\end{class}', '\\aggregation{Util}{parts}{*}{Box}', '\\draw[umlcd style dashed line, ->] (o1) |- (Box);'].join('\n'));
  T.eq(L(t.src).warnings, [], L(t.src).warnings.join('; '));
  T.tex('uml-features', TD.toTikz([s, t], { standalone: true }));
});

// pgf-umlcd's own demo (doc/latex/pgf-umlcd/demo/abstract-factory.tex): routed paths with ++ moves, -| and |-
// elbows, sloped labels, and the background grid
const AF = `\\begin{tikzpicture}[show background grid]
  \\begin{interface}{AbstractFactory}{0,0}
    \\operation[0]{+ CreateProductA()}
    \\operation[0]{+ CreateProductB()}
  \\end{interface}

  \\begin{class}{ConcreteFactory2}{-3,-4}
    \\implement{AbstractFactory}
    \\operation{+ CreateProductA()}
    \\operation{+ CreateProductB()}
  \\end{class}

  \\begin{class}{ConcreteFactory1}{3,-4}
    \\implement{AbstractFactory}
    \\operation{+ CreateProductA()}
    \\operation{+ CreateProductB()}
  \\end{class}

  \\begin{interface}{AbstractProductA}{15,-2}
  \\end{interface}

  \\begin{class}{ProductA1}{12,-5}
    \\implement{AbstractProductA}
  \\end{class}

  \\begin{class}{ProductA2}{18,-5}
    \\implement{AbstractProductA}
  \\end{class}

  \\draw[umlcd style dashed line,->] (ConcreteFactory1) --node[above,
  sloped, black]{$<<$instantiate$>>$} (ProductA1);

  \\draw[umlcd style dashed line,->] (ConcreteFactory2.south) ++
  (1,0) -- ++(0,-1) -- node[above, sloped,
  black]{$<<$instantiate$>>$} ++(20,0) -| (ProductA2);

  \\begin{interface}{AbstractProductB}{15,-8}
  \\end{interface}

  \\begin{class}{ProductB1}{12,-11}
    \\implement{AbstractProductB}
  \\end{class}

  \\begin{class}{ProductB2}{18,-11}
    \\implement{AbstractProductB}
  \\end{class}

  \\draw[umlcd style dashed line,->] (ConcreteFactory1) |-node[above,
  sloped, black]{$<<$instantiate$>>$} (ProductB1);

  \\draw[umlcd style dashed line,->] (ConcreteFactory2.south) ++
  (-1,0) -- ++(0,-7) -- node[above, sloped,
  black]{$<<$instantiate$>>$} ++(20,0) -| (ProductB2);

  \\begin{class}{Client}{22,-0.5}
  \\end{class}

  \\draw[umlcd style dashed line,->] (Client) --node[above, sloped,
  black]{$<<$import$>>$} (AbstractFactory);

  \\draw[umlcd style dashed line,->] (Client) |-node[above, sloped,
  black]{$<<$import$>>$} (AbstractProductA);

  \\draw[umlcd style dashed line,->] (Client) |-node[above, sloped,
  black]{$<<$import$>>$} (AbstractProductB);
\\end{tikzpicture}`;

T.test('uml: routed paths are read as steps and written back', () => {
  const M = U.parse(AF), draws = M.items.filter((it) => it.k === 'draw');
  T.eq(draws.length, 7);
  T.eq(draws.filter((d) => d.steps).length, 2, 'the two paths from ConcreteFactory2 are routed');
  const d = draws[1];
  T.eq([d.a, d.b], ['ConcreteFactory2.south', 'ProductA2']);
  T.eq(d.steps.map((s) => `${s.op} ${s.rel}(${s.to}) ${s.labels.length}`), ['move ++(1,0) 0', '-- ++(0,-1) 0', '-- ++(20,0) 1', '-| (ProductA2) 0']);
  T.eq(draws[0].steps, undefined, 'one plain step keeps the simple form');
  // written back, it reads the same, and writing again changes nothing
  const once = U.write(M);
  T.ok(once.includes('\\draw[umlcd style dashed line,->] (ConcreteFactory2.south) ++(1,0) -- ++(0,-1) -- node[above, sloped,\n  black] {$<<$instantiate$>>$} ++(20,0) -| (ProductA2);'), once);
  T.eq(U.write(U.parse(once)), once, 'stable');
  // a rename follows the path's end
  d.b = 'Other';
  T.ok(U.write(M).includes('++(20,0) -| (Other);'), 'the end is renamed');
  // not drawable here, and kept: a class in the middle of a path
  const w = L(pic('\\begin{class}{A}{0,0}\\end{class}\\begin{class}{B}{4,0}\\end{class}\\begin{class}{C}{8,0}\\end{class}\n\\draw (A) -- (B) -- (C);')).warnings;
  T.ok(w.some((x) => /A line from "A" isn't drawn here/.test(x)), w.join('; '));
});

T.test('uml: the abstract factory demo matches pdflatex (routes, sloped labels, background grid)', () => {
  const Lo = L(AF);
  T.eq(Lo.warnings, [], Lo.warnings.join('; '));
  T.eq(Lo.boxes.length, 10); T.eq(Lo.lines.length, 13, 'six realisations and seven lines');
  const draws = Lo.lines.filter((l) => l.ref.kind === 'draw');
  const pt = (p, q, msg) => { near(p[0], q[0], 0.05, msg + ' x'); near(p[1], q[1], 0.05, msg + ' y'); };
  // anchors measured with pdflatex, pt: ConcreteFactory2.south (-85.358,-166.214), ProductA2.south
  // (512.149,-170.806), ProductB2.south (512.149,-341.522)
  const a = draws[1].pts, b = draws[3].pts;
  pt(a[0], [-85.358 + 28.453, -166.214], 'routed A starts 1cm right of the south anchor');
  pt(a[1], [-56.906, -166.214 - 28.453], 'down 1cm');
  pt(a[a.length - 1], [512.149, -170.806], 'ends at ProductA2.south');
  pt(b[0], [-85.358 - 28.453, -166.214], 'routed B starts 1cm left');
  pt(b[b.length - 1], [512.149, -341.522], 'ends at ProductB2.south');
  T.eq(draws[1].labels.length, 1);
  // the label centres pdflatex puts them at (named nodes, centre anchor), in pt
  const want = [[213.851, -141.231], [227.622, -187.599], [85.358, -320.184], [170.716, -358.316], [312.933, -22.526], [625.960, -69.332], [625.960, -240.049]];
  draws.forEach((l, i) => pt([l.labels[0].x, l.labels[0].cy], want[i], `label ${i + 1}`));
  // sloped: turned along its line (L1: east anchor at (256.072,-143.960)), and level on a level step
  near(draws[0].labels[0].rot, (Math.atan2(-143.960 + 141.231, 256.072 - 213.851) * 180) / Math.PI, 0.05, 'label 1 turned');
  T.eq(draws[1].labels[0].rot, 0, 'label 2 level');
  // the picture: 860.65 × 365.58 pt; the grid adds 1ex and half its 0.2pt line round it
  const PT = 40 / U.CMPT;
  near(Lo.bb0.w / PT, 860.648, 0.1, 'width without the grid'); near(Lo.bb0.h / PT, 365.584, 0.1, 'height without the grid');
  near(Lo.bb.w / PT, 869.459, 0.1, 'width with the grid'); near(Lo.bb.h / PT, 374.395, 0.1, 'height with the grid');
  T.ok(Lo.grid.xs.length === 30 && Lo.grid.ys.length === 14 && Lo.grid.xs[0] === -5 * U.CMPT && Lo.grid.ys[0] === -13 * U.CMPT, `grid lines at every cm: ${Lo.grid.xs.length} × ${Lo.grid.ys.length}`);
  T.ok(U.draw(uml(AF), { export: true }).includes('stroke-dasharray'), 'drawn');
  T.eq(L(AF.replace('[show background grid]', '')).grid, null, 'no grid without the option');
});

T.test('uml: the demo exports with its grid written out, compiles, and imports back unchanged', () => {
  const s = T.make('uml');
  s.src = AF; s.x = 40; s.y = 60;
  const out = TD.toTikz([s], { standalone: true });
  // the option stays on the scope (where it does nothing); the grid it draws is the next line: the picture's
  // extent (pdflatex: -160.023…700.625 × -365.584…0 pt) and 1ex round it, in cm
  const gm = /\\begin\{scope\}\[shift=\{\([^)]*\)\}, show background grid\]\n\s*\\begin\{pgfonlayer\}\{background\}\\draw\[help lines\] \(([^,]+),([^)]+)\) grid \(([^,]+),([^)]+)\);\\end\{pgfonlayer\}\n/.exec(out);
  T.ok(gm, out);
  const ex = 4.30554;
  [-160.023 - ex, -365.584 - ex, 700.625 + ex, ex].forEach((v, i) => near(parseFloat(gm[i + 1]), v / U.CMPT, 0.002, `grid corner ${i}`));
  T.tex('uml-abstract-factory', out);
  const back = TD.importLatex(out).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'uml');
  T.eq(back.length, 1);
  T.eq(back[0].src, AF, 'the same code, the grid line gone');
  near(back[0].x, s.x, 0.5, 'x'); near(back[0].y, s.y, 0.5, 'y');
});

T.test('uml editor: a routed line keeps its route; its ends follow a rename', async () => {
  const ED = TD.umlEditor;
  let got = null;
  ED.open(uml(AF), (r) => { got = r; });
  await sleep(50);
  const E = ED._state(), idx = E.M.items.findIndex((it) => it.steps);
  try {
    ED._select({ r: idx });
    await sleep(20);
    const panel = () => document.querySelector('#umlModal .cz-props').textContent;
    T.ok(/Routed in 3 steps with 1 label/.test(panel()), panel());
    T.ok(!document.querySelector('#umlModal .cz-props [data-f="op"]'), 'no Route control');
    // rename ProductA2 through its name field
    ED._select({ n: E.M.items.findIndex((it) => it.name === 'ProductA2') });
    await sleep(20);
    const f = document.querySelector('#umlModal .cz-props [data-f="name"]');
    f.value = 'ProductA3'; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(20);
    const code = document.querySelector('#umlModal .cz-code textarea').value;
    T.ok(code.includes('++(20,0) -| (ProductA3);'), 'the routed line ends at the renamed class:\n' + code);
    T.eq(ED._lay().warnings, [], 'and still draws');
  } finally {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click();
    await sleep(10);
  }
  T.eq(got, null, 'cancelled');
});

T.test('uml editor: a double-click on a line edits its label in place', async () => {
  const ED = TD.umlEditor;
  const SRC = `\\begin{tikzpicture}
  \\begin{class}{A}{0,0}
  \\end{class}
  \\begin{class}{B}{12,0}
  \\end{class}
  \\begin{class}{C}{0,-4}
  \\end{class}
  \\association{A}{}{}{B}{}{}
  \\draw[umlcd style dashed line, ->] (A) -- (C);
\\end{tikzpicture}`;
  ED.open(uml(SRC), () => {});
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlModal .uml-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const code = () => document.querySelector('#umlModal .cz-code textarea').value;
  // a point on a line's i-th segment, a fraction u along it, in the svg's px
  const on = (kind, u) => { const ln = ED._lay().lines.find((l) => l.ref.kind === kind), d = ln.d, s = ED._scr({ x: d[0][0], y: d[0][1], w: d[1][0] - d[0][0], h: d[0][1] - d[1][1] }); return [s.l + (s.r - s.l) * u, s.t + (s.b - s.t) * u]; };
  const dbl = async (x, y) => { E.drag = null; ev('pointerdown', x, y); ev('pointerup', x, y); ev('pointerdown', x, y); ev('pointerup', x, y); await sleep(20); return document.querySelector('.td-pop-ta:not(.leaving)'); };
  const type = (pop, t) => { pop.value = t; pop.dispatchEvent(new Event('input', { bubbles: true })); pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
  try {
    // the association, near B: B's role
    let pop = await dbl(...on('rel', 0.8));
    T.ok(pop && pop.checkVisibility(), 'the label editor opens on the association');
    T.eq(pop.value, '', 'B has no role yet');
    type(pop, 'owner'); await sleep(20);
    T.ok(code().includes('\\association{A}{}{}{B}{owner}{}'), 'the role at B:\n' + code());
    // now near A: A's role
    pop = await dbl(...on('rel', 0.2));
    type(pop, 'item'); await sleep(20);
    T.ok(code().includes('\\association{A}{item}{}{B}{owner}{}'), 'the role at A:\n' + code());
    // the draw: its label, made on the first edit; a double-click on that label edits it
    pop = await dbl(...on('draw', 0.5));
    type(pop, 'uses'); await sleep(20);
    T.ok(code().includes('(A) -- node[midway, auto] {uses} (C);'), 'a label on the line:\n' + code());
    const lb = ED._lay().lines.find((l) => l.ref.kind === 'draw').labels[0], q = ED._scr(lb.box);
    pop = await dbl((q.l + q.r) / 2, (q.t + q.b) / 2);
    T.eq(pop.value, 'uses', 'the label under the pointer');
    type(pop, ''); await sleep(20);
    T.ok(code().includes('(A) -- (C);'), 'emptied, the label is taken out:\n' + code());
    // one undo step per edit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    T.ok(code().includes('{uses}'), 'undo brings the label back:\n' + code());
  } finally {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click();
    await sleep(10);
  }
});

T.test('uml editor: members edit in place; a line label drags along and beside its line', async () => {
  const ED = TD.umlEditor;
  const SRC = `\\begin{tikzpicture}
  \\begin{class}{A}{0,0}
    \\attribute{- name : String}
    \\attribute{- age : int}
    \\operation{+ area() : double}
  \\end{class}
  \\begin{class}{C}{8,0}
  \\end{class}
  \\draw[umlcd style dashed line, ->] (A) -- node {Hello} (C);
\\end{tikzpicture}`;
  ED.open(uml(SRC), () => {});
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlModal .uml-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const code = () => document.querySelector('#umlModal .cz-code textarea').value;
  const box = (name) => ED._lay().boxes.find((b) => b.name === name);
  const P = (x, y) => { const q = ED._scr({ x, y, w: 0, h: 0 }); return [q.l, q.t]; };
  const dbl = async (x, y) => { E.drag = null; ev('pointerdown', x, y); ev('pointerup', x, y); ev('pointerdown', x, y); ev('pointerup', x, y); await sleep(20); return document.querySelector('.td-pop-ta:not(.leaving)'); };
  const type = (pop, t) => { pop.value = t; pop.dispatchEvent(new Event('input', { bubbles: true })); pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
  try {
    // select A, then double-click its second attribute
    const A = box('A'), row = (part, j) => A.rows.find((r) => r.part === part && r.j === j);
    const cx = A.x + A.w / 2, at = (r) => P(cx, (r.top + r.bot) / 2);
    ev('pointerdown', ...at(row(1, 1))); ev('pointerup', ...at(row(1, 1))); await sleep(400);
    let pop = await dbl(...at(row(1, 1)));
    T.ok(pop && pop.checkVisibility(), 'an attribute opens in place');
    T.eq(pop.value, '- age : int', 'the one under the pointer');
    type(pop, '- age : long'); await sleep(20);
    T.ok(code().includes('\\attribute{- age : long}') && code().includes('\\attribute{- name : String}'), 'that attribute changed:\n' + code());
    // the operation
    await sleep(400);
    pop = await dbl(...at(box('A').rows.find((r) => r.part === 2)));
    T.eq(pop.value, '+ area() : double', 'the operation');
    type(pop, '+ area() : float'); await sleep(20);
    T.ok(code().includes('\\operation{+ area() : float}'), 'the operation changed:\n' + code());
    // between the operation and the box's edge: still that operation
    await sleep(400);
    const B2 = box('A');
    pop = await dbl(...P(cx, B2.y - B2.h + 1));
    T.eq(pop.value, '+ area() : float', 'the nearest operation');
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // in C's empty operations: a new one
    const C = box('C'), cc = C.x + C.w / 2;
    ev('pointerdown', ...P(cc, C.y - C.h + 2)); ev('pointerup', ...P(cc, C.y - C.h + 2)); await sleep(400);
    pop = await dbl(...P(cc, C.y - C.h + 2));
    T.eq(pop.value, '', 'a new operation');
    type(pop, '+ draw() : void'); await sleep(20);
    T.ok(/\{C\}\{8,0\}\s*\\operation\{\+ draw\(\) : void\}/.test(code()), 'added to C:\n' + code());
    await sleep(400);
    pop = await dbl(...at(box('A').rows.find((r) => r.part === 1 && r.j === 0)));
    type(pop, ''); await sleep(20);
    T.ok(!code().includes('- name : String') && code().includes('- age : long'), 'emptied, the attribute goes:\n' + code());
    // drag the label below the line, a quarter of the way along
    await sleep(400);
    const ln = () => ED._lay().lines.find((l) => l.ref.kind === 'draw');
    const q = ED._scr(ln().labels[0].box), [p0, p1] = ln().pts;
    const [tx, ty] = P(p0[0] + (p1[0] - p0[0]) * 0.25, p0[1]);
    E.drag = null;
    ev('pointerdown', (q.l + q.r) / 2, (q.t + q.b) / 2); ev('pointermove', tx, ty + 20); ev('pointerup', tx, ty + 20);
    await sleep(20);
    T.ok(code().includes('(A) -- node[near start, below] {Hello} (C);'), 'below, near the start:\n' + code());
    const lb = ln().labels[0];
    T.ok(lb.box.y - lb.box.h < p0[1] - 0.1 && lb.box.y <= p0[1] + 0.5, 'drawn below the line');
    // dropped on the line: centred on it
    const q2 = ED._scr(lb.box);
    ev('pointerdown', (q2.l + q2.r) / 2, (q2.t + q2.b) / 2); ev('pointermove', tx, ty); ev('pointerup', tx, ty);
    await sleep(20);
    T.ok(code().includes('(A) -- node[near start, anchor=center] {Hello} (C);'), 'on the line:\n' + code());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    T.ok(code().includes('node[near start, below]'), 'one undo step per drag:\n' + code());
  } finally {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click();
    await sleep(10);
  }
});

T.test('uml editor: place a class, link it, rename it and delete it, with undo', async () => {
  const ED = TD.umlEditor;
  let got = null;
  ED.open(uml(TD.UML_DEFAULT), (r) => { got = r; });
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlModal .uml-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y, target = svg) => target.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const mid = (name) => { const q = ED._scr(ED._lay().boxes.find((b) => b.name === name)); return [(q.l + q.r) / 2, (q.t + q.b) / 2]; };
  const code = () => document.querySelector('#umlModal .cz-code textarea').value;
  const click = (x, y) => { E.drag = null; ev('pointerdown', x, y); ev('pointerup', x, y); };
  try {
    // every palette figure lies inside its viewBox (a mini drawn at the picture's own origin was cropped)
    for (const m of document.querySelectorAll('#umlModal .uml-list .zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), b = m.getBBox();
      T.ok(b.x > -1 && b.y > -1 && b.x + b.width < vw + 1 && b.y + b.height < vh + 1, `palette mini ${m.closest('.qe-item').dataset.item} inside its viewBox: ${[b.x, b.y, b.width, b.height].map(Math.round)} in ${vw}×${vh}`);
    }
    // C arms a class; a click on the grid places it
    key('c');
    T.eq(E.arm, 'n:class');
    const [cx, cy] = mid('Square');
    click(cx + 200, cy);
    const made = E.M.items[E.sel.n];
    T.eq([made.k, made.env, made.name], ['class', 'class', 'Class1'], 'a new class, selected');
    T.ok(E.M.items.indexOf(made) === E.M.items.length - 1, 'after the others (there are no relations yet)');
    key('Escape'); T.eq(E.arm, null, 'Esc disarms');
    // a drag from Circle's handle to Class1: an association
    let [x, y] = mid('Circle');
    await sleep(400);
    click(x, y);
    T.eq(E.M.items[E.sel.n].name, 'Circle');
    const kb = svg.querySelector('.ze-knob circle');
    T.ok(kb, 'the handle shows on the selected class');
    const kx = +kb.getAttribute('cx'), ky = +kb.getAttribute('cy');
    const [tx, ty] = mid('Class1');
    ev('pointerdown', kx, ky, kb); ev('pointermove', tx, ty); ev('pointerup', tx, ty);
    T.ok(/\\association\{Circle\}\{\}\{\}\{Class1\}\{\}\{\}/.test(code()), 'the association is written:\n' + code());
    T.ok(E.sel && E.sel.r != null, 'and selected');
    // the Relations palette turns the selected relation into another kind
    document.querySelector('#umlModal .qe-item[data-item="r:composition"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    T.ok(/\\composition\{Circle\}\{\}\{\}\{Class1\}/.test(code()), 'now a composition:\n' + code());
    document.querySelector('#umlModal .qe-item[data-item="r:inherit"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    T.ok(!/\\composition/.test(code()) && /\\begin\{class\}\[text width=3cm\]\{Class1\}[^]*\\end\{class\}\s*\\begin\{class\}\[text width=3\.2cm\]\{Circle\}[^]*\\inherit\{Class1\}/.test(code()), 'inheritance: Circle moves after its new parent:\n' + code());
    T.eq(E.sel.h, { child: 'Circle', parent: 'Class1', kind: 'inherit' });
    // renaming a class (in its panel) renames it everywhere
    const inp = () => document.querySelector('#umlModal .cz-props [data-f="name"]');
    [x, y] = mid('Class1'); await sleep(400); click(x, y);
    T.eq(E.M.items[E.sel.n].name, 'Class1', 'Class1 selected');
    T.ok(inp(), 'the class panel');
    inp().focus(); inp().value = 'Base'; inp().dispatchEvent(new Event('input', { bubbles: true })); inp().blur();
    T.ok(/\\inherit\{Base\}/.test(code()) && /\{Base\}\{/.test(code()) && !/Class1/.test(code()), 'renamed everywhere:\n' + code());
    // members, one per line; * marks an abstract operation
    const ops = document.querySelector('#umlModal .cz-props [data-f="ops"]');
    ops.focus(); ops.value = '+ area() : double\n* + draw() : void'; ops.dispatchEvent(new Event('input', { bubbles: true })); ops.blur();
    T.ok(/\\operation\{\+ area\(\) : double\}\s*\\operation\[0\]\{\+ draw\(\) : void\}/.test(code()), 'operations:\n' + code());
    // ⌫ deletes the class and what refers to it; ⌘Z brings it back
    const before = code();
    key('Backspace');
    T.ok(!/Base/.test(code()), 'Base and its inheritance gone:\n' + code());
    key('z', { metaKey: true });
    T.eq(code(), before, 'undo');
    // Done hands back the code
    key('Enter', { metaKey: true });
    await sleep(20);
    T.ok(got && got.src === before, 'onDone gets the code');
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('uml: settle puts each class before what names it, without crossing packages or colour changes', () => {
  const order = (src) => { const M = U.parse(src); const ch = U.settle(M); return [ch, M.items.filter((it) => it.k === 'class' || it.k === 'rel' || it.k === 'pkg').map((it) => it.name || it.cmd)]; };
  T.eq(order(TD.UML_DEFAULT), [false, ['Shape', 'Circle', 'Square']], 'in order already: unchanged');
  T.eq(order(pic(['\\begin{class}{Circle}{0,-3}\\inherit{Shape}\\end{class}', '\\association{Circle}{}{}{Sq}{}{}', '\\begin{class}{Shape}{0,0}\\end{class}', '\\begin{class}{Sq}{3,0}\\end{class}'].join('\n'))),
    [true, ['Shape', 'Circle', 'Sq', 'association']], 'the subclass after its parent, the relation after both');
  T.eq(order(pic(['\\begin{package}{a}', '\\begin{class}{Circle}{0,-3}\\implement{Shape}\\end{class}', '\\end{package}', '\\begin{package}{b}', '\\begin{class}{Shape}{0,0}\\end{class}', '\\end{package}'].join('\n'))),
    [true, ['b', 'Shape', 'a', 'Circle']], 'a package moves as a whole');
  T.eq(order(pic(['\\begin{class}{Circle}{0,-3}\\inherit{Shape}\\end{class}', '\\renewcommand{\\umlfillcolor}{blue!10}', '\\begin{class}{Shape}{0,0}\\end{class}'].join('\n'))),
    [false, ['Circle', 'Shape']], 'not across a colour change (it would change its colour): left as written');
});

T.test('uml: a class named before it is drawn is an error in the LaTeX check, and compiles once settled', () => {
  const bad = pic(['  \\begin{class}{Circle}{0,-3}', '    \\inherit{Shape}', '  \\end{class}', '  \\begin{class}{Shape}{0,0}', '  \\end{class}'].join('\n'));
  const L = TD.lint(TD.toTikz([uml(bad)], { standalone: true })).filter((d) => d.sev === 'error');
  T.eq(L.length, 1, JSON.stringify(L));
  T.ok(/\\inherit names "Shape" before its class/.test(L[0].msg), L[0].msg);
  T.eq(TD.lint(TD.toTikz([uml(TD.UML_DEFAULT)], { standalone: true })), [], 'the default is fine');
  const M = U.parse(bad); U.settle(M);
  T.eq(TD.lint(TD.toTikz([uml(U.write(M))], { standalone: true })), [], 'settled');
  T.tex('uml-settled', TD.toTikz([uml(U.write(M))], { standalone: true }));
});

T.test('uml: with an xy diagram in the same document, xy gets its own \\object back', () => {
  const xy = KIT.blk_xy().map((s) => { TD.translate(s, 0, 400); return s; });
  const s = uml(TD.UML_DEFAULT);
  const out = TD.toTikz([s, ...xy], { standalone: true });
  T.ok(out.includes('\\let\\dtx@xyobject\\object'), out);
  T.ok(out.indexOf('\\let\\dtx@xyobject') > out.indexOf('{xy}'), 'after xy is loaded');
  T.tex('uml-with-xy', out);
  T.ok(!TD.toTikz([s], { standalone: true }).includes('dtx@xyobject'), 'not without xy');
  const doc = { name: 'UML_and xy', page: {}, sheet: { pages: 1, shapes: [s, ...xy] }, blocks: [{ type: 'diagram', shapes: [s] }, { type: 'diagram', shapes: xy }] };
  T.tex('uml-with-xy-page', TD.pageToLatex(doc));
  T.tex('uml-with-xy-doc', TD.docToLatex(doc));
});

T.test('uml: a picture with a class diagram and other objects imports as both', () => {
  const s = uml(TD.UML_DEFAULT), ln = KIT.lines()[0];
  TD.translate(ln, 0, 600);
  const back = TD.importLatex(TD.toTikz([s, ln], { standalone: true })).blocks.flatMap((b) => b.shapes || []);
  T.eq(back.map((x) => x.type), ['uml', 'line']);
  T.eq(back[0].src, TD.UML_DEFAULT, 'the class diagram\'s own code');
  // and a page's picture with only the class diagram: not the page's placement options
  const page = TD.pageToLatex({ name: 'p', page: {}, sheet: { pages: 1, shapes: [uml(TD.UML_DEFAULT)] }, blocks: [] });
  const u = TD.importLatex(page).blocks.flatMap((b) => b.shapes || []).find((x) => x.type === 'uml');
  T.eq(u && u.src, TD.UML_DEFAULT);
});

T.test('uml editor: a parent typed into "Inherits from" moves the class after it', async () => {
  const ED = TD.umlEditor;
  ED.open(uml(TD.UML_DEFAULT), () => {});
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlModal .uml-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const mid = (name) => { const q = ED._scr(ED._lay().boxes.find((b) => b.name === name)); return [(q.l + q.r) / 2, (q.t + q.b) / 2]; };
  const code = () => document.querySelector('#umlModal .cz-code textarea').value;
  try {
    const [x, y] = mid('Circle'); E.drag = null; ev('pointerdown', x, y); ev('pointerup', x, y);
    await sleep(20);
    T.eq(E.M.items[E.sel.n].name, 'Circle', 'Circle selected');
    const inh = document.querySelector('#umlModal .cz-props [data-f="inh"]');
    inh.focus(); inh.value = 'Shape, Square'; inh.dispatchEvent(new Event('input', { bubbles: true })); inh.blur();
    await sleep(20);
    T.ok(/\{Square\}[^]*\{Circle\}[^]*\\inherit\{Square\}/.test(code()), 'Square now comes first:\n' + code());
    T.eq(E.M.items[E.sel.n].name, 'Circle', 'still selected');
    T.eq(TD.lint(TD.toTikz([uml(code())], { standalone: true })), [], 'nothing pdflatex would stop on');
  } finally {
    if (ED._state()) { ED._state().start = null; for (let k = 0; k < 3; k++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('uml: a space after a colon is as wide as TeX sets it (the extra space of \\nonfrenchspacing)', () => {
  const L = U.layout(uml(TD.UML_DEFAULT)), st = { size: 'normalsize', font: 'default' };
  const t = L.texts.find((x) => x.t === '- name : String');
  T.ok(t, 'the member is drawn');
  const extra = (t.b.w - TD.textBox(t.t, st).w) * TD.PT_PER_PX;
  T.ok(extra > 0.7 && extra < 1.6, `1.11pt wider than the plain text: ${extra}`);
  T.ok(!/kern/.test(U.write(U.parse(TD.UML_DEFAULT))), 'not written into the code');
});

T.test('block editor: ⌘= / ⌘− zoom its canvas about the middle, ⌘0 fits, and neither the page nor the main canvas zooms', async () => {
  const ED = TD.umlEditor;
  ED.open(uml(TD.UML_DEFAULT), () => {});
  await sleep(50);
  const E = ED._state(), main = TD.state.view.zoom;
  const press = (key, code) => { const e = new KeyboardEvent('keydown', { key, code, metaKey: true, ctrlKey: !/Mac/.test(navigator.platform), bubbles: true, cancelable: true }); document.querySelector('#umlModal .uml-svg').dispatchEvent(e); return e.defaultPrevented; };
  try {
    const k0 = E.view.k;
    T.ok(press('=', 'Equal'), 'the browser does not zoom the page');
    T.ok(Math.abs(E.view.k / k0 - 1.25) < 1e-6, 'in by 1.25' + ': ' + (E.view.k / k0));
    T.ok(press('-', 'Minus'));
    T.ok(Math.abs(E.view.k / k0 - 1) < 1e-6, 'and out by the same step' + ': ' + (E.view.k / k0));
    press('=', 'Equal'); press('=', 'Equal');
    T.ok(press('0', 'Digit0'));
    T.ok(Math.abs(E.view.k - k0) < 1e-6, 'fit' + ': ' + (E.view.k));
    T.eq(TD.state.view.zoom, main, 'the canvas behind keeps its zoom');
  } finally {
    if (ED._state()) { ED._state().start = null; for (let k = 0; k < 3; k++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('uml: an object named "obj : Class" that wraps is drawn whole, without stray braces', () => {
  const s = TD.TYPES.uml.create({ x: 0, y: 0 }, TD.state.defaults);
  s.src = '\\begin{tikzpicture}\n\\begin{object}[text width=1.7cm]{obj1}{0,0}\\instanceOf{Circle}\\attribute{x = 1}\\end{object}\n\\end{tikzpicture}';
  const text = TD.TYPES.uml.svg(s, {}).replace(/<image[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  T.ok(/obj1 : Circle/.test(text) && !/[{}]/.test(text), `drawn as "${text.trim()}"`);
});
