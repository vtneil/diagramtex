import { runtime as TD } from '../runtime';
// UML sequence diagrams written for pgf-umlsd. The source is the object: a sequencediagram environment of
// \newinst and \newthread instances, \mess messages, call, callself and messcall environments (nested calls),
// sdblock frames, \prelevel / \postlevel, \setthreadbias and \tikzstyle{inststyle} changes. It is drawn here
// as the package draws it, in pt (10pt document): the same counters (seqlevel steps of 0.6cm), the empty nodes
// it hangs every arrow on (so arrows stop 3.53pt short of them), its old triangle 60 and angle 60 tips, the
// drop shadow, and an sdblock's frame sized from the bounding box of what it holds. The environment opens a
// tikzpicture of its own, so it is exported in a plain node with the outer picture interrupted (as the
// Karnaugh map is). The visual editor (src/editors/umlsdeditor.ts) reads the code into the model and writes it.
const { r2 } = TD.util;
const K = TD.PT_PER_PX, PT = 1 / K, CM = 28.45274;
// the four interword spaces (10pt Computer Modern, 3.33333pt each) pgf-umlsd's begin code sets before its picture, px
const LEAD = (4 * 10 / 3) * PT;

TD.UMLSD_DEFAULT = [
  '\\begin{sequencediagram}',
  '  \\newthread{c}{:Client}',
  '  \\newinst[1]{s}{:Server}',
  '  \\newinst[1]{d}{:Database}',
  '  \\begin{call}{c}{request()}{s}{response}',
  '    \\begin{call}{s}{query()}{d}{rows}',
  '    \\end{call}',
  '  \\end{call}',
  '\\end{sequencediagram}',
].join('\n');

// pgf-umlsd's sizes, in pt
let U = 0.6 * CM;
const LW = 0.4, IS = 3.33298, OS = LW / 2, E = IS + OS, EX = 4.30554;
const INST_W = 1.6 * CM, INST_H = 0.8 * CM, SHADOW = 0.5 * EX;
const TEXT = { size: 10 * PT, font: 'default' }, SMALL = { size: 9 * PT, font: 'default' }, IS_SMALL = 0.3333 * 9;
const DEF_THREAD = 'gray!30';

// ---------------------------------------------------------------- reading the code
const tt = () => TD.texText;
const close = (s: string, i: number) => tt().close(s, i);
const opts = (s: any) => tt().split(String(s || '')).map((x: string) => x.trim()).filter(Boolean);
const kv = (it: string) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null as string | null }; };
const unbrace = (v: any) => { const t = String(v ?? '').trim(); return t[0] === '{' && close(t, 0) === t.length - 1 ? t.slice(1, -1).trim() : t; };
const num = (v: number) => String(Math.round(v * 1000) / 1000).replace(/^-0$/, '0');
const cmOf = (v: any, dflt: number) => { const t = String(v ?? '').trim(); if (!t) return dflt; const m = /^(-?[\d.]+)\s*(cm|mm|pt|in)?$/.exec(t); if (!m) return NaN; const x = parseFloat(m[1]); return m[2] === 'mm' ? x / 10 : m[2] === 'pt' ? x / CM : m[2] === 'in' ? x * 2.54 : x; };

// Arguments after a command: an optional [..] then n {..} groups (spaces and line breaks between them).
function args(s: string, i: number, n: number) {
  let o: string | null = null;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  ws();
  if (s[i] === '[') { const e = close(s, i); if (e < 0) return null; o = s.slice(i + 1, e); i = e + 1; }
  const g: string[] = [];
  for (let k = 0; k < n; k++) {
    ws();
    if (s[i] !== '{') return null;
    const e = close(s, i);
    if (e < 0) return null;
    g.push(s.slice(i + 1, e)); i = e + 1;
  }
  return { o, g, end: i };
}
const ENVS: Record<string, number> = { call: 4, callself: 3, messcall: 3, sdblock: 2 };
const PATHCMD = /^\\(draw|node|path|fill|filldraw|coordinate|shade|shadedraw|pic|clip|foreach|matrix)\b/;

// The model: a tree of items, each { k, ... , blank (a blank line before it) }:
//   inst   { thread, o (distance, or thread colour), v (its name), t (its text) }
//   mess   { o (delay), a, t, b }
//   call   { env: 'call' | 'callself' | 'messcall', o (level), a, t, b (callself: a), r (return; not messcall), body }
//   block  { o (caption colour), t (caption), c (comment), body }
//   pre / post, bias { v }, style { name, op ('=' or '+='), o }, flag { name, v }, raw { t }
function parse(src: any) {
  const text = String(src || '');
  const warnings: string[] = [];
  const bm = /\\begin\s*\{sequencediagram\}/.exec(text), em = text.lastIndexOf('\\end{sequencediagram}');
  const body = bm && em > bm.index ? text.slice(bm.index + bm[0].length, em) : text;
  const before = bm ? text.slice(0, bm.index).trim() : '', after = bm && em > 0 ? text.slice(em + 21).trim() : '';
  let i = 0;
  function list(endName: string | null): any[] {
    const out: any[] = [];
    for (;;) {
      let blank = false;
      for (;;) {
        const m = /^[ \t]*\n/.exec(body.slice(i));
        if (m) { i += m[0].length; continue; }
        const w = /^[ \t]+/.exec(body.slice(i));
        if (w) { i += w[0].length; continue; }
        break;
      }
      // a blank line: two line breaks with only spaces between (the first one ended the previous line)
      const back = body.slice(Math.max(0, i - 200), i);
      blank = /\n[ \t]*\n[ \t]*$/.test(back);
      if (i >= body.length) { if (endName) warnings.push(`\\begin{${endName}} has no \\end{${endName}}`); return out; }
      const rest = body.slice(i);
      const push = (it: any, len: number) => { if (blank && out.length) it.blank = true; out.push(it); i += len; };
      if (rest[0] === '%') { const e = rest.indexOf('\n'); push({ k: 'raw', t: e < 0 ? rest : rest.slice(0, e) }, e < 0 ? rest.length : e); continue; }
      let m = /^\\end\s*\{([A-Za-z]+)\}/.exec(rest);
      if (m) {
        if (m[1] === endName) { i += m[0].length; return out; }
        warnings.push(`\\end{${m[1]}} doesn't close anything here`);
        push({ k: 'raw', t: m[0] }, m[0].length); continue;
      }
      m = /^\\begin\s*\{(call|callself|messcall|sdblock)\}/.exec(rest);
      if (m) {
        const name = m[1], A = args(rest, m[0].length, ENVS[name]);
        if (A) {
          const it: any = name === 'sdblock' ? { k: 'block', o: A.o, t: A.g[0], c: A.g[1] }
            : name === 'call' ? { k: 'call', env: name, o: A.o, a: A.g[0], t: A.g[1], b: A.g[2], r: A.g[3] }
            : name === 'callself' ? { k: 'call', env: name, o: A.o, a: A.g[0], t: A.g[1], b: A.g[0], r: A.g[2] }
            : { k: 'call', env: name, o: A.o, a: A.g[0], t: A.g[1], b: A.g[2] };
          if (blank && out.length) it.blank = true;
          i += A.end;
          it.body = list(name);
          out.push(it);
          continue;
        }
      }
      m = /^\\(newinst|newthread)(?![A-Za-z])/.exec(rest);
      if (m) { const A = args(rest, m[0].length, 2); if (A) { push({ k: 'inst', thread: m[1] === 'newthread', o: A.o, v: A.g[0], t: A.g[1] }, A.end); continue; } }
      m = /^\\mess(?![A-Za-z])/.exec(rest);
      if (m) { const A = args(rest, m[0].length, 3); if (A) { push({ k: 'mess', o: A.o, a: A.g[0], t: A.g[1], b: A.g[2] }, A.end); continue; } }
      m = /^\\(prelevel|postlevel)(?![A-Za-z])/.exec(rest);
      if (m) { push({ k: m[1] === 'prelevel' ? 'pre' : 'post' }, m[0].length); continue; }
      m = /^\\setthreadbias(?![A-Za-z])/.exec(rest);
      if (m) { const A = args(rest, m[0].length, 1); if (A) { push({ k: 'bias', v: A.g[0].trim() }, A.end); continue; } }
      m = /^\\(?:def|renewcommand)\s*\{?\\unitfactor\}?\s*\{([^{}]*)\}/.exec(rest);
      if (m) { push({ k: 'unit', v: m[1].trim() }, m[0].length); continue; }
      m = /^\\tikzstyle\s*\{([^{}]*)\}\s*(\+?=)\s*\[/.exec(rest);
      if (m) { const e = close(rest, m[0].length - 1); if (e > 0) { push({ k: 'style', name: m[1].trim(), op: m[2], o: rest.slice(m[0].length, e) }, e + 1); continue; } }
      m = /^\\pgfumlsd(underline|roundedcorners)(true|false)(?![A-Za-z])/.exec(rest);
      if (m) { push({ k: 'flag', name: m[1], v: m[2] === 'true' }, m[0].length); continue; }
      // anything else is kept as written: a TikZ statement to its semicolon, other code to the end of its line
      let e = -1;
      if (PATHCMD.test(rest)) {
        let d = 0;
        for (let k = 0; k < rest.length; k++) {
          const c = rest[k];
          if (c === '\\') { k++; continue; }
          if (c === '{') d++; else if (c === '}') d--;
          else if (c === ';' && d === 0) { e = k + 1; break; }
        }
      }
      if (e < 0) { const nl = rest.indexOf('\n'); e = nl < 0 ? rest.length : nl; }
      push({ k: 'raw', t: rest.slice(0, e).replace(/\s+$/, '') }, e);
    }
  }
  const items = list(null);
  return { items, warnings, before, after };
}

function itemCode(it: any, pad: string): string {
  const o = it.o != null && it.o !== '' ? `[${it.o}]` : '';
  switch (it.k) {
    case 'inst': return `${pad}\\${it.thread ? 'newthread' : 'newinst'}${o}{${it.v}}{${it.t}}`;
    case 'mess': return `${pad}\\mess${o}{${it.a}}{${it.t}}{${it.b}}`;
    case 'unit': return `${pad}\\def\\unitfactor{${it.v}}`;
    case 'pre': return `${pad}\\prelevel`;
    case 'post': return `${pad}\\postlevel`;
    case 'bias': return `${pad}\\setthreadbias{${it.v}}`;
    case 'style': return `${pad}\\tikzstyle{${it.name}}${it.op}[${it.o}]`;
    case 'flag': return `${pad}\\pgfumlsd${it.name}${it.v ? 'true' : 'false'}`;
    case 'raw': return it.t.split('\n').map((l: string) => pad + l.replace(/^\s+/, '')).join('\n');
    case 'call': case 'block': {
      const name = it.k === 'block' ? 'sdblock' : it.env;
      const g = it.k === 'block' ? [it.t, it.c] : it.env === 'callself' ? [it.a, it.t, it.r] : it.env === 'messcall' ? [it.a, it.t, it.b] : [it.a, it.t, it.b, it.r];
      return [`${pad}\\begin{${name}}${o}${g.map((x: any) => `{${x ?? ''}}`).join('')}`, ...listCode(it.body || [], pad + '  '), `${pad}\\end{${name}}`].join('\n');
    }
  }
  return '';
}
function listCode(items: any[], pad: string): string[] {
  const out: string[] = [];
  items.forEach((it, n) => { if (it.blank && n) out.push(''); out.push(itemCode(it, pad)); });
  return out;
}
function write(M: any) {
  return [...(M.before ? [M.before] : []), '\\begin{sequencediagram}', ...listCode(M.items, '  '), '\\end{sequencediagram}', ...(M.after ? [M.after] : [])].join('\n');
}

// pgf-umlsd places a message or call where it is written, at nodes named after its instances: an instance made
// later in the code is not there yet ("No shape named `b' is known"). lateRefs lists those names, in order.
const isArrow = (it: any) => it && (it.k === 'call' || it.k === 'mess');
function lateRefs(items: any[]) {
  const seen = new Set<string>(), out: { name: string; it: any }[] = [];
  const go = (list: any[]) => {
    for (const it of list) {
      if (it.k === 'inst') seen.add(it.v);
      if (isArrow(it)) for (const n of [it.a, it.b]) if (n && !seen.has(n) && !out.some((r) => r.name === n)) out.push({ name: n, it });
      if (it.body) go(it.body);
    }
  };
  go(items);
  return out;
}
// Moves top-level instances up to just before what first names them, so the code compiles. \newinst places an
// instance beside the one before it whatever the level, so this draws the same: the instances keep their order
// (those in between move with it) and nothing crosses a style, flag or other statement. Returns true when changed.
function settle(M: any) {
  const items = M.items as any[];
  const barrier = (it: any) => !(it.k === 'inst' || isArrow(it) || it.k === 'block' || it.k === 'pre' || it.k === 'post');
  const uses = (it: any, n: string): boolean => (isArrow(it) && (it.a === n || it.b === n)) || (it.body || []).some((x: any) => uses(x, n));
  let changed = false;
  for (let guard = 0; guard < items.length; guard++) {
    let moved = false;
    for (let d = 0; d < items.length && !moved; d++) {
      if (items[d].k !== 'inst') continue;
      const p = items.findIndex((x, j) => j < d && uses(x, items[d].v));
      if (p < 0 || items.slice(p, d).some(barrier)) continue;
      const span = items.slice(p, d + 1);
      items.splice(p, span.length, ...span.filter((x) => x.k === 'inst'), ...span.filter((x) => x.k !== 'inst'));
      moved = changed = true;
    }
    if (!moved) break;
  }
  return changed;
}

// ---------------------------------------------------------------- text
// a line of text: its width, height and depth (pt), and the style to draw it in
// \shortstack{a\\b} stacks its lines centred, 3pt (\lineskip) between one's depth and the next one's height,
// on the last line's baseline. lines[i].dy: the line's baseline above the box's.
// A size switch that opens the text (\small Text) sets its size (not the node's inner sep, read before it).
function textOf(t: string, st: any = TEXT) {
  const sw = /^\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![A-Za-z])\s*/.exec(t);
  if (sw) { st = { ...st, size: SIZES[sw[1]][0] * PT }; t = t.slice(sw[0].length); }
  const k = st.size / TEXT.size;
  const one = (x: string) => {
    const b = TD.textBox(x, st), w = x ? Math.max(0, b.w - 2) * K : 0;
    const { ht, dp } = x ? tt().hd(x) : { ht: 0, dp: 0 };
    return { t: x, w, ht: ht * k, dp: dp * k, dy: 0 };
  };
  const m = /^\\shortstack\s*(?:\[[lcr]\])?\s*\{([\s\S]*)\}$/.exec(t.trim());
  if (!m) { const o = one(t); return { t, st, w: o.w, ht: o.ht, dp: o.dp, lines: [o] }; }
  const ls = m[1].split(/\\\\/).map((x) => one(x.trim()));
  let y = 0;
  for (let i = ls.length - 1; i >= 0; i--) { ls[i].dy = y; if (i) y += ls[i].ht + 3 + ls[i - 1].dp; }
  return { t, st, w: Math.max(...ls.map((x) => x.w)), ht: ls[0].dy + ls[0].ht, dp: ls[ls.length - 1].dp, lines: ls };
}
// the size a font switch gives (10pt document), and its em (the node's inner sep is a third of it)
const SIZES: Record<string, [number, number]> = { tiny: [5, 5], scriptsize: [7, 7], footnotesize: [8, 8], small: [9, 9], normalsize: [10, 10], large: [12, 11.74983], Large: [14.4, 14.09978], LARGE: [17.28, 16.91968], huge: [20.74, 20.30362], Huge: [24.88, 24.36435] };

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
const col = (v: any) => (v == null ? null : TD.tikzColor ? TD.tikzColor(unbrace(v)) : null);

// The arrow tips of PGF's old arrows library, in their own frame: x along the line, out of it, from where
// the line now ends (cut back by the tip's right extent R).
function tipOf(kind: string) {
  const r = (150 * Math.PI) / 180;
  if (kind === 'triangle 60') {
    const a = 0.5 + 0.25 * LW;
    return { R: 0.5 * a + LW, pts: [[0.5 * a + 9 * a * Math.cos(r), 9 * a * Math.sin(r)], [0.5 * a, 0], [0.5 * a + 9 * a * Math.cos(r), -9 * a * Math.sin(r)]], closed: true, fill: true };
  }
  const a = 0.3 + 0.25 * LW;
  return { R: 0.5 * a + LW, pts: [[0.5 * a + 9 * a * Math.cos(r), 9 * a * Math.sin(r)], [0.5 * a, 0], [0.5 * a + 9 * a * Math.cos(r), -9 * a * Math.sin(r)]], closed: false, fill: false };
}

// Everything is worked out in pt, y up as in TikZ, then turned into px with y down. The bounding box is kept
// as PGF keeps it, since an sdblock's frame is drawn round the box of what it holds: every point a path moves
// to (but not a bare node name), every node's box (an empty one ±3.33pt), lines with half their width; not
// arrow tips, shadows or \coordinate.
function build(src: any) {
  const M = parse(src);
  const warnings = M.warnings.slice(), warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  if (M.before || M.after) warn('Code outside the sequencediagram environment is kept but not drawn');
  const bbs: any[] = [{ x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }];
  const add = (x1: number, y1: number, x2 = x1, y2 = y1) => { const b = bbs[bbs.length - 1]; b.x1 = Math.min(b.x1, x1, x2); b.y1 = Math.min(b.y1, y1, y2); b.x2 = Math.max(b.x2, x1, x2); b.y2 = Math.max(b.y2, y1, y2); };
  const pt = (p: number[]) => add(p[0], p[1]);
  const empty = (p: number[]) => add(p[0] - IS, p[1] - IS, p[0] + IS, p[1] + IS);

  const insts = new Map<string, any>(), order: any[] = [];
  const spans: any[] = [], boxes: any[] = [], lifelines: any[] = [], bars: any[] = [], lines: any[] = [], labels: any[] = [], frames: any[] = [], texts: any[] = [];
  let L = 0, callself = 0, bias = 'center', prevEast = 0, underline = true, threadN = 0;
  const style: string[] = [];
  // \tikzstyle{instcolor<name>}: the fill of the activation bars of calls <name> makes (a thread's colour)
  const instFill = new Map<string, any>();
  U = 0.6 * CM;
  // the line a label sits on, for the editor: which item (its path in the tree) and which of its texts
  const label = (t: string, P: number[], anchor: string, ref: any, key: string, st = TEXT, is = IS) => {
    const T = textOf(t, st), w = T.w + 2 * is, h = T.ht + T.dp + 2 * is;
    // the anchor (on the border with the outer sep) sits at P
    const ax = /west/.test(anchor) ? 1 : /east/.test(anchor) ? -1 : 0, ay = /south/.test(anchor) ? 1 : /north/.test(anchor) ? -1 : 0;
    const cx = P[0] + ax * (w / 2 + OS), cy = P[1] + ay * (h / 2 + OS);
    const box = { x: cx - w / 2, y: cy + h / 2, w, h };
    add(box.x, box.y - h, box.x + w, box.y);
    const lb = { t, st: T.st, lines: T.lines, x: cx, base: cy - h / 2 + is + T.dp, box, ref, key, color: null as any };
    labels.push(lb);
    return lb;
  };
  const inst = (v: string, where: string) => {
    const n = insts.get(v);
    if (!n) warn(`"${v}" in ${where} isn't an instance made before it (\\newinst or \\newthread)`);
    return n;
  };
  // the point at seqlevel n, `off` units down, below an instance's name node (at bias: its west, east or centre)
  const at = (n: any, off: number, b = 'center') => [n.x + (b === 'west' ? -E : b === 'east' ? E : 0), -0.5 * U - (L + off) * U];
  // a line from one empty node to another: cut at their borders (squares 3.53pt out from the centre)
  const cut = (p: number[], q: number[]) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const s = E / Math.max(Math.abs(ux), Math.abs(uy), 1e-9);
    return [[p[0] + ux * s, p[1] + uy * s], [q[0] - ux * s, q[1] - uy * s]];
  };
  const line = (pts: number[][], o: any) => {
    const Ln = { pts, dash: o.dash || '', tip: o.tip || null, ref: o.ref, ret: !!o.ret, layer: o.layer || 'main' };
    for (const p of pts) add(p[0] - LW / 2, p[1] - LW / 2, p[0] + LW / 2, p[1] + LW / 2);
    lines.push(Ln);
    return Ln;
  };
  const along = (p: number[], q: number[], f: number) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  // an activation bar from one empty node down to another
  const bar = (top: number[], bot: number[], fill: any, ref: any) => {
    const x1 = top[0] - E, x2 = top[0] + E;
    bars.push({ x1, x2, y1: bot[1], y2: top[1], x1b: bot[0] - E, x2b: bot[0] + E, fill, ref });
    add(Math.min(x1, bot[0] - E) - LW / 2, bot[1] - LW / 2, Math.max(x2, bot[0] + E) + LW / 2, top[1] + LW / 2);
  };

  function styleOf() {
    const S: any = { fill: col('white'), draw: col('black'), text: null, top: null, bottom: null, middle: null, rounded: 0, lw: LW, size: null };
    const ax = { t: 'gray', b: 'white', m: 'gray!50!white' };
    for (const it0 of opts(style.join(','))) {
      const it = unbrace(it0), { k, v } = kv(it);
      if (k === 'fill' && v != null) { S.fill = v === 'none' ? null : col(v) ?? S.fill; continue; }
      // TikZ's axis shading: top gray and bottom white until set; a top or bottom colour resets the middle to their mix
      if ((k === 'top color' || k === 'bottom color') && v != null) {
        if (k === 'top color') ax.t = unbrace(v); else ax.b = unbrace(v);
        ax.m = `${ax.t}!50!${ax.b}`; S.shade = true; continue;
      }
      if (k === 'middle color' && v != null) { ax.m = unbrace(v); S.shade = true; continue; }
      if ((k === 'draw' || k === 'color') && v != null) { S.draw = v === 'none' ? null : col(v) ?? S.draw; if (k === 'color') S.text = S.draw; continue; }
      if (k === 'text' && v != null) { S.text = col(v); continue; }
      if (k === 'rounded corners') { S.rounded = v == null ? 4 : cmOf(v, 0) * CM || 0; continue; }
      if (k === 'sharp corners') { S.rounded = 0; continue; }
      if (/^(very thin|thin|semithick|thick|very thick|ultra thick|ultra thin)$/.test(k)) { S.lw = ({ 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 } as any)[k]; continue; }
      if (k === 'font' && v != null) {
        const f = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(unbrace(v));
        if (f) { S.size = SIZES[f[1]]; continue; }
      }
      if (/^(rectangle|draw|anchor|minimum height|minimum width|drop shadow|shade)$/.test(k)) continue;
      warn(`The instance style "${it}" isn't drawn here (it is kept in the code)`);
    }
    if (S.shade) { S.top = col(ax.t); S.bottom = col(ax.b); S.middle = col(ax.m); }
    return S;
  }

  // ts: the fill the thread style has now (each call adds its caller's, for as long as it lasts)
  function run(items: any[], path: number[], ts: any) {
    items.forEach((it: any, n: number) => {
      const ref = [...path, n];
      // for the editor: where each item starts and ends (pt, y up), so a drop lands at the right place in the code
      const y0 = it.k === 'block' ? -(L + 2) * U : -0.5 * U - (L + 1.7) * U;
      const sp: any = { ref, k: it.k, y0, y1: y0 };
      if (it.k !== 'inst' && it.k !== 'style' && it.k !== 'flag' && it.k !== 'raw' && it.k !== 'unit') spans.push(sp);
      switch (it.k) {
        case 'inst': {
          const d = it.thread ? 0.2 : cmOf(it.o, 0.2);
          if (!isFinite(d)) warn(`The distance "${it.o}" of "${it.v}" isn't one the drawing reads`);
          const west = prevEast + (isFinite(d) ? d : 0.2) * CM;
          if (order.length || true) { add(prevEast, 0); add(west, 0); }
          const S = styleOf();
          const st = S.size ? { ...TEXT, size: S.size[0] * PT } : TEXT, is = S.size ? S.size[1] / 3 : IS;
          const T = textOf(underline && !/^\s*\\shortstack/.test(it.t) ? `\\underline{${it.t}}` : it.t, st);
          const w = Math.max(INST_W, T.w + 2 * is), h = Math.max(INST_H, T.ht + T.dp + 2 * is);
          const cx = west + OS + w / 2;
          const node: any = { v: it.v, idx: order.length, x: cx, w, h, S, thread: it.thread, fill: it.thread ? col(it.o || DEF_THREAD) : null, ref, T };
          add(cx - w / 2 - S.lw / 2, -h / 2 - S.lw / 2, cx + w / 2 + S.lw / 2, h / 2 + S.lw / 2);
          prevEast = cx + w / 2 + OS;
          const vp = [cx, -0.5 * U]; pt(vp); empty(vp);
          if (it.thread) { node.thread = ++threadN; empty([cx, -0.8 * CM]); }
          if (insts.has(it.v)) warn(`There are two instances named "${it.v}"`);
          insts.set(it.v, node); order.push(node);
          instFill.set(it.v, node.fill);
          boxes.push(node);
          texts.push({ t: T.t, st: T.st, lines: T.lines, color: S.text, x: cx, base: (T.dp - T.ht) / 2, w: T.w, ref, key: 't' });
          break;
        }
        case 'mess': {
          const A = inst(it.a, 'a message'), B = inst(it.b, 'a message');
          if (/[\\()]/.test(it.t)) warn(`\\mess{${it.a}}{${it.t}}{${it.b}}: pgf-umlsd names nodes after a message's text, so commands and round brackets in it don't compile (a call's text can have them)`);
          L++;
          const p = A ? at(A, 0.7) : null;
          if (p) { pt(p); empty(p); }
          const d = it.o != null && it.o !== '' ? parseFloat(it.o) : 0;
          L += isFinite(d) ? d : 0;
          const q = B ? at(B, 0.7) : null;
          if (q) { pt(q); empty(q); }
          if (p && q) {
            const [s, e] = cut(p, q);
            line([s, e], { tip: 'angle 60', ref });
            label(it.t, along(s, e, 0.5), 'south', ref, 't');
          }
          break;
        }
        case 'call': {
          const A = inst(it.a, `a call ("${it.t}")`), self = it.env === 'callself' || (it.env === 'call' && it.a === it.b);
          const B = self ? A : inst(it.b, `a call ("${it.t}")`);
          const lvl = it.o != null && it.o !== '' ? parseFloat(it.o) : 1;
          const fill = A && instFill.has(A.v) ? instFill.get(A.v) || ts : ts;
          L++;
          if (self) {
            callself++;
            const dx = (callself * 0.1 - 0.1) * CM;
            let sc: any = null, scb: any = null;
            if (A) {
              sc = [A.x + dx, -0.5 * U - (L + 0.7) * U]; pt(sc); empty(sc);
              const ce = [sc[0] + E, sc[1]]; pt(ce);
              scb = [ce[0], ce[1] - 0.33 * U]; pt(scb); empty(scb);
              const p1 = [ce[0] + 0.8 * CM, ce[1]], p2 = [p1[0], p1[1] - 0.33 * U], p3 = [scb[0] + E, scb[1]];
              line([ce, p1, p2, p3], { tip: 'triangle 60', ref });
              label(it.t, along(ce, p1, 0.25), 'south west', ref, 't');
            }
            run(it.body || [], [...ref], fill);
            L += isFinite(lvl) ? lvl : 1;
            if (A) {
              const sct = [A.x + dx, -0.5 * U - (L + 0.33) * U]; pt(sct); empty(sct);
              const q0 = [sct[0] + E, sct[1]]; pt(q0); empty(q0);
              const q1 = [q0[0] + 0.8 * CM, q0[1]], q2 = [q1[0], q1[1] - 0.33 * U], q3 = [q0[0], q2[1]];
              if (it.env !== 'messcall') { line([q0, q1, q2, q3], { tip: 'angle 60', dash: 'dash', ref, ret: true }); label(it.r || '', along(q1, q2, 0.5), 'west', ref, 'r'); }
              bar(scb, q0, fill, ref);
            }
            callself--;
            break;
          }
          let cf: any = null, ct: any = null;
          if (A && B) {
            cf = at(A, 0.7); pt(cf); empty(cf);
            const tb = at(B, -L, bias); pt([tb[0], -0.5 * U]);
            ct = at(B, 0.7, bias); pt(ct); empty(ct);
            const [s, e] = cut(cf, ct);
            line([s, e], { tip: it.env === 'messcall' ? 'angle 60' : 'triangle 60', ref });
            label(it.t, along(s, e, 0.5), 'south', ref, 't');
          }
          const myBias = bias;
          run(it.body || [], [...ref], fill);
          L += isFinite(lvl) ? lvl : 1;
          if (A && B) {
            const rf = at(A, 0.7); pt(rf); empty(rf);
            const b2 = bias;
            pt([B.x + (b2 === 'west' ? -E : b2 === 'east' ? E : 0), -0.5 * U]);
            const rt = at(B, it.env === 'messcall' ? 0.3 : 0.7, b2); pt(rt); empty(rt);
            if (it.env !== 'messcall') {
              const [s, e] = cut(rt, rf);
              line([s, e], { tip: 'angle 60', dash: 'dash', ref, ret: true });
              label(it.r || '', along(s, e, 0.5), 'south', ref, 'r');
            }
            bar(ct, rt, fill, ref);
          }
          void myBias;
          break;
        }
        case 'block': {
          L++;
          const by = -L * U - U;
          L++;
          bbs.push({ x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
          run(it.body || [], [...ref], ts);
          const ey = -L * U - 2 * U;
          const B = bbs[bbs.length - 1];
          if (!isFinite(B.x1)) { add(0, 0); }
          const midy = (B.y1 + B.y2) / 2;
          const be = [B.x2 + 0.2 * CM, midy]; pt([B.x2, midy]); pt(be); empty(be);
          const nw = [B.x1 - 0.2 * CM, by]; pt([B.x1, by]); pt(nw); empty(nw);
          const se0 = [be[0], ey]; pt(se0); empty(se0);
          // the caption, in a pentagon at the top left; the comment beside it, small
          const lb = label(it.t, nw, 'north west', ref, 't');
          const bx = lb.box, NE = [bx.x + bx.w + OS, bx.y + OS], SE = [bx.x + bx.w + OS, bx.y - bx.h - OS], SW = [bx.x - OS, bx.y - bx.h - OS], NW = [bx.x - OS, bx.y + OS];
          const set = [SE[0], SE[1] + 0.2 * CM], seb = [SE[0] - 0.2 * CM, SE[1]];
          pt(SE); pt(set); empty(set); pt(seb); empty(seb);
          const comm = [NE[0] + 0.2 * CM, NE[1]]; pt(NE); pt(comm); empty(comm);
          const poly = [NW, NE, set, seb, SW];
          for (const p of poly) add(p[0] - LW / 2, p[1] - LW / 2, p[0] + LW / 2, p[1] + LW / 2);
          const cl = label(it.c || '', comm, 'north west', ref, 'c', SMALL, IS_SMALL);
          const fr = { x1: nw[0], y1: B.y1, x2: B.x2, y2: nw[1], poly, fill: col(it.o || 'white'), ref, title: lb, comment: cl };
          bbs.pop();
          frames.push(fr);
          add(fr.x1 - LW / 2, fr.y1 - LW / 2, fr.x2 + LW / 2, fr.y2 + LW / 2);
          L++;
          break;
        }
        case 'pre': L--; break;
        case 'post': L++; break;
        case 'bias': if (/^(center|west|east)$/.test(it.v)) bias = it.v; else warn(`\\setthreadbias{${it.v}}: the bias is center, west or east`); break;
        case 'style':
          if (/^instcolor/.test(it.name)) {
            const v = it.name.slice(9), fills = opts(it.o).map(kv).filter((x: any) => x.k === 'fill' && x.v);
            instFill.set(v, fills.length ? col(fills[fills.length - 1].v) : null);
            break;
          }
          if (it.name !== 'inststyle') { warn(`The style "${it.name}" isn't drawn here (it is kept in the code)`); break; }
          if (it.op === '=') style.length = 0;
          style.push(it.o);
          break;
        case 'flag': if (it.name === 'underline') underline = it.v; else warn(`\\pgfumlsd${it.name}… is read when the diagram starts: use \\tikzstyle{inststyle}+=[rounded corners=3mm]`); break;
        case 'unit': { const v = parseFloat(it.v); if (isFinite(v) && v > 0) U = v * CM; else warn(`\\unitfactor "${it.v}" isn't a number`); break; }
        case 'raw': if (!/^%/.test(it.t)) warn(`"${it.t.split('\n')[0].slice(0, 40)}${it.t.length > 40 ? '…' : ''}" isn't drawn here (it is kept in the code)`); break;
      }
      if (it.k === 'call') sp.y1 = -0.5 * U - (L + 0.7) * U;
      else if (it.k === 'block') sp.y1 = -(L - 1) * U - 2 * U;
    });
  }
  // origin: inst0, a coordinate at (0,0)
  run(M.items, [], null);
  // the lifelines (dotted, on the background) and the threads' bars, at the end
  for (const n of order) {
    const y2 = -(L + 2.2) * U;
    lifelines.push({ x: n.x, y1: -n.h / 2 - OS, y2 });
    add(n.x - LW / 2, y2 - LW / 2, n.x + LW / 2, -n.h / 2 - OS + LW / 2);
  }
  for (const n of order) if (n.thread) {
    const top = [n.x, -0.8 * CM], te = [n.x, -0.5 * U - (L + 0.1) * U + 0.5 * U - 0.8 * CM];
    // threadend: (thread)+(0, -seqlevel·u - 0.1u)
    te[1] = top[1] - L * U - 0.1 * U;
    pt(te); empty(te);
    bars.push({ x1: n.x - E, x2: n.x + E, y1: te[1], y2: top[1], x1b: n.x - E, x2b: n.x + E, fill: n.fill, ref: n.ref, thread: true });
    add(n.x - E - LW / 2, te[1] - LW / 2, n.x + E + LW / 2, top[1] + LW / 2);
  }
  const B = bbs[0], emptyPic = !order.length && !frames.length && !lines.length;
  if (emptyPic) { B.x1 = 0; B.y1 = -1.2 * CM; B.x2 = 3 * CM; B.y2 = 0; }
  const bbPt = { x1: B.x1, y1: B.y1, x2: B.x2, y2: B.y2 };
  const X = (v: number) => v * PT, Y = (v: number) => -v * PT;
  return { M, insts, order, spans, unit: U, boxes, lifelines, bars, lines, labels, frames, texts, warnings, empty: emptyPic, level: L, bbPt,
    bb: { x: X(B.x1), y: Y(B.y2), w: (B.x2 - B.x1) * PT, h: (B.y2 - B.y1) * PT } };
}

// ---------------------------------------------------------------- drawing
const X = (v: number) => r2(v * PT), Y = (v: number) => r2(-v * PT);
function textAt(t: any, ink: string, ctx: any) {
  const color = t.color ? TD.css(t.color) : ink;
  return (t.lines || [{ t: t.t, dy: 0 }]).map((l: any) => {
    if (!l.t) return '';
    const b = TD.textBox(l.t, t.st);
    return TD.textSvg(l.t, t.st, color, t.x * PT, Y(t.base + l.dy) - tt().baseOff(t.st) + b.h / 2, ctx);
  }).join('');
}
function draw(s: any, ctx: any) {
  const Lo = layout(s), ink = TD.css('#000000'), bb = Lo.bb;
  let out = '';
  if (Lo.empty) {
    out += `<rect x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW * PT)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty sequence diagram', { size: 'small', font: 'default' }, '#888888', bb.x + bb.w / 2, bb.y + bb.h / 2, ctx);
  }
  const sw = r2(LW * PT);
  // the background: lifelines, dotted (on 0.4pt, off 2pt)
  for (const l of Lo.lifelines) out += `<path d="M${X(l.x)},${Y(l.y1)}V${Y(l.y2)}" stroke="${ink}" stroke-width="${sw}" stroke-dasharray="${r2(LW * PT)} ${r2(2 * PT)}"/>`;
  // the thread layer: activation bars, then the threads' own
  for (const b of Lo.bars) out += `<path d="M${X(b.x1)},${Y(b.y2)}L${X(b.x2)},${Y(b.y2)}L${X(b.x2b)},${Y(b.y1)}L${X(b.x1b)},${Y(b.y1)}Z" fill="${b.fill ? TD.css(b.fill) : 'none'}" stroke="${ink}" stroke-width="${sw}"/>`;
  // the main layer, in the order the package draws: instances, then arrows, labels and frames as they come
  for (const n of Lo.boxes) {
    const S = n.S, x = X(n.x - n.w / 2), y = Y(n.h / 2), w = r2(n.w * PT), h = r2(n.h * PT), rx = S.rounded ? ` rx="${r2(S.rounded * PT)}"` : '';
    out += `<rect x="${r2(+x + SHADOW * PT)}" y="${r2(+y + SHADOW * PT)}" width="${w}" height="${h}"${rx} fill="${ink}"/>`;
    let fill = S.fill ? TD.css(S.fill) : 'none';
    if (S.top || S.bottom) {
      const id = `sdg${s.id || ''}_${n.idx}`, top = TD.css(S.top || col('white')), bot = TD.css(S.bottom || col('white')), mid = S.middle ? TD.css(S.middle) : null;
      out += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/>${mid ? `<stop offset="0.5" stop-color="${mid}"/>` : ''}<stop offset="1" stop-color="${bot}"/></linearGradient></defs>`;
      fill = `url(#${id})`;
    }
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx} fill="${fill}" stroke="${S.draw ? TD.css(S.draw) : 'none'}" stroke-width="${r2(S.lw * PT)}"/>`;
  }
  for (const t of Lo.texts) out += textAt(t, ink, ctx);
  for (const Ln of Lo.lines) out += lineSvg(Ln, ink);
  for (const f of Lo.frames) {
    out += `<rect x="${X(f.x1)}" y="${Y(f.y2)}" width="${r2((f.x2 - f.x1) * PT)}" height="${r2((f.y2 - f.y1) * PT)}" fill="none" stroke="${ink}" stroke-width="${sw}"/>`;
    out += `<path d="${f.poly.map((p: number[], i: number) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')}Z" fill="${f.fill ? TD.css(f.fill) : 'none'}" stroke="${ink}" stroke-width="${sw}"/>`;
  }
  for (const lb of Lo.labels) if (lb.t) out += textAt(lb, ink, ctx);
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}
function lineSvg(Ln: any, ink: string) {
  const sw = r2(LW * PT), pts = Ln.pts.map((p: number[]) => p.slice());
  let tipSvg = '';
  if (Ln.tip) {
    const T = tipOf(Ln.tip), i = pts.length - 1, Q = pts[i - 1], P = pts[i];
    const dx = P[0] - Q[0], dy = P[1] - Q[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const O = [P[0] - ux * T.R, P[1] - uy * T.R];
    pts[i] = O;
    const poly = T.pts.map(([x, y]: number[]) => [O[0] + ux * x - uy * y, O[1] + uy * x + ux * y]);
    tipSvg = `<path d="${poly.map((p: number[], k: number) => `${k ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')}${T.closed ? 'Z' : ''}" fill="${T.fill ? ink : 'none'}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="miter" stroke-linecap="${T.closed ? 'butt' : 'round'}"/>`;
  }
  const dash = Ln.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : '';
  return `<path d="${pts.map((p: number[], k: number) => `${k ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="miter"${dash}/>${tipSvg}`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{sequencediagram\}/.test(t) ? t : `\\begin{sequencediagram}\n${t}\n\\end{sequencediagram}`;
}

TD.TYPES.umlsd = {
  name: 'UML sequence diagram',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'umlsd', x: p.x, y: p.y, src: TD.UMLSD_DEFAULT }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the environment opens a tikzpicture of its own: it sits in a plain node with the outer picture interrupted.
  // The node keeps TikZ's own inner sep: pgf-umlsd's bars and anchors are empty nodes, sized by the inner sep in
  // force (inner sep=0pt here would carry into them and draw the bars as hairlines). The environment's begin code
  // sets four interword spaces before its picture (LEAD), so the node's centre is LEAD/2 left of the picture's.
  tikz(s: any, X: any) {
    X.pkgs.add('pgf-umlsd');
    const b = layout(s).bb;
    return `\\node at ${X.c(s.x + b.w / 2 - LEAD / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
  },
};

// for the visual editor (src/editors/umlsdeditor.ts)
TD.umlsd = { parse, write, settle, lateRefs, layout, draw, kv, opts, unbrace, num, fullCode, CM, U };
TD.blocks.register('umlsd', {
  menu: { order: 9.6, label: 'Sequence', title: 'UML sequence diagram, written for pgf-umlsd', icon: '<svg viewBox="0 0 32 24"><rect x="3" y="2" width="9" height="5" rx="1"/><rect x="20" y="2" width="9" height="5" rx="1"/><path d="M7.5 7v15M24.5 7v15" stroke-dasharray="1.5 1.5"/><path d="M7.5 11h15M20 9l3 2-3 2M24.5 17h-15" /><path d="M12 15l-3 2 3 2"/></svg>' },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.umlsdEditor, alias: 'umlsdOpen', layout: (s: any) => TD.umlsd.layout(s) },
  nodeImport: { re: /\\begin\{sequencediagram\}[\s\S]*\\end\{sequencediagram\}/, order: 6.5, dedent: true, place: (q: any, at: any) => { const b = TD.umlsd.layout(q).bb; q.x = at.x - b.w / 2 + LEAD / 2; q.y = at.y - b.h / 2; } },
});
export { layout, fullCode };
