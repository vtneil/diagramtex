// Shared 3D engine for the 3D figure blocks (solid region, basic solids, solids of revolution, 3D sketch).
// Figures are built in 3D, projected with the pgfplots view={az}{el} projection, and turned into a flat list
// of drawing items in projected units (y up). The items are fitted into the block's box and drawn as SVG on
// the canvas, or written as plain TikZ with the projected coordinates, so the LaTeX needs no extra package.
//
// Items: { k: 'poly', pts, fill, stroke?, w?, seam?, opacity? }   a filled polygon (seam: hide the hairline gaps)
//        { k: 'line', pts, stroke, w, dash?, arrow?, arrow0? }    a polyline, optionally with arrow heads
//        { k: 'text', at, text, color?, anchor? }                 a label (anchor: 'west', 'south east', …)
//        { k: 'dot', at, r, color }                               a filled dot, r in px
//        { k: 'group', opacity, items }                           items seen through as one (a translucent solid)
// Colours are { c, p, o }: p% of the colour c mixed with o ('white' or 'black'), the same as xcolor's c!p!o.
// A colour c with an alpha (#rrggbbaa from the colour picker) draws with that opacity.
(function () {
  const TD = window.TD;
  const { r2 } = TD.util;
  const K = TD.PT_PER_PX;
  const f = TD.fmt;
  const D2R = Math.PI / 180;
  const V3 = {};

  V3.LW = 0.8 / K; // outlines: 0.8pt
  V3.AW = 0.6 / K; // axes, guides and callouts: 0.6pt

  // ---------------------------------------------------------------- vectors
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  V3.vec = { dot, sub, add, mul, cross, norm };

  // ---------------------------------------------------------------- the view
  // az, el in degrees as in pgfplots' view={az}{el}. P projects, dv points towards the viewer, L towards the light.
  V3.view = function (az, el) {
    const h = (az ?? 25) * D2R, v = Math.max(-89, Math.min(89, el ?? 30)) * D2R;
    const ch = Math.cos(h), sh = Math.sin(h), cv = Math.cos(v), sv = Math.sin(v);
    const P = (p) => [p[0] * ch + p[1] * sh, (-p[0] * sh + p[1] * ch) * sv + p[2] * cv];
    const dv = [sh * cv, -ch * cv, sv];
    const la = Math.atan2(dv[1], dv[0]) - 50 * D2R, le = 40 * D2R;
    const L = [Math.cos(la) * Math.cos(le), Math.sin(la) * Math.cos(le), Math.sin(le)];
    return { P, dv, L, depth: (p) => dot(p, dv) };
  };

  // ---------------------------------------------------------------- colour
  const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  const rgb = (c) => { const h = TD.parseColor(c).hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  V3.hex = (col) => {
    if (col.p >= 100) return TD.parseColor(col.c).hex;
    const a = rgb(col.c), o = col.o === 'white' ? 255 : 0;
    return '#' + a.map((v) => hex2((v * col.p) / 100 + (o * (100 - col.p)) / 100)).join('');
  };
  V3.alpha = (col) => { const c = col && col.c !== undefined ? col.c : col; if (!c) return 1; const a = TD.parseColor(c).a; return isFinite(a) ? a : 1; };
  const solidOf = (c) => (c && TD.parseColor(c).a < 1 ? TD.parseColor(c).hex : c); // the colour without its alpha
  V3.col = (c, p = 100, o = 'white') => ({ c, p: Math.max(0, Math.min(100, Math.round(p))), o });
  // a shade of c for lightness l in [0, 1]: 0.5 is c itself, 1 is nearly white, 0 a darker c
  V3.shade = (c, l) => {
    l = Math.max(0, Math.min(1, l));
    return l >= 0.5 ? V3.col(c, 100 - (l - 0.5) * 2 * 88, 'white') : V3.col(c, 100 - (0.5 - l) * 2 * 45, 'black');
  };
  V3.light = (vw, n) => 0.5 + 0.45 * dot(n, vw.L);
  V3.ink = (c) => V3.col(solidOf(c), 70, 'black'); // outlines stay solid on a translucent solid

  // ---------------------------------------------------------------- polylines from segments
  const key = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
  function chain(segs) {
    const out = [], ends = new Map(), used = new Array(segs.length).fill(false);
    segs.forEach(([a, b], i) => { for (const p of [a, b]) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const next = (p) => (ends.get(key(p)) || []).find((i) => !used[i]);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const line = [segs[i][0], segs[i][1]];
      for (const atEnd of [true, false]) {
        for (;;) {
          const p = atEnd ? line[line.length - 1] : line[0], j = next(p);
          if (j === undefined) break;
          used[j] = true;
          const q = key(segs[j][0]) === key(p) ? segs[j][1] : segs[j][0];
          if (atEnd) line.push(q); else line.unshift(q);
        }
      }
      out.push(line);
    }
    return out;
  }
  V3.chain = chain;

  // ---------------------------------------------------------------- a curve split into the runs that face / don't face the viewer
  // pts: 3D points; vis(i): true where the curve is in view. Returns { shown: [run…], hidden: [run…] } of 3D points.
  V3.splitRuns = function (pts, vis) {
    const shown = [], hidden = [];
    let cur = null, curVis = null;
    for (let i = 0; i < pts.length; i++) {
      const v = !!vis(i);
      if (cur && v === curVis) { cur.push(pts[i]); continue; }
      if (cur) { cur.push(pts[i]); (curVis ? shown : hidden).push(cur); }
      cur = [pts[i]]; curVis = v;
    }
    if (cur && cur.length > 1) (curVis ? shown : hidden).push(cur);
    return { shown, hidden };
  };

  // ---------------------------------------------------------------- meshes
  // faces: [{ pts: [[x,y,z]…], color, group? }] with outward normals by the right-hand rule (counter-clockwise
  // seen from outside). o: { vw, closed, convex, style: 'shaded' | 'line', hidden, ink, edgeAngle, curves }
  // curves: [{ pts, normals?, stroke?, w?, dash? }] drawn on the surface: solid where their normal faces the
  // viewer, dashed where it doesn't (when hidden edges are shown).
  V3.mesh = function (faces, o) {
    const vw = o.vw, out = [];
    const ink = o.ink || V3.col('#000000');
    const lw = o.w ?? V3.LW;
    const F = faces.map((fc) => {
      let n = [0, 0, 0];
      const p = fc.pts;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
      n = norm(n);
      const c = p.reduce((s, q) => add(s, mul(q, 1 / p.length)), [0, 0, 0]);
      return { ...fc, n, c, facing: dot(n, vw.dv) > 1e-9, d: vw.depth(c) };
    });
    const painted = F.filter((fc) => !o.closed || fc.facing).sort((a, b) => a.d - b.d);
    painted.forEach((fc, i) => { fc.order = i; });
    // edges with their faces
    const E = new Map();
    F.forEach((fc, fi) => {
      for (let i = 0; i < fc.pts.length; i++) {
        const a = fc.pts[i], b = fc.pts[(i + 1) % fc.pts.length], ka = key(a), kb = key(b);
        if (ka === kb) continue;
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (!E.has(k)) E.set(k, { a, b, f: [] });
        E.get(k).f.push(fi);
      }
    });
    const cosMax = Math.cos((o.edgeAngle ?? 28) * D2R);
    const shownAfter = new Map(), shown = [], hiddenSegs = [];
    for (const e of E.values()) {
      const fs = e.f.map((i) => F[i]);
      const feature = fs.length === 1 || fs.some((x) => x.group !== fs[0].group) || dot(fs[0].n, fs[1].n) < cosMax;
      const anyFront = fs.some((x) => x.facing), allFront = fs.every((x) => x.facing);
      let vis;
      if (o.closed) vis = feature ? anyFront : anyFront && !allFront;
      else vis = feature || (fs.length === 2 && fs[0].facing !== fs[1].facing);
      if (fs.some((x) => x.noEdge) && !(o.closed && anyFront && !allFront)) vis = false;
      if (vis) {
        if (o.convex || o.style === 'line') shown.push([e.a, e.b]);
        else {
          const last = fs.filter((x) => x.order !== undefined).reduce((m, x) => (m === null || x.order > m.order ? x : m), null);
          if (!last) shown.push([e.a, e.b]);
          else { if (!shownAfter.has(last.order)) shownAfter.set(last.order, []); shownAfter.get(last.order).push([e.a, e.b]); }
        }
      } else if (o.closed && feature && !anyFront && !fs.some((x) => x.noEdge)) hiddenSegs.push([e.a, e.b]);
    }
    // a translucent solid (its colour has an alpha): the faces are painted solid inside one group that is seen
    // through as a whole, so the facets of a curved face don't show their seams; the edges stay solid on top
    const ga = F.length ? V3.alpha(F[0].color) : 1;
    if (o.style !== 'line') {
      const polys = [];
      for (const fc of painted) {
        const n = fc.facing ? fc.n : mul(fc.n, -1), base = fc.color.c !== undefined ? fc.color : null;
        const col = fc.flat ? (base ? { ...base, c: solidOf(base.c) } : solidOf(fc.color)) : V3.shade(solidOf(base ? base.c : fc.color), V3.light(vw, n) - (fc.facing ? 0 : 0.12));
        const fa = V3.alpha(fc.color) / ga, op = fc.opacity != null ? fc.opacity : fa < 0.999 ? fa : undefined;
        polys.push({ k: 'poly', pts: fc.pts.map(vw.P), fill: col, seam: true, opacity: op });
        const after = (shownAfter.get(fc.order) || []).map((sg) => ({ k: 'line', pts: sg.map(vw.P), stroke: ink, w: lw }));
        if (ga < 1) shown.push(...(shownAfter.get(fc.order) || [])); else polys.push(...after);
      }
      if (ga < 1) out.push({ k: 'group', opacity: ga, items: polys }); else out.push(...polys);
    }
    for (const line of chain(shown)) out.push({ k: 'line', pts: line.map(vw.P), stroke: ink, w: lw });
    for (const cv of o.curves || []) {
      const R = cv.normals ? V3.splitRuns(cv.pts, (i) => dot(cv.normals[i], vw.dv) > 0) : { shown: [cv.pts], hidden: [] };
      for (const run of R.shown) out.push({ k: 'line', pts: run.map(vw.P), stroke: cv.stroke || ink, w: cv.w ?? lw, dash: cv.dash });
      if (o.hidden) for (const run of R.hidden) out.push({ k: 'line', pts: run.map(vw.P), stroke: cv.stroke || ink, w: cv.w ?? lw, dash: true });
    }
    if (o.hidden) for (const line of chain(hiddenSegs)) out.push({ k: 'line', pts: line.map(vw.P), stroke: ink, w: lw, dash: true });
    return out;
  };

  // ---------------------------------------------------------------- axes
  // neg: how far each axis also runs on its negative side (drawn without an arrow)
  V3.axes = function (vw, len, labels, origin = [0, 0, 0], neg = [0, 0, 0]) {
    const out = [], O = vw.P(origin);
    [[len[0], 0, 0], [0, len[1], 0], [0, 0, len[2]]].forEach((d, i) => {
      if (!(len[i] > 0)) return;
      const e = vw.P(add(origin, d));
      const st = neg[i] > 0 ? vw.P(add(origin, mul(norm(d), -neg[i]))) : O;
      out.push({ k: 'line', pts: [st, e], stroke: V3.col('#000000'), w: V3.AW, arrow: true });
      if (labels[i]) {
        const v = [e[0] - O[0], e[1] - O[1]], l = Math.hypot(v[0], v[1]) || 1;
        out.push({ k: 'text', at: e, text: labels[i], push: [v[0] / l, v[1] / l] });
      }
    });
    return out;
  };

  // ---------------------------------------------------------------- fitting into the box
  // calls: [{ text, tip: [x, y] projected, side: 'top' | 'bot' }] stand in a column right of rightX (projected).
  const NORMAL = { size: 'normalsize' };
  V3.NORMAL = NORMAL;
  V3.fit = function (s, items, calls = [], rightX = null) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const grow = (p) => { if (!p || !isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    const flat = (list) => list.flatMap((it) => (it.k === 'group' ? flat(it.items) : [it]));
    for (const it of flat(items)) {
      if (it.k === 'ball') { grow([it.at[0] - it.r, it.at[1] - it.r]); grow([it.at[0] + it.r, it.at[1] + it.r]); continue; }
      for (const p of it.pts || [it.at]) grow(p);
    }
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    const C = calls.filter((c) => c.text).map((c) => ({ ...c, b: TD.textBox(c.text, NORMAL) }));
    const GAP = 34, lw = C.length ? Math.max(...C.map((c) => c.b.w)) : 0;
    const sr = rightX ?? x1;
    const pad = 14, aw = s.w - 2 * pad, ah = s.h - 2 * pad;
    let k = Math.min(aw / (x1 - x0 || 1), ah / (y1 - y0 || 1));
    if (C.length) k = Math.min(k, (aw - GAP - lw) / (sr - x0 || 1));
    k = Math.max(1e-6, k);
    const tw = Math.max((x1 - x0) * k, C.length ? (sr - x0) * k + GAP + lw : 0);
    const ox = s.x + pad + (aw - tw) / 2, oy = s.y + pad + (ah - (y1 - y0) * k) / 2;
    const px = (p) => ({ x: ox + (p[0] - x0) * k, y: oy + (y1 - p[1]) * k });
    const lx = ox + (sr - x0) * k + GAP;
    let prev = -Infinity;
    const placed = C.map((c) => {
      const tip = px(c.tip);
      let y = c.side === 'top' ? Math.max(tip.y - 30, s.y + pad + c.b.h / 2) : tip.y - 6;
      y = Math.max(y, prev + c.b.h + 8);
      prev = y;
      return { text: c.text, b: c.b, at: { x: lx + c.b.w / 2, y }, from: { x: lx - 3, y }, tip };
    });
    return { px, k, calls: placed };
  };

  // ---------------------------------------------------------------- output
  function arrowHead(a, b, w) {
    const d = { x: b.x - a.x, y: b.y - a.y }, L = Math.hypot(d.x, d.y) || 1, u = { x: d.x / L, y: d.y / L };
    const len = 3.6 / K + w * 2, hw = len * 0.42;
    const base = { x: b.x - u.x * len, y: b.y - u.y * len };
    return `M${r2(b.x)},${r2(b.y)}L${r2(base.x - u.y * hw)},${r2(base.y + u.x * hw)}L${r2(base.x + u.y * hw)},${r2(base.y - u.x * hw)}Z`;
  }
  // where a label goes: its centre, pushed away from a point along `push` (projected direction) by half its size
  function labelCentre(it, q) {
    if (!it.push && !it.anchor) return q;
    const b = TD.textBox(it.text, NORMAL);
    if (it.push) {
      const [ux, uy] = [it.push[0], -it.push[1]];
      const off = 3 + Math.abs(ux) * b.w / 2 + Math.abs(uy) * b.h / 2;
      return { x: q.x + ux * off, y: q.y + uy * off };
    }
    const a = it.anchor, o = { x: q.x, y: q.y };
    if (a.includes('west')) o.x += b.w / 2 + 2;
    if (a.includes('east')) o.x -= b.w / 2 + 2;
    if (a.includes('south')) o.y -= b.h / 2 + 2;
    if (a.includes('north')) o.y += b.h / 2 + 2;
    return o;
  }
  let ballId = 0;
  const noHit = (h) => h.replace(/<rect class="hitfill"[^>]*\/>/, '');
  V3.svg = function (items, fit, ctx) {
    const { px } = fit;
    const d = (pts, close) => pts.map((p, i) => { const q = px(p); return `${i ? 'L' : 'M'}${r2(q.x)},${r2(q.y)}`; }).join('') + (close ? 'Z' : '');
    const dash = `stroke-dasharray="${r2(3 / K)} ${r2(2.2 / K)}"`;
    const alphaOf = (it, c) => Math.min(it.opacity ?? 1, V3.alpha(c));
    const emit = (list) => { let out = '';
    for (const it of list) {
      if (it.k === 'group') { out += `<g opacity="${f(it.opacity)}">${emit(it.items)}</g>`; continue; }
      if (it.k === 'poly') {
        const fa = alphaOf(it, it.fill), fill = V3.hex(it.fill), op = fa < 1 ? ` fill-opacity="${f(fa)}"` : '';
        const st = it.stroke ? ` stroke="${V3.hex(it.stroke)}" stroke-width="${r2(it.w ?? V3.LW)}" stroke-linejoin="round"` : it.seam && !op ? ` stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"` : '';
        out += `<path d="${d(it.pts, true)}" fill="${fill}"${op}${st}/>`;
      } else if (it.k === 'line') {
        const c = V3.hex(it.stroke), la = alphaOf(it, it.stroke);
        let g = `<path d="${d(it.pts)}" fill="none" stroke="${c}" stroke-width="${r2(it.w)}" stroke-linejoin="round" stroke-linecap="round"${it.dash ? ' ' + dash : ''}/>`;
        const n = it.pts.length;
        if (it.arrow && n > 1) g += `<path d="${arrowHead(px(it.pts[n - 2]), px(it.pts[n - 1]), it.w)}" fill="${c}"/>`;
        if (it.arrow0 && n > 1) g += `<path d="${arrowHead(px(it.pts[1]), px(it.pts[0]), it.w)}" fill="${c}"/>`;
        out += la < 1 ? `<g opacity="${f(la)}">${g}</g>` : g;
      } else if (it.k === 'ball') {
        const q = px(it.at), r = it.r * fit.k, id = 'v3b' + ++ballId + (ctx.export ? 'x' : '');
        const c = TD.parseColor(it.color).hex, ba = V3.alpha(it.color);
        if (it.shaded) out += `<defs><radialGradient id="${id}" cx="0.42" cy="0.38" r="0.7" fx="0.3" fy="0.25"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${V3.hex(V3.col(c, 80))}"/><stop offset="1" stop-color="${V3.hex(V3.col(c, 70, 'black'))}"/></radialGradient></defs>`;
        out += `<circle cx="${r2(q.x)}" cy="${r2(q.y)}" r="${r2(r)}" fill="${it.shaded ? `url(#${id})` : 'none'}"${it.shaded && ba < 1 ? ` fill-opacity="${f(ba)}"` : ''}${it.stroke ? ` stroke="${V3.hex(it.stroke)}" stroke-width="${r2(it.w ?? V3.LW)}"` : ''}/>`;
      } else if (it.k === 'dot') {
        const q = px(it.at);
        const da = V3.alpha(it.color);
        out += `<circle cx="${r2(q.x)}" cy="${r2(q.y)}" r="${r2(it.r ?? 2.2)}" fill="${V3.hex(it.color || V3.col('#000000'))}"${da < 1 ? ` fill-opacity="${f(da)}"` : ''}/>`;
      } else if (it.k === 'text') {
        const q = labelCentre(it, px(it.at));
        out += noHit(TD.textSvg(it.text, NORMAL, it.color ? V3.hex(it.color) : '#000000', q.x, q.y, ctx));
      }
    }
    return out; };
    let out = emit(items);
    for (const c of fit.calls || []) {
      out += `<path d="M${r2(c.from.x)},${r2(c.from.y)}L${r2(c.tip.x)},${r2(c.tip.y)}" stroke="#000" stroke-width="${r2(V3.AW)}" fill="none"/>`;
      out += `<path d="${arrowHead(c.from, c.tip, V3.AW)}" fill="#000"/>`;
      out += noHit(TD.textSvg(c.text, NORMAL, '#000000', c.at.x, c.at.y, ctx));
    }
    return out;
  };
  V3.errorSvg = (s, msg, ctx) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#c33" stroke-dasharray="4 3"/>` +
    noHit(TD.textSvg(msg, { size: 'small' }, '#c33', s.x + s.w / 2, s.y + s.h / 2, ctx));

  V3.tikz = function (items, fit, X) {
    const { px } = fit;
    const c = (p) => { const q = px(p); return X.c(q.x, q.y); };
    const col = (cc) => { const name = X.col(cc.c); return cc.p >= 100 ? name : `${name}!${cc.p}!${cc.o}`; };
    const path = (pts, close) => pts.map(c).join(' -- ') + (close ? ' -- cycle' : '');
    const out = [];
    let arrows = false;
    const tip = '{Stealth[length=4pt]}';
    const alphaOf = (it, cc) => Math.min(it.opacity ?? 1, V3.alpha(cc));
    const emit = (list) => { for (const it of list) {
      if (it.k === 'group') {
        out.push(`\\begin{scope}[transparency group, opacity=${f(it.opacity)}]`);
        emit(it.items);
        out.push('\\end{scope}');
        continue;
      }
      if (it.k === 'poly') {
        const fc = col(it.fill), fa = alphaOf(it, it.fill), op = fa < 1 ? `, fill opacity=${f(fa)}` : '';
        if (it.stroke) out.push(`\\filldraw[fill=${fc}${op}, draw=${col(it.stroke)}, line width=${X.pt(it.w ?? V3.LW)}, line join=round] ${path(it.pts, true)};`);
        else if (it.seam && !op) out.push(`\\filldraw[fill=${fc}, draw=${fc}, line width=0.2pt, line join=round] ${path(it.pts, true)};`);
        else out.push(`\\fill[${fc}${op}] ${path(it.pts, true)};`);
      } else if (it.k === 'line') {
        const o = [], sc = col(it.stroke);
        if (sc !== 'black') o.push(sc);
        const la = alphaOf(it, it.stroke);
        if (la < 1) o.push(`opacity=${f(la)}`);
        o.push(`line width=${X.pt(it.w)}`);
        if (it.dash) o.push('dashed');
        if (it.arrow || it.arrow0) { o.push(`${it.arrow0 ? tip : ''}-${it.arrow ? tip : ''}`); arrows = true; }
        o.push('line join=round');
        out.push(`\\draw[${o.join(', ')}] ${path(it.pts)};`);
      } else if (it.k === 'ball') {
        const q = px(it.at), r = f((it.r * fit.k) / TD.PX_PER_CM);
        const ba = V3.alpha(it.color);
        if (it.shaded) out.push(`\\shade[ball color=${X.col(it.color)}!65!white${ba < 1 ? `, opacity=${f(ba)}` : ''}] ${X.c(q.x, q.y)} circle (${r});`);
        if (it.stroke) out.push(`\\draw[${col(it.stroke) === 'black' ? '' : col(it.stroke) + ', '}line width=${X.pt(it.w ?? V3.LW)}] ${X.c(q.x, q.y)} circle (${r});`);
      } else if (it.k === 'dot') {
        const q = px(it.at);
        const da = V3.alpha(it.color);
        out.push(`\\fill[${col(it.color || V3.col('#000000'))}${da < 1 ? `, opacity=${f(da)}` : ''}] ${X.c(q.x, q.y)} circle (${f((it.r ?? 2.2) * K)}pt);`);
      } else if (it.k === 'text') {
        const q = labelCentre(it, px(it.at)), tc = it.color ? col(it.color) : 'black';
        out.push(`\\node${tc !== 'black' ? `[text=${tc}]` : ''} at ${X.c(q.x, q.y)} {${TD.tikzText(it.text)}};`);
      }
    } };
    emit(items);
    for (const cl of fit.calls || []) {
      out.push(`\\draw[line width=${X.pt(V3.AW)}, -${tip}] ${X.c(cl.from.x, cl.from.y)} -- ${X.c(cl.tip.x, cl.tip.y)};`);
      out.push(`\\node[anchor=west] at ${X.c(cl.from.x + 3, cl.from.y)} {${TD.tikzText(cl.text)}};`);
      arrows = true;
    }
    if (arrows) X.libs.add('arrows.meta');
    return out.join('\n');
  };

  // ---------------------------------------------------------------- a box-shaped block type built from a figure function
  // figure(s) → { items, calls?, rightX?, error? }
  V3.blockType = function (name, defaults, figure, presets = {}) {
    const cache = new WeakMap();
    const run = (s) => {
      const k = JSON.stringify(s), m = cache.get(s);
      if (m && m.k === k) return m.r;
      let r;
      try { r = figure(s); } catch (e) { r = { error: e.message }; }
      if (!r.error) r.fit = V3.fit(s, r.items, r.calls || [], r.rightX);
      cache.set(s, { k, r });
      return r;
    };
    return {
      name,
      pts: [['x', 'y']],
      create(p, d, tool) {
        const pre = presets[String(tool || '').split(':')[1]] || {};
        const o = JSON.parse(JSON.stringify({ ...defaults, ...pre }));
        return { type: String(tool || '').split(':')[0], x: p.x, y: p.y, ...o, w: 0, h: 0, _pw: o.w, _ph: o.h };
      },
      drag(s, a, q, e) { Object.assign(s, TD.box.drag(a, q, e)); },
      fix(s) {
        if (s.w < 30 || s.h < 30) { s.w = s._pw || defaults.w; s.h = s._ph || defaults.h; }
        delete s._pw; delete s._ph;
      },
      valid: () => true,
      handles: (s) => TD.box.handles(s),
      setHandle(s, k, q, e, o) { const b = TD.box.resize(o, k, q, e); if (b.w >= 60 && b.h >= 60) Object.assign(s, b); },
      anchors: (s) => TD.box.handles(s).map((h) => ({ x: h.x, y: h.y })),
      samples: (s) => [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }],
      svg(s, ctx) {
        const r = run(s);
        const hit = ctx.export ? '' : `<rect class="hitfill" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`;
        return (r.error ? V3.errorSvg(s, r.error, ctx) : V3.svg(r.items, r.fit, ctx)) + hit;
      },
      tikz(s, X) {
        const r = run(s);
        return r.error ? `% ${name}: ${r.error}` : V3.tikz(r.items, r.fit, X);
      },
      run,
    };
  };

  // ---------------------------------------------------------------- panel helpers shared by the blocks
  const { esc } = TD.util;
  V3.ui = {
    sec: (title, body) => `<div class="sec ser"><div class="sec-title">${title}</div>${body}</div>`,
    row: (label, ctl) => `<div class="row"><label>${label}</label><div class="ctl">${ctl}</div></div>`,
    inp: (k, v, extra = '') => `<input type="text" data-p="${k}" value="${esc(v ?? '')}" spellcheck="false"${extra}>`,
    num: (k, v, extra = '') => `<input type="number" data-p="${k}" value="${esc(v ?? '')}"${extra}>`,
    chk: (k, v) => `<input type="checkbox" data-p="${k}"${v !== false ? ' checked' : ''}>`,
    sel: (k, opts, v) => `<select data-p="${k}">${opts.map(([a, l]) => `<option value="${a}"${String(a) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
    color: (i, v) => `<button type="button" class="cbtn" data-sercolor="${i}" title="${v}"><span style="background:${TD.css(v)}"></span></button>`,
    err: (m) => (m ? `<div class="err">${esc(m)}</div>` : ''),
    help: (h) => `<div class="help" style="margin-top:6px">${h}</div>`,
    view: (s, d = [115, 20]) => V3.ui.row('View (az, el)', V3.ui.num('view0', s.view?.[0] ?? d[0], ' step="5"') + V3.ui.num('view1', s.view?.[1] ?? d[1], ' step="5" min="-89" max="89"')),
  };
  // a panel's apply(): view angles, checkboxes, the rest as typed; `rerender` keys redraw the panel
  V3.apply = (rerender = []) => function (s, t) {
    const k = t.dataset.p;
    if (!k) return false;
    if (k === 'view0' || k === 'view1') { s.view = [...(s.view || [115, 20])]; s.view[+k.slice(-1)] = parseFloat(t.value) || 0; return false; }
    s[k] = t.type === 'checkbox' ? t.checked : t.value;
    return rerender.includes(k);
  };
  V3.colors = (keys, defaults) => function (s, i) {
    const k = keys[i];
    return { get: () => s[k], set: (v) => { s[k] = v || defaults[k]; }, nullable: false };
  };
  // numbers typed in a field: plain numbers or pgfmath-like expressions such as 2*pi/3
  V3.num = (src, fb) => { const v = TD.evalNumber(String(src ?? '').trim() || 'x', NaN); return isFinite(v) ? v : fb; };
  // an expression in up to two variables named as in vars (e.g. ['t'], ['u', 'v'], ['r', 'z']), compiled to fn(a, b)
  V3.expr = (src, vars, label) => {
    let s = String(src ?? '').trim() || '0';
    const ph = ['\u0001', '\u0002'];
    vars.forEach((v, i) => { s = s.replace(new RegExp(`(?<![A-Za-z_0-9])${v}(?![A-Za-z_0-9(])`, 'g'), ph[i]); });
    s = s.replace(/\u0001/g, 'x').replace(/\u0002/g, 'y');
    const e = TD.getExpr(s, vars.length > 1 ? ['x', 'y'] : ['x']);
    if (e.error) throw new Error((label ? label + ': ' : '') + e.error);
    return e.fn;
  };

  TD.V3 = V3;
})();
