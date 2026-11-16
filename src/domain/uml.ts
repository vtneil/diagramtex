import { measurementElement } from './measurement';
export let panelServices: any;
import { runtime as TD } from '../runtime';
// UML class diagrams written for pgf-umlcd. The source is the object: a tikzpicture of class, interface,
// abstractclass, staticclass and object environments (\attribute, \operation, \inherit, \implement,
// \instanceOf), \association, \unidirectionalAssociation, \aggregation and \composition between them, \umlnote
// notes, package environments and plain \draw lines (dependencies, links to notes). It is drawn here at
// pgf-umlcd's own sizes (split rectangles with 5cm text width by default, 0.3333em inner sep, purple on
// yellow!20, the old angle 90, open triangle 45 and diamond tips), and exported unchanged, its tikzpicture
// turned into a scope shifted to where the drawing sits. The visual editor (src/editors/umleditor.ts) reads
// the code into a model and writes it back.
(function () {
  const { r2 } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K, CMPT = 28.45274;

  TD.UML_DEFAULT = [
    '\\begin{tikzpicture}',
    '  \\begin{abstractclass}[text width=3.6cm]{Shape}{0,0}',
    '    \\attribute{- name : String}',
    '    \\operation[0]{+ area() : double}',
    '  \\end{abstractclass}',
    '  \\begin{class}[text width=3.2cm]{Circle}{-2.2,-3.4}',
    '    \\inherit{Shape}',
    '    \\attribute{- radius : double}',
    '    \\operation{+ area() : double}',
    '  \\end{class}',
    '  \\begin{class}[text width=3.2cm]{Square}{2.2,-3.4}',
    '    \\inherit{Shape}',
    '    \\attribute{- side : double}',
    '    \\operation{+ area() : double}',
    '  \\end{class}',
    '\\end{tikzpicture}',
  ].join('\n');

  // pgf-umlcd's sizes, in pt (10pt document)
  const LW = 0.4, INNER = 3.3333, OSEP = LW / 2, LINE = 12, TW = 5 * CMPT, MINW = 2 * CMPT, NOTE_TW = 4 * CMPT, FOLD = 10;
  const PKG_SEP = 0.5 * CMPT;
  const TEXT = { size: 10 * PT, font: 'default' };
  const COLORS = { draw: 'purple', fill: 'yellow!20', text: 'black' };
  const KINDS = ['class', 'interface', 'abstractclass', 'staticclass', 'object'];
  const STEREO: Record<string, string> = { interface: 'interface', abstractclass: 'abstract', staticclass: 'static' };
  const RELS: Record<string, number> = { association: 6, unidirectionalAssociation: 4, aggregation: 4, composition: 4 };

  // ---------------------------------------------------------------- reading the code
  function close(s: string, i: number): number {
    const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, string>)[open];
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
  function split(s: string, sep = ',') {
    const out: string[] = [];
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
  const opts = (s: any) => split(String(s || '')).map((x) => x.trim()).filter(Boolean);
  const kv = (it: string) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null as string | null }; };
  const unbrace = (v: any) => { v = String(v ?? '').trim(); while (v[0] === '{' && close(v, 0) === v.length - 1) v = v.slice(1, -1).trim(); return v; };
  const stripComments = (s: string) => s.replace(/(^|[^\\])%.*$/gm, '$1');
  const skip = (s: string, i: number) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  function nextSemi(s: string, i: number) {
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
    return ({ cm: n, mm: n / 10, pt: n / CMPT, em: (n * 10) / CMPT, ex: (n * 4.3) / CMPT, in: n * 2.54, bp: (n * 2.54) / 72 } as Record<string, number>)[m[2] || 'cm'] ?? n;
  }
  function xy(t: string): [number, number] | null {
    const p = split(unbrace(t).replace(/^\(|\)$/g, ''));
    if (p.length !== 2) return null;
    const x = cm(p[0]), y = cm(p[1]);
    return isFinite(x) && isFinite(y) ? [x, y] : null;
  }
  // brace groups and an optional [..] at i: { o, args, end }
  function args(s: string, i: number, n: number, opt = true) {
    let o: string | null = null;
    i = skip(s, i);
    if (opt && s[i] === '[') { const e = close(s, i); if (e < 0) return null; o = s.slice(i + 1, e); i = e + 1; }
    const a: string[] = [];
    for (let k = 0; k < n; k++) {
      i = skip(s, i);
      if (s[i] !== '{') return null;
      const e = close(s, i);
      if (e < 0) return null;
      a.push(s.slice(i + 1, e)); i = e + 1;
    }
    return { o, args: a, end: i };
  }
  const short = (st: string) => { st = st.replace(/\s+/g, ' ').trim(); return st.length > 40 ? st.slice(0, 40) + '…' : st; };

  // The model: { env (picture options, or null when there is no tikzpicture around the code), items, warnings }
  // items, in the order of the code:
  //   class   { k: 'class', env (class | interface | abstractclass | staticclass | object), o (options as written),
  //             name, x, y (cm, or null with pos as written), attrs: [text], ops: [{ t, n (the optional argument, '0' is abstract) }],
  //             inherits: [name], implements: [name], instanceOf, extra: [statement] }
  //   rel     { k: 'rel', cmd, o, a, b, ra, ma (role and multiplicity at a, association only), rb, mb }
  //   note    { k: 'note', o, name, x, y, text }
  //   draw    { k: 'draw', cmd, o, a, b, op ('--' | '-|' | '|-'), labels: [{ o, t, after (the step it follows: 0 or 1) }] }
  //   color   { k: 'color', which (draw | fill | text), v, def (written with \def) }
  //   school  { k: 'school' }
  //   pkg     { k: 'pkg', name }   and   endpkg { k: 'endpkg' }
  //   raw     { k: 'raw', t }
  function parse(src: any) {
    const warnings: string[] = [], warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
    const t = stripComments(String(src || ''));
    const bm = /\\begin\{tikzpicture\}\s*/.exec(t);
    let body = t, env: string | null = null;
    if (bm) {
      let i = bm.index + bm[0].length;
      env = '';
      if (t[i] === '[') { const e = close(t, i); if (e > 0) { env = t.slice(i + 1, e).trim(); i = e + 1; } }
      const em = t.lastIndexOf('\\end{tikzpicture}');
      if (em < i) warn('\\end{tikzpicture} is missing');
      body = t.slice(i, em < i ? t.length : em);
    }
    const M: any = { env, items: [], warnings };
    let i = 0, depth = 0;
    while (i < body.length) {
      i = skip(body, i);
      if (i >= body.length) break;
      const rest = body.slice(i);
      let m = /^\\begin\s*\{(\w+)\}/.exec(rest);
      if (m && KINDS.includes(m[1])) {
        const endTag = `\\end{${m[1]}}`, a = args(body, i + m[0].length, 2);
        const e = body.indexOf(endTag, i);
        if (!a || e < 0) { warn(`\\begin{${m[1]}} needs {name}{x,y} and an \\end{${m[1]}}`); i = e < 0 ? body.length : e + endTag.length; continue; }
        M.items.push(readClass(m[1], a, body.slice(a.end, e), warn));
        i = e + endTag.length;
        continue;
      }
      if (m && m[1] === 'package') {
        const a = args(body, i + m[0].length, 1, false);
        if (!a) { warn('\\begin{package} needs a {name}'); i += m[0].length; continue; }
        if (depth) warn('Packages inside packages are not drawn here (pgf-umlcd does not nest them either)');
        depth++;
        M.items.push({ k: 'pkg', name: a.args[0].trim() });
        i = a.end;
        continue;
      }
      if (/^\\end\s*\{package\}/.test(rest)) { M.items.push({ k: 'endpkg' }); depth = Math.max(0, depth - 1); i += /^\\end\s*\{package\}/.exec(rest)![0].length; continue; }
      m = /^\\(association|unidirectionalAssociation|aggregation|composition)(?![A-Za-z])/.exec(rest);
      if (m) {
        const a = args(body, i + m[0].length, RELS[m[1]]);
        if (!a) { warn(`\\${m[1]} needs ${RELS[m[1]]} {…} arguments`); i += m[0].length; continue; }
        const g = a.args.map((x) => x.trim());
        M.items.push(m[1] === 'association'
          ? { k: 'rel', cmd: m[1], o: a.o, a: g[0], ra: g[1], ma: g[2], b: g[3], rb: g[4], mb: g[5] }
          : { k: 'rel', cmd: m[1], o: a.o, a: g[0], ra: '', ma: '', b: g[3], rb: g[1], mb: g[2] });
        i = a.end;
        continue;
      }
      m = /^\\(renewcommand\s*\{?\s*|def\s*)\\uml(draw|fill|text)color\s*\}?/.exec(rest);
      if (m) {
        const a = args(body, i + m[0].length, 1, false);
        if (a) { M.items.push({ k: 'color', which: m[2], v: a.args[0].trim(), def: m[1].startsWith('def') }); i = a.end; continue; }
      }
      if (/^\\switchUmlcdSchool(?![A-Za-z])/.test(rest)) { M.items.push({ k: 'school' }); i += 18; continue; }
      if (/^\\(umlnote|draw|path|node|fill|filldraw|coordinate|clip|shade|foreach|matrix|pic)(?![A-Za-z])/.test(rest)) {
        const e = nextSemi(body, i), st = body.slice(i, e + 1).trim();
        i = e + 1;
        if (/^\\umlnote/.test(st)) { const n = readNote(st, warn); if (n) { M.items.push(n); continue; } }
        else if (/^\\(draw|path)/.test(st)) { const d = readDraw(st); if (d) { M.items.push(d); continue; } }
        M.items.push({ k: 'raw', t: st });
        warn(`"${short(st)}" isn't drawn here (it is kept in the code)`);
        continue;
      }
      // any other command, with its arguments; text that is not a command
      m = /^\\([A-Za-z@]+|.)/.exec(rest);
      let e = i + (m ? m[0].length : 1);
      if (m) for (;;) { const q = skip(body, e); if (body[q] === '{' || body[q] === '[') { const c = close(body, q); if (c < 0) break; e = c + 1; } else break; }
      else { const n = body.slice(i).search(/\\/); e = n < 0 ? body.length : i + Math.max(1, n); }
      if (body[skip(body, e)] === ';') e = skip(body, e) + 1;
      const st = body.slice(i, e).trim();
      i = e;
      if (!st) continue;
      M.items.push({ k: 'raw', t: st });
      if (!/^\\(tikzset|definecolor|colorlet|pgfdeclarelayer|pgfsetlayers|newcommand|renewcommand|def|let|small|footnotesize|scriptsize)\b/.test(st)) warn(`"${short(st)}" isn't drawn here (it is kept in the code)`);
    }
    // names: each class once; relations and inheritance between classes that exist
    const names = new Map<string, number>();
    M.items.forEach((it: any, k: number) => {
      if (it.k !== 'class' && it.k !== 'note') return;
      if (!it.name) return;
      if (names.has(it.name)) warn(`Two classes are called "${it.name}"`);
      names.set(it.name, k);
    });
    M.items.forEach((it: any, k: number) => {
      const need = (n: string, what: string) => {
        if (!n) return;
        const at = names.get(n.replace(/\.[a-z ]+$/, ''));
        if (at == null) { if (!/^\(?-?[\d.]/.test(n)) warn(`"${n}" is used in ${what} but there is no class with that name`); }
        else if (at > k) warn(`"${n}" is used in ${what} before it is defined: pgf-umlcd needs it earlier in the code`);
      };
      if (it.k === 'class') { for (const p of it.inherits) need(p, `\\inherit in "${it.name}"`); for (const p of it.implements) need(p, `\\implement in "${it.name}"`); }
      if (it.k === 'rel') { need(it.a, `\\${it.cmd}`); need(it.b, `\\${it.cmd}`); }
      if (it.k === 'draw') { need(it.a, 'a line'); need(it.b, 'a line'); }
    });
    return M;
  }
  function readClass(env: string, a: any, inner: string, warn: (w: string) => void) {
    const p = xy(a.args[1]);
    const c: any = { k: 'class', env, o: a.o == null ? null : a.o.trim(), name: a.args[0].trim(), x: p ? p[0] : null, y: p ? p[1] : null, pos: p ? null : a.args[1].trim(),
      attrs: [], ops: [], inherits: [], implements: [], instanceOf: null, extra: [] };
    if (!p) warn(`The position {${a.args[1].trim()}} of "${c.name}" isn't one the drawing understands; use {x,y}`);
    let i = 0;
    while (i < inner.length) {
      i = skip(inner, i);
      if (i >= inner.length) break;
      const m = /^\\(attribute|operation|inherit|implement|instanceOf)(?![A-Za-z])/.exec(inner.slice(i));
      if (m) {
        const g = args(inner, i + m[0].length, 1, m[1] === 'operation');
        if (g) {
          const v = g.args[0];
          if (m[1] === 'attribute') c.attrs.push(v.trim());
          else if (m[1] === 'operation') c.ops.push({ t: v.trim(), n: g.o == null ? null : g.o.trim() });
          else if (m[1] === 'inherit') c.inherits.push(...opts(v));
          else if (m[1] === 'implement') c.implements.push(...opts(v));
          else c.instanceOf = v.trim();
          i = g.end;
          continue;
        }
      }
      // anything else in the environment is kept as written
      const n = /^\\([A-Za-z@]+|.)/.exec(inner.slice(i));
      let e = i + (n ? n[0].length : 1);
      if (n) for (;;) { const q = skip(inner, e); if (inner[q] === '{' || inner[q] === '[') { const k = close(inner, q); if (k < 0) break; e = k + 1; } else break; }
      else { const k = inner.slice(i).search(/\\/); e = k < 0 ? inner.length : i + Math.max(1, k); }
      const st = inner.slice(i, e).trim();
      i = e;
      if (st) { c.extra.push(st); warn(`"${short(st)}" in "${c.name}" isn't drawn here (it is kept in the code)`); }
    }
    if (c.instanceOf != null && env !== 'object') warn(`\\instanceOf only shows in an object ("${c.name}" is a ${env})`);
    return c;
  }
  // \umlnote[opts] (name) at (x,y) {text};
  function readNote(st: string, warn: (w: string) => void) {
    let i = 8, name = '', p: [number, number] | null = null, text: string | null = null;
    const o: string[] = [];
    while (i < st.length) {
      i = skip(st, i);
      const c = st[i];
      if (c === ';' || c === undefined) break;
      if (c === '[') { const e = close(st, i); if (e < 0) return null; o.push(...opts(st.slice(i + 1, e))); i = e + 1; continue; }
      if (c === '(') { const e = close(st, i); if (e < 0 || name) return null; name = st.slice(i + 1, e).trim(); i = e + 1; continue; }
      if (c === '{') { const e = close(st, i); if (e < 0) return null; text = st.slice(i + 1, e).trim(); i = e + 1; continue; }
      if (st.startsWith('at', i) && !/[A-Za-z]/.test(st[i + 2] || '')) {
        i = skip(st, i + 2);
        if (st[i] !== '(') return null;
        const e = close(st, i);
        p = e > 0 ? xy(st.slice(i, e + 1)) : null;
        if (!p) { warn(`The note position ${st.slice(i, e + 1)} isn't one the drawing understands; use at (x,y)`); return null; }
        i = e + 1; continue;
      }
      return null;
    }
    if (text == null) return null;
    return { k: 'note', o: o.join(', '), name, x: p ? p[0] : 0, y: p ? p[1] : 0, text };
  }
  // \draw[opts] (a) -- node[opts]{text} (b);  with --, -| or |-, and labels after the step or at its end
  function readDraw(st: string) {
    const hm = /^\\(draw|path)\s*/.exec(st)!;
    let i = hm[0].length, o = '';
    if (st[i] === '[') { const e = close(st, i); if (e < 0) return null; o = st.slice(i + 1, e).trim(); i = e + 1; }
    // the path as steps: a start point, then points reached by --, -| or |- (or moved to, with no operator),
    // written plainly, +(…) or ++(…); a node goes on the step it is written in (after the point: at its end)
    let start: string | null = null, op: string | null = null, rel = '', pend: any[] = [];
    const steps: any[] = [], startLabels: any[] = [];
    for (;;) {
      i = skip(st, i);
      const c = st[i];
      if (c === ';' || c === undefined) break;
      if (c === '+') { if (rel || start == null) return null; rel = st[i + 1] === '+' ? '++' : '+'; i += rel.length; continue; }
      if (c === '(') {
        const e = close(st, i); if (e < 0) return null;
        const to = st.slice(i + 1, e).trim();
        i = e + 1;
        if (start == null) { if (rel) return null; start = to; continue; }
        steps.push({ op: op || 'move', rel, to, labels: pend.map((l) => ({ ...l, after: 0 })) });
        op = null; rel = ''; pend = [];
        continue;
      }
      if (rel) return null;
      const m = /^(--|-\||\|-)/.exec(st.slice(i));
      if (m) { if (op || start == null) return null; op = m[1]; i += m[1].length; continue; }
      if (st.startsWith('node', i) && !/[A-Za-z]/.test(st[i + 4] || '')) {
        i = skip(st, i + 4);
        let lo = '';
        if (st[i] === '[') { const e = close(st, i); if (e < 0) return null; lo = st.slice(i + 1, e).trim(); i = skip(st, e + 1); }
        if (st[i] !== '{') return null;
        const e = close(st, i); if (e < 0) return null;
        const lb = { o: lo, t: st.slice(i + 1, e).trim() };
        if (op) pend.push(lb);
        else if (steps.length) steps[steps.length - 1].labels.push({ ...lb, after: 1 });
        else startLabels.push({ ...lb, after: 0 });
        i = e + 1; continue;
      }
      return null;
    }
    if (start == null || op || rel || !steps.length) return null;
    // one plain step between two points: the form the editor makes and changes
    const s0 = steps[0];
    if (steps.length === 1 && s0.op !== 'move' && !s0.rel) return { k: 'draw', cmd: hm[1], o, a: start, b: s0.to, op: s0.op, labels: [...startLabels, ...s0.labels] };
    // a longer path: moves only before the line starts, and it ends on a step that draws
    const first = steps.findIndex((s) => s.op !== 'move');
    if (first < 0 || startLabels.length || steps.slice(first).some((s) => s.op === 'move') || steps.slice(0, first).some((s) => s.labels.length)) return null;
    const last = steps[steps.length - 1];
    return { k: 'draw', cmd: hm[1], o, a: start, b: last.rel ? '' : last.to, op: null, steps, labels: [] };
  }

  // ---------------------------------------------------------------- writing the code
  const num = (n: number) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
  function classCode(c: any, pad: string) {
    const lines = [`${pad}\\begin{${c.env}}${c.o ? `[${c.o}]` : ''}{${c.name}}{${c.x != null ? `${num(c.x)},${num(c.y)}` : c.pos}}`];
    if (c.instanceOf != null) lines.push(`${pad}  \\instanceOf{${c.instanceOf}}`);
    for (const p of c.inherits) lines.push(`${pad}  \\inherit{${p}}`);
    for (const p of c.implements) lines.push(`${pad}  \\implement{${p}}`);
    for (const a of c.attrs) lines.push(`${pad}  \\attribute{${a}}`);
    for (const op of c.ops) lines.push(`${pad}  \\operation${op.n != null ? `[${op.n}]` : ''}{${op.t}}`);
    for (const x of c.extra) lines.push(`${pad}  ${x}`);
    lines.push(`${pad}\\end{${c.env}}`);
    return lines.join('\n');
  }
  function itemCode(it: any, pad: string) {
    if (it.k === 'class') return classCode(it, pad);
    if (it.k === 'rel') {
      const g = it.cmd === 'association' ? [it.a, it.ra, it.ma, it.b, it.rb, it.mb] : [it.a, it.rb, it.mb, it.b];
      return `${pad}\\${it.cmd}${it.o ? `[${it.o}]` : ''}${g.map((x: string) => `{${x || ''}}`).join('')}`;
    }
    if (it.k === 'note') return `${pad}\\umlnote${it.o ? `[${it.o}]` : ''}${it.name ? ` (${it.name})` : ''} at (${num(it.x)},${num(it.y)}) {${it.text}};`;
    if (it.k === 'draw') {
      const lab = (ls: any[], after: number) => ls.filter((l: any) => l.after === after).map((l: any) => ` node${l.o ? `[${l.o}]` : ''} {${l.t}}`).join('');
      const head = `${pad}\\${it.cmd}${it.o ? `[${it.o}]` : ''} (${it.a})`;
      if (!it.steps) return `${head} ${it.op}${lab(it.labels, 0)} (${it.b})${lab(it.labels, 1)};`;
      // a longer path; its end follows a rename like a plain line's
      return head + it.steps.map((s: any, k: number) => `${s.op === 'move' ? '' : ` ${s.op}`}${lab(s.labels, 0)} ${s.rel}(${k === it.steps.length - 1 && !s.rel && it.b ? it.b : s.to})${lab(s.labels, 1)}`).join('') + ';';
    }
    if (it.k === 'color') return `${pad}${it.def ? '\\def' : '\\renewcommand'}{\\uml${it.which}color}{${it.v}}`;
    if (it.k === 'school') return `${pad}\\switchUmlcdSchool`;
    if (it.k === 'pkg') return `${pad}\\begin{package}{${it.name}}`;
    if (it.k === 'endpkg') return `${pad}\\end{package}`;
    return pad + it.t;
  }
  function write(M: any) {
    const lines: string[] = [];
    let pad = '  ';
    for (const it of M.items) {
      if (it.k === 'endpkg') pad = '  ';
      lines.push(itemCode(it, pad));
      if (it.k === 'pkg') pad = '    ';
    }
    const body = lines.join('\n');
    return M.env == null ? body : `\\begin{tikzpicture}${M.env ? `[${M.env}]` : ''}\n${body}${body ? '\n' : ''}\\end{tikzpicture}`;
  }

  // pgf-umlcd draws \inherit, \implement, the relations and lines when it reaches them, so every class or note they
  // name must come earlier in the code (otherwise pdflatex stops: "No shape named `Shape' is known"). settle moves
  // items down after what they name, as little as it can: a package moves as a whole, classes move within their
  // package, and nothing crosses a colour change or other statement (that would change how it looks). What can't
  // be put in order stays where it is (parse warns about it). Returns true when the order changed.
  const refName = (r: any) => String(r || '').replace(/\.(north east|north west|south east|south west|north|south|east|west|center)$/, '').trim();
  function refsOf(it: any): string[] {
    if (it.k === 'class') return [...it.inherits, ...it.implements];
    if (it.k === 'rel' || it.k === 'draw') return [refName(it.a), refName(it.b)];
    return [];
  }
  // a stable order: each unit as early as its dependencies allow (the order as it is when nothing needs moving)
  function stableOrder<T>(units: T[], defines: (u: T) => string[], refs: (u: T) => string[], barrier: (u: T) => boolean): T[] {
    const at = new Map<string, number>();
    units.forEach((u, i) => { for (const n of defines(u)) if (!at.has(n)) at.set(n, i); });
    const deps = units.map((u, i) => {
      const d = new Set<number>();
      for (const n of refs(u)) { const j = at.get(n); if (j != null && j !== i) d.add(j); }
      // what it names lies past a barrier: it can't move there, so it stays
      const next = units.findIndex((x, j) => j > i && barrier(x));
      if (next >= 0 && [...d].some((j) => j > next)) d.clear();
      if (barrier(u)) for (let j = 0; j < i; j++) d.add(j);
      else for (let j = i - 1; j >= 0; j--) if (barrier(units[j])) { d.add(j); break; }
      return d;
    });
    const done = new Set<number>(), out: T[] = [];
    while (out.length < units.length) {
      let pick = units.findIndex((_, i) => !done.has(i) && [...deps[i]].every((j) => done.has(j)));
      if (pick < 0) pick = units.findIndex((_, i) => !done.has(i)); // a cycle: as written
      done.add(pick); out.push(units[pick]);
    }
    return out;
  }
  function settle(M: any) {
    const items = M.items as any[];
    const isBarrier = (it: any) => it.k === 'color' || it.k === 'school' || it.k === 'raw';
    const defs = (it: any) => ((it.k === 'class' || it.k === 'note') && it.name ? [it.name] : []);
    // units: a package (its markers and members) or one item
    const units: any[][] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].k !== 'pkg') { units.push([items[i]]); continue; }
      let e = i + 1;
      while (e < items.length && items[e].k !== 'endpkg') e++;
      const inner = items.slice(i + 1, e);
      units.push([items[i], ...stableOrder(inner, defs, refsOf, isBarrier), ...(e < items.length ? [items[e]] : [])]);
      i = e;
    }
    const out = stableOrder(units, (u) => u.flatMap(defs), (u) => u.flatMap(refsOf), (u) => u.length === 1 && isBarrier(u[0])).flat();
    const changed = out.some((it, i) => it !== items[i]);
    if (changed) M.items = out;
    return changed;
  }

  // ---------------------------------------------------------------- styles
  const WIDTHS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  const POS: Record<string, number> = { 'at start': 0, 'very near start': 0.125, 'near start': 0.25, midway: 0.5, 'near end': 0.75, 'very near end': 0.875, 'at end': 1 };
  const PLACE: Record<string, string> = { above: 'south', below: 'north', left: 'east', right: 'west', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
  const TIPS = new Set(['angle 90', 'angle 60', 'angle 45', 'open triangle 45', 'open triangle 60', 'open triangle 90', 'triangle 45', 'triangle 60', 'triangle 90', 'diamond', 'open diamond', 'to', 'stealth', 'latex', 'Stealth', 'Latex', 'To']);
  const col = (v: any) => (v == null ? null : TD.tikzColor ? TD.tikzColor(unbrace(v)) : null);
  // "->", "open diamond->", "open triangle 45-", "<->"
  function arrowSpec(k: string) {
    const m = /^([^-]*)-([^-]*)$/.exec(k);
    if (!m) return null;
    const side = (x: string) => { x = x.trim().replace(/^\{|\}$/g, ''); if (!x) return ''; if (x === '>' || x === '<') return '>'; return TIPS.has(x) ? x : null; };
    const s = side(m[1]), e = side(m[2]);
    return s == null || e == null ? null : { s: s || null, e: e || null };
  }
  // the colours in effect (pgf-umlcd's macros, which \renewcommand changes as the code goes)
  type Ink = { draw: string; fill: string; text: string };
  function lineStyle(C: Ink, o: string, unknown: string[] | null) {
    const S: any = { color: null, fill: null, text: null, lw: LW, dash: '', arrow: { s: null, e: null }, tip: 'to', auto: 0, swap: false, pos: 0.5, place: null, rounded: 0, sloped: false };
    const apply = (list: string[]) => {
      for (const it of list) {
        const { k, v } = kv(it);
        const A = v == null ? arrowSpec(k) : null;
        if (A) { S.arrow = A; continue; }
        if (k === 'umlcd style' || k === 'umlcolor') { S.color = C.draw; S.fill = C.fill; S.text = C.text; if (k === 'umlcd style') S.tip = 'angle 90'; continue; }
        if (k === 'umlcd style dashed line') { S.color = C.draw; S.tip = 'angle 90'; S.dash = 'dash'; continue; }
        if (k === 'umlcd style inherit line') { S.color = C.draw; S.arrow = { s: 'open triangle 45', e: null }; continue; }
        if (k === 'umlcd style implement line') { S.color = C.draw; S.arrow = { s: 'open triangle 45', e: null }; S.dash = 'dash'; continue; }
        if (k === 'objectline') { S.color = C.draw; S.arrow = { s: 'diamond', e: '>' }; continue; }
        if (k === '>' && v != null) { const t = unbrace(v).replace(/\[.*\]$/, '').trim(); S.tip = TIPS.has(t) ? t : 'to'; continue; }
        if (WIDTHS[k] != null && v == null) { S.lw = WIDTHS[k]; continue; }
        if (k === 'line width' && v != null) { const w = cm(v); if (isFinite(w)) S.lw = w * CMPT; continue; }
        if (/^(densely |loosely )?dashed$/.test(k)) { S.dash = 'dash'; continue; }
        if (/^(densely |loosely )?dotted$/.test(k)) { S.dash = 'dot'; continue; }
        if (k === 'solid') { S.dash = ''; continue; }
        if (k === 'auto') { S.auto = v === 'right' ? -1 : v === 'false' ? 0 : 1; S.place = null; continue; }
        if (k === 'swap' || k === "'") { S.swap = !S.swap; continue; }
        if (PLACE[k] && v == null) { S.place = PLACE[k]; S.auto = 0; continue; }
        if (k === 'anchor' && v != null && /^(center|centre|(north|south)( east| west)?|east|west)$/.test(v)) { S.place = v === 'centre' ? 'center' : v; S.auto = 0; continue; }
        if (k === 'pos' && v != null) { const p = parseFloat(v); if (isFinite(p)) S.pos = p; continue; }
        if (POS[k] != null && v == null) { S.pos = POS[k]; continue; }
        if (k === 'sloped') { S.sloped = v !== 'false'; continue; }
        if (k === 'rounded corners') { S.rounded = v == null ? 4 : (cm(v) * CMPT) || 0; continue; }
        if (k === 'sharp corners') { S.rounded = 0; continue; }
        if (k === 'fill' && v != null) { S.fill = v === 'none' ? null : col(v) ?? S.fill; continue; }
        if (k === 'text' && v != null) { const c = col(v); if (c) { S.text = c; continue; } }
        if ((k === 'draw' || k === 'color') && v != null) { const c = col(v); if (c) { S.color = c; if (k === 'color') S.text = c; continue; } }
        if (k === 'draw' && v == null) continue;
        if (v == null && col(k)) { S.color = S.text = col(k); continue; }
        if (/^(font|inner sep|outer sep|align|anchor|allow upside down|text width|minimum width|minimum height|node distance|shorten [<>]|every .*|opacity|draw opacity|text opacity)$/.test(k) || /\/\.(style|append style|code)$/.test(k)) continue;
        if (unknown) unknown.push(it);
      }
    };
    return { S, apply };
  }
  // a class's or note's own options over pgf-umlcd's style for it
  function nodeStyle(C: Ink, o: string | null, base: { tw: number }, unknown: string[]) {
    const S: any = { draw: C.draw, fill: C.fill, text: C.text, tw: base.tw, minw: MINW, lw: LW, rounded: 0, dash: '' };
    for (const it of opts(o)) {
      const { k, v } = kv(it);
      if (k === 'text width' && v != null) { const w = cm(v); if (isFinite(w)) { S.tw = w * CMPT; continue; } }
      if (k === 'minimum width' && v != null) { const w = cm(v); if (isFinite(w)) { S.minw = w * CMPT; continue; } }
      if (k === 'fill' && v != null) { if (v === 'none') { S.fill = null; continue; } const c = col(v); if (c) { S.fill = c; continue; } }
      if (k === 'draw' && v != null) { if (v === 'none') { S.draw = null; continue; } const c = col(v); if (c) { S.draw = c; continue; } }
      if (k === 'text' && v != null) { const c = col(v); if (c) { S.text = c; continue; } }
      if (k === 'color' && v != null) { const c = col(v); if (c) { S.draw = S.text = c; continue; } }
      if (WIDTHS[k] != null && v == null) { S.lw = WIDTHS[k]; continue; }
      if (k === 'line width' && v != null) { const w = cm(v); if (isFinite(w)) { S.lw = w * CMPT; continue; } }
      if (k === 'rounded corners') { S.rounded = v == null ? 4 : (cm(v) * CMPT) || 0; continue; }
      if (/^(densely |loosely )?dashed$/.test(k)) { S.dash = 'dash'; continue; }
      if (/^(densely |loosely )?dotted$/.test(k)) { S.dash = 'dot'; continue; }
      if (v == null && col(k)) { S.draw = S.text = col(k); continue; }
      if (/^(minimum height|inner sep|outer sep|node distance|anchor|align|draw|umlcolor|umlcd style)$/.test(k)) continue;
      unknown.push(it);
    }
    return S;
  }

  // ---------------------------------------------------------------- text
  // TeX's height and depth of a line, in pt (Computer Modern at 10pt), close enough for the boxes round it
  function hd(t: string) {
    // cmr10's heights and depths (pt), or cmbx10's where they differ, for a bold line such as a class's name
    const bold = /^\s*(\\textbf\s*\{|\{?\\bfseries\b|\\underline\s*\{\s*\\textbf\s*\{)/.test(String(t || ''));
    const CAP = bold ? 6.8611 : 6.8333, XH = bold ? 4.4444 : 4.3056, TH = bold ? 6.3492 : 6.1508, IH = bold ? 6.9444 : 6.6786;
    let x = String(t || '').replace(/\\(textbf|textit|textsl|emph|underline|texttt|textsf|textrm|textsc|textup|textnormal|mathrm|mathit|mathbf|mathsf|mathtt|text|bfseries|itshape)\s*/g, '').replace(/\\[#$%&_{}]/g, 'a');
    let ht = 0, dp = 0;
    const under = /\\underline/.test(t);
    x = x.replace(/([_^])(\{[^{}]*\}|\\?[A-Za-z]|.)/g, (m: string, k: string, a: string) => {
      const h = hd(a.replace(/^\{|\}$/g, ''));
      if (k === '_') dp = Math.max(dp, 1.5 + h.dp * 0.7); else ht = Math.max(ht, 4.1 + h.ht * 0.7);
      return '';
    }).replace(/\\[A-Za-z]+/g, '\u0002').replace(/[{}$\s~]/g, '');
    for (const c of x) {
      let h = XH, d = 0;
      if (c === '\u0002') { h = 7.5; d = 2.5; }
      else if (/[A-Z]/.test(c)) h = CAP;
      else if (/[0-9]/.test(c)) h = 6.4444;
      else if (/[bdfhklt]/.test(c)) h = c === 't' ? TH : 6.9444;
      else if (/[ij]/.test(c)) h = IH;
      else if (/[?!]/.test(c)) h = 6.9444;
      else if (/[()[\]/|]/.test(c)) { h = 7.5; d = 2.5; }
      else if (/[.:]/.test(c)) h = XH;
      else if (/[,;]/.test(c)) { h = XH; d = 1.9444; }
      else if (/[-+=*'"`]/.test(c)) h = c === '-' ? XH : 5.83;
      else if (/[<>]/.test(c)) { h = 5.4; d = 0.4; }
      if (/[gjpqy]/.test(c)) d = 1.9444;
      ht = Math.max(ht, h); dp = Math.max(dp, d);
    }
    // \underline: the rule 3θ under the box, θ thick, and θ under it (θ = 0.4pt)
    if (under) dp += 2;
    return { ht, dp };
  }
  // where the first baseline sits in a measured text box, from its top (px): one probe per style
  const baseCache = new Map();
  function baseOff(st: any) {
    const b = TD.textBox('Hg', st);
    if (baseCache.has(b.css)) return baseCache.get(b.css);
    const m = typeof document !== 'undefined' ? measurementElement() : null;
    let v = b.h * 0.78;
    if (m && !(TD.measuring && TD.measuring())) {
      m.setAttribute('style', b.css);
      m.innerHTML = b.html.replace(/^<div>/, '<div><span class="uml-probe" style="display:inline-block;width:0;height:0"></span>');
      const p = m.querySelector('.uml-probe');
      if (p) { v = p.getBoundingClientRect().top - m.getBoundingClientRect().top; baseCache.set(b.css, v); }
    }
    return v;
  }
  // TeX's space factor: in text, a space after : . ? or ! (a full stop not after a capital) gets the font's extra
  // space too, 1.11pt at 10pt (\nonfrenchspacing). Only for measuring and drawing; the code keeps what was typed.
  function sf(t: string) {
    return String(t).split(/(\$[^$]*\$)/).map((p, i) => (i % 2 ? p : p.replace(/([^A-Z]\.|[:?!])(?=\s)/g, '$1$\\kern1.11pt$'))).join('');
  }
  const lineH = () => TD.textBox('X', TEXT).h;
  // a line of text set in a box `tw` pt wide: its width (pt), the lines it wraps to, and how to draw it
  function setLine(t: string, tw: number, st: any = {}) {
    const S = { ...TEXT, ...st };
    const b = TD.textBox(sf(t), S), w = Math.max(0, b.w - 2) * K;
    if (w <= tw + 0.5 || !/\s/.test(t.trim())) return { t, w, n: 1, st: S, ...hd(t) };
    const W = { ...S, tw: tw * PT, align: 'left' }, bw = TD.textBox(sf(t), W);
    return { t, w: tw, n: Math.max(1, Math.round(bw.h / lineH())), st: W, ...hd(t) };
  }

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
  TD.onTextMetricsChange(() => { cache.clear(); baseCache.clear(); });

  // The backgrounds library's picture options: the grid, and how far the background reaches past the picture
  const EX = 4.30554, GRID_LW = 0.2;
  const frameOpt = (it: string) => /^(show background grid|gridded|tight background|loose background|inner frame (x|y)?sep\s*=.*)$/.test(it.trim());
  function gridOf(env: string | null) {
    if (!env) return null;
    let on = false, sx = EX, sy = EX;
    for (const it of opts(env)) {
      const { k, v } = kv(it);
      if (k === 'show background grid' || k === 'gridded') on = true;
      else if (k === 'tight background') sx = sy = 0;
      else if (k === 'loose background') sx = sy = 2 * EX;
      else if (/^inner frame (x|y)?sep$/.test(k) && v != null) {
        const d = /^\s*(-?[\d.]+)\s*ex\s*$/.exec(v) ? parseFloat(v) * EX : cm(v) * CMPT;
        if (!isFinite(d)) continue;
        if (k !== 'inner frame ysep') sx = d;
        if (k !== 'inner frame xsep') sy = d;
      }
    }
    return on ? { sx, sy } : null;
  }

  // Everything is worked out in pt, y up as in TikZ, then turned into px with y down.
  function build(src: any) {
    const M = parse(src);
    const warnings = M.warnings.slice(), warn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };
    if (M.env) for (const it of opts(M.env)) if (!/^(>=|>\s*=|every |font|baseline|remember picture|overlay|thick|thin|semithick|line width)/.test(it) && !frameOpt(it)) warn(`The picture option "${it}" isn't drawn here (it is kept in the code)`);
    const G = gridOf(M.env);
    const C: Ink = { draw: col(COLORS.draw)!, fill: col(COLORS.fill)!, text: col(COLORS.text)! };
    let school = false;
    const nodes = new Map<string, any>();
    const boxes: any[] = [], rules: any[] = [], texts: any[] = [], paths: any[] = [], tips: any[] = [], pkgs: any[] = [], back: any[] = [];
    let pkg: any = null, idx = -1;
    const text = (t: string, st: any, color: string, x: number, y: number, align: string, w: number) => {
      // x: the left of the line (align left) or its middle (centre); y: its first baseline
      const b = TD.textBox(sf(t), st), base = baseOff(st);
      const cx = align === 'left' ? x * PT + (st.tw ? b.w / 2 : (b.w - 2) / 2) : x * PT;
      texts.push({ t, st, color, x: cx, y: -y * PT - base + b.h / 2, b, w });
    };
    for (const it of M.items) {
      idx++;
      if (it.k === 'color') { const c = col(it.v); if (c) (C as any)[it.which] = c; else warn(`The colour "${it.v}" isn't one the drawing knows`); continue; }
      if (it.k === 'school') { school = !school; continue; }
      if (it.k === 'pkg') { pkg = { name: it.name, members: [], C: { ...C } }; pkgs.push(pkg); continue; }
      if (it.k === 'endpkg') { pkg = null; continue; }
      if (it.k === 'class') {
        const unknown: string[] = [];
        const S = nodeStyle(C, it.o, { tw: TW }, unknown);
        if (it.env === 'object' && school && !S.rounded) S.rounded = 4;
        for (const u of unknown) warn(`The option "${u}" of "${it.name}" isn't drawn here (it is kept in the code)`);
        const x0 = it.x != null ? it.x * CMPT : 0, y0 = it.y != null ? it.y * CMPT : 0;
        const W = Math.max(S.tw + 2 * INNER, S.minw);
        const cx = x0, left = cx - S.tw / 2;
        // the compartments: name, attributes, operations
        const head: any[] = [];
        if (STEREO[it.env]) head.push(setLine(`$<<$${STEREO[it.env]}$>>$`, S.tw));
        const nm = it.env === 'object' && it.instanceOf != null ? `${it.name} : ${it.instanceOf}` : it.name;
        head.push(setLine(it.env === 'object' && !school ? `\\underline{\\textbf{${nm}}}` : `\\textbf{${nm}}`, S.tw));
        const parts = [head, it.attrs.map((a: string) => setLine(a, S.tw)), it.ops.map((op: any) => setLine(op.t, S.tw, op.n === '0' ? { italic: true } : {}))];
        if (it.env === 'object' && !it.ops.length) parts.pop();
        let y = y0 - OSEP;
        // rows: each member's line, top and bottom (pt), for the editor to find the one under the pointer
        const top = y, splits: number[] = [], rows: any[] = [];
        parts.forEach((ls: any[], pi: number) => {
          const lines = ls.reduce((n, l) => n + l.n, 0);
          const content = ls.length ? ls[0].ht + LINE * (lines - 1) + ls[ls.length - 1].dp : 0;
          let base = y - S.lw / 2 - INNER - (ls.length ? ls[0].ht : 0);
          ls.forEach((l: any, j: number) => {
            if (pi === 0) text(l.t, l.st, S.text, l.w > S.tw ? left : cx, base, l.w > S.tw ? 'left' : 'centre', l.w);
            else { text(l.t, l.st, S.text, left, base, 'left', l.w); rows.push({ part: pi, j, top: base + l.ht, bot: base - LINE * (l.n - 1) - l.dp }); }
            base -= LINE * l.n;
          });
          y -= content + 2 * INNER + S.lw;
          if (pi < parts.length - 1) splits.push(y);
        });
        const H = top - y;
        const n = { name: it.name, kind: 'class', item: it, idx, x: cx, y: top - H / 2, hw: W / 2 + OSEP, hh: H / 2 + OSEP, W, H, top, S };
        boxes.push({ x: cx - W / 2, y: top, w: W, h: H, S, name: it.name, idx, splits, rows });
        for (const sy of splits) rules.push({ x1: cx - W / 2, x2: cx + W / 2, y: sy, S });
        nodes.set(it.name, n);
        if (pkg) pkg.members.push(n);
        // inheritance and realisation: from the parent's border to this class's, on the connection layer
        for (const p of it.inherits) back.push({ a: p, b: it.name, kind: 'inherit', C: { ...C } });
        for (const p of it.implements) back.push({ a: p, b: it.name, kind: 'implement', C: { ...C } });
        continue;
      }
      if (it.k === 'note') {
        const unknown: string[] = [];
        const S = nodeStyle(C, it.o, { tw: NOTE_TW }, unknown);
        for (const u of unknown) warn(`The note option "${u}" isn't drawn here (it is kept in the code)`);
        const ls = String(it.text).split(/\\\\/).map((t: string) => setLine(t.trim(), S.tw));
        const lines = ls.reduce((n, l) => n + l.n, 0);
        const content = ls[0].ht + LINE * (lines - 1) + ls[ls.length - 1].dp;
        // the note's outline runs along its outer edge (outer sep included), unlike a class's
        const W = S.tw + 2 * INNER + 2 * OSEP, H = content + 2 * INNER + 2 * OSEP;
        const cx = it.x * CMPT, top = it.y * CMPT, left = cx - S.tw / 2;
        let base = top - OSEP - INNER - ls[0].ht;
        for (const l of ls) { text(l.t, l.st, S.text, left, base, 'left', l.w); base -= LINE * l.n; }
        const n = { name: it.name, kind: 'note', item: it, idx, x: cx, y: top - H / 2, hw: W / 2, hh: H / 2, W, H, top, S, note: true };
        boxes.push({ x: cx - W / 2, y: top, w: W, h: H, S, note: true, name: it.name, idx });
        if (it.name) nodes.set(it.name, n);
        continue;
      }
    }
    // packages: a box 0.5cm round their classes, behind them, with the name in a tab on top
    for (const p of pkgs) {
      if (!p.members.length) { warn(`The package "${p.name}" has no classes`); continue; }
      const x1 = Math.min(...p.members.map((n: any) => n.x - n.hw)) - PKG_SEP, x2 = Math.max(...p.members.map((n: any) => n.x + n.hw)) + PKG_SEP;
      const y2 = Math.max(...p.members.map((n: any) => n.y + n.hh)) + PKG_SEP, y1 = Math.min(...p.members.map((n: any) => n.y - n.hh)) - PKG_SEP;
      const cap = setLine(p.name, Infinity), cw = cap.w + 2 * INNER, ch = cap.ht + cap.dp + 2 * INNER;
      const S = { draw: p.C.draw, fill: p.C.fill, text: p.C.text, lw: LW, rounded: 0, dash: '' };
      p.box = { x: x1, y: y2, w: x2 - x1, h: y2 - y1, S };
      const cy0 = y2 - 0.3;
      p.cap = { x: x1, y: cy0 + ch, w: cw, h: ch, S };
      p.text = { t: cap.t, st: cap.st, color: p.C.text, x: x1 + INNER, base: cy0 + INNER + cap.dp, w: cap.w };
      nodes.set(p.name, { name: p.name, kind: 'package', x: (x1 + x2) / 2, y: (y1 + y2) / 2, hw: (x2 - x1) / 2 + OSEP, hh: (y2 - y1) / 2 + OSEP });
    }
    // where a line meets a node: its border towards a point; or a named anchor, or a coordinate
    const ANCH: Record<string, [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], 'north east': [1, 1], 'north west': [-1, 1], 'south east': [1, -1], 'south west': [-1, -1], center: [0, 0] };
    const target = (ref: string) => {
      const p = xy(ref);
      if (p) return { pt: [p[0] * CMPT, p[1] * CMPT] };
      const m = /^(.*?)(?:\.(north east|north west|south east|south west|north|south|east|west|center))?$/.exec(ref.trim())!;
      const n = nodes.get(m[1]);
      if (!n) return null;
      if (m[2]) { const a = ANCH[m[2]]; return { pt: [n.x + a[0] * n.hw, n.y + a[1] * n.hh] }; }
      return { n };
    };
    const centre = (T: any) => (T.n ? [T.n.x, T.n.y] : T.pt);
    const border = (T: any, to: number[]) => {
      if (!T.n) return T.pt;
      const n = T.n, dx = to[0] - n.x, dy = to[1] - n.y;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [n.x, n.y];
      const k = Math.min(Math.abs(dx) > 1e-9 ? n.hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? n.hh / Math.abs(dy) : Infinity);
      return [n.x + dx * k, n.y + dy * k];
    };
    const route = (a: string, b: string, op: string) => {
      const A = target(a), B = target(b);
      if (!A || !B) return null;
      const ca = centre(A), cb = centre(B);
      if (op === '--') return [border(A, cb), border(B, ca)];
      const corner = op === '-|' ? [cb[0], ca[1]] : [ca[0], cb[1]];
      return [border(A, corner), corner, border(B, corner)];
    };
    // a longer path (steps): its points, and each step's first and last point for its labels; null when it
    // can't be drawn here (a class in the middle of it, or a point that isn't a coordinate)
    const pathOf = (it: any) => {
      const T0 = target(it.a);
      if (!T0) return null;
      let last = centre(T0), from: any = T0;
      const pts: number[][] = [], spans: (number[] | null)[] = [];
      for (let k = 0; k < it.steps.length; k++) {
        const s = it.steps[k], end = k === it.steps.length - 1;
        let T: any;
        if (s.rel) {
          const d = xy(s.to);
          if (!d) return null;
          const p = [last[0] + d[0] * CMPT, last[1] + d[1] * CMPT];
          T = { pt: p };
          if (s.rel === '++') last = p;
        } else {
          T = target(end && it.b ? it.b : s.to);
          if (!T || (T.n && !end && s.op !== 'move')) return null;
          last = centre(T);
        }
        if (s.op === 'move') { from = T; spans.push(null); continue; }
        const ca = centre(from), cb = centre(T), corner = s.op === '-|' ? [cb[0], ca[1]] : s.op === '|-' ? [ca[0], cb[1]] : null;
        if (!pts.length) pts.push(border(from, corner || cb));
        const k0 = pts.length - 1;
        if (corner) pts.push(corner);
        pts.push(border(T, corner || ca));
        spans.push([k0, pts.length - 1]);
        from = T;
      }
      return { pts, spans };
    };
    const lines: any[] = [];
    const line = (pts: number[][], S: any, where: any[], labels: any[], ref: any) => {
      const L = { pts, S, labels: [] as any[], ref };
      arrowed(L, where);
      for (const lb of labels) {
        if (!lb.t) continue;
        const T = { ...S, ...lb.S };
        // pos runs along the path, or along its step (span: the step's first and last point); on an elbow 0.5
        // is the corner
        const [k0, k1] = lb.span || [0, pts.length - 1], n = k1 - k0;
        let k = k0 + Math.min(n - 1, Math.floor(T.pos * n)), u = T.pos * n - (k - k0);
        if (T.pos >= 1) { k = k1 - 1; u = 1; }
        const p0 = pts[k], p1 = pts[k + 1], P = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
        // sloped: turned along the line, never upside down, and placed in that turned frame
        let rot = 0, ux = dx / l, uy = dy / l;
        if (T.sloped) { rot = (Math.atan2(dy, dx) * 180) / Math.PI; if (rot > 90.001 || rot < -89.999) rot += rot > 0 ? -180 : 180; const r = (rot * Math.PI) / 180; [ux, uy] = [ux * Math.cos(r) + uy * Math.sin(r), uy * Math.cos(r) - ux * Math.sin(r)]; }
        const anchor = T.place || (T.auto ? autoAnchor(ux, uy, (T.auto < 0) !== !!T.swap) : 'center');
        // key: where its text is in the item (a relation's field, or a draw's label), for the editor
        L.labels.push({ ...label(lb.t, P, anchor, T.text || T.color || C.text, rot), key: lb.key, span: [k0, k1] });
      }
      lines.push(L);
      return L;
    };
    // the anchor TikZ's auto picks: the label goes left of the direction of travel (right with swap)
    function autoAnchor(dx: number, dy: number, right: boolean) {
      const e = 0.05;
      let a;
      if (dx > e) a = dy > e ? 'south east' : dy < -e ? 'south west' : 'south';
      else if (dx < -e) a = dy > e ? 'north east' : dy < -e ? 'north west' : 'north';
      else a = dy > 0 ? 'east' : 'west';
      if (!right) return a;
      const flip: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      return a.split(' ').map((w) => flip[w]).join(' ');
    }
    function label(t: string, P: number[], anchor: string, color: string, rot = 0) {
      const l = setLine(t, Infinity), w = l.w + 2 * INNER + 2 * OSEP, h = l.ht + l.dp + 2 * INNER + 2 * OSEP;
      const a = ANCH[anchor] || [0, 0], r = (rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      // the anchor's offset from the centre, turned with the label
      const ox = (a[0] * w) / 2, oy = (a[1] * h) / 2, cx = P[0] - (ox * c - oy * sn), cy = P[1] - (ox * sn + oy * c);
      const base = cy - h / 2 + OSEP + INNER + l.dp;
      // its box: the turned rectangle's extent
      const bw = Math.abs(w * c) + Math.abs(h * sn), bh = Math.abs(w * sn) + Math.abs(h * c);
      return { t: l.t, st: l.st, color, x: cx, base, w: l.w, rot, cy, box: { x: cx - bw / 2, y: cy + bh / 2, w: bw, h: bh } };
    }
    // the connection layer: inheritance and realisation, under the classes
    const under: any[] = [];
    for (const r of back) {
      const pts = route(r.a, r.b, '--');
      if (!pts) continue;
      const { S } = lineStyle(r.C, '', null);
      S.color = r.C.draw; S.arrow = { s: 'open triangle 45', e: null };
      if (r.kind === 'implement') S.dash = 'dash';
      line(pts, S, under, [], { kind: r.kind, a: r.a, b: r.b });
    }
    const over: any[] = [];
    let Cl: Ink = { draw: col(COLORS.draw)!, fill: col(COLORS.fill)!, text: col(COLORS.text)! };
    M.items.forEach((it: any, idx: number) => {
      if (it.k === 'color') { const c = col(it.v); if (c) (Cl as any)[it.which] = c; return; }
      if (it.k === 'rel') {
        const pts = route(it.a, it.b, '--');
        if (!pts) return;
        const unknown: string[] = [], { S, apply } = lineStyle(Cl, '', unknown);
        apply(['umlcd style', ...(it.cmd === 'unidirectionalAssociation' ? ['->'] : it.cmd === 'aggregation' ? ['open diamond->'] : it.cmd === 'composition' ? ['diamond->'] : [])]);
        apply(opts(it.o));
        for (const u of unknown) warn(`The option "${u}" of \\${it.cmd} isn't drawn here (it is kept in the code)`);
        const T = (pos: number, swap: boolean, key: string) => ({ t: it[key], key, S: { pos, auto: 1, swap, place: null } });
        const labels = it.cmd === 'association' ? [T(0.25, false, 'ra'), T(0.25, true, 'ma'), T(0.75, false, 'rb'), T(0.75, true, 'mb')] : [T(0.75, false, 'rb'), T(0.75, true, 'mb')];
        line(pts, S, over, labels, { kind: 'rel', idx });
        return;
      }
      if (it.k === 'draw') {
        const P = it.steps ? pathOf(it) : null, pts = it.steps ? P && P.pts : route(it.a, it.b, it.op);
        if (!pts) { warn(`A line from "${it.a}" isn't drawn here: it passes through a class or uses a point that isn't a coordinate (it is kept in the code)`); return; }
        const unknown: string[] = [], { S, apply } = lineStyle(Cl, '', unknown);
        S.color = null; S.text = null;
        apply(opts(it.o));
        for (const u of unknown) warn(`The line option "${u}" isn't drawn here (it is kept in the code)`);
        if (it.cmd === 'path' && !/(^|,)\s*draw\b/.test(it.o)) return;
        const all = it.steps ? it.steps.flatMap((st: any, k: number) => st.labels.map((lb: any, j: number) => ({ ...lb, span: P!.spans[k], key: [k, j] }))) : it.labels.map((lb: any, j: number) => ({ ...lb, key: [j] }));
        const labels = all.map((lb: any) => {
          const lu: string[] = [], L2 = lineStyle(Cl, '', lu);
          L2.S.pos = lb.after ? 1 : 0.5; L2.S.auto = S.auto; L2.S.swap = S.swap; L2.S.sloped = S.sloped;
          L2.apply(opts(lb.o));
          for (const u of lu) warn(`The label option "${u}" isn't drawn here (it is kept in the code)`);
          // a label written after the end point sits at the end
          return { t: lb.t, span: lb.span, key: lb.key, S: { pos: L2.S.pos, auto: L2.S.auto, swap: L2.S.swap, place: L2.S.place, text: L2.S.text, sloped: L2.S.sloped } };
        });
        line(pts, S, over, labels, { kind: 'draw', idx });
      }
    });
    // to px, y down
    const X = (v: number) => v * PT, Y = (v: number) => -v * PT;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a: number, b: number, c: number, d: number) => { x1 = Math.min(x1, a, c); y1 = Math.min(y1, b, d); x2 = Math.max(x2, a, c); y2 = Math.max(y2, b, d); };
    const rect = (b: any) => { const h = (b.S.lw || LW) / 2; ext(X(b.x - h), Y(b.y + h), X(b.x + b.w + h), Y(b.y - b.h - h)); };
    for (const p of pkgs) if (p.box) { rect(p.box); rect(p.cap); }
    for (const b of boxes) rect(b);
    for (const L of lines) {
      // PGF counts half the line width round a path in the picture's size
      const h = (L.S.lw || LW) / 2;
      for (const p of [...L.d, ...L.tipsPts]) ext(X(p[0] - h), Y(p[1] + h), X(p[0] + h), Y(p[1] - h));
      for (const lb of L.labels) if (lb.w) ext(X(lb.box.x), Y(lb.box.y), X(lb.box.x + lb.box.w), Y(lb.box.y - lb.box.h));
    }
    for (const t of texts) ext(t.x - (t.b.w) / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
    const empty = !boxes.length;
    if (!(x2 >= x1)) { x1 = 0; y1 = 0; x2 = 4 * PX; y2 = 2 * PX; }
    // show background grid (the backgrounds library): help lines at every 1cm over the picture and 1ex round it,
    // on the background layer; pgf-umlcd makes help lines thin blue dashes. bb0: the picture without it.
    const bb0 = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    let grid: any = null;
    if (G && !empty) {
      const minx = x1 / PT - G.sx, maxx = x2 / PT + G.sx, maxy = -y1 / PT + G.sy, miny = -y2 / PT - G.sy, on = (a: number, b: number) => {
        const out: number[] = [];
        for (let k = Math.ceil(a / CMPT - 1e-6); k <= Math.floor(b / CMPT + 1e-6); k++) out.push(k * CMPT);
        return out;
      };
      grid = { minx, miny, maxx, maxy, xs: on(minx, maxx), ys: on(miny, maxy), lw: GRID_LW, color: col('blue!50') };
      ext(X(minx - GRID_LW / 2), Y(maxy + GRID_LW / 2), X(maxx + GRID_LW / 2), Y(miny - GRID_LW / 2));
    }
    // package names and labels as text
    for (const p of pkgs) if (p.text) {
      const b = TD.textBox(sf(p.text.t), p.text.st);
      texts.push({ t: p.text.t, st: p.text.st, color: p.text.color, x: X(p.text.x) + (b.w - 2) / 2, y: Y(p.text.base) - baseOff(p.text.st) + b.h / 2, b });
    }
    for (const L of lines) for (const lb of L.labels) {
      const b = TD.textBox(sf(lb.t), lb.st);
      texts.push({ t: lb.t, st: lb.st, color: lb.color, x: X(lb.x), y: Y(lb.base) - baseOff(lb.st) + b.h / 2, b, ...(lb.rot ? { rot: lb.rot, rc: [X(lb.x), Y(lb.cy)] } : {}) });
    }
    return { M, nodes, boxes, rules, texts, lines, under, over, pkgs, paths, tips, warnings, empty, grid, bb0, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }

  // ---------------------------------------------------------------- arrow tips (PGF's old arrows)
  // Each tip is drawn in its own frame: x along the line, pointing out of it, from where the line now ends
  // (cut back by the tip's right extent R) — so the tip itself reaches the end the line had.
  function tipOf(kind: string, lw: number) {
    if (kind === 'angle 90' || kind === 'angle 60' || kind === 'angle 45' || kind === 'to' || kind === 'To') {
      const a = 0.3 + 0.25 * lw, h = kind === 'angle 60' ? 3.5 : kind === 'angle 45' ? 2.5 : 6;
      return { R: 0.5 * a + 0.707 * lw, pts: [[-5.5 * a, -h * a], [0.5 * a, 0], [-5.5 * a, h * a]], closed: false, fill: false };
    }
    if (kind === 'diamond' || kind === 'open diamond') {
      const a = 0.4 + 0.275 * lw;
      return kind === 'diamond'
        ? { R: a + 0.5 * lw, pts: [[a, 0], [-6 * a, 4 * a], [-13 * a, 0], [-6 * a, -4 * a]], closed: true, fill: true }
        : { R: 14 * a + 0.5 * lw, pts: [[14 * a, 0], [7 * a, 4 * a], [0, 0], [7 * a, -4 * a]], closed: true, fill: false };
    }
    if (/^(open )?triangle (45|60|90)$/.test(kind)) {
      const a = 0.5 + 0.25 * lw, open = kind.startsWith('open'), deg = kind.endsWith('90') ? 135 : kind.endsWith('60') ? 150 : 157;
      const r = (deg * Math.PI) / 180, tip = -10 * a * Math.cos(r);
      return { R: tip + 1.28 * lw, pts: [[tip, 0], [tip + 10 * a * Math.cos(r), 10 * a * Math.sin(r)], [tip + 10 * a * Math.cos(r), -10 * a * Math.sin(r)]], closed: true, fill: !open };
    }
    // stealth, latex and their arrows.meta cousins: filled
    const l = 3 + 4.5 * lw;
    return { R: lw / 2, pts: [[0, 0], [-l, 0.375 * l], [-0.675 * l, 0], [-l, -0.375 * l]], closed: true, fill: true };
  }
  function arrowed(L: any, where: any[]) {
    const S = L.S, pts = L.pts.map((p: number[]) => p.slice());
    const kindOf = (k: string | null) => (k === '>' ? S.tip : k);
    L.tipsPts = [];
    const tipList: any[] = [];
    for (const end of ['s', 'e']) {
      const k = kindOf(S.arrow[end]);
      if (!k) continue;
      const i = end === 'e' ? pts.length - 1 : 0, j = end === 'e' ? pts.length - 2 : 1;
      const E = pts[i], Q = pts[j], dx = E[0] - Q[0], dy = E[1] - Q[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      const T = tipOf(k, S.lw);
      const P = [E[0] - ux * T.R, E[1] - uy * T.R];
      pts[i] = P;
      const poly = T.pts.map(([x, y]: number[]) => [P[0] + ux * x - uy * y, P[1] + uy * x + ux * y]);
      tipList.push({ poly, closed: T.closed, fill: T.fill });
      L.tipsPts.push(...poly);
    }
    L.d = pts;
    where.push({ L, tips: tipList });
  }

  // ---------------------------------------------------------------- drawing
  const X = (v: number) => r2(v * PT), Y = (v: number) => r2(-v * PT);
  const dashOf = (d: string, lw: number) => (d === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : d === 'dot' ? ` stroke-dasharray="${r2(lw * PT)} ${r2(2 * PT)}"` : '');
  function boxSvg(b: any, ctx: any) {
    const S = b.S, sw = r2((S.lw || LW) * PT), fill = S.fill ? TD.css(S.fill) : 'none', stroke = S.draw ? TD.css(S.draw) : 'none';
    if (b.note) {
      // the folded corner
      const l = b.x, t = b.y, r = b.x + b.w, bt = b.y - b.h, f = FOLD;
      return `<path d="M${X(l)},${Y(bt)}L${X(l)},${Y(t)}L${X(r - f)},${Y(t)}L${X(r)},${Y(t - f)}L${X(r)},${Y(bt)}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"${dashOf(S.dash, S.lw)}/>` +
        `<path d="M${X(r - f)},${Y(t)}L${X(r - f)},${Y(t - f)}L${X(r)},${Y(t - f)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    const rx = S.rounded ? ` rx="${r2(S.rounded * PT)}"` : '';
    return `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${r2(b.w * PT)}" height="${r2(b.h * PT)}"${rx} fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashOf(S.dash, S.lw)}/>`;
  }
  function lineSvg(w: any, ctx: any, ink: string) {
    const L = w.L, S = L.S, c = S.color ? TD.css(S.color) : ink, sw = r2(S.lw * PT);
    let out = `<path d="${L.d.map((p: number[], i: number) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="miter"${dashOf(S.dash, S.lw)}/>`;
    for (const t of w.tips) {
      const d = t.poly.map((p: number[], i: number) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('') + (t.closed ? 'Z' : '');
      out += `<path d="${d}" fill="${t.fill ? c : 'none'}" stroke="${c}" stroke-width="${sw}" stroke-linejoin="miter" stroke-linecap="${t.closed ? 'butt' : 'round'}"/>`;
    }
    return out;
  }
  function draw(s: any, ctx: any) {
    const Lo = layout(s);
    const ink = TD.css('#000000');
    let out = '';
    if (Lo.empty) {
      const b = Lo.bb;
      out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW * PT)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty class diagram', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
    }
    const g = Lo.grid;
    if (g) {
      // each line on its own, upwards and rightwards as PGF draws a grid, so the dashes start where TikZ's do
      const d = g.xs.map((x: number) => `M${X(x)},${Y(g.miny)}V${Y(g.maxy)}`).join('') + g.ys.map((y: number) => `M${X(g.minx)},${Y(y)}H${X(g.maxx)}`).join('');
      out += `<path d="${d}" fill="none" stroke="${TD.css(g.color)}" stroke-width="${r2(g.lw * PT)}"${dashOf('dash', g.lw)}/>`;
    }
    for (const p of Lo.pkgs) if (p.box) out += boxSvg(p.box, ctx) + boxSvg(p.cap, ctx);
    for (const w of Lo.under) out += lineSvg(w, ctx, ink);
    for (const b of Lo.boxes) out += boxSvg(b, ctx);
    for (const r of Lo.rules) out += `<path d="M${X(r.x1)},${Y(r.y)}L${X(r.x2)},${Y(r.y)}" stroke="${r.S.draw ? TD.css(r.S.draw) : 'none'}" stroke-width="${r2(r.S.lw * PT)}"/>`;
    for (const w of Lo.over) out += lineSvg(w, ctx, ink);
    for (const t of Lo.texts) {
      const svg = TD.textSvg(sf(t.t), t.st, t.color || '#000000', t.x, t.y, ctx);
      out += t.rot ? `<g transform="rotate(${r2(-t.rot)} ${r2(t.rc[0])} ${r2(t.rc[1])})">${svg}</g>` : svg;
    }
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  function fullCode(src: any) {
    const t = String(src || '').trim();
    return /\\begin\{tikzpicture\}/.test(t) ? t : `\\begin{tikzpicture}\n${t}\n\\end{tikzpicture}`;
  }
  // A whole tikzpicture with pgf-umlcd classes in it, as written in a document (or as exported here: one scope
  // shifted to where the block sat) → a UML block, or null. The rest of the picture's code goes with it.
  // the \end{scope} that closes a scope whose body starts at i (scopes inside it skipped), or -1
  function scopeEnd(s: string, i: number) {
    let d = 1;
    for (const m of s.slice(i).matchAll(/\\(begin|end)\{scope\}/g)) if ((d += m[1] === 'begin' ? 1 : -1) === 0) return i + m.index!;
    return -1;
  }
  function fromPicture(t: string) {
    t = String(t || '').trim();
    if (!/\\begin\s*\{(class|interface|abstractclass|staticclass|object)\}/.test(stripComments(t))) return null;
    const bm = /^\\begin\{tikzpicture\}\s*/.exec(t), end = t.lastIndexOf('\\end{tikzpicture}');
    if (!bm || end < 0) return null;
    let i = bm[0].length, env = '';
    // not the options a page's picture has (it is placed on the paper; the class diagram is in its scope)
    if (t[i] === '[') { const e = close(t, i); if (e < 0) return null; env = opts(t.slice(i + 1, e)).filter((o) => !/^(?:[xy]\s*=\s*1\s*cm|remember picture|overlay|shift\s*=\s*\{?\s*\(\s*current page\b.*)$/.test(o)).join(', '); i = e + 1; }
    let body = t.slice(i, end), at: [number, number] | null = null;
    const sm = /^\s*\\begin\{scope\}\s*\[/.exec(body);
    if (sm) {
      const ob = sm[0].length - 1, oe = close(body, ob), se = scopeEnd(body, oe + 1);
      // more after the class diagram's scope (a page's other objects): not one class diagram
      if (se >= 0 && body.slice(se + 11).trim()) return null;
      const o = oe > 0 ? opts(body.slice(ob + 1, oe)) : [], sh = o.length ? kv(o[0]) : null;
      const p = sh && sh.k === 'shift' && sh.v ? xy(unbrace(sh.v)) : null;
      if (p && se > oe && !/\\begin\{scope\}/.test(body.slice(oe, se))) {
        at = p;
        if (o.length > 1) env = [env, ...o.slice(1)].filter(Boolean).join(', ');
        body = body.slice(oe + 1, se);
        // the grid written out on export, when the option asking for it came along
        if (gridOf(env)) body = body.replace(/^\s*\n/, '').replace(GRID_RE, '');
      }
    }
    const lines = body.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
    const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length));
    const src = `\\begin{tikzpicture}${env ? `[${env}]` : ''}\n${lines.map((l) => (l.trim() ? '  ' + l.slice(isFinite(ind) ? ind : 0) : '')).join('\n')}\n\\end{tikzpicture}`;
    const s: any = { type: 'uml', x: 0, y: 0, src };
    const b = layout(s).bb;
    s.x = (at ? at[0] * PX : 0) + b.x; s.y = (at ? -at[1] * PX : 0) + b.y;
    return s;
  }
  const gridLine = (g: any) => `\\begin{pgfonlayer}{background}\\draw[help lines] (${num(g.minx / CMPT)},${num(g.miny / CMPT)}) grid (${num(g.maxx / CMPT)},${num(g.maxy / CMPT)});\\end{pgfonlayer}`;
  const GRID_RE = /^\s*\\begin\{pgfonlayer\}\{background\}\\draw\[help lines\] \([^()]*\) grid \([^()]*\);\\end\{pgfonlayer\}[ \t]*\n/;
  // the libraries the code asks for beyond pgf-umlcd's own
  function libsOf(src: any) {
    const libs: string[] = [];
    if (/(?:>|-)\s*=?\s*\{?\s*(Stealth|Latex|Triangle|To)\b/.test(src)) libs.push('arrows.meta');
    return libs;
  }
  // the width a class needs for its widest line, in cm, rounded up to a millimetre
  function fitWidth(c: any) {
    const ls = [c.env === 'object' && c.instanceOf != null ? `\\underline{\\textbf{${c.name} : ${c.instanceOf}}}` : `\\textbf{${c.name}}`, ...(STEREO[c.env] ? [`$<<$${STEREO[c.env]}$>>$`] : []), ...c.attrs, ...c.ops.map((o: any) => o.t)];
    let w = 0;
    c.ops.forEach((o: any) => { if (o.n === '0') w = Math.max(w, (TD.textBox(sf(o.t), { ...TEXT, italic: true }).w - 2) * K); });
    for (const t of ls) w = Math.max(w, (TD.textBox(sf(t), TEXT).w - 2) * K);
    return Math.max(1.5, Math.ceil((w + 2) / CMPT * 10) / 10);
  }

  TD.TYPES.uml = {
    name: 'UML class diagram',
    pts: [['x', 'y']],
    create: (p: any) => ({ type: 'uml', x: p.x, y: p.y, src: TD.UML_DEFAULT }),
    drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the picture's own coordinates, its tikzpicture turned into a scope moved to where the drawing sits
    tikz(s: any, X: any) {
      X.pkgs.add('pgf-umlcd');
      for (const l of libsOf(s.src)) X.libs.add(l);
      const Lo = layout(s), b = Lo.bb, o = [`shift={${X.c(s.x - b.x, s.y - b.y)}}`];
      const t = fullCode(s.src), m = /\\begin\{tikzpicture\}(\s*\[)?/.exec(t);
      let env = '', i = m!.index + m![0].length;
      if (m![1]) { const e = close(t, i - 1); env = t.slice(i, e).trim(); i = e + 1; }
      const end = t.lastIndexOf('\\end{tikzpicture}');
      let body = t.slice(i, end < 0 ? t.length : end).replace(/^\s*\n/, '').replace(/\s+$/, '');
      if (env) o.push(env);
      // show background grid works on the picture only, so the grid it would draw is written out (the option stays,
      // doing nothing on the scope, and import reads the line back as it)
      if (Lo.grid) body = `  ${gridLine(Lo.grid)}\n${body}`;
      return `\\begin{scope}[${o.join(', ')}]\n${body}\n\\end{scope}`;
    },
  };

  // for the visual editor (src/editors/umleditor.ts)
  TD.uml = { parse, write, settle, layout, draw, kv, opts, unbrace, fullCode, num, fitWidth, nodeStyle, fromPicture, KINDS, STEREO, RELS, CMPT, libsOf, POS, PLACE };
  // TeX's text metrics, shared with the sequence diagram (src/domain/umlsd.ts)
  TD.texText = { hd, baseOff, close, split };
  TD.blocks.register('uml', {
    menu: { order: 9.5, label: 'Class', title: 'UML class diagram, written for pgf-umlcd', icon: '<svg viewBox="0 0 32 24"><rect x="2" y="3" width="12" height="18" rx="1"/><path d="M2 8h12M2 14h12M14 12h5M19 9l3 3-3 3z"/><rect x="22" y="7" width="8" height="10" rx="1"/><path d="M22 11h8"/></svg>' },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    editor: { get: () => TD.umlEditor, alias: 'umlOpen', layout: (s: any) => TD.uml.layout(s) },
  });
  panelServices = { layout, libsOf, fullCode };
})();
