// Round trips. TikZ the app wrote, pasted back without its data comment:
// - must export again exactly as written (the source write-back, s.tex), and
// - tests/golden/roundtrip.txt records, per parity figure, how much of it became editable shapes (the rest is
//   kept as TikZ code objects) and whether code generated from those shapes alone (no write-back) is the same,
//   so any change in what the importer models shows up as a diff of that file.
const body = (tex) => tex.split('\n').filter((l) => !/^% (Requires|and, in|  )/.test(l)).join('\n').trim();
const noTex = (L) => L.map(({ tex, ...r }) => r);
T.test('round trip: export → import → export, per figure', () => {
  const rows = [], lost = [];
  for (const n of Object.keys(KIT)) {
    const list = KIT[n]();
    const a = body(TD.toTikz(list));
    let res;
    try { res = TD.importLatex(a); } catch (e) { rows.push(`${n}: import threw ${e.message}`); continue; }
    const shapes = res.blocks.filter((x) => x.type === 'diagram').flatMap((x) => x.shapes);
    let b, c;
    try { b = body(TD.toTikz(shapes)); c = body(TD.toTikz(noTex(shapes))); } catch (e) { rows.push(`${n}: re-export threw ${e.message}`); continue; }
    if (a !== b) lost.push(n);
    const raw = shapes.filter((s) => s.type === 'tikz' && s.kind !== 'defs').length;
    const types = (L) => [...new Set(L.map((s) => s.type))].sort().join(',');
    let st;
    if (a === c) st = 'regenerated same';
    else {
      const A = a.split('\n'), B = c.split('\n'); let i = 0; while (i < A.length && A[i] === B[i]) i++;
      st = `regenerated differs from line ${i + 1} (${types(list)} → ${types(shapes)})`;
    }
    rows.push(`${n}: ${shapes.length - raw}/${shapes.length} modelled · ${st}`);
  }
  T.golden('roundtrip.txt', rows.join('\n') + '\n');
  T.eq(lost, [], 'figures not exported exactly as written');
});

// The Document export carries no data comment (one line of base64 could pass TeX's line limit and stop
// pdflatex), so it re-imports as well as any LaTeX does. Files exported before still restore exactly.
T.test('document LaTeX: no data comment, short lines; older files with one still restore exactly', () => {
  const blocks = [{ type: 'text', text: '# Title\nSome *text* with $x^2$.' }];
  for (const n of ['lines', 'shapes', 'text', 'labels', 'blk_qc', 'blk_cd', 'blk_forest', 'blk_chem', 'blk_xy', 'plot_function', 'prim3d_a'])
    blocks.push({ type: 'diagram', shapes: KIT[n]() });
  const tex = TD.docToLatex({ name: 'Round trip', page: {}, blocks });
  T.ok(!/diagramtex-data/.test(tex), 'no data comment');
  const long = tex.split('\n').reduce((a, l) => Math.max(a, l.length), 0);
  T.ok(long < 5000, `longest line ${long} characters`);
  T.eq(TD.importLatex(tex).blocks.filter((b) => b.type === 'diagram').length, blocks.length - 1, 'every picture comes back');
  // an older export: the data comment first inside each picture
  const want = blocks.filter((b) => b.type === 'diagram').map((b) => b.shapes.map(({ id, ...r }) => r));
  let k = 0;
  const old = tex.replace(/\\begin\{tikzpicture\}(\[[^\n]*\])?/g, (m) => `${m}\n  % diagramtex-data: ${btoa(unescape(encodeURIComponent(JSON.stringify(want[k++]))))}`);
  T.eq(k, want.length, 'one data comment per picture');
  const got = TD.importLatex(old).blocks.filter((b) => b.type === 'diagram').map((b) => b.shapes.map(({ id, ...r }) => r));
  T.eq(got, want);
});

T.test('document export: the title is the file name as typed, and pattern and shading declarations come along', () => {
  const tex = TD.docToLatex({ name: 'my_notes 50% & #1 {draft}', page: { title: true }, blocks: [{ type: 'diagram', shapes: KIT.pat_all() }] });
  T.ok(tex.includes('\\title{my\\_notes 50\\% \\& \\#1 \\{draft\\}}'), tex.split('\n').find((l) => l.startsWith('\\title')));
  T.ok(/\\pgfdeclarepattern\{name=tdbricks0/.test(tex), 'the bricks pattern is declared');
  T.tex('doc-title-patterns', tex);
});

T.test('document export: a title with < > " prints them, and one with an emoji still compiles', () => {
  const tex = TD.docToLatex({ name: 'a <b> "c" 🎉 © Ünïcode', page: { title: true, author: 'Ann <ann@x> 👍' }, blocks: [{ type: 'text', text: 'Body.' }] });
  const title = tex.split('\n').find((l) => l.startsWith('\\title'));
  T.eq(title, '\\title{a \\textless{}b\\textgreater{} {\\fontencoding{T1}\\selectfont\\char34}c{\\fontencoding{T1}\\selectfont\\char34}  © Ünïcode}');
  T.ok(tex.includes('\\author{Ann \\textless{}ann@x\\textgreater{} }'), tex.split('\n').find((l) => l.startsWith('\\author')));
  T.tex('doc-title-symbols', tex);
});

T.test('every parity figure draws on the canvas (the SVG and PNG export) without throwing', () => {
  const bad = [];
  for (const n of Object.keys(KIT)) {
    try { const svg = TD.app.shapesSvg(KIT[n]()); if (!/<svg/.test(svg)) bad.push(`${n}: no svg`); } catch (e) { bad.push(`${n}: ${e.message}`); }
  }
  T.eq(bad, []);
});
