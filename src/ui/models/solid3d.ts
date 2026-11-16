import { captions } from '../../i18n/messages';
import { runtime as TD } from '../../runtime';
import { message as msg } from '../../i18n';
import { T, AXES, defLabel, V3, DEFAULT } from '../../domain/solid3d.ts';
import { section, row, select, input, errors, check, view, help, captioned } from '../forms';

TD.panels = TD.panels || {};
TD.panels.solid = {
    model(s) {
      const r = T.solid.run(s), A = AXES[s.axis] || AXES.z, [p, q] = A.vars;
      const colour = (index: any, value: any) => ({ kind: 'colour' as const, index, value, css: TD.css(value) });
      return { sections: [
        section(msg('sol3.baseRegion', 'Base region D'), [
          row(msg('sol3.along', 'Solid along'), select('axis', [['z', msg('sol3.alongZ', 'z, over D in the xy-plane')], ['x', msg('sol3.alongX', 'x, over D in the yz-plane')], ['y', msg('sol3.alongY', 'y, over D in the xz-plane')]], s.axis || 'z')),
          row(captions["ui.shape"], select('base', [['ellipse', msg('sol3.ellipse', 'Ellipse or disk')], ['rect', msg('sol3.rect', 'Rectangle')], ['polar', msg('sol3.polar', 'Polar curve r(θ)')], ['sector', msg('sol3.sector', 'Polar rectangle (wedge)')]], s.base)),
          row(msg('sol3.centre', 'Centre ({p}, {q})', { p, q }), input('cx', s.cx), input('cy', s.cy)),
          ...(s.base === 'sector' ? [row(msg('sol3.rRange', 'r from, to'), input('r1', s.r1), input('r2', s.r2)), row(msg('f3.thetaRange', 'θ from, to (°)'), input('t1', s.t1), input('t2', s.t2))]
            : [row(s.base === 'polar' ? msg('sol3.stretch', 'Stretch') : s.base === 'rect' ? msg('sol3.halfSizes', 'Half sizes') : msg('sol3.radii', 'Radii'), input('a', s.a), input('b', s.b))]),
          ...(s.base === 'polar' ? [row('r(θ)', captioned(input('r', s.r, { title: 'Use t for θ, in radians' }), { title: msg('sol3.r.title', 'Use t for θ, in radians') }))] : []),
        ]),
        section(msg('sol3.solidE', 'Solid E'), [row(msg('sol3.top', 'Top u₂({p}, {q})', { p, q }), input('u2', s.u2)), row(msg('sol3.bottom', 'Bottom u₁({p}, {q})', { p, q }), input('u1', s.u1)), ...errors(r.error),
          row(msg('sol3.riemann', 'Riemann columns'), check('columns', !!s.columns)),
          ...(s.columns ? [row(msg('sol3.columns', 'Columns'), captioned(input('nx', s.nx, { title: 'Along the first variable' }), { title: msg('sol3.nx.title', 'Along the first variable') }), captioned(input('ny', s.ny, { title: 'Along the second variable' }), { title: msg('sol3.ny.title', 'Along the second variable') }))] : []),
          row(msg('sol3.solidColour', 'Solid colour'), colour(0, s.solidColor)), row(msg('sol3.baseColour', 'Base colour'), colour(1, s.baseColor))]),
        section(captions["ui.view"], [view(s), row(msg('f3.axes', 'Axes'), check('axes', s.axes)),
          ...(s.axes !== false ? [row(msg('f3.axisLabels', 'Axis labels'), input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : []),
          row(msg('sol3.showD', 'Show D'), check('showBase', s.showBase)), row(msg('sol3.dropLines', 'Drop lines'), check('dropLines', s.dropLines)), row(msg('f3.hiddenEdges', 'Hidden edges'), check('hiddenEdges', s.hiddenEdges))], 'sec'),
        section(captions["ui.labels"], [row(captions["ui.solid"], input('solidLabel', s.solidLabel, { 'data-tx': 'text', placeholder: '(none)' })), row(msg('sol3.base', 'Base'), input('baseLabel', s.baseLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          row(msg('sol3.topCallout', 'Top callout'), input('topLabel', s.topLabel, { 'data-tx': 'text', placeholder: '(none)' })), row(msg('sol3.bottomCallout', 'Bottom callout'), input('bottomLabel', s.bottomLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          help(msg('sol3.help.surfaces', 'Surfaces use '), { code: p }, ', ', { code: q }, ', ', { code: 'pi' }, ', ', { code: '^' }, msg('sol3.help.funcs', ', sin, cos, exp, sqrt… (radians). r(θ) uses '), { code: 't' }, msg('f3.help.plain', '. Exported as plain TikZ.'))], 'sec'),
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
