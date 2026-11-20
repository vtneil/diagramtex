// Images use a shape method to choose their external LaTeX asset filename.
const exportImage = (extra = {}) => ({
  ...TD.TYPES.image.create({ x: 0, y: 0 }), id: 'export-image',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  w: TD.PX_PER_CM * 2, h: TD.PX_PER_CM, ...extra,
});

T.test('image export: named image emits graphicx, dimensions and its filename', () => {
  const source = TD.toTikz([exportImage({ file: 'figure.png' })], { standalone: true });
  T.ok(source.includes('\\usepackage{graphicx}'), 'loads graphicx');
  T.ok(source.includes('\\includegraphics[width=2cm, height=1cm]{figure.png}'), source);
  T.ok(!source.includes('rotate around='), 'unrotated image needs no rotation scope');
});

T.test('image export: generated filenames use image id and source extension', () => {
  for (const [mime, extension] of [['png', 'png'], ['jpeg', 'jpg'], ['svg+xml', 'svg'], ['gif', 'png'], ['webp', 'png']]) {
    const image = exportImage({ src: `data:image/${mime};base64,AA==` });
    // an SVG goes in through the svg package, named without its extension
    T.ok(TD.toTikz([image]).includes(extension === 'svg' ? '\\includesvg[width=2cm, height=1cm]{export-image}' : `{export-image.${extension}}`), mime);
  }
});

T.test('image export: rotated translucent image exports alongside other shapes without mutation', () => {
  const image = exportImage({ file: 'rotated.png', angle: 30, opacity: 0.5 });
  const original = JSON.stringify(image);
  const source = TD.toTikz([T.make('rect'), image]);
  T.ok(source.includes('rotate around={30:'), 'keeps rotation');
  T.ok(source.includes('opacity=0.5'), 'keeps opacity');
  T.ok(source.includes('\\includegraphics[width=2cm, height=1cm]{rotated.png}'), 'keeps image');
  T.ok(source.includes('rectangle'), 'keeps other shapes');
  const document = TD.docToLatex({ name: 'Image document', page: {}, blocks: [{ type: 'diagram', shapes: [image] }] });
  T.ok(document.includes('\\includegraphics[width=2cm, height=1cm]{rotated.png}'), 'whole-document export keeps the image');
  T.ok(document.includes('\\usepackage{graphicx}'), 'whole-document export loads graphicx');
  T.eq(JSON.stringify(image), original, 'export leaves the document unchanged');
});

T.test('export names: a Thai file name keeps its letters, and each diagram of a document is named apart', () => {
  const s = () => ({ ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults), w: 40, h: 20 });
  TD.app.newDoc('การทดลองที่ 1', null, null, [{ type: 'diagram', shapes: [s()] }, { type: 'diagram', shapes: [s()] }, { type: 'diagram', shapes: [s()], name: 'Set-up' }]);
  T.eq(TD.app.slug, 'การทดลองที่_1', 'letters and marks of any script stay');
  TD.app.setMode('diagram');
  const names = [0, 1, 2].map((i) => { TD.app.cmd.openBlock ? TD.app.cmd.openBlock(i) : (TD.state.doc.active = i); return TD.app.picSlug; });
  T.eq(names, ['การทดลองที่_1-diagram-1', 'การทดลองที่_1-diagram-2', 'การทดลองที่_1-Set-up']);
  TD.app.newDoc('a: b? c', null, null, [{ type: 'diagram', shapes: [s()] }]);
  T.eq(TD.app.picSlug, 'a_b_c', 'characters a file name cannot hold become _, one diagram keeps the file\'s name');
});
