// Block editors redraw on every pointer move. A pan keeps the drawn elements (label pictures included) and
// only moves their group, and whatever the patch leaves on screen matches a drawing made from scratch.
T.test('block editors: a pan keeps the drawn label pictures, and patched drawings match a fresh one', async () => {
  const pic = (b) => `\\begin{tikzpicture}[->, >=Stealth, shorten >=1pt, initial text=]${b}\\end{tikzpicture}`;
  TD.fsmEditor.open({ src: pic(String.raw`\node[state, initial] (a) at (0,0) {$q_0$}; \node[state] (b) at (3,0) {$q_1$}; \path (a) edge node {$x^2$} (b);`) }, () => {});
  await TD.math.whenReady(); await new Promise((r) => setTimeout(r, 50));
  const root = document.querySelector('#fsmModal'), svg = root.querySelector('.fsm-svg');
  const capture = svg.setPointerCapture; svg.setPointerCapture = () => {};
  const R = svg.getBoundingClientRect();
  const ev = (type, x, y, button = 1, buttons = 4) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button, buttons, clientX: R.left + x, clientY: R.top + y }));
  try {
    const before = [...svg.querySelectorAll('image, text')], group = before[0] && before[0].closest('svg > g'), was = group && group.getAttribute('transform');
    T.ok(before.length >= 2 && group, 'the machine is drawn');
    ev('pointerdown', 20, R.height - 20); for (let i = 1; i <= 5; i++) ev('pointermove', 20 + i * 9, R.height - 20 - i * 7, -1); ev('pointerup', 65, R.height - 55, 1, 0);
    const after = [...svg.querySelectorAll('image, text')];
    T.eq(after.length, before.length, 'the same labels are drawn');
    T.ok(after.every((n, i) => n === before[i]), 'each label keeps its element');
    T.ok(group.isConnected && group.getAttribute('transform') !== was, 'the group moved');
    const patched = svg.innerHTML;
    svg.replaceChildren(); ev('pointerdown', 20, 20); ev('pointermove', 20, 20, -1); ev('pointerup', 20, 20, 1, 0);
    T.eq(svg.innerHTML, patched, 'a fresh drawing matches the patched one');
  } finally { svg.setPointerCapture = capture; root.querySelector(`[data-fe="done"]`).click(); }
});
