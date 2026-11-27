import { runtime as TD } from '../runtime';
import { layoutCache, srcKey } from './layout-cache';
import { halfH, lift, close, split, skip, stripComments, shown, lines, kv, unbrace, num, polyline, bezAt, bezTan, ptsD } from './automata';
// Networks written with the tikz-network package (tikz-network.sty, J. Hackl). The source is the object: a
// tikzpicture of \Vertex, \Edge, \Text and \Plane commands, the \Set… commands that restyle them, Layer
// environments, and \Vertices / \Edges that read their rows from CSV files the block carries (s.files). It is drawn
// here as tikz-network draws it, measured against pdflatex (TeX Live 2026, tikz-network 1.1):
//   a vertex is a circle 0.6cm across (minimum size), line 1pt black, fill vertexfill (#abd7e6), its label a node
//   placed with `label=position:text` (font \scriptsize, inner sep .3333em of the 10pt font, outer sep .2pt);
//   an edge is 1.5pt black!75 from border to border on the background layer, `bend left=bend` (the curve's
//   controls 0.3915 of the chord, as TikZ's fixed-point length gives it), a loop `in`/`out` about loopposition with
//   its controls loopsize (1cm) out; Direct gives it the old `latex` tip (a = 0.28pt + 0.3·line width, 9a long);
//   its label is a white circle (inner sep 0, outer sep 1pt) at pos=distance;
//   multilayer=3d draws each layer on `canvas is yx plane at z=(layer−1)·(−2)`, x along 37°, y along −12°, z up.
// Exported unchanged, its tikzpicture turned into a scope shifted to where the drawing sits; its CSV files go with
// the export (TD.texImages.use: the .zip and the in-browser compile get them).
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, PT = 1 / TD.PT_PER_PX, CM = 28.45274; // px per cm, px per pt, pt per cm
const VERTEXFILL = '#abd7e6';
const FONT_PT: Record<string, number> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
const LABEL_SEP = (10 / 3 + 0.2) * PT; // a label node's inner sep (.3333em of the 10pt font) and outer sep (.5 × 0.4pt)

TD.NETWORK_DEFAULT = [
  '\\begin{tikzpicture}',
  '  \\Vertex[x=0,y=0,label=A,position=above]{A}',
  '  \\Vertex[x=2.5,y=0.5,label=B,position=above]{B}',
  '  \\Vertex[x=1.5,y=-1.5,label=C,position=below]{C}',
  '  \\Edge[label=1](A)(B)',
  '  \\Edge[Direct,bend=-20](B)(C)',
  '  \\Edge(C)(A)',
  '\\end{tikzpicture}',
].join('\n');

// ---------------------------------------------------------------- reading the code
// The model: { env (picture options, or null when there is no tikzpicture round the code), items, warnings }
// item: { k: 'v', id, o } \Vertex[o]{id} · { k: 'e', a, b, o } \Edge[o](a)(b) · { k: 't', o, text } \Text[o]{text}
//   · { k: 'p', o } \Plane[o] · { k: 'vs' | 'es', o, file } \Vertices[o]{file} / \Edges[o]{file}
//   · { k: 'set', cmd, o?, arg? } \SetVertexStyle[o], \SetLayerDistance{arg}, \EdgesInBG …
//   · { k: 'layer', o } \begin{Layer}[o] · { k: 'endlayer' } · { k: 'raw', s } anything else, kept as written
const opts = (s: string) => split(s || '').map((x: string) => x.trim()).filter(Boolean);
const SET_OPT = new Set(['SetVertexStyle', 'SetEdgeStyle', 'SetPlaneStyle', 'SetTextStyle', 'SetCoordinates']);
const SET_ARG = new Set(['SetLayerDistance', 'SetDistanceScale', 'SetDefaultUnit', 'SetPlaneWidth', 'SetPlaneHeight']);
const SET_NONE = new Set(['EdgesInBG', 'EdgesNotInBG']);
const CMD = /^\\(Vertex|Edge|Text|Plane|Vertices|Edges|SetVertexStyle|SetEdgeStyle|SetPlaneStyle|SetTextStyle|SetCoordinates|SetLayerDistance|SetDistanceScale|SetDefaultUnit|SetPlaneWidth|SetPlaneHeight|EdgesInBG|EdgesNotInBG)(?![A-Za-z@])/;
const LAYER = /^\\(begin|end)\s*\{Layer\}/;
const isCmdAt = (s: string, i: number) => s[i] === '\\' && (CMD.test(s.slice(i, i + 20)) || LAYER.test(s.slice(i, i + 16)));
// a statement this block doesn't read: to the next ; at the top level, or to the next tikz-network command
function rawEnd(s: string, i: number) {
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (k > i && isCmdAt(s, k)) return k;
    if (c === '\\') { k++; continue; }
    if ('{[('.includes(c)) { const e = close(s, k); if (e < 0) return s.length; k = e; continue; }
    if (c === ';') return k + 1;
  }
  return s.length;
}
function parse(src: any) {
  const warnings: string[] = [], warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const t = stripComments(String(src || ''));
  const bm = /\\begin\{tikzpicture\}\s*/.exec(t);
  let body = t, env: string | null = null, preText = '';
  if (bm) {
    let i = bm.index + bm[0].length;
    env = '';
    if (t[i] === '[') { const e = close(t, i); if (e > 0) { env = t.slice(i + 1, e).trim(); i = e + 1; } }
    const em = t.indexOf('\\end{tikzpicture}', i);
    if (em < 0) warn('\\end{tikzpicture} is missing');
    body = t.slice(i, em < 0 ? t.length : em);
    // what is written before the picture: \SetCoordinates and the other settings take effect from there (a whole
    // document's preamble lines, when one is pasted, are left out)
    preText = t.slice(0, bm.index).replace(/\\documentclass(\[[^\]]*\])?\{[^}]*\}|\\usepackage(\[[^\]]*\])?\{[^}]*\}|\\usetikzlibrary\{[^}]*\}|\\begin\{document\}/g, '');
  }
  const pre = preText.trim() ? itemsOf(preText, true) : [];
  const items = itemsOf(body, false);
  return { env, items, pre, warnings };
  function itemsOf(body: string, before: boolean) {
  const items: any[] = [];
  let i = 0, depth = 0;
  // an optional [options] at j: [list, index after]
  const optAt = (j: number): [string[], number] | null => { j = skip(body, j); if (body[j] !== '[') return [[], j]; const e = close(body, j); return e < 0 ? null : [opts(body.slice(j + 1, e)), e + 1]; };
  const groupAt = (j: number, open: string): [string, number] | null => { j = skip(body, j); if (body[j] !== open) return null; const e = close(body, j); return e < 0 ? null : [body.slice(j + 1, e).trim(), e + 1]; };
  while (i < body.length) {
    i = skip(body, i);
    if (i >= body.length) break;
    const rest = body.slice(i, i + 24), m = CMD.exec(rest), lm = LAYER.exec(rest);
    let item: any = null, end = -1;
    if (lm) {
      end = i + lm[0].length;
      if (lm[1] === 'begin') { const o = optAt(end); if (o) { item = { k: 'layer', o: o[0] }; end = o[1]; depth++; } }
      else if (depth > 0) { item = { k: 'endlayer' }; depth--; }
    } else if (m) {
      const name = m[1], j = i + m[0].length;
      const o = optAt(j);
      if (o) {
        const [list, a] = o;
        if (name === 'Vertex') { const g = groupAt(a, '{'); if (g && g[0]) { item = { k: 'v', id: unbrace(g[0]), o: list }; end = g[1]; } }
        else if (name === 'Edge') { const g1 = groupAt(a, '('), g2 = g1 && groupAt(g1[1], '('); if (g1 && g2) { item = { k: 'e', a: g1[0], b: g2[0], o: list }; end = g2[1]; } }
        else if (name === 'Text') { const g = groupAt(a, '{'); if (g) { item = { k: 't', o: list, text: g[0] }; end = g[1]; } }
        else if (name === 'Plane') { item = { k: 'p', o: list }; end = a; }
        else if (name === 'Vertices' || name === 'Edges') { const g = groupAt(a, '{'); if (g && g[0]) { item = { k: name === 'Vertices' ? 'vs' : 'es', o: list, file: g[0] }; end = g[1]; } }
        else if (SET_OPT.has(name)) { item = { k: 'set', cmd: name, o: list }; end = a; }
        else if (SET_ARG.has(name)) { const g = groupAt(j, '{'); if (g) { item = { k: 'set', cmd: name, arg: g[0] }; end = g[1]; } }
        else if (SET_NONE.has(name)) { item = { k: 'set', cmd: name }; end = j; }
      }
    }
    if (!item) {
      end = rawEnd(body, i);
      const s = body.slice(i, end).trim();
      item = { k: 'raw', s };
      if (before && s && !/^\\(tikzset|definecolor|colorlet)\b/.test(s)) warn(`"${s.length > 40 ? s.slice(0, 40) + '…' : s}" before the picture isn't used here`);
    }
    if (body[end] === ';' && item.k !== 'raw') end++; // a stray ; after a command is TikZ's, and harmless
    items.push(item);
    i = Math.max(end, i + 1);
  }
  if (depth > 0) warn('\\end{Layer} is missing');
  return items;
  }
}

// ---------------------------------------------------------------- writing the code
// option values: braced when they hold a comma, an = or a ]
const val = (v: any) => { const s = String(v); return /[,=\]]/.test(s) || s === '' ? `{${s}}` : s; };
const optCode = (o: string[]) => (o.length ? `[${o.join(',')}]` : '');
function itemCode(it: any): string {
  switch (it.k) {
    case 'v': return `\\Vertex${optCode(it.o)}{${it.id}}`;
    case 'e': return `\\Edge${optCode(it.o)}(${it.a})(${it.b})`;
    case 't': return `\\Text${optCode(it.o)}{${it.text}}`;
    case 'p': return `\\Plane${optCode(it.o)}`;
    case 'vs': return `\\Vertices${optCode(it.o)}{${it.file}}`;
    case 'es': return `\\Edges${optCode(it.o)}{${it.file}}`;
    case 'set': return it.arg != null ? `\\${it.cmd}{${it.arg}}` : `\\${it.cmd}${it.o ? optCode(it.o) : ''}`;
    case 'layer': return `\\begin{Layer}${optCode(it.o)}`;
    case 'endlayer': return '\\end{Layer}';
    default: return it.s;
  }
}
function write(M: any) {
  let depth = 0;
  const out = M.items.map((it: any) => {
    if (it.k === 'endlayer') depth = Math.max(0, depth - 1);
    const line = '  ' + '  '.repeat(depth) + itemCode(it);
    if (it.k === 'layer') depth++;
    return line;
  });
  const body = out.join('\n'), pre = (M.pre || []).map((it: any) => itemCode(it)).filter(Boolean).join('\n');
  return M.env == null ? body : `${pre ? pre + '\n' : ''}\\begin{tikzpicture}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{tikzpicture}`;
}

// ---------------------------------------------------------------- options
/** the value of key k in an option list (unbraced), or null */
function getOpt(o: string[], k: string) {
  for (let i = o.length - 1; i >= 0; i--) { const p = kv(o[i]); if (p.k === k) return p.v == null ? '' : unbrace(p.v); }
  return null;
}
/** a true/false key (written bare, or =true / =false) */
function flag(o: string[], k: string) {
  for (let i = o.length - 1; i >= 0; i--) { const p = kv(o[i]); if (p.k === k) return p.v == null || unbrace(p.v) !== 'false'; }
  return false;
}
/** the list with key k set to v (null or '' takes it away; true writes the key bare) */
function setOpt(o: string[], k: string, v: any) {
  const r = o.filter((x) => kv(x).k !== k);
  if (v === true) { const at = o.findIndex((x) => kv(x).k === k); r.splice(at < 0 ? r.length : at, 0, k); return r; }
  if (v == null || v === '' || v === false) return r;
  const at = o.findIndex((x) => kv(x).k === k), it = `${k}=${val(v)}`;
  r.splice(at < 0 ? r.length : Math.min(at, r.length), 0, it);
  return r;
}
// a length → pt ("1.5pt", "2mm", "1cm", "0.6\DefaultUnit"); a bare number is in `bare` pt each (pgfmath: pt)
function len(v: any, bare = 1, unit = CM) {
  const s = String(v ?? '').trim().replace(/\\DefaultUnit\b/g, 'du');
  const m = /^(-?[\d.]*\.?\d+)\s*\*?\s*(pt|cm|mm|in|bp|em|ex|du)?$/.exec(s);
  if (!m) { const n = Number(s); return isFinite(n) ? n * bare : NaN; }
  const n = parseFloat(m[1]);
  return ({ pt: n, cm: n * CM, mm: n * CM / 10, in: n * 72.27, bp: n * 72.27 / 72, em: n * 10, ex: n * 4.305, du: n * unit } as Record<string, number>)[m[2]] ?? n * bare;
}
const numOr = (v: any, d: number) => { const n = parseFloat(String(v ?? '')); return isFinite(n) ? n : d; };
const fontPt = (f: any, d: number) => { const m = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(String(f || '')); return m ? FONT_PT[m[1]] : d; };
// a colour: xcolor names and mixes (TD.tikzColor), vertexfill, the picture's own \definecolor, {R,G,B} with RGB
function colour(spec: any, rgb: boolean, local: Record<string, string>) {
  const s = unbrace(spec || '').trim();
  if (!s) return null;
  if (rgb) { const p = s.split(',').map((x) => parseFloat(x)).filter((x) => isFinite(x)); if (p.length >= 3) return '#' + p.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  if (s === 'vertexfill') return VERTEXFILL;
  if (local[s]) return local[s];
  // a mix with a local or vertexfill colour: red!30!vertexfill
  if (/!/.test(s)) {
    const parts = s.split('!'), base = (n: string) => (n === 'vertexfill' ? VERTEXFILL : local[n] || (TD.tikzColor && TD.tikzColor(n)) || null);
    let c = base(parts[0]);
    for (let i = 1; c && i < parts.length; i += 2) {
      const pct = parseFloat(parts[i]) / 100, other = parts[i + 1] ? base(parts[i + 1]) : '#ffffff';
      if (!isFinite(pct) || !other) { c = null; break; }
      const a = [1, 3, 5].map((k) => parseInt(c!.slice(k, k + 2), 16)), b = [1, 3, 5].map((k) => parseInt(other.slice(k, k + 2), 16));
      c = '#' + a.map((x, k) => Math.round(x * pct + b[k] * (1 - pct)).toString(16).padStart(2, '0')).join('');
    }
    if (c) return c;
  }
  return (TD.tikzColor && TD.tikzColor(s)) || undefined;
}

// ---------------------------------------------------------------- CSV files (datatool's \DTLloaddb: a header row,
// comma-separated, " quotes a value)
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && !cur.trim()) { q = true; cur = ''; continue; }
    if (c === ',') { row.push(cur); cur = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; continue; }
    cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
/** a CSV file as { head: [key], rows: [[value]] } (keys trimmed, as \trim@spaces@in does) */
function csv(text: string) {
  const r = csvRows(text);
  return { head: (r[0] || []).map((x) => x.trim()), rows: r.slice(1).map((x) => x.map((v) => v.trim())) };
}
function csvText(T: { head: string[]; rows: string[][] }) {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [T.head, ...T.rows].map((r) => r.map((v) => cell(v ?? '')).join(',')).join('\n') + '\n';
}
// a row's cells as options (id, u, v, R, G, B apart), as \Vertices and \Edges build them
function rowOpts(T: any, r: string[], skipKeys: string[]) {
  const o: string[] = [], rgb: string[] = [];
  T.head.forEach((k: string, j: number) => {
    const v = r[j] ?? '';
    if (skipKeys.includes(k)) return;
    if (k === 'R' || k === 'G' || k === 'B') { rgb.push(v); return; }
    if (k) o.push(`${k}=${val(v)}`);
  });
  return { o, rgb };
}
const cellOf = (T: any, r: string[], k: string) => { const j = T.head.indexOf(k); return j < 0 ? '' : r[j] ?? ''; };

// ---------------------------------------------------------------- geometry (pt, y up)
type V2 = [number, number];
type M2 = [number, number, number, number]; // [a b; c d]: (x, y) → (a x + b y, c x + d y)
const I2: M2 = [1, 0, 0, 1];
const mul = (m: M2, p: V2): V2 => [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
const inv = (m: M2): M2 => { const d = m[0] * m[3] - m[1] * m[2] || 1; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d]; };
const same = (a: M2, b: M2) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const polar = (deg: number, l: number): V2 => [l * Math.cos((deg * Math.PI) / 180), l * Math.sin((deg * Math.PI) / 180)];
const unit = (deg: number): V2 => polar(deg, 1);
const DIR_DEG: Record<string, number> = { right: 0, east: 0, 'above right': 45, 'north east': 45, above: 90, north: 90, 'above left': 135, 'north west': 135, left: 180, west: 180, 'below left': 225, 'south west': 225, below: 270, south: 270, 'below right': 315, 'south east': 315 };
// TikZ's length of a vector for a curve's control distance (tikzlibrarytopaths: a fixed-point estimate, ≈ 256/257
// of the true length near an axis)
function tikzLen(dx: number, dy: number) {
  const L = Math.hypot(dx, dy);
  if (!L) return 0;
  const sp = (pt: number) => Math.trunc(pt * 65536);
  const nx = sp(dx / L), ny = sp(dy / L);
  const big = nx > ny, n = big ? nx : ny, d = big ? dx : dy, c = Math.trunc(n / 255);
  if (!c) return L;
  return (Math.trunc(Math.trunc(16 * sp(d)) / c) * 16) / 65536;
}

// a node's shape in its own frame (pt): its outline and how far its border is along a direction
// minimum width and height (a style's) widen or heighten a rectangle, diamond or ellipse; a circle takes the larger
function shapeOf(kind: string, minSize: number, innerSep: number, sides = 5, ratio = 1.5, minW = 0, minH = 0) {
  const h = Math.max(minSize / 2, innerSep), hw = Math.max(h, minW / 2), hh = Math.max(h, minH / 2);
  if (kind === 'rectangle' || kind === 'square') return { kind: 'rect', hw, hh };
  if (kind === 'diamond') return { kind: 'diamond', hw, hh };
  if (kind === 'ellipse' && Math.abs(hw - hh) > 1e-9) return { kind: 'poly', pts: Array.from({ length: 72 }, (_, k) => [hw * Math.cos((k * Math.PI) / 36), hh * Math.sin((k * Math.PI) / 36)] as V2), r: Math.max(hw, hh), hw, hh };
  if (kind === 'circle' || kind === 'ellipse') return { kind: 'circle', r: Math.max(hw, hh) };
  if (kind === 'regular polygon' || kind === 'star' || kind === 'isosceles triangle' || kind === 'triangle') {
    const n = kind === 'star' ? sides : kind === 'regular polygon' ? sides : 3, pts: V2[] = [];
    if (kind === 'star') for (let k = 0; k < 2 * n; k++) pts.push(polar(90 + (180 * k) / n, k % 2 ? h / ratio : h));
    else for (let k = 0; k < n; k++) pts.push(polar(90 + (360 * k) / n, h));
    return { kind: 'poly', pts, r: h };
  }
  return { kind: 'circle', r: h };
}
function reach(S: any, u: V2) {
  const [ux, uy] = u, ax = Math.abs(ux), ay = Math.abs(uy);
  if (S.kind === 'circle') return S.r;
  if (S.kind === 'rect') return Math.min(ax > 1e-12 ? S.hw / ax : Infinity, ay > 1e-12 ? S.hh / ay : Infinity);
  if (S.kind === 'diamond') return 1 / (ax / S.hw + ay / S.hh || 1);
  // a polygon: the ray from the centre to its first crossing
  let best = Infinity;
  for (let k = 0; k < S.pts.length; k++) {
    const p = S.pts[k], q = S.pts[(k + 1) % S.pts.length], ex = q[0] - p[0], ey = q[1] - p[1], den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * ey - p[1] * ex) / den, s = (p[0] * uy - p[1] * ux) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return isFinite(best) ? best : S.r;
}
// the outline as a closed path in the page (px, y down), the shape's frame mapped by m and moved to c (pt, y up)
const toPx = (p: V2) => [p[0] * PT, -p[1] * PT];
const pxs = (p: V2) => { const [x, y] = toPx(p); return `${r2(x)},${r2(y)}`; };
function outline(S: any, m: M2, c: V2) {
  const P = (p: V2) => { const q = mul(m, p); return [q[0] + c[0], q[1] + c[1]] as V2; };
  if (S.kind === 'circle') {
    const k = 0.5523 * S.r, r = S.r, seg = [[[r, k], [k, r], [0, r]], [[-k, r], [-r, k], [-r, 0]], [[-r, -k], [-k, -r], [0, -r]], [[k, -r], [r, -k], [r, 0]]] as V2[][];
    return `M${pxs(P([r, 0]))}` + seg.map((s) => `C${s.map((p) => pxs(P(p))).join(' ')}`).join('') + 'Z';
  }
  const pts: V2[] = S.kind === 'rect' ? [[S.hw, S.hh], [-S.hw, S.hh], [-S.hw, -S.hh], [S.hw, -S.hh]] : S.kind === 'diamond' ? [[S.hw, 0], [0, S.hh], [-S.hw, 0], [0, -S.hh]] : S.pts;
  return pts.map((p, i) => `${i ? 'L' : 'M'}${pxs(P(p))}`).join('') + 'Z';
}
// how far a shape reaches, to size hit areas and the bounding box (pt)
const extent = (S: any) => (S.kind === 'circle' ? S.r : S.kind === 'poly' ? S.r : Math.hypot(S.hw, S.hh));

// ---------------------------------------------------------------- style options a vertex, edge or plane may carry
const WIDTHS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const SHAPES = ['circle', 'rectangle', 'diamond', 'ellipse', 'regular polygon', 'star', 'isosceles triangle', 'square', 'triangle'];
// TikZ options in a style={…}: what the drawing understands goes into G; the rest is reported
function styleOpts(G: any, list: string[], local: Record<string, string>, unknown: string[]) {
  for (const it of list) {
    const { k, v } = kv(it);
    const A = v == null ? arrowSpec(k) : null;
    if (A) { G.arrow = A; continue; }
    if (WIDTHS[k] != null && v == null) { G.lw = WIDTHS[k]; continue; }
    if (k === 'line width' && v != null) { const w = len(v); if (isFinite(w)) G.lw = w; continue; }
    if (/^(densely |loosely )?dashed$/.test(k)) { G.dash = 'dash'; continue; }
    if (/^(densely |loosely )?dotted$/.test(k)) { G.dash = 'dot'; continue; }
    if (k === 'solid') { G.dash = ''; continue; }
    if (k === 'draw' && v == null) { G.draw = G.draw || 'keep'; continue; }
    if ((k === 'draw' || k === 'color') && v != null) { if (unbrace(v) === 'none') { G.noDraw = true; continue; } const c = colour(v, false, local); if (c) { G.line = c; if (k === 'color') G.text = c; continue; } }
    if (k === 'fill' && v != null) { if (unbrace(v) === 'none') { G.fill = null; G.noFill = true; continue; } const c = colour(v, false, local); if (c) { G.fill = c; continue; } }
    if (k === 'text' && v != null) { const c = colour(v, false, local); if (c) { G.text = c; continue; } }
    if (k === 'opacity' && v != null) { G.opacity = numOr(v, 1); continue; }
    if (k === 'fill opacity' && v != null) { G.fillOpacity = numOr(v, 1); continue; }
    if (k === 'draw opacity' && v != null) { G.drawOpacity = numOr(v, 1); continue; }
    if (k === 'minimum size' && v != null) { const w = len(v); if (isFinite(w)) G.minSize = w; continue; }
    if ((k === 'minimum width' || k === 'minimum height') && v != null) { const w = len(v); if (isFinite(w)) G[k === 'minimum width' ? 'minW' : 'minH'] = w; continue; }
    if (k === 'shape' && v != null && SHAPES.includes(unbrace(v))) { G.shape = unbrace(v); continue; }
    if (SHAPES.includes(k) && v == null) { G.shape = k; continue; }
    if (k === 'regular polygon sides' && v != null) { G.sides = Math.max(3, Math.round(numOr(v, 5))); continue; }
    if (k === 'star points' && v != null) { G.sides = Math.max(3, Math.round(numOr(v, 5))); continue; }
    if (k === 'star point ratio' && v != null) { G.ratio = numOr(v, 1.5); continue; }
    if (k === 'shading' && v != null && ['ball', 'radial', 'axis'].includes(unbrace(v))) { shade(G).kind = unbrace(v); continue; }
    if (k === 'shade' && v == null) { shade(G); continue; }
    if (k === 'shading angle' && v != null) { shade(G).angle = numOr(v, 0); continue; }
    if (/^(ball|inner|outer|top|bottom|middle|left|right) color$/.test(k) && v != null) {
      const c = colour(v, false, local), w = k.split(' ')[0], S0 = shade(G);
      if (!c) { unknown.push(it); continue; }
      if (w === 'ball') { S0.kind = 'ball'; S0.ball = c; }
      else if (w === 'inner' || w === 'outer') { S0.kind = 'radial'; S0[w] = c; }
      else if (w === 'middle') { S0.kind = 'axis'; S0.middle = c; }
      else { S0.kind = 'axis'; S0[w === 'left' ? 'top' : w === 'right' ? 'bottom' : w] = c; S0.middle = mixHex(S0.top, 0.5, S0.bottom); S0.angle = w === 'left' || w === 'right' ? 90 : 0; }
      continue;
    }
    if (k === 'bend left' || k === 'bend right') { const b = numOr(v, 30); G.bend = k === 'bend left' ? b : -b; continue; }
    if (v == null && TD.tikzColor && colour(k, false, local)) { G.line = colour(k, false, local); G.text = G.line; continue; }
    if (/^(inner sep|outer sep|font|align|anchor|transform shape|rounded corners|shorten [<>]|>|sloped|scale)$/.test(k) || /\/\.(style|append style)$/.test(k)) continue;
    unknown.push(it);
  }
  return G;
}
// a shading (TikZ's defaults: ball blue; radial gray to white; axis gray, gray!50!white, white)
function shade(G: any) { return (G.shade = G.shade || { kind: 'axis', ball: '#0000ff', inner: '#808080', outer: '#ffffff', top: '#808080', middle: '#c0c0c0', bottom: '#ffffff', angle: 0 }); }
function mixHex(a: string, t: number, b: string) {
  const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}
// the gradient for a shading, in pgf's shading square (bp, y up) mapped by T (px): the middle 50bp onto the box
function shadeDef(sh: any, T: number[], id: string) {
  const tr = ` gradientUnits="userSpaceOnUse" gradientTransform="matrix(${T.map(r2).join(',')})${sh.kind === 'axis' && sh.angle ? ` rotate(${r2(sh.angle)})` : ''}"`;
  const stop = (o: number, c: string) => `<stop offset="${r2(o)}" stop-color="${c}"/>`;
  if (sh.kind === 'ball') { const b = sh.ball; return `<radialGradient id="${id}" cx="-10" cy="10" fx="-10" fy="10" r="50"${tr}>${stop(0, mixHex(b, 0.15, '#ffffff'))}${stop(0.18, mixHex(b, 0.75, '#ffffff'))}${stop(0.36, mixHex(b, 0.7, '#000000'))}${stop(0.5, mixHex(b, 0.5, '#000000'))}${stop(1, '#000000')}</radialGradient>`; }
  if (sh.kind === 'radial') return `<radialGradient id="${id}" cx="0" cy="0" r="50"${tr}>${stop(0, sh.inner)}${stop(0.5, sh.outer)}${stop(1, sh.outer)}</radialGradient>`;
  return `<linearGradient id="${id}" x1="0" y1="-50" x2="0" y2="50"${tr}>${stop(0, sh.bottom)}${stop(0.25, sh.bottom)}${stop(0.5, sh.middle)}${stop(0.75, sh.top)}${stop(1, sh.top)}</linearGradient>`;
}
// T for a shape whose own frame (pt, y up) is mapped by m and moved to c: its box ±hw × ±hh about (ox, oy)
function shadeT(m: M2, c: V2, hw: number, hh: number, ox = 0, oy = 0) {
  const kx = hw / 25, ky = hh / 25, q = mul(m, [ox, oy]);
  return [m[0] * kx * PT, -m[2] * kx * PT, m[1] * ky * PT, -m[3] * ky * PT, (c[0] + q[0]) * PT, -(c[1] + q[1]) * PT];
}
let shadeN = 0;
// "-latex", "->", "<->", "-{Latex[round]}", "-stealth"
function arrowSpec(k: string) {
  if (!/^[<|]?[^=]*-[^=]*$/.test(k) || /\s/.test(k.replace(/\{.*\}/, ''))) return null;
  const m = /^(.*?)-(.*)$/.exec(k);
  if (!m) return null;
  const side = (x: string) => {
    x = unbrace(x.trim()).replace(/\[.*\]$/, '').trim();
    if (!x || x === '|') return null;
    if (x === '>' || x === '<' || x === 'to') return 'to';
    if (x === 'latex' || x === "latex'") return 'latex';
    if (x === 'Latex' || x === 'triangle' || x === 'Triangle') return 'Latex';
    return /stealth/i.test(x) ? 'stealth' : 'to';
  };
  return { s: side(m[1]), e: side(m[2]) };
}

// ---------------------------------------------------------------- layout
const layout = layoutCache((s: any) => srcKey(s, JSON.stringify(s.files || {})), (s: any) => build(s.src, s.files || {}));

function build(src: any, files: Record<string, string>) {
  const M = parse(src);
  const warnings = M.warnings.slice(), warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const local: Record<string, string> = {};
  // ---- settings, as the \Set… commands leave them (each one starts from tikz-network's defaults: \presetkeys)
  const VS0 = { Shape: 'circle', MinSize: '0.6\\DefaultUnit', LineWidth: '1pt', LineColor: 'black', LineOpacity: '1', FillColor: 'vertexfill', FillOpacity: '1', TextColor: 'black', TextFont: '\\scriptsize', TextRotation: '0', TextOpacity: '1', InnerSep: '2pt', OuterSep: '0pt' };
  const ES0 = { Arrow: '-latex', LineWidth: '1.5pt', Color: 'black!75', Opacity: '1', TextFillColor: 'white', TextFillOpacity: '1', TextFont: '\\scriptsize', TextRotation: '0', TextOpacity: '1', InnerSep: '0pt', OuterSep: '1pt' };
  const PS0 = { LineWidth: '1.5pt', LineColor: 'black', LineOpacity: '1', GridLineWidth: '.5pt', GridColor: 'black', GridOpacity: '.5', FillColor: 'vertexfill', FillOpacity: '.3' };
  const TS0 = { InnerSep: '2pt', OuterSep: '0pt', TextFont: '\\normalsize', TextColor: 'black', TextRotation: '0', TextOpacity: '1' };
  const CS0 = { xAngle: '-12', xLength: '1', yAngle: '37', yLength: '1', zAngle: '90', zLength: '1' };
  const S: any = { VS: { ...VS0 }, ES: { ...ES0 }, PS: { ...PS0 }, TS: { ...TS0 }, CS: { ...CS0 }, LD: -2, DS: 1, unit: CM, inBG: true, PW: '5\\DefaultUnit', PH: '5\\DefaultUnit' };
  let ctx: any = null; // the Layer environment the items are in
  let inPicture = false;
  function setting(it: any) {
    const o = it.o || [], set = (D: any, Dflt: any) => { const r: any = { ...Dflt }; for (const x of o) { const p = kv(x); if (p.k in Dflt && p.v != null) r[p.k] = unbrace(p.v); else warn(`\\${it.cmd} has no key "${p.k}"`); } return r; };
    if (it.cmd === 'SetVertexStyle') S.VS = set(S.VS, VS0);
    else if (it.cmd === 'SetEdgeStyle') S.ES = set(S.ES, ES0);
    else if (it.cmd === 'SetPlaneStyle') S.PS = set(S.PS, PS0);
    else if (it.cmd === 'SetTextStyle') S.TS = set(S.TS, TS0);
    else if (it.cmd === 'SetLayerDistance') S.LD = numOr(it.arg, -2);
    else if (it.cmd === 'SetDistanceScale') S.DS = numOr(it.arg, 1);
    else if (it.cmd === 'SetDefaultUnit') { const u = len('1' + String(it.arg).trim()); if (isFinite(u) && u > 0) S.unit = u; }
    else if (it.cmd === 'SetPlaneWidth') S.PW = it.arg;
    else if (it.cmd === 'SetPlaneHeight') S.PH = it.arg;
    else if (it.cmd === 'EdgesInBG') S.inBG = true;
    else if (it.cmd === 'EdgesNotInBG') S.inBG = false;
    else if (it.cmd === 'SetCoordinates') { if (inPicture) warn('\\SetCoordinates takes effect only before the picture begins: write it above \\begin{tikzpicture}'); else S.CS = set(S.CS, CS0); }
  }
  // colours the picture defines for itself
  function rawColour(t: string) {
    const m = /^\\definecolor\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/.exec(t);
    if (m) {
      const model = m[2].trim(), v = m[3].trim();
      const c = model === 'HTML' ? '#' + v.toLowerCase() : model === 'RGB' ? colour(v, true, local) : model === 'rgb' ? colour(v.split(',').map((x: string) => String(parseFloat(x) * 255)).join(','), true, local) : null;
      if (c) local[m[1].trim()] = c;
      return true;
    }
    const cl = /^\\colorlet\s*\{([^}]*)\}\s*\{([^}]*)\}/.exec(t);
    if (cl) { const c = colour(cl[2], false, local); if (c) local[cl[1].trim()] = c; return true; }
    return false;
  }
  for (const it of M.pre || []) { if (it.k === 'set') setting(it); else if (it.k === 'raw') rawColour(it.s); }
  inPicture = true;
  // ---- the picture's options: multilayer, scale, x/y/z
  let X: V2 = [CM, 0], Y: V2 = [0, CM], Z: V2 = [-0.385 * CM, -0.385 * CM], k = 1, shapeT = false, edge3d = false;
  for (const it of opts(M.env || '')) {
    const { k: key, v } = kv(it);
    if (key === 'multilayer') {
      // multilayer 3d (as \SetCoordinates leaves it): y along (xAngle: xLength), x along (yAngle: yLength), z along
      // (zAngle: zLength), each length in \DefaultUnit; 2d: y along 0°, x along 90°, no z
      const C = S.CS, n = (q: string) => numOr(C[q], 0);
      if (v != null && unbrace(v) === '3d') { Y = polar(n('xAngle'), n('xLength') * S.unit); X = polar(n('yAngle'), n('yLength') * S.unit); Z = polar(n('zAngle'), n('zLength') * S.unit); edge3d = true; }
      else { X = polar(90, CM); Y = polar(0, CM); Z = [0, 0]; edge3d = false; }
      shapeT = true; continue;
    }
    if (key === 'scale' && v != null) { k = numOr(v, 1); continue; }
    if (key === 'transform shape') { shapeT = true; continue; }
    if ((key === 'x' || key === 'y' || key === 'z') && v != null) {
      const s = unbrace(v), m = /^\(\s*(-?[\d.]+)\s*:\s*([^)]+)\)$/.exec(s), m2 = /^\(\s*([^,]+),\s*([^)]+)\)$/.exec(s);
      const vec: V2 | null = m ? polar(parseFloat(m[1]), len(m[2], CM)) : m2 ? [len(m2[1], CM), len(m2[2], CM)] : isFinite(len(s, CM)) ? (key === 'x' ? [len(s, CM), 0] : key === 'y' ? [0, len(s, CM)] : [-len(s, CM) * 0.385 / 1, -len(s, CM) * 0.385]) : null;
      if (vec) { if (key === 'x') X = vec; else if (key === 'y') Y = vec; else Z = vec; continue; }
    }
    if (/^(every node\/\.(append )?style|font|>|thick|semithick|thin)$/.test(key)) continue;
    warn(`The picture option "${it}" isn't drawn here (it is kept in the code)`);
  }
  // a canvas (canvas is yx plane at z): its 2×2 part maps (u, v) pt to the page, as the y and x vectors per cm
  const C2: M2 = [Y[0] / CM, X[0] / CM, Y[1] / CM, X[1] / CM];
  const K2: M2 = [k, 0, 0, k];
  const canvas = (z: number, p: V2): V2 => { const q = mul(C2, p); return [k * (q[0] + z * Z[0]), k * (q[1] + z * Z[1])]; };
  const EM: M2 = edge3d ? C2 : I2; // the edges' canvas (multilayer=3d: canvas is yx plane at z=0)
  const nodes = new Map<string, any>(), edges: any[] = [], texts: any[] = [], planes: any[] = [];
  const bg: any[] = [], fg: any[] = []; // what is painted, on the background layer and on the main one, in order
  // each thing painted carries the layer (z) it lies on, so an editor can bring one layer forward and fade the rest
  // (draw's ctx.focus): a vertex's, a text's, a plane's, a Layer's TikZ; an edge both its ends' [za, zb]; null for none
  let paintZ: number | null | (number | null)[] = null;
  for (const a of [bg, fg]) { const push = a.push.bind(a); (a as any).push = (...xs: any[]) => push(...xs.map((x) => (x && typeof x === 'object' && !x.clip ? Object.assign(x, { z: paintZ }) : x))); }
  const fileUse: Record<string, any> = {};
  let lastVertices: string | null = null; // datatool's `vertices` database: the last vertex file read

  // ---- a vertex: its options as \Vertex reads them (defaults, then its own)
  function vertex(id: string, o: string[], src: any) {
    if (nodes.has(id)) warn(`Two vertices are called "${id}"`);
    const VS = S.VS, rgb = flag(o, 'RGB');
    const g = (key: string) => getOpt(o, key);
    const x = numOr(g('x'), 0), y = numOr(g('y'), 0), layer = g('layer');
    const lay = layer != null && layer !== '' ? (numOr(layer, 1) - 1) * S.LD : ctx ? ctx.z : null;
    paintZ = lay;
    const p: V2 = [x * S.DS * S.unit, y * S.DS * S.unit];
    const c = lay != null ? canvas(lay, p) : ([k * p[0], k * p[1]] as V2);
    const m: M2 = shapeT && lay != null ? C2 : shapeT && k !== 1 ? K2 : I2;
    const G: any = { shape: g('shape') || VS.Shape, minSize: g('size') != null && g('size') !== '' ? numOr(g('size'), 0.6) * S.unit : len(VS.MinSize, 1, S.unit), lw: len(VS.LineWidth), line: colour(VS.LineColor, false, local) ?? '#000000',
      fill: colour(g('color') || VS.FillColor, rgb && !!g('color'), local), opacity: 1, fillOpacity: numOr(g('opacity') || VS.FillOpacity, 1), drawOpacity: numOr(VS.LineOpacity, 1), dash: '', sides: 5, ratio: 1.5 };
    if (G.fill === undefined) { warn(`The colour "${g('color') || VS.FillColor}" isn't known here: drawn in vertexfill`); G.fill = VERTEXFILL; }
    const unknown: string[] = [];
    if (g('style')) styleOpts(G, opts(g('style')!), local, unknown);
    for (const u of unknown) warn(`The vertex style "${u}" isn't drawn here (it is kept in the code)`);
    if (!SHAPES.includes(G.shape)) { warn(`The vertex shape "${G.shape}" is drawn as a circle here`); G.shape = 'circle'; }
    const sh = shapeOf(G.shape, G.minSize, len(VS.InnerSep), G.sides, G.ratio, G.minW, G.minH), pseudo = flag(o, 'Pseudo');
    const n = { id, src, x: c[0], y: c[1], m, sh, G, pseudo, layer: lay, canvas: lay != null, label: null as any };
    nodes.set(id, n);
    const box = (sh.hw != null ? [sh.hw, sh.hh] : [sh.r, sh.r]) as number[];
    if (!pseudo) fg.push({ path: outline(sh, m, c), fill: G.noFill ? null : G.fill, fop: G.fillOpacity * G.opacity * (ctx && ctx.opacity != null ? ctx.opacity : 1), stroke: G.noDraw ? null : G.line, sop: G.drawOpacity * G.opacity, lw: G.lw, dash: G.dash, node: id, shade: G.shade, shadeT: G.shade ? shadeT(m, c, box[0], box[1]) : null });
    // its label
    const noLabel = flag(o, 'NoLabel'), idLabel = flag(o, 'IdAsLabel');
    let t = noLabel ? '' : idLabel ? id : g('label') || '';
    if (t && flag(o, 'Math')) t = `$${t}$`;
    if (t && !pseudo) {
      const size = fontPt(g('fontsize') || VS.TextFont, 7) * PT, txt = lines(shown(t)), st = { size, font: 'default' }, b = TD.textBox(txt, st);
      const scale = numOr(g('fontscale'), 1), pos = g('position') || 'center', dist = len(g('distance') || '0');
      const tc = colour(g('fontcolor') || VS.TextColor, rgb && !!g('fontcolor'), local) || '#000000';
      const hw = b.w / 2 - 1 + LABEL_SEP, hh = halfH(txt, b, size) + LABEL_SEP;
      // in the vertex's own frame (px, y up): where the label's anchor goes, and its centre from there
      let at: V2 = [0, 0], off: V2 = [0, 0];
      if (pos !== 'center') {
        const deg = DIR_DEG[pos] ?? parseFloat(pos);
        if (isFinite(deg)) {
          const u = unit(deg), r = reach(sh, u) * PT + dist * PT;
          at = [u[0] * r, u[1] * r];
          // the label's anchor: the side facing the vertex (TikZ's auto anchor: an axis only within 0.05pt of 1pt)
          const sx = Math.abs(u[0]) > 0.05 ? Math.sign(u[0]) : 0, sy = Math.abs(u[1]) > 0.05 ? Math.sign(u[1]) : 0;
          off = [sx * hw * scale, sy * hh * scale];
        } else warn(`The label position "${pos}" isn't drawn here`);
      }
      const lc: V2 = [at[0] + off[0], at[1] + off[1]];
      const cpx = mul(m, lc); // the label's centre, mapped with the vertex
      const L = { t: txt, st, color: tc, x: c[0] * PT + cpx[0], y: -(c[1] * PT + cpx[1]), b, scale, m, rot: numOr(VS.TextRotation, 0), op: numOr(VS.TextOpacity, 1), lift: lift(txt, b, size), hw: hw * scale, hh: hh * scale };
      n.label = L;
      fg.push({ text: L });
    }
  }
  // ---- an edge
  function edge(a: string, b: string, o: string[], src: any) {
    const A = nodes.get(a), B = nodes.get(b);
    if (!A || !B) { warn(`"${!A ? a : b}" is used in an edge but is not a vertex`); return; }
    paintZ = [A.layer ?? null, B.layer ?? null];
    const ES = S.ES, rgb = flag(o, 'RGB'), g = (key: string) => getOpt(o, key);
    const G: any = { arrow: arrowSpec(ES.Arrow) || { s: null, e: 'latex' }, lw: len(ES.LineWidth), line: colour(ES.Color, false, local) || '#404040', opacity: numOr(ES.Opacity, 1), dash: '' };
    if (g('lw')) { const w = len(g('lw')); if (isFinite(w)) G.lw = w; }
    if (g('opacity')) G.opacity = numOr(g('opacity'), 1);
    if (g('color')) { const c = colour(g('color'), rgb, local); if (c) G.line = c; else warn(`The colour "${g('color')}" isn't known here`); }
    if (!flag(o, 'Direct')) G.arrow = { s: null, e: null };
    const unknown: string[] = [];
    if (g('style')) styleOpts(G, opts(g('style')!), local, unknown);
    for (const u of unknown) warn(`The edge style "${u}" isn't drawn here (it is kept in the code)`);
    const inBG = !(flag(o, 'NotInBG') || (!S.inBG && getOpt(o, 'NotInBG') !== 'false'));
    const layerOut = inBG ? bg : fg;
    // in the edges' frame (pt): the ends' centres, and each end's shape there
    const Li = inv(EM), toL = (n: any): V2 => mul(Li, [n.x, n.y]);
    const shapeIn = (n: any) => (same(n.m, EM) ? n.sh : { kind: 'circle', r: extent(n.sh) / Math.sqrt(Math.abs(EM[0] * EM[3] - EM[1] * EM[2]) || 1) });
    const pa = toL(A), pb = toL(B), sa = shapeIn(A), sb = shapeIn(B);
    const loop = a === b, path = g('path');
    let segs: V2[][] = [], bez: V2[] | null = null;
    const border = (p: V2, S0: any, deg: number): V2 => { const u = unit(deg), r = reach(S0, u); return [p[0] + u[0] * r, p[1] + u[1] * r]; };
    if (loop) {
      const shape = numOr(g('loopshape'), 90), lp = numOr(g('loopposition'), 0), out = shape / 2 + lp, inn = -shape / 2 + lp;
      const d = len(g('loopsize') || '1\\DefaultUnit', 1, S.unit), p0 = border(pa, sa, out), p3 = border(pa, sa, inn);
      bez = [p0, [p0[0] + unit(out)[0] * d, p0[1] + unit(out)[1] * d], [p3[0] + unit(inn)[0] * d, p3[1] + unit(inn)[1] * d], p3];
    } else if (path) {
      // \draw (a) -- (p1) -- … -- (b): each step from border to border where it meets a vertex
      // a step is a vertex (met at its border) or a coordinate {x,y} on the edges' canvas
      const pts = [a, ...opts(path), b].map((nm) => {
        const id = unbrace(nm.replace(/^\(|\)$/g, '').trim()), n = nodes.get(id);
        if (n) return { n, p: toL(n), S: shapeIn(n) };
        const xy = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(id);
        if (xy) { const u = parseFloat(xy[1]), v = parseFloat(xy[2]), pg: V2 = edge3d ? mul(C2, [u * CM, v * CM]) : [u * X[0] + v * Y[0], u * X[1] + v * Y[1]]; return { n: null, p: mul(Li, [k * pg[0], k * pg[1]]), S: null }; }
        warn(`"${nm}" is used in an edge's path but is neither a vertex nor a coordinate`);
        return null;
      }).filter(Boolean) as any[];
      for (let i = 1; i < pts.length; i++) {
        const A0 = pts[i - 1], B0 = pts[i];
        if (A0.n && A0.n === B0.n) continue; // (A) -- (A): nothing to draw
        const P = A0.p, Q = B0.p, deg = (Math.atan2(Q[1] - P[1], Q[0] - P[0]) * 180) / Math.PI;
        segs.push([A0.S ? border(P, A0.S, deg) : P, B0.S ? border(Q, B0.S, deg + 180) : Q]);
      }
    } else {
      const bend = numOr(g('bend'), 0) + (G.bend || 0), base = (Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI;
      if (!bend) segs = [[border(pa, sa, base), border(pb, sb, base + 180)]];
      else {
        const out = base + bend, inn = base + 180 - bend, p0 = border(pa, sa, out), p3 = border(pb, sb, inn);
        const d = 0.3915 * tikzLen(p3[0] - p0[0], p3[1] - p0[1]);
        bez = [p0, [p0[0] + unit(out)[0] * d, p0[1] + unit(out)[1] * d], [p3[0] + unit(inn)[0] * d, p3[1] + unit(inn)[1] * d], p3];
      }
    }
    // to the page (px, y down)
    const P = (p: V2) => { const q = mul(EM, p); return [q[0] * PT, -q[1] * PT] as [number, number]; };
    const samples: [number, number][] = bez ? Array.from({ length: 49 }, (_, i) => P(bezAt(bez, i / 48) as V2)) : segs.flatMap((s) => [P(s[0]), P(s[1])]);
    const strokes: any[] = [];
    const lines2 = bez ? [samples] : segs.map((s) => [P(s[0]), P(s[1])]);
    lines2.forEach((pts, si) => strokes.push(arrowed(pts, G, si === 0, si === lines2.length - 1)));
    for (const s of strokes) layerOut.push({ edge: s, G, item: src });
    const e: any = { src, a, b, loop, P: polyline(samples), label: null };
    // its label: a white circle at pos=distance, beside the edge by its position
    const lt = g('label');
    if (lt && !path) {
      const ts = flag(o, 'Math') ? `$${lt}$` : lt, size = fontPt(g('fontsize') || ES.TextFont, 7) * PT, txt = lines(shown(ts)), st = { size, font: 'default' }, bx = TD.textBox(txt, st);
      const t = numOr(g('distance'), 0.5), scale = numOr(g('fontscale'), 1);
      const q: V2 = bez ? (bezAt(bez, t) as V2) : [segs[0][0][0] + (segs[0][1][0] - segs[0][0][0]) * t, segs[0][0][1] + (segs[0][1][1] - segs[0][0][1]) * t];
      const r = Math.hypot(bx.w / 2 - 1, halfH(txt, bx, size)) * scale / PT + len(ES.InnerSep) * scale, out = r + len(ES.OuterSep) * scale;
      // position: above, below left … (the label's border on the point), or above=2mm: moved that much further
      const pos = g('position');
      let off: V2 = [0, 0];
      if (pos) {
        const pk = kv(unbrace(pos)), deg = DIR_DEG[pk.k];
        if (deg != null) { const u = unit(deg), more = pk.v != null ? len(unbrace(pk.v), CM, S.unit) : 0; off = [u[0] * (out + (isFinite(more) ? more : 0)), u[1] * (out + (isFinite(more) ? more : 0))]; } else warn(`The edge label position "${pos}" isn't drawn here`);
      }
      const cL: V2 = [q[0] + off[0], q[1] + off[1]], c = P(cL), lm = shapeT ? EM : I2;
      const fc = g('fontcolor') ? colour(g('fontcolor'), rgb, local) : null;
      const L = { t: txt, st, color: fc || G.line, x: c[0], y: c[1], b: bx, scale, m: lm, r: r * PT, fill: colour(ES.TextFillColor, false, local) || '#ffffff', fop: numOr(ES.TextFillOpacity, 1), op: numOr(ES.TextOpacity, 1) * (g('opacity') ? numOr(g('opacity'), 1) : 1), lift: lift(txt, bx, size), rot: numOr(ES.TextRotation, 0) };
      e.label = L;
      layerOut.push({ elabel: L });
    }
    edges.push(e);
  }
  // a line with its tips (pts in px, y down): the line stops where each tip begins
  function arrowed(pts: [number, number][], G: any, first: boolean, last: boolean) {
    const P0 = polyline(pts), L = P0.len, lw = G.lw * PT, tips: string[] = [];
    let s0 = 0, s1 = L;
    const tip = (kind: string, atEnd: boolean) => {
      const along = (s: number) => { const q = P0.pts, cum = P0.cum; s = Math.max(0, Math.min(L, s)); let i = 1; while (i < q.length - 1 && cum[i] < s) i++; const a = q[i - 1], b = q[i], sg = cum[i] - cum[i - 1] || 1, tt = (s - cum[i - 1]) / sg; return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]; };
      const end = atEnd ? s1 : s0;
      if (kind === 'latex') {
        // the old latex tip (pgflibraryarrows): a = 0.28pt + 0.3·line width; from −a to 9a, the line ends at 0
        const a = (0.28 + 0.3 * G.lw) * PT, e = along(end), o = along(atEnd ? end - 9 * a : end + 9 * a);
        let ux = e[0] - o[0], uy = e[1] - o[1]; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
        const nx = -uy, ny = ux, X2 = (u: number, v: number) => `${r2(o[0] + ux * u + nx * v)},${r2(o[1] + uy * u + ny * v)}`;
        tips.push(`M${X2(9 * a, 0)}C${X2(6.3333 * a, 0.5 * a)} ${X2(2 * a, 2 * a)} ${X2(-a, 3.75 * a)}L${X2(-a, -3.75 * a)}C${X2(2 * a, -2 * a)} ${X2(6.3333 * a, -0.5 * a)} ${X2(9 * a, 0)}Z`);
        if (atEnd) s1 = end - 9 * a; else s0 = end + 9 * a;
        return;
      }
      // Latex / stealth / to (arrows.meta sizes): a filled head, or the to tip's two strokes
      const l = kind === 'to' ? 1.6 * PT + 2.2 * lw : 3 * PT + 4.5 * lw, w = kind === 'to' ? l : 0.75 * l, inset = kind === 'stealth' ? 0.325 * l : 0;
      const e = along(end), o = along(atEnd ? end - l : end + l);
      let ux = e[0] - o[0], uy = e[1] - o[1]; const ll = Math.hypot(ux, uy) || 1; ux /= ll; uy /= ll;
      const nx = -uy, ny = ux, X2 = (u: number, v: number) => `${r2(o[0] + ux * u + nx * v)},${r2(o[1] + uy * u + ny * v)}`;
      if (kind === 'to') { tips.push(`S${X2(0, w / 2)}Q${X2(l * 0.65, w * 0.1)} ${X2(l, 0)}Q${X2(l * 0.65, -w * 0.1)} ${X2(0, -w / 2)}`); if (atEnd) s1 = end - lw / 2; else s0 = end + lw / 2; return; }
      tips.push(`M${X2(l, 0)}L${X2(0, w / 2)}L${X2(inset, 0)}L${X2(0, -w / 2)}Z`);
      if (atEnd) s1 = end - (l - inset); else s0 = end + (l - inset);
    };
    if (last && G.arrow.e) tip(G.arrow.e, true);
    if (first && G.arrow.s) tip(G.arrow.s, false);
    // the line between, cut to [s0, s1]
    const cutPts: [number, number][] = [];
    const at = (s: number) => { const q = P0.pts, cum = P0.cum; let i = 1; while (i < q.length - 1 && cum[i] < s) i++; const a = q[i - 1], b = q[i], sg = cum[i] - cum[i - 1] || 1, tt = (s - cum[i - 1]) / sg; return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt] as [number, number]; };
    if (s1 > s0) { cutPts.push(at(s0)); for (let i = 1; i < P0.pts.length - 1; i++) if (P0.cum[i] > s0 && P0.cum[i] < s1) cutPts.push(P0.pts[i]); cutPts.push(at(s1)); }
    return { d: cutPts.length > 1 ? ptsD(cutPts) : '', tips, lw };
  }
  // ---- text
  function text(o: string[], tx: string, src: any) {
    const TS = S.TS, g = (key: string) => getOpt(o, key), rgb = flag(o, 'RGB');
    const x = numOr(g('x'), 0) * S.DS, y = numOr(g('y'), 0) * S.DS, layer = g('layer');
    const lay = layer != null && layer !== '' ? (numOr(layer, 1) - 1) * S.LD : ctx ? ctx.z : null;
    paintZ = lay;
    // \Text's place has no unit: the picture's x and y vectors (in a layer, its canvas)
    const c: V2 = lay != null ? canvas(lay, [x * CM, y * CM]) : [k * (x * X[0] + y * Y[0]), k * (x * X[1] + y * Y[1])];
    const m: M2 = shapeT && lay != null ? C2 : I2;
    const size = fontPt(g('fontsize') || TS.TextFont, 10) * PT, w = g('width') ? len(g('width')) * PT : 0;
    const t = lines(shown(tx)), st: any = { size, font: 'default', ...(w > 0 ? { tw: w, align: 'justify' } : {}) }, b = TD.textBox(t, st);
    const sep = len(TS.InnerSep) * PT, hw = b.w / 2 - (w > 0 ? 0 : 1) + sep, hh = halfH(t, b, size) + sep;
    // its style: a box drawn or filled (rectangle or circle), shaded, see-through
    const G: any = { line: null, fill: null, lw: 0.4, opacity: 1, fillOpacity: 1, drawOpacity: 1, dash: '' }, unknown: string[] = [];
    if (g('style')) styleOpts(G, opts(g('style')!), local, unknown);
    for (const u of unknown) warn(`The text style "${u}" isn't drawn here (it is kept in the code)`);
    const circ = G.shape === 'circle', R = Math.hypot(hw, hh);
    // where its anchor goes: the point, moved by position=distance (above right=d: d along the diagonal)
    const pos = g('position'), dist = len(g('distance') || '0\\DefaultUnit', 1, S.unit) * PT;
    let shift: V2 = [0, 0], anchorDeg: number | null = null;
    if (pos && DIR_DEG[pos] != null) { const u = unit(DIR_DEG[pos]); shift = [u[0] * dist, u[1] * dist]; anchorDeg = DIR_DEG[pos] + 180; }
    if (g('anchor') && DIR_DEG[g('anchor')!] != null) anchorDeg = DIR_DEG[g('anchor')!];
    let off: V2 = [0, 0];
    if (anchorDeg != null) {
      const u = unit(anchorDeg), sx = Math.abs(u[0]) > 0.05 ? Math.sign(u[0]) : 0, sy = Math.abs(u[1]) > 0.05 ? Math.sign(u[1]) : 0;
      off = circ ? [-u[0] * R, -u[1] * R] : [-sx * hw, -sy * hh];
    }
    const lc = mul(m, [shift[0] + off[0], shift[1] + off[1]]);
    const color = colour(g('color') || TS.TextColor, rgb && !!g('color'), local) || '#000000';
    const boxed = G.draw || G.line || G.fill || G.shade;
    const box = boxed ? { circ, hw: circ ? R : hw, hh: circ ? R : hh, fill: G.noFill ? null : G.fill, fop: G.fillOpacity, stroke: G.noDraw || !(G.draw || G.line) ? null : G.line || color, sop: G.drawOpacity, lw: G.lw, dash: G.dash, shade: G.shade } : null;
    const L = { t, st, color: G.text || color, x: c[0] * PT + lc[0], y: -(c[1] * PT + lc[1]), b, scale: 1, m, rot: numOr(g('rotation') || TS.TextRotation, 0), op: numOr(g('opacity') || TS.TextOpacity, 1), gop: G.opacity, lift: lift(t, b, size), hw: box ? box.hw : hw, hh: box ? box.hh : hh, box };
    texts.push({ src, label: L, layer: lay });
    fg.push({ text: L });
  }
  // ---- a plane
  function plane(o: string[], src: any) {
    const PS = S.PS, g = (key: string) => getOpt(o, key), rgb = flag(o, 'RGB');
    const z = (numOr(g('layer') || '1', 1) - 1) * S.LD;
    paintZ = z;
    const lenU = (v: any) => len(String(v).replace(/\*.*$/, ''), CM, S.unit) * S.DS; // unitless: cm (the canvas's unit)
    const x0 = lenU(g('x') || '0'), y0 = lenU(g('y') || '0'), w = lenU(g('width') || S.PW), h = lenU(g('height') || S.PH);
    const corner = (u: number, v: number) => canvas(z, [u, v]);
    const quad = [corner(x0, y0), corner(x0 + w, y0), corner(x0 + w, y0 + h), corner(x0, y0 + h)];
    const d = quad.map((p, i) => `${i ? 'L' : 'M'}${pxs(p)}`).join('') + 'Z';
    const out = flag(o, 'InBG') ? bg : fg, image = g('image');
    const fillC = colour(g('color') || PS.FillColor, rgb && !!g('color'), local) ?? VERTEXFILL;
    const noFill = flag(o, 'NoFill') || (!!image && !flag(o, 'ImageAndFill'));
    if (!noFill) out.push({ path: d, fill: fillC, fop: numOr(g('opacity') || PS.FillOpacity, 0.3), stroke: null, lw: 0 });
    if (image) {
      // \includegraphics[width=w\DefaultUnit, height=h\DefaultUnit] in a node at the plane's centre (transformed
      // with the canvas under multilayer, upright otherwise)
      const href = files[image] ?? files[image + '.png'] ?? files[image + '.jpg'] ?? files[image + '.pdf'];
      const wi = numOr(g('width') || String(S.PW).replace(/\\DefaultUnit/, ''), 5) * S.unit, hi = numOr(g('height') || String(S.PH).replace(/\\DefaultUnit/, ''), 5) * S.unit;
      const cx = numOr(g('x'), 0) * CM + wi / 2 * (CM / S.unit), cy = numOr(g('y'), 0) * CM + hi / 2 * (CM / S.unit), c0 = canvas(z, [cx, cy]), mi: M2 = shapeT ? [k * C2[0], k * C2[1], k * C2[2], k * C2[3]] : I2;
      const qd = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as V2[]).map(([a, b]) => { const q = mul(mi, [a * wi / 2, b * hi / 2]); return [c0[0] + q[0], c0[1] + q[1]] as V2; });
      const qpath = qd.map((p, i) => `${i ? 'L' : 'M'}${pxs(p)}`).join('') + 'Z';
      if (href && /^data:image\/(png|jpe?g|gif|svg)/.test(href)) out.push({ image: { href, w: wi * PT, h: hi * PT, m: mi, x: c0[0] * PT, y: -c0[1] * PT, op: g('opacity') ? numOr(g('opacity'), 1) : 1, d: qpath } });
      else { out.push({ path: qpath, fill: '#d9d9d9', fop: 0.5, stroke: null, lw: 0 }); warn(href ? `The picture "${image}" is a PDF: drawn here as a grey box (it is kept in the code)` : `The picture "${image}" isn't in this block: add it (Data files) to draw it`); }
    }
    const grid = g('grid');
    if (grid) {
      const step = lenU(grid);
      if (step > 0) {
        let gd = '';
        for (let u = Math.ceil(x0 / step - 1e-9) * step; u <= x0 + w + 1e-9; u += step) gd += `M${pxs(corner(u, y0))}L${pxs(corner(u, y0 + h))}`;
        for (let v = Math.ceil(y0 / step - 1e-9) * step; v <= y0 + h + 1e-9; v += step) gd += `M${pxs(corner(x0, v))}L${pxs(corner(x0 + w, v))}`;
        out.push({ path: gd, fill: null, stroke: colour(PS.GridColor, false, local) || '#000000', sop: numOr(PS.GridOpacity, 0.5), lw: len(PS.GridLineWidth) });
      }
    }
    if (!flag(o, 'NoBorder')) {
      const G: any = { lw: len(PS.LineWidth), line: colour(PS.LineColor, false, local) || '#000000', drawOpacity: numOr(PS.LineOpacity, 1), dash: '' }, unknown: string[] = [];
      if (g('style')) styleOpts(G, opts(g('style')!), local, unknown);
      for (const u of unknown) warn(`The plane style "${u}" isn't drawn here (it is kept in the code)`);
      const ctr: V2 = [x0 + w / 2, y0 + h / 2], kC: M2 = [k * C2[0], k * C2[1], k * C2[2], k * C2[3]];
      out.push({ path: d, fill: null, stroke: G.noDraw ? null : G.line, sop: G.drawOpacity, lw: G.lw, dash: G.dash, shade: G.shade, shadeT: G.shade ? shadeT(kC, canvas(z, [0, 0]), w / 2, h / 2, ctr[0], ctr[1]) : null });
    }
    planes.push({ src, pts: quad.map(toPx), layer: z });
  }
  // ---- \Vertices and \Edges: their rows, as tikz-network builds each \Vertex[Network] and \Edge[Network]
  function fileOf(name: string) {
    const text = files[name];
    if (text == null) { warn(`The data file "${name}" isn't in this block: load it (Data files) to draw its rows`); return null; }
    return (fileUse[name] = fileUse[name] || csv(text));
  }
  function vertices(o: string[], file: string, item: number, pseudoNoLabel = false) {
    const T = fileOf(file);
    lastVertices = file;
    if (!T) return;
    if (T.head.indexOf('id') < 0) { warn(`The data file "${file}" has no id column`); return; }
    const want = getOpt(o, 'layer');
    T.rows.forEach((r: string[], ri: number) => {
      const { o: ro, rgb } = rowOpts(T, r, ['id']);
      const add: string[] = [];
      for (const f of ['NoLabel', 'Pseudo', 'IdAsLabel', 'Math']) if (flag(o, f) || (pseudoNoLabel && (f === 'NoLabel' || f === 'Pseudo'))) add.push(f);
      if (flag(o, 'RGB') && rgb.length === 3 && rgb.every((c: string) => c.trim() !== '')) add.push('RGB', `color={${rgb.join(',')}}`);
      for (const f of ['opacity', 'size', 'shape', 'color', 'style']) { const v = getOpt(o, f); if (v) add.push(`${f}=${val(v)}`); }
      if (want && cellOf(T, r, 'layer') !== want) return;
      vertex(cellOf(T, r, 'id'), [...ro, ...add], pseudoNoLabel ? null : { item, file, row: ri });
    });
  }
  function edgesFrom(o: string[], file: string, item: number) {
    const T = fileOf(file);
    if (!T) return;
    if (T.head.indexOf('u') < 0 || T.head.indexOf('v') < 0) { warn(`The data file "${file}" needs u and v columns`); return; }
    const want = getOpt(o, 'layer'), vfile = getOpt(o, 'vertices');
    let uL: string | null = null, vL: string | null = null, layerOf: Map<string, string> | null = null;
    if (want) {
      const ls = want.split(',').map((x) => x.trim()); uL = ls[0]; vL = ls[1] ?? ls[0];
      if (vfile) vertices([], vfile, item, true);
      const VT = (vfile || lastVertices) && fileOf((vfile || lastVertices)!);
      layerOf = new Map(VT ? VT.rows.map((r: string[]) => [cellOf(VT, r, 'id'), cellOf(VT, r, 'layer')]) : []);
    }
    T.rows.forEach((r: string[], ri: number) => {
      const { o: ro, rgb } = rowOpts(T, r, ['u', 'v']), u = cellOf(T, r, 'u'), v = cellOf(T, r, 'v');
      const add: string[] = [];
      if (flag(o, 'NoLabel')) add.push('label={}');
      for (const f of ['Direct', 'Math', 'NotInBG']) if (flag(o, f)) add.push(f);
      if (flag(o, 'RGB') && rgb.length === 3 && rgb.every((c: string) => c.trim() !== '')) add.push('RGB', `color={${rgb.join(',')}}`);
      for (const f of ['style', 'lw', 'color', 'opacity']) { const x = getOpt(o, f); if (x) add.push(`${f}=${val(x)}`); }
      if (layerOf) {
        const lu = layerOf.get(u), lv = layerOf.get(v);
        const ok = uL === vL ? lu === uL && lv === vL : (lu === uL && lv === vL) || (lu === vL && lv === uL);
        if (!ok) return;
      }
      edge(u, v, [...ro, ...add], { item, file, row: ri });
    });
  }

  // ---- TikZ the picture draws itself (\draw, \node, \fill … ; in a Layer, on its canvas): read by the importer and
  // drawn as those objects. \clip … rectangle … clips what comes after.
  function raw(t: string, i: number) {
    if (!t || rawColour(t) || /^\\tikzset\b/.test(t)) return;
    paintZ = ctx ? ctx.z : null;
    // the frame: TikZ's (u, v) in cm → the page; in a Layer its canvas, else the picture's x and y
    const A: V2 = ctx ? Y : X, B: V2 = ctx ? X : Y, o: V2 = ctx ? [ctx.z * Z[0], ctx.z * Z[1]] : [0, 0];
    const T = [k * PT * A[0] / PX, -k * PT * A[1] / PX, -k * PT * B[0] / PX, k * PT * B[1] / PX, k * PT * o[0], -k * PT * o[1]];
    const cl = /^\\clip\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*rectangle\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*;?$/.exec(t);
    if (cl) {
      const [u0, v0, u1, v1] = cl.slice(1).map(Number), P = (u: number, v: number) => `${r2(T[0] * u * PX - T[2] * v * PX + T[4])},${r2(T[1] * u * PX - T[3] * v * PX + T[5])}`;
      fg.push({ clip: `M${P(u0, v0)}L${P(u1, v0)}L${P(u1, v1)}L${P(u0, v1)}Z` });
      return;
    }
    let shapes: any[] = [];
    try { shapes = TD.importLatex ? TD.importLatex(`\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`).blocks.flatMap((b: any) => b.shapes || []).filter((q: any) => !(q.type === 'tikz' && q.kind === 'defs')) : []; } catch { shapes = []; }
    const drawn = shapes.filter((q: any) => q.type !== 'tikz' && TD.TYPES[q.type]);
    if (drawn.length < shapes.length || !drawn.length) warn(`"${t.length > 40 ? t.slice(0, 40) + '…' : t}" isn't drawn here (it is kept in the code)`);
    if (!drawn.length) return;
    fg.push({ shapes: drawn, T, op: ctx && ctx.opacity != null ? ctx.opacity : null, item: i });
  }
  // ---- the items in order
  M.items.forEach((it: any, i: number) => {
    const src = { item: i };
    if (it.k === 'v') vertex(it.id, it.o, src);
    else if (it.k === 'e') edge(it.a, it.b, it.o, src);
    else if (it.k === 't') text(it.o, it.text, src);
    else if (it.k === 'p') plane(it.o, src);
    else if (it.k === 'vs') vertices(it.o, it.file, i);
    else if (it.k === 'es') edgesFrom(it.o, it.file, i);
    else if (it.k === 'layer') {
      const z = getOpt(it.o, 'z'), op = getOpt(it.o, 'opacity');
      ctx = { z: z != null && z !== '' ? numOr(z, 0) : (numOr(getOpt(it.o, 'layer') || '1', 1) - 1) * S.LD, opacity: op != null && op !== '' ? numOr(op, 1) : null };
    } else if (it.k === 'endlayer') ctx = null;
    else if (it.k === 'set') setting(it);
    else if (it.k === 'raw') raw(it.s, i);
  });
  // ---- bounding box (px, y down)
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: number, b: number, c: number, d: number) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  const pathExt = (d: string, h: number) => { for (const m of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1] - h, +m[2] - h, +m[1] + h, +m[2] + h); };
  for (const p of [...bg, ...fg]) {
    if (p.path) pathExt(p.path, (p.lw || 0) * PT / 2);
    if (p.edge) { pathExt(p.edge.d, p.edge.lw / 2); for (const t of p.edge.tips) pathExt(t, 0); }
    if (p.image) pathExt(p.image.d, 0);
    if (p.shapes) for (const q of p.shapes) { const b = TD.bbox(q), T = p.T; for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) { const X2 = T[0] * x + T[2] * y + T[4], Y2 = T[1] * x + T[3] * y + T[5]; ext(X2, Y2, X2, Y2); } }
    const L = p.text || p.elabel;
    if (L) { const hw = (L.r || Math.max(L.b.w / 2, L.hw || 0)) * L.scale, hh = (L.r || Math.max(L.b.h / 2, L.hh || 0)) * L.scale; ext(L.x - hw, L.y - hh, L.x + hw, L.y + hh); }
  }
  for (const n of nodes.values()) { const r = extent(n.sh) * PT; ext(n.x * PT - r, -n.y * PT - r, n.x * PT + r, -n.y * PT + r); }
  const empty = !nodes.size && !texts.length && !planes.length;
  if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
  if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
  if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
  // the vertices as the editor needs them: centres (px, y down) and how far they reach
  for (const n of nodes.values()) { n.px = n.x * PT; n.py = -n.y * PT; n.r = extent(n.sh) * PT * Math.sqrt(Math.abs(n.m[0] * n.m[3] - n.m[1] * n.m[2]) || 1); }
  return { M, S, C2, X, Y, Z, k, edge3d, nodes, edges, texts, planes, bg, fg, files: fileUse, warnings, empty, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}

// ---------------------------------------------------------------- drawing
const mat = (m: M2, x: number, y: number) => `matrix(${r2(m[0])},${r2(-m[2])},${r2(-m[1])},${r2(m[3])},${r2(x)},${r2(y)})`;
function paint(p: any, ctx: any) {
  const col = (c: any) => TD.css(c);
  if (p.path) {
    const dash = p.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : p.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + p.lw * PT)}" stroke-linecap="round"` : '';
    let defs = '', f = p.fill ? `fill="${col(p.fill)}"${p.fop != null && p.fop < 1 ? ` fill-opacity="${r2(p.fop)}"` : ''}` : 'fill="none"';
    if (p.shade) { const id = `nwsh${++shadeN}`; defs = `<defs>${shadeDef(p.shade, p.shadeT, id)}</defs>`; f = `fill="url(#${id})"${p.fop != null && p.fop < 1 ? ` fill-opacity="${r2(p.fop)}"` : ''}`; }
    const s = p.stroke && p.lw > 0 ? ` stroke="${col(p.stroke)}" stroke-width="${r2(p.lw * PT)}"${p.sop != null && p.sop < 1 ? ` stroke-opacity="${r2(p.sop)}"` : ''}${dash}` : '';
    return `${defs}<path d="${p.path}" ${f}${s}/>`;
  }
  if (p.image) {
    const I = p.image;
    return `<image href="${esc(I.href)}" x="${r2(-I.w / 2)}" y="${r2(-I.h / 2)}" width="${r2(I.w)}" height="${r2(I.h)}" preserveAspectRatio="none" transform="${mat(I.m, I.x, I.y)}"${I.op < 1 ? ` opacity="${r2(I.op)}"` : ''}/>`;
  }
  if (p.shapes) {
    let inner = '';
    for (const q of p.shapes) { try { inner += TD.TYPES[q.type].svg(q, ctx); } catch { /* drawn without it */ } }
    return `<g transform="matrix(${p.T.map(r2).join(',')})"${p.op != null && p.op < 1 ? ` fill-opacity="${r2(p.op)}"` : ''}>${inner}</g>`;
  }
  if (p.edge) {
    const { d, tips, lw } = p.edge, G = p.G, c = col(G.line), op = G.opacity < 1 ? ` opacity="${r2(G.opacity)}"` : '';
    const dash = G.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : G.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + lw)}" stroke-linecap="round"` : '';
    let out = d ? `<path d="${d}" fill="none" stroke="${c}" stroke-width="${r2(lw)}"${dash}/>` : '';
    for (const t of tips) out += t[0] === 'S' ? `<path d="M${t.slice(1)}" fill="none" stroke="${c}" stroke-width="${r2(lw)}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${t}" fill="${c}"/>`;
    return op ? `<g${op}>${out}</g>` : out;
  }
  const L = p.text || p.elabel;
  if (L) {
    const tr = mat(L.m, L.x, L.y) + (L.scale !== 1 ? ` scale(${r2(L.scale)})` : '') + (L.rot ? ` rotate(${r2(-L.rot)})` : '');
    let inner = '';
    if (p.elabel) inner += `<circle r="${r2(L.r / L.scale)}" fill="${col(L.fill)}"${L.fop < 1 ? ` fill-opacity="${r2(L.fop)}"` : ''}/>`;
    const B = L.box;
    if (B) {
      let defs = '', f = B.fill ? `fill="${col(B.fill)}"${B.fop < 1 ? ` fill-opacity="${r2(B.fop)}"` : ''}` : 'fill="none"';
      if (B.shade) { const id = `nwsh${++shadeN}`; defs = `<defs>${shadeDef(B.shade, [B.hw / 25, 0, 0, -B.hh / 25, 0, 0], id)}</defs>`; f = `fill="url(#${id})"`; }
      const dash = B.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : B.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + B.lw * PT)}" stroke-linecap="round"` : '';
      const st = B.stroke ? ` stroke="${col(B.stroke)}" stroke-width="${r2(B.lw * PT)}"${B.sop < 1 ? ` stroke-opacity="${r2(B.sop)}"` : ''}${dash}` : '';
      inner += defs + (B.circ ? `<circle r="${r2(B.hw)}" ${f}${st}/>` : `<rect x="${r2(-B.hw)}" y="${r2(-B.hh)}" width="${r2(2 * B.hw)}" height="${r2(2 * B.hh)}" ${f}${st}/>`);
    }
    inner += L.op < 1 && B ? `<g opacity="${r2(L.op)}">${TD.textSvg(L.t, L.st, L.color, 0, -L.lift, ctx)}</g>` : TD.textSvg(L.t, L.st, L.color, 0, -L.lift, ctx);
    const gop = (L.gop ?? 1) * (B ? 1 : L.op);
    return `<g transform="${tr}"${gop < 1 ? ` opacity="${r2(gop)}"` : ''}>${inner}</g>`;
  }
  return '';
}
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  let out = '';
  if (Lo.empty) {
    const b = Lo.bb, ink = TD.css(s.color || '#000000');
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(0.8 * PT)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty network', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  // the background layer, then the main one; \clip: what comes after it, inside a clipped group
  const layers = (keep: (p: any) => boolean) => {
    let o = '', open = 0;
    for (const p of Lo.bg) if (keep(p)) o += paint(p, ctx);
    for (const p of Lo.fg) {
      if (p.clip) { const id = `nwcl${++shadeN}`; o += `<clipPath id="${id}"><path d="${p.clip}"/></clipPath><g clip-path="url(#${id})">`; open++; continue; }
      if (keep(p)) o += paint(p, ctx);
    }
    return o + '</g>'.repeat(open);
  };
  // a focused layer (ctx.focus: its z), as an editor shows it: the rest faded towards the paper, it in front at full strength
  const F = ctx.focus, onF = (p: any) => (Array.isArray(p.z) ? p.z.some((z: any) => z != null && Math.abs(z - F) < 1e-9) : p.z != null && Math.abs(p.z - F) < 1e-9);
  if (F == null) out += layers(() => true);
  else out += `<g class="nw-faded" opacity="0.22">${layers((p) => !onF(p))}</g>${layers(onF)}`;
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{tikzpicture\}/.test(t) ? t : `\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`;
}
// the CSV files the code reads (\Vertices{…}, \Edges{…}, and an \Edges's vertices=…)
// the files the code reads: CSV files (\Vertices{…}, \Edges{…}, an \Edges's vertices=…) and pictures on planes
function dataFiles(src: any) {
  const out: string[] = [];
  for (const it of parse(src).items) {
    if ((it.k === 'vs' || it.k === 'es') && !out.includes(it.file)) out.push(it.file);
    const v = it.k === 'es' && getOpt(it.o, 'vertices');
    if (v && !out.includes(v)) out.push(v);
    const im = it.k === 'p' && getOpt(it.o, 'image');
    if (im && !out.includes(im)) out.push(im);
  }
  return out;
}
const isImage = (name: string, text?: string) => /^data:image\//.test(text || '') || /\.(png|jpe?g|gif|pdf|svg)$/i.test(name);
const csvData = (text: string) => (/^data:/.test(text) ? text : 'data:text/csv;charset=utf-8,' + encodeURIComponent(text));

// a small drawing of a snippet (palette previews)
TD.networkMini = (src: any, maxH = 30) => {
  const s = { type: 'network', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
  // the palette's drawings sit on the interface, not the canvas: their ink (black lines and text, tikz-network's
  // black!75 edges) follows the interface's ink, so they show in dark mode as in light (the palette sets color: --ink)
  const ink = draw(s, { export: true, paper: 'var(--sheet-raised)' }).replace(/#000000|#404040/gi, 'currentColor');
  return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${ink}</svg>`;
};

TD.TYPES.network = {
  name: 'Network',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'network', x: p.x, y: p.y, src: TD.NETWORK_DEFAULT, files: {}, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the picture's own coordinates, its tikzpicture turned into a scope moved to where the drawing sits; its data
  // files go with the export under the names the code gives them (or, if another file already took that name, the
  // name the export gives it, written into the code)
  tikz(s: any, X: any) {
    X.pkgs.add('tikz-network');
    const b = layout(s).bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`];
    let t = fullCode(s.src);
    for (const name of dataFiles(s.src)) {
      const text = (s.files || {})[name];
      if (text == null || !TD.texImages) continue;
      // a picture named without its extension (\includegraphics finds plane.png for plane) goes with one
      const ext = isImage(name, text) && !/\.\w+$/.test(name) ? '.' + (/^data:image\/(\w+)/.exec(text)?.[1] || 'png').replace('jpeg', 'jpg') : '';
      const used = TD.texImages.use(X, name + ext, csvData(text)), usedName = ext ? used.slice(0, -ext.length) : used;
      if (usedName !== name) t = t.split(`{${name}}`).join(`{${usedName}}`).split(`vertices=${name}`).join(`vertices=${usedName}`).split(`image=${name}`).join(`image=${usedName}`);
    }
    const m = /\\begin\{tikzpicture\}\s*(\[)?/.exec(t);
    let env = '', i = m!.index + m![0].length;
    if (m![1]) { const e = close(t, i - 1); env = t.slice(i, e).trim(); i = e + 1; }
    const end = t.lastIndexOf('\\end{tikzpicture}');
    const body = t.slice(i, end < 0 ? t.length : end).replace(/^\s*\n/, '').replace(/\s+$/, '');
    // settings written before the picture (\SetCoordinates …) come before its options take effect, in a scope of their own
    const pre = (parse(s.src).pre || []).filter((it: any) => it.k === 'set' || (it.k === 'raw' && /^\\(definecolor|colorlet)\b/.test(it.s))).map(itemCode).join('\n');
    if (pre) return `\\begin{scope}[${o.join(', ')}]\n${pre}\n\\begin{scope}${env ? `[${env}]` : ''}\n${body}\n\\end{scope}\n\\end{scope}`;
    if (env) o.push(env);
    return `\\begin{scope}[${o.join(', ')}]\n${body}\n\\end{scope}`;
  },
};

// ---------------------------------------------------------------- automatic layout
// On a circle (in the order the vertices come), or spring-embedded (Fruchterman–Reingold from the circle: joined
// vertices pull together, all push apart). Vertices from data files and those on layers keep their places.
function autoLayout(M: any, mode = 'circle', step = 2) {
  const V = M.items.filter((it: any) => it.k === 'v' && !getOpt(it.o, 'layer'));
  const n = V.length;
  if (!n) return false;
  const idx = new Map(V.map((v: any, i: number) => [v.id, i]));
  const E: [number, number][] = [];
  for (const it of M.items) if (it.k === 'e' && it.a !== it.b && idx.has(it.a) && idx.has(it.b)) E.push([idx.get(it.a) as number, idx.get(it.b) as number]);
  const R = n === 1 ? 0 : Math.max(step * 0.75, (step * n) / (2 * Math.PI));
  let P = V.map((_: any, i: number) => [R * Math.cos(Math.PI / 2 - (2 * Math.PI * i) / n), R * Math.sin(Math.PI / 2 - (2 * Math.PI * i) / n)]);
  if (mode === 'spring' && n > 2) {
    const kk = step, iters = 300;
    for (let it = 0; it < iters; it++) {
      const T = (step * (1 - it / iters)) / 2, D = P.map(() => [0, 0]);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = 0.01 * (i - j); dy = 0.01; d = Math.hypot(dx, dy); }
        const f = (kk * kk) / d;
        D[i][0] += (dx / d) * f; D[i][1] += (dy / d) * f; D[j][0] -= (dx / d) * f; D[j][1] -= (dy / d) * f;
      }
      for (const [a, b] of E) {
        const dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], d = Math.hypot(dx, dy) || 1e-6, f = (d * d) / kk;
        D[a][0] -= (dx / d) * f; D[a][1] -= (dy / d) * f; D[b][0] += (dx / d) * f; D[b][1] += (dy / d) * f;
      }
      P = P.map((p: number[], i: number) => { const d = Math.hypot(D[i][0], D[i][1]) || 1, m = Math.min(d, T); return [p[0] + (D[i][0] / d) * m, p[1] + (D[i][1] / d) * m]; });
    }
    // centred on the origin
    const cx = P.reduce((a: number, p: number[]) => a + p[0], 0) / n, cy = P.reduce((a: number, p: number[]) => a + p[1], 0) / n;
    P = P.map((p: number[]) => [p[0] - cx, p[1] - cy]);
  }
  const q = (v: number) => Math.round(v * 20) / 20;
  V.forEach((v: any, i: number) => { v.o = setOpt(setOpt(v.o, 'x', num(q(P[i][0]))), 'y', num(q(P[i][1]))); });
  return true;
}

// ---------------------------------------------------------------- the order things are painted in
// tikz-network paints in the order of the code, so the editor keeps it in the order the layers lie: the farthest layer
// first (the lowest z: layer 3 before layer 2 before layer 1, with \SetLayerDistance's default of -2), what is on no
// layer last. Within a layer the order is the author's (Bring to Front and the rest move things there). Only what lies
// between two statements others may depend on moves: settings, TikZ commands, \Vertices and \Edges keep their places,
// and nothing crosses them. A Layer environment moves as one. An edge sorts with the farther of its two vertices,
// never before either (TikZ needs a node before an edge can reach it), and so does a Layer environment with edges in it.
interface Unit { from: number; to: number; k: string; z: number; ids: Set<string>; needs: Set<string>; bg: boolean }
const SORTED = new Set(['v', 't', 'p', 'e', 'layer']);
function layerDistance(M: any) {
  let LD = -2;
  for (const it of [...(M.pre || []), ...M.items]) if (it.k === 'set' && it.cmd === 'SetLayerDistance') LD = numOr(it.arg, -2);
  return LD;
}
function units(M: any): Unit[] {
  const items = M.items, LD = layerDistance(M), out: Unit[] = [];
  const zOf = (o: string[], d: number | null) => { const l = getOpt(o, 'layer'); return l != null && l !== '' ? (numOr(l, 1) - 1) * LD : d; };
  let inBG = true;
  for (const it of [...(M.pre || []), ...items]) if (it.k === 'set' && (it.cmd === 'EdgesInBG' || it.cmd === 'EdgesNotInBG')) inBG = it.cmd === 'EdgesInBG';
  const vz = new Map<string, number | null>();
  for (let i = 0; i < items.length;) {
    const it = items[i];
    if (it.k === 'layer') {
      let d = 0, j = i;
      for (; j < items.length; j++) { if (items[j].k === 'layer') d++; else if (items[j].k === 'endlayer' && --d === 0) break; }
      j = Math.min(j, items.length - 1);
      const zo = getOpt(it.o || [], 'z'), z = zo != null && zo !== '' ? numOr(zo, 0) : (numOr(getOpt(it.o || [], 'layer') || '1', 1) - 1) * LD;
      const u: Unit = { from: i, to: j + 1, k: 'layer', z, ids: new Set(), needs: new Set(), bg: false };
      for (let q = i + 1; q < j; q++) { const x = items[q]; if (x.k === 'v') { u.ids.add(x.id); vz.set(x.id, zOf(x.o, z)); } else if (x.k === 'e') { u.needs.add(x.a); u.needs.add(x.b); } }
      out.push(u); i = j + 1; continue;
    }
    const u: Unit = { from: i, to: i + 1, k: it.k, z: NaN, ids: new Set(), needs: new Set(), bg: false };
    if (it.k === 'v') { u.ids.add(it.id); vz.set(it.id, zOf(it.o, null)); }
    if (it.k === 'e') { u.needs.add(it.a); u.needs.add(it.b); u.bg = inBG ? !flag(it.o, 'NotInBG') : false; }
    if (it.k === 'p') u.bg = flag(it.o, 'InBG');
    out.push(u); i++;
  }
  // how far each lies: z (no layer: Infinity, painted last); an edge as far as its farther vertex
  for (const u of out) {
    const it = items[u.from];
    if (u.k === 'v' || u.k === 't') u.z = zOf(it.o, null) ?? Infinity;
    else if (u.k === 'p') u.z = zOf(it.o, 0)!;
    else if (u.k === 'e') { const za = vz.get(it.a), zb = vz.get(it.b); u.z = Math.min(za ?? Infinity, zb ?? Infinity); }
    for (const id of u.ids) u.needs.delete(id);
  }
  return out;
}
/** Put the code in the order its layers lie (above). True when anything moved. */
function layerOrder(M: any) {
  const U = units(M), items = M.items, order: Unit[] = [];
  let run: Unit[] = [];
  const flush = () => {
    // the unit to paint next: of those whose vertices are already drawn, the farthest, then the first in the code
    const left = run.slice(), done = new Set<string>(), owner = new Map<string, Unit>();
    for (const u of left) for (const id of u.ids) owner.set(id, u);
    const ready = (u: Unit) => [...u.needs].every((id) => !owner.has(id) || done.has(id));
    while (left.length) {
      let best = -1;
      for (let q = 0; q < left.length; q++) if (ready(left[q]) && (best < 0 || left[q].z < left[best].z)) best = q;
      if (best < 0) best = 0;
      const u = left.splice(best, 1)[0];
      for (const id of u.ids) done.add(id);
      order.push(u);
    }
    run = [];
  };
  for (const u of U) { if (SORTED.has(u.k)) run.push(u); else { flush(); order.push(u); } }
  flush();
  const next = order.flatMap((u) => items.slice(u.from, u.to));
  const moved = next.some((it: any, i: number) => it !== items[i]);
  if (moved) M.items = next;
  return moved;
}
/**
 * Bring to Front, Bring Forward, Send Backward, Send to Back: the items at `at` (indices into M.items) move among
 * those painted on the same layer, on the same TikZ layer (background or main) and between the same fixed statements,
 * then the order is made right again (layerOrder). True when anything moved.
 */
function arrange(M: any, at: number[], how: 'front' | 'forward' | 'backward' | 'back') {
  const was = M.items.slice();
  layerOrder(M);
  const pick = new Set(at.map((i) => M.items[i]).filter(Boolean));
  const U = units(M), items = M.items;
  const seg: number[] = []; let s = 0;
  for (const u of U) { seg.push(s); if (!SORTED.has(u.k)) s++; }
  const sel = (u: Unit) => pick.has(items[u.from]);
  const peer = (a: Unit, b: Unit) => SORTED.has(a.k) && SORTED.has(b.k) && seg[U.indexOf(a)] === seg[U.indexOf(b)] && a.z === b.z && a.bg === b.bg;
  const list = U.slice();
  if (how === 'front' || how === 'back') {
    for (const u of (how === 'front' ? U : U.slice().reverse()).filter(sel)) {
      const group = list.filter((x) => peer(x, u)), from = list.indexOf(u), to = list.indexOf(group[how === 'front' ? group.length - 1 : 0]);
      list.splice(from, 1); list.splice(to, 0, u);
    }
  } else {
    const step = how === 'forward' ? 1 : -1, seq = how === 'forward' ? U.slice().reverse() : U.slice();
    for (const u of seq.filter(sel)) {
      const from = list.indexOf(u);
      let q = from + step;
      while (q >= 0 && q < list.length && !(peer(list[q], u) && !sel(list[q]))) { if (!SORTED.has(list[q].k)) { q = -1; break; } q += step; }
      if (q < 0 || q >= list.length) continue;
      list.splice(from, 1); list.splice(q, 0, u);
    }
  }
  M.items = list.flatMap((u) => items.slice(u.from, u.to));
  layerOrder(M);
  return M.items.some((it: any, i: number) => it !== was[i]);
}

TD.network = { parse, write, layout, layerOrder, arrange, draw, getOpt, setOpt, flag, val, opts, unbrace, kv, num, csv, csvText, dataFiles, autoLayout, fullCode, inv, mul, DIR_DEG, FONT_PT, itemCode, csvData };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register('network', {
  menu: { order: 11, group: 'computing', label: 'Network', title: 'Network of vertices and edges, written with tikz-network', icon: '<svg viewBox="0 0 32 24"><path d="M8 7l14-2M8 7l4 11M22 5l-10 13M22 5l5 12M12 18l15-1"/><circle cx="8" cy="7" r="2.6" class="a1"/><circle cx="22" cy="5" r="2.6" class="a1"/><circle cx="12" cy="18" r="2.6" class="a1"/><circle cx="27" cy="17" r="2.6" class="a1"/></svg>' },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.networkEditor, alias: 'networkOpen', layout: (s: any) => TD.network.layout(s), apply: (t: any, r: any) => { t.src = r.src; if (r.files) t.files = r.files; } },
});
export { layout, fullCode, dataFiles, parse, write };
