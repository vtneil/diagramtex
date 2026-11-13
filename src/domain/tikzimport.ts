import { runtime as TD } from '../runtime';
// Import from LaTeX / TikZ: parses the common TikZ subset (and everything DiagramTeX exports)
// into shapes; a full document is split into text and diagram blocks.
(function () {
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  const NAMED = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff',
    yellow: '#ffff00', gray: '#808080', grey: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', brown: '#bf8040', lime: '#bfff00',
    olive: '#808000', orange: '#ff8000', pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
  };
  const TIP_NAMES: Record<string, any> = { stealth: 'stealth', latex: 'latex', to: 'to', '>': 'to', bar: 'bar', '|': 'bar', circle: 'circle', 'circle[open]': 'ocircle', o: 'ocircle', '<': 'to' };
  // exact arrows.meta specs written by the exporter (TD.TIKZ_TIP), compared without spaces
  const TIP_EXACT = () => Object.fromEntries<any>(Object.entries<any>(TD.TIKZ_TIP || {}).map(([k, v]) => [v.toLowerCase().replace(/\s+/g, ''), k]));

  // ---------- small helpers ----------
  const hex2 = (n: any) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  function splitTop(s: any, sep: any) { // split at depth-0 separators (braces / brackets / parens)
    const out = []; let d = 0, buf = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { buf += c + s[i + 1]; i++; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      if (c === sep && d === 0) { out.push(buf); buf = ''; } else buf += c;
    }
    out.push(buf);
    return out;
  }
  function matchClose(s: any, i: any, open: any, close: any) { // index of the bracket closing the one at s[i]
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === open) d++;
      else if (s[j] === close) { d--; if (d === 0) return j; }
    }
    return -1;
  }
  // the same, or the end of the text when the bracket is never closed (so a reader always moves on)
  const shut = (s: any, i: any, open: any, close: any) => { const e = matchClose(s, i, open, close); return e < 0 ? s.length : e; };
  // append every item of b to a (a spread into push overflows the stack on huge lists)
  const pushAll = (a: any[], b: any[]) => { for (const x of b) a.push(x); return a; };
  // the least of a list (Infinity when empty), without spreading it into Math.min
  const least = (l: number[]) => { let m = Infinity; for (const v of l) if (v < m) m = v; return m; };
  function stripComments(src: any) {
    return src.split('\n').map((l: any) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); } return l; }).join('\n');
  }
  // numeric macros the picture defines (\def\r{1.5}, \newcommand{\r}{2pt}, \pgfmathsetmacro{\r}{3/2}): name -> text,
  // written into coordinates and lengths where they are used. MAC is the current picture's (set by parseStatements).
  let MAC: any = null;
  function expandMac(v: any) {
    v = String(v);
    if (!MAC || !MAC.size || !v.includes('\\')) return v;
    const t = v.trim(), whole = /^\\([A-Za-z@]+)$/.exec(t);
    if (whole && MAC.has(whole[1])) return MAC.get(whole[1]);
    return v.replace(/\\([A-Za-z@]+)/g, (m: any, n: any) => (MAC.has(n) ? `(${MAC.get(n)})` : m));
  }
  // a macro definition's name and value, when it takes no arguments
  function macroDef(name: any, args: any) {
    const m = /^\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*(\[[^\]]*\])?\s*\{([\s\S]*)\}\s*;?\s*$/.exec(args);
    if (!m || m[2]) return null;
    let v = expandMac(m[3].trim());
    // a macro written in terms of itself (\def\a{\a\a}) doubles at every definition: give up past a sane size
    if (v.length > 4096) return null;
    if (/^pgfmath/.test(name)) { const n = TD.evalNumber ? TD.evalNumber(v, NaN) : NaN; if (!isFinite(n)) return null; v = String(+n.toFixed(6)); }
    return isFinite(len(v) as number) ? { nm: m[1], v } : null;
  }
  // length with unit -> px (default unit: cm for coordinates, pt for widths)
  function len(v: any, defUnit = 'cm') {
    v = expandMac(v);
    const m = String(v).trim().match(/^([-+]?[\d.]*\d(?:e[-+]?\d+)?|[-+]?\.\d+)\s*(cm|mm|pt|in|em|ex|bp)?$/i);
    if (!m) { const e = TD.evalNumber ? TD.evalNumber(v, NaN) : NaN; return isFinite(e) ? (defUnit === 'pt' ? e / K : e * PX) : NaN; }
    const n = parseFloat(m[1]), u = (m[2] || defUnit).toLowerCase();
    return { cm: n * PX, mm: n * PX / 10, pt: n / K, bp: n * 1.00375 / K, in: n * 2.54 * PX, em: n * 10 / K, ex: n * 4.3 / K }[u];
  }

  function makeCtx() {
    return { colors: { ...NAMED }, macros: new Map(), names: {}, sx: PX, sy: PX, warnings: [], styles: new Map(), boxes: {} };
  }
  // xcolor's svgnames (DarkBlue, ForestGreen, SteelBlue…) are the CSS colour names, written in CamelCase; the
  // browser knows their values. Lower-case names stay xcolor's own (green is #00ff00 there, not CSS's #008000).
  let svgCtx: any = null;
  function svgName(n: any) {
    if (!/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(n)) return null;
    try {
      svgCtx = svgCtx || document.createElement('canvas').getContext('2d');
      if (!svgCtx) return null;
      svgCtx.fillStyle = '#010203'; svgCtx.fillStyle = n;
      const v = String(svgCtx.fillStyle).toLowerCase();
      return v === '#010203' || !/^#[0-9a-f]{6}$/.test(v) ? null : v;
    } catch (e: any) { return null; }
  }
  function color(C: any, spec: any) {
    if (!spec) return null;
    spec = spec.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
    if (spec === 'none') return null;
    // xcolor's rgb,255:red,92;green,214;blue,92 (as q.uiver.app writes colours)
    if (/:/.test(spec) && TD.xcolorExpr) return TD.xcolorExpr(spec, (n: any) => C.colors[n.trim()] || C.colors[n.trim().toLowerCase()] || null) || undefined;
    // mixes: red!50, red!30!blue, red!50!black
    const parts = spec.split('!').map((x: any) => x.trim());
    const base = (n: any) => C.colors[n] || C.colors[n.toLowerCase()] || svgName(n);
    let c = base(parts[0]);
    if (!c) return undefined;
    const rgb = (h: any) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    let i = 1;
    while (i < parts.length) {
      const pct = parseFloat(parts[i]) / 100;
      const other = parts[i + 1] ? base(parts[i + 1]) : '#ffffff';
      if (!isFinite(pct) || !other) break;
      const a = rgb(c), b = rgb(other);
      c = '#' + a.map((v, k) => hex2(v * pct + b[k] * (1 - pct))).join('');
      i += 2;
    }
    return c;
  }
  // styles named in an option list (\tikzset{name/.style={…}}) stand for their keys; styUsed collects the names
  // a statement used, and styOff reads them as nothing (the statement without its styles: what the styles add)
  let STY: any = null, styUsed: any = null, styOff = false;
  function parseOpts(str: any, depth = 0, raw = false) : any {
    if (!str) return [];
    const out = [];
    for (const x of splitTop(str, ',').map((q) => q.trim()).filter(Boolean)) {
      const eq = splitTop(x, '=');
      const o = eq.length > 1 ? { k: eq[0].trim(), v: eq.slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1') } : { k: x, v: null };
      if (!raw && o.v === null && STY && STY.has(o.k) && depth < 8) {
        if (styUsed) styUsed.add(o.k);
        if (!styOff) out.push(...parseOpts(STY.get(o.k), depth + 1));
        continue;
      }
      out.push(o);
    }
    return out;
  }
  // \tikzset{a/.style={…}, …}, \tikzstyle{a}=[…] and a picture's a/.style={…}: styles with fixed keys only
  function addStyle(C: any, nm: any, body: any) {
    if (/#\d/.test(body) || /^every /.test(nm)) { C.styles.delete(nm); return; }
    C.styles.set(nm, body);
  }
  function defineStyles(C: any, cmd: any, args: any) {
    if (cmd === 'tikzstyle') { const m = /^\s*\{([^}]*)\}\s*=?\s*\[([\s\S]*)\]/.exec(args); if (m) addStyle(C, m[1].trim(), m[2]); return; }
    const m = /^\s*\{([\s\S]*)\}/.exec(args);
    if (!m) return;
    for (const { k, v } of parseOpts(m[1], 0, true)) {
      const sm = /^(.+?)\/\.(style|append style|prefix style|style \d+ args|style n args|default)$/.exec(k);
      if (!sm) continue;
      if (sm[2] === 'style' && v != null) addStyle(C, sm[1].trim(), v); else C.styles.delete(sm[1].trim());
    }
  }
  let gtTip: any = null; // the tip `>` stands for in the picture being read (>=Stealth), null for TikZ's default
  function arrowSpec(spec: any) { // "->", "{Stealth}-{Latex[open]}", "<->", "-latex", "|->"
    const m = spec.match(/^(.*?)-(?!.*-)(.*)$/);
    if (!m) return null;
    const one = (t: any) => {
      t = t.trim().replace(/^\{|\}$/g, '').trim();
      if (!t) return 'none';
      const ex = TIP_EXACT()[t.toLowerCase().replace(/\s+/g, '')];
      if (ex) return ex;
      t = t.replace(/\[.*\]/, (x: any) => (/open/.test(x) ? '[open]' : ''));
      const k = t.toLowerCase().replace(/\s+/g, '');
      if ((k === '>' || k === '<') && gtTip) return gtTip; // the picture's >=… default
      if (k.includes('hook')) return 'to';
      if (k === '>>' || k === '<<') return 'to';
      return TIP_NAMES[k] || (k.length ? 'stealth' : 'none');
    };
    return { start: one(m[1]), end: one(m[2]) };
  }
  // style from options
  function style(C: any, opts: any, cmd: any) {
    if (C.base && C.base.length) opts = [...C.base, ...opts]; // the picture's own line width, dash and colour come first
    const st: Record<string, any> = { stroke: cmd === 'fill' || cmd === 'shade' || cmd === 'path' ? null : '#000000', fill: cmd === 'fill' || cmd === 'filldraw' ? '#000000' : null, width: 0.4 / K, dash: 'solid', opacity: 1, startTip: 'none', endTip: 'none' };
    let strokeOpacity = 1, fillOpacity = 1, colorAll = null;
    const W: Record<string, any> = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
    for (const { k, v } of opts) {
      if (v === null) {
        if (W[k] != null) st.width = W[k] / K;
        else if (k === 'dashed' || k === 'densely dashed' || k === 'loosely dashed') st.dash = 'dashed';
        else if (k === 'dotted' || k === 'densely dotted' || k === 'loosely dotted') st.dash = 'dotted';
        else if (k === 'dash dot' || k === 'dashdotted') st.dash = 'dashdot';
        else if (k.includes('-') && arrowSpec(k)) { const a = arrowSpec(k); st.startTip = a!.start; st.endTip = a!.end; }
        else { const c = color(C, k); if (c !== undefined) colorAll = c; }
        continue;
      }
      switch (k) {
        case 'draw': st.stroke = color(C, v) ?? (v === 'none' ? null : st.stroke || '#000000'); if (v !== 'none' && st.stroke == null) st.stroke = '#000000'; break;
        case 'fill': st.fill = color(C, v) ?? null; break;
        case 'color': colorAll = color(C, v) ?? null; break;
        case 'line width': st.width = len(v, 'pt'); break;
        case 'shorten >': st.shEnd = len(v, 'pt'); break;
        case 'shorten <': st.shStart = len(v, 'pt'); break;
        case 'opacity': st.opacity = parseFloat(v); break;
        case 'draw opacity': strokeOpacity = parseFloat(v); break;
        case 'fill opacity': fillOpacity = parseFloat(v); break;
        case 'rounded corners': st.radius = len(v, 'pt'); break;
        case 'ball color': st.ballColor = color(C, v); break;
        case 'text': st.color = color(C, v); break;
        case 'font': st.font = v; break;
        case 'dash pattern': {
          // on/off lengths in pt: the model keeps them as a custom dash ('p:on off …'); anything else stays unread
          const q = [...v.matchAll(/(on|off)\s*([\d.]+)\s*pt/g)];
          if (q.length && q.map((m) => m[0]).join(' ').replace(/\s+/g, '') === v.replace(/\s+/g, '')) st.dash = 'p:' + q.map((m) => +m[2]).join(' ');
          else st.dashUnread = true;
          break;
        }
        case 'decoration': st.decoration = v; break;
        case 'pos': st.pos = parseFloat(v); break;
        case 'anchor': st.anchor = v; break;
        case 'rotate': st.rotate = parseFloat(v); break;
        case 'radius': st.r = len(v); break;
        case 'x radius': st.rx = len(v); break;
        case 'y radius': st.ry = len(v); break;
        case 'start angle': st.a1 = parseFloat(v); break;
        case 'end angle': st.a2 = parseFloat(v); break;
        case 'delta angle': st.da = parseFloat(v); break;
        // bend left=0 is a straight bend, not the default 30°
        case 'bend left': { const b = parseFloat(v); st.bend = isFinite(b) ? b : 30; break; }
        case 'bend right': { const b = parseFloat(v); st.bend = -(isFinite(b) ? b : 30); break; }
        case 'above': case 'below': case 'left': case 'right': st.place = k; break;
        default: break;
      }
    }
    for (const { k } of opts) if (['above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'auto', 'swap', "'", 'sloped', 'midway', 'near start', 'near end', 'decorate', 'bend left', 'bend right'].includes(k)) st[k] = true;
    if (opts.some((o: any) => o.k === 'bend left' && o.v === null)) st.bend = 30;
    if (opts.some((o: any) => o.k === 'bend right' && o.v === null)) st.bend = -30;
    if (colorAll) {
      if (cmd !== 'fill' && cmd !== 'shade' && !opts.some((o: any) => o.k === 'draw')) st.stroke = colorAll;
      if ((cmd === 'fill' || cmd === 'filldraw') && !opts.some((o: any) => o.k === 'fill')) st.fill = colorAll;
      if (!st.color) st.color = colorAll;
    }
    const withA = (c: any, a: any) => (c && a < 1 ? c + hex2(a * 255) : c);
    st.stroke = withA(st.stroke, strokeOpacity);
    st.fill = withA(st.fill, fillOpacity);
    return st;
  }
  function fontStyle(fontStr: any) {
    const o: { size: string | number; font: string; bold: boolean; italic: boolean } = { size: 'normalsize', font: 'default', bold: false, italic: false };
    if (!fontStr) return o;
    const fs = fontStr.match(/\\fontsize\{([\d.]+)(pt)?\}/);
    if (fs) o.size = Math.round((parseFloat(fs[1]) / K) * 100) / 100;
    for (const [n] of TD.SIZES) if (new RegExp('\\\\' + n + '(?![a-zA-Z])').test(fontStr)) o.size = n;
    if (/\\bfseries|\\textbf/.test(fontStr)) o.bold = true;
    if (/\\itshape|\\textit/.test(fontStr)) o.italic = true;
    for (const fnt of TD.FONTS) if (fnt[3] && fontStr.includes(fnt[3])) o.font = fnt[0];
    return o;
  }

  // ---------- path tokenizer ----------
  // returns tokens: {t:'coord', x, y, rel:0|1|2} {t:'op', v:'--'|'..'|'controls'|'and'|'rectangle'|'circle'|'ellipse'|'arc'|'cycle'|'to'|'|-'|'-|'|'grid'}
  // {t:'node', opts, text} {t:'opts', v} {t:'paren', v} (for circle radius etc)
  function tokenizePath(C: any, s: any, warn?: any) {
    const toks = [];
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    while (i < s.length) {
      ws();
      if (i >= s.length) break;
      const rest = s.slice(i);
      let m;
      if (rest.startsWith('++(') || rest.startsWith('+(')) {
        const rel = rest[1] === '+' ? 2 : 1;
        const st = i + rel, e = shut(s, st, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(st + 1, e), rel });
        i = e + 1; continue;
      }
      if (rest[0] === '(') {
        const e = shut(s, i, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(i + 1, e), rel: 0 });
        i = e + 1; continue;
      }
      if (rest[0] === '[') { const e = shut(s, i, '[', ']'); toks.push({ t: 'opts', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      if ((m = rest.match(/^(--|\.\.|\|-|-\|)/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if ((m = rest.match(/^(node|coordinate)\b\s*/))) {
        i += m[0].length;
        let opts = '', name = '';
        for (;;) {
          ws();
          if (s[i] === '[') { const e = shut(s, i, '[', ']'); opts += (opts ? ',' : '') + s.slice(i + 1, e); i = e + 1; continue; }
          if (s[i] === '(') { const e = shut(s, i, '(', ')'); name = s.slice(i + 1, e); i = e + 1; continue; }
          if (s.slice(i, i + 2) === 'at') { i += 2; ws(); const e = shut(s, i, '(', ')'); toks.push({ t: 'at', raw: s.slice(i + 1, e) }); i = e + 1; continue; }
          break;
        }
        let text = '';
        if (m[1] === 'node' && s[i] === '{') { const e = shut(s, i, '{', '}'); text = s.slice(i + 1, e); i = e + 1; }
        toks.push({ t: 'node', opts, text, name, coordinate: m[1] === 'coordinate' });
        continue;
      }
      if ((m = rest.match(/^(controls|and|rectangle|circle|ellipse|arc|cycle|to|grid|edge|let|in|plot|sin|cos|parabola)\b/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if (rest[0] === '{') { const e = shut(s, i, '{', '}'); toks.push({ t: 'brace', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      warn && warn(`Unknown path text “${rest.slice(0, 12)}”`);
      i++;
    }
    return toks;
  }
  function coord(C: any, raw: any, cur?: any) : any {
    raw = expandMac(raw.trim());
    let m;
    if ((m = raw.match(/^([^,:]+):([^,:]+)$/))) { // polar
      const a = (TD.evalNumber(m[1], 0) * Math.PI) / 180, r = len(m[2]);
      return { x: Math.cos(a) * r!, y: -Math.sin(a) * r! };
    }
    if ((m = raw.match(/^\$(.*)\$$/))) { // calc: ($(a)!0.5!(b)$) or ($(a)+(1,0)$) — midpoints only
      const mm = m[1].match(/^\(([^)]*)\)!([\d.]+)!\(([^)]*)\)$/);
      if (mm) { const a: any = coord(C, mm[1]), b: any = coord(C, mm[3]), t = parseFloat(mm[2]); if (a && b) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
      return null;
    }
    const parts = splitTop(raw, ',');
    if (parts.length === 2) {
      const x = len(parts[0]), y = len(parts[1]);
      if (isFinite(x!) && isFinite(y!)) return { x: x! * (C.sx / PX), y: -y! * (C.sy / PX) };
    }
    if (parts.length === 3) return null; // 3d
    const nm = raw.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (C.names[nm]) return { ...C.names[nm], node: nm };
    return null;
  }

  // ---------- shapes from a path command ----------
  function pathToShapes(C: any, cmd: any, optStr: any, body: any) {
    const opts = parseOpts(optStr);
    const st = style(C, opts, cmd);
    const toks = tokenizePath(C, body, (w: any) => C.warnings.push(w));
    const out: any[] = [];
    const L = { label: '', labelPos: 0.5, labelSide: 'left', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000' };
    const lineStyle = { stroke: st.stroke, width: st.width, dash: st.dash, opacity: st.opacity };
    // Walk the path building "subpaths" of segments.
    let cur: any = null, start = null;
    let segs: any[] = []; // {k:'L'|'C', pts:[...], label}
    let closed = false;
    const flush = () => {
      if (!segs.length) return;
      emitSegs(segs, closed);
      segs = []; closed = false;
    };
    const emitSegs = (sg: any, cl: any) => {
      const tipStart = st.startTip, tipEnd = st.endTip;
      if (sg.length === 1 && !cl) {
        const g = sg[0];
        if (g.k === 'L') {
          const [a, b] = g.pts;
          if (st.decorate && /zigzag/.test(st.decoration || '')) {
            const seg = (st.decoration.match(/segment length=([^,}]+)/) || [])[1];
            const amp = (st.decoration.match(/amplitude=([^,}]+)/) || [])[1];
            const Lp = Math.hypot(b.x - a.x, b.y - a.y);
            const pre = len((st.decoration.match(/pre length=([^,}]+)/) || [])[1] || '0');
            out.push({ type: 'spring', x1: a.x, y1: a.y, x2: b.x, y2: b.y, coils: Math.max(1, Math.round((Lp - 2 * (pre || 0)) / (seg ? len(seg) : 10)!)), amplitude: amp ? len(amp) : 6, ...lineStyle, stroke: st.stroke || '#000000', dash: 'solid' });
            return;
          }
          if (st.bend) { // to[bend ...] -> cubic
            const u = { x: b.x - a.x, y: b.y - a.y }, d = Math.hypot(u.x, u.y), th = (st.bend * Math.PI) / 180;
            const ux = u.x / d, uy = u.y / d, c = Math.cos(th), sn = Math.sin(th), Lc = 0.3915 * d;
            const dA = { x: ux * c + uy * sn, y: -ux * sn + uy * c }, dB = { x: -ux * c + uy * sn, y: -ux * sn - uy * c };
            out.push({ type: 'curve', x1: a.x, y1: a.y, cx1: a.x + dA.x * Lc, cy1: a.y + dA.y * Lc, cx2: b.x + dB.x * Lc, cy2: b.y + dB.y * Lc, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || '#000000', startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}) });
            return;
          }
          out.push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || (st.fill ? null : '#000000'), startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}) });
          if (!st.stroke && st.fill) out[out.length - 1].stroke = st.fill;
          return;
        }
        if (g.k === 'C') {
          const [a, c1, c2, b] = g.pts;
          out.push({ type: 'curve', x1: a.x, y1: a.y, cx1: c1.x, cy1: c1.y, cx2: c2.x, cy2: c2.y, x2: b.x, y2: b.y, ...lineStyle, stroke: st.stroke || '#000000', startTip: tipStart, endTip: tipEnd, ...L, ...(g.label || {}) });
          return;
        }
      }
      // polyline / polygon (curves & arcs sampled)
      const pts = [];
      for (const g of sg) {
        if (g.k === 'L') { if (!pts.length) pts.push(g.pts[0]); pts.push(g.pts[1]); }
        else if (g.k === 'C') {
          const [a, c1, c2, b] = g.pts;
          if (!pts.length) pts.push(a);
          for (let i = 1; i <= 16; i++) { const t = i / 16, m = 1 - t; pts.push({ x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x, y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y }); }
        } else if (g.k === 'A') { if (!pts.length) pts.push(g.pts[0]); pushAll(pts, g.pts.slice(1)); }
      }
      if (pts.length < 2) return;
      if (cl && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.01) pts.pop();
      out.push({ type: 'poly', pts: pts.map((p) => [p.x, p.y]), closed: cl, ...lineStyle, fill: cl ? st.fill : null, startTip: cl ? 'none' : tipStart, endTip: cl ? 'none' : tipEnd });
    };
    const resolve = (tk: any) => {
      const p = coord(C, tk.raw, cur);
      if (!p) { C.warnings.push(`Unsupported coordinate (${tk.raw})`); return null; }
      if (tk.rel && cur) return { x: cur.x + p.x, y: cur.y + p.y };
      return p;
    };
    let pendingOp = null, ctrl = [], lastSegLabel = null, lastArc = null;
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t === 'coord') {
        const relKind = tk.rel;
        const p = resolve(tk);
        if (!p) { pendingOp = null; continue; }
        if (pendingOp === 'controls') { ctrl.push(p); continue; }
        if (pendingOp === '--' || pendingOp === 'to' || pendingOp === '|-' || pendingOp === '-|') {
          if (pendingOp === '|-') segs.push({ k: 'L', pts: [cur, { x: cur.x, y: p.y }] }, { k: 'L', pts: [{ x: cur.x, y: p.y }, p] });
          else if (pendingOp === '-|') segs.push({ k: 'L', pts: [cur, { x: p.x, y: cur.y }] }, { k: 'L', pts: [{ x: p.x, y: cur.y }, p] });
          else segs.push({ k: 'L', pts: [cur, p], label: lastSegLabel });
          lastSegLabel = null;
        } else if (pendingOp === '..') {
          const c1 = ctrl[0], c2 = ctrl[1] || ctrl[0];
          segs.push({ k: 'C', pts: [cur, c1, c2, p] });
          ctrl = [];
        } else if (pendingOp === 'rectangle') {
          flush();
          const x = Math.min(cur.x, p.x), y = Math.min(cur.y, p.y);
          out.push({ type: 'rect', x, y, w: Math.abs(p.x - cur.x), h: Math.abs(p.y - cur.y), radius: st.radius || 0, ...lineStyle, fill: st.fill });
        } else if (pendingOp === 'grid') {
          flush();
          C.warnings.push('grid paths are drawn as a rectangle');
          out.push({ type: 'rect', x: Math.min(cur.x, p.x), y: Math.min(cur.y, p.y), w: Math.abs(p.x - cur.x), h: Math.abs(p.y - cur.y), radius: 0, ...lineStyle, fill: null });
        } else { // move-to
          flush();
          start = p;
        }
        if (relKind !== 1) cur = p; else if (!cur) cur = p;
        if (relKind === 1 && pendingOp) { /* + does not update current point */ }
        pendingOp = null;
        continue;
      }
      if (tk.t === 'op') {
        switch (tk.v) {
          case '--': case 'to': case '|-': case '-|': case 'rectangle': case 'grid': pendingOp = tk.v; break;
          case '..': pendingOp = pendingOp === 'and' || pendingOp === 'controls' ? '..' : 'controls'; if (pendingOp === 'controls') ctrl = []; break;
          case 'controls': pendingOp = 'controls'; ctrl = []; break;
          case 'and': break;
          case 'cycle':
            if (pendingOp === '--' && start && cur) segs.push({ k: 'L', pts: [cur, start] });
            closed = true; pendingOp = null; cur = start; flush(); break;
          case 'circle': case 'ellipse': {
            let rx, ry;
            const nx = toks[i + 1];
            if (nx && nx.t === 'coord') { // (r) or (rx and ry)
              const a = nx.raw.split(/\s+and\s+/);
              rx = len(a[0]); ry = a[1] ? len(a[1]) : rx; i++;
            } else if (nx && nx.t === 'opts') {
              const so = style(C, parseOpts(nx.v), cmd); rx = so.rx ?? so.r; ry = so.ry ?? so.r; i++;
            } else { rx = st.rx ?? st.r; ry = st.ry ?? st.r; }
            if (!cur || !isFinite(rx)) { C.warnings.push('circle without radius'); break; }
            flush();
            if (cmd === 'shade' || st.ballColor) out.push({ type: 'ball', cx: cur.x, cy: cur.y, r: rx, ballColor: st.ballColor || '#a05a5a', opacity: st.opacity });
            else if (!st.stroke && st.fill && rx <= 4.5 && Math.abs(rx - ry) < 1e-6) out.push({ type: 'dot', cx: cur.x, cy: cur.y, r: rx, color: st.fill, opacity: st.opacity });
            else out.push({ type: 'ellipse', cx: cur.x, cy: cur.y, rx, ry, ...lineStyle, fill: st.fill });
            break;
          }
          case 'arc': {
            const nx = toks[i + 1];
            let a1, a2, r, ry;
            if (nx && nx.t === 'opts') { const so = style(C, parseOpts(nx.v), cmd); a1 = so.a1; a2 = so.a2 ?? (so.da != null ? a1 + so.da : undefined); r = so.r ?? so.rx; ry = so.r != null ? r : so.ry ?? r; i++; }
            else if (nx && nx.t === 'coord') { const q = nx.raw.split(':'); a1 = TD.evalNumber(expandMac(q[0]), NaN); a2 = TD.evalNumber(expandMac(q[1]), NaN); const rr = (q[2] || '').split(/\s+and\s+/); r = len(rr[0]); ry = rr[1] != null ? len(rr[1]) : r; i++; }
            if (![a1, a2, r].every(isFinite) || !cur) { C.warnings.push('arc not understood'); break; }
            if (!isFinite(ry) || !(ry > 0)) ry = r;
            const c = { x: cur.x - r * Math.cos((a1 * Math.PI) / 180), y: cur.y + ry * Math.sin((a1 * Math.PI) / 180) };
            const end = { x: c.x + r * Math.cos((a2 * Math.PI) / 180), y: c.y - ry * Math.sin((a2 * Math.PI) / 180) };
            const simple = !segs.length && !(toks.slice(i + 1).some((t) => t.t === 'op' && t.v !== 'node'));
            if (simple && !st.fill) {
              let A1 = a1, A2 = a2;
              if (A2 < A1) [A1, A2] = [A2, A1];
              out.push({ type: 'arc', cx: c.x, cy: c.y, r, ...(Math.abs(ry - r) > 1e-6 ? { ry } : {}), a1: A1, a2: A2, _rev: a2 < a1, ...lineStyle, stroke: st.stroke || '#000000', startTip: a2 < a1 ? st.endTip : st.startTip, endTip: a2 < a1 ? st.startTip : st.endTip });
            } else {
              const n = Math.min(2000, Math.max(4, Math.ceil(Math.abs(a2 - a1) / 6))), pts = [cur];
              for (let k = 1; k <= n; k++) { const a = ((a1 + ((a2 - a1) * k) / n) * Math.PI) / 180; pts.push({ x: c.x + r * Math.cos(a), y: c.y - ry * Math.sin(a) }); }
              segs.push({ k: 'A', pts });
            }
            cur = end; lastArc = { c, r, a1, a2, end };
            break;
          }
          default: C.warnings.push(`Path operation “${tk.v}” not supported`);
        }
        continue;
      }
      if (tk.t === 'opts') { const so = style(C, parseOpts(tk.v), cmd); if (so.bend) st.bend = so.bend; continue; }
      if (tk.t === 'node') {
        const no = parseOpts(tk.opts), ns = style(C, no, 'node');
        const fs = fontStyle(ns.font);
        const lab = { label: tk.text, labelSide: no.some((o: any) => o.k === 'swap' || o.k === "'") ? 'right' : no.some((o: any) => o.k === 'fill') ? 'on' : 'left', labelPos: isFinite(ns.pos) ? ns.pos : no.some((o: any) => o.k === 'near start') ? 0.25 : no.some((o: any) => o.k === 'near end') ? 0.75 : 0.5, ...fs, color: ns.color || st.color || '#000000' };
        if (pendingOp === '--' || pendingOp === 'to') { lastSegLabel = lab; continue; }
        const along = no.some((o: any) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap'].includes(o.k));
        if (along && segs.length && segs[segs.length - 1].k === 'L' && segs.length === 1) { segs[0].label = lab; continue; }
        // midway (or pos=) on the arc just drawn: the point that far round it
        if (along && lastArc && lastArc.end === cur) {
          const A = lastArc, a = ((A.a1 + (A.a2 - A.a1) * lab.labelPos) * Math.PI) / 180;
          if (tk.text!.trim()) out.push(textShape(C, tk.text, no, { x: A.c.x + A.r * Math.cos(a), y: A.c.y - A.r * Math.sin(a) }, st.color));
          continue;
        }
        // node at the current point (e.g. after a coordinate): emit as a text shape
        if (cur && tk.text!.trim()) out.push(textShape(C, tk.text, no, cur, st.color));
        if (tk.name && cur) C.names[tk.name] = { ...cur };
        continue;
      }
    }
    flush();
    // shorten < and > pull the path's first and last ends in (a line by its length, an arc round its circle)
    const ends = out.filter((x) => x.type === 'line' || x.type === 'arc');
    const pull = (x: any, atStart: any, d: any) => {
      if (!(d > 0)) return;
      if (x.type === 'arc') { const da = (d / x.r) * (180 / Math.PI); if (atStart !== x._rev) x.a1 += da; else x.a2 -= da; return; }
      const [ax, ay, bx, by] = atStart ? [x.x1, x.y1, x.x2, x.y2] : [x.x2, x.y2, x.x1, x.y1], L = Math.hypot(bx - ax, by - ay);
      if (!(L > d)) return;
      const nx = ax + ((bx - ax) * d) / L, ny = ay + ((by - ay) * d) / L;
      if (atStart) { x.x1 = nx; x.y1 = ny; } else { x.x2 = nx; x.y2 = ny; }
    };
    if (ends.length) { pull(ends[0], true, st.shStart); pull(ends[ends.length - 1], false, st.shEnd); }
    for (const x of out) delete x._rev;
    if (st.bend) for (const s of out) if (s.type === 'line') {
      // `to[bend]` handled above for single segments; nothing else to do
    }
    return out;
  }

  function textShape(C: any, text: any, opts: any, P: any, inherit?: any) {
    const st = style(C, opts, 'node');
    const fs = fontStyle(st.font);
    text = text.replace(/\$\s*\\displaystyle\b\s*([^$]*)\$/g, (m: any, x: any) => `$$${x.trim()}$$`);
    const s = { type: 'text', x: P.x, y: P.y, text: text.replace(/\s*\\\\\s*/g, '\n').trim(), ...fs, color: st.color || inherit || '#000000', opacity: st.opacity ?? 1 };
    // placement keys: shift by half the box + inner sep
    const keys = opts.map((o: any) => o.k);
    const b = TD.textBox(s.text || ' ', s);
    const sh = 3.33 / K;
    const pl = keys.find((k: any) => /^(above|below|left|right)( (left|right))?$/.test(k)) || '';
    const anchor = st.anchor || '';
    const dir = pl ? pl : anchor ? anchor.replace('north', 'below').replace('south', 'above').replace('east', 'left').replace('west', 'right') : '';
    if (/above/.test(dir)) s.y -= b.h / 2 + (pl ? sh : 0);
    if (/below/.test(dir)) s.y += b.h / 2 + (pl ? sh : 0);
    if (/left/.test(dir)) s.x -= b.w / 2 + (pl ? sh : 0);
    if (/right/.test(dir)) s.x += b.w / 2 + (pl ? sh : 0);
    return s;
  }

  // ---------- statements ----------
  // ---------- transforms: shift / xshift / yshift / rotate / rotate around ----------
  // Returns the transform list in option order (TikZ applies the last one to points first),
  // and the options that are not transforms.
  const XF_KEYS = new Set(['shift', 'xshift', 'yshift', 'rotate', 'rotate around']);
  function readXf(C: any, list: any) {
    const xf = [], rest = [];
    for (const { k, v } of list) {
      if (k === 'shift' && v) { const c = coord(C, String(v).trim().replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')); if (c) xf.push({ dx: c.x, dy: c.y }); }
      else if (k === 'xshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: d, dy: 0 }); }
      else if (k === 'yshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: 0, dy: -d! }); }
      else if (k === 'rotate' && v) { const a = TD.evalNumber(v, NaN); if (isFinite(a)) xf.push({ rot: a, px: 0, py: 0 }); }
      else if (k === 'rotate around' && v) {
        const m = String(v).trim().replace(/^\{|\}$/g, '').match(/^([^:]+):\s*\((.*)\)\s*$/);
        const a = m && TD.evalNumber(m[1], NaN), c = m && coord(C, m[2]);
        if (isFinite(a) && c) xf.push({ rot: a, px: c.x, py: c.y });
      } else rest.push({ k, v });
    }
    return { xf, rest };
  }
  // apply transforms (innermost list first, each list last-option-first); text keeps its own angle
  // unless `transform shape` is on
  function applyXf(shapes: any, lists: any) {
    for (const s of shapes) {
      for (const L of lists) {
        if (L.opacity != null) s.opacity = (s.opacity ?? 1) * L.opacity;
        for (let i = L.xf.length - 1; i >= 0; i--) {
          const t = L.xf[i];
          if (t.rot === undefined) { TD.translate(s, t.dx, t.dy); continue; }
          const keep = s.type === 'text' && !L.shape ? s.angle : null;
          TD.rotateShape(s, t.px, t.py, -t.rot);
          if (s.type === 'text' && !L.shape) { if (keep) s.angle = keep; else delete s.angle; }
        }
      }
    }
    return shapes;
  }
  // \draw[even odd rule] with several closed parts → one Region with holes
  function evenOdd(shapes: any) {
    const parts = shapes.filter((s: any) => TD.canCombine && TD.canCombine(s));
    if (parts.length < 2) return shapes;
    const res = TD.combineGeom(parts, 'exclude');
    if (!res || !res.length) return shapes;
    const region = { type: 'region', rings: res[0].rings, ...TD.regionStyle(parts[0]) };
    return [region, ...shapes.filter((s: any) => !parts.includes(s))];
  }

  // ---------- what the model holds exactly ----------
  // A statement becomes shapes only when every option and coordinate in it is one the shapes hold exactly;
  // anything else stays TikZ code (src/domain/rawtikz.ts), with the shapes as its preview.
  const W_KEYS = ['ultra thin', 'very thin', 'thin', 'semithick', 'thick', 'very thick', 'ultra thick', 'dashed', 'densely dashed', 'loosely dashed', 'dotted', 'densely dotted', 'loosely dotted', 'dash dot', 'dashdotted'];
  const PATH_KEYS = new Set([...W_KEYS, 'draw', 'fill', 'color', 'line width', 'opacity', 'draw opacity', 'fill opacity', 'rounded corners', 'ball color', 'dash pattern',
    'radius', 'x radius', 'y radius', 'start angle', 'end angle', 'delta angle', 'bend left', 'bend right', 'even odd rule', 'shift', 'xshift', 'yshift', 'rotate', 'rotate around']);
  const NODE_KEYS = new Set(['font', 'text', 'color', 'opacity', 'anchor', 'rotate', 'above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'shift', 'xshift', 'yshift']);
  const LABEL_KEYS = new Set(['above', 'below', 'left', 'right', 'midway', 'pos', 'near start', 'near end', 'swap', "'", 'auto', 'font', 'text', 'color', 'fill']);
  const COLOR_KEYS = new Set(['draw', 'fill', 'color', 'text', 'ball color']);
  function exactTip(t: any) {
    t = t.trim().replace(/^\{|\}$/g, '').trim();
    if (!t) return true;
    const k = t.toLowerCase().replace(/\s+/g, '');
    return !!(TIP_EXACT()[k] || TIP_NAMES[k]);
  }
  // keys in `list` the shapes do not hold: [] when all are understood
  function unknownKeys(C: any, list: any, allowed: any) {
    const bad = [];
    for (const { k, v } of list) {
      if (v === null && !allowed.has(k)) {
        if (k.includes('-') && /^(.*?)-(?!.*-)(.*)$/.test(k)) { const m = k.match(/^(.*?)-(?!.*-)(.*)$/); if (exactTip(m[1]) && exactTip(m[2])) continue; }
        if (color(C, k) !== undefined) continue;
        bad.push(k); continue;
      }
      if (!allowed.has(k)) { bad.push(k); continue; }
      if (v !== null && COLOR_KEYS.has(k) && v !== 'none' && color(C, v) === undefined) bad.push(`${k}=${v}`);
      if (k === 'decoration' && !/^zigzag\b/.test(v)) bad.push('decoration=' + v);
      if (k === 'dash pattern' && !/^(\s*(on|off)\s*[\d.]+\s*pt)+\s*$/.test(v)) bad.push('dash pattern=' + v);
    }
    return bad;
  }
  // option lists of a path statement: its own, each to[…]/circle[…]/arc[…], and the nodes on it
  // a point given by name that the shapes cannot hold exactly: a node (TikZ starts and ends lines at its border,
  // and its anchors depend on its size) or a point the importer only placed approximately
  function nameIssue(C: any, raw: any) {
    const r = String(raw || '').trim();
    if (!r || /^[-+\d.\s]/.test(r) || r.includes(',') || r.includes(':') || r.includes('$')) return null;
    const anchor = /\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/.test(r);
    const nm = r.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (!C.names[nm]) return null;
    if (C.approx && C.approx.has(nm)) return `(${nm}) is placed approximately`;
    if ((C.kinds || {})[nm] !== 'coordinate') return anchor ? `an anchor of node (${nm})` : `node (${nm}) as an end (TikZ stops at its border)`;
    return null;
  }
  function pathIssues(C: any, optStr: any, body: any) {
    const toks = tokenizePath(C, body);
    const own = parseOpts(optStr);
    const keys = new Set(PATH_KEYS);
    if (own.some((o: any) => o.k === 'decorate') && own.some((o: any) => o.k === 'decoration')) { keys.add('decorate'); keys.add('decoration'); }
    const bad = unknownKeys(C, own, keys), pts = [];
    for (const t of toks) {
      if (t.t === 'opts') bad.push(...unknownKeys(C, parseOpts(t.v), PATH_KEYS));
      if (t.t === 'node') bad.push(...unknownKeys(C, parseOpts(t.opts), LABEL_KEYS));
      if (t.t === 'node' && t.coordinate) bad.push('coordinate on a path');
      if (t.t === 'op' && ['edge', 'let', 'plot', 'sin', 'cos', 'parabola', 'grid', 'in'].includes(t.v)) bad.push(t.v);
      if (t.t === 'brace') bad.push('{…}');
      if (t.t === 'coord') { const w = nameIssue(C, t.raw); if (w) pts.push(w); }
    }
    return [...(bad.length ? [`options the shapes do not hold: ${[...new Set(bad)].join(', ')}`] : []), ...new Set(pts)];
  }

  // ---------- statement extents ----------
  // the end of a command's arguments: {…}, […], =, a macro name (\def\x, \newcommand\foo), #1
  function argsEnd(s: any, j: any) {
    let k = j, first = true;
    for (;;) {
      let q = k; while (q < s.length && /[ \t]/.test(s[q])) q++;
      if (s[q] === '\n') { let r = q + 1; while (r < s.length && /[ \t]/.test(s[r])) r++; if (s[r] === '{' || s[r] === '[') q = r; else break; }
      const c = s[q];
      if (c === '{' || c === '[') { const e = matchClose(s, q, c, c === '{' ? '}' : ']'); if (e < 0) return s.length; k = e + 1; first = false; continue; }
      if (c === '=' ) { k = q + 1; continue; }
      if (c === '#' && /\d/.test(s[q + 1])) { k = q + 2; continue; }
      if (c === '\\' && first) { const m = /^\\[a-zA-Z@]+/.exec(s.slice(q)); if (m) { k = q + m[0].length; first = false; continue; } }
      break;
    }
    return k;
  }
  function semiEnd(s: any, j: any) { // just after the first ';' at depth 0
    let d = 0, k = j;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      else if (c === ';' && d <= 0) return k + 1;
    }
    return s.length;
  }
  // \foreach \x [opts] in {list} body — body a {group}, another \foreach or one statement
  function foreachParse(s: any, j: any, depth = 0) : any {
    const m = /^\s*(?=((?:\\[a-zA-Z@]+\s*(?:\/\s*)?)+))\1(\[[^\]]*\])?\s*in\s*/.exec(s.slice(j));
    if (!m) return { end: semiEnd(s, j) };
    const vars = m[1].split('/').map((v) => v.trim()).filter(Boolean);
    let k = j + m[0].length, list = '';
    if (s[k] === '{') { const e = matchClose(s, k, '{', '}'); if (e < 0) return { end: s.length }; list = s.slice(k + 1, e); k = e + 1; } else { const e = /^[^\s{\\]+/.exec(s.slice(k)); list = e ? e[0] : ''; k += list.length; }
    while (/\s/.test(s[k])) k++;
    let body, end;
    if (s[k] === '{') { const e = matchClose(s, k, '{', '}'); if (e < 0) return { end: s.length }; body = s.slice(k + 1, e); end = e + 1; }
    else if (s.startsWith('\\foreach', k) && depth < 64) { const r: any = foreachParse(s, k + 8, depth + 1); body = s.slice(k, r.end); end = r.end; }
    else { end = semiEnd(s, k); body = s.slice(k, end); }
    return { end, vars, opts: m[2] || '', list, body };
  }
  function foreachValues(list: any) {
    const it = splitTop(list, ',').map((x) => x.trim()).filter((x) => x !== '');
    const out = [];
    for (let i = 0; i < it.length; i++) {
      if (it[i] !== '...') { out.push(it[i]); continue; }
      const a = parseFloat(it[i - 2] ?? it[i - 1]), b = parseFloat(it[i - 1]), c = parseFloat(it[i + 1]);
      const step = it[i - 2] !== undefined && isFinite(a) ? b - a : (b <= c ? 1 : -1);
      if (![b, c, step].every(isFinite) || !step) return null;
      for (let v = b + step, n = 0; (step > 0 ? v < c - 1e-9 : v > c + 1e-9) && n < 400; v += step, n++) out.push(String(Math.round(v * 1e6) / 1e6));
      if (out.length > 400) return null;
    }
    return out;
  }
  function expandForeach(C: any, f: any) {
    const vals = foreachValues(f.list);
    if (!vals || !f.vars || /evaluate|remember/.test(f.opts)) { C.warnings.push('\\foreach list not understood: no preview'); return []; }
    const count = /count\s*=\s*(\\[a-zA-Z@]+)/.exec(f.opts || '');
    const out: any[] = [];
    if ((FOREACH_PASSES += vals.length) > 100000) { C.warnings.push('\\foreach makes too many passes: no preview'); return []; }
    vals.forEach((v, n) => {
      const parts = f.vars.length > 1 ? v.replace(/^\{|\}$/g, '').split('/') : [v];
      let body = f.body;
      f.vars.forEach((nm: any, q: any) => { body = body.split(nm).join(`{${(parts[q] ?? parts[parts.length - 1]).trim()}}`); });
      if (count) body = body.split(count[1]).join(String(n + 1));
      pushAll(out, parseStatements(C, body.replace(/\{([-\d.]+)\}/g, '$1')));
    });
    return out;
  }
  // the passes of a loop as statements of their own: their shapes when every one is exact, else null
  function foreachExact(C: any, f: any) {
    const Q = { ...C, preview: false, stmts: [], struct: null, warnings: [], names: { ...C.names }, kinds: { ...(C.kinds || {}) }, boxes: { ...(C.boxes || {}) } };
    let made;
    try { made = expandForeach(Q, f); } catch (e: any) { return null; }
    if (!made.length || Q.warnings.length || !Q.stmts.length || Q.stmts.some((st: any) => st.raw)) return null;
    Object.assign(C.names, Q.names); C.kinds = Object.assign(C.kinds || {}, Q.kinds); C.boxes = Object.assign(C.boxes || {}, Q.boxes);
    return { made, names: [...new Set(Q.stmts.flatMap((st: any) => st.names || []))] };
  }
  // \begin{env} … \end{env} with nesting: index just after the matching \end
  function envEnd(s: any, env: any, from: any) {
    const re = new RegExp(`\\\\(begin|end)\\{${env.replace(/[*]/g, '\\*')}\\}`, 'g');
    re.lastIndex = from; let d = 1, m;
    while ((m = re.exec(s))) { d += m[1] === 'begin' ? 1 : -1; if (!d) return m.index + m[0].length; }
    return s.length;
  }
  // the size pgfplots gives an axis, for the frame of one kept as code
  function axisBox(C: any, optStr: any) {
    const o = parseOpts(optStr), g = (k: any) => (o.find((x: any) => x.k === k) || {}).v;
    const w = g('width') ? len(g('width'), 'pt') : 240 / K, h = g('height') ? len(g('height'), 'pt') : 207 / K;
    const at = g('at') ? coord(C, g('at').replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')) : null;
    return { at: at || { x: 0, y: 0 }, w: isFinite(w!) ? w : 240 / K, h: isFinite(h!) ? h : 207 / K };
  }

  // blocks inside a node: the environment, the block type, and where the node puts the block
  const dedentLines = (src: any) => {
    const ind = least(src.split('\n').slice(1).filter((l: any) => l.trim()).map((l: any) => (/^[ \t]*/.exec(l))![0].length));
    return ind > 0 && isFinite(ind) ? src.split('\n').map((l: any, i: any) => (i ? l.slice(Math.min(ind, (/^[ \t]*/.exec(l))![0].length)) : l)).join('\n') : src;
  };
  // raw/plain: the statement as written and with its comments blanked (same length, same positions), so the block
  // keeps the comments written in its code
  function nodeBlock(C: any, node: any, at: any, raw = '', plain = '') {
    const text = node.text.replace(/^\s*\\pgfinterruptpicture%?\s*|\s*%?\s*\\endpgfinterruptpicture\s*$/g, '').replace(/^\$\s*([\s\S]*?)\s*\$$/, '$1').trim();
    for (const B of TD.blocks.nodeImports()) {
      if (!TD.TYPES[B.type]) continue;
      const m = B.re.exec(text);
      if (!m) continue;
      const q = TD.TYPES[B.type].create(at, {});
      const i = raw.length === plain.length ? plain.indexOf(m[0]) : -1;
      const code = i >= 0 ? raw.slice(i, i + m[0].length) : m[0];
      q.src = B.dedent ? dedentLines(code) : code;
      if ((B as any).place) (B as any).place(q, at); else { const b = B.bb!(q); q.x = at.x - b.w / 2; q.y = at.y - b.h / 2; }
      const extra = text.replace(m[0], '').replace(/\\color\{[^}]*\}/g, '').trim();
      const bad = unknownKeys(C, parseOpts(node.opts), new Set(['inner sep', 'anchor', 'text', 'color', 'font']));
      return { shape: q, issues: [...(extra ? [`text beside the ${B.type} block`] : []), ...(bad.length ? [`node options the block does not hold: ${bad.join(', ')}`] : [])] };
    }
    return null;
  }

  // a statement that named styles: what the styles set (each field as styled and as without them), so the
  // export can name the styles again while those fields still hold (src/domain/shapes.ts styledCode)
  function keepStyles(made: any, used: any, build: any) {
    if (!used.size || !made.length) return;
    let base = null;
    styOff = true;
    try { base = build(); } catch (e: any) { base = null; } finally { styOff = false; }
    if (!base || base.length !== made.length) return;
    const J = (v: any) => JSON.stringify(v ?? null);
    made.forEach((m: any, n: any) => {
      const b = base[n];
      if (!b || b.type !== m.type) return;
      const f: Record<string, any> = {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) if (J(m[k]) !== J(b[k])) f[k] = [m[k] ?? null, b[k] ?? null];
      m.tkStyle = { n: [...used], f, d: Object.fromEntries<any>([...used].map((nm) => [nm, STY.get(nm)])) };
    });
  }

  // Statements of a picture. `s` is the code with comments blanked (same length as `o`, the code as written).
  // Every statement becomes shapes (C.preview, or when it is exact) or one TikZ code object; C.stmts gets
  // where each one was, for the source write-back (s.tex).
  const PATHS: Record<string, any> = { draw: 'draw', fill: 'fill', filldraw: 'filldraw', path: 'path', shade: 'shade', shadedraw: 'shade', clip: null, useasboundingbox: null };
  const SEMI = new Set(['pic', 'matrix', 'graph', 'datavisualization', 'calendar', 'spy', 'pattern', 'shadedraw']);
  const DEFS = new Set(['tikzset', 'tikzstyle', 'def', 'gdef', 'edef', 'xdef', 'let', 'newcommand', 'renewcommand', 'providecommand', 'definecolor', 'colorlet', 'pgfmathsetmacro', 'pgfmathtruncatemacro',
    'pgfmathparse', 'pgfplotsset', 'pgfdeclarelayer', 'pgfsetlayers', 'usetikzlibrary', 'tikzmath', 'pgfkeys', 'newlength', 'setlength', 'pgfmathsetlengthmacro', 'tikzcdset', 'ctikzset', 'pgfdeclarepatternformonly', 'pgfdeclarepattern', 'pgfdeclarehorizontalshading', 'pgfdeclareverticalshading', 'pgfdeclareradialshading', 'pgfdeclarefunctionalshading', 'pgfdeclareplotmark', 'pgfdeclarearrow',
    'centering', 'small', 'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'bfseries', 'itshape', 'sffamily', 'ttfamily', 'rmfamily', 'color', 'selectfont', 'fontsize']);
  // nesting (environments, loops in loops) past 64 levels is not read: hostile input would overflow the stack.
  // FOREACH_PASSES bounds the passes of nested loops (400 × 400 × 400 … would never finish).
  let PS_DEPTH = 0, FOREACH_PASSES = 0;
  function parseStatements(C: any, s: any, o?: any) : any {
    if (PS_DEPTH >= 64) { C.warnings.push('Nested too deep: the inner code is not read'); return []; }
    if (PS_DEPTH === 0) FOREACH_PASSES = 0;
    PS_DEPTH++;
    try { return parseStatementsIn(C, s, o); } finally { PS_DEPTH--; }
  }
  function parseStatementsIn(C: any, s: any, o?: any) : any {
    o = o == null ? s : o;
    if (C.styles) STY = C.styles;
    if (!C.macros) C.macros = new Map();
    MAC = C.macros;
    const shapes: any[] = [];
    const preview = !!C.preview;
    let i = 0;
    // pgf-umlcd classes somewhere in this code: a shifted scope may hold a class diagram
    const umlIn = !!TD.uml && /\\begin\s*\{(?:class|interface|abstractclass|staticclass|object)\}/.test(s);
    const scopeCtx = () => (C.scopes || []).slice().reverse().map((L: any) => L.opts).filter(Boolean);
    const scopeIssue = () => (C.scopes || []).map((L: any) => L.issue).filter(Boolean);
    // one statement: shapes when exact, else one code object previewing them
    const done = (start: any, end: any, made: any, issues: any, extra: Record<string, any> = {}) => {
      if (preview) { pushAll(shapes, made); return; }
      issues = [...issues, ...scopeIssue(), ...(C.picIssue ? [C.picIssue] : [])];
      const exact = !extra.raw && !issues.length && made.length > 0;
      let list = made;
      if (!exact) {
        const r: Record<string, any> = { type: 'tikz', kind: extra.kind || 'code', code: '', x: 0, y: 0, ctx: [], prev: made.filter((p: any) => p.type !== 'tikz'), issues: [...new Set(issues)] };
        if (extra.at) r.at = extra.at;
        if (extra.size) r.size = extra.size;
        if (C.libs && C.libs.length) r.libs = C.libs.slice();
        if (C.pkgs && C.pkgs.length) r.pkgs = C.pkgs.slice();
        list = [r];
      }
      if (exact && extra.group && list.length > 1) { const g = uid8(); for (const x of list) { x.g = g; x.gname = extra.group; } }
      C.stmts.push({ start, end, shapes: list, raw: !exact, ctx: scopeCtx(), names: extra.names });
      pushAll(shapes, list);
    };
    let last = -1;
    while (i < s.length) {
      // always move on: unbalanced input must not send the reader back (it would loop for ever)
      if (i <= last) i = last + 1;
      last = i;
      const bs = s.indexOf('\\', i);
      if (bs < 0) break;
      const m = s.slice(bs).match(/^\\([a-zA-Z@]+)\*?/);
      if (!m) { i = bs + 2; continue; }
      const name = m[1];
      let j = bs + m[0].length;
      const w0 = C.warnings.length;
      const issues = () => C.warnings.slice(w0);
      if (name === 'tddata') { const e = matchClose(s, j, '{', '}'); i = e < 0 ? s.length : e + 1; continue; }
      if (name === 'begin' || name === 'end') {
        const e = s.indexOf('}', j);
        const env = s.slice(j + 1, e).trim();
        if (name === 'begin' && env === 'scope' && umlIn && /^\\begin\{scope\}\s*\[\s*shift\s*=/.test(s.slice(bs, bs + 40))) {
          // a pgf-umlcd class diagram in its shifted scope (how a picture with other objects exports it)
          let d = 0, stop = -1;
          for (const m of s.slice(bs).matchAll(/\\(begin|end)\{scope\}/g)) if ((d += m[1] === 'begin' ? 1 : -1) === 0) { stop = bs + m.index! + m[0].length; break; }
          const uml = stop > 0 && /\\begin\s*\{(?:class|interface|abstractclass|staticclass|object)\}/.test(s.slice(bs, stop))
            ? TD.uml.fromPicture(`\\begin{tikzpicture}\n${o.slice(bs, stop)}\n\\end{tikzpicture}`) : null;
          if (uml) { done(bs, stop, applyXf([uml], C.scopes || []), issues()); i = stop; continue; }
        }
        if (name === 'begin' && env === 'scope') {
          i = e + 1; while (/\s/.test(s[i])) i++;
          let L: Record<string, any> = { xf: [], shape: false, opts: '' };
          if (s[i] === '[') {
            const e2 = matchClose(s, i, '[', ']');
            const str = s.slice(i + 1, e2);
            const { xf, rest } = readXf(C, parseOpts(str));
            const shape = rest.some((x) => x.k === 'transform shape');
            // `transparency group, opacity=x` is how a translucent shape exports: the opacity belongs to the shapes inside
            const op = rest.find((x) => x.k === 'opacity'), opv = op ? parseFloat(op.v) : NaN;
            const other = rest.filter((x) => x.k !== 'transform shape' && x.k !== 'transparency group' && x.k !== 'opacity');
            L = { xf, shape, ...(opv >= 0 && opv < 1 ? { opacity: opv } : {}), opts: str.replace(/\s+/g, ' ').trim() };
            if (other.length) L.issue = 'scope options not drawn: ' + other.map((x) => x.k).join(', ');
            i = e2 + 1;
          } else i = e + 1;
          (C.scopes = C.scopes || []).unshift(L);
          if (C.struct) C.struct.push(i);
          continue;
        }
        if (name === 'end' && env === 'scope') { if (C.scopes && C.scopes.length) C.scopes.shift(); i = e + 1; if (C.struct) C.struct.push(i); continue; }
        if (name === 'end') { i = e + 1; continue; }
        const stop = envEnd(s, env, e + 1);
        if (env === 'feynman' && TD.TYPES.feynman) {
          // a tikz-feynman diagram: one Feynman object, its origin where the picture's is
          const q = TD.TYPES.feynman.create({ x: 0, y: 0 }, {});
          q.src = o.slice(bs, stop).trim();
          const b = TD.feyn.layout(q).bb;
          q.x = b.x; q.y = b.y;
          done(bs, stop, applyXf([q], C.scopes || []), issues());
          i = stop; continue;
        }
        // any other environment (pgfonlayer, axis, …) is kept whole; its drawing statements preview it
        i = stop;
        if (preview) { if (!/axis$/.test(env)) pushAll(shapes, parseStatements(C, s.slice(e + 1, stop - env.length - 6))); continue; }
        const P = { ...C, preview: true, warnings: [], struct: null };
        const inner = /axis$|^tikzcd$/.test(env) ? [] : parseStatements(P, s.slice(e + 1, stop - env.length - 6));
        let at, size;
        if (/axis$/.test(env)) {
          let q = e + 1; while (/\s/.test(s[q])) q++;
          const ob = s[q] === '[' ? matchClose(s, q, '[', ']') : -1, ab = axisBox(C, ob > 0 ? s.slice(q + 1, ob) : '');
          at = { x: ab.at.x, y: ab.at.y - ab.h! }; size = { w: ab.w, h: ab.h };
        }
        done(bs, stop, applyXf(inner, C.scopes || []), [`\\begin{${env}} is kept as code`], { raw: true, at, size });
        continue;
      }
      if (name === 'foreach') {
        const f = foreachParse(s, j);
        i = f.end;
        const P = { ...C, preview: true, warnings: [], struct: null, names: { ...C.names } };
        // a loop whose every pass is shapes held exactly: those shapes, as one group, written as the loop until
        // one of them is edited (then as the shapes, unrolled)
        const E = !preview && f.body != null ? foreachExact(C, f) : null;
        if (E) { done(bs, f.end, E.made, [], { names: E.names.length ? E.names : undefined, group: 'foreach loop' }); continue; }
        const made = f.body != null ? applyXf(expandForeach(P, f), C.scopes || []) : [];
        if (preview) { pushAll(shapes, made); continue; }
        done(bs, f.end, made, ['\\foreach is kept as code', ...P.warnings], { raw: true });
        continue;
      }
      if (DEFS.has(name)) {
        let end = argsEnd(s, j);
        const semi = /^[ \t]*;/.exec(s.slice(end)); if (semi) end += semi[0].length;
        i = end;
        // styles set outside any scope hold for the rest of the picture (and, from the preamble, every picture)
        if (/^(g|e|x)?def$|^(re|provide|new)command$|^pgfmathsetmacro$|^pgfmathtruncatemacro$/.test(name)) {
          const d = macroDef(name, s.slice(j, end));
          if (d) C.macros.set(d.nm, name === 'pgfmathtruncatemacro' ? String(Math.trunc(+d.v)) : d.v);
        }
        if ((name === 'tikzset' || name === 'tikzstyle') && C.styles && !(C.scopes || []).length) defineStyles(C, name, s.slice(j, end));
        if (name === 'definecolor' || name === 'colorlet') {
          const args = []; let q = j;
          while (args.length < (name === 'definecolor' ? 3 : 2)) { while (/\s/.test(s[q])) q++; if (s[q] === '[') { q = shut(s, q, '[', ']') + 1; continue; } if (s[q] !== '{') break; const e = shut(s, q, '{', '}'); args.push(s.slice(q + 1, e)); q = e + 1; }
          if (name === 'definecolor' && args.length === 3) {
            const [nm, model, val] = args;
            if (/^html$/i.test(model)) C.colors[nm] = '#' + val.trim().toLowerCase();
            else if (model === 'rgb') C.colors[nm] = '#' + val.split(',').map((v: any) => hex2(parseFloat(v) * 255)).join('');
            else if (model === 'RGB') C.colors[nm] = '#' + val.split(',').map((v: any) => hex2(parseFloat(v))).join('');
            else if (model === 'gray') C.colors[nm] = '#' + hex2(parseFloat(val) * 255).repeat(3);
          } else if (args.length === 2) { const c = color(C, args[1]); if (c) C.colors[args[0]] = c; }
        }
        if (!preview && name !== 'usetikzlibrary') done(bs, end, [], [], { raw: true, kind: 'defs' });
        continue;
      }
      if (name in PATHS || name === 'node' || name === 'coordinate' || SEMI.has(name)) {
        const k = semiEnd(s, j);
        const stmt = s.slice(j, k - 1);
        i = k;
        if (name in PATHS) {
          if (!PATHS[name]) { if (!preview) done(bs, k, [], [], { raw: true }); continue; }
          let body = stmt.trim(), optStr = '';
          if (body[0] === '[') { const e = matchClose(body, 0, '[', ']'); optStr = body.slice(1, e); body = body.slice(e + 1); }
          let made = [];
          const su = styUsed = new Set();
          const lossy = preview ? [] : pathIssues(C, optStr, body);
          const before = { ...C.names };
          const build = () => {
            let L = pathToShapes(C, PATHS[name], optStr, body);
            const po = parseOpts(optStr);
            if (po.some((x: any) => x.k === 'even odd rule')) L = evenOdd(L);
            const own = readXf(C, po);
            return applyXf(L, [{ xf: own.xf, shape: true }, ...(C.scopes || [])]);
          };
          try { made = build(); } catch (err: any) { C.warnings.push(`\\${name}: ${err.message}`); }
          styUsed = null;
          const names = Object.keys(C.names).filter((n) => C.names[n] !== before[n]);
          if (!preview) {
            keepStyles(made, su, build);
            // named points the statement goes through: written by name again while the ends are still there
            const refs = [...new Set(tokenizePath(C, body).filter((t) => t.t === 'coord').map((t) => t.raw.trim()).filter((nm) => (C.kinds || {})[nm] === 'coordinate' && C.names[nm]))];
            if (refs.length) for (const x of made) x.refs = refs;
          }
          const viaSty = su.size && lossy.length ? [`styles used: ${[...su].join(', ')}`] : [];
          done(bs, k, made, [...issues(), ...lossy, ...viaSty], { names: names.length ? names : undefined });
          continue;
        }
        if (SEMI.has(name)) { if (preview) continue; done(bs, k, [], [`\\${name} is kept as code`], { raw: true }); continue; }
        const su = styUsed = new Set();
        const toks = tokenizePath(C, (name === 'coordinate' ? 'coordinate ' : 'node ') + stmt.trim());
        let at = null, node: any = null, hasAt = false;
        for (const t of toks) {
          if (t.t === 'at') { at = coord(C, t.raw); hasAt = true; }
          if (t.t === 'node') node = t;
          if (t.t === 'coord' && !at) { at = coord(C, t.raw); hasAt = true; }
        }
        if (!node) { styUsed = null; if (!preview) done(bs, k, [], ['not understood'], { raw: true }); continue; }
        at = at || { x: 0, y: 0 };
        // placed by name: at=(n1.east) (kept as code), or the positioning library's right=1cm of n1: the node
        // goes where TikZ puts it (beside the other node's box) and keeps the relation (s.pos) for the export
        const placeIss: any[] = [];
        let pos = null;
        for (const t of toks) if (t.t === 'at' || (t.t === 'coord' && t === toks.find((q) => q.t === 'coord'))) { const w = nameIssue(C, t.raw); if (w) placeIss.push(w); }
        const nopts = parseOpts(node.opts || '');
        for (const { k: pk, v } of nopts) {
          const pm = v && /^(above|below|left|right|above left|above right|below left|below right)$/.test(pk) && /^(?:(.*?)\s+)?of\s+(.+)$/.exec(v.trim());
          if (!pm) continue;
          const of = pm[2].trim(), ref: any = coord(C, of) || at;
          const dd = (pm[1] || '').split(/\s+and\s+/).map((x: any) => len(x));
          const diag = / /.test(pk), dist = C.nodeDist ?? PX;
          let dy0 = isFinite(dd[0]) ? dd[0] : diag ? dist * Math.SQRT1_2 : dist, dx0 = isFinite(dd[1]) ? dd[1] : isFinite(dd[0]) ? dd[0] : dy0;
          if (!diag) dx0 = dy0;
          const dx = /left/.test(pk) ? -1 : /right/.test(pk) ? 1 : 0, dy = /above/.test(pk) ? -1 : /below/.test(pk) ? 1 : 0;
          // the other node's border (its box and inner sep; a coordinate has none); this node's own half box and
          // inner sep are added where the text is made (textShape reads the same key)
          const bx = C.boxes[of], sep = bx && !bx.pt ? 3.33 / K : 0;
          const hw = bx ? bx.w / 2 + sep : 0, hh = bx ? bx.h / 2 + sep : 0;
          at = { x: ref.x + dx * (hw + dx0), y: ref.y + dy * (hh + dy0) };
          const plain = !(C.scopes || []).some((L: any) => L.xf && L.xf.length) && bx && !(C.approx && C.approx.has(of)) && /^[^().,:$\\]+$/.test(of);
          if (plain && !pos && !nopts.some((o: any) => o.k === 'anchor')) pos = { k: pk, v: v.trim(), of };
          else { placeIss.push(`placed ${pk} of (${of}) with the positioning library`); pos = null; }
        }
        if (placeIss.length && node.name) (C.approx = C.approx || new Set()).add(node.name);
        const nodeIss = () => [...issues(), ...placeIss];
        if (node.name) { C.names[node.name] = { ...at }; (C.kinds = C.kinds || {})[node.name] = node.coordinate ? 'coordinate' : 'node'; }
        const names = node.name ? [node.name] : undefined;
        if (node.coordinate) {
          styUsed = null;
          const abs = applyXf([{ type: 'dot', cx: at.x, cy: at.y, r: 0 }], C.scopes || []).map((d: any) => ({ x: d.cx, y: d.cy }))[0];
          if (node.name) C.boxes[node.name] = { w: 0, h: 0, pt: true };
          if (preview) continue;
          // \coordinate (A) at (x,y); is a named point the canvas shows and moves; lines through it keep the name
          const plainPt = node.name && hasAt && !pos && !placeIss.length && !nopts.length && !toks.some((t2) => t2.t === 'op' || t2.t === 'brace' || t2.t === 'opts');
          if (plainPt) done(bs, k, [{ type: 'coord', x: abs.x, y: abs.y, tikzName: node.name }], issues(), { names });
          else done(bs, k, [], ['a named point: kept so the code that uses its name still works'], { raw: true, at: abs, names });
          continue;
        }
        const blk = nodeBlock(C, node, at, o.slice(bs, k), s.slice(bs, k));
        if (blk) { styUsed = null; done(bs, k, [blk.shape], [...nodeIss(), ...blk.issues], { names }); continue; }
        if (node.text.trim()) {
          const make = () => {
            const no = parseOpts(node.opts), own = readXf(C, no), t = textShape(C, node.text, no, at);
            // a node's own rotate turns it about its own position
            const xf = own.xf.map((x) => (x.rot !== undefined && !x.px && !x.py ? { ...x, px: t.x, py: t.y } : x));
            return applyXf([t], [{ xf, shape: true }, ...(C.scopes || [])]);
          };
          const made = make();
          styUsed = null;
          const bad = preview ? [] : unknownKeys(C, nopts, NODE_KEYS);
          if (toks.some((t2) => t2.t === 'op' || t2.t === 'brace')) bad.push('path after the node');
          if (!preview) {
            keepStyles(made, su, make);
            const t = made[0];
            if (node.name && t) { const b = TD.bbox(t); C.boxes[node.name] = { w: b.w, h: b.h }; }
            if (pos && t) { const r = C.names[pos.of]; t.pos = { ...pos, off: [t.x - r.x, t.y - r.y] }; }
          }
          done(bs, k, made, [...nodeIss(), ...(bad.length ? [`options the text does not hold: ${bad.join(', ')}${su.size ? ` (styles used: ${[...su].join(', ')})` : ''}`] : [])], { names });
          // a node kept as code has a size the canvas only estimates: nothing is placed beside it exactly
          if (!preview && node.name && C.stmts.length && C.stmts[C.stmts.length - 1].raw) delete C.boxes[node.name];
        } else if (!preview) done(bs, k, [], ['empty node'], { raw: true, at, names });
        continue;
      }
      // anything else: its arguments (and a ; right after them) are one statement, kept as code
      let end = argsEnd(s, j);
      const semi = /^[ \t]*;/.exec(s.slice(end)); if (semi) end += semi[0].length;
      if (/^\s*[([]/.test(s.slice(end)) || /^\s*(node|--)/.test(s.slice(end))) end = semiEnd(s, end); // \tkzDraw-like commands with path syntax
      i = end;
      if (preview) { C.warnings.push(`\\${name} not drawn`); continue; }
      if (/^(documentclass|usepackage|title|author|date)$/.test(name)) continue;
      done(bs, end, [], [`\\${name} is kept as code`], { raw: true });
    }
    return shapes;
  }
  // options of a picture or scope that set how every path in it looks (very thick, dashed, DarkBlue, line width=…)
  const baseOpt = (C: any, o: any) => (o.v === null ? W_KEYS.includes(o.k) || color(C, o.k) !== undefined : ['line width', 'color'].includes(o.k));
  function pictureOpts(C: any, o: any) {
    C.base = [...(C.base || []), ...parseOpts(o).filter((x: any) => baseOpt(C, x))];
    for (const { k, v } of parseOpts(o)) {
      if (k === 'x' && v) C.sx = len(v);
      else if (k === 'y' && v) C.sy = len(v);
      else if (k === 'scale' && v) { C.sx = PX * parseFloat(v); C.sy = PX * parseFloat(v); }
      else if (k === '>' && v && exactTip(v)) gtTip = (arrowSpec('-' + v))!.end;
    }
  }
  // comments become spaces: positions in the blanked text are positions in the source
  function blankComments(src: any) {
    return src.split('\n').map((l: any) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i) + ' '.repeat(l.length - i); } return l; }).join('\n');
  }
  const PIC_ONLY = new Set(['remember picture', 'overlay', 'baseline', 'trim left', 'trim right']);
  const uid8 = () => Math.random().toString(36).slice(2, 10);
  // One picture: `s` its body with comments blanked, `o` as written, `open` the \begin{tikzpicture}[…] as written.
  // Each shape gets s.tex = { p, k, i, n, sig } (picture, statement, place in the statement's shapes, how many);
  // the first shape of a statement also holds its source: src (from the end of the previous statement, so
  // comments and scope lines come along), cut (where its own text starts in src), ctx (the scopes around it),
  // nm (names it defines). The picture's first statement holds open and N (statements), the last one tail.
  function importPicture(C: any, s: any, o: any, open: any) {
    C.sx = PX; C.sy = PX; C.scopes = []; C.stmts = []; C.struct = []; C.kinds = {}; C.approx = null; C.picIssue = null; C.base = []; C.nodeDist = undefined; C.boxes = {}; gtTip = null;
    const optM = open && /^\\begin\{tikzpicture\}\s*\[([\s\S]*)\]\s*$/.exec(blankComments(open));
    const optStr = optM ? optM[1] : '';
    if (optStr) pictureOpts(C, optStr);
    const items = splitTop(optStr, ',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const keyOf = (x: any) => splitTop(x, '=')[0].trim();
    const neutral = (x: any) => /^(x|y)\s*=\s*\{?1\s*cm\}?$/.test(x);
    const keep = items.filter((x) => !PIC_ONLY.has(keyOf(x)) && !neutral(x));
    const drop = items.filter((x) => PIC_ONLY.has(keyOf(x))).map(keyOf);
    // styles and the node distance the picture sets: read, and kept on the picture for the code written from shapes
    const own = (x: any) => {
      const k = keyOf(x), v = splitTop(x, '=').slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1');
      const sm = /^(.+?)\/\.style$/.exec(k);
      if (sm && C.styles) { addStyle(C, sm[1].trim(), v); return C.styles.has(sm[1].trim()); }
      if (k === 'node distance') { const d = len(v); if (isFinite(d!)) { C.nodeDist = d; return true; } }
      return false;
    };
    // >=Tip only sets what `>` means: shapes written from the model name their tips, so it stays on the picture
    const safe = keep.filter((x) => (keyOf(x) === '>' && gtTip) || own(x)), rest = keep.filter((x) => !safe.includes(x));
    const odd = rest.map(keyOf).filter((k) => !['x', 'y', 'scale'].includes(k));
    if (odd.length) C.picIssue = 'picture options the shapes do not hold: ' + odd.join(', ');
    const picCtx = rest.length ? [rest.join(', ')] : [];
    const shapes = parseStatements(C, s, o).map((x: any) => ({ ...x, id: uid8() }));
    const byShape = new Map();
    const p = uid8(), N = C.stmts.length;
    let prevEnd = 0;
    C.stmts.forEach((st: any, k: any) => {
      let end = st.end;
      const nl = o.indexOf('\n', end) < 0 ? o.length : o.indexOf('\n', end);
      if (!s.slice(end, nl).trim() && o.slice(end, nl).trim()) end = nl; // a comment at the end of its line
      let cut = Math.max(prevEnd, ...C.struct.filter((q: any) => q <= st.start));
      let q = cut; while (q < st.start && /[ \t]/.test(o[q])) q++;
      if (o[q] === '\n') cut = q + 1;
      const src = o.slice(prevEnd, end), ctx = [...picCtx, ...st.ctx];
      st.shapes.forEach((sh: any, i: any) => byShape.set(sh, { p, k, i, n: st.shapes.length, ...(i ? {} : { src, cut: cut - prevEnd, ...(ctx.length ? { ctx } : {}), ...(st.names ? { nm: st.names } : {}) }) }));
      const own = st.shapes[0];
      if (st.raw && own) {
        own.code = TD.rawTikz.dedent(o.slice(cut, end));
        own.ctx = ctx;
        const used = Object.keys(C.names).filter((nm) => own.code.includes('(' + nm));
        if (used.length) own.names = Object.fromEntries<any>(used.map((nm) => [nm, C.names[nm]]));
        const macs = [...C.macros.keys()].filter((nm) => new RegExp(`\\\\${nm}(?![A-Za-z@])`).test(own.code));
        if (macs.length && own.kind !== 'defs') own.macros = Object.fromEntries<any>(macs.map((nm) => [nm, C.macros.get(nm)]));
      }
      prevEnd = end;
    });
    const tail = o.slice(prevEnd);
    // code with nothing to show and no place of its own sits at the picture's top-left, one under another
    const placed = shapes.filter((x: any) => x.type !== 'tikz' || (x.prev && x.prev.length) || x.at);
    const pts = placed.flatMap((x: any) => { const b = TD.bbox(x); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; });
    const tl = pts.length ? TD.bboxOf(pts, 0) : { x: 0, y: 0 };
    let row = 0;
    for (const x of shapes) if (x.type === 'tikz' && !(x.prev && x.prev.length) && !x.at) x.at = { x: tl.x, y: tl.y - 6 - 20 * row++ };
    // the shapes (new objects from the map above) take their records by position
    const flat = C.stmts.flatMap((st: any) => st.shapes);
    shapes.forEach((x: any, n: any) => {
      const t = byShape.get(flat[n]);
      if (!t) return;
      if (t.k === 0 && t.i === 0) { t.open = open || null; t.N = N; if (drop.length) t.drop = drop; if (safe.length) t.po = safe.join(', '); }
      if (t.k === N - 1 && t.i === t.n - 1) t.tail = tail;
      x.tex = t;
      if (x.type === 'tikz' && t.i === 0) { x.code = flat[n].code; x.ctx = flat[n].ctx; if (flat[n].names) x.names = flat[n].names; if (flat[n].macros) x.macros = flat[n].macros; }
    });
    // lines that start or end on a named point stay attached to it (src/application/app.ts links), so they follow it
    const pt = new Map();
    for (const x of shapes) {
      if (x.type === 'coord' && x.tikzName) pt.set(x.tikzName, x);
      if (!x.refs || !['line', 'curve', 'spring'].includes(x.type)) continue;
      for (const [L, kx, ky] of [['link1', 'x1', 'y1'], ['link2', 'x2', 'y2']]) {
        const c = x.refs.map((nm: any) => pt.get(nm)).find((q: any) => q && Math.abs(q.x - x[kx]) < 1e-6 && Math.abs(q.y - x[ky]) < 1e-6);
        if (c) x[L] = { id: c.id, u: 0.5, v: 0.5 };
      }
    }
    // the signature, and one that a move does not change (rounded, with the first shape's corner): a statement
    // whose shapes only moved together is written as it was, in a shift scope
    for (const x of shapes) if (x.tex) {
      x.tex.sig = TD.texSig(x);
      x.tex.sr = TD.texSig(x, true);
      if (x.tex.i === 0) { const b = TD.bbox(x); if (isFinite(b.x) && isFinite(b.y)) x.tex.b = [b.x, b.y]; }
    }
    return shapes;
  }
  // the preview of TikZ code kept as an object, drawn where it was (its scopes, the names it uses)
  function preview(code: any, ctx: any, names: any, macros: any) {
    const C: any = makeCtx();
    C.preview = true; C.scopes = []; C.names = { ...(names || {}) };
    C.macros = new Map(Object.entries<any>(macros || {}));
    for (const c of ctx || []) { pictureOpts(C, c); C.scopes.unshift({ ...readXf(C, parseOpts(c)), shape: false }); }
    let shapes = [];
    try { shapes = parseStatements(C, blankComments(String(code || ''))); } catch (e: any) { C.warnings.push(e.message); }
    return { shapes, issues: [...new Set(C.warnings)] };
  }

  // LaTeX text (between pictures) -> DiagramTeX text block (simple markdown-ish)
  function latexToText(t: any) {
    t = t
      .replace(/\\begin\{(center|figure|flushleft|flushright)\}(\[[^\]]*\])?/g, '')
      .replace(/\\end\{(center|figure|flushleft|flushright)\}/g, '')
      .replace(/\\(centering|noindent|medskip|bigskip|smallskip|par|maketitle)\b/g, '')
      .replace(/\\section\*?\{([^}]*)\}/g, '\n# $1\n')
      .replace(/\\subsection\*?\{([^}]*)\}/g, '\n## $1\n')
      .replace(/\\subsubsection\*?\{([^}]*)\}/g, '\n### $1\n')
      .replace(/\\(vspace|hspace)\*?\{[^}]*\}/g, '')
      .replace(/\\caption\{([^}]*)\}/g, '$1')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\\[([\s\S]*?)\\\]/g, (m: any, x: any) => `$$${x.trim()}$$`);
    t = t.split('\n').map((l: any) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^(#{1,3} .*)\n\n/gm, '$1\n').trim();
    // text blocks keep %, &, # literally (export escapes them again); only outside math
    return t.split('\n').map((l: any) => l.includes('$$') ? l : TD.segments(l).map((g: any) => (g.math ? `$${g.s}$` : g.s.replace(/\\([%&#])/g, '$1'))).join('')).join('\n');
  }

  function embedded(inner: any) {
    const m = inner.match(/(?:\\tddata\{|%\s*(?:diagramtex|texdiagram)-data:\s*)([A-Za-z0-9+/=]+)/);
    if (!m) return null;
    try {
      const shapes = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (!Array.isArray(shapes) || shapes.some((s) => !s || !TD.TYPES[s.type])) return null;
      return shapes.map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10) }));
    } catch (e: any) { return null; }
  }

  // Page setup from \documentclass[..pt, ..paper] and \usepackage[...]{geometry}
  function parsePage(src: any) {
    const dc = src.match(/\\documentclass(?:\[([^\]]*)\])?\{[^}]*\}/);
    if (!dc) return null;
    const pg: Record<string, any> = { title: /\\maketitle/.test(src) };
    const opts = [(dc[1] || ''), ((src.match(/\\usepackage\[([^\]]*)\]\{geometry\}/) || [])[1] || '')].join(',').split(',').map((x) => x.trim()).filter(Boolean);
    const len = (v: any) => { const m = String(v).match(/^([\d.]+)\s*(cm|mm|in|pt)?$/); if (!m) return null; return +m[1] * { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72.27 }[m[2] || 'cm']!; };
    for (const o of opts) {
      const fm = o.match(/^(10|11|12)pt$/); if (fm) pg.font = +fm[1];
      const pm = Object.entries<any>(TD.PAPERS).find(([, v]) => v.opt === o); if (pm) pg.paper = pm[0];
      if (o === 'landscape') pg.orient = 'landscape';
      const kv = o.match(/^(\w+)\s*=\s*(.+)$/);
      if (kv) {
        const v = len(kv[2]);
        if (v == null) continue;
        const k = kv[1];
        if (k === 'margin') Object.assign(pg, { mt: v, mb: v, ml: v, mr: v });
        if (k === 'hmargin') Object.assign(pg, { ml: v, mr: v });
        if (k === 'vmargin') Object.assign(pg, { mt: v, mb: v });
        const map: Record<string, any> = { top: 'mt', bottom: 'mb', left: 'ml', right: 'mr', inner: 'ml', outer: 'mr', paperwidth: 'w', paperheight: 'h' };
        if (map[k]) pg[map[k]] = v;
      }
    }
    if (pg.w && pg.h && !pg.paper) pg.paper = 'custom';
    return pg;
  }

  TD.importLatex = function (src: any, opt: Record<string, any> = {}) {
    const C: any = makeCtx();
    const o = String(src);
    // positions in s are positions in o: comments and the wrappers round wide pictures become spaces
    const keepGroup = (m: any, pic: any) => { const a = m.indexOf(pic); return ' '.repeat(a) + pic + ' '.repeat(m.length - a - pic.length); };
    let s = blankComments(o)
      // pictures wrapped in \resizebox{..}{..}{ ... } (wide diagrams in our exports)
      .replace(/\\resizebox\{[^}]*\}\{[^}]*\}\{%?\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, keepGroup)
      // …and, since 1.24, boxed first: \begin{lrbox}{\dtxbox} picture \end{lrbox} \resizebox{..}{..}{\usebox{\dtxbox}}
      .replace(/\\begin\{lrbox\}\{\\\w+\}%?\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\\end\{lrbox\}%?\s*\\resizebox\{[^}]*\}\{[^}]*\}\{\\usebox\{\\\w+\}\}/g, keepGroup);
    let title = null;
    const tm = s.match(/\\title\{([^}]*)\}/);
    if (tm) title = tm[1];
    const page = parsePage(s);
    // the preamble: colours and definitions the pictures use, and the libraries and packages they load
    const docM = s.match(/\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/);
    let preDefs = '';
    if (docM) {
      const ps = s.slice(0, docM.index), po = o.slice(0, docM.index);
      for (const m of ps.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) C.libs = [...new Set([...(C.libs || []), ...m[1].split(',').map((x: any) => x.trim()).filter(Boolean)])];
      for (const m of ps.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)) for (const p of m[1].split(',').map((x: any) => x.trim())) if (DRAW_PKGS.has(p) && p !== 'tikz') C.pkgs = [...new Set([...(C.pkgs || []), p])];
      const P = { ...C, warnings: [], scopes: [], stmts: [], struct: null };
      parseStatements(P, ps, po);
      Object.assign(C.colors, P.colors);
      preDefs = P.stmts.filter((st: any) => st.raw && st.shapes[0] && st.shapes[0].kind === 'defs' && !/^\s*\\(centering|small|large|normalsize|footnotesize|color)\b/.test(po.slice(st.start, st.end)))
        .map((st: any) => po.slice(st.start, st.end).trim())
        // not the lines DiagramTeX's own preamble adds (quantikz compatibility, pgfplots compat)
        .filter((t: any) => !t.includes('@') && !/^\\pgfplotsset\{compat=[^}]*\}$/.test(t)).join('\n');
    }
    const base = docM ? docM.index + docM[0].indexOf(docM[1]) : 0;
    const bodyS = docM ? docM[1] : s, bodyO = o.slice(base, base + bodyS.length);
    // pictures, and bare quantikz / forest / ZX / tikz-timing / bytefield environments (each becomes a picture holding the block)
    const found: any[] = [];
    // \begin{tikzpicture}[options] … \end{tikzpicture}, scanned by hand (a regex over nested brackets backtracks
    // exponentially on an unclosed picture): the options run to the first ], when an \end follows them
    const BEG = '\\begin{tikzpicture}', END = '\\end{tikzpicture}';
    for (let p = bodyS.indexOf(BEG); p >= 0;) {
      const q = p + BEG.length;
      let r = q; while (r < bodyS.length && /\s/.test(bodyS[r])) r++;
      let inner = q;
      if (bodyS[r] === '[') { const b = bodyS.indexOf(']', r); if (b >= 0 && bodyS.indexOf(END, b + 1) >= 0) inner = b + 1; }
      const e = bodyS.indexOf(END, inner);
      if (e < 0) break;
      found.push({ at: p, end: e + END.length, open: p, inner, len: e - inner });
      p = bodyS.indexOf(BEG, e + END.length);
    }
    const inPic = (i: any) => found.some((f) => i >= f.at && i < f.end);
    for (const b of bodyS.matchAll(/\\begin\{quantikz\}[\s\S]*?\\end\{quantikz\}|\\begin\{forest\}[\s\S]*?\\end\{forest\}|\\begin\{ZX\}[\s\S]*?\\end\{ZX\}|\\begin\{tikztimingtable\}[\s\S]*?\\end\{tikztimingtable\}|\\begin\{sequencediagram\}[\s\S]*?\\end\{sequencediagram\}|(?:\\bytefieldsetup\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*)*\\begin\{bytefield\}[\s\S]*?\\end\{bytefield\}/g))
      if (!inPic(b.index)) found.push({ at: b.index, end: b.index + b[0].length, bare: bodyO.slice(b.index, b.index + b[0].length) });
    found.sort((a, b) => a.at - b.at);
    const blocks = [];
    let last = 0;
    for (const f of found) {
      const before = latexToText(bodyS.slice(last, f.at));
      if (before && docM) blocks.push({ type: 'text', text: before });
      last = f.end;
      if (f.bare) {
        const q = `\\node at (0,0) {${f.bare}};`;
        const shapes = importPicture(C, q, q, '');
        for (const x of shapes) delete x.tex;
        blocks.push({ type: 'diagram', shapes });
        continue;
      }
      const picO = bodyO.slice(f.at, f.end);
      const data = embedded(picO);
      if (data) { blocks.push({ type: 'diagram', shapes: data }); continue; }
      // a pgf-umlcd class diagram: the whole picture is the block's code
      const uml = TD.uml && TD.uml.fromPicture(picO);
      if (uml) { blocks.push({ type: 'diagram', shapes: withDefs([uml], preDefs, C) }); continue; }
      const shapes = importPicture(C, bodyS.slice(f.inner, f.inner + f.len), bodyO.slice(f.inner, f.inner + f.len), bodyO.slice(f.open, f.inner));
      blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
    }
    if (!found.length) {
      if (/\\(draw|fill|filldraw|node|shade|path|coordinate|foreach|tikzset|begin\{axis\})\b/.test(bodyS)) {
        const shapes = importPicture(C, bodyS, bodyO, '');
        blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
      } else if (bodyS.trim()) blocks.push({ type: 'text', text: latexToText(bodyS) });
    } else {
      const after = latexToText(bodyS.slice(last));
      if (after && docM) blocks.push({ type: 'text', text: after });
    }
    // editable: each statement kept as code becomes the shapes its preview draws (approximate where the preview is),
    // and nothing remembers the source, so the export is written from the shapes. Code with nothing to draw stays.
    if (opt.editable) for (const b of blocks) if (b.type === 'diagram') {
      const out = b.shapes.flatMap((x: any) => (x.type !== 'tikz' || !x.tex ? [x] : x.prev && x.prev.length ? x.prev.map((p: any) => ({ ...p, id: uid8() })) : [x]));
      const code = out.some((x: any) => x.type === 'tikz' && x.kind !== 'defs');
      b.shapes = out.filter((x: any) => code || !(x.type === 'tikz' && x.kind === 'defs'));
      for (const x of b.shapes) if (x.type !== 'tikz') delete x.tex;
    }
    // what was kept as code, in source order, with the line its statement starts on
    let from = 0;
    const lineAt = (code: any) => {
      const first = String(code || '').split('\n').find((l) => l.trim() && !/^\s*%/.test(l));
      const k = first ? o.indexOf(first.trim(), from) : -1;
      if (k < 0) return null;
      from = k + 1;
      return o.slice(0, k).split('\n').length;
    };
    const report = blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes).filter((x) => x.type === 'tikz' && x.kind !== 'defs' && x.tex)
      .map((x) => ({ code: x.code, line: lineAt(x.code), issues: x.issues || [], preview: (x.prev || []).length }));
    return { blocks, warnings: [...new Set(C.warnings)], kept: report, title, page };
  };
  // packages a picture's code may need (others in a preamble are the document's own)
  const DRAW_PKGS = new Set(['tikz', 'pgfplots', 'tikz-cd', 'circuitikz', 'quantikz', 'tikz-feynman', 'forest', 'chemfig', 'tikz-timing', 'karnaugh-map', 'bytefield', 'pgf-umlcd', 'pgf-umlsd', 'blochsphere',
    'zx-calculus', 'tikz-3dplot', 'tkz-euclide', 'pgfornament', 'xy', 'siunitx', 'bm', 'mathtools', 'physics', 'tikzpeople', 'pgf-pie', 'smartdiagram', 'tikz-qtree', 'tikz-network', 'pgfgantt', 'bodegraph', 'pst-circ',
    'amsmath', 'amssymb', 'amsfonts', 'mathrsfs', 'stmaryrd', 'upgreek', 'esint', 'dsfont', 'bbm']);
  // the preamble's definitions go with each picture, as a code object that exports them to the preamble
  function withDefs(shapes: any, defs: any, C: any) {
    if (!defs) return shapes;
    const tl = shapes.length ? TD.bboxOf(shapes.flatMap((x: any) => { const b = TD.bbox(x); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0) : { x: 0, y: 0 };
    return [{ type: 'tikz', kind: 'defs', pre: true, code: defs, x: 0, y: 0, at: { x: tl.x, y: tl.y - 26 }, ctx: [], prev: [], issues: [], ...(C.libs ? { libs: C.libs.slice() } : {}), ...(C.pkgs ? { pkgs: C.pkgs.slice() } : {}), id: uid8() }, ...shapes];
  }
  TD.importInternals = { parseOpts, arrowSpec, len, tokenizePath, preview, blankComments };
  // a TikZ colour (red, blue!20, red!30!black) → '#rrggbb', or null / undefined (none / unknown)
  let colorCtx: any = null;
  TD.svgColor = svgName;
  TD.tikzColor = (spec: any) => color(colorCtx || (colorCtx = makeCtx()), spec);
})();
