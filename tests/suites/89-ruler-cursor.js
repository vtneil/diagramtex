// A pointer move over the canvas moves the rulers' pointer mark and leaves their ticks alone.
T.test('rulers: a pointer move moves only the pointer mark', async () => {
  TD.app.newDoc('Ruler cursor', [], null, null, null, 'classic'); TD.app.setMode('diagram'); TD.app.render();
  const rx = document.querySelector('#rulerX svg'), svg = document.querySelector('#canvas');
  T.ok(rx && svg, 'the ruler and canvas are there');
  const ticks = rx.querySelector('.tk'), r = svg.getBoundingClientRect();
  const move = (x) => svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + x, clientY: r.top + 120, pointerId: 1 }));
  move(200); const a = rx.querySelector('.cur').getAttribute('d');
  move(260); const b = rx.querySelector('.cur').getAttribute('d');
  T.ok(a && b && a !== b, 'the mark follows the pointer');
  T.ok(rx.querySelector('.tk') === ticks, 'the ticks are not redrawn');
  svg.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
  T.eq(rx.querySelector('.cur').getAttribute('d'), '', 'leaving the canvas hides the mark');
});
