// The table engine, installed as TD.table: the model and its operations, the LaTeX writer, the importers and
// the renderer. The Table workspace (src/ui/services/table.ts) is its only user interface. A 'table' shape
// type lets the app's own SVG and PNG export draw it (fonts embedded, the same pipeline as every picture).
import { runtime as TD } from '../../runtime';
import * as model from './model';
import * as numbers from './numbers';
import * as latex from './latex';
import * as importers from './import';
import * as render from './render';

TD.table = { ...model, ...numbers, ...latex, ...importers, layout: render.layout, draw: render.draw, shownText: render.shownText };

const r2 = (v: number) => Math.round(v * 100) / 100;
TD.TYPES.table = {
  name: 'Table',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'table', x: p.x, y: p.y, table: model.create() }),
  drag(s: any, _a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors: () => [],
  samples(s: any) { const L = render.layout(s.table); return [{ x: s.x, y: s.y }, { x: s.x + L.w, y: s.y + L.h }]; },
  svg(s: any, ctx: any) { const d = render.draw(s.table, { export: !!ctx.export }); return `<g transform="translate(${r2(s.x)},${r2(s.y)})">${d.svg}</g>`; },
  // drawn in TikZ as a node holding the tabular
  tikz(s: any, X: any) {
    const r = latex.toLatex(s.table, { bare: true });
    for (const p of r.packages) { const n = /\{([^}]*)\}$/.exec(p); if (n && n[1] !== 'xcolor') X.pkgs.add(n[1]); }
    const L = render.layout(s.table);
    return `\\node[inner sep=0pt] at ${X.c(s.x + L.w / 2, s.y + L.h / 2)} {%\n${r.code}%\n};`;
  },
};
