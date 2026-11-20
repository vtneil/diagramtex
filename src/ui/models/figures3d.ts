import { captions } from '../../i18n/messages';
import { runtime as TD } from '../../runtime';
import { message as msg, type Message } from '../../i18n';
import { T, KINDS, SPRE, SDEF, V3, RDEF } from '../../domain/figures3d.ts';
import { row, input, section, select, errors, view, check, help, captioned } from '../forms';
import { SOLID_ICONS } from '../solid-icons';
// the Shape menu shows pictures (the kit Select's `pictures`); 3D axes alone is no longer offered, but a solid that is
// one keeps it
const shapeSelect = (k: string) => {
  const c = select('kind', KINDS.filter(([v]: string[]) => v !== 'axes' || k === 'axes'), k) as Extract<ReturnType<typeof select>, { attrs: unknown }>;
  return { ...c, pictures: SOLID_ICONS };
};

TD.panels = TD.panels || {};
TD.panels.prim3d = {
    model(s) {
      const r = T.prim3d.run(s), k = s.kind || 'box';
      const colour = (index: any, value: any) => ({ kind: 'colour' as const, index, value, css: TD.css(value) });
      let dims = [];
      const sz = (label: any, ...keys: any[]) => row(label, ...keys.map((key) => input(key, s[key])));
      if (k === 'box') dims = [sz(msg('f3.sizeXYZ', 'Size (x, y, z)'), 'a', 'b', 'c')];
      else if (k === 'cube') dims = [sz(msg('f3.edge', 'Edge'), 'a')];
      else if (k === 'sphere' || k === 'hemisphere') dims = [sz(msg('f3.radius', 'Radius'), 'a')];
      else if (k === 'ellipsoid') dims = [sz(msg('f3.radiiXYZ', 'Radii (x, y, z)'), 'a', 'b', 'c')];
      else if (k === 'cap') dims = [sz(msg('f3.sphereRadius', 'Sphere radius'), 'a'), sz(msg('ui.height', 'Height'), 'c')];
      else if (k === 'torus') dims = [sz(msg('f3.radiiRing', 'Radii (ring, tube)'), 'a', 'r2')];
      else if (k === 'octa' || k === 'tetra') dims = [sz(msg('f3.edge', 'Edge'), 'a')];
      else if (k === 'axes') dims = [sz(msg('f3.length', 'Length'), 'a')];
      else if (k === 'swedge') dims = [row(msg('f3.rhoRange', 'ρ from, to'), input('r1', s.r1), input('r2', s.r2)), row(msg('f3.thetaRange', 'θ from, to (°)'), input('t1', s.t1), input('t2', s.t2)), row(msg('f3.phiRange', 'φ from, to (°)'), input('p1', s.p1), input('p2', s.p2))];
      else {
        dims = [row(k === 'frustum' ? msg('f3.radiiBase', 'Radii (base, top)') : k === 'tube' ? msg('f3.radiiOuter', 'Radii (outer, inner)') : k === 'prism' || k === 'pyramid' || k === 'hexprism' ? msg('f3.radiusCorner', 'Radius (corner)') : msg('f3.radius', 'Radius'), input('a', s.a), ...(k === 'frustum' || k === 'tube' ? [input('r2', s.r2)] : [])), row(captions["ui.height"], input('c', s.c))];
        if (k === 'prism' || k === 'pyramid') dims.push(row(msg('f3.sides', 'Sides'), input('n', s.n)));
        if (k === 'prism' || k === 'pyramid' || k === 'hexprism') dims.push(row(msg('f3.sideLengths', 'Side lengths'), captioned(input('sl', s.sl, { placeholder: 'all equal, or 1, 2, 1, …', title: 'One length per side, separated by commas; a blank or missing one takes the regular edge. The base is the polygon inscribed in a circle with those sides.' }), { placeholder: msg('f3.sl.ph', 'all equal, or 1, 2, 1, …'), title: msg('f3.sl.title', 'One length per side, separated by commas; a blank or missing one takes the regular edge. The base is the polygon inscribed in a circle with those sides.') })));
      }
      const labels = k === 'box' ? [['la', msg('f3.edgeX', 'Edge x')], ['lb', msg('f3.edgeY', 'Edge y')], ['lc', msg('f3.edgeZ', 'Edge z')]] : k === 'cube' || k === 'octa' ? [['la', msg('f3.edge', 'Edge')]] : k === 'sphere' || k === 'hemisphere' ? [['la', msg('f3.radius', 'Radius')]]
        : k === 'swedge' || k === 'axes' ? [] : k === 'ellipsoid' ? [['la', msg('f3.radiusX', 'Radius x')], ['lb', msg('f3.radiusY', 'Radius y')], ['lc', msg('f3.radiusZ', 'Radius z')]] : k === 'cap' ? [['la', msg('f3.baseRadius', 'Base radius')], ['lc', msg('ui.height', 'Height')]]
        : k === 'torus' ? [['la', msg('f3.ringRadius', 'Ring radius')], ['lb', msg('f3.tubeRadius', 'Tube radius')]] : k === 'tetra' ? [['la', msg('f3.edge', 'Edge')], ['lc', msg('ui.height', 'Height')]] : k === 'tube' ? [['la', msg('f3.outerRadius', 'Outer radius')], ['lb', msg('f3.innerRadius', 'Inner radius')], ['lc', msg('ui.height', 'Height')]]
        : k === 'frustum' ? [['la', msg('f3.baseRadius', 'Base radius')], ['lb', msg('f3.topRadius', 'Top radius')], ['lc', msg('ui.height', 'Height')]] : k === 'prism' || k === 'pyramid' || k === 'hexprism' ? [['la', msg('f3.baseEdge', 'Base edge')], ['lc', msg('ui.height', 'Height')]] : [['la', msg('f3.radius', 'Radius')], ['lc', msg('ui.height', 'Height')]];
      return { sections: [
        section(captions["ui.solid"], [row(captions["ui.shape"], shapeSelect(k)), ...dims, ...errors(r.error),
          row(captions["ui.style"], select('style', [['shaded', msg('f3.shaded', 'Shaded')], ['line', msg('f3.lineDrawing', 'Line drawing')]], s.style || 'shaded')),
          ...(s.style === 'line' ? [] : [row(captions["ui.colour"], colour(0, s.solidColor))])]),
        section(captions["ui.view"], [view(s, [30, 20]), row(msg('f3.hiddenEdges', 'Hidden edges'), check('hiddenEdges', s.hiddenEdges)), row(msg('f3.axes', 'Axes'), check('axes', !!s.axes)),
          ...(s.axes ? [row(msg('f3.axisLabels', 'Axis labels'), input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : [])], 'sec'),
        section(captions["ui.labels"], [...(labels as [string, Message][]).map(([key, label]) => row(label, input(key, s[key], { 'data-tx': 'text', placeholder: '(none)' }))), row(msg('f3.topLabel', 'Top label'), input('name', s.name, { 'data-tx': 'text', placeholder: '(none)' })), row(msg('f3.bottomLabel', 'Bottom label'), input('nameBelow', s.nameBelow, { 'data-tx': 'text', placeholder: '(none)' })),
          ...(k === 'sphere' ? [row(msg('f3.meridian', 'Meridian'), check('lb', !!s.lb))] : []),
          help(msg('f3.help.sizes', 'Sizes can be expressions such as '), { code: 'sqrt(2)' }, msg('f3.help.plain', '. Exported as plain TikZ.'))], 'sec'),
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
        section(msg('f3.region', 'Region'), [row(msg('f3.upper', 'Upper f(x)'), input('f', s.f)), row(msg('f3.lowerG', 'Lower g(x)'), input('g', s.g, { placeholder: '0' })), row(msg('f3.xRange', 'x from, to'), input('a', s.a), input('b', s.b)),
          row(msg('f3.turnAbout', 'Turn about'), select('axis', [['x', msg('f3.xAxisDisks', 'x-axis (disks, washers)')], ['y', msg('f3.yAxisShells', 'y-axis (shells)')]], s.axis || 'x')),
          row(msg('f3.sweep', 'Sweep (°)'), captioned(input('sweep', s.sweep, { title: '360 for the whole solid; less to cut it open and show the region' }), { title: msg('f3.sweep.title', '360 for the whole solid; less to cut it open and show the region') })),
          ...errors(r.error),
          row(captions["ui.colour"], colour(0, s.solidColor)), row(msg('f3.cutColour', 'Cut colour'), colour(1, s.regionColor))]),
        section(msg('f3.slice', 'Slice'), [row(msg('f3.showSlice', 'Show a slice'), check('showSlice', !!s.showSlice)),
          ...(s.showSlice ? [row(msg('f3.atXWidth', 'At x, width'), captioned(input('x0', s.x0, { placeholder: 'middle' }), { placeholder: msg('f3.middle', 'middle') }), captioned(input('dx', s.dx, { placeholder: 'auto' }), { placeholder: msg('plot.auto', 'auto') })),
            row(msg('f3.sliceColour', 'Slice colour'), colour(2, s.sliceColor)), row(captions["ui.label"], input('sliceLabel', s.sliceLabel, { 'data-tx': 'text', placeholder: '(none)' }))] : [])]),
        section(captions["ui.view"], [view(s, [25, 18]), row(msg('f3.hiddenEdges', 'Hidden edges'), check('hiddenEdges', s.hiddenEdges)), row(msg('f3.axes', 'Axes'), check('axes', s.axes)),
          ...(s.axes !== false ? [row(msg('f3.thirdAxis', 'Third axis'), check('zaxis', !!s.zaxis)), row(msg('f3.axisLabels', 'Axis labels'), input('xlabel', s.xlabel, { 'data-tx': 'text' }), input('ylabel', s.ylabel, { 'data-tx': 'text' }), input('zlabel', s.zlabel, { 'data-tx': 'text' }))] : []),
          row(msg('f3.showCurve', 'Show y = f(x)'), check('showCurve', !!s.showCurve)), row(msg('f3.curveLabel', 'Curve label'), input('curveLabel', s.curveLabel, { 'data-tx': 'text', placeholder: '(none)' })),
          help(msg('plot.help.use', 'Functions use '), { code: 'x' }, ', ', { code: 'pi' }, ', ', { code: '^' }, msg('f3.help.revolve', ', sin, cos, exp, sqrt… (radians). With a slice the solid is drawn as an outline. Exported as plain TikZ.'))], 'sec'),
      ] };
    },
    apply: V3.apply(['axis', 'showSlice', 'axes']),
    action() {},
    color: V3.colors(['solidColor', 'regionColor', 'sliceColor'], RDEF),
  };
