// Table model → LaTeX. Clean, minimal code: only the packages the table uses, a column spec that states the
// usual case once (\multicolumn only where a cell differs), booktabs or \hline / \cline rules, siunitx S
// columns for aligned numbers, and \multirow placed so cell colours don't paint over it.
import type { TableModel, TCell, HAlign, Rule, VAlign } from './model';
import { nRows, nCols, owners, stripeOf, isBold, alignOf, thickPt } from './model';
import { parseNum, format, siString, tableFormat, type Formatted } from './numbers';

// ---------------------------------------------------------------- escaping
// Typed text can't break the table: an unmatched brace (\{ \}), & (\&), % (\%), # (\#), _ and ^ outside maths
// (\_ \textasciicircum{}) and a lone $ (\$) are escaped; commands (\textbf{…}) and maths ($…$) are kept, and
// text that is already escaped stays as it is.
/** Where a cell's matched environments are (\begin{pmatrix}…\end{pmatrix}, cases, array…), outermost only, as
 *  [start, end) offsets: inside them & and \\ belong to the environment, not to the table. */
export function envRanges(t: string): [number, number][] {
  const out: [number, number][] = [], stack: { name: string; at: number }[] = [];
  const re = /\\(begin|end)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let k0 = m.index; while (k0 > 0 && t[k0 - 1] === '\\') k0--;
    if ((m.index - k0) % 2) continue; // \\begin: a line break, then the word
    if (m[1] === 'begin') stack.push({ name: m[2], at: m.index });
    else {
      const k = stack.map((e) => e.name).lastIndexOf(m[2]);
      if (k < 0) continue;
      const open = stack[k];
      stack.length = k;
      if (!k) out.push([open.at, m.index + m[0].length]);
    }
  }
  return out;
}
const inRanges = (rs: [number, number][], i: number) => rs.some(([a, b]) => i >= a && i < b);
export function safeTex(t: string) {
  const src = String(t), dollars: number[] = [], envs = envRanges(src);
  for (let i = 0; i < src.length; i++) { if (src[i] === '\\') i++; else if (src[i] === '$') dollars.push(i); }
  const lone = dollars.length % 2 ? dollars[dollars.length - 1] : -1;
  const out = [...src], open: number[] = [];
  let math = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c === '\\') {
      if (i === out.length - 1) { out[i] = '\\textbackslash{}'; continue; }
      // \\ inside a cell would end the row: a line break in a cell is a newline instead
      if (!math && out[i + 1] === '\\' && !inRanges(envs, i)) { out[i] = ''; out[i + 1] = '\n'; i++; continue; }
      i++; continue;
    }
    if (c === '$') { if (i === lone) out[i] = '\\$'; else math = !math; }
    else if (c === '{') open.push(i);
    else if (c === '}') { if (open.length) open.pop(); else out[i] = '\\}'; }
    else if (c === '&' && inRanges(envs, i)) continue; // a column of the cell's own matrix or array
    else if (c === '&' || c === '%' || c === '#') out[i] = '\\' + c;
    else if (!math && c === '_') out[i] = '\\_';
    else if (!math && c === '^') out[i] = '\\textasciicircum{}';
  }
  for (const i of open) out[i] = '\\{';
  return guardStructure(out.join(''));
}
/** Commands that would end the row or the table from inside a cell print as text instead: an \end{…} with no
 *  \begin{…} before it in the cell (and a \begin{…} that is never closed), \cr, \tabularnewline. */
function guardStructure(t: string) {
  const envs: { name: string; at: number }[] = [], bad: number[] = [];
  const re = /\\(begin|end)\{([^{}]*)\}|\\(tabularnewline|crcr|cr)(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m[3]) { bad.push(m.index); continue; }
    if (m[1] === 'begin') envs.push({ name: m[2], at: m.index });
    else if (envs.length && envs[envs.length - 1].name === m[2]) envs.pop();
    else bad.push(m.index);
  }
  for (const e of envs) bad.push(e.at);
  if (!bad.length) return t;
  bad.sort((a, b) => b - a);
  for (const i of bad) {
    const cmd = /^\\([A-Za-z]+)(\{[^{}]*\})?/.exec(t.slice(i))!;
    t = t.slice(0, i) + '\\textbackslash{}' + cmd[1] + (cmd[2] ? '\\{' + cmd[2].slice(1, -1) + '\\}' : '') + t.slice(i + cmd[0].length);
  }
  return t;
}
/** Plain text (a CSV value, a spreadsheet cell) as LaTeX that prints it exactly. */
const PLAIN: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '%': '\\%', '&': '\\&', '#': '\\#', _: '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
export const plainToTex = (t: string) => String(t).replace(/[\\{}$%&#_^~]/g, (c) => PLAIN[c]);
/** Plain text that may hold inline maths, as in Markdown (Pandoc's rule): $…$ is maths when the opening $ is
 *  followed by a non-space, the closing $ follows a non-space and no digit comes right after it. So "$x^2$" is
 *  maths and stays as typed, while "$5 and $10" is money and prints its dollars. Everything else is escaped. */
export function plainWithMath(t: string) {
  const src = String(t);
  let out = '', i = 0;
  const re = /\$(?=\S)((?:\\.|[^$\\])*?\S)\$(?!\d)|\$(?=[^\s$\d])([^$\s])\$(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const body = m[1] ?? m[2];
    // a lone digit-led span like $5 … 6$ reads as money, not maths
    if (/^\d/.test(body) && /\s/.test(body)) continue;
    out += plainToTex(src.slice(i, m.index)) + '$' + body + '$';
    i = m.index + m[0].length;
  }
  return out + plainToTex(src.slice(i));
}

const hex = (c: string) => c.replace('#', '').toUpperCase();
const cmLen = (v: number) => `${+v.toFixed(2)}cm`;

export interface LatexOptions {
  /** a whole document that compiles on its own */
  standalone?: boolean;
  /** the tabular alone: no float, no centring, no size (for a TikZ node or a document that wraps it) */
  bare?: boolean;
}
export interface LatexResult { code: string; packages: string[] }

/** The \usepackage lines a table needs, in a working order. */
function packageLines(need: Set<string>) {
  const order = ['amsmath', 'xcolor', 'colortbl', 'array', 'booktabs', 'multirow', 'hhline', 'tabularx', 'longtable', 'float', 'siunitx'];
  // \rowcolors is xcolor's, with its table option (which loads colortbl too)
  return order.filter((p) => need.has(p) && !(p === 'colortbl' && need.has('xcolor-table'))).map((p) => (p === 'xcolor' && need.has('xcolor-table') ? '\\usepackage[table]{xcolor}' : `\\usepackage{${p}}`));
}

interface NumCol { fmt: (Formatted | null)[]; spec: string }

export function toLatex(m: TableModel, o: LatexOptions = {}): LatexResult {
  const nr = nRows(m), nc = nCols(m), own = owners(m), need = new Set<string>();
  const env = o.bare && m.env === 'longtable' ? 'tabular' : m.env;
  const isAnchor = (r: number, c: number) => own[r][c][0] === r && own[r][c][1] === c;

  // ---- numbers: per S column, each body cell's formatted number (null: text)
  const nums: (NumCol | null)[] = m.cols.map((col, c) => {
    if (!col.num) return null;
    const fmt: (Formatted | null)[] = [];
    for (let r = 0; r < nr; r++) {
      const x = m.cells[r][c];
      const n = r >= m.head && isAnchor(r, c) && !(x.cs && x.cs > 1) ? parseNum(x.t) : null;
      fmt.push(n ? format(n, col.num) : null);
    }
    const list = fmt.filter(Boolean) as Formatted[];
    const opts: string[] = [];
    const tf = tableFormat(list);
    if (tf) opts.push(`table-format=${tf}`);
    if (col.num.unc === 'pm' && list.some((f) => f.unc)) opts.push('uncertainty-mode=separate');
    const styled = (k: 'b' | 'i') => m.cells.some((row, r) => r >= m.head && fmt[r] && (k === 'b' ? isBold(m, r, row[c]) : row[c].i));
    if (styled('b')) opts.push('detect-weight');
    if (styled('i')) opts.push('detect-shape');
    need.add('siunitx');
    return { fmt, spec: `S${opts.length ? `[${opts.join(', ')}]` : ''}` };
  });

  // tabularx needs an X column: without one marked, the text columns take the room
  const fillCol = (c: number) => env === 'tabularx' && !m.cols[c].num && (m.cols[c].fill || !m.cols.some((x) => x.fill));
  // ---- vertical rules: the column spec has the rule most rows have; the others say so in \multicolumn
  const vSpec: Rule[] = Array.from({ length: nc + 1 }, (_, k) => {
    const cnt = [0, 0, 0, 0];
    for (let r = 0; r < nr; r++) cnt[m.vr[r][k]]++;
    // the most common; a tie goes to thin, then none
    let best: Rule = 1;
    for (const w of [0, 2, 3] as Rule[]) if (cnt[w] > cnt[best]) best = w;
    return best;
  });
  const tk = `${+thickPt(m).toFixed(2)}pt`, rc = m.ruleColor ? `\\color[HTML]{${hex(m.ruleColor)}}` : '';
  if (rc) { need.add('xcolor'); need.add('colortbl'); }
  const bar = (w: Rule) => (w === 1 ? '|' : w === 3 ? '||' : w === 2 ? (need.add('array'), `!{${rc}\\vrule width ${tk}}`) : '');
  const vaOfCol = (c: number): VAlign => {
    const cnt: Record<string, number> = { t: 0, m: 0, b: 0 };
    for (let r = 0; r < nr; r++) cnt[m.cells[r][c].va || 't']++;
    return cnt.m > cnt.t && cnt.m >= cnt.b ? 'm' : cnt.b > cnt.t ? 'b' : 't';
  };
  const RAG: Record<string, string> = { l: '\\raggedright', c: '\\centering', r: '\\raggedleft' };
  const colType = (c: number, al: HAlign, width?: number | 'X', va: VAlign = 't') => {
    if (width) {
      const base = width === 'X' ? 'X' : `${va === 'm' ? 'm' : va === 'b' ? 'b' : 'p'}{${cmLen(width)}}`;
      if (width !== 'X') need.add('array');
      return al === 'j' ? base : `>{${RAG[al]}\\arraybackslash}${base}`;
    }
    return al === 'j' ? 'l' : al;
  };
  const colSpecs = m.cols.map((col, c) => nums[c] ? nums[c]!.spec : colType(c, col.al, fillCol(c) ? 'X' : col.w > 0 ? col.w : undefined, col.w > 0 ? vaOfCol(c) : 't'));
  let spec = '';
  for (let c = 0; c < nc; c++) spec += bar(vSpec[c]) + colSpecs[c];
  spec += bar(vSpec[nc]);
  if (m.cols.some((col, c) => !nums[c] && (col.w > 0 || fillCol(c)) && col.al !== 'j')) need.add('array');

  // ---- cells
  const anyColor = m.cells.some((row) => row.some((x) => x.bg)) || !!m.stripe;
  const fillOf = (r: number, c: number) => { const [ar, ac] = own[r][c], x = m.cells[ar][ac]; return x.bg || null; };
  const sizeCmd = (s?: string) => (s && s !== m.size ? `\\${s} ` : '');
  function content(r: number, c: number, x: TCell, wrapCol: boolean, inS: boolean): string {
    let t = x.t;
    // a unit on the column follows the last header row's text
    if (r === m.head - 1 && m.cols[c].unit && t.trim()) {
      need.add('siunitx');
      const u = `\\unit{${m.cols[c].unit}}`;
      t = m.unitStyle === 'bracket' ? `${t} [${u}]` : m.unitStyle === 'slash' ? `${t} / ${u}` : `${t} (${u})`;
    }
    const f = inS && nums[c] ? nums[c]!.fmt[r] : null;
    if (f) {
      // a number in an S column: siunitx reads it; font changes go before it
      let pre = '';
      if (isBold(m, r, x)) pre += '\\bfseries ';
      if (x.i) pre += '\\itshape ';
      if (x.fg) { need.add('xcolor'); pre += `\\color[HTML]{${hex(x.fg)}}`; }
      return pre + siString(f);
    }
    let s = safeTex(t).trim();
    if (!s) return '';
    const lines = s.split(/\n/).map((l) => l.trim());
    if (lines.length > 1) {
      if (wrapCol) s = lines.join(' \\newline ');
      else {
        const al = alignOf(m, c, x), va = x.va === 'm' ? 'c' : x.va === 'b' ? 'b' : 't';
        s = `\\begin{tabular}[${(x.rs || 1) > 1 ? 'c' : va}]{@{}${al === 'j' ? 'l' : al}@{}}${lines.join(' \\\\ ')}\\end{tabular}`;
      }
    }
    if (x.tt) s = `\\texttt{${s}}`;
    if (x.u) s = `\\underline{${s}}`;
    if (x.i) s = `\\textit{${s}}`;
    if (isBold(m, r, x)) s = `\\textbf{${s}}`;
    if (x.sz && x.sz !== m.size) s = `{${sizeCmd(x.sz)}${s}}`;
    if (x.fg) { need.add('xcolor'); s = `\\textcolor[HTML]{${hex(x.fg)}}{${s}}`; }
    // text in an S column is braced so siunitx leaves it alone
    return inS ? `{${s}}` : s;
  }
  // the cell's own column spec, when it can't use the table's
  function cellSpec(r: number, c: number, x: TCell): string | null {
    const cs = x.cs || 1, al = alignOf(m, c, x);
    const left = c === 0 ? m.vr[r][0] : null, right = m.vr[r][c + cs];
    const sameRules = (left == null || left === vSpec[0]) && right === vSpec[c + cs];
    if (cs === 1) {
      if (nums[c]) { if (sameRules) return null; return `${left != null ? bar(left) : ''}c${bar(right)}`; } // text in S is braced
      if (sameRules && al === m.cols[c].al) return null;
      const col = m.cols[c];
      const t = colType(c, al, fillCol(c) ? undefined : col.w > 0 ? col.w : undefined, x.va || 't');
      return `${left != null ? bar(left) : ''}${t}${bar(right)}`;
    }
    // over several columns: the alignment, wrapping at the columns' total width when they wrap
    let w = 0;
    for (let k = c; k < c + cs; k++) w = m.cols[k].w > 0 && w >= 0 ? w + m.cols[k].w : -1;
    const t = w > 0 ? colType(c, al, w + ((cs - 1) * 2 * m.pad) / 28.4528 * 1, x.va || 't') : (al === 'j' ? 'l' : al);
    return `${left != null ? bar(left) : ''}${t}${bar(right)}`;
  }

  // ---- horizontal rules between rows
  const booktabs = m.booktabs;
  if (booktabs && m.hr.some((row) => row.some(Boolean))) need.add('booktabs');
  function ruleLine(k: number): string {
    const row = m.hr[k];
    if (!row.some(Boolean)) return '';
    const full = row.every((w) => w === row[0]);
    if (full && row[0] === 3) return '\\hline\\hline';
    if (!full && row.includes(3)) {
      // a double rule over some columns: hhline, which also meets the vertical rules
      need.add('hhline');
      const vr = m.vr[Math.min(k, nr - 1)];
      let h = '';
      for (let c = 0; c <= nc; c++) {
        h += vr[c] === 3 ? '||' : vr[c] ? '|' : '';
        if (c < nc) h += row[c] === 3 ? '=' : row[c] ? '-' : '~';
      }
      return `\\hhline{${h}}`;
    }
    if (full) {
      const w = row[0];
      if (booktabs) {
        if (k === 0) return w === 2 ? '\\toprule' : '\\toprule[\\lightrulewidth]';
        if (k === nr) return w === 2 ? '\\bottomrule' : '\\bottomrule[\\lightrulewidth]';
        return w === 2 ? '\\midrule[\\heavyrulewidth]' : '\\midrule';
      }
      return w === 2 ? (rc ? `\\noalign{{${rc}\\hrule height ${tk}}}` : `\\noalign{\\hrule height ${tk}}`) : '\\hline';
    }
    // runs of columns with the same rule
    const out: string[] = [];
    for (let c = 0; c < nc;) {
      const w = row[c];
      let e = c;
      while (e + 1 < nc && row[e + 1] === w) e++;
      if (w) {
        if (booktabs) {
          const trim = (c > 0 ? 'l' : '') + (e < nc - 1 ? 'r' : '');
          out.push(`\\cmidrule${w === 2 ? '[\\heavyrulewidth]' : ''}${trim ? `(${trim})` : ''}{${c + 1}-${e + 1}}`);
        } else out.push(`\\cline{${c + 1}-${e + 1}}`);
      }
      c = e + 1;
    }
    return out.join(' ');
  }

  // ---- rows
  // a merge over several rows is written in its last row with a negative count when the table has fills:
  // a later row's colour would otherwise paint over its text
  const multirowAt = (ar: number, rs: number) => (anyColor ? ar + rs - 1 : ar);
  // stripes: \rowcolors before the table, except in a TikZ node (where xcolor comes without its table option)
  const rowcolors = !o.bare && !!(m.stripe || m.stripe2);
  const rowLines: string[] = [];
  for (let r = 0; r < nr; r++) {
    const cells: string[] = [];
    const stripe = stripeOf(m, r);
    for (let c = 0; c < nc;) {
      const [ar, ac] = own[r][c], x = m.cells[ar][ac], cs = x.cs || 1, rs = x.rs || 1;
      const wrapCol = !nums[c] && (m.cols[c].w > 0 || fillCol(c)) && cs === 1;
      // fill: the cell's own, or the stripe's when it differs from the row (written with \rowcolor)
      const fill = fillOf(r, c);
      const cellColor = fill ? (need.add('colortbl'), need.add('xcolor'), `\\cellcolor[HTML]{${hex(fill)}}`) : '';
      if (ac !== c) { c++; continue; } // inside a merge started to the left (cannot happen: we skip by cs)
      let txt = '';
      if (ar === r || multirowAt(ar, rs) === r) {
        // the anchor's text goes here
        if (ar === r && rs === 1) txt = content(ar, ac, x, wrapCol, !!nums[c] && cs === 1);
        else if (multirowAt(ar, rs) === r) {
          need.add('multirow');
          const inner = content(ar, ac, x, false, false);
          const n = r === ar ? rs : -rs;
          const va = x.va === 't' ? '[t]' : x.va === 'b' ? '[b]' : '';
          const width = x.mw || (cs === 1 && m.cols[c].w > 0 ? cmLen(m.cols[c].w) : '*');
          txt = inner ? `\\multirow${va}{${n}}{${width}}{${inner}}` : '';
        }
      }
      txt = cellColor + txt;
      // \multicolumn: over several columns, or a cell that differs from its column
      const sp = cellSpec(r, c, x);
      if (cs > 1 || sp) cells.push(`\\multicolumn{${cs}}{${sp || (alignOf(m, c, x) === 'j' ? 'l' : alignOf(m, c, x))}}{${txt}}`);
      else cells.push(txt);
      c += cs;
    }
    let line = cells.join(' & ');
    if (stripe && !rowcolors) { need.add('colortbl'); need.add('xcolor'); line = `\\rowcolor[HTML]{${hex(stripe)}}` + line; }
    // trailing empty cells can go, except in a striped row: its colour covers only the cells it has
    rowLines.push(stripe ? line : line.replace(/(\s*&\s*)+$/, ''));
  }

  // ---- body
  const body: string[] = [];
  const top = ruleLine(0);
  const lt = env === 'longtable';
  if (lt) need.add('longtable');
  if (env === 'tabularx') need.add('tabularx');
  const capLine = m.caption.trim() || m.label.trim()
    ? `${m.caption.trim() ? `\\caption{${safeTex(m.caption.trim())}}` : ''}${m.label.trim() ? `\\label{${m.label.trim()}}` : ''}` : '';
  const row = (r: number, rule = true) => { body.push(`${rowLines[r]} \\\\${m.skip[r] ? `[${m.skip[r]}]` : ''}`); const rl = ruleLine(r + 1); if (rule && rl) body.push(rl); };
  if (!lt) {
    if (top) body.push(top);
    for (let r = 0; r < nr; r++) row(r);
  } else {
    // longtable carries its own caption as its first row, repeats the header on every page and writes the footer
    // once, at the end; the other pages end with the rule above it
    const H = m.head < nr ? m.head : 0, F = Math.max(0, Math.min(m.foot, nr - H)), fr = nr - F;
    const capRow = capLine && !o.bare ? `${capLine} \\\\` : '';
    if (capRow && m.capTop) body.push(capRow);
    if (top) body.push(top);
    for (let r = 0; r < H; r++) row(r);
    if (H || F) {
      body.push('\\endfirsthead');
      if (top) body.push(top);
      for (let r = 0; r < H; r++) row(r);
      body.push('\\endhead');
    }
    if (F) {
      const above = ruleLine(fr);
      if (above) body.push(above);
      body.push('\\endfoot');
      if (above) body.push(above);
      for (let r = fr; r < nr; r++) row(r);
      if (capRow && !m.capTop) body.push(capRow);
      body.push('\\endlastfoot');
    }
    for (let r = H; r < fr; r++) row(r, r + 1 < fr || !F);
    if (capRow && !m.capTop && !F) body.push(capRow);
  }

  const align = m.place === 'left' ? 'l' : m.place === 'right' ? 'r' : 'c';
  const pos = m.tpos ? `[${m.tpos}]` : '';
  const open = env === 'tabularx' ? `\\begin{tabularx}{${m.width === 1 ? '' : +m.width.toFixed(2)}\\linewidth}${pos}{${spec}}`
    : lt ? `\\begin{longtable}${align === 'c' ? '' : `[${align}]`}{${spec}}` : `\\begin{tabular}${pos}{${spec}}`;
  // colortbl's \arrayrulecolor is global: the tables after this one get black rules again
  const tab = [open, ...body.map((l) => '  ' + l), `\\end{${env}}`, ...(rc ? ['\\arrayrulecolor{black}'] : [])];

  const settings: string[] = [];
  if (Math.abs(m.pad - 6) > 1e-6) settings.push(`\\setlength{\\tabcolsep}{${+m.pad.toFixed(2)}pt}`);
  if (Math.abs(m.stretch - 1) > 1e-6) settings.push(`\\renewcommand{\\arraystretch}{${+m.stretch.toFixed(2)}}`);
  if (Math.abs(m.ruleW - 0.4) > 1e-6) settings.push(`\\setlength{\\arrayrulewidth}{${+m.ruleW.toFixed(2)}pt}`);
  if (rc) settings.push(`\\arrayrulecolor[HTML]{${hex(m.ruleColor)}}`);
  if (rowcolors) {
    // xcolor counts rows from 1, and its odd rows are the ones with an odd number
    need.add('xcolor'); need.add('xcolor-table');
    const from = (m.stripeFrom < 0 ? m.head : m.stripeFrom) + 1;
    const first = m.stripe2, second = m.stripe; // the row the stripes start at, then the one after it
    const odd = from % 2 ? first : second, even = from % 2 ? second : first;
    const name = (c: string, n: string) => (c ? (settings.push(`\\definecolor{${n}}{HTML}{${hex(c)}}`), n) : '');
    const a = name(odd, odd === even ? 'stripe' : 'stripeOdd'), b = odd === even ? a : name(even, 'stripeEven');
    settings.push(`\\rowcolors{${from}}{${a}}{${b}}`);
  }
  if (m.size !== 'normalsize') settings.unshift(`\\${m.size}`);

  let lines: string[];
  if (o.bare) lines = settings.length ? ['{' + settings.join(' '), ...tab, '}'] : tab;
  else if (lt) lines = settings.length ? ['{' + settings.join(' '), ...tab, '}'] : tab;
  else if (m.float || capLine) { // a caption or label needs the table environment
    const pos = m.place === 'left' ? '\\raggedright' : m.place === 'right' ? '\\raggedleft' : '\\centering';
    if (/H/.test(m.floatPos)) need.add('float');
    lines = [`\\begin{table}[${m.floatPos}]`, '  ' + pos, ...settings.map((s) => '  ' + s), ...(capLine && m.capTop ? ['  ' + capLine] : []),
      ...tab.map((l) => '  ' + l), ...(capLine && !m.capTop ? ['  ' + capLine] : []), '\\end{table}'];
  } else {
    const envName = m.place === 'left' ? 'flushleft' : m.place === 'right' ? 'flushright' : 'center';
    lines = [`\\begin{${envName}}`, ...settings.map((s) => '  ' + s), ...tab.map((l) => '  ' + l), `\\end{${envName}}`];
  }
  // amsmath's matrices and alignments in a cell (pmatrix, cases, aligned…; array is LaTeX's own)
  if (m.cells.some((row) => row.some((x) => /\\begin\{(?:[pbvBV]?matrix\*?|smallmatrix|cases\*?|aligned|gathered|split|alignedat)\}/.test(x.t)))) need.add('amsmath');
  const packages = packageLines(need);
  let code = lines.join('\n');
  if (o.standalone) {
    code = ['\\documentclass{article}', '\\usepackage{amsmath, amssymb}', ...packages.filter((p) => !p.includes('{amsmath}')), '\\pagestyle{empty}', '', '\\begin{document}', '', code, '', '\\end{document}', ''].join('\n');
  }
  return { code, packages };
}

/** The snippet people paste into their own document: the packages as a comment, then the table. */
export function snippet(m: TableModel) {
  const r = toLatex(m);
  return (r.packages.length ? `% Preamble: ${r.packages.join(' ')}\n` : '') + r.code;
}
