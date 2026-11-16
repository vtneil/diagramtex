export let panelServices: any;
import { runtime as TD } from '../runtime';
// Quantum circuits written in quantikz. The source is the object: it is drawn here as vectors
// (an approximation of quantikz2's layout) and exported unchanged inside \begin{quantikz}.
// One-way: the drawing is not edited on the canvas, only the code.
(function () {
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  // em (the font's quad) over the nominal size, for TeX's standard sizes
  const QUAD: Record<string, any> = { tiny: 1.361, scriptsize: 1.139, footnotesize: 1.0625, small: 1.028, normalsize: 1, large: 0.979, Large: 0.979, LARGE: 0.917, huge: 0.917, Huge: 0.917 };

  TD.QC_DEFAULT = [
    '\\begin{quantikz}',
    '\\lstick{\\ket{0}} & \\gate{H} & \\ctrl{1} & \\meter{} \\\\',
    '\\lstick{\\ket{0}} & & \\targ{} & \\meter{}',
    '\\end{quantikz}',
  ].join('\n');

  // ---------------------------------------------------------------- parsing
  // Number of {…} arguments; commands not listed are reported and skipped.
  const ARGS: Record<string, any> = {
    gate: 1, ctrl: 1, octrl: 1, control: 1, ocontrol: 1, targ: 1, targX: 1, swap: 1, phase: 1,
    meter: 1, metercw: 1, meterD: 1, inputD: 1, measuretab: 1, measure: 1, lstick: 1, rstick: 1, midstick: 1, push: 1,
    qw: 0, cw: 0, qwbundle: 1, cwbend: 1, vqw: 1, vcw: 1, wire: 1, setwiretype: 1, wireoverride: 1,
    slice: 1, gategroup: 1, ghost: 1, ground: 1, trash: 1, makeebit: 1, wave: 0, permute: 1,
    linethrough: 0, phantomgate: 1, hphantomgate: 1, gateinput: 1, gateoutput: 1,
  };
  const IGNORED = new Set();

  // index of the bracket closing the one at s[i] ({ or [), skipping escapes and nested groups
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
  // top-level comma list → { list: [...], map: {key: value} }
  function opts(str: any) {
    const list: any[] = [], map: Record<string, any> = {};
    let d = 0, buf = '';
    const push = () => {
      const t = buf.trim(); buf = '';
      if (!t) return;
      list.push(t);
      const m = /^([^=]+?)\s*=\s*([\s\S]*)$/.exec(t);
      if (m) map[m[1].trim()] = m[2].trim().replace(/^\{([\s\S]*)\}$/, '$1');
    };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '\\') { buf += c + (str[i + 1] || ''); i++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
      if (c === ',' && d === 0) push(); else buf += c;
    }
    push();
    return { list, map };
  }
  // the code between \begin{quantikz}[…] and \end{quantikz} (or all of it, when not wrapped)
  function unwrap(src: any) {
    src = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const m = /\\begin\{quantikz\}/.exec(src);
    if (!m) return { env: '', inner: src };
    let i = skipWs(src, m.index + m[0].length), env = '';
    if (src[i] === '[') { const j = close(src, i); if (j > 0) { env = src.slice(i + 1, j); i = j + 1; } }
    const e = src.indexOf('\\end{quantikz}', i);
    return { env, inner: src.slice(i, e < 0 ? src.length : e) };
  }
  // rows (split at \\) of cells (split at &), groups and escapes kept whole
  function grid(inner: any) {
    const rows: any = [[]];
    rows.seps = [];
    let buf = '';
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '{') { const j = close(inner, i); const k = j < 0 ? inner.length - 1 : j; buf += inner.slice(i, k + 1); i = k; continue; }
      if (c === '\\') {
        if (inner[i + 1] === '\\') { // row break, with an optional [length]
          rows[rows.length - 1].push(buf); buf = ''; rows.push([]);
          let k = skipWs(inner, i + 2);
          if (inner[k] === '[') { const j = close(inner, k); if (j > 0) { rows.seps[rows.length - 2] = inner.slice(k, j + 1); i = j; continue; } }
          i++; continue;
        }
        buf += c + (inner[i + 1] || ''); i++; continue;
      }
      if (c === '&') { rows[rows.length - 1].push(buf); buf = ''; continue; }
      buf += c;
    }
    rows[rows.length - 1].push(buf);
    // a trailing \\ leaves an empty last row
    while (rows.length && rows[rows.length - 1].length === 1 && !rows[rows.length - 1][0].trim()) rows.pop();
    return rows;
  }
  function cell(text: any, warn: any) {
    const items: any[] = [];
    let i = 0;
    // a leading [length] widens the gap before this column (&[1cm])
    const sp = /^\s*\[\s*(-?[\d.]+\s*(?:cm|mm|pt|em|ex|in))\s*\]/.exec(text);
    if (sp) { (items as any).sep = sp[1]; i = sp[0].length; }
    while (i < text.length) {
      const c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+)\*?/.exec(text.slice(i));
        if (!m) { i += 2; continue; }
        const name = m[1], n = ARGS[name];
        i += m[0].length;
        const o = [], a = [];
        for (;;) { const k = skipWs(text, i); if (text[k] !== '[') break; const j = close(text, k); if (j < 0) break; o.push(text.slice(k + 1, j)); i = j + 1; }
        while (a.length < (n ?? 1)) { const k = skipWs(text, i); if (text[k] !== '{') break; const j = close(text, k); if (j < 0) break; a.push(text.slice(k + 1, j)); i = j + 1; }
        if (n === undefined) warn(`\\${name} isn't drawn here (it is kept in the code)`);
        else if (!IGNORED.has(name)) items.push({ name, o, a });
        continue;
      }
      if (c === '{') { const j = close(text, i); i = j < 0 ? text.length : j + 1; continue; }
      let j = i;
      while (j < text.length && text[j] !== '\\' && text[j] !== '{') j++;
      const t = text.slice(i, j).trim();
      if (t) items.push({ name: 'push', o: [], a: [t], plain: true });
      i = j;
    }
    return items;
  }
  // A measurement's classical output starts at its right border. Quantikz applies
  // setwiretype to the incoming segment, so put a same-cell output change in the next cell.
  // Share this normalization between preview and export to keep the two drawings consistent.
  function measurementOutputs(rows: any) {
    let changed = false;
    for (const row of rows) for (let c = 0; c < row.length; c++) {
      const items = cell(row[c].replace(/(^|[^\\])%.*$/gm, '$1'), () => {});
      const measurement = items.findIndex((it: any) => ['meter', 'metercw', 'meterD', 'measure', 'measuretab'].includes(it.name));
      if (measurement < 0 || !items.some((it: any, i: number) => i > measurement && it.name === 'setwiretype' && it.a[0]?.trim() === 'c')) continue;
      row[c] = row[c].replace(/\\setwiretype\s*\{\s*c\s*\}/g, '');
      if (c + 1 < row.length) {
        const next = row[c + 1], sep = /^\s*\[[^\]]*\]/.exec(next);
        row[c + 1] = sep ? sep[0] + ' \\setwiretype{c} ' + next.slice(sep[0].length) : '\\setwiretype{c} ' + next;
      }
      changed = true;
    }
    return changed;
  }
  function parse(src: any) {
    const warnings: any[] = [];
    const { env, inner } = unwrap(src);
    const raw: any = grid(inner);
    measurementOutputs(raw);
    const rows = raw.map((r: any, ri: any) => r.map((t: any, ci: any) => cell(t, (w: any) => { if (!warnings.includes(w)) warnings.push(w); void ri; void ci; })));
    return { env: opts(env), rows, seps: raw.seps, warnings };
  }

  // lengths in options: 0.5cm, 4pt, 1em, 2ex, 3mm → px; "{1cm,between origins}" sets the pitch
  function length(v: any, E: any) {
    if (!v) return null;
    const between = /between origins/.test(v);
    const m = /(-?[\d.]+)\s*(cm|mm|pt|em|ex|in)?/.exec(v);
    if (!m) return null;
    const n = parseFloat(m[1]), u = m[2] || 'pt';
    const px = u === 'cm' ? n * PX : u === 'mm' ? (n * PX) / 10 : u === 'in' ? n * 2.54 * PX : u === 'em' ? n * E : u === 'ex' ? n * E * 0.43 : n / K;
    return { px, between };
  }

  // ---------------------------------------------------------------- layout
  // Ops in local coordinates; the object's (x, y) is the top-left of their bounding box.
  const plain = (t: any) => String(t || '').trim(); // slice and group labels are text, as in quantikz
  const math = (t: any) => { t = String(t || '').trim(); return !t ? '' : t.includes('$') ? t : `$${t}$`; };
  // stick labels are text in quantikz; a bare command such as \ket{0} still comes out as maths there
  const stickText = (t: any) => { t = String(t || '').trim(); return !t || t.includes('$') || !/\\[A-Za-z]/.test(t) ? t : `$${t}$`; };
  const intArg = (v: any, d: any) => { const n = parseInt(v, 10); return isFinite(n) ? n : d; };
  function wiresOf(it: any) {
    const o = it.o.length ? opts(it.o[0]) : { list: [], map: {} };
    if (o.map.wires) return Math.max(1, intArg(o.map.wires, 1));
    const bare = o.list.find((x) => /^\d+$/.test(x));
    return bare ? Math.max(1, +bare) : 1;
  }

  const cache = new Map();
  function layout(s: any) {
    const key = [s.src, s.size, s.font, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s);
    if (TD.measuring && TD.measuring()) return L; // text sizes may be placeholders in a measuring pass: don't keep them
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  // measured text sizes change when fonts load or the maths engine changes
  TD.onTextMetricsChange(() => { cache.clear(); });

  // \verticaltext{MAJ} stacks the letters, one upright letter per line
  const vtext = (t: any) => String(t || '').replace(/\\verticaltext\s*\{([^{}]*)\}/g, (m, w) => `\\begin{array}{c}${[...w.replace(/\s+/g, '')].map((ch) => `\\text{${ch}}`).join('\\\\')}\\end{array}`);
  // a cubic for TikZ's to[out=0,in=180] (or out=180,in=0) between two points: the controls sit 0.3915 of the chord out
  const sCurve = (x1: any, y1: any, x2: any, y2: any) => { const d = 0.3915 * Math.hypot(x2 - x1, y2 - y1) * Math.sign(x2 - x1); return `M${r2(x1)},${r2(y1)}C${r2(x1 + d)},${r2(y1)} ${r2(x2 - d)},${r2(y2)} ${r2(x2)},${r2(y2)}`; };

  function build(s: any) {
    const st = { size: s.size || 'normalsize', font: s.font };
    const stSmall = { size: 'footnotesize', font: s.font };
    const stScript = { size: 'scriptsize', font: s.font };
    const stTiny = { size: 'tiny', font: s.font };
    const E = TD.sizePx(st.size);
    // TeX's em is the font's quad, not its nominal size (cmr12 at \large: 11.75pt, not 12pt): em-based sizes use Q
    const Q = E * (QUAD[st.size] || 1);
    // height + depth of a text box as TeX sets it (KaTeX's strut), rather than the line the canvas reserves for it
    const inkH = (b: any) => { const m = /katex-strut" style="height:([\d.]+)em/.exec(b.html || ''); return m ? +m[1] * b.px : b.h * 0.8; };
    const P = parse(s.src);
    const env = P.env, envHas = (k: any) => env.list.includes(k);
    const ops = [], back: any[] = [], front: any[] = [], groups = [], warnings = P.warnings.slice();
    const warn = (w: any) => { if (!warnings.includes(w)) warnings.push(w); };
    // colours: TikZ names and mixes (blue!20, red!30!black) through the importer's colour table
    const hue = (v: any) => {
      if (!v || !TD.tikzColor) return undefined;
      let c;
      // {rgb,255:red,…} comes braced
      try { c = TD.tikzColor(String(v).trim().replace(/^\{([\s\S]*)\}$/, '$1')); } catch { c = undefined; }
      return c === null ? 'none' : c || undefined;
    };
    // a TikZ style → { draw, fill, text, dash, round, lw }: draw= / fill= / color= / text=, or a bare colour name
    const sty = (str: any) => {
      const r: Record<string, any> = {};
      for (const e of opts(str || '').list) {
        const m = /^(draw|fill|color|text|line width)\s*=\s*([\s\S]+)$/.exec(e);
        if (m) {
          if (m[1] === 'line width') { const l = length(m[2], E); if (l) r.lw = l.px; continue; }
          const c = hue(m[2]);
          if (c === undefined) continue;
          if (m[1] === 'color') r.draw = r.text = c; else r[m[1]] = c;
        } else if (/^(densely |loosely )?(dashed|dotted)$|^dash pattern/.test(e)) r.dash = true;
        else if (/^rounded corners/.test(e)) r.round = true;
        else if (/^(ultra |very )?thin$/.test(e)) r.lw = (/ultra/.test(e) ? 0.1 : /very/.test(e) ? 0.2 : 0.4) / K;
        else if (/^(ultra |very )?thick$/.test(e)) r.lw = (/ultra/.test(e) ? 1.6 : /very/.test(e) ? 1.2 : 0.8) / K;
        else { const c = hue(e); if (c && c !== 'none') r.draw = r.text = c; }
      }
      return r;
    };
    const O = (it: any) => opts(it.o[0] || '');
    const S = (it: any) => sty(O(it).map.style);
    const labC = (it: any) => { const l = sty((O(it).map as Record<string, any>)['label style']); return l.text || l.draw; };
    // the colour fields an op carries: stroke, fill and text colour, line width and dashes
    const paint = (y: any) => ({ ...(y.draw ? { sc: y.draw } : {}), ...(y.fill ? { fc: y.fill } : {}), ...(y.text ? { tc: y.text } : {}), ...(y.lw ? { lw: y.lw } : {}), ...(y.dash ? { dash: true } : {}) });

    // sizes follow quantikz2: gates are their text plus 4pt a side, meters 2em x 1.5em, control dots 0.12cm,
    // the target 0.3cm across. Text boxes are measured a little wider than the ink, and a line high.
    const thin = envHas('thin lines'), clear = envHas('transparent');
    const GAP = (length((env.map as Record<string, any>)['classical gap'], E) || { px: 0.03 * PX }).px; // half the spacing of a classical double wire
    const G = 1.5 * Q;             // a meter's height (1.5em)
    const gw = (b: any) => b.w + 0.55 * E, gh = (b: any) => inkH(b) + 8 / K; // text height + depth, and 4pt inner sep a side
    const LW = (thin ? 0.4 : 0.8) / K;
    const DOT = thin ? 1.5 / K : 0.06 * PX; // thin lines shrink the control dots to 3pt
    const TARG = 3 * Math.SQRT2 / K, SW = 0.35 * Q; // the target is a circle of an empty node with 3pt inner sep: radius 3pt*sqrt 2
    const LGAP = E / 3;            // a label's inner sep (TikZ's 1/3em)
    const box = (t: any, small?: any) => TD.textBox(t, small === 'script' ? stScript : small ? stSmall : st);
    const rows = P.rows, R = rows.length, C = Math.max(0, ...rows.map((r: any) => r.length));
    const PAD = 10 / 3 / K, PADX = PAD * 0.6, meterTops = [];
    // \gate[options][min width][min height]{…}: the cell's minimum size (it widens the column, as in quantikz),
    // and a style's minimum width / height / size (sw, sh: only the box grows)
    const gateMin = (it: any) => {
      const px = (v: any) => (v && length(v, E)?.px) || 0;
      const st = it.o.length ? opts(opts(it.o[0]).map.style || '').map : {};
      return { w: px(it.o[1]), h: px(it.o[2]), sw: px((st as Record<string, any>)['minimum width'] || (st as Record<string, any>)['minimum size']), sh: px((st as Record<string, any>)['minimum height'] || (st as Record<string, any>)['minimum size']) };
    };
    if (!R || !C) return { ops: [{ k: 'empty', x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }], bb: { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX }, warnings, R: 0, C: 0 };
    const at = (r: any, c: any) => (rows[r] && rows[r][c]) || [];
    const clampRow = (r: any) => Math.max(0, Math.min(R - 1, r));

    // a gate's measures (\gate, and \meter / \metercw, which are gates in quantikz2): the label sets the width
    // (a swap gate is as wide as "wide"), the height comes from the label or, with disable auto height, from a U
    const gdim = (it: any) => {
      const k = it.name, o = O(it), m = gateMin(it), n = Math.min(wiresOf(it), R);
      const meterish = k === 'meter' || k === 'metercw';
      const swap = !meterish && o.list.includes('swap');
      const lab = meterish ? math(it.a[0]) : math(vtext(it.a[0]));
      const b = box(lab);
      const dah = meterish || o.list.includes('disable auto height');
      const mw = it.o[1] ? m.w : meterish ? 2 * Q : 0, mh = it.o[2] ? m.h : k === 'meter' ? G : k === 'metercw' ? 2.25 * Q : 0;
      const w = Math.max(swap ? gw(box('$wide$')) : meterish && !lab ? 0 : gw(b), mw);
      const h = Math.max(dah ? 0.683 * E + 8 / K : gh(b), mh); // with disable auto height, an upright U's height (cmmi10: 0.683em, no depth)
      return { w, h, n: swap ? Math.min(2, R) : n, b, lab, swap, meterish, m };
    };
    const SHAPES = new Set(['meterD', 'inputD', 'measure', 'measuretab']);
    const shapeDim = (it: any) => {
      const b = box(math(it.a[0])), min = it.name === 'measure' || it.name === 'measuretab';
      return { b, w: Math.max(min ? 2 * Q : 0, gw(b)), h: Math.max(min ? Q : 0, gh(b)) };
    };
    const WIDE = gw(box('$Wide$'));
    const permList = (it: any) => String(it.a[0] || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
    const midDim = (it: any) => { const t = stickText(it.a[0]), b = box(t); return { t, b, w: b.w + 2 * box('g').w + E / 3 }; };

    // sizes of each cell's contents, and how far from the centre each cell's wires stop (its node's half width)
    const colW = Array(C).fill(0), rowH = Array(R).fill(0);
    const hole = Array.from<any, any>({ length: R }, () => Array(C).fill(0));
    const BRACE = 0.2 * PX;
    const holeAt = (r: any, c: any, hw: any) => { if (r < R) hole[r][c] = Math.max(hole[r][c], hw); };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      let w = 0, h = 0;
      const k = it.name;
      if (k === 'gate' || k === 'meter' || k === 'metercw') {
        const g = gdim(it);
        w = g.w; h = g.n > 1 ? 0 : g.h;
        // a gate over several wires gives its first and last row its own height (the rows between stay as they are)
        if (g.n > 1) for (const q of [r, Math.min(R, r + g.n) - 1]) rowH[q] = Math.max(rowH[q], g.h);
        const hw = Math.max(g.w, g.m.sw) / 2;
        for (let q = r; q < Math.min(R, r + g.n); q++) if (!at(q, c).some((x: any) => x.name === 'linethrough') || q === r) holeAt(q, c, hw);
      } else if (SHAPES.has(k)) { const d = shapeDim(it); w = d.w; h = d.h; holeAt(r, c, w / 2); }
      // drawn nodes count half a line width more on every side (TikZ's outer sep); a swap's crosses add nothing to the cell
      else if (k === 'ctrl' || k === 'octrl' || k === 'control' || k === 'ocontrol' || k === 'phase') {
        w = h = 2 * DOT + LW;
        if (k === 'octrl' || k === 'ocontrol' || O(it).list.includes('open')) holeAt(r, c, DOT);
      } else if (k === 'targ') w = h = 2 * TARG + LW;
      else if (k === 'push') { const b = box(math(it.a[0])); w = b.w - 2; h = inkH(b); holeAt(r, c, b.w / 2 + E * 0.1); }
      else if (k === 'midstick') { const d = midDim(it); w = d.w; h = inkH(d.b); for (let q = r; q < Math.min(R, r + wiresOf(it)); q++) holeAt(q, c, d.w / 2); }
      else if (k === 'ground') { w = 5 * GAP; h = 8 * GAP; holeAt(r, c, w / 2); }
      else if (k === 'trash') { w = 2 * Q; h = 2.5 * Q; holeAt(r, c, Q); }
      else if (k === 'phantomgate') { const b = box(math(it.a[0])); w = b.w; h = inkH(b) + 6 / K; }
      else if (k === 'hphantomgate') { const b = box(math(it.a[0])); w = Math.max(1.5 * Q, b.w); h = 1.5 * Q; }
      else if (k === 'linethrough') h = 6 / K;
      else if (k === 'ghost') h = gh(box(math(it.a[0])));
      else if (k === 'permute') { w = WIDE; permList(it).forEach((_, i) => holeAt(r + i, c, WIDE / 2)); }
      // a stick label hangs outside its column and takes no room in its row (it is a label, not a cell)
      colW[c] = Math.max(colW[c], w); rowH[r] = Math.max(rowH[r], h);
    }
    // spacing (quantikz: row sep / column sep, optionally between origins; &[1cm] and \\[1cm] add to one gap)
    const rs: any = length((env.map as Record<string, any>)['row sep'], E) || { px: 0.5 * PX }, cs: any = length((env.map as Record<string, any>)['column sep'], E) || { px: 0.5 * PX };
    const colExtra = Array(C).fill(0), rowExtra = Array(R).fill(0);
    for (let r = 0; r < R; r++) for (let c = 1; c < C; c++) { const sp = (at(r, c)).sep && length((at(r, c)).sep, E); if (sp) colExtra[c] = Math.max(colExtra[c], sp.px); }
    for (let r = 1; r < R; r++) { const v = (P.seps || [])[r - 1]; const sp = v && length(v.replace(/^\[|\]$/g, ''), E); if (sp) rowExtra[r] = sp.px; }
    const colL: any[] = [], cx: any[] = [], rowT = [], cy: any[] = [];
    let x = 0;
    for (let c = 0; c < C; c++) {
      if (cs.between && c) { cx[c] = cx[c - 1] + cs.px + colExtra[c]; colL[c] = cx[c] - colW[c] / 2; }
      else { colL[c] = x + colExtra[c]; cx[c] = colL[c] + colW[c] / 2; }
      x = colL[c] + colW[c] + (cs.between ? 0 : cs.px);
    }
    let y = 0;
    for (let r = 0; r < R; r++) {
      if (rs.between && r) { cy[r] = cy[r - 1] + rs.px + rowExtra[r]; rowT[r] = cy[r] - rowH[r] / 2; }
      else { rowT[r] = y + rowExtra[r]; cy[r] = rowT[r] + rowH[r] / 2; }
      y = rowT[r] + rowH[r] + (rs.between ? 0 : rs.px);
    }
    const colR = (c: any) => colL[c] + colW[c];

    // cells under a multi-wire \lstick / \rstick count as part of it
    const stick: Record<string, any> = {};
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      if (it.name !== 'lstick' && it.name !== 'rstick') continue;
      for (let k = 0; k < Math.min(wiresOf(it), R - r); k++) stick[`${r + k},${c}`] = it.name;
    }
    // ---- horizontal wires (quantikz2: every row runs the full width unless told otherwise; wires end at nodes' borders)
    const types = ((env.map as Record<string, any>)['wire types'] || '').split(',').map((t: any) => t.trim());
    const typeAt = Array.from<any, any>({ length: R }, () => Array(C).fill('q'));
    for (let r = 0; r < R; r++) {
      let state = types[r] || 'q';
      let prevExit = null;
      for (let c = 0; c < C; c++) {
        const cl = at(r, c);
        // quantikz2 draws a cell's incoming wire as the cell ends, so a \setwiretype there already applies to it
        for (const it of cl) if (it.name === 'setwiretype') state = (it.a[0] || 'q').trim(); else if (it.name === 'wave') state = 'n';
        let inType = state;
        for (const it of cl) {
          if (it.name === 'cw') inType = 'c';
          else if (it.name === 'qw') inType = 'q';
          else if (it.name === 'wireoverride') inType = (it.a[0] || 'n').trim();
          else if (it.name === 'inputD') inType = 'n';
        }
        typeAt[r][c] = state === 'u' ? 'q' : state;
        const lst = stick[`${r},${c}`] === 'lstick', rst = stick[`${r},${c}`] === 'rstick', hw = hole[r][c];
        const entry = lst ? null : rst ? colL[c] : cx[c] - hw;
        if (c === 0 && !cl.length && !lst && !rst) prevExit = colL[0]; // an empty first cell starts the wire at its edge
        if (prevExit != null && entry != null && inType !== 'n' && inType !== 'u' && prevExit < entry) ops.push({ k: 'wire', t: inType, x1: prevExit, y1: cy[r], x2: entry, y2: cy[r] });
        prevExit = rst ? null : lst ? colR(c) : cx[c] + hw;
      }
    }

    // ---- vertical connections, and wires drawn by \wire
    // a wire's label, "p"{above,pos=0.2} (tikz-cd: maths in script style, halfway and on the left unless told)
    const wireLabel = (dec: any, x1: any, y1: any, x2: any, y2: any) => {
      const m = /"((?:[^"\\]|\\.)*)"\s*(')?\s*(?:\{([^{}]*)\})?/.exec(dec || '');
      if (!m || !m[1].trim()) return;
      const lo = opts(m[3] || ''), pos = isFinite(+lo.map.pos) && lo.map.pos !== '' ? +lo.map.pos : 0.5;
      const t = math(m[1]), b = box(t, 'script'), X = x1 + pos * (x2 - x1), Y = y1 + pos * (y2 - y1), g = 0.2 * E;
      const dir = lo.list.find((x) => /^(above|below|left|right)$/.test(x)) || (y1 === y2 ? (m[2] ? 'below' : 'above') : (m[2] ? 'left' : 'right'));
      const dx = dir === 'left' ? -(b.w / 2 + g) : dir === 'right' ? b.w / 2 + g : 0, dy = dir === 'above' ? -(inkH(b) / 2 + g) : dir === 'below' ? inkH(b) / 2 + g : 0;
      ops.push({ k: 'text', t, small: 'scriptsize', x: X + dx, y: Y + dy, b, ...paint(sty(m[3] || '')) });
    };
    const vline = (c: any, r1: any, r2: any, t: any, p = {}) => { r2 = clampRow(r2); if (r2 !== r1) ops.push({ k: 'wire', t, x1: cx[c], y1: cy[r1], x2: cx[c], y2: cy[r2], ...p }); };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      const n = intArg(it.a[0], 0);
      if (['ctrl', 'octrl', 'swap'].includes(it.name) && n) {
        // vertical wire=c draws the link as a classical double line; a partial swap puts its label in a small
        // circle on the line (quantikz's grade style: inner sep 0, \tiny, at `partial position` along it).
        // A control's style and wire style colour its line too.
        const o = O(it).map, t = ((o as Record<string, any>)['vertical wire'] || 'q').trim() === 'c' ? 'c' : 'q';
        const p = paint({ ...sty(o.style), ...sty((o as Record<string, any>)['wire style']) });
        delete p.fc; delete p.tc;
        vline(c, r, r + n, t, p);
        const lab = it.name === 'swap' && (o as Record<string, any>)['partial swap'];
        if (lab && clampRow(r + n) !== r) {
          const f = Number.isFinite(+(o as Record<string, any>)['partial position']) && (o as Record<string, any>)['partial position'] !== '' ? +(o as Record<string, any>)['partial position'] : 0.5;
          const t2 = math(lab), b = TD.textBox(t2, stTiny), rad = Math.hypot(b.w, inkH(b)) / 2;
          const X = cx[c] - (t === 'c' ? GAP : 0), Y = cy[r] + f * (cy[clampRow(r + n)] - cy[r]);
          ops.push({ k: 'dot', x: X, y: Y, r: rad, open: true, ...p });
          ops.push({ k: 'text', t: t2, small: 'tiny', x: X, y: Y, b, ...(labC(it) ? { tc: labC(it) } : {}) });
        }
      }
      else if (it.name === 'vqw' && n) vline(c, r, r + n, 'q');
      else if ((it.name === 'vcw' || it.name === 'cwbend') && n) vline(c, r, r + n, 'c');
      else if (it.name === 'wire' && c > 0) { // quantikz draws no \wire in the first column
        const dir = (it.o[0] || 'l').trim(), m = intArg(it.o[1], 1);
        let t = (it.a[0] || 'q').trim();
        if (t === 'a') t = typeAt[r][c];
        const p = paint(sty(String(it.o[2] || '').replace(/"((?:[^"\\]|\\.)*)"\s*'?\s*(\{[^{}]*\})?/g, '')));
        let x2 = cx[c], y2 = cy[r];
        if (dir === 'd' || dir === 'u') y2 = cy[clampRow(r + (dir === 'd' ? m : -m))];
        else if (dir === 'l' || dir === 'r') x2 = cx[Math.max(0, Math.min(C - 1, c + (dir === 'r' ? m : -m)))];
        if ((x2 !== cx[c] || y2 !== cy[r]) && t !== 'n') { ops.push({ k: 'wire', t, x1: cx[c], y1: cy[r], x2, y2, ...p }); wireLabel(it.o[2], cx[c], cy[r], x2, y2); }
      }
    }

    // ---- gate groups: behind everything with `background`, else over the circuit
    const gpad = 4 / K + E / 3; // quantikz: rows and columns are fitted with TikZ's 1/3em, then the group adds 4pt
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      if (it.name !== 'gategroup') continue;
      const o = O(it);
      // wires as `wires=3` or as the bare first option `[3,steps=2]` (quantikz takes both)
      const k = Math.max(1, intArg(o.map.wires, 0) || +(o.list.find((x) => /^\d+$/.test(x)) || 1)), m = Math.max(1, intArg(o.map.steps, 1));
      const r2_ = clampRow(r + k - 1), c2 = Math.min(C - 1, c + m - 1);
      const x1 = colL[c] - gpad, x2 = colR(c2) + gpad, y1 = rowT[r] - gpad, y2 = rowT[r2_] + rowH[r2_] + gpad;
      const ys = sty(o.map.style), dest = o.list.includes('background') ? back : front;
      dest.push({ k: 'rect', x: x1, y: y1, w: x2 - x1, h: y2 - y1, rx: ys.round ? 4 / K : 0, fill: !!ys.fill && ys.fill !== 'none', ...paint(ys) });
      // for the editor: each group's box, and whether its border is drawn
      groups.push({ r, c, r2: r2_, c2, n: at(r, c).filter((q: any) => q.name === 'gategroup').indexOf(it), x: x1, y: y1, w: x2 - x1, h: y2 - y1, rx: ys.round ? 4 / K : 0, bare: ys.draw === 'none' });
      // the label: above the box, raised 0.2cm and anchored at its middle (quantikz's group label style); a label
      // style's position, anchor and yshift change that (yshifts add up)
      // a second label in its style, label={[group label,label position=below,…]:text}, is placed the same way
      const glabel = (t: any, list: any, tc: any, lab: any) => {
        if (!t) return;
        const b = box(t);
        let pos = 'above', anchor = 'mid', xsh = 0, ysh = 0.2 * PX;
        for (const e of list) {
          let q;
          if ((q = /^label position\s*=\s*(\w+)/.exec(e))) pos = q[1];
          else if ((q = /^anchor\s*=\s*([\w ]+)/.exec(e))) anchor = q[1].trim();
          else if ((q = /^xshift\s*=\s*(.+)$/.exec(e))) xsh += length(q[1], E)?.px || 0;
          else if ((q = /^yshift\s*=\s*(.+)$/.exec(e))) ysh += length(q[1], E)?.px || 0;
          else if (e === 'below' || e === 'above') { pos = e; anchor = e === 'below' ? 'north' : 'south'; }
        }
        const ty = pos === 'below' ? y2 : pos === 'center' ? (y1 + y2) / 2 : y1, half = inkH(b) / 2 + LGAP;
        const cyl = (/north/.test(anchor) ? ty + half : /south/.test(anchor) ? ty - half : ty) - ysh;
        dest.push({ k: 'text', t, x: (x1 + x2) / 2 + xsh, y: cyl, b, lab, ...(tc ? { tc } : {}) });
      };
      // lab: where the label is written, so the editor can edit it on a double-click
      const gi = at(r, c).indexOf(it);
      glabel(plain(it.a[0]), opts((o.map as Record<string, any>)['label style'] || '').list, sty((o.map as Record<string, any>)['label style']).text, { r, c, i: gi });
      for (const e of opts(o.map.style || '').list) {
        const q = /^label\s*=\s*\{?\s*\[([\s\S]*?)\]\s*(?:(above|below)\s*)?:([\s\S]*?)\}?$/.exec(e);
        if (q) glabel(plain(q[3].replace(/^\{([\s\S]*)\}$/, '$1')), [...opts(q[1]).list, ...(q[2] ? [q[2]] : [])], sty(q[1]).text, { r, c, i: gi, low: true });
      }
    }

    // where each multi-wire gate sits, for \gateinput / \gateoutput
    const gateAt: Record<string, any> = {};
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      if (it.name !== 'gate') continue;
      const g = gdim(it), hw = Math.max(g.w, g.m.sw) / 2;
      for (let q = r; q < Math.min(R, r + g.n); q++) gateAt[`${q},${c}`] = { x1: cx[c] - hw, x2: cx[c] + hw, r, n: g.n };
    }
    // a brace from y1 to y2 at x, its tip pointing dir (+1 right, -1 left)
    const brace = (bx: any, y1: any, y2: any, dir: any, p = {}) => {
      const h2 = BRACE / 2, ym = (y1 + y2) / 2, s1 = dir;
      ops.push({ k: 'path', d: `M${r2(bx)},${r2(y1)}Q${r2(bx + s1 * h2)},${r2(y1)} ${r2(bx + s1 * h2)},${r2(y1 + h2)}L${r2(bx + s1 * h2)},${r2(ym - h2)}Q${r2(bx + s1 * h2)},${r2(ym)} ${r2(bx + s1 * BRACE)},${r2(ym)}Q${r2(bx + s1 * h2)},${r2(ym)} ${r2(bx + s1 * h2)},${r2(ym + h2)}L${r2(bx + s1 * h2)},${r2(y2 - h2)}Q${r2(bx + s1 * h2)},${r2(y2)} ${r2(bx)},${r2(y2)}`, bb: [Math.min(bx, bx + s1 * BRACE), y1, Math.max(bx, bx + s1 * BRACE), y2], ...p });
    };
    // a meter's dial in a box: an arc 'bend left=50' between points 0.1cm in from the sides, 0.06cm below the
    // middle, and the needle from 0.1cm under the centre to 0.1cm in from the right, 0.2cm up
    const dial = (x1: any, x2: any, Y: any, p: any) => {
      const u = 0.1 * PX, X = (x1 + x2) / 2;
      const ay = Y + 0.6 * u, half = (x2 - x1 - 2 * u) / 2, rr = half / Math.sin((50 * Math.PI) / 180);
      ops.push({ k: 'path', d: `M${r2(x1 + u)},${r2(ay)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x2 - u)},${r2(ay)}`, bb: [x1 + u, ay - rr + rr * Math.cos((50 * Math.PI) / 180), x2 - u, ay], ...p });
      const nx1 = X, ny1 = Y + u, nx2 = x2 - u, ny2 = Y - 2 * u, L = Math.hypot(nx2 - nx1, ny2 - ny1), ux = (nx2 - nx1) / L, uy = (ny2 - ny1) / L, ah = 0.42 * E * 0.6, aw = ah * 0.45;
      const bx = nx2 - ux * ah, by = ny2 - uy * ah;
      ops.push({ k: 'path', d: `M${r2(nx1)},${r2(ny1)}L${r2(bx)},${r2(by)}`, bb: [nx1, ny2, nx2, ny1], ...p });
      ops.push({ k: 'path', solid: true, d: `M${r2(nx2)},${r2(ny2)}L${r2(bx - uy * aw)},${r2(by + ux * aw)}L${r2(bx + uy * aw)},${r2(by - ux * aw)}Z`, bb: [nx1, ny2, nx2, ny1], ...p });
    };
    // a line in the paper's colour under a crossing curve (quantikz: 3pt wide, shortened 0.9pt at each end)
    const gapCurve = (x1: any, y1: any, x2: any, y2: any) => { const s1 = Math.sign(x2 - x1) * 0.9 / K; ops.push({ k: 'path', gap: 3 / K, d: sCurve(x1 + s1, y1, x2 - s1, y2), bb: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] }); };
    const curve = (x1: any, y1: any, x2: any, y2: any, p: any) => ops.push({ k: 'path', d: sCurve(x1, y1, x2, y2), bb: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], ...p });

    // ---- elements
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const it of at(r, c)) {
      const k = it.name, X = cx[c], Y = cy[r], p = paint(S(it)), lc = labC(it), tcol = lc || p.tc; // draw= colours the shape only; color= or text= (or a label style) the label
      const tc = tcol ? { tc: tcol } : {};
      if (k === 'gate' || k === 'meter') {
        const g = gdim(it), n = Math.min(g.n, R - r);
        // the box fits its cells; a style's minimum size then grows it in place, over its neighbours
        const w = Math.max(g.w, g.m.sw);
        let y1 = Y - g.h / 2;
        let y2 = n > 1 ? cy[r + n - 1] + g.h / 2 : Y + g.h / 2;
        if (g.m.sh > y2 - y1) { const ym = (y1 + y2) / 2; y1 = ym - g.m.sh / 2; y2 = ym + g.m.sh / 2; }
        if (k === 'gate' && /\$/.test(it.a[0] || '')) warn('\\gate{…} is already maths in quantikz: drop its $ signs, or LaTeX stops with "Missing $ inserted"');
        if (g.m.sw > g.w) warn('style={minimum width=…} widens the gate box but not its column, so it covers its neighbours in LaTeX too; \\gate[…][width]{…} widens the column');
        ops.push({ k: 'rect', x: X - w / 2, y: y1, w, h: y2 - y1, fill: true, ...(k === 'gate' ? { gate: [r, c], fit: [gw(g.b), gh(g.b)] } : {}), ...p });
        if (g.swap) {
          const x1 = X - w / 2, x2 = X + w / 2, ya = Y, yb = cy[clampRow(r + 1)];
          curve(x1, ya, x2, yb, p); gapCurve(x2, ya, x1, yb); curve(x2, ya, x1, yb, p);
        } else if (k === 'meter') {
          meterTops.push({ x: X, y: y1, w });
          dial(X - w / 2, X + w / 2, (y1 + y2) / 2, p);
          // its label sits above it (priority label=above), as maths at the circuit's size
          if (g.lab) ops.push({ k: 'text', t: g.lab, x: X, y: y1 - LGAP - inkH(g.b) / 2, b: g.b, ...tc });
        } else if (g.lab) ops.push({ k: 'text', t: g.lab, x: X, y: (y1 + y2) / 2, b: g.b, ...tc });
      } else if (k === 'metercw') {
        // a 2em x 2.25em node raised 0.375em: the meter is its lower 1.5em, a classical wire leaves its top
        const g = gdim(it), w = g.w, x1 = X - w / 2, y1 = Y - 0.75 * Q, y2 = Y + 0.75 * Q, top = Y - 1.5 * Q;
        ops.push({ k: 'rect', x: x1, y: y1, w, h: y2 - y1, fill: true, ...p });
        ops.push({ k: 'wire', t: 'c', x1: X, y1, x2: X, y2: top, ...p });
        dial(x1, x1 + w, Y, p);
        if (g.lab) ops.push({ k: 'text', t: g.lab, x: X, y: top - 0.04 * PX - LGAP - inkH(g.b) / 2, b: g.b, ...tc });
      } else if (SHAPES.has(k)) {
        const d = shapeDim(it), t = math(it.a[0]), w = d.w, h = d.h, x1 = X - w / 2, y1 = Y - h / 2, x2 = X + w / 2, y2 = Y + h / 2, rr = h / 2;
        let path;
        // measure: rounded at both ends; meterD: round on the right; inputD: round on the left;
        // measuretab: a tab pointing west (TikZ's signal shape, signal to=west)
        if (k === 'measure') path = `M${r2(x1 + rr)},${r2(y1)}H${r2(x2 - rr)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x2 - rr)},${r2(y2)}H${r2(x1 + rr)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x1 + rr)},${r2(y1)}Z`;
        else if (k === 'meterD') path = `M${r2(x1)},${r2(y1)}H${r2(x2 - rr)}A${r2(rr)},${r2(rr)} 0 0,1 ${r2(x2 - rr)},${r2(y2)}H${r2(x1)}Z`;
        else if (k === 'inputD') path = `M${r2(x2)},${r2(y1)}H${r2(x1 + rr)}A${r2(rr)},${r2(rr)} 0 0,0 ${r2(x1 + rr)},${r2(y2)}H${r2(x2)}Z`;
        else { const tip = h / 2; path = `M${r2(x2)},${r2(y1)}H${r2(x1)}L${r2(x1 - tip)},${r2(Y)}L${r2(x1)},${r2(y2)}H${r2(x2)}Z`; }
        ops.push({ k: 'path', fill: true, d: path, bb: [k === 'measuretab' ? x1 - h / 2 : x1, y1, x2, y2], ...p });
        if (t) ops.push({ k: 'text', t, x: X + (k === 'meterD' ? -rr / 4 : k === 'inputD' ? rr / 4 : 0), y: Y, b: d.b, ...tc });
      } else if (k === 'ctrl' || k === 'control') {
        const open = O(it).list.includes('open');
        ops.push({ k: 'dot', x: X, y: Y, r: DOT, open, ...p });
      } else if (k === 'octrl' || k === 'ocontrol') ops.push({ k: 'dot', x: X, y: Y, r: DOT, open: true, ...p });
      else if (k === 'phase') {
        ops.push({ k: 'dot', x: X, y: Y, r: DOT, open: O(it).list.includes('open'), ...p });
        // the label: 2mm out at 45°, anchored at its middle
        if (it.a[0]) { const b = box(math(it.a[0]), true), d = 0.2 * PX / Math.SQRT2; ops.push({ k: 'text', t: math(it.a[0]), small: true, x: X + DOT + d, y: Y - DOT - d, b, ...tc }); }
      } else if (k === 'targ') ops.push({ k: 'targ', x: X, y: Y, r: TARG, ...p });
      else if (k === 'swap' || k === 'targX') {
        ops.push({ k: 'path', d: `M${r2(X - SW)},${r2(Y - SW)}L${r2(X + SW)},${r2(Y + SW)}M${r2(X - SW)},${r2(Y + SW)}L${r2(X + SW)},${r2(Y - SW)}`, bb: [X - SW, Y - SW, X + SW, Y + SW], ...p });
      } else if (k === 'push') {
        const t = math(it.a[0]), b = box(t);
        if (t) ops.push({ k: 'text', t, x: X, y: Y, b, ...tc });
      } else if (k === 'midstick') {
        // text across the wires it spans, which stop at its edges; braces either side point in at it
        const d = midDim(it), n = Math.min(wiresOf(it), R - r), y1 = rowT[r], y2 = rowT[r + n - 1] + rowH[r + n - 1], ym = n > 1 ? (cy[r] + cy[r + n - 1]) / 2 : Y;
        const br = (O(it).map.brackets || 'both').trim();
        if (n > 1) {
          const ex = 0.05 * PX, a = cy[r] - ex - BRACE / 4, z = cy[r + n - 1] + ex + BRACE / 4;
          if (br === 'both' || br === 'left') brace(X - d.w / 2 + 0.1 * PX - BRACE, a, z, 1, p);
          if (br === 'both' || br === 'right') brace(X + d.w / 2 - 0.1 * PX + BRACE, a, z, -1, p);
        }
        void y1; void y2;
        if (d.t) ops.push({ k: 'text', t: d.t, x: X, y: ym, b: d.b, ...tc });
      } else if (k === 'lstick' || k === 'rstick') {
        const t = stickText(it.a[0]), b = box(t), n = Math.min(wiresOf(it), R - r), left = k === 'lstick';
        const br = (O(it).map.brackets || 'both').trim(), showBrace = n > 1 && (br === 'both' || br === (left ? 'right' : 'left'));
        const y1 = n > 1 ? rowT[r] : Y - b.h / 2, y2 = n > 1 ? rowT[r + n - 1] + rowH[r + n - 1] : Y + b.h / 2, ym = (y1 + y2) / 2;
        let edge = X; // the column has no width: the label hangs off it, past a brace when it spans wires
        if (n > 1) {
          const s1 = left ? -1 : 1, bx = edge + s1 * LGAP / 2;
          if (showBrace) brace(bx, y1, y2, s1, p);
          edge = bx + s1 * BRACE;
        }
        edge += (left ? -1 : 1) * LGAP;
        if (t) ops.push({ k: 'text', t, x: left ? edge - b.w / 2 : edge + b.w / 2, y: ym, b, ...tc });
      } else if (k === 'gateinput' || k === 'gateoutput') {
        // a label just inside a multi-wire gate's side, in \scriptsize; over several wires, with a brace
        const g = gateAt[`${r},${c}`];
        if (!g) { warn(`\\${k} belongs in a cell of a \\gate over several wires`); continue; }
        const inp = k === 'gateinput', t = plain(it.a[0]), b = box(t, 'script'), n = Math.min(wiresOf(it), g.r + g.n - r);
        let edge = inp ? g.x1 : g.x2;
        const ym = (cy[r] + cy[r + n - 1]) / 2;
        if (n > 1) {
          const bx = edge + (inp ? 0.1 * PX : -0.1 * PX);
          brace(bx, cy[r] - 0.1 * PX, cy[r + n - 1] + 0.1 * PX, inp ? 1 : -1, p);
          edge = bx + (inp ? BRACE : -BRACE);
        }
        const xs = edge + (inp ? 1 : -1) * (4 / K + b.w / 2);
        if (t) ops.push({ k: 'text', t, small: 'scriptsize', x: xs, y: ym, b, ...tc });
      } else if (k === 'qwbundle') {
        const a = 0.28 * E;
        ops.push({ k: 'path', d: `M${r2(X - a * 0.7)},${r2(Y + a)}L${r2(X + a * 0.7)},${r2(Y - a)}`, bb: [X - a, Y - a, X + a, Y + a], ...p });
        if (it.a[0]) { const b = box(math(it.a[0]), true); ops.push({ k: 'text', t: math(it.a[0]), small: true, x: X + a * 0.7 + b.w / 2, y: Y - a - b.h / 2 + 2, b, ...tc }); }
      } else if (k === 'ground') {
        // three bars, 8, 6 and 4 classical gaps tall, 2 gaps apart, the wire meeting the tallest; label below
        const x0 = X - 2.5 * GAP;
        ops.push({ k: 'path', d: `M${r2(x0)},${r2(Y - 4 * GAP)}V${r2(Y + 4 * GAP)}M${r2(x0 + 2 * GAP)},${r2(Y - 3 * GAP)}V${r2(Y + 3 * GAP)}M${r2(x0 + 4 * GAP)},${r2(Y - 2 * GAP)}V${r2(Y + 2 * GAP)}`, bb: [x0, Y - 4 * GAP, x0 + 4 * GAP, Y + 4 * GAP], ...p });
        const t = stickText(it.a[0]);
        if (t) { const b = box(t); ops.push({ k: 'text', t, x: X, y: Y + 4 * GAP + LGAP + inkH(b) / 2, b, ...tc }); }
      } else if (k === 'trash') {
        // the wire turns down into an arrow; on a classical or bundled wire the extra lines stop at the corner
        const w0 = X - Q, bot = Y + 1.25 * Q, ty = typeAt[r][c];
        const mk = (dy: any, down: any) => `M${r2(w0)},${r2(Y + dy)}H${r2(X)}${down ? `V${r2(bot - 0.25 * E)}` : ''}`;
        let d = ty === 'c' ? mk(-GAP, true) + mk(GAP, false) : mk(0, true) + (ty === 'b' ? mk(-GAP, false) + mk(GAP, false) : '');
        const ah = 0.25 * E, aw = ah * 0.55;
        ops.push({ k: 'path', d, bb: [w0, Y - GAP, X, bot], ...p });
        ops.push({ k: 'path', solid: true, d: `M${r2(X)},${r2(bot)}L${r2(X - aw)},${r2(bot - ah)}L${r2(X)},${r2(bot - ah * 0.7)}L${r2(X + aw)},${r2(bot - ah)}Z`, bb: [X - aw, bot - ah, X + aw, bot], ...p });
        const t = stickText(it.a[0]);
        if (t) { const b = box(t); ops.push({ k: 'text', t, x: X, y: bot + LGAP + inkH(b) / 2, b, ...tc }); }
      } else if (k === 'phantomgate' || k === 'hphantomgate' || k === 'linethrough') {
        // an invisible box the wire runs straight through
      } else if (k === 'makeebit') {
        // an entangled pair: lines from this cell and the one below to a point out to the side, labelled there
        if (r + 1 >= R) { warn('\\makeebit needs a row below it'); continue; }
        const o = O(it).map, ang = isFinite(parseFloat(o.angle)) ? parseFloat(o.angle) : -45, D = cy[r + 1] - Y;
        const px = X + 0.5 * D * Math.tan((ang * Math.PI) / 180), py = Y + D / 2;
        ops.push({ k: 'path', cap: true, d: `M${r2(X)},${r2(Y)}L${r2(px)},${r2(py)}L${r2(X)},${r2(cy[r + 1])}`, bb: [Math.min(X, px), Y, Math.max(X, px), cy[r + 1]], ...p });
        const t = stickText(it.a[0]);
        if (t) { const b = box(t); ops.push({ k: 'text', t, x: px - LGAP - b.w / 2, y: py, b, ...tc }); }
      } else if (k === 'wave') {
        // a wavy band along the row: two one-period sine lines 5pt peak to peak, 3pt either side of the wire,
        // filled with the paper between them
        const xa = X + 3 / K, xb = cx[C - 1] - 3 / K, A = 2.5 / K, N = 48;
        if (xb <= xa) continue;
        const pts = (dy: any) => Array.from<any, any>({ length: N + 1 }, (_, i) => [xa + ((xb - xa) * i) / N, Y + dy + A * Math.sin((2 * Math.PI * i) / N)]);
        const top = pts(-3 / K), bot = pts(3 / K), pl = (a: any) => a.map((q: any, i: any) => `${i ? 'L' : 'M'}${r2(q[0])},${r2(q[1])}`).join('');
        ops.push({ k: 'path', fill: true, stroke: false, d: pl(top) + bot.slice().reverse().map((q) => `L${r2(q[0])},${r2(q[1])}`).join('') + 'Z', bb: [xa, Y - 3 / K - A, xb, Y + 3 / K + A], ...p });
        ops.push({ k: 'path', d: pl(top) + pl(bot), bb: [xa, Y - 3 / K - A, xb, Y + 3 / K + A], ...p });
      } else if (k === 'permute') {
        // wires cross to their new places: wire i goes to row list[i], each curve over a paper-coloured gap
        const list = permList(it), x1 = X - WIDE / 2, x2 = X + WIDE / 2;
        list.forEach((to, i) => {
          if (r + i >= R || r + to - 1 >= R) return;
          const ya = cy[r + i], yb = cy[r + to - 1];
          gapCurve(x1, ya, x2, yb); curve(x1, ya, x2, yb, p);
        });
      }
    }

    // ---- slices: a dashed line between columns, across every wire, its label on top.
    // \slice[style=…,label style=…]{label}, or slice all (titles from slice titles, \col for the number)
    const slices = [];
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) for (const it of at(r, c)) if (it.name === 'slice') slices.push({ c, lab: { r, c, i: at(r, c).indexOf(it) }, t: plain(it.a[0]), ls: sty(O(it).map.style), ll: sty((O(it).map as Record<string, any>)['label style']), so: opts(O(it).map.style || ''), lo: opts((O(it).map as Record<string, any>)['label style'] || '') });
    if (envHas('slice all')) {
      const last = (rows[R - 1] || []).length, rem = intArg((env.map as Record<string, any>)['remove end slices'], 0);
      for (let n = 2; n <= last - 1 - rem; n++) {
        const tt = (env.map as Record<string, any>)['slice titles'] != null ? (env.map as Record<string, any>)['slice titles'] : '\\col';
        slices.push({ c: n - 1, t: plain(tt.replace(/\\col\b/g, String(n - 1))), ls: sty((env.map as Record<string, any>)['slice style']), ll: sty((env.map as Record<string, any>)['slice label style']) });
      }
    }
    if (envHas('vertical slice labels')) warn('vertical slice labels are drawn level here (LaTeX stacks them)');
    for (const sl of slices) {
      const c = Math.min(sl.c, C - 1), xs = c < C - 1 ? (colR(c) + colL[c + 1]) / 2 : colR(c) + cs.px / 2;
      // quantikz: red, dashed 5pt/3pt, from the top row's top to 3pt under the bottom row (rows fitted with 1/3em)
      // shorten <= / >= cut the line to fewer wires; draw=none leaves only the label (a second label below)
      const y1 = rowT[0] - E / 3, y2 = rowT[R - 1] + rowH[R - 1] + E / 3 + 3 / K, so = sl.so ? sl.so.map : {};
      const s1 = length((so as Record<string, any>)['shorten <'] ?? '', E)?.px || 0, s2 = length((so as Record<string, any>)['shorten >'] ?? '', E)?.px || 0;
      if (sl.ls.draw !== 'none') ops.push({ k: 'line', x1: xs, y1: y1 + s1, x2: xs, y2: y2 - s2, slice: true, ...paint({ draw: sl.ls.draw, lw: sl.ls.lw }) });
      // the label: a node at pos along the full line (0 the top), anchor south, 4pt inner sep; label style moves it
      if (sl.t) {
        const b = box(sl.t);
        let pos = 0, anchor = 'south', xsh = 0, ysh = 0;
        for (const e of sl.lo ? sl.lo.list : []) {
          let q;
          if ((q = /^pos\s*=\s*([\d.]+)/.exec(e))) pos = +q[1];
          else if ((q = /^anchor\s*=\s*([\w ]+)/.exec(e))) anchor = q[1].trim();
          else if ((q = /^xshift\s*=\s*(.+)$/.exec(e))) xsh += length(q[1], E)?.px || 0;
          else if ((q = /^yshift\s*=\s*(.+)$/.exec(e))) ysh += length(q[1], E)?.px || 0;
        }
        const half = 4 / K + inkH(b) / 2, py = y1 + (y2 - y1) * pos;
        ops.push({ k: 'text', t: sl.t, x: xs + xsh, y: (/north/.test(anchor) ? py + half : /south/.test(anchor) ? py - half : py) - ysh, b, lab: sl.lab, ...(sl.ll.text ? { tc: sl.ll.text } : {}) });
      }
    }
    ops.unshift(...back);
    ops.push(...front);

    // bounding box of everything
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a: any, b: any, c: any, d: any) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const o of ops) {
      if (o.k === 'wire' || o.k === 'line') ext(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2) - 1.5, Math.max(o.x1, o.x2), Math.max(o.y1, o.y2) + 1.5);
      else if (o.k === 'rect') ext(o.x, o.y, o.x + o.w, o.y + o.h);
      else if (o.k === 'text') ext(o.x - o.b.w / 2 - PADX, o.y - o.b.h / 2 - PAD, o.x + o.b.w / 2 + PADX, o.y + o.b.h / 2 + PAD); // a label node keeps its inner sep
      else if (o.k === 'path') ext(...(o.bb as [any, any, any, any]));
      else if (o.k === 'dot' || o.k === 'targ') ext(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
    }
    // TeX measures the picture by its matrix node, which has an inner sep (1/3 of a 10pt em, whatever the circuit's size)
    // all round the grid of cells, and a meter carries an empty label node above it (0.1cm up, about an ex tall)
    ext(colL[0] - PAD, rowT[0] - PAD, colR(C - 1) + PAD, rowT[R - 1] + rowH[R - 1] + PAD);
    for (const m of meterTops) ext(m.x - m.w / 2, m.y - 0.1 * PX - 0.44 * Q, m.x + m.w / 2, m.y);
    // nothing drawn (every wire switched off): the grid's own extent
    if (!(x2 > x1)) { x1 = colL[0]; x2 = colL[C - 1] + colW[C - 1]; }
    if (!(y2 > y1)) { y1 = rowT[0]; y2 = rowT[R - 1] + rowH[R - 1]; }
    const look = { gap: GAP, lw: LW, clear, ink: hue(env.map.color), paper: hue((env.map as Record<string, any>)['background color']) };
    return { ops, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, R, C, look, groups, geo: { colL, colW, cx, rowT, rowH, cy, cs: cs.px, rs: rs.px } };
  }

  // ---------------------------------------------------------------- drawing
  function draw(s: any, ctx: any) {
    const Lo = layout(s), st = { size: s.size || 'normalsize', font: s.font }, lk = Lo.look || { gap: 0.03 * PX, lw: 0.8 / K };
    // the environment's color= and background color= win over the block's colour and the page
    const ink = lk.ink && lk.ink !== 'none' ? lk.ink : s.color || '#000000';
    const col = TD.css(ink), white = lk.paper && lk.paper !== 'none' ? lk.paper : ctx.paper || '#ffffff';
    const w = r2(lk.lw), dd = lk.gap; // quantikz draws 'thick' (thin lines: thin); half the gap of a classical double wire
    const sc = (o: any) => (o.sc && o.sc !== 'none' ? o.sc : o.sc === 'none' ? 'none' : col);
    const fc = (o: any) => (o.fc ? o.fc : lk.clear ? 'none' : white);
    const sw = (o: any) => (o.lw ? r2(o.lw) : w);
    const dash = ` stroke-dasharray="${r2(3 / K)} ${r2(2 / K)}"`;
    const line = (a: any, b: any, c: any, d: any, o: Record<string, any> = {}, extra = '') => `<path d="M${r2(a)},${r2(b)}L${r2(c)},${r2(d)}" stroke="${sc(o)}" stroke-width="${sw(o)}" fill="none" stroke-linecap="round"${o.dash ? dash : ''}${extra}/>`;
    let out = '';
    for (const o of Lo.ops) {
      if (o.k === 'empty') {
        out += `<rect x="0" y="0" width="${r2(o.w)}" height="${r2(o.h)}" fill="none" stroke="${col}" stroke-width="${w}"${dash} rx="4"/>`;
        if (!ctx.export) out += TD.textSvg('Empty circuit', { size: 'small', font: s.font }, '#888888', o.w / 2, o.h / 2, ctx);
      } else if (o.k === 'wire') {
        // classical: two lines a gap either side; bundle: those and the middle one
        const v = o.x1 === o.x2, off = (k: any) => line(o.x1 + (v ? k : 0), o.y1 + (v ? 0 : k), o.x2 + (v ? k : 0), o.y2 + (v ? 0 : k), o);
        if (o.t === 'c') out += off(-dd) + off(dd);
        else if (o.t === 'b') out += off(-dd) + off(dd) + off(0);
        else out += off(0);
      } else if (o.k === 'line') out += o.slice ? `<path d="M${r2(o.x1)},${r2(o.y1)}L${r2(o.x2)},${r2(o.y2)}" stroke="${o.sc || '#ff0000'}" stroke-width="${o.lw ? r2(o.lw) : w}" fill="none" stroke-dasharray="${r2(5 / K)} ${r2(3 / K)}"/>` : line(o.x1, o.y1, o.x2, o.y2, o);
      else if (o.k === 'rect') {
        out += `<rect x="${r2(o.x)}" y="${r2(o.y)}" width="${r2(o.w)}" height="${r2(o.h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${o.fill ? fc(o) : 'none'}" stroke="${o.stroke === false ? 'none' : sc(o)}" stroke-width="${sw(o)}"${o.dash ? dash : ''}/>`;
      } else if (o.k === 'path') {
        if (o.gap) out += `<path d="${o.d}" fill="none" stroke="${white}" stroke-width="${r2(o.gap)}"/>`;
        else out += `<path d="${o.d}" fill="${o.solid ? sc(o) : o.fill ? fc(o) : 'none'}" stroke="${o.stroke === false ? 'none' : sc(o)}" stroke-width="${sw(o)}"${o.solid ? ' stroke-linejoin="round"' : ''}${o.cap ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}${o.dash ? dash : ''}/>`;
      } else if (o.k === 'dot') out += `<circle cx="${r2(o.x)}" cy="${r2(o.y)}" r="${r2(o.r)}" fill="${o.open ? (lk.clear && !o.fc ? white : fc(o)) : o.fc || sc(o)}" stroke="${sc(o)}" stroke-width="${sw(o)}"/>`;
      else if (o.k === 'targ') {
        out += `<circle cx="${r2(o.x)}" cy="${r2(o.y)}" r="${r2(o.r)}" fill="${fc(o)}" stroke="${sc(o)}" stroke-width="${sw(o)}"/>` + line(o.x - o.r, o.y, o.x + o.r, o.y, o) + line(o.x, o.y - o.r, o.x, o.y + o.r, o);
      } else if (o.k === 'text') out += TD.textSvg(o.t, o.small ? { size: o.small === true ? 'footnotesize' : o.small, font: s.font } : st, o.tc && o.tc !== 'none' ? o.tc : ink, o.x, o.y, ctx);
    }
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  // the code as it goes into LaTeX: always a full quantikz environment
  function fullCode(src: any) {
    let t = String(src || '').trim();
    const begin = /\\begin\{quantikz\}/.exec(t);
    let start = begin ? skipWs(t, begin.index + begin[0].length) : 0;
    if (begin && t[start] === '[') { const end = close(t, start); if (end >= 0) start = end + 1; }
    const stop = begin ? t.indexOf('\\end{quantikz}', start) : -1;
    const end = stop < 0 ? t.length : stop, rows = grid(t.slice(start, end));
    if (measurementOutputs(rows)) {
      const body = rows.map((row: any, i: number) => row.map((value: string) => value.trim()).join(' & ') + (i < rows.length - 1 ? ' \\\\' + (rows.seps[i] || '') + '\n' : '')).join('');
      t = t.slice(0, start) + '\n' + body + '\n' + t.slice(end);
    }
    return begin ? t : `\\begin{quantikz}\n${t}\n\\end{quantikz}`;
  }

  // A small drawing of a snippet, for the command suggestions: in the UI's ink, on its surface colour.
  TD.qcMini = (src: any, maxH = 30, paper = 'var(--qc-paper, var(--sheet-raised))') => {
    const s = { type: 'qc', x: 0, y: 0, src, size: 'small', font: 'default', color: 'currentColor' };
    const bb = layout(s).bb, k = Math.min(1, maxH / bb.h);
    return `<svg class="qcmini" width="${r2(bb.w * k)}" height="${r2(bb.h * k)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" aria-hidden="true">${draw(s, { export: true, paper })}</svg>`;
  };

  TD.TYPES.qc = {
    name: 'Quantum circuit',
    pts: [['x', 'y']],
    create: (p: any, d: any) => ({ type: 'qc', x: p.x, y: p.y, src: TD.QC_DEFAULT, size: TD.BLOCK_SIZE, font: 'default', color: '#000000' }),
    drag(s: any, a: any, q: any) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s: any) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // quantikz is a tikzpicture of its own: it sits in a plain node (no options, which the
    // circuit's nodes would inherit), centred where the drawing is, with the outer picture
    // interrupted so its shift / overlay settings don't reach the circuit.
    tikz(s: any, X: any) {
      X.libs.add('quantikz2');
      const b = layout(s).bb;
      // the block's text size and font, as the canvas lays it out (a font switch the circuit's text inherits)
      const fo = TD.textOpts({ size: s.size, font: s.font }, X);
      return `\\node${fo.length ? `[${fo.join(', ')}]` : ''} at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  // property panel: the code, what is not drawn, and a copy button
  
  TD.qcLayout = layout;
  // for the visual editor (src/editors/qceditor.ts)
  TD.qc = { ARGS, IGNORED, unwrap, grid, cell, opts, close, draw, layout, fullCode };
  // Application integration belongs to the block, alongside its model and panel.
  TD.blocks.register("qc", {
    menu: { order: 3, label: "Quantum", title: "Quantum circuit, written in quantikz", icon: "<svg viewBox=\"0 0 32 24\"><path d=\"M2 7h28M2 17h28M14 7v10\"/><rect x=\"5\" y=\"3\" width=\"7\" height=\"8\" class=\"a1\"/><circle cx=\"14\" cy=\"7\" r=\"1.6\" style=\"fill:var(--graphite)\"/><circle cx=\"14\" cy=\"17\" r=\"3.2\" fill=\"none\"/><path d=\"M14 14v6M11 17h6\"/><rect x=\"21\" y=\"13\" width=\"8\" height=\"8\" class=\"a1\"/><path d=\"M22.5 19.5a2.5 2.5 0 015 0M25 19.5l1.8-3\"/></svg>" },
    nodeImport: { re: /\\begin\{quantikz\}[\s\S]*\\end\{quantikz\}/, order: 0, bb: (q) => TD.qcLayout(q).bb, dedent: true },
    fixed: true,
    geometry: [['x', 'x'], ['y', 'y']],
    refreshOnDoubleClick: false,
    editor: { get: () => TD.qcEditor, alias: "qcOpen" }
  });
  panelServices = { layout, fullCode };
})();
