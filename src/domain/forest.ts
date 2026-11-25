import { runtime as TD } from '../runtime';
import { unbraceOnce as unbrace } from './tex-groups';
import { layoutCache } from './layout-cache';
// Trees written for the forest package. The source is the object: the bracket code is drawn here as
// vectors (an approximation of forest's packing) and exported unchanged inside \begin{forest}.
// The visual editor (js/fteditor.ts) rewrites the code from the tree it holds.
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

TD.FT_DEFAULT = [
  '\\begin{forest}',
  '  for tree={draw, rounded corners}',
  '  [Root',
  '    [Branch [Leaf] [Leaf]]',
  '    [Branch [Leaf]]',
  '  ]',
  '\\end{forest}',
].join('\n');

// ---------------------------------------------------------------- parsing
// index of the } closing the { at s[i], skipping escapes
function close(s: any, i: any) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return k;
  }
  return -1;
}
const stripComments = (src: any) => src.split('\n').map((l: any) => {
  for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); }
  return l;
}).join('\n');
// split at a character outside {groups}
function splitTop(s: any, ch: any) {
  const out = [];
  let d = 0, a = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === ch && d === 0) { out.push(s.slice(a, i)); a = i + 1; }
  }
  out.push(s.slice(a));
  return out;
}
// "key=value" → { k, v, op ('', '+', '-', '*', ':'), prime }; a bare key has v null
function opt(str: any) {
  const p = splitTop(str, '=');
  const raw = p[0].trim().replace(/\s+/g, ' ');
  if (p.length < 2) return { k: raw, v: null, op: '', prime: false };
  const m = /^(.*?)(')?([+\-*:]?)$/.exec(raw);
  return { k: m![1].trim(), prime: !!m![2], op: m![3], v: unbrace(p.slice(1).join('=')) };
}
const optList = (s: any) => splitTop(String(s || ''), ',').map((x) => x.trim()).filter(Boolean);
// the nodes of an edge label: node[options](name){text} …, or null when it holds anything else
function edgeNodes(v: string) {
  const s = String(v), out: any[] = [];
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  for (;;) {
    ws();
    if (i >= s.length) return out.length ? out : null;
    if (!s.startsWith('node', i)) return null;
    i += 4; ws();
    let o = '', name = '';
    for (;;) {
      if (s[i] === '[') { let d = 0, k = i; for (; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (!d && c === ']') break; } o += (o ? ',' : '') + s.slice(i + 1, k); i = k + 1; ws(); }
      else if (s[i] === '(') { const k = s.indexOf(')', i); if (k < 0) return null; name = s.slice(i + 1, k).trim(); i = k + 1; ws(); }
      else break;
    }
    if (s[i] !== '{') return null;
    const e = close(s, i);
    if (e < 0) return null;
    out.push({ o: optList(o).map((x) => opt(x)), t: s.slice(i + 1, e).trim(), name });
    i = e + 1;
  }
}
// A condition on a node's count: `if level=1{yes}{no}`, `where n children=0{yes}{no}`, `if level<=2{…}{…}` (at most) or
// `>=` (at least), as forest writes them. Its key (level, n children, n, n'), test, branches, and for `where` the `if`
// each node of the subtree runs. null for a condition on something else (content, nodewalks …).
function cond(o: any) {
  if ((o.k === 'where' || o.k === 'if') && o.v != null) return exprCond(o);
  const m = /^(where|if) (level|n children|n|content)([<>]?)$/.exec(o.k);
  if (!m || o.v == null) return null;
  const key = m[2] + (o.prime ? "'" : ''), rel = m[3], v = String(o.v);
  // the value (a group or up to the first group), then the two branches
  const groups: string[] = [];
  let i = 0, head = '';
  while (i < v.length && /\s/.test(v[i])) i++;
  if (v[i] === '{') { const e = close(v, i); if (e < 0) return null; head = v.slice(i + 1, e); i = e + 1; }
  else { const b = v.indexOf('{', i); head = (b < 0 ? v.slice(i) : v.slice(i, b)); i = b < 0 ? v.length : b; }
  while (groups.length < 2) {
    while (i < v.length && /\s/.test(v[i])) i++;
    if (v[i] !== '{') break;
    const e = close(v, i); if (e < 0) return null;
    groups.push(v.slice(i + 1, e)); i = e + 1;
  }
  const n = Number(head.trim()), text = key === 'content';
  if (!groups.length || (!text && !Number.isFinite(n)) || (text && rel)) return null;
  const [yes, no = ''] = groups;
  const test = (x: any) => (text ? String(x).trim() === head.trim() : rel === '<' ? x <= n : rel === '>' ? x >= n : x === n);
  return { key, test, yes, no, where: m[1] === 'where', asIf: `if ${m[2]}${o.prime ? "'" : ''}${rel}={${head.trim()}}{${yes}}{${no}}` };
}

// where={expr}{yes}{no} / if={expr}{yes}{no}: a pgfmath condition, true when not 0, on the node's level(), n(), n'() and
// n_children() (bare or called), numbers, + - * /, comparisons, && || !, and iseven, isodd, int, floor, abs, min, max,
// mod; null for anything else (content(), registers, nodewalks …)
function exprCond(o: any) {
  const v = String(o.v), groups: string[] = [];
  let i = 0;
  while (groups.length < 3) {
    while (i < v.length && /\s/.test(v[i])) i++;
    if (v[i] !== '{') break;
    const e = close(v, i); if (e < 0) return null;
    groups.push(v.slice(i + 1, e)); i = e + 1;
  }
  if (groups.length < 2) return null;
  const [expr, yes, no = ''] = groups, f = mathOf(expr);
  if (!f) return null;
  return { key: '', test: (_: any, value: any) => f(value) !== 0, yes, no, where: o.k === 'where', asIf: `if={${expr}}{${yes}}{${no}}`, expr: true };
}
// the {…} groups a value is made of
function groupsOf(v: string) {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    while (i < v.length && /\s/.test(v[i])) i++;
    if (v[i] !== '{') return i >= v.length ? out : [];
    const e = close(v, i); if (e < 0) return [];
    out.push(v.slice(i + 1, e)); i = e + 1;
  }
}
// a number as pgfmath writes its result: 2.0, 0.5
const pgfNum = (x: number) => (Number.isFinite(x) ? (Number.isInteger(x) ? `${x}.0` : String(+x.toFixed(5))) : null);
function mathOf(src: string): ((v: any) => number) | null {
  const toks = src.match(/\d+\.?\d*|\.\d+|n_children|n'|[A-Za-z_]+|<=|>=|==|!=|&&|\|\||[-+*/<>()!,]|\S/g) || [];
  let i = 0;
  const FN: Record<string, (...a: number[]) => number> = { iseven: (x) => +(Math.trunc(x) % 2 === 0), isodd: (x) => +(Math.abs(Math.trunc(x)) % 2 === 1), int: Math.trunc, floor: Math.floor, abs: Math.abs, min: Math.min, max: Math.max, mod: (a, b) => a % b };
  const OPT: Record<string, string> = { level: 'level', n: 'n', "n'": "n'", n_children: 'n children' };
  type E = (v: any) => number;
  const peek = () => toks[i], eat = (t: string) => (toks[i] === t ? (i++, true) : false);
  const bin = (next: () => E | null, ops: Record<string, (a: number, b: number) => number>) => (): E | null => {
    let a = next();
    while (a && ops[peek()]) { const op = ops[toks[i++]], b = next(); if (!b) return null; const l = a; a = (v) => op(l(v), b(v)); }
    return a;
  };
  const prim = (): E | null => {
    const t = toks[i++];
    if (t == null) return null;
    if (t === '(') { const e = or(); return e && eat(')') ? e : null; }
    if (t === '-') { const e = prim(); return e && ((v) => -e(v)); }
    if (t === '+') return prim();
    if (t === '!') { const e = prim(); return e && ((v) => +!e(v)); }
    if (/^[\d.]/.test(t)) { const n = +t; return () => n; }
    if (OPT[t]) { if (eat('(')) { if (!eat(')')) return null; } const k = OPT[t]; return (v) => v[k]; }
    if (FN[t] && eat('(')) {
      const args: E[] = [];
      if (!eat(')')) { for (;;) { const e = or(); if (!e) return null; args.push(e); if (eat(')')) break; if (!eat(',')) return null; } }
      return (v) => FN[t](...args.map((a) => a(v)));
    }
    return null;
  };
  const mul = bin(prim, { '*': (a, b) => a * b, '/': (a, b) => a / b });
  const add = bin(mul, { '+': (a, b) => a + b, '-': (a, b) => a - b });
  const cmp = bin(add, { '<': (a, b) => +(a < b), '>': (a, b) => +(a > b), '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b), '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b) });
  const and = bin(cmp, { '&&': (a, b) => +(a && b) });
  const or = bin(and, { '||': (a, b) => +(a || b) });
  const e = or();
  return e && i === toks.length ? e : null;
}

// a style's definition (name/.style={…} and its kinds), and forest's stages, whose keys are this node's
const STYLE_DEF = /\/\.(style|append style|prefix style|style \d+ args|style n args|default|code|forest style)$/;
// (before computing xy and before drawing tree come after packing: an l or s set before computing xy is where compute
// xy puts the node from its parent; set before drawing tree it is read by nothing)
const LATE = new Set(['before computing xy', 'before drawing tree']), PLACING = /^(l|s|x|y|tempdim\w*|tempcount\w*)$/;
const STAGES = new Set(['before typesetting nodes', 'before packing', 'before packing node', 'after packing node', 'before computing xy', 'before drawing tree', 'delay']);
// the styles a list of options defines: name → its keys for a value (#1, or #1#2… from {a}{b})
function styleDefs(list: string[]) {
  const body = new Map<string, string>(), args = new Map<string, number>(), dflt = new Map<string, string>();
  for (const str of list) {
    const o = opt(str), m = /^(.+?)\/\.(style|append style|style (\d+) args|style n args|default)$/.exec(o.k);
    if (!m || o.v == null) continue;
    const nm = m[1].trim();
    if (m[2] === 'default') { dflt.set(nm, o.v); continue; }
    let b = String(o.v), n = m[3] ? +m[3] : 1;
    if (m[2] === 'style n args') { const g = /^\s*\{?\s*(\d+)\s*\}?\s*\{([\s\S]*)\}\s*$/.exec(b); if (!g) continue; n = +g[1]; b = g[2]; }
    body.set(nm, m[2] === 'append style' && body.has(nm) ? `${body.get(nm)}, ${b}` : b);
    args.set(nm, n);
  }
  const out = new Map<string, (v: any) => string>();
  for (const [nm, b] of body) out.set(nm, (v: any) => {
    const val = v == null ? dflt.get(nm) ?? '' : String(v), n = args.get(nm) || 1, a: string[] = [];
    if (n > 1) { let i = 0; while (a.length < n) { while (/\s/.test(val[i] || '')) i++; if (val[i] !== '{') { a.push(''); continue; } const e = close(val, i); a.push(val.slice(i + 1, e)); i = e + 1; } }
    else a.push(val);
    // #1 … #9 take the arguments; ## is a # for a style defined inside this one
    return b.replace(/(#+)(\d)/g, (all: string, h: string, d: string) => (h.length === 1 ? a[+d - 1] ?? '' : h.slice(h.length / 2) + d));
  });
  return out;
}
// the styles of a document's \tikzset{…} and \tikzstyle{…}=[…] lines (forest hands a node's keys it doesn't know to
// TikZ), then its \forestset{…} lines
function forestsets(pre: unknown) {
  const tikz: string[] = [], forest: string[] = [], s = String(pre || '');
  for (const m of s.matchAll(/\\(tikzset|forestset)\s*\{/g)) {
    const e = close(s, m.index! + m[0].length - 1);
    if (e > 0) (m[1] === 'forestset' ? forest : tikz).push(...optList(s.slice(m.index! + m[0].length, e)).filter((x) => /\/\.(style|append style|style \d+ args|style n args|default)\s*=/.test(x) || m[1] === 'forestset'));
  }
  for (const m of s.matchAll(/\\tikzstyle\s*\{([^{}]*)\}\s*=?\s*\[/g)) {
    let d = 0, k = m.index! + m[0].length;
    for (; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (!d && c === ']') break; }
    tikz.push(`${m[1].trim()}/.style={${s.slice(m.index! + m[0].length, k)}}`);
  }
  return { tikz, forest };
}
// what forest runs on the root before the tree's own preamble: the defaults of the libraries loaded with them
// (\usepackage[linguistics]{forest}, \useforestlibrary*{…}, \forestapplylibrarydefaults{…}), then the document's
// default preamble (a keylist: = and += add to it, '= sets it)
const LIB_DEFAULTS: Record<string, string> = { linguistics: 'sn edges, for tree={align=center}' };
function defaultPreamble(tex: any, forest: string[]) {
  const out: string[] = [], libs = new Set<string>(), t = String(tex?.preamble || '');
  for (const p of tex?.pkgs || []) { const m = /^forest\[(.+)\]$/.exec(String(p)); if (m) libs.add(m[1].trim()); }
  for (const m of t.matchAll(/\\useforestlibrary\*\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}|\\forestapplylibrarydefaults\s*\{([^}]*)\}/g)) for (const x of (m[1] ?? m[2]).split(',')) libs.add(x.trim());
  for (const l of libs) if (LIB_DEFAULTS[l]) out.push(...optList(LIB_DEFAULTS[l]));
  for (const str of forest) {
    const o = opt(str);
    if (o.k !== 'default preamble' || o.v == null) continue;
    if (o.prime && !o.op) out.length = 0;
    out.push(...optList(o.v));
  }
  return { pre: out, ling: libs.has('linguistics') };
}
const allOpts = (n: any, out: string[] = [], depth = 0): string[] => { out.push(...n.o); if (depth < 200) for (const k of n.k) allOpts(k, out, depth + 1); return out; };
// the style definitions in a list of options, with those inside for tree={…}, stages and the like (defined there when
// they run: the tree's styles are read once, all before it)
function defsIn(list: string[], out: string[] = [], depth = 0): string[] {
  for (const str of list) {
    const o = opt(str);
    if (STYLE_DEF.test(o.k)) out.push(str);
    else if (o.v != null && depth < 8 && /\/\.(style|append style)/.test(o.v) && (/^(for|where|if)\b/.test(o.k) || STAGES.has(o.k))) defsIn(optList(o.v), out, depth + 1);
  }
  return out;
}

function unwrap(src: any) {
  const t = stripComments(String(src || ''));
  const m = /\\begin\{forest\}([\s\S]*?)(\\end\{forest\}|$)/.exec(t);
  return m ? { wrapped: true, inner: m[1] } : { wrapped: false, inner: t };
}
// the bracket code → { pre: [options], root: node | null }; node: { c: content, o: [options], k: [children] }
function parse(inner: any, warn: any = () => {}) {
  const s = inner;
  let start = -1, d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === '[' && d === 0) { start = i; break; }
  }
  const pre = optList(start < 0 ? s : s.slice(0, start));
  if (start < 0) return { pre, root: null };
  let j = start;
  // up to the first of `stops` outside {groups}
  const scan = (from: any, stops: any) => {
    let dd = 0, k = from;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') dd++;
      else if (c === '}') dd--;
      else if (dd === 0 && stops.includes(c)) break;
    }
    return Math.min(k, s.length);
  };
  // a subtree past 200 levels deep (hostile input) is skipped whole, so no reader recurses that far
  const skipTree = () => {
    let dd = 0, b = 0;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') dd++;
      else if (c === '}') dd--;
      else if (dd === 0 && c === '[') b++;
      else if (dd === 0 && c === ']' && --b === 0) { j++; return; }
    }
  };
  function node(depth = 0) {
    j++; // past [
    const n = { c: '', o: ([] as any[]), k: [] as any[] };
    let k = j;
    while (k < s.length && /\s/.test(s[k])) k++;
    let braced = false;
    // content in braces: {a, b}
    if (s[k] === '{') {
      const e = close(s, k);
      if (e > 0) {
        let q = e + 1;
        while (q < s.length && /\s/.test(s[q])) q++;
        if (q >= s.length || /[,[\]]/.test(s[q])) { n.c = s.slice(k + 1, e); braced = true; j = q; }
      }
    }
    if (!braced) { const e = scan(j, ',[]'); n.c = s.slice(j, e).trim(); j = e; }
    if (s[j] === ',') { const e = scan(j + 1, '[]'); n.o = optList(s.slice(j + 1, e)); j = e; }
    for (;;) {
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j >= s.length) { warn('A ] is missing at the end of the tree'); return n; }
      if (s[j] === '[') {
        if (depth >= 200) { warn('The tree is nested too deep: the deepest levels are left out'); skipTree(); continue; }
        n.k.push(node(depth + 1)); continue;
      }
      if (s[j] === ']') { j++; return n; }
      const e = scan(j, '[]');
      warn(`Ignored “${s.slice(j, e).trim().slice(0, 24)}” between children`);
      j = e;
    }
  }
  const root = node();
  // TikZ code after the tree (drawn in forest's picture with it); kept, so the editor writes it back
  const after = s.slice(j).trim();
  return { pre, root, ...(after ? { after } : {}) };
}

// ---------------------------------------------------------------- writing
// a content that would end early (a comma or bracket), be read as an option (=), or lose its braces, is written in braces
function contentCode(c: any) {
  let d = 0;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{') d++;
    else if (ch === '}') d--;
    else if (d === 0 && (ch === ',' || ch === '[' || ch === ']' || ch === '=')) return `{${c}}`;
  }
  if (c[0] === '{' && close(c, 0) === c.length - 1) return `{${c}}`;
  return c;
}
const head = (n: any) => contentCode(n.c) + (n.o.length ? `, ${n.o.join(', ')}` : '');
const inline = (n: any) => `[${head(n)}${n.k.map((k: any) => ' ' + inline(k)).join('')}]`;
// one node per line, except a node whose children are all leaves and fit on the line
function code(T: any) {
  const lines = [];
  if (T.pre.length) lines.push('  ' + T.pre.join(', '));
  const out = (n: any, ind: any) => {
    const one = inline(n);
    if (!n.k.length || (n.k.every((k: any) => !k.k.length) && ind.length + one.length <= 64)) { lines.push(ind + one); return; }
    lines.push(`${ind}[${head(n)}`);
    for (const k of n.k) out(k, ind + '  ');
    lines.push(`${ind}]`);
  };
  if (T.root) out(T.root, '  ');
  if (T.after) lines.push(...String(T.after).split('\n').map((l: string) => '  ' + l.trim()));
  return `\\begin{forest}\n${lines.join('\n')}${lines.length ? '\n' : ''}\\end{forest}`;
}
// the code as it goes into LaTeX: always a full forest environment
function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{forest\}/.test(t) ? t : `\\begin{forest}\n${t}\n\\end{forest}`;
}

// ---------------------------------------------------------------- style
const SHAPES = new Set(['circle', 'ellipse', 'rectangle']);
const DASH: Record<string, any> = { dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], dotted: [0.4, 2], 'densely dotted': [0.4, 1], 'loosely dotted': [0.4, 4], solid: null };
const WIDTH: Record<string, any> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const SILENT = new Set(['name', 'baseline', 's', 'sn edges']);
const DRAWN_ELSEWHERE: string[] = [];
// label=[options]where:text and pin=…: where is a direction (right, above left …) or an angle; above by default
const LABEL_DIR: Record<string, [number, string]> = {
  right: [0, 'east'], above: [90, 'north'], left: [180, 'west'], below: [270, 'south'], east: [0, 'east'], north: [90, 'north'], west: [180, 'west'], south: [270, 'south'],
  'above right': [45, 'north east'], 'above left': [135, 'north west'], 'below left': [225, 'south west'], 'below right': [315, 'south east'],
  'north east': [45, 'north east'], 'north west': [135, 'north west'], 'south west': [225, 'south west'], 'south east': [315, 'south east'],
};
function labelOf(v: string, pin: boolean) {
  let s = unbrace(String(v)), o = '';
  if (s.startsWith('[')) { let d = 0, k = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (!d && c === ']') break; } o = s.slice(1, k); s = s.slice(k + 1); }
  let at = 'above', d = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    else if (!d && c === ':') { const w = s.slice(0, k).trim().replace(/\s+/g, ' '); if (LABEL_DIR[w] || /^[-+]?\d+(\.\d+)?$/.test(w)) { at = w; s = s.slice(k + 1); } break; }
  }
  return { t: unbrace(s.trim()), at, o: optList(o).map((x) => opt(x)), pin };
}
const SIZE_CMD: Record<string, any> = { tiny: 'tiny', scriptsize: 'scriptsize', footnotesize: 'footnotesize', small: 'small', normalsize: 'normalsize', large: 'large', Large: 'Large', LARGE: 'LARGE', huge: 'huge', Huge: 'Huge' };
// forest's own anchors (children, -parent, parent first, children last' …): an angle from the node's grow, its parent's
// and their order, then (unprimed) snapped to the compass point nearest it, as forest.sty's \forest@anchor@@… do;
// a compass name, an angle (primed: a point on the border), or null for any other anchor
const COMPASS_AT: Record<number, string> = { 0: 'east', 45: 'north east', 90: 'north', 135: 'north west', 180: 'west', 225: 'south west', 270: 'south', 315: 'south east' };
const mod360 = (a: number) => ((a % 360) + 360) % 360;
function forestAnchor(st: any, pst: any, name: string) {
  let nm = String(name || '').trim().replace(/\s+/g, ' ');
  const prime = nm.endsWith("'");
  if (prime) nm = nm.slice(0, -1).trim();
  const g = st.grow ?? 270, rv = !!st.rev, pg = pst.grow ?? 270, prv = !!pst.rev;
  const first = (G: number, R: boolean) => G + (R ? 90 : -90), last = (G: number, R: boolean) => G + (R ? -90 : 90);
  // (\numexpr: integers, a half rounded away from zero)
  const avg = (a: number, b: number) => { const t = Math.trunc(mod360(a - b + 540)), h = (t - 180) / 2; return mod360(360 + b + Math.sign(h) * Math.round(Math.abs(h))); };
  const A = ({
    children: g, '-children': 180 + g, parent: pg + 180, '-parent': pg, first: first(g, rv), last: last(g, rv),
    'parent first': avg(pg + 180, first(pg, prv)), '-parent first': avg(pg, first(pg, prv)), 'parent last': avg(pg + 180, last(pg, prv)), '-parent last': avg(pg, last(pg, prv)),
    'children first': avg(g, first(g, rv)), '-children first': avg(180 + g, first(g, rv)), 'children last': avg(g, last(g, rv)), '-children last': avg(180 + g, last(g, rv)),
  } as Record<string, number>)[nm];
  if (A == null) return null;
  return prime ? mod360(A) : COMPASS_AT[mod360(Math.round(mod360(A) / 45) * 45)];
}
const CALIGN = new Set(['child', 'child edge', 'midpoint', 'edge midpoint', 'fixed angles', 'fixed edge angles']);
const GROW: Record<string, any> = { south: 270, north: 90, east: 0, west: 180, down: 270, up: 90, right: 0, left: 180 };

// length with a unit → px; a bare number is pt. em: the tree's font size.
function len(v: any, E: any) {
  // n\baselineskip: 1.2 of the font size, as LaTeX's sizes have it
  const b = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))?\s*\\baselineskip\s*$/.exec(String(v));
  if (b) return (b[1] == null ? 1 : +b[1]) * 1.2 * E;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:\s*\*\s*(?:\d+\.?\d*|\.\d+))*)\s*(pt|em|ex|cm|mm|in|bp)?\s*$/.exec(String(v));
  if (!m) return NaN;
  const n = m[1].split('*').reduce((a: number, x: string) => a * +x.trim(), 1); // 10*1.3em: a product
  return { pt: n / K, em: n * E, ex: n * E * 0.43, cm: n * PX, mm: n * PX / 10, in: n * 2.54 * PX, bp: n * 1.00375 / K }[m[2] || 'pt'];
}
const colorOf = (v: any) => (TD.tikzColor ? TD.tikzColor(v) : undefined);
// edge options: arrows, colour, dash, width
function edgeStyle(ed: any, list: any, warn: any) {
  for (const str of list) {
    const o = opt(str), k = o.k;
    if (o.v == null && k.includes('-') && !/\s/.test(k)) { // ->, <-, <->, -{Stealth}, -latex
      const i = k.lastIndexOf('-'), a = k.slice(0, i).trim(), b = k.slice(i + 1).trim();
      ed.start = !!a; ed.end = !!b;
    } else if (k === 'draw' && o.v === 'none') ed.none = true;
    else if ((k === 'draw' || k === 'color') && o.v != null) { const c = colorOf(o.v); if (c) ed.color = c; }
    else if (k in DASH && o.v == null) ed.dash = DASH[k];
    else if (k in WIDTH && o.v == null) ed.lw = WIDTH[k] / K;
    else if (k === 'line width') { const w = len(o.v, 10 / K); if (w! > 0) ed.lw = w; }
    else if (o.v == null && colorOf(k)) ed.color = colorOf(k);
    else if (k !== 'draw') warn(`Not drawn: edge option “${k}”`);
  }
}

// ---------------------------------------------------------------- layout
// a node's text split at each \\ outside groups, $…$ and environments: its rows, with a \\[len]'s length
function rowsOf(c: string) {
  const out: { t: string, extra: string }[] = [];
  let d = 0, env = 0, math = false, a = 0, extra = '';
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '\\') {
      if (c[i + 1] === '\\' && !d && !env && !math) {
        let j = i + 2, x = '';
        const m = /^\s*\[([^\]]*)\]/.exec(c.slice(j));
        if (m) { x = m[1]; j += m[0].length; }
        out.push({ t: c.slice(a, i), extra }); extra = x;
        while (j < c.length && /\s/.test(c[j])) j++;
        a = j; i = j - 1; continue;
      }
      if (c.startsWith('begin', i + 1)) env++; else if (c.startsWith('end', i + 1) && !/[A-Za-z]/.test(c[i + 4] || '')) env = Math.max(0, env - 1);
      i++; continue;
    }
    if (ch === '{') d++; else if (ch === '}') d--; else if (ch === '$') math = !math;
  }
  out.push({ t: c.slice(a), extra });
  // (a row's \\[len] deepens the row it ends)
  for (let i = 0; i < out.length - 1; i++) out[i].extra = out[i + 1].extra;
  out[out.length - 1].extra = '';
  return out;
}
// A TeX box is as tall as its tallest glyph and as deep as its deepest (no line leading, no strut): the
// height and depth (in units of the font size) of a one-line plain text, or of a $math$ of letters and
// digits only. null when the text has commands or several lines (the line box is measured instead).
function glyphHD(t: any, mono: any) {
  let x = t.replace(/\\(le|leq|ge|geq|ne|neq|approx|equiv)(?![A-Za-z])/g, '\u0001').replace(/\$/g, '');
  // typewriter's underscore (\textunderscore, \_): a rule 0.04em high
  if (mono) x = x.replace(/\\textunderscore(?![A-Za-z])\s*|\\_/g, '\u0002');
  let sub = 0, sup = 0;
  // sub- and superscripts: lowered by 0.15 and raised by 0.41 em, set at 0.7 of the size
  x = x.replace(/([_^])(\{[^{}]*\}|.)/g, (m: any, k: any, a: any) => {
    a = a.replace(/[{}]/g, '');
    const h = glyphHD(a, mono);
    if (!h) { sub = NaN; return ''; }
    if (k === '_') sub = Math.max(sub, 0.15 + h.dp * 0.7); else sup = Math.max(sup, 0.41 + h.ht * 0.7);
    return '';
  });
  if (sub !== sub) return null;
  if (!x.trim() && !sub && !sup) return null;
  if (/[\\{}&%#~\n]/.test(x) || /[^\x20-\x7e\u0001\u0002]/.test(x)) return null;
  let ht = sup, dp = sub;
  for (const c of x) {
    let h, d = 0;
    if (c === ' ') continue;
    if (c === '\u0001') { h = 0.69; d = 0.19; }
    else if (c === '\u0002') h = 0.04;
    // cmtt's own (measured in TeX Live): brackets, slash and bar, punctuation and signs
    else if (mono && /[()[\]/|]/.test(c)) { h = 0.694; d = 0.083; }
    else if (mono && /[ij?!'"]/.test(c)) h = 0.611;
    else if (mono && c === '.') h = 0.125;
    else if (mono && c === ',') { h = 0.125; d = 0.139; }
    else if (mono && c === ';') { h = 0.431; d = 0.139; }
    else if (mono && /[-+]/.test(c)) h = 0.531;
    else if (mono && c === '*') h = 0.521;
    else if (mono && c === '=') h = 0.416;
    else if (mono && /[<>]/.test(c)) h = 0.556;
    else if (/[A-Z]/.test(c)) h = mono ? 0.611 : 0.683;
    else if (/[0-9]/.test(c)) h = mono ? 0.611 : 0.644;
    else if (/[bdfhkl]/.test(c)) h = mono ? 0.611 : 0.694;
    else if (c === 't') h = mono ? 0.55 : 0.615;
    else if (/[ij]/.test(c)) h = 0.669;
    else if (/[?!]/.test(c)) h = 0.705;
    else if (/[()[\]/|]/.test(c)) { h = 0.75; d = 0.25; }
    else if (/[.:]/.test(c)) h = 0.43;
    else if (/[,;]/.test(c)) { h = 0.43; d = 0.19; }
    else if (/[-+=<>*'"`]/.test(c)) h = 0.5;
    else if (c === '_') { h = 0; d = 0.1; }
    else h = 0.431;
    if (/[gjpqy]/.test(c)) d = mono ? 0.22 : 0.194;
    ht = Math.max(ht, h); dp = Math.max(dp, d);
  }
  return { ht, dp };
}
// what pdflatex's \em, \strutbox height and forest's default level distance `l` are at each size (pt)
const TEXSZ: Record<string, any> = {
  tiny: [6.806, 4.2, 15.849], scriptsize: [7.972, 5.6, 20.194], footnotesize: [8.5, 6.65, 22.66], small: [9.25, 7.7, 25.349],
  normalsize: [10, 8.4, 27.688], large: [11.75, 9.8, 32.615], Large: [14.1, 12.6, 39.898], LARGE: [15.85, 15.4, 47.009],
  huge: [19.024, 17.5, 55.358], Huge: [22.821, 21, 66.335],
};
const texsz = (name: any) => TEXSZ[name] || TEXSZ.normalsize;
let DRAW_DEPTH = 0; // a tree's TikZ code may hold a tree of its own: drawn two deep at most
const layout = layoutCache((s: any) => [s.src, s.size, s.font, TD.math && TD.math.engine, s.tex?.preamble || '', (s.tex?.pkgs || []).join()].join('\u0001'), (s: any) => build(s));

function build(s: any) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const T = parse(unwrap(s.src).inner, warn);
  const size = s.size || 'normalsize', E = TD.sizePx(size);
  if (!T.root) return { empty: true, nodes: [], edges: [], marks: [], bb: { x: 0, y: 0, w: 2 * PX, h: PX }, warnings, n: 0, levels: 0, G: [0, 1], U: [1, 0], grow: 270, rev: false, libs: [] };
  const libs = new Set();

  // effective options per node: inherited `for tree` / `for children` first, then its own
  const nodes: any[] = [];
  function walk(n: any, depth: any, parent: any, inh: any, fromParent: any, nth = 1, of = 1) {
    const me: Record<string, any> = { n, i: nodes.length, depth, parent, kids: [], nth };
    nodes.push(me);
    const eff: any[] = [], sub: any[] = [], ch: any[] = [];
    // what a condition reads of this node: its level, its number of children, its place among its siblings
    // (the root is no one's child: its n and n' are 0)
    const value: Record<string, any> = { level: depth, 'n children': n.k.length, n: parent < 0 ? 0 : nth, "n'": parent < 0 ? 0 : of - nth + 1, content: n.c };
    // (late: the stage after packing the keys run in; what they pass on to other nodes runs there in that stage too)
    const run = (list: any, own: any, late = '') => {
      const fw = (xs: string[]) => (late ? xs.map((x) => `${late}={${x}}`) : xs);
      for (const str of list) {
        const o = opt(str), c = /^(where|if)( |$)/.test(o.k) ? cond(o) : null;
        if (o.k === 'for tree' && o.v != null) { run(optList(o.v), false, late); if (own) sub.push(...fw(optList(o.v))); }
        // (for descendants and for children run from each node they reach, as forest runs them: inherited ones too)
        else if (o.k === 'for descendants' && o.v != null) sub.push(...fw(optList(o.v)));
        else if (o.k === 'for children' && o.v != null) ch.push(...fw(optList(o.v)));
        else if (o.k === 'forked edges') { libs.add('edges'); if (own) sub.push('forked edge'); else eff.push(opt('forked edge')); }
        // where X=v{yes}{no} is for tree={if X=v{yes}{no}}: this node and every one below it
        else if (c && c.where) { run([c.asIf], false, late); if (own) sub.push(...fw([c.asIf])); }
        else if (c) run(optList(c.test(value[c.key], value) ? c.yes : c.no), own, late);
        // a style the tree defines (name/.style={…}): defined once, before the tree is read; used, it is what it says
        else if (STYLE_DEF.test(o.k)) { /* read by styleDefs */ }
        else if (styles.has(o.k) && depth0 < 24) { depth0++; try { run(optList(styles.get(o.k)!(o.v)), own, late); } finally { depth0--; } }
        // the edges library's folder: forest-lib-edges.sty's style (its after packing node step is the block's folder@node)
        else if (o.k === 'folder' && o.v == null) run(['parent anchor=-children last', 'anchor=parent first', 'calign=child', 'calign primary child=1', 'for children={child anchor=parent, anchor=parent first, folder@child}', 'folder@node'], own, late);
        // node options={…}: TikZ's keys for the node (its align is TikZ's, not forest's tabular)
        else if (o.k === 'node options' && o.v != null) eff.push(...optList(o.v).map((x: string) => ({ ...opt(x), viaTikz: true })));
        // forest's stages (before typesetting nodes={…} …): their keys, for this node
        else if (STAGES.has(o.k) && o.v != null) run(optList(o.v), own, LATE.has(o.k) ? o.k : late);
        // l and s set before computing xy: where the node goes from its parent, after packing (an x or y there is
        // overwritten by compute xy; l and s before drawing tree are read by nothing)
        else if (late && PLACING.test(o.k)) {
          if (late === 'before computing xy' && (o.k === 'l' || o.k === 's') && o.v != null) (me.late ||= []).push(o);
          else if (late === 'before drawing tree' && (o.k === 'x' || o.k === 'y')) warn(`Not drawn: ${o.k} set before drawing tree`);
        }
        // X/.wrap pgfmath arg={…#1…}{expr}: X set to the template with the value of expr (pgfmath's: 2.0 for 2), or with
        // the node's content for content()
        else if (/\/\.wrap pgfmath arg$/.test(o.k) && o.v != null) {
          const g = groupsOf(o.v), x = g.length === 2 ? g[1].trim() : '', f = /^content(\(\))?$/.test(x) ? null : mathOf(x);
          const val = /^content(\(\))?$/.test(x) ? String(n.c) : f ? pgfNum(f(value)) : null;
          if (val == null) warn(`Not drawn: ${o.k}`); else run([`${o.k.replace(/\/\.wrap pgfmath arg$/, '')}={${g[0].replace(/#1/g, val)}}`], own, late);
        }
        // insert before / after={[…]}: a tree forest adds beside this node before packing, with its own options only
        else if ((o.k === 'insert before' || o.k === 'insert after') && o.v != null && !late && /^\s*\[/.test(o.v)) (me.ins ||= []).push({ after: o.k === 'insert after', src: o.v });
        else if (/^(for |where |if )/.test(o.k) || /^(for|where|if)\b/.test(o.k)) warn(`Not drawn: ${o.k}`);
        else eff.push(o);
      }
    };
    run(inh, false);
    run(fromParent, false);
    if (parent < 0) run([...dflt.pre, ...T.pre], true);
    run(n.o, true);
    me.eff = eff;
    // (keys handed down past a sane number, from options nested in themselves, stop there)
    let down = [...inh, ...sub];
    if (down.length > 4000) { warn('Too many keys handed down the tree: the deepest are left out'); down = down.slice(0, 4000); }
    n.k.forEach((c: any, i: number) => me.kids.push(walk(c, depth + 1, me.i, down, ch, i + 1, n.k.length).i));
    return me;
  }
  // the styles the tree defines in its preamble (and nodes), with their arguments; first those the document defines
  // for every tree (\forestset{…} in the preamble it came with)
  const pre = forestsets(s.tex?.preamble), dflt = defaultPreamble(s.tex, pre.forest), styles = styleDefs([...pre.forest, ...defsIn([...T.pre, ...allOpts(T.root)])]), tikzStyles = styleDefs(pre.tikz);
  let depth0 = 0;
  walk(T.root, 0, -1, [], []);
  // the nodes inserted (after the tree's own, which keep their places in the list; marked `added`)
  for (let q = 0; q < nodes.length && nodes.length < 5000; q++) {
    const m = nodes[q];
    for (const x of m.ins || []) {
      const t = parse(x.src, warn);
      if (m.parent < 0 || !t.root || t.after || t.pre.length) { warn(`Not drawn: insert ${x.after ? 'after' : 'before'}`); continue; }
      const p = nodes[m.parent], from = nodes.length;
      walk(t.root, m.depth, p.i, [], [], 1, 1);
      for (let i = from; i < nodes.length; i++) nodes[i].added = true;
      p.kids.splice(p.kids.indexOf(m.i) + (x.after ? 1 : 0), 0, from);
    }
  }

  // the linguistics library (loaded for roofs) makes every node `align=center` and every edge run from the
  // parent's near face to the child's (sn edges)
  const ling = dflt.ling || nodes.some((me) => me.eff.some((o: any) => o.k === 'roof' || o.k === 'sn edges'));
  // a node's frame: G the direction its children grow in, U the one their order runs along
  const cl = (v: any) => (Math.abs(v) < 1e-9 ? 0 : v);
  const frame = (st: any) => {
    const grow = st.grow != null ? st.grow : 270, rev = !!st.rev;
    const ga = grow * Math.PI / 180, ua = (grow + (rev ? -90 : 90)) * Math.PI / 180;
    return { G: [cl(Math.cos(ga)), cl(-Math.sin(ga))], U: [cl(Math.cos(ua)), cl(-Math.sin(ua))], grow, rev };
  };
  // style of each node
  const T0 = texsz(size), IS = T0[0] / K / 3;
  for (const me of nodes) {
    const st: Record<string, any> = {
      content: me.n.c, draw: false, dc: null, shape: 'rect', rc: 0, fill: null, tc: null, dash: null, lw: 0.4 / K,
      isx: IS, isy: IS, mw: 0, mh: 0, tw: 0, align: null, size, font: s.font, bold: false, italic: false,
      edge: { color: null, dash: null, lw: 0.4 / K, start: false, end: false, none: false },
      roof: false, fork: false, folder: false, phantom: false,
      l: null, lsep: null, ssep: null, fsep: null, findent: null, grow: null, rev: null, calign: 'midpoint', cprim: 1, csec: -1, cpa: -35, csa: 35, cwc: null,
      fit: 'tight', anchor: 'base', pa: '', ca: '', strut: false, edgeRaw: 'draw', tikz: [] as string[], epath: null as any,
    };
    const setLen = (field: any, o: any, base: any) => {
      const v = len(o.v, E);
      if (!isFinite(v!)) { warn(`Not drawn: ${o.k}=${o.v}`); return; }
      const cur = st[field] != null ? st[field] : base;
      st[field] = o.op === '+' ? cur + v : o.op === '-' ? cur - v! : o.op === '*' ? cur * (isFinite(+o.v) ? +o.v : 1) : v; // l*=0 is 0
    };
    // (a list that grows: a TikZ style a node uses is followed by its keys)
    const work = [...me.eff];
    for (let wi = 0; wi < work.length; wi++) {
      const o = work[wi];
      const k = o.k, v = o.v;
      if (k === 'draw') { if (v === 'none') st.draw = false; else { st.draw = true; if (v != null) { const c = colorOf(v); if (c) st.dc = c; } } }
      // a shape by name (circle, or shape=circle); coordinate: a point, its text dropped, every anchor the point
      else if ((SHAPES.has(k) && v == null) || (k === 'shape' && v != null && SHAPES.has(v.trim()))) { const sh = v == null ? k : v.trim(); st.shape = sh === 'rectangle' ? 'rect' : sh; if (sh === 'ellipse') libs.add('tikz:shapes.geometric'); }
      else if ((k === 'coordinate' && v == null) || (k === 'shape' && v != null && v.trim() === 'coordinate')) st.shape = 'coordinate';
      else if (k === 'rounded corners') { const r = v == null ? NaN : len(v, E); st.rc = isFinite(r!) ? r : 4 / K; } // rounded corners=0 is sharp
      else if (k === 'sharp corners') st.rc = 0;
      // fill alone fills with the node's colour (color=, or a bare colour name, before or after it), black by default
      else if (k === 'fill') st.fill = v == null ? true : v === 'none' ? null : colorOf(v) || null;
      else if (k === 'text' && v != null) st.tc = colorOf(v) || st.tc;
      else if (k === 'color' && v != null) { const c = colorOf(v); if (c) { st.tc = c; st.dc = c; st.cc = c; } }
      else if (k in DASH && v == null) st.dash = DASH[k];
      else if (k in WIDTH && v == null) st.lw = WIDTH[k] / K;
      else if (k === 'line width') { const w = len(v, E); if (w! > 0) st.lw = w; }
      else if (k === 'outer sep' || k === 'outer xsep' || k === 'outer ysep') { const w = len(v, E); if (isFinite(w!)) { if (k !== 'outer ysep') st.osx = w; if (k !== 'outer xsep') st.osy = w; } }
      else if (k === 'inner sep') { const w = len(v, E); if (w! >= 0) st.isx = st.isy = w; }
      else if (k === 'inner xsep') { const w = len(v, E); if (w! >= 0) st.isx = w; }
      else if (k === 'inner ysep') { const w = len(v, E); if (w! >= 0) st.isy = w; }
      else if (k === 'minimum size') { const w = len(v, E); if (w! > 0) st.mw = st.mh = w; }
      else if (k === 'minimum width') { const w = len(v, E); if (w! > 0) st.mw = w; }
      else if (k === 'minimum height') { const w = len(v, E); if (w! > 0) st.mh = w; }
      else if (k === 'text width') { const w = len(v, E); if (w! > 0) st.tw = w; }
      // (forest's align makes the text a tabular; TikZ's, from a TikZ style, lines of its own)
      else if (k === 'align') { st.align = /center/.test(v || '') ? 'center' : /right/.test(v || '') ? 'right' : 'left'; st.tab = !o.viaTikz; }
      // base=top|bottom is the tabular's [t]|[b]; any other value (t, b, c …) reaches it as no position: centred
      // (forest's base/.unknown), as base'=t|b sets it directly
      else if (k === 'base' && v != null) st.base = /^\s*bottom\s*$/.test(v) ? 'b' : /^\s*top\s*$/.test(v) ? 't' : 'c';
      else if (k === "base'" && v != null) st.base = /^\s*b\s*$/.test(v) ? 'b' : /^\s*t\s*$/.test(v) ? 't' : 'c';
      else if (k === 'font' && v != null) {
        if (/\\(bfseries|textbf)/.test(v)) st.bold = true;
        if (/\\(itshape|textit|slshape)/.test(v)) st.italic = true;
        if (/\\ttfamily/.test(v)) st.font = 'cmtt';
        if (/\\sffamily/.test(v)) st.font = 'cmss';
        const m = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(v);
        if (m) st.size = SIZE_CMD[m[1]];
      }
      else if (k === 'content' && v != null) st.content = v;
      else if (k === 'math content') st.math = true;
      // tier=name: every node of the tier as deep as the deepest; tier/.option=level is the node's level
      else if (k === 'tier' && v != null) st.tier = v.trim();
      else if (k === 'tier/.option' && v != null && /^(level|n children|n)$/.test(v.trim())) st.tier = `@${v.trim()}=${({ level: me.depth, 'n children': me.n.k.length, n: me.nth } as any)[v.trim()]}`;
      else if (k === 'alias' && v != null) st.alias = v.trim();
      // (TikZ's text alignment keys: forest's align, a table round the text, wins over them)
      else if (k === 'text centered') st.align ??= 'center';
      else if (k === 'text ragged' || k === 'text badly ragged') st.align ??= 'left';
      else if (k === 'text ragged left' || k === 'text badly ragged left') st.align ??= 'right';
      else if (k === 'edge' && v != null) {
        // `edge=` replaces the inherited edge style (forest's keylist assignment); `edge+=` adds to it
        if (o.op !== '+') Object.assign(st.edge, { color: null, dash: null, lw: 0.4 / K, start: false, end: false });
        edgeStyle(st.edge, optList(v), warn);
        st.edgeRaw = o.op === '+' ? `${st.edgeRaw}, ${v}` : v;
      }
      else if (k === 'name' && v != null) st.name = v.trim();
      else if (k === 'tikz' && v != null) st.tikz = o.op === '+' ? [...st.tikz, v] : [v];
      else if (k === 'edge path' && v != null) st.epath = o.prime ? { path: v } : { code: v };
      else if (k === 'edge label' && v != null) {
        st.elabelRaw = v;
        // edge label={node[midway, left]{yes}}: nodes along the edge (each may be named)
        const ls = edgeNodes(v);
        if (ls) st.elabels = ls; else warn('Not drawn: edge label');
      } else if (k === 'no edge') { st.edge.none = true; st.ignoreEdge = true; }
      else if (k === 'ignore edge') st.ignoreEdge = v == null || v === 'true';
      else if (k === 'phantom') st.phantom = true;
      else if (k === 'roof') { st.roof = true; libs.add('linguistics'); }
      else if (k === 'forked edge') { st.fork = true; libs.add('edges'); }
      else if (k === 'folder@node') { st.folder = true; libs.add('edges'); }
      else if (k === 'folder@child') st.fchild = true;
      else if (k === 'fork sep') setLen('fsep', o, 5 / K);
      else if (k === 'folder indent') setLen('findent', o, 4.5 / K);
      else if (k === 'l') setLen('l', o, T0[2] / K);
      else if (k === 'l sep') setLen('lsep', o, T0[1] / K + IS);
      else if (k === 's sep') setLen('ssep', o, 2 * IS);
      else if (k === 'grow' && v != null) {
        const a = GROW[v.trim()] != null ? GROW[v.trim()] : parseFloat(v);
        if (isFinite(a)) { st.grow = a; st.rev = o.prime; } else warn(`Not drawn: grow=${v}`);
      } else if (k === 'reversed') st.rev = v == null || v === 'true';
      // calign: first and last are child with the primary child 1 or -1, center is midpoint with 1 and -1
      else if (k === 'calign' && v != null) {
        const c = v.trim().replace(/\s+/g, ' ');
        if (c === 'first' || c === 'last') { st.calign = 'child'; st.cprim = c === 'first' ? 1 : -1; }
        else if (c === 'center') { st.calign = 'midpoint'; st.cprim = 1; st.csec = -1; }
        else if (CALIGN.has(c)) st.calign = c;
        else warn(`Not drawn: calign=${c}`);
      }
      else if (/^calign (child|primary child|secondary child|angle|primary angle|secondary angle)$/.test(k) && v != null) {
        const n = Number(v.trim());
        if (!Number.isInteger(n) || (/child$/.test(k) && !n)) warn(`Not drawn: ${k}=${v}`);
        else if (k === 'calign angle') { st.cpa = -n; st.csa = n; }
        else st[({ 'calign child': 'cprim', 'calign primary child': 'cprim', 'calign secondary child': 'csec', 'calign primary angle': 'cpa', 'calign secondary angle': 'csa' } as Record<string, string>)[k]] = n;
      }
      // (on a child: its parent's calign, child or child edge, with this child primary)
      else if ((k === 'calign with current' || k === 'calign with current edge') && v == null) st.cwc = k === 'calign with current' ? 'child' : 'child edge';
      else if (k === 'fit' && v != null) st.fit = v.trim();
      else if (k === 'anchor' && v != null) st.anchor = v.trim();
      else if (k === 'parent anchor') st.pa = (v || '').trim();
      else if (k === 'child anchor') st.ca = (v || '').trim();
      // \strut at the start or end of every node: each is at least as tall and deep as a line of text
      else if ((k === 'execute at begin node' || k === 'execute at end node') && /^\s*\\strut\s*$/.test(v || '')) st.strut = true;
      else if (SILENT.has(k)) { /* placement details forest handles itself */ }
      else if ((k === 'label' || k === 'pin') && v != null) (st.labels ||= []).push(labelOf(v, k === 'pin'));
      else if (DRAWN_ELSEWHERE.includes(k)) warn(`Not drawn: ${k}`);
      else if (v == null && colorOf(k)) { st.tc = colorOf(k); st.dc = colorOf(k); st.cc = colorOf(k); }
      else if (tikzStyles.has(k) && work.length < 2000) work.splice(wi + 1, 0, ...optList(tikzStyles.get(k)!(v)).map((x: string) => ({ ...opt(x), viaTikz: true })));
      else warn(`Not drawn: ${k}${v != null ? '=…' : ''}`);
    }
    if (st.fill === true) st.fill = st.cc || true;
    // the text, its box (the line's leading taken off, as TeX's box has none) and the node around it
    // forest's align (and linguistics' align=center): \begin{tabular}[base]{@{}c@{}}, its rows split at \\; without align
    // or text width TikZ drops a \\ (a text width's lines, or TikZ's own align, are lines of the text)
    const tab = (st.tab || (ling && !st.align)) && !st.tw && st.shape !== 'coordinate';
    const parts = st.shape === 'coordinate' ? [] : rowsOf(String(st.content));
    let t = (tab || st.tw || st.align ? parts.map((r) => r.t).join('\n') : parts.map((r) => r.t).join('')).trim();
    // math content: the content is a formula
    if (st.math && t && !t.includes('$')) t = `$${t}$`;
    me.t = t;
    me.ts = { size: st.size, font: st.font, bold: st.bold, italic: st.italic, tw: st.tw || 0, align: st.align || 'center' };
    const b = t ? TD.textBox(t, me.ts) : { w: 0, h: 0 };
    const Es = TD.sizePx(st.size), mono = st.font === 'cmtt';
    let hd = t && !st.tw ? glyphHD(t, mono) : null;
    // a text width's one line (TikZ's minipage[t], no strut): the glyphs' height and depth too
    if (!hd && t && st.tw > 0 && !t.includes('\n') && TD.textBox(t, { ...me.ts, tw: 0 }).w - 2 <= st.tw) hd = glyphHD(t, mono);
    // the tabular's rows: each at least a \strut (0.7 and 0.3 baselineskip) high and deep, stacked with no leading (array
    // sets \baselineskip and \lineskip to 0); \\[len] deepens its row. base=top: the baseline is the first row's, bottom the last's.
    // A row of commands is measured: its line box less the leading, 0.7 of it above the baseline.
    me.rows = null;
    if (tab && t && !st.math && (parts.length > 1 || !hd || st.base === 'c')) {
      const bs = texsz(st.size)[1] / K / 0.7;
      const rows = parts.map((r) => {
        const g = glyphHD(r.t.trim(), mono), th = g ? 0 : Math.max(0, TD.textBox(r.t.trim() || ' ', me.ts).h - 0.22 * Es);
        const x = r.extra ? len(r.extra, Es) : 0;
        return { t: r.t.trim(), ht: Math.max(0.7 * bs, g ? g.ht * Es : 0.7 * th), dp: Math.max(0.3 * bs, g ? g.dp * Es : 0.3 * th) + (isFinite(x!) ? x! : 0), w: r.t.trim() ? Math.max(0, TD.textBox(r.t.trim(), me.ts).w - 2) : 0 };
      });
      // (centred: \vcenter, the middle on the math axis, a quarter em above the baseline)
      const total = rows.reduce((a, r) => a + r.ht + r.dp, 0), ht = st.base === 'b' ? total - rows[rows.length - 1].dp : st.base === 'c' ? total / 2 + 0.25 * Es : rows[0].ht;
      hd = { ht: ht / Es, dp: (total - ht) / Es };
      let y = -total / 2;
      me.rows = rows.map((r) => { const c = y + r.ht - (r.ht - r.dp) / 2; y += r.ht + r.dp; return { t: r.t, y: c, w: r.w }; });
    }
    // align= typesets the text as a table row with a \strut: at least 0.7 and 0.3 baselineskips
    if (hd && !me.rows && !st.tw && (st.align || ling || st.strut)) { const sh = texsz(st.size)[1] / K / Es; hd = { ht: Math.max(hd.ht, sh), dp: Math.max(hd.dp, sh * 3 / 7) }; }
    // the box of TeX: the glyphs' height and depth; the +2 in a measured width is slack, not text
    const tw = st.tw > 0 ? st.tw : Math.max(0, b.w - 2), th = t ? (hd ? (hd.ht + hd.dp) * Es : Math.max(0, b.h - 0.22 * Es)) : 0;
    me.off = hd ? (hd.ht - hd.dp) * Es / 2 : 0; // the box's centre above its baseline
    let w = tw + 2 * st.isx, h = th + 2 * st.isy;
    if (st.shape === 'circle') w = h = Math.hypot(tw + 2 * st.isx, th + 2 * st.isy);
    else if (st.shape === 'ellipse') { w *= Math.SQRT2; h *= Math.SQRT2; }
    w = Math.max(w, st.mw); h = Math.max(h, st.mh);
    if (st.shape === 'circle') w = h = Math.max(w, h);
    if (st.shape === 'coordinate') w = h = 0;
    me.w = w; me.h = h; me.st = st;
    // outer sep (half the line width unless set, drawn or not): TikZ's anchors, and forest's packing, are that far out
    // from the border drawn; a coordinate has none
    me.osx = st.shape === 'coordinate' ? 0 : st.osx ?? st.lw / 2; me.osy = st.shape === 'coordinate' ? 0 : st.osy ?? st.lw / 2;
    const W2 = w / 2 + me.osx, H2 = h / 2 + me.osy;
    me.boff = me.off;
    // the anchor (forest's default: base): where the node's centre is from the point its place is given for
    // (anchor=child anchor / parent anchor: that option's value)
    let A = (st.anchor === 'child anchor' ? st.ca || 'base' : st.anchor === 'parent anchor' ? st.pa || 'base' : st.anchor).replace(/\s+/g, ' ');
    const fa = forestAnchor(st, me.parent >= 0 ? nodes[me.parent].st : st, A);
    if (typeof fa === 'string') A = fa;
    me.offx = A === 'text' ? w / 2 : /west$/.test(A) ? W2 : /east$/.test(A) ? -W2 : 0;
    if (/^north/.test(A)) me.off = -H2;
    else if (/^south/.test(A)) me.off = H2;
    else if (/^mid/.test(A)) me.off -= 0.215 * Es; // half an ex above the baseline
    else if (typeof fa === 'number') {
      // a point on the border at that angle (TeX's: y up)
      const ux = Math.cos(fa * Math.PI / 180), uy = -Math.sin(fa * Math.PI / 180);
      const t = st.shape === 'circle' ? W2 : st.shape === 'ellipse' ? 1 / Math.hypot(ux / (W2 || 1), uy / (H2 || 1)) : Math.min(Math.abs(ux) > 1e-9 ? W2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? H2 / Math.abs(uy) : Infinity);
      me.offx = -ux * t; me.off = uy * t;
    }
    else if (!/^base\b/.test(A) && A !== 'text') me.off = 0; // center, west, east
  }

  // Every node turns its own children (`grow`, default south); G is the direction they grow in and U the
  // one their order runs along (frame, above). The root's pair is kept for the editor.
  for (const me of nodes) {
    me.fr = frame(me.st);
    const asc = me.h / 2 + me.off, dsc = me.h / 2 - me.off;
    me.box = { x1: me.offx - me.w / 2 - me.osx, x2: me.offx + me.w / 2 + me.osx, y1: -asc - me.osy, y2: dsc + me.osy }; // round the anchor, y down
  }
  const { G, U, grow, rev } = nodes[0].fr;
  for (const me of nodes) {
    me.hd = Math.abs(G[0]) * me.w / 2 + Math.abs(G[1]) * me.h / 2;
    me.hs = Math.abs(U[0]) * me.w / 2 + Math.abs(U[1]) * me.h / 2;
  }
  const LDEF = T0[2] / K, LSEP0 = T0[1] / K + IS, SSEP0 = 2 * IS;
  // a box as seen along a frame: d along the growth, s across
  // a box, or an edge (seg: a line from one point to another), as seen along a frame: d along the growth, s across; lo
  // and hi its least and greatest s at d1 and at d2 (a box's are its sides)
  const inFrame = (r: any, f: any) => {
    if (r.seg) {
      const [ax, ay, bx, by] = r.seg, da = ax * f.G[0] + ay * f.G[1], sa = ax * f.U[0] + ay * f.U[1], db = bx * f.G[0] + by * f.G[1], sb = bx * f.U[0] + by * f.U[1];
      const [p, q] = da <= db ? [[da, sa], [db, sb]] : [[db, sb], [da, sa]], s1 = Math.min(sa, sb), s2 = Math.max(sa, sb);
      return q[0] - p[0] < 1e-9 ? { d1: p[0], d2: p[0], s1, s2, lo1: s1, lo2: s1, hi1: s2, hi2: s2 } : { d1: p[0], d2: q[0], s1, s2, lo1: p[1], lo2: q[1], hi1: p[1], hi2: q[1] };
    }
    let d1 = Infinity, d2 = -Infinity, s1 = Infinity, s2 = -Infinity;
    for (const x of [r.x1, r.x2]) for (const y of [r.y1, r.y2]) {
      const d = x * f.G[0] + y * f.G[1], s = x * f.U[0] + y * f.U[1];
      d1 = Math.min(d1, d); d2 = Math.max(d2, d); s1 = Math.min(s1, s); s2 = Math.max(s2, s);
    }
    return { d1, d2, s1, s2, lo1: s1, lo2: s1, hi1: s2, hi2: s2 };
  };
  const shiftR = (r: any, x: any, y: any) => (r.seg ? { seg: [r.seg[0] + x, r.seg[1] + y, r.seg[2] + x, r.seg[3] + y] } : { x1: r.x1 + x, x2: r.x2 + x, y1: r.y1 + y, y2: r.y2 + y });
  const bounds = (r: any) => (r.seg ? { x1: Math.min(r.seg[0], r.seg[2]), x2: Math.max(r.seg[0], r.seg[2]), y1: Math.min(r.seg[1], r.seg[3]), y2: Math.max(r.seg[1], r.seg[3]) } : r);
  // s along a piece at d (a line between its ends)
  const at = (a: any, d: number, k: 'lo' | 'hi') => (a.d2 - a.d1 < 1e-9 ? a[k + '1'] : a[k + '1'] + (a[k + '2'] - a[k + '1']) * (d - a.d1) / (a.d2 - a.d1));

  const border = (me: any, vx: any, vy: any) => {
    const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
    let t;
    if (me.st.shape === 'coordinate') return [me.x, me.y];
    const w2 = me.w / 2 + (me.osx || 0), h2 = me.h / 2 + (me.osy || 0); // (on the outer sep)
    if (me.st.shape === 'circle') t = w2;
    else if (me.st.shape === 'ellipse') t = 1 / Math.hypot(ux / (w2 || 1), uy / (h2 || 1));
    else t = Math.min(ux ? w2 / Math.abs(ux) : Infinity, uy ? h2 / Math.abs(uy) : Infinity);
    return [me.x + ux * t, me.y + uy * t];
  };
  // a node's anchor: a compass point, base, or forest's `children` (the side its children grow from) and `parent`
  // (the side facing its parent: f is the parent's frame, `up` false); null for none or one not read here
  const COMPASS: Record<string, number[]> = { center: [0, 0], north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], 'north east': [1, -1], 'north west': [-1, -1], 'south east': [1, 1], 'south west': [-1, 1] };
  const anchorAt = (m: any, a: string, f: any, up: boolean) => {
    let name = String(a || '').trim().replace(/\s+/g, ' ');
    if (!name) return null;
    void f; void up;
    const fa = forestAnchor(m.st, m.parent >= 0 ? nodes[m.parent].st : m.st, name);
    if (typeof fa === 'number') return border(m, Math.cos(fa * Math.PI / 180), -Math.sin(fa * Math.PI / 180));
    if (fa) name = fa;
    const base = /^base( (west|east))?$/.exec(name);
    const w2 = m.w / 2 + (m.osx || 0), h2 = m.h / 2 + (m.osy || 0);
    if (base) return [m.x + (base[2] === 'west' ? -w2 : base[2] === 'east' ? w2 : 0), m.y + (m.boff ?? m.off)];
    const c = COMPASS[name];
    if (!c) return null;
    if (!c[0] && !c[1]) return [m.x, m.y];
    if (m.st.shape !== 'rect') return border(m, c[0], c[1]);
    return [m.x + c[0] * w2, m.y + c[1] * h2];
  };
  // an anchor's point from the node's own anchor, as TeX has it (y up): `anchor` empty is the centre
  const anchorRel = (m: any, a: string, f: any, up: boolean) => {
    const c = { ...m, x: m.offx, y: -m.off }, p = anchorAt(c, a, f, up) || [c.x, c.y];
    return [p[0], -p[1]];
  };
  // forest's calign, after its children are packed: each child's s (k.s, along forest's s axis, at grow+90°) shifted so
  // the parent sits over its primary child (child), the primary child's edge (child edge), the midpoint of the primary
  // and secondary children or their edges, or with edges at fixed angles (forest.sty's \forest@calign@…, transcribed:
  // fixed angles read the anchors' x as s and y as l unrotated, and the l scaling of fixed edge angles reads the last
  // child's anchor, as forest does)
  const calign = (me: any, kids: any[]) => {
    const st = me.st, f = me.fr, N = kids.length, last = kids[N - 1].off;
    for (const k of kids) { k.s = f.rev ? last - k.off : k.off; }
    // calign with current [edge] on a child (the last one read wins, as forest runs the children's keys after this node's)
    let mode = st.calign, prim = st.cprim, sec = st.csec;
    kids.forEach((k, i) => { if (k.c.st.cwc) { mode = k.c.st.cwc; prim = i + 1; } });
    const nth = (n: number) => kids[Math.min(N, Math.max(1, n > 0 ? n : N + 1 + n)) - 1];
    const shift = (d: number) => { for (const k of kids) k.s += d; };
    const gl = f.grow * Math.PI / 180;
    const dotS = (p: number[]) => p[0] * -Math.sin(gl) + p[1] * Math.cos(gl); // a TeX point along forest's s axis
    const pa = anchorRel(me, st.pa, f, true), ca = (k: any) => anchorRel(k.c, k.c.st.ca, f, false);
    if (mode === 'child') shift(-nth(prim).s);
    else if (mode === 'midpoint') shift(-(nth(prim).s + nth(sec).s) / 2);
    else if (mode === 'child edge') { const p = nth(prim), c = ca(p); shift(-(p.s + dotS([c[0] - pa[0], c[1] - pa[1]]))); }
    else if (mode === 'edge midpoint') {
      const p = nth(prim), q = nth(sec), a = ca(p), b = ca(q);
      shift(-((p.s + q.s) / 2 + dotS([(a[0] + b[0]) / 2 - pa[0], (a[1] + b[1]) / 2 - pa[1]])));
    } else if (N > 1) {
      let p = nth(prim), q = nth(sec);
      if (f.rev) [p, q] = [q, p];
      const tp = Math.tan(st.cpa * Math.PI / 180), ts = Math.tan(st.csa * Math.PI / 180);
      let anchor = 0;
      if (mode === 'fixed angles') {
        const desired = ts * q.l - tp * p.l, actual = q.s - p.s;
        if (desired > actual && actual === 0) { let a = tp * q.l; const b = desired / (N - 1); for (const k of kids) { k.s = a; a += b; } }
        else if (desired > actual) { const r = desired / actual; for (const k of kids) k.s *= r; anchor = -tp * p.l; }
        else { if (desired < actual) { const r = actual / desired; for (const k of kids) k.l *= r; } anchor = -tp * p.l; }
      } else {
        const [pas, pal] = pa, A = kids.map(ca), [cfs, cfl] = A[kids.indexOf(p)], [css, csl] = A[kids.indexOf(q)];
        const dFirst = tp * (p.l - cfl + pal), desired = ts * (q.l - csl + pal) - dFirst, actual = q.s + css - p.s - cfs;
        if (desired > actual && actual === 0) kids.forEach((k, i) => { k.s = dFirst + desired * i / (N - 1) + cfs - A[i][0]; });
        else if (desired > actual) {
          const r = desired / actual, s1 = p.s;
          kids.forEach((k, i) => { k.s = r * (k.s - s1 + A[i][0] - cfs) + s1 + cfs - A[i][0]; });
          anchor = -tp * (p.l - cfl + pal) + cfs - pas;
        } else if (desired < actual) {
          const r = actual / desired;
          kids.forEach((k, i) => { k.l = r * (k.l + pal - A[i][1]) - pal + A[i][1]; });
          anchor = -tp * (p.l + pal - A[N - 1][1]) + cfs - pas;
        } else anchor = -tp * (p.l - cfl + pal) + cfs - pas;
      }
      shift(-anchor);
    }
  };
  // packing: a subtree is a list of boxes round its root's anchor; siblings are pushed apart until no
  // boxes that share a band of d come closer than s sep. Each child gets rel {x, y} from its parent's anchor.
  // uniform growth (forest's): the node and every one below it grow the same way, with no folder's step after packing
  for (let q = nodes.length - 1; q >= 0; q--) nodes[q].uni = true;
  for (let q = nodes.length - 1; q >= 0; q--) {
    const m = nodes[q];
    if (m.st.folder || m.kids.some((i: number) => !nodes[i].uni || nodes[i].fr.grow !== m.fr.grow)) m.uni = false;
  }
  // a node's boundary as forest packs it: its box, or for a circle or ellipse the octagon through its compass anchors
  // (forest.sty's \forest@compute@node@boundary@circle)
  const outline = (me: any) => {
    if (me.st.shape !== 'circle' && me.st.shape !== 'ellipse') return [me.box];
    const cx = (me.box.x1 + me.box.x2) / 2, cy = (me.box.y1 + me.box.y2) / 2, rx = (me.box.x2 - me.box.x1) / 2, ry = (me.box.y2 - me.box.y1) / 2;
    const t = 1 / Math.hypot(Math.SQRT1_2 / (rx || 1), Math.SQRT1_2 / (ry || 1)) * Math.SQRT1_2, P: number[][] = [[rx, 0], [t, -t], [0, -ry], [-t, -t], [-rx, 0], [-t, t], [0, ry], [t, t], [rx, 0]];
    return P.slice(1).map((q, i) => ({ seg: [cx + P[i][0], cy + P[i][1], cx + q[0], cy + q[1]] }));
  };
  const sub = (me: any) => {
    const own = me.box;
    if (!me.kids.length) return outline(me);
    // a child with fit=rectangle is one box to its siblings: its subtree's bounding box
    const st = me.st, f = me.fr, kids = me.kids.map((i: any) => {
      const c = nodes[i], b = sub(c);
      if ((c.st.fit !== 'rectangle' && c.st.fit !== 'band') || !b.length) return { c, b };
      const r = b.map(bounds).reduce((a: any, q: any) => ({ x1: Math.min(a.x1, q.x1), x2: Math.max(a.x2, q.x2), y1: Math.min(a.y1, q.y1), y2: Math.max(a.y2, q.y2) }), { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity });
      // fit=band: from the subtree's near side forward along the growth to 5000pt (forest's band length), so no later
      // sibling's subtree comes alongside it below; shallower relatives still may
      if (c.st.fit === 'band') {
        const B = 5000 / K;
        if (f.G[0] === 1) r.x2 = B; else if (f.G[0] === -1) r.x1 = -B; else if (f.G[1] === 1) r.y2 = B; else if (f.G[1] === -1) r.y1 = -B;
        else warn('fit=band on a slanting growth is packed as fit=rectangle');
      }
      return { c, b: [r] };
    });
    const ssep = st.ssep != null ? st.ssep : SSEP0;
    const out = outline(me), po = inFrame(own, f);
    const place = (k: any, d: any, s: any) => { k.c.pl = d; k.c.ps = s; k.c.rel = { x: d * f.G[0] + s * f.U[0], y: d * f.G[1] + s * f.U[1] }; };
    const pack = (dist: any) => { // each kid's boxes at distance dist(k); sets the s offsets
      const placed = [];
      let prev = -Infinity;
      for (const k of kids) {
        const d0 = dist(k);
        k.fr = k.b.map((r: any) => inFrame(r, f));
        let off: any = placed.length ? prev : 0;
        if (placed.length) {
          for (const b of k.fr) {
            const d1 = b.d1 + d0, d2 = b.d2 + d0, flat = d2 - d1 < 0.01;
            for (const a of placed) {
              // where both are: s sep between them at its ends (boxes side by side along d don't meet; an edge
              // touching a box's end does)
              const L = Math.max(a.d1, d1), R = Math.min(a.d2, d2);
              if (flat || a.d2 - a.d1 < 0.01 ? L > R + 1e-6 : R - L <= 0.01) continue;
              for (const x of [L, R]) off = Math.max(off, at(a, x, 'hi') + ssep - at(b, x - d0, 'lo'));
            }
          }
        }
        k.off = off; prev = off;
        for (const b of k.fr) placed.push({ d1: b.d1 + d0, d2: b.d2 + d0, s1: b.s1 + off, s2: b.s2 + off, lo1: b.lo1 + off, lo2: b.lo2 + off, hi1: b.hi1 + off, hi2: b.hi2 + off });
      }
    };
    {
      const lsep = st.lsep != null ? st.lsep : LSEP0;
      // each child's distance from this anchor: its own `l`, else the default; then all are pushed out
      // until the nearest clears this node by l sep: the child's box, or where its subtree grows some other way (or a
      // folder's), its whole subtree with its edges (forest's level packing, uniform growth or not)
      let minNear = Infinity;
      for (const k of kids) {
        k.l = k.c.st.l != null ? k.c.st.l : LDEF;
        minNear = Math.min(minNear, k.l + (k.c.uni ? inFrame(k.c.box, f).d1 : Math.min(...k.b.map((r: any) => inFrame(r, f).d1))));
      }
      const push = Math.max(0, po.d2 + lsep - minNear);
      for (const k of kids) { k.l += push; k.c.push = push; }
      pack((k: any) => k.l);
      calign(me, kids);
      // a folder, after packing: the first child l sep out, every child moved past this node's own s extent (min_s and
      // max_s: its box as drawn, without the outer sep) and s sep
      if (st.folder) {
        const v = inFrame({ x1: own.x1 + me.osx, x2: own.x2 - me.osx, y1: own.y1 + me.osy, y2: own.y2 - me.osy }, f);
        const dl = lsep - kids[0].l, ds = -(v.s2 - v.s1 + ssep) * (f.rev ? 1 : -1);
        for (const k of kids) { k.l += dl; k.s += ds; }
      }
      for (const k of kids) place(k, k.l, (f.rev ? -1 : 1) * k.s);
    }
    for (const k of kids) for (const r of k.b) out.push(shiftR(r, k.c.rel.x, k.c.rel.y));
    // and the edges, from this node's parent anchor to each child's child anchor (forest packs them too; not no edge's)
    const pa = anchorRel(me, st.pa, f, true);
    for (const k of kids) if (!k.c.st.ignoreEdge) { const c = anchorRel(k.c, k.c.st.ca, f, false); out.push({ seg: [pa[0], -pa[1], k.c.rel.x + c[0], k.c.rel.y - c[1]] }); }
    return out;
  };
  // forest's l and s set before computing xy, from the packed ones: l along the parent's growth, s across it (forest's
  // s runs at grow+90° whatever the order, so it is against U in a reversed frame)
  const lateLen = (o: any, cur: number) => {
    if (o.op === '*' || o.op === ':') { const n = +o.v; if (!isFinite(n) || (o.op === ':' && !n)) { warn(`Not drawn: ${o.k}${o.op}=${o.v}`); return cur; } return o.op === '*' ? cur * n : cur / n; }
    const v = len(o.v, E);
    if (!isFinite(v!)) { warn(`Not drawn: ${o.k}=${o.v}`); return cur; }
    return o.op === '+' ? cur + v! : o.op === '-' ? cur - v! : v!;
  };
  const place = () => {
    sub(nodes[0]);
    for (const me of nodes) if (me.late && me.parent >= 0 && me.rel) {
      const f = nodes[me.parent].fr, sg = f.rev ? -1 : 1;
      let l = me.pl, sv = sg * me.ps;
      for (const o of me.late) if (o.k === 'l') l = lateLen(o, l); else sv = lateLen(o, sv);
      me.rel = { x: l * f.G[0] + sg * sv * f.U[0], y: l * f.G[1] + sg * sv * f.U[1] };
    }
    nodes[0].ax = 0; nodes[0].ay = 0;
    for (const me of nodes) if (me.parent >= 0) { const p = nodes[me.parent]; me.ax = p.ax + me.rel.x; me.ay = p.ay + me.rel.y; }
  };
  place();
  // tiers: each node of a tier moves out (its subtree with it) to the deepest one's distance along the growth, then
  // the tree is packed again (a few rounds, as a move can change the room its siblings have)
  const tiers = new Map<string, any[]>();
  for (const me of nodes) if (me.st.tier && me.parent >= 0) tiers.set(me.st.tier, [...(tiers.get(me.st.tier) || []), me]);
  for (let round = 0; round < 4 && [...tiers.values()].some((g) => g.length > 1); round++) {
    let moved = false;
    for (const g of tiers.values()) {
      const d = (m: any) => m.ax * G[0] + m.ay * G[1], far = Math.max(...g.map(d));
      for (const m of g) { const dd = far - d(m); if (dd > 0.01) { m.st.l = (m.pl != null ? m.pl - (m.push || 0) : LDEF) + dd; /* (before the l sep push: it comes again) */ moved = true; } }
    }
    if (!moved) break;
    place();
  }
  for (const me of nodes) { me.x = me.ax + me.offx; me.y = me.ay - me.off; } // from the anchor to the node's centre

  // edges
  // an edge label: placed along the path (pos), then moved off it by its anchor (left, above right, …), or by
  // auto=left / right (swap turns it), to that side of the edge as it runs from parent to child
  const edgeLabel = (el: any, pts: any, st: any) => {
    let pos = 0.5, dx = 0, dy = 0, auto = '', swap = false;
    for (const o of el.o) {
      const k = o.k;
      if (k === 'auto') auto = o.v == null ? 'left' : String(o.v).trim();
      else if (k === 'swap' || k === "'") swap = true;
      if (k === 'pos' && isFinite(+o.v)) pos = +o.v;
      else if (k === 'near start') pos = 0.25; else if (k === 'near end') pos = 0.75;
      else if (k === 'very near start') pos = 0.125; else if (k === 'very near end') pos = 0.875;
      else if (k === 'at start') pos = 0; else if (k === 'at end') pos = 1;
      for (const w of k.split(/\s+/)) {
        if (w === 'left') dx = -1; else if (w === 'right') dx = 1;
        else if (w === 'above') dy = -1; else if (w === 'below') dy = 1;
      }
    }
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let want = pos * total, x = pts[0][0], y = pts[0][1], tx = 0, ty = 0;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const f = seg[i] ? Math.min(1, want / seg[i]) : 0;
        tx = pts[i + 1][0] - pts[i][0]; ty = pts[i + 1][1] - pts[i][1];
        x = pts[i][0] + tx * f; y = pts[i][1] + ty * f; break;
      }
      want -= seg[i];
    }
    if (auto === 'left' || auto === 'right') {
      // the side, y down: left of the way the edge runs is (ty, -tx); TikZ picks the anchor by eighths of a turn
      const s = (auto === 'right') !== swap ? -1 : 1, L = Math.hypot(tx, ty) || 1, nx = s * ty / L, ny = -s * tx / L;
      dx = Math.abs(nx) > 0.383 ? Math.sign(nx) : 0; dy = Math.abs(ny) > 0.383 ? Math.sign(ny) : 0;
    }
    const ts = { size: st.size, font: st.font, tw: 0, align: 'center' }, b = TD.textBox(el.t, ts), sep = 0.3333 * E;
    const w = b.w + 2 * sep, h = Math.max(0, b.h - 0.22 * TD.sizePx(st.size)) + 2 * sep;
    return { t: el.t, ts, x: x + dx * w / 2, y: y + dy * h / 2, w, h };
  };
  const edges = [];
  for (const me of nodes) {
    if (me.parent < 0) continue;
    const p = nodes[me.parent], ed = me.st.edge;
    if (ed.none || me.st.phantom || me.st.epath) continue;
    const style = { color: ed.color, dash: ed.dash, lw: ed.lw, start: ed.start, end: ed.end };
    let pts, roof = false;
    // points in the parent's frame: d along its growth, s across, from a node's centre
    const f = p.fr, pt = (c: any, d: any, sv: any) => [c.x + d * f.G[0] + sv * f.U[0], c.y + d * f.G[1] + sv * f.U[1]];
    const half = (c: any, v: any) => Math.abs(v[0]) * (c.w / 2 + c.osx) + Math.abs(v[1]) * (c.h / 2 + c.osy); // (to the outer sep)
    const hdp = half(p, f.G), hdc = half(me, f.G), hsc = half(me, f.U), rs = (me.x - p.x) * f.U[0] + (me.y - p.y) * f.U[1];
    if (me.st.fchild) {
      // a folder's child: ([xshift=folder indent]!u.parent anchor) |- (.child anchor), the shift along the parent's grow
      const fi = p.st.findent != null ? p.st.findent : 4.5 / K; // 0.45em of the 10pt font forest was loaded in
      const a = anchorAt(p, p.st.pa, f, true) || [p.x, p.y], c = anchorAt(me, me.st.ca, f, false) || [me.x, me.y], a0 = [a[0] + fi * f.G[0], a[1] + fi * f.G[1]];
      pts = [a0, [a0[0], c[1]], c];
    } else if (me.st.roof) {
      pts = [pt(p, hdp, 0), pt(me, -hdc, -hsc), pt(me, -hdc, hsc), pt(p, hdp, 0)]; roof = true;
    } else if (me.st.fork) {
      const fd = hdp + (p.st.fsep != null ? p.st.fsep : 5 / K); // fork sep is 0.5em of the 10pt font forest was loaded in
      pts = [pt(p, hdp, 0), pt(p, fd, 0), pt(p, fd, rs), pt(me, -hdc, 0)];
    } else if (p.st.pa || me.st.ca) {
      // from the parent's `parent anchor` to the child's `child anchor`; an end without one is on its node's border
      let a = anchorAt(p, p.st.pa, f, true), b = anchorAt(me, me.st.ca, f, false);
      if (!a && b) a = border(p, b[0] - p.x, b[1] - p.y);
      if (!b && a) b = border(me, a[0] - me.x, a[1] - me.y);
      pts = a && b ? [a, b] : [border(p, me.x - p.x, me.y - p.y), border(me, p.x - me.x, p.y - me.y)];
    } else if (ling) pts = [pt(p, hdp, 0), pt(me, -hdc, 0)];
    else pts = [border(p, me.x - p.x, me.y - p.y), border(me, p.x - me.x, p.y - me.y)];
    const ed2: Record<string, any> = { pts, roof, style, i: me.i };
    const labels = (me.st.elabels || []).filter((l: any) => l.t).map((l: any) => edgeLabel(l, pts, me.st));
    if (labels.length) { ed2.label = labels[0]; ed2.labels = labels; }
    edges.push(ed2);
  }

  // labels and pins: a node beside the node, its opposite side on the node's border (a pin 3ex out, with a line)
  const marks: any[] = [];
  for (const me of nodes) for (const lb of me.st.labels || []) {
    if (!lb.t || me.st.phantom) continue;
    const ts = { size: me.st.size, font: me.st.font, bold: false, italic: false, tw: 0, align: 'center' };
    let dist = lb.pin ? 3 * 0.43 * TD.sizePx(me.st.size) : 0;
    for (const o of lb.o) {
      if (o.k === 'font' && o.v != null) { if (/\\(bfseries|textbf)/.test(o.v)) ts.bold = true; if (/\\(itshape|textit)/.test(o.v)) ts.italic = true; const m = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(o.v); if (m) ts.size = SIZE_CMD[m[1]]; }
      else if ((o.k === 'label distance' || o.k === 'pin distance') && o.v != null) { const d = len(o.v, TD.sizePx(me.st.size)); if (isFinite(d!)) dist = d!; }
    }
    const b = TD.textBox(lb.t, ts), Es = TD.sizePx(ts.size), sep = 0.3333 * Es;
    const hd = glyphHD(lb.t, false), th = hd ? (hd.ht + hd.dp) * Es : Math.max(0, b.h - 0.22 * Es);
    const w = Math.max(0, b.w - 2) + 2 * sep, h = th + 2 * sep;
    const dir = LABEL_DIR[lb.at], ang = (dir ? dir[0] : parseFloat(lb.at)) * Math.PI / 180, ux = Math.cos(ang), uy = -Math.sin(ang);
    // where on the node: its compass anchor for a direction, else its border at that angle
    const P = dir ? anchorAt(me, dir[1], me.fr, true)! : border(me, ux, uy);
    // the label's centre: from its anchor (the opposite side) out to its middle
    let cx, cy;
    if (dir && /\s/.test(dir[1])) { cx = P[0] + Math.sign(ux) * w / 2; cy = P[1] + Math.sign(uy) * h / 2; }
    else { const tt = Math.min(ux ? w / 2 / Math.abs(ux) : Infinity, uy ? h / 2 / Math.abs(uy) : Infinity); cx = P[0] + ux * tt; cy = P[1] + uy * tt; }
    cx += ux * dist; cy += uy * dist;
    marks.push({ t: lb.t, ts, x: cx, y: cy, w, h, pin: lb.pin ? [P, [cx - ux * w / 2, cy - uy * h / 2]] : null });
  }

  // TikZ code drawn with the tree: a node's own edge path (edge path / edge path'), its tikz={…}, and the code after
  // the tree. It may name nodes (name=, alias=), the tree's bounding box, and walk from its node as forest does:
  // (.south) the node, (!u) its parent, (!r) the root, (!1) (!l) its first and last child, (!n) (!p) its siblings
  const under: any[] = [], over: any[] = [];
  if (DRAW_DEPTH < 2 && TD.importInternals?.drawWith && (T.after || nodes.some((m) => m.st.epath || m.st.tikz.length))) {
    const named: Record<string, any> = {}, box = (m: any) => ({ x: m.x, y: m.y, w: m.w, h: m.h, kind: m.st.shape === 'rect' ? 'rect' : 'ellipse' });
    for (const m of nodes) { named[`ftn-${m.i}`] = box(m); if (m.st.name) named[m.st.name] = box(m); if (m.st.alias) named[m.st.alias] = box(m); }
    {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const m of nodes) if (!m.st.phantom) { a = Math.min(a, m.x - m.w / 2); b = Math.min(b, m.y - m.h / 2); c = Math.max(c, m.x + m.w / 2); d = Math.max(d, m.y + m.h / 2); }
      named['current bounding box'] = { x: (a + c) / 2, y: (b + d) / 2, w: c - a, h: d - b, kind: 'rect' };
    }
    const compass = (deg: number) => { const g = ((Math.round(deg) % 360) + 360) % 360; return ({ 0: 'east', 90: 'north', 180: 'west', 270: 'south' } as Record<number, string>)[g] ?? String(g); };
    const anchorName = (m: any, a: string) => {
      let x = (a || '').trim();
      if (x === 'parent anchor') x = m.st.pa; else if (x === 'child anchor') x = m.st.ca; else if (x === 'anchor') x = m.st.anchor;
      if (x === 'children') x = compass(m.fr.grow); else if (x === 'parent') x = m.parent >= 0 ? compass(nodes[m.parent].fr.grow + 180) : 'center';
      return x ? '.' + x : '';
    };
    const walkTo = (from: any, w: string) => {
      let m = from;
      for (const c of w) {
        if (!m) return null;
        if (c === 'u') m = m.parent >= 0 ? nodes[m.parent] : null;
        else if (c === 'r') m = nodes[0];
        else if (/\d/.test(c)) m = nodes[m.kids[+c - 1]];
        else if (c === 'l') m = nodes[m.kids[m.kids.length - 1]];
        else if (c === 'n' || c === 'p') { const p = nodes[m.parent]; m = p ? nodes[p.kids[p.kids.indexOf(m.i) + (c === 'n' ? 1 : -1)]] : null; }
        else return null;
      }
      return m;
    };
    const REL = /(?<=\(\s*|[|-]-?\|?\s*)(?:!([A-Za-z0-9]+)(?:\.((?:[a-z]+ )*[a-z]+|-?\d+))?|\.((?:[a-z]+ )*[a-z]+|-?\d+))(?=\s*(?:\)|\||-\|))/g;
    const local = (code: string, m: any) => String(code).replace(/\\noexpand\s*/g, '')
      .replace(/\\forestoption\{edge\}/g, m.st.edgeRaw).replace(/\\forestoption\{edge label\}/g, m.st.elabelRaw || '')
      .replace(/\\forest(?:e?option|ove)\{[^{}]*\}/g, '')
      .replace(REL, (all: string, w: string, a1: string, a2: string) => { const n = w ? walkTo(m, w) : m; return n ? `ftn-${n.i}${anchorName(n, w ? a1 : a2)}` : all; });
    const draw = (code: string, m: any, into: any[]) => {
      DRAW_DEPTH++;
      try {
        const R = TD.importInternals.drawWith(local(code, m), named, s.tex?.preamble);
        into.push(...R.shapes);
        for (const w of R.issues) warn(`Not drawn in the TikZ code: ${String(w).slice(0, 80)}`);
      } finally { DRAW_DEPTH--; }
    };
    for (const m of nodes) {
      if (m.st.epath && m.parent >= 0 && !m.st.edge.none && !m.st.phantom) draw(m.st.epath.code ?? `\\path[${m.st.edgeRaw}] ${m.st.epath.path} ${m.st.elabelRaw || ''};`, m, under);
      for (const c of m.st.tikz) draw(c, m, over);
    }
    if (T.after) draw(T.after, nodes[0], over);
  }

  // bounding box
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const me of nodes) if (!me.st.phantom) ext(me.x - me.w / 2, me.y - me.h / 2, me.x + me.w / 2, me.y + me.h / 2);
  for (const m of marks) ext(m.x - m.w / 2, m.y - m.h / 2, m.x + m.w / 2, m.y + m.h / 2);
  for (const x of [...under, ...over]) { try { const b = TD.bbox(x); if (isFinite(b.x) && isFinite(b.w)) ext(b.x, b.y, b.x + b.w, b.y + b.h); } catch { /* a shape without a box */ } }
  for (const e of edges) {
    for (const [x, y] of e.pts) ext(x - 1, y - 1, x + 1, y + 1);
    for (const l of e.labels || []) ext(l.x - l.w / 2, l.y - l.h / 2, l.x + l.w / 2, l.y + l.h / 2);
  }
  const levels = 1 + Math.max(...nodes.map((m) => m.depth));
  return { nodes, edges, marks, under, over, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, n: nodes.length, levels, G, U, grow, rev, libs: [...libs] };
}

// ---------------------------------------------------------------- drawing
function draw(s: any, ctx: any) {
  const L = layout(s), ink = s.color || '#000000', col = TD.css(ink), paper = ctx.paper || '#ffffff';
  let out = '';
  if (L.empty) {
    out += `<rect x="0" y="0" width="${r2(L.bb.w)}" height="${r2(L.bb.h)}" fill="none" stroke="${col}" stroke-width="${r2(0.4 / K)}" stroke-dasharray="3 2" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty tree', { size: 'small', font: s.font }, '#888888', L.bb.w / 2, L.bb.h / 2, ctx);
  }
  const dashAttr = (d: any, lw: any) => (d ? ` stroke-dasharray="${d.map((v: any) => r2(Math.max(v / K, lw))).join(' ')}"` : '');
  for (const e of L.edges) {
    const st = e.style, c = st.color ? TD.css(st.color) : col, lw = st.lw;
    const pts = e.pts.slice();
    // arrow tips: the line stops short so its end stays under the tip
    const tip = (P: any, Q: any) => {
      const dx = P[0] - Q[0], dy = P[1] - Q[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a = 2.2 / K + lw * 2, b = a * 0.62;
      return { d: `M${r2(P[0])},${r2(P[1])}L${r2(P[0] - ux * a - uy * b)},${r2(P[1] - uy * a + ux * b)}Q${r2(P[0] - ux * a * 0.7)},${r2(P[1] - uy * a * 0.7)} ${r2(P[0] - ux * a + uy * b)},${r2(P[1] - uy * a - ux * b)}Z`, back: [P[0] - ux * a * 0.7, P[1] - uy * a * 0.7] };
    };
    let tips = '';
    if (!e.roof && st.end && pts.length > 1) { const t = tip(pts[pts.length - 1], pts[pts.length - 2]); tips += t.d; pts[pts.length - 1] = t.back; }
    if (!e.roof && st.start && pts.length > 1) { const t = tip(pts[0], pts[1]); tips += t.d; pts[0] = t.back; }
    out += `<path d="M${pts.map((p: any) => `${r2(p[0])},${r2(p[1])}`).join('L')}${e.roof ? 'Z' : ''}" fill="none" stroke="${c}" stroke-width="${r2(lw)}" stroke-linejoin="round"${dashAttr(st.dash, lw)}/>`;
    if (tips) out += `<path d="${tips}" fill="${c}" stroke="none"/>`;
    for (const l of e.labels || []) out += TD.textSvg(l.t, l.ts, ink, l.x, l.y, ctx);
  }
  const shapes = (list: any[]) => (list || []).map((x: any) => { try { return TD.TYPES[x.type].svg(x, { ...ctx, export: true }); } catch { return ''; } }).join('');
  out += shapes(L.under);
  for (const m of L.marks || []) {
    if (m.pin) out += `<path d="M${r2(m.pin[0][0])},${r2(m.pin[0][1])}L${r2(m.pin[1][0])},${r2(m.pin[1][1])}" fill="none" stroke="${col}" stroke-width="${r2(0.4 / K)}"/>`;
    out += TD.textSvg(m.t, m.ts, ink, m.x, m.y, ctx);
  }
  for (const me of L.nodes) {
    const st = me.st;
    if (st.phantom) continue;
    if ((st.draw || st.fill) && st.shape !== 'coordinate') {
      // in the UI's ink (palette drawings) a fill is a tint of that ink, so it reads in light and dark themes
      const tint = ink === 'currentColor' && st.fill, fill = tint ? 'currentColor" fill-opacity=".14' : st.fill === true ? col : st.fill ? TD.css(st.fill) : 'none';
      const stroke = st.draw ? TD.css(st.dc || ink) : 'none', a = ` fill="${fill}" stroke="${stroke}" stroke-width="${r2(st.lw)}"${st.draw ? dashAttr(st.dash, st.lw) : ''}`;
      if (st.shape === 'circle') out += `<circle cx="${r2(me.x)}" cy="${r2(me.y)}" r="${r2(me.w / 2)}"${a}/>`;
      else if (st.shape === 'ellipse') out += `<ellipse cx="${r2(me.x)}" cy="${r2(me.y)}" rx="${r2(me.w / 2)}" ry="${r2(me.h / 2)}"${a}/>`;
      else out += `<rect x="${r2(me.x - me.w / 2)}" y="${r2(me.y - me.h / 2)}" width="${r2(me.w)}" height="${r2(me.h)}"${st.rc ? ` rx="${r2(Math.min(st.rc, me.w / 2, me.h / 2))}"` : ''}${a}/>`;
    }
    // a tabular's rows, each at its own baseline (aligned in the widest row's width), or the text
    if (me.rows) {
      const tw = Math.max(...me.rows.map((r: any) => r.w)), a = me.ts.align;
      for (const r of me.rows) if (r.t) out += TD.textSvg(r.t, { ...me.ts, align: 'center' }, st.tc || ink, me.x + (a === 'left' ? (r.w - tw) / 2 : a === 'right' ? (tw - r.w) / 2 : 0), me.y + r.y, ctx);
    } else if (me.t) out += TD.textSvg(me.t, me.ts, st.tc || ink, me.x, me.y, ctx);
  }
  out += shapes(L.over);
  const bb = L.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  void paper;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

// A small drawing of a tree, for the editor's palette: in the UI's ink.
TD.ftMini = (src: any, maxH = 40) => {
  const s = { type: 'forest', x: 0, y: 0, src, size: 'small', font: 'default', color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1, maxH / bb.h);
  return `<svg class="qcmini ftmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true })}</svg>`;
};

TD.TYPES.forest = {
  name: 'Tree',
  pts: [['x', 'y']],
  create: (p: any, d: any) => ({ type: 'forest', x: p.x, y: p.y, src: TD.FT_DEFAULT, size: TD.BLOCK_SIZE, font: 'default', color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // forest draws a tikzpicture of its own: like quantikz, it sits in a plain node with the outer
  // picture interrupted, centred where the drawing is
  tikz(s: any, X: any) {
    const L = layout(s);
    X.pkgs.add('forest');
    for (const l of L.libs) if (l.startsWith('tikz:')) X.libs.add(l.slice(5)); else X.pkgs.add(`forest[${l}]`);
    const b = L.bb, fo = TD.textOpts({ size: s.size, font: s.font }, X); // the tree's text size, as on the canvas
    return `\\node${fo.length ? `[${fo.join(', ')}]` : ''} at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
  },
};

// property panel: the code, what is not drawn, and a copy button

TD.ftLayout = layout;
// for the visual editor (src/editors/fteditor.ts)
TD.ft = { opt, optList, splitTop, unbrace, unwrap, parse, code, fullCode, layout, draw, len };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("forest", {
  menu: { order: 5, group: 'general', label: "Tree", title: "Tree or hierarchy, written for forest", icon: "<svg viewBox=\"0 0 32 24\"><rect x=\"12\" y=\"2\" width=\"8\" height=\"6\" class=\"a1\"/><path d=\"M16 8v3M7 11h18M7 11v3M25 11v3M16 11v3\"/><rect x=\"4\" y=\"14\" width=\"6\" height=\"6\"/><rect x=\"13\" y=\"14\" width=\"6\" height=\"6\"/><rect x=\"22\" y=\"14\" width=\"6\" height=\"6\"/></svg>" },
  nodeImport: { re: /\\begin\{forest\}[\s\S]*\\end\{forest\}/, order: 2, bb: (q) => TD.ftLayout(q).bb },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.ftEditor, alias: "ftOpen" }
});
export { layout, fullCode };
