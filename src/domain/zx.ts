import { runtime as TD } from '../runtime';
// ZX-calculus diagrams written with the zx-calculus package. The source is the object: it is drawn
// here as vectors, following the package's own sizes and wire shapes, and exported unchanged inside
// \begin{ZX}. The visual editor (js/zxeditor.ts) rewrites the code cell by cell.
const { r2, esc } = TD.util;
const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, MM = PX / 10, PT = 1 / K;

TD.ZX_DEFAULT = [
  '\\begin{ZX}',
  '\\zxN{} \\rar &[\\zxwCol] \\zxZ{\\alpha} \\ar[r,o\',H] \\ar[r,o.] &[\\zxHCol] \\zxX-{\\beta} \\rar &[\\zxwCol] \\zxN{}',
  '\\end{ZX}',
].join('\n');

// the package's colours and spacing (zx-calculus 2023)
const FILL: Record<string, any> = { Z: '#ccffcc', X: '#ff8888', H: '#ffff00', LZ: '#ccffcc', LX: '#ffcccc' };
const SEP = 1.5 * MM;
// named spacings, for &[…] and \\[…]
const LENGTHS: Record<string, any> = {
  zxHCol: 1, zxHRow: 1, zxHColFlat: 1.5, zxHRowFlat: 1.5, zxSCol: 1, zxSRow: 1, zxSColFlat: 1.5, zxSRowFlat: 1.5,
  zxHSCol: 1, zxHSRow: 1, zxHSColFlat: 1, zxHSRowFlat: 1, zxWCol: 2, zxWRow: 2, zxwCol: 1, zxwRow: 1, zxDotsCol: 3, zxDotsRow: 3,
};

// ---------------------------------------------------------------- parsing
function close(s: any, i: any) {
  const open = s[i], shut = open === '{' ? '}' : ']';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (open === '[' && c === '{') { k = close(s, k); if (k < 0) return -1; continue; }
    if (c === open) d++;
    else if (c === shut && --d === 0) return k;
  }
  return -1;
}
const skipWs = (s: any, i: any) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
// top-level comma list → { list, map }; a quoted label ("…") stays one item
function opts(str: any) {
  const list: any[] = [], map: Record<string, any> = {};
  let d = 0, q = false, buf = '';
  const push = () => {
    const t = buf.trim(); buf = '';
    if (!t) return;
    list.push(t);
    const m = /^([^="]+?)\s*=\s*([\s\S]*)$/.exec(t);
    if (m) map[m[1].trim()] = m[2].trim().replace(/^\{([\s\S]*)\}$/, '$1');
  };
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\') { buf += c + (str[i + 1] || ''); i++; continue; }
    if (c === '"' && d === 0) q = !q;
    if (c === '{') d++; else if (c === '}') d--;
    if (c === ',' && d === 0 && !q) push(); else buf += c;
  }
  push();
  return { list, map };
}
function unwrap(src: any) {
  src = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
  const m = /\\begin\{ZX\}/.exec(src);
  if (!m) return { env: '', inner: src };
  let i = skipWs(src, m.index + m[0].length), env = '';
  if (src[i] === '[') { const j = close(src, i); if (j > 0) { env = src.slice(i + 1, j); i = j + 1; } }
  const e = src.indexOf('\\end{ZX}', i);
  return { env, inner: src.slice(i, e < 0 ? src.length : e) };
}
// rows (split at \\) of cells (split at &). Each cell keeps its raw text; `&[len]` and `\\[len]`
// are kept per cell (colSep: the sep before that cell) and per row (rowSep: after that row).
function grid(inner: any, amp: any) {
  const rows = [{ cells: [{ text: '', colSep: '' }], rowSep: '' }];
  let cur = rows[0].cells[0];
  const nextCell = (sep: any) => { cur = { text: '', colSep: sep }; rows[rows.length - 1].cells.push(cur); };
  const sepAfter = (i: any) => {
    const k = skipWs(inner, i);
    if (inner[k] === '[') { const j = close(inner, k); if (j > 0) return [inner.slice(k + 1, j), j + 1]; }
    return ['', i];
  };
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '{') { const j = close(inner, i); const k = j < 0 ? inner.length - 1 : j; cur.text += inner.slice(i, k + 1); i = k; continue; }
    if (c === '\\') {
      if (inner[i + 1] === '\\') {
        const [sep, j] = sepAfter(i + 2);
        rows[rows.length - 1].rowSep = sep;
        rows.push({ cells: [], rowSep: '' }); nextCell('');
        i = j - 1; continue;
      }
      if (amp && inner[i + 1] === '&') { const [sep, j] = sepAfter(i + 2); nextCell(sep); i = j - 1; continue; }
      cur.text += c + (inner[i + 1] || ''); i++; continue;
    }
    if (c === '&' && !amp) { const [sep, j] = sepAfter(i + 1); nextCell(sep); i = j - 1; continue; }
    cur.text += c;
  }
  // a trailing \\ leaves an empty last row
  while (rows.length > 1 && rows[rows.length - 1].cells.length === 1 && !rows[rows.length - 1].cells[0].text.trim()) { rows.pop(); rows[rows.length - 1].rowSep = rows[rows.length - 1].rowSep || ''; }
  return rows;
}
// \zxNL and \zxNR are shortcuts holding a cell break
const expandShortcuts = (t: any) => t.replace(/\\zxNL\b\s*/g, '\\zxN{} \\rar &[\\zxwCol] ').replace(/\\zxNR\b\s*/g, '&[\\zxwCol] \\zxN{} \\ar[l] ');

const NODE_CMDS = new Set(['zxZ', 'zxX', 'zxFracZ', 'zxFracX', 'zxH', 'zxN', 'zxNone', 'zxNoneDouble', 'zxEmptyDiagram']);
const ARROWS: Record<string, any> = { ar: '', arrow: '', rar: 'r', lar: 'l', uar: 'u', dar: 'd', urar: 'ur', ular: 'ul', drar: 'dr', dlar: 'dl' };
Object.setPrototypeOf(ARROWS, null); // `name in ARROWS` for any command typed (\constructor)
// one cell's contents: its node (or none), its wires, and anything not understood
function cell(text: any, warn: any) {
  const out = { node: (null as any), edges: ([] as any[]), rest: '' };
  let i = 0;
  const optArg = () => { const k = skipWs(text, i); if (text[k] !== '[') return null; const j = close(text, k); if (j < 0) return null; i = j + 1; return text.slice(k + 1, j); };
  const arg = () => { const k = skipWs(text, i); if (text[k] !== '{') return null; const j = close(text, k); if (j < 0) return null; i = j + 1; return text.slice(k + 1, j); };
  const flag = (ch: any) => { const k = skipWs(text, i); if (text[k] !== ch) return false; i = k + 1; return true; };
  const setNode = (n: any) => { if (out.node) warn('Only the first node of a cell is drawn'); else out.node = n; };
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(text.slice(i));
      if (!m) { out.rest += text.slice(i, i + 2); i += 2; continue; }
      const name = m[1], at = i;
      i += m[0].length;
      if (name === 'zxZ' || name === 'zxX') {
        const o = optArg() || '', star = flag('*'), minus = flag('-'), a = arg();
        setNode({ k: name.slice(2), o, star, minus, phase: a == null ? '' : a });
      } else if (name === 'zxFracZ' || name === 'zxFracX') {
        const o = optArg() || '', minus = flag('-'), num = arg() || '', p1 = optArg(), p2 = optArg(), den = arg() || '';
        setNode({ k: name.slice(6), frac: true, o, minus, num, den, numP: p1, denP: p2 });
      } else if (name === 'zxH') {
        const o = optArg() || ''; arg();
        setNode({ k: 'H', o });
      } else if (name === 'zxN' || name === 'zxNone' || name === 'zxNoneDouble') {
        const v = flag('+') ? '+' : flag('-') ? '-' : flag('|') ? '|' : '';
        const o = optArg() || ''; arg();
        setNode({ k: 'N', v, dbl: name === 'zxNoneDouble', cmd: name, o });
      } else if (name === 'zxEmptyDiagram') { arg(); setNode({ k: 'E', o: '' }); }
      else if (name in ARROWS) {
        let o = optArg();
        if (o == null && !ARROWS[name]) { const a = arg(); if (a != null) o = a; } // \ar{r}: tikz-cd's old syntax
        const list = opts(o || '').list;
        const dirs = ARROWS[name] || (list.length && /^[rlud]+$/.test(list[0]) ? list.shift() : '');
        out.edges.push({ dirs, styles: list, cmd: name });
      } else if (name === 'zxLoop') {
        const dir = optArg(), open = optArg(), o = optArg() || ''; arg();
        out.edges.push({ loop: true, dir: dir == null ? 90 : parseFloat(dir) || 0, open: open == null ? 20 : parseFloat(open) || 0, styles: opts(o).list, cmd: name });
      } else {
        // anything else is kept as text: maths in the cell (tikz-cd puts it in a node)
        while (optArg() != null);
        const a = /^(left|middle|right)ManyDots$|^zxLoopAboveDots$/.test(name) ? arg() : null;
        if (a != null || /ManyDots$|^zxLoopAboveDots$/.test(name)) warn(`\\${name} isn't drawn here (it is kept in the code)`);
        else out.rest += text.slice(at, i);
      }
      continue;
    }
    if (c === '{') { const j = close(text, i); const k = j < 0 ? text.length : j + 1; out.rest += text.slice(i, k); i = k; continue; }
    let j = i;
    while (j < text.length && text[j] !== '\\' && text[j] !== '{') j++;
    out.rest += text.slice(i, j);
    i = j;
  }
  out.rest = out.rest.trim();
  if (out.rest && !out.node) { out.node = { k: 'T', t: out.rest, o: '' }; out.rest = ''; }
  else if (out.rest) warn(`"${out.rest.slice(0, 24)}" next to a node isn't drawn`);
  return out;
}
function parse(src: any) {
  const warnings: any[] = [];
  const warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const { env, inner } = unwrap(src);
  const E = opts(env);
  const amp = E.list.includes('amp') || /ampersand replacement/.test(env);
  const rows = grid(expandShortcuts(inner), amp);
  const cells = rows.map((r) => r.cells.map((c) => cell(c.text, warn)));
  return { env: E, rows, cells, warnings, amp };
}

// ---------------------------------------------------------------- lengths
// one length: 1mm, 2pt, .5em, \zxHCol, -\zxDefaultColumnSep … → px (null when not understood)
function length(v: any, ctx: any) {
  v = String(v || '').trim();
  if (!v) return 0;
  const m = /^(-?)\s*([\d.]*)\s*(\\[A-Za-z]+|cm|mm|pt|em|ex|in|bp)?$/.exec(v);
  if (!m) return null;
  const sign = m[1] ? -1 : 1, n = m[2] === '' ? 1 : parseFloat(m[2]), u = m[3] || 'pt';
  if (!isFinite(n)) return null;
  let px;
  if (u[0] === '\\') {
    const name = u.slice(1);
    if (name in LENGTHS) px = LENGTHS[name] * MM;
    else if (name === 'zxDefaultColumnSep' || name === 'pgfmatrixcolumnsep') px = ctx.cs;
    else if (name === 'zxDefaultRowSep' || name === 'pgfmatrixrowsep') px = ctx.rs;
    else return null;
  } else px = u === 'cm' ? PX : u === 'mm' ? MM : u === 'in' ? 2.54 * PX : u === 'em' ? 10 * PT : u === 'ex' ? 4.3 * PT : u === 'bp' ? 1.00375 * PT : PT;
  return sign * n * px;
}
// an extra separation list (&[…] / \\[…]): summed, maybe "between origins"
function sepList(v: any, ctx: any, warn: any, row: any) {
  v = String(v || '').replace(/\\zxZeroCol\b/g, '-\\zxDefaultColumnSep').replace(/\\zxZeroRow\b/g, '-\\zxDefaultRowSep')
    .replace(/\\zxNCol\b/g, '-\\zxDefaultColumnSep,.5mm').replace(/\\zxNRow\b/g, '-\\zxDefaultRowSep,.5mm');
  let px = 0, origins = false;
  for (const part of opts(v).list) {
    if (/^between origins$/.test(part)) { origins = true; continue; }
    if (/^between borders$/.test(part)) continue;
    const l = length(part, ctx);
    if (l == null) warn(`The ${row ? 'row' : 'column'} spacing "${part}" isn't understood here`); else px += l;
  }
  return { px, origins };
}

// ---------------------------------------------------------------- wire shapes
// Bezier wires (zx-calculus 'bezier'): control points as fractions of the run between the two ends.
// xy: c = (x1 + a·dx, y1 + b·dy); x: c = (x1 + a·dx, y1 + b·dx) in TikZ's y-up frame; y: c = (x1 + a·dy, y1 + b·dy).
const BZ: Record<string, any> = {};
const def = (names: any, mode: any, p: any, extra = {}) => names.split(' ').forEach((n: any) => { BZ[n] = { mode, p, ...extra }; });
def("N N' N.", 'xy', [.2, .8, .8, .2]);
def("-N -N' -N.", 'xy', [.4, 0, .8, .2]);
def("N- N'- N.-", 'xy', [.2, .8, .6, 1]);
def("NN NN. .NN", 'xy', [.8, .2, .2, .8]);
def('NIN', 'xy', [0, .6, .2, .8]);
def('INN NNI', 'xy', [.8, .2, 1, .4]);
def("'> .>", 'xy', [.4, 0, .8, .2], { sa: 'east' });
def("<' <.", 'xy', [.2, .8, .6, 1], { ea: 'west' });
def('^. .^', 'xy', [.8, .2, 1, .4], { ea: 'north' });
def("'v v'", 'xy', [0, .6, .2, .8], { sa: 'south' });
def('s', 'xy', [.8, 0, .2, 1]);
def("s' s.", 'xy', [.8, .2, .2, .8]);
def("-s -s' -s.", 'xy', [.8, 0, .2, .8]);
def("s- s'- s.-", 'xy', [.8, .2, .2, 1]);
def('S', 'xy', [.8, 0, .2, 1], { sa: 'east', ea: 'west' });
def("-S -S' -S.", 'xy', [.8, 0, .2, .8], { sa: 'east' });
def("S- S'- S.-", 'xy', [.8, .2, .2, 1], { ea: 'west' });
def('ss sIs Iss ssI', 'xy', [0, .8, 1, .2]);
def('SS', 'xy', [0, .8, 1, .2], { sa: 'south', ea: 'north' });
def('SIS', 'xy', [0, .8, 1, .2], { sa: 'south' });
def('ISS SSI', 'xy', [0, .8, 1, .2], { ea: 'north' });
def('ss. .ss', 'xy', [.2, .8, .8, .2]);
def('sIs. .sIs', 'xy', [0, .8, .8, .2]);
def('.SIS', 'xy', [0, .8, .8, .2], { sa: 'south' });
def('ss.I I.ss', 'xy', [.2, .8, 1, .2]);
def('SS.I I.SS', 'xy', [.2, .8, 1, .2], { ea: 'north' });
def("o'", 'x', [.2, .4, .8, .4]);
def('o.', 'x', [.2, -.4, .8, -.4]);
def('-o', 'y', [.4, .2, .4, .8]);
def('o-', 'y', [-.4, .2, -.4, .8]);
// the ones zx draws 'up to down'
const UD = new Set("NN NN. .NN NIN INN NNI ^. .^ 'v v' ss sIs Iss ssI SS SIS ISS SSI .SIS ss. .ss sIs. .sIs ss.I I.ss SS.I I.SS".split(' '));
const ARC: Record<string, any> = { C: 'west', 'C-': 'east', "C'": 'north', 'C.': 'south' };
const BEND: Record<string, any> = { '(': -1, '(.': -1, ')': 1, "('": 1 }; // +1: bend left
const STYLE_NAMES = Object.keys(BZ).concat(Object.keys(ARC), Object.keys(BEND));
TD.ZX_WIRES = STYLE_NAMES;

// a style item → { name, arg }: "o'", "C=.5" (C with its argument), "(=40"
function styleOf(item: any) {
  const m = /^([^=]+?)\s*(?:=\s*(.*))?$/.exec(item.trim());
  return m ? { name: m[1].trim(), arg: m[2] } : { name: item.trim() };
}

// ---------------------------------------------------------------- layout
const cache = new Map();
function layout(s: any) {
  const key = [s.src, TD.math && TD.math.engine, s.minCell || 0].join('\u0001');
  const hit = cache.get(key);
  if (hit) return hit;
  const L = build(s);
  if (TD.measuring && TD.measuring()) return L;
  if (cache.size > 200) cache.clear();
  cache.set(key, L);
  return L;
}
TD.onTextMetricsChange(() => { cache.clear(); });

// phases are set at 8pt and the node scaled by 0.8: 6.4pt on the page
const PHASE = { size: 6.4 * PT, font: 'default' }, LABEL = { size: 8 * PT, font: 'default' }, NORMAL = { size: 10 * PT, font: 'default' };
// node phase → the maths drawn in it
const bold = (t: any) => `$\\boldsymbol{${t}}$`;
const SHORT_MINUS = '{\\scriptscriptstyle -}';
// inside a node zx sets no space around + − = … (zxSpacingInsideNodes): braced, they are ordinary symbols
const tight = (t: any) => t.replace(/(\\(?:cdot|times|oplus|otimes|pm|mp|leq|geq|neq|land|lor|wedge|vee)(?![A-Za-z])|[+\-=<>])/g, '{$1}');
function phaseText(n: any) {
  if (n.frac) {
    const sign = n.minus ? SHORT_MINUS : '';
    if (n.label) return bold(`${sign}${n.numP ?? n.num}/${n.denP ?? n.den}`);
    return bold(`${sign}\\frac{${tight(n.num)}}{${tight(n.den)}}`);
  }
  const t = String(n.phase || '').trim();
  if (!t) return '';
  return bold((n.minus ? '-' : '') + (n.label ? t : tight(t)));
}
// label position from a node's options (phase in label …)
function labelPos(o: any) {
  for (const it of o.list) {
    const nm = styleOf(it).name;
    if (/^(pil|phase in label)$/.test(nm)) return 'above';
    if (/^(pila|phase in label above)$/.test(nm)) return 'above';
    if (/^(pilb|phase in label below)$/.test(nm)) return 'below';
    if (/^(pilr|phase in label right)$/.test(nm)) return 'right';
    if (/^(pill|phase in label left)$/.test(nm)) return 'left';
  }
  return '';
}
// a node's size and look
function measure(n: any, warn: any) {
  const o = opts(n.o || '');
  for (const it of o.list) {
    const nm = styleOf(it).name;
    if (/^(a|alias|pil|pila|pilb|pilr|pill|phase in label( above| below| right| left)?|phase in content|fill|draw)$/.test(nm)) continue;
    warn(`The node option "${it}" isn't drawn here (it is kept in the code)`);
  }
  const fillOpt = o.map.fill ? TD.tikzColor && TD.tikzColor(o.map.fill) : null;
  if (n.k === 'Z' || n.k === 'X') {
    const lab = labelPos(o);
    const t = phaseText(n);
    const fill = fillOpt || FILL[n.k];
    if (!t) return { shape: 'circle', w: 2 * MM, h: 2 * MM, fill };
    if (lab) return { shape: 'circle', w: 2 * MM, h: 2 * MM, fill, label: { t: phaseText({ ...n, label: true }), pos: lab, fill: FILL['L' + n.k] } };
    const b = TD.textBox(t, PHASE);
    const short = n.minus || n.star;
    // zxLong: 1.2mm a side (scaled 0.8); zxShort: no inner sep, the rounded ends only
    const h = Math.max(4 * MM, b.h + 0.4 * MM);
    return { shape: 'pill', w: Math.max(h, b.w - 2 + (short ? 0.8 : 1.92) * MM), h, fill, text: t, b, dy: -0.12 * PHASE.size };
  }
  if (n.frac) {
    const lab = labelPos(o), fill = fillOpt || FILL[n.k];
    if (lab) return { shape: 'circle', w: 2 * MM, h: 2 * MM, fill, label: { t: phaseText({ ...n, label: true }), pos: lab, fill: FILL['L' + n.k] } };
    const t = phaseText(n), b = TD.textBox(t, PHASE);
    const h = Math.max(4 * MM, b.h + 0.2 * MM);
    return { shape: 'pill', w: Math.max(h, b.w - 2 + 0.8 * MM), h, fill, text: t, b };
  }
  if (n.k === 'H') return { shape: 'rect', w: 1.5 * MM, h: 1.5 * MM, fill: fillOpt || FILL.H };
  if (n.k === 'N') {
    const a = n.dbl ? 12 * PT : 2 * MM;
    if (!n.v) return { shape: 'coord', w: 0, h: 0 };
    return { shape: 'none', w: n.v === '|' ? 0 : a, h: n.v === '-' ? 0 : a };
  }
  if (n.k === 'E') return { shape: 'dash', w: 4 * MM, h: 4 * MM };
  if (n.k === 'T') {
    const t = /\$/.test(n.t) ? n.t : `$${n.t}$`, b = TD.textBox(t, NORMAL), pad = 2 * 0.65 * 4.3 * PT;
    return { shape: 'text', w: b.w + pad, h: b.h + pad, text: t, b };
  }
  return { shape: 'coord', w: 0, h: 0 };
}
// the size of a label pill (phase in label)
function labelBox(lab: any) {
  // TeX fits the maths' own height (about 0.8 of the measured line) plus 2pt a side; the rounded ends add a little
  const b = TD.textBox(lab.t, LABEL), h = 0.8 * b.h + 4 * PT;
  return { b, w: Math.max(h, b.w - 2 + 4 * PT + h * 0.3), h };
}

// cubic segments → path data, sample points, the point half way
const bez = (p0: any, c1: any, c2: any, p1: any) => ({ p0, c1, c2, p1 });
const at = (s: any, t: any) => {
  const u = 1 - t;
  return { x: u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p1.x, y: u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y };
};
const line = (a: any, b: any) => bez(a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 }, b);
// an elliptical arc as cubic pieces; angles in degrees, TikZ's way (counter-clockwise, y up)
function arc(cx: any, cy: any, rx: any, ry: any, a0: any, a1: any) {
  const out = [], n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), h = (a1 - a0) / n, k = (4 / 3) * Math.tan(((h * Math.PI) / 180) / 4);
  const P = (a: any) => { a = (a * Math.PI) / 180; return { x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) }; };
  const D = (a: any) => { a = (a * Math.PI) / 180; return { x: -rx * Math.sin(a), y: -ry * Math.cos(a) }; };
  for (let i = 0; i < n; i++) {
    const s = a0 + i * h, e = s + h, p0 = P(s), p1 = P(e), d0 = D(s), d1 = D(e);
    out.push(bez(p0, { x: p0.x + k * d0.x, y: p0.y + k * d0.y }, { x: p1.x - k * d1.x, y: p1.y - k * d1.y }, p1));
  }
  return out;
}
const pathD = (segs: any) => segs.map((s: any, i: any) => (i ? '' : `M${r2(s.p0.x)},${r2(s.p0.y)}`) + `C${r2(s.c1.x)},${r2(s.c1.y)} ${r2(s.c2.x)},${r2(s.c2.y)} ${r2(s.p1.x)},${r2(s.p1.y)}`).join('');
// the point half way along (by length)
function midpoint(segs: any) {
  const pts = [];
  for (const s of segs) for (let i: any = pts.length ? 1 : 0; i <= 24; i++) pts.push(at(s, i / 24));
  let L = 0; const acc = [0];
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); acc.push(L); }
  const half = L / 2;
  for (let i = 1; i < pts.length; i++) if (acc[i] >= half) { const t = (half - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1); return { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) }; }
  return pts[0];
}
// a TikZ in/out curve between two points (angles absolute, TikZ's way)
function inout(S: any, E: any, outA: any, inA: any, loose: any, minD = 0) {
  const d = Math.max(minD, 0.3915 * loose * Math.hypot(E.x - S.x, E.y - S.y));
  const u = (a: any) => { a = (a * Math.PI) / 180; return { x: Math.cos(a), y: -Math.sin(a) }; };
  const uo = u(outA), ui = u(inA);
  return [bez(S, { x: S.x + d * uo.x, y: S.y + d * uo.y }, { x: E.x + d * ui.x, y: E.y + d * ui.y }, E)];
}

function build(s: any) {
  const P = parse(s.src);
  const warnings = P.warnings.slice();
  const warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const E = P.env;
  // the diagram's separations (zx: 1.5mm both ways; circuit: 4mm)
  const ctx = { cs: SEP, rs: SEP };
  for (const it of E.list) {
    const { name, arg } = styleOf(it);
    if (name === 'circuit') { ctx.cs = ctx.rs = 4 * MM; continue; }
    if (/^(zx )?(row sep|column sep)$/.test(name) || name === 'sep') {
      const l = length(arg, ctx);
      if (l == null) { warn(`"${it}" isn't understood here`); continue; }
      if (/row|^sep$/.test(name)) ctx.rs = l;
      if (/column|^sep$/.test(name)) ctx.cs = l;
      continue;
    }
    if (/^(amp|ampersand replacement|mbr|math baseline( row)?|baseline|1-row diagram|bold|B|thick lines|debug mode|no debug mode)$/.test(name)) continue;
    warn(`The diagram option "${it}" isn't drawn here (it is kept in the code)`);
  }
  const boldAll = E.list.some((x) => x === 'bold' || x === 'B');
  const cells = P.cells, R = cells.length, C = Math.max(0, ...cells.map((r) => r.length));
  if (!R || !C || cells.every((r) => r.every((c) => !c.node && !c.edges.length))) {
    return { ops: [{ k: 'empty', w: 4 * PX, h: 1.5 * PX }], bb: { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }, warnings, R: 0, C: 0, P };
  }
  const look = cells.map((r) => r.map((c) => (c.node ? measure(c.node, warn) : null)));
  const colW = Array(C).fill(0), rowH = Array(R).fill(0);
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) {
    const m = look[r][c];
    if (!m) continue;
    // a drawn node's anchors sit on the outside of its line (TikZ's outer sep)
    const o = /circle|pill|rect|dash/.test(m.shape) ? 0.4 * PT : 0;
    colW[c] = Math.max(colW[c], m.w + o); rowH[r] = Math.max(rowH[r], m.h + o);
  }
  // the visual editor spreads points and empty cells a little, so they can be picked
  if (s.minCell) { for (let c = 0; c < C; c++) colW[c] = Math.max(colW[c], s.minCell); for (let r = 0; r < R; r++) rowH[r] = Math.max(rowH[r], s.minCell); }
  // extra separations: the largest one given for a column, in any row
  const colX = Array(C).fill(null), rowX = Array(R).fill(null);
  P.rows.forEach((row, r) => {
    row.cells.forEach((cl, c) => { if (c && cl.colSep) { const v = sepList(cl.colSep, ctx, warn, false); if (!colX[c] || v.px > colX[c].px || v.origins) colX[c] = v; } });
    if (row.rowSep && r < R - 1) rowX[r + 1] = sepList(row.rowSep, ctx, warn, true);
  });
  const colL = [], cx: any[] = [], rowT = [], cy: any[] = [];
  let x = 0;
  for (let c = 0; c < C; c++) {
    const ex = colX[c];
    if (c && ex && ex.origins) { cx[c] = cx[c - 1] + ex.px; colL[c] = cx[c] - colW[c] / 2; }
    else { if (c) x += ctx.cs + (ex ? ex.px : 0); colL[c] = x; cx[c] = x + colW[c] / 2; }
    x = colL[c] + colW[c];
  }
  let y = 0;
  for (let r = 0; r < R; r++) {
    const ex = rowX[r];
    if (r && ex && ex.origins) { cy[r] = cy[r - 1] + ex.px; rowT[r] = cy[r] - rowH[r] / 2; }
    else { if (r) y += ctx.rs + (ex ? ex.px : 0); rowT[r] = y; cy[r] = y + rowH[r] / 2; }
    y = rowT[r] + rowH[r];
  }

  // a node's anchor: centre, or a point on its border
  const nodeAt = (r: any, c: any) => {
    const m = look[r] && look[r][c];
    return { x: cx[c], y: cy[r], w: m ? m.w : 0, h: m ? m.h : 0, shape: m ? m.shape : 'coord', m };
  };
  const anchor = (n: any, a: any) => {
    if (!a || n.shape === 'coord') return { x: n.x, y: n.y };
    if (a === 'east') return { x: n.x + n.w / 2, y: n.y };
    if (a === 'west') return { x: n.x - n.w / 2, y: n.y };
    if (a === 'north') return { x: n.x, y: n.y - n.h / 2 };
    if (a === 'south') return { x: n.x, y: n.y + n.h / 2 };
    return { x: n.x, y: n.y };
  };
  // the point of a node's border in a direction (TikZ degrees)
  const border = (n: any, deg: any) => {
    const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = -Math.sin(a);
    if (n.shape === 'coord' || (!n.w && !n.h)) return { x: n.x, y: n.y };
    if (n.shape === 'circle') return { x: n.x + (ux * n.w) / 2, y: n.y + (uy * n.h) / 2 };
    const t = Math.min(Math.abs(ux) > 1e-9 ? n.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? n.h / 2 / Math.abs(uy) : Infinity);
    return { x: n.x + ux * t, y: n.y + uy * t };
  };

  const wires: any[] = [], nodes = [], marks: any[] = [], texts = [];
  // ---- wires
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) cells[r][c].edges.forEach((e, ei) => {
    const S = nodeAt(r, c);
    let segs = null, color = null, dash: any = false, cl = false, B = boldAll, mark = null, sa = null, ea = null, hidden = false;
    let shape = null, shapeArg;
    let bendIn = null, bendOut = null, loose = 1, bendRel = null;
    for (const it of e.styles) {
      const { name, arg } = styleOf(it);
      if (BZ[name] || ARC[name] || name in BEND) { shape = name; shapeArg = arg; continue; }
      if (name === 'H' || name === 'Z' || name === 'X') { mark = name; continue; }
      if (name === 'cl' || name === 'classical') { cl = true; continue; }
      if (name === 'B' || name === 'bold' || name === 'very thick' || name === 'thick') { B = true; continue; }
      if (/^(dashed|dotted|densely dashed|loosely dashed|densely dotted)$/.test(name)) { dash = name.includes('dot') ? 'dot' : true; continue; }
      if (name === 'draw' && arg === 'none') { hidden = true; continue; }
      if (name === 'start anchor') { sa = (arg || '').trim(); continue; }
      if (name === 'end anchor') { ea = (arg || '').trim(); continue; }
      if (name === 'bend left' || name === 'bend right') { bendRel = (name === 'bend left' ? 1 : -1) * (arg ? parseFloat(arg) : 30); continue; }
      if (name === 'in') { bendIn = parseFloat(arg!); continue; }
      if (name === 'out') { bendOut = parseFloat(arg!); continue; }
      if (name === 'looseness') { loose = parseFloat(arg!) || 1; continue; }
      if (name === 'loop' || name === 'min distance' || name === 'IO' || name === '-' || name === 'no head') continue;
      if (name === 'color' || name === 'draw') { const k = TD.tikzColor && TD.tikzColor(arg); if (k) { color = k; continue; } }
      const k = !arg && TD.tikzColor && TD.tikzColor(name);
      if (k) { color = k; continue; }
      if (/^"/.test(name)) { warn('Wire labels ("…") aren\'t drawn here (they are kept in the code)'); continue; }
      warn(`The wire style "${it}" isn't drawn here (it is kept in the code)`);
    }
    if (e.loop) {
      const n = S, outA = e.dir + e.open, inA = e.dir - e.open;
      const p0 = border(n, outA), p1 = border(n, inA);
      segs = inout(p0, p1, outA, inA, 8, 3 * MM);
    } else {
      let dr = 0, dc = 0;
      for (const ch of e.dirs) { if (ch === 'r') dc++; else if (ch === 'l') dc--; else if (ch === 'd') dr++; else if (ch === 'u') dr--; }
      if (!e.dirs) { warn('A wire with no direction (like \\ar[r]) is skipped'); return; }
      const r2_ = r + dr, c2 = c + dc;
      if (r2_ < 0 || r2_ >= R || c2 < 0 || c2 >= C) { warn(`A wire from row ${r + 1}, column ${c + 1} points outside the diagram`); return; }
      if (!look[r2_][c2]) warn(`A wire from row ${r + 1}, column ${c + 1} ends on an empty cell: LaTeX stops there (put \\zxN{} in it)`);
      const T = nodeAt(r2_, c2);
      const bz = shape && BZ[shape], arcA = shape && ARC[shape];
      if (arcA) {
        const f = shapeArg ? parseFloat(shapeArg) || 1 : 1;
        const p = anchor(S, arcA), q = anchor(T, arcA);
        segs = [];
        if (arcA === 'west' || arcA === 'east') {
          const n1 = arcA === 'west' ? Math.min(p.x, q.x) : Math.max(p.x, q.x), ry = Math.abs(p.y - q.y) / 2, mid = (p.y + q.y) / 2;
          if (Math.abs(p.x - n1) > 0.01) segs.push(line(p, { x: n1, y: p.y }));
          const down = p.y < q.y; // TikZ: from the upper end
          const [a0, a1] = arcA === 'west' ? (down ? [90, 270] : [270, 90]) : (down ? [90, -90] : [-90, 90]);
          if (ry > 0.01) segs.push(...arc(n1, mid, f * ry, ry, a0, a1));
          if (Math.abs(q.x - n1) > 0.01) segs.push(line({ x: n1, y: q.y }, q));
        } else {
          const n1 = arcA === 'north' ? Math.min(p.y, q.y) : Math.max(p.y, q.y), rx = Math.abs(p.x - q.x) / 2, mid = (p.x + q.x) / 2;
          if (Math.abs(p.y - n1) > 0.01) segs.push(line(p, { x: p.x, y: n1 }));
          const right = p.x < q.x;
          const [a0, a1] = arcA === 'north' ? (right ? [180, 0] : [0, 180]) : (right ? [180, 360] : [0, -180]);
          if (rx > 0.01) segs.push(...arc(mid, n1, rx, f * rx, a0, a1));
          if (Math.abs(q.y - n1) > 0.01) segs.push(line({ x: p.x === q.x ? p.x : q.x, y: n1 }, q));
        }
        if (!segs.length) segs = [line(p, q)];
      } else if (bz) {
        // pills start their curves from the middle of the end on that side (zx's fake centres)
        const fake = (n: any, side: any) => (n.shape === 'pill' && (side === 'east' || side === 'west') ? { x: n.x + (side === 'east' ? 1 : -1) * (n.w - n.h) / 2, y: n.y } : { x: n.x, y: n.y });
        const lr = bz.mode !== 'y' && !UD.has(shape);
        const p = sa || bz.sa ? anchor(S, sa || bz.sa) : fake(S, lr ? 'east' : 'south');
        const q = ea || bz.ea ? anchor(T, ea || bz.ea) : fake(T, lr ? 'west' : 'north');
        const dx = q.x - p.x, dy = q.y - p.y, [a1, b1, a2, b2] = bz.p;
        // screen y runs down: the y-up formulas flip the sign of the cross terms
        const ctl = (a: any, b: any) => (bz.mode === 'xy' ? { x: p.x + a * dx, y: p.y + b * dy } : bz.mode === 'x' ? { x: p.x + a * dx, y: p.y - b * dx } : { x: p.x - a * dy, y: p.y + b * dy });
        segs = [bez(p, ctl(a1, b1), ctl(a2, b2), q)];
      } else {
        const p = anchor(S, sa), q = anchor(T, ea);
        let rel = bendRel;
        if (shape && shape in BEND) rel = BEND[shape] * (shapeArg ? parseFloat(shapeArg) || 30 : 30);
        if (rel != null || bendIn != null || bendOut != null) {
          const phi = (Math.atan2(-(q.y - p.y), q.x - p.x) * 180) / Math.PI;
          const outA = bendOut != null ? bendOut : phi + (rel || 0), inA = bendIn != null ? bendIn : phi + 180 - (rel || 0);
          segs = inout(p, q, outA, inA, loose);
        } else segs = [line(p, q)];
      }
    }
    wires.push({ segs, color, dash, cl, B, hidden, src: [r, c, ei] });
    if (mark) {
      const m = midpoint(segs);
      marks.push(mark === 'H' ? { shape: 'rect', x: m.x, y: m.y, w: 1.5 * MM, h: 1.5 * MM, fill: FILL.H } : { shape: 'circle', x: m.x, y: m.y, w: 2 * MM, h: 2 * MM, fill: FILL[mark] });
    }
  });
  // ---- nodes
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) {
    const m = look[r][c];
    if (!m) continue;
    const X = cx[c], Y = cy[r];
    if (m.shape === 'circle' || m.shape === 'pill' || m.shape === 'rect' || m.shape === 'dash') nodes.push({ shape: m.shape, x: X, y: Y, w: m.w, h: m.h, fill: m.fill, cell: [r, c], B: boldAll });
    else nodes.push({ shape: m.shape, x: X, y: Y, w: m.w, h: m.h, cell: [r, c] });
    if (m.text) texts.push({ t: m.text, x: X, y: Y + (m.dy || 0), b: m.b, st: m.shape === 'text' ? NORMAL : PHASE });
    if (m.label) {
      const lb = labelBox(m.label), pos = m.label.pos;
      const lx = pos === 'right' ? X + m.w / 2 + lb.w / 2 : pos === 'left' ? X - m.w / 2 - lb.w / 2 : X;
      const ly = pos === 'above' ? Y - m.h / 2 - lb.h / 2 : pos === 'below' ? Y + m.h / 2 + lb.h / 2 : Y;
      nodes.push({ shape: 'pill', x: lx, y: ly, w: lb.w, h: lb.h, fill: m.label.fill, nostroke: true, label: true });
      texts.push({ t: m.label.t, x: lx, y: ly, b: lb.b, st: LABEL });
    }
  }

  // bounding box of everything
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  const lw = PT;
  for (const w of wires) if (!w.hidden) for (const sg of w.segs) for (let i = 0; i <= 16; i++) { const p = at(sg, i / 16); ext(p.x - lw, p.y - lw, p.x + lw, p.y + lw); }
  for (const n of nodes.concat(marks)) if (n.w || n.h) ext(n.x - n.w / 2 - lw / 2, n.y - n.h / 2 - lw / 2, n.x + n.w / 2 + lw / 2, n.y + n.h / 2 + lw / 2);
  for (const t of texts) ext(t.x - t.b.w / 2, t.y - t.b.h / 2, t.x + t.b.w / 2, t.y + t.b.h / 2);
  if (!(x2 > x1)) { x1 = colL[0] - 1; x2 = colL[C - 1] + colW[C - 1] + 1; }
  if (!(y2 > y1)) { y1 = rowT[0] - 1; y2 = rowT[R - 1] + rowH[R - 1] + 1; }
  return { wires, nodes, marks, texts, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, R, C, P, geo: { colL, colW, cx, rowT, rowH, cy, cs: ctx.cs, rs: ctx.rs } };
}

// ---------------------------------------------------------------- drawing
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const ink = TD.css(s.color || '#000000');
  const lw = 0.4 * PT;
  let out = '';
  if (Lo.ops) { // empty diagram
    const o = Lo.ops[0];
    out += `<rect x="0" y="0" width="${r2(o.w)}" height="${r2(o.h)}" fill="none" stroke="${ink}" stroke-width="${r2(lw * 2)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty ZX diagram', { size: 'small', font: 'default' }, '#888888', o.w / 2, o.h / 2, ctx);
  } else {
    const paper = ctx.paper || '#ffffff';
    for (const w of Lo.wires) {
      if (w.hidden) continue;
      const d = pathD(w.segs), col = w.color ? TD.css(w.color) : ink, sw = w.B ? 1.2 * PT : lw;
      const dash = w.dash === 'dot' ? ` stroke-dasharray="${r2(lw)} ${r2(2 * PT)}" stroke-linecap="round"` : w.dash ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : '';
      if (w.cl) out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(PT + 2 * sw)}"${dash}/><path d="${d}" fill="none" stroke="${paper}" stroke-width="${r2(PT)}"/>`;
      else out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(sw)}"${dash}/>`;
    }
    const shape = (n: any) => {
      const sw = n.B ? 1.2 * PT : lw, stroke = n.nostroke ? 'none' : ink, fill = n.shape === 'dash' ? 'none' : TD.css(n.fill || '#ffffff');
      const dash = n.shape === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : '';
      if (n.shape === 'circle') return `<ellipse cx="${r2(n.x)}" cy="${r2(n.y)}" rx="${r2(n.w / 2)}" ry="${r2(n.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"/>`;
      if (n.shape === 'pill' || n.shape === 'rect' || n.shape === 'dash') {
        const rx = n.shape === 'pill' ? Math.min(n.w, n.h) / 2 : 0;
        return `<rect x="${r2(n.x - n.w / 2)}" y="${r2(n.y - n.h / 2)}" width="${r2(n.w)}" height="${r2(n.h)}" rx="${r2(rx)}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"${dash}/>`;
      }
      return '';
    };
    for (const m of Lo.marks) out += shape(m);
    for (const n of Lo.nodes) out += shape(n);
    for (const t of Lo.texts) out += TD.textSvg(t.t, t.st, s.color || '#000000', t.x, t.y, ctx);
  }
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{ZX\}/.test(t) ? t : `\\begin{ZX}\n${t}\n\\end{ZX}`;
}

// a small drawing of a snippet (palette previews)
TD.zxMini = (src: any, maxH = 30) => {
  const s = { type: 'zx', x: 0, y: 0, src, color: 'currentColor' };
  const bb = layout(s).bb, k = Math.min(1.6, maxH / bb.h);
  return `<svg class="zxmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper: 'var(--sheet-raised)' })}</svg>`;
};

TD.TYPES.zx = {
  name: 'ZX diagram',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'zx', x: p.x, y: p.y, src: TD.ZX_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // ZX is a tikz-cd picture of its own: like quantikz, it sits in a plain node with the outer
  // picture interrupted, centred where the drawing is
  tikz(s: any, X: any) {
    X.pkgs.add('zx-calculus');
    const b = layout(s).bb;
    return `\\node at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
  },
};


TD.zxLayout = layout;
// for the visual editor (src/editors/zxeditor.ts)
TD.zx = { at, midpoint, ARROWS, unwrap, grid, cell, opts, close, parse, draw, layout, fullCode, styleOf, phaseText, BZ, ARC, BEND, FILL, LENGTHS, expandShortcuts };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("zx", {
  menu: { order: 6, label: "ZX", title: "ZX-calculus diagram, written for zx-calculus", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M2 12h3.5M14.5 12h3M26.5 12h3.5M10 7.5C10 3 22 3 22 7.5\"/><circle cx=\"10\" cy=\"12\" r=\"4.5\" class=\"a1\"/><circle cx=\"22\" cy=\"12\" r=\"4.5\"/><rect x=\"14\" y=\"1.5\" width=\"4\" height=\"4\" class=\"a1\"/></svg>" },
  nodeImport: { re: /\\begin\{ZX\}[\s\S]*\\end\{ZX\}/, order: 3, bb: (q) => TD.zxLayout(q).bb },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.zxEditor, alias: "zxOpen" }
});
export { layout, fullCode };
