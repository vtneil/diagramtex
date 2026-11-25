// Drop shadows (src/domain/shadow.ts) and the image frame (border, outline, rounded corners; src/domain/symbols.ts):
// the canvas draws what the TikZ draws, and the TikZ compiles.
// a real picture (pdflatex reads it): 4 × 3 px, drawn here
const PNG = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 3; const g = c.getContext('2d'); g.fillStyle = '#3a7d44'; g.fillRect(0, 0, 4, 3); g.fillStyle = '#9cc5e8'; g.fillRect(0, 0, 4, 1); return c.toDataURL('image/png'); })();
const photo = (extra = {}) => ({ ...TD.TYPES.image.create({ x: 0, y: 0 }), id: 'photo', file: 'photo.png', src: PNG, x: 40, y: 40, w: 160, h: 120, ...extra });
const rect = (extra = {}) => ({ ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults), id: 'r', x: 20, y: 20, w: 80, h: 40, ...extra });
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

T.test('shadow: a rectangle casts a drop shadow down and to the right, with the shadows library', () => {
  const tex = TD.toTikz([rect({ shadow: true, shadowOffset: 4, shadowOpacity: 0.4 })], { standalone: true });
  T.ok(/\\usetikzlibrary\{[^}]*\bshadows\b/.test(tex), 'loads shadows');
  const pt = TD.fmt(4 * TD.PT_PER_PX);
  T.ok(tex.includes(`drop shadow={shadow xshift=${pt}pt, shadow yshift=-${pt}pt, opacity=0.4, fill=black}`), tex);
  const svg = TD.TYPES.rect.svg(rect({ shadow: true, shadowOffset: 4, shadowOpacity: 0.4 }), { export: true });
  T.ok(/^<g class="shadow" transform="translate\(4 4\)" fill="#000000" stroke="none" opacity="0.4"/.test(svg), svg);
  T.ok(!TD.toTikz([rect()]).includes('drop shadow'), 'no shadow unless asked');
  T.ok(!TD.TYPES.rect.svg(rect(), { export: true }).includes('class="shadow"'), 'no shadow drawn unless asked');
});

T.test('shadow: a rotated shape turns its outline but its shadow still falls along the page', () => {
  const svg = TD.TYPES.rect.svg(rect({ shadow: true, angle: 30 }), { export: true });
  // translate first in the list: the outline is turned about its centre, then moved along the page
  T.ok(svg.includes('transform="translate(4 4) rotate(-30 60 40)"'), svg);
  const tex = TD.toTikz([rect({ shadow: true, angle: 30 })]);
  T.ok(tex.includes('rotate around={30:') && tex.includes('drop shadow={'), tex);
});

T.test('shadow: an outline with neither stroke nor fill still casts one; plain text casts none', () => {
  T.ok(/\\path\[[^\]]*drop shadow/.test(TD.toTikz([rect({ stroke: null, fill: null, shadow: true })])), 'a \\path carries it');
  const text = { ...TD.TYPES.text.create({ x: 100, y: 100 }, {}), id: 't', text: 'Hi', shadow: true };
  T.ok(!TD.canShadow(text) && !TD.toTikz([text]).includes('drop shadow'), 'unboxed text');
  const boxed = { ...text, boxed: true, stroke: '#000000', width: 1, dash: 'solid', fill: '#ffffff', radius: 0 };
  T.ok(TD.canShadow(boxed) && TD.toTikz([boxed]).includes('drop shadow'), 'boxed text');
  T.ok(TD.TYPES.text.svg(boxed, { export: true }).startsWith('<g class="shadow"'), 'boxed text draws its frame\'s shadow');
});

T.test('shadow: a closed library symbol casts one along the page; an open one cannot', () => {
  const sym = (kind, extra = {}) => ({ ...TD.TYPES.sym.create({ x: 40, y: 40 }, TD.state.defaults, 'sym:' + kind), id: 'y', w: 80, h: 60, ...extra });
  const closed = Object.keys(TD.SYMS).find((k) => TD.SYMS[k].fill && TD.SYMS[k].cat === 'basic');
  const open = Object.keys(TD.SYMS).find((k) => !TD.SYMS[k].fill);
  const s = sym(closed, { shadow: true, angle: 20 });
  T.ok(TD.canShadow(s) && !TD.canShadow(sym(open, { shadow: true })), `${closed} casts, ${open} does not`);
  const svg = TD.TYPES.sym.svg(s, { export: true });
  // its path is already turned: the shadow is only moved
  T.ok(/^<g class="shadow" transform="translate\(4 4\)" [^>]*><path d="[^"]+" fill-rule="evenodd"\/><\/g>/.test(svg), svg);
  const tex = TD.toTikz([s], { standalone: true });
  T.ok(/\\draw\[[^\]]*drop shadow=\{/.test(tex) && /\\usetikzlibrary\{[^}]*\bshadows\b/.test(tex), tex);
  T.ok(/\\path\[[^\]]*drop shadow/.test(TD.toTikz([sym(closed, { shadow: true, stroke: null, fill: null })])), 'shadow alone still writes the path');
  T.ok(!TD.toTikz([sym(open, { shadow: true })]).includes('drop shadow'), 'an open symbol exports no shadow');
  T.tex('shadow-symbol', tex);
});

T.test('shadow: closed polylines, smooth closed curves and regions cast one; an open polyline cannot', () => {
  const poly = (extra = {}) => ({ ...TD.TYPES.poly.create({ x: 0, y: 0 }, TD.state.defaults), id: 'p', pts: [[20, 20], [120, 30], [90, 110], [30, 90]], closed: true, fill: '#9cc5e8', shadow: true, ...extra });
  const blob = poly({ id: 'b', smooth: true, tension: 0.5 });
  const region = { type: 'region', id: 'g', rings: [[[150, 20], [250, 20], [250, 100], [150, 100]], [[180, 40], [220, 40], [220, 80], [180, 80]]], stroke: '#000000', width: 1, dash: 'solid', fill: '#ffcc66', opacity: 1, shadow: true };
  for (const s of [poly(), blob, region]) {
    T.ok(TD.canShadow(s), s.id);
    T.ok(TD.TYPES[s.type].svg(s, { export: true }).startsWith('<g class="shadow" transform="translate(4 4)"'), s.id + ' draws it');
    T.ok(TD.toTikz([s]).includes('drop shadow={'), s.id + ' exports it');
  }
  T.ok(TD.toTikz([blob]).includes('plot[smooth cycle] coordinates'), 'a smooth closed curve keeps its plot');
  // the shadow keeps the hole (the path's own even odd rule does not reach drop shadow's fill)
  T.ok(TD.toTikz([region]).includes('fill=black, even odd rule}'), TD.toTikz([region]));
  T.ok(!TD.toTikz([poly()]).includes('even odd rule'), 'a plain polygon has no holes');
  T.ok(/\\path\[[^\]]*drop shadow/.test(TD.toTikz([poly({ stroke: null, fill: null })])), 'shadow alone writes a \\path');
  const open = poly({ closed: false });
  T.ok(!TD.canShadow(open) && !TD.toTikz([open]).includes('drop shadow') && !TD.TYPES.poly.svg(open, { export: true }).includes('class="shadow"'), 'an open polyline casts none');
  T.tex('shadow-polygons', TD.toTikz([poly(), { ...blob, pts: blob.pts.map(([x, y]) => [x, y + 140]) }, region], { standalone: true }));
});

T.test('image frame: the border grows the object round the picture, which keeps its place and size', () => {
  const s = photo({ border: 8 });
  T.eq(TD.TYPES.image.samples(s), [{ x: 32, y: 32 }, { x: 208, y: 168 }], 'the frame is the box');
  T.ok(TD.TYPES.image.handles(s).some((h) => h.x === 32 && h.y === 32), 'handles on the frame');
  // a corner drag resizes the frame and keeps the picture's aspect ratio
  const q = { ...s };
  TD.TYPES.image.setHandle(q, 'se', { x: 208 + 40, y: 168 + 100 }, {}, s);
  T.ok(Math.abs(q.w / q.h - 160 / 120) < 1e-9 && q.x === 40 && q.y === 40, JSON.stringify(q));
});

T.test('image frame: border, outline and shadow export as one node; the canvas draws the same frame', () => {
  const s = photo({ border: 8, stroke: '#cccccc', width: 1, shadow: true });
  const tex = TD.toTikz([s], { standalone: true });
  const node = tex.split('\n').map((l) => l.trim()).find((l) => l.startsWith('\\node['));
  T.ok(node && /inner sep=[\d.]+pt/.test(node) && node.includes('fill=white') && node.includes('drop shadow={') && /draw=\w+/.test(node), tex);
  T.ok(node.includes('\\includegraphics[width=4cm, height=3cm]{photo.png}'), node);
  const svg = TD.TYPES.image.svg(s, { export: true });
  T.ok(svg.startsWith('<g class="shadow"'), 'shadow first');
  T.ok(svg.includes('<rect x="32" y="32" width="176" height="136" fill="#ffffff"/>'), svg);
  T.ok(svg.includes('stroke="#cccccc"'), 'outline');
});

T.test('image frame: rounded corners clip the picture by what the border leaves', () => {
  const s = photo({ border: 4, radius: 10 });
  const tex = TD.toTikz([s]);
  T.ok(tex.includes(`\\clip[rounded corners=${TD.fmt(6 * TD.PT_PER_PX)}pt]`), tex);
  T.ok(tex.includes(`rounded corners=${TD.fmt(10 * TD.PT_PER_PX)}pt`), 'the frame keeps the full radius');
  const svg = TD.TYPES.image.svg(s, { export: true });
  T.ok(/<clipPath id="tdimgclip-[\w-]+"><rect [^>]* rx="6"/.test(svg) && svg.includes('clip-path="url(#tdimgclip-'), svg);
  T.ok(!TD.toTikz([photo({ border: 10, radius: 10 })]).includes('\\clip'), 'a border as wide as the radius needs no clip');
});

T.test('image frame: an image from before frames exports as it did', () => {
  const old = photo();
  for (const k of Object.keys(TD.IMAGE_FRAME)) delete old[k];
  const tex = TD.toTikz([old]);
  T.ok(tex.includes('\\node[anchor=north west, inner sep=0pt] at') && !tex.includes('drop shadow') && !tex.includes('fill='), tex);
  T.eq(TD.TYPES.image.samples(old), [{ x: 40, y: 40 }, { x: 200, y: 160 }]);
});

T.test('shadow: a photo collage compiles', async () => {
  const list = [
    rect({ id: 'bg', x: 0, y: 0, w: 560, h: 400, stroke: null, fill: '#dddddd' }),
    photo({ id: 'p1', file: 'a.png', border: 8, shadow: true, angle: 8 }),
    photo({ id: 'p2', file: 'b.png', x: 240, border: 8, shadow: true, stroke: '#bbbbbb', width: 0.5 }),
    photo({ id: 'p3', file: 'c.png', x: 120, y: 220, border: 6, radius: 12, shadow: true, shadowOffset: -3, opacity: 0.8 }),
    photo({ id: 'p4', file: 'd.png', x: 360, y: 220, radius: 8, stroke: '#000000', width: 2, shadow: true }),
    { ...TD.TYPES.ellipse.create({ x: 0, y: 0 }, TD.state.defaults), id: 'e', cx: 500, cy: 60, rx: 30, ry: 20, fill: '#ffcc00', shadow: true, opacity: 0.6 },
  ];
  const { result: tex, files } = TD.texImages.collect(() => TD.toTikz(list, { standalone: true }));
  const put = {};
  for (const e of await TD.app.texFiles(files, TD.texImages.svgFallback, true)) put[e.name] = [b64(e.data), Math.floor(e.date.getTime() / 1000)];
  T.tex('shadow-collage', tex, put);
});
