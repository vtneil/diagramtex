import { runtime as TD } from '../runtime';
// Import from LaTeX / TikZ: parses the common TikZ subset (and everything DiagramTeX exports)
// into shapes; a full document is split into text and diagram blocks.
(function () {
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  const NAMED = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff',
    yellow: '#ffff00', gray: '#808080', grey: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', brown: '#bf8040', lime: '#bfff00',
    olive: '#808000', orange: '#ff8000', pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
  };
  const TIP_NAMES: Record<string, any> = { stealth: 'stealth', latex: 'latex', to: 'to', '>': 'to', bar: 'bar', '|': 'bar', circle: 'circle', 'circle[open]': 'ocircle', o: 'ocircle', '<': 'to' };
  // exact arrows.meta specs written by the exporter (TD.TIKZ_TIP), compared without spaces
  const TIP_EXACT = () => Object.fromEntries<any>(Object.entries<any>(TD.TIKZ_TIP || {}).map(([k, v]) => [v.toLowerCase().replace(/\s+/g, ''), k]));

  // ---------- pgfmath (as TikZ evaluates coordinates and options: trig in degrees) ----------
  // numbers, + - * / ^, unary - and !, postfix r (radians → degrees) and ! (factorial), comparisons, && ||, ?:,
  // and pgfmath's functions; an unknown name (a macro left unexpanded) is NaN
  const PGF_D = Math.PI / 180;
  const PGF_FN: Record<string, (...a: number[]) => number> = {
    sin: (a) => Math.sin(a * PGF_D), cos: (a) => Math.cos(a * PGF_D), tan: (a) => Math.tan(a * PGF_D),
    sec: (a) => 1 / Math.cos(a * PGF_D), cosec: (a) => 1 / Math.sin(a * PGF_D), cot: (a) => 1 / Math.tan(a * PGF_D),
    asin: (a) => Math.asin(a) / PGF_D, acos: (a) => Math.acos(a) / PGF_D, atan: (a) => Math.atan(a) / PGF_D,
    atan2: (y, x) => Math.atan2(y, x) / PGF_D, deg: (a) => a / PGF_D, rad: (a) => a * PGF_D,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2,
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    int: Math.trunc, frac: (a) => a - Math.trunc(a), real: (a) => a, neg: (a) => -a, pow: Math.pow,
    mod: (a, b) => a % b, Mod: (a, b) => ((a % b) + b) % b, divide: (a, b) => a / b, div: (a, b) => Math.trunc(a / b),
    multiply: (a, b) => a * b, add: (a, b) => a + b, subtract: (a, b) => a - b,
    min: (...a) => Math.min(...a), max: (...a) => Math.max(...a), veclen: (x, y) => Math.hypot(x, y),
    iseven: (a) => +(Math.trunc(a) % 2 === 0), isodd: (a) => +(Math.abs(Math.trunc(a) % 2) === 1),
    equal: (a, b) => +(a === b), greater: (a, b) => +(a > b), less: (a, b) => +(a < b), notequal: (a, b) => +(a !== b),
    and: (a, b) => +(!!a && !!b), or: (a, b) => +(!!a || !!b), not: (a) => +!a, ifthenelse: (c, a, b) => (c ? a : b),
    factorial: (a) => { let r = 1; for (let i = 2; i <= a; i++) r *= i; return r; },
  };
  const PGF_CONST: Record<string, number> = { pi: Math.PI, e: Math.E, true: 1, false: 0 };
  function pgfEval(src: string): number {
    const s = String(src);
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const peek = (t: string) => { ws(); return s.startsWith(t, i); };
    const eat = (t: string) => { if (peek(t)) { i += t.length; return true; } return false; };
    const fail = (): never => { throw new Error('pgfmath'); };
    const ternary = (): number => {
      const c = or();
      if (eat('?')) { const a = ternary(); if (!eat(':')) fail(); const b = ternary(); return c ? a : b; }
      return c;
    };
    const or = (): number => { let a = and(); while (eat('||')) { const b = and(); a = +(!!a || !!b); } return a; };
    const and = (): number => { let a = cmp(); while (eat('&&')) { const b = cmp(); a = +(!!a && !!b); } return a; };
    const cmp = (): number => {
      let a = add();
      for (;;) {
        if (eat('==')) a = +(a === add()); else if (eat('!=')) a = +(a !== add());
        else if (eat('<=')) a = +(a <= add()); else if (eat('>=')) a = +(a >= add());
        else if (eat('<')) a = +(a < add()); else if (eat('>')) a = +(a > add());
        else return a;
      }
    };
    const add = (): number => { let a = mul(); for (;;) { if (eat('+')) a += mul(); else if (peek('-')) { i++; a -= mul(); } else return a; } };
    const mul = (): number => { let a = unary(); for (;;) { if (eat('*')) a *= unary(); else if (eat('/')) a /= unary(); else return a; } };
    const unary = (): number => { if (eat('-')) return -unary(); if (eat('+')) return unary(); if (peek('!') && !peek('!=')) { i++; return +!unary(); } return power(); };
    const power = (): number => { const a = postfix(); if (eat('^')) return Math.pow(a, unary()); return a; };
    const postfix = (): number => {
      let a = atom();
      for (;;) {
        ws();
        if (s[i] === 'r' && !/\w/.test(s[i + 1] || '')) { i++; a = a / PGF_D; continue; }
        if (s[i] === '!' && s[i + 1] !== '=') { i++; a = PGF_FN.factorial(a); continue; }
        return a;
      }
    };
    const atom = (): number => {
      ws();
      if (eat('(')) { const v = ternary(); if (!eat(')')) fail(); return v; }
      if (eat('{')) { const v = ternary(); if (!eat('}')) fail(); return v; }
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(s.slice(i));
      if (m) { i += m[0].length; return parseFloat(m[0]); }
      const id = /^[A-Za-z]\w*/.exec(s.slice(i));
      if (!id) fail();
      i += id![0].length;
      const name = id![0];
      if (PGF_FN[name] && peek('(')) {
        i++; const args = [ternary()];
        while (eat(',')) args.push(ternary());
        if (!eat(')')) fail();
        return PGF_FN[name](...args);
      }
      if (name in PGF_CONST) return PGF_CONST[name];
      if (PGF_FN[name] && /^(rnd|rand)$/.test(name)) fail();
      return fail();
    };
    try { const v = ternary(); ws(); return i === s.length ? v : NaN; } catch { return NaN; }
  }
  const pgfNum = (src: any, fb: any): any => { const v = pgfEval(String(src ?? '')); return Number.isFinite(v) ? v : fb; };
  TD.pgfEval = pgfNum;

  // ---------- small helpers ----------
  const hex2 = (n: any) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  // node text: a \\ (with an optional [skip]) outside math and braces is a line break; inside math it is TeX's (\substack, matrices)
  function lineBreaks(text: string) {
    let out = '', math = false, depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\' && text[i + 1] === '\\' && !math && depth === 0) {
        const m = /^\\\\(?:\[[^\]]*\])?\s*/.exec(text.slice(i))!;
        out = out.replace(/\s+$/, '') + '\n'; i += m[0].length - 1; continue;
      }
      if (ch === '\\') { out += ch + (text[i + 1] ?? ''); if (text[i + 1] === '(' || text[i + 1] === '[') math = true; if (text[i + 1] === ')' || text[i + 1] === ']') math = false; i++; continue; }
      if (ch === '$') math = !math;
      else if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      out += ch;
    }
    return out.trim();
  }
  function splitTop(s: any, sep: any) { // split at depth-0 separators (braces / brackets / parens)
    const out = []; let d = 0, buf = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { buf += c + s[i + 1]; i++; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      if (c === sep && d === 0) { out.push(buf); buf = ''; } else buf += c;
    }
    out.push(buf);
    return out;
  }
  function matchClose(s: any, i: any, open: any, close: any) { // index of the bracket closing the one at s[i]
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === open) d++;
      else if (s[j] === close) { d--; if (d === 0) return j; }
    }
    return -1;
  }
  // the same, or the end of the text when the bracket is never closed (so a reader always moves on)
  const shut = (s: any, i: any, open: any, close: any) => { const e = matchClose(s, i, open, close); return e < 0 ? s.length : e; };
  // append every item of b to a (a spread into push overflows the stack on huge lists)
  const pushAll = (a: any[], b: any[]) => { for (const x of b) a.push(x); return a; };
  // the least of a list (Infinity when empty), without spreading it into Math.min
  const least = (l: number[]) => { let m = Infinity; for (const v of l) if (v < m) m = v; return m; };
  function stripComments(src: any) {
    return src.split('\n').map((l: any) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); } return l; }).join('\n');
  }
  // numeric macros the picture defines (\def\r{1.5}, \newcommand{\r}{2pt}, \pgfmathsetmacro{\r}{3/2}): name -> text,
  // written into coordinates and lengths where they are used. MAC is the current picture's (set by parseStatements).
  let MAC: any = null;
  function expandMac(v: any) {
    v = String(v);
    if (!MAC || !MAC.size || !v.includes('\\')) return v;
    const t = v.trim(), whole = /^\\([A-Za-z@]+)$/.exec(t);
    if (whole && MAC.has(whole[1])) return MAC.get(whole[1]);
    return v.replace(/\\([A-Za-z@]+)/g, (m: any, n: any) => (MAC.has(n) ? `(${MAC.get(n)})` : m));
  }
  // a macro definition's name and value, when it takes no arguments
  function macroDef(name: any, args: any) {
    const m = /^\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*(\[[^\]]*\])?\s*\{([\s\S]*)\}\s*;?\s*$/.exec(args);
    if (!m || m[2]) return null;
    let v = expandMac(m[3].trim());
    // a macro written in terms of itself (\def\a{\a\a}) doubles at every definition: give up past a sane size
    if (v.length > 4096) return null;
    if (/^pgfmath/.test(name)) { const n = pgfNum(v, NaN); if (!isFinite(n)) return null; v = String(+n.toFixed(6)); }
    return isFinite(len(v) as number) ? { nm: m[1], v } : null;
  }
  // length with unit -> px (default unit: cm for coordinates, pt for widths)
  const PT_PER: Record<string, number> = { cm: 72.27 / 2.54, mm: 7.227 / 2.54, pt: 1, in: 72.27, bp: 72.27 / 72, sp: 1 / 65536, em: 10, ex: 4.3 };
  function len(v: any, defUnit = 'cm') {
    v = expandMac(v);
    const m = String(v).trim().match(/^([-+]?[\d.]*\d(?:e[-+]?\d+)?|[-+]?\.\d+)\s*(cm|mm|pt|in|em|ex|bp)?$/i);
    if (!m) {
      // an expression with lengths in it (-4*6mm, 2*\x cm+1pt): pgfmath reads each length in pt, and so is the result
      const withUnits = String(v).replace(/(\d*\.?\d+(?:e[-+]?\d+)?)\s*(cm|mm|pt|in|bp|sp|em|ex)\b/gi, (_: any, n: any, u: any) => `(${n}*${PT_PER[u.toLowerCase()]})`);
      if (withUnits !== String(v)) { const e = pgfNum(withUnits, NaN); return isFinite(e) ? e / K : NaN; }
      const e = pgfNum(v, NaN); return isFinite(e) ? (defUnit === 'pt' ? e / K : e * PX) : NaN;
    }
    const n = parseFloat(m[1]), u = (m[2] || defUnit).toLowerCase();
    return { cm: n * PX, mm: n * PX / 10, pt: n / K, bp: n * 1.00375 / K, in: n * 2.54 * PX, em: n * 10 / K, ex: n * 4.3 / K }[u];
  }

  // the xyz coordinate system's unit vectors, in px with y up (TikZ's own orientation): x=1cm, y=1cm and
  // z=(-3.85mm,-3.85mm) unless the picture or a scope sets them
  const unitVectors = () => ({ vx: [PX, 0], vy: [0, PX], vz: [-0.385 * PX, -0.385 * PX] });
  // a coordinate part: a length when it carries a unit, else a number of unit vectors
  const UNIT = /(?:^|[^A-Za-z@\\])(?:\d|\.)\s*(?:cm|mm|pt|in|em|ex|bp|sp)\b|\\(?:pgflinewidth|textwidth|linewidth|baselineskip)\b/;
  function part(v: any): { n?: number, d?: number } {
    // (braces group in pgfmath as parentheses do: 3*0+{-1/3}, from a loop's values)
    let e = expandMac(v);
    if (/[{}]/.test(e) && !/\\/.test(e)) e = e.replace(/\{/g, '(').replace(/\}/g, ')');
    if (UNIT.test(e)) { const d = len(e, 'pt'); return Number.isFinite(d) ? { d: d as number } : {}; }
    const n = pgfNum(String(e), NaN);
    return Number.isFinite(n) ? { n } : {};
  }
  // a unit vector option (x=2cm, y={(0.5cm,0.3cm)}, z={(-1,-1)}): [x, y] px, y up, or null
  function unitVector(C: any, axis: 'x' | 'y' | 'z', v: any) {
    const t = String(v).trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
    if (t[0] === '(') {
      const q = coord({ ...C, ...unitVectors() }, t);
      return q ? [q.x, -q.y] : null;
    }
    const d = len(t, 'cm');
    if (!Number.isFinite(d)) return null;
    const D = d as number;
    return axis === 'x' ? [D, 0] : axis === 'y' ? [0, D] : [-D * 0.385, -D * 0.385];
  }
  function makeCtx() {
    return { colors: { ...NAMED }, macros: new Map(), names: {}, ...unitVectors(), warnings: [], styles: new Map(), boxes: {} };
  }
  // xcolor's svgnames (DarkBlue, ForestGreen, SteelBlue…) are the CSS colour names, written in CamelCase; the
  // browser knows their values. Lower-case names stay xcolor's own (green is #00ff00 there, not CSS's #008000).
  let svgCtx: any = null;
  function svgName(n: any) {
    if (!/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(n)) return null;
    try {
      svgCtx = svgCtx || document.createElement('canvas').getContext('2d');
      if (!svgCtx) return null;
      svgCtx.fillStyle = '#010203'; svgCtx.fillStyle = n;
      const v = String(svgCtx.fillStyle).toLowerCase();
      return v === '#010203' || !/^#[0-9a-f]{6}$/.test(v) ? null : v;
    } catch (e: any) { return null; }
  }
  function color(C: any, spec: any) {
    if (!spec) return null;
    spec = spec.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
    if (spec === 'none') return null;
    // xcolor's rgb,255:red,92;green,214;blue,92 (as q.uiver.app writes colours)
    if (/:/.test(spec) && TD.xcolorExpr) return TD.xcolorExpr(spec, (n: any) => C.colors[n.trim()] || C.colors[n.trim().toLowerCase()] || null) || undefined;
    // mixes: red!50, red!30!blue, red!50!black
    const parts = spec.split('!').map((x: any) => x.trim());
    const base = (n: any) => C.colors[n] || C.colors[n.toLowerCase()] || svgName(n);
    let c = base(parts[0]);
    if (!c) return undefined;
    const rgb = (h: any) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    let i = 1;
    while (i < parts.length) {
      const pct = parseFloat(parts[i]) / 100;
      const other = parts[i + 1] ? base(parts[i + 1]) : '#ffffff';
      if (!isFinite(pct) || !other) break;
      const a = rgb(c), b = rgb(other);
      c = '#' + a.map((v, k) => hex2(v * pct + b[k] * (1 - pct))).join('');
      i += 2;
    }
    return c;
  }
  // styles named in an option list (\tikzset{name/.style={…}}) stand for their keys; styUsed collects the names
  // a statement used, and styOff reads them as nothing (the statement without its styles: what the styles add)
  let STY: any = null, styUsed: any = null, styOff = false;
  const PIC_CODE = '\u0000pic:';
  let PIC_PASSES = 0;
  const STYLE_DEFAULT = '\u0000default:';
  let styleBudget = 0;
  function parseOpts(str: any, depth = 0, raw = false) : any {
    if (!str) return [];
    if (depth === 0) styleBudget = 4096;
    const out = [];
    for (const x of splitTop(str, ',').map((q) => q.trim()).filter(Boolean)) {
      const eq = splitTop(x, '=');
      const o = eq.length > 1 ? { k: eq[0].trim(), v: eq.slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1') } : { k: x, v: null };
      if (!raw && STY && STY.has(o.k)) {
        const body = STY.get(o.k), arg = o.v ?? STY.get(STYLE_DEFAULT + o.k);
        // Only single-argument styles are evaluated. Leave unsupported handlers visible to diagnostics.
        if (/#1/.test(body) && arg == null) { out.push(o); continue; }
        if (depth >= 16 || --styleBudget < 0) { out.push(o); continue; }
        const expanded = body.replace(/#1(?!\d)/g, () => arg ?? '');
        const invocation = o.v == null ? o.k : `${o.k}={${o.v}}`;
        if (styUsed) styUsed.add(invocation);
        if (!styOff) out.push(...parseOpts(expanded, depth + 1));
        continue;
      }
      out.push(o);
    }
    return out;
  }
  // Fixed and single-argument styles, default values, and append/prefix handlers.
  function addStyle(C: any, nm: any, body: any) {
    // of the `every …` styles, only the ones the importer applies are read (others would change what is drawn)
    if (/#(?:[2-9]|1\d)/.test(body) || (/^every /.test(nm) && !/^every (node|(rectangle|circle|ellipse) node|edge|join|matrix)$/.test(nm))) { C.styles.delete(nm); return; }
    C.styles.set(nm, body);
  }
  function defineStyles(C: any, cmd: any, args: any) {
    if (cmd === 'tikzstyle') { const m = /^\s*\{([^}]*)\}\s*=?\s*\[([\s\S]*)\]/.exec(args); if (m) addStyle(C, m[1].trim(), m[2]); return; }
    const m = /^\s*\{([\s\S]*)\}/.exec(args);
    if (!m) return;
    let directory = '';
    for (const { k, v } of parseOpts(m[1], 0, true)) {
      if (k.endsWith('/.cd')) { directory = k.slice(0,-4).replace(/^\/tikz\/?/, '').replace(/^\//,''); continue; }
      const path = k.startsWith('/') ? k.replace(/^\/(?:tikz\/)?/,'') : directory ? directory + '/' + k : k;
      const pic = /^pics\/(.+?)\/\.(style|pic)$/.exec(path);
      if (pic && v != null) {
        const code = pic[2] === 'pic' ? v : parseOpts(v,0,true).find((o: any) => o.k === 'code')?.v;
        if (code != null && !/#\d/.test(code)) C.styles.set(PIC_CODE + pic[1],code);
        else C.styles.delete(PIC_CODE + pic[1]);
        continue;
      }
      const sm = /^(.+?)\/\.(style|append style|prefix style|style \d+ args|style n args|default)$/.exec(k);
      if (!sm) continue;
      const nm = sm[1].trim();
      if (sm[2] === 'default' && v != null) C.styles.set(STYLE_DEFAULT + nm, v);
      else if (sm[2] === 'style' && v != null) addStyle(C, nm, v);
      else if (/^(append|prefix) style$/.test(sm[2]) && v != null) {
        const old = C.styles.get(nm) || '';
        addStyle(C, nm, sm[2] === 'append style' ? `${old},${v}` : `${v},${old}`);
      } else C.styles.delete(nm);
    }
  }
  let gtTip: any = null; // the tip `>` stands for in the picture being read (>=Stealth), null for TikZ's default
  function arrowSpec(spec: any) { // "->", "{Stealth}-{Latex[open]}", "<->", "-latex", "|->"
    const m = spec.match(/^(.*?)-(?!.*-)(.*)$/);
    if (!m) return null;
    const one = (t: any) => {
      t = t.trim().replace(/^\{|\}$/g, '').trim();
      if (!t) return 'none';
      const ex = TIP_EXACT()[t.toLowerCase().replace(/\s+/g, '')];
      if (ex) return ex;
      t = t.replace(/\[.*\]/, (x: any) => (/open/.test(x) ? '[open]' : ''));
      const k = t.toLowerCase().replace(/\s+/g, '');
      if ((k === '>' || k === '<') && gtTip) return gtTip; // the picture's >=… default
      if (k.includes('hook')) return 'to';
      if (k === '>>' || k === '<<') return 'to';
      return TIP_NAMES[k] || (k.length ? 'stealth' : 'none');
    };
    return { start: one(m[1]), end: one(m[2]) };
  }
  // style from options
  function style(C: any, opts: any, cmd: any) {
    const inherited = innermost(C)?.fonts;
    opts = [...(C.base || []), ...(inherited ? [{ k: 'font', v: inherited }] : []), ...opts]; // the picture's own line width, dash and colour come first
    const st: Record<string, any> = { stroke: cmd === 'fill' || cmd === 'shade' || cmd === 'path' ? null : '#000000', fill: cmd === 'fill' || cmd === 'filldraw' ? '#000000' : null, width: 0.4 / K, dash: 'solid', opacity: 1, startTip: 'none', endTip: 'none' };
    let strokeOpacity = 1, fillOpacity = 1, colorAll = null;
    const W: Record<string, any> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
    for (const { k, v } of opts) {
      if (v === null) {
        if (W[k] != null) st.width = W[k] / K;
        else if (k === 'dashed' || k === 'densely dashed' || k === 'loosely dashed') st.dash = 'dashed';
        else if (k === 'dotted' || k === 'densely dotted' || k === 'loosely dotted') st.dash = 'dotted';
        else if (k === 'dash dot' || k === 'dashdotted') st.dash = 'dashdot';
        else if (k === 'solid') st.dash = 'solid'; // undoes a dash set before it (a style's)
        else if (k === 'help lines') { colorAll = '#808080'; st.width = 0.2 / K; }
        else if (k === 'rounded corners') st.radius = 4 / K; // (TikZ's default radius)
        else if (k === 'sharp corners') st.radius = 0;
        else if (k.includes('-') && arrowSpec(k)) { const a = arrowSpec(k); st.startTip = a!.start; st.endTip = a!.end; }
        else { const c = color(C, k); if (c !== undefined) colorAll = c; }
        continue;
      }
      switch (k) {
        case 'draw': st.stroke = color(C, v) ?? (v === 'none' ? null : st.stroke || '#000000'); if (v !== 'none' && st.stroke == null) st.stroke = '#000000'; break;
        case 'fill': st.fill = color(C, v) ?? null; break;
        case 'color': colorAll = color(C, v) ?? null; break;
        case 'line width': st.width = len(v, 'pt'); break;
        case 'shorten >': st.shEnd = len(v, 'pt'); break;
        case 'shorten <': st.shStart = len(v, 'pt'); break;
        case 'opacity': st.opacity = pgfNum(expandMac(v), NaN); break;
        case 'draw opacity': strokeOpacity = pgfNum(expandMac(v), NaN); break;
        case 'fill opacity': fillOpacity = pgfNum(expandMac(v), NaN); break;
        case 'rounded corners': st.radius = len(v, 'pt'); break;
        case 'ball color': st.ballColor = color(C, v); break;
        case 'text': st.color = color(C, v); break;
        case 'font': st.font = (st.font || '') + ' ' + v; break;
        case 'dash pattern': {
          // on/off lengths in pt: the model keeps them as a custom dash ('p:on off …'); anything else stays unread
          const q = [...v.matchAll(/(on|off)\s*([\d.]+)\s*pt/g)];
          if (q.length && q.map((m) => m[0]).join(' ').replace(/\s+/g, '') === v.replace(/\s+/g, '')) st.dash = 'p:' + q.map((m) => +m[2]).join(' ');
          else st.dashUnread = true;
          break;
        }
        case 'decoration': st.decoration = v; break;
        case 'pos': st.pos = parseFloat(v); break;
        case 'out': st.out = pgfNum(expandMac(v), NaN); break;
        case 'in': st.in = pgfNum(expandMac(v), NaN); break;
        case 'looseness': st.looseness = pgfNum(expandMac(v), NaN); break;
        case 'step': st.step = len(v); break;
        case 'xstep': st.xstep = len(v); break;
        case 'ystep': st.ystep = len(v); break;
        case 'anchor': st.anchor = v; break;
        case 'rotate': st.rotate = parseFloat(v); break;
        case 'radius': st.r = len(v); break;
        case 'x radius': st.rx = len(v); break;
        case 'y radius': st.ry = len(v); break;
        case 'start angle': st.a1 = pgfNum(expandMac(v),NaN); break;
        case 'end angle': st.a2 = pgfNum(expandMac(v),NaN); break;
        case 'delta angle': st.da = pgfNum(expandMac(v),NaN); break;
        // bend left=0 is a straight bend, not the default 30°
        case 'bend left': { const b = parseFloat(v); st.bend = isFinite(b) ? b : 30; break; }
        case 'bend right': { const b = parseFloat(v); st.bend = -(isFinite(b) ? b : 30); break; }
        case 'above': case 'below': case 'left': case 'right': st.place = k; break;
        default: break;
      }
    }
    for (const { k } of opts) if (['above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'auto', 'swap', "'", 'sloped', 'midway', 'near start', 'near end', 'decorate', 'bend left', 'bend right'].includes(k)) st[k] = true;
    if (opts.some((o: any) => o.k === 'bend left' && o.v === null)) st.bend = 30;
    if (opts.some((o: any) => o.k === 'bend right' && o.v === null)) st.bend = -30;
    if (colorAll) {
      // a bare `draw`/`fill` takes the current colour; `draw=red` keeps its own
      if (cmd !== 'fill' && cmd !== 'shade' && !opts.some((o: any) => o.k === 'draw' && o.v != null)) st.stroke = colorAll;
      if ((cmd === 'fill' || cmd === 'filldraw' || opts.some((o: any) => o.k === 'fill' && o.v == null)) && !opts.some((o: any) => o.k === 'fill' && o.v != null)) st.fill = colorAll;
      if (!st.color) st.color = colorAll;
    }
    const gradient = new Map(opts.filter((o: any) => /^(left|right|middle|top|bottom) color$/.test(o.k)).map((o: any) => [o.k,color(C,o.v)]));
    if (gradient.size) {
      const vertical = gradient.has('top color') || gradient.has('bottom color');
      const a = gradient.get(vertical ? 'bottom color' : 'left color') || '#ffffff';
      const b = gradient.get(vertical ? 'top color' : 'right color') || '#ffffff';
      st.fill = { g:'linear', angle:vertical ? 90 : 0, stops:[[0,a], ...(gradient.has('middle color') ? [[.5,gradient.get('middle color')]] : []), [1,b]] };
    }
    const withA = (c: any, a: any): any => !c || !(a < 1) ? c : typeof c === 'object'
      ? { ...c, stops:c.stops.map(([t,v]: any) => [t,withA(v,a)]) } : c + hex2(Math.max(0,a) * 255);
    st.stroke = withA(st.stroke, strokeOpacity);
    st.fill = withA(st.fill, fillOpacity);
    return st;
  }
  function fontStyle(fontStr: any) {
    const o: { size: string | number; font: string; bold: boolean; italic: boolean } = { size: 'normalsize', font: 'default', bold: false, italic: false };
    if (!fontStr) return o;
    const fs = fontStr.match(/\\fontsize\{([\d.]+)(pt)?\}/);
    if (fs) o.size = Math.round((parseFloat(fs[1]) / K) * 100) / 100;
    for (const command of fontStr.matchAll(/\\([A-Za-z]+)/g)) if (TD.SIZES.some(([n]: any) => n === command[1])) o.size = command[1];
    if (/\\bfseries|\\textbf/.test(fontStr)) o.bold = true;
    if (/\\itshape|\\textit/.test(fontStr)) o.italic = true;
    for (const fnt of TD.FONTS) if (fnt[3] && fontStr.includes(fnt[3])) o.font = fnt[0];
    return o;
  }

  // ---------- path tokenizer ----------
  // returns tokens: {t:'coord', x, y, rel:0|1|2} {t:'op', v:'--'|'..'|'controls'|'and'|'rectangle'|'circle'|'ellipse'|'arc'|'cycle'|'to'|'|-'|'-|'|'grid'}
  // {t:'node', opts, text} {t:'opts', v} {t:'paren', v} (for circle radius etc)
  function tokenizePath(C: any, s: any, warn?: any) {
    const toks = [];
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    while (i < s.length) {
      ws();
      if (i >= s.length) break;
      const rest = s.slice(i);
      let m;
      if ((m = /^(\+\+?)\s*\(/.exec(rest))) {
        const rel = m[1].length;
        const st = i + m[0].length - 1, e = shut(s, st, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(st + 1, e), rel });
        i = e + 1; continue;
      }
      if (rest[0] === '(') {
        const e = shut(s, i, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(i + 1, e), rel: 0 });
        i = e + 1; continue;
      }
      if (rest[0] === '[') { const e = shut(s, i, '[', ']'); toks.push({ t: 'opts', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      if ((m = rest.match(/^(--|\.\.|\|-|-\|)/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if ((m = rest.match(/^pic\b\s*/))) {
        i += m[0].length; let opts = '';
        ws();
        if (s[i] === '[') { const e = shut(s,i,'[',']'); opts = s.slice(i+1,e); i = e+1; ws(); }
        if (s[i] === '{') { const e = shut(s,i,'{','}'); toks.push({ t:'pic', body:s.slice(i+1,e).trim(), opts }); i=e+1; }
        else { warn && warn('Unsupported pic syntax'); }
        continue;
      }
      if ((m = rest.match(/^(node|coordinate)\b\s*/))) {
        i += m[0].length;
        let opts = '', name = '';
        for (;;) {
          ws();
          if (s[i] === '[') { const e = shut(s, i, '[', ']'); opts += (opts ? ',' : '') + s.slice(i + 1, e); i = e + 1; continue; }
          if (s[i] === '(') { const e = shut(s, i, '(', ')'); name = s.slice(i + 1, e); i = e + 1; continue; }
          if (s.slice(i, i + 2) === 'at') { i += 2; ws(); const e = shut(s, i, '(', ')'); toks.push({ t: 'at', raw: s.slice(i + 1, e) }); i = e + 1; continue; }
          break;
        }
        let text = '', textStart = -1, textEnd = -1;
        if (m[1] === 'node' && s[i] === '{') { const e = shut(s, i, '{', '}'); text = s.slice(i + 1, e); textStart = i + 1; textEnd = e; i = e + 1; }
        toks.push({ t: 'node', opts, text, textStart, textEnd, name, coordinate: m[1] === 'coordinate' });
        continue;
      }
      // plot[smooth] coordinates {(a) (b) …}: one token with the plot's options and its points
      if ((m = rest.match(/^plot\s*(\[[^\]]*\])?\s*coordinates\s*\{/))) {
        const e = shut(s, i + m[0].length - 1, '{', '}'), body = s.slice(i + m[0].length, e), raws = [];
        for (let k = 0; k < body.length;) { const q = body.indexOf('(', k); if (q < 0) break; const r = shut(body, q, '(', ')'); raws.push(body.slice(q + 1, r)); k = r + 1; }
        toks.push({ t: 'plot', opts: m[1] ? m[1].slice(1, -1) : '', raws });
        i = e + 1; continue;
      }
      if ((m = rest.match(/^(controls|and|rectangle|circle|ellipse|arc|cycle|to|grid|edge|let|in|plot|sin|cos|parabola)\b/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if (rest[0] === '{') { const e = shut(s, i, '{', '}'); toks.push({ t: 'brace', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      warn && warn(`Unknown path text “${rest.slice(0, 12)}”`);
      i++;
    }
    return toks;
  }
  // calc's sums: `(a)+(b)-2*(c)`, `sqrt(14)*(0,3/14)`, `{1+2}*(a)`: the terms with their sign and factor, or null
  // when `raw` is not one (a single term without a factor is read as it is)
  function calcTerms(raw: string, names: any = {}) {
    // (x, y with arithmetic in it, as `0.2*(2),-0.5*(2)` from macros, is not a sum of points)
    if (splitTop(raw, ',').length > 1) return null;
    const pieces: { sign: number, text: string }[] = [];
    let level = 0, from = 0, sign = 1;
    const prevChar = (i: number) => { let j = i - 1; while (j >= 0 && /\s/.test(raw[j])) j--; return j < 0 ? '' : raw[j]; };
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if ('({['.includes(ch)) level++;
      else if (')}]'.includes(ch)) level--;
      else if (!level && (ch === '+' || ch === '-') && (i === 0 || prevChar(i) === ')')) {
        const text = raw.slice(from, i).trim();
        if (text) pieces.push({ sign, text });
        sign = ch === '-' ? -1 : 1; from = i + 1;
      }
    }
    const last = raw.slice(from).trim();
    if (last) pieces.push({ sign, text: last });
    const terms: { sign: number, factor: string | null, body: string }[] = [];
    for (const p of pieces) {
      if (!p.text.endsWith(')')) return null;
      let d = 0, open = -1;
      for (let i = p.text.length - 1; i >= 0; i--) { if (p.text[i] === ')') d++; else if (p.text[i] === '(' && !--d) { open = i; break; } }
      if (open < 0) return null;
      // a point is (x,y), (angle:r) or a name: `(2)` or `(1+2)` is arithmetic
      const inner = p.text.slice(open + 1, -1).trim();
      if (/^[-+\d.\s*/()]*$/.test(inner) && !names[inner]) return null;
      const pre = p.text.slice(0, open).trim();
      if (!pre) terms.push({ sign: p.sign, factor: null, body: p.text });
      else if (pre.endsWith('*') && !pre.includes('!')) terms.push({ sign: p.sign, factor: pre.slice(0, -1).trim(), body: p.text.slice(open) });
      else terms.push({ sign: p.sign, factor: null, body: p.text }); // a partway term, (a)!t!(b)
    }
    if (!terms.length || (terms.length === 1 && terms[0].factor == null && terms[0].sign === 1)) return null;
    // a partway term alone in a sum is read by its own rule; here it would recurse on itself
    if (terms.length === 1 && terms[0].body === raw) return null;
    return terms;
  }
  function coord(C: any, raw: any, cur?: any, depth = 0) : any {
    if (depth > 32) return null;
    raw = expandMac(raw.trim());
    const read = (v: string) => coord(C, v, cur, depth + 1);
    // Strip only a balanced whole-expression wrapper.
    while ((raw[0] === '{' && matchClose(raw, 0, '{', '}') === raw.length - 1)
      || (raw[0] === '(' && matchClose(raw, 0, '(', ')') === raw.length - 1)
      || (raw[0] === '$' && raw[raw.length - 1] === '$')) raw = raw.slice(1, -1).trim();
    let level = 0;
    for (let i = 0; i < raw.length - 1; i++) {
      if ('({'.includes(raw[i])) level++;
      else if (')}'.includes(raw[i])) level--;
      const op = raw.slice(i, i + 2);
      if (!level && (op === '|-' || op === '-|')) {
        const a = read(raw.slice(0, i)), b = read(raw.slice(i + 2));
        return a && b ? (op === '|-' ? { x: a.x, y: b.y } : { x: b.x, y: a.y }) : null;
      }
    }
    // calc: a sum of terms, each `(c)`, `factor*(c)` (factor a pgfmath expression) or a partway `(a)!…!(b)`
    const sum = calcTerms(raw, C.names || {});
    if (sum) {
      let x = 0, y = 0;
      for (const t of sum) {
        let f = 1, body = t.body;
        if (t.factor != null) { f = pgfNum(expandMac(t.factor.replace(/^\{([\s\S]*)\}$/, '$1')), NaN); if (!Number.isFinite(f)) return null; }
        const q = read(body);
        if (!q) return null;
        x += t.sign * f * q.x; y += t.sign * f * q.y;
      }
      return { x, y };
    }
    const terms = splitTop(raw, '!');
    if (terms.length === 3 || terms.length === 5) {
      // (a)!t!(b), (a)!1cm!(b) (that far towards b), (a)!t!angle:(b) (b turned about a first); five parts chain on
      if (terms.length === 5) return read(`(${terms.slice(0, 3).join('!')})!${terms[3]}!${terms[4]}`);
      const a = read(terms[0]);
      let bs = terms[2].trim(), ang = 0;
      const am = /^([^():]+):\s*(\([\s\S]*\))$/.exec(bs);
      if (am) { ang = pgfNum(expandMac(am[1]), NaN); bs = am[2]; }
      let b = read(bs);
      if (!a || !b || !Number.isFinite(ang)) return null;
      if (ang) { const r = -ang * Math.PI / 180, dx = b.x - a.x, dy = b.y - a.y; b = { x: a.x + dx * Math.cos(r) - dy * Math.sin(r), y: a.y + dx * Math.sin(r) + dy * Math.cos(r) }; }
      const mid = expandMac(terms[1]).trim();
      if (UNIT.test(mid)) {
        const d = len(mid, 'pt') as number, n = Math.hypot(b.x - a.x, b.y - a.y);
        return Number.isFinite(d) && n > 0 ? { x: a.x + (b.x - a.x) * d / n, y: a.y + (b.y - a.y) * d / n } : null;
      }
      const t = pgfNum(mid, NaN);
      return Number.isFinite(t) ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : null;
    }
    let m;
    const vx = C.vx || [PX, 0], vy = C.vy || [0, PX], vz = C.vz || [-0.385 * PX, -0.385 * PX];
    if ((m = raw.match(/^([^,:]+):([^,:]+)$/))) { // polar: a radius without a unit is in x and y vectors
      const dirs: Record<string, number> = { right: 0, up: 90, left: 180, down: 270, 'north': 90, 'south': 270, 'east': 0, 'west': 180 };
      const a = ((dirs[m[1].trim()] ?? pgfNum(expandMac(m[1]), NaN)) * Math.PI) / 180, radii = m[2].split(/\s+and\s+/);
      const rx = part(radii[0]), ry = radii[1] != null ? part(radii[1]) : rx;
      if (!Number.isFinite(a) || (rx.n == null && rx.d == null) || (ry.n == null && ry.d == null)) return null;
      const c = Math.cos(a), s = Math.sin(a);
      const X = rx.d != null ? [c * rx.d, 0] : [c * rx.n! * vx[0], c * rx.n! * vx[1]];
      const Y = ry.d != null ? [0, s * ry.d] : [s * ry.n! * vy[0], s * ry.n! * vy[1]];
      return { x: X[0] + Y[0], y: -(X[1] + Y[1]) };
    }
    const parts = splitTop(raw, ',');
    if (parts.length === 2 || parts.length === 3) {
      // each part: a length along its axis, or that many unit vectors
      const P = parts.map(part), V = [vx, vy, vz];
      if (P.every((q) => q.n != null || q.d != null)) {
        let X = 0, Y = 0;
        P.forEach((q, i) => {
          if (q.n != null) { X += q.n * V[i][0]; Y += q.n * V[i][1]; }
          else if (i === 0) X += q.d!; else if (i === 1) Y += q.d!; else { X += q.d! * vz[0] / PX; Y += q.d! * vz[1] / PX; }
        });
        return { x: X, y: -Y };
      }
      if (parts.length === 3) return null;
    }
    const nm = raw.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (C.unresolved?.has(nm)) return null;
    if (C.names[nm]) {
      const g = C.geo?.[nm], an = raw.slice(nm.length + 1).trim();
      if (g && raw.trim() === nm) return toLocal(C, { ...C.names[nm], node: nm, bare: true });
      if (g && an && an !== 'base' && an !== 'mid') { const q = anchorOf(g, an); if (q) return toLocal(C, { ...q, node: nm }); }
      const box = C.boxes[nm], anchor = raw.slice(nm.length + 1), uv = TD.nodeFeatures?.anchorUV(anchor,box?.shape?.type);
      if (box?.native && uv && TD.nodeFeatures.anchors.includes(anchor)) {
        const frame = TD.rotFrame(box.shape), [u,v] = uv;
        if (frame) return toLocal(C, { x:frame[0][0]+u*(frame[1][0]-frame[0][0])+v*(frame[3][0]-frame[0][0]), y:frame[0][1]+u*(frame[1][1]-frame[0][1])+v*(frame[3][1]-frame[0][1]), node:nm });
      }
      return toLocal(C, { ...C.names[nm], node: nm });
    }
    return null;
  }

  // ---------- shapes from a path command ----------
  function pathToShapes(C: any, cmd: any, optStr: any, body: any) {
    const opts = parseOpts(optStr);
    let st = style(C, opts, cmd);
    const toks = tokenizePath(C, body, (w: any) => C.warnings.push(w));
    const out: any[] = [], post: any[] = [];
    const L = { label: '', labelPos: 0.5, labelSide: 'left', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000' };
    let lineStyle = { stroke: st.stroke, width: st.width, dash: st.dash, opacity: st.opacity };
    // a bare node name stands for the node's border: where a ray from its centre towards `toward` leaves it
    const geoAt = (p: any) => p && p.bare && C.geo?.[p.node];
    const clip = (p: any, toward: any) => { const g = geoAt(p); return g ? toLocal(C, { ...borderToward(g, toAbs(C, toward)), node: p.node, border: true }) : p; };
    // a `to` (or edge) between a and b: straight, or the curve out=/in=/bend give (controls 0.3915 × the distance
    // between its ends, times looseness; ends on the nodes' borders in those directions)
    const toSeg = (a0: any, b0: any, o: any) => {
      const bend = o.bend, curved = Number.isFinite(o.out) || Number.isFinite(o.in) || (bend != null && bend !== 0);
      if (!curved) { const a = clip(a0, b0), b = clip(b0, a0); return { k: 'L', pts: [a, b] }; }
      const ang = Math.atan2(-(b0.y - a0.y), b0.x - a0.x) * 180 / Math.PI;
      const outA = Number.isFinite(o.out) || Number.isFinite(o.in) ? (Number.isFinite(o.out) ? o.out : ang) : ang + bend;
      const inA = Number.isFinite(o.out) || Number.isFinite(o.in) ? (Number.isFinite(o.in) ? o.in : ang + 180) : ang + 180 - bend;
      const dir = (t: number) => ({ x: Math.cos(t * Math.PI / 180), y: -Math.sin(t * Math.PI / 180) });
      const da = dir(outA), db = dir(inA);
      const a = clip(a0, { x: a0.x + da.x, y: a0.y + da.y }), b = clip(b0, { x: b0.x + db.x, y: b0.y + db.y });
      const L = Math.hypot(b.x - a.x, b.y - a.y) * 0.3915 * (Number.isFinite(o.looseness) ? o.looseness : 1);
      return { k: 'C', pts: [a, { x: a.x + da.x * L, y: a.y + da.y * L }, { x: b.x + db.x * L, y: b.y + db.y * L }, b] };
    };
    // Walk the path building "subpaths" of segments.
    // cur: where the path is (lines go on from it, nodes go at it); base: what +(…) is relative to (a + point
    // moves the path there but leaves base where it was)
    let cur: any = null, start = null, base: any = null;
    let segs: any[] = []; // {k:'L'|'C', pts:[...], label}
    let closed = false;
    const flush = () => {
      if (!segs.length) return;
      emitSegs(segs, closed);
      segs = []; closed = false;
    };
    const emitSegs = (sg: any, cl: any) => {
      const tipStart = st.startTip, tipEnd = st.endTip;
      if (sg.length === 1 && !cl) {
        const g = sg[0];
        if (g.k === 'L') {
          const [a, b] = g.pts;
          if (st.decorate && /zigzag/.test(st.decoration || '')) {
            const seg = (st.decoration.match(/segment length=([^,}]+)/) || [])[1];
            const amp = (st.decoration.match(/amplitude=([^,}]+)/) || [])[1];
            const Lp = Math.hypot(b.x - a.x, b.y - a.y);
            const pre = len((st.decoration.match(/pre length=([^,}]+)/) || [])[1] || '0');
            out.push({ type: 'spring', x1: a.x, y1: a.y, x2: b.x, y2: b.y, coils: Math.max(1, Math.round((Lp - 2 * (pre || 0)) / (seg ? len(seg) : 10)!)), amplitude: amp ? len(amp) : 6, ...lineStyle, stroke: st.stroke || '#000000', dash: 'solid' });
            return;
          }
          if (st.bend && false) { // to[bend ...] -> cubic (now built per `to` by toSeg)
            const u = { x: b.x - a.x, y: b.y - a.y }, d = Math.hypot(u.x, u.y), th = (st.bend * Math.PI) / 180;
            const ux = u.x / d, uy = u.y / d, c = Math.cos(th), sn = Math.sin(th), Lc = 0.3915 * d;
            const dA = { x: ux * c + uy * sn, y: -ux * sn + uy * c }, dB = { x: -ux * c + uy * sn, y: -ux * sn - uy * c };
            out.push({ type: 'curve', x1: a.x, y1: a.y, cx1: a.x + dA.x * Lc, cy1: a.y + dA.y * Lc, cx2: b.x + dB.x * Lc, cy2: b.y + dB.y * Lc, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || '#000000', startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}) });
            return;
          }
          out.push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || (st.fill ? null : '#000000'), startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}), ...(a.border ? { _b1: a.node } : {}), ...(b.border ? { _b2: b.node } : {}) });
          if (!st.stroke && st.fill) out[out.length - 1].stroke = st.fill;
          return;
        }
        if (g.k === 'C') {
          const [a, c1, c2, b] = g.pts;
          out.push({ type: 'curve', x1: a.x, y1: a.y, cx1: c1.x, cy1: c1.y, cx2: c2.x, cy2: c2.y, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || '#000000', startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}), ...(a.border ? { _b1: a.node } : {}), ...(b.border ? { _b2: b.node } : {}) });
          return;
        }
      }
      // polyline / polygon (curves & arcs sampled)
      const pts = [];
      for (const g of sg) {
        if (g.k === 'L') { if (!pts.length) pts.push(g.pts[0]); pts.push(g.pts[1]); }
        else if (g.k === 'C') {
          const [a, c1, c2, b] = g.pts;
          if (!pts.length) pts.push(a);
          for (let i = 1; i <= 16; i++) { const t = i / 16, m = 1 - t; pts.push({ x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x, y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y }); }
        } else if (g.k === 'A') { if (!pts.length) pts.push(g.pts[0]); pushAll(pts, g.pts.slice(1)); }
      }
      if (pts.length < 2) return;
      // TikZ fills an open subpath as though closed, without closing its stroked outline.
      if (!cl && st.fill) {
        if (st.stroke) out.push({type:'poly',pts:pts.map((p) => [p.x,p.y]),closed:true,...lineStyle,stroke:null,fill:st.fill,startTip:'none',endTip:'none'});
        else cl = true;
      }
      if (cl && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.01) pts.pop();
      out.push({ type: 'poly', pts: pts.map((p) => [p.x, p.y]), closed: cl, ...lineStyle, fill: cl ? st.fill : null, startTip: cl ? 'none' : tipStart, endTip: cl ? 'none' : tipEnd });
    };
    const resolve = (tk: any) => {
      const p = coord(C, tk.raw, cur);
      if (!p) { C.warnings.push(`Unsupported coordinate (${tk.raw})`); return null; }
      const b = base || cur;
      if (tk.rel && b) return { x: b.x + p.x, y: b.y + p.y };
      return p;
    };
    let pendingOp: any = null, ctrl: any[] = [], lastSegLabel: any = null, lastArc: any = null, toOpts: any[] = [], onSeg: any[] = [];
    // a rectangle just drawn (its corners), and the nodes written inside one (`rectangle node {…} (b)`) waiting for its
    // second corner: TikZ puts pos=t on a rectangle that far from its first corner to its second, so 0.5 is the centre
    let lastRect: any = null, rectNodes: any[] = [];
    // nodes on a -- or to with a placement of their own (above, anchor=…): at pos along it, by that anchor
    const placeOnSeg = (g: any) => {
      for (const n of onSeg) {
        const t = n.t, q = g.pts, P = g.k === 'C'
          ? { x: (1 - t) ** 3 * q[0].x + 3 * (1 - t) ** 2 * t * q[1].x + 3 * (1 - t) * t * t * q[2].x + t ** 3 * q[3].x, y: (1 - t) ** 3 * q[0].y + 3 * (1 - t) ** 2 * t * q[1].y + 3 * (1 - t) * t * t * q[2].y + t ** 3 * q[3].y }
          : { x: q[0].x + (q[1].x - q[0].x) * t, y: q[0].y + (q[1].y - q[0].y) * t };
        const sh = textShape(C, n.text, n.no, P, st.color); delete sh._box; post.push(sh);
      }
      onSeg = [];
    };
    const no0 = (o: any) => parseOpts(o);
    // a node at `at` (the current point, or a point along the last operation): a node with a border, or a text shape,
    // drawn on top
    const nodeAt = (tk: any, no: any[], at: any) => {
      const pno = [...everyNode(C, nodeShapeName(no) || 'rectangle'), ...no];
      const border = pno.some((o: any) => (o.k === 'draw' || o.k === 'fill') && o.v !== 'none'), shp = nodeShapeName(pno) || (border ? 'rectangle' : null);
      if (at && shp && NODE_SHAPES[shp] && (border || pno.some((o: any) => /^minimum /.test(o.k)))) {
        const pl = placeOf(pno, at, C), B = boxNode(C, lineBreaks(tk.text!), pno, pl.at, pl.anchor, shp), made = B.shape;
        if (tk.name) made.nodeName = tk.name;
        delete made._importNodeAt;
        post.push(made);
        // named, untransformed: its border, so the paths after it stop there as TikZ does
        const fr = tk.name && !(C.scopes || []).some((L: any) => L.xf && L.xf.length) && !opts.some((o: any) => XF_KEYS.has(o.k)) && TD.rotFrame(made);
        if (fr) { const g = geoOf(B.kind, fr, B.os); (C.geo ||= {})[tk.name] = g; C.names[tk.name] = { ...g!.c }; (C.kinds ||= {})[tk.name] = 'node'; return; }
      } else if (at && tk.text!.trim()) { const t = textShape(C, tk.text, pno, at, st.color); delete t._box; post.push(t); }
      if (tk.name && at) { C.names[tk.name] = toAbs(C, at); if (C.geo) delete C.geo[tk.name]; }
    };
    const pathTo = () => ({ bend: st.bend, out: st.out, in: st.in, looseness: st.looseness });
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t === 'pic') {
        const code = C.styles.get(PIC_CODE + tk.body), saved = { STY,MAC,styUsed,styOff };
        if (code == null) { C.warnings.push(`Unresolved pic (${tk.body})`); continue; }
        if (++PIC_PASSES > 1000 || PS_DEPTH >= 32) { C.warnings.push('Pic expansion limit exceeded'); continue; }
        const P = { ...C, preview:false, stmts:[], struct:null, warnings:[], scopes:[],
          styles:new Map(C.styles), macros:new Map(C.macros), names:{}, boxes:{}, geo:{}, kinds:{}, unresolved:new Set(), picIssue:null };
        try {
          const made = parseStatements(P,blankComments(code));
          const raw = made.filter((p: any) => p.type === 'tikz' && p.kind !== 'defs');
          if (raw.length) P.warnings.push(...raw.flatMap((p: any) => p.issues.length ? p.issues : ['Pic body is not fully supported']));
          const origin = cur || {x:0,y:0}, own = readXf(C,parseOpts(tk.opts));
          if (own.rest.length) P.warnings.push('Unsupported pic options: ' + own.rest.map((o: any) => o.k).join(', '));
          pushAll(out,applyXf(made.filter((p: any) => p.type !== 'tikz'),[{xf:[{dx:origin.x,dy:origin.y}],shape:true},{xf:own.xf,shape:true}]));
          C.warnings.push(...P.warnings);
        } finally { STY=saved.STY; MAC=saved.MAC; styUsed=saved.styUsed; styOff=saved.styOff; }
        continue;
      }
      if (tk.t === 'plot') {
        const po = parseOpts(tk.opts), has = (k: string) => po.some((o: any) => o.k === k);
        const raws: string[] = tk.raws || [], P = raws.map((r: any) => coord(C, r, cur)).filter(Boolean);
        if (P.length !== raws.length) C.warnings.push('Unsupported coordinate in a plot');
        flush();
        if (P.length >= 2) {
          const smooth = has('smooth') || has('smooth cycle'), cl = has('smooth cycle') || has('sharp cycle');
          const te = po.find((o: any) => o.k === 'tension'), tension = te ? parseFloat(te.v) : 0.5;
          out.push({ type: 'poly', pts: P.map((p: any) => [p.x, p.y]), closed: cl, ...lineStyle, fill: cl ? st.fill : null, startTip: cl ? 'none' : st.startTip, endTip: cl ? 'none' : st.endTip,
            ...(smooth ? { smooth: true, tension: Number.isFinite(tension) ? tension : 0.5 } : {}) });
          cur = base = P[P.length - 1];
        }
        pendingOp = null;
        continue;
      }
      if (tk.t === 'coord') {
        const relKind = tk.rel;
        const p = resolve(tk);
        if (!p) { pendingOp = null; continue; }
        if (pendingOp === 'controls') { ctrl.push({ ...p, rel: tk.rel, offset: tk.rel ? coord(C, tk.raw) : null }); continue; }
        // nothing to draw from (the point before could not be read): this one starts the path again
        if (!cur && pendingOp && pendingOp !== 'controls') { flush(); start = p; cur = base = p; pendingOp = null; toOpts = []; lastSegLabel = null; continue; }
        if (pendingOp === '--' || pendingOp === 'to' || pendingOp === '|-' || pendingOp === '-|') {
          if (pendingOp === '|-') segs.push({ k: 'L', pts: [cur, { x: cur.x, y: p.y }] }, { k: 'L', pts: [{ x: cur.x, y: p.y }, p] });
          else if (pendingOp === '-|') segs.push({ k: 'L', pts: [cur, { x: p.x, y: cur.y }] }, { k: 'L', pts: [{ x: p.x, y: cur.y }, p] });
          else {
            const o = pendingOp === 'to' ? { ...pathTo(), ...(toOpts.length ? (({ bend, out, in: inn, looseness }: any) => ({ ...(bend != null ? { bend } : {}), ...(Number.isFinite(out) ? { out } : {}), ...(Number.isFinite(inn) ? { in: inn } : {}), ...(Number.isFinite(looseness) ? { looseness } : {}) }))(style(C, toOpts, cmd)) : {}) } : {};
            const g = toSeg(cur, p, o);
            // TikZ starts a new piece where the path leaves a node's border
            if (g.pts[0].border && segs.length) flush();
            segs.push({ ...g, label: lastSegLabel });
            placeOnSeg(g);
          }
          if (pendingOp === '|-' || pendingOp === '-|') {
            const sg = segs.slice(-2);
            sg[0].pts[0] = clip(sg[0].pts[0], sg[0].pts[1]); sg[1].pts[1] = clip(sg[1].pts[1], sg[1].pts[0]);
            if (sg[0].pts[0].border && segs.length > 2) { const keep = segs.splice(-2); flush(); segs.push(...keep); }
          }
          lastSegLabel = null; toOpts = [];
        } else if (pendingOp === '..') {
          const c1 = ctrl[0], last = ctrl[1] || ctrl[0];
          const c2 = ctrl[1]?.rel && last.offset ? { x: p.x + last.offset.x, y: p.y + last.offset.y } : last;
          if (!c1 || !c2) { C.warnings.push('Bezier controls not understood'); pendingOp = null; continue; }
          segs.push({ k: 'C', pts: [cur, c1, c2, p] });
          ctrl = [];
        } else if (pendingOp === 'rectangle') {
          flush();
          const x = Math.min(cur.x, p.x), y = Math.min(cur.y, p.y);
          out.push({ type: 'rect', x, y, w: Math.abs(p.x - cur.x), h: Math.abs(p.y - cur.y), radius: st.radius || 0, ...lineStyle, fill: st.fill });
          lastRect = { a: cur, b: p };
          for (const n of rectNodes) nodeAt(n.tk, n.no, { x: cur.x + (p.x - cur.x) * n.t, y: cur.y + (p.y - cur.y) * n.t });
          rectNodes = [];
        } else if (pendingOp === 'grid') {
          flush();
          // lines at the multiples of the step (TikZ's grid is aligned to the origin) inside the rectangle
          const gs = toOpts.length ? style(C, toOpts, cmd) : st;
          const xs = gs.xstep ?? gs.step ?? st.xstep ?? st.step ?? PX, ys = gs.ystep ?? gs.step ?? st.ystep ?? st.step ?? PX;
          const x0 = Math.min(cur.x, p.x), x1 = Math.max(cur.x, p.x), y0 = Math.min(cur.y, p.y), y1 = Math.max(cur.y, p.y);
          if (!(xs > 0) || !(ys > 0) || (x1 - x0) / xs + (y1 - y0) / ys > 400) C.warnings.push('grid not understood');
          else {
            const e = 1e-6;
            for (let n = Math.ceil(x0 / xs - e); n * xs <= x1 + e * xs; n++) out.push({ type: 'line', x1: n * xs, y1: y1, x2: n * xs, y2: y0, ...lineStyle, stroke: st.stroke || '#000000', startTip: 'none', endTip: 'none', ...L });
            for (let n = Math.ceil(y0 / ys - e); n * ys <= y1 + e * ys; n++) out.push({ type: 'line', x1: x0, y1: n * ys, x2: x1, y2: n * ys, ...lineStyle, stroke: st.stroke || '#000000', startTip: 'none', endTip: 'none', ...L });
          }
          toOpts = [];
        } else if (pendingOp === 'edge') {
          // an edge: its own path from the current point (which stays where it is), drawn with the edge's options
          // (every edge is `draw` unless the picture says otherwise: then a \path edge is drawn only if it says so)
          let ee: any[] = [];
          if (C.styles?.has('every edge')) { const su = styUsed; try { ee = parseOpts('every edge'); } catch { ee = []; } styUsed = su; }
          const drawn = cmd !== 'path' || !C.styles?.has('every edge') || [...ee, ...toOpts].some((o: any) => o.k === 'draw' && o.v !== 'none');
          const eo = [...ee, ...toOpts], es = style(C, [...opts, ...eo], cmd === 'path' ? 'draw' : cmd);
          if (!drawn) { lastSegLabel = null; toOpts = []; pendingOp = null; continue; }
          const g = toSeg(cur, p, { bend: es.bend, out: es.out, in: es.in, looseness: es.looseness });
          const keep: any[] = [st, lineStyle];
          st = es; lineStyle = { stroke: es.stroke, width: es.width, dash: es.dash, opacity: es.opacity };
          try { emitSegs([{ ...g, label: lastSegLabel }], false); } finally { [st, lineStyle] = keep; }
          lastSegLabel = null; toOpts = []; pendingOp = null;
          continue;
        } else { // move-to
          flush();
          start = p;
        }
        cur = p; if (relKind !== 1 || !base) base = p;
        pendingOp = null;
        continue;
      }
      if (tk.t === 'op') {
        switch (tk.v) {
          case '--': case 'to': case '|-': case '-|': case 'rectangle': case 'grid': case 'edge': pendingOp = tk.v; toOpts = []; break;
          case '..': pendingOp = pendingOp === 'and' || pendingOp === 'controls' ? '..' : 'controls'; if (pendingOp === 'controls') ctrl = []; break;
          case 'controls': pendingOp = 'controls'; ctrl = []; break;
          case 'and': break;
          case 'cycle':
            if (pendingOp === '--' && start && cur) segs.push({ k: 'L', pts: [cur, start] });
            closed = true; pendingOp = null; cur = base = start; flush(); break;
          case 'circle': case 'ellipse': {
            if (!cur) cur = base = {x:0,y:0};
            let rx, ry;
            const nx = toks[i + 1];
            if (nx && nx.t === 'coord') { // (r) or (rx and ry)
              const a = nx.raw.split(/\s+and\s+/);
              rx = len(a[0]); ry = a[1] ? len(a[1]) : rx; i++;
            } else if (nx && nx.t === 'opts') {
              const so = style(C, parseOpts(nx.v), cmd); rx = so.rx ?? so.r; ry = so.ry ?? so.r; i++;
            } else { rx = st.rx ?? st.r; ry = st.ry ?? st.r; }
            if (!cur || !isFinite(rx)) { C.warnings.push('circle without radius'); break; }
            flush();
            if (cmd === 'shade' || st.ballColor) out.push({ type: 'ball', cx: cur.x, cy: cur.y, r: rx, ballColor: st.ballColor || '#a05a5a', opacity: st.opacity });
            else if (!st.stroke && st.fill && rx <= 4.5 && Math.abs(rx - ry) < 1e-6) out.push({ type: 'dot', cx: cur.x, cy: cur.y, r: rx, color: st.fill, opacity: st.opacity });
            else out.push({ type: 'ellipse', cx: cur.x, cy: cur.y, rx, ry, ...lineStyle, fill: st.fill });
            break;
          }
          case 'arc': {
            const nx = toks[i + 1];
            let a1, a2, r, ry;
            if (nx && nx.t === 'opts') { const so = style(C, parseOpts(nx.v), cmd); a1 = so.a1; a2 = so.a2 ?? (so.da != null ? a1 + so.da : undefined); r = so.r ?? so.rx; ry = so.r != null ? r : so.ry ?? r; i++; }
            else if (nx && nx.t === 'coord') { const q = nx.raw.split(':'); a1 = pgfNum(expandMac(q[0]), NaN); a2 = pgfNum(expandMac(q[1]), NaN); const rr = (q[2] || '').split(/\s+and\s+/); r = len(rr[0]); ry = rr[1] != null ? len(rr[1]) : r; i++; }
            if (![a1, a2, r].every(isFinite) || !cur) { C.warnings.push('arc not understood'); break; }
            if (!isFinite(ry) || !(ry > 0)) ry = r;
            const c = { x: cur.x - r * Math.cos((a1 * Math.PI) / 180), y: cur.y + ry * Math.sin((a1 * Math.PI) / 180) };
            const end = { x: c.x + r * Math.cos((a2 * Math.PI) / 180), y: c.y - ry * Math.sin((a2 * Math.PI) / 180) };
            const simple = !segs.length && !(toks.slice(i + 1).some((t) => t.t === 'op' && t.v !== 'node'));
            if (simple && !st.fill) {
              let A1 = a1, A2 = a2;
              if (A2 < A1) [A1, A2] = [A2, A1];
              out.push({ type: 'arc', cx: c.x, cy: c.y, r, ...(Math.abs(ry - r) > 1e-6 ? { ry } : {}), a1: A1, a2: A2, _rev: a2 < a1, ...lineStyle, stroke: st.stroke || '#000000', startTip: a2 < a1 ? st.endTip : st.startTip, endTip: a2 < a1 ? st.startTip : st.endTip });
            } else {
              const n = Math.min(2000, Math.max(4, Math.ceil(Math.abs(a2 - a1) / 6))), pts = [cur];
              for (let k = 1; k <= n; k++) { const a = ((a1 + ((a2 - a1) * k) / n) * Math.PI) / 180; pts.push({ x: c.x + r * Math.cos(a), y: c.y - ry * Math.sin(a) }); }
              segs.push({ k: 'A', pts });
            }
            cur = base = end; lastArc = { c, r, a1, a2, end };
            break;
          }
          default: C.warnings.push(`Path operation “${tk.v}” not supported`);
        }
        continue;
      }
      if (tk.t === 'opts') {
        if (pendingOp === 'to' || pendingOp === 'edge' || pendingOp === 'grid') { toOpts.push(...parseOpts(tk.v)); continue; }
        const so = style(C, parseOpts(tk.v), cmd); if (so.bend) st.bend = so.bend; continue;
      }
      // coordinate (A) on a path: names the current point; its labels are text by that point
      if (tk.t === 'node' && tk.coordinate) {
        if (cur) {
          // (kept as a named point, so the code after it that names it still finds it once this is rewritten)
          if (tk.name) { C.names[tk.name] = toAbs(C, cur); (C.kinds ||= {})[tk.name] = 'coordinate'; if (C.geo) delete C.geo[tk.name]; if (C.boxes) delete C.boxes[tk.name]; post.push({ type: 'coord', x: cur.x, y: cur.y, tikzName: tk.name }); }
          const ls = labelShapes(C, parseOpts(tk.opts), { kind: 'rect', c: { ...cur }, U: { x: 0, y: 0 }, V: { x: 0, y: 0 } }, st.color);
          if (ls) post.push(...ls);
        }
        continue;
      }
      if (tk.t === 'node') {
        const toPos = pendingOp === 'to' ? lastOpt(toOpts, 'pos') : null;
        const no = [...(toPos && !no0(tk.opts).some((o: any) => ['pos', 'midway', 'near start', 'near end', 'at start', 'at end'].includes(o.k)) ? [toPos] : []), ...no0(tk.opts)], ns = style(C, no, 'node');
        const fs = fontStyle(ns.font);
        const lab = { label: tk.text, labelSide: no.some((o: any) => o.k === 'swap' || o.k === "'") ? 'right' : no.some((o: any) => o.k === 'fill') ? 'on' : 'left', labelPos: isFinite(ns.pos) ? ns.pos : no.some((o: any) => o.k === 'near start') ? 0.25 : no.some((o: any) => o.k === 'near end') ? 0.75 : 0.5, ...fs, color: ns.color || st.color || '#000000' };
        const placed = no.some((o: any) => PLACE_ANCHOR[o.k] || o.k === 'anchor') && !no.some((o: any) => ['sloped', 'auto', 'swap', "'", 'draw', 'fill'].includes(o.k)) && !tk.name;
        if ((pendingOp === '--' || pendingOp === 'to') && placed && tk.text!.trim()) { onSeg.push({ text: tk.text, no, t: lab.labelPos }); continue; }
        if (pendingOp === 'rectangle') { rectNodes.push({ tk, no, t: lab.labelPos }); continue; }
        if (pendingOp === '--' || pendingOp === 'to' || pendingOp === 'edge') { lastSegLabel = lab; continue; }
        const along = no.some((o: any) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap'].includes(o.k));
        if (along && segs.length && segs[segs.length - 1].k === 'L' && segs.length === 1) { segs[0].label = lab; continue; }
        // midway (or pos=) on the arc just drawn: the point that far round it
        if (along && lastArc && lastArc.end === cur) {
          const A = lastArc, a = ((A.a1 + (A.a2 - A.a1) * lab.labelPos) * Math.PI) / 180;
          if (tk.text!.trim()) { const t = textShape(C, tk.text, no, { x: A.c.x + A.r * Math.cos(a), y: A.c.y - A.r * Math.sin(a) }, st.color); delete t._box; post.push(t); }
          continue;
        }
        // midway (or pos=) on the rectangle just drawn: that far from its first corner to its second; otherwise the
        // node is at the current point (e.g. after a coordinate)
        const R = along && lastRect && lastRect.b === cur ? lastRect : null;
        nodeAt(tk, no, R ? { x: R.a.x + (R.b.x - R.a.x) * lab.labelPos, y: R.a.y + (R.b.y - R.a.y) * lab.labelPos } : cur);
        continue;
      }
    }
    flush();
    // shorten < and > pull the path's first and last ends in (a line by its length, an arc round its circle)
    const ends = out.filter((x) => x.type === 'line' || x.type === 'arc');
    const pull = (x: any, atStart: any, d: any) => {
      if (!(d > 0)) return;
      if (x.type === 'arc') { const da = (d / x.r) * (180 / Math.PI); if (atStart !== x._rev) x.a1 += da; else x.a2 -= da; return; }
      const [ax, ay, bx, by] = atStart ? [x.x1, x.y1, x.x2, x.y2] : [x.x2, x.y2, x.x1, x.y1], L = Math.hypot(bx - ax, by - ay);
      if (!(L > d)) return;
      const nx = ax + ((bx - ax) * d) / L, ny = ay + ((by - ay) * d) / L;
      if (atStart) { x.x1 = nx; x.y1 = ny; } else { x.x2 = nx; x.y2 = ny; }
    };
    if (ends.length) { pull(ends[0], true, st.shStart); pull(ends[ends.length - 1], false, st.shEnd); }
    for (const x of out) delete x._rev;
    pushAll(out, post);
    if (st.bend) for (const s of out) if (s.type === 'line') {
      // `to[bend]` handled above for single segments; nothing else to do
    }
    return out;
  }

  // ---------- nodes: TikZ's box model ----------
  // A node's size is its text's TeX box (width, height above and depth below the baseline) plus inner sep on
  // each side, at least its minimum size. The app's text boxes are line boxes (taller than TeX's), so the height
  // and depth come from Computer Modern's metrics per em instead.
  const sizePt = (fs: any) => typeof fs.size === 'number' ? fs.size * K : ((TD.SIZES || []).find((q: any) => q[0] === fs.size)?.[1] ?? 10);
  function texBox(text: string, fs: any) {
    const em = sizePt(fs) / K, lines = String(text).split('\n'), tb = TD.textBox(text || ' ', fs);
    const w = Math.max(0, tb.w - 2);
    if (!String(text).trim()) return { w: 0, ht: 0, dp: 0 };
    const one = (t: string) => TD.texLineHD(t, em); // src/domain/automata.ts
    const first = one(lines[0]), last = one(lines[lines.length - 1]);
    if (!first || !last || lines.some((l) => !one(l))) return { w, ht: tb.h / 2, dp: tb.h / 2 };
    const skip = 1.2 * em * (lines.length - 1);
    return { w, ht: first.ht + skip / 2, dp: last.dp + skip / 2, lines: lines.length, base: skip };
  }
  // the node shapes the model holds: rectangle (rect), circle and ellipse (ellipse)
  const NODE_SHAPES: Record<string, string> = { rectangle: 'rect', circle: 'ellipse', ellipse: 'ellipse' };
  const NODE_BOX_KEYS = new Set(['inner sep', 'inner xsep', 'inner ysep', 'minimum size', 'minimum width', 'minimum height', 'outer sep', 'outer xsep', 'outer ysep', 'text width', 'align', 'text centered', 'rectangle', 'circle', 'ellipse', 'shape', 'rounded corners', 'node distance', 'on grid']);
  // the shape a node's options ask for: null for a node without a border (text), undefined for a shape the model
  // does not hold
  function nodeShapeName(nopts: any[]) {
    const o = [...nopts].reverse().find((q: any) => (q.v === null && q.k in NODE_SHAPES) || q.k === 'shape' || (q.v === null && /^(diamond|star|regular polygon|trapezium|semicircle|isosceles triangle|kite|dart|circular sector|cylinder|rounded rectangle|chamfered rectangle|cloud|signal|tape|single arrow|double arrow|circle split|rectangle split|ellipse split|forbidden sign|magnifying glass|cross out|strike out|circle ee|starburst)$/.test(q.k)));
    return o ? (o.k === 'shape' ? String(o.v).trim() : o.k) : null;
  }
  // geometry of a node from its options and text: kind, full width and height (px), the separation used, text box
  function innerSeps(nopts: any[]) {
    let sep: number | undefined, sx = 3.333 / K, sy = 3.333 / K;
    for (const o of nopts) {
      if (o.k === 'inner sep') { sep = len(o.v, 'pt') as number; sx = sy = sep; }
      else if (o.k === 'inner xsep') sx = len(o.v, 'pt') as number;
      else if (o.k === 'inner ysep') sy = len(o.v, 'pt') as number;
    }
    return { sep, sx, sy };
  }
  function nodeSize(C: any, nopts: any[], text: string, fs: any, shapeName: string) {
    const kind = NODE_SHAPES[shapeName];
    const get = (k: string) => { const o = [...nopts].reverse().find((q: any) => q.k === k); return o ? len(o.v, 'pt') : undefined; };
    const { sep, sx, sy } = innerSeps(nopts);
    const ms = get('minimum size'), mw = get('minimum width') ?? ms, mh = get('minimum height') ?? ms;
    const tb = texBox(text, fs), tw = get('text width');
    const bw = (Number.isFinite(tw) ? (tw as number) : tb.w), bh = tb.ht + tb.dp;
    let w = bw + 2 * sx, h = bh + 2 * sy;
    if (shapeName === 'circle') { const d = 2 * Math.hypot(w / 2, h / 2); w = h = Math.max(d, Number.isFinite(ms) ? ms as number : 0, Number.isFinite(mw) ? mw as number : 0, Number.isFinite(mh) ? mh as number : 0); }
    else {
      if (shapeName === 'ellipse') { w *= Math.SQRT2; h *= Math.SQRT2; }
      w = Math.max(w, Number.isFinite(mw) ? mw as number : 0); h = Math.max(h, Number.isFinite(mh) ? mh as number : 0);
    }
    // (a negative inner sep is allowed: TikZ draws the box that much smaller than the text)
    const bad = [sep, sx, sy].some((v) => v !== undefined && !Number.isFinite(v)) || [mw, mh].some((v) => v !== undefined && !(Number.isFinite(v) && (v as number) >= 0)) || !(w > 0 && h > 0);
    return { kind, w, h, sx, sy, tb, tw, bad };
  }
  // a node's border as geometry (px, y down): centre, its two half axes (rotated with the node) and its kind
  // (anchors and line ends are on the outer border: `os`, outer sep, outside the drawn one)
  function geoOf(kind: string, frame: any, os = 0) {
    if (!frame) return null;
    const [a, b, , d] = frame, c = { x: (frame[0][0] + frame[2][0]) / 2, y: (frame[0][1] + frame[2][1]) / 2 };
    const grow = (x: number, y: number) => { const n = Math.hypot(x, y); return n > 0 ? { x: x * (n + os) / n, y: y * (n + os) / n } : { x: os, y: 0 }; };
    return { kind, c, U: grow((b[0] - a[0]) / 2, (b[1] - a[1]) / 2), V: grow((d[0] - a[0]) / 2, (d[1] - a[1]) / 2) };
  }
  // outer sep: given, else half the line width (TikZ's default)
  const outerSep = (nopts: any[], width: number) => { const o = lastOpt(nopts, 'outer sep'); const v = o ? len(o.v, 'pt') as number : NaN; return Number.isFinite(v) ? v : (width || 0.4 / K) / 2; };
  // where a ray from the node's centre towards P leaves its border
  function borderToward(g: any, P: any) {
    const dx = P.x - g.c.x, dy = P.y - g.c.y, det = g.U.x * g.V.y - g.U.y * g.V.x;
    if (!det || (!dx && !dy)) return { ...g.c };
    const p = (dx * g.V.y - dy * g.V.x) / det, q = (g.U.x * dy - g.U.y * dx) / det;
    const n = g.kind === 'ellipse' ? Math.hypot(p, q) : Math.max(Math.abs(p), Math.abs(q));
    return n > 0 ? { x: g.c.x + dx / n, y: g.c.y + dy / n } : { ...g.c };
  }
  // an anchor of a node by name (compass, or a border angle such as 30), px y down
  function anchorOf(g: any, a: string) {
    a = String(a || 'center').trim();
    if (TD.nodeFeatures?.anchors.includes(a)) {
      const [u, v] = TD.nodeFeatures.anchorUV(a, g.kind === 'ellipse' ? 'ellipse' : 'rect'), p = 2 * u - 1, q = 2 * v - 1;
      return { x: g.c.x + p * g.U.x + q * g.V.x, y: g.c.y + p * g.U.y + q * g.V.y };
    }
    const ang = Number(a);
    if (Number.isFinite(ang)) { const r = ang * Math.PI / 180; return borderToward(g, { x: g.c.x + Math.cos(r), y: g.c.y - Math.sin(r) }); }
    return null;
  }
  const PLACE_ANCHOR: Record<string, string> = { above: 'south', below: 'north', left: 'east', right: 'west', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
  // `every node/.style` (and `every circle node` etc.): the options every node starts with
  function everyNode(C: any, shape?: string) {
    const keep = styUsed; styUsed = null;
    try { return [...(C.styles?.has('every node') ? parseOpts('every node') : []), ...(shape && C.styles?.has(`every ${shape} node`) ? parseOpts(`every ${shape} node`) : [])]; }
    finally { styUsed = keep; }
  }
  const OLD_OF = ['above of', 'below of', 'left of', 'right of', 'above left of', 'above right of', 'below left of', 'below right of'];
  // start chain[=name] [going dir]: a chain's direction (right=of the last node, …), last node and count
  function startChain(C: any, v: any, scoped: boolean) {
    const m = /^\s*(?:(?!going\b)([^\s]+))?\s*(?:going\s+(.+?))?\s*$/.exec(String(v ?? ''));
    if (!m) return false;
    const name = m[1] || 'chain', dir = (m[2] || 'right').trim();
    if (!PLACE_ANCHOR[dir]) return false;
    (C.chains ||= {})[name] = { dir, last: null, n: 0, scoped };
    C.chainCur = name;
    return true;
  }
  const lastOpt = (opts: any[], k: string) => [...opts].reverse().find((o: any) => o.k === k);
  // the anchor a node's options put at its position, and that position moved by above=2pt and the like
  // below=0.5 (no `of`): a plain number is in cm with the positioning library, pt without (measured with pdflatex);
  // a picture with no \usetikzlibrary seen is taken to have it
  const placeUnit = (C: any) => !C?.libs || C.libs.includes('positioning') ? undefined : 'pt';
  function placeOf(opts: any[], P: any, C?: any) {
    const last = [...opts].reverse().find((o: any) => o.k === 'anchor' || PLACE_ANCHOR[o.k]);
    if (!last) return { anchor: 'center', at: P, bad: null };
    if (last.k === 'anchor') return { anchor: String(last.v || '').trim(), at: P, bad: null };
    if (last.v == null || /\bof\b/.test(last.v)) return { anchor: PLACE_ANCHOR[last.k], at: P, bad: null };
    const d = String(last.v).split(/\s+and\s+/).map((x: any) => len(x, placeUnit(C)) as number), sy = d[0], sx = d[1] ?? d[0];
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return { anchor: PLACE_ANCHOR[last.k], at: P, bad: `${last.k}=${last.v}` };
    return { anchor: PLACE_ANCHOR[last.k], at: { x: P.x + (/left/.test(last.k) ? -sx : /right/.test(last.k) ? sx : 0), y: P.y + (/above/.test(last.k) ? -sy : /below/.test(last.k) ? sy : 0) }, bad: null };
  }
  // a node with a border (rectangle, circle, ellipse) as a rect or ellipse holding its text; `at` is where its
  // `anchor` goes. Returns the shape (before transforms), its size and the options it does not hold.
  function boxNode(C: any, text: string, nopts: any[], at: any, anchor: string | null, shapeName: string) {
    const st = style(C, nopts, 'node'), decoration = nodeDecorations(nopts), fs = fontStyle(st.font);
    if (!nopts.some((o: any) => o.k === 'draw' && o.v !== 'none')) st.stroke = null;
    const sz = nodeSize(C, nopts, text, fs, shapeName), bad: string[] = [];
    const os = outerSep(nopts, st.width);
    const g0 = { kind: sz.kind, c: { x: 0, y: 0 }, U: { x: sz.w / 2 + os, y: 0 }, V: { x: 0, y: sz.h / 2 + os } };
    // base: the text's baseline ((height − depth)/2 below the centre); mid: half an ex above it
    const bm = /^(base|mid)(?: (west|east))?$/.exec(String(anchor || '').trim());
    const off = bm && (!bm[2] || sz.kind === 'rect')
      ? { x: bm[2] === 'west' ? -(sz.w / 2 + os) : bm[2] === 'east' ? sz.w / 2 + os : 0, y: (sz.tb.ht - sz.tb.dp) / 2 - (bm[1] === 'mid' ? 2.15 * sizePt(fs) / 10 / K : 0) }
      : anchorOf(g0, anchor || 'center');
    if (!off) bad.push('anchor=' + anchor);
    const c = { x: at.x - (off ? off.x : 0), y: at.y - (off ? off.y : 0) };
    const made = TD.TYPES[sz.kind].create(c, st);
    made.stroke = st.stroke ?? null; // (create gives a border by default: a node without draw has none)
    Object.assign(made, sz.kind === 'rect' ? { x: c.x - sz.w / 2, y: c.y - sz.h / 2, w: sz.w, h: sz.h, radius: st.radius || 0 } : { cx: c.x, cy: c.y, rx: sz.w / 2, ry: sz.h / 2 }, fs, { color: st.color || '#000000' }, decoration.fields);
    if (text) made.nodeText = text;
    made._importNodeAt = { ...at };
    const al = lastOpt(nopts, 'align')?.v?.trim(), centred = al === 'center' || nopts.some((o: any) => o.k === 'text centered');
    if (al && !/^(center|left|right|flush center|flush left|flush right)$/.test(al)) bad.push('align=' + al);
    if (Number.isFinite(sz.tw) && (!centred || sz.tb.w > (sz.tw as number) + 1)) bad.push('text width');
    if (/\n/.test(text) && !centred) bad.push('align');
    if (sz.bad) bad.push('inner sep');
    // outer sep only moves where anchors and line ends are (geo): the drawing is the same
    const allowed = new Set([...PATH_KEYS, ...NODE_KEYS, ...NODE_BOX_KEYS, ...OLD_OF]);
    // labels the model does not hold: separate text shapes (not when the node is turned or scaled)
    let labels: any[] = [], dIss = decoration.issues;
    if (dIss.some((w: string) => /label/.test(w)) && !nopts.some((o: any) => o.k === 'pin')) {
      const L = labelShapes(C, nopts, { ...g0, c }, st.color);
      if (L) { labels = L; dIss = dIss.filter((w: string) => !/label/.test(w)); delete made.nodeLabel; delete made.nodeLabelPosition; }
    }
    bad.push(...unknownKeys(C, nopts, allowed), ...dIss);
    return { shape: made, kind: sz.kind, w: sz.w, h: sz.h, os, bad, labels };
  }
  function nodeDecorations(opts: any[]) {
    const fields: Record<string, any> = {}, issues: string[] = [];
    const seen = new Set();
    for (const o of opts) if (o.k === 'label' || o.k === 'pin') {
      if (seen.has(o.k)) { issues.push('multiple ' + o.k + ' options'); continue; } seen.add(o.k);
      let value = String(o.v || '').trim(), settings: any[] = [];
      if (value[0] === '[') { const end = shut(value, 0, '[', ']'); settings = parseOpts(value.slice(1,end)); value = value.slice(end+1); }
      const parts = splitTop(value, ':'), position = parts.length > 1 ? parts.shift()!.trim() : 'above';
      const text = parts.join(':').trim().replace(/^\{([\s\S]*)\}$/, '$1'), key = o.k === 'pin' ? 'Pin' : 'Label';
      if (!/^(above|below|left|right|above left|above right|below left|below right)$/.test(position)) issues.push('unsupported ' + o.k + ' angle');
      else { fields['node'+key] = text; fields['node'+key+'Position'] = position; }
      for (const set of settings) {
        if (set.k === 'pin distance' && o.k === 'pin' && Number.isFinite(len(set.v))) fields.nodePinDistance = len(set.v);
        else if (!(set.k === 'label distance' && o.k === 'label' && Math.abs((len(set.v) || 0) - 6)<.01)) issues.push('unsupported ' + o.k + ' option ' + set.k);
      }
    }
    return { fields, issues };
  }
  // labels a node's model does not hold (several, at an angle, with options): text shapes where TikZ puts them,
  // or null. g: the node's border with its outer sep (px, y down). TikZ puts a label at the border point at its
  // angle (above right = 45°), label distance further out, by its anchor on the other side (30° → south west),
  // then moves it by its shift (all measured with pdflatex)
  const LABEL_ANGLE: Record<string, number> = { above: 90, below: 270, left: 180, right: 0, 'above left': 135, 'above right': 45, 'below left': 225, 'below right': 315 };
  const LABEL_SET = new Set(['shift', 'xshift', 'yshift', 'label distance', 'font', 'text', 'color', 'opacity', 'text opacity', 'inner sep', 'inner xsep', 'inner ysep', 'outer sep', 'anchor', 'name', 'align']);
  function labelShapes(C: any, nopts: any[], g: any, inherit: any) {
    const out: any[] = [];
    for (const o of nopts) {
      if (o.k !== 'label') continue;
      let value = String(o.v || '').trim(), settings: any[] = [];
      if (value[0] === '[') { const end = shut(value, 0, '[', ']'); settings = parseOpts(value.slice(1, end)); value = value.slice(end + 1); }
      const parts = splitTop(value, ':'), position = parts.length > 1 ? parts.shift()!.trim() : 'above';
      const text = parts.join(':').trim().replace(/^\{([\s\S]*)\}$/, '$1');
      const th = LABEL_ANGLE[position] ?? pgfNum(expandMac(position), NaN);
      if (!Number.isFinite(th) || !text) return null;
      if (settings.some((x: any) => !LABEL_SET.has(x.k) && color(C, x.k) === undefined)) return null;
      const r = th * Math.PI / 180, dir = { x: Math.cos(r), y: -Math.sin(r) };
      const B = anchorOf(g, String(th));
      if (!B) return null;
      const dv = lastOpt(settings, 'label distance')?.v ?? C.labelDist, d = dv != null ? len(dv, 'pt') as number : 0;
      if (!Number.isFinite(d)) return null;
      let at = { x: B.x + d * dir.x, y: B.y + d * dir.y };
      for (const x of settings) {
        if (x.k === 'shift') { const q = coord(C, String(x.v).trim().replace(/^\{([\s\S]*)\}$/, '$1')); if (!q) return null; at = { x: at.x + q.x, y: at.y + q.y }; }
        else if (x.k === 'xshift' || x.k === 'yshift') { const q = len(x.v) as number; if (!Number.isFinite(q)) return null; at = x.k === 'xshift' ? { x: at.x + q, y: at.y } : { x: at.x, y: at.y - q }; }
      }
      const h = Math.abs(dir.x) > 1e-3 ? (dir.x > 0 ? 'west' : 'east') : '', v = Math.abs(dir.y) > 1e-3 ? (dir.y < 0 ? 'south' : 'north') : '';
      const own = lastOpt(settings, 'anchor')?.v?.trim();
      const t = textShape(C, text, settings.filter((x: any) => !/^(shift|xshift|yshift|label distance|name|anchor)$/.test(x.k)), at, inherit, own || [v, h].filter(Boolean).join(' ') || 'center');
      delete t._box; out.push(t);
    }
    return out;
  }
  function textShape(C: any, text: any, opts: any, P: any, inherit?: any, anchor?: string | null) {
    const st = style(C, opts, 'node');
    const fs = fontStyle(st.font);
    text = text.replace(/\$\s*\\displaystyle\b\s*([^$]*)\$/g, (m: any, x: any) => `$$${x.trim()}$$`);
    const s: any = { ...nodeDecorations(opts).fields, type: 'text', x: P.x, y: P.y, text: lineBreaks(text), ...fs, color: st.color || inherit || '#000000', opacity: st.opacity ?? 1 };
    const al = lastOpt(opts, 'align')?.v?.trim();
    if (al === 'left' || al === 'right' || al === 'flush left' || al === 'flush right') s.align = al.replace('flush ', '');
    // TikZ puts the node's anchor (on its box: TeX's text box and inner sep) at the position
    const tb = texBox(s.text, s), get = (k: string) => { const o = lastOpt(opts, k); return o ? len(o.v, 'pt') : undefined; };
    const { sx, sy } = innerSeps(opts);
    const os = outerSep(opts, st.width);
    const hw = tb.w / 2 + (Number.isFinite(sx) ? sx as number : 3.333 / K) + os, hh = (tb.ht + tb.dp) / 2 + (Number.isFinite(sy) ? sy as number : 3.333 / K) + os;
    let at = P;
    if (anchor == null) { const pl = placeOf(opts, P, C); anchor = pl.anchor; at = pl.at; }
    // base: the text's baseline ((height − depth)/2 below the centre); mid: half an ex above it
    const bm = /^(base|mid)(?: (west|east))?$/.exec(String(anchor || '').trim());
    const off = bm ? { x: bm[2] === 'west' ? -hw : bm[2] === 'east' ? hw : 0, y: (tb.ht - tb.dp) / 2 - (bm[1] === 'mid' ? 2.15 * sizePt(fs) / 10 / K : 0) }
      : anchorOf({ kind: 'rect', c: { x: 0, y: 0 }, U: { x: hw, y: 0 }, V: { x: 0, y: hh } }, anchor || 'center') || { x: 0, y: 0 };
    s.x = at.x - off.x; s.y = at.y - off.y;
    s._box = { hw, hh, os };
    return s;
  }

  // ---------- statements ----------
  // ---------- coordinate transforms, in TikZ option order ----------
  // Returns the transform list in option order (TikZ applies the last one to points first),
  // and the options that are not transforms.
  const XF_KEYS = new Set(['shift', 'xshift', 'yshift', 'rotate', 'rotate around', 'scale', 'scale around', 'xscale', 'yscale']);
  function readXf(C: any, list: any) {
    const xf = [], rest = [], unresolved: string[] = [];
    for (const { k, v } of list) {
      const before = xf.length;
      if (k === 'shift' && v) { const c = coord(C, String(v).trim().replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')); if (c) xf.push({ dx: c.x, dy: c.y }); }
      else if (k === 'xshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: d, dy: 0 }); }
      else if (k === 'yshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: 0, dy: -d! }); }
      else if (k === 'scale' && v) { const k = pgfNum(expandMac(v), NaN); if (isFinite(k) && k > 0) xf.push({ scale: k, px: 0, py: 0 }); }
      else if ((k === 'xscale' || k === 'yscale') && v) {
        // one axis only (a negative factor mirrors): applied to coordinates, not to nodes' own size
        const f = pgfNum(expandMac(v), NaN);
        if (isFinite(f) && f !== 0) xf.push({ sx: k === 'xscale' ? f : 1, sy: k === 'yscale' ? f : 1, px: 0, py: 0 });
      }
      else if (k === 'scale around' && v) {
        const m = String(v).match(/^([^:]+):\s*\((.*)\)\s*$/);
        const k = m && pgfNum(expandMac(m[1]), NaN), c = m && coord(C, m[2]);
        if (isFinite(k) && k > 0 && c) xf.push({ scale: k, px: c.x, py: c.y });
      }
      else if (k === 'rotate' && v) { const a = pgfNum(v, NaN); if (isFinite(a)) xf.push({ rot: a, px: 0, py: 0 }); }
      else if (k === 'rotate around' && v) {
        const m = String(v).trim().replace(/^\{|\}$/g, '').match(/^([^:]+):\s*\((.*)\)\s*$/);
        const a = m && pgfNum(m[1], NaN), c = m && coord(C, m[2]);
        if (isFinite(a) && c) xf.push({ rot: a, px: c.x, py: c.y });
      } else rest.push({ k, v });
      if (XF_KEYS.has(k) && xf.length === before) unresolved.push(`Unresolved transform ${k}=${v}`);
    }
    C.warnings.push(...unresolved);
    return { xf, rest, unresolved };
  }
  // xscale / yscale about (px, py): coordinates scale per axis; nodes and blocks only move with their anchor (TikZ
  // leaves a node's own size alone without `transform shape`); a circle arc becomes an elliptical one, or a
  // polyline when mirrored
  function scaleAxes(s: any, sx: number, sy: number, px: number, py: number) {
    const point = (x: number, y: number) => [px + (x - px) * sx, py + (y - py) * sy];
    const node = s.type === 'text' || s._importNodeAt || s.nodeText != null || s.nodeName || TD.blocks?.get(s.type);
    if (node) {
      const b = TD.bbox(s), anchor = s._importNodeAt || { x: b.x + b.w / 2, y: b.y + b.h / 2 }, [x, y] = point(anchor.x, anchor.y);
      TD.translate(s, x - anchor.x, y - anchor.y);
      if (s._importNodeAt) s._importNodeAt = { x, y };
      return;
    }
    if (s.type === 'arc' && (sx < 0 || sy < 0)) {
      const ry = s.ry ?? s.r, n = Math.max(8, Math.ceil(Math.abs(s.a2 - s.a1) / 4)), pts = [];
      for (let k = 0; k <= n; k++) { const a = (s.a1 + (s.a2 - s.a1) * k / n) * Math.PI / 180; pts.push(point(s.cx + s.r * Math.cos(a), s.cy - ry * Math.sin(a))); }
      const keep = { ...s };
      for (const key of Object.keys(s)) delete s[key];
      Object.assign(s, { ...keep, type: 'poly', pts, closed: false });
      for (const key of ['cx', 'cy', 'r', 'ry', 'a1', 'a2']) delete s[key];
      return;
    }
    const type = TD.TYPES[s.type];
    if (s.type === 'rect') {
      const [x1, y1] = point(s.x, s.y), [x2, y2] = point(s.x + s.w, s.y + s.h);
      Object.assign(s, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
      return;
    }
    for (const [x, y] of type.pts || []) [s[x], s[y]] = point(s[x], s[y]);
    if (s.type === 'poly') s.pts = s.pts.map(([x, y]: number[]) => point(x, y));
    if (s.type === 'region') s.rings = s.rings.map((r: any[]) => r.map(([x, y]: number[]) => point(x, y)));
    if (s.type === 'ellipse') { s.rx *= Math.abs(sx); s.ry *= Math.abs(sy); }
    if (s.type === 'arc') { s.ry = (s.ry ?? s.r) * sy; s.r *= sx; if (Math.abs(s.ry - s.r) < 1e-9) delete s.ry; }
    if (s.type === 'dot' || s.type === 'ball') s.r *= Math.sqrt(Math.abs(sx * sy));
  }
  // C.scopes runs outermost first, so opening and closing a scope is a push and a pop.
  const innermost = (C: any) => { const L = C.scopes; return L && L.length ? L[L.length - 1] : null; };
  // a scope as it opens: the fonts it inherits, joined once, so a style reads them without walking the scopes
  function openScope(C: any, L: any) {
    const up = innermost(C)?.fonts || '';
    L.fonts = [up, L.font].filter(Boolean).join(' ');
    (C.scopes = C.scopes || []).push(L);
    return L;
  }
  // apply transforms (lists outermost first, so the innermost is applied first; each list last-option-first); text keeps its own angle
  // unless `transform shape` is on
  // Names hold where a point is on the page (every scope's transform applied); a path inside a scope is read in
  // that scope's own coordinates, so a name used there is taken back through the scopes' transforms first.
  function scopeMap(C: any) {
    const L = C.scopes || [];
    if (!L.some((l: any) => l.xf?.length)) return null;
    const f = (x: number, y: number) => { const d = applyXf([{ type: 'dot', cx: x, cy: y, r: 0 }], L.map((l: any) => ({ xf: l.xf, shape: false })))[0]; return [d.cx, d.cy]; };
    const [ox, oy] = f(0, 0), [ax, ay] = f(1, 0), [bx, by] = f(0, 1);
    return { ox, oy, a: ax - ox, b: bx - ox, c: ay - oy, d: by - oy };
  }
  function toAbs(C: any, p: any) {
    const M = scopeMap(C);
    return M ? { ...p, x: M.ox + M.a * p.x + M.b * p.y, y: M.oy + M.c * p.x + M.d * p.y } : { ...p };
  }
  function toLocal(C: any, p: any) {
    const M = scopeMap(C), det = M ? M.a * M.d - M.b * M.c : 0;
    if (!M || !det) return p;
    const X = p.x - M.ox, Y = p.y - M.oy;
    return { ...p, x: (M.d * X - M.b * Y) / det, y: (-M.c * X + M.a * Y) / det };
  }
  function applyXf(shapes: any, lists: any) {
    const shapeFrom: boolean[] = new Array(lists.length);
    for (let li = 0, on = false; li < lists.length; li++) shapeFrom[li] = on = on || !!lists[li].shape;
    for (const s of shapes) {
      for (let li = lists.length - 1; li >= 0; li--) {
        const L = lists[li], transformShape = shapeFrom[li];
        if (L.opacity != null) s.opacity = (s.opacity ?? 1) * L.opacity;
        for (let i = L.xf.length - 1; i >= 0; i--) {
          const t = L.xf[i];
          if (t.sx !== undefined) { scaleAxes(s, t.sx, t.sy, t.px, t.py); continue; }
          if (t.scale !== undefined) {
            const k = t.scale, node = s.type === 'text' || s._importNodeAt || s.nodeText != null || s.nodeName || TD.blocks?.get(s.type);
            const point = (x: number, y: number) => [t.px + (x - t.px) * k, t.py + (y - t.py) * k];
            if (node) {
              const b = TD.bboxOf(TD.TYPES[s.type].samples({ ...s, objectScale: 1 }), 0);
              const anchor = s._importNodeAt || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
              const centre = transformShape ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : anchor;
              TD.translate(s, (centre.x - t.px) * (k - 1), (centre.y - t.py) * (k - 1));
              if (transformShape) s.objectScale = (s.objectScale || 1) * k;
              if (s._importNodeAt) { const [x, y] = point(anchor.x, anchor.y); s._importNodeAt = { x, y }; }
            } else {
              // Bake path coordinates into world space, keeping editable endpoints
              // and named-coordinate attachments consistent with the drawing.
              const type = TD.TYPES[s.type];
              for (const [x, y] of type.pts || []) [s[x], s[y]] = point(s[x], s[y]);
              if (s.type === 'poly') s.pts = s.pts.map(([x, y]: number[]) => point(x, y));
              if (s.type === 'region') s.rings = s.rings.map((r: any[]) => r.map(([x, y]: number[]) => point(x, y)));
              for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (typeof s[key] === 'number') s[key] *= k;
            }
            continue;
          }
          if (t.rot === undefined) { TD.translate(s, t.dx, t.dy); if (s._importNodeAt) { s._importNodeAt.x += t.dx; s._importNodeAt.y += t.dy; } continue; }
          // a node turns with the picture only under transform shape: otherwise just its position moves
          const upright = !transformShape && (s.type === 'text' || s.nodeText != null), keep = upright ? s.angle : null;
          TD.rotateShape(s, t.px, t.py, -t.rot);
          if (s._importNodeAt) {
            const a = -t.rot * Math.PI / 180, dx = s._importNodeAt.x - t.px, dy = s._importNodeAt.y - t.py;
            s._importNodeAt = { x: t.px + Math.cos(a) * dx - Math.sin(a) * dy, y: t.py + Math.sin(a) * dx + Math.cos(a) * dy };
          }
          if (upright) { if (keep) s.angle = keep; else delete s.angle; }
        }
      }
    }
    for (const s of shapes) delete s._importNodeAt;
    return shapes;
  }
  // \draw[even odd rule] with several closed parts → one Region with holes
  function evenOdd(shapes: any) {
    const parts = shapes.filter((s: any) => TD.canCombine && TD.canCombine(s));
    if (parts.length < 2) return shapes;
    const res = TD.combineGeom(parts, 'exclude');
    if (!res || !res.length) return shapes;
    const region = { type: 'region', rings: res[0].rings, ...TD.regionStyle(parts[0]) };
    return [region, ...shapes.filter((s: any) => !parts.includes(s))];
  }

  // ---------- what the model holds exactly ----------
  // A statement becomes shapes only when every option and coordinate in it is one the shapes hold exactly;
  // anything else stays TikZ code (src/domain/rawtikz.ts), with the shapes as its preview.
  const W_KEYS = ['ultra thin', 'very thin', 'thin', 'semithick', 'thick', 'very thick', 'ultra thick', 'dashed', 'densely dashed', 'loosely dashed', 'dotted', 'densely dotted', 'loosely dotted', 'dash dot', 'dashdotted'];
  const PATH_KEYS = new Set([...W_KEYS, 'draw', 'fill', 'color', 'line width', 'opacity', 'draw opacity', 'fill opacity', 'rounded corners', 'sharp corners', 'ball color', 'left color', 'right color', 'middle color', 'top color', 'bottom color', 'dash pattern',
    'radius', 'x radius', 'y radius', 'start angle', 'end angle', 'delta angle', 'bend left', 'bend right', 'even odd rule', 'out', 'in', 'looseness', 'help lines', 'step', 'xstep', 'ystep', 'shift', 'xshift', 'yshift', 'rotate', 'rotate around', 'scale', 'scale around', 'transform shape']);
  const NODE_KEYS = new Set(['name', 'on chain', 'join', 'label', 'pin', 'outer sep', 'font', 'text', 'color', 'opacity', 'anchor', 'rotate', 'above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'shift', 'xshift', 'yshift', 'scale', 'scale around', 'transform shape']);
  const TEXT_KEYS = new Set([...NODE_KEYS, 'inner sep', 'inner xsep', 'inner ysep', 'align', 'text centered', 'node distance', 'on grid', 'above left of', 'above right of', 'below left of', 'below right of', 'above of', 'below of', 'left of', 'right of']);
  const LABEL_KEYS = new Set(['above', 'below', 'left', 'right', 'midway', 'pos', 'near start', 'near end', 'swap', "'", 'auto', 'font', 'text', 'color', 'fill']);
  const COLOR_KEYS = new Set(['draw', 'fill', 'color', 'text', 'ball color', 'left color', 'right color', 'middle color', 'top color', 'bottom color']);
  function exactTip(t: any) {
    t = t.trim().replace(/^\{|\}$/g, '').trim();
    if (!t) return true;
    const k = t.toLowerCase().replace(/\s+/g, '');
    return !!(TIP_EXACT()[k] || TIP_NAMES[k]);
  }
  // keys in `list` the shapes do not hold: [] when all are understood
  function unknownKeys(C: any, list: any, allowed: any) {
    const bad = [];
    for (const { k, v } of list) {
      if (v === null && !allowed.has(k)) {
        if (k.includes('-') && /^(.*?)-(?!.*-)(.*)$/.test(k)) { const m = k.match(/^(.*?)-(?!.*-)(.*)$/); if (exactTip(m[1]) && exactTip(m[2])) continue; }
        if (color(C, k) !== undefined) continue;
        bad.push(k); continue;
      }
      if (!allowed.has(k)) { bad.push(k); continue; }
      if (v !== null && COLOR_KEYS.has(k) && v !== 'none' && color(C, v) === undefined) bad.push(`${k}=${v}`);
      if (k === 'decoration' && !/^zigzag\b/.test(v)) bad.push('decoration=' + v);
      if (k === 'dash pattern' && !/^(\s*(on|off)\s*[\d.]+\s*pt)+\s*$/.test(v)) bad.push('dash pattern=' + v);
    }
    return bad;
  }
  // option lists of a path statement: its own, each to[…]/circle[…]/arc[…], and the nodes on it
  // a point given by name that the shapes cannot hold exactly: a node (TikZ starts and ends lines at its border,
  // and its anchors depend on its size) or a point the importer only placed approximately
  function nameIssue(C: any, raw: any) {
    const r = String(raw || '').trim();
    if (r.startsWith('\\') && Number.isFinite(len(r))) return null;
    if (!r || r.includes('|-') || r.includes('-|') || /^[-+\d.\s]/.test(r) || r.includes(',') || r.includes(':') || r.includes('$')) return null;
    const anchor = /\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/.test(r);
    const nm = r.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (!C.names[nm]) return `Unresolved node or coordinate (${nm})`;
    if (C.unresolved?.has(nm)) return `Unresolved layout dependency (${nm})`;
    if (C.approx && C.approx.has(nm)) return `(${nm}) is placed approximately`;
    if (anchor && C.boxes[nm]?.native && TD.nodeFeatures?.anchors.includes(r.slice(nm.length+1))) return null;
    // a node whose border is known: lines stop at it as TikZ's do; its anchors are points on it
    if (C.geo?.[nm] && (!anchor || !/\.(base|mid)$/.test(r))) return null;
    if ((C.kinds || {})[nm] !== 'coordinate') return anchor ? `an anchor of node (${nm})` : `node (${nm}) as an end (TikZ stops at its border)`;
    return null;
  }
  function pathIssues(C: any, optStr: any, body: any) {
    const toks = tokenizePath(C, body);
    const own = parseOpts(optStr);
    const keys = new Set(PATH_KEYS);
    if (own.some((o: any) => o.k === 'decorate') && own.some((o: any) => o.k === 'decoration')) { keys.add('decorate'); keys.add('decoration'); }
    const bad = unknownKeys(C, own, keys), pts = [];
    for (let ti = 0; ti < toks.length; ti++) {
      const t = toks[ti];
      // to[pos=…] node {…}: the nodes on that to are put at pos (the to's options are around them)
      if (t.t === 'opts') bad.push(...unknownKeys(C, parseOpts(t.v), toks[ti - 1]?.t === 'op' && toks[ti - 1].v === 'to' && toks[ti + 1]?.t === 'node' ? new Set([...PATH_KEYS, 'pos']) : PATH_KEYS));
      // a coordinate with labels only (see pathToShapes)
      if (t.t === 'node' && t.coordinate) {
        const co = parseOpts(t.opts);
        if (co.some((o: any) => o.k !== 'label' && o.k !== 'name') || !labelShapes(C, co, { kind: 'rect', c: { x: 0, y: 0 }, U: { x: 0, y: 0 }, V: { x: 0, y: 0 } }, null)) bad.push('coordinate on a path');
        continue;
      }
      if (t.t === 'node') {
        const opts = [...everyNode(C), ...parseOpts(t.opts)], allowed = new Set(LABEL_KEYS);
        for (const k of ['above left', 'above right', 'below left', 'below right', 'inner sep', 'inner xsep', 'inner ysep']) allowed.add(k);
        const border = opts.some((o: any) => (o.k === 'draw' || o.k === 'fill') && o.v !== 'none') || opts.some((o: any) => /^minimum /.test(o.k)), shp = nodeShapeName(opts) || (border ? 'rectangle' : null);
        if (shp && NODE_SHAPES[shp] && border && !opts.some((o: any) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap', "'"].includes(o.k))) {
          for (const k of [...PATH_KEYS, ...NODE_KEYS, ...NODE_BOX_KEYS]) allowed.add(k);
          allowed.add('anchor');
        }
        // A node placed at the current point is a separate text object. Its anchor is
        // implemented by textShape; labels attached along a segment use a different model.
        const along = opts.some((o: any) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap'].includes(o.k));
        if (!along && opts.some((o: any) => o.k === 'anchor' && /^(center|north|south|east|west|north east|north west|south east|south west)$/.test(o.v))) allowed.add('anchor');
        bad.push(...unknownKeys(C, opts, allowed));
      }
      if (t.t === 'plot') {
        const po = parseOpts(t.opts);
        if (po.some((o: any) => !['smooth', 'smooth cycle', 'sharp plot', 'sharp cycle', 'tension'].includes(o.k))) bad.push('plot');
        for (const r of t.raws || []) { const w = nameIssue(C, r); if (w) pts.push(w); }
      }
      if (t.t === 'op' && ['let', 'plot', 'sin', 'cos', 'parabola', 'in'].includes(t.v)) bad.push(t.v);
      if (t.t === 'brace') bad.push('{…}');
      if (t.t === 'coord') { const w = nameIssue(C, t.raw); if (w) pts.push(w); }
    }
    return [...(bad.length ? [`options the shapes do not hold: ${[...new Set(bad)].join(', ')}`] : []), ...new Set(pts)];
  }

  // ---------- statement extents ----------
  // the end of a command's arguments: {…}, […], =, a macro name (\def\x, \newcommand\foo), #1
  function argsEnd(s: any, j: any) {
    let k = j, first = true;
    for (;;) {
      let q = k; while (q < s.length && /[ \t]/.test(s[q])) q++;
      if (s[q] === '\n') { let r = q + 1; while (r < s.length && /[ \t]/.test(s[r])) r++; if (s[r] === '{' || s[r] === '[') q = r; else break; }
      const c = s[q];
      if (c === '{' || c === '[') { const e = matchClose(s, q, c, c === '{' ? '}' : ']'); if (e < 0) return s.length; k = e + 1; first = false; continue; }
      if (c === '=' ) { k = q + 1; continue; }
      if (c === '#' && /\d/.test(s[q + 1])) { k = q + 2; continue; }
      if (c === '\\' && first) { const m = /^\\[a-zA-Z@]+/.exec(s.slice(q)); if (m) { k = q + m[0].length; first = false; continue; } }
      break;
    }
    return k;
  }
  function semiEnd(s: any, j: any) { // just after the first ';' at depth 0
    let d = 0, k = j;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      else if (c === ';' && d <= 0) return k + 1;
    }
    return s.length;
  }
  // \foreach \x [opts] in {list} body — body a {group}, another \foreach or one statement
  function foreachParse(s: any, j: any, depth = 0) : any {
    const m = /^\s*(?=((?:\\[a-zA-Z@]+\s*(?:\/\s*)?)+))\1(\[[^\]]*\])?\s*in\s*/.exec(s.slice(j));
    if (!m) return { end: semiEnd(s, j) };
    const vars = m[1].split('/').map((v) => v.trim()).filter(Boolean);
    let k = j + m[0].length, list = '';
    if (s[k] === '{') { const e = matchClose(s, k, '{', '}'); if (e < 0) return { end: s.length }; list = s.slice(k + 1, e); k = e + 1; } else { const e = /^[^\s{\\]+/.exec(s.slice(k)); list = e ? e[0] : ''; k += list.length; }
    while (/\s/.test(s[k])) k++;
    let body, end;
    if (s[k] === '{') { const e = matchClose(s, k, '{', '}'); if (e < 0) return { end: s.length }; body = s.slice(k + 1, e); end = e + 1; }
    else if (s.startsWith('\\foreach', k) && depth < 64) { const r: any = foreachParse(s, k + 8, depth + 1); body = s.slice(k, r.end); end = r.end; }
    else { end = semiEnd(s, k); body = s.slice(k, end); }
    return { end, vars, opts: m[2] || '', list, body };
  }
  function foreachValues(list: any) {
    const it = splitTop(list, ',').map((x) => x.trim()).filter((x) => x !== '');
    const out = [];
    for (let i = 0; i < it.length; i++) {
      if (it[i] !== '...') { out.push(it[i]); continue; }
      const a = parseFloat(it[i - 2] ?? it[i - 1]), b = parseFloat(it[i - 1]), c = parseFloat(it[i + 1]);
      const step = it[i - 2] !== undefined && isFinite(a) ? b - a : (b <= c ? 1 : -1);
      if (![b, c, step].every(isFinite) || !step) return null;
      for (let v = b + step, n = 0; (step > 0 ? v < c - 1e-9 : v > c + 1e-9) && n < 400; v += step, n++) out.push(String(Math.round(v * 1e6) / 1e6));
      if (out.length > 400) return null;
    }
    return out;
  }
  function expandForeach(C: any, f: any) {
    const vals = foreachValues(f.list);
    if (!vals || !f.vars || /remember/.test(f.opts)) { C.warnings.push('\\foreach list not understood: no preview'); return []; }
    const settings = parseOpts((f.opts || '').replace(/^\[|\]$/g,''),0,true);
    const evaluation = settings.filter((o: any) => o.k === 'evaluate');
    if (settings.some((o: any) => o.k !== 'evaluate' && o.k !== 'count') || evaluation.some((o: any) => o.v == null)) {
      C.warnings.push('Unsupported foreach options: no preview'); return [];
    }
    const count = /count\s*=\s*(\\[a-zA-Z@]+)/.exec(f.opts || '');
    const out: any[] = [];
    if ((FOREACH_PASSES += vals.length) > 100000) { C.warnings.push('\\foreach makes too many passes: no preview'); return []; }
    vals.forEach((v, n) => {
      const parts = f.vars.length > 1 ? v.replace(/^\{|\}$/g, '').split('/') : [v];
      let body = f.body;
      const P = { ...C, macros:new Map(C.macros) };
      const replace = (text: string, nm: string, value: string) => text.replace(/\\[A-Za-z@]+/g, token => token === nm ? value : token);
      f.vars.forEach((nm: any, q: any) => { body = replace(body,nm,`{${(parts[q] ?? parts[parts.length - 1]).trim()}}`); P.macros.set(nm.slice(1),(parts[q] ?? parts[parts.length - 1]).trim()); });
      if (count) { body = replace(body,count[1],String(n+1)); P.macros.set(count[1].slice(1),String(n+1)); }
      const saved = MAC; MAC=P.macros;
      try {
        for (const setting of evaluation) for (const assignment of splitTop(setting.v,';').filter((v: string) => v.trim())) {
          const m = /^\s*\\([A-Za-z@]+)\s*=\s*([\s\S]+)$/.exec(assignment);
          const value = m ? pgfNum(expandMac(m[2]),NaN) : NaN;
          if (!m || !Number.isFinite(value)) { C.warnings.push('Unsupported foreach evaluate assignment: no preview'); return; }
          P.macros.set(m[1],String(value));
        }
        pushAll(out, parseStatements(P, body.replace(/\{([-\d.]+)\}/g, '$1')));
      } finally { MAC=saved; STY=C.styles; }
    });
    return out;
  }
  // the passes of a loop as statements of their own: their shapes when every one is exact, else null
  function foreachExact(C: any, f: any) {
    // the trial writes the picture's own name tables, logged: undone if the loop isn't held, kept if it is
    // (copying four tables per loop was O(loops × names))
    for (const k of ['kinds', 'boxes', 'geo']) C[k] ||= {};
    const Q = { ...C, preview: false, stmts: [], struct: null, warnings: [] };
    let made: any, log: any[] = [];
    try { const run = recordTables(Q, ['names', 'kinds', 'boxes', 'geo'], () => expandForeach(Q, f)); made = run.result; log = run.log; }
    catch (e: any) { return { why: [] }; }
    // why a pass is not held exactly: what its statements could not hold (said once each)
    const why = [...new Set([...Q.warnings, ...Q.stmts.filter((st: any) => st.raw).flatMap((st: any) => st.shapes.flatMap((x: any) => x.issues || []))])];
    if (!made.length || Q.warnings.length || !Q.stmts.length || Q.stmts.some((st: any) => st.raw)) { undoLog(log); return { why }; }
    // kept: what the loop set stays; a name it only deleted keeps its earlier value, as merging copies did
    const before = new Map<any, Map<any, any>>();
    for (const [o, key, had, old] of log) { let m = before.get(o); if (!m) before.set(o, m = new Map()); if (!m.has(key)) m.set(key, had ? { old } : null); }
    for (const [o, m] of before) for (const [key, was] of m) if (was && !OWN.call(o, key)) o[key] = was.old;
    return { made, names: [...new Set(Q.stmts.flatMap((st: any) => st.names || []))] };
  }
  // ---------- \matrix ----------
  // \matrix [opts] (name) at (x,y) {cells}: what TikZ draws for each cell (\node … ;, \draw … ;, or with `matrix of
  // nodes` a node per cell), where pgf's matrix puts it (pgfmodulematrix.code.tex, measured with pdflatex):
  // - in a column the cells' origins are on one vertical line, in a row on one horizontal line;
  // - a column reaches as far left and right of its line as its widest cell does on that side; a row as far up and
  //   down, and never less than its line (both start at 0pt);
  // - column sep / row sep (and &[len], \\[len]) go between those borders, or with `between origins` between lines;
  // - a cell's box is the node's border without its outer sep;
  // - the matrix is a node round the cells (inner sep, outer sep, anchor center at `at`); cells inherit its node
  //   options (inner sep, minimum size, outer sep, shape, font …) but not how it is drawn (draw, fill …);
  // - matrix of (math) nodes: each cell is \node[anchor=base, cells, column/row styles, nodes] (name-r-c) {text}.
  const MATRIX_OWN = new Set(['matrix', 'matrix of nodes', 'matrix of math nodes', 'column sep', 'row sep', 'nodes', 'cells', 'nodes in empty cells', 'ampersand replacement', 'name', 'anchor', 'at']);
  const MATRIX_CELL_STYLE = /^(row \d+|column \d+|row \d+ column \d+|every (?:odd|even) (?:row|column))\/\.(append )?style$/;
  const MATRIX_INHERIT = /^(inner sep|inner xsep|inner ysep|outer sep|outer xsep|outer ysep|minimum size|minimum width|minimum height|font|node font|text|text width|text opacity|align|text centered|shape|rectangle|circle|ellipse)$/;
  const MATRIX_SHAPE = /^(shape|circle|ellipse)$/;
  // the rows of a matrix body: cells as written, and the gaps &[len] and \\[len] add
  function matrixRows(body: string, amp: string) {
    const rows: string[][] = [], rowGap: string[] = [], colGap: string[][] = [];
    let row: string[] = [], gaps: string[] = [], cell = '', d = 0, i = 0;
    const arg = () => { let q = i; while (/\s/.test(body[q] || '')) q++; if (body[q] !== '[') return ''; const e = shut(body, q, '[', ']'); i = e + 1; return body.slice(q + 1, e); };
    while (i < body.length) {
      const c = body[i];
      if (d === 0 && (body.startsWith('\\\\', i) || /^\\pgfmatrixendrow(?![A-Za-z@])/.test(body.slice(i, i + 17)))) {
        i += body[i + 1] === '\\' ? 2 : 16;
        row.push(cell); cell = '';
        rows.push(row); colGap.push(gaps); rowGap.push(arg()); row = []; gaps = [];
        continue;
      }
      const ampHit = amp === '&' ? c === '&' : body.startsWith(amp, i) && !(/[A-Za-z@]$/.test(amp) && /[A-Za-z@]/.test(body[i + amp.length] || ''));
      if (d === 0 && ampHit) {
        i += amp.length; row.push(cell); cell = ''; gaps.push(arg()); continue;
      }
      if (d === 0 && /^\\pgfmatrixnextcell(?![A-Za-z@])/.test(body.slice(i, i + 19))) { i += 18; row.push(cell); cell = ''; gaps.push(arg()); continue; }
      if (c === '\\') { cell += body.slice(i, i + 2); i += 2; continue; }
      if (c === '{') d++; else if (c === '}') d--;
      cell += c; i++;
    }
    if (cell.trim() || row.length) { row.push(cell); rows.push(row); colGap.push(gaps); rowGap.push(''); }
    return { rows, rowGap, colGap };
  }
  // a separation: its length (px) and whether it is between origins
  function matrixSep(v: any) {
    let n = 0, fixed = false, ok = true;
    for (const p of splitTop(String(v ?? '').replace(/\\pgflinewidth\b/g, '0.4pt'), ',').map((q) => q.trim()).filter(Boolean)) {
      if (p === 'between origins') fixed = true;
      else if (p === 'between borders') fixed = false;
      else { const d = len(p, 'pt') as number; if (Number.isFinite(d)) n += d; else ok = false; }
    }
    return { n, fixed, ok };
  }
  // the statement after \matrix: its shapes (the matrix's own node when it is drawn or named, then the cells'), the
  // names it makes, and what it does not hold (none: native)
  function matrixStatement(C: any, stmt: string) {
    const issues: string[] = [], made: any[] = [], names: string[] = [];
    let i = 0, name = '', atRaw: string | null = null, body: string | null = null;
    const optList: string[] = [];
    while (i < stmt.length) {
      while (/\s/.test(stmt[i] || '')) i++;
      if (i >= stmt.length) break;
      const rest = stmt.slice(i);
      if (stmt[i] === '[') { const e = shut(stmt, i, '[', ']'); optList.push(stmt.slice(i + 1, e)); i = e + 1; }
      else if (stmt[i] === '(') { const e = shut(stmt, i, '(', ')'); name = stmt.slice(i + 1, e).trim(); i = e + 1; }
      else if (/^at\s*\(/.test(rest)) { const q = stmt.indexOf('(', i), e = shut(stmt, q, '(', ')'); atRaw = stmt.slice(q + 1, e); i = e + 1; }
      else if (stmt[i] === '{' && body == null) { const e = shut(stmt, i, '{', '}'); body = stmt.slice(i + 1, e); i = e + 1; }
      else return { made, names, issues: ['\\matrix not understood'] };
    }
    if (body == null) return { made, names, issues: ['\\matrix without cells'] };
    const every = C.styles?.has('every matrix') ? 'every matrix,' : '';
    const opts = parseOpts(every + optList.join(','));
    const last = (k: string) => lastOpt(opts, k);
    const ofNodes = opts.some((o: any) => o.k === 'matrix of nodes' || o.k === 'matrix of math nodes'), math = opts.some((o: any) => o.k === 'matrix of math nodes');
    if (last('name')?.v) name = String(last('name').v).trim();
    if (last('at')?.v) atRaw = String(last('at').v).trim().replace(/^\(([\s\S]*)\)$/, '$1');
    const colSep = matrixSep(last('column sep')?.v), rowSep = matrixSep(last('row sep')?.v);
    if (!colSep.ok || !rowSep.ok) issues.push('matrix separation not understood');
    const ampO = last('ampersand replacement'), amp = ampO?.v ? String(ampO.v).trim() : '&';
    const emptyNodes = opts.some((o: any) => o.k === 'nodes in empty cells' && o.v !== 'false');
    const xf = readXf(C, opts.filter((o: any) => XF_KEYS.has(o.k)));
    if (xf.xf.some((t: any) => t.dx === undefined)) issues.push('matrix rotated or scaled');
    const cellStyle: Record<string, string> = {};
    const inherit: any[] = [], frame: any[] = [];
    // placed like a node (below=1cm of a, right of=b …): with the positioning library's rules, by the node code
    const placeKey = (o: any) => !!PLACE_ANCHOR[o.k] || OLD_OF.includes(o.k) || o.k === 'on grid' || o.k === 'node distance';
    const placed = opts.some((o: any) => placeKey(o) && o.k !== 'on grid' && o.k !== 'node distance');
    for (const o of opts) {
      if (XF_KEYS.has(o.k) || MATRIX_OWN.has(o.k) || placeKey(o)) continue;
      if (MATRIX_CELL_STYLE.test(o.k)) { const k = o.k.replace(/\/\.(append )?style$/, ''); cellStyle[k] = (/append/.test(o.k) && cellStyle[k] ? cellStyle[k] + ',' : '') + (o.v ?? ''); continue; }
      if (MATRIX_INHERIT.test(o.k) || (o.v === null && NODE_SHAPES[o.k])) { inherit.push(o); if (!/^(font|node font|text|text opacity|align|text centered|text width)$/.test(o.k)) frame.push(o); continue; }
      if (/^(execute at|every cell|every outer matrix|left delimiter|right delimiter|above delimiter|below delimiter|matrix anchor|append after command|label|pin)/.test(o.k)) { issues.push(`matrix option ${o.k}`); continue; }
      frame.push(o);
    }
    if (Object.keys(cellStyle).length && !ofNodes) issues.push('row and column styles in a matrix of code cells');
    const o2s = (L: any[]) => L.map((o: any) => o.v == null ? o.k : `${o.k}={${o.v}}`).join(', ');
    const nodesOpt = opts.filter((o: any) => o.k === 'nodes' && o.v).map((o: any) => o.v).join(', ');
    const cellsOpt = opts.filter((o: any) => o.k === 'cells' && o.v).map((o: any) => o.v).join(', ');
    const { rows, rowGap, colGap } = matrixRows(body, amp);
    if (!rows.length) return { made, names, issues: [...issues, '\\matrix without cells'] };
    const transformShape = (C.scopes || []).some((L: any) => L.shape && L.xf?.length);
    if (transformShape) issues.push('matrix in a scope with transform shape');
    // each cell as TikZ code (null: no node) with its origin at (0,0)
    const mname = name || '';
    const code = rows.map((row, r) => row.map((cell, c) => {
      const t = cell.trim();
      if (!ofNodes || /^\\(node|draw|path|fill|filldraw|coordinate|shade|shadedraw|pic|foreach)\b/.test(t)) return t || null;
      let own = '', text = t;
      if (text[0] === '|') { const e = text.indexOf('|', 1); if (e < 0) { issues.push('matrix cell options not understood'); return null; } own = text.slice(1, e); text = text.slice(e + 1).trim(); }
      if (!text && !own && !emptyNodes) return null;
      const R = r + 1, K2 = c + 1, sty = [cellStyle[`column ${K2}`], cellStyle[`every ${K2 % 2 ? 'odd' : 'even'} column`], cellStyle[`row ${R}`], cellStyle[`every ${R % 2 ? 'odd' : 'even'} row`], cellStyle[`row ${R} column ${K2}`]].filter(Boolean);
      // a cell style's own keys come before the matrix's nodes={…}; its nodes={…} is appended to that, so after it
      const part = (v: string, inner: boolean) => parseOpts(v, 0, true).filter((o: any) => (o.k === 'nodes') === inner).map((o: any) => inner ? o.v : o.v == null ? o.k : `${o.k}={${o.v}}`).filter(Boolean).join(', ');
      const styles = [cellsOpt, ...sty];
      const pre = [o2s(inherit), 'anchor=base', ...styles.map((v) => part(v, false)), nodesOpt, ...styles.map((v) => part(v, true))].filter(Boolean).join(', ');
      if (math && text) text = `$${text}$`;
      return `\\node[${pre ? pre + ', ' : ''}name=${mname}-${R}-${K2}]${own} {${text}};`;
    }));
    // a cell's statements, parsed with its origin at `o` (px, y down); its shapes, the boxes of its nodes and what
    // it does not hold. Transforms around the matrix move only the matrix: they are taken off here.
    const plain = (C.scopes || []).map((L: any) => ({ ...L, xf: [] }));
    // how the matrix's paths look (thick, dashed, a colour, rounded corners) holds for the cells' paths too
    const base = [...(C.base || []), ...frame.filter((o: any) => baseOpt(C, o) || o.k === 'rounded corners')];
    const sub = (src: string, o: any) => {
      const every = !ofNodes && inherit.length ? `${C.styles.get('every node') ? C.styles.get('every node') + ', ' : ''}${o2s(inherit)}${nodesOpt ? ', ' + nodesOpt : ''}` : (!ofNodes && nodesOpt ? `${C.styles.get('every node') ? C.styles.get('every node') + ', ' : ''}${nodesOpt}` : null);
      const Q: any = { ...C, preview: false, stmts: [], struct: null, warnings: [], names: { ...C.names }, kinds: { ...(C.kinds || {}) }, boxes: { ...(C.boxes || {}) }, geo: { ...(C.geo || {}) }, styles: new Map(C.styles), macros: new Map(C.macros), cellBoxes: [], chainPending: null, base,
        scopes: [...plain, { xf: o.x || o.y ? [{ dx: o.x, dy: o.y }] : [], shape: false, opts: '', fonts: plain.length ? plain[plain.length - 1].fonts : '' }] };
      if (every != null) Q.styles.set('every node', every);
      let shapes: any[] = [];
      try { shapes = parseStatements(Q, src); } catch (e: any) { Q.warnings.push('matrix cell: ' + e.message); } finally { STY = C.styles; MAC = C.macros; }
      const why = [...Q.warnings, ...Q.stmts.filter((st: any) => st.raw).flatMap((st: any) => st.shapes.flatMap((x: any) => x.issues || []))];
      return { Q, shapes, why };
    };
    // 1. each cell's extent about its origin (px, y down)
    const ext = code.map((row) => row.map((src) => {
      if (!src) return { x0: 0, x1: 0, y0: 0, y1: 0 };
      const { Q, shapes } = sub(src, { x: 0, y: 0 });
      const boxed = new Set(Q.cellBoxes.map((b: any) => b.s));
      const parts = [...Q.cellBoxes.map((b: any) => ({ x0: b.c.x - b.hw, x1: b.c.x + b.hw, y0: b.c.y - b.hh, y1: b.c.y + b.hh })),
        ...shapes.filter((x: any) => !boxed.has(x) && x.type !== 'coord').map((x: any) => { const b = TD.bbox(x); return { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h }; })];
      if (!parts.length) return { x0: 0, x1: 0, y0: 0, y1: 0 };
      return { x0: least(parts.map((p) => p.x0)), x1: -least(parts.map((p) => -p.x1)), y0: least(parts.map((p) => p.y0)), y1: -least(parts.map((p) => -p.y1)) };
    }));
    // 2. the columns' and rows' lines: px from the first one (x right, y down)
    const nc = Math.max(...rows.map((r) => r.length)), nr = rows.length;
    const L: number[] = [], Rt: number[] = [], U: number[] = [], D: number[] = [];
    for (let c = 0; c < nc; c++) {
      const col = ext.map((row) => row[c]).filter(Boolean);
      L[c] = -least(col.map((e) => e.x0)); Rt[c] = -least(col.map((e) => -e.x1));
    }
    for (let r = 0; r < nr; r++) { U[r] = Math.max(0, ...ext[r].map((e) => -e.y0)); D[r] = Math.max(0, ...ext[r].map((e) => e.y1)); }
    const X = [0], Y = [0];
    for (let c = 1; c < nc; c++) {
      const g = colGap.find((gs) => gs.length >= c)?.[c - 1] || '', extra = matrixSep(g);
      if (!extra.ok) issues.push('matrix separation not understood');
      const fixed = colSep.fixed || extra.fixed, sep = colSep.n + extra.n;
      X[c] = X[c - 1] + (fixed ? sep : Rt[c - 1] + sep + L[c]);
    }
    for (let r = 1; r < nr; r++) {
      const extra = matrixSep(rowGap[r - 1]);
      if (!extra.ok) issues.push('matrix separation not understood');
      const fixed = rowSep.fixed || extra.fixed, sep = rowSep.n + extra.n;
      Y[r] = Y[r - 1] + (fixed ? sep : D[r - 1] + sep + U[r]);
    }
    // 3. the matrix node round them: its box, and where its anchor puts it
    const box = { x0: -L[0], x1: X[nc - 1] + Rt[nc - 1], y0: -U[0], y1: Y[nr - 1] + D[nr - 1] };
    const { sx, sy } = innerSeps(frame);
    const fst = style(C, frame, 'node'), os = outerSep(frame, fst.width);
    const hw = (box.x1 - box.x0) / 2 + sx, hh = (box.y1 - box.y0) / 2 + sy;
    const shapeO = [...frame].reverse().find((o: any) => MATRIX_SHAPE.test(o.k));
    const anchorV = String(last('anchor')?.v ?? 'center').trim();
    const off = anchorOf({ kind: 'rect', c: { x: 0, y: 0 }, U: { x: hw + os, y: 0 }, V: { x: 0, y: hh + os } }, anchorV);
    if (!off) issues.push('matrix anchor=' + anchorV);
    if (shapeO && (anchorV !== 'center' || frame.some((o: any) => (o.k === 'draw' || o.k === 'fill') && o.v !== 'none'))) issues.push('matrix shape ' + (shapeO.v ?? shapeO.k));
    let at = atRaw != null ? coord(C, atRaw) : { x: 0, y: 0 };
    if (!at) { issues.push(`Unresolved matrix position (${atRaw})`); at = { x: 0, y: 0 }; }
    const P = applyXf([{ type: 'dot', cx: at.x, cy: at.y, r: 0 }], [...(C.scopes || []), { xf: xf.xf, shape: false }]).map((d: any) => ({ x: d.cx, y: d.cy }))[0];
    const keep = frame.filter((o: any) => !/^(inner sep|inner xsep|inner ysep|minimum size|minimum width|minimum height)$/.test(o.k));
    const pt = (v: number) => `${+(v * K).toFixed(4)}pt`;
    const frameSrc = (nm: string, where: any, more: any[] = []) => `\\node[${[o2s(keep), shapeO ? '' : 'rectangle', 'inner sep=0pt', `minimum width=${pt(2 * hw)}`, `minimum height=${pt(2 * hh)}`, o2s(more)].filter(Boolean).join(', ')}]${nm ? ` (${nm})` : ''} at (${pt(where.x)}, ${pt(-where.y)}) {};`;
    let centre = { x: P.x - (off ? off.x : 0), y: P.y - (off ? off.y : 0) };
    if (placed) {
      // the matrix's box placed as a node of its size is placed (its anchor and placement keys in their order)
      const run = sub(frameSrc('matrix-placed', P, opts.filter((o: any) => o.k === 'anchor' || placeKey(o))), { x: 0, y: 0 });
      const g = run.Q.geo?.['matrix-placed'];
      if (g) centre = { ...g.c }; else issues.push('matrix placement not understood');
      issues.push(...run.why.map((w: string) => 'matrix placement: ' + w));
      if (run.Q.libs !== C.libs) C.libs = run.Q.libs;
    }
    const origin = { x: centre.x - (box.x0 + box.x1) / 2, y: centre.y - (box.y0 + box.y1) / 2 };
    // what a cell or the border made: its names (and the boxes, borders and libraries that come with them)
    const adopt = (Q: any) => {
      for (const nm of Object.keys(Q.names)) if (Q.names[nm] !== C.names[nm]) {
        C.names[nm] = Q.names[nm];
        if (!names.includes(nm)) names.push(nm);
      }
      C.kinds = Object.assign(C.kinds || {}, Q.kinds); C.boxes = Object.assign(C.boxes || {}, Q.boxes); C.geo = Object.assign(C.geo || {}, Q.geo);
      if (Q.libs !== C.libs) C.libs = Q.libs;
    };
    // 4. the matrix's own node under the cells: drawn when the matrix is, and named, so that (m.north west) and
    // the like still mean the matrix once its cells are written one by one
    const drawn = frame.some((o: any) => (o.k === 'draw' || o.k === 'fill' || o.k === 'filldraw') && o.v !== 'none');
    if (drawn || name) {
      const { Q, shapes, why } = sub(frameSrc(name, centre), { x: 0, y: 0 });
      issues.push(...why.map((w: string) => 'matrix border: ' + w));
      pushAll(made, shapes);
      adopt(Q);
    }
    // 5. the cells where they go
    for (let r = 0; r < nr; r++) for (let c = 0; c < rows[r].length; c++) {
      const src = code[r][c];
      if (!src) continue;
      const o = { x: origin.x + X[c], y: origin.y + Y[r] }, { Q, shapes, why } = sub(src, o);
      issues.push(...why.map((w: string) => `cell ${r + 1}-${c + 1}: ${w}`));
      pushAll(made, shapes);
      adopt(Q);
    }
    return { made, names, issues: [...new Set(issues)] };
  }
  // \begin{env} … \end{env} with nesting: index just after the matching \end
  function envEnd(s: any, env: any, from: any) {
    const re = new RegExp(`\\\\(begin|end)\\{${env.replace(/[*]/g, '\\*')}\\}`, 'g');
    re.lastIndex = from; let d = 1, m;
    while ((m = re.exec(s))) { d += m[1] === 'begin' ? 1 : -1; if (!d) return m.index + m[0].length; }
    return s.length;
  }
  // the size pgfplots gives an axis, for the frame of one kept as code
  function axisBox(C: any, optStr: any) {
    const o = parseOpts(optStr), g = (k: any) => (o.find((x: any) => x.k === k) || {}).v;
    const w = g('width') ? len(g('width'), 'pt') : 240 / K, h = g('height') ? len(g('height'), 'pt') : 207 / K;
    const at = g('at') ? coord(C, g('at').replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')) : null;
    return { at: at || { x: 0, y: 0 }, w: isFinite(w!) ? w : 240 / K, h: isFinite(h!) ? h : 207 / K };
  }

  // an axis read as a plot ({ shape, issues }), or null
  function pgfAxis(C: any, s: any, e: any, stop: any, env: any) {
    if (!TD.pgfplotsImport) return null;
    let q = e + 1; while (/\s/.test(s[q])) q++;
    const ob = s[q] === '[' ? matchClose(s, q, '[', ']') : -1;
    const opt = ob > 0 ? s.slice(q + 1, ob) : '', body = s.slice(ob > 0 ? ob + 1 : e + 1, stop - env.length - 6);
    try {
      return TD.pgfplotsImport.fromAxis(env, opt, body, { color: (v: any) => color(C, v), len: (v: any, u: any) => len(v, u), expand: expandMac, coord: (v: any) => coord(C, v), styles: C.styles });
    } catch (err: any) { return null; }
  }

  // blocks inside a node: the environment, the block type, and where the node puts the block
  const dedentLines = (src: any) => {
    const ind = least(src.split('\n').slice(1).filter((l: any) => l.trim()).map((l: any) => (/^[ \t]*/.exec(l))![0].length));
    return ind > 0 && isFinite(ind) ? src.split('\n').map((l: any, i: any) => (i ? l.slice(Math.min(ind, (/^[ \t]*/.exec(l))![0].length)) : l)).join('\n') : src;
  };
  // raw/plain: the statement as written and with its comments blanked (same length, same positions), so the block
  // keeps the comments written in its code
  function nodeBlock(C: any, node: any, at: any, raw = '', plain = '') {
    const text = node.text.replace(/^\s*\\pgfinterruptpicture%?\s*|\s*%?\s*\\endpgfinterruptpicture\s*$/g, '').replace(/^\$\s*([\s\S]*?)\s*\$$/, '$1').trim();
    for (const B of TD.blocks.nodeImports()) {
      if (!TD.TYPES[B.type]) continue;
      const m = B.re.exec(text);
      if (!m) continue;
      const q = TD.TYPES[B.type].create(at, {});
      const nodeStyle = style(C, parseOpts(node.opts), 'node');
      Object.assign(q, fontStyle(nodeStyle.font));
      if (nodeStyle.color) q.color = nodeStyle.color;
      const i = raw.length === plain.length ? plain.indexOf(m[0]) : -1;
      const code = i >= 0 ? raw.slice(i, i + m[0].length) : m[0];
      q.src = B.dedent ? dedentLines(code) : code;
      // place() may answer false: the code as written can't stay in a node (a table float), so it is written from the shape
      if ((B as any).place) { if ((B as any).place(q, at) === false) q._fromShape = true; } else { const b = B.bb!(q); q.x = at.x - b.w / 2; q.y = at.y - b.h / 2; }
      const extra = text.replace(m[0], '').replace(/\\color\{[^}]*\}/g, '').trim();
      const bad = unknownKeys(C, parseOpts(node.opts), new Set(['inner sep', 'anchor', 'text', 'color', 'font', 'transform shape', ...XF_KEYS]));
      return { shape: q, issues: [...(extra ? [`text beside the ${B.type} block`] : []), ...(bad.length ? [`node options the block does not hold: ${bad.join(', ')}`] : [])] };
    }
    return null;
  }

  // Run fn with C's name tables (names, geo, kinds, boxes) recording each write: [table, key, had, old], oldest
  // first. Copying whole tables per statement to see or undo what it wrote was O(statements × names).
  // A table fn swaps for another object is left as fn set it.
  const OWN = Object.prototype.hasOwnProperty;
  function recordTables(C: any, keys: string[], fn: () => any) {
    const log: any[] = [], swapped: [string, any, any][] = [];
    for (const k of keys) {
      const t = C[k] || (C[k] = {});
      const p = new Proxy(t, {
        set(o: any, key: any, v: any) { log.push([o, key, OWN.call(o, key), o[key]]); o[key] = v; return true; },
        deleteProperty(o: any, key: any) { if (OWN.call(o, key)) { log.push([o, key, true, o[key]]); delete o[key]; } return true; },
      });
      C[k] = p; swapped.push([k, t, p]);
    }
    try { return { result: fn(), log }; } finally { for (const [k, t, p] of swapped) if (C[k] === p) C[k] = t; }
  }
  function undoLog(log: any[]) {
    for (let i = log.length - 1; i >= 0; i--) { const [o, key, had, old] = log[i]; if (had) o[key] = old; else delete o[key]; }
  }

  // a statement that named styles: what the styles set (each field as styled and as without them), so the
  // export can name the styles again while those fields still hold (src/domain/shapes.ts styledCode)
  function keepStyles(made: any, used: any, build: any, C?: any) {
    if (!used.size || !made.length) return;
    let base = null;
    // (the build without styles only shows what they changed: the names it would set are not the picture's)
    const tables = C ? { names: C.names, geo: C.geo || (C.geo = {}), kinds: C.kinds || (C.kinds = {}), boxes: C.boxes || (C.boxes = {}) } : null;
    styOff = true;
    let log: any[] = [];
    try { if (C) { const run = recordTables(C, ['names', 'geo', 'kinds', 'boxes'], () => { try { return build(); } catch (e: any) { return null; } }); base = run.result; log = run.log; } else base = build(); }
    catch (e: any) { base = null; }
    finally { styOff = false; if (tables) { undoLog(log); Object.assign(C, tables); } }
    if (!base || base.length !== made.length) return;
    const J = (v: any) => JSON.stringify(v ?? null);
    made.forEach((m: any, n: any) => {
      const b = base[n];
      if (!b || b.type !== m.type) return;
      const f: Record<string, any> = {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) if (J(m[k]) !== J(b[k])) f[k] = [m[k] ?? null, b[k] ?? null];
      m.tkStyle = { n: [...used], f, d: Object.fromEntries<any>([...used].map((nm: any) => [nm, parseOpts(nm).map((o: any) => o.v == null ? o.k : `${o.k}={${o.v}}`).join(',')])) };
    });
  }

  // Statements of a picture. `s` is the code with comments blanked (same length as `o`, the code as written).
  // Every statement becomes shapes (C.preview, or when it is exact) or one TikZ code object; C.stmts gets
  // where each one was, for the source write-back (s.tex).
  const PATHS: Record<string, any> = { pic: 'path', draw: 'draw', fill: 'fill', filldraw: 'filldraw', path: 'path', shade: 'shade', shadedraw: 'shade', clip: null, useasboundingbox: null };
  const SEMI = new Set(['pic', 'matrix', 'graph', 'datavisualization', 'calendar', 'spy', 'pattern', 'shadedraw']);
  const DEFS = new Set(['tikzset', 'tikzstyle', 'def', 'gdef', 'edef', 'xdef', 'let', 'newcommand', 'renewcommand', 'providecommand', 'definecolor', 'colorlet', 'pgfmathsetmacro', 'pgfmathtruncatemacro',
    'pgfmathparse', 'pgfplotsset', 'pgfdeclarelayer', 'pgfsetlayers', 'usetikzlibrary', 'tikzmath', 'pgfkeys', 'newlength', 'setlength', 'pgfmathsetlengthmacro', 'tikzcdset', 'ctikzset', 'pgfdeclarepatternformonly', 'pgfdeclarepattern', 'pgfdeclarehorizontalshading', 'pgfdeclareverticalshading', 'pgfdeclareradialshading', 'pgfdeclarefunctionalshading', 'pgfdeclareplotmark', 'pgfdeclarearrow',
    'centering', 'small', 'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'bfseries', 'itshape', 'sffamily', 'ttfamily', 'rmfamily', 'color', 'selectfont', 'fontsize']);
  // nesting (environments, loops in loops) past 64 levels is not read: hostile input would overflow the stack.
  // FOREACH_PASSES bounds the passes of nested loops (400 × 400 × 400 … would never finish).
  let PS_DEPTH = 0, FOREACH_PASSES = 0;
  function parseStatements(C: any, s: any, o?: any) : any {
    if (PS_DEPTH >= 64) { C.warnings.push('Nested too deep: the inner code is not read'); return []; }
    if (PS_DEPTH === 0) { FOREACH_PASSES = 0; PIC_PASSES = 0; }
    PS_DEPTH++;
    try { return parseStatementsIn(C, s, o); } finally { PS_DEPTH--; }
  }
  function parseStatementsIn(C: any, s: any, o?: any) : any {
    o = o == null ? s : o;
    if (C.styles) STY = C.styles;
    if (!C.macros) C.macros = new Map();
    MAC = C.macros;
    const shapes: any[] = [];
    const preview = !!C.preview;
    let i = 0;
    // pgf-umlcd classes somewhere in this code: a shifted scope may hold a class diagram
    const umlIn = !!TD.uml && /\\begin\s*\{(?:class|interface|abstractclass|staticclass|object)\}/.test(s);
    // tikz-chemlab apparatus too: a shifted scope may be a Chemistry Laboratory block (how a picture with other objects exports it)
    const labIn = !!TD.chemlab && TD.chemlab.USES.test(s);
    const scopeCtx = () => (C.scopes || []).map((L: any) => L.opts).filter(Boolean);
    const scopeIssue = () => (C.scopes || []).map((L: any) => L.issue).filter(Boolean).reverse();
    // one statement: shapes when exact, else one code object previewing them
    const done = (start: any, end: any, made: any, issues: any, extra: Record<string, any> = {}) => {
      if (C.chainPending) {
        const P = C.chainPending; C.chainPending = null;
        for (const t of ['names', 'geo', 'boxes', 'kinds']) if (C[t]?.[P.name] && P.alias !== P.name) C[t][P.alias] = C[t][P.name];
        const lines: any[] = [];
        for (const j of P.joins) {
          const opt = [C.styles?.has('every join') ? 'every join' : '', j.by].filter(Boolean).join(', '), body = `(${j.from}) -- (${P.name})`;
          const su = styUsed; styUsed = null;
          try { lines.push(...applyXf(pathToShapes(C, 'draw', opt, body), C.scopes || [])); if (!preview) issues = [...issues, ...pathIssues(C, opt, body)]; }
          catch (err: any) { issues = [...issues, 'join: ' + err.message]; }
          finally { styUsed = su; }
        }
        made = [...made, ...lines];
        if (!preview) for (const x of made) if (x.nodeName === P.name || (x.type === 'text' && extra.names?.includes(P.name))) x.chain = { name: P.chain };
      }
      const feat = (C.picFeat || []).filter((f: any) => f.re.test(s.slice(start, end))).map((f: any) => f.k);
      issues = [...issues, ...scopeIssue(), ...(C.picIssue ? [C.picIssue] : []), ...(feat.length ? ['picture options the shapes do not hold: ' + feat.join(', ')] : [])];
      const unresolved = issues.some((w: string) => /Unresolved|Unsupported coordinate|layout not evaluated/.test(w));
      if (extra.why?.length) issues = [...issues, ...extra.why.map((w: string) => 'in the loop: ' + w)];
      if (unresolved) {
        for (const nm of extra.names || []) (C.unresolved ||= new Set()).add(nm);
        made = []; // Never present invented positions as a usable approximation.
      }
      if (preview) { pushAll(shapes, made); return; }
      const exact = !extra.raw && !issues.length && made.length > 0;
      let list = made;
      if (!exact) {
        const r: Record<string, any> = { type: 'tikz', kind: extra.kind || 'code', code: '', x: 0, y: 0, ctx: [], prev: made.filter((p: any) => p.type !== 'tikz'), issues: [...new Set(issues)], ...(unresolved ? { unresolved: true } : {}) };
        if (extra.at) r.at = extra.at;
        if (extra.size) r.size = extra.size;
        if (C.libs && C.libs.length) r.libs = C.libs.slice();
        if (C.pkgs && C.pkgs.length) r.pkgs = C.pkgs.slice();
        list = [r];
      }
      if (exact && extra.group && list.length > 1) { const g = uid8(); for (const x of list) { x.g = g; x.gname = extra.group; } }
      C.stmts.push({ start, end, shapes: list, raw: !exact, ctx: scopeCtx(), names: extra.names });
      pushAll(shapes, list);
    };
    let last = -1;
    while (i < s.length) {
      // always move on: unbalanced input must not send the reader back (it would loop for ever)
      if (i <= last) i = last + 1;
      last = i;
      const bs = s.indexOf('\\', i);
      if (bs < 0) break;
      const m = s.slice(bs).match(/^\\([a-zA-Z@]+)\*?/);
      if (!m) { i = bs + 2; continue; }
      const name = m[1];
      let j = bs + m[0].length;
      const w0 = C.warnings.length;
      const issues = () => C.warnings.slice(w0);
      if (name === 'tddata') { const e = matchClose(s, j, '{', '}'); i = e < 0 ? s.length : e + 1; continue; }
      if (name === 'begin' || name === 'end') {
        const e = s.indexOf('}', j);
        const env = s.slice(j + 1, e).trim();
        if (name === 'begin' && env === 'scope' && umlIn && /^\\begin\{scope\}\s*\[\s*shift\s*=/.test(s.slice(bs, bs + 40))) {
          // a pgf-umlcd class diagram in its shifted scope (how a picture with other objects exports it)
          let d = 0, stop = -1;
          for (const m of s.slice(bs).matchAll(/\\(begin|end)\{scope\}/g)) if ((d += m[1] === 'begin' ? 1 : -1) === 0) { stop = bs + m.index! + m[0].length; break; }
          const uml = stop > 0 && /\\begin\s*\{(?:class|interface|abstractclass|staticclass|object)\}/.test(s.slice(bs, stop))
            ? TD.uml.fromPicture(`\\begin{tikzpicture}\n${o.slice(bs, stop)}\n\\end{tikzpicture}`) : null;
          if (uml) { done(bs, stop, applyXf([uml], C.scopes || []), issues()); i = stop; continue; }
        }
        if (name === 'begin' && env === 'scope' && labIn && /^\\begin\{scope\}\s*\[\s*shift\s*=/.test(s.slice(bs, bs + 40))) {
          let d = 0, stop = -1;
          for (const m of s.slice(bs).matchAll(/\\(begin|end)\{scope\}/g)) if ((d += m[1] === 'begin' ? 1 : -1) === 0) { stop = bs + m.index! + m[0].length; break; }
          const lab = stop > 0 && TD.chemlab.USES.test(s.slice(bs, stop)) ? TD.chemlab.fromPicture(`\\begin{tikzpicture}\n${o.slice(bs, stop)}\n\\end{tikzpicture}`) : null;
          if (lab) { done(bs, stop, applyXf([lab], C.scopes || []), issues()); i = stop; continue; }
        }
        if (name === 'begin' && env === 'scope') {
          i = e + 1; while (/\s/.test(s[i])) i++;
          let L: Record<string, any> = { xf: [], shape: false, opts: '' };
          if (s[i] === '[') {
            const e2 = matchClose(s, i, '[', ']');
            const str = s.slice(i + 1, e2);
            const { xf, rest, unresolved } = readXf(C, parseOpts(str));
            const shape = rest.some((x) => x.k === 'transform shape' && x.v !== 'false');
            // `transparency group, opacity=x` is how a translucent shape exports: the opacity belongs to the shapes inside
            const op = rest.find((x) => x.k === 'opacity'), opv = op ? parseFloat(op.v) : NaN;
            // what the scope sets for what is inside it: styles, unit vectors, node distance and how paths look
            // (restored at \end{scope})
            const saved = { vx: C.vx, vy: C.vy, vz: C.vz, base: C.base, nodeDist: C.nodeDist, nodeDistH: C.nodeDistH, styles: new Map(C.styles) };
            const read = (x: any) => {
              const sm = /^(.+?)\/\.(style|append style)$/.exec(x.k);
              if (sm && x.v != null) { const nm = sm[1].trim(), old = C.styles.get(nm); addStyle(C, nm, sm[2] === 'append style' && old ? `${old},${x.v}` : x.v); return C.styles.has(nm); }
              if ((x.k === 'x' || x.k === 'y' || x.k === 'z') && x.v) { const u = unitVector(C, x.k, x.v); if (u) { C['v' + x.k] = u; return true; } return false; }
              if (x.k === 'node distance') {
                const [a, b] = String(x.v).split(/\s+and\s+/).map((q: any) => len(q));
                if (isFinite(a!) && (b == null || isFinite(b))) { C.nodeDist = a; C.nodeDistH = b ?? undefined; return true; }
                return false;
              }
              if (baseOpt(C, x)) { C.base = [...(C.base || []), x]; return true; }
              if (x.k === 'start chain') return startChain(C, x.v, true);
              // nodes={…} and keys only nodes read: what every node in the scope takes
              if ((x.k === 'nodes' && x.v) || (NODE_ONLY.test(x.k) && x.v != null)) {
                const add = x.k === 'nodes' ? x.v : `${x.k}=${x.v}`, old = C.styles.get('every node');
                addStyle(C, 'every node', old ? `${old},${add}` : add);
                return C.styles.has('every node');
              }
              return false;
            };
            const rawRest = parseOpts(str, 0, true).filter((x: any) => !XF_KEYS.has(x.k));
            const handled = new Set(rawRest.filter(read).map((x: any) => x.k));
            const other = rest.filter((x) => x.k !== 'transform shape' && x.k !== 'transparency group' && x.k !== 'opacity' && x.k !== 'font' && !handled.has(x.k) && !(x.v === null && W_KEYS.includes(x.k)) && !(x.v === null && color(C, x.k) !== undefined));
            L = { saved, xf, shape, font: rest.filter((x: any) => x.k === 'font').map((x: any) => x.v).join(' '), ...(opv >= 0 && opv < 1 ? { opacity: opv } : {}), opts: str.replace(/\s+/g, ' ').trim() };
            const scopeIssues = [...unresolved, ...(other.length ? ['scope options not drawn: ' + other.map((x) => x.k).join(', ')] : [])];
            if (scopeIssues.length) L.issue = scopeIssues.join('; ');
            i = e2 + 1;
          } else i = e + 1;
          L.styles = new Map(C.styles); L.macros = new Map(C.macros);
          openScope(C, L);
          if (C.struct) C.struct.push(i);
          continue;
        }
        if (name === 'end' && env === 'scope') { if (C.scopes && C.scopes.length) { const scope = C.scopes.pop(); if (scope.saved) { C.vx = scope.saved.vx; C.vy = scope.saved.vy; C.vz = scope.saved.vz; C.base = scope.saved.base; C.nodeDist = scope.saved.nodeDist; C.nodeDistH = scope.saved.nodeDistH; scope.styles = scope.saved.styles; } C.styles = scope.styles || C.styles; STY = C.styles; C.macros = scope.macros || C.macros; MAC = C.macros; } i = e + 1; if (C.struct) C.struct.push(i); continue; }
        if (name === 'end') { i = e + 1; continue; }
        const stop = envEnd(s, env, e + 1);
        if (env === 'feynman' && TD.TYPES.feynman) {
          // a tikz-feynman diagram: one Feynman object, its origin where the picture's is
          const q = TD.TYPES.feynman.create({ x: 0, y: 0 }, {});
          q.src = o.slice(bs, stop).trim();
          const b = TD.feyn.layout(q).bb;
          q.x = b.x; q.y = b.y;
          done(bs, stop, applyXf([q], C.scopes || []), issues());
          i = stop; continue;
        }
        // any other environment (pgfonlayer, axis, …) is kept whole; its drawing statements preview it
        i = stop;
        // a pgfplots axis: the app's own plot, native when it holds the axis as written (src/domain/pgfplots-import.ts)
        const PA = /^(axis|semilogxaxis|semilogyaxis|loglogaxis)$/.test(env) ? pgfAxis(C, s, e, stop, env) : null;
        if (PA && preview) { pushAll(shapes, applyXf([PA.shape], C.scopes || [])); continue; }
        if (PA) { done(bs, stop, applyXf([PA.shape], C.scopes || []), PA.issues.length ? [`\\begin{${env}} is kept as code`, ...PA.issues] : []); continue; }
        if (preview) { if (!/axis$/.test(env)) pushAll(shapes, parseStatements(C, s.slice(e + 1, stop - env.length - 6))); continue; }
        const P = { ...C, preview: true, warnings: [], struct: null };
        const inner = /axis$|^tikzcd$/.test(env) ? [] : parseStatements(P, s.slice(e + 1, stop - env.length - 6));
        let at, size;
        if (/axis$/.test(env)) {
          let q = e + 1; while (/\s/.test(s[q])) q++;
          const ob = s[q] === '[' ? matchClose(s, q, '[', ']') : -1, ab = axisBox(C, ob > 0 ? s.slice(q + 1, ob) : '');
          at = { x: ab.at.x, y: ab.at.y - ab.h! }; size = { w: ab.w, h: ab.h };
        }
        done(bs, stop, applyXf(inner, C.scopes || []), [`\\begin{${env}} is kept as code`], { raw: true, at, size });
        continue;
      }
      if (name === 'foreach') {
        const f = foreachParse(s, j);
        i = f.end;
        // a loop whose every pass is shapes held exactly: those shapes, as one group, written as the loop until
        // one of them is edited (then as the shapes, unrolled)
        const E: any = !preview && f.body != null ? foreachExact(C, f) : null;
        if (E && E.made) { done(bs, f.end, E.made, [], { names: E.names.length ? E.names : undefined, group: 'foreach loop' }); continue; }
        const P = { ...C, preview: true, warnings: [], struct: null, names: { ...C.names } };
        const made = f.body != null ? applyXf(expandForeach(P, f), C.scopes || []) : [];
        if (preview) { pushAll(shapes, made); continue; }
        // (why a pass is not held only explains: the loop's previews stay)
        done(bs, f.end, made, ['\\foreach is kept as code', ...P.warnings], { raw: true, why: [...new Set((E?.why || []).map((w: string) => w.replace(/^(in the loop: )+/, '')).filter((w: string) => !P.warnings.includes(w) && !/^\\foreach is kept as code$/.test(w)))].slice(0, 4) });
        continue;
      }
      if (DEFS.has(name)) {
        let end = argsEnd(s, j);
        const semi = /^[ \t]*;/.exec(s.slice(end)); if (semi) end += semi[0].length;
        i = end;
        // Definitions are local to their scope; the enclosing maps are restored at its end.
        if (/^(g|e|x)?def$|^(re|provide|new)command$|^pgfmathsetmacro$|^pgfmathtruncatemacro$/.test(name)) {
          const d = macroDef(name, s.slice(j, end));
          if (d) C.macros.set(d.nm, name === 'pgfmathtruncatemacro' ? String(Math.trunc(+d.v)) : d.v);
        }
        if ((name === 'tikzset' || name === 'tikzstyle') && C.styles) defineStyles(C, name, s.slice(j, end));
        if (name === 'definecolor' || name === 'colorlet') {
          const args = []; let q = j;
          while (args.length < (name === 'definecolor' ? 3 : 2)) { while (/\s/.test(s[q])) q++; if (s[q] === '[') { q = shut(s, q, '[', ']') + 1; continue; } if (s[q] !== '{') break; const e = shut(s, q, '{', '}'); args.push(s.slice(q + 1, e)); q = e + 1; }
          if (name === 'definecolor' && args.length === 3) {
            const [nm, model, val] = args;
            if (/^html$/i.test(model)) C.colors[nm] = '#' + val.trim().toLowerCase();
            else if (model === 'rgb') C.colors[nm] = '#' + val.split(',').map((v: any) => hex2(parseFloat(v) * 255)).join('');
            else if (model === 'RGB') C.colors[nm] = '#' + val.split(',').map((v: any) => hex2(parseFloat(v))).join('');
            else if (model === 'gray') C.colors[nm] = '#' + hex2(parseFloat(val) * 255).repeat(3);
          } else if (args.length === 2) { const c = color(C, args[1]); if (c) C.colors[args[0]] = c; }
        }
        if (!preview && name !== 'usetikzlibrary') done(bs, end, [], [], { raw: true, kind: 'defs' });
        continue;
      }
      if (name in PATHS || name === 'node' || name === 'coordinate' || SEMI.has(name)) {
        const k = semiEnd(s, j);
        const stmt = s.slice(j, k - 1);
        i = k;
        if (name in PATHS) {
          if (!PATHS[name]) { if (!preview) done(bs, k, [], [], { raw: true }); continue; }
          let body = stmt.trim(), optStr = '';
          if (body[0] === '[') { const e = matchClose(body, 0, '[', ']'); optStr = body.slice(1, e); body = body.slice(e + 1); }
          if (name === 'pic') { body = `pic${optStr ? '['+optStr+']' : ''} ${body}`; optStr = ''; }
          let made = [];
          const su = styUsed = new Set();
          const lossy = preview ? [] : pathIssues(C, optStr, body);
          const build = () => {
            let L = pathToShapes(C, PATHS[name], optStr, body);
            const po = parseOpts(optStr);
            if (po.some((x: any) => x.k === 'even odd rule')) L = evenOdd(L);
            const own = readXf(C, po);
            return applyXf(L, [...(C.scopes || []), { xf: own.xf, shape: true }]);
          };
          // the names this statement set, in the order the names table holds them
          const run = recordTables(C, ['names'], () => { try { return build(); } catch (err: any) { C.warnings.push(`\\${name}: ${err.message}`); return []; } });
          made = run.result;
          styUsed = null;
          const first = new Map<string, any>(); // each key's value before the statement
          for (const [o, key, had, old] of run.log) if (o === C.names && !first.has(key)) first.set(key, had ? old : undefined);
          const set = new Set<string>();
          for (const [key, old] of first) if (OWN.call(C.names, key) && C.names[key] !== old) set.add(key);
          const names = set.size > 1 ? Object.keys(C.names).filter((n) => set.has(n)) : [...set];
          if (!preview) {
            keepStyles(made, su, build, C);
            // named points the statement goes through: written by name again while the ends are still there
            const refs = [...new Set(tokenizePath(C, body).filter((t) => t.t === 'coord').map((t) => t.raw.trim()).filter((nm) => (C.kinds || {})[nm] === 'coordinate' && C.names[nm]))];
            if (refs.length) for (const x of made) x.refs = refs;
          }
          const viaSty = su.size && lossy.length ? [`styles used: ${[...su].join(', ')}`] : [];
          done(bs, k, made, [...issues(), ...lossy, ...viaSty], { names: names.length ? names : undefined });
          continue;
        }
        if (name === 'matrix') {
          const M = matrixStatement(C, stmt);
          if (M.issues.length) for (const nm of M.names) (C.approx = C.approx || new Set()).add(nm);
          if (preview) { pushAll(shapes, M.made); continue; }
          done(bs, k, M.made, M.issues.length ? ['\\matrix is kept as code', ...M.issues] : [], { names: M.names.length ? M.names : undefined, group: 'matrix' });
          continue;
        }
        if (SEMI.has(name)) { if (preview) continue; done(bs, k, [], [`\\${name} is kept as code`], { raw: true }); continue; }
        const su = styUsed = new Set();
        const toks = tokenizePath(C, (name === 'coordinate' ? 'coordinate ' : 'node ') + stmt.trim());
        let at: any = null, node: any = null, hasAt = false;
        for (const t of toks) {
          if (t.t === 'at') { at = coord(C, t.raw); hasAt = true; }
          if (t.t === 'node') node = t;
          if (t.t === 'coord' && !at) { at = coord(C, t.raw); hasAt = true; }
        }
        if (!node) { styUsed = null; if (!preview) done(bs, k, [], ['not understood'], { raw: true }); continue; }
        const missingAt = hasAt && !at;
        at = at || { x: 0, y: 0 };
        // placed by name: at=(n1.east) (kept as code), or the positioning library's right=1cm of n1: the node
        // goes where TikZ puts it (beside the other node's box) and keeps the relation (s.pos) for the export
        const placeIss: any[] = missingAt ? ['Unresolved explicit node position'] : [];
        let pos = null;
        for (const t of toks) if (t.t === 'at' || (t.t === 'coord' && t === toks.find((q) => q.t === 'coord'))) { const w = nameIssue(C, t.raw); if (w) placeIss.push(w); }
        const own0 = parseOpts(node.opts || '');
        // name=… names the node as (…) does (the (…) written after the options wins)
        if (!node.name && lastOpt(own0, 'name')?.v) node.name = String(lastOpt(own0, 'name').v).trim();
        // `every node` (and `every <shape> node`) styles come first; a node with draw or fill is a rectangle
        const ev0 = node.coordinate ? [] : everyNode(C);
        let shapeName = nodeShapeName([...ev0, ...own0]);
        const nopts = node.coordinate ? own0 : [...everyNode(C, shapeName || 'rectangle'), ...own0];
        // chains: a node on chain goes the chain's way from its last node (right=of it, …); unnamed, it is
        // chain-<n>; join draws a line from the node before it (by {…}: with those options; with x: from x)
        const onc = node.coordinate ? null : lastOpt(nopts, 'on chain');
        if (onc && !preview) C.chainPending = null;
        if (onc) {
          const cn = String(onc.v || '').trim() || C.chainCur || 'chain', ch = C.chains?.[cn];
          if (!ch) placeIss.push(`on chain (${cn}) with no chain started`);
          else if (ch.scoped) placeIss.push(`on chain (${cn}) started in a scope`);
          else {
            ch.n++;
            if (!node.name) node.name = `${cn}-${ch.n}`;
            if (ch.last && !hasAt && !nopts.some((o: any) => PLACE_ANCHOR[o.k] && /\bof\b/.test(String(o.v || '')))) nopts.push({ k: ch.dir, v: `of ${ch.last}` });
            const joins = nopts.filter((o: any) => o.k === 'join').map((o: any) => {
              const jm = /^\s*(?:with\s+(.+?))?\s*(?:by\s+([\s\S]*))?$/.exec(String(o.v ?? ''));
              return jm ? { from: (jm[1] || ch.last || '').trim().replace(/^\(|\)$/g, ''), by: (jm[2] || '').trim().replace(/^\{([\s\S]*)\}$/, '$1') } : { bad: true };
            }).filter((j: any) => j.bad || j.from);
            if (joins.some((j: any) => j.bad)) placeIss.push('join not understood');
            C.chainPending = { chain: cn, alias: `${cn}-${ch.n}`, name: node.name, joins: joins.filter((j: any) => !j.bad) };
            ch.last = node.name;
          }
        }
        const hasBorder = !node.coordinate && nopts.some((o: any) => (o.k === 'draw' || o.k === 'fill') && o.v !== 'none');
        const explicitShape = !node.coordinate && !!nodeShapeName(nopts);
        if (!node.coordinate) shapeName = nodeShapeName(nopts) || (hasBorder ? 'rectangle' : null);
        const layoutKeys = nopts.filter((o: any) => /^(fit|span|Minimum Width|Minimum Height|append after command|to path|east above|west above|north left|north right|east below|west below|south left|south right)$/.test(o.k));
        if (layoutKeys.length) placeIss.push('layout not evaluated: ' + layoutKeys.map((o: any) => o.k).join(', '));
        // where the node goes: `at` is where its anchor is (center unless anchor=…, above, right=of a, …)
        let myAnchor: string | null = null;
        const dist = C.nodeDist ?? PX, transformed = (C.scopes || []).some((L: any) => L.xf && L.xf.length);
        const OTHER: Record<string, string> = { above: 'north', below: 'south', left: 'west', right: 'east', 'above left': 'north west', 'above right': 'north east', 'below left': 'south west', 'below right': 'south east' };
        for (const { k: pk, v } of nopts) {
          const dx = /left/.test(pk) ? -1 : /right/.test(pk) ? 1 : 0, dy = /above/.test(pk) ? -1 : /below/.test(pk) ? 1 : 0;
          // the old syntax, right of=a: centre to centre, the node distance apart (diagonals: that along each axis ÷ √2)
          const old = /^(above|below|left|right|above left|above right|below left|below right) of$/.exec(pk);
          if (old && v) {
            const of = v.trim(), ref = coord(C, of);
            if (!ref || C.unresolved?.has(of)) { placeIss.push(`Unresolved layout dependency (${of})`); continue; }
            if (transformed || (C.approx && C.approx.has(of))) placeIss.push(`placed ${pk}=${of} in a transformed scope`);
            const f = dx && dy ? Math.SQRT1_2 : 1;
            at = { x: ref.x + dx * dist * f, y: ref.y + dy * dist * f }; myAnchor = 'center';
            continue;
          }
          const pm = v && PLACE_ANCHOR[pk] && /^(?:(.*?)\s+)?of\s+(.+)$/.exec(v.trim());
          if (!pm) continue;
          // `of` placement needs the library: the code written as is takes it with it (a snippet names none)
          if (!(C.libs || []).includes('positioning')) C.libs = [...(C.libs || []), 'positioning'];
          const of = pm[2].trim(), resolved = coord(C, of), ref: any = resolved || at;
          if (!resolved || C.unresolved?.has(of)) placeIss.push(`Unresolved layout dependency (${of})`);
          const dd = (pm[1] || '').split(/\s+and\s+/).map((x: any) => len(x));
          const diag = / /.test(pk);
          // a diagonal moves the node distance along each axis (measured with pdflatex)
          // (node distance=a and b: a vertically, b horizontally; one value both ways)
          const dy0 = isFinite(dd[0]) ? dd[0] : dist, dx0 = isFinite(dd[1]) ? dd[1] : isFinite(dd[0]) ? dd[0] : (C.nodeDistH ?? dist);
          const onGrid = nopts.some((o: any) => o.k === 'on grid' && o.v !== 'false');
          // from the other node's border (its anchor on this side; a coordinate is its own point) to this one's
          const g = resolved && resolved.bare && C.geo?.[of], bx = C.boxes[of];
          let base = ref;
          if (!onGrid && g) { const q = anchorOf(g, OTHER[pk]); base = q ? toLocal(C, q) : ref; }
          else if (!onGrid && bx && !bx.pt) { const sep = bx.native ? 0 : 3.33 / K; base = { x: ref.x + dx * (bx.w / 2 + sep), y: ref.y + dy * (bx.h / 2 + sep) }; }
          at = { x: base.x + dx * dx0, y: base.y + dy * dy0 };
          myAnchor = onGrid ? 'center' : PLACE_ANCHOR[pk];
          const plain = !transformed && bx && !(C.approx && C.approx.has(of)) && /^[^().,:$\\]+$/.test(of);
          if (plain && !pos && !nopts.some((o: any) => o.k === 'anchor')) pos = { k: pk, v: v.trim(), of };
          // of a point (B.south, a |- b, a coordinate): placed from that point, written back at where it lands
          else if (transformed || !resolved || (C.approx && C.approx.has(of)) || (resolved.node && (C.kinds || {})[resolved.node] !== 'coordinate' && !C.geo?.[resolved.node])) { placeIss.push(`placed ${pk} of (${of}) with the positioning library`); pos = null; }
          else pos = null;
        }
        // an anchor=… after the placement wins over the anchor the placement set (right=of a, anchor=base)
        if (myAnchor) {
          const ks = nopts.map((o: any) => o.k), ai = ks.lastIndexOf('anchor');
          const pi = Math.max(...ks.map((k: string, n: number) => (PLACE_ANCHOR[k] || /^(above|below|left|right|above left|above right|below left|below right) of$/.test(k)) ? n : -1));
          if (ai > pi && nopts[ai].v) myAnchor = String(nopts[ai].v).trim();
        }
        if (!myAnchor) {
          // the last of anchor=… and above / below left / … (which set the anchor, and with a value shift by it)
          const last = [...nopts].reverse().find((o: any) => o.k === 'anchor' || PLACE_ANCHOR[o.k]);
          if (last?.k === 'anchor') myAnchor = String(last.v || '').trim();
          else if (last) {
            myAnchor = PLACE_ANCHOR[last.k];
            if (last.v != null && !/\bof\b/.test(last.v)) {
              const d = String(last.v).split(/\s+and\s+/).map((x: any) => len(x, placeUnit(C)) as number), sy = d[0], sx = d[1] ?? d[0];
              if (Number.isFinite(sx) && Number.isFinite(sy)) at = { x: at.x + (/left/.test(last.k) ? -sx : /right/.test(last.k) ? sx : 0), y: at.y + (/above/.test(last.k) ? -sy : /below/.test(last.k) ? sy : 0) };
              else placeIss.push(`Unresolved placement ${last.k}=${last.v}`);
            }
          }
        }
        if (placeIss.length && node.name) (C.approx = C.approx || new Set()).add(node.name);
        const nodeIss = () => [...issues(), ...placeIss];
        if (node.name) { C.names[node.name] = toAbs(C, at); (C.kinds = C.kinds || {})[node.name] = node.coordinate ? 'coordinate' : 'node'; }
        const names = node.name ? [node.name] : undefined;
        if (node.coordinate) {
          styUsed = null;
          const abs = applyXf([{ type: 'dot', cx: at.x, cy: at.y, r: 0 }], C.scopes || []).map((d: any) => ({ x: d.cx, y: d.cy }))[0];
          if (node.name) C.boxes[node.name] = { w: 0, h: 0, pt: true };
          if (node.name && C.geo) delete C.geo[node.name];
          if (preview) continue;
          // \coordinate (A) at (x,y); is a named point the canvas shows and moves; lines through it keep the name
          const placed = nopts.every((o: any) => /^(above|below|left|right|above left|above right|below left|below right)( of)?$/.test(o.k) && o.v != null) && nopts.length;
          const plainPt = node.name && (hasAt || placed) && !placeIss.length && (!nopts.length || placed) && !toks.some((t2) => t2.t === 'op' || t2.t === 'brace' || t2.t === 'opts');
          if (plainPt) done(bs, k, [{ type: 'coord', x: abs.x, y: abs.y, tikzName: node.name }], issues(), { names });
          else done(bs, k, [], ['a named point: kept so the code that uses its name still works'], { raw: true, at: abs, names });
          continue;
        }
        const text = lineBreaks(node.text);
        const sizeAsked = nopts.some((o: any) => /^minimum (size|width|height)$/.test(o.k));
        // an empty node that only carries a label or pin: an undrawn box (inner sep round nothing) holding it
        const labelOnly = !text && nopts.some((o: any) => o.k === 'label' || o.k === 'pin');
        if (labelOnly && !shapeName) shapeName = 'rectangle';
        if (shapeName && NODE_SHAPES[shapeName] && (hasBorder || sizeAsked || explicitShape || labelOnly)) {
          const made0 = boxNode(C, text, nopts, at, myAnchor, shapeName);
          const made = made0.shape;
          if (node.name) made.nodeName = node.name;
          const xf = readXf(C, nopts);
          // a node's own rotate and scale turn it about its own position (the point its anchor is at)
          if (made0.labels.length && (xf.xf.length || (C.scopes || []).some((L: any) => L.xf && L.xf.length))) made0.bad.push('labels on a transformed node');
          const absolute = applyXf([made, ...made0.labels], [...(C.scopes || []), { xf: xf.xf.map((t: any) => (t.rot !== undefined || t.scale !== undefined) ? { ...t, px: at.x, py: at.y } : t), shape: true }]);
          // (a matrix cell's box: the border without outer sep)
          if (C.cellBoxes) { const a = absolute[0], c = a.type === 'rect' ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: a.cx, y: a.cy }; C.cellBoxes.push({ s: a, c, hw: made0.w / 2, hh: made0.h / 2 }); }
          if (node.name) {
            const frame = TD.rotFrame({ ...absolute[0], nodeLabel: '', nodePin: '' }), g = geoOf(made0.kind, frame, made0.os);
            if (g) { C.names[node.name] = { ...g.c }; (C.geo ||= {})[node.name] = g; }
            C.boxes[node.name] = { w: made0.w, h: made0.h, native: true, shape: absolute[0] };
          }
          const bad = [...made0.bad];
          if (toks.some((t2) => t2.t === 'op' || t2.t === 'brace')) bad.push('path after the node');
          done(bs, k, absolute, [...nodeIss(), ...(bad.length ? [`options the node does not hold: ${[...new Set(bad)].join(', ')}`] : [])], { names }); styUsed = null; continue;
        }
        const blk = nodeBlock(C, node, at, o.slice(bs, k), s.slice(bs, k));
        if (blk) {
          blk.shape._importNodeAt = { ...at };
          const own = readXf(C, nopts);
          const xf = own.xf.map((x: any) => x.scale !== undefined ? { ...x, px: at.x, py: at.y } : x);
          styUsed = null; done(bs, k, applyXf([blk.shape], [...(C.scopes || []), { xf, shape: true }]), [...nodeIss(), ...blk.issues], { names }); continue;
        }
        if (node.text.trim()) {
          let tbox: any = null;
          const make = () => {
            const no = [...everyNode(C, 'rectangle'), ...parseOpts(node.opts)], own = readXf(C, no), t = textShape(C, node.text, no, at, undefined, myAnchor);
            if (!tbox) tbox = t._box;
            delete t._box;
            // a node's own rotate turns it about its own position
            (t as any)._importNodeAt = { ...at };
            const xf = own.xf.map((x) => ((x.rot !== undefined || x.scale !== undefined) && !x.px && !x.py ? { ...x, px: t.x, py: t.y } : x));
            return applyXf([t], [...(C.scopes || []), { xf, shape: true }]);
          };
          const made = make();
          styUsed = null;
          if (C.cellBoxes && tbox && made[0]) C.cellBoxes.push({ s: made[0], c: { x: made[0].x, y: made[0].y }, hw: tbox.hw - tbox.os, hh: tbox.hh - tbox.os });
          const bad = preview ? [] : [...unknownKeys(C, nopts, TEXT_KEYS), ...nodeDecorations(nopts).issues];
          if (Number.isFinite(len(lastOpt(nopts, 'text width')?.v, 'pt'))) bad.push('text width');
          const tal = lastOpt(nopts, 'align')?.v?.trim();
          if (tal && !/^(center|left|right|flush center|flush left|flush right)$/.test(tal)) bad.push('align=' + tal);
          if (nopts.some((o: any) => o.k==='outer sep' && len(o.v,'pt')!==0)) bad.push('outer sep');
          if (toks.some((t2) => t2.t === 'op' || t2.t === 'brace')) bad.push('path after the node');
          if (!preview) {
            keepStyles(made, su, make, C);
            const t = made[0];
            if (node.name && t) {
              const b = TD.bbox(t); C.boxes[node.name] = { w: b.w, h: b.h };
              if (tbox) (C.geo ||= {})[node.name] = { kind: 'rect', c: { x: t.x, y: t.y }, U: { x: tbox.hw, y: 0 }, V: { x: 0, y: tbox.hh } };
              C.names[node.name] = { x: t.x, y: t.y };
            }
            if (pos && t) { const r = C.names[pos.of]; t.pos = { ...pos, off: [t.x - r.x, t.y - r.y] }; }
          }
          done(bs, k, made, [...nodeIss(), ...(bad.length ? [`options the text does not hold: ${bad.join(', ')}${su.size ? ` (styles used: ${[...su].join(', ')})` : ''}`] : [])], { names });
          // a node kept as code has a size the canvas only estimates: nothing is placed beside it exactly
          if (!preview && node.name && C.stmts.length && C.stmts[C.stmts.length - 1].raw) { delete C.boxes[node.name]; if (C.geo) delete C.geo[node.name]; }
        } else if (!preview) {
          const ex = nopts.filter((o: any) => !['name', 'inner sep', 'outer sep', 'rectangle', 'shape', 'minimum size'].includes(o.k) && !(PLACE_ANCHOR[o.k] || OLD_OF.includes(o.k) || o.k === 'anchor' || o.k === 'node distance' || o.k === 'on grid'));
          const abs = applyXf([{ type: 'dot', cx: at.x, cy: at.y, r: 0 }], C.scopes || []).map((d: any) => ({ x: d.cx, y: d.cy }))[0];
          if (node.name && !ex.length && !placeIss.length && !toks.some((t2) => t2.t === 'op' || t2.t === 'brace')) {
            // an empty node: a named point whose border (inner sep round nothing) lines stop at
            const sep = len(lastOpt(nopts, 'inner sep')?.v ?? '3.333pt', 'pt') as number;
            const os = outerSep(nopts, 0.4 / K);
            (C.geo ||= {})[node.name] = { kind: 'rect', c: abs, U: { x: sep + os, y: 0 }, V: { x: 0, y: sep + os } };
            C.names[node.name] = { ...abs };
            if (C.cellBoxes) C.cellBoxes.push({ s: null, c: abs, hw: sep, hh: sep });
            done(bs, k, [{ type: 'coord', x: abs.x, y: abs.y, tikzName: node.name }], issues(), { names });
          } else done(bs, k, [], [...nodeIss(), 'empty node'], { raw: true, at, names });
        }
        continue;
      }
      // anything else: its arguments (and a ; right after them) are one statement, kept as code
      let end = argsEnd(s, j);
      const semi = /^[ \t]*;/.exec(s.slice(end)); if (semi) end += semi[0].length;
      if (/^\s*[([]/.test(s.slice(end)) || /^\s*(node|--)/.test(s.slice(end))) end = semiEnd(s, end); // \tkzDraw-like commands with path syntax
      i = end;
      if (preview) { C.warnings.push(`\\${name} not drawn`); continue; }
      if (/^(documentclass|usepackage|title|author|date)$/.test(name)) continue;
      done(bs, end, [], [`\\${name} is kept as code`], { raw: true });
    }
    return shapes;
  }
  // options of a picture or scope that set how every path in it looks (very thick, dashed, DarkBlue, line width=…)
  const baseOpt = (C: any, o: any) => (o.v === null ? W_KEYS.includes(o.k) || color(C, o.k) !== undefined : ['line width', 'color'].includes(o.k));
  function pictureOpts(C: any, o: any) {
    C.base = [...(C.base || []), ...parseOpts(o).filter((x: any) => baseOpt(C, x))];
    for (const { k, v } of parseOpts(o)) {
      if ((k === 'x' || k === 'y' || k === 'z') && v) { const u = unitVector(C, k, v); if (u) C['v' + k] = u; }
      else if (k === '>' && v && exactTip(v)) gtTip = (arrowSpec('-' + v))!.end;
    }
  }
  // comments become spaces: positions in the blanked text are positions in the source
  function blankComments(src: any) {
    return src.split('\n').map((l: any) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i) + ' '.repeat(l.length - i); } return l; }).join('\n');
  }
  const PIC_ONLY = new Set(['remember picture', 'overlay', 'baseline', 'trim left', 'trim right']);
  // picture keys only nodes read: every node takes them
  const NODE_ONLY = /^(inner sep|inner xsep|inner ysep|outer sep|outer xsep|outer ysep|minimum size|minimum width|minimum height|align|text width|text centered|text height|text depth)$/;
  // picture keys for one feature: [the key, what a statement using that feature has in it]
  const PIC_FEATURE: [RegExp, RegExp][] = [
    [/^(label distance|every label|every pin|pin distance|pin edge|label position)$/, /\b(label|pin)\b|"/],
    [/^(angle radius|angle eccentricity|every angle|pic text|pic text options)$/, /\bpic\b/],
    [/^(every edge|every edge quotes|every loop)$/, /\bedge\b|\bloop\b/],
    [/^(start chain|every on chain|every join|continue chain|on chain)$/, /\bon chain\b|\bjoin\b|\\chainin/],
    [/^(auto|swap|sloped|every to|every edge node)$/, /(--|\bto\b|\bedge\b|\.\.|\|-|-\||\bcurve\b|\barc\b)[\s\S]*\bnode\b|"|\bedge\b/],
    [/^(level distance|sibling distance|level \d+|level|every child|every child node|edge from parent|grow|grow')$/, /\bchild\b/],
    [/^(declare function)$/, /[\s\S]/],
  ];
  const uid8 = () => Math.random().toString(36).slice(2, 10);
  // One picture: `s` its body with comments blanked, `o` as written, `open` the \begin{tikzpicture}[…] as written.
  // Each shape gets s.tex = { p, k, i, n, sig } (picture, statement, place in the statement's shapes, how many);
  // the first shape of a statement also holds its source: src (from the end of the previous statement, so
  // comments and scope lines come along), cut (where its own text starts in src), ctx (the scopes around it),
  // nm (names it defines). The picture's first statement holds open and N (statements), the last one tail.
  function importPicture(C: any, s: any, o: any, open: any) {
    STY = C.styles;
    Object.assign(C, unitVectors()); C.scopes = []; C.stmts = []; C.struct = []; C.kinds = {}; C.approx = null; C.unresolved = new Set(); C.picIssue = null; C.base = []; C.nodeDist = undefined; C.nodeDistH = undefined; C.chains = {}; C.chainCur = null; C.chainPending = null; C.labelDist = undefined; C.boxes = {}; C.geo = {}; gtTip = null;
    const optM = open && /^\\begin\{tikzpicture\}\s*\[([\s\S]*)\]\s*$/.exec(blankComments(open));
    const optStr = optM ? optM[1] : '';
    if (optStr) pictureOpts(C, optStr);
    const items = splitTop(optStr, ',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const keyOf = (x: any) => splitTop(x, '=')[0].trim();
    const neutral = (x: any) => /^(x|y)\s*=\s*\{?1\s*cm\}?$/.test(x);
    const keep = items.filter((x) => !PIC_ONLY.has(keyOf(x)) && !neutral(x));
    const drop = items.filter((x) => PIC_ONLY.has(keyOf(x))).map(keyOf);
    // styles and the node distance the picture sets: read, and kept on the picture for the code written from shapes
    const own = (x: any) => {
      const k = keyOf(x), v = splitTop(x, '=').slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1');
      const sm = /^(.+?)\/\.(style|append style)$/.exec(k);
      if (sm && C.styles) { const nm = sm[1].trim(), old = C.styles.get(nm); addStyle(C, nm, sm[2] === 'append style' && old ? `${old},${v}` : v); return C.styles.has(nm); }
      // nodes={…} and the keys only nodes read (inner sep, minimum size, align, …): what every node takes
      if ((k === 'nodes' && v) || (NODE_ONLY.test(k) && v)) {
        const add = k === 'nodes' ? v : x, old = C.styles?.get('every node');
        addStyle(C, 'every node', old ? `${old},${add}` : add);
        return C.styles.has('every node');
      }
      if (k === 'start chain') return startChain(C, x.includes('=') ? v : '', false);
      // node distance=5mm and 3mm: vertical, then horizontal (the old `right of=` syntax takes the first for both)
      if (k === 'node distance') {
        const [a, b] = v.split(/\s+and\s+/).map((q: any) => len(q));
        if (isFinite(a!) && (b == null || isFinite(b))) { C.nodeDist = a; C.nodeDistH = b ?? undefined; return true; }
      }
      return false;
    };
    // >=Tip only sets what `>` means: shapes written from the model name their tips, so it stays on the picture
    const safe = keep.filter((x) => (keyOf(x) === '>' && gtTip) || own(x)), rest = keep.filter((x) => !safe.includes(x));
    const pictureXf = readXf(C, parseOpts(optStr));
    C.scopes = [];
    openScope(C, { xf: pictureXf.xf, shape: pictureXf.rest.some((o: any) => o.k === 'transform shape' && o.v !== 'false'), font: pictureXf.rest.filter((o: any) => o.k === 'font').map((o: any) => o.v).join(' '), opts: '' });
    // widths and colours the picture sets are in C.base: every shape made here takes them
    const baseKeys = new Set(parseOpts(optStr).filter((x: any) => baseOpt(C, x)).map((x: any) => x.k));
    const odd0 = rest.map(keyOf).filter((k) => !['x', 'y', 'z', 'font', 'transform shape', ...XF_KEYS].includes(k) && !baseKeys.has(k));
    // keys for one feature (labels, edges, chains, trees, angle pics…) only hold back the statements using it
    C.picFeat = [];
    const odd = odd0.filter((k) => {
      const f = PIC_FEATURE.find(([kr]) => kr.test(k.replace(/\/\.(append )?style$/, '').trim()));
      if (f) C.picFeat.push({ k, re: f[1] });
      return !f;
    });
    if (odd.length) C.picIssue = 'picture options the shapes do not hold: ' + odd.join(', ');
    if (pictureXf.unresolved.length) C.picIssue = pictureXf.unresolved.join('; ');
    const picCtx = rest.length ? [rest.join(', ')] : [];
    const shapes = parseStatements(C, s, o).map((x: any) => ({ ...x, id: uid8() }));
    const byShape = new Map();
    const p = uid8(), N = C.stmts.length;
    let prevEnd = 0;
    C.stmts.forEach((st: any, k: any) => {
      let end = st.end;
      const nl = o.indexOf('\n', end) < 0 ? o.length : o.indexOf('\n', end);
      if (!s.slice(end, nl).trim() && o.slice(end, nl).trim()) end = nl; // a comment at the end of its line
      let cut = Math.max(prevEnd, ...C.struct.filter((q: any) => q <= st.start));
      let q = cut; while (q < st.start && /[ \t]/.test(o[q])) q++;
      if (o[q] === '\n') cut = q + 1;
      const src = o.slice(prevEnd, end), ctx = [...picCtx, ...st.ctx];
      st.shapes.forEach((sh: any, i: any) => byShape.set(sh, { p, k, i, n: st.shapes.length, ...(i ? {} : { src, cut: cut - prevEnd, ...(ctx.length ? { ctx } : {}), ...(st.names ? { nm: st.names } : {}) }) }));
      const own = st.shapes[0];
      if (!st.raw && st.shapes.length === 1 && own?.type === 'text' && /^\\node\b/.test(s.slice(st.start))) {
        const tokens = tokenizePath(C, o.slice(st.start, st.end));
        const labels = tokens.filter((t: any) => t.t === 'node' && t.textStart >= 0);
        if (labels.length === 1) {
          const t = byShape.get(own), label = labels[0];
          t.label = { from: st.start + label.textStart - prevEnd, to: st.start + label.textEnd - prevEnd, value: own.text };
        }
      }
      if (st.raw && own) {
        own.code = TD.rawTikz.dedent(o.slice(cut, end));
        own.ctx = ctx;
        if ([...C.styles.keys()].some((k: string) => k.startsWith(PIC_CODE))) own.definitions = Object.fromEntries(C.styles);
        const used = Object.keys(C.names).filter((nm) => own.code.includes('(' + nm));
        if (used.length) own.names = Object.fromEntries<any>(used.map((nm) => [nm, C.names[nm]]));
        const macs = [...C.macros.keys()].filter((nm) => new RegExp(`\\\\${nm}(?![A-Za-z@])`).test(own.code));
        if (macs.length && own.kind !== 'defs') own.macros = Object.fromEntries<any>(macs.map((nm) => [nm, C.macros.get(nm)]));
      }
      prevEnd = end;
    });
    const tail = o.slice(prevEnd);
    // code with nothing to show and no place of its own sits at the picture's top-left, one under another
    const placed = shapes.filter((x: any) => x.type !== 'tikz' || (x.prev && x.prev.length) || x.at);
    const pts = placed.flatMap((x: any) => { const b = TD.bbox(x); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; });
    const tl = pts.length ? TD.bboxOf(pts, 0) : { x: 0, y: 0 };
    let row = 0;
    for (const x of shapes) if (x.type === 'tikz' && !(x.prev && x.prev.length) && !x.at) x.at = { x: tl.x, y: tl.y - 6 - 20 * row++ };
    // the shapes (new objects from the map above) take their records by position
    const flat = C.stmts.flatMap((st: any) => st.shapes);
    shapes.forEach((x: any, n: any) => {
      const t = byShape.get(flat[n]);
      if (!t) return;
      if (t.k === 0 && t.i === 0) { t.open = open || null; t.N = N; if (drop.length) t.drop = drop; if (safe.length) t.po = safe.join(', '); }
      if (t.k === N - 1 && t.i === t.n - 1) t.tail = tail;
      x.tex = t;
      if (x.type === 'tikz' && t.i === 0) { x.code = flat[n].code; x.ctx = flat[n].ctx; if (flat[n].names) x.names = flat[n].names; if (flat[n].macros) x.macros = flat[n].macros; if (flat[n].definitions) x.definitions = flat[n].definitions; }
    });
    // lines that start or end on a named point stay attached to it (src/application/app.ts links), so they follow it
    const pt = new Map();
    for (const x of shapes) {
      if (x.type === 'coord' && x.tikzName) pt.set(x.tikzName, x);
      if (!x.refs || !['line', 'curve', 'spring'].includes(x.type)) continue;
      for (const [L, kx, ky] of [['link1', 'x1', 'y1'], ['link2', 'x2', 'y2']]) {
        const c = x.refs.map((nm: any) => pt.get(nm)).find((q: any) => q && Math.abs(q.x - x[kx]) < 1e-6 && Math.abs(q.y - x[ky]) < 1e-6);
        if (c) x[L] = { id: c.id, u: 0.5, v: 0.5 };
      }
    }
    // Explicit anchors of supported native nodes retain model attachments, not just coordinates.
    const nativeNodes = new Map(shapes.filter((n: any) => n.nodeName).map((n: any) => [n.nodeName,n]));
    for (const edge of shapes) if (['line','curve','spring'].includes(edge.type) && edge.tex?.src) {
      const refs = [...edge.tex.src.matchAll(/\(([A-Za-z][A-Za-z0-9_-]*)\.(center|north(?: east| west)?|south(?: east| west)?|east|west)\)/g)];
      for (const [key,kx,ky,index] of [['link1','x1','y1',0],['link2','x2','y2',refs.length-1]] as const) {
        const match = refs[index], target: any = match && nativeNodes.get(match[1]); if (!target) continue;
        const frame = TD.rotFrame({...target,nodeLabel:'',nodePin:''}); if (!frame) continue;
        const [u,v] = TD.nodeFeatures.anchorUV(match[2],target.type), x = frame[0][0]+u*(frame[1][0]-frame[0][0])+v*(frame[3][0]-frame[0][0]), y = frame[0][1]+u*(frame[1][1]-frame[0][1])+v*(frame[3][1]-frame[0][1]);
        if (Math.hypot(edge[kx]-x,edge[ky]-y)<1) edge[key] = {id:target.id,u,v}; // ends are on the outer border (outer sep 0.2pt)
      }
    }
    // lines that stop at a node's border stay attached to that node at the point they touch (export: `(name)`)
    // (each name's first holder, as a search of the shapes would find it, looked up instead of searched per end)
    const byNodeName = new Map<string, any>(), byTextName = new Map<string, any>();
    for (const n of shapes) {
      if (n.nodeName != null && TD.nodeFeatures?.types.has(n.type) && !byNodeName.has(n.nodeName)) byNodeName.set(n.nodeName, n);
      if (n.type === 'text' && n.tex?.nm?.[0] != null && !byTextName.has(n.tex.nm[0])) byTextName.set(n.tex.nm[0], n);
    }
    const nodeByName = (nm: string) => byNodeName.get(nm) || byTextName.get(nm);
    for (const edge of shapes) for (const [mark, key, kx, ky] of [['_b1', 'link1', 'x1', 'y1'], ['_b2', 'link2', 'x2', 'y2']]) {
      const nm = edge[mark];
      if (!nm) continue;
      delete edge[mark];
      const target: any = ['line', 'curve', 'spring'].includes(edge.type) && nodeByName(nm);
      const f = target && TD.rotFrame({ ...target, nodeLabel: '', nodePin: '' });
      if (!f || edge[key]) continue;
      const ux = f[1][0] - f[0][0], uy = f[1][1] - f[0][1], vx = f[3][0] - f[0][0], vy = f[3][1] - f[0][1], det = ux * vy - uy * vx;
      if (!det) continue;
      const dx = edge[kx] - f[0][0], dy = edge[ky] - f[0][1];
      edge[key] = { id: target.id, u: (dx * vy - dy * vx) / det, v: (ux * dy - uy * dx) / det, border: true };
    }
    for (const x of shapes) if (x.prev) for (const q of x.prev) { delete q._b1; delete q._b2; }
    // the signature, and one that a move does not change (rounded, with the first shape's corner): a statement
    // whose shapes only moved together is written as it was, in a shift scope
    for (const x of shapes) if (x._fromShape) { delete x._fromShape; x.tex.sig = 'new'; }
    for (const x of shapes) if (x.tex && x.tex.sig !== 'new') {
      x.tex.sig = TD.texSig(x);
      x.tex.sr = TD.texSig(x, true);
      if (x.tex.i === 0) { const b = TD.bbox(x); if (isFinite(b.x) && isFinite(b.y)) x.tex.b = [b.x, b.y]; }
    }
    return shapes;
  }
  // the preview of TikZ code kept as an object, drawn where it was (its scopes, the names it uses)
  function preview(code: any, ctx: any, names: any, macros: any, definitions?: any) {
    const C: any = makeCtx();
    C.styles = new Map(Object.entries(definitions || {}));
    STY = C.styles;
    C.preview = true; C.scopes = []; C.names = { ...(names || {}) };
    C.macros = new Map(Object.entries<any>(macros || {}));
    for (const c of ctx || []) { pictureOpts(C, c); openScope(C, { ...readXf(C, parseOpts(c)), shape: false }); }
    let shapes = [];
    try { shapes = parseStatements(C, blankComments(String(code || ''))); } catch (e: any) { C.warnings.push(e.message); }
    return { shapes, issues: [...new Set(C.warnings)] };
  }

  // itemize and enumerate (nested too) -> a text block's list lines: "- ", "1. ", and "- [ ] " / "- [x] " for the
  // checklist items the Document export writes (\item[$\square$], \item[$\boxtimes$]), two spaces deeper per level;
  // each item on one line. Another \item[label] keeps its label as the start of its text.
  function listsToText(t: string) {
    if (!/\\begin\{(itemize|enumerate)\}/.test(t)) return t;
    const re = /\\begin\{(itemize|enumerate)\}(?:\[[^\]]*\])?|\\end\{(itemize|enumerate)\}|\\item\b[ \t]*(?:\[((?:[^\]{}]|\{[^{}]*\})*)\])?/g;
    const stack: { kind: string; n: number }[] = [];
    let out = '', last = 0, item: { head: string; text: string } | null = null;
    const line = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const endItem = () => { if (!item) return; line(); out += item.head + item.text.replace(/\s+/g, ' ').trim() + '\n'; item = null; };
    for (const m of t.matchAll(re)) {
      const between = t.slice(last, m.index);
      last = m.index! + m[0].length;
      if (item) item.text += between;
      else if (!stack.length) out += between;
      else if (between.trim()) { line(); out += '  '.repeat(stack.length) + between.replace(/\s+/g, ' ').trim() + '\n'; }
      if (m[1]) { endItem(); line(); stack.push({ kind: m[1], n: 0 }); }
      else if (m[2]) { endItem(); stack.pop(); }
      else if (stack.length) {
        endItem();
        const top = stack[stack.length - 1], lab = m[3];
        const box = lab == null ? '' : /\\square\b|\\Box\b/.test(lab) ? '[ ] ' : /\\boxtimes|\\checkmark|\\xmark|\\CheckedBox/.test(lab) ? '[x] ' : '';
        const mark = top.kind === 'enumerate' && !box ? `${++top.n}.` : '-';
        item = { head: '  '.repeat(stack.length - 1) + mark + ' ' + box, text: lab != null && !box ? lab + ' ' : '' };
      } else out += m[0];
    }
    if (item) (item as any).text += t.slice(last); else out += t.slice(last);
    endItem();
    return out.replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
  }
  // LaTeX text (between pictures) -> DiagramTeX text block (simple markdown-ish)
  function latexToText(t: any) {
    t = t
      .replace(/\\begin\{(center|figure|flushleft|flushright)\}(\[[^\]]*\])?/g, '')
      .replace(/\\end\{(center|figure|flushleft|flushright)\}/g, '')
      .replace(/\\(centering|noindent|medskip|bigskip|smallskip|par|maketitle)\b/g, '')
      .replace(/\\section\*?\{([^}]*)\}/g, '\n# $1\n')
      .replace(/\\subsection\*?\{([^}]*)\}/g, '\n## $1\n')
      .replace(/\\subsubsection\*?\{([^}]*)\}/g, '\n### $1\n')
      .replace(/\\(vspace|hspace)\*?\{[^}]*\}/g, '')
      .replace(/\\caption\{([^}]*)\}/g, (_m: any, x: any) => `\n${CAPTION}${x.trim()}\n`) // its own line: textBlocks centres it
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\\[([\s\S]*?)\\\]/g, (m: any, x: any) => `$$${x.trim()}$$`);
    t = t.split('\n').map((l: any) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^(#{1,3} .*)\n\n/gm, '$1\n').trim();
    t = listsToText(t);
    // text blocks keep %, &, # literally (export escapes them again); only outside math
    return t.split('\n').map((l: any) => l.includes('$$') ? l : TD.segments(l).map((g: any) => (g.math ? `$${g.s}$` : g.s.replace(/\\([%&#])/g, '$1'))).join('')).join('\n');
  }

  // a figure's caption (marked by latexToText) as a centred line of small text under its picture: diagram blocks
  // have no caption of their own; the rest of the text as it was
  const CAPTION = '\u0001';
  function textBlocks(t: string) {
    const out: any[] = [];
    let run: string[] = [];
    const flush = () => { const x = run.join('\n').replace(/^\n+|\s+$/g, ''); if (x) out.push({ type: 'text', text: x }); run = []; };
    for (const l of t.split('\n')) {
      if (l.startsWith(CAPTION)) { flush(); if (l.slice(1).trim()) out.push({ type: 'text', text: l.slice(1).trim(), align: 'center', size: 'small' }); } else run.push(l);
    }
    flush();
    return out;
  }

  function embedded(inner: any) {
    const m = inner.match(/(?:\\tddata\{|%\s*(?:diagramtex|texdiagram)-data:\s*)([A-Za-z0-9+/=]+)/);
    if (!m) return null;
    try {
      const shapes = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (!Array.isArray(shapes) || shapes.some((s) => !s || !TD.TYPES[s.type])) return null;
      return shapes.map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10) }));
    } catch (e: any) { return null; }
  }

  // Page setup from \documentclass[..pt, ..paper] and \usepackage[...]{geometry}
  function parsePage(src: any) {
    const dc = src.match(/\\documentclass(?:\[([^\]]*)\])?\{[^}]*\}/);
    if (!dc) return null;
    const pg: Record<string, any> = { title: /\\maketitle/.test(src) };
    // \section{…} (not \section*) numbers the headings; \author{…} goes under the title
    if (/\\(?:sub){0,2}section\{/.test(src)) pg.numbered = true;
    const au = /\\author\{([^}]*)\}/.exec(src);
    if (au && au[1].replace(/\\(and|\\)/g, ' ').trim()) pg.author = au[1].replace(/\s*\\and\s*/g, ', ').replace(/\s*\\\\\s*/g, ' ').trim();
    const opts = [(dc[1] || ''), ((src.match(/\\usepackage\[([^\]]*)\]\{geometry\}/) || [])[1] || '')].join(',').split(',').map((x) => x.trim()).filter(Boolean);
    const len = (v: any) => { const m = String(v).match(/^([\d.]+)\s*(cm|mm|in|pt)?$/); if (!m) return null; return +m[1] * { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72.27 }[m[2] || 'cm']!; };
    for (const o of opts) {
      const fm = o.match(/^(10|11|12)pt$/); if (fm) pg.font = +fm[1];
      const pm = Object.entries<any>(TD.PAPERS).find(([, v]) => v.opt === o); if (pm) pg.paper = pm[0];
      if (o === 'landscape') pg.orient = 'landscape';
      const kv = o.match(/^(\w+)\s*=\s*(.+)$/);
      if (kv) {
        const v = len(kv[2]);
        if (v == null) continue;
        const k = kv[1];
        if (k === 'margin') Object.assign(pg, { mt: v, mb: v, ml: v, mr: v });
        if (k === 'hmargin') Object.assign(pg, { ml: v, mr: v });
        if (k === 'vmargin') Object.assign(pg, { mt: v, mb: v });
        const map: Record<string, any> = { top: 'mt', bottom: 'mb', left: 'ml', right: 'mr', inner: 'ml', outer: 'mr', paperwidth: 'w', paperheight: 'h' };
        if (map[k]) pg[map[k]] = v;
      }
    }
    if (pg.w && pg.h && !pg.paper) pg.paper = 'custom';
    return pg;
  }

  TD.importLatex = function (src: any, opt: Record<string, any> = {}) {
    const C: any = makeCtx();
    const o = (opt.definitions ? String(opt.definitions) + '\n' : '') + String(src);
    // positions in s are positions in o: comments and the wrappers round wide pictures become spaces
    const keepGroup = (m: any, pic: any) => { const a = m.indexOf(pic); return ' '.repeat(a) + pic + ' '.repeat(m.length - a - pic.length); };
    let s = blankComments(o)
      // pictures wrapped in \resizebox{..}{..}{ ... } (wide diagrams in our exports)
      .replace(/\\resizebox\{[^}]*\}\{[^}]*\}\{%?\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, keepGroup)
      // …and, since 1.24, boxed first: \begin{lrbox}{\dtxbox} picture \end{lrbox} \resizebox{..}{..}{\usebox{\dtxbox}}
      .replace(/\\begin\{lrbox\}\{\\\w+\}%?\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\\end\{lrbox\}%?\s*\\resizebox\{[^}]*\}\{[^}]*\}\{\\usebox\{\\\w+\}\}/g, keepGroup);
    let title = null;
    const tm = s.match(/\\title\{([^}]*)\}/);
    if (tm) title = tm[1];
    const page = parsePage(s);
    // the preamble: colours and definitions the pictures use, and the libraries and packages they load
    const docM = s.match(/\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/);
    let preDefs = '';
    const preEnd = docM ? docM.index! : s.indexOf('\\begin{tikzpicture}');
    if (preEnd >= 0) {
      const ps = s.slice(0, preEnd), po = o.slice(0, preEnd);
      for (const m of ps.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) C.libs = [...new Set([...(C.libs || []), ...m[1].split(',').map((x: any) => x.trim()).filter(Boolean)])];
      for (const m of ps.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)) for (const p of m[1].split(',').map((x: any) => x.trim())) if (DRAW_PKGS.has(p) && p !== 'tikz') C.pkgs = [...new Set([...(C.pkgs || []), p])];
      const P = { ...C, warnings: [], scopes: [], stmts: [], struct: null };
      parseStatements(P, ps, po);
      Object.assign(C.colors, P.colors);
      preDefs = P.stmts.filter((st: any) => st.raw && st.shapes[0] && st.shapes[0].kind === 'defs' && !/^\s*\\(centering|small|large|normalsize|footnotesize|color)\b/.test(po.slice(st.start, st.end)))
        .map((st: any) => po.slice(st.start, st.end).trim())
        // not the lines DiagramTeX's own preamble adds (quantikz compatibility, pgfplots compat)
        .filter((t: any) => !/^\\pgfplotsset\{compat=[^}]*\}$/.test(t)).join('\n');
    }
    const base = docM ? docM.index + docM[0].indexOf(docM[1]) : 0;
    const bodyS = docM ? docM[1] : s, bodyO = o.slice(base, base + bodyS.length);
    // pictures, and bare quantikz / forest / ZX / tikz-timing / bytefield environments (each becomes a picture holding the block)
    const found: any[] = [];
    // \begin{tikzpicture}[options] … \end{tikzpicture}, scanned by hand (a regex over nested brackets backtracks
    // exponentially on an unclosed picture): the options run to the ] that closes them, outside braces (a style's
    // body may hold [ ] of its own: mypic/.pic={\node [box] {…};}), else to the first ], when an \end follows them
    const BEG = '\\begin{tikzpicture}', END = '\\end{tikzpicture}';
    const optsEnd = (t: string, r: number) => {
      let d = 0, br = 0;
      for (let j = r; j < t.length; j++) {
        const c = t[j];
        if (c === '\\') { j++; continue; }
        if (c === '{') br++;
        else if (c === '}') { if (br > 0) br--; }
        else if (br === 0 && c === '[') d++;
        else if (br === 0 && c === ']') { d--; if (d === 0) return j; }
        if (t.startsWith(END, j)) return -1;
      }
      return -1;
    };
    for (let p = bodyS.indexOf(BEG); p >= 0;) {
      const q = p + BEG.length;
      let r = q; while (r < bodyS.length && /\s/.test(bodyS[r])) r++;
      let inner = q;
      if (bodyS[r] === '[') { const b0 = optsEnd(bodyS, r), b = b0 >= 0 ? b0 : bodyS.indexOf(']', r); if (b >= 0 && bodyS.indexOf(END, b + 1) >= 0) inner = b + 1; }
      const e = bodyS.indexOf(END, inner);
      if (e < 0) break;
      found.push({ at: p, end: e + END.length, open: p, inner, len: e - inner });
      p = bodyS.indexOf(BEG, e + END.length);
    }
    const inPic = (i: any) => found.some((f) => i >= f.at && i < f.end);
    // circuitikz environments: a Circuit block each
    for (const b of bodyS.matchAll(/\\begin\{circuitikz\}[\s\S]*?\\end\{circuitikz\}/g))
      if (!inPic(b.index)) found.push({ at: b.index, end: b.index + b[0].length, cz: bodyO.slice(b.index, b.index + b[0].length) });
    for (const b of bodyS.matchAll(/\\begin\{quantikz\}[\s\S]*?\\end\{quantikz\}|\\begin\{forest\}[\s\S]*?\\end\{forest\}|\\begin\{ZX\}[\s\S]*?\\end\{ZX\}|\\begin\{tikztimingtable\}[\s\S]*?\\end\{tikztimingtable\}|\\begin\{sequencediagram\}[\s\S]*?\\end\{sequencediagram\}|(?:\\bytefieldsetup\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*)*\\begin\{bytefield\}[\s\S]*?\\end\{bytefield\}/g))
      if (!inPic(b.index)) found.push({ at: b.index, end: b.index + b[0].length, bare: bodyO.slice(b.index, b.index + b[0].length) });
    found.sort((a, b) => a.at - b.at);
    const blocks = [];
    let last = 0;
    const preStyles = new Map(C.styles), preMacros = new Map(C.macros);
    for (const f of found) {
      C.styles = new Map(preStyles); C.macros = new Map(preMacros); C.names = {};
      const before = latexToText(bodyS.slice(last, f.at));
      if (before && docM) blocks.push(...textBlocks(before));
      last = f.end;
      if (f.cz) {
        const q = circuitBlock(f.cz, false);
        if (q) { blocks.push({ type: 'diagram', shapes: withDefs([q], preDefs, C) }); continue; }
        const shapes = importPicture(C, bodyS.slice(f.at, f.end).replace(/\\(begin|end)\{circuitikz\}(\[[^\]]*\])?/g, (m: any) => ' '.repeat(m.length)), bodyO.slice(f.at, f.end), '');
        blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
        continue;
      }
      if (f.bare) {
        const q = `\\node at (0,0) {${f.bare}};`;
        const shapes = importPicture(C, q, q, '');
        for (const x of shapes) delete x.tex;
        blocks.push({ type: 'diagram', shapes });
        continue;
      }
      const picO = bodyO.slice(f.at, f.end);
      const data = embedded(picO);
      if (data) { blocks.push({ type: 'diagram', shapes: data }); continue; }
      // a block copied with a scale is wrapped in a scale-around scope: read what is inside, then scale it back
      const peeled = peelScale(picO), pic1 = peeled ? peeled.pic : picO, sc = peeled && peeled.scale;
      // a pgf-umlcd class diagram: the whole picture is the block's code
      const uml = rescaled(TD.uml && TD.uml.fromPicture(pic1), sc);
      if (uml) { blocks.push({ type: 'diagram', shapes: withDefs([uml], preDefs, C) }); continue; }
      // a picture of tikz-chemlab apparatus: the whole picture is the block's code
      const lab = rescaled(TD.chemlab && TD.chemlab.fromPicture(pic1), sc);
      if (lab) { blocks.push({ type: 'diagram', shapes: withDefs([lab], preDefs, C) }); continue; }
      // a picture drawn wholly with circuitikz parts: a Circuit block
      const czq = rescaled(circuitBlock(pic1, true) || automataBlock(pic1) || graphBlock(pic1), sc);
      if (czq) { blocks.push({ type: 'diagram', shapes: withDefs([czq], preDefs, C) }); continue; }
      const shapes = importPicture(C, bodyS.slice(f.inner, f.inner + f.len), bodyO.slice(f.inner, f.inner + f.len), bodyO.slice(f.open, f.inner));
      blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
    }
    const bareCz = !found.length && (circuitBlock(bodyO, true) || (/^\s*\\(node|path|draw|tikzset)\b/.test(bodyS) && automataBlock(bodyO)));
    if (bareCz) blocks.push({ type: 'diagram', shapes: withDefs([bareCz], preDefs, C) });
    else if (!found.length) {
      if (/\\(?:(?:draw|fill|filldraw|node|shade|path|coordinate|foreach|tikzset)\b|begin\{(?:axis|semilog[xy]axis|loglogaxis)\})/.test(bodyS)) {
        const shapes = importPicture(C, bodyS, bodyO, '');
        blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
      } else if (bodyS.trim()) blocks.push(...textBlocks(latexToText(bodyS)));
    } else {
      const after = latexToText(bodyS.slice(last));
      if (after && docM) blocks.push(...textBlocks(after));
    }
    const analysis = blocks.filter((b: any) => b.type === 'diagram').flatMap((b: any) => b.shapes)
      .filter((x: any) => !(x.type === 'tikz' && x.kind === 'defs'))
      .map((x: any) => ({ id: x.id, status: x.type !== 'tikz' ? 'editable' : x.unresolved || !(x.prev || []).length ? 'unresolved' : 'preserved',
        code: x.code || x.tex?.src || '', issues: x.issues || [], preview: x.type !== 'tikz' || !!(x.prev || []).length }));
    // editable: each statement kept as code becomes the shapes its preview draws (approximate where the preview is),
    // and nothing remembers the source, so the export is written from the shapes. Code with nothing to draw stays.
    if (opt.editable) for (const b of blocks) if (b.type === 'diagram') {
      const out = b.shapes.flatMap((x: any) => (x.type !== 'tikz' || !x.tex ? [x] : x.prev && x.prev.length ? x.prev.map((p: any) => ({ ...p, id: uid8() })) : [x]));
      const code = out.some((x: any) => x.type === 'tikz' && x.kind !== 'defs');
      b.shapes = out.filter((x: any) => code || !(x.type === 'tikz' && x.kind === 'defs'));
      for (const x of b.shapes) if (x.type !== 'tikz') delete x.tex;
    }
    // what was kept as code, in source order, with the line its statement starts on
    // statements are found in source order, so the line count runs on from the last one (not from the top each time)
    let from = 0, counted = 0, line = 1;
    const lineAt = (code: any) => {
      const first = String(code || '').split('\n').find((l) => l.trim() && !/^\s*%/.test(l));
      const k = first ? o.indexOf(first.trim(), from) : -1;
      if (k < 0) return null;
      from = k + 1;
      for (let n = o.indexOf('\n', counted); n >= 0 && n < k; n = o.indexOf('\n', n + 1)) line++;
      counted = k;
      return line;
    };
    const report = blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes).filter((x) => x.type === 'tikz' && x.kind !== 'defs' && x.tex)
      .map((x) => ({ code: x.code, line: lineAt(x.code), issues: x.issues || [], preview: (x.prev || []).length }));
    return { blocks, warnings: [...new Set(C.warnings)], kept: report, analysis, title, page };
  };
  // top-level comma-separated items (commas inside {} [] () stay)
  function splitList(t: string) {
    const out: string[] = [];
    let d = 0, buf = '';
    for (const ch of t) {
      if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
      if (ch === ',' && d === 0) { out.push(buf.trim()); buf = ''; } else buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }
  // A picture as DiagramTeX writes a scaled object (src/domain/scale.ts): its whole body in one
  // \begin{scope}[scale around={k:(x,y)}, transform shape]. Gives the picture without that scope and the scale
  // (k, and the point in px, y down), so a block read from the rest can be given the scale back; else null.
  function peelScale(pic: string) {
    const t = blankComments(pic), bm = /^\s*\\begin\{tikzpicture\}\s*/.exec(t), end = t.lastIndexOf('\\end{tikzpicture}');
    if (!bm || end < 0) return null;
    let i = bm[0].length;
    if (t[i] === '[') { const e = matchClose(t, i, '[', ']'); if (e < 0) return null; i = e + 1; }
    const sm = /^\s*\\begin\{scope\}\s*\[/.exec(t.slice(i, end));
    if (!sm) return null;
    const ob = i + sm[0].length - 1, oe = matchClose(t, ob, '[', ']');
    if (oe < 0) return null;
    const o = splitList(t.slice(ob + 1, oe)).map((x: string) => x.trim());
    const sa = o.length === 2 && o.includes('transform shape') ? o.find((x: string) => /^scale around\s*=/.test(x)) : null;
    const m = sa && /^scale around\s*=\s*\{\s*(-?[\d.]+)\s*:\s*\(\s*(-?[\d.]+)\s*(?:cm)?\s*,\s*(-?[\d.]+)\s*(?:cm)?\s*\)\s*\}$/.exec(sa);
    if (!m || !(+m[1] > 0)) return null;
    // the scope must close at the very end, holding everything
    const se = t.lastIndexOf('\\end{scope}', end);
    if (se < oe || t.slice(se + 11, end).trim()) return null;
    let depth = 0;
    for (const r of t.slice(oe, se).matchAll(/\\(begin|end)\{scope\}/g)) if ((depth += r[1] === 'begin' ? 1 : -1) < 0) return null;
    if (depth) return null;
    return {
      pic: pic.slice(0, i) + pic.slice(oe + 1, se) + pic.slice(end),
      scale: { k: +m[1], px: +m[2] * TD.PX_PER_CM, py: -m[3] * TD.PX_PER_CM },
    };
  }
  // a block read from a picture peeled of its scale scope, given that scale back: it grows about the same point
  // and keeps it as the object's scale (transform shape), as the export wrote it
  function rescaled(q: any, sc: any) {
    if (!q || !sc) return q;
    // the export writes the centre and the block's shift to 0.01cm each: one that close is the block's own centre, so it doesn't creep
    const b = TD.bboxOf(TD.TYPES[q.type].samples({ ...q, objectScale: 1 }), 0), cx = b.x + b.w / 2, cy = b.y + b.h / 2, tol = 0.0101 * TD.PX_PER_CM;
    const at = Math.abs(cx - sc.px) <= tol && Math.abs(cy - sc.py) <= tol ? { px: cx, py: cy } : { px: sc.px, py: sc.py };
    return applyXf([q], [{ xf: [{ scale: sc.k, ...at }], shape: true }])[0];
  }
  // A picture as DiagramTeX writes one block: \begin{tikzpicture}[x=1cm, y=1cm] \begin{scope}[shift={(x,y)}, …] body
  // \end{scope} \end{tikzpicture}. Gives where the scope moves it (cm, y up), the scope's other options and the body
  // (the picture's own x=1cm, y=1cm are DiagramTeX's and dropped). Anything else: the picture's options and body as written.
  function unscope(pic: string) {
    const t = blankComments(pic), bm = /^\s*\\begin\{tikzpicture\}\s*/.exec(t), end = t.lastIndexOf('\\end{tikzpicture}');
    if (!bm || end < 0) return null;
    let i = bm[0].length, env: string[] = [];
    if (t[i] === '[') { const e = matchClose(t, i, '[', ']'); if (e < 0) return null; env = splitList(t.slice(i + 1, e)); i = e + 1; }
    const body = pic.slice(i, end), bt = t.slice(i, end);
    const sm = /^\s*\\begin\{scope\}\s*\[/.exec(bt);
    if (sm) {
      const ob = sm[0].length - 1, oe = matchClose(bt, ob, '[', ']'), se = bt.lastIndexOf('\\end{scope}');
      const o = oe > 0 ? splitList(bt.slice(ob + 1, oe)) : [];
      const sh = o.length ? /^shift\s*=\s*\{?\s*\(\s*(-?[\d.]+)\s*(?:cm)?\s*,\s*(-?[\d.]+)\s*(?:cm)?\s*\)\s*\}?$/.exec(o[0]) : null;
      if (sh && se > oe && !bt.slice(se + 11).trim() && !/\\begin\{scope\}/.test(bt.slice(oe, se))) {
        const own = env.every((x) => /^[xy]\s*=\s*1\s*cm$/.test(x));
        if (own) return { at: [+sh[1], +sh[2]], opts: o.slice(1), body: body.slice(oe + 1, se) };
      }
    }
    return { at: null as number[] | null, opts: env, body };
  }
  // Circuitikz code as a Circuit block. `whole`: only when every statement is a circuitikz part or wire (with at
  // least one part) and nothing is left over but settings, so a plain TikZ picture stays a picture. Otherwise (a
  // circuitikz environment) what can't be read is kept as code in the block.
  function circuitBlock(code: string, whole: boolean) {
    if (!TD.cz || !TD.TYPES.cz) return null;
    // the environment's own scale: kept as the object's scale with transform shape; any other change of
    // coordinates the block can't draw, so the picture is read some other way
    let envScale = 1, coordsOnly = false;
    {
      const em = /^\s*\\begin\{(?:circuitikz|tikzpicture)\}\s*\[/.exec(blankComments(code));
      if (em) {
        const ob = em[0].length - 1, oe = matchClose(code, ob, '[', ']');
        const own = oe > 0 ? ownScale(splitList(code.slice(ob + 1, oe)).map((x: string) => x.trim()).filter(Boolean)) : null;
        if (!own) return null;
        if (own.k !== 1) { envScale = own.k; coordsOnly = !own.shape; code = code.slice(0, ob) + (own.opts.length ? `[${own.opts.join(', ')}]` : '') + code.slice(oe + 1); }
      }
    }
    const u = /^\s*\\begin\{tikzpicture\}/.test(code) ? unscope(code) : null;
    let size = '', col = '';
    if (u && u.at) {
      // the options the Circuit block itself writes: its colour and its labels' size
      const rest = u.opts.filter((o) => {
        const f = /^font\s*=\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)$/.exec(o);
        if (f) { size = f[1]; return false; }
        const c = /^color\s*=\s*(.+)$/.exec(o), h = c && TD.tikzColor(c[1].trim());
        if (h) { col = h; return false; }
        return true;
      });
      code = (rest.length ? `\\tikzset{${rest.join(', ')}}\n` : '') + u.body;
    }
    const { items, raw } = TD.cz.parse(code);
    if (!items.length) return null;
    // a picture is a circuit only with a circuitikz part in it: wires and text alone are plain TikZ
    if (whole && (!items.some((it: any) => !TD.cz.isWire(it) && it.part !== 'text') || String(raw).split('\n').some((l: string) => l.trim() && !/^\\(ctikzset|tikzset|tikzstyle)\b/.test(l.trim())))) return null;
    const q = { ...TD.TYPES.cz.create({ x: 0, y: 0 }, {}), items, raw, x: 0, y: 0, id: uid8() };
    if (u && u.at) { q.x = u.at[0] * TD.PX_PER_CM; q.y = -u.at[1] * TD.PX_PER_CM; }
    if (size) q.size = size;
    if (col) q.color = col;
    if (envScale !== 1 && coordsOnly) {
      // scale without transform shape: the wires' coordinates scale, the parts keep their size (as in circuitikz).
      // Statements kept as code would not scale with them, so then the picture is read some other way.
      if (String(raw).split('\n').some((l: string) => l.trim() && !/^\\(ctikzset|tikzset|tikzstyle)\b/.test(l.trim()))) return null;
      const k = envScale, sc = (v: any) => (Array.isArray(v) ? [v[0] * k, v[1] * k] : v);
      q.items = q.items.map((it: any) => ({ ...it, a: sc(it.a), b: sc(it.b), p: sc(it.p) }));
      for (const it of q.items) for (const key of ['a', 'b', 'p']) if (it[key] === undefined) delete it[key];
    } else if (envScale !== 1) rescaled(q, { k: envScale, px: 0, py: 0 });
    return q;
  }
  // A block's picture options and what they do to the whole: `scale=k` is taken out of the options (k), with
  // `shape` when transform shape scales the nodes too, as an object's scale does; without it only coordinates
  // scale, which the caller handles or refuses. Anything else that moves coordinates (xscale, rotate, x=2cm, …):
  // null, so the picture is read as separate objects.
  function ownScale(opts: string[]) {
    let k = 1, shape = false, scaleAt = -1;
    for (let i = 0; i < opts.length; i++) {
      const { k: key, v } = (() => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(opts[i].trim()); return { k: m ? m[1].trim() : '', v: m && m[2] != null ? m[2].trim() : null }; })();
      if (key === 'transform shape') { if (v == null || v === 'true') shape = true; continue; }
      if (key === 'scale') { const f = Number(String(v).replace(/^\{|\}$/g, '')); if (!(f > 0)) return null; k = f; scaleAt = i; continue; }
      if ((key === 'x' || key === 'y') && v != null && /^\{?\s*1\s*cm\s*\}?$/.test(v)) continue;
      if (/^(xscale|yscale|scale around|rotate|rotate around|shift|xshift|yshift|x|y|xslant|yslant|cm)$/.test(key)) return null;
    }
    return { k, shape, opts: k === 1 ? opts : opts.filter((o, i) => i !== scaleAt && !/^transform shape\b/.test(o.trim())) };
  }
  // A picture of automata states (\node[state] …) and the transitions between them, and nothing else: an Automaton block
  function automataBlock(pic: string) {
    if (!TD.fsm || !TD.TYPES.automata || !/\bstate\b/.test(pic)) return null;
    const u = /^\s*\\begin\{tikzpicture\}/.test(pic) ? unscope(pic) : { at: null, opts: [], body: pic };
    if (!u) return null;
    const own = ownScale(u.opts);
    if (!own || (own.k !== 1 && !own.shape)) return null; // positions scaled, nodes not: drawn as separate objects
    u.opts = own.opts;
    // its lines indented by two spaces, as the block keeps its code
    const lines = u.body.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n'), ind = least(lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l))![0].length));
    const src = `\\begin{tikzpicture}${u.opts.length ? `[${u.opts.join(', ')}]` : ''}\n${lines.map((l) => (l.trim() ? '  ' + l.slice(isFinite(ind) ? ind : 0) : '')).join('\n')}\n\\end{tikzpicture}`;
    const M = TD.fsm.parse(src);
    if (!M.states.length || M.warnings.length || [...M.pre, ...M.post].some((x: string) => !/^\\tikzset\b/.test(x))) return null;
    if (!M.states.every((st: any) => st.o.some((o: string) => /^state\b/.test(o)))) return null;
    const q: any = { ...TD.TYPES.automata.create({ x: 0, y: 0 }), src, id: uid8() };
    // the picture's origin stays at the canvas origin (or where its shift puts it), as for pictures imported as shapes
    if (u.at || /^\s*\\begin\{tikzpicture\}/.test(pic)) { const at = u.at || [0, 0], b = TD.fsm.layout(q).bb; q.x = at[0] * TD.PX_PER_CM + b.x; q.y = -at[1] * TD.PX_PER_CM + b.y; }
    // the picture's scale is about its origin
    if (own.k !== 1) { const at = u.at || [0, 0]; rescaled(q, { k: own.k, px: at[0] * TD.PX_PER_CM, py: -at[1] * TD.PX_PER_CM }); }
    return q;
  }
  // a picture that is one TikZ \graph: a Graph block
  function graphBlock(pic: string) {
    if (!TD.graph || !TD.TYPES.graph || !/\\graph\b/.test(pic) || !/^\s*\\begin\{tikzpicture\}/.test(pic)) return null;
    const u = unscope(pic);
    if (!u) return null;
    const own = ownScale(u.opts);
    if (!own || (own.k !== 1 && !own.shape)) return null; // positions scaled, nodes not: drawn as separate objects
    u.opts = own.opts;
    const lines = u.body.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n'), ind = least(lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l))![0].length));
    const src = `\\begin{tikzpicture}${u.opts.length ? `[${u.opts.join(', ')}]` : ''}\n${lines.map((l) => (l.trim() ? '  ' + l.slice(isFinite(ind) ? ind : 0) : '')).join('\n')}\n\\end{tikzpicture}`;
    const M = TD.graph.parse(src);
    if (!M.found || !M.nodes.length || M.warnings.length || M.pre.length || M.post.length) return null;
    const q: any = { ...TD.TYPES.graph.create({ x: 0, y: 0 }), src, id: uid8() };
    const at = u.at || [0, 0], b = TD.graph.layout(q).bb;
    q.x = at[0] * TD.PX_PER_CM + b.x; q.y = -at[1] * TD.PX_PER_CM + b.y;
    // the picture's scale is about its origin
    if (own.k !== 1) rescaled(q, { k: own.k, px: at[0] * TD.PX_PER_CM, py: -at[1] * TD.PX_PER_CM });
    return q;
  }
  // packages a picture's code may need (others in a preamble are the document's own)
  const DRAW_PKGS = new Set(['tikz', 'pgfplots', 'tikz-cd', 'circuitikz', 'quantikz', 'tikz-feynman', 'forest', 'chemfig', 'tikz-timing', 'karnaugh-map', 'bytefield', 'pgf-umlcd', 'pgf-umlsd', 'tikz-chemlab', 'blochsphere',
    'zx-calculus', 'tikz-3dplot', 'tkz-euclide', 'pgfornament', 'xy', 'siunitx', 'bm', 'mathtools', 'physics', 'tikzpeople', 'pgf-pie', 'smartdiagram', 'tikz-qtree', 'tikz-network', 'pgfgantt', 'bodegraph', 'pst-circ',
    'amsmath', 'amssymb', 'amsfonts', 'mathrsfs', 'stmaryrd', 'upgreek', 'esint', 'dsfont', 'bbm']);
  // the preamble's definitions go with each picture, as a code object that exports them to the preamble
  function withDefs(shapes: any, defs: any, C: any) {
    // Definitions are source metadata when the whole figure is native, not drawing objects.
    // Each source-statement leader owns its dependencies; partial statements regenerate from primitives.
    if (defs && shapes.length && shapes.every((s: any) => s.type !== 'tikz')) {
      for (const x of shapes) if (!x.tex || x.tex.i === 0)
        x.tex = { ...x.tex, preamble:defs, libs:C.libs?.slice() || [], pkgs:C.pkgs?.slice() || [] };
      return shapes;
    }
    if (!defs) {
      for (const x of shapes) if (C.libs?.length || C.pkgs?.length)
        x.tex = { ...x.tex, libs: C.libs?.slice() || [], pkgs: C.pkgs?.slice() || [] };
      return shapes;
    }
    const tl = shapes.length ? TD.bboxOf(shapes.flatMap((x: any) => { const b = TD.bbox(x); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0) : { x: 0, y: 0 };
    return [{ type: 'tikz', kind: 'defs', pre: true, code: defs || '', x: 0, y: 0, at: { x: tl.x, y: tl.y - 26 }, ctx: [], prev: [], issues: [], ...(C.libs ? { libs: C.libs.slice() } : {}), ...(C.pkgs ? { pkgs: C.pkgs.slice() } : {}), id: uid8() }, ...shapes];
  }
  TD.importInternals = { parseOpts, arrowSpec, len, tokenizePath, preview, blankComments };
  // a TikZ colour (red, blue!20, red!30!black) → '#rrggbb', or null / undefined (none / unknown)
  let colorCtx: any = null;
  TD.svgColor = svgName;
  TD.tikzColor = (spec: any) => color(colorCtx || (colorCtx = makeCtx()), spec);
})();
