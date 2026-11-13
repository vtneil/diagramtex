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
  if (m && (m[2] || m[3])) return { neg: m[1] === '-', int: (m[2] || '0').replace(/^0+(?=\d)/, ''), frac: m[3] || '', exp: m[4] != null ? +m[4] : null, unc: null };
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

/** Rounds and lays out a number as the column asks: significant figures or decimal places, and an exponent
 *  as typed, always (scientific) or never (fixed). The uncertainty keeps its place against the last digit. */
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
    const shownExp = opt.exp === 'sci' ? mag : opt.exp === 'fixed' ? 0 : n.exp || 0;
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

/** The uncertainty as a plain number (for ±): 4 with 2 places → 0.04 */
function uncPlain(f: Formatted) {
  const u = f.unc || '0', places = f.frac.length;
  if (!places) return u;
  const p = u.padStart(places + 1, '0');
  return p.slice(0, p.length - places) + '.' + p.slice(p.length - places);
}
/** The number typeset as siunitx would print it, in TeX maths, split at the decimal marker for alignment:
 *  [left of the marker, the rest]. */
export function texParts(f: Formatted, unc: 'paren' | 'pm' = 'paren'): [string, string] {
  const left = `${f.neg ? '-' : ''}${f.int}`;
  let right = f.frac ? '.' + f.frac : '';
  if (f.unc) right += unc === 'pm' ? `\\pm ${uncPlain(f)}` : `(${f.unc})`;
  if (f.exp != null) right += `\\times 10^{${f.exp}}`;
  return [left, right];
}
/** For a cell: $…$ text of the formatted number (what the preview draws). */
export const mathText = (f: Formatted, unc: 'paren' | 'pm' = 'paren') => { const [a, b] = texParts(f, unc); return `$${a}${b}$`; };

/** siunitx table-format for a set of numbers: sign, integer digits, decimals, uncertainty and exponent digits. */
export function tableFormat(list: Formatted[]) {
  if (!list.length) return '';
  let sign = false, i = 1, d = 0, u = 0, e = 0, eSign = false, anyE = false;
  for (const f of list) {
    sign ||= f.neg; i = Math.max(i, f.int.length); d = Math.max(d, f.frac.length); u = Math.max(u, (f.unc || '').length);
    if (f.exp != null) { anyE = true; e = Math.max(e, String(Math.abs(f.exp)).length); eSign ||= f.exp < 0; }
  }
  return `${sign ? '-' : ''}${i}.${d}${u ? `(${u})` : ''}${anyE ? `e${eSign ? '-' : ''}${e}` : ''}`;
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
