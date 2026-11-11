// Components (phase 6): a group saved as a part; instances share the part (s.ref) and export as one TikZ pic.
const PX = () => TD.PX_PER_CM;
const C = TD.comp;

function part(name = 'cell') {
  const a = T.make('rect', { set: { x: 0, y: 0, w: 2 * PX(), h: PX() } });
  const b = T.make('ellipse', { set: { cx: 3 * PX(), cy: 0.5 * PX(), rx: 0.5 * PX(), ry: 0.5 * PX() } });
  const i = TD.TYPES.comp.create({ x: PX(), y: 0 });
  i.cname = name; i.def = C.defOf([a, b], i.x, i.y); i.id = 'c1';
  return { a, b, i };
}

T.test('components: a part keeps its shapes round its origin and draws where its instance is', () => {
  const { a, b, i } = part();
  T.eq(i.def.length, 2, 'two shapes');
  T.eq(i.def[0].x, -PX(), 'placed round the origin');
  const back = C.placed(i);
  T.eq(back[0].x, a.x, 'placed back where they were'); T.eq(back[1].cx, b.cx, 'ellipse too');
  T.ok(TD.TYPES.comp.valid(i), 'valid');
  T.ok(!TD.TYPES.comp.valid(TD.TYPES.comp.create({ x: 0, y: 0 })), 'an empty part is not');
  const bb = TD.bbox(i);
  TD.translate(i, PX(), 0);
  T.ok(Math.abs(TD.bbox(i).x - bb.x - PX()) < 1e-6, 'moves as one');
  T.ok(TD.TYPES.comp.anchors(i).length >= 2, 'anchors of its shapes, for snapping');
});

T.test('components: defOf drops what tied the shapes to the diagram around them', () => {
  const a = T.make('rect'), b = T.make('rect'), c = T.make('rect');
  const l = T.make('line', { set: { x1: 0, y1: 0, x2: 10, y2: 10 } });
  l.link1 = { id: a.id, anchor: 'east' }; l.link2 = { id: c.id, anchor: 'west' };
  a.tex = { src: 'x' }; a.ex = { x: '1' }; a.g = 'g1'; a.cpart = { ref: 'r' };
  const D = C.defOf([a, b, l], 0, 0);
  T.ok(!('tex' in D[0]) && !('ex' in D[0]) && !('g' in D[0]) && !('cpart' in D[0]), 'imported code, expressions, groups gone');
  T.ok(D[2].link1 && !D[2].link2, 'a link inside the part stays, one to a shape outside goes');
});

T.test('components: the export defines the part once as a pic and draws each instance with \\pic', () => {
  const { i } = part('Cell 1!');
  const j = JSON.parse(JSON.stringify(i)); j.id = 'c2'; TD.translate(j, 5 * PX(), 0);
  const out = TD.toTikz([i, j], { standalone: true });
  T.eq((out.match(/\/\.pic=\{/g) || []).length, 1, 'one definition:\n' + out);
  T.ok(/\\tikzset\{Cell 1\/\.pic=\{/.test(out), 'named after the part, TikZ-safe');
  T.eq((out.match(/\\pic at \(/g) || []).length, 2, 'two instances');
  T.ok(out.indexOf('.pic=') < out.indexOf('\\pic at'), 'defined before use');
  // a copy that differs (edited, not saved to the others) gets its own definition
  j.def[0].w += PX();
  const out2 = TD.toTikz([i, j], { standalone: true });
  T.ok(/\\tikzset\{Cell 1-2\/\.pic=/.test(out2), 'a second version, its own name:\n' + out2);
  T.tex('components-pic', out2);
});

T.test('components: a part inside a part', () => {
  const { i } = part('inner');
  const outer = TD.TYPES.comp.create({ x: 0, y: 0 });
  const r = T.make('rect', { set: { x: 4 * PX(), y: 2 * PX(), w: PX(), h: PX() } });
  outer.cname = 'outer'; outer.def = C.defOf([i, r], 0, 0); outer.id = 'c3';
  const out = TD.toTikz([outer], { standalone: true });
  T.ok(/\\tikzset\{inner\/\.pic=/.test(out) && /\\tikzset\{outer\/\.pic=/.test(out), 'both defined:\n' + out);
  T.ok(out.indexOf('inner/.pic=') < out.indexOf('outer/.pic='), 'inner first');
  T.tex('components-nested', out);
});
