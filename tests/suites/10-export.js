// Export: every parity figure (docs/latex-parity/tools/scenes-kit.js) exports the same code every time,
// matches its golden file, and compiles with pdflatex.
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
for (const n of Object.keys(KIT)) {
  T.test(`export ${n}`, async () => {
    const list = KIT[n]();
    const { result: tex, files } = TD.texImages.collect(() => TD.toTikz(list, { standalone: true }));
    // deterministic: again, and from a copy that went through a project file's JSON
    T.eq(TD.toTikz(list, { standalone: true }), tex, 'second export');
    T.eq(TD.toTikz(JSON.parse(JSON.stringify(list)), { standalone: true }), tex, 'export of a JSON copy');
    T.golden(`kit/${n}.tex`, tex);
    // the pictures it names go next to it, as a .zip carries them: the one for a setup without Inkscape (as
    // here), whose SVGs come as PDFs and whose LaTeX tells the svg package to use them
    const put = {};
    for (const e of await TD.app.texFiles(files, TD.texImages.svgFallback, true)) put[e.name] = [b64(e.data), Math.floor(e.date.getTime() / 1000)];
    T.tex(n, TD.texImages.noInkscape(tex), files.size ? put : undefined);
  });
}

T.test('page export: one compile places every page (eso-pic, no remember picture)', () => {
  const R = (id, x, y) => ({ id, type: 'rect', x, y, w: 300, h: 150, stroke: '#000000', width: 2, fill: '#ffcc00' });
  const text = { ...TD.TYPES.text.create({ x: 150, y: 400 }, {}), id: 't1', text: 'Hello page' };
  const tex = TD.pageToLatex({ name: 'Two pages', page: {}, sheet: { pages: 2, shapes: [R('a', 100, 100), text, R('b', 200, 1300)] }, blocks: [] });
  T.ok(!/remember picture|current page|Compile twice/.test(tex), tex);
  T.ok(tex.includes('\\usepackage{eso-pic}') && tex.includes('\\newsavebox{\\tdpage}'), 'eso-pic and the page box');
  T.eq((tex.match(/\\AddToShipoutPictureFG\*\{\\AtPageUpperLeft\{\\usebox\{\\tdpage\}\}\}\n\\null/g) || []).length, 2, 'one placement per page');
  T.ok(tex.includes('(2.5,-6.25) rectangle (10,-2.5)'), 'measured from the paper\'s top-left corner');
  T.tex('page-two-pages', tex);
});
