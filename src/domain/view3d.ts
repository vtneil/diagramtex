import type { Vec3 } from './contracts';
import { runtime as TD } from '../runtime';
// Shared 3D engine for the 3D figure blocks (solid region, basic solids, solids of revolution).
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
  const { r2 } = TD.util;
  const K = TD.PT_PER_PX;
  const f = TD.fmt;
  const D2R = Math.PI / 180;
  const V3: Record<string, any> = {};

  V3.LW = 0.8 / K; // outlines: 0.8pt
  V3.AW = 0.6 / K; // axes, guides and callouts: 0.6pt

  // ---------------------------------------------------------------- vectors
  const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a: readonly number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  V3.vec = { dot, sub, add, mul, cross, norm };

  // ---------------------------------------------------------------- the view
  // az, el in degrees as in pgfplots' view={az}{el}. P projects, dv points towards the viewer, L towards the light.
  V3.view = function (az: any, el: any) {
    const h = (az ?? 25) * D2R, v = Math.max(-89, Math.min(89, el ?? 30)) * D2R;
    const ch = Math.cos(h), sh = Math.sin(h), cv = Math.cos(v), sv = Math.sin(v);
    const P = (p: any) => [p[0] * ch + p[1] * sh, (-p[0] * sh + p[1] * ch) * sv + p[2] * cv];
    const dv = [sh * cv, -ch * cv, sv];
    const la = Math.atan2(dv[1], dv[0]) - 50 * D2R, le = 40 * D2R;
    const L = [Math.cos(la) * Math.cos(le), Math.sin(la) * Math.cos(le), Math.sin(le)];
    return { P, dv, L, depth: (p: any) => Math.round(dot(p, dv) * 1e9) / 1e9 };
  };

  // ---------------------------------------------------------------- colour
  const hex2 = (n: any) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  const rgb = (c: any) => { const h = TD.parseColor(c).hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  V3.hex = (col: any) => {
    if (col.p >= 100) return TD.parseColor(col.c).hex;
    const a = rgb(col.c), o = col.o === 'white' ? 255 : 0;
    return '#' + a.map((v) => hex2((v * col.p) / 100 + (o * (100 - col.p)) / 100)).join('');
  };
  V3.alpha = (col: any) => { const c = col && col.c !== undefined ? col.c : col; if (!c) return 1; const a = TD.parseColor(c).a; return isFinite(a) ? a : 1; };
  const solidOf = (c: any) => (c && TD.parseColor(c).a < 1 ? TD.parseColor(c).hex : c); // the colour without its alpha
  V3.col = (c: any, p = 100, o = 'white') => ({ c, p: Math.max(0, Math.min(100, Math.round(p))), o });
  // a shade of c for lightness l in [0, 1]: 0.5 is c itself, 1 is nearly white, 0 a darker c
  V3.shade = (c: any, l: any) => {
    l = Math.max(0, Math.min(1, l));
    return l >= 0.5 ? V3.col(c, 100 - (l - 0.5) * 2 * 88, 'white') : V3.col(c, 100 - (0.5 - l) * 2 * 45, 'black');
  };
  V3.light = (vw: any, n: any) => 0.5 + 0.45 * dot(n, vw.L);
  V3.ink = (c: any) => V3.col(solidOf(c), 70, 'black'); // outlines stay solid on a translucent solid

  // ---------------------------------------------------------------- polylines from segments
  const key = (p: any) => p.map((v: any) => Math.round(v * 1e5)).join(',');
  function chain(segs: any) {
    const out = [], ends = new Map(), used = new Array(segs.length).fill(false);
    segs.forEach(([a, b]: any, i: any) => { for (const p of [a, b]) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const next = (p: any) => (ends.get(key(p)) || []).find((i: any) => !used[i]);
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
  V3.splitRuns = function (pts: any, vis: any) {
    const shown: any[] = [], hidden: any[] = [];
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
  V3.mesh = function (faces: any, o: any) {
    const vw = o.vw, out = [];
    const ink = o.ink || V3.col('#000000');
    const lw = o.w ?? V3.LW;
    const F = faces.map((fc: any) => {
      let n = [0, 0, 0];
      const p = fc.pts;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
      n = norm(n);
      const c = p.reduce((s: any, q: any) => add(s, mul(q, 1 / p.length)), [0, 0, 0]);
      return { ...fc, n, c, facing: dot(n, vw.dv) > 1e-9, d: vw.depth(c) };
    });
    const painted = F.filter((fc: any) => !o.closed || fc.facing).sort((a: any, b: any) => Math.round(a.d * 1e9) - Math.round(b.d * 1e9));
    painted.forEach((fc: any, i: any) => { fc.order = i; });
    // edges with their faces
    const E = new Map();
    F.forEach((fc: any, fi: any) => {
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
      const fs = e.f.map((i: any) => F[i]);
      const feature = fs.length === 1 || fs.some((x: any) => x.group !== fs[0].group) || dot(fs[0].n, fs[1].n) < cosMax;
      const anyFront = fs.some((x: any) => x.facing), allFront = fs.every((x: any) => x.facing);
      let vis;
      if (o.closed) vis = feature ? anyFront : anyFront && !allFront;
      else vis = feature || (fs.length === 2 && fs[0].facing !== fs[1].facing);
      if (fs.some((x: any) => x.noEdge) && !(o.closed && anyFront && !allFront)) vis = false;
      if (vis) {
        if (o.convex || o.style === 'line') shown.push([e.a, e.b]);
        else {
          const last = fs.filter((x: any) => x.order !== undefined).reduce((m: any, x: any) => (m === null || x.order > m.order ? x : m), null);
          if (!last) shown.push([e.a, e.b]);
          else { if (!shownAfter.has(last.order)) shownAfter.set(last.order, []); shownAfter.get(last.order).push([e.a, e.b]); }
        }
      } else if (o.closed && feature && !anyFront && !fs.some((x: any) => x.noEdge)) hiddenSegs.push([e.a, e.b]);
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
        const after = (shownAfter.get(fc.order) || []).map((sg: any) => ({ k: 'line', pts: sg.map(vw.P), stroke: ink, w: lw }));
        if (ga < 1) shown.push(...(shownAfter.get(fc.order) || [])); else polys.push(...after);
      }
      if (ga < 1) out.push({ k: 'group', opacity: ga, items: polys }); else out.push(...polys);
    }
    for (const line of chain(shown)) out.push({ k: 'line', pts: line.map(vw.P), stroke: ink, w: lw });
    for (const cv of o.curves || []) {
      const R = cv.normals ? V3.splitRuns(cv.pts, (i: any) => dot(cv.normals[i], vw.dv) > 1e-9) : { shown: [cv.pts], hidden: [] };
      for (const run of R.shown) out.push({ k: 'line', pts: run.map(vw.P), stroke: cv.stroke || ink, w: cv.w ?? lw, dash: cv.dash });
      if (o.hidden) for (const run of R.hidden) out.push({ k: 'line', pts: run.map(vw.P), stroke: cv.stroke || ink, w: cv.w ?? lw, dash: true });
    }
    if (o.hidden) for (const line of chain(hiddenSegs)) out.push({ k: 'line', pts: line.map(vw.P), stroke: ink, w: lw, dash: true });
    return out;
  };

  // ---------------------------------------------------------------- axes
  // neg: how far each axis also runs on its negative side (drawn without an arrow)
  V3.axes = function (vw: any, len: any, labels: any, origin = [0, 0, 0], neg = [0, 0, 0]) {
    const out: any[] = [], O = vw.P(origin);
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
  V3.fit = function (s: any, items: any, calls: any[] = [], rightX = null) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const grow = (p: any) => { if (!p || !isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    const flat = (list: any) => list.flatMap((it: any) => (it.k === 'group' ? flat(it.items) : [it]));
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
    const px = (p: any) => ({ x: ox + (p[0] - x0) * k, y: oy + (y1 - p[1]) * k });
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
  const ARROW_CUT = (4 - 0.325 * 4) / K; // tip to notch of the Stealth[length=4pt] head
  function arrowHead(a: any, b: any, w: any) {
    const d = { x: b.x - a.x, y: b.y - a.y }, L = Math.hypot(d.x, d.y) || 1, u = { x: d.x / L, y: d.y / L };
    // the export's Stealth[length=4pt]: 4pt long, 3pt wide, back notched in by 0.325 of the length
    const len = 4 / K, hw = 1.5 / K, inset = 0.325 * len;
    const base = { x: b.x - u.x * len, y: b.y - u.y * len }, notch = { x: base.x + u.x * inset, y: base.y + u.y * inset };
    return `M${r2(b.x)},${r2(b.y)}L${r2(base.x - u.y * hw)},${r2(base.y + u.x * hw)}L${r2(notch.x)},${r2(notch.y)}L${r2(base.x + u.y * hw)},${r2(base.y - u.x * hw)}Z`;
  }
  function toHead(a: any, b: any, w: any) {
    const d = { x: b.x - a.x, y: b.y - a.y }, L = Math.hypot(d.x, d.y) || 1, u = { x: d.x / L, y: d.y / L };
    const len = 2.4 / K + w * 1.5, hw = len * 0.75;
    const base = { x: b.x - u.x * len, y: b.y - u.y * len };
    return `M${r2(base.x - u.y * hw)},${r2(base.y + u.x * hw)}Q${r2(b.x - u.x * len * 0.25)},${r2(b.y - u.y * len * 0.25)} ${r2(b.x)},${r2(b.y)}Q${r2(b.x - u.x * len * 0.25)},${r2(b.y - u.y * len * 0.25)} ${r2(base.x + u.y * hw)},${r2(base.y - u.x * hw)}`;
  }
  // where a label goes: its centre, pushed away from a point along `push` (projected direction) by half its size
  function labelCentre(it: any, q: any) {
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
  const noHit = (h: any) => h.replace(/<rect class="hitfill"[^>]*\/>/, '');
  V3.svg = function (items: any, fit: any, ctx: any) {
    const { px } = fit;
    const d = (pts: any, close: any) => pts.map((p: any, i: any) => { const q = px(p); return `${i ? 'L' : 'M'}${r2(q.x)},${r2(q.y)}`; }).join('') + (close ? 'Z' : '');
    const dash = `stroke-dasharray="${r2(3 / K)} ${r2(2.2 / K)}"`, dotted = `stroke-dasharray="0.01 ${r2(2 / K)}"`;
    const alphaOf = (it: any, c: any) => Math.min(it.opacity ?? 1, V3.alpha(c));
    const emit = (list: any) => { let out = '';
    for (const it of list) {
      if (it.k === 'group') { out += `<g opacity="${f(it.opacity)}">${emit(it.items)}</g>`; continue; }
      if (it.k === 'poly') {
        const fa = alphaOf(it, it.fill), fill = V3.hex(it.fill), op = fa < 1 ? ` fill-opacity="${f(fa)}"` : '';
        const st = it.stroke ? ` stroke="${V3.hex(it.stroke)}" stroke-width="${r2(it.w ?? V3.LW)}" stroke-linejoin="round"` : it.seam && !op ? ` stroke="${fill}" stroke-width="0.5" stroke-linejoin="round"` : '';
        // grad: TikZ's axis or radial shading across the path's bounding box, { k: 'h' | 'v' | 'r', a, b }
        let paint = fill, defs = '';
        if (it.grad) {
          const id = 'v3g' + ++ballId + (ctx.export ? 'x' : ''), g = it.grad, stops = `<stop offset="0" stop-color="${TD.parseColor(g.a).hex}"/><stop offset="1" stop-color="${TD.parseColor(g.b).hex}"/>`;
          defs = g.k === 'r' ? `<defs><radialGradient id="${id}">${stops}</radialGradient></defs>` : `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${g.k === 'h' ? 1 : 0}" y2="${g.k === 'v' ? 1 : 0}">${stops}</linearGradient></defs>`;
          paint = `url(#${id})`;
        }
        out += `${defs}<path d="${d(it.pts, true)}" fill="${paint}"${op}${it.grad ? '' : st}/>`;
      } else if (it.k === 'line') {
        const c = V3.hex(it.stroke), la = alphaOf(it, it.stroke);
        const n = it.pts.length, q = it.pts.map(px), stealth = it.tip !== 'to';
        // like TikZ, the shaft stops inside a stealth head (at its notch) instead of running to the tip
        const cut = (i: any, j: any) => { const L = Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y), t = Math.min(1, ARROW_CUT / (L || 1)); q[i] = { x: q[i].x + (q[j].x - q[i].x) * t, y: q[i].y + (q[j].y - q[i].y) * t }; };
        if (stealth && n > 1 && it.arrow) cut(n - 1, n - 2);
        if (stealth && n > 1 && it.arrow0) cut(0, 1);
        const dq = q.map((p: any, i: any) => `${i ? 'L' : 'M'}${r2(p.x)},${r2(p.y)}`).join('');
        let g = `<path d="${dq}" fill="none" stroke="${c}" stroke-width="${r2(it.w)}" stroke-linejoin="round" stroke-linecap="${stealth && (it.arrow || it.arrow0) ? 'butt' : it.cap || 'round'}"${it.dash ? ' ' + (it.dash === 'dot' ? dotted : dash) : ''}/>`;
        // tip 'to': TikZ's default open barb (->); otherwise a filled stealth head
        const head = (a: any, b: any) => (it.tip === 'to' ? `<path d="${toHead(a, b, it.w)}" fill="none" stroke="${c}" stroke-width="${r2(it.w)}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${arrowHead(a, b, it.w)}" fill="${c}"/>`);
        if (it.arrow && n > 1) g += head(px(it.pts[n - 2]), px(it.pts[n - 1]));
        if (it.arrow0 && n > 1) g += head(px(it.pts[1]), px(it.pts[0]));
        out += la < 1 ? `<g opacity="${f(la)}">${g}</g>` : g;
      } else if (it.k === 'ball') {
        const q = px(it.at), r = it.r * fit.k, id = 'v3b' + ++ballId + (ctx.export ? 'x' : '');
        const c = TD.parseColor(it.color).hex, ba = V3.alpha(it.color);
        // 3D figures export ball color=c!65!white, so they get the plain ball's stops (src/domain/shapes.ts) for that tint;
        // a ball whose colour is given exactly (3D geometry's ball color=…) keeps that colour
        const b = it.exact ? c : V3.hex(V3.col(c, 65)), mid = it.exact ? V3.hex(V3.col(c, 80)) : b, dark = it.exact ? V3.hex(V3.col(c, 70, 'black')) : V3.hex(V3.col(b, 35, 'black'));
        if (it.shaded) out += `<defs><radialGradient id="${id}" cx="0.42" cy="0.38" r="0.7" fx="0.3" fy="0.25"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>`;
        out += `<circle cx="${r2(q.x)}" cy="${r2(q.y)}" r="${r2(r)}"${it.opacity != null && it.opacity < 1 ? ` opacity="${f(it.opacity)}"` : ''} fill="${it.shaded ? `url(#${id})` : 'none'}"${it.shaded && ba < 1 ? ` fill-opacity="${f(ba)}"` : ''}${it.stroke ? ` stroke="${V3.hex(it.stroke)}" stroke-width="${r2(it.w ?? V3.LW)}"` : ''}/>`;
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
  V3.errorSvg = (s: any, msg: any, ctx: any) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#c33" stroke-dasharray="4 3"/>` +
    noHit(TD.textSvg(msg, { size: 'small' }, '#c33', s.x + s.w / 2, s.y + s.h / 2, ctx));

  V3.tikz = function (items: any, fit: any, X: any) {
    const { px } = fit;
    const c = (p: any) => { const q = px(p); return X.c(q.x, q.y); };
    const col = (cc: any) => { const name = X.col(cc.c); return cc.p >= 100 ? name : `${name}!${cc.p}!${cc.o}`; };
    const path = (pts: any, close?: any) => pts.map(c).join(' -- ') + (close ? ' -- cycle' : '');
    const out = [];
    let arrows = false;
    const tip = '{Stealth[length=4pt]}';
    const alphaOf = (it: any, cc: any) => Math.min(it.opacity ?? 1, V3.alpha(cc));
    const emit = (list: any) => { for (const it of list) {
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
  V3.blockType = function (name: any, defaults: any, figure: any, presets = {}) {
    const cache = new WeakMap();
    const run = (s: any) => {
      const k = JSON.stringify(s), m = cache.get(s);
      if (m && m.k === k) return m.r;
      let r;
      try { r = figure(s); } catch (e: any) { r = { error: e.message }; }
      if (!r.error) r.fit = V3.fit(s, r.items, r.calls || [], r.rightX);
      cache.set(s, { k, r });
      return r;
    };
    return {
      name,
      pts: [['x', 'y']],
      create(p: any, d: any, tool: any) {
        const pre = (presets as Record<string, any>)[String(tool || '').split(':')[1]] || {};
        const o = JSON.parse(JSON.stringify({ ...defaults, ...pre }));
        return { type: String(tool || '').split(':')[0], x: p.x, y: p.y, ...o, w: 0, h: 0, _pw: o.w, _ph: o.h };
      },
      drag(s: any, a: any, q: any, e: any) { Object.assign(s, TD.box.drag(a, q, e)); },
      fix(s: any) {
        if (s.w < 30 || s.h < 30) { s.w = s._pw || defaults.w; s.h = s._ph || defaults.h; }
        delete s._pw; delete s._ph;
      },
      valid: () => true,
      handles: (s: any) => TD.box.handles(s),
      setHandle(s: any, k: any, q: any, e: any, o: any) { const b = TD.box.resize(o, k, q, e); if (b.w >= 60 && b.h >= 60) Object.assign(s, b); },
      anchors: (s: any) => TD.box.handles(s).map((h: any) => ({ x: h.x, y: h.y })),
      samples: (s: any) => [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }],
      svg(s: any, ctx: any) {
        const r = run(s);
        const hit = ctx.export ? '' : `<rect class="hitfill" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`;
        return (r.error ? V3.errorSvg(s, r.error, ctx) : V3.svg(r.items, r.fit, ctx)) + hit;
      },
      tikz(s: any, X: any) {
        const r = run(s);
        return r.error ? `% ${name}: ${r.error}` : V3.tikz(r.items, r.fit, X);
      },
      run,
    };
  };

  // a panel's apply(): view angles, checkboxes, the rest as typed; `rerender` keys redraw the panel
  V3.apply = (rerender: any[] = []) => function (s: any, t: any) {
    const k = t.dataset.p;
    if (!k) return false;
    if (k === 'view0' || k === 'view1') { s.view = [...(s.view || [115, 20])]; s.view[+k.slice(-1)] = parseFloat(t.value) || 0; return false; }
    s[k] = t.type === 'checkbox' ? t.checked : t.value;
    return rerender.includes(k);
  };
  V3.colors = (keys: any, defaults: any) => function (s: any, i: any) {
    const k = keys[i];
    return { get: () => s[k], set: (v: any) => { s[k] = v || defaults[k]; }, nullable: false };
  };
  // numbers typed in a field: plain numbers or pgfmath-like expressions such as 2*pi/3
  V3.num = (src: any, fb: any) => { const v = TD.evalNumber(String(src ?? '').trim() || 'x', NaN); return isFinite(v) ? v : fb; };
  // an expression in up to two variables named as in vars (e.g. ['t'], ['u', 'v'], ['r', 'z']), compiled to fn(a, b)
  V3.expr = (src: any, vars: any, label: any) => {
    let s = String(src ?? '').trim() || '0';
    const ph = ['\u0001', '\u0002'];
    vars.forEach((v: any, i: any) => { s = s.replace(new RegExp(`(?<![A-Za-z_0-9])${v}(?![A-Za-z_0-9(])`, 'g'), ph[i]); });
    s = s.replace(/\u0001/g, 'x').replace(/\u0002/g, 'y');
    const e = TD.getExpr(s, vars.length > 1 ? ['x', 'y'] : ['x']);
    if (e.error) throw new Error((label ? label + ': ' : '') + e.error);
    return e.fn;
  };

  TD.V3 = V3;
})();
