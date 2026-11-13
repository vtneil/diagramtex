// Untrusted documents (share links, opened and pasted files) must not put markup into the page.
const PAYLOAD = '1"/><img src=x onerror="window.__pwn=1">';
T.test('security: CSP allows only the preflight script by hash, not inline script', () => {
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  const script = /script-src ([^;]*)/.exec(csp)[1];
  T.ok(!script.includes("'unsafe-inline'"), script);
  T.ok(/'sha256-[A-Za-z0-9+/=]+'/.test(script), script);
});
T.test('security: a loaded shape gets numbers for numeric fields and no markup in colours', () => {
  const p = TD.app.parseProject(JSON.stringify({ app: 'diagramtex', version: 3, kind: 'board', name: 'x', blocks: [{ type: 'diagram', shapes: [
    { id: 'a', type: 'line', x1: 0, y1: '5', x2: 100, y2: 0, stroke: '#000000"><b>', width: PAYLOAD },
    { id: 'b', type: 'rect', x: PAYLOAD, y: 0, w: 40, h: 30, stroke: '#000000', width: 2, opacity: null }] }],
    page: { mt: PAYLOAD } }));
  TD.app.newDoc(p.name, null, null, p.blocks, p.page, p.kind);
  const [a, b] = TD.state.doc.shapes;
  T.eq(typeof a.width, 'number'); T.eq(a.y1, 5); T.ok(!/[<>"]/.test(a.stroke || ''));
  T.eq(typeof b.x, 'number'); T.eq(b.width, 2); T.eq(typeof b.opacity, 'number');
  T.eq(typeof TD.state.doc.page.mt, 'number');
  T.ok(!document.body.innerHTML.includes('__pwn'), 'payload never reached the page');
});
