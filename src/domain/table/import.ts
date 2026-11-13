// Import adapters: text and files in, a TableModel out. Everything runs here in the browser; HTML is read
// with DOMParser (no scripts run, nothing loads), XLSX is unzipped with the browser's own inflate.
import type { TableModel, TCell, HAlign, Rule, VAlign } from './model';
import { create, normalize, nRows, nCols, applyPreset, fixSpans, owners, PRESETS, clone, lenPt } from './model';
import { plainWithMath } from './latex';
import { looksNumeric, parseNum } from './numbers';
import { runtime as TD } from '../../runtime';

export type Format = 'csv' | 'tsv' | 'markdown' | 'html' | 'latex' | 'xlsx';
export interface ImportResult { table: TableModel; format: Format; warnings: string[] }

// ---------------------------------------------------------------- grid → model
/** Builds a model from a grid of cells (already LaTeX text), filling ragged rows. */
function fromCells(grid: TCell[][], opts: { head?: number } = {}): TableModel {
  const nc = Math.max(1, ...grid.map((r) => r.length)), nr = Math.max(1, grid.length);
  const m = create(nr, nc, 'booktabs');
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) m.cells[r][c] = (grid[r] && grid[r][c]) || { t: '' };
  m.head = opts.head ?? guessHead(m);
  fixSpans(m);
  autoColumns(m);
  applyPreset(m, 'booktabs');
  return m;
}
/** One header row when the first row is text over columns of numbers, or when every first-row cell is text and
 *  shorter rows follow; none for a single row. */
function guessHead(m: TableModel) {
  if (nRows(m) < 2) return 0;
  const first = m.cells[0], rest = m.cells.slice(1);
  const numCols = m.cols.map((_, c) => looksNumeric(rest.map((r) => r[c].t)));
  if (numCols.some((n, c) => n && first[c].t.trim() && !parseNum(first[c].t))) return 1;
  // text everywhere: a header when the first row has no empty cells and no numbers
  return first.every((x) => x.t.trim() && !parseNum(x.t)) ? 1 : 0;
}
/** Columns of numbers are right-aligned (decimal alignment is one click: Number format). */
function autoColumns(m: TableModel) {
  m.cols.forEach((col, c) => {
    const body = m.cells.slice(m.head).map((r) => r[c].t);
    if (looksNumeric(body)) col.al = 'r';
  });
}
const trimGrid = (rows: string[][]) => {
  // empty rows and columns at the end are what spreadsheets add
  while (rows.length && rows[rows.length - 1].every((x) => !x.trim())) rows.pop();
  let w = Math.max(0, ...rows.map((r) => r.length));
  while (w > 0 && rows.every((r) => !(r[w - 1] || '').trim())) w--;
  return rows.map((r) => r.slice(0, w));
};

// ---------------------------------------------------------------- CSV / TSV
/** RFC 4180: quoted fields hold delimiters, newlines and doubled quotes. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
      continue;
    }
    if (c === '"' && !cur.trim()) { q = true; cur = ''; continue; }
    if (c === delim) { row.push(cur); cur = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return trimGrid(rows);
}
/** The delimiter that splits most lines into the same number of fields. */
export function guessDelimiter(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ',', score = -1;
  for (const d of ['\t', ',', ';', '|']) {
    const counts = lines.map((l) => parseDelimited(l, d)[0]?.length || 0);
    if (!counts.length || counts[0] < 2) continue;
    const same = counts.filter((n) => n === counts[0]).length;
    const sc = same * 100 + counts[0] + (d === '\t' ? 50 : 0);
    if (sc > score) { score = sc; best = d; }
  }
  return best;
}
const textCell = (t: string): TCell => ({ t: plainWithMath(t.trim()) });
export function fromDelimited(text: string, delim = guessDelimiter(text)) {
  return fromCells(parseDelimited(text, delim).map((r) => r.map(textCell)));
}

// ---------------------------------------------------------------- Markdown
// maths ($…$) is kept as typed: the emphasis marks below must not reach into it
const mdInline = (t: string) => { const keep: string[] = []; return mdMarks(plainWithMath(t).replace(/(?<!\\)\$(?:\\.|[^$\\])*?(?<!\\)\$/g, (m) => `\u0001${keep.push(m) - 1}\u0002`)).replace(/\u0001(\d+)\u0002/g, (_, k) => keep[+k]); };
const mdMarks = (t: string) => t
  .replace(/\\textasciitilde\{\}\\textasciitilde\{\}(.+?)\\textasciitilde\{\}\\textasciitilde\{\}/g, '$1')
  .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `\\textbf{${a ?? b}}`)
  .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)|(^|\W)\\_(?!\s)(.+?)\\_(?!\w)/g, (_, p1, a, p2, b) => `${p1 ?? p2}\\textit{${a ?? b}}`)
  .replace(/`([^`]+)`/g, '\\texttt{$1}')
  .replace(/<br\s*\/?>/gi, '\n');
function mdSplit(line: string) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '', code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') code = !code;
    if (c === '|' && !code) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
const MD_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** The lines that can hold a table: fenced code emptied out, blockquote marks taken off. */
const mdLines = (text: string) => {
  let fence = '';
  return text.split(/\r?\n/).map((l) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l.replace(/^\s{0,3}(>\s?)+/, ''));
    if (f) { if (!fence) { fence = f[1][0]; return ''; } if (f[1][0] === fence) { fence = ''; return ''; } }
    return fence ? '' : l.replace(/^\s{0,3}(>\s?)+/, '');
  });
};
/** The first GFM table in a text: a header line with pipes, its |---| line, then the rows up to a blank or pipe-less line. */
function mdBlock(text: string): { lines: string[]; sep: number } | null {
  const L = mdLines(text);
  for (let i = 1; i < L.length; i++) {
    if (!MD_SEP.test(L[i]) || !L[i].includes('-') || !L[i - 1].includes('|') || !L[i - 1].trim()) continue;
    if (!L[i].includes('|') && mdSplit(L[i - 1]).length > 1) continue; // "a | b" over "---": a heading rule, not a table
    let j = i + 1;
    while (j < L.length && L[j].trim() && L[j].includes('|') && !(MD_SEP.test(L[j]) && j + 1 < L.length && MD_SEP.test(L[j + 1]))) j++;
    return { lines: [L[i - 1], L[i], ...L.slice(i + 1, j)], sep: 1 };
  }
  return null;
}
export const isMarkdown = (text: string) => mdBlock(text) != null;
export function fromMarkdown(text: string) {
  const blk = mdBlock(text);
  if (!blk) throw new Error('No Markdown table (a header row, then a |---|---| line)');
  const head = mdSplit(blk.lines[0]), n = head.length;
  // :--- left, :---: centre, ---: right; a plain --- leaves the column's own guess (numbers on the right)
  const aligns: (HAlign | null)[] = mdSplit(blk.lines[1]).map((x) => (x.startsWith(':') && x.endsWith(':') ? 'c' : x.endsWith(':') ? 'r' : x.startsWith(':') ? 'l' : null));
  // GFM: every row has the header's cells, the extra ones dropped and the missing ones empty
  const rows = [head, ...blk.lines.slice(2).map(mdSplit)].map((r) => Array.from({ length: n }, (_, k) => r[k] ?? ''));
  const m = fromCells(rows.map((r) => r.map((t) => { const x: TCell = { t: mdInline(t) }; liftWhole(x); return x; })), { head: 1 });
  aligns.forEach((a, c) => { if (a && m.cols[c]) m.cols[c].al = a; });
  return m;
}

// ---------------------------------------------------------------- HTML (and what spreadsheets put on the clipboard)
const cssColor = (v: string | null | undefined): string | undefined => {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return '#' + m[1];
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(s);
  if (m) { if (m[4] != null && +m[4] === 0) return undefined; return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join(''); }
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', maroon: '#800000', orange: '#ffa500', purple: '#800080', teal: '#008080' };
  return named[s];
};
/** A CSS border declaration's weight: none, thin or thick. */
const borderW = (v: string | null | undefined): Rule => {
  if (!v) return 0;
  const s = v.toLowerCase();
  if (/none|hidden/.test(s) || /^0(px|pt)?\b/.test(s.trim())) return 0;
  const w = /([\d.]+)\s*(px|pt)/.exec(s);
  const px = w ? (+w[1]) * (w[2] === 'pt' ? 4 / 3 : 1) : /thick|medium/.test(s) ? 2 : 1;
  if (/double/.test(s)) return 2;
  return px >= 1.9 ? 2 : 1;
};
export const isHtml = (text: string) => /<table[\s>]/i.test(text);
/** Text of an element as LaTeX: inline bold/italic/underline/code become commands, <br> a newline. */
function htmlText(el: Node, whole: { b: boolean; i: boolean; u: boolean }): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += plainWithMath((n.textContent || '').replace(/[\s ]+/g, (w) => (w.includes('\n') ? ' ' : w.replace(/ /g, ' ')))); return; }
    if (n.nodeType !== 1) return;
    const e = n as HTMLElement, tag = e.tagName.toLowerCase();
    if (tag === 'br') { out += '\n'; return; }
    if (tag === 'style' || tag === 'script') return;
    const inner = htmlText(e, whole);
    if (!inner.trim()) { out += inner; return; }
    const st = e.getAttribute('style') || '';
    const bold = tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/i.test(st);
    const ital = tag === 'i' || tag === 'em' || /font-style:\s*italic/i.test(st);
    const und = tag === 'u' || /text-decoration[^;]*underline/i.test(st);
    let s = inner;
    if (tag === 'code' || tag === 'tt') s = `\\texttt{${s}}`;
    if (tag === 'sup') s = `\\textsuperscript{${s}}`;
    if (tag === 'sub') s = `\\textsubscript{${s}}`;
    if (und) s = `\\underline{${s}}`;
    if (ital) s = `\\textit{${s}}`;
    if (bold) s = `\\textbf{${s}}`;
    if (tag === 'p' || tag === 'div') s = (out && !out.endsWith('\n') ? '\n' : '') + s;
    out += s;
  });
  return out;
}
/** A formatting command around the whole text becomes the cell's flag (so the toolbar shows it). */
function liftWhole(x: TCell) {
  for (let changed = true; changed;) {
    changed = false;
    const m = /^\\(textbf|textit|emph|underline|texttt)\{([\s\S]*)\}$/.exec(x.t.trim());
    if (m && balanced(m[2])) {
      x.t = m[2];
      if (m[1] === 'textbf') x.b = true; else if (m[1] === 'textit' || m[1] === 'emph') x.i = true; else if (m[1] === 'underline') x.u = true; else x.tt = true;
      changed = true;
    }
  }
}
const balanced = (s: string) => { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; else if (s[i] === '}' && --d < 0) return false; } return d === 0; };

export function fromHtml(html: string): TableModel {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // a page can wrap its data table in layout tables: take the table with the most cells that holds no other table
  const all = Array.from(doc.querySelectorAll('table'));
  if (!all.length) throw new Error('No table in the HTML');
  const own = (t: Element) => Array.from(t.querySelectorAll('td, th')).filter((c) => c.closest('table') === t).length;
  const leaves = all.filter((t) => !t.querySelector('table'));
  const table = (leaves.length ? leaves : all).reduce((a, b) => (own(b) > own(a) ? b : a));
  // class rules from <style> blocks (Excel puts the formats there: .xl65 {font-weight:700; …})
  const classCss = new Map<string, string>();
  for (const st of Array.from(doc.querySelectorAll('style'))) {
    const txt = (st.textContent || '').replace(/<!--|-->/g, '');
    for (const m of txt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) for (const sel of m[1].split(',')) {
      const k = /\.([\w-]+)\s*$/.exec(sel.trim());
      if (k) classCss.set(k[1], (classCss.get(k[1]) || '') + ';' + m[2]);
    }
  }
  const styleOf = (e: Element) => {
    const parts: string[] = [];
    for (const c of Array.from(e.classList)) if (classCss.has(c)) parts.push(classCss.get(c)!);
    parts.push(e.getAttribute('style') || '');
    const map = new Map<string, string>();
    for (const decl of parts.join(';').split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) map.set(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim().replace(/\s*!important/, ''));
    }
    return map;
  };
  const rowsEl = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  const grid: TCell[][] = [], taken: boolean[][] = [];
  const hr: Record<string, Rule> = {}, vr: Record<string, Rule> = {};
  let head = 0, headDone = false;
  rowsEl.forEach((tr, r) => {
    grid[r] = grid[r] || []; taken[r] = taken[r] || [];
    const cells = Array.from(tr.children).filter((e) => /^(td|th)$/i.test(e.tagName));
    const inHead = tr.parentElement?.tagName.toLowerCase() === 'thead' || (cells.length > 0 && cells.every((e) => e.tagName.toLowerCase() === 'th'));
    if (inHead && !headDone) head = r + 1; else headDone = true;
    const rowSt = styleOf(tr);
    let c = 0;
    for (const td of cells) {
      while (taken[r][c]) c++;
      const cs = Math.max(1, Math.min(200, +(td.getAttribute('colspan') || 1) || 1)), rs = Math.max(1, Math.min(2000, +(td.getAttribute('rowspan') || 1) || 1));
      const st = styleOf(td), get = (k: string) => st.get(k) ?? rowSt.get(k);
      const x: TCell = { t: htmlText(td, { b: false, i: false, u: false }).replace(/^\s+|\s+$/g, '').replace(/[ \t]*\n[ \t]*/g, '\n') };
      if (cs > 1) x.cs = cs;
      if (rs > 1) x.rs = rs;
      const fw = get('font-weight');
      if (fw && /bold|[6-9]00/.test(fw)) x.b = true;
      if (/italic/.test(get('font-style') || '')) x.i = true;
      if (/underline/.test(get('text-decoration') || get('text-decoration-line') || '')) x.u = true;
      const al = (get('text-align') || td.getAttribute('align') || '').toLowerCase();
      if (/center/.test(al)) x.al = 'c'; else if (/right|end/.test(al)) x.al = 'r'; else if (/justify/.test(al)) x.al = 'j'; else if (/left|start/.test(al)) x.al = 'l';
      const va = (get('vertical-align') || td.getAttribute('valign') || '').toLowerCase();
      if (/middle|center/.test(va)) x.va = 'm'; else if (/bottom/.test(va)) x.va = 'b'; else if (/top/.test(va)) x.va = 't';
      const fg = cssColor(get('color')), bg = cssColor(get('background-color') || (get('background') || '').split(/\s+/).find((p) => cssColor(p)) || td.getAttribute('bgcolor'));
      if (fg && fg !== '#000000') x.fg = fg;
      if (bg && bg !== '#ffffff') x.bg = bg;
      if (td.tagName.toLowerCase() === 'th' && r >= head) x.b = true;
      liftWhole(x);
      grid[r][c] = x;
      // borders, on the cell's edges
      const all = get('border'), bt = borderW(get('border-top') ?? all), bb = borderW(get('border-bottom') ?? all), bl = borderW(get('border-left') ?? all), br = borderW(get('border-right') ?? all);
      for (let k = 0; k < cs; k++) { if (bt) hr[`${r},${c + k}`] = Math.max(hr[`${r},${c + k}`] || 0, bt) as Rule; if (bb) hr[`${r + rs},${c + k}`] = Math.max(hr[`${r + rs},${c + k}`] || 0, bb) as Rule; }
      for (let j = 0; j < rs; j++) { if (bl) vr[`${r + j},${c}`] = Math.max(vr[`${r + j},${c}`] || 0, bl) as Rule; if (br) vr[`${r + j},${c + cs}`] = Math.max(vr[`${r + j},${c + cs}`] || 0, br) as Rule; }
      for (let j = 0; j < rs; j++) for (let k = 0; k < cs; k++) { taken[r + j] = taken[r + j] || []; taken[r + j][c + k] = true; grid[r + j] = grid[r + j] || []; if (j || k) grid[r + j][c + k] = { t: '' }; }
      c += cs;
    }
  });
  // <table border="1"> or a border-collapse grid on every cell
  const tAttr = +(table.getAttribute('border') || 0);
  const m = fromCells(grid, { head });
  const nr = nRows(m), nc = nCols(m);
  const anyBorder = Object.keys(hr).length + Object.keys(vr).length > 0 || tAttr > 0;
  if (anyBorder) {
    applyPreset(m, 'custom');
    m.booktabs = false;
    for (let r = 0; r <= nr; r++) for (let c = 0; c < nc; c++) m.hr[r][c] = tAttr ? 1 : (hr[`${r},${c}`] || 0);
    for (let r = 0; r < nr; r++) for (let c = 0; c <= nc; c++) m.vr[r][c] = tAttr ? 1 : (vr[`${r},${c}`] || 0);
    const own = owners(m);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const [ar, ac] = own[r][c]; if (ar < r) m.hr[r][c] = 0; if (ac < c) m.vr[r][c] = 0; }
    matchPreset(m);
  }
  // <th> header cells are bold as a browser shows them: the table's bold header
  const heads = rowsEl.slice(0, head).flatMap((tr) => Array.from(tr.children).filter((e) => /^(td|th)$/i.test(e.tagName)));
  if (head > 0 && heads.length && heads.every((e) => e.tagName.toLowerCase() === 'th' || /bold|[6-9]00/.test(styleOf(e).get('font-weight') || ''))) {
    m.headBold = true;
    for (const row of m.cells.slice(0, head)) for (const x of row) delete x.b;
  }
  const cap = table.querySelector(':scope > caption');
  if (cap) m.caption = htmlText(cap, { b: false, i: false, u: false }).replace(/\s+/g, ' ').trim();
  return m;
}

// ---------------------------------------------------------------- LaTeX
/** The environments a table is read from (tabularray's tblr in its simple form, nicematrix's NiceTabular). */
const TAB_ENVS = 'tabular\\*?|tabularx|tabulary|xltabular|longtable|tabu|array|NiceTabular\\*?|NiceArray|tblr|longtblr';
const TAB_BEGIN = new RegExp(`\\\\begin\\{(${TAB_ENVS})\\}`);
export const isLatex = (text: string) => TAB_BEGIN.test(text) || (/&/.test(text) && /\\\\/.test(text));
/** Index of the brace closing the one at i (or -1). */
function closeAt(s: string, i: number, open = '{', shut = '}') {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === open) d++;
    else if (c === shut && --d === 0) return k;
  }
  return -1;
}
/** Reads {arg} or [opt] at i (after spaces): [text, end index] or null. */
function arg(s: string, i: number, open = '{'): [string, number] | null {
  let k = i;
  while (k < s.length && /\s/.test(s[k])) k++;
  if (s[k] !== open) return null;
  const e = closeAt(s, k, open, open === '{' ? '}' : ']');
  return e < 0 ? null : [s.slice(k + 1, e), e + 1];
}
/** Splits at a separator outside braces, brackets of nested environments and maths. */
function splitTop(s: string, sep: '&' | '\\\\'): string[] {
  const out: string[] = [];
  let d = 0, env = 0, math = false, last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (s.startsWith('\\begin{', i)) env++;
      else if (s.startsWith('\\end{', i)) env--;
      else if (sep === '\\\\' && s[i + 1] === '\\' && !d && !env && !math) { out.push(s.slice(last, i)); i++; last = i + 1; continue; }
      i++; continue;
    }
    if (c === '$') math = !math;
    else if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === '&' && sep === '&' && !d && !env && !math) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  return out;
}
const stripComments = (s: string) => s.replace(/(^|[^\\])%.*$/gm, '$1');
interface ColSpec { al: HAlign; w: number; fill?: boolean; num?: boolean; numOpts?: string; left: Rule; right: Rule; va?: 'm' | 'b'; bg?: string }
/** Column types the source defines with \newcolumntype{s}[n]{…}: name → [argument count, definition] */
type ColTypes = Record<string, [number, string]>;
let colTypes: ColTypes = {};
function readColTypes(s: string): ColTypes {
  const out: ColTypes = {};
  const re = /\\newcolumntype\s*\{?\s*([A-Za-z])\s*\}?/g;
  for (let m; (m = re.exec(s));) {
    let i = m.index + m[0].length;
    const n = arg(s, i, '['); if (n) i = n[1];
    const d = arg(s, i);
    if (d) { out[m[1]] = [Math.max(0, Math.min(9, +(n ? n[0] : 0) || 0)), d[0]]; re.lastIndex = d[1]; }
  }
  return out;
}
/** Column spec → columns with their rules. Handles l c r p{} m{} b{} X S[...] | !{\vrule…} @{} >{} <{} *{n}{…}. */
export function parseSpec(spec: string, types: ColTypes = colTypes): ColSpec[] {
  // expand *{n}{x}
  let s = spec;
  // and the source's own column types (\newcolumntype), several levels deep
  for (let guard = 0; guard < 50; guard++) {
    let hit = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '{' || c === '[') { const e = closeAt(s, i, c, c === '{' ? '}' : ']'); if (e > 0) { i = e; continue; } }
      const t = types[c];
      if (!t) continue;
      let body = t[1], end = i + 1;
      for (let k = 1; k <= t[0]; k++) { const a = arg(s, end); if (!a) break; body = body.split('#' + k).join(a[0]); end = a[1]; }
      s = s.slice(0, i) + ' ' + body + ' ' + s.slice(end); hit = true; break;
    }
    if (!hit) break;
  }
  for (let guard = 0; guard < 20 && s.includes('*{'); guard++) {
    const i = s.indexOf('*{'), a = arg(s, i + 1), b = a && arg(s, a[1]);
    if (!a || !b) break;
    s = s.slice(0, i) + b[0].repeat(Math.max(0, Math.min(100, +a[0] || 0))) + s.slice(b[1]);
  }
  const cols: ColSpec[] = [];
  let pendingRule: Rule = 0, pre = '';
  const UNIT: Record<string, number> = { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72.27, em: 0.35, ex: 0.15 };
  const width = (w: string) => {
    const m = /^\s*([\d.]+)\s*(cm|mm|in|pt|em|ex)\s*$/.exec(w);
    if (m) return +(+m[1] * UNIT[m[2]]).toFixed(2);
    const f = /^\s*([\d.]*)\s*\\(linewidth|textwidth|columnwidth|hsize)/.exec(w);
    if (f) return +((f[1] ? +f[1] : 1) * 15).toFixed(2); // a share of a 15 cm text block
    return 3;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) continue;
    if (c === '|') { pendingRule = pendingRule ? 3 : 1; if (cols.length) cols[cols.length - 1].right = pendingRule; continue; }
    if (c === '!' || c === '@' || c === '<' || c === '>') {
      const a = arg(s, i + 1);
      if (!a) continue;
      if (c === '!' && /vrule|vline/.test(a[0])) { const w: Rule = /width\s*[\d.]*(pt)?/.test(a[0]) && !/width\s*0?\.[0-5]/.test(a[0]) ? 2 : 1; pendingRule = w; if (cols.length) cols[cols.length - 1].right = w; }
      if (c === '>') pre = a[0];
      i = a[1] - 1; continue;
    }
    let col: ColSpec | null = null;
    const alPre: HAlign | null = /\\centering/.test(pre) ? 'c' : /\\raggedleft/.test(pre) ? 'r' : /\\raggedright/.test(pre) ? 'l' : null;
    if (c === 'l' || c === 'c' || c === 'r') col = { al: c, w: 0, left: 0, right: 0 };
    else if (c === 'p' || c === 'm' || c === 'b') { const a = arg(s, i + 1); col = { al: alPre || 'j', w: a ? width(a[0]) : 3, left: 0, right: 0 }; if (c !== 'p') col.va = c; if (a) i = a[1] - 1; }
    else if (c === 'X') col = { al: alPre || 'j', w: 0, fill: true, left: 0, right: 0 };
    else if (c === 'S') { const a = arg(s, i + 1, '['); col = { al: 'r', w: 0, num: true, numOpts: a ? a[0] : '', left: 0, right: 0 }; if (a) i = a[1] - 1; }
    else if (c === 'L' || c === 'C' || c === 'R') col = { al: c.toLowerCase() as HAlign, w: 0, left: 0, right: 0 };
    if (!col) continue;
    if (alPre && !col.w && !col.fill) col.al = alPre;
    // >{\columncolor[HTML]{AAACED}}: the column's fill
    const cc = /\\columncolor\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/.exec(pre);
    if (cc) { const v = colorOf(cc[1], cc[2]); if (v) col.bg = v; }
    col.left = cols.length ? cols[cols.length - 1].right : pendingRule;
    pendingRule = 0; pre = '';
    cols.push(col);
  }
  return cols;
}
/** \cmd{arg} at the start of s: [cmd, args…, rest] */
function lead(s: string, name: string, nOpt: number, nArg: number): { opts: string[]; args: string[]; rest: string } | null {
  const t = s.trimStart();
  if (!t.startsWith('\\' + name) || /[A-Za-z]/.test(t[name.length + 1] || '')) return null;
  let i = name.length + 1;
  const opts: string[] = [], args: string[] = [];
  for (let k = 0; k < nOpt; k++) { const a = arg(t, i, '['); if (a) { opts.push(a[0]); i = a[1]; } }
  // \cmidrule(lr){2-3}
  if (name === 'cmidrule') { let j = i; while (/\s/.test(t[j] || '')) j++; if (t[j] === '(') { const e = t.indexOf(')', j); if (e > 0) i = e + 1; } }
  for (let k = 0; k < nArg; k++) { const a = arg(t, i); if (!a) return null; args.push(a[0]); i = a[1]; }
  return { opts, args, rest: t.slice(i) };
}
/** Colours the source names with \definecolor{name}{HTML}{…} */
let defColors: Record<string, string> = {};
const colorOf = (model: string | undefined, v: string): string | undefined => {
  if (!model && defColors[v.trim()]) return defColors[v.trim()];
  if (model === 'HTML') return /^[0-9a-f]{6}$/i.test(v.trim()) ? '#' + v.trim().toLowerCase() : undefined;
  if (model === 'rgb') { const p = v.split(',').map(Number); return p.length === 3 ? '#' + p.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('') : undefined; }
  if (model === 'RGB') { const p = v.split(',').map(Number); return p.length === 3 ? '#' + p.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('') : undefined; }
  if (model === 'gray') { const g = Math.round(+v * 255).toString(16).padStart(2, '0'); return '#' + g + g + g; }
  const h = TD.tikzColor ? TD.tikzColor(v) : null;
  return typeof h === 'string' ? h.toLowerCase() : undefined;
};
/** A cell's LaTeX: \multicolumn / \multirow / colour / whole-cell styles are taken out into the cell's fields. */
function readCell(raw: string, defaults: ColSpec | undefined) {
  let t = raw.trim();
  const x: TCell = { t: '' };
  let cs = 1, rs = 1, spec: ColSpec | null = null;
  const take = () => {
    let any = true;
    while (any) {
      any = false;
      let L = lead(t, 'cellcolor', 1, 1);
      if (L) { const c = colorOf(L.opts[0], L.args[0]); if (c) x.bg = c; t = L.rest.trim(); any = true; continue; }
      L = lead(t, 'multicolumn', 0, 3);
      if (L) { cs = Math.max(1, +L.args[0] || 1); spec = parseSpec(L.args[1])[0] || null; if (spec && (spec as ColSpec).va) x.va = (spec as ColSpec).va; if (spec && (spec as ColSpec).bg && !x.bg) x.bg = (spec as ColSpec).bg; t = L.args[2].trim(); any = true; continue; }
      L = lead(t, 'multirow', 1, 3) || lead(t, 'multirowcell', 1, 1);
      if (L && L.args.length === 3) { rs = +L.args[0] || 1; t = L.args[2].trim(); { const w = L.args[1].trim(); if (w !== '*' && w !== '=' && lenPt(w) != null) x.mw = w; } if (L.opts[0] && /t/.test(L.opts[0])) x.va = 't'; else if (L.opts[0] && /b/.test(L.opts[0])) x.va = 'b'; any = true; continue; }
      // nicematrix \Block{rows-cols}{text} and tabularray \SetCell[c=2,r=3]{align} text
      L = lead(t, 'Block', 1, 2);
      if (L) { const d = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(L.args[0]); if (d) { rs = +d[1] || 1; cs = +d[2] || 1; } t = (L.args[1] + L.rest).trim(); any = true; continue; }
      L = lead(t, 'SetCell', 1, 1);
      if (L) { const o = L.opts[0] || '', c2 = /c\s*=\s*(\d+)/.exec(o), r2 = /r\s*=\s*(\d+)/.exec(o); if (c2) cs = +c2[1] || 1; if (r2) rs = +r2[1] || 1; const al = /(?:^|[,\s])(halign\s*=\s*)?([lcrj])\b/.exec(L.args[0]); if (al) spec = { al: al[2] as HAlign, w: 0, left: 0, right: 0 }; t = L.rest.trim(); any = true; continue; }
      L = lead(t, 'textcolor', 1, 2);
      if (L && !L.rest.trim()) { const c = colorOf(L.opts[0], L.args[0]); if (c) x.fg = c; t = L.args[1].trim(); any = true; continue; }
      L = lead(t, 'color', 1, 1);
      if (L) { const c = colorOf(L.opts[0], L.args[0]); if (c) x.fg = c; t = L.rest.trim(); any = true; continue; }
      for (const [cmd, k] of [['bfseries', 'b'], ['itshape', 'i'], ['ttfamily', 'tt'], ['bf', 'b'], ['it', 'i'], ['em', 'i'], ['tt', 'tt']] as const) {
        const re = new RegExp(`^\\\\${cmd}(?![A-Za-z])\\s*`);
        if (re.test(t)) { (x as any)[k] = true; t = t.replace(re, ''); any = true; }
      }
      for (const sz of ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large']) {
        const re = new RegExp(`^\\{?\\\\${sz}(?![A-Za-z])\\s*`);
        if (re.test(t) && (!t.startsWith('{') || closeAt(t, 0) === t.length - 1)) { x.sz = sz; t = t.startsWith('{') ? t.slice(1, -1).replace(new RegExp(`^\\\\${sz}\\s*`), '') : t.replace(re, ''); any = true; }
      }
      // a braced cell (text in an S column)
      if (t.startsWith('{') && closeAt(t, 0) === t.length - 1) { t = t.slice(1, -1).trim(); any = true; }
    }
  };
  take();
  // a nested tabular holding lines: one cell with newlines
  const nest = /^\\begin\{tabular\}(?:\[[tcb]\])?\{[^{}]*\}([\s\S]*)\\end\{tabular\}$/.exec(t);
  if (nest) t = splitTop(nest[1], '\\\\').map((l) => l.trim()).filter(Boolean).join('\n');
  // \makecell{a \\ b} and \shortstack
  const mk = /^\\(makecell|shortstack|thead)(?:\[[^\]]*\])?\{([\s\S]*)\}$/.exec(t);
  if (mk && balanced(mk[2])) t = splitTop(mk[2], '\\\\').map((l) => l.trim()).join('\n');
  // \num{1.5e3} in an S column is the number itself: the column formats it
  if (defaults && defaults.num) { const n = /^\\(?:num|tablenum)(?:\[[^\]]*\])?\{([^{}]*)\}$/.exec(t); if (n) t = n[1]; }
  x.t = t.replace(/\s*\\newline\s*/g, '\n').replace(/[ \t]+/g, ' ');
  liftWhole(x);
  if (rs < 0) x.rs = rs; else if (rs > 1) x.rs = rs;
  if (cs > 1) x.cs = cs;
  if (spec) { const sp = spec as ColSpec; if (cs > 1 || !defaults || sp.al !== defaults.al) x.al = sp.al; }
  return { cell: x, spec: spec as ColSpec | null };
}

export function fromLatex(src: string): { table: TableModel; warnings: string[] } {
  const warnings: string[] = [];
  const s = stripComments(src);
  colTypes = readColTypes(s);
  defColors = {};
  for (const d of s.matchAll(/\\definecolor\s*\{([^{}]*)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g)) { const c = colorOf(d[2].trim(), d[3]); if (c) defColors[d[1].trim()] = c; }
  const em = TAB_BEGIN.exec(s);
  let envName: string, specStr = '', bodyStr: string, widthShare = 1, envOpt = '';
  if (em) {
    envName = em[1];
    let i = em.index + em[0].length;
    // tabular*, tabularx, tabulary and xltabular have a width first; longtable an optional [c]
    if (/^(tabularx|tabular\*|tabulary|xltabular)$/.test(envName)) { const w = arg(s, i); if (w) { const f = /^\s*([\d.]*)\s*\\(linewidth|textwidth|columnwidth)/.exec(w[0]); if (f && f[1]) widthShare = +f[1]; i = w[1]; } }
    const o = arg(s, i, '['); if (o) { i = o[1]; envOpt = o[0].trim(); }
    const a = arg(s, i);
    if (!a) throw new Error('The column spec is missing');
    specStr = a[0];
    // tblr: {colspec = {…}, …} or the plain spec; NiceTabular: options after the spec
    if (/tblr$/.test(envName) && /=/.test(specStr)) { const cs = /colspec\s*=\s*/.exec(specStr); const v = cs ? arg(specStr, cs.index + cs[0].length) : null; specStr = v ? v[0] : ''; }
    if (/^Nice/.test(envName)) { const o2 = arg(s, a[1], '['); if (o2) a[1] = o2[1]; }
    const end = s.indexOf(`\\end{${envName}}`, a[1]);
    // nested tables of the same name: find the matching end
    let depth = 1, k = a[1], stop = -1;
    const re = new RegExp(`\\\\(begin|end)\\{${envName.replace('*', '\\*')}\\}`, 'g');
    re.lastIndex = a[1];
    for (let mm; (mm = re.exec(s));) { if (mm[1] === 'begin') depth++; else if (--depth === 0) { stop = mm.index; break; } }
    void k; void end;
    bodyStr = s.slice(a[1], stop < 0 ? s.length : stop);
    if (stop < 0) warnings.push(`No \\end{${envName}}: read to the end`);
  } else { envName = 'tabular'; bodyStr = s; }
  // longtable: the header written for the first page is kept and the repeats dropped; the last page's footer
  // goes to the end (the footer rows), the other pages' one is dropped
  let ltHead = -1, ltFoot = 0;
  if (envName === 'longtable' && /\\end(firsthead|head|foot|lastfoot)(?![A-Za-z])/.test(bodyStr)) {
    const part: Record<string, string> = {};
    let last = 0, body = '';
    const re = /\\end(firsthead|head|foot|lastfoot)(?![A-Za-z])/g;
    for (let mm; (mm = re.exec(bodyStr));) { part[mm[1]] = bodyStr.slice(last, mm.index); last = mm.index + mm[0].length; }
    body = bodyStr.slice(last);
    const head = part.firsthead ?? part.head ?? '';
    const foot = part.lastfoot ?? part.foot ?? '';
    // a piece with no cells: only rules, colours and spacing
    const bare = (x: string) => !x.replace(/^\s*\[[^\]]*\]/, '').replace(/\\(hline|toprule|midrule|bottomrule|morecmidrules)(?![A-Za-z])(\[[^\]]*\])?|\\(cline|Xhline|hhline)\{[^}]*\}|\\cmidrule(\[[^\]]*\])?(\([^)]*\))?\{[^}]*\}|\\addlinespace(\[[^\]]*\])?|\\specialrule\{[^}]*\}\{[^}]*\}\{[^}]*\}|\\noalign\{[^{}]*\}|\\rowcolor(\[[^\]]*\])?\{[^}]*\}/g, '').trim();
    const noCap = (t: string) => t.replace(/\\caption(?:\[[^\]]*\])?\{[\s\S]*?\}\s*(\\label\{[^}]*\})?\s*\\\\/, '');
    const rowsIn = (t: string) => { const p = splitTop(noCap(t), '\\\\'); return p.length - (bare(p[p.length - 1]) ? 1 : 0); };
    // the text ends with a row's \\ (and rules after it), so more rows can follow
    const ends = (t: string) => { const p = splitTop(t, '\\\\'); return bare(t) || (p.length > 1 && bare(p[p.length - 1])); };
    if (part.firsthead != null || part.head != null) ltHead = rowsIn(head);
    ltFoot = foot.trim() ? rowsIn(foot) : 0;
    let b = head;
    if (!ends(b)) b += ' \\\\';
    b += body;
    if (ltFoot) { if (!ends(b)) b += ' \\\\'; b += foot; }
    bodyStr = b;
  }
  const spec = parseSpec(specStr);
  // the caption and label: inside a longtable as a row, or around the tabular in a table float
  let caption = '', label = '';
  const capRe = /\\caption(?:\[[^\]]*\])?\{/g;
  const findCap = (str: string) => { capRe.lastIndex = 0; const m = capRe.exec(str); if (!m) return null; const e = closeAt(str, m.index + m[0].length - 1); return e < 0 ? null : { at: m.index, end: e + 1, text: str.slice(m.index + m[0].length, e) }; };
  const outside = em ? s.slice(0, em.index) + s.slice(em.index + 1).replace(new RegExp(`[\\s\\S]*\\\\end\\{(${TAB_ENVS})\\}`), '') : '';
  const capOut = findCap(outside), capIn = envName === 'longtable' ? findCap(bodyStr) : null;
  if (capIn) { caption = capIn.text; bodyStr = bodyStr.slice(0, capIn.at) + bodyStr.slice(capIn.end).replace(/^\s*(\\label\{[^}]*\})?\s*\\\\/, (w, l) => { if (l) label = l.slice(7, -1); return ''; }); }
  else if (capOut) caption = capOut.text;
  const lab = /\\label\{([^}]*)\}/.exec(outside);
  if (!label && lab) label = lab[1];
  // \caption{Text.\label{tab:x}}: the label written inside the caption
  { const li = /\s*\\label\{([^}]*)\}\s*/.exec(caption); if (li) { if (!label) label = li[1]; caption = caption.slice(0, li.index) + (li.index && li.index + li[0].length < caption.length ? ' ' : '') + caption.slice(li.index + li[0].length); } }
  const capTop = capOut ? (em ? s.indexOf('\\caption') < em.index : true) : capIn ? bodyStr.length > 0 && src.indexOf('\\caption') < src.indexOf('\\\\', src.indexOf(em ? em[0] : '')) : true;

  // \rowcolors{first}{odd}{even} (xcolor's table option), before the table or at the top of its body
  let rowcolors: { from: number; odd?: string; even?: string } | null = null;
  {
    const rcRe = /\\rowcolors\*?(?:\[[^\]]*\])?\{\s*(\d+)\s*\}\{([^{}]*)\}\{([^{}]*)\}/g;
    const lead0 = /^\s*(\\rowcolors\*?(?:\[[^\]]*\])?\{\s*\d+\s*\}\{[^{}]*\}\{[^{}]*\}\s*)+/.exec(bodyStr);
    const zone = (em ? s.slice(Math.max(0, s.lastIndexOf('\\begin{table', em.index)), em.index) : '') + (lead0 ? lead0[0] : '');
    if (lead0) bodyStr = bodyStr.slice(lead0[0].length);
    for (const m of zone.matchAll(rcRe)) {
      const col = (v: string) => { const t = v.trim(); if (!t || /^white(!100)?$/.test(t) || /^none$/.test(t)) return undefined; return colorOf(undefined, t); };
      rowcolors = { from: +m[1] || 1, odd: col(m[2]), even: col(m[3]) };
    }
    if (/\\hiderowcolors|\\norowcolors/.test(zone)) rowcolors = null;
  }
  // rows: rules before a row's cells belong to the line above it
  const rawRows = splitTop(bodyStr, '\\\\');
  const rows: string[] = [];
  const rules: { full: Rule; parts: [number, number, Rule][] }[] = [{ full: 0, parts: [] }];
  const rowColors: (string | undefined)[] = [];
  let booktabs = false;
  const RULES: [RegExp, Rule, boolean][] = [[/^\\toprule(\[[^\]]*\])?/, 2, true], [/^\\bottomrule(\[[^\]]*\])?/, 2, true], [/^\\midrule(\[[^\]]*\])?/, 1, true], [/^\\hline/, 1, false], [/^\\Xhline\{[^}]*\}/, 2, false], [/^\\noalign\{\\hrule[^}]*\}/, 2, false], [/^\\specialrule\{[^}]*\}\{[^}]*\}\{[^}]*\}/, 2, true]];
  const skips: string[] = [];
  let ruleColor = '';
  rawRows.forEach((raw, idx) => {
    // \\[2pt]: space after the row above
    let t = raw.replace(/^\s*\[([^\]]*)\]/, (_w, v) => { if (rows.length && lenPt(v) != null) skips[rows.length - 1] = v.trim(); return ''; });
    const rl = rules[rules.length - 1];
    for (let again = true; again;) {
      again = false;
      t = t.trimStart();
      for (const [re, w, bt] of RULES) {
        const m = re.exec(t);
        if (m) {
          // \toprule[\lightrulewidth] or a heavy \midrule
          let ww: Rule = w;
          if (m[1] && /light/.test(m[1])) ww = 1; else if (m[1] && /heavy/.test(m[1])) ww = 2;
          if (/^\\hline\s*\\hline/.test(t)) ww = 3; // \hline\hline: a double rule
          rl.full = Math.max(rl.full, ww) as Rule; if (bt) booktabs = true; t = t.slice(m[0].length); again = true;
          if (/^\\hline/.test(m[0])) t = t.replace(/^\s*\\hline/, '');
          break;
        }
      }
      const cl = lead(t, 'cline', 0, 1) || lead(t, 'cmidrule', 1, 1);
      if (cl) {
        const r = /^(\d+)\s*-\s*(\d+)$/.exec(cl.args[0].trim());
        const heavy = cl.opts[0] && /heavy|[1-9](\.\d+)?pt|0?\.[6-9]/.test(cl.opts[0]);
        if (r) rl.parts.push([+r[1] - 1, +r[2] - 1, heavy ? 2 : 1]);
        if (/^\s*\\cmidrule/.test(t)) booktabs = true;
        t = cl.rest; again = true;
      }
      // \hhline{|=|~-|}: = double, - single, ~ none, per column
      const hh = lead(t, 'hhline', 0, 1);
      if (hh) {
        let c = 0;
        for (const ch of hh.args[0].replace(/\*\{(\d+)\}\{([^{}]*)\}/g, (_w, n, x) => x.repeat(Math.min(100, +n)))) {
          if (ch === '=') rl.parts.push([c, c, 3]); else if (ch === '-') rl.parts.push([c, c, 1]);
          if (ch === '=' || ch === '-' || ch === '~') c++;
        }
        t = hh.rest; again = true;
      }
      const arc = lead(t, 'arrayrulecolor', 1, 1);
      if (arc) { ruleColor = colorOf(arc.opts[0], arc.args[0]) || ruleColor; t = arc.rest; again = true; }
      for (const skip of [/^\\addlinespace(\[[^\]]*\])?/, /^\\morecmidrules/, /^\\pagebreak/, /^\\nopagebreak/, /^\\noalign\{[^{}]*\}/]) { const m = skip.exec(t); if (m) { t = t.slice(m[0].length); again = true; } }
      const rc = lead(t, 'rowcolor', 1, 1);
      if (rc) { rowColors[rows.length] = colorOf(rc.opts[0], rc.args[0]); t = rc.rest; again = true; }
    }
    if (idx === rawRows.length - 1 && !t.trim()) return; // after the last \\
    rows.push(t);
    rules.push({ full: 0, parts: [] });
  });

  // cells
  const grid: TCell[][] = [], specs: (ColSpec | null)[][] = [];
  rows.forEach((row, r) => {
    const parts = splitTop(row, '&');
    grid[r] = []; specs[r] = [];
    let c = 0;
    for (const p of parts) {
      const { cell, spec: sp } = readCell(p, spec[c]);
      if (rowColors[r] && !cell.bg) cell.bg = rowColors[r];
      grid[r][c] = cell; specs[r][c] = sp;
      const cs = cell.cs || 1;
      for (let k = 1; k < cs; k++) { grid[r][c + k] = { t: '', ...(cell.bg ? { bg: cell.bg } : {}) }; specs[r][c + k] = null; }
      c += cs;
    }
  });
  // \multirow{-n}: written in the last row of the merge, so the text moves up to the first
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
    const x = grid[r][c];
    if (x && x.rs && x.rs < 0) {
      const n = -x.rs, top = Math.max(0, r - n + 1), y = grid[top][c];
      const keep = { ...x, rs: n, ...(y && y.bg && !x.bg ? { bg: y.bg } : {}) };
      grid[r][c] = { t: '', ...(x.bg ? { bg: x.bg } : {}), ...(x.cs ? { cs: x.cs } : {}) };
      if (grid[r][c].cs) delete grid[r][c].cs;
      grid[top][c] = keep;
      if (x.cs) for (let k = 1; k < x.cs; k++) if (grid[top][c + k]) grid[top][c + k] = { t: '' };
    }
  }
  const nc = Math.max(spec.length, ...grid.map((r) => r.length));
  const m = create(Math.max(1, grid.length), Math.max(1, nc), 'booktabs');
  for (let r = 0; r < nRows(m); r++) for (let c = 0; c < nc; c++) m.cells[r][c] = (grid[r] && grid[r][c]) || { t: '' };
  fixSpans(m);
  for (let c = 0; c < nc; c++) {
    const sp = spec[c];
    if (!sp) continue;
    m.cols[c].al = sp.al;
    m.cols[c].w = sp.w;
    if (sp.fill) m.cols[c].fill = true;
    if (sp.num) m.cols[c].num = {};
    // m{…} and b{…}: the column's cells sit in the middle or at the bottom; >{\columncolor}: their fill
    for (let r = 0; r < nRows(m); r++) {
      const x = m.cells[r][c];
      if (sp.va && !x.va && !(specs[r]?.[c])) x.va = sp.va;
      if (sp.bg && !x.bg && !rowColors[r]) x.bg = sp.bg;
    }
  }
  for (let r = 0; r < nRows(m); r++) if (skips[r]) m.skip[r] = skips[r];
  m.env = envName === 'tabularx' ? 'tabularx' : envName === 'longtable' ? 'longtable' : 'tabular';
  if (m.env === 'tabularx') m.width = Math.max(0.1, Math.min(1, widthShare));
  // the header: rows above the first full rule inside the table, at most half of it
  const nr = nRows(m);
  let head = 0;
  for (let k = 1; k < Math.min(nr, Math.max(2, Math.ceil(nr / 2) + 1)); k++) if (rules[k] && rules[k].full) { head = k; break; }
  // a longtable says which rows are its header and footer
  if (ltHead >= 0) head = Math.max(0, Math.min(nr - 1, ltHead));
  m.head = head;
  m.foot = Math.max(0, Math.min(nr - head - 1, ltFoot));
  // rules
  applyPreset(m, 'custom');
  m.booktabs = booktabs;
  for (let k = 0; k <= nr; k++) {
    const R = rules[k];
    if (!R) continue;
    for (let c = 0; c < nc; c++) m.hr[k][c] = R.full;
    for (const [a, b, w] of R.parts) for (let c = Math.max(0, a); c <= Math.min(nc - 1, b); c++) m.hr[k][c] = Math.max(m.hr[k][c], w) as Rule;
  }
  for (let r = 0; r < nr; r++) for (let c = 0; c <= nc; c++) {
    m.vr[r][c] = c === 0 ? (spec[0]?.left || 0) : (spec[c - 1]?.right || 0);
  }
  // \multicolumn's own rules
  const own = owners(m);
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const sp = specs[r]?.[c];
    if (!sp || own[r][c][0] !== r || own[r][c][1] !== c) continue;
    const cs = m.cells[r][c].cs || 1;
    if (c === 0) m.vr[r][0] = sp.left;
    m.vr[r][c + cs] = sp.right;
  }
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const [ar, ac] = own[r][c]; if (ar < r) m.hr[r][c] = 0; if (ac < c) m.vr[r][c] = 0; }
  // stripes: \rowcolor on every other body row
  const bodyRows = Array.from({ length: nr - head }, (_, k) => head + k);
  const odd = bodyRows.filter((r) => (r - head) % 2 === 1), even = bodyRows.filter((r) => (r - head) % 2 === 0);
  if (odd.length && odd.every((r) => rowColors[r] && rowColors[r] === rowColors[odd[0]]) && even.every((r) => !rowColors[r])) {
    m.stripe = rowColors[odd[0]]!;
    for (const r of odd) for (const x of m.cells[r]) if (x.bg === m.stripe) delete x.bg;
  }
  // \rowcolors{first}{odd}{even}: xcolor counts rows from 1; the model's stripe is the second row from the start
  if (rowcolors && (rowcolors.odd || rowcolors.even)) {
    const from = Math.max(0, rowcolors.from - 1), firstOdd = rowcolors.from % 2 === 1;
    m.stripe = (firstOdd ? rowcolors.even : rowcolors.odd) || '';
    m.stripe2 = (firstOdd ? rowcolors.odd : rowcolors.even) || '';
    m.stripeFrom = from === head ? -1 : from;
  }
  // a unit after a header's text: Mass (\unit{kg}) → the column's unit
  if (head > 0) for (let c = 0; c < nc; c++) {
    const x = m.cells[head - 1][c];
    const u = /^(.*?)\s*(?:\(\\(?:unit|si)\{([^{}]*)\}\)|\[\\(?:unit|si)\{([^{}]*)\}\]|\/\s*\\(?:unit|si)\{([^{}]*)\})$/.exec(x.t);
    if (u && u[1].trim()) { x.t = u[1]; m.cols[c].unit = u[2] ?? u[3] ?? u[4]; m.unitStyle = u[2] != null ? 'paren' : u[3] != null ? 'bracket' : 'slash'; }
  }
  // header bold everywhere: the table's header style
  if (head > 0 && m.cells.slice(0, head).every((row, r) => row.every((x, c) => { const [ar, ac] = own[r][c]; return ar !== r || ac !== c || x.b || !x.t.trim(); })) && m.cells.slice(0, head).some((row) => row.some((x) => x.t.trim()))) {
    m.headBold = true;
    for (const row of m.cells.slice(0, head)) for (const x of row) delete x.b;
  }
  // settings around the table
  const pre = em ? s.slice(Math.max(0, s.lastIndexOf('\\begin{table', em.index)), em.index) : '';
  const setLen = (name: string) => { const v = new RegExp(`\\\\setlength\\s*\\{?\\s*\\\\${name}\\s*\\}?\\s*\\{([^{}]*)\\}`).exec(pre); return v ? lenPt(v[1]) : null; };
  const sep = setLen('tabcolsep');
  if (sep != null) m.pad = +sep.toFixed(2);
  const arw = setLen('arrayrulewidth');
  if (arw != null) m.ruleW = +arw.toFixed(2);
  const arc = /\\arrayrulecolor\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/.exec(pre);
  if (arc) ruleColor = colorOf(arc[1], arc[2]) || ruleColor;
  m.ruleColor = ruleColor;
  const fp = /\\begin\{table\*?\}\s*\[([^\]]*)\]/.exec(s);
  if (fp && /^[htbpH!]{1,5}$/.test(fp[1].trim())) m.floatPos = fp[1].trim();
  if (envName === 'longtable') { if (/^l$/.test(envOpt)) m.place = 'left'; else if (/^r$/.test(envOpt)) m.place = 'right'; }
  else if (/^[tb]$/.test(envOpt)) m.tpos = envOpt as 't' | 'b';
  const st = /\\renewcommand\{?\\arraystretch\}?\{\s*([\d.]+)\s*\}/.exec(pre);
  if (st) m.stretch = +st[1];
  const size = /\\(tiny|scriptsize|footnotesize|small|large|Large)\b/.exec(pre);
  if (size) m.size = size[1];
  m.float = /\\begin\{table\*?\}/.test(s);
  if (envName !== 'longtable' && /\\raggedleft|\\begin\{flushright\}/.test(pre)) m.place = 'right'; else if (/\\raggedright|\\begin\{flushleft\}/.test(pre)) m.place = 'left';
  m.caption = caption.trim(); m.label = label.trim(); m.capTop = capTop;
  matchPreset(m);
  return { table: normalize(m), warnings };
}

/** When the rules are exactly a preset's, the table says so (its rules then follow edits). */
export function matchPreset(m: TableModel) {
  const keep = { hr: JSON.stringify(m.hr), vr: JSON.stringify(m.vr), bt: m.booktabs, stripe: m.stripe, stripe2: m.stripe2, hb: m.headBold };
  for (const p of PRESETS) {
    const t = clone(m);
    applyPreset(t, p.key);
    if (JSON.stringify(t.hr) === keep.hr && JSON.stringify(t.vr) === keep.vr && t.booktabs === keep.bt && !!(t.stripe || t.stripe2) === !!(keep.stripe || keep.stripe2) && t.headBold === keep.hb) {
      m.preset = p.key; return;
    }
  }
  m.preset = 'custom';
}

// ---------------------------------------------------------------- XLSX
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
/** The files of a zip, by name (stored and deflated entries). */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), files = new Map<string, Uint8Array>();
  // the end of central directory record
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/^(xl\/|\[Content_Types\])/.test(name)) continue;
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), start = off + 30 + lnl + lxl;
    const raw = u8.subarray(start, start + csize);
    if (raw.length > 64e6) throw new Error('The spreadsheet is too large');
    files.set(name, method === 0 ? raw : method === 8 ? await inflate(raw) : new Uint8Array());
  }
  return files;
}
const XNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colIndex = (ref: string) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2] - 1, c - 1] as [number, number]; };
const BUILTIN_FMT: Record<number, string> = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm', 48: '##0.0E+0', 49: '@' };
/** A number shown as its format asks: decimals, percent, thousands, scientific, dates (as ISO). */
export function formatXlsxNumber(v: number, fmt: string): string {
  const f = fmt.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  if (/[yd]/i.test(f) || (/m/i.test(f) && /[hs:]/i.test(f))) {
    const d = new Date(Math.round((v - 25569) * 864e5));
    if (isNaN(+d)) return String(v);
    const iso = d.toISOString();
    return /[hs]/i.test(f) && /[yd]/i.test(f) ? iso.slice(0, 16).replace('T', ' ') : /[hs]/i.test(f) ? iso.slice(11, 16) : iso.slice(0, 10);
  }
  if (/E\+?0/i.test(f)) { const d = (/\.(0+)/.exec(f) || ['', ''])[1].length; return v.toExponential(d).replace(/e\+?/, 'e'); }
  const pct = f.includes('%'), x = pct ? v * 100 : v;
  const dm = /\.([0#]+)/.exec(f);
  if (!/[0#]/.test(f)) return String(v);
  let s = dm ? x.toFixed(dm[1].replace(/#/g, '').length || 0) : Math.round(x).toString();
  if (dm && dm[1].includes('#')) s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (/#,##/.test(f)) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
  return s + (pct ? '\\%' : '');
}
export async function fromXlsx(buf: ArrayBuffer): Promise<{ table: TableModel; warnings: string[]; sheets: string[] }> {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read .xlsx files');
  const files = await unzip(buf), dec = new TextDecoder(), warnings: string[] = [];
  const xml = (name: string) => { const f = files.get(name); return f ? new DOMParser().parseFromString(dec.decode(f), 'application/xml') : null; };
  const els = (d: Document | Element | null, tag: string) => (d ? Array.from(d.getElementsByTagNameNS(XNS, tag)) : []);
  const wb = xml('xl/workbook.xml');
  if (!wb) throw new Error('Not an Excel workbook');
  const sheets = els(wb, 'sheet').map((e) => e.getAttribute('name') || '');
  // the first sheet's file, through the workbook's relationships
  const rels = xml('xl/_rels/workbook.xml.rels');
  const firstId = els(wb, 'sheet')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let target = 'worksheets/sheet1.xml';
  if (rels && firstId) for (const r of Array.from(rels.getElementsByTagName('Relationship'))) if (r.getAttribute('Id') === firstId) target = (r.getAttribute('Target') || target).replace(/^\/?xl\//, '');
  const sheet = xml('xl/' + target.replace(/^\//, ''));
  if (!sheet) throw new Error('The workbook has no sheet');
  if (sheets.length > 1) warnings.push(`Read the first sheet (“${sheets[0]}”) of ${sheets.length}`);
  // shared strings, with rich text runs as commands
  const sst = xml('xl/sharedStrings.xml');
  const runText = (si: Element) => {
    const runs = els(si, 'r');
    if (!runs.length) return plainWithMath(els(si, 't').map((t) => t.textContent || '').join(''));
    return runs.map((r) => {
      let t = plainWithMath(els(r, 't').map((x) => x.textContent || '').join(''));
      const pr = els(r, 'rPr')[0];
      if (pr && t.trim()) { if (els(pr, 'b').length && els(pr, 'b')[0].getAttribute('val') !== '0') t = `\\textbf{${t}}`; if (els(pr, 'i').length && els(pr, 'i')[0].getAttribute('val') !== '0') t = `\\textit{${t}}`; }
      return t;
    }).join('');
  };
  const strings = sst ? els(sst, 'si').map(runText) : [];
  // styles: fonts, fills, borders, alignment, number formats per cell style index
  const sty = xml('xl/styles.xml');
  const argb = (e: Element | undefined) => { const v = e?.getAttribute('rgb'); return v && /^[0-9a-f]{8}$/i.test(v) ? '#' + v.slice(2).toLowerCase() : v && /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : undefined; };
  const fonts = els(els(sty, 'fonts')[0] || null, 'font').map((f) => ({ b: !!els(f, 'b').length && els(f, 'b')[0].getAttribute('val') !== '0', i: !!els(f, 'i').length && els(f, 'i')[0].getAttribute('val') !== '0', u: !!els(f, 'u').length && els(f, 'u')[0].getAttribute('val') !== 'none', color: argb(els(f, 'color')[0]) }));
  const fills = els(els(sty, 'fills')[0] || null, 'fill').map((f) => { const p = els(f, 'patternFill')[0]; return p && p.getAttribute('patternType') === 'solid' ? argb(els(p, 'fgColor')[0]) : undefined; });
  const bw = (e: Element | undefined): Rule => { const s = e?.getAttribute('style'); return !s ? 0 : /thick|medium|double/.test(s) ? 2 : 1; };
  const borders = els(els(sty, 'borders')[0] || null, 'border').map((b) => ({ l: bw(els(b, 'left')[0]), r: bw(els(b, 'right')[0]), t: bw(els(b, 'top')[0]), b: bw(els(b, 'bottom')[0]) }));
  const numFmts = new Map<number, string>(els(sty, 'numFmt').map((n) => [+(n.getAttribute('numFmtId') || 0), n.getAttribute('formatCode') || '']));
  const xfs = els(els(sty, 'cellXfs')[0] || null, 'xf').map((x) => {
    const al = els(x, 'alignment')[0];
    const id = +(x.getAttribute('numFmtId') || 0);
    return { font: fonts[+(x.getAttribute('fontId') || 0)], fill: fills[+(x.getAttribute('fillId') || 0)], border: borders[+(x.getAttribute('borderId') || 0)],
      h: al?.getAttribute('horizontal') || '', v: al?.getAttribute('vertical') || '', wrap: al?.getAttribute('wrapText') === '1', fmt: numFmts.get(id) ?? BUILTIN_FMT[id] ?? '' };
  });
  const grid: TCell[][] = [], hr: Record<string, Rule> = {}, vr: Record<string, Rule> = {};
  let maxR = 0, maxC = 0;
  const wrapCols = new Set<number>();
  for (const c of els(sheet, 'c')) {
    const pos = colIndex(c.getAttribute('r') || '');
    if (!pos) continue;
    const [r, k] = pos;
    if (r >= 2000 || k >= 200) continue;
    const type = c.getAttribute('t'), v = els(c, 'v')[0]?.textContent ?? '';
    const xf = xfs[+(c.getAttribute('s') || 0)];
    let t = '';
    if (type === 's') t = strings[+v] ?? '';
    else if (type === 'inlineStr') t = plainWithMath(els(c, 't').map((x) => x.textContent || '').join(''));
    else if (type === 'b') t = v === '1' ? 'TRUE' : 'FALSE';
    else if (type === 'str' || type === 'e') t = plainWithMath(v);
    else if (v !== '') t = xf && xf.fmt && xf.fmt !== 'General' ? formatXlsxNumber(+v, xf.fmt) : String(+(+v).toPrecision(15));
    const x: TCell = { t };
    if (xf) {
      if (xf.font) { if (xf.font.b) x.b = true; if (xf.font.i) x.i = true; if (xf.font.u) x.u = true; if (xf.font.color && xf.font.color !== '#000000') x.fg = xf.font.color; }
      if (xf.fill && xf.fill !== '#ffffff') x.bg = xf.fill;
      if (xf.h === 'center' || xf.h === 'centerContinuous') x.al = 'c'; else if (xf.h === 'right') x.al = 'r'; else if (xf.h === 'left') x.al = 'l'; else if (xf.h === 'justify') x.al = 'j';
      if (xf.v === 'center') x.va = 'm'; else if (xf.v === 'top') x.va = 't';
      if (xf.wrap) wrapCols.add(k);
      const b = xf.border;
      if (b) { if (b.t) hr[`${r},${k}`] = b.t; if (b.b) hr[`${r + 1},${k}`] = b.b; if (b.l) vr[`${r},${k}`] = b.l; if (b.r) vr[`${r},${k + 1}`] = b.r; }
    }
    if (!t && !x.bg && !Object.keys(hr).some((key) => key === `${r},${k}`)) { if (!x.bg) continue; }
    (grid[r] = grid[r] || [])[k] = x;
    if (t || x.bg) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, k); }
  }
  for (const mc of els(sheet, 'mergeCell')) {
    const [a, b] = (mc.getAttribute('ref') || '').split(':').map(colIndex);
    if (!a || !b || a[0] > maxR || a[1] > maxC) continue;
    const x = (grid[a[0]] = grid[a[0]] || [])[a[1]] = grid[a[0]][a[1]] || { t: '' };
    if (b[0] > a[0]) x.rs = Math.min(b[0], maxR) - a[0] + 1;
    if (b[1] > a[1]) x.cs = Math.min(b[1], maxC) - a[1] + 1;
    maxR = Math.max(maxR, Math.min(b[0], 1999)); maxC = Math.max(maxC, Math.min(b[1], 199));
  }
  const rows: TCell[][] = Array.from({ length: maxR + 1 }, (_, r) => Array.from({ length: maxC + 1 }, (_, c) => (grid[r] && grid[r][c]) || { t: '' }));
  const m = fromCells(rows);
  // column widths: Excel's character widths, only for columns that wrap
  for (const col of els(sheet, 'col')) {
    const lo = +(col.getAttribute('min') || 1) - 1, hi = +(col.getAttribute('max') || 1) - 1, w = +(col.getAttribute('width') || 0);
    for (let c = lo; c <= Math.min(hi, maxC); c++) if (wrapCols.has(c) && w > 0) { m.cols[c].w = +(w * 0.19).toFixed(2); m.cols[c].al = m.cols[c].al === 'r' ? 'r' : 'l'; }
  }
  const nr = nRows(m), nc = nCols(m);
  if (Object.keys(hr).length + Object.keys(vr).length) {
    applyPreset(m, 'custom');
    m.booktabs = false;
    for (let r = 0; r <= nr; r++) for (let c = 0; c < nc; c++) m.hr[r][c] = hr[`${r},${c}`] || 0;
    for (let r = 0; r < nr; r++) for (let c = 0; c <= nc; c++) m.vr[r][c] = vr[`${r},${c}`] || 0;
    const own = owners(m);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const [ar, ac] = own[r][c]; if (ar < r) m.hr[r][c] = 0; if (ac < c) m.vr[r][c] = 0; }
    matchPreset(m);
  }
  return { table: m, warnings, sheets };
}

// ---------------------------------------------------------------- one entry point
/** Which format a text is in. */
export function detect(text: string): Exclude<Format, 'xlsx'> {
  if (isHtml(text)) return 'html';
  if (TAB_BEGIN.test(text)) return 'latex';
  if (isMarkdown(text)) return 'markdown';
  const firstLines = text.split(/\r?\n/).slice(0, 20).join('\n');
  if (/\t/.test(firstLines)) return 'tsv';
  if (/&/.test(text) && /\\\\\s*($|\n)/.test(text) && !/,/.test(firstLines.replace(/\{[^}]*\}/g, ''))) return 'latex';
  return 'csv';
}
/** Text (pasted or from a file) → a table. `as` forces a format. */
export function importText(text: string, as?: Exclude<Format, 'xlsx'>): ImportResult {
  let src = String(text || '');
  // text copied out of a chat or a README often keeps its code fence: ```csv … ```
  const fenced = /^\s*(`{3,}|~{3,})[^\n`]*\n([\s\S]*?)\n\s*\1\s*$/.exec(src);
  if (fenced) src = fenced[2];
  if (!src.trim()) throw new Error('Nothing to import');
  if (src.length > 8e6) throw new Error('That is too much text for a table');
  const format = as || detect(src);
  let table: TableModel, warnings: string[] = [];
  if (format === 'html') table = fromHtml(src);
  else if (format === 'latex') ({ table, warnings } = fromLatex(src));
  else if (format === 'markdown') table = fromMarkdown(src);
  else table = fromDelimited(src, format === 'tsv' ? '\t' : guessDelimiter(src));
  table = normalize(table); // the same checks as a saved table: spans, colours, sizes
  return { table, format, warnings };
}
/** A file → a table, by its name and contents. */
export async function importFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (/\.xlsx$|\.xlsm$/.test(name)) { const r = await fromXlsx(await file.arrayBuffer()); return { table: normalize(r.table), format: 'xlsx', warnings: r.warnings }; }
  if (/\.xls$|\.ods$|\.numbers$/.test(name)) throw new Error('Save the spreadsheet as .xlsx or .csv first');
  if (file.size > 16e6) throw new Error('The file is too large');
  const text = await file.text();
  const as = /\.tsv$|\.tab$/.test(name) ? 'tsv' : /\.csv$/.test(name) ? 'csv' : /\.(md|markdown)$/.test(name) ? 'markdown' : /\.html?$/.test(name) ? 'html' : /\.(tex|ltx)$/.test(name) ? 'latex' : undefined;
  return importText(text, as);
}
export type { VAlign };
