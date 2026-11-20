import { runtime as TD } from '../runtime';
import { unbrace } from './tex-groups';
// State machines written with TikZ's automata library. The source is the object: a tikzpicture of
// \node[state] lines (initial, accepting) and \path … edge … statements that join them with labelled
// transitions and self-loops. It is drawn here as vectors at TikZ's own sizes (states 2.5em across,
// accepting states doubled 0.6pt apart, the initial arrow 3ex long, loops with looseness 8 and 5mm
// minimum distance), and exported unchanged, its tikzpicture turned into a scope shifted to where the
// drawing sits. The visual editor (js/fsmeditor.ts) reads the code into a model and writes it back.
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K, MM = PX / 10;

TD.FSM_DEFAULT = [
  '\\begin{tikzpicture}[->, >=Stealth, shorten >=1pt, auto, node distance=2.5cm, semithick]',
  '  \\node[state, initial] (q0) at (0,0) {$q_0$};',
  '  \\node[state] (q1) at (2.5,0) {$q_1$};',
  '  \\node[state, accepting] (q2) at (5,0) {$q_2$};',
  '  \\path (q0) edge node {$a$} (q1)',
  '        (q1) edge [loop above] node {$b$} ()',
  '        (q1) edge [bend left] node {$a$} (q2)',
  '        (q2) edge [bend left] node {$b$} (q1);',
  '\\end{tikzpicture}',
].join('\n');

// TikZ's sizes at 10pt
const EM = 10 * PT, EX = 4.3 * PT;
const INNER = 0.3333 * EM;
const ABOVE = 0.09 * PX;         // labels above an edge sit this much lower than the text box suggests
const LW = 0.4 * PT;
const STATE_MIN = 2.5 * EM;      // minimum size of a state
const DBL = 0.6 * PT;            // double distance (accepting)
const INIT_DIST = 3 * EX;        // initial distance
const TEXT = { size: 10 * PT, font: 'default' };
const DIRS: Record<string, any> = { right: 0, 'above right': 45, above: 90, 'above left': 135, left: 180, 'below left': 225, below: 270, 'below right': 315 };
const LOOPS: Record<string, any> = { above: [105, 75], below: [285, 255], left: [195, 165], right: [15, -15] };

// ---------------------------------------------------------------- reading the code
function close(s: any, i: any) {
  const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, any>)[open];
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{' && open !== '{') { k = close(s, k); if (k < 0) return -1; continue; }
    if (c === open) d++;
    else if (c === shut && --d === 0) return k;
  }
  return -1;
}
function split(s: any, sep = ',') {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if ('{[('.includes(c)) d++;
    else if ('}])'.includes(c)) d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const opts = (s: any) => split(s || '').map((x) => x.trim()).filter(Boolean);
const kv = (it: any) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null }; };
const stripComments = (s: any) => s.replace(/(^|[^\\])%.*$/gm, '$1');
const shown = (t: any) => String(t || '').replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$');
// a line break in a label: \\ (with an optional [length]); drawn one line under another
const BREAK = /\s*\\\\(?:\[[^\]]*\])?\s*/g;
const isMultiline = (t: any) => /\\\\/.test(String(t || ''));
const lines = (t: any) => String(t || '').replace(BREAK, '\n');
// TeX's height and depth of one line of text (Computer Modern), em = the font size; null when it has
// scripts, fractions or the like, which only a measure of the drawing can tell
function lineHD(t: string, em: number): { ht: number; dp: number } | null {
  if (/\\(?:frac|dfrac|tfrac|sum|int|prod|sqrt|binom|over|begin|underbrace|overbrace|left|right|displaystyle)\b/.test(t)) return null;
  // simple scripts at 70%: raised at least sup1 (0.413em), lowered sub1 (0.15em) or sub2 (0.247em) beside a superscript
  if (/[\^_]/.test(t)) {
    const SCRIPT = /([_^])(\{(?:[^{}]|\{[^{}]*\})*\}|\\[A-Za-z]+|[^\s{}\\])/g, sup: string[] = [], sub: string[] = [];
    const base = t.replace(SCRIPT, (_m, k, s) => { (k === '^' ? sup : sub).push(s.replace(/^\{|\}$/g, '')); return ''; });
    if (/[\^_]/.test(base) || [...sup, ...sub].some((s) => /[\^_]/.test(s))) return null;
    const B = lineHD(base, em) || { ht: 0, dp: 0 }, S = (s: string) => lineHD('$' + s + '$', 0.7 * em) || { ht: 0.694 * 0.7 * em, dp: 0 };
    let { ht, dp } = B;
    for (const s of sup) ht = Math.max(ht, 0.413 * em + S(s).ht);
    for (const s of sub) dp = Math.max(dp, (sup.length ? 0.247 : 0.15) * em + S(s).dp);
    return { ht, dp };
  }
  const p = t.replace(/\\(?:textbf|textit|textrm|textsf|texttt|emph|mathrm|mathbf|mathit|mathsf|text|bfseries|itshape|small|large|Large|footnotesize|scriptsize|tiny|huge)\b/g, '').replace(/[${}~]/g, '');
  const greek = /\\[A-Za-z]+/.test(p), bare = p.replace(/\\[A-Za-z]+/g, '');
  const ht = /[()[\]|/]/.test(bare) ? 0.75 : /[A-Z0-9bdfhkl!?'"`&%#@]/.test(bare) || /\\(?:[A-Z][a-z]+|beta|delta|zeta|theta|lambda|xi|phi|psi|ell|partial|infty|nabla)\b/.test(p) ? 0.694
    : /[ijt]/.test(bare) ? 0.669 : /\S/.test(bare) || greek ? 0.431 : 0;
  const dp = /[()[\]|/]/.test(bare) ? 0.25 : /[gjpqyQ,;]/.test(bare) || /\\(?:beta|gamma|zeta|eta|mu|xi|rho|phi|varphi|chi|psi)\b/.test(p) ? 0.194 : 0;
  return { ht: ht * em, dp: dp * em };
}
TD.texLineHD = lineHD;
// half the height TeX gives a node's text (b: its measured box; lines one under another, \baselineskip 1.2em):
// the first line's height, the last one's depth and the skips between
function halfH(t: string, b: any, em: number) {
  const ls = String(t || '').split('\n');
  if (!ls.some((l) => l.trim())) return 0;
  const L = b.h / ls.length, fb = { ht: 0.55 * L, dp: 0.25 * L }, f = lineHD(ls[0], em) || fb, l = lineHD(ls[ls.length - 1], em) || fb;
  return (f.ht + 1.2 * em * (ls.length - 1) + l.dp) / 2;
}
// how far above its box's middle a text is drawn (px, y down: subtract from y). The drawing centres the text's
// measured box, which suits a capital (height 0.694em, no depth); TeX centres the node box on the first line's
// height and the last line's depth, so x-height letters, descenders and lines 1.2em apart sit elsewhere
function lift(t: string, b: any, em: number) {
  const ls = String(t || '').split('\n');
  if (!ls.some((l) => l.trim())) return 0;
  const n = ls.length, f = lineHD(ls[0], em), l = lineHD(ls[n - 1], em);
  const ht = f ? f.ht : 0.694 * em, dp = l ? l.dp : 0;
  return ((n - 1) * (1.2 * em - b.h / n) + dp - ht) / 2 + 0.347 * em;
}
// where a label beside its edge goes, from the point on the edge (px, y down), (ux, uy) the side it goes to.
// TikZ anchors it by a corner unless that side is within ~3° of an axis (tikz@auto@anchor: 0.05pt of a 1pt
// vector), so a label of a sloping edge sits off the corner, not along the normal
function besideAt(b: any, t: string, ux: number, uy: number, em: number, above: number) {
  const sx = Math.abs(ux) > 0.05 ? Math.sign(ux) : 0, sy = Math.abs(uy) > 0.05 ? Math.sign(uy) : 0;
  const hw = (b.w - 2) / 2 + INNER, hh = halfH(t, b, em) + INNER;
  return [sx * hw, sy * hh + (sy < 0 ? above : 0)];
}
const needsAlign = (o: string[]) => !o.some((it) => /^(align|text width)$/.test(kv(it).k));
const skip = (s: any, i: any) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
function nextSemi(s: any, i: any) {
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if ('{[('.includes(c)) { const e = close(s, k); if (e < 0) return s.length - 1; k = e; continue; }
    if (c === ';') return k;
  }
  return s.length - 1;
}
// a length → cm ("1.5", "2cm", "3mm", "10pt", "1em")
function cm(v: any) {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?\s*$/.exec(String(v));
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return { cm: n, mm: n / 10, pt: n / 28.4527, em: n * 10 / 28.4527, ex: n * 4.3 / 28.4527, in: n * 2.54, bp: n * 2.54 / 72 }[m[2] || 'cm'] ?? n;
}
function coord(t: any) {
  t = t.trim();
  let m = /^\(\s*([^,:()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(t);
  if (m) { const x = cm(m[1]), y = cm(m[2]); return isFinite(x) && isFinite(y) ? [x, y] : null; }
  m = /^\(\s*(-?[\d.]+)\s*:\s*([^,()]+?)\s*\)$/.exec(t);
  if (m) { const a = (parseFloat(m[1]) * Math.PI) / 180, r = cm(m[2]); return isFinite(r) ? [r * Math.cos(a), r * Math.sin(a)] : null; }
  return null;
}
// "right of=q0" (centre to centre) or "above right=1cm and 2cm of q0" (positioning)
const OLD_REL = /^(above|below|left|right|above left|above right|below left|below right)\s+of\s*=\s*(\S+)$/;
const NEW_REL = /^(above|below|left|right|above left|above right|below left|below right)\s*=\s*(?:(.*?)\s+)?of\s+(\S+)$/;
const relCode = (r: any) => (r.old ? `${r.dir} of=${r.of}` : `${r.dir}=${r.d ? r.d + ' ' : ''}of ${r.of}`);

// The model: { env (picture options, or null when there is no tikzpicture around the code), states, edges,
// groups, pre, post, warnings }
// state: { name, o: [option], x, y (cm, or null), rel, text }
// edge: { a, b, o: [option], lo: [label option] | null, t (TeX label) | null, g (group), loop }
// group: { cmd: 'path' | 'draw', o: 'options as written' }
function parse(src: any) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const t = stripComments(String(src || ''));
  const bm = /\\begin\{tikzpicture\}\s*/.exec(t);
  let body = t, env = null;
  if (bm) {
    let i = bm.index + bm[0].length;
    env = '';
    if (t[i] === '[') { const e = close(t, i); if (e > 0) { env = t.slice(i + 1, e).trim(); i = e + 1; } }
    const em = t.indexOf('\\end{tikzpicture}', i);
    if (em < 0) warn('\\end{tikzpicture} is missing');
    body = t.slice(i, em < 0 ? t.length : em);
  }
  const M = { env, states: [], edges: [], groups: [], pre: [] as string[], post: [] as string[], warnings };
  let i = 0;
  while (i < body.length) {
    i = skip(body, i);
    if (i >= body.length) break;
    const e = nextSemi(body, i), st = body.slice(i, e + 1).trim();
    i = e + 1;
    if (!st) continue;
    if (/^\\node\b/.test(st) && readNode(st, M, warn)) continue;
    if (/^\\(path|draw)\b/.test(st) && readPath(st, M, warn)) continue;
    // anything else is kept as written: before the states when it comes first (a \tikzset), else after
    (M.states.length || M.edges.length ? M.post : M.pre).push(st);
    if (!/^\\tikzset\b/.test(st)) warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`);
  }
  // targets that are not states
  const names = new Set(M.states.map((s) => (s as any).name));
  for (const ed of M.edges) for (const n of [(ed as any).a, (ed as any).b]) if (!names.has(n)) warn(`"${n}" is used in a transition but is not a \\node`);
  return M;
}
function readNode(st: any, M: any, warn: any) {
  let i = 5, name = null, xy = null, text = null, o: any[] = [];
  while (i < st.length) {
    i = skip(st, i);
    const c = st[i];
    if (c === ';' || c === undefined) break;
    if (c === '[') { const e = close(st, i); if (e < 0) return false; o = o.concat(opts(st.slice(i + 1, e))); i = e + 1; continue; }
    if (c === '(') { const e = close(st, i); if (e < 0 || name != null) return false; name = st.slice(i + 1, e).trim(); i = e + 1; continue; }
    if (c === '{') { const e = close(st, i); if (e < 0) return false; text = st.slice(i + 1, e).trim(); i = e + 1; continue; }
    if (st.startsWith('at', i) && !/[A-Za-z]/.test(st[i + 2] || '')) {
      i = skip(st, i + 2);
      if (st[i] !== '(') return false;
      const e = close(st, i), p = e > 0 ? coord(st.slice(i, e + 1)) : null;
      if (!p) { warn(`The position ${st.slice(i, e + 1)} isn't one the drawing understands; use at (x,y)`); return false; }
      xy = p; i = e + 1; continue;
    }
    return false;
  }
  if (!name || !/^[A-Za-z0-9_.'-]+$/.test(name)) { if (!name) warn('A \\node has no name: write \\node[state] (q0) …'); return false; }
  if (M.states.some((s: any) => s.name === name)) warn(`Two nodes are called "${name}"`);
  const s = { name, o: ([] as any[]), x: (null as any), y: (null as any), rel: (null as any), text: text == null ? '' : text };
  for (const it of o) {
    let m = OLD_REL.exec(it);
    if (m) { s.rel = { dir: m[1], of: m[2].replace(/^\(|\)$/g, ''), d: '', old: true }; continue; }
    m = NEW_REL.exec(it);
    if (m) { s.rel = { dir: m[1], d: m[2] || '', of: m[3].replace(/^\(|\)$/g, ''), old: false }; continue; }
    s.o.push(it);
  }
  if (xy) { s.x = xy[0]; s.y = xy[1]; }
  M.states.push(s);
  return true;
}
// \path[opts] (a) edge [opts] node [opts] {label} (b) (c) edge … ;  also `to` and `--` steps
function readPath(st: any, M: any, warn: any) {
  const hm = /^\\(path|draw)\s*/.exec(st);
  let i = hm![0].length, go = '';
  if (st[i] === '[') { const e = close(st, i); if (e < 0) return false; go = st.slice(i + 1, e).trim(); i = e + 1; }
  const g = M.groups.length, edges = [];
  let cur = null;
  for (;;) {
    i = skip(st, i);
    const c = st[i];
    if (c === ';' || c === undefined) break;
    if (c === '(') { const e = close(st, i); if (e < 0) return false; cur = st.slice(i + 1, e).trim(); if (!cur) return false; i = e + 1; continue; }
    const op = /^(edge\b|to\b|--)/.exec(st.slice(i));
    if (!op || cur == null) return false;
    i += op[0].length;
    let o: any[] = [], lo = null, t = null, b = null;
    for (;;) {
      i = skip(st, i);
      const d = st[i];
      if (d === '[') { const e = close(st, i); if (e < 0) return false; o = o.concat(opts(st.slice(i + 1, e))); i = e + 1; continue; }
      if (st.startsWith('node', i) && !/[A-Za-z]/.test(st[i + 4] || '')) {
        if (t != null) return false; // one label per transition
        i = skip(st, i + 4);
        lo = [];
        if (st[i] === '[') { const e = close(st, i); if (e < 0) return false; lo = opts(st.slice(i + 1, e)); i = skip(st, e + 1); }
        if (st[i] === '(') { const e = close(st, i); if (e < 0) return false; i = skip(st, e + 1); }
        if (st[i] !== '{') return false;
        const e = close(st, i); if (e < 0) return false;
        t = st.slice(i + 1, e).trim(); i = e + 1;
        continue;
      }
      if (d === '(') { const e = close(st, i); if (e < 0) return false; b = st.slice(i + 1, e).trim(); i = e + 1; break; }
      return false;
    }
    const loop = !b || b === cur;
    edges.push({ a: cur, b: loop ? cur : b, o, lo, t, g, loop, op: op[0] });
    if (op[0] !== 'edge' && b) cur = b;
  }
  if (!edges.length) return false;
  M.groups.push({ cmd: hm![1], o: go });
  for (const e of edges) M.edges.push(e);
  return true;
}

// ---------------------------------------------------------------- writing the code
const num = (n: any) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
function nodeCode(s: any) {
  const o = s.o.slice();
  if (isMultiline(s.text) && needsAlign(o)) o.push('align=center');
  if (s.x == null && s.rel) o.push(relCode(s.rel));
  const at = s.x != null ? ` at (${num(s.x)},${num(s.y)})` : '';
  return `\\node${o.length ? `[${o.join(', ')}]` : ''} (${s.name})${at} {${s.text || ''}};`;
}
function edgeCode(e: any) {
  const lo = (e.lo || []).slice();
  if (isMultiline(e.t) && needsAlign(lo)) lo.push('align=center');
  const lbl = e.t != null ? ` node${lo.length ? ` [${lo.join(', ')}]` : ''} {${e.t}}` : '';
  return `(${e.a}) edge${e.o.length ? ` [${e.o.join(', ')}]` : ''}${lbl} (${e.loop ? '' : e.b})`;
}
function write(M: any) {
  const lines = M.pre.map((x: any) => '  ' + x);
  for (const s of M.states) lines.push('  ' + nodeCode(s));
  M.groups.forEach((g: any, gi: any) => {
    const es = M.edges.filter((e: any) => e.g === gi);
    if (!es.length) return;
    const head = `\\${g.cmd}${g.o ? `[${g.o}]` : ''} `, pad = ' '.repeat(head.length);
    es.forEach((e: any, k: any) => lines.push(`  ${k ? pad : head}${edgeCode(e)}${k === es.length - 1 ? ';' : ''}`));
  });
  for (const x of M.post) lines.push('  ' + x);
  const body = lines.join('\n');
  return M.env == null ? body : `\\begin{tikzpicture}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{tikzpicture}`;
}

// ---------------------------------------------------------------- options
const TIPS: Record<string, any> = { stealth: 'stealth', "stealth'": 'stealth', latex: 'latex', "latex'": 'latex', to: 'to', '>': null, triangle: 'latex', 'triangle 45': 'latex' };
const tipName = (t: any) => {
  t = unbrace(t).replace(/\[.*\]$/, '').trim().toLowerCase();
  if (t === '>') return '>';
  return TIPS[t] !== undefined ? TIPS[t] : t ? 'stealth' : null;
};
// "->", "<->", "-Stealth", "-{Latex[round]}", "|->"
function arrowSpec(k: any) {
  if (!/^[<|]?[^=]*-[^=]*$/.test(k) || /\s/.test(k.replace(/\{.*\}/, ''))) return null;
  const m = /^(.*?)-(.*)$/.exec(k);
  if (!m) return null;
  const side = (x: any) => { x = x.trim(); if (!x) return null; if (x === '>' || x === '<') return '>'; if (x === '|') return null; return tipName(x); };
  return { s: side(m[1]), e: side(m[2]) };
}
// a style the options of the picture, the path, the edge and the label build up in turn
function baseStyle() {
  return { arrow: { s: null, e: null }, tip: 'to', shortenE: 0, shortenS: 0, lw: LW, color: null, dash: '', bend: null, out: null, in: null, loose: 1, loop: null, minDist: 0,
    auto: 0, swap: false, dir: null, pos: 0.5, nd: [1, 1], onGrid: false, initText: 'start', initWhere: 'left', initDist: INIT_DIST,
    stateFill: null, stateDraw: null, stateMin: STATE_MIN, textColor: null };
}
const WIDTHS: Record<string, any> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const POS: Record<string, any> = { 'at start': 0, 'very near start': 0.125, 'near start': 0.25, midway: 0.5, 'near end': 0.75, 'very near end': 0.875, 'at end': 1 };
function applyOpts(S: any, list: any, unknown: any) {
  for (const it of list) {
    const { k, v } = kv(it);
    const A = v == null ? arrowSpec(k) : null;
    if (A) { S.arrow = A; continue; }
    if (k === '>' && v != null) { S.tip = tipName(v) || 'to'; continue; }
    if (k === 'shorten >' && v != null) { S.shortenE = (cm(v) * PX) || 0; continue; }
    if (k === 'shorten <' && v != null) { S.shortenS = (cm(v) * PX) || 0; continue; }
    if (WIDTHS[k] != null && v == null) { S.lw = WIDTHS[k] * PT; continue; }
    if (k === 'line width' && v != null) { const w = cm(v); if (isFinite(w)) S.lw = w * PX; continue; }
    if (k === 'dashed' || k === 'densely dashed' || k === 'loosely dashed') { S.dash = 'dash'; continue; }
    if (k === 'dotted' || k === 'densely dotted' || k === 'loosely dotted') { S.dash = 'dot'; continue; }
    if (k === 'solid') { S.dash = ''; continue; }
    if (k === 'bend left' || k === 'bend right') { const b = parseFloat(v as any); S.bend = (k === 'bend left' ? 1 : -1) * (isFinite(b) ? b : 30); continue; } // bend left=0 is 0°, not 30°
    if (k === 'out' && v != null) { S.out = parseFloat(v); continue; }
    if (k === 'in' && v != null) { S.in = parseFloat(v); continue; }
    if (k === 'looseness' && v != null) { S.loose = parseFloat(v) || 1; continue; }
    if (k === 'min distance' && v != null) { S.minDist = (cm(v) * PX) || 0; continue; }
    if (k === 'loop' && v == null) { S.loop = S.loop || 'custom'; S.loose = 8; S.minDist = 5 * MM; if (!S.arrow.e) S.arrow = { s: null, e: '>' }; S.shortenE = Math.max(S.shortenE, PT); continue; }
    const lm = /^loop (above|below|left|right)$/.exec(k);
    if (lm && v == null) { S.loop = lm[1]; S.dir = lm[1]; [S.out, S.in] = LOOPS[lm[1]]; S.loose = 8; S.minDist = 5 * MM; if (!S.arrow.e) S.arrow = { s: null, e: '>' }; S.shortenE = Math.max(S.shortenE, PT); continue; }
    if (k === 'auto') { S.auto = v === 'right' ? -1 : v === 'false' ? 0 : 1; S.dir = null; continue; }
    if (k === 'swap' || k === "'") { S.swap = !S.swap; continue; }
    if (DIRS[k] != null && v == null) { S.dir = k; continue; }
    if (k === 'pos' && v != null) { S.pos = parseFloat(v); if (!isFinite(S.pos)) S.pos = 0.5; continue; }
    if (POS[k] != null && v == null) { S.pos = POS[k]; continue; }
    if (k === 'node distance' && v != null) { const p = v.split(/\s+and\s+/).map(cm); if (isFinite(p[0])) S.nd = [p[0], isFinite(p[1]) ? p[1] : p[0]]; continue; }
    if (k === 'on grid') { S.onGrid = v !== 'false'; continue; }
    if (k === 'initial text') { S.initText = unbrace(v || ''); continue; }
    if (k === 'initial where' && v && DIRS[v] != null) { S.initWhere = v; continue; }
    if (k === 'initial distance' && v != null) { S.initDist = (cm(v) * PX) || INIT_DIST; continue; }
    if (k === 'every state/.style' || k === 'every state/.append style') { const T = { ...S }; applyNodeOpts(T, opts(unbrace(v)), null); S.stateFill = T.stateFill; S.stateDraw = T.stateDraw; S.stateMin = T.stateMin; S.textColor = T.textColor; continue; }
    if (k === 'text' && v != null && TD.tikzColor) { const c = TD.tikzColor(unbrace(v)); if (c) { S.textColor = c; continue; } }
    const col = (k === 'draw' || k === 'color') && v != null ? v : v == null ? k : null;
    if (col && TD.tikzColor) { const c = TD.tikzColor(unbrace(col)); if (c) { S.color = c; continue; } }
    if (/^(sloped|font|inner sep|outer sep|anchor|fill|text width|align|scale|transform shape|every .*|semithick|>=|initial|accepting|state|rounded corners|opacity|draw opacity|text opacity|double|double distance|align)$/.test(k) || /\/\.(style|append style|code)$/.test(k)) continue;
    if (unknown) unknown.push(it);
  }
  return S;
}
// a node's own options: { initial, initWhere, accepting, fill, draw, … }
function applyNodeOpts(S: any, list: any, unknown: any) {
  for (const it of list) {
    const { k, v } = kv(it);
    if (k === 'state' || k === 'state without output') { S.state = true; continue; }
    if (k === 'initial' || k === 'initial by arrow') { S.initial = true; continue; }
    const im = /^initial (above|below|left|right)$/.exec(k);
    if (im) { S.initial = true; S.initWhere = im[1]; continue; }
    if (k === 'initial where' && v && DIRS[v] != null) { S.initWhere = v; continue; }
    if (k === 'initial text') { S.initText = unbrace(v || ''); continue; }
    if (k === 'initial distance' && v != null) { S.initDist = (cm(v) * PX) || INIT_DIST; continue; }
    if (k === 'accepting' || k === 'accepting by double') { S.accepting = true; continue; }
    if (k === 'fill' && v != null) { const c = TD.tikzColor && TD.tikzColor(unbrace(v)); if (c) S.stateFill = c; else if (v === 'none') S.stateFill = null; continue; }
    if ((k === 'draw' || k === 'color') && v != null) { const c = TD.tikzColor && TD.tikzColor(unbrace(v)); if (c) { if (k === 'draw') S.stateDraw = c; else { S.stateDraw = c; S.textColor = c; } continue; } }
    if (k === 'text' && v != null) { const c = TD.tikzColor && TD.tikzColor(unbrace(v)); if (c) { S.textColor = c; continue; } }
    if (k === 'minimum size' && v != null) { const n = cm(v); if (isFinite(n)) S.stateMin = n * PX; continue; }
    if (WIDTHS[k] != null && v == null) { S.lw = WIDTHS[k] * PT; continue; }
    if (k === 'line width' && v != null) { const w = cm(v); if (isFinite(w)) S.lw = w * PX; continue; }
    if (v == null && TD.tikzColor && TD.tikzColor(k)) { S.stateDraw = S.textColor = TD.tikzColor(k); continue; }
    if (/^(font|inner sep|outer sep|align|text width|scale|on grid|node distance|anchor)$/.test(k)) continue;
    if (unknown) unknown.push(it);
  }
  return S;
}
const isInitial = (it: any) => /^(initial|initial by arrow|initial (above|below|left|right))$/.test(kv(it).k);
const isAccepting = (it: any) => /^(accepting|accepting by double)$/.test(kv(it).k);

// ---------------------------------------------------------------- layout
const cache = new Map();
function layout(s: any) {
  const key = [s.src, TD.math && TD.math.engine].join('\u0001');
  const hit = cache.get(key);
  if (hit) return hit;
  const L = build(s.src);
  if (TD.measuring && TD.measuring()) return L;
  if (cache.size > 200) cache.clear();
  cache.set(key, L);
  return L;
}
TD.onTextMetricsChange(() => { cache.clear(); });

function polyline(pts: any) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function along(P: any, s: any) {
  const { pts, cum, len } = P;
  s = Math.max(0, Math.min(len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
  const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty, nx: ty, ny: -tx };
}
// the part of a polyline between distances s0 and s1
function cut(P: any, s0: any, s1: any) {
  const out = [], a = along(P, s0), b = along(P, s1);
  out.push([a.x, a.y]);
  for (let i = 1; i < P.pts.length - 1; i++) if (P.cum[i] > s0 && P.cum[i] < s1) out.push(P.pts[i]);
  out.push([b.x, b.y]);
  return out;
}
const ptsD = (pts: any) => pts.map((p: any, i: any) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
const reach = (n: any, ux: any, uy: any) => {
  if (n.r) return n.r + n.osep;
  const ax = Math.abs(ux), ay = Math.abs(uy);
  return Math.min(ax > 1e-9 ? n.hw / ax : Infinity, ay > 1e-9 ? n.hh / ay : Infinity) + n.osep;
};
const unit = (deg: any) => [Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)]; // y down

function build(src: any) {
  const M = parse(src);
  const warnings = M.warnings.slice(), warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const P0 = applyOpts(baseStyle(), opts(M.env || ''), null);
  const nodes = new Map(), texts = [], paths: any[] = [], tips: any[] = [], circles = [], edges: any[] = [];
  // sizes first: relative placement needs them
  for (const s of M.states) {
    const unknown: any[] = [];
    const S = applyNodeOpts({ ...P0, initial: false, accepting: false, state: false }, (s as any).o, unknown);
    for (const u of unknown) warn(`The state option "${u}" isn't drawn here (it is kept in the code)`);
    const t = lines(shown((s as any).text)), b = t ? TD.textBox(t, TEXT) : { w: 2, h: 0 };
    const n = { name: (s as any).name, S, t, b, x: 0, y: 0, r: 0, hw: 0, hh: 0, osep: S.lw / 2 };
    if (S.state) {
      n.r = Math.max(S.stateMin / 2, Math.hypot((b.w - 2) / 2 + INNER, halfH(t, b, EM) + INNER));
      if (S.accepting) n.osep = S.lw / 2 + DBL / 2;
    } else { n.hw = (b.w - 2) / 2 + INNER; n.hh = halfH(t, b, EM) + INNER; n.osep = 0; }
    nodes.set((s as any).name, n);
  }
  // positions (cm, y up)
  const at = new Map();
  // with neither at (x,y) nor a relative place a node sits at the origin, as in TikZ
  for (const s of M.states) if ((s as any).x != null) at.set((s as any).name, [(s as any).x, (s as any).y]); else if (!(s as any).rel) at.set((s as any).name, [0, 0]);
  const bare = M.states.filter((s) => (s as any).x == null && !(s as any).rel);
  if (bare.length > 1) warn(`${bare.length} states have no position and sit on top of each other at (0,0). Give them at (x,y), or use Auto layout in the editor`);
  for (let pass = 0; pass <= M.states.length; pass++) {
    let moved = false;
    for (const s of M.states) {
      if (at.has((s as any).name) || !(s as any).rel || !at.has((s as any).rel.of)) continue;
      const [bx, by] = at.get((s as any).rel.of), dir = (s as any).rel.dir, diag = /\s/.test(dir);
      const sx = /right/.test(dir) ? 1 : /left/.test(dir) ? -1 : 0, sy = /above/.test(dir) ? 1 : /below/.test(dir) ? -1 : 0;
      let dx, dy;
      if ((s as any).rel.old) { const d = P0.nd[0]; dx = dy = diag ? d * Math.SQRT1_2 : d; }
      else {
        const ds = (s as any).rel.d ? (s as any).rel.d.split(/\s+and\s+/).map(cm) : [];
        const two = ds.length > 1 || (!(s as any).rel.d && P0.nd[0] !== P0.nd[1]);
        dy = isFinite(ds[0]) ? ds[0] : P0.nd[0]; dx = isFinite(ds[1]) ? ds[1] : isFinite(ds[0]) ? ds[0] : P0.nd[1];
        if (diag && !two) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
        if (!P0.onGrid) {
          // border to border: the anchors facing each other
          const A = nodes.get((s as any).rel.of), B = nodes.get((s as any).name), ang = DIRS[dir], [ux, uy] = unit(ang);
          const ra = A ? reach(A, ux, uy) / PX : 0, rb = B ? reach(B, -ux, -uy) / PX : 0;
          dx += Math.abs(ux) * (ra + rb); dy += Math.abs(uy) * (ra + rb);
        }
      }
      at.set((s as any).name, [bx + sx * dx, by + sy * dy]); moved = true;
    }
    if (!moved) break;
  }
  const loose = M.states.filter((s) => !at.has((s as any).name));
  if (loose.length) {
    if (M.states.length > 1 || (loose[0] as any).rel) warn(loose.length === 1 ? `The state "${(loose[0] as any).name}" has no position: it is drawn where it might go. Give it at (x,y) (moving it in the editor does)` : `${loose.length} states have no position: they are drawn in a row. Give them at (x,y), or use Auto layout in the editor`);
    const pts = [...at.values()];
    let x0 = pts.length ? Math.max(...pts.map((p) => p[0])) + P0.nd[1] : 0;
    for (const s of loose) { at.set((s as any).name, [x0, 0]); x0 += Math.max(P0.nd[1], 1.5); }
  }
  for (const [name, n] of nodes) { const p = at.get(name); n.x = p[0] * PX; n.y = -p[1] * PX; }

  // states: circles, labels and initial arrows
  for (const n of nodes.values()) {
    const S = n.S, ink = S.stateDraw;
    if (n.r) {
      if (S.accepting) {
        const off = DBL / 2 + S.lw / 2;
        circles.push({ x: n.x, y: n.y, r: n.r, fill: S.stateFill, sw: 2 * S.lw + DBL, color: ink, name: n.name });
        circles.push({ x: n.x, y: n.y, r: n.r + off, sw: S.lw, color: ink, line: true });
        circles.push({ x: n.x, y: n.y, r: n.r - off, sw: S.lw, color: ink, line: true });
      } else circles.push({ x: n.x, y: n.y, r: n.r, fill: S.stateFill, sw: S.lw, color: ink, name: n.name, line: true });
    }
    if (n.t) texts.push({ t: n.t, x: n.x, y: n.y - lift(n.t, n.b, EM), b: n.b, color: S.textColor });
    if (S.initial) {
      const [ux, uy] = unit(DIRS[S.initWhere] ?? 180), rr = reach(n, ux, uy);
      const p0 = [n.x + ux * (rr + S.initDist), n.y + uy * (rr + S.initDist)], p1 = [n.x + ux * rr, n.y + uy * rr];
      const line = polyline([p0, p1]);
      arrowed(line, { ...P0, arrow: { s: null, e: '>' }, color: P0.color }, paths, tips, 'init:' + n.name);
      if (S.initText) {
        const t = shown(S.initText), b = TD.textBox(t, TEXT), d = INNER + Math.abs(ux) * ((b.w - 2) / 2) + Math.abs(uy) * halfH(t, b, EM) - Math.max(0, -uy) * ABOVE;
        texts.push({ t, x: p0[0] + ux * d, y: p0[1] + uy * d - lift(t, b, EM), b });
      }
    }
  }
  // transitions
  M.edges.forEach((e, idx) => {
    const A = nodes.get((e as any).a), B = nodes.get((e as any).b);
    if (!A || !B) return;
    const unknown: any[] = [];
    const G = applyOpts(applyOpts({ ...P0, arrow: { ...P0.arrow } }, opts(M.groups[(e as any).g] ? (M.groups[(e as any).g] as any).o : ''), null), (e as any).o, unknown);
    for (const u of unknown) warn(`The transition option "${u}" isn't drawn here (it is kept in the code)`);
    if ((e as any).loop && !G.loop) { G.loop = 'above'; G.dir = 'above'; [G.out, G.in] = LOOPS.above; G.loose = 8; G.minDist = 5 * MM; if (!G.arrow.e) G.arrow = { s: null, e: '>' }; }
    const plain = (e as any).op === '--';
    let pts;
    const dx = B.x - A.x, dy = B.y - A.y, base = (Math.atan2(-dy, dx) * 180) / Math.PI;
    const curved = !plain && ((e as any).loop || G.bend != null || G.out != null || G.in != null);
    let bez = null;
    if (!curved) {
      const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      const ra = reach(A, ux, uy), rb = reach(B, -ux, -uy);
      pts = [[A.x + ux * ra, A.y + uy * ra], [B.x - ux * rb, B.y - uy * rb]];
    } else {
      const outA = G.out != null ? (G.bend != null && !(e as any).loop ? base + G.out : G.out) : base + (G.bend || 0);
      const inA = G.in != null ? (G.bend != null && !(e as any).loop ? base + G.in : G.in) : base + 180 - (G.bend || 0);
      const u1 = unit(outA), u2 = unit(inA);
      const p0 = [A.x + u1[0] * reach(A, u1[0], u1[1]), A.y + u1[1] * reach(A, u1[0], u1[1])];
      const p3 = [B.x + u2[0] * reach(B, u2[0], u2[1]), B.y + u2[1] * reach(B, u2[0], u2[1])];
      const d = Math.max(G.minDist, G.loose * 0.3915 * Math.hypot(p3[0] - p0[0], p3[1] - p0[1]));
      const c1 = [p0[0] + u1[0] * d, p0[1] + u1[1] * d], c2 = [p3[0] + u2[0] * d, p3[1] + u2[1] * d];
      bez = [p0, c1, c2, p3];
      pts = [];
      for (let k = 0; k <= 48; k++) pts.push(bezAt(bez, k / 48));
    }
    const P = polyline(pts);
    arrowed(P, G, paths, tips, idx);
    // the label: on the path at pos, beside it (auto) or by its anchor
    let label = null;
    if ((e as any).t) {
      const lu: any[] = [], T = applyOpts({ ...G, arrow: { ...G.arrow } }, (e as any).lo || [], lu);
      for (const u of lu) warn(`The label option "${u}" isn't drawn here (it is kept in the code)`);
      const p = bez ? bezAt(bez, T.pos) : [pts[0][0] + (pts[1][0] - pts[0][0]) * T.pos, pts[0][1] + (pts[1][1] - pts[0][1]) * T.pos];
      const tan = bez ? bezTan(bez, T.pos) : [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
      const tl = Math.hypot(tan[0], tan[1]) || 1;
      const t = lines(shown((e as any).t)), b = TD.textBox(t, TEXT);
      let ux = 0, uy = 0;
      if (T.dir) [ux, uy] = unit(DIRS[T.dir]);
      else if (T.auto) {
        const side = T.auto * (T.swap ? -1 : 1);
        // left of the direction of travel (y down on screen)
        ux = (tan[1] / tl) * side; uy = (-tan[0] / tl) * side;
      }
      const [dx, dy] = T.dir || T.auto ? besideAt(b, t, ux, uy, EM, ABOVE) : [0, 0];
      label = { t, x: p[0] + dx, y: p[1] + dy - lift(t, b, EM), b, color: T.textColor || T.color };
      texts.push(label);
    }
    edges.push({ i: idx, a: (e as any).a, b: (e as any).b, d: ptsD(pts), P, loop: (e as any).loop, label });
  });
  // bounding box
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const p of paths) for (const m of p.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) { const x = +m[1], y = +m[2], h = p.sw / 2; ext(x - h, y - h, x + h, y + h); }
  for (const p of tips) for (const m of p.d.matchAll(/[MLQ](-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1], +m[2], +m[1], +m[2]);
  for (const c of circles) { const h = c.r + c.sw / 2; ext(c.x - h, c.y - h, c.x + h, c.y + h); }
  for (const t of texts) ext(t.x - t.b.w / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
  for (const n of nodes.values()) ext(n.x, n.y, n.x, n.y);
  if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
  if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
  if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
  return { M, P0, nodes, edges, paths, tips, circles, texts, warnings, empty: !M.states.length, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}
const bezAt = (b: any, t: any) => { const m = 1 - t; return [0, 1].map((k) => m * m * m * b[0][k] + 3 * m * m * t * b[1][k] + 3 * m * t * t * b[2][k] + t * t * t * b[3][k]); };
const bezTan = (b: any, t: any) => { const m = 1 - t; return [0, 1].map((k) => 3 * m * m * (b[1][k] - b[0][k]) + 6 * m * t * (b[2][k] - b[1][k]) + 3 * t * t * (b[3][k] - b[2][k])); };

// a path with its arrow tips: the line is shortened so each tip ends where TikZ puts it
function tipSize(kind: any, lw: any) {
  if (kind === 'to') return { len: 1.6 * PT + 2.2 * lw, inset: 0, w: 1.6 * PT + 2.2 * lw };
  if (kind === 'latex') { const l = 3 * PT + 4.5 * lw; return { len: l, inset: 0, w: 0.75 * l }; }
  const l = 3 * PT + 4.5 * lw; return { len: l, inset: 0.325 * l, w: 0.75 * l }; // Stealth
}
function arrowed(P: any, G: any, paths: any, tips: any, edge: any) {
  const L = P.len, kindOf = (k: any) => (k === '>' ? G.tip : k);
  let s0 = G.shortenS, s1 = L - G.shortenE;
  const heads = [];
  for (const [end, k] of [['s', G.arrow.s], ['e', G.arrow.e]]) {
    if (!k) continue;
    const kind = kindOf(k) || 'to', z = tipSize(kind, G.lw);
    const tipAt = end === 'e' ? s1 : s0;
    const q = along(P, tipAt), back = along(P, end === 'e' ? tipAt - z.len : tipAt + z.len);
    let ux = q.x - back.x, uy = q.y - back.y;
    const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    heads.push({ kind, z, x: q.x, y: q.y, ux, uy });
    const cutBy = kind === 'to' ? G.lw / 2 : z.len - z.inset;
    if (end === 'e') s1 = tipAt - cutBy; else s0 = tipAt + cutBy;
  }
  if (s1 > s0) paths.push({ d: ptsD(cut(P, s0, s1)), sw: G.lw, dash: G.dash, color: G.color, edge });
  for (const h of heads) {
    const { x, y, ux, uy, z } = h, nx = -uy, ny = ux, bx = x - ux * z.len, by = y - uy * z.len, w = z.w / 2;
    if (h.kind === 'to') {
      const cx = x - ux * z.len * 0.35, cy = y - uy * z.len * 0.35;
      tips.push({ d: `M${r2(bx + nx * w)},${r2(by + ny * w)}Q${r2(cx + nx * w * 0.2)},${r2(cy + ny * w * 0.2)} ${r2(x)},${r2(y)}Q${r2(cx - nx * w * 0.2)},${r2(cy - ny * w * 0.2)} ${r2(bx - nx * w)},${r2(by - ny * w)}`, stroke: true, sw: G.lw, color: G.color });
    } else if (h.kind === 'latex') {
      tips.push({ d: `M${r2(x)},${r2(y)}L${r2(bx + nx * w)},${r2(by + ny * w)}L${r2(bx - nx * w)},${r2(by - ny * w)}Z`, color: G.color });
    } else {
      const ix = bx + ux * z.inset, iy = by + uy * z.inset;
      tips.push({ d: `M${r2(x)},${r2(y)}L${r2(bx + nx * w)},${r2(by + ny * w)}L${r2(ix)},${r2(iy)}L${r2(bx - nx * w)},${r2(by - ny * w)}Z`, color: G.color });
    }
  }
}

// ---------------------------------------------------------------- automatic layout
// Layers from the initial state outwards (breadth first, left to right), each layer ordered by where its
// predecessors sit; or the states on a circle. Then transitions that would run through a state or over
// their reverse are bent, and loops turn to the freest side. Returns true when anything changed.
function autoLayout(M: any, mode = 'layers', step = 2.5) {
  const S = M.states;
  if (!S.length) return false;
  const names = S.map((s: any) => s.name), idx = new Map(names.map((n: any, i: any) => [n, i]));
  const out = names.map(() => []), inn = names.map(() => []);
  for (const e of M.edges) {
    if (e.loop || !idx.has(e.a) || !idx.has(e.b)) continue;
    out[(idx.get(e.a) as any)].push(idx.get(e.b)); inn[(idx.get(e.b) as any)].push(idx.get(e.a));
  }
  // breadth first from the initial states (then from any state not reached yet)
  const depth = names.map(() => -1), order: any[] = [];
  const roots = S.map((s: any, i: any) => (s.o.some(isInitial) ? i : -1)).filter((i: any) => i >= 0);
  const bfs = (r: any, d0: any) => {
    const q = [r]; depth[r] = d0;
    while (q.length) { const u = q.shift(); order.push(u); for (const v of out[u]) if (depth[v] < 0) { depth[v] = depth[u] + 1; q.push(v); } }
  };
  for (const r of roots) if (depth[r] < 0) bfs(r, 0);
  for (let i = 0; i < S.length; i++) if (depth[i] < 0) {
    // a state nobody reaches: next to what it leads to, else a new column
    const tgt = out[i].filter((v: any) => depth[v] >= 0).map((v: any) => depth[v]);
    bfs(i, tgt.length ? Math.max(0, Math.min(...tgt) - 1) : order.length ? Math.max(...depth) + 1 : 0);
  }
  const pos = names.map(() => [0, 0]);
  if (mode === 'circle') {
    const n = S.length, R = n === 1 ? 0 : Math.max(step * 0.75, (step * n) / (2 * Math.PI));
    order.forEach((u, k) => { const a = Math.PI - (2 * Math.PI * k) / n; pos[u] = [R * Math.cos(a), R * Math.sin(a)]; });
  } else {
    const layers: any[] = [];
    for (const u of order) (layers[depth[u]] = layers[depth[u]] || []).push(u);
    const rowOf = new Map();
    const place = (layer: any) => layer.forEach((u: any, k: any) => rowOf.set(u, (layer.length - 1) / 2 - k));
    layers.forEach((ly) => ly && place(ly));
    // two sweeps: order each layer by the mean row of the states it is joined to
    for (let sweep = 0; sweep < 2; sweep++) for (const ly of layers) {
      if (!ly || ly.length < 2) continue;
      const bary = (u: any) => { const nb = inn[u].concat(out[u]).filter((v: any) => rowOf.has(v) && depth[v] !== depth[u]); return nb.length ? nb.reduce((a: any, v: any) => a + rowOf.get(v), 0) / nb.length : rowOf.get(u); };
      const b = new Map(ly.map((u: any) => [u, bary(u)]));
      ly.sort((p: any, q: any) => (b.get as any)(q) - (b.get as any)(p));
      place(ly);
    }
    for (const u of order) pos[u] = [depth[u] * step, rowOf.get(u) * step];
  }
  const q = (v: any) => Math.round(v * 4) / 4;
  S.forEach((s: any, i: any) => { s.x = q(pos[i][0]); s.y = q(pos[i][1]); s.rel = null; });
  // bends: a pair of opposite transitions both bend left, so they part; one that would run through a
  // state takes the smallest bend, on either side, that clears every other state
  const at = new Map(S.map((s: any) => [s.name, [s.x, s.y]]));
  const isBendOpt = (it: any) => /^(bend left|bend right|out|in|looseness)$/.test(kv(it).k);
  const clearance = (A: any, B: any, bend: any, skip: any) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, base = Math.atan2(dy, dx), d = 0.3915 * L;
    const a1 = base + (bend * Math.PI) / 180, a2 = base + Math.PI - (bend * Math.PI) / 180;
    const bz = [A, [A[0] + Math.cos(a1) * d, A[1] + Math.sin(a1) * d], [B[0] + Math.cos(a2) * d, B[1] + Math.sin(a2) * d], B];
    let best = Infinity;
    for (let k = 1; k < 24; k++) {
      const p = bezAt(bz, k / 24);
      for (const [n, q] of at) if (!skip.includes(n)) best = Math.min(best, Math.hypot(p[0] - (q as any)[0], p[1] - (q as any)[1]));
    }
    return best;
  };
  const CLEAR = 0.75;
  for (const e of M.edges) {
    if (e.loop) continue;
    const A = at.get(e.a), B = at.get(e.b);
    if (!A || !B) continue;
    const back = M.edges.some((f: any) => f !== e && !f.loop && f.a === e.b && f.b === e.a);
    e.o = e.o.filter((it: any) => !isBendOpt(it));
    const skip = [e.a, e.b];
    if (clearance(A, B, 0, skip) >= CLEAR) { if (back) e.o.push('bend left'); continue; }
    let pick: any = null, most = -1;
    for (const a of [30, 45, 60, 75]) {
      for (const sgn of back ? [1] : [1, -1]) {
        const c = clearance(A, B, sgn * a, skip);
        if (c > most) { most = c; pick = sgn * a; }
        if (c >= CLEAR) break;
      }
      if (most >= CLEAR) break;
    }
    e.o.push(`bend ${pick > 0 ? 'left' : 'right'}${Math.abs(pick) !== 30 ? `=${Math.abs(pick)}` : ''}`);
  }
  // three or more transitions between two states, or two the same way: a fan
  const bundles = new Map<string, any[]>();
  for (const e of M.edges) if (!e.loop && e.a !== e.b) { const k = [e.a, e.b].sort().join('\u0001'); (bundles.get(k) || bundles.set(k, []).get(k))!.push(e); }
  for (const b of bundles.values()) if (b.length > 2 || (b.length === 2 && b[0].a === b[1].a)) fan(b, b[0].a);
  // loops: the side with the most room
  for (const e of M.edges) {
    if (!e.loop || !at.has(e.a)) continue;
    const A = at.get(e.a), dirs = [];
    for (const f of M.edges) {
      if (f.loop) continue;
      const o = f.a === e.a ? f.b : f.b === e.a ? f.a : null;
      if (o && at.has(o)) { const B = at.get(o); dirs.push(Math.atan2((B as any)[1] - (A as any)[1], (B as any)[0] - (A as any)[0])); }
    }
    if (mode === 'circle' && S.length > 1) dirs.push(Math.atan2(-(A as any)[1], -(A as any)[0]));
    // and the initial arrow
    const st = S.find((s: any) => s.name === e.a);
    if (st && st.o.some(isInitial)) { const N = applyNodeOpts({ initWhere: 'left' }, st.o, null); dirs.push(((DIRS[N.initWhere] ?? 180) * Math.PI) / 180); }
    let best: any = 'above', gap = -1;
    for (const [side, a] of [['above', 90], ['below', 270], ['left', 180], ['right', 0]]) {
      const r = ((a as any) * Math.PI) / 180, g = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(r - d), Math.cos(r - d))))) : side === 'above' ? 1 : 0;
      if (g > gap + 1e-6) { gap = g; best = side; }
    }
    e.o = e.o.filter((it: any) => !/^loop( (above|below|left|right))?$/.test(kv(it).k)).concat(`loop ${best}`);
    // an explicit side on the label would fight the new loop
    if (e.lo) e.lo = e.lo.filter((it: any) => DIRS[kv(it).k] == null);
  }
  return true;
}

// ---------------------------------------------------------------- drawing
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const ink = TD.css(s.color || '#000000'), col = (c: any) => (c ? TD.css(c) : ink);
  let out = '';
  if (Lo.empty) {
    const b = Lo.bb;
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty state machine', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  for (const c of Lo.circles) {
    if (c.line) continue;
    // an accepting state: the double line's body, in the paper colour, between its two lines
    out += `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(c.r)}" fill="${c.fill ? TD.css(c.fill) : 'none'}" stroke="${ctx.paper || '#ffffff'}" stroke-width="${r2(c.sw)}"/>`;
  }
  for (const c of Lo.circles) {
    if (!c.line) continue;
    const fill = c.name && c.fill ? TD.css(c.fill) : 'none';
    out += `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(c.r)}" fill="${fill}" stroke="${col(c.color)}" stroke-width="${r2(c.sw)}"/>`;
  }
  for (const p of Lo.paths) {
    const dash = p.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : p.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + p.sw)}" stroke-linecap="round"` : '';
    out += `<path d="${p.d}" fill="none" stroke="${col(p.color)}" stroke-width="${r2(p.sw)}" stroke-linejoin="round"${dash}/>`;
  }
  for (const t of Lo.tips) {
    out += t.stroke ? `<path d="${t.d}" fill="none" stroke="${col(t.color)}" stroke-width="${r2(t.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${t.d}" fill="${col(t.color)}" stroke="none"/>`;
  }
  for (const t of Lo.texts) out += TD.textSvg(t.t, TEXT, t.color || s.color || '#000000', t.x, t.y, ctx);
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{tikzpicture\}/.test(t) ? t : `\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`;
}
// the libraries the code asks for
function libsOf(src: any) {
  const libs = ['automata'];
  if (/=\s*(?:[^,\]]*\s)?of\s/.test(src)) libs.push('positioning');
  if (/(?:>|-)\s*=?\s*\{?\s*(Stealth|Latex|Triangle|To|Straight Barb|Classical TikZ Rightarrow|Computer Modern Rightarrow)\b/.test(src)) libs.push('arrows.meta');
  if (/stealth'|latex'|triangle 45/.test(src)) libs.push('arrows');
  return libs;
}

// a small drawing of a snippet (palette previews)
TD.fsmMini = (src: any, maxH = 30) => {
  const s = { type: 'automata', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
  return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
};

TD.TYPES.automata = {
  name: 'State machine',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'automata', x: p.x, y: p.y, src: TD.FSM_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the picture's own coordinates, its tikzpicture turned into a scope moved to where the drawing sits
  tikz(s: any, X: any) {
    for (const l of libsOf(s.src)) X.libs.add(l);
    const b = layout(s).bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`];
    const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    if (col) o.push(`color=${col}`);
    const t = fullCode(s.src), m = /\\begin\{tikzpicture\}\s*(\[)?/.exec(t);
    let env = '', i = m!.index + m![0].length;
    if (m![1]) { const e = close(t, i - 1); env = t.slice(i, e).trim(); i = e + 1; }
    const end = t.lastIndexOf('\\end{tikzpicture}');
    const body = t.slice(i, end < 0 ? t.length : end).replace(/^\s*\n/, '').replace(/\s+$/, '');
    if (env) o.push(env);
    return `\\begin{scope}[${o.join(', ')}]\n${body}\n\\end{scope}`;
  },
};


// for the visual editor (src/editors/fsmeditor.ts)
// ---------------------------------------------------------------- fans of parallel edges
// n edges between the same two nodes: bend angles (left of a→b positive) whose midpoints sit evenly apart
// (a bend θ puts the middle 0.29·L·sin θ off the line): the outermost ±30° for two, ±49° for three, 60° from
// four on; an odd count keeps a straight one in the middle
function fanAngles(n: number) {
  const s = n <= 1 ? 0 : Math.min(0.5 + 0.25 * (n - 2), Math.sin(Math.PI / 3)) / ((n - 1) / 2);
  return Array.from({ length: n }, (_, i) => { const a = Math.round((Math.asin(s * (i - (n - 1) / 2)) * 180) / Math.PI); return a === 0 ? 0 : a; });
}
const isFanOpt = (it: string) => /^(bend left|bend right|out|in|looseness)$/.test(kv(it).k);
// an edge's bend seen from a towards the other end (left positive)
function bendFrom(e: any, a: string) {
  for (const it of e.o) {
    const { k, v } = kv(it);
    if (k === 'bend left' || k === 'bend right') { const x = v == null ? 30 : parseFloat(v); const t = (k === 'bend left' ? 1 : -1) * (isFinite(x) ? x : 30); return e.a === a ? t : -t; }
  }
  return 0;
}
// bend every edge of a bundle (edges between a and one other node, either way) into a fan, keeping their
// order from right to left of a→b; `last` (a new edge) takes the left end
function fan(bundle: any[], a: string, last?: any) {
  const order = bundle.filter((e) => e !== last).sort((p, q) => bendFrom(p, a) - bendFrom(q, a));
  if (last) order.push(last);
  const th = fanAngles(order.length);
  order.forEach((e, i) => {
    const t = e.a === a ? th[i] : -th[i];
    e.o = e.o.filter((x: string) => !isFanOpt(x));
    if (t) e.o.unshift(`bend ${t > 0 ? 'left' : 'right'}${Math.abs(t) !== 30 ? `=${Math.abs(t)}` : ''}`);
  });
}
TD.fsm = { parse, write, layout, fan, lines, isMultiline, draw, along, kv, opts, unbrace, fullCode, shown, num, autoLayout, isInitial, isAccepting, applyNodeOpts, baseStyle, DIRS, LOOPS, TEXT, libsOf };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("automata", {
  menu: { order: 9, label: "Automaton", title: "State machine, written with the TikZ automata library", icon: "<svg viewBox=\"0 0 32 24\"><circle cx=\"9\" cy=\"14\" r=\"4.5\"/><circle cx=\"24\" cy=\"14\" r=\"4.5\" class=\"a1\"/><circle cx=\"24\" cy=\"14\" r=\"2.6\"/><path d=\"M13.5 14h6M17.5 12l2 2-2 2\"/><path d=\"M1 14h3.5M2.8 12.2l1.8 1.8-1.8 1.8\"/><path d=\"M7.4 9.8C5.5 3.5 12.5 3.5 10.6 9.8\"/></svg>" },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.fsmEditor, alias: "fsmOpen", layout: (s) => TD.fsm.layout(s) }
});
export { layout, libsOf, fullCode };
// shared with the Graph block (src/domain/graph.ts)
export { fan, fanAngles, lines, isMultiline, halfH, lift, besideAt, close, split, opts, kv, unbrace, stripComments, shown, skip, nextSemi, cm, coord, num, applyOpts, baseStyle, polyline, along, cut, ptsD, unit, bezAt, bezTan, arrowed, tipSize, DIRS, LOOPS, TEXT, WIDTHS, POS };
