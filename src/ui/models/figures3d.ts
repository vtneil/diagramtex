import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/figures3d.ts';
const { T, KINDS, SPRE, SDEF, V3, RDEF } = panelServices;
import { row, input, section, select, errors, view, check, help } from '../forms';
import { SOLID_ICONS } from '../solid-icons';
// the Shape menu shows pictures (selectmenu.ts); 3D axes alone is no longer offered, but a solid that is one keeps it
TD.selectPics = { ...(TD.selectPics || {}), solid: SOLID_ICONS };
const shapeSelect = (k: string) => {
  const c = select('kind', KINDS.filter(([v]: string[]) => v !== 'axes' || k === 'axes'), k) as Extract<ReturnType<typeof select>, { attrs: unknown }>;
  return { ...c, attrs: { ...c.attrs, 'data-pics': 'solid' } };
};

TD.panels = TD.panels || {};
TD.panels.prim3d = {
    model(s) {
      const r = T.prim3d.run(s), k = s.kind || 'box';
      const colour = (index: any, value: any) => ({ kind: 'colour' as const, index, value, css: TD.css(value) });
      let dims = [];
      const sz = (label: any, ...keys: any[]) => row(label, ...keys.map((key) => input(key, s[key])));
      if (k === 'box') dims = [sz('Size (x, y, z)', 'a', 'b', 'c')];
      else if (k === 'cube') dims = [sz('Edge', 'a')];
      else if (k === 'sphere' || k === 'hemisphere') dims = [sz('Radius', 'a')];
      else if (k === 'ellipsoid') dims = [sz('Radii (x, y, z)', 'a', 'b', 'c')];
      else if (k === 'cap') dims = [sz('Sphere radius', 'a'), sz('Height', 'c')];
      else if (k === 'torus') dims = [sz('Radii (ring, tube)', 'a', 'r2')];
      else if (k === 'octa' || k === 'tetra') dims = [sz('Edge', 'a')];
      else if (k === 'axes') dims = [sz('Length', 'a')];
      else if (k === 'swedge') dims = [row('ρ from, to', input('r1', s.r1), input('r2', s.r2)), row('θ from, to (°)', input('t1', s.t1), input('t2', s.t2)), row('φ from, to (°)', input('p1', s.p1), input('p2', s.p2))];
      else {
        dims = [row(k === 'frustum' ? 'Radii (base, top)' : k === 'tube' ? 'Radii (outer, inner)' : k === 'prism' || k === 'pyramid' || k === 'hexprism' ? 'Radius (corner)' : 'Radius', input('a', s.a), ...(k === 'frustum' || k === 'tube' ? [input('r2', s.r2)] : [])), row('Height', input('c', s.c))];
        if (k === 'prism' || k === 'pyramid') dims.push(row('Sides', input('n', s.n)));
        if (k === 'prism' || k === 'pyramid' || k === 'hexprism') dims.push(row('Side lengths', input('sl', s.sl, { placeholder: 'all equal, or 1, 2, 1, …', title: 'One length per side, separated by commas; a blank or missing one takes the regular edge. The base is the polygon inscribed in a circle with those sides.' })));
      }
      const labels = k === 'box' ? [['la', 'Edge x'], ['lb', 'Edge y'], ['lc', 'Edge z']] : k === 'cube' || k === 'octa' ? [['la', 'Edge']] : k === 'sphere' || k === 'hemisphere' ? [['la', 'Radius']]
        : k === 'swedge' || k === 'axes' ? [] : k === 'ellipsoid' ? [['la', 'Radius x'], ['lb', 'Radius y'], ['lc', 'Radius z']] : k === 'cap' ? [['la', 'Base radius'], ['lc', 'Height']]
        : k === 'torus' ? [['la', 'Ring radius'], ['lb', 'Tube radius']] : k === 'tetra' ? [['la', 'Edge'], ['lc', 'Height']] : k === 'tube' ? [['la', 'Outer radius'], ['lb', 'Inner radius'], ['lc', 'Height']]
        : k === 'frustum' ? [['la', 'Base radius'], ['lb', 'Top radius'], ['lc', 'Height']] : k === 'prism' || k === 'pyramid' || k === 'hexprism' ? [['la', 'Base edge'], ['lc', 'Height']] : [['la', 'Radius'], ['lc', 'Height']];
      return { sections: [
        section('Solid', [row('Shape', shapeSelect(k)), ...dims, ...errors(r.error),
          row('Style', select('style', [['shaded', 'Shaded'], ['line', 'Line drawing']], s.style || 'shaded')),
          ...(s.style === 'line' ? [] : [row('Colour', colour(0, s.solidColor))])]),
        section('View', [view(s, [30, 20]), row('Hidden edges', check('hiddenEdges', s.hiddenEdges)), row('Axes', check('axes', !!s.axes)),
          ...(s.axes ? [row('Axis labels', input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : [])], 'sec'),
        section('Labels', [...labels.map(([key, label]) => row(label, input(key, s[key], { 'data-tx': 'text', placeholder: '(none)' }))), row('Top label', input('name', s.name, { 'data-tx': 'text', placeholder: '(none)' })), row('Bottom label', input('nameBelow', s.nameBelow, { 'data-tx': 'text', placeholder: '(none)' })),
          ...(k === 'sphere' ? [row('Meridian', check('lb', !!s.lb))] : []),
          help('Sizes can be expressions such as ', { code: 'sqrt(2)' }, '. Exported as plain TikZ.')], 'sec'),
      ] };
    },
    apply(s, t) {
      if (t.dataset.p === 'kind' && SPRE[t.value]) { // a new shape starts from its own sizes and labels
        const keep = { x: s.x, y: s.y, w: s.w, h: s.h, view: s.view, style: s.style, solidColor: s.solidColor };
        Object.assign(s, JSON.parse(JSON.stringify({ ...SDEF, ...SPRE[t.value] })), keep);
        return true;
      }
      if (t.dataset.p === 'lb' && t.type === 'checkbox') { s.lb = t.checked ? 'm' : ''; return false; }
      return V3.apply(['style', 'axes'])(s, t);
    },
    action() {},
    color: V3.colors(['solidColor'], SDEF),
  };

TD.panels.revolve = {
    model(s) {
      const r = T.revolve.run(s);
      const colour = (index: any, value: any) => ({ kind: 'colour' as const, index, value, css: TD.css(value) });
      return { sections: [
        section('Region', [row('Upper f(x)', input('f', s.f)), row('Lower g(x)', input('g', s.g, { placeholder: '0' })), row('x from, to', input('a', s.a), input('b', s.b)), ...errors(r.error),
          row('Turn about', select('axis', [['x', 'x-axis (disks, washers)'], ['y', 'y-axis (shells)']], s.axis || 'x')),
          row('Sweep (°)', input('sweep', s.sweep, { title: '360 for the whole solid; less to cut it open and show the region' })),
          row('Colour', colour(0, s.solidColor)), row('Cut colour', colour(1, s.regionColor))]),
        section('Slice', [row('Show a slice', check('showSlice', !!s.showSlice)),
          ...(s.showSlice ? [row('At x, width', input('x0', s.x0, { placeholder: 'middle' }), input('dx', s.dx, { placeholder: 'auto' })),
            row('Slice colour', colour(2, s.sliceColor)), row('Label', input('sliceLabel', s.sliceLabel, { 'data-tx': 'text', placeholder: '(none)' }))] : [])]),
        section('View', [view(s, [25, 18]), row('Hidden edges', check('hiddenEdges', s.hiddenEdges)), row('Axes', check('axes', s.axes)),
          ...(s.axes !== false ? [row('Third axis', check('zaxis', !!s.zaxis)), row('Axis labels', input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : []),
          row('Show y = f(x)', check('showCurve', !!s.showCurve)), row('Curve label', input('curveLabel', s.curveLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          help('Functions use ', { code: 'x' }, ', ', { code: 'pi' }, ', ', { code: '^' }, ', sin, cos, exp, sqrt… (radians). With a slice the solid is drawn as an outline. Exported as plain TikZ.')], 'sec'),
      ] };
    },
    apply: V3.apply(['axis', 'showSlice', 'axes']),
    action() {},
    color: V3.colors(['solidColor', 'regionColor', 'sliceColor'], RDEF),
  };
