import { runtime as TD } from '../runtime';
import { layoutCache, srcKey } from './layout-cache';
import { groupEnd as close, skipSpace as skipWs } from '../core/tex-scan';
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
// noSep: there are no such separations (xymatrix), so a [ after & or \\ is the entry's text
function grid(inner: any, amp: any, noSep = false) {
  const rows = [{ cells: [{ text: '', colSep: '' }], rowSep: '' }];
  let cur = rows[0].cells[0];
  const nextCell = (sep: any) => { cur = { text: '', colSep: sep }; rows[rows.length - 1].cells.push(cur); };
  const sepAfter = (i: any) => {
    if (noSep) return ['', i];
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
// circuit commands not drawn here, with their mandatory arguments
const CIRCUIT_KEPT = new Map<string, number>([['zxSlice', 1], ['zxVSlice', 1], ['zxInputMulti', 2], ['zxOutputMulti', 2], ['zxGateInputMulti', 2], ['zxGateOutputMulti', 2], ['zxGateInput', 1], ['zxGateOutput', 1], ['zxGround', 1], ['zxDivider', 1]]);
// one cell's contents: its node (or none), its wires, and anything not understood
function cell(text: any, warn: any) {
  const out = { node: (null as any), edges: ([] as any[]), rest: '' };
  let keep = ''; // commands drawn by LaTeX only: kept with the cell's code
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
      // circuits: \zxGate (\zxBox) [opts]{maths}, \zxGateMulti[opts][multi opts]{rows}{cols}{maths}, controls, NOT, swap
      // crosses, and the inputs and outputs written at the cell
      else if (name === 'zxGate' || name === 'zxBox') { const o = optArg() || '', a = arg(); setNode({ k: 'G', o, t: a ?? '', src: text.slice(at, i) }); }
      else if (name === 'zxGateMulti') {
        const o = optArg() || '', o2 = optArg() || '', nr = parseInt(arg() || '', 10), nc = parseInt(arg() || '', 10), a = arg();
        // the multi options read here: main={…} (the box's fill and draw colours) and main text={colour}
        const mo: any = {};
        const plainMulti = opts(o2).list.every((it: any) => {
          const { name: k, arg: v } = styleOf(it), body = String(v || '').replace(/^\{([\s\S]*)\}$/, '$1');
          if (k === 'main') return opts(body).list.every((q: any) => { const r = styleOf(q), c = TD.tikzColor && TD.tikzColor(r.arg); if ((r.name === 'fill' || r.name === 'draw') && c) { mo[r.name] = c; return true; } return false; });
          if (k === 'main text') { const c = TD.tikzColor && TD.tikzColor(body.replace(/^(text|color)\s*=\s*/, '').trim()); if (c) { mo.text = c; return true; } }
          return false;
        });
        if (nr >= 1 && nc >= 1 && plainMulti) setNode({ k: 'GM', o, rows: nr, cols: nc, t: a ?? '', mo, src: text.slice(at, i) });
        else { keep += ' ' + text.slice(at, i); warn(`\\zxGateMulti${o2.trim() ? `[…][${o2.trim().slice(0, 60)}]` : ''} isn't drawn here (it is kept in the code)`); }
      } else if (name === 'zxMatrix') {
        // \zxMatrix[opts]<modifiers>{label}: * transposes (the point turns west), - puts the label below; the rotations
        // (' and .), / (an overlay label) and _{matrix} are kept as code
        const o = optArg() || '';
        let mods = '';
        for (;;) { const k = skipWs(text, i), ch = text[k]; if (ch && "*-'./".includes(ch)) { mods += ch; i = k + 1; } else if (ch === '_') { mods += '_'; i = k + 1; arg(); } else break; }
        const a = arg(), src = text.slice(at, i);
        const odd = opts(o).list.find((it: any) => !/^(a|alias)$/.test(styleOf(it).name));
        if (/['./_]/.test(mods) || odd) { keep += ' ' + src; warn(`\\zxMatrix${odd ? `[${odd}]` : ` with ${mods.replace(/[*-]/g, '')}`} isn't drawn here (it is kept in the code)`); }
        else setNode({ k: 'M', o, star: mods.includes('*'), minus: mods.includes('-'), t: a ?? '', src });
      } else if (/^zx(Ctrl|OCtrl|Not|Cross)$/.test(name)) { const o = optArg() || ''; arg(); setNode({ k: name.slice(2), o, src: text.slice(at, i) }); }
      else if (name === 'zxInput' || name === 'zxOutput') { const o = optArg() || '', a = arg(); setNode({ k: name === 'zxInput' ? 'In' : 'Out', o, t: a ?? '', src: text.slice(at, i) }); }
      else if (CIRCUIT_KEPT.has(name)) {
        // a slice, a brace of inputs or outputs, ground, divider: drawn by LaTeX only
        while (optArg() != null);
        for (let n = CIRCUIT_KEPT.get(name)!; n > 0; n--) arg();
        keep += ' ' + text.slice(at, i);
        warn(`\\${name} isn't drawn here (it is kept in the code)`);
      }
      else if (name in ARROWS) {
        let o = optArg();
        if (o == null && !ARROWS[name]) { const a = arg(); if (a != null) o = a; } // \ar{r}: tikz-cd's old syntax
        // tikz-cd: a direction word anywhere in the options sets the target from this cell, the last one winning
        // (\rar[rd] goes down and right)
        const all = opts(o || '').list, list = all.filter((x: any) => !/^[rlud]+$/.test(x));
        const dirs = [ARROWS[name] || '', ...all.filter((x: any) => /^[rlud]+$/.test(x))].pop();
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
  if (keep) out.rest = (out.rest + keep).trim();
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
  // (a value may run over several lines: execute at end picture={…})
  const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(item.trim());
  return m ? { name: m[1].trim(), arg: m[2] } : { name: item.trim() };
}

// ---------------------------------------------------------------- layout
const layout = layoutCache((s: any) => srcKey(s, s.minCell || 0), (s: any) => build(s));

// phases are set at 8pt and the node scaled by 0.8: 6.4pt on the page
const PHASE = { size: 6.4 * PT, font: 'default' }, LABEL = { size: 8 * PT, font: 'default' }, NORMAL = { size: 10 * PT, font: 'default' }, TINY = { size: 6 * PT, font: 'default' };
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
// circuit boxes (zx every box): inner sep 1.3mm, minimum width and height 1.83em
const BOX_SEP = 1.3 * MM, BOX_MIN = 18.3 * PT;
// a box's content, maths at 10pt as TeX sets it (px): width, height + depth, and how far above the box's middle the
// drawing of it goes; \zxMeter{} is the package's meter, 11.78pt × 10.78pt (measured)
function contentBox(t: any) {
  t = String(t || '').trim();
  if (/^\\zxMeter\s*(\[\s*1?\s*\])?\s*\{\s*\}$/.test(t)) return { meter: true, w: 11.781 * PT, h: 10.781 * PT, lift: 0 };
  if (!t) return { w: 0, h: 0, lift: 0 };
  const m = `$${t}$`, b = TD.textBox(m, NORMAL), hd = (TD.texLineHD && TD.texLineHD(m, 10)) || { ht: 0.75 * 10, dp: 0.25 * 10 };
  return { t: m, b, w: (b.w - 2), h: (hd.ht + hd.dp) * PT, lift: ((hd.dp - hd.ht) / 2 + 0.347 * 10) * PT };
}
// add label={pos:text}: a label at 6pt (baselines 6pt apart), inner sep 1.8pt, above unless a side is given; a box's
// label is in maths (the box is set in the matrix's math mode), a \zxGateMulti's in text, its lines centred (its box is
// made after the matrix). Drawn lines are centred on their middle baseline, as TeX's are
function boxLabel(v: any, multi: any) {
  if (v == null) return null;
  const m = /^\s*(above|below|left|right)\s*:([\s\S]*)$/.exec(v), t = (m ? m[2] : v).trim().replace(/\s*\\\\\s*/g, '\n');
  const ls = t.split('\n'), shown = ls.map((l: any) => (multi ? l : `$${l}$`)).join('\n'), b = TD.textBox(shown, TINY);
  const f = (TD.texLineHD && TD.texLineHD(ls[0], 6)) || { ht: 0.694 * 6, dp: 0 }, l = (TD.texLineHD && TD.texLineHD(ls[ls.length - 1], 6)) || { ht: 0, dp: 0 };
  const ht = f.ht + 6 * (ls.length - 1), dp = l.dp;
  return { t: shown, b, pos: m ? m[1] : 'above', w: (b.w - 2) + 3.6 * PT, h: (ht + dp + 3.6) * PT, lift: ((dp - f.ht) / 2 + 0.347 * 6) * PT, multi };
}
// a node's size and look
function measure(n: any, warn: any, D: any = {}): any {
  const o = opts(n.o || '');
  for (const it of o.list) {
    const nm = styleOf(it).name;
    if (/^(a|alias|pil|pila|pilb|pilr|pill|phase in label( above| below| right| left)?|phase in content|fill|draw)$/.test(nm)) continue;
    if (nm === 'add label' && /^(G|GM)$/.test(n.k)) continue;
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
    // shapes.misc's rounded rectangle, then scaled 0.8 (zxShort, zxLong): its ends are arcs of radius
    // r = max(half the text's height + depth, minimum height 5mm / 2), and each end adds the arc's chord
    // r - sqrt(r² - (th/2)²) beyond the text; zxLong has inner xsep 1.2mm, zxShort none; minimum width 5mm
    const hd = TD.texLineHD ? TD.texLineHD(t, 8) : null;
    if (hd) {
      const th = (hd.ht + hd.dp) * PT, r = Math.max(th / 2, 2.5 * MM), chord = r - Math.sqrt(r * r - (th / 2) * (th / 2));
      const tw = (b.w - 2) / 0.8, w = 0.8 * Math.max(5 * MM, tw + 2 * (short ? 0 : 1.2 * MM) + 2 * chord);
      return { shape: 'pill', w, h: 0.8 * 2 * r, fill, text: t, b, dy: -0.12 * PHASE.size };
    }
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
  // circuits (zx every box: rectangle, inner sep 1.3mm, minimum size 1.83em, white, maths at 10pt; lines
  // 0.4pt, or thick with 'thick lines'); a box's cell is its size and line wide
  const lw = D.thick ? 0.8 * PT : 0.4 * PT;
  if (n.k === 'G' || n.k === 'GM') {
    const c = contentBox(n.t), label = boxLabel(o.map['add label'], n.k === 'GM');
    const w = Math.max(BOX_MIN, c.w + 2 * BOX_SEP), h = Math.max(BOX_MIN, c.h + 2 * BOX_SEP);
    if (n.k === 'GM') { const mo = n.mo || {}; return { shape: 'multi', rows: n.rows, cols: n.cols, W: w + lw, H: h + lw, w: 0, h: 0, fill: mo.fill || fillOpt || '#ffffff', stroke: mo.draw, tcol: mo.text, c, label, lw }; }
    return { shape: 'rect', w, h, fill: fillOpt || '#ffffff', c, label, lw };
  }
  // \zxCtrl: a black dot, \zxOCtrl a white one, \zxNot ⊕ (circles, inner sep 2pt and 2.5pt); \zxCross: the cell is a
  // point, crossed by the diagonals of a 6pt square
  if (n.k === 'Ctrl') return { shape: 'circle', w: 4 * Math.SQRT1_2 * 2 * PT, h: 4 * Math.SQRT1_2 * 2 * PT, fill: fillOpt || '#000000', nostroke: true };
  if (n.k === 'OCtrl') return { shape: 'circle', w: 4 * Math.SQRT1_2 * 2 * PT, h: 4 * Math.SQRT1_2 * 2 * PT, fill: fillOpt || '#ffffff', lw };
  if (n.k === 'Not') return { shape: 'circle', w: 5 * Math.SQRT2 * PT, h: 5 * Math.SQRT2 * PT, fill: fillOpt || '#ffffff', plus: true, lw };
  if (n.k === 'Cross') return { shape: 'cross', w: 6 * PT, h: 6 * PT, lw };
  // \zxMatrix: pgf's signal shape round empty text (inner sep 1pt, minimum height 6pt, pointer 90°): a chevron 8pt
  // wide about its centre (its anchors: the notch 1pt behind, the point 4pt ahead), grey (200,200,200); its label
  // above (below with -) in maths at 8pt, inner sep 2pt. Its cell reaches over the label: as wide as either, and up
  // (down) to the label's far side
  if (n.k === 'M') {
    const t = String(n.t || '').trim(), m = t ? `$${t}$` : '', b = m ? TD.textBox(m, LABEL) : { w: 2, h: 0 };
    const hd = (m && TD.texLineHD && TD.texLineHD(m, 8)) || { ht: m ? 0.683 * 8 : 0, dp: 0 };
    const lh = (hd.ht + hd.dp + 4) * PT, half = Math.max(4.2 * PT, (b.w - 2) / 2 + 2.2 * PT), far = 3 * PT + lh, near = 3.2 * PT;
    return { shape: 'zxmatrix', w: 8 * PT, h: 6 * PT, cw: 2 * half, up: n.minus ? near : far, dn: n.minus ? far : near, star: n.star, fill: fillOpt || '#c8c8c8',
      label: m ? { t: m, b, y: (n.minus ? 1 : -1) * (3 * PT + lh / 2), lift: ((hd.dp - hd.ht) / 2 + 0.347 * 8) * PT } : null };
  }
  // \zxInput, \zxOutput: maths at 10pt, inner sep 2pt, ending (starting) at the cell, drawn after the matrix
  if (n.k === 'In' || n.k === 'Out') return { shape: 'coord', w: 0, h: 0, io: { c: contentBox(n.t), side: n.k === 'In' ? -1 : 1 } };
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
  const D = { thick: E.list.includes('thick lines') };
  const look = cells.map((r) => r.map((c) => (c.node ? measure(c.node, warn, D) : null)));
  // \zxGateMulti: each cell it covers holds a block as wide as the box (drawn, with its line) shared out over its
  // columns less the separations, at least a box's minimum, and drawn with its line too; the box is fitted round them
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) {
    const m = look[r][c];
    if (!m || m.shape !== 'multi') continue;
    m.bw = Math.max(BOX_MIN, (m.W - (m.cols - 1) * ctx.cs) / m.cols) + m.lw; m.bh = Math.max(BOX_MIN, (m.H - (m.rows - 1) * ctx.rs) / m.rows) + m.lw;
    if (r + m.rows > R || c + m.cols > C) warn('A \\zxGateMulti reaches past the diagram');
    for (let i = 0; i < Math.min(m.rows, R - r); i++) for (let j = 0; j < Math.min(m.cols, C - c); j++) {
      if (!i && !j) continue;
      if (look[r + i][c + j]) warn(`The cell in row ${r + i + 1}, column ${c + j + 1} is under a \\zxGateMulti`);
      else look[r + i][c + j] = { shape: 'block', w: m.bw, h: m.bh };
    }
  }
  const colW = Array(C).fill(0), rowH = Array(R).fill(0), rowUp = Array(R).fill(0), rowDn = Array(R).fill(0);
  for (let r = 0; r < R; r++) for (let c = 0; c < look[r].length; c++) {
    const m = look[r][c];
    if (!m) continue;
    // a drawn node's anchors sit on the outside of its line (TikZ's outer sep)
    if (m.shape === 'multi') { colW[c] = Math.max(colW[c], m.bw); rowH[r] = Math.max(rowH[r], m.bh); rowUp[r] = Math.max(rowUp[r], m.bh / 2); rowDn[r] = Math.max(rowDn[r], m.bh / 2); continue; }
    const o = m.nostroke ? 0 : m.lw != null ? m.lw : /circle|pill|rect|dash/.test(m.shape) ? 0.4 * PT : 0;
    colW[c] = Math.max(colW[c], m.cw ?? m.w + o); rowH[r] = Math.max(rowH[r], m.h + o);
    // a cell reaching further up than down (or the other way): the row's line sits that far from its top
    if (m.up != null) { rowUp[r] = Math.max(rowUp[r], m.up); rowDn[r] = Math.max(rowDn[r], m.dn); }
    else { rowUp[r] = Math.max(rowUp[r], (m.h + o) / 2); rowDn[r] = Math.max(rowDn[r], (m.h + o) / 2); }
  }
  // the visual editor spreads points and empty cells a little, so they can be picked
  if (s.minCell) { for (let c = 0; c < C; c++) colW[c] = Math.max(colW[c], s.minCell); for (let r = 0; r < R; r++) rowH[r] = Math.max(rowH[r], s.minCell); }
  for (let r = 0; r < R; r++) { const more = rowH[r] - rowUp[r] - rowDn[r]; if (more > 0) { rowUp[r] += more / 2; rowDn[r] += more / 2; } rowH[r] = rowUp[r] + rowDn[r]; }
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
    if (r && ex && ex.origins) { cy[r] = cy[r - 1] + ex.px; rowT[r] = cy[r] - rowUp[r]; }
    else { if (r) y += ctx.rs + (ex ? ex.px : 0); rowT[r] = y; cy[r] = y + rowUp[r]; }
    y = rowT[r] + rowH[r];
  }

  // a node's anchor: centre, or a point on its border
  const nodeAt = (r: any, c: any) => {
    const m = look[r] && look[r][c];
    return { x: cx[c], y: cy[r], w: m ? m.w : 0, h: m ? m.h : 0, shape: m ? m.shape : 'coord', m };
  };
  // a \zxGateMulti's box: fitted round the blocks of the cells it covers
  const multiBox = (r: any, c: any, m: any) => {
    const xa = cx[c] - m.bw / 2, xb = cx[Math.min(C - 1, c + m.cols - 1)] + m.bw / 2, ya = cy[r] - m.bh / 2, yb = cy[Math.min(R - 1, r + m.rows - 1)] + m.bh / 2;
    return { x: (xa + xb) / 2, y: (ya + yb) / 2, w: xb - xa, h: yb - ya, shape: 'rect', m };
  };
  // the names a= and alias= give (a gate's names the whole box): what to= and from= reach
  const named: Record<string, any> = Object.create(null);
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) {
    const nd = cells[r][c].node, m = look[r][c];
    if (!nd || !m) continue;
    for (const it of opts(nd.o || '').list) {
      const { name, arg } = styleOf(it);
      if ((name === 'a' || name === 'alias') && arg) named[arg.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim()] = m.shape === 'multi' ? multiBox(r, c, m) : nodeAt(r, c);
    }
  }
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
    let S = nodeAt(r, c);
    let segs = null, color = null, dash: any = false, cl = false, B = boldAll, mark = null, sa = null, ea = null, hidden = false;
    let shape = null, shapeArg;
    let bendIn = null, bendOut = null, loose = 1, bendRel = null, elbow = '', toName = null, fromName = null;
    for (const it of e.styles) {
      const { name, arg } = styleOf(it);
      if ((name === 'to' || name === 'from') && arg) { const v = arg.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim(); if (name === 'to') toName = v; else fromName = v; continue; }
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
      // tikz-cd's --| and |-- (connect -|, connect |-): along one axis, then the other (a bare -| is an arrow tip)
      if (/^(--\||\|--|connect (-\||\|-))$/.test(name)) { elbow = /^(connect )?\|/.test(name) ? 'v' : 'h'; continue; }
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
      // to=name and from=name: the wire runs to (from) the node named so; from alone runs to this cell
      for (const nm of [toName, fromName]) if (nm != null && !named[nm]) { warn(`A wire to "${nm}" isn't drawn here: no node of the diagram is named so (it is kept in the code)`); return; }
      if (fromName != null) S = named[fromName];
      let T;
      if (toName != null) T = named[toName];
      else if (!e.dirs && fromName != null) T = nodeAt(r, c);
      else {
        if (!e.dirs) { warn('A wire with no direction (like \\ar[]) is skipped'); return; }
        const r2_ = r + dr, c2 = c + dc;
        if (r2_ < 0 || r2_ >= R || c2 < 0 || c2 >= C) { warn(`A wire from row ${r + 1}, column ${c + 1} points outside the diagram`); return; }
        if (!look[r2_][c2]) warn(`A wire from row ${r + 1}, column ${c + 1} ends on an empty cell: LaTeX stops there (put \\zxN{} in it)`);
        T = nodeAt(r2_, c2);
      }
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
        } else if (elbow) { const k = elbow === 'h' ? { x: q.x, y: p.y } : { x: p.x, y: q.y }; segs = [line(p, k), line(k, q)]; } else segs = [line(p, q)];
      }
    }
    wires.push({ segs, color, dash, cl, B, hidden, src: [r, c, ei] });
    if (mark) {
      const m = midpoint(segs);
      marks.push(mark === 'H' ? { shape: 'rect', x: m.x, y: m.y, w: 1.5 * MM, h: 1.5 * MM, fill: FILL.H } : { shape: 'circle', x: m.x, y: m.y, w: 2 * MM, h: 2 * MM, fill: FILL[mark] });
    }
  });
  // ---- nodes
  // a circuit box (its content, the meter, its label), a control, a NOT, a swap cross
  const gate = (m: any, X: any, Y: any, r: any, c: any) => {
    nodes.push({ shape: m.shape === 'multi' ? 'rect' : m.shape, x: X, y: Y, w: m.w, h: m.h, fill: m.fill, stroke: m.stroke, cell: [r, c], nostroke: m.nostroke, plus: m.plus, sw: m.lw });
    if (m.c && m.c.meter) nodes.push({ shape: 'meter', x: X, y: Y, w: 0, h: 0 });
    else if (m.c && m.c.t) texts.push({ t: m.c.t, x: X, y: Y - m.c.lift, b: m.c.b, st: NORMAL, color: m.tcol });
    const L = m.label;
    if (L) {
      const lx = L.pos === 'right' ? X + m.w / 2 + L.w / 2 : L.pos === 'left' ? X - m.w / 2 - L.w / 2 : X;
      const ly = L.pos === 'above' ? Y - m.h / 2 - L.h / 2 : L.pos === 'below' ? Y + m.h / 2 + L.h / 2 : Y;
      texts.push({ t: L.t, x: lx, y: ly - L.lift, b: L.b, st: TINY });
    }
  };
  for (let r = 0; r < R; r++) for (let c = 0; c < cells[r].length; c++) {
    const m = look[r][c];
    if (!m) continue;
    const X = cx[c], Y = cy[r];
    if (m.shape === 'multi') {
      // the box fitted round its blocks, its content in the middle
      const bx = multiBox(r, c, m);
      gate({ ...m, w: bx.w, h: bx.h }, bx.x, bx.y, r, c);
      continue;
    }
    if (m.c || m.lw != null || m.nostroke) { gate(m, X, Y, r, c); continue; }
    if (m.shape === 'zxmatrix') {
      nodes.push({ shape: 'zxmatrix', x: X, y: Y, w: m.w, h: m.h, fill: m.fill, star: m.star, cell: [r, c] });
      if (m.label) texts.push({ t: m.label.t, x: X, y: Y + m.label.y - m.label.lift, b: m.label.b, st: LABEL });
      continue;
    }
    if (m.shape === 'circle' || m.shape === 'pill' || m.shape === 'rect' || m.shape === 'dash') nodes.push({ shape: m.shape, x: X, y: Y, w: m.w, h: m.h, fill: m.fill, cell: [r, c], B: boldAll });
    else nodes.push({ shape: m.shape, x: X, y: Y, w: m.w, h: m.h, cell: [r, c] });
    if (m.io) { const io = m.io.c; texts.push({ t: io.t, x: X + m.io.side * (2 * PT + io.w / 2), y: Y - io.lift, b: io.b, st: NORMAL }); }
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
// \zxMeter: the package's picture (scale .5, line width .5) scaled by .8: the arc (0,0) to[bend left=50] (1,0) and the
// arrow (.5,-.15) to (.9,.75) with a Stealth tip 6pt long, set as a box 11.78pt × 10.78pt centred at (x, y)
function meterSvg(x: any, y: any, ink: any) {
  const u = 0.4 * 28.4528 * PT, w = 0.4 * PT, x0 = x - 11.781 * PT / 2 + 0.0176 * u, y0 = y + 10.781 * PT / 2 - 0.1676 * u;
  const P = (a: any, b: any) => [x0 + a * u, y0 - b * u];
  const d = 0.3915, c1 = P(d * Math.cos(50 * Math.PI / 180), d * Math.sin(50 * Math.PI / 180)), c2 = P(1 + d * Math.cos(130 * Math.PI / 180), d * Math.sin(130 * Math.PI / 180));
  const [ax, ay] = P(0, 0), [bx, by] = P(1, 0), [sx, sy] = P(0.5, -0.15), [ex, ey] = P(0.9, 0.75);
  // the tip: 4.8pt long, 3.6pt wide, its back cut in by 1.56pt; the line ends at the inset
  const L = 4.8 * PT, hw = 1.8 * PT, ins = 1.56 * PT, l = Math.hypot(ex - sx, ey - sy), ux = (ex - sx) / l, uy = (ey - sy) / l;
  const back = (k: any, s_: any) => `${r2(ex - ux * k - uy * s_)},${r2(ey - uy * k + ux * s_)}`;
  return `<path d="M${r2(ax)},${r2(ay)}C${r2(c1[0])},${r2(c1[1])} ${r2(c2[0])},${r2(c2[1])} ${r2(bx)},${r2(by)}M${r2(sx)},${r2(sy)}L${back(L - ins, 0)}" fill="none" stroke="${ink}" stroke-width="${r2(w)}" stroke-linecap="round"/>` +
    `<path d="M${r2(ex)},${r2(ey)}L${back(L, hw)}L${back(L - ins, 0)}L${back(L, -hw)}Z" fill="${ink}" stroke="${ink}" stroke-width="${r2(w)}" stroke-linejoin="round"/>`;
}
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
      const sw = n.sw || (n.B ? 1.2 * PT : lw), stroke = n.nostroke ? 'none' : n.stroke ? TD.css(n.stroke) : ink, fill = n.shape === 'dash' ? 'none' : TD.css(n.fill || '#ffffff');
      if (n.shape === 'meter') return meterSvg(n.x, n.y, ink);
      // the chevron: its body 1pt either side of the centre, the point 3pt ahead, the tail 3pt behind cut in by the notch
      if (n.shape === 'zxmatrix') { const k = n.star ? -PT : PT, p = (a: any, b: any) => `${r2(n.x + a * k)},${r2(n.y - b * PT)}`; return `<path d="M${p(-4, 3)}L${p(1, 3)}L${p(4, 0)}L${p(1, -3)}L${p(-4, -3)}L${p(-1, 0)}Z" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"/>`; }
      // the swap cross: the diagonals of a 6pt square, round caps
      if (n.shape === 'cross') return `<path d="M${r2(n.x - n.w / 2)},${r2(n.y - n.h / 2)}L${r2(n.x + n.w / 2)},${r2(n.y + n.h / 2)}M${r2(n.x - n.w / 2)},${r2(n.y + n.h / 2)}L${r2(n.x + n.w / 2)},${r2(n.y - n.h / 2)}" fill="none" stroke="${ink}" stroke-width="${r2(sw)}" stroke-linecap="round"/>`;
      // ⊕: the circle and its two diameters
      if (n.plus) return `<ellipse cx="${r2(n.x)}" cy="${r2(n.y)}" rx="${r2(n.w / 2)}" ry="${r2(n.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"/><path d="M${r2(n.x)},${r2(n.y - n.h / 2)}V${r2(n.y + n.h / 2)}M${r2(n.x - n.w / 2)},${r2(n.y)}H${r2(n.x + n.w / 2)}" stroke="${ink}" stroke-width="${r2(sw)}"/>`;
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
    for (const t of Lo.texts) out += TD.textSvg(t.t, t.st, t.color || s.color || '#000000', t.x, t.y, ctx);
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
  menu: { order: 6, group: 'quantum', label: "ZX", title: "ZX-calculus diagram, written for zx-calculus", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M2 12h3.5M14.5 12h3M26.5 12h3.5M10 7.5C10 3 22 3 22 7.5\"/><circle cx=\"10\" cy=\"12\" r=\"4.5\" class=\"a1\"/><circle cx=\"22\" cy=\"12\" r=\"4.5\"/><rect x=\"14\" y=\"1.5\" width=\"4\" height=\"4\" class=\"a1\"/></svg>" },
  nodeImport: { re: /\\begin\{ZX\}[\s\S]*\\end\{ZX\}/, order: 3, bb: (q) => TD.zxLayout(q).bb },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.zxEditor, alias: "zxOpen" }
});
export { layout, fullCode };
