// Bloch sphere block: the code of a blochsphere environment is the object. It is read here and drawn
// with the package's own geometry (its projection, its circle planes and how each splits into a back
// and a front half, its shaded ball, its dotted state vectors), and exported as written.
(function () {
  const TD = window.TD;
  const { esc, r2 } = TD.util;
  const PX = TD.PX_PER_CM, PT = 1 / TD.PT_PER_PX;
  const D2R = Math.PI / 180;
  const sin = (a) => Math.sin(a * D2R), cos = (a) => Math.cos(a * D2R);

  TD.BLOCH_DEFAULT = `\\begin{blochsphere}[radius=1.5cm, tilt=15, rotation=-20]
  \\drawBallGrid[style={opacity=0.3}]{30}{30}
  \\drawAxis[scale=1.3, axisarrow={->}]{0}{0}
  \\labelPolar[scale=1.45]{z}{0}{0}
  \\node at (z) {$z$};
  \\drawStatePolar{psi}{50}{70}
  \\node[above right] at (psi) {$\\psi$};
\\end{blochsphere}`;

  // ---------------------------------------------------------------- reading the code
  // commands of the package and how many {} arguments each takes
  const ARITY = {
    drawBall: 0, drawBallGrid: 2, drawCircle: 2, drawGreatCircle: 2, drawSmallCircle: 3, drawLatitudeCircle: 1, drawLongitudeCircle: 1,
    drawRotationLeft: 4, drawRotationRight: 4, drawAxis: 2, labelPolar: 3, labelLatLon: 3, drawStatePolar: 3, drawStateLatLon: 3,
  };
  const TIKZ = new Set(['node', 'draw', 'path', 'fill', 'coordinate', 'filldraw']);
  // the bracket closing the one at s[i]
  function close(s, i, open, shut) {
    let d = 0;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (ch === '\\') { j++; continue; }
      if (ch === open) d++;
      else if (ch === shut && --d === 0) return j;
    }
    return -1;
  }
  // split at top-level commas
  function split(s, sep = ',') {
    const out = [];
    let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '{' || ch === '[' || ch === '(') d++;
      else if (ch === '}' || ch === ']' || ch === ')') d--;
      if (ch === sep && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  const unbrace = (v) => { v = String(v).trim(); while (v[0] === '{' && close(v, 0, '{', '}') === v.length - 1) v = v.slice(1, -1).trim(); return v; };
  // key=value options as [[key, value]], in order
  const keyvals = (s) => split(s || '').map((x) => { const i = x.indexOf('='); return i < 0 ? [x.trim(), null] : [x.slice(0, i).trim(), unbrace(x.slice(i + 1))]; });
  const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');

  function unwrap(src) {
    const t = stripComments(String(src || ''));
    const m = /\\begin\{blochsphere\}\s*/.exec(t);
    if (!m) return { env: '', body: t, envAt: -1 };
    let i = m.index + m[0].length, env = '', envAt = -1;
    if (t[i] === '[') { const j = close(t, i, '[', ']'); if (j > 0) { env = t.slice(i + 1, j); envAt = i; i = j + 1; } }
    const e = t.indexOf('\\end{blochsphere}', i);
    return { env, body: t.slice(i, e < 0 ? t.length : e), envAt };
  }
  // the body as commands: { name, opt, args, text (TikZ commands: everything up to the ;) }
  function commands(body, warn) {
    const out = [];
    let i = 0;
    const ws = () => { while (i < body.length && /[\s;]/.test(body[i])) i++; };
    while (i < body.length) {
      ws();
      if (i >= body.length) break;
      if (body[i] !== '\\') {
        const j = body.indexOf('\\', i);
        warn(`Skipped “${body.slice(i, j < 0 ? undefined : j).trim().slice(0, 30)}”`);
        i = j < 0 ? body.length : j;
        continue;
      }
      const m = /^\\([a-zA-Z@]+)\*?/.exec(body.slice(i));
      if (!m) { i++; continue; }
      const name = m[1];
      i += m[0].length;
      if (TIKZ.has(name)) {
        let j = i, d = 0;
        for (; j < body.length; j++) {
          const ch = body[j];
          if (ch === '\\') { j++; continue; }
          if ('{[('.includes(ch)) d++;
          else if ('}])'.includes(ch)) d--;
          else if (ch === ';' && d <= 0) break;
        }
        out.push({ name, text: body.slice(i, j).trim() });
        i = j + 1;
        continue;
      }
      // optional [..], then {..} arguments
      const sp = () => { while (i < body.length && /\s/.test(body[i])) i++; };
      sp();
      let opt = '';
      if (body[i] === '[') { const j = close(body, i, '[', ']'); if (j < 0) break; opt = body.slice(i + 1, j); i = j + 1; }
      const args = [];
      const n = ARITY[name];
      while (n == null ? body[(sp(), i)] === '{' : args.length < n) {
        sp();
        if (body[i] !== '{') break;
        const j = close(body, i, '{', '}');
        if (j < 0) { i = body.length; break; }
        args.push(body.slice(i + 1, j));
        i = j + 1;
      }
      if (n == null) { if (!/^(tikzset|tiny|scriptsize|footnotesize|small|normalsize|large|relax|par)$/.test(name)) warn(`\\${name} is not drawn in the preview`); continue; }
      if (args.length < n) { warn(`\\${name} needs ${n} arguments`); continue; }
      out.push({ name, opt, args });
    }
    return out;
  }
  const num = (v, d = 0) => { const x = TD.evalNumber ? TD.evalNumber(String(v).trim(), NaN) : parseFloat(v); return isFinite(x) ? x : d; };
  const UNITS = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, em: 10, ex: 4.31 };
  // a length in pt; plain numbers are pt (pgfmath), or cm where TikZ reads them as coordinates
  function lengthPt(v, unitless = 'pt') {
    const m = /^\s*(-?[\d.]+)\s*([a-z]{2})?\s*$/.exec(String(v));
    if (m) return parseFloat(m[1]) * (m[2] ? UNITS[m[2]] || 1 : UNITS[unitless]);
    return num(v, 0) * UNITS[unitless];
  }

  // ---------------------------------------------------------------- options
  const DEF = { radius: '1cm', tilt: 15, rotation: -20, color: 'white', opacity: 0.7, style: '', scale: 1, shift: [0, 0, 0], ball: '3d', statecolor: 'black', statewidth: '0.4pt', axisarrow: '', labelmark: false };
  function setkeys(o, s, warn) {
    const r = { ...o };
    for (const [k, v] of keyvals(s)) {
      if (!k) continue;
      if (k === 'shift') r.shift = split(unbrace(v || '')).map((x) => num(x));
      else if (k === 'labelmark' || k === 'nested') r[k] = v == null || v === 'true';
      else if (k in DEF) r[k] = v == null ? '' : v;
      else warn(`Unknown blochsphere option “${k}”`);
    }
    return r;
  }
  const WIDTHS = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
  // a TikZ style: stroke, width (pt), dash, opacity, arrows, layer; and for nodes, where and how big
  function tikzStyle(list, base = {}) {
    const st = { color: null, lw: 0.4, dash: null, opacity: 1, start: '', end: '', layer: null, fill: null, ...base };
    for (const it of split(list || '')) {
      const i = it.indexOf('='), k = (i < 0 ? it : it.slice(0, i)).trim(), v = i < 0 ? null : unbrace(it.slice(i + 1));
      if (!k) continue;
      if (k in WIDTHS && v == null) st.lw = WIDTHS[k];
      else if (k === 'line width') st.lw = lengthPt(v);
      else if (/^(densely |loosely )?(dashed|dotted)$/.test(k)) st.dash = k;
      else if (k === 'solid') st.dash = null;
      else if (k === 'opacity' || k === 'draw opacity') st.opacity = num(v, 1);
      else if (k === 'on layer') st.layer = v;
      else if (k === 'color' || k === 'draw' || k === 'text') { const c = TD.tikzColor && TD.tikzColor(v); if (c) st[k === 'text' ? 'text' : 'color'] = c; }
      else if (k === 'fill') { const c = TD.tikzColor && TD.tikzColor(v); if (c) st.fill = c; }
      else if (/^(<|>|-|\||latex|stealth|to)*-(>|<|\||latex|stealth|to)*$|^<?-?>$|^<-$/.test(k) && v == null) {
        const [a, b] = k.split('-');
        st.start = a || ''; st.end = b || '';
      } else if (/^(above|below|left|right)( (left|right))?$/.test(k)) { st.pos = k; if (v) st.posBy = lengthPt(v, 'cm'); }
      else if (k === 'anchor') st.anchor = v;
      else if (k === 'scale') st.scale = num(v, 1);
      else if (k === 'font') st.font = v;
      else if (k === 'inner sep') st.inner = lengthPt(v);
      else if (k === 'outer sep') st.outer = lengthPt(v);
      else if (/^(mark coordinate|current plane|test)$/.test(k)) { /* the package's own */ }
      else if (v == null && TD.tikzColor && TD.tikzColor(k)) st.color = TD.tikzColor(k);
    }
    return st;
  }

  // ---------------------------------------------------------------- geometry
  // The package's projection (TikZ coordinates, y up, pt): its computeOffset.
  function projector(o) {
    const T = num(o.tilt, 15), Rt = num(o.rotation, -20);
    const P = (x, y, z) => ({ x: x * cos(Rt) + y * sin(Rt), y: x * sin(Rt) * sin(T) - y * sin(T) * cos(Rt) + z * cos(T) });
    // the direction toward the viewer: a point p is in front when p·w ≥ 0 (the package's "behind" test)
    const w = [-sin(Rt) * cos(T), cos(Rt) * cos(T), sin(T)];
    return { P, w, T, Rt };
  }
  const polar = (phi, th) => [sin(phi) * cos(th), sin(phi) * sin(th), cos(phi)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // the plane of setDrawingPlane{phi}{theta}: normal n and the in-plane axes u, v its angles are measured on
  const plane = (phi, th) => ({ n: polar(phi, th), u: [sin(th), -cos(th), 0], v: [-cos(phi) * cos(th), -cos(phi) * sin(th), sin(phi)] });

  // A circle of radius rho in the plane (phi, theta), its centre moved by shift: a back arc and a front arc
  // (computeVisibility), split where the sphere of radius rVis turns away. Arcs in plane angles (degrees).
  function circleArcs(J, phi, th, rho, shift, rVis) {
    const { n, u, v } = plane(phi, th), w = J.w;
    const d = dot(shift, n); // signed distance of the centre along the normal
    const A = d * dot(n, w), B = rVis * dot(u, w), C = rVis * dot(v, w), K = Math.hypot(B, C);
    let gamma, beta;
    if (K < 1e-9) { gamma = 0; beta = A >= 0 ? 0 : 180; } else {
      const delta = Math.atan2(C, B) / D2R, psi = Math.acos(Math.max(-1, Math.min(1, -A / K))) / D2R;
      gamma = delta + 180; beta = 180 - psi;
    }
    return { gamma, beta, n, u, v, rho, shift };
  }
  // a point of such a circle, in TikZ coordinates
  const circlePt = (J, c, t) => { const ct = cos(t), st = sin(t); return J.P(c.shift[0] + c.rho * (c.u[0] * ct + c.v[0] * st), c.shift[1] + c.rho * (c.u[1] * ct + c.v[1] * st), c.shift[2] + c.rho * (c.u[2] * ct + c.v[2] * st)); };
  // an arc as cubic Béziers (a circle's image is an ellipse: the affine image of circular arcs is exact)
  function arcPath(J, c, t0, t1) {
    const segs = Math.max(1, Math.ceil(Math.abs(t1 - t0) / 45));
    const h = (t1 - t0) / segs, k = (4 / 3) * Math.tan((h * D2R) / 4);
    const O = J.P(...c.shift), U = J.P(...c.u), V = J.P(...c.v);
    const M = (x, y) => ({ x: O.x + c.rho * (x * U.x + y * V.x), y: O.y + c.rho * (x * U.y + y * V.y) });
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = t0 + i * h, b = a + h;
      const p0 = [cos(a), sin(a)], p3 = [cos(b), sin(b)];
      const p1 = [p0[0] - k * sin(a), p0[1] + k * cos(a)], p2 = [p3[0] + k * sin(b), p3[1] - k * cos(b)];
      if (!i) pts.push(M(...p0));
      pts.push(M(...p1), M(...p2), M(...p3));
    }
    return pts;
  }

  // ---------------------------------------------------------------- layout
  const SIZES = { tiny: 5, scriptsize: 7, footnotesize: 8, small: 9, normalsize: 10, large: 12, Large: 14.4, LARGE: 17.28, huge: 20.74, Huge: 24.88 };
  const HK = 0.74;
  const cache = new Map();
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };
  function layout(s) {
    const key = [s.src, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s);
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  function build(s) {
    const warnings = [];
    const warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const { env, body } = unwrap(s.src);
    const E = setkeys(DEF, env, warn);
    const J = projector(E);
    const R0 = lengthPt(E.radius);
    const layers = { back: [], main: [], front: [] };
    const names = {}; // named coordinates (TikZ coordinates, pt)
    const add = (layer, item) => layers[layer || 'main'].push(item);
    // the ball
    const ball = (o) => {
      const R = lengthPt(o.radius);
      if (o.ball === '3d') add('main', { k: 'ball', R, color: TD.tikzColor(o.color) || '#ffffff', opacity: num(o.opacity, 0.7) });
      else if (o.ball === 'circle') add('main', { k: 'path', circle: R, st: { color: TD.tikzColor(o.color) || '#ffffff', lw: 0.4 } });
    };
    ball(E);
    // circles: the back arc on the back layer, the front one on the front layer (each a little longer)
    const circle = (o, phi, th, rho, shift, rVis, ends) => {
      const st = tikzStyle(o.style);
      const c = circleArcs(J, phi, th, rho, shift, rVis);
      if (c.beta > 0) add('back', { k: 'path', pts: arcPath(J, c, c.gamma - c.beta - 0.2, c.gamma + c.beta + 0.2), st });
      if (c.beta < 180) {
        let t0 = c.gamma + c.beta, t1 = c.gamma - c.beta + 360;
        const st2 = { ...st };
        if (ends) { if (ends.left) { t0 += ends.clear; st2.start = '<'; } else { t1 -= ends.clear; st2.end = '>'; } }
        if (t1 > t0) add('front', { k: 'path', pts: arcPath(J, c, t0, t1), st: st2, c, t0, t1 });
      }
    };
    const R = (o) => lengthPt(o.radius);
    const label = (o, name, phi, th) => {
      const r = R(o) * num(o.scale, 1), p = polar(phi, th);
      const q = J.P(p[0] * r, p[1] * r, p[2] * r);
      names[name] = q;
      if (o.labelmark) add(dot(p, J.w) < 0 ? 'back' : 'front', { k: 'mark', x: q.x, y: q.y });
      return q;
    };
    const state = (o, name, phi, th) => {
      const q = label({ ...o, scale: 1, labelmark: false }, name, phi, th);
      const behind = dot(polar(phi, th), J.w) < 0;
      add('main', { k: 'state', x: q.x, y: q.y, behind, color: TD.tikzColor(o.statecolor) || '#000000', sw: lengthPt(o.statewidth) });
    };
    for (const c of commands(body, warn)) {
      if (TIKZ.has(c.name)) { tikzCmd(c, names, add, warn); continue; }
      const o = setkeys(E, c.opt, warn), a = c.args.map((x) => num(x));
      switch (c.name) {
        case 'drawBall': ball(o); break;
        case 'drawBallGrid': {
          const r = R(o);
          const steps = (sep, max) => { const out = []; if (!(sep > 0)) return [0]; for (let x = 0; x <= max + 1e-9; x += sep) out.push(x); return out; };
          for (const p of steps(a[0], 89)) for (const q of [p, -p]) circle(o, 0, 0, r * cos(q), [0, 0, r * sin(q)], r * cos(q));
          for (const t of steps(a[1], 179)) circle(o, 90, t + 90, r, [0, 0, 0], r);
          break;
        }
        case 'drawCircle': case 'drawGreatCircle': circle(o, a[0], a[1], R(o), o.shift, R(o)); break;
        case 'drawSmallCircle': {
          const r = R(o), n = polar(a[0], a[1]), k = r * sin(a[2]);
          circle(o, a[0], a[1], r * cos(a[2]), [n[0] * k, n[1] * k, n[2] * k], r * cos(a[2]));
          break;
        }
        case 'drawLatitudeCircle': { const r = R(o); circle(o, 0, 0, r * cos(a[0]), [0, 0, r * sin(a[0])], r * cos(a[0])); break; }
        case 'drawLongitudeCircle': circle(o, 90, a[0] + 90, R(o), [0, 0, 0], R(o)); break;
        case 'drawRotationLeft': case 'drawRotationRight': {
          const n = polar(a[0], a[1]);
          circle(o, a[0], a[1], R(o) * num(o.scale, 1), [n[0] * a[2], n[1] * a[2], n[2] * a[2]], R(o), { left: c.name === 'drawRotationLeft', clear: a[3] });
          break;
        }
        case 'drawAxis': {
          const [phi, th] = a, behind = dot(polar(phi, th), J.w) < 0;
          const p1 = behind ? [180 - phi, th + 180] : [phi, th], p2 = behind ? [phi, th] : [180 - phi, th + 180];
          const pp = label({ ...o, scale: 1, labelmark: false }, 'blochspheretmpp', ...p1);
          const ps = label({ ...o, labelmark: false }, 'blochspheretmps', ...(behind ? p2 : p1));
          const pe = label({ ...o, labelmark: false }, 'blochspheretmpe', ...(behind ? p1 : p2));
          const st = tikzStyle(o.style), sa = tikzStyle(o.axisarrow, st);
          if (!behind) { add('front', { k: 'path', pts: [pp, ps], line: true, st: sa }); add('back', { k: 'path', pts: [pe, pp], line: true, st }); }
          else { add('front', { k: 'path', pts: [pp, pe], line: true, st: sa }); add('back', { k: 'path', pts: [ps, pp], line: true, st }); }
          break;
        }
        case 'labelPolar': label(o, unbrace(c.args[0]), a[1], a[2]); break;
        case 'labelLatLon': label(o, unbrace(c.args[0]), 90 - a[1], a[2]); break;
        case 'drawStatePolar': state(o, unbrace(c.args[0]), a[1], a[2]); break;
        case 'drawStateLatLon': state(o, unbrace(c.args[0]), 90 - a[1], a[2]); break;
      }
    }
    // to the renderer's px, y down; and the bounding box (TikZ's, from the curves' control points)
    const items = [];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const grow = (x, y, m = 0) => { x1 = Math.min(x1, x - m); x2 = Math.max(x2, x + m); y1 = Math.min(y1, y - m); y2 = Math.max(y2, y + m); };
    const tp = (q) => ({ x: q.x * PT, y: -q.y * PT });
    for (const layer of ['back', 'main', 'front']) {
      for (const it of layers[layer]) {
        if (it.k === 'ball') { const r = it.R * PT; grow(-r, -r); grow(r, r); items.push({ ...it, R: r }); }
        else if (it.k === 'path' && it.circle) { const r = it.circle * PT, w = it.st.lw * PT; grow(-r, -r, w / 2); grow(r, r, w / 2); items.push({ ...it, circle: r }); }
        else if (it.k === 'path') { const pts = it.pts.map(tp); for (const p of pts) grow(p.x, p.y, (it.st.lw * PT) / 2); items.push({ ...it, pts }); }
        else if (it.k === 'node') {
          const p = tp(it), b = it.box;
          grow(p.x - b.w / 2 + it.dx, p.y - b.h / 2 + it.dy); grow(p.x + b.w / 2 + it.dx, p.y + b.h / 2 + it.dy);
          items.push({ ...it, x: p.x + it.dx, y: p.y + it.dy });
        } else { const p = tp(it); grow(p.x, p.y, it.k === 'mark' ? 1.5 * PT : 0); items.push({ ...it, x: p.x, y: p.y }); }
      }
    }
    if (!isFinite(x1)) { const r = R0 * PT; x1 = -r; y1 = -r; x2 = r; y2 = r; }
    return { items, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, warnings, R: R0 * PT, opts: E };
  }
  // \node, \draw, \path … inside the environment: nodes at named or (x,y) coordinates, and straight paths
  function tikzCmd(c, names, add, warn) {
    let t = c.text, opt = '';
    const coord = (s) => {
      const m = /^\(\s*([^()]*?)\s*\)$/.exec(s.trim());
      if (!m) return null;
      const v = m[1];
      if (v.includes(',')) { const [x, y] = split(v); return { x: lengthPt(x, 'cm'), y: lengthPt(y, 'cm') }; }
      const nm = v.replace(/\.(center|north|south|east|west)$/, '');
      if (names[nm]) return names[nm];
      warn(`No coordinate named “${nm}”`);
      return null;
    };
    if (t[0] === '[') { const j = close(t, 0, '[', ']'); opt = t.slice(1, j); t = t.slice(j + 1).trim(); }
    if (c.name === 'node' || c.name === 'coordinate') {
      let name = null, at = null, text = '';
      const m1 = /^\(([^()]*)\)\s*/.exec(t);
      if (m1 && !/^at\b/.test(t)) { name = m1[1].trim(); t = t.slice(m1[0].length); }
      const m2 = /^at\s*(\([^()]*\))\s*/.exec(t);
      if (m2) { at = coord(m2[1]); t = t.slice(m2[0].length); } else at = { x: 0, y: 0 };
      if (t[0] === '{') { const j = close(t, 0, '{', '}'); text = t.slice(1, j); }
      if (!at) return;
      if (name) names[name] = at;
      if (c.name === 'coordinate' || !text.trim()) return;
      const st = tikzStyle(opt);
      // the font: \tiny … from the options or the start of the text
      let size = 10, tx = unbrace(text);
      const sz = /\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b\s*/;
      const f = sz.exec(st.font || '');
      if (f) size = SIZES[f[1]];
      let m;
      while ((m = /^\{?\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b\s*/.exec(tx))) { size = SIZES[m[1]]; tx = tx.slice(m[0].length); if (tx.endsWith('}') && m[0][0] === '{') tx = tx.slice(0, -1); tx = tx.trim(); }
      size *= st.scale || 1;
      const tb = TD.textBox(tx, { size: size * PT, font: 'default' });
      const inner = st.inner != null ? st.inner : 0, outer = st.outer != null ? st.outer : 2;
      const box = { w: tb.w - 2 + 2 * inner * PT, h: HK * tb.h + 2 * inner * PT };
      // the anchor that sits on the point: above = south, …; outer sep pushes the border out
      const pos = st.pos || ({ south: 'above', north: 'below', east: 'left', west: 'right', 'south west': 'above right', 'south east': 'above left', 'north west': 'below right', 'north east': 'below left' })[st.anchor] || '';
      const by = ((st.posBy || 0) + outer) * PT;
      let dx = 0, dy = 0;
      if (/above/.test(pos)) dy = -(box.h / 2 + by);
      if (/below/.test(pos)) dy = box.h / 2 + by;
      if (/right/.test(pos)) dx = box.w / 2 + by;
      if (/left/.test(pos)) dx = -(box.w / 2 + by);
      add(st.layer, { k: 'node', x: at.x, y: at.y, dx, dy, box, text: tx, size: size * PT, color: st.text || st.color || '#000000' });
      return;
    }
    // a path: points joined by -- (or to)
    const parts = t.split(/\s*(?:--|\bto\b)\s*/);
    const pts = parts.map(coord);
    if (pts.some((p) => !p) || pts.length < 2) { if (c.name !== 'path') warn(`\\${c.name} ${t.slice(0, 24)}… is not drawn in the preview`); return; }
    if (c.name === 'path') return;
    const st = tikzStyle(opt);
    add(st.layer, { k: 'path', pts, line: true, st });
  }

  // ---------------------------------------------------------------- drawing
  const DASH = { dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], dotted: [0, 2], 'densely dotted': [0, 1], 'loosely dotted': [0, 4] };
  const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, p) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join(''); };
  function pathSvg(it, ink) {
    const st = it.st, col = TD.css(st.color || ink), w = st.lw * PT;
    let pts = it.pts.slice();
    let tips = '';
    // blochsphere's arrowheads measure about 4.3pt long at 0.4pt lines: a 'latex' tip of 0.72 of the line width
    const tipAt = (P, u) => { const t = TD.tip('latex', P, u, w * 0.72, col); tips += t.svg; return t.back; };
    // arrow tips: the path ends at the tip's back
    if (it.line && pts.length >= 2) {
      const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
      if (st.end) { const n = pts.length, u = unit(pts[n - 2], pts[n - 1]), bk = tipAt(pts[n - 1], u); pts[n - 1] = { x: pts[n - 1].x - u.x * bk, y: pts[n - 1].y - u.y * bk }; }
      if (st.start) { const u = unit(pts[1], pts[0]), bk = tipAt(pts[0], u); pts[0] = { x: pts[0].x - u.x * bk, y: pts[0].y - u.y * bk }; }
    }
    let d = '';
    if (it.line) d = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)},${r2(p.y)}`).join('');
    else {
      // Béziers: tips on arcs point along the curve's end tangent; the curve is cut back by re-sampling its arc
      if ((st.start || st.end) && it.c) {
        const sp = (t) => { const a = it.c, P = (tt) => { const q = circlePt(it.J, a, tt); return { x: q.x * PT, y: -q.y * PT }; }; return P(t); };
        let t0 = it.t0, t1 = it.t1;
        const speed = (t) => { const a = sp(t - 0.5), b = sp(t + 0.5); return Math.hypot(b.x - a.x, b.y - a.y) / D2R; };
        if (st.start) { const P = sp(t0), Q = sp(t0 + 0.5), l = Math.hypot(P.x - Q.x, P.y - Q.y) || 1, bk = tipAt(P, { x: (P.x - Q.x) / l, y: (P.y - Q.y) / l }); t0 += bk / speed(t0) / D2R; }
        if (st.end) { const P = sp(t1), Q = sp(t1 - 0.5), l = Math.hypot(P.x - Q.x, P.y - Q.y) || 1, bk = tipAt(P, { x: (P.x - Q.x) / l, y: (P.y - Q.y) / l }); t1 -= bk / speed(t1) / D2R; }
        pts = arcPath(it.J, it.c, t0, t1).map((q) => ({ x: q.x * PT, y: -q.y * PT }));
      }
      d = `M${r2(pts[0].x)},${r2(pts[0].y)}`;
      for (let i = 1; i + 2 < pts.length; i += 3) d += `C${r2(pts[i].x)},${r2(pts[i].y)} ${r2(pts[i + 1].x)},${r2(pts[i + 1].y)} ${r2(pts[i + 2].x)},${r2(pts[i + 2].y)}`;
    }
    const da = st.dash && DASH[st.dash] ? ` stroke-dasharray="${DASH[st.dash].map((v, i) => r2(((i === 0 && /dotted/.test(st.dash) ? st.lw : v)) * PT)).join(' ')}"` : '';
    const body = `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(w)}"${da}/>` + tips;
    return st.opacity < 1 ? `<g opacity="${st.opacity}">${body}</g>` : body;
  }
  function draw(s, ctx) {
    const L = layout(s), ink = '#000000'; // colours come from the code only, as in LaTeX
    const J = projector(L.opts);
    const gid = `bloch-${(s.id || 'x').replace(/[^\w-]/g, '')}${ctx.export ? 'e' : ''}`;
    let out = '';
    for (const it of L.items) {
      if (it.k === 'ball') {
        // the package's ball shading as pdflatex renders it, measured: from 70% of the colour around the
        // highlight (up and to the left) down to 26% at the far rim
        const c = it.color, g = [[0, 0.7], [0.35, 0.67], [0.48, 0.63], [0.63, 0.51], [0.78, 0.4], [0.92, 0.3], [1, 0.26]];
        out += `<defs><radialGradient id="${gid}" cx="0.4" cy="0.4" r="0.65" gradientUnits="objectBoundingBox">` +
          g.map(([o, v]) => `<stop offset="${o}" stop-color="${mix(c, '#000000', v)}"/>`).join('') + '</radialGradient></defs>';
        out += `<circle cx="0" cy="0" r="${r2(it.R)}" fill="url(#${gid})" opacity="${it.opacity}"/>`;
      } else if (it.k === 'path' && it.circle) {
        out += `<circle cx="0" cy="0" r="${r2(it.circle)}" fill="none" stroke="${TD.css(it.st.color)}" stroke-width="${r2(it.st.lw * PT)}"/>`;
      } else if (it.k === 'path') out += pathSvg({ ...it, J }, ink);
      else if (it.k === 'mark') out += `<circle cx="${r2(it.x)}" cy="${r2(it.y)}" r="${r2(1.5 * PT)}" fill="#000000"/>`;
      else if (it.k === 'state') {
        // dots every 0.5pt up to 5pt short of the end, fading in (or out, behind), then the arrowhead
        const len = Math.hypot(it.x, it.y), lpt = len / PT;
        if (lpt < 1e-6) continue;
        const u = { x: it.x / len, y: it.y / len }, r = r2(it.sw * PT), col = TD.css(it.color);
        let dots = '';
        for (let dd = 0; dd <= lpt - 5 + 1e-9; dd += 0.5) {
          const m = dd / lpt, a = it.behind ? 0.4 - m * 0.2 : 0.4 + m * 0.6;
          dots += `<circle cx="${r2(u.x * dd * PT)}" cy="${r2(u.y * dd * PT)}" r="${r}" fill-opacity="${r2(a)}"/>`;
        }
        const P = { x: u.x * (lpt - 0.5) * PT, y: u.y * (lpt - 0.5) * PT };
        const t = TD.tip('latex', P, u, it.sw * PT * 0.55, col); // 4pt long, as pdflatex draws it
        out += `<g fill="${col}">${dots}</g>` + (it.behind ? `<g opacity="0.2">${t.svg}</g>` : t.svg);
      } else if (it.k === 'node') out += TD.textSvg(it.text, { size: it.size, font: 'default' }, it.color, it.x, it.y, ctx);
    }
    const bb = L.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\begin\{blochsphere\}/.test(t) ? t : `\\begin{blochsphere}\n${t}\n\\end{blochsphere}`;
  }
  // a small picture of a sphere for menus
  TD.blochMini = (src, maxH = 40) => {
    const s = { type: 'bloch', x: 0, y: 0, src, id: 'mini' };
    const L = layout(s), b = L.bb, k = Math.min(1, maxH / b.h);
    return `<svg class="zxmini" viewBox="0 0 ${r2(b.w)} ${r2(b.h)}" width="${r2(b.w * k)}" height="${r2(b.h * k)}">${draw(s, { export: true })}</svg>`;
  };

  // ---------------------------------------------------------------- editing the code from the panel
  // the environment's options, one key rewritten (null drops it)
  function setEnvKey(src, key, value) {
    const t = String(src || '');
    const m = /\\begin\{blochsphere\}\s*(\[)?/.exec(t);
    if (!m) return t;
    let a = m.index + m[0].length, b = a, list = [];
    if (m[1]) { const j = close(t, a - 1, '[', ']'); if (j > 0) { list = split(t.slice(a, j)); b = j; a -= 1; b += 1; } }
    else a = b = m.index + '\\begin{blochsphere}'.length;
    const i = list.findIndex((x) => x.split('=')[0].trim() === key);
    const item = value == null || value === '' ? null : `${key}=${value}`;
    if (i >= 0) { if (item) list[i] = item; else list.splice(i, 1); } else if (item) list.push(item);
    return t.slice(0, a) + (list.length ? `[${list.join(', ')}]` : '') + t.slice(b);
  }
  // ---- colours. The package takes colour names (and xcolor mixes such as red!60!black), not hex: statecolor
  // goes straight into \arrow[…]. Ball → color, lines → style (the environment's and each drawing command's
  // own, which replaces it), states → statecolor, labels → each \node.
  const CNAMES = ['black', 'darkgray', 'gray', 'lightgray', 'white', 'red', 'orange', 'yellow', 'lime', 'green', 'olive', 'teal', 'cyan', 'blue', 'violet', 'purple', 'magenta', 'pink', 'brown'];
  const itemKey = (it) => { const i = it.indexOf('='); return (i < 0 ? it : it.slice(0, i)).trim(); };
  const isColorItem = (it) => { const i = it.indexOf('='), k = itemKey(it); return i < 0 ? !!(TD.tikzColor && TD.tikzColor(k)) : /^(color|text|draw)$/.test(k); };
  const colorOfList = (list) => { const it = list.find(isColorItem); if (!it) return ''; const i = it.indexOf('='); return unbrace(i < 0 ? it : it.slice(i + 1)); };
  const recolor = (list, c, dflt) => { const l = list.filter((x) => !isColorItem(x)); if (c && c !== dflt) l.unshift(c); return l; };
  // rewrite the option list of every command matching re (its [ is the match's end); a command with none gets one if add says so
  function eachOpts(t, re, fn, add) {
    const hits = [];
    let m;
    while ((m = re.exec(t))) hits.push(m);
    for (let k = hits.length - 1; k >= 0; k--) {
      const m = hits[k], at = m.index + m[0].length;
      let o = at;
      while (/\s/.test(t[o] || '')) o++;
      if (t[o] === '[') {
        const at = o;
        const j = close(t, at, '[', ']');
        if (j < 0) continue;
        const l = fn(split(t.slice(at + 1, j)));
        if (l) t = t.slice(0, at) + (l.length ? `[${l.join(', ')}]` : '') + t.slice(j + 1);
        continue;
      }
      if (add) {
        const l = fn([]);
        if (l && l.length) t = t.slice(0, at) + `[${l.join(', ')}]` + t.slice(at);
      }
    }
    return t;
  }
  const styleOf = (list) => { const it = list.find((x) => itemKey(x) === 'style'); return it ? split(unbrace(it.slice(it.indexOf('=') + 1))) : null; };
  const withStyle = (list, st) => { const l = list.filter((x) => itemKey(x) !== 'style'); if (st.length) l.push(`style={${st.join(', ')}}`); return l; };
  function envOpts(t) { const m = /\\begin\{blochsphere\}\s*\[/.exec(t); if (!m) return []; const j = close(t, m.index + m[0].length - 1, '[', ']'); return j < 0 ? [] : split(t.slice(m.index + m[0].length, j)); }
  const CMD_RE = () => /\\(drawBall|drawBallGrid|drawCircle|drawGreatCircle|drawSmallCircle|drawLatitudeCircle|drawLongitudeCircle|drawRotationLeft|drawRotationRight|drawAxis)\s*(?=\[|\{|$)/g;
  function colorsOf(src) {
    const t = String(src || ''), E = envOpts(t), st = styleOf(E) || [];
    const node = /\\node\b\s*\[([^\]]*)\]/.exec(t);
    return {
      ball: E.find((x) => itemKey(x) === 'color') ? colorOfList([E.find((x) => itemKey(x) === 'color')]) : 'white',
      states: E.find((x) => itemKey(x) === 'statecolor') ? unbrace(E.find((x) => itemKey(x) === 'statecolor').split('=').slice(1).join('=')) : 'black',
      lines: colorOfList(st) || 'black',
      labels: (node && colorOfList(split(node[1]))) || 'black',
    };
  }
  function setColor(src, which, c) {
    let t = String(src || '');
    if (which === 'ball') return setEnvKey(t, 'color', c === 'white' ? null : c);
    if (which === 'states') return setEnvKey(t, 'statecolor', c === 'black' ? null : c);
    if (which === 'lines') {
      const st = recolor(styleOf(envOpts(t)) || [], c, 'black');
      t = setEnvKey(t, 'style', st.length ? `{${st.join(', ')}}` : null);
      // a command's own style replaces the environment's, so the colour goes into those too
      return eachOpts(t, CMD_RE(), (l) => { const s2 = styleOf(l); return s2 ? withStyle(l, recolor(s2, c, 'black')) : null; });
    }
    if (which === 'labels') return eachOpts(t, /\\node\b/g, (l) => recolor(l, c, 'black'), true);
    return t;
  }

  // the states drawn, with where their commands sit in the code
  function states(src) {
    const out = [], t = String(src || '');
    const re = /\\drawState(Polar|LatLon)\s*(\[[^\]]*\])?\s*\{([^{}]*)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(t))) {
      const S = { at: m.index, end: m.index + m[0].length, kind: m[1], opt: m[2] || '', name: m[3].trim(), a: m[4].trim(), b: m[5].trim() };
      // as θ from the pole and φ around, whichever command set it
      const a = parseFloat(S.a);
      S.theta = S.kind === 'LatLon' ? (isFinite(a) ? String(r2(90 - a)) : '') : S.a;
      S.phi = S.b;
      S.label = labelOf(t, S.name);
      out.push(S);
    }
    return out;
  }
  // the first \node … at (name) {…}; that writes a state's label: where it is, and its maths
  function labelOf(t, name) {
    const q = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`\\\\node\\s*(\\[[^\\]]*\\])?\\s*at\\s*\\(\\s*${q}\\s*\\)\\s*\\{`).exec(t);
    if (!m) return null;
    let i = m.index + m[0].length, d = 1;
    for (; i < t.length && d; i++) { if (t[i] === '\\') i++; else if (t[i] === '{') d++; else if (t[i] === '}') d--; }
    if (d) return null;
    const bodyAt = m.index + m[0].length, bodyEnd = i - 1, semi = /^\s*;/.exec(t.slice(i));
    const body = t.slice(bodyAt, bodyEnd), mm = /^\s*\$([\s\S]*)\$\s*$/.exec(body);
    return { at: m.index, end: i + (semi ? semi[0].length : 0), bodyAt, bodyEnd, math: mm ? mm[1] : body };
  }
  // src without [a, b), and without the blank line that leaves
  function cut(src, a, b) {
    let s0 = a, e0 = b;
    while (s0 > 0 && (src[s0 - 1] === ' ' || src[s0 - 1] === '\t')) s0--;
    while (e0 < src.length && (src[e0] === ' ' || src[e0] === '\t')) e0++;
    if ((s0 === 0 || src[s0 - 1] === '\n') && src[e0] === '\n') e0++;
    return src.slice(0, s0) + src.slice(e0);
  }
  const stateCode = (S) => `\\drawState${S.kind}${S.opt}{${S.name}}{${S.a}}{${S.b}}`;

  TD.TYPES.bloch = {
    name: 'Bloch sphere',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'bloch', x: p.x, y: p.y, src: TD.BLOCH_DEFAULT }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the environment opens a tikzpicture of its own: it sits in a plain node with the outer picture interrupted
    tikz(s, X) {
      X.pkgs.add('blochsphere');
      const b = layout(s).bb;
      return `\\node[inner sep=0pt] at ${X.c(s.x + b.w / 2, s.y + b.h / 2)} {\\pgfinterruptpicture%\n${fullCode(s.src)}%\n\\endpgfinterruptpicture};`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.bloch = {
    html(s) {
      const L = layout(s), o = L.opts;
      const S = states(s.src);
      const ballOpts = [['3d', 'Shaded'], ['circle', 'Outline'], ['none', 'None']];
      const ballV = ['3d', 'circle'].includes(o.ball) ? o.ball : 'none';
      return `<div class="sec"><div class="sec-title">Bloch sphere</div>
        <div class="row"><label>Radius</label><div class="ctl unit"><input type="number" data-bk="radius" value="${r2(lengthPt(o.radius) / UNITS.cm)}" step="0.1" min="0.1"><span>cm</span></div></div>
        <div class="row"><label>Tilt</label><div class="ctl"><input type="range" data-bk="tilt" min="-90" max="90" step="1" value="${num(o.tilt)}" aria-label="Tilt"><label class="ang" title="Click to type a value"><input type="number" data-bkn="tilt" value="${num(o.tilt)}" step="1" aria-label="Tilt in degrees">°</label></div></div>
        <div class="row"><label>Rotation</label><div class="ctl"><input type="range" data-bk="rotation" min="-180" max="180" step="1" value="${num(o.rotation)}" aria-label="Rotation"><label class="ang" title="Click to type a value"><input type="number" data-bkn="rotation" value="${num(o.rotation)}" step="1" aria-label="Rotation in degrees">°</label></div></div>
        <div class="row"><label>Ball</label><div class="ctl seg-ctl txt">${ballOpts.map(([v, n]) => `<button data-act="ball:${v}" class="${ballV === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        </div>
        <div class="sec"><div class="sec-title">Colours</div>
        ${(() => { const C = colorsOf(s.src); return [['ball', 'Ball'], ['lines', 'Lines'], ['states', 'States'], ['labels', 'Labels']].map(([k, n]) => { const v = C[k], opts = CNAMES.includes(v) ? CNAMES : CNAMES.concat([v]); const sw = (c) => TD.css(TD.tikzColor(c) || '#000000'); return `<div class="row"><label>${n}</label><div class="ctl swsel"><span class="sw" style="background:${sw(v)}"></span><select data-bc="${k}" aria-label="${n} colour">${opts.map((c) => `<option value="${esc(c)}" data-swatch="${sw(c)}"${c === v ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>`; }).join(''); })()}
        </div>
        <div class="sec"><div class="sec-title">States</div>
        ${S.length ? `<div class="bloch-st"><span>Label</span><span>θ</span><span>φ</span><span></span>${S.map((x, i) => `<input type="text" class="mono" data-sl="${i}" value="${esc(x.label ? x.label.math : '')}" placeholder="${esc(x.name)}" spellcheck="false" aria-label="Label of ${esc(x.name)}"><input type="number" data-st="${i}:t" value="${esc(x.theta)}" step="5" title="θ" aria-label="θ"><input type="number" data-st="${i}:p" value="${esc(x.phi)}" step="5" title="φ" aria-label="φ"><button class="flat st-del" data-act="delstate:${i}" title="Delete state" aria-label="Delete ${esc(x.name)}"><svg viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/></svg></button>`).join('')}</div>` : '<div class="help">No states yet.</div>'}
        <button class="wide" data-act="addstate">Add State</button></div>
        <div class="sec"><div class="sec-title">blochsphere</div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="9">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Exported with <code>\\usepackage{blochsphere}</code>.</div>
        <button class="wide" data-act="copybloch">Copy blochsphere Code</button></div>`;
    },
    apply(s, t) {
      if (t.dataset.p === 'src') { s.src = t.value; return false; }
      if (t.dataset.bk || t.dataset.bkn) {
        const k = t.dataset.bk || t.dataset.bkn, v = parseFloat(t.value);
        if (!isFinite(v)) return false;
        s.src = setEnvKey(s.src, k, k === 'radius' ? `${r2(v)}cm` : String(v));
        return true;
      }
      if (t.dataset.bc) { s.src = setColor(s.src, t.dataset.bc, t.value); return true; }
      if (t.dataset.st) {
        const [i, which] = t.dataset.st.split(':'), S = states(s.src)[+i];
        if (!S || !isFinite(parseFloat(t.value))) return false;
        // written back as polar angles, θ then φ
        const v = String(parseFloat(t.value));
        const N = { ...S, kind: 'Polar', a: which === 't' ? v : S.theta, b: which === 'p' ? v : S.phi };
        s.src = s.src.slice(0, S.at) + stateCode(N) + s.src.slice(S.end);
        return true;
      }
      if (t.dataset.sl != null) {
        const S = states(s.src)[+t.dataset.sl], v = t.value.trim(), L = S && S.label;
        if (!S) return false;
        if (L && v) s.src = s.src.slice(0, L.bodyAt) + `$${v}$` + s.src.slice(L.bodyEnd);
        else if (L) s.src = cut(s.src, L.at, L.end);
        else if (v) s.src = s.src.slice(0, S.end) + `\n  \\node[above] at (${S.name}) {$${v}$};` + s.src.slice(S.end);
        return true;
      }
      return false;
    },
    action(s, act) {
      if (act.startsWith('ball:')) {
        const v = act.slice(5), c = String(layout(s).opts.color || 'white').trim();
        s.src = setEnvKey(s.src, 'ball', v === '3d' ? null : v);
        // the package draws the outline in the ball colour, white by default: invisible on paper, so it goes black;
        // and back to the default white for a shaded ball, which would otherwise shade black
        if (v === 'circle' && c === 'white') s.src = setEnvKey(s.src, 'color', 'black');
        if (v === '3d' && c === 'black') s.src = setEnvKey(s.src, 'color', null);
        return true;
      }
      if (act.startsWith('delstate:')) {
        const S = states(s.src)[+act.slice(9)];
        if (!S) return;
        // its label goes with it: the later one is cut first, so the earlier one's place still holds
        const L = S.label;
        if (L && L.at > S.at) s.src = cut(cut(s.src, L.at, L.end), S.at, S.end);
        else if (L) s.src = cut(cut(s.src, S.at, S.end), L.at, L.end);
        else s.src = cut(s.src, S.at, S.end);
        return true;
      }
      if (act === 'addstate') {
        const used = new Set(states(s.src).map((x) => x.name));
        let n = 1;
        while (used.has(`s${n}`)) n++;
        const line = `  \\drawStatePolar{s${n}}{60}{${(30 * n) % 360}}\n  \\node[above] at (s${n}) {$s_${n}$};\n`;
        const e = s.src.lastIndexOf('\\end{blochsphere}');
        s.src = e < 0 ? `${s.src}\n${line}` : s.src.slice(0, e) + line + s.src.slice(e);
        return true;
      }
      if (act !== 'copybloch') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('blochsphere Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied blochsphere code';
    },
  };
  TD.bloch = { layout, draw, unwrap, commands, setEnvKey, states, projector, circleArcs };
})();
