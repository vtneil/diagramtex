// What LaTeX packages draw in maths that neither engine (KaTeX, Temml) reads, rewritten into what they do: siunitx's
// numbers and units (\SI, \si, \qty, \num, \ang …), physics' \qty(…) delimiters, array columns beyond l c r
// (@{…}, p{…}, *{n}{…}), an array's [t] position, and mathtools' multlined. Preview only: the exported LaTeX keeps
// what was typed, with the packages (TD.lint.mathNeeds). A command the file's own macros define is left as it is.
// No DOM.
import { skipSpace } from '../core/tex-scan';

/** Whether the file's macros define \name (then it is theirs, not the package's). */
export type Defined = (name: string) => boolean;

/** A {group} at i (after spaces): its content and the index past it. */
function group(t: string, i: number): { v: string; end: number } | null {
  i = skipSpace(t, i);
  if (t[i] !== '{') return null;
  for (let k = i, d = 0; k < t.length; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return { v: t.slice(i + 1, k), end: k + 1 };
  }
  return null;
}
/** An [option] at i (after spaces), braces inside skipped. */
function option(t: string, i: number): { v: string; end: number } | null {
  i = skipSpace(t, i);
  if (t[i] !== '[') return null;
  for (let k = i + 1; k < t.length; k++) {
    if (t[k] === '\\') { k++; continue; }
    if (t[k] === '{') { const g = group(t, k); if (!g) return null; k = g.end - 1; continue; }
    if (t[k] === ']') return { v: t.slice(i + 1, k), end: k + 1 };
  }
  return null;
}
/** key=value options, as siunitx reads them */
const options = (o: string | undefined) => Object.fromEntries((o || '').split(',').map((kv) => kv.split('=').map((s) => s.trim())).filter((kv) => kv[0]));

// ---------- siunitx ----------
const PREFIXES: Record<string, string> = {
  quecto: 'q', ronto: 'r', yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n', micro: '\\mu', milli: 'm',
  centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k', mega: 'M', giga: 'G', tera: 'T', peta: 'P',
  exa: 'E', zetta: 'Z', yotta: 'Y', ronna: 'R', quetta: 'Q', kibi: 'Ki', mebi: 'Mi', gibi: 'Gi', tebi: 'Ti',
};
const UNITS: Record<string, string> = {
  ampere: 'A', candela: 'cd', kelvin: 'K', kilogram: 'kg', gram: 'g', metre: 'm', meter: 'm', mole: 'mol', second: 's',
  becquerel: 'Bq', coulomb: 'C', farad: 'F', gray: 'Gy', hertz: 'Hz', henry: 'H', joule: 'J', lumen: 'lm', katal: 'kat',
  lux: 'lx', newton: 'N', pascal: 'Pa', radian: 'rad', siemens: 'S', sievert: 'Sv', steradian: 'sr', tesla: 'T',
  volt: 'V', watt: 'W', weber: 'Wb', astronomicalunit: 'au', bel: 'B', dalton: 'Da', day: 'd', decibel: 'dB',
  electronvolt: 'eV', hectare: 'ha', hour: 'h', litre: 'L', liter: 'L', minute: 'min', neper: 'Np', tonne: 't',
  barn: 'b', bar: 'bar', mmHg: 'mmHg', knot: 'kn', nauticalmile: 'M', atomicmassunit: 'u', byte: 'B', bit: 'bit',
  micron: '\\mu m', gal: 'Gal', erg: 'erg', calorie: 'cal', rpm: 'rpm', pixel: 'px', psi: 'psi',
};
/** units written as they are (not upright letters), and whether they sit against the number with no space */
const SYMBOLS: Record<string, [string, boolean?]> = {
  ohm: ['\\Omega'], percent: ['\\%'], degreeCelsius: ['{}^{\\circ}\\mathrm{C}'], celsius: ['{}^{\\circ}\\mathrm{C}'],
  Celsius: ['{}^{\\circ}\\mathrm{C}'], degree: ['{}^{\\circ}', true], arcminute: ["{}'", true], arcsecond: ["{}''", true],
  angstrom: ['\\text{\\AA}'], bohr: ['a_{0}'], clight: ['c_{0}'], electronmass: ['m_{\\mathrm{e}}'],
  elementarycharge: ['e'], hartree: ['E_{\\mathrm{h}}'], planckbar: ['\\hbar'],
};
interface Atom { tex: string; pow: number; tight?: boolean; of?: string }
const upright = (s: string) => (s.startsWith('\\') ? s.replace(/^(\\mu)(.*)$/, (_, mu, rest) => mu + (rest.trim() ? `\\mathrm{${rest.trim()}}` : '')) : `\\mathrm{${s}}`);
/** A unit as siunitx draws it: \kilo\metre\per\second\squared → km s⁻² (per-mode=power), or as written (m/s). */
export function unitTex(u: string, opts: Record<string, string> = {}): string {
  u = u.trim();
  if (!u) return '';
  // a literal unit (m/s, kg.m^2, m~s^{-1}): upright, with a thin space for each product
  if (!/\\[A-Za-z]/.test(u.replace(/\\(?:mu|Omega|%|,)/g, ''))) return `\\mathrm{${u.replace(/\s*[.~]\s*|\s+/g, '\\,')}}`;
  const atoms: Atom[] = [];
  let prefix = '', next = 1, per = false;
  const add = (tex: string, tight?: boolean) => { atoms.push({ tex: prefix ? upright(prefix) + tex : tex, pow: next * (per ? -1 : 1), tight }); prefix = ''; next = 1; per = false; };
  const last = () => atoms[atoms.length - 1];
  for (let i = 0; i < u.length;) {
    const c = u[i];
    if (/\s|[.~]/.test(c)) { i++; continue; }
    const m = /^\\([A-Za-z]+)\*?/.exec(u.slice(i));
    if (!m) {
      // a literal piece among the commands (\kilo m): letters as a unit, ^/_ on the last one
      const lit = /^[A-Za-z]+/.exec(u.slice(i));
      if (lit) { add(upright(lit[0])); i += lit[0].length; continue; }
      if ((c === '^' || c === '_') && last()) {
        const g = group(u, i + 1), v = g ? g.v : u[i + 1] || '';
        if (c === '^') last().pow *= Number(v) || 1; else last().of = v;
        i = g ? g.end : i + 2; continue;
      }
      i++; continue;
    }
    const name = m[1];
    i += m[0].length;
    if (name === 'per') { per = true; continue; }
    if (name === 'square') { next = 2; continue; }
    if (name === 'cubic') { next = 3; continue; }
    if (name === 'raiseto') { const g = group(u, i); if (g) { next = Number(g.v) || 1; i = g.end; } continue; }
    if (name === 'squared' || name === 'cubed' || name === 'tothe') {
      let p = name === 'squared' ? 2 : 3;
      if (name === 'tothe') { const g = group(u, i); if (g) { p = Number(g.v) || 1; i = g.end; } }
      if (last()) last().pow = Math.sign(last().pow) * p;
      continue;
    }
    if (name === 'of') { const g = group(u, i); if (g) { if (last()) last().of = g.v; i = g.end; } continue; }
    if (name === 'highlight') { const g = group(u, i); if (g) i = g.end; continue; }
    if (name === 'cancel') continue;
    if (PREFIXES[name] !== undefined) { prefix += PREFIXES[name]; continue; }
    if (UNITS[name] !== undefined) { add(upright(UNITS[name])); continue; }
    if (SYMBOLS[name]) { add(SYMBOLS[name][0], SYMBOLS[name][1]); continue; }
    // a unit of the document's own (\DeclareSIUnit\rpm{rpm}): its name, upright
    add(upright(name));
  }
  // a unit that is a superscript already ({}^{\\circ}) is a group under its power, or TeX's double superscript
  const power = (a: Atom, p = a.pow) => (p !== 1 && a.tex.includes('^') ? `{${a.tex}}` : a.tex) + (a.of ? `_{\\mathrm{${a.of}}}` : '') + (p !== 1 ? `^{${p}}` : '');
  const mode = opts['per-mode'];
  const pos = atoms.filter((a) => a.pow > 0), neg = atoms.filter((a) => a.pow < 0);
  if ((mode === 'symbol' || mode === 'fraction' || mode === 'symbol-or-fraction') && neg.length) {
    const top = pos.map((a) => power(a)).join('\\,') || '1', bottom = neg.map((a) => power(a, -a.pow)).join('\\,');
    const frac = `\\frac{${top}}{${bottom}}`, symbol = `${top}/${neg.length > 1 ? `(${bottom})` : bottom}`;
    // symbol-or-fraction: a fraction in display style, the symbol in the others
    return mode === 'fraction' ? frac : mode === 'symbol' ? symbol : `\\mathchoice{${frac}}{${symbol}}{${symbol}}{${symbol}}`;
  }
  const out = atoms.map((a) => power(a)).join('\\,');
  return atoms.length === 1 && atoms[0].tight ? '\u0000' + out : out;
}
const groupDigits = (d: string, fromLeft: boolean) => {
  if (d.length < 5 || !/^\d+$/.test(d)) return d;
  const parts = [];
  if (fromLeft) for (let i = 0; i < d.length; i += 3) parts.push(d.slice(i, i + 3));
  else for (let i = d.length; i > 0; i -= 3) parts.unshift(d.slice(Math.max(0, i - 3), i));
  return parts.join('\\,');
};
/** One number as siunitx prints it: 1.5e3 → 1.5×10³, 12345 → 12 345, +- → ±, a comma as the decimal marker. */
function numberOne(n: string): string {
  let s = n.replace(/\s+/g, '');
  if (!s) return '';
  if (/[^-+0-9.,eEdDxX*()]|\\(?!pm|mp|times|cdot)/.test(s.replace(/\\(?:pm|mp|times|cdot)/g, ''))) return n.trim(); // not a number: as written
  s = s.replace(/\\pm|\+-/g, '\u0001').replace(/\\times|\\cdot|[xX*]/g, '\u0002');
  const term = (t: string) => {
    const m = /^([-+]?)(\d*)(?:[.,](\d*))?(\(\d+\))?(?:[eEdD]([-+]?\d+))?$/.exec(t);
    if (!m) return t;
    const [, sign, int, dec, unc, exp] = m;
    let body = '';
    if (int || dec !== undefined) body = groupDigits(int || '0', false) + (dec !== undefined && dec !== '' ? '.' + groupDigits(dec, true) : '') + (unc || '');
    const sgn = sign === '-' ? '-' : sign === '+' ? '+' : '';
    if (exp !== undefined) return sgn + (body ? body + '\\times ' : '') + `10^{${String(Number(exp))}}`;
    return sgn + body;
  };
  return s.split('\u0002').map((p) => p.split('\u0001').map(term).join(' \\pm ')).join(' \\times ');
}
const numberTex = (n: string) => numberOne(n);
const quantity = (n: string, u: string, o: Record<string, string>) => {
  const num = numberTex(n), unit = unitTex(u, o);
  if (!unit) return num;
  if (unit.startsWith('\u0000')) return num + unit.slice(1);
  return num ? `${num}\\,${unit}` : unit;
};
/** a unit without the mark of one that sits against its number (°, ′, ″) */
const bare = (u: string) => u.replace('\u0000', '');
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(',\\ ') + '\\text{ and }' + xs[xs.length - 1]);

// ---------- physics ----------
const CLOSE: Record<string, string> = { '(': ')', '[': ']', '|': '|' };
const LEFT: Record<string, string> = { '(': '(', '[': '[', '|': '|', '{': '\\{' };
const RIGHT: Record<string, string> = { '(': ')', '[': ']', '|': '|', '{': '\\}' };
/** The index of the delimiter closing the one at i ((…), […], |…|), braces skipped, or -1. */
function closeAt(t: string, i: number): number {
  const open = t[i], close = CLOSE[open];
  for (let k = i + 1, d = 0; k < t.length; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') { const g = group(t, k); if (!g) return -1; k = g.end - 1; continue; }
    if (c === close && d === 0) return k;
    if (open !== close) { if (c === open) d++; else if (c === close) d--; }
  }
  return -1;
}

/** physics' bra-ket commands with their stars and optional last argument (physics.sty, xparse s s m g …), as physics sets them. */
const EXPECTATION = /^(?:ev|expval|expectationvalue)$/, OUTER = /^(?:ketbra|dyad|op|outerproduct)$/, ELEMENT = /^(?:mel|matrixel|matrixelement)$/;
function braket(name: string, t: string, at: number, again: (s: string) => string): { v: string; end: number } | null {
  let i = at, stars = 0;
  const maxStars = OUTER.test(name) || name === 'vev' ? (name === 'vev' ? 0 : 1) : 2;
  for (let k = skipSpace(t, i); stars < maxStars && t[k] === '*'; k = skipSpace(t, i)) { stars++; i = k + 1; }
  const need = ELEMENT.test(name) ? 3 : 1, args: string[] = [];
  for (let k = 0; k < need; k++) { const g = group(t, i); if (!g) return null; args.push(again(g.v)); i = g.end; }
  // g: a braced argument when one follows
  const g = need === 1 && name !== 'vev' ? group(t, i) : null;
  if (g) { args.push(again(g.v)); i = g.end; }
  const [a, b, c] = args, done = (v: string) => ({ v, end: i });
  if (name === 'vev') return done(`\\vphantom{${a}}\\left\\langle{0}\\middle\\vert\\smash{${a}}\\middle\\vert{0}\\right\\rangle`);
  if (EXPECTATION.test(name)) {
    if (b === undefined) return done(stars ? `\\vphantom{${a}}\\left\\langle\\smash{${a}}\\right\\rangle` : `\\left\\langle{${a}}\\right\\rangle`);
    if (stars === 2) return done(`\\left\\langle{${b}}\\middle\\vert{${a}}\\middle\\vert{${b}}\\right\\rangle`);
    if (stars === 1) return done(`\\vphantom{${a}${b}}\\left\\langle\\smash{${b}}\\middle\\vert\\smash{${a}}\\middle\\vert\\smash{${b}}\\right\\rangle`);
    return done(`\\vphantom{${a}}\\left\\langle{${b}}\\middle\\vert\\smash{${a}}\\middle\\vert{${b}}\\right\\rangle`);
  }
  if (OUTER.test(name)) {
    const k = b ?? a;
    return done(stars ? `\\vphantom{${a}${b ?? ''}}\\left\\lvert\\smash{${a}}\\middle\\rangle\\!\\middle\\langle\\smash{${k}}\\right\\rvert`
      : `\\left\\lvert{${a}}\\middle\\rangle\\!\\middle\\langle{${k}}\\right\\rvert`);
  }
  if (stars === 2) return done(`\\left\\langle{${a}}\\middle\\vert{${b}}\\middle\\vert{${c}}\\right\\rangle`);
  if (stars === 1) return done(`\\vphantom{${a}${b}${c}}\\left\\langle\\smash{${a}}\\middle\\vert\\smash{${b}}\\middle\\vert\\smash{${c}}\\right\\rangle`);
  return done(`\\vphantom{${b}}\\left\\langle{${a}}\\middle\\vert\\smash{${b}}\\middle\\vert{${c}}\\right\\rangle`);
}

// ---------- delimiters ----------
// stmaryrd declares \llbracket and \rrbracket with only their small glyph (\DeclareMathDelimiter, no larger variant):
// \left\llbracket … \right\rrbracket keeps them that size round an inner atom; \left. and \right. are the null
// delimiter, \nulldelimiterspace (1.2pt) wide
const BRACKETS: Record<string, string> = { '\\llbracket': '\\mathopen{\\llbracket}', '\\lBrack': '\\mathopen{\\llbracket}', '\\rrbracket': '\\mathclose{\\rrbracket}', '\\rBrack': '\\mathclose{\\rrbracket}', '.': '\\kern1.2pt ' };
/** After `\left` at i (its delimiter at `d`): the \right that closes it, its delimiter and where it ends, or null. */
function rightOf(t: string, i: number): { at: number; delim: string; end: number } | null {
  let depth = 0;
  for (let k = i; k < t.length; k++) {
    if (t[k] !== '\\') continue;
    const m = /^\\(left|right|middle)(?![A-Za-z])/.exec(t.slice(k, k + 8));
    if (!m) { k++; continue; }
    if (m[1] === 'middle') { if (!depth) return null; k += m[0].length - 1; continue; }
    if (m[1] === 'left') { depth++; k += 4; continue; }
    if (depth) { depth--; k += 5; continue; }
    const j = skipSpace(t, k + 6), d = /^(?:\\[A-Za-z]+|\\.|.)/.exec(t.slice(j))?.[0] || '';
    return { at: k, delim: d, end: j + d.length };
  }
  return null;
}

// ---------- mleftright ----------
// \mleft = \mathopen{}\mathclose\bgroup\left and \mright = \aftergroup\egroup\right (mleftright.sty): the pair is a
// closing atom after an empty opening one, so it is spaced as an ordinary (f\mleft(x\mright) has no space before it)
/** After `\mleft` at i: the \mright that closes it (other \mleft … \mright pairs inside counted), its delimiter and end. */
function mrightOf(t: string, i: number): { at: number; delim: string; end: number } | null {
  let depth = 0;
  for (let k = i; k < t.length; k++) {
    if (t[k] !== '\\') continue;
    const m = /^\\(mleft|mright)(?![A-Za-z@])/.exec(t.slice(k, k + 8));
    if (!m) { k++; continue; }
    if (m[1] === 'mleft') { depth++; k += 5; continue; }
    if (depth) { depth--; k += 6; continue; }
    const j = skipSpace(t, k + 7), d = /^(?:\\[A-Za-z]+|\\.|.)/.exec(t.slice(j))?.[0] || '';
    return { at: k, delim: d, end: j + d.length };
  }
  return null;
}
/** A document whose \left and \right are mleftright's (doc-macros.ts: mleftright): every pair as \mleft … \mright. */
export const asMleftright = (tex: string) => tex.replace(/\\(left|right)(?![A-Za-z@])/g, '\\m$1');

// ---------- multlined ----------
const MULTLINE = /^(?:multlined|multline\*?)$/;
/** The end of the environment whose body starts at i (\begin and \end of the same name counted), or null. */
function envEnd(t: string, i: number, name: string): { at: number; end: number } | null {
  const re = /\\(begin|end)\s*\{([^{}]*)\}/g;
  re.lastIndex = i;
  for (let depth = 0, m; (m = re.exec(t));) {
    if (m[2] !== name) continue;
    if (m[1] === 'begin') depth++;
    else if (depth) depth--;
    else return { at: m.index, end: m.index + m[0].length };
  }
  return null;
}
/** A body's rows at its top level (outside braces and inner environments), each with the \\[…] after it. */
function rows(t: string): { row: string; cr: string }[] {
  const out: { row: string; cr: string }[] = [];
  let from = 0, depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c !== '\\') continue;
    const env = /^\\(begin|end)\s*\{[^{}]*\}/.exec(t.slice(i, i + 60));
    if (env) { depth += env[1] === 'begin' ? 1 : -1; i += env[0].length - 1; continue; }
    if (t[i + 1] !== '\\') { i++; continue; }
    if (depth) { i++; continue; }
    let j = i + 2; if (t[j] === '*') j++;
    const o = t[skipSpace(t, j)] === '[' ? option(t, j) : null;
    if (o) j = o.end;
    out.push({ row: t.slice(from, i), cr: t.slice(i, j) });
    from = j; i = j - 1;
  }
  out.push({ row: t.slice(from), cr: '' });
  if (out.length > 1 && !out[out.length - 1].row.trim()) { out.pop(); out[out.length - 1].cr = ''; } // a \\ after the last line
  return out;
}
// \linewidth (\textwidth, \columnwidth) is 345pt in an article at 10pt (the standalone references' class)
function widthPt(w: string): string | null {
  const m = /^\s*([-+]?[\d.]*)\s*\\(?:linewidth|textwidth|columnwidth|displaywidth)\s*$/.exec(w);
  if (m) { const f = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]); return isFinite(f) ? `${+(f * 345).toFixed(3)}pt` : null; }
  return /^\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*(?:pt|mm|cm|in|em|ex|bp|pc|dd|cc|sp)\s*$/.test(w) ? w.replace(/\s+/g, '') : null;
}
/**
 * mathtools' multlined: the first line flush left, the last flush right, those between centred, in a box as wide as
 * the widest line, the first and the last with \multlinegap (10pt) more, or as the width asked for if wider
 * (mathtools.sty \MT_multlined_second_arg:w; each line is $\displaystyle{}line$). Written as a gathered whose lines
 * stand in a phantom of that width; \shoveleft[d] and \shoveright[d] put a middle line at an edge, d in from it.
 */
function multlined(body: string, opts: string[], again: (s: string) => string, own = true): string {
  const width = opts.map((o) => o.trim()).filter((o) => !/^[tcb]?$/.test(o)).map(widthPt).find((w) => w) || '';
  // [t] sets the first line on the baseline (\vtop), [b] the last (\vbox): gathered's own option, which also carries
  // the mark that spaces the first two lines as mathtools does (scripts/patch-katex.js)
  const pos = opts.map((o) => o.trim()).find((o) => /^[tb]$/.test(o)) || '', mark = pos + (own ? '\\tdmultlined' : '');
  const begin = `\\begin{gathered}${mark ? `[${mark}]` : ''}`;
  // (a line ending in a control space, \ and a newline, keeps a space)
  const lines = rows(body).map(({ row, cr }) => ({ row: again(row.trim().replace(/(^|[^\\])((?:\\\\)*\\)$/, '$1$2 ')), cr }));
  if (lines.length < 2) return `${begin}{}${lines[0]?.row ?? ''}\\end{gathered}`;
  const shove = (row: string) => {
    const m = /^\\shove(left|right)(?![A-Za-z])/.exec(row);
    if (!m) return null;
    const o = option(row, m[0].length), g = group(row, o ? o.end : m[0].length);
    return g && !row.slice(g.end).trim() ? { side: m[1], gap: o ? widthPt(o.v) || '0pt' : '0pt', v: g.v } : null;
  };
  const n = lines.length, last = n - 1;
  const phantom = `\\hphantom{\\begin{gathered}${lines.map(({ row }, k) => {
    const s = shove(row), v = s ? `{}${s.v}` : `{}${row}`;
    return k === 0 ? `${v}\\kern10pt` : k === last ? `\\kern10pt${v}` : v;
  }).join('\\\\')}${width ? `\\\\\\hspace{${width}}` : ''}\\end{gathered}}`;
  return `${begin}${lines.map(({ row, cr }, k) => {
    const s = k > 0 && k < last ? shove(row) : null;
    const line = k === 0 ? `\\mathrlap{{}${row}}${phantom}` : k === last ? `${phantom}\\mathllap{{}${row}}`
      : s ? (s.side === 'left' ? `\\mathrlap{\\kern${s.gap}{}${s.v}}${phantom}` : `${phantom}\\mathllap{{}${s.v}\\kern${s.gap}}`) : `{}${row}`;
    return line + cr;
  }).join('')}\\end{gathered}`;
}

// ---------- arrays ----------
// (amsmath's cases only: mathtools' dcases and rcases put the \quad before the second column)
const CASES = /^cases$/;
/** Whether a row has a & of its own (outside braces and inner environments). */
function topLevelCell(row: string): boolean {
  for (let i = 0, depth = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '\\') { const e = /^\\(begin|end)\s*\{[^{}]*\}/.exec(row.slice(i, i + 60)); if (e) { depth += e[1] === 'begin' ? 1 : -1; i += e[0].length - 1; } else i++; continue; }
    if (c === '{') depth++; else if (c === '}') depth--; else if (c === '&' && !depth) return true;
  }
  return false;
}
/** An array's columns with only what the engines read (l c r | :): p{…}, m{…}, X as l; @{…}, >{…} … dropped. */
export function arrayColumns(spec: string, depth = 0): string {
  let out = '';
  for (let i = 0; i < spec.length;) {
    const c = spec[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('lcr|:'.includes(c)) { out += c; i++; continue; }
    if ('@!<>'.includes(c)) { const g = group(spec, i + 1); i = g ? g.end : i + 1; continue; }
    if ('pmb'.includes(c)) { const g = group(spec, i + 1); out += 'l'; i = g ? g.end : i + 1; continue; }
    if ('wW'.includes(c)) { const a = group(spec, i + 1), b = a && group(spec, a.end); out += 'l'; i = b ? b.end : a ? a.end : i + 1; continue; }
    if (c === '*') {
      const n = group(spec, i + 1), s = n && group(spec, n.end);
      if (!n || !s) { i++; continue; }
      const inner = depth < 4 ? arrayColumns(s.v, depth + 1) : '';
      out += inner.repeat(Math.max(0, Math.min(50, parseInt(n.v, 10) || 0)));
      i = s.end; continue;
    }
    if ('XSsLCRJ'.includes(c)) { out += c === 'S' || c === 's' || c === 'C' ? 'c' : c === 'R' ? 'r' : 'l'; i++; continue; }
    i++; // anything else (a column type of the document's own) is left out
  }
  return out;
}

// A column is \hskip\arraycolsep, the cell (\hfil-aligned, with array.sty's >{…} before and <{…} after it), then
// \hskip\arraycolsep (5pt); @{x} puts x in place of the two paddings it stands between. The engines keep every
// padding, so each @{x} takes \kern-5pt from both sides it stands between, and puts x there (below).
type Column = { align: string; pre: string; post: string; left: string[]; right: string[] };
// the opposite of an @{…}'s spacing (\quad is \hskip1em, \, is \mskip\thinmuskip …), or null
const OPPOSITE: Record<string, string> = { quad: '\\hskip-1em', qquad: '\\hskip-2em', enspace: '\\hskip-.5em', thinspace: '\\mkern-3mu', ',': '\\mkern-3mu',
  ';': '\\mkern-5mu', ':': '\\mkern-4mu', '>': '\\mkern-4mu', '!': '\\mkern3mu' };
function negated(x: string): string | null {
  let out = '';
  const re = /\s+|\\(quad|qquad|enspace|thinspace|,|;|:|>|!)(?![A-Za-z])|\\(hspace\*?|hskip|kern|mkern|mskip)\s*(?:\{\s*([^{}]*?)\s*\}|(-?[\d.]+\s*[a-z]{2}))/y;
  for (let m; re.lastIndex < x.length;) {
    const at = re.lastIndex;
    if (!(m = re.exec(x)) || m.index !== at) return null;
    if (m[1]) out += OPPOSITE[m[1]] + ' ';
    else if (m[2]) { const d = (m[3] ?? m[4]).replace(/\s+/g, ''); out += `\\${m[2].replace('*', '')}{${d.startsWith('-') ? d.slice(1) : '-' + d}} `; }
  }
  return out;
}
function arrayCells(spec: string, body: string, again: (s: string) => string): string | null {
  if (!/[@<>]/.test(spec) || /\\multicolumn/.test(body)) return null;
  // @{x} is set as a formula of its own between the cells: only spacing (\quad, \hspace{…} …) is the same inside a cell
  const spacing = (x: string) => /^(?:\s|\\(?:quad|qquad|enspace|thinspace|,|;|:|!| )|\\(?:hspace\*?|hskip|kern|mkern|mskip)\s*\{[^{}]*\}|\\(?:kern|hskip|mkern|mskip)\s*-?[\d.]+\s*[a-z]{2}|~)*$/.test(x);
  const flat = (sp: string, depth = 0): string => sp.replace(/\*\s*\{([^{}]*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, n, s) => depth < 4 ? flat(s, depth + 1).repeat(Math.max(0, Math.min(50, parseInt(n, 10) || 0))) : '');
  const sp = flat(spec), cols: Column[] = [], at: string[] = [];
  let pre = '', ats: string[] = []; // the @{…} before the next column
  for (let i = 0; i < sp.length;) {
    const c = sp[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '@' || c === '>' || c === '<') {
      // (an @{…} next to a rule, or two together, keep the paddings their own way: left as they are)
      const g = group(sp, i + 1); if (!g || (c === '@' && (!spacing(g.v) || ats.length || /[|:]$/.test(at.join(''))))) return null;
      if (c === '>') pre += g.v; else if (c === '<') { if (!cols.length || ats.length) return null; cols[cols.length - 1].post += g.v; } else ats.push(g.v);
      i = g.end; continue;
    }
    if ('|:'.includes(c)) { if (ats.length) return null; at.push(c); i++; continue; }
    if (!'lcrpmb'.includes(c)) return null; // !{…}, and a column type of the document's own
    const one = 'pmb'.includes(c) ? 'l' : c;
    let end = i + 1;
    if ('pmb'.includes(c)) { const g = group(sp, i + 1); if (!g) return null; end = g.end; }
    if (cols.length) cols[cols.length - 1].right = ats;
    cols.push({ align: one, pre, post: '', left: ats, right: [] });
    at.push('\u0000');
    pre = ''; ats = []; i = end;
  }
  if (!cols.length || pre) return null;
  cols[cols.length - 1].right = ats;
  // each @{x} once: on the left of the column after it (or the right of the last column). An @{x} at an outer edge is
  // set outside the array (\kern-5pt x). Without rules, one between two columns moves every later column's cells by
  // \kern-10pt x, with the opposite kern after them so each cell keeps its width (a narrower cell would be lost in a
  // column narrower than the kern: the engine's columns are never narrower than nothing), and the array's right edge
  // with them. Rules are drawn where the engine's columns are, so with \hline, or a | after a column that moves, the
  // cells take the kerns, which is exact while each column is as wide as its kerns (a | or : before the first column
  // that moves stays where the engine draws it).
  const rules = /\\(?:hline|toprule|midrule|bottomrule|hdashline|cline|cmidrule)(?![A-Za-z])/.test(body);
  const firstMoved = cols.findIndex((c, k) => k > 0 && c.left.length);
  let seen = 0;
  const shifting = !rules && at.every((c) => (c === '\u0000' ? ++seen : firstMoved < 0 || seen < firstMoved))
    && cols.every((c) => c.left.every((x) => negated(x) !== null));
  const edits = cols.map(() => ({ before: '', after: '' })), shifts = cols.map(() => ['', '']);
  let outerLeft = '', outerRight = '', moved = '', back = '';
  for (const [k, col] of cols.entries()) {
    for (const x of col.left) {
      if (k > 0 && !cols[k - 1].right.length) return null;
      if (!k && !rules) { outerLeft += `\\kern-5pt ${x} `; continue; }
      // (the kerns that come back go back first: a pen that runs past where it ends makes WebKit's box that much wider)
      if (k && shifting) { moved += `\\kern-10pt ${x} `; back = `${negated(x)} \\kern10pt ${back}`; continue; }
      const prev = k > 0 ? cols[k - 1] : null;
      if (!x.trim() || col.align === 'l') edits[k].before += `\\kern-5pt ${x} `;
      else if (prev && prev.align === 'r') edits[k - 1].after += `\\kern-5pt ${x} `;
      else return null;
      if (prev) edits[k - 1].after += !x.trim() || col.align === 'l' ? '\\kern-5pt ' : '';
      if (prev && x.trim() && col.align !== 'l') edits[k].before += '\\kern-5pt ';
    }
    shifts[k] = [moved, back];
    if (k === cols.length - 1) for (const x of col.right) {
      if (!rules) { outerRight += `\\kern-5pt ${x} `; continue; }
      if (x.trim() && col.align !== 'r') return null;
      edits[k].after += `\\kern-5pt ${x} `;
    }
  }
  outerRight += moved;
  // a column's @{…} are read once each: the right ones of a column are the left ones of the next
  const RULE = /^\s*(?:\\(?:hline|toprule|midrule|bottomrule|hdashline)\b\s*|\\(?:cline|cmidrule)\s*(?:\([^)]*\))?\s*\{[^{}]*\}\s*)*/;
  const out = rows(body).map(({ row, cr }) => {
    const lines = RULE.exec(row)![0], rest = row.slice(lines.length);
    if (!rest.trim()) return lines + rest + cr;
    const cells: string[] = [];
    let from = 0, depth = 0;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c === '\\') { const e = /^\\(begin|end)\s*\{[^{}]*\}/.exec(rest.slice(i, i + 60)); if (e) { depth += e[1] === 'begin' ? 1 : -1; i += e[0].length - 1; } else i++; continue; }
      if (c === '{') depth++; else if (c === '}') depth--;
      else if (c === '&' && !depth) { cells.push(rest.slice(from, i)); from = i + 1; }
    }
    cells.push(rest.slice(from));
    if (cells.length > cols.length) return null;
    return lines + cells.map((cell, k) => {
      const x = `${cols[k].pre} ${again(cell)} ${cols[k].post}`;
      return shifts[k][0] && x.trim() ? `${shifts[k][0]}${x}${shifts[k][1]}` : `${edits[k].before}${x}${edits[k].after}`;
    }).join('&') + cr;
  });
  if (out.some((r) => r === null)) return null;
  const array = `\\begin{array}{${at.map((c) => (c === '\u0000' ? cols.shift()!.align : c)).join('')}}${out.join('')}\\end{array}`;
  // (a group, an ordinary atom as the array's \vcenter is)
  return outerLeft || outerRight ? `{${outerLeft}${array}${outerRight}}` : array;
}

const SIUNITX = /\\(?:SI|si|num|ang|unit|qty|SIrange|qtyrange|numrange|SIlist|qtylist|numlist|numproduct|qtyproduct|tablenum)(?![A-Za-z])/;
// boxes whose [width][position] options the engines' stand-ins can't read: they are left out
const BOX_OPTIONS = /^(?:makebox|framebox|mathmakebox|multirow)$/;
const NEEDS = /\\text(?:rm|sf|tt|normal|bf|it|up|md)?\s*\{[^]*\$|\\(?:SI|si|num|ang|unit|qty|SIrange|qtyrange|numrange|SIlist|qtylist|numlist|numproduct|qtyproduct|tablenum|makebox|framebox|mathmakebox|multirow|multicolumn|mleft|ev|expval|expectationvalue|vev|ketbra|dyad|op|outerproduct|mel|matrixel|matrixelement)(?![A-Za-z])|\\begin\s*\{(?:array|multlined|multline\*?|cases)\}|\\math(?:op|bin|rel|ord|open|close|punct|inner)\s*\\|\\left\s*\\(?:llbracket|lBrack)|\\\\\s+\[|\d\s*\\(?:jot|nulldelimiterspace|scriptspace|arraycolsep|tabcolsep|fboxsep|fboxrule|thinmuskip|medmuskip|thickmuskip)(?![A-Za-z@])/;
// LaTeX's lengths at 10pt (their stand-ins in mathengine.ts): a factor before one multiplies it (\\[2\jot] is 6pt), where
// the stand-in alone would be read as more digits (23pt)
const LENGTHS: Record<string, [number, string]> = { jot: [3, 'pt'], nulldelimiterspace: [1.2, 'pt'], scriptspace: [0.5, 'pt'], arraycolsep: [5, 'pt'],
  tabcolsep: [6, 'pt'], fboxsep: [3, 'pt'], fboxrule: [0.4, 'pt'], thinmuskip: [3, 'mu'], medmuskip: [4, 'mu'], thickmuskip: [5, 'mu'] };
const scaled = (tex: string, defined: Defined) => tex.replace(/(\d+\.?\d*|\.\d+)\s*\\([A-Za-z]+)(?![A-Za-z@])/g, (all, f, name) =>
  (LENGTHS[name] && !defined(name) ? `${+(parseFloat(f) * LENGTHS[name][0]).toFixed(5)}${LENGTHS[name][1]}` : all));
// a math class command reads one token or a group (TeX's math field): \mathop\bigoplus is \mathop{\bigoplus}
const CLASSES = /^math(?:op|bin|rel|ord|open|close|punct|inner)$/;
// environments whose \\ is LaTeX's \@arraycr, which skips spaces before its [dimen] (amsmath's aligned and gathered
// read \\ [x] as a row starting with [x])
const ARRAY_CR = /^(?:array|matrix|[pbBvV]matrix|smallmatrix|cases|dcases|rcases|[pbBvV]?matrix\*)$/;
/** `\\ [dimen]` with the spaces left out where the environment around it is an array (ARRAY_CR). */
function arrayCr(tex: string): string {
  if (!/\\\\\s+\[/.test(tex)) return tex;
  const envs: string[] = [];
  let out = '';
  for (let i = 0; i < tex.length;) {
    const m = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(tex.slice(i, i + 60));
    if (m) { if (m[1] === 'begin') envs.push(m[2]); else envs.pop(); out += m[0]; i += m[0].length; continue; }
    const cr = /^\\\\\s+\[/.exec(tex.slice(i, i + 40));
    if (cr && ARRAY_CR.test(envs[envs.length - 1] || '')) { out += '\\\\['; i += cr[0].length; continue; }
    if (tex[i] === '\\') { out += tex.slice(i, i + 2); i += 2; continue; }
    out += tex[i]; i++;
  }
  return out;
}

/** `tex` with what the engines don't read rewritten into what they do (see the top of this file). */
// \text{… $m$ …}: TeX sets the maths in text style at the text's size, which in a subscript is the script size; the
// engines set it at the full size (measured: x_{\text{$abcabc$}} is 29.07pt wide in pdflatex, as x_{abcabc}). Each
// piece of maths becomes a group choosing text style at its place's size; the text round it stays text.
const TEXTS = new Set(['text', 'textrm', 'textsf', 'texttt', 'textnormal', 'textbf', 'textit', 'textup', 'textmd']);
function dollarPieces(t: string): string[] | null {
  const out: string[] = [];
  let cur = '', d = 0;
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (c === '\\') { cur += t.slice(k, k + 2); k++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    if (c === '$') { if (d || t[k + 1] === '$') return null; out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.length > 1 && out.length % 2 ? out : null;
}
const textStyled = (m: string) => `{\\mathchoice{\\textstyle ${m}}{\\textstyle ${m}}{\\scriptsize\\textstyle ${m}}{\\tiny\\textstyle ${m}}}`;

export function rewriteMath(tex: string, defined: Defined = () => false): string {
  if (!NEEDS.test(tex)) return tex;
  tex = arrayCr(scaled(tex, defined));
  const again = (t: string) => rewriteMath(t, defined);
  let out = '';
  for (let i = 0; i < tex.length;) {
    const c = tex[i];
    if (c !== '\\') { out += c; i++; continue; }
    const m = /^\\([A-Za-z]+)/.exec(tex.slice(i, i + 40));
    if (!m) { out += tex.slice(i, i + 2); i += 2; continue; }
    const name = m[1], after = i + m[0].length;
    const done = (s: string, end: number) => { out += s; i = end; };
    if (TEXTS.has(name)) {
      const a = group(tex, after), parts = a && dollarPieces(a.v);
      if (parts) { done(parts.map((p, k) => (k % 2 ? (p.trim() ? textStyled(again(p)) : '') : p ? `\\${name}{${p}}` : '')).join(''), a!.end); continue; }
    }
    if (name === 'begin') {
      const env = group(tex, after);
      if (env && MULTLINE.test(env.v)) {
        let j = env.end, o; const opts: string[] = [];
        while ((o = option(tex, j))) { opts.push(o.v); j = o.end; }
        const close = envEnd(tex, j, env.v);
        if (close) { done(multlined(tex.slice(j, close.at), env.v === 'multlined' ? opts : [], again, env.v === 'multlined'), close.end); continue; }
        done('\\begin{gathered}', j); continue;
      }
      if (env && CASES.test(env.v)) {
        // cases is array{@{}l@{\quad}l@{}}: the \quad after the first column is there with no second one (measured in
        // TeX Live); the engines add it only for a second cell, so an empty one is given
        const close = envEnd(tex, env.end, env.v), body = close && tex.slice(env.end, close.at), list = body ? rows(body) : [];
        if (close && list.length && !list.some(({ row }) => topLevelCell(row))) {
          done(`\\begin{${env.v}}${list.map(({ row, cr }, k) => again(row) + (k ? '' : '&') + cr).join('')}\\end{${env.v}}`, close.end); continue;
        }
      }
      if (env && env.v === 'array') {
        const pos = option(tex, env.end), spec = group(tex, pos ? pos.end : env.end);
        const close = spec && envEnd(tex, spec.end, 'array'), cells = close && arrayCells(spec!.v, tex.slice(spec!.end, close.at), again);
        if (cells) { done(cells, close!.end); continue; }
        if (spec) { done(`\\begin{array}{${arrayColumns(spec.v)}}`, spec.end); continue; }
      }
      done(m[0], after); continue;
    }
    if (name === 'end') {
      const env = group(tex, after);
      if (env && (env.v === 'multlined' || env.v === 'multline' || env.v === 'multline*')) { done('\\end{gathered}', env.end); continue; }
      done(m[0], after); continue;
    }
    // a spanning cell: maths in an array, unless it holds $…$ (a tabular's text, read as text); multirow's options
    // between its arguments left out
    if ((name === 'multicolumn' || name === 'multirow') && !defined(name)) {
      const skip = (k: number) => { let o; while ((o = option(tex, k))) k = o.end; return k; };
      const a = group(tex, skip(after)), b = a && group(tex, skip(a.end)), c = b && group(tex, skip(b.end));
      if (a && b && c) {
        const cell = /(^|[^\\])\$/.test(c.v) ? `\\text{${c.v}}` : rewriteMath(c.v, defined);
        done(`\\${name}{${a.v}}{${b.v}}{${cell}}`, c.end); continue;
      }
    }
    if ((EXPECTATION.test(name) || OUTER.test(name) || ELEMENT.test(name) || name === 'vev') && !defined(name)) {
      const b = braket(name, tex, after, again);
      if (b) { done(b.v, b.end); continue; }
    }
    if (CLASSES.test(name) && !defined(name)) {
      const k = skipSpace(tex, after), cs = tex[k] === '\\' && /^\\(?:[A-Za-z]+|.)/.exec(tex.slice(k, k + 40));
      if (cs) { done(`\\${name}{${cs[0]}}`, k + cs[0].length); continue; }
    }
    if (name === 'mleft' && !defined(name)) {
      const k = skipSpace(tex, after), d = /^(?:\\[A-Za-z]+|\\.|.)/.exec(tex.slice(k))?.[0], r = d && mrightOf(tex, k + d.length);
      if (d && r) { done(`\\mathopen{}\\mathclose{\\left${d}${again(tex.slice(k + d.length, r.at))}\\right${r.delim}}`, r.end); continue; }
    }
    if (name === 'left') {
      const k = skipSpace(tex, after), d = /^\\(?:llbracket|lBrack)(?![A-Za-z])/.exec(tex.slice(k, k + 12));
      const r = d && rightOf(tex, k + d[0].length);
      if (d && r && BRACKETS[r.delim] && !/^\\[lL]/.test(r.delim)) {
        done(`\\mathinner{${BRACKETS[d[0]]}${again(tex.slice(k + d[0].length, r.at))}${BRACKETS[r.delim]}}`, r.end); continue;
      }
    }
    // \makebox[w][pos]{x} (and \mathmakebox, whose x is maths): x in a box w wide, centred, or flush left or right
    // (LaTeX's \@makebox); a box is an ordinary atom, so the whole is a group
    if ((name === 'makebox' || name === 'mathmakebox' || name === 'framebox') && !defined(name)) {
      const w = option(tex, after), pos = w && option(tex, w.end), x = w && group(tex, (pos || w).end);
      const size = w && /^\s*(\d+\.?\d*|\.\d+)\s*(pt|mm|cm|in|em|ex|bp|pc|dd|cc)\s*$/.exec(w.v);
      const p = (pos?.v || 'c').trim();
      if (x && size && /^[lrc]?$/.test(p)) {
        const content = name === 'mathmakebox' ? again(x.v) : /^\s*$/.test(x.v) ? '' : `\\text{${x.v}}`;
        // \framebox[w]'s frame is inside w: \fboxrule and \fboxsep a side, where the engines' \fbox pads by 6pt in all
        const PT: Record<string, number> = { pt: 1, mm: 2.84528, cm: 28.45276, in: 72.27, bp: 1.00375, pc: 12, dd: 1.07001, cc: 12.84010 };
        const inner = name === 'framebox' ? (PT[size[2]] ? parseFloat(size[1]) * PT[size[2]] - 6 : NaN) : parseFloat(size[1]), unit = name === 'framebox' ? 'pt' : size[2];
        if (!(inner >= 0)) { done(m[0], after); continue; }
        const half = `${+(inner / 2).toFixed(4)}${unit}`, full = `${+inner.toFixed(4)}${unit}`;
        const box = !content ? `\\hspace{${full}}` : p === 'l' ? `\\mathrlap{${content}}\\hspace{${full}}` : p === 'r' ? `\\hspace{${full}}\\mathllap{${content}}`
          : `\\hspace{${half}}\\mathclap{${content}}\\hspace{${half}}`;
        // \framebox is that box in \fbox's frame (\fboxsep 3pt, \fboxrule 0.4pt: the engines' \fbox)
        done(name === 'framebox' ? `\\fbox{$${box}$}` : `{${box}}`, x.end);
        continue;
      }
    }
    if (BOX_OPTIONS.test(name) && !defined(name)) {
      let j = after, o; while ((o = option(tex, j))) j = o.end;
      done(m[0], j); continue;
    }
    if (defined(name) || !SIUNITX.test(m[0] + ' ')) { done(m[0], after); continue; }
    // siunitx (and physics' \qty, told apart by what follows it)
    const o = option(tex, after), opts = options(o?.v), j = o ? o.end : after;
    const a = group(tex, j);
    // \qty{1}{\metre} is siunitx's; \qty(…), \qty[…], \qty|…| and a lone \qty{…} are physics' delimiters
    const unitAfter = a && (() => { const p = option(tex, a.end); return group(tex, p ? p.end : a.end); })();
    if (name === 'qty' && !unitAfter) {
      const k = skipSpace(tex, after), d = tex[k], brace = d === '{' ? group(tex, k) : null;
      const end = brace ? brace.end - 1 : d === '(' || d === '[' || d === '|' ? closeAt(tex, k) : -1;
      if (end > k) { done(`\\left${LEFT[d]}${rewriteMath(tex.slice(k + 1, end), defined)}\\right${RIGHT[d]}`, end + 1); continue; }
    }
    if (!a) { done(m[0], after); continue; }
    if (name === 'SI' || name === 'qty') {
      const pre = option(tex, a.end), u = group(tex, pre ? pre.end : a.end);
      if (u) { done(`{${pre ? bare(unitTex(pre.v, opts)) + '\\,' : ''}${quantity(a.v, u.v, opts)}}`, u.end); continue; }
    }
    if (name === 'si' || name === 'unit') { done(`{${bare(unitTex(a.v, opts))}}`, a.end); continue; }
    if (name === 'num' || name === 'tablenum') { done(`{${numberTex(a.v)}}`, a.end); continue; }
    if (name === 'ang') {
      const parts = a.v.split(';').map((s) => s.trim());
      const marks = ['{}^{\\circ}', "{}'", "{}''"];
      done(`{${parts.map((p, k) => (p ? numberTex(p) + marks[k] : '')).join('')}}`, a.end); continue;
    }
    if (name === 'SIrange' || name === 'qtyrange' || name === 'numrange') {
      const b = group(tex, a.end), u = name === 'numrange' ? null : b && group(tex, b.end);
      if (b && (name === 'numrange' || u)) {
        const q = (n: string) => (u ? quantity(n, u.v, opts) : numberTex(n));
        done(`{${q(a.v)}\\text{ to }${q(b.v)}}`, (u || b).end); continue;
      }
    }
    if (name === 'SIlist' || name === 'qtylist' || name === 'numlist') {
      const u = name === 'numlist' ? null : group(tex, a.end);
      if (name === 'numlist' || u) { done(`{${andList(a.v.split(';').map((n) => (u ? quantity(n, u.v, opts) : numberTex(n))))}}`, (u || a).end); continue; }
    }
    if (name === 'numproduct' || name === 'qtyproduct') {
      const u = name === 'numproduct' ? null : group(tex, a.end);
      const nums = a.v.split(/x/).map((n) => numberTex(n)).join('\\times ');
      if (name === 'numproduct' || u) { done(`{${nums}${u ? '\\,' + bare(unitTex(u.v, opts)) : ''}}`, (u || a).end); continue; }
    }
    done(m[0], after);
  }
  return out;
}

/**
 * Commands drawn here, not by the engines: siunitx's, and the prefixes and units inside them (\kilo, \metre, \per …),
 * and physics' \qty.
 */
export const REWRITTEN = new Set([...'SI si num ang unit qty SIrange qtyrange numrange SIlist qtylist numlist numproduct qtyproduct tablenum'.split(' '),
  ...Object.keys(PREFIXES), ...Object.keys(UNITS), ...Object.keys(SYMBOLS),
  ...'per square cubic raiseto squared cubed tothe of highlight'.split(' ')]);

// ---------- colours ----------
/** xcolor's \textcolor{c}{x} is {\color{c}x} (color.sty): a group, so an ordinary atom (a\textcolor{red}{+}b has no space round the +). */
export function textcolorGroups(tex: string): string {
  if (!/\\textcolor(?![A-Za-z])/.test(tex)) return tex;
  let out = '';
  for (let i = 0; i < tex.length;) {
    const m = /^\\textcolor(?![A-Za-z])/.exec(tex.slice(i, i + 11));
    if (m) {
      const c = group(tex, i + m[0].length), x = c && group(tex, c.end);
      if (c && x) { out += `{\\color{${c.v}}{${textcolorGroups(x.v)}}}`; i = x.end; continue; }
    }
    if (tex[i] === '\\') { out += tex.slice(i, i + 2); i += 2; continue; }
    out += tex[i]; i++;
  }
  return out;
}

// ---------- in text ----------
const TEXT_MATH = /\\(?:SI|si|qty|num|ang|unit|SIrange|qtyrange|numrange|SIlist|qtylist|numlist|ce|pu)(?![A-Za-z])/g;
/**
 * Text split where siunitx's and mhchem's commands stand in it outside $…$ (they work in text too: a label
 * l=\SI{10}{\kilo\ohm}): each command with its arguments, at the text's top level, is a formula to draw.
 */
export function textModeMath(text: string, defined: Defined = () => false): { math: boolean; s: string }[] {
  TEXT_MATH.lastIndex = 0;
  if (!TEXT_MATH.test(text)) return [{ math: false, s: text }];
  const out: { math: boolean; s: string }[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth = Math.max(0, depth - 1); continue; }
    if (c !== '\\') continue;
    const m = /^\\([A-Za-z]+)/.exec(text.slice(i, i + 20));
    if (!m) { i++; continue; }
    TEXT_MATH.lastIndex = 0;
    if (depth > 0 || defined(m[1]) || !TEXT_MATH.test(m[0] + ' ')) { i += m[0].length - 1; continue; }
    // the command and the [options] and {groups} straight after it
    let j = i + m[0].length;
    for (;;) {
      const g = text[j] === '{' ? group(text, j) : text[j] === '[' ? option(text, j) : null;
      if (!g) break;
      j = g.end;
    }
    if (j === i + m[0].length) { i = j - 1; continue; }
    if (i > from) out.push({ math: false, s: text.slice(from, i) });
    out.push({ math: true, s: text.slice(i, j) });
    from = j; i = j - 1;
  }
  if (from < text.length) out.push({ math: false, s: text.slice(from) });
  return out;
}
