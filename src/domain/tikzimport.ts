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
  const PIC_CODE = '\u0000pic:';
  let PIC_PASSES = 0;
  const STYLE_DEFAULT = '\u0000default:';
  let styleBudget = 0;
  function parseOpts(str: any, depth = 0, raw = false) : any {
    if (!str) return [];
    if (depth === 0) styleBudget = 4096;
    const out = [];
    for (const x of splitTop(str, ',').map((q) => q.trim()).filter(Boolean)) {
      const eq = splitTop(x, '=');
      const o = eq.length > 1 ? { k: eq[0].trim(), v: eq.slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1') } : { k: x, v: null };
      if (!raw && STY && STY.has(o.k)) {
        const body = STY.get(o.k), arg = o.v ?? STY.get(STYLE_DEFAULT + o.k);
        // Only single-argument styles are evaluated. Leave unsupported handlers visible to diagnostics.
        if (/#1/.test(body) && arg == null) { out.push(o); continue; }
        if (depth >= 16 || --styleBudget < 0) { out.push(o); continue; }
        const expanded = body.replace(/#1(?!\d)/g, () => arg ?? '');
        const invocation = o.v == null ? o.k : `${o.k}={${o.v}}`;
        if (styUsed) styUsed.add(invocation);
        if (!styOff) out.push(...parseOpts(expanded, depth + 1));
        continue;
      }
      out.push(o);
    }
    return out;
  }
  // Fixed and single-argument styles, default values, and append/prefix handlers.
  function addStyle(C: any, nm: any, body: any) {
    if (/#(?:[2-9]|1\d)/.test(body) || /^every /.test(nm)) { C.styles.delete(nm); return; }
    C.styles.set(nm, body);
  }
  function defineStyles(C: any, cmd: any, args: any) {
    if (cmd === 'tikzstyle') { const m = /^\s*\{([^}]*)\}\s*=?\s*\[([\s\S]*)\]/.exec(args); if (m) addStyle(C, m[1].trim(), m[2]); return; }
    const m = /^\s*\{([\s\S]*)\}/.exec(args);
    if (!m) return;
    let directory = '';
    for (const { k, v } of parseOpts(m[1], 0, true)) {
      if (k.endsWith('/.cd')) { directory = k.slice(0,-4).replace(/^\/tikz\/?/, '').replace(/^\//,''); continue; }
      const path = k.startsWith('/') ? k.replace(/^\/(?:tikz\/)?/,'') : directory ? directory + '/' + k : k;
      const pic = /^pics\/(.+?)\/\.(style|pic)$/.exec(path);
      if (pic && v != null) {
        const code = pic[2] === 'pic' ? v : parseOpts(v,0,true).find((o: any) => o.k === 'code')?.v;
        if (code != null && !/#\d/.test(code)) C.styles.set(PIC_CODE + pic[1],code);
        else C.styles.delete(PIC_CODE + pic[1]);
        continue;
      }
      const sm = /^(.+?)\/\.(style|append style|prefix style|style \d+ args|style n args|default)$/.exec(k);
      if (!sm) continue;
      const nm = sm[1].trim();
      if (sm[2] === 'default' && v != null) C.styles.set(STYLE_DEFAULT + nm, v);
      else if (sm[2] === 'style' && v != null) addStyle(C, nm, v);
      else if (/^(append|prefix) style$/.test(sm[2]) && v != null) {
        const old = C.styles.get(nm) || '';
        addStyle(C, nm, sm[2] === 'append style' ? `${old},${v}` : `${v},${old}`);
      } else C.styles.delete(nm);
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
    const inheritedFonts = (C.scopes || []).slice().reverse().filter((L: any) => L.font).map((L: any) => ({ k: 'font', v: L.font }));
    opts = [...(C.base || []), ...inheritedFonts, ...opts]; // the picture's own line width, dash and colour come first
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
        case 'opacity': st.opacity = TD.evalNumber(expandMac(v), NaN); break;
        case 'draw opacity': strokeOpacity = TD.evalNumber(expandMac(v), NaN); break;
        case 'fill opacity': fillOpacity = TD.evalNumber(expandMac(v), NaN); break;
        case 'rounded corners': st.radius = len(v, 'pt'); break;
        case 'ball color': st.ballColor = color(C, v); break;
        case 'text': st.color = color(C, v); break;
        case 'font': st.font = (st.font || '') + ' ' + v; break;
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
        case 'start angle': st.a1 = TD.evalNumber(expandMac(v),NaN); break;
        case 'end angle': st.a2 = TD.evalNumber(expandMac(v),NaN); break;
        case 'delta angle': st.da = TD.evalNumber(expandMac(v),NaN); break;
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
    const gradient = new Map(opts.filter((o: any) => /^(left|right|middle|top|bottom) color$/.test(o.k)).map((o: any) => [o.k,color(C,o.v)]));
    if (gradient.size) {
      const vertical = gradient.has('top color') || gradient.has('bottom color');
      const a = gradient.get(vertical ? 'bottom color' : 'left color') || '#ffffff';
      const b = gradient.get(vertical ? 'top color' : 'right color') || '#ffffff';
      st.fill = { g:'linear', angle:vertical ? 90 : 0, stops:[[0,a], ...(gradient.has('middle color') ? [[.5,gradient.get('middle color')]] : []), [1,b]] };
    }
    const withA = (c: any, a: any): any => !c || !(a < 1) ? c : typeof c === 'object'
      ? { ...c, stops:c.stops.map(([t,v]: any) => [t,withA(v,a)]) } : c + hex2(Math.max(0,a) * 255);
    st.stroke = withA(st.stroke, strokeOpacity);
    st.fill = withA(st.fill, fillOpacity);
    return st;
  }
  function fontStyle(fontStr: any) {
    const o: { size: string | number; font: string; bold: boolean; italic: boolean } = { size: 'normalsize', font: 'default', bold: false, italic: false };
    if (!fontStr) return o;
    const fs = fontStr.match(/\\fontsize\{([\d.]+)(pt)?\}/);
    if (fs) o.size = Math.round((parseFloat(fs[1]) / K) * 100) / 100;
    for (const command of fontStr.matchAll(/\\([A-Za-z]+)/g)) if (TD.SIZES.some(([n]: any) => n === command[1])) o.size = command[1];
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
      if ((m = rest.match(/^pic\b\s*/))) {
        i += m[0].length; let opts = '';
        ws();
        if (s[i] === '[') { const e = shut(s,i,'[',']'); opts = s.slice(i+1,e); i = e+1; ws(); }
        if (s[i] === '{') { const e = shut(s,i,'{','}'); toks.push({ t:'pic', body:s.slice(i+1,e).trim(), opts }); i=e+1; }
        else { warn && warn('Unsupported pic syntax'); }
        continue;
      }
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
        let text = '', textStart = -1, textEnd = -1;
        if (m[1] === 'node' && s[i] === '{') { const e = shut(s, i, '{', '}'); text = s.slice(i + 1, e); textStart = i + 1; textEnd = e; i = e + 1; }
        toks.push({ t: 'node', opts, text, textStart, textEnd, name, coordinate: m[1] === 'coordinate' });
        continue;
      }
      if ((m = rest.match(/^(controls|and|rectangle|circle|ellipse|arc|cycle|to|grid|edge|let|in|plot|sin|cos|parabola)\b/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if (rest[0] === '{') { const e = shut(s, i, '{', '}'); toks.push({ t: 'brace', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      warn && warn(`Unknown path text “${rest.slice(0, 12)}”`);
      i++;
    }
    return toks;
  }
  function coord(C: any, raw: any, cur?: any, depth = 0) : any {
    if (depth > 32) return null;
    raw = expandMac(raw.trim());
    const read = (v: string) => coord(C, v, cur, depth + 1);
    // Strip only a balanced whole-expression wrapper.
    while ((raw[0] === '{' && matchClose(raw, 0, '{', '}') === raw.length - 1)
      || (raw[0] === '(' && matchClose(raw, 0, '(', ')') === raw.length - 1)
      || (raw[0] === '$' && raw[raw.length - 1] === '$')) raw = raw.slice(1, -1).trim();
    let level = 0;
    for (let i = 0; i < raw.length - 1; i++) {
      if ('({'.includes(raw[i])) level++;
      else if (')}'.includes(raw[i])) level--;
      const op = raw.slice(i, i + 2);
      if (!level && (op === '|-' || op === '-|')) {
        const a = read(raw.slice(0, i)), b = read(raw.slice(i + 2));
        return a && b ? (op === '|-' ? { x: a.x, y: b.y } : { x: b.x, y: a.y }) : null;
      }
    }
    const terms = splitTop(raw, '!');
    if (terms.length === 3) {
      const a = read(terms[0]), b = read(terms[2]), t = TD.evalNumber(expandMac(terms[1]), NaN);
      return a && b && Number.isFinite(t) ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : null;
    }
    if (raw[0] === '(') {
      const end = matchClose(raw, 0, '(', ')'), op = raw.slice(end + 1).trim();
      if (end > 0 && /^[+-]/.test(op)) {
        const a = read(raw.slice(0, end + 1)), b = read(op.slice(1));
        return a && b ? { x: a.x + (op[0] === '+' ? b.x : -b.x), y: a.y + (op[0] === '+' ? b.y : -b.y) } : null;
      }
    }
    let m;
    if ((m = raw.match(/^([^,:]+):([^,:]+)$/))) { // polar
      const dirs: Record<string, number> = { right: 0, up: 90, left: 180, down: 270 };
      const a = ((dirs[m[1].trim()] ?? TD.evalNumber(m[1], NaN)) * Math.PI) / 180, radii = m[2].split(/\s+and\s+/), rx = len(radii[0]), ry = radii[1] != null ? len(radii[1]) : rx;
      if (![a,rx,ry].every(Number.isFinite)) return null;
      return { x: Math.cos(a) * rx!, y: -Math.sin(a) * ry! };
    }
    const parts = splitTop(raw, ',');
    if (parts.length === 2) {
      const x = len(parts[0]), y = len(parts[1]);
      if (isFinite(x!) && isFinite(y!)) return { x: x! * (C.sx / PX), y: -y! * (C.sy / PX) };
    }
    if (parts.length === 3) return null; // 3d
    const nm = raw.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (C.unresolved?.has(nm)) return null;
    if (C.names[nm]) {
      const box = C.boxes[nm], anchor = raw.slice(nm.length + 1), uv = TD.nodeFeatures?.anchorUV(anchor,box?.shape?.type);
      if (box?.native && uv && TD.nodeFeatures.anchors.includes(anchor)) {
        const frame = TD.rotFrame(box.shape), [u,v] = uv;
        if (frame) return { x:frame[0][0]+u*(frame[1][0]-frame[0][0])+v*(frame[3][0]-frame[0][0]), y:frame[0][1]+u*(frame[1][1]-frame[0][1])+v*(frame[3][1]-frame[0][1]), node:nm };
      }
      return { ...C.names[nm], node: nm };
    }
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
      // TikZ fills an open subpath as though closed, without closing its stroked outline.
      if (!cl && st.fill) {
        if (st.stroke) out.push({type:'poly',pts:pts.map((p) => [p.x,p.y]),closed:true,...lineStyle,stroke:null,fill:st.fill,startTip:'none',endTip:'none'});
        else cl = true;
      }
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
      if (tk.t === 'pic') {
        const code = C.styles.get(PIC_CODE + tk.body), saved = { STY,MAC,styUsed,styOff };
        if (code == null) { C.warnings.push(`Unresolved pic (${tk.body})`); continue; }
        if (++PIC_PASSES > 1000 || PS_DEPTH >= 32) { C.warnings.push('Pic expansion limit exceeded'); continue; }
        const P = { ...C, preview:false, stmts:[], struct:null, warnings:[], scopes:[],
          styles:new Map(C.styles), macros:new Map(C.macros), names:{}, boxes:{}, kinds:{}, unresolved:new Set(), picIssue:null };
        try {
          const made = parseStatements(P,blankComments(code));
          const raw = made.filter((p: any) => p.type === 'tikz' && p.kind !== 'defs');
          if (raw.length) P.warnings.push(...raw.flatMap((p: any) => p.issues.length ? p.issues : ['Pic body is not fully supported']));
          const origin = cur || {x:0,y:0}, own = readXf(C,parseOpts(tk.opts));
          if (own.rest.length) P.warnings.push('Unsupported pic options: ' + own.rest.map((o: any) => o.k).join(', '));
          pushAll(out,applyXf(made.filter((p: any) => p.type !== 'tikz'),[{xf:own.xf,shape:true},{xf:[{dx:origin.x,dy:origin.y}],shape:true}]));
          C.warnings.push(...P.warnings);
        } finally { STY=saved.STY; MAC=saved.MAC; styUsed=saved.styUsed; styOff=saved.styOff; }
        continue;
      }
      if (tk.t === 'coord') {
        const relKind = tk.rel;
        const p = resolve(tk);
        if (!p) { pendingOp = null; continue; }
        if (pendingOp === 'controls') { ctrl.push({ ...p, rel: tk.rel, offset: tk.rel ? coord(C, tk.raw) : null }); continue; }
        if (pendingOp === '--' || pendingOp === 'to' || pendingOp === '|-' || pendingOp === '-|') {
          if (pendingOp === '|-') segs.push({ k: 'L', pts: [cur, { x: cur.x, y: p.y }] }, { k: 'L', pts: [{ x: cur.x, y: p.y }, p] });
          else if (pendingOp === '-|') segs.push({ k: 'L', pts: [cur, { x: p.x, y: cur.y }] }, { k: 'L', pts: [{ x: p.x, y: cur.y }, p] });
          else segs.push({ k: 'L', pts: [cur, p], label: lastSegLabel });
          lastSegLabel = null;
        } else if (pendingOp === '..') {
          const c1 = ctrl[0], last = ctrl[1] || ctrl[0];
          const c2 = ctrl[1]?.rel && last.offset ? { x: p.x + last.offset.x, y: p.y + last.offset.y } : last;
          if (!c1 || !c2) { C.warnings.push('Bezier controls not understood'); pendingOp = null; continue; }
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
            if (!cur) cur = {x:0,y:0};
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

  function nodeDecorations(opts: any[]) {
    const fields: Record<string, any> = {}, issues: string[] = [];
    const seen = new Set();
    for (const o of opts) if (o.k === 'label' || o.k === 'pin') {
      if (seen.has(o.k)) { issues.push('multiple ' + o.k + ' options'); continue; } seen.add(o.k);
      let value = String(o.v || '').trim(), settings: any[] = [];
      if (value[0] === '[') { const end = shut(value, 0, '[', ']'); settings = parseOpts(value.slice(1,end)); value = value.slice(end+1); }
      const parts = splitTop(value, ':'), position = parts.length > 1 ? parts.shift()!.trim() : 'above';
      const text = parts.join(':').trim().replace(/^\{([\s\S]*)\}$/, '$1'), key = o.k === 'pin' ? 'Pin' : 'Label';
      if (!/^(above|below|left|right|above left|above right|below left|below right)$/.test(position)) issues.push('unsupported ' + o.k + ' angle');
      else { fields['node'+key] = text; fields['node'+key+'Position'] = position; }
      for (const set of settings) {
        if (set.k === 'pin distance' && o.k === 'pin' && Number.isFinite(len(set.v))) fields.nodePinDistance = len(set.v);
        else if (!(set.k === 'label distance' && o.k === 'label' && Math.abs((len(set.v) || 0) - 6)<.01)) issues.push('unsupported ' + o.k + ' option ' + set.k);
      }
    }
    return { fields, issues };
  }
  function textShape(C: any, text: any, opts: any, P: any, inherit?: any) {
    const st = style(C, opts, 'node');
    const fs = fontStyle(st.font);
    text = text.replace(/\$\s*\\displaystyle\b\s*([^$]*)\$/g, (m: any, x: any) => `$$${x.trim()}$$`);
    const s = { ...nodeDecorations(opts).fields, type: 'text', x: P.x, y: P.y, text: text.replace(/\s*\\\\\s*/g, '\n').trim(), ...fs, color: st.color || inherit || '#000000', opacity: st.opacity ?? 1 };
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
  // ---------- coordinate transforms, in TikZ option order ----------
  // Returns the transform list in option order (TikZ applies the last one to points first),
  // and the options that are not transforms.
  const XF_KEYS = new Set(['shift', 'xshift', 'yshift', 'rotate', 'rotate around', 'scale', 'scale around']);
  function readXf(C: any, list: any) {
    const xf = [], rest = [], unresolved: string[] = [];
    for (const { k, v } of list) {
      const before = xf.length;
      if (k === 'shift' && v) { const c = coord(C, String(v).trim().replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')); if (c) xf.push({ dx: c.x, dy: c.y }); }
      else if (k === 'xshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: d, dy: 0 }); }
      else if (k === 'yshift' && v) { const d = len(v); if (isFinite(d!)) xf.push({ dx: 0, dy: -d! }); }
      else if (k === 'scale' && v) { const k = TD.evalNumber(expandMac(v), NaN); if (isFinite(k) && k > 0) xf.push({ scale: k, px: 0, py: 0 }); }
      else if (k === 'scale around' && v) {
        const m = String(v).match(/^([^:]+):\s*\((.*)\)\s*$/);
        const k = m && TD.evalNumber(expandMac(m[1]), NaN), c = m && coord(C, m[2]);
        if (isFinite(k) && k > 0 && c) xf.push({ scale: k, px: c.x, py: c.y });
      }
      else if (k === 'rotate' && v) { const a = TD.evalNumber(v, NaN); if (isFinite(a)) xf.push({ rot: a, px: 0, py: 0 }); }
      else if (k === 'rotate around' && v) {
        const m = String(v).trim().replace(/^\{|\}$/g, '').match(/^([^:]+):\s*\((.*)\)\s*$/);
        const a = m && TD.evalNumber(m[1], NaN), c = m && coord(C, m[2]);
        if (isFinite(a) && c) xf.push({ rot: a, px: c.x, py: c.y });
      } else rest.push({ k, v });
      if (XF_KEYS.has(k) && xf.length === before) unresolved.push(`Unresolved transform ${k}=${v}`);
    }
    C.warnings.push(...unresolved);
    return { xf, rest, unresolved };
  }
  // apply transforms (innermost list first, each list last-option-first); text keeps its own angle
  // unless `transform shape` is on
  function applyXf(shapes: any, lists: any) {
    for (const s of shapes) {
      for (let li = 0; li < lists.length; li++) {
        const L = lists[li], transformShape = L.shape || lists.slice(li + 1).some((outer: any) => outer.shape);
        if (L.opacity != null) s.opacity = (s.opacity ?? 1) * L.opacity;
        for (let i = L.xf.length - 1; i >= 0; i--) {
          const t = L.xf[i];
          if (t.scale !== undefined) {
            const k = t.scale, node = s.type === 'text' || s._importNodeAt || s.nodeText != null || s.nodeName || TD.blocks?.get(s.type);
            const point = (x: number, y: number) => [t.px + (x - t.px) * k, t.py + (y - t.py) * k];
            if (node) {
              const b = TD.bboxOf(TD.TYPES[s.type].samples({ ...s, objectScale: 1 }), 0);
              const anchor = s._importNodeAt || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
              const centre = transformShape ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : anchor;
              TD.translate(s, (centre.x - t.px) * (k - 1), (centre.y - t.py) * (k - 1));
              if (transformShape) s.objectScale = (s.objectScale || 1) * k;
              if (s._importNodeAt) { const [x, y] = point(anchor.x, anchor.y); s._importNodeAt = { x, y }; }
            } else {
              // Bake path coordinates into world space, keeping editable endpoints
              // and named-coordinate attachments consistent with the drawing.
              const type = TD.TYPES[s.type];
              for (const [x, y] of type.pts || []) [s[x], s[y]] = point(s[x], s[y]);
              if (s.type === 'poly') s.pts = s.pts.map(([x, y]: number[]) => point(x, y));
              if (s.type === 'region') s.rings = s.rings.map((r: any[]) => r.map(([x, y]: number[]) => point(x, y)));
              for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (typeof s[key] === 'number') s[key] *= k;
            }
            continue;
          }
          if (t.rot === undefined) { TD.translate(s, t.dx, t.dy); if (s._importNodeAt) { s._importNodeAt.x += t.dx; s._importNodeAt.y += t.dy; } continue; }
          const keep = s.type === 'text' && !transformShape ? s.angle : null;
          TD.rotateShape(s, t.px, t.py, -t.rot);
          if (s._importNodeAt) {
            const a = -t.rot * Math.PI / 180, dx = s._importNodeAt.x - t.px, dy = s._importNodeAt.y - t.py;
            s._importNodeAt = { x: t.px + Math.cos(a) * dx - Math.sin(a) * dy, y: t.py + Math.sin(a) * dx + Math.cos(a) * dy };
          }
          if (s.type === 'text' && !transformShape) { if (keep) s.angle = keep; else delete s.angle; }
        }
      }
    }
    for (const s of shapes) delete s._importNodeAt;
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
  const PATH_KEYS = new Set([...W_KEYS, 'draw', 'fill', 'color', 'line width', 'opacity', 'draw opacity', 'fill opacity', 'rounded corners', 'ball color', 'left color', 'right color', 'middle color', 'top color', 'bottom color', 'dash pattern',
    'radius', 'x radius', 'y radius', 'start angle', 'end angle', 'delta angle', 'bend left', 'bend right', 'even odd rule', 'shift', 'xshift', 'yshift', 'rotate', 'rotate around', 'scale', 'scale around', 'transform shape']);
  const NODE_KEYS = new Set(['label', 'pin', 'outer sep', 'font', 'text', 'color', 'opacity', 'anchor', 'rotate', 'above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'shift', 'xshift', 'yshift', 'scale', 'scale around', 'transform shape']);
  const LABEL_KEYS = new Set(['above', 'below', 'left', 'right', 'midway', 'pos', 'near start', 'near end', 'swap', "'", 'auto', 'font', 'text', 'color', 'fill']);
  const COLOR_KEYS = new Set(['draw', 'fill', 'color', 'text', 'ball color', 'left color', 'right color', 'middle color', 'top color', 'bottom color']);
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
    if (r.startsWith('\\') && Number.isFinite(len(r))) return null;
    if (!r || r.includes('|-') || r.includes('-|') || /^[-+\d.\s]/.test(r) || r.includes(',') || r.includes(':') || r.includes('$')) return null;
    const anchor = /\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/.test(r);
    const nm = r.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (!C.names[nm]) return `Unresolved node or coordinate (${nm})`;
    if (C.unresolved?.has(nm)) return `Unresolved layout dependency (${nm})`;
    if (C.approx && C.approx.has(nm)) return `(${nm}) is placed approximately`;
    if (anchor && C.boxes[nm]?.native && TD.nodeFeatures?.anchors.includes(r.slice(nm.length+1))) return null;
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
      if (t.t === 'node') {
        const opts = parseOpts(t.opts), allowed = new Set(LABEL_KEYS);
        // A node placed at the current point is a separate text object. Its anchor is
        // implemented by textShape; labels attached along a segment use a different model.
        const along = opts.some((o: any) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap'].includes(o.k));
        if (!along && opts.some((o: any) => o.k === 'anchor' && /^(center|north|south|east|west|north east|north west|south east|south west)$/.test(o.v))) allowed.add('anchor');
        bad.push(...unknownKeys(C, opts, allowed));
      }
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
    if (!vals || !f.vars || /remember/.test(f.opts)) { C.warnings.push('\\foreach list not understood: no preview'); return []; }
    const settings = parseOpts((f.opts || '').replace(/^\[|\]$/g,''),0,true);
    const evaluation = settings.filter((o: any) => o.k === 'evaluate');
    if (settings.some((o: any) => o.k !== 'evaluate' && o.k !== 'count') || evaluation.some((o: any) => o.v == null)) {
      C.warnings.push('Unsupported foreach options: no preview'); return [];
    }
    const count = /count\s*=\s*(\\[a-zA-Z@]+)/.exec(f.opts || '');
    const out: any[] = [];
    if ((FOREACH_PASSES += vals.length) > 100000) { C.warnings.push('\\foreach makes too many passes: no preview'); return []; }
    vals.forEach((v, n) => {
      const parts = f.vars.length > 1 ? v.replace(/^\{|\}$/g, '').split('/') : [v];
      let body = f.body;
      const P = { ...C, macros:new Map(C.macros) };
      const replace = (text: string, nm: string, value: string) => text.replace(/\\[A-Za-z@]+/g, token => token === nm ? value : token);
      f.vars.forEach((nm: any, q: any) => { body = replace(body,nm,`{${(parts[q] ?? parts[parts.length - 1]).trim()}}`); P.macros.set(nm.slice(1),(parts[q] ?? parts[parts.length - 1]).trim()); });
      if (count) { body = replace(body,count[1],String(n+1)); P.macros.set(count[1].slice(1),String(n+1)); }
      const saved = MAC; MAC=P.macros;
      try {
        for (const setting of evaluation) for (const assignment of splitTop(setting.v,';').filter((v: string) => v.trim())) {
          const m = /^\s*\\([A-Za-z@]+)\s*=\s*([\s\S]+)$/.exec(assignment);
          const value = m ? TD.evalNumber(expandMac(m[2]),NaN) : NaN;
          if (!m || !Number.isFinite(value)) { C.warnings.push('Unsupported foreach evaluate assignment: no preview'); return; }
          P.macros.set(m[1],String(value));
        }
        pushAll(out, parseStatements(P, body.replace(/\{([-\d.]+)\}/g, '$1')));
      } finally { MAC=saved; STY=C.styles; }
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
      const nodeStyle = style(C, parseOpts(node.opts), 'node');
      Object.assign(q, fontStyle(nodeStyle.font));
      if (nodeStyle.color) q.color = nodeStyle.color;
      const i = raw.length === plain.length ? plain.indexOf(m[0]) : -1;
      const code = i >= 0 ? raw.slice(i, i + m[0].length) : m[0];
      q.src = B.dedent ? dedentLines(code) : code;
      // place() may answer false: the code as written can't stay in a node (a table float), so it is written from the shape
      if ((B as any).place) { if ((B as any).place(q, at) === false) q._fromShape = true; } else { const b = B.bb!(q); q.x = at.x - b.w / 2; q.y = at.y - b.h / 2; }
      const extra = text.replace(m[0], '').replace(/\\color\{[^}]*\}/g, '').trim();
      const bad = unknownKeys(C, parseOpts(node.opts), new Set(['inner sep', 'anchor', 'text', 'color', 'font', 'transform shape', ...XF_KEYS]));
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
      m.tkStyle = { n: [...used], f, d: Object.fromEntries<any>([...used].map((nm: any) => [nm, parseOpts(nm).map((o: any) => o.v == null ? o.k : `${o.k}={${o.v}}`).join(',')])) };
    });
  }

  // Statements of a picture. `s` is the code with comments blanked (same length as `o`, the code as written).
  // Every statement becomes shapes (C.preview, or when it is exact) or one TikZ code object; C.stmts gets
  // where each one was, for the source write-back (s.tex).
  const PATHS: Record<string, any> = { pic: 'path', draw: 'draw', fill: 'fill', filldraw: 'filldraw', path: 'path', shade: 'shade', shadedraw: 'shade', clip: null, useasboundingbox: null };
  const SEMI = new Set(['pic', 'matrix', 'graph', 'datavisualization', 'calendar', 'spy', 'pattern', 'shadedraw']);
  const DEFS = new Set(['tikzset', 'tikzstyle', 'def', 'gdef', 'edef', 'xdef', 'let', 'newcommand', 'renewcommand', 'providecommand', 'definecolor', 'colorlet', 'pgfmathsetmacro', 'pgfmathtruncatemacro',
    'pgfmathparse', 'pgfplotsset', 'pgfdeclarelayer', 'pgfsetlayers', 'usetikzlibrary', 'tikzmath', 'pgfkeys', 'newlength', 'setlength', 'pgfmathsetlengthmacro', 'tikzcdset', 'ctikzset', 'pgfdeclarepatternformonly', 'pgfdeclarepattern', 'pgfdeclarehorizontalshading', 'pgfdeclareverticalshading', 'pgfdeclareradialshading', 'pgfdeclarefunctionalshading', 'pgfdeclareplotmark', 'pgfdeclarearrow',
    'centering', 'small', 'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'bfseries', 'itshape', 'sffamily', 'ttfamily', 'rmfamily', 'color', 'selectfont', 'fontsize']);
  // nesting (environments, loops in loops) past 64 levels is not read: hostile input would overflow the stack.
  // FOREACH_PASSES bounds the passes of nested loops (400 × 400 × 400 … would never finish).
  let PS_DEPTH = 0, FOREACH_PASSES = 0;
  function parseStatements(C: any, s: any, o?: any) : any {
    if (PS_DEPTH >= 64) { C.warnings.push('Nested too deep: the inner code is not read'); return []; }
    if (PS_DEPTH === 0) { FOREACH_PASSES = 0; PIC_PASSES = 0; }
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
      issues = [...issues, ...scopeIssue(), ...(C.picIssue ? [C.picIssue] : [])];
      const unresolved = issues.some((w: string) => /Unresolved|Unsupported coordinate|layout not evaluated/.test(w));
      if (unresolved) {
        for (const nm of extra.names || []) (C.unresolved ||= new Set()).add(nm);
        made = []; // Never present invented positions as a usable approximation.
      }
      if (preview) { pushAll(shapes, made); return; }
      const exact = !extra.raw && !issues.length && made.length > 0;
      let list = made;
      if (!exact) {
        const r: Record<string, any> = { type: 'tikz', kind: extra.kind || 'code', code: '', x: 0, y: 0, ctx: [], prev: made.filter((p: any) => p.type !== 'tikz'), issues: [...new Set(issues)], ...(unresolved ? { unresolved: true } : {}) };
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
            const { xf, rest, unresolved } = readXf(C, parseOpts(str));
            const shape = rest.some((x) => x.k === 'transform shape' && x.v !== 'false');
            // `transparency group, opacity=x` is how a translucent shape exports: the opacity belongs to the shapes inside
            const op = rest.find((x) => x.k === 'opacity'), opv = op ? parseFloat(op.v) : NaN;
            const other = rest.filter((x) => x.k !== 'transform shape' && x.k !== 'transparency group' && x.k !== 'opacity' && x.k !== 'font');
            L = { xf, shape, font: rest.filter((x: any) => x.k === 'font').map((x: any) => x.v).join(' '), ...(opv >= 0 && opv < 1 ? { opacity: opv } : {}), opts: str.replace(/\s+/g, ' ').trim() };
            const scopeIssues = [...unresolved, ...(other.length ? ['scope options not drawn: ' + other.map((x) => x.k).join(', ')] : [])];
            if (scopeIssues.length) L.issue = scopeIssues.join('; ');
            i = e2 + 1;
          } else i = e + 1;
          L.styles = new Map(C.styles); L.macros = new Map(C.macros);
          (C.scopes = C.scopes || []).unshift(L);
          if (C.struct) C.struct.push(i);
          continue;
        }
        if (name === 'end' && env === 'scope') { if (C.scopes && C.scopes.length) { const scope = C.scopes.shift(); C.styles = scope.styles || C.styles; STY = C.styles; C.macros = scope.macros || C.macros; MAC = C.macros; } i = e + 1; if (C.struct) C.struct.push(i); continue; }
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
        // Definitions are local to their scope; the enclosing maps are restored at its end.
        if (/^(g|e|x)?def$|^(re|provide|new)command$|^pgfmathsetmacro$|^pgfmathtruncatemacro$/.test(name)) {
          const d = macroDef(name, s.slice(j, end));
          if (d) C.macros.set(d.nm, name === 'pgfmathtruncatemacro' ? String(Math.trunc(+d.v)) : d.v);
        }
        if ((name === 'tikzset' || name === 'tikzstyle') && C.styles) defineStyles(C, name, s.slice(j, end));
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
          if (name === 'pic') { body = `pic${optStr ? '['+optStr+']' : ''} ${body}`; optStr = ''; }
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
        let at: any = null, node: any = null, hasAt = false;
        for (const t of toks) {
          if (t.t === 'at') { at = coord(C, t.raw); hasAt = true; }
          if (t.t === 'node') node = t;
          if (t.t === 'coord' && !at) { at = coord(C, t.raw); hasAt = true; }
        }
        if (!node) { styUsed = null; if (!preview) done(bs, k, [], ['not understood'], { raw: true }); continue; }
        const missingAt = hasAt && !at;
        at = at || { x: 0, y: 0 };
        // placed by name: at=(n1.east) (kept as code), or the positioning library's right=1cm of n1: the node
        // goes where TikZ puts it (beside the other node's box) and keeps the relation (s.pos) for the export
        const placeIss: any[] = missingAt ? ['Unresolved explicit node position'] : [];
        let pos = null;
        for (const t of toks) if (t.t === 'at' || (t.t === 'coord' && t === toks.find((q) => q.t === 'coord'))) { const w = nameIssue(C, t.raw); if (w) placeIss.push(w); }
        const nopts = parseOpts(node.opts || '');
        const layoutKeys = nopts.filter((o: any) => /^(fit|span|Minimum Width|Minimum Height|append after command|to path|east above|west above|north left|north right|east below|west below|south left|south right)$/.test(o.k));
        if (layoutKeys.length) placeIss.push('layout not evaluated: ' + layoutKeys.map((o: any) => o.k).join(', '));
        for (const { k: pk, v } of nopts) {
          const pm = v && /^(above|below|left|right|above left|above right|below left|below right)$/.test(pk) && /^(?:(.*?)\s+)?of\s+(.+)$/.exec(v.trim());
          if (!pm) continue;
          const of = pm[2].trim(), resolved = coord(C, of), ref: any = resolved || at;
          if (!resolved || C.unresolved?.has(of)) placeIss.push(`Unresolved layout dependency (${of})`);
          const dd = (pm[1] || '').split(/\s+and\s+/).map((x: any) => len(x));
          const diag = / /.test(pk), dist = C.nodeDist ?? PX;
          let dy0 = isFinite(dd[0]) ? dd[0] : diag ? dist * Math.SQRT1_2 : dist, dx0 = isFinite(dd[1]) ? dd[1] : isFinite(dd[0]) ? dd[0] : dy0;
          if (!diag) dx0 = dy0;
          const dx = /left/.test(pk) ? -1 : /right/.test(pk) ? 1 : 0, dy = /above/.test(pk) ? -1 : /below/.test(pk) ? 1 : 0;
          // the other node's border (its box and inner sep; a coordinate has none); this node's own half box and
          // inner sep are added where the text is made (textShape reads the same key)
          const bx = C.boxes[of], sep = bx && !bx.pt && !bx.native ? 3.33 / K : 0;
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
        const shapeOption = [...nopts].reverse().find((o: any) => ['circle','ellipse','rectangle'].includes(o.k) || o.k === 'shape');
        const shapeName = shapeOption?.k === 'shape' ? shapeOption.v : shapeOption?.k;
        const shapeKind = shapeName === 'circle' || shapeName === 'ellipse' ? 'ellipse' : shapeName === 'rectangle' ? 'rect' : null;
        const size = len(nopts.find((o: any) => o.k === 'minimum size')?.v);
        let w = len(nopts.find((o: any) => o.k === 'minimum width')?.v), h = len(nopts.find((o: any) => o.k === 'minimum height')?.v);
        if (shapeKind && (node.text.trim() || Number.isFinite(size) || (Number.isFinite(w) && Number.isFinite(h)))) {
          const style0 = style(C,nopts,'node'), decoration = nodeDecorations(nopts);
          if (!nopts.some((o: any) => o.k === 'draw')) style0.stroke = null;
          const fs = fontStyle(style0.font), text = node.text.replace(/\s*\\\\\s*/g, '\n').trim();
          const inner = nopts.find((o: any) => o.k === 'inner sep');
          const sep = inner ? Number(len(inner.v, 'pt')) : 3.333 / K;
          const tb = text ? TD.textBox(text,fs) : { w:0,h:0 };
          w = Math.max(Number.isFinite(w) ? w! : 0, Number.isFinite(size) ? size! : 0, tb.w + 2*sep);
          h = Math.max(Number.isFinite(h) ? h! : 0, Number.isFinite(size) ? size! : 0, tb.h + 2*sep);
          if (shapeName === 'circle') w = h = Math.max(w,h, Math.hypot(tb.w+2*sep,tb.h+2*sep));
          // Positioning places borders apart; include this node's own half-size.
          const placement = pos && nopts.find((o: any) => o.k === pos.k);
          if (placement && pos) {
            at = { x:at.x + (/left/.test(pos.k) ? -w/2 : /right/.test(pos.k) ? w/2 : 0),
              y:at.y + (/above/.test(pos.k) ? -h/2 : /below/.test(pos.k) ? h/2 : 0) };
          }
          const anchor = nopts.find((o: any) => o.k === 'anchor');
          if (anchor && TD.nodeFeatures.anchors.includes(anchor.v)) {
            const [u,v] = TD.nodeFeatures.anchorUV(anchor.v,shapeKind);
            at = { x:at.x + (.5-u)*w, y:at.y + (.5-v)*h };
          }
          const made = TD.TYPES[shapeKind].create(at,style0);
          made._importNodeAt = { ...at };
          Object.assign(made, shapeKind === 'rect' ? {x:at.x-w!/2,y:at.y-h!/2,w,h,radius:style0.radius || 0} : {cx:at.x,cy:at.y,rx:w!/2,ry:h!/2}, fs, { color: style0.color || '#000000' }, decoration.fields);
          if (text) made.nodeText = text;
          if (node.name) made.nodeName = node.name;
          const xf = readXf(C,nopts);
          const absolute = applyXf([made],[{xf:xf.xf.map((t: any)=>(t.rot!==undefined || t.scale!==undefined)?{...t,px:at.x,py:at.y}:t),shape:true},...(C.scopes || [])]);
          const allowed = new Set([...PATH_KEYS,...NODE_KEYS,'rectangle','ellipse','circle','shape','minimum size','minimum width','minimum height','inner sep','outer sep']);
          const bad = [...unknownKeys(C,nopts,allowed),...decoration.issues];
          if (!Number.isFinite(sep) || sep < 0) bad.push('inner sep');
          if (anchor && !TD.nodeFeatures.anchors.includes(anchor.v)) bad.push('anchor');
          if (nopts.some((o: any) => o.k==='outer sep' && len(o.v,'pt')!==0)) bad.push('outer sep');
          if (node.name) {
            const frame = TD.rotFrame(absolute[0]);
            C.names[node.name] = { x:(frame[0][0]+frame[2][0])/2, y:(frame[0][1]+frame[2][1])/2 };
            C.boxes[node.name] = { w, h, native:true, shape:absolute[0] };
          }
          done(bs,k,absolute,[...nodeIss(),...bad],{names}); styUsed=null; continue;
        }
        const blk = nodeBlock(C, node, at, o.slice(bs, k), s.slice(bs, k));
        if (blk) {
          blk.shape._importNodeAt = { ...at };
          const own = readXf(C, nopts);
          const xf = own.xf.map((x: any) => x.scale !== undefined ? { ...x, px: at.x, py: at.y } : x);
          styUsed = null; done(bs, k, applyXf([blk.shape], [{ xf, shape: true }, ...(C.scopes || [])]), [...nodeIss(), ...blk.issues], { names }); continue;
        }
        if (node.text.trim()) {
          const make = () => {
            const no = parseOpts(node.opts), own = readXf(C, no), t = textShape(C, node.text, no, at);
            // a node's own rotate turns it about its own position
            (t as any)._importNodeAt = { ...at };
            const xf = own.xf.map((x) => ((x.rot !== undefined || x.scale !== undefined) && !x.px && !x.py ? { ...x, px: t.x, py: t.y } : x));
            return applyXf([t], [{ xf, shape: true }, ...(C.scopes || [])]);
          };
          const made = make();
          styUsed = null;
          const bad = preview ? [] : [...unknownKeys(C, nopts, NODE_KEYS), ...nodeDecorations(nopts).issues];
          if (nopts.some((o: any) => o.k==='outer sep' && len(o.v,'pt')!==0)) bad.push('outer sep');
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
        } else if (!preview) done(bs, k, [], [...nodeIss(), 'empty node'], { raw: true, at, names });
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
    STY = C.styles;
    C.sx = PX; C.sy = PX; C.scopes = []; C.stmts = []; C.struct = []; C.kinds = {}; C.approx = null; C.unresolved = new Set(); C.picIssue = null; C.base = []; C.nodeDist = undefined; C.boxes = {}; gtTip = null;
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
    const pictureXf = readXf(C, parseOpts(optStr));
    C.scopes = [{ xf: pictureXf.xf, shape: pictureXf.rest.some((o: any) => o.k === 'transform shape' && o.v !== 'false'), font: pictureXf.rest.filter((o: any) => o.k === 'font').map((o: any) => o.v).join(' '), opts: '' }];
    const odd = rest.map(keyOf).filter((k) => !['x', 'y', 'font', 'transform shape', ...XF_KEYS].includes(k));
    if (odd.length) C.picIssue = 'picture options the shapes do not hold: ' + odd.join(', ');
    if (pictureXf.unresolved.length) C.picIssue = pictureXf.unresolved.join('; ');
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
      if (!st.raw && st.shapes.length === 1 && own?.type === 'text' && /^\\node\b/.test(s.slice(st.start))) {
        const tokens = tokenizePath(C, o.slice(st.start, st.end));
        const labels = tokens.filter((t: any) => t.t === 'node' && t.textStart >= 0);
        if (labels.length === 1) {
          const t = byShape.get(own), label = labels[0];
          t.label = { from: st.start + label.textStart - prevEnd, to: st.start + label.textEnd - prevEnd, value: own.text };
        }
      }
      if (st.raw && own) {
        own.code = TD.rawTikz.dedent(o.slice(cut, end));
        own.ctx = ctx;
        if ([...C.styles.keys()].some((k: string) => k.startsWith(PIC_CODE))) own.definitions = Object.fromEntries(C.styles);
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
      if (x.type === 'tikz' && t.i === 0) { x.code = flat[n].code; x.ctx = flat[n].ctx; if (flat[n].names) x.names = flat[n].names; if (flat[n].macros) x.macros = flat[n].macros; if (flat[n].definitions) x.definitions = flat[n].definitions; }
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
    // Explicit anchors of supported native nodes retain model attachments, not just coordinates.
    const nativeNodes = new Map(shapes.filter((n: any) => n.nodeName).map((n: any) => [n.nodeName,n]));
    for (const edge of shapes) if (['line','curve','spring'].includes(edge.type) && edge.tex?.src) {
      const refs = [...edge.tex.src.matchAll(/\(([A-Za-z][A-Za-z0-9_-]*)\.(center|north(?: east| west)?|south(?: east| west)?|east|west)\)/g)];
      for (const [key,kx,ky,index] of [['link1','x1','y1',0],['link2','x2','y2',refs.length-1]] as const) {
        const match = refs[index], target: any = match && nativeNodes.get(match[1]); if (!target) continue;
        const frame = TD.rotFrame({...target,nodeLabel:'',nodePin:''}); if (!frame) continue;
        const [u,v] = TD.nodeFeatures.anchorUV(match[2],target.type), x = frame[0][0]+u*(frame[1][0]-frame[0][0])+v*(frame[3][0]-frame[0][0]), y = frame[0][1]+u*(frame[1][1]-frame[0][1])+v*(frame[3][1]-frame[0][1]);
        if (Math.hypot(edge[kx]-x,edge[ky]-y)<.25) edge[key] = {id:target.id,u,v};
      }
    }
    // the signature, and one that a move does not change (rounded, with the first shape's corner): a statement
    // whose shapes only moved together is written as it was, in a shift scope
    for (const x of shapes) if (x._fromShape) { delete x._fromShape; x.tex.sig = 'new'; }
    for (const x of shapes) if (x.tex && x.tex.sig !== 'new') {
      x.tex.sig = TD.texSig(x);
      x.tex.sr = TD.texSig(x, true);
      if (x.tex.i === 0) { const b = TD.bbox(x); if (isFinite(b.x) && isFinite(b.y)) x.tex.b = [b.x, b.y]; }
    }
    return shapes;
  }
  // the preview of TikZ code kept as an object, drawn where it was (its scopes, the names it uses)
  function preview(code: any, ctx: any, names: any, macros: any, definitions?: any) {
    const C: any = makeCtx();
    C.styles = new Map(Object.entries(definitions || {}));
    STY = C.styles;
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
    const o = (opt.definitions ? String(opt.definitions) + '\n' : '') + String(src);
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
    const preEnd = docM ? docM.index! : s.indexOf('\\begin{tikzpicture}');
    if (preEnd >= 0) {
      const ps = s.slice(0, preEnd), po = o.slice(0, preEnd);
      for (const m of ps.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) C.libs = [...new Set([...(C.libs || []), ...m[1].split(',').map((x: any) => x.trim()).filter(Boolean)])];
      for (const m of ps.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)) for (const p of m[1].split(',').map((x: any) => x.trim())) if (DRAW_PKGS.has(p) && p !== 'tikz') C.pkgs = [...new Set([...(C.pkgs || []), p])];
      const P = { ...C, warnings: [], scopes: [], stmts: [], struct: null };
      parseStatements(P, ps, po);
      Object.assign(C.colors, P.colors);
      preDefs = P.stmts.filter((st: any) => st.raw && st.shapes[0] && st.shapes[0].kind === 'defs' && !/^\s*\\(centering|small|large|normalsize|footnotesize|color)\b/.test(po.slice(st.start, st.end)))
        .map((st: any) => po.slice(st.start, st.end).trim())
        // not the lines DiagramTeX's own preamble adds (quantikz compatibility, pgfplots compat)
        .filter((t: any) => !/^\\pgfplotsset\{compat=[^}]*\}$/.test(t)).join('\n');
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
    // circuitikz environments: a Circuit block each
    for (const b of bodyS.matchAll(/\\begin\{circuitikz\}[\s\S]*?\\end\{circuitikz\}/g))
      if (!inPic(b.index)) found.push({ at: b.index, end: b.index + b[0].length, cz: bodyO.slice(b.index, b.index + b[0].length) });
    for (const b of bodyS.matchAll(/\\begin\{quantikz\}[\s\S]*?\\end\{quantikz\}|\\begin\{forest\}[\s\S]*?\\end\{forest\}|\\begin\{ZX\}[\s\S]*?\\end\{ZX\}|\\begin\{tikztimingtable\}[\s\S]*?\\end\{tikztimingtable\}|\\begin\{sequencediagram\}[\s\S]*?\\end\{sequencediagram\}|(?:\\bytefieldsetup\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*)*\\begin\{bytefield\}[\s\S]*?\\end\{bytefield\}/g))
      if (!inPic(b.index)) found.push({ at: b.index, end: b.index + b[0].length, bare: bodyO.slice(b.index, b.index + b[0].length) });
    found.sort((a, b) => a.at - b.at);
    const blocks = [];
    let last = 0;
    const preStyles = new Map(C.styles), preMacros = new Map(C.macros);
    for (const f of found) {
      C.styles = new Map(preStyles); C.macros = new Map(preMacros); C.names = {};
      const before = latexToText(bodyS.slice(last, f.at));
      if (before && docM) blocks.push({ type: 'text', text: before });
      last = f.end;
      if (f.cz) {
        const q = circuitBlock(f.cz, false);
        if (q) { blocks.push({ type: 'diagram', shapes: withDefs([q], preDefs, C) }); continue; }
        const shapes = importPicture(C, bodyS.slice(f.at, f.end).replace(/\\(begin|end)\{circuitikz\}(\[[^\]]*\])?/g, (m: any) => ' '.repeat(m.length)), bodyO.slice(f.at, f.end), '');
        blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
        continue;
      }
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
      // a picture drawn wholly with circuitikz parts: a Circuit block
      const czq = circuitBlock(picO, true) || automataBlock(picO);
      if (czq) { blocks.push({ type: 'diagram', shapes: withDefs([czq], preDefs, C) }); continue; }
      const shapes = importPicture(C, bodyS.slice(f.inner, f.inner + f.len), bodyO.slice(f.inner, f.inner + f.len), bodyO.slice(f.open, f.inner));
      blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
    }
    const bareCz = !found.length && (circuitBlock(bodyO, true) || (/^\s*\\(node|path|draw|tikzset)\b/.test(bodyS) && automataBlock(bodyO)));
    if (bareCz) blocks.push({ type: 'diagram', shapes: withDefs([bareCz], preDefs, C) });
    else if (!found.length) {
      if (/\\(draw|fill|filldraw|node|shade|path|coordinate|foreach|tikzset|begin\{axis\})\b/.test(bodyS)) {
        const shapes = importPicture(C, bodyS, bodyO, '');
        blocks.push({ type: 'diagram', shapes: withDefs(shapes, preDefs, C) });
      } else if (bodyS.trim()) blocks.push({ type: 'text', text: latexToText(bodyS) });
    } else {
      const after = latexToText(bodyS.slice(last));
      if (after && docM) blocks.push({ type: 'text', text: after });
    }
    const analysis = blocks.filter((b: any) => b.type === 'diagram').flatMap((b: any) => b.shapes)
      .filter((x: any) => !(x.type === 'tikz' && x.kind === 'defs'))
      .map((x: any) => ({ id: x.id, status: x.type !== 'tikz' ? 'editable' : x.unresolved || !(x.prev || []).length ? 'unresolved' : 'preserved',
        code: x.code || x.tex?.src || '', issues: x.issues || [], preview: x.type !== 'tikz' || !!(x.prev || []).length }));
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
    return { blocks, warnings: [...new Set(C.warnings)], kept: report, analysis, title, page };
  };
  // top-level comma-separated items (commas inside {} [] () stay)
  function splitList(t: string) {
    const out: string[] = [];
    let d = 0, buf = '';
    for (const ch of t) {
      if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
      if (ch === ',' && d === 0) { out.push(buf.trim()); buf = ''; } else buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }
  // A picture as DiagramTeX writes one block: \begin{tikzpicture}[x=1cm, y=1cm] \begin{scope}[shift={(x,y)}, …] body
  // \end{scope} \end{tikzpicture}. Gives where the scope moves it (cm, y up), the scope's other options and the body
  // (the picture's own x=1cm, y=1cm are DiagramTeX's and dropped). Anything else: the picture's options and body as written.
  function unscope(pic: string) {
    const t = blankComments(pic), bm = /^\s*\\begin\{tikzpicture\}\s*/.exec(t), end = t.lastIndexOf('\\end{tikzpicture}');
    if (!bm || end < 0) return null;
    let i = bm[0].length, env: string[] = [];
    if (t[i] === '[') { const e = matchClose(t, i, '[', ']'); if (e < 0) return null; env = splitList(t.slice(i + 1, e)); i = e + 1; }
    const body = pic.slice(i, end), bt = t.slice(i, end);
    const sm = /^\s*\\begin\{scope\}\s*\[/.exec(bt);
    if (sm) {
      const ob = sm[0].length - 1, oe = matchClose(bt, ob, '[', ']'), se = bt.lastIndexOf('\\end{scope}');
      const o = oe > 0 ? splitList(bt.slice(ob + 1, oe)) : [];
      const sh = o.length ? /^shift\s*=\s*\{?\s*\(\s*(-?[\d.]+)\s*(?:cm)?\s*,\s*(-?[\d.]+)\s*(?:cm)?\s*\)\s*\}?$/.exec(o[0]) : null;
      if (sh && se > oe && !bt.slice(se + 11).trim() && !/\\begin\{scope\}/.test(bt.slice(oe, se))) {
        const own = env.every((x) => /^[xy]\s*=\s*1\s*cm$/.test(x));
        if (own) return { at: [+sh[1], +sh[2]], opts: o.slice(1), body: body.slice(oe + 1, se) };
      }
    }
    return { at: null as number[] | null, opts: env, body };
  }
  // Circuitikz code as a Circuit block. `whole`: only when every statement is a circuitikz part or wire (with at
  // least one part) and nothing is left over but settings, so a plain TikZ picture stays a picture. Otherwise (a
  // circuitikz environment) what can't be read is kept as code in the block.
  function circuitBlock(code: string, whole: boolean) {
    if (!TD.cz || !TD.TYPES.cz) return null;
    const u = /^\s*\\begin\{tikzpicture\}/.test(code) ? unscope(code) : null;
    let size = '', col = '';
    if (u && u.at) {
      // the options the Circuit block itself writes: its colour and its labels' size
      const rest = u.opts.filter((o) => {
        const f = /^font\s*=\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)$/.exec(o);
        if (f) { size = f[1]; return false; }
        const c = /^color\s*=\s*(.+)$/.exec(o), h = c && TD.tikzColor(c[1].trim());
        if (h) { col = h; return false; }
        return true;
      });
      code = (rest.length ? `\\tikzset{${rest.join(', ')}}\n` : '') + u.body;
    }
    const { items, raw } = TD.cz.parse(code);
    if (!items.length) return null;
    if (whole && (!items.some((it: any) => !TD.cz.isWire(it)) || String(raw).split('\n').some((l: string) => l.trim() && !/^\\(ctikzset|tikzset)\b/.test(l.trim())))) return null;
    const q = { ...TD.TYPES.cz.create({ x: 0, y: 0 }, {}), items, raw, x: 0, y: 0, id: uid8() };
    if (u && u.at) { q.x = u.at[0] * TD.PX_PER_CM; q.y = -u.at[1] * TD.PX_PER_CM; }
    if (size) q.size = size;
    if (col) q.color = col;
    return q;
  }
  // A picture of automata states (\node[state] …) and the transitions between them, and nothing else: an Automaton block
  function automataBlock(pic: string) {
    if (!TD.fsm || !TD.TYPES.automata || !/\bstate\b/.test(pic)) return null;
    const u = /^\s*\\begin\{tikzpicture\}/.test(pic) ? unscope(pic) : { at: null, opts: [], body: pic };
    if (!u) return null;
    // its lines indented by two spaces, as the block keeps its code
    const lines = u.body.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n'), ind = least(lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l))![0].length));
    const src = `\\begin{tikzpicture}${u.opts.length ? `[${u.opts.join(', ')}]` : ''}\n${lines.map((l) => (l.trim() ? '  ' + l.slice(isFinite(ind) ? ind : 0) : '')).join('\n')}\n\\end{tikzpicture}`;
    const M = TD.fsm.parse(src);
    if (!M.states.length || M.warnings.length || [...M.pre, ...M.post].some((x: string) => !/^\\tikzset\b/.test(x))) return null;
    if (!M.states.every((st: any) => st.o.some((o: string) => /^state\b/.test(o)))) return null;
    const q: any = { ...TD.TYPES.automata.create({ x: 0, y: 0 }), src, id: uid8() };
    if (u.at) { const b = TD.fsm.layout(q).bb; q.x = u.at[0] * TD.PX_PER_CM + b.x; q.y = -u.at[1] * TD.PX_PER_CM + b.y; }
    return q;
  }
  // packages a picture's code may need (others in a preamble are the document's own)
  const DRAW_PKGS = new Set(['tikz', 'pgfplots', 'tikz-cd', 'circuitikz', 'quantikz', 'tikz-feynman', 'forest', 'chemfig', 'tikz-timing', 'karnaugh-map', 'bytefield', 'pgf-umlcd', 'pgf-umlsd', 'blochsphere',
    'zx-calculus', 'tikz-3dplot', 'tkz-euclide', 'pgfornament', 'xy', 'siunitx', 'bm', 'mathtools', 'physics', 'tikzpeople', 'pgf-pie', 'smartdiagram', 'tikz-qtree', 'tikz-network', 'pgfgantt', 'bodegraph', 'pst-circ',
    'amsmath', 'amssymb', 'amsfonts', 'mathrsfs', 'stmaryrd', 'upgreek', 'esint', 'dsfont', 'bbm']);
  // the preamble's definitions go with each picture, as a code object that exports them to the preamble
  function withDefs(shapes: any, defs: any, C: any) {
    // Definitions are source metadata when the whole figure is native, not drawing objects.
    // Each source-statement leader owns its dependencies; partial statements regenerate from primitives.
    if (defs && shapes.length && shapes.every((s: any) => s.type !== 'tikz')) {
      for (const x of shapes) if (!x.tex || x.tex.i === 0)
        x.tex = { ...x.tex, preamble:defs, libs:C.libs?.slice() || [], pkgs:C.pkgs?.slice() || [] };
      return shapes;
    }
    if (!defs) {
      for (const x of shapes) if (C.libs?.length || C.pkgs?.length)
        x.tex = { ...x.tex, libs: C.libs?.slice() || [], pkgs: C.pkgs?.slice() || [] };
      return shapes;
    }
    const tl = shapes.length ? TD.bboxOf(shapes.flatMap((x: any) => { const b = TD.bbox(x); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0) : { x: 0, y: 0 };
    return [{ type: 'tikz', kind: 'defs', pre: true, code: defs || '', x: 0, y: 0, at: { x: tl.x, y: tl.y - 26 }, ctx: [], prev: [], issues: [], ...(C.libs ? { libs: C.libs.slice() } : {}), ...(C.pkgs ? { pkgs: C.pkgs.slice() } : {}), id: uid8() }, ...shapes];
  }
  TD.importInternals = { parseOpts, arrowSpec, len, tokenizePath, preview, blankComments };
  // a TikZ colour (red, blue!20, red!30!black) → '#rrggbb', or null / undefined (none / unknown)
  let colorCtx: any = null;
  TD.svgColor = svgName;
  TD.tikzColor = (spec: any) => color(colorCtx || (colorCtx = makeCtx()), spec);
})();
