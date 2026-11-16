const diskSource=()=>T.fixtures['import/stacked-disks.tex'];
T.test('native pic import: stacked disks become native paths and ellipses',()=>{
  const r=TD.importLatex(diskSource()), sh=r.blocks[0].shapes;
  T.eq(r.kept.length,0); T.eq(r.warnings,[]);
  T.eq(sh.length,220); T.ok(sh.every(s=>s.type==='ellipse'||s.type==='poly'),'only native geometry');
  T.eq(sh.filter(s=>s.type==='ellipse').length,22);
  T.eq(sh.filter(s=>s.fill?.g==='linear').length,9,'three native gradients per disk');
  T.ok(sh.some(s=>typeof s.fill==='string'&&s.fill==='#00000005'),'fractional highlight opacity');
  T.ok(sh.some(s=>typeof s.fill==='string'&&s.fill==='#00000004'),'fractional shadow opacity');
  const upper=sh.filter(s=>s.type==='ellipse'&&s.fill==='#ffffff');
  T.eq(upper.map(s=>s.cy),[0,-50,-100],'three pic placements');
  const svg=TD.app.shapesSvg(sh);
  T.ok(svg.includes('linearGradient'),'native SVG gradients');
  T.ok(!svg.includes('rawtikz'),'no code preview blocks');
  const out=TD.toTikz(sh,{standalone:true});
  T.ok(out.includes('pics/.cd')&&out.includes('pic {disc bottom}'),'original reusable source preserved until edited');
  T.tex('native disks source',out);
});

T.test('native pic import: editing a primitive exports the modified geometry',()=>{
  const sh=JSON.parse(JSON.stringify(TD.importLatex(diskSource()).blocks[0].shapes));
  sh.find(s=>s.type==='ellipse'&&s.fill==='#ffffff').rx+=10;
  const out=TD.toTikz(sh,{standalone:true}), body=out.slice(out.indexOf('\\begin{tikzpicture}'));
  T.ok(!body.includes('pic {disc bottom}'),'edited source is regenerated from native objects');
  T.ok(body.includes('ellipse'),'native geometry written');
  T.tex('native disks edited geometry',out);
  const shapes=TD.importLatex(diskSource(),{editable:true}).blocks[0].shapes;
  T.eq(shapes.length,220); T.ok(shapes.every(s=>s.type!=='tikz'),'editable mode also contains native geometry');
});

T.test('native pic import: standalone pics, transforms and nested definitions',()=>{
  const src=String.raw`\tikzset{pics/tick/.style={code={\fill (0,0) rectangle (1,1);}},pics/pair/.style={code={\path (0,0) pic {tick} (2,0) pic {tick};}}}
\begin{tikzpicture}\pic[shift={(1,2)}] {pair};\end{tikzpicture}`;
  const r=TD.importLatex(src),sh=r.blocks[0].shapes;
  T.eq(r.kept.length,0); T.eq(sh.map(s=>s.type),['rect','rect']);
  T.eq(sh.map(s=>[s.x,s.y]),[[40,-120],[120,-120]],'pic origin and transform compose once');
});

T.test('native pic import: recursive and unresolved pics terminate without invented geometry',()=>{
  for(const src of [String.raw`\tikzset{pics/a/.style={code={\path pic {a};}}}\begin{tikzpicture}\path pic {a};\end{tikzpicture}`,String.raw`\begin{tikzpicture}\path pic {missing};\end{tikzpicture}`]){
    const r=TD.importLatex(src);
    T.ok(r.kept.length>0&&r.warnings.length>0,'unsupported expansion reported');
  }
});

T.test('native pic import: evaluated loop variables are local and preserve macro names',()=>{
  const r=TD.importLatex(String.raw`\begin{tikzpicture}
\def\s{9}
\foreach \i[evaluate={\s=\i/2;}] in {0,2,4} \fill (\s,0) circle (1pt);
\fill (\s,0) circle (1pt);
\end{tikzpicture}`);
  const sh=r.blocks[0].shapes.filter(s=>s.type==='dot');
  T.eq(sh.map(s=>s.cx),[0,40,80,360],'evaluated macro does not leak out of the loop');
});

T.test('native pic import: Insert mounts editable disk primitives',async()=>{
  TD.app.newDoc('Native disk regression',null,null,null,null,'board');
  TD.app.openImport(diskSource());
  document.querySelector('#impHow [data-how="code"]').click();
  document.querySelector('#impInsert').click();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const sh=TD.app.state.doc.shapes;
  T.eq(sh.length,220); T.ok(sh.every(s=>s.type!=='tikz'));
  T.eq(document.querySelectorAll('#content > [data-id]').length,220,'native objects mounted for editing');
  T.eq(document.querySelectorAll('#content .rawtikz').length,0);
});
