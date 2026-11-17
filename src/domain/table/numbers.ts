// Numbers in table cells: read as typed (1.23, −4.5e-3, 1.23(4), 1.23 ± 0.04, $1.2 \times 10^{3}$), rounded
// to significant figures or decimal places, written for a siunitx S column (which aligns them on the decimal
// marker) and drawn the same way on screen. Rounding happens here, not in siunitx, so the preview and the PDF
// show the same digits whatever siunitx version compiles them.
import type { TNum } from './model';

export interface Num {
  neg: boolean;
  /** digits before and after the decimal marker, as typed (no sign, no exponent) */
  int: string;
  frac: string;
  /** power of ten, or null when none was typed */
  exp: number | null;
  /** uncertainty in units of the last digit (1.23(4) → '4'), or null */
  unc: string | null;
  /** typed with a decimal comma (12,5 / 1.955,98) */
  dec?: ',';
  /** typed with thousands grouped by this mark (1,955.98 → ',', 1.955,98 → '.') */
  group?: ',' | '.';
}

const MINUS = /[\u2212\u2013]/g;
const NUM = String.raw`([+-]?)(\d*)(?:\.(\d*))?`;
// 1.23  1.23e-4  1.23E+4  .5  -3
const PLAIN = new RegExp(String.raw`^${NUM}(?:[eE]([+-]?\d+))?$`);
// 1.23(4)  1.23(4)e-2
const PAREN = new RegExp(String.raw`^${NUM}\((\d+(?:\.\d+)?)\)(?:[eE]([+-]?\d+))?$`);

/** Reads a cell's text as a number, or null when it is not one. Accepts maths ($…$), × 10^n, ± and +-. */
export function parseNum(text: string): Num | null {
  let t = String(text || '').trim();
  if (!t || t.length > 80) return null;
  const m0 = /^\$([^$]*)\$$/.exec(t) || /^\\\(([\s\S]*)\\\)$/.exec(t);
  if (m0) t = m0[1].trim();
  // grouped thousands and decimal commas, plain or braced in maths: 1,955.98  $1{,}955.98$  1.955,98  12,5
  let mark: Pick<Num, 'dec' | 'group'> = {};
  if (t.includes(',')) {
    const g = t.replace(/\{,\}/g, ',').replace(/\s+/g, '');
    if (/^[+-]?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(g)) { t = g.replace(/,/g, ''); mark = { group: ',' }; }
    else if (/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(g)) { t = g.replace(/\./g, '').replace(',', '.'); mark = { dec: ',', group: '.' }; }
    else if (/^[+-]?\d*,\d+$/.test(g)) { t = g.replace(',', '.'); mark = { dec: ',' }; }
  }
  t = t.replace(MINUS, '-').replace(/\\,|\\!|\\ |~|\u2009|\u202f/g, '').replace(/\{([^{}]*)\}/g, '$1');
  // a × 10^n
  t = t.replace(/\s*(?:\\times|\\cdot|×|·|x)\s*10\s*\^\s*\(?\s*([+-]?\d+)\s*\)?/, 'e$1');
  t = t.replace(/\s+/g, '');
  // a ± b, written several ways
  const pm = /^(.*?)(?:\\pm|±|\+-|\+\/-)(.*)$/.exec(t);
  if (pm) {
    let [a, b] = [pm[1], pm[2]];
    // (1.23 ± 0.04)e-2 → both share the exponent
    let shared: number | null = null;
    const ex = /^\((.*)\)e([+-]?\d+)$/.exec(t.replace(/\\pm|±|\+\/-|\+-/, '±'));
    if (ex) { const ab = ex[1].split('±'); a = ab[0]; b = ab[1]; shared = +ex[2]; }
    const A = parseNum(a), B = parseNum(b);
    if (!A || !B || A.unc || B.unc || B.neg || (A.exp ?? shared ?? 0) !== (B.exp ?? shared ?? 0)) return null;
    const exp = shared ?? A.exp;
    // the uncertainty in units of the value's last digit: 1.23 ± 0.04 → 1.23(4); 1.2 ± 0.15 → 1.20(15)
    const places = Math.max(A.frac.length, B.frac.length);
    const frac = A.frac.padEnd(places, '0');
    const unc = (B.int + B.frac.padEnd(places, '0')).replace(/^0+(?=\d)/, '');
    return { neg: A.neg, int: A.int, frac, exp, unc };
  }
  let m = PLAIN.exec(t);
  if (m && (m[2] || m[3])) return { neg: m[1] === '-', int: (m[2] || '0').replace(/^0+(?=\d)/, ''), frac: m[3] || '', exp: m[4] != null ? +m[4] : null, unc: null, ...mark };
  m = PAREN.exec(t);
  if (m && (m[2] || m[3])) {
    const frac = m[3] || '';
    let unc = m[4];
    // 1.23(0.04): the uncertainty written with its own decimal marker
    if (unc.includes('.')) {
      const [ui, uf] = unc.split('.');
      const places = Math.max(frac.length, uf.length);
      return { neg: m[1] === '-', int: (m[2] || '0').replace(/^0+(?=\d)/, ''), frac: frac.padEnd(places, '0'), exp: m[5] != null ? +m[5] : null, unc: (ui + uf.padEnd(places, '0')).replace(/^0+(?=\d)/, '') };
    }
    unc = unc.replace(/^0+(?=\d)/, '');
    return { neg: m[1] === '-', int: (m[2] || '0').replace(/^0+(?=\d)/, ''), frac, exp: m[5] != null ? +m[5] : null, unc };
  }
  return null;
}

/** A Num as an exact decimal: digits (no leading zeros past the units), and the power of ten of the last digit. */
function toDigits(n: Num) {
  const digits = (n.int + n.frac).replace(/^0+(?=\d)/, '') || '0';
  return { digits, last: (n.exp || 0) - n.frac.length };
}
/** Rounds a string of digits (an integer) to keep `keep` digits from the left, half away from zero. */
function roundDigits(digits: string, keep: number): { digits: string; shift: number } {
  if (keep >= digits.length) return { digits, shift: 0 };
  if (keep < 0) return { digits: '0', shift: digits.length - keep };
  const cut = digits.length - keep;
  let head = digits.slice(0, keep) || '0';
  if (+digits[keep] >= 5) {
    // add one to head
    const a = head.split('').map(Number);
    let i = a.length - 1;
    for (; i >= 0; i--) { if (a[i] === 9) a[i] = 0; else { a[i]++; break; } }
    if (i < 0) a.unshift(1);
    head = a.join('');
  }
  return { digits: head, shift: cut };
}

/** Rounds a string of digits up (away from zero) to keep `keep` digits from the left: an uncertainty is never
 *  made smaller by rounding, so 1.23456(78) to three figures is 1.23(1), not 1.23(0). */
function ceilDigits(digits: string, keep: number): string {
  if (keep >= digits.length) return digits;
  const cut = Math.max(0, keep), head = digits.slice(0, cut) || '0', rest = digits.slice(cut);
  if (!/[1-9]/.test(rest)) return head;
  return (BigInt(head) + 1n).toString();
}

export interface Formatted {
  neg: boolean;
  int: string;
  frac: string;
  exp: number | null;
  unc: string | null;
}

/** the power of ten an engineer writes: a multiple of three at or below */
const eng = (mag: number) => mag - (((mag % 3) + 3) % 3);
/** Rounds and lays out a number as the column asks: significant figures or decimal places, and an exponent
 *  as typed, always (scientific, or engineering: a power of three) or never (fixed). The uncertainty keeps its place against the last digit. */
export function format(n: Num, o: TNum | null | undefined): Formatted {
  const opt = o || {};
  let { digits, last } = toDigits(n);
  let uncD = n.unc;
  // exponent shown: as typed, scientific (one digit before the marker) or none
  const value0 = digits.replace(/^0+/, '');
  const mag = value0 ? digits.replace(/^0+/, '').length - 1 + last : 0; // power of ten of the leading digit
  // rounding: the power of ten of the last kept digit
  let keepAt: number | null = null;
  if (opt.sig != null && value0) keepAt = mag - opt.sig + 1;
  else if (opt.dp != null) {
    // places count after the marker of the number as shown (in its own exponent)
    const shownExp = opt.exp === 'sci' ? mag : opt.exp === 'eng' ? eng(mag) : opt.exp === 'fixed' ? 0 : n.exp || 0;
    keepAt = shownExp - opt.dp;
  }
  if (keepAt != null) {
    if (keepAt > last) {
      const keep = digits.length - (keepAt - last);
      const r = roundDigits(digits, keep);
      digits = r.digits; last += r.shift;
      if (uncD) uncD = ceilDigits(uncD, uncD.length - (keepAt - (last - r.shift)));
    } else if (keepAt < last) {
      // more places than typed: pad with zeros (siunitx's round-pad)
      digits = digits + '0'.repeat(last - keepAt);
      if (uncD) uncD = uncD + '0'.repeat(last - keepAt);
      last = keepAt;
    }
  }
  const nz = digits.replace(/^0+/, '');
  const magR = nz ? nz.length - 1 + last : 0;
  let e: number | null;
  if (opt.exp === 'sci') e = magR;
  else if (opt.exp === 'eng') e = eng(magR);
  else if (opt.exp === 'fixed') e = null;
  else e = n.exp;
  const shift = e || 0;
  // the digits as an integer times 10^last, shown as int.frac × 10^shift
  const pointAt = last - shift; // power of ten of the last digit, relative to the shown exponent
  let int: string, frac: string;
  if (pointAt >= 0) { int = (digits + '0'.repeat(pointAt)).replace(/^0+(?=\d)/, ''); frac = ''; }
  else {
    const places = -pointAt, padded = digits.padStart(places + 1, '0');
    int = padded.slice(0, padded.length - places).replace(/^0+(?=\d)/, ''); frac = padded.slice(padded.length - places);
  }
  return { neg: n.neg && /[1-9]/.test(digits), int: int || '0', frac, exp: e, unc: uncD };
}

/** The number as siunitx reads it in an S column: -1.23(4)e-2 */
export const siString = (f: Formatted) => `${f.neg ? '-' : ''}${f.int}${f.frac ? '.' + f.frac : ''}${f.unc ? `(${f.unc})` : ''}${f.exp != null ? `e${f.exp}` : ''}`;

// ---------------------------------------------------------------- how a column prints its numbers
// The column's settings (TNum) say it, as siunitx options do; nothing is guessed from one cell. Without settings
// a column prints as siunitx's defaults: a decimal point, digits grouped in threes by a thin space once a part
// has five or more (the decimals too), × before a power of ten, no + on positive numbers, the numbers centred.
export const GROUPS = ['thin', 'comma', 'point', 'space', 'none'] as const;
export type Group = (typeof GROUPS)[number];
const SEP: Record<Group, string> = { thin: '\\,', comma: '{,}', point: '.', space: '\\ ', none: '' };
const SI_SEP: Record<Group, string> = { thin: '\\,', comma: ',', point: '.', space: '\\ ', none: '' };
/** grouping marks typed in the text are a choice of the writer: commas group in threes from four digits */
const minFor = (g: Group) => (g === 'comma' || g === 'point' ? 4 : 5);
export interface NumStyle { dec: '.' | ','; group: Group; min: number; frac: boolean; prod: string; plus: boolean }
export function numStyle(o: TNum | null | undefined): NumStyle {
  const n = o || {}, group: Group = (n.group as Group) || 'thin';
  return { dec: n.dec === ',' ? ',' : '.', group, min: n.groupMin ?? minFor(group), frac: n.groupFrac ?? group === 'thin', prod: n.prod === 'cdot' ? '\\cdot' : '\\times', plus: !!n.plus };
}
export const DEFAULT_STYLE = numStyle(null);
/** The settings a column starts with when its numbers are aligned, from what was typed in it: commas or points
 *  grouping thousands, a decimal comma. */
export function typedNum(texts: string[]): TNum {
  let comma = 0, point = 0, gComma = false, gPoint = false;
  for (const t of texts) {
    const n = parseNum(t);
    if (!n) continue;
    if (n.dec === ',') comma++; else if (n.group === ',' || n.frac) point++;
    gComma ||= n.group === ','; gPoint ||= n.group === '.';
  }
  const o: TNum = {};
  if (comma > point) o.dec = ',';
  if (o.dec === ',' ? gPoint : gComma) o.group = o.dec === ',' ? 'point' : 'comma';
  return o;
}
/** The S column's options for its settings (only those that differ from siunitx's defaults). */
export function siOptions(o: TNum | null | undefined): string[] {
  const n = o || {}, st = numStyle(n), out: string[] = [];
  if (st.dec === ',') out.push('output-decimal-marker={,}');
  if (st.group === 'none') out.push('group-digits=none');
  else {
    if (st.group !== 'thin') out.push(`group-separator={${SI_SEP[st.group]}}`);
    if (!st.frac) out.push('group-digits=integer');
    if (st.min !== 5) out.push(`group-minimum-digits=${st.min}`);
  }
  if (n.prod === 'cdot') out.push('exponent-product=\\cdot');
  if (n.plus) out.push('print-implicit-plus');
  if (n.pos === 'l') out.push('table-number-alignment=left');
  if (n.pos === 'r') out.push('table-number-alignment=right');
  return out;
}
/** S column options (as written above, or by hand) → the column's settings; round-mode and uncertainty too. */
export function numFromSi(opts: string): TNum {
  const o: TNum = {}, kv = new Map<string, string>();
  for (const part of String(opts || '').split(/,(?![^{]*\})/)) {
    const m = /^\s*([a-z-]+)\s*(?:=\s*(.*?))?\s*$/.exec(part);
    if (m) kv.set(m[1], (m[2] ?? 'true').replace(/^\{(.*)\}$/, '$1').trim());
  }
  const mode = kv.get('round-mode'), prec = kv.get('round-precision');
  if (mode === 'figures') o.sig = +(prec ?? 2) || 2;
  else if (mode === 'places') o.dp = +(prec ?? 2) || 0;
  const em = kv.get('exponent-mode');
  if (em === 'scientific') o.exp = 'sci'; else if (em === 'fixed') o.exp = 'fixed'; else if (em === 'engineering') o.exp = 'eng';
  if (kv.get('uncertainty-mode') === 'separate') o.unc = 'pm';
  if (kv.get('output-decimal-marker') === ',') o.dec = ',';
  const gd = kv.get('group-digits'), gs = kv.get('group-separator');
  if (gd === 'none' || gd === 'false') o.group = 'none';
  else {
    if (gs != null) o.group = gs === ',' ? 'comma' : gs === '.' ? 'point' : gs === '\\' || gs === '\\ ' || gs === '~' ? 'space' : 'thin';
    // what siunitx does when an option isn't given (all digits, from 5), kept only where this group assumes otherwise
    const base = numStyle({ group: o.group }), gm = +(kv.get('group-minimum-digits') ?? 5);
    const frac = gd !== 'integer', min = Number.isFinite(gm) ? Math.max(1, Math.round(gm)) : 5;
    if (min !== base.min) o.groupMin = min;
    if (frac !== base.frac) o.groupFrac = frac;
    if (o.group === 'thin') delete o.group;
  }
  if (/^\\cdot$/.test(kv.get('exponent-product') || '')) o.prod = 'cdot';
  if (kv.get('print-implicit-plus') === 'true') o.plus = true;
  const ta = kv.get('table-number-alignment') ?? kv.get('table-alignment');
  if (ta === 'left') o.pos = 'l'; else if (ta === 'right') o.pos = 'r';
  return o;
}
const groupLeft = (d: string, st: NumStyle) => (st.group === 'none' || d.length < st.min ? d : d.replace(/\B(?=(\d{3})+$)/g, SEP[st.group]));
const groupRight = (d: string, st: NumStyle) => (st.group === 'none' || !st.frac || d.length < st.min ? d : d.replace(/(\d{3})(?=\d)/g, `$1${SEP[st.group]}`));
const decTex = (st: NumStyle) => (st.dec === ',' ? '{,}' : '.');

/** The uncertainty as a plain number (for ±): 4 with 2 places → 0.04 */
function uncPlain(f: Formatted, st: NumStyle) {
  const u = f.unc || '0', places = f.frac.length;
  if (!places) return u;
  const p = u.padStart(places + 1, '0');
  return p.slice(0, p.length - places) + decTex(st) + p.slice(p.length - places);
}
/** The number typeset as siunitx would print it, in TeX maths, split at the decimal marker for alignment:
 *  [left of the marker, the rest]. */
export function texParts(f: Formatted, unc: 'paren' | 'pm' = 'paren', st: NumStyle = DEFAULT_STYLE): [string, string] {
  const left = `${f.neg ? '-' : st.plus ? '+' : ''}${groupLeft(f.int, st)}`;
  let right = f.frac ? decTex(st) + groupRight(f.frac, st) : '';
  if (f.unc) right += unc === 'pm' ? `\\pm ${uncPlain(f, st)}` : `(${f.unc})`;
  if (f.exp != null) right += `${st.prod} 10^{${f.exp}}`;
  return [left, right];
}
/** For a cell: $…$ text of the formatted number (what the preview draws). */
export const mathText = (f: Formatted, unc: 'paren' | 'pm' = 'paren', st: NumStyle = DEFAULT_STYLE) => { const [a, b] = texParts(f, unc, st); return `$${a}${b}$`; };

/** siunitx table-format for a set of numbers: sign, integer digits, decimals, uncertainty and exponent digits. */
export function tableFormat(list: Formatted[], plus = false) {
  if (!list.length) return '';
  let sign = plus, i = 1, d = 0, u = 0, e = 0, eSign = false, anyE = false;
  for (const f of list) {
    sign ||= f.neg; i = Math.max(i, f.int.length); d = Math.max(d, f.frac.length); u = Math.max(u, (f.unc || '').length);
    if (f.exp != null) { anyE = true; e = Math.max(e, String(Math.abs(f.exp)).length); eSign ||= f.exp < 0; }
  }
  return `${sign ? (plus ? '+' : '-') : ''}${i}.${d}${u ? `(${u})` : ''}${anyE ? `e${eSign ? '-' : ''}${e}` : ''}`;
}

/** Whether most non-empty body cells of a list read as numbers (a column worth aligning). */
export function looksNumeric(texts: string[]) {
  const vals = texts.map((t) => t.trim()).filter((t) => t && t !== '-' && t !== '--' && t !== '—');
  if (vals.length < 1) return false;
  const n = vals.filter((t) => parseNum(t)).length;
  return n >= Math.max(1, Math.ceil(vals.length * 0.8));
}

// ---------------------------------------------------------------- units
// siunitx unit macros → the symbols they print, for the preview. Literal units (kg, m/s, m.s^{-1}) are drawn as typed.
const PREFIX: Record<string, string> = { yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n', micro: 'µ', milli: 'm', centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k', mega: 'M', giga: 'G', tera: 'T', peta: 'P', exa: 'E', zetta: 'Z', yotta: 'Y' };
const UNIT: Record<string, string> = {
  metre: 'm', meter: 'm', gram: 'g', second: 's', ampere: 'A', kelvin: 'K', mole: 'mol', candela: 'cd', kilogram: 'kg', hertz: 'Hz', newton: 'N',
  pascal: 'Pa', joule: 'J', watt: 'W', coulomb: 'C', volt: 'V', farad: 'F', ohm: 'Ω', siemens: 'S', weber: 'Wb', tesla: 'T', henry: 'H',
  degreeCelsius: '°C', lumen: 'lm', lux: 'lx', becquerel: 'Bq', gray: 'Gy', sievert: 'Sv', katal: 'kat', radian: 'rad', steradian: 'sr',
  litre: 'L', liter: 'L', minute: 'min', hour: 'h', day: 'd', degree: '°', percent: '%', electronvolt: 'eV', dalton: 'Da', angstrom: 'Å',
  bar: 'bar', bel: 'B', decibel: 'dB', astronomicalunit: 'au', tonne: 't', hectare: 'ha', arcminute: '′', arcsecond: '″', molar: 'M', mmHg: 'mmHg',
};
/** A unit for the preview: \kilo\gram\per\metre\squared → kg/m², m.s^{-1} → m·s⁻¹ (as TeX maths text). */
export function unitTex(u: string) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (!s.includes('\\')) {
    // literal: . and ~ are products, ^ powers
    return `$\\mathrm{${s.replace(/[.~]/g, '\\,').replace(/%/g, '\\%').replace(/µ|μ/g, '\\mu ')}}$`;
  }
  const toks = s.match(/\\[A-Za-z]+|\{[^{}]*\}|[^\\\s]/g) || [];
  const parts: { num: boolean; t: string }[] = [];
  let pre = '', per = false, power = 0, after: string | null = null;
  const push = (t: string) => { parts.push({ num: !per, t }); per = false; };
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k], name = tk.slice(1);
    if (tk === '\\per') { per = true; continue; }
    if (tk === '\\square') { power = 2; continue; }
    if (tk === '\\cubic') { power = 3; continue; }
    if (tk === '\\squared' || tk === '\\cubed') { after = tk === '\\squared' ? '2' : '3'; if (parts.length) parts[parts.length - 1].t += `^{${after}}`; after = null; continue; }
    if (tk === '\\tothe' || tk === '\\raiseto') { const v = (toks[++k] || '').replace(/[{}]/g, ''); if (tk === '\\raiseto') power = +v || 0; else if (parts.length) parts[parts.length - 1].t += `^{${v}}`; continue; }
    if (PREFIX[name] !== undefined) { pre += PREFIX[name]; continue; }
    const sym = UNIT[name] ?? (tk.startsWith('\\') ? name : tk.replace(/[{}]/g, ''));
    push(pre + sym + (power ? `^{${power}}` : ''));
    pre = ''; power = 0;
  }
  const up = parts.filter((p) => p.num).map((p) => p.t), down = parts.filter((p) => !p.num).map((p) => p.t);
  // as siunitx prints by default (per-mode = power): kg m^{-2}, not kg/m^2
  const inv = (t: string) => { const m = /\^\{([^{}]*)\}$/.exec(t); return m ? `${t.slice(0, m.index)}^{-${m[1]}}` : `${t}^{-1}`; };
  const body = [...up, ...down.map(inv)].join('\\,');
  return `$\\mathrm{${body.replace(/µ/g, '\\mu ').replace(/Ω/g, '\\Omega ').replace(/°/g, '{}^{\\circ}').replace(/%/g, '\\%')}}$`;
}

// ---------------------------------------------------------------- numbers in running text
// A number written in a cell's text becomes maths: "1,955.98 mm" → "$1{,}955.98$ mm". Accepted: 12, 12.5, 12,5,
// 1,955.98 and 1.955,98 (grouped by thousands, the other mark being the decimal one), with a leading sign. The
// comma is braced so maths doesn't space it as punctuation. Left alone: maths already there, a command's
// arguments (\hspace{2pt}, \cite{x1}) except text styles (\textbf{12} is wrapped inside), and numbers that are
// part of a word or code (H2O, v1.2, COVID-19, 2nd, 1.2.3, 2024-01-05, 12:30, 1/2).
const TEXT_CMDS = new Set(['textbf', 'textit', 'textsl', 'textsc', 'textup', 'textmd', 'textrm', 'textsf', 'texttt', 'textnormal', 'emph', 'underline', 'text', 'mbox', 'makecell', 'shortstack']);
const NUMBER_IN_TEXT = /([+\-−]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/g;
const BEFORE = /[\s([{~]/;
export function wrapNumbers(text: string): string {
  const s = String(text ?? ''), n = s.length;
  if (!/\d/.test(s)) return s;
  // plain[i]: character i is running text (not maths, a command or a command's argument)
  const plain = new Uint8Array(n);
  const open: { skip: boolean; cmd: string | null }[] = []; // per open brace: whether its contents are left alone
  const past = (shut: string, from: number) => { const k = s.indexOf(shut, from); return k < 0 ? n : k + shut.length; };
  let i = 0, cmd: string | null = null; // the command whose arguments may follow
  while (i < n) {
    const c = s[i];
    if (c === '\\') {
      const name = /^\\([A-Za-z]+|[\s\S])?/.exec(s.slice(i, i + 40))![1] || '';
      if (name === '(') { i = past('\\)', i + 2); cmd = null; continue; }
      if (name === '[') { i = past('\\]', i + 2); cmd = null; continue; }
      cmd = /^[A-Za-z]+$/.test(name) || name === '\\' ? name : null;
      i += 1 + name.length;
      if (cmd && cmd !== '\\') while (s[i] === ' ') i++;
      if (cmd && s[i] === '[') i = past(']', i + 1); // an optional argument: \\[2pt]
      continue;
    }
    if (c === '$') { i = s.startsWith('$$', i) ? past('$$', i + 2) : past('$', i + 1); cmd = null; continue; }
    if (c === '{') { open.push({ skip: !!open[open.length - 1]?.skip || (cmd != null && !TEXT_CMDS.has(cmd)), cmd }); cmd = null; i++; continue; }
    if (c === '}') { cmd = open.pop()?.cmd ?? null; i++; continue; } // the command reads on: \multicolumn{2}{c}{…}
    cmd = null;
    if (!open[open.length - 1]?.skip) plain[i] = 1;
    i++;
  }
  const isPlain = (a: number, b: number) => { for (let k = a; k < b; k++) if (!plain[k]) return false; return true; };
  const fits = (k: number) => k >= n || /[\s)\]},;!?]/.test(s[k]) || (s[k] === '.' && !/\d/.test(s[k + 1] || '')) || s.startsWith('\\%', k) || s.startsWith('\\,', k) || s.startsWith('\\\\', k);
  return s.replace(NUMBER_IN_TEXT, (all: string, sign: string, num: string, at: number) => {
    const end = at + all.length;
    if (!fits(end) || (s[end] === ',' && /\d/.test(s[end + 1] || ''))) return all;
    let start = at;
    if (sign && !(at === 0 || BEFORE.test(s[at - 1]))) { start = at + sign.length; sign = ''; }
    if (!(start === 0 || BEFORE.test(s[start - 1])) || !isPlain(start, end)) return all;
    return s.slice(at, start) + `$${sign.replace('−', '-')}${num.replace(/,/g, '{,}')}$`;
  });
}
