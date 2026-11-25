import { runtime as TD } from '../runtime';
import { parseMacros } from '../core/doc-macros';
import { layoutCache, srcKey } from './layout-cache';
import { num3 } from '../core/format';
import { groupEnd as close, skipSpace as skip } from '../core/tex-scan';
// Timing diagrams written with the tikz-timing package. The source is the object: a tikztimingtable whose
// rows are "name & characters \\" and whose \extracode holds annotations (arrows between edges, marker
// lines, grids). It is drawn here at the package's own sizes, measured against pdflatex: one period is
// 1.6ex of the table's \sffamily (7.11pt) wide and one signal that high, lines are 0.15ex, rows sit
// \rowdist = 2 signal heights apart and data text is set at 0.6 scale. The code is exported unchanged
// inside a node (tikz-timing draws its own tikzpicture), so pdfLaTeX builds it as written.
// The visual editor (js/tmeditor.ts) reads the code into a model and writes it back.
const { r2, esc } = TD.util;
const K = TD.PT_PER_PX, PT = 1 / K;
const U = 7.1111 * PT;            // xunit = yunit = 1.6ex in \sffamily at 10pt
const LW = 0.6667 * PT;           // line width 0.15ex
const STRUT = { h: 8.4 * PT, d: 3.6 * PT }; // the \strut of a row label
const LABEL = { size: 10 * PT, font: 'cmss' };
const DTEXT = { size: 6 * PT, font: 'cmss' };
const SIZES: Record<string, any> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
// \baselineskip at each size: a \strut is 0.7 of it above the baseline and 0.3 below
const SKIP: Record<string, number> = { 5: 6, 7: 8, 8: 9.5, 9: 11, 10: 12, 12: 14, 14.4: 18, 17.28: 22, 20.74: 25, 24.88: 30 };
const INK: Record<string, any> = { Z: '#0000ff', X: '#ff0000', M: '#734d26', U: '#808080', help: '#808080' };
const DEF = { lslope: 0.1, dslope: 0.2, zslope: 0.05, rowdist: 2, coldist: 1 };
for (const o of [SIZES, SKIP]) Object.setPrototypeOf(o, null);

// ---------------------------------------------------------------- fonts and lengths
// A font as TeX selects it: { size (pt), fam: 'cmss' | 'cmr' | 'cmtt', bf }. The table is \sffamily at 10pt.
const FAMS: Record<string, string> = { sffamily: 'cmss', sf: 'cmss', textsf: 'cmss', rmfamily: 'cmr', rm: 'cmr', textrm: 'cmr', textnormal: 'cmr', normalfont: 'cmr', ttfamily: 'cmtt', tt: 'cmtt', texttt: 'cmtt' };
Object.setPrototypeOf(FAMS, null);
const SF10 = { size: 10, fam: 'cmss', bf: false }, RM10 = { size: 10, fam: 'cmr', bf: false };
// a font switch (\tiny\sffamily, \bfseries …) on a font; the switches it does not know leave it as it was
function fontWith(f: any, spec: any) {
  const r = { ...f };
  for (const m of String(spec || '').matchAll(/\\([A-Za-z]+)/g)) {
    const w = m[1];
    if (SIZES[w]) r.size = SIZES[w];
    else if (FAMS[w]) { r.fam = FAMS[w]; if (w === 'normalfont' || w === 'textnormal') r.bf = false; }
    else if (w === 'bfseries' || w === 'bf' || w === 'textbf') r.bf = true;
    else if (w === 'mdseries') r.bf = false;
  }
  return r;
}
// the font's ex (cmss10 4.444pt, cmr10 and cmtt10 4.306pt, the bold faces a little more) and em
const exOf = (f: any) => f.size * (f.fam === 'cmss' ? (f.bf ? 0.45833 : 0.44444) : f.bf ? 0.44444 : 0.43056);
const strutOf = (f: any) => { const bs = SKIP[f.size] || 1.2 * f.size; return { h: 0.7 * bs, d: 0.3 * bs }; };
const styleOf = (f: any) => ({ size: f.size * PT, font: f.fam, bold: !!f.bf });
// a TeX length in font f, in pt: 3ex, 2pt, 1.5mm …; a bare number comes back as { n } (a multiple of a unit vector,
// or pt where pgfmath reads it as a length)
function dimOf(v: any, f: any) {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(pt|mm|cm|in|bp|ex|em)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1]), u = m[2];
  if (!u) return { n, pt: null as any };
  return { n: null as any, pt: n * ({ pt: 1, mm: 2.84528, cm: 28.4528, in: 72.27, bp: 1.00375, ex: exOf(f), em: f.size } as Record<string, number>)[u] };
}
const lenPt = (v: any, f: any) => { const d = dimOf(v, f); return d ? (d.pt ?? d.n) : null; }; // a bare number is pt
// plain arithmetic, as foreach values leave it in a coordinate: 3-.5, 2*1.5, (4)
function evalNum(e: any) {
  const x = String(e || '').replace(/\s+/g, '');
  let i = 0;
  const num_ = (): number => {
    if (x[i] === '(') { i++; const v = sum(); if (x[i] !== ')') return NaN; i++; return v; }
    if (x[i] === '-' || x[i] === '+') { const sg = x[i++] === '-' ? -1 : 1; return sg * num_(); }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(x.slice(i));
    if (!m) return NaN;
    i += m[0].length; return parseFloat(m[0]);
  };
  const prod = (): number => { let v = num_(); while (x[i] === '*' || x[i] === '/') { const op = x[i++], w = num_(); v = op === '*' ? v * w : v / w; } return v; };
  const sum = (): number => { let v = prod(); while (x[i] === '+' || x[i] === '-') { const op = x[i++], w = prod(); v = op === '+' ? v + w : v - w; } return v; };
  if (!x) return NaN;
  const v = sum();
  return i === x.length ? v : NaN;
}

TD.TIMING_DEFAULT = [
  '\\begin{tikztimingtable}[timing/rowdist=3]',
  '  CLK & 8{2C} \\\\',
  '  D   & 3U 4D{A} 4D{B} 5U \\\\',
  '  Q   & 7X 4D{A} 5D{B} \\\\',
  '\\extracode',
  '  \\vertlines[help lines]{2,6,10,14}',
  '  \\draw [<->] (3,-1.5) -- node [above, font=\\footnotesize] {$t_{su}$} (6,-1.5);',
  '  \\draw [<->] (6,-4.5) -- node [above, font=\\footnotesize] {$t_{h}$} (7,-4.5);',
  '  \\draw [->] (6,-7.5) -- node [above, font=\\footnotesize] {$t_{co}$} (7,-7.5);',
  '\\end{tikztimingtable}',
].join('\n');

const VALUES = ['H', 'L', 'Z', 'X', 'D', 'U', 'M', 'G', 'S', 'C', 'T'];
const VALUE_NAMES = { H: 'High', L: 'Low', Z: 'High impedance', X: 'Unknown', D: 'Data', U: 'Unknown data', M: 'Metastable', G: 'Glitch', S: 'Gap', C: 'Clock', T: 'Toggle' };

// ---------------------------------------------------------------- reading the code
function split(s: any, sep = ',', braces = false) {
  const out = [];
  let d = 0, cur = '';
  const op = braces ? '{' : '{[(', cl = braces ? '}' : '}])';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (op.includes(c)) d++;
    else if (cl.includes(c)) d = Math.max(0, d - 1); // a stray closing brace doesn't swallow the rest
    if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const opts = (s: any) => split(s || '').map((x) => x.trim()).filter(Boolean);
const kv = (it: any) => { const m = /^([^=]+?)\s*(?:=\s*([\s\S]*))?$/.exec(it.trim()); return m ? { k: m[1].trim(), v: m[2] == null ? null : m[2].trim() } : { k: it.trim(), v: null }; };
const stripComments = (s: any) => s.replace(/(^|[^\\])%.*$/gm, '$1');
const num = num3;
// \(…\) as $…$ for drawing
const shown = (t: any) => String(t || '').replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');

// the top-level positions of a control word (not inside braces)
function findTop(s: any, word: any, from = 0) {
  let d = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === '\\') {
      if (d === 0 && s.startsWith(word, i) && !/[A-Za-z]/.test(s[i + word.length] || '')) return i;
      i++;
    }
  }
  return -1;
}
// rows end at a top-level \\ (and the last one may not)
function splitRows(s: any) {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '\\' && d === 0) { out.push(cur); cur = ''; i++; continue; }
      cur += c + (s[i + 1] || ''); i++; continue;
    }
    if (c === '{') d++; else if (c === '}') d = Math.max(0, d - 1);
    cur += c;
  }
  out.push(cur);
  return out;
}

// The model: { topts: [option], rows: [row], ext: [item], xform: 'macro' | 'env', warnings }.
// row: { src (as written), name, init (a character or null), ropts (string or null), segs: [seg], tail: [raw] }
// seg: { c: 'H' | 'L' | … (upper case), w (periods), t (D/U text, or null: no new value), topt, pre: [raw] }
// ext item: { k: 'annot' | 'vert' | 'hor' | 'grid' | 'fullgrid' | 'raw', src, … }
function parse(src: any) {
  const warnings: any[] = [], warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const t = stripComments(String(src || ''));
  const M = { topts: ([] as any[]), rows: [] as any[], ext: ([] as any[]), xform: 'macro', warnings };
  const bm = /\\begin\{tikztimingtable\}/.exec(t);
  let body = t;
  if (bm) {
    let i = skip(t, bm.index + bm[0].length);
    if (t[i] === '[') { const e = close(t, i); if (e > 0) { M.topts = opts(t.slice(i + 1, e)); i = e + 1; } }
    const em = t.indexOf('\\end{tikztimingtable}', i);
    if (em < 0) warn('\\end{tikztimingtable} is missing');
    body = t.slice(i, em < 0 ? t.length : em);
  } else if (t.trim()) warn('There is no \\begin{tikztimingtable}: the code is read as its rows');
  // rows, then the extra code
  let rowsPart = body, extPart = '';
  const xm = findTop(body, '\\extracode'), xe = findTop(body, '\\begin');
  if (xe >= 0 && /^\\begin\s*\{extracode\}/.test(body.slice(xe)) && (xm < 0 || xe < xm)) {
    M.xform = 'env';
    rowsPart = body.slice(0, xe);
    const st = body.indexOf('}', xe) + 1, en = body.indexOf('\\end{extracode}', st);
    extPart = body.slice(st, en < 0 ? body.length : en);
    if (en >= 0 && body.slice(en + 15).trim()) warn('Rows after the extra code aren\'t drawn here');
  } else if (xm >= 0) {
    rowsPart = body.slice(0, xm);
    extPart = body.slice(xm + 10);
    const ee = findTop(extPart, '\\endextracode');
    if (ee >= 0) { if (extPart.slice(ee + 13).trim()) warn('Rows after \\endextracode aren\'t drawn here'); extPart = extPart.slice(0, ee); }
  }
  // every \\ ends a row, a blank one too (it takes its row's place, with an empty name); what follows the last \\ is a
  // row only when something is written there
  const parts = splitRows(rowsPart);
  parts.forEach((r, k) => {
    if (!r.trim()) { if (k < parts.length - 1) M.rows.push({ src: r, name: '', init: null, ropts: null, segs: [], tail: [], blank: true }); return; }
    M.rows.push(readRow(r, warn));
  });
  M.ext = readExtra(extPart, warn);
  return M;
}

function readRow(src: any, warn: any) {
  const cols = split(src, '&', true); // a row's cells: only braces group (a name may hold a lone parenthesis)
  const row = { src, name: cols[0].trim(), init: (null as any), ropts: (null as any), segs: ([] as any[]), tail: ([] as any[]) };
  if (cols.length < 2) { warn(`The row "${src.trim()}" has no & between its name and its characters`); return row; }
  if (cols.length > 2) warn('A row has more than two columns: only the first two are used');
  let s = cols[1], i = skip(s, 0);
  if (s[i] === '[' && s[i + 1] !== '[') {
    const e = close(s, i);
    if (e > 0) {
      const inner = s.slice(i + 1, e).trim();
      if (/^[A-Za-z]$/.test(inner)) row.init = inner.toUpperCase();
      else row.ropts = inner;
      s = s.slice(e + 1);
    }
  }
  const toks = readChars(s, warn);
  let pre = [];
  for (const k of toks) {
    if (k.raw != null) { pre.push(k.raw); continue; }
    k.pre = pre; pre = [];
    row.segs.push(k);
  }
  row.tail = pre;
  return row;
}

// The characters of a row → a flat list of segs and raw tokens (kept, not drawn). Repeats are expanded.
function readChars(s: any, warn: any) : any {
  const out = [];
  let i = 0, width = null, adj = 0;
  const lslope = DEF.lslope;
  const mathNum = (e: any) => {
    const x = e.replace(/\\(lslope|slope)\b/g, String(lslope)).replace(/\\dslope\b/g, String(DEF.dslope)).replace(/\\zslope\b/g, String(DEF.zslope)).replace(/\\wscale\b/g, '1');
    return evalNum(x);
  };
  while (i < s.length) {
    i = skip(s, i);
    if (i >= s.length) break;
    const c = s[i];
    // a width: 2, 2.5, .5
    const nm = /^\d*\.?\d+/.exec(s.slice(i));
    if (nm) {
      i += nm[0].length;
      const j = skip(s, i);
      if (s[j] === '{') {
        const e = close(s, j);
        if (e < 0) { warn('A { in a row is not closed'); break; }
        const inner: any = readChars(s.slice(j + 1, e), warn), n = Math.round(parseFloat(nm[0]));
        for (let r = 0; r < n; r++) for (const k of inner) out.push(k.raw != null ? { raw: k.raw } : { ...k, pre: [] });
        i = e + 1; width = null; continue;
      }
      if (/[bBfF]/.test(s[j] || '')) { adj += (/[bB]/.test(s[j]) ? -1 : 1) * parseFloat(nm[0]); i = j + 1; continue; }
      width = parseFloat(nm[0]); i = j; continue;
    }
    if (c === '$') {
      const e = s.indexOf('$', i + 1);
      const v = mathNum(s.slice(i + 1, e < 0 ? s.length : e));
      if (isFinite(v)) width = v; else warn(`The width $${s.slice(i + 1, e)}$ isn't understood here: 1 is used`);
      i = e < 0 ? s.length : e + 1; continue;
    }
    if (c === '{') {
      const e = close(s, i);
      if (e < 0) { warn('A { in a row is not closed'); break; }
      const g = s.slice(i + 1, e), bm = BG_RE.exec(g);
      if (bm) {
        const inner: any = readChars(g.slice(bm[0].length), warn), segs: any = inner.filter((k: any) => k.raw == null);
        if (segs.length === 1 && segs[0].c === bm[1].toUpperCase() && inner.length === 1) { segs[0].bg = bm[2].trim(); out.push(segs[0]); i = e + 1; continue; }
      }
      out.push(...readChars(g, warn));
      i = e + 1; continue;
    }
    if (c === '[') {
      // [opts], [[opts]], [!opts!], [|opts|]: kept as written
      let e;
      if (s[i + 1] === '[') { e = s.indexOf(']]', i); e = e < 0 ? s.length : e + 1; }
      else e = close(s, i);
      if (e < 0) e = s.length - 1;
      const raw = s.slice(i, e + 1);
      out.push({ raw });
      if (!/^\[\s*\]$/.test(raw)) warn(`"${raw}" in a row isn't drawn here (it is kept in the code)`);
      i = e + 1; continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const C = c.toUpperCase();
      if (C === 'N') {
        // N[opts](name){content}: a node, kept
        let j = i + 1;
        for (;;) { j = skip(s, j); if (s[j] === '[' || s[j] === '(' || s[j] === '{') { const e = close(s, j); if (e < 0) break; j = e + 1; } else break; }
        out.push({ raw: s.slice(i, j).trim() });
        i = j; continue;
      }
      if (!'HLZXDUTCMGS'.includes(C)) { warn(`The character "${c}" isn't drawn here`); out.push({ raw: c }); i++; continue; }
      let w = (width == null ? 1 : width) * (c === C ? 1 : 0.5) + adj;
      if (C === 'G') w = 0;
      const seg: Record<string, any> = { c: C, w: Math.max(0, w), t: null, topt: '' };
      if (c !== C) seg.lc = true;
      i++;
      // only D takes {text} (spaces may come first); U takes none, so a { after it is a group of its own
      if (C === 'D') {
        const j = skip(s, i);
        if (s[j] === '{') {
          const e = close(s, j);
          if (e < 0) { warn('A { after D is not closed'); break; }
          let txt = s.slice(j + 1, e).trim();
          if (txt[0] === '[') { const f = close(txt, 0); if (f > 0) { seg.topt = txt.slice(0, f + 1); txt = txt.slice(f + 1).trim(); } }
          seg.t = txt;
          i = e + 1;
        }
      }
      out.push(seg);
      width = null; adj = 0;
      continue;
    }
    // anything else: kept
    if (c === '!' || c === '@') {
      const j = skip(s, i + 1);
      const e = s[j] === '{' ? close(s, j) : j;
      out.push({ raw: s.slice(i, e + 1) });
      warn(`"${s.slice(i, e + 1)}" in a row isn't drawn here (it is kept in the code)`);
      i = e + 1; continue;
    }
    if (c !== ',' && c !== ';') warn(`"${c}" in a row isn't understood here`);
    out.push({ raw: c });
    i++;
  }
  return out;
}

// one data cell's background: {[timing/d/background/.style={fill=yellow!40}]2D{head}} (a group keeps it to that cell)
const BG_RE = /^\s*\[\s*timing\/([du])\/background\/\.style\s*=\s*\{([^{}]*)\}\s*\]/;
// a break across the rows at time t, as the editor writes it:
// \foreach \y in {0,-3} {\fill[white] (t-.2,\y-.2) -- (t,\y+1.2) -- (t+.2,\y+1.2) -- (t,\y-.2) -- cycle; \draw (t-.2,\y-.2) -- (t,\y+1.2) (t,\y-.2) -- (t+.2,\y+1.2);}
const BRK_RE = /^\\foreach\s*\\y\s+in\s*\{([^}]*)\}\s*\{\s*\\fill\s*\[white\]\s*\((-?[\d.]+)\s*,\s*\\y\s*-\s*\.2\)[^;]*;\s*\\draw[^;]*;\s*\}/;
const brkCode = (t: any, ys: any) => { const a = num(t - 0.2), b = num(t), c = num(t + 0.2); return `\\foreach \\y in {${ys.map(num).join(',')}} {\\fill[white] (${a},\\y-.2) -- (${b},\\y+1.2) -- (${c},\\y+1.2) -- (${b},\\y-.2) -- cycle; \\draw (${a},\\y-.2) -- (${b},\\y+1.2) (${b},\\y-.2) -- (${c},\\y+1.2);}`; };
// the extra code: annotations, marker lines, grids, breaks, nodes, rules and headers are drawn; anything else is kept
// as written. Layers and scopes are structure: each item carries the options of the scopes it is in (sc, outer
// first) and whether it is on the background layer (\begin{background} is \pgfonlayer{background}\scope).
const ENDS = /^\\(?:begin|end|tablerules|tableheader|vertlines|horlines|tablegrid|fulltablegrid|makeatletter|makeatother|foreach|node)(?![A-Za-z])/;
function readExtra(s: any, warn: any, ctx: any = { sc: [], layers: [] }) {
  const out: any[] = [];
  let i = 0;
  const tag = (it: any) => { it.sc = ctx.sc.map((x: any) => x.o).filter(Boolean); it.back = ctx.sc.some((x: any) => x.back); return it; };
  // [opts] after i (spaces and line breaks first), or ''
  const optAt = (j: any) => { const k = skip(s, j); if (s[k] !== '[') return ['', j]; const e = close(s, k); return e < 0 ? ['', j] : [s.slice(k + 1, e).trim(), e + 1]; };
  while (i < s.length) {
    i = skip(s, i);
    if (i >= s.length) break;
    const rest = s.slice(i);
    let m = /^\\begin\s*\{(pgfonlayer|scope|background)\}/.exec(rest);
    if (m) {
      let j = i + m[0].length, o = '', back = false;
      if (m[1] === 'pgfonlayer') { const k = skip(s, j); if (s[k] === '{') { const e = close(s, k); back = s.slice(k + 1, e).trim() === 'background'; j = e + 1; } }
      else { [o, j] = optAt(j); back = m[1] === 'background' || /(^|,)\s*on background layer\s*(,|$)/.test(o); }
      ctx.sc.push({ o: o.replace(/(^|,)\s*on background layer\s*(?=,|$)/, '$1'), back, env: m[1] });
      out.push({ k: 'open', src: s.slice(i, j).trim() });
      i = j; continue;
    }
    m = /^\\end\s*\{(pgfonlayer|scope|background)\}/.exec(rest);
    if (m) { ctx.sc.pop(); out.push({ k: 'close', src: m[0] }); i += m[0].length; continue; }
    m = /^\\(makeatletter|makeatother|relax)(?![A-Za-z])/.exec(rest);
    if (m) { out.push({ k: 'skip', src: m[0] }); i += m[0].length; continue; }
    m = /^\\tablerules(?![A-Za-z])/.exec(rest);
    if (m) { const [o, j] = optAt(i + m[0].length); out.push(tag({ k: 'rules', o, src: s.slice(i, j).trim() })); i = j; continue; }
    m = /^\\tableheader(?![A-Za-z])/.exec(rest);
    if (m) {
      // \tableheader[header opts][label opts]{label}[row opts]{row}
      let j = i + m[0].length, o1, o2, o3, ok = true;
      const arg = () => { const k = skip(s, j); if (s[k] !== '{') { ok = false; return ''; } const e = close(s, k); if (e < 0) { ok = false; return ''; } j = e + 1; return s.slice(k + 1, e); };
      [o1, j] = optAt(j); [o2, j] = optAt(j);
      const L = arg();
      [o3, j] = optAt(j);
      const R = arg();
      const src = s.slice(i, j).trim();
      if (ok) out.push(tag({ k: 'header', o: [o1, o2].filter(Boolean).join(', '), ro: [o1, o3].filter(Boolean).join(', '), L, R, src }));
      else { out.push({ k: 'raw', src }); warn(`"${src}" isn't drawn here (it is kept in the code)`); }
      i = j; continue;
    }
    m = /^\\foreach\s*(?:\[([^\]]*)\]\s*)?\\([A-Za-z]+)\s*(?:\[([^\]]*)\]\s*)?in\s*\{/.exec(rest);
    if (m) {
      // \foreach \v [count=\c from k] in {list} {body}, or a body that is one statement
      const lb = i + m[0].length - 1, le = close(s, lb);
      let j = le < 0 ? -1 : skip(s, le + 1), body = '';
      if (j >= 0 && s[j] === '{') { const e = close(s, j); if (e < 0) j = -1; else { body = s.slice(j + 1, e); j = e + 1; } }
      else if (j >= 0) { const e = stmtEnd(s, j); body = s.slice(j, e + 1); j = e + 1; }
      if (j < 0) { const src = s.slice(i).trim(); out.push({ k: 'raw', src }); warn(`"${src.slice(0, 40)}…" isn't drawn here (it is kept in the code)`); break; }
      const cm = /count\s*=\s*\\([A-Za-z]+)(?:\s+from\s+(-?[\d.]+))?/.exec(`${m[1] || ''},${m[3] || ''}`);
      out.push(tag({ k: 'each', v: m[2], cnt: cm ? cm[1] : null, from: cm && cm[2] != null ? parseFloat(cm[2]) : 1, list: s.slice(lb + 1, le), body, ctx: { sc: ctx.sc.slice(), layers: [] }, src: s.slice(i, j).trim() }));
      i = j; continue;
    }
    m = /^\\(vertlines|horlines)\b\s*/.exec(rest);
    if (m) {
      let j = i + m[0].length, o = '';
      if (s[j] === '[') { const e = close(s, j); o = s.slice(j + 1, e).trim(); j = skip(s, e + 1); }
      let list = '';
      if (s[j] === '{') { const e = close(s, j); list = s.slice(j + 1, e).trim(); j = e + 1; }
      out.push(tag({ k: m[1] === 'vertlines' ? 'vert' : 'hor', o, list, src: s.slice(i, j).trim() }));
      i = j; continue;
    }
    m = BRK_RE.exec(rest);
    if (m) { out.push(tag({ k: 'brk', t: parseFloat(m[2]) + 0.2, ys: m[1].split(',').map((v) => parseFloat(v)).filter(isFinite), src: m[0] })); i += m[0].length; continue; }
    m = /^\\(tablegrid|fulltablegrid)\b(\*?)\s*/.exec(rest);
    if (m) {
      let j = i + m[0].length, o = '';
      if (s[j] === '[') { const e = close(s, j); o = s.slice(j + 1, e).trim(); j = e + 1; }
      out.push(tag({ k: m[1] === 'tablegrid' ? 'grid' : 'fullgrid', star: !!m[2], o, src: s.slice(i, j).trim() }));
      i = j; continue;
    }
    // a statement up to its ; (or up to a command of the extra code that starts after it)
    const e = stmtEnd(s, i);
    const st = s.slice(i, e + 1).trim();
    const a = readAnnot(st) || readNode(st);
    if (a) out.push(tag(a));
    else if (st) { out.push(tag({ k: 'raw', src: st })); if (!/\\(twidth|nrows)(?![A-Za-z])/.test(st)) warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`); }
    i = e + 1;
  }
  return out;
}
// where the statement starting at i ends: its ; at the top level, or just before the next command of the extra code
function stmtEnd(s: any, i: any) {
  let e = i, d = 0;
  for (; e < s.length; e++) {
    const c = s[e];
    if (c === '\\') { if (d <= 0 && e > i && ENDS.test(s.slice(e))) return e - 1; e++; continue; }
    if ('{[('.includes(c)) d++;
    else if ('}])'.includes(c)) d--;
    else if (c === ';' && d <= 0) break;
  }
  return Math.min(e, s.length - 1);
}
// a coordinate: (x,y) in the picture's units (arithmetic allowed) → { x, y }; (rowN.anchor), (labelN.anchor) → { ref, a }
function readPoint(t: any) {
  const q = String(t || '').trim();
  const r = /^(row|label)(\d+)(?:\.([a-z ]+))?$/.exec(q);
  if (r) return { ref: r[1], n: parseInt(r[2], 10), a: (r[3] || 'center').trim() };
  const parts = split(q, ',');
  if (parts.length !== 2) return null;
  const x = evalNum(parts[0]), y = evalNum(parts[1]);
  return isFinite(x) && isFinite(y) ? { x, y } : null;
}
// \node [opts] (name) at (point) [opts] {text};
function readNode(st: any) {
  const m = /^\\node(?![A-Za-z])\s*/.exec(st);
  if (!m) return null;
  let i = m[0].length, o: any[] = [], at: any = null;
  for (;;) {
    i = skip(st, i);
    if (st[i] === '[') { const e = close(st, i); if (e < 0) return null; o = o.concat(opts(st.slice(i + 1, e))); i = e + 1; continue; }
    if (st[i] === '(') { const e = close(st, i); if (e < 0) return null; i = e + 1; continue; } // its name
    if (st.startsWith('at', i) && /[\s(]/.test(st[i + 2] || '')) {
      const k = skip(st, i + 2);
      if (st[k] !== '(') return null;
      const e = close(st, k);
      if (e < 0) return null;
      at = readPoint(st.slice(k + 1, e));
      if (!at) return null;
      i = e + 1; continue;
    }
    break;
  }
  if (!at || st[i] !== '{') return null;
  const e = close(st, i);
  if (e < 0 || st.slice(e + 1).trim() !== ';') return null;
  return { k: 'node', o, at, t: st.slice(i + 1, e), src: st };
}
// \draw [opts] (x1,y1) -- node [opts] {text} (x2,y2);  (or the node after the second point)
function readAnnot(st: any) {
  const m = /^\\draw\s*/.exec(st);
  if (!m) return null;
  let i = m[0].length, o: any[] = [];
  const pt = () => {
    i = skip(st, i);
    if (st[i] !== '(') return null;
    const e = close(st, i), p = e < 0 ? null : readPoint(st.slice(i + 1, e));
    if (!p || p.x == null) return null;
    i = e + 1;
    return [p.x, p.y];
  };
  const node = () => {
    i = skip(st, i);
    if (!st.startsWith('node', i)) return null;
    i = skip(st, i + 4);
    let no: any[] = [];
    if (st[i] === '[') { const e = close(st, i); if (e < 0) return null; no = opts(st.slice(i + 1, e)); i = skip(st, e + 1); }
    if (st[i] !== '{') return null;
    const e = close(st, i);
    if (e < 0) return null;
    const t = st.slice(i + 1, e);
    i = e + 1;
    return { o: no.filter((x) => !/^(midway|pos\s*=.*)$/.test(x)), t };
  };
  i = skip(st, i);
  if (st[i] === '[') { const e = close(st, i); if (e < 0) return null; o = opts(st.slice(i + 1, e)); i = e + 1; }
  const p1 = pt();
  if (!p1) return null;
  i = skip(st, i);
  if (!st.startsWith('--', i)) return null;
  i += 2;
  let n = node();
  const p2 = pt();
  if (!p2) return null;
  if (!n) n = node();
  i = skip(st, i);
  if (st[i] !== ';' || st.slice(i + 1).trim()) return null;
  return { k: 'annot', o, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], lo: n ? n.o : [], t: n ? n.t : null, src: st };
}

// ---------------------------------------------------------------- writing the code
// Typed text is written so it can't break the table: an unmatched brace would end the row early (\{ \}), a bare &
// would start a new column (\&), % would comment out the rest of the row (\%), # is an error (\#), _ and ^ are
// errors outside maths (\_ \textasciicircum{}), and a lone $ would leave maths open (\$). Text that is already escaped stays.
function safeTeX(t: any) {
  const src = String(t), dollars = [];
  for (let i = 0; i < src.length; i++) { if (src[i] === '\\') i++; else if (src[i] === '$') dollars.push(i); }
  const lone = dollars.length % 2 ? dollars[dollars.length - 1] : -1;
  const out = [...src], open = [];
  let math = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c === '\\') { if (i === out.length - 1) out[i] = '\\ '; i++; continue; }
    if (c === '$') { if (i === lone) out[i] = '\\$'; else math = !math; }
    else if (c === '{') open.push(i);
    else if (c === '}') { if (open.length) open.pop(); else out[i] = '\\}'; }
    else if (c === '&' || c === '%' || c === '#') out[i] = '\\' + c;
    else if (!math && c === '_') out[i] = '\\_';
    else if (!math && c === '^') out[i] = '\\textasciicircum{}';
  }
  for (const i of open) out[i] = '\\{';
  return out.join('');
}
function segCode(s: any) {
  const c = s.c;
  let tok;
  if (c === 'G') tok = 'G';
  else if (Math.abs(s.w - 1) < 1e-9) tok = c;
  else if (Math.abs(s.w - 0.5) < 1e-9) tok = c.toLowerCase();
  else tok = num(s.w) + c;
  if (c === 'D' && s.t != null) tok += `{${s.topt || ''}${safeTeX(s.t)}}`;
  if ((c === 'D' || c === 'U') && s.bg) tok = `{[timing/${c.toLowerCase()}/background/.style={${s.bg}}]${tok}}`;
  return tok;
}
function charsCode(row: any) {
  const parts = [];
  let run: any = null;
  const flush = () => { if (!run) return; parts.push(run.n > 1 ? `${run.n}{${run.tok}}` : run.tok); run = null; };
  let prev = null;
  for (const s of row.segs) {
    const tok = segCode(s);
    if (s.pre && s.pre.length) { flush(); parts.push(...s.pre); }
    else if (tok[0] === '{' && prev && prev.c === 'D' && prev.t == null) { flush(); parts.push(';'); }
    prev = s;
    if ((s.c === 'C' || s.c === 'T') && run && run.tok === tok) { run.n++; continue; }
    flush();
    if (s.c === 'C' || s.c === 'T') run = { tok, n: 1 };
    else parts.push(tok);
  }
  flush();
  parts.push(...(row.tail || []));
  return parts.join(' ');
}
function rowCode(row: any) {
  const head = row.init ? `[${row.init}] ` : row.ropts ? `[${row.ropts}] ` : '';
  return `${safeTeX(row.name)} & ${head}${charsCode(row)}`;
}
function extCode(x: any) {
  if (!x.dirty && x.src != null) return x.src;
  if (x.k === 'annot') {
    const node = x.t != null ? ` node [${x.lo.join(', ')}] {${safeTeX(x.t)}}` : '';
    return `\\draw${x.o.length ? ` [${x.o.join(', ')}]` : ''} (${num(x.x1)},${num(x.y1)}) --${node} (${num(x.x2)},${num(x.y2)});`;
  }
  if (x.k === 'vert' || x.k === 'hor') return `\\${x.k === 'vert' ? 'vertlines' : 'horlines'}${x.o ? `[${x.o}]` : ''}{${x.list}}`;
  if (x.k === 'brk') return brkCode(x.t, x.ys);
  if (x.k === 'grid' || x.k === 'fullgrid') return `\\${x.k === 'grid' ? 'tablegrid' : 'fulltablegrid'}${x.star ? '*' : ''}${x.o ? `[${x.o}]` : ''}`;
  return x.src;
}
function write(M: any) {
  const lines = M.rows.map((r: any) => `  ${r.dirty ? rowCode(r) : r.src.trim()} \\\\`);
  if (M.ext.length) {
    lines.push(M.xform === 'env' ? '\\begin{extracode}' : '\\extracode');
    for (const x of M.ext) lines.push('  ' + extCode(x));
    if (M.xform === 'env') lines.push('\\end{extracode}');
  }
  return `\\begin{tikztimingtable}${M.topts.length ? `[${M.topts.join(', ')}]` : ''}\n${lines.join('\n')}${lines.length ? '\n' : ''}\\end{tikztimingtable}`;
}

// ---------------------------------------------------------------- the document's definitions
// The preamble the table came with (an import keeps it) and the file's macros: what \tikzset says under timing/ and
// the macros. A redefined timing/.style or timing/table/.style replaces the package's (geometry() runs it where the
// package would); every other timing/ key is set before the table, as its options are.
function preambleOf(pre: any, fileMacros: any) {
  const s = stripComments(String(pre || '')), out: any = { timing: null, table: null, opts: [] as any[], macros: {} as Record<string, any> };
  for (const m of s.matchAll(/\\tikzset\s*\{/g)) {
    const e = close(s, m.index! + m[0].length - 1);
    if (e < 0) continue;
    for (const it of opts(s.slice(m.index! + m[0].length, e))) {
      const { k, v } = kv(it);
      if (!/^timing\//.test(k)) continue;
      const body = String(v ?? '').replace(/^\{([\s\S]*)\}$/, '$1');
      if (k === 'timing/.style') out.timing = body;
      else if (k === 'timing/table/.style') out.table = body;
      else out.opts.push(it);
    }
  }
  // macros: TeX's own expansion; one with an optional or delimited argument isn't read here (it is left as written)
  for (const t of [pre, fileMacros]) {
    const P = parseMacros(String(t || '')), odd = new Set(P.problems.map((q) => q.name));
    for (const [name, body] of Object.entries(P.macros)) if (/^\\[A-Za-z]+$/.test(name) && !odd.has(name)) out.macros[name] = body;
  }
  return out;
}
// the commands tikztimingtable and each row define for themselves: a document's macro of that name isn't used there
const PKG_MACROS = ['extracode', 'endextracode', 'tablegrid', 'fulltablegrid', 'horlines', 'vertlines', 'marknodes', 'background', 'endbackground', 'tablerules',
  'tableheader', 'rowdist', 'coldist', 'nrows', 'twidth', 'wscale', 'xunit', 'yunit', 'slope', 'lslope', 'zslope', 'dslope'].map((n) => '\\' + n);
// the macros in t expanded as TeX expands them: a control word takes its arguments (a group or one token) and the
// spaces after a control word are skipped
function expandMacros(t: any, macros: any) {
  // (a \foreach variable, a count or a name the table defines again is its own there)
  const own = new Set([...PKG_MACROS, ...[...String(t).matchAll(/\\foreach\s*(?:\[[^\]]*\]\s*)?(\\[A-Za-z]+)|count\s*=\s*(\\[A-Za-z]+)|\\(?:[gex]?def|let|pgfmathsetmacro\s*\{|newcommand\s*\{?|renewcommand\s*\{?)\s*(\\[A-Za-z]+)/g)].map((m) => m[1] || m[2] || m[3])]);
  const names = Object.keys(macros).filter((n) => !own.has(n));
  if (!names.length) return t;
  const re = new RegExp(`\\\\(${names.map((n) => n.slice(1)).join('|')})(?![A-Za-z])`);
  let s = String(t);
  for (let pass = 0; pass < 200; pass++) {
    const m = re.exec(s);
    if (!m) break;
    let body = String(macros['\\' + m[1]]);
    // (an argument the body doesn't use is named in a first comment line: it is still read)
    let n = 0;
    for (const q of body.matchAll(/#([1-9])/g)) n = Math.max(n, +q[1]);
    body = body.replace(/^%[^\n]*\n/, '');
    let i = m.index + m[0].length;
    const args: string[] = [];
    if (!n) i = skip(s, i);
    for (let k = 0; k < n; k++) {
      i = skip(s, i);
      if (s[i] === '{') { const e = close(s, i); if (e < 0) return s; args.push(s.slice(i + 1, e)); i = e + 1; }
      else { const c = /^\\(?:[A-Za-z]+|.)|^[\s\S]/.exec(s.slice(i)); if (!c) return s; args.push(c[0]); i += c[0].length; }
    }
    s = s.slice(0, m.index) + body.replace(/#([1-9])/g, (_, k) => args[+k - 1] ?? '') + s.slice(i);
  }
  return s;
}

// ---------------------------------------------------------------- settings
// the slopes, and the row and label distances in the stock units (a length with a unit as so many of them)
function config(M: any, before: any = []) {
  const c = { ...DEF };
  for (const o of [...before, ...M.topts]) {
    const { k, v } = kv(o), n = parseFloat(v!);
    if (!isFinite(n)) continue;
    if (k === 'timing/slope') { c.lslope = n; c.dslope = 2 * n; c.zslope = n / 2; }
    else if (k === 'timing/lslope') c.lslope = n;
    else if (k === 'timing/dslope') c.dslope = n;
    else if (k === 'timing/zslope') c.zslope = n;
    else if (k === 'timing/rowdist' || k === 'timing/coldist') { const d = dimOf(v, SF10); if (d) c[k === 'timing/rowdist' ? 'rowdist' : 'coldist'] = d.pt != null ? d.pt / (U * K) : d.n; }
  }
  return c;
}
// The table's geometry, as tikz-timing sets it up (pt): \tikzpicture[timing/table, options] puts the picture's unit
// vectors X, Y at 1.6ex of the table's \sffamily, and each row is a scope [timing, row options] whose own vectors RX, RY
// are timing/xunit and yunit (1.6ex again, in the font the table's font= makes) or the x and y of a timing/.style given
// in the options. Rows are rowdist apart and names end coldist left of them (numbers: so many Y or X; lengths: as
// written); scale, xscale and yscale scale every coordinate but not line widths or text; wscale stretches every
// character. A preamble's timing/.style or timing/table/.style (pre) takes the package's place: without its
// timing/adjust@xy the table's \sffamily is never switched on, so ex and em are the document's (cmr). plain: the stock
// geometry (the visual editor draws every table that way).
function geometry(M: any, plain: any, warn: any, pre: any = { timing: null, table: null, opts: [] }) {
  const u0 = 1.6 * exOf(SF10);
  const g: any = { sx: 1, sy: 1, X: u0, Y: u0, RX: u0, RY: u0, ws: 1, plw: LW * K, rlw: LW * K, act: SF10, tf: '', label: SF10, dfont: { ...SF10, size: 6 }, ndx: 0, ndy: 0, grid: false };
  let rd: any = { n: DEF.rowdist }, cd: any = { n: DEF.coldist };
  if (!plain) {
    let act = RM10, tf = '', xu = '1.6ex', yu = '1.6ex', st: any = null, lw: any = null, nameF = '', X = u0, Y = u0, nsep = false;
    const adjust = () => { act = fontWith(act, tf); X = lenPt(xu, act) ?? X; Y = lenPt(yu, act) ?? Y; };
    // a style's x, y and line width, its lengths in the font then in force (line cap and join are the package's own)
    const styleKeys = (body: any, where: any) => {
      const q: any = {};
      for (const it of opts(body)) {
        const { k, v } = kv(it), d = dimOf(v, act);
        if ((k === 'x' || k === 'y') && d?.pt != null) q[k] = d.pt;
        else if (k === 'line width' && lenPt(v, act) != null) q.lw = lenPt(v, act);
        else if (LWS[k] != null) q.lw = LWS[k];
        else if (!/^(line cap|line join|\/tikz)$/.test(k)) warn(`"${it}" in ${where} isn't drawn here (it is kept in the code)`);
      }
      return q;
    };
    // timing: the package's style sets the units in the font the picture's font= makes; a preamble's sets its own
    const timing = () => {
      if (pre.timing == null) { adjust(); return; }
      const q = styleKeys(pre.timing, 'the preamble\'s timing/.style');
      if (q.x != null) X = q.x;
      if (q.y != null) Y = q.y;
      if (q.lw != null) lw = q.lw;
    };
    // \tikzpicture[timing/table, options]: timing/table is font=\sffamily, timing, line width=0.15ex
    if (pre.table == null) { tf = '\\sffamily'; timing(); lw = 0.15 * exOf(act); }
    else for (const it of opts(pre.table)) {
      const { k, v } = kv(it);
      if (k === 'timing') timing();
      else if (k === 'font') tf = v || '';
      else if (k === 'line width' && lenPt(v, act) != null) lw = lenPt(v, act);
      else if (LWS[k] != null) lw = LWS[k];
      else warn(`"${it}" in the preamble's timing/table/.style isn't drawn here (it is kept in the code)`);
    }
    const before = new Set(pre.opts);
    const nameStyle = (v: any, add: any) => {
      // a name style of its own replaces the package's inner sep=0pt and outer sep=0pt: TikZ's .3333em and half the line
      if (!add) { nameF = ''; g.ndx = 0; g.ndy = 0; g.nbox = null; g.npos = 'l'; nsep = true; }
      for (const it of opts(String(v || '').replace(/^\{([\s\S]*)\}$/, '$1'))) {
        const { k, v: w } = kv(it);
        if (k === 'font') nameF = w || '';
        else if ((k === 'yshift' || k === 'xshift') && lenPt(w, act) != null) g[k === 'yshift' ? 'ndy' : 'ndx'] = lenPt(w, act);
        // text width: the name in a box that wide, at its left (align=right, center: at its right, centred)
        else if (k === 'text width' && dimOf(w, act)?.pt != null) g.nbox = dimOf(w, act)!.pt;
        else if (k === 'align' && /^(left|right|center|flush left|flush right|flush center)$/.test(w || '')) g.npos = /right/.test(w!) ? 'r' : /center/.test(w!) ? 'c' : 'l';
        else return false;
      }
      return true;
    };
    for (const o of [...pre.opts, ...M.topts]) {
      const { k, v } = kv(o), n = parseFloat(v!);
      let ok = true;
      if (/^timing\/(slope|lslope|dslope|zslope)$/.test(k)) { /* config() */ }
      else if (k === 'scale' && isFinite(n)) { g.sx *= n; g.sy *= n; }
      else if (k === 'xscale' && isFinite(n)) g.sx *= n;
      else if (k === 'yscale' && isFinite(n)) g.sy *= n;
      else if ((k === 'x' || k === 'y') && dimOf(v, act)?.pt != null) { if (k === 'x') X = dimOf(v, act)!.pt; else Y = dimOf(v, act)!.pt; }
      else if (/^timing\/(xunit|yunit|unit)$/.test(k) && lenPt(v, act) != null) { if (k !== 'timing/yunit') xu = v!; if (k !== 'timing/xunit') yu = v!; adjust(); }
      else if (k === 'timing/font') { tf = v || ''; adjust(); }
      else if (k === 'font') tf = v || '';
      else if (k === 'timing/wscale' && isFinite(evalNum(v))) g.ws = evalNum(v);
      else if ((k === 'timing/rowdist' || k === 'timing/coldist') && dimOf(v, act)) { if (k === 'timing/rowdist') rd = dimOf(v, act); else cd = dimOf(v, act); }
      else if (LWS[k] != null) lw = LWS[k];
      else if (k === 'line width' && lenPt(v, act) != null) lw = lenPt(v, act);
      else if (k === 'timing/draw grid') g.grid = true;
      else if (k === 'timing/name/.style' || k === 'timing/name/.append style') ok = nameStyle(v, k !== 'timing/name/.style');
      else if (k === 'timing/.style') {
        // the rows' own style, replacing tikz-timing's: its x and y (in the picture's font), its line width
        st = {};
        for (const it of opts(String(v || '').replace(/^\{([\s\S]*)\}$/, '$1'))) {
          const q = kv(it), d = dimOf(q.v, act);
          if ((q.k === 'x' || q.k === 'y') && d?.pt != null) st[q.k] = d.pt;
          else if (q.k === 'line width' && lenPt(q.v, act) != null) st.lw = lenPt(q.v, act);
          else if (LWS[q.k] != null) st.lw = LWS[q.k];
          else ok = false;
        }
      } else ok = false;
      if (!ok) warn(before.has(o) ? `The preamble's "\\tikzset{${o}}" isn't drawn here (it is kept in the code)` : `The table option "${o}" isn't drawn here (it is kept in the code)`);
    }
    // a row: tikz-timing's style runs the font and takes x and y from the units; a style of its own keeps the font
    if (!st && pre.timing != null) st = styleKeys(pre.timing, 'the preamble\'s timing/.style');
    const rowF = st ? act : fontWith(act, tf);
    Object.assign(g, { X, Y, act, tf, RX: st ? st.x ?? X : lenPt(xu, rowF), RY: st ? st.y ?? Y : lenPt(yu, rowF) });
    g.plw = g.rlw = lw;
    if (st && st.lw != null) g.rlw = st.lw;
    g.label = fontWith(fontWith(act, tf), nameF);
    g.nsep = nsep ? 0.3333 * act.size + 0.5 * g.plw : 0;
    // data text: timing/d/text is [timing, scale=0.6, font=\sffamily], at the row's size
    g.dfont = { size: 0.6 * rowF.size, fam: 'cmss', bf: rowF.bf };
  }
  g.rd = rd.pt ?? rd.n * g.Y;
  g.cd = cd.pt ?? cd.n * g.X;
  return g;
}
const LWS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
Object.setPrototypeOf(LWS, null);
// a foreach list: 1,2,4 or 0,1,...,10 (with \twidth and \nrows)
// pgffor's a,b,...,end steps by b - a (a,...,end by 1, or -1 counting down) and stops before passing end: end is a
// value only when a step lands on it; the values are TikZ's coordinates, so 8-1 is 7
function list(s: any, vars: any) {
  const items = String(s || '').replace(/\\twidth\b/g, vars.twidth).replace(/\\nrows\b/g, vars.nrows).split(',').map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] === '...' && i >= 1 && i + 1 < items.length) {
      const a = parseFloat(items[i - 1]), b = i >= 2 ? parseFloat(items[i - 2]) : NaN, end = parseFloat(items[i + 1]);
      const step = isFinite(b) ? a - b : end >= a ? 1 : -1, eps = 1e-9 * Math.max(1, Math.abs(end));
      if (step && isFinite(a) && isFinite(end)) for (let k = 1, v = a + step; (step > 0 ? v <= end + eps : v >= end - eps) && out.length < 500; k++, v = a + k * step) out.push(Math.abs(v - end) <= eps ? end : v);
      i++; // end, reached or not
      continue;
    }
    const v = evalNum(items[i]);
    if (isFinite(v)) out.push(v);
  }
  return out;
}
// TikZ line options → { color, width, dash }
// (the scopes' options come first: later options win, as in TikZ; xshift and yshift are summed, pt)
function lineStyle(o: any, ink: any, w0 = LW) {
  const r = { color: ink, width: w0, dash: '', opacity: 1, cap: '', dx: 0, dy: 0 };
  for (const it of (Array.isArray(o) ? o : opts(o))) {
    const { k, v } = kv(it);
    if (k === 'help lines') { r.color = INK.help; r.width = 0.2 * PT; continue; }
    if (LWS[k]) { r.width = LWS[k] * PT; continue; }
    if (k === 'line width' && v) { const l = lenPt(v, SF10); if (l != null) r.width = l * PT; continue; }
    if (/^(loosely |densely )?(dashed|dotted|dash dot)$/.test(k)) { r.dash = k; continue; }
    if (k === 'solid') { r.dash = ''; continue; }
    if (k === 'semitransparent') { r.opacity = 0.5; continue; }
    if ((k === 'opacity' || k === 'draw opacity') && isFinite(parseFloat(v!))) { r.opacity = parseFloat(v!); continue; }
    if (k === 'line cap' && v) { r.cap = v; continue; }
    if ((k === 'xshift' || k === 'yshift') && lenPt(v, SF10) != null) { r[k === 'xshift' ? 'dx' : 'dy'] += lenPt(v, SF10)!; continue; }
    const col = (k === 'draw' || k === 'color') && v != null ? v : v == null ? k : null;
    if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
  }
  return r;
}
// arrow tips from an option like <->, |<->|, ->
function tipsOf(o: any) {
  for (const it of o) {
    const t = it.trim();
    if (/^[<>|]*-[<>|]*$/.test(t) && t !== '-') {
      const [a, b] = t.split('-');
      return { a, b };
    }
  }
  return { a: '', b: '' };
}

// ---------------------------------------------------------------- layout
const preOf = (s: any) => (s.plain ? '' : String(s.tex?.preamble || '')), macOf = (s: any) => (s.plain ? '' : (TD.docMacros ? TD.docMacros() : ''));
const layout = layoutCache((s: any) => srcKey(s, s.plain ? 1 : 0, preOf(s), macOf(s)), (s: any) => {
  const pre = preOf(s), mac = macOf(s);
  return build(s.src, s.plain, pre || mac ? preambleOf(pre, mac) : null);
});

const LEVEL: Record<string, any> = { L: 0, H: 1, Z: 0.5, X: 0.5, M: 0.5 };
// a background style → { color } or { pattern, color } (null: none, as for draw=none)
function bgOf(st: any) {
  if (!st) return null;
  let color = null, pattern = null;
  for (const it of opts(st)) {
    const { k, v } = kv(it);
    if (k === 'pattern' && v) pattern = v.trim();
    else if ((k === 'pattern color' || k === 'fill') && v && TD.tikzColor) color = TD.tikzColor(v.trim().replace(/^\{([^{}]*)\}$/, '$1')) || color; // {rgb,255:red,…} comes braced
  }
  if (pattern) return { pattern, color }; // no pattern color: black, as in TikZ
  return color ? { color } : null;
}
const BAND = (c: any) => c === 'D' || c === 'U';
const MID = (c: any) => c === 'Z' || c === 'X' || c === 'M';

// One row's drawing, in table units (x along, y up from the row's base line).
// Returns { lines: [{ color, pts }], fills: [{ color, pts }], texts: [{ t, x, y }], spans: [{ i, a, b }], end }
function drawRow(row: any, cfg: any) {
  const lines: any[] = [], fills: any[] = [], texts: any[] = [], spans: any[] = [];
  const pen = (color: any, pts: any) => {
    const p0 = pts[0];
    for (let k = lines.length - 1; k >= Math.max(0, lines.length - 4); k--) {
      const l = lines[k], q = l.pts[l.pts.length - 1];
      if (l.color === color && Math.abs(q[0] - p0[0]) < 1e-9 && Math.abs(q[1] - p0[1]) < 1e-9) { l.pts.push(...pts.slice(1)); return; }
    }
    lines.push({ color, pts: pts.slice() });
  };
  const color = (c: any) => INK[c] && c !== 'U' ? INK[c] : null; // null: the block's ink
  // an initial [C] or [T] is the last character before the row: the first C or T toggles from it, rising at the start
  let x = 0, prev = row.init && 'HLZXDUM'.includes(row.init) ? row.init : row.init === 'C' || row.init === 'T' ? 'L' : null, band: any = null;
  const ds = cfg.dslope, ws = cfg.ws || 1;
  // a data band runs from its opening to where the next character closes it
  const openBand = (seg: any, apex: any, full: any) => { band = { seg, apex, full, top: [], bot: [] }; if (apex != null) { band.top.push([apex, 0.5]); band.bot.push([apex, 0.5]); } band.top.push([full, 1]); band.bot.push([full, 0]); };
  const closeBand = (at: any, apex: any) => {
    if (!band) return;
    band.top.push([at, 1]); band.bot.push([at, 0]);
    if (apex != null) { band.top.push([apex, 0.5]); band.bot.push([apex, 0.5]); }
    // the background: its own (a colour, or a pattern), else grey for unknown data
    const bg = bgOf(band.seg.bg), pts = band.top.concat(band.bot.slice().reverse());
    if (bg) fills.push({ ...bg, pts });
    else if (band.seg.c === 'U') fills.push({ color: INK.U, pts });
    pen(null, band.top); pen(null, band.bot);
    if (band.seg.t) texts.push({ t: band.seg.t, x: (band.full + at) / 2, y: 0.5 });
    band = null;
  };
  row.segs.forEach((seg: any, i: any) => {
    let c = seg.c;
    const a = x, b = x + seg.w * ws; // timing/wscale stretches every width
    x = b;
    spans.push({ i, a, b, c });
    if (c === 'S') { closeBand(a, null); return; }
    if (c === 'G') { closeBand(a, null); pen(null, [[a, 0], [a, 1]]); return; }
    const slope = c === 'C' ? 0 : cfg.lslope;
    if (c === 'C' || c === 'T') c = prev === 'L' ? 'H' : prev === 'H' ? 'L' : prev == null ? 'L' : 'H';
    spans[spans.length - 1].c = c;
    const p = prev;
    prev = c;
    if (BAND(c)) {
      // the same value goes on, unless it is written with braces (a new value) or the kind changes
      if (band && p === c && seg.t == null) return;
      if (band) { closeBand(a, a + ds / 2); openBand(seg, a + ds / 2, a + ds); return; }
      if (p === 'L' || p === 'H') { pen(null, [[a, LEVEL[p]], [a + ds / 2, 0.5]]); openBand(seg, a + ds / 2, a + ds); return; }
      if (p && MID(p)) { openBand(seg, a, a + ds / 2); return; }
      openBand(seg, null, a);
      return;
    }
    // a line: where it starts and how it gets there
    const lv = LEVEL[c], ink = color(c);
    let from = a;
    if (band) { from = a + ds / 2; closeBand(a, from); if (MID(c)) { /* the line starts at the apex */ } else { pen(ink, [[from, 0.5], [a + ds, lv]]); from = a + ds; } }
    else if (p === 'L' || p === 'H') {
      if (MID(c)) { const s2 = c === 'M' ? 1 / 8 : cfg.zslope; pen(ink, [[a, LEVEL[p]], [a + s2, 0.5]]); from = a + s2; }
      else if (p !== c) { pen(ink, [[a, LEVEL[p]], [a + slope, lv]]); from = a + slope; }
    } else if (p && MID(p) && !MID(c)) { pen(ink, [[a, 0.5], [a + cfg.zslope, lv]]); from = a + cfg.zslope; }
    if (b <= from) return;
    if (c === 'M') {
      // zigzag: segment length .25, amplitude .225
      const pts = [[from, 0.5]], seg_ = 0.25;
      let k = 0;
      for (let q = from + seg_ / 4; q < b - 1e-9; q += seg_ / 4) { k++; pts.push([q, 0.5 + [0.225, 0, -0.225, 0][(k - 1) % 4]]); }
      pts.push([b, 0.5]);
      pen(ink, pts);
    } else pen(ink, [[from, lv], [b, lv]]);
  });
  if (band) closeBand(x, null);
  return { lines, fills, texts, spans, end: x };
}

// a row name, or a node's text, as LaTeX sets it: leading size, family and series switches, \color and the
// \textnormal-like wrappers set its font (f) and colour; \makebox[w][pos]{…} gives it a box w wide (box, pos) and
// \raisebox{d}{…} lifts it (raise, pt); \, is a thin space
function textOf(src: any, f: any) {
  let t = String(src || '').trim(), color = null, box = null as any, pos = 'c', raise = 0;
  for (let n = 0; n < 20; n++) {
    let m;
    if (t[0] === '{' && close(t, 0) === t.length - 1) { t = t.slice(1, -1).trim(); continue; }
    if ((m = /^\\raisebox\s*\{([^{}]*)\}\s*\{/.exec(t)) && close(t, m[0].length - 1) === t.length - 1 && lenPt(m[1], f) != null) { raise += lenPt(m[1], f)!; t = t.slice(m[0].length, -1).trim(); continue; }
    if ((m = /^\\makebox\s*\[([^\]]*)\]\s*(?:\[([clr])\]\s*)?\{/.exec(t)) && close(t, m[0].length - 1) === t.length - 1 && dimOf(m[1], f)?.pt != null) { box = dimOf(m[1], f)!.pt; pos = m[2] || 'c'; t = t.slice(m[0].length, -1).trim(); continue; }
    if ((m = /^\\(textnormal|textrm|textsf|texttt|textbf)\s*\{/.exec(t)) && close(t, m[0].length - 1) === t.length - 1) { f = fontWith(f, '\\' + m[1]); t = t.slice(m[0].length, -1).trim(); continue; }
    if ((m = /^\\color\s*\{([^{}]*)\}\s*/.exec(t))) { color = (TD.tikzColor && TD.tikzColor(m[1])) || color; t = t.slice(m[0].length); continue; }
    if ((m = /^\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(t)) && (SIZES[m[1]] || FAMS[m[1]] || /^(bfseries|bf|mdseries)$/.test(m[1])) && !/^text/.test(m[1])) { f = fontWith(f, m[0]); t = t.slice(m[0].length); continue; }
    break;
  }
  return { t: shown(t.replace(/\\,/g, ' ').trim()), f, color, box, pos, raise };
}
// how far above its baseline a text is drawn (px): the measured box's middle, against pdflatex at 10pt
const baseLift = (b: any, f: any) => 0.3 * b.h - 0.32 * f.size;
// a node's anchor, from its centre (pt, y up): hw, hh its half sizes, sh the baseline's height under the centre
function anchorOff(a: any, hw: any, hh: any, sh: any, ex: any) {
  const x = /east|end/.test(a) ? hw : /west|start/.test(a) ? -hw : 0;
  const y = /^(north|high)/.test(a) ? hh : /^(south|low)/.test(a) ? -hh : /^base/.test(a) ? -sh : /^mid/.test(a) && a !== 'mid' ? -sh + ex / 2 : a === 'mid' ? -sh + ex / 2 : 0;
  return [x, y];
}
const PLACE: Record<string, string> = { above: 'south', below: 'north', left: 'east', right: 'west', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
Object.setPrototypeOf(PLACE, null);
// a foreach list's values: 1,2,4 or 0,1,...,10 (with \twidth and \nrows); words are kept as they are
function eachList(s: any, vars: any) {
  const raw = String(s || '').replace(/\\twidth\b/g, vars.twidth).replace(/\\nrows\b/g, vars.nrows).split(',').map((x) => x.trim()).filter(Boolean);
  // (a range of letters, a..e, is pgffor's too: not read here)
  const k = raw.indexOf('...');
  if (k >= 0) return [raw[k - 1], raw[k - 2], raw[k + 1]].every((v) => v == null || isFinite(parseFloat(v))) ? list(raw.join(','), vars).map(num) : null;
  return raw;
}

function build(src: any, plain?: any, pre?: any) {
  // the document's macros are expanded first, as TeX reads the table
  const M = parse(pre ? expandMacros(src, pre.macros) : src);
  const cfg = config(M, pre ? pre.opts : []), warnings = M.warnings.slice();
  const warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
  const G = geometry(M, plain, warn, pre || undefined), rc = { ...cfg, ws: G.ws };
  const rows: any[] = [], texts: any[] = [], extra: any[] = [];
  // px from the picture's pt (y up): the transformation scales the coordinates
  const toPx = (x: any, y: any) => [G.sx * x * PT, -G.sy * y * PT];
  const rowPt = (oy: any, u: any, v: any) => [u * G.RX, oy + v * G.RY];
  let maxW = 0, x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
  // TeX's bounding box (px): rows count as their boxes, names as their struts (\tablerules reads it)
  const tb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const tex = (a: any, b: any, c: any, d: any) => { tb.x1 = Math.min(tb.x1, a, c); tb.y1 = Math.min(tb.y1, b, d); tb.x2 = Math.max(tb.x2, a, c); tb.y2 = Math.max(tb.y2, b, d); ext(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)); };
  // a text anchored at (px, py): base east or base west, with a strut
  const strutText = (raw: any, f0: any, px: any, py: any, side: any, color?: any, nbox?: any) => {
    const T = textOf(raw, f0), f = T.f, sty = styleOf(f), s = strutOf(f);
    if (T.box == null && nbox && nbox.w != null) { T.box = nbox.w; T.pos = nbox.pos; }
    const sep = (nbox && nbox.sep || 0) * PT; // inner and outer sep (pt → px)
    px += side * sep;
    const b = T.t ? TD.textBox(T.t, sty) : { w: 2, h: 0 }, tw = b.w - 2, w = T.box != null ? T.box * PT : tw;
    if (nbox && nbox.w != null && tw > w + 0.5) warn('A name wider than its text width is broken into lines by LaTeX: it is drawn on one line here');
    // the text in its box: centred, or at its left or right
    const at = T.pos === 'l' ? tw / 2 : T.pos === 'r' ? w - tw / 2 : w / 2, from = side < 0 ? px - w : px;
    const txt = T.t ? { t: T.t, st: sty, x: from + at, y: py - T.raise * PT - baseLift(b, f), b, color: T.color || color } : null;
    if (txt) texts.push(txt);
    tex(px - side * sep, py - s.h * PT - sep, px + side * (w + sep), py + s.d * PT + sep);
    return { w: w + 2 * sep, txt };
  };
  let labW = 0;
  M.rows.forEach((row, r) => {
    const oy = -r * G.rd, R = drawRow(row, rc);
    maxW = Math.max(maxW, R.end);
    const [lx, ly] = toPx(-G.cd + G.ndx, oy + G.ndy);
    const lab = strutText(row.name, G.label, lx, ly, -1, null, { w: G.nbox, pos: G.npos, sep: G.nsep });
    labW = Math.max(labW, lab.w);
    if (lab.txt) (lab.txt as any).row = r;
    for (const t of R.texts) {
      const tt = shown(t.t), st = styleOf(G.dfont), b = TD.textBox(tt, st), [X, Y] = toPx(...(rowPt(oy, t.x, t.y) as [any, any]));
      texts.push({ t: tt, st, x: X, y: Y, b });
    }
    // the row's own options: a colour and a line width are drawn; the rest is kept in the code
    let ink = null, lw = G.rlw * PT;
    if (row.ropts) {
      const known = opts(row.ropts).filter((it) => { const { k, v } = kv(it); return LWS[k] != null || (k === 'line width' && lenPt(v, SF10) != null) || (v == null && TD.tikzColor && TD.tikzColor(k)); });
      const st = lineStyle(known, null, lw);
      ink = st.color; lw = st.width;
      if (known.length < opts(row.ropts).length) warn(`The row option "${row.ropts}" isn't drawn here (it is kept in the code)`);
    }
    const [a, b] = toPx(0, oy), [c, d] = toPx(R.end * G.RX, oy + G.RY);
    tex(a, b, c, d);
    for (const l of R.lines) for (const p of l.pts) { const [X, Y] = toPx(...(rowPt(oy, p[0], p[1]) as [any, any])); ext(X - lw / 2, Y - lw / 2, X + lw / 2, Y + lw / 2); }
    rows.push({ r, oy, R, row, ink, lw });
  });
  // the extra code
  const n = M.rows.length, lastOy = -(Math.max(1, n) - 1) * G.rd, vars = { twidth: num(maxW), nrows: String(n) };
  const W = maxW * G.RX; // the right of all rows (pt)
  const subVars = (t: any) => String(t).replace(/\\twidth(?![A-Za-z])/g, vars.twidth).replace(/\\nrows(?![A-Za-z])/g, vars.nrows);
  let head = false;
  // a scope's shift (pt): shift={(x,y)} in the picture's units or lengths, xshift, yshift
  const shiftOf = (sc: any) => {
    let dx = 0, dy = 0;
    for (const it of sc.flatMap((o: any) => opts(o))) {
      const { k, v } = kv(it);
      if (k === 'shift' && v) { const m = /^\{?\s*\(([^()]*)\)\s*\}?$/.exec(v); const p = m && split(m[1], ','); if (p && p.length === 2) { const a = dimOf(p[0], G.act), b = dimOf(p[1], G.act); if (a && b) { dx += a.pt ?? a.n * G.X; dy += b.pt ?? b.n * G.Y; } } }
      else if ((k === 'xshift' || k === 'yshift') && lenPt(v, G.act) != null) { if (k === 'xshift') dx += lenPt(v, G.act)!; else dy += lenPt(v, G.act)!; }
    }
    return [dx, dy];
  };
  const item = (x: any, xi: any) => {
    const sc = x.sc || [], [sx0, sy0] = shiftOf(sc);
    const style = (o: any, w0: any, pre: any = []) => { const st = lineStyle([...pre, ...sc.flatMap((q: any) => opts(q)), ...opts(o)], null, w0); return st; };
    const P = (x_: any, y_: any, st: any) => toPx(x_ + sx0 + st.dx, y_ + sy0 + st.dy);
    if (x.k === 'vert') {
      const st = style(x.o, G.plw * PT);
      for (const [j, v] of list(x.list || `0,1,...,${num(maxW)}`, vars).entries()) {
        const [X, Y1] = P(v * G.X, 1.5 * G.Y, st), [, Y2] = P(v * G.X, lastOy - 0.5 * G.Y, st);
        extra.push({ k: 'line', xi, j, d: `M${r2(X)},${r2(Y1)}V${r2(Y2)}`, st, x: v, back: x.back });
        ext(X - st.width / 2, Math.min(Y1, Y2) - st.width / 2, X + st.width / 2, Math.max(Y1, Y2) + st.width / 2);
      }
    } else if (x.k === 'hor') {
      const st = style(x.o, G.plw * PT);
      for (const [j, v] of list(x.list || `1,2,...,${n}`, vars).entries()) {
        const [Xa, Y] = P(0, G.rd - v * G.rd, st), [Xb] = P(W, G.rd - v * G.rd, st);
        extra.push({ k: 'line', xi, j, d: `M${r2(Xa)},${r2(Y)}H${r2(Xb)}`, st, back: x.back });
        ext(Math.min(Xa, Xb) - st.width / 2, Y - st.width / 2, Math.max(Xa, Xb) + st.width / 2, Y + st.width / 2);
      }
    } else if (x.k === 'grid' || x.k === 'fullgrid') {
      // timing/table/grid is [timing, help lines]: the rows' units, steps of half a unit (step, xstep, ystep set them)
      const st = style(x.o, G.plw * PT, ['help lines']);
      let xs = 0.5, ys = 0.5;
      for (const it of opts(x.o)) { const { k, v } = kv(it), q = parseFloat(v!); if (!(q > 0)) continue; if (k === 'step' || k === 'xstep') xs = q; if (k === 'step' || k === 'ystep') ys = q; }
      let d = '';
      const grid = (oy: any, xb: any, yb: any) => {
        for (let q = 0; q <= xb + 1e-9; q += xs) { const [X, Ya] = P(q * G.RX, oy, st), [, Yb] = P(q * G.RX, oy + yb * G.RY, st); d += `M${r2(X)},${r2(Ya)}V${r2(Yb)}`; }
        for (let q = 0; q <= yb + 1e-9; q += ys) { const [Xa, Y] = P(0, oy + q * G.RY, st), [Xb] = P(xb * G.RX, oy + q * G.RY, st); d += `M${r2(Xa)},${r2(Y)}H${r2(Xb)}`; }
      };
      if (x.k === 'fullgrid') grid(lastOy, maxW, (G.RY - lastOy) / G.RY);
      else for (const { oy, R } of rows) grid(oy, x.star ? R.end : maxW, 1);
      extra.push({ k: 'grid', xi, d, st, back: true });
      for (const m of d.matchAll(/M(-?[\d.]+),(-?[\d.]+)([VH])(-?[\d.]+)/g)) { const a = +m[1], b = +m[2], c = +m[4], h = st.width / 2; if (m[3] === 'V') ext(a - h, Math.min(b, c) - h, a + h, Math.max(b, c) + h); else ext(Math.min(a, c) - h, b - h, Math.max(a, c) + h, b + h); }
    } else if (x.k === 'brk') {
      extra.push({ k: 'brk', xi, t: x.t, ys: x.ys });
      for (const y of x.ys) { const [Xa, Ya] = toPx((x.t - 0.2) * G.X, (y + 1.2) * G.Y), [Xb, Yb] = toPx((x.t + 0.2) * G.X, (y - 0.2) * G.Y); ext(Xa, Ya, Xb, Yb); }
    } else if (x.k === 'annot') {
      const st = style(x.o, G.plw * PT), tips = tipsOf(x.o);
      const [Xa, Ya] = P(x.x1 * G.X, x.y1 * G.Y, st), [Xb, Yb] = P(x.x2 * G.X, x.y2 * G.Y, st);
      const a: Record<string, any> = { k: 'annot', xi, st, tips, Xa, Ya, Xb, Yb, back: x.back };
      extra.push(a);
      ext(Math.min(Xa, Xb) - st.width / 2, Math.min(Ya, Yb) - st.width / 2, Math.max(Xa, Xb) + st.width / 2, Math.max(Ya, Yb) + st.width / 2);
      if (x.t) {
        let size = 10;
        for (const it of x.lo) { const m = /^font\s*=\s*\{?\s*\\(\w+)/.exec(it); if (m && SIZES[m[1]]) size = SIZES[m[1]]; }
        let tx = x.t.trim();
        { const m = /^\\(\w+)\s*([\s\S]*)$/.exec(tx); if (m && SIZES[m[1]]) { size = SIZES[m[1]]; tx = m[2]; } }
        const t = shown(tx), sty = { size: size * PT, font: 'cmss' }, b = TD.textBox(t, sty);
        const dir = (x.lo.find((it: any) => /^(above|below|left|right)( (left|right))?$/.test(it.trim())) || '').trim();
        const ux = /right/.test(dir) ? 1 : /left/.test(dir) ? -1 : 0, uy = /above/.test(dir) ? -1 : /below/.test(dir) ? 1 : 0;
        const inner = 0.3333 * size * PT, mx = (Xa + Xb) / 2, my = (Ya + Yb) / 2;
        const X = mx + ux * (inner + (b.w - 2) / 2), Y = my + uy * (inner + 0.4 * b.h);
        a.label = { t, st: sty, x: X, y: Y, b };
        ext(X - b.w / 2, Y - b.h / 2, X + b.w / 2, Y + b.h / 2);
      }
    } else if (x.k === 'node') return node(x, sc, sx0, sy0);
    else if (x.k === 'rules') {
      // \tablerules: rules \tabcolsep (6pt) beyond the bounding box so far, under the last row and over the first
      // (and under a header), 0.08em thick, 0.05em under a header
      const st = style(x.o, 0.8 * PT), xa = tb.x1 - 6 * G.sx * PT, xb = tb.x2 + 6 * G.sx * PT, mid = lineStyle(['line width=0.5pt'], st.color, st.width);
      const ys = [[toPx(0, lastOy - 0.5 * G.rd)[1], st.width]];
      if (head) ys.push([toPx(0, 2.5 * G.rd)[1], st.width]);
      ys.push([toPx(0, G.rd)[1], head ? mid.width : st.width]);
      for (const [Y, w] of ys) { extra.push({ k: 'line', xi, d: `M${r2(xa)},${r2(Y)}H${r2(xb)}`, st: { ...st, width: w, cap: 'butt' } }); tex(xa, Y - w / 2, xb, Y + w / 2); }
    } else if (x.k === 'header') {
      // \tableheader: the label header ends at the names' right, the row header starts at the rows' left, both on
      // a line 1.5 rowdist above the first row, in the names' style with a \strut
      const [hx, hy] = toPx(-G.cd + G.ndx, 1.5 * G.rd);
      strutText(x.L, G.label, hx, hy, -1, null, { w: G.nbox, pos: G.npos, sep: G.nsep });
      strutText(x.R, G.label, toPx(0, 0)[0], hy, 1, null, { w: G.nbox, pos: G.npos, sep: G.nsep });
      head = true;
    } else if (x.k === 'raw' && /\\(twidth|nrows)(?![A-Za-z])/.test(x.src)) {
      // \twidth and \nrows are known once the rows are read: the statement read again with them
      for (const it of readExtra(subVars(x.src), warn, { sc: [] })) if (it.k !== 'raw') { it.sc = x.sc || []; it.back = x.back; item(it, xi); }
    } else if (x.k === 'each') {
      // \foreach: the body once for each value, the variables put in as TeX expands them
      const vals = eachList(x.list, vars);
      if (!vals) { warn(`"${x.src.length > 40 ? x.src.slice(0, 40) + '…' : x.src}" isn't drawn here (it is kept in the code)`); return; }
      vals.forEach((v: any, q: any) => {
        let body = subVars(x.body).replace(new RegExp(`\\\\${x.v}(?![A-Za-z])`, 'g'), String(v));
        if (x.cnt) body = body.replace(new RegExp(`\\\\${x.cnt}(?![A-Za-z])`, 'g'), num(x.from + q));
        for (const it of readExtra(body, warn, { sc: x.ctx.sc.slice() })) item(it, xi);
      });
    }
  };
  // \node at (p) {text}: TikZ's node, its text in the picture's font (font= and size switches change it), inner sep
  // .3333em, outer sep half the line width; placed by its anchor (anchor=, above, below …); the text is not scaled
  const node = (x: any, sc: any, sx0: any, sy0: any) => {
    let f = fontWith(G.act, G.tf), anchor = 'center', color = null, opacity = 1, isx = null as any, isy = null as any, os = G.plw / 2, dx = 0, dy = 0, ok = true;
    for (const it of [...sc.flatMap((q: any) => opts(q)), ...x.o]) {
      const { k, v } = kv(it);
      if (k === 'font') f = fontWith(G.act, v || '');
      else if (k === 'anchor' && v) anchor = v;
      else if (PLACE[k]) { anchor = PLACE[k]; const d = v ? lenPt(v, f) : 0; if (d == null) ok = false; else { if (/above/.test(k)) dy += d; if (/below/.test(k)) dy -= d; if (/right/.test(k)) dx += d; if (/left/.test(k)) dx -= d; } }
      else if (/^inner (x|y)?sep$/.test(k) && lenPt(v, f) != null) { const l = lenPt(v, f); if (k !== 'inner ysep') isx = l; if (k !== 'inner xsep') isy = l; }
      else if (k === 'outer sep' && lenPt(v, f) != null) os = lenPt(v, f)!;
      else if ((k === 'xshift' || k === 'yshift') && lenPt(v, f) != null) { if (k === 'xshift') dx += lenPt(v, f)!; else dy += lenPt(v, f)!; }
      else if ((k === 'color' || k === 'text') && v && TD.tikzColor && TD.tikzColor(v)) color = TD.tikzColor(v);
      else if (v == null && TD.tikzColor && TD.tikzColor(k)) color = TD.tikzColor(k);
      else if (k === 'semitransparent') opacity = 0.5;
      else if ((k === 'opacity' || k === 'text opacity') && isFinite(parseFloat(v!))) opacity = parseFloat(v!);
      // the scope's shift (already in the point), lines' styles (no line is drawn), one line's alignment
      else if (k === 'shift' || k === 'align' || k === 'rectangle' || LWS[k] != null || k === 'line width' || k === 'help lines' || /^(solid|(loosely |densely )?(dashed|dotted))$/.test(k)) { /* nothing to draw */ }
      else ok = false;
    }
    // the point: picture units, or a row's or a name's anchor
    let p: any = null;
    const a = x.at;
    if (a.ref === 'row' && rows[a.n - 1]) {
      const { oy, R } = rows[a.n - 1], [ox, oy2] = anchorOff(a.a, R.end * G.RX / 2, G.RY / 2, G.RY / 2, 0);
      p = [R.end * G.RX / 2 + ox, oy + G.RY / 2 + oy2];
      if (!/^(center|mid|north|south|east|west|north east|north west|south east|south west|high start|high end|high mid|low start|low end|low mid|mid east|mid west|mid start|mid end|base|base east|base west)$/.test(a.a)) ok = false;
    } else if (a.ref == null) p = [a.x * G.X, a.y * G.Y];
    if (!p || !ok) { warn(`"${x.src.length > 40 ? x.src.slice(0, 40) + '…' : x.src}" isn't drawn here (it is kept in the code)`); return; }
    const T = textOf(x.t, f), em = T.f.size;
    // a command LaTeX's text knows but this drawing does not (a macro of the document, \scalebox …) keeps the node as code
    const unknown = [...T.t.replace(/\$[^$]*\$/g, '').matchAll(/\\([A-Za-z]+)/g)].map((q) => q[1]).find((c) => !(TD.prose && TD.prose.textOk(c)));
    if (unknown) { warn(`"${x.src.length > 40 ? x.src.slice(0, 40) + '…' : x.src}" isn't drawn here: \\${unknown} is kept in the code`); return; }
    const b = T.t ? TD.textBox(T.t, styleOf(T.f)) : { w: 2, h: 0 }, w = (b.w - 2) * K;
    const hd = (T.t && TD.texLineHD && TD.texLineHD(T.t, em)) || { ht: T.t ? 0.694 * em : 0, dp: 0 };
    // inner sep .3333em of the node's font (not of switches in its text)
    const ix = isx ?? f.size / 3, iy = isy ?? f.size / 3, hw = w / 2 + ix + os, hh = (hd.ht + hd.dp) / 2 + iy + os, sh = (hd.ht - hd.dp) / 2;
    const [ax, ay] = anchorOff(anchor, hw, hh, sh, exOf(T.f));
    const [PX, PY] = toPx(p[0] + sx0, p[1] + sy0), cx = PX + (dx - ax) * PT, cy = PY - (dy - ay) * PT;
    if (T.t) texts.push({ t: T.t, st: styleOf(T.f), x: cx, y: cy + sh * PT - baseLift(b, T.f), b, color: T.color || color, opacity });
    tex(cx - hw * PT, cy - hh * PT, cx + hw * PT, cy + hh * PT);
  };
  M.ext.forEach((x, xi) => item(x, xi));
  const empty = !M.rows.length;
  if (empty || !(y2 >= y1)) { x1 = 0; y1 = 0; x2 = 4 * U * 2; y2 = 2 * U * 2; }
  return { M, cfg, G, rows, texts, extra, warnings, empty, maxW, U, labW, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
}

// ---------------------------------------------------------------- drawing
const DASH: Record<string, any> = { dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], dotted: [0, 2], 'densely dotted': [0, 1], 'loosely dotted': [0, 4], 'dash dot': [3, 2, 0, 2] };
const dashAttr = (st: any) => { const d = DASH[st.dash]; return d ? ` stroke-dasharray="${d.map((v: any) => r2(v * PT + (v === 0 ? 0 : 0))).join(' ')}"${d.includes(0) ? ' stroke-linecap="round"' : ''}` : ''; };
const ptsD = (pts: any, P: any) => pts.map((p: any, i: any) => { const [X, Y] = P(p); return `${i ? 'L' : 'M'}${r2(X)},${r2(Y)}`; }).join('');
// the arrow tip TikZ draws by default (to): a curved barb, open
function tip(kind: any, X: any, Y: any, ux: any, uy: any, w: any, col: any) {
  if (!kind) return '';
  let out = '';
  const nx = -uy, ny = ux, L = 0.75 * PT + 2 * w, H = 0.6 * PT + 1.8 * w;
  for (const ch of kind) {
    if (ch === '<' || ch === '>') {
      const bx = X - ux * L, by = Y - uy * L;
      out += `<path d="M${r2(bx + nx * H)},${r2(by + ny * H)}Q${r2(X - ux * L * 0.25 + nx * H * 0.15)},${r2(Y - uy * L * 0.25 + ny * H * 0.15)} ${r2(X)},${r2(Y)}Q${r2(X - ux * L * 0.25 - nx * H * 0.15)},${r2(Y - uy * L * 0.25 - ny * H * 0.15)} ${r2(bx - nx * H)},${r2(by - ny * H)}" fill="none" stroke="${col}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (ch === '|') out += `<path d="M${r2(X + nx * H * 1.2)},${r2(Y + ny * H * 1.2)}L${r2(X - nx * H * 1.2)},${r2(Y - ny * H * 1.2)}" stroke="${col}" stroke-width="${r2(w)}"/>`;
  }
  return out;
}
// TikZ's patterns library, as SVG: lines 3pt apart, .4pt wide (north east lines and the rest)
let patId = 0;
function patternDef(id: any, name: any, color: any) {
  const S = 3 * PT, w = r2(0.4 * PT), c = color, ln = (d: any) => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none"/>`;
  const L = ({ 'north east lines': ln(`M0,${r2(S)}L${r2(S)},0`), 'north west lines': ln(`M0,0L${r2(S)},${r2(S)}`), 'horizontal lines': ln(`M0,${r2(S / 2)}H${r2(S)}`), 'vertical lines': ln(`M${r2(S / 2)},0V${r2(S)}`), grid: ln(`M0,${r2(S / 2)}H${r2(S)}M${r2(S / 2)},0V${r2(S)}`), crosshatch: ln(`M0,${r2(S)}L${r2(S)},0M0,0L${r2(S)},${r2(S)}`), dots: `<circle cx="${r2(S / 2)}" cy="${r2(S / 2)}" r="${r2(0.5 * PT)}" fill="${c}"/>` } as Record<string, any>)[name] || ln(`M0,${r2(S)}L${r2(S)},0`);
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${r2(S)}" height="${r2(S)}">${L}</pattern>`;
}
function draw(s: any, ctx: any) {
  const Lo = layout(s);
  const ink = TD.css(s.color || '#000000'), inkC = s.color || '#000000';
  const col = (c: any) => (c ? TD.css(c) : ink);
  let back = '', out = '';
  if (Lo.empty) {
    const b = Lo.bb;
    out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
    if (!ctx.export) out += TD.textSvg('Empty timing diagram', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
  }
  const G = Lo.G, op = (st: any) => (st.opacity < 1 ? ` stroke-opacity="${r2(st.opacity)}"` : '') + (st.cap ? ` stroke-linecap="${st.cap === 'butt' ? 'butt' : st.cap}"` : '');
  // the background layer (grids, and what the extra code puts there) under the rows; the rest over them
  let front = '';
  for (const e of Lo.extra) {
    const p = `<path d="${e.d}" fill="none" stroke="${col(e.st.color)}" stroke-width="${r2(e.st.width)}"${dashAttr(e.st)}${op(e.st)}/>`;
    if (e.k === 'grid' || (e.k === 'line' && e.back)) back += p;
    else if (e.k === 'line') front += p;
  }
  out += front;
  for (const { oy, R, ink: rowInk, lw } of Lo.rows) {
    const P = (p: any) => [G.sx * p[0] * G.RX * PT, -G.sy * (oy + p[1] * G.RY) * PT];
    for (const f of R.fills) {
      // palette tiles (currentColor) draw an uncoloured pattern in their own ink
      if (f.pattern) { const id = `tmp${++patId}`; out += `<defs>${patternDef(id, f.pattern, f.color || (s.color === 'currentColor' ? ink : '#000000'))}</defs><path d="${ptsD(f.pts, P)}Z" fill="url(#${id})" stroke="none"/>`; }
      else out += `<path d="${ptsD(f.pts, P)}Z" fill="${f.color}" stroke="none"/>`;
    }
    for (const l of R.lines) out += `<path d="${ptsD(l.pts, P)}" fill="none" stroke="${col(l.color || rowInk)}" stroke-width="${r2(lw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  // breaks: a white slit between two slanted strokes, over each row
  for (const e of Lo.extra) {
    if (e.k !== 'brk') continue;
    for (const y of e.ys) {
      const p = (t: any, v: any) => `${r2(G.sx * t * G.X * PT)},${r2(-G.sy * (y + v) * G.Y * PT)}`, a = e.t - 0.2, b = e.t, c = e.t + 0.2;
      out += `<path d="M${p(a, -0.2)}L${p(b, 1.2)}L${p(c, 1.2)}L${p(b, -0.2)}Z" fill="${ctx.paper || '#ffffff'}" stroke="none"/><path d="M${p(a, -0.2)}L${p(b, 1.2)}M${p(b, -0.2)}L${p(c, 1.2)}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}" stroke-linecap="round"/>`;
    }
  }
  for (const e of Lo.extra) {
    if (e.k !== 'annot') continue;
    const c = col(e.st.color), w = e.st.width, dx = e.Xb - e.Xa, dy = e.Yb - e.Ya, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    out += `<path d="M${r2(e.Xa)},${r2(e.Ya)}L${r2(e.Xb)},${r2(e.Yb)}" fill="none" stroke="${c}" stroke-width="${r2(w)}"${dashAttr(e.st)}${op(e.st)}/>`;
    out += tip(e.tips.a.split('').reverse().join(''), e.Xa, e.Ya, -ux, -uy, w, c) + tip(e.tips.b, e.Xb, e.Yb, ux, uy, w, c);
    if (e.label) out += TD.textSvg(e.label.t, e.label.st, e.st.color || inkC, e.label.x, e.label.y, ctx);
  }
  for (const t of Lo.texts) out += TD.textSvg(t.t, t.st, t.color || inkC, t.x, t.y, ctx, t.opacity < 1 ? ` opacity="${r2(t.opacity)}"` : '');
  const bb = Lo.bb;
  if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
  return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${back}${out}</g>`;
}

function fullCode(src: any) {
  const t = String(src || '').trim();
  return /\\begin\{tikztimingtable\}/.test(t) ? t : `\\begin{tikztimingtable}\n${t}\n\\end{tikztimingtable}`;
}

// a small drawing of a snippet (palette previews): the signals only, without the label column
TD.timingMini = (src: any, maxH = 30) => {
  const s = { type: 'timing', x: 0, y: 0, src, color: 'currentColor' };
  const L = layout(s);
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const { oy, R } of L.rows) for (const l of R.lines) for (const p of l.pts) { const X = L.G.sx * p[0] * L.G.RX * PT, Y = -L.G.sy * (oy + p[1] * L.G.RY) * PT; x1 = Math.min(x1, X); x2 = Math.max(x2, X); y1 = Math.min(y1, Y); y2 = Math.max(y2, Y); }
  for (const e of L.extra) if (e.k === 'annot') { x1 = Math.min(x1, e.Xa, e.Xb); x2 = Math.max(x2, e.Xa, e.Xb); y1 = Math.min(y1, e.Ya - 3 * PT, e.Yb - 3 * PT); y2 = Math.max(y2, e.Ya + 3 * PT, e.Yb + 3 * PT); } else if (e.k === 'line') { const m = /M(-?[\d.]+),(-?[\d.]+)V(-?[\d.]+)/.exec(e.d); if (m) { y1 = Math.min(y1, +m[2]); y2 = Math.max(y2, +m[3]); } }
  if (!(x2 > x1)) { x1 = 0; x2 = 4 * U; y1 = -U; y2 = 0; }
  const pad = LW, vb = { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
  const k = Math.min(2.4, maxH / vb.h);
  const g = draw(s, { export: true, paper: 'var(--sheet-raised)' });
  // draw() puts the bounds' corner at (0,0): undo that so the view box is in layout units
  const inner = g.replace(/^<g transform="translate\([^)]*\)">/, `<g transform="translate(0,0)">`);
  return `<svg class="zxmini" width="${r2(vb.w * k)}" height="${r2(vb.h * k)}" viewBox="${r2(vb.x)} ${r2(vb.y)} ${r2(vb.w)} ${r2(vb.h)}" aria-hidden="true">${inner}</svg>`;
};

TD.TYPES.timing = {
  name: 'Timing diagram',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'timing', x: p.x, y: p.y, src: TD.TIMING_DEFAULT, color: '#000000' }),
  drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: () => true,
  handles: () => [],
  anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
  samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
  svg: draw,
  // tikz-timing draws its own picture: it goes in a node at the drawing's centre
  tikz(s: any, X: any) {
    X.pkgs.add('tikz-timing');
    if (/\bpattern\s*=/.test(s.src)) X.libs.add('patterns');
    const b = layout(s).bb;
    const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
    return `\\node${col ? ` [color=${col}]` : ''} at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
  },
};


// for the visual editor (src/editors/tmeditor.ts)
TD.timing = { parse, write, layout, draw, drawRow, config, charsCode, rowCode, readChars, kv, opts, num, shown, list, fullCode, bgOf, VALUES, VALUE_NAMES, U, LW, DEF };
// Application integration belongs to the block, alongside its model and panel.
TD.blocks.register("timing", {
  menu: { order: 8, group: 'electronics', label: "Timing", title: "Timing diagram, written for tikz-timing", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M2 9h4V3h6v6h6V3h6v6h6\"/><path d=\"M2 17l2-3h10l2 3-2 3H4z\"/><path d=\"M16 17l2-3h10M16 17l2 3h10\"/></svg>" },
  nodeImport: { re: /\\begin\{tikztimingtable\}[\s\S]*\\end\{tikztimingtable\}/, order: 1, bb: (q) => TD.timing.layout(q).bb, dedent: true },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: { get: () => TD.timingEditor, alias: "timingOpen", layout: (s) => TD.timing.layout(s) }
});
export { layout, num, fullCode };
