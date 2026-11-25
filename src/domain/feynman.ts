import { runtime as TD } from '../runtime';
import { unbrace } from './tex-groups';
import { layoutCache } from './layout-cache';
import { num3 } from '../core/format';
import { groupEnd as close, skipSpace as skip } from '../core/tex-scan';
// Feynman diagrams written with the tikz-feynman package. The source is the object: \vertex lines that
// place the vertices and a \diagram* that joins them with propagators, or one \feynmandiagram. It is drawn here as
// vectors at the package's own sizes (wave, coil, arrow and momentum measured from its output), and exported
// unchanged in a scope shifted to where the drawing sits. The layout is pdfLaTeX's (and XeLaTeX's): there the
// package's automatic layouts (\feynmandiagram, \diagram without the star) are ignored and \graph places the nodes it
// makes itself, each chain a row 1cm below the last, each new node 1cm right of the one before.
// The visual editor (js/fyeditor.ts) reads the code into a model and writes it back.
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, MM = PX / 10, PT = 1 / K;

TD.FEYN_DEFAULT = [
  '\\begin{feynman}',
  '  \\vertex (i1) at (0,1) {\\(e^-\\)};',
  '  \\vertex (i2) at (0,-1) {\\(e^+\\)};',
  '  \\vertex (a) at (1.25,0);',
  '  \\vertex (b) at (3.25,0);',
  '  \\vertex (f1) at (4.5,1) {\\(\\mu^-\\)};',
  '  \\vertex (f2) at (4.5,-1) {\\(\\mu^+\\)};',
  '  \\diagram* {',
  '    (i1) -- [fermion] (a) -- [fermion] (i2),',
  '    (a) -- [photon, edge label=\\(\\gamma\\), momentum\'=\\(q\\)] (b),',
  '    (f2) -- [fermion] (b) -- [fermion] (f1),',
  '  };',
  '\\end{feynman}',
].join('\n');

// the package's sizes
const LW = 0.4 * PT;
const WAVE = { amp: 1.25 * PT, per: 2 * MM };                  // photon, boson: complete sines
const COIL = { amp: 2.5 * PT, per: 1.5 * MM, rx: 1.877 * PT }; // gluon: coil, aspect .75, mirror
// the arrow at arrow size 1.5pt (medium): its tip ahead of the mark, its length and half its base, each in
// proportion to the arrow size but the mark's xshift=-0.5mm
const ARROW = { ahead: 3.7 * PT, len: 6.62 * PT, half: 2.74 * PT, size: 1.5, back: 0.5 * MM };
const MOM = { dist: 3 * MM, shorten: 0.15 };
const INNER = 3.333 * PT; // inner sep .3333em at 10pt
const OUTER = 0.2 * PT;   // outer sep .5\pgflinewidth
const TEXT = { size: 10 * PT, font: 'default' };
// small, medium (the default) and large: node distance (cm), dot, crossed dot and blob diameters, arrow and
// insertion size (pt), and the graph's edges thick under large (tikzfeynman.keys.code.tex, every small@@ …)
const SIZES: Record<string, any> = {
  small: { dist: 1, dot: 1 * MM, crossed: 2 * MM, blob: 0.5 * PX, arrow: 1.2, ins: 2.5, thick: false },
  medium: { dist: 1.5, dot: 1.5 * MM, crossed: 3 * MM, blob: 0.75 * PX, arrow: 1.5, ins: 3, thick: false },
  large: { dist: 2, dot: 2 * MM, crossed: 4 * MM, blob: 1 * PX, arrow: 1.6, ins: 4, thick: true },
};

const EDGE_TYPES = ['plain', 'fermion', 'anti fermion', 'photon', 'boson', 'charged boson', 'anti charged boson', 'gluon',
  'scalar', 'charged scalar', 'anti charged scalar', 'ghost', 'majorana', 'anti majorana'];
const VERTEX_STYLES = ['dot', 'square dot', 'empty dot', 'crossed dot', 'blob'];
const TYPE_SET = new Set(EDGE_TYPES), VSET = new Set(VERTEX_STYLES);
// keys pdfLaTeX and XeLaTeX ignore (tikz-feynman: "requires LuaTeX. It will be ignored."), and the graph keys only
// the LuaTeX layouts read (an unknown /tikz/graphs key is ignored too)
const LUA_ONLY = /^(horizontal'?|vertical'?|(spring|spring electrical|tree|layered) layout|electric charge|same layer|layer|level distance|sibling distance|minimum layers|nodes behind edges)$/;

// ---------------------------------------------------------------- reading the code
// a top-level split at any of seps, minding braces, brackets and parentheses
function split(s: any, sep = ',') {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if ('{[('.includes(c)) d++;
    else if ('}])'.includes(c)) d--;
    if (sep.includes(c) && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const opts = (s: any) => split(s || '').map((x) => x.trim()).filter(Boolean);
// (TeX reads a line break in a key as a space: edge\nlabel is edge label)
const kv = (it: any) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim().replace(/\s+/g, ' '), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null }; };
// (blanked, so places in the code stay where they are)
const stripComments = (s: any) => s.replace(/(^|[^\\])(%.*)$/gm, (_m: string, a: string, c: string) => a + ' '.repeat(c.length));
// \(…\) and \[…\] as $…$ for drawing
// ($ inside \(…\) closes and opens the maths again: \($$x$$\) is x)
const shown = (t: any) => String(t || '').replace(/\\\(([\s\S]*?)\\\)/g, (_m: string, x: string) => '$' + x.replace(/(^|[^\\])\$/g, '$1') + '$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$');

const UNIT_PT: Record<string, number> = { cm: 72.27 / 2.54, mm: 72.27 / 25.4, pt: 1, em: 10, ex: 4.30554, in: 72.27, bp: 72.27 / 72, sp: 1 / 65536 };
// a length or an expression of lengths as \pgfmathparse reads it: numbers with units are in pt, the result has a
// unit if any part had one; { n, unit } or null. Macros (macros: '\name' → text) are expanded first.
function evalLen(src: any, macros?: Map<string, string>) {
  let t = String(src ?? '').trim();
  for (let k = 0; k < 8 && macros && /\\[A-Za-z@]+/.test(t); k++) t = t.replace(/\\[A-Za-z@]+/g, (m) => (macros.has(m) ? `(${macros.get(m)})` : m));
  t = unbrace(t);
  let i = 0, unit = false;
  const ws = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  const prim = (): number => {
    ws();
    if (t[i] === '(' || t[i] === '{') {
      const sh = t[i] === '(' ? ')' : '}'; i++; const v = sum(); ws(); if (t[i] !== sh) throw 0; i++;
      // (a macro's number then a unit: \h cm)
      const u = /^\s*(cm|mm|pt|em|ex|in|bp|sp)(?![A-Za-z])/.exec(t.slice(i));
      if (u) { i += u[0].length; unit = true; return v * UNIT_PT[u[1]]; }
      return v;
    }
    if (t[i] === '-') { i++; return -prim(); }
    // pgfmath's functions (angles in degrees; `r` after an argument means radians) and pi
    const f = /^(sin|cos|tan|sqrt|abs|exp|ln)\s*\(/.exec(t.slice(i));
    if (f) {
      i += f[0].length;
      let a = sum(); ws();
      if (t[i] === 'r' && /^sin|^cos|^tan/.test(f[1])) { a *= 180 / Math.PI; i++; ws(); }
      if (t[i] !== ')') throw 0;
      i++;
      const rad = (a * Math.PI) / 180;
      return ({ sin: Math.sin(rad), cos: Math.cos(rad), tan: Math.tan(rad), sqrt: Math.sqrt(a), abs: Math.abs(a), exp: Math.exp(a), ln: Math.log(a) } as Record<string, number>)[f[1]];
    }
    if (/^pi(?![A-Za-z])/.test(t.slice(i))) { i += 2; return Math.PI; }
    if (t[i] === '+') { i++; return prim(); }
    const m = /^(\d+\.?\d*|\.\d+)\s*(cm|mm|pt|em|ex|in|bp|sp)?/.exec(t.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    if (m[2]) { unit = true; return parseFloat(m[1]) * UNIT_PT[m[2]]; }
    return parseFloat(m[1]);
  };
  const prod = (): number => { let v = prim(); for (;;) { ws(); if (t[i] === '*') { i++; v *= prim(); } else if (t[i] === '/') { i++; v /= prim(); } else return v; } };
  const sum = (): number => { let v = prod(); for (;;) { ws(); if (t[i] === '+') { i++; v += prod(); } else if (t[i] === '-') { i++; v -= prod(); } else return v; } };
  try { const n = sum(); ws(); return i === t.length && isFinite(n) ? { n, unit } : null; } catch { return null; }
}
// a length → cm: a number without a unit is that many x/y vectors (1cm), NaN when it can't be read
function cm(v: any, macros?: Map<string, string>) {
  const r = evalLen(v, macros);
  return !r ? NaN : r.unit ? r.n / UNIT_PT.cm : r.n;
}
// (x,y) or (angle:radius) → [x, y] in cm
function coord(t: any, macros?: Map<string, string>) {
  t = t.trim();
  let m = /^\(\s*([^,:()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(t);
  if (m) { const x = cm(m[1], macros), y = cm(m[2], macros); return isFinite(x) && isFinite(y) ? [x, y] : null; }
  m = /^\(\s*([^:()]+?)\s*:\s*([^,()]+?)\s*\)$/.exec(t);
  if (m) { const a = (cm(m[1], macros) * Math.PI) / 180, r = cm(m[2], macros); return isFinite(r) && isFinite(a) ? [r * Math.cos(a), r * Math.sin(a)] : null; }
  return null;
}
// "above right=1cm and 2cm of b" → { dir, d, of }
const REL_RE = /^(above|below|left|right|above left|above right|below left|below right)\s*=\s*(?:(.*?)\s+)?of\s+(\S+)$/;
// what a diagram that lays itself out is drawn as
const LAYOUT_NOTE = (what: string) => `${what} lays the diagram out itself under LuaLaTeX: it is drawn as pdfLaTeX and XeLaTeX draw it, each chain a row and each new vertex 1cm on`;
// the TeX definitions a feynman environment may hold: read by their arguments, not to the next ;
const DEF_RE = /^\\(newcommand|renewcommand|providecommand|def|gdef|edef|xdef|let|pgfmathsetmacro|pgfmathtruncatemacro|pgfmathsetlengthmacro|tikzset|tikzfeynmanset|definecolor|colorlet|setlength)(?![A-Za-z@])\*?/;
function defEnd(s: string, i: number, name: string) {
  const arg = (k: number) => { k = skip(s, k); if (s[k] === '{') { const e = close(s, k); return e < 0 ? s.length : e + 1; } if (s[k] === '\\') { const m = /^\\(?:[A-Za-z@]+|.)/.exec(s.slice(k)); return k + (m ? m[0].length : 1); } return k + 1; };
  const opt = (k: number) => { const q = skip(s, k); if (s[q] === '[') { const e = close(s, q); return e < 0 ? s.length : e + 1; } return k; };
  let k = i;
  if (/def$/.test(name)) { k = arg(k); while (k < s.length && s[k] !== '{') k++; return arg(k); }
  if (name === 'let') { k = arg(k); k = skip(s, k); if (s[k] === '=') k++; return arg(k); }
  if (/command$/.test(name)) { k = arg(k); k = opt(k); k = opt(k); return arg(k); }
  const n = name === 'definecolor' ? 3 : name === 'tikzset' || name === 'tikzfeynmanset' ? 1 : 2;
  for (let a = 0; a < n; a++) { k = opt(k); k = arg(k); }
  return k;
}
// a definition's macro and the text it stands for (no parameters), or null
function defMacro(st: string) {
  const m = /^\\(?:newcommand|renewcommand|providecommand|def|gdef|edef|xdef|pgfmathsetmacro|pgfmathsetlengthmacro)\*?\s*\{?\s*(\\[A-Za-z@]+)\s*\}?\s*(\{[\s\S]*\})\s*$/.exec(st.trim());
  return m ? { nm: m[1], v: unbrace(m[2]) } : null;
}

// The model: { env, fd, dopts, vertices: [v], edges: [e], extra: [statement], macros, warnings }.
// v: { name, anon, o: [option], x, y (cm, or null), rel, at (a vertex it sits on), text (TeX, or null), bare (a \vertex
//      with no {…}: a coordinate), decl (a \vertex line), graph (made by a diagram), gx, gy (its column and row there) }
// e: { a, b, o: [option], pre: [the diagram's own edge options], ch (the chain it was written in) }
// fd: the option groups of a \feynmandiagram, when the code is one (#1 the picture's, #2 the graph's: one serves both)
// (macros: the picture's and preamble's definitions the code uses, name → text, from the importer)
function parse(src: any, macros?: Record<string, string>) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const t = stripComments(String(src || ''));
  const M: Record<string, any> = { env: '', vertices: [], edges: [], extra: [], drawing: [], macros: new Map(Object.entries(macros || {}).map(([k, v]) => ['\\' + k, v])), warnings };
  let body = t, off = 0;
  const fd = /^\s*\\feynmandiagram(?![A-Za-z@])/.exec(t);
  if (fd) {
    // \feynmandiagram[#1][#2]{…} is \tikz[#1] \graph[#2]{…}; with one [..] it serves as both
    let i = skip(t, fd[0].length);
    const og: string[] = [];
    while (t[i] === '[' && og.length < 2) { const e = close(t, i); if (e < 0) break; og.push(t.slice(i + 1, e).trim()); i = skip(t, e + 1); }
    M.fd = og; M.env = og[0] || ''; M.dopts = og.length > 1 ? og[1] : og[0] || '';
    if (t[i] !== '{') { warn('\\feynmandiagram needs { … }'); return M; }
    const e = close(t, i);
    if (e < 0) { warn('The { after \\feynmandiagram is not closed'); return M; }
    readDiagram(M, t.slice(i + 1, e), og.length > 1 ? og[1] : og[0] || '', 0, warn);
    if (M.vertices.some((v: any) => v.gx != null)) warn(LAYOUT_NOTE('\\feynmandiagram'));
    const rest = t.slice(e + 1).replace(/^\s*;/, '').trim();
    if (rest) warn(`"${rest.length > 40 ? rest.slice(0, 40) + '…' : rest}" after the diagram isn't drawn here`);
    return M;
  }
  const bm = /\\begin\{feynman\}\s*(\[[^\]]*\])?/.exec(t);
  if (bm) {
    M.env = bm[1] ? bm[1].slice(1, -1).trim() : '';
    const em = t.indexOf('\\end{feynman}', bm.index);
    off = bm.index + bm[0].length;
    body = t.slice(off, em < 0 ? t.length : em);
    if (em < 0) warn('\\end{feynman} is missing');
  }
  let i = 0, nd = 0, anon = 0;
  const cands: any[] = [];
  let every: string[] = [];
  const takeNode = (N: any, decl: boolean) => {
    if (N.badAtText) warn(`The position ${N.badAtText} isn't one the drawing understands: the vertex is drawn where it might go. Use at (x,y)`);
    // a vertex with no name is a node of its own all the same (written back without one)
    const v = N.name ? vertex(M, N.name) : vertex(M, `\u0001${++anon}`);
    if (!N.name) v.anon = true;
    if (decl && N.text == null && every.length) N.o = [...N.o, ...every];
    const r = readVertexOpts(N.o, warn, !decl && isCircle(N.o));
    v.o = r.o; v.rel = r.rel; v.decl = decl; v.graph = false; v.at = N.atRef; v.calc = N.calc || null; v.seg = N.seg || null; v.badAt = !!N.badAtText; v.atRaw = N.badAtText || null;
    // with no {…} a \vertex is a coordinate, whatever its style (tikz-feynman's every vertex@@: shape=coordinate)
    v.bare = N.text == null && r.text === undefined && !(decl && every.some((it) => VSET.has(kv(it).k)));
    if (N.text != null) v.text = N.text; else if (r.text !== undefined) v.text = r.text;
    if (N.xy) { v.x = N.xy[0]; v.y = N.xy[1]; }
    return v;
  };
  while (i < body.length) {
    i = skip(body, i);
    if (i >= body.length) break;
    if (body.startsWith('\\vertex', i) && !/[A-Za-z]/.test(body[i + 7] || '')) {
      const N = readNode(body, i + 7, M.macros);
      i = N.end;
      if (N.other != null) warn(`Something in a \\vertex line isn't drawn here: "${N.other}"`);
      if (N.bad) { warn('A \\vertex line is not closed with ;'); }
      takeNode(N, true);
      continue;
    }
    // \node and \coordinate: nodes as a \vertex with {…} and one without are (the diagram may join them). A \node is
    // read when the drawing holds all of it, or the diagram needs its name; else it is a statement kept as written
    const nm = /^\\(node|coordinate)(?![A-Za-z@])/.exec(body.slice(i));
    if (nm) {
      const N = readNode(body, i + nm[0].length, M.macros);
      if (N.other == null && !N.bad && (nm[1] === 'coordinate' ? N.text == null : N.text != null)) {
        cands.push({ N, node: nm[1] === 'node', st: body.slice(i, N.end).trim(), start: off + i, end: off + N.end, at: M.vertices.length });
        i = N.end;
        continue;
      }
    }
    // \diagram, \diagram* (TeX skips spaces before the *) and \feynmandiagram inside the environment
    const dm = /^\\(diagram|feynmandiagram)(?![A-Za-z@])\s*(\*?)/.exec(body.slice(i));
    if (dm) {
      const what = `\\${dm[1]}${dm[2]}`;
      i = skip(body, i + dm[0].length);
      let dopts = '';
      if (body[i] === '[') { const e = close(body, i); if (e < 0) { warn(`The [ after ${what} is not closed`); break; } dopts = body.slice(i + 1, e).trim(); M.dopts = dopts; i = e + 1; i = skip(body, i); }
      if (body[i] !== '{') { warn(`${what} needs { … }`); continue; }
      const e = close(body, i);
      if (e < 0) { warn(`The { after ${what} is not closed`); break; }
      readDiagram(M, body.slice(i + 1, e), dopts, nd++, warn);
      if (!dm[2] && M.vertices.some((v: any) => v.gx != null && v.nd === nd - 1)) warn(LAYOUT_NOTE(what));
      i = e + 1; i = skip(body, i); if (body[i] === ';') i++;
      continue;
    }
    // a definition: kept as written; a macro with no parameters is known to the positions after it
    const df = DEF_RE.exec(body.slice(i));
    if (df) {
      const e = defEnd(body, i + df[0].length, df[1]);
      const st = body.slice(i, e).trim();
      M.extra.push(st);
      const d = defMacro(st);
      // \tikzfeynmanset{every vertex={…}}: what the \vertex lines after it without {…} take (after their own options)
      if (df[1] === 'tikzfeynmanset') {
        const a = /^\\tikzfeynmanset\s*\{([\s\S]*)\}$/.exec(st);
        for (const it of a ? opts(a[1]) : []) { const q = kv(it); if (q.k === 'every vertex' && q.v != null) every = every.concat(opts(unbrace(q.v))); }
      }
      // (\pgfmathsetmacro keeps the number it works out)
      if (d) { const q = /^\\pgfmathsetmacro/.test(st) ? evalLen(d.v, M.macros) : null; M.macros.set(d.nm, q ? String(Math.round(q.n * 1e5) / 1e5) : d.v); } // (a length as its pt, no unit)
      i = skip(body, e); if (body[i] === ';') i++;
      continue;
    }
    // any other statement is kept as written
    const e = nextSemi(body, i);
    const st = body.slice(i, e + 1).trim();
    // \path (p) -- (q) coordinate [pos=t] (name): a coordinate that far along the line from p's border to q's
    const pc = /^\\path\s*\(\s*([A-Za-z0-9_']+)\s*\)\s*--\s*\(\s*([A-Za-z0-9_']+)\s*\)\s*coordinate\s*\[\s*pos\s*=\s*(-?\d*\.?\d+)\s*\]\s*\(\s*([A-Za-z0-9_']+)\s*\)\s*;$/.exec(st);
    if (pc) {
      cands.push({ N: { name: pc[4], o: [], seg: { p: pc[1], q: pc[2], t: parseFloat(pc[3]) } }, node: false, st, start: off + i, end: off + e + 1, at: M.vertices.length });
      i = e + 1;
      continue;
    }
    // (a drawing statement: where it is in the code, for the importer to draw it as the picture's own)
    if (st) { M.extra.push(st); M.drawing.push({ st, start: off + i, end: off + e + 1 }); warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`); }
    i = e + 1;
  }
  if (cands.length) {
    const known = new Set(M.vertices.filter((v: any) => !v.ref).map((v: any) => v.name)), wanted = new Set<string>();
    for (const v of M.vertices) { if (v.ref) wanted.add(v.name); if (v.rel) wanted.add(v.rel.of); if (v.at) wanted.add(v.at); for (const n of calcNames(v.calc)) wanted.add(n); }
    for (const c of cands) { if (c.N.seg) { wanted.add(c.N.seg.p); wanted.add(c.N.seg.q); } if (c.N.rel) wanted.add(c.N.rel.of); if (c.N.atRef) wanted.add(c.N.atRef); for (const n of calcNames(c.N.calc)) wanted.add(n); }
    for (const c of cands) {
      const circ = isCircle(c.N.o), held = c.N.seg ? true : !c.N.badAtText && (!c.node || readVertexOpts(c.N.o, null).o.every((it: string) => NODE_HELD.test(kv(it).k) || (circ && CIRCLE_HELD.test(kv(it).k))));
      if (held || (c.N.name && wanted.has(c.N.name) && !known.has(c.N.name))) {
        const old = M.vertices.findIndex((x: any) => x.name === c.N.name && x.ref);
        const v = takeNode(c.N, false), w = warnings.findIndex((x: string) => x.startsWith(`"${c.N.name}" is used in the diagram`));
        if (w >= 0) warnings.splice(w, 1);
        v.node = c.node; v.ref = false; v.src = c.st;
        // (in the code's order, before the vertices that came after it)
        M.vertices.splice(M.vertices.indexOf(v), 1); M.vertices.splice(old >= 0 ? old : Math.min(c.at, M.vertices.length), 0, v);
        if (!held) warn(`"${c.st.length > 40 ? c.st.slice(0, 40) + '…' : c.st}" is drawn only as its text`);
      } else {
        M.extra.push(c.st); M.drawing.push({ st: c.st, start: c.start, end: c.end });
        warn(`"${c.st.length > 40 ? c.st.slice(0, 40) + '…' : c.st}" isn't drawn here (it is kept in the code)`);
      }
    }
  }
  return M;
}
// the vertex of that name, made if there is none
function vertex(M: any, name: any, rest: Record<string, any> = {}) {
  let v = M.vertices.find((x: any) => x.name === name);
  if (!v) { v = { name, o: [], x: null, y: null, rel: null, text: null, ...rest }; M.vertices.push(v); }
  return v;
}
// a node statement's parts from i (after \vertex, \node or \coordinate) to its ;: { name, xy, atRef, badAtText, text,
// o, rel, other (what else it holds), bad (not closed), end }
function readNode(body: string, i: number, macros: Map<string, string>) {
  const N: Record<string, any> = { name: null, xy: null, text: null, o: [], atRef: null, badAtText: null, other: null, bad: false };
  for (;;) {
    i = skip(body, i);
    const c = body[i];
    if (c === undefined) { N.bad = true; break; }
    if (c === ';') { i++; break; }
    if (c === '[') { const e = close(body, i); if (e < 0) { N.bad = true; break; } N.o = N.o.concat(opts(body.slice(i + 1, e))); i = e + 1; continue; }
    if (c === '(') { const e = close(body, i); if (e < 0) { N.bad = true; break; } if (N.name == null) N.name = body.slice(i + 1, e).trim(); i = e + 1; continue; }
    if (c === '{') { const e = close(body, i); if (e < 0) { N.bad = true; break; } N.text = body.slice(i + 1, e).trim(); i = e + 1; continue; }
    if (body.startsWith('at', i) && !/[A-Za-z]/.test(body[i + 2] || '')) {
      i = skip(body, i + 2);
      if (body[i] === '(') {
        const e = close(body, i), w = e > 0 ? body.slice(i, e + 1) : '';
        const p = e > 0 ? coord(w, macros) : null;
        // at (name): where that vertex is
        const nm = /^\(\s*([A-Za-z0-9_.']+)\s*\)$/.exec(w);
        const cc = /^\(\s*\$([\s\S]*)\$\s*\)$/.exec(w);
        if (!p && nm) N.atRef = nm[1];
        else if (!p && cc) N.calc = cc[1].trim();
        else if (!p) N.badAtText = w;
        N.xy = p; i = e > 0 ? e + 1 : body.length; continue;
      }
    }
    // anything else up to the ;
    const e = body.indexOf(';', i);
    N.other = body.slice(i, e < 0 ? undefined : e).trim();
    i = e < 0 ? body.length : e;
  }
  N.end = i;
  N.rel = readVertexOpts(N.o, null).rel;
  return N;
}
// a compass anchor's side of a node: [x, y] (y up)
const ANCHORS: Record<string, number[]> = { center: [0, 0], north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], 'north east': [1, 1], 'north west': [-1, 1], 'south east': [1, -1], 'south west': [-1, -1] };
// the options of a \node the drawing holds whole: placing (read apart) and text colours
const NODE_HELD = /^(red|blue|green|black|gray|grey|orange|purple|brown|cyan|magenta|violet|teal|olive|white|text|color)$/;
// and a circle node's: its fill and outline, minimum size and inner sep
const CIRCLE_HELD = /^(circle|shape|fill|draw|minimum size|inner sep)$/;
const isCircle = (o: string[]) => o.some((it) => { const q = kv(it); return (q.k === 'circle' && q.v == null) || (q.k === 'shape' && unbrace(q.v) === 'circle'); });
function nextSemi(s: any, i: any) {
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if ('{[('.includes(c)) { const e = close(s, k); if (e < 0) return s.length - 1; k = e; continue; }
    if (c === ';') return k;
  }
  return s.length - 1;
}
function readVertexOpts(list: any, warn: any, node = false) {
  const o = [];
  let rel = null, text;
  for (const it of list) {
    const m = REL_RE.exec(it.replace(/\s+/g, ' ').trim());
    if (m) { rel = { dir: m[1], d: m[2] || '', of: m[3].replace(/^\(|\)$/g, '') }; continue; }
    const { k, v } = kv(it);
    if (k === 'particle' && v != null) { text = unbrace(v); continue; }
    if (k === 'style' && v != null && VSET.has(unbrace(v))) { o.push(unbrace(v)); continue; } // style=dot is dot
    o.push(it);
    if (VSET.has(k) || (SIZES[k] && v == null) || k === 'label' || k === 'vertex' || k === 'minimum size' || (k === 'anchor' && v != null && ANCHORS[unbrace(v)]) || (node && CIRCLE_HELD.test(k)) || /^(red|blue|green|black|gray|grey|orange|purple|brown|cyan|magenta|violet|teal|olive|draw|fill|color|text)$/.test(k)) continue;
    if (warn) warn(`The vertex option "${it}" isn't drawn here (it is kept in the code)`);
  }
  const r: Record<string, any> = { o, rel };
  if (text !== undefined) r.text = text;
  return r;
}
// [edges=…, nodes=…, …] on a diagram or a group: the edge and node options it gives everything made inside it
// (small, large: the sizes its edges' arrows and insertions and its dots take; medium sets only distances. dist: the
// node distance its nodes placed by `of` take, as tikz-feynman's every diagram sets medium's 1.5cm before these keys.
// On a \feynmandiagram with one [..] the picture's keys are there too, read with the environment's)
function groupOpts(s: string, warn: any, fd = false, macros?: Map<string, string>) {
  const edges: string[] = [], nodes: string[] = [];
  let size = '', dist: number[] | null = null;
  for (const it of opts(s)) {
    const { k, v } = kv(it);
    if (SIZES[k] && v == null) { if (k !== 'medium') size = k; dist = [SIZES[k].dist]; continue; }
    if (k === 'node distance' && v != null) { const ds = v.split(/\s+and\s+/).map((q: string) => cm(q, macros)); if (ds.every(isFinite)) { dist = ds; continue; } }
    if (fd && k === 'inline') { dist = [SIZES.small.dist]; continue; }
    if (fd && (/^(scale|xshift|yshift|shift|transform shape|inline|node distance|baseline|line width|color|draw|every node\/\.(append )?style)$/.test(k) || /^(ultra thin|very thin|thin|semithick|thick|very thick|ultra thick)$/.test(k) || (v == null && TD.tikzColor && TD.tikzColor(k)))) continue;
    if ((k === 'edges' || k === 'edge') && v != null) { edges.push(...opts(unbrace(v))); continue; }
    if (k === 'nodes' && v != null) { nodes.push(...opts(unbrace(v))); continue; }
    if (LUA_ONLY.test(k) || k === '/tikzfeynman/.cd') continue;
    warn(`The diagram option "${it}" isn't drawn here (it is kept in the code)`);
  }
  return { edges, nodes, size, dist };
}
// an edge operator at i, spaces allowed between its characters as TeX skips them: --, ->, <-, <->, -!-
function edgeOp(s: string, i: number) {
  const m = /^(?:-\s*-|-\s*>|<\s*-\s*>|<\s*-|-\s*!\s*-)/.exec(s.slice(i));
  return m ? { op: m[0].replace(/\s+/g, ''), end: i + m[0].length } : null;
}
// A diagram's body is TikZ's graph syntax: a group is chains split at , or ;, a { … } inside one is a group of its
// own with its [options]; an element is (a name already made), a name that makes a node (with [options]), or a group.
// \graph places what it makes (graphs' default placement, which pdfLaTeX's tikz-feynman leaves in force): a counter
// across (W) and one down (D) from 0; a chain starts at its group's column, a row below the chains before it; each node
// it makes is put at (W cm, −D cm) and moves W on by one; a group moves W on by its widest chain and the chain down by
// all its rows. A name made earlier in the same diagram is that node again; one made by a \vertex is made anew.
function readDiagram(M: any, body: string, dopts: string, nd: number, warn: any) {
  const made = new Set<string>(), D0 = groupOpts(dopts, warn, !!M.fd, M.macros);
  let ch = M.edges.reduce((a: number, e: any) => Math.max(a, e.ch + 1), 0);
  // (gd, gs: the node distance and size in force where it is made)
  const node = (name: string, o: string[] | null, W: number, D: number, nopts: string[], gd: number[], gs: string) => {
    if (made.has(name)) { const v = M.vertices.find((x: any) => x.name === name); if (o && o.length) addOpts(v, o, warn); return { v, made: false }; }
    // (a \vertex of that name, or a node of an earlier diagram, is replaced: it is the new node from here on)
    const old = M.vertices.findIndex((x: any) => x.name === name);
    if (old >= 0) M.vertices.splice(old, 1);
    const v = vertex(M, name, { graph: true, gx: W, gy: D, nd, gd, ...(gs ? { gsz: gs } : {}) });
    made.add(name);
    if (nopts.length || (o && o.length)) addOpts(v, [...nopts, ...(o || [])], warn);
    return { v, made: true };
  };
  const ref = (name: string, o: string[] | null) => {
    let v = M.vertices.find((x: any) => x.name === name);
    if (!v) { v = vertex(M, name, { graph: true, ref: true }); warn(`"${name}" is used in the diagram without a \\vertex line: its place is a guess`); }
    if (o && o.length) addOpts(v, o, warn);
    return v;
  };
  // a group: { width, depth, first, last } (first and last: the names an edge into or out of it joins)
  const group = (s: string, W0: number, D0g: number, eo: string[], no: string[], gd: number[], gs: string): any => {
    let i = skip(s, 0);
    if (s[i] === '[') { const e = close(s, i); if (e < 0) { warn('A [ in the diagram is not closed'); return { width: 0, depth: 0, first: [], last: [] }; } const g = groupOpts(s.slice(i + 1, e), warn, false, M.macros); eo = [...eo, ...g.edges]; no = [...no, ...g.nodes]; gd = g.dist || gd; gs = g.size || gs; i = e + 1; }
    let D = D0g, width = 0;
    const first: string[] = [], last: string[] = [];
    for (const part of split(s.slice(i), ',;')) {
      if (!part.trim()) continue;
      const c = chain(part, W0, D, eo, no, gd, gs);
      D += c.depth; width = Math.max(width, c.width);
      first.push(...c.first); last.push(...c.last);
    }
    return { width, depth: D - D0g, first, last };
  };
  const chain = (s: string, W0: number, D: number, eo: string[], no: string[], gd: number[], gs: string) => {
    let bare = false, prevBare = false;
    let i = 0, W = W0, depth = 0, prev: string[] | null = null, edge: any = null, first: string[] | null = null;
    const c0 = ch++;
    while (i < s.length) {
      i = skip(s, i);
      if (i >= s.length) break;
      const op = edgeOp(s, i);
      if (op) {
        i = skip(s, op.end);
        let o: any[] = [];
        if (s[i] === '[') { const e = close(s, i); if (e < 0) { warn('A [ in the diagram is not closed'); break; } o = opts(s.slice(i + 1, e)); i = e + 1; }
        if (op.op !== '--' && op.op !== '-!-') warn(`The edge ${op.op} isn't drawn here (only --)`);
        edge = { op: op.op, o };
        continue;
      }
      const c = s[i];
      let into: string[], out: string[];
      if (c === '(') {
        const e = close(s, i); if (e < 0) { warn('A ( in the diagram is not closed'); break; }
        const name = s.slice(i + 1, e).trim(); i = skip(s, e + 1);
        let o = null;
        if (s[i] === '[') { const e2 = close(s, i); if (e2 < 0) { warn('A [ in the diagram is not closed'); break; } o = opts(s.slice(i + 1, e2)); i = e2 + 1; }
        into = out = [ref(name, o).name]; bare = false;
      } else if (c === '{') {
        const e = close(s, i); if (e < 0) { warn('A { in the diagram is not closed'); break; }
        const g = group(s.slice(i + 1, e), W, D, eo, no, gd, gs);
        i = e + 1;
        W += g.width; depth = Math.max(depth, g.depth);
        into = g.first; out = g.last; bare = false;
      } else if (/[A-Za-z0-9_]/.test(c)) {
        const m = /^[A-Za-z0-9_.']+/.exec(s.slice(i))!;
        i = skip(s, i + m[0].length);
        let o = null;
        if (s[i] === '[') { const e = close(s, i); if (e < 0) { warn('A [ in the diagram is not closed'); break; } o = opts(s.slice(i + 1, e)); i = e + 1; }
        const r = node(m[0], o, W, D, no, gd, gs);
        if (r.made) { W += 1; depth = Math.max(depth, 1); }
        into = out = [r.v.name]; bare = true;
      } else { warn(`"${s.slice(i).trim()}" in the diagram isn't understood`); break; }
      // (an edge from a node to itself is drawn when both ends are written as the graph's own names, not (refs))
      if (prev && edge) { if (edge.op !== '-!-') for (const a of prev) for (const b of into) M.edges.push({ a, b, o: [...eo, ...edge.o], pre: D0.edges, ch: c0, ...(gs ? { sz: gs } : {}), ...(a === b && bare && prevBare ? { loop: true } : {}) }); }
      else if (prev && !edge) warn('Two vertices in the diagram follow each other without -- between them');
      if (!first) first = into;
      prev = out; edge = null; prevBare = bare;
    }
    return { width: W - W0, depth, first: first || [], last: prev || [] };
  };
  group(body, 0, 0, [], D0.nodes, D0.dist || [SIZES.medium.dist], D0.size);
}
function addOpts(v: any, o: string[], warn: any) {
  const r = readVertexOpts(o, warn);
  v.o = v.o.concat(r.o);
  if (r.text !== undefined) v.text = r.text;
  if (r.rel) v.rel = r.rel;
}
// what an edge's options say: { type, label, labelSide, mom: [{ text, side, rev, shorten, dist }], ins: [pos], bend, color, width }
function readEdgeOpts(list: any, warn: any, macros?: Map<string, string>) {
  const r = { type: 'plain', mom: ([] as any[]), ins: [] as number[], labels: ([] as any[]), bend: (null as any), out: (null as any), in: (null as any), relative: false, loose: 1, loop: false, nodraw: false, double: (null as any), minD: 0, maxD: Infinity, dash: (undefined as any), color: null, width: (null as any), opacity: 1, arrows: ([] as any[]), extra: ([] as any[]) };
  for (const it of list) {
    const { k, v } = kv(it);
    if (TYPE_SET.has(k) && v == null) { r.type = k; continue; }
    if (k === 'edge label' || k === "edge label'") { r.labels.push({ t: unbrace(v), side: k.endsWith("'") ? -1 : 1 }); continue; }
    const mm = /^(reversed momentum|rmomentum|momentum)('?)$/.exec(k);
    if (mm) {
      let t = unbrace(v), sub: Record<string, any> = {};
      if (t[0] === '[') { const e = close(t, 0); for (const x of opts(t.slice(1, e))) { const q = kv(x); sub[q.k] = q.v; } t = t.slice(e + 1).trim(); }
      r.mom.push({ t, side: mm[2] ? -1 : 1, rev: mm[1] !== 'momentum', shorten: parseFloat(sub['arrow shorten']) || MOM.shorten, dist: sub['arrow distance'] ? cm(sub['arrow distance'], macros) * PX : MOM.dist });
      continue;
    }
    if (k === 'insertion') {
      let t = unbrace(v == null ? '0.5' : v);
      if (t[0] === '[') t = t.slice(close(t, 0) + 1).trim();
      r.ins.push(parseFloat(t) || 0.5);
      continue;
    }
    // with arrow=pos: a fraction of the way along, or a length from the start (from the end when negative)
    if ((k === 'with arrow' || k === 'with reversed arrow') && v != null) {
      const q = evalLen(v, macros);
      if (q) { r.arrows.push({ at: q.n, len: q.unit, dir: k === 'with arrow' ? 1 : -1 }); continue; }
    }
    // bend, half and quarter turn `relative` on: out= and in= after them are then taken from the line's direction
    if (k === 'bend left' || k === 'bend right') { const b = parseFloat(v as any); r.bend = (k === 'bend left' ? 1 : -1) * (isFinite(b) ? b : 30); r.relative = true; continue; } // bend left=0 is 0°, not 30°
    if (k === 'half left' || k === 'half right') { r.bend = k === 'half left' ? 90 : -90; r.loose = 1.5; r.relative = true; continue; }
    if (k === 'quarter left' || k === 'quarter right') { r.bend = k === 'quarter left' ? 45 : -45; r.relative = true; continue; }
    if (k === 'relative') { r.relative = v !== 'false'; continue; }
    if (k === 'out' && v != null) { r.out = parseFloat(v); continue; }
    if (k === 'in' && v != null) { r.in = parseFloat(v); continue; }
    if (k === 'looseness' && v != null) { r.loose = parseFloat(v) || 1; continue; }
    if (k === 'loop' && v == null) { r.loop = true; r.loose = 8; r.minD = 5 * MM; continue; } // TikZ's loop: looseness 8, min distance 5mm
    // double: drawn 2 × line width + double distance wide in the line's colour, then double distance wide in the double
    // colour (white unless given)
    if (k === 'double') { const c = v == null ? '#ffffff' : TD.tikzColor ? TD.tikzColor(v) : null; if (c) { r.double = { color: c, dist: r.double?.dist ?? 0.6 * PT }; continue; } }
    if (k === 'double distance' && v != null) { const d = cm(v, macros); if (isFinite(d)) { r.double = { color: r.double?.color ?? '#ffffff', dist: d * PX }; continue; } }
    if ((k === 'min distance' || k === 'max distance') && v != null) { const d = cm(v, macros); if (isFinite(d)) { r[k === 'min distance' ? 'minD' : 'maxD'] = d * PX; continue; } }
    if (k === 'thick') { r.width = 0.8 * PT; continue; }
    if (k === 'very thick') { r.width = 1.2 * PT; continue; }
    if (k === 'ultra thick') { r.width = 1.6 * PT; continue; }
    if (k === 'thin') { r.width = LW; continue; }
    if (k === 'semithick') { r.width = 0.6 * PT; continue; }
    // TikZ's dash patterns (on, off in pt)
    const dp = ({ dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], solid: null } as Record<string, any>)[k];
    if (dp !== undefined && v == null) { r.dash = dp; continue; }
    if (k === 'line width' && v != null) { const w = cm(v, macros); if (isFinite(w)) { r.width = w * PX; continue; } }
    if (k === 'opacity' && v != null) { const q = evalLen(v, macros); if (q && !q.unit) { r.opacity = Math.max(0, Math.min(1, q.n)); continue; } }
    if (LUA_ONLY.test(k)) continue;
    // draw=none: the line isn't stroked (its arrows, filled marks, and labels still are)
    if (k === 'draw' && v === 'none') { r.nodraw = true; continue; }
    const col = (k === 'draw' || k === 'color') && v != null ? v : v == null ? k : null;
    if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
    if (warn) warn(`The edge option "${it}" isn't drawn here (it is kept in the code)`);
    r.extra.push(it);
  }
  return r;
}

// ---------------------------------------------------------------- the environment's options
// Options the diagram is drawn under, in order: the picture's and scopes' round it (wrap, from the importer), then the
// environment's (or \feynmandiagram's picture options) after tikz-feynman's medium. scale scales the `at` positions
// only; placing (right=of …) and the graph's columns and rows are lengths on the page, and node shapes and texts keep
// their size, unless transform shape. { k, ts, ox, oy (cm), size, dist [vertical, horizontal] (cm), width, color }
function envOf(wrap: string, env: string, warn: any, macros?: Map<string, string>) {
  const X: Record<string, any> = { k: 1, ns: 1, ts: false, ox: 0, oy: 0, size: 'medium', dist: null, width: null, color: null };
  const read = (s: string, own: boolean) => {
    for (const it of opts(s)) {
      const { k, v } = kv(it);
      if (k === 'scale' && v != null) { const q = evalLen(v, macros); if (q && !q.unit) { X.k *= q.n; continue; } }
      if ((k === 'xshift' || k === 'yshift') && v != null) { const d = cm(v, macros); if (isFinite(d)) { if (k === 'xshift') X.ox += X.k * d; else X.oy += X.k * d; continue; } }
      if (k === 'shift' && v != null) { const p = coord(unbrace(v), macros); if (p) { X.ox += X.k * p[0]; X.oy += X.k * p[1]; continue; } }
      if (k === 'transform shape') { X.ts = v !== 'false'; continue; }
      if (k === 'small' || k === 'medium' || k === 'large') { X.size = k; X.dist = null; continue; }
      if (k === 'inline') { X.size = 'small'; X.dist = null; continue; } // inline=(o): baseline (o) and small
      if (k === 'node distance' && v != null) {
        const ds = v.split(/\s+and\s+/).map((q: string) => cm(q, macros));
        if (ds.every(isFinite)) { X.dist = ds; continue; }
      }
      if (/^(ultra thin|very thin|thin|semithick|thick|very thick|ultra thick)$/.test(k)) { X.width = ({ 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 } as Record<string, number>)[k] * PT; continue; }
      if (k === 'line width' && v != null) { const w = cm(v, macros); if (isFinite(w)) { X.width = w * PX; continue; } }
      if (k === 'baseline' || k === '/tikzfeynman/.cd' || LUA_ONLY.test(k)) continue;
      // every node/.style={scale=…, transform shape}: what the vertices' and labels' nodes take (not the lines)
      if (/^every node\/\.(append )?style$/.test(k) && v != null) {
        const bad = [];
        for (const x of opts(unbrace(v))) {
          const q = kv(x), n = q.k === 'scale' && q.v != null ? evalLen(q.v, macros) : null;
          if (n && !n.unit) X.ns *= n.n; else if (q.k === 'transform shape') X.ts = q.v !== 'false'; else bad.push(x);
        }
        if (!bad.length) continue;
      }
      const col = (k === 'color' || k === 'draw') && v != null ? v : v == null ? k : null;
      if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { X.color = c; continue; } }
      warn(`${own ? 'The diagram\'s' : 'The picture\'s'} option "${it}" isn't drawn here`);
    }
  };
  read(wrap || '', false);
  read(env || '', true);
  X.u = X.ts ? X.k : 1; // what lengths on the page are multiplied by
  X.nu = X.u * X.ns;     // and node sizes and texts
  const S = SIZES[X.size];
  X.sz = S;
  if (!X.dist) X.dist = [S.dist];
  return X;
}

// ---------------------------------------------------------------- writing the code
const num = num3;
function vertexCode(v: any) {
  if (v.x == null && v.seg) return `\\path (${v.seg.p}) -- (${v.seg.q}) coordinate [pos=${num(v.seg.t)}] (${v.name});`;
  const o = v.o.slice();
  if (v.x == null && v.rel) o.push(`${v.rel.dir}=${v.rel.d ? v.rel.d + ' ' : ''}of ${v.rel.of}`);
  // (a position the drawing could not read is written as it was)
  const at = v.x != null ? ` at (${num(v.x)},${num(v.y)})` : v.at ? ` at (${v.at})` : v.calc ? ` at ($${v.calc}$)` : v.atRaw ? ` at ${v.atRaw}` : '';
  // a coordinate stays one; a styled or written text vertex keeps its {…}
  const text = v.text != null ? ` {${v.text}}` : VSET.has(styleOf(v)) && !v.bare ? ' {}' : '';
  return `\\vertex${o.length ? ` [${o.join(', ')}]` : ''}${v.anon ? '' : ` (${v.name})`}${at}${text};`;
}
function write(M: any, wrap = '') {
  // a node the diagram placed becomes a \vertex where it is, in the environment's coordinates under the picture's
  // options round it (wrap) (the diagram written back joins named vertices)
  const X = envOf(wrap, envText(M), () => {}, M.macros), geo = new Map();
  for (const v of M.vertices) geo.set(v.name, shapeOf(v, X));
  const at = place(M, X, geo, () => {});
  const lines = M.vertices.map((v: any) => {
    const p = at.get(v.name);
    if (!(v.graph && v.x == null && p && !M.loose.has(v.name))) return '  ' + vertexCode(v);
    // (with the size its diagram gave it, first: small and large add to the dot styles after them)
    const o = v.gsz && styleOf(v) && !v.o.some((it: string) => SIZES[kv(it).k]) ? [v.gsz, ...v.o] : v.o;
    return '  ' + vertexCode({ ...v, o, x: (p[0] - X.ox) / X.k, y: (p[1] - X.oy) / X.k, bare: false });
  });
  for (const x of M.extra) lines.push('  ' + x);
  if (M.edges.length) {
    lines.push(`  \\diagram*${M.dopts ? ` [${M.dopts}]` : ''} {`);
    const chains = [];
    let cur = null;
    for (const e of M.edges) {
      const step = ` -- ${e.o.length ? `[${e.o.join(', ')}] ` : ''}(${e.b})`;
      if (cur && cur.ch === e.ch && cur.last === e.a) { cur.text += step; cur.last = e.b; }
      else { cur = { ch: e.ch, last: e.b, text: `(${e.a})${step}` }; chains.push(cur); }
    }
    for (const c of chains) lines.push(`    ${c.text},`);
    lines.push('  };');
  }
  // (a \feynmandiagram's: the picture's options and the graph's sizes, as it was drawn)
  const env = envText(M);
  return `\\begin{feynman}${env ? `[${env}]` : ''}\n${lines.join('\n')}${lines.length ? '\n' : ''}\\end{feynman}`;
}
const styleOf = (v: any) => { for (const it of v.o) { const k = kv(it).k; if (VSET.has(k)) return k; } return ''; };

// ---------------------------------------------------------------- layout
const layout = layoutCache((s: any) => [s.src, s.wrap || '', s.macros ? JSON.stringify(s.macros) : '', TD.math && TD.math.engine].join('\u0001'), (s: any) => build(s.src, s.wrap || '', s.macros));

// TeX's height and depth of a vertex's text (Computer Modern metrics where they are known, else the measured box)
function textHD(t: string, b: any, em: number) {
  const hd = TD.texLineHD && !/\\\\/.test(t) ? TD.texLineHD(t, em) : null;
  return hd || { ht: 0.55 * b.h, dp: 0.25 * b.h };
}
// a vertex's shape: a coordinate (no border), a rectangle round its text or a circle (dots, blobs); sizes in px
function shapeOf(v: any, X: any) {
  // (small or large on a vertex before its style: the sizes its dot takes; after it, the style has its size already)
  const ks = v.o.map((it: string) => kv(it).k), si = ks.findIndex((k: string) => VSET.has(k));
  const sz = ks.filter((k: string, j: number) => SIZES[k] && k !== 'medium' && (si < 0 || j < si)).pop();
  const st = styleOf(v), u = X.nu, S = SIZES[sz || v.gsz] || X.sz;
  // a \vertex without {…} is a coordinate; a node the diagram makes takes its style as it is
  if (v.decl && v.bare) return { kind: 'coord', st: '', hw: 0, hh: 0, r: 0 };
  if (!v.decl && !st && v.text == null) return { kind: 'coord', st: '', hw: 0, hh: 0, r: 0 };
  const ms = v.o.map(kv).filter((q: any) => q.k === 'minimum size' && q.v != null).map((q: any) => cm(q.v) * PX).filter(isFinite).pop();
  if (st === 'dot' || st === 'empty dot') return { kind: 'circle', st, r: ((ms ?? S.dot) / 2) * u };
  if (st === 'square dot') { const h = ((ms ?? S.dot) / 2) * u; return { kind: 'rect', st, hw: h, hh: h, r: 0 }; }
  if (st === 'crossed dot') return { kind: 'circle', st, r: ((ms ?? S.crossed) / 2) * u };
  if (st === 'blob') return { kind: 'circle', st, r: ((ms ?? S.blob) / 2 + OUTER) * u };
  // a text node: its TeX box, inner sep .3333em and outer sep .5\pgflinewidth on each side
  const t = shown(v.text || ''), em = TEXT.size;
  // a \node [circle, fill, draw, minimum size, inner sep]: the circle round its text, at least minimum size across
  if (v.node && isCircle(v.o)) {
    const q: Record<string, any> = {}; for (const it of v.o) { const x = kv(it); q[x.k] = x.v; }
    const sep = q['inner sep'] != null ? cm(q['inner sep']) * PX : INNER, b = t.trim() ? TD.textBox(t, TEXT) : null, hd = b ? textHD(t, b, em) : null;
    const r = Math.max((ms ?? 0) / 2, (b ? Math.hypot((b.w - 2) / 2, (hd!.ht + hd!.dp) / 2) : 0) + (isFinite(sep) ? sep : INNER));
    const ink = (c: any) => (c == null ? 'currentColor' : c === 'none' ? null : TD.tikzColor ? TD.tikzColor(c) : null);
    return { kind: 'circle', st: '', r: (r + OUTER) * u, disc: { r: r * u, fill: 'fill' in q ? ink(q.fill) : null, stroke: 'draw' in q ? ink(q.draw) : null }, ...(b ? { t, b, hd } : {}) };
  }
  if (!t.trim()) return { kind: 'rect', st: '', hw: (INNER + OUTER) * u, hh: (INNER + OUTER) * u, r: 0 };
  const b = TD.textBox(t, TEXT), hd = textHD(t, b, em);
  return { kind: 'rect', st: '', hw: ((b.w - 2) / 2 + INNER + OUTER) * u, hh: ((hd.ht + hd.dp) / 2 + INNER + OUTER) * u, r: 0, t, b, hd };
}
// where a node's anchor for a direction is, from its centre (px, y up): a rectangle's side or corner, a circle's point
function anchorOff(n: any, sx: number, sy: number) {
  if (n.kind === 'circle') { const l = Math.hypot(sx, sy) || 1; return [(sx / l) * n.r, (sy / l) * n.r]; }
  return [sx * (n.hw || 0), sy * (n.hh || 0)];
}

// the names a calc position uses
const calcNames = (e: any) => [...String(e || '').matchAll(/\(\s*([A-Za-z][A-Za-z0-9_']*)\s*\)/g)].map((m) => m[1]);
// a calc position, ($(a)!0.5!(b) + (1,0)$): sums and differences of points, each a vertex's centre or (x,y), with
// k*(…) and partway (p)!t!(q); [x, y] in cm on the page, null while a vertex it names has no place yet, 'bad' when it
// can't be read (or the environment shifts: calc's own coordinates would take the shift each)
function calcAt(e: string, at: Map<string, any>, X: any, macros: Map<string, string>): any {
  if (X.ox || X.oy) return 'bad';
  let i = 0, wait = false;
  const ws = () => { while (i < e.length && /\s/.test(e[i])) i++; };
  const point = (): number[] | null => {
    ws();
    if (e[i] !== '(') return null;
    const k = close(e, i); if (k < 0) return null;
    const w = e.slice(i, k + 1); i = k + 1;
    const c = coord(w, macros);
    if (c) return [X.k * c[0], X.k * c[1]];
    const nm = /^\(\s*([A-Za-z0-9_']+)\s*\)$/.exec(w);
    if (!nm) return null;
    if (!at.has(nm[1])) { wait = true; return [0, 0]; }
    return at.get(nm[1]);
  };
  const term = (): number[] | null => {
    ws();
    let f = 1;
    const m = /^(-?\d*\.?\d+)\s*\*/.exec(e.slice(i));
    if (m) { f = parseFloat(m[1]); i += m[0].length; }
    let p = point(); if (!p) return null;
    // (p)!t!(q): t of the way to q; (p)!d!(q) with a length: that far towards it; angle:(q) turns q about p first
    for (;;) {
      ws();
      const q = /^!\s*([^!]+?)\s*!\s*(?:(-?\d*\.?\d+)\s*:)?/.exec(e.slice(i));
      if (!q) break;
      i += q[0].length;
      const b = point(), t = evalLen(q[1], macros); if (!b || !t) return null;
      // (a length is on the page: calc works in the page's coordinates)
      const a: number = ((q[2] ? parseFloat(q[2]) : 0) * Math.PI) / 180, dx: number = b[0] - p[0], dy: number = b[1] - p[1];
      const rx: number = dx * Math.cos(a) - dy * Math.sin(a), ry: number = dx * Math.sin(a) + dy * Math.cos(a), l: number = Math.hypot(rx, ry) || 1;
      const f: number = t.unit ? t.n / UNIT_PT.cm / l : t.n;
      p = [p[0] + f * rx, p[1] + f * ry];
    }
    return [f * p[0], f * p[1]];
  };
  let r = term(); if (!r) return 'bad';
  for (;;) {
    ws();
    if (i >= e.length) break;
    const sg = e[i] === '+' ? 1 : e[i] === '-' ? -1 : 0;
    if (!sg) return 'bad';
    i++;
    const p = term(); if (!p) return 'bad';
    r = [r[0] + sg * p[0], r[1] + sg * p[1]];
  }
  return wait ? null : r;
}
// where every vertex sits, in cm on the page (y up), as pdfLaTeX puts it
function place(M: any, X: any, geo: Map<string, any>, warn: any) {
  const at = new Map();
  // anchor=north …: that anchor is put at the place, not the centre
  const anchored = (v: any, p: number[]) => {
    const a = v.o.map(kv).filter((q: any) => q.k === 'anchor' && q.v != null).map((q: any) => ANCHORS[unbrace(q.v)]).filter(Boolean).pop(), g = geo.get(v.name);
    if (!a || !g || v.rel) return p;
    const [ax, ay] = anchorOff(g, a[0], a[1]);
    return [p[0] - ax / PX, p[1] - ay / PX];
  };
  for (const v of M.vertices) {
    if (v.x != null) at.set(v.name, anchored(v, [X.ox + X.k * v.x, X.oy + X.k * v.y]));
    else if (v.graph && v.gx != null && !v.rel) at.set(v.name, [X.ox + X.u * v.gx, X.oy - X.u * v.gy]);
    // a \vertex with neither at nor a place is at the origin (the start of its \path)
    else if ((v.decl || v.node !== undefined) && !v.rel && !v.at && !v.calc && !v.seg && !v.badAt) at.set(v.name, anchored(v, [X.ox, X.oy]));
  }
  // relative ones, as far as their references reach. The feynman environment is on grid: the new node's centre is the
  // reference's centre and the shift when the reference is a node with a border; from a coordinate, the new node's
  // anchor on the other side (west for right=of …) is put there
  const unreadable = new Set();
  for (let pass = 0; pass < M.vertices.length; pass++) {
    let moved = false;
    for (const v of M.vertices) {
      if (at.has(v.name) || unreadable.has(v.name)) continue;
      if (v.at && at.has(v.at)) { at.set(v.name, anchored(v, at.get(v.at).slice())); moved = true; continue; }
      if (v.seg) {
        const { p, q, t } = v.seg;
        if (!at.has(p) || !at.has(q)) continue;
        const [ax, ay] = at.get(p), [bx, by] = at.get(q), l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
        const ra = reach(geo.get(p) || {}, ux, uy) / PX, rb = reach(geo.get(q) || {}, ux, uy) / PX;
        const s0 = [ax + ux * ra, ay + uy * ra], s1 = [bx - ux * rb, by - uy * rb];
        at.set(v.name, [s0[0] + t * (s1[0] - s0[0]), s0[1] + t * (s1[1] - s0[1])]); moved = true;
        continue;
      }
      if (v.calc) {
        const p = calcAt(v.calc, at, X, M.macros);
        if (p === 'bad') { unreadable.add(v.name); warn(`The position ($${v.calc}$) isn't one the drawing understands: the vertex is drawn where it might go`); }
        else if (p) { at.set(v.name, anchored(v, p)); moved = true; }
        continue;
      }
      if (!v.rel || !at.has(v.rel.of)) continue;
      const [bx, by] = at.get(v.rel.of), dir = v.rel.dir, diag = /\s/.test(dir);
      // y and x; one length is both, by 0.707106781 along a diagonal; none is the node distance (the same rule)
      // (a node the diagram makes takes the diagram's node distance)
      const ds = v.rel.d ? v.rel.d.split(/\s+and\s+/).map((q: string) => cm(q, M.macros)) : v.graph && v.gd ? v.gd : X.dist;
      if (!ds.every(isFinite)) { unreadable.add(v.name); warn(`The distance in ${dir}=${v.rel.d} of ${v.rel.of} isn't one the drawing understands: the vertex is drawn where it might go`); continue; }
      let dy = ds[0], dx = ds.length > 1 ? ds[1] : ds[0];
      if (diag && ds.length < 2) { dx *= 0.707106781; dy *= 0.707106781; }
      const sx = /right/.test(dir) ? 1 : /left/.test(dir) ? -1 : 0, sy = /above/.test(dir) ? 1 : /below/.test(dir) ? -1 : 0;
      let x = bx + sx * dx * X.u, y = by + sy * dy * X.u;
      // off grid (a \feynmandiagram, which is no environment), or from a coordinate: the reference's anchor that way
      // and the new node's on the other side
      const R = geo.get(v.rel.of), N = geo.get(v.name);
      if (!M.fd ? R && R.kind === 'coord' : true) {
        const [rx, ry] = R ? anchorOff(R, sx, sy) : [0, 0], [ax, ay] = N ? anchorOff(N, sx, sy) : [0, 0];
        x += (rx + ax) / PX; y += (ry + ay) / PX;
      }
      // a node the diagram makes is moved on by its column and row as well
      if (v.graph && v.gx != null) { x += X.u * v.gx; y -= X.u * v.gy; }
      at.set(v.name, [x, y]); moved = true;
    }
    if (!moved) break;
  }
  // the rest: next to what they are joined to, or in a row under the drawing
  const loose = M.vertices.filter((v: any) => !at.has(v.name));
  M.loose = new Set(loose.map((v: any) => v.name));
  if (loose.length) {
    const DIST = X.sz.dist;
    warn(loose.length === 1 ? `The vertex "${loose[0].name}" has no position: it is drawn where it might go. Give it at (x,y) (moving it in the editor does)` : `${loose.length} vertices have no position: they are drawn where they might go. Give them at (x,y) (moving them in the editor does)`);
    const pts = [...at.values()], cx = pts.length ? pts.reduce((a, p) => a + p[0], 0) / pts.length : 0, cy = pts.length ? pts.reduce((a, p) => a + p[1], 0) / pts.length : 0;
    for (let pass = 0; pass < 4; pass++) for (const v of loose) {
      if (at.has(v.name)) continue;
      const nb = M.edges.filter((e: any) => e.a === v.name || e.b === v.name).map((e: any) => (e.a === v.name ? e.b : e.a)).filter((n: any) => at.has(n)).map((n: any) => at.get(n));
      if (!nb.length) continue;
      const mx = nb.reduce((a: any, p: any) => a + p[0], 0) / nb.length, my = nb.reduce((a: any, p: any) => a + p[1], 0) / nb.length;
      let ux = mx - cx, uy = my - cy;
      const l = Math.hypot(ux, uy);
      if (l < 1e-6) { ux = 1; uy = 0; } else { ux /= l; uy /= l; }
      let p = [mx + ux * DIST, my + uy * DIST];
      while ([...at.values()].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.3)) p = [p[0] + 0.5, p[1] - 0.5];
      at.set(v.name, p);
    }
    let x0 = pts.length ? Math.min(...pts.map((p) => p[0])) : 0, y0 = pts.length ? Math.min(...pts.map((p) => p[1])) - DIST : 0;
    for (const v of loose) if (!at.has(v.name)) { at.set(v.name, [x0, y0]); x0 += DIST; }
  }
  return at;
}

// a path as a polyline with its lengths: point and direction at any distance along it
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
  // left of the direction of travel (y down on screen)
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty, nx: ty, ny: -tx };
}
const ptsD = (pts: any) => pts.map((p: any, i: any) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');

// how far a vertex's border is from its centre in direction (ux, uy)
function reach(n: any, ux: any, uy: any) {
  if (!n.r && !n.hw) return 0;
  if (n.r) return n.r;
  const ax = Math.abs(ux), ay = Math.abs(uy);
  return Math.min(ax > 1e-9 ? n.hw / ax : Infinity, ay > 1e-9 ? n.hh / ay : Infinity);
}
// how far above its box's middle a text is drawn (px, y down: subtract from y). The drawing centres the measured box,
// which suits a capital (height 0.694em, no depth); TeX centres the node's box on the text's height and depth
const lift = (hd: any, em: number) => (hd.dp - hd.ht) / 2 + 0.347 * em;

// the options the diagram is drawn under: the environment's; for a \feynmandiagram the picture's, then the graph's
// sizes (its other keys are the graph's, read with the edges)
const envText = (M: any) => (M.fd && M.fd.length > 1 ? [M.fd[0], ...opts(M.fd[1]).filter((x) => /^(small|medium|large)$/.test(kv(x).k))].filter(Boolean).join(', ') : M.env);
function build(src: any, wrap = '', macros?: Record<string, string>) {
  const M = parse(src, macros);
  const warnings = M.warnings.slice(), warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const X = envOf(wrap, envText(M), warn, M.macros), S = X.sz, u = X.nu;
  const em = TEXT.size, TS = { ...TEXT, size: TEXT.size * u };
  const geo = new Map();
  for (const v of M.vertices) geo.set(v.name, shapeOf(v, X));
  const at = place(M, X, geo, warn);
  const nodes = new Map(), texts = [], shapes = [], paths: any[] = [], edges: any[] = [], bbx: number[][] = [];
  // vertices
  for (const v of M.vertices) {
    const p = at.get(v.name), x = p[0] * PX, y = -p[1] * PX, g = geo.get(v.name);
    const n = { name: v.name, x, y, style: g.st, kind: g.kind, r: g.r || 0, hw: g.hw || 0, hh: g.hh || 0 };
    if (g.t) texts.push({ t: g.t, x, y: y - lift(g.hd, em) * u, b: g.b, st: TS });
    if (g.st) shapes.push({ kind: g.st, x, y, r: g.st === 'blob' ? g.r - OUTER * u : g.st === 'square dot' ? g.hw : g.r });
    if (g.disc) shapes.push({ kind: 'disc', x, y, r: g.disc.r, fill: g.disc.fill, stroke: g.disc.stroke });
    // label=above:text
    for (const it of v.o) {
      const { k, v: val } = kv(it);
      if (k !== 'label' || val == null) continue;
      const raw = unbrace(val), m = /^(above left|above right|below left|below right|above|below|left|right|-?[\d.]+)\s*:\s*([\s\S]*)$/.exec(raw);
      const dir = m ? m[1] : 'above', t = shown(unbrace(m ? m[2] : raw)), b = TD.textBox(t, TS);
      const ang = { right: 0, 'above right': 45, above: 90, 'above left': 135, left: 180, 'below left': 225, below: 270, 'below right': 315 }[dir] ?? parseFloat(dir);
      const ux = Math.cos((ang * Math.PI) / 180), uy = -Math.sin((ang * Math.PI) / 180);
      const d = reach(n, ux, uy) + INNER * u + Math.abs(ux) * ((b.w - 2) / 2) + Math.abs(uy) * (0.4 * b.h);
      texts.push({ t, x: x + ux * d, y: y + uy * d, b, st: TS });
    }
    nodes.set(v.name, n);
  }
  // edges
  M.edges.forEach((e: any, idx: any) => {
    // (the sizes the diagram's own small or large give its edges)
    const S = e.sz ? SIZES[e.sz] : X.sz, arrowK = S.arrow / ARROW.size;
    const AR = { ahead: (ARROW.ahead + ARROW.back) * arrowK - ARROW.back, len: ARROW.len * arrowK, half: ARROW.half * arrowK };
    const R = readEdgeOpts([...(e.pre || []), ...e.o], null, M.macros);
    // (a loop goes from its start back to it, whatever the edge's end)
    const A = nodes.get(e.a), B = R.loop ? A : nodes.get(e.b);
    if (!A || !B) return;
    const ink = R.color || X.color, op = R.opacity < 1 ? R.opacity : null;
    let pts, ctrl: any = null;
    const dx = B.x - A.x, dy = B.y - A.y, base = Math.atan2(-dy, dx) * 180 / Math.PI; // maths angle, y up
    if (e.a === e.b && !e.loop) { warn('An edge from a vertex to itself written with (…) isn\'t drawn, as TikZ\'s \\graph leaves it out'); return; }
    if (A === B && (R.out == null || R.in == null)) { warn('A loop is drawn here only with its out= and in='); return; }
    const curved = R.bend != null || R.out != null || R.in != null;
    if (!curved) {
      const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      const ra = reach(A, ux, uy), rb = reach(B, -ux, -uy);
      pts = [[A.x + ux * ra, A.y + uy * ra], [B.x - ux * rb, B.y - uy * rb]];
    } else {
      // relative (bend, half, quarter): out and in from the line's direction; else out= and in= are the page's
      const rel = R.relative ? base : 0;
      const outA = R.out != null ? rel + R.out : base + (R.bend || 0), inA = R.in != null ? rel + R.in : base + 180 - (R.bend || 0);
      const u1 = [Math.cos(outA * Math.PI / 180), -Math.sin(outA * Math.PI / 180)], u2 = [Math.cos(inA * Math.PI / 180), -Math.sin(inA * Math.PI / 180)];
      const p0 = [A.x + u1[0] * reach(A, u1[0], u1[1]), A.y + u1[1] * reach(A, u1[0], u1[1])];
      const p3 = [B.x + u2[0] * reach(B, u2[0], u2[1]), B.y + u2[1] * reach(B, u2[0], u2[1])];
      // the controls' distance: looseness × 0.3915 × the chord, within min distance and max distance
      const d = Math.min(R.maxD, Math.max(R.minD, R.loose * 0.3915 * Math.hypot(p3[0] - p0[0], p3[1] - p0[1])));
      const c1 = [p0[0] + u1[0] * d, p0[1] + u1[1] * d], c2 = [p3[0] + u2[0] * d, p3[1] + u2[1] * d];
      ctrl = [c1, c2];
      pts = [];
      for (let k = 0; k <= 64; k++) {
        const t = k / 64, m = 1 - t;
        pts.push([m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]]);
      }
    }
    const P = polyline(pts), L = P.len;
    // the line's width: its own, else the picture's or the environment's, else thick on large's graph edges
    const width = R.width ?? X.width ?? (S.thick ? 0.8 * PT : LW);
    const sw = R.type === 'ghost' ? Math.max(width, 0.8 * PT) : width;
    // the line itself
    let line;
    if (R.type === 'photon' || /boson$/.test(R.type)) {
      const n = Math.max(1, Math.round(L / WAVE.per)), per = L / n, out = [];
      for (let j = 0; j <= 12 * n; j++) { const q = along(P, (j * per) / 12), o = WAVE.amp * Math.sin((2 * Math.PI * j) / 12); out.push([q.x + q.nx * o, q.y + q.ny * o]); }
      line = ptsD(out);
    } else if (R.type === 'gluon') {
      const span = L - 2 * COIL.rx, N = Math.max(1, Math.round(span / COIL.per - 0.5)), per = span / (N + 0.5), out = [];
      const steps = Math.ceil((N + 0.5) * 24);
      for (let j = 0; j <= steps; j++) {
        const ph = -Math.PI / 2 + (2 * Math.PI * (N + 0.5) * j) / steps;
        const s = (per * (ph + Math.PI / 2)) / (2 * Math.PI) + COIL.rx * (1 + Math.sin(ph));
        const q = along(P, s), o = -COIL.amp * Math.cos(ph);
        out.push([q.x + q.nx * o, q.y + q.ny * o]);
      }
      line = ptsD(out);
    } else {
      line = ptsD(pts);
      // (pgf's bounding box takes a curve's controls, and half its line)
      if (ctrl) for (const c of ctrl) bbx.push([c[0], c[1], (R.double ? 2 * sw + R.double.dist : sw) / 2]);
    }
    const dash = R.dash !== undefined ? R.dash || '' : /scalar$/.test(R.type) ? 'dash' : R.type === 'ghost' ? 'dot' : '';
    if (R.nodraw) { /* not stroked */ } else if (R.double) paths.push({ d: line, sw: 2 * sw + R.double.dist, dash, color: ink, op, edge: idx }, { d: line, sw: R.double.dist, dash, color: R.double.color, op });
    else paths.push({ d: line, sw, dash, color: ink, op, edge: idx });
    // arrows
    const arrows = [];
    if (R.type === 'fermion' || R.type === 'charged boson' || R.type === 'charged scalar') arrows.push([0.5, 1]);
    if (R.type === 'anti fermion' || R.type === 'anti charged boson' || R.type === 'anti charged scalar') arrows.push([0.5, -1]);
    if (R.type === 'majorana') arrows.push([0.33, 1], [0.73, -1]);
    if (R.type === 'anti majorana') arrows.push([0.33, -1], [0.73, 1]);
    // with arrow=…: a fraction of the way, or a length from the start (from the end when negative)
    for (const a of R.arrows) arrows.push([a.len ? (a.at >= 0 ? a.at : L * K + a.at) / (L * K || 1) : a.at, a.dir]);
    for (const [pos, dir] of arrows) {
      const q = along(P, pos * L), tx = q.tx * dir, ty = q.ty * dir;
      const tip = [q.x + tx * AR.ahead, q.y + ty * AR.ahead], bk = [tip[0] - tx * AR.len, tip[1] - ty * AR.len];
      shapes.push({ kind: 'tri', color: ink, op, d: `M${r2(tip[0])},${r2(tip[1])}L${r2(bk[0] + q.nx * AR.half)},${r2(bk[1] + q.ny * AR.half)}L${r2(bk[0] - q.nx * AR.half)},${r2(bk[1] - q.ny * AR.half)}Z` });
    }
    for (const pos of R.ins) {
      const q = along(P, pos * L), a = S.ins * PT;
      const c = (u: any, v: any) => [q.x + q.tx * u + q.nx * v, q.y + q.ty * u + q.ny * v];
      const p1 = c(-a, -a), p2 = c(a, a), p3 = c(-a, a), p4 = c(a, -a);
      paths.push({ d: `M${r2(p1[0])},${r2(p1[1])}L${r2(p2[0])},${r2(p2[1])}M${r2(p3[0])},${r2(p3[1])}L${r2(p4[0])},${r2(p4[1])}`, sw: LW, color: ink, op });
    }
    // momentum arrows: parallel to the edge, 3mm to its left (or right), the label beyond
    for (const m of R.mom) {
      const o = m.side * m.dist, out = [];
      for (let j = 0; j <= 50; j++) { const q = along(P, (m.shorten + ((1 - 2 * m.shorten) * j) / 50) * L); out.push([q.x + q.nx * o, q.y + q.ny * o]); }
      if (m.rev) out.reverse();
      const MP = polyline(out), Lm = MP.len, end = along(MP, Lm);
      const back = (d: any) => [end.x - end.tx * d, end.y - end.ty * d];
      const shaft = out.filter((p, j) => MP.cum[j] < Lm - 2.5 * PT).concat([back(2.5 * PT)]);
      paths.push({ d: ptsD(shaft), sw: LW, color: ink, op });
      const tip = [end.x, end.y], b1 = back(3.58 * PT), b2 = back(2.41 * PT), hw = 1.35 * PT;
      shapes.push({ kind: 'tri', color: ink, op, d: `M${r2(tip[0])},${r2(tip[1])}L${r2(b1[0] + end.nx * hw)},${r2(b1[1] + end.ny * hw)}L${r2(b2[0])},${r2(b2[1])}L${r2(b1[0] - end.nx * hw)},${r2(b1[1] - end.ny * hw)}Z` });
      if (m.t) {
        const mid = along(MP, Lm / 2), side = m.side * (m.rev ? -1 : 1);
        texts.push({ ...labelAt(m.t, mid, side, 0, TS, u), color: ink, op });
      }
    }
    for (const lb of R.labels) if (lb.t) texts.push({ ...labelAt(lb.t, along(P, L / 2), lb.side, OUTER, TS, u), color: ink, op });
    edges.push({ i: idx, a: e.a, b: e.b, d: ptsD(pts), P, type: R.type, R });
  });
  // bounding box
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const p of paths) for (const m of p.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) { const x = +m[1], y = +m[2], h = (p.sw || LW) / 2; ext(x - h, y - h, x + h, y + h); }
  for (const s of shapes) {
    if (s.kind === 'tri') { for (const m of (s as any).d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1], +m[2], +m[1], +m[2]); }
    else ext(s.x - s.r - LW / 2, s.y - s.r - LW / 2, s.x + s.r + LW / 2, s.y + s.r + LW / 2); // (half the outline)
  }
  for (const t of texts) ext(t.x - t.b.w / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
  for (const n of nodes.values()) ext(n.x, n.y, n.x, n.y);
  for (const [x, y, h] of bbx) ext(x - h, y - h, x + h, y + h);
  if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 2 * PX; y2 = PX; }
  if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
  if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
  return { M, X, nodes, edges, paths, shapes, texts, warnings, ink: X.color, empty: !M.vertices.length, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}
// a label beside a path, as TikZ's auto anchor puts it: by the corner of its node away from the line (by a side when
// the line's normal is within 0.05 of an axis), inner sep and outer sep round its text
function labelAt(t: any, q: any, side: any, outer: number, st: any, u: number) {
  t = shown(t);
  const b = TD.textBox(t, st), em = TEXT.size * u, hd = textHD(t, b, em);
  const nx = q.nx * side, ny = -q.ny * side; // (y up)
  const sx = nx > 0.05 ? 1 : nx < -0.05 ? -1 : 0, sy = sx === 0 ? (ny > 0 ? 1 : -1) : ny > 0.05 ? 1 : ny < -0.05 ? -1 : 0;
  const hw = (b.w - 2) / 2 + (INNER + outer) * u, hh = (hd.ht + hd.dp) / 2 + (INNER + outer) * u;
  return { t, x: q.x + sx * hw, y: q.y - sy * hh - lift(hd, em), b, st };
}

// ---------------------------------------------------------------- drawing
// the north west lines of a blob, clipped to its circle
function hatch(x: any, y: any, r: any, ink: any, id?: any) {
  let d = '';
  const g = 3 * PT;
  for (let k = -r * 2; k <= r * 2; k += g) {
    // lines x - y = k (screen): from upper left to lower right
    const half = Math.sqrt(Math.max(0, r * r - (k * k) / 2));
    if (!half) continue;
    const cx = x + k / 2, cy = y - k / 2;
    d += `M${r2(cx - half * Math.SQRT1_2)},${r2(cy - half * Math.SQRT1_2)}L${r2(cx + half * Math.SQRT1_2)},${r2(cy + half * Math.SQRT1_2)}`;
  }
  return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
}
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const own = Lo.ink || s.color || '#000000', ink = TD.css(own), paper = ctx.paper || '#ffffff';
  const opa = (o: any) => (o != null ? ` opacity="${r2(o)}"` : '');
  let out = '';
  if (Lo.empty) {
    const b = Lo.bb;
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty Feynman diagram', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  for (const p of Lo.paths) {
    const col = p.color ? TD.css(p.color) : ink;
    const dash = Array.isArray(p.dash) ? ` stroke-dasharray="${r2(p.dash[0] * PT)} ${r2(p.dash[1] * PT)}"` : p.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : p.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT + p.sw)}" stroke-linecap="round"` : '';
    out += `<path d="${p.d}" fill="none" stroke="${col}" stroke-width="${r2(p.sw)}" stroke-linejoin="round"${dash}${opa(p.op)}/>`;
  }
  for (const sh of Lo.shapes) {
    const col = sh.color ? TD.css(sh.color) : ink;
    if (sh.kind === 'tri') { out += `<path d="${sh.d}" fill="${col}" stroke="none"${opa(sh.op)}/>`; continue; }
    if (sh.kind === 'disc') {
      const c = (v: any) => (v == null ? 'none' : v === 'currentColor' ? ink : TD.css(v));
      out += `<circle cx="${r2(sh.x)}" cy="${r2(sh.y)}" r="${r2(sh.r)}" fill="${c(sh.fill)}" stroke="${c(sh.stroke)}" stroke-width="${r2(LW)}"/>`;
      continue;
    }
    const { x, y, r } = sh;
    if (sh.kind === 'dot') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${ink}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
    else if (sh.kind === 'empty dot') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
    else if (sh.kind === 'square dot') out += `<rect x="${r2(x - r)}" y="${r2(y - r)}" width="${r2(2 * r)}" height="${r2(2 * r)}" fill="${ink}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
    else if (sh.kind === 'crossed dot') {
      const a = r * Math.SQRT1_2;
      out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="${ink}" stroke-width="${r2(LW)}"/><path d="M${r2(x - a)},${r2(y - a)}L${r2(x + a)},${r2(y + a)}M${r2(x - a)},${r2(y + a)}L${r2(x + a)},${r2(y - a)}" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
    } else if (sh.kind === 'blob') out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${paper}" stroke="none"/>${hatch(x, y, r, ink)}<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/>`;
  }
  for (const t of Lo.texts) {
    const svg = TD.textSvg(t.t, t.st || TEXT, t.color || own, t.x, t.y, ctx);
    out += t.op != null ? `<g${opa(t.op)}>${svg}</g>` : svg;
  }
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

// \feynmandiagram[#1][#2]{…}: its option groups, its body and where it ends, or null
function fdParts(t: string) {
  const m = /^\s*\\feynmandiagram(?![A-Za-z@])/.exec(t);
  if (!m) return null;
  let i = skip(t, m[0].length);
  const og: string[] = [];
  while (t[i] === '[' && og.length < 2) { const e = close(t, i); if (e < 0) return null; og.push(t.slice(i + 1, e).trim()); i = skip(t, e + 1); }
  if (t[i] !== '{') return null;
  const e = close(t, i);
  if (e < 0) return null;
  let end = skip(t, e + 1);
  if (t[end] === ';') end++;
  return { og, body: t.slice(i + 1, e), end };
}
// the code as it goes in a picture: a \feynmandiagram is a picture of its own (\tikz), so in one it is written as
// the same graph in a feynman environment: \begin{feynman}[#1] \diagram[#2]{…}; \end{feynman}
function fullCode(src: any) {
  const t = String(src || '').trim();
  if (/\\begin\{feynman\}/.test(t)) return t;
  const F = fdParts(t);
  if (F) return `\\begin{feynman}${F.og[0] ? `[${F.og[0]}]` : ''}\n\\diagram${F.og.length ? ` [${F.og[F.og.length > 1 ? 1 : 0]}]` : ''} {${F.body}};\n\\end{feynman}`;
  return `\\begin{feynman}\n${t}\n\\end{feynman}`;
}

// a small drawing of a snippet (palette previews)
TD.feynMini = (src: any, maxH = 30) => {
  const s = { type: 'feynman', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
  return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
};

TD.TYPES.feynman = {
  name: 'Feynman diagram',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'feynman', x: p.x, y: p.y, src: TD.FEYN_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the diagram's own coordinates, in a scope moved to where the drawing sits
  tikz(s: any, X: any) {
    X.pkgs.add('tikz-feynman');
    // (and the options of the picture and scopes it was drawn in: scale, transform shape, line width)
    const b = layout(s).bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`, ...(s.wrap ? [s.wrap] : [])];
    const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    if (col) o.push(`color=${col}`);
    return `\\begin{scope}[${o.join(', ')}]\n${fullCode(s.src)}\n\\end{scope}`;
  },
};


// for the visual editor (src/editors/fyeditor.ts)
// The drawing statements in the environment (\draw, \node, \path …) the importer can read as the picture's own, drawn
// after the diagram: not when the environment moves or scales what is in it, nor one that places by `of` (the
// environment is on grid) or makes a name the diagram uses. { src: the code without them, moved: [statement] } or null
function movable(src: any) {
  const t = String(src || ''), M = parse(t);
  if (!M.drawing.length || M.fd) return null;
  const X = envOf('', M.env, () => {}, M.macros);
  if (X.k !== 1 || X.ox || X.oy || X.ts) return null;
  const known = new Set(M.vertices.filter((v: any) => !v.ref).map((v: any) => v.name)), wanted = new Set<string>();
  for (const v of M.vertices) { if (v.ref) wanted.add(v.name); for (const n of [v.rel?.of, v.at, ...calcNames(v.calc)]) if (n && !known.has(n)) wanted.add(n); }
  // (a \path that draws nothing stays: it only reaches the bounding box)
  const moved = M.drawing.filter((d: any) => !/\bof\b/.test(d.st) && !(/^\\path\b/.test(d.st) && !/\b(draw|fill|node|coordinate)\b/.test(d.st)) && ![...wanted].some((nm) => new RegExp(`\\(\\s*${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)`).test(d.st)));
  if (!moved.length) return null;
  let out = t;
  for (const d of [...moved].reverse()) out = out.slice(0, d.start) + out.slice(d.end).replace(/^[ \t]*\n?/, '');
  return { src: out, moved: moved.map((d: any) => t.slice(d.start, d.end)) };
}
// a node's place (px on the page) in the environment's own coordinates, as `at (x,y)` writes it
const envXY = (L: any, n: any) => [(n.x / PX - L.X.ox) / L.X.k, (-n.y / PX - L.X.oy) / L.X.k];
TD.feyn = { envXY, movable, parse, write, layout, draw, along, polyline, readEdgeOpts, kv, opts, unbrace, styleOf, fullCode, fdParts, shown, num, EDGE_TYPES, VERTEX_STYLES, TEXT };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("feynman", {
  menu: { order: 7, group: 'quantum', label: "Feynman", title: "Feynman diagram, written for tikz-feynman", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M3 3l7 9-7 9M29 3l-7 9 7 9\"/><path d=\"M10 12c1-2.5 2-2.5 3 0s2 2.5 3 0 2-2.5 3 0 2 2.5 3 0\" class=\"a1\"/><path d=\"M5.6 6.4l2.2.2-.3-2.2M7.5 19.6l-2.2.2.3-2.2\" /></svg>" },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.feynEditor, alias: "feynOpen", layout: (s) => TD.feyn.layout(s) }
});
export { layout, fullCode };
