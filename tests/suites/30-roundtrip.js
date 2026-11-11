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

// The app's own LaTeX (Document export with data comments) is lossless.
T.test('round trip: document LaTeX with data comments is exact', () => {
  const blocks = [{ type: 'text', text: '# Title\nSome *text* with $x^2$.' }];
  for (const n of ['lines', 'shapes', 'text', 'labels', 'blk_qc', 'blk_cd', 'blk_forest', 'blk_chem', 'blk_xy', 'plot_function', 'prim3d_a'])
    blocks.push({ type: 'diagram', shapes: KIT[n]() });
  const tex = TD.docToLatex({ name: 'Round trip', page: {}, blocks });
  const got = TD.importLatex(tex).blocks.filter((b) => b.type === 'diagram').map((b) => b.shapes.map(({ id, ...r }) => r));
  T.eq(got, blocks.filter((b) => b.type === 'diagram').map((b) => b.shapes.map(({ id, ...r }) => r)));
});
