// What automata pictures that aren't wholly an Automaton block need of the importer (src/domain/tikzimport.ts), as
// TikZ draws it: automata's states (state, accepting by double, initial by arrow) under the document's own styles,
// TikZ's loops, double lines and outlines, fit, the picture's arrow tips, shorten, auto, on grid and initial text,
// and a label's side on its path (centred unless auto puts it beside).
{
  const doc = (body, opts = '', pre = '') => `\\documentclass{article}\n\\usepackage{tikz}\n\\usetikzlibrary{automata,positioning,fit,arrows}\n${pre}\\begin{document}\n\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}\n\\end{document}`;
  const shapesOf = (src) => TD.importLatex(src).blocks.flatMap((b) => b.shapes || []).filter((s) => !(s.type === 'tikz' && s.kind === 'defs'));
  const PT = 1 / TD.PT_PER_PX; // px per pt
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const kept = (sh) => sh.filter((s) => s.type === 'tikz').map((s) => s.issues.join('; '));

  T.test('automata import: states, accepting and initial with the picture\'s arrows, auto and shorten', () => {
    const sh = shapesOf(doc(String.raw`\node[state, initial] (A) {$q_a$};
\node[state, accepting] (B) [right of=A] {$q_b$};
\path (A) edge node {0} (B) (B) edge [loop above] node {1} ();
\node[draw] at (0,-2) {not a state};`, "->, >=stealth', shorten >=1pt, auto, node distance=3cm, initial text=$s$"));
    T.eq(kept(sh), [], 'nothing kept');
    const [A, B] = sh.filter((s) => s.type === 'ellipse');
    T.ok(A && B, 'states as ellipses (a picture with more than states is not an Automaton block): ' + sh.map((s) => s.type));
    // state: circle, draw, minimum size=2.5em (25pt at 10pt)
    near(A.rx * 2, 25 * PT, 'a state is 2.5em across');
    T.ok(!A.shaft || A.shaft === 'single', 'A single');
    T.eq(B.shaft, 'double', 'accepting by double');
    near(B.ddist, 0.6 * PT, 'TikZ\'s double distance');
    near(B.cx - A.cx, 3 * TD.PX_PER_CM, 'right of=A, node distance 3cm');
    // initial by arrow: 3ex out on the left into A's border (outer sep 0.2pt), its text (the picture's) by the far end
    const init = sh.find((s) => s.type === 'line' && s.x2 < A.cx);
    near(init.x2, A.cx - A.rx - 0.2 * PT, 'the initial arrow ends on A\'s border');
    near(init.x2 - init.x1, 12.9 * PT, '3ex long');
    T.eq(init.endTip, 'stealth', 'with the picture\'s tip');
    T.ok(sh.some((s) => s.type === 'text' && s.text === '$s$' && s.x < init.x1), 'initial text by the far end');
    // the transition: the picture's -> and auto; the loop: TikZ's loop above (out 105, in 75) with its label above
    const e = sh.find((s) => s.type === 'line' && s.label === '0');
    T.eq([e.endTip, e.labelSide], ['stealth', 'left'], 'tip and auto');
    T.ok(e.x2 < B.cx - B.rx, 'shortened before B\'s border');
    const loop = sh.find((s) => s.type === 'curve' && s.label === '1');
    T.ok(loop && loop.y1 < B.cy && loop.y2 < B.cy && loop.x1 < loop.x2, 'the loop leaves B on top, left to right');
    T.ok(Math.min(loop.cy1, loop.cy2) < B.cy - B.ry - 5 * TD.PX_PER_CM / 10 + 1, 'at least 5mm out');
    // the double outline draws and writes back; the edited picture compiles
    T.ok((TD.TYPES.ellipse.svg(B, { hit: 6, export: true }).match(/<ellipse/g) || []).length === 2, 'two outlines');
    const tex = TD.toTikz(sh.map((s) => (s.tex ? { ...s, tex: { ...s.tex, sig: 'edited' } } : s)), { standalone: true });
    T.ok(/double, double distance=0\.6pt/.test(tex), 'double written back:\n' + tex);
    T.tex('automata-import-edited', tex);
  });

  T.test('automata import: the document\'s every state, and states placed from one that can\'t be read stay code', () => {
    const sh = shapesOf(doc(String.raw`\tikzstyle{every state}=[fill=red, draw=none, text=white]
\node[state] (A) {A};
\pgfmathsetmacro{\w}{width("xx")}
\node[state, inner xsep=\w] (B) [below=of A] {B};
\node[state] (C) [below=of B] {C};`));
    const A = sh.find((s) => s.type === 'ellipse');
    T.ok(A && A.fill && A.fill.toLowerCase() === '#ff0000' && !A.stroke, 'every state: red, undrawn');
    T.ok(!sh.some((s) => ['x', 'y', 'cx', 'cy', 'rx', 'ry'].some((k) => typeof s[k] === 'number' && !Number.isFinite(s[k]))), 'no shape without a place');
    T.ok(sh.filter((s) => s.type === 'tikz').length === 2, 'B and C kept: ' + kept(sh).join(' | '));
  });

  T.test('automata import: a label on a path is centred unless auto (picture, path, edge or node) puts it beside', () => {
    const side = (opts, path) => { const sh = shapesOf(doc(path, opts)); return sh.find((s) => s.label === 'x')?.labelSide || (sh.find((s) => s.type === 'text' && s.text === 'x') ? 'text' : null); };
    // (centred on the line with nothing round it: its text at that point, no white box)
    T.eq(side('', '\\draw (0,0) -- node {x} (2,0);'), 'text', 'TikZ\'s default: on the line, a text there');
    const t = shapesOf(doc('\\draw (0,0) -- node {x} (2,0);')).find((s) => s.type === 'text');
    near(t.x, TD.PX_PER_CM, 'at the middle (x)'); near(t.y, 0, 'at the middle (y)', 2);
    T.eq(side('', '\\draw (0,0) -- node[fill=white] {x} (2,0);'), 'on', 'in a white box: the line label on it');
    T.eq(side('auto', '\\draw (0,0) -- node {x} (2,0);'), 'left', 'the picture\'s auto');
    T.eq(side('', '\\draw[auto] (0,0) -- node {x} (2,0);'), 'left', 'the path\'s');
    T.eq(side('auto', '\\draw (0,0) -- node[swap] {x} (2,0);'), 'right', 'swapped');
    T.eq(side('', '\\draw (0,0) -- node[auto=right] {x} (2,0);'), 'right', 'auto=right');
    T.eq(side('', '\\node (a) {}; \\node (b) at (2,0) {}; \\path (a) edge[auto] node {x} (b);'), 'left', 'the edge\'s');
  });

  T.test('automata import: fit=… is the box round its points and nodes, inner sep outside it (as pdflatex measures)', () => {
    const sh = shapesOf(doc(String.raw`\node[draw, inner sep=0pt, fit={(0,0) (2,1)}] (f) {};
\node[draw, fit={(0,0) (2,1)}] (g) {Hi};
\node[draw, circle, minimum size=1cm] (a) at (0,0) {};
\node[draw, circle, minimum size=1cm] (b) at (3,0) {};
\node[draw, fit=(a)(b)] (h) {};
\node[fit=(a)(b), label=above:top] (i) {};
\draw (i.north) -- (h.north);`));
    T.eq(kept(sh), [], 'nothing kept');
    const box = (n) => { const r = sh.find((s) => s.type === 'rect' && s.nodeName === n); return [r.x / PT, -(r.y + r.h) / PT, (r.x + r.w) / PT, -r.y / PT]; };
    // pdflatex: the anchors, less the 0.2pt outer sep
    box('f').forEach((v, k) => near(v, [0, 0, 56.905, 28.453][k], 'f ' + k));
    box('g').forEach((v, k) => near(v, [-3.333, -3.333, 60.238, 31.786][k], 'g ' + k));
    box('h').forEach((v, k) => near(v, [-17.759, -17.759, 103.118, 17.759][k], 'h ' + k));
    const i = sh.find((s) => s.type === 'rect' && s.nodeName === 'i');
    T.ok(i && !i.stroke, 'an undrawn fit is an undrawn box, so its name places what comes after');
  });

  T.test('automata import: double lines and outlines take TikZ\'s gap; double=red and its like stay code', () => {
    const sh = shapesOf(doc(String.raw`\draw[double] (0,0) -- (2,0);
\draw[double, double distance=2pt] (0,1) -- (2,1);
\node[draw, double] at (3,0) {a};
\draw[double=red] (0,2) -- (2,2);`));
    const lines = sh.filter((s) => s.type === 'line');
    T.eq(lines.map((l) => l.shaft), ['double', 'double'], 'double shafts');
    near(lines[0].ddist, 0.6 * PT, 'default gap'); near(lines[1].ddist, 2 * PT, 'given gap');
    const r = sh.find((s) => s.type === 'rect');
    T.eq(r && r.shaft, 'double', 'a double outline');
    T.ok(kept(sh).some((w) => /double=red/.test(w)), 'a coloured middle is kept: ' + kept(sh).join(' | '));
  });
}
