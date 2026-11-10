// Import from LaTeX / TikZ: parses the common TikZ subset (and everything DiagramTeX exports)
// into shapes; a full document is split into text and diagram blocks.
(function () {
  const TD = window.TD;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;

  const NAMED = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff',
    yellow: '#ffff00', gray: '#808080', grey: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', brown: '#bf8040', lime: '#bfff00',
    olive: '#808000', orange: '#ff8000', pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
  };
  const TIP_NAMES = { stealth: 'stealth', latex: 'latex', to: 'to', '>': 'to', bar: 'bar', '|': 'bar', circle: 'circle', 'circle[open]': 'ocircle', o: 'ocircle', '<': 'to' };
  // exact arrows.meta specs written by the exporter (TD.TIKZ_TIP), compared without spaces
  const TIP_EXACT = () => Object.fromEntries(Object.entries(TD.TIKZ_TIP || {}).map(([k, v]) => [v.toLowerCase().replace(/\s+/g, ''), k]));

  // ---------- small helpers ----------
  const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  function splitTop(s, sep) { // split at depth-0 separators (braces / brackets / parens)
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
  function matchClose(s, i, open, close) { // index of the bracket closing the one at s[i]
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === open) d++;
      else if (s[j] === close) { d--; if (d === 0) return j; }
    }
    return -1;
  }
  function stripComments(src) {
    return src.split('\n').map((l) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i); } return l; }).join('\n');
  }
  // length with unit -> px (default unit: cm for coordinates, pt for widths)
  function len(v, defUnit = 'cm') {
    const m = String(v).trim().match(/^([-+]?[\d.]*\d(?:e[-+]?\d+)?|[-+]?\.\d+)\s*(cm|mm|pt|in|em|ex|bp)?$/i);
    if (!m) { const e = TD.evalNumber ? TD.evalNumber(v, NaN) : NaN; return isFinite(e) ? (defUnit === 'pt' ? e / K : e * PX) : NaN; }
    const n = parseFloat(m[1]), u = (m[2] || defUnit).toLowerCase();
    return { cm: n * PX, mm: n * PX / 10, pt: n / K, bp: n * 1.00375 / K, in: n * 2.54 * PX, em: n * 10 / K, ex: n * 4.3 / K }[u];
  }

  function makeCtx() {
    return { colors: { ...NAMED }, names: {}, sx: PX, sy: PX, warnings: [] };
  }
  function color(C, spec) {
    if (!spec) return null;
    spec = spec.trim();
    if (spec === 'none') return null;
    // mixes: red!50, red!30!blue, red!50!black
    const parts = spec.split('!').map((x) => x.trim());
    const base = (n) => C.colors[n] || C.colors[n.toLowerCase()] || null;
    let c = base(parts[0]);
    if (!c) return undefined;
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
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
  function parseOpts(str) {
    if (!str) return [];
    return splitTop(str, ',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const eq = splitTop(x, '=');
      if (eq.length > 1) return { k: eq[0].trim(), v: eq.slice(1).join('=').trim().replace(/^\{([\s\S]*)\}$/, '$1') };
      return { k: x, v: null };
    });
  }
  function arrowSpec(spec) { // "->", "{Stealth}-{Latex[open]}", "<->", "-latex", "|->"
    const m = spec.match(/^(.*?)-(?!.*-)(.*)$/);
    if (!m) return null;
    const one = (t) => {
      t = t.trim().replace(/^\{|\}$/g, '').trim();
      if (!t) return 'none';
      const ex = TIP_EXACT()[t.toLowerCase().replace(/\s+/g, '')];
      if (ex) return ex;
      t = t.replace(/\[.*\]/, (x) => (/open/.test(x) ? '[open]' : ''));
      const k = t.toLowerCase().replace(/\s+/g, '');
      if (k.includes('hook')) return 'to';
      if (k === '>>' || k === '<<') return 'to';
      return TIP_NAMES[k] || (k.length ? 'stealth' : 'none');
    };
    return { start: one(m[1]), end: one(m[2]) };
  }
  // style from options
  function style(C, opts, cmd) {
    const st = { stroke: cmd === 'fill' || cmd === 'shade' || cmd === 'path' ? null : '#000000', fill: cmd === 'fill' || cmd === 'filldraw' ? '#000000' : null, width: 0.4 / K, dash: 'solid', opacity: 1, startTip: 'none', endTip: 'none' };
    let strokeOpacity = 1, fillOpacity = 1, colorAll = null;
    const W = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
    for (const { k, v } of opts) {
      if (v === null) {
        if (W[k] != null) st.width = W[k] / K;
        else if (k === 'dashed' || k === 'densely dashed' || k === 'loosely dashed') st.dash = 'dashed';
        else if (k === 'dotted' || k === 'densely dotted' || k === 'loosely dotted') st.dash = 'dotted';
        else if (k === 'dash dot' || k === 'dashdotted') st.dash = 'dashdot';
        else if (k.includes('-') && arrowSpec(k)) { const a = arrowSpec(k); st.startTip = a.start; st.endTip = a.end; }
        else { const c = color(C, k); if (c !== undefined) colorAll = c; }
        continue;
      }
      switch (k) {
        case 'draw': st.stroke = color(C, v) ?? (v === 'none' ? null : st.stroke || '#000000'); if (v !== 'none' && st.stroke == null) st.stroke = '#000000'; break;
        case 'fill': st.fill = color(C, v) ?? null; break;
        case 'color': colorAll = color(C, v) ?? null; break;
        case 'line width': st.width = len(v, 'pt'); break;
        case 'opacity': st.opacity = parseFloat(v); break;
        case 'draw opacity': strokeOpacity = parseFloat(v); break;
        case 'fill opacity': fillOpacity = parseFloat(v); break;
        case 'rounded corners': st.radius = len(v, 'pt'); break;
        case 'ball color': st.ballColor = color(C, v); break;
        case 'text': st.color = color(C, v); break;
        case 'font': st.font = v; break;
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
        case 'bend left': st.bend = parseFloat(v) || 30; break;
        case 'bend right': st.bend = -(parseFloat(v) || 30); break;
        case 'above': case 'below': case 'left': case 'right': st.place = k; break;
        default: break;
      }
    }
    for (const { k } of opts) if (['above', 'below', 'left', 'right', 'above left', 'above right', 'below left', 'below right', 'auto', 'swap', "'", 'sloped', 'midway', 'near start', 'near end', 'decorate', 'bend left', 'bend right'].includes(k)) st[k] = true;
    if (opts.some((o) => o.k === 'bend left' && o.v === null)) st.bend = 30;
    if (opts.some((o) => o.k === 'bend right' && o.v === null)) st.bend = -30;
    if (colorAll) {
      if (cmd !== 'fill' && cmd !== 'shade' && !opts.some((o) => o.k === 'draw')) st.stroke = colorAll;
      if ((cmd === 'fill' || cmd === 'filldraw') && !opts.some((o) => o.k === 'fill')) st.fill = colorAll;
      if (!st.color) st.color = colorAll;
    }
    const withA = (c, a) => (c && a < 1 ? c + hex2(a * 255) : c);
    st.stroke = withA(st.stroke, strokeOpacity);
    st.fill = withA(st.fill, fillOpacity);
    return st;
  }
  function fontStyle(fontStr) {
    const o = { size: 'normalsize', font: 'default', bold: false, italic: false };
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
  function tokenizePath(C, s, warn) {
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
        const st = i + rel, e = matchClose(s, st, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(st + 1, e), rel });
        i = e + 1; continue;
      }
      if (rest[0] === '(') {
        const e = matchClose(s, i, '(', ')');
        toks.push({ t: 'coord', raw: s.slice(i + 1, e), rel: 0 });
        i = e + 1; continue;
      }
      if (rest[0] === '[') { const e = matchClose(s, i, '[', ']'); toks.push({ t: 'opts', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      if ((m = rest.match(/^(--|\.\.|\|-|-\|)/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if ((m = rest.match(/^(node|coordinate)\b\s*/))) {
        i += m[0].length;
        let opts = '', name = '';
        for (;;) {
          ws();
          if (s[i] === '[') { const e = matchClose(s, i, '[', ']'); opts += (opts ? ',' : '') + s.slice(i + 1, e); i = e + 1; continue; }
          if (s[i] === '(') { const e = matchClose(s, i, '(', ')'); name = s.slice(i + 1, e); i = e + 1; continue; }
          if (s.slice(i, i + 2) === 'at') { i += 2; ws(); const e = matchClose(s, i, '(', ')'); toks.push({ t: 'at', raw: s.slice(i + 1, e) }); i = e + 1; continue; }
          break;
        }
        let text = '';
        if (m[1] === 'node' && s[i] === '{') { const e = matchClose(s, i, '{', '}'); text = s.slice(i + 1, e); i = e + 1; }
        toks.push({ t: 'node', opts, text, name, coordinate: m[1] === 'coordinate' });
        continue;
      }
      if ((m = rest.match(/^(controls|and|rectangle|circle|ellipse|arc|cycle|to|grid|edge|let|in|plot|sin|cos|parabola)\b/))) { toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      if (rest[0] === '{') { const e = matchClose(s, i, '{', '}'); toks.push({ t: 'brace', v: s.slice(i + 1, e) }); i = e + 1; continue; }
      warn && warn(`Unknown path text “${rest.slice(0, 12)}”`);
      i++;
    }
    return toks;
  }
  function coord(C, raw, cur) {
    raw = raw.trim();
    let m;
    if ((m = raw.match(/^([^,:]+):([^,:]+)$/))) { // polar
      const a = (TD.evalNumber(m[1], 0) * Math.PI) / 180, r = len(m[2]);
      return { x: Math.cos(a) * r, y: -Math.sin(a) * r };
    }
    if ((m = raw.match(/^\$(.*)\$$/))) { // calc: ($(a)!0.5!(b)$) or ($(a)+(1,0)$) — midpoints only
      const mm = m[1].match(/^\(([^)]*)\)!([\d.]+)!\(([^)]*)\)$/);
      if (mm) { const a = coord(C, mm[1]), b = coord(C, mm[3]), t = parseFloat(mm[2]); if (a && b) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
      return null;
    }
    const parts = splitTop(raw, ',');
    if (parts.length === 2) {
      const x = len(parts[0]), y = len(parts[1]);
      if (isFinite(x) && isFinite(y)) return { x: x * (C.sx / PX), y: -y * (C.sy / PX) };
    }
    if (parts.length === 3) return null; // 3d
    const nm = raw.replace(/\.(north|south|east|west|center|north east|north west|south east|south west|base|mid|\d+)$/, '').trim();
    if (C.names[nm]) return { ...C.names[nm], node: nm };
    return null;
  }

  // ---------- shapes from a path command ----------
  function pathToShapes(C, cmd, optStr, body) {
    const opts = parseOpts(optStr);
    const st = style(C, opts, cmd);
    const toks = tokenizePath(C, body, (w) => C.warnings.push(w));
    const out = [];
    const L = { label: '', labelPos: 0.5, labelSide: 'left', size: 'normalsize', font: 'default', bold: false, italic: false, color: '#000000' };
    const lineStyle = { stroke: st.stroke, width: st.width, dash: st.dash, opacity: st.opacity };
    // Walk the path building "subpaths" of segments.
    let cur = null, start = null;
    let segs = []; // {k:'L'|'C', pts:[...], label}
    let closed = false;
    const flush = () => {
      if (!segs.length) return;
      emitSegs(segs, closed);
      segs = []; closed = false;
    };
    const emitSegs = (sg, cl) => {
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
            out.push({ type: 'spring', x1: a.x, y1: a.y, x2: b.x, y2: b.y, coils: Math.max(1, Math.round((Lp - 2 * (pre || 0)) / (seg ? len(seg) : 10))), amplitude: amp ? len(amp) : 6, ...lineStyle, stroke: st.stroke || '#000000', dash: 'solid' });
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
        } else if (g.k === 'A') { if (!pts.length) pts.push(g.pts[0]); pts.push(...g.pts.slice(1)); }
      }
      if (pts.length < 2) return;
      if (cl && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.01) pts.pop();
      out.push({ type: 'poly', pts: pts.map((p) => [p.x, p.y]), closed: cl, ...lineStyle, fill: cl ? st.fill : null, startTip: cl ? 'none' : tipStart, endTip: cl ? 'none' : tipEnd });
    };
    const resolve = (tk) => {
      const p = coord(C, tk.raw, cur);
      if (!p) { C.warnings.push(`Unsupported coordinate (${tk.raw})`); return null; }
      if (tk.rel && cur) return { x: cur.x + p.x, y: cur.y + p.y };
      return p;
    };
    let pendingOp = null, ctrl = [], lastSegLabel = null;
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
            let a1, a2, r;
            if (nx && nx.t === 'opts') { const so = style(C, parseOpts(nx.v), cmd); a1 = so.a1; a2 = so.a2 ?? (so.da != null ? a1 + so.da : undefined); r = so.r ?? so.rx; i++; }
            else if (nx && nx.t === 'coord') { const q = nx.raw.split(':'); a1 = parseFloat(q[0]); a2 = parseFloat(q[1]); r = len(q[2]); i++; }
            if (![a1, a2, r].every(isFinite) || !cur) { C.warnings.push('arc not understood'); break; }
            const c = { x: cur.x - r * Math.cos((a1 * Math.PI) / 180), y: cur.y + r * Math.sin((a1 * Math.PI) / 180) };
            const end = { x: c.x + r * Math.cos((a2 * Math.PI) / 180), y: c.y - r * Math.sin((a2 * Math.PI) / 180) };
            const simple = !segs.length && !(toks.slice(i + 1).some((t) => t.t === 'op' && t.v !== 'node'));
            if (simple && !st.fill) {
              let A1 = a1, A2 = a2;
              if (A2 < A1) [A1, A2] = [A2, A1];
              out.push({ type: 'arc', cx: c.x, cy: c.y, r, a1: A1, a2: A2, ...lineStyle, stroke: st.stroke || '#000000', startTip: a2 < a1 ? st.endTip : st.startTip, endTip: a2 < a1 ? st.startTip : st.endTip });
            } else {
              const n = Math.max(4, Math.ceil(Math.abs(a2 - a1) / 6)), pts = [cur];
              for (let k = 1; k <= n; k++) { const a = ((a1 + ((a2 - a1) * k) / n) * Math.PI) / 180; pts.push({ x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) }); }
              segs.push({ k: 'A', pts });
            }
            cur = end;
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
        const lab = { label: tk.text, labelSide: no.some((o) => o.k === 'swap' || o.k === "'") ? 'right' : no.some((o) => o.k === 'fill') ? 'on' : 'left', labelPos: isFinite(ns.pos) ? ns.pos : no.some((o) => o.k === 'near start') ? 0.25 : no.some((o) => o.k === 'near end') ? 0.75 : 0.5, ...fs, color: ns.color || '#000000' };
        if (pendingOp === '--' || pendingOp === 'to') { lastSegLabel = lab; continue; }
        const along = no.some((o) => ['midway', 'near start', 'near end', 'pos', 'sloped', 'auto', 'swap'].includes(o.k));
        if (along && segs.length && segs[segs.length - 1].k === 'L' && segs.length === 1) { segs[0].label = lab; continue; }
        // node at the current point (e.g. after a coordinate): emit as a text shape
        if (cur && tk.text.trim()) out.push(textShape(C, tk.text, no, cur));
        if (tk.name && cur) C.names[tk.name] = { ...cur };
        continue;
      }
    }
    flush();
    if (st.bend) for (const s of out) if (s.type === 'line') {
      // `to[bend]` handled above for single segments; nothing else to do
    }
    return out;
  }

  function textShape(C, text, opts, P) {
    const st = style(C, opts, 'node');
    const fs = fontStyle(st.font);
    text = text.replace(/\$\s*\\displaystyle\b\s*([^$]*)\$/g, (m, x) => `$$${x.trim()}$$`);
    const s = { type: 'text', x: P.x, y: P.y, text: text.replace(/\s*\\\\\s*/g, '\n').trim(), ...fs, color: st.color || '#000000', opacity: st.opacity ?? 1 };
    // placement keys: shift by half the box + inner sep
    const keys = opts.map((o) => o.k);
    const b = TD.textBox(s.text || ' ', s);
    const sh = 3.33 / K;
    const pl = keys.find((k) => /^(above|below|left|right)( (left|right))?$/.test(k)) || '';
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
  function readXf(C, list) {
    const xf = [], rest = [];
    for (const { k, v } of list) {
      if (k === 'shift' && v) { const c = coord(C, String(v).trim().replace(/^\{|\}$/g, '').trim().replace(/^\(|\)$/g, '')); if (c) xf.push({ dx: c.x, dy: c.y }); }
      else if (k === 'xshift' && v) { const d = len(v); if (isFinite(d)) xf.push({ dx: d, dy: 0 }); }
      else if (k === 'yshift' && v) { const d = len(v); if (isFinite(d)) xf.push({ dx: 0, dy: -d }); }
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
  function applyXf(shapes, lists) {
    for (const s of shapes) {
      for (const L of lists) {
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
  function evenOdd(shapes) {
    const parts = shapes.filter((s) => TD.canCombine && TD.canCombine(s));
    if (parts.length < 2) return shapes;
    const res = TD.combineGeom(parts, 'exclude');
    if (!res || !res.length) return shapes;
    const region = { type: 'region', rings: res[0].rings, ...TD.regionStyle(parts[0]) };
    return [region, ...shapes.filter((s) => !parts.includes(s))];
  }

  function parseStatements(C, src) {
    const shapes = [];
    let i = 0;
    const s = src;
    while (i < s.length) {
      const bs = s.indexOf('\\', i);
      if (bs < 0) break;
      const m = s.slice(bs).match(/^\\([a-zA-Z]+)\*?/);
      if (!m) { i = bs + 2; continue; }
      const name = m[1];
      let j = bs + m[0].length;
      if (name === 'definecolor') {
        const args = [];
        for (let k = 0; k < 3; k++) { while (/\s/.test(s[j])) j++; const e = matchClose(s, j, '{', '}'); args.push(s.slice(j + 1, e)); j = e + 1; }
        const [nm, model, val] = args;
        if (/^html$/i.test(model)) C.colors[nm] = '#' + val.trim().toLowerCase();
        else if (model === 'rgb') C.colors[nm] = '#' + val.split(',').map((v) => hex2(parseFloat(v) * 255)).join('');
        else if (model === 'RGB') C.colors[nm] = '#' + val.split(',').map((v) => hex2(parseFloat(v))).join('');
        else if (model === 'gray') C.colors[nm] = '#' + hex2(parseFloat(val) * 255).repeat(3);
        i = j; continue;
      }
      if (name === 'tddata') { const e = matchClose(s, j, '{', '}'); i = e + 1; continue; }
      if (name === 'colorlet') {
        const a = []; for (let k = 0; k < 2; k++) { while (/\s/.test(s[j])) j++; const e = matchClose(s, j, '{', '}'); a.push(s.slice(j + 1, e)); j = e + 1; }
        const c = color(C, a[1]); if (c) C.colors[a[0]] = c;
        i = j; continue;
      }
      if (name === 'begin' || name === 'end') {
        const e = s.indexOf('}', j);
        const env = s.slice(j + 1, e).trim();
        if (name === 'begin' && /^(axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|tikzcd)$/.test(env)) {
          const endIdx = s.indexOf(`\\end{${env}}`, e);
          C.warnings.push(`\\begin{${env}} … \\end{${env}} is not imported`);
          i = endIdx < 0 ? s.length : endIdx + env.length + 6; continue;
        }
        if (name === 'begin' && env === 'scope') {
          i = e + 1; while (/\s/.test(s[i])) i++;
          let L = { xf: [], shape: false };
          if (s[i] === '[') {
            const e2 = matchClose(s, i, '[', ']');
            const { xf, rest } = readXf(C, parseOpts(s.slice(i + 1, e2)));
            const shape = rest.some((o) => o.k === 'transform shape');
            const other = rest.filter((o) => o.k !== 'transform shape');
            if (other.length) C.warnings.push('scope options ignored: ' + other.map((o) => o.k).join(', '));
            L = { xf, shape };
            i = e2 + 1;
          }
          (C.scopes = C.scopes || []).unshift(L);
          continue;
        }
        if (name === 'end' && env === 'scope') { if (C.scopes && C.scopes.length) C.scopes.shift(); i = e + 1; continue; }
        i = e + 1; continue;
      }
      // find end of statement: first ';' at depth 0
      let d = 0, k = j;
      for (; k < s.length; k++) {
        const c = s[k];
        if (c === '\\') { k++; continue; }
        if (c === '{' || c === '[' || c === '(') d++;
        else if (c === '}' || c === ']' || c === ')') d--;
        else if (c === ';' && d <= 0) break;
      }
      const stmt = s.slice(j, k);
      i = k + 1;
      const PATHS = { draw: 'draw', fill: 'fill', filldraw: 'filldraw', path: 'path', shade: 'shade', shadedraw: 'shade', clip: null, useasboundingbox: null };
      if (name in PATHS) {
        if (!PATHS[name]) continue;
        let body = stmt.trim(), optStr = '';
        if (body[0] === '[') { const e = matchClose(body, 0, '[', ']'); optStr = body.slice(1, e); body = body.slice(e + 1); }
        try {
          let made = pathToShapes(C, PATHS[name], optStr, body);
          const po = parseOpts(optStr);
          if (po.some((o) => o.k === 'even odd rule')) made = evenOdd(made);
          const own = readXf(C, po);
          shapes.push(...applyXf(made, [{ xf: own.xf, shape: true }, ...(C.scopes || [])]));
        } catch (err) { C.warnings.push(`\\${name}: ${err.message}`); }
        continue;
      }
      if (name === 'node' || name === 'coordinate') {
        const toks = tokenizePath(C, (name === 'coordinate' ? 'coordinate ' : 'node ') + stmt.trim());
        let at = null, node = null;
        for (const t of toks) {
          if (t.t === 'at') at = coord(C, t.raw);
          if (t.t === 'node') node = t;
          if (t.t === 'coord' && !at) at = coord(C, t.raw);
        }
        if (!node) continue;
        at = at || { x: 0, y: 0 };
        if (node.name) C.names[node.name] = { ...at };
        if (!node.coordinate && /\\begin\{quantikz\}/.test(node.text) && TD.TYPES.qc) {
          // a quantikz circuit in a node: one quantum circuit object, centred there
          const q = TD.TYPES.qc.create(at, {});
          q.src = (node.text.match(/\\begin\{quantikz\}[\s\S]*?\\end\{quantikz\}/) || [node.text.trim()])[0];
          const ind = Math.min(...q.src.split('\n').slice(1).filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length));
          if (ind > 0 && isFinite(ind)) q.src = q.src.split('\n').map((l, i) => (i ? l.slice(Math.min(ind, /^[ \t]*/.exec(l)[0].length)) : l)).join('\n');
          const b = TD.qcLayout(q).bb;
          q.x = at.x - b.w / 2; q.y = at.y - b.h / 2;
          shapes.push(q);
          continue;
        }
        if (!node.coordinate && /\\begin\{forest\}/.test(node.text) && TD.TYPES.forest) {
          // a forest tree in a node: one Tree object, centred there
          const q = TD.TYPES.forest.create(at, {});
          q.src = (node.text.match(/\\begin\{forest\}[\s\S]*?\\end\{forest\}/) || [node.text.trim()])[0];
          const b = TD.ftLayout(q).bb;
          q.x = at.x - b.w / 2; q.y = at.y - b.h / 2;
          shapes.push(q);
          continue;
        }
        if (!node.coordinate && /\\begin\{ZX\}/.test(node.text) && TD.TYPES.zx) {
          // a ZX diagram in a node: one ZX object, centred there
          const q = TD.TYPES.zx.create(at, {});
          q.src = (node.text.match(/\\begin\{ZX\}[\s\S]*?\\end\{ZX\}/) || [node.text.trim()])[0];
          const b = TD.zxLayout(q).bb;
          q.x = at.x - b.w / 2; q.y = at.y - b.h / 2;
          shapes.push(q);
          continue;
        }
        if (!node.coordinate && node.text.trim()) {
          const no = parseOpts(node.opts), own = readXf(C, no), t = textShape(C, node.text, no, at);
          // a node's own rotate turns it about its own position
          const xf = own.xf.map((x) => (x.rot !== undefined && !x.px && !x.py ? { ...x, px: t.x, py: t.y } : x));
          shapes.push(...applyXf([t], [{ xf, shape: true }, ...(C.scopes || [])]));
        }
        continue;
      }
      if (/^(tddata|usetikzlibrary|usepackage|tikzset|pgfplotsset|documentclass|centering|small|footnotesize|large|Large|scriptsize|tiny|normalsize|caption|label|par|noindent|vspace|hspace)$/.test(name)) continue;
      C.warnings.push(`\\${name} not supported`);
    }
    return shapes;
  }
  function pictureOpts(C, o) {
    for (const { k, v } of parseOpts(o)) {
      if (k === 'x' && v) C.sx = len(v);
      else if (k === 'y' && v) C.sy = len(v);
      else if (k === 'scale' && v) { C.sx = PX * parseFloat(v); C.sy = PX * parseFloat(v); }
    }
  }
  function importPicture(C, inner, opts) {
    C.sx = PX; C.sy = PX; C.scopes = [];
    if (opts) pictureOpts(C, opts);
    const shapes = parseStatements(C, inner);
    return shapes.map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10) }));
  }

  // LaTeX text (between pictures) -> DiagramTeX text block (simple markdown-ish)
  function latexToText(t) {
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
      .replace(/\\\[([\s\S]*?)\\\]/g, (m, x) => `$$${x.trim()}$$`);
    t = t.split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^(#{1,3} .*)\n\n/gm, '$1\n').trim();
    // text blocks keep %, &, # literally (export escapes them again); only outside math
    return t.split('\n').map((l) => l.includes('$$') ? l : TD.segments(l).map((g) => (g.math ? `$${g.s}$` : g.s.replace(/\\([%&#])/g, '$1'))).join('')).join('\n');
  }

  function embedded(inner) {
    const m = inner.match(/\\tddata\{([A-Za-z0-9+/=]+)\}/);
    if (!m) return null;
    try {
      const shapes = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (!Array.isArray(shapes) || shapes.some((s) => !s || !TD.TYPES[s.type])) return null;
      return shapes.map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10) }));
    } catch (e) { return null; }
  }

  // Page setup from \documentclass[..pt, ..paper] and \usepackage[...]{geometry}
  function parsePage(src) {
    const dc = src.match(/\\documentclass(?:\[([^\]]*)\])?\{[^}]*\}/);
    if (!dc) return null;
    const pg = { title: /\\maketitle/.test(src) };
    const opts = [(dc[1] || ''), ((src.match(/\\usepackage\[([^\]]*)\]\{geometry\}/) || [])[1] || '')].join(',').split(',').map((x) => x.trim()).filter(Boolean);
    const len = (v) => { const m = String(v).match(/^([\d.]+)\s*(cm|mm|in|pt)?$/); if (!m) return null; return +m[1] * ({ cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72.27 }[m[2] || 'cm']); };
    for (const o of opts) {
      const fm = o.match(/^(10|11|12)pt$/); if (fm) pg.font = +fm[1];
      const pm = Object.entries(TD.PAPERS).find(([, v]) => v.opt === o); if (pm) pg.paper = pm[0];
      if (o === 'landscape') pg.orient = 'landscape';
      const kv = o.match(/^(\w+)\s*=\s*(.+)$/);
      if (kv) {
        const v = len(kv[2]);
        if (v == null) continue;
        const k = kv[1];
        if (k === 'margin') Object.assign(pg, { mt: v, mb: v, ml: v, mr: v });
        if (k === 'hmargin') Object.assign(pg, { ml: v, mr: v });
        if (k === 'vmargin') Object.assign(pg, { mt: v, mb: v });
        const map = { top: 'mt', bottom: 'mb', left: 'ml', right: 'mr', inner: 'ml', outer: 'mr', paperwidth: 'w', paperheight: 'h' };
        if (map[k]) pg[map[k]] = v;
      }
    }
    if (pg.w && pg.h && !pg.paper) pg.paper = 'custom';
    return pg;
  }

  TD.importLatex = function (src) {
    const C = makeCtx();
    // DiagramTeX's own exports carry the exact shapes in a comment: keep it through comment stripping
    src = src.replace(/%\s*(?:diagramtex|texdiagram)-data:\s*([A-Za-z0-9+/=]+)/g, '\\tddata{$1}');
    src = stripComments(src);
    let title = null;
    const tm = src.match(/\\title\{([^}]*)\}/);
    if (tm) title = tm[1];
    const page = parsePage(src);
    // pictures wrapped in \resizebox{..}{..}{ ... } (wide diagrams in our exports)
    src = src.replace(/\\resizebox\{[^}]*\}\{[^}]*\}\{%?\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, '$1');
    // global colour definitions (preamble)
    const docM = src.match(/\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/);
    if (docM) { parseStatements(C, src.slice(0, docM.index).replace(/\\documentclass[^\n]*|\\usepackage[^\n]*|\\usetikzlibrary\{[^}]*\}|\\title\{[^}]*\}|\\author\{[^}]*\}|\\date\{[^}]*\}/g, '')); C.warnings = []; }
    // a bare quantikz, forest or ZX environment becomes a picture holding one circuit, tree or ZX diagram
    const body = (docM ? docM[1] : src).replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}|(\\begin\{quantikz\}[\s\S]*?\\end\{quantikz\}|\\begin\{forest\}[\s\S]*?\\end\{forest\}|\\begin\{ZX\}[\s\S]*?\\end\{ZX\})/g,
      (m, q) => (q ? `\\begin{tikzpicture}\\node at (0,0) {${q}};\\end{tikzpicture}` : m));
    const blocks = [];
    const re = /\\begin\{tikzpicture\}(\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])?([\s\S]*?)\\end\{tikzpicture\}/g;
    let last = 0, m;
    let any = false;
    while ((m = re.exec(body))) {
      any = true;
      const before = latexToText(body.slice(last, m.index));
      if (before && docM) blocks.push({ type: 'text', text: before });
      blocks.push({ type: 'diagram', shapes: embedded(m[2]) || importPicture(C, m[2], m[1] ? m[1].slice(1, -1) : '') });
      last = re.lastIndex;
    }
    if (!any) {
      if (/\\(draw|fill|filldraw|node|shade|path|coordinate)\b/.test(body)) blocks.push({ type: 'diagram', shapes: importPicture(C, body, '') });
      else if (body.trim()) blocks.push({ type: 'text', text: latexToText(body) });
    } else {
      const after = latexToText(body.slice(last));
      if (after && docM) blocks.push({ type: 'text', text: after });
    }
    return { blocks, warnings: [...new Set(C.warnings)], title, page };
  };
  TD.importInternals = { parseOpts, arrowSpec, len, tokenizePath };
  // a TikZ colour (red, blue!20, red!30!black) → '#rrggbb', or null / undefined (none / unknown)
  let colorCtx = null;
  TD.tikzColor = (spec) => color(colorCtx || (colorCtx = makeCtx()), spec);
})();
