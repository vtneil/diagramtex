import { runtime as TD } from '../runtime';
// TikZ code kept as written. The importer turns what it can model into shapes; every other statement
// (a \foreach, a pgfplots axis, a node with a shape the model has no fields for, a \tikzset …) becomes one of
// these objects instead of being dropped or approximated. It exports its code unchanged, inside the scopes it
// sat in, and moved by a shift scope when dragged. On the canvas it shows the importer's best approximation of
// the code (s.prev, absolute positions before any move), in a dashed frame so it reads as "not editable here".
//   s = { type: 'tikz', kind: 'code' | 'defs', code, x, y (move offset, px), ctx: [scope options, outer first],
//         prev: [shapes], names: { name: {x, y} }, libs: [], pkgs: [], issues: [] }
const PX = TD.PX_PER_CM;
const { r2, esc } = TD.util;

const prevOf = (s: any) => (Array.isArray(s.prev) ? s.prev.filter((p: any) => p && TD.TYPES[p.type] && p.type !== 'tikz') : []);
// the frame: the preview's box, or a small box where the code sits (s.at, the first point it names)
function box(s: any) {
  const P = prevOf(s);
  if (P.length) {
    const b = TD.bboxOf(P.flatMap((p: any) => { const q = TD.bbox(p); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 0);
    if ([b.x, b.y, b.w, b.h].every(Number.isFinite)) return { x: b.x + s.x, y: b.y + s.y, w: Math.max(b.w, 4), h: Math.max(b.h, 4) };
  }
  const a = s.at || { x: 0, y: 0 };
  if (s.size) return { x: a.x + s.x, y: a.y + s.y, w: s.size.w, h: s.size.h };
  return { x: a.x + s.x - 3, y: a.y + s.y - 3, w: 6, h: 6 };
}
// the code's own text without the indent it had in the source
function dedent(code: any) {
  const L = String(code || '').replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const ind = Math.min(...L.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l))![0].length));
  return isFinite(ind) && ind > 0 ? L.map((l) => l.slice(Math.min(ind, (/^[ \t]*/.exec(l))![0].length))).join('\n') : L.join('\n');
}
// code inside scopes: the context it was written in (innermost last), then the move
function wrapCode(code: any, ctx: any, shift: any) {
  let out = code;
  for (const o of [...(ctx || [])].reverse()) out = `\\begin{scope}[${o}]\n  ${out.replace(/\n/g, '\n  ')}\n\\end{scope}`;
  if (shift) out = `\\begin{scope}[shift={${shift}}]\n  ${out.replace(/\n/g, '\n  ')}\n\\end{scope}`;
  return out;
}
const label = (s: any) => {
  if (s.kind === 'defs') return 'definitions';
  const code = String(s.code || '').replace(/^(\s*%.*\n)+/, ''); // after the comments above it
  const m = /^\s*\\([a-zA-Z]+)/.exec(code) || [];
  const env = /^\s*\\begin\{(\w+)\}/.exec(code);
  return env ? env[1] : m[1] ? '\\' + m[1] : 'TikZ';
};

TD.TYPES.tikz = {
  name: 'TikZ code',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'tikz', kind: 'code', code: '\\draw (0,0) -- (1,1);', x: 0, y: 0, at: { x: p.x, y: p.y }, ctx: [], prev: [], libs: [], pkgs: [], issues: [] }),
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = box(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; },
  samples(s: any) { const b = box(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; },
  svg(s: any, ctx: any) {
    const P = prevOf(s);
    let inner = P.map((p: any) => TD.TYPES[p.type].svg(p, ctx)).join('');
    if (inner && (s.x || s.y)) inner = `<g transform="translate(${r2(s.x)} ${r2(s.y)})">${inner}</g>`;
    if (ctx && ctx.export) return s.kind === 'defs' ? '' : inner;
    // on the canvas: a dashed frame and a tag naming the code, so a kept statement is easy to find
    // the frame and tag keep their size on screen: style.css divides by the canvas's --zoom
    const b = box(s);
    return `<g class="rawtikz">${inner}<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" class="rawtikz-frame"/>`
      + `<text x="${r2(b.x)}" y="${r2(b.y)}" class="rawtikz-tag">${esc(label(s))}</text>`
      + `<rect class="hitfill" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}"/></g>`;
  },
  translate(s: any, dx: any, dy: any) { s.x = (s.x || 0) + dx; s.y = (s.y || 0) + dy; },
  tikz(s: any, X: any) {
    for (const l of s.libs || []) X.libs.add(l);
    for (const p of s.pkgs || []) X.pkgs.add(p);
    const code = dedent(s.code);
    if (!code.trim()) return '';
    // and what the code itself uses (decorate, right=of …), so the export compiles without the source's preamble
    if (TD.lint && TD.lint.uses) { const u = TD.lint.uses(code); for (const l of u.libs) X.libs.add(l); for (const p of u.pkgs) X.pkgs.add(p); }
    // definitions from the source's preamble go to the preamble when there is one (standalone, document)
    if (s.pre && X.preDefs) { X.preDefs.add(code); return ''; }
    const moved = Math.abs(s.x || 0) > 1e-6 || Math.abs(s.y || 0) > 1e-6;
    return wrapCode(code, s.ctx, moved ? X.c(s.x, s.y) : null);
  },
};

// the preview of edited code: parsed again where it was (its scopes and the names it uses)
function refresh(s: any) {
  if (!TD.importInternals || !TD.importInternals.preview) return;
  const r = TD.importInternals.preview(s.code, s.ctx, s.names, s.macros, s.definitions);
  s.prev = r.shapes;
  s.issues = r.issues;
}


// a named point (src/domain/shapes.ts T.coord): its name

TD.rawTikz = { dedent, wrapCode, box, refresh };
export { prevOf, refresh };
