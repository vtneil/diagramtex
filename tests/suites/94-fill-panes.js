// The colour picker's Gradient and Pattern panes (ui/GradientPane.svelte, ui/PatternPane.svelte, helpers in
// domain/fills.ts): presets, the kind switch, fields, adding, dragging and removing stops, pattern tiles, and the
// values the caller hears.
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const open = (value) => { const got = []; TD.openColorPicker(document.body, { value, fills: true, onInput: v => got.push(['in', v]), onChange: v => got.push(['ch', v]) }); return got; };
  const pane = k => document.querySelector(`.popover.cp [data-pane="${k}"]`);
  const set = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const pointer = (type, target, x) => target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 0, bubbles: true, cancelable: true, pointerId: 1 }));

  T.test('gradient pane: presets, Linear | Radial, fields, and stops added, dragged, retyped and removed', async () => {
    try {
      const got = open('#c62828'); await wait();
      document.querySelector('.cp-tabs [data-tab="grad"]').click(); await wait();
      const g = () => pane('grad'), last = () => got.at(-1);
      T.ok(g(), 'the Gradient pane is shown');
      T.eq(last()[1].stops.at(-1)[1], '#c62828', 'it starts from the colour being picked');
      g().querySelectorAll('.fp-presets button')[8].click(); await wait();
      T.eq(last()[1].g, 'radial', 'a preset is taken whole');
      T.ok(!g().querySelector('[data-gf="angle"]'), 'a radial gradient has no rotation');
      g().querySelector('[data-gk="linear"]').click(); await wait();
      T.eq(last()[1].g, 'linear', 'Linear switches the kind');
      set(g().querySelector('[data-gf="angle"]'), '45'); await wait();
      T.eq(last()[1].angle, 45, 'rotation is set');
      set(g().querySelector('[data-gf="scale"]'), '1'); await wait();
      T.eq(last()[1].scale, 5, 'scale stops at 5%');
      set(g().querySelector('[data-sthex]'), '00f'); await wait();
      T.eq(last()[1].stops[0][1], '#0000ff', 'a short hex sets the chosen stop');
      const before = got.length;
      set(g().querySelector('[data-sthex]'), 'nope'); await wait();
      T.eq(got.length, before, 'a hex that is not one is ignored');
      // press the bar half way: a new stop, dragged to a quarter
      const bar = g().querySelector('.fp-stops'), r = bar.getBoundingClientRect();
      pointer('pointerdown', bar.querySelector('.fp-bar'), r.left + r.width / 2); await wait();
      T.eq(g().querySelectorAll('[data-st]').length, 3, 'pressing the bar adds a stop');
      pointer('pointermove', window, r.left + r.width / 4); await wait();
      T.eq(last()[0], 'in', 'dragging gives live values');
      pointer('pointerup', window, r.left + r.width / 4); await wait();
      T.eq(last()[0], 'ch', 'letting go gives the final one');
      T.eq(Math.round(last()[1].stops[1][0] * 100), 25, 'the stop sits where it was dropped');
      T.ok(g().querySelectorAll('[data-st]')[1].classList.contains('on'), 'and is the chosen one');
      set(g().querySelector('[data-stpos]'), '90'); await wait();
      T.eq(last()[1].stops[1][0], 0.9, 'its place can be typed');
      g().querySelector('.fp-sw button').click(); await wait();
      T.eq(last()[1].stops[1][1], TD.colorPresets()[0], 'a preset colour paints it');
      g().querySelector('[data-stdel]').click(); await wait();
      T.eq(last()[1].stops.length, 2, 'Remove takes it out');
      T.ok(g().querySelector('[data-stdel]').disabled, 'and is not offered with two stops left');
    } finally { TD.closeColorPicker(); }
  });

  T.test('pattern pane: tiles, size, line width or radius, colour; fill names follow the language', async () => {
    try {
      const got = open({ p: 'ne', size: 8, lw: 0.75, color: '#c62828' }); await wait();
      const p = () => pane('pat'), last = () => got.at(-1);
      T.ok(p(), 'a pattern opens on the Pattern pane');
      T.eq(p().querySelector('[aria-checked="true"]').dataset.pk, 'ne', 'its tile is chosen');
      p().querySelector('[data-pk="dots"]').click(); await wait();
      T.eq(last()[1].p, 'dots', 'a tile picks the pattern');
      T.ok(/Radius/.test(p().querySelector('.fp-fields').textContent), 'dots have a radius, not a line width');
      set(p().querySelector('[data-pf="size"]'), '1'); await wait();
      T.eq(last()[1].size, 2, 'size stops at 2px');
      set(p().querySelector('[data-phex]'), '4a7a1e'); await wait();
      T.eq(last()[1].color, '#4a7a1e', 'colour is typed as hex');
      T.eq(TD.fillLabel({ p: 'bricks' }), 'Bricks', 'a pattern is named');
      T.eq(TD.fillLabel({ g: 'radial' }), 'Radial gradient', 'a gradient is named');
    } finally { TD.closeColorPicker(); }
  });
}
