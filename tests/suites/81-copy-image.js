// Right-click › Copy as Image / Save as Image: the selection as PNG or SVG, to the clipboard or a file.
const ctxClick = (arg) => {
  const ctx = document.querySelector('#ctxMenu'), b = document.createElement('button');
  b.dataset.ctx = arg; ctx.appendChild(b); b.click(); b.remove();
};
const until = async (f) => { for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };
const blobText = (b) => new Response(b).text();

T.test('copy image: the context menu offers Copy as Image and Save as Image, PNG and SVG', () => {
  TD.app.newDoc('Copy image', null, null, null, null, 'board');
  const s = T.make('rect'); TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render();
  const el = document.querySelector(`[data-id="${s.id}"]`), r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  const menu = document.querySelector('#ctxMenu');
  for (const a of ['copy-png', 'copy-svg', 'save-png', 'save-svg']) T.ok(menu.querySelector(`[data-ctx="img:${a}"]`), a);
  T.ok(/Copy as Image/.test(menu.textContent) && /Save as Image/.test(menu.textContent), 'labels');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

T.test('copy image: copies and saves the selection only', async () => {
  TD.app.newDoc('Copy image', null, null, null, null, 'board');
  const a = T.make('rect'), b = T.make('ellipse', { x: 300, y: 300 });
  TD.state.doc.shapes.push(a, b); TD.state.sel = new Set([a.id]); TD.app.render();
  const clip = navigator.clipboard.write, url = URL.createObjectURL, anchorClick = HTMLAnchorElement.prototype.click;
  const writes = [], saved = [];
  try {
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: async (items) => { writes.push(items); } });
    URL.createObjectURL = (blob) => { saved.push(blob); return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () { saved[saved.length - 1].fileName = this.download; };

    ctxClick('img:copy-svg'); await until(() => writes.length);
    const svg = await blobText(await writes[0][0].getType('text/plain'));
    T.ok(svg.startsWith('<svg') || svg.includes('<svg'), 'SVG text on the clipboard');
    T.ok(!/<circle|<ellipse/.test(svg), 'only the selected shape');

    ctxClick('img:copy-png'); await until(() => writes.length > 1);
    const png = await writes[1][0].getType('image/png');
    T.eq(png.type, 'image/png'); T.ok(png.size > 100, 'PNG has content');

    ctxClick('img:save-svg'); await until(() => saved.length);
    T.ok(/-selection\.svg$/.test(saved[0].fileName), 'SVG file name ' + saved[0].fileName);
    T.ok((await blobText(saved[0])).includes('<svg'), 'SVG file');

    ctxClick('img:save-png'); await until(() => saved.length > 1);
    T.ok(/-selection\.png$/.test(saved[1].fileName), 'PNG file name');
    T.eq(saved[1].type, 'image/png');

    TD.state.sel = new Set(); const n = writes.length;
    ctxClick('img:copy-png'); await new Promise((r) => setTimeout(r, 50));
    T.eq(writes.length, n, 'nothing selected, nothing copied');
  } finally {
    delete navigator.clipboard.write; if (navigator.clipboard.write !== clip) Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: clip });
    URL.createObjectURL = url; HTMLAnchorElement.prototype.click = anchorClick;
  }
});
