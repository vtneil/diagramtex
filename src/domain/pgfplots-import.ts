import { runtime as TD } from '../runtime';
import { limits as plotLimits } from './plots.ts';
import { unbrace } from './tex-groups';
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
      const body = styles && o.v == null && depth < 8 ? styles.get(o.k) : undefined;
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
    'every axis plot post/.append style', 'every axis plot/.style', 'xlabel near ticks', 'ylabel near ticks', 'legend columns', 'declare function', 'xtick distance', 'ytick distance', 'axis equal', 'every axis plot post/.style', 'axis equal image', 'xmajorgrids', 'ymajorgrids', 'zmajorgrids', 'x', 'y', 'axis x line', 'axis y line', 'ticks', 'mark size']);

  function fromAxis(env: string, optStr: string, body: string, helpers: Record<string, any> = {}) {
    const issues: string[] = [];
    const issue = (m: string) => { if (!issues.includes(m)) issues.push(m); };
    const expand = (v: string) => (helpers.expand ? helpers.expand(v) : v);
    const color = (spec: any) => { const c = helpers.color ? helpers.color(spec) : /^#[0-9a-f]{6}$/i.test(spec) ? spec : undefined; return c; };
    const isColor = (spec: string) => !!spec && !/[=\s]/.test(spec.trim()) && typeof color(spec) === 'string';
    const lenPx = (v: any, unit = 'pt') => { const n = helpers.len ? helpers.len(v, unit) : NaN; return isFinite(n) ? n : NaN; };
    const styles: Map<string, string> | undefined = helpers.styles;
    const A = parseOpts(optStr, styles);
    const get = (k: string) => { let v: string | null | undefined; for (const o of A) if (o.k === k) v = o.v ?? ''; return v; };
    const has = (k: string) => A.some((o) => o.k === k);

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
    let legendList: string[] | null = null;
    let i = 0;
    const s = body;
    const skipWs = (k: number) => { while (k < s.length && /\s/.test(s[k])) k++; return k; };
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
        if (s[j] === '[') { const e = matchClose(s, j); if (e < 0) return null; optText = s.slice(j + 1, e); hasOpts = true; j = skipWs(e + 1); }
        const end = (() => { // the statement's ; at depth 0
          let d = 0;
          for (let k = j; k < s.length; k++) { const c = s[k]; if (c === '\\') { k++; continue; } if ('{[('.includes(c)) d++; else if ('}])'.includes(c)) d--; else if (c === ';' && d === 0) return k; }
          return s.length;
        })();
        let rest = s.slice(j, end).trim();
        const closed = /\\closedcycle\s*$/.test(rest);
        if (closed) rest = rest.replace(/\\closedcycle\s*$/, '').trim();
        let src: any = null;
        const kw = /^(coordinates|table|expression|gnuplot|shell|file|fill between|graphics)\b/.exec(rest);
        if (kw && kw[1] === 'coordinates') {
          const b = rest.indexOf('{'), e = b >= 0 ? matchClose(rest, b) : -1;
          if (e < 0) return null;
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
      // anything else drawn in the axis (\node, \draw at axis cs, \pgfplotsset …) is not held by the plot
      issue(`\\${name} in the axis not drawn`);
      const semi = s.indexOf(';', j);
      i = name === 'pgfplotsset' || name === 'pgfplotsextra' ? (s[skipWs(j)] === '{' ? matchClose(s, skipWs(j)) + 1 : j) : semi < 0 ? s.length : semi + 1;
    }
    if (!plots.length) return null;

    // ----- axis options -----
    for (const o of A) {
      if (AXIS_QUIET.has(o.k)) continue;
      if (/^(x|y|z)?mode$/.test(o.k) && o.v === 'normal') continue;
      if (/^(x|y|z)?mode$/.test(o.k)) continue; // reported above
      issue(`axis option not held: ${o.v == null ? o.k : `${o.k}=${o.v}`}`);
    }
    const shape = TD.TYPES.plot.create({ x: 0, y: 0 }, {}, 'plot:function');
    delete shape._pw; delete shape._ph;
    Object.assign(shape, { series: [], axisLines: 'box', grid: false, title: '', xlabel: '', ylabel: '', zlabel: '', legendPos: 'north east', colormap: 'hot', colorbar: false, pgfAuto: true });
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
    // axis lines
    let lines = get('axis lines');
    if (!lines && (has('axis x line') || has('axis y line'))) {
      const xl = get('axis x line'), yl = get('axis y line');
      lines = (xl === 'middle' || xl === 'center') && (yl === 'middle' || yl === 'center') ? 'middle' : xl === 'bottom' && yl === 'left' ? 'left' : xl === 'box' && yl === 'box' ? 'box' : 'other';
      if (lines === 'other') { issue(`axis x line=${xl}, axis y line=${yl} not held`); lines = 'box'; }
    }
    if (A.some((o) => /^axis (x |y )?lines?\*$/.test(o.k))) issue('axis lines* (without arrow tips) drawn with arrows');
    if (lines === 'center') lines = 'middle';
    if (lines === 'none') { issue('axis lines=none not held'); lines = 'box'; }
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
      const list = expandList(t);
      if (list) shape[a + 'tick'] = list; else issue(`${a}tick=${v} not read`);
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
    const everyPre: Opt[] = [], everyPost: Opt[] = [];
    for (const o of A) {
      if ((o.k === 'every axis plot/.append style' || o.k === 'every axis plot/.style') && o.v) everyPre.push(...parseOpts(o.v, styles));
      if ((o.k === 'every axis plot post/.append style' || o.k === 'every axis plot post/.style') && o.v) everyPost.push(...parseOpts(o.v, styles));
    }
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
    for (const p of plots) {
      const idx = ci; if (!p.forget) ci++;
      // option list: cycle entry (no options, or \addplot+), every axis plot, own options, every axis plot post
      const list: Opt[] = [];
      if (p.plus) list.push(...parseOpts(cycle[idx % cycle.length], styles));
      list.push(...everyPre, ...p.opts, ...everyPost);
      const st: Record<string, any> = { color: '#000000', fill: null, width: 0.4 / K, dash: 'solid', mark: 'none', smooth: false, only: false, bar: ybarAxis, domain: DOM(domainAxis), samples: samplesAxis, ydomain: DOM(ydomAxis), opacity: 1, fillOpacity: null, variable: 'x', drawNone: false };
      for (const o of list) {
        const k = o.k, v = o.v;
        if (v == null && isColor(k)) { st.color = color(k); continue; }
        if (v == null && k in WIDTHS) { st.width = WIDTHS[k] / K; continue; }
        if (v == null && k in DASHES) { st.dash = DASHES[k]; if (/densely|loosely/.test(k)) st.dashNote = k; continue; }
        switch (k) {
          case 'color': case 'draw': {
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
          case 'forget plot': case 'name path': case 'name path global': case 'filter discard warning': case 'z buffer': case 'unbounded coords': case 'line join': case 'line cap': case 'mark repeat': case 'thin': break;
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
        if (st.drawNone && kind !== 'area') issue('draw=none not held');
        if (kind === 'param' && st.mark !== 'none') issue('marks on a parametric plot not drawn');
        ser.kind = kind;
      }
      delete ser._pts;
      series.push(ser);
      legends.push({ ser, p });
    }
    if (!series.length) return null;
    shape.series = series;
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
    const ux = get('x'), uy = get('y');
    if ((ux || uy) && shape.dim !== 3) {
      const L = L0();
      if (ux) { const u = lenPx(ux, 'cm'); if (isFinite(u)) shape.w = u * (L.xmax - L.xmin); else issue(`x=${ux} not read`); }
      if (uy) { const u = lenPx(uy, 'cm'); if (isFinite(u)) shape.h = u * (L.ymax - L.ymin); else issue(`y=${uy} not read`); }
    }
    if (has('axis equal image') && shape.dim !== 3) {
      const L = L0(), u = Math.min(shape.w / (L.xmax - L.xmin), shape.h / (L.ymax - L.ymin));
      shape.w = u * (L.xmax - L.xmin); shape.h = u * (L.ymax - L.ymin);
    }
    if (has('axis equal')) issue('axis equal not held');
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
    if (shape.dim === 3) shape.enlarge = has('enlargelimits') ? en : 0.1; // 3D: only z, automatically
    return { shape, issues };

    // ----- data readers -----
    function coordList(text: string, n: number): number[][] | null {
      const out: number[][] = [];
      const t = expand(text);
      if (/\+-|\[\s*[^\]]*\]/.test(t)) { issue('error bars or point meta not held'); }
      for (const m of t.matchAll(/\(([^()]*)\)/g)) {
        const q = splitTop(m[1], ',').map((x) => numOf(x, (v: string) => v));
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
      for (const l of lines) { const x = +l[xi], y = +l[yi]; if (isFinite(x) && isFinite(y)) out.push([x, y]); else if (!/nan|inf/i.test(l.join(' '))) return null; }
      return out;
    }
  }

  TD.pgfplotsImport = { fromAxis, pgfExpr: (src: string, deg = true, vars = ['x']) => pgfExpr(src, deg, vars, (v) => v) };
})();
