// Copy and paste inside a block editor stay in the editor: the canvas behind it gets nothing.
T.test('block editor: ⌘C / ⌘V in an open editor leave the canvas alone', async () => {
  TD.app.newDoc(); TD.app.setMode('diagram');
  const s = T.make('rect'); TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]); TD.app.render();
  const key = (k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
  key('c'); // copies the rectangle on the canvas
  TD.graphEditor.open({ src: TD.GRAPH_DEFAULT }, () => {});
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const svg = document.querySelector('#graphModal .cz-svg') || document.body;
    for (let i = 0; i < 3; i++) {
      key('c'); key('v');
      const dt = new DataTransfer(); dt.setData('text/plain', '');
      svg.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    await new Promise((r) => setTimeout(r, 200));
    T.eq(TD.state.doc.shapes.length, 1, 'no shapes pasted onto the canvas');
  } finally { TD.graphEditor.close(); }
});
