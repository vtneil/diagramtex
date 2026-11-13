// From outside the app: pasted or dropped pictures, TikZ and LaTeX, block environments, formulae and text; and the
// LaTeX that names pictures, downloaded as a .zip with them (compiled here with pdflatex, no shell escape).
const until = async (f, n = 150) => { for (let i = 0; i < n && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };
const canvasBlob = (type, w = 40, h = 20, alpha = false) => new Promise((res) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (!alpha) { g.fillStyle = '#3366cc'; g.fillRect(0, 0, w, h); } g.fillStyle = '#cc3333'; g.fillRect(5, 5, 10, 10);
  c.toBlob(res, type);
});
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><rect x="5" y="5" width="110" height="50" rx="8" fill="#e8f0ff" stroke="#2050a0" stroke-width="3"/><circle cx="60" cy="30" r="14" fill="#c03030"/></svg>';
const board = (name) => { TD.app.newDoc(name, null, null, null, null, 'board'); TD.app.render(); };
const pasteEvent = (dt) => {
  document.body.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, ctrlKey: true, bubbles: true }));
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
};
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
// the entries of a stored (uncompressed) .zip
function unzip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset), out = {}, dec = new TextDecoder();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const n = v.getUint16(p + 26, true), x = v.getUint16(p + 28, true), size = v.getUint32(p + 18, true);
    const t = v.getUint16(p + 10, true), d = v.getUint16(p + 12, true);
    const name = dec.decode(u8.subarray(p + 30, p + 30 + n)), at = p + 30 + n + x;
    out[name] = { data: u8.subarray(at, at + size), time: new Date(1980 + (d >> 9), ((d >> 5) & 15) - 1, d & 31, t >> 11, (t >> 5) & 63, (t & 31) * 2).getTime() / 1000 };
    p = at + size;
  }
  return out;
}

T.test('paste in: what text from outside becomes', () => {
  const k = TD.pasteIn.kind;
  const cases = [
    ['\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}', 'tex'],
    ['\\draw[->] (0,0) -- (2,0);', 'tex'],
    ['\\documentclass{article}\\begin{document}Hi\\end{document}', 'tex'],
    ['\\begin{circuitikz}\\draw (0,0) to[R] (2,0);\\end{circuitikz}', 'tex'],
    ['\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}', 'block'],
    ['\\begin{quantikz} \\lstick{$q$} & \\gate{H} & \\qw \\end{quantikz}', 'block'],
    ['\\chemfig{A-B=C}', 'block'],
    ['\\xymatrix{A \\ar[r] & B}', 'block'],
    ['\\begin{forest} [S [NP] [VP]] \\end{forest}', 'block'],
    ['\\alpha', 'math'], ['\\frac{a}{b}', 'math'], ['$x^2 + y^2$', 'math'], ['\\[ E = mc^2 \\]', 'math'], ['x^2', 'math'], ['a_{ij}', 'math'],
    ['\\begin{align} a &= b \\\\ c &= d \\end{align}', 'math'],
    ['Hello, world', 'text'], ['file_name.txt', 'text'], ['\\textbf{Bold} words', 'text'], ['The value $x$ grows', 'text'],
    [SVG, 'svg'], ['<?xml version="1.0"?>\n' + SVG, 'svg'],
    ['data:image/png;base64,iVBORw0KGgo=', 'image'],
    ['   ', 'empty'],
  ];
  for (const [t, want] of cases) T.eq(k(t), want, t);
  const a = TD.pasteIn.asText;
  T.eq(a('\\alpha'), '$\\alpha$');
  T.eq(a('\\[ E = mc^2 \\]'), '$E = mc^2$');
  T.eq(a('$$\\sum_i x_i$$'), '$\\sum_i x_i$');
  T.eq(a('a_b {c} 50% x^y ~'), 'a\\_b \\{c\\} 50% x\\^{}y \\textasciitilde{}', 'plain text: TeX specials escaped (% & # on export)');
  T.eq(a('The value $x$ grows'), 'The value $x$ grows', 'LaTeX text kept');
  T.eq(a('line one\r\nline two'), 'line one\nline two');
});

T.test('paste in: a block environment, TikZ, a formula and text land on the canvas as what they are', async () => {
  board('Paste in');
  const blocks = [
    ['\\begin{tikzcd} A \\arrow[r, "f"] & B \\end{tikzcd}', 'tikzcd'],
    ['\\begin{quantikz} \\lstick{$q$} & \\gate{H} & \\meter{} \\end{quantikz}', 'quantikz'],
    ['\\chemfig{A-B=C}', 'chemfig'],
    ['\\xymatrix{A \\ar[r] & B}', 'xymatrix'],
    ['\\begin{forest} [S [NP] [VP]] \\end{forest}', 'forest'],
    ['\\begin{tikztimingtable} clk & 4{C} \\\\ \\end{tikztimingtable}', 'tikztimingtable'],
    ['\\begin{sequencediagram}\\newinst{a}{A}\\newinst[2]{b}{B}\\mess{a}{hi}{b}\\end{sequencediagram}', 'sequencediagram'],
  ];
  for (const [src, env] of blocks) {
    const n = TD.state.doc.shapes.length;
    await TD.app.takeText(src, null);
    const made = TD.state.doc.shapes.slice(n);
    T.eq(made.length, 1, env + ': one object');
    T.ok(made[0].type !== 'tikz' && made[0].type !== 'text', `${env}: a block, not ${made[0].type}`);
    T.ok(TD.toTikz(made).includes(env), `${env}: exports its environment`);
  }
  let n = TD.state.doc.shapes.length;
  await TD.app.takeText('\\begin{tikzpicture}\\draw[->] (0,0) -- (2,0);\\draw (0,0) circle (1);\\end{tikzpicture}', null);
  T.eq(TD.state.doc.shapes.slice(n).map((s) => s.type).sort(), ['ellipse', 'line'], 'TikZ becomes shapes');
  n = TD.state.doc.shapes.length;
  await TD.app.takeText('\\alpha', null);
  await TD.app.takeText('Plain words_with {braces}', null);
  const [m, t] = TD.state.doc.shapes.slice(n);
  T.eq([m.type, m.text], ['text', '$\\alpha$']);
  T.eq([t.type, t.text], ['text', 'Plain words\\_with \\{braces\\}']);
  T.ok(/\\node.*\{\$\\alpha\$\};/.test(TD.toTikz([m])), 'the formula exports as maths');
});

T.test('paste in: ⌘V of a picture inserts it as the Image tool does, GIF and WebP as PNG, SVG kept', async () => {
  board('Paste pictures');
  for (const [type, want] of [['image/png', 'png'], ['image/jpeg', 'jpeg'], ['image/webp', 'png']]) {
    const blob = await canvasBlob(type), dt = new DataTransfer();
    dt.items.add(new File([blob], `shot.${type.split('/')[1]}`, { type }));
    const n = TD.state.doc.shapes.length;
    pasteEvent(dt);
    await until(() => TD.state.doc.shapes.length > n);
    const s = TD.state.doc.shapes[n];
    T.ok(s && s.type === 'image', type + ' pasted as an image');
    T.ok(s.src.startsWith(`data:image/${want}`), `${type} stored as ${want}: ${s.src.slice(0, 22)}`);
    T.ok(Math.abs(s.w / s.h - 2) < 0.01, 'keeps its aspect');
    T.ok(TD.state.sel.has(s.id), 'selected');
  }
  // SVG markup as text
  const n = TD.state.doc.shapes.length, dt = new DataTransfer();
  dt.setData('text/plain', SVG);
  pasteEvent(dt);
  await until(() => TD.state.doc.shapes.length > n);
  const s = TD.state.doc.shapes[n];
  T.ok(s.src.startsWith('data:image/svg+xml'), 'SVG kept as SVG');
  T.ok(Math.abs(s.w / s.h - 2) < 0.01, 'SVG size from its width and height');
  T.ok(/\\includesvg\[width=[\d.]+cm, height=[\d.]+cm\]\{image\}/.test(TD.toTikz([s])), TD.toTikz([s]));
  // names stay unique in the file
  const names = TD.state.doc.shapes.filter((q) => q.type === 'image').map((q) => TD.TYPES.image.fileName(q));
  T.eq(new Set(names).size, names.length, names.join(' '));
});

T.test('paste in: a copy made in the app pastes its shapes, not its code; other text is imported', async () => {
  board('Paste own');
  const r = T.make('rect'), e = T.make('ellipse', { x: 3 });
  TD.state.doc.shapes.push(r, e); TD.state.sel = new Set([r.id, e.id]); TD.app.render();
  document.body.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, ctrlKey: true, bubbles: true }));
  const code = JSON.parse(localStorage.getItem('diagramtex.clip')).code;
  T.ok(code && code.includes('rectangle'), 'the copy keeps its code');
  const dt = new DataTransfer(); dt.setData('text/plain', code);
  pasteEvent(dt);
  await until(() => TD.state.doc.shapes.length === 4);
  T.eq(TD.state.doc.shapes.map((s) => s.type), ['rect', 'ellipse', 'rect', 'ellipse'], 'pasted as the copied shapes');
});

T.test('paste in: dropping a picture or a .tex file lands where it is dropped', async () => {
  board('Drop in');
  const stage = document.querySelector('#stage'), R = stage.getBoundingClientRect();
  const drop = (dt, x, y) => {
    const o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: R.left + x, clientY: R.top + y };
    stage.dispatchEvent(new DragEvent('dragover', o)); stage.dispatchEvent(new DragEvent('drop', o));
  };
  let dt = new DataTransfer();
  dt.items.add(new File([await canvasBlob('image/png', 60, 30)], 'Photo 1.png', { type: 'image/png' }));
  drop(dt, 200, 150);
  await until(() => TD.state.doc.shapes.length === 1);
  const s = TD.state.doc.shapes[0], v = TD.state.view;
  const at = { x: 200 / v.zoom + v.x, y: 150 / v.zoom + v.y };
  T.ok(Math.abs(s.x + s.w / 2 - at.x) < 2 && Math.abs(s.y + s.h / 2 - at.y) < 2, 'centred on the drop point');
  T.eq(s.file, 'Photo-1.png', 'named after the file');
  dt = new DataTransfer();
  dt.items.add(new File(['\\begin{tikzpicture}\\draw (0,0) rectangle (1,1);\\end{tikzpicture}'], 'fig.tex', { type: 'application/x-tex' }));
  drop(dt, 400, 300);
  await until(() => TD.state.doc.shapes.length === 2);
  T.eq(TD.state.doc.shapes[1].type, 'rect', 'a .tex file is imported');
  dt = new DataTransfer(); dt.setData('text/plain', '\\beta');
  drop(dt, 300, 300);
  await until(() => TD.state.doc.shapes.length === 3);
  T.eq(TD.state.doc.shapes[2].text, '$\\beta$', 'dragged text');
});

T.test('paste in: in Document view, pictures, formulae, text and code become blocks', async () => {
  TD.app.newDoc('Paste doc', null, null, null, null, 'classic');
  TD.app.setMode('document');
  const blocks = () => TD.state.doc.blocks;
  const n = blocks().length;
  await TD.app.takeIn('', [new File([await canvasBlob('image/png')], 'chart.png', { type: 'image/png' })], null);
  await TD.app.takeText('\\int_0^1 x\\,dx', null);
  await TD.app.takeText('A sentence.', null);
  await TD.app.takeText('\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}', null);
  const added = blocks().slice(n);
  T.eq(added.map((b) => b.type).sort(), ['diagram', 'image', 'text', 'text']);
  T.ok(added.some((b) => b.type === 'text' && b.text === '$$\\int_0^1 x\\,dx$$'), 'formula as display maths');
  T.ok(added.some((b) => b.type === 'image' && b.name === 'chart.png'), 'picture block');
  TD.app.setMode('diagram');
});

T.test('LaTeX with pictures: names, \\includesvg, and the .zip compiles with pdflatex (no Inkscape, no shell escape)', async () => {
  const png = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); canvasBlob('image/png', 80, 40).then((b) => f.readAsDataURL(b)); });
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const svg = 'data:image/svg+xml;base64,' + btoa(SVG);
  const img = (o) => ({ ...TD.TYPES.image.create({ x: 0, y: 0 }), w: 160, h: 80, opacity: 1, ...o });
  const shapes = [
    img({ id: 'a', src: png, file: 'plot.png' }),
    img({ id: 'b', src: png.replace(/.{8}$/, 'AAAAAA=='), file: 'plot.png', x: 200 }), // another picture, same name
    img({ id: 'c', src: svg, file: 'logo.svg', y: 120 }),
    img({ id: 'd', src: gif, file: 'anim.gif', x: 200, y: 120 }),
  ];
  const doc = { name: 'Pictures', page: {}, blocks: [{ type: 'diagram', shapes }, { type: 'image', src: svg, name: 'logo.svg', width: 0.4, caption: 'Logo' }, { type: 'image', src: png, name: 'plot.png', width: 0.5, caption: '' }] };
  const { result: tex, files } = TD.texImages.collect(() => TD.docToLatex(doc));
  T.eq([...files.keys()].sort(), ['anim.png', 'logo.svg', 'plot-2.png', 'plot.png'], 'one file per picture, renamed where two differ');
  T.ok(tex.split('\n').includes('\\usepackage[inkscapelatex=false]{svg}'), 'svg package, Inkscape converting');
  T.ok(TD.texImages.noInkscape(tex).split('\n').includes('\\usepackage[inkscape=false, inkscapelatex=false]{svg}'), 'or never calling it');
  T.ok(/\\includesvg\[width=[\d.]+cm, height=[\d.]+cm\]\{logo\}/.test(tex), 'canvas SVG');
  T.ok(tex.includes('\\includesvg[width=0.4\\linewidth]{logo}'), 'Document view SVG');
  T.ok(tex.includes('{anim.png}') && !tex.includes('.gif'), 'a GIF goes in as PNG');
  // the .zip for Inkscape: the pictures as they are
  const Zi = unzip(new Uint8Array(await (await TD.app.texBundle('Pictures.tex', tex, files, TD.texImages.svgFallback)).arrayBuffer()));
  T.eq(Object.keys(Zi).sort(), ['Pictures.tex', 'anim.png', 'logo.svg', 'plot-2.png', 'plot.png']);
  // the .zip without Inkscape: each SVG with its PDF, the LaTeX set to use it
  const zip = new Uint8Array(await (await TD.app.texBundle('Pictures.tex', TD.texImages.noInkscape(tex), files, TD.texImages.svgFallback, true)).arrayBuffer());
  const Z = unzip(zip);
  T.eq(Object.keys(Z).sort(), ['Pictures.tex', 'anim.png', 'logo.svg', 'plot-2.png', 'plot.png', 'svg-inkscape/logo_svg-raw.pdf']);
  T.eq([...Z['anim.png'].data.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG', 'converted to PNG');
  T.eq(new TextDecoder().decode(Z['svg-inkscape/logo_svg-raw.pdf'].data.subarray(0, 5)), '%PDF-');
  const filesOut = {};
  for (const [name, e] of Object.entries(Z)) if (name !== 'Pictures.tex') filesOut[name] = [b64(e.data), e.time];
  T.tex('pictures-bundle', new TextDecoder().decode(Z['Pictures.tex'].data), filesOut);
  // a standalone picture and a page carry theirs too
  const st = TD.texImages.collect(() => TD.toTikz(shapes.slice(2), { standalone: true }));
  T.eq([...st.files.keys()].sort(), ['anim.png', 'logo.svg']);
  const sz = unzip(new Uint8Array(await (await TD.app.texBundle('s.tex', TD.texImages.noInkscape(st.result), st.files, TD.texImages.svgFallback, true)).arrayBuffer()));
  const sf = {}; for (const [name, e] of Object.entries(sz)) if (name !== 's.tex') sf[name] = [b64(e.data), e.time];
  T.tex('pictures-standalone', new TextDecoder().decode(sz['s.tex'].data), sf);
});

// An SVG goes in the .zip as a vector PDF (src/platform/svgpdf.ts) where its features allow, else as a picture.
T.test('SVG to PDF: vectors for shapes, gradients, clips, <use>, faded groups and text; a picture for a filter', async () => {
  const SVGS = {
    paths: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="2" y="2" width="196" height="96" rx="8" fill="#eef" stroke="#000" stroke-width="3" stroke-dasharray="6 3"/><path d="M20 80a30 20 0 0 1 60 0Q110 20 140 80T190 60" fill="none" stroke="#d00" stroke-width="4" stroke-linecap="round"/><polygon points="150,10 190,10 170,40" fill="#06c" fill-rule="evenodd"/></svg>',
    paint: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset=".5" stop-color="#ff0"/><stop offset="1" stop-color="blue"/></linearGradient><radialGradient id="r" fx=".3" fy=".3"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#909"/></radialGradient><clipPath id="c"><circle cx="50" cy="50" r="40"/></clipPath><path id="s" d="M0-10L3-3L10-3L4 2L6 9L0 5L-6 9L-4 2L-10-3L-3-3Z"/></defs><rect width="100" height="100" fill="url(#g)" clip-path="url(#c)"/><circle cx="140" cy="30" r="25" fill="url(#r)"/><g opacity=".5"><circle cx="130" cy="75" r="18" fill="#00f"/><circle cx="145" cy="80" r="18" fill="#f00"/></g><use xlink:href="#s" x="185" y="80" fill="#fa0"/></svg>',
    text: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><style>.t{font:bold 16px Helvetica,Arial,sans-serif;fill:#c00}</style><text x="10" y="25" class="t">Bold sans — café</text><text x="10" y="50" font-family="Times New Roman,serif" font-style="italic" font-size="18">Serif <tspan fill="#06c">italic</tspan></text><text x="230" y="72" font-family="monospace" font-size="12" text-anchor="end" transform="rotate(-5 230 72)">mono, rotated</text></svg>',
  };
  const dec = (u8) => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return s; };
  const files = {}, lines = [];
  for (const [name, svg] of Object.entries(SVGS)) {
    const m = /width="(\d+)" height="(\d+)"/.exec(svg);
    const pdf = await TD.app.svgVectorPdf(svg, +m[1], +m[2]);
    T.ok(pdf, `${name}: written as vectors`);
    const s = dec(pdf);
    T.ok(!/\/Subtype \/Image/.test(s), `${name}: no picture inside`);
    T.ok(new RegExp(`/MediaBox \\[0 0 ${+m[1] * 0.75} ${+m[2] * 0.75}\\]`).test(s), `${name}: the SVG's size in points`);
    if (name === 'paint') { T.ok(/\/ShadingType 2/.test(s) && /\/ShadingType 3/.test(s), 'linear and radial shadings'); T.ok(/\/S \/Transparency/.test(s), 'the faded group is a transparency group'); }
    if (name === 'text') T.ok(/\/BaseFont \/Helvetica-Bold/.test(s) && /\/BaseFont \/Times-Italic/.test(s) && /\/BaseFont \/Courier/.test(s), 'standard fonts by family, weight and style');
    files[`svg-inkscape/${name}_svg-raw.pdf`] = [b64(pdf), 1700000000];
    files[`${name}.svg`] = [b64(new TextEncoder().encode(svg)), 1700003600];
    lines.push(`\\includesvg[width=6cm]{${name}}\\par`);
  }
  T.tex('svg-vector-pdfs', ['\\documentclass{article}', '\\usepackage[inkscape=false, inkscapelatex=false]{svg}', '\\begin{document}', ...lines, '\\end{document}'].join('\n'), files);
  // what PDF can't say simply: drawn as a picture instead
  const blur = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><filter id="f"><feGaussianBlur stdDeviation="2"/></filter><rect x="10" y="10" width="80" height="30" fill="#c00" filter="url(#f)"/></svg>';
  T.eq(await TD.app.svgVectorPdf(blur, 100, 50), null, 'a filter is not written as vectors');
  T.ok(/\/Subtype \/Image/.test(dec(await TD.app.svgFilePdf('data:image/svg+xml;base64,' + btoa(blur)))), 'the .zip gets it as a picture');
  T.ok(!/\/Subtype \/Image/.test(dec(await TD.app.svgFilePdf('data:image/svg+xml;base64,' + btoa(SVGS.paths)))), 'and the others as vectors');
});
