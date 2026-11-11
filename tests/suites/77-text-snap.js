// A text box snaps to the grid by the point its alignment names: Align left + Vertical top → its top-left
// corner, right + bottom → its bottom-right corner, centre + middle → its centre.
const A = (s) => TD.TYPES.text.anchors(s)[0];
const near = (a, b) => Math.abs(a - b) < 1e-6;

T.test('text snap: the first anchor follows H.align and V.align', () => {
  const s = { type: 'text', x: 100, y: 50, text: 'Hello world', tw: 0, size: 'normalsize', font: 'default' };
  const S = TD.TYPES.text.samples(s), [l, t, r, b] = [S[0].x, S[0].y, S[1].x, S[1].y];
  let a = A({ ...s, align: 'left', valign: 'top' });
  T.ok(near(a.x, l) && near(a.y, t), 'left + top → top-left: ' + JSON.stringify(a));
  a = A({ ...s, align: 'right', valign: 'bottom' });
  T.ok(near(a.x, r) && near(a.y, b), 'right + bottom → bottom-right');
  a = A({ ...s, align: 'center', valign: 'middle' });
  T.ok(near(a.x, 100) && near(a.y, 50), 'centre + middle → centre');
  T.ok(TD.TYPES.text.anchors({ ...s, align: 'left', valign: 'top' }).some((p) => near(p.x, 100) && near(p.y, 50)), 'the centre is still an anchor');
});

T.test('text snap: a paragraph box uses its frame corner', () => {
  const s = { type: 'text', x: 100, y: 50, text: 'Hi', tw: 80, th: 40, align: 'right', valign: 'top', size: 'normalsize', font: 'default' };
  const a = A(s);
  T.ok(near(a.x, 140) && near(a.y, 30), 'right + top → frame top-right: ' + JSON.stringify(a));
});

T.test('text wrap handle: on the left for right-aligned text, which keeps its right edge', () => {
  const o = { type: 'text', x: 100, y: 50, text: 'Hello wide world', tw: 0, align: 'right', valign: 'top', size: 'normalsize', font: 'default' };
  const S = TD.TYPES.text.samples(o), right = S[1].x, h = TD.TYPES.text.handles(o).find((x) => x.k === 'tw');
  T.ok(h && h.x < 100, 'handle on the left edge: ' + JSON.stringify(h));
  const s = JSON.parse(JSON.stringify(o));
  TD.TYPES.text.setHandle(s, 'tw', { x: right - 60, y: 50 }, {}, o);
  T.ok(near(s.tw, 60) && near(s.x + s.tw / 2, right), 'width 60, right edge held: ' + [s.tw, s.x + s.tw / 2, right]);
  const l = { ...o, align: 'left' };
  T.ok(TD.TYPES.text.handles(l).find((x) => x.k === 'tw').x > 100, 'left-aligned text keeps it on the right');
});
