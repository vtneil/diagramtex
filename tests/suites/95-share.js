// Share links: the file deflated into the link; numbers to 6 significant digits so off-grid coordinates compress.
T.test('share link: off-grid coordinates are shortened, typed values kept, and the link reads back', async () => {
  TD.app.newDoc('Share me', null, null, null, null, 'board');
  const id = TD.state.docId, D = TD.state.defaults;
  TD.app.begin();
  for (let i = 0; i < 20; i++) TD.state.doc.shapes.push({ ...TD.TYPES.rect.create({ x: 0, y: 0 }, D), id: 'r' + i, x: 10 + i * 31.41592653589793, y: 219.28932188134524 + i / 7, w: 100 / 3, h: 141.4213562373095 });
  TD.state.doc.shapes.push({ ...TD.TYPES.ellipse.create({ x: 0, y: 0 }, D), id: 'e', cx: 50, cy: 60, rx: 20, ry: 10, opacity: 0.125, width: 0.0005 });
  TD.app.commit();
  const clip = navigator.clipboard.writeText;
  let url = '';
  navigator.clipboard.writeText = async (t) => { url = t; };
  try { await TD.app.cmd.shareLink(id); } finally { navigator.clipboard.writeText = clip; }
  const m = /#share=1\.([\w-]+)$/.exec(url);
  T.ok(m, 'a compressed link: ' + url.slice(0, 80));
  const b = Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
  const shapes = JSON.parse(text).blocks[0].shapes, r = shapes.find((s) => s.id === 'r3'), e = shapes.find((s) => s.id === 'e');
  T.eq(r.x, 104.248, 'six digits'); T.eq(r.y, 219.718); T.eq(r.h, 141.421); T.eq(r.w, 33.3333);
  T.eq(e.opacity, 0.125, 'a typed value as it was'); T.eq(e.width, 0.0005); T.eq(e.cx, 50);
  T.ok(!/\d\.\d{7}/.test(text), 'no long decimals left');
  // shorter than the same file with every digit
  const full = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(JSON.stringify({ ...JSON.parse(text), blocks: [{ type: 'diagram', shapes: TD.state.doc.shapes }] }))]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  T.ok(m[1].length < full.length * 4 / 3 * 0.8, `at least a fifth shorter: ${m[1].length} vs ${Math.round(full.length * 4 / 3)}`);
});
