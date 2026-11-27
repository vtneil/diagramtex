// The main canvas's oblique grid (CANVAS_GRID_STYLES 'oblique' in src/ui/canvas-grid.ts): span{u1, u2} on two axes at
// any angle, drawn by the shared plane grid (src/ui/plane-grid.ts), its axes chosen in the view bar: a preset, or u1 and u2 typed in degrees.
{
  T.test('main canvas: the oblique grid (span{u1, u2}) draws its lines along the chosen axes and snaps to them', async () => {
    const keep = { style: TD.state.gridStyle, axes: TD.state.gridAxes, grid: TD.state.grid };
    TD.app.newDoc('oblique grid', [], null, null, null, 'board'); await new Promise((r) => setTimeout(r, 100));
    try {
      document.querySelector('#gridStyle [data-grid-style="oblique"]').click();
      T.eq(TD.state.gridStyle, 'oblique');
      T.ok(!document.querySelector('#gridAxesBox').hidden, 'the axes in the view bar');
      const lines = () => [...document.querySelectorAll('#gridPlane path')].flatMap((p) => [...p.getAttribute('d').matchAll(/M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Math.round(Math.atan2(-(m[4] - m[2]), m[3] - m[1]) * 180 / Math.PI)));
      const angles = (xs) => [...new Set(xs.map((a) => ((a % 180) + 180) % 180))].sort((a, b) => a - b);
      T.eq(angles(lines()), [0, 45], 'lines at 0° and 45°');
      T.ok(TD.app.cmd.setGridAxes(30, 150));
      T.eq(angles(lines()), [30, 150], 'at 30° and 150°');
      T.eq(document.querySelector('#gridAxes').value, '30,150', 'the preset shown');
      T.ok(!TD.app.cmd.setGridAxes(10, 190), 'two axes along one line: refused');
      const u1 = document.querySelector('#gridU1'), u2 = document.querySelector('#gridU2'), type = (f, v) => { f.value = v; f.dispatchEvent(new Event('change')); };
      T.eq([u1.value, u2.value], ['30°', '150°'], 'u1 and u2 shown');
      type(u2, '100'); T.eq(TD.state.gridAxes, [30, 100], 'u2 typed'); T.eq(angles(lines()), [30, 100], 'drawn at the typed angles');
      T.eq(document.querySelector('#gridAxes').value, 'custom', 'no preset: Custom');
      type(u1, '280'); T.eq(TD.state.gridAxes, [30, 100], 'along u2: refused'); T.eq(u1.value, '30°', 'and the field put back');
      const sel = document.querySelector('#gridAxes'); sel.value = '0,60'; sel.dispatchEvent(new Event('change'));
      T.eq(TD.state.gridAxes, [0, 60], 'a preset chosen'); T.eq([u1.value, u2.value], ['0°', '60°'], 'its angles shown');
      T.ok(document.querySelector('#gridRect').getAttribute('fill') === 'none', 'the square pattern off');
      document.querySelector('#gridStyle [data-grid-style="grid"]').click();
      T.eq(document.querySelectorAll('#gridPlane path').length, 0, 'another style: the oblique lines go');
      T.ok(document.querySelector('#gridAxesBox').hidden, 'and its axes');
    } finally { TD.state.gridAxes = keep.axes; document.querySelector(`#gridStyle [data-grid-style="${keep.style}"]`)?.click(); if (TD.state.grid !== keep.grid) document.querySelector(`#gridStyle [data-grid-style="${keep.style}"]`)?.click(); }
  });
}
