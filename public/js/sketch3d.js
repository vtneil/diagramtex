// 3D sketch: points, vectors, segments, polygons, arcs, circles and space curves typed by their coordinates,
// one command per line, drawn in that order over a set of axes. Presets give the cylindrical and spherical
// coordinate pictures and a plane with its normal. Exported as plain TikZ through the 3D engine (view3d.js).
//
//   axes 3 3 3                         axes this long (axes off: none)
//   let r = 2                          a number for later lines (r, and P.x, P.y, P.z of a named point)
//   point P (2, 1, 1.5) "$P$" guides  a dot; guides drops dashed lines to the xy-plane and the axes
//   vector (P) or vector (A) (B)       an arrow from the origin or from A to B
//   segment (A) (B) "$r$" dashed       a line, labelled at its middle; line goes on past both ends
//   polyline (A) (B) (C) …             an open path; polygon … closes and fills it
//   parallelogram (O) (u) (v)          the parallelogram at O spanned by the vectors u and v
//   arc (C) (U) (V) r=0.6 "$\theta$"   the angle at C from the direction U to the direction V
//   circle (C) r=1 normal=(0,0,1)      a circle, solid in front and dashed behind when hidden is on
//   curve (cos(t), sin(t), t/5) t=0..4*pi   a space curve
//   text (x, y, z) "label"
// Points: (x, y, z), (P) for a named point, (P.xy), (P.xz), (P.yz) for its shadow on a coordinate plane.
// Options: color=… fill=… opacity=… dashed thick arrow above below left right (label side).
(function () {
  const TD = window.TD;
  const T = TD.TYPES;
  const V3 = TD.V3;
  const { add, sub, mul, norm, cross, dot } = V3.vec;

  // ---------------------------------------------------------------- tokens of one line
  function tokens(line) {
    const out = [];
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        const j = line.indexOf('"', i + 1);
        if (j < 0) throw new Error('a label is missing its closing "');
        out.push({ t: 'str', v: line.slice(i + 1, j) }); i = j + 1; continue;
      }
      let j = i, depth = 0;
      while (j < line.length && (depth > 0 || !/\s/.test(line[j]))) { if (line[j] === '(') depth++; if (line[j] === ')') depth--; j++; }
      const w = line.slice(i, j);
      if (depth !== 0) throw new Error('unbalanced brackets');
      out.push(w[0] === '(' && w[w.length - 1] === ')' ? { t: 'pt', v: w.slice(1, -1) } : { t: 'word', v: w });
      i = j;
    }
    return out;
  }
  // split on top-level commas
  function parts(s) {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  }

  // colours: #rrggbb or one of xcolor's base names
  const NAMES = { black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', red: '#ff0000', green: '#00ff00', blue: '#0000ff',
    cyan: '#00ffff', magenta: '#ff00ff', yellow: '#ffff00', orange: '#ff8000', brown: '#bf8040', lime: '#bfff00', olive: '#808000', pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080' };
  const colour = (c) => {
    const v = String(c).trim().toLowerCase(), h = NAMES[v] || (/^#?[0-9a-f]{6}$/.test(v) ? (v[0] === '#' ? v : '#' + v) : null);
    if (!h) throw new Error(`unknown colour ${c}: use #rrggbb or a name such as red, blue, gray`);
    return h;
  };
  const PUSH = { above: [0, 1], below: [0, -1], left: [-1, 0], right: [1, 0], 'above left': [-0.7, 0.7], 'above right': [0.7, 0.7], 'below left': [-0.7, -0.7], 'below right': [0.7, -0.7] };

  function figure(s) {
    const vw = V3.view(s.view?.[0] ?? 120, s.view?.[1] ?? 25);
    const env = new Map(), pts = new Map();
    const items = [], body = [];
    let axes = null;
    // numbers: names from let and P.x / P.y / P.z put in as values
    const subst = (src) => String(src)
      .replace(/\b([A-Za-z_][A-Za-z_0-9]*)\.([xyz])\b/g, (m, n, c) => { if (!pts.has(n)) throw new Error(`no point named ${n}`); return `(${pts.get(n)['xyz'.indexOf(c)]})`; })
      .replace(/(?<![A-Za-z_0-9.])([A-Za-z_][A-Za-z_0-9]*)(?![A-Za-z_0-9(])/g, (m, n) => (env.has(n) ? `(${env.get(n)})` : m));
    const num = (src) => {
      const e = TD.getExpr(subst(src), []);
      if (e.error) throw new Error(`${src.trim()}: ${e.error}`);
      const v = e.fn(0, 0);
      if (!isFinite(v)) throw new Error(`${src.trim()} is not a number`);
      return v;
    };
    const point = (tk) => {
      if (!tk || tk.t !== 'pt') throw new Error('expected a point such as (1, 2, 3) or (P)');
      const p = parts(tk.v);
      if (p.length === 3) return p.map(num);
      if (p.length === 1) {
        const m = /^([A-Za-z_][A-Za-z_0-9]*)(?:\.(xy|xz|yz))?$/.exec(p[0]);
        if (!m || !pts.has(m[1])) throw new Error(`no point named ${p[0]}`);
        const q = [...pts.get(m[1])];
        if (m[2] === 'xy') q[2] = 0; else if (m[2] === 'xz') q[1] = 0; else if (m[2] === 'yz') q[0] = 0;
        return q;
      }
      throw new Error(`(${tk.v}) needs three coordinates`);
    };
    const lines = String(s.src || '').split('\n');
    lines.forEach((raw, li) => {
      const line = raw.replace(/(^|\s)%.*$/, '').trim();
      if (!line) return;
      try {
        const tk = tokens(line);
        const cmd = tk.shift().v;
        // options and labels
        const opt = {}, P = [];
        let label = null, side = null;
        for (let i = 0; i < tk.length; i++) {
          const t = tk[i];
          if (t.t === 'str') label = t.v;
          else if (t.t === 'pt') P.push(t);
          else if (/^[a-z]+=/.test(t.v)) { const [k, ...v] = t.v.split('='); opt[k] = v.join('='); }
          else if (['above', 'below'].includes(t.v) && ['left', 'right'].includes(tk[i + 1]?.v)) { side = t.v + ' ' + tk[++i].v; }
          else if (PUSH[t.v]) side = t.v;
          else opt[t.v] = true;
        }
        const color = opt.color ? V3.col(colour(opt.color)) : V3.col('#000000');
        const w = opt.thick ? 1.2 / TD.PT_PER_PX : opt.thin ? 0.4 / TD.PT_PER_PX : V3.LW;
        const lab = (at, dflt) => { if (label) body.push({ k: 'text', at: vw.P(at), text: label, push: PUSH[side] || dflt, color: opt.color ? color : undefined }); };
        const away = (a, b) => { const A = vw.P(a), B = vw.P(b), d = [B[0] - A[0], B[1] - A[1]], u = [-d[1], d[0]], l = Math.hypot(...u) || 1; return u[1] < 0 ? [-u[0] / l, -u[1] / l] : [u[0] / l, u[1] / l]; };
        switch (cmd) {
          case 'axes': {
            if (tk[0]?.v === 'off') { axes = null; break; }
            const n = tk.filter((t) => t.t === 'word' && !/=/.test(t.v)).map((t) => num(t.v));
            axes = { len: [n[0] ?? 3, n[1] ?? n[0] ?? 3, n[2] ?? n[0] ?? 3], neg: opt.neg ? num(opt.neg) : 0 };
            break;
          }
          case 'let': {
            const m = /^let\s+([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+)$/.exec(line);
            if (!m) throw new Error('write let name = value');
            env.set(m[1], num(m[2]));
            break;
          }
          case 'point': case 'coord': {
            const name = tk[0]?.t === 'word' && !/=/.test(tk[0].v) && !PUSH[tk[0].v] ? tk[0].v : null;
            const p = point(P[0]);
            if (name) pts.set(name, p);
            if (cmd === 'coord') break;
            if (opt.guides) {
              const g = { k: 'line', stroke: V3.col('#000000', 70), w: V3.AW, dash: true };
              const f = [p[0], p[1], 0];
              if (Math.abs(p[2]) > 1e-9) body.push({ ...g, pts: [vw.P(p), vw.P(f)] });
              if (Math.abs(p[1]) > 1e-9) body.push({ ...g, pts: [vw.P(f), vw.P([p[0], 0, 0])] });
              if (Math.abs(p[0]) > 1e-9) body.push({ ...g, pts: [vw.P(f), vw.P([0, p[1], 0])] });
            }
            body.push({ k: 'dot', at: vw.P(p), r: opt.r ? num(opt.r) : 2.2, color });
            lab(p, [0.7, 0.7]);
            break;
          }
          case 'vector': {
            const [a, b] = P.length > 1 ? [point(P[0]), point(P[1])] : [[0, 0, 0], point(P[0])];
            body.push({ k: 'line', pts: [vw.P(a), vw.P(b)], stroke: color, w: opt.thick ? w : 1 / TD.PT_PER_PX, arrow: true, dash: !!opt.dashed });
            lab(add(a, mul(sub(b, a), 0.55)), away(a, b));
            break;
          }
          case 'segment': case 'line': {
            let a = point(P[0]), b = point(P[1]);
            if (cmd === 'line') { const d = sub(b, a), e = opt.extend ? num(opt.extend) : 0.25; a = sub(a, mul(d, e)); b = add(b, mul(d, e)); }
            body.push({ k: 'line', pts: [vw.P(a), vw.P(b)], stroke: color, w, dash: !!opt.dashed, arrow: !!opt.arrow });
            lab(mul(add(a, b), 0.5), away(a, b));
            break;
          }
          case 'polyline': case 'polygon': case 'parallelogram': {
            let Q = P.map(point);
            if (cmd === 'parallelogram') { if (Q.length !== 3) throw new Error('parallelogram needs (corner) (u) (v)'); const [o, u, v] = Q; Q = [o, add(o, u), add(add(o, u), v), add(o, v)]; }
            if (Q.length < 2) throw new Error('needs at least two points');
            const closed = cmd !== 'polyline';
            if (closed && (opt.fill || cmd === 'parallelogram')) {
              const fc = V3.col(opt.fill && opt.fill !== true ? colour(opt.fill) : '#2f7fc1');
              body.push({ k: 'poly', pts: Q.map(vw.P), fill: fc, opacity: opt.opacity ? num(opt.opacity) : 0.25 });
            }
            if (!opt.nodraw) body.push({ k: 'line', pts: (closed ? [...Q, Q[0]] : Q).map(vw.P), stroke: color, w, dash: !!opt.dashed });
            lab(Q.reduce((m, q) => add(m, mul(q, 1 / Q.length)), [0, 0, 0]), [0, 0]);
            break;
          }
          case 'arc': {
            const c = point(P[0]), e1 = norm(sub(point(P[1]), c)), vn = norm(sub(point(P[2]), c));
            let e2 = sub(vn, mul(e1, dot(vn, e1)));
            if (Math.hypot(...e2) < 1e-9) throw new Error('the two directions are parallel');
            e2 = norm(e2);
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(e1, vn)))), r = opt.r ? num(opt.r) : 0.5;
            const A = Array.from({ length: 33 }, (_, i) => { const t = (ang * i) / 32; return add(c, add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t)))); });
            body.push({ k: 'line', pts: A.map(vw.P), stroke: color, w: opt.thick ? w : V3.AW, arrow: !!opt.arrow, dash: !!opt.dashed });
            const m = add(c, add(mul(e1, r * 1.35 * Math.cos(ang / 2)), mul(e2, r * 1.35 * Math.sin(ang / 2))));
            if (label) body.push({ k: 'text', at: vw.P(m), text: label, push: PUSH[side] || [0, 0], color: opt.color ? color : undefined });
            break;
          }
          case 'circle': {
            const c = point(P[0]), r = opt.r ? num(opt.r) : 1;
            const nm = opt.normal ? norm(point({ t: 'pt', v: opt.normal.replace(/^\(|\)$/g, '') })) : [0, 0, 1];
            const e1 = norm(Math.abs(nm[0]) < 0.9 ? cross(nm, [1, 0, 0]) : cross(nm, [0, 1, 0])), e2 = cross(nm, e1);
            const C = Array.from({ length: 97 }, (_, i) => { const t = (2 * Math.PI * i) / 96; return add(c, add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t)))); });
            if (opt.fill) body.push({ k: 'poly', pts: C.map(vw.P), fill: V3.col(opt.fill === true ? '#2f7fc1' : colour(opt.fill)), opacity: opt.opacity ? num(opt.opacity) : 0.25 });
            if (opt.back && s.hiddenEdges !== false) { // on a sphere's surface: dashed where it turns away from the viewer
              const R = V3.splitRuns(C, (i) => dot(sub(C[i], opt.back === true ? [0, 0, 0] : point({ t: 'pt', v: opt.back.replace(/^\(|\)$/g, '') })), vw.dv) >= 0);
              for (const run of R.shown) body.push({ k: 'line', pts: run.map(vw.P), stroke: color, w });
              for (const run of R.hidden) body.push({ k: 'line', pts: run.map(vw.P), stroke: color, w, dash: true });
            } else body.push({ k: 'line', pts: C.map(vw.P), stroke: color, w, dash: !!opt.dashed });
            lab(add(c, mul(e1, r)), [0.7, 0.7]);
            break;
          }
          case 'curve': {
            const p = parts(P[0]?.v || '');
            if (p.length !== 3) throw new Error('curve needs (x(t), y(t), z(t))');
            const fs = p.map((x, i) => V3.expr(subst(x), ['t'], 'xyz'[i]));
            const m = /^(.+)\.\.(.+)$/.exec(opt.t || '0..1');
            if (!m) throw new Error('write t=a..b');
            const a = num(m[1]), b = num(m[2]), n = Math.max(8, Math.min(800, opt.samples ? Math.round(num(opt.samples)) : 160));
            const C = Array.from({ length: n + 1 }, (_, i) => { const t = a + ((b - a) * i) / n; return fs.map((fn) => fn(t)); });
            if (C.some((q) => !q.every(isFinite))) throw new Error('the curve is not a number somewhere on that t range');
            body.push({ k: 'line', pts: C.map(vw.P), stroke: opt.color ? color : V3.col('#2f7fc1'), w: opt.thin ? w : 1.1 / TD.PT_PER_PX, arrow: !!opt.arrow, dash: !!opt.dashed });
            lab(C[Math.round(n * 0.75)], [0.7, 0.7]);
            break;
          }
          case 'text': {
            const p = point(P[0]);
            if (label) body.push({ k: 'text', at: vw.P(p), text: label, push: PUSH[side], color: opt.color ? color : undefined });
            break;
          }
          case 'sphere': {
            const c = point(P[0]), r = opt.r ? num(opt.r) : 1;
            body.push({ k: 'ball', at: vw.P(c), r, color: opt.fill && opt.fill !== true ? colour(opt.fill) : '#2f7fc1', shaded: !!opt.fill, stroke: color, w });
            break;
          }
          default: throw new Error(`unknown command ${cmd}`);
        }
      } catch (e) {
        throw new Error(`Line ${li + 1}: ${e.message}`);
      }
    });
    if (axes) items.push(...V3.axes(vw, axes.len, [s.xlabel, s.ylabel, s.zlabel], [0, 0, 0], [axes.neg, axes.neg, axes.neg]));
    items.push(...body);
    return { items };
  }

  const DEFAULT = {
    w: 300, h: 260, view: [120, 25], xlabel: '$x$', ylabel: '$y$', zlabel: '$z$', hiddenEdges: true,
    src: `axes 3 3 3
point P (2, 2.4, 1.8) "$P(a, b, c)$" guides
vector (P) "$\\mathbf{r}$" color=#2f7fc1 thick`,
  };
  const PRESETS = {
    vectors: {},
    blank: { src: 'axes 3 3 3\n' },
    cylindrical: {
      src: `axes 3 3 2.8
let r = 2.2
let th = 55*pi/180
let z = 1.8
point P (r*cos(th), r*sin(th), z) "$P(r, \\theta, z)$"
segment (0,0,0) (P.xy) "$r$" below
segment (P.xy) (P) dashed "$z$" right
segment (P) (0,0,z) dashed
arc (0,0,0) (1,0,0) (P.xy) r=0.8 "$\\theta$"
point Q (P.xy) r=1.6`,
    },
    spherical: {
      src: `axes 3 3 3
let rho = 2.6
let th = 50*pi/180
let ph = 40*pi/180
point P (rho*sin(ph)*cos(th), rho*sin(ph)*sin(th), rho*cos(ph)) "$P(\\rho, \\theta, \\phi)$"
segment (0,0,0) (P) "$\\rho$" right
segment (0,0,0) (P.xy) dashed
segment (P.xy) (P) dashed
arc (0,0,0) (1,0,0) (P.xy) r=0.8 "$\\theta$"
arc (0,0,0) (0,0,1) (P) r=0.9 "$\\phi$"`,
    },
    plane: {
      view: [115, 22],
      src: `axes 3 3 3
parallelogram (0,0,2) (2.8,0,-1.4) (0,2.8,-1.2) fill=#2f7fc1 opacity=0.2
point P0 (1.2, 1.2, 0.88) "$P_0$" below
vector (P0) (1.7, 1.75, 1.93) "$\\mathbf{n}$" color=#e8703a thick
point P (2.2, 0.6, 0.66) "$P$" below right
segment (P0) (P) dashed`,
    },
    curve: {
      view: [120, 20], h: 300,
      src: `axes 2 2 3.6
curve (cos(t), sin(t), t/(2*pi)) t=0..4*pi "$\\mathbf{r}(t)$"
circle (0,0,0) r=1 dashed color=gray`,
    },
  };
  T.sketch3d = V3.blockType('3D sketch', DEFAULT, figure, PRESETS);

  const { sec, row, inp, chk, err, help, view } = V3.ui;
  TD.panels = TD.panels || {};
  TD.panels.sketch3d = {
    html(s) {
      const r = T.sketch3d.run(s);
      return sec('Sketch', `<div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="12">${TD.util.esc(s.src || '')}</textarea></div>` + err(r.error)
        + help('One command per line: point, vector, segment, line, polyline, polygon, parallelogram, arc, circle, curve, sphere, text, let, axes. For example <code>point P (2, 1, 1.5) "$P$" guides</code> or <code>vector (A) (B) color=red</code>. A point is <code>(x, y, z)</code>, <code>(P)</code> or its shadow <code>(P.xy)</code>. Options: color=, fill=, opacity=, r=, dashed, thick, above, left…'))
        + `<div class="sec"><div class="sec-title">View</div>${view(s, [120, 25])}${row('Axis labels', inp('xlabel', s.xlabel) + inp('ylabel', s.ylabel) + inp('zlabel', s.zlabel))}${row('Hidden parts dashed', chk('hiddenEdges', s.hiddenEdges))}</div>`;
    },
    apply: V3.apply([]),
    action() {},
  };
})();
