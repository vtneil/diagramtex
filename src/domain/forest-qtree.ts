import { runtime as TD } from '../runtime';
import { closeBrace as close, unbraceOnce } from './tex-groups';
// tikz-qtree's \Tree [.S [.NP …] …] read as a forest tree, for the Tree block (src/domain/forest.ts).
//
// tikz-qtree (pgftree.tex) puts each child `level distance` (30pt) from its parent, node anchor to node anchor (base,
// from `every tree node`), packs sibling subtrees by their bounding boxes `sibling distance` (2pt) apart, centres a
// parent over its first and last children, and draws each edge from the parent's south to the child's north (east to
// west growing right …). Forest does the same with l, l sep=0pt, s sep, fit=rectangle and the two edge anchors,
// so the tree is written for forest with those options and keeps its look in the app and in LaTeX.
const { opt, optList, code } = TD.ft;

const DIRS: Record<string, string> = { down: 'south', up: 'north', right: 'east', left: 'west' };
// the anchors tikz-qtree's edges run between, by the way the tree grows
const EDGE_ANCHORS: Record<string, [string, string]> = { down: ['south', 'north'], up: ['north', 'south'], right: ['east', 'west'], left: ['west', 'east'] };
const NODE_KEYS = /^(font|align|inner sep|inner xsep|inner ysep|outer sep|minimum size|minimum width|minimum height|text width|text|text centered|execute at begin node|execute at end node|anchor|shape|draw|fill|rounded corners|circle|rectangle|ellipse)$/;
const LINE_W: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const LINE_KEYS = /^(ultra thin|very thin|thin|semithick|thick|very thick|ultra thick|line width|dashed|densely dashed|loosely dashed|dotted|densely dotted|loosely dotted|solid|color)$/;
// keys of the picture (or \tikzset) the tree reads: everything else a picture says is the importer's business
const TREE_KEY = /^(level distance|sibling distance|grow'?|edge from parent path|every (tree|leaf|internal|level \d+) node\/\.(style|append style)|edge from parent\/\.(style|append style)|level \d+\+?\/\.(style|append style)|frontier\/\.(style|append style)|every node\/\.(style|append style))$/;

type QNode = { c: string; o: string[]; k: QNode[]; leaf: boolean; coord: boolean; edge: string[]; labels: string[]; roof: boolean; name: string; depth: number };

// ---------------------------------------------------------------- reading
// the end of the tree whose [ is at s[q]: past its closing ] (and a repeated label after it, ].S); -1 when unclosed
function end(s: string, q: number) {
  let d = 0, br = 0, k = q;
  for (; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') br++;
    else if (c === '}') br--;
    else if (!br && c === '[') d++;
    else if (!br && c === ']' && --d === 0) { k++; break; }
  }
  if (d) return -1;
  if (s[k] === '.') { k++; let b = 0; for (; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if (c === '{') b++; else if (c === '}') b--; else if (!b && /\s/.test(c)) break; } }
  return k;
}

// tikz-qtree-compat's \Tree: _ and ^ outside $…$ are maths (\automath), \0 \1 \2 are primes
const PRIMES = ['^0', "'", "''"];
function compatText(t: string) {
  let out = '', math = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') {
      const p = /^\\([012])(?![0-9])/.exec(t.slice(i));
      if (p) { const m = PRIMES[+p[1]]; out += math ? m : '$' + m + '$'; i += 1; continue; }
      out += c + (t[i + 1] || ''); i++; continue;
    }
    if (c === '$') math = !math;
    if (!math && (c === '_' || c === '^')) {
      // one argument each: a group, a command or a character; a second script right after joins the first
      const arg = (j: number) => { if (t[j] === '{') { const e = close(t, j); return e < 0 ? t.slice(j) : t.slice(j, e + 1); } const m = /^\\[A-Za-z]+|^\\.|^./.exec(t.slice(j)); return m ? m[0] : ''; };
      const a = arg(i + 1);
      let s = c + '{' + unbraceOnce(a) + '}', j = i + 1 + a.length;
      if ((t[j] === '_' || t[j] === '^') && t[j] !== c) { const b = arg(j + 1); s += t[j] + '{' + unbraceOnce(b) + '}'; j += 1 + b.length; }
      out += '$' + s + '$'; i = j - 1; continue;
    }
    out += c;
  }
  return out;
}

// the bracket code (from its [) → the root, with what could not be read
function parse(s: string, warn: (w: string) => void): QNode | null {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const at = (w: string) => s.startsWith(w, i) && !/[A-Za-z@]/.test(s[i + w.length] || '');
  // up to the first `stop` outside braces (and, for a label, outside $…$: tikz-qtree reads a label up to a space,
  // and a ] right after it is read as the tree's here, as it must be in code that compiles)
  const scan = (stop: (c: string, math: boolean) => boolean) => {
    const a = i; let d = 0, math = false;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') d++;
      else if (c === '}') d--;
      else if (!d && c === '$') math = !math;
      else if (!d && stop(c, math)) break;
    }
    return s.slice(a, i);
  };
  const node = (depth: number, leaf: boolean): QNode => ({ c: '', o: [], k: [], leaf, coord: false, edge: [], labels: [], roof: false, name: '', depth });
  // \node[options](name){text}; written as the label
  const litNode = (n: QNode) => {
    i += 5;
    const body = scan((c) => c === ';');
    if (s[i] === ';') i++;
    let j = 0;
    const b = body, wsb = () => { while (j < b.length && /\s/.test(b[j])) j++; };
    for (;;) {
      wsb();
      if (b[j] === '[') { const e = bracket(b, j); n.o.push(...optList(b.slice(j + 1, e))); j = e + 1; }
      else if (b[j] === '(') { const e = b.indexOf(')', j); if (e < 0) break; n.name = b.slice(j + 1, e).trim(); j = e + 1; }
      else if (b[j] === '{') { const e = close(b, j); if (e < 0) break; n.c = b.slice(j + 1, e).trim(); j = e + 1; }
      else break;
    }
    if (b.slice(j).trim()) warn(`Not read in a \\node label: “${b.slice(j).trim().slice(0, 24)}”`);
  };
  const label = (n: QNode) => {
    ws();
    if (at('\\node')) litNode(n);
    else n.c = unbraceOnce(scan((c, math) => /\s/.test(c) || (c === ']' && !math)));
  };
  // \edge[options] node[…]{…} …; before a child
  const edgeOf = (n: QNode, e: string) => {
    let j = 0;
    while (j < e.length && /\s/.test(e[j])) j++;
    if (e[j] === '[') { const k = bracket(e, j); for (const x of optList(e.slice(j + 1, k))) { if (opt(x).k === 'roof' && opt(x).v == null) n.roof = true; else n.edge.push(x); } j = k + 1; }
    const rest = e.slice(j).trim();
    if (rest) n.labels.push(rest);
  };
  const tree = (depth: number): QNode => {
    i++; ws();
    const n = node(depth, false);
    if (s[i] === '.') { i++; label(n); } else n.coord = true;
    let edge: string | null = null;
    for (;;) {
      ws();
      if (i >= s.length) { warn('A ] is missing at the end of the tree'); return n; }
      if (s[i] === ']') { i++; break; }
      if (at('\\edge')) {
        i += 5;
        const e = scan((c) => c === ';');
        if (s[i] === ';') i++;
        if (edge != null) warn('Two \\edge before one child: the second is used');
        edge = e; continue;
      }
      let kid: QNode;
      if (at('\\qroof')) {
        // tikz-qtree-compat: \qroof{text}.Label is Label over a roof over the text
        i += 6; ws();
        const g = s[i] === '{' ? close(s, i) : -1;
        const text = g > 0 ? s.slice(i + 1, g) : '';
        i = g > 0 ? g + 1 : i;
        kid = node(depth + 1, false);
        if (s[i] === '.') { i++; label(kid); }
        const leaf = node(depth + 2, true);
        leaf.c = text.trim(); leaf.roof = true;
        kid.k.push(leaf);
      } else if (s[i] === '[') {
        if (depth >= 200) { warn('The tree is nested too deep: the deepest levels are left out'); const e = end(s, i); i = e < 0 ? s.length : e; edge = null; continue; }
        kid = tree(depth + 1);
      } else { kid = node(depth + 1, true); const a = i; label(kid); if (i === a) i++; }
      if (edge != null) edgeOf(kid, edge);
      edge = null;
      n.k.push(kid);
    }
    // ].S: the label repeated after the ], as tikz-qtree allows (the first one is kept)
    if (s[i] === '.') { i++; const t = node(depth, false); label(t); if (n.coord && (t.c || t.o.length)) { Object.assign(n, { c: t.c, o: t.o, name: t.name, coord: false }); } }
    return n;
  };
  ws();
  if (s[i] !== '[') return null;
  const root = tree(0);
  if (s.slice(i).trim()) warn('Only the first tree is drawn: there is code after it');
  return root;
}
// index of the ] closing the [ at s[i] (outside braces), or the end
function bracket(s: string, i: number) {
  let d = 0, k = i;
  for (; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (!d && c === ']') return k;
  }
  return k;
}

// ---------------------------------------------------------------- settings
// what the picture and its \tikzset lines set for trees, in the order they come
function settings(list: string[], warn: (w: string) => void) {
  const S = {
    ld: '', sd: '', dir: 'down', prime: false,
    tree: ['anchor=base'] as string[], leaf: [] as string[], internal: [] as string[], levelNode: new Map<number, string[]>(),
    efp: ['draw'] as string[], path: '', levels: [] as { n: number; plus: boolean; ld: string; sd: string }[], frontier: '',
    every: [] as string[], nodeKeys: [] as string[], lineKeys: [] as string[], edgeKeys: [] as string[],
    styles: new Map<string, string>(), used: new Set<string>(),
  };
  const set = (cur: string[], v: string, append: boolean) => (append ? [...cur, ...optList(v)] : optList(v));
  const lengths = (v: string) => {
    let ld = '', sd = '', fr = '';
    for (const x of optList(v)) { const o = opt(x); if (o.k === 'level distance') ld = o.v; else if (o.k === 'sibling distance') sd = o.v; else if (o.k === 'distance from root') fr = o.v; }
    return { ld, sd, fr };
  };
  for (const str of list) for (const item of optList(str)) {
    const o = opt(item), k = o.k, v = o.v;
    const sm = /^(.+?)\/\.(style|append style)$/.exec(k), append = !!sm && sm[2] === 'append style', nm = sm ? sm[1].trim() : '';
    if (TREE_KEY.test(k + (o.prime ? "'" : ''))) S.used.add(k + (o.prime ? "'" : ''));
    if (k === 'level distance' && v) S.ld = v;
    else if (k === 'sibling distance' && v) S.sd = v;
    else if (k === 'grow' && v) { const d = v.trim(); if (DIRS[d]) { S.dir = d; S.prime = o.prime; } else warn(`Not drawn: grow=${d}`); }
    else if (k === 'edge from parent path' && v != null) S.path = v;
    else if (sm && v != null) {
      if (nm === 'every tree node') S.tree = set(S.tree, v, append);
      else if (nm === 'every leaf node') S.leaf = set(S.leaf, v, append);
      else if (nm === 'every internal node') S.internal = set(S.internal, v, append);
      else if (/^every level \d+ node$/.test(nm)) { const n = +nm.split(' ')[2]; S.levelNode.set(n, set(S.levelNode.get(n) || [], v, append)); }
      else if (nm === 'every node') S.every = set(S.every, v, append);
      else if (nm === 'edge from parent') {
        const l = set(append ? S.efp : [], v, true).filter((x: string) => { const p = opt(x); if (p.k === 'edge from parent path' && p.v != null) { S.path = p.v; return false; } return true; });
        S.efp = l;
      } else if (/^level \d+\+?$/.test(nm)) { const L = lengths(v); S.levels.push({ n: parseInt(nm.slice(6), 10), plus: nm.endsWith('+'), ld: L.ld, sd: L.sd }); }
      else if (nm === 'frontier') { const L = lengths(v); if (L.fr) S.frontier = L.fr; }
      else if (!/#\d/.test(v)) S.styles.set(nm, append && S.styles.has(nm) ? `${S.styles.get(nm)}, ${v}` : v);
    } else if (NODE_KEYS.test(k) && !(k === 'draw' && v == null) && !(k === 'text' && v == null)) { S.nodeKeys.push(item); S.used.add(k); }
    else if ((LINE_KEYS.test(k) && (v != null || k !== 'color')) || (v == null && TD.tikzColor?.(k))) { S.lineKeys.push(item); S.used.add(k); }
    else if (k === '>' || (v == null && /^<?-+>?$|^-|-$/.test(k) && k.includes('-'))) { S.edgeKeys.push(item); S.used.add(k); }
  }
  return S;
}

// a length in pt (a number alone is pt), or NaN
function pt(v: string) {
  const b = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))?\s*\\baselineskip\s*$/.exec(String(v));
  if (b) return (b[1] == null ? 1 : +b[1]) * 12;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(pt|em|ex|cm|mm|in|bp)?\s*$/.exec(String(v));
  if (!m) return NaN;
  return +m[1] * ({ pt: 1, em: 10, ex: 4.3, cm: 28.4528, mm: 2.84528, in: 72.27, bp: 1.00375 } as Record<string, number>)[m[2] || 'pt'];
}
const fmt = (n: number) => `${Math.round(n * 100) / 100}pt`;

// ---------------------------------------------------------------- writing
// The tree (its bracket code from [) as forest code, with the settings in force: { src, names, issues, used } or
// null when there is no tree. `names`: node names and where each is in the forest model (its node, in reading order).
function toForest(tree: string, list: string[], how: { compat?: boolean } = {}) {
  const issues: string[] = [];
  const warn = (w: string) => { if (!issues.includes(w)) issues.push(w); };
  const root = parse(tree, warn);
  if (!root) return null;
  if (how.compat) { const fix = (n: QNode) => { n.c = compatText(n.c); n.k.forEach(fix); }; fix(root); }
  const S = settings(list, warn);
  // a user's style (without arguments) in node and edge options is written out, so what it does is drawn here too;
  // one that runs code round its node (append after command, \tikzlastnode …) works only by its name, as written
  const CODE_STYLE = /after command|\\tikzlastnode|\\pgf|execute at|\/\.code/;
  const expand = (opts: string[], depth = 0): string[] => opts.flatMap((x) => {
    const o = opt(x), body = S.styles.get(o.k);
    // (TikZ's align: lines of the node's text, a key forest passes to the node, not forest's align, a tabular)
    return o.v == null && body != null && !CODE_STYLE.test(body) && depth < 8 ? expand(optList(body), depth + 1) : [o.k === 'align' ? `node options+={${x.trim()}}` : x];
  });
  const pre: string[] = [], forTree: string[] = [];
  // nodes: every node, then the picture's node keys, then every tree node (whose default is anchor=base, forest's);
  // TikZ's anchor without one is center
  const nodeOpts = expand([...S.every, ...S.nodeKeys, ...S.lineKeys, ...S.tree]);
  const anchor = [...nodeOpts].reverse().map((x) => opt(x)).find((o) => o.k === 'anchor');
  forTree.push(...nodeOpts.filter((x) => opt(x).k !== 'anchor'));
  if (!anchor) forTree.push('anchor=center');
  else if (anchor.v && anchor.v.trim() !== 'base') forTree.push(`anchor=${anchor.v.trim()}`);
  // growth, and the distances tikz-qtree keeps (30pt, 2pt by default)
  if (S.dir !== 'down' || S.prime) forTree.push(`grow${S.prime ? "'" : ''}=${DIRS[S.dir]}`);
  const ld = S.ld || '30pt', sd = S.sd || '2pt';
  // tikz-qtree's sibling distance is between the nodes' bounding boxes (the border, and half the line width when it is
  // drawn); forest's s sep between their outer seps (half the line width each, unless set): s sep is the distance less
  // both outer seps, plus the line width of drawn nodes
  let os = NaN, lw = 0.4, drawn = false;
  for (const x of nodeOpts) {
    const o = opt(x);
    if (o.k in LINE_W && o.v == null) lw = LINE_W[o.k]; else if (o.k === 'line width' && Number.isFinite(pt(o.v))) lw = pt(o.v);
    else if (o.k === 'outer sep' && Number.isFinite(pt(o.v))) os = pt(o.v);
    else if (o.k === 'draw') drawn = o.v == null || o.v.trim() !== 'none';
  }
  const gap = (v: string) => { const n = pt(v), o = Number.isFinite(os) ? os : lw / 2; return Number.isFinite(n) ? fmt(n - 2 * o + (drawn ? lw : 0)) : v; };
  forTree.push(`l=${ld}`, 'l sep=0pt', `s sep=${gap(sd)}`, 'fit=rectangle');
  // edges: their style and the path they take
  const efp = expand(S.efp), edgeExtra = expand([...S.lineKeys, ...S.edgeKeys]);
  const edgeList = [...efp, ...edgeExtra];
  if (edgeList.length !== 1 || opt(edgeList[0]).k !== 'draw' || opt(edgeList[0]).v != null) forTree.push(`edge={${edgeList.join(', ')}}`);
  let fork = '';
  const [pa, ca] = EDGE_ANCHORS[S.dir];
  if (!S.path) forTree.push(`parent anchor=${pa}`, `child anchor=${ca}`);
  else {
    const P = S.path.replace(/\s+/g, ' ').trim();
    const straight = /^\(\\tikzparentnode(?:\.([a-z ]+?))?\) ?-- ?\(\\tikzchildnode(?:\.([a-z ]+?))?\)$/.exec(P);
    const forked = /^\(\\tikzparentnode(?:\.([a-z]+))?\) ?(?:-- ?\+\+?\( ?([^,()]+?) ?, ?([^,()]+?) ?\) ?)?(-\||\|-) ?\(\\tikzchildnode(?:\.([a-z]+))?\)$/.exec(P);
    if (straight) {
      if (straight[1]) forTree.push(`parent anchor=${straight[1]}`);
      if (straight[2]) forTree.push(`child anchor=${straight[2]}`);
    } else if (forked && (forked[4] === '-|') === (S.dir === 'down' || S.dir === 'up')) {
      // along the growth to the fork, across, then to the child: forest's forked edges, fork sep that far
      const a = forked[2] ? pt(forked[2]) : 0, b = forked[3] ? pt(forked[3]) : 0, d = Math.abs(S.dir === 'down' || S.dir === 'up' ? b : a);
      if (Number.isFinite(d)) fork = fmt(d); else warn(`Not drawn: edge from parent path=${P}`);
    } else warn(`Not drawn: edge from parent path=${P}`);
  }
  if (fork) { pre.push('forked edges'); forTree.push(`fork sep=${fork}`); }
  // level styles: level N sets the distance and the gap before each child at level N; level N+ every level from N
  const nodes: QNode[] = [];
  const all = (n: QNode) => { nodes.push(n); n.k.forEach(all); };
  all(root);
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const levelOpts = new Map<number, string[]>();
  const add = (n: number, x: string) => levelOpts.set(n, [...(levelOpts.get(n) || []), x]);
  const at = (d: number, key: 'ld' | 'sd') => {
    let v = '';
    const plus = S.levels.filter((L) => L.plus && L.n <= d && L[key]).sort((a, b) => a.n - b.n);
    if (plus.length) v = plus[plus.length - 1][key];
    for (const L of S.levels) if (!L.plus && L.n === d && L[key]) v = L[key];
    return v;
  };
  for (let d = 1; d <= maxDepth; d++) {
    const l = at(d, 'ld'), s = at(d, 'sd');
    if (l && l !== ld) add(d, `l=${l}`);
    if (s && s !== sd) add(d - 1, `s sep=${gap(s)}`);
  }
  // nodes at a level: every level N node
  for (const [n, o] of S.levelNode) if (o.length) for (const x of expand(o)) add(n, x);
  // leaves and inner nodes: tikz-qtree's are by how they are written ([.X ] is an inner node with no children)
  const leafO = expand(S.leaf), innerO = expand(S.internal);
  const byCount = nodes.every((n) => n.leaf === !n.k.length);
  if ((leafO.length || innerO.length) && byCount) pre.push(`where n children=0{${leafO.join(', ')}}{${innerO.join(', ')}}`);
  // the frontier: each leaf that far from the root
  const lAt = (d: number) => pt(at(d, 'ld') || ld);
  let frontier: ((n: QNode) => string) | null = null;
  if (S.frontier) {
    const F = pt(S.frontier);
    if (Number.isFinite(F) && [...Array(maxDepth).keys()].every((d) => Number.isFinite(lAt(d + 1)))) {
      const depthOf = (d: number) => { let t = 0; for (let k = 1; k <= d; k++) t += lAt(k); return t; };
      frontier = (n) => fmt(F - depthOf(n.depth - 1));
    } else warn(`Not drawn: frontier distance from root=${S.frontier}`);
  }
  // (the level in braces: forest reads one token, so level=10 would be level 1)
  for (const [n, o] of [...levelOpts].sort((a, b) => a[0] - b[0])) pre.push(`where level={${n}}{${o.join(', ')}}{}`);
  // the model forest's writer takes: { c, o, k }
  const names: { name: string; i: number }[] = [];
  let count = 0;
  const model = (n: QNode): any => {
    const o: string[] = [];
    if (n.coord) o.push('inner sep=0pt');
    if (!byCount) o.push(...(n.leaf ? leafO : innerO));
    o.push(...expand(n.o));
    if (n.name) { o.push(/^[\w-]+$/.test(n.name) ? `name=${n.name}` : `name={${n.name}}`); names.push({ name: n.name, i: count }); }
    if (n.leaf && frontier) o.push(`l=${frontier(n)}`);
    if (n.roof) o.push('roof');
    const e = expand(n.edge);
    if (e.length) o.push(`edge+={${e.join(', ')}}`);
    if (n.labels.length) o.push(`edge label={${n.labels.join(' ')}}`);
    count++;
    return { c: n.c, o, k: n.k.map(model) };
  };
  const m = model(root);
  const src = code({ pre: [`for tree={${forTree.join(', ')}}`, ...pre], root: m });
  return { src, names, issues, used: S.used };
}

TD.ft.qtree = { end, parse, toForest };
export { toForest };
