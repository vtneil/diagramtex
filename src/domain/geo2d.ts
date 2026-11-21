import { runtime as TD } from '../runtime';
// 2D geometry block: a plain TikZ picture read by the 3D geometry interpreter (geo3d.ts) seen straight on.
// Points (x, y) and (angle:radius), vectors, projections such as (Q |- P), grids, angle marks from the angles
// library, function, polar and parametric plots, and labels that print computed values
// (\pgfmathprintnumber of a \pgfmathsetmacro). The code is the object: it is exported as written.
const G = TD.geo3d, V3 = TD.V3;
const { esc, r2 } = TD.util;
const fmt = G.fmt;
const layout = (src: any) => G.layout(src, true);

const DEFAULT = `\\begin{tikzpicture}
  % the vector v = (\\vlen; \\vang°): drag Q, or change the values
  \\pgfmathsetmacro{\\vlen}{4}
  \\pgfmathsetmacro{\\vang}{53.17}
  \\pgfmathsetmacro{\\dx}{\\vlen*cos(\\vang)}
  \\pgfmathsetmacro{\\dy}{\\vlen*sin(\\vang)}
  \\draw[step=1, very thin, black!15] (-1,-1) grid (4,4);
  \\draw[-stealth] (-1,0) -- (4.4,0) node[right]{$x$};
  \\draw[-stealth] (0,-1) -- (0,4.4) node[above]{$y$};
  \\foreach \\x in {1,...,3} \\draw (\\x,2pt) -- (\\x,-2pt) node[below]{$\\x$};
  \\foreach \\y in {1,...,3} \\draw (2pt,\\y) -- (-2pt,\\y) node[left]{$\\y$};
  \\coordinate (P) at (0,0);
  \\coordinate (Q) at (\\vang:\\vlen);
  \\coordinate (R) at (Q |- P);
  \\draw[dashed, gray] (Q) -- (R) node[midway, right]{$\\Delta y = \\pgfmathprintnumber[fixed,precision=2]{\\dy}$};
  \\path (P) -- (R) node[pos=0.62, above]{$\\Delta x = \\pgfmathprintnumber[fixed,precision=2]{\\dx}$};
  \\pic[draw, "$\\theta$", angle radius=8mm] {angle = R--P--Q};
  \\draw[-stealth, thick, blue] (P) -- (Q) node[midway, above left]{$\\vec{v}$};
  \\fill (P) circle (1.5pt) node[below left]{$P$};
  \\fill (Q) circle (1.5pt) node[above right]{$Q$};
\\end{tikzpicture}`;
TD.GEO2D_DEFAULT = DEFAULT;

function draw(s: any, ctx: Record<string, any> = {}) {
  const L = layout(s.src);
  let out = L.empty
    ? `<rect x="${s.x}" y="${s.y}" width="${L.bb.w}" height="${L.bb.h}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`
    : V3.svg(L.items, G.fitAt(L, s.x, s.y), ctx);
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(L.bb.w)}" height="${r2(L.bb.h)}"/>`;
  return out;
}
// the TikZ libraries the code uses
function libsOf(src: any, X: any) {
  if (/-\{?(Stealth|Latex|Triangle|Kite|Straight Barb)|\{(Stealth|Latex)/.test(src)) X.libs.add('arrows.meta');
  if (/\(\s*\$/.test(src)) X.libs.add('calc');
  if (/\{\s*(right )?angle\s*=/.test(src)) X.libs.add('angles');
  if (/\\pic\s*\[[^\]]*"/.test(src)) X.libs.add('quotes');
}

TD.TYPES.geo2d = {
  name: '2D geometry',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'geo2d', x: p.x, y: p.y, src: DEFAULT }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the picture becomes a scope moved to where the drawing sits
  tikz(s: any, X: any) {
    const L = layout(s.src), P = G.partsOf(s.src, true);
    libsOf(s.src, X);
    const o = [`shift={${X.c(s.x - L.bb.x, s.y - L.bb.y)}}`];
    if (P.opts) o.push(P.opts);
    return [P.pre, `\\begin{scope}[${o.join(', ')}]`, P.body, '\\end{scope}', P.post].filter(Boolean).join('\n');
  },
};

// ---------------------------------------------------------------- panel
// a slider for each value set to a plain number (\pgfmathsetmacro, \def): drag it and the figure follows
function sliders(L: any) {
  const out = [];
  for (const [name, m] of L.macros) {
    if (!m.literal || L.S[m.si] == null || L.S[m.si].k !== 'macro') continue;
    const v = parseFloat(L.src.slice(m.span.s, m.span.e));
    const R = Math.abs(v) <= 1 ? 1 : Math.pow(10, Math.ceil(Math.log10(Math.abs(v)) - 1e-9));
    out.push({ name, v, lo: v < 0 ? -R : 0, hi: R, step: R / 200 });
  }
  return out;
}
function fullCode(src: any) { return String(src || '').trim(); }


TD.geo2d = { layout, draw, sliders, libsOf, DEFAULT };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("geo2d", {
  menu: { order: 13, group: 'maths', label: "2D Geometry", title: "2D geometry in plain TikZ: points, vectors, projections, angle marks, function and polar plots, and labels that print computed values, edited visually", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M4 20h25M6 22V3\"/><path d=\"M6 20l15-13\" class=\"c1\"/><path d=\"M21 7v13\" stroke-dasharray=\"1.6 1.4\"/><path d=\"M12 20a6 6 0 00-1.5-4\"/></svg>" },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.geo3dEditor, alias: "geo2dOpen", options: () => ({ flat: true }), layout: (s) => TD.geo3d.layout(s.src, true) }
});
export { layout, sliders, fmt, G, fullCode };
