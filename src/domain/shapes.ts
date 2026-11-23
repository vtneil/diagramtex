import { measurementElement } from './measurement';
import { labelImage, onLabelFontsChange, prepareLabelFont } from './label-image';
import { runtime as TD } from '../runtime';
import { objectFont, docFontPreamble, docFont, hasThai, thaiFallback, finishThai, THAI_BREAK_DEF, THAI_PDF, type TexEngine } from '../core/doc-fonts';
// Shape definitions: geometry, handles, SVG rendering and TikZ export.
// Units: world coordinates are SVG px (y down). 40px = 1cm in TikZ (y up).
(function () : any {
  TD.unsaved = TD.unsaved || []; // checks that say an open editor holds edits not yet applied
  TD.VERSION = '1.57.2'; // app version: bump with each release tag (shown in the sidebar footer)
  const PX = (TD.PX_PER_CM = 40);
  const K = (TD.PT_PER_PX = 28.4528 / PX); // pt per px
  TD.GRID = 10;

  TD.SIZES = [
    ['tiny', 5], ['scriptsize', 7], ['footnotesize', 8], ['small', 9], ['normalsize', 10],
    ['large', 12], ['Large', 14.4], ['LARGE', 17.28], ['huge', 20.74], ['Huge', 24.88],
  ];
  TD.BLOCK_SIZE = 'large'; // a new block's label size (XyMatrix, quantum, circuit, tree), whatever the text default is
  // size is a LaTeX size name or a number (px)
  TD.sizePx = (name: any) => (typeof name === 'number' ? name : (TD.SIZES.find((s: any) => s[0] === name) || TD.SIZES[4])[1] / K);
  TD.FONTS = [
    ['default', '(font default)', 'KaTeX_Main, "Times New Roman", serif', ''],
    ['cmr', 'Computer Modern Serif', 'KaTeX_Main, serif', '\\rmfamily'],
    ['cmss', 'Computer Modern Sans', 'KaTeX_SansSerif, sans-serif', '\\sffamily'],
    ['cmtt', 'Computer Modern Typewriter', 'KaTeX_Typewriter, monospace', '\\ttfamily'],
    ['times', 'Times New Roman', '"Times New Roman", Times, serif', '\\fontfamily{ptm}\\selectfont'],
    ['arial', 'Arial / Helvetica', 'Arial, Helvetica, sans-serif', '\\fontfamily{phv}\\selectfont'],
    ['courier', 'Courier New', '"Courier New", Courier, monospace', '\\fontfamily{pcr}\\selectfont'],
    // Thai fonts served with the app (fonts/tlwg-*.woff2, TLWG): for viewing only, so nothing is written to LaTeX
    // (the text exports in the document's font); named with their Thai names, shown in their own face
    ['garuda', 'Garuda (ครุฑ)', 'Garuda, sans-serif', ''],
    ['kinnari', 'Kinnari (กินรี)', 'Kinnari, serif', ''],
    ['laksaman', 'Laksaman (ลักษมัณ)', 'Laksaman, sans-serif', ''],
  ];
  // the fonts above that load from the web: text measured before one arrived is measured again once it has
  const WEB_FONTS = new Set(['Garuda', 'Kinnari', 'Laksaman']);
  const fontOf = (k: any) => TD.FONTS.find((f: any) => f[0] === k) || TD.FONTS[0];

  // Colors: '#rrggbb' or '#rrggbbaa' (alpha). null = none.
  TD.parseColor = (c: any) => {
    if (!c) return null;
    if (typeof c === 'object') c = TD.fillColor(c);
    const h = c.replace('#', '');
    return { hex: '#' + h.slice(0, 6).toLowerCase(), a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  };
  TD.css = (c: any) => {
    if (c && typeof c === 'object') return TD.fillRef(c);
    if (c === 'currentColor') return c; // previews drawn in the surrounding UI's ink
    const p = TD.parseColor(c);
    if (!p) return 'none';
    if (p.a >= 1) return p.hex;
    const n = parseInt(p.hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round(p.a * 1000) / 1000})`;
  };
  const css = TD.css;

  // Arrow tips: [key, name, TikZ arrows.meta spec]
  const TIP_DEFS = [
    ['none', 'None', ''],
    ['stealth', 'Stealth', 'Stealth'], ['latex', 'Latex', 'Latex'], ['to', 'To (open)', 'To'],
    ['stealthr', 'Stealth, reversed', 'Stealth[reversed]'], ['latexr', 'Latex, reversed', 'Latex[reversed]'], ['tor', 'To, reversed', 'To[reversed]'],
    ['stealth2', 'Double stealth', 'Stealth[] Stealth[]'], ['latex2', 'Double latex', 'Latex[] Latex[]'], ['to2', 'Double to', 'To[] To[]'],
    ['harpoon', 'Harpoon (left)', 'Straight Barb[harpoon]'], ['harpoonr', 'Harpoon (right)', 'Straight Barb[harpoon, swap]'],
    ['hooks', 'Hooks', 'Hooks'], ['hook', 'Hook', 'Hooks[right]'],
    ['bar', 'Bar', 'Bar'], ['bar2', 'Double bar', 'Bar[] Bar[]'], ['tobar', 'To with bar', 'To[] Bar[]'],
    ['bracket', 'Bracket', 'Bracket'], ['bracketr', 'Bracket, reversed', 'Bracket[reversed]'],
    ['paren', 'Parenthesis', 'Parenthesis'], ['parenr', 'Parenthesis, reversed', 'Parenthesis[reversed]'],
    ['circle', 'Circle', 'Circle'], ['ocircle', 'Open circle', 'Circle[open]'],
    ['square', 'Square', 'Square'], ['osquare', 'Open square', 'Square[open]'],
    ['diamond', 'Diamond', 'Turned Square'], ['odiamond', 'Open diamond', 'Turned Square[open]'],
    ['plus', 'Cross (rays)', 'Rays[n=4]'],
  ];
  TD.TIPS = TIP_DEFS.map(([k, n]) => [k, n]);
  const TIKZ_TIP = Object.fromEntries<any>(TIP_DEFS.filter((d) => d[2]).map(([k, , t]) => [k, t]));
  TD.TIKZ_TIP = TIKZ_TIP;
  // line decorations
  TD.SHAFTS = [['single', 'Single'], ['double', 'Double'], ['wave', 'Wavy'], ['ticks', 'Ticked']];
  TD.CROSSES = [['none', 'None'], ['hop', 'Hop over lines below'], ['gap', 'Gap (white halo)']];
  // keys every line-like shape has (absent in older files = default)
  TD.LINE_EXTRA = { midTip: 'none', shaft: 'single', cross: 'none' };
  TD.LINEISH = new Set(['line', 'curve', 'poly', 'arc']);

  // ---------- helpers ----------
  const r2 = (n: any) => Math.round(n * 100) / 100;
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (v: any, fb?: any) => {
    const l = Math.hypot(v.x, v.y);
    return l < 1e-9 ? fb || { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
  };
  const sub = (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y });
  const pt = (q: any) => `${r2(q.x)},${r2(q.y)}`;
  TD.util = { r2, esc, dist, norm, sub };

  // Constrain q to 15-degree steps around a.
  function constrain(a: any, q: any) {
    const ang = Math.atan2(q.y - a.y, q.x - a.x);
    const step = Math.PI / 12;
    const s = Math.round(ang / step) * step;
    const d = dist(a, q);
    return { x: a.x + Math.cos(s) * d, y: a.y + Math.sin(s) * d };
  }
  TD.constrain = constrain;

  function dashArray(dash: any, w: any) {
    const on = 3 / K, off = 2 / K;
    if (dash === 'dashed') return `${r2(on)} ${r2(on)}`;
    if (dash === 'dotted') return `${r2(w)} ${r2(off)}`;
    if (dash === 'dashdot') return `${r2(on)} ${r2(off)} ${r2(w)} ${r2(off)}`;
    const pat = TD.dashPat && TD.dashPat(dash);
    if (pat && pat.length && pat.some((n: any) => n > 0)) return (pat.length % 2 ? pat.concat(pat) : pat).map((n: any) => r2(n / K)).join(' ');
    return '';
  }
  TD.dashArray = dashArray;

  function strokeAttrs(s: any, fillable?: any) {
    const a = [];
    if (s.stroke) {
      a.push(`stroke="${css(s.stroke)}" stroke-width="${s.width}"`);
      const da = dashArray(s.dash, s.width);
      if (da) a.push(`stroke-dasharray="${da}"`);
    } else a.push('stroke="none"');
    a.push(`fill="${fillable && s.fill ? css(s.fill) : 'none'}"`);
    return a.join(' ');
  }

  const wrap = (s: any, inner: any) => (s.opacity != null && s.opacity < 1 ? `<g opacity="${s.opacity}">${inner}</g>` : inner);
  const hit = (d: any, ctx: any) => (ctx.export ? '' : `<path class="hit" d="${d}" stroke-width="${ctx.hit}"/>`);

  // Computer Modern Rightarrow (arrows.meta To, tikz-cd's cm to): width 2.097 x length, two curves from the back
  // corners into the point, round caps and join. d = distance of the drawn point behind P; dir -1 = reversed, its
  // back corners on P. back = where the line stops, end = the back end (where a following tip's point goes).
  function cmArrow(P: any, u: any, w: any, color: any, len: any, d: any, dir: any) {
    const n = { x: -u.y, y: u.x }, ca = len - w, cb = 2.096774 * len - w;
    const X = (x: any) => (dir > 0 ? d - x : d + ca + 0.5 * w + x);
    const c = (x: any, y: any) => pt({ x: P.x - u.x * X(x) + n.x * y, y: P.y - u.y * X(x) + n.y * y });
    const svg = `<path d="M${c(-ca, cb / 2)}C${c(-0.81731 * ca, 0.2 * cb)} ${c(-0.41019 * ca, 0.05833 * cb)} ${c(0, 0)}C${c(-0.41019 * ca, -0.05833 * cb)} ${c(-0.81731 * ca, -0.2 * cb)} ${c(-ca, -cb / 2)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return { svg, back: dir > 0 ? d + 0.5 * w : d + ca, end: d + ca + w };
  }

  // Arrow tip geometry. P = tip point, u = unit direction pointing out of the path at P.
  function tip(type: any, P: any, u: any, w: any, color: any) : any {
    if (!type || type === 'none') return { svg: '', back: 0 };
    const lw = w * K;
    const L = (3 + 4.5 * lw) / K;
    const n = { x: -u.y, y: u.x };
    const at = (a: any, b: any) => ({ x: P.x - u.x * a + n.x * b, y: P.y - u.y * a + n.y * b });
    const W = 0.375 * L;
    const cmTo = (d: any, dir: any) => cmArrow(P, u, w, color, (1.6 + 2.2 * lw) / K, d, dir);
    switch (type) {
      case 'stealth':
        return { svg: `<path d="M${pt(P)}L${pt(at(L, W))}L${pt(at(0.675 * L, 0))}L${pt(at(L, -W))}Z" fill="${color}"/>`, back: 0.6 * L };
      case 'latex':
        return {
          svg: `<path d="M${pt(P)}C${pt(at(0.1228 * L, 0.0779 * W))} ${pt(at(0.6626 * L, 0.5195 * W))} ${pt(at(L, W))}L${pt(at(L, -W))}C${pt(at(0.6626 * L, -0.5195 * W))} ${pt(at(0.1228 * L, -0.0779 * W))} ${pt(P)}Z" fill="${color}"/>`,
          back: 0.8 * L,
        };
      case 'to': return cmTo(0.5 * w, 1);
      case 'bar': {
        const H = (1.5 + 2 * lw) / K;
        return { svg: `<path d="M${pt(at(w / 2, H))}L${pt(at(w / 2, -H))}" stroke="${color}" stroke-width="${w}"/>`, back: 0 };
      }
      case 'circle':
      case 'ocircle': {
        const R = (2.39 + 3.19 * lw) / K / 2;
        const c = at(R, 0);
        return type === 'circle'
          ? { svg: `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(R)}" fill="${color}"/>`, back: R }
          : { svg: `<circle cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(R - w / 2)}" fill="none" stroke="${color}" stroke-width="${w}"/>`, back: 2 * R };
      }
      case 'tor': return cmTo(0, -1);
      case 'stealthr': case 'latexr': {
        // same tip turned round: its back sits on the end of the path
        const q: any = tip(type.slice(0, -1), at(L, 0), { x: -u.x, y: -u.y }, w, color);
        return { svg: q.svg, back: 0.3 * L };
      }
      case 'to2': {
        // the second tip's point sits on the first one's back end; the line runs on to the front tip
        const t1 = cmTo(0.5 * w, 1), t2 = cmTo(t1.end, 1);
        return { svg: t1.svg + t2.svg, back: t1.back };
      }
      case 'stealth2': case 'latex2': {
        const base = type.slice(0, -1), off = base === 'latex' ? 0.8 * L : 0.6 * L;
        const a: any = tip(base, P, u, w, color), b: any = tip(base, at(off, 0), u, w, color);
        return { svg: a.svg + b.svg, back: off + b.back };
      }
      case 'harpoon': case 'harpoonr': {
        const l = 0.75 * L, sgn = type === 'harpoon' ? -1 : 1;
        return { svg: `<path d="M${pt(at(w * 0.45, 0))}L${pt(at(l + w * 0.45, sgn * 0.6 * l))}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`, back: w * 0.5 };
      }
      case 'hooks': case 'hook': {
        // arrows.meta Hooks: length 0.75pt+1.25lw; two forward half-circles of radius length-lw/2 whose junction sits `length` behind the path end
        const l = (0.75 + 1.25 * lw) / K, r = (0.75 + 0.75 * lw) / K, sides = type === 'hooks' ? [-1, 1] : [1], J = at(l, 0);
        const d = sides.map((sg) => {
          const Q = at(l, sg * 2 * r), M = at(l - r, sg * r);
          const cr = (M.x - J.x) * (Q.y - M.y) - (M.y - J.y) * (Q.x - M.x);
          return `M${pt(J)}A${r2(r)},${r2(r)} 0 0,${cr > 0 ? 1 : 0} ${pt(Q)}`;
        }).join('');
        return { svg: `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`, back: l - 0.25 * w };
      }
      case 'bar2': case 'tobar': {
        const H = (1.5 + 2 * lw) / K, g = Math.max(2 * w, 0.25 * L);
        const bar = (a: any) => `<path d="M${pt(at(a + w / 2, H))}L${pt(at(a + w / 2, -H))}" stroke="${color}" stroke-width="${w}"/>`;
        if (type === 'bar2') return { svg: bar(0) + bar(g), back: 0 };
        // To's point touches the bar's back
        return { svg: bar(0) + cmTo(1.5 * w, 1).svg, back: 0 };
      }
      case 'bracket': case 'bracketr': {
        // Tee Barb: bar width 3pt+4lw, arms 0.75pt+lw long, the bar's front edge on the path end
        const H = (1.5 + 2 * lw) / K - w / 2, arm = (0.75 + lw) / K, rev = type === 'bracketr', x0 = rev ? arm + w / 2 : w / 2, d = rev ? -arm : arm;
        return { svg: `<path d="M${pt(at(x0 + d, H))}L${pt(at(x0, H))}L${pt(at(x0, -H))}L${pt(at(x0 + d, -H))}" fill="none" stroke="${color}" stroke-width="${w}"/>`, back: 0 };
      }
      case 'paren': case 'parenr': {
        // Arc Barb[arc=120]: +-60 degree elliptical arc, length 1.725pt+2.3lw, width 2*length, front on the path end
        const l = (1.725 + 2.3 * lw) / K, rx = l - w / 2, ry = l - w / 2, rev = type === 'parenr', pts = [];
        for (let k = 0; k <= 24; k++) {
          const a = ((60 - (120 * k) / 24) * Math.PI) / 180, x = rx * Math.cos(a);
          pts.push(at(rev ? x : l - x, ry * Math.sin(a)));
        }
        return { svg: `<path d="M${pts.map(pt).join('L')}" fill="none" stroke="${color}" stroke-width="${w}"/>`, back: 0 };
      }
      case 'square': case 'osquare': case 'diamond': case 'odiamond': {
        // Square: side 2.12pt+2.83lw. Turned Square (Kite): length 3pt+4lw. The tip's stroke sits inside that size.
        const open = type[0] === 'o', dia = type.endsWith('diamond');
        const sz = (dia ? 3 + 4 * lw : 2.12132 + 2.828427 * lw) / K, a = sz / 2, e = open ? (dia ? Math.SQRT2 : 1) * w / 2 : 0;
        const pts = dia ? [at(e, 0), at(a, a - e), at(2 * a - e, 0), at(a, e - a)] : [at(e, a - e), at(2 * a - e, a - e), at(2 * a - e, e - a), at(e, e - a)];
        const dd = 'M' + pts.map(pt).join('L') + 'Z';
        return open
          ? { svg: `<path d="${dd}" fill="#fff" stroke="${color}" stroke-width="${w}" stroke-linejoin="miter"/>`, back: 2 * a - w / 2 }
          : { svg: `<path d="${dd}" fill="${color}"/>`, back: dia ? a : 2 * a - w / 2 };
      }
      case 'plus': {
        // TikZ's Rays[n=4] starts its rays half a step (45°) round, so it is a cross: ×
        const R = (1.5 + 2.25 * lw) / K, h = R * Math.SQRT1_2;
        const e1 = at(0, h), e2 = at(2 * h, -h), e3 = at(0, -h), e4 = at(2 * h, h);
        return { svg: `<path d="M${pt(e1)}L${pt(e2)}M${pt(e3)}L${pt(e4)}" stroke="${color}" stroke-width="${w}"/>`, back: h };
      }
    }
    return { svg: '', back: 0 };
  }

  // ---------- line decorations: shaft (double / wavy / ticked), middle & bend tips, crossings ----------
  let flatPath: any = null;
  function measurePath(d: any) {
    if (!flatPath) {
      const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden');
      flatPath = document.createElementNS(NS, 'path');
      sv.appendChild(flatPath); document.body.appendChild(sv);
    }
    flatPath.setAttribute('d', d);
    let len = 0;
    try { len = flatPath.getTotalLength(); } catch (e: any) { len = 0; }
    const at = (l: any) => { const p = flatPath.getPointAtLength(Math.max(0, Math.min(len, l))); return { x: p.x, y: p.y }; };
    const dir = (l: any) => norm(sub(at(Math.min(len, l + 0.5)), at(Math.max(0, l - 0.5))));
    return { len, at, dir };
  }
  TD.measurePath = measurePath;
  const ext = (s: any, k: any) => s[k] ?? TD.LINE_EXTRA[k];
  // wavy (TikZ snake: amplitude 2.5pt, segment length 10pt) and ticked versions of a path
  const WAVE_A = 2.5 / K, WAVE_L = 10 / K, TICK_L = 6 / K, TICK_A = 3 / K;
  function wavePath(d: any) {
    const m = measurePath(d);
    if (m.len < 1) return d;
    const n = Math.max(8, Math.ceil(m.len / 1.5)), out = [];
    for (let i = 0; i <= n; i++) {
      const l = (m.len * i) / n, p = m.at(l), u = m.dir(l), a = WAVE_A * Math.sin((2 * Math.PI * l) / WAVE_L);
      out.push((i ? 'L' : 'M') + pt({ x: p.x + u.y * a, y: p.y - u.x * a }));
    }
    return out.join('');
  }
  function tickPath(d: any, s: Record<string, any> = {}) {
    const TL = s.tick > 0 ? +s.tick : TICK_L, TA = s.ticksz > 0 ? s.ticksz / 2 : TICK_A;
    const m = measurePath(d), out = [];
    for (let l = 0; l <= m.len + 0.01; l += TL) {
      const p = m.at(l), u = m.dir(l), n = { x: u.y * TA, y: -u.x * TA };
      out.push(`M${pt({ x: p.x + n.x, y: p.y + n.y })}L${pt({ x: p.x - n.x, y: p.y - n.y })}`);
    }
    return out.join('');
  }
  // The stroke of a line-like shape. d = drawn path (already shortened for the end tips),
  // full = whole path (for middle / bend tips), bends = list of {P, u} (polyline bends).
  function strokeSvg(s: any, d: any, full: any, bends?: any, fillable?: any) {
    if (!s.stroke) return `<path d="${d}" ${strokeAttrs(s, fillable)}/>`;
    const col = css(s.stroke), shaft = ext(s, 'shaft'), da = dashArray(s.dash, s.width);
    const dash = da ? ` stroke-dasharray="${da}"` : '';
    let out = '';
    const dd = shaft === 'wave' ? wavePath(d) : d;
    if (ext(s, 'cross') === 'gap') out += `<path d="${dd}" fill="none" stroke="#fff" stroke-width="${r2(s.width + 6)}" stroke-linecap="butt"/>`;
    if (fillable && s.fill && shaft !== 'single') out += `<path d="${d}" stroke="none" fill="${css(s.fill)}"/>`;
    if (shaft === 'double') {
      out += `<path d="${dd}" fill="none" stroke="${col}" stroke-width="${r2(3 * s.width)}"${dash}/>` +
        `<path d="${dd}" fill="none" stroke="#fff" stroke-width="${r2(s.width)}"${dash}/>`;
    } else out += `<path d="${dd}" ${strokeAttrs(s, fillable && shaft === 'single')} stroke-linejoin="round"/>`;
    if (shaft === 'ticks') out += `<path d="${tickPath(full || d, s)}" fill="none" stroke="${col}" stroke-width="${s.width}"/>`;
    const mt = ext(s, 'midTip');
    if (mt !== 'none' && full) {
      const m = measurePath(full);
      if (m.len > 1) out += tip(mt, m.at(m.len / 2), m.dir(m.len / 2), s.width, col).svg;
    }
    if (s.bpTip && s.bpTip !== 'none' && bends) for (const b of bends) out += tip(s.bpTip, b.P, b.u, s.width, col).svg;
    return out;
  }
  // TikZ options for the same decorations. fr = fractions of the path length at the bends.
  function decoOpts(s: any, X: any, fr: any) {
    const o: any[] = [], shaft = ext(s, 'shaft');
    if (!s.stroke) return o;
    if (ext(s, 'cross') === 'gap') o.push(`preaction={draw=white, line width=${X.pt(s.width + 6)}, -}`);
    if (shaft === 'double') o.push(`double, double distance=${X.pt(s.width)}`);
    if (shaft === 'wave') { o.push('decorate', 'decoration={snake, amplitude=2.5pt, segment length=10pt}'); X.libs.add('decorations.pathmorphing'); }
    if (shaft === 'ticks') { o.push(`postaction={draw, -, solid, decorate, decoration={ticks, segment length=${s.tick > 0 ? X.pt(s.tick) : '6pt'}, amplitude=${s.ticksz > 0 ? X.pt(s.ticksz / 2) : '3pt'}}}`); X.libs.add('decorations.pathreplacing'); }
    const marks = [];
    const mt = ext(s, 'midTip');
    if (mt !== 'none') marks.push(`mark=at position 0.5 with {\\arrow{${TIKZ_TIP[mt]}}}`);
    if (s.bpTip && s.bpTip !== 'none' && fr) for (const p of fr) marks.push(`mark=at position ${f(p)} with {\\arrow{${TIKZ_TIP[s.bpTip]}}}`);
    if (marks.length) { o.push(`postaction={decorate, decoration={markings, ${marks.join(', ')}}}`); X.libs.add('decorations.markings'); X.libs.add('arrows.meta'); }
    return o;
  }
  // Crossing hops: where this straight-segment path crosses shapes drawn below it.
  function segX(a: any, b: any, c: any, d: any) {
    const r = { x: b.x - a.x, y: b.y - a.y }, q = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * q.y - r.y * q.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den, v = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    return t > 0 && t < 1 && v >= 0 && v <= 1 ? t : null;
  }
  function hopsFor(s: any, P: any, scene: any) {
    if (ext(s, 'cross') !== 'hop' || !scene) return null;
    const idx = scene.indexOf(s);
    const below = (idx < 0 ? scene : scene.slice(0, idx)).filter((o: any) => o !== s && (T as Record<string, any>)[o.type] && (T as Record<string, any>)[o.type].samples && !['text', 'image', 'plot', 'solid', 'prim3d', 'revolve', 'geo3d', 'geo2d', 'pie', 'cd', 'xy', 'qc', 'forest', 'zx', 'bloch', 'feynman', 'timing', 'automata', 'kmap', 'bytefield', 'chemfig', 'table', 'tikz'].includes(o.type));
    const polys = below.map((o: any) => {
      const q = (T as Record<string, any>)[o.type].samples(o);
      if (o.type === 'rect') return [q[0], { x: q[1].x, y: q[0].y }, q[1], { x: q[0].x, y: q[1].y }, q[0]];
      return o.closed ? [...q, q[0]] : q;
    });
    const r = 3 + s.width, hops = P.slice(1).map(() => []);
    for (let i = 0; i + 1 < P.length; i++) {
      const A = P[i], B = P[i + 1], L = dist(A, B);
      if (L < 4 * r) continue;
      for (const q of polys) for (let j = 0; j + 1 < q.length; j++) {
        const t = segX(A, B, q[j], q[j + 1]);
        if (t != null && t * L > 1.5 * r && (1 - t) * L > 1.5 * r && !hops[i].some((x: any) => Math.abs(x - t) * L < 2.2 * r)) hops[i].push(t);
      }
      hops[i].sort((a: any, b: any) => a - b);
    }
    return hops.some((h: any) => h.length) ? { hops, r } : null;
  }
  // straight path through P with hops → SVG d and TikZ path
  function hopPaths(P: any, H: any, X?: any) {
    const { hops, r } = H;
    let d = 'M' + pt(P[0]), tz = X ? X.c(P[0].x, P[0].y) : '';
    for (let i = 0; i + 1 < P.length; i++) {
      const A = P[i], B = P[i + 1], u = norm(sub(B, A));
      for (const t of hops[i]) {
        const C = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
        const p1 = { x: C.x - u.x * r, y: C.y - u.y * r }, p2 = { x: C.x + u.x * r, y: C.y + u.y * r };
        d += `L${pt(p1)}A${r2(r)},${r2(r)} 0 0,1 ${pt(p2)}`;
        if (X) { const th = (Math.atan2(-u.y, u.x) * 180) / Math.PI; tz += ` -- ${X.c(p1.x, p1.y)} arc[start angle=${f(th + 180)}, end angle=${f(th)}, radius=${X.len(r)}]`; }
      }
      d += 'L' + pt(B);
      if (X) tz += ` -- ${X.c(B.x, B.y)}`;
    }
    return { d, tz };
  }

  TD.tip = tip;
  TD.cmArrow = cmArrow;

  // ---------- text rendering (KaTeX for $...$) ----------
  const htmlCache = new Map();
  const sizeCache = new Map();
  let previewSizes = new Map();
  let cachedGeometryDepth = 0;
  TD.withCachedGeometry = (draw: () => any) => {
    cachedGeometryDepth++;
    try { return draw(); } finally { cachedGeometryDepth--; }
  };
  TD.retainPreviewSizes = () => { previewSizes = new Map(sizeCache); };
  // Layouts built from provisional text measurements must be invalidated when
  // worker results arrive, as well as when fonts or the renderer change.
  const metricsListeners: (() => void)[] = [];
  TD.onTextMetricsChange = (listener: () => void) => { metricsListeners.push(listener); };
  const metricsChanged = () => { for (const listener of metricsListeners) listener(); };
  TD.clearTextCache = () => { htmlCache.clear(); sizeCache.clear(); metricsChanged(); };
  if (typeof document !== 'undefined' && document.fonts) {
    const redraw = () => { if (TD.app?.state?.mode === 'document') TD.docview?.render?.(); else TD.app?.render?.(); };
    document.fonts.addEventListener('loadingdone', (e: any) => {
      const web = (e.fontfaces || []).filter((f: FontFace) => WEB_FONTS.has(f.family.replace(/["']/g, '')));
      if (!web.length) return;
      for (const f of web) prepareLabelFont(f.family, f.style, f.weight); // for label pictures (src/domain/label-image.ts)
      TD.clearTextCache();
      redraw();
    });
    // a served font read for label pictures: the pictures made without it, and the shapes drawn with them, are made again
    onLabelFontsChange(() => { TD.clearTextCache(); redraw(); });
  }
  TD.clearPendingTextCache = (ids?: number[]) => {
    let changed = false;
    for (const [key, value] of sizeCache) if (value.pending && (!ids || TD.math.pendingIds(value.html).some((id: number) => ids.includes(id)))) { sizeCache.delete(key); changed = true; }
    if (changed) metricsChanged();
    if (!TD.math.pending) previewSizes.clear();
  };

  // Split a line into text / math segments: $…$ is inline math; $$…$$ and \[…\] are display
  // math ({ math: true, display: true }), rendered and exported as \displaystyle.
  function segments(line: any) {
    const out = [];
    let buf = '', math = false, display = false;
    const flush = (m: any, d?: any) => { out.push({ math: m, display: !!(m && d), s: buf }); buf = ''; };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '\\' && !math && line[i + 1] === '[' && line.indexOf('\\]', i + 2) > 0) { flush(false); math = display = true; i++; continue; }
      if (c === '\\' && math && display && line[i + 1] === ']') { flush(true, true); math = display = false; i++; continue; }
      if (c === '\\' && i + 1 < line.length) { buf += c + line[i + 1]; i++; continue; }
      if (c === '$') {
        if (!math && line[i + 1] === '$' && line.indexOf('$$', i + 2) > 0) { flush(false); math = display = true; i++; continue; }
        if (math && display && line[i + 1] === '$') { flush(true, true); math = display = false; i++; continue; }
        if (math && display) { buf += c; continue; }
        flush(math, false); math = !math; continue;
      }
      buf += c;
    }
    if (math) out.push({ math: false, s: (display ? '$$' : '$') + buf });
    else out.push({ math: false, s: buf });
    return out.filter((x) => x.s.length);
  }
  // ---------- prose (text outside $…$) ----------
  // The common LaTeX text commands work in prose as they do in LaTeX: \textbf{…}, \emph{…}, \texttt{…},
  // escaped characters (\% \$ \_ …), ~, quotes and dashes, and a few symbols. Export passes the source
  // through untouched; this parser drives the preview and the MathLive editor. Anything it doesn't know
  // (\ref{x}, say) is kept, and shown, exactly as typed.
  // nodes: 'text' | { cmd, kids } (cmd '' = a bare {group}) | { sym } | { raw }
  const PROSE_CMDS: Record<string, any> = {
    textbf: 'font-weight:bold', textit: 'font-style:italic', emph: 'font-style:italic', textsl: 'font-style:oblique',
    underline: 'text-decoration:underline', texttt: 'font-family:"Courier New",Courier,monospace', textsf: 'font-family:Helvetica,Arial,sans-serif',
    textrm: '', textsc: 'font-variant:small-caps', textup: 'font-style:normal', textmd: 'font-weight:normal', textnormal: 'font-weight:normal;font-style:normal',
  };
  // Declarations switch the style for the rest of their group, {\bfseries bold} or {\em stressed}: drawn as the
  // command with the same effect, written back as typed.
  const PROSE_DECLS: Record<string, any> = {
    bfseries: 'textbf', bf: 'textbf', mdseries: 'textmd', itshape: 'textit', it: 'textit', em: 'emph', slshape: 'textsl', sl: 'textsl',
    scshape: 'textsc', sc: 'textsc', upshape: 'textup', ttfamily: 'texttt', tt: 'texttt', sffamily: 'textsf', sf: 'textsf', rmfamily: 'textrm', rm: 'textrm',
    normalfont: 'textnormal',
  };
  const PROSE_SYMS: Record<string, any> = {
    ldots: '…', dots: '…', textbackslash: '\\', textasciicircum: '^', textasciitilde: '~', textdegree: '°', S: '§', P: '¶', copyright: '©',
    textendash: '–', textemdash: '—', textbullet: '•', textbraceleft: '{', textbraceright: '}', textunderscore: '_', textdollar: '$', textbar: '|', textless: '&lt;', textgreater: '&gt;', quad: ' ', qquad: '  ', nbsp: ' ',
    LaTeX: 'L<span style="font-size:.75em;vertical-align:.25em;margin:0 -.15em 0 -.36em">A</span>T<span style="vertical-align:-.5ex;margin:0 -.125em 0 -.1667em">E</span>X',
    TeX: 'T<span style="vertical-align:-.5ex;margin:0 -.125em 0 -.1667em">E</span>X',
  };
  // the tables are looked up by any command name typed: no Object.prototype keys (\constructor, \toString)
  for (const o of [PROSE_CMDS, PROSE_DECLS, PROSE_SYMS]) Object.setPrototypeOf(o, null);
  function parseProse(src: any) {
    let i = 0, depth = 0;
    const braced = () => { // a balanced {…} at i, returned whole
      let j = i + 1, d = 1;
      for (; j < src.length && d; j++) { if (src[j] === '\\') j++; else if (src[j] === '{') d++; else if (src[j] === '}') d--; }
      const g = src.slice(i, j); i = j; return g;
    };
    function group(inner: any): any[] {
      // nesting past 200 groups or declarations (hostile input) is read as plain text, not recursed into
      if (depth > 200) { const rest = src.slice(i); i = src.length; return [rest]; }
      depth++;
      try { return groupIn(inner); } finally { depth--; }
    }
    function groupIn(inner: any) {
      const out: any[] = [];
      let buf = '';
      const push = (n?: any) => { if (buf) out.push(buf); buf = ''; if (n) out.push(n); };
      while (i < src.length) {
        const c = src[i];
        if (c === '}' && inner) { i++; break; }
        if (c === '{') { i++; push({ cmd: '', kids: group(true) }); continue; }
        if (c === '~') { i++; push({ sym: 'nbsp' }); continue; }
        if (c !== '\\') { buf += c; i++; continue; }
        const m = /^\\([A-Za-z]+)|^\\(.?)/.exec(src.slice(i));
        i += m![0].length;
        if (m![1] === undefined) { // \% \$ \_ \{ \} \& \# → the character; \  \, \; \: → a space
          if (m![2] && '%$_{}&#'.includes(m![2])) buf += m![2];
          else if (m![2] && ' ,;:'.includes(m![2])) buf += ' ';
          else push({ raw: m![0] });
          continue;
        }
        const name = m![1];
        if (PROSE_DECLS[name]) { // the rest of this group, in that style
          const sp = (/^\s*/.exec(src.slice(i)))![0];
          i += sp.length;
          push({ cmd: PROSE_DECLS[name], decl: name, sp: sp || ' ', kids: group(inner) });
          return out;
        }
        if (PROSE_CMDS[name] !== undefined && /^\s*\{/.test(src.slice(i))) {
          while (src[i] !== '{') i++;
          i++; push({ cmd: name, kids: group(true) }); continue;
        }
        if (PROSE_SYMS[name] !== undefined && name !== 'nbsp') {
          if (src.startsWith('{}', i)) i += 2; else while (src[i] === ' ') i++; // a control word eats the space after it
          push({ sym: name }); continue;
        }
        let raw = m![0];
        while (src[i] === '{') raw += braced(); // unknown: keep it and its arguments as typed
        push({ raw });
      }
      push();
      return out;
    }
    return group(false);
  }
  // A command that only works in maths (\alpha, \frac{a}{b}) fails to compile in prose: it is shown as typed,
  // with a red dotted underline and a hint. Commands that are fine in text too are never flagged.
  const TEXT_OK = new Set(('hspace vspace newline linebreak pagebreak par noindent centering hfill vfill quad qquad tiny scriptsize footnotesize ' +
    'small normalsize large Large LARGE huge Huge bfseries mdseries itshape upshape slshape scshape ttfamily rmfamily sffamily normalfont ' +
    'color textcolor colorbox fbox mbox makebox raisebox href url ref eqref pageref label cite footnote today ensuremath phantom hphantom vphantom ' +
    'smallskip medskip bigskip kern rule relax').split(' '));
  const TEXT_FOR: Record<string, any> = { degree: '\\textdegree', circ: '\\textdegree', times: '\\texttimes', pm: '\\textpm' };
  const mathOnlyCache = new Map();
  function mathOnly(raw: any) {
    const name = /^\\([A-Za-z]+)/.exec(raw)?.[1];
    if (name && /^(left|right|middle|(?:big|Big|bigg|Bigg)[lrm]?)$/.test(name)) return true;
    if (!name || TEXT_OK.has(name) || name.startsWith('text') || !TD.math) return false;
    if (!mathOnlyCache.has(raw)) {
      let ok = false;
      try { TD.math.render(raw, { throwOnError: true }); ok = true; } catch (e: any) { /* not maths either */ }
      mathOnlyCache.set(raw, ok);
    }
    return mathOnlyCache.get(raw);
  }
  function rawHtml(raw: any) {
    if (!mathOnly(raw)) return esc(raw);
    const name = (/^\\([A-Za-z]+)/.exec(raw))![1];
    const tip = `Maths command: put it in $…$${TEXT_FOR[name] ? ` (or use ${TEXT_FOR[name]} in text)` : ''}`;
    return `<span class="tx-warn" title="${esc(tip)}">${esc(raw)}</span>`;
  }
  const ligatures = (h: any) => h.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”');
  // `it`: the text around is italic, so \emph turns it upright, as LaTeX does
  function proseHtml(nodes: any, it = false) {
    return nodes.map((n: any) => {
      if (typeof n === 'string') return ligatures(esc(n));
      if (n.sym) return PROSE_SYMS[n.sym];
      if (n.raw !== undefined) return rawHtml(n.raw);
      if (n.cmd === 'emph') return `<span style='font-style:${it ? 'normal' : 'italic'}'>${proseHtml(n.kids, !it)}</span>`;
      const kit = /^(textit|textsl)$/.test(n.cmd) ? true : /^(textup|textnormal)$/.test(n.cmd) ? false : it;
      return n.cmd && PROSE_CMDS[n.cmd] ? `<span style='${PROSE_CMDS[n.cmd]}'>${proseHtml(n.kids, kit)}</span>` : proseHtml(n.kids, kit);
    }).join('');
  }
  // nodes → source, with `escStr` deciding how plain characters are written
  function proseSource(nodes: any, escStr: any) {
    return nodes.map((n: any) => (typeof n === 'string' ? escStr(n)
      : n.sym ? (n.sym === 'nbsp' ? '~' : `\\${n.sym}{}`)
        : n.raw !== undefined ? n.raw
          : n.decl ? `\\${n.decl}${n.sp}${proseSource(n.kids, escStr)}`
            : `${n.cmd ? '\\' + n.cmd : ''}{${proseSource(n.kids, escStr)}}`)).join('');
  }
  // Commands that work in prose (outside $…$): the ones the prose renderer knows, \text… and the usual text-mode commands.
  const textOk = (name: any) => PROSE_CMDS[name] !== undefined || PROSE_DECLS[name] !== undefined || (PROSE_SYMS[name] !== undefined && name !== 'nbsp') || TEXT_OK.has(name) || name.startsWith('text');
  TD.prose = { parse: parseProse, html: proseHtml, source: proseSource, CMDS: PROSE_CMDS, textOk };

  // TeX for one math segment
  const mathTex = (seg: any) => (seg.display ? `\\displaystyle ${seg.s.trim()}` : seg.s);
  TD.mathTex = mathTex;
  TD.textSegments = segments;

  function textHtml(text: any) {
    if (htmlCache.has(text)) return htmlCache.get(text);
    const lines = String(text).split('\n').map((line) =>
      segments(line).map((seg) => {
        if (seg.math && TD.math) return TD.math.render(mathTex(seg));
        if (seg.math) return `<i>${esc(seg.s)}</i>`;
        return proseHtml(parseProse(seg.s));
      }).join('') || '&#8203;'
    );
    const html = lines.map((l) => `<div>${l}</div>`).join('');
    if (!TD.math.isPending(html)) htmlCache.set(text, html);
    return html;
  }
  TD.textHtml = textHtml;

  // Measure rendered size of a text block in px.
  // st: { size, font, bold, italic } (any object carrying those keys, e.g. the shape)
  function textStyle(st: any) {
    const px = TD.sizePx(st && st.size != null ? st.size : 'normalsize');
    // the font default: the document's font (a Classic Document's page.family), Computer Modern unless one is set
    const df = docFont(TD.docFontKey()), fam = (!st || !st.font || st.font === 'default') && df.key !== 'cm' ? df.css : fontOf(st && st.font)[2];
    return { px, css: `font-size:${r2(px)}px;font-family:${fam.replace(/"/g, "'")};${st && st.bold ? 'font-weight:bold;' : ''}${st && st.italic ? 'font-style:italic;' : ''}` };
  }
  TD.textStyle = textStyle;
  // a wrapping text is exactly its text width wide (the TikZ text width), so resizing it keeps its edges
  // where they were dropped; other text gets 2px of slack round the measured glyphs
  const boxW = (st: any, w: any) => (st && st.tw > 0 ? r2(st.tw) : w + 2);
  // Measure in font-design space, then convert back to CSS pixels once. At screen
  // sizes, browser font hinting and per-line pixel quantisation can change a box
  // by a pixel. A shared em scale retains fractional metrics across browsers.
  function measureStyle(element: HTMLElement, css: string) {
    element.style.cssText = css;
    const px = parseFloat(element.style.fontSize), scale = 1000 / px;
    const width = parseFloat(element.style.width);
    element.style.fontSize = '1000px';
    element.style.width = Number.isFinite(width) ? `${width * scale}px` : 'max-content';
    return scale;
  }
  function measuredBox(element: HTMLElement, scale: number) {
    const rect = element.getBoundingClientRect();
    // The bundled TeX faces use 1000 font units per em. Quantise in that
    // design space before conversion, rather than preserving platform hinting.
    const cssPx = 1000 / scale;
    const length = (value: number) => Math.round(Math.round(value) / 1000 * cssPx * 100) / 100;
    return { w: length(rect.width), h: length(rect.height) };
  }
  function textBox(text: any, st: any): any {
    if (!TD.math.previewing && !TD.math.finalizing && TD.math.pending) return TD.math.preview(() => textBox(text, st));
    if (typeof st !== 'object' || st === null) st = { size: st || 'normalsize' };
    const ts = textStyle(st), px = ts.px;
    // a text box with a fixed width wraps its lines (TikZ: text width=…, align=…)
    if (st.tw > 0) ts.css += `width:${r2(st.tw)}px;white-space:pre-wrap;text-align:${st.align || 'left'};`;
    else if (st.align && st.align !== 'center') ts.css += `text-align:${st.align};`; // lines of a multi-line label
    const key = ts.css + '|' + text;
    let box = sizeCache.get(key);
    if (cachedGeometryDepth && box?.html != null) return { ...box, px, css: ts.css };
    if (box?.pending && TD.math.finalizing) box = undefined;
    if (!box && TD.math.previewing && previewSizes.has(key) && TD.math.isPending(textHtml(text))) {
      const next = textHtml(text), previous = previewSizes.get(key);
      const markers = TD.math.pendingIds(next).map((id: number) => `<!--td-math-pending:${id}-->`).join('');
      // Keep a whole label's already-rendered preview until all of its
      // formulae are ready, instead of repeatedly generating mixed-engine images.
      box = { ...previous, pending: true, html: TD.math.cleanPreview(previous.html) + markers };
      sizeCache.set(key, box);
    }
    if (!box && batch) { batch.set(key, { css: ts.css, text, tw: st.tw }); box = { w: 10, h: 10 }; } // measured with the rest, then drawn again
    else if (!box) {
      const m = measurementElement();
      const scale = measureStyle(m!, ts.css);
      m!.innerHTML = textHtml(text);
      const measured = measuredBox(m!, scale);
      box = { w: boxW(st, measured.w), h: measured.h, pending: TD.math.isPending(textHtml(text)), html: textHtml(text) };
      sizeCache.set(key, box);
    }
    return { ...box, px, css: ts.css, html: box.pending && !TD.math.finalizing ? box.html : textHtml(text) };
  }
  TD.textBox = textBox;

  // Measuring a text forces the page's layout, and with thousands of labels on the canvas each one costs
  // milliseconds. measureBatch(fn) runs fn noting every text it has no size for, measures them all in one
  // layout pass, then runs fn again with the real sizes.
  let batch: any = null;
  // true once this pass has handed out a placeholder size: what is drawn or laid out after that may be
  // wrong and must not be kept. Before the first placeholder every size is real, so a pass with nothing
  // to measure (the usual redraw) keeps its results like any other.
  TD.measuring = () => !!batch && batch.size > 0;
  TD.measureBatch = (fn: any) => {
    if (batch) return fn();
    batch = new Map();
    let r, miss;
    try { r = fn(); } finally { miss = batch; batch = null; }
    if (!miss.size) return r;
    const m = measurementElement(), host = m!.parentNode, frag = document.createDocumentFragment(), els = [];
    for (const [key, it] of miss) {
      const d = document.createElement('div');
      d.className = m!.className;
      const scale = measureStyle(d, 'position:absolute;left:-10000px;top:0;visibility:hidden;' + it.css);
      d.innerHTML = textHtml(it.text);
      frag.appendChild(d); els.push([key, d, scale]);
    }
    host!.appendChild(frag);
    for (const [key, d, scale] of els) {
      const measured = measuredBox(d, scale);
      sizeCache.set(key, { w: boxW(miss.get(key), measured.w), h: measured.h, pending: TD.math.isPending(d.innerHTML), html: textHtml(miss.get(key).text) });
    }
    for (const [, d] of els) d.remove();
    return fn();
  };

  // font-size:0 on the foreignObject: its line box would otherwise get the page font's strut, which
  // pushes text smaller than that font down inside its box
  let inheritedLabelId = 0;
  function textSvg(text: any, st: any, color: any, cx: any, cy: any, ctx: any, extra = ''): string {
    if (ctx.export && !TD.math.previewing && !TD.math.finalizing) return TD.math.synchronous(() => textSvg(text, st, color, cx, cy, ctx, extra));
    const b = textBox(text, st);
    const x = r2(cx - b.w / 2), y = r2(cy - b.h / 2);
    const ns = ctx.export ? ' xmlns="http://www.w3.org/1999/xhtml"' : '';
    const html = ctx.export ? TD.math.forXml(b.html) : b.html;
    if (/<math\b|class="td-math/.test(b.html)) {
      if (TD.measuring()) return ''; // this pass is drawn again with real sizes: a picture now is wasted
      const align = ['left', 'center', 'right', 'justify'].includes(st?.align) ? st.align : st?.tw > 0 ? 'left' : 'center';
      const pending = TD.math.isPending(b.html), html = TD.math.cleanPreview(b.html);
      const image = labelImage(/class="katex(?:\s|")/.test(html) ? 'katex' : /class="td-math/.test(html) ? 'temml' : TD.math.engine, html, b.css, color, b.w, b.h, align);
      // preserveAspectRatio none: the box already has the picture's exact proportions, and Safari misjudges a wide
      // picture's own ratio, so the default fit shrinks and centres it (left-aligned text drifts right)
      const img = `<image class="svg-label${pending ? ' math-pending' : ''}"${pending ? ` data-math-pending="${TD.math.pendingIds(b.html).join(',')}"` : ''} x="${x + image.x}" y="${y + image.y}" width="${image.width}" height="${image.height}" preserveAspectRatio="none" href="${image.href}" role="img" aria-label="${esc(text)}"${extra}/>`;
      // An SVG image is its own document: currentColor cannot cross that boundary.
      // Use its alpha as a mask so palette math follows the surrounding theme live.
      const id = `inherited-label-${++inheritedLabelId}`;
      const painted = color === 'currentColor'
        ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x + image.x}" y="${y + image.y}" width="${image.width}" height="${image.height}" style="mask-type:alpha">${img}</mask><rect x="${x + image.x}" y="${y + image.y}" width="${image.width}" height="${image.height}" fill="currentColor" mask="url(#${id})"/>`
        : img;
      return painted +
        (ctx.export ? '' : `<rect class="hitfill" x="${x}" y="${y}" width="${b.w}" height="${b.h}"/>`);
    }
    return `<foreignObject x="${x}" y="${y}" width="${b.w}" height="${b.h}" style="overflow:visible;font-size:0;text-align:center"${extra}><div${ns} class="tx" style="${b.css}color:${css(color)}">${html}</div></foreignObject>` +
      (ctx.export ? '' : `<rect class="hitfill" x="${x}" y="${y}" width="${b.w}" height="${b.h}"/>`);
  }

  // Escape text for TikZ node contents (outside math only).
  function tikzText(text: any) {
    return String(text).split('\n').map((line) =>
      segments(line).map((seg) => (seg.math ? `$${mathTex(seg)}$` : seg.s.replace(/(^|[^\\])([%&#])/g, '$1\\$2'))).join('')
    ).join(' \\\\ ');
  }

  // Label placed along a path (line / curve). P = point, u = tangent direction.
  TD.textSvg = textSvg;
  TD.segments = segments;
  function labelPlace(s: any, P: any, u: any) {
    const b = textBox(s.label, s);
    if (s.labelSide === 'on') return { x: P.x, y: P.y, b };
    let n = { x: u.y, y: -u.x }; // left of direction (in TikZ y-up sense)
    if (s.labelSide === 'right') n = { x: -n.x, y: -n.y };
    // TikZ's `auto` anchors the node by a side or a corner (\tikz@auto@anchor): a corner unless the
    // tangent is within 0.05 of an axis, so the label's box sits diagonally off the point.
    const ox = Math.abs(u.y) > 0.05 ? Math.sign(n.x) * (b.w / 2 + 3) : 0;
    const oy = Math.abs(u.x) > 0.05 ? Math.sign(n.y) * (b.h / 2 + 3) : 0;
    return { x: P.x + ox, y: P.y + oy, b };
  }
  function labelSvg(s: any, P: any, u: any, ctx: any) {
    if (!s.label) return '';
    const L = labelPlace(s, P, u);
    const bg = s.labelSide === 'on' ? `<rect x="${r2(L.x - L.b.w / 2)}" y="${r2(L.y - L.b.h / 2)}" width="${L.b.w}" height="${L.b.h}" fill="#fff"/>` : '';
    return bg + textSvg(s.label, s, s.color || '#000', L.x, L.y, ctx);
  }
  TD.labelPlace = labelPlace;
  function labelTikz(s: any, X: any) {
    if (!s.label) return '';
    const o = [];
    if (s.labelSide === 'left') o.push('auto');
    else if (s.labelSide === 'right') o.push('auto', 'swap');
    else o.push('fill=white', 'inner sep=1pt');
    o.push(`pos=${r2(s.labelPos ?? 0.5)}`);
    o.push(...textOpts(s, X));
    return ` node[${o.join(', ')}] {${tikzText(s.label)}}`;
  }

  // ---------- TikZ helpers ----------
  const f = (n: any) => { const stable = Math.round(n * 1e9) / 1e9; const v = Math.round(stable * 100) / 100; return Object.is(v, -0) ? '0' : String(v); };
  // The open file's document font (a Classic Document's page.family, src/core/doc-fonts.ts): what LaTeX's text is set
  // in, and what an object's own font is written against
  TD.docFontKey = () => docFont(TD.state && TD.state.doc && TD.state.doc.page && TD.state.doc.page.family).key;
  function makeX({ engine = 'pdflatex' as TexEngine, docFont: font = undefined as string | undefined } = {}) : any {
    const colors = new Map();
    const X: Record<string, any> = {
      colors, libs: new Set(), pkgs: new Set(), n: 0,
      // the LaTeX engine the code is for, the document font, and the preamble lines objects' own fonts need
      engine, docFont: font || TD.docFontKey(), fontPre: new Set<string>(),
      // the open file's named styles (src/core/named-styles.ts), written as \tikzset once and named on each shape
      namedStyles: TD.namedStyles ? TD.namedStyles() : [],
      uid() { return 'td' + ++this.n; },
      // a point a named point stands at is written by its name (X.refs, set per shape by TD.tikzLines)
      c: (x: any, y: any) => { const v = `(${f(x / PX)},${f(-y / PX)})`; return (X.refs && X.refs.get(v)) || v; },
      len: (px: any) => f(px / PX),
      pt: (px: any) => `${f(px * K)}pt`,
      col(c: any) : any {
        let hex = TD.parseColor(c).hex;
        if (hex === '#000000') return 'black';
        if (hex === '#ffffff') return 'white';
        if (this.named && this.named.has(hex)) return this.named.get(hex); // a colour kept code already names
        if (!colors.has(hex)) {
          // not a name that code kept as written defines (TD.tikzLines reserves those)
          let n = colors.size + 1; while (this.reserved && this.reserved.has('tdc' + n)) n++;
          colors.set(hex, 'tdc' + n);
        }
        return colors.get(hex);
      },
    };
    return X;
  }
  TD.makeTikzContext = makeX;
  TD.tikzText = tikzText;

  function styleOpts(s: any, X: any, { fill = false, arrows = false, bends = null as number[] | null } = {}) {
    const o = [];
    if (s.stroke) {
      if (X.col(s.stroke) !== 'black') o.push(`draw=${X.col(s.stroke)}`);
      const sa = TD.parseColor(s.stroke).a;
      if (sa < 1) o.push(`draw opacity=${f(sa)}`);
      o.push(`line width=${X.pt(s.width)}`);
      if (s.dash === 'dashed') o.push('dashed');
      else if (s.dash === 'dotted') o.push('dotted');
      else if (s.dash === 'dashdot') o.push('dash dot');
      else {
        const pat = TD.dashPat(s.dash);
        if (pat && pat.length && pat.some((n: any) => n > 0)) {
          const q = pat.length % 2 ? pat.concat(pat) : pat;
          o.push('dash pattern=' + q.map((n: any, i: any) => `${i % 2 ? 'off' : 'on'} ${f(n)}pt`).join(' '));
        }
      }
    }
    if (fill && s.fill && typeof s.fill === 'object') o.push(...TD.tikzFillOpts(s.fill, X));
    else if (fill && s.fill) {
      o.push(`fill=${X.col(s.fill)}`);
      const fa = TD.parseColor(s.fill).a;
      if (fa < 1) o.push(`fill opacity=${f(fa)}`);
    }
    if (arrows) {
      const a = s.startTip && s.startTip !== 'none' ? `{${TIKZ_TIP[s.startTip]}}` : '';
      const b = s.endTip && s.endTip !== 'none' ? `{${TIKZ_TIP[s.endTip]}}` : '';
      if (a || b) { o.push(`${a}-${b}`); X.libs.add('arrows.meta'); }
    }
    if (TD.LINEISH.has(s.type)) o.push(...decoOpts(s, X, bends));
    if (s.opacity != null && s.opacity < 1 && !X.groupOpacity) o.push(`opacity=${f(s.opacity)}`);
    return o;
  }
  // Pick \draw / \fill / null depending on stroke & fill.
  function cmd(s: any, fillable: any) {
    if (s.stroke) return '\\draw';
    if (fillable && s.fill) return typeof s.fill === 'object' ? '\\path' : '\\fill';
    return null;
  }
  const opts = (o: any) => (o.length ? `[${o.join(', ')}]` : '');
  TD.tikzOpts = opts;
  TD.styleOpts = (s: any, X: any, o: any) => styleOpts(s, X, o);
  TD.fmt = f;

  // font=..., text=... options for nodes from a style source (size, font, bold, italic, color)
  function textOpts(s: any, X: any) {
    const o = [], fo = [];
    if (typeof s.size === 'number') { const p = f(s.size * K); fo.push(`\\fontsize{${p}pt}{${f(s.size * K * 1.2)}pt}\\selectfont`); }
    else if (s.size && s.size !== 'normalsize') fo.push('\\' + s.size);
    // the object's own font, written for the engine and against the document's font (src/core/doc-fonts.ts)
    const fam = objectFont(s.font, X.engine || 'pdflatex', X.docFont || 'cm');
    if (fam.code) fo.push(fam.code);
    if (X.fontPre) for (const l of fam.pre) X.fontPre.add(l);
    if (s.bold) fo.push('\\bfseries');
    if (s.italic) fo.push('\\itshape');
    if (fo.length) o.push(`font=${fo.join('')}`);
    if (s.color) {
      const c = X.col(s.color);
      if (c !== 'black') o.push(`text=${c}`);
      const a = TD.parseColor(s.color).a;
      if (a < 1) o.push(`text opacity=${f(a)}`);
    }
    return o;
  }
  TD.textOpts = textOpts;

  // ---------- bezier helpers ----------
  function bez(s: any, t: any) {
    const m = 1 - t;
    return {
      x: m * m * m * s.x1 + 3 * m * m * t * s.cx1 + 3 * m * t * t * s.cx2 + t * t * t * s.x2,
      y: m * m * m * s.y1 + 3 * m * m * t * s.cy1 + 3 * m * t * t * s.cy2 + t * t * t * s.y2,
    };
  }
  function bezTan(s: any, t: any) {
    const m = 1 - t;
    return norm({
      x: 3 * m * m * (s.cx1 - s.x1) + 6 * m * t * (s.cx2 - s.cx1) + 3 * t * t * (s.x2 - s.cx2),
      y: 3 * m * m * (s.cy1 - s.y1) + 6 * m * t * (s.cy2 - s.cy1) + 3 * t * t * (s.y2 - s.cy2),
    }, norm({ x: s.x2 - s.x1, y: s.y2 - s.y1 }));
  }

  // Rect-like resize used by rect & ellipse (operates on a box {x,y,w,h}).
  const BOX_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function boxHandles(b: any) {
    const xs = { w: b.x, c: b.x + b.w / 2, e: b.x + b.w };
    const ys = { n: b.y, c: b.y + b.h / 2, s: b.y + b.h };
    return BOX_HANDLES.map((k) => ({
      k, x: xs[k.includes('w') ? 'w' : k.includes('e') ? 'e' : 'c'], y: ys[k.includes('n') ? 'n' : k.includes('s') ? 's' : 'c'],
    }));
  }
  function boxResize(o: any, k: any, q: any, e: any) {
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (k.includes('w')) x1 = q.x;
    if (k.includes('e')) x2 = q.x;
    if (k.includes('n')) y1 = q.y;
    if (k.includes('s')) y2 = q.y;
    if (e && e.shiftKey && k.length === 2) { // keep square-ish
      const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      if (k.includes('w')) x1 = x2 - side * Math.sign(x2 - x1 || 1); else x2 = x1 + side * Math.sign(x2 - x1 || 1);
      if (k.includes('n')) y1 = y2 - side * Math.sign(y2 - y1 || 1); else y2 = y1 + side * Math.sign(y2 - y1 || 1);
    }
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  function dragBox(a: any, q: any, e: any) {
    let w = q.x - a.x, h = q.y - a.y;
    if (e && e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = m * Math.sign(w || 1); h = m * Math.sign(h || 1); }
    return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) };
  }

  // a box drawn out from its centre a to the corner q (Shift keeps it square)
  function centreBox(a: any, q: any, e: any) {
    let w = Math.abs(q.x - a.x), h = Math.abs(q.y - a.y);
    if (e && e.shiftKey) w = h = Math.max(w, h);
    return { x: a.x - w, y: a.y - h, w: 2 * w, h: 2 * h };
  }
  TD.box = { handles: (b: any) => boxHandles(b), resize: (o: any, k: any, q: any, e: any) => boxResize(o, k, q, e), drag: (a: any, q: any, e: any) => dragBox(a, q, e) };
  const bboxOf = (pts: any, pad = 0) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
  };
  TD.bboxOf = bboxOf;

  const lineStyle = (d: any) => ({ stroke: d.stroke || '#000000', width: d.width, dash: d.dash, opacity: 1 });
  const labelDefaults = (d: any) => ({ label: '', labelPos: 0.5, labelSide: 'left', size: d.size || 'normalsize', font: d.font || 'default', bold: false, italic: false, color: d.color || '#000000' });

  // ---------- types ----------
  const T: any = (TD.TYPES = {});

  // ---------- connector routes ----------
  // A line runs straight, as an elbow (right angles) or as a curve. Its dir says which way it leaves its start and
  // reaches its end: h = sideways, v = up or down ('hh' is a ⌐-shaped elbow, 'hv' an L). Without one it follows the
  // longer side of the line. An elbow's middle segment runs at s.mc (see elbowAt).
  const routeOf = (s: any) => (s.route === 'elbow' || s.route === 'curved' ? s.route : 'straight');
  const routeDir = (s: any) => (/^[hv][hv]$/.test(s.dir) ? s.dir : Math.abs(s.x2 - s.x1) >= Math.abs(s.y2 - s.y1) ? 'hh' : 'vv');
  TD.routeOf = routeOf; TD.routeDir = routeDir;
  // Where an elbow's middle segment runs. s.mc is where it was put (an x for hh, a y for vv; halfway until then),
  // s.ms the side it was put on (lo: beyond the lower end, hi: beyond the higher one, mid: between them) and s.mr
  // how close each end may come ([lower end, higher end], at most MID_MIN, less if it was put nearer). It is drawn
  // at mc unless an end has come too near, then pushed just clear of it; when the end goes back, so does it.
  const MID_MIN = 20;
  function elbowAt(s: any, h: boolean) {
    const a = h ? s.x1 : s.y1, b = h ? s.x2 : s.y2, lo = Math.min(a, b), hi = Math.max(a, b);
    if (s.mc == null) return (a + b) / 2;
    const m = s.mc, [rl, rh] = Array.isArray(s.mr) ? s.mr : [MID_MIN, MID_MIN];
    if (s.ms === 'lo') return Math.min(m, lo - rl);
    if (s.ms === 'hi') return Math.max(m, hi + rh);
    if (s.ms === 'mid') return lo + rl <= hi - rh ? Math.max(lo + rl, Math.min(hi - rh, m)) : (lo + hi) / 2;
    return m;
  }
  TD.elbowMid = (s: any) => elbowAt(s, routeDir(s) === 'hh');
  // put the middle segment through q (no change of direction), remembering its side and how near the ends are
  function placeMid(s: any, q: any) {
    s.dir = routeDir(s);
    const h = s.dir === 'hh', a = h ? s.x1 : s.y1, b = h ? s.x2 : s.y2, lo = Math.min(a, b), hi = Math.max(a, b);
    const m = Math.round((h ? q.x : q.y) * 100) / 100, r = (v: number) => Math.round(Math.min(MID_MIN, Math.max(0, v)) * 100) / 100;
    s.mc = m;
    if (m < lo - 1e-6) { s.ms = 'lo'; s.mr = [r(lo - m), MID_MIN]; }
    else if (m > hi + 1e-6) { s.ms = 'hi'; s.mr = [MID_MIN, r(m - hi)]; }
    else { s.ms = 'mid'; s.mr = [r(m - lo), r(hi - m)]; }
  }
  // An end of an elbow is about to move from o (the old x1..y2): a middle that was never put anywhere is fixed
  // where it is drawn now, so it stays there (and on that side) as the ends move.
  function keepMid(s: any, o: any) {
    if (routeOf(s) !== 'elbow' || s.ms) return;
    const d = /^[hv][hv]$/.test(s.dir) ? s.dir : routeDir(o);
    if (d !== 'hh' && d !== 'vv') return;
    const old = { ...s, ...o, dir: d };
    const m = elbowAt(old, d === 'hh');
    placeMid(old, d === 'hh' ? { x: m, y: 0 } : { x: 0, y: m });
    Object.assign(s, { dir: d, mc: old.mc, ms: old.ms, mr: old.mr });
  }
  TD.keepElbowMid = keepMid;
  TD.placeElbowMid = placeMid;
  // the elbow's points from start to end; seg is the segment a label sits on
  function elbowPts(s: any) {
    const A = { x: s.x1, y: s.y1 }, B = { x: s.x2, y: s.y2 }, d = routeDir(s);
    if (d === 'hh') { const x = elbowAt(s, true); return { P: [A, { x, y: A.y }, { x, y: B.y }, B], seg: 1 }; }
    if (d === 'vv') { const y = elbowAt(s, false); return { P: [A, { x: A.x, y }, { x: B.x, y }, B], seg: 1 }; }
    const C = d === 'hv' ? { x: B.x, y: A.y } : { x: A.x, y: B.y };
    return { P: [A, C, B], seg: dist(A, C) >= dist(C, B) ? 0 : 1 };
  }
  // the points without zero-length steps (for tips, hops and the drawn path)
  const dedupe = (P: any[]) => { const out = [P[0]]; for (const p of P.slice(1)) if (dist(p, out[out.length - 1]) > 1e-6) out.push(p); return out; };
  // a curved route as a cubic: TikZ's to[out=…, in=…] puts both controls 0.3915 × the distance along the end directions
  function curvedOf(s: any) {
    const A = { x: s.x1, y: s.y1 }, B = { x: s.x2, y: s.y2 }, d = routeDir(s), k = 0.3915 * dist(A, B);
    const sx = Math.sign(B.x - A.x) || 1, sy = Math.sign(B.y - A.y) || 1;
    const o = d[0] === 'h' ? { x: sx, y: 0 } : { x: 0, y: sy }, i = d[1] === 'h' ? { x: sx, y: 0 } : { x: 0, y: sy };
    return { ...s, cx1: A.x + o.x * k, cy1: A.y + o.y * k, cx2: B.x - i.x * k, cy2: B.y - i.y * k, _o: o, _i: i };
  }
  // an elbow whose middle segment has no length: its ends are level across the way it bends
  const elbowFlat = (s: any) => { const d = routeDir(s); return (d === 'hh' || d === 'vv') && Math.abs(d === 'hh' ? s.y2 - s.y1 : s.x2 - s.x1) < 2; };
  TD.elbowFlat = elbowFlat;
  // a screen direction as a TikZ angle (y up)
  const tzAngle = (v: any) => (v.x ? (v.x > 0 ? 0 : 180) : v.y > 0 ? -90 : 90);

  T.line = {
    name: 'Line',
    pts: [['x1', 'y1'], ['x2', 'y2']],
    create: (p: any, d: any, tool: any) => ({
      type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...lineStyle(d),
      startTip: tool === 'darrow' ? 'stealth' : 'none', endTip: tool === 'arrow' || tool === 'darrow' ? 'stealth' : 'none', ...TD.LINE_EXTRA, ...labelDefaults(d),
      ...(tool === 'elbow' ? { route: 'elbow' } : tool === 'curvedconn' ? { route: 'curved' } : {}),
    }),
    drag(s: any, a: any, q: any, e: any) { const b = e.shiftKey && routeOf(s) === 'straight' ? constrain(a, q) : q; s.x2 = b.x; s.y2 = b.y; },
    valid: (s: any) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2,
    handles(s: any) {
      const h = [{ k: 'p1', x: s.x1, y: s.y1 }, { k: 'p2', x: s.x2, y: s.y2 }];
      if (routeOf(s) === 'elbow' && /^(hh|vv)$/.test(routeDir(s))) { // the middle segment slides across
        const { P } = elbowPts(s);
        h.push({ k: 'mid', x: (P[1].x + P[2].x) / 2, y: (P[1].y + P[2].y) / 2, ctrl: true } as any);
      }
      return h;
    },
    setHandle(s: any, k: any, q: any, e: any) {
      if (k === 'mid') {
        // ends level with each other (a straight run): the middle can only go out sideways, making a U
        if (elbowFlat(s)) s.dir = routeDir(s) === 'hh' ? 'vv' : 'hh';
        placeMid(s, q);
        return;
      }
      const shift = e.shiftKey && routeOf(s) === 'straight', o = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      if (k === 'p1') { const b = shift ? constrain({ x: s.x2, y: s.y2 }, q) : q; s.x1 = b.x; s.y1 = b.y; }
      else { const b = shift ? constrain({ x: s.x1, y: s.y1 }, q) : q; s.x2 = b.x; s.y2 = b.y; }
      keepMid(s, o);
    },
    anchors(s: any) {
      const M = routeOf(s) === 'straight' ? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 } : this.labelAt({ ...s, labelPos: 0.5 }).P;
      return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, M];
    },
    samples(s: any) {
      const r = routeOf(s);
      if (r === 'elbow') return elbowPts(s).P;
      if (r === 'curved') return T.curve.samples(curvedOf(s));
      return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    },
    labelAt(s: any) {
      const t = s.labelPos ?? 0.5, r = routeOf(s);
      if (r === 'curved') return T.curve.labelAt(curvedOf(s));
      let A = { x: s.x1, y: s.y1 }, B = { x: s.x2, y: s.y2 };
      if (r === 'elbow') {
        const { P, seg } = elbowPts(s);
        // on its segment, or the longest one when that has no length
        let i = seg;
        if (dist(P[i], P[i + 1]) < 1e-6) i = P.slice(1).reduce((b: number, p: any, j: number) => (dist(P[j], p) > dist(P[b], P[b + 1]) ? j : b), 0);
        A = P[i]; B = P[i + 1];
      }
      return { P: { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }, u: norm({ x: B.x - A.x, y: B.y - A.y }) };
    },
    svg(s: any, ctx: any) {
      const r = routeOf(s);
      if (r === 'curved') return T.curve.svg(curvedOf(s), ctx);
      const P = r === 'elbow' ? dedupe(elbowPts(s).P) : [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
      if (P.length < 2) P.push({ ...P[0] });
      const n = P.length, A = P[0], B = P[n - 1];
      const ue = norm(sub(B, P[n - 2])), us = norm(sub(A, P[1]));
      const col = css(s.stroke || '#000');
      const te = tip(s.endTip, B, ue, s.width, col), ts = tip(s.startTip, A, us, s.width, col);
      const Q = P.map((p: any) => ({ ...p }));
      Q[0] = { x: A.x - us.x * ts.back, y: A.y - us.y * ts.back }; Q[n - 1] = { x: B.x - ue.x * te.back, y: B.y - ue.y * te.back };
      const H = hopsFor(s, Q, ctx.scene);
      const dOf = (Z: any) => Z.map((p: any, i: any) => (i ? 'L' : 'M') + pt(p)).join('');
      const d = H ? hopPaths(Q, H).d : dOf(Q);
      const L = this.labelAt(s);
      return wrap(s, strokeSvg(s, d, dOf(P)) + ts.svg + te.svg) + hit(dOf(P), ctx) + labelSvg(s, L.P, L.u, ctx);
    },
    tikz(s: any, X: any) {
      if (!s.stroke) return '';
      const r = routeOf(s), o = opts(styleOpts(s, X, { arrows: true }));
      if (r === 'curved') {
        const c = curvedOf(s);
        return `\\draw${o} ${X.c(s.x1, s.y1)} to[out=${tzAngle(c._o)}, in=${tzAngle({ x: -c._i.x, y: -c._i.y })}]${labelTikz(s, X)} ${X.c(s.x2, s.y2)};`;
      }
      let P = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], seg = 0;
      if (r === 'elbow') {
        const e = elbowPts(s), D = dedupe(e.P);
        // the label's segment, counted again once repeated points are gone
        const L = this.labelAt(s).P;
        P = D.length >= 2 ? D : P;
        seg = Math.max(0, P.findIndex((p: any, i: any) => i + 1 < P.length && dist(p, L) + dist(L, P[i + 1]) - dist(p, P[i + 1]) < 1e-3));
      }
      const H = hopsFor(s, P, X.scene);
      if (H) {
        const hp = hopPaths(P, H, X);
        return `\\draw${o} ${hp.tz};` + (s.label ? `\n\\path ${X.c(P[seg].x, P[seg].y)} --${labelTikz(s, X)} ${X.c(P[seg + 1].x, P[seg + 1].y)};` : '');
      }
      return `\\draw${o} ` + P.map((p: any, i: any) => (i ? ` --${i === seg + 1 ? labelTikz(s, X) : ''} ` : '') + X.c(p.x, p.y)).join('') + ';';
    },
  };

  T.curve = {
    name: 'Curve',
    pts: [['x1', 'y1'], ['cx1', 'cy1'], ['cx2', 'cy2'], ['x2', 'y2']],
    create: (p: any, d: any, tool: any) => ({
      type: 'curve', x1: p.x, y1: p.y, cx1: p.x, cy1: p.y, cx2: p.x, cy2: p.y, x2: p.x, y2: p.y,
      ...lineStyle(d), startTip: 'none', endTip: tool === 'curvearrow' ? 'stealth' : 'none', ...TD.LINE_EXTRA, ...labelDefaults(d),
    }),
    drag(s: any, a: any, q: any) {
      s.x2 = q.x; s.y2 = q.y;
      const dx = q.x - a.x, dy = q.y - a.y, k = 0.35;
      s.cx1 = a.x + dx / 3 + dy * k; s.cy1 = a.y + dy / 3 - dx * k;
      s.cx2 = a.x + (2 * dx) / 3 + dy * k; s.cy2 = a.y + (2 * dy) / 3 - dx * k;
    },
    valid: (s: any) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2,
    handles: (s: any) => [
      { k: 'p1', x: s.x1, y: s.y1 }, { k: 'c1', x: s.cx1, y: s.cy1, ctrl: true },
      { k: 'c2', x: s.cx2, y: s.cy2, ctrl: true }, { k: 'p2', x: s.x2, y: s.y2 },
    ],
    guides: (s: any) => [[s.x1, s.y1, s.cx1, s.cy1], [s.x2, s.y2, s.cx2, s.cy2]],
    setHandle(s: any, k: any, q: any) {
      const m = ({ p1: ['x1', 'y1'], c1: ['cx1', 'cy1'], c2: ['cx2', 'cy2'], p2: ['x2', 'y2'] } as Record<string, any>)[k];
      // moving an endpoint drags its control point along
      if (k === 'p1') { s.cx1 += q.x - s.x1; s.cy1 += q.y - s.y1; }
      if (k === 'p2') { s.cx2 += q.x - s.x2; s.cy2 += q.y - s.y2; }
      s[m[0]] = q.x; s[m[1]] = q.y;
    },
    anchors: (s: any) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }],
    samples(s: any) { const a = []; for (let i = 0; i <= 24; i++) a.push(bez(s, i / 24)); return a; },
    labelAt: (s: any) => ({ P: bez(s, s.labelPos ?? 0.5), u: bezTan(s, s.labelPos ?? 0.5) }),
    svg(s: any, ctx: any) {
      const col = css(s.stroke || '#000');
      const P0 = { x: s.x1, y: s.y1 }, P1 = { x: s.x2, y: s.y2 };
      const ue = norm(sub(P1, { x: s.cx2, y: s.cy2 }), norm(sub(P1, P0)));
      const us = norm(sub(P0, { x: s.cx1, y: s.cy1 }), norm(sub(P0, P1)));
      const te = tip(s.endTip, P1, ue, s.width, col), ts = tip(s.startTip, P0, us, s.width, col);
      const c = { ...s };
      c.x1 -= us.x * ts.back; c.y1 -= us.y * ts.back; c.cx1 -= us.x * ts.back; c.cy1 -= us.y * ts.back;
      c.x2 -= ue.x * te.back; c.y2 -= ue.y * te.back; c.cx2 -= ue.x * te.back; c.cy2 -= ue.y * te.back;
      const dOf = (q: any) => `M${r2(q.x1)},${r2(q.y1)}C${r2(q.cx1)},${r2(q.cy1)} ${r2(q.cx2)},${r2(q.cy2)} ${r2(q.x2)},${r2(q.y2)}`;
      const L = this.labelAt(s);
      return wrap(s, strokeSvg(s, dOf(c), dOf(s)) + ts.svg + te.svg) + hit(dOf(s), ctx) + labelSvg(s, L.P, L.u, ctx);
    },
    tikz(s: any, X: any) {
      if (!s.stroke) return '';
      return `\\draw${opts(styleOpts(s, X, { arrows: true }))} ${X.c(s.x1, s.y1)} .. controls ${X.c(s.cx1, s.cy1)} and ${X.c(s.cx2, s.cy2)} ..${labelTikz(s, X)} ${X.c(s.x2, s.y2)};`;
    },
  };

  // Smooth curve through points → cubic segments [c1, c2, end]. With a `tension` this is TikZ's `plot[smooth]`
  // exactly (pgflibraryplothandlers): a point's handles are ± 0.2775·tension·(next − previous), and an open
  // curve's end handles sit on the end points. Without one, older shapes keep their Catmull-Rom spline
  // (k = 1/6, ends clamped).
  function smoothSegs(P: any, closed: any, tension?: any) {
    const n = P.length, out = [], tikz = tension != null;
    const g = (i: any) => (closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    const m = closed ? n : n - 1, k = tikz ? 0.2775 * tension : 1 / 6;
    for (let i = 0; i < m; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      const c1 = tikz && !closed && i === 0 ? p1 : { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
      const c2 = tikz && !closed && i === m - 1 ? p2 : { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
      out.push([c1, c2, p2]);
    }
    return out;
  }
  TD.smoothSegs = smoothSegs;
  // Curvature pen paths (Photoshop's Curvature Pen): the curve passes through every point. A smooth point's
  // tangent is the tangent of the circle through it and its two neighbours. Each handle is 0.3905 × its
  // segment, scaled by (cos α / cos 45°)^¼ where α is the angle between tangent and chord. That was fitted to
  // Photoshop's output; four points on a square make a circle. A corner point (`corner[i]`) and an open path's
  // ends have no tangent of their own: each side aims at the next handle, and two corners in a row make a
  // straight segment.
  function curvSegs(P: any, closed: any, corner: any) {
    const n = P.length, out = [];
    const at = (i: number) => (closed ? ((i % n) + n) % n : i);
    const sharp = (i: number) => !!(corner && corner[at(i)]) || (!closed && (i === 0 || i === n - 1));
    const unit = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
    const tan = P.map((p: any, i: number) => {
      if (sharp(i)) return null;
      const a = P[at(i - 1)], b = P[at(i + 1)];
      const ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y, d = 2 * (ax * by - ay * bx);
      const along = unit(b.x - a.x, b.y - a.y);
      if (Math.abs(d) < 1e-9 * (ax * ax + ay * ay + bx * bx + by * by)) return along;
      // centre of the circle through a, p, b (relative to p); the tangent is square to the radius
      const A = ax * ax + ay * ay, B = bx * bx + by * by, cx = (by * A - ay * B) / d, cy = (ax * B - bx * A) / d;
      const t = unit(-cy, cx);
      return t.x * along.x + t.y * along.y < 0 ? { x: -t.x, y: -t.y } : t;
    });
    const lerp = (a: any, b: any, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const len = (t: any, c: number, ux: number, uy: number) => c * 0.3905 * Math.pow(Math.max(0.05, Math.abs(t.x * ux + t.y * uy)) / Math.SQRT1_2, 0.25);
    for (let i = 0, m = closed ? n : n - 1; i < m; i++) {
      const p1 = P[i], j = at(i + 1), p2 = P[j], c = Math.hypot(p2.x - p1.x, p2.y - p1.y), ux = (p2.x - p1.x) / (c || 1), uy = (p2.y - p1.y) / (c || 1);
      let h1 = tan[i] && (() => { const d = len(tan[i], c, ux, uy); return { x: p1.x + tan[i].x * d, y: p1.y + tan[i].y * d }; })();
      let h2 = tan[j] && (() => { const d = len(tan[j], c, ux, uy); return { x: p2.x - tan[j].x * d, y: p2.y - tan[j].y * d }; })();
      if (!h1 && !h2) { h1 = lerp(p1, p2, 1 / 3); h2 = lerp(p1, p2, 2 / 3); }
      else if (!h1) h1 = lerp(p1, h2, 0.5);
      else if (!h2) h2 = lerp(p2, h1, 0.5);
      out.push([h1, h2, p2]);
    }
    return out;
  }
  // the cubic segments of a smooth polyline, by its kind
  const polySegs = (P: any, s: any) => (s.curv ? curvSegs(P, s.closed, s.corner) : smoothSegs(P, s.closed, s.tension));
  TD.curvSegs = curvSegs;
  TD.polySegs = polySegs;

  // Bends of a polyline (where "bend" arrow tips go): the inner vertices, or every vertex but the first when closed.
  function polyPathD(P: any, s: any, upto: any) {
    const A = P.slice(0, upto + 1);
    if (!(s.smooth && P.length > 2)) return A.map((p: any, i: any) => (i ? 'L' : 'M') + pt(p)).join('');
    const segs = polySegs(P, s).slice(0, upto);
    return 'M' + pt(P[0]) + segs.map(([a, b, c]) => `C${pt(a)} ${pt(b)} ${pt(c)}`).join('');
  }
  function polyBends(s: any, P: any) {
    if (!s.bpTip || s.bpTip === 'none' || P.length < 2) return null;
    const out = [], last = s.closed ? P.length - 1 : P.length - 2;
    for (let i = 1; i <= last; i++) {
      let u;
      if (s.smooth && P.length > 2) { const seg = polySegs(P, s)[i - 1]; u = norm(sub(P[i], seg[1]), norm(sub(P[i], P[i - 1]))); }
      else u = norm(sub(P[i], P[i - 1]));
      out.push({ P: P[i], u });
    }
    return out;
  }
  function polyBendFractions(s: any) {
    if (!s.bpTip || s.bpTip === 'none') return null;
    const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] }));
    const n = P.length, total = measurePath(polyPathD(s.closed ? [...P, P[0]] : P, { ...s, closed: false }, s.closed ? n : n - 1)).len;
    if (!(total > 0)) return null;
    const out = [], last = s.closed ? n - 1 : n - 2;
    for (let i = 1; i <= last; i++) out.push(measurePath(polyPathD(s.closed ? [...P, P[0]] : P, { ...s, closed: false }, i)).len / total);
    return out;
  }

  T.poly = {
    name: 'Polyline',
    create: (p: any, d: any) => ({ type: 'poly', pts: [[p.x, p.y], [p.x, p.y]], closed: false, ...lineStyle(d), fill: d.fill || null, startTip: 'none', endTip: 'none', ...TD.LINE_EXTRA, bpTip: 'none' }),
    valid: (s: any) => s.pts.length >= 2,
    handles: (s: any) => s.pts.map((p: any, i: any) => ({ k: 'v' + i, x: p[0], y: p[1] })),
    setHandle(s: any, k: any, q: any) { const i = +k.slice(1); s.pts[i] = [q.x, q.y]; },
    translate(s: any, dx: any, dy: any) { s.pts = s.pts.map((p: any) => [p[0] + dx, p[1] + dy]); },
    anchors: (s: any) => s.pts.map((p: any) => ({ x: p[0], y: p[1] })),
    samples(s: any) {
      const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] }));
      if (!((s.curv || s.tension != null) && s.smooth && P.length > 2)) return P;
      const out = [P[0]];
      for (const [a, b, c] of polySegs(P, s)) {
        const o = out[out.length - 1];
        for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; out.push({ x: u * u * u * o.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * c.x, y: u * u * u * o.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * c.y }); }
        out[out.length - 1] = c;
      }
      return out;
    },
    svg(s: any, ctx: any) {
      const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] }));
      const col = css(s.stroke || '#000');
      let tips = '';
      const Q = P.map((p: any) => ({ ...p }));
      if (!s.closed && P.length >= 2) {
        const n = P.length;
        let ue = norm(sub(P[n - 1], P[n - 2])), us = norm(sub(P[0], P[1]));
        if ((s.curv || s.tension != null) && s.smooth && n > 2) {
          // TikZ aims a tip along the last handle that isn't on the end point
          const G = polySegs(P, s), e = G[n - 2], b = G[0];
          ue = norm(sub(P[n - 1], e[1]), norm(sub(P[n - 1], e[0]), ue)); us = norm(sub(P[0], b[0]), norm(sub(P[0], b[1]), us));
        }
        const te = tip(s.endTip, P[n - 1], ue, s.width, col), ts = tip(s.startTip, P[0], us, s.width, col);
        Q[n - 1] = { x: P[n - 1].x - ue.x * te.back, y: P[n - 1].y - ue.y * te.back };
        Q[0] = { x: P[0].x - us.x * ts.back, y: P[0].y - us.y * ts.back };
        tips = ts.svg + te.svg;
      }
      const dOf = (A: any) => (s.smooth && A.length > 2
        ? 'M' + pt(A[0]) + polySegs(A, s).map(([a, b, c]) => `C${pt(a)} ${pt(b)} ${pt(c)}`).join('')
        : A.map((p: any, i: any) => (i ? 'L' : 'M') + pt(p)).join('')) + (s.closed ? 'Z' : '');
      const fillHit = s.closed && s.fill;
      const H = !s.smooth && hopsFor(s, s.closed ? [...Q, Q[0]] : Q, ctx.scene);
      const dQ = H ? hopPaths(s.closed ? [...Q, Q[0]] : Q, H).d + (s.closed ? 'Z' : '') : dOf(Q);
      return wrap(s, strokeSvg(s, dQ, dOf(P), polyBends(s, P), s.closed) + tips) + hit(dOf(P), ctx) +
        (fillHit && !ctx.export ? `<path class="hitfill" d="${dOf(P)}"/>` : '');
    },
    tikz(s: any, X: any) {
      const c = cmd(s, s.closed);
      if (!c) return '';
      let path;
      if (s.smooth && s.pts.length > 2) {
        const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] }));
        const n = P.length, straight = (i: number) => s.curv && s.corner && (s.corner[i] || (!s.closed && i === 0)) && (s.corner[(i + 1) % n] || (!s.closed && i + 1 === n - 1));
        if (s.tension != null && !s.curv) {
          const t = +s.tension, o = (s.closed ? 'smooth cycle' : 'smooth') + (Math.abs(t - 0.5) > 1e-9 ? `, tension=${+t.toFixed(3)}` : '');
          return `${c}${opts(styleOpts(s, X, { fill: s.closed, arrows: !s.closed, bends: polyBendFractions(s) }))} plot[${o}] coordinates {${s.pts.map((p: any) => X.c(p[0], p[1])).join(' ')}};`;
        }
        const segs = polySegs(P, s);
        // a closed path's last segment ends where it starts: `cycle` closes it, curved or straight
        path = !s.curv ? X.c(P[0].x, P[0].y) + segs.map(([a, b, e]: any) => ` .. controls ${X.c(a.x, a.y)} and ${X.c(b.x, b.y)} .. ${X.c(e.x, e.y)}`).join('') + (s.closed ? ' -- cycle' : '')
          : X.c(P[0].x, P[0].y) + segs.map(([a, b, e]: any, i: number) => (straight(i) ? ' --' : ` .. controls ${X.c(a.x, a.y)} and ${X.c(b.x, b.y)} ..`) + ' ' + (s.closed && i === segs.length - 1 ? 'cycle' : X.c(e.x, e.y))).join('');
      } else {
        const P = s.pts.map((p: any) => ({ x: p[0], y: p[1] }));
        const H = hopsFor(s, s.closed ? [...P, P[0]] : P, X.scene);
        path = H ? hopPaths(s.closed ? [...P, P[0]] : P, H, X).tz + (s.closed ? ' -- cycle' : '')
          : s.pts.map((p: any) => X.c(p[0], p[1])).join(' -- ') + (s.closed ? ' -- cycle' : '');
      }
      return `${c}${opts(styleOpts(s, X, { fill: s.closed, arrows: !s.closed, bends: polyBendFractions(s) }))} ${path};`;
    },
  };

  // Compound filled path made by Combine (unite / intersect / subtract / exclude / divide).
  // rings: closed polygons; holes come from the even-odd rule.
  const ringBox = (s: any) => bboxOf(s.rings.flat().map((p: any) => ({ x: p[0], y: p[1] })), 0);
  const ringsD = (s: any) => s.rings.map((r: any) => r.map((p: any, i: any) => (i ? 'L' : 'M') + r2(p[0]) + ',' + r2(p[1])).join('') + 'Z').join('');
  T.region = {
    name: 'Region',
    valid: (s: any) => s.rings && s.rings.length > 0,
    handles: (s: any) => boxHandles(ringBox(s)),
    setHandle(s: any, k: any, q: any, e: any, o: any) {
      const a = ringBox(o), b = boxResize(a, k, q, e);
      const sx = a.w ? b.w / a.w : 1, sy = a.h ? b.h / a.h : 1;
      s.rings = o.rings.map((r: any) => r.map(([x, y]: any) => [b.x + (x - a.x) * sx, b.y + (y - a.y) * sy]));
    },
    translate(s: any, dx: any, dy: any) { s.rings = s.rings.map((r: any) => r.map((p: any) => [p[0] + dx, p[1] + dy])); },
    anchors: (s: any) => { const b = ringBox(s); return boxHandles(b).map((h) => ({ x: h.x, y: h.y })).concat([{ x: b.x + b.w / 2, y: b.y + b.h / 2 }]); },
    samples: (s: any) => s.rings.flat().map((p: any) => ({ x: p[0], y: p[1] })),
    svg(s: any, ctx: any) {
      const d = ringsD(s);
      return wrap(s, `<path d="${d}" fill-rule="evenodd" stroke-linejoin="round" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" fill-rule="evenodd" d="${d}"/>` : '');
    },
    tikz(s: any, X: any) {
      const c = cmd(s, true);
      if (!c) return '';
      const o = styleOpts(s, X, { fill: true });
      if (s.rings.length > 1) o.push('even odd rule');
      o.push('line join=round');
      const path = s.rings.map((r: any) => r.map((p: any) => X.c(p[0], p[1])).join(' -- ') + ' -- cycle').join(' ');
      return `${c}${opts(o)} ${path};`;
    },
  };

  T.rect = {
    name: 'Rectangle',
    pts: [['x', 'y']],
    create: (p: any, d: any) => ({ type: 'rect', x: p.x, y: p.y, w: 0, h: 0, radius: 0, ...lineStyle(d), fill: d.fill || null }),
    // m: the tool's draw mode ('center' grows from where the drag began; corner to corner otherwise)
    drag(s: any, a: any, q: any, e: any, m?: any) { Object.assign(s, m === 'center' ? centreBox(a, q, e) : dragBox(a, q, e)); },
    valid: (s: any) => s.w > 2 && s.h > 2,
    handles: (s: any) => boxHandles(s),
    setHandle(s: any, k: any, q: any, e: any, o: any) { Object.assign(s, boxResize(o, k, q, e)); },
    anchors: (s: any) => boxHandles(s).map((h) => ({ x: h.x, y: h.y })).concat([{ x: s.x + s.w / 2, y: s.y + s.h / 2 }]),
    samples: (s: any) => [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }],
    svg(s: any, ctx: any) {
      const d = `M${r2(s.x)},${r2(s.y)}h${r2(s.w)}v${r2(s.h)}h${r2(-s.w)}Z`;
      return wrap(s, `<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" rx="${s.radius || 0}" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" d="${d}"/>` : '');
    },
    tikz(s: any, X: any) {
      const c = cmd(s, true);
      if (!c) return '';
      const o = styleOpts(s, X, { fill: true });
      if (s.radius) o.push(`rounded corners=${X.pt(s.radius)}`);
      return `${c}${opts(o)} ${X.c(s.x, s.y + s.h)} rectangle ${X.c(s.x + s.w, s.y)};`;
    },
  };

  const ellBox = (s: any) => ({ x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry });
  const fromBox = (b: any) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 });
  T.ellipse = {
    name: 'Ellipse',
    pts: [['cx', 'cy']],
    create: (p: any, d: any) => ({ type: 'ellipse', cx: p.x, cy: p.y, rx: 0, ry: 0, ...lineStyle(d), fill: d.fill || null }),
    // m: the tool's draw mode: 'center' (an ellipse from its centre), 'circle' (from the centre, the drag is the
    // radius), 'circle2' (the drag is a diameter); corner to corner otherwise
    drag(s: any, a: any, q: any, e: any, m?: any) {
      if (m === 'circle' || m === 'circle2') {
        const r = Math.hypot(q.x - a.x, q.y - a.y) / (m === 'circle2' ? 2 : 1);
        Object.assign(s, m === 'circle' ? { cx: a.x, cy: a.y } : { cx: (a.x + q.x) / 2, cy: (a.y + q.y) / 2 }, { rx: r, ry: r });
      } else Object.assign(s, fromBox(m === 'center' ? centreBox(a, q, e) : dragBox(a, q, e)));
    },
    valid: (s: any) => s.rx > 1 && s.ry > 1,
    handles: (s: any) => boxHandles(ellBox(s)),
    setHandle(s: any, k: any, q: any, e: any, o: any) { Object.assign(s, fromBox(boxResize(ellBox(o), k, q, e))); },
    anchors: (s: any) => [{ x: s.cx, y: s.cy }, { x: s.cx + s.rx, y: s.cy }, { x: s.cx - s.rx, y: s.cy }, { x: s.cx, y: s.cy + s.ry }, { x: s.cx, y: s.cy - s.ry }],
    samples: (s: any) => [{ x: s.cx - s.rx, y: s.cy - s.ry }, { x: s.cx + s.rx, y: s.cy + s.ry }],
    svg(s: any, ctx: any) {
      const d = `M${r2(s.cx - s.rx)},${r2(s.cy)}a${r2(s.rx)},${r2(s.ry)} 0 1,0 ${r2(2 * s.rx)},0a${r2(s.rx)},${r2(s.ry)} 0 1,0 ${r2(-2 * s.rx)},0`;
      return wrap(s, `<ellipse cx="${r2(s.cx)}" cy="${r2(s.cy)}" rx="${r2(s.rx)}" ry="${r2(s.ry)}" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" d="${d}"/>` : '');
    },
    tikz(s: any, X: any) {
      const c = cmd(s, true);
      if (!c) return '';
      const shape = Math.abs(s.rx - s.ry) < 0.01 ? `circle (${X.len(s.rx)})` : `ellipse (${X.len(s.rx)} and ${X.len(s.ry)})`;
      return `${c}${opts(styleOpts(s, X, { fill: true }))} ${X.c(s.cx, s.cy)} ${shape};`;
    },
  };

  function shade(hex: any, k: any) { // k<1 darker
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: any) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
    return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
  }
  T.ball = {
    name: 'Ball',
    pts: [['cx', 'cy']],
    create: (p: any, d: any) => ({ type: 'ball', cx: p.x, cy: p.y, r: 0, ballColor: d.ballColor || '#a05a5a', opacity: 1 }),
    drag(s: any, a: any, q: any) { s.r = dist(a, q); },
    fix(s: any) { if (s.r < 3) s.r = 20; },
    valid: () => true,
    handles: (s: any) => [{ k: 'r', x: s.cx + s.r, y: s.cy }],
    setHandle(s: any, k: any, q: any) { s.r = Math.max(2, dist({ x: s.cx, y: s.cy }, q)); },
    anchors: (s: any) => [{ x: s.cx, y: s.cy }, { x: s.cx + s.r, y: s.cy }, { x: s.cx - s.r, y: s.cy }, { x: s.cx, y: s.cy + s.r }, { x: s.cx, y: s.cy - s.r }],
    samples: (s: any) => [{ x: s.cx - s.r, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy + s.r }],
    svg(s: any, ctx: any) {
      const id = 'bg-' + s.id + (ctx.export ? '-x' : '');
      const c = TD.parseColor(s.ballColor).hex;
      return wrap(s, `<defs><radialGradient id="${id}" cx="0.42" cy="0.38" r="0.7" fx="0.3" fy="0.25">` +
        `<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.35)}"/></radialGradient></defs>` +
        `<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" fill="url(#${id})"/>`) +
        (ctx.export ? '' : `<circle class="hitfill" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/>`);
    },
    tikz(s: any, X: any) {
      const o = [`ball color=${X.col(s.ballColor)}`];
      const op = (s.opacity ?? 1) * TD.parseColor(s.ballColor).a;
      if (op < 1) o.push(`opacity=${f(op)}`);
      return `\\shade[${o.join(', ')}] ${X.c(s.cx, s.cy)} circle (${X.len(s.r)});`;
    },
  };

  T.dot = {
    name: 'Dot',
    pts: [['cx', 'cy']],
    create: (p: any, d: any) => ({ type: 'dot', cx: p.x, cy: p.y, r: 3, color: d.color || '#000000', opacity: 1 }),
    drag(s: any, a: any, q: any) { s.cx = q.x; s.cy = q.y; },
    valid: () => true,
    handles: () => [],
    anchors: (s: any) => [{ x: s.cx, y: s.cy }],
    samples: (s: any) => [{ x: s.cx - s.r, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy + s.r }],
    svg(s: any, ctx: any) {
      return wrap(s, `<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" fill="${css(s.color)}"/>`) +
        (ctx.export ? '' : `<circle class="hitfill" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/><circle class="hit" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/>`);
    },
    tikz(s: any, X: any) {
      const o = X.col(s.color) !== 'black' ? [X.col(s.color)] : [];
      const op = (s.opacity ?? 1) * TD.parseColor(s.color).a;
      if (op < 1) o.push(`opacity=${f(op)}`);
      return `\\fill${opts(o)} ${X.c(s.cx, s.cy)} circle (${X.len(s.r)});`;
    },
  };

  // Arc: angles in degrees, TikZ convention (counter-clockwise, y up). a2 in (a1, a1+360].
  // r is the x radius; ry, when set, makes it an elliptical arc and the angles are then TikZ's parametric
  // ones: the point at θ is (r cos θ, ry sin θ). angle, when set, turns those axes (degrees, counter-clockwise).
  const rad = (d: any) => (d * Math.PI) / 180;
  const arcRy = (s: any) => (s.ry > 0 ? s.ry : s.r);
  // a vector in the arc's own frame (x along its first axis, y up) → on screen, and back
  const arcW = (s: any, x: any, y: any) => { const a = rad(+s.angle || 0), c = Math.cos(a), n = Math.sin(a); return { x: c * x - n * y, y: -(n * x + c * y) }; };
  const arcL = (s: any, dx: any, dy: any) => { const a = rad(+s.angle || 0), c = Math.cos(a), n = Math.sin(a); return { x: c * dx - n * dy, y: -(n * dx + c * dy) }; }; // (inverse: R(-a) of (dx, -dy))
  const arcPt = (s: any, a: any) => { const v = arcW(s, s.r * Math.cos(rad(a)), arcRy(s) * Math.sin(rad(a))); return { x: s.cx + v.x, y: s.cy + v.y }; };
  // the direction the arc runs at θ (screen coordinates), and its speed there (length per radian)
  const arcDir = (s: any, a: any) => { const v = arcW(s, -s.r * Math.sin(rad(a)), arcRy(s) * Math.cos(rad(a))), l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l, l }; };
  const arcAng = (s: any, q: any) => { const L = arcL(s, q.x - s.cx, q.y - s.cy); return (Math.atan2(L.y / (arcRy(s) || 1), L.x / (s.r || 1)) * 180) / Math.PI; };
  const angOf = (c: any, q: any) => (Math.atan2(-(q.y - c.y), q.x - c.x) * 180) / Math.PI;
  // the arc's bounding box as fractions of its radii: cos θ and sin θ over [a1, a2]
  const arcBox = (s: any) => {
    const has = (t: any) => { const d = ((((t - s.a1) % 360) + 360) % 360); return d <= s.a2 - s.a1 + 1e-9; };
    const c = [Math.cos(rad(s.a1)), Math.cos(rad(s.a2))], n = [Math.sin(rad(s.a1)), Math.sin(rad(s.a2))];
    const cMax = has(0) ? 1 : Math.max(...c), cMin = has(180) ? -1 : Math.min(...c), sMax = has(90) ? 1 : Math.max(...n), sMin = has(270) ? -1 : Math.min(...n);
    // the edge handle goes on the side of the box furthest from the centre: that side moves as the radius changes
    const sx = cMax >= -cMin ? 1 : -1, sy = sMax >= -sMin ? 1 : -1;
    return { sx, sy, kx: Math.max(0.05, sx > 0 ? cMax : -cMin), ky: Math.max(0.05, sy > 0 ? sMax : -sMin), cMid: (cMax + cMin) / 2, sMid: (sMax + sMin) / 2 };
  };
  const normA2 = (s: any) => { let d = (((s.a2 - s.a1) % 360) + 360) % 360; if (d < 0.5) d = 360; s.a2 = s.a1 + d; };
  T.arc = {
    name: 'Arc',
    pts: [['cx', 'cy']],
    create: (p: any, d: any) => ({ type: 'arc', cx: p.x, cy: p.y, r: 0, a1: 0, a2: 90, ...lineStyle(d), startTip: 'none', endTip: 'none', ...TD.LINE_EXTRA }),
    drag(s: any, a: any, q: any, e: any) {
      s.r = dist(a, q);
      let ang = angOf(a, q);
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      s.a1 = Math.round(ang * 10) / 10; s.a2 = s.a1 + 90;
    },
    valid: (s: any) => s.r > 2,
    // the end handles set only θ1 and θ2; the radius has its own handle, on the arc halfway between them, and
    // two edge handles (on the side of the centre the arc bulges to) stretch it across or up and down
    // the edge handles sit on the middle of the far sides of its bounding box (z, the zoom, when drawn: one that
    // would sit on another handle is set just outside)
    handles: (s: any, z: any) => {
      const m = (s.a1 + s.a2) / 2, ry = arcRy(s), B = arcBox(s);
      const H = [{ k: 'a1', ...arcPt(s, s.a1) }, { k: 'a2', ...arcPt(s, s.a2) }, { k: 'rad', ...arcPt(s, m) }];
      const at = (k: any, x: any, y: any) => { const v = arcW(s, x, y); return { k, x: s.cx + v.x, y: s.cy + v.y }; };
      const o = z ? 14 / z : 0, near = (h: any) => z && H.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < 10 / z);
      let ex = at('rx', B.sx * B.kx * s.r, B.sMid * ry), ey = at('ry', B.cMid * s.r, B.sy * B.ky * ry);
      if (near(ex)) ex = at('rx', B.sx * (B.kx * s.r + o), B.sMid * ry);
      if (near(ey)) ey = at('ry', B.cMid * s.r, B.sy * (B.ky * ry + o));
      for (const h of H) (h as any).round = true; // on the circumference: round handles
      return [...H, ex, ey, { k: 'c', x: s.cx, y: s.cy, ctrl: true }];
    },
    setHandle(s: any, k: any, q: any, e: any, orig: any, p0: any) {
      if (k === 'c') { s.cx = q.x; s.cy = q.y; return; }
      const R = (v: any) => Math.max(2, Math.round(v * 100) / 100);
      if (k === 'rx' || k === 'ry') { // by how far the pointer has moved, so a handle set outside doesn't jump
        const o = orig || s, B = arcBox(o), ry0 = arcRy(o);
        const g = p0 || (() => { const v = arcW(o, k === 'rx' ? B.sx * B.kx * o.r : 0, k === 'ry' ? B.sy * B.ky * ry0 : 0); return { x: o.cx + v.x, y: o.cy + v.y }; })();
        const d = arcL(o, q.x - g.x, q.y - g.y); // the pointer's move in the arc's own frame
        if (k === 'rx') { s.r = R(o.r + (B.sx * d.x) / B.kx); s.ry = ry0; } else s.ry = R(ry0 + (B.sy * d.y) / B.ky);
        if (e.shiftKey) { if (k === 'rx') s.ry = s.r; else s.r = s.ry; } // Shift: back to a circle
        if (Math.abs(s.ry - s.r) < 1e-9) { // round again: a turn is just a shift of the angles
          delete s.ry;
          if (+s.angle) { s.a1 += +s.angle; s.a2 += +s.angle; delete s.angle; }
        }
        return;
      }
      if (k === 'rad') { // scales both radii together, keeping the shape
        const P = arcPt(s, (s.a1 + s.a2) / 2), d0 = dist({ x: s.cx, y: s.cy }, P) || 1, f = dist({ x: s.cx, y: s.cy }, q) / d0;
        const ry = arcRy(s); s.r = R(s.r * f); if (s.ry > 0) s.ry = R(ry * f);
        return;
      }
      let ang = arcAng(s, q);
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      ang = Math.round(ang * 10) / 10;
      if (k === 'a1') { const a2 = s.a2; s.a1 = ang; s.a2 = a2; normA2(s); }
      else { s.a2 = ang; normA2(s); }
    },
    // its own bounding box, turned with it (nw, ne, se, sw on screen when unturned)
    frame(s: any) {
      const B = arcBox(s), ry = arcRy(s), x0 = B.cMid * s.r, y0 = B.sMid * ry;
      const hw = ((B.sx > 0 ? B.kx : -B.kx) * s.r - x0) * B.sx, hh = ((B.sy > 0 ? B.ky : -B.ky) * ry - y0) * B.sy;
      return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([x, y]) => { const v = arcW(s, x0 + x, y0 + y); return [s.cx + v.x, s.cy + v.y]; });
    },
    anchors: (s: any) => [{ x: s.cx, y: s.cy }, arcPt(s, s.a1), arcPt(s, s.a2)],
    samples(s: any) { const a = []; for (let i = 0; i <= 32; i++) a.push(arcPt(s, s.a1 + ((s.a2 - s.a1) * i) / 32)); return a; },
    svg(s: any, ctx: any) {
      const col = css(s.stroke || '#000');
      const S = arcPt(s, s.a1), E = arcPt(s, s.a2);
      const D2 = arcDir(s, s.a2), D1 = arcDir(s, s.a1);
      const ue = { x: D2.x, y: D2.y };
      const us = { x: -D1.x, y: -D1.y };
      const te = tip(s.endTip, E, ue, s.width, col), ts = tip(s.startTip, S, us, s.width, col);
      const dOf = (b1: any, b2: any) => {
        const r = Math.max(s.r, 0.01), ry = Math.max(arcRy(s), 0.01), R = `${r2(r)},${r2(ry)} ${r2(-(+s.angle || 0))}`;
        const a1 = s.a1 + ((b1 / Math.max(D1.l, 0.01)) * 180) / Math.PI, a2 = s.a2 - ((b2 / Math.max(D2.l, 0.01)) * 180) / Math.PI;
        const sw = a2 - a1;
        if (sw <= 0) return '';
        if (sw >= 359.9) { // full circle: two halves
          const m = arcPt(s, a1 + 180);
          return `M${pt(arcPt(s, a1))}A${R} 0,0 ${pt(m)}A${R} 0,0 ${pt(arcPt(s, a1 + 359.99))}`;
        }
        return `M${pt(arcPt(s, a1))}A${R} ${sw > 180 ? 1 : 0},0 ${pt(arcPt(s, a2))}`;
      };
      return wrap(s, strokeSvg(s, dOf(ts.back, te.back), dOf(0, 0)) + ts.svg + te.svg) + hit(dOf(0, 0), ctx);
    },
    tikz(s: any, X: any) {
      if (!s.stroke) return '';
      // a turned arc is drawn unturned from its start, inside rotate around its centre
      const S = arcPt({ ...s, angle: 0 }, s.a1), o = styleOpts(s, X, { arrows: true });
      if (+s.angle) o.push(`rotate around={${f(+s.angle)}:${X.c(s.cx, s.cy)}}`);
      return `\\draw${opts(o)} ${X.c(S.x, S.y)} arc[start angle=${f(s.a1)}, end angle=${f(s.a2)}, ${s.ry > 0 ? `x radius=${X.len(s.r)}, y radius=${X.len(s.ry)}` : `radius=${X.len(s.r)}`}];`;
    },
  };

  // Spring (zigzag between two points). Matches TikZ decorations.pathmorphing zigzag.
  function springGeom(s: any) {
    const A = { x: s.x1, y: s.y1 }, B = { x: s.x2, y: s.y2 };
    const L = dist(A, B), u = norm(sub(B, A)), n = { x: u.y, y: -u.x };
    // pitch > 0: fixed coil length, so stretching adds coils (Mathcha-style); else a fixed count
    const pre = L * 0.12, coils = s.pitch > 0 ? Math.max(1, Math.round((L - 2 * pre) / s.pitch)) : Math.max(1, s.coils || 8);
    const seg = (L - 2 * pre) / coils;
    return { A, B, L, u, n, pre, seg, coils };
  }
  T.spring = {
    name: 'Spring',
    pts: [['x1', 'y1'], ['x2', 'y2']],
    create: (p: any, d: any) => ({ type: 'spring', x1: p.x, y1: p.y, x2: p.x, y2: p.y, pitch: 12, amplitude: 6, ...lineStyle(d), dash: 'solid' }),
    drag: T.line.drag,
    valid: T.line.valid,
    handles: T.line.handles,
    setHandle: T.line.setHandle,
    anchors: T.line.anchors,
    samples(s: any) {
      const g = springGeom(s);
      const off = (k: any) => ({ x: g.n.x * s.amplitude * k, y: g.n.y * s.amplitude * k });
      return [g.A, g.B].flatMap((p) => [{ x: p.x + off(1).x, y: p.y + off(1).y }, { x: p.x - off(1).x, y: p.y - off(1).y }]);
    },
    svg(s: any, ctx: any) {
      const g = springGeom(s);
      const at = (d: any, k: any) => ({ x: g.A.x + g.u.x * d + g.n.x * s.amplitude * k, y: g.A.y + g.u.y * d + g.n.y * s.amplitude * k });
      const P = [g.A, at(g.pre, 0)];
      for (let i = 0; i < g.coils; i++) {
        const b = g.pre + i * g.seg;
        P.push(at(b + 0.25 * g.seg, 1), at(b + 0.75 * g.seg, -1));
      }
      P.push(at(g.L - g.pre, 0), g.B);
      const d = P.map((p, i) => (i ? 'L' : 'M') + pt(p)).join('');
      return wrap(s, `<path d="${d}" ${strokeAttrs(s)} stroke-linejoin="round"/>`) + hit(d, ctx);
    },
    tikz(s: any, X: any) {
      if (!s.stroke) return '';
      const g = springGeom(s);
      X.libs.add('decorations.pathmorphing');
      const o = styleOpts(s, X);
      const pre = Math.round((g.pre / PX) * 10000) / 10000;
      const seg = Math.floor(((g.L / PX - 2 * pre) / g.coils) * 0.999 * 10000) / 10000;
      o.push(`decorate, decoration={zigzag, segment length=${seg}cm, amplitude=${X.len(s.amplitude)}cm, pre length=${pre}cm, post length=${pre}cm}`);
      return `\\draw${opts(o)} ${X.c(s.x1, s.y1)} -- ${X.c(s.x2, s.y2)};`;
    },
  };

  // padding between boxed text and its frame: TikZ's default inner sep (1/3 em)
  const textPad = (s: any) => TD.sizePx(s.size ?? 'normalsize') / 3;
  // A paragraph box (Photoshop-style area text) is a text shape with both a frame width `tw` and a
  // frame height `th`: (x, y) is the frame centre, lines wrap at the frame width and start at its top.
  // Text that does not fit runs on below the frame rather than being hidden, so nothing is lost on export.
  // With only `tw` set, the text wraps but its height follows the content (the older wrap-width mode).
  const isPara = (s: any) => s.tw > 0 && s.th > 0;
  TD.isParaText = isPara;
  const paraFrame = (s: any) => ({ x: s.x - s.tw / 2, y: s.y - s.th / 2, w: s.tw, h: s.th });
  function paraLayout(s: any) {
    const f = paraFrame(s), p = s.boxed ? textPad(s) : 0;
    const st = { ...s, tw: Math.max(4, s.tw - 2 * p) };
    const b = textBox(s.text || ' ', st);
    // vertical alignment inside the frame; text taller than the frame starts at its top and runs on below
    const free = Math.max(0, f.h - 2 * p - b.h), dy = s.valign === 'bottom' ? free : s.valign === 'middle' ? free / 2 : 0;
    return { f, p, st, b, dy, cx: f.x + p + b.w / 2, cy: f.y + p + dy + b.h / 2, bottom: Math.max(f.y + f.h, f.y + 2 * p + b.h) };
  }
  TD.paraLayout = paraLayout;
  // Vertical alignment of point text: (x, y) stays the box centre, and a change that makes the box taller
  // or shorter (a new line, a bigger font) moves the centre so the top (valign 'top') or bottom edge holds
  // still, along the text's own up-down axis when it is rotated. Without valign the box grows both ways.
  const textH = (s: any) => textBox(s.text || ' ', s).h + (s.boxed ? 2 * textPad(s) : 0);
  TD.textHold = function (s: any, fn: any) {
    if (!s || s.type !== 'text' || isPara(s) || (s.valign !== 'top' && s.valign !== 'bottom')) return fn();
    const h0 = textH(s), r = fn();
    if (s.type !== 'text' || isPara(s)) return r;
    const d = ((textH(s) - h0) / 2) * (s.valign === 'top' ? 1 : -1), a = ((s.angle || 0) * Math.PI) / 180;
    s.x += Math.sin(a) * d; s.y += Math.cos(a) * d; // angle is counter-clockwise on screen
    return r;
  };
  T.text = {
    name: 'Text',
    pts: [['x', 'y']],
    create: (p: any, d: any) => ({ type: 'text', x: p.x, y: p.y, text: '', tw: 0, valign: d.valign || 'top', size: d.size || 'normalsize', font: d.font || 'default', bold: false, italic: false, color: d.color || '#000000', opacity: 1 }),
    valid: (s: any) => s.text.trim().length > 0,
    // paragraph box: eight frame handles; point text: an edge handle that sets a wrapping width, on the right
    // edge, or on the left one for right-aligned text (whose right edge holds still)
    handles(s: any) {
      if (isPara(s)) return boxHandles(paraFrame(s));
      const b = textBox(s.text || ' ', s); return [{ k: 'tw', x: s.align === 'right' ? s.x - b.w / 2 : s.x + b.w / 2, y: s.y }];
    },
    setHandle(s: any, k: any, q: any, e: any, o: any) {
      if (isPara(o) && k !== 'tw') {
        const MIN = 16, f = paraFrame(o), nb = boxResize(f, k, q, e);
        // never collapse past the minimum: hold the edge opposite the dragged one
        if (nb.w < MIN) { nb.w = MIN; if (k.includes('w')) nb.x = f.x + f.w - MIN; else if (k.includes('e')) nb.x = f.x; }
        if (nb.h < MIN) { nb.h = MIN; if (k.includes('n')) nb.y = f.y + f.h - MIN; else if (k.includes('s')) nb.y = f.y; }
        // nor shorter than its text at the new width (narrower, it wraps to more lines): the frame, and so its
        // handles, take in all of it; the edge opposite the dragged one holds (the top, dragging a side)
        const need = paraLayout({ ...o, tw: nb.w, th: nb.h }), fit = need.bottom - need.f.y;
        if (nb.h < fit - 0.01) { if (k.includes('n')) nb.y += nb.h - fit; nb.h = fit; }
        s.tw = nb.w; s.th = nb.h; s.x = nb.x + nb.w / 2; s.y = nb.y + nb.h / 2;
        return;
      }
      const ob = textBox(o.text || ' ', o);
      if (o.align === 'right') { const right = o.x + ob.w / 2, w = Math.max(20, right - q.x); s.tw = w; s.x = right - w / 2; }
      else { const left = o.x - ob.w / 2, w = Math.max(20, q.x - left); s.tw = w; s.x = left + w / 2; }
      if (!s.align) s.align = 'left';
      // keep the top edge fixed while the height changes with wrapping (the bottom one for bottom-aligned
      // text, the centre for middle-aligned)
      const nb = textBox(s.text || ' ', s), v = o.valign || 'top';
      s.y = v === 'bottom' ? o.y + ob.h / 2 - nb.h / 2 : v === 'middle' ? o.y : o.y - ob.h / 2 + nb.h / 2;
    },
    // the first anchor is the point the alignment names (left + top → the top-left corner): a moved text
    // box snaps to the grid by it, so left-aligned text lines up on a grid line
    anchors(s: any) {
      const al = s.align || (s.tw > 0 ? 'left' : 'center'), va = s.valign || (isPara(s) ? 'top' : 'middle');
      let b;
      if (isPara(s)) b = paraFrame(s);
      else { const t = textBox(s.text || ' ', s), p = s.boxed ? textPad(s) : 0; b = { x: s.x - t.w / 2 - p, y: s.y - t.h / 2 - p, w: t.w + 2 * p, h: t.h + 2 * p }; }
      const a = { x: al === 'left' ? b.x : al === 'right' ? b.x + b.w : b.x + b.w / 2, y: va === 'top' ? b.y : va === 'bottom' ? b.y + b.h : b.y + b.h / 2 };
      const rest = isPara(s) ? boxHandles(b).map((h) => ({ x: h.x, y: h.y })).concat([{ x: s.x, y: s.y }]) : [{ x: s.x, y: s.y }];
      return [a, ...rest.filter((r) => Math.abs(r.x - a.x) > 1e-6 || Math.abs(r.y - a.y) > 1e-6)];
    },
    samples(s: any) {
      if (isPara(s)) { const L = paraLayout(s); return [{ x: L.f.x, y: L.f.y }, { x: L.f.x + L.f.w, y: L.bottom }]; }
      const b = textBox(s.text || ' ', s), p = s.boxed ? textPad(s) : 0;
      return [{ x: s.x - b.w / 2 - p, y: s.y - b.h / 2 - p }, { x: s.x + b.w / 2 + p, y: s.y + b.h / 2 + p }];
    },
    svg(s: any, ctx: any) {
      const op = s.opacity < 1 ? ` opacity="${s.opacity}"` : '';
      const frameStyle = () => ({ stroke: s.stroke, width: s.width ?? 1, dash: s.dash, fill: s.fill });
      if (isPara(s)) {
        const L = paraLayout(s), f = L.f;
        let box = s.boxed ? `<rect x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(f.h)}" rx="${s.radius || 0}" ${strokeAttrs(frameStyle(), true)}/>` : '';
        if (box && op) box = `<g${op}>${box}</g>`;
        // the whole frame is clickable, not just the glyphs
        const hit = ctx.export ? '' : `<rect class="hitfill" x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(L.bottom - f.y)}"/>`;
        return box + hit + textSvg(s.text || ' ', L.st, s.color, L.cx, L.cy, ctx, op);
      }
      let box = '';
      if (s.boxed) {
        const b = textBox(s.text || ' ', s), p = textPad(s);
        box = `<rect x="${r2(s.x - b.w / 2 - p)}" y="${r2(s.y - b.h / 2 - p)}" width="${r2(b.w + 2 * p)}" height="${r2(b.h + 2 * p)}" rx="${s.radius || 0}" ${strokeAttrs(frameStyle(), true)}/>`;
        box = op ? `<g${op}>${box}</g>` : box;
      }
      return box + textSvg(s.text || ' ', s, s.color, s.x, s.y, ctx, op);
    },
    tikz(s: any, X: any) {
      if (!s.text.trim()) return '';
      const o = textOpts(s, X);
      if (s.opacity < 1) o.push(`opacity=${f(s.opacity)}`);
      const frameOpts = () => {
        const so = styleOpts({ stroke: s.stroke, width: s.width ?? 1, dash: s.dash, fill: s.fill }, X, { fill: true });
        if (s.stroke && !so.some((x) => x.startsWith('draw='))) so.unshift('draw');
        if (s.radius) so.push(`rounded corners=${X.pt(s.radius)}`);
        return so;
      };
      if (isPara(s)) {
        // the frame is its own rectangle; the text is a node hung from the frame's top-left corner
        const L = paraLayout(s), F = L.f;
        let frame = '';
        if (s.boxed) {
          const so = frameOpts();
          if (s.opacity < 1) so.push(`opacity=${f(s.opacity)}`);
          frame = `\\path${opts(so)} ${X.c(F.x, F.y)} rectangle ${X.c(F.x + F.w, F.y + F.h)};\n`;
        }
        o.push(`text width=${X.len(L.st.tw)}cm`, `align=${s.align || 'left'}`, 'inner sep=0pt');
        // top-aligned text hangs from the frame's top-left corner; middle and bottom sit on the frame's
        // middle or bottom inner edge (unless the text is taller than the frame)
        const vb = L.dy > 0 && s.valign === 'bottom', vm = L.dy > 0 && s.valign === 'middle';
        o.push(vb ? 'anchor=south west' : vm ? 'anchor=west' : 'anchor=north west');
        const ny = vb ? F.y + F.h - L.p : vm ? F.y + F.h / 2 : F.y + L.p;
        return frame + `\\node${opts(o)} at ${X.c(F.x + L.p, ny)} {${tikzText(s.text)}};`;
      }
      if (s.boxed) o.push(...frameOpts());
      if (s.tw > 0) o.push(`text width=${X.len(s.tw)}cm`, `align=${s.align || 'left'}`, `inner sep=${s.boxed ? X.pt(textPad(s)) : '0pt'}`);
      else if (s.boxed) { o.push(`inner sep=${X.pt(textPad(s))}`); if (s.text.includes('\n')) o.push(`align=${s.align || 'center'}`); }
      else if (s.text.includes('\n')) o.push(`align=${s.align || 'center'}`);
      // top- or bottom-aligned multi-line text: anchor that edge, so LaTeX grows the node away from it as well
      // (the anchor sits inner sep outside the glyph box: 0 for unboxed wrapping text, ⅓ em otherwise)
      if ((s.valign === 'top' || s.valign === 'bottom') && (s.text.includes('\n') || s.tw > 0) && !s.angle) {
        const b = textBox(s.text, s), sep = s.tw > 0 && !s.boxed ? 0 : textPad(s), dn = s.valign === 'top' ? -1 : 1;
        o.push(dn < 0 ? 'anchor=north' : 'anchor=south');
        return `\\node${opts(o)} at ${X.c(s.x, s.y + dn * (b.h / 2 + sep))} {${tikzText(s.text)}};`;
      }
      return `\\node${opts(o)} at ${X.c(s.x, s.y)} {${tikzText(s.text)}};`;
    },
  };

  // ---------- page setup (document mode + LaTeX export) ----------
  TD.PAPERS = {
    a4: { name: 'A4', w: 21, h: 29.7, opt: 'a4paper' },
    a5: { name: 'A5', w: 14.8, h: 21, opt: 'a5paper' },
    b5: { name: 'B5', w: 17.6, h: 25, opt: 'b5paper' },
    letter: { name: 'US Letter', w: 21.59, h: 27.94, opt: 'letterpaper' },
    legal: { name: 'US Legal', w: 21.59, h: 35.56, opt: 'legalpaper' },
    custom: { name: 'Custom' },
  };
  TD.PAGE_DEFAULT = { paper: 'a4', orient: 'portrait', w: 21, h: 29.7, mt: 2.5, mb: 2.5, ml: 2.5, mr: 2.5, font: 11, title: true, author: '', spread: 1, numbered: false };
  // Resolved page size in cm: {W, H, textW, textH}
  TD.pageSize = function (pg: any) {
    pg = { ...TD.PAGE_DEFAULT, ...(pg || {}) };
    const P = TD.PAPERS[pg.paper] || TD.PAPERS.a4;
    let W = P.w ?? pg.w, H = P.h ?? pg.h;
    if (pg.orient === 'landscape') [W, H] = [Math.max(W, H), Math.min(W, H)];
    return { ...pg, W, H, textW: W - pg.ml - pg.mr, textH: H - pg.mt - pg.mb };
  };
  // whether a page setup leaves room for text: margins are checked against the paper, not only one at a time
  TD.pageFits = (pg: any) => { const P = TD.pageSize(pg); return P.textW >= 1 && P.textH >= 1; };

  // ---------- generic operations ----------
  TD.translate = function (s: any, dx: any, dy: any) {
    const t = (T as Record<string, any>)[s.type];
    if (t.translate) return t.translate(s, dx, dy);
    for (const [kx, ky] of t.pts) { s[kx] += dx; s[ky] += dy; }
    if (s.mc != null && s.type === 'line') s.mc += routeDir(s) === 'hh' ? dx : dy; // an elbow's middle moves with it
  };
  TD.bbox = function (s: any) {
    const t = (T as Record<string, any>)[s.type];
    const pad = s.type === 'text' ? 0 : (s.width || 0) / 2;
    let b = bboxOf(t.samples(s), pad);
    if (s.label && t.labelAt) {
      const L = t.labelAt(s), lp = labelPlace(s, L.P, L.u);
      const lb = { x: lp.x - lp.b.w / 2, y: lp.y - lp.b.h / 2, w: lp.b.w, h: lp.b.h };
      b = bboxOf([{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: lb.x, y: lb.y }, { x: lb.x + lb.w, y: lb.y + lb.h }]);
    }
    return b;
  };

  // Preamble lines needed for what a context X used.
  // quantikz2 restyles every tikz-cd diagram in the document (its own spacing, cell style, layers and a frame
  // round each row and column), which squeezes commutative diagrams and breaks ZX diagrams ('edgelayer' is not
  // part of the layer list). These lines keep tikz-cd's own settings outside quantum circuits; the first block
  // must come before quantikz2 is loaded.
  const QK_CD = [
    '\\usetikzlibrary{cd}',
    '\\makeatletter % quantikz2 restyles every tikz-cd diagram: keep tikz-cd\'s own look outside quantum circuits',
    '\\pgfkeysgetvalue{/tikz/commutative diagrams/every cell/.@cmd}\\dtx@cdcell',
    '\\pgfkeysgetvalue{/tikz/commutative diagrams/arrows/.@cmd}\\dtx@cdarrows',
    '\\pgfkeysgetvalue{/tikz/commutative diagrams/row sep/normal}\\dtx@cdrow',
    '\\pgfkeysgetvalue{/tikz/commutative diagrams/column sep/normal}\\dtx@cdcol',
    '\\newcommand\\dtx@cdplain{%',
    '  \\pgfkeyslet{/tikz/commutative diagrams/every cell/.@cmd}\\dtx@cdcell',
    '  \\pgfkeyslet{/tikz/commutative diagrams/arrows/.@cmd}\\dtx@cdarrows',
    '  \\pgfkeyslet{/tikz/commutative diagrams/row sep/normal}\\dtx@cdrow',
    '  \\pgfkeyslet{/tikz/commutative diagrams/column sep/normal}\\dtx@cdcol',
    '  \\tikzset{nodes in empty cells=false}%',
    '  \\let\\DivideRowsCols\\relax}',
    '\\AddToHook{env/tikzcd/begin}{\\dtx@cdplain}',
    '\\makeatother',
  ];
  const QK_ZX = [
    '\\makeatletter % quantikz2 makes every tikz-cd diagram reset the layers to its own; give ZX diagrams theirs too',
    '\\let\\dtx@setlayers\\pgfsetlayers',
    '\\newcommand\\dtx@zxlayers[1]{\\dtx@setlayers{background,quantback,belownodelayer,edgelayer,nodelayer,main,abovenodelayer,box,labellayer,foreground}}',
    '\\AddToHook{env/ZX/begin}{\\let\\pgfsetlayers\\dtx@zxlayers}',
    '\\makeatother',
  ];
  // pgf-umlcd makes \object its object environment inside every tikzpicture, and xy-pic draws each entry of an
  // \xymatrix with its own \object: an xy diagram (a node's interrupted picture) gets xy's back
  const XY_UML = [
    '\\makeatletter % pgf-umlcd takes \\object inside pictures; xy diagrams in them need xy\'s own',
    '\\let\\dtx@xyobject\\object',
    '\\let\\dtx@interruptpicture\\pgfinterruptpicture',
    '\\def\\pgfinterruptpicture{\\dtx@interruptpicture\\let\\object\\dtx@xyobject}',
    '\\makeatother',
  ];
  TD.preambleCompat = (X: any) => {
    const qk = X.libs.has('quantikz2'), zx = X.pkgs.has('zx-calculus');
    return { before: qk && (zx || X.pkgs.has('tikz-cd')) ? QK_CD : [], after: [...(qk && zx ? QK_ZX : []), ...(X.pkgs.has('xy') && X.pkgs.has('pgf-umlcd') ? XY_UML : [])] };
  };
  TD.preamble = function (X: any) {
    const pre = ['\\usepackage{tikz}'];
    const libs = [...X.libs], compat = TD.preambleCompat(X);
    pre.push(...compat.before);
    if (libs.length) pre.push(`\\usetikzlibrary{${libs.join(', ')}}`);
    if (X.pkgs.has('pgfplots')) pre.push('\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}');
    // forest with its libraries: 'forest', 'forest[edges]' … become one \usepackage[edges]{forest}
    const forest = [...X.pkgs].filter((p) => /^forest\b/.test(p));
    for (const p of X.pkgs) if (p !== 'pgfplots' && p !== 'xy:color' && !/^forest\b/.test(p) && !p.startsWith('svgcolor:')) pre.push(p === 'tikz-feynman' ? '\\usepackage[compat=1.1.0]{tikz-feynman}' : p === 'xy' ? `\\usepackage[all${X.pkgs.has('xy:color') ? ',color' : ''}]{xy}` : p === 'svg' ? TD.texImages.SVG_PKG : `\\usepackage{${p}}`);
    if (forest.length) {
      const fl = [...new Set(forest.map((p) => (/\[(.*)\]/.exec(p) || [])[1]).filter(Boolean))];
      pre.push(`\\usepackage${fl.length ? `[${fl.join(', ')}]` : ''}{forest}`);
    }
    pre.push(...compat.after);
    // xcolor svgnames that kept code uses (DarkBlue): defined by value, which works whatever loaded xcolor first
    for (const p of X.pkgs) if (p.startsWith('svgcolor:')) { const n = p.slice(9), h = TD.svgColor && TD.svgColor(n); if (h) pre.push(`\\definecolor{${n}}{HTML}{${h.slice(1).toUpperCase()}}`); }
    return pre;
  };
  // ---------- named point: \coordinate (A) at (x,y); ----------
  // A point other code refers to by name. On the canvas it is a small cross with its name (the size stays the
  // same on screen); it draws nothing in exports. Lines that start or end on it stay attached and are written
  // with the name, (A), rather than its numbers.
  T.coord = {
    name: 'Named Point',
    pts: [['x', 'y']],
    create: (p: any) => ({ type: 'coord', x: p.x, y: p.y, tikzName: 'A' }),
    valid: (s: any) => !!String(s.tikzName || '').trim(),
    handles: () => [],
    anchors: (s: any) => [{ x: s.x, y: s.y }],
    samples: (s: any) => [{ x: s.x, y: s.y }],
    svg(s: any, ctx: any) {
      if (ctx && ctx.export) return '';
      const x = r2(s.x), y = r2(s.y);
      return `<g class="tkcoord" transform="translate(${x} ${y})"><path class="tkcoord-mark" d="M-1 0H1M0 -1V1"/>`
        + `<text class="tkcoord-tag" x="0" y="0">${esc(s.tikzName || '')}</text><circle class="hitfill" r="1"/></g>`;
    },
    translate(s: any, dx: any, dy: any) { s.x += dx; s.y += dy; },
    tikz(s: any, X: any) {
      const nm = String(s.tikzName || '').trim();
      return nm ? `\\coordinate (${nm}) at ${X.c(s.x, s.y)};` : '';
    },
  };

  // ---------- source write-back ----------
  // Imported shapes carry s.tex (src/domain/tikzimport.ts importPicture): the statement they came from and a signature of
  // the shape as imported. While a statement's shapes are all there, in order and unchanged, it exports as it was
  // written (comments and formatting included); a picture with nothing changed exports exactly as written.
  const SIG_SKIP = new Set(['id', 'tex', 'name', 'gname', 'g', 'scopeGroup', 'locked', 'hidden', 'ex']);
  // round: numbers to 1e-4 px (the signature a move and a move back do not change)
  const stable = (v: any, R: any) => (Array.isArray(v) ? `[${v.map((q) : any => stable(q, R)).join(',')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) : any => JSON.stringify(k) + ':' + stable(v[k], R)).join(',')}}`
    : R && typeof v === 'number' ? JSON.stringify(Math.round(v * 1e4) / 1e4 || 0) : JSON.stringify(v));
  TD.texSig = function (s: any, round: any) {
    const c: Record<string, any> = {};
    for (const k of Object.keys(s)) if (!SIG_SKIP.has(k) && k[0] !== '_') c[k] = s[k];
    const str = stable(c, !!round);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36) + '.' + str.length.toString(36);
  };
  const unchanged = (s: any) => !!(s.tex && s.tex.sig && s.tex.sig === TD.texSig(s));
  // what code written as-is needs: the packages and libraries the shapes would ask for
  function needs(list: any, X: any) {
    const Y = makeX(); Y.scene = X.scene || list;
    for (const s of list) {
      if (s.tex?.preamble && X.preDefs) X.preDefs.add(s.tex.preamble);
      for (const lib of s.tex?.libs || []) Y.libs.add(lib);
      for (const pkg of s.tex?.pkgs || []) Y.pkgs.add(pkg);
      try { (T as Record<string, any>)[s.type].tikz(s, Y); } catch (e: any) { /* only the libraries matter here */ } }
    if (list.some((s: any) => s.pos)) Y.libs.add('positioning');
    if (list.some((s: any) => s.chain)) Y.libs.add('chains');
    for (const l of Y.libs) X.libs.add(l);
    for (const p of Y.pkgs) X.pkgs.add(p);
  }
  function shapeCode(s: any, X: any) {
    // a translucent shape fades as one group (as on the canvas): fill and stroke separately would darken where they overlap
    if (!(s.opacity != null && s.opacity < 1 && GROUPED.has(s.type))) return (T as Record<string, any>)[s.type].tikz(s, X);
    X.groupOpacity = true;
    let code;
    try { code = (T as Record<string, any>)[s.type].tikz(s, X); } finally { X.groupOpacity = false; }
    return code ? `\\begin{scope}[transparency group, opacity=${f(s.opacity)}]\n  ${code.replace(/\n/g, '\n  ')}\n\\end{scope}` : code;
  }
  const GROUPED = new Set(['line', 'curve', 'poly', 'region', 'rect', 'ellipse', 'arc', 'spring']);
  // ---------- structure kept from the source (src/domain/tikzimport.ts) ----------
  // the TikZ names an object defines: a named point's, an imported node's
  const namesOf = (q: any) => (q.type === 'coord' && q.tikzName ? [q.tikzName] : q.tex && q.tex.i === 0 && q.tex.nm ? q.tex.nm : []);
  // statements in code: the ; outside braces and brackets
  const stmtCount = (c: any) => { let d = 0, n = 0; for (let i = 0; i < c.length; i++) { const ch = c[i]; if (ch === '\\') { i++; continue; } if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') d--; else if (ch === ';' && !d) n++; } return n; };
  // points of s that sit on a named point defined before it (one it went through in the source, or one an end
  // is attached to) are written by the name: (A) rather than (1.5,2)
  function refMap(s: any, list: any, n: any, X: any) {
    const want = new Set(s.refs || []);
    for (const L of ['link1', 'link2']) if (s[L]) { const c = list.find((q: any) => q.id === s[L].id); if (c && c.type === 'coord' && c.tikzName) want.add(c.tikzName); }
    if (!want.size) return null;
    const m = new Map();
    for (const nm of want) {
      let c = null;
      for (let q = 0; q < n; q++) if (list[q].type === 'coord' && list[q].tikzName === nm) c = list[q];
      if (c) { const k = X.c(c.x, c.y); if (!m.has(k)) m.set(k, `(${nm})`); }
    }
    return m.size ? m : null;
  }
  // a shape whose options came from named styles: the styles by name while the fields they set still hold
  // (s.tkStyle = { n: names, f: { field: [as styled, without the styles] } })
  function styledCode(s: any, X: any) {
    const S = s.tkStyle;
    if (!S || !S.n || !S.n.length) return null;
    const J = (v: any) => JSON.stringify(v ?? null);
    const F = Object.entries<any>(S.f || {});
    if (!F.every(([k, [v]]) => J(s[k]) === J(v))) return null;
    const b = { ...s };
    delete b.tkStyle;
    for (const [k, [, v]] of F) { if (v == null) delete b[k]; else b[k] = v; }
    // the options as written now, less those the styles account for (the ones the shape without its styles
    // would not write the same); then, if reading that back does not give the shape, also the options the
    // styles share a key with. A colour named only for the comparison is not kept.
    const code = shapeCode(s, X), keep = new Map(X.colors), refs = X.refs;
    let base, plain;
    try { base = shapeCode(b, X); X.refs = null; plain = shapeCode(s, X); } finally { X.refs = refs; X.colors.clear(); for (const [k, v] of keep) X.colors.set(k, v); }
    const RE = /^\\(draw|fill|filldraw|path|node|shade|shadedraw)\b(?:\[((?:[^\[\]]|\[[^\]]*\])*)\])?/;
    const m = RE.exec(code || ''), mb = RE.exec(base || ''), mp = RE.exec(plain || '');
    if (!m || !mb || !mp || m[1] !== mb[1] || stmtCount(code) !== 1) return null;
    const cur = splitOpts(m[2] || ''), own = splitOpts(mb[2] || ''), key = (o: any) => o.split('=')[0].trim();
    const lost = new Set(own.filter((o) => !cur.includes(o)).map(key));
    for (const X2 of [cur.filter((o) => own.includes(o)), cur.filter((o) => own.includes(o) || lost.has(key(o)))]) {
      if (!readsBack(s, plain.replace(mp[0], `\\${m[1]}[${[...S.n.map((nm: any) => (S.d || {})[nm] || ''), ...X2].filter(Boolean).join(', ')}]`))) continue;
      return code.replace(m[0], `\\${m[1]}[${[...S.n, ...X2].join(', ')}]`);
    }
    return null;
  }
  // A shape linked to one of the file's named styles: \draw[block, …] with only what it sets differently, and the
  // style defined once (\tikzset{block/.style={…}}, X.decls). Kept only when reading it back, with the style written
  // out, gives the shape again; otherwise the shape is written in full.
  const RESET: [RegExp, string][] = [[/^(dashed|dotted|dash dot|dash pattern=)/, 'solid'], [/^(\{[^}]*\}|[^=,{}]*)-(\{[^}]*\}|[^=,{}]*)$/, '-'],
    [/^fill=/, 'fill=none'], [/^draw=/, 'draw=black'], [/^opacity=/, 'opacity=1'], [/^draw opacity=/, 'draw opacity=1'],
    [/^fill opacity=/, 'fill opacity=1'], [/^text=/, 'text=black'], [/^text opacity=/, 'text opacity=1']];
  /** a named style's own options (one list for every kind of shape) */
  function namedOpts(st: any, X: any) {
    const k = st.keys || {}, syn = { type: 'rect', ...k };
    return [...styleOpts(syn, X, { fill: 'fill' in k, arrows: 'startTip' in k || 'endTip' in k }), ...textOpts(syn, X)];
  }
  function namedCode(s: any, X: any) {
    const st = s.style && (X.namedStyles || []).find((q: any) => q.id === s.style);
    if (!st) return null;
    const keep = new Map(X.colors), refs = X.refs;
    let code, plain, def: string[];
    try { def = namedOpts(st, X); code = shapeCode(s, X); X.refs = null; plain = shapeCode(s, X); }
    finally { X.refs = refs; }
    const RE = /^\\(draw|fill|filldraw|path|node|shade|shadedraw)\b(?:\[((?:[^\[\]]|\[[^\]]*\])*)\])?/;
    const m = RE.exec(code || ''), mp = RE.exec(plain || '');
    const undo = () => { X.colors.clear(); for (const [a, b] of keep) X.colors.set(a, b); };
    if (!m || !mp || stmtCount(code) !== 1) { undo(); return null; }
    const cur = splitOpts(m[2] || ''), key = (o: string) => o.split('=')[0].trim();
    const own = cur.filter((o) => !def.includes(o));
    // what the style sets that the shape does not have: set back (a style's dashes on a solid shape: solid)
    const resets = [];
    for (const d of def) {
      if (cur.includes(d)) continue;
      const r = RESET.find(([re]) => re.test(d));
      if (r && !own.some((o) => key(o) === key(d) || r[0].test(o))) resets.push(r[1]);
    }
    const opts = [...own, ...resets];
    if (!drawsSame(s, X, plain!.replace(mp[0], `\\${m[1]}[${[st.name, ...opts].join(', ')}]`), st.name, def, plain!)) { undo(); return null; }
    const id = 'style:' + st.id;
    if (!X.decls) X.decls = new Map();
    if (!X.decls.has(id)) X.decls.set(id, { name: st.name, decl: `\\tikzset{${st.name}/.style={${def.join(', ')}}}` });
    return code!.replace(m[0], `\\${m[1]}[${[st.name, ...opts].join(', ')}]`);
  }
  TD.namedStyleDef = (st: any) => namedOpts(st, makeX()).join(', ');
  // `code` (naming style `name`, defined as `def`) read back, with the picture's colours, writes the same TikZ as the
  // shape does (`plain`): the same drawing, whatever defaults the reader fills in
  function drawsSame(s: any, X: any, code: string, name: string, def: string[], plain: string) {
    const R = TD.importInternals && TD.importInternals.preview;
    if (!R) return false;
    const colours = [...X.colors].map(([hex, nm]: any) => `\\definecolor{${nm}}{HTML}{${hex.slice(1).toUpperCase()}}`).join('\n');
    let r;
    try { r = R(colours + '\n' + code, [], {}, {}, { [name]: def.join(', ') }).shapes; } catch (e: any) { return false; }
    if (!r || r.length !== 1 || r[0].type !== s.type) return false;
    const refs = X.refs;
    try { X.refs = null; return shapeCode({ ...r[0], id: s.id }, X) === plain; } catch (e: any) { return false; } finally { X.refs = refs; }
  }
  // code read back (styles written out) gives the shape again: the fields the same, numbers to rounding
  function readsBack(s: any, code: any) : any {
    const R = TD.importInternals && TD.importInternals.preview;
    if (!R) return false;
    let r;
    try { r = R(code, [], {}).shapes; } catch (e: any) { return false; }
    if (!r || r.length !== 1 || r[0].type !== s.type) return false;
    const skip = new Set(['id', 'tex', 'tkStyle', 'style', 'so', 'refs', 'link1', 'link2', 'g', 'gname', 'name', 'pos', 'locked', 'hidden', 'ex']);
    const near = (a: any, b: any): boolean => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.25
      : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => near(v, b[i]))
      : a && b && typeof a === 'object' && typeof b === 'object' ? [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => near(a[k], b[k]))
      : (a ?? null) === (b ?? null));
    return [...new Set([...Object.keys(s), ...Object.keys(r[0])])].every((k) => skip.has(k) || k[0] === '_' || near(s[k], r[0][k]));
  }
  // an option list's entries (commas inside braces, brackets or parentheses do not split)
  function splitOpts(str: any) {
    const out = [];
    let d = 0, cur = '';
    for (const ch of str) {
      if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
      if (ch === ',' && !d) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // An imported picture's options kept for code written from its shapes (s.tex.po, on its first shape). Those every
  // node or path takes (every node/.style, nodes={…}, inner sep=… and the other keys only nodes read) are wrapped
  // round the statements kept as written, which rely on them; code written from a shape already says all of it, and a
  // shape added here must not take them (a text would be boxed by every node/.style={draw}). Named styles and >=Tip
  // stay on the picture.
  const EVERY = /^\s*(every\b[^=]*\/\.(?:append )?style|nodes|(?:inner|outer) [xy]?sep|minimum (?:size|width|height)|align|text (?:width|centered|height|depth))\s*(?:=|$)/;
  function pictureOpts(shapes: any) {
    const own: string[] = [], every = new Map<string, string>(); // picture → its every-node options
    const all = [...new Set(shapes.map((s: any) => s.tex && s.tex.po).filter(Boolean))];
    for (const s of shapes) {
      const po = s.tex && s.tex.po;
      if (!po) continue;
      const E = splitOpts(po).filter((o) => EVERY.test(o));
      if (E.length) every.set(s.tex.p, E.join(', '));
      if (all.length === 1 && !own.length) own.push(...splitOpts(po).filter((o) => !EVERY.test(o)));
    }
    return { own, every };
  }
  // a node placed with the positioning library (s.pos = { k: 'right', v: '1cm of a', of, off }): written so
  // again while it is still where that puts it from the node it names
  function posCode(s: any, code: any, list: any, n: any) {
    const P = s.pos;
    if (s.type !== 'text' || !P || !code) return null;
    let r = null;
    for (let q = 0; q < n; q++) if (namesOf(list[q]).includes(P.of)) r = list[q];
    if (!r || Math.abs(s.x - r.x - P.off[0]) > 1e-6 || Math.abs(s.y - r.y - P.off[1]) > 1e-6) return null;
    const m = /^\\node(?:\[([^\]]*)\])? at \([^()]*\) \{/.exec(code);
    if (!m || /\banchor=/.test(m[1] || '') || stmtCount(code) !== 1) return null;
    const nm = s.tex && s.tex.i === 0 && s.tex.nm && s.tex.nm[0];
    return code.replace(m[0], `\\node[${[m[1], `${P.k}=${P.v}`].filter(Boolean).join(', ')}]${nm ? ` (${nm})` : ''} {`);
  }
  // a statement whose shapes only moved, together: the move (px), else null
  function shiftOf(run: any) {
    const t = run[0].tex;
    if (!t.b || !run.every((r: any) => r.tex.sr)) return null;
    const b = TD.bbox(run[0]), dx = b.x - t.b[0], dy = b.y - t.b[1];
    if (!isFinite(dx) || !isFinite(dy) || (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6)) return null;
    for (const r of run) {
      const c = JSON.parse(JSON.stringify(r));
      TD.translate(c, -dx, -dy);
      if (TD.texSig(c, true) !== r.tex.sr) return null;
    }
    return { dx, dy };
  }
  // the code of each object in order: statements written as they were where nothing changed, generated code elsewhere
  // Source map for the code dialog: with TD.srcMark set, each statement is wrapped in invisible marks naming
  // its shapes; TD.srcMap takes them out and says which lines each statement fills
  const M0 = '\uE000', M1 = '\uE001', M2 = '\uE002';
  const mark = (ids: any, code: any) => (TD.srcMark && code ? M0 + ids.join(',') + M1 + code + M2 : code);
  TD.srcMap = function (text: any) {
    let out = '', line = 1, cur = null;
    const spans = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === M0) { const j = text.indexOf(M1, i); cur = { ids: text.slice(i + 1, j).split(','), a: 0, b: 0 }; spans.push(cur); i = j; continue; }
      if (ch === M2) { cur = null; continue; }
      if (ch === '\n') line++;
      else if (cur && !/\s/.test(ch)) { if (!cur.a) cur.a = line; cur.b = line; }
      out += ch;
    }
    return { text: out, spans: spans.filter((x) => x.a) };
  };
  TD.tikzLines = function (shapes: any, X: any) {
    const items: any[] = [];
    const exportGroup = (s: any) => s.scopeGroup ? s.g : null;
    const linkedIds = new Set(shapes.flatMap((s: any) => [s.link1?.id,s.link2?.id].filter(Boolean)));
    // node features set in the app (an imported node still as read holds them in its source, written as is)
    const nativeChanged = (s: any) => !unchanged(s) && (s.nodeName || s.nodeLabel || s.nodePin || (TD.nodeFeatures?.types.has(s.type) && linkedIds.has(s.id)));
    if (shapes.some((s: any) => s.pos)) X.libs.add('positioning'); // right=1cm of a, as written or kept (posCode)
    if (shapes.some((s: any) => s.chain)) X.libs.add('chains'); // \chainin, for the chain's nodes written from the model
    for (const s of shapes) {
      for (const lib of s.tex?.libs || []) X.libs.add(lib);
      for (const pkg of s.tex?.pkgs || []) X.pkgs.add(pkg);
      for (const code of [s.type === 'tikz' ? s.code : s.tex && s.tex.src, s.tex?.preamble]) {
      if (!code || !code.includes('color')) continue;
      for (const m of code.matchAll(/\\(?:definecolor|colorlet)\s*\{([^}]*)\}/g)) (X.reserved = X.reserved || new Set()).add(m[1].trim());
      // \definecolor{name}{HTML|RGB|rgb}{…} at the top level: generated code may use the name for that colour
      if ((s.type === 'tikz' || code === s.tex?.preamble) && !(s.ctx && s.ctx.length)) for (const m of code.matchAll(/\\definecolor\s*\{([^}]*)\}\s*\{(HTML|RGB|rgb)\}\s*\{([^}]*)\}/g)) {
        const v = m[3].split(',').map((x: any) => x.trim());
        const n = m[2] === 'HTML' ? [0, 2, 4].map((i) => parseInt(v[0].slice(i, i + 2), 16)) : v.map((x: any) => Math.round(m[2] === 'rgb' ? +x * 255 : +x));
        if (n.length !== 3 || !n.every((x: any) => x >= 0 && x <= 255)) continue;
        const hex = '#' + n.map((x: any) => x.toString(16).padStart(2, '0')).join('');
        X.named = X.named || new Map(); if (!X.named.has(hex)) X.named.set(hex, m[1].trim());
      }
      }
    }
    for (const preamble of new Set(shapes.map((s: any) => s.tex?.preamble).filter(Boolean))) {
      if (X.preDefs) X.preDefs.add(preamble);
      else items.push({code:preamble,ctx:[],group:null});
    }
    const every = pictureOpts(shapes).every;
    for (let n = 0; n < shapes.length;) {
      const s = shapes[n], t = s.tex;
      if (t && t.i === 0 && t.src != null) {
        const run = shapes.slice(n, n + t.n);
        const whole = run.length === t.n && run.every((r: any, q: any) => r.tex && r.tex.p === t.p && r.tex.k === t.k && r.tex.i === q);
        // (a named point alone is simply written where it is now)
        const same = whole && run.every((r: any) => r.g === s.g && !nativeChanged(r)) && run.every(unchanged), d = whole && !run.some(nativeChanged) && !same && !run.every((r: any) => r.type === 'coord') ? shiftOf(run) : null;
        // Patch a label only when every other field still matches its imported signature.
        // The original statement retains names, anchors, whitespace and option ordering.
        const label = t.label;
        let patched: string | null = null;
        if (whole && t.n === 1 && label && s.type === 'text' && !nativeChanged(s)
          && TD.texSig({ ...s, text: label.value }) === t.sig && s.text !== label.value) {
          const text = String(s.text).replace(/\n/g, '\\\\');
          let depth = 0, valid = true;
          for (let i = 0; i < text.length; i++) {
            if (text[i] === '\\') { i++; continue; }
            if (text[i] === '%' || (text[i] === '}' && --depth < 0)) { valid = false; break; }
            if (text[i] === '{') depth++;
          }
          if (valid && !depth && label.from >= t.cut && label.to >= label.from && label.to <= t.src.length)
            patched = t.src.slice(0, label.from) + text + t.src.slice(label.to);
        }
        if (same || d || patched != null) {
          needs(run, X);
          const own = TD.rawTikz.dedent((patched ?? t.src).slice(t.cut));
          // only moved: as written, in a shift scope outside its own scopes
          const ids = run.map((r: any) => r.id);
          const ctx = [...(every.has(t.p) ? [every.get(t.p)] : []), ...(t.ctx || [])];
          if (own.trim()) items.push(d ? { code: mark(ids, TD.rawTikz.wrapCode(own, ctx, X.c(d.dx, d.dy))), ctx: [], group: exportGroup(s) } : { code: mark(ids, own), ctx, group: exportGroup(s) });
          if (t.drop) (X.notes = X.notes || new Set()).add(`Picture options left out (they belong to the whole picture): ${t.drop.join(', ')}`);
          n += t.n; continue;
        }
      }
      X.refs = refMap(s, shapes, n, X);
      let code, placed = null;
      try {
        code = namedCode(s, X) || styledCode(s, X) || shapeCode(s, X);
        placed = posCode(s, code, shapes, n);
        if (placed) code = placed;
      } finally { X.refs = null; }
      // a node other statements still name keeps its name, as a coordinate where the text is (a named point
      // renamed here keeps its old name the same way, for the code kept as written that uses it)
      const old = t && t.nm && t.i === 0 ? t.nm.filter((nm: any) => !(s.type === 'coord' && nm === s.tikzName)) : [];
      // a node that was on a chain: written where it is, then put back in its chain (\chainin does not move it),
      // so the nodes after it kept as written still follow it (a text node takes its name back for that)
      let chainNm = s.chain && code ? s.nodeName || null : null;
      if (s.chain && code && !chainNm && s.type === 'text' && old.length) {
        const m = /^\\node(\[[^\]]*\])? at \(/.exec(code);
        if (m) { code = code.replace(m[0], `\\node${m[1] || ''} (${old[0]}) at (`); chainNm = old[0]; }
        else if (code.includes(`(${old[0]})`)) chainNm = old[0];
      }
      if (code && old.length && !placed && !chainNm && !nativeChanged(s) && (s.type === 'text' || s.type === 'coord')) code += '\n' + old.map((nm: any) => `\\coordinate (${nm}) at ${X.c(s.x, s.y)};`).join('\n');
      if (code && chainNm) code += `\n\\chainin (${chainNm})${s.chain.name && s.chain.name !== 'chain' ? ` [on chain=${s.chain.name}]` : ''};`;
      if (code) items.push({ code: mark([s.id], code), ctx: [], group: exportGroup(s) });
      n++;
    }
    // consecutive statements from the same scopes share them
    const out = [];
    for (let a = 0; a < items.length;) {
      const key = JSON.stringify([items[a].ctx, items[a].group]);
      let b = a + 1;
      while (b < items.length && JSON.stringify([items[b].ctx, items[b].group]) === key) b++;
      const code = items.slice(a, b).map(x => x.code).join('\n');
      if (items[a].group) out.push('\\begin{scope}\n  ' + TD.rawTikz.wrapCode(code, items[a].ctx).replace(/\n/g, '\n  ') + '\n\\end{scope}');
      else if (!items[a].ctx.length) out.push(...items.slice(a, b).map(x => x.code));
      else out.push(TD.rawTikz.wrapCode(code, items[a].ctx));
      a = b;
    }
    return out;
  };
  // the whole picture as written, when every statement of one imported picture is there, in order and unchanged
  TD.tikzWhole = function (shapes: any, X: any) {
    const L = shapes.filter((s: any) => !s.hidden && !(s.type === 'tikz' && s.pre));
    const t0 = L.length && L[0].tex;
    const nativeIds = new Set(L.filter((s: any) => TD.nodeFeatures?.types.has(s.type)).map((s: any) => s.id));
    if (L.some((s: any) => s.scopeGroup || (!unchanged(s) && (s.nodeName || s.nodeLabel || s.nodePin || nativeIds.has(s.link1?.id) || nativeIds.has(s.link2?.id))))) return null;
    if (!t0 || t0.k !== 0 || t0.i !== 0 || !t0.open) return null;
    let k = 0, i = 0;
    for (const s of L) {
      const t = s.tex;
      if (!t || t.p !== t0.p || t.k !== k || t.i !== i || !unchanged(s)) return null;
      if (++i === t.n) { k++; i = 0; }
    }
    if (k !== t0.N || i !== 0) return null;
    needs(L, X);
    // definitions from the source's preamble: to the preamble, or (a snippet) first in the picture
    const pre = shapes.filter((s: any) => !s.hidden && s.type === 'tikz' && s.pre).map((s: any) => mark([s.id], T.tikz.tikz(s, X))).filter(Boolean);
    if (!X.preDefs) for (const preamble of new Set(L.map((s: any) => s.tex?.preamble).filter(Boolean))) pre.push(preamble);
    const runIds = (s: any) => L.filter((r: any) => r.tex.k === s.tex.k).map((r: any) => r.id);
    return { open: t0.open, pre, body: L.filter((s: any) => s.tex.i === 0).map((s: any) => mark(runIds(s), s.tex.src)).join('') + L[L.length - 1].tex.tail, close: '\\end{tikzpicture}' };
  };
  // Body lines (definecolors + shapes) for a list of shapes.
  TD.tikzBody = function (shapes: any, X: any) {
    shapes = shapes.filter((s: any) => !s.hidden); // a hidden layer is not exported
    X.scene = shapes;
    const source = [...shapes];
    // Only reorder an edge when an attached node would otherwise be a forward reference.
    const byId = new Map(source.map(s => [s.id, s]));
    const ordered: any[] = [], visiting = new Set<any>(), done = new Set<any>();
    const visit = (s: any) => { if (done.has(s) || visiting.has(s)) return; visiting.add(s);
      for (const link of [s.link1,s.link2]) { const target = link && byId.get(link.id); if (target && TD.nodeFeatures?.types.has(target.type)) visit(target); }
      visiting.delete(s); done.add(s); ordered.push(s);
    };
    source.forEach(visit);
    const body = TD.tikzLines(ordered, X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    if (X.decls) for (const d of X.decls.values()) defs.push(d.decl);
    return [...defs, ...(defs.length ? [''] : []), ...body];
  };
  // \begin{tikzpicture}[…] for written code: the source picture's options that only set defaults the generated
  // code does not rely on (>=Stealth), when the shapes came from one picture
  TD.tikzOpen = function (shapes: any) {
    const { own } = pictureOpts(shapes);
    return `\\begin{tikzpicture}[x=1cm, y=1cm${own.length ? ', ' + own.join(', ') : ''}]`;
  };
  // what the picture's own options use (a style naming DarkBlue, a library's keys), for the preamble
  const openUses = (open: any, X: any) => { if (!TD.lint || !TD.lint.uses) return; const u = TD.lint.uses(open); for (const l of u.libs) X.libs.add(l); for (const p of u.pkgs) X.pkgs.add(p); };
  TD.tikzPicture = function (shapes: any, X: any) {
    if (!TD.math.finalizing) return TD.math.synchronous(() => TD.tikzPicture(shapes, X));
    const W = TD.tikzWhole(shapes, X);
    if (W) { openUses(W.open, X); return W.open + W.pre.map((c: any) => '\n  ' + c.replace(/\n/g, '\n  ')).join('') + W.body + W.close; }
    const open = TD.tikzOpen(shapes);
    openUses(open, X);
    return [open, ...TD.tikzBody(shapes, X).map((l: any) => (l ? '  ' + l.replace(/\n/g, '\n  ') : l)), '\\end{tikzpicture}'].join('\n');
  };

  const notesOf = (X: any) => [...(X.notes || [])].map((n) => '% Note: ' + n);
  // Full TikZ document generation.
  // TeX holds lengths up to 16383.99pt (575.8 cm). A drawing that far from the origin (a Whiteboard scrolled a long
  // way) is written moved back to it, by whole centimetres, which changes nothing in the picture; one bigger than that
  // can't be written at all, and the code says so (`note`).
  const TEX_REACH_CM = 560;
  TD.texReach = function (shapes: any[]): { shapes: any[]; note: string | null } {
    const L = shapes.filter((s: any) => !s.hidden);
    if (!L.length) return { shapes, note: null };
    const B = TD.bboxOf(L.flatMap((s: any) => { const b = TD.bbox(s); return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]; }), 0);
    if (Math.max(Math.abs(B.x), Math.abs(B.y), Math.abs(B.x + B.w), Math.abs(B.y + B.h)) / PX <= TEX_REACH_CM) return { shapes, note: null };
    const note = `The drawing reaches ${Math.round(Math.max(B.w, B.h) / PX)} cm across; TeX's lengths stop at 575 cm, so LaTeX stops with "Dimension too large". Move its parts closer together.`;
    // too big to fit, or placed by expressions that a move would not follow
    if (Math.max(B.w, B.h) / PX > TEX_REACH_CM || L.some((s: any) => s.ex && Object.keys(s.ex).length)) return { shapes, note };
    const dx = -Math.round(B.x / PX) * PX, dy = -Math.round(B.y / PX) * PX;
    return { shapes: shapes.map((s: any) => { const c = JSON.parse(JSON.stringify(s)); TD.translate(c, dx, dy); return c; }), note: null };
  };
  /**
   * The preamble lines for the text's fonts: the document font (`doc`: false for a snippet, which goes into someone's own
   * document), the fonts objects ask for, and for Thai text its fonts and the \tdbr its line breaks use.
   */
  TD.fontLines = (X: any, body: string, { doc = true } = {}) => {
    const engine: TexEngine = X.engine || 'pdflatex', main = doc ? docFontPreamble(X.docFont, engine) : [];
    // Thai: with XeLaTeX a Thai font for Thai in a Latin one; with pdfLaTeX the TLWG fonts' LTH faces (src/core/doc-fonts.ts)
    const thai = !hasThai(body) ? [] : engine === 'xelatex' ? [...(docFont(X.docFont).thai ? [] : thaiFallback()), THAI_BREAK_DEF] : [...THAI_PDF, THAI_BREAK_DEF];
    // fontspec once: as the document loads it (with no-math), or plainly
    const spec = main.find((l) => /^\\usepackage(\[[^\]]*\])?\{fontspec\}$/.test(l));
    return [...new Set([...main, ...(X.fontPre || []), ...thai])].filter((l) => !(spec && l !== spec && l === '\\usepackage{fontspec}'));
  };
  /** A Thai document font with pdfLaTeX, which sets only its Thai in it: said in the code. */
  TD.fontNote = (X: any) => X.engine !== 'xelatex' && docFont(X.docFont).thai
    ? `The document font ${docFont(X.docFont).label}: pdfLaTeX sets its Thai in it and the rest in Computer Modern; XeLaTeX sets all of it.` : null;
  TD.toTikz = function (shapes: any, { standalone = false, engine = 'pdflatex' as TexEngine, docFont: font = undefined as string | undefined } = {}) {
    const X = makeX({ engine, docFont: font });
    if (standalone) X.preDefs = new Set();
    const reach = TD.texReach(shapes);
    shapes = reach.shapes;
    if (reach.note) (X.notes = X.notes || new Set()).add(reach.note);
    const pic = TD.tikzPicture(shapes, X);
    // the maths and text styles in labels: their packages, and definitions for \mathbfit and \mathsfit
    const need = TD.lint && TD.lint.mathNeeds ? TD.lint.mathNeeds(pic) : { pkgs: [], defs: [] };
    for (const p of need.pkgs) X.pkgs.add(p);
    const pre = [...TD.preamble(X), ...need.defs, ...(X.preDefs ? X.preDefs : []), ...TD.fontLines(X, pic, { doc: standalone })];
    const fontNote = TD.fontNote(X);
    if (fontNote && standalone) (X.notes = X.notes || new Set()).add(fontNote);
    const done = (tex: string) => finishThai(tex, X.engine || 'pdflatex');
    if (!standalone) {
      // a snippet: the packages on one comment line, and any compatibility lines (each its own line) to copy
      const c = TD.preambleCompat(X), extra = [...c.before, ...c.after, ...need.defs];
      const head = '% Requires: ' + pre.filter((l) => !extra.includes(l)).join(' ');
      const alt = pre.includes('\\usetikzlibrary{quantikz2}') ? ['% (or \\usepackage{quantikz} in place of \\usetikzlibrary{quantikz2})'] : [];
      const note = c.before.length ? ['% and, in the preamble, these lines (the first block before \\usetikzlibrary{quantikz2}):', ...extra.map((l) => '%   ' + l)]
        : extra.length ? ['% and, in the preamble, these lines:', ...extra.map((l) => '%   ' + l)] : [];
      return done([head, ...alt, ...note, ...notesOf(X), pic, ''].join('\n'));
    }
    return done([
      ...notesOf(X),
      // standalone's tikz option breaks zx-calculus (an error at \begin{document}); one picture needs no option
      pre.some((l) => l.includes('{zx-calculus}')) ? '\\documentclass[border=4pt]{standalone}' : '\\documentclass[tikz, border=4pt]{standalone}',
      ...pre,
      '\\begin{document}',
      pic,
      '\\end{document}',
      '',
    ].join('\n'));
  };
})();
