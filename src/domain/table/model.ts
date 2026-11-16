// Table model: engine-independent. Import adapters build it, the LaTeX writer and the SVG renderer read it,
// and the editor changes it only through the operations below. Plain JSON (it is saved inside documents),
// rectangular (every row has every column), merges kept on their top-left cell.
//
// Cell text is LaTeX-flavoured, as everywhere in DiagramTeX: prose with $…$ maths and text commands
// (\textsc{…}). Characters that would break a table (& % # _ ^, a lone $, an unmatched brace) are escaped
// when it is written out, so they can be typed as they are.

export type HAlign = 'l' | 'c' | 'r' | 'j';
export type VAlign = 't' | 'm' | 'b';
export type Rule = 0 | 1 | 2 | 3; // none, thin, thick, double

export interface TCell {
  t: string;
  /** spans, on the top-left cell of a merge */
  rs?: number;
  cs?: number;
  b?: boolean; i?: boolean; u?: boolean; tt?: boolean;
  /** LaTeX size name, smaller or larger than the table's */
  sz?: string;
  al?: HAlign;
  va?: VAlign;
  /** #rrggbb */
  fg?: string;
  bg?: string;
  /** \multirow's own width (a LaTeX length, 4em), when the text wraps at it */
  mw?: string;
}
export interface TNum {
  /** significant figures (round-mode=figures) */
  sig?: number;
  /** decimal places (round-mode=places); used when sig is not set */
  dp?: number;
  /** 'input' keeps the exponent as typed; 'sci' always a × 10^n; 'fixed' never */
  exp?: 'input' | 'sci' | 'fixed';
  /** uncertainty written 1.23(4) or 1.23 ± 0.04 */
  unc?: 'paren' | 'pm';
}
export interface TCol {
  al: HAlign;
  /** cm; 0 = as wide as its widest cell (no wrapping) */
  w: number;
  /** tabularx: the column takes the rest of the width (X) */
  fill?: boolean;
  /** numbers aligned on the decimal marker (siunitx S column) */
  num?: TNum | null;
  /** siunitx unit for the column, shown after the header: kg, m/s, \kilo\gram */
  unit?: string;
}
export type Preset = 'booktabs' | 'grid' | 'minimal' | 'striped' | 'plain' | 'custom';
export interface TableModel {
  v: 1;
  cells: TCell[][];
  cols: TCol[];
  /** header rows (top); bold when headBold, repeated on every page by longtable */
  head: number;
  headBold: boolean;
  /** horizontal rules: (rows + 1) × cols; vertical rules: rows × (cols + 1) */
  hr: Rule[][];
  vr: Rule[][];
  /** the rules came from this preset (inserting rows keeps the pattern); 'custom' once edited by hand */
  preset: Preset;
  /** horizontal rules written with booktabs (\toprule, \midrule, \cmidrule) or \hline and \cline */
  booktabs: boolean;
  /** fill of every other body row (#rrggbb), or '' */
  stripe: string;
  /** the fill of the rows between the stripes (\rowcolors' other colour), or '' */
  stripe2: string;
  /** the first row the stripes start at; −1: the first body row */
  stripeFrom: number;
  /** footer rows (bottom); longtable writes them once, at the end (\endlastfoot) */
  foot: number;
  env: 'tabular' | 'tabularx' | 'longtable';
  /** tabularx width, as a share of \linewidth */
  width: number;
  /** a table float (caption, label, placement) */
  float: boolean;
  caption: string;
  label: string;
  capTop: boolean;
  place: 'center' | 'left' | 'right';
  /** the float's placement: htbp, h!, H… */
  floatPos: string;
  /** the tabular's own [t] / [b] (its baseline when set inline), or '' */
  tpos: '' | 't' | 'b';
  /** \arrayrulewidth in pt (LaTeX's 0.4) and \arrayrulecolor (#rrggbb or '') */
  ruleW: number;
  ruleColor: string;
  /** extra space after each row (\\[0.5ex]): a LaTeX length or '' */
  skip: string[];
  /** \tabcolsep in pt (LaTeX's 6) and \arraystretch */
  pad: number;
  stretch: number;
  size: string;
  unitStyle: 'paren' | 'bracket' | 'slash';
}

export const SIZES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large'];
const HEX = /^#[0-9a-f]{6}$/;

export function emptyCell(): TCell { return { t: '' }; }
export function newCol(): TCol { return { al: 'l', w: 0 }; }

export function create(rows = 3, cols = 3, preset: Preset = 'booktabs'): TableModel {
  const m: TableModel = {
    v: 1, cells: Array.from({ length: rows }, () => Array.from({ length: cols }, emptyCell)),
    cols: Array.from({ length: cols }, newCol), head: rows > 1 ? 1 : 0, headBold: false,
    hr: [], vr: [], preset, booktabs: true, stripe: '', stripe2: '', stripeFrom: -1, foot: 0, env: 'tabular', width: 1, float: false, caption: '', label: '',
    capTop: true, place: 'center', floatPos: 'htbp', tpos: '', ruleW: 0.4, ruleColor: '', skip: Array(rows).fill(''),
    pad: 6, stretch: 1, size: 'normalsize', unitStyle: 'paren',
  };
  applyPreset(m, preset);
  return m;
}

export const nRows = (m: TableModel) => m.cells.length;
export const nCols = (m: TableModel) => m.cols.length;
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- repair (untrusted JSON, any version)
const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? v as T : d);
const color = (v: unknown) => { const s = str(v).toLowerCase(); return HEX.test(s) ? s : undefined; };
export const MAX_ROWS = 2000, MAX_COLS = 200;

/** Makes any input a valid model: missing fields get defaults, wrong types are dropped, spans fit the grid. */
export function normalize(input: unknown): TableModel {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const rawCells: unknown[][] = Array.isArray(o.cells) ? o.cells.filter(Array.isArray).slice(0, MAX_ROWS) : [];
  const nc = int(Math.max(1, Array.isArray(o.cols) ? o.cols.length : 0, ...rawCells.map((r) => r.length)), 1, MAX_COLS, 1);
  const nr = Math.max(1, rawCells.length);
  const cell = (c: unknown): TCell => {
    const x = (c && typeof c === 'object' ? c : { t: typeof c === 'string' || typeof c === 'number' ? String(c) : '' }) as Record<string, any>;
    const out: TCell = { t: str(x.t) };
    if (x.rs > 1) out.rs = int(x.rs, 1, MAX_ROWS, 1);
    if (x.cs > 1) out.cs = int(x.cs, 1, MAX_COLS, 1);
    for (const k of ['b', 'i', 'u', 'tt'] as const) if (x[k]) out[k] = true;
    if (SIZES.includes(x.sz)) out.sz = x.sz;
    if (['l', 'c', 'r', 'j'].includes(x.al)) out.al = x.al;
    if (['t', 'm', 'b'].includes(x.va)) out.va = x.va;
    const fg = color(x.fg), bg = color(x.bg);
    if (fg) out.fg = fg;
    if (bg) out.bg = bg;
    if (typeof x.mw === 'string' && lenPt(x.mw) != null) out.mw = x.mw.trim();
    return out;
  };
  const cells = Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => cell((rawCells[r] || [])[c])));
  const cols = Array.from({ length: nc }, (_, c): TCol => {
    const x = (Array.isArray(o.cols) && o.cols[c] && typeof o.cols[c] === 'object' ? o.cols[c] : {}) as Record<string, any>;
    const col: TCol = { al: oneOf(x.al, ['l', 'c', 'r', 'j'] as const, 'l'), w: num(x.w, 0, 100, 0) };
    if (x.fill) col.fill = true;
    if (x.num && typeof x.num === 'object') {
      const n: TNum = {};
      if (x.num.sig != null) n.sig = int(x.num.sig, 1, 15, 3);
      if (x.num.dp != null) n.dp = int(x.num.dp, 0, 12, 2);
      if (x.num.exp) n.exp = oneOf(x.num.exp, ['input', 'sci', 'fixed'] as const, 'input');
      if (x.num.unc) n.unc = oneOf(x.num.unc, ['paren', 'pm'] as const, 'paren');
      col.num = n;
    }
    if (typeof x.unit === 'string' && x.unit.trim()) col.unit = x.unit.trim();
    return col;
  });
  const grid = (raw: unknown, h: number, w: number): Rule[][] => Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => {
    const v = Array.isArray(raw) && Array.isArray(raw[r]) ? Number(raw[r][c]) : 0;
    return (v === 1 || v === 2 || v === 3 ? v : 0) as Rule;
  }));
  const m: TableModel = {
    v: 1, cells, cols, head: int(o.head, 0, nr, 0), headBold: !!o.headBold,
    hr: grid(o.hr, nr + 1, nc), vr: grid(o.vr, nr, nc + 1),
    preset: oneOf(o.preset, ['booktabs', 'grid', 'minimal', 'striped', 'plain', 'custom'] as const, 'custom'),
    booktabs: o.booktabs !== false, stripe: color(o.stripe) || '', stripe2: color(o.stripe2) || '', stripeFrom: int(o.stripeFrom, -1, nr, -1),
    foot: int(o.foot, 0, nr, 0), env: oneOf(o.env, ['tabular', 'tabularx', 'longtable'] as const, 'tabular'),
    width: num(o.width, 0.1, 1, 1), float: !!o.float, caption: str(o.caption), label: str(o.label), capTop: o.capTop !== false,
    place: oneOf(o.place, ['center', 'left', 'right'] as const, 'center'),
    floatPos: typeof o.floatPos === 'string' && /^[htbpH!]{1,5}$/.test(o.floatPos) ? o.floatPos : 'htbp', tpos: oneOf(o.tpos, ['', 't', 'b'] as const, ''),
    ruleW: num(o.ruleW, 0.1, 5, 0.4), ruleColor: color(o.ruleColor) || '',
    skip: Array.from({ length: nr }, (_, r) => (Array.isArray(o.skip) && typeof o.skip[r] === 'string' && lenPt(o.skip[r]) != null ? o.skip[r].trim() : '')),
    pad: num(o.pad, 0, 30, 6), stretch: num(o.stretch, 0.5, 4, 1),
    size: SIZES.includes(o.size) ? o.size : 'normalsize', unitStyle: oneOf(o.unitStyle, ['paren', 'bracket', 'slash'] as const, 'paren'),
  };
  m.foot = Math.min(m.foot, nr - m.head);
  fixSpans(m);
  if (!Array.isArray(o.hr) && m.preset !== 'custom') applyPreset(m, m.preset);
  return m;
}

/** A LaTeX length in pt (0.5ex, 6pt, 0.5mm, 4em at 10pt), or null when it isn't one. */
export function lenPt(v: string): number | null {
  const m = /^\s*(-?[\d.]+)\s*(pt|mm|cm|in|em|ex|bp|pc)\s*$/.exec(String(v));
  if (!m || !Number.isFinite(+m[1])) return null;
  return +m[1] * ({ pt: 1, mm: 2.845, cm: 28.45, in: 72.27, em: 10, ex: 4.31, bp: 1.00375, pc: 12 } as Record<string, number>)[m[2]];
}
/** The thick rule's width in pt: 0.8, or twice the thin one when that is wider. */
export const thickPt = (m: TableModel) => Math.max(0.8, 2 * m.ruleW);

/** Spans fit inside the grid and never overlap: a later merge that would cross an earlier one is cut back. */
export function fixSpans(m: TableModel) {
  const nr = nRows(m), nc = nCols(m), taken: boolean[][] = Array.from({ length: nr }, () => Array(nc).fill(false));
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const x = m.cells[r][c];
    if (taken[r][c]) { delete x.rs; delete x.cs; continue; }
    let rs = Math.min(x.rs || 1, nr - r), cs = Math.min(x.cs || 1, nc - c);
    // shrink until the block is free
    for (let k = 1; k < cs; k++) if (taken[r][c + k]) { cs = k; break; }
    outer: for (let j = 1; j < rs; j++) for (let k = 0; k < cs; k++) if (taken[r + j][c + k]) { rs = j; break outer; }
    if (rs > 1) x.rs = rs; else delete x.rs;
    if (cs > 1) x.cs = cs; else delete x.cs;
    for (let j = 0; j < rs; j++) for (let k = 0; k < cs; k++) taken[r + j][c + k] = true;
  }
}

/** For every position, the top-left cell that covers it: [r, c] of the anchor. */
export function owners(m: TableModel): [number, number][][] {
  const nr = nRows(m), nc = nCols(m), own: [number, number][][] = Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => [r, c] as [number, number]));
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const x = m.cells[r][c], rs = x.rs || 1, cs = x.cs || 1;
    if (rs === 1 && cs === 1) continue;
    if (own[r][c][0] !== r || own[r][c][1] !== c) continue; // itself covered (cannot happen after fixSpans)
    for (let j = 0; j < rs; j++) for (let k = 0; k < cs; k++) own[r + j][c + k] = [r, c];
  }
  return own;
}

// ---------------------------------------------------------------- ranges
export interface Range { r0: number; c0: number; r1: number; c1: number }
export const rangeOf = (a: [number, number], b: [number, number]): Range => ({ r0: Math.min(a[0], b[0]), c0: Math.min(a[1], b[1]), r1: Math.max(a[0], b[0]), c1: Math.max(a[1], b[1]) });
/** Grows a range until no merge crosses its edge. */
export function expand(m: TableModel, g: Range): Range {
  const own = owners(m), out = { ...g };
  for (let changed = true; changed;) {
    changed = false;
    for (let r = out.r0; r <= out.r1; r++) for (let c = out.c0; c <= out.c1; c++) {
      const [ar, ac] = own[r][c], x = m.cells[ar][ac], er = ar + (x.rs || 1) - 1, ec = ac + (x.cs || 1) - 1;
      if (ar < out.r0) { out.r0 = ar; changed = true; }
      if (ac < out.c0) { out.c0 = ac; changed = true; }
      if (er > out.r1) { out.r1 = er; changed = true; }
      if (ec > out.c1) { out.c1 = ec; changed = true; }
    }
  }
  return out;
}
/** The anchors (top-left cells) inside a range. */
export function anchorsIn(m: TableModel, g: Range): TCell[] {
  const own = owners(m), out: TCell[] = [];
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (own[r][c][0] === r && own[r][c][1] === c) out.push(m.cells[r][c]);
  return out;
}

// ---------------------------------------------------------------- structure
/** Inserts n rows before row `at`. Merges that straddle the place grow; rules follow the preset, or copy the row above. */
export function insertRows(m: TableModel, at: number, n = 1) {
  const nc = nCols(m), own = owners(m);
  const grow = new Set<TCell>();
  if (at > 0 && at < nRows(m)) for (let c = 0; c < nc; c++) { const [ar, ac] = own[at][c]; if (ar < at) grow.add(m.cells[ar][ac]); }
  for (const x of grow) x.rs = (x.rs || 1) + n;
  const tmpl = m.cells[Math.min(Math.max(at - 1, 0), nRows(m) - 1)];
  const rows = Array.from({ length: n }, () => tmpl.map((x) => { const y: TCell = { t: '' }; for (const k of ['b', 'i', 'u', 'tt', 'sz', 'al', 'va', 'fg', 'bg'] as const) if (x[k] !== undefined) (y as any)[k] = x[k]; return y; }));
  m.cells.splice(at, 0, ...rows);
  const nr0 = nRows(m) - n;
  if (at <= m.head && at > 0 && at < m.head + 1 && at !== m.head) m.head += n; // inside the header
  else if (at < m.head) m.head += n;
  else if (m.foot && at > nr0 - m.foot) m.foot += n; // inside the footer, or after it (the footer is the bottom rows)
  m.skip.splice(at, 0, ...Array(n).fill(''));
  const hrRow = (m.hr[at] || []).map(() => 0 as Rule);
  m.hr.splice(at + 1, 0, ...Array.from({ length: n }, () => hrRow.slice()));
  const vrRow = (m.vr[Math.min(Math.max(at - 1, 0), m.vr.length - 1)] || Array(nc + 1).fill(0)).slice() as Rule[];
  m.vr.splice(at, 0, ...Array.from({ length: n }, () => vrRow.slice()));
  restyle(m);
}
export function deleteRows(m: TableModel, r0: number, r1: number) {
  const nr = nRows(m);
  if (r1 - r0 + 1 >= nr) return false;
  const own = owners(m), nc = nCols(m);
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    if (own[r][c][0] !== r || own[r][c][1] !== c) continue;
    const x = m.cells[r][c], rs = x.rs || 1, end = r + rs - 1;
    if (end < r0 || r > r1) continue;
    const cut = Math.min(end, r1) - Math.max(r, r0) + 1;
    if (r >= r0) {
      // the anchor goes: the rest of the merge (below the cut) gets the text and the remaining span
      if (end > r1) { const y = m.cells[r1 + 1][c]; Object.assign(y, { ...x, rs: rs - cut }); if (y.rs! <= 1) delete y.rs; }
    } else { x.rs = rs - cut; if (x.rs <= 1) delete x.rs; }
  }
  m.cells.splice(r0, r1 - r0 + 1);
  m.hr.splice(r0 + 1, r1 - r0 + 1);
  m.vr.splice(r0, r1 - r0 + 1);
  m.skip.splice(r0, r1 - r0 + 1);
  const f0 = nr - m.foot; // the footer's first row
  m.foot -= Math.max(0, r1 - Math.max(r0, f0) + 1);
  m.head = m.head > r1 ? m.head - (r1 - r0 + 1) : Math.min(m.head, r0);
  fixSpans(m);
  restyle(m);
  return true;
}
export function insertCols(m: TableModel, at: number, n = 1) {
  const nr = nRows(m), own = owners(m), grow = new Set<TCell>();
  if (at > 0 && at < nCols(m)) for (let r = 0; r < nr; r++) { const [ar, ac] = own[r][at]; if (ac < at) grow.add(m.cells[ar][ac]); }
  for (const x of grow) x.cs = (x.cs || 1) + n;
  const src = Math.min(Math.max(at - 1, 0), nCols(m) - 1);
  for (let r = 0; r < nr; r++) {
    const x = m.cells[r][src];
    m.cells[r].splice(at, 0, ...Array.from({ length: n }, () => { const y: TCell = { t: '' }; for (const k of ['b', 'i', 'u', 'tt', 'sz', 'va', 'fg', 'bg'] as const) if (x[k] !== undefined) (y as any)[k] = x[k]; return y; }));
    m.vr[r].splice(at + 1, 0, ...Array(n).fill(0));
  }
  for (const row of m.hr) row.splice(at, 0, ...Array(n).fill(row[src] ?? 0));
  m.cols.splice(at, 0, ...Array.from({ length: n }, () => ({ ...newCol(), al: m.cols[src]?.al || 'l' } as TCol)));
  restyle(m);
}
export function deleteCols(m: TableModel, c0: number, c1: number) {
  const nc = nCols(m);
  if (c1 - c0 + 1 >= nc) return false;
  const own = owners(m), nr = nRows(m);
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    if (own[r][c][0] !== r || own[r][c][1] !== c) continue;
    const x = m.cells[r][c], cs = x.cs || 1, end = c + cs - 1;
    if (end < c0 || c > c1) continue;
    const cut = Math.min(end, c1) - Math.max(c, c0) + 1;
    if (c >= c0) {
      if (end > c1) { const y = m.cells[r][c1 + 1]; Object.assign(y, { ...x, cs: cs - cut }); if (y.cs! <= 1) delete y.cs; }
    } else { x.cs = cs - cut; if (x.cs <= 1) delete x.cs; }
  }
  for (const row of m.cells) row.splice(c0, c1 - c0 + 1);
  for (const row of m.hr) row.splice(c0, c1 - c0 + 1);
  for (const row of m.vr) row.splice(c0 + 1, c1 - c0 + 1);
  m.cols.splice(c0, c1 - c0 + 1);
  fixSpans(m);
  restyle(m);
  return true;
}
/** Moves rows r0..r1 by d (−1 up, +1 down) when no merge crosses the block's edges. */
export function moveRows(m: TableModel, r0: number, r1: number, d: -1 | 1) {
  const to = d < 0 ? r0 - 1 : r1 + 1;
  if (to < 0 || to >= nRows(m)) return false;
  // the block and the row it swaps with must each be whole: no merge reaches out of either
  const whole = (a: number, z: number) => { const g = expand(m, { r0: a, c0: 0, r1: z, c1: nCols(m) - 1 }); return g.r0 === a && g.r1 === z; };
  if (!whole(r0, r1) || !whole(to, to)) return false;
  const rows = m.cells.splice(r0, r1 - r0 + 1), vr = m.vr.splice(r0, r1 - r0 + 1), sk = m.skip.splice(r0, r1 - r0 + 1);
  m.cells.splice(r0 + d, 0, ...rows); m.vr.splice(r0 + d, 0, ...vr); m.skip.splice(r0 + d, 0, ...sk);
  fixSpans(m);
  restyle(m);
  return true;
}
export function moveCols(m: TableModel, c0: number, c1: number, d: -1 | 1) {
  const to = d < 0 ? c0 - 1 : c1 + 1;
  if (to < 0 || to >= nCols(m)) return false;
  const whole = (a: number, z: number) => { const g = expand(m, { r0: 0, c0: a, r1: nRows(m) - 1, c1: z }); return g.c0 === a && g.c1 === z; };
  if (!whole(c0, c1) || !whole(to, to)) return false;
  for (const row of m.cells) { const part = row.splice(c0, c1 - c0 + 1); row.splice(c0 + d, 0, ...part); }
  const cols = m.cols.splice(c0, c1 - c0 + 1); m.cols.splice(c0 + d, 0, ...cols);
  for (const row of m.hr) { const part = row.splice(c0, c1 - c0 + 1); row.splice(c0 + d, 0, ...part); }
  fixSpans(m);
  restyle(m);
  return true;
}

/** Merges a range into its top-left cell; the texts of the others are kept, joined with spaces. */
export function merge(m: TableModel, g0: Range) {
  const g = expand(m, g0);
  if (g.r0 === g.r1 && g.c0 === g.c1) return false;
  const texts: string[] = [];
  for (const x of anchorsIn(m, g)) if (x.t.trim()) texts.push(x.t.trim());
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
    if (r === g.r0 && c === g.c0) continue;
    const x = m.cells[r][c]; x.t = ''; delete x.rs; delete x.cs;
  }
  const a = m.cells[g.r0][g.c0];
  // repeated labels (a group name on every row, as spreadsheets export them) merge into one
  a.t = [...new Set(texts)].join(' ');
  if (g.r1 > g.r0) a.rs = g.r1 - g.r0 + 1; else delete a.rs;
  if (g.c1 > g.c0) a.cs = g.c1 - g.c0 + 1; else delete a.cs;
  if (g.c1 > g.c0 && !a.al) a.al = 'c'; // a cell over several columns is centred, as \multicolumn usually is
  restyle(m);
  return true;
}
export function split(m: TableModel, g: Range) {
  let any = false;
  const own = owners(m);
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
    const [ar, ac] = own[r][c], x = m.cells[ar][ac];
    if (x.rs || x.cs) {
      for (let j = 0; j < (x.rs || 1); j++) for (let k = 0; k < (x.cs || 1); k++) if (j || k) {
        const y = m.cells[ar + j][ac + k];
        for (const key of ['b', 'i', 'u', 'tt', 'sz', 'va', 'fg', 'bg'] as const) if (x[key] !== undefined) (y as any)[key] = x[key];
      }
      delete x.rs; delete x.cs; any = true;
    }
  }
  if (any) restyle(m);
  return any;
}

// ---------------------------------------------------------------- styles and rules
export type CellPatch = Partial<Omit<TCell, 't' | 'rs' | 'cs'>>;
/** Sets (or, with undefined, clears) style fields on every cell of a range, covered cells included. */
export function styleRange(m: TableModel, g: Range, patch: CellPatch) {
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
    const x = m.cells[r][c] as Record<string, any>;
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === false || v === '') delete x[k]; else x[k] = v; }
  }
}
export function clearRange(m: TableModel, g: Range, what: 'text' | 'format' | 'all') {
  for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
    const x = m.cells[r][c];
    if (what !== 'format') x.t = '';
    if (what !== 'text') for (const k of ['b', 'i', 'u', 'tt', 'sz', 'al', 'va', 'fg', 'bg'] as const) delete x[k];
  }
}
export type BorderWhere = 'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'innerH' | 'innerV' | 'none';
/** Sets rules around or inside a range. 'none' clears every rule touching it. The table becomes 'custom'. */
export function setBorders(m: TableModel, g: Range, where: BorderWhere, w: Rule) {
  const H = (r: number, c: number, v: Rule) => { m.hr[r][c] = v; };
  const V = (r: number, c: number, v: Rule) => { m.vr[r][c] = v; };
  const v = where === 'none' ? 0 : w;
  for (let c = g.c0; c <= g.c1; c++) {
    if (['all', 'outer', 'top', 'none'].includes(where)) H(g.r0, c, v as Rule);
    if (['all', 'outer', 'bottom', 'none'].includes(where)) H(g.r1 + 1, c, v as Rule);
    if (['all', 'inner', 'innerH', 'none'].includes(where)) for (let r = g.r0 + 1; r <= g.r1; r++) H(r, c, v as Rule);
  }
  for (let r = g.r0; r <= g.r1; r++) {
    if (['all', 'outer', 'left', 'none'].includes(where)) V(r, g.c0, v as Rule);
    if (['all', 'outer', 'right', 'none'].includes(where)) V(r, g.c1 + 1, v as Rule);
    if (['all', 'inner', 'innerV', 'none'].includes(where)) for (let c = g.c0 + 1; c <= g.c1; c++) V(r, c, v as Rule);
  }
  m.preset = 'custom';
}

export const PRESETS: { key: Exclude<Preset, 'custom'>; name: string; title: string }[] = [
  { key: 'booktabs', name: 'Academic', title: 'booktabs: a heavy rule on top and at the bottom, a light one under the header, no vertical rules' },
  { key: 'minimal', name: 'Minimal', title: 'A rule under the header only' },
  { key: 'grid', name: 'Grid', title: 'Every cell boxed, the header in bold' },
  { key: 'striped', name: 'Striped', title: 'Every other row shaded, a rule under the header, the header in bold' },
  { key: 'plain', name: 'Plain', title: 'No rules at all' },
];
/** Rules, stripes and header weight of a preset, for the table's current size and merges. */
export function applyPreset(m: TableModel, p: Preset) {
  const nr = nRows(m), nc = nCols(m), h = Math.min(m.head, nr);
  m.hr = Array.from({ length: nr + 1 }, () => Array(nc).fill(0));
  m.vr = Array.from({ length: nr }, () => Array(nc + 1).fill(0));
  m.preset = p;
  if (p === 'custom') return;
  if (p !== 'striped') { m.stripe2 = ''; m.stripeFrom = -1; }
  const full = (r: number, w: Rule) => { for (let c = 0; c < nc; c++) m.hr[r][c] = w; };
  m.booktabs = p === 'booktabs';
  m.stripe = p === 'striped' ? (m.stripe || '#eef2f7') : '';
  m.headBold = p === 'grid' || p === 'striped';
  if (p === 'booktabs') {
    full(0, 2); full(nr, 2);
    if (h > 0 && h < nr) full(h, 1);
    // a group heading over several columns gets a short rule under it (\cmidrule), as in a two-level header
    const own = owners(m);
    for (let r = 0; r < h - 1; r++) for (let c = 0; c < nc; c++) {
      const [ar, ac] = own[r][c], x = m.cells[ar][ac];
      if ((x.cs || 1) > 1 && ar + (x.rs || 1) - 1 === r && x.t.trim()) m.hr[r + 1][c] = 1;
    }
  } else if (p === 'grid') {
    for (let r = 0; r <= nr; r++) full(r, 1);
    for (const row of m.vr) row.fill(1);
  } else if (p === 'minimal' || p === 'striped') {
    if (h > 0 && h < nr) full(h, 1);
    if (p === 'striped') { full(0, 1); full(nr, 1); }
  }
  // Every preset must leave the interior of merged cells free of rules,
  // including a header rule crossed by a vertical merge.
  const own = owners(m);
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const [ar, ac] = own[r][c];
    if (ar < r) m.hr[r][c] = 0;
    if (ac < c) m.vr[r][c] = 0;
  }
}
/** After a structural change, a preset table gets its pattern again (a custom one keeps its rules). */
export function restyle(m: TableModel) {
  m.head = Math.min(m.head, nRows(m));
  m.foot = Math.max(0, Math.min(m.foot, nRows(m) - m.head));
  if (m.skip.length !== nRows(m)) m.skip = Array.from({ length: nRows(m) }, (_, r) => m.skip[r] || '');
  if (m.preset !== 'custom') { const keepStripe = m.stripe; applyPreset(m, m.preset); if (m.preset === 'striped' && keepStripe) m.stripe = keepStripe; }
  else {
    // rules inside a merged cell can't be drawn
    const own = owners(m);
    for (let r = 0; r < nRows(m); r++) for (let c = 0; c < nCols(m); c++) {
      const [ar, ac] = own[r][c];
      if (ar < r) m.hr[r][c] = 0;
      if (ac < c) m.vr[r][c] = 0;
    }
  }
}

/** The fill a body row gets from the stripes (null when none). */
export const stripeOf = (m: TableModel, r: number) => {
  const from = m.stripeFrom < 0 ? m.head : m.stripeFrom;
  if (r < from || (!m.stripe && !m.stripe2)) return null;
  return ((r - from) % 2 === 1 ? m.stripe : m.stripe2) || null;
};
/** Whether a cell is drawn bold: its own flag, or the header's. */
export const isBold = (m: TableModel, r: number, x: TCell) => !!x.b || (m.headBold && r < m.head);
/** The alignment a cell is drawn with. */
export const alignOf = (m: TableModel, c: number, x: TCell): HAlign => x.al || (m.cols[c] ? m.cols[c].al : 'l');

/** A1-style names: column letters, as spreadsheets show them. */
export function colName(c: number) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const cellName = (r: number, c: number) => colName(c) + (r + 1);

/** The plain text of a table, a row per line and cells split by tabs (what spreadsheets copy). */
export function toTsv(m: TableModel, g?: Range) {
  const R = g || { r0: 0, c0: 0, r1: nRows(m) - 1, c1: nCols(m) - 1 }, out: string[] = [];
  for (let r = R.r0; r <= R.r1; r++) {
    const line: string[] = [];
    for (let c = R.c0; c <= R.c1; c++) {
      const t = m.cells[r][c].t;
      line.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    }
    out.push(line.join('\t'));
  }
  return out.join('\n');
}

/** A sub-table (for copy and paste): the cells of a range with their spans cut to it. */
export function slice(m: TableModel, g: Range): TableModel {
  const t = clone(m);
  t.cells = m.cells.slice(g.r0, g.r1 + 1).map((row) => clone(row.slice(g.c0, g.c1 + 1)));
  t.cols = clone(m.cols.slice(g.c0, g.c1 + 1));
  t.hr = m.hr.slice(g.r0, g.r1 + 2).map((row) => row.slice(g.c0, g.c1 + 1)) as Rule[][];
  t.vr = m.vr.slice(g.r0, g.r1 + 1).map((row) => row.slice(g.c0, g.c1 + 2)) as Rule[][];
  t.head = Math.max(0, Math.min(m.head - g.r0, g.r1 - g.r0 + 1));
  t.skip = m.skip.slice(g.r0, g.r1 + 1);
  t.foot = Math.max(0, Math.min(m.foot - (nRows(m) - 1 - g.r1), g.r1 - g.r0 + 1 - t.head));
  fixSpans(t);
  return t;
}
/** Pastes a table at (r, c): text, styles and merges; the table grows to fit. Columns' number formats come along
 *  when whole columns are pasted. */
export function pasteAt(m: TableModel, src: TableModel, r: number, c: number, opts: { styles?: boolean } = {}) {
  const h = nRows(src), w = nCols(src);
  if (r + h > nRows(m)) insertRows(m, nRows(m), r + h - nRows(m));
  if (c + w > nCols(m)) insertCols(m, nCols(m), c + w - nCols(m));
  // anything merged across the target is split first
  split(m, expand(m, { r0: r, c0: c, r1: r + h - 1, c1: c + w - 1 }));
  for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
    const s = src.cells[j][k], d = m.cells[r + j][c + k];
    if (opts.styles === false) { d.t = s.t; delete d.rs; delete d.cs; if (s.rs) d.rs = s.rs; if (s.cs) d.cs = s.cs; continue; }
    for (const key of Object.keys(d)) delete (d as any)[key];
    Object.assign(d, clone(s));
  }
  fixSpans(m);
  restyle(m);
  return { r0: r, c0: c, r1: r + h - 1, c1: c + w - 1 } as Range;
}

/** Old Document view tables: { rows: string[][], header, borders: 'all' | 'header' | 'none', colAlign }. */
export function fromLegacy(b: { rows?: unknown; header?: unknown; borders?: unknown; colAlign?: unknown }): TableModel {
  const rows = Array.isArray(b.rows) ? (b.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? '')) : [])) : [['']];
  const nc = Math.max(1, ...rows.map((r) => r.length));
  const m = create(Math.max(1, rows.length), nc, 'plain');
  rows.forEach((row, r) => row.forEach((t, c) => { m.cells[r][c].t = t; }));
  const al = (['l', 'c', 'r'].includes(String(b.colAlign)) ? b.colAlign : 'c') as HAlign;
  for (const col of m.cols) col.al = al;
  m.head = b.header !== false && rows.length > 1 ? 1 : 0;
  m.headBold = m.head > 0;
  m.booktabs = false;
  if (b.borders === 'all' || b.borders === undefined) { applyPreset(m, 'grid'); m.headBold = m.head > 0; }
  else if (b.borders === 'header') {
    applyPreset(m, 'custom');
    const nr = nRows(m);
    for (let c = 0; c < nc; c++) { m.hr[0][c] = 1; m.hr[nr][c] = 1; if (m.head && m.head < nr) m.hr[m.head][c] = 1; }
    m.preset = 'custom';
  } else applyPreset(m, 'plain');
  m.booktabs = false;
  m.headBold = m.head > 0;
  return m;
}
