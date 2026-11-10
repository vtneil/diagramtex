// Plots (2D + 3D, exported as pgfplots) and pie charts (exported as plain TikZ).
(function () {
  const TD = window.TD;
  const T = TD.TYPES;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;
  const f = TD.fmt;
  const f4 = (n) => { const v = Math.round(n * 10000) / 10000; return Object.is(v, -0) ? '0' : String(v); };

  // =====================================================================
  // Expression parser: pgfmath-compatible subset, compiled to JS and re-emitted as
  // fully parenthesised pgfmath (trig in radians via deg()/rad()).
  // =====================================================================
  const FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1, exp: 1, ln: 1, log10: 1, log2: 1,
    sqrt: 1, abs: 1, floor: 1, ceil: 1, round: 1, sign: 1, min: 2, max: 2, pow: 2, mod: 2,
  };
  const JSF = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2,
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => a % b,
  };
  function tokenize(src) {
    const out = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/^(),]))/y;
    let i = 0;
    src = String(src);
    while (i < src.length) {
      if (/^\s*$/.test(src.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) throw new Error(`Unexpected “${src.slice(i).trim()[0]}”`);
      i = re.lastIndex;
      if (m[1]) out.push({ t: 'num', v: parseFloat(m[1]) });
      else if (m[2]) out.push({ t: 'id', v: m[2] });
      else out.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] });
    }
    return out;
  }
  function parseExpr(src, vars) {
    const tk = tokenize(src);
    let p = 0;
    const peek = () => tk[p], next = () => tk[p++];
    const isOp = (v) => tk[p] && tk[p].t === 'op' && tk[p].v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error(`Expected “${v}”`); p++; };
    function expr() {
      let a = term();
      while (isOp('+') || isOp('-')) { const op = next().v; a = { t: 'bin', op, a, b: term() }; }
      return a;
    }
    function term() {
      let a = unary();
      while (isOp('*') || isOp('/')) { const op = next().v; a = { t: 'bin', op, a, b: unary() }; }
      return a;
    }
    function unary() {
      if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return power();
    }
    function power() {
      const a = atom();
      if (isOp('^')) { p++; return { t: 'bin', op: '^', a, b: unary() }; }
      return a;
    }
    function atom() {
      const k = next();
      if (!k) throw new Error('Unexpected end of expression');
      if (k.t === 'num') return { t: 'num', v: k.v };
      if (k.t === 'op' && k.v === '(') { const e = expr(); expect(')'); return e; }
      if (k.t === 'id') {
        if (FUNCS[k.v]) {
          expect('(');
          const args = [expr()];
          while (isOp(',')) { p++; args.push(expr()); }
          expect(')');
          if (args.length !== FUNCS[k.v]) throw new Error(`${k.v}() takes ${FUNCS[k.v]} argument(s)`);
          return { t: 'call', f: k.v, args };
        }
        if (k.v === 'pi' || k.v === 'e') return { t: 'const', v: k.v };
        if (vars.includes(k.v)) return { t: 'var', v: k.v };
        throw new Error(`Unknown name “${k.v}” (use ${vars.join(', ') || 'numbers'}, pi, e, sin, cos, exp, ln, sqrt, …)`);
      }
      throw new Error(`Unexpected “${k.v}”`);
    }
    const ast = expr();
    if (p < tk.length) throw new Error(`Unexpected “${tk[p].v}”`);
    return ast;
  }
  function compile(ast) {
    switch (ast.t) {
      case 'num': return () => ast.v;
      case 'const': { const v = ast.v === 'pi' ? Math.PI : Math.E; return () => v; }
      case 'var': return ast.v === 'x' ? (x) => x : (x, y) => y;
      case 'neg': { const a = compile(ast.a); return (x, y) => -a(x, y); }
      case 'call': { const fn = JSF[ast.f], as = ast.args.map(compile); return as.length === 1 ? (x, y) => fn(as[0](x, y)) : (x, y) => fn(as[0](x, y), as[1](x, y)); }
      case 'bin': {
        const a = compile(ast.a), b = compile(ast.b);
        switch (ast.op) {
          case '+': return (x, y) => a(x, y) + b(x, y);
          case '-': return (x, y) => a(x, y) - b(x, y);
          case '*': return (x, y) => a(x, y) * b(x, y);
          case '/': return (x, y) => a(x, y) / b(x, y);
          case '^': return (x, y) => Math.pow(a(x, y), b(x, y));
        }
      }
    }
    throw new Error('bad expression');
  }
  function toPgf(ast) {
    switch (ast.t) {
      case 'num': return String(ast.v);
      case 'const': return ast.v;
      case 'var': return ast.v;
      case 'neg': return `(-${toPgf(ast.a)})`;
      case 'call': {
        const a = ast.args.map(toPgf);
        if (['sin', 'cos', 'tan'].includes(ast.f)) return `${ast.f}(deg(${a[0]}))`;
        if (['asin', 'acos', 'atan'].includes(ast.f)) return `rad(${ast.f}(${a[0]}))`;
        return `${ast.f}(${a.join(',')})`;
      }
      case 'bin': return ast.op === '^' ? `(${toPgf(ast.a)})^(${toPgf(ast.b)})` : `(${toPgf(ast.a)}${ast.op}${toPgf(ast.b)})`;
    }
    return '';
  }
  const exprCache = new Map();
  function getExpr(src, vars) {
    const key = vars.join(',') + '|' + src;
    if (!exprCache.has(key)) {
      try { const ast = parseExpr(src, vars); exprCache.set(key, { fn: compile(ast), pgf: toPgf(ast) }); }
      catch (e) { exprCache.set(key, { error: e.message }); }
    }
    return exprCache.get(key);
  }
  TD.getExpr = getExpr;
  const num = (src, fb) => { const e = getExpr(String(src ?? ''), []); return e.fn ? e.fn(0, 0) : fb; };
  TD.evalNumber = num;

  // =====================================================================
  // helpers
  // =====================================================================
  function niceStep(span, n) {
    const raw = span / Math.max(1, n);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function ticks(min, max, n) {
    if (!(max > min)) return [];
    const st = niceStep(max - min, n);
    const out = [];
    for (let v = Math.ceil(min / st - 1e-9) * st; v <= max + st * 1e-9; v += st) out.push(+v.toPrecision(12));
    return out;
  }
  const tickTex = (v) => `$${+v.toPrecision(6)}$`;

  const CMAPS = {
    hot: [[0, 0, 255], [255, 255, 0], [255, 165, 0], [255, 0, 0]],
    viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
    jet: [[0, 0, 128], [0, 0, 255], [0, 255, 255], [255, 255, 0], [255, 0, 0], [128, 0, 0]],
    cool: [[0, 255, 255], [255, 0, 255]],
    gray: [[0, 0, 0], [255, 255, 255]],
  };
  TD.CMAPS = CMAPS;
  function cmap(name, t) {
    const m = CMAPS[name] || CMAPS.hot;
    t = Math.max(0, Math.min(1, isFinite(t) ? t : 0)) * (m.length - 1);
    const i = Math.min(m.length - 2, Math.floor(t)), u = t - i;
    const c = m[i].map((v, k) => Math.round(v + (m[i + 1][k] - v) * u));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const cmapTikz = (name) => `colormap={tdmap}{${(CMAPS[name] || CMAPS.hot).map((c, i) => `rgb255(${i}cm)=(${c.join(',')})`).join('; ')}}`;

  function parseData(txt, cols) {
    const out = [];
    for (const line of String(txt || '').split('\n')) {
      const t = line.trim().split(/[\s,;]+/).map(Number);
      if (t.length >= cols && t.slice(0, cols).every(isFinite)) out.push(t.slice(0, cols));
    }
    return out;
  }

  const KINDS2 = [['line', 'Line  y = f(x)'], ['scatter', 'Scatter / points'], ['area', 'Area'], ['bar', 'Bar'], ['contour', 'Contour'], ['heatmap', 'Heatmap'],
    ['ineq', 'Inequality  y < f(x)'], ['between', 'Region  f(x) < y < g(x)'], ['xofy', 'x = f(y)'], ['param', 'Parametric (x(t), y(t))'], ['polar', 'Polar  r(θ)'],
    ['implicit', 'Implicit  F(x, y) = 0'], ['vectors', 'Vectors'], ['field', 'Vector field'], ['phase', 'Phase portrait']];
  // curve-like kinds sampled over one parameter; field-like kinds over an x–y box
  const CURVE_KINDS = ['ineq', 'between', 'xofy', 'param', 'polar'], BOX_KINDS = ['implicit', 'field', 'phase'];
  const KIND_DEF = {
    ineq: { expr: 'sin(x)', rel: '<', domain: ['-5', '5'], samples: 100 },
    between: { expr: 'sin(x)', expr2: 'x/3', domain: ['-3', '3'], samples: 100 },
    xofy: { expr: 'y^2/4', domain: ['-4', '4'], samples: 80 },
    param: { expr: 'cos(3*t)', expr2: 'sin(2*t)', domain: ['0', '2*pi'], samples: 200 },
    polar: { expr: '1+cos(t)', domain: ['0', '2*pi'], samples: 200 },
    implicit: { expr: 'x^2 + y^2 = 4', domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 80 },
    field: { expr: '-y', expr2: 'x', domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 11 },
    phase: { expr: 'y', expr2: '-sin(x) - 0.3*y', domain: ['-4', '4'], ydomain: ['-3', '3'], samples: 7 },
    vectors: { data: '2 1\n-1 2\n1 -2 1.5 0.5' },
    param3d: { expr: '(2 + cos(v))*cos(u)', expr2: '(2 + cos(v))*sin(u)', expr3: 'sin(v)', domain: ['0', '2*pi'], ydomain: ['0', '2*pi'], samples: 25 },
    curve3d: { expr: 'cos(t)', expr2: 'sin(t)', expr3: 't/(2*pi)', domain: ['0', '4*pi'], samples: 200 },
  };
  TD.PLOT_KIND_DEF = KIND_DEF;
  const KINDS3 = [['surface', 'Surface'], ['mesh', 'Mesh'], ['param3d', 'Parametric surface'], ['curve3d', 'Space curve'], ['scatter3d', 'Scatter 3D']];
  const PARAM3 = ['param3d', 'curve3d'];
  const GRID_KINDS = ['contour', 'heatmap', 'surface', 'mesh'];
  const usesExprOnly = (k) => GRID_KINDS.includes(k) || CURVE_KINDS.includes(k) || BOX_KINDS.includes(k) || PARAM3.includes(k);
  const usesDataOnly = (k) => k === 'scatter3d' || k === 'vectors';
  // plot variables ("a = 2, b = 0.5") are substituted into every expression and domain
  function withVars(ser, vars) {
    const defs = [];
    for (const part of String(vars || '').split(/[,;\n]+/)) {
      const m = /^\s*([A-Za-z]\w*)\s*=\s*(.+?)\s*$/.exec(part);
      if (m && !/^(x|y|t|e|pi|theta)$/.test(m[1])) defs.push([m[1], m[2]]);
    }
    if (!defs.length) return ser;
    const vals = [];
    for (const [k, v] of defs) vals.push([k, num(sub(v, vals), NaN)]);
    function sub(src, list) {
      let out = String(src ?? '');
      for (const [k, v] of list) if (isFinite(v)) out = out.replace(new RegExp(`(?<![A-Za-z_0-9])${k}(?![A-Za-z_0-9(])`, 'g'), `(${v})`);
      return out;
    }
    return { ...ser, expr: sub(ser.expr, vals), expr2: sub(ser.expr2, vals), expr3: sub(ser.expr3, vals), domain: (ser.domain || []).map((d) => sub(d, vals)), ydomain: (ser.ydomain || []).map((d) => sub(d, vals)) };
  }
  TD.plotWithVars = withVars;
  const SERIES_COLORS = ['#1e5bd6', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b', '#e377c2'];

  // Evaluate a series to concrete geometry (memoised).
  const serCache = new Map();
  function evalSeries(ser) {
    const key = JSON.stringify([ser.kind, ser.source, ser.expr, ser.expr2, ser.expr3, ser.data, ser.domain, ser.ydomain, ser.samples, ser.levels]);
    if (serCache.has(key)) return serCache.get(key);
    if (serCache.size > 200) serCache.clear();
    let r;
    try { r = evalSeriesRaw(ser); } catch (e) { r = { error: e.message }; }
    serCache.set(key, r);
    return r;
  }
  function domainOf(ser, k) {
    const d = ser[k] || ['-5', '5'];
    const a = num(d[0], NaN), b = num(d[1], NaN);
    if (!isFinite(a) || !isFinite(b) || a === b) throw new Error('Invalid domain');
    return [Math.min(a, b), Math.max(a, b)];
  }
  function evalSeriesRaw(ser) {
    const k = ser.kind;
    const N = Math.max(2, Math.min(k === 'heatmap' || k === 'contour' ? 120 : 400, Math.round(ser.samples || 25)));
    if (k === 'scatter3d') return { pts3: parseData(ser.data, 3) };
    if (k === 'vectors') { // "x y" = from the origin, "x y u v" = from (x, y)
      const vecs = [];
      for (const line of String(ser.data || '').split('\n')) {
        const t = line.trim().split(/[\s,;()]+/).filter(Boolean).map(Number);
        if (t.length >= 4 && t.slice(0, 4).every(isFinite)) vecs.push(t.slice(0, 4));
        else if (t.length >= 2 && t.slice(0, 2).every(isFinite)) vecs.push([0, 0, t[0], t[1]]);
      }
      return { vecs, arrows: true };
    }
    // rename a parameter (t, θ, y) to x so one-variable expressions compile as f(x)
    const rn = (src, from) => (from ? String(src || '').replace(new RegExp(`(?<![A-Za-z_0-9])(${from})(?![A-Za-z_0-9])`, 'g'), 'x') : String(src || ''));
    if (PARAM3.includes(k)) { // (x, y, z) of t, or of u and v (compiled with u, v renamed to x, y)
      const ren = (src) => (k === 'curve3d' ? rn(src, 't') : String(src || '').replace(/(?<![A-Za-z_0-9])([uv])(?![A-Za-z_0-9])/g, (m, c) => (c === 'u' ? 'x' : 'y')));
      const vars = k === 'curve3d' ? ['x'] : ['x', 'y'];
      const E = [ser.expr, ser.expr2, ser.expr3].map((src) => getExpr(ren(src), vars));
      const bad = E.findIndex((e) => e.error);
      if (bad >= 0) return { error: `${'xyz'[bad]}: ${E[bad].error}` };
      const [a, b] = domainOf(ser, 'domain');
      const pgf = E.map((e) => e.pgf);
      if (k === 'curve3d') {
        const n = Math.max(2, Math.min(800, Math.round(ser.samples || 200)));
        const curve3 = [];
        for (let i = 0; i < n; i++) { const t = a + ((b - a) * i) / (n - 1); curve3.push(E.map((e) => e.fn(t, 0))); }
        return { curve3, domain: [a, b], pgf3: pgf };
      }
      const [c, d] = domainOf(ser, 'ydomain');
      const n = Math.max(2, Math.min(80, Math.round(ser.samples || 25)));
      const grid3 = [];
      for (let j = 0; j < n; j++) { const v = c + ((d - c) * j) / (n - 1); const row = []; for (let i = 0; i < n; i++) { const u = a + ((b - a) * i) / (n - 1); row.push(E.map((e) => e.fn(u, v))); } grid3.push(row); }
      return { grid3, domain: [a, b], ydomain: [c, d], pgf3: pgf, samples: n };
    }
    if (CURVE_KINDS.includes(k)) {
      const [a, b] = domainOf(ser, 'domain');
      const v1 = k === 'param' || k === 'polar' ? 'theta|θ|t' : k === 'xofy' ? 'y' : null;
      const e = getExpr(rn(ser.expr, v1), ['x']);
      if (e.error) return { error: e.error };
      let e2 = null;
      if (k === 'param' || k === 'between') { e2 = getExpr(rn(ser.expr2, v1), ['x']); if (e2.error) return { error: 'Second function: ' + e2.error }; }
      const pts = [], pts2 = [];
      for (let i = 0; i < N; i++) {
        const t = a + ((b - a) * i) / (N - 1);
        if (k === 'param') pts.push([e.fn(t, 0), e2.fn(t, 0)]);
        else if (k === 'polar') { const r = e.fn(t, 0); pts.push([r * Math.cos(t), r * Math.sin(t)]); }
        else if (k === 'xofy') pts.push([e.fn(t, 0), t]);
        else { pts.push([t, e.fn(t, 0)]); if (e2) pts2.push([t, e2.fn(t, 0)]); }
      }
      return { pts, pts2: e2 && k === 'between' ? pts2 : undefined, domain: [a, b] };
    }
    if (BOX_KINDS.includes(k)) {
      const [a, b] = domainOf(ser, 'domain'), [c, d] = domainOf(ser, 'ydomain');
      const box = [a, b, c, d];
      if (k === 'implicit') {
        let src = String(ser.expr || '');
        if (src.includes('=')) { const [l, r] = src.split('='); src = `(${l}) - (${r || 0})`; }
        const e = getExpr(src, ['x', 'y']);
        if (e.error) return { error: e.error };
        const n = Math.max(8, Math.min(200, Math.round(ser.samples || 80)));
        const xs = [], ys = [], z = [];
        for (let i = 0; i < n; i++) xs.push(a + ((b - a) * i) / (n - 1));
        for (let j = 0; j < n; j++) ys.push(c + ((d - c) * j) / (n - 1));
        for (let j = 0; j < n; j++) z.push(xs.map((x) => e.fn(x, ys[j])));
        return { lines: contour(xs, ys, z, 0, 0, 1, [0]), box };
      }
      const P = getExpr(ser.expr, ['x', 'y']), Q = getExpr(ser.expr2, ['x', 'y']);
      if (P.error) return { error: P.error };
      if (Q.error) return { error: 'Second function: ' + Q.error };
      const n = Math.max(2, Math.min(40, Math.round(ser.samples || 10)));
      const cx = (b - a) / n, cy = (d - c) / n;
      if (k === 'field') { // arrows at cell centres, longest = 0.9 cell
        const raw = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const x = a + cx * (i + 0.5), y = c + cy * (j + 0.5), u = P.fn(x, y), v = Q.fn(x, y);
          if (isFinite(u) && isFinite(v)) raw.push([x, y, u, v]);
        }
        const m = Math.max(1e-12, ...raw.map((q) => Math.hypot(q[2] / cx, q[3] / cy)));
        const kf = 0.9 / m;
        return { vecs: raw.map(([x, y, u, v]) => [x - (u * kf) / 2, y - (v * kf) / 2, u * kf, v * kf]), arrows: true, box };
      }
      // phase portrait: trajectories through a grid of seeds (RK4 on the unit-speed flow, in cell units)
      const F = (x, y) => { const u = P.fn(x, y) / cx, v = Q.fn(x, y) / cy, l = Math.hypot(u, v); return l > 1e-12 && isFinite(l) ? [(u / l) * cx, (v / l) * cy] : null; };
      const h = 0.08, steps = 18, lines = [], heads = [];
      const inside = (x, y) => x >= a && x <= b && y >= c && y <= d;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x0 = a + cx * (i + 0.5), y0 = c + cy * (j + 0.5);
        const run = (dir) => {
          const out = [];
          let x = x0, y = y0;
          for (let st = 0; st < steps; st++) {
            const k1 = F(x, y); if (!k1) break;
            const k2 = F(x + (dir * h * k1[0]) / 2, y + (dir * h * k1[1]) / 2); if (!k2) break;
            const k3 = F(x + (dir * h * k2[0]) / 2, y + (dir * h * k2[1]) / 2); if (!k3) break;
            const k4 = F(x + dir * h * k3[0], y + dir * h * k3[1]); if (!k4) break;
            x += (dir * h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6; y += (dir * h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6;
            if (!inside(x, y)) break;
            out.push([x, y]);
          }
          return out;
        };
        const back = run(-1).reverse(), fwd = run(1);
        const pts = [...back, [x0, y0], ...fwd];
        if (pts.length < 2) continue;
        lines.push({ pts });
        const d0 = F(x0, y0);
        if (d0) heads.push([x0, y0, d0[0] * 1e-3, d0[1] * 1e-3]);
      }
      return { lines, vecs: heads, arrows: true, headsOnly: true, box };
    }
    const fromExpr = usesExprOnly(k) || (ser.source !== 'data' && !usesDataOnly(k));
    if (!fromExpr) return { pts: parseData(ser.data, 2).sort((a, b) => (k === 'scatter' ? 0 : a[0] - b[0])) };
    const vars = GRID_KINDS.includes(k) ? ['x', 'y'] : ['x'];
    const e = getExpr(ser.expr, vars);
    if (e.error) return { error: e.error };
    const [a, b] = domainOf(ser, 'domain');
    if (!GRID_KINDS.includes(k)) {
      const pts = [];
      for (let i = 0; i < N; i++) { const x = a + ((b - a) * i) / (N - 1); pts.push([x, e.fn(x, 0)]); }
      return { pts, domain: [a, b], pgf: e.pgf };
    }
    const [c, d] = domainOf(ser, 'ydomain');
    if (k === 'heatmap') { // cell centres
      const xs = [], ys = [], z = [];
      for (let i = 0; i < N; i++) xs.push(a + ((b - a) * (i + 0.5)) / N);
      for (let j = 0; j < N; j++) ys.push(c + ((d - c) * (j + 0.5)) / N);
      for (let j = 0; j < N; j++) z.push(xs.map((x) => e.fn(x, ys[j])));
      return { xs, ys, z, domain: [a, b], ydomain: [c, d], pgf: e.pgf, ...zRange(z) };
    }
    const xs = [], ys = [], z = [];
    for (let i = 0; i < N; i++) xs.push(a + ((b - a) * i) / (N - 1));
    for (let j = 0; j < N; j++) ys.push(c + ((d - c) * j) / (N - 1));
    for (let j = 0; j < N; j++) z.push(xs.map((x) => e.fn(x, ys[j])));
    const res = { xs, ys, z, domain: [a, b], ydomain: [c, d], pgf: e.pgf, ...zRange(z) };
    if (k === 'contour') res.lines = contour(xs, ys, z, res.zmin, res.zmax, Math.max(1, Math.round(ser.levels || 8)));
    return res;
  }
  function zRange(z) {
    let zmin = Infinity, zmax = -Infinity;
    for (const row of z) for (const v of row) if (isFinite(v)) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
    if (!isFinite(zmin)) { zmin = 0; zmax = 1; }
    return { zmin, zmax };
  }

  // Marching squares -> polylines per level.
  function contour(xs, ys, z, zmin, zmax, L, levels) {
    const out = [];
    const levs = levels || Array.from({ length: L }, (_, i) => zmin + ((zmax - zmin) * (i + 1)) / (L + 1));
    for (let l = 1; l <= levs.length; l++) {
      const lev = levs[l - 1];
      const segs = [];
      for (let j = 0; j < ys.length - 1; j++) {
        for (let i = 0; i < xs.length - 1; i++) {
          const v = [z[j][i], z[j][i + 1], z[j + 1][i + 1], z[j + 1][i]];
          const P = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]];
          const cr = [];
          for (let e = 0; e < 4; e++) {
            const a = v[e], b = v[(e + 1) % 4];
            if (!isFinite(a) || !isFinite(b)) continue;
            if ((a < lev) !== (b < lev)) {
              const t = (lev - a) / (b - a), p = P[e], q = P[(e + 1) % 4];
              cr.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
            }
          }
          if (cr.length === 2) segs.push(cr);
          else if (cr.length === 4) { segs.push([cr[0], cr[1]]); segs.push([cr[2], cr[3]]); }
        }
      }
      // chain segments into polylines
      const k = (p) => p[0].toFixed(9) + ',' + p[1].toFixed(9);
      const adj = new Map();
      segs.forEach((s, i) => { for (const p of s) { const kk = k(p); if (!adj.has(kk)) adj.set(kk, []); adj.get(kk).push(i); } });
      const used = new Array(segs.length).fill(false);
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const line = [segs[i][0], segs[i][1]];
        for (const dir of [1, 0]) {
          for (;;) {
            const end = dir ? line[line.length - 1] : line[0];
            const nb = (adj.get(k(end)) || []).find((j) => !used[j]);
            if (nb == null) break;
            used[nb] = true;
            const s = segs[nb], nxt = k(s[0]) === k(end) ? s[1] : s[0];
            if (dir) line.push(nxt); else line.unshift(nxt);
          }
        }
        out.push({ level: lev, t: l / (L + 1), pts: line });
      }
    }
    return out;
  }

  // Axis limits: user values override automatic ones.
  function limits(s) {
    const ev = s.series.map((q) => evalSeries(withVars(q, s.vars)));
    let x = [Infinity, -Infinity], y = [Infinity, -Infinity], z = [Infinity, -Infinity];
    const grow = (r, v) => { if (isFinite(v)) { r[0] = Math.min(r[0], v); r[1] = Math.max(r[1], v); } };
    let barPad = 0, barZero = false;
    s.series.forEach((ser, i) => {
      const r = ev[i];
      if (r.error) return;
      if (r.pts) {
        for (const p of r.pts) { grow(x, p[0]); grow(y, p[1]); }
        if (ser.kind === 'bar' || ser.kind === 'area') barZero = true;
        if (ser.kind === 'bar' && r.pts.length) {
          const xs = r.pts.map((p) => p[0]).sort((a, b) => a - b);
          let md = Infinity; for (let j = 1; j < xs.length; j++) if (xs[j] > xs[j - 1]) md = Math.min(md, xs[j] - xs[j - 1]);
          barPad = Math.max(barPad, isFinite(md) ? md / 2 : 0.5);
        }
      }
      if (r.pts3) for (const p of r.pts3) { grow(x, p[0]); grow(y, p[1]); grow(z, p[2]); }
      for (const p of r.curve3 || (r.grid3 ? r.grid3.flat() : [])) { grow(x, p[0]); grow(y, p[1]); grow(z, p[2]); }
      if (r.pts2) for (const p of r.pts2) { grow(x, p[0]); grow(y, p[1]); }
      if (r.vecs && !r.box) for (const v of r.vecs) { grow(x, v[0]); grow(x, v[0] + v[2]); grow(y, v[1]); grow(y, v[1] + v[3]); }
      if (r.box) { grow(x, r.box[0]); grow(x, r.box[1]); grow(y, r.box[2]); grow(y, r.box[3]); }
      if (r.xs) {
        grow(x, r.domain[0]); grow(x, r.domain[1]); grow(y, r.ydomain[0]); grow(y, r.ydomain[1]);
        grow(z, r.zmin); grow(z, r.zmax);
      }
    });
    if (barPad) { x[0] -= barPad; x[1] += barPad; }
    if (barZero) grow(y, 0);
    const fix = (r) => { if (!isFinite(r[0])) return [-1, 1]; if (r[0] === r[1]) return [r[0] - 1, r[1] + 1]; return r; };
    x = fix(x); y = fix(y); z = fix(z);
    const pick = (src, auto) => { const v = String(src ?? '').trim() === '' ? NaN : num(src, NaN); return isFinite(v) ? v : auto; };
    const L = {
      xmin: pick(s.xmin, x[0]), xmax: pick(s.xmax, x[1]), ymin: pick(s.ymin, y[0]), ymax: pick(s.ymax, y[1]),
      zmin: pick(s.zmin, z[0]), zmax: pick(s.zmax, z[1]),
    };
    for (const a of ['x', 'y', 'z']) if (!(L[a + 'max'] > L[a + 'min'])) L[a + 'max'] = L[a + 'min'] + 1;
    // colour range for heatmap/contour/surface
    let mmin = Infinity, mmax = -Infinity;
    ev.forEach((r) => { if (r.xs) { mmin = Math.min(mmin, r.zmin); mmax = Math.max(mmax, r.zmax); } });
    if (s.dim === 3) { mmin = L.zmin; mmax = L.zmax; }
    L.mmin = isFinite(mmin) ? mmin : 0; L.mmax = isFinite(mmax) && mmax > mmin ? mmax : L.mmin + 1;
    L.ev = ev;
    return L;
  }

  const MARKS = [['none', 'None'], ['*', '● filled'], ['o', '○ circle'], ['square*', '■ square'], ['square', '□ square'], ['triangle*', '▲ triangle'], ['x', '× cross'], ['+', '+ plus']];
  function markSvg(m, x, y, col, w) {
    const R = 2 / K; // 2pt
    const c = TD.css(col), fs = `stroke="${c}" stroke-width="${w}"`; // pgfplots fills and strokes the filled marks
    switch (m) {
      case '*': return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(R)}" fill="${c}" ${fs}/>`;
      case 'o': return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(R)}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
      case 'square*': return `<rect x="${r2(x - R)}" y="${r2(y - R)}" width="${r2(2 * R)}" height="${r2(2 * R)}" fill="${c}" ${fs}/>`;
      case 'square': return `<rect x="${r2(x - R)}" y="${r2(y - R)}" width="${r2(2 * R)}" height="${r2(2 * R)}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
      case 'triangle*': return `<path d="M${r2(x)},${r2(y - R)}L${r2(x + R * 0.87)},${r2(y + R / 2)}L${r2(x - R * 0.87)},${r2(y + R / 2)}Z" fill="${c}" ${fs}/>`;
      case 'x': return `<path d="M${r2(x - R)},${r2(y - R)}L${r2(x + R)},${r2(y + R)}M${r2(x - R)},${r2(y + R)}L${r2(x + R)},${r2(y - R)}" stroke="${c}" stroke-width="${w}"/>`;
      case '+': return `<path d="M${r2(x - R)},${r2(y)}L${r2(x + R)},${r2(y)}M${r2(x)},${r2(y - R)}L${r2(x)},${r2(y + R)}" stroke="${c}" stroke-width="${w}"/>`;
    }
    return '';
  }
  const dashOf = (d, w) => (d === 'dashed' ? `stroke-dasharray="${r2(3 / K)} ${r2(3 / K)}"` : d === 'dotted' ? `stroke-dasharray="${r2(w)} ${r2(2 / K)}"` : '');
  const AXIS_W = 0.4 / K; // 0.4pt
  const NORMAL = { size: 'normalsize' };

  function txt(text, cx, cy, ctx, st, anchor) {
    if (!text) return '';
    const b = TD.textBox(text, st || NORMAL);
    let x = cx, y = cy;
    if (anchor) {
      if (anchor.includes('west')) x += b.w / 2;
      if (anchor.includes('east')) x -= b.w / 2;
      if (anchor.includes('north')) y += b.h / 2;
      if (anchor.includes('south')) y -= b.h / 2;
    }
    return TD.textSvg(text, st || NORMAL, '#000000', x, y, ctx).replace(/<rect class="hitfill"[^>]*\/>/, '');
  }
  function legendSvg(s, ctx, entries) {
    if (!entries.length || s.legendPos === 'none') return '';
    const st = NORMAL;
    const rows = entries.map((e) => ({ ...e, b: TD.textBox(e.text, st) }));
    const sw = 22, pad = 5, gap = 4;
    const w = sw + gap + Math.max(...rows.map((r) => r.b.w)) + 2 * pad;
    const h = rows.reduce((a, r) => a + r.b.h, 0) + 2 * pad;
    const m = 6;
    const pos = s.legendPos || 'north east';
    let x = pos.includes('east') ? s.x + s.w - w - m : s.x + m;
    let y = pos.includes('north') ? s.y + m : s.y + s.h - h - m;
    if (pos === 'outer north east') { x = s.x + s.w + 10; y = s.y; }
    let out = `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="#fff" stroke="#000" stroke-width="${r2(AXIS_W)}"/>`;
    let cy = y + pad;
    for (const r of rows) {
      const my = cy + r.b.h / 2, c = TD.css(r.color);
      if (r.kind === 'bar' || r.kind === 'area') out += `<rect x="${r2(x + pad + 5)}" y="${r2(my - 4)}" width="12" height="8" fill="${c}" ${r.kind === 'area' ? 'fill-opacity="0.3"' : ''} stroke="${c}" stroke-width="${AXIS_W}"/>`;
      else {
        if (r.kind !== 'scatter' && r.kind !== 'scatter3d') out += `<path d="M${r2(x + pad)},${r2(my)}h${sw}" stroke="${c}" stroke-width="${r.width}" ${dashOf(r.dash, r.width)}/>`;
        out += markSvg(r.kind === 'scatter' || r.kind === 'scatter3d' ? (r.mark === 'none' ? '*' : r.mark) : r.mark, x + pad + sw / 2, my, r.color, r.width);
      }
      out += txt(r.text, x + pad + sw + gap, my, ctx, st, 'west');
      cy += r.b.h;
    }
    return out;
  }
  function colorbarSvg(s, L, ctx) {
    const x = s.x + s.w + 14, w = 0.5 * PX, n = 24; // pgfplots' colorbar is 0.5cm wide
    let out = '';
    for (let i = 0; i < n; i++) {
      const y0 = s.y + s.h - ((i + 1) * s.h) / n;
      out += `<rect x="${x}" y="${r2(y0)}" width="${w}" height="${r2(s.h / n + 0.5)}" fill="${cmap(s.colormap, (i + 0.5) / n)}"/>`;
    }
    out += `<rect x="${x}" y="${s.y}" width="${w}" height="${s.h}" fill="none" stroke="#000" stroke-width="${r2(AXIS_W)}"/>`;
    for (const v of ticks(L.mmin, L.mmax, 5)) {
      const y = s.y + s.h - ((v - L.mmin) / (L.mmax - L.mmin)) * s.h;
      out += `<path d="M${x + w},${r2(y)}h-3" stroke="#000" stroke-width="${r2(AXIS_W)}"/>` + txt(tickTex(v), x + w + 4, y, ctx, NORMAL, 'west');
    }
    return out;
  }

  // =====================================================================
  // 2D rendering
  // =====================================================================
  // arrow from (x1,y1) to (x2,y2) in px; headsOnly draws just the head pointing that way
  function arrowSvg(x1, y1, x2, y2, col, w, headsOnly) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
    if (!(l > 1e-9)) return '';
    const ux = dx / l, uy = dy / l, hl = headsOnly ? 3 + 2 * w : Math.min(l * 0.45, 3 + 2 * w), hw = hl * 0.45;
    const tip = [x2, y2], bx = x2 - ux * hl, by = y2 - uy * hl;
    const head = `<path d="M${r2(tip[0])},${r2(tip[1])}L${r2(bx - uy * hw)},${r2(by + ux * hw)}L${r2(bx + uy * hw)},${r2(by - ux * hw)}Z" fill="${col}"/>`;
    return headsOnly ? head : `<path d="M${r2(x1)},${r2(y1)}L${r2(bx)},${r2(by)}" stroke="${col}" stroke-width="${w}" fill="none"/>` + head;
  }
  function render2d(s, ctx) {
    const L = limits(s);
    const mx = (v) => s.x + ((v - L.xmin) / (L.xmax - L.xmin)) * s.w;
    const my = (v) => s.y + s.h - ((v - L.ymin) / (L.ymax - L.ymin)) * s.h;
    const xt = ticks(L.xmin, L.xmax, Math.max(2, Math.round(s.w / 70))), yt = ticks(L.ymin, L.ymax, Math.max(2, Math.round(s.h / 50)));
    const cid = 'clip-' + s.id + (ctx.export ? 'x' : '');
    let back = '', body = '', front = '', free = '';
    if (s.grid) {
      for (const v of xt) back += `<path d="M${r2(mx(v))},${s.y}v${s.h}" stroke="#bfbfbf" stroke-width="${r2(AXIS_W)}"/>`;
      for (const v of yt) back += `<path d="M${s.x},${r2(my(v))}h${s.w}" stroke="#bfbfbf" stroke-width="${r2(AXIS_W)}"/>`;
    }
    const entries = [];
    const bars = s.series.filter((q) => q.kind === 'bar');
    s.series.forEach((ser, i) => {
      const r = L.ev[i];
      if (r.error) return;
      const col = TD.css(ser.color), w = ser.width ?? 1, op = ser.opacity ?? 1;
      let g = '';
      if (ser.kind === 'heatmap') {
        const cw = s.w * ((r.domain[1] - r.domain[0]) / r.xs.length) / (L.xmax - L.xmin), ch = s.h * ((r.ydomain[1] - r.ydomain[0]) / r.ys.length) / (L.ymax - L.ymin);
        r.ys.forEach((yv, j) => r.xs.forEach((xv, k) => {
          g += `<rect x="${r2(mx(xv) - cw / 2)}" y="${r2(my(yv) - ch / 2)}" width="${r2(cw + 0.4)}" height="${r2(ch + 0.4)}" fill="${cmap(s.colormap, (r.z[j][k] - L.mmin) / (L.mmax - L.mmin))}"/>`;
        }));
      } else if (ser.kind === 'contour') {
        for (const ln of r.lines) {
          g += `<path d="${ln.pts.map((p, k) => (k ? 'L' : 'M') + r2(mx(p[0])) + ',' + r2(my(p[1]))).join('')}" fill="none" stroke="${cmap(s.colormap, (ln.level - L.mmin) / (L.mmax - L.mmin))}" stroke-width="${w}"/>`;
        }
      } else if (ser.kind === 'bar') {
        const bw = ser.barWidth || 12, bi = bars.indexOf(ser), shift = (bi - (bars.length - 1) / 2) * bw;
        const y0 = my(Math.max(L.ymin, Math.min(L.ymax, 0)));
        for (const p of r.pts) {
          const xc = mx(p[0]) + shift, yv = my(p[1]);
          g += `<rect x="${r2(xc - bw / 2)}" y="${r2(Math.min(yv, y0))}" width="${r2(bw)}" height="${r2(Math.abs(y0 - yv))}" fill="${col}" stroke="${col}" stroke-width="${AXIS_W}"/>`;
        }
      } else if (r.lines || r.vecs) { // implicit curves, vector fields, phase portraits, vectors
        for (const ln of r.lines || []) g += `<path d="${ln.pts.map((p, k) => (k ? 'L' : 'M') + r2(mx(p[0])) + ',' + r2(my(p[1]))).join('')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" ${dashOf(ser.dash, w)}/>`;
        for (const v of r.vecs || []) g += arrowSvg(mx(v[0]), my(v[1]), mx(v[0] + v[2]), my(v[1] + v[3]), col, w, r.headsOnly);
      } else if (ser.kind === 'ineq' || ser.kind === 'between') {
        const cl = (p) => [mx(p[0]), my(Math.max(L.ymin - 1e3 * (L.ymax - L.ymin), Math.min(L.ymax + 1e3 * (L.ymax - L.ymin), p[1])))];
        const A = r.pts.filter((p) => isFinite(p[1])), up = ser.rel === '>' || ser.rel === '>=';
        let poly;
        if (ser.kind === 'between') { const B = (r.pts2 || []).filter((p) => isFinite(p[1])); poly = [...A.map(cl), ...B.reverse().map(cl)]; }
        else if (A.length) { const ye = up ? L.ymax : L.ymin; poly = [[mx(A[0][0]), my(ye)], ...A.map(cl), [mx(A[A.length - 1][0]), my(ye)]]; }
        if (poly && poly.length > 2) g += `<path d="${poly.map((q, k) => (k ? 'L' : 'M') + r2(q[0]) + ',' + r2(q[1])).join('')}Z" fill="${col}" fill-opacity="${ser.fillOpacity ?? 0.25}" stroke="none"/>`;
        const strict = ser.kind === 'ineq' && (ser.rel === '<' || ser.rel === '>');
        for (const c of ser.kind === 'between' ? [r.pts, r.pts2 || []] : [r.pts]) {
          let d = '', pen = false;
          for (const p of c) { if (!isFinite(p[1]) || Math.abs(p[1]) > 1e6) { pen = false; continue; } d += (pen ? 'L' : 'M') + r2(mx(p[0])) + ',' + r2(my(p[1])); pen = true; }
          g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" ${dashOf(strict ? 'dashed' : ser.dash, w)}/>`;
        }
      } else {
        const good = r.pts.filter((p) => isFinite(p[0]) && isFinite(p[1]));
        // split at non-finite values
        let d = '', pen = false;
        for (const p of r.pts) {
          if (!isFinite(p[0]) || !isFinite(p[1]) || Math.abs(p[1]) > 1e6 || Math.abs(p[0]) > 1e6) { pen = false; continue; }
          d += (pen ? 'L' : 'M') + r2(mx(p[0])) + ',' + r2(my(p[1]));
          pen = true;
        }
        if (ser.kind === 'area' && good.length) {
          const y0 = r2(my(Math.max(L.ymin, Math.min(L.ymax, 0))));
          const a = `M${r2(mx(good[0][0]))},${y0}` + good.map((p) => 'L' + r2(mx(p[0])) + ',' + r2(my(p[1]))).join('') + `L${r2(mx(good[good.length - 1][0]))},${y0}Z`;
          g += `<path d="${a}" fill="${col}" fill-opacity="0.3"/>`;
        }
        if (ser.kind !== 'scatter') g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" ${dashOf(ser.dash, w)}/>`;
        const mk = ser.kind === 'scatter' ? (ser.mark === 'none' ? '*' : ser.mark) : ser.mark;
        // pgfplots leaves markers unclipped (clip marker paths=false): one on the axis edge is drawn whole
        const ex = (L.xmax - L.xmin) * 1e-6, ey = (L.ymax - L.ymin) * 1e-6;
        const inside = (p) => p[0] >= L.xmin - ex && p[0] <= L.xmax + ex && p[1] >= L.ymin - ey && p[1] <= L.ymax + ey;
        let fm = '';
        if (mk && mk !== 'none') for (const p of good) { const m = markSvg(mk, mx(p[0]), my(p[1]), ser.color, w); if (inside(p)) fm += m; else g += m; }
        if (fm) free += op < 1 ? `<g opacity="${op}">${fm}</g>` : fm;
      }
      body += op < 1 ? `<g opacity="${op}">${g}</g>` : g;
      if (ser.legend) entries.push({ text: ser.legend, color: ser.color, kind: ser.kind, width: w, dash: ser.dash, mark: ser.mark });
    });

    // axes
    const aw = r2(AXIS_W);
    const tk = 4;
    const lines = s.axisLines || 'box';
    let xAxisY = s.y + s.h, yAxisX = s.x;
    if (lines === 'middle') {
      xAxisY = my(Math.max(L.ymin, Math.min(L.ymax, 0)));
      yAxisX = mx(Math.max(L.xmin, Math.min(L.xmax, 0)));
    }
    if (lines === 'box') front += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#000" stroke-width="${aw}"/>`;
    else {
      const ah = TD.TYPES.line.svg({ x1: s.x, y1: xAxisY, x2: s.x + s.w, y2: xAxisY, stroke: '#000000', width: AXIS_W, dash: 'solid', startTip: 'none', endTip: 'stealth', opacity: 1 }, { export: true });
      const av = TD.TYPES.line.svg({ x1: yAxisX, y1: s.y + s.h, x2: yAxisX, y2: s.y, stroke: '#000000', width: AXIS_W, dash: 'solid', startTip: 'none', endTip: 'stealth', opacity: 1 }, { export: true });
      front += ah + av;
    }
    const skip0 = lines === 'middle';
    for (const v of xt) {
      const X = mx(v);
      if (lines === 'middle' && Math.abs(v) < 1e-12) continue;
      if (lines !== 'box' && X > s.x + s.w - 8) continue;
      front += `<path d="M${r2(X)},${r2(xAxisY)}v${lines === 'middle' ? -tk / 2 : -tk}${lines === 'middle' ? 'v' + tk : ''}" stroke="#000" stroke-width="${aw}"/>`;
      if (lines === 'box') front += `<path d="M${r2(X)},${s.y}v${tk}" stroke="#000" stroke-width="${aw}"/>`;
      if (!(skip0 && Math.abs(v) < 1e-12)) front += txt(tickTex(v), X, xAxisY + 4, ctx, NORMAL, 'north');
    }
    let maxYW = 0;
    for (const v of yt) {
      const Y = my(v);
      if (lines === 'middle' && Math.abs(v) < 1e-12) continue;
      if (lines !== 'box' && Y < s.y + 8) continue;
      front += `<path d="M${r2(yAxisX)},${r2(Y)}h${lines === 'middle' ? -tk / 2 : tk}${lines === 'middle' ? 'h' + tk : ''}" stroke="#000" stroke-width="${aw}"/>`;
      if (lines === 'box') front += `<path d="M${s.x + s.w},${r2(Y)}h${-tk}" stroke="#000" stroke-width="${aw}"/>`;
      maxYW = Math.max(maxYW, TD.textBox(tickTex(v), NORMAL).w);
      front += txt(tickTex(v), yAxisX - 4, Y, ctx, NORMAL, 'east');
    }
    if (lines === 'middle') {
      front += txt(s.xlabel, s.x + s.w + 4, xAxisY, ctx, NORMAL, 'west');
      front += txt(s.ylabel, yAxisX, s.y - 4, ctx, NORMAL, 'south');
    } else {
      const th = TD.textBox('$0$', NORMAL).h;
      front += txt(s.xlabel, s.x + s.w / 2, s.y + s.h + 4 + th + 4, ctx, NORMAL, 'north');
      if (s.ylabel) {
        const b = TD.textBox(s.ylabel, NORMAL);
        const cx = s.x - 4 - maxYW - 6 - b.h / 2, cy = s.y + s.h / 2;
        front += `<g transform="rotate(-90 ${r2(cx)} ${r2(cy)})">${txt(s.ylabel, cx, cy, ctx, NORMAL)}</g>`;
      }
    }
    front += txt(s.title, s.x + s.w / 2, s.y - 6, ctx, NORMAL, 'south');
    front += legendSvg(s, ctx, entries);
    if (s.colorbar) front += colorbarSvg(s, L, ctx);
    const errs = L.ev.map((r, i) => (r.error ? `Series ${i + 1}: ${r.error}` : '')).filter(Boolean);
    if (errs.length && !ctx.export) front += `<text x="${s.x + 6}" y="${s.y + 16}" font-size="11" fill="#c62828" font-family="sans-serif">${esc(errs[0])}</text>`;
    return `<defs><clipPath id="${cid}"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/></clipPath></defs>` +
      back + `<g clip-path="url(#${cid})">${body}</g>` + free + front;
  }

  // =====================================================================
  // 3D rendering (pgfplots view={h}{v} projection)
  // =====================================================================
  function proj3(s, L) {
    const h = ((s.view?.[0] ?? 25) * Math.PI) / 180, v = ((s.view?.[1] ?? 30) * Math.PI) / 180;
    const ex = [Math.cos(h), -Math.sin(h) * Math.sin(v)], ey = [Math.sin(h), Math.cos(h) * Math.sin(v)], ez = [0, Math.cos(v)];
    const dv = [Math.sin(h) * Math.cos(v), -Math.cos(h) * Math.cos(v), Math.sin(v)]; // towards viewer
    const raw = (u, w, t) => [u * ex[0] + w * ey[0] + t * ez[0], u * ex[1] + w * ey[1] + t * ez[1]];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const u of [0, 1]) for (const w of [0, 1]) for (const t of [0, 1]) { const p = raw(u, w, t); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const nrm = (x, y, z) => [(x - L.xmin) / (L.xmax - L.xmin), (y - L.ymin) / (L.ymax - L.ymin), (z - L.zmin) / (L.zmax - L.zmin)];
    const P = (x, y, z) => {
      const [u, w, t] = nrm(x, y, z), p = raw(u, w, t);
      return { x: s.x + ((p[0] - x0) / (x1 - x0 || 1)) * s.w, y: s.y + s.h - ((p[1] - y0) / (y1 - y0 || 1)) * s.h, d: u * dv[0] + w * dv[1] + t * dv[2] };
    };
    const Pn = (u, w, t) => P(L.xmin + u * (L.xmax - L.xmin), L.ymin + w * (L.ymax - L.ymin), L.zmin + t * (L.zmax - L.zmin));
    return { P, Pn, dv };
  }
  function render3d(s, ctx) {
    const L = limits(s);
    const { P, Pn, dv } = proj3(s, L);
    const aw = r2(AXIS_W);
    const ln = (a, b, col = '#000', w = aw) => `<path d="M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}" stroke="${col}" stroke-width="${w}"/>`;
    let back = '', body = '', front = '';
    // back faces: for each axis choose the side facing away from the viewer
    const bu = dv[0] > 0 ? 0 : 1, bw = dv[1] > 0 ? 0 : 1, bt = 0;
    const xt = ticks(L.xmin, L.xmax, 5), yt = ticks(L.ymin, L.ymax, 5), zt = ticks(L.zmin, L.zmax, 5);
    const nu = (v) => (v - L.xmin) / (L.xmax - L.xmin), nw = (v) => (v - L.ymin) / (L.ymax - L.ymin), nt = (v) => (v - L.zmin) / (L.zmax - L.zmin);
    if (s.grid) {
      const gc = '#d0d0d0';
      for (const v of xt) { back += ln(Pn(nu(v), bw, 0), Pn(nu(v), bw, 1), gc) + ln(Pn(nu(v), 0, bt), Pn(nu(v), 1, bt), gc); }
      for (const v of yt) { back += ln(Pn(bu, nw(v), 0), Pn(bu, nw(v), 1), gc) + ln(Pn(0, nw(v), bt), Pn(1, nw(v), bt), gc); }
      for (const v of zt) { back += ln(Pn(bu, 0, nt(v)), Pn(bu, 1, nt(v)), gc) + ln(Pn(0, bw, nt(v)), Pn(1, bw, nt(v)), gc); }
    }
    // back-face frame edges
    const edges = [];
    for (const w of [0, 1]) for (const t of [0, 1]) edges.push([[0, w, t], [1, w, t]]);
    for (const u of [0, 1]) for (const t of [0, 1]) edges.push([[u, 0, t], [u, 1, t]]);
    for (const u of [0, 1]) for (const w of [0, 1]) edges.push([[u, w, 0], [u, w, 1]]);
    for (const [a, b] of edges) {
      const onBack = (a[0] === bu && b[0] === bu) || (a[1] === bw && b[1] === bw) || (a[2] === bt && b[2] === bt);
      if (onBack) back += ln(Pn(...a), Pn(...b));
    }
    // series
    const items = [];
    const entries = [];
    s.series.forEach((ser, i) => {
      const r = L.ev[i];
      if (r.error) return;
      if (r.xs && (ser.kind === 'surface' || ser.kind === 'mesh')) {
        for (let j = 0; j < r.ys.length - 1; j++) {
          for (let k = 0; k < r.xs.length - 1; k++) {
            const zz = [r.z[j][k], r.z[j][k + 1], r.z[j + 1][k + 1], r.z[j + 1][k]];
            if (!zz.every(isFinite)) continue;
            const c = [P(r.xs[k], r.ys[j], zz[0]), P(r.xs[k + 1], r.ys[j], zz[1]), P(r.xs[k + 1], r.ys[j + 1], zz[2]), P(r.xs[k], r.ys[j + 1], zz[3])];
            const col = cmap(s.colormap, ((zz[0] + zz[1] + zz[2] + zz[3]) / 4 - L.mmin) / (L.mmax - L.mmin));
            const d = 'M' + c.map((p) => r2(p.x) + ',' + r2(p.y)).join('L') + 'Z';
            items.push({
              d: (c[0].d + c[1].d + c[2].d + c[3].d) / 4,
              svg: ser.kind === 'surface'
                ? `<path d="${d}" fill="${col}" stroke="#000" stroke-opacity="0.6" stroke-width="${aw}" stroke-linejoin="round"/>`
                : `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(ser.width ?? 1)}"/>`,
            });
          }
        }
      } else if (r.grid3) {
        const G = r.grid3;
        for (let j = 0; j < G.length - 1; j++) {
          for (let k = 0; k < G[j].length - 1; k++) {
            const q = [G[j][k], G[j][k + 1], G[j + 1][k + 1], G[j + 1][k]];
            if (!q.every((p) => p.every(isFinite))) continue;
            const c = q.map((p) => P(p[0], p[1], p[2]));
            const col = cmap(s.colormap, ((q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - L.mmin) / (L.mmax - L.mmin));
            items.push({ d: (c[0].d + c[1].d + c[2].d + c[3].d) / 4, svg: `<path d="${'M' + c.map((p) => r2(p.x) + ',' + r2(p.y)).join('L') + 'Z'}" fill="${col}" stroke="#000" stroke-opacity="0.6" stroke-width="${aw}" stroke-linejoin="round"/>` });
          }
        }
      } else if (r.curve3) {
        const C = r.curve3, sc = TD.css(ser.color), dash = ser.dash === 'dashed' ? ` stroke-dasharray="${r2(3 / K)} ${r2(2.2 / K)}"` : ser.dash === 'dotted' ? ` stroke-dasharray="0.01 ${r2(2 / K)}"` : '';
        for (let i = 0; i < C.length - 1; i++) {
          if (!C[i].every(isFinite) || !C[i + 1].every(isFinite)) continue;
          const a = P(...C[i]), b = P(...C[i + 1]);
          items.push({ d: (a.d + b.d) / 2 + 1e-6, svg: `<path d="M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}" stroke="${sc}" stroke-width="${r2(ser.width ?? 1)}" stroke-linecap="round" fill="none"${dash}/>` });
        }
      } else if (r.pts3) {
        for (const p of r.pts3) {
          const q = P(p[0], p[1], p[2]);
          items.push({ d: q.d, svg: markSvg(ser.mark === 'none' ? '*' : ser.mark, q.x, q.y, ser.color, ser.width ?? 1) });
        }
      }
      if (ser.legend) entries.push({ text: ser.legend, color: ser.color, kind: ser.kind, width: ser.width ?? 1, dash: 'solid', mark: ser.mark === 'none' ? '*' : ser.mark });
    });
    items.sort((a, b) => a.d - b.d);
    body = items.map((it) => it.svg).join('');
    // tick labels on front-bottom edges
    const center = Pn(0.5, 0.5, 0.5);
    const lab = (a, b, vals, mapN, mk, label) => {
      let o = '';
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let dir = { x: mid.x - center.x, y: mid.y - center.y };
      const l = Math.hypot(dir.x, dir.y) || 1; dir = { x: dir.x / l, y: dir.y / l };
      for (const v of vals) {
        const p = mk(mapN(v));
        o += ln(p, { x: p.x - dir.x * 3, y: p.y - dir.y * 3 });
        const tb = TD.textBox(tickTex(v), NORMAL);
        const off = 4 + Math.abs(dir.x) * tb.w / 2 + Math.abs(dir.y) * tb.h / 2;
        o += txt(tickTex(v), p.x + dir.x * off, p.y + dir.y * off, ctx, NORMAL);
      }
      if (label) {
        const lb = TD.textBox(label, NORMAL);
        const off = 26 + Math.abs(dir.x) * lb.w / 2 + Math.abs(dir.y) * lb.h / 2;
        o += txt(label, mid.x + dir.x * off, mid.y + dir.y * off, ctx, NORMAL);
      }
      return o;
    };
    const fw = 1 - bw, fu = 1 - bu;
    front += lab(Pn(0, fw, 0), Pn(1, fw, 0), xt, nu, (n) => Pn(n, fw, 0), s.xlabel);
    front += lab(Pn(fu, 0, 0), Pn(fu, 1, 0), yt, nw, (n) => Pn(fu, n, 0), s.ylabel);
    // z axis: the vertical edge furthest left on screen
    let best = null;
    for (const u of [0, 1]) for (const w of [0, 1]) { const p = Pn(u, w, 0); if (!best || p.x < best.p.x) best = { u, w, p }; }
    front += lab(Pn(best.u, best.w, 0), Pn(best.u, best.w, 1), zt, nt, (n) => Pn(best.u, best.w, n), s.zlabel);
    front += txt(s.title, s.x + s.w / 2, s.y - 6, ctx, NORMAL, 'south');
    front += legendSvg(s, ctx, entries);
    if (s.colorbar) front += colorbarSvg(s, L, ctx);
    const errs = L.ev.map((r, i) => (r.error ? `Series ${i + 1}: ${r.error}` : '')).filter(Boolean);
    if (errs.length && !ctx.export) front += `<text x="${s.x + 6}" y="${s.y + 16}" font-size="11" fill="#c62828" font-family="sans-serif">${esc(errs[0])}</text>`;
    return back + body + front;
  }

  // =====================================================================
  // pgfplots export
  // =====================================================================
  const texArg = (t) => `{${TD.tikzText(t)}}`;
  function plotTikz(s, X) {
    X.pkgs.add('pgfplots');
    const L = limits(s);
    const o = [
      // explicit cm: a bare (x,y) here is read in the axis' own units, not the picture's
      `at={(${f(s.x / PX)}cm,${f(-(s.y + s.h) / PX)}cm)}`, 'anchor=south west', 'scale only axis',
      `width=${X.len(s.w)}cm`, `height=${X.len(s.h)}cm`,
      `xmin=${f4(L.xmin)}`, `xmax=${f4(L.xmax)}`, `ymin=${f4(L.ymin)}`, `ymax=${f4(L.ymax)}`,
    ];
    if (s.dim === 3) {
      o.push(`zmin=${f4(L.zmin)}`, `zmax=${f4(L.zmax)}`, `view={${f(s.view?.[0] ?? 25)}}{${f(s.view?.[1] ?? 30)}}`);
      o.push(`xtick={${ticks(L.xmin, L.xmax, 5).join(',')}}`, `ytick={${ticks(L.ymin, L.ymax, 5).join(',')}}`, `ztick={${ticks(L.zmin, L.zmax, 5).join(',')}}`);
    } else {
      o.push(`xtick={${ticks(L.xmin, L.xmax, Math.max(2, Math.round(s.w / 70))).join(',')}}`, `ytick={${ticks(L.ymin, L.ymax, Math.max(2, Math.round(s.h / 50))).join(',')}}`);
      if (s.axisLines === 'left' || s.axisLines === 'middle') {
        o.push(`axis lines=${s.axisLines}`, 'axis line style={-{Stealth}}');
        X.libs.add('arrows.meta');
      }
      if (s.axisLines === 'middle') {
        o.push('every axis x label/.style={at={(current axis.right of origin)}, anchor=west}', 'every axis y label/.style={at={(current axis.above origin)}, anchor=south}');
      }
    }
    if (s.grid) o.push('grid=major');
    if (s.title) o.push(`title=${texArg(s.title)}`);
    if (s.xlabel) o.push(`xlabel=${texArg(s.xlabel)}`);
    if (s.ylabel) o.push(`ylabel=${texArg(s.ylabel)}`);
    if (s.dim === 3 && s.zlabel) o.push(`zlabel=${texArg(s.zlabel)}`);
    const needsMap = s.series.some((q) => GRID_KINDS.includes(q.kind)) || s.colorbar;
    if (needsMap) o.push(cmapTikz(s.colormap), `point meta min=${f4(L.mmin)}`, `point meta max=${f4(L.mmax)}`);
    if (s.colorbar) o.push('colorbar');
    if (s.series.some((q) => q.legend)) {
      if (s.legendPos === 'none') o.push('legend style={draw=none}', 'legend entries={}');
      else o.push(`legend pos=${s.legendPos || 'north east'}`);
    }
    const lines = [`\\begin{axis}[`, ...o.map((x, i) => '  ' + x + (i < o.length - 1 ? ',' : '')), ']'];
    const bars = s.series.filter((q) => q.kind === 'bar');
    s.series.forEach((ser, i) => {
      const r = L.ev[i];
      if (r.error) return;
      const col = X.col(ser.color), w = ser.width ?? 1;
      const po = [];
      const legend = ser.legend && s.legendPos !== 'none';
      const style = () => {
        po.push(`color=${col}`, `line width=${X.pt(w)}`);
        if (ser.dash === 'dashed') po.push('dashed'); else if (ser.dash === 'dotted') po.push('dotted');
        if ((ser.opacity ?? 1) < 1) po.push(`opacity=${f(ser.opacity)}`);
      };
      const mark = (m) => (m && m !== 'none' ? `mark=${m}` : 'no marks');
      const fromExpr = r.pgf && !r.xs;
      const coords = () => r.pts.map((p) => `(${f4(p[0])},${f4(p[1])})`).join(' ');
      const okPt = (p) => isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) < 1e6 && Math.abs(p[1]) < 1e6;
      const coordsOf = (list) => list.filter(okPt).map((p) => `(${f4(p[0])},${f4(p[1])})`).join(' ');
      // a curve with gaps (asymptotes, undefined points): pgfplots lifts the pen at `nan` with unbounded coords=jump
      const curveOf = (opts, list) => {
        const parts = []; let gap = false, open = false;
        for (const p of list) {
          if (okPt(p)) { parts.push(`(${f4(p[0])},${f4(p[1])})`); open = true; }
          else if (open) { parts.push('(nan,nan)'); open = false; gap = true; }
        }
        while (parts.length && parts[parts.length - 1] === '(nan,nan)') parts.pop();
        return `\\addplot[${[...opts, ...(gap ? ['unbounded coords=jump'] : [])].join(', ')}] coordinates {${parts.join(' ')}};`;
      };
      let cmd = '';
      switch (ser.kind) {
        case 'line': case 'scatter': case 'area': {
          style();
          if (ser.kind === 'scatter') po.push('only marks', mark(ser.mark === 'none' ? '*' : ser.mark));
          else po.push(mark(ser.mark));
          if (ser.kind === 'area') po.push(`fill=${col}`, 'fill opacity=0.3');
          if (fromExpr) po.push(`domain=${f4(r.domain[0])}:${f4(r.domain[1])}`, `samples=${r.pts.length}`);
          if (!legend) po.push('forget plot');
          cmd = `\\addplot[${po.join(', ')}] ${fromExpr ? `{${r.pgf}}` : `coordinates {${coords()}}`}${ser.kind === 'area' ? ' \\closedcycle' : ''};`;
          break;
        }
        case 'bar': {
          const bw = ser.barWidth || 12, bi = bars.indexOf(ser), shift = (bi - (bars.length - 1) / 2) * bw;
          po.push('ybar', `bar width=${X.len(bw)}cm`, `bar shift=${X.len(shift)}cm`, `fill=${col}`, `draw=${col}`);
          if (fromExpr) po.push(`domain=${f4(r.domain[0])}:${f4(r.domain[1])}`, `samples=${r.pts.length}`);
          if (!legend) po.push('forget plot');
          cmd = `\\addplot[${po.join(', ')}] ${fromExpr ? `{${r.pgf}}` : `coordinates {${coords()}}`};`;
          break;
        }
        case 'contour': {
          cmd = r.lines.map((l) => `\\addplot[draw=${X.col(cmap(s.colormap, (l.level - L.mmin) / (L.mmax - L.mmin)))}, line width=${X.pt(w)}, no marks, forget plot] coordinates {${l.pts.map((p) => `(${f4(p[0])},${f4(p[1])})`).join(' ')}};`).join('\n');
          break;
        }
        case 'heatmap': {
          const rows = [];
          r.ys.forEach((yv, j) => r.xs.forEach((xv, k) => rows.push(`    ${f4(xv)} ${f4(yv)} ${f4(r.z[j][k])}`)));
          cmd = `\\addplot[matrix plot*, mesh/cols=${r.xs.length}, point meta=explicit${legend ? '' : ', forget plot'}] table[meta=z] {\n    x y z\n${rows.join('\n')}\n  };`;
          break;
        }
        case 'param3d': {
          po.push('surf', 'shader=faceted', 'z buffer=sort', `domain=${f4(r.domain[0])}:${f4(r.domain[1])}`, `y domain=${f4(r.ydomain[0])}:${f4(r.ydomain[1])}`, `samples=${r.samples}`);
          if (!legend) po.push('forget plot');
          cmd = `\\addplot3[${po.join(', ')}] ({${r.pgf3[0]}}, {${r.pgf3[1]}}, {${r.pgf3[2]}});`;
          break;
        }
        case 'curve3d': {
          style(); po.push('no marks', `domain=${f4(r.domain[0])}:${f4(r.domain[1])}`, `samples=${r.curve3.length}`, 'samples y=0');
          if (!legend) po.push('forget plot');
          cmd = `\\addplot3[${po.join(', ')}] ({${r.pgf3[0]}}, {${r.pgf3[1]}}, {${r.pgf3[2]}});`;
          break;
        }
        case 'surface': case 'mesh': {
          po.push(ser.kind === 'surface' ? 'surf' : 'mesh', ser.kind === 'surface' ? 'shader=faceted' : `line width=${X.pt(w)}`,
            `domain=${f4(r.domain[0])}:${f4(r.domain[1])}`, `y domain=${f4(r.ydomain[0])}:${f4(r.ydomain[1])}`, `samples=${r.xs.length}`);
          if (!legend) po.push('forget plot');
          cmd = `\\addplot3[${po.join(', ')}] {${r.pgf}};`;
          break;
        }
        case 'param': case 'polar': case 'xofy': {
          style(); po.push('no marks');
          if (!legend) po.push('forget plot');
          cmd = curveOf(po, r.pts);
          break;
        }
        case 'ineq': case 'between': {
          const A = r.pts.filter(okPt), up = ser.rel === '>' || ser.rel === '>=';
          const cl = (p) => [p[0], Math.max(L.ymin, Math.min(L.ymax, p[1]))];
          const poly = ser.kind === 'between' ? [...A.map(cl), ...(r.pts2 || []).filter(okPt).reverse().map(cl)]
            : A.length ? [[A[0][0], up ? L.ymax : L.ymin], ...A.map(cl), [A[A.length - 1][0], up ? L.ymax : L.ymin]] : [];
          const out = [];
          if (poly.length > 2) out.push(`\\addplot[draw=none, fill=${col}, fill opacity=${f(ser.fillOpacity ?? 0.25)}, forget plot] coordinates {${coordsOf(poly)}};`);
          const strict = ser.kind === 'ineq' && (ser.rel === '<' || ser.rel === '>');
          style(); po.push('no marks');
          if (strict && !po.includes('dashed')) po.push('dashed');
          const curves = ser.kind === 'between' ? [r.pts2 || [], r.pts] : [r.pts];
          curves.forEach((c, ci) => out.push(curveOf([...po, ...(ci < curves.length - 1 || !legend ? ['forget plot'] : [])], c)));
          cmd = out.join('\n');
          break;
        }
        case 'implicit': case 'field': case 'phase': case 'vectors': {
          style();
          const out = (r.lines || []).map((l, li) => `\\addplot[${[...po, 'no marks', ...(li < r.lines.length - 1 || !legend ? ['forget plot'] : [])].join(', ')}] coordinates {${coordsOf(l.pts)}};`);
          if (r.vecs && r.vecs.length) {
            X.libs.add('arrows.meta');
            const rows = r.vecs.map((v) => `${f4(v[0])} ${f4(v[1])} ${f4(v[2])} ${f4(v[3])}\\\\`).join(' ');
            const last = !(r.lines || []).length && legend;
            out.push(`\\addplot[${[...po, 'quiver={u=\\thisrow{u}, v=\\thisrow{v}}', '-{Stealth}', ...(last ? [] : ['forget plot'])].join(', ')}] table[row sep=\\\\] {x y u v\\\\ ${rows}};`);
          }
          cmd = out.join('\n');
          break;
        }
        case 'scatter3d': {
          po.push(`color=${col}`, 'only marks', mark(ser.mark === 'none' ? '*' : ser.mark));
          if (!legend) po.push('forget plot');
          cmd = `\\addplot3[${po.join(', ')}] coordinates {${r.pts3.map((p) => `(${f4(p[0])},${f4(p[1])},${f4(p[2])})`).join(' ')}};`;
          break;
        }
      }
      if (cmd) {
        lines.push(...cmd.split('\n').map((l) => '  ' + l));
        if (legend) lines.push(`  \\addlegendentry${texArg(ser.legend)}`);
      }
    });
    lines.push('\\end{axis}');
    return lines.join('\n');
  }

  // =====================================================================
  // plot shape type
  // =====================================================================
  const newSeries = (o) => ({
    kind: 'line', source: 'expr', expr: 'sin(x)', data: '', domain: ['-5', '5'], ydomain: ['-5', '5'], samples: 60,
    color: SERIES_COLORS[0], width: 1, dash: 'solid', mark: 'none', legend: '', levels: 8, barWidth: 12, opacity: 1, ...o,
  });
  TD.newSeries = newSeries;
  const PRESETS = {
    function: { w: 280, h: 200, axisLines: 'middle', xlabel: '$x$', ylabel: '$y$', series: [newSeries({ expr: 'sin(x)', domain: ['-2*pi', '2*pi'], samples: 100 }), newSeries({ expr: 'cos(x)', domain: ['-2*pi', '2*pi'], samples: 100, color: SERIES_COLORS[1], dash: 'dashed' })] },
    line: { w: 280, h: 200, grid: true, xlabel: '$t$ (s)', ylabel: '$v$ (m/s)', series: [newSeries({ kind: 'line', source: 'data', mark: '*', data: '0 0\n1 1.8\n2 3.1\n3 3.9\n4 4.6\n5 4.9', legend: 'measured' })] },
    scatter: { w: 280, h: 200, xlabel: '$x$', ylabel: '$y$', series: [newSeries({ kind: 'scatter', source: 'data', mark: '*', data: '0.5 1.2\n1 1.9\n1.5 2.1\n2 3.2\n2.5 3.1\n3 4.4\n3.5 4.2\n4 5.3\n4.5 5.1\n5 6.2', color: SERIES_COLORS[1] })] },
    area: { w: 280, h: 200, xlabel: '$x$', ylabel: '$f(x)$', series: [newSeries({ kind: 'area', expr: 'exp(-x^2/2)', domain: ['-3', '3'], samples: 80, color: SERIES_COLORS[2] })] },
    bar: { w: 280, h: 200, ylabel: 'count', series: [newSeries({ kind: 'bar', source: 'data', data: '1 3\n2 5\n3 2\n4 6\n5 4', barWidth: 16, color: SERIES_COLORS[0] })] },
    contour: { w: 240, h: 240, colorbar: true, colormap: 'viridis', xlabel: '$x$', ylabel: '$y$', series: [newSeries({ kind: 'contour', expr: 'sin(x)*cos(y)', domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 50, levels: 10 })] },
    heatmap: { w: 240, h: 240, colorbar: true, colormap: 'hot', xlabel: '$x$', ylabel: '$y$', series: [newSeries({ kind: 'heatmap', expr: 'exp(-(x^2+y^2)/2)', domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 24 })] },
    param3d: { dim: 3, w: 280, h: 220, grid: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', view: [30, 35], series: [newSeries({ kind: 'param3d', ...KIND_DEF.param3d })] },
    curve3d: { dim: 3, w: 280, h: 220, grid: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', series: [newSeries({ kind: 'curve3d', ...KIND_DEF.curve3d, width: 1.2 })] },
    function3d: { dim: 3, w: 280, h: 220, grid: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', series: [newSeries({ kind: 'surface', expr: 'sin(x)*cos(y)', domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 25 })] },
    surface3d: { dim: 3, w: 280, h: 220, grid: true, colormap: 'viridis', xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', series: [newSeries({ kind: 'surface', expr: 'exp(-(x^2+y^2))', domain: ['-2', '2'], ydomain: ['-2', '2'], samples: 25 })] },
    mesh3d: { dim: 3, w: 280, h: 220, grid: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', series: [newSeries({ kind: 'mesh', expr: 'x^2-y^2', domain: ['-2', '2'], ydomain: ['-2', '2'], samples: 20 })] },
    scatter3d: {
      dim: 3, w: 280, h: 220, grid: true, xlabel: '$x$', ylabel: '$y$', zlabel: '$z$',
      series: [newSeries({ kind: 'scatter3d', source: 'data', mark: '*', color: SERIES_COLORS[1], data: Array.from({ length: 30 }, (_, i) => { const t = i / 4; return `${f(Math.cos(t))} ${f(Math.sin(t))} ${f(t / 7.5)}`; }).join('\n') })],
    },
  };
  TD.PLOT_PRESETS = PRESETS;

  T.plot = {
    name: 'Plot',
    pts: [['x', 'y']],
    create(p, d, tool) {
      const pr = JSON.parse(JSON.stringify(PRESETS[tool.split(':')[1]] || PRESETS.function));
      return {
        type: 'plot', x: p.x, y: p.y, w: 0, h: 0, dim: 2, title: '', xlabel: '', ylabel: '', zlabel: '', axisLines: 'box', grid: false,
        xmin: '', xmax: '', ymin: '', ymax: '', zmin: '', zmax: '', view: [25, 30], colormap: 'hot', colorbar: false, legendPos: 'north east',
        ...pr, _pw: pr.w, _ph: pr.h,
      };
    },
    drag(s, a, q, e) { Object.assign(s, TD.box.drag(a, q, e)); },
    fix(s) {
      if (s.w < 30 || s.h < 30) { s.w = s._pw || 280; s.h = s._ph || 200; }
      delete s._pw; delete s._ph;
    },
    valid: () => true,
    handles: (s) => TD.box.handles(s),
    setHandle(s, k, q, e, o) { const b = TD.box.resize(o, k, q, e); if (b.w >= 40 && b.h >= 40) Object.assign(s, b); },
    anchors: (s) => TD.box.handles(s).map((h) => ({ x: h.x, y: h.y })),
    samples: (s) => [{ x: s.x - 50, y: s.y - (s.title ? 24 : 8) }, { x: s.x + s.w + (s.colorbar ? 60 : 8), y: s.y + s.h + 40 }],
    svg(s, ctx) {
      const inner = s.dim === 3 ? render3d(s, ctx) : render2d(s, ctx);
      const hit = ctx.export ? '' : `<rect class="hitfill" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`;
      return inner + hit;
    },
    tikz: plotTikz,
  };

  // =====================================================================
  // pie chart
  // =====================================================================
  const PIE_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
  function pieSlices(s) {
    const rows = [];
    String(s.data || '').split('\n').forEach((line, i) => {
      let t = line.trim();
      if (!t) return;
      let color = null;
      const cm = t.match(/\s+(#[0-9a-fA-F]{6})$/);
      if (cm) { color = cm[1]; t = t.slice(0, cm.index).trim(); }
      const m = t.match(/^(.*?)[\s,;]+(-?[\d.]+(?:e[+-]?\d+)?)$/i);
      if (!m || !(+m[2] > 0)) return;
      rows.push({ label: m[1], value: +m[2], color: color || PIE_COLORS[rows.length % PIE_COLORS.length] });
    });
    const total = rows.reduce((a, r) => a + r.value, 0) || 1;
    let a = s.startAngle ?? 90;
    for (const r of rows) { r.frac = r.value / total; r.a1 = a; r.a2 = a - r.frac * 360; a = r.a2; }
    return rows;
  }
  const pct = (fr) => +(fr * 100).toFixed(1);
  const pieLabel = (s, r) => (s.showPercent ? `${r.label}${r.label ? ' ' : ''}(${pct(r.frac)}\\%)` : r.label);
  // An outside label's centre: TikZ puts the node's border point at angle mid+180 (anchor=<angle>) on
  // the point just outside the rim, so the box (with its 0.3333em inner sep) sits along the ray.
  function pieOutside(s, r, lab) {
    const mid = (r.a1 + r.a2) / 2, b = TD.textBox(lab, { size: s.size });
    const c = Math.cos((mid * Math.PI) / 180), sn = Math.sin((mid * Math.PI) / 180), pad = TD.sizePx(s.size) / 3;
    const hw = b.w / 2 + pad, hh = b.h / 2 + pad;
    const t = Math.min(Math.abs(c) > 1e-9 ? hw / Math.abs(c) : Infinity, Math.abs(sn) > 1e-9 ? hh / Math.abs(sn) : Infinity);
    const R = s.r + 6;
    return { x: s.cx + (R + t) * c, y: s.cy - (R + t) * sn, b };
  }
  T.pie = {
    name: 'Pie chart',
    pts: [['cx', 'cy']],
    create: (p) => ({ type: 'pie', cx: p.x, cy: p.y, r: 0, data: 'Physics 35\nMaths 25\nChemistry 20\nBiology 20', showPercent: true, labelPos: 'outside', startAngle: 90, size: 'normalsize' }),
    drag(s, a, q) { s.r = Math.hypot(q.x - a.x, q.y - a.y); },
    fix(s) { if (s.r < 10) s.r = 70; },
    valid: () => true,
    handles: (s) => [{ k: 'r', x: s.cx + s.r, y: s.cy }],
    setHandle(s, k, q) { s.r = Math.max(10, Math.hypot(q.x - s.cx, q.y - s.cy)); },
    anchors: (s) => [{ x: s.cx, y: s.cy }],
    samples: (s) => {
      const pts = [{ x: s.cx - s.r, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy + s.r }];
      if (s.labelPos === 'outside') for (const r of pieSlices(s)) {
        const lab = pieLabel(s, r);
        if (lab) { const q = pieOutside(s, r, lab); pts.push({ x: q.x - q.b.w / 2, y: q.y - q.b.h / 2 }, { x: q.x + q.b.w / 2, y: q.y + q.b.h / 2 }); }
      }
      return pts;
    },
    svg(s, ctx) {
      const rows = pieSlices(s);
      const P = (a, rr) => ({ x: s.cx + rr * Math.cos((a * Math.PI) / 180), y: s.cy - rr * Math.sin((a * Math.PI) / 180) });
      let out = '';
      for (const r of rows) {
        const col = TD.css(r.color);
        if (r.frac > 0.9999) out += `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${col}" stroke="#fff" stroke-width="1.4"/>`;
        else {
          const p1 = P(r.a1, s.r), p2 = P(r.a2, s.r);
          out += `<path d="M${r2(s.cx)},${r2(s.cy)}L${r2(p1.x)},${r2(p1.y)}A${r2(s.r)},${r2(s.r)} 0 ${r.frac > 0.5 ? 1 : 0},1 ${r2(p2.x)},${r2(p2.y)}Z" fill="${col}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`;
        }
      }
      for (const r of rows) {
        const mid = (r.a1 + r.a2) / 2, lab = pieLabel(s, r);
        if (!lab) continue;
        const st = { size: s.size };
        if (s.labelPos === 'outside') {
          const q = pieOutside(s, r, lab);
          out += txt(lab, q.x, q.y, ctx, st);
        } else { const p = P(mid, s.r * 0.62); out += txt(lab, p.x, p.y, ctx, st); }
      }
      if (!ctx.export) out += `<circle class="hitfill" cx="${s.cx}" cy="${s.cy}" r="${s.r}"/>`;
      return out;
    },
    tikz(s, X) {
      const rows = pieSlices(s), out = [];
      const pc = (a, rr) => X.c(s.cx + rr * Math.cos((a * Math.PI) / 180), s.cy - rr * Math.sin((a * Math.PI) / 180));
      for (const r of rows) {
        if (r.frac > 0.9999) out.push(`\\fill[${X.col(r.color)}, draw=white, line width=1pt] ${X.c(s.cx, s.cy)} circle (${X.len(s.r)});`);
        else out.push(`\\fill[${X.col(r.color)}, draw=white, line width=1pt, line join=round] ${X.c(s.cx, s.cy)} -- ${pc(r.a1, s.r)} arc[start angle=${f(r.a1)}, end angle=${f(r.a2)}, radius=${X.len(s.r)}] -- cycle;`);
      }
      const fo = TD.textOpts({ size: s.size }, X);
      for (const r of rows) {
        const mid = (r.a1 + r.a2) / 2, lab = pieLabel(s, r);
        if (!lab) continue;
        if (s.labelPos === 'outside') out.push(`\\node[anchor=${f(mid + 180)}${fo.length ? ', ' + fo.join(', ') : ''}] at ${pc(mid, s.r + 6)} {${TD.tikzText(lab)}};`);
        else out.push(`\\node${fo.length ? `[${fo.join(', ')}]` : ''} at ${pc(mid, s.r * 0.62)} {${TD.tikzText(lab)}};`);
      }
      return out.join('\n');
    },
  };

  // =====================================================================
  // property panels
  // =====================================================================
  const sel = (name, opts, v, attrs) => `<select ${attrs}>${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const row = (label, ctl) => `<div class="row"><label>${label}</label><div class="ctl">${ctl}</div></div>`;
  const inp = (attrs, v, type = 'text') => `<input type="${type}" ${attrs} value="${esc(v ?? '')}">`;
  const colorBtn = (attrs, v) => `<button type="button" class="cbtn" ${attrs} title="${v || 'none'}"><span style="background:${v ? TD.css(v) : 'transparent'}"></span></button>`;

  TD.panels = TD.panels || {};
  TD.panels.plot = {
    html(s) {
      const is3 = s.dim === 3;
      let h = `<div class="sec"><div class="sec-title">Axis</div>`;
      h += row('Title', inp('data-p="title"', s.title));
      h += row('x label', inp('data-p="xlabel"', s.xlabel));
      h += row('y label', inp('data-p="ylabel"', s.ylabel));
      if (is3) h += row('z label', inp('data-p="zlabel"', s.zlabel));
      h += row('x range', inp('data-p="xmin" placeholder="auto"', s.xmin) + inp('data-p="xmax" placeholder="auto"', s.xmax));
      h += row('y range', inp('data-p="ymin" placeholder="auto"', s.ymin) + inp('data-p="ymax" placeholder="auto"', s.ymax));
      if (is3) {
        h += row('z range', inp('data-p="zmin" placeholder="auto"', s.zmin) + inp('data-p="zmax" placeholder="auto"', s.zmax));
        h += row('View (az, el)', inp('data-p="view0" step="5"', s.view?.[0] ?? 25, 'number') + inp('data-p="view1" step="5"', s.view?.[1] ?? 30, 'number'));
      } else h += row('Axis lines', sel('', [['box', 'Box'], ['left', 'Left (arrows)'], ['middle', 'Middle (through 0)']], s.axisLines, 'data-p="axisLines"'));
      h += row('Grid', `<input type="checkbox" data-p="grid"${s.grid ? ' checked' : ''}>`);
      h += row('Variables', inp('data-p="vars" placeholder="a = 2, b = 0.5" spellcheck="false" title="Constants you can use in every function and domain"', s.vars || ''));
      h += row('Colormap', sel('', Object.keys(CMAPS).map((k) => [k, k]), s.colormap, 'data-p="colormap"'));
      h += row('Color bar', `<input type="checkbox" data-p="colorbar"${s.colorbar ? ' checked' : ''}>`);
      h += row('Legend', sel('', [['north east', 'Top right'], ['north west', 'Top left'], ['south east', 'Bottom right'], ['south west', 'Bottom left'], ['outer north east', 'Outside right'], ['none', 'Hidden']], s.legendPos, 'data-p="legendPos"'));
      h += `</div>`;
      s.series.forEach((ser, i) => {
        const kinds = is3 ? KINDS3 : KINDS2;
        const exprOnly = usesExprOnly(ser.kind), dataOnly = usesDataOnly(ser.kind);
        const useExpr = exprOnly || (!dataOnly && ser.source !== 'data');
        const grid = GRID_KINDS.includes(ser.kind);
        const r = evalSeries(withVars(ser, s.vars));
        h += `<div class="sec ser"><div class="sec-title">Series ${i + 1}<button class="mini" data-act="rmser" data-i="${i}" title="Remove series">✕</button></div>`;
        h += row('Type', sel('', kinds, ser.kind, `data-i="${i}" data-sk="kind"`));
        if (!exprOnly && !dataOnly) h += row('Source', sel('', [['expr', 'Function'], ['data', 'Data table']], ser.source, `data-i="${i}" data-sk="source"`));
        const NK = { // labels for the newer kinds: [first, second, parameter range label, uses a y range]
          ineq: ['f(x)', null, 'x domain'], between: ['f(x) (lower)', 'g(x) (upper)', 'x domain'], xofy: ['x = f(y)', null, 'y domain'],
          param: ['x(t)', 'y(t)', 't range'], polar: ['r(θ)  (use t)', null, 'θ range'], implicit: ['F(x, y) = 0', null, 'x domain', 1],
          field: ['dx = P(x, y)', 'dy = Q(x, y)', 'x domain', 1], phase: ["x' = P(x, y)", "y' = Q(x, y)", 'x domain', 1],
          param3d: ['x(u, v)', 'y(u, v)', 'u range', 'v range', 'z(u, v)'], curve3d: ['x(t)', 'y(t)', 't range', 0, 'z(t)'],
        }[ser.kind];
        if (NK) {
          if (ser.kind === 'ineq') h += row('Relation', sel('', [['<', 'y < f(x)'], ['<=', 'y ≤ f(x)'], ['>', 'y > f(x)'], ['>=', 'y ≥ f(x)']], ser.rel || '<', `data-i="${i}" data-sk="rel"`));
          h += row(NK[0], inp(`data-i="${i}" data-sk="expr" spellcheck="false"`, ser.expr));
          if (NK[1]) h += row(NK[1], inp(`data-i="${i}" data-sk="expr2" spellcheck="false"`, ser.expr2 || ''));
          if (NK[4]) h += row(NK[4], inp(`data-i="${i}" data-sk="expr3" spellcheck="false"`, ser.expr3 || ''));
          h += row(NK[2], inp(`data-i="${i}" data-sk="domain0"`, ser.domain[0]) + inp(`data-i="${i}" data-sk="domain1"`, ser.domain[1]));
          if (NK[3]) h += row(typeof NK[3] === 'string' ? NK[3] : 'y domain', inp(`data-i="${i}" data-sk="ydomain0"`, ser.ydomain[0]) + inp(`data-i="${i}" data-sk="ydomain1"`, ser.ydomain[1]));
          h += row(ser.kind === 'field' || ser.kind === 'phase' ? 'Grid (per side)' : 'Samples', inp(`data-i="${i}" data-sk="samples" min="2"`, ser.samples, 'number'));
          if (ser.kind === 'ineq' || ser.kind === 'between') h += row('Fill opacity', inp(`data-i="${i}" data-sk="fillOpacity" min="0" max="1" step="0.05"`, ser.fillOpacity ?? 0.25, 'number'));
        } else if (ser.kind === 'vectors') {
          h += `<div class="row col"><label>One vector per line: <code>x y</code> (from the origin) or <code>x y u v</code> (from x, y)</label><textarea data-i="${i}" data-sk="data" spellcheck="false">${esc(ser.data)}</textarea></div>`;
        } else if (useExpr) {
          h += row(grid ? 'z = f(x, y)' : 'y = f(x)', inp(`data-i="${i}" data-sk="expr" spellcheck="false"`, ser.expr));
          h += row('x domain', inp(`data-i="${i}" data-sk="domain0"`, ser.domain[0]) + inp(`data-i="${i}" data-sk="domain1"`, ser.domain[1]));
          if (grid) h += row('y domain', inp(`data-i="${i}" data-sk="ydomain0"`, ser.ydomain[0]) + inp(`data-i="${i}" data-sk="ydomain1"`, ser.ydomain[1]));
          h += row('Samples', inp(`data-i="${i}" data-sk="samples" min="2"`, ser.samples, 'number'));
        } else {
          h += `<div class="row col"><label>Data (${ser.kind === 'scatter3d' ? 'x y z' : 'x y'} per line)</label><textarea data-i="${i}" data-sk="data" spellcheck="false">${esc(ser.data)}</textarea></div>`;
        }
        if (r.error) h += `<div class="err">${esc(r.error)}</div>`;
        if (ser.kind === 'contour') h += row('Levels', inp(`data-i="${i}" data-sk="levels" min="1"`, ser.levels, 'number'));
        if (!['heatmap', 'contour', 'surface', 'param3d'].includes(ser.kind) || ser.kind === 'contour') {
          if (!['contour', 'surface', 'heatmap', 'mesh'].includes(ser.kind)) h += row('Color', colorBtn(`data-sercolor="${i}"`, ser.color));
          h += row('Line width', inp(`data-i="${i}" data-sk="width" min="0.25" step="0.25"`, ser.width, 'number'));
        }
        if (['line', 'area', 'ineq', 'between', 'xofy', 'param', 'polar', 'implicit', 'phase', 'curve3d'].includes(ser.kind)) h += row('Dash', sel('', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], ser.dash, `data-i="${i}" data-sk="dash"`));
        if (['line', 'scatter', 'scatter3d'].includes(ser.kind)) h += row('Marker', sel('', MARKS, ser.mark, `data-i="${i}" data-sk="mark"`));
        if (ser.kind === 'bar') h += row('Bar width', inp(`data-i="${i}" data-sk="barWidth" min="1"`, ser.barWidth, 'number') + '<span class="val">px</span>');
        h += row('Legend', inp(`data-i="${i}" data-sk="legend" placeholder="(none)"`, ser.legend));
        h += `</div>`;
      });
      h += `<div class="sec"><button class="wide" data-act="addser">+ Add series</button>
        <div class="help" style="margin-top:6px">Functions use <code>x</code>${s.dim === 3 ? ', <code>y</code>' : ' (<code>t</code> for parametric / polar, <code>y</code> for x = f(y) and fields)'}, your variables, <code>pi</code>, <code>e</code>, <code>^</code>, sin, cos, tan, exp, ln, sqrt, abs… Trig is in radians.</div></div>`;
      return h;
    },
    // returns true when the panel should be re-rendered
    apply(s, t) {
      if (t.dataset.p) {
        const k = t.dataset.p;
        if (k === 'view0' || k === 'view1') { s.view = [...(s.view || [25, 30])]; s.view[+k.slice(-1)] = parseFloat(t.value) || 0; return false; }
        s[k] = t.type === 'checkbox' ? t.checked : t.value;
        return false;
      }
      if (t.dataset.sk) {
        const ser = s.series[+t.dataset.i], k = t.dataset.sk;
        if (k.startsWith('domain') || k.startsWith('ydomain')) { const base = k.slice(0, -1); ser[base] = [...ser[base]]; ser[base][+k.slice(-1)] = t.value; return false; }
        if (['samples', 'width', 'levels', 'barWidth'].includes(k)) { const v = parseFloat(t.value); if (isFinite(v) && v > 0) ser[k] = v; return false; }
        if (k === 'fillOpacity') { const v = parseFloat(t.value); if (isFinite(v)) ser[k] = Math.max(0, Math.min(1, v)); return false; }
        if (k === 'kind' && KIND_DEF[t.value] && ser.kind !== t.value) Object.assign(ser, JSON.parse(JSON.stringify(KIND_DEF[t.value])));
        ser[k] = t.value;
        return k === 'kind' || k === 'source';
      }
      return false;
    },
    action(s, act, i) {
      if (act === 'addser') {
        const is3 = s.dim === 3, n = s.series.length;
        s.series.push(newSeries(is3 ? { kind: 'surface', expr: 'x*y/4', domain: ['-2', '2'], ydomain: ['-2', '2'], samples: 15, color: SERIES_COLORS[n % 7] }
          : { expr: 'x', domain: [...(s.series[0]?.domain || ['-5', '5'])], color: SERIES_COLORS[n % 7] }));
      }
      if (act === 'rmser') s.series.splice(i, 1);
    },
    color(s, i) { return { get: () => s.series[i].color, set: (v) => { s.series[i].color = v || '#000000'; }, nullable: false }; },
  };
  TD.panels.pie = {
    html(s) {
      return `<div class="sec"><div class="sec-title">Pie data</div>
        <div class="row col"><label>One slice per line: <code>label value [#color]</code></label><textarea data-p="data" spellcheck="false">${esc(s.data)}</textarea></div>
        ${row('Show %', `<input type="checkbox" data-p="showPercent"${s.showPercent ? ' checked' : ''}>`)}
        ${row('Labels', sel('', [['outside', 'Outside'], ['inside', 'Inside']], s.labelPos, 'data-p="labelPos"'))}
        ${row('Start angle', inp('data-p="startAngle" step="15"', s.startAngle, 'number') + '<span class="val">°</span>')}</div>`;
    },
    apply(s, t) {
      const k = t.dataset.p;
      if (!k) return false;
      s[k] = t.type === 'checkbox' ? t.checked : k === 'startAngle' ? parseFloat(t.value) || 0 : t.value;
      return false;
    },
  };

  TD.plotInternals = { parseExpr, toPgf, ticks, cmap, limits, evalSeries, contour };
})();
