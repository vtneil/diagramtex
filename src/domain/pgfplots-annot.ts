import { runtime as TD } from '../runtime';
// TikZ drawn inside a pgfplots axis (\draw, \node, \fill, \coordinate … between the \addplot commands): a plot holds
// them as written, in s.annot = [{ at, code }] (at: how many of its series come before the statement), with
// s.annotDefs the picture's definitions they use (colours, styles, macros) and drawn by the importer
// (TD.importInternals.drawWith) in the axis' own coordinates, as pgfplots draws them:
//   - axis cs:x,y is the data point; rel axis cs:u,v and axis description cs:u,v are fractions of the box
//   - from compat 1.11 a plain (x,y) is axis cs, and +(x,y) / ++(x,y) move along the axis' unit vectors (from 1.5.1
//     a unitless circle or ellipse radius, from 1.11 an arc's, are in those units too: an ellipse where the units
//     differ); a polar (a:r) is r axis units from the axis' origin
//   - a length with a unit stays a length: the statement keeps the picture's sizes
//   - drawn in order with the plots and cut at the axis box (clip=true, clip mode=global: pgfplots' defaults)
//   - `current axis` and the axis' name= are the box, for anchors such as (current axis.north east)
// The drawing is the code inside a scope whose origin is the axis' (0,0) and whose x and y vectors are its units.
const PX = TD.PX_PER_CM;
const fm = (n: number) => String(+n.toFixed(6));

/** compat=1.11 and later read as a number (default / unset: 0, the oldest). */
export function compatNum(v: any) {
  const t = String(v ?? '').trim();
  if (t === 'newest' || t === 'mostrecent') return 1.18;
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(t);
  return m ? +m[1] + +m[2] / 100 + (m[3] ? +m[3] / 10000 : 0) : 0;
}
const V = (a: string) => { const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(a)!; return +m[1] + +m[2] / 100 + (m[3] ? +m[3] / 10000 : 0); };
const V1_5_1 = V('1.5.1'), V1_11 = V('1.11');

// axis cs:… / rel axis cs:… / axis description cs:… → a plain point in the axis' units
const CS = /\(\s*(rel axis|axis description|axis)\s+cs\s*:\s*((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g;
function splitTop(s: string, sep: string) {
  const out: string[] = []; let d = 0, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { buf += c + s[++i]; continue; }
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    if (c === sep && d === 0) { out.push(buf); buf = ''; } else buf += c;
  }
  out.push(buf);
  return out;
}
function csPoints(code: string, L: any) {
  return code.replace(CS, (all, cs, args) => {
    const p = splitTop(args, ',').map((q) => q.trim());
    if (p.length !== 2) return all;
    if (cs === 'axis') return `(${p[0]},${p[1]})`;
    const g = (k: number, a: string) => `{${fm(L[a + 'min'])}+(${p[k]})*${fm(L[a + 'max'] - L[a + 'min'])}}`;
    return `(${g(0, 'x')},${g(1, 'y')})`;
  });
}
const UNIT = /\d\s*(?:cm|mm|pt|in|em|ex|bp|sp)\b|\\(?:pgflinewidth|textwidth|linewidth|columnwidth)\b/;

/** What the plot cannot hold as written in one statement (in the axis at this compat level), or [] when exact. */
export function annotIssues(code: string, compat: number) {
  const out: string[] = [];
  for (const m of code.matchAll(CS)) if (splitTop(m[2], ',').length !== 2) out.push('a 3D point in the axis');
  // a \clip of the axis' own (what it cuts among the plots and drawing after it): not held
  if (/^\\clip\b/.test(code) || /^\\(?:path|draw|fill|filldraw|shade|shadedraw)\s*\[(?:[^\]]*[,\s])?clip\s*[,\]]/.test(code)) out.push('a \\clip in the axis not held');
  const t = code.replace(CS, '(cs)');
  if (/\bcs\s*:/.test(t)) out.push('a coordinate system other than axis cs in the axis');
  if (/\(\s*[^()]*\b(?:x|y|z)\s*=/.test(t) || /\baxis\s+direction\s+cs\b/.test(t)) out.push('a coordinate form not held in the axis');
  for (const m of t.matchAll(/(\+\+?)?\(([^()]*)\)/g)) {
    const inner = m[2].trim();
    if (!inner || inner === 'cs') continue;
    const parts = splitTop(inner, ','), polar = splitTop(inner, ':');
    const plain = (parts.length === 2 || polar.length === 2) && !/[|!$]/.test(inner) && !/^[A-Za-z][\w ]*(\.[\w ]+)?$/.test(inner);
    if (!plain) continue;
    if (UNIT.test(inner)) { if (!m[1] && parts.length === 2) out.push('a point in lengths (not axis units) in the axis'); continue; }
    if (compat < V1_11) out.push('plain coordinates in the axis before compat=1.11 (pgfplots\' internal units)');
  }
  // unitless radii: axis units only from compat 1.5.1 (circle, ellipse) and 1.11 (arc)
  const radius = (s: string) => !UNIT.test(s);
  if (compat < V1_11 && /\barc\b/.test(t) && [...t.matchAll(/\b(?:x |y )?radius\s*=\s*([^,\]]+)/g)].some((m) => radius(m[1]))) out.push('an arc\'s radius in axis units before compat=1.11');
  if (compat < V1_5_1 && (/\b(?:circle|ellipse)\s*\(\s*[^()]*\)/.test(t) && [...t.matchAll(/\b(?:circle|ellipse)\s*\(([^()]*)\)/g)].some((m) => radius(m[1]))
    || [...t.matchAll(/\b(?:x |y )?radius\s*=\s*([^,\]]+)/g)].some((m) => radius(m[1])))) out.push('a circle\'s radius in axis units before compat=1.5.1');
  // a unitless radius other than a plain number (\r, 2*0.5), or a unitless one beside a length: not worked out here
  const radii = [...t.matchAll(RADIUS_KEY)].map((m) => [m[3]]).concat([...t.matchAll(RADIUS_PAREN)].map((m) => m[3].split(/\s+and\s+/)), [...t.matchAll(ARC_PAREN)].map((m) => m[4].split(/\s+and\s+/)));
  if (radii.some((g) => !(g.every((v) => NUM.test(v)) || g.every((v) => UNIT.test(v))))) out.push('a radius in axis units given as an expression in the axis');
  return [...new Set(out)];
}

// radii: radius=r, x radius=r, y radius=r; circle (r), ellipse (a and b); arc (a:b:r)
const NUM = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*$/;
const RADIUS_KEY = /([[,]\s*)(x |y )?radius\s*=\s*([^,\]]+)/g;
const RADIUS_PAREN = /\b(circle|ellipse)(\s*)\(([^()]*)\)/g;
const ARC_PAREN = /\barc(\s*)\(([^():]*):([^():]*):([^()]*)\)/g;
// A radius without a unit is in the x and y units, as TikZ reads it (an ellipse where they differ): written out as
// lengths, which the importer draws as they are
function radiiInUnits(code: string, ux: number, uy: number) {
  const L = (v: string, u: number) => `${fm((+v * u) / PX)}cm`;
  const pair = (v: string) => { const p = v.split(/\s+and\s+/); return p.length <= 2 && p.every((q) => NUM.test(q)) ? `${L(p[0], ux)} and ${L(p[1] ?? p[0], uy)}` : null; };
  return code
    .replace(RADIUS_KEY, (all, pre, xy, v) => {
      if (!NUM.test(v)) return all;
      const tail = /\s*$/.exec(v)![0];
      return pre + (xy === 'x ' ? `x radius=${L(v, ux)}` : xy === 'y ' ? `y radius=${L(v, uy)}` : `x radius=${L(v, ux)}, y radius=${L(v, uy)}`) + tail;
    })
    .replace(RADIUS_PAREN, (all, kw, sp, v) => { const q = pair(v); return q ? `${kw}${sp}(${q})` : all; })
    .replace(ARC_PAREN, (all, sp, a, b, v) => { const q = pair(v); return q ? `arc${sp}(${a}:${b}:${q})` : all; });
}

/** The axis' code as the importer reads it: in a scope at the axis' origin with its units as x and y. */
export function annotScope(s: any, L: any, code: string) {
  const ux = s.w / (L.xmax - L.xmin), uy = s.h / (L.ymax - L.ymin);
  const ox = s.x - L.xmin * ux, oy = s.y + s.h + L.ymin * uy;
  let c = radiiInUnits(csPoints(code, L), ux, uy);
  // \pgfkeysvalueof{/pgfplots/xmin}: the value given
  c = c.replace(/\\pgfkeysvalueof\{\/pgfplots\/([xyz](?:min|max))\}/g, (all, k) => (s[k] != null && String(s[k]).trim() !== '' ? String(s[k]) : all));
  const lw = s.lineWidth != null ? `, line width=${fm(s.lineWidth * TD.PT_PER_PX)}pt` : '';
  return `\\begin{scope}[shift={(${fm(ox / PX)}cm,${fm(-oy / PX)}cm)}, x=${fm(ux / PX)}cm, y=${fm(uy / PX)}cm${lw}]\n${c}\n\\end{scope}`;
}

// drawn shapes per plot state (the drawing is the importer's: kept while nothing it depends on changes)
const CACHE = new Map<string, any>();
/** The statements' shapes, in groups by s.annot's `at`, and what the importer could not draw. */
export function annotShapes(s: any, L: any) {
  const list = (s.annot || []) as { at: number, code: string }[];
  if (!list.length || !TD.importInternals?.drawWith) return { groups: [] as { at: number, shapes: any[] }[], issues: [] as string[] };
  const key = JSON.stringify([list, s.annotDefs, s.x, s.y, s.w, s.h, L.xmin, L.xmax, L.ymin, L.ymax, s.name, s.xmin, s.xmax, s.ymin, s.ymax, s.lineWidth]);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const box = { x: s.x + s.w / 2, y: s.y + s.h / 2, w: s.w, h: s.h, kind: 'rect' };
  const named: Record<string, any> = { 'current axis': box };
  if (s.name) named[s.name] = box;
  // statements between the same plots go together; one reading for all of them (a name one statement sets is seen by
  // the next), and the readings of the groups so far say where each group's shapes start
  const groups: { at: number, code: string, shapes: any[] }[] = [];
  for (const a of list) { const g = groups[groups.length - 1]; if (g && g.at === a.at) g.code += '\n' + a.code; else groups.push({ at: a.at, code: a.code, shapes: [] }); }
  const read = (n: number) => {
    const D = TD.importInternals.drawWith(annotScope(s, L, groups.slice(0, n).map((g) => g.code).join('\n')), named, s.annotDefs || '');
    return { shapes: D.shapes.filter((x: any) => !(x.type === 'dot' && x.r === 0)), issues: D.issues };
  };
  const D = read(groups.length);
  let from = 0;
  groups.forEach((g, k) => {
    const to = k === groups.length - 1 ? D.shapes.length : read(k + 1).shapes.length;
    g.shapes = D.shapes.slice(from, to); from = to;
  });
  const out = { groups, issues: D.issues as string[] };
  if (CACHE.size > 64) CACHE.clear();
  CACHE.set(key, out);
  return out;
}

/** SVG for shapes the importer drew. */
export function shapesSvg(list: any[], ctx: any) {
  return (list || []).map((x: any) => { try { return TD.TYPES[x.type].svg(x, { ...ctx, export: true }); } catch { return ''; } }).join('');
}

/** The definitions code in the axis uses (colours, styles and macros of the picture around it), as TeX. */
export function annotDefs(code: string, ctx: { colors?: Record<string, string>, styles?: Map<string, string>, macros?: Map<string, string> }) {
  const out: string[] = [];
  const has = (t: string, nm: string) => new RegExp(`(^|[^A-Za-z@])${nm.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![A-Za-z@])`).test(t);
  // styles, with the styles they name in turn
  let text = code;
  const seen = new Set<string>();
  for (let pass = 0; pass < 6 && ctx.styles; pass++) {
    let grew = false;
    for (const [k, v] of ctx.styles) {
      if (seen.has(k) || /[\x00-\x1f]|^pgfplots:|\//.test(k) || typeof v !== 'string' || !has(text, k)) continue;
      seen.add(k); text += ',' + v; grew = true;
      out.push(`\\tikzset{${k}/.style={${v}}}`);
    }
    if (!grew) break;
  }
  for (const [k, v] of Object.entries(ctx.colors || {})) if (/^#[0-9a-f]{6}$/i.test(String(v)) && has(text, k) && /^[A-Za-z][\w]*$/.test(k)) out.unshift(`\\definecolor{${k}}{HTML}{${String(v).slice(1).toUpperCase()}}`);
  for (const [k, v] of ctx.macros || []) if (new RegExp(`\\\\${k}(?![A-Za-z@])`).test(text) && /^[A-Za-z@]+$/.test(k)) out.unshift(`\\def\\${k}{${v}}`);
  return out.join('\n');
}

TD.pgfAnnot = { annotShapes, annotIssues, annotScope, annotDefs, compatNum, shapesSvg };
