// Named styles: a file's styles (page.styles), linked shapes that keep the values and their overrides, and the export
// that defines each style once with \tikzset and names it on each shape.
{
  const rect = (id, x, extra = {}) => ({ id, type: 'rect', x, y: 0, w: 40, h: 20, stroke: '#1f4e9c', width: 2, dash: 'solid', fill: '#dbe7f7', ...extra });
  const line = (id, y) => ({ id, type: 'line', x1: 0, y1: y, x2: 80, y2: y, stroke: '#1f4e9c', width: 2, dash: 'solid', startTip: 'none', endTip: 'none' });
  const cleanup = (id) => { TD.app.cmd.docAction?.('del', id); };
  const tikz = () => TD.toTikz(TD.state.doc.shapes);
  const NS = () => TD.state.doc.page.styles || [];
  const block = () => NS().find((s) => s.name === 'block');
  // make "block" from the first object, the way New Style from Selection… does (without the name prompt)
  function makeBlock(ids) {
    TD.app.begin();
    const st = { id: 'st1', name: 'block', keys: {} };
    const first = TD.state.doc.shapes.find((s) => s.id === ids[0]);
    for (const k of ['stroke', 'width', 'dash', 'fill', 'opacity', 'startTip', 'endTip', 'size', 'font', 'bold', 'italic', 'color']) if (first[k] !== undefined) st.keys[k] = JSON.parse(JSON.stringify(first[k]));
    TD.state.doc.page.styles = [st];
    for (const s of TD.state.doc.shapes) if (ids.includes(s.id)) { s.style = 'st1'; delete s.so; }
    TD.app.commit();
    return st;
  }

  T.test('named styles: the export defines the style once and names it on each linked object', () => {
    const id = TD.app.newDoc('named export', [rect('a', 0), rect('b', 60), rect('c', 120)], null, null);
    makeBlock(['a', 'b', 'c']);
    const code = tikz();
    T.eq((code.match(/\\tikzset\{block\/\.style=\{/g) || []).length, 1, 'one definition:\n' + code);
    T.eq((code.match(/\\draw\[block\]/g) || []).length, 3, 'each rectangle names it and nothing else:\n' + code);
    T.ok(/\\tikzset\{block\/\.style=\{draw=tdc\d, line width=[\d.]+pt, fill=tdc\d\}\}/.test(code), 'the definition holds the outline and fill:\n' + code);
    T.tex('named-styles-basic', TD.toTikz(TD.state.doc.shapes, { standalone: true }));
    cleanup(id);
  });

  T.test('named styles: an override is written after the name; a value the style sets and the object lacks is set back', () => {
    const id = TD.app.newDoc('named override', [rect('a', 0), rect('b', 60)], null, null);
    makeBlock(['a', 'b']);
    // b: a red outline (an override), then also dashed style on the style with b solid
    TD.app.begin(); TD.state.doc.shapes[1].stroke = '#cc0000'; TD.app.commit();
    T.eq(TD.state.doc.shapes[1].so, ['stroke'], 'marked as an override');
    let code = tikz();
    T.ok(/\\draw\[block, draw=tdc\d\]/.test(code), 'the different colour after the name:\n' + code);
    // the style becomes dashed; b keeps solid as an override, a follows
    TD.app.begin();
    TD.state.doc.shapes[1].so = ['stroke', 'dash'];
    TD.state.doc.page.styles = [{ ...block(), keys: { ...block().keys, dash: 'dashed' } }];
    TD.app.namedSync(); TD.app.commit();
    T.eq(TD.state.doc.shapes.map((q) => q.dash), ['dashed', 'solid']);
    code = tikz();
    T.ok(/\\tikzset\{block\/\.style=\{[^}]*dashed/.test(code), 'the style is dashed:\n' + code);
    T.ok(/\\draw\[block\] \(/.test(code), 'a names only the style:\n' + code);
    T.ok(/\\draw\[block, draw=tdc\d, solid\]/.test(code), 'b sets its colour and solid back:\n' + code);
    T.tex('named-styles-override', TD.toTikz(TD.state.doc.shapes, { standalone: true }));
    cleanup(id);
  });

  T.test('named styles: linking, overrides, update from an object, reset, detach and delete, with undo', async () => {
    const id = TD.app.newDoc('named ops', [rect('a', 0), rect('b', 60), line('l', 60)], null, null);
    const C = TD.app.cmd, S = (k) => TD.state.doc.shapes.find((s) => s.id === k);
    makeBlock(['a', 'b']);
    // an edit away from the style is an override; setting it back is not
    TD.app.begin(); S('b').width = 4; TD.app.commit();
    T.eq(S('b').so, ['width']);
    TD.app.begin(); S('b').width = 2; TD.app.commit();
    T.ok(!S('b').so, 'back to the style: no override');
    // the style changes: every linked object follows, an override stays
    TD.app.begin(); S('b').stroke = '#00aa00'; TD.app.commit();
    TD.app.begin(); TD.state.doc.page.styles = [{ ...block(), keys: { ...block().keys, width: 3, stroke: '#333333' } }]; TD.app.namedSync(); TD.app.commit();
    T.eq([S('a').width, S('a').stroke], [3, '#333333'], 'a follows');
    T.eq([S('b').width, S('b').stroke], [3, '#00aa00'], 'b follows the width, keeps its own stroke');
    // undo brings the old style back, and the objects with it
    C.undo();
    T.eq(block().keys.width, 2); T.eq(S('a').width, 2, 'a is back'); T.eq(S('b').width, 2);
    C.redo();
    T.eq(S('a').width, 3);
    // a line takes a style's outline but not its fill (it has none)
    TD.app.begin(); S('l').style = 'st1'; TD.app.namedSync(); TD.app.commit();
    T.eq(S('l').stroke, '#333333'); T.eq(S('l').fill, undefined, 'no fill on a line');
    // deleting the style unlinks every object, which keeps how it looks
    TD.app.begin(); TD.state.doc.page.styles = []; TD.app.namedSync(); TD.app.commit();
    T.ok(!S('a').style && !S('b').style && !S('l').style, 'unlinked'); T.eq(S('a').width, 3, 'kept its look');
    C.undo();
    T.eq(S('a').style, 'st1', 'undo links them again');
    cleanup(id);
  });

  T.test('named styles: other diagrams of the file follow the style, and undo brings them back', () => {
    const id = TD.app.newDoc('named blocks', [rect('a', 0)], null, null);
    const doc = TD.state.doc;
    doc.blocks.push({ type: 'diagram', shapes: [rect('z', 0, { style: 'st1' })] });
    makeBlock(['a']);
    TD.app.begin(); TD.state.doc.page.styles = [{ ...block(), keys: { ...block().keys, width: 5 } }]; TD.app.namedSync(); TD.app.commit();
    T.eq(doc.blocks[1].shapes[0].width, 5, 'the other diagram follows');
    TD.app.cmd.undo();
    T.eq(doc.blocks[1].shapes[0].width, 2, 'and goes back with undo');
    cleanup(id);
  });

  T.test('named styles: a file keeps its styles through save and open; a pasted object whose style is missing is unlinked', () => {
    const id = TD.app.newDoc('named file', [rect('a', 0)], null, null);
    makeBlock(['a']);
    TD.app.saveNow();
    const text = TD.app.projectJson(TD.state.doc);
    T.ok(JSON.parse(text).page.styles[0].name === 'block', 'saved in the file');
    TD.app.cmd.openDoc(id);
    T.eq(block()?.name, 'block'); T.eq(TD.state.doc.shapes[0].style, 'st1');
    TD.app.begin(); TD.state.doc.shapes.push(rect('p', 80, { style: 'gone' })); TD.app.namedSync(); TD.app.commit();
    T.ok(!TD.state.doc.shapes.find((s) => s.id === 'p').style, 'unlinked');
    cleanup(id);
  });

  T.test('named styles: names must be TikZ-safe, not TikZ keys, and unique', () => {
    const P = TD.app.styleNameProblem;
    T.eq(P('block', []), null); T.eq(P('signal line', []), null); T.eq(P('my-box2', []), null);
    T.eq(P('', []), 'empty'); T.eq(P('2box', []), 'chars'); T.eq(P('a,b', []), 'chars'); T.eq(P('a=b', []), 'chars'); T.eq(P('a/b', []), 'chars');
    T.eq(P('thick', []), 'reserved'); T.eq(P('Red', []), 'reserved'); T.eq(P('Block', ['block']), 'taken');
  });
}
