T.test('Construction: native node labels, pins, anchored edges and scopes compile and round trip', () => {
  const a={...T.make('rect'),id:'native-a',x:0,y:0,w:80,h:40,nodeName:'inputNode',nodeLabel:'Input $x$',nodeLabelPosition:'above',nodePin:'Control $u$',nodePinPosition:'right',nodePinDistance:24};
  const b={...T.make('ellipse'),id:'native-b',cx:240,cy:20,rx:40,ry:20,nodeName:'outputNode'};
  const edge={...T.make('line'),id:'native-edge',x1:80,y1:20,x2:200,y2:20,label:'$f(x)$',link1:{id:a.id,u:1,v:.5},link2:{id:b.id,u:0,v:.5}};
  const code=TD.toTikz([edge,a,b],{standalone:true});
  T.ok(code.includes('(inputNode.east)') && code.includes('(outputNode.west)'), 'edge endpoints name node anchors');
  T.ok(code.indexOf('(outputNode)')<code.indexOf('(outputNode.west)'), 'forward references resolved');
  T.ok(code.includes('label=') && code.includes('pin='),'native annotations');
  T.tex('native construction nodes',code);
  const imported=TD.importLatex(code).blocks.filter(b=>b.type==='diagram').flatMap(b=>b.shapes);
  T.ok(imported.some(s=>s.type==='rect' && s.nodeName==='inputNode' && s.nodeLabel==='Input $x$' && s.nodePin==='Control $u$'),'node remains editable after import');
  T.ok(imported.some(s=>s.type==='line' && s.link1 && s.link2),'imported anchors retain model links');
  T.tex('native construction imported',TD.toTikz(imported,{standalone:true}));
  const [eu,ev]=TD.nodeFeatures.anchorUV('north east','ellipse');
  T.ok(Math.abs((eu-.5)**2+(ev-.5)**2-.25)<1e-8,'diagonal ellipse anchor lies on its outline');
  T.eq(TD.nodeFeatures.anchorName(eu,ev,'ellipse'),'north east','ellipse anchor name round trips');
  const diagonal={...edge,link2:{id:b.id,u:eu,v:ev},x2:b.cx+(eu-.5)*2*b.rx,y2:b.cy+(ev-.5)*2*b.ry};
  const diagonalCode=TD.toTikz([a,b,diagonal],{standalone:true});
  T.ok(diagonalCode.includes('(outputNode.north east)'),'diagonal ellipse uses its native anchor');
  const diagonalShapes=TD.importLatex(diagonalCode).blocks.filter(b=>b.type==='diagram').flatMap(b=>b.shapes);
  const diagonalEdge=diagonalShapes.find(s=>s.type==='line');
  T.ok(Math.abs(diagonalEdge.link2.u-eu)<1e-8,'import keeps ellipse outline attachment');
  const grouped=[{...a,g:'group',scopeGroup:true},{...b,g:'group',scopeGroup:true}];
  const scoped=TD.toTikz(grouped,{standalone:true});T.ok(scoped.includes('\\begin{scope}'),'groups emit actual scopes');T.tex('native construction scopes',scoped);
  const rotated=TD.toTikz([{...a,angle:30}],{standalone:true});
  T.ok(rotated.includes('minimum width=2cm') && rotated.includes('minimum height=1cm'),'native node dimensions remain in its own frame');T.tex('native construction rotated',rotated);
});
T.test('Construction: guide metadata round trips for every file kind without entering drawing exports', () => {
  for(const kind of ['classic','page','board']) {
    const guide={id:'guide',axis:'x',position:-17.5};
    const doc={kind,name:'Guide fixture',page:{},blocks:[{type:'diagram',shapes:[],guides:[guide]}],sheet:{pages:1,shapes:[],guides:[guide]}};
    const result=TD.app.parseProject(TD.app.projectJson(doc));
    T.eq((kind==='page'?result.sheet:result.blocks[0]).guides,[guide],kind+' preserves exact guide coordinates');
  }
  const region={type:'region',id:'hole',rings:[[[0,0],[100,0],[100,100],[0,100]],[[25,25],[75,25],[75,75],[25,75]]]};
  T.ok(TD.containsClosedShape(region,{x:10,y:10}),'bucket can hit a filled region');
  T.ok(!TD.containsClosedShape(region,{x:50,y:50}),'bucket respects holes');
  T.ok(!TD.containsClosedShape(T.make('line'),{x:0,y:0}),'bucket ignores open paths');
});
