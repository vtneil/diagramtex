import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/solid3d.ts';
const { T, AXES, defLabel, V3, DEFAULT } = panelServices;
import { section, row, select, input, errors, check, view, help } from '../forms';

TD.panels = TD.panels || {};
TD.panels.solid = {
    model(s) {
      const r = T.solid.run(s), A = AXES[s.axis] || AXES.z, [p, q] = A.vars;
      const colour = (index: any, value: any) => ({ kind: 'colour' as const, index, value, css: TD.css(value) });
      return { sections: [
        section('Base region D', [
          row('Solid along', select('axis', [['z', 'z, over D in the xy-plane'], ['x', 'x, over D in the yz-plane'], ['y', 'y, over D in the xz-plane']], s.axis || 'z')),
          row('Shape', select('base', [['ellipse', 'Ellipse or disk'], ['rect', 'Rectangle'], ['polar', 'Polar curve r(θ)'], ['sector', 'Polar rectangle (wedge)']], s.base)),
          row(`Centre (${p}, ${q})`, input('cx', s.cx), input('cy', s.cy)),
          ...(s.base === 'sector' ? [row('r from, to', input('r1', s.r1), input('r2', s.r2)), row('θ from, to (°)', input('t1', s.t1), input('t2', s.t2))]
            : [row(s.base === 'polar' ? 'Stretch' : s.base === 'rect' ? 'Half sizes' : 'Radii', input('a', s.a), input('b', s.b))]),
          ...(s.base === 'polar' ? [row('r(θ)', input('r', s.r, { title: 'Use t for θ, in radians' }))] : []),
        ]),
        section('Solid E', [row(`Top u₂(${p}, ${q})`, input('u2', s.u2)), row(`Bottom u₁(${p}, ${q})`, input('u1', s.u1)), ...errors(r.error),
          row('Riemann columns', check('columns', !!s.columns)),
          ...(s.columns ? [row('Columns', input('nx', s.nx, { title: 'Along the first variable' }), input('ny', s.ny, { title: 'Along the second variable' }))] : []),
          row('Solid colour', colour(0, s.solidColor)), row('Base colour', colour(1, s.baseColor))]),
        section('View', [view(s), row('Axes', check('axes', s.axes)),
          ...(s.axes !== false ? [row('Axis labels', input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : []),
          row('Show D', check('showBase', s.showBase)), row('Drop lines', check('dropLines', s.dropLines)), row('Hidden edges', check('hiddenEdges', s.hiddenEdges))], 'sec'),
        section('Labels', [row('Solid', input('solidLabel', s.solidLabel, { 'data-tx': 'text', placeholder: '(none)' })), row('Base', input('baseLabel', s.baseLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          row('Top callout', input('topLabel', s.topLabel, { 'data-tx': 'text', placeholder: '(none)' })), row('Bottom callout', input('bottomLabel', s.bottomLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          help('Surfaces use ', { code: p }, ', ', { code: q }, ', ', { code: 'pi' }, ', ', { code: '^' }, ', sin, cos, exp, sqrt… (radians). r(θ) uses ', { code: 't' }, '. Exported as plain TikZ.')], 'sec'),
      ] };
    },
    apply(s, t) {
      if (t.dataset.p === 'axis') {
        const old = s.axis || 'z', nw = t.value;
        if (s.topLabel === defLabel(old, 2)) s.topLabel = defLabel(nw, 2);
        if (s.bottomLabel === defLabel(old, 1)) s.bottomLabel = defLabel(nw, 1);
      }
      return V3.apply(['base', 'axes', 'axis', 'columns'])(s, t);
    },
    action() {},
    color: V3.colors(['solidColor', 'baseColor'], DEFAULT),
  };
