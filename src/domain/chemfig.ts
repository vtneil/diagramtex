import { measurementElement } from './measurement';
import { runtime as TD } from '../runtime';
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
const setSize = (pt: number) => { EM = pt * PT; EX = 0.43056 * pt * PT; TEXT = { size: pt * PT, font: 'default' }; };
const defaults = () => ({ sep: 3 * EM, boff: 2 * PT, dsep: 2 * PT, cram: 1.5 * EX, dashOn: 1 * PT, dashOff: 2 * PT, inc: 45, csep: 5 * EM, aoff: 1 * EM, acoeff: 1, aangle: 0, lsep: 3 * PT, hminw: 3 * EM, lxsep: 3 * PT, hsep: 0.5 * EM, fixed: false, plusL: 0.5 * EM, plusR: 0.5 * EM, nameSep: 1.5 * EX });
const DEF = defaults();

TD.CHEM_DEFAULT = '\\chemfig{H_3C-C(=[1]O)-[7]OH}';

// ---------------------------------------------------------------- reading
function close(s: any, i: any) {
  const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, any>)[open];
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
const unbrace = (v: any) => { v = String(v ?? '').trim(); while (v[0] === '{' && close(v, 0) === v.length - 1) v = v.slice(1, -1).trim(); return v; };
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
const skipWs = (s: any, i: any) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
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
const SPACE_RE = /\\kern\s*(-?\s*[\d.]+\s*(?:cm|mm|pt|em|ex|in|bp)) ?|\\hspace\*?\s*\{([^}]*)\}|\\(qquad|quad|enspace|thinspace|negthinspace)(?![A-Za-z])\s*|\\([,;:!])/g;
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
    out.push({ sp: m[1] != null ? len(m[1].replace(/\s+/g, ''), 0) : m[2] != null ? len(m[2].trim(), 0) : named[m[3] || m[4]] });
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
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
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
      if (s[j] === '[') { const e = close(s, j); if (e > 0) { arg = split(s.slice(j + 1, e)).map((x) => x.trim()); j = e + 1; } }
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
      chain.items.push({ t: 'ring', star: m[1], arc: m[2] || '', n: Math.max(3, parseInt(m[3], 10)), nRaw: s.slice(i + m[1].length, o), chain: parseChain(s.slice(o + 1, e), warn) });
      i = e + 1; continue;
    }
    if (c === '!') {
      flush();
      let j = i + 1, name;
      if (s[j] === '{') { const e = close(s, j); if (e < 0) { warn('The { after ! is not closed'); atom += s.slice(i); break; } name = s.slice(j + 1, e); j = e + 1; }
      else if (s[j] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(j)); name = m![0]; j += m![0].length; }
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
//   { t: 'harrow', raw, type, labels: [above, below] }   (\hreac … \endhreac: + and > between compounds)
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
      else if (s[k] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(k)); name = m![0]; j = k + m![0].length; }
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
      for (;;) { const k = skipWs(s, j); if (s[k] === '[') { const e = close(s, k); if (e < 0) break; j = e + 1; } else break; }
      const head = s.slice(i, j), k = skipWs(s, j);
      if (s[k] !== '{') { warn('\\chemfig needs { … }'); text += head; i = j; continue; }
      const e = close(s, k);
      if (e < 0) { warn('The { after \\chemfig is not closed'); text += s.slice(i); i = s.length; continue; }
      if (head !== '\\chemfig') warn('\\chemfig\'s optional arguments aren\'t drawn here (they are kept in the code)');
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
        if (s[p] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(p)); return { v: m![0], e: p + m![0].length }; }
        return p < s.length ? { v: s[p], e: p + 1 } : null;
      };
      const L = tok(i + 9);
      let p = L ? L.e : s.length, nest = 0, found = -1;
      while (p < s.length) {
        const c = s[p];
        if (c === '%') { const e = s.indexOf('\n', p); p = e < 0 ? s.length : e; continue; }
        if (c === '{') { const e = close(s, p); if (e < 0) break; p = e + 1; continue; }
        if (c === '\\') {
          const m = /^\\([A-Za-z]+|.)/.exec(s.slice(p, p + 40));
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
      segs.push({ t: 'chg', cmd: s[i + 1] === 'C' ? 'Charge' : 'charge', opt, charges: readCharges(s.slice(k + 1, e1)), inner: parseDoc(s.slice(k2 + 1, e2), warn, defs), pre: s.slice(i, k2 + 1), post: '}', raw: s.slice(i, e2 + 1) });
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
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); text += m![0]; i += m![0].length; continue; }
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
    if (c === '{') { const e = close(s, i); const tok = s.slice(i, e < 0 ? s.length : e + 1); start(tok); i += tok.length; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      const name = m![1];
      let j = i + m![0].length;
      if (/^(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)$/.test(name)) {
        let o = '';
        let k = skipWs(s, j);
        if (s[k] === '[') { const e = close(s, k); o = s.slice(k + 1, e); k = skipWs(s, e + 1); }
        const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
        if (e2 < 0) { add(m![0]); i = j; continue; }
        const a = s.slice(k + 1, e1), b = s.slice(k2 + 1, e2);
        const tok = s.slice(i, e2 + 1);
        if (/charge/i.test(name)) start(tok, { tex: b, charges: readCharges(a), cmd: name, copt: o, inner: b });
        else start(tok, { tex: a, stack: { text: b, dir: /below/i.test(name) ? 1 : -1 }, cmd: name, inner: a });
        i = e2 + 1; continue;
      }
      let tok = m![0];
      for (;;) { const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e < 0) break; tok += s.slice(j, e + 1); j = e + 1; } else break; }
      add(tok); i = j; continue;
    }
    if (c === '_' || c === '^') {
      let j = skipWs(s, i + 1), tok;
      if (s[j] === '{') { const e = close(s, j); tok = s.slice(i, e < 0 ? s.length : e + 1); }
      else if (s[j] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(j)); tok = s.slice(i, j + m![0].length); }
      else tok = s.slice(i, j + 1);
      add(tok); i += tok.length; continue;
    }
    if (/[A-Z]/.test(c)) { start(c); i++; continue; }
    add(c); i++;
  }
  // @{name} with no atom after it (Cl-@{a}(=O)…): it names the empty atom, for \chemmove
  return { atoms, hooks, tail: atoms.length ? null : name };
}
// \charge{90=\:,0:2pt[red]=$\oplus$}: position[:offset][tikz]=what
function readCharges(list: any) {
  const out = [];
  for (const it of split(list)) {
    const m = /^\s*([^=:[]+?)\s*(?::\s*([^=[]+?))?\s*(\[[^\]]*\])?\s*=\s*([\s\S]*?)\s*$/.exec(it);
    if (!m) continue;
    const ang = /^-?[\d.]+$/.test(m[1]) ? ((parseFloat(m[1]) % 360) + 360) % 360 : ({ east: 0, 'north east': 45, north: 90, 'north west': 135, west: 180, 'south west': 225, south: 270, 'south east': 315 }[m[1]] ?? 90);
    out.push({ pos: m[1], angle: ang, off: m[2] ? len(m[2], 0) : 0, tikz: m[3] || '', what: m[4] });
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
    return out;
  }
  // a vertex: an atom group (or an empty one) placed with its arrival atom's centre at (x, y)
  function place(g: any, ctx: any, x: any, y: any, angle: any, arrive: any) {
    const sp = g ? splitAtoms(g.raw) : { atoms: [], hooks: [] };
    const boxes = sp.atoms.length ? sp.atoms.map((a) => ({ ...atomBox(a.tex), src: a })) : [{ tex: '', w: 0, asc: 0, desc: 0, empty: true, ...((sp as any).tail ? { src: { name: (sp as any).tail } } : {}) }];
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
    for (const b of boxes) if (!b.empty) texts.push({ t: atomTex(b.tex), box: b, v });
    // charges and stacked text
    for (const b of boxes) {
      const a = (b as any).src;
      if (a && a.charges) for (const c of a.charges) chargeMarks(b, { ...c, overlay: !(a.cmd === 'Charge' || /overlay\s*=\s*false/.test(a.copt || '')) }, { paths, dots, texts });
      if (a && a.stack) {
        // \chemabove{A}{x}: x set as an atom ($\rm x$) 1.5pt over A's box (or under it), centred on A
        const t = atomTex(a.stack.text), tb = TD.textBox(t, TEXT), m = vmetrics(a.stack.text);
        const k = /\\scriptscriptstyle/.test(a.stack.text) ? 0.5 : /\\scriptstyle/.test(a.stack.text) ? 0.7 : 1;
        const base = a.stack.dir < 0 ? (b as any).base - b.asc - 1.5 * PT - m.desc * k : (b as any).base + b.desc + 1.5 * PT + m.asc * k;
        // chemfig's \vbox to the atom's height: the stacked text overhangs, outside TeX's box
        texts.push({ t, cx: (b as any).cx, cy: base - baseOff(TEXT) + tb.h / 2, b: tb, ink: [base - m.asc * k, base + m.desc * k], stack: true });
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
    const offA = ba.empty ? 0 : P.boff, offB = bb.empty ? 0 : P.boff;
    const ta = exit(ba, ux, uy) + offA, tb = exit(bb, ux, uy) + offB;
    const p0 = [ax + ux * ta, ay + uy * ta], p1 = [bx - ux * tb, by - uy * tb];
    const nx = uy, ny = -ux; // left of travel, on screen
    const tikz = (item.arg && item.arg[4]) || '';
    const sty = bondStyle(tikz, warn);
    const sw = sty.width || LW, col = sty.color;
    const seg = (q0: any, q1: any, sh0 = 0, sh1 = 0) => `M${r2(q0[0] + ux * sh0)},${r2(q0[1] + uy * sh0)}L${r2(q1[0] - ux * sh1)},${r2(q1[1] - uy * sh1)}`;
    const off = (q: any, d: any) => [q[0] + nx * d, q[1] + ny * d];
    const sym = item.sym;
    const draw = [];
    if (!sty.none) {
      if (sym === '-') draw.push({ d: seg(p0, p1), sw, color: col, dash: sty.dash });
      else if (sym === '~') { draw.push({ d: seg(p0, p1), sw, color: col }, { d: seg(off(p0, P.dsep), off(p1, P.dsep)), sw, color: col }, { d: seg(off(p0, -P.dsep), off(p1, -P.dsep)), sw, color: col }); }
      else if (sym[0] === '=') {
        let typ = sym === '=^' ? 1 : sym === '=_' ? 2 : 0;
        if (ring && typ === 0) typ = 1;
        if (typ === 0) draw.push({ d: seg(off(p0, P.dsep / 2), off(p1, P.dsep / 2)), sw, color: col }, { d: seg(off(p0, -P.dsep / 2), off(p1, -P.dsep / 2)), sw, color: col });
        else {
          const corr = ring ? P.dsep * Math.tan(Math.PI / ring.n) : 0, sg = typ === 1 ? 1 : -1;
          const s0 = ring && !offA ? sg * corr : 0, s1 = ring && !offB ? sg * corr : 0;
          draw.push({ d: seg(p0, p1), sw, color: col }, { d: seg(off(p0, sg * P.dsep), off(p1, sg * P.dsep), s0, s1), sw, color: col });
        }
      } else {
        // wedges: > and its kin are wide at the start, < at the end
        const wideStart = sym[0] === '>';
        const W = wideStart ? p0 : p1, N = wideStart ? p1 : p0, h = P.cram / 2;
        if (sym.length === 1) {
          const q = [off(W, h), off(W, -h), off(N, -LW / 2), off(N, LW / 2)];
          draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw: LW, fill: col || true, color: col });
        } else if (sym[1] === '|') {
          const q = [off(W, h), off(W, -h), N];
          draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw: LW, color: col, join: 'bevel' });
        } else {
          // hashed: dashes 1pt on 2pt off along the axis from the wide end, line width cram width, clipped to the triangle
          const Lb = Math.hypot(N[0] - W[0], N[1] - W[1]) || 1, vx = (N[0] - W[0]) / Lb, vy = (N[1] - W[1]) / Lb, mx = vy, my = -vx;
          let d = '';
          for (let s0 = 0; s0 < Lb; s0 += P.dashOn + P.dashOff) {
            const s1 = Math.min(Lb, s0 + P.dashOn), w0 = h * (1 - s0 / Lb), w1 = h * (1 - s1 / Lb);
            const c0 = [W[0] + vx * s0, W[1] + vy * s0], c1 = [W[0] + vx * s1, W[1] + vy * s1];
            d += `M${r2(c0[0] + mx * w0)},${r2(c0[1] + my * w0)}L${r2(c1[0] + mx * w1)},${r2(c1[1] + my * w1)}L${r2(c1[0] - mx * w1)},${r2(c1[1] - my * w1)}L${r2(c0[0] - mx * w0)},${r2(c0[1] - my * w0)}Z`;
          }
          draw.push({ d, sw: 0, fill: col || true, color: col });
        }
      }
    }
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
      const c = st.cycle, n = c.n, R = (st.defLen * P.sep) / (2 * Math.sin(Math.PI / n));
      const a = st.curAngle + c.init + 180 / n + 90, hv = c.hook.v.boxes[c.hook.k];
      c.cx = hv.cx + R * Math.cos(rad(a)); c.cy = hv.cy - R * Math.sin(rad(a));
      rings.push({ item: c.item, cx: c.cx, cy: c.cy, n, chain: c.item.chain, hook: c.hook.v });
      if (c.item.star === '**') {
        const r = (0.75 * st.defLen * P.sep) / (2 * Math.tan(Math.PI / n));
        let a0 = 0, a1 = 360;
        if (c.item.arc) { const f = split(c.item.arc.slice(1, -1)).map((x) => x.trim()); if (f[0]) a0 = parseFloat(f[0]) || 0; if (f[1]) a1 = parseFloat(f[1]) || 360; }
        if (Math.abs(a1 - a0) >= 360) paths.push({ d: `M${r2(c.cx + r)},${r2(c.cy)}a${r2(r)},${r2(r)} 0 1,0 ${r2(-2 * r)},0a${r2(r)},${r2(r)} 0 1,0 ${r2(2 * r)},0Z`, sw: LW, circle: true });
        else {
          const pa = [c.cx + r * Math.cos(rad(a0)), c.cy - r * Math.sin(rad(a0))], pb = [c.cx + r * Math.cos(rad(a1)), c.cy - r * Math.sin(rad(a1))];
          paths.push({ d: `M${r2(pa[0])},${r2(pa[1])}A${r2(r)},${r2(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0},${a1 > a0 ? 0 : 1} ${r2(pb[0])},${r2(pb[1])}`, sw: LW });
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
        st.pending = { item: it, angle, from: V, dep, arr: isFinite(arr) ? arr : null, fixed, x: sx + L * P.sep * Math.cos(rad(angle)), y: sy - L * P.sep * Math.sin(rad(angle)) };
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
  }
  for (const t of texts) if (!t.box && !t.charge && !t.stack) ext(t.cx - (t.b.w - 2) / 2, t.ink ? t.ink[0] : t.cy - t.b.h / 2, t.cx + (t.b.w - 2) / 2, t.ink ? t.ink[1] : t.cy + t.b.h / 2);
  if (!(x2 >= x1)) { x1 = x2 = 0; y1 = y2 = 0; }
  return { verts, bonds, rings, paths, texts, dots, names, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
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
function chargeMarks(b: any, c: any, out: any) {
  const hw = b.w / 2 + 1.5 * PT, hh = (b.asc + b.desc) / 2 + 1.5 * PT;
  const ux = Math.cos(rad(c.angle)), uy = -Math.sin(rad(c.angle));
  const t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity);
  const x = b.cx + ux * (t + c.off), y = b.cy + uy * (t + c.off);
  const w = c.what.replace(/\\[,;!]/g, '').trim(), rot = rad(90 + c.angle), rx = Math.cos(rot), ry = -Math.sin(rot);
  const ov = c.overlay !== false;
  if (w === '\\:') { const d = 0.15 * EM; out.dots.push({ x: x + rx * d, y: y + ry * d, r: 0.15 * EX }, { x: x - rx * d, y: y - ry * d, r: 0.15 * EX }); }
  else if (w === '\\.') out.dots.push({ x, y, r: 0.15 * EX });
  else if (w === '\\|') { const d = 0.75 * EX; out.paths.push({ d: `M${r2(x + rx * d)},${r2(y + ry * d)}L${r2(x - rx * d)},${r2(y - ry * d)}`, sw: LW, charge: ov }); }
  else if (w === '\\"') {
    const d = 0.75 * EX, e = 0.15 * EX, nx = ry, ny = -rx;
    const p = [[d, e], [-d, e], [-d, -e], [d, -e]].map(([u, v]) => `${r2(x + rx * u + nx * v)},${r2(y + ry * u + ny * v)}`);
    out.paths.push({ d: `M${p.join('L')}Z`, sw: LW, charge: ov });
  } else if (w) out.texts.push({ t: printable(w), cx: x, cy: y, b: TD.textBox(printable(w), TEXT), charge: ov });
}
function bondStyle(t: any, warn: any) {
  const r = { color: null, width: (null as any), dash: (null as any), none: false };
  for (const it of split(t || '').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=]+?)\s*(?:=\s*(.*))?$/.exec(it), k = m![1], v = m![2];
    if (k === 'draw' && v === 'none') { r.none = true; continue; }
    if (k === 'line width' && v) { r.width = len(v, LW); continue; }
    if (k === 'thick') { r.width = 0.8 * PT; continue; }
    if (k === 'very thick') { r.width = 1.2 * PT; continue; }
    if (k === 'dashed') { r.dash = 'dash'; continue; }
    if (k === 'dotted') { r.dash = 'dot'; continue; }
    if (k === 'shorten <' || k === 'shorten >') continue;
    const col = (k === 'draw' || k === 'color') && v ? v : v == null ? k : null;
    if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
    if (warn) warn(`The bond option "${it}" isn't drawn here (it is kept in the code)`);
  }
  return r;
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
  const map: Record<string, any> = { 'atom sep': 'sep', 'bond offset': 'boff', 'double bond sep': 'dsep', 'cram width': 'cram', 'compound sep': 'csep', 'arrow offset': 'aoff', 'arrow label sep': 'lsep', 'name sep': 'nameSep' };
  for (const [k, v] of Object.entries<any>(kv)) {
    if (map[k]) P[map[k]] = len(v, P[map[k]]);
    else if (k === 'angle increment') P.inc = parseFloat(v) || 45;
    else if (k === 'arrow coeff') P.acoeff = parseFloat(v) || 1;
    else if (k === 'arrow angle') P.aangle = parseFloat(v) || 0;
    else if (k === 'fixed length') P.fixed = v !== 'false';
    else if (k === 'harrow minwidth') P.hminw = len(v, P.hminw);
    else if (k === 'label xsep') P.lxsep = len(v, P.lxsep);
    else if (k === 'hreac sep') P.hsep = len(v, P.hsep);
    else warn(`The setting "${k}" isn't drawn here (it is kept in the code)`);
  }
}
// (name.anchor[style]) → { n, a, s }
function endOf(t: any) {
  t = String(t || '').trim();
  let s = '';
  const b = t.indexOf('[');
  if (b >= 0) { const e = close(t, b); s = t.slice(b + 1, e < 0 ? t.length : e).trim(); t = t.slice(0, b).trim(); }
  const d = t.indexOf('.');
  return d < 0 ? { n: t, a: '', s } : { n: t.slice(0, d).trim(), a: t.slice(d + 1).trim(), s };
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
// a compound's TikZ style: its anchor, inner sep, shift and the delimiters drawn beside it
function compoundStyle(style: any, dflt: any, P: any, warn: any) {
  const o = { anchor: dflt, sep: 0, dx: 0, dy: 0, ld: '', rd: '' };
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
      else if (/^(outer sep|minimum size|minimum width|minimum height)$/.test(k)) {}
      else warn(`The compound style "${it}" isn't drawn here (it is kept in the code)`);
    }
  };
  read(style, 0);
  return o;
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
    if (g.t === 'mol') {
      const L = layMol(g, P, warn), mx = x - L.bb.x;
      F.mols.push({ seg: g, L, x: mx, y: 0 });
      for (const [n, b] of Object.entries<any>(L.names.atoms)) G.names[n] = { F, x: b.x + mx, y: b.base - b.asc, w: b.w, h: b.asc + b.desc, base: b.base };
      for (const [n, q] of Object.entries<any>(L.names.bonds)) G.names[n] = { F, pt: [q[0] + mx, q[1]] };
      put({ kind: 'mol', seg: g, x, w: L.bb.w, asc: -L.bb.y, desc: L.bb.y + L.bb.h });
      x += L.bb.w; continue;
    }
    if (g.t === 'plus') {
      let a = P.plusL, b = P.plusR, vs = 0;
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
    if (g.t === 'move') { G.moves.push({ seg: g, snap: { ...G.names } }); continue; }
    if (g.t === 'nameinit') { G.nameDp = 0; continue; }
  }
  F.w = x; F.asc = asc; F.desc = desc;
  F.bb = { x1: 0, y1: -asc, x2: x, y2: desc };
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
  const wl = delim(g.l, F, 0, top, bot, warn, false);
  attach(F, C, wl, 0);
  const wr = delim(g.r, F, wl + C.w, top, bot, warn, true);
  F.bb = { x1: 0, y1: Math.min(-C.asc, top), x2: wl + C.w + wr, y2: Math.max(C.desc, bot) };
  return F;
}
// a delimiter drawn into F from x, between top and bot; returns its width
function delim(tok: any, F: any, x: any, top: any, bot: any, warn: any, right: any) {
  let t = String(tok || '').trim();
  t = { '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '\\{', '\\rbrace': '\\}', '\\vert': '|', '\\lvert': '|', '\\rvert': '|' }[t] || t;
  const H = bot - top, m = (top + bot) / 2, sw = 0.5 * PT;
  const W = { '[': 0.667, ']': 0.667, '(': 0.75, ')': 0.75, '\\{': 0.889, '\\}': 0.889, '|': 0.278 }[t];
  if (W == null) { if (t !== '.') warn(`The delimiter "${t}" isn't drawn here`); return 1.2 * PT; }
  const w = W * EM;
  // drawn as the left one; a right one is mirrored
  const mir = t === ']' || t === ')' || t === '\\}';
  const X = (u: any) => r2(mir ? x + w - u * EM : x + u * EM), Y = (v: any) => r2(v);
  let d;
  if (t === '[' || t === ']') d = `M${X(0.6)},${Y(top)}L${X(0.2)},${Y(top)}L${X(0.2)},${Y(bot)}L${X(0.6)},${Y(bot)}`;
  else if (t === '(' || t === ')') d = `M${X(0.6)},${Y(top)}C${X(0.12)},${Y(top + H * 0.3)} ${X(0.12)},${Y(bot - H * 0.3)} ${X(0.6)},${Y(bot)}`;
  else if (t === '|') d = `M${X(0.139)},${Y(top)}L${X(0.139)},${Y(bot)}`;
  else {
    const k = Math.min(0.08 * H, 0.3 * EM);
    d = `M${X(0.75)},${Y(top)}Q${X(0.42)},${Y(top)} ${X(0.42)},${Y(top + k)}L${X(0.42)},${Y(m - k)}Q${X(0.42)},${Y(m)} ${X(0.1)},${Y(m)}Q${X(0.42)},${Y(m)} ${X(0.42)},${Y(m + k)}L${X(0.42)},${Y(bot - k)}Q${X(0.42)},${Y(bot)} ${X(0.75)},${Y(bot)}`;
  }
  F.paths.push({ d, sw });
  return w;
}
// \charge{…}{…} around a whole box (outside \chemfig)
function layCharge(g: any, P: any, warn: any, G: any) {
  const C: any = layPieces(g.inner, P, warn, G), F = frag();
  attach(F, C, 0, 0);
  const overlay = !(g.cmd === 'Charge' || /overlay\s*=\s*false/.test(g.opt || ''));
  for (const c of g.charges) chargeMarks({ cx: C.w / 2, cy: (C.desc - C.asc) / 2, w: C.w, asc: C.asc, desc: C.desc }, { ...c, overlay }, F);
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
    const C: any = layPieces(gs, P, warn, G);
    G.nextAnchor = keep;
    const cs = compoundStyle([nextStyle, style].filter(Boolean).join(','), nextAnchor, P, warn), is = cs.sep;
    // the node: the compound with inner sep around it
    const [ax, ay] = anchorPt({ x: -is, y: -C.asc - is, w: C.w + 2 * is, h: C.asc + C.desc + 2 * is }, 0, cs.anchor);
    const [cx, cy] = ctr(cur), ox = cx - ax + cs.dx, oy = cy - ay + cs.dy;
    attach(S, C, ox, oy);
    cur = { x: ox - is, y: oy - C.asc - is, w: C.w + 2 * is, h: C.asc + C.desc + 2 * is, base: oy };
    ext(S, cur.x, cur.y, cur.x + cur.w, cur.y + cur.h);
    // left/right delimiter (TikZ's matrix library): $\left[ \vcenter{node height} \right.$ against the node's side
    if (cs.ld || cs.rd) {
      const h = cur.h, H = Math.max(0.901 * h, h - 5 * PT), m = cur.y + h / 2, top = m - H / 2, bot = m + H / 2, nul = 1.2 * PT;
      const wOf = (d: any) => delim(d, frag(), 0, top, bot, () => {}, false);
      if (cs.ld) { const w = wOf(cs.ld), x = cur.x - nul - w; delim(cs.ld, S, x, top, bot, warn, false); ext(S, x, top, cur.x, bot); }
      if (cs.rd) { const x = cur.x + cur.w + nul, w = delim(cs.rd, S, x, top, bot, warn, true); ext(S, cur.x + cur.w, top, x + w, bot); }
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
    const line = (a: any, b: any) => { S.paths.push({ d: `M${r2(a[0])},${r2(a[1])}L${r2(b[0])},${r2(b[1])}`, sw: sty.width || LW, color: sty.color }); ext(S, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); };
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
  const sty = bondStyle(style, warn);
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
  return { seg: owner || seg, prim, labs, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], ang, type: t, color: sty.color, sw: sty.width, hidden: sty.none };
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
    if (t.box) { const b = TD.textBox(t.t, TEXT), bo = baseOff(TEXT); K.texts.push({ t: t.t, cx: t.box.cx + dx, cy: t.box.base + dy - bo + b.h / 2, b }); }
    else K.texts.push({ t: t.t, cx: t.cx + dx, cy: t.cy + dy, b: t.b });
  }
  const map = new Map();
  for (const v of L.verts) { const c = { ...v, X: v.x + dx, Y: v.y + dy, mol: seg, dx, dy }; map.set(v, c); K.verts.push(c); }
  for (const b of L.bonds) K.bonds.push({ ...b, a: map.get(b.a), b: map.get(b.b), X0: b.p0[0] + dx, Y0: b.p0[1] + dy, X1: b.p1[0] + dx, Y1: b.p1[1] + dy, mol: seg });
  for (const r of L.rings) K.rings.push({ ...r, X: r.cx + dx, Y: r.cy + dy, mol: seg });
}
// \printatom{X} sets X as an atom: upright maths
const printable = (t: any) => String(t).replace(/\\printatom\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m, a) => `$\\mathrm{${a}}$`);
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
function chemMove(seg: any, names: any, warn: any, out: any) {
  const body = seg.body.replace(/%[^\n]*/g, '');
  const re = /\\(draw|path)\s*(\[[^\]]*\])?([^;]*);/g;
  let m, any = false, k = -1;
  const rest = body.replace(re, '').trim();
  if (rest) warn(`In \\chemmove, "${rest.slice(0, 40)}" isn't drawn here (it is kept in the code)`);
  while ((m = re.exec(body))) {
    any = true; k++;
    if (m[1] === 'path') continue;
    const opts = [seg.opt, m[2] ? m[2].slice(1, -1) : ''].join(',').split(',').map((o) => o.trim()).filter(Boolean);
    const st = { tipS: false, tipE: true, sh1: 0, sh2: 0, dash: (null as any), sw: LW, color: null };
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
      else if (/^(?:->|overlay|remember picture)$/.test(o)) {}
      else warn(`The \\chemmove option "${o}" isn't drawn here (it is kept in the code)`);
    }
    const segs = readPath(m[3], names, warn);
    // seg and k (the k-th \draw or \path in its body): what the editor rewrites
    if (segs) out.push({ ...st, segs, seg, k });
  }
  if (!any && body.trim()) warn('\\chemmove has no \\draw to show here (it is kept in the code)');
}
function readPath(p: any, names: any, warn: any) {
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
      for (const o of t.slice(1, e).split(',').map((x: any) => x.trim()).filter(Boolean)) {
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
  let last = null;
  const take = (c: any, base: any) => (c.v ? { pt: [base[0] + c.v[0], base[1] + c.v[1]] } : c);
  ws();
  const c0 = coord();
  if (!c0 || c0.rel) return null;
  pts.push(take(c0, [0, 0])); last = pts[0].pt;
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
      i += 2; const c = coord(); if (!c) return null;
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
      const cb = b ? (b.v ? [end.pt[0] + b.v[0], end.pt[1] + b.v[1]] : b.pt) : ca;
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
  return { pts: P2, ops };
}
function border(box: any, ang: any) {
  // the point where a ray from the box's centre at ang leaves it
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
  const t = Math.min(Math.abs(ux) > 1e-9 ? box.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? box.h / 2 / Math.abs(uy) : Infinity);
  return [cx + ux * t, cy + uy * t];
}

// the whole thing: lines of compounds, schemes and text, or an \hreac row
function build(src: any, segsIn?: any) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const segs = segsIn || parseDoc(src, warn);
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
  for (const g of segs) {
    if (g.t !== 'set') continue;
    if (!g.tikz) { applyKV(P, g.kv, warn); continue; }
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
    for (const g of segs.slice(0, hi).concat(ho >= 0 ? segs.slice(ho + 1) : [])) if (g.t === 'text' ? g.raw.replace(/%.*$/gm, '').trim() : !['set', 'submol', 'move'].includes(g.t)) warn('Only \\hreac … \\endhreac is drawn: what is outside it is kept in the code');
    // the spaces TeX sets before the row: one per line break after a \definesubmol, \setchemfig…
    let lead = 0;
    for (let k = 1; k < hi; k++) if (segs[k].t === 'text' && /\s/.test(segs[k].raw.replace(/%[^\n]*(\n[ \t]*)?/g, ''))) lead += 3.333 * PT;
    attach(root, layHreac(segs.slice(hi + 1, ho < 0 ? segs.length : ho), lead, P, warn, G), 0, 0);
    for (const g of segs.slice(0, hi).concat(ho >= 0 ? segs.slice(ho + 1) : [])) if (g.t === 'move') G.moves.push({ seg: g, snap: { ...G.names } });
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
    let y = 0, prev: any = null;
    lines.forEach((line, j) => {
      const F: any = layPieces(line, P, warn, G, j === 0);
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
  for (const { seg, snap } of G.moves) {
    const names = { atoms: {}, bonds: {} };
    for (const [n, e] of Object.entries<any>(snap)) { const b = relBox(e, null); if (e.pt) (names.bonds as Record<string, any>)[n] = [b.x, b.y]; else (names.atoms as Record<string, any>)[n] = b; }
    chemMove(seg, names, warn, moves);
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

// ---------------------------------------------------------------- drawing
// an arrow tip as chemfig's CF arrow: 5pt long, 4pt wide, inset 2.5pt; a harpoon keeps the left half
function tip(q1: any, q2: any, harpoon: any, ink?: any) {
  const L = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1, ux = (q2[0] - q1[0]) / L, uy = (q2[1] - q1[1]) / L, nx = uy, ny = -ux;
  const len = 5 * PT, half = 2 * PT, inset = 2.5 * PT;
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
  pull(true, mv.sh2); pull(false, mv.sh1);
  const col = mv.color ? TD.css(mv.color) : ink;
  let tips = '';
  for (const end of [true, false]) {
    if (!(end ? mv.tipE : mv.tipS)) continue;
    const t = pull(end, 2.5 * PT);
    if (!t) continue;
    const e = tip([t.tipAt[0] - t.ux * 10, t.tipAt[1] - t.uy * 10], t.tipAt, false);
    tips += `<path d="${e.d}" fill="${col}" stroke="${col}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
  }
  let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  ops.forEach((o: any, k: any) => { const q = pts[k + 1]; d += o.k === 'curve' ? `C${r2(o.c1[0])},${r2(o.c1[1])} ${r2(o.c2[0])},${r2(o.c2[1])} ${r2(q[0])},${r2(q[1])}` : `L${r2(q[0])},${r2(q[1])}`; });
  const dash = dashAttr(mv.dash);
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(mv.sw)}"${dash}/>${tips}`;
}
// dashed, dotted, or dash pattern=on a off b… (an array of lengths)
const dashAttr = (d: any) => (Array.isArray(d) ? ` stroke-dasharray="${d.map(r2).join(' ')}"` : d === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : d === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT)}" stroke-linecap="round"` : '');
// what a frag emitted: paths, dots, arrows with their labels, texts
function drawSink(Lo: any, ink: any, color: any, ctx: any) {
  let out = '';
  const T = (p: any) => (p.dx || p.dy ? ` transform="translate(${r2(p.dx)},${r2(p.dy)})"` : '');
  for (const p of Lo.paths) {
    const col = p.color ? TD.css(p.color) : ink;
    if (p.fill) out += `<path d="${p.d}"${T(p)} fill="${col}" stroke="${p.sw ? col : 'none'}"${p.sw ? ` stroke-width="${r2(p.sw)}" stroke-linejoin="round"` : ''}/>`;
    else out += `<path d="${p.d}"${T(p)} fill="none" stroke="${col}" stroke-width="${r2(p.sw)}" stroke-linejoin="${p.join || 'round'}"${dashAttr(p.dash)}/>`;
  }
  for (const d of Lo.dots) out += `<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.r)}" fill="${ink}"/>`;
  for (const a of Lo.arrows) {
    const col = a.color ? TD.css(a.color) : ink, sw = r2(a.sw || LW);
    if (!a.hidden) for (const p of a.prim) {
      if (p.pts) {
        // an arc (-U>), its tip along the last piece
        const n = p.pts.length - 1, e = p.head ? tip(p.pts[n - 1], p.pts[n], false) : null;
        const pts = e ? [...p.pts.slice(0, n), e.shaft[1]] : p.pts;
        out += `<path d="M${pts.map((q: any) => `${r2(q[0])},${r2(q[1])}`).join('L')}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        if (e) out += `<path d="${e.d}" fill="${col}" stroke="${col}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
        continue;
      }
      if (!p.head) { out += `<path d="M${r2(p.q1[0])},${r2(p.q1[1])}L${r2(p.q2[0])},${r2(p.q2[1])}" fill="none" stroke="${col}" stroke-width="${sw}"/>`; continue; }
      const e = tip(p.q1, p.q2, p.harpoon);
      let a1 = p.q1, d2 = '';
      if (p.head === 'both') { const e2 = tip(p.q2, p.q1, p.harpoon); a1 = e2.shaft[1]; d2 = e2.d; }
      out += `<path d="M${r2(a1[0])},${r2(a1[1])}L${r2(e.shaft[1][0])},${r2(e.shaft[1][1])}" fill="none" stroke="${col}" stroke-width="${sw}"/><path d="${e.d}${d2}" fill="${col}" stroke="${col}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
    }
    for (const l of a.labs) {
      if (l.g) { out += `<g transform="translate(${r2(l.bx)},${r2(l.by)})${Math.abs(l.rot) > 1e-6 ? ` rotate(${r2(-l.rot)})` : ''}${l.s !== 1 ? ` scale(${r2(l.s)})` : ''} translate(${r2(-l.fc[0])},${r2(-l.fc[1])})">${drawSink(l.g, ink, color, ctx)}</g>`; continue; }
      const t = TD.textSvg(l.t, TEXT, color, l.cx, l.cy, ctx);
      out += Math.abs(l.rot) > 1e-6 ? `<g transform="rotate(${r2(-l.rot)} ${r2(l.cx)} ${r2(l.cy)})">${t}</g>` : t;
    }
  }
  for (const t of Lo.texts) out += TD.textSvg(t.t, t.st || TEXT, color, t.cx, t.cy, ctx);
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
    const src = String(s.src || '').trim();
    // paragraphs (\par, a blank line) need a node with a text width
    if (/\\par(?![A-Za-z])|\n[ \t]*\n/.test(src.replace(/%[^\n]*/g, ''))) o.push(`text width=${r2(layout(s).bb.w / PX + 0.05)}cm`, 'align=left');
    return `\\node[${o.join(', ')}] at ${X.c(s.x, s.y)} {${src.includes('\n') ? `%\n${src}%\n` : src}};`;
  },
};


// for the visual editor (js/cfeditor.ts)
TD.chem = { build, parseDoc, writeDoc, parseChain, writeChain, splitAtoms, layout, draw, angleOf, norm360, split, unbrace, labelLines, stackLines, close, markDirty, counts, TEXT, DEF, PT, EM };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("chemfig", {
  menu: { order: 12, label: "Chemistry", title: "Chemistry: structural formulas and reaction schemes, written for chemfig", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M9 4.5l6 3.5v7l-6 3.5-6-3.5V8z\"/><path d=\"M11 7.4l2.4 1.4M5 9.5v4.2\"/><path d=\"M15 15l5 3\"/><path d=\"M21 12h8M26 9.5l3 2.5-3 2.5\"/></svg>" },
  nodeImport: { re: /\\chemfig[\s\S]*/, order: 9, place: (q: any, at: any) => { q.x = at.x; q.y = at.y; }, opts: ['anchor', 'inner sep', 'text'] },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.chemEditor, alias: "chemOpen", layout: (s) => TD.chem.layout(s) }
});
export { layout, counts };
