import { labelImage } from '../label-image';
// Table model → a picture, laid out the way LaTeX sets the table: column widths from the widest cell (or the
// width given), \tabcolsep on both sides of each column, rows at least \arraystretch × the baseline, booktabs
// rules with their space above and below, numbers aligned on the decimal marker. Drawn as SVG with the app's
// own text renderer (KaTeX maths), so the preview, the SVG and the PNG are one picture.
import type { TableModel, TCell } from './model';
import { nRows, nCols, owners, stripeOf, isBold, alignOf, thickPt, lenPt } from './model';
import { parseNum, format, texParts, unitTex, numStyle } from './numbers';
import { envRanges } from './latex';
import { runtime as TD } from '../../runtime';
import { escapeHtml } from '../../core/html';

const K = () => TD.PT_PER_PX as number; // pt per px
const pt = (v: number) => v / K();      // pt → px
const r2 = (v: number) => Math.round(v * 100) / 100;
const escAttr = escapeHtml;

export interface CellBox {
  r: number; c: number; rs: number; cs: number;
  x: number; y: number; w: number; h: number;
  /** what is drawn */
  text: string; st: Record<string, any>;
  tw: number; th: number;
  /** numbers: the two halves at the decimal marker */
  num?: { left: string; right: string; exp: string; lw: number; rw: number; ew: number };
}
export interface Layout {
  w: number; h: number;
  colX: number[]; rowY: number[];
  /** each row's height (without the rules' gaps) */
  rowH: number[];
  cells: CellBox[];
  /** the table's frame (rules included) */
  pad: number;
  caption?: { text: string; x: number; y: number; w: number; h: number; st: any };
  tableY: number;
}

/** The text a cell shows: its own, with the column's unit after the last header row's text. */
export function shownText(m: TableModel, r: number, c: number, x: TCell) {
  let t = x.t;
  if (r === m.head - 1 && m.cols[c] && m.cols[c].unit && t.trim()) {
    const u = unitTex(m.cols[c].unit!);
    t = m.unitStyle === 'bracket' ? `${t} [${u}]` : m.unitStyle === 'slash' ? `${t} / ${u}` : `${t} (${u})`;
  }
  // the preview draws a \\ in text as a new line, as the LaTeX gets it
  // (but not inside an environment: a pmatrix's \\ is its own row)
  const envs = envRanges(t);
  return t.replace(/(^|[^\\])\\\\/g, (all, pre, at) => (envs.some(([a, b]) => at + pre.length >= a && at + pre.length < b) ? all : pre + '\n'));
}
const styleOf = (m: TableModel, r: number, x: TCell) => ({ size: x.sz || m.size, font: 'default', bold: isBold(m, r, x), italic: !!x.i });
const decorate = (t: string, x: TCell) => {
  let s = t;
  if (x.tt) s = s.split('\n').map((l) => (l.trim() ? `\\texttt{${l}}` : l)).join('\n');
  if (x.u) s = s.split('\n').map((l) => (l.trim() ? `\\underline{${l}}` : l)).join('\n');
  return s;
};
/** booktabs' rule widths and the space round them, in pt */
const RULE = { heavy: 0.8, light: 0.5, above: 0.4 * 4.3, below: 0.65 * 4.3, double: 2 };
/** A rule's width in pt (a double rule: both lines and the space between them), outside booktabs. */
const plainW = (m: TableModel, w: number) => (w === 3 ? 2 * m.ruleW + RULE.double : w === 2 ? thickPt(m) : m.ruleW);
const ALIGN: Record<string, string> = { l: 'left', c: 'center', r: 'right', j: 'justify' };

export function layout(m: TableModel, o: { textWidthCm?: number } = {}): Layout {
  const nr = nRows(m), nc = nCols(m), own = owners(m);
  const px = TD.sizePx(m.size) as number, ptSize = px * K();
  const padX = pt(m.pad);
  // LaTeX's strut: 0.7 / 0.3 of the baseline (1.2 × the font size), times \arraystretch
  const strutH = pt(ptSize * 1.2 * m.stretch * 0.7), strutD = pt(ptSize * 1.2 * m.stretch * 0.3);
  const textW = (o.textWidthCm ?? 15) * TD.PX_PER_CM;
  const anchors: CellBox[] = [];
  const natural = new Array(nc).fill(0);
  // numbers per column: widths of the halves
  // the parts siunitx lines up: integer, decimals, the power of ten
  const numL = new Array(nc).fill(0), numR = new Array(nc).fill(0), numE = new Array(nc).fill(0);
  const numSt = m.cols.map((col) => (col.num ? numStyle(col.num) : undefined));
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    if (own[r][c][0] !== r || own[r][c][1] !== c) continue;
    const x = m.cells[r][c], rs = x.rs || 1, cs = x.cs || 1, st: any = styleOf(m, r, x);
    const col = m.cols[c];
    const box: CellBox = { r, c, rs, cs, x: 0, y: 0, w: 0, h: 0, text: '', st, tw: 0, th: 0 };
    const n = col.num && r >= m.head && cs === 1 ? parseNum(x.t) : null;
    if (n) {
      const [a, ab] = texParts(format(n, col.num), col.num!.unc || 'paren', numSt[c]);
      const at = ab.indexOf(numSt[c]!.prod + ' 10^'), b = at < 0 ? ab : ab.slice(0, at), e = at < 0 ? '' : ab.slice(at);
      // {} before the product: spaced as a binary operator, as siunitx sets it, even after a whole number
      const L = TD.textBox(`$${a}$`, st), R = b ? TD.textBox(`$\\vphantom{1}{}${b}$`, st) : { w: 0, h: L.h }, E = e ? TD.textBox(`$\\vphantom{1}{}${e}$`, st) : { w: 0, h: L.h };
      box.num = { left: `$${a}$`, right: b ? `$${b}$` : '', exp: e ? `$\\vphantom{1}{}${e}$` : '', lw: a ? L.w - 2 : 0, rw: b ? R.w - 2 : 0, ew: e ? E.w - 2 : 0 };
      box.tw = box.num.lw + box.num.rw + box.num.ew; box.th = Math.max(L.h, R.h, E.h);
      numL[c] = Math.max(numL[c], box.num.lw); numR[c] = Math.max(numR[c], box.num.rw); numE[c] = Math.max(numE[c], box.num.ew);
    } else {
      box.text = decorate(shownText(m, r, c, x), x);
      if (cs === 1 && col.w > 0) st.tw = col.w * TD.PX_PER_CM;
      // \multirow{3}{4em}{…} wraps at its own width
      else if (cs === 1 && x.mw && lenPt(x.mw)) st.tw = pt(lenPt(x.mw)!);
      if (cs === 1 && st.tw) st.align = ALIGN[alignOf(m, c, x)];
      if (box.text.trim()) { const b = TD.textBox(box.text, st); box.tw = b.w - (st.tw ? 0 : 2); box.th = b.h; }
      else { box.tw = 0; box.th = 0; }
    }
    if (cs === 1 && !box.num) natural[c] = Math.max(natural[c], box.tw);
    anchors.push(box);
  }
  // column widths: fixed, the widest cell, or the room left (tabularx)
  const widths = m.cols.map((col, c) => {
    if (col.num) return Math.max(natural[c], numL[c] + numR[c] + numE[c]);
    if (col.w > 0) return col.w * TD.PX_PER_CM;
    return natural[c];
  });
  if (m.env === 'tabularx') {
    const fill = m.cols.map((col, c) => !col.num && (col.fill || !m.cols.some((x) => x.fill)) ? c : -1).filter((c) => c >= 0);
    if (fill.length) {
      const fixed = widths.reduce((s, w, c) => s + (fill.includes(c) ? 0 : w + 2 * padX), 0);
      const each = Math.max(20, (textW * m.width - fixed) / fill.length - 2 * padX);
      for (const c of fill) widths[c] = each;
      // cells in X columns wrap at that width: measured again
      for (const b of anchors) if (b.cs === 1 && fill.includes(b.c) && !b.num && b.text.trim()) {
        b.st.tw = each; b.st.align = ALIGN[alignOf(m, b.c, m.cells[b.r][b.c])];
        const tb = TD.textBox(b.text, b.st); b.tw = tb.w; b.th = tb.h;
      }
    }
  }
  // a merge wider than its columns widens the last of them (as \multicolumn does)
  for (const b of anchors) if (b.cs > 1) {
    let span = 0;
    for (let k = b.c; k < b.c + b.cs; k++) span += widths[k] + 2 * padX;
    span -= 2 * padX;
    if (b.tw > span) widths[b.c + b.cs - 1] += b.tw - span;
  }
  // rows: the strut, or the tallest single-row cell
  const heights = new Array(nr).fill(strutH + strutD);
  for (const b of anchors) if (b.rs === 1) heights[b.r] = Math.max(heights[b.r], b.th + pt(2));
  // \\[0.5ex]: room after the row
  for (let r = 0; r < nr; r++) { const v = m.skip[r] ? lenPt(m.skip[r]) : null; if (v) heights[r] = Math.max(pt(2), heights[r] + pt(v)); }
  // a merge taller than its rows grows the last of them
  for (const b of anchors) if (b.rs > 1) {
    let span = 0;
    for (let k = b.r; k < b.r + b.rs; k++) span += heights[k];
    if (b.th > span) heights[b.r + b.rs - 1] += b.th - span;
  }
  // rules take room: the line itself, and booktabs' space round it
  // a double rule is \hline\hline even in a booktabs table: no space round it
  const ruleW = (w: number) => (!w ? 0 : m.booktabs && w !== 3 ? (w === 2 ? RULE.heavy : RULE.light) : plainW(m, w));
  const gapAt = (k: number) => {
    const row = m.hr[k], w = Math.max(...row);
    if (!w) return 0;
    let g = pt(ruleW(w));
    if (m.booktabs && w !== 3) g += pt((k > 0 ? RULE.above : 0) + (k < nr ? RULE.below : 0));
    return g;
  };
  const rowY: number[] = [];
  // the caption sits above or below
  let y = 0;
  let caption: Layout['caption'];
  const capText = m.caption.trim() ? `Table 1: ${m.caption.trim()}` : '';
  const capSt = { size: m.size, font: 'default' };
  const capBox = capText ? TD.textBox(capText, capSt) : null;
  if (capBox && m.capTop) { caption = { text: capText, x: 0, y: 0, w: capBox.w, h: capBox.h, st: capSt }; y += capBox.h + pt(10); }
  const tableY = y;
  for (let k = 0; k < nr; k++) { y += gapAt(k); rowY.push(y); y += heights[k]; }
  y += gapAt(nr);
  rowY.push(y);
  const colX: number[] = [];
  let x = 0;
  const vGap = (c: number) => { const w = Math.max(0, ...m.vr.map((row) => row[c])); return w ? pt(plainW(m, w)) : 0; };
  for (let c = 0; c < nc; c++) { x += vGap(c); colX.push(x); x += widths[c] + 2 * padX; }
  x += vGap(nc);
  colX.push(x);
  const W = x;
  if (capBox && !m.capTop) { caption = { text: capText, x: 0, y: y + pt(10), w: capBox.w, h: capBox.h, st: capSt }; }
  if (caption) caption.x = Math.max(0, (W - caption.w) / 2);
  const H = caption && !m.capTop ? caption.y + caption.h : y;
  // the cells' boxes
  for (const b of anchors) {
    b.x = colX[b.c]; b.y = rowY[b.r];
    b.w = colX[b.c + b.cs] - colX[b.c] - (b.c + b.cs < nc ? vGap(b.c + b.cs) : vGap(nc));
    // the row's bottom: the start of the next row minus the rule's gap
    b.h = rowY[b.r + b.rs - 1] + heights[b.r + b.rs - 1] - b.y;
  }
  // numbers: the column's halves aligned
  for (const b of anchors) if (b.num) { (b as any).numL = numL[b.c]; (b as any).numR = numR[b.c]; (b as any).numE = numE[b.c]; }
  return { w: W, h: H, colX, rowY, rowH: heights, cells: anchors, pad: padX, caption, tableY };
}

/** The table's drawing, its top-left corner at (0, 0). ctx.export: for a file (no hit areas). */
export function draw(m: TableModel, ctx: { export?: boolean } = {}): { svg: string; w: number; h: number } {
  const L = layout(m), nr = nRows(m), nc = nCols(m);
  const out: string[] = [];
  const padX = L.pad;
  // fills: stripes under the cells' own fills, a row from the first column to the last
  for (let r = 0; r < nr; r++) {
    const s = stripeOf(m, r);
    if (s) {
      const y0 = L.rowY[r], y1 = L.rowY[r] + L.rowH[r];
      out.push(`<rect x="${r2(L.colX[0])}" y="${r2(y0)}" width="${r2(L.colX[nc] - L.colX[0])}" height="${r2(y1 - y0)}" fill="${s}"/>`);
    }
  }
  for (const b of L.cells) {
    const x = m.cells[b.r][b.c];
    if (!x.bg) continue;
    out.push(`<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(L.colX[b.c + b.cs] - b.x)}" height="${r2(b.h)}" fill="${x.bg}"/>`);
  }
  // rules: each sits in the gap between two rows, below booktabs' space above it
  const ink = m.ruleColor || '#000000';
  const end = (r: number) => L.rowY[r] + L.rowH[r];
  const gapTop = (k: number) => (k === 0 ? L.tableY : end(k - 1));
  const hW = (w: number) => pt(m.booktabs ? (w === 2 ? RULE.heavy : RULE.light) : plainW(m, w));
  for (let k = 0; k <= nr; k++) {
    const row = m.hr[k], full = row.every((v) => v === row[0]);
    const y0 = gapTop(k) + (m.booktabs && k > 0 && Math.max(...row) !== 3 ? pt(RULE.above) : 0);
    for (let c = 0; c < nc;) {
      const w = row[c];
      let e = c;
      while (e + 1 < nc && row[e + 1] === w) e++;
      if (w) {
        let x0 = c === 0 ? 0 : L.colX[c], x1 = e === nc - 1 ? L.colX[nc] : L.colX[e + 1];
        // \cmidrule(lr) is trimmed by half an em at its inner ends
        if (m.booktabs && !full) { const trim = pt(5); if (c > 0) x0 += trim; if (e < nc - 1) x1 -= trim; }
        if (w === 3) { // two thin lines
          const t = pt(m.ruleW);
          out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(t)}" fill="${ink}"/>`, `<rect x="${r2(x0)}" y="${r2(y0 + t + pt(RULE.double))}" width="${r2(x1 - x0)}" height="${r2(t)}" fill="${ink}"/>`);
        } else out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(hW(w))}" fill="${ink}"/>`);
      }
      c = e + 1;
    }
  }
  // vertical rules: down each row and through the gaps round it, so they meet the rules
  for (let r = 0; r < nr; r++) for (let c = 0; c <= nc; c++) {
    const w = m.vr[r][c];
    if (!w) continue;
    const th = pt(plainW(m, w));
    const x0 = c < nc ? L.colX[c] - th : L.colX[nc] - th;
    const y0 = r === 0 ? L.tableY : end(r - 1), y1 = r === nr - 1 ? L.rowY[nr] : end(r);
    if (w === 3) { // two thin lines
      const t = pt(m.ruleW);
      out.push(`<rect x="${r2(Math.max(0, x0))}" y="${r2(y0)}" width="${r2(t)}" height="${r2(y1 - y0)}" fill="${ink}"/>`, `<rect x="${r2(x0 + th - t)}" y="${r2(y0)}" width="${r2(t)}" height="${r2(y1 - y0)}" fill="${ink}"/>`);
    } else out.push(`<rect x="${r2(Math.max(0, x0))}" y="${r2(y0)}" width="${r2(th)}" height="${r2(y1 - y0)}" fill="${ink}"/>`);
  }
  // text
  for (const b of L.cells) {
    const x = m.cells[b.r][b.c];
    const color = x.fg || '#000000';
    // text in an S column is centred, as siunitx sets it (table-text-alignment), unless the cell has its own
    const al = m.cols[b.c].num && !x.al ? 'c' : alignOf(m, b.c, x);
    const inner = { x: b.x + padX, w: b.w - 2 * padX };
    // vertical place: single rows sit on the strut's baseline area (top), merges centre (\multirow), or as set
    const va = x.va || (b.rs > 1 ? 'm' : 't');
    const top = va === 'm' ? b.y + (b.h - b.th) / 2 : va === 'b' ? b.y + b.h - b.th - pt(1) : b.y + Math.max(pt(1), (Math.min(b.h, (TD.sizePx(m.size) * 1.2 * m.stretch)) - b.th) / 2);
    if (b.num) {
      const NL = (b as any).numL as number, NR = (b as any).numR as number, NE = (b as any).numE as number;
      // the decimal marker: the numbers' block centred in the column, or at its left or right (table-number-alignment)
      const pos = m.cols[b.c].num?.pos, room = inner.w - NL - NR - NE;
      const cx0 = inner.x + (pos === 'l' ? 0 : pos === 'r' ? room : room / 2) + NL;
      out.push(fo(b.num.left, b.st, color, cx0 - b.num.lw - 1, top, b.num.lw + 2, b.th, ctx, 'right'));
      if (b.num.right) out.push(fo(b.num.right, b.st, color, cx0 - 1, top, b.num.rw + 2, b.th, ctx, 'left'));
      if (b.num.exp) out.push(fo(b.num.exp, b.st, color, cx0 + NR - 1, top, b.num.ew + 2, b.th, ctx, 'left'));
      continue;
    }
    if (!b.text.trim()) continue;
    const wrap = !!b.st.tw;
    const w = wrap ? b.st.tw : b.tw + 2;
    const left = al === 'c' ? inner.x + (inner.w - w) / 2 : al === 'r' ? inner.x + inner.w - w + (wrap ? 0 : 1) : inner.x - (wrap ? 0 : 1);
    out.push(fo(b.text, b.st, color, left, top, w, b.th, ctx, ({ l: 'left', c: 'center', r: 'right', j: 'left' } as Record<string, string>)[al]));
  }
  if (L.caption) out.push(fo(L.caption.text, L.caption.st, '#000000', L.caption.x - 1, L.caption.y, L.caption.w, L.caption.h, ctx, 'center'));
  return { svg: out.join(''), w: L.w, h: L.h };
}
function fo(text: string, st: any, color: string, x: number, y: number, w: number, h: number, ctx: { export?: boolean }, align: string) {
  const b = TD.textBox(text, st);
  const ns = ctx.export ? ' xmlns="http://www.w3.org/1999/xhtml"' : '';
  const html = ctx.export ? TD.math.forXml(b.html) : b.html;
  if (/<math\b|class="td-math/.test(b.html)) {
    if (TD.measuring?.()) return ''; // this pass is drawn again with real sizes: a picture now is wasted
    const width = r2(Math.max(w, b.w)), height = r2(Math.max(h, b.h));
    const html = TD.math.cleanPreview(b.html);
    const image = labelImage(/class="katex(?:\s|")/.test(html) ? 'katex' : /class="td-math/.test(html) ? 'temml' : TD.math.engine, html, b.css, color, width, height, align);
    // no href: the picture was left for a later draw (labelBudget), shown as pending until then
    const ids = TD.math.isPending(b.html) ? TD.math.pendingIds(b.html).join(',') : '', pending = !!ids || !image.href;
    return `<image class="svg-label${pending ? ' math-pending' : ''}"${ids ? ` data-math-pending="${ids}"` : ''}${image.later ? ` data-later="${image.later}" data-lx="${r2(x)}" data-ly="${r2(y)}"` : ''} x="${r2(x) + image.x}" y="${r2(y) + image.y}" width="${image.width}" height="${image.height}" preserveAspectRatio="none"${image.href ? ` href="${image.href}"` : ''} role="img" aria-label="${escAttr(text)}"/>`;
  }
  return `<foreignObject x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(w, b.w))}" height="${r2(Math.max(h, b.h))}" style="overflow:visible;font-size:0;text-align:${align}"><div${ns} class="tx" style="${escAttr(b.css)}color:${color};text-align:${align}">${html}</div></foreignObject>`;
}
