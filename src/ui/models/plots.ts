import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/plots.ts';
const { CMAPS, usesExprOnly, usesDataOnly, GRID_KINDS, evalSeries, withVars, KINDS3, KINDS2, MARKS, KIND_DEF, newSeries, SERIES_COLORS } = panelServices;
import type { FormRow } from '../forms';
import { row, section, errors, help, txAttrs } from '../forms';

TD.panels = TD.panels || {};
TD.panels.plot = {
    model(s) {
      const I = (key: any, value: any, attrs = {}, type = 'text') => ({ kind: 'input' as const, value: value ?? '', attrs: txAttrs({ type, 'data-p': key, ...attrs }) });
      const S = (key: any, options: any, value: any) => ({ kind: 'select' as const, value, options, attrs: { 'data-p': key } });
      const C = (key: any, checked: any) => ({ kind: 'input' as const, value: '', checked: !!checked, attrs: { type: 'checkbox', 'data-p': key } });
      const is3 = s.dim === 3;
      const axis = [row('Title', I('title', s.title, { 'data-tx': 'text' })), row('x label', I('xlabel', s.xlabel, { 'data-tx': 'text' })), row('y label', I('ylabel', s.ylabel, { 'data-tx': 'text' }))];
      if (is3) axis.push(row('z label', I('zlabel', s.zlabel, { 'data-tx': 'text' })));
      axis.push(row('x range', I('xmin', s.xmin, { placeholder: 'auto' }), I('xmax', s.xmax, { placeholder: 'auto' })), row('y range', I('ymin', s.ymin, { placeholder: 'auto' }), I('ymax', s.ymax, { placeholder: 'auto' })));
      if (is3) axis.push(row('z range', I('zmin', s.zmin, { placeholder: 'auto' }), I('zmax', s.zmax, { placeholder: 'auto' })), row('View (az, el)', I('view0', s.view?.[0] ?? 25, { step: '5' }, 'number'), I('view1', s.view?.[1] ?? 30, { step: '5' }, 'number')));
      else axis.push(row('Axis lines', S('axisLines', [['box', 'Box'], ['left', 'Left (arrows)'], ['middle', 'Middle (through 0)']], s.axisLines)));
      axis.push(row('Grid', C('grid', s.grid)), row('Variables', I('vars', s.vars || '', { placeholder: 'a = 2, b = 0.5', spellcheck: 'false', title: 'Constants you can use in every function and domain' })),
        row('Colormap', S('colormap', Object.keys(CMAPS).map(k => [k, k]), s.colormap)), row('Color bar', C('colorbar', s.colorbar)),
        row('Legend', S('legendPos', [['north east', 'Top right'], ['north west', 'Top left'], ['south east', 'Bottom right'], ['south west', 'Bottom left'], ['outer north east', 'Outside right'], ['none', 'Hidden']], s.legendPos)));
      const sections = [section('Axis', axis, 'sec')];
      s.series.forEach((ser: any, i: any) => {
        const inp = (key: any, value: any, attrs = {}, type = 'text') => ({ kind: 'input' as const, value: value ?? '', attrs: txAttrs({ type, 'data-i': i, 'data-sk': key, ...attrs }) });
        const sel = (key: any, options: any, value: any) => ({ kind: 'select' as const, value, options, attrs: { 'data-i': i, 'data-sk': key } });
        const exprOnly = usesExprOnly(ser.kind), dataOnly = usesDataOnly(ser.kind), useExpr = exprOnly || (!dataOnly && ser.source !== 'data');
        const grid = GRID_KINDS.includes(ser.kind), result = evalSeries(withVars(ser, s.vars));
        const rows: FormRow[] = [row('Type', sel('kind', is3 ? KINDS3 : KINDS2, ser.kind))];
        if (!exprOnly && !dataOnly) rows.push(row('Source', sel('source', [['expr', 'Function'], ['data', 'Data table']], ser.source)));
        const labels = ({
          ineq: ['f(x)', null, 'x domain'], between: ['f(x) (lower)', 'g(x) (upper)', 'x domain'], xofy: ['x = f(y)', null, 'y domain'],
          param: ['x(t)', 'y(t)', 't range'], polar: ['r(θ)  (use t)', null, 'θ range'], implicit: ['F(x, y) = 0', null, 'x domain', 1],
          field: ['dx = P(x, y)', 'dy = Q(x, y)', 'x domain', 1], phase: ["x' = P(x, y)", "y' = Q(x, y)", 'x domain', 1],
          param3d: ['x(u, v)', 'y(u, v)', 'u range', 'v range', 'z(u, v)'], curve3d: ['x(t)', 'y(t)', 't range', 0, 'z(t)'],
        } as Record<string, any>)[ser.kind];
        if (labels) {
          if (ser.kind === 'ineq') rows.push(row('Relation', sel('rel', [['<', 'y < f(x)'], ['<=', 'y ≤ f(x)'], ['>', 'y > f(x)'], ['>=', 'y ≥ f(x)']], ser.rel || '<')));
          rows.push(row(labels[0], inp('expr', ser.expr, { spellcheck: 'false' })));
          if (labels[1]) rows.push(row(labels[1], inp('expr2', ser.expr2 || '', { spellcheck: 'false' })));
          if (labels[4]) rows.push(row(labels[4], inp('expr3', ser.expr3 || '', { spellcheck: 'false' })));
          rows.push(row(labels[2], inp('domain0', ser.domain[0]), inp('domain1', ser.domain[1])));
          if (labels[3]) rows.push(row(typeof labels[3] === 'string' ? labels[3] : 'y domain', inp('ydomain0', ser.ydomain[0]), inp('ydomain1', ser.ydomain[1])));
          rows.push(row(ser.kind === 'field' || ser.kind === 'phase' ? 'Grid (per side)' : 'Samples', inp('samples', ser.samples, { min: '2' }, 'number')));
          if (ser.kind === 'ineq' || ser.kind === 'between') rows.push(row('Fill opacity', inp('fillOpacity', ser.fillOpacity ?? 0.25, { min: '0', max: '1', step: '0.05' }, 'number')));
        } else if (ser.kind === 'vectors') {
          rows.push({ kind: 'column' as const, label: ['One vector per line: ', { code: 'x y' }, ' (from the origin) or ', { code: 'x y u v' }, ' (from x, y)'], value: ser.data, attrs: { 'data-i': i, 'data-sk': 'data', spellcheck: 'false' } });
        } else if (useExpr) {
          rows.push(row(grid ? 'z = f(x, y)' : 'y = f(x)', inp('expr', ser.expr, { spellcheck: 'false' })), row('x domain', inp('domain0', ser.domain[0]), inp('domain1', ser.domain[1])));
          if (grid) rows.push(row('y domain', inp('ydomain0', ser.ydomain[0]), inp('ydomain1', ser.ydomain[1])));
          rows.push(row('Samples', inp('samples', ser.samples, { min: '2' }, 'number')));
        } else rows.push({ kind: 'column' as const, label: [`Data (${ser.kind === 'scatter3d' ? 'x y z' : 'x y'} per line)`], value: ser.data, attrs: { 'data-i': i, 'data-sk': 'data', spellcheck: 'false' } });
        rows.push(...errors(result.error));
        if (ser.kind === 'contour') rows.push(row('Levels', inp('levels', ser.levels, { min: '1' }, 'number')));
        if (!['heatmap', 'contour', 'surface', 'param3d'].includes(ser.kind) || ser.kind === 'contour') {
          if (!['contour', 'surface', 'heatmap', 'mesh'].includes(ser.kind)) rows.push(row('Color', { kind: 'colour' as const, index: i, value: ser.color || 'none', css: ser.color ? TD.css(ser.color) : 'transparent' }));
          rows.push(row('Line width', inp('width', ser.width, { min: '0.25', step: '0.25' }, 'number')));
        }
        if (['line', 'area', 'ineq', 'between', 'xofy', 'param', 'polar', 'implicit', 'phase', 'curve3d'].includes(ser.kind)) rows.push(row('Dash', sel('dash', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], ser.dash)));
        if (['line', 'scatter', 'scatter3d'].includes(ser.kind)) rows.push(row('Marker', sel('mark', MARKS, ser.mark)));
        if (ser.kind === 'bar') rows.push(row('Bar width', inp('barWidth', ser.barWidth, { min: '1' }, 'number'), { kind: 'text' as const, text: 'px', class: 'val' }));
        rows.push(row('Legend', inp('legend', ser.legend, { 'data-tx': 'text', placeholder: '(none)' })));
        sections.push({ ...section(`Series ${i + 1}`, rows), remove: { action: 'rmser', index: i, title: 'Remove series' } });
      });
      sections.push({ class: 'sec', rows: [{ kind: 'button' as const, class: 'wide', action: 'addser', label: '+ Add series' },
        help('Functions use ', { code: 'x' }, ...(is3 ? [', ', { code: 'y' }] : [' (', { code: 't' }, ' for parametric / polar, ', { code: 'y' }, ' for x = f(y) and fields)']),
          ', your variables, ', { code: 'pi' }, ', ', { code: 'e' }, ', ', { code: '^' }, ', sin, cos, tan, exp, ln, sqrt, abs… Trig is in radians.')] });
      return { sections };
    },
    // returns true when the panel should be re-rendered
    apply(s, t) {
      if (t.dataset.p) {
        const k = t.dataset.p;
        if (k === 'view0' || k === 'view1') { s.view = [...(s.view || [25, 30])]; s.view[+k.slice(-1)] = parseFloat(t.value) || 0; return false; }
        s[k] = t.type === 'checkbox' ? t.checked : t.value;
        return false;
      }
      if (t.dataset.sk) {
        const ser = s.series[+t.dataset.i], k = t.dataset.sk;
        if (k.startsWith('domain') || k.startsWith('ydomain')) { const base = k.slice(0, -1); ser[base] = [...ser[base]]; ser[base][+k.slice(-1)] = t.value; return false; }
        if (['samples', 'width', 'levels', 'barWidth'].includes(k)) { const v = parseFloat(t.value); if (isFinite(v) && v > 0) ser[k] = v; return false; }
        if (k === 'fillOpacity') { const v = parseFloat(t.value); if (isFinite(v)) ser[k] = Math.max(0, Math.min(1, v)); return false; }
        if (k === 'kind' && KIND_DEF[t.value] && ser.kind !== t.value) Object.assign(ser, JSON.parse(JSON.stringify(KIND_DEF[t.value])));
        ser[k] = t.value;
        return k === 'kind' || k === 'source';
      }
      return false;
    },
    action(s, act, i) {
      if (act === 'addser') {
        const is3 = s.dim === 3, n = s.series.length;
        s.series.push(newSeries(is3 ? { kind: 'surface' as const, expr: 'x*y/4', domain: ['-2', '2'], ydomain: ['-2', '2'], samples: 15, color: SERIES_COLORS[n % 7] }
          : { expr: 'x', domain: [...(s.series[0]?.domain || ['-5', '5'])], color: SERIES_COLORS[n % 7] }));
      }
      if (act === 'rmser') s.series.splice(i, 1);
    },
    color(s: any, i: any) { return { get: () => s.series[i].color, set: (v: any) => { s.series[i].color = v || '#000000'; }, nullable: false }; },
  };

TD.panels.pie = {
    model(s) {
      return { sections: [section('Pie data', [
        { kind: 'column' as const, label: ['One slice per line: ', { code: 'label value [#color]' }], value: s.data, attrs: { 'data-p': 'data', spellcheck: 'false' } },
        row('Show %', { kind: 'input' as const, value: '', checked: !!s.showPercent, attrs: { type: 'checkbox', 'data-p': 'showPercent' } }),
        row('Labels', { kind: 'select' as const, value: s.labelPos, options: [['outside', 'Outside'], ['inside', 'Inside']], attrs: { 'data-p': 'labelPos' } }),
        row('Start angle', { kind: 'input' as const, value: s.startAngle, attrs: { type: 'number', 'data-p': 'startAngle', step: '15' } }, { kind: 'text' as const, text: '°', class: 'val' }),
      ], 'sec')] };
    },
    apply(s, t) {
      const k = t.dataset.p;
      if (!k) return false;
      s[k] = t.type === 'checkbox' ? t.checked : k === 'startAngle' ? parseFloat(t.value) || 0 : t.value;
      return false;
    },
  };
