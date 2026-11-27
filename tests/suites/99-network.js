// The Network block (tikz-network, src/domain/network.ts): its code read and written back, drawn as tikz-network
// draws it (measured with pdfLaTeX: a vertex 0.6cm across, edges from border to border, \DefaultUnit 1cm), its CSV
// data files (\Vertices, \Edges), layers and multilayer=3d, the export with its data files, the importer and the
// lint, and the editor handing back the data files with the code.
{
  const N = TD.network, PT = 1 / TD.PT_PER_PX, CM = TD.PX_PER_CM;
  const near = (a, b, msg, eps = 0.05) => T.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
  const pic = (body, opts = '') => `\\begin{tikzpicture}${opts ? `[${opts}]` : ''}\n${body}\n\\end{tikzpicture}`;
  const lay = (src, files = {}) => N.layout({ src, files });

  T.test('network: the code is read and written back as it was', () => {
    const M = N.parse(TD.NETWORK_DEFAULT);
    T.eq(M.warnings, []);
    T.eq(M.items.map((it) => it.k).join(''), 'vvveee');
    T.eq(M.items[3].a + M.items[3].b, 'AB');
    T.eq(N.write(M).trim(), TD.NETWORK_DEFAULT.trim());
    // options are set and removed; a flag is written bare
    const o = N.setOpt(N.setOpt(['x=1', 'y=2'], 'Direct', true), 'y', null);
    T.eq(o, ['x=1', 'Direct']);
    T.ok(N.flag(o, 'Direct') && !N.flag(o, 'Math'), 'flags');
  });

  T.test('network: vertices and edges where tikz-network puts them', () => {
    const L = lay(pic('\\Vertex[x=0,y=0]{A}\n\\Vertex[x=2,y=0]{B}\n\\Edge(A)(B)\n\\Edge[Direct,bend=30](B)(A)\n\\Edge(A)(A)'));
    const A = L.nodes.get('A'), B = L.nodes.get('B');
    near(B.px - A.px, 2 * CM, 'x in \\DefaultUnit (1cm)');
    near(A.py, B.py, 'same height');
    // MinSize 0.6\DefaultUnit: radius 8.5359pt (line width outside it)
    near(A.r, 8.5359 * PT, 'a vertex is 0.6cm across', 0.3);
    const [ab, ba, loop] = L.edges;
    near(Math.hypot(ab.P.pts[0][0] - A.px, ab.P.pts[0][1] - A.py), A.r, 'an edge starts on the border', 0.5);
    T.ok(!ab.loop && loop.loop, 'a loop is a loop');
    // a bend takes the edge off the straight line
    T.ok(ba.P.pts.some((p) => Math.abs(p[1] - A.py) > 5), 'bend=30 bends');
  });

  T.test('network: CSV data files give vertices and edges; the block\'s own options override a row\'s', () => {
    const files = { 'v.csv': 'id,x,y,color,R,G,B\nA,0,0,red,,,\nB,3,0,,0,0,255\nC,0,2,,,,\n', 'e.csv': 'u,v,label,Direct\nA,B,7,true\nB,C,,\n' };
    const L = lay(pic('\\Vertices[RGB]{v.csv}\n\\Edges{e.csv}\n\\Edge(C)(A)'), files);
    T.eq(L.warnings, []);
    T.eq([...L.nodes.keys()], ['A', 'B', 'C']);
    near(L.nodes.get('B').px - L.nodes.get('A').px, 3 * CM, 'x from the file');
    T.eq(L.edges.length, 3);
    T.eq(L.edges[0].src.file, 'e.csv');
    T.eq(L.edges[0].src.row, 0);
    T.ok(L.edges[0].label, 'a label from its row');
    // a file the block doesn't have is named in a warning, not fatal
    const M = lay(pic('\\Vertices{gone.csv}\n\\Vertex{A}'));
    T.ok(M.warnings.some((w) => /gone\.csv/.test(w)), 'missing file warned: ' + M.warnings);
    T.eq(M.nodes.size, 1);
    // the CSV text round trip keeps quoting
    const t = N.csv('id,label\nA,"a, b"\n');
    T.eq(t.rows[0][1], 'a, b');
    T.eq(N.csv(N.csvText(t)).rows[0][1], 'a, b');
    T.eq(N.dataFiles(pic('\\Vertices{v.csv}\n\\Edges[vertices=v.csv]{e.csv}')).sort(), ['e.csv', 'v.csv']);
  });

  T.test('network: multilayer=3d puts a layer on its plane in perspective', () => {
    // 3d: X=(37°:1cm), Y=(−12°:1cm), Z=(90°:1cm); a layer is canvas is yx plane at z=(layer−1)·(−2): its x along Y
    const L = lay(pic('\\Vertex[x=0,y=0,layer=1]{O}\n\\Vertex[x=1,y=0,layer=1]{P}\n\\Vertex[x=0,y=1,layer=1]{Q}\n\\Vertex[x=0,y=0,layer=2]{R}', 'multilayer=3d'));
    const O = L.nodes.get('O'), P = L.nodes.get('P'), Q = L.nodes.get('Q'), R = L.nodes.get('R');
    const ang = (n) => (Math.atan2(-(n.py - O.py), n.px - O.px) * 180) / Math.PI;
    near(ang(P), -12, 'a layer\'s x runs along Y (−12°)', 0.5);
    near(ang(Q), 37, 'its y along X (37°)', 0.5);
    near(R.py - O.py, 2 * CM, 'layer 2 sits 2cm below', 0.5);
    near(R.px, O.px, 'straight below', 0.5);
    // a plane is a parallelogram on its layer
    const pl = lay(pic('\\Plane[x=0,y=0,width=2,height=1]', 'multilayer=3d')).planes[0];
    T.eq(pl.pts.length, 4);
  });

  T.test('network: the export carries the data files and the package', () => {
    const s = { ...TD.TYPES.network.create({ x: 0, y: 0 }), src: pic('\\Vertices{v.csv}\n\\Edges{e.csv}'), files: { 'v.csv': 'id,x,y\nA,0,0\nB,1,1\n', 'e.csv': 'u,v\nA,B\n' } };
    const { result: tex, files } = TD.texImages.collect(() => TD.toTikz([s], { standalone: true }));
    T.ok(/\\usepackage\{tikz-network\}/.test(tex), 'package');
    T.ok(/\\begin\{scope\}\[shift=/.test(tex) && /\\Vertices\{v\.csv\}/.test(tex), 'the picture as a scope');
    T.eq([...files.keys()].sort(), ['e.csv', 'v.csv']);
    T.ok(decodeURIComponent(files.get('v.csv').split(',').slice(1).join(',')).startsWith('id,x,y'), 'the file\'s text');
    T.eq(TD.lint(tex, { preview: false }).filter((d) => d.sev !== 'info').map((d) => d.msg), []);
    // and pdfLaTeX builds it with the files beside it
    const b64 = (u) => btoa(decodeURIComponent(u.split(',').slice(1).join(',')));
    T.tex('network-csv', tex, Object.fromEntries([...files].map(([k, v]) => [k, b64(v)])));
    // a 3D multilayer network with planes, labels, bends and loops
    const ml = { ...TD.TYPES.network.create({ x: 0, y: 0 }), src: pic('\\Plane[x=-.5,y=-.5,width=3,height=3,layer=1]\n\\Plane[x=-.5,y=-.5,width=3,height=3,layer=2,NoBorder]\n\\Vertex[x=0,y=0,layer=1,label=$a$]{A}\n\\Vertex[x=2,y=1,layer=1,color=red]{B}\n\\Vertex[x=1,y=2,layer=2,shape=diamond]{C}\n\\Edge[Direct,bend=20,label=1](A)(B)\n\\Edge(B)(C)\n\\Edge[loopposition=90](C)(C)\n\\Text[x=3,y=3]{Layers}', 'multilayer=3d') };
    T.tex('network-3d', TD.toTikz([ml], { standalone: true }));
  });

  T.test('network: a picture of tikz-network commands imports as a Network block; lint wants the package', () => {
    const doc = (body) => `\\documentclass{article}\n\\usepackage{tikz-network}\n\\begin{document}\n${body}\n\\end{document}`;
    const sh = TD.importLatex(doc(TD.NETWORK_DEFAULT)).blocks.flatMap((b) => b.shapes || []).filter((x) => !(x.type === 'tikz' && x.kind === 'defs'));
    T.eq(sh.map((x) => x.type), ['network']);
    T.ok(/\\Edge\[label=1\]\(A\)\(B\)/.test(sh[0].src), 'its code');
    const lint = TD.lint(`\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n${TD.NETWORK_DEFAULT}\n\\end{document}\n`, { preview: false });
    T.ok(lint.some((d) => /tikz-network/.test(d.msg)), 'tikz-network missing: ' + lint.map((d) => d.msg));
  });

  T.test('network: auto layout places written vertices, not those from files or layers', () => {
    const M = N.parse(pic('\\Vertex{A}\n\\Vertex{B}\n\\Vertex{C}\n\\Vertex[layer=1,x=5]{D}\n\\Edge(A)(B)\n\\Edge(B)(C)'));
    T.ok(N.autoLayout(M, 'spring', 2), 'laid out');
    const xy = (id) => { const it = M.items.find((x) => x.id === id); return [+N.getOpt(it.o, 'x'), +N.getOpt(it.o, 'y')]; };
    const [a, b] = [xy('A'), xy('B')];
    T.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5, 'apart');
    T.eq(N.getOpt(M.items[3].o, 'x'), '5');
  });

  T.test('network editor: a vertex placed from the palette, and the data files handed back on Done', async () => {
    const block = T.make('network');
    block.files = { 'v.csv': 'id,x,y\nZ,4,0\n' };
    block.src = pic('\\Vertices{v.csv}\n\\Vertex[x=0,y=0]{A}');
    let got = null;
    TD.networkEditor.open(block, (r) => { got = r; });
    const root = document.getElementById('networkModal');
    try {
      T.ok(!root.hidden, 'open');
      T.ok(/2 vertices/.test(root.querySelector('.cz-count').textContent), 'counted with the file\'s: ' + root.querySelector('.cz-count').textContent);
      // arm the circle vertex (V) and click the stage
      document.activeElement?.blur?.();
      await new Promise((r) => requestAnimationFrame(() => r()));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
      const svg = root.querySelector('.network-svg'), r = svg.getBoundingClientRect();
      const at = { clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.3, button: 0, pointerId: 1, bubbles: true };
      svg.dispatchEvent(new PointerEvent('pointerdown', at));
      svg.dispatchEvent(new PointerEvent('pointerup', at));
      T.ok(/\\Vertex\[[^\]]*IdAsLabel\]\{B\}/.test(root.querySelector('.cz-code textarea').value), 'a new vertex B: ' + root.querySelector('.cz-code textarea').value);
      root.querySelector('[data-ne="done"]').click();
      T.ok(got && /\{B\}/.test(got.src), 'the code');
      T.eq(got.files, { 'v.csv': 'id,x,y\nZ,4,0\n' });
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 300)); TD.confirm = c; } }
  });

  T.test('network: settings before the picture (\\SetCoordinates) set the 3D axes, and stay ahead of it in the export', () => {
    const src = '\\SetCoordinates[xAngle=-30,yLength=1.2]\n' + pic('\\Vertex[x=0,y=0,layer=1]{O}\n\\Vertex[x=1,y=0,layer=1]{P}\n\\Vertex[x=0,y=1,layer=1]{Q}', 'multilayer=3d');
    const L = lay(src), O = L.nodes.get('O'), P = L.nodes.get('P'), Q = L.nodes.get('Q');
    near((Math.atan2(-(P.py - O.py), P.px - O.px) * 180) / Math.PI, -30, 'a layer\'s x along xAngle', 0.5);
    near(Math.hypot(Q.px - O.px, Q.py - O.py), 1.2 * CM, 'its y as long as yLength', 0.5);
    T.eq(N.parse(src).pre.map((it) => it.cmd), ['SetCoordinates']);
    T.ok(N.write(N.parse(src)).startsWith('\\SetCoordinates[xAngle=-30,yLength=1.2]\n\\begin{tikzpicture}'), 'written back before the picture');
    const tex = TD.toTikz([{ ...TD.TYPES.network.create({ x: 0, y: 0 }), src }], { standalone: true });
    T.ok(/\\SetCoordinates\[xAngle=-30,yLength=1\.2\]\n\s*\\begin\{scope\}\[multilayer=3d\]/.test(tex), 'ahead of the options:\n' + tex);
    T.tex('network-coordinates', tex);
    // inside the picture it is too late, as in TeX
    T.ok(lay(pic('\\SetCoordinates[xAngle=-30]\n\\Vertex{A}', 'multilayer=3d')).warnings.some((w) => /SetCoordinates/.test(w)), 'warned');
  });

  T.test('network: shadings, boxed text, edge paths through coordinates and TikZ in a layer are drawn', () => {
    const svgOf = (src, files = {}) => TD.network.draw({ type: 'network', x: 0, y: 0, src, files }, { export: true });
    T.ok(/<radialGradient[^>]*cx="-10" cy="10"/.test(svgOf(pic('\\Vertex[style={shading=ball}]{A}'))), 'a ball shading');
    T.ok(/<radialGradient[^>]*cx="0" cy="0"/.test(svgOf(pic('\\Plane[style={inner color=white,outer color=red}]'))), 'a radial shading on a plane');
    T.ok(/<rect[^>]*fill="#ff0000"/i.test(svgOf(pic('\\Text[style={fill=red}]{B}'))), 'a filled text box');
    T.ok(/<circle r="[\d.]+"[^>]*stroke=/.test(svgOf(pic('\\Text[style={draw,circle}]{C}'))), 'a drawn circle round text');
    const L = lay(pic('\\Vertex{A}\n\\Vertex[x=2]{B}\n\\Edge[path={A,{1,-1},B}](A)(B)'));
    T.eq(L.warnings, []);
    T.ok(L.edges[0].P.pts.some((p) => Math.abs(p[1] - CM) < 1), 'the path goes down through (1,-1)');
    const R = lay(pic('\\begin{Layer}[layer=2]\n\\draw (0,0) -- (1,0);\n\\end{Layer}', 'multilayer=3d'));
    T.eq(R.warnings, []);
    T.ok(R.fg.some((p) => p.shapes && p.shapes.length), 'the \\draw drawn as an object');
    T.ok(/<image[^>]*href="data:image\/png/.test(svgOf(pic('\\Plane[image=p.png]', 'multilayer=3d'), { 'p.png': 'data:image/png;base64,iVBORw0KGgo=' })), 'a picture on a plane');
  });

  T.test('network editor: the panel sets any key, several selected at once; ⌘D duplicates; the picture\'s settings and styles', async () => {
    const block = T.make('network');
    block.src = pic('\\Vertex[x=0,y=0]{A}\n\\Vertex[x=1,y=0]{B}\n\\Edge(A)(B)');
    TD.networkEditor.open(block, () => {});
    const root = document.getElementById('networkModal'), ta = () => root.querySelector('.cz-code textarea').value;
    const typeIn = (sel, v) => { const el = root.querySelector(sel); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); };
    try {
      // select both vertices (⌘A) and set their fill and font size
      document.activeElement?.blur?.();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, ctrlKey: true, bubbles: true }));
      T.ok(/2 vertices/.test(root.querySelector('.cz-props').textContent), 'two selected: ' + root.querySelector('.cz-props').textContent.slice(0, 80));
      typeIn('[data-f="opacity"]', '0.5');
      T.eq((ta().match(/opacity=0\.5/g) || []).length, 2, 'both set:\n' + ta());
      const fs = root.querySelector('select[data-f="fontsize"]');
      fs.value = '\\Large'; fs.dispatchEvent(new Event('change', { bubbles: true }));
      T.eq((ta().match(/fontsize=\\Large/g) || []).length, 2, 'font size on both:\n' + ta());
      // ⌘D: copies with new names, the edge between them too
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, ctrlKey: true, bubbles: true }));
      T.ok(/\{A1\}/.test(ta()) && /\{B1\}/.test(ta()) && /\\Edge(\[[^\]]*\])?\(A1\)\(B1\)/.test(ta()), 'duplicated:\n' + ta());
      // nothing selected: the picture's settings
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      root.querySelector('[data-fs="multilayer"][data-v="3d"]').click();
      typeIn('[data-f="C:xAngle"]', '-30');
      typeIn('[data-f="S:SetVertexStyle:LineWidth"]', '2pt');
      T.ok(/^\\SetCoordinates\[xAngle=-30\]\n\\begin\{tikzpicture\}\[multilayer=3d\]/.test(ta()), 'coordinates before the picture:\n' + ta());
      T.ok(/\\SetVertexStyle\[LineWidth=2pt\]/.test(ta()), 'a vertex style:\n' + ta());
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 300)); TD.confirm = c; } T.ok(root.hidden, 'closed'); }
  });

  T.test('network: the code is kept in the order its layers lie: the farthest painted first, edges after their vertices, nothing crossing a setting', () => {
    const order = (src) => { const M = N.parse(src); const moved = N.layerOrder(M); return { moved, lines: M.items.map((it) => N.itemCode(it)) }; };
    const r = order(pic(['\\Plane[layer=1]', '\\Vertex[layer=1]{A}', '\\Plane[layer=2]', '\\Vertex[layer=2]{B}', '\\Vertex[layer=3]{C}', '\\Edge(A)(B)', '\\Edge(B)(C)', '\\Text{title}'].join('\n'), 'multilayer=3d'));
    T.ok(r.moved, 'moved');
    T.eq(r.lines, ['\\Vertex[layer=3]{C}', '\\Plane[layer=2]', '\\Vertex[layer=2]{B}', '\\Edge(B)(C)', '\\Plane[layer=1]', '\\Vertex[layer=1]{A}', '\\Edge(A)(B)', '\\Text{title}'], 'layer 3, then 2 (its edge from 3 once both are there), then 1, then what is on no layer');
    T.ok(!order(pic(r.lines.join('\n'), 'multilayer=3d')).moved, 'in order already: nothing moves');
    T.eq(order(pic('\\Vertex[layer=1]{A}\n\\SetVertexStyle[FillColor=red]\n\\Vertex[layer=1]{C}\n\\Vertex[layer=2]{B}')).lines, ['\\Vertex[layer=1]{A}', '\\SetVertexStyle[FillColor=red]', '\\Vertex[layer=2]{B}', '\\Vertex[layer=1]{C}'], 'nothing crosses a setting; each side is sorted');
    const env = order(pic('\\begin{Layer}[layer=1]\n\\Vertex{A}\n\\end{Layer}\n\\begin{Layer}[layer=2]\n\\Vertex{B}\n\\end{Layer}'));
    T.eq(env.lines.filter((l) => /Vertex/.test(l)), ['\\Vertex{B}', '\\Vertex{A}'], 'a Layer environment moves as one');
    T.eq(env.lines[0], '\\begin{Layer}[layer=2]');
    T.ok(!order(pic('\\Vertex[layer=1]{A}\n\\begin{Layer}[layer=2]\n\\Vertex{B}\n\\Edge(A)(B)\n\\end{Layer}')).moved, 'a Layer environment with an edge to A stays after A');
    T.eq(order(pic('\\SetLayerDistance{2}\n\\Vertex[layer=2]{B}\n\\Vertex[layer=1]{A}')).lines.slice(1), ['\\Vertex[layer=1]{A}', '\\Vertex[layer=2]{B}'], 'a positive layer distance puts layer 2 on top');
  });

  T.test('network: Bring to Front, Bring Forward, Send Backward and Send to Back move an item among those on its own layer', () => {
    const M = N.parse(pic('\\Vertex[layer=2]{A}\n\\Vertex[layer=2]{B}\n\\Vertex[layer=2]{C}\n\\Vertex[layer=1]{D}\n\\Edge(A)(B)\n\\Edge(B)(C)', 'multilayer=3d'));
    const ids = () => M.items.filter((it) => it.k === 'v').map((it) => it.id).join(''), at = (id) => M.items.findIndex((it) => it.id === id);
    const edgeAfter = () => M.items.every((it, i) => it.k !== 'e' || (at(it.a) < i && at(it.b) < i));
    T.ok(N.arrange(M, [at('A')], 'front')); T.eq(ids(), 'BCAD', 'to the front of layer 2, still under layer 1'); T.ok(edgeAfter(), 'edges after their vertices');
    T.ok(N.arrange(M, [at('A')], 'backward')); T.eq(ids(), 'BACD', 'one back');
    T.ok(N.arrange(M, [at('A')], 'back')); T.eq(ids(), 'ABCD', 'to the back');
    T.ok(!N.arrange(M, [at('A')], 'back'), 'already at the back');
    T.ok(!N.arrange(M, [at('C')], 'forward'), 'C: in front on layer 2 (D on layer 1 is not passed)');
    T.ok(!N.arrange(M, [at('D')], 'front'), 'D: alone on layer 1');
    const e1 = M.items.find((it) => it.k === 'e' && it.a === 'A');
    T.ok(N.arrange(M, [M.items.indexOf(e1)], 'front')); T.ok(M.items.indexOf(e1) > M.items.findIndex((it) => it.k === 'e' && it.a === 'B'), 'an edge among the edges');
    T.ok(edgeAfter(), 'still after its vertices');
  });

  T.test('network editor: in 3D the grid and origin lie on the layer new items go on and placing snaps there; the code keeps its layers in order; Arrange moves within a layer', async () => {
    const block = T.make('network');
    block.src = pic('\\Plane[layer=1,width=4,height=3]\n\\Plane[layer=2,width=4,height=3]\n\\Vertex[x=1,y=1,layer=1]{A}\n\\Vertex[x=1,y=1,layer=2]{B}\n\\Vertex[x=3,y=2,layer=2]{C}', 'multilayer=3d');
    TD.networkEditor.open(block, () => {});
    const root = document.getElementById('networkModal'), ta = () => root.querySelector('.cz-code textarea').value, svg = root.querySelector('.network-svg');
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const key = (o) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...o }));
    const click = (X, Y, button = 0) => { const r = svg.getBoundingClientRect(), at = { clientX: r.left + X, clientY: r.top + Y, button, pointerId: 1, bubbles: true }; svg.dispatchEvent(new PointerEvent('pointerdown', at)); svg.dispatchEvent(new PointerEvent('pointerup', at)); return at; };
    try {
      await frame(); document.activeElement?.blur?.();
      T.ok(root.querySelector('[data-ne="layerorder"]'), 'written with layer 1 before layer 2: a note says so, with a button to sort it');
      const maj = svg.querySelector('.cz-gmaj').getAttribute('d');
      T.ok(/L/.test(maj) && !/[VH]/.test(maj), 'the grid in perspective, along the layer\'s axes: ' + maj.slice(0, 60));
      T.ok(/L/.test(svg.querySelector('.cz-origin').getAttribute('d')), 'and its origin');
      // place a vertex: on layer 1, at a grid point of that layer
      key({ key: 'v' });
      const r = svg.getBoundingClientRect();
      click(r.width * 0.37, r.height * 0.41);
      const m = /\\Vertex\[x=(-?[\d.]+),y=(-?[\d.]+),layer=1,IdAsLabel\]\{D\}/.exec(ta());
      T.ok(m, 'a new vertex D on layer 1:\n' + ta());
      if (m) T.ok(Number.isInteger(+m[1] * 4) && Number.isInteger(+m[2] * 4), `on the layer's grid: (${m[1]}, ${m[2]})`);
      const pos = (s) => ta().indexOf(s);
      T.ok(pos('Plane[layer=2') < pos('{B}') && pos('{C}') < pos('Plane[layer=1') && pos('Plane[layer=1') < pos('{A}') && pos('{A}') < pos('{D}'), 'layer 2 first, then layer 1:\n' + ta());
      key({ key: 'Escape' });
      T.ok(!root.querySelector('[data-ne="layerorder"]'), 'in order now: no note');
      // B to the front of layer 2: past C, still under layer 1
      key({ key: 'a', metaKey: true, ctrlKey: true });
      const halo = [...svg.querySelectorAll('circle.fy-vsel')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]); // B, C, A, D: the code's order
      key({ key: 'Escape' });
      click(...halo[0]);
      key({ key: ']', code: 'BracketRight', metaKey: true, ctrlKey: true, shiftKey: true });
      T.ok(pos('{C}') < pos('{B}') && pos('{B}') < pos('Plane[layer=1'), 'B in front on layer 2:\n' + ta());
      const before = ta();
      key({ key: ']', code: 'BracketRight', metaKey: true, ctrlKey: true, shiftKey: true });
      T.eq(ta(), before, 'already in front on its layer: nothing moves');
      T.ok(/Already in front/.test(root.querySelector('.cz-tip').textContent), 'and it says so: ' + root.querySelector('.cz-tip').textContent);
      key({ key: '[', code: 'BracketLeft', metaKey: true, ctrlKey: true });
      T.ok(pos('{B}') < pos('{C}'), 'Ctrl+[: one back');
      // the right-click menu has them too
      const at = click(...halo[0], 2);
      svg.dispatchEvent(new MouseEvent('contextmenu', { ...at, bubbles: true, cancelable: true }));
      const menu = document.querySelector('.kit-menu');
      T.ok(menu && /Arrange/.test(menu.textContent), 'an Arrange row: ' + (menu?.textContent || '').slice(0, 80));
      key({ key: 'Escape' });
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 300)); TD.confirm = c; } T.ok(root.hidden, 'closed'); }
  });

  T.test('network: a focused layer is drawn in front at full strength, the other layers faded under it', () => {
    const src = pic('\\Plane[layer=1]\n\\Plane[layer=2,color=green]\n\\Vertex[layer=1,IdAsLabel]{A}\n\\Vertex[layer=2,IdAsLabel]{B}\n\\Edge(A)(B)\n\\Edge[style=dashed](B)(B)', 'multilayer=3d');
    const s = { type: 'network', x: 0, y: 0, src, files: {} };
    const plain = N.draw(s, { export: true }), focused = N.draw(s, { export: true, focus: -2 });
    T.ok(!/nw-faded/.test(plain), 'no focus: nothing faded');
    const at = focused.indexOf('nw-faded'), faded = focused.slice(at, focused.indexOf('</g>', focused.lastIndexOf('nw-faded')));
    T.ok(at > 0, 'a faded group');
    const L = lay(src), nodeA = L.nodes.get('A'), nodeB = L.nodes.get('B');
    T.ok(nodeA.layer === 0 && nodeB.layer === -2, 'A on layer 1 (z 0), B on layer 2 (z −2)');
    // the green plane (layer 2) after the faded group; layer 1's plane in it
    const green = focused.lastIndexOf('#00ff00') >= 0 ? focused.lastIndexOf('#00ff00') : focused.lastIndexOf('rgb(0,255,0)');
    T.ok(green > at, 'the focused layer\'s plane drawn after the faded group');
    T.ok(focused.split('<path').length === plain.split('<path').length, 'the same things drawn, only in another order');
  });

  T.test('network editor: the layer selector focuses a layer (the rest faded and out of reach, new items on it); a click on an item puts the grid on its layer', async () => {
    const block = T.make('network');
    block.src = pic('\\Plane[layer=2,width=4,height=3]\n\\Vertex[x=1,y=1,layer=2,IdAsLabel]{B}\n\\Plane[layer=1,width=4,height=3]\n\\Vertex[x=3,y=2,layer=1,IdAsLabel]{A}\n\\Edge(A)(B)', 'multilayer=3d');
    TD.networkEditor.open(block, () => {});
    const root = document.getElementById('networkModal'), ta = () => root.querySelector('.cz-code textarea').value, svg = root.querySelector('.network-svg');
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const key = (o) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...o }));
    const click = (X, Y) => { const r = svg.getBoundingClientRect(), at = { clientX: r.left + X, clientY: r.top + Y, button: 0, pointerId: 1, bubbles: true }; svg.dispatchEvent(new PointerEvent('pointerdown', at)); svg.dispatchEvent(new PointerEvent('pointerup', at)); };
    const origin = () => svg.querySelector('.cz-origin').getAttribute('d');
    const nl = (v) => root.querySelector(`.nw-layers [data-nl="${v}"]`);
    try {
      await frame(); document.activeElement?.blur?.();
      const sel = root.querySelector('.nw-layers');
      T.ok(sel && !sel.hidden, 'the layer selector, for a multilayer picture');
      T.eq([...sel.querySelectorAll('.nw-layers-list [data-nl]')].map((b) => b.dataset.nl), ['1', '2', '3'], 'layer 1 (the nearest) at the top, then 2, then a new layer 3');
      T.eq(nl('').getAttribute('aria-pressed'), 'true', 'no layer focused to begin with');
      T.ok(!svg.querySelector('.nw-faded'), 'nothing faded');
      // where each vertex is (the code's order: B, A)
      key({ key: 'a', metaKey: true, ctrlKey: true });
      const halo = [...svg.querySelectorAll('circle.fy-vsel')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
      key({ key: 'Escape' });
      const o1 = origin();
      click(...halo[0]); // B, on layer 2
      T.ok(origin() !== o1, 'a click on B puts the grid on layer 2: ' + o1 + ' → ' + origin());
      key({ key: 'Escape' });
      // focus layer 1
      nl('1').click();
      await frame();
      T.eq(nl('1').getAttribute('aria-pressed'), 'true', 'layer 1 focused');
      T.eq(nl('').getAttribute('aria-pressed'), 'false');
      T.ok(svg.querySelector('.nw-faded'), 'the other layers faded');
      T.eq(origin(), o1, 'the grid on layer 1');
      click(...halo[0]); // B is faded: out of reach
      T.ok(!root.querySelector('[data-f="id"]') || root.querySelector('[data-f="id"]').value !== 'B', 'B, faded, can\'t be selected while layer 1 is focused');
      key({ key: 'a', metaKey: true, ctrlKey: true });
      T.eq(svg.querySelectorAll('circle.fy-vsel').length, 1, '⌘A: only what is on layer 1');
      key({ key: 'Escape' });
      // a new vertex goes on the focused layer
      key({ key: 'v' });
      const r = svg.getBoundingClientRect();
      click(r.width * 0.6, r.height * 0.3);
      T.ok(/\\Vertex\[[^\]]*layer=1[^\]]*\]\{C\}/.test(ta()), 'C on layer 1:\n' + ta());
      key({ key: 'Escape' }); key({ key: 'Escape' });
      // the new layer 3: focused while empty, new items on it
      nl('3').click(); await frame();
      T.eq(nl('3').getAttribute('aria-pressed'), 'true', 'layer 3 focused');
      T.ok(nl('4'), 'and a new layer 4 offered after it');
      // Esc: every layer again
      key({ key: 'Escape' }); await frame();
      T.eq(nl('').getAttribute('aria-pressed'), 'true', 'Esc: no layer focused');
      T.ok(!svg.querySelector('.nw-faded'), 'nothing faded');
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 300)); TD.confirm = c; } T.ok(root.hidden, 'closed'); }
  });

  T.test('network editor: right-click on a layer deletes it: what is on it goes, the layers behind move up one', async () => {
    const block = T.make('network');
    block.src = pic('\\Plane[layer=1]\n\\Vertex[layer=1,IdAsLabel]{A}\n\\Plane[layer=2]\n\\Vertex[layer=2,IdAsLabel]{B}\n\\Vertex[layer=3,IdAsLabel]{C}\n\\Edge(A)(B)\n\\Edge(A)(C)', 'multilayer=3d');
    TD.networkEditor.open(block, () => {});
    const root = document.getElementById('networkModal'), ta = () => root.querySelector('.cz-code textarea').value;
    try {
      await new Promise((r) => requestAnimationFrame(() => r()));
      { const h = root.querySelector('.nw-layers [data-nl=""]'); T.eq(h.dataset.tip || h.title, 'All layers (Esc)', 'short tooltips'); }
      T.ok(root.querySelector('.nw-layers [data-nl=""] svg'), 'a drawn symbol for all layers');
      const b2 = root.querySelector('.nw-layers [data-nl="2"]'), r = b2.getBoundingClientRect();
      b2.dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + 5, clientY: r.top + 5, bubbles: true, cancelable: true }));
      const row = [...document.querySelectorAll('.kit-menu [role^="menuitem"], .kit-menu button')].find((x) => /Delete Layer 2/.test(x.textContent));
      T.ok(row, 'a Delete Layer 2 row');
      row.click();
      await new Promise((r) => setTimeout(r, 50));
      T.ok(!/\{B\}|Edge\(A\)\(B\)|layer=2\]$/m.test(ta()) && !/Plane\[layer=2\]/.test(ta()), 'layer 2\'s plane, vertex and its edge gone:\n' + ta());
      T.ok(/\\Vertex\[layer=2,IdAsLabel\]\{C\}/.test(ta()) && /\\Edge\(A\)\(C\)/.test(ta()), 'C moved up to layer 2, its edge kept:\n' + ta());
      T.eq([...root.querySelectorAll('.nw-layers-list [data-nl]')].map((b) => b.dataset.nl), ['1', '2', '3'], 'layers 1 and 2, then a new 3');
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 300)); TD.confirm = c; } T.ok(root.hidden, 'closed'); }
  });
}
{
  const pic = (b) => `\\begin{tikzpicture}\n${b}\n\\end{tikzpicture}`;
  T.test('network editor: the palette places an ellipse, a triangle (a three-sided regular polygon) and a hidden vertex; an edge through a point runs through a hidden vertex halfway', async () => {
    const block = T.make('network');
    block.src = pic('\\Vertex[x=0,y=0,IdAsLabel]{A}\n\\Vertex[x=4,y=2,IdAsLabel]{B}\n\\Edge(A)(B)');
    TD.networkEditor.open(block, () => {});
    const root = document.getElementById('networkModal'), code = () => root.querySelector('.cz-code textarea').value;
    const svg = root.querySelector('.network-svg'), r = svg.getBoundingClientRect();
    const click = (fx, fy) => { const at = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, button: 0, pointerId: 1, bubbles: true }; svg.dispatchEvent(new PointerEvent('pointerdown', at)); svg.dispatchEvent(new PointerEvent('pointerup', at)); };
    const item = (k) => root.querySelector(`[data-item="${k}"]`);
    try {
      for (const k of ['v:ellipse', 'v:triangle', 'v:pseudo', 'e:via']) T.ok(item(k), 'in the palette: ' + k);
      const place = async (k, fx) => { root.querySelector('[data-ne]')?.focus?.(); document.activeElement?.blur?.(); item(k).click(); await new Promise((res) => requestAnimationFrame(() => res())); click(fx, 0.8); };
      // Escape only while there is an arming or a selection to clear: with nothing left, Escape closes the editor (and asks)
      const busy = () => root.querySelector('.fy-vsel, .ze-wsel, [data-item].on:not([data-item^="e:"])');
      const esc = () => { for (let i = 0; i < 3 && busy(); i++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
      await place('v:ellipse', 0.2); T.ok(/\\Vertex\[[^\]]*shape=ellipse[^\]]*\]\{C\}/.test(code()), 'an ellipse: ' + code()); T.ok(/shape=ellipse,[^\]]*style=\{minimum width=1cm\}/.test(code()), 'given a width'); esc();
      await place('v:triangle', 0.35); T.ok(/\\Vertex\[[^\]]*shape=regular polygon[^\]]*style=\{regular polygon sides=3\}[^\]]*\]\{D\}/.test(code()), 'a triangle: ' + code());
      T.eq(root.querySelector('select[data-f="shape"]')?.value, 'triangle', 'the panel names it Triangle'); esc();
      await place('v:pseudo', 0.5); T.ok(/\\Vertex\[[^\]]*Pseudo\]\{E\}/.test(code()) && !/IdAsLabel\]\{E\}/.test(code()), 'a hidden vertex, no label: ' + code()); esc();
      T.ok(root.querySelector('.nw-ghost'), 'marked on the stage by a dashed ring');
      // a selected edge, then "through a point": it gets a hidden vertex halfway and runs through it
      // where A and B are: select all, their rings come first (the vertices in code order)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, metaKey: true, bubbles: true }));
      const rings = [...root.querySelectorAll('circle.fy-vsel')].map((c) => [r.left + +c.getAttribute('cx'), r.top + +c.getAttribute('cy')]);
      T.ok(rings.length >= 2, 'rings: ' + rings.length);
      esc();
      const [[ax, ay], [bx, by]] = rings;
      const at = { clientX: (ax + bx) / 2, clientY: (ay + by) / 2, button: 0, pointerId: 1, bubbles: true };
      svg.dispatchEvent(new PointerEvent('pointerdown', at)); svg.dispatchEvent(new PointerEvent('pointerup', at));
      item('e:via').click();
      T.ok(/\\Vertex\[x=2,y=1,Pseudo\]\{F\}/.test(code()), 'a hidden vertex halfway: ' + code());
      T.ok(/\\Edge\[path=F\]\(A\)\(B\)/.test(code()), 'the edge runs through it');
      T.ok(![...document.querySelectorAll('.td-dialog')].some((d) => d.getClientRects().length), 'no dialog left open');
    } finally { if (!root.hidden) { const c = TD.confirm; TD.confirm = async () => true; root.querySelector('[data-ne="cancel"]')?.click(); await new Promise((res) => setTimeout(res, 300)); TD.confirm = c; } }
  });
}
T.test('network: the palette\'s new shapes compile: an ellipse given a width, a triangle, a hidden vertex an edge runs through', () => {
  const s = T.make('network');
  s.src = '\\begin{tikzpicture}\n\\Vertex[x=0,y=0,IdAsLabel]{A}\n\\Vertex[x=4,y=0,IdAsLabel]{B}\n\\Vertex[x=2,y=1.5,Pseudo]{H}\n\\Edge[path=H](A)(B)\n\\Vertex[x=1,y=-2,shape=regular polygon,style={regular polygon sides=3}]{T}\n\\Vertex[x=3,y=-2,shape=ellipse,style={minimum width=1cm}]{E}\n\\end{tikzpicture}';
  const svg = TD.TYPES.network.svg(s, {});
  T.ok(/<path/.test(svg), 'drawn');
  T.tex('network-palette-shapes', TD.toTikz([s], { standalone: true }));
});
