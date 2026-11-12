// 2D plots: with axis lines=middle the y label sits on top of the axis, so the title goes above it (preview and
// export), and the colour bar starts 0.3cm right of the x label, like pgfplots' "right of north east".
const P = TD.TYPES.plot;
const plot = (o) => { const s = P.create({ x: 0, y: 0 }, null, 'plot:function'); Object.assign(s, { w: 280, h: 200, id: 'p1', title: '1234', colorbar: true }, o); P.fix(s); return s; };
const svgOf = (s) => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); g.innerHTML = P.svg(s, { export: true }); return g; };
const barX = (s) => +[...svgOf(s).querySelectorAll('rect')].find((r) => r.getAttribute('fill') === 'none' && +r.getAttribute('width') === 0.5 * TD.PX_PER_CM).getAttribute('x');

T.test('plot layout: the colour bar clears the middle x label; in a box it is 0.3cm from the axis', () => {
  const mid = plot({}), box = plot({ axisLines: 'box' });
  const xl = TD.textBox(mid.xlabel, { size: 'normalsize', font: 'default' }).w;
  T.ok(barX(mid) >= mid.x + mid.w + 4 + xl + 0.3 * TD.PX_PER_CM, `past the x label: ${barX(mid)}`);
  T.eq(barX(box), box.x + box.w + 0.3 * TD.PX_PER_CM, 'box axis');
  T.ok(P.samples(mid)[1].x >= barX(mid) + 0.5 * TD.PX_PER_CM, 'the bounds reach the bar');
});

T.test('plot layout: with middle axes the title goes above the y label, in the export too', () => {
  const s = plot({});
  const tex = TD.toTikz([s], { standalone: true });
  T.ok(/every axis y label\/\.style=\{[^\n]*name=ylabel\}/.test(tex), 'the y label is named');
  T.ok(tex.includes('title style={at={(ylabel.north -| current axis.north)}}') && tex.includes('every axis title shift=0pt'), 'the title is put over it');
  T.ok(!TD.toTikz([plot({ title: '' })], { standalone: true }).includes('name=ylabel'), 'no title: nothing added');
  T.ok(!TD.toTikz([plot({ axisLines: 'box' })], { standalone: true }).includes('name=ylabel'), 'box axes: nothing added');
  T.ok(P.samples(s)[0].y <= s.y - 40, 'the bounds reach the title');
  T.tex('plot-middle-title', tex);
});
