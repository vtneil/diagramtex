import { measurementElement } from './measurement';
import { runtime as TD } from '../runtime';
import { unbrace } from './tex-groups';
import { layoutCache, srcKey } from './layout-cache';
import { groupEnd as close, skipSpace as skipWs } from '../core/tex-scan';
// Chemistry with the chemfig package: structural formulas (\chemfig{…}) and reaction schemes
// (\schemestart … \schemestop). The source is the object. It is read into a tree that keeps every piece as
// written, laid out here by chemfig's own rules (read from chemfig.tex 1.6: atom sep 3em, bond offset 2pt,
// double bond sep 2pt, cram width 1.5ex, rings turning 360/n from -90+180/n, departure and arrival atoms
// by the bond's angle, compound sep 5em, arrow offset 1em), drawn as vectors, and exported unchanged in a
// node at the drawing's top left. The visual editor (js/cfeditor.ts) edits the tree and writes it back.
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K;
// the font size: \scriptsize… in the code sets it for the whole drawing; em and ex follow it, pt doesn't
let EM = 10 * PT, EX = 4.3056 * PT;
const LW = 0.4 * PT;
let TEXT = { size: 10 * PT, font: 'default' };
// em and ex are the font's own (Computer Modern's quad and x-height at each size, measured with pdfLaTeX): a smaller
// design is wider for its size, so \scriptsize's em is 7.97pt, not 7
const QUAD: Record<number, [number, number]> = { 5: [6.80565, 2.15277], 7: [7.97224, 3.01389], 8: [8.50012, 3.44444], 9: [9.24994, 3.87498], 10: [10, 4.30554],
  12: [11.74988, 5.16667], 14.4: [14.09984, 6.2], 17.28: [15.84985, 7.43889], 20.74: [19.0235, 8.92839], 24.88: [22.82086, 10.71062] };
const setSize = (pt: number) => { const q = QUAD[pt] || [pt, 0.43056 * pt]; EM = q[0] * PT; EX = q[1] * PT; TEXT = { size: pt * PT, font: 'default' }; };
// \setcharge{…} (and \charge[…]'s own): .radius of a dot, :sep between a pair's dots, the "length and "width of a
// bar, extra sep round the atom, overlay
const CHARGE = () => ({ r: 0.15 * EX, sep: 0.3 * EM, len: 1.5 * EX, wid: 0.3 * EX, extra: 1.5 * PT, overlay: true });
function applyCharge(C: any, kv: any, warn: any) {
  for (const [k, v] of Object.entries<any>(kv || {})) {
    if (k === '.radius') C.r = len(v, C.r);
    else if (k === ':sep') C.sep = len(v, C.sep);
    else if (k === '"length') C.len = len(v, C.len);
    else if (k === '"width') C.wid = len(v, C.wid);
    else if (k === 'extra sep') C.extra = len(v, C.extra);
    else if (k === 'overlay') C.overlay = v !== 'false';
    else if (['debug', 'shortcuts', 'lewisautorot', 'macro atom', 'macro charge'].includes(k)) { /* nothing to draw */ }
    else if (warn) warn(`The charge setting "${k}" isn't drawn here (it is kept in the code)`);
  }
  return C;
}
const defaults = () => ({ charge: CHARGE(), sep: 3 * EM, boff: 2 * PT, dsep: 2 * PT, cram: 1.5 * EX, dashOn: 1 * PT, dashOff: 2 * PT, inc: 45, csep: 5 * EM, aoff: 1 * EM, acoeff: 1, aangle: 0, lsep: 3 * PT, hminw: 3 * EM, lxsep: 3 * PT, hsep: 0.5 * EM, fixed: false, plusV: 0, crc: 0.75, cramRect: false, ahead: 'CF', astyle: '', bondStyle: '', plusL: 0.5 * EM, plusR: 0.5 * EM, nameSep: 1.5 * EX, ascale: 1, acolor: null as any, cscale: 1, lw: LW });
const DEF = defaults();

TD.CHEM_DEFAULT = '\\chemfig{H_3C-C(=[1]O)-[7]OH}';

// ---------------------------------------------------------------- reading
function split(s: any, sep = ',') {
  const out = [];
  // brackets inside braces ({[}) are text, not nesting
  let b = 0, k = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (c === '{') b++; else if (c === '}') b--;
    else if (!b && c === '[') k++; else if (!b && c === ']') k--;
    if (c === sep && !b && !k) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
// An arrow's label of several lines. chemfig sets a label in a plain TikZ node, where \\ doesn't break the
// line, so the editor writes the lines in a one-column tabular (\shortstack is read too); a label written
// with line breaks in the text (older drawings) is read as lines as well.
const TABULAR = /^\\begin\s*\{tabular\}\s*\{@\{\}c@\{\}\}([\s\S]*)\\end\s*\{tabular\}$/;
function labelLines(code: any): string[] {
  const v = unbrace(code);
  let m = TABULAR.exec(v);
  if (!m) { const sm = /^\\shortstack\s*(?:\[[^\]]*\]\s*)?\{/.exec(v); if (sm && close(v, sm[0].length - 1) === v.length - 1) m = [v, v.slice(sm[0].length, -1)] as any; }
  if (m) return m[1].split(/\\\\(?:\s*\[[^\]]*\])?/).map((x: string) => x.trim());
  return /\n/.test(v) ? v.split('\n').map((x: string) => x.trim()) : [v];
}
// lines → a label's code: one line as it is, several in the tabular ({} keeps a line starting with [ from
// being read as \\'s spacing)
function stackLines(lines: string[]) {
  const L = lines.map((x) => String(x).trim());
  while (L.length > 1 && !L[L.length - 1]) L.pop();
  return L.length > 1 ? `\\begin{tabular}{@{}c@{}}${L.map((x, i) => (i && x[0] === '[' ? `{}${x}` : x)).join('\\\\')}\\end{tabular}` : L[0] || '';
}
// spaces and % comments: what TeX skips before an optional argument
const skipSp = (s: any, i: any) => { for (;;) { i = skipWs(s, i); if (s[i] !== '%') return i; const e = s.indexOf('\n', i); i = e < 0 ? s.length : e + 1; } };
// a length → px ("3em", "2pt", "1cm", or a bare number of pt)
function len(v: any, dflt: any) {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?\s*$/.exec(String(v ?? ''));
  if (!m) return dflt;
  const n = parseFloat(m[1]);
  return n * { cm: PX, mm: PX / 10, pt: PT, em: EM, ex: EX, in: 2.54 * PX, bp: (2.54 * PX) / 72 }[m[2] || 'pt'];
}
const BOND_START = '-=~<>';
// font sizes in pt (10pt documents), and TeX's spacing commands between compounds
const SIZES: Record<string, any> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
const SIZE_RE = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![A-Za-z])\s*/g;
const SPACE_RE = /\\kern\s*(-?\s*[\d.]+\s*(?:cm|mm|pt|em|ex|in|bp)) ?|\\hspace\*?\s*\{([^}]*)\}|\\(qquad|quad|enspace|thinspace|negthinspace)(?![A-Za-z])\s*|\\([,;:!])|(?<!\\)\\( |\n)[ \t]*/g;
// size commands outside braces ({\\tiny x} is only x's size): their names, and the text without them
function topSizes(t: string) {
  const names: string[] = [];
  let out = '', d = 0, i = 0;
  const re = new RegExp(SIZE_RE.source, 'y');
  while (i < t.length) {
    const c = t[i];
    if (c === '\\' && !d) { re.lastIndex = i; const m = re.exec(t); if (m) { names.push(m[1]); i = re.lastIndex; continue; } }
    if (c === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    out += c; i++;
  }
  return { names, rest: out };
}
// a text cut into words and spaces: [{ text }] and [{ sp: length }]
function spacing(t: string) {
  const out: any[] = [];
  let i = 0, m;
  const re = new RegExp(SPACE_RE.source, 'g');
  while ((m = re.exec(t))) {
    if (m.index > i) out.push({ text: t.slice(i, m.index) });
    const named: Record<string, number> = { qquad: 2 * EM, quad: EM, enspace: 0.5 * EM, thinspace: EM / 6, negthinspace: -EM / 6, ',': EM / 6, ':': (2 / 9) * EM, ';': (5 / 18) * EM, '!': -EM / 6 };
    // \  and \<line end> (\^^M, which LaTeX makes \ ): the font's interword space; the next line's spaces are skipped
    out.push({ sp: m[1] != null ? len(m[1].replace(/\s+/g, ''), 0) : m[2] != null ? len(m[2].trim(), 0) : m[5] != null ? 3.333 * PT : named[m[3] || m[4]] });
    i = re.lastIndex;
  }
  if (i < t.length) out.push({ text: t.slice(i) });
  return out;
}

// The molecule tree. A chain is { opt: '[…]' or '', items }; an item is one of
//   { t: 'atom', raw }                                         an atom group, as written (spaces kept)
//   { t: 'bond', raw, sym, arg: [angle, len, dep, arr, tikz] or null }   sym: - = ~ > < >: <: >| <| =^ =_
//   { t: 'branch', chain }                                     ( … )
//   { t: 'ring', star: '*' or '**', arc: '[…]' or '', n, chain } *n( … ) and **n( … )
//   { t: 'sub', raw, name, args }                              a submolecule: !{name}{arg}…, !x, !\x
//   { t: 'ws', raw }                                           spaces, line breaks and % comments (ignored)
// Writing the tree back gives the code as written; an edited bond is written from its fields.
// defs: the submolecules known so far (name → { n: number of arguments }), to read their arguments.
let curDefs: any = null;
function parseChain(s: any, warn: any, defs?: any) {
  defs = defs || curDefs || {};
  let i = 0;
  const chain = { opt: '', items: ([] as any[]) };
  const lead = (/^\s*/.exec(s))![0];
  if (s[lead.length] === '[') { const e = close(s, lead.length); if (e > 0) { chain.opt = s.slice(0, e + 1); i = e + 1; } }
  let atom = '';
  const flush = () => { if (atom) { chain.items.push((atom as any).trim() ? { t: 'atom', raw: atom } : { t: 'ws', raw: atom }); atom = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { flush(); let e = s.indexOf('\n', i); e = e < 0 ? s.length : skipWs(s, e); chain.items.push({ t: 'ws', raw: s.slice(i, e) }); i = e; continue; }
    if (c === '{') { const e = close(s, i); if (e < 0) { warn('A { in the molecule is not closed'); atom += s.slice(i); break; } atom += s.slice(i, e + 1); i = e + 1; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(i));
      let j = i + m![0].length;
      // a command's arguments belong to the atom
      for (;;) { const k = skipWs(s, j); if (s[k] === '{' || (s[k] === '[' && /^(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)$/.test(m![1]))) { const e = close(s, k); if (e < 0) break; j = e + 1; } else break; }
      atom += s.slice(i, j); i = j; continue;
    }
    if (c === '?' && s[i + 1] === '[') { const e = close(s, i + 1); atom += s.slice(i, e < 0 ? s.length : e + 1); i = e < 0 ? s.length : e + 1; continue; }
    if (c === '@' && s[i + 1] === '{') { const e = close(s, i + 1); atom += s.slice(i, e < 0 ? s.length : e + 1); i = e < 0 ? s.length : e + 1; continue; }
    if (BOND_START.includes(c)) {
      flush();
      let j = i + 1, sym = c;
      if ((c === '>' || c === '<') && (s[j] === ':' || s[j] === '|')) { sym += s[j]; j++; }
      if (c === '=' && (s[j] === '^' || s[j] === '_')) { sym += s[j]; j++; }
      let extra = '';
      if (s[j] === '#' && s[j + 1] === '(') { const e = close(s, j + 1); if (e > 0) { extra += s.slice(j, e + 1); j = e + 1; } }
      // (-@{name}X names the atom X, not the bond: a bond is named in its argument, -[@{name}])
      let arg = null;
      if (s[j] === '[') { const e = close(s, j); if (e > 0) { arg = split(s.slice(j + 1, e)).map((x) => x.trim()); if (arg.length > 5) arg = [...arg.slice(0, 4), arg.slice(4).join(',')]; j = e + 1; } }
      chain.items.push({ t: 'bond', raw: s.slice(i, j), sym, extra, arg });
      i = j; continue;
    }
    if (c === '(') {
      flush();
      const e = close(s, i);
      if (e < 0) { warn('A ( in the molecule is not closed'); i = s.length; break; }
      chain.items.push({ t: 'branch', chain: parseChain(s.slice(i + 1, e), warn) });
      i = e + 1; continue;
    }
    if (c === '*') {
      flush();
      const m = /^(\*\*?)\s*(\[[^\]]*\])?\s*(\d+)\s*\(/.exec(s.slice(i));
      if (!m) { warn('A ring is written *6( … ) or **6( … ) for an aromatic circle'); atom += c; i++; continue; }
      const o = i + m[0].length - 1, e = close(s, o);
      if (e < 0) { warn('A ring\'s ( is not closed'); i = s.length; break; }
      chain.items.push({ t: 'ring', star: m[1], arc: m[2] || '', n: Math.max(3, parseInt(m[3], 10)), nRaw: s.slice(i + m[1].length, o).replace(/^\s*\[[^\]]*\]/, ''), chain: parseChain(s.slice(o + 1, e), warn) });
      i = e + 1; continue;
    }
    if (c === '!') {
      flush();
      let j = i + 1, name;
      if (s[j] === '{') { const e = close(s, j); if (e < 0) { warn('The { after ! is not closed'); atom += s.slice(i); break; } name = s.slice(j + 1, e); j = e + 1; }
      else if (s[j] === '\\') { const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(j)); name = m![0]; j += m![0].length; }
      else if (j < s.length) { name = s[j]; j++; }
      else { atom += c; i++; continue; }
      const d = defs[name], args = [];
      for (let a = 0; d && a < d.n; a++) {
        const k = skipWs(s, j);
        if (s[k] === '{') { const e = close(s, k); if (e < 0) break; args.push(s.slice(k + 1, e)); j = e + 1; }
        else if (k < s.length) { args.push(s[k]); j = k + 1; }
      }
      chain.items.push({ t: 'sub', raw: s.slice(i, j), name, args });
      i = j; continue;
    }
    atom += c; i++;
  }
  flush();
  return chain;
}
function bondCode(b: any) {
  if (!b.dirty) return b.raw;
  let arg = b.arg ? b.arg.slice() : null;
  if (arg) { while (arg.length && !arg[arg.length - 1]) arg.pop(); if (!arg.length) arg = null; }
  return `${b.sym}${b.extra || ''}${arg ? `[${arg.join(',')}]` : ''}`;
}
function writeChain(c: any) {
  return c.opt + c.items.map((it: any) => it.t === 'atom' || it.t === 'ws' || it.t === 'sub' ? it.raw : it.t === 'bond' ? bondCode(it)
    : it.t === 'branch' ? `(${writeChain(it.chain)})` : `${it.star}${it.arc}${it.nRaw != null ? it.nRaw : it.n}(${writeChain(it.chain)})`).join('');
}

// The whole source: a list of segments, each kept as written unless edited.
//   { t: 'text', raw }  { t: 'mol', head: '\chemfig[…]', chain, raw }  { t: 'arrow', raw, names, type, labels: [above, below, shift], opt: [angle, coeff, style] }
//   { t: 'plus', raw }  { t: 'name', head, inner: [segments], name, raw }  { t: 'start', raw }  { t: 'stop', raw }  { t: 'set', raw, kv }
//   { t: 'submol', raw, name, n, alt, body }  { t: 'move', raw, opt, body }  { t: 'hstart', raw, kv }  { t: 'hstop', raw }
//   { t: 'pdelim', raw, opt, a, b }   (\polymerdelim[keys]{bond or atom name}{bond or atom name})
//   { t: 'harrow', raw, type, labels: [above, below] }   (\hreac … \endhreac: + and > between compounds)
// chemfig 1.x setters (deprecated in 1.3, removed in 1.4) and the \setchemfig keys they became, read from the 1.2e
// source: args are brace arguments in order (an empty one keeps the default), opt a leading [ ] argument, csv one
// argument split at commas (the last key takes the rest), set a fixed value, star the key a * turns on
const LEGACY: Record<string, { args?: string[]; opt?: string; csv?: string[]; set?: Record<string, string>; star?: string }> = {
  setatomsep: { args: ['atom sep'] }, setcrambond: { args: ['cram width', 'cram dash width', 'cram dash sep'], star: 'cram rectangle' },
  setbondoffset: { args: ['bond offset'] }, setdoublesep: { args: ['double bond sep'] }, setangleincrement: { args: ['angle increment'] },
  setbondstyle: { args: ['bond style'] }, setnodestyle: { args: ['node style'] }, setcompoundstyle: { args: ['compound style'] },
  setcompoundsep: { args: ['compound sep'] }, setarrowoffset: { args: ['arrow offset'] }, setarrowlabelsep: { args: ['arrow label sep'] },
  setstacksep: { args: ['stack sep'] }, setlewis: { opt: 'lewis | width', args: ['lewis sep', 'lewis length', 'lewis style'] },
  setlewisdist: { args: ['lewis dist'] }, schemedebug: { args: ['scheme debug'] },
  // \setarrowdefault{angle,length,style}; \setandsign{before,after,raise}: the default spacing of \+, which
  // current chemfig only takes on each \+{…} (kept here as the internal key "and sign")
  setarrowdefault: { csv: ['arrow angle', 'arrow coeff', 'arrow style'] }, setandsign: { csv: ['and sign'] },
  enablefixedbondlength: { set: { 'fixed length': 'true' } }, disablefixedbondlength: { set: { 'fixed length': 'false' } },
  enablebondjoin: { set: { 'bond join': 'true' } }, disablebondjoin: { set: { 'bond join': 'false' } },
};
// every key \setchemfig knows (chemfig 1.84, with chemfig-lewis): what tells \chemfig[keys] from the 1.x \chemfig[tikz]
const CHEMFIG_KEYS = new Set(['+ sep left', '+ sep right', '+ vshift', '<> join angle', '-> join angle', 'atom style', 'use atom strut', 'baseline', 'chemfig style', 'bond join', 'fixed length', 'cram rectangle', 'cram width', 'cram dash width', 'cram dash sep', 'atom sep', 'bond offset', 'double bond sep', 'angle increment', 'node style', 'bond style', 'cycle radius coeff', 'stack sep', 'autoreset cntcycle', 'show cntcycle', 'debug', 'scheme debug', 'compound style', 'compound sep', 'arrow offset', 'arrow angle', 'arrow coeff', 'arrow style', 'arrow double sep', 'arrow double coeff', 'arrow double harpoon', 'arrow label sep', 'arrow head', 'init anchor', 'gchemname', 'schemestart code', 'schemestop code', 'harrow minwidth', 'hreac debug', 'label xsep', 'label align', 'name sep', 'hreac anchor', 'hreac sep', 'save', 'save name', 'lewis | width', 'lewis sep', 'lewis length', 'lewis style', 'lewis dist', 'lewis radius', 'lewis diag coeff']);
function parseDoc(src: any, warn: any, defsIn?: any) {
  const s = String(src || '');
  const segs: any[] = [];
  const top = !defsIn, defs = defsIn || {}, saved = curDefs;
  curDefs = defs;
  let i = 0, text = '', inH = false;
  const flush = () => { if (text) { segs.push({ t: 'text', raw: text }); text = ''; } };
  const at = (w: any) => s.startsWith(w, i) && !/[A-Za-z]/.test(s[i + w.length] || '');
  while (i < s.length) {
    if (s[i] === '%') { const e = s.indexOf('\n', i); text += s.slice(i, e < 0 ? s.length : e); i = e < 0 ? s.length : e; continue; }
    if (at('\\definesubmol') || at('\\redefinesubmol')) {
      flush();
      let j = i + (s[i + 1] === 'r' ? 15 : 13), k = skipWs(s, j), name;
      if (s[k] === '{') { const e = close(s, k); if (e < 0) { text += s.slice(i); break; } name = s.slice(k + 1, e); j = e + 1; }
      else if (s[k] === '\\') { const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(k)); name = m![0]; j = k + m![0].length; }
      else { text += s.slice(i, j); i = j; continue; }
      k = skipWs(s, j);
      let n = 0, alt = null;
      const nm = /^\d/.exec(s.slice(k));
      if (nm) { n = +nm[0]; j = k + 1; k = skipWs(s, j); }
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { alt = s.slice(k + 1, e); j = e + 1; k = skipWs(s, j); } }
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { warn('\\definesubmol needs {name}{code}'); text += s.slice(i, j); i = j; continue; }
      defs[name] = { n, alt, body: s.slice(k + 1, e) };
      segs.push({ t: 'submol', raw: s.slice(i, e + 1), name, n, alt, body: s.slice(k + 1, e) });
      i = e + 1; continue;
    }
    if (at('\\chemmove')) {
      flush();
      let j = i + 9, k = skipWs(s, j), opt = '';
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { opt = s.slice(k + 1, e); j = e + 1; k = skipWs(s, j); } }
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { warn('\\chemmove needs { … }'); text += s.slice(i, j); i = j; continue; }
      segs.push({ t: 'move', raw: s.slice(i, e + 1), opt, body: s.slice(k + 1, e) });
      i = e + 1; continue;
    }
    // \hflipnext, \vflipnext: the next molecule mirrored, which isn't drawn here (the spaces after them are TeX's to skip)
    if (at('\\hflipnext') || at('\\vflipnext')) {
      flush();
      warn(`\\${s.slice(i + 1, i + 10)} (the next molecule mirrored) isn't drawn here (it is kept in the code)`);
      const e = skipWs(s, i + 10);
      segs.push({ t: 'flip', raw: s.slice(i, e) }); i = e; continue;
    }
    if (at('\\polymerdelim')) {
      flush();
      let j = i + 13, k = skipWs(s, j), opt = '';
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { opt = s.slice(k + 1, e); j = e + 1; k = skipWs(s, j); } }
      const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
      if (e2 < 0) { warn('\\polymerdelim needs {name}{name}'); text += s.slice(i, j); i = j; continue; }
      segs.push({ t: 'pdelim', raw: s.slice(i, e2 + 1), opt, a: s.slice(k + 1, e1).trim(), b: s.slice(k2 + 1, e2).trim() });
      i = e2 + 1; continue;
    }
    if (at('\\hreac')) {
      flush();
      let j = i + 6, kv = {};
      const k = skipWs(s, j);
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { kv = readKV(s.slice(k + 1, e)); j = e + 1; } }
      segs.push({ t: 'hstart', raw: s.slice(i, j), kv }); inH = true; i = j; continue;
    }
    if (at('\\endhreac')) { flush(); segs.push({ t: 'hstop', raw: '\\endhreac' }); inH = false; i += 9; continue; }
    if (inH && s[i] === '+') { flush(); segs.push({ t: 'plus', raw: '+' }); i++; continue; }
    if (inH && s[i] === '>') {
      flush();
      let j = i + 1, k = skipWs(s, j), type = '->';
      const labels = [];
      if (s[k] === '{') { const e = close(s, k); if (e > 0) { type = s.slice(k + 1, e).trim() || '->'; j = e + 1; k = skipWs(s, j); } }
      while (s[k] === '[' && labels.length < 2) { const e = close(s, k); if (e < 0) break; labels.push(s.slice(k + 1, e)); j = e + 1; k = skipWs(s, j); }
      segs.push({ t: 'harrow', raw: s.slice(i, j), type, labels }); i = j; continue;
    }
    if (at('\\schemestart')) { flush(); let j = i + 12; const k = skipWs(s, j); if (s[k] === '[') { const e = close(s, k); if (e > 0) j = e + 1; } segs.push({ t: 'start', raw: s.slice(i, j) }); i = j; continue; }
    if (at('\\schemestop')) { flush(); segs.push({ t: 'stop', raw: '\\schemestop' }); i += 11; continue; }
    if (s.startsWith('\\+', i)) { flush(); let j = i + 2; const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e > 0) j = e + 1; } segs.push({ t: 'plus', raw: s.slice(i, j) }); i = j; continue; }
    if (at('\\tikzset')) {
      flush();
      const k = skipWs(s, i + 8);
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { text += '\\tikzset'; i += 8; continue; }
      segs.push({ t: 'set', tikz: true, raw: s.slice(i, e + 1), kv: readKV(s.slice(k + 1, e)) }); i = e + 1; continue;
    }
    // chemfig 1.x's setters (\setatomsep{4em}, \setcrambond*{3pt}{}{}, \enablebondjoin…): read as the \setchemfig keys
    // they became; current chemfig stops on them, so they are flagged (the chemistry editor rewrites them)
    const old = /^\\([a-z]+)(?![A-Za-z])/.exec(s.slice(i, i + 40));
    if (old && LEGACY[old[1]]) {
      const spec = LEGACY[old[1]], kv: Record<string, string> = {};
      let j = i + old[0].length, ok = true;
      const arg = () => { const q = skipWs(s, j), e = s[q] === '{' ? close(s, q) : -1; if (e < 0) { ok = false; return ''; } j = e + 1; return s.slice(q + 1, e).trim(); };
      if (spec.star && s[skipWs(s, j)] === '*') { kv[spec.star] = 'true'; j = skipWs(s, j) + 1; }
      if (spec.opt) { const q = skipWs(s, j); if (s[q] === '[') { const e = close(s, q); if (e > 0) { const v = s.slice(q + 1, e).trim(); if (v) kv[spec.opt] = v; j = e + 1; } } }
      for (const k of spec.args || []) { const v = arg(); if (ok && v) kv[k] = v; }
      if (spec.csv) { const v = arg(); const f = split(v).map((x: any) => x.trim()); spec.csv.forEach((k, n) => { const w = n === spec.csv!.length - 1 ? f.slice(n).join(',').trim() : f[n]; if (w) kv[k] = k === 'and sign' ? v : w; }); }
      Object.assign(kv, spec.set || {});
      if (ok) {
        flush();
        warn(`\\${old[1]} is from chemfig 1.x and current chemfig stops on it; opening the drawing in the chemistry editor rewrites it as \\setchemfig`);
        segs.push({ t: 'set', legacy: old[1], raw: s.slice(i, j), kv }); i = j; continue;
      }
    }
    if (at('\\resetchemfig') || at('\\resetcharge')) { flush(); const c = at('\\resetcharge'); segs.push({ t: 'reset', charge: c, raw: c ? '\\resetcharge' : '\\resetchemfig' }); i += c ? 12 : 13; continue; }
    if (at('\\setcharge')) {
      flush();
      const k = skipWs(s, i + 10);
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { text += '\\setcharge'; i += 10; continue; }
      segs.push({ t: 'set', charge: true, raw: s.slice(i, e + 1), kv: readKV(s.slice(k + 1, e)) }); i = e + 1; continue;
    }
    if (at('\\setchemfig')) {
      flush();
      const k = skipWs(s, i + 11);
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { text += '\\setchemfig'; i += 11; continue; }
      segs.push({ t: 'set', raw: s.slice(i, e + 1), kv: readKV(s.slice(k + 1, e)) }); i = e + 1; continue;
    }
    if (at('\\chemfig')) {
      flush();
      let j = i + 8;
      if (s[j] === '*') j++; // chemfig 1.x: this molecule with fixed bond lengths
      for (;;) { const k = skipWs(s, j); if (s[k] === '[') { const e = close(s, k); if (e < 0) break; j = e + 1; } else break; }
      const head = s.slice(i, j), k = skipWs(s, j);
      if (s[k] !== '{') { warn('\\chemfig needs { … }'); text += head; i = j; continue; }
      const e = close(s, k);
      if (e < 0) { warn('The { after \\chemfig is not closed'); text += s.slice(i); i = s.length; continue; }
      segs.push({ t: 'mol', head: s.slice(i, k), chain: parseChain(s.slice(k + 1, e), warn), raw: s.slice(i, e + 1) });
      i = e + 1; continue;
    }
    if (at('\\chemname')) {
      flush();
      let j = i + 9;
      if (s[j] === '*') j++;
      let k = skipWs(s, j);
      if (s[k] === '[') { const e = close(s, k); if (e > 0) k = skipWs(s, e + 1); }
      const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
      if (e2 < 0) { warn('\\chemname needs {molecule}{name}'); text += s.slice(i, j); i = j; continue; }
      const nm = { t: 'name', head: s.slice(i, k), inner: parseDoc(s.slice(k + 1, e1), warn, defs), mid: s.slice(e1, k2 + 1), name: s.slice(k2 + 1, e2), raw: s.slice(i, e2 + 1) };
      for (const x of nm.inner) x.owner = nm;
      segs.push(nm);
      i = e2 + 1; continue;
    }
    if (at('\\arrow')) {
      flush();
      let j = i + 6;
      const A: Record<string, any> = { t: 'arrow', names: '', type: '->', labels: [], opt: [] };
      let k = skipWs(s, j);
      if (s[k] === '(') { const e = close(s, k); if (e > 0) { A.names = s.slice(k, e + 1); j = e + 1; k = skipWs(s, j); } }
      if (s[k] === '{') {
        const e = close(s, k);
        if (e > 0) {
          const body = s.slice(k + 1, e);
          const b = body.indexOf('[');
          A.type = (b < 0 ? body : body.slice(0, b)).trim() || '->';
          let p = b;
          while (p >= 0 && p < body.length && body[p] === '[') { const q = close(body, p); if (q < 0) break; A.labels.push(body.slice(p + 1, q)); p = skipWs(body, q + 1); }
          j = e + 1; k = skipSp(s, j);
        }
      }
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { A.opt = split(s.slice(k + 1, e)).map((x) => x.trim()); j = e + 1; } }
      A.raw = s.slice(i, j);
      segs.push(A); i = j; continue;
    }
    if (at('\\subscheme')) {
      flush();
      let j = i + 10, k = skipWs(s, j), opt = '';
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { opt = s.slice(k + 1, e); j = e + 1; k = skipWs(s, j); } }
      const e = s[k] === '{' ? close(s, k) : -1;
      if (e < 0) { warn('\\subscheme needs { … }'); text += s.slice(i, j); i = j; continue; }
      segs.push({ t: 'sub', opt, inner: parseDoc(s.slice(k + 1, e), warn, defs), pre: s.slice(i, k + 1), post: '}', raw: s.slice(i, e + 1) });
      i = e + 1; continue;
    }
    if (at('\\chemleft')) {
      flush();
      // a delimiter: a {…} group, a command or one character
      const tok = (p: any) => {
        p = skipWs(s, p);
        if (s[p] === '{') { const e = close(s, p); return e < 0 ? null : { v: s.slice(p + 1, e).trim(), e: e + 1 }; }
        if (s[p] === '\\') { const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(p)); return { v: m![0], e: p + m![0].length }; }
        return p < s.length ? { v: s[p], e: p + 1 } : null;
      };
      const L = tok(i + 9);
      let p = L ? L.e : s.length, nest = 0, found = -1;
      while (p < s.length) {
        const c = s[p];
        if (c === '%') { const e = s.indexOf('\n', p); p = e < 0 ? s.length : e; continue; }
        if (c === '{') { const e = close(s, p); if (e < 0) break; p = e + 1; continue; }
        if (c === '\\') {
          const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(p, p + 40));
          if (m![1] === 'chemleft') nest++;
          else if (m![1] === 'chemright') { if (!nest) { found = p; break; } nest--; }
          p += m![0].length; continue;
        }
        p++;
      }
      const R = found >= 0 ? tok(found + 10) : null;
      if (!L || !R) { warn('\\chemleft needs a \\chemright after it'); text += '\\chemleft'; i += 9; continue; }
      segs.push({ t: 'lr', l: L.v, r: R.v, inner: parseDoc(s.slice(L.e, found), warn, defs), pre: s.slice(i, L.e), post: s.slice(found, R.e), raw: s.slice(i, R.e) });
      i = R.e; continue;
    }
    if (at('\\charge') || at('\\Charge')) {
      // \charge around more than an atom (outside \chemfig): its marks around the whole box
      flush();
      const j = i + 7;
      let k = skipWs(s, j), opt = '';
      if (s[k] === '[') { const e = close(s, k); if (e > 0) { opt = s.slice(k + 1, e); k = skipWs(s, e + 1); } }
      const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
      if (e2 < 0) { text += s.slice(i, j); i = j; continue; }
      const cl = leadOpts(s.slice(k + 1, e1));
      segs.push({ t: 'chg', cmd: s[i + 1] === 'C' ? 'Charge' : 'charge', opt: joinOpts(opt, cl.opts), charges: readCharges(cl.rest), inner: parseDoc(s.slice(k2 + 1, e2), warn, defs), pre: s.slice(i, k2 + 1), post: '}', raw: s.slice(i, e2 + 1) });
      i = e2 + 1; continue;
    }
    if (at('\\merge')) {
      flush();
      let j = i + 6, k = skipWs(s, j), dir = '>';
      if ('<>^'.includes(s[k]) || (s[k] === 'v' && !/[A-Za-z]/.test(s[k + 1] || ''))) { dir = s[k]; j = k + 1; k = skipWs(s, j); }
      const labels = [], srcs = [];
      while (s[k] === '[' && labels.length < 2) { const e = close(s, k); if (e < 0) break; labels.push(s.slice(k + 1, e)); j = e + 1; k = skipWs(s, j); }
      while (s[k] === '(') { const e = close(s, k); if (e < 0) break; srcs.push(s.slice(k + 1, e).trim()); j = e + 1; k = skipWs(s, j); }
      let target = null, opt: any[] = [];
      if (s.startsWith('--', k)) { const k2 = skipWs(s, k + 2); if (s[k2] === '(') { const e = close(s, k2); if (e > 0) { target = s.slice(k2 + 1, e).trim(); j = e + 1; k = skipWs(s, j); } } }
      if (target != null && s[k] === '[') { const e = close(s, k); if (e > 0) { opt = split(s.slice(k + 1, e)).map((x) => x.trim()); j = e + 1; } }
      if (target == null || !srcs.length) warn('\\merge is written \\merge(c1)(c2)--(c3)');
      segs.push({ t: 'merge', dir, labels, srcs, target: target || '', opt, raw: s.slice(i, j) });
      i = j; continue;
    }
    if (at('\\chemnameinit')) { flush(); let j = i + 13; const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e > 0) j = e + 1; } segs.push({ t: 'nameinit', raw: s.slice(i, j) }); i = j; continue; }
    if (at('\\par')) { flush(); segs.push({ t: 'par', raw: '\\par' }); i += 4; continue; }
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(i)); text += m![0]; i += m![0].length; continue; }
    if (s[i] === '{') { const e = close(s, i); if (e > 0) { text += s.slice(i, e + 1); i = e + 1; continue; } }
    text += s[i]; i++;
  }
  flush();
  if (top) curDefs = saved;
  (segs as any).defs = defs;
  return segs;
}
// key=value lists; a key alone is true
function readKV(t: any) {
  const kv: Record<string, any> = {};
  for (const it of split(t)) {
    const m = /^\s*([^=]+?)\s*(?:=\s*([\s\S]*?))?\s*$/.exec(it);
    if (m && m[1].trim()) kv[m[1]] = m[2] == null ? 'true' : unbrace(m[2]);
  }
  return kv;
}
function arrowCode(A: any) {
  if (!A.dirty) return A.raw;
  const labels = A.labels.slice();
  while (labels.length && !labels[labels.length - 1]) labels.pop();
  const opt = A.opt.slice();
  while (opt.length && !opt[opt.length - 1]) opt.pop();
  const typ = A.type + labels.map((l: any) => `[${l}]`).join('');
  return `\\arrow${A.names}${typ !== '->' ? `{${typ}}` : ''}${opt.length ? `[${opt.join(',')}]` : ''}`;
}
function mergeCode(M: any) {
  if (!M.dirty) return M.raw;
  const labels = M.labels.slice();
  while (labels.length && !labels[labels.length - 1]) labels.pop();
  const opt = M.opt.slice();
  while (opt.length && !opt[opt.length - 1]) opt.pop();
  return `\\merge${M.dir}${labels.map((l: any) => `[${l}]`).join('')}${M.srcs.map((x: any) => `(${x})`).join('')}--(${M.target})${opt.length ? `[${opt.join(',')}]` : ''}`;
}
function writeDoc(segs: any) {
  return segs.map((g: any) => g.t === 'mol' ? (g.dirty || g.chainDirty ? `${g.head}{${writeChain(g.chain)}}` : g.raw)
    : g.t === 'arrow' ? arrowCode(g)
    : g.t === 'merge' ? mergeCode(g)
      : g.t === 'name' ? `${g.head}{${writeDoc(g.inner)}${g.mid}${g.name}}`
        : g.inner ? g.pre + writeDoc(g.inner) + g.post
          : g.raw).join('');
}
// a segment holds edited pieces: mark it and the names around it
function markDirty(segs: any) { for (const g of segs) { if (g.inner) { markDirty(g.inner); g.dirty = true; } if (g.t === 'mol') g.dirty = true; } }

// ---------------------------------------------------------------- atoms
// An atom group is split into atoms as chemfig does: each starts at a capital letter, a {…} group or a
// \charge; digits, small letters, _ and ^ belong to the atom before them.
function splitAtoms(raw: any) {
  let s = String(raw || '');
  const hooks = [];
  const atoms: any[] = [];
  let cur: any = null;
  let name: any = null, cut = false;
  const start = (tok: any, extra?: any) => { cur = { tex: tok, raw: tok, ...extra }; if (name) { cur.name = name; name = null; } cut = false; atoms.push(cur); };
  const add = (tok: any) => { if (!cur || cut) start(tok); else { cur.tex += tok; cur.raw += tok; } };
  let i = 0;
  s = s.trim();
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '?') {
      let arg = '';
      if (s[i + 1] === '[') { const e = close(s, i + 1); arg = s.slice(i + 2, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; } else i++;
      const p = split(arg).map((x) => x.trim());
      hooks.push({ name: p[0] || 'a', sym: p[1] || '-', tikz: p[2] || '', atom: Math.max(0, atoms.length - 1) });
      continue;
    }
    if (c === '@' && s[i + 1] === '{') { const e = close(s, i + 1); name = split(s.slice(i + 2, e < 0 ? s.length : e))[0].trim(); i = e < 0 ? s.length : e + 1; continue; }
    if (c === '|') { cut = true; i++; continue; }
    if (c === '{') {
      const e = close(s, i); const tok = s.slice(i, e < 0 ? s.length : e + 1);
      // {\charge{…}O}: the group is only the atom's bounds; inside it TeX reads \charge's last argument as one token
      const inner = e > 0 ? s.slice(i + 1, e) : '', cm = /^\s*\\(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)(?![A-Za-z])/.exec(inner);
      const r = cm ? markAt(inner, cm[0].length, cm[1], true) : null;
      if (r && !inner.slice(r.end).trim()) start(tok, r.atom); else start(tok);
      i += tok.length; continue;
    }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(i));
      const name = m![1];
      let j = i + m![0].length;
      if (/^(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)$/.test(name)) {
        const r = markAt(s, j, name, false);
        if (!r) { add(m![0]); i = j; continue; }
        start(s.slice(i, r.end), r.atom);
        i = r.end; continue;
      }
      let tok = m![0];
      for (;;) { const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e < 0) break; tok += s.slice(j, e + 1); j = e + 1; } else break; }
      add(tok); i = j; continue;
    }
    if (c === '_' || c === '^') {
      let j = skipWs(s, i + 1), tok;
      if (s[j] === '{') { const e = close(s, j); tok = s.slice(i, e < 0 ? s.length : e + 1); }
      else if (s[j] === '\\') { const m = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(j)); tok = s.slice(i, j + m![0].length); }
      else tok = s.slice(i, j + 1);
      add(tok); i += tok.length; continue;
    }
    if (/[A-Z]/.test(c)) { start(c); i++; continue; }
    add(c); i++;
  }
  // @{name} with no atom after it (Cl-@{a}(=O)…): it names the empty atom, for \chemmove
  return { atoms, hooks, tail: atoms.length ? null : name };
}
// \charge[opts]{list}{atom} or \chemabove{atom}{text} from j (just after the name): the atom it makes and where it
// ends. one: the last argument may be a single token (a letter or a command), as TeX reads an undelimited argument
function markAt(s: string, j: number, name: string, one: boolean) {
  let o = '', k = skipWs(s, j);
  if (s[k] === '[') { const e = close(s, k); if (e < 0) return null; o = s.slice(k + 1, e); k = skipWs(s, e + 1); }
  const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1;
  let b: string, end: number;
  if (k2 > 0 && s[k2] === '{') { const e2 = close(s, k2); if (e2 < 0) return null; b = s.slice(k2 + 1, e2); end = e2 + 1; }
  else if (one && k2 > 0 && k2 < s.length && s[k2] !== '}') { const t = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(k2)); b = s[k2] === '\\' ? t![0] : s[k2]; end = k2 + b.length; }
  else return null;
  const a = s.slice(k + 1, e1);
  if (/charge/i.test(name)) { const cl = leadOpts(a); return { end, atom: { tex: b, charges: readCharges(cl.rest), cmd: name, copt: joinOpts(o, cl.opts), inner: b } }; }
  return { end, atom: { tex: a, stack: { text: b, dir: /below/i.test(name) ? 1 : -1 }, cmd: name, inner: a } };
}
// \charge{90=\:,0:2pt[red]=$\oplus$}: position[:offset][tikz]=what
// \charge{[settings]90=\:,…}{O}: the settings chemfig reads at the start of the list, and the list
function leadOpts(list: any) {
  const t = String(list || ''), q = t.search(/\S/);
  if (q < 0 || t[q] !== '[') return { opts: '', rest: t };
  const e = close(t, q);
  return e < 0 ? { opts: '', rest: t } : { opts: t.slice(q + 1, e).trim(), rest: t.slice(e + 1) };
}
const joinOpts = (...o: string[]) => o.map((x) => String(x || '').trim()).filter(Boolean).join(',');
function readCharges(list: any) {
  const out = [];
  for (const it of split(list)) {
    const m = /^\s*([^=:[]+?)\s*(?::\s*([^=[]+?))?\s*(\[[^\]]*\])?\s*=\s*([\s\S]*?)\s*$/.exec(it);
    if (!m) continue;
    const ang = /^-?[\d.]+$/.test(m[1]) ? ((parseFloat(m[1]) % 360) + 360) % 360 : ({ east: 0, 'north east': 45, north: 90, 'north west': 135, west: 180, 'south west': 225, south: 270, 'south east': 315 }[m[1]] ?? 90);
    out.push({ pos: m[1], angle: ang, off: m[2] ? len(m[2], 0) : 0, offRaw: m[2] ? m[2].trim() : '', tikz: m[3] || '', what: m[4] });
  }
  return out;
}
// TeX box of an atom in em, as chemfig's \printatom ($\rm …$) sets it: height and depth
function vmetrics(tex: any) {
  const t = String(tex).replace(/\\[A-Za-z]+/g, 'X');
  let asc = 0.683, desc = 0;
  if (/^[a-z0-9]*$/.test(t.replace(/[_^{}]/g, '')) && !/[bdfhklt]/.test(t)) asc = 0.431;
  if (/[bdfhklt]/.test(t.replace(/[_^][^_^]*/g, ''))) asc = Math.max(asc, 0.694);
  if (/[()[\]]/.test(t)) { asc = 0.75; desc = 0.25; }
  if (t.includes('^')) asc = Math.max(asc, 0.84);
  if (t.includes('_')) desc = Math.max(desc, 0.15);
  if (/[gjpqy]/.test(t.replace(/[_^][^_^]*/g, ''))) desc = Math.max(desc, 0.194);
  if (!t.trim()) { asc = 0; desc = 0; }
  return { asc: asc * EM, desc: desc * EM };
}
// \rlap{$'$} in an atom: the math forms keep the overhang out of the atom's width
const atomTex = (t: any) => `$\\mathrm{${String(t).replace(/\\([rlc])lap\s*\{\$([^$]*)\$\}/g, '\\math$1lap{$2}').replace(/\\([rlc])lap(?![A-Za-z])/g, '\\math$1lap')}}$`;
// where the baseline sits in a measured text box: one probe per style
const baseCache = new Map();
function baseOff(st: any) {
  const b = TD.textBox(atomTex('H'), st);
  if (baseCache.has(b.css)) return baseCache.get(b.css);
  const m = measurementElement();
  let v = b.h * 0.72;
  if (m && !(TD.measuring && TD.measuring())) {
    m.setAttribute('style', b.css);
    m.innerHTML = b.html.replace(/<\/div>$/, '<span class="cf-probe" style="display:inline-block;width:0;height:0"></span></div>');
    const p = m.querySelector('.cf-probe');
    if (p) { v = p.getBoundingClientRect().top - m.getBoundingClientRect().top; baseCache.set(b.css, v); }
  }
  return v;
}
function atomBox(tex: any) {
  const t = String(tex || '').trim();
  if (!t || t === '{}') return { tex: '', w: 0, asc: 0, desc: 0, empty: true };
  const b = TD.textBox(atomTex(t), TEXT);
  return { tex: t, w: Math.max(0, b.w - 2), ...vmetrics(t) };
}

// ---------------------------------------------------------------- molecule layout
const rad = (a: any) => (a * Math.PI) / 180;
const norm360 = (a: any) => { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-9 ? 0 : a; };
// chemfig's angle field: "n" (n × increment), ":30" absolute, "::30" relative to the previous bond
function angleOf(str: any, prev: any, P: any) {
  str = String(str ?? '').trim();
  if (!str) return null;
  let a;
  if (str.startsWith('::')) a = prev + parseFloat(str.slice(2));
  else if (str.startsWith(':')) a = parseFloat(str.slice(1));
  else a = parseFloat(str) * P.inc;
  return isFinite(a) ? norm360(a) : null;
}

// Lays one molecule out. Returns { verts, bonds, rings, paths, texts, dots, bb } in px, y down, the
// first atom's baseline at y = 0 (the picture's baseline).
// a molecule's own settings: \chemfig[keys]{…} (current chemfig), \chemfig*{…} (1.x, fixed bond lengths); the
// 1.x \chemfig[tikz][tikz] options are kept in the code but not drawn
function molP(g: any, P: any, warn: any) {
  const h = String(g.head || ''), star = /^\\chemfig\s*\*/.test(h), opts: string[] = [];
  for (let k = h.indexOf('['); k >= 0 && k < h.length; ) { const e = close(h, k); if (e < 0) break; opts.push(h.slice(k + 1, e)); k = h.indexOf('[', e + 1); }
  if (!star && !opts.length) return P;
  const Q = { ...P };
  if (star) { Q.fixed = true; warn('\\chemfig* is from chemfig 1.x: now \\chemfig[fixed length]{…} (the chemistry editor rewrites it)'); }
  const kv = opts.length === 1 ? readKV(opts[0]) : null;
  if (kv && Object.keys(kv).every((k) => CHEMFIG_KEYS.has(k))) applyKV(Q, kv, warn);
  else if (opts.some((o) => o.trim())) warn('\\chemfig[…][…] with TikZ options is from chemfig 1.x: now \\chemfig[chemfig style={…},node style={…}] (the chemistry editor rewrites it); those options aren\'t drawn here');
  return Q;
}
function layMol(seg: any, P: any, warn: any) {
  const verts: any[] = [], bonds: any[] = [], rings: any[] = [], paths: any[] = [], texts: any[] = [], dots: any[] = [];
  const hooks = new Map();
  const names = { atoms: {}, bonds: {} };
  const defs = P.submols || {};
  // a submolecule's code read as items in place of !{name}{args}; what comes from it is marked .sub
  function expand(items: any, depth: any, prevAngle: any) : any {
    const out = [];
    for (const it of items) {
      if (it.t === 'ws') continue;
      if (it.t !== 'sub') { out.push(it); continue; }
      const d = defs[it.name];
      if (!d) { warn(`The submolecule "${it.name}" isn't defined: write \\definesubmol{${it.name}}{…} before it`); continue; }
      if (depth > 30) { warn('Submolecules call each other without end'); continue; }
      let code = d.alt != null && prevAngle > 90 && prevAngle < 270 ? d.alt : d.body;
      code = code.replace(/#([1-9])/g, (m: any, k: any) => it.args[k - 1] ?? '');
      const ch = parseChain(code, warn, defs);
      const top = it.sub || it;
      const mark = (c: any) => { c.sub = top; for (const x of c.items) { x.sub = top; if (x.chain) mark(x.chain); } };
      mark(ch);
      out.push(...expand(ch.items, depth + 1, prevAngle));
    }
    // chemfig puts a submolecule's code in place before reading: atoms on either side of it are one atom group
    // (CH_3|!\I with \definesubmol\I{\vphantom{C}} is the group CH_3|\vphantom{C})
    for (let k = out.length - 1; k > 0; k--) {
      const a = out[k - 1], b = out[k];
      if (a.t === 'atom' && b.t === 'atom' && (a.sub || b.sub)) out.splice(k - 1, 2, { t: 'atom', raw: a.raw + b.raw, sub: a.sub || b.sub });
    }
    return out;
  }
  // a vertex: an atom group (or an empty one) placed with its arrival atom's centre at (x, y)
  function place(g: any, ctx: any, x: any, y: any, angle: any, arrive: any) {
    const sp = g ? splitAtoms(g.raw) : { atoms: [], hooks: [] };
    const ka = P.ascale || 1, sc = (b: any) => (ka === 1 ? b : { ...b, w: b.w * ka, asc: b.asc * ka, desc: b.desc * ka });
    const boxes = sp.atoms.length ? sp.atoms.map((a) => ({ ...sc(atomBox(a.tex)), src: a })) : [{ tex: '', w: 0, asc: 0, desc: 0, empty: true, ...((sp as any).tail ? { src: { name: (sp as any).tail } } : {}) }];
    const n = boxes.length;
    let k = arrive != null ? arrive : angle != null && angle > 90 && angle < 270 ? n - 1 : 0;
    k = Math.max(0, Math.min(n - 1, k));
    const ak: any = boxes[k];
    // first atom of the molecule: anchor=base; others: anchor=center
    const base = ctx.first ? y : y + (ak.asc - ak.desc) / 2;
    let left = x - ak.w / 2;
    for (let j = k - 1; j >= 0; j--) left -= boxes[j].w;
    for (const b of boxes) { (b as any).x = left; (b as any).base = base; (b as any).cx = left + b.w / 2; (b as any).cy = base - (b.asc - b.desc) / 2; left += b.w; }
    if (ctx.fixed && !ak.empty) {
      // fixed length: the arriving atom's border, not its centre, lies on the bond's end
      const [bx, by] = edge(ak, angle + 180);
      const ox = bx - ak.cx, oy = by - ak.cy;
      for (const b of boxes) { (b as any).x -= ox; (b as any).cx -= ox; (b as any).base -= oy; (b as any).cy -= oy; }
    }
    const v = { id: verts.length, g, boxes, sp, k, x: (boxes[k] as any).cx, y: (boxes[k] as any).cy, chain: ctx.chain, idx: ctx.idx, ring: ctx.ring || null, inRing: !!ctx.ring, label: g ? g.raw.trim() : '', seg, sub: (g && g.sub) || (ctx.chain && ctx.chain.sub) || null };
    verts.push(v);
    for (const b of boxes) if ((b as any).src && (b as any).src.name) (names.atoms as Record<string, any>)[(b as any).src.name] = b;
    for (const b of boxes) if (!b.empty) texts.push({ t: atomTex(b.tex), box: b, v, ...(ka !== 1 ? { k: ka } : {}), ...(P.acolor ? { color: P.acolor } : {}) });
    if (ka !== 1 && boxes.some((b: any) => b.src && (b.src.charges || b.src.stack))) warn('Charges and stacked text on atoms scaled by atom style aren\'t drawn exactly here (they are kept in the code)');
    // charges and stacked text
    for (const b of boxes) {
      const a = (b as any).src;
      if (a && a.charges) { const ch = chargeOpts(P, a.copt, warn); for (const c of a.charges) chargeMarks(b, { ...c, ch, overlay: !(a.cmd === 'Charge' || !ch.overlay) }, { paths, dots, texts }); }
      if (a && a.stack) {
        // \chemabove{A}{x}: x set as an atom ($\rm x$) 1.5pt over A's box (or under it), centred on A
        const t = atomTex(a.stack.text), tb = TD.textBox(t, TEXT), m = vmetrics(a.stack.text);
        const k = /\\scriptscriptstyle/.test(a.stack.text) ? 0.5 : /\\scriptstyle/.test(a.stack.text) ? 0.7 : 1;
        const base = a.stack.dir < 0 ? (b as any).base - b.asc - 1.5 * PT - m.desc * k : (b as any).base + b.desc + 1.5 * PT + m.asc * k;
        // \chemabove's \vbox to the atom's height: the stacked text overhangs, outside TeX's box; \Chemabove's counts
        texts.push({ t, cx: (b as any).cx, cy: base - baseOff(TEXT) + tb.h / 2, b: tb, ink: [base - m.asc * k, base + m.desc * k], stack: a.cmd[0] === 'c' });
      }
    }
    // hooks: the first ? remembers the atom, the next one with that name draws a bond to it
    for (const h of sp.hooks) {
      const was = hooks.get(h.name);
      if (!was) { hooks.set(h.name, { v, k: h.atom }); continue; }
      hooks.delete(h.name);
      const ang = norm360((Math.atan2(-((v.boxes[h.atom] as any).cy - was.v.boxes[was.k].cy), (v.boxes[h.atom] as any).cx - was.v.boxes[was.k].cx) * 180) / Math.PI);
      drawBond({ sym: h.sym, arg: ['', '', '', '', h.tikz], hook: true }, was.v, was.k, v, h.atom, ang, null);
    }
    return v;
  }
  // a bond from atom a of vertex A to atom b of vertex B
  function drawBond(item: any, A: any, ka: any, B: any, kb: any, angle: any, ring: any) {
    const ba = A.boxes[ka], bb = B.boxes[kb];
    const ax = ba.cx, ay = ba.cy, bx = bb.cx, by = bb.cy;
    const L0 = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L0, uy = (by - ay) / L0;
    const exit = (b: any, sx: any, sy: any) => (b.empty ? 0 : Math.min(Math.abs(sx) > 1e-9 ? b.w / 2 / Math.abs(sx) : Infinity, Math.abs(sy) > 1e-9 ? (b.asc + b.desc) / 2 / Math.abs(sy) : Infinity));
    // (bond offset is a coordinate's length, scaled by chemfig style; double bond sep and cram width are node shifts,
    // scaled by atom style)
    const as = P.ascale || 1, ds = P.dsep * as, offA = ba.empty ? 0 : P.boff * (P.cscale || 1), offB = bb.empty ? 0 : P.boff * (P.cscale || 1);
    // TikZ's (A)--(B) runs between the borders; the offsets are taken along that, from each end (so a bond shorter
    // than its atoms, whose borders cross, is drawn backwards, as chemfig draws it)
    const ea = exit(ba, ux, uy), eb = exit(bb, ux, uy), qa = [ax + ux * ea, ay + uy * ea], qb = [bx - ux * eb, by - uy * eb];
    const Lq = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]), vx = Lq > 1e-9 ? (qb[0] - qa[0]) / Lq : ux, vy = Lq > 1e-9 ? (qb[1] - qa[1]) / Lq : uy;
    const p0 = [qa[0] + vx * offA, qa[1] + vy * offA], p1 = [qb[0] - vx * offB, qb[1] - vy * offB];
    const nx = vy, ny = -vx; // left of travel, on screen
    const tikz = (item.arg && item.arg[4]) || '';
    const own = bondStyle(tikz, warn, true), all = P.bondStyle ? bondStyle(P.bondStyle, null, true) : null;
    const sty = all ? { color: own.color || all.color, width: own.width || all.width, dash: own.dash || all.dash, none: own.none || (all.none && !own.color),
      op: own.op ?? all.op, sh0: own.sh0 ?? all.sh0, sh1: own.sh1 ?? all.sh1, snake: own.snake || all.snake } : own;
    const sw = sty.width || P.lw || LW, col = sty.color;
    // each line of the bond, shortened as its style says (a ring's double bond correction is a later shorten, so it wins)
    const seg = (q0: any, q1: any, sh0 = sty.sh0 || 0, sh1 = sty.sh1 || 0) => {
      const a = [q0[0] + vx * sh0, q0[1] + vy * sh0], b = [q1[0] - vx * sh1, q1[1] - vy * sh1];
      return sty.snake ? snakePath(a, b, sty.snake.amp, sty.snake.sl) : `M${r2(a[0])},${r2(a[1])}L${r2(b[0])},${r2(b[1])}`;
    };
    const off = (q: any, d: any) => [q[0] + nx * d, q[1] + ny * d];
    const sym = item.sym;
    const draw = [];
    if (!sty.none) {
      if (sym === '-') draw.push({ d: seg(p0, p1), sw, color: col, dash: sty.dash });
      else if (sym === '~') { draw.push({ d: seg(p0, p1), sw, color: col, dash: sty.dash }, { d: seg(off(p0, ds), off(p1, ds)), sw, color: col, dash: sty.dash }, { d: seg(off(p0, -ds), off(p1, -ds)), sw, color: col, dash: sty.dash }); }
      else if (sym[0] === '=') {
        let typ = sym === '=^' ? 1 : sym === '=_' ? 2 : 0;
        if (ring && typ === 0) typ = 1;
        if (typ === 0) draw.push({ d: seg(off(p0, ds / 2), off(p1, ds / 2)), sw, color: col, dash: sty.dash }, { d: seg(off(p0, -ds / 2), off(p1, -ds / 2)), sw, color: col, dash: sty.dash });
        else {
          const corr = ring ? P.dsep * Math.tan(Math.PI / ring.n) : 0, sg = typ === 1 ? 1 : -1;
          const s0 = ring && !offA ? sg * corr : sty.sh0 || 0, s1 = ring && !offB ? sg * corr : sty.sh1 || 0;
          draw.push({ d: seg(p0, p1), sw, color: col, dash: sty.dash }, { d: seg(off(p0, sg * ds), off(p1, sg * ds), s0, s1), sw, color: col, dash: sty.dash });
        }
      } else {
        // wedges: > and its kin are wide at the start, < at the end
        const wideStart = sym[0] === '>';
        const W = wideStart ? p0 : p1, N = wideStart ? p1 : p0, h = (as * P.cram) / 2, hn = (as * (P.lw || LW)) / 2;
        if (sym.length === 1) {
          const q = [off(W, h), off(W, -h), off(N, -hn), off(N, hn)];
          // (\filldraw with the bond's style, line join=miter, miter limit=1: a bevel)
          draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw, fill: col || true, color: col, join: 'bevel' });
        } else if (sym[1] === '|') {
          const q = [off(W, h), off(W, -h), N];
          draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw: sw, color: col, join: 'bevel' });
        } else {
          // hashed: dashes 1pt on 2pt off along the axis from the wide end, line width cram width, clipped to the triangle
          // (cram rectangle drops the clip: every dash as wide as the wide end; solid and hollow wedges don't change)
          const Lb = Math.hypot(N[0] - W[0], N[1] - W[1]) || 1, vx = (N[0] - W[0]) / Lb, vy = (N[1] - W[1]) / Lb, mx = vy, my = -vx;
          let d = '';
          for (let s0 = 0; s0 < Lb; s0 += P.dashOn + P.dashOff) {
            // (the dashes' line width is the cram width as written; the clip, a node shift, is scaled)
            const s1 = Math.min(Lb, s0 + P.dashOn), w0 = P.cramRect ? P.cram / 2 : h * (1 - s0 / Lb), w1 = P.cramRect ? P.cram / 2 : h * (1 - s1 / Lb);
            const c0 = [W[0] + vx * s0, W[1] + vy * s0], c1 = [W[0] + vx * s1, W[1] + vy * s1];
            d += `M${r2(c0[0] + mx * w0)},${r2(c0[1] + my * w0)}L${r2(c1[0] + mx * w1)},${r2(c1[1] + my * w1)}L${r2(c1[0] - mx * w1)},${r2(c1[1] - my * w1)}L${r2(c0[0] - mx * w0)},${r2(c0[1] - my * w0)}Z`;
          }
          draw.push({ d, sw: 0, fill: col || true, color: col });
        }
      }
    }
    if (sty.op != null && sty.op < 1) for (const p of draw) (p as any).op = sty.op;
    if ((sty.sh0 || sty.sh1 || sty.snake) && sym !== '-' && sym !== '~' && sym[0] !== '=') warn('A wedge bond\'s shorten or decoration isn\'t drawn here (it is kept in the code)');
    for (const p of draw) paths.push(p);
    if (item.mvName) (names.bonds as Record<string, any>)[item.mvName] = [p0[0] + (p1[0] - p0[0]) * item.mvPos, p0[1] + (p1[1] - p0[1]) * item.mvPos];
    bonds.push({ id: bonds.length, item, a: A, b: B, ka, kb, p0, p1, angle, ring, hook: !!item.hook, chain: item.parent, idx: item.pidx, sub: item.sub || null });
  }
  // walking the tree the way chemfig reads it
  function walk(chain: any, st: any) {
    // a chain's own start: branches from a ring vertex point outwards
    if (st.lastAction === 3 && !st.cycle) {
      const cy = st.parentCycle;
      st.defAngle = cy && cy.count === 0 ? st.prevAngle + 180 + st.corr(cy.n) : cy ? st.prevAngle - 90 + 180 / cy.n : st.defAngle;
    }
    if (st.cycle) st.defAngle = 0;
    st.curAngle = st.defAngle;
    if (chain.opt) {
      const f = split(chain.opt.trim().slice(1, -1)).map((x) => x.trim());
      const a = angleOf(f[0], st.prevAngle, P);
      if (a != null) { st.defAngle = a; st.prevAngle = a; st.curAngle = a; }
      if (f[1]) { const l = parseFloat(f[1]); if (isFinite(l)) st.defLen = l; }
      if (f[2]) st.defDep = parseInt(f[2], 10) - 1;
      if (f[3]) st.defArr = parseInt(f[3], 10) - 1;
      if (f[4]) st.defTikz = f[4];
    }
    if (st.cycle && st.cycle.count === 0) {
      st.curAngle = st.prevAngle;
      const c = st.cycle, n = c.n, R = ((P.ascale || 1) * st.defLen * P.sep) / (2 * Math.sin(Math.PI / n));
      const a = st.curAngle + c.init + 180 / n + 90, hv = c.hook.v.boxes[c.hook.k];
      c.cx = hv.cx + R * Math.cos(rad(a)); c.cy = hv.cy - R * Math.sin(rad(a));
      rings.push({ item: c.item, cx: c.cx, cy: c.cy, n, chain: c.item.chain, hook: c.hook.v });
      if (c.item.star === '**') {
        const r0 = (P.crc * st.defLen * P.sep) / (2 * Math.tan(Math.PI / n));
        let a0 = 0, a1 = 360, cs = '';
        if (c.item.arc) { const f = split(c.item.arc.slice(1, -1)).map((x) => x.trim()); if (f[0]) a0 = parseFloat(f[0]) || 0; if (f[1]) a1 = parseFloat(f[1]) || 360; cs = f.slice(2).filter(Boolean).join(','); }
        // the arc starts at a node shifted from the centre (atom style scales it) and has the radius as a path length
        // (chemfig style scales it): when the two differ the circle is off the ring's centre
        const r = r0 * (P.cscale || 1), sh = r0 * ((P.ascale || 1) - (P.cscale || 1)), ccx = c.cx + sh * Math.cos(rad(a0)), ccy = c.cy - sh * Math.sin(rad(a0));
        // **[start,end,style]: the circle's TikZ style (colour, width, dashes)
        const csy = bondStyle(cs, warn), look = { sw: csy.width || P.lw || LW, ...(csy.color ? { color: csy.color } : {}), ...(csy.dash ? { dash: csy.dash } : {}) };
        if (csy.none) { /* draw=none: no circle */ }
        else if (Math.abs(a1 - a0) >= 360) paths.push({ d: `M${r2(ccx + r)},${r2(ccy)}a${r2(r)},${r2(r)} 0 1,0 ${r2(-2 * r)},0a${r2(r)},${r2(r)} 0 1,0 ${r2(2 * r)},0Z`, ...look, circle: true });
        else {
          const pa = [ccx + r * Math.cos(rad(a0)), ccy - r * Math.sin(rad(a0))], pb = [ccx + r * Math.cos(rad(a1)), ccy - r * Math.sin(rad(a1))];
          paths.push({ d: `M${r2(pa[0])},${r2(pa[1])}A${r2(r)},${r2(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0},${a1 > a0 ? 0 : 1} ${r2(pb[0])},${r2(pb[1])}`, ...look });
        }
      }
    }
    const items = expand(chain.items, 0, st.prevAngle);
    // an index in the expanded list → the place in the chain as written (for the editor)
    const posOf = (k: any) => { for (; k < items.length; k++) if (!items[k].sub) return chain.items.indexOf(items[k]); return chain.items.length; };
    // what a bond added at a vertex would get by default: in the chain, and in a branch
    const defaults = (v: any) => {
      v.defAngle = norm360(st.defAngle);
      const c = st.cycle;
      v.branchDef = norm360(c ? (c.count === 0 ? st.prevAngle + 180 + st.corr(c.n) : st.prevAngle - 90 + 180 / c.n) : st.defAngle);
      v.prevAngle = st.prevAngle;
    };
    const realize = (g: any, idx: any) => {
      const pd = st.pending;
      st.pending = null;
      const v: any = place(g, { chain, idx: posOf(idx), ring: st.cycle ? st.cycle.item : null, fixed: pd.fixed }, pd.x, pd.y, pd.angle, pd.arr);
      v.inBond = pd.item;
      defaults(v);
      drawBond(pd.item, pd.from, pd.dep, v, v.k, pd.angle, st.cycle);
      st.corr0 = true;
      st.group = v; st.lastAction = 1;
      return v;
    };
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (it === st.skip) { st.skip = null; continue; }
      if (!it.sub) { it.parent = chain; it.pidx = chain.items.indexOf(it); }
      if (it.t === 'atom') {
        if (st.lastAction === 2) { realize(it, idx); continue; }
        if (!st.group) { st.group = place(it, { chain, idx: posOf(idx), first: true, ring: st.cycle ? st.cycle.item : null }, 0, 0, st.curAngle, st.defArr); defaults(st.group); st.group.root = true; st.lastAction = 1; continue; }
        // an atom that opens a branch, (C-…) or ([::90]C-…): centred on the last node chemfig drew (the first atom's
        // base point, another's centre: in A(-[2]B)(C-[6]D), B's, not A's), with no bond
        const at0 = chain.items.indexOf(it);
        if (chain.owner && chain.owner.item.t === 'branch' && at0 >= 0 && chain.items.slice(0, at0).every((x: any) => x.t === 'ws')) {
          const V = verts[verts.length - 1] || st.group, b = V.boxes[V.k], v: any = place(it, { chain, idx: posOf(idx), ring: null }, b.cx, V.root ? b.base : b.cy, null, st.defArr);
          defaults(v); st.group = v; st.lastAction = 1; continue;
        }
        warn(`"${it.raw.trim()}" follows something it can't attach to: write a bond before it`);
        continue;
      }
      if (it.t === 'bond') {
        if (st.lastAction === 2) realize(null, idx);
        if (!st.group) { st.group = place(null, { chain, idx: posOf(idx), first: true }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
        let angle, L = st.defLen;
        const arg = (it.arg || []).slice();
        // a name for \chemmove: -[@{name,pos}…]
        const nm = /^\s*@\{([^}]*)\}\s*/.exec(arg[0] || '') || /@\{([^}]*)\}/.exec(it.extra || '');
        if (nm) {
          if (arg[0]) arg[0] = arg[0].replace(/^\s*@\{[^}]*\}\s*/, '');
          const f = split(nm[1]).map((x) => x.trim());
          it.mvName = f[0]; it.mvPos = f[1] ? parseFloat(f[1]) : 0.5;
          if (!isFinite(it.mvPos)) it.mvPos = 0.5;
        }
        if (st.cycle) {
          st.cycle.count++;
          angle = norm360(st.prevAngle + 360 / st.cycle.n + st.cycle.init);
          st.cycle.init = 0;
        } else {
          const a = angleOf(arg[0], st.prevAngle, P);
          angle = a != null ? a : norm360(st.defAngle);
          if (arg[1]) { const l = parseFloat(arg[1]); if (isFinite(l)) L = l; }
        }
        st.curAngle = angle;
        const V = st.group, n = V.boxes.length;
        let dep = arg[2] ? parseInt(arg[2], 10) - 1 : st.defDep != null ? st.defDep : angle < 90 || angle > 270 ? n - 1 : 0;
        dep = Math.max(0, Math.min(n - 1, isFinite(dep) ? dep : 0));
        const arr = arg[3] ? parseInt(arg[3], 10) - 1 : st.defArr;
        it.angleUsed = angle; it.lenUsed = L;
        if (st.cycle && st.cycle.count >= st.cycle.n) {
          // the last side goes back to where the ring started
          const h = st.cycle.hook;
          if (st.cycle.count === st.cycle.n) drawBond(it, V, dep, h.v, h.k, angle, st.cycle);
          st.cycle.closed = true;
          st.prevAngle = angle; st.lastAction = 2; st.pending = null;
          if (idx < items.length - 1) warn('A ring has more bonds than sides: the extra ones aren\'t drawn');
          return;
        }
        const c = V.boxes[dep];
        const fixed = P.fixed && !st.cycle;
        const [sx, sy] = fixed ? edge(c, angle) : [c.cx, c.cy];
        const Ls = L * P.sep * (P.ascale || 1);
        st.pending = { item: it, angle, from: V, dep, arr: isFinite(arr) ? arr : null, fixed, x: sx + Ls * Math.cos(rad(angle)), y: sy - Ls * Math.sin(rad(angle)) };
        st.prevAngle = angle; st.lastAction = 2;
        continue;
      }
      if (it.t === 'branch') {
        if (st.lastAction === 2) realize(null, idx);
        if (!st.group) { st.group = place(null, { chain, idx: posOf(idx), first: true }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
        it.chain.owner = { chain, item: it };
        const sub = { ...st, pending: null, cycle: null, parentCycle: st.cycle ? { ...st.cycle } : st.parentCycle, lastAction: st.cycle ? 3 : st.lastAction };
        walk(it.chain, sub);
        continue;
      }
      if (it.t === 'ring') {
        if (st.lastAction === 2) realize(null, idx);
        // a ring that opens the molecule with an atom, *6(R-…): the atom is the ring's first vertex
        const lead = !st.group && st.lastAction !== 2 ? it.chain.items.findIndex((x: any) => x.t !== 'ws') : -1;
        const first = lead >= 0 && it.chain.items[lead].t === 'atom' ? it.chain.items[lead] : null;
        if (first) { first.parent = it.chain; first.pidx = lead; }
        if (!st.group) { st.group = place(first, { chain: first ? it.chain : chain, idx: first ? lead : posOf(idx), first: true, ring: first ? it : null }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
        const n = it.n, inner = !!st.cycle || st.lastAction === 3;
        const parentN = st.cycle ? st.cycle.n : st.parentCycle ? st.parentCycle.n : n;
        const init = inner ? 360 / parentN - 180 : -180 / n - 90 + st.corr(n);
        const V = st.group, nb = V.boxes.length, a = st.curAngle;
        const hk = a < 90 || a > 270 ? nb - 1 : 0;
        it.chain.owner = { chain, item: it };
        const sub = { ...st, pending: null, parentCycle: st.cycle, cycle: { n, count: 0, init, hook: { v: V, k: hk }, item: it }, lastAction: inner ? 3 : first ? 1 : st.lastAction, skip: first };
        walk(it.chain, sub);
        continue;
      }
    }
    if (st.lastAction === 2 && st.pending) realize(null, items.length);
  }
  const st: Record<string, any> = { defAngle: 0, defLen: 1, defDep: null, defArr: null, defTikz: '', prevAngle: 0, curAngle: 0, group: null, lastAction: 0, pending: null, cycle: null, parentCycle: null, corr0: false };
  st.corr = function (n: any) { return this.corr0 ? 0 : 180 / n; };
  walk(seg.chain, st);
  for (const [name] of hooks) if (name) { /* an unmatched hook draws nothing, as in chemfig */ }
  // TeX's bounding box: atoms' boxes and bond paths (not the line width, not the overlay charges)
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  for (const v of verts) for (const b of v.boxes) if (!b.empty) ext(b.x, b.base - b.asc, b.x + b.w, b.base + b.desc); else ext(b.cx, b.cy, b.cx, b.cy);
  for (const p of paths) {
    if (p.charge) continue;
    if (p.circle) { const m = /M(-?[\d.]+),(-?[\d.]+)a(-?[\d.]+)/.exec(p.d); const r = +m![3] + LW / 2, cx = +m![1] - (m![3] as any), cy = +m![2]; ext(cx - r, cy - r, cx + r, cy + r); continue; }
    const h = p.fill && !p.sw ? 0 : (p.sw || LW) / 2;
    for (const m of p.d.matchAll(/[MLA](?:[\d.]+,[\d.]+ \d \d,\d )?(-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1] - h, +m[2] - h, +m[1] + h, +m[2] + h);
    // a curve (a snake bond): its control points count, as in TikZ's box
    for (const m of p.d.matchAll(/C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)/g)) for (let j = 1; j < 7; j += 2) ext(+m[j] - h, +m[j + 1] - h, +m[j] + h, +m[j + 1] + h);
  }
  for (const t of texts) if (!t.box && !t.charge && !t.stack) ext(t.cx - (t.b.w - 2) / 2, t.ink ? t.ink[0] : t.cy - t.b.h / 2, t.cx + (t.b.w - 2) / 2, t.ink ? t.ink[1] : t.cy + t.b.h / 2);
  if (!(x2 >= x1)) { x1 = x2 = 0; y1 = y2 = 0; }
  return { verts, bonds, rings, paths, texts, dots, names, sep: P.sep, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}
// where a ray from an atom box's centre at ang (degrees, y up) leaves the box (TikZ's angle anchor)
function edge(b: any, ang: any) {
  if (b.empty || !(b.w + b.asc + b.desc)) return [b.cx, b.cy];
  const hw = b.w / 2, hh = (b.asc + b.desc) / 2, ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
  const t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity);
  return [b.cx + ux * t, b.cy + uy * t];
}
// \charge's marks: each centred on the box (with an extra sep of 1.5pt) at its angle, plus its offset.
// b: { cx, cy, w, asc, desc }; out: { paths, dots, texts } to add to
// the charge settings for one \charge[…]: \setcharge's, then its own options
const chargeOpts = (P: any, copt: any, warn: any) => (copt && String(copt).trim() ? applyCharge({ ...(P.charge || CHARGE()) }, readKV(copt), warn) : P.charge || CHARGE());
function chargeMarks(b: any, c: any, out: any) {
  const K = c.ch || CHARGE(), hw = b.w / 2 + K.extra, hh = (b.asc + b.desc) / 2 + K.extra;
  const ux = Math.cos(rad(c.angle)), uy = -Math.sin(rad(c.angle));
  const t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity);
  const x = b.cx + ux * (t + c.off), y = b.cy + uy * (t + c.off);
  const w = c.what.replace(/\\[,;!]/g, '').trim(), rot = rad(90 + c.angle), rx = Math.cos(rot), ry = -Math.sin(rot);
  const ov = c.overlay !== false;
  if (w === '\\:') { const d = K.sep / 2; out.dots.push({ x: x + rx * d, y: y + ry * d, r: K.r }, { x: x - rx * d, y: y - ry * d, r: K.r }); }
  else if (w === '\\.') out.dots.push({ x, y, r: K.r });
  else if (w === '\\|') { const d = K.len / 2; out.paths.push({ d: `M${r2(x + rx * d)},${r2(y + ry * d)}L${r2(x - rx * d)},${r2(y - ry * d)}`, sw: LW, charge: ov }); }
  else if (w === '\\"') {
    const d = K.len / 2, e = K.wid / 2, nx = ry, ny = -rx;
    const p = [[d, e], [-d, e], [-d, -e], [d, -e]].map(([u, v]) => `${r2(x + rx * u + nx * v)},${r2(y + ry * u + ny * v)}`);
    out.paths.push({ d: `M${p.join('L')}Z`, sw: LW, charge: ov });
  } else if (w) out.texts.push({ t: printable(w), cx: x, cy: y, b: TD.textBox(printable(w), TEXT), charge: ov });
}
// a bond's TikZ options. full: the caller draws a bond's opacity, shorten < and >, and a snake decoration too
function bondStyle(t: any, warn: any, full = false) {
  const r = { color: null, width: (null as any), dash: (null as any), none: false, op: (null as any), sh0: (null as any), sh1: (null as any), snake: (null as any), decorate: false };
  let deco: any = null;
  for (const it of split(t || '').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it);
    if (!m) { if (warn) warn(`The bond option "${it}" isn't drawn here (it is kept in the code)`); continue; }
    const k = m[1], v = m[2];
    if (k === 'draw' && v === 'none') { r.none = true; continue; }
    if (k === 'line width' && v) { r.width = len(v, LW); continue; }
    if (k === 'thick') { r.width = 0.8 * PT; continue; }
    if (k === 'very thick') { r.width = 1.2 * PT; continue; }
    if (k === 'dashed') { r.dash = 'dash'; continue; }
    if (k === 'dotted') { r.dash = 'dot'; continue; }
    if (k === 'solid') { r.dash = 'solid'; continue; } // a bond's own solid, over a dashed bond style
    // dash pattern=on a off b …: the lengths (pt when no unit is given); an odd list repeats, as PDF's dash array does
    if (k === 'dash pattern' && v) { const d = [...v.matchAll(/(on|off)\s+(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?/g)].map((q) => len(q[2] + (q[3] || 'pt'), 0)); if (d.length) { r.dash = d; continue; } }
    if (full && (k === 'opacity' || k === 'draw opacity') && v && isFinite(parseFloat(v))) { r.op = Math.max(0, Math.min(1, parseFloat(v))); continue; }
    if (full && (k === 'shorten <' || k === 'shorten >') && v && len(v, null) != null) { if (k === 'shorten <') r.sh0 = len(v, 0); else r.sh1 = len(v, 0); continue; }
    if (full && k === 'decorate' && v == null) { r.decorate = true; continue; }
    if (full && k === 'decoration' && v) { deco = unbrace(v); continue; }
    const col = (k === 'draw' || k === 'color') && v ? v : v == null ? k : null;
    if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
    // a chemfig setting among a bond's TikZ options: TikZ doesn't know it, and LaTeX stops there
    if (warn && CHEMFIG_KEYS.has(k)) { warn(`"${k}" is a chemfig setting, not a bond option: LaTeX stops on it here. Set it on the molecule, \\chemfig[${it}]{…}, or for the drawing, \\setchemfig{${it}}`); continue; }
    if (warn) warn(`The bond option "${it}" isn't drawn here (it is kept in the code)`);
  }
  // decorate with decoration=snake (amplitude 2.5pt, segment length 10pt unless given): the snake; another
  // decoration, or one without decorate, isn't drawn
  if (r.decorate) {
    const f = deco != null ? split(deco).map((x: any) => x.trim()).filter(Boolean) : [];
    const sn = { amp: 2.5 * PT, sl: 10 * PT };
    let ok = f.includes('snake');
    for (const it of f) {
      const q = /^(amplitude|segment length)\s*=\s*(.+)$/.exec(it);
      if (q && len(q[2], null) != null) { if (q[1] === 'amplitude') sn.amp = len(q[2], 0); else sn.sl = len(q[2], 0); }
      else if (it !== 'snake') ok = false;
    }
    if (ok && sn.sl > 0) r.snake = sn;
    else if (warn) warn(`The bond decoration "${deco ?? ''}" isn't drawn here (it is kept in the code)`);
  }
  return r;
}
// pgf's snake decoration along a line from a to b (pgflibrarydecorations.pathmorphing): states initial, down/up,
// end down/up and final, with \pgfpathsine and \pgfpathcosine as pgf draws them; amplitude to the left of travel
function snakePath(a: number[], b: number[], amp: number, sl: number) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const P2 = (q: number[]) => `${r2(q[0])},${r2(q[1])}`;
  if (!L) return `M${P2(a)}L${P2(b)}`;
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L, nx = ty, ny = -tx;
  const at = (s: number, h: number) => [a[0] + tx * s + nx * h, a[1] + ty * s + ny * h];
  let d = `M${P2(a)}`, s = 0, st = 'initial';
  const C = (c1: number[], c2: number[], e: number[]) => { d += `C${P2(at(c1[0], c1[1]))} ${P2(at(c2[0], c2[1]))} ${P2(at(e[0], e[1]))}`; };
  for (let n = 0; n < 100000; n++) {
    const rem = L - s;
    if (st === 'initial') {
      if (rem < 0.625 * sl) { st = 'final'; continue; }
      C([s + 0.125 * sl, 0], [s + 0.1875 * sl, amp], [s + 0.3125 * sl, amp]); s += 0.3125 * sl; st = 'down'; continue;
    }
    if (st === 'down' || st === 'up') {
      const g = st === 'down' ? -1 : 1, w = 0.25 * sl, h0 = -g * amp;
      if (rem < 0.8125 * sl) { st = st === 'down' ? 'end down' : 'end up'; continue; }
      // a cosine to the axis, then a sine to the other side
      C([s + 0.362 * w, h0], [s + 0.674 * w, h0 + 0.488 * g * amp], [s + w, 0]);
      C([s + w + 0.326 * w, 0.512 * g * amp], [s + w + 0.638 * w, g * amp], [s + 2 * w, g * amp]);
      s += 0.5 * sl; st = st === 'down' ? 'up' : 'down'; continue;
    }
    if (st === 'end down' || st === 'end up') {
      const g = st === 'end down' ? 1 : -1;
      C([s + 0.125 * sl, g * amp], [s + 0.1875 * sl, 0], [s + 0.3125 * sl, 0]); s += 0.3125 * sl; st = 'final'; continue;
    }
    break;
  }
  return d + `L${P2(b)}`;
}

// ---------------------------------------------------------------- scheme layout
// A frag is a piece laid out in its own frame (its baseline at y = 0): molecules, texts, paths, dots,
// arrows and child frags at offsets, and its TeX box bb { x1, y1, x2, y2 } (y down). Child frags know
// their parent and offset, so a name inside one can be found from any frag around it.
const frag = () => ({ paths: ([] as any[]), dots: [], texts: ([] as any[]), mols: [], arrows: [], kids: [], bb: (null as any), parent: null, off: null });
function ext(F: any, x1: any, y1: any, x2: any, y2: any) {
  const b = F.bb;
  if (!b) F.bb = { x1, y1, x2, y2 };
  else { b.x1 = Math.min(b.x1, x1); b.y1 = Math.min(b.y1, y1); b.x2 = Math.max(b.x2, x2); b.y2 = Math.max(b.y2, y2); }
}
const attach = (F: any, C: any, x: any, y: any) => { C.parent = F; C.off = [x, y]; F.kids.push(C); };
const toRoot = (F: any) => { let x = 0, y = 0; for (; F; F = F.parent) if (F.off) { x += F.off[0]; y += F.off[1]; } return [x, y]; };
// a named node or point { F, x, y, w, h, base } or { F, pt } as a box in frag T's frame (T null: the root's)
function relBox(e: any, T: any) {
  const a = toRoot(e.F), b = toRoot(T), dx = a[0] - b[0], dy = a[1] - b[1];
  if (e.pt) return { x: e.pt[0] + dx, y: e.pt[1] + dy, w: 0, h: 0, base: e.pt[1] + dy };
  return { x: e.x + dx, y: e.y + dy, w: e.w, h: e.h, base: e.base + dy };
}
// \setchemfig keys
function applyKV(P: any, kv: any, warn: any) {
  const map: Record<string, any> = { 'atom sep': 'sep', 'bond offset': 'boff', 'double bond sep': 'dsep', 'cram width': 'cram', 'compound sep': 'csep', 'arrow offset': 'aoff', 'arrow label sep': 'lsep', 'name sep': 'nameSep',
    'cram dash width': 'dashOn', 'cram dash sep': 'dashOff', 'harrow minwidth': 'hminw', 'label xsep': 'lxsep', 'hreac sep': 'hsep', '+ sep left': 'plusL', '+ sep right': 'plusR', '+ vshift': 'plusV' };
  for (const [k, v] of Object.entries<any>(kv)) {
    // (an empty value is chemfig's default again, as \CF_defifempty sets it)
    if (map[k]) P[map[k]] = String(v ?? '').trim() === '' ? (defaults() as any)[map[k]] : len(v, P[map[k]]);
    else if (k === 'angle increment') P.inc = parseFloat(v) || 45;
    else if (k === 'arrow coeff') P.acoeff = parseFloat(v) || 1;
    else if (k === 'arrow angle') P.aangle = parseFloat(v) || 0;
    else if (k === 'fixed length') P.fixed = v !== 'false';
    else if (k === 'cram rectangle') P.cramRect = v !== 'false';
    else if (k === 'cycle radius coeff') P.crc = parseFloat(v) || 0.75;
    // arrow head=-CF (chemfig's), -stealth, -latex, -> …: the tip every scheme arrow ends in
    else if (k === 'arrow head') P.ahead = headKind(v, warn);
    // \setandsign{before,after,raise} (1.x): the spacing every bare \+ takes
    else if (k === 'and sign') { const f = split(String(v || '')).map((x: any) => x.trim()); if (f[0]) P.plusL = len(f[0], P.plusL); if (f[1]) P.plusR = len(f[1], P.plusR); if (f[2]) P.plusV = len(f[2], 0); }
    // the debug frames, names and marks chemfig draws when asked
    else if (k === 'scheme debug' || k === 'debug' || k === 'hreac debug' || k === 'show cntcycle') { if (String(v).trim() !== 'false') warn(`"${k}=${v}" draws chemfig's debugging marks, which aren't drawn here (it is kept in the code)`); }
    else if (k === 'autoreset cntcycle' || k === 'save' || k === 'save name') { /* nothing to draw */ }
    else if (k === 'arrow style') { P.astyle = String(v || ''); bondStyle(P.astyle, warn); }
    // every bond's TikZ style, put before the bond's own options (which win)
    else if (k === 'bond style') { P.bondStyle = String(v || ''); bondStyle(P.bondStyle, warn); }
    else if (k === 'atom style') atomStyle(P, v, warn);
    else if (k === 'chemfig style') chemfigStyle(P, v, warn);
    // where the drawing sits on its line of text: the drawing itself doesn't change
    else if (k === 'baseline') { /* nothing to draw */ }
    else if (k === 'compound style') P.cstyle = String(v || '');
    else warn(`The setting "${k}" isn't drawn here (it is kept in the code)`);
  }
}
// atom style={…}: TikZ options at the end of every node's style (each setting replaces the last). scale=k scales the
// atoms and every node shift chemfig places with: atom sep, ring centres, the aromatic circle's start, double bond sep
// and cram width; path lengths (bond offset, line width, the circle's radius, a ring's double bond shortening) stay.
// A colour is the atoms' text colour.
function atomStyle(P: any, v: any, warn: any) {
  P.ascale = 1; P.acolor = null;
  for (const it of split(String(v || '')).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it), k = m ? m[1].trim() : it, w = m && m[2] != null ? unbrace(m[2]).trim() : null;
    const c = TD.tikzColor && (w == null ? TD.tikzColor(k) : (k === 'color' || k === 'text') ? TD.tikzColor(w) : null);
    if (k === 'scale' && w != null && parseFloat(w) > 0 && /^[\d.]+$/.test(w)) P.ascale = parseFloat(w);
    else if (c) P.acolor = c;
    else warn(`The atom style "${it}" isn't drawn here (it is kept in the code)`);
  }
}
// chemfig style={…}: TikZ options of the molecule's picture. scale=k scales what chemfig computes as coordinates (bond
// offset, the aromatic circle's radius), not the atoms' places; line width is every bond's
function chemfigStyle(P: any, v: any, warn: any) {
  P.cscale = 1; P.lw = LW;
  for (const it of split(String(v || '')).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it), k = m ? m[1].trim() : it, w = m && m[2] != null ? unbrace(m[2]).trim() : null;
    if (k === 'scale' && w != null && parseFloat(w) > 0 && /^[\d.]+$/.test(w)) P.cscale = parseFloat(w);
    else if (k === 'line width' && w != null && len(w, null) != null) P.lw = len(w, LW);
    else if (k === 'thick' || k === 'very thick' || k === 'thin') P.lw = { thick: 0.8, 'very thick': 1.2, thin: 0.4 }[k]! * PT;
    else warn(`The chemfig style "${it}" isn't drawn here (it is kept in the code)`);
  }
}
// (name.anchor[style]) → { n, a, s }
function endOf(t: any) {
  t = String(t || '').trim();
  let s = '';
  const b = t.indexOf('[');
  if (b >= 0) { const e = close(t, b); s = t.slice(b + 1, e < 0 ? t.length : e).trim(); t = t.slice(0, b).trim(); }
  // (a name in braces, @{a}, is that name)
  const nm = (x: string) => x.replace(/^(@?)\{([^{}]*)\}$/, '$1$2');
  const d = t.indexOf('.', t.lastIndexOf('}') + 1);
  return d < 0 ? { n: nm(t), a: '', s } : { n: nm(t.slice(0, d).trim()), a: t.slice(d + 1).trim(), s };
}
// an arrow's (n1.a1[s1]--n2.a2[s2])
function arrowEnds(names: any) {
  const t = String(names || '').trim();
  if (!t) return { n1: '', a1: '', s1: '', n2: '', a2: '', s2: '' };
  const inner = t.slice(1, -1);
  let d = 0, k = -1;
  for (let i = 0; i < inner.length - 1; i++) { const c = inner[i]; if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--; else if (!d && c === '-' && inner[i + 1] === '-') { k = i; break; } }
  const A = endOf(k < 0 ? inner : inner.slice(0, k)), B = endOf(k < 0 ? '' : inner.slice(k + 2));
  return { n1: A.n, a1: A.a, s1: A.s, n2: B.n, a2: B.a, s2: B.s };
}
const STY: Record<string, any> = { left: 'east', right: 'west', above: 'south', below: 'north', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
// a compound's TikZ style: its anchor, inner sep, shift, the delimiters drawn beside it and its frame (draw, line
// width, rounded corners, opacity). compound style={…} comes first, then the anchor, then the arrow's own style
function compoundStyle(style: any, dflt: any, P: any, warn: any) {
  const o: Record<string, any> = { anchor: dflt, sep: 0, dx: 0, dy: 0, ld: '', rd: '', draw: false, color: null, lw: LW, rc: 0, op: 1, top: null };
  const read = (st: any, depth: number) => {
    for (const it of split(st || '').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it)!, k = m[1].trim(), v = m[2] == null ? null : unbrace(m[2]);
      if (STY[it]) o.anchor = STY[it];
      else if (k === 'anchor' && v) o.anchor = v;
      else if (v == null && P.styles && P.styles[k] != null && depth < 10) read(P.styles[k], depth + 1);
      else if (k === 'inner sep' && v != null) o.sep = len(v, 0);
      else if (k === 'xshift' && v != null) o.dx += len(v, 0);
      else if (k === 'yshift' && v != null) o.dy -= len(v, 0);
      else if (k === 'left delimiter' && v != null) o.ld = v;
      else if (k === 'right delimiter' && v != null) o.rd = v;
      else if (k === 'draw' && (v == null || (TD.tikzColor && TD.tikzColor(v)))) { o.draw = true; if (v != null) o.color = TD.tikzColor(v); }
      else if (k === 'line width' && v != null && len(v, null) != null) o.lw = len(v, LW);
      else if (LWS[k] != null && v == null) o.lw = LWS[k] * PT;
      else if (k === 'rounded corners') o.rc = v == null ? 4 * PT : len(v, 0);
      else if (k === 'sharp corners' && v == null) o.rc = 0;
      else if (k === 'semitransparent' && v == null) o.op = 0.5;
      else if ((k === 'opacity' || k === 'draw opacity') && v != null && isFinite(parseFloat(v))) o.op = parseFloat(v);
      else if (k === 'text opacity' && v != null && isFinite(parseFloat(v))) o.top = parseFloat(v);
      else if (/^(outer sep|minimum size|minimum width|minimum height)$/.test(k)) {}
      else warn(`The compound style "${it}" isn't drawn here (it is kept in the code)`);
    }
  };
  if (P.cstyle) { read(P.cstyle, 0); o.anchor = dflt; }
  read(style, 0);
  // (opacity is the text's too, unless text opacity says otherwise)
  if (o.draw && (o.top ?? o.op) < 1) warn('A compound\'s see-through text isn\'t drawn here (it is kept in the code)');
  return o;
}
const LWS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
// a rectangle with rounded corners of radius rc (TikZ's rounded corners: arcs at each corner, at most half a side)
function roundRect(x: number, y: number, w: number, h: number, rc: number) {
  const r = Math.max(0, Math.min(rc, w / 2, h / 2));
  if (!r) return `M${r2(x)},${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
  const a = (dx: number, dy: number) => `a${r2(r)},${r2(r)} 0 0,1 ${r2(dx)},${r2(dy)}`;
  return `M${r2(x + r)},${r2(y)}h${r2(w - 2 * r)}${a(r, r)}v${r2(h - 2 * r)}${a(-r, r)}h${r2(-(w - 2 * r))}${a(-r, -r)}v${r2(-(h - 2 * r))}${a(r, -r)}Z`;
}

// Pieces side by side on the baseline: molecules, + signs, names, text, subschemes, delimiters, charges.
// lead: a top-level line of code, where TeX sets every space (each line break after a \definesubmol…).
// G: what the whole drawing shares: names, the compound counter, \chemname's depth, \chemmove calls.
function layPieces(segs: any, P: any, warn: any, G: any, lead0?: any) {
  const F: any = frag();
  F.pieces = [];
  let x = 0, pendingSpace = false, asc = 0, desc = 0;
  const put = (p: any) => { F.pieces.push(p); asc = Math.max(asc, p.asc); desc = Math.max(desc, p.desc); };
  const kid = (C: any, kind: any, g: any) => {
    const b = C.bb || { x1: 0, y1: 0, x2: 0, y2: 0 }, w = b.x2 - b.x1;
    attach(F, C, x - b.x1, 0);
    put({ kind, seg: g, x, w, asc: -b.y1, desc: b.y2 });
    x += w;
  };
  const bo = baseOff(TEXT);
  // a run of text between compounds (or around them), spaces as TeX sets them
  const text = (g: any, t: string) => {
    if (!t.trim()) {
      if (lead0 && !F.pieces.length && /\s/.test(t) && g !== segs[0]) x += 3.333 * PT;
      else if (F.pieces.length && /\s/.test(t)) pendingSpace = true;
      return;
    }
    const lead = /^\s/.test(t), trail = /\s$/.test(t);
    let body = t.trim();
    if ((lead || pendingSpace) && (F.pieces.length || (lead0 && g !== segs[0]))) x += 3.333 * PT;
    // \parbox{w}{line}: a box w wide, its one line centred (\centering) or from the left, the box's middle on the maths
    // axis (2.5pt up), as LaTeX's \parbox[c] sets it
    const pb = /^\\parbox\s*(?:\[c\])?\s*\{([^{}]*)\}\s*\{([\s\S]*)\}$/.exec(body), pw = pb ? len(pb[1].trim(), null) : null;
    let pbc = '', pbMid = false;
    if (pb && pw != null && close(body, body.length - pb[2].length - 2) === body.length - 1 && !/\\\\|\\par\b|\n\s*\n/.test(pb[2])) {
      pbc = pb[2].trim();
      for (let q; (q = /^\{\s*([\s\S]*)\}$/.exec(pbc)) && close(pbc, 0) === pbc.length - 1 || (q = /^\\centering(?![A-Za-z])\s*([\s\S]*)$/.exec(pbc)); ) { if (/^\\centering/.test(pbc)) pbMid = true; pbc = q[1].trim(); }
      // (a line wider than the box: TeX breaks it at its spaces into lines, which aren't set here; one word stays
      // one line, from the box's left edge)
      if ((TD.textBox(printable(pbc), TEXT).w - 2) > pw + 0.5 * PT && /\S\s+\S/.test(pbc.replace(/\\[A-Za-z]+\s*/g, ''))) { warn(`The \\parbox{${pb[1].trim()}} text is wider than its box: TeX breaks it into lines, which aren't drawn here (it is kept in the code)`); pbc = ''; }
    }
    if (pbc) {
      const c = pbc, mid = pbMid;
      const tt = printable(c), b = TD.textBox(tt, TEXT), m = vmetrics(c.replace(/\$/g, '').replace(/\\text\w*\s*/g, ''));
      const hd = Math.max(m.asc, 0.683 * EM) + m.desc, top = -(hd / 2 + 2.5 * PT), base = top + Math.max(m.asc, 0.683 * EM);
      F.texts.push({ t: tt, cx: x + (mid && b.w - 2 < pw ? pw / 2 : (b.w - 2) / 2), cy: base - bo + b.h / 2, b, seg: g });
      put({ kind: 'text', seg: g, x, w: pw, asc: -top, desc: hd + top });
      x += pw; pendingSpace = trail; return;
    }
    // {\tiny text}: the text in its own size
    let st = TEXT, k = 1;
    const sz = body[0] === '{' && close(body, 0) === body.length - 1 ? /^\{\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![A-Za-z])\s*([\s\S]*)\}$/.exec(body) : null;
    if (sz) { st = { ...TEXT, size: SIZES[sz[1]] * PT }; k = st.size / TEXT.size; body = sz[2].trim(); }
    const tt = printable(body), b = TD.textBox(tt, st), m0 = vmetrics(body.replace(/\$/g, '')), m = { asc: m0.asc * k, desc: m0.desc * k };
    const sbo = st === TEXT ? bo : baseOff(st);
    F.texts.push({ t: tt, cx: x + (b.w - 2) / 2, cy: -sbo + b.h / 2, b, seg: g, ...(st !== TEXT ? { st } : {}) });
    // lines after the first hang below the first line's baseline: they count in the depth, so a label of
    // several lines stays on its own side of the arrow
    const lines = tt.split('\n').length, more = lines > 1 ? (b.h * (lines - 1)) / lines : 0;
    put({ kind: 'text', seg: g, x, w: b.w - 2, asc: Math.max(m.asc, 0.683 * EM * k), desc: Math.max(m.desc, /[gjpqy,;]/.test(body) ? 0.194 * EM * k : 0) + more });
    x += b.w - 2; pendingSpace = trail;
  };
  for (const g of segs) {
    if (g.t === 'text') {
      for (const part of spacing(topSizes(g.raw.replace(/%[^\n]*(\n[ \t]*)?/g, '')).rest)) {
        if (part.sp == null) { text(g, part.text); continue; }
        if (pendingSpace && F.pieces.length) x += 3.333 * PT;
        pendingSpace = false; x += part.sp;
      }
      continue;
    }
    if (pendingSpace && F.pieces.length) x += 3.333 * PT;
    pendingSpace = false;
    // \setchemfig, \setcharge and their resets: from here to the end of this run (a line, a scheme's compound, the
    // inside of \chemleft…\chemright), as TeX's grouping has it; what comes before keeps the settings it had
    if (g.t === 'set' && !g.tikz) { P = { ...P, charge: { ...P.charge } }; if (g.charge) applyCharge(P.charge, g.kv, warn); else applyKV(P, g.kv, warn); continue; }
    if (g.t === 'reset') { P = g.charge ? { ...P, charge: CHARGE() } : { ...defaults(), submols: P.submols, styles: P.styles, charge: P.charge }; continue; }
    if (g.t === 'mol') {
      const L = layMol(g, molP(g, P, warn), warn), mx = x - L.bb.x;
      F.mols.push({ seg: g, L, x: mx, y: 0 });
      for (const [n, b] of Object.entries<any>(L.names.atoms)) G.names[n] = { F, x: b.x + mx, y: b.base - b.asc, w: b.w, h: b.asc + b.desc, base: b.base };
      for (const [n, q] of Object.entries<any>(L.names.bonds)) G.names[n] = { F, pt: [q[0] + mx, q[1]] };
      put({ kind: 'mol', seg: g, x, w: L.bb.w, asc: -L.bb.y, desc: L.bb.y + L.bb.h });
      x += L.bb.w; continue;
    }
    if (g.t === 'plus') {
      let a = P.plusL, b = P.plusR, vs = P.plusV || 0;
      const m = /^\\\+\s*\{([^}]*)\}/.exec(g.raw);
      if (m) { const f = split(m[1]).map((s) => s.trim()); if (f[0]) a = len(f[0], a); if (f[1]) b = len(f[1], b); if (f[2]) vs = len(f[2], 0); }
      const pw = 0.778 * EM, tb = TD.textBox('$+$', TEXT);
      F.texts.push({ t: '$+$', cx: x + a + pw / 2, cy: -vs - bo + tb.h / 2, b: tb, seg: g });
      put({ kind: 'plus', seg: g, x, w: a + pw + b, asc: 0.583 * EM + vs, desc: Math.max(0, 0.083 * EM - vs) });
      x += a + pw + b; continue;
    }
    if (g.t === 'name') {
      // \chemname: the name centred under the molecule, its top at the deepest molecule so far (since
      // \chemnameinit) plus name sep; \chemname* leaves that depth alone
      const C: any = layPieces(g.inner, P, warn, G);
      const star = /^\\chemname\s*\*/.test(g.head);
      const om = /\[([^\]]*)\]/.exec(g.head), sep = om ? len(om[1].trim(), P.nameSep) : P.nameSep;
      const dp = star ? C.desc : Math.max(C.desc, G.nameDp);
      if (!star) G.nameDp = dp;
      let base = null, d = C.desc;
      for (const t of g.name.split('\\\\').map((s: any) => s.trim())) {
        const tt = printable(t), b = TD.textBox(tt || ' ', TEXT), m = vmetrics(t.replace(/\$/g, ''));
        base = base == null ? dp + sep + Math.max(m.asc, 0.683 * EM) : base + 12 * PT;
        if (t) C.texts.push({ t: tt, cx: C.w / 2, cy: base - bo + b.h / 2, b, name: g });
        d = Math.max(d, base + m.desc);
      }
      C.bb!.y2 = Math.max(C.bb!.y2, d);
      kid(C, 'name', g); continue;
    }
    if (g.t === 'sub' || g.t === 'scheme') { kid(layScheme(g.t === 'sub' ? g.inner : g.body, P, warn, G, g.opt), g.t, g); continue; }
    if (g.t === 'lr') { kid(layLR(g, P, warn, G), 'lr', g); continue; }
    if (g.t === 'chg') { kid(layCharge(g, P, warn, G), 'chg', g); continue; }
    // \chemmove draws once everything is placed, with the names known at this point
    if (g.t === 'move' || g.t === 'pdelim') { G.moves.push({ seg: g, snap: { ...G.names }, at: { F, pt: [x, 0] } }); continue; }
    if (g.t === 'nameinit') { G.nameDp = 0; continue; }
  }
  F.w = x; F.asc = asc; F.desc = desc;
  F.bb = { x1: 0, y1: -asc, x2: x, y2: desc };
  F.P = P; // the settings at the end of the run
  return F;
}
// \chemleft[ … \chemright]: delimiters as tall as the contents (TeX's \left…\right: delimiter factor 901,
// shortfall 5pt)
function layLR(g: any, P: any, warn: any, G: any) {
  const C: any = layPieces(g.inner, P, warn, G), F = frag();
  // chemfig's \chemleft: \left over a rule as tall as the contents, raised to centre on them, so the
  // delimiter is sized for half that height plus the maths axis (2.5pt) and centred on the contents
  const ax = 2.5 * PT, D = (C.asc + C.desc) / 2 + ax, mid = (C.desc - C.asc) / 2;
  const H = Math.max(0.901 * 2 * D, 2 * D - 5 * PT), top = mid - H / 2, bot = mid + H / 2;
  // a space just inside either delimiter is set (\chemleft[ \chemfig{…} \chemright])
  const bare = (q: any) => (q && q.t === 'text' ? q.raw.replace(/%[^\n]*(\n[ \t]*)?/g, '') : null);
  const first = bare(g.inner[0]), last = bare(g.inner[g.inner.length - 1]);
  const s1 = first != null && /^\s/.test(first) ? 3.333 * PT : 0, s2 = last != null && /\s$/.test(last) && (g.inner.length > 1 || first!.trim()) ? 3.333 * PT : 0;
  // each side is its own \left…\right. pair: the invisible . adds \nulldelimiterspace (1.2pt) inside it
  const nul = 1.2 * PT, l = delim(g.l, F, 0, top, bot, warn, false), x0 = l.w + nul + s1;
  attach(F, C, x0, 0);
  const r = delim(g.r, F, x0 + C.w + s2 + nul, top, bot, warn, true);
  F.bb = { x1: 0, y1: Math.min(-C.asc, l.top, r.top), x2: x0 + C.w + s2 + nul + r.w, y2: Math.max(C.desc, l.bot, r.bot) };
  return F;
}
// TeX's delimiters, as \left…\right picks them (Computer Modern, measured with pdfLaTeX): the smallest of the font's
// sizes at least as tall as asked (1, 1.2, 1.8, 2.4, 3em: the normal glyph, \big, \Big, \bigg, \Bigg), then one built
// from pieces, 3.6em and up by 0.6em (| goes from 1em to pieces, 1.2em up by 0.6em). Each size has its own width (em).
const DELIMS: Record<string, { w: number[]; ext: number; sizes?: number[] }> = {
  '[': { w: [0.278, 0.417, 0.472, 0.528, 0.583], ext: 0.667 },
  '(': { w: [0.389, 0.458, 0.597, 0.736, 0.792], ext: 0.875 },
  '\\{': { w: [0.5, 0.583, 0.667, 0.75, 0.806], ext: 0.889 },
  '|': { w: [0.278], ext: 0.333, sizes: [1] },
};
const DELIM_OF: Record<string, string> = { '[': '[', ']': '[', '(': '(', ')': '(', '\\{': '\\{', '\\}': '\\{', '|': '|', '\\lbrack': '[', '\\rbrack': '[', '\\lbrace': '\\{', '\\rbrace': '\\{', '\\vert': '|', '\\lvert': '|', '\\rvert': '|' };
const DELIM_SHUT: Record<string, boolean> = { ']': true, ')': true, '\\}': true, '\\rbrack': true, '\\rbrace': true };
// the delimiter `tok` for a span `need` tall: its kind, width, height, and whether it is a closing one
function delimFit(tok: any, need: number) {
  const t = String(tok || '').trim(), kind = DELIM_OF[t];
  if (!kind) return { kind: t === '.' ? '.' : null, w: 1.2 * PT, T: need, shut: false, t }; // \right. : \nulldelimiterspace
  const D = DELIMS[kind], sizes = D.sizes || [1, 1.2, 1.8, 2.4, 3];
  for (let k = 0; k < sizes.length; k++) if (sizes[k] * EM >= need - 1e-6) return { kind, w: D.w[k] * EM, T: sizes[k] * EM, shut: !!DELIM_SHUT[t], t };
  const base = kind === '|' ? 1.2 : 3.6, n = Math.max(0, Math.ceil((need / EM - base) / 0.6 - 1e-6));
  return { kind, w: D.ext * EM, T: (base + 0.6 * n) * EM, shut: !!DELIM_SHUT[t], t };
}
// a delimiter drawn into F from x, sized for the span between top and bot (and centred on it); returns its width
// and the top and bottom it reaches
function delim(tok: any, F: any, x: any, top: any, bot: any, warn: any, right: any) {
  const m = (top + bot) / 2, f = delimFit(tok, bot - top);
  if (!f.kind) { warn(`The delimiter "${f.t}" isn't drawn here`); return { w: f.w, top: m, bot: m }; }
  if (f.kind === '.') return { w: f.w, top: m, bot: m };
  const w = f.w, H = f.T, y0 = m - H / 2, y1 = m + H / 2, sw = 0.5 * PT;
  // drawn as the left one across its width; a closing one is mirrored
  const X = (u: number) => r2(f.shut ? x + w - u * w : x + u * w), Y = (v: number) => r2(v);
  let d;
  if (f.kind === '[') d = `M${X(0.88)},${Y(y0)}L${X(0.42)},${Y(y0)}L${X(0.42)},${Y(y1)}L${X(0.88)},${Y(y1)}`;
  else if (f.kind === '(') {
    // curved ends, straight between them once it is tall (the pieces of a built one); a crescent, thickest midway
    const c = Math.min(H / 2, 1.5 * EM), t = Math.min(0.07 * EM, 0.12 * w), xo = 0.25, xi = xo + t / w;
    const side = (u: number) => `C${X(0.5 * u + 0.4)},${Y(y0 + 0.2 * c)} ${X(u)},${Y(y0 + 0.55 * c)} ${X(u)},${Y(y0 + c)}L${X(u)},${Y(y1 - c)}C${X(u)},${Y(y1 - 0.55 * c)} ${X(0.5 * u + 0.4)},${Y(y1 - 0.2 * c)}`;
    d = `M${X(0.85)},${Y(y0)}${side(xo)} ${X(0.85)},${Y(y1)}`;
    // the thicker middle: a second stroke just inside the first, meeting it at the ends
    F.paths.push({ d: `M${X(0.85)},${Y(y0)}${side(xi)} ${X(0.85)},${Y(y1)}`, sw });
  }
  else if (f.kind === '|') d = `M${X(0.5)},${Y(y0)}L${X(0.5)},${Y(y1)}`;
  else {
    const k = Math.min(0.08 * H, 0.3 * EM);
    d = `M${X(0.85)},${Y(y0)}Q${X(0.5)},${Y(y0)} ${X(0.5)},${Y(y0 + k)}L${X(0.5)},${Y(m - k)}Q${X(0.5)},${Y(m)} ${X(0.12)},${Y(m)}Q${X(0.5)},${Y(m)} ${X(0.5)},${Y(m + k)}L${X(0.5)},${Y(y1 - k)}Q${X(0.5)},${Y(y1)} ${X(0.85)},${Y(y1)}`;
  }
  F.paths.push({ d, sw });
  return { w, top: y0, bot: y1 };
}
// \charge{…}{…} around a whole box (outside \chemfig)
function layCharge(g: any, P: any, warn: any, G: any) {
  const C: any = layPieces(g.inner, P, warn, G), F = frag();
  attach(F, C, 0, 0);
  const ch = chargeOpts(P, g.opt, warn), overlay = !(g.cmd === 'Charge' || !ch.overlay);
  for (const c of g.charges) chargeMarks({ cx: C.w / 2, cy: (C.desc - C.asc) / 2, w: C.w, asc: C.asc, desc: C.desc }, { ...c, ch, overlay }, F);
  F.bb = { x1: 0, y1: -C.asc, x2: C.w, y2: C.desc };
  if (!overlay) for (const q of F.texts) ext(F, q.cx - (q.b.w - 2) / 2, q.cy - q.b.h / 2, q.cx + (q.b.w - 2) / 2, q.cy + q.b.h / 2);
  return F;
}

// \schemestart … \schemestop (and \subscheme): chemfig's own reading. A compound is what stands between
// arrows; it is set when the next arrow (or \merge, or the end) comes, named c1, c2… (or as the arrow
// says), anchored on the point the last arrow ended at by the angle it came from (180 + angle).
//   \arrow(n1.a1--n2.a2)     from n1 (the compound just set) at its a1, the next compound named n2 at its a2
//   \arrow(@n1--n2)          the arrow leaves from the compound named n1
//   \arrow(@n1--@n2)         an arrow between two compounds already placed (drawn at the end)
//   \merge>(c1)(c2)--(c3)    lines from compounds to a bar, an arrow from the bar to the next compound
function layScheme(body: any, P0: any, warn: any, G: any, opt: any) {
  const P = { ...P0 };
  const o = String(opt || '').trim();
  // chemfig hands it to \setchemfig: settings, not an angle (\subscheme[90] leaves the arrows level)
  if (o && !/^-?[\d.]+$/.test(o)) applyKV(P, readKV(o), warn);
  const S = frag();
  G.level++;
  if (G.level === 1) G.cnt = 0;
  const pt = (x: any, y: any) => ({ x, y, w: 0, h: 0, base: y });
  G.names['c' + G.cnt] = { F: S, ...pt(0, 0) };
  ext(S, 0, 0, 0, 0);
  let cur = pt(0, 0), nextName = '', nextStyle = '', nextAnchor = G.nextAnchor || 'text', pend: any[] = [];
  const direct: any[] = [];
  const visible = (gs: any) => gs.some((g: any) => ['mol', 'name', 'plus', 'sub', 'lr', 'chg'].includes(g.t) || (g.t === 'text' && g.raw.replace(/%[^\n]*/g, '').trim()));
  const lookup = (n: any) => { const e = G.names[n]; if (!e) { warn(`No compound is named "${n}"`); return null; } return relBox(e, S); };
  const ctr = (b: any) => [b.x + b.w / 2, b.y + b.h / 2];
  function display(name: any, style: any) {
    const gs = pend;
    pend = [];
    if (!visible(gs)) { if (gs.length) layPieces(gs, P, warn, G); return; }
    G.cnt++;
    const nm = name || nextName || 'c' + G.cnt;
    const keep = G.nextAnchor;
    G.nextAnchor = nextAnchor;
    // (spaces at a compound's ends are dropped, but one after a \setchemfig… at its start is set, as on a line)
    const C: any = layPieces(gs, P, warn, G, true);
    G.nextAnchor = keep;
    const cs = compoundStyle([nextStyle, style].filter(Boolean).join(','), nextAnchor, P, warn), is = cs.sep;
    // the node: the compound with inner sep around it
    const [ax, ay] = anchorPt({ x: -is, y: -C.asc - is, w: C.w + 2 * is, h: C.asc + C.desc + 2 * is }, 0, cs.anchor);
    const [cx, cy] = ctr(cur), ox = cx - ax + cs.dx, oy = cy - ay + cs.dy;
    attach(S, C, ox, oy);
    cur = { x: ox - is, y: oy - C.asc - is, w: C.w + 2 * is, h: C.asc + C.desc + 2 * is, base: oy };
    ext(S, cur.x, cur.y, cur.x + cur.w, cur.y + cur.h);
    if (cs.draw) S.paths.push({ d: roundRect(cur.x, cur.y, cur.w, cur.h, cs.rc), sw: cs.lw, color: cs.color, ...(cs.op < 1 ? { op: cs.op } : {}) });
    // left/right delimiter (TikZ's matrix library): $\left[ \vcenter{node height} \right.$ against the node's side
    if (cs.ld || cs.rd) {
      const h = cur.h, H = Math.max(0.901 * h, h - 5 * PT), m = cur.y + h / 2, top = m - H / 2, bot = m + H / 2, nul = 1.2 * PT;
      const wOf = (d: any) => delim(d, frag(), 0, top, bot, () => {}, false).w;
      if (cs.ld) { const x = cur.x - nul - wOf(cs.ld), e = delim(cs.ld, S, x, top, bot, warn, false); ext(S, x, e.top, cur.x, e.bot); }
      if (cs.rd) { const x = cur.x + cur.w + nul, e = delim(cs.rd, S, x, top, bot, warn, true); ext(S, cur.x + cur.w, e.top, x + e.w, e.bot); }
    }
    G.names[nm] = { F: S, ...cur };
    G.comps.push({ name: nm, entry: G.names[nm], level: G.level, segs: gs });
    nextName = ''; nextStyle = '';
  }
  const num = (v: any, d: any) => (v != null && String(v).trim() !== '' && isFinite(parseFloat(v)) ? parseFloat(v) : d);
  function arrow(A: any) {
    const E = arrowEnds(A.names);
    const ang = num(A.opt[0], P.aangle), coeff = num(A.opt[1], P.acoeff);
    const style = A.opt.slice(2).filter((x: any) => x && x.trim()).join(',');
    if (E.n1.startsWith('@') && E.n2.startsWith('@')) { direct.push({ A, E, style }); return; }
    if (E.n1.startsWith('@')) { display('', ''); const b = lookup(E.n1.slice(1)); if (b) cur = b; }
    else display(E.n1, E.s1);
    const st = anchorPt(cur, cur.base, E.a1 || String(ang));
    const ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang)), Lt = coeff * P.csep;
    const end = [st[0] + ux * Lt, st[1] + uy * Lt];
    addArrow(S, makeArrow(A, [st[0] + ux * P.aoff, st[1] + uy * P.aoff], [end[0] - ux * P.aoff, end[1] - uy * P.aoff], ang, style, P, warn, G, undefined, undefined, Lt));
    ext(S, st[0], st[1], st[0], st[1]); ext(S, end[0], end[1], end[0], end[1]);
    cur = pt(end[0], end[1]);
    nextName = E.n2.replace(/^@/, ''); nextStyle = E.s2; nextAnchor = E.a2 || String(norm360(180 + ang));
  }
  function merge(M: any) {
    display('', '');
    const ang = ({ '>': 0, '<': 180, '^': 90, v: -90 } as Record<string, any>)[M.dir] ?? 0, horiz = ang === 0 || ang === 180;
    const ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
    const from = num(M.opt[0], 0.5), to = num(M.opt[1], 0.5), at = num(M.opt[2], 0.5);
    const sty = bondStyle(M.opt.slice(3).filter((x: any) => x && x.trim()).join(','), warn);
    const pts = [];
    for (const src of M.srcs) { const q = endOf(src), b = lookup(q.n.replace(/^@/, '')); if (b) pts.push(anchorPt(b, b.base, q.a || String(ang))); }
    if (!pts.length) return;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const X = M.dir === '<' ? Math.min(...xs) - from * P.csep : Math.max(...xs) + from * P.csep;
    const Y = M.dir === '^' ? Math.min(...ys) - from * P.csep : Math.max(...ys) + from * P.csep;
    const line = (a: any, b: any) => { S.paths.push({ d: `M${r2(a[0])},${r2(a[1])}L${r2(b[0])},${r2(b[1])}`, sw: sty.width || LW, color: sty.color, dash: sty.dash }); ext(S, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); };
    for (const p of pts) line([p[0] + ux * P.aoff, p[1] + uy * P.aoff], horiz ? [X, p[1]] : [p[0], Y]);
    const lo = horiz ? Math.min(...ys) : Math.min(...xs), hi = horiz ? Math.max(...ys) : Math.max(...xs);
    line(horiz ? [X, lo] : [lo, Y], horiz ? [X, hi] : [hi, Y]);
    const mp = horiz ? [X, lo + at * (hi - lo)] : [lo + at * (hi - lo), Y];
    const Lt = to * P.csep, end = [mp[0] + ux * Lt, mp[1] + uy * Lt];
    addArrow(S, makeArrow({ ...M, type: '->', names: '' }, mp, [end[0] - ux * P.aoff, end[1] - uy * P.aoff], ang, '', P, warn, G, null, M));
    ext(S, end[0], end[1], end[0], end[1]);
    cur = pt(end[0], end[1]);
    const T = endOf(M.target);
    nextName = T.n.replace(/^@/, ''); nextStyle = T.s; nextAnchor = T.a || String(norm360(180 + ang));
  }
  for (const g of body) {
    if (g.t === 'arrow') arrow(g);
    else if (g.t === 'merge') merge(g);
    else if (g.t === 'start' || g.t === 'stop') continue;
    else pend.push(g);
  }
  display('', '');
  // arrows between compounds already placed: centre to centre (or anchor to anchor), from border to border
  for (const { A, E, style } of direct) {
    const b1 = lookup(E.n1.slice(1)), b2 = lookup(E.n2.slice(1));
    if (!b1 || !b2) continue;
    const c1 = E.a1 ? anchorPt(b1, b1.base, E.a1) : ctr(b1), c2 = E.a2 ? anchorPt(b2, b2.base, E.a2) : ctr(b2);
    const ang = (Math.atan2(-(c2[1] - c1[1]), c2[0] - c1[0]) * 180) / Math.PI;
    const p1 = E.a1 ? c1 : border(b1, ang), p2 = E.a2 ? c2 : border(b2, ang + 180);
    const ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
    addArrow(S, makeArrow(A, [p1[0] + ux * P.aoff, p1[1] + uy * P.aoff], [p2[0] - ux * P.aoff, p2[1] - uy * P.aoff], ang, style, P, warn, G));
  }
  G.level--;
  return S;
}
// an arrow from p1 to p2: its lines and tips, and its labels. seg: the \arrow (type, labels);
// labsGiven: labels already laid out (\hreac's); owner: the segment it belongs to, when not seg
const ARROWS = ['->', '<-', '<->', '<=>', '<->>', '<<->', '-/>', '0', '-U>'];
function makeArrow(seg: any, p1: any, p2: any, ang: any, style: any, P: any, warn: any, G: any, labsGiven?: any, owner?: any, uLen?: number) {
  const type = seg.type || '->';
  const ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang)), nx = uy, ny = -ux; // n: left of travel
  const shift = seg.labels && seg.labels[2] ? len(unbrace(seg.labels[2]), 0) : 0;
  p1 = [p1[0] + nx * shift, p1[1] + ny * shift]; p2 = [p2[0] + nx * shift, p2[1] + ny * shift];
  if (!ARROWS.includes(type)) warn(`The arrow "${type}" isn't one chemfig knows: drawn as ->`);
  const t = ARROWS.includes(type) ? type : '->';
  const prim = [];
  const line = (q1: any, q2: any, head: any, harpoon?: any) => { prim.push({ q1, q2, head, harpoon }); };
  const at = (q: any, f: any) => [q[0] + nx * f, q[1] + ny * f];
  const lerp = (k: any) => [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];
  if (t === '->' || t === '-U>') line(p1, p2, 'end');
  else if (t === '<-') line(p2, p1, 'end');
  else if (t === '<->') line(p1, p2, 'both');
  else if (t === '<=>') { line(at(p1, PT), at(p2, PT), 'end', true); line(at(p2, -PT), at(p1, -PT), 'end', true); }
  else if (t === '<->>') { line(at(p1, PT), at(p2, PT), 'end', true); line(at(lerp(0.8), -PT), at(lerp(0.2), -PT), 'end', true); }
  else if (t === '<<->') { line(at(lerp(0.2), PT), at(lerp(0.8), PT), 'end', true); line(at(p2, -PT), at(p1, -PT), 'end', true); }
  else if (t === '-/>') {
    line(p1, p2, 'end');
    const m = lerp(0.5);
    for (const s of [-1, 1]) {
      const c = [m[0] + ux * s * PT, m[1] + uy * s * PT], d1 = rad(225 + ang), d2 = rad(45 + ang);
      prim.push({ q1: [c[0] + 5 * PT * Math.cos(d1), c[1] - 5 * PT * Math.sin(d1)], q2: [c[0] + 5 * PT * Math.cos(d2), c[1] - 5 * PT * Math.sin(d2)], head: null, cross: true });
    }
  }
  // -U>: two arcs from the middle, tangent to the arrow, radius ratio × arrow length (compound sep × coeff),
  // 60° each; the one ahead ends in a tip; each is drawn only when its label is given
  let uEnds: any = null;
  if (t === '-U>') {
    const L = seg.labels || [], ratio = L[3] != null && String(L[3]).trim() !== '' ? parseFloat(L[3]) : 0.333;
    const span = L[4] != null && String(L[4]).trim() !== '' ? Math.abs(parseFloat(L[4])) : 60;
    const sgn = ratio < 0 ? -1 : 1, r = Math.abs(ratio) * (uLen || Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const m = lerp(0.5), cen = [m[0] + nx * sgn * r, m[1] + ny * sgn * r];
    const at2 = (f: number) => [cen[0] - nx * sgn * r * Math.cos(f) + ux * r * Math.sin(f), cen[1] - ny * sgn * r * Math.cos(f) + uy * r * Math.sin(f)];
    const arc = (a: number) => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(at2(rad((a * i) / 24))); return pts; };
    const back = arc(-span), ahead = arc(span);
    if (L[0] != null && String(L[0]).trim()) prim.push({ pts: back, q1: back[0], q2: back[24], head: null });
    if (L[1] != null && String(L[1]).trim()) prim.push({ pts: ahead, q1: ahead[0], q2: ahead[24], head: 'end' });
    uEnds = sgn > 0 ? [back[24], ahead[24]] : [ahead[24], back[24]];
  }
  // shorten <= / >=: each path drawn (the line, each harpoon, each arc) loses that much at its start / end
  let shA = 0, shB = 0;
  for (const it of split(style || '')) { const q = /^\s*shorten\s*([<>])\s*=\s*(.+?)\s*$/.exec(it); if (q) { if (q[1] === '<') shA = len(q[2], 0); else shB = len(q[2], 0); } }
  if (shA || shB) for (const p of prim) {
    if (p.cross) continue;
    if (p.pts) { p.pts = trimLine(p.pts, shA, shB); p.q1 = p.pts[0]; p.q2 = p.pts[p.pts.length - 1]; continue; }
    [p.q1, p.q2] = trimLine([p.q1, p.q2], shA, shB);
  }
  const sty0 = bondStyle(style, warn), all = P.astyle ? bondStyle(P.astyle, null) : null;
  const sty = all ? { color: sty0.color || all.color, width: sty0.width || all.width, dash: sty0.dash || all.dash, none: sty0.none || all.none } : sty0;
  // labels: above at the middle, arrow label sep off, sloped with the arrow and never upside down
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  let rot = ang;
  if (Math.cos(rad(rot)) < -1e-9) rot += 180;
  const labs = labsGiven || [];
  if (!labsGiven) [seg.labels && seg.labels[0], seg.labels && seg.labels[1]].forEach((lab, j) => {
    if (lab == null || !String(lab).trim()) return;
    // -U>: both labels on the arc's side, at its ends
    const l = uEnds ? richLabel(String(lab), rot === ang ? 1 : -1, uEnds[j], rot, P, warn, G) : richLabel(String(lab), j === 0 ? 1 : -1, mid, rot, P, warn, G);
    if (l) labs.push({ ...l, which: j, seg: owner || seg });
  });
  return { seg: owner || seg, prim, labs, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], ang, type: t, color: sty.color, sw: sty.width, dash: sty.dash, head: P.ahead, hidden: sty.none };
}
// a polyline with a lengths off its start and b off its end
function trimLine(pts: any[], a: number, b: number) {
  const cut = (P: any[], d: number) => {
    // d off the start
    P = P.slice();
    while (d > 0 && P.length > 1) {
      const [x0, y0] = P[0], [x1, y1] = P[1], L = Math.hypot(x1 - x0, y1 - y0);
      if (L > d) { P[0] = [x0 + ((x1 - x0) * d) / L, y0 + ((y1 - y0) * d) / L]; break; }
      if (P.length === 2) { P[0] = P[1].slice(); break; }
      P.shift(); d -= L;
    }
    return P;
  };
  return cut(cut(pts, a).reverse(), b).reverse();
}
// a label's contents laid out like a compound (molecules, + and text), in a size (\tiny…) and turned:
// along the arrow, or *{θ} at θ, touching the point arrow label sep off the middle on its side (sg)
function richLabel(txt: any, sg: any, mid: any, rot: any, P: any, warn: any, G: any) {
  let t = txt, theta = null, m;
  const st = /^\s*\*\s*/.exec(t);
  if (st) {
    let k = st[0].length;
    if (t[k] === '{') { const e = close(t, k); theta = parseFloat(t.slice(k + 1, e)); k = e + 1; } else { theta = parseFloat(t[k]); k++; }
    if (!isFinite(theta)) theta = 0;
    t = t.slice(k);
  }
  let sc = 1;
  while ((m = /^\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![A-Za-z])\s*/.exec(t))) { sc = (SIZES[m[1]] * PT) / TEXT.size; t = t.slice(m[0].length); }
  const before = { ...G.names };
  const F: any = layPieces(parseDoc(labelLines(t).join('\n'), warn, G.defs), P, warn, G);
  if (!F.pieces.length) return null;
  const w = F.w * sc, h = (F.asc + F.desc) * sc;
  const vx = Math.cos(rad(rot + 90)), vy = -Math.sin(rad(rot + 90)); // the label frame's up
  const S = [mid[0] + vx * P.lsep * sg, mid[1] + vy * P.lsep * sg];
  let bx, by, R;
  if (theta == null) { bx = S[0] + (vx * sg * h) / 2; by = S[1] + (vy * sg * h) / 2; R = rot; }
  else {
    // the anchor facing the arrow, in the label's own (turned) frame
    const al = rad(rot - sg * 90 - theta), ax = Math.cos(al), ay = -Math.sin(al);
    const k = Math.min(Math.abs(ax) > 1e-9 ? w / 2 / Math.abs(ax) : Infinity, Math.abs(ay) > 1e-9 ? h / 2 / Math.abs(ay) : Infinity);
    const v = [ax * k, ay * k], c = Math.cos(rad(theta)), s = Math.sin(rad(theta));
    bx = S[0] - (v[0] * c + v[1] * s); by = S[1] - (-v[0] * s + v[1] * c); R = theta;
  }
  const sink = newSink();
  emit(F, 0, 0, sink);
  const fc = [F.w / 2, (F.desc - F.asc) / 2];
  // @{names} in the label: where the label puts them, in the arrow's frame (holder: attached by addArrow)
  const holder: any = frag(), cr = Math.cos(rad(R)), sr = Math.sin(rad(R));
  const map = (x: number, y: number) => { const u = (x - fc[0]) * sc, v = (y - fc[1]) * sc; return [bx + u * cr + v * sr, by - u * sr + v * cr]; };
  for (const [n, e] of Object.entries<any>(G.names)) {
    if (before[n] === e) continue;
    const b = relBox(e, F);
    if (e.pt) { e.pt = map(b.x, b.y); e.F = holder; continue; }
    const [qx, qy] = map(b.x + b.w / 2, b.y + b.h / 2), [, qb] = map(b.x + b.w / 2, b.base);
    Object.assign(e, { F: holder, x: qx - (b.w * sc) / 2, y: qy - (b.h * sc) / 2, w: b.w * sc, h: b.h * sc, base: qb });
  }
  return { g: sink, s: sc, fc, bx, by, bw: w, bh: h, rot: R, holder };
}
function addArrow(F: any, a: any) {
  F.arrows.push(a);
  if (a.type === '0' || a.hidden) ext(F, Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.max(a.x1, a.x2), Math.max(a.y1, a.y2));
  else for (const p of a.prim) for (const q of p.pts || [p.q1, p.q2]) ext(F, q[0], q[1], q[0], q[1]);
  for (const l of a.labs) if (l.holder) { l.holder.parent = F; l.holder.off = [0, 0]; }
  for (const l of a.labs) {
    const c = Math.abs(Math.cos(rad(l.rot))), s = Math.abs(Math.sin(rad(l.rot))), hw = (l.bw * c + l.bh * s) / 2, hh = (l.bw * s + l.bh * c) / 2;
    ext(F, l.bx - hw, l.by - hh, l.bx + hw, l.by + hh);
  }
}
// everything drawn, in the block's frame
const newSink = () => ({ paths: [], texts: [], dots: [], verts: [], bonds: [], rings: [], mols: [], arrows: [] });
function emit(F: any, ox: any, oy: any, K: any) {
  for (const p of F.paths) K.paths.push({ ...p, dx: (p.dx || 0) + ox, dy: (p.dy || 0) + oy });
  for (const d of F.dots) K.dots.push({ ...d, x: d.x + ox, y: d.y + oy });
  for (const t of F.texts) K.texts.push({ ...t, cx: t.cx + ox, cy: t.cy + oy });
  for (const m of F.mols) emitMol(m, ox + m.x, oy + m.y, K);
  for (const a of F.arrows) {
    const sh = (q: any) => [q[0] + ox, q[1] + oy];
    K.arrows.push({ ...a, x1: a.x1 + ox, y1: a.y1 + oy, x2: a.x2 + ox, y2: a.y2 + oy, prim: a.prim.map((p: any) => ({ ...p, q1: sh(p.q1), q2: sh(p.q2), ...(p.pts ? { pts: p.pts.map(sh) } : {}) })), labs: a.labs.map((l: any) => ({ ...l, bx: l.bx + ox, by: l.by + oy, ...(l.cx != null ? { cx: l.cx + ox, cy: l.cy + oy } : {}) })) });
  }
  for (const C of F.kids) emit(C, ox + C.off[0], oy + C.off[1], K);
}
function emitMol(m: any, dx: any, dy: any, K: any) {
  const L = m.L, seg = m.seg;
  K.mols.push({ seg, L, dx, dy });
  for (const q of L.paths) K.paths.push({ ...q, dx, dy });
  for (const d of L.dots) K.dots.push({ ...d, x: d.x + dx, y: d.y + dy });
  for (const t of L.texts) {
    if (t.box) {
      // (an atom scaled by atom style: its text at that size)
      const st = t.k ? { ...TEXT, size: TEXT.size * t.k } : TEXT, b = TD.textBox(t.t, st), bo = baseOff(st);
      K.texts.push({ t: t.t, cx: t.box.cx + dx, cy: t.box.base + dy - bo + b.h / 2, b, ...(t.k ? { st } : {}), ...(t.color ? { color: t.color } : {}) });
    }
    else K.texts.push({ t: t.t, cx: t.cx + dx, cy: t.cy + dy, b: t.b });
  }
  const map = new Map();
  // sep: the molecule's atom sep, what a bond's length counts in
  for (const v of L.verts) { const c = { ...v, X: v.x + dx, Y: v.y + dy, mol: seg, sep: L.sep, dx, dy }; map.set(v, c); K.verts.push(c); }
  for (const b of L.bonds) K.bonds.push({ ...b, a: map.get(b.a), b: map.get(b.b), X0: b.p0[0] + dx, Y0: b.p0[1] + dy, X1: b.p1[0] + dx, Y1: b.p1[1] + dy, mol: seg, sep: L.sep });
  for (const r of L.rings) K.rings.push({ ...r, X: r.cx + dx, Y: r.cy + dy, mol: seg });
}
// \printatom{X} sets X as an atom: upright maths
// (\textcolor{red}7: TeX's undelimited argument, one token, is \textcolor{red}{7})
const printable = (t: any) => String(t).replace(/\\printatom\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, a) => `$\\mathrm{${a}}$`)
  .replace(/\\textcolor\s*\{([^{}]*)\}\s*(\\[A-Za-z]+|[^\s{}\\$])/g, '\\textcolor{$1}{$2}');
// a TikZ anchor of a node's box { x, y, w, h } whose baseline is at base: north east, mid west, base, 30…
function anchorPt(box: any, base: any, a: any) {
  a = String(a || '').trim();
  if (!a || a === 'center') return [box.x + box.w / 2, box.y + box.h / 2];
  if (/^-?[\d.]+$/.test(a)) return border(box, parseFloat(a));
  const w = a.split(/\s+/);
  let x = box.x + box.w / 2, y = box.y + box.h / 2;
  for (const k of w) {
    if (k === 'west') x = box.x; else if (k === 'east') x = box.x + box.w;
    else if (k === 'north') y = box.y; else if (k === 'south') y = box.y + box.h;
    else if (k === 'base') y = base; else if (k === 'mid') y = base - 0.5 * EX;
    else if (k === 'text') { x = box.x; y = base; }
  }
  return [x, y];
}
// \chemmove{\draw[…] path; …}: TikZ paths between @{name}d atoms and bonds. Read here: (name), (name.anchor),
// (x,y), (angle:r), +(…), ++(…), --, ..controls a and b.., to[out=,in=,bend left/right=], shorten <= / >=,
// arrow tips (-CF, ->, <-, <->), dashed, dotted, line width, thin/thick, a colour. Anything else is warned.
function tikzLen(v: any) {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?\s*$/.exec(String(v));
  if (!m) return null;
  return parseFloat(m[1]) * { cm: PX, mm: PX / 10, pt: PT, em: EM, ex: EX, in: 2.54 * PX, bp: (2.54 * PX) / 72 }[m[2] || 'cm'];
}
// \polymerdelim[keys]{a}{b}: chemfig's \chemmove (an overlay, outside the box) with a node at each name's centre (a
// bond's @{name,pos} point or an atom), shifted by open xshift (close xshift, negated, for the right one) and by
// (height − depth)/2 up: $\left<l>\vrule height h depth h\right.$ and $\left.\vrule …\right<r>_{\rlap{$\scriptstyle indice$}}$,
// h = (height + depth)/2, \nulldelimiterspace 0pt. The keys start from their defaults in order (height=10pt, then
// depth= takes that height, close xshift= takes −0pt), then the given ones.
function polymerDelim(seg: any, names: any, warn: any, K: any) {
  const o: Record<string, any> = { l: '(', r: ')', ht: 10 * PT, dp: 10 * PT, ox: 0, cx: 0, h: true, auto: false, rot: 0, ind: 'n' };
  for (const [k, v0] of Object.entries<any>(readKV(seg.opt || ''))) {
    const v = String(v0 ?? '').trim();
    if (k === 'delimiters') { const t: string[] = [...(v.match(/\\[A-Za-z]+|\\.|\S/g) || [])].concat(['(', ')']); o.l = t[0]; o.r = t[1]; }
    else if (k === 'height') o.ht = len(v, o.ht);
    else if (k === 'depth') o.dp = v ? len(v, o.dp) : o.ht;
    else if (k === 'open xshift') o.ox = len(v, 0);
    else if (k === 'close xshift') o.cx = v ? -len(v, 0) : -o.ox;
    else if (k === 'h align') o.h = v !== 'false';
    else if (k === 'auto rotate') o.auto = v !== 'false';
    else if (k === 'rotate') o.rot = parseFloat(v) || 0;
    else if (k === 'indice') o.ind = v;
    else warn(`The \\polymerdelim key "${k}" isn't drawn here (it is kept in the code)`);
  }
  if (!o.h && (o.auto || o.rot)) { warn('A rotated \\polymerdelim isn\'t drawn here (it is kept in the code)'); return; }
  const at = (n: string) => {
    const q = names.bonds[n], b = names.atoms[n];
    if (q) return q;
    if (b) return [b.x + b.w / 2, b.y + b.h / 2];
    warn(`\\polymerdelim: "${n}" isn't named in a molecule (@{${n}})`);
    return null;
  };
  const A = at(seg.a), B = at(seg.b);
  if (!A || !B) return;
  const hd = (o.ht + o.dp) / 2, vs = (o.ht - o.dp) / 2, ax = 2.5 * PT;
  // TeX's \left…\right around a rule of height and depth h: a delimiter at least max(.901·2(h+axis), 2(h+axis) − 5pt),
  // centred on the axis; the node's box (the rule's or the delimiter's) is centred on the point
  // the closing one's subscript, \rlap{$\scriptstyle indice$}: its baseline the formula's depth plus cmsy7's sub drop
  // (0.5pt) down; it adds its depth to the node's box and \scriptspace (0.5pt) to its width (measured: ) with n is
  // 7.86pt wide, 10.5pt deep, with p 11.86pt deep)
  const sub = (D: number) => (o.ind ? { y: D + 0.5 * PT, d: D + 0.5 * PT + 0.7 * vmetrics(o.ind).desc, w: 0.5 * PT } : null);
  const one = (tok: string, x: number, y: number, right: boolean) => {
    const need = 2 * (hd + ax), f = delimFit(tok, Math.max(need * 0.901, need - 5 * PT));
    const H = Math.max(hd, ax + f.T / 2), D = Math.max(hd, f.T / 2 - ax), s = right ? sub(D) : null;
    // (\nulldelimiterspace 0pt: a . is no width)
    const fw = tok === '.' ? 0 : f.w, Dn = s ? Math.max(D, s.d) : D, wn = fw + (s ? s.w : 0), base = y + (H - Dn) / 2, mid = base - ax, left = x - wn / 2;
    if (tok !== '.') { const F = frag(); delim(tok, F, left, mid - f.T / 2, mid + f.T / 2, warn, right); for (const p of F.paths) K.paths.push(p); }
    return { base, left, w: fw, s };
  };
  const yA = A[1] - vs, yB = (o.h ? A[1] : B[1]) - vs;
  one(o.l, A[0] + o.ox, yA, false);
  const R = one(o.r, B[0] + o.cx, yB, true);
  if (R.s) {
    const t = `$\\scriptstyle ${o.ind}$`, b = TD.textBox(t, TEXT), y = R.base + R.s.y;
    K.texts.push({ t, cx: R.left + R.w + (b.w - 2) / 2, cy: y - baseOff(TEXT) + b.h / 2, b });
  }
}
// org: where the \chemmove stands (its picture's origin, which a point written (x,y) counts from); K: the texts drawn
function chemMove(seg: any, names: any, warn: any, out: any, org: number[] = [0, 0], K?: any) {
  const body = seg.body.replace(/%[^\n]*/g, '');
  const re = /\\(draw|path)\s*(\[[^\]]*\])?([^;]*);/g;
  let m, any = false, k = -1;
  // \node[] at (x,y) {text};: the text centred on the point (anchor=center)
  const NODE = /\\node\s*(?:\[([^\]]*)\])?\s*at\s*(\((?:[^()]|\([^()]*\))*\))\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}\s*;/g;
  let rest = body.replace(re, '');
  if (K) rest = rest.replace(NODE, (all: string, o: string, at: string, t: string) => {
    const col = (o || '').trim() && TD.tikzColor ? TD.tikzColor((o || '').trim()) : null;
    if ((o || '').trim() && !col) return all;
    const P0 = readPath(at, names, () => {}, org, true);
    if (!P0) return all;
    // (\footnotesize … in it: the text at that size)
    const ts = topSizes(t), st = ts.names.length ? { ...TEXT, size: SIZES[ts.names[ts.names.length - 1]] * PT } : TEXT;
    const tt = printable(ts.rest.trim()), b = TD.textBox(tt, st);
    K.texts.push({ t: tt, cx: P0.pts[0][0], cy: P0.pts[0][1], b, ...(st !== TEXT ? { st } : {}), ...(col ? { color: col } : {}) });
    any = true;
    return '';
  });
  rest = rest.trim();
  if (rest) warn(`In \\chemmove, "${rest.slice(0, 40)}" isn't drawn here (it is kept in the code)`);
  while ((m = re.exec(body))) {
    any = true; k++;
    if (m[1] === 'path') continue;
    const opts = [seg.opt, m[2] ? m[2].slice(1, -1) : ''].join(',').split(',').map((o) => o.trim()).filter(Boolean);
    const st = { tipS: false, tipE: true, sh1: 0, sh2: 0, dash: (null as any), sw: LW, color: null, fill: (null as any), fop: 1, op: 1 };
    for (const o of opts) {
      let q;
      if ((q = /^([<>]?|CF|stealth|latex|to)?-([<>]?|CF|stealth|latex|to)?$/.exec(o))) { st.tipS = !!q[1]; st.tipE = !!q[2]; }
      else if ((q = /^shorten\s*([<>])\s*=\s*(.+)$/.exec(o))) { const v = tikzLen(q[2].replace(/(\d)$/, '$1pt')) ?? 0; if (q[1] === '<') st.sh1 = v; else st.sh2 = v; }
      else if (o === 'dashed') st.dash = 'dash';
      else if (o === 'solid') st.dash = null;
      else if (o === 'dotted') st.dash = 'dot';
      else if ((q = /^dash pattern\s*=\s*(.+)$/.exec(o))) { const v = []; for (const r of q[1].matchAll(/(on|off)\s+([-\d.]+\s*[a-z]*)/g)) v.push(tikzLen(/\d$/.test(r[2].trim()) ? r[2].trim() + 'pt' : r[2]) || 0); if (v.length) st.dash = v; }
      else if ((q = /^line width\s*=\s*(.+)$/.exec(o))) st.sw = len(q[1], LW);
      else if (o === 'thin') st.sw = LW; else if (o === 'semithick') st.sw = 0.6 * PT; else if (o === 'thick') st.sw = 0.8 * PT; else if (o === 'very thick') st.sw = 1.2 * PT; else if (o === 'ultra thick') st.sw = 1.6 * PT;
      else if ((q = /^(?:color\s*=\s*|draw\s*=\s*)?([a-zA-Z]+(?:![\d.]+(?:![a-zA-Z]+)?)?)$/.exec(o)) && TD.tikzColor && TD.tikzColor(q[1])) st.color = TD.tikzColor(q[1]);
      else if ((q = /^fill\s*=\s*(.+)$/.exec(o)) && TD.tikzColor && TD.tikzColor(q[1].trim())) st.fill = TD.tikzColor(q[1].trim());
      else if ((q = /^(fill opacity|draw opacity|opacity)\s*=\s*([\d.]+)$/.exec(o))) { const v = Math.max(0, Math.min(1, parseFloat(q[2]))); if (q[1] !== 'draw opacity') st.fop = v; if (q[1] !== 'fill opacity') st.op = v; }
      else if (/^(?:->|overlay|remember picture)$/.test(o)) {}
      else warn(`The \\chemmove option "${o}" isn't drawn here (it is kept in the code)`);
    }
    const segs = readPath(m[3], names, warn, org);
    // seg and k (the k-th \draw or \path in its body): what the editor rewrites
    if (segs) out.push({ ...st, segs, seg, k });
  }
  if (!any && body.trim()) warn('\\chemmove has no \\draw to show here (it is kept in the code)');
}
// one: a single point is enough (a node's place)
function readPath(p: any, names: any, warn: any, org: number[] = [0, 0], one = false) {
  let i = 0;
  const ws = () => { while (/\s/.test(p[i] || '')) i++; };
  const unit = (v: any) => tikzLen(v);
  // a coordinate → { pt, node } (node: an atom box to clip to, unless an anchor was given)
  const coord = (prev?: any) => {
    ws();
    let rel = 0;
    if (p.startsWith('++', i)) { rel = 2; i += 2; } else if (p[i] === '+') { rel = 1; i++; }
    ws();
    if (p[i] !== '(') return null;
    let d = 0, j = i;
    for (; j < p.length; j++) { if (p[j] === '(') d++; else if (p[j] === ')' && !--d) break; }
    let t = p.slice(i + 1, j).trim();
    i = j + 1;
    let q;
    // ([xshift=…,yshift=…]name.anchor): the point moved
    let sx = 0, sy = 0, shifted = false;
    if (t[0] === '[') {
      const e = close(t, 0);
      if (e < 0) { warn(`The coordinate (${t}) isn't read here`); return null; }
      for (const o of split(t.slice(1, e)).map((x: any) => x.trim()).filter(Boolean)) {
        // shift={(x,y)}: both at once
        const sh = /^shift\s*=\s*\{?\s*\(([^(),]+),([^(),]+)\)\s*\}?$/.exec(o), sv = sh ? [unit(sh[1]), unit(sh[2])] : null;
        if (sv && sv[0] != null && sv[1] != null) { sx += sv[0]; sy -= sv[1]; shifted = true; continue; }
        const kv = /^([xy])shift\s*=\s*(.+)$/.exec(o), v = kv ? unit(kv[2]) : null;
        if (v == null) { warn(`\\chemmove: the coordinate option "${o}" isn't drawn here`); continue; }
        if (kv![1] === 'x') sx += v; else sy -= v;
        shifted = true;
      }
      t = t.slice(e + 1).trim();
    }
    const moved = (c: any) => {
      if (!shifted || !c) return c;
      if (c.v) return { ...c, v: [c.v[0] + sx, c.v[1] + sy] };
      return { pt: [c.pt[0] + sx, c.pt[1] + sy] };
    };
    if ((q = /^([^,:]+?)\s*:\s*([^,]+)$/.exec(t))) {
      const W: Record<string, any> = { right: 0, up: 90, left: 180, down: 270, east: 0, 'north east': 45, north: 90, 'north west': 135, west: 180, 'south west': 225, south: 270, 'south east': 315 };
      const ang = q[1].trim() in W ? W[q[1].trim()] : parseFloat(q[1]);
      const r = unit(q[2]);
      if (r == null || isNaN(ang)) { warn(`The coordinate (${t}) isn't read here`); return null; }
      const v = [r * Math.cos(rad(ang)), -r * Math.sin(rad(ang))];
      return moved({ rel, v });
    }
    if ((q = /^([^,]+),([^,]+)$/.exec(t))) {
      const x = unit(q[1]), y = unit(q[2]);
      if (x == null || y == null) { warn(`The coordinate (${t}) isn't read here`); return null; }
      return moved({ rel, v: [x, -y] });
    }
    const [nm, an] = t.split('.');
    if (names.bonds[nm]) return moved({ pt: names.bonds[nm].slice() });
    const b = names.atoms[nm];
    if (b) return moved(an ? { pt: anchorPt(b, b.base, an) } : { pt: [b.x + b.w / 2, b.y + b.h / 2], node: b });
    warn(`\\chemmove: "${nm}" isn't named in a molecule (@{${nm}})`);
    return null;
  };
  const pts: any[] = []; // [{ pt, node }] and ops between
  const ops: any[] = [];
  let last = null, closed = false;
  // (x,y) counts from the picture's origin, +(x,y) and ++(x,y) from the point before
  const take = (c: any, base: any) => (c.v ? { pt: c.rel ? [base[0] + c.v[0], base[1] + c.v[1]] : [org[0] + c.v[0], org[1] + c.v[1]] } : c);
  ws();
  const c0 = coord();
  if (!c0 || c0.rel) return null;
  pts.push(take(c0, [0, 0])); last = pts[0].pt;
  if (one) { ws(); return i >= p.length ? { pts: [pts[0].pt], ops: [], closed: false } : null; }
  while (i < p.length) {
    ws();
    if (i >= p.length) break;
    if (p.startsWith('|-', i) || p.startsWith('-|', i)) {
      // a corner: vertical then horizontal (|-), or horizontal then vertical (-|)
      const vf = p[i] === '|';
      i += 2; const c = coord(); if (!c) return null;
      const q = take(c, last);
      pts.push({ pt: vf ? [last[0], q.pt[1]] : [q.pt[0], last[1]] }); ops.push({ k: 'line' });
      pts.push(q); ops.push({ k: 'line' }); if (c.rel !== 1) last = q.pt;
    } else if (p.startsWith('--', i)) {
      i += 2; ws();
      // -- cycle: back to the start, a closed path (TikZ puts no arrow tips on it)
      if (/^cycle(?![A-Za-z])/.test(p.slice(i))) { i += 5; pts.push({ pt: pts[0].pt.slice() }); ops.push({ k: 'line' }); closed = true; last = pts[0].pt; continue; }
      const c = coord(); if (!c) return null;
      const q = take(c, last); pts.push(q); ops.push({ k: 'line' }); if (c.rel !== 1) last = q.pt;
    } else if (p.startsWith('..', i)) {
      i += 2; ws();
      if (!p.startsWith('controls', i)) { warn('\\chemmove: ".." needs controls'); return null; }
      i += 8;
      const a = coord(); if (!a) return null;
      ws();
      let b = null;
      if (p.startsWith('and', i)) { i += 3; b = coord(); if (!b) return null; }
      ws();
      if (!p.startsWith('..', i)) { warn('\\chemmove: the controls need a closing ".."'); return null; }
      i += 2;
      const c = coord(); if (!c) return null;
      const end = take(c, last);
      const ca = take(a, last).pt;
      const cb = b ? (b.v ? (b.rel ? [end.pt[0] + b.v[0], end.pt[1] + b.v[1]] : [org[0] + b.v[0], org[1] + b.v[1]]) : b.pt) : ca;
      pts.push(end); ops.push({ k: 'curve', c1: ca, c2: cb }); last = end.pt;
    } else if (p.startsWith('to', i)) {
      i += 2; ws();
      let o = '';
      if (p[i] === '[') { const e = close(p, i); o = p.slice(i + 1, e); i = e + 1; }
      const c = coord(); if (!c) return null;
      const end = take(c, last);
      const kv: Record<string, any> = {};
      for (const x of o.split(',')) { const [k, v] = x.split('='); if (k.trim()) kv[k.trim()] = v == null ? '' : v.trim(); }
      const a0 = last, a1 = end.pt, dang = Math.atan2(-(a1[1] - a0[1]), a1[0] - a0[0]) * 180 / Math.PI;
      let out = dang, inn = dang + 180;
      if ('bend left' in kv) { const b0 = parseFloat(kv['bend left']), b = isFinite(b0) ? b0 : 30; out = dang + b; inn = dang + 180 - b; }
      else if ('bend right' in kv) { const b0 = parseFloat(kv['bend right']), b = isFinite(b0) ? b0 : 30; out = dang - b; inn = dang + 180 + b; }
      if ('out' in kv) out = parseFloat(kv.out); if ('in' in kv) inn = parseFloat(kv.in);
      const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) * 0.3915 * (parseFloat(kv.looseness) || 1);
      const curved = Object.keys(kv).some((k) => /^(bend|out|in)/.test(k));
      for (const k of Object.keys(kv)) if (!/^(bend left|bend right|out|in|looseness)$/.test(k)) warn(`\\chemmove: to[${k}] isn't drawn here`);
      pts.push(end);
      if (curved) ops.push({ k: 'curve', c1: [a0[0] + L * Math.cos(rad(out)), a0[1] - L * Math.sin(rad(out))], c2: [a1[0] + L * Math.cos(rad(inn)), a1[1] - L * Math.sin(rad(inn))] });
      else ops.push({ k: 'line' });
      last = end.pt;
    } else { warn(`\\chemmove: "${p.slice(i, i + 20).trim()}" isn't read here`); return null; }
  }
  if (!ops.length) return null;
  // node ends: the border toward the neighbouring point
  const toward = (k: any) => (k < pts.length - 1 ? (ops[k].k === 'curve' ? ops[k].c1 : pts[k + 1].pt) : null);
  const from = (k: any) => (k > 0 ? (ops[k - 1].k === 'curve' ? ops[k - 1].c2 : pts[k - 1].pt) : null);
  const clip = (b: any, c: any, q: any) => { const ang = Math.atan2(-(q[1] - c[1]), q[0] - c[0]) * 180 / Math.PI; return border(b, ang); };
  const P2 = pts.map((x) => x.pt.slice());
  pts.forEach((x, k) => {
    if (!x.node) return;
    const nb = [toward(k), from(k)].filter(Boolean);
    if (nb.length && x.node.w + x.node.h > 0) P2[k] = clip(x.node, x.pt, nb[0]);
  });
  return { pts: P2, ops, closed };
}
function border(box: any, ang: any) {
  // the point where a ray from the box's centre at ang leaves it
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
  const t = Math.min(Math.abs(ux) > 1e-9 ? box.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? box.h / 2 / Math.abs(uy) : Infinity);
  return [cx + ux * t, cy + uy * t];
}

// the whole thing: lines of compounds, schemes and text, or an \hreac row
/**
 * Blank lines (paragraph breaks) where chemfig reads its argument, inside a \chemfig{…} or other braces or in a scheme,
 * written as "%" lines: there LaTeX would stop ("Paragraph ended before…"), and to the reader they are only spacing.
 * Blank lines between drawings stay. Returns the code and whether it changed.
 */
function parSafe(code: string) {
  let depth = 0, scheme = 0, changed = false;
  const out = code.split('\n').map((raw) => {
    const line = raw.replace(/(^|[^\\])%.*$/, '$1');
    if (!line.trim() && !/(^|[^\\])%/.test(raw) && (depth > 0 || scheme > 0)) { changed = true; return raw + '%'; }
    scheme += (line.match(/\\schemestart\b/g) || []).length - (line.match(/\\schemestop\b/g) || []).length;
    const plain = line.replace(/\\[{}]/g, '');
    depth += (plain.match(/\{/g) || []).length - (plain.match(/\}/g) || []).length;
    return raw;
  });
  return { code: changed ? out.join('\n') : code, changed };
}
function build(src: any, segsIn?: any) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const segs = segsIn || parseDoc(src, warn);
  if (parSafe(String(src || '')).changed) warn('A blank line inside a molecule or a scheme stops LaTeX (chemfig reads it as the end of a paragraph). The app\'s LaTeX writes it as %; in this code, remove it or put % on it');
  // \scriptsize, \small… written in the code: the size of the whole drawing
  const sizes = segs.filter((g: any) => g.t === 'text').flatMap((g: any) => topSizes(g.raw.replace(/%[^\n]*/g, '')).names);
  if (new Set(sizes).size > 1) warn(`Only one font size is drawn here, \\${sizes[0]} (it is kept in the code)`);
  const saved = { EM, EX, TEXT };
  setSize(sizes.length ? SIZES[sizes[0]] : 10);
  try {
  const P: Record<string, any> = { ...defaults() };
  // submolecules, wherever they are defined
  P.submols = {};
  const gather = (L: any) => { for (const g of L) { if (g.t === 'submol') P.submols[g.name] = { n: g.n, alt: g.alt, body: g.body }; if (g.inner) gather(g.inner); } };
  gather(segs);
  // \tikzset{name/.style={…}}: styles compounds use
  P.styles = {};
  const shows = (g: any) => (g.t === 'text' ? !!g.raw.replace(/%.*$/gm, '').trim() : !['set', 'reset', 'submol', 'move', 'pdelim', 'flip', 'nameinit'].includes(g.t));
  const lastReset = (charge: boolean) => { for (let i = segs.length - 1; i >= 0; i--) if (segs[i].t === 'reset' && !!segs[i].charge === charge && segs.slice(i + 1).some(shows)) return i; return -1; };
  const rs = lastReset(false), rc = lastReset(true);
  // what the drawing starts with: each \setchemfig takes effect where it is written (layPieces)
  const P0 = { ...P, charge: { ...P.charge } };
  // the settings in force at the end of the top level (the editor's name and compound boxes go by these)
  P.charge = { ...P.charge };
  segs.forEach((g: any, i: number) => {
    if (g.t !== 'set' || g.tikz) return;
    if (g.charge) { if (i > rc) applyCharge(P.charge, g.kv, () => {}); } else if (i > rs) applyKV(P, g.kv, () => {});
  });
  for (const g of segs) {
    if (g.t !== 'set') continue;
    if (!g.tikz) continue;
    for (const [k, v] of Object.entries<any>(g.kv)) {
      const m = /^(.+?)\s*\/\.style$/.exec(k);
      if (m) P.styles[m[1].trim()] = v; else warn(`\\tikzset{${k}} isn't drawn here (it is kept in the code)`);
    }
  }
  const G = { names: {}, cnt: 0, level: 0, nameDp: 0, moves: ([] as any[]), comps: [], defs: segs.defs || {}, nextAnchor: 'text' };
  const root = frag();
  const hi = segs.findIndex((g: any) => g.t === 'hstart'), ho = segs.findIndex((g: any) => g.t === 'hstop');
  const si = segs.findIndex((g: any) => g.t === 'start');
  const hreac = hi >= 0 && (si < 0 || hi < si);
  let scheme = false;
  if (hreac) {
    applyKV(P, segs[hi].kv, warn);
    if (ho < 0) warn('\\endhreac is missing');
    for (const g of segs.slice(0, hi).concat(ho >= 0 ? segs.slice(ho + 1) : [])) if (g.t === 'text' ? g.raw.replace(/%.*$/gm, '').trim() : !['set', 'reset', 'submol', 'move', 'pdelim', 'flip'].includes(g.t)) warn('Only \\hreac … \\endhreac is drawn: what is outside it is kept in the code');
    // the spaces TeX sets before the row: one per line break after a \definesubmol, \setchemfig…
    let lead = 0;
    for (let k = 1; k < hi; k++) if (segs[k].t === 'text' && /\s/.test(segs[k].raw.replace(/%[^\n]*(\n[ \t]*)?/g, ''))) lead += 3.333 * PT;
    attach(root, layHreac(segs.slice(hi + 1, ho < 0 ? segs.length : ho), lead, P, warn, G), 0, 0);
    for (const g of segs.slice(0, hi).concat(ho >= 0 ? segs.slice(ho + 1) : [])) if (g.t === 'move' || g.t === 'pdelim') G.moves.push({ seg: g, snap: { ...G.names } });
  } else {
    // \schemestart … \schemestop as one piece; lines split at \par and blank lines
    const items = [];
    for (let k = 0; k < segs.length; k++) {
      const g = segs[k];
      if (g.t === 'start') {
        scheme = true;
        let e = k + 1;
        while (e < segs.length && segs[e].t !== 'stop') e++;
        if (e >= segs.length) warn('\\schemestop is missing');
        const m = /^\\schemestart\s*\[([\s\S]*)\]$/.exec(g.raw);
        items.push({ t: 'scheme', body: segs.slice(k + 1, e), opt: m ? m[1] : '', start: g });
        k = e; continue;
      }
      if (g.t === 'stop') { warn('\\schemestop has no \\schemestart'); continue; }
      if (g.t === 'arrow' || g.t === 'merge') { warn('Arrows need \\schemestart … \\schemestop around them'); continue; }
      if (g.t === 'text' && /\n[ \t]*\n/.test(g.raw.replace(/%[^\n]*/g, ''))) {
        const parts = g.raw.split(/\n[ \t]*\n/);
        parts.forEach((p: any, j: any) => { if (j) items.push({ t: 'par', raw: '' }); if (p) items.push({ t: 'text', raw: p }); });
        continue;
      }
      items.push(g);
    }
    const lines: any[][] = [[]];
    for (const g of items) { if (g.t === 'par') lines.push([]); else lines[lines.length - 1].push(g); }
    let y = 0, prev: any = null, Pl = P0; // (the top level is one group: settings carry from line to line)
    lines.forEach((line, j) => {
      const F: any = layPieces(line, Pl, warn, G, j === 0);
      Pl = F.P;
      if (!F.pieces.length) return;
      // TeX's \baselineskip 12pt, or \lineskip 1pt between the boxes when they would come closer
      if (prev != null) y += Math.max(12 * PT, prev + F.asc + 1 * PT);
      attach(root, F, 0, y);
      ext(root, F.bb!.x1, y + F.bb!.y1, F.bb!.x2, y + F.bb!.y2);
      prev = F.bb!.y2;
    });
  }
  if (hreac) { const H: any = root.kids[0]; root.bb = H.bb ? { ...H.bb } : null; }
  const K = newSink();
  emit(root, 0, 0, K);
  // \chemmove: curved arrows between named atoms, bonds and compounds, drawn over everything (overlay: not in the box)
  const moves: any[] = [];
  for (const { seg, snap, at } of G.moves) {
    const names = { atoms: {}, bonds: {} };
    for (const [n, e] of Object.entries<any>(snap)) { const b = relBox(e, null); if (e.pt) (names.bonds as Record<string, any>)[n] = [b.x, b.y]; else (names.atoms as Record<string, any>)[n] = b; }
    const o = at ? relBox(at, null) : null;
    if (seg.t === 'pdelim') polymerDelim(seg, names, warn, K); else chemMove(seg, names, warn, moves, o ? [o.x, o.y] : [0, 0], K);
  }
  const empty = !K.mols.length && !K.texts.length && !K.arrows.length && !K.paths.length;
  let b: any = root.bb;
  if (!b || !(b.x2 >= b.x1) || empty) b = { x1: 0, y1: -PX, x2: 2 * PX, y2: 0 };
  let { x1, y1, x2, y2 } = b;
  if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
  if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
  // compounds of the schemes, by name, with their boxes (for the editor)
  const comps = G.comps.map((c) => ({ name: (c as any).name, level: (c as any).level, segs: (c as any).segs, box: relBox((c as any).entry, null) }));
  return { segs, scheme, hreac, P, comps, arrows: K.arrows, moves, paths: K.paths, texts: K.texts, dots: K.dots, verts: K.verts, bonds: K.bonds, rings: K.rings, mols: K.mols, warnings, empty, text: TEXT, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  } finally { ({ EM, EX, TEXT } = saved); }
}
// \hreac: nodes in a row, their centres on the centre of a \vphantom{A} at the start, hreac sep apart
function layHreac(body: any, lead: any, P: any, warn: any, G: any) {
  const H = frag(), nodes = [];
  let gs = [];
  for (const g of body) {
    if (g.t === 'plus') { nodes.push({ k: 'comp', gs }, { k: 'plus', seg: g }); gs = []; }
    else if (g.t === 'harrow') { nodes.push({ k: 'comp', gs }, { k: 'arrow', seg: g }); gs = []; }
    else if (g.t === 'arrow' || g.t === 'merge') warn('\\arrow and \\merge inside \\hreac aren\'t drawn here (they are kept in the code)');
    else gs.push(g);
  }
  nodes.push({ k: 'comp', gs });
  const yc = -0.683 * EM / 2, bo = baseOff(TEXT);
  ext(H, 0, -0.683 * EM, lead, 0); // TeX's box holds the leading spaces
  let x = lead;
  nodes.forEach((nd, i) => {
    const left = x + (i === 0 ? 0 : P.hsep);
    if (nd.k === 'comp') {
      const C: any = layPieces(nd.gs, P, warn, G);
      const base = yc + (C.asc - C.desc) / 2;
      attach(H, C, left, base);
      if (C.pieces.length) ext(H, left, base - C.asc, left + C.w, base + C.desc);
      x = left + C.w; return;
    }
    if (nd.k === 'plus') {
      const pw = 0.778 * EM, tb = TD.textBox('$+$', TEXT), base = yc + (0.583 * EM - 0.083 * EM) / 2;
      H.texts.push({ t: '$+$', cx: left + pw / 2, cy: base - bo + tb.h / 2, b: tb, seg: nd.seg });
      ext(H, left, base - 0.583 * EM, left + pw, base + 0.083 * EM);
      x = left + pw; return;
    }
    // an arrow: at least harrow minwidth × arrow coeff, or as wide as its labels and 2 label xsep
    const ar = nd.seg, labs: any[] = [];
    const boxes = ar.labels.map((l: any) => { if (l == null || !String(l).trim()) return null; const t = printable(unbrace(l)); return { t, b: TD.textBox(t, TEXT), m: vmetrics(t.replace(/\$/g, '')) }; });
    let Lh = P.hminw * P.acoeff;
    for (const q of boxes) if (q) Lh = Math.max(Lh, q.b.w - 2 + 2 * P.lxsep);
    boxes.forEach((q: any, j: any) => {
      if (!q) return;
      const asc = Math.max(q.m.asc, 0), desc = q.m.desc;
      const base = j === 0 ? yc - P.lsep - desc : yc + P.lsep + asc;
      labs.push({ t: q.t, cx: left + Lh / 2, cy: base - bo + q.b.h / 2, bx: left + Lh / 2, by: base - (asc - desc) / 2, bw: Lh - 2 * P.lxsep, bh: asc + desc, b: q.b, rot: 0, which: j, seg: ar });
    });
    addArrow(H, makeArrow(ar, [left, yc], [left + Lh, yc], 0, '', P, warn, G, labs));
    x = left + Lh;
  });
  return H;
}

const layout = layoutCache((s: any) => srcKey(s), (s: any) => build(s.src), { onClear: () => { baseCache.clear(); } });

// ---------------------------------------------------------------- drawing
// an arrow tip as chemfig's CF arrow: 5pt long, 4pt wide, inset 2.5pt; a harpoon keeps the left half
// the arrow head arrow head=… asks for: CF (chemfig's own, the default), stealth, latex, or to (TikZ's ->)
function headKind(v: any, warn?: any) {
  const h = String(v || '').trim().replace(/^-/, '').replace(/\[.*$/, '').trim();
  if (/^cf$/i.test(h) || !h) return 'CF';
  if (/^stealth/i.test(h)) return 'stealth';
  if (/^latex/i.test(h)) return 'latex';
  if (h === '>' || /^to$/i.test(h)) return 'to';
  if (warn) warn(`The arrow head "${v}" isn't drawn here: drawn as chemfig's (it is kept in the code)`);
  return 'CF';
}
function tip(q1: any, q2: any, harpoon: any, ink?: any, kind = 'CF') {
  const L = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1, ux = (q2[0] - q1[0]) / L, uy = (q2[1] - q1[1]) / L, nx = uy, ny = -ux;
  const P2 = (p: any) => `${r2(p[0])},${r2(p[1])}`;
  if (kind === 'to') {
    // TikZ's to: an open curved chevron, stroked; the shaft runs to the point
    const back = 3 * PT, half = 2.2 * PT, T = q2, B = [T[0] - ux * back, T[1] - uy * back];
    const l = [B[0] + nx * half, B[1] + ny * half], r = [B[0] - nx * half, B[1] - ny * half], m = [T[0] - ux * back * 0.25, T[1] - uy * back * 0.25];
    const lc = [m[0] + nx * half * 0.15, m[1] + ny * half * 0.15], rc = [m[0] - nx * half * 0.15, m[1] - ny * half * 0.15];
    return { shaft: [q1, T], d: harpoon ? `M${P2(l)}Q${P2(lc)} ${P2(T)}` : `M${P2(l)}Q${P2(lc)} ${P2(T)}Q${P2(rc)} ${P2(r)}`, open: true };
  }
  if (kind === 'latex') {
    // TikZ's latex: a filled triangle with slightly curved sides
    const len = 4 * PT, half = 1.65 * PT, T = q2, B = [T[0] - ux * len, T[1] - uy * len];
    const l = [B[0] + nx * half, B[1] + ny * half], r = [B[0] - nx * half, B[1] - ny * half], m = [T[0] - ux * len * 0.5, T[1] - uy * len * 0.5];
    const lc = [m[0] + nx * half * 0.62, m[1] + ny * half * 0.62], rc = [m[0] - nx * half * 0.62, m[1] - ny * half * 0.62];
    return { shaft: [q1, [B[0] + ux * 0.5 * PT, B[1] + uy * 0.5 * PT]], d: harpoon ? `M${P2(T)}Q${P2(lc)} ${P2(l)}L${P2(B)}Z` : `M${P2(T)}Q${P2(lc)} ${P2(l)}L${P2(r)}Q${P2(rc)} ${P2(T)}Z` };
  }
  const st = kind === 'stealth';
  const len = st ? 4.2 * PT : 5 * PT, half = st ? 1.9 * PT : 2 * PT, inset = st ? 1.7 * PT : 2.5 * PT;
  const T = q2, B = [T[0] - ux * len, T[1] - uy * len], I = [T[0] - ux * inset, T[1] - uy * inset];
  const l = [B[0] + nx * half, B[1] + ny * half], r = [B[0] - nx * half, B[1] - ny * half];
  const pts = harpoon ? [T, l, I] : [T, l, I, r];
  return { shaft: [q1, I], d: `M${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z` };
}
// a \chemmove path: shortened, then the tips' insets taken off, the tips drawn on the ends.
// As pgf does by default, only the end points move (toward the neighbouring point); control points stay.
function moveSvg(mv: any, ink: any) {
  const pts = mv.segs.pts.map((q: any) => q.slice()), ops = mv.segs.ops.map((o: any) => (o.k === 'curve' ? { k: 'curve', c1: o.c1.slice(), c2: o.c2.slice() } : { k: 'line' }));
  const n = pts.length - 1;
  const pull = (end: any, d: any) => {
    if (!d) return null;
    const k = end ? n : 0, o = end ? ops[n - 1] : ops[0];
    const nb = o.k === 'curve' ? (end ? o.c2 : o.c1) : pts[end ? n - 1 : 1];
    let ux = pts[k][0] - nb[0], uy = pts[k][1] - nb[1];
    const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    const tipAt = pts[k].slice();
    pts[k] = [pts[k][0] - ux * d, pts[k][1] - uy * d];
    return { tipAt, ux, uy };
  };
  const closed = !!mv.segs.closed;
  if (!closed) { pull(true, mv.sh2); pull(false, mv.sh1); }
  const col = mv.color ? TD.css(mv.color) : ink;
  let tips = '';
  for (const end of [true, false]) {
    if (closed || !(end ? mv.tipE : mv.tipS)) continue;
    const t = pull(end, 2.5 * PT);
    if (!t) continue;
    const e = tip([t.tipAt[0] - t.ux * 10, t.tipAt[1] - t.uy * 10], t.tipAt, false);
    tips += `<path d="${e.d}" fill="${col}" stroke="${col}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
  }
  let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  ops.forEach((o: any, k: any) => { const q = pts[k + 1]; d += o.k === 'curve' ? `C${r2(o.c1[0])},${r2(o.c1[1])} ${r2(o.c2[0])},${r2(o.c2[1])} ${r2(q[0])},${r2(q[1])}` : `L${r2(q[0])},${r2(q[1])}`; });
  const dash = dashAttr(mv.dash);
  // (fill=…: the fill first, then the line, as TikZ paints them; a fill colour is the path's, the line its own)
  const fill = mv.fill ? `fill="${TD.css(mv.fill)}"${mv.fop < 1 ? ` fill-opacity="${mv.fop}"` : ''}` : 'fill="none"';
  return `<path d="${d}${closed ? 'Z' : ''}" ${fill} stroke="${col}" stroke-width="${r2(mv.sw)}"${mv.op < 1 ? ` stroke-opacity="${mv.op}"` : ''}${dash}/>${tips}`;
}
// an arrow tip from tip(): filled, or (to) stroked like the shaft
const headSvg = (e: any, col: any, sw: any) => (e.open ? `<path d="${e.d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${e.d}" fill="${col}" stroke="${col}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`);
// dashed, dotted, or dash pattern=on a off b… (an array of lengths)
const dashAttr = (d: any) => (Array.isArray(d) ? ` stroke-dasharray="${d.map(r2).join(' ')}"` : d === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : d === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT)}" stroke-linecap="round"` : '');
// what a frag emitted: paths, dots, arrows with their labels, texts
function drawSink(Lo: any, ink: any, color: any, ctx: any) {
  let out = '';
  const T = (p: any) => (p.dx || p.dy ? ` transform="translate(${r2(p.dx)},${r2(p.dy)})"` : '');
  for (const p of Lo.paths) {
    const col = p.color ? TD.css(p.color) : ink;
    if (p.fill) out += `<path d="${p.d}"${T(p)} fill="${col}" stroke="${p.sw ? col : 'none'}"${p.sw ? ` stroke-width="${r2(p.sw)}" stroke-linejoin="${p.join || 'round'}"` : ''}${p.op != null ? ` opacity="${p.op}"` : ''}/>`;
    else out += `<path d="${p.d}"${T(p)} fill="none" stroke="${col}" stroke-width="${r2(p.sw)}" stroke-linejoin="${p.join || 'round'}"${dashAttr(p.dash)}${p.op != null ? ` stroke-opacity="${p.op}"` : ''}/>`;
  }
  for (const d of Lo.dots) out += `<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.r)}" fill="${ink}"/>`;
  for (const a of Lo.arrows) {
    const col = a.color ? TD.css(a.color) : ink, sw = r2(a.sw || LW);
    if (!a.hidden) for (const p of a.prim) {
      if (p.pts) {
        // an arc (-U>), its tip along the last piece
        const n = p.pts.length - 1, e = p.head ? tip(p.pts[n - 1], p.pts[n], false, null, a.head) : null;
        const pts = e ? [...p.pts.slice(0, n), e.shaft[1]] : p.pts;
        out += `<path d="M${pts.map((q: any) => `${r2(q[0])},${r2(q[1])}`).join('L')}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"${dashAttr(a.dash)}/>`;
        if (e) out += headSvg(e, col, sw);
        continue;
      }
      if (!p.head) { out += `<path d="M${r2(p.q1[0])},${r2(p.q1[1])}L${r2(p.q2[0])},${r2(p.q2[1])}" fill="none" stroke="${col}" stroke-width="${sw}"${p.cross ? '' : dashAttr(a.dash)}/>`; continue; }
      const e = tip(p.q1, p.q2, p.harpoon, null, a.head);
      let a1 = p.q1, e2: any = null;
      if (p.head === 'both') { e2 = tip(p.q2, p.q1, p.harpoon, null, a.head); a1 = e2.shaft[1]; }
      out += `<path d="M${r2(a1[0])},${r2(a1[1])}L${r2(e.shaft[1][0])},${r2(e.shaft[1][1])}" fill="none" stroke="${col}" stroke-width="${sw}"${dashAttr(a.dash)}/>${headSvg(e, col, sw)}${e2 ? headSvg(e2, col, sw) : ''}`;
    }
    for (const l of a.labs) {
      if (l.g) { out += `<g transform="translate(${r2(l.bx)},${r2(l.by)})${Math.abs(l.rot) > 1e-6 ? ` rotate(${r2(-l.rot)})` : ''}${l.s !== 1 ? ` scale(${r2(l.s)})` : ''} translate(${r2(-l.fc[0])},${r2(-l.fc[1])})">${drawSink(l.g, ink, color, ctx)}</g>`; continue; }
      const t = TD.textSvg(l.t, TEXT, color, l.cx, l.cy, ctx);
      out += Math.abs(l.rot) > 1e-6 ? `<g transform="rotate(${r2(-l.rot)} ${r2(l.cx)} ${r2(l.cy)})">${t}</g>` : t;
    }
  }
  for (const t of Lo.texts) out += TD.textSvg(t.t, t.st || TEXT, t.color || color, t.cx, t.cy, ctx);
  return out;
}
function draw(s: any, ctx: any, given?: any) {
  const Lo = given || layout(s);
  const ink = TD.css(s.color || '#000000');
  let out = '';
  if (Lo.empty) {
    const b = Lo.bb;
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty chemistry block', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  // the texts in the drawing's font size
  const saved = TEXT;
  TEXT = Lo.text || TEXT;
  try { out += drawSink(Lo, ink, s.color || '#000000', ctx); } finally { TEXT = saved; }
  for (const mv of Lo.moves || []) out += moveSvg(mv, ink);
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

// a small drawing of a snippet (palette previews)
TD.chemMini = (src: any) => {
  const s = { type: 'chemfig', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb;
  return `<svg class="zxmini" width="${r2(bb.w)}" height="${r2(bb.h)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" style="overflow:visible" aria-hidden="true">${draw(s, { export: true })}</svg>`;
};
const counts = (L: any) => {
  const n = L.mols.length, a = L.arrows.length;
  return a ? `${n} molecule${n === 1 ? '' : 's'} · ${a} arrow${a === 1 ? '' : 's'}` : `${L.verts.filter((v: any) => v.label).length} atoms · ${L.bonds.length} bonds`;
};

TD.TYPES.chemfig = {
  name: 'Chemistry',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'chemfig', x: p.x, y: p.y, src: TD.CHEM_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // the code unchanged, in a node whose top left is the drawing's
  tikz(s: any, X: any) {
    X.pkgs.add('chemfig');
    const o = ['anchor=north west', 'inner sep=0pt'];
    const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    if (col) o.push(`text=${col}`);
    const src = parSafe(String(s.src || '').trim()).code; // (a blank line inside a molecule or scheme would stop LaTeX)
    // paragraphs (\par, a blank line) need a node with a text width
    if (/\\par(?![A-Za-z])|\n[ \t]*\n/.test(src.replace(/%[^\n]*/g, ''))) o.push(`text width=${r2(layout(s).bb.w / PX + 0.05)}cm`, 'align=left');
    return `\\node[${o.join(', ')}] at ${X.c(s.x, s.y)} {${src.includes('\n') ? `%\n${src}%\n` : src}};`;
  },
};


// chemfig 1.x code in today's form: the old setters become \setchemfig{…} (one for a run of them), \setandsign's
// spacing goes onto each bare \+ after it, \chemfig*{…} becomes \chemfig[fixed length]{…} and \chemfig[tikz][tikz]
// becomes \chemfig[chemfig style={…},node style={…}]. Returns the code and what changed; the code as written when
// there is nothing to change.
function modernize(src: any) {
  const code = String(src || ''), changes: string[] = [];
  const segs = parseDoc(code, () => {});
  const kvCode = (kv: Record<string, string>) => Object.entries(kv).map(([k, v]) => (v === 'true' ? k : `${k}=${/[,=]/.test(v) ? `{${v}}` : v}`)).join(',');
  let sign: string | null = null;
  const signOn = (L: any[]) => { for (const g of L) { if (g.t === 'plus' && sign && /^\\\+\s*$/.test(g.raw)) { g.raw = `\\+{${sign}}`; } if (g.inner) signOn(g.inner); } };
  const head = (g: any) => {
    const h = String(g.head || ''), star = /^\\chemfig\s*\*/.test(h), opts: string[] = [];
    for (let k = h.indexOf('['); k >= 0; ) { const e = close(h, k); if (e < 0) return; opts.push(h.slice(k + 1, e)); k = h.indexOf('[', e + 1); }
    const one = opts.length === 1 ? readKV(opts[0]) : null, modern = !opts.length || (one && Object.keys(one).every((k) => CHEMFIG_KEYS.has(k)));
    if (!star && modern) return;
    const keys = [...(star ? ['fixed length'] : []), ...(modern ? opts.filter((o) => o.trim()) : [opts[0] && opts[0].trim() ? `chemfig style={${opts[0].trim()}}` : '', opts[1] && opts[1].trim() ? `node style={${opts[1].trim()}}` : ''].filter(Boolean))];
    const nh = keys.length ? `\\chemfig[${keys.join(',')}]` : '\\chemfig';
    g.raw = nh + g.raw.slice(h.length); g.head = nh;
    changes.push(star ? '\\chemfig*' : '\\chemfig[…][…]');
  };
  const walk = (L: any[], top: boolean) => {
    let run: any = null; // the \setchemfig a run of old setters goes into, while only spaces come between them
    for (let i = 0; i < L.length; i++) {
      const g = L[i];
      if (g.t === 'set' && g.legacy && top) {
        const kv = { ...g.kv };
        if ('and sign' in kv) { sign = String(kv['and sign']).split(',').map((x) => x.trim()).join(','); while (/,$/.test(sign)) sign = sign.slice(0, -1); delete kv['and sign']; }
        changes.push('\\' + g.legacy);
        if (run) { Object.assign(run.kv, kv); g.raw = ''; for (let j = L.indexOf(run) + 1; j < i; j++) L[j].raw = ''; if (Object.keys(run.kv).length) run.raw = `\\setchemfig{${kvCode(run.kv)}}`; continue; }
        g.kv = kv; g.legacy = null; g.raw = Object.keys(kv).length ? `\\setchemfig{${kvCode(kv)}}` : '';
        run = g; continue;
      }
      if (run && g.t === 'text' && !g.raw.trim()) continue;
      run = null;
      if (g.t === 'mol') head(g);
      if (g.t === 'plus' && sign && /^\\\+\s*$/.test(g.raw)) g.raw = `\\+{${sign}}`;
      if (g.inner) { if (sign) signOn(g.inner); walk(g.inner, false); }
    }
  };
  walk(segs, true);
  if (!changes.length) return { code, changes };
  return { code: writeDoc(segs), changes: [...new Set(changes)] };
}

// The document preamble's chemfig setup (\\setchemfig, \\setcharge, \\definesubmol, their resets, 1.x setters, and the
// \\tikzset styles the code names): set there, they hold for every molecule, so they go at the head of the block's code,
// where TeX applies them the same way. Each line ends in % (a line break there would be a space before the drawing).
function withPreamble(pre: string, code: string) {
  const segs = parseDoc(String(pre || ''), () => {}), keep: string[] = [];
  for (const g of segs) {
    // (already in the code: a block written out and read back, its setup now in both)
    if (code.includes(g.raw.trim())) continue;
    if (g.t === 'submol' || g.t === 'reset' || (g.t === 'set' && !g.tikz)) keep.push(g.raw.trim());
    else if (g.t === 'set' && g.tikz) {
      const ks = Object.keys(g.kv), names = ks.map((k) => (/^(.+?)\s*\/\.style$/.exec(k) || [])[1]);
      // (named as a key in the code's options: [name, …] or …, name] or {name})
      const used = (n: string) => new RegExp(`[[,{]\\s*${n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,\\]}=]`).test(code);
      if (ks.length && names.every(Boolean) && names.some((n) => used(n!))) keep.push(g.raw.trim());
    }
  }
  return keep.length ? keep.join('%\n') + '%\n' + code : code;
}

// for the visual editor (js/cfeditor.ts)
TD.chem = { build, modernize, parseDoc, writeDoc, parseChain, writeChain, splitAtoms, layout, draw, angleOf, norm360, split, unbrace, labelLines, stackLines, close, markDirty, counts, TEXT, DEF, PT, EM };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("chemfig", {
  menu: { order: 12, group: 'chemistry', label: "Chemistry", title: "Chemistry: structural formulas and reaction schemes, written for chemfig", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M9 4.5l6 3.5v7l-6 3.5-6-3.5V8z\"/><path d=\"M11 7.4l2.4 1.4M5 9.5v4.2\"/><path d=\"M15 15l5 3\"/><path d=\"M21 12h8M26 9.5l3 2.5-3 2.5\"/></svg>" },
  // a block brought in from code (a .tex file, a paste): the chemfig commands written before its first \\chemfig (or
  // a scheme of text compounds) come with it, with the preamble's chemfig settings, and chemfig 1.x code comes in
  // today's form
  nodeImport: { re: /(?:\\(?:tikzset|setchemfig|resetchemfig|setcharge|resetcharge|definesubmol|redefinesubmol|schemestart|chemnameinit|chemname|setatomsep|setcrambond|setbondoffset|setdoublesep|setangleincrement|setbondstyle|setnodestyle|setcompoundstyle|setcompoundsep|setarrowoffset|setarrowlabelsep|setstacksep|setlewis|setlewisdist|schemedebug|setarrowdefault|setandsign|enablefixedbondlength|disablefixedbondlength|enablebondjoin|disablebondjoin)(?![A-Za-z])[\s\S]*?)?\\(?:chemfig|schemestart)(?![A-Za-z])[\s\S]*/, order: 9, place: (q: any, at: any) => { q.src = modernize(q.src).code; q.x = at.x; q.y = at.y; }, opts: ['anchor', 'inner sep', 'text'], preamble: withPreamble },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.chemEditor, alias: "chemOpen", layout: (s) => TD.chem.layout(s) }
});
export { layout, counts };
