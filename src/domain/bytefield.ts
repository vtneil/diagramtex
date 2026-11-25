import { runtime as TD } from '../runtime';
import { unbrace } from './tex-groups';
import { layoutCache, srcKey } from './layout-cache';
import { skipSpace as skipWs } from '../core/tex-scan';
// Bit fields written with the bytefield package (v2). The source is the object: a bytefield environment of
// \bitheader, \bitbox, \bitboxes, \wordbox and \skippedwords rows broken by \\, with rightwordgroup and
// leftwordgroup braces, \bytefieldsetup keys and the [lrtb] border option. It is read into a list of items
// that each keep their text as written, so hand-written code comes back unchanged and only what the editor
// touched is rewritten. It is drawn here the way the package typesets it (bytefield.sty 2.9, measured
// against pdflatex: 8.82pt bits, 4ex rows, \tiny bit numbers floating above their row, rows stacked at an
// \openup -1pt baselineskip, braces from TeX's delimiter sizes) and exported unchanged in a node.
// The visual editor (js/bfeditor.ts) edits the items.
const { r2, esc } = TD.util;
const K = TD.PT_PER_PX, PT = 1 / K; // pt per px, px per pt

TD.BYTEFIELD_DEFAULT = [
  '\\begin{bytefield}[bitwidth=1.1em]{32}',
  '  \\bitheader{0,7,8,15,16,23,24,31} \\\\',
  '  \\begin{rightwordgroup}{Header}',
  '    \\bitbox{4}{Version} & \\bitbox{4}{IHL} & \\bitbox{8}{Type of service} & \\bitbox{16}{Total length} \\\\',
  '    \\bitbox{16}{Identification} & \\bitbox{3}{Flags} & \\bitbox{13}{Fragment offset}',
  '  \\end{rightwordgroup} \\\\',
  '  \\wordbox{1}{Source address} \\\\',
  '  \\wordbox[lrt]{1}{Data} \\\\',
  '  \\skippedwords \\\\',
  '  \\wordbox[lrb]{1}{}',
  '\\end{bytefield}',
].join('\n');

// ---------------------------------------------------------------- the package's sizes (pt)
const EM = 10, EX = 4.30554, AXIS = 2.5, NULLDELIM = 1.2;
const BITWIDTH = 8.81958; // \settowidth{\bf@bitwidth}{\tiny 99i}
const BASELINE = 11, LINESKIP = 0, LIMIT = -1; // \baselineskip 12pt, \openup -1pt
const LW = 0.4; // picture lines (\thinlines)
const DIGIT_H = 0.644444; // the height of 1234567890 per pt of font size (cmr)
const SIZES: Record<string, any> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
// TeX's sizes of \} (cmsy, then cmex 12, 18, 24 and 30pt), its width at each, and the extensible one
const BRACES = [[10, 5], [12, 5.8333], [18, 6.6667], [24, 7.5], [30, 8.0556]], BRACE_EXT = 8.8889;
function brace(total: any) {
  // \left. \vrule height h/2 depth h/2 \right\}: y = 2·max(h/2 + axis) and TeX takes the first size ≥ max(.901y, y − 5pt)
  const y = 2 * (total / 2 + AXIS), need = Math.max(0.901 * y, y - 5);
  for (const [s, w] of BRACES) if (s >= need) return { w, size: s };
  return { w: BRACE_EXT, size: Math.max(need, total) };
}

// ---------------------------------------------------------------- reading
// the index after the group that opens at i ({…} or […]), honouring nesting and escapes
function closeAt(s: any, i: any) {
  const open = s[i], shut = open === '{' ? '}' : ']';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '%') { while (k < s.length && s[k] !== '\n') k++; continue; }
    if (open === '[' && c === '{') { k = closeAt(s, k) - 1; continue; }
    if (c === open) d++;
    else if (c === shut && --d === 0) return k + 1;
  }
  return -1;
}
// an optional […] at i (spaces first): [value, next] or [null, i]
function opt(s: any, i: any) {
  const j = skipWs(s, i);
  if (s[j] !== '[') return [null, i];
  const e = closeAt(s, j);
  return e < 0 ? [null, i] : [s.slice(j + 1, e - 1), e];
}
// a mandatory argument at i: a {…} group, a control sequence or one character
function arg(s: any, i: any) {
  const j = skipWs(s, i);
  if (j >= s.length) return [null, i];
  if (s[j] === '{') { const e = closeAt(s, j); return e < 0 ? [s.slice(j + 1), s.length] : [s.slice(j + 1, e - 1), e]; }
  if (s[j] === '\\') { const m = /^\\([A-Za-z@]+|.)/.exec(s.slice(j)); return [m![0], j + m![0].length]; }
  return [s[j], j + 1];
}
// a keyval list: [{ k, v, raw }]
function keyvals(str: any) {
  const out: any[] = [];
  if (!str) return out;
  let d = 0, cur = '';
  const push = () => { const t = cur.trim(); cur = ''; if (!t) return; const e = t.indexOf('='); out.push(e < 0 ? { k: t, v: null, raw: t } : { k: t.slice(0, e).trim(), v: unbrace(t.slice(e + 1).trim()), raw: t }); };
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\') { cur += c + (str[i + 1] || ''); i++; continue; }
    if (c === '{') d++;
    if (c === '}') d--;
    if (c === ',' && d === 0) { push(); continue; }
    cur += c;
  }
  push();
  return out;
}

const BOX = new Set(['bitbox', 'bitboxes', 'wordbox']);
// src → { pre, head: { opts, bits, src }, items, tail, post, warnings }
// An item is { k, src, pre, … }: pre is the space, & and comments before it; src its text as written.
function parse(src: any) {
  src = String(src || '');
  const warnings = [];
  const b = /\\begin\s*\{bytefield\}/.exec(src);
  let pre = '', head = { opts: null, bits: '32', src: '' }, body, post = '';
  if (b) {
    pre = src.slice(0, b.index);
    let i = b.index + b[0].length;
    const [o, i1] = opt(src, i);
    const [n, i2] = arg(src, i1);
    head = { opts: o, bits: n != null ? n.trim() : '32', src: src.slice(b.index, i2) };
    const e = src.indexOf('\\end{bytefield}', i2);
    body = src.slice(i2, e < 0 ? src.length : e);
    post = e < 0 ? '' : src.slice(e + '\\end{bytefield}'.length);
    if (e < 0) warnings.push('No \\end{bytefield}');
  } else {
    body = src;
    if (src.trim()) warnings.push('No \\begin{bytefield}: the code is read as its body');
  }
  const items: any[] = [];
  let i = 0;
  while (i < body.length) {
    // what goes before an item: spaces, & (a space inside bytefield) and comments
    const s0 = i;
    for (;;) {
      if (i < body.length && /[\s&]/.test(body[i])) { i++; continue; }
      if (body[i] === '%') { while (i < body.length && body[i] !== '\n') i++; continue; }
      break;
    }
    const sep = body.slice(s0, i);
    if (i >= body.length) { (items as any).tail = sep; break; }
    const at = i;
    const it: any = readItem(body, i, warnings);
    it.pre = sep; it.src = body.slice(at, it.end); delete it.end;
    i = at + it.src.length;
    items.push(it);
  }
  const tail = (items as any).tail || '';
  delete (items as any).tail;
  return { pre, head, items, tail, post, warnings, hasEnv: !!b };
}
function readItem(s: any, i: any, warnings: any) {
  if (s.startsWith('\\\\', i)) {
    let j = i + 2;
    if (s[j] === '*') j++;
    const [l, e] = opt(s, j);
    return { k: 'br', len: l, end: l != null ? e : j };
  }
  const m = /^\\([A-Za-z@]+)(\*?)/.exec(s.slice(i));
  if (!m) {
    // plain text: up to the next command or space
    let j = i; while (j < s.length && !/[\s\\&%]/.test(s[j])) j++;
    return { k: 'raw', end: Math.max(j, i + 1) };
  }
  const name = m[1], star = !!m[2];
  let j = i + m[0].length;
  if (BOX.has(name)) {
    const [sides, j1] = opt(s, name === 'bitboxes' && star ? j : j);
    const [w, j2] = arg(s, j1);
    const [o, j3] = opt(s, j2);
    const [text, j4] = arg(s, j3);
    if (w == null || text == null) warnings.push(`\\${name} needs two arguments`);
    return { k: name, star, sides, w: w == null ? '1' : w.trim(), opts: o, text: text == null ? '' : text, end: j4 };
  }
  if (name === 'bitheader') {
    const [o, j1] = opt(s, j);
    const [spec, j2] = arg(s, j1);
    return { k: 'bitheader', opts: o, spec: spec == null ? '' : spec.trim(), end: j2 };
  }
  if (name === 'skippedwords') { const [l, e] = opt(s, j); return { k: 'skip', len: l, end: e }; }
  if (name === 'bytefieldsetup') { const [o, e] = arg(s, j); return { k: 'setup', opts: o || '', end: e }; }
  if (name === 'begin' || name === 'end') {
    const [env, j1] = arg(s, j);
    const side = env === 'rightwordgroup' ? 'r' : env === 'leftwordgroup' ? 'l' : null;
    if (side && name === 'begin') {
      const [o, j2] = opt(s, j1);
      const [text, j3] = arg(s, j2);
      return { k: 'gbeg', side, opts: o, text: text == null ? '' : text, end: j3 };
    }
    if (side) return { k: 'gend', side, end: j1 };
    // another environment: kept whole
    if (name === 'begin' && env) {
      const e = s.indexOf(`\\end{${env}}`, j1);
      return { k: 'raw', end: e < 0 ? s.length : e + env.length + 6 };
    }
    return { k: 'raw', end: j1 };
  }
  // version 1's \wordgroupr{text} … \endwordgroupr (only with [compat1]): read as the v2 environments
  if (name === 'wordgroupr' || name === 'wordgroupl') {
    const [text, e] = arg(s, j);
    warnings.push(`\\${name} is bytefield version 1: it is written as \\begin{${name === 'wordgroupr' ? 'right' : 'left'}wordgroup} once edited`);
    return { k: 'gbeg', side: name.slice(-1), opts: null, text: text || '', v1: true, end: e };
  }
  if (name === 'endwordgroupr' || name === 'endwordgroupl') return { k: 'gend', side: name.slice(-1), v1: true, end: j };
  // anything else: the command with its arguments, kept as written
  for (;;) {
    const k = skipWs(s, j);
    if (s[k] === '{' || s[k] === '[') { const e = closeAt(s, k); if (e < 0) break; j = e; continue; }
    break;
  }
  return { k: 'raw', end: j };
}

// ---------------------------------------------------------------- writing
const brOf = (it: any) => (it.len != null ? `\\\\[${it.len}]` : '\\\\');
const sidesOf = (it: any) => (it.sides != null && it.sides !== 'lrtb' ? `[${it.sides}]` : '');
function fmt(it: any) {
  switch (it.k) {
    case 'br': return brOf(it);
    case 'bitbox': case 'wordbox': return `\\${it.k}${sidesOf(it)}{${it.w}}${it.opts ? `[${it.opts}]` : ''}{${it.text}}`;
    case 'bitboxes': return `\\bitboxes${it.star ? '*' : ''}${sidesOf(it)}{${it.w}}${it.opts ? `[${it.opts}]` : ''}{${it.text}}`;
    case 'bitheader': return `\\bitheader${it.opts ? `[${it.opts}]` : ''}{${it.spec}}`;
    case 'skip': return `\\skippedwords${it.len != null ? `[${it.len}]` : ''}`;
    case 'setup': return `\\bytefieldsetup{${it.opts}}`;
    case 'gbeg': return `\\begin{${it.side === 'r' ? 'right' : 'left'}wordgroup}${it.opts ? `[${it.opts}]` : ''}{${it.text}}`;
    case 'gend': return `\\end{${it.side === 'r' ? 'right' : 'left'}wordgroup}`;
    default: return it.src || '';
  }
}
// v1 group commands only work with [compat1], so once anything is edited they become environments
function write(M: any) {
  const v1 = M.items.some((it: any) => it.v1);
  const head = M.head.dirty || !M.head.src || v1 ? `\\begin{bytefield}${M.head.opts ? `[${M.head.opts}]` : ''}{${M.head.bits}}` : M.head.src;
  let out = M.pre + head;
  for (const it of M.items) out += it.pre + (it.dirty || it.src == null || (v1 && (it.k === 'gbeg' || it.k === 'gend')) ? fmt(it) : it.src);
  return out + (M.tail || (M.items.length ? '\n' : '')) + '\\end{bytefield}' + (M.post || '');
}
// the env options as a keyval string with key set to val (null removes it)
function setKey(str: any, key: any, val: any) {
  const l = keyvals(str).filter((x) => x.k !== key).map((x) => x.raw);
  if (val != null && val !== '') l.push(`${key}=${/[,=]/.test(val) ? `{${val}}` : val}`);
  return l.join(', ') || null;
}
const getKey = (str: any, key: any) => { const l = keyvals(str).filter((x) => x.k === key); return l.length ? l[l.length - 1].v : null; };

// ---------------------------------------------------------------- settings
// a length → pt (null when unreadable)
const UNITS: Record<string, any> = { pt: 1, bp: 72.27 / 72, mm: 2.84528, cm: 28.4528, in: 72.27, pc: 12, dd: 1.07, cc: 12.84, sp: 1 / 65536, em: EM, ex: EX };
const REGS: Record<string, any> = { baselineskip: 12, linewidth: 345, textwidth: 345, columnwidth: 345, hsize: 345, parindent: 15, fboxsep: 3, tabcolsep: 6 };
function len(t: any, ctx?: any) : any {
  t = unbrace(String(t == null ? '' : t)).replace(/\s+/g, '');
  if (!t) return null;
  let m = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z]{2})$/i.exec(t);
  if (m && UNITS[m[2].toLowerCase()]) return +m[1] * UNITS[m[2].toLowerCase()];
  m = /^([+-]?(?:\d+\.?\d*|\.\d+))?\\([A-Za-z@]+)$/.exec(t);
  if (m && REGS[m[2]] != null) return (m[1] == null ? 1 : +m[1]) * REGS[m[2]];
  if (m && /^bf@bitwidth|bitwidth$/.test(m[2]) && ctx) return (m[1] == null ? 1 : +m[1]) * ctx.bw;
  m = /^\\(widthof|heightof|depthof|totalheightof)\{([\s\S]*)\}$/.exec(t);
  if (m) {
    const b: any = TD.textBox(shown(m[2]), { size: EM * PT, font: 'default' });
    return m[1] === 'widthof' ? (b.w - 2) * K : m[1] === 'depthof' ? 0.2 * EM : 0.7 * EM;
  }
  return null;
}
// a formatting string (\small\bfseries, \centering\itshape, or a one-argument command like \textbf)
function style(str: any, base: any) {
  const st = { size: base, bold: false, italic: false, font: 'default', align: 'center', color: (null as any) };
  const t = String(str || '');
  for (const m of t.matchAll(/\\([A-Za-z]+)\s*(?:\{([^{}]*)\})?/g)) {
    const c = m[1];
    if (SIZES[c]) st.size = SIZES[c];
    else if (/^(bfseries|bf|textbf)$/.test(c)) st.bold = true;
    else if (/^(itshape|it|slshape|sl|em|emph|textit|textsl)$/.test(c)) st.italic = true;
    else if (/^(ttfamily|tt|texttt)$/.test(c)) st.font = 'cmtt';
    else if (/^(sffamily|sf|textsf)$/.test(c)) st.font = 'cmss';
    else if (c === 'centering') st.align = 'center';
    else if (c === 'raggedright') st.align = 'left';
    else if (c === 'raggedleft') st.align = 'right';
    else if (c === 'color' && m[2]) st.color = m[2];
  }
  return st;
}
const DEFAULTS = () => ({
  bw: BITWIDTH, bh: 4 * EX, bitfmt: '\\tiny', boxfmt: '\\centering', endian: 'l', lsb: 0, bg: null, perword: null,
  lcurly: '\\{', rcurly: '\\}', lcspace: EX, rcspace: EX, llspace: 0.5 * EX, rlspace: 0.5 * EX, lshrink: 5, rshrink: 5,
});
// apply a keyval list to settings c (warnings for keys bytefield doesn't have)
function apply(c: any, str: any, warn: any) {
  for (const { k, v } of keyvals(str)) {
    const L = (x: any) => { const n = len(x, c); if (n == null && warn) warn(`Can't read the length ${k}=${x}`); return n; };
    switch (k) {
      case 'bitwidth': if (v === 'auto') { c.bw = BITWIDTH * (style(c.bitfmt, 5).size / 5); } else { const n = L(v); if (n != null) c.bw = n; } break;
      case 'bitheight': { const n = L(v); if (n != null) c.bh = n; break; }
      case 'bitformatting': c.bitfmt = v || ''; break;
      case 'boxformatting': c.boxfmt = v || ''; break;
      case 'endianness': if (v === 'little' || v === 'big') c.endian = v[0]; else if (warn) warn(`endianness must be little or big, not ${v}`); break;
      case 'lsb': c.lsb = parseInt(v, 10) || 0; break;
      case 'bgcolor': c.bg = v; break;
      case 'perword': c.perword = v; break;
      case 'leftcurly': c.lcurly = v; break;
      case 'rightcurly': c.rcurly = v; break;
      case 'curlyspace': { const n = L(v); if (n != null) c.lcspace = c.rcspace = n; break; }
      case 'leftcurlyspace': { const n = L(v); if (n != null) c.lcspace = n; break; }
      case 'rightcurlyspace': { const n = L(v); if (n != null) c.rcspace = n; break; }
      case 'labelspace': { const n = L(v); if (n != null) c.llspace = c.rlspace = n; break; }
      case 'leftlabelspace': { const n = L(v); if (n != null) c.llspace = n; break; }
      case 'rightlabelspace': { const n = L(v); if (n != null) c.rlspace = n; break; }
      case 'curlyshrinkage': { const n = L(v); if (n != null) c.lshrink = c.rshrink = n; break; }
      case 'leftcurlyshrinkage': { const n = L(v); if (n != null) c.lshrink = n; break; }
      case 'rightcurlyshrinkage': { const n = L(v); if (n != null) c.rshrink = n; break; }
      case 'curlystyle': case 'leftcurlystyle': case 'rightcurlystyle': break;
      case 'l': c.endian = 'l'; break; // \bitheader[l] / [b], deprecated
      case 'b': c.endian = 'b'; break;
      default: if (warn) warn(`bytefield has no key ${k}`);
    }
  }
  return c;
}
// settings for the whole field: \bytefieldsetup before the environment, then the environment's options
function settings(M: any, warn: any) {
  const c = DEFAULTS();
  for (const m of M.pre.replace(/(^|[^\\])%.*$/gm, '$1').matchAll(/\\bytefieldsetup\s*\{/g)) {
    const e = closeAt(M.pre, m.index + m[0].length - 1);
    if (e > 0) apply(c, M.pre.slice(m.index + m[0].length, e - 1), warn);
  }
  return apply(c, M.head.opts, warn);
}
const bitsOf = (M: any) => { const n = parseInt(M.head.bits, 10); return n > 0 ? n : 32; };
// the numbers \bitheader prints: '0-7,12' → [0…7, 12]
function headerNums(spec: any) {
  const out = [];
  for (const p of String(spec || '').split(',')) {
    const m = /^\s*(-?\d+)\s*(?:-\s*(-?\d+))?\s*$/.exec(p);
    if (!m) continue;
    const a = +m[1], b = m[2] != null ? +m[2] : a;
    for (let v = a; v <= b && out.length < 4096; v++) out.push(v);
  }
  return out;
}
// \bitboxes' argument: one box per token (a character, a {group} or a command)
function tokens(t: any) {
  const out = [];
  t = String(t || '');
  for (let i = 0; i < t.length;) {
    if (/\s/.test(t[i])) { i++; continue; }
    if (t[i] === '{') { const e = closeAt(t, i); out.push(t.slice(i + 1, e < 0 ? t.length : e - 1)); i = e < 0 ? t.length : e; continue; }
    if (t[i] === '\\') { const m = /^\\([A-Za-z@]+|.)/.exec(t.slice(i)); out.push(m![0]); i += m![0].length; continue; }
    out.push(t[i]); i++;
  }
  return out;
}
// the sides a box draws: its [lrtb] letters (T B L R turn one off)
function sides(spec: any) {
  const o: Record<string, any> = { l: false, r: false, t: false, b: false };
  for (const ch of String(spec == null ? 'lrtb' : spec)) {
    if ('lrtb'.includes(ch)) o[ch] = true;
    else if ('LRTB'.includes(ch)) o[ch.toLowerCase()] = false;
  }
  return o;
}
// a label wrapped whole in \parbox, a tabular or \shortstack, as TeX sets it: { body, align, tw (pt, a fixed
// width), padL, padR (pt, a tabular's \tabcolsep) }. Anything else is its own body, left-aligned.
function labelForm(text: any) : any {
  let t = String(text || '').trim(), align = null, tw = null, padL = 0, padR = 0;
  for (let guard = 0; guard < 4; guard++) {
    let m, i;
    if ((m = /^\\parbox(?![A-Za-z@])/.exec(t))) {
      i = m[0].length;
      for (;;) { const [o, j] = opt(t, i); if (o == null) break; i = j; } // [pos][height][inner pos]
      const [w, j] = arg(t, i), [body, k] = arg(t, j);
      if (body == null || t.slice(k).trim()) break;
      tw = len(w); t = body.trim(); align = null; padL = padR = 0;
    } else if ((m = /^\\shortstack(?![A-Za-z@])/.exec(t))) {
      const [pos, j] = opt(t, m[0].length), [body, k] = arg(t, j);
      if (body == null || t.slice(k).trim()) break;
      t = body.trim(); align = pos === 'l' ? 'left' : pos === 'r' ? 'right' : 'center'; tw = null; padL = padR = 0;
    } else if ((m = /^\\begin\s*\{tabular\}/.exec(t)) && /\\end\s*\{tabular\}$/.test(t)) {
      const [, j] = opt(t, m[0].length), [spec, k] = arg(t, j);
      if (spec == null) break;
      const body = t.slice(k, t.search(/\\end\s*\{tabular\}$/));
      // the first column's type and the padding at each end (@{…} replaces \tabcolsep)
      const sp = spec.replace(/\s+/g, ''), cols = sp.replace(/[@!<>]\{[^}]*\}/g, '').replace(/\|/g, '');
      padL = /^\|*@/.test(sp) ? 0 : REGS.tabcolsep; padR = /@\{[^}]*\}\|*$/.test(sp) ? 0 : REGS.tabcolsep;
      const c = cols[0];
      if (c === 'p' || c === 'm' || c === 'b') { const w = /^[pmb]\{([^}]*)\}/.exec(cols); tw = w ? len(w[1]) : null; align = null; } else { tw = null; align = c === 'r' ? 'right' : c === 'c' ? 'center' : 'left'; }
      t = body.replace(/\\(hline|toprule|midrule|bottomrule)\b\s*/g, '').replace(/\s*(?<!\\)&\s*/g, ' ').trim(); // cells side by side
    } else break;
  }
  // inside a box of a fixed width, the paragraph's own alignment
  if (tw != null && !align) align = /\\centering\b/.test(t) ? 'center' : /\\raggedleft\b/.test(t) ? 'right' : 'left';
  return { body: t, align: align || 'left', tw, padL, padR };
}
// text as the canvas shows it: $…$ maths and prose; \\ breaks the line
const shown = (t: any) => labelForm(t).body.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$').replace(/\s*\\\\(\[[^\]]*\])?\s*/g, '\n')
  .replace(/\\(centering|raggedright|raggedleft|noindent|strut|par)\b\s*/g, '').trim();
// a colour bytefield takes from xcolor
function colour(name: any) {
  if (!name) return null;
  const c = TD.tikzColor && TD.tikzColor(String(name).trim().replace(/^\{([^{}]*)\}$/, '$1')); // {rgb,255:red,…} comes braced
  return c || null;
}
// a box's text that is really a fill: \color{c}\rule{\width}{\height} (the manual's shaded boxes)
const RULE = /^\s*(?:\\color\s*\{([^}]*)\}\s*)?\\rule\s*\{\\width\}\s*\{\\height\}\s*$/;
// \rotatebox[…]{angle}{text}: drawn turned
const ROT = /^\s*\\rotatebox\s*(?:\[[^\]]*\])?\s*\{\s*(-?[\d.]+)\s*\}\s*\{([\s\S]*)\}\s*$/;

// ---------------------------------------------------------------- layout
const layout = layoutCache((s: any) => srcKey(s), (s: any) => build(s.src));

// Everything is worked out in pt with y up from each row's baseline, then turned into px with y down.
function build(src: any) {
  const M = parse(src);
  const warnings = M.warnings.slice();
  const warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const c0 = settings(M, warn), bits = bitsOf(M);
  if (!(parseInt(M.head.bits, 10) > 0)) warn(`The width {${M.head.bits}} is not a number of bits: drawn as 32`);
  const rows: any[] = [];
  let row: any = null, H = 0, pendingL = 0;
  const openR: any[] = [], openL: any[] = []; // word groups begun and not yet ended (they nest)
  let showR: any[] = [];
  const groups = [];
  const newRow = (brItem: any) => {
    row = { cfg: { ...c0 }, x: 0, h: 0, counted: false, els: [], lspace: pendingL, first: null, last: null, br: brItem, vspace: 0, labels: [] };
    pendingL = 0;
    rows.push(row);
  };
  newRow(null);
  const count = (h: any) => { if (!row.counted) { H += h; row.counted = true; } };
  M.items.forEach((it, ii) => {
    if (it.k === 'br') {
      if (showR.length) { row.labels.push(...showR); showR = []; }
      row.vspace = it.len != null ? len(it.len, row.cfg) || 0 : 0;
      row.brI = ii;
      newRow(ii);
      // a left group's room appears in the row after the \\ that follows its start
      for (const g of openL) if (g.lspaceDue) { row.lspace = Math.max(row.lspace, g.lw); g.lspaceDue = false; }
      return;
    }
    if (it.k === 'setup') { apply(row.cfg, it.opts, warn); return; }
    if (it.k === 'gbeg') {
      const c = apply({ ...row.cfg }, it.opts, warn);
      if (it.side === 'r') openR.push({ side: 'r', beg: ii, start: H, text: it.text, c });
      else {
        const lb = labelBox(it.text);
        // its room is measured with a 5cm brace when it opens
        const bw = c.lcurly === '.' ? NULLDELIM : BRACE_EXT + NULLDELIM;
        openL.push({ side: 'l', beg: ii, start: H, text: it.text, c, lw: c.lcspace + bw + c.llspace + lb.w, lspaceDue: true });
      }
      return;
    }
    if (it.k === 'gend') {
      const g = (it.side === 'r' ? openR : openL).pop();
      if (!g) { warn(`\\end{${it.side === 'r' ? 'right' : 'left'}wordgroup} without its \\begin`); return; }
      g.end = ii; g.h = H - g.start;
      if (it.side === 'r') showR.push(g); else { g.row = row; g.atX = row.x; row.labels.push(g); }
      groups.push(g);
      return;
    }
    if (it.k === 'raw') { if (/\S/.test(it.src) && !/^\\(relax|noindent|par|ignorespaces|color\b|bfseries|itshape|small|tiny|footnotesize|scriptsize|normalsize|large|centering)/.test(it.src)) warn(`Not drawn: ${it.src.length > 40 ? it.src.slice(0, 40) + '…' : it.src}`); return; }
    const c = row.cfg;
    if (it.k === 'bitheader') {
      const hc = apply({ ...c }, it.opts, warn);
      const st = style(hc.bitfmt, 5), tall = DIGIT_H * st.size;
      const w = hc.bw * bits, nums = headerNums(it.spec);
      if (!nums.length && it.spec.trim()) warn(`Can't read the bit numbers {${it.spec}}`);
      const digits = nums.map((v) => ({ v, x: hc.endian === 'b' ? hc.bw * (bits - v + hc.lsb - 1) : hc.bw * (v - hc.lsb) }));
      row.els.push({ k: 'head', ii, x: row.x, w, h: tall, digits, bw: hc.bw, st });
      row.x += w; row.h = Math.max(row.h, tall); count(tall);
    } else if (it.k === 'skip') {
      const w = c.bw * bits, high = w / 6, tall = (it.len != null ? len(it.len, c) || 2 * EX : 2 * EX) + high;
      row.els.push({ k: 'skip', ii, x: row.x, w, h: tall, high });
      row.x += w; row.h = Math.max(row.h, tall); count(tall);
    } else if (BOX.has(it.k)) {
      const bc = apply({ ...c }, it.opts, warn);
      const n = parseFloat(it.w);
      if (!(n >= 0)) warn(`\\${it.k}{${it.w}}: not a number`);
      const N = n >= 0 ? n : 1;
      const fmtSt = style(bc.boxfmt, EM);
      const parts = it.k === 'bitboxes' ? tokens(it.text) : [it.text];
      const S = sides(it.sides);
      parts.forEach((t, k) => {
        let sd = S;
        if (it.k === 'bitboxes' && it.star && parts.length > 1) sd = { ...S, r: k === parts.length - 1 ? S.r : false, l: k === 0 ? S.l : false };
        const w = it.k === 'wordbox' ? bc.bw * bits : bc.bw * N, h = it.k === 'wordbox' ? bc.bh * N : bc.bh;
        let text = t, fill = bc.bg, rot = 0;
        const rm = RULE.exec(t);
        if (rm) { fill = rm[1] || 'black'; text = ''; }
        const ro = ROT.exec(text);
        if (ro) { rot = +ro[1]; text = ro[2]; }
        row.els.push({ k: 'box', ii, sub: it.k === 'bitboxes' ? k : null, x: row.x, w, h, sides: sd, fill, text, rot, st: fmtSt });
        row.x += w; row.h = Math.max(row.h, h); count(h);
      });
      if (bc.perword) warn('perword is not drawn');
    }
    if (row.first == null) row.first = ii;
    row.last = ii;
  });
  row.labels.push(...showR);
  if (openR.length || openL.length) warn(`A ${openR.length ? 'right' : 'left'}wordgroup is never ended`);

  // the columns of bytefield's \halign: left room, the boxes, the right labels
  const col1 = Math.max(0, ...rows.map((r) => r.lspace));
  const col2 = Math.max(0, ...rows.map((r) => r.x));
  const rTotal = (g: any) => {
    const lb = labelBox(g.text), curly = g.c.rcurly === '.' ? 0 : brace(Math.max(0, g.h - g.c.rshrink)).w;
    return g.c.rcspace + curly + NULLDELIM + g.c.rlspace + lb.w;
  };
  const col3 = Math.max(0, ...rows.flatMap((r) => r.labels.filter((g: any) => g.side === 'r').map(rTotal)));
  // rows down the page: TeX's interline glue between rows of depth 0
  let y = 0;
  rows.forEach((r, k) => {
    if (k) {
      const g = BASELINE - r.h;
      y += g < LIMIT ? LINESKIP : g;
    }
    r.top = y; y += r.h; r.base = y;
    y += r.vspace;
  });
  const totalH = rows.length ? rows[rows.length - 1].base : 0;

  // drawing, in px with y down; the TeX box is (0,0)–(W,H)
  const P = (v: any) => v * PT;
  const lines: any[] = [], fills: any[] = [], texts: any[] = [], boxes: any[] = [], marks: any[] = [], gshapes: any[] = [];
  let x1 = 0, y1 = 0, x2 = P(col1 + col2 + col3), y2 = P(totalH);
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  const seg = (ax: any, ay: any, bx: any, by: any) => { lines.push(`M${r2(P(ax))},${r2(P(ay))}L${r2(P(bx))},${r2(P(by))}`); ext(P(Math.min(ax, bx)) - 0.3, P(Math.min(ay, by)) - 0.3, P(Math.max(ax, bx)) + 0.3, P(Math.max(ay, by)) + 0.3); };
  rows.forEach((r, ri) => {
    const ox = col1;
    for (const e of r.els) {
      const X = ox + e.x, top = r.base - e.h, bot = r.base;
      if (e.k === 'box') {
        if (e.fill) fills.push({ x: P(X), y: P(top), w: P(e.w), h: P(e.h), c: e.fill });
        if (e.sides.t) seg(X, top, X + e.w, top);
        if (e.sides.b) seg(X, bot, X + e.w, bot);
        if (e.sides.l) seg(X, top, X, bot);
        if (e.sides.r) seg(X + e.w, top, X + e.w, bot);
        if (e.text && e.text.trim()) {
          const t = shown(e.text);
          const st = { size: P(e.st.size), font: e.st.font, bold: e.st.bold, italic: e.st.italic, tw: e.rot ? 0 : Math.max(4, P(e.w)), align: e.st.align };
          texts.push({ t, st, x: P(X + e.w / 2), y: P(top + e.h / 2), rot: e.rot, color: e.st.color });
        }
        boxes.push({ ii: e.ii, sub: e.sub, row: ri, x: P(X), y: P(top), w: P(e.w), h: P(e.h), k: M.items[e.ii].k });
      } else if (e.k === 'skip') {
        const w = e.w, hi = e.high;
        seg(X, top, X + w, top + hi);
        seg(X + w, bot, X, bot - hi);
        seg(X, bot, X, bot - hi);
        seg(X + w, top, X + w, top + hi);
        boxes.push({ ii: e.ii, sub: null, row: ri, x: P(X), y: P(top), w: P(e.w), h: P(e.h), k: 'skip' });
      } else if (e.k === 'head') {
        // the numbers sit in a box as tall as they are, above the row's own box
        for (const d of e.digits) {
          const cx = X + d.x + e.bw / 2, cy = top - e.h / 2;
          const st = { size: P(e.st.size), font: e.st.font, bold: e.st.bold, italic: e.st.italic };
          texts.push({ t: String(d.v), st, x: P(cx), y: P(cy), head: true, color: e.st.color });
          const b = TD.textBox(String(d.v), st);
          ext(P(cx) - b.w / 2, P(cy) - b.h / 2, P(cx) + b.w / 2, P(cy) + b.h / 2);
          marks.push({ v: d.v, x: P(X + d.x), w: P(e.bw) });
        }
        boxes.push({ ii: e.ii, sub: null, row: ri, x: P(X), y: P(top - e.h), w: P(e.w), h: P(2 * e.h), k: 'bitheader' });
      }
    }
    // the word groups shown on this row
    for (const g of r.labels) {
      const lb = labelBox(g.text), h = Math.max(0, g.h);
      if (g.side === 'r') {
        const x0 = col1 + col2, curlyH = Math.max(0, h - g.c.rshrink);
        const bz = g.c.rcurly === '.' ? null : brace(curlyH);
        const bx = x0 + g.c.rcspace;
        if (bz) drawBrace(lines, bx + (NULLDELIM / 2), r.base - h / 2, bz, curlyH, 'r', g.c.rcurly, ext);
        const lx = bx + (bz ? bz.w : 0) + NULLDELIM + g.c.rlspace;
        texts.push({ t: lb.t, st: lb.st, x: P(lx + lb.dx), y: P(r.base - h / 2), label: true });
        ext(P(lx), P(r.base - h / 2) - lb.b.h / 2, P(lx + lb.w), P(r.base - h / 2) + lb.b.h / 2);
        gshapes.push({ side: 'r', beg: g.beg, end: g.end, x: P(x0), y: P(r.base - h), w: P(lx + lb.w - x0), h: P(h), lx: P(lx), cx: P(bx + ((bz ? bz.w : 0) + NULLDELIM) / 2), text: g.text });
      } else {
        const start = col1 + g.atX - g.lw - g.c.bw * bits;
        const curlyH = Math.max(0, h - g.c.lshrink);
        const bz = g.c.lcurly === '.' ? null : brace(curlyH);
        texts.push({ t: lb.t, st: lb.st, x: P(start + lb.dx), y: P(r.base - h / 2), label: true });
        ext(P(start), P(r.base - h / 2) - lb.b.h / 2, P(start + lb.w), P(r.base - h / 2) + lb.b.h / 2);
        const bx = start + lb.w + g.c.llspace;
        if (bz) drawBrace(lines, bx + NULLDELIM / 2, r.base - h / 2, bz, curlyH, 'l', g.c.lcurly, ext);
        gshapes.push({ side: 'l', beg: g.beg, end: g.end, x: P(start), y: P(r.base - h), w: P(bx + (bz ? bz.w : 0) + NULLDELIM - start), h: P(h), lx: P(start), cx: P(bx + ((bz ? bz.w : 0) + NULLDELIM) / 2), text: g.text });
      }
    }
  });
  const rowGeom = rows.map((r, i) => ({ i, top: P(r.top), base: P(r.base), h: P(r.h), x0: P(col1), x1: P(col1 + r.x), first: r.first, last: r.last, br: r.brI }));
  const bb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  if (!(bb.w > 0 && bb.h > 0)) { bb.w = Math.max(bb.w, 2 * TD.PX_PER_CM); bb.h = Math.max(bb.h, 0.5 * TD.PX_PER_CM); }
  return {
    M, cfg: c0, bits, lines, fills, texts, boxes, marks, groups: gshapes, rows: rowGeom, warnings, empty: false,
    bb, tbox: { x: 0, y: 0, w: P(col1 + col2 + col3), h: P(totalH) }, cols: [P(col1), P(col2), P(col3)],
    pt: { w: col1 + col2 + col3, h: totalH },
  };
}
// a word group's label: the package sets it in \begin{tabular}[b]{@{}l@{}}, so \\ breaks it, left-aligned;
// a \parbox, tabular or \shortstack round it gives its own width and alignment. w: its width in pt; dx: where
// the text's centre is, in pt from the label's left edge
function labelBox(text: any) {
  const f = labelForm(text), t = shown(text);
  const st: Record<string, any> = { size: EM * PT, font: 'default', align: f.align };
  if (f.tw != null) st.tw = f.tw * PT;
  const b = TD.textBox(t, st);
  const inner = f.tw != null ? f.tw : t ? Math.max(0, b.w - 2) * K : 0;
  const w = t || f.tw != null ? inner + f.padL + f.padR : 0;
  return { t, st, b, w, dx: f.padL + inner / 2 };
}
// a brace (or bracket) of the size TeX picked, centred on y (pt), opening to the side: 'r' points right
function drawBrace(lines: any, x: any, yc: any, bz: any, want: any, side: any, kind: any, ext: any) {
  const P = (v: any) => v * PT;
  const h = Math.max(bz.size, want), w = bz.w, t = yc - h / 2, b = yc + h / 2;
  const dir = side === 'r' ? 1 : -1, x0 = side === 'r' ? x : x + w, xm = x0 + dir * w;
  let d;
  if (/^\\?[\[\]]$|^\\?l?[rl]?brack$/.test(kind)) {
    // a square bracket
    d = `M${r2(P(x0))},${r2(P(t))}H${r2(P(x0 + dir * w * 0.5))}V${r2(P(b))}H${r2(P(x0))}`;
  } else {
    // a curly brace: two halves meeting at a point in the middle
    const q = w * 0.5;
    d = `M${r2(P(x0))},${r2(P(t))}C${r2(P(x0 + dir * q))},${r2(P(t))} ${r2(P(x0 + dir * q))},${r2(P(t + 1.2))} ${r2(P(x0 + dir * q))},${r2(P(t + 3))}`
      + `L${r2(P(x0 + dir * q))},${r2(P(yc - 3))}C${r2(P(x0 + dir * q))},${r2(P(yc - 1))} ${r2(P(xm))},${r2(P(yc))} ${r2(P(xm))},${r2(P(yc))}`
      + `C${r2(P(xm))},${r2(P(yc))} ${r2(P(x0 + dir * q))},${r2(P(yc + 1))} ${r2(P(x0 + dir * q))},${r2(P(yc + 3))}`
      + `L${r2(P(x0 + dir * q))},${r2(P(b - 3))}C${r2(P(x0 + dir * q))},${r2(P(b - 1.2))} ${r2(P(x0 + dir * q))},${r2(P(b))} ${r2(P(x0))},${r2(P(b))}`;
  }
  lines.push({ d, brace: true });
  ext(P(Math.min(x0, xm)), P(t), P(Math.max(x0, xm)), P(b));
}

// ---------------------------------------------------------------- drawing
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const color = s.color || '#000000', ink = TD.css(color);
  let out = '';
  for (const f of Lo.fills) out += `<rect x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(f.h)}" fill="${TD.css(colour(f.c) || '#cccccc')}"/>`;
  const sw = r2(ctx.export && !ctx.editor ? LW * PT : Math.max(LW * PT, ctx.editor ? 0.3 * PT : 0.5));
  const straight = Lo.lines.filter((l: any) => typeof l === 'string').join('');
  if (straight) out += `<path d="${straight}" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="square"/>`;
  for (const l of Lo.lines) if (typeof l !== 'string') out += `<path d="${l.d}" fill="none" stroke="${ink}" stroke-width="${r2(0.5 * PT)}" stroke-linejoin="round"/>`;
  for (const t of Lo.texts) {
    const c = t.color ? colour(t.color) || color : color;
    const svg = TD.textSvg(t.t, t.st, c, t.x, t.y, ctx);
    out += t.rot ? `<g transform="rotate(${-t.rot} ${r2(t.x)} ${r2(t.y)})">${svg}</g>` : svg;
  }
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\s*\{bytefield\}/.test(t) ? t : `\\begin{bytefield}{32}\n${t}\n\\end{bytefield}`;
}
// the code to export: version 1 group commands only compile with [compat1], so they go out as environments
const exportCode = (src: any) => { const t = fullCode(src); return /\\(end)?wordgroup[rl]\b/.test(t) ? write(parse(t)) : t; };

TD.TYPES.bytefield = {
  name: 'Bit field',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'bytefield', x: p.x, y: p.y, src: TD.BYTEFIELD_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the environment is a box of its own; the node sits at the centre of TeX's box (the bit numbers and a
  // left group's label may stick out of it, as they do in the document)
  tikz(s: any, X: any) {
    X.pkgs.add('bytefield');
    const L = layout(s), b = L.bb, t = L.tbox;
    const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    const cx = s.x - b.x + t.x + t.w / 2, cy = s.y - b.y + t.y + t.h / 2;
    return `\\node[inner sep=0pt${col ? `, text=${col}` : ''}] at ${X.c(cx, cy)} {\\pgfinterruptpicture${col ? `\\color{${col}}` : ''}%\n${exportCode(s.src)}%\n\\endpgfinterruptpicture};`;
  },
};

const summary = (L: any) => {
  const n = L.boxes.filter((b: any) => b.k === 'bitbox' || b.k === 'bitboxes' || b.k === 'wordbox').length, g = L.groups.length;
  return `${L.bits} bits · ${n} field${n === 1 ? '' : 's'}${g ? ` · ${g} group${g === 1 ? '' : 's'}` : ''}`;
};

// for the visual editor (js/bfeditor.ts) and the tests
TD.bytefield = { parse, write, fmt, layout, draw, fullCode, exportCode, keyvals, setKey, getKey, settings, len, style, sides, tokens, headerNums, colour, shown, summary, brace, bitsOf, BITWIDTH, EM, EX };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("bytefield", {
  menu: { order: 11, group: 'electronics', label: "Bit field", title: "Bit field: packet headers and register layouts, written for bytefield", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M3 9h26v12H3zM10 9v12M15 9v12M22 9v12\"/><path d=\"M3 5.5v1M10 5.5v1M15 5.5v1M22 5.5v1M29 5.5v1\" class=\"a1\"/></svg>" },
  nodeImport: { re: /(?:\\bytefieldsetup\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*)*\\begin\{bytefield\}[\s\S]*\\end\{bytefield\}/, order: 6, dedent: true, place: (q: any, at: any) => { const L = TD.bytefield.layout(q), b = L.bb, t = L.tbox; q.x = at.x - (t.x - b.x + t.w / 2); q.y = at.y - (t.y - b.y + t.h / 2); } },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.bytefieldEditor, alias: "bytefieldOpen", layout: (s) => TD.bytefield.layout(s), keepEmptyBounds: true }
});
export { layout, summary, exportCode };
