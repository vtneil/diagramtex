// Backward compatibility: files saved by older releases (tests/fixtures/legacy, made by tests/make-legacy.mjs)
// still open, draw, export the same LaTeX (golden) and compile; their old .tex exports (which carried a data
// comment; today's don't) import back to the same shapes through it.
for (const f of Object.keys(T.fixtures).filter((k) => k.startsWith('legacy/') && k.endsWith('.diagramtex'))) {
  const tag = f.slice(7, -11);
  T.test(`legacy ${tag} file opens and exports`, () => {
    const p = TD.app.parseProject(T.fixtures[f], tag);
    T.ok(p && p.blocks, 'parsed as a document');
    const shapes = p.blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes);
    T.ok(shapes.length > 0, 'has shapes');
    for (const s of shapes) {
      T.ok(TD.TYPES[s.type], 'known type ' + s.type);
      const b = TD.bbox(s);
      T.ok([b.x, b.y, b.w, b.h].every(Number.isFinite), `finite box for ${s.type}`);
    }
    const svg = TD.app.svgOf(shapes);
    T.ok(svg.length > 100 && !/NaN|undefined/.test(svg.replace(/data:[^"']*/g, '')), 'draws without NaN');
    const doc = { name: p.name, page: p.page, blocks: p.blocks };
    const tex = TD.docToLatex(doc);
    const back = TD.app.parseProject(TD.app.projectJson({ ...doc, kind: 'classic' }), tag);
    T.eq(TD.docToLatex({ ...doc, blocks: back.blocks }), tex, 'export after save and reopen');
    T.ok(!/diagramtex-data/.test(tex), 'no data comment');
    T.golden(`legacy/${tag}.tex`, tex);
    T.tex('legacy-' + tag, tex);
    // today's export carries no copy of the shapes, so it imports back as LaTeX does: one picture per diagram
    T.eq(TD.importLatex(tex).blocks.filter((b) => b.type === 'diagram').length, p.blocks.filter((b) => b.type === 'diagram' && b.shapes.length).length, 'pictures in the import of the export');
  });
  const old = T.fixtures[`legacy/${tag}.tex`];
  if (old) T.test(`legacy ${tag} LaTeX export imports back exactly`, () => {
    const p = TD.app.parseProject(T.fixtures[f], tag);
    const want = p.blocks.filter((b) => b.type === 'diagram' && b.shapes.length).map((b) => b.shapes.map(({ id, ...r }) => r));
    const got = TD.importLatex(old).blocks.filter((b) => b.type === 'diagram').map((b) => b.shapes.map(({ id, ...r }) => r));
    T.eq(got, want, 'shapes from the data comments');
  });
}
