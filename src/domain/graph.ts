import { runtime as TD } from '../runtime';
import { fan, lines, isMultiline, halfH, lift, besideAt, close, split, opts, kv, unbrace, stripComments, shown, skip, nextSemi, cm, coord, num, applyOpts, baseStyle, polyline, along, ptsD, unit, bezAt, bezTan, arrowed, DIRS, LOOPS, WIDTHS } from './automata.ts';
import { layoutCache, srcKey } from './layout-cache';
// Graphs written with TikZ's graphs library: a tikzpicture holding one \graph { … }; of node
// declarations (name/text [at={(x,y)}, options]) and edges (a ->["label"', options] b). It is drawn here
// as vectors at TikZ's sizes and exported unchanged, its tikzpicture turned into a scope shifted to where
// the drawing sits. Chains (a -> b -> c), groups ({a, b} -- c) and TikZ's own placement are read; the
// visual editor (src/editors/grapheditor.ts) writes one line per node and per edge. fromText reads the
// usual ways of writing a graph down (adjacency matrix or list, edge list, DOT, Mermaid, JSON).
const { r2 } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K, MM = PX / 10;
const EM = 10 * PT, INNER = 0.3333 * EM, LW = 0.4 * PT, DBL = 0.6 * PT, ABOVE = 0.09 * PX;
const SIZES: Record<string, number> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
const OPS = ['<->', '-!-', '->', '<-', '--'];
const ARROWS: Record<string, any> = { '->': { s: null, e: '>' }, '<-': { s: '>', e: null }, '<->': { s: '>', e: '>' }, '--': { s: null, e: null } };

TD.GRAPH_DEFAULT = [
  '\\begin{tikzpicture}[>=Stealth]',
  '  \\graph[no placement, nodes={draw, circle, minimum size=7mm}] {',
  '    a/$a$ [at={(0,0)}];',
  '    b/$b$ [at={(2,1)}];',
  '    c/$c$ [at={(2,-1)}];',
  '    d/$d$ [at={(4,0)}];',
  '    a -- b;',
  '    a -- c;',
  '    b -- c;',
  '    b ->["$3$"] d;',
  '    c ->["$5$"\'] d;',
  '  };',
  '\\end{tikzpicture}',
].join('\n');

// ---------------------------------------------------------------- reading the code
// The model: { env (picture options, or null), gopts: [graph option], nodes, edges, pre, post, warnings, found }
// node: { name, text (as written after the slash, or null: the name), o: [option], x, y (cm, or null),
//         lab: { t, side } | null (label=side:text) }
// tree: the graph's groups, chains and nodes as written, for TikZ's placement (place())
// edge: { a, b, op ('->' '--' '<-' '<->'), o: [option], t (label) | null, sw (label swapped), lo: [label option] }
const isQuote = (it: string) => /^\s*"/.test(it);
function readQuote(it: string) {
  const s = it.trim(), e = s.indexOf('"', 1);
  if (e < 0) return null;
  let rest = s.slice(e + 1).trim(), sw = false;
  if (rest[0] === "'") { sw = true; rest = rest.slice(1).trim(); }
  const lo = !rest ? [] : rest[0] === '{' ? opts(unbrace(rest)) : [rest];
  return { t: s.slice(1, e), sw, lo };
}
const LABEL_SIDE = /^(above|below|left|right|above left|above right|below left|below right|-?\d+(?:\.\d+)?)\s*:\s*([\s\S]*)$/;
function readLabel(v: string) {
  let u = unbrace(v);
  // a note of several lines is written label={[align=center]side:a\\b}
  const al = /^\[\s*align\s*=\s*center\s*\]\s*/.exec(u);
  if (al) u = u.slice(al[0].length);
  if (u[0] === '[') return null; // other label options: kept as written
  const m = LABEL_SIDE.exec(u);
  return m ? { t: unbrace(m[2]), side: m[1] } : { t: u, side: 'above' };
}

function parse(src: any) {
  const warnings: string[] = [], warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const t = stripComments(String(src || ''));
  const bm = /\\begin\{tikzpicture\}\s*/.exec(t);
  let body = t, env: string | null = null;
  if (bm) {
    let i = bm.index + bm[0].length;
    env = '';
    if (t[i] === '[') { const e = close(t, i); if (e > 0) { env = t.slice(i + 1, e).trim(); i = e + 1; } }
    const em = t.indexOf('\\end{tikzpicture}', i);
    if (em < 0) warn('\\end{tikzpicture} is missing');
    body = t.slice(i, em < 0 ? t.length : em);
  }
  const M: any = { env, gopts: [], nodes: [], edges: [], pre: [], post: [], warnings, found: false };
  let i = 0;
  while (i < body.length) {
    i = skip(body, i);
    if (i >= body.length) break;
    const e = nextSemi(body, i), st = body.slice(i, e + 1).trim();
    i = e + 1;
    if (!st) continue;
    if (!M.found && /^\\graph\b/.test(st) && readGraph(st, M, warn)) { M.found = true; continue; }
    (M.found ? M.post : M.pre).push(st);
    if (!/^\\(tikzset|usetikzlibrary)\b/.test(st)) warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`);
  }
  if (!M.found && (M.pre.length || M.post.length)) warn('There is no \\graph { … }; to draw');
  return M;
}

// \graph[options] { statements };
function readGraph(st: string, M: any, warn: any) {
  let i = skip(st, 6);
  if (st[i] === '[') { const e = close(st, i); if (e < 0) return false; M.gopts = opts(st.slice(i + 1, e)); i = skip(st, e + 1); }
  if (st[i] !== '{') return false;
  const e = close(st, i);
  if (e < 0) return false;
  if (st.slice(e + 1).trim() !== ';') return false;
  try { readBody(st.slice(i + 1, e), M, warn); } catch { warn('Part of the \\graph could not be read: it is drawn as far as it could be read'); }
  return true;
}

// a key that sets what a group's (or the graph's) inside makes: true when read, 'op' for an operator run after the
// group (clique, cycle, path), false otherwise
function envKey(env: any, it: string): boolean | 'op' {
  const { k, v } = kv(it);
  // (n= and m= also name their shore's nodes V 1 …, W 1 …: graphs' n/.style and m/.style)
  if ((k === 'n' || k === 'V') && v != null) { const L = k === 'n' ? valueList(`1,...,${unbrace(v)}`) : valueList(unbrace(v)); if (!L) return false; env.V = L; if (k === 'n') env.shoreV = 'V'; return true; }
  if ((k === 'm' || k === 'W') && v != null) { const L = k === 'm' ? valueList(`1,...,${unbrace(v)}`) : valueList(unbrace(v)); if (!L) return false; env.W = L; if (k === 'm') env.shoreW = 'W'; return true; }
  if (k === 'p' && v != null) return true; // (G_np's p: not drawn)
  if (k === 'name' && v != null) { env.prefix += unbrace(v).trim() + ' '; return true; }
  if (v == null && ['->', '--', '<-', '<->', '-!-'].includes(k)) { env.kind = k; return true; }
  if ((k === 'edges' || k === 'edge') && v != null) { env.edges.push(...opts(unbrace(v))); return true; }
  if (v == null && ['clique', 'cycle', 'path'].includes(k)) return 'op';
  if (v == null && k === 'complete bipartite') return true;
  return false;
}
// a \foreach list: a, b, c with 1,...,9 and a,...,f ranges
function valueList(t: string): string[] | null {
  const items = split(t, ',').map((x: string) => x.trim()).filter((x: string) => x !== '');
  const out: string[] = [];
  for (let k = 0; k < items.length; k++) {
    if (items[k] === '...' && k > 0 && k + 1 < items.length) {
      const a = out[out.length - 1], b = items[k + 1], prev = out.length > 1 ? out[out.length - 2] : null;
      if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
        const step = prev != null && /^-?\d+$/.test(prev) ? +a - +prev : +b >= +a ? 1 : -1;
        if (!step || out.length > 1000) return null;
        for (let x = +a + step; step > 0 ? x <= +b : x >= +b; x += step) out.push(String(x));
        k++; continue;
      }
      if (/^[a-zA-Z]$/.test(a) && /^[a-zA-Z]$/.test(b)) { for (let c = a.charCodeAt(0) + 1; c <= b.charCodeAt(0); c++) out.push(String.fromCharCode(c)); k++; continue; }
      return null;
    }
    out.push(unbrace(items[k]));
  }
  return out;
}
function readBody(s: string, M: any, warn: any) {
  let i = 0;
  const byName = new Map<string, any>();
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const opAt = () => OPS.find((o) => s.startsWith(o, i)) || null;
  const bracket = () => { ws(); if (s[i] !== '[') return null; const e = close(s, i); if (e < 0) throw new Error('['); const r = s.slice(i + 1, e); i = e + 1; return r; };
  // each statement, chain and group returns its entries and exits (what an edge into or out of it joins), the nodes
  // it names in order (what a group's operators join) and its shape for TikZ's placement (place()): a group is
  // chains, a chain elements, an element a node or a group. `env` is what the graph's and groups' options set for
  // what is inside: V (the node set a subgraph makes), the name prefix (name=), the edge kind operators make (->),
  // and the groups' own edge styles (edges=, edge=)
  function statements(stop: string, env: any) {
    const ins: string[] = [], outs: string[] = [], chains: any[] = [], names: string[] = [];
    for (;;) {
      ws();
      if (i >= s.length || s[i] === stop) break;
      if (s[i] === ',' || s[i] === ';') { i++; continue; }
      const at = i, ch = chain(env);
      if (i === at) throw new Error('stuck');
      ins.push(...ch.ins); outs.push(...ch.outs); chains.push(ch.els); names.push(...ch.names);
    }
    return { ins, outs, chains, names };
  }
  function chain(env: any) {
    const first = elem(env), els = [first.tree], names = [...first.names];
    let cur = first;
    for (;;) {
      ws();
      const op = opAt();
      if (!op) break;
      i += op.length;
      const eo = bracket();
      const next = elem(env);
      els.push(next.tree); names.push(...next.names);
      join(cur.outs, next.ins, op, eo, env);
      cur = next;
    }
    return { ins: first.ins, outs: cur.outs, els, names };
  }
  // a group { [options] … } or a subgraph: its options read into a new env, its operators run on its nodes after it
  function group(opts0: string[], env0: any, body: (env: any) => any) {
    const env = { ...env0, edges: env0.edges.slice() }, ops: string[] = [], keep: string[] = [], bad: string[] = [];
    for (const it of opts0) {
      const r = envKey(env, it);
      if (r === 'op') ops.push(kv(it).k);
      else if (r === true) keep.push(it);
      else if (placeKey(placeStart(), zeroCounts(), it, () => {}) === true) keep.push(it);
      else bad.push(it);
    }
    if (bad.length) warn(`The group options [${bad.join(', ')}] aren't drawn here; editing writes the edges out one by one`);
    const g = body(env);
    // cycle, path and clique join the group's nodes in the order named, with the edges it makes (graphs library)
    const list = g.names;
    for (const k of ops) {
      const pairs: [string, string][] = [];
      if (k === 'path' || k === 'cycle') { for (let q = 1; q < list.length; q++) pairs.push([list[q - 1], list[q]]); if (k === 'cycle' && list.length > 1) pairs.push([list[list.length - 1], list[0]]); }
      if (k === 'clique') for (let a = list.length - 1; a >= 1; a--) for (let b = a - 1; b >= 0; b--) pairs.push([list[b], list[a]]);
      for (const [a, b] of pairs) join([a], [b], env.kind, null, env);
    }
    return { ins: g.ins, outs: g.outs, names: g.names, tree: { k: 'group', opts: keep, chains: g.chains } };
  }
  function elem(env: any): any {
    ws();
    if (s[i] === '{') {
      i++;
      const go = bracket();
      const r = group(go != null ? opts(go) : [], env, (e) => statements('}', e));
      if (s[i] !== '}') throw new Error('}');
      i++;
      return r;
    }
    // subgraph X [options] (graphs.standard): I_n is a node for each of V, named with the prefix, its text the
    // value; K_n, C_n and P_n are I_n in a group whose clique, cycle or path joins them
    const sg = /^subgraph\s+([A-Za-z_]+)/.exec(s.slice(i));
    if (sg) {
      const kind = sg[1];
      if (!['I_n', 'K_n', 'C_n', 'P_n', 'I_nm', 'K_nm'].includes(kind)) { warn(`The subgraph ${kind} isn't drawn here (it is kept in the code)`); throw new Error('subgraph'); }
      i += sg[0].length;
      const so = bracket(), user = so != null ? opts(so) : [];
      const In = (e: any) => {
        const chains: any[] = [], names: string[] = [];
        for (const v of e.V) { const n = node(e, { name: e.prefix + v, text: v }); chains.push([n.tree]); names.push(n.names[0]); }
        return { ins: names, outs: names, chains, names };
      };
      if (kind === 'I_n') return group(user, env, In);
      // I_nm: subgraph I_n [name shore V] -- [no edges] subgraph I_n [name shore W, V=W]; K_nm joins every V to every W
      // (graphs.standard; measured: the shores side by side, each down its group)
      if (kind === 'I_nm' || kind === 'K_nm') return group(user, env, (e) => {
        if (!e.W) { warn(`The subgraph ${kind} without W or m isn't drawn here (it is kept in the code)`); throw new Error('subgraph'); }
        const shore = (V: string[], nm: string | undefined) => group([], { ...e, V, prefix: e.prefix + (nm ? nm + ' ' : '') }, In);
        const a = shore(e.V, e.shoreV), b = shore(e.W, e.shoreW);
        if (kind === 'K_nm') for (const x of a.names) for (const y of b.names) join([x], [y], e.kind, null, e);
        return { ins: a.ins, outs: b.outs, names: [...a.names, ...b.names], chains: [[a.tree, b.tree]] };
      });
      const op = kind === 'K_n' ? 'clique' : kind === 'C_n' ? 'cycle' : 'path';
      return group([...user, op], env, (e) => { const inner = group([], e, In); return { ins: inner.ins, outs: inner.outs, names: inner.names, chains: [[inner.tree]] }; });
    }
    return node(env);
  }
  // the text after a slash: braced, quoted, or up to the options, a separator or an edge
  function slashText() {
    ws();
    if (s[i] === '{') { const e = close(s, i); if (e < 0) throw new Error('{'); const t = s.slice(i + 1, e); i = e + 1; return t; }
    if (s[i] === '"') { const e = s.indexOf('"', i + 1); if (e < 0) throw new Error('"'); const t = s.slice(i + 1, e); i = e + 1; return t; }
    const at = i;
    let math = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '$') { math = !math; i++; continue; }
      if (ch === '{') { const e = close(s, i); if (e < 0) throw new Error('{'); i = e + 1; continue; }
      if (!math && ('[,;}'.includes(ch) || opAt())) break;
      i++;
    }
    return s.slice(at, i).trim();
  }
  function node(env: any, made?: { name: string; text: string }) {
    ws();
    let name: string, text: string | null = null;
    if (made) { name = made.name; text = made.text; }
    else if (s[i] === '"') {
      const e = s.indexOf('"', i + 1);
      if (e < 0) throw new Error('"');
      name = s.slice(i + 1, e); text = name; i = e + 1;
    } else if (s[i] === '(') {
      // (name): a node the picture already has, its name as written (v-1-1, a.north)
      const e = close(s, i);
      if (e < 0) throw new Error('(');
      name = s.slice(i, e + 1); i = e + 1;
    } else {
      const m = /^[^\s,;[\]{}/"<>!=-]+(?:[ \t]+[^\s,;[\]{}/"<>!=-]+)*/.exec(s.slice(i));
      if (!m) throw new Error('name');
      name = m[0]; i += m[0].length;
      // (name= on the graph or a group puts its prefix before the name; the text is the name as written)
      if (env.prefix) { text = name; name = env.prefix + name; }
    }
    ws();
    if (!made && s[i] === '/') { i++; text = slashText(); }
    const o = made ? null : bracket();
    let n = byName.get(name);
    const fresh = !n;
    if (!n) {
      n = { name, text, o: [], x: null, y: null, lab: null };
      byName.set(name, n); M.nodes.push(n);
    } else if (text != null) n.text = text;
    if (o != null) for (const it of opts(o)) {
      const { k, v } = kv(it);
      if (k === 'at' && v != null) {
        const p = coord(unbrace(v));
        if (p) { n.x = p[0]; n.y = p[1]; continue; }
        warn(`The position ${unbrace(v)} isn't one the drawing understands; use at={(x,y)}`);
      }
      if (k === 'as' && v != null) { n.text = unbrace(v); continue; }
      if (k === 'label' && v != null) { const L = readLabel(v); if (L) { n.lab = L; continue; } }
      if (isQuote(it)) {
        const q = readQuote(it);
        if (q) { const side = q.lo.find((x) => DIRS[x] != null); if (q.lo.length <= (side ? 1 : 0)) { n.lab = { t: q.t, side: side || 'above' }; continue; } }
      }
      n.o.push(it);
    }
    return { ins: [name], outs: [name], names: [name], tree: { k: 'node', name, made: fresh } };
  }
  function join(outs: string[], ins: string[], op: string, eo: string | null, env: any) {
    // (complete bipartite is how a join joins anyway)
    const list = [...env.edges, ...(eo == null ? [] : opts(eo))].filter((it) => !/^complete bipartite\s*$/.test(it.trim()));
    for (const a of outs) for (const b of ins) {
      if (op === '-!-') { M.edges = M.edges.filter((e: any) => !((e.a === a && e.b === b) || (e.a === b && e.b === a))); continue; }
      const e: any = { a, b, op, o: [], t: null, sw: false, lo: [] };
      for (const it of list) {
        const { k, v } = kv(it);
        if (isQuote(it)) { const q = readQuote(it); if (q && e.t == null) { e.t = q.t; e.sw = q.sw; e.lo = q.lo; continue; } }
        if ((k === 'edge label' || k === "edge label'") && v != null && e.t == null) { e.t = unbrace(v); e.sw = k.endsWith("'"); continue; }
        e.o.push(it);
      }
      M.edges.push(e);
    }
  }
  const env: any = { V: ['1'], prefix: '', kind: '--', edges: [] };
  for (const it of M.gopts) envKey(env, it);
  env.edges = [];
  M.tree = { k: 'group', opts: [], chains: statements('', env).chains };
  if (i < s.length) throw new Error('rest');
}

// ---------------------------------------------------------------- writing the code
// braces round a text that would otherwise end early
const textCode = (t: string) => (/[,;[\]{}"/]|->|--|<-|\\\\|^\s|\s$/.test(t) && !(t[0] === '{' && close(t, 0) === t.length - 1) ? `{${t}}` : t);
const val = (t: string) => (/[,=\]]/.test(t) || t === '' ? `{${t}}` : t);
function nodeCode(n: any) {
  const o: string[] = [];
  if (n.x != null) o.push(`at={(${num(n.x)},${num(n.y)})}`);
  o.push(...n.o);
  // text of several lines (\\) needs an alignment in TikZ
  if (n.text && isMultiline(n.text) && !n.o.some((it: string) => /^(align|text width)$/.test(kv(it).k))) o.push('align=center');
  if (n.lab && n.lab.t) {
    const side = n.lab.side && n.lab.side !== 'above' ? n.lab.side + ':' : '';
    o.push(isMultiline(n.lab.t) ? `label={[align=center]${side || 'above:'}${n.lab.t}}` : `label=${side}${val(n.lab.t)}`);
  }
  // \\ after name/ stops the graphs parser, so text of several lines goes in as={…}
  const ml = n.text != null && isMultiline(n.text);
  if (ml) o.unshift(`as={${n.text}}`);
  const head = ml || n.text == null || n.text === n.name ? n.name : `${n.name}/${textCode(n.text)}`;
  return `${head}${o.length ? ` [${o.join(', ')}]` : ''}`;
}
function quoteCode(e: any) {
  if (e.t == null) return null;
  const lo = (e.lo || []).slice();
  if (isMultiline(e.t) && !lo.some((it: string) => /^(align|text width)$/.test(kv(it).k))) lo.push('align=center');
  return `"${e.t}"${e.sw ? "'" : ''}${lo.length ? ' ' + (lo.length > 1 || /[,=]/.test(lo[0]) ? `{${lo.join(', ')}}` : lo[0]) : ''}`;
}
function edgeCode(e: any) {
  const o = [quoteCode(e), ...e.o].filter((x) => x != null);
  return `${e.a} ${e.op}${o.length ? `[${o.join(', ')}]` : ''} ${e.b}`;
}
function write(M: any) {
  const lines = M.pre.map((x: string) => '  ' + x);
  lines.push(`  \\graph${M.gopts.length ? `[${M.gopts.join(', ')}]` : ''} {`);
  for (const n of M.nodes) lines.push(`    ${nodeCode(n)};`);
  for (const e of M.edges) lines.push(`    ${edgeCode(e)};`);
  lines.push('  };');
  for (const x of M.post) lines.push('  ' + x);
  const body = lines.join('\n');
  return M.env == null ? body : `\\begin{tikzpicture}${M.env ? `[${M.env}]` : ''}\n${body}\n\\end{tikzpicture}`;
}

// ---------------------------------------------------------------- node styles
// { shape, draw, drawC, fill, fillC, textC, color, minW, minH, inner, lw, dash, rc, dbl, size, bold }
function nodeBase() {
  return { shape: 'rectangle', draw: false, drawC: null, fill: false, fillC: null, textC: null, color: null, minW: 0, minH: 0, inner: INNER, lw: LW, dash: '', rc: 0, dbl: false, size: 10 * PT, bold: false };
}
const SHAPES = ['circle', 'rectangle', 'ellipse', 'diamond', 'coordinate'];
const col = (v: string) => (TD.tikzColor ? TD.tikzColor(unbrace(v)) : null);
function nodeOpts(N: any, list: string[], unknown: string[] | null) {
  for (const it of list) {
    const { k, v } = kv(it);
    if (SHAPES.includes(k) && v == null) { N.shape = k; continue; }
    if (k === 'shape' && v && SHAPES.includes(unbrace(v))) { N.shape = unbrace(v); continue; }
    if (k === 'draw') { if (v == null) N.draw = true; else if (unbrace(v) === 'none') N.draw = false; else { const c = col(v); if (c) { N.draw = true; N.drawC = c; } else if (unknown) unknown.push(it); } continue; }
    if (k === 'fill') { if (v == null) N.fill = true; else if (unbrace(v) === 'none') N.fill = false; else { const c = col(v); if (c) { N.fill = true; N.fillC = c; } else if (unknown) unknown.push(it); } continue; }
    if (k === 'text' && v != null) { const c = col(v); if (c) N.textC = c; continue; }
    if (k === 'color' && v != null) { const c = col(v); if (c) N.color = c; continue; }
    if (k === 'minimum size' && v != null) { const n = cm(unbrace(v)); if (isFinite(n)) N.minW = N.minH = n * PX; continue; }
    if (k === 'minimum width' && v != null) { const n = cm(unbrace(v)); if (isFinite(n)) N.minW = n * PX; continue; }
    if (k === 'minimum height' && v != null) { const n = cm(unbrace(v)); if (isFinite(n)) N.minH = n * PX; continue; }
    if (k === 'inner sep' && v != null) { const n = cm(unbrace(v)); if (isFinite(n)) N.inner = n * PX; continue; }
    if (WIDTHS[k] != null && v == null) { N.lw = WIDTHS[k] * PT; continue; }
    if (k === 'line width' && v != null) { const w = cm(unbrace(v)); if (isFinite(w)) N.lw = w * PX; continue; }
    if (/^((densely|loosely) )?dashed$/.test(k)) { N.dash = 'dash'; continue; }
    if (/^((densely|loosely) )?dotted$/.test(k)) { N.dash = 'dot'; continue; }
    if (k === 'solid') { N.dash = ''; continue; }
    if (k === 'rounded corners') { N.rc = v == null ? 4 * PT : (cm(unbrace(v)) * PX) || 0; continue; }
    if (k === 'sharp corners') { N.rc = 0; continue; }
    if (k === 'double' && v == null) { N.dbl = true; continue; }
    if (k === 'font' && v != null) {
      const f = unbrace(v), m = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(f);
      if (m) N.size = SIZES[m[1]] * PT;
      if (/\\bfseries|\\bf\b/.test(f)) N.bold = true;
      continue;
    }
    if (v == null && col(k)) { N.color = col(k); continue; }
    if (/^(align|text width|anchor|scale|opacity|fill opacity|draw opacity|text opacity|transform shape|outer sep|inner xsep|inner ysep|text depth|text height|label distance|every label\/.*|name|alias|as)$/.test(k) || /\/\.(style|append style)$/.test(k)) continue;
    if (unknown) unknown.push(it);
  }
  return N;
}
// the text a node shows
function shownText(n: any, G: any, text?: string) {
  if (G.empty) return '';
  let t = text ?? (n.text == null ? n.name : n.text);
  if (G.math && t && !/\$|\\\(/.test(t)) t = `$${t}$`;
  return lines(shown(t));
}

// ---------------------------------------------------------------- layout
const layout = layoutCache((s: any) => srcKey(s), (s: any) => build(s.src));

// distance from a node's centre to its border, in the direction (ux, uy)
function reach(n: any, ux: number, uy: number) {
  const ax = Math.abs(ux), ay = Math.abs(uy);
  if (n.shape === 'circle') return n.r + n.osep;
  if (n.shape === 'ellipse') return 1 / Math.sqrt((ux / n.hw) ** 2 + (uy / n.hh) ** 2 || 1) + n.osep;
  if (n.shape === 'diamond') return 1 / (ax / n.hw + ay / n.hh || 1) + n.osep;
  if (n.shape === 'coordinate') return 0;
  return Math.min(ax > 1e-9 ? n.hw / ax : Infinity, ay > 1e-9 ? n.hh / ay : Infinity) + n.osep;
}
// the graph options: { nodeDef, edgeDef, math, empty, noPlace, rest }
function graphOpts(M: any) {
  const G: any = { nodeDef: [], edgeDef: [], math: false, empty: false, noPlace: false, rest: [] };
  for (const it of M.gopts) {
    const { k, v } = kv(it);
    if (k === 'nodes' && v != null) G.nodeDef.push(...opts(unbrace(v)));
    else if ((k === 'edges' || k === 'edge') && v != null) G.edgeDef.push(...opts(unbrace(v)));
    else if (k === 'math nodes' || k === 'math nodes=true') G.math = true;
    else if (k === 'empty nodes') G.empty = true;
    else if (k === 'no placement') G.noPlace = true;
    else G.rest.push(it);
  }
  return G;
}
// ---------------------------------------------------------------- TikZ's placement
// Where TikZ puts the nodes a \graph makes (graphs library: \tikz@lib@graph@linear@pos, @circular@pos and the
// placement counters), measured against pdflatex. Each new node goes where the counters are as it is made:
// chain shift × width + group shift × depth (Cartesian), or at the angle and radius they add up to (circular).
// A new node adds its logical width (1, or its size and a sep) to the width and makes the chain at least its
// logical depth deep; a name met again adds nothing. A group is as wide as its widest chain and as deep as its
// chains together; after each chain the depth grows by the chain's. A placement key (grow …, branch …, clockwise …)
// first moves what follows to where the counters are and starts them afresh; in a group's options it also makes
// the group take no room in its chain (pgf clears its totals after it).
const PT_CM = 1 / 28.4527559;
const ANCHOR_DIR: Record<string, [number, number]> = { center: [0, 0], east: [1, 0], west: [-1, 0], north: [0, 1], south: [0, -1], 'north east': [1, 1], 'north west': [-1, 1], 'south east': [1, -1], 'south west': [-1, -1] };
const AUTO_ANCHOR: Record<string, string> = { 'center center': 'center', 'west center': 'west', 'east center': 'east', 'center north': 'north', 'west north': 'north west', 'east north': 'north east', 'center south': 'south', 'west south': 'south west', 'east south': 'south east' };
function placeStart() {
  return { comp: 'lin', cs: [1, 0], gs: [0, -1], cps: [0, 1], gps: [60, 0], gpsPer: 0, vnum: 1, radius: 1, phase: 90, lw: null as any, ld: null as any, ah: 'center', av: 'center', anchor: null as string | null, base: [0, 0] };
}
const zeroCounts = () => ({ width: 0, depth: 0, lwidth: 0, ldepth: 0 });
function placeAt(S: any, C: any) {
  if (S.comp === 'none') return [0, 0];
  if (S.comp === 'circ') {
    // (a bare clockwise turns by 360/\tikzgraphVnum, the node set's size where the node is made)
    const ga = S.gpsPer ? S.gpsPer * 360 / S.vnum : S.gps[0];
    const a = ((S.cps[0] * C.width + ga * C.depth + S.phase) * Math.PI) / 180, r = S.cps[1] * C.width + S.gps[1] * C.depth + S.radius;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  return [S.cs[0] * C.width + S.gs[0] * C.depth, S.cs[1] * C.width + S.gs[1] * C.depth];
}
// a length (cm) or a plain number (the picture's x vector, 1cm: pictures with other vectors are not placed here)
const lenOr = (v: string | null | undefined, d: number) => { if (v == null) return d; const t = unbrace(v).trim(); if (/^-?[\d.]+$/.test(t)) return parseFloat(t); const n = cm(t); return isFinite(n) ? n : NaN; };
const ptOf = (v: string | null | undefined, d: number) => { if (v == null) return d; const n = cm(unbrace(v).trim()); return isFinite(n) ? n / PT_CM : NaN; };
const polar = (v: string) => { const m = /^\(\s*(-?[\d.]+(?:\s*\/\s*-?[\d.]+)?|-?360\s*\/\s*[\d.]+)\s*:\s*([^()]+?)\s*\)$/.exec(unbrace(v).trim()); if (!m) return null; const a = m[1].includes('/') ? m[1].split('/').map(parseFloat).reduce((x, y) => x / y) : parseFloat(m[1]); const r = lenOr(m[2], 0); return isFinite(a) && isFinite(r) ? [a, r] : null; };
const pair = (v: string) => { const pl = /^\(\s*(-?[\d.]+)\s*:\s*([^,()]+?)\s*\)$/.exec(unbrace(v).trim()); if (pl) { const a = (parseFloat(pl[1]) * Math.PI) / 180, r = lenOr(pl[2], NaN); return isFinite(r) ? [r * Math.cos(a), r * Math.sin(a)] : null; } const m = /^\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(unbrace(v).trim()); if (!m) return null; const x = lenOr(m[1], 0), y = lenOr(m[2], 0); return isFinite(x) && isFinite(y) ? [x, y] : null; };
// one placement key on the strategy S (copied by the caller): true when read, false when it is not a placement key,
// null when it is one this can't place exactly
function placeKey(S: any, C: any, it: string, place: () => void): boolean | null {
  const { k, v } = kv(it);
  const dir = /^(grow|branch) (right|left|up|down)( sep)?$/.exec(k);
  if (dir) {
    const [, kind, side, sep] = dir, sx = side === 'right' ? 1 : side === 'left' ? -1 : 0, sy = side === 'up' ? 1 : side === 'down' ? -1 : 0;
    if (sep) {
      const gap = ptOf(v, 10); // 1em
      if (!isFinite(gap)) return null;
      place(); S.comp = 'lin';
      const step = [sx * PT_CM, sy * PT_CM], logical = { sep: gap, axis: sx ? 'x' : 'y' };
      if (kind === 'grow') { S.cs = step; S.lw = logical; } else { S.gs = step; S.ld = logical; }
      if (sx) S.ah = sx > 0 ? 'west' : 'east'; else S.av = sy > 0 ? 'south' : 'north';
    } else {
      const d = lenOr(v, 1);
      if (!isFinite(d)) return null;
      place();
      if (kind === 'grow') { S.cs = [sx * d, sy * d]; S.lw = null; } else { S.gs = [sx * d, sy * d]; S.ld = null; }
      // (pgf's grow up and branch right set the horizontal anchor, grow down and branch up the vertical one)
      if ((kind === 'grow' && side !== 'down') || (kind === 'branch' && (side === 'right' || side === 'left'))) S.ah = 'center'; else S.av = 'center';
    }
    S.anchor = 'auto';
    return true;
  }
  if (k === 'Cartesian placement' && v == null) { place(); S.comp = 'lin'; return true; }
  if (k === 'circular placement' && v == null) { place(); S.comp = 'circ'; S.lw = S.ld = null; return true; }
  if ((k === 'clockwise' || k === 'counterclockwise')) {
    const sign = k === 'clockwise' ? -1 : 1, n = v == null ? NaN : parseFloat(unbrace(v));
    if (v != null && !(n > 0)) return null;
    place(); S.comp = 'circ'; S.lw = S.ld = null;
    if (v == null) { S.gps = [0, 0]; S.gpsPer = sign; } else { S.gps = [(sign * 360) / n, 0]; S.gpsPer = 0; }
    return true;
  }
  if ((k === 'n' || k === 'V') && v != null) { const L = k === 'n' ? valueList(`1,...,${unbrace(v)}`) : valueList(unbrace(v)); if (!L) return null; S.vnum = L.length; return false; }
  if (k === 'no placement' && v == null) { place(); S.comp = 'none'; return true; }
  if (k === 'chain shift' || k === 'group shift') { const p = v == null ? null : pair(v); if (!p) return null; if (k === 'chain shift') S.cs = p; else S.gs = p; return true; }
  if (k === 'chain polar shift' || k === 'group polar shift') { const p = v == null ? null : polar(v); if (!p) return null; if (k === 'chain polar shift') S.cps = p; else { S.gps = p; S.gpsPer = 0; } return true; }
  if (k === 'radius') { const r = lenOr(v, NaN); if (!isFinite(r)) return null; S.radius = r; return true; }
  if (k === 'phase') { const a = v == null ? NaN : parseFloat(unbrace(v)); if (!isFinite(a)) return null; S.phase = a; return true; }
  if (/^(placement\/|level |level$|@auto anchor)/.test(k)) return null;
  if (k === 'nodes' && v != null) { for (const o of opts(unbrace(v))) { const a = kv(o); if (a.k === 'anchor' && a.v != null) S.anchor = unbrace(a.v).trim(); } return false; }
  return false;
}
// each node's centre (cm) as TikZ places it, or null with why not: box(name) gives its half width and height to
// its outer border (cm), anchor(name) its own anchor= or null
function place(M: any, box: (name: string) => { hw: number; hh: number; shape: string }, ownAnchor: (name: string) => string | null): { at: Map<string, number[]>; off: Map<string, number[]>; why: string | null } {
  const at = new Map<string, number[]>(), off = new Map<string, number[]>();
  let why: string | null = null;
  const offset = (S: any, name: string) => {
    let a = ownAnchor(name) ?? (S.anchor === 'auto' ? AUTO_ANCHOR[`${S.ah} ${S.av}`] : S.anchor) ?? 'center';
    a = a.trim();
    const d = ANCHOR_DIR[a];
    if (!d) { why = `the anchor ${a}`; return [0, 0]; }
    if (!d[0] && !d[1]) return [0, 0];
    const b = box(name);
    if (b.shape === 'circle') { const L = Math.hypot(d[0], d[1]); return [(-d[0] / L) * b.hw, (-d[1] / L) * b.hh]; }
    if (b.shape !== 'rectangle' && b.shape !== 'coordinate' && d[0] && d[1]) { why = `the anchor ${a} of a ${b.shape}`; return [0, 0]; }
    return [-d[0] * b.hw, -d[1] * b.hh];
  };
  const logical = (f: any, name: string) => {
    if (!f) return 1;
    const b = box(name);
    return 2 * (f.axis === 'x' ? b.hw : b.hh) / PT_CM + f.sep;
  };
  const keys = (S: any, C: any, list: string[]) => {
    let placed = false;
    for (const it of list) {
      if (/ layout$/.test(kv(it).k)) why = `the ${kv(it).k} (graph drawing)`;
      const r = placeKey(S, C, it, () => { const p = placeAt(S, C); S.base = [S.base[0] + p[0], S.base[1] + p[1]]; Object.assign(C, zeroCounts()); placed = true; });
      if (r === null) why = `the placement option ${it}`;
    }
    return placed;
  };
  // a group: its chains one after another; returns its width and depth
  const group = (g: any, S0: any, C: any) => {
    for (const els of g.chains) {
      const Cc = { ...C, lwidth: 0, ldepth: 0 };
      for (const e of els) {
        if (e.k === 'node') {
          if (!e.made) continue;
          const p = placeAt(S0, Cc), o = offset(S0, e.name);
          at.set(e.name, [S0.base[0] + p[0] + o[0], S0.base[1] + p[1] + o[1]]); off.set(e.name, o);
          const w = logical(S0.lw, e.name), d = logical(S0.ld, e.name);
          Cc.width += w; Cc.lwidth += w; Cc.ldepth = Math.max(d, Cc.ldepth);
        } else {
          const S = { ...S0, base: S0.base.slice() }, Cg = { ...Cc, lwidth: 0, ldepth: 0 };
          const fresh = keys(S, Cg, e.opts);
          const r = group(e, S, Cg), gw = fresh ? 0 : r.w, gd = fresh ? 0 : r.d;
          Cc.width += gw; Cc.lwidth += gw; Cc.ldepth = Math.max(gd, Cc.ldepth);
        }
      }
      C.depth += Cc.ldepth; C.ldepth += Cc.ldepth; C.lwidth = Math.max(Cc.lwidth, C.lwidth);
    }
    return { w: C.lwidth, d: C.ldepth };
  };
  const S = placeStart(), C = zeroCounts();
  keys(S, C, M.gopts);
  if (M.tree) group(M.tree, S, C);
  return { at, off, why };
}

// the side a label sits at, as an angle
const sideAngle = (side: string) => (DIRS[side] != null ? DIRS[side] : isFinite(parseFloat(side)) ? parseFloat(side) : 90);
// how far a box's centre sits from the point it is anchored to, beside it in the direction (ux, uy)
const besideBy = (b: any, t: string, ux: number, uy: number) => INNER + Math.abs(ux) * ((b.w - 2) / 2) + Math.abs(uy) * halfH(t, b, EM) - Math.max(0, -uy) * ABOVE;

function build(src: any) {
  const M = parse(src);
  const warnings = M.warnings.slice(), warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
  const P0 = applyOpts(baseStyle(), opts(M.env || ''), null);
  const G = graphOpts(M);
  const ru: string[] = [];
  applyOpts({ ...P0, arrow: { ...P0.arrow } }, G.rest, ru);
  for (const u of ru) if (placeKey(placeStart(), zeroCounts(), u, () => {}) === false && envKey({ V: [], prefix: '', kind: '--', edges: [] }, u) === false && !/^(simple|multi|level|clique|layered layout|spring layout|tree layout|nodes|edges|quotes mean label|use existing nodes|fresh nodes|number nodes|name|operator)/.test(u)) warn(`The graph option "${u}" isn't drawn here (it is kept in the code)`);
  const nodes = new Map(), texts: any[] = [], paths: any[] = [], tips: any[] = [], shapes: any[] = [], edges: any[] = [];
  const unplaced = M.nodes.filter((n: any) => n.x == null);
  if (unplaced.length && G.noPlace && unplaced.length > 1) warn(`${unplaced.length} nodes have no position and sit on top of each other at (0,0). Give them at={(x,y)}, or use Auto layout in the editor`);
  for (const n of M.nodes) {
    const unknown: string[] = [];
    const N = nodeOpts(nodeOpts(nodeBase(), G.nodeDef, null), n.o, unknown);
    for (const u of unknown) warn(`The node option "${u}" isn't drawn here (it is kept in the code)`);
    // a size switch the text starts with ({\Large A}) sizes the text; the node's inner sep stays in its own font
    const raw = n.text == null ? n.name : n.text, ls = /^\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![a-zA-Z])\s*/.exec(raw);
    if (ls) N.size = SIZES[ls[1]] * PT;
    const t = shownText(n, G, ls ? raw.slice(ls[0].length) : raw), style = { size: N.size, font: 'default', bold: N.bold };
    const b = t ? TD.textBox(t, style) : { w: 2, h: 0 };
    const tw = (b.w - 2) / 2 + N.inner, th = halfH(t, b, typeof N.size === 'number' ? N.size : EM) + N.inner;
    const L: any = { name: n.name, N, t, b, style, x: 0, y: 0, shape: N.shape, r: 0, hw: 0, hh: 0, osep: N.lw / 2 + (N.dbl ? DBL / 2 + N.lw / 2 : 0) };
    if (N.shape === 'circle') { L.r = Math.max(Math.max(N.minW, N.minH) / 2, Math.hypot(tw, th)); L.hw = L.hh = L.r; }
    else if (N.shape === 'ellipse') { L.hw = Math.max(N.minW / 2, tw * Math.SQRT2); L.hh = Math.max(N.minH / 2, th * Math.SQRT2); }
    else if (N.shape === 'diamond') { L.hw = Math.max(N.minW / 2, tw + th); L.hh = Math.max(N.minH / 2, tw + th); }
    else if (N.shape === 'coordinate') { L.hw = L.hh = 0; L.osep = 0; }
    else { L.hw = Math.max(N.minW / 2, tw); L.hh = Math.max(N.minH / 2, th); }
    if (!N.draw) L.osep = N.lw / 2;
    nodes.set(n.name, L);
  }
  // where TikZ places them (at= is added to that): a picture with other x and y vectors, or a placement read only
  // roughly, is drawn roughly
  const vectors = opts(M.env || '').some((it: string) => /^(x|y|z)$/.test(kv(it).k));
  const P = place(M, (name) => { const L = nodes.get(name); return { hw: (L.hw + L.osep) / PX, hh: (L.hh + L.osep) / PX, shape: L.shape }; },
    (name) => { const n = M.nodes.find((q: any) => q.name === name), a = n && n.o.map((it: string) => kv(it)).filter((o: any) => o.k === 'anchor' && o.v != null).pop(); return a ? unbrace(a.v).trim() : null; });
  const why = vectors && (!G.noPlace || M.nodes.some((n: any) => n.x != null)) ? "the picture's own x and y units" : P.why;
  if (why) warn(unplaced.length === M.nodes.length ? `The nodes are placed by ${why}, which isn't drawn exactly: they are drawn roughly where TikZ places them. Moving one or Auto layout in the editor writes positions` : `Some nodes are placed by ${why}, which isn't drawn exactly: they are drawn roughly where TikZ places them`);
  for (const n of M.nodes) {
    const L = nodes.get(n.name), q = P.at.get(n.name) || [0, 0], o = P.off.get(n.name) || [0, 0];
    L.x = ((n.x ?? 0) + q[0]) * PX; L.y = -((n.y ?? 0) + q[1]) * PX;
    // at= for this place under no placement (the node's anchor= still moves it off that point)
    L.pin = [L.x / PX - o[0], -L.y / PX - o[1]];
  }
  // nodes: outline, text and label
  for (const L of nodes.values()) {
    const N = L.N, ink = N.drawC || N.color;
    if (N.shape !== 'coordinate' && (N.draw || N.fill)) shapes.push({ kind: N.shape, x: L.x, y: L.y, r: L.r, hw: L.hw, hh: L.hh, rc: N.rc, fill: N.fill ? N.fillC || N.color || '#000000' : null, ink: N.draw ? ink : null, inkDefault: N.draw && !ink, sw: N.lw, dash: N.dash, dbl: N.dbl, name: L.name });
    if (L.t) texts.push({ t: L.t, x: L.x, y: L.y - lift(L.t, L.b, L.style.size), b: L.b, style: L.style, color: N.textC || N.color });
    const n = M.nodes.find((q: any) => q.name === L.name);
    if (n && n.lab && n.lab.t) {
      const [ux, uy] = unit(sideAngle(n.lab.side)), rr = reach(L, ux, uy), t = lines(shown(n.lab.t)), b = TD.textBox(t, { size: 10 * PT, font: 'default' }), d = rr + besideBy(b, t, ux, uy);
      L.label = { t, x: L.x + ux * d, y: L.y + uy * d - lift(t, b, EM), b };
      texts.push({ ...L.label, style: { size: 10 * PT, font: 'default' } });
    }
  }
  // edges
  M.edges.forEach((e: any, idx: number) => {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    if (!A || !B) return;
    const unknown: string[] = [];
    const G0 = applyOpts({ ...P0, arrow: { ...(ARROWS[e.op] || ARROWS['--']) } }, G.edgeDef, null);
    const S = applyOpts(G0, e.o, unknown);
    for (const u of unknown) warn(`The edge option "${u}" isn't drawn here (it is kept in the code)`);
    const loop = e.a === e.b;
    if (loop && !S.loop) { S.loop = 'above'; [S.out, S.in] = LOOPS.above; S.loose = 8; S.minDist = 5 * MM; if (!S.arrow.e) S.arrow = { s: null, e: '>' }; }
    const dx = B.x - A.x, dy = B.y - A.y, base = (Math.atan2(-dy, dx) * 180) / Math.PI;
    const curved = loop || S.bend != null || S.out != null || S.in != null;
    let pts: number[][], bez: number[][] | null = null;
    if (!curved) {
      const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      const ra = reach(A, ux, uy), rb = reach(B, -ux, -uy);
      pts = [[A.x + ux * ra, A.y + uy * ra], [B.x - ux * rb, B.y - uy * rb]];
    } else {
      const outA = S.out != null ? (S.bend != null && !loop ? base + S.out : S.out) : base + (S.bend || 0);
      const inA = S.in != null ? (S.bend != null && !loop ? base + S.in : S.in) : base + 180 - (S.bend || 0);
      const u1 = unit(outA), u2 = unit(inA);
      const p0 = [A.x + u1[0] * reach(A, u1[0], u1[1]), A.y + u1[1] * reach(A, u1[0], u1[1])];
      const p3 = [B.x + u2[0] * reach(B, u2[0], u2[1]), B.y + u2[1] * reach(B, u2[0], u2[1])];
      const d = Math.max(S.minDist, S.loose * 0.3915 * Math.hypot(p3[0] - p0[0], p3[1] - p0[1]));
      bez = [p0, [p0[0] + u1[0] * d, p0[1] + u1[1] * d], [p3[0] + u2[0] * d, p3[1] + u2[1] * d], p3];
      pts = [];
      for (let k = 0; k <= 48; k++) pts.push(bezAt(bez, k / 48));
    }
    const P = polyline(pts);
    arrowed(P, S, paths, tips, idx);
    let label = null;
    if (e.t) {
      const lu: string[] = [], T = applyOpts({ ...S, arrow: { ...S.arrow }, auto: 1, dir: null, swap: !!e.sw, pos: 0.5 }, e.lo || [], lu);
      for (const u of lu) warn(`The label option "${u}" isn't drawn here (it is kept in the code)`);
      const p = bez ? bezAt(bez, T.pos) : [pts[0][0] + (pts[1][0] - pts[0][0]) * T.pos, pts[0][1] + (pts[1][1] - pts[0][1]) * T.pos];
      const tan = bez ? bezTan(bez, T.pos) : [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
      const tl = Math.hypot(tan[0], tan[1]) || 1, t = lines(shown(e.t)), b = TD.textBox(t, { size: 10 * PT, font: 'default' });
      let ux = 0, uy = 0;
      if (T.dir) [ux, uy] = unit(DIRS[T.dir]);
      else if (T.auto) { const side = T.auto * (T.swap ? -1 : 1); ux = (tan[1] / tl) * side; uy = (-tan[0] / tl) * side; }
      const [dx, dy] = T.dir || T.auto ? besideAt(b, t, ux, uy, EM, ABOVE) : [0, 0];
      label = { t, x: p[0] + dx, y: p[1] + dy - lift(t, b, EM), b, color: T.textColor || T.color };
      texts.push({ ...label, style: { size: 10 * PT, font: 'default' } });
    }
    edges.push({ i: idx, a: e.a, b: e.b, d: ptsD(pts), P, loop, label, bez });
  });
  // bounding box
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: number, b: number, c: number, d: number) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const p of paths) for (const m of p.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) { const x = +m[1], y = +m[2], h = p.sw / 2; ext(x - h, y - h, x + h, y + h); }
  for (const p of tips) for (const m of p.d.matchAll(/[MLQ](-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1], +m[2], +m[1], +m[2]);
  for (const c of shapes) { const h = c.sw / 2 + (c.dbl ? DBL + c.sw : 0); ext(c.x - c.hw - h, c.y - c.hh - h, c.x + c.hw + h, c.y + c.hh + h); }
  for (const t of texts) ext(t.x - t.b.w / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
  for (const n of nodes.values()) ext(n.x, n.y, n.x, n.y);
  if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
  if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
  if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
  return { M, G, P0, nodes, edges, paths, tips, shapes, texts, warnings, empty: !M.nodes.length, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}

// ---------------------------------------------------------------- drawing
function shapeSvg(c: any, attrs: string) {
  if (c.kind === 'circle') return `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(c.r)}"${attrs}/>`;
  if (c.kind === 'ellipse') return `<ellipse cx="${r2(c.x)}" cy="${r2(c.y)}" rx="${r2(c.hw)}" ry="${r2(c.hh)}"${attrs}/>`;
  if (c.kind === 'diamond') return `<path d="M${r2(c.x)},${r2(c.y - c.hh)}L${r2(c.x + c.hw)},${r2(c.y)}L${r2(c.x)},${r2(c.y + c.hh)}L${r2(c.x - c.hw)},${r2(c.y)}Z"${attrs}/>`;
  const rc = Math.min(c.rc, c.hw, c.hh);
  return `<rect x="${r2(c.x - c.hw)}" y="${r2(c.y - c.hh)}" width="${r2(2 * c.hw)}" height="${r2(2 * c.hh)}"${rc ? ` rx="${r2(rc)}"` : ''}${attrs}/>`;
}
const dashAttr = (dash: string, sw: number) => (dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + sw)}" stroke-linecap="round"` : '');
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const ink = TD.css(s.color || '#000000'), colr = (c: any) => (c ? TD.css(c) : ink);
  let out = '';
  if (Lo.empty) {
    const b = Lo.bb;
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty graph', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  for (const c of Lo.shapes) {
    const fill = c.fill ? colr(c.fill) : 'none';
    if (!c.ink && !c.inkDefault) { out += shapeSvg(c, ` fill="${fill}" stroke="none"`); continue; }
    if (c.dbl) {
      out += shapeSvg(c, ` fill="${fill}" stroke="${colr(c.ink)}" stroke-width="${r2(2 * c.sw + DBL)}"${dashAttr(c.dash, c.sw)}`);
      out += shapeSvg(c, ` fill="none" stroke="${ctx.paper || '#ffffff'}" stroke-width="${r2(DBL)}"`);
    } else out += shapeSvg(c, ` fill="${fill}" stroke="${colr(c.ink)}" stroke-width="${r2(c.sw)}"${dashAttr(c.dash, c.sw)}`);
  }
  for (const p of Lo.paths) out += `<path d="${p.d}" fill="none" stroke="${colr(p.color)}" stroke-width="${r2(p.sw)}" stroke-linejoin="round"${dashAttr(p.dash, p.sw)}/>`;
  for (const t of Lo.tips) {
    out += t.stroke ? `<path d="${t.d}" fill="none" stroke="${colr(t.color)}" stroke-width="${r2(t.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${t.d}" fill="${colr(t.color)}" stroke="none"/>`;
  }
  for (const t of Lo.texts) out += TD.textSvg(t.t, t.style, t.color || s.color || '#000000', t.x, t.y, ctx);
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{tikzpicture\}/.test(t) ? t : `\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`;
}
function libsOf(src: any) {
  const s = String(src || ''), libs = ['graphs'];
  if (/\[[^\]]*"/.test(s) || /"[^"\n]*"\s*'?\s*[,\]]/.test(s)) libs.push('quotes');
  if (/(?:>|-)\s*=?\s*\{?\s*(Stealth|Latex|Triangle|To|Straight Barb|Classical TikZ Rightarrow|Computer Modern Rightarrow)\b/.test(s)) libs.push('arrows.meta');
  if (/\b(ellipse|diamond)\b/.test(s)) libs.push('shapes.geometric');
  return libs;
}

// ---------------------------------------------------------------- automatic layout
// Every node gets a place (cm, y up, on the quarter-centimetre grid): on a circle, by a spring
// simulation (deterministic: it starts from the circle), in layers from the sources down, or on a grid.
// Edges between the same two nodes both ways bend so they part.
function placements(M: any, mode: string, step: number) {
  const N = M.nodes, n = N.length, idx = new Map(N.map((v: any, i: number) => [v.name, i]));
  const und: number[][] = N.map(() => []), out: number[][] = N.map(() => []), inn: number[][] = N.map(() => []);
  const pairs: [number, number][] = [];
  for (const e of M.edges) {
    const a = idx.get(e.a) as number, b = idx.get(e.b) as number;
    if (a == null || b == null || a === b) continue;
    und[a].push(b); und[b].push(a); pairs.push([a, b]);
    if (e.op === '->') { out[a].push(b); inn[b].push(a); } else if (e.op === '<-') { out[b].push(a); inn[a].push(b); }
  }
  const circle = () => {
    const R = n === 1 ? 0 : Math.max(step * 0.8, (step * n) / (2 * Math.PI));
    return N.map((_: any, k: number) => { const a = Math.PI / 2 - (2 * Math.PI * k) / n; return [R * Math.cos(a), R * Math.sin(a)]; });
  };
  if (mode === 'circle') return circle();
  if (mode === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    return N.map((_: any, k: number) => [(k % cols) * step, -Math.floor(k / cols) * step]);
  }
  if (mode === 'layers') {
    const depth = N.map(() => -1), order: number[] = [];
    const bfs = (r: number) => {
      const q = [r]; depth[r] = 0;
      while (q.length) {
        const u = q.shift() as number; order.push(u);
        const next = out[u].length || inn[u].length ? out[u].concat(und[u].filter((v) => !inn[u].includes(v) && !out[v].includes(u))) : und[u];
        for (const v of next) if (depth[v] < 0) { depth[v] = depth[u] + 1; q.push(v); }
      }
    };
    // sources first (nothing comes in), then whatever is left
    for (let i = 0; i < n; i++) if (depth[i] < 0 && !inn[i].length && (out[i].length || !und[i].length)) bfs(i);
    for (let i = 0; i < n; i++) if (depth[i] < 0) bfs(i);
    const layers: number[][] = [];
    for (const u of order) (layers[depth[u]] = layers[depth[u]] || []).push(u);
    const colOf = new Map<number, number>();
    const place = (ly: number[]) => ly.forEach((u, k) => colOf.set(u, k - (ly.length - 1) / 2));
    layers.forEach((ly) => ly && place(ly));
    for (let sweep = 0; sweep < 3; sweep++) for (const ly of layers) {
      if (!ly || ly.length < 2) continue;
      const bary = (u: number) => { const nb = und[u].filter((v) => depth[v] < depth[u]); const all = nb.length ? nb : und[u]; return all.length ? all.reduce((s, v) => s + (colOf.get(v) as number), 0) / all.length : (colOf.get(u) as number); };
      const b = new Map(ly.map((u) => [u, bary(u)]));
      ly.sort((p, q) => (b.get(p) as number) - (b.get(q) as number));
      place(ly);
    }
    return N.map((_: any, i: number) => [(colOf.get(i) as number) * step, -depth[i] * step]);
  }
  // spring (Fruchterman–Reingold), from the circle
  const P = circle().map((p: number[]) => [p[0] + 1e-3, p[1]]);
  const k = step, area = Math.max(1, n) * k * k;
  let temp = Math.sqrt(area) / 2;
  for (let it = 0; it < 400; it++) {
    const D = P.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 0.01 * (i - j); dy = 0.01; d = Math.hypot(dx, dy); }
      const f = (k * k) / d;
      D[i][0] += (dx / d) * f; D[i][1] += (dy / d) * f; D[j][0] -= (dx / d) * f; D[j][1] -= (dy / d) * f;
    }
    for (const [a, b] of pairs) {
      const dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], d = Math.hypot(dx, dy) || 1e-6, f = (d * d) / k;
      D[a][0] -= (dx / d) * f; D[a][1] -= (dy / d) * f; D[b][0] += (dx / d) * f; D[b][1] += (dy / d) * f;
    }
    // a little gravity keeps parts that are not joined from drifting apart
    for (let i = 0; i < n; i++) { D[i][0] -= P[i][0] * 0.05 * k; D[i][1] -= P[i][1] * 0.05 * k; }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(D[i][0], D[i][1]) || 1, m = Math.min(d, temp);
      P[i][0] += (D[i][0] / d) * m; P[i][1] += (D[i][1] / d) * m;
    }
    temp = Math.max(temp * 0.985, 0.01 * k);
  }
  // scale so the typical edge is one step long
  const lens = pairs.map(([a, b]) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1])).sort((x, y) => x - y);
  const med = lens.length ? lens[lens.length >> 1] : k, sc = med > 1e-6 ? step / med : 1;
  const cx = P.reduce((s: number, p: number[]) => s + p[0], 0) / (n || 1), cy = P.reduce((s: number, p: number[]) => s + p[1], 0) / (n || 1);
  return P.map((p: number[]) => [(p[0] - cx) * sc, (p[1] - cy) * sc]);
}
const isBendOpt = (it: string) => /^(bend left|bend right|out|in|looseness)$/.test(kv(it).k);
function autoLayout(M: any, mode = 'spring', step = 1.5) {
  if (!M.nodes.length) return false;
  const pos = placements(M, mode, step), q = (v: number) => { const r = Math.round(v * 4) / 4; return Object.is(r, -0) ? 0 : r; };
  M.nodes.forEach((n: any, i: number) => { n.x = q(pos[i][0]); n.y = q(pos[i][1]); });
  if (!M.gopts.some((it: string) => kv(it).k === 'no placement')) M.gopts.unshift('no placement');
  // edges between the same two nodes, none bent yet: a fan
  const bundles = new Map<string, any[]>();
  for (const e of M.edges) if (e.a !== e.b) { const k = [e.a, e.b].sort().join('\u0001'); (bundles.get(k) || bundles.set(k, []).get(k))!.push(e); }
  for (const b of bundles.values()) if (b.length > 1 && !b.some((e) => e.o.some(isBendOpt))) fan(b, b[0].a);
  return true;
}

// ---------------------------------------------------------------- reading other formats
// A graph written down some other way → { nodes: [{ id, label }], edges: [{ a, b, w }], directed }
type Abs = { nodes: { id: string; label?: string }[]; edges: { a: string; b: string; w?: string }[]; directed: boolean; kind: string };
function absGraph(kind: string, directed: boolean): Abs & { node: (id: any, label?: any) => string; edge: (a: any, b: any, w?: any) => void } {
  const G: any = { nodes: [], edges: [], directed, kind };
  const seen = new Map<string, any>();
  G.node = (id: any, label?: any) => {
    id = String(id).trim();
    let n = seen.get(id);
    if (!n) { n = { id }; seen.set(id, n); G.nodes.push(n); }
    if (label != null && String(label).trim() !== '' && String(label) !== id) n.label = String(label);
    return id;
  };
  G.edge = (a: any, b: any, w?: any) => { G.edges.push({ a: G.node(a), b: G.node(b), w: w == null || w === '' ? undefined : String(w) }); };
  return G;
}
const NUM = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
const NONE = /^(-|\.|x|inf|∞|infinity|null|none|nan|_)$/i;
// undirected when every edge has its reverse with the same weight; the reverses are then dropped
function settle(G: Abs) {
  if (!G.directed) return G;
  const key = (a: string, b: string) => a + '\u0001' + b, map = new Map(G.edges.map((e) => [key(e.a, e.b), e.w ?? '']));
  const sym = G.edges.every((e) => e.a === e.b || map.get(key(e.b, e.a)) === (e.w ?? ''));
  if (!sym || !G.edges.length) return G;
  const order = new Map(G.nodes.map((n, i) => [n.id, i]));
  G.edges = G.edges.filter((e) => (order.get(e.a) as number) <= (order.get(e.b) as number));
  G.directed = false;
  return G;
}
function fromMatrix(rows: string[][], kind = 'matrix'): Abs | null {
  let names: string[] | null = null;
  const n0 = rows.length, cell = (x: string) => NUM.test(x) || NONE.test(x);
  if (n0 < 2) return null;
  if (!rows[0].every(cell) && rows[0].length === n0 - 1) {
    // a header row of names, and perhaps a header column too
    names = rows[0];
    const body = rows.slice(1);
    rows = body.every((r) => r.length === n0 && !cell(r[0])) ? body.map((r) => r.slice(1)) : body;
  } else if (rows.every((r) => r.length === n0 + 1 && !cell(r[0]))) {
    names = rows.map((r) => r[0]); rows = rows.map((r) => r.slice(1));
  }
  const n = rows.length;
  if (n < 2 || rows.some((r) => r.length !== n || !r.every(cell))) return null;
  const v = rows.map((r) => r.map((x) => (NUM.test(x) ? parseFloat(x) : 0)));
  // rows of numbers are an edge list ("1 2 5": from, to, weight) unless they look like a matrix
  const binary = v.every((r) => r.every((x) => x === 0 || x === 1));
  const zeroDiag = v.every((r, i) => r[i] === 0);
  const sym = v.every((r, i) => r.every((x, j) => x === v[j][i]));
  if (!names && kind === 'matrix' && !binary && !zeroDiag && !sym) return null;
  const G = absGraph(kind, true), id = (i: number) => (names ? names[i] : String(i + 1));
  for (let i = 0; i < n; i++) G.node(id(i));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (v[i][j] !== 0) G.edge(id(i), id(j), binary ? undefined : rows[i][j]);
  return settle(G);
}
const unq = (s: string) => { s = s.trim(); return /^"[\s\S]*"$/.test(s) || /^'[\s\S]*'$/.test(s) ? s.slice(1, -1) : s; };
function fromJson(text: string): Abs | null {
  let J: any;
  try { J = JSON.parse(text); } catch { return null; }
  const idOf = (x: any) => (x != null && typeof x === 'object' ? x.id ?? x.name ?? x.key : x);
  if (Array.isArray(J)) {
    if (J.length > 1 && J.every((r: any) => Array.isArray(r) && r.length === J.length && r.every((x: any) => typeof x === 'number' || x === null))) return fromMatrix(J.map((r: any) => r.map((x: any) => (x == null ? '0' : String(x)))), 'json');
    if (J.length && J.every((r: any) => Array.isArray(r) && (r.length === 2 || r.length === 3))) { const G = absGraph('json', false); for (const [a, b, w] of J) G.edge(a, b, w); return G; }
    if (J.length && J.every((r: any) => r && typeof r === 'object' && (r.source ?? r.from ?? r.u) != null)) J = { edges: J };
    else return null;
  }
  if (!J || typeof J !== 'object') return null;
  const E = J.edges || J.links || J.arcs;
  if (Array.isArray(E) || Array.isArray(J.nodes) || Array.isArray(J.vertices)) {
    const N = J.nodes || J.vertices || [];
    const G = absGraph('json', !!J.directed);
    for (const v of N) G.node(idOf(v), v && typeof v === 'object' ? v.label ?? v.name : undefined);
    const ids = N.map(idOf), byIndex = (x: any) => (typeof x === 'number' && !ids.includes(x) && N[x] != null ? ids[x] : x);
    for (const e of E || []) {
      if (Array.isArray(e)) { G.edge(e[0], e[1], e[2]); continue; }
      const a = byIndex(idOf(e.source ?? e.from ?? e.u ?? e.s)), b = byIndex(idOf(e.target ?? e.to ?? e.v ?? e.t));
      if (a == null || b == null) continue;
      G.edge(a, b, e.label ?? e.weight ?? e.w ?? e.value);
      if (e.directed) G.directed = true;
    }
    if (J.directed === true || J.type === 'directed') G.directed = true;
    return G;
  }
  // { a: [b, c] } or { a: { b: 3 } }
  const keys = Object.keys(J);
  if (!keys.length || !keys.every((k) => Array.isArray(J[k]) || (J[k] && typeof J[k] === 'object'))) return null;
  const G = absGraph('json', true);
  for (const k of keys) G.node(k);
  for (const k of keys) {
    if (Array.isArray(J[k])) for (const b of J[k]) { if (Array.isArray(b)) G.edge(k, b[0], b[1]); else G.edge(k, idOf(b)); }
    else for (const [b, w] of Object.entries(J[k])) G.edge(k, b, typeof w === 'number' && w !== 1 ? w : typeof w === 'string' ? w : undefined);
  }
  return settle(G);
}
function fromDot(text: string): Abs | null {
  const t = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/^\s*#.*$/gm, '');
  const m = /^\s*(strict\s+)?(di)?graph\b[^{]*\{/i.exec(t);
  if (!m) return null;
  const end = t.lastIndexOf('}');
  const body = t.slice(m.index + m[0].length, end < 0 ? t.length : end);
  const G = absGraph('dot', !!m[2]);
  const ID = String.raw`"(?:\\.|[^"\\])*"|[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*|-?(?:\.\d+|\d+(?:\.\d*)?)`;
  const attrs = (s: string) => { const r: Record<string, string> = {}; for (const a of s.matchAll(/([\w]+)\s*=\s*("(?:\\.|[^"\\])*"|[^,;\]\s]+)/g)) r[a[1].toLowerCase()] = unq(a[2]); return r; };
  for (let st of body.replace(/\bsubgraph\b[^{]*\{|[{}]/g, ';').split(/[;\n]/)) {
    st = st.trim();
    if (!st || /^(graph|node|edge)\s*\[/i.test(st) || /^\w+\s*=/.test(st)) continue;
    const am = /\[([\s\S]*)\]\s*$/.exec(st), A = am ? attrs(am[1]) : {};
    if (am) st = st.slice(0, am.index).trim();
    const parts = st.split(/\s*(?:->|--)\s*/).map((p) => p.trim()).filter(Boolean);
    const ids = parts.map((p) => { const q = new RegExp(`^(${ID})(?::\\w+)*$`).exec(p); return q ? unq(q[1]) : null; });
    if (ids.some((x) => x == null)) continue;
    if (ids.length === 1) { G.node(ids[0], A.label); continue; }
    for (let k = 1; k < ids.length; k++) G.edge(ids[k - 1], ids[k], A.label ?? A.weight);
  }
  return G.nodes.length ? G : null;
}
function fromMermaid(text: string): Abs | null {
  const lines = text.split(/\r?\n/);
  const h = /^\s*(graph|flowchart)\b\s*(TD|TB|BT|RL|LR)?\s*;?\s*$/i.exec(lines[0] || '');
  if (!h) return null;
  const G = absGraph('mermaid', false);
  let anyArrow = false;
  const NODE = /^([A-Za-z0-9_]+)\s*(?:(\(\(|\[\(|\(\[|\[\[|\{\{|\[|\(|\{|>)\s*"?([\s\S]*?)"?\s*(\)\)|\)\]|\]\)|\]\]|\}\}|\]|\)|\}))?$/;
  const nodeTok = (s: string) => { const m = NODE.exec(s.trim()); if (!m) return null; return G.node(m[1], m[3] || undefined); };
  const EDGE = /\s*(<?(?:-->|---|-\.->|-\.-|==>|===|--o|--x)|--\s+[^-|]+?\s+(?:-->|---)|==\s+[^=|]+?\s+==>)\s*(?:\|([^|]*)\|)?\s*/;
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/%%.*$/, '').trim().replace(/;$/, '');
    if (!line || /^(subgraph|end|style|classDef|class|click|linkStyle|direction)\b/.test(line)) continue;
    const parts = line.split(new RegExp(EDGE.source));
    // parts: node, op, label, node, op, label, node …
    let prev: string[] | null = null;
    for (let k = 0; k < parts.length; k += 3) {
      const cur = String(parts[k] || '').split('&').map((x) => nodeTok(x)).filter(Boolean) as string[];
      if (!cur.length) { prev = null; continue; }
      if (prev && k >= 3) {
        const op = parts[k - 2] || '', inl = /^(?:--|==)\s+([\s\S]+?)\s+(?:-->|---|==>)$/.exec(op.trim());
        const label = parts[k - 1] ?? (inl ? inl[1] : undefined);
        if (/>/.test(op)) anyArrow = true;
        for (const a of prev) for (const b of cur) G.edge(a, b, label);
      }
      prev = cur;
    }
  }
  G.directed = anyArrow;
  return G.nodes.length ? G : null;
}
// "a: b c", "a -> b, c", "a: b(3) c(5)"
function fromAdjList(lines: string[]): Abs | null {
  const rows = lines.map((l) => /^\s*([^:]+?)\s*(?::|->|→)\s*(.*)$/.exec(l));
  if (rows.some((r) => !r) || rows.length < 1) return null;
  const G = absGraph('adjlist', true);
  for (const r of rows) G.node(unq(r![1]));
  for (const r of rows) {
    const a = unq(r![1]);
    for (const tok of r![2].split(/[\s,;]+/).filter(Boolean)) {
      const m = /^(.+?)(?:\((.+)\)|[=:](.+))?$/.exec(tok.replace(/^[[{]|[\]}]$/g, ''));
      if (!m || !m[1]) continue;
      G.edge(a, unq(m[1]), m[2] ?? m[3]);
    }
  }
  return settle(G);
}
// one edge per line, or several separated by commas or semicolons: "a b", "a b 3", "a-b", "a -> b", "(a, b)", "a,b,3"
const EOP = /^(.+?)\s*(<->|<-|-->|->|=>|→|←|--|—|–|-)\s*(.+)$/;
function fromEdgeList(lines: string[]): Abs | null {
  const items: string[] = [];
  for (const l of lines) for (const seg of l.split(';')) {
    const s = seg.trim();
    if (!s) continue;
    const tuples = s.match(/\([^()]*\)/g);
    if (tuples && !s.replace(/\([^()]*\)/g, '').replace(/[\s,]/g, '')) { items.push(...tuples.map((x) => x.slice(1, -1))); continue; }
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    items.push(...(parts.length > 1 && parts.every((p) => EOP.test(p) && !NUM.test(p)) ? parts : [s]));
  }
  let header: number[] | null = null;
  const h = items[0] && /^(\d+)\s+(\d+)$/.exec(items[0].trim());
  if (h && items.length - 1 === +h[2] && items.length > 1) { header = [+h[1], +h[2]]; items.shift(); }
  const out: { a: string; b: string; w?: string; d: boolean }[] = [], lone: string[] = [];
  let directed = false;
  for (const it of items) {
    // "1 -2 3" is three numbers, not an edge 1–(-2)
    const m = /^\S+(\s+\S+)*$/.test(it.trim()) && it.trim().split(/\s+/).every((x) => NUM.test(x)) ? null : EOP.exec(it.trim());
    if (m) {
      const op = m![2];
      let b = m![3].trim(), w: string | undefined;
      const s = /^(.+?)(?:\s*[:,]\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i.exec(b);
      if (s) { b = s[1]; w = s[2]; }
      const a = unq(m![1]); b = unq(b);
      if (/^(->|-->|=>|→)$/.test(op)) { directed = true; out.push({ a, b, w, d: true }); }
      else if (/^(<-|←)$/.test(op)) { directed = true; out.push({ a: b, b: a, w, d: true }); }
      else if (op === '<->') { directed = true; out.push({ a, b, w, d: true }, { a: b, b: a, w, d: true }); }
      else out.push({ a, b, w, d: false });
      continue;
    }
    const tok = it.split(/[\s,\t]+/).filter(Boolean).map(unq);
    if (tok.length === 1) lone.push(tok[0]);
    else if (tok.length === 2) out.push({ a: tok[0], b: tok[1], d: false });
    else if (tok.length === 3 && NUM.test(tok[2])) out.push({ a: tok[0], b: tok[1], w: tok[2], d: false });
    else return null;
  }
  if (!out.length) return null;
  const G = absGraph('edges', directed);
  if (header) { const z = out.some((e) => e.a === '0' || e.b === '0') ? 0 : 1; for (let i = 0; i < header[0]; i++) G.node(String(i + z)); }
  for (const x of lone) G.node(x);
  for (const e of out) {
    G.edge(e.a, e.b, e.w);
    // in a list with arrows, a plain pair goes both ways
    if (directed && !e.d && e.a !== e.b) G.edge(e.b, e.a, e.w);
  }
  return directed ? settle(G) : G;
}
function tokRows(text: string) {
  const t = text.trim().replace(/^\[\s*|\s*\]$/g, '');
  const lines = (/\n/.test(t) ? t.split(/\r?\n/) : t.split(/;/)).map((l) => l.trim().replace(/^[[{(|]+\s*|\s*[\]})|]+,?$/g, '').trim()).filter(Boolean);
  return lines.map((l) => l.split(/[\s,;&|]+/).map((x) => x.trim()).filter(Boolean));
}
// the formats are tried from the most particular down
function read(text: string): Abs | null {
  const t = String(text || '').replace(/\r/g, '').trim();
  if (!t) return null;
  if (/^[[{]/.test(t)) { const j = fromJson(t); if (j) return j; }
  if (/^\s*(strict\s+)?(di)?graph\b[^{\n]*\{/i.test(t)) return fromDot(t);
  if (/^\s*(graph|flowchart)\b/i.test(t)) return fromMermaid(t);
  // drop LaTeX matrix dressing: \begin{pmatrix} … \end{pmatrix}, & and \\
  const tm = t.replace(/\\(begin|end)\{[a-z]*matrix\*?\}/g, '').replace(/\\\\/g, '\n').replace(/&/g, ' ').trim();
  const rows = tokRows(tm);
  if (rows.length >= 2) { const m = fromMatrix(rows); if (m) return m; }
  const lines = t.split(/\n/).map((l) => l.replace(/(#|\/\/|%).*$/, '').trim()).filter(Boolean);
  if (lines.length && lines.every((l) => /^[^:]+?\s*:\s*\S/.test(l) || /^[^:]+?:\s*$/.test(l))) { const a = fromAdjList(lines); if (a) return a; }
  if (lines.length && lines.every((l) => /^\s*\S+\s*(->|→)\s*\S+\s*(,\s*\S+\s*)+$/.test(l))) { const a = fromAdjList(lines); if (a) return a; }
  return fromEdgeList(lines);
}

// a name TikZ accepts, and the text a node shows
const TEX_SPECIAL: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '%': '\\%', _: '\\_', '^': '\\^{}', '~': '\\~{}' };
const texText = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => TEX_SPECIAL[c]);
function labelTex(s: string) {
  if (/^\$.*\$$/.test(s)) return s;
  if (/^[A-Za-z]$/.test(s)) return `$${s}$`;
  const m = /^([A-Za-z])_?(\d+)$/.exec(s);
  if (m) return `$${m[1]}_{${m[2]}}$`;
  if (NUM.test(s)) return s;
  return texText(s);
}
// abstract graph → model (nodes placed by autoLayout)
function absToModel(G: Abs, nameTaken: (s: string) => boolean = () => false) {
  const names = new Map<string, string>(), used = new Set<string>();
  let k = 0;
  const fresh = (base: string) => { let s = base; while (used.has(s) || nameTaken(s)) s = `${base}${++k}`; used.add(s); return s; };
  for (const n of G.nodes) names.set(n.id, fresh(/^[A-Za-z0-9_]+$/.test(n.id) ? n.id : `v${G.nodes.indexOf(n) + 1}`));
  const shortish = G.nodes.every((n) => String(n.label ?? n.id).length <= 3);
  const M: any = { env: '>=Stealth', gopts: ['no placement', shortish ? 'nodes={draw, circle, minimum size=7mm}' : 'nodes={draw, rounded corners}'], nodes: [], edges: [], pre: [], post: [], warnings: [] };
  for (const n of G.nodes) {
    const name = names.get(n.id) as string, t = labelTex(n.label ?? n.id);
    M.nodes.push({ name, text: t === name ? null : t, o: [], x: 0, y: 0, lab: null });
  }
  for (const e of G.edges) {
    const a = names.get(e.a) as string, b = names.get(e.b) as string, loop = a === b;
    M.edges.push({ a, b, op: G.directed ? '->' : '--', o: loop ? ['loop above'] : [], t: e.w == null ? null : NUM.test(String(e.w)) ? `$${e.w}$` : labelTex(String(e.w)), sw: false, lo: [] });
  }
  const n = M.nodes.length, m = M.edges.filter((e: any) => e.a !== e.b).length;
  const tree = n > 2 && m === n - 1;
  autoLayout(M, tree ? 'layers' : n <= 8 && m >= n ? 'circle' : 'spring', n > 12 ? 1.5 : 1.75);
  return M;
}
// text in any of the formats → { src, kind, nodes, edges, directed } or null
function fromText(text: string) {
  const t = String(text || '').trim();
  if (/\\graph\b/.test(t)) {
    const src = fullCode(t), M = parse(src);
    return M.found && M.nodes.length ? { src, kind: 'tikz', nodes: M.nodes.length, edges: M.edges.length, directed: M.edges.some((e: any) => e.op !== '--'), M } : null;
  }
  const G = read(t);
  if (!G || !G.nodes.length) return null;
  const M = absToModel(G);
  return { src: write(M), kind: G.kind, nodes: M.nodes.length, edges: M.edges.length, directed: G.directed, M };
}

// a small drawing of a snippet (palette previews)
TD.graphMini = (src: any, maxH = 30) => {
  const s = { type: 'graph', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
  return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
};

TD.TYPES.graph = {
  name: 'Graph',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'graph', x: p.x, y: p.y, src: TD.GRAPH_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  tikz(s: any, X: any) {
    for (const l of libsOf(s.src)) X.libs.add(l);
    const b = layout(s).bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`];
    const c = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    if (c) o.push(`color=${c}`);
    const t = fullCode(s.src), m = /\\begin\{tikzpicture\}\s*(\[)?/.exec(t);
    let env = '', i = m!.index + m![0].length;
    if (m![1]) { const e = close(t, i - 1); env = t.slice(i, e).trim(); i = e + 1; }
    const end = t.lastIndexOf('\\end{tikzpicture}');
    const body = t.slice(i, end < 0 ? t.length : end).replace(/^\s*\n/, '').replace(/\s+$/, '');
    if (env) o.push(env);
    return `\\begin{scope}[${o.join(', ')}]\n${body}\n\\end{scope}`;
  },
};

// for the visual editor (src/editors/grapheditor.ts)
TD.graph = { fan, lines, isMultiline, parse, write, layout, draw, fullCode, libsOf, autoLayout, fromText, read, absToModel, graphOpts, nodeOpts, nodeBase, reach, along, kv, opts, unbrace, shown, num, split, isBendOpt, labelTex, DIRS, LOOPS };
TD.blocks.register('graph', {
  menu: { order: 5.5, group: 'general', label: 'Graph', title: 'Graph of nodes and edges, written with the TikZ graphs library', icon: '<svg viewBox="0 0 32 24"><circle cx="6" cy="17" r="3.5"/><circle cx="16" cy="6" r="3.5" class="a1"/><circle cx="26" cy="17" r="3.5"/><path d="M8.4 14.4l5.2-5.8M18.4 8.6l5.2 5.8M9.5 17h13"/></svg>' },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.graphEditor, alias: 'graphOpen', layout: (s: any) => TD.graph.layout(s) },
});
export { layout, libsOf, fullCode, parse, write, fromText };
