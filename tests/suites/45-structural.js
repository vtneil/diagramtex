// Structure kept from hand-written TikZ (phase 3): named points stay names, nodes placed with the positioning
// library keep `right=… of a`, a \foreach is written as the loop until one of its shapes is edited, and
// \tikzset styles are written by name while the fields they set still hold.
const PX = () => TD.PX_PER_CM;
const pic = (body, open = '\\begin{tikzpicture}') => `${open}\n${body}\n\\end{tikzpicture}`;
const load = (src) => TD.importLatex(src).blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes);
const body = (S) => { const t = TD.toTikz(S); return t.slice(t.indexOf('\\begin{tikzpicture}'), t.indexOf('\\end{tikzpicture}') + 17); };
const lines = (S) => body(S).split('\n').map((l) => l.trim()).filter(Boolean);
const doc = (S) => TD.toTikz(S, { standalone: true });

const NAMED = pic(`  \\coordinate (O) at (0,0);
  \\coordinate (A) at (3,0);
  \\draw[thick] (O) -- (A);
  \\draw (A) -- (3,2) -- (O);`);

T.test('structure: \\coordinate is a named point, and lines through it keep the name', () => {
  const S = load(NAMED);
  T.eq(S.map((s) => s.type), ['coord', 'coord', 'line', 'poly'], 'two named points, a line and a polyline');
  T.eq(S.slice(0, 2).map((s) => s.tikzName), ['O', 'A'], 'names');
  const [O, A, line, poly] = S;
  T.ok(line.link1 && line.link1.id === O.id && line.link2 && line.link2.id === A.id, 'the line is attached to both points');
  T.eq(body(S), NAMED, 'unchanged: as written');
  line.dash = 'dashed'; poly.width = 2;
  T.ok(lines(S).includes('\\draw[line width=0.8pt, dashed] (O) -- (A);'), 'the edited line names its ends: ' + lines(S).join(' | '));
  T.ok(lines(S).some((l) => /^\\draw.* \(A\) -- \(3,2\) -- \(O\);$/.test(l)), 'so does the edited polyline');
  // the point moves (and the attached end with it, as the app does): both written from the model, by name
  A.x += PX(); line.x2 += PX();
  T.ok(lines(S).includes('\\coordinate (A) at (4,0);'), 'the point where it is now');
  T.ok(lines(S).includes('\\draw[line width=0.8pt, dashed] (O) -- (A);'), 'the line still by name');
  T.ok(lines(S).some((l) => /\(3,0\) -- \(3,2\) -- \(O\)/.test(l)), 'the polyline vertex left behind is written as numbers');
  // renamed: code still using the old name keeps working
  A.tikzName = 'B';
  const L = lines(S);
  T.ok(L.includes('\\coordinate (B) at (4,0);') && L.includes('\\coordinate (A) at (4,0);'), 'the old name stays defined: ' + L.join(' | '));
  T.tex('structure-named', doc(S));
});

T.test('structure: a line drawn onto a named point is written with its name', () => {
  const S = load(pic('  \\coordinate (P) at (1,1);'));
  const l = T.make('line', { set: { x1: 0, y1: 0, x2: PX(), y2: -PX(), link2: { id: S[0].id, u: 0.5, v: 0.5 } } });
  S.push(l);
  T.ok(/\\draw.*\(0,0\) -- \(P\);/.test(body(S)), body(S));
  // a point after the line in the list is not defined yet where the line is written: numbers
  S.unshift(S.pop());
  T.ok(/\(0,0\) -- \(1,1\);/.test(body(S)), 'defined later: numbers');
});

const POS = pic(`  \\node (a) at (0,0) {Alpha};
  \\node[right=1cm of a] (b) {Beta};
  \\node[below=of a] (c) {Gamma};
  \\draw (0,-3) -- (1,-3);`);

T.test('structure: right=1cm of a is read and kept', () => {
  const S = load(POS);
  T.eq(S.map((s) => s.type), ['text', 'text', 'text', 'line'], 'all modelled');
  const [a, b, c] = S;
  T.eq([b.pos && b.pos.k, b.pos && b.pos.of, c.pos && c.pos.k], ['right', 'a', 'below'], 'the relations');
  // placed as TikZ does: 1cm between the node borders (TeX's text box, inner sep 3.333pt and outer sep 0.2pt; the app's text box is that
  // width plus a 1px margin on each side)
  const sep = 3.533 / (72.27 / 2.54) * PX() - 1;
  const ba = TD.bbox(a), bb = TD.bbox(b), bc = TD.bbox(c);
  T.ok(Math.abs((bb.x - sep) - (ba.x + ba.w + sep) - PX()) < 0.5, `gap a→b is 1cm: ${(bb.x - sep) - (ba.x + ba.w + sep)}`);
  // vertically TeX's box is height + depth (Alpha 6.94pt + 1.94pt, Gamma 6.83pt): and outer sep 0.2pt each: centres 43.38pt apart in pdflatex
  T.ok(Math.abs((c.y - a.y) * TD.PT_PER_PX - 43.38) < 0.3, `gap a→c is the node distance: centres ${(c.y - a.y) * TD.PT_PER_PX}pt apart`);
  T.eq(body(S), POS, 'unchanged: as written');
  b.color = '#0000ff';
  T.ok(/\\node\[text=\w+, right=1cm of a\] \(b\) \{Beta\};/.test(body(S)), 'edited, still placed by the relation: ' + body(S));
  // the reference moves: the placed node goes with it and keeps its relation
  a.x += PX(); b.x += PX();
  T.ok(/\\begin\{scope\}\[shift=\{\(1,0\)\}\]\s*\n\s*\\node \(a\) at \(0,0\) \{Alpha\};/.test(body(S)) && /right=1cm of a\] \(b\)/.test(body(S)), 'moved together: ' + body(S));
  // moved on its own: an absolute position, the name kept as a coordinate
  b.y += PX();
  T.ok(/\\node\[text=\w+\] at \([\d.]+,-1\) \{Beta\};\n\s*\\coordinate \(b\)/.test(body(S)), 'moved alone: absolute: ' + body(S));
  T.tex('structure-positioning', doc(S));
});

T.test('structure: positioning beside code kept as written stays code', () => {
  const S = load(pic(`  \\node[draw, minimum width=3cm] (a) at (0,0) {A};
  \\node[right=of a] (b) {B};`));
  // a drawn node is a rect of known size: the node placed beside it is exact (1cm from its east border)
  T.eq(S.map((s) => s.type), ['rect', 'text']);
  const sep = 3.533 / (72.27 / 2.54) * PX() - 1, ra = TD.bbox(S[0]), tb = TD.bbox(S[1]);
  T.ok(Math.abs((tb.x - sep) - (ra.x + ra.w + 0.2 / TD.PT_PER_PX) - PX()) < 0.5, `gap a→b is 1cm: ${(tb.x - sep) - (ra.x + ra.w + 0.2 / TD.PT_PER_PX)}`);
  const K = load(pic(`  \\node[draw, shape=star] (a) at (0,0) {A};
  \\node[right=of a] (b) {B};`));
  T.eq(K.map((s) => s.type), ['tikz', 'tikz'], 'the size of a kept node is not known: the placed node is kept too');
});

const LOOP = pic(`  \\foreach \\i in {0,...,3}
    \\fill (\\i,-1) circle (2pt);
  \\foreach \\x/\\l in {0/a,2/b}
    \\node at (\\x,1) {\\l};`);

T.test('structure: a \\foreach is its shapes, written as the loop until edited', () => {
  const S = load(LOOP);
  T.eq(S.map((s) => s.type), ['dot', 'dot', 'dot', 'dot', 'text', 'text'], 'every pass modelled');
  T.ok(S.slice(0, 4).every((s) => s.g === S[0].g && s.gname === 'foreach loop') && S[4].g === S[5].g && S[4].g !== S[0].g, 'each loop is a group');
  T.eq(body(S), LOOP, 'unchanged: as written');
  for (const s of S.slice(4)) TD.translate(s, PX(), 0);
  T.ok(/\\begin\{scope\}\[shift=\{\(1,0\)\}\]\s*\n\s*\\foreach \\x\/\\l/.test(body(S)), 'moved: the loop in a shift scope');
  T.ok(/^\s*\\foreach \\i in \{0,\.\.\.,3\}$/m.test(body(S)), 'the other loop as written');
  S[1].r *= 2;
  const L = lines(S);
  T.eq(L.filter((l) => l.startsWith('\\fill')).length, 4, 'edited: unrolled into its four shapes');
  T.ok(!L.some((l) => l.includes('\\foreach \\i')), 'the edited loop is gone');
  T.tex('structure-foreach', doc(S));
});

T.test('structure: a loop with code the shapes cannot hold stays code', () => {
  const S = load(pic(`  \\foreach \\i in {1,...,3}
    \\draw[decorate, decoration=brace] (\\i,0) -- (\\i,1);`));
  T.eq(S.map((s) => s.type), ['tikz'], 'kept as code');
});

const STY = pic(`  \\tikzset{hl/.style={draw=red, thick}, note/.style={text=blue, font=\\small}}
  \\draw[hl] (0,0) -- (2,0);
  \\draw[hl, ->] (0,1) -- (2,1);
  \\node[note] at (1,2) {n};`);

T.test('structure: \\tikzset styles are written by name while they hold', () => {
  const S = load(STY);
  T.eq(S.map((s) => s.type), ['tikz', 'line', 'line', 'text'], 'styled statements are modelled');
  const [, l1, l2, n] = S;
  T.eq([l1.stroke, l1.tkStyle && l1.tkStyle.n], ['#ff0000', ['hl']], 'the style is read, and remembered');
  l1.dash = 'dashed'; l2.width *= 2; n.bold = true;
  const L = lines(S);
  T.ok(L.includes('\\draw[hl, dashed] (0,0) -- (2,0);'), 'a field the style does not set: added after the name: ' + L.join(' | '));
  T.ok(L.some((l) => /^\\draw\[draw=\w+, line width=1\.6pt, ->\] \(0,1\) -- \(2,1\);$/.test(l)) || L.some((l) => /^\\draw\[draw=\w+, line width=1\.6pt, -\{?\w+/.test(l)), 'a field the style sets, changed: the style written out: ' + L.join(' | '));
  T.ok(L.some((l) => /^\\node\[note, font=\\small\\bfseries\] at \(1,2\) \{n\};$/.test(l) || /^\\node\[note, .*bfseries.*\] at \(1,2\) \{n\};$/.test(l)) || L.some((l) => /^\\node\[.*text=\w+.*\] at \(1,2\)/.test(l)), 'the node: ' + L.join(' | '));
  T.tex('structure-styles', doc(S));
});

T.test('structure: styles and node distance set on the picture stay on it', () => {
  const S = load(pic(`  \\node (a) at (0,0) {A};
  \\node[right=of a, hl] (b) {B};`, '\\begin{tikzpicture}[hl/.style={text=red}, node distance=2cm]'));
  T.eq(S.map((s) => s.type), ['text', 'text'], 'modelled');
  const [a, b] = S;
  T.eq(b.color, '#ff0000', 'the picture style applies');
  const sep = 3.533 / (72.27 / 2.54) * PX() - 1, ba = TD.bbox(a), bb = TD.bbox(b);
  T.ok(Math.abs((bb.x - sep) - (ba.x + ba.w + sep) - 2 * PX()) < 0.5, 'node distance 2cm');
  b.size = 'large';
  const out = body(S);
  T.ok(out.startsWith('\\begin{tikzpicture}[x=1cm, y=1cm, hl/.style={text=red}, node distance=2cm]'), 'kept on the picture: ' + out.split('\n')[0]);
  T.ok(/\\node\[hl, font=\\large, right=of a\] \(b\) \{B\};/.test(out), 'by name and by relation: ' + out);
  T.tex('structure-picture-styles', doc(S));
});

T.test('structure: single-argument styles are editable and scoped definitions do not leak', () => {
  const S = load(pic(`  \\tikzset{c/.style={draw=#1}}
  \\draw[c=red] (0,0) -- (1,0);
  \\begin{scope}
    \\tikzset{d/.style={thick}}
  \\end{scope}
  \\draw[d] (0,1) -- (1,1);`));
  T.eq(S.map((s) => s.type), ['tikz', 'line', 'tikz', 'tikz']);
  T.eq(S[1].stroke, '#ff0000', 'the argument sets the colour');
  T.ok(S[3].issues.some(w => w.includes('d')), 'the out-of-scope style stays code');
});
