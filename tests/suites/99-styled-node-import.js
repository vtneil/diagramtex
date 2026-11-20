const styledNodeSource = () => T.fixtures['import/styled-node-chain.tex'];
T.test('styled node import: shapes, labels, layout and relative Bezier controls', () => {
  const r=TD.importLatex(styledNodeSource()), sh=r.blocks[0].shapes;
  T.eq(sh.map(s=>s.type), ['rect','ellipse','rect','ellipse','line','line','curve']);
  T.eq(r.kept.length,0);
  const [main,upper,right,lower,l1,l2,curve]=sh;
  T.eq(sh.slice(0,4).map(s=>s.nodeText),['2','1','3','4']);
  T.eq(main.stroke,'#ff6666'); T.eq(upper.stroke,'#66ff66');
  T.ok(upper.cy<main.y && lower.cy>main.y+main.h && right.x>main.x+main.w,'relative layout');
  T.ok(Math.abs(l1.y1-l1.y2+TD.PX_PER_CM)<.01,'1cm border separation above');
  T.ok(Math.abs(l2.x2-l2.x1-TD.PX_PER_CM)<.01,'1cm border separation right');
  T.ok(Math.abs(curve.cy1-curve.y1-.7*TD.PX_PER_CM)<.01,'first relative control is based on start');
  T.ok(Math.abs(curve.cx2-curve.x2-.7*TD.PX_PER_CM)<.01 && Math.abs(curve.cy2-curve.y2)<.01,'second relative control is based on end');
  const svg=TD.app.shapesSvg(sh);
  T.ok(svg.includes('<rect') && svg.includes('<ellipse'),'borders rendered');
  for(const node of sh.slice(0,4)) T.ok(TD.TYPES[node.type].svg(node,{export:true}).includes(node.nodeText),'node content rendered');
  const out=TD.toTikz(sh,{standalone:true});
  for(const n of ['maintopic','uppercircle','rightsquare','lowercircle']) T.ok(out.includes('('+n+')'),'node name exported');
  T.tex('styled node import',out);
});

for(const [kind,mode] of [['classic','document'],['classic','diagram'],['board','board'],['page','page']]) T.test(`styled node import: Insert paints nodes and arrows in ${mode}`,async()=>{
  TD.app.newDoc('Styled node regression',null,null,null,null,kind);
  if(kind==='classic') TD.app.setMode(mode);
  TD.app.openImport(styledNodeSource());
  document.querySelector('#impHow [data-how="code"]').click();
  document.querySelector('#impInsert').click();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const sh=TD.app.state.doc.shapes;
  T.eq(sh.map(s=>s.type),['rect','ellipse','rect','ellipse','line','line','curve']);
  for(const edge of sh.slice(4)) for(const key of ['link1','link2']) T.ok(sh.some(s=>s.id===edge[key]?.id),'anchor attachment survives insertion');
  const root=mode==='document'?document.querySelector('#docview .blk-diag.active .blk-body > svg'):document.querySelector('#content');
  T.ok(root.querySelectorAll('rect[fill="#fff2f2"]').length===2,'two filled rectangles');
  T.ok(root.querySelectorAll('ellipse[fill="#f2fff2"]').length===2,'two filled circles');
  T.ok(root.querySelectorAll('path').length>=3,'arrows painted');
});

T.test('styled node import: body text survives saving and remains editable in the inspector',()=>{
  const sh=JSON.parse(JSON.stringify(TD.importLatex(styledNodeSource()).blocks[0].shapes));
  TD.app.newDoc('Node text edit',sh,null,null,null,'board');
  const node=TD.app.state.doc.shapes[0];
  TD.app.state.sel=new Set([node.id]); TD.app.renderProps();
  const input=document.querySelector('[data-native="nodeText"]');
  T.ok(input,'node body text control'); T.eq(input.value,'2');
  input.value='Central'; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
  T.eq(node.nodeText,'Central');
  const out=TD.toTikz(TD.app.state.doc.shapes,{standalone:true});
  T.ok(out.includes('{Central}'),'edited node body exported');
  T.tex('styled node edited body',out);
});

T.test('styled node import: every node/.style holds only the statements kept as written, not text added later', () => {
  const sh = TD.importLatex(String.raw`\begin{tikzpicture}[every node/.style={draw}, >=Stealth]
  \node (a) at (0,0) {A};
  \node (b) at (3,0) {B};
  \draw[->] (a) -- node[above, draw=none] {yes} (b);
\end{tikzpicture}`).blocks[0].shapes;
  const added = TD.TYPES.text.create({ x: 40, y: 200 }, TD.state.defaults);
  added.text = 'hello';
  for (const [name, shapes] of [['kept', sh], ['moved', sh.map((s) => { const c = structuredClone(s); TD.translate(c, 80, 40); return c; })]]) {
    const out = TD.toTikz([...shapes, added], { standalone: true });
    T.ok(out.includes('\\begin{tikzpicture}[x=1cm, y=1cm, >=Stealth]'), `${name}: the picture keeps >=Stealth but not every node: ${out}`);
    // the scopes open round each line
    const depth = (re) => { let d = 0; for (const l of out.split('\n')) { if (re.test(l)) return d; if (/\\begin\{scope\}/.test(l)) d++; if (/\\end\{scope\}/.test(l)) d--; } return -1; };
    T.ok(out.includes('\\begin{scope}[every node/.style={draw}]'), `${name}: the statements kept as written are in a scope with it`);
    T.ok(depth(/draw=none\] \{yes\}/) > 0, `${name}: the edge kept as written is inside it`);
    T.eq(depth(/\{hello\};/), 0, `${name}: the new text is outside it, unboxed as on the canvas`);
    T.tex('every node scoped ' + name, out);
  }
});

T.test('rectangle import: a node at midway, inside the operation, or with pos sits that far from corner to corner (as TikZ)', () => {
  const P = TD.PX_PER_CM, at = (s) => [+((s.x + (s.w || 0) / 2) / P).toFixed(2), +(-(s.y + (s.h || 0) / 2) / P).toFixed(2)];
  const r = TD.importLatex(String.raw`\begin{tikzpicture}
\draw[red] (0,0) rectangle (2,1) node[midway] {Hi};
\draw (6,0) rectangle node {Box} (8,1);
\draw (0,3) rectangle node[pos=0.25] {Q} (4,7);
\draw (0,8) rectangle (2,9) node {Corner};
\end{tikzpicture}`);
  T.eq(r.kept.length, 0);
  const text = Object.fromEntries(r.blocks[0].shapes.filter((s) => s.type === 'text').map((s) => [s.text, at(s)]));
  T.eq(text, { Hi: [1, 0.5], Box: [7, 0.5], Q: [1, 4], Corner: [2, 9] });
  // converted to shapes (not kept as written): the node is written where it was placed
  const out = TD.toTikz(r.blocks[0].shapes.map((s) => { const c = { ...s }; delete c.tex; return c; }), { standalone: true });
  T.ok(/\\node[^;]* at \(1, ?0\.5\) \{Hi\}/.test(out), 'converted, "Hi" is written at the centre');
  T.tex('rectangle node import', out);
});
