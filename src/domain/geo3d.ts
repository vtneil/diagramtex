import type { Vec3 } from './contracts';
import type { TextSpan } from './contracts';
export let panelServices: any;
import { runtime as TD } from '../runtime';
// 3D geometry block: a tikz-3dplot picture. The code is the object. It is drawn on the canvas by reading the
// commands it uses (\tdplotsetmaincoords, \tdplotsetcoord, \tdplotdrawarc, rotated frames, theta planes,
// \coordinate, \draw / \fill / \filldraw / \shade / \node paths with --, cycle, circle, ellipse, arc,
// rectangle, plot and nodes), and exported as written with \usepackage{tikz-3dplot}.
// The projection is tikz-3dplot's own: \tdplotsetmaincoords{θ}{φ} turns the scene by θ about x and φ about z.
// TD.geo3d: { parse, layout, draw, edits, … } for the visual editor (g3editor.ts).
(function () {
  const V3 = TD.V3;
  const { esc, r2 } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;
  const D2R = Math.PI / 180;
  const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a: readonly number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

  // ================================================================ scanning
  const SHUT: Record<string, any> = { '{': '}', '[': ']', '(': ')' };
  // the index just after the group that opens at i ('{', '[' or '('), or -1 when it never closes
  function close(src: string, i: number): number {
    const open = src[i], shut = SHUT[open];
    let d = 0;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '%') { const n = src.indexOf('\n', j); if (n < 0) return -1; j = n; continue; }
      if (c === '{' && open !== '{') { const k = close(src, j); if (k < 0) return -1; j = k - 1; continue; }
      if (c === open) d++;
      else if (c === shut) { d--; if (!d) return j + 1; }
    }
    return -1;
  }
  // split at top-level commas: [{ s, e, t }] with spans in src
  function splitTop(src: string, s: number, e: number, sep = ','): TextSpan[] {
    const out = [];
    let a = s;
    for (let j = s; j < e; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '{' || c === '[' || c === '(') { const k = close(src, j); if (k < 0 || k > e) break; j = k - 1; continue; }
      if (c === sep) { out.push(trimSpan(src, a, j)); a = j + 1; }
    }
    out.push(trimSpan(src, a, e));
    return out.filter((x) => x.e > x.s);
  }
  function trimSpan(src: string, s: number, e: number): TextSpan {
    while (s < e && /\s/.test(src[s])) s++;
    while (e > s && /\s/.test(src[e - 1])) e--;
    return { s, e, t: src.slice(s, e) };
  }
  const unbrace = (t: any) => { t = String(t).trim(); return t[0] === '{' && t[t.length - 1] === '}' && close(t, 0) === t.length ? t.slice(1, -1).trim() : t; };
  // options [k=v, …] inside a span: [{ s, e, t, k, v }]
  function optList(src: any, s: any, e: any) {
    return splitTop(src, s, e).map((x) => {
      const eq = splitTop(src, x.s, x.e, '=');
      if (eq.length > 1) return { ...x, k: eq[0].t.trim(), v: unbrace(src.slice(eq[1].s, x.e)) };
      return { ...x, k: x.t.trim(), v: null };
    });
  }
  const skipWs = (src: any, j: any, nl = true) => { while (j < src.length && (nl ? /\s/ : /[ \t]/).test(src[j])) j++; return j; };
  // groups right after j: [{ o: '{' | '[', s, e, is, ie, t }]
  function groups(src: any, j: any, max = 12) {
    const out = [];
    for (;;) {
      const k = skipWs(src, j, false);
      if (out.length >= max || (src[k] !== '{' && src[k] !== '[')) return { args: out, end: j };
      const e = close(src, k);
      if (e < 0) return { args: out, end: j, broken: true };
      out.push({ o: src[k], s: k, e, is: k + 1, ie: e - 1, t: src.slice(k + 1, e - 1) });
      j = e;
    }
  }

  // the \end{scope} closing a \begin{scope} whose body starts at j (the first point where the ends after j
  // outnumber the begins), or null. All are matched in one pass per text: scanning from every \begin would be
  // quadratic on thousands of unclosed scopes.
  let scopeSrc: any = null, scopeTok: any[] = [], scopeNext: Int32Array = new Int32Array(0);
  function scopeEnd(src: string, j: number) {
    if (src !== scopeSrc) {
      scopeSrc = src; scopeTok = [];
      const sc = /\\(begin|end)\s*\{scope\}/g;
      let m;
      while ((m = sc.exec(src))) scopeTok.push({ b: m[1] === 'begin', index: m.index, length: m[0].length });
      // P[q]: ends minus begins before token q; scopeNext[q]: the first token k >= q with P[k + 1] = P[q] + 1
      const n = scopeTok.length, P = new Int32Array(n + 1);
      for (let k = 0; k < n; k++) P[k + 1] = P[k] + (scopeTok[k].b ? -1 : 1);
      scopeNext = new Int32Array(n + 1).fill(-1);
      const firstAt = new Map<number, number>([[P[n], n]]);
      for (let q = n - 1; q >= 0; q--) {
        const at = firstAt.get(P[q] + 1);
        if (at != null) scopeNext[q] = at - 1;
        firstAt.set(P[q], q);
      }
    }
    // the first token at or after j
    let lo = 0, hi = scopeTok.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (scopeTok[mid].index < j) lo = mid + 1; else hi = mid; }
    const k = scopeNext[lo];
    return k >= 0 ? scopeTok[k] : null;
  }
  const PATHS = new Set(['draw', 'fill', 'filldraw', 'path', 'shade', 'shadedraw', 'clip', 'node', 'coordinate', 'pattern', 'pic']);
  // the statements of the code, each with its span and what it says, spans being offsets into src
  function parse(src: any, from = 0, to: any = null, max = Infinity) : any {
    src = String(src || '');
    if (to == null) to = src.length;
    const out = [];
    const re = /\\([A-Za-z@]+)\*?/y;
    let i = from;
    while (i < to && out.length < max) {
      i = skipWs(src, i);
      if (i >= to) break;
      const s = i;
      if (src[i] === '%') { let e = src.indexOf('\n', i); if (e < 0) e = src.length; out.push({ k: 'comment', s, e }); i = e; continue; }
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) { let e = src.indexOf('\n', i); if (e < 0) e = src.length; out.push({ k: 'raw', s, e }); i = e; continue; }
      const name = m[1];
      let j = re.lastIndex;
      if (name === 'begin' || name === 'end') {
        const g = groups(src, j, 1), env = g.args[0] ? g.args[0].t.trim() : '';
        j = g.end;
        if (env === 'scope' && name === 'begin') {
          // its body runs to the matching \end{scope}
          let k = skipWs(src, j, false), o = null;
          if (src[k] === '[') { const e = close(src, k); if (e > 0) { o = { s: k + 1, e: e - 1 }; j = e; } }
          const m2 = scopeEnd(src, j);
          if (!m2) { out.push({ k: 'raw', s, e: j, bad: '\\begin{scope} has no \\end{scope}' }); i = j; continue; }
          out.push({ k: 'scope', s, e: m2.index + m2.length, o, oAt: s + src.slice(s, j).indexOf('}') + 1, body: { s: j, e: m2.index } });
          i = m2.index + m2.length; continue;
        }
        if (env === 'tikzpicture') {
          if (name === 'begin') {
            const k = skipWs(src, j, false);
            let o = null;
            if (src[k] === '[') { const e = close(src, k); if (e > 0) { o = { s: k + 1, e: e - 1 }; j = e; } }
            out.push({ k: 'begin', s, e: j, o, at: j });
          } else out.push({ k: 'end', s, e: j });
        } else out.push({ k: 'raw', s, e: j, name });
        i = j; continue;
      }
      if (name === 'foreach') {
        // \foreach \x[/\y…] [count=\i] in {list} {body} — or a single statement as the body
        const hv = /\s*(?=((?:\\[A-Za-z@]+\s*(?:\/\s*)?)+))\1(\[[^\]]*\])?\s*in\s*/y; // the lookahead makes the names atomic (no backtracking)
        hv.lastIndex = j;
        const h = hv.exec(src);
        let k = h ? hv.lastIndex : -1;
        if (h && src[k] === '{') {
          const le = close(src, k);
          let b = le > 0 ? skipWs(src, le) : -1, body = null, e = -1;
          if (b >= 0 && src[b] === '{') { const be = close(src, b); if (be > 0) { body = { s: b + 1, e: be - 1 }; e = be; } }
          else if (b >= 0) { const one: any = parse(src, b, to, 1)[0]; if (one) { body = { s: one.s, e: one.e }; e = one.e; } }
          if (body) {
            const vars = h[1].split('/').map((v) => v.trim().replace(/^\\/, '')).filter(Boolean);
            const cnt = h[2] ? /count\s*=\s*\\([A-Za-z@]+)/.exec(h[2]) : null;
            out.push({ k: 'foreach', s, e, vars, count: cnt ? cnt[1] : null, list: { s: k + 1, e: le - 1 }, body });
            i = e; continue;
          }
        }
        const nl = src.indexOf('\n', j);
        out.push({ k: 'raw', s, e: nl < 0 ? to : nl, bad: '\\foreach is beyond what the editor reads' });
        i = nl < 0 ? to : nl; continue;
      }
      if (PATHS.has(name)) {
        let e = -1;
        for (let k = j; k < src.length; k++) {
          const c = src[k];
          if (c === '\\') { k++; continue; }
          if (c === '%') { const n = src.indexOf('\n', k); if (n < 0) break; k = n; continue; }
          if (c === '{' || c === '[' || c === '(') { const q = close(src, k); if (q < 0) break; k = q - 1; continue; }
          if (c === ';') { e = k + 1; break; }
        }
        if (e < 0) { out.push({ k: 'raw', s, e: src.length, bad: `\\${name} is missing its closing ;` }); break; }
        out.push(pathStmt(src, name, s, j, e));
        i = e; continue;
      }
      if (name === 'def') {
        const n = /\\([A-Za-z@]+)/y; n.lastIndex = j;
        const mm = n.exec(src);
        if (mm) {
          const k = n.lastIndex;
          const g = groups(src, k, 1);
          if (g.args[0]) { out.push({ k: 'macro', s, e: g.end, name: mm[1], v: { s: g.args[0].is, e: g.args[0].ie } }); i = g.end; continue; }
        }
        out.push({ k: 'raw', s, e: j }); i = j; continue;
      }
      const g = groups(src, j);
      const A = g.args, B = A.filter((a) => a.o === '{'), O = A.filter((a) => a.o === '[');
      const sp = (a: any) => ({ s: a.is, e: a.ie });
      let st: Record<string, any> = { k: 'cmd', s, e: g.end, name };
      if (name === 'tdplotsetmaincoords' && B.length >= 2) st = { k: 'main', s, e: g.end, th: sp(B[0]), ph: sp(B[1]) };
      else if ((name === 'tdplotsetcoord' || name === 'tdplotsimplesetcoord') && B.length >= 4) st = { k: 'setcoord', s, e: g.end, simple: name !== 'tdplotsetcoord', name: B[0].t.trim(), nameSpan: sp(B[0]), r: sp(B[1]), th: sp(B[2]), ph: sp(B[3]) };
      else if (name === 'tdplotdrawarc' && B.length >= 6) st = { k: 'arc', s, e: g.end, o: O[0] ? sp(O[0]) : null, oAt: B[0].s, c: sp(B[0]), r: sp(B[1]), a0: sp(B[2]), a1: sp(B[3]), lo: sp(B[4]), text: sp(B[5]) };
      else if (name === 'tdplotsetrotatedcoords' && B.length >= 3) st = { k: 'rot', s, e: g.end, a: sp(B[0]), b: sp(B[1]), g: sp(B[2]) };
      else if (name === 'tdplotsetrotatedcoordsorigin' && B.length >= 1) st = { k: 'rorig', s, e: g.end, at: sp(B[0]) };
      else if (name === 'tdplotresetrotatedcoordsorigin') st = { k: 'rreset', s, e: g.end };
      else if (name === 'tdplotsetthetaplanecoords' && B.length >= 1) st = { k: 'tplane', s, e: g.end, ph: sp(B[0]) };
      else if ((name === 'pgfmathsetmacro' || name === 'newcommand' || name === 'renewcommand') && B.length >= 2 && /^\s*\\[A-Za-z@]+\s*$/.test(B[0].t)) st = { k: 'macro', s, e: g.end, name: B[0].t.trim().slice(1), v: sp(B[1]), pgf: name === 'pgfmathsetmacro' };
      out.push(st);
      i = Math.max(g.end, i + 1);
    }
    return out;
  }

  // ---------------------------------------------------------------- a path statement
  function pathStmt(src: any, cmd: any, s: any, j: any, e: any) {
    const st: Record<string, any> = { k: 'path', cmd, s, e, o: null, oAt: j, els: [] };
    let k = skipWs(src, j);
    if (src[k] === '[') { const q = close(src, k); if (q > 0) { st.o = { s: k + 1, e: q - 1 }; k = q; } }
    const end = e - 1; // the ;
    // \pic[options] {angle = A--B--C}: the angles library's marks
    if (cmd === 'pic') {
      st.k = 'pic';
      k = skipWs(src, k);
      if (src[k] === '{') { const q = close(src, k); if (q > 0) st.body = { s: k + 1, e: q - 1 }; }
      return st;
    }
    if (cmd === 'node' || cmd === 'coordinate') {
      st.k = cmd;
      for (;;) {
        k = skipWs(src, k);
        if (k >= end) break;
        const c = src[k];
        if (c === '[') { const q = close(src, k); if (q < 0) break; if (!st.o) st.o = { s: k + 1, e: q - 1 }; k = q; continue; }
        if (c === '(') { const q = close(src, k); if (q < 0) break; if (st.atPt) { k = q; continue; } if (!st.name) st.name = src.slice(k + 1, q - 1).trim(); k = q; continue; }
        if (src.startsWith('at', k) && /[\s(]/.test(src[k + 2] || '')) {
          const p = skipWs(src, k + 2);
          if (src[p] === '(') { const q = close(src, p); if (q < 0) break; st.atPt = { s: p, e: q, is: p + 1, ie: q - 1 }; k = q; continue; }
        }
        if (c === '{') { const q = close(src, k); if (q < 0) break; st.text = { s: k + 1, e: q - 1 }; k = q; continue; }
        k++;
      }
      return st;
    }
    st.els = pathEls(src, k, end);
    return st;
  }
  function pathEls(src: any, k: any, end: any) {
    const els = [];
    const word = /[A-Za-z]+/y;
    while (k < end) {
      k = skipWs(src, k);
      if (k >= end) break;
      const c = src[k];
      if (src.startsWith('++(', k) || src.startsWith('+(', k)) {
        const rel = src[k + 1] === '+' ? '++' : '+', p = k + rel.length, q = close(src, p);
        if (q < 0) break;
        els.push({ t: 'pt', rel, s: k, e: q, is: p + 1, ie: q - 1 }); k = q; continue;
      }
      if (c === '(') { const q = close(src, k); if (q < 0) break; els.push({ t: 'pt', rel: '', s: k, e: q, is: k + 1, ie: q - 1 }); k = q; continue; }
      if (src.startsWith('--', k) || src.startsWith('-|', k) || src.startsWith('|-', k)) { els.push({ t: 'op', v: src.slice(k, k + 2), s: k, e: k + 2 }); k += 2; continue; }
      if (src.startsWith('..', k)) { els.push({ t: 'bad', v: 'curves with ..controls..', s: k, e: k + 2 }); k += 2; continue; }
      word.lastIndex = k;
      const m = word.exec(src);
      if (!m) { k++; continue; }
      const w = m[0];
      let q = word.lastIndex;
      if (w === 'cycle') { els.push({ t: 'cycle', s: k, e: q }); k = q; continue; }
      if (w === 'node' || w === 'coordinate') {
        const el: Record<string, any> = { t: w, s: k, e: q, o: null };
        for (;;) {
          const p = skipWs(src, q);
          if (src[p] === '[') { const r = close(src, p); if (r < 0) break; el.o = { s: p + 1, e: r - 1 }; q = r; continue; }
          if (src[p] === '(' && w === 'coordinate' && !el.name) { const r = close(src, p); if (r < 0) break; el.name = src.slice(p + 1, r - 1).trim(); q = r; continue; }
          if (src[p] === '(' && w === 'node' && !el.name && !el.text) { const r = close(src, p); if (r < 0) break; el.name = src.slice(p + 1, r - 1).trim(); q = r; continue; }
          if (src[p] === '{' && w === 'node') { const r = close(src, p); if (r < 0) break; el.text = { s: p + 1, e: r - 1 }; q = r; break; }
          break;
        }
        el.e = q; els.push(el); k = q; continue;
      }
      if (w === 'circle' || w === 'ellipse' || w === 'arc') {
        const el: Record<string, any> = { t: w, s: k, e: q };
        let p = skipWs(src, q);
        if (src[p] === '[') { const r = close(src, p); if (r < 0) break; el.o = { s: p + 1, e: r - 1 }; q = r; p = skipWs(src, q); }
        if (src[p] === '(' && !(w !== 'arc' && el.o)) { const r = close(src, p); if (r < 0) break; el.a = { s: p + 1, e: r - 1 }; q = r; }
        el.e = q; els.push(el); k = q; continue;
      }
      if (w === 'rectangle') { els.push({ t: 'rect', s: k, e: q }); k = q; continue; }
      if (w === 'grid') {
        const el: Record<string, any> = { t: 'grid', s: k, e: q }, p = skipWs(src, q);
        if (src[p] === '[') { const r = close(src, p); if (r < 0) break; el.o = { s: p + 1, e: r - 1 }; el.e = r; }
        els.push(el); k = el.e; continue;
      }
      if (w === 'plot') {
        const el: Record<string, any> = { t: 'plot', s: k, e: q };
        let p = skipWs(src, q);
        if (src[p] === '[') { const r = close(src, p); if (r < 0) break; el.o = { s: p + 1, e: r - 1 }; q = r; p = skipWs(src, q); }
        if (src[p] === '(') { const r = close(src, p); if (r < 0) break; el.a = { s: p + 1, e: r - 1 }; q = r; }
        el.e = q; els.push(el); k = q; continue;
      }
      els.push({ t: 'bad', v: w, s: k, e: q }); k = q;
    }
    return els;
  }

  // ================================================================ numbers (pgfmath: angles in degrees)
  const UNIT: Record<string, any> = { pt: 1 / 28.4528, cm: 1, mm: 0.1, in: 2.54, bp: 2.54 / 72, em: 0.35, ex: 0.15 };
  const FN: Record<string, any> = {
    sin: (x: any) => Math.sin(x * D2R), cos: (x: any) => Math.cos(x * D2R), tan: (x: any) => Math.tan(x * D2R),
    sec: (x: any) => 1 / Math.cos(x * D2R), cosec: (x: any) => 1 / Math.sin(x * D2R), cot: (x: any) => 1 / Math.tan(x * D2R),
    asin: (x: any) => Math.asin(x) / D2R, acos: (x: any) => Math.acos(x) / D2R, atan: (x: any) => Math.atan(x) / D2R, atan2: (y: any, x: any) => Math.atan2(y, x) / D2R,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2, pow: Math.pow,
    min: Math.min, max: Math.max, mod: (a: any, b: any) => a % b, round: Math.round, floor: Math.floor, ceil: Math.ceil, int: Math.trunc,
    sign: Math.sign, deg: (x: any) => x / D2R, rad: (x: any) => x * D2R, veclen: (a: any, b: any) => Math.hypot(a, b), sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  };
  // { v, unit } of an expression; macros from env (\name → number), \x-style variables from vars
  function evalExpr(txt: any, env?: any, vars?: any) {
    const s = unbrace(String(txt ?? ''));
    let p = 0, unit = false;
    const ws = () => { while (p < s.length && /\s/.test(s[p])) p++; };
    const peek = () => { ws(); return s[p]; };
    function expr() : any {
      let a: any = term();
      for (;;) { const c = peek(); if (c === '+') { p++; a += term(); } else if (c === '-') { p++; a -= term(); } else return a; }
    }
    function term() : any {
      let a: any = unary();
      for (;;) { const c = peek(); if (c === '*') { p++; a *= unary(); } else if (c === '/') { p++; a /= unary(); } else return a; }
    }
    function unary() : any { const c = peek(); if (c === '-') { p++; return -unary(); } if (c === '+') { p++; return unary(); } return power(); }
    function power() : any { const a: any = postfix(); if (peek() === '^') { p++; return Math.pow(a, unary()); } return a; }
    function postfix() : any {
      let a: any = atom();
      ws();
      const m = /^(pt|cm|mm|in|bp|em|ex)(?![A-Za-z])/.exec(s.slice(p));
      if (m) { a *= UNIT[m[1]]; unit = true; p += m[1].length; }
      else if (s[p] === 'r' && !/[A-Za-z]/.test(s[p + 1] || '')) { a /= D2R; p++; }
      return a;
    }
    function atom() : any {
      const c = peek();
      if (c === '(') { p++; const a: any = expr(); if (peek() !== ')') throw new Error('missing )'); p++; return a; }
      if (c === '{') { p++; const a = expr(); if (peek() !== '}') throw new Error('missing }'); p++; return a; }
      const n = /^(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+)/.exec(s.slice(p));
      if (n) { p += n[0].length; return parseFloat(n[0]); }
      const mac = /^\\([A-Za-z@]+)/.exec(s.slice(p));
      if (mac) {
        p += mac[0].length;
        if (vars && mac[1] in vars) return vars[mac[1]];
        if (env && env.has(mac[1])) return env.get(mac[1]);
        if (mac[1] === 'pgfmathresult') return 0;
        throw new Error(`\\${mac[1]} is not defined`);
      }
      const id = /^([A-Za-z]+\d*)/.exec(s.slice(p));
      if (id) {
        p += id[0].length;
        const w = id[1];
        if (w === 'pi') return Math.PI;
        if (w === 'e') return Math.E;
        const uf = env && env.funcs && env.funcs[w];
        if (uf) {
          if (peek() !== '(') throw new Error(`${w} needs (…)`);
          p++;
          const args = [expr()];
          while (peek() === ',') { p++; args.push(expr()); }
          if (peek() !== ')') throw new Error('missing )');
          p++;
          const v2 = { ...(vars || {}) };
          uf.params.forEach((q: any, i: any) => { v2[q] = args[i]; });
          if ((env.depth = (env.depth || 0) + 1) > 40) { env.depth = 0; throw new Error(`${w} calls itself too deeply`); }
          try { return evalExpr(uf.body, env, v2).v; } finally { env.depth--; }
        }
        if (FN[w]) {
          if (peek() !== '(') throw new Error(`${w} needs (…)`);
          p++;
          const args = [expr()];
          while (peek() === ',') { p++; args.push(expr()); }
          if (peek() !== ')') throw new Error('missing )');
          p++;
          return FN[w](...args);
        }
        throw new Error(`unknown ${w}`);
      }
      throw new Error(c ? `unexpected ${c}` : 'a number is missing');
    }
    const v = expr();
    ws();
    if (p < s.length) throw new Error(`unexpected ${s[p]}`);
    return { v, unit };
  }

  // a \foreach list with its ranges written out: {0,0.2,...,1}, {1,...,5}, {a/b, c/d}
  function listValues(text: any, env: any) {
    const items = splitTop(text, 0, text.length).map((x) => x.t);
    const num = (t: any) => { try { return evalExpr(t, env).v; } catch (e: any) { return NaN; } };
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      if (t === '...' || t === '\\ldots') {
        const a = num(out[out.length - 1]), b0: any = out.length > 1 ? num(out[out.length - 2]) : NaN, end = num(items[i + 1]);
        if (!isFinite(a) || !isFinite(end)) continue;
        const step: any = isFinite(b0) ? a - b0 : end >= a ? 1 : -1;
        if (!step || (end - a) / step < 0) continue;
        for (let v: any = a + step, n = 0; (step > 0 ? v < end - 1e-9 : v > end + 1e-9) && n < 5000; v += step, n++) out.push(String(Math.round(v * 1e6) / 1e6));
        continue;
      }
      out.push(t);
    }
    return out;
  }

  // ================================================================ projection
  // main → screen (cm), exactly as tikz-3dplot's tdplot_main_coords
  function viewOf(th: any, ph: any) {
    const ct = Math.cos(th * D2R), st = Math.sin(th * D2R), cp = Math.cos(ph * D2R), sp = Math.sin(ph * D2R);
    return {
      th, ph, ct, st, cp, sp,
      P: (m: any) => [m[0] * cp + m[1] * sp, (-m[0] * sp + m[1] * cp) * ct + m[2] * st],
      dv: [st * sp, -st * cp, ct], // towards the viewer
    };
  }
  // tikz-3dplot's Euler rotation, rotated → main: Rz(α) Ry(β) Rz(γ)
  function euler(a: any, b: any, g: any) {
    const [ca, sa, cb, sb, cg, sg] = [a, a, b, b, g, g].map((x, i) => (i % 2 ? Math.sin : Math.cos)(x * D2R));
    return [
      [ca * cb * cg - sa * sg, -ca * cb * sg - sa * cg, ca * sb],
      [sa * cb * cg + ca * sg, -sa * cb * sg + ca * cg, sa * sb],
      [-sb * cg, sb * sg, cb],
    ];
  }
  const app = (R: any, v: any) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
  const appT = (R: any, v: any) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // ================================================================ styles
  const WIDTHS: Record<string, any> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  const DASHES = ['dashed', 'densely dashed', 'loosely dashed', 'dotted', 'densely dotted', 'loosely dotted', 'dash dot', 'solid'];
  const FRAMES = ['tdplot_main_coords', 'tdplot_rotated_coords', 'tdplot_screen_coords'];
  const POS: Record<string, any> = { above: 'south', below: 'north', left: 'east', right: 'west', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
  const colorHex = (c: any) => { if (!c) return null; const h = TD.tikzColor ? TD.tikzColor(c) : null; return h || null; };
  const isArrow = (k: any) => /^(<|>|\||\{?[A-Za-z]+(\[[^\]]*\])?\}?)?-(>|<|\||\{?[A-Za-z]+(\[[^\]]*\])?\}?)?$|^[<>|]+-[<>|]*$|^-[<>|]+$/.test(k) && k.includes('-') && k !== '-';
  // what an option list says: { draw, fill, text, w, dash, arrow, arrow0, op, fop, dop, frame, ball, anchor, pos, rest }
  function styleOf(src: any, span: any, base?: any) {
    const O = span ? optList(src, span.s, span.e) : [];
    const st = base ? { ...base, items: O, anchor: undefined, pos: undefined } : { items: O, w: 0.4 };
    for (const o of O) {
      const k = o.k, v = o.v;
      if (v == null) {
        if (WIDTHS[k] != null) st.w = WIDTHS[k];
        else if (DASHES.includes(k)) st.dash = k === 'solid' ? null : k;
        else if (FRAMES.includes(k)) st.frame = k.split('_')[1];
        else if (POS[k]) st.anchor = POS[k];
        else if (k === 'midway') st.pos = 0.5;
        else if (k === 'near start') st.pos = 0.25;
        else if (k === 'near end') st.pos = 0.75;
        else if (k === 'at start') st.pos = 0;
        else if (k === 'at end') st.pos = 1;
        else if (k === 'draw') st.drawOn = true;
        else if (k === 'double') st.double = '#ffffff';
        else if (k === 'fill') st.fillOn = true;
        else if (isArrow(k)) { const [a, b] = [k.slice(0, k.lastIndexOf('-')), k.slice(k.lastIndexOf('-') + 1)]; st.arrow0 = !!a; st.arrow = !!b; st.tip = /^[<>]$/.test(b || a) ? 'to' : null; }
        else if (colorHex(k)) st.color = colorHex(k);
      } else {
        if (k === 'color') st.color = colorHex(v) || st.color;
        else if (k === 'draw') { st.drawOn = v !== 'none'; st.draw = colorHex(v); }
        else if (k === 'fill') { st.fillOn = v !== 'none'; st.fill = colorHex(v); }
        else if (k === 'text') st.text = colorHex(v);
        else if (k === 'line width') { try { const r = evalExpr(v); st.w = r.unit ? r.v * 28.4528 : r.v; } catch (e: any) { /* keep */ } }
        else if (k === 'opacity') st.op = parseFloat(v);
        else if (k === 'fill opacity') st.fop = parseFloat(v);
        else if (k === 'draw opacity') st.dop = parseFloat(v);
        else if (k === 'declare function') {
          st.funcs = { ...(st.funcs || {}) };
          for (const d of v.split(';')) {
            const m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*\(([^)]*)\)\s*=([\s\S]+)$/.exec(d);
            if (m) st.funcs[m[1]] = { params: m[2].split(',').map((p) => p.trim().replace(/^\\/, '')), body: m[3].trim() };
          }
        }
        else if (k === 'ball color') st.ball = colorHex(v) || '#ffffff';
        else if (/^(left|right|top|bottom|inner|outer) color$/.test(k)) (st.shade = st.shade || {})[k.split(' ')[0]] = colorHex(v) || '#ffffff';
        else if (k === 'double') st.double = colorHex(v) || '#ffffff';
        else if (k === 'double distance') { try { const r = evalExpr(v); st.dd = r.unit ? r.v * 28.4528 : r.v; } catch (e: any) { /* keep */ } }
        else if (k === 'anchor') st.anchor = v.trim();
        else if (POS[k]) st.anchor = POS[k];
        else if (k === 'pos') st.pos = parseFloat(v);
        else if (k === 'dash pattern') st.dash = 'dashed';
      }
    }
    return st;
  }

  // ================================================================ layout
  const cache = new Map();
  // flat: a plain 2D TikZ picture (the 2D geometry block): seen straight on, points (x, y) and (angle:radius) dragged
  function layout(src: any, flat?: any) {
    src = String(src || '');
    const key = (flat ? '2|' : '3|') + src;
    let L = cache.get(key);
    if (!L) {
      L = run(src, !!flat);
      if (cache.size > 60) cache.delete(cache.keys().next().value);
      cache.set(key, L);
    }
    bounds(L);
    return L;
  }
  function run(src: any, flat: any) {
    const S = parse(src);
    // what moves a drawn path as a whole, by statement: its literal points (handles) and the named points it uses
    const movers = new Map();
    const moverOf = (si: any) => { if (!movers.has(si)) movers.set(si, { ok: true, hs: [], names: new Set() }); return movers.get(si); };
    const items: any[] = [], handles: any[] = [], rings: any[] = [], links: any[] = [], pics: any[] = [], warnings: any[] = [], names = new Map(), env: any = new Map(), macros = new Map();
    const trimSpan = (sp: any) => { let a = sp.s, b = sp.e; while (a < b && /[\s{]/.test(src[a])) a++; while (b > a && /[\s}]/.test(src[b - 1])) b--; return { s: a, e: b }; };
    // a radius is dragged when it is a number, a number in cm or mm, or a macro holding a number
    const radiusWritable = (sp: any) => /^(\d+\.?\d*|\.\d+)\s*(cm|mm)$/.test(src.slice(sp.s, sp.e).trim()) || writable(sp);
    let vw = flat ? viewOf(0, 0) : viewOf(70, 110), scale = 1, rot = { R: I3, o: [0, 0, 0] };
    let main = null, begin = null, end = null;
    const txt = (sp: any) => src.slice(sp.s, sp.e);
    const num = (sp: any, what: any) => {
      try { return evalExpr(typeof sp === 'string' ? sp : txt(sp), env).v; } catch (e: any) { throw new Error(`${what ? what + ': ' : ''}${e.message}`); }
    };
    // a frame turns its own coordinates into { m: main 3D or null, s: screen 2D }
    const frameOf = (kind: any) => {
      if (kind === 'screen') return { kind, pt: (v: any) => ({ m: null, s: [v[0], v[1]] }), vec: (v: any) => ({ m: null, s: [v[0], v[1]] }) };
      if (kind === 'rotated') { const { R, o } = rot; return { kind, R, o, pt: (v: any) => { const m = add(o, app(R, v)); return { m, s: vw.P(m) }; }, vec: (v: any) => { const m = app(R, v); return { m, s: vw.P(m) }; } }; }
      return { kind: 'main', R: I3, o: [0, 0, 0], pt: (v: any) => ({ m: v, s: vw.P(v) }), vec: (v: any) => ({ m: v, s: vw.P(v) }) };
    };
    const plus = (a: any, d: any) => ({ m: a.m && d.m ? add(a.m, d.m) : null, s: [a.s[0] + d.s[0], a.s[1] + d.s[1]] });
    const lerp = (a: any, b: any, t: any) => ({ m: a.m && b.m ? add(a.m, mul(sub(b.m, a.m), t)) : null, s: [a.s[0] + (b.s[0] - a.s[0]) * t, a.s[1] + (b.s[1] - a.s[1]) * t] });
    // a point written as (…): named, polar, (x, y[, z]) or a simple calc expression
    function point(sp: any, F: any, vars?: any) {
      const t = src.slice(sp.s, sp.e).trim();
      if (t[0] === '$' && t[t.length - 1] === '$') return calc(t.slice(1, -1), F);
      // (A |- B): A's x and B's y; (A -| B): B's x and A's y
      const pp = /^(.+?)\s*(\|-|-\|)\s*(.+)$/.exec(t);
      if (pp && !/^\s*-?[\d.]+\s*$/.test(pp[1])) {
        const at = (q: any) => withSrc(q, () => point({ s: 0, e: q.length }, F, vars));
        const [a, b] = pp[2] === '|-' ? [at(pp[1]), at(pp[3])] : [at(pp[3]), at(pp[1])];
        return { m: a.m && b.m ? [a.m[0], b.m[1], 0] : null, s: [a.s[0], b.s[1]] };
      }
      const comps = splitTop(src, sp.s, sp.e);
      if (comps.length >= 2) {
        const r = comps.map((c) => { try { return evalExpr(c.t, env, vars); } catch (e: any) { throw new Error(`(${t}): ${e.message}`); } });
        const v = [r[0].v, r[1].v, r[2] ? r[2].v : 0];
        if (r.some((x) => x.unit)) return F.pt ? { m: null, s: [v[0], v[1]] } : null;
        return F.pt(v);
      }
      const pol = /^([^:]+):(.+)$/.exec(t);
      if (pol) {
        const a = evalExpr(pol[1], env, vars), r = evalExpr(pol[2], env, vars);
        const v = [r.v * Math.cos(a.v * D2R), r.v * Math.sin(a.v * D2R), 0];
        return r.unit ? { m: null, s: [v[0], v[1]], polar: true } : { ...F.pt(v), polar: true };
      }
      const nm = t.replace(/\.[A-Za-z ]+$/, '').trim();
      if (names.has(nm)) return names.get(nm);
      throw new Error(`no point named (${nm})`);
    }
    function vecOf(sp: any, F: any, vars?: any) {
      const t = src.slice(sp.s, sp.e).trim(), pol = /^([^:,]+):([^,]+)$/.exec(t);
      if (pol) {
        const a = evalExpr(pol[1], env, vars), r = evalExpr(pol[2], env, vars), v = [r.v * Math.cos(a.v * D2R), r.v * Math.sin(a.v * D2R), 0];
        return r.unit ? { m: null, s: [v[0], v[1]] } : F.vec(v);
      }
      const comps = splitTop(src, sp.s, sp.e);
      if (comps.length >= 2) {
        const r = comps.map((c) => evalExpr(c.t, env, vars)), v = [r[0].v, r[1].v, r[2] ? r[2].v : 0];
        return r.some((x) => x.unit) ? { m: null, s: [v[0], v[1]] } : F.vec(v);
      }
      const p = point(sp, F, vars);
      return p;
    }
    // ($(A)!t!(B)$), ($(A)+(B)$), ($k*(A)$): enough for the usual midpoints and offsets
    function calc(t: any, F: any) {
      const at = (q: any) => { const s0 = { s: 0, e: q.length }; const save = src; return withSrc(q, () => point(s0, F)); };
      const part = /^\s*\(([^()]*)\)\s*!\s*([^!]+)\s*!\s*\(([^()]*)\)\s*$/.exec(t);
      if (part) return lerp(at(part[1]), at(part[3]), evalExpr(part[2], env).v);
      let acc = null, i = 0, sign = 1;
      const re = /\s*([+-])?\s*(?:([^()+\-*]+)\s*\*\s*)?\(([^()]*)\)/y;
      for (;;) {
        re.lastIndex = i;
        const m = re.exec(t);
        if (!m) break;
        i = re.lastIndex;
        sign = m[1] === '-' ? -1 : 1;
        const k = sign * (m[2] ? evalExpr(m[2], env).v : 1), p = at(m[3]);
        const d = { m: p.m ? mul(p.m, k) : null, s: [p.s[0] * k, p.s[1] * k] };
        acc = acc ? plus(acc, d) : d;
      }
      if (!acc || t.slice(i).trim()) throw new Error(`($${t}$) is beyond what the editor draws`);
      return acc;
    }
    // point() reads from src; calc parts are separate strings
    function withSrc(s2: any, fn: any) { const keep = src; src = s2; try { return fn(); } finally { src = keep; } }

    const ink = (h: any, a?: any) => V3.col(h || '#000000');
    let steps = 0, depth = 0;
    // a list of statements; base: the style inherited from the picture and scopes; top: the index of the
    // top-level statement they belong to (what the editor selects); inLoop: inside a \foreach (no handles)
    const evalList = (list: any, base: any, top: any, inLoop: any) => {
    for (let li = 0; li < list.length; li++) {
      const st = list[li], si = top ?? li;
      if (++steps > 40000) { warnings.push('Too many steps: the rest is not drawn here'); return; }
      try {
        env.funcs = base ? base.funcs : undefined;
        if (st.k === 'scope') {
          // scopes and loops nested past 100 deep (hostile input) are not followed: the stack would overflow
          if (depth >= 100) { warnings.push('Scopes nested too deep: the inner ones are not drawn here'); continue; }
          const keepEnv = new Map(env), keepRot = rot;
          depth++;
          try { evalList(parse(src, st.body.s, st.body.e), styleOf(src, st.o, base), si, inLoop); } finally { depth--; }
          env.clear(); keepEnv.forEach((v, k) => env.set(k, v)); rot = keepRot;
          continue;
        }
        if (st.k === 'foreach') {
          if (depth >= 100) { warnings.push('Loops nested too deep: the inner ones are not drawn here'); continue; }
          const vals = listValues(txt(st.list), env), body = txt(st.body);
          vals.forEach((item, idx) => {
            const parts = item.split('/');
            let t = body;
            const sub = (nm: any, val: any) => { t = t.replace(new RegExp(`\\\\${nm}(?![A-Za-z@])`, 'g'), () => val); };
            st.vars.forEach((nm: any, vi: any) => sub(nm, (parts[vi] ?? parts[parts.length - 1]).trim()));
            if (st.count) sub(st.count, String(idx + 1));
            const keepEnv = new Map(env), keepRot = rot;
            depth++;
            try { withSrc(t, () => evalList(parse(t), base, si, true)); } finally { depth--; }
            env.clear(); keepEnv.forEach((v, k) => env.set(k, v)); rot = keepRot;
          });
          continue;
        }
        if (st.k === 'main') { if (top == null) main = si; vw = viewOf(num(st.th, 'θ'), num(st.ph, 'φ')); rot = { R: rot.R, o: rot.o }; continue; }
        if (st.k === 'begin') {
          if (top == null) begin = si;
          if (st.o) { for (const o of optList(src, st.o.s, st.o.e)) if (o.k === 'scale' && o.v) scale = num(o.v, 'scale') || 1; base = styleOf(src, st.o, base); }
          continue;
        }
        if (st.k === 'end') { if (top == null) end = si; continue; }
        if (st.k === 'macro') {
          const raw = txt(st.v);
          let v;
          try { v = evalExpr(raw, env).v; } catch (e: any) { v = NaN; }
          if (isFinite(v)) env.set(st.name, v);
          macros.set(st.name, { si, span: st.v, literal: /^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(raw) });
          continue;
        }
        if (st.k === 'rot') { rot = { R: euler(num(st.a, 'α'), num(st.b, 'β'), num(st.g, 'γ')), o: rot.o }; continue; }
        if (st.k === 'rorig') { const t2 = src.slice(st.at.s, st.at.e).trim(); const sp2 = /^\(.*\)$/.test(t2) ? { s: src.indexOf('(', st.at.s) + 1, e: src.lastIndexOf(')', st.at.e) } : st.at; rot = { R: rot.R, o: point(sp2, frameOf('main')).m || [0, 0, 0] }; continue; }
        if (st.k === 'rreset') { rot = { R: rot.R, o: [0, 0, 0] }; continue; }
        if (st.k === 'tplane') { rot = { R: euler(270 + num(st.ph, 'φ'), 270, 0), o: [0, 0, 0] }; continue; }
        if (st.k === 'coordinate') {
          if (!st.atPt || !st.name) continue;
          const sty = styleOf(src, st.o, base), F = frameOf(sty.frame);
          const p = point({ s: st.atPt.is, e: st.atPt.ie }, F);
          names.set(st.name, p);
          if (p.m && F.kind !== 'screen' && !inLoop) handles.push({ ...handleFor(si, 'coord', p, F, { s: st.atPt.is, e: st.atPt.ie }), name: st.name });
          continue;
        }
        if (st.k === 'setcoord') {
          const r = num(st.r, 'r'), t = num(st.th, 'θ') * D2R, f = num(st.ph, 'φ') * D2R;
          const v = [r * Math.sin(t) * Math.cos(f), r * Math.sin(t) * Math.sin(f), r * Math.cos(t)];
          const P = (q: any) => ({ m: q, s: vw.P(q) });
          names.set(st.name, P(v));
          if (!st.simple) {
            names.set(st.name + 'xy', P([v[0], v[1], 0])); names.set(st.name + 'xz', P([v[0], 0, v[2]])); names.set(st.name + 'yz', P([0, v[1], v[2]]));
            names.set(st.name + 'x', P([v[0], 0, 0])); names.set(st.name + 'y', P([0, v[1], 0])); names.set(st.name + 'z', P([0, 0, v[2]]));
          }
          if (!inLoop) handles.push({ si, kind: 'setcoord', at: P(v), F: frameOf('main'), writable: [st.r, st.th, st.ph].every((x) => writable(x)) });
          continue;
        }
        if (st.k === 'node') {
          const sty = styleOf(src, st.o, base), F = frameOf(sty.frame);
          const p = st.atPt ? point({ s: st.atPt.is, e: st.atPt.ie }, F) : { m: [0, 0, 0], s: [0, 0] };
          if (st.name) names.set(st.name, p);
          if (st.text) items.push({ k: 'text', at: p.s, text: nums(txt(st.text)), anchor: sty.anchor && sty.anchor !== 'center' ? sty.anchor : undefined, color: sty.text || sty.color ? V3.col(sty.text || sty.color) : undefined, si });
          if (st.atPt && p.m && F.kind !== 'screen' && (!p.polar || flat) && !inLoop) {
            const h = handleFor(si, 'lit', p, F, { s: st.atPt.is, e: st.atPt.ie });
            if (h.writable) handles.push(h);
          }
          continue;
        }
        if (st.k === 'arc') {
          const sty = styleOf(src, st.o, base), F = frameOf(sty.frame || 'main');
          const cT = src.slice(st.c.s, st.c.e).trim(), csp = /^\(.*\)$/.test(cT) ? { s: src.indexOf('(', st.c.s) + 1, e: src.lastIndexOf(')', st.c.e) } : st.c;
          const c = point(csp, F), r = num(st.r, 'radius'), a0 = num(st.a0, 'start'), a1 = num(st.a1, 'end');
          const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4));
          const pts = Array.from<any, any>({ length: n + 1 }, (_, i) => { const a = (a0 + ((a1 - a0) * i) / n) * D2R; return plus(c, F.vec([r * Math.cos(a), r * Math.sin(a), 0])).s; });
          items.push({ k: 'line', pts, stroke: ink(sty.draw || sty.color), w: sty.w / K, dash: sty.dash ? (/dot/.test(sty.dash) ? 'dot' : true) : false, arrow: !!sty.arrow, arrow0: !!sty.arrow0, tip: sty.tip, opacity: sty.dop ?? sty.op, si });
          const mid = ((a0 + a1) / 2) * D2R, lo = styleOf(src, st.lo);
          const tx = nums(txt(st.text).trim());
          if (tx) items.push({ k: 'text', at: plus(c, F.vec([r * Math.cos(mid), r * Math.sin(mid), 0])).s, text: tx, anchor: lo.anchor && lo.anchor !== 'center' ? lo.anchor : undefined, color: lo.text || lo.color ? V3.col(lo.text || lo.color) : undefined, si });
          continue;
        }
        if (st.k === 'path') { drawPath(st, si, base, inLoop); continue; }
        if (st.k === 'pic') { drawPic(st, si, base); continue; }
        if (st.k === 'cmd' && !/^(tikzset|usetikzlibrary|tdplotsetpolarplotrange|tdplotresetpolarplotrange|pgfmathsetmacro|centering|small|footnotesize)$/.test(st.name)) warnings.push(`\\${st.name} is kept in the code but not drawn here`);
        if (st.bad) warnings.push(st.bad);
      } catch (e: any) {
        const w = inLoop ? `In a \\foreach: ${e.message}` : `Line ${src.slice(0, st.s).split('\n').length}: ${e.message}`;
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
    };
    evalList(S, null, null, false);

    function writable(sp: any) {
      const t = src.slice(sp.s, sp.e).trim();
      if (/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return true;
      const m = /^\\([A-Za-z@]+)$/.exec(t);
      return !!(m && macros.has(m[1]) && macros.get(m[1]).literal);
    }
    function handleFor(si: any, kind: any, p: any, F: any, inner: any) {
      // (angle:radius) in a flat picture: dragging writes the angle and the radius
      if (p.polar) {
        const comps = flat && /:/.test(src.slice(inner.s, inner.e)) ? splitTop(src, inner.s, inner.e, ':') : [];
        return { si, kind, at: p, F, comps, polar: true, writable: comps.length === 2 && comps.every((c) => writable(c)) };
      }
      const comps = splitTop(src, inner.s, inner.e);
      const ok = (comps.length === 3 || (flat && comps.length === 2)) && comps.every((c) => writable(c));
      return { si, kind, at: p, F, comps, writable: ok };
    }
    // \pgfmathprintnumber[fixed, precision=2]{value} in a label: the number as LaTeX prints it
    function nums(t: any) {
      if (!/\\pgfmathprintnumber/.test(t)) return t;
      const re = /\\pgfmathprintnumber\s*(\[[^\]]*\])?\s*(?=\{)/g;
      let out = '', i = 0, m;
      while ((m = re.exec(t))) {
        const b = m.index + m[0].length, q = close(t, b);
        if (q < 0) break;
        let v = NaN;
        try { v = evalExpr(t.slice(b + 1, q - 1), env).v; } catch (e: any) { /* shown as ? */ }
        const o = m[1] || '', pm = /precision\s*=\s*(\d+)/.exec(o), d = pm ? +pm[1] : 2;
        const s2 = !isFinite(v) ? '?' : /zerofill/.test(o) ? v.toFixed(d) : String(+v.toFixed(d));
        out += t.slice(i, m.index) + (s2 === '-0' ? '0' : s2);
        i = q; re.lastIndex = q;
      }
      return out + t.slice(i);
    }
    // \pic{angle = A--B--C} / {right angle = A--B--C}: from BA round to BC, counterclockwise
    function drawPic(st: any, si: any, inh: any) {
      if (!st.body) return;
      const m = /^\s*(right angle|angle)\s*=\s*([^-]+?)\s*--\s*([^-]+?)\s*--\s*([^-]+?)\s*$/.exec(txt(st.body));
      if (!m) { warnings.push(`\\pic{${txt(st.body).trim()}} is not drawn here`); return; }
      const sty = styleOf(src, st.o, inh), O = st.o ? splitTop(src, st.o.s, st.o.e) : [];
      const P = (n: any) => { if (!names.has(n)) throw new Error(`no point named (${n})`); return names.get(n).s; };
      const A = P(m[2]), B = P(m[3]), C = P(m[4]);
      const g = (k: any) => { const o = O.map((x) => x.t).find((x) => new RegExp(`^${k}\\s*=`).test(x)); return o ? o.slice(o.indexOf('=') + 1).trim() : null; };
      let r = 0.5, ecc = 0.6;
      const rr = g('angle radius');
      if (rr) { const v = evalExpr(rr, env); r = v.unit ? v.v : v.v * UNIT.pt; }
      const ee = g('angle eccentricity');
      if (ee) ecc = evalExpr(ee, env).v;
      const a0 = Math.atan2(A[1] - B[1], A[0] - B[0]) / D2R;
      let a1 = Math.atan2(C[1] - B[1], C[0] - B[0]) / D2R;
      while (a1 < a0) a1 += 360;
      const at = (a: any, d: any) => [B[0] + d * Math.cos(a * D2R), B[1] + d * Math.sin(a * D2R)];
      let edge, area;
      if (m[1] === 'right angle') {
        const u = at(a0, r), w = [u[0] + r * Math.cos(a1 * D2R), u[1] + r * Math.sin(a1 * D2R)], v = at(a1, r);
        edge = [u, w, v]; area = [B, u, w, v];
      } else {
        const n = Math.max(6, Math.ceil((a1 - a0) / 4));
        edge = Array.from<any, any>({ length: n + 1 }, (_, i) => at(a0 + ((a1 - a0) * i) / n, r));
        area = [B, ...edge];
      }
      const dash = sty.dash ? (/dot/.test(sty.dash) ? 'dot' : true) : false;
      if (sty.fillOn) items.push({ k: 'poly', pts: area, fill: V3.col(sty.fill || sty.color || '#000000'), opacity: sty.fop ?? sty.op, si });
      if (sty.drawOn) items.push({ k: 'line', pts: edge, stroke: ink(sty.draw || sty.color), w: sty.w / K, dash, arrow: !!sty.arrow, arrow0: !!sty.arrow0, tip: sty.tip, opacity: sty.dop ?? sty.op, si });
      // the label: "text" among the options, or pic text=…
      const q = O.find((x) => x.t[0] === '"');
      let lt = q ? q.t.slice(1, q.t.indexOf('"', 1) > 0 ? q.t.indexOf('"', 1) : undefined) : g('pic text');
      const k2 = m[1] === 'right angle' ? Math.SQRT2 : 1, mid = (a0 + a1) / 2;
      // for the editor: the corner, a point on the mark (its size) and where the label sits (its eccentricity)
      pics.push({ si, B, r, ecc, k2, rim: at(a0, r), mid: at(mid, r), lab: at(mid, ecc * r * k2), label: !!lt, right: m[1] === 'right angle' });
      if (lt) {
        lt = unbrace(lt);
        items.push({ k: 'text', at: at(mid, ecc * r * k2), text: nums(lt), color: sty.text || sty.color ? V3.col(sty.text || sty.color) : undefined, si });
      }
    }

    function drawPath(st: any, si: any, inh: any, inLoop: any) {
      const sty = styleOf(src, st.o, inh), F = frameOf(sty.frame);
      if (sty.funcs) env.funcs = sty.funcs;
      const cmd = st.cmd, subs = [], texts: any[] = [];
      let cur: any = null, base = null, line: any = null, pendingOp = false, pendingNodes = [];
      const vars: Record<string, any> = {};
      const startSub = (p: any) => { line = { pts: [p], closed: false }; subs.push(line); };
      const mv = moverOf(si);
      if (inLoop || F.kind === 'screen') mv.ok = false;
      const placeNode = (el: any, at: any) => {
        const ns = styleOf(src, el.o);
        if (el.name) names.set(el.name, at);
        if (!el.text) return;
        texts.push({ k: 'text', at: at.s, text: nums(src.slice(el.text.s, el.text.e)), anchor: ns.anchor && ns.anchor !== 'center' ? ns.anchor : undefined, color: ns.text || ns.color || sty.text || sty.color ? V3.col(ns.text || ns.color || sty.text || sty.color) : undefined, si, node: el });
      };
      for (let ei = 0; ei < st.els.length; ei++) {
        const el = st.els[ei];
        if (el.t === 'pt') {
          let p;
          if (el.rel) { const d = vecOf({ s: el.is, e: el.ie }, F); p = plus(base || cur || F.pt([0, 0, 0]), d); }
          else p = point({ s: el.is, e: el.ie }, F);
          if (!el.rel || el.rel === '++') base = p;
          if (pendingOp && line) {
            for (const nd of pendingNodes) placeNode(nd, lerp(cur, p, styleOf(src, nd.o).pos ?? 0.5));
            line.pts.push(p);
            // the straight segments, so a dragged end can keep a 15° angle to the other end
            if ((pendingOp as any) === '--' && cur && cur.m && p.m) links.push([cur.m, p.m]);
          } else startSub(p);
          pendingNodes = []; pendingOp = false; cur = p;
          let lit = null;
          if (!el.rel && !inLoop && p.m && F.kind !== 'screen' && (p.polar ? flat : splitTop(src, el.is, el.ie).length >= 2)) {
            const h = handleFor(si, 'lit', p, F, { s: el.is, e: el.ie });
            if (h.writable) { handles.push(h); lit = h; }
          }
          // moving the whole path: a literal point moves by its handle, a named one by its \coordinate;
          // relative points follow; anything computed ($…$, |-, a point without a handle) keeps it still
          if (!el.rel) {
            const t = src.slice(el.is, el.ie).trim();
            if (lit) mv.hs.push(lit);
            else if (/^\$|\|-|-\||[:,]/.test(t) || !p.m) mv.ok = false;
            else mv.names.add(t.replace(/\.[A-Za-z ]+$/, '').trim());
          }
          continue;
        }
        if (el.t === 'op') { pendingOp = el.v; continue; }
        if (el.t === 'cycle') { if (line) { line.closed = true; if ((pendingOp as any) === '--' && cur && cur.m && line.pts[0].m) links.push([cur.m, line.pts[0].m]); if (pendingOp) for (const nd of pendingNodes) placeNode(nd, lerp(cur, line.pts[0], 0.5)); } pendingOp = false; pendingNodes = []; continue; }
        if (el.t === 'node') {
          if (pendingOp) { pendingNodes.push(el); continue; }
          const ns = styleOf(src, el.o);
          // a node with pos= sits along the last segment
          if (ns.pos != null && line && line.pts.length > 1) { const n = line.pts.length; placeNode(el, lerp(line.pts[n - 2], line.pts[n - 1], ns.pos)); }
          else if (cur) placeNode(el, cur);
          continue;
        }
        if (el.t === 'coordinate') { if (el.name && cur) names.set(el.name, cur); continue; }
        if (el.t === 'circle' || el.t === 'ellipse') {
          if (!cur) continue;
          let rx, ry, unit = false;
          const os = el.o ? optList(src, el.o.s, el.o.e) : [];
          const get = (k: any) => { const o = os.find((x) => x.k === k); return o ? evalExpr(o.v, env) : null; };
          if (el.a) {
            const t = src.slice(el.a.s, el.a.e), ab = t.split(/\band\b/);
            const A = evalExpr(ab[0], env), B = ab[1] ? evalExpr(ab[1], env) : A;
            rx = A.v; ry = B.v; unit = A.unit || B.unit;
          } else {
            const R = get('radius'), X = get('x radius') || R, Y = get('y radius') || R;
            if (!X) throw new Error('circle needs a radius');
            rx = X.v; ry = (Y || X).v; unit = X.unit;
          }
          // a circle's radius, so the editor can drag its rim: circle (r) or circle[radius=r]
          if (!inLoop && cur.m && F.kind === 'main' && rx === ry) {
            let sp = null;
            if (el.a && !/\band\b/.test(src.slice(el.a.s, el.a.e))) sp = trimSpan(el.a);
            else if (!el.a) { const o = os.find((x) => x.k === 'radius'); if (o) { const q = splitTop(src, o.s, o.e, '='); if (q[1]) sp = trimSpan({ s: q[1].s, e: o.e }); } }
            // a radius in pt is a point's dot, not a circle to size
            if (sp && !/pt\s*$/.test(src.slice(sp.s, sp.e))) rings.push({ si, c: cur, r: rx, abs: unit, span: sp, writable: radiusWritable(sp) });
          }
          const pts = Array.from<any, any>({ length: 73 }, (_, i) => { const a = (i / 72) * 2 * Math.PI; const v = [rx * Math.cos(a), ry * Math.sin(a), 0]; return plus(cur, unit ? { m: null, s: [v[0], v[1]] } : F.vec(v)); });
          subs.push({ pts, closed: true, circle: { c: cur, r: rx, screen: unit || F.kind === 'screen' } });
          line = null;
          continue;
        }
        if (el.t === 'arc') {
          if (!cur || !el.a) { if (!cur) continue; }
          let a0, a1, rx, ry, unit = false;
          if (el.a) {
            const parts = src.slice(el.a.s, el.a.e).split(':');
            if (parts.length < 3) throw new Error('arc needs (start:end:radius)');
            a0 = evalExpr(parts[0], env).v; a1 = evalExpr(parts[1], env).v;
            const ab = parts.slice(2).join(':').split(/\band\b/), A = evalExpr(ab[0], env), B = ab[1] ? evalExpr(ab[1], env) : A;
            rx = A.v; ry = B.v; unit = A.unit;
          } else {
            const os = optList(src, el.o.s, el.o.e), g = (k: any) => { const o = os.find((x) => x.k === k); return o ? evalExpr(o.v, env) : null; };
            a0 = (g('start angle'))!.v; a1 = g('end angle')?.v ?? a0 + (g('delta angle'))!.v; const R = g('radius'); rx = ry = R!.v; unit = R!.unit;
          }
          const vec = (a: any) => { const v = [rx * Math.cos(a * D2R), ry * Math.sin(a * D2R), 0]; return unit ? { m: null, s: [v[0], v[1]] } : F.vec(v); };
          const c0 = vec(a0), n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 4));
          const ctr = { m: cur.m && c0.m ? sub(cur.m, c0.m) : null, s: [cur.s[0] - c0.s[0], cur.s[1] - c0.s[1]] };
          if (!line) startSub(cur);
          for (let i = 1; i <= n; i++) line.pts.push(plus(ctr, vec(a0 + ((a1 - a0) * i) / n)));
          cur = line.pts[line.pts.length - 1];
          continue;
        }
        if (el.t === 'rect') {
          const nx = st.els[ei + 1];
          if (!nx || nx.t !== 'pt' || !cur) continue;
          const q = point({ s: nx.is, e: nx.ie }, F);
          const a = cur.s, b = q.s;
          subs.push({ pts: [a, [b[0], a[1]], b, [a[0], b[1]]].map((s) => ({ m: null, s })), closed: true });
          cur = q; line = null; ei++;
          continue;
        }
        if (el.t === 'grid') {
          mv.ok = false; // a grid is the backdrop: missing empty space by a hair would carry it off
          const nx = st.els[ei + 1];
          if (!nx || nx.t !== 'pt' || !cur) continue;
          const q = point({ s: nx.is, e: nx.ie }, F);
          // the far corner drags like the near one
          if (!inLoop && q.m && F.kind !== 'screen' && splitTop(src, nx.is, nx.ie).length >= 2) { const h = handleFor(si, 'lit', q, F, { s: nx.is, e: nx.ie }); if (h.writable) handles.push(h); }
          const os = (st.o ? optList(src, st.o.s, st.o.e) : []).concat(el.o ? optList(src, el.o.s, el.o.e) : []);
          const g = (k: any) => { const o = [...os].reverse().find((x) => x.k === k); return o && o.v != null ? evalExpr(o.v, env).v : null; };
          const st0 = g('step') || 1, sx = g('xstep') || st0, sy = g('ystep') || st0;
          const [x0, x1] = [Math.min(cur.s[0], q.s[0]), Math.max(cur.s[0], q.s[0])], [y0, y1] = [Math.min(cur.s[1], q.s[1]), Math.max(cur.s[1], q.s[1])];
          const S2 = (x: any, y: any) => ({ m: null, s: [x, y] });
          if (sx > 0 && (x1 - x0) / sx < 400) for (let x = Math.ceil(x0 / sx - 1e-9) * sx; x <= x1 + 1e-9; x += sx) subs.push({ pts: [S2(x, y0), S2(x, y1)], closed: false });
          if (sy > 0 && (y1 - y0) / sy < 400) for (let y = Math.ceil(y0 / sy - 1e-9) * sy; y <= y1 + 1e-9; y += sy) subs.push({ pts: [S2(x0, y), S2(x1, y)], closed: false });
          cur = q; line = null; ei++;
          continue;
        }
        if (el.t === 'plot') {
          mv.ok = false;
          const os = el.o ? optList(src, el.o.s, el.o.e).concat(st.o ? optList(src, st.o.s, st.o.e) : []) : st.o ? optList(src, st.o.s, st.o.e) : [];
          const g = (k: any) => { const o = os.find((x) => x.k === k); return o ? o.v : null; };
          const dom = (g('domain') || '-5:5').split(':'), lo = evalExpr(dom[0], env).v, hi = evalExpr(dom[1], env).v;
          const n = Math.max(2, Math.min(600, Math.round(evalExpr(g('samples') || '25', env).v)));
          const vn = (g('variable') || '\\x').trim().replace(/^\\/, '');
          const pts = [];
          for (let i = 0; i < n; i++) { vars[vn] = lo + ((hi - lo) * i) / (n - 1); pts.push(point({ s: el.a.s, e: el.a.e }, F, vars)); }
          if (pendingOp && line) line.pts.push(...pts); else { line = { pts, closed: false }; subs.push(line); }
          cur = pts[pts.length - 1]; pendingOp = false;
          continue;
        }
        if (el.t === 'plot' || el.t === 'bad') mv.ok = false;
        if (el.t === 'bad') warnings.push(`${el.v} in a path is not drawn here`);
      }
      // a lone move-to point (as before a circle) draws nothing
      for (let i = subs.length - 1; i >= 0; i--) if (subs[i].pts.length < 2) subs.splice(i, 1);
      const hasDraw = cmd === 'draw' || cmd === 'filldraw' || cmd === 'shadedraw' || sty.drawOn;
      const hasFill = cmd === 'fill' || cmd === 'filldraw' || ((cmd === 'shade' || cmd === 'shadedraw') && !sty.ball) || sty.fillOn || (sty.shade && !sty.ball);
      // left/right, top/bottom or inner/outer colours: an axis or radial shading (a missing end is white)
      const sh = sty.shade, grad = sh && !sty.ball ? (sh.left || sh.right ? { k: 'h', a: sh.left || '#ffffff', b: sh.right || '#ffffff' } : sh.top || sh.bottom ? { k: 'v', a: sh.top || '#ffffff', b: sh.bottom || '#ffffff' } : { k: 'r', a: sh.inner || '#ffffff', b: sh.outer || '#ffffff' }) : null;
      const stroke = ink(sty.draw || sty.color);
      const fillC = sty.fill || sty.color || (cmd === 'shade' || cmd === 'shadedraw' ? '#c0c0c0' : '#000000');
      const dash = sty.dash ? (/dot/.test(sty.dash) ? 'dot' : true) : false;
      if (sty.ball && subs.length === 1 && subs[0].circle && subs[0].circle.screen) {
        const c = subs[0].circle;
        items.push({ k: 'ball', at: c.c.s, r: c.r, color: sty.ball, shaded: true, exact: true, opacity: sty.op, si });
      } else if (sty.ball) {
        for (const sb of subs) items.push({ k: 'poly', pts: sb.pts.map((p: any) => p.s), fill: V3.col(sty.ball), opacity: sty.fop ?? sty.op, si });
      }
      if (hasFill) for (const sb of subs) if (sb.pts.length > 2) items.push({ k: 'poly', pts: sb.pts.map((p: any) => p.s), fill: V3.col(fillC), grad, opacity: sty.fop ?? sty.op, si });
      if (hasDraw) {
        subs.forEach((sb, i) => {
          const pts = sb.pts.map((p: any) => p.s);
          if (sb.closed) pts.push(pts[0]);
          if (pts.length < 2) return;
          if (sty.double) {
            const dd = sty.dd ?? 0.6;
            items.push({ k: 'line', pts, stroke, w: (2 * sty.w + dd) / K, dash, opacity: sty.dop ?? sty.op, si, cap: 'butt' });
            items.push({ k: 'line', pts, stroke: V3.col(sty.double), w: dd / K, dash, opacity: sty.dop ?? sty.op, si, cap: 'butt' });
            return;
          }
          items.push({ k: 'line', pts, stroke, w: sty.w / K, dash, arrow: !sb.closed && i === subs.length - 1 && !!sty.arrow, arrow0: !sb.closed && i === 0 && !!sty.arrow0, tip: sty.tip, opacity: sty.dop ?? sty.op, si });
        });
      }
      if (!hasDraw && !hasFill && !sty.ball && cmd !== 'path' && cmd !== 'clip') { /* \shade without ball colour etc. */ }
      // a dot drawn as a small circle: say so, so the editor can show its point
      items.push(...texts);
    }

    // named points resolve to their \coordinate handles; a path with nothing to move stays still
    const moves = new Map();
    for (const [si, mv] of movers) {
      const hs = [...mv.hs];
      for (const nm of mv.names) { const h = handles.find((x) => x.kind === 'coord' && x.name === nm); if (h && h.writable) hs.push(h); else mv.ok = false; }
      if (mv.ok && hs.length) moves.set(si, hs);
    }
    return { src, S, items, handles, rings, links, pics, moves, warnings, names, macros, env, view: vw, scale, k: PX * scale, main, begin, end };
  }
  // bounds in px at the picture's scale, origin at the projected (0, 0)
  function bounds(L: any) {
    const { items, k } = L;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x: any, y: any) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const it of items) {
      if (it.k === 'ball') { grow((it.at[0] - it.r) * k, -(it.at[1] + it.r) * k); grow((it.at[0] + it.r) * k, -(it.at[1] - it.r) * k); continue; }
      if (it.k === 'text') {
        const b = TD.textBox(it.text, V3.NORMAL), q = labelAt(it, [it.at[0] * k, -it.at[1] * k], b);
        grow(q[0] - b.w / 2, q[1] - b.h / 2); grow(q[0] + b.w / 2, q[1] + b.h / 2);
        continue;
      }
      for (const p of it.pts || [it.at]) grow(p[0] * k, -p[1] * k);
    }
    L.empty = !isFinite(x0);
    L.bb = L.empty ? { x: 0, y: 0, w: 2 * PX, h: 2 * PX } : { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 };
  }
  // where V3 puts a label's centre (px, y down) for its anchor
  function labelAt(it: any, q: any, b: any) {
    const a = it.anchor;
    if (!a) return q;
    const o = [q[0], q[1]];
    if (a.includes('west')) o[0] += b.w / 2 + 2;
    if (a.includes('east')) o[0] -= b.w / 2 + 2;
    if (a.includes('south')) o[1] -= b.h / 2 + 2;
    if (a.includes('north')) o[1] += b.h / 2 + 2;
    return o;
  }

  // ================================================================ drawing
  // fit: canvas px of a projected point, for a picture whose bounds' top-left sits at (x, y)
  const fitAt = (L: any, x: any, y: any) => ({ k: L.k, px: (p: any) => ({ x: x - L.bb.x + p[0] * L.k, y: y - L.bb.y - p[1] * L.k }) });
  function draw(s: any, ctx: Record<string, any> = {}) {
    const L = layout(s.src);
    let out = L.empty
      ? `<rect x="${s.x}" y="${s.y}" width="${L.bb.w}" height="${L.bb.h}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`
      : V3.svg(L.items, fitAt(L, s.x, s.y), ctx);
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(L.bb.w)}" height="${r2(L.bb.h)}"/>`;
    return out;
  }

  // ================================================================ code edits
  // apply [{ s, e, t }] to src (later spans first)
  function edits(src: any, list: any) {
    for (const x of [...list].sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
    return src;
  }
  const fmt = (v: any, d = 3) => { const k = Math.pow(10, d); let t = String(Math.round(v * k) / k); if (t === '-0') t = '0'; return t; };
  // write a number where a value is written: into its \def when it is a macro holding a plain number
  function setNum(L: any, sp: any, v: any, d = 3) {
    const t = L.src.slice(sp.s, sp.e).trim(), m = /^\\([A-Za-z@]+)$/.exec(t);
    if (m && L.macros.has(m[1]) && L.macros.get(m[1]).literal) return { ...L.macros.get(m[1]).span, t: fmt(v, d) };
    return { s: sp.s, e: sp.e, t: fmt(v, d) };
  }
  // the edits that move statement si's drawing by d (main frame): each point it uses moves once, and a value
  // shared by two of its points is written once
  // si: one command (its points, as listed in moves), or several (also every writable point they hold)
  function shiftEdits(L: any, si: any, d: any) {
    let hs = L.moves && !Array.isArray(si) ? L.moves.get(si) : null;
    if (Array.isArray(si)) {
      const set = new Set(si);
      hs = [...new Set([...si.flatMap((i) => (L.moves && L.moves.get(i)) || []), ...L.handles.filter((h: any) => set.has(h.si) && h.writable)])];
    }
    if (!hs || !hs.length) return null;
    const out = [], seen = new Set();
    for (const h of hs) {
      const m = h.at.m;
      for (const x of moveHandle(L, h, [m[0] + d[0], m[1] + d[1], m[2] + (d[2] || 0)])) {
        const k = `${x.s}:${x.e}`;
        if (!seen.has(k)) { seen.add(k); out.push(x); }
      }
    }
    return out;
  }
  // the edit that sets a circle's radius (a ring from layout) to r cm, keeping a written unit
  function setRadius(L: any, ring: any, r: any) {
    const t = L.src.slice(ring.span.s, ring.span.e).trim(), u = /(cm|mm|pt)$/.exec(t);
    if (u) return { s: ring.span.s, e: ring.span.e, t: fmt(r / UNIT[u[1]], u[1] === 'cm' ? 2 : 1) + u[1] };
    return setNum(L, ring.span, r, 2);
  }
  // the edits that move a handle's point to main-frame position m
  // dp: decimals written (3 when the drag keeps an angle, so the 15° steps survive rounding)
  function moveHandle(L: any, h: any, m: any, dp = 2) {
    const st = L.S[h.si];
    if (h.kind === 'setcoord') {
      const r = Math.hypot(...m), th = r ? Math.acos(Math.max(-1, Math.min(1, m[2] / r))) / D2R : 0;
      let ph = Math.atan2(m[1], m[0]) / D2R;
      const ph0 = evalExpr(L.src.slice(st.ph.s, st.ph.e), L.env).v;
      ph += 360 * Math.round((ph0 - ph) / 360); // stay on the same turn as before
      return [setNum(L, st.r, r, 2), setNum(L, st.th, th, 0), setNum(L, st.ph, ph, 0)];
    }
    if (h.polar) {
      let a = Math.atan2(m[1], m[0]) / D2R;
      try { const a0 = evalExpr(L.src.slice(h.comps[0].s, h.comps[0].e), L.env).v; a += 360 * Math.round((a0 - a) / 360); } catch (e: any) { /* as is */ }
      return [setNum(L, h.comps[0], a, dp), setNum(L, h.comps[1], Math.hypot(m[0], m[1]), dp)];
    }
    const v = h.F.kind === 'rotated' ? appT(h.F.R, sub(m, h.F.o)) : m;
    return h.comps.map((c: any, i: any) => setNum(L, c, v[i], dp));
  }
  // set (or with v null remove) an option in a statement's [options]; `match` picks the items it replaces
  function setOpt(L: any, st: any, match: any, text: any, at: any) {
    const src = L.src;
    if (st.o) {
      const O = optList(src, st.o.s, st.o.e), hit = O.filter(match);
      if (hit.length) {
        const ed = hit.map((o, i) => (i === 0 && text ? { s: o.s, e: o.e, t: text } : removeItem(src, O, o)));
        return ed;
      }
      if (!text) return [];
      return [{ s: st.o.e, e: st.o.e, t: (src.slice(st.o.s, st.o.e).trim() ? ', ' : '') + text }];
    }
    if (!text) return [];
    return [{ s: at ?? st.oAt, e: at ?? st.oAt, t: `[${text}]` }];
  }
  function removeItem(src: any, O: any, o: any) {
    const i = O.indexOf(o);
    if (O.length === 1) return { s: o.s, e: o.e, t: '' };
    if (i < O.length - 1) return { s: o.s, e: O[i + 1].s, t: '' };
    return { s: O[i - 1].e, e: o.e, t: '' };
  }

  // ================================================================ export
  function partsOf(src: any, flat?: any) {
    const L = layout(src, flat);
    const b = L.begin != null ? L.S[L.begin] : null, e = L.end != null ? L.S[L.end] : null;
    if (!b || !e) return { pre: '', opts: flat ? '' : 'tdplot_main_coords', body: src.trim(), post: '' };
    return { pre: src.slice(0, b.s).trim(), opts: b.o ? src.slice(b.o.s, b.o.e).trim() : '', body: src.slice(b.e, e.s).replace(/^\s*\n/, '').replace(/\s+$/, ''), post: src.slice(e.e).trim() };
  }
  const DEFAULT = `\\tdplotsetmaincoords{60}{110}
\\begin{tikzpicture}[scale=3, tdplot_main_coords]
  \\def\\rvec{0.8}
  \\def\\thetavec{40}
  \\def\\phivec{60}
  \\coordinate (O) at (0,0,0);
  \\draw[thick, ->] (0,0,0) -- (1,0,0) node[anchor=north east]{$x$};
  \\draw[thick, ->] (0,0,0) -- (0,1,0) node[anchor=north west]{$y$};
  \\draw[thick, ->] (0,0,0) -- (0,0,1) node[anchor=south]{$z$};
  \\tdplotsetcoord{P}{\\rvec}{\\thetavec}{\\phivec}
  \\draw[-stealth, color=red] (O) -- (P) node[above right]{$P$};
  \\draw[dashed, color=red] (O) -- (Pxy);
  \\draw[dashed, color=red] (P) -- (Pxy);
  \\tdplotdrawarc{(O)}{0.2}{0}{\\phivec}{anchor=north}{$\\phi$}
  \\tdplotsetthetaplanecoords{\\phivec}
  \\tdplotdrawarc[tdplot_rotated_coords]{(0,0,0)}{0.5}{0}{\\thetavec}{anchor=south west}{$\\theta$}
\\end{tikzpicture}`;

  TD.TYPES.geo3d = {
    name: '3D geometry',
    pts: [['x', 'y']],
    create: (p: any) => ({ type: 'geo3d', x: p.x, y: p.y, src: DEFAULT }),
    drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s: any) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s: any) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the picture becomes a scope moved to where the drawing sits; \tdplotsetmaincoords and the rest go before it
    tikz(s: any, X: any) {
      X.pkgs.add('tikz-3dplot');
      const L = layout(s.src), P = partsOf(s.src);
      if (/-\{?(Stealth|Latex|Triangle|Kite|Straight Barb)|\{(Stealth|Latex)/.test(s.src)) X.libs.add('arrows.meta');
      if (/\(\s*\$/.test(s.src)) X.libs.add('calc');
      const o = [`shift={${X.c(s.x - L.bb.x, s.y - L.bb.y)}}`];
      if (P.opts) o.push(P.opts);
      return [P.pre, `\\begin{scope}[${o.join(', ')}]`, P.body, '\\end{scope}', P.post].filter(Boolean).join('\n');
    },
  };

  // ================================================================ panel
  // the view: \tdplotsetmaincoords, written where it is or added at the top
  function setView(src: any, th: any, ph: any) {
    const L = layout(src), st = L.main != null ? L.S[L.main] : null;
    if (!st) return `\\tdplotsetmaincoords{${fmt(th, 0)}}{${fmt(ph, 0)}}\n` + src;
    return edits(src, [setNum(L, st.th, th, 0), setNum(L, st.ph, ph, 0)]);
  }
  function setScale(src: any, v: any, flat: any) {
    const L = layout(src, flat), st = L.begin != null ? L.S[L.begin] : null;
    if (!st) return src;
    return edits(src, setOpt(L, st, (o: any) => o.k === 'scale', `scale=${fmt(v, 2)}`, st.at));
  }
  function fullCode(src: any) { return String(src || '').trim(); }
  

  TD.geo3d = { parse, layout, draw, fitAt, bounds, labelAt, edits, setNum, setRadius, shiftEdits, setOpt, moveHandle, setView, setScale, optList, styleOf, splitTop, evalExpr, viewOf, euler, fmt, partsOf, POS, WIDTHS, DEFAULT };
  // Application integration belongs to the block, alongside its model and panel.
  TD.blocks.register("geo3d", {
    menu: { order: 14, label: "3D Geometry", title: "3D geometry, written for tikz-3dplot: frames, points, vectors, planes, angles and projections, edited visually", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M10 16V3M10 16l17 2M10 16l-7 5\"/><path d=\"M10 16l11-8\" class=\"c1\"/><path d=\"M14 13a5 5 0 001-4\"/><path d=\"M21 8v10\" stroke-dasharray=\"1.6 1.4\"/></svg>" },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    editor: { get: () => TD.geo3dEditor, alias: "geo3dOpen", layout: (s) => TD.geo3d.layout(s.src) }
  });
  panelServices = { layout, fmt, setScale, setView, fullCode };
})();
