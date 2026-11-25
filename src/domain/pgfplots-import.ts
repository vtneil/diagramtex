import { runtime as TD } from '../runtime';
import { limits as plotLimits } from './plots.ts';
import { unbrace } from './tex-groups';
import { compatNum } from './pgfplots-annot';
// pgfplots import: a hand-written \begin{axis} … \end{axis} (or semilogxaxis / semilogyaxis / loglogaxis) read into the
// app's own plot object (src/domain/plots.ts), drawn as pdflatex would draw it.
//
//   TD.pgfplotsImport.fromAxis(env, optStr, body, helpers) -> { shape, issues } | null
//
//   env     the environment's name ('axis', 'semilogyaxis', …)
//   optStr  the text inside the environment's [ … ] (without the brackets), '' when it has none
//   body    the text between the options and \end{env}, comments already blanked
//   helpers what the picture around the axis knows (tikzimport.ts passes them; every one is optional):
//     color(spec)       an xcolor spec (blue, red!30!white, a \definecolor'd name) -> '#rrggbb'; null for `none`;
//                       undefined when unknown
//     len(v, defUnit)   a TeX length ('5cm', '200pt', '\linewidth' unknown -> NaN) -> px; defUnit for a bare number
//     expand(v)         the text with the picture's numeric macros (\def\a{2}) written in
//     coord(spec)       a TikZ point ('0,0', '3cm,1cm', 'a.north') -> { x, y } px, y down; null when unknown
//     styles            Map of \tikzset style name -> its keys, used for `\addplot[mystyle]`
//
// shape is a plot object (TD.TYPES.plot.create), placed where pgfplots puts the axis box (anchor south west at the
// origin unless at= / anchor= say otherwise). issues lists what the plot does not hold as written: empty means the
// axis can be a native plot; otherwise the caller keeps the code and shows the plot as its preview.
// null: not an axis this reader understands at all (no \addplot it could read).
(function () {
  const K = TD.PT_PER_PX, PX = TD.PX_PER_CM;
  // reserved entries in the picture's style map: \pgfplotsset's keys, the compat level, the document's text width (pt)
  const SETTINGS = 'pgfplots::settings', COMPAT = 'pgfplots::compat', TEXTWIDTH = 'pgfplots::textwidth';

  // ---------- text helpers ----------
  const OPEN: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  function matchClose(s: string, i: number) {
    const open = s[i], close = OPEN[open];
    if (!close) return -1;
    let d = 0;
    for (let k = i; k < s.length; k++) {
      if (s[k] === '\\') { k++; continue; }
      if (s[k] === open) d++;
      else if (s[k] === close && --d === 0) return k;
    }
    return -1;
  }
  function splitTop(s: string, sep: string) {
    const out: string[] = []; let d = 0, buf = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { buf += c + s[++i]; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      if (c === sep && d === 0) { out.push(buf); buf = ''; } else buf += c;
    }
    out.push(buf);
    return out;
  }
  type Opt = { k: string, v: string | null };
  // Styles that each name another several times would expand exponentially within the depth limit:
  // like the TikZ importer, one call expands at most STYLE_BUDGET styles in all, and keeps the rest as written.
  const STYLE_BUDGET = 4096;
  let styleBudget = 0;
  function parseOpts(str: string, styles?: Map<string, string>, depth = 0): Opt[] {
    if (depth === 0) styleBudget = STYLE_BUDGET;
    const out: Opt[] = [];
    for (const raw of splitTop(String(str || ''), ',')) {
      const x = raw.trim();
      if (!x) continue;
      const eq = splitTop(x, '=');
      const o: Opt = eq.length > 1 ? { k: eq[0].trim().replace(/\s+/g, ' '), v: unbrace(eq.slice(1).join('=')) } : { k: x.replace(/\s+/g, ' '), v: null };
      const body = styles && o.v == null && depth < 8 ? styles.get('pgfplots:' + o.k) ?? styles.get(o.k) : undefined;
      if (body != null && !/#1/.test(body) && --styleBudget >= 0) { for (const it of parseOpts(body, styles, depth + 1)) out.push(it); continue; }
      out.push(o);
    }
    return out;
  }

  // ---------- pgfmath -> the plot's expressions ----------
  // pgfplots reads trig functions in degrees (unless trig format plots=rad); the plot's expressions are in radians.
  const DEG = new Set(['sin', 'cos', 'tan', 'sec', 'cosec', 'cot']), ADEG = new Set(['asin', 'acos', 'atan']);
  function pgfExpr(src: string, deg: boolean, vars: string[], expand: (v: string) => string): { expr: string, error?: string } {
    let t = String(src);
    for (const v of ['x', 'y', 't', 'u', 'v']) t = t.replace(new RegExp(`\\\\${v}(?![A-Za-z@])`, 'g'), v);
    t = expand(t).replace(/\\pi(?![A-Za-z@])/g, 'pi');
    if (/\\[A-Za-z@]/.test(t)) return { expr: t, error: `unknown macro in ${src.trim()}` };
    if (/[<>?!=&|]/.test(t)) return { expr: t, error: `conditions in ${src.trim()}` };
    const conv = (s: string): string => {
      let out = '', i = 0;
      while (i < s.length) {
        const m = /^[A-Za-z_]\w*/.exec(s.slice(i));
        if (!m) { out += s[i++]; continue; }
        const name = m[0];
        let j = i + name.length; while (s[j] === ' ') j++;
        if (s[j] !== '(' || !(DEG.has(name) || ADEG.has(name) || name === 'deg' || name === 'rad')) { out += name; i += name.length; continue; }
        const e = matchClose(s, j);
        if (e < 0) { out += s.slice(i); break; }
        const inner = conv(s.slice(j + 1, e)).trim();
        const dm = /^deg\s*\(([\s\S]*)\)$/.exec(inner), plainDeg = dm && matchClose(inner, inner.indexOf('(')) === inner.length - 1;
        const rad = (a: string) => (deg ? (plainDeg ? dm![1] : `pi/180*(${a})`) : a);
        const prim = (f: string, a: string) => (f === 'sec' ? `(1/cos(${a}))` : f === 'cosec' ? `(1/sin(${a}))` : f === 'cot' ? `(1/tan(${a}))` : `${f}(${a})`);
        if (DEG.has(name)) out += prim(name, rad(inner));
        else if (ADEG.has(name)) out += deg ? `(180/pi*${name}(${inner}))` : `${name}(${inner})`;
        else if (name === 'deg') out += `(180/pi*(${inner}))`;
        else out += `(pi/180*(${inner}))`;
        i = e + 1;
      }
      return out;
    };
    const expr = conv(t).replace(/\s+/g, ' ').trim();
    const e = TD.getExpr(expr, vars);
    return e.error ? { expr, error: `${e.error} in ${src.trim()}` } : { expr };
  }
  // a pgfmath number (macros written in, degrees kept as written)
  const numOf = (v: any, expand: (v: string) => string) => {
    const t = expand(String(v ?? '')).replace(/\\pi(?![A-Za-z@])/g, 'pi').trim();
    return t === '' ? NaN : TD.evalNumber(t, NaN);
  };
  const fmt = (n: number) => String(+n.toPrecision(10));

  // ---------- pgfplots' defaults ----------
  const CYCLE: Record<string, string[]> = {
    color: [
      'blue,mark=*', 'red,mark=square*', 'brown!60!black,mark=otimes*', 'black,mark=star', 'blue,mark=diamond*',
      'red,densely dashed,mark=*', 'brown!60!black,densely dashed,mark=square*', 'black,densely dashed,mark=otimes*',
      'blue,densely dashed,mark=star', 'red,densely dashed,mark=diamond*'],
    bar: ['blue,fill=blue!30!white,mark=none', 'red,fill=red!30!white,mark=none', 'brown!60!black,fill=brown!30!white,mark=none',
      'black,fill=gray,mark=none', 'violet!80!black,fill=violet,mark=none', 'green,fill=green!80!black,mark=none'],
    'color list': ['red', 'blue', 'black', 'yellow', 'brown', 'teal', 'orange', 'violet', 'cyan', 'green!70!black', 'magenta', 'gray'],
    linestyles: ['solid', 'dashed', 'dotted'],
  };
  const MARK_OK = new Set(['*', 'o', 'square*', 'square', 'triangle*', 'x', '+']);
  const MARK_NEAR: Record<string, string> = { triangle: 'triangle*', 'diamond*': 'square*', diamond: 'square', 'otimes*': '*', otimes: 'o', 'oplus*': '*', oplus: 'o', star: 'x', asterisk: 'x', 'pentagon*': '*', pentagon: 'o', '|': '+', '-': '+', 'halfcircle*': '*', 'halfcircle': 'o' };
  const WIDTHS: Record<string, number> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  const DASHES: Record<string, string> = { solid: 'solid', dashed: 'dashed', 'densely dashed': 'dashed', 'loosely dashed': 'dashed', dotted: 'dotted', 'densely dotted': 'dotted', 'loosely dotted': 'dotted' };
  const LEGEND_POS = new Set(['north east', 'north west', 'south east', 'south west', 'outer north east']);
  const CMAP: Record<string, string> = { hot: 'hot', hot2: 'hot', viridis: 'viridis', jet: 'jet', cool: 'cool', blackwhite: 'gray', gray: 'gray' };
  // axis options with no visible effect here (or one the plot draws anyway)
  const AXIS_QUIET = new Set(['compat', 'scaled ticks', 'scaled x ticks', 'scaled y ticks', 'clip', 'clip mode', 'legend cell align', 'name', 'axis on top', 'set layers',
    'tick label style', 'unbounded coords', 'filter discard warning', 'scale only axis', 'width', 'height', 'at', 'anchor', 'trig format plots', 'samples', 'domain', 'y domain', 'smooth', 'no markers', 'no marks',
    'xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax', 'xlabel', 'ylabel', 'zlabel', 'title', 'grid', 'axis lines', 'legend pos', 'legend entries', 'view', 'colorbar', 'colormap name',
    'enlargelimits', 'enlarge x limits', 'enlarge y limits', 'enlarge z limits', 'xtick', 'ytick', 'ztick', 'ybar', 'bar width', 'cycle list name', 'cycle list', 'every axis plot/.append style',
    'every axis plot post/.append style', 'every axis plot/.style', 'xlabel near ticks', 'ylabel near ticks', 'legend columns', 'declare function', 'xtick distance', 'ytick distance', 'axis equal', 'every axis plot post/.style', 'axis equal image', 'xmajorgrids', 'ymajorgrids', 'zmajorgrids', 'x', 'y', 'axis x line', 'axis y line', 'ticks', 'mark size',
    'xshift', 'yshift', 'symbolic x coords', 'symbolic y coords', 'xticklabels', 'yticklabels', 'hide axis', 'hide x axis', 'hide y axis', 'hide z axis', 'unit vector ratio', 'unit vector ratio*']);

  function fromAxis(env: string, optStr: string, body: string, helpers: Record<string, any> = {}) {
    const issues: string[] = [];
    const issue = (m: string) => { if (!issues.includes(m)) issues.push(m); };
    const expand = (v: string) => (helpers.expand ? helpers.expand(v) : v);
    const color = (spec: any) => { const c = helpers.color ? helpers.color(spec) : /^#[0-9a-f]{6}$/i.test(spec) ? spec : undefined; return c; };
    const isColor = (spec: string) => !!spec && !/[=\s]/.test(spec.trim()) && typeof color(spec) === 'string';
    const lenPx = (v: any, unit = 'pt') => { const n = helpers.len ? helpers.len(docLengths(v, styles), unit) : NaN; return isFinite(n) ? n : NaN; };
    const styles: Map<string, string> | undefined = helpers.styles;
    // \pgfplotsset's keys come first, then every axis, then the axis' own (pgfkeys reads them in that order)
    const A = parseOpts([styles?.get(SETTINGS), styles?.get('pgfplots:every axis'), optStr].filter(Boolean).join(','), styles);
    const compat = compatNum(styles?.get(COMPAT) ?? '1.18');
    const get = (k: string) => { let v: string | null | undefined; for (const o of A) if (o.k === k) v = o.v ?? ''; return v; };
    const has = (k: string) => A.some((o) => o.k === k);

    // symbolic x coords={a,b,c}: each symbol is its place in the list (0, 1, 2 …), printed as written at the ticks
    const sym: Record<string, string[] | null> = { x: null, y: null };
    for (const a of ['x', 'y']) { const v = get(`symbolic ${a} coords`); if (v != null) sym[a] = splitTop(unbrace(v), ',').map((q) => q.trim()); }
    const symAt = (a: string, t: string) => { const L = sym[a]; if (!L) return NaN; const k = L.indexOf(unbrace(t.trim()).trim()); return k >= 0 ? k : NaN; };

    // ----- axis kind -----
    if (/^semilogxaxis$|^loglogaxis$/.test(env) || get('xmode') === 'log') issue('logarithmic x axis drawn linear');
    if (/^semilogyaxis$|^loglogaxis$/.test(env) || get('ymode') === 'log') issue('logarithmic y axis drawn linear');
    const radTrig = get('trig format plots') === 'rad';
    // declare function={f(\x)=…;}: calls written out in the expressions
    const funcs: { name: string, params: string[], body: string }[] = [];
    for (const o of A) if (o.k === 'declare function' && o.v) for (const d of o.v.split(';')) {
      const m = /^\s*([A-Za-z]\w*)\s*\(([^()]*)\)\s*=([\s\S]*)$/.exec(d);
      if (m) funcs.push({ name: m[1], params: m[2].split(',').map((q) => q.trim().replace(/^\\/, '')).filter(Boolean), body: m[3].trim() });
      else if (d.trim()) issue(`declare function ${d.trim()} not read`);
    }
    const inline = (t: string) => {
      for (let pass = 0; pass < 12 && funcs.length; pass++) {
        let changed = false;
        for (const F of funcs) {
          const re = new RegExp(`(?<![A-Za-z_0-9\\\\])${F.name}\\s*\\(`, 'g');
          let m: RegExpExecArray | null, out = '', last = 0;
          while ((m = re.exec(t))) {
            const open = m.index + m[0].length - 1, close = matchClose(t, open);
            if (close < 0) break;
            const args = splitTop(t.slice(open + 1, close), ',').map((q) => q.trim());
            let b = F.body;
            F.params.forEach((p, k) => { b = b.replace(new RegExp(`\\\\${p}(?![A-Za-z@])|(?<![A-Za-z_0-9\\\\])${p}(?![A-Za-z_0-9])`, 'g'), `(${args[k] ?? ''})`); });
            out += t.slice(last, m.index) + `(${b})`; last = close + 1; re.lastIndex = close + 1; changed = true;
          }
          t = out + t.slice(last);
        }
        if (!changed) break;
      }
      return t;
    };
    const fx = (v: string) => inline(expand(v));

    // ----- the plots -----
    type P = { opts: Opt[], plus: boolean, three: boolean, src: any, closed: boolean, legend?: string, forget: boolean };
    const plots: P[] = [];
    // TikZ statements in the axis, as written, each after so many plots
    const annots: { at: number, code: string }[] = [];
    let legendList: string[] | null = null;
    let loopBudget = 2000;
    let unread = false; // \addplot statements this reader skipped (in a loop …): the axis is not known to be empty
    const TIKZ = new Set(['draw', 'path', 'node', 'fill', 'filldraw', 'shade', 'shadedraw', 'clip', 'coordinate', 'pic', 'matrix', 'pattern']);
    const DEFINES = new Set(['def', 'edef', 'gdef', 'xdef', 'newcommand', 'renewcommand', 'providecommand', 'pgfmathsetmacro', 'pgfmathtruncatemacro', 'newlength', 'setlength', 'let']);
    // the statement's ; at depth 0
    const stmtEnd = (t: string, j: number) => {
      let d = 0;
      for (let k = j; k < t.length; k++) { const c = t[k]; if (c === '\\') { k++; continue; } if ('{[('.includes(c)) d++; else if ('}])'.includes(c)) d--; else if (c === ';' && d === 0) return k; }
      return t.length;
    };
    const scan = (s: string, depth = 0): boolean => {
      let i = 0;
      const skipWs = (k: number) => { while (k < s.length && /\s/.test(s[k])) k++; return k; };
      // a macro's own arguments: [..] and {..} right after it
      const skipArgs = (k: number) => { for (;;) { const q = skipWs(k); if (s[q] !== '[' && s[q] !== '{') return k; const e = matchClose(s, q); if (e < 0) return s.length; k = e + 1; } };
      while (i < s.length) {
        const bs = s.indexOf('\\', i);
        if (bs < 0) { if (s.slice(i).trim()) issue('text in the axis not drawn'); break; }
        if (s.slice(i, bs).trim().replace(/;/g, '')) issue('text in the axis not drawn');
        const m = /^\\(addplot3|[A-Za-z@]+)/.exec(s.slice(bs));
        if (!m) { i = bs + 2; continue; }
        const name = m[1];
        let j = bs + m[0].length;
        if (name === 'addplot' || name === 'addplot3') {
          let plus = false;
          j = skipWs(j);
          if (s[j] === '+') { plus = true; j = skipWs(j + 1); }
          if (s[j] === '*') { issue('\\addplot* (filled) not held'); j = skipWs(j + 1); }
          let optText = '', hasOpts = false;
          if (s[j] === '[') { const e = matchClose(s, j); if (e < 0) return false; optText = s.slice(j + 1, e); hasOpts = true; j = skipWs(e + 1); }
          // the old form \addplot plot coordinates / plot expression / plot (…), with options of its own
          if (/^plot\b/.test(s.slice(j))) {
            j = skipWs(j + 4);
            if (s[j] === '[') { const e = matchClose(s, j); if (e < 0) return false; optText = optText ? `${optText},${s.slice(j + 1, e)}` : s.slice(j + 1, e); hasOpts = true; j = skipWs(e + 1); }
          }
          const end = stmtEnd(s, j);
          let rest = s.slice(j, end).trim();
          const closed = /\\closedcycle\s*$/.test(rest);
          if (closed) rest = rest.replace(/\\closedcycle\s*$/, '').trim();
          let src: any = null;
          const kw = /^(coordinates|table|expression|gnuplot|shell|file|fill between|graphics)\b/.exec(rest);
          if (kw && kw[1] === 'coordinates') {
            const b = rest.indexOf('{'), e = b >= 0 ? matchClose(rest, b) : -1;
            if (e < 0) return false;
            src = { type: 'coords', text: rest.slice(b + 1, e) };
            if (rest.slice(e + 1).trim()) issue('text after the coordinates not drawn');
          } else if (kw && kw[1] === 'table') {
            let k = 'table'.length; while (/\s/.test(rest[k])) k++;
            let topt = '';
            if (rest[k] === '[') { const e = matchClose(rest, k); topt = rest.slice(k + 1, e); k = e + 1; while (/\s/.test(rest[k])) k++; }
            if (rest[k] !== '{') { issue('table read from a file'); src = null; }
            else { const e = matchClose(rest, k); src = { type: 'table', opts: topt, text: rest.slice(k + 1, e) }; }
          } else if (kw && kw[1] === 'expression') {
            const b = rest.indexOf('{'), e = b >= 0 ? matchClose(rest, b) : -1;
            if (e > 0) src = { type: 'expr', text: rest.slice(b + 1, e) };
          } else if (kw && kw[1] === 'fill between') {
            let k = kw[0].length; while (/\s/.test(rest[k])) k++;
            const e = rest[k] === '[' ? matchClose(rest, k) : -1;
            if (e > 0 && !rest.slice(e + 1).trim()) src = { type: 'fill', opts: rest.slice(k + 1, e) }; else issue('\\addplot fill between not read');
          } else if (kw) issue(`\\addplot ${kw[1]} not held`);
          else if (rest[0] === '{') {
            const e = matchClose(rest, 0);
            src = { type: 'expr', text: rest.slice(1, e) };
            if (rest.slice(e + 1).trim()) issue('text after the plot expression not drawn');
          } else if (rest[0] === '(') {
            const e = matchClose(rest, 0);
            const parts = splitTop(rest.slice(1, e), ',').map(unbrace);
            src = { type: 'param', parts };
            if (rest.slice(e + 1).trim()) issue('text after the plot expression not drawn');
          } else issue('an \\addplot form not held');
          i = end + 1;
          const opts = parseOpts(optText, styles);
          plots.push({ opts, plus: plus || !hasOpts, three: name === 'addplot3', src, closed, forget: opts.some((o) => o.k === 'forget plot') });
          // a plot with nothing read still takes its place in the cycle list and the legend
          continue;
        }
        if (name === 'legend' || name === 'addlegendentry' || name === 'addlegendentryexpanded') {
          j = skipWs(j);
          if (s[j] === '[') { const e = matchClose(s, j); issue('legend entry options not held'); j = skipWs(e + 1); }
          if (s[j] !== '{') { i = j; continue; }
          const e = matchClose(s, j);
          const arg = s.slice(j + 1, e);
          if (name === 'legend') legendList = splitTop(arg, ',').map(unbrace);
          else { const p = [...plots].reverse().find((q) => !q.forget); if (p) p.legend = unbrace(arg); }
          i = e + 1;
          continue;
        }
        // TikZ drawing: held as written, drawn in the axis' coordinates (src/domain/pgfplots-annot.ts)
        if (TIKZ.has(name)) {
          const end = stmtEnd(s, j);
          annots.push({ at: plots.length, code: s.slice(bs, Math.min(end + 1, s.length)).trim() });
          i = end + 1;
          continue;
        }
        if (name === 'begin') {
          const em = /^\s*\{([^}]*)\}/.exec(s.slice(j));
          const env = em ? em[1] : '';
          const re = new RegExp(`\\\\(begin|end)\\{${env.replace(/[*]/g, '\\*')}\\}`, 'g');
          re.lastIndex = bs; let d = 0, stop = s.length, innerEnd = s.length, mm;
          while ((mm = re.exec(s))) { d += mm[1] === 'begin' ? 1 : -1; if (!d) { innerEnd = mm.index; stop = mm.index + mm[0].length; break; } }
          const whole = s.slice(bs, stop);
          if (/\\addplot/.test(whole)) {
            // a scope round plots: its plots read, its options not held
            issue(`\\begin{${env}} in the axis not held`);
            if (env === 'scope' && depth < 4) { let k = skipWs(j + em![0].length); if (s[k] === '[') k = matchClose(s, k) + 1; if (!scan(s.slice(k, innerEnd), depth + 1)) return false; }
          } else if (env === 'scope' || env === 'pgfonlayer') annots.push({ at: plots.length, code: whole.trim() });
          else { issue(`\\begin{${env}} in the axis not drawn`); if (/\\addplot/.test(whole)) unread = true; }
          i = stop;
          continue;
        }
        if (name === 'foreach') {
          // \foreach … in {…} {body} (or a statement): TikZ drawing in a loop; one round \addplot is pgfplots' own
          // business (its variable is read when the axis is drawn), not held
          // (this loop's own list, not one further on: its [options] may hold braces)
          const inM = /^(?:[^;{}[]|\[[^\]]*\])*?\bin\s*\{/.exec(s.slice(j));
          let end = s.length;
          if (inM) {
            const lb = j + inM.index + inM[0].length - 1, le = matchClose(s, lb);
            const k = le < 0 ? s.length : skipWs(le + 1);
            end = s[k] === '{' ? matchClose(s, k) : stmtEnd(s, k);
            if (end < 0) end = s.length;
          } else {
            // in \list: to the end of its body (or its statement)
            const lm = /^(?:[^;{}[]|\[[^\]]*\])*?\bin\s*\\[A-Za-z@]+\s*/.exec(s.slice(j));
            const k = lm ? j + lm[0].length : j;
            end = lm && s[k] === '{' ? matchClose(s, k) : stmtEnd(s, k);
            if (end < 0) end = s.length;
          }
          const whole = s.slice(bs, Math.min(end + 1, s.length));
          if (/\\addplot/.test(whole) || !inM) { issue('\\foreach in the axis not held'); unread = true; }
          else annots.push({ at: plots.length, code: whole.trim() });
          i = end + 1;
          continue;
        }
        if (name === 'pgfplotsinvokeforeach') {
          // pgfplots puts each item in for #1 at once: the same as the statements written out
          let k = skipWs(j);
          const ok = s[k] === '{';
          const le = ok ? matchClose(s, k) : -1, list = ok ? s.slice(k + 1, le) : '';
          k = le < 0 ? s.length : skipWs(le + 1);
          const be = s[k] === '{' ? matchClose(s, k) : -1;
          if (be < 0) { issue('\\pgfplotsinvokeforeach not read'); i = s.length; continue; }
          const items = expandItems(list);
          // (loops in loops: so many items in all, then the rest not read)
          if (!items || depth >= 4 || (loopBudget -= items.length) < 0) { issue('\\pgfplotsinvokeforeach not read'); unread = true; }
          else for (const it of items) if (!scan(s.slice(k + 1, be).replace(/#1/g, it), depth + 1)) return false;
          i = be + 1;
          continue;
        }
        // anything else (\pgfplotsset, \label, \addlegendimage, a definition …) is not held: its arguments skipped
        issue(`\\${name} in the axis not drawn`);
        if (DEFINES.has(name)) {
          let k = skipWs(j);
          if (s[k] === '{') k = matchClose(s, k) + 1; else if (s[k] === '\\') { const c = /^\\[A-Za-z@]+/.exec(s.slice(k)); k += c ? c[0].length : 2; }
          if (/^(e|g|x)?def$/.test(name)) { while (k < s.length && s[k] !== '{') k++; }
          i = skipArgs(k);
        } else i = skipArgs(j);
      }
      return true;
    };
    // \pgfplotsinvokeforeach's list: {a,b,c} or {1,...,5}
    function expandItems(t: string): string[] | null {
      const parts = splitTop(t, ',').map((x) => x.trim()).filter(Boolean);
      const out: string[] = [];
      for (let k = 0; k < parts.length; k++) {
        if (parts[k] === '...' && out.length && k + 1 < parts.length) {
          const a = out.length >= 2 ? +out[out.length - 2] : NaN, b = +out[out.length - 1], c = +parts[k + 1];
          const st = isFinite(a) ? b - a : c >= b ? 1 : -1;
          if (!isFinite(b) || !isFinite(c) || !st || (c - b) / st > 1000) return null;
          for (let v = b + st; st > 0 ? v <= c + 1e-9 : v >= c - 1e-9; v += st) out.push(String(+v.toPrecision(12)));
          k++; continue;
        }
        out.push(parts[k]);
      }
      return out;
    }
    if (!scan(body)) return null;

    // ----- axis options -----
    // a line width for the whole axis (ultra thick, line width=2pt): its axis lines, and the plots and drawing in it
    // that set none of their own
    let axisLW: number | null = null;
    for (const o of A) {
      if (o.v == null && o.k in WIDTHS) axisLW = WIDTHS[o.k] / K;
      else if (o.k === 'line width') { const w = lenPx(o.v); if (isFinite(w)) axisLW = w; }
    }
    for (const o of A) {
      if (AXIS_QUIET.has(o.k)) continue;
      if (axisLW != null && ((o.v == null && o.k in WIDTHS) || o.k === 'line width')) continue;
      if (/^(x|y|z)?mode$/.test(o.k) && o.v === 'normal') continue;
      if (/^(x|y|z)?mode$/.test(o.k)) continue; // reported above
      issue(`axis option not held: ${o.v == null ? o.k : `${o.k}=${o.v}`}`);
    }
    const shape = TD.TYPES.plot.create({ x: 0, y: 0 }, {}, 'plot:function');
    delete shape._pw; delete shape._ph;
    Object.assign(shape, { series: [], axisLines: 'box', grid: false, title: '', xlabel: '', ylabel: '', zlabel: '', legendPos: 'north east', colormap: 'hot', colorbar: false, pgfAuto: true });
    if (axisLW != null) shape.lineWidth = axisLW;
    for (const a of ['x', 'y', 'z']) for (const e of ['min', 'max']) {
      const v = get(a + e);
      if (v != null && v !== '') { const n = numOf(v, expand); if (isFinite(n)) shape[a + e] = fmt(n); else issue(`${a}${e}=${v} not read`); }
    }
    for (const k of ['title', 'xlabel', 'ylabel', 'zlabel']) { const v = get(k); if (v) shape[k] = expand(unbrace(v)).trim(); }
    // grid
    const grid = get('grid');
    if (grid === 'major' || grid === '') shape.grid = true;
    else if (grid === 'both' || grid === 'minor') { shape.grid = true; issue(`grid=${grid}: only the major grid is drawn`); }
    else if (grid != null && grid !== 'none') issue(`grid=${grid} not held`);
    const xg = has('xmajorgrids') && get('xmajorgrids') !== 'false', yg = has('ymajorgrids') && get('ymajorgrids') !== 'false';
    if (xg && yg) shape.grid = true; else if (xg || yg) { shape.grid = true; issue('a grid on one axis only: drawn on both'); }
    // hide axis (hide x axis, hide y axis, hide z axis): no axis line, ticks, tick labels or label on that axis; the
    // plots, title, legend and colour bar stay. axis x line=none is axis x line*=none and hide x axis.
    const on = (k: string) => has(k) && get(k) !== 'false';
    const hide = { x: on('hide axis') || on('hide x axis'), y: on('hide axis') || on('hide y axis'), z: on('hide axis') || on('hide z axis') };
    let lines = get('axis lines');
    // axis x line=none beside a non-boxed y line: x stays a boxed axis (its limits enlarged), and the other way round
    const lineNone: string[] = [];
    if (lines === 'none') { hide.x = hide.y = hide.z = true; lines = 'box'; }
    if (!lines && (has('axis x line') || has('axis y line'))) {
      let xl = get('axis x line'), yl = get('axis y line');
      const given = `axis x line=${xl ?? 'box'}, axis y line=${yl ?? 'box'}`;
      if (xl === 'none') { hide.x = true; xl = yl; lineNone.push('x'); }
      if (yl === 'none') { hide.y = true; yl = xl; lineNone.push('y'); }
      if (xl === 'none' && yl === 'none') xl = yl = 'box';
      lines = (xl === 'middle' || xl === 'center') && (yl === 'middle' || yl === 'center') ? 'middle' : (xl === 'bottom' || xl === 'left') && (yl === 'left' || yl === 'bottom') ? 'left' : xl === 'box' && yl === 'box' ? 'box' : 'other';
      if (lines === 'other') { issue(`${given} not held`); lines = 'box'; }
    }
    // axis line style={draw=none}: the axis lines (the box) not drawn, the ticks and labels still
    if (A.some((o) => o.k === 'axis line style' && /^\s*draw\s*=\s*none\s*$/.test(String(o.v)))) { shape.axisLineNone = true; A.splice(0, A.length, ...A.filter((o) => !(o.k === 'axis line style' && /^\s*draw\s*=\s*none\s*$/.test(String(o.v))))); }
    if (hide.x) shape.hideX = true;
    if (hide.y) shape.hideY = true;
    if (hide.z) shape.hideZ = true;
    if (A.some((o) => /^axis (x |y )?lines?\*$/.test(o.k))) issue('axis lines* (without arrow tips) drawn with arrows');
    if (lines === 'center') lines = 'middle';
    if (lines && !['box', 'left', 'middle'].includes(lines)) { issue(`axis lines=${lines} not held`); lines = 'box'; }
    shape.axisLines = lines || 'box';
    // enlargelimits: pgfplots moves automatic limits 10% out on a boxed 2D axis, not on axis lines=left/middle
    const enl = get('enlargelimits');
    let en = shape.axisLines === 'box' ? 0.1 : 0;
    if (enl != null) {
      if (enl === 'false') en = 0; else if (enl === 'true' || enl === '') en = 0.1;
      else if (isFinite(+enl)) en = +enl;
      else { issue(`enlargelimits=${enl} not held`); }
    }
    for (const a of ['x', 'y']) { const v = get(`enlarge ${a} limits`); if (v != null && v !== String(en) && !(v === 'false' && en === 0)) issue(`enlarge ${a} limits=${v} not held`); }
    shape.enlarge = en;
    // legend
    const lp = get('legend pos');
    if (lp) { if (LEGEND_POS.has(lp)) shape.legendPos = lp; else issue(`legend pos=${lp} not held`); }
    const le = get('legend entries');
    if (le != null) legendList = splitTop(le, ',').map(unbrace);
    // colours of maps
    const cmo = A.find((o) => /^colormap\//.test(o.k) || o.k === 'colormap name');
    if (cmo) {
      const nm = o2name(cmo);
      if (CMAP[nm]) shape.colormap = CMAP[nm]; else issue(`colormap ${nm} not held (drawn as hot)`);
    }
    function o2name(o: Opt) { return o.k === 'colormap name' ? String(o.v) : o.k.slice('colormap/'.length); }
    for (const o of A) if (o.k === 'colormap') issue('a colour map of its own not held');
    if (has('colorbar')) shape.colorbar = true;
    // ticks
    for (const a of ['x', 'y', 'z']) {
      const v = get(a + 'tick');
      if (v == null) continue;
      const t = v.trim();
      if (t === '' || t === '\\empty') { shape[a + 'tick'] = []; continue; }
      if (t === 'data') { shape[a + 'tick'] = 'data'; continue; }
      const list = sym[a] ? splitTop(t, ',').map((q) => symAt(a, q)) : expandList(t);
      if (list && list.some((q) => !isFinite(q))) { issue(`${a}tick=${v} not read`); continue; }
      if (list) shape[a + 'tick'] = list; else issue(`${a}tick=${v} not read`);
    }
    // xticklabels={} (or \empty): the ticks without their labels
    for (const a of ['x', 'y']) {
      const v = get(a + 'ticklabels');
      if (v == null) continue;
      if (/^\s*(\\empty)?\s*$/.test(unbrace(v))) shape[a + 'ticklabelsNone'] = true; else issue(`${a}ticklabels=${v} not held`);
    }
    if (get('ticks') === 'none') { shape.xtick = []; shape.ytick = []; shape.ztick = []; } else if (has('ticks')) issue(`ticks=${get('ticks')} not held`);
    function expandList(t: string): number[] | null {
      const parts = splitTop(t, ',').map((x) => x.trim()).filter(Boolean);
      const out: number[] = [];
      for (let k = 0; k < parts.length; k++) {
        if (parts[k] === '...' || parts[k] === '\\dots' || parts[k] === '\\ldots') {
          const a = out[out.length - 2], b = out[out.length - 1], c = numOf(parts[k + 1], expand);
          const st = out.length >= 2 ? b - a : c > b ? 1 : -1;
          if (!isFinite(b) || !isFinite(c) || !(st !== 0) || (c - b) / st > 1000) return null;
          for (let v = b + st; st > 0 ? v <= c + 1e-9 : v >= c - 1e-9; v += st) out.push(+v.toPrecision(12));
          k++; continue;
        }
        const n = numOf(parts[k], expand);
        if (!isFinite(n)) return null;
        out.push(n);
      }
      return out;
    }
    // view
    const view = get('view');
    if (view) { const m = /^\{?([^{}]*)\}?\s*\{([^{}]*)\}$/.exec(view.trim()); const h = m ? numOf(m[1], expand) : NaN, v = m ? numOf(m[2], expand) : NaN; if (isFinite(h) && isFinite(v)) shape.view = [h, v]; else issue(`view=${view} not read`); }
    // marks: mark size is 2pt in the plot
    const ms = get('mark size');
    if (ms != null && Math.abs(lenPx(ms) * K - 2) > 0.05) issue(`mark size=${ms} drawn at 2pt`);

    // ----- styles every plot takes -----
    // (\pgfplotsset's every axis plot and every axis plot post first, then the axis' own; /.style starts them again)
    const everyPre: Opt[] = parseOpts(styles?.get('pgfplots:every axis plot') || '', styles), everyPost: Opt[] = parseOpts(styles?.get('pgfplots:every axis plot post') || '', styles);
    for (const o of A) {
      if (o.k === 'every axis plot/.style') everyPre.length = 0;
      if (o.k === 'every axis plot post/.style') everyPost.length = 0;
      if ((o.k === 'every axis plot/.append style' || o.k === 'every axis plot/.style') && o.v) everyPre.push(...parseOpts(o.v, styles));
      if ((o.k === 'every axis plot post/.append style' || o.k === 'every axis plot post/.style') && o.v) everyPost.push(...parseOpts(o.v, styles));
    }
    // \pgfplotsset's other every … styles (the legend, labels, tick labels …) change what pgfplots draws: not held
    if (styles) for (const [k, v] of styles) if (/^pgfplots:every /.test(k) && !/^pgfplots:every axis( plot( post)?)?$/.test(k) && String(v ?? '').trim()) issue(`\\pgfplotsset{${k.slice('pgfplots:'.length)}} not held`);
    if (has('no markers') || has('no marks')) everyPost.push({ k: 'mark', v: 'none' });
    if (has('smooth')) everyPre.push({ k: 'smooth', v: null });
    const ybarAxis = has('ybar');
    if (has('xbar')) issue('xbar (horizontal bars) not held');
    let cycle = ybarAxis ? CYCLE.bar : CYCLE.color;
    const cl = get('cycle list name');
    if (cl) { if (CYCLE[cl]) cycle = CYCLE[cl]; else if (cl !== 'color') issue(`cycle list name=${cl} not held (default colours used)`); }
    const cyl = get('cycle list');
    if (cyl != null) {
      const entries = (/\\\\/.test(cyl) ? cyl.split('\\\\') : splitTop(cyl, ',').map((x) => unbrace(x))).map((x) => x.trim()).filter(Boolean);
      if (entries.length) cycle = entries; else issue('cycle list not read');
    }
    const domainAxis = get('domain'), samplesAxis = get('samples'), ydomAxis = get('y domain');
    let barW = 10 / K;
    const bwA = get('bar width');
    if (bwA) { const b = lenPx(bwA); if (isFinite(b)) barW = b; else issue(`bar width=${bwA} not read`); }
    if (ybarAxis) { const g = get('ybar'); const gap = g ? lenPx(g) : 2 / K; shape.barGap = isFinite(gap) ? gap : 2 / K; }

    // ----- each plot as a series -----
    let ci = 0;
    const series: any[] = [];
    const legends: { ser: any, p: P }[] = [];
    const DOM = (d: string | null | undefined) => { const q = d ? splitTop(d, ':') : null; return q && q.length === 2 ? [q[0].trim(), q[1].trim()] : null; };
    const seriesAt: number[] = []; // series made from the plots before plot k
    for (const p of plots) {
      seriesAt.push(series.length);
      const idx = ci; if (!p.forget) ci++;
      // option list: cycle entry (no options, or \addplot+), every axis plot, own options, every axis plot post
      const list: Opt[] = [];
      if (p.plus) list.push(...parseOpts(cycle[idx % cycle.length], styles));
      list.push(...everyPre, ...p.opts, ...everyPost);
      const st: Record<string, any> = { color: '#000000', fill: null, width: axisLW ?? 0.4 / K, dash: 'solid', mark: 'none', smooth: false, only: false, bar: ybarAxis, domain: DOM(domainAxis), samples: samplesAxis, ydomain: DOM(ydomAxis), opacity: 1, fillOpacity: null, variable: 'x', drawNone: false };
      for (const o of list) {
        const k = o.k, v = o.v;
        if (v == null && isColor(k)) { st.color = color(k); continue; }
        if (v == null && k in WIDTHS) { st.width = WIDTHS[k] / K; continue; }
        if (v == null && k in DASHES) { st.dash = DASHES[k]; if (/densely|loosely/.test(k)) st.dashNote = k; continue; }
        switch (k) {
          case 'color': case 'draw': {
            if (k === 'draw') st.drawGiven = true;
            if (v === 'none') { st.drawNone = true; break; }
            const c = color(v); if (typeof c === 'string') st.color = c; else issue(`${k}=${v} not read`); break;
          }
          case 'fill': { if (v == null) { st.fill = 'same'; break; } if (v === 'none') { st.fill = 'none'; break; } const c = color(v); if (typeof c === 'string') st.fill = c; else issue(`fill=${v} not read`); break; }
          case 'line width': { const w = lenPx(v); if (isFinite(w)) st.width = w; else issue(`line width=${v} not read`); break; }
          case 'mark': st.mark = v === 'none' || v === '' ? 'none' : String(v).trim(); break;
          case 'no marks': case 'no markers': st.mark = 'none'; break;
          case 'only marks': st.only = true; break;
          case 'smooth': st.smooth = true; break;
          case 'sharp plot': st.smooth = false; break;
          case 'domain': { const d = DOM(v); if (d) st.domain = d; else issue(`domain=${v} not read`); break; }
          case 'y domain': { const d = DOM(v); if (d) st.ydomain = d; else issue(`y domain=${v} not read`); break; }
          case 'samples': st.samples = v; break;
          case 'samples y': st.samplesY = v; break;
          case 'variable': st.variable = String(v).replace(/^\\/, '').trim(); break;
          case 'ybar': st.bar = true; break;
          case 'bar width': { const b = lenPx(v); if (isFinite(b)) st.barWidth = b; else issue(`bar width=${v} not read`); break; }
          case 'opacity': st.opacity = numOf(v, expand); break;
          case 'fill opacity': st.fillOpacity = numOf(v, expand); break;
          case 'draw opacity': issue('draw opacity not held'); break;
          case 'mark options': if (!/^\s*\{?\s*(solid|fill=[^,]*|solid\s*,\s*fill=[^,]*)?\s*\}?\s*$/.test(v || '')) issue(`mark options=${v} not held`); break;
          case 'mark size': if (Math.abs(lenPx(v) * K - 2) > 0.05) issue(`mark size=${v} drawn at 2pt`); break;
          case 'every mark/.append style': break; // the cycle list's darker mark fill
          case 'name path': case 'name path global': st.namePath = unbrace(String(v ?? '')).trim(); break;
          case 'forget plot': case 'filter discard warning': case 'z buffer': case 'unbounded coords': case 'line join': case 'line cap': case 'mark repeat': case 'thin': break;
          case 'surf': st.surf = 'surface'; break;
          case 'mesh': st.surf = 'mesh'; break;
          case 'shader': if (v !== 'faceted' && v !== 'flat') issue(`shader=${v} not held`); break;
          case 'samples at': issue('samples at not held'); break;
          case 'trig format plots': if (v === 'rad') st.rad = true; break;
          default:
            if (/^colormap\//.test(k)) { const nm = k.slice(9); if (CMAP[nm]) shape.colormap = CMAP[nm]; else issue(`colormap ${nm} not held`); break; }
            issue(`plot option not held: ${v == null ? k : `${k}=${v}`}`);
        }
      }
      if (st.mark !== 'none' && !MARK_OK.has(st.mark)) { issue(`mark=${st.mark} drawn as ${MARK_NEAR[st.mark] || '*'}`); st.mark = MARK_NEAR[st.mark] || '*'; }
      if (st.dashNote) issue(`${st.dashNote} drawn ${st.dash}`);
      const deg = !(radTrig || st.rad);
      const ser = TD.newSeries({ color: st.color, width: st.width, dash: st.dash, mark: st.mark, legend: '', opacity: isFinite(st.opacity) ? st.opacity : 1 });
      if (st.drawNone && !(st.fill && st.fill !== 'none')) { /* an invisible plot */ }
      const domain = st.domain || ['-5', '5'];
      const samples = st.samples != null ? Math.round(numOf(st.samples, expand)) : 25;
      if (!(samples >= 2)) issue(`samples=${st.samples} not read`);
      ser.domain = domain.map((d: string) => { const n = numOf(d, expand); return isFinite(n) ? fmt(n) : d; });
      ser.samples = samples >= 2 ? samples : 25;
      const src = p.src;
      let kind = 'line';
      if (!src) { issue('a plot not read'); continue; }
      if (st.namePath) ser.namePath = st.namePath;
      if (src.type === 'fill') {
        // fill between[of=A and B, soft clip={domain=a:b}, reverse=…]: every fill between plot is fill (the plot's
        // colour, or its fill=), no line unless draw= says so, under the plots (src/domain/plots.ts, fillBetween)
        const fo = parseOpts(src.opts), g = (k: string) => { const f = fo.find((o) => o.k === k); return f ? f.v ?? '' : undefined; };
        const of = /^\s*(.+?)\s+and\s+(.+?)\s*$/.exec(unbrace(g('of') || ''));
        const ref = (nm: string) => (plots.some((q) => q.opts.some((o) => /^name path( global)?$/.test(o.k) && unbrace(String(o.v ?? '')).trim() === nm)) ? nm : pathPts(nm));
        const A = of && ref(of[1].trim()), B = of && ref(of[2].trim());
        if (!A || !B) { issue('fill between: a path it names not read'); continue; }
        let clip: number[] | null = null, clipY: number[] | null = null;
        const sc = g('soft clip');
        if (sc != null) for (const o of parseOpts(unbrace(sc))) {
          const d = DOM(o.v), n = d ? d.map((q) => numOf(q, expand)) : null;
          if ((o.k === 'domain' || o.k === 'domain y') && n && n.every(isFinite)) { if (o.k === 'domain') clip = n; else clipY = n; } else issue(`soft clip ${o.k} not held`);
        }
        const rv = g('reverse');
        for (const o of fo) if (!['of', 'soft clip', 'reverse'].includes(o.k)) issue(`fill between ${o.k} not held`);
        if (rv != null && !['', 'true', 'false', 'auto'].includes(rv)) issue(`fill between reverse=${rv} not held`);
        Object.assign(ser, { kind: 'fill', of: [A, B], clip, clipY, reverse: rv == null || rv === 'auto' ? 'auto' : rv === 'false' ? 'false' : 'true', fill: st.fill && st.fill !== 'same' && st.fill !== 'none' ? st.fill : st.color, stroke: !!st.drawGiven && !st.drawNone, mark: 'none' });
        if (st.fillOpacity != null) ser.fillOpacity = st.fillOpacity;
        if (p.legend || (legendList && !p.forget)) issue('a fill between in the legend not held');
        // (drawn as pgfplots draws it; the plot's series list has no row for it yet, so the axis stays code)
        issue('fill between is drawn but not editable in the plot');
        series.push(ser); legends.push({ ser, p });
        continue;
      }
      if (p.three) {
        if (src.type === 'expr') {
          const e = pgfExpr(src.text, deg, ['x', 'y'], fx);
          if (e.error) issue(`expression not read: ${e.error}`);
          kind = st.surf || 'surface';
          if (!st.surf) issue('\\addplot3 without surf/mesh drawn as a surface');
          Object.assign(ser, { kind, source: 'expr', expr: e.expr, ydomain: (st.ydomain || domain).map((d: string) => { const n = numOf(d, expand); return isFinite(n) ? fmt(n) : d; }) });
        } else if (src.type === 'param' && src.parts.length === 3) {
          const curve = st.samplesY != null && numOf(st.samplesY, expand) === 0;
          const v = st.variable;
          const E = src.parts.map((q: string) => pgfExpr(q.replace(/\\([xy])(?![A-Za-z@])/g, '$1').replace(new RegExp(`(?<![A-Za-z_])${v}(?![A-Za-z_0-9])`, 'g'), curve ? 't' : 'u').replace(/(?<![A-Za-z_])y(?![A-Za-z_0-9])/g, 'v'), deg, curve ? ['x', 't'] : ['x', 'y', 'u', 'v'], fx));
          // the plot's own evaluator checks them again with its variables
          for (const e of E) if (e.error && !/Unknown name/.test(e.error)) issue(`expression not read: ${e.error}`);
          kind = curve ? 'curve3d' : 'param3d';
          Object.assign(ser, { kind, source: 'expr', expr: E[0].expr, expr2: E[1].expr, expr3: E[2].expr, ydomain: (st.ydomain || domain).map((d: string) => { const n = numOf(d, expand); return isFinite(n) ? fmt(n) : d; }) });
          if (!curve && !st.surf) issue('a parametric \\addplot3 without surf drawn as a surface');
        } else if (src.type === 'coords') {
          const pts = coordList(src.text, 3);
          if (!pts) { issue('coordinates not read'); continue; }
          kind = 'scatter3d';
          if (!st.only) issue('a 3D line through points drawn as points');
          Object.assign(ser, { kind, source: 'data', data: pts.map((q) => q.map(fmt).join(' ')).join('\n'), mark: st.mark === 'none' ? '*' : st.mark });
        } else { issue('an \\addplot3 form not held'); continue; }
        shape.dim = 3;
      } else if (src.type === 'expr') {
        const e = pgfExpr(src.text, deg, ['x'], fx);
        if (e.error) issue(`expression not read: ${e.error}`);
        Object.assign(ser, { source: 'expr', expr: e.expr });
      } else if (src.type === 'param') {
        if (src.parts.length !== 2) { issue('a parametric plot not read'); continue; }
        const v = st.variable;
        const E = src.parts.map((q: string) => pgfExpr(q.replace(new RegExp(`\\\\${v}(?![A-Za-z@])`, 'g'), v).replace(new RegExp(`(?<![A-Za-z_])${v}(?![A-Za-z_0-9])`, 'g'), 't'), deg, ['t'], fx));
        for (const e of E) if (e.error) issue(`expression not read: ${e.error}`);
        kind = 'param';
        Object.assign(ser, { kind, source: 'expr', expr: E[0].expr, expr2: E[1].expr });
      } else {
        const pts = src.type === 'coords' ? coordList(src.text, 2) : tableList(src.opts, src.text);
        if (!pts || !pts.length) { issue(src.type === 'coords' ? 'coordinates not read' : 'table not read'); continue; }
        Object.assign(ser, { source: 'data', data: pts.map((q) => q.map(fmt).join(' ')).join('\n') });
        const sorted = pts.every((q, k) => !k || q[0] >= pts[k - 1][0]);
        if (!sorted && !st.only && !st.bar) issue('a line through points not in x order (drawn sorted)');
        if (st.smooth && !st.only) issue('smooth through points drawn straight');
        ser._pts = pts;
      }
      if (!p.three) {
        if (st.bar) {
          kind = 'bar';
          ser.barWidth = st.barWidth || barW;
          if (src.type === 'param') issue('bars of a parametric plot not held');
          // pgfplots draws bars with the line colour round the fill colour (no fill: outlined)
          ser.fill = st.fill === 'same' ? st.color : st.fill || 'none';
          if (st.mark !== 'none') issue('marks on bars not drawn');
          ser.mark = 'none';
        } else if (st.only) {
          kind = 'scatter';
          if (st.mark === 'none') { ser.mark = '*'; }
          if (src.type === 'param') issue('only marks on a parametric plot drawn as a line');
          if (p.closed) issue('\\closedcycle with only marks not held');
        } else if (p.closed) {
          if (src.type === 'param') issue('\\closedcycle of a parametric plot not held');
          else kind = 'area';
          const fc = st.fill === 'same' ? st.color : st.fill;
          if (!fc || fc === 'none') issue('\\closedcycle without a fill: drawn filled');
          else ser.fill = fc;
          if (st.fillOpacity != null) ser.fillOpacity = st.fillOpacity;
          if (st.drawNone) ser.width = 0;
        } else if (st.fill && st.fill !== 'none') issue('a filled plot without \\closedcycle not held');
        if (st.smooth && src.type !== 'coords' && src.type !== 'table' && ser.samples < 40) issue('smooth with few samples drawn straight');
        if (st.drawNone && kind !== 'area') { if (kind === 'line' && ser.mark === 'none') ser.drawNone = true; else issue('draw=none not held'); }
        if (kind === 'param' && st.mark !== 'none') issue('marks on a parametric plot not drawn');
        ser.kind = kind;
      }
      delete ser._pts;
      series.push(ser);
      legends.push({ ser, p });
    }
    seriesAt.push(series.length);
    shape.series = series;
    if (unread || series.length < plots.length) shape.pgfUnread = true;
    // legend entries: \legend{…} / legend entries go to the plots in order (forget plot ones skipped); an empty
    // entry is no entry
    const live = legends.filter((q) => !q.p.forget);
    if (legendList) legendList.forEach((t, k) => { if (live[k] && t) live[k].ser.legend = t; });
    for (const q of legends) if (q.p.legend != null && !legendList) q.ser.legend = q.p.legend;
    if (legendList && legendList.length > live.length) issue('more legend entries than plots');

    // ----- ticks at the data -----
    for (const a of ['x', 'y']) if (shape[a + 'tick'] === 'data') {
      const v = new Set<number>();
      for (const ser of series) if (ser.source === 'data') for (const line of String(ser.data).split('\n')) { const q = line.split(/\s+/).map(Number); if (isFinite(q[a === 'x' ? 0 : 1])) v.add(q[a === 'x' ? 0 : 1]); }
      shape[a + 'tick'] = [...v].sort((p, q) => p - q);
    }

    // ----- size and place -----
    const W0 = 240 / K, H0 = 207 / K;
    const wo = get('width'), ho = get('height');
    let W = wo ? lenPx(wo) : NaN, H = ho ? lenPx(ho) : NaN;
    if (wo && !isFinite(W)) issue(`width=${wo} not read`);
    if (ho && !isFinite(H)) issue(`height=${ho} not read`);
    // one of them given: pgfplots scales the other by the default ratio
    if (isFinite(W) && !isFinite(H)) H = (W * H0) / W0;
    else if (!isFinite(W) && isFinite(H)) W = (H * W0) / H0;
    else if (!isFinite(W)) { W = W0; H = H0; }
    // pgfplots takes 45pt off both for the tick labels and axis labels, unless scale only axis
    const only = has('scale only axis') && get('scale only axis') !== 'false';
    shape.w = only ? W : W - 45 / K; shape.h = only ? H : H - 45 / K;
    if (!(shape.w > 10 && shape.h > 10)) { issue('axis too small to draw'); shape.w = Math.max(shape.w, 40); shape.h = Math.max(shape.h, 40); }
    // x=…, y=… unit lengths, axis equal image: the box follows the limits
    const L0 = () => plotLimits(shape);
    // (pgfplots' every non boxed … axis turns enlargement off for that direction only: a hidden boxed one keeps its 10%
    // on each automatic limit, written as limits)
    if (shape.axisLines !== 'box' && shape.dim !== 3 && enl == null && lineNone.length < 2) {
      const L = L0();
      if (!L.cleared) for (const a of lineNone) {
        if (get(`enlarge ${a} limits`) != null) continue;
        const sp = L[a + 'max'] - L[a + 'min'], auto = (e: string) => shape[a + e] == null || String(shape[a + e]).trim() === '';
        const lo = auto('min') ? L[a + 'min'] - 0.1 * sp : null, hi = auto('max') ? L[a + 'max'] + 0.1 * sp : null;
        if (lo != null) shape[a + 'min'] = fmt(lo);
        if (hi != null) shape[a + 'max'] = fmt(hi);
      }
    }
    const ux = get('x'), uy = get('y');
    if ((ux || uy) && shape.dim !== 3) {
      const L = L0();
      if (ux) { const u = lenPx(ux, 'cm'); if (isFinite(u)) shape.w = u * (L.xmax - L.xmin); else issue(`x=${ux} not read`); }
      if (uy) { const u = lenPx(uy, 'cm'); if (isFinite(u)) shape.h = u * (L.ymax - L.ymin); else issue(`y=${uy} not read`); }
    }
    // axis equal, axis equal image, unit vector ratio(*)=rx ry: the units in that ratio (pgfplots.scaling.code.tex),
    // the longer one shortened. With keep size (axis equal; unit vector ratio unless both limits of the direction are
    // declared) the box stays and that direction's limits widen: half each side when both are automatic, all on the
    // automatic side when one is, half each side when both are declared; else the box shrinks.
    {
      let ratio: number[] | null = null, keep: 'yes' | 'no' | 'auto' = 'auto';
      if (has('axis equal') && get('axis equal') !== 'false') { ratio = [1, 1]; keep = 'yes'; }
      if (has('axis equal image') && get('axis equal image') !== 'false') { ratio = [1, 1]; keep = 'no'; }
      for (const k of ['unit vector ratio', 'unit vector ratio*']) {
        const v = get(k);
        if (v == null) continue;
        const r = unbrace(v).trim().split(/\s+/).map((q) => numOf(q, expand));
        if (!(r.length >= 2 && r[0] > 0 && r[1] > 0)) { if (unbrace(v).trim()) issue(`${k}=${v} not read`); ratio = null; continue; }
        ratio = r; keep = k.endsWith('*') ? 'no' : 'auto';
      }
      if (ratio && shape.dim === 3) issue('unit vector ratio in 3D not held');
      else if (ratio) {
        const L = L0(), sx = L.xmax - L.xmin, sy = L.ymax - L.ymin;
        const k = Math.min(shape.w / (sx * ratio[0]), shape.h / (sy * ratio[1]));
        const ux = k * ratio[0], uy = k * ratio[1];
        const a = shape.w / sx > ux * (1 + 1e-9) ? 'x' : shape.h / sy > uy * (1 + 1e-9) ? 'y' : null;
        if (a) {
          const declared = (e: string) => shape[a + e] != null && String(shape[a + e]).trim() !== '';
          const both = declared('min') && declared('max');
          if (keep === 'no' || (keep === 'auto' && both)) { if (a === 'x') shape.w = ux * sx; else shape.h = uy * sy; }
          else {
            const lo = L[a + 'min'], hi = L[a + 'max'], want = (a === 'x' ? shape.w / ux : shape.h / uy) - (hi - lo);
            const dmin = declared('min'), dmax = declared('max');
            const [nlo, nhi] = dmin && !dmax ? [lo, hi + want] : dmax && !dmin ? [lo - want, hi] : [lo - want / 2, hi + want / 2];
            shape[a + 'min'] = fmt(nlo); shape[a + 'max'] = fmt(nhi);
          }
        }
      }
    }
    // xtick distance=d: every multiple of d within the limits
    for (const a of ['x', 'y']) {
      const dv = get(a + 'tick distance');
      if (dv == null || has(a + 'tick')) continue;
      const d = numOf(dv, expand), L = L0();
      if (!(d > 0) || (L[a + 'max'] - L[a + 'min']) / d > 200) { issue(`${a}tick distance=${dv} not read`); continue; }
      const out: number[] = [];
      for (let v = Math.ceil(L[a + 'min'] / d - 1e-9) * d; v <= L[a + 'max'] + d * 1e-9; v += d) out.push(+v.toPrecision(12));
      shape[a + 'tick'] = out;
    }
    // at= and anchor= place the axis box (default: its south west corner at the origin)
    let at = { x: 0, y: 0 };
    const atv = get('at');
    if (atv) {
      const t = unbrace(atv).replace(/^\(([\s\S]*)\)$/, '$1').trim();
      const c = helpers.coord ? helpers.coord(t) : null;
      if (c && isFinite(c.x) && isFinite(c.y)) at = c; else issue(`at=${atv} not read`);
    }
    const anc = (get('anchor') || 'south west').trim();
    const AN: Record<string, [number, number]> = { 'south west': [0, 1], 'south east': [1, 1], 'north west': [0, 0], 'north east': [1, 0], south: [0.5, 1], north: [0.5, 0], west: [0, 0.5], east: [1, 0.5], center: [0.5, 0.5] };
    let fr = AN[anc];
    if (!fr) { issue(`anchor=${anc} placed as south west`); fr = AN['south west']; }
    shape.x = at.x - fr[0] * shape.w; shape.y = at.y - fr[1] * shape.h;
    // xshift= and yshift= move the axis
    for (const [k, d] of [['xshift', 'x'], ['yshift', 'y']]) {
      const v = get(k);
      if (v == null) continue;
      const n = lenPx(v);
      if (isFinite(n)) shape[d] += d === 'x' ? n : -n; else issue(`${k}=${v} not read`);
    }
    if (shape.dim === 3) shape.enlarge = has('enlargelimits') ? en : 0.1; // 3D: only z, automatically

    const nm = get('name');
    if (nm) shape.name = unbrace(nm).trim();
    // the compat level's label places: before 1.3 (pgfplots' 'default', no compat set) xlabel and ylabel absolute,
    // before 1.8 a middle axis' labels at its ends (the export writes compat=1.18: kept as code)
    const labelled = !!(shape.xlabel && !shape.hideX) || !!(shape.ylabel && !shape.hideY);
    // (label styles of the axis' own move them again: not held, drawn where they would be from 1.8)
    const labelStyled = A.some((o) => /^(x|y)?label style$|^every axis (x |y )?label/.test(o.k));
    if (compat < 1.08 && shape.dim !== 3 && labelled && !labelStyled && (shape.axisLines === 'middle' || compat < 1.03)) {
      shape.labelCompat = compat < 1.03 ? 'pre1.3' : 'pre1.8';
      issue(`axis labels placed as compat=${styles?.get(COMPAT) ?? ''} places them`);
    }
    for (const a of ['x', 'y']) if (sym[a]) {
      shape[a + 'sym'] = sym[a];
      if (shape[a + 'tick'] == null) issue(`symbolic ${a} coords with automatic ticks not held`);
    }
    // ----- TikZ drawing in the axis -----
    if (annots.length) {
      if (shape.dim === 3) issue('TikZ drawing in a 3D axis not drawn');
      else {
        // a statement in pgfplots' internal units or in lengths from the box' corner is not drawn here
        const held = annots.filter((a) => {
          const w = TD.pgfAnnot.annotIssues(a.code, compat) as string[];
          for (const q of w) issue(q);
          return !w.some((q) => /^(plain coordinates|a point in lengths|a 3D point|a circle's radius|an arc's radius|a radius in axis units)/.test(q));
        });
        shape.annot = held.map((a) => ({ at: seriesAt[a.at] ?? series.length, code: a.code }));
        const all = held.map((a) => a.code).join('\n');
        shape.annotDefs = TD.pgfAnnot.annotDefs(all, helpers.ctx || { styles });
        if (get('clip') === 'false' || get('clip mode') === 'individual') shape.annotClip = false;
        const L = plotLimits(shape);
        // no data and a limit not given: pgfplots clears the axis, its drawing too
        if (L.cleared) issue('TikZ drawing in an axis with no data (pgfplots clears it)');
        // (in lower case: what the importer could not place does not stop the axis' preview)
        else for (const w of TD.pgfAnnot.annotShapes(shape, L).issues) issue(`in the axis: ${String(w).replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/layout not evaluated/g, 'layout not worked out')}`);
      }
    }
    return { shape, issues };

    // ----- data readers -----
    // a straight \path[name path=n] (axis cs:…) -- (axis cs:…) … in the axis: its points
    function pathPts(nm: string): number[][] | null {
      for (const a of annots) {
        const m = /^\\(?:path|draw)\s*\[([^\]]*)\]\s*([\s\S]*?);?\s*$/.exec(a.code);
        if (!m || !parseOpts(m[1]).some((o) => /^name path( global)?$/.test(o.k) && unbrace(String(o.v ?? '')).trim() === nm)) continue;
        const pts: number[][] = [];
        for (const q of m[2].split(/\s*--\s*/)) {
          const c = /^\(\s*(axis cs\s*:)?([^()]*)\)$/.exec(q.trim());
          if (!c || (!c[1] && compat < 1.11)) return null;
          const v = splitTop(c[2], ',').map((x) => numOf(x, expand));
          if (v.length !== 2 || !v.every(isFinite)) return null;
          pts.push(v);
        }
        return pts.length >= 2 ? pts : null;
      }
      return null;
    }
    function coordList(text: string, n: number): number[][] | null {
      const out: number[][] = [];
      const t = expand(text);
      if (/\+-|\[\s*[^\]]*\]/.test(t)) { issue('error bars or point meta not held'); }
      for (const m of t.matchAll(/\(([^()]*)\)/g)) {
        const q = splitTop(m[1], ',').map((x, k) => (k < 2 && sym['xy'[k]] ? symAt('xy'[k], x) : numOf(x, (v: string) => v)));
        if (q.length < n || !q.slice(0, n).every((x) => isFinite(x))) { if (/nan|inf/i.test(m[1])) continue; return null; }
        out.push(q.slice(0, n));
      }
      return out;
    }
    function tableList(optText: string, text: string): number[][] | null {
      const o = parseOpts(optText);
      const g = (k: string) => { const f = o.find((q) => q.k === k); return f ? f.v : undefined; };
      let rows = String(text);
      const rs = g('row sep');
      rows = rs && /\\\\/.test(rs) ? rows.replace(/\\\\/g, '\n') : rows.replace(/\\\\/g, '\n');
      const sep = g('col sep');
      const split = (l: string) => (sep === 'comma' ? l.split(',') : sep === 'semicolon' ? l.split(';') : sep === '&' || sep === 'ampersand' ? l.split('&') : l.trim().split(/\s+/)).map((x) => x.trim());
      const lines = rows.split('\n').map((l) => l.trim()).filter(Boolean).map(split);
      if (!lines.length) return null;
      const header = g('header') === 'false' || lines[0].every((x) => isFinite(+x)) ? null : lines.shift()!;
      const col = (key: string, idxKey: string, def: number) => {
        const nm = g(key), ix = g(idxKey);
        if (ix != null) return +ix;
        if (nm != null) {
          const mm = /^\\thisrow\{([^}]*)\}$/.exec(nm.trim());
          const name = mm ? mm[1] : nm.trim();
          if (header && header.includes(name)) return header.indexOf(name);
          if (/^\d+$/.test(name)) return +name;
          issue(`table column ${nm} not read`); return -1;
        }
        return def;
      };
      for (const q of o) if (!['x', 'y', 'x index', 'y index', 'row sep', 'col sep', 'header'].includes(q.k)) issue(`table option not held: ${q.k}`);
      const xi = col('x', 'x index', 0), yi = col('y', 'y index', 1);
      if (xi < 0 || yi < 0) return null;
      const out: number[][] = [];
      for (const l of lines) { const x = sym.x ? symAt('x', l[xi] ?? '') : +l[xi], y = sym.y ? symAt('y', l[yi] ?? '') : +l[yi]; if (isFinite(x) && isFinite(y)) out.push([x, y]); else if (!/nan|inf/i.test(l.join(' '))) return null; }
      return out;
    }
  }

  // ---------- \begin{groupplot} ----------
  // pgfplots' groupplots library (tikzlibrarypgfplots.groupplots.code.tex): each \nextgroupplot[…] an axis with the
  // group's options then its own, named '<group name> c<column>r<row>'; c1r1's box south west at the origin, the
  // next in a row at the east of the one before plus horizontal sep (anchor west), a later row's under the one above
  // less vertical sep (anchor north); xlabels at / xticklabels at = edge bottom and ylabels at / yticklabels at = edge
  // left leave the labels on the outer cells only. Always kept as code (the plots its preview).
  function fromGroup(optStr: string, body: string, helpers: Record<string, any> = {}) {
    const issues: string[] = ['\\begin{groupplot} is kept as code'];
    const issue = (m: string) => { if (!issues.includes(m)) issues.push(m); };
    const lenPx = (v: any) => { const n = helpers.len ? helpers.len(docLengths(v, helpers.styles), 'cm') : NaN; return isFinite(n) ? n : NaN; };
    let G: Record<string, string> = {};
    const own: string[] = [];
    for (const raw of splitTop(optStr, ',')) {
      const t = raw.trim();
      if (!t) continue;
      const eq = splitTop(t, '='), k = eq[0].trim().replace(/\s+/g, ' ');
      if (k === 'group style' && eq.length > 1) { for (const o of parseOpts(unbrace(eq.slice(1).join('=')))) G[o.k.replace(/^\/pgfplots\/group\//, '')] = o.v ?? ''; continue; }
      own.push(t);
    }
    const desc = (k: string, a: string) => { const d = G[`${a} descriptions at`]; return G[k] ?? d ?? 'all'; };
    const size = /^\s*(\d+)\s+by\s+(\d+)\s*$/.exec(G['group size'] || '1 by 1');
    const cols = size ? +size[1] : 1, rows = size ? +size[2] : 1;
    if (!size) issue(`group size=${G['group size']} not read`);
    const hsep = G['horizontal sep'] != null ? lenPx(G['horizontal sep']) : PX, vsep = G['vertical sep'] != null ? lenPx(G['vertical sep']) : PX;
    if (!isFinite(hsep) || !isFinite(vsep)) issue('horizontal sep or vertical sep not read');
    const name = (G['group name'] ?? 'group').trim();
    for (const k of Object.keys(G)) if (!['group size', 'horizontal sep', 'vertical sep', 'group name', 'xlabels at', 'ylabels at', 'xticklabels at', 'yticklabels at', 'x descriptions at', 'y descriptions at'].includes(k)) issue(`group style ${k} not held`);
    const at = { x: desc('xlabels at', 'x'), xt: desc('xticklabels at', 'x'), y: desc('ylabels at', 'y'), yt: desc('yticklabels at', 'y') };
    for (const [k, v] of Object.entries(at)) if (!['all', 'edge bottom', 'edge left'].includes(v)) issue(`${k} at=${v} not held`);
    // the cells
    const parts: { opt: string, body: string }[] = [];
    const re = /\\nextgroupplot\b/g;
    let m: RegExpExecArray | null, prev: { opt: string, start: number } | null = null;
    const close = (end: number) => { if (prev) parts.push({ opt: prev.opt, body: body.slice(prev.start, end) }); };
    while ((m = re.exec(body))) {
      // (a \nextgroupplot inside braces is some other code's)
      let d = 0; for (let k = 0; k < m.index; k++) { if (body[k] === '\\') { k++; continue; } if (body[k] === '{') d++; else if (body[k] === '}') d--; }
      if (d) continue;
      close(m.index);
      let k = m.index + m[0].length; while (/\s/.test(body[k])) k++;
      let opt = '';
      if (body[k] === '[') { const e = matchClose(body, k); if (e < 0) return null; opt = body.slice(k + 1, e); k = e + 1; }
      prev = { opt, start: k };
    }
    close(body.length);
    if (!parts.length) return null;
    if (parts.length > cols * rows) issue('more \\nextgroupplot than the group size');
    const shapes: any[] = [], grid: any[][] = [];
    parts.slice(0, cols * rows).forEach((p, k) => {
      const c = (k % cols) + 1, r = Math.floor(k / cols) + 1;
      const hide: string[] = [];
      if (at.x === 'edge bottom' && r < rows) hide.push('xlabel={}');
      if (at.xt === 'edge bottom' && r < rows) hide.push('xticklabels={}');
      if (at.y === 'edge left' && c > 1) hide.push('ylabel={}');
      if (at.yt === 'edge left' && c > 1) hide.push('yticklabels={}');
      const R = fromAxis('axis', [...own, ...hide, p.opt].filter(Boolean).join(','), p.body, helpers);
      if (!R) { issue(`cell c${c}r${r} not read`); return; }
      for (const w of R.issues) issue(`c${c}r${r}: ${w}`);
      const q = R.shape;
      q.name = `${name} c${c}r${r}`;
      if (r === 1 && c === 1) { q.x = 0; q.y = -q.h; }
      else if (r === 1) { const L = grid[1]?.[c - 1]; if (!L) return; q.x = L.x + L.w + hsep; q.y = L.y + L.h / 2 - q.h / 2; }
      else { const U = grid[r - 1]?.[c]; if (!U) return; q.x = U.x + U.w / 2 - q.w / 2; q.y = U.y + U.h + vsep; }
      (grid[r] ||= [])[c] = q;
      shapes.push(q);
    });
    return { shape: null, shapes, issues };
  }

  // ---------- \pgfplotsset and the document ----------
  // \pgfplotsset{…} keeps its keys with the picture's styles (so a picture's own ends with it): name/.style and
  // /.append style as pgfplots styles ('pgfplots:' + name), compat= as the compat level, every other key, in order, as
  // settings every axis reads before its own options
  function pgfplotsset(styles: Map<string, string>, arg: string) {
    const m = /^\s*\{([\s\S]*)\}\s*;?\s*$/.exec(arg);
    if (!m) return;
    let dir = '/pgfplots';
    const keep: string[] = [];
    for (const raw of splitTop(m[1], ',')) {
      const x = raw.trim();
      if (!x) continue;
      const eq = splitTop(x, '=');
      let k = eq[0].trim().replace(/\s+/g, ' ');
      const v = eq.length > 1 ? eq.slice(1).join('=').trim() : null;
      if (k.endsWith('/.cd')) { dir = k.slice(0, -4) || '/'; continue; }
      if (!k.startsWith('/')) k = `${dir}/${k}`;
      // /pgf/number format/… changes the tick labels: kept, so the axis reports it; TikZ's own keys are not the axis'
      if (k.startsWith('/pgf/')) { keep.push(v == null ? k : `${k}=${v}`); continue; }
      if (!k.startsWith('/pgfplots/')) continue;
      k = k.slice('/pgfplots/'.length);
      const sm = /^(.+?)\/\.(style|append style|prefix style)$/.exec(k);
      if (sm) {
        const nm = 'pgfplots:' + sm[1].trim(), body = v == null ? '' : unbrace(v), old = styles.get(nm) || '';
        styles.set(nm, sm[2] === 'style' ? body : sm[2] === 'append style' ? [old, body].filter(Boolean).join(',') : [body, old].filter(Boolean).join(','));
        continue;
      }
      if (/\/\./.test(k)) continue; // /.code, /.style n args …: not read
      if (k === 'compat') { styles.set(COMPAT, unbrace(v || '')); continue; }
      keep.push(v == null ? k : `${k}=${v}`);
    }
    if (keep.length) styles.set(SETTINGS, [styles.get(SETTINGS), ...keep].filter(Boolean).join(','));
  }
  // A document: no compat set is pgfplots' 'default'; \textwidth (= \linewidth = \columnwidth = \hsize) is the one
  // column of article, report, book and standalone without geometry: min(paper width − 2in, 345 / 360 / 390pt at
  // 10 / 11 / 12pt) (size1x.clo)
  function documentStart(styles: Map<string, string>, src: string) {
    const dc = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(src);
    if (!dc) return;
    styles.set(COMPAT, 'default');
    const o = (dc[1] || '').split(',').map((q) => q.trim());
    // (geometry, fullpage and the like, or the preamble's own \textwidth: not worked out)
    if (!/^(article|report|book|standalone)$/.test(dc[2].trim()) || o.includes('twocolumn') || /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(geometry|fullpage|a4wide|a4|typearea|vmargin|savetrees)\b/.test(src)
      || /\\(setlength|addtolength)\s*\{?\s*\\(textwidth|linewidth|columnwidth|hsize)\b|\\(textwidth|hsize)\s*=|\\twocolumn\b/.test(src)) return;
    const size = o.includes('11pt') ? 360 : o.includes('12pt') ? 390 : 345;
    if (o.includes('landscape')) return;
    const mm = 72.27 / 25.4, paper = o.includes('a4paper') ? 210 * mm : o.includes('a5paper') ? 148 * mm : o.includes('b5paper') ? 176 * mm : o.includes('executivepaper') ? 7.25 * 72.27 : 8.5 * 72.27;
    // (\@settopoint: whole points)
    styles.set(TEXTWIDTH, String(Math.min(Math.floor(paper - 144.54), size)));
  }
  // lengths of the document written in (pgfplots' \axisdefaultwidth and \axisdefaultheight are 240pt and 207pt)
  function docLengths(v: any, styles?: Map<string, string>) {
    let t = String(v ?? '').replace(/\\axisdefaultwidth(?![A-Za-z@])/g, '240pt').replace(/\\axisdefaultheight(?![A-Za-z@])/g, '207pt');
    const tw = styles?.get(TEXTWIDTH);
    if (tw) t = t.replace(/(\d|\.)\s*\\(?:textwidth|linewidth|columnwidth|hsize)(?![A-Za-z@])/g, `$1*${tw}pt`).replace(/\\(?:textwidth|linewidth|columnwidth|hsize)(?![A-Za-z@])/g, `${tw}pt`);
    return t;
  }

  TD.pgfplotsImport = { fromAxis, fromGroup, pgfplotsset, documentStart, pgfExpr: (src: string, deg = true, vars = ['x']) => pgfExpr(src, deg, vars, (v) => v) };
})();
