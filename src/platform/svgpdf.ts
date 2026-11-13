// An SVG as a vector PDF, for svg.sty to use where Inkscape can't run (the .zip of a LaTeX export). The browser
// lays the SVG out (in a sandboxed frame, so its styles and scripts touch nothing) and this file writes what it
// drew as PDF paths: shapes, paths, transforms, fills and strokes with their opacity, dashes, caps and joins,
// linear and radial gradients, clip paths, <use>, and text (each character where the browser put it, in the
// nearest of PDF's standard fonts: Helvetica, Times or Courier). What PDF can't say this simply (filters, masks,
// patterns, markers, pictures inside the SVG, text along a path or outside Latin-1, a gradient whose stops fade)
// returns null, and the caller draws the SVG as a picture instead.

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const ofDom = (d: DOMMatrix | SVGMatrix): M => [d.a, d.b, d.c, d.d, d.e, d.f];
const n = (v: number) => { const s = (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4); return s.replace(/\.?0+$/, '') || '0'; };
const ns = (...v: number[]) => v.map(n).join(' ');

/** why the SVG can't be written as vectors (thrown, caught by svgVectorPdf) */
class Unsupported extends Error {}
const no = (why: string): never => { throw new Unsupported(why); };

// ---- path data: every shape becomes a list of moveto / lineto / curveto / closepath in its own user space
type Seg = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [['L', x2, y2]];
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const parts = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9), step = dt / parts, k = (4 / 3) * Math.tan(step / 4), out: Seg[] = [];
  const pt = (t: number): [number, number] => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const dv = (t: number): [number, number] => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let i = 0; i < parts; i++) {
    const a = t1 + i * step, b = a + step, [ax, ay] = pt(a), [bx, by] = pt(b), [adx, ady] = dv(a), [bdx, bdy] = dv(b);
    out.push(['C', ax + k * adx, ay + k * ady, bx - k * bdx, by - k * bdy, i === parts - 1 ? x2 : bx, i === parts - 1 ? y2 : by]);
  }
  return out;
}

export function parsePath(d: string): Seg[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const out: Seg[] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, qx = 0, qy = 0, cx2 = 0, cy2 = 0, prev = '';
  const num = () => { const t = toks[i++]; if (t === undefined || /[a-zA-Z]/.test(t)) no('bad path data'); return +t!; };
  // arc flags may be written without separators ("a5 5 0 011 1"): split a run of digits
  const flag = () => {
    const t = toks[i];
    if (t === '0' || t === '1') { i++; return t === '1'; }
    if (t && /^[01]/.test(t)) { toks[i] = t.slice(1); return t[0] === '1'; }
    return no('bad arc flag');
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) no('path data without a command');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; break;
      case 'L': x = ox + num(); y = oy + num(); out.push(['L', x, y]); break;
      case 'H': x = ox + num(); out.push(['L', x, y]); break;
      case 'V': y = oy + num(); out.push(['L', x, y]); break;
      case 'C': { const a = ox + num(), b = oy + num(); cx2 = ox + num(); cy2 = oy + num(); x = ox + num(); y = oy + num(); out.push(['C', a, b, cx2, cy2, x, y]); break; }
      case 'S': { const r = /[CS]/.test(prev) ? [2 * x - cx2, 2 * y - cy2] : [x, y]; cx2 = ox + num(); cy2 = oy + num(); x = ox + num(); y = oy + num(); out.push(['C', r[0], r[1], cx2, cy2, x, y]); break; }
      case 'Q': { qx = ox + num(); qy = oy + num(); const ex = ox + num(), ey = oy + num(); out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]); x = ex; y = ey; break; }
      case 'T': { if (/[QT]/.test(prev)) { qx = 2 * x - qx; qy = 2 * y - qy; } else { qx = x; qy = y; } const ex = ox + num(), ey = oy + num(); out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]); x = ex; y = ey; break; }
      case 'A': { const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(), ex = ox + num(), ey = oy + num(); out.push(...arcToCubics(x, y, rx, ry, (rot * Math.PI) / 180, la, sw, ex, ey)); x = ex; y = ey; break; }
      case 'Z': out.push(['Z']); x = sx; y = sy; break;
      default: no('path command ' + cmd);
    }
    prev = C;
  }
  return out;
}

const K = 0.5522847498;
function ellipse(cx: number, cy: number, rx: number, ry: number): Seg[] {
  return [['M', cx + rx, cy], ['C', cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry], ['C', cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
    ['C', cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry], ['C', cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy], ['Z']];
}
function shapeSegs(el: Element): Seg[] | null {
  const len = (a: string) => ((el as any)[a]?.baseVal?.value ?? 0) as number;
  switch (el.localName) {
    case 'path': return parsePath(el.getAttribute('d') || '');
    case 'rect': {
      const x = len('x'), y = len('y'), w = len('width'), h = len('height');
      if (w <= 0 || h <= 0) return null;
      const ra = el.getAttribute('rx'), rb = el.getAttribute('ry');
      let rx = ra != null && ra !== 'auto' ? len('rx') : rb != null && rb !== 'auto' ? len('ry') : 0;
      let ry = rb != null && rb !== 'auto' ? len('ry') : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
      const kx = K * rx, ky = K * ry;
      return [['M', x + rx, y], ['L', x + w - rx, y], ['C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry], ['L', x + w, y + h - ry],
        ['C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h], ['L', x + rx, y + h], ['C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
        ['L', x, y + ry], ['C', x, y + ry - ky, x + rx - kx, y, x + rx, y], ['Z']];
    }
    case 'circle': { const r = len('r'); return r > 0 ? ellipse(len('cx'), len('cy'), r, r) : null; }
    case 'ellipse': {
      const ra = el.getAttribute('rx'), rb = el.getAttribute('ry');
      let rx = ra != null && ra !== 'auto' ? len('rx') : null, ry = rb != null && rb !== 'auto' ? len('ry') : null;
      if (rx == null) rx = ry ?? 0;
      if (ry == null) ry = rx;
      return rx > 0 && ry > 0 ? ellipse(len('cx'), len('cy'), rx, ry) : null;
    }
    case 'line': return [['M', len('x1'), len('y1')], ['L', len('x2'), len('y2')]];
    case 'polyline': case 'polygon': {
      const pts = [...((el as any).points as SVGPointList)].map((p) => [p.x, p.y]);
      if (!pts.length) return null;
      const s: Seg[] = pts.map(([x, y], i) => [i ? 'L' : 'M', x, y] as Seg);
      if (el.localName === 'polygon') s.push(['Z']);
      return s;
    }
  }
  return null;
}
const segsOut = (segs: Seg[], m?: M) => segs.map((s) => {
  if (s[0] === 'Z') return 'h';
  const p = s.slice(1) as number[], q: number[] = [];
  for (let i = 0; i < p.length; i += 2) q.push(...(m ? ap(m, p[i], p[i + 1]) : [p[i], p[i + 1]]));
  return `${ns(...q)} ${s[0] === 'M' ? 'm' : s[0] === 'L' ? 'l' : 'c'}`;
}).join('\n');

// ---- colours and paints
function rgba(c: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c);
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
  return [+m[1] / 255, +m[2] / 255, +m[3] / 255, a];
}
const urlId = (v: string) => (/url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(v) || [])[1] || null;

// standard PDF fonts: the nearest to the SVG's family, weight and style
function baseFont(cs: CSSStyleDeclaration) {
  const fam = cs.fontFamily.toLowerCase(), bold = parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold', it = /italic|oblique/.test(cs.fontStyle);
  const first = fam.split(',').map((f) => f.trim().replace(/["']/g, ''));
  let kind = 'sans';
  for (const f of first) {
    if (/mono|courier|consol|menlo|code/.test(f)) { kind = 'mono'; break; }
    if (/sans|helvetica|arial|inter|roboto|segoe|system-ui|verdana|tahoma|ui-|apple|noto sans|open sans|lato|calibri/.test(f)) { kind = 'sans'; break; }
    if (/serif|times|georgia|garamond|cambria|palatino|book|computer modern|cmu|latin modern/.test(f)) { kind = 'serif'; break; }
  }
  if (kind === 'serif') return bold && it ? 'Times-BoldItalic' : bold ? 'Times-Bold' : it ? 'Times-Italic' : 'Times-Roman';
  const b = kind === 'mono' ? 'Courier' : 'Helvetica';
  return bold && it ? `${b}-BoldOblique` : bold ? `${b}-Bold` : it ? `${b}-Oblique` : b;
}
// WinAnsiEncoding: Latin-1 plus the few characters it puts in 0x80–0x9f
const WIN: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
function winByte(ch: string) {
  const c = ch.charCodeAt(0);
  if ((c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff)) return c;
  return WIN[c] ?? no('a character outside the standard fonts: ' + ch);
}
const pdfStr = (b: number) => b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + String.fromCharCode(b) : b < 0x20 || b > 0x7e ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b);

// ---- the writer
interface Built { content: string; w: number; h: number; gs: Map<string, string>; shadings: string[]; fonts: Map<string, string>; forms: string[] }

function build(svg: SVGSVGElement, w: number, h: number): Built {
  const win = svg.ownerDocument.defaultView!;
  const root = svg.getBoundingClientRect(), vb = svg.viewBox?.baseVal;
  const vw = vb && vb.width ? vb.width : w, vh = vb && vb.height ? vb.height : h;
  const toRoot = (el: Element): M => mul([1, 0, 0, 1, -root.left, -root.top], ofDom((el as SVGGraphicsElement).getScreenCTM()!));
  let out: string[] = [];
  // transparency groups: what an element with opacity draws, faded as one (in the page's own coordinates)
  const forms: string[] = [];
  const gs = new Map<string, string>(), shadings: string[] = [], fonts = new Map<string, string>();
  const gsName = (fill: number, stroke: number) => {
    const k = `${n(fill)}/${n(stroke)}`;
    if (!gs.has(k)) gs.set(k, `/GS${gs.size}`);
    return gs.get(k)!;
  };
  const byId = (id: string) => svg.ownerDocument.getElementById(id);
  const len = (el: Element, a: string, d = 0) => { const v = (el as any)[a]?.baseVal; return v && el.hasAttribute(a) ? v.value as number : d; };
  const frac = (el: Element, a: string, d: number) => { const v = el.getAttribute(a); if (v == null) return d; return v.trim().endsWith('%') ? parseFloat(v) / 100 : parseFloat(v); };

  // gradient: its attributes and stops, following href to the gradient it extends
  function gradient(id: string) {
    let g = byId(id);
    if (!g || !/^(linear|radial)Gradient$/.test(g.localName)) return null;
    const kind = g.localName, chain: Element[] = [];
    for (let k = 0; g && k < 8 && /Gradient$/.test(g.localName); k++) { chain.push(g); const ref: string = (g.getAttribute('href') || g.getAttribute('xlink:href') || '').replace(/^#/, ''); g = ref ? byId(ref) : null; }
    const attr = (a: string) => { for (const e of chain) if (e.hasAttribute(a)) return { el: e, v: e.getAttribute(a)! }; return null; };
    const stopsOf = chain.find((e) => e.querySelector(':scope > stop'));
    const stops = stopsOf ? [...stopsOf.querySelectorAll(':scope > stop')].map((s) => {
      const cs = win.getComputedStyle(s), c = rgba(cs.stopColor) || [0, 0, 0, 1];
      return { off: Math.min(1, Math.max(0, frac(s, 'offset', 0))), c: c.slice(0, 3) as number[], a: c[3] * parseFloat(cs.stopOpacity || '1') };
    }) : [];
    for (let i = 1; i < stops.length; i++) stops[i].off = Math.max(stops[i].off, stops[i - 1].off);
    if ((attr('spreadMethod')?.v || 'pad') !== 'pad') no('a gradient that repeats');
    const units = attr('gradientUnits')?.v || 'objectBoundingBox';
    const tf = attr('gradientTransform');
    const gt: M = tf ? ofDom(((tf.el as any).gradientTransform.baseVal as SVGTransformList).consolidate()?.matrix || new DOMMatrix()) : [1, 0, 0, 1, 0, 0];
    return { kind, attr, stops, units, gt };
  }
  // a shading for the gradient in a space where its coordinates hold, and the alpha all its stops share
  function shading(id: string, bbox: DOMRect, m: M): { sh: string; m: M; alpha: number } | null {
    const g = gradient(id);
    if (!g || !g.stops.length) return null;
    const alpha = g.stops[0].a;
    if (g.stops.some((s) => Math.abs(s.a - alpha) > 1e-3)) no('a gradient that fades');
    const bb = g.units === 'objectBoundingBox';
    if (bb && (!bbox.width || !bbox.height)) return null;
    const num = (a: string, d: number) => {
      const v = g.attr(a)?.v;
      if (v == null) return d;
      const pct = v.trim().endsWith('%'), f = parseFloat(v);
      return pct ? (bb ? f / 100 : (f / 100) * (/x/.test(a) ? vw : /y/.test(a) ? vh : Math.hypot(vw, vh) / Math.SQRT2)) : f;
    };
    const space = mul(m, mul(bb ? [bbox.width, 0, 0, bbox.height, bbox.x, bbox.y] : [1, 0, 0, 1, 0, 0], g.gt));
    const st = g.stops.length === 1 ? [g.stops[0], { ...g.stops[0], off: 1 }] : g.stops;
    // one exponential function per pair of stops, stitched; colours outside the first and last stop are padded
    const fns = st.slice(1).map((s, i) => `<< /FunctionType 2 /Domain [0 1] /C0 [${ns(...st[i].c)}] /C1 [${ns(...s.c)}] /N 1 >>`);
    const bounds = st.slice(1, -1).map((s) => s.off);
    const domain = [st[0].off, st[st.length - 1].off];
    let fn: string;
    if (domain[1] - domain[0] < 1e-6) fn = `<< /FunctionType 2 /Domain [0 1] /C0 [${ns(...st[st.length - 1].c)}] /C1 [${ns(...st[st.length - 1].c)}] /N 1 >>`;
    else fn = fns.length === 1 ? fns[0].replace('/Domain [0 1]', `/Domain [${ns(...domain)}]`) : `<< /FunctionType 3 /Domain [${ns(...domain)}] /Functions [${fns.join(' ')}] /Bounds [${ns(...bounds)}] /Encode [${st.slice(1).map(() => '0 1').join(' ')}] >>`;
    // pad: extend past both ends; the function's domain is mapped onto the gradient's whole length
    let sh: string;
    if (g.kind === 'linearGradient') {
      const x1 = num('x1', 0), y1 = num('y1', 0), x2 = num('x2', bb ? 1 : vw), y2 = num('y2', 0);
      // coordinates at the first and last stop, so the function's domain lines up
      const p = (t: number) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      sh = `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${ns(...p(domain[0]), ...p(domain[1]))}] /Domain [${ns(...domain)}] /Function ${fn} /Extend [true true] >>`;
      if (domain[1] - domain[0] < 1e-6) sh = `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${ns(x1, y1, x2, y2)}] /Function ${fn} /Extend [true true] >>`;
    } else {
      const cx = num('cx', bb ? 0.5 : vw / 2), cy = num('cy', bb ? 0.5 : vh / 2), r = num('r', bb ? 0.5 : Math.hypot(vw, vh) / Math.SQRT2 / 2);
      const fx = num('fx', cx), fy = num('fy', cy), fr = num('fr', 0);
      // radial: the circles at the first and last stop
      const c = (t: number) => [fx + (cx - fx) * t, fy + (cy - fy) * t, fr + (r - fr) * t];
      const d0 = domain[1] - domain[0] < 1e-6 ? [0, 1] : domain;
      sh = `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${ns(...c(d0[0]), ...c(d0[1]))}] /Domain [${ns(...d0)}] /Function ${fn} /Extend [true true] >>`;
    }
    shadings.push(sh);
    return { sh: `/Sh${shadings.length - 1}`, m: space, alpha };
  }

  // the clip paths in force, as path operators in root space (outermost first)
  function clipOps(el: Element): string {
    const v = win.getComputedStyle(el).clipPath;
    if (!v || v === 'none') return '';
    const id = urlId(v), cp = id && byId(id);
    if (!cp || cp.localName !== 'clipPath') return no('a clip path that is not a <clipPath>');
    if (win.getComputedStyle(cp).clipPath !== 'none') no('a clip path with its own clip');
    let m = toRoot(el);
    if (cp.getAttribute('clipPathUnits') === 'objectBoundingBox') { const b = (el as SVGGraphicsElement).getBBox(); m = mul(m, [b.width, 0, 0, b.height, b.x, b.y]); }
    const ct = ((cp as any).transform?.baseVal as SVGTransformList)?.consolidate();
    if (ct) m = mul(m, ofDom(ct.matrix));
    let rule = 'nonzero', path = '';
    for (const c of cp.children) {
      if (c.localName === 'use' || c.localName === 'text') no('<use> or text inside a clip path');
      const s = shapeSegs(c);
      if (!s) continue;
      if (win.getComputedStyle(c).display === 'none') continue;
      const t = ((c as any).transform?.baseVal as SVGTransformList)?.consolidate();
      path += segsOut(s, t ? mul(m, ofDom(t.matrix)) : m) + '\n';
      rule = win.getComputedStyle(c).clipRule;
    }
    // nothing inside: everything is clipped away
    return (path || '0 0 m h\n') + (rule === 'evenodd' ? 'W* n' : 'W n');
  }

  function paintShape(el: SVGGraphicsElement, segs: Seg[], cs: CSSStyleDeclaration, op: number) {
    if (!segs.length) return;
    const m = toRoot(el), path = segsOut(segs);
    const even = cs.fillRule === 'evenodd';
    const fillV = cs.fill, strokeV = cs.stroke, sw = parseFloat(cs.strokeWidth) || 0;
    const head = (fa: number, sa: number) => `q\n${fa < 1 || sa < 1 ? gsName(fa, sa) + ' gs\n' : ''}${ns(...m)} cm\n`;
    // fill
    const fid = urlId(fillV);
    if (fid) {
      const sh = shading(fid, el.getBBox(), m);
      if (sh) out.push(`q\n${sh.alpha * op * +cs.fillOpacity < 1 ? gsName(sh.alpha * op * +cs.fillOpacity, 1) + ' gs\n' : ''}${ns(...m)} cm\n${path}\n${even ? 'W*' : 'W'} n\n${ns(...mul(inv(m), sh.m))} cm\n${sh.sh} sh\nQ`);
      else if (!/none/.test(fillV) && byId(fid) && !/Gradient$/.test(byId(fid)!.localName)) no('a pattern fill');
    } else if (fillV !== 'none') {
      const c = rgba(fillV);
      const a = c ? c[3] * op * +cs.fillOpacity : 0;
      if (c && a > 0) out.push(`${head(a, 1)}${ns(c[0], c[1], c[2])} rg\n${path}\n${even ? 'f*' : 'f'}\nQ`);
    }
    // stroke
    if (strokeV === 'none' || sw <= 0) return;
    if (urlId(strokeV)) no('a gradient or pattern on a stroke');
    const c = rgba(strokeV), a = c ? c[3] * op * +cs.strokeOpacity : 0;
    if (!c || a <= 0) return;
    const cap = { butt: 0, round: 1, square: 2 }[cs.strokeLinecap] ?? 0, join = { miter: 0, 'miter-clip': 0, round: 1, bevel: 2, arcs: 0 }[cs.strokeLinejoin] ?? 0;
    const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter((x) => x >= 0) : [];
    let dashOp = '';
    if (dash.length && dash.some((x) => x > 0)) dashOp = `[${ns(...(dash.length % 2 ? [...dash, ...dash] : dash))}] ${n(parseFloat(cs.strokeDashoffset) || 0)} d\n`;
    out.push(`${head(1, a)}${ns(c[0], c[1], c[2])} RG\n${n(sw)} w ${cap} J ${join} j ${n(parseFloat(cs.strokeMiterlimit) || 4)} M\n${dashOp}${path}\nS\nQ`);
  }

  function paintText(el: SVGTextElement, op: number) {
    if (el.querySelector('textPath')) no('text along a path');
    // the characters the browser lays out, each with the element whose style it takes
    const chars: { ch: string; from: Element }[] = [];
    const walkT = (node: Node, from: Element) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) for (const ch of c.textContent || '') chars.push({ ch, from });
        else if (c.nodeType === 1 && /^(tspan|a)$/.test((c as Element).localName)) walkT(c, c as Element);
      }
    };
    walkT(el, el);
    // white space as SVG lays it out (xml:space default): newlines go, tabs are spaces, runs of spaces are one,
    // and none at the start or the end
    const keep = el.getAttribute('xml:space') === 'preserve' || /pre/.test(win.getComputedStyle(el).whiteSpace);
    let laid = chars.map((c) => ({ ...c, ch: keep ? c.ch.replace(/[\n\r\t]/g, ' ') : c.ch.replace(/[\n\r]/g, '').replace(/\t/g, ' ') })).filter((c) => c.ch !== '');
    if (!keep) {
      laid = laid.filter((c, i) => !(c.ch === ' ' && i > 0 && laid[i - 1].ch === ' '));
      while (laid.length && laid[0].ch === ' ') laid.shift();
      while (laid.length && laid[laid.length - 1].ch === ' ') laid.pop();
    }
    const count = el.getNumberOfChars();
    if (count !== laid.length) no('text laid out in a way not followed here');
    const m = toRoot(el);
    for (let i = 0; i < count; i++) {
      const { ch, from } = laid[i];
      if (ch === ' ') continue;
      const cs = win.getComputedStyle(from);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (urlId(cs.fill)) no('a gradient on text');
      const c = rgba(cs.fill);
      const a = c ? c[3] * op * +cs.fillOpacity : 0;
      if (!c || a <= 0) continue;
      let p: DOMPoint, rot = 0;
      try { p = el.getStartPositionOfChar(i); rot = el.getRotationOfChar(i); } catch { continue; } // a character the browser hid
      const size = parseFloat(cs.fontSize) || 16, font = baseFont(cs);
      if (!fonts.has(font)) fonts.set(font, `/F${fonts.size}`);
      const r = (rot * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
      out.push(`q\n${a < 1 ? gsName(a, 1) + ' gs\n' : ''}${ns(...m)} cm\n${ns(c[0], c[1], c[2])} rg\nBT\n${fonts.get(font)} ${n(size)} Tf\n${ns(co, si, si, -co, p.x, p.y)} Tm\n(${pdfStr(winByte(ch))}) Tj\nET\nQ`);
    }
  }

  const SKIP = /^(defs|clipPath|mask|marker|pattern|linearGradient|radialGradient|symbol|style|title|desc|metadata|script|filter)$/;
  function walk(el: Element, op: number) {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return;
    if (cs.mask && cs.mask !== 'none' || (cs as any).maskImage && (cs as any).maskImage !== 'none') no('a mask');
    if (cs.filter && cs.filter !== 'none') no('a filter');
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') no('a blend mode');
    const name = el.localName;
    if (name === 'image' || name === 'foreignObject' || name === 'switch' || name === 'video' || name === 'canvas') no('<' + name + '>');
    const own = parseFloat(cs.opacity) || (cs.opacity === '0' ? 0 : 1);
    if (op * own <= 0) return;
    // an element's opacity fades what it draws as one: a group, or a shape with a fill and a stroke, is drawn
    // into a transparency group; anything else just takes the alpha
    const both = !/^(g|a|svg|text)$/.test(el.localName) && cs.fill !== 'none' && cs.stroke !== 'none' && (parseFloat(cs.strokeWidth) || 0) > 0;
    const group = own < 1 && (/^(g|a|svg)$/.test(el.localName) && el.children.length > 1 || both);
    const o = group ? 1 : op * own;
    let saved: string[] | null = null;
    if (group) { saved = out; out = []; }
    if (cs.vectorEffect === 'non-scaling-stroke') no('a stroke that does not scale');
    if (/^\s*(stroke|markers)/.test(cs.paintOrder || '')) no('a stroke painted under its fill');
    const clip = clipOps(el);
    if (clip) out.push('q\n' + clip);
    if (name === 'g' || name === 'a' || name === 'svg') {
      for (const c of el.children) if (!SKIP.test(c.localName)) walk(c, o);
    } else if (name === 'text') {
      paintText(el as SVGTextElement, o);
    } else {
      const segs = shapeSegs(el);
      if (segs) {
        if (['marker-start', 'marker-mid', 'marker-end'].some((k) => { const v = cs.getPropertyValue(k); return v && v !== 'none'; })) no('markers');
        if (cs.visibility !== 'hidden') paintShape(el as SVGGraphicsElement, segs, cs, o);
      }
    }
    if (clip) out.push('Q');
    if (saved) {
      forms.push(out.join('\n'));
      out = saved;
      out.push(`q\n${gsName(op * own, op * own)} gs\n/Fm${forms.length - 1} Do\nQ`);
    }
  }
  // the root's children (its own clip and opacity count too)
  walk(svg, 1);
  return { content: out.join('\n'), w, h, gs, shadings, fonts, forms };
}
function inv(m: M): M {
  const d = m[0] * m[3] - m[1] * m[2];
  if (!d) return [1, 0, 0, 1, 0, 0];
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}

/** <use> as a copy of what it names, in a group placed where the use is (inherited attributes move with it) */
function expandUses(doc: Document) {
  for (let pass = 0; pass < 8; pass++) {
    const uses = [...doc.querySelectorAll('use')];
    if (!uses.length) return;
    for (const u of uses) {
      const id = (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^#/, '');
      const ref = id ? doc.getElementById(id) : null;
      if (!ref || ref.contains(u)) { u.remove(); continue; }
      const NS = 'http://www.w3.org/2000/svg', g = doc.createElementNS(NS, 'g');
      for (const a of [...u.attributes]) if (!/^(x|y|width|height|href|xlink:href|id)$/.test(a.name)) g.setAttribute(a.name, a.value);
      const x = parseFloat(u.getAttribute('x') || '0'), y = parseFloat(u.getAttribute('y') || '0');
      g.setAttribute('transform', `${u.getAttribute('transform') || ''} translate(${x} ${y})`);
      let copy: Element;
      if (ref.localName === 'symbol') {
        if (ref.hasAttribute('viewBox')) no('a <symbol> with a viewBox');
        copy = doc.createElementNS(NS, 'g');
        for (const a of [...ref.attributes]) if (a.name !== 'id') copy.setAttribute(a.name, a.value);
        for (const c of ref.childNodes) copy.appendChild(c.cloneNode(true));
      } else copy = ref.cloneNode(true) as Element;
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      g.appendChild(copy);
      u.replaceWith(g);
    }
  }
  if (doc.querySelector('use')) no('<use> nested too deep');
}

/** the PDF of an SVG (a data: URL or its markup) drawn as vectors, w × h px (96 to the inch); null when it uses
 *  something this can't write as vectors */
export async function svgVectorPdf(svgText: string, w: number, h: number): Promise<Uint8Array | null> {
  const frame = document.createElement('iframe');
  // scripts never run (sandbox without allow-scripts); same origin so the page can read the layout
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-${Math.ceil(w) + 100}px;top:0;width:${Math.ceil(w) + 20}px;height:${Math.ceil(h) + 20}px;border:0;visibility:hidden;pointer-events:none`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write('<!doctype html><html><head><style>html,body{margin:0;padding:0}svg{display:block}</style></head><body></body></html>'); doc.close();
    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const src = parsed.documentElement;
    if (src.localName !== 'svg' || parsed.querySelector('parsererror')) return null;
    parsed.querySelectorAll('script, foreignObject').forEach((e) => { if (e.localName === 'script') e.remove(); });
    const svg = doc.importNode(src, true) as unknown as SVGSVGElement;
    // event handlers never run either way; drop them so nothing waits on them
    for (const e of [svg, ...svg.querySelectorAll('*')]) for (const a of [...e.attributes]) if (/^on/i.test(a.name)) e.removeAttribute(a.name);
    svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
    doc.body.appendChild(svg);
    expandUses(doc);
    // web fonts the SVG names would load late; the standard fonts stand in for them anyway
    const B = build(svg, w, h);
    return await writePdf(B);
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  } finally { frame.remove(); }
}

async function deflate(u8: Uint8Array) {
  return new Uint8Array(await new Response(new Blob([u8 as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}
async function writePdf(B: Built): Promise<Uint8Array> {
  const pw = (B.w * 72) / 96, ph = (B.h * 72) / 96;
  // px (y down) → pt (y up)
  const content = `${ns(0.75, 0, 0, -0.75, 0, ph)} cm\n${B.content}\n`;
  const body = await deflate(new TextEncoder().encode(content));
  const enc = new TextEncoder(), parts: Uint8Array[] = [], offs: number[] = [];
  let len = 0;
  const add = (x: string | Uint8Array) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  let next = 1;
  const objs: { id: number; body: (string | Uint8Array)[] }[] = [];
  const obj = (...b: (string | Uint8Array)[]) => { const id = next++; objs.push({ id, body: b }); return id; };
  const catalog = obj(), pages = obj(), page = obj();
  const contentId = obj(`<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`, body, '\nendstream');
  const gsRes = [...B.gs].map(([k, name]) => { const [f, s] = k.split('/'); return `${name.slice(1)} ${obj(`<< /Type /ExtGState /ca ${f} /CA ${s} >>`)} 0 R`; });
  const shRes = B.shadings.map((s, i) => `Sh${i} ${obj(s)} 0 R`);
  const fontRes = [...B.fonts].map(([font, name]) => `${name.slice(1)} ${obj(`<< /Type /Font /Subtype /Type1 /BaseFont /${font}${/^(Symbol|ZapfDingbats)$/.test(font) ? '' : ' /Encoding /WinAnsiEncoding'} >>`)} 0 R`);
  // the forms are drawn in the page's coordinates (px, y down, under the page's first cm)
  const fmRes: string[] = [];
  const resOf = () => [gsRes.length ? `/ExtGState << ${gsRes.map((r) => '/' + r).join(' ')} >>` : '', shRes.length ? `/Shading << ${shRes.map((r) => '/' + r).join(' ')} >>` : '', fontRes.length ? `/Font << ${fontRes.map((r) => '/' + r).join(' ')} >>` : '', fmRes.length ? `/XObject << ${fmRes.map((r) => '/' + r).join(' ')} >>` : ''].filter(Boolean).join(' ');
  // a form may draw an earlier one (groups inside groups): each gets the resources of those before it
  for (const [i, f] of B.forms.entries()) {
    const data = await deflate(new TextEncoder().encode(f));
    fmRes.push(`Fm${i} ${obj(`<< /Type /XObject /Subtype /Form /BBox [${ns(-1, -1, B.w + 1, B.h + 1)}] /Group << /S /Transparency >> /Resources << ${resOf()} >> /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, data, '\nendstream')} 0 R`);
  }
  const res = resOf();
  objs[catalog - 1].body = [`<< /Type /Catalog /Pages ${pages} 0 R >>`];
  objs[pages - 1].body = [`<< /Type /Pages /Count 1 /Kids [${page} 0 R] >>`];
  objs[page - 1].body = [`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(pw)} ${n(ph)}] /Resources << ${res} >> /Contents ${contentId} 0 R >>`];
  add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  for (const o of objs) { offs[o.id] = len; add(`${o.id} 0 obj\n`); for (const b of o.body) add(b); add('\nendobj\n'); }
  const xref = len;
  add(`xref\n0 ${next}\n0000000000 65535 f \n` + objs.map((o) => String(offs[o.id]).padStart(10, '0') + ' 00000 n \n').join(''));
  add(`trailer\n<< /Size ${next} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const outp = new Uint8Array(len);
  let p = 0; for (const u of parts) { outp.set(u, p); p += u.length; }
  return outp;
}
