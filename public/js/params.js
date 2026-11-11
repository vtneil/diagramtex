// Parameters: variables of a diagram, and geometry fields given as expressions over the variables and over
// other objects (their fields, anchors and sizes). Values are in the units the properties panel shows: cm with
// y pointing up (as in TikZ), degrees for angles.
//
//   TD.params.parse('w/2 + a.east.x')        → an expression tree, or throws an Error with a short message
//   TD.params.solve(shapes, vars, geom)      → Map of 'var:name' | 'id:field' → error message
//
// A shape keeps its expressions in s.ex = { field: 'source' } and the value last set from each in
// s._ev = { field: value in px }. A field changed by hand since (a drag, a nudge) no longer equals its _ev and
// lets go of its expression, the way a dragged connector lets go of the shape it was attached to; a field that
// moved along with what it depends on (both dragged together) keeps it.
(function () {
  const TD = (window.TD = window.TD || {});
  const rad = Math.PI / 180;
  const FN = {
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    exp: Math.exp, ln: Math.log, log: Math.log10, pow: Math.pow,
    sin: (a) => Math.sin(a * rad), cos: (a) => Math.cos(a * rad), tan: (a) => Math.tan(a * rad),
    asin: (v) => Math.asin(v) / rad, acos: (v) => Math.acos(v) / rad, atan: (v) => Math.atan(v) / rad, atan2: (y, x) => Math.atan2(y, x) / rad,
  };
  // functions of points: the distance between two, the direction from one to another (degrees)
  const PFN = { dist: (p, q) => Math.hypot(q.x - p.x, q.y - p.y), angle: (p, q) => Math.atan2(q.y - p.y, q.x - p.x) / rad };
  const CONST = { pi: Math.PI, e: Math.E };
  const ANCHOR = {
    center: [0.5, 0.5], north: [0.5, 1], south: [0.5, 0], east: [1, 0.5], west: [0, 0.5],
    northeast: [1, 1], northwest: [0, 1], southeast: [1, 0], southwest: [0, 0],
    ne: [1, 1], nw: [0, 1], se: [1, 0], sw: [0, 0], n: [0.5, 1], s: [0.5, 0], e: [1, 0.5], w: [0, 0.5],
  };
  const anchorOf = (k) => ANCHOR[k.replace(/_/g, '').toLowerCase()];

  // ---- reading: numbers, names (a, a.b, a.b.c), + - * / ^, unary -, calls, parentheses
  function parse(src) {
    const s = String(src == null ? '' : src).replace(/^\s*=/, '');
    let i = 0;
    const err = (m) => { throw new Error(m); };
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const peek = () => { ws(); return s[i]; };
    function primary() {
      const c = peek();
      if (c === undefined) err('the expression ends too soon');
      if (c === '(') { i++; const e = sum(); if (peek() !== ')') err('a ( is never closed'); i++; return e; }
      if (c === '-' || c === '+') { i++; const e = power(); return c === '-' ? { op: 'neg', a: e } : e; }
      const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (num) { i += num[0].length; return { num: parseFloat(num[0]) }; }
      const id = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(s.slice(i));
      if (!id) err(`unexpected “${c}”`);
      i += id[0].length;
      if (peek() === '(') {
        i++;
        const args = [];
        if (peek() !== ')') for (;;) { args.push(sum()); if (peek() === ',') { i++; continue; } break; }
        if (peek() !== ')') err(`${id[0]}( is never closed`);
        i++;
        if (!FN[id[0]] && !PFN[id[0]]) err(`no function called ${id[0]}`);
        return { call: id[0], args };
      }
      return { ref: id[0].split('.') };
    }
    function power() { const a = primary(); if (peek() === '^') { i++; return { op: '^', a, b: unary() } } return a; }
    function unary() { const c = peek(); if (c === '-') { i++; return { op: 'neg', a: unary() }; } if (c === '+') { i++; return unary(); } return power(); }
    function product() { let a = unary(); for (;;) { const c = peek(); if (c === '*' || c === '/') { i++; a = { op: c, a, b: unary() }; } else return a; } }
    function sum() { let a = product(); for (;;) { const c = peek(); if (c === '+' || c === '-') { i++; a = { op: c, a, b: product() }; } else return a; } }
    if (!s.trim()) err('empty');
    const e = sum();
    if (peek() !== undefined) err(`unexpected “${s[i]}”`);
    return e;
  }
  // the first name of each reference (a variable or an object)
  function names(e, out = new Set()) {
    if (!e) return out;
    if (e.ref) out.add(e.ref[0]);
    if (e.a) names(e.a, out);
    if (e.b) names(e.b, out);
    if (e.args) for (const x of e.args) names(x, out);
    return out;
  }
  const isPt = (v) => v && typeof v === 'object';
  function evaluate(e, look) {
    if ('num' in e) return e.num;
    if (e.ref) return look(e.ref);
    if (e.call) {
      const args = e.args.map((x) => evaluate(x, look));
      if (PFN[e.call]) { if (args.length !== 2 || !args.every(isPt)) throw new Error(`${e.call}(p, q) takes two points`); return PFN[e.call](args[0], args[1]); }
      if (args.some(isPt)) throw new Error(`${e.call}() takes numbers (a point needs .x or .y)`);
      return FN[e.call](...args);
    }
    const a = evaluate(e.a, look);
    if (e.op === 'neg') return isPt(a) ? { x: -a.x, y: -a.y } : -a;
    const b = evaluate(e.b, look);
    if (isPt(a) || isPt(b)) {
      if ((e.op === '+' || e.op === '-') && isPt(a) && isPt(b)) return e.op === '+' ? { x: a.x + b.x, y: a.y + b.y } : { x: a.x - b.x, y: a.y - b.y };
      if (e.op === '*' && isPt(a) !== isPt(b)) { const [p, k] = isPt(a) ? [a, b] : [b, a]; return { x: p.x * k, y: p.y * k }; }
      if (e.op === '/' && isPt(a) && !isPt(b)) return { x: a.x / b, y: a.y / b };
      throw new Error('points add, subtract and scale; use .x or .y for a number');
    }
    if (e.op === '+') return a + b;
    if (e.op === '-') return a - b;
    if (e.op === '*') return a * b;
    if (e.op === '/') return a / b;
    return Math.pow(a, b);
  }

  // ---- the values of objects, as the panel shows them
  const toUnit = (v, k, PX) => (k === 'deg' ? v : k === 'y' ? -v / PX : v / PX);
  const fromUnit = (v, k, PX) => (k === 'deg' ? v : k === 'y' ? -v * PX : v * PX);
  // the name an expression uses for an object: its layer name, a named point's name, or its TikZ name
  function objectNames(list) {
    const M = new Map();
    const put = (k, s) => { if (k && !M.has(k)) M.set(k, s); };
    for (const s of list) put(s.name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.name) ? s.name : null, s);
    for (const s of list) if (s.type === 'coord') put(s.tikzName, s);
    for (const s of list) if (s.tex && s.tex.i === 0 && s.tex.nm) for (const n of s.tex.nm) put(n, s);
    return M;
  }
  function objValue(s, path, geom, PX) {
    // the shape's own outline (not the line width or a label), as TikZ anchors a path's box
    let b;
    try {
      const P = TD.TYPES[s.type].samples(s);
      const xs = P.map((p) => p.x), ys = P.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys);
      b = P.length ? { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } : TD.bbox(s);
    } catch (e) { b = TD.bbox(s); }
    const G = geom[s.type] || [];
    const pt = (u, v) => ({ x: (b.x + u * b.w) / PX, y: -(b.y + (1 - v) * b.h) / PX });
    const ref = s.type === 'coord' ? { x: s.x / PX, y: -s.y / PX } : pt(0.5, 0.5);
    if (!path.length) return ref;
    const [k, c, ...more] = path;
    if (more.length) throw new Error(`${path.join('.')}: too many parts`);
    const comp = (p) => { if (!c) return p; if (c === 'x' || c === 'y') return p[c]; throw new Error(`.${c}: a point has .x and .y`); };
    const g = G.find((q) => q[0] === k);
    if (g && !c) return toUnit(s[k] ?? 0, g[1], PX);
    if (k === 'x' || k === 'y') { if (c) throw new Error(`${k}.${c}?`); return ref[k]; }
    if (k === 'width' || k === 'height') { if (c) throw new Error(`${k}.${c}?`); return (k === 'width' ? b.w : b.h) / PX; }
    const a = anchorOf(k);
    if (a) return comp(s.type === 'coord' ? ref : pt(a[0], a[1]));
    throw new Error(`${k}: not a field or anchor of this object`);
  }

  function solve(list, vars, geom) {
    const PX = TD.PX_PER_CM, errs = new Map();
    const objs = objectNames(list);
    // variables, each once, in the order they need each other
    const V = new Map(), busy = new Set(), src = new Map(Object.entries(vars || {}));
    function varValue(n) {
      if (V.has(n)) { const v = V.get(n); if (v instanceof Error) throw new Error(`${n} has an error`); return v; }
      if (busy.has(n)) throw new Error(`${n} depends on itself`);
      busy.add(n);
      let v;
      try { v = evaluate(parse(src.get(n)), (r) => lookup(r, true)); if (typeof v === 'number' && !isFinite(v)) throw new Error('not a number'); }
      catch (e) { v = e; errs.set('var:' + n, e.message); }
      busy.delete(n); V.set(n, v);
      if (v instanceof Error) throw new Error(`${n} has an error`);
      return v;
    }
    function lookup(r, inVar) {
      const [n, ...path] = r;
      if (src.has(n)) { if (path.length) throw new Error(`${n} is a variable (no .${path.join('.')})`); return varValue(n); }
      if (!path.length && n in CONST) return CONST[n];
      const s = objs.get(n);
      if (s) { if (inVar) throw new Error('a variable can’t use an object; give the object an expression instead'); return objValue(s, path, geom, PX); }
      throw new Error(`nothing called ${n}`);
    }
    for (const n of src.keys()) { try { varValue(n); } catch (e) { /* recorded */ } }
    errs.vals = V;
    // fields, passed over until nothing changes (an object can depend on another that depends on a third)
    const bound = list.filter((s) => s.ex && Object.keys(s.ex).length);
    if (!bound.length) return errs;
    const P = new Map();
    for (const s of bound) for (const [f, x] of Object.entries(s.ex)) { try { P.set(s.id + ':' + f, parse(x)); } catch (e) { errs.set(s.id + ':' + f, e.message); } }
    let changed = true, pass = 0;
    const max = bound.length + 2;
    for (; changed && pass < max; pass++) {
      changed = false;
      for (const s of bound) {
        const G = geom[s.type] || [];
        for (const f of Object.keys(s.ex)) {
          const key = s.id + ':' + f, ast = P.get(key), g = G.find((q) => q[0] === f);
          if (!ast) continue;
          if (!g) { errs.set(key, 'not a field of this object'); continue; }
          let v;
          try {
            v = evaluate(ast, (r) => { if (r[0] === s.name && objs.get(r[0]) === s) throw new Error('an object can’t use itself'); return lookup(r, false); });
            if (isPt(v)) throw new Error('a point: use .x or .y');
            if (!isFinite(v)) throw new Error('not a number');
          } catch (e) { errs.set(key, e.message); continue; }
          errs.delete(key);
          const want = fromUnit(v, g[1], PX), cur = s[f] ?? 0;
          s._ev = s._ev || {};
          if (Math.abs(cur - want) < 1e-6) { s._ev[f] = cur; continue; }
          // changed by hand since it was last set: the expression lets go
          if (pass === 0 && f in s._ev && Math.abs(cur - s._ev[f]) > 1e-6) { delete s.ex[f]; delete s._ev[f]; continue; }
          s[f] = want; s._ev[f] = want; changed = true;
          if (s.type === 'arc' && f === 'a2' && s.a2 <= s.a1) { s.a2 += 360; s._ev[f] = s.a2; }
        }
        if (!Object.keys(s.ex).length) { delete s.ex; delete s._ev; }
      }
    }
    if (changed) for (const s of bound) if (s.ex) for (const f of Object.keys(s.ex)) if (!errs.has(s.id + ':' + f)) errs.set(s.id + ':' + f, 'these expressions depend on each other in a circle');
    return errs;
  }
  // a variable name: a letter or _, then letters, digits or _, and not a function or constant
  const okName = (n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !FN[n] && !PFN[n] && !(n in CONST);
  TD.params = { parse, names, evaluate, solve, objectNames, okName, anchors: Object.keys(ANCHOR) };
})();
