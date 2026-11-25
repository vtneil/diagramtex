import { runtime as TD } from '../runtime';
// pgf-pie's \pie[…]{value/label, …}: a Pie chart with s.pgf (its options), drawn as tikzlibrarypie.code.tex draws it
// and written back as \pie. Slices run counter-clockwise from `rotate` (0° east), each \draw[line join=round,
// fill=…, style] with pgf's arc (Bézier pieces of at most 90°); numbers sit inside at pgf-pie's inner position;
// labels and pins hang off an empty node on the rim by TikZ's compass anchors; a legend stands right of what the pie
// drew. Measured against pdfLaTeX: nodes' inner sep is the document font's .3333em whatever their own font, and the
// picture's bounding box takes stroked paths' control points and half their line width.
const K = TD.PT_PER_PX, PX = TD.PX_PER_CM;
const CM = 72.27 / 2.54; // pt per cm
const EM = 10, EX = 4.30554; // the document's 10pt font (Computer Modern)
const f = (n: number) => { const v = Math.round(n * 1e4) / 1e4; return Object.is(v, -0) ? '0' : String(v); };

/** pgf-pie's colours, in order: [xcolor as written, hex]. */
export const PGFPIE_COLORS: [string, string][] = [
  ['blue!60', '#6666ff'], ['cyan!60', '#66ffff'], ['yellow!60', '#ffff66'], ['orange!60', '#ffb366'], ['red!60', '#ff6666'],
  ['blue!60!cyan!60', '#66a3ff'], ['cyan!60!yellow!60', '#a3ffc2'], ['red!60!cyan!60', '#c2a3a3'], ['red!60!blue!60', '#c266a3'], ['orange!60!cyan!60', '#c2d1a3'],
];
export const PGFPIE_TEXT = ['label', 'pin', 'inside', 'legend', 'none'];
/** \pie's defaults (pgf-pie's own): what an option equal to them leaves out of the export. */
export const pgfPieDefaults = () => ({
  text: 'label', sum: 100 as number | 'auto', rotate: 0, explode: [0], colors: PGFPIE_COLORS.map((c) => [...c]),
  before: '', after: '\\%', style: 'thick', lw: 0.8, stroke: '#000000' as string | null, dash: 'solid',
  hideNumber: false, hideLabel: false, polar: false, changeDirection: false, scaleFont: false,
  pinDistance: null as number | null, align: '',
});
const opts = (s: any) => ({ ...pgfPieDefaults(), ...(s.pgf || {}) });
/** The number after each value when nothing sets it: % when the sum is 100 (pgf-pie's late after number). */
export const pgfPieAfter = (sum: any) => (String(sum) === '100' ? '\\%' : '');

/** The slices: label, value as written, colour (a row's own #hex, else pgf-pie's list in turn). */
export function pgfPieRows(s: any) {
  const P = opts(s), cols = P.colors.length ? P.colors : PGFPIE_COLORS, rows: any[] = [];
  for (const line of String(s.data || '').split('\n')) {
    let t = line.trim();
    if (!t) continue;
    let own = null;
    const cm = t.match(/(?:^|\s+)(#[0-9a-fA-F]{6})$/);
    if (cm) { own = cm[1].toLowerCase(); t = t.slice(0, cm.index).trim(); }
    const m = t.match(/^(?:(.*?)[\s,;]+)?(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
    if (!m) continue;
    const c = cols[rows.length % cols.length];
    rows.push({ label: (m[1] || '').trim(), raw: m[2], value: +m[2], hex: own || c[1], tex: own ? null : c[0] });
  }
  return rows;
}

// pgf's \pgfpatharc: pieces of 90° (60° when 90–115° are left), each a Bézier with handles 4/3·tan(Δ/4)·r long
function arcPieces(a: number, b: number, r: number) {
  const P = (t: number, d = r) => [d * Math.cos((t * Math.PI) / 180), d * Math.sin((t * Math.PI) / 180)];
  const out: number[][] = [];
  const piece = (x: number, y: number) => {
    const d = Math.abs(y - x), k = (Math.abs(d - 90) < 1e-9 ? 0.55228475 : (4 / 3) * Math.tan((d * Math.PI) / 720)) * r, up = y > x ? 1 : -1;
    const p0 = P(x), p1 = P(y), h0 = P(x + 90 * up, k), h1 = P(y - 90 * up, k);
    out.push([p0[0] + h0[0], p0[1] + h0[1], p1[0] + h1[0], p1[1] + h1[1], p1[0], p1[1]]);
  };
  let x = a;
  for (let guard = 0; Math.abs(x - b) > 90 && guard < 1000; guard++) {
    const step = Math.abs(x - b) > 115 ? 90 : 60, y = x + (b > x ? step : -step);
    piece(x, y); x = y;
  }
  piece(x, b);
  return out;
}

// TikZ's anchor for a label or pin whose direction (from its node's centre to the border point it hangs from) is d
function compass(dx: number, dy: number) {
  const e = 0.05;
  if (dy > e) return dx < -e ? 'south east' : dx > e ? 'south west' : 'south';
  if (dy < -e) return dx < -e ? 'north east' : dx > e ? 'north west' : 'north';
  return dx < 0 ? 'east' : 'west';
}
// where the line from a box's centre towards (tx, ty) leaves it (half sizes hw, hh)
function rectBorder(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

const BREAK = /\s*\\\\(?:\[[^\]]*\])?\s*/g;
const emOf = (sz: any) => (typeof sz === 'number' ? sz : TD.sizePx(sz)) * K; // the font size, pt
// a node's text as TeX sets it (pt): its width, height and depth (the first line's height, the last line's depth,
// 1.2em from line to line; ht0 the first line's own height), and how far above its box's middle the app's drawing
// of it is centred (lift, as automata.ts works it out from Computer Modern's heights)
function texText(text: string, sz: any) {
  const t = String(text || '').replace(BREAK, '\n');
  if (!t.trim()) return { t, lines: 0, w: 0, ht: 0, dp: 0, ht0: 0, lift: 0 };
  const em = emOf(sz) / K, b = TD.textBox(t, { size: sz }), ls = t.split('\n'), n = ls.length, L = b.h / n;
  const f = TD.texLineHD ? TD.texLineHD(ls[0], em) : null, l = TD.texLineHD ? TD.texLineHD(ls[n - 1], em) : null;
  const ht0 = f ? f.ht : 0.55 * L, dp = l ? l.dp : 0.25 * L;
  const lift = ((n - 1) * (1.2 * em - L) + (l ? l.dp : 0) - (f ? f.ht : 0.694 * em)) / 2 + 0.347 * em;
  return { t, lines: n, w: Math.max(0, b.w - 2) * K, ht: (ht0 + 1.2 * em * (n - 1)) * K, dp: dp * K, ht0: ht0 * K, lift: lift * K };
}

/**
 * What \pie draws, about its centre (pt, y up): slices, texts (centred), pin edges and legend boxes, and the
 * picture's bounding box after it (bb: [x0, y0, x1, y1]).
 */
export function pgfPieLayout(s: any) {
  const P = opts(s), rows = pgfPieRows(s), n = rows.length;
  const sum = P.sum === 'auto' ? rows.reduce((a, r) => a + r.value, 0) : +P.sum;
  const R = (s.r || 0) * K, lw = P.stroke ? P.lw : 0, isep = EM / 3, os0 = 0.2; // outer sep under the picture's 0.4pt
  const fontPx = TD.sizePx(s.size ?? 'normalsize');
  const items: any[] = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, g = 0) => { bb[0] = Math.min(bb[0], x - g); bb[1] = Math.min(bb[1], y - g); bb[2] = Math.max(bb[2], x + g); bb[3] = Math.max(bb[3], y + g); };
  // a node holding `text` (lines at \\) and `empty` more empty lines after it (1) or before it (-1), as label\\ and
  // \\number make: centred at (x, y), its box (TeX's height and depth, inner sep) in the bounding box, its text drawn
  const textNode = (text: string, x: number, y: number, sz: any, empty = 0) => {
    const t = texText(text, sz), skip = empty ? 1.2 * emOf(sz) : 0;
    // the node's height: the text's, and the empty line's skip (an empty line has no height or depth of its own)
    const H = !t.lines ? skip : empty > 0 ? t.ht + skip : empty < 0 ? skip + t.ht - t.ht0 + t.dp : t.ht + t.dp;
    const mid = empty > 0 ? y + H / 2 - (t.ht + t.dp) / 2 : empty < 0 ? y - H / 2 + (t.ht + t.dp) / 2 : y;
    if (t.lines) items.push({ k: 'text', text: t.t, x, y: mid + t.lift, size: sz });
    add(x - t.w / 2 - isep, y - H / 2 - isep); add(x + t.w / 2 + isep, y + H / 2 + isep);
    return { hw: t.w / 2 + isep, hh: H / 2 + isep };
  };
  // a label or pin node hanging off point (x, y) in direction (dx, dy): its centre from TikZ's compass anchor
  const hang = (text: string, x: number, y: number, dx: number, dy: number, sz: any, os: number) => {
    const a = compass(dx, dy), t = texText(text, sz), hw = t.w / 2 + isep + os, hh = (t.ht + t.dp) / 2 + isep + os;
    const cx = x + (a.includes('west') ? hw : a.includes('east') ? -hw : 0), cy = y + (a.includes('south') ? hh : a.includes('north') ? -hh : 0);
    textNode(text, cx, cy, sz);
    return { cx, cy, hw, hh };
  };
  const pinDist = P.pinDistance ?? 3 * EX;
  let polarAngle = 0, unit = 0;
  if (P.polar) {
    let mx = 0;
    for (const r of rows) if (mx < r.value) mx = r.value;
    polarAngle = sum / Math.max(1, n); unit = mx > 0 ? R / Math.sqrt(mx) : 0;
  }
  let begin = P.changeDirection ? sum : 0;
  rows.forEach((row, i) => {
    const end = begin + (P.polar ? polarAngle : P.changeDirection ? -row.value : row.value);
    const rad = P.polar ? Math.sqrt(Math.max(0, row.value)) * unit : R;
    const e = (P.explode.length ? +P.explode[i % P.explode.length] || 0 : 0) * CM;
    const a1 = (begin / sum) * 360 + P.rotate, a2 = (end / sum) * 360 + P.rotate, mid = (a1 + a2) / 2;
    const dx = Math.cos((mid * Math.PI) / 180), dy = Math.sin((mid * Math.PI) / 180), O = [e * dx, e * dy];
    const p1 = [O[0] + rad * Math.cos((a1 * Math.PI) / 180), O[1] + rad * Math.sin((a1 * Math.PI) / 180)];
    const segs = arcPieces(a1, a2, rad).map((q) => q.map((v, k) => v + O[k % 2]));
    items.push({ k: 'slice', O, p1, segs, fill: row.hex });
    for (const [x, y] of [O, p1, ...segs.flatMap((q) => [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]]])]) add(x, y, lw / 2);
    const span = P.changeDirection ? a1 - a2 : a2 - a1;
    const inner = (Math.max(Math.min(((span - 10) / 110) * -0.3, 0), -0.5) + 0.8) * rad;
    const ix = O[0] + inner * dx, iy = O[1] + inner * dy;
    const sz = P.scaleFont ? Math.round(fontPx * ((row.value / sum) * 3 + 0.9) * 100) / 100 : s.size ?? 'normalsize';
    const num = P.hideNumber ? '' : `${P.before}${row.raw}${P.after}`, label = P.hideLabel ? '' : row.label;
    if (P.text === 'inside') {
      // label \\ number in one centred node: a hidden number or label still leaves its (empty) line
      if (label && num) textNode(`${label}\\\\${num}`, ix, iy, sz);
      else textNode(label || num, ix, iy, sz, label ? 1 : -1);
    } else {
      if (!P.hideLabel && (P.text === 'label' || P.text === 'pin')) {
        // an empty node (TikZ's 1pt minimum size, outer sep) on the rim, past the explode; its label or pin by its border
        const qx = O[0] + (rad + e) * dx, qy = O[1] + (rad + e) * dy, h0 = 0.5 + os0, t = h0 / Math.max(Math.abs(dx), Math.abs(dy));
        add(qx - 0.5, qy - 0.5); add(qx + 0.5, qy + 0.5);
        const bx = qx + t * dx, by = qy + t * dy;
        if (P.text === 'label') hang(label, bx, by, dx, dy, s.size ?? 'normalsize', os0);
        else {
          const pin = hang(label, bx + pinDist * dx, by + pinDist * dy, dx, dy, s.size ?? 'normalsize', os0);
          // every pin edge: help lines (gray, 0.2pt), from the node's border to the pin's
          const [x1, y1] = rectBorder(qx, qy, h0, h0, pin.cx, pin.cy), [x2, y2] = rectBorder(pin.cx, pin.cy, pin.hw, pin.hh, qx, qy);
          items.push({ k: 'line', x1, y1, x2, y2, stroke: '#808080', w: 0.2 });
          add(x1, y1, 0.1); add(x2, y2, 0.1);
        }
      }
      textNode(num, ix, iy, sz);
    }
    begin = end;
  });
  if (P.text === 'legend' && !P.hideLabel && n && Number.isFinite(bb[2])) {
    // right of everything drawn so far, a box per slice 0.5cm apart (below of=…), its label on the right (the box's
    // outer sep is half its style's line width, the label's half the picture's)
    const x = bb[2] + 0.8 * CM, os = lw / 2;
    let y = (bb[1] + bb[3]) / 2 + (n * 0.5 + 1) * 0.5 * CM;
    for (const row of rows) {
      y -= 0.5 * CM;
      items.push({ k: 'box', x, y, h: isep, fill: row.hex });
      add(x - isep, y - isep, lw / 2); add(x + isep, y + isep, lw / 2);
      hang(row.label, x + isep + os, y, 1, 0, s.size ?? 'normalsize', os0);
    }
  }
  if (!Number.isFinite(bb[0])) bb.splice(0, 4, 0, 0, 0, 0);
  return { items, bb, sum };
}

TD.pgfPie = { defaults: pgfPieDefaults, TEXT: PGFPIE_TEXT, after: pgfPieAfter, layout: pgfPieLayout, rows: pgfPieRows };

/** The pie on the canvas (and in SVG exports). */
export function pgfPieSvg(s: any, ctx: any) {
  const L = pgfPieLayout(s), P = opts(s);
  const X = (x: number) => s.cx + x / K, Y = (y: number) => s.cy - y / K, r2 = (v: number) => Math.round(v * 100) / 100;
  const stroke = P.stroke ? `stroke="${TD.css(P.stroke)}" stroke-width="${r2(P.lw / K)}"${P.dash === 'dashed' ? ` stroke-dasharray="${r2(3 / K)} ${r2(3 / K)}"` : P.dash === 'dotted' ? ` stroke-dasharray="${r2(P.lw / K)} ${r2(2 / K)}"` : ''}` : 'stroke="none"';
  let out = '', texts = '';
  for (const it of L.items) {
    if (it.k === 'slice') {
      const d = `M${r2(X(it.O[0]))},${r2(Y(it.O[1]))}L${r2(X(it.p1[0]))},${r2(Y(it.p1[1]))}` + it.segs.map((q: number[]) => `C${r2(X(q[0]))},${r2(Y(q[1]))} ${r2(X(q[2]))},${r2(Y(q[3]))} ${r2(X(q[4]))},${r2(Y(q[5]))}`).join('') + 'Z';
      out += `<path d="${d}" fill="${TD.css(it.fill)}" ${stroke} stroke-linejoin="round"/>`;
    } else if (it.k === 'box') {
      out += `<rect x="${r2(X(it.x - it.h))}" y="${r2(Y(it.y + it.h))}" width="${r2((2 * it.h) / K)}" height="${r2((2 * it.h) / K)}" fill="${TD.css(it.fill)}" ${stroke}/>`;
    } else if (it.k === 'line') {
      out += `<line x1="${r2(X(it.x1))}" y1="${r2(Y(it.y1))}" x2="${r2(X(it.x2))}" y2="${r2(Y(it.y2))}" stroke="${it.stroke}" stroke-width="${r2(it.w / K)}"/>`;
    } else if (it.k === 'text') {
      texts += TD.textSvg(it.text, { size: it.size }, '#000000', X(it.x), Y(it.y), ctx).replace(/<rect class="hitfill"[^>]*\/>/, '');
    }
  }
  return out + texts;
}

/** Where the pie draws (px): its bounding box's corners. */
export function pgfPieSamples(s: any) {
  const { bb } = pgfPieLayout(s);
  return [{ x: s.cx + bb[0] / K, y: s.cy - bb[3] / K }, { x: s.cx + bb[2] / K, y: s.cy - bb[1] / K }];
}

// a label as \foreach reads it: braced when it has a comma, a slash or spaces at its ends
const item = (t: string) => (/[,/]|^\s|\s$/.test(t) || !t.length ? `{${t}}` : t);
const braced = (t: string) => (/[,=\]]/.test(t) || /^\s|\s$/.test(t) ? `{${t}}` : t);

/** \pie[…]{…} with the options that differ from pgf-pie's defaults. */
export function pgfPieTikz(s: any, X: any) {
  X.pkgs.add('pgf-pie');
  const P = opts(s), D = pgfPieDefaults(), rows = pgfPieRows(s), o: string[] = [];
  const at = X.c(s.cx, s.cy);
  if (at !== '(0,0)') o.push(`pos={${at.slice(1, -1)}}`);
  const r = s.r / PX;
  if (Math.abs(r - 3) > 1e-6) o.push(`radius=${f(r)}`);
  // colours: the list as written while no slice has its own; else one per slice
  const own = rows.some((x: any) => !x.tex), list = own ? rows.map((x: any) => x.tex || X.col(x.hex)) : P.colors.map((c: any) => c[0]);
  if (own || list.join() !== D.colors.map((c: any) => c[0]).join()) o.push(`color={${list.join(', ')}}`);
  if (P.explode.some((v: any) => +v)) o.push(`explode=${P.explode.length === 1 ? f(+P.explode[0]) : `{${P.explode.map((v: any) => f(+v)).join(', ')}}`}`);
  if (+P.rotate) o.push(`rotate=${f(+P.rotate)}`);
  if (String(P.sum) !== '100') o.push(`sum=${P.sum === 'auto' ? 'auto' : f(+P.sum)}`);
  if (P.text !== 'label') o.push(P.text === 'none' ? 'hide label' : `text=${P.text}`);
  for (const [k, w] of [['hideNumber', 'hide number'], ['polar', 'polar'], ['changeDirection', 'change direction'], ['scaleFont', 'scale font']]) if (P[k]) o.push(w);
  if (P.hideLabel && P.text !== 'none') o.push('hide label');
  if (P.before) o.push(`before number=${braced(P.before)}`);
  if (P.after !== pgfPieAfter(P.sum)) o.push(`after number=${P.after ? braced(P.after) : ''}`);
  // (pgf-pie draws with [\pgfpie@style]: pgfkeys takes the macro whole as one key's name, so keys with values or a
  // list go in a style of their own, which the pie names)
  let pre = '';
  if (P.style !== 'thick') {
    if (/[=,]/.test(P.style)) { pre = `\\tikzset{tdpie/.style={${P.style}}}\n`; o.push('style=tdpie'); }
    else o.push(`style={${P.style}}`);
  }
  if (P.pinDistance != null) o.push(`pin distance=${f(P.pinDistance)}pt`);
  if (P.align) o.push(`/tikz/every label/.append style={align=${P.align}}`, `/tikz/every pin/.append style={align=${P.align}}`);
  if ((s.size ?? 'normalsize') !== 'normalsize') {
    const fo = TD.textOpts({ size: s.size }, X).find((x: string) => x.startsWith('font='));
    if (fo) o.push(`font={${fo.slice(5)}}`);
  }
  const data = rows.map((x: any) => `${x.raw}/${item(x.label)}`).join(', ');
  return `${pre}\\pie${o.length ? `[${o.join(', ')}]` : ''}{${data}}`;
}
