export let panelServices: any;
import { runtime as TD } from '../runtime';
// Timing diagrams written with the tikz-timing package. The source is the object: a tikztimingtable whose
// rows are "name & characters \\" and whose \extracode holds annotations (arrows between edges, marker
// lines, grids). It is drawn here at the package's own sizes, measured against pdflatex: one period is
// 1.6ex of the table's \sffamily (7.11pt) wide and one signal that high, lines are 0.15ex, rows sit
// \rowdist = 2 signal heights apart and data text is set at 0.6 scale. The code is exported unchanged
// inside a node (tikz-timing draws its own tikzpicture), so pdfLaTeX builds it as written.
// The visual editor (js/tmeditor.ts) reads the code into a model and writes it back.
(function () {
  const { r2, esc } = TD.util;
  const K = TD.PT_PER_PX, PT = 1 / K;
  const U = 7.1111 * PT;            // xunit = yunit = 1.6ex in \sffamily at 10pt
  const LW = 0.6667 * PT;           // line width 0.15ex
  const STRUT = { h: 8.4 * PT, d: 3.6 * PT }; // the \strut of a row label
  const LABEL = { size: 10 * PT, font: 'cmss' };
  const DTEXT = { size: 6 * PT, font: 'cmss' };
  const SIZES: Record<string, any> = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4 };
  const INK: Record<string, any> = { Z: '#0000ff', X: '#ff0000', M: '#734d26', U: '#808080', help: '#808080' };
  const DEF = { lslope: 0.1, dslope: 0.2, zslope: 0.05, rowdist: 2, coldist: 1 };

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
  function close(s: any, i: any) {
    const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, any>)[open];
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{' && open !== '{') { k = close(s, k); if (k < 0) return -1; continue; }
      if (c === open) d++;
      else if (c === shut && --d === 0) return k;
    }
    return -1;
  }
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
  const unbrace = (v: any) => { v = String(v ?? '').trim(); while (v[0] === '{' && close(v, 0) === v.length - 1) v = v.slice(1, -1).trim(); return v; };
  const stripComments = (s: any) => s.replace(/(^|[^\\])%.*$/gm, '$1');
  const skip = (s: any, i: any) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  const num = (n: any) => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? '0' : String(v); };
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
    for (const o of M.topts) {
      const { k } = kv(o);
      if (!/^timing\/(slope|lslope|dslope|zslope|rowdist|coldist)$/.test(k)) warn(`The table option "${o}" isn't drawn here (it is kept in the code)`);
    }
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
    for (const r of splitRows(rowsPart)) {
      if (!r.trim()) continue;
      M.rows.push(readRow(r, warn));
    }
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
        if (row.ropts) warn(`The row option "${row.ropts}" isn't drawn here (it is kept in the code)`);
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
      if (!/^[\d.+\-*/()\s]+$/.test(x)) return NaN;
      try { return Function(`"use strict";return (${x})`)(); } catch (err: any) { return NaN; }
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
  // the extra code: annotations, marker lines, grids and breaks are drawn; anything else is kept as written
  function readExtra(s: any, warn: any) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      i = skip(s, i);
      if (i >= s.length) break;
      const rest = s.slice(i);
      let m = /^\\(vertlines|horlines)\b\s*/.exec(rest);
      if (m) {
        let j = i + m[0].length, o = '';
        if (s[j] === '[') { const e = close(s, j); o = s.slice(j + 1, e).trim(); j = skip(s, e + 1); }
        let list = '';
        if (s[j] === '{') { const e = close(s, j); list = s.slice(j + 1, e).trim(); j = e + 1; }
        out.push({ k: m[1] === 'vertlines' ? 'vert' : 'hor', o, list, src: s.slice(i, j).trim() });
        i = j; continue;
      }
      m = BRK_RE.exec(rest);
      if (m) { out.push({ k: 'brk', t: parseFloat(m[2]) + 0.2, ys: m[1].split(',').map((v) => parseFloat(v)).filter(isFinite), src: m[0] }); i += m[0].length; continue; }
      m = /^\\(tablegrid|fulltablegrid)\b(\*?)\s*/.exec(rest);
      if (m) {
        let j = i + m[0].length, o = '';
        if (s[j] === '[') { const e = close(s, j); o = s.slice(j + 1, e).trim(); j = e + 1; }
        out.push({ k: m[1] === 'tablegrid' ? 'grid' : 'fullgrid', star: !!m[2], o, src: s.slice(i, j).trim() });
        i = j; continue;
      }
      // a statement up to its ;
      let e = i, d = 0;
      for (; e < s.length; e++) {
        const c = s[e];
        if (c === '\\') { e++; continue; }
        if ('{[('.includes(c)) d++;
        else if ('}])'.includes(c)) d--;
        else if (c === ';' && d <= 0) break;
      }
      const st = s.slice(i, e + 1).trim();
      const a = readAnnot(st);
      if (a) out.push(a);
      else if (st) { out.push({ k: 'raw', src: st }); warn(`"${st.length > 40 ? st.slice(0, 40) + '…' : st}" isn't drawn here (it is kept in the code)`); }
      i = e + 1;
    }
    return out;
  }
  // \draw [opts] (x1,y1) -- node [opts] {text} (x2,y2);  (or the node after the second point)
  function readAnnot(st: any) {
    const m = /^\\draw\s*/.exec(st);
    if (!m) return null;
    let i = m[0].length, o: any[] = [];
    const pt = () => {
      i = skip(st, i);
      const q = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(st.slice(i));
      if (!q) return null;
      i += q[0].length;
      return [parseFloat(q[1]), parseFloat(q[2])];
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

  // ---------------------------------------------------------------- settings
  function config(M: any) {
    const c = { ...DEF };
    for (const o of M.topts) {
      const { k, v } = kv(o), n = parseFloat(v!);
      if (!isFinite(n)) continue;
      if (k === 'timing/slope') { c.lslope = n; c.dslope = 2 * n; c.zslope = n / 2; }
      else if (k === 'timing/lslope') c.lslope = n;
      else if (k === 'timing/dslope') c.dslope = n;
      else if (k === 'timing/zslope') c.zslope = n;
      else if (k === 'timing/rowdist') c.rowdist = n;
      else if (k === 'timing/coldist') c.coldist = n;
    }
    return c;
  }
  // a foreach list: 1,2,4 or 0,1,...,10 (with \twidth and \nrows)
  function list(s: any, vars: any) {
    const items = String(s || '').replace(/\\twidth\b/g, vars.twidth).replace(/\\nrows\b/g, vars.nrows).split(',').map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i] === '...' && i >= 1 && i + 1 < items.length) {
        const a = parseFloat(items[i - 1]), b = i >= 2 ? parseFloat(items[i - 2]) : NaN, end = parseFloat(items[i + 1]);
        const step = isFinite(b) ? a - b : 1;
        if (step > 0) for (let v = a + step; v < end - 1e-9 && out.length < 500; v += step) out.push(v);
        continue;
      }
      const v = parseFloat(items[i]);
      if (isFinite(v)) out.push(v);
    }
    return out;
  }
  // TikZ line options → { color, width, dash }
  function lineStyle(o: any, ink: any) {
    const r = { color: ink, width: LW, dash: '' };
    for (const it of (Array.isArray(o) ? o : opts(o))) {
      const { k, v } = kv(it);
      if (k === 'help lines') { r.color = INK.help; r.width = 0.2 * PT; continue; }
      const w = ({ 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 } as Record<string, any>)[k];
      if (w) { r.width = w * PT; continue; }
      if (k === 'line width' && v) { const m = /^([\d.]+)\s*(pt|mm|cm)?$/.exec(v); if (m) r.width = parseFloat(m[1]) * ({ mm: 2.845, cm: 28.45 }[m[2]] || 1) * PT; continue; }
      if (/^(loosely |densely )?(dashed|dotted|dash dot)$/.test(k)) { r.dash = k; continue; }
      if (k === 'solid') { r.dash = ''; continue; }
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
  const cache = new Map();
  function layout(s: any) {
    const key = [s.src, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s.src);
    if (TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  TD.onTextMetricsChange(() => { cache.clear(); });

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
    let x = 0, prev = row.init && 'HLZXDUM'.includes(row.init) ? row.init : null, band: any = null;
    const ds = cfg.dslope;
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
      const a = x, b = x + seg.w;
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

  function build(src: any) {
    const M = parse(src);
    const cfg = config(M), rd = cfg.rowdist, cd = cfg.coldist;
    const warnings = M.warnings.slice();
    const rows: any[] = [], texts: any[] = [], extra: any[] = [];
    let maxW = 0, x1 = -cd * U, x2 = 0, y1 = Infinity, y2 = -Infinity;
    const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    // px from table units (y up)
    const P = (x: any, y: any) => [x * U, -y * U];
    M.rows.forEach((row, r) => {
      const base = -r * rd, R = drawRow(row, cfg);
      maxW = Math.max(maxW, R.end);
      const name = shown(row.name), nb = name ? TD.textBox(name, LABEL) : { w: 2, h: 0 };
      const lx = -cd * U, by = -base * U;
      // row names sit 3.2px lower than the 0.3-height rule, measured against pdflatex
      if (name) texts.push({ t: name, st: LABEL, x: lx - (nb.w - 2) / 2, y: by - 0.3 * nb.h + 3.2, b: nb, row: r });
      ext(lx - (nb.w - 2), by - STRUT.h, lx, by + STRUT.d);
      for (const t of R.texts) {
        const tt = shown(t.t), b = TD.textBox(tt, DTEXT), [X, Y] = P(t.x, base + t.y);
        texts.push({ t: tt, st: DTEXT, x: X, y: Y, b });
      }
      rows.push({ r, base, R, row });
    });
    for (const { base, R } of rows) {
      for (const l of R.lines) for (const p of l.pts) { const [X, Y] = P(p[0], base + p[1]); ext(X, Y - LW / 2, X, Y + LW / 2); }
    }
    x2 = Math.max(x2, maxW * U);
    // the extra code
    const n = M.rows.length, lastBase = -(Math.max(1, n) - 1) * rd, vars = { twidth: num(maxW), nrows: String(n) };
    M.ext.forEach((x, xi) => {
      if (x.k === 'vert') {
        const st = lineStyle(x.o, null);
        for (const [j, v] of list(x.list || `0,1,...,${num(maxW)}`, vars).entries()) {
          const [X, Y1] = P(v, 1.5), [, Y2] = P(v, lastBase - 0.5);
          extra.push({ k: 'line', xi, j, d: `M${r2(X)},${r2(Y1)}V${r2(Y2)}`, st, x: v });
          ext(X - st.width / 2, Y1 - st.width / 2, X + st.width / 2, Y2 + st.width / 2);
        }
      } else if (x.k === 'hor') {
        const st = lineStyle(x.o, null);
        for (const [j, v] of list(x.list || `1,2,...,${n}`, vars).entries()) {
          const [, Y] = P(0, rd - v * rd);
          extra.push({ k: 'line', xi, j, d: `M0,${r2(Y)}H${r2(maxW * U)}`, st });
          ext(-st.width / 2, Y - st.width / 2, maxW * U + st.width / 2, Y + st.width / 2);
        }
      } else if (x.k === 'grid' || x.k === 'fullgrid') {
        const st = lineStyle(x.o ? `help lines, ${x.o}` : 'help lines', null);
        let d = '';
        const grid = (xa: any, xb: any, ya: any, yb: any) => {
          for (let q = xa; q <= xb + 1e-9; q += 0.5) { const [X, Ya] = P(q, ya), [, Yb] = P(q, yb); d += `M${r2(X)},${r2(Ya)}V${r2(Yb)}`; }
          for (let q = ya; q <= yb + 1e-9; q += 0.5) { const [Xa, Y] = P(xa, q), [Xb] = P(xb, q); d += `M${r2(Xa)},${r2(Y)}H${r2(Xb)}`; }
        };
        if (x.k === 'fullgrid') grid(0, maxW, lastBase, 1);
        else for (const { base, R } of rows) grid(0, x.star ? R.end : maxW, base, base + 1);
        extra.push({ k: 'grid', xi, d, st, back: true });
        for (const m of d.matchAll(/M(-?[\d.]+),(-?[\d.]+)([VH])(-?[\d.]+)/g)) { const a = +m[1], b = +m[2], c = +m[4], h = st.width / 2; if (m[3] === 'V') ext(a - h, Math.min(b, c) - h, a + h, Math.max(b, c) + h); else ext(Math.min(a, c) - h, b - h, Math.max(a, c) + h, b + h); }
      } else if (x.k === 'brk') {
        extra.push({ k: 'brk', xi, t: x.t, ys: x.ys });
        for (const y of x.ys) { const [Xa, Ya] = P(x.t - 0.2, y + 1.2), [Xb, Yb] = P(x.t + 0.2, y - 0.2); ext(Xa, Ya, Xb, Yb); }
      } else if (x.k === 'annot') {
        const st = lineStyle(x.o, null), tips = tipsOf(x.o);
        const [Xa, Ya] = P(x.x1, x.y1), [Xb, Yb] = P(x.x2, x.y2);
        const a: Record<string, any> = { k: 'annot', xi, st, tips, Xa, Ya, Xb, Yb };
        extra.push(a);
        ext(Math.min(Xa, Xb) - LW / 2, Math.min(Ya, Yb) - LW / 2, Math.max(Xa, Xb) + LW / 2, Math.max(Ya, Yb) + LW / 2);
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
      }
    });
    const empty = !M.rows.length;
    if (empty || !(y2 >= y1)) { x1 = 0; y1 = 0; x2 = 4 * U * 2; y2 = 2 * U * 2; }
    return { M, cfg, rows, texts, extra, warnings, empty, maxW, U, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
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
    for (const e of Lo.extra) {
      if (e.k === 'grid') back += `<path d="${e.d}" fill="none" stroke="${col(e.st.color)}" stroke-width="${r2(e.st.width)}"${dashAttr(e.st)}/>`;
      else if (e.k === 'line') out += `<path d="${e.d}" fill="none" stroke="${col(e.st.color)}" stroke-width="${r2(e.st.width)}"${dashAttr(e.st)}/>`;
    }
    for (const { base, R } of Lo.rows) {
      const P = (p: any) => [p[0] * U, -(base + p[1]) * U];
      for (const f of R.fills) {
        // palette tiles (currentColor) draw an uncoloured pattern in their own ink
        if (f.pattern) { const id = `tmp${++patId}`; out += `<defs>${patternDef(id, f.pattern, f.color || (s.color === 'currentColor' ? ink : '#000000'))}</defs><path d="${ptsD(f.pts, P)}Z" fill="url(#${id})" stroke="none"/>`; }
        else out += `<path d="${ptsD(f.pts, P)}Z" fill="${f.color}" stroke="none"/>`;
      }
      for (const l of R.lines) out += `<path d="${ptsD(l.pts, P)}" fill="none" stroke="${col(l.color)}" stroke-width="${r2(LW)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    // breaks: a white slit between two slanted strokes, over each row
    for (const e of Lo.extra) {
      if (e.k !== 'brk') continue;
      for (const y of e.ys) {
        const p = (t: any, v: any) => `${r2(t * U)},${r2(-(y + v) * U)}`, a = e.t - 0.2, b = e.t, c = e.t + 0.2;
        out += `<path d="M${p(a, -0.2)}L${p(b, 1.2)}L${p(c, 1.2)}L${p(b, -0.2)}Z" fill="${ctx.paper || '#ffffff'}" stroke="none"/><path d="M${p(a, -0.2)}L${p(b, 1.2)}M${p(b, -0.2)}L${p(c, 1.2)}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}" stroke-linecap="round"/>`;
      }
    }
    for (const e of Lo.extra) {
      if (e.k !== 'annot') continue;
      const c = col(e.st.color), w = e.st.width, dx = e.Xb - e.Xa, dy = e.Yb - e.Ya, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      out += `<path d="M${r2(e.Xa)},${r2(e.Ya)}L${r2(e.Xb)},${r2(e.Yb)}" fill="none" stroke="${c}" stroke-width="${r2(w)}"${dashAttr(e.st)}/>`;
      out += tip(e.tips.a.split('').reverse().join(''), e.Xa, e.Ya, -ux, -uy, w, c) + tip(e.tips.b, e.Xb, e.Yb, ux, uy, w, c);
      if (e.label) out += TD.textSvg(e.label.t, e.label.st, e.st.color || inkC, e.label.x, e.label.y, ctx);
    }
    for (const t of Lo.texts) out += TD.textSvg(t.t, t.st, inkC, t.x, t.y, ctx);
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
    for (const { base, R } of L.rows) for (const l of R.lines) for (const p of l.pts) { const X = p[0] * U, Y = -(base + p[1]) * U; x1 = Math.min(x1, X); x2 = Math.max(x2, X); y1 = Math.min(y1, Y); y2 = Math.max(y2, Y); }
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
    menu: { order: 8, label: "Timing", title: "Timing diagram, written for tikz-timing", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M2 9h4V3h6v6h6V3h6v6h6\"/><path d=\"M2 17l2-3h10l2 3-2 3H4z\"/><path d=\"M16 17l2-3h10M16 17l2 3h10\"/></svg>" },
    nodeImport: { re: /\\begin\{tikztimingtable\}[\s\S]*\\end\{tikztimingtable\}/, order: 1, bb: (q) => TD.timing.layout(q).bb, dedent: true },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    editor: { get: () => TD.timingEditor, alias: "timingOpen", layout: (s) => TD.timing.layout(s) }
  });
  panelServices = { layout, num, fullCode };
})();
