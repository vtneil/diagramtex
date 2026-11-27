// Drags in the colour picker end cleanly when the system cancels the pointer (pointercancel), and the Gradient pane's
// window listeners go with it when the picker closes mid-drag (Esc), so they never reach the next picker opened.
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const open = (value, fills) => { const got = []; TD.openColorPicker(document.body, { value, fills, onInput: v => got.push(['in', v]), onChange: v => got.push(['ch', v]) }); return got; };
  const pointer = (type, target, x, y = 0) => target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 }));

  T.test('colour picker: a cancelled drag on the square ends where it last was, and no later move is heard', async () => {
    try {
      const got = open('#c62828'); await wait(300); // the popover has finished growing in: the square holds still
      const sv = document.querySelector('.popover.cp .cp-sv'), r = sv.getBoundingClientRect();
      sv.setPointerCapture = () => {}; // (a synthetic pointer cannot be captured)
      pointer('pointerdown', sv, r.left + r.width / 2, r.top + r.height / 2);
      pointer('pointermove', sv, r.left + r.width / 4, r.top + r.height / 4); await wait();
      const live = got.at(-1);
      T.eq(live[0], 'in', 'dragging gives live values');
      pointer('pointercancel', sv, 0, 0); await wait();
      T.eq(got.at(-1)[0], 'ch', 'a cancelled drag gives a final value');
      T.eq(got.at(-1)[1], live[1], 'the one it was at, not the cancel event\'s place ');
      const n = got.length;
      pointer('pointermove', sv, r.left + r.width, r.top); await wait();
      T.eq(got.length, n, 'a move after the cancel changes nothing');
    } finally { TD.closeColorPicker(); }
  });

  T.test('gradient pane: a cancelled stop drag ends it; closed mid-drag, its listeners never reach the next picker', async () => {
    try {
      let got = open('#c62828', true); await wait();
      document.querySelector('.cp-tabs [data-tab="grad"]').click(); await wait();
      let bar = document.querySelector('.popover.cp [data-pane="grad"] .fp-stops'), r = bar.getBoundingClientRect();
      pointer('pointerdown', bar.querySelector('.fp-bar'), r.left + r.width / 2); await wait();
      pointer('pointermove', window, r.left + r.width / 4); await wait();
      pointer('pointercancel', window, r.left + r.width / 4); await wait();
      T.eq(got.at(-1)[0], 'ch', 'a cancelled drag gives a final value');
      let n = got.length;
      pointer('pointermove', window, r.left + r.width * 0.9); await wait();
      T.eq(got.length, n, 'a move after the cancel changes nothing');
      // pressed again, then the picker closes (as Esc does) before the pointer is let go
      pointer('pointerdown', bar.querySelector('.fp-bar'), r.left + r.width * 0.75); await wait();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(200);
      got = open('#1565c0'); await wait();
      n = got.length;
      pointer('pointermove', window, r.left + r.width / 3); pointer('pointerup', window, r.left + r.width / 3); await wait();
      T.eq(got.length, n, 'the next picker hears nothing of the old drag');
    } finally { TD.closeColorPicker(); }
  });
}
