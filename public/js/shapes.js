// Shape definitions: geometry, handles, SVG rendering and TikZ export.
// Units: world coordinates are SVG px (y down). 40px = 1cm in TikZ (y up).
(function () {
  const TD = (window.TD = window.TD || {});
  TD.unsaved = TD.unsaved || []; // checks that say an open editor holds edits not yet applied
  TD.VERSION = '1.32.2'; // app version: bump with each release tag (shown in the sidebar footer)
  const PX = (TD.PX_PER_CM = 40);
  const K = (TD.PT_PER_PX = 28.4528 / PX); // pt per px
  TD.GRID = 10;

  TD.SIZES = [
    ['tiny', 5], ['scriptsize', 7], ['footnotesize', 8], ['small', 9], ['normalsize', 10],
    ['large', 12], ['Large', 14.4], ['LARGE', 17.28], ['huge', 20.74], ['Huge', 24.88],
  ];
  TD.BLOCK_SIZE = 'large'; // a new block's label size (XyMatrix, quantum, circuit, tree), whatever the text default is
  // size is a LaTeX size name or a number (px)
  TD.sizePx = (name) => (typeof name === 'number' ? name : (TD.SIZES.find((s) => s[0] === name) || TD.SIZES[4])[1] / K);
  TD.FONTS = [
    ['default', '(font default)', 'KaTeX_Main, "Times New Roman", serif', ''],
    ['cmr', 'Computer Modern Serif', 'KaTeX_Main, serif', '\\rmfamily'],
    ['cmss', 'Computer Modern Sans', 'KaTeX_SansSerif, sans-serif', '\\sffamily'],
    ['cmtt', 'Computer Modern Typewriter', 'KaTeX_Typewriter, monospace', '\\ttfamily'],
    ['times', 'Times New Roman', '"Times New Roman", Times, serif', '\\fontfamily{ptm}\\selectfont'],
    ['arial', 'Arial / Helvetica', 'Arial, Helvetica, sans-serif', '\\fontfamily{phv}\\selectfont'],
    ['courier', 'Courier New', '"Courier New", Courier, monospace', '\\fontfamily{pcr}\\selectfont'],
  ];
  const fontOf = (k) => TD.FONTS.find((f) => f[0] === k) || TD.FONTS[0];

  // Colors: '#rrggbb' or '#rrggbbaa' (alpha). null = none.
  TD.parseColor = (c) => {
    if (!c) return null;
    if (typeof c === 'object') c = TD.fillColor(c);
    const h = c.replace('#', '');
    return { hex: '#' + h.slice(0, 6).toLowerCase(), a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  };
  TD.css = (c) => {
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
  const TIKZ_TIP = Object.fromEntries(TIP_DEFS.filter((d) => d[2]).map(([k, , t]) => [k, t]));
  TD.TIKZ_TIP = TIKZ_TIP;
  // line decorations
  TD.SHAFTS = [['single', 'Single'], ['double', 'Double'], ['wave', 'Wavy'], ['ticks', 'Ticked']];
  TD.CROSSES = [['none', 'None'], ['hop', 'Hop over lines below'], ['gap', 'Gap (white halo)']];
  // keys every line-like shape has (absent in older files = default)
  TD.LINE_EXTRA = { midTip: 'none', shaft: 'single', cross: 'none' };
  TD.LINEISH = new Set(['line', 'curve', 'poly', 'arc']);

  // ---------- helpers ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (v, fb) => {
    const l = Math.hypot(v.x, v.y);
    return l < 1e-9 ? fb || { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
  };
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const pt = (q) => `${r2(q.x)},${r2(q.y)}`;
  TD.util = { r2, esc, dist, norm, sub };

  // Patch el's content to html in place, for property panels that re-render while a field is being typed in:
  // nodes that keep their place and tag are kept, so the focused field keeps its focus, caret and text while
  // every other field takes its new value. TD.morph.busy is set while nodes move, for focusout handlers.
  function morph(el, html) {
    const act = document.activeElement;
    if (!act || act === el || !el.contains(act)) { el.innerHTML = html; return; }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const val = act.value, key = Object.entries(act.dataset || {}).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${CSS.escape(v)}"]`).join('');
    let sel = null;
    try { sel = act.selectionStart == null ? null : [act.selectionStart, act.selectionEnd]; } catch (_) { /* number fields have no caret */ }
    morph.busy = true;
    try {
      kids(el, tpl.content, act);
      // the field's place changed: focus its counterpart and carry the typing over
      if (!act.isConnected && key) {
        const n = el.querySelector(act.tagName.toLowerCase() + key);
        if (n) { n.value = val; n.focus(); if (sel) try { n.setSelectionRange(sel[0], sel[1]); } catch (_) { /* no caret */ } }
      }
    } finally { morph.busy = false; }
  }
  // Nodes another script adds to the panel (a switch's sliding knob, see segthumb.js) are not in the new HTML: leave them be.
  const foreign = (n) => n.nodeType === 1 && n.classList.contains('seg-thumb');
  const KEEP = ['has-thumb'];
  function kids(a, b, act) {
    const an = [...a.childNodes].filter((n) => !foreign(n)), bn = [...b.childNodes];
    bn.forEach((n, i) => {
      const o = an[i];
      if (!o) a.appendChild(n);
      else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) a.replaceChild(n, o);
      else if (o.nodeType === 1) patch(o, n, act);
      else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    });
    for (let i = bn.length; i < an.length; i++) an[i].remove();
  }
  function patch(o, n, act) {
    const keep = KEEP.filter((c) => o.classList.contains(c));
    if (keep.length) n.classList.add(...keep);
    for (const at of [...o.attributes]) if (!n.hasAttribute(at.name)) o.removeAttribute(at.name);
    for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value) o.setAttribute(at.name, at.value);
    const live = o !== act;
    if (o.tagName === 'INPUT') {
      if (live) { if (o.type === 'checkbox' || o.type === 'radio') o.checked = n.hasAttribute('checked'); else o.value = n.getAttribute('value') ?? ''; }
    } else if (o.tagName === 'TEXTAREA') {
      if (live) o.value = n.textContent;
    } else if (o.tagName === 'SELECT') {
      const si = [...n.querySelectorAll('option')].findIndex((x) => x.hasAttribute('selected'));
      kids(o, n, act);
      if (live) o.selectedIndex = Math.max(0, si);
    } else kids(o, n, act);
  }
  TD.morph = morph;

  // Constrain q to 15-degree steps around a.
  function constrain(a, q) {
    const ang = Math.atan2(q.y - a.y, q.x - a.x);
    const step = Math.PI / 12;
    const s = Math.round(ang / step) * step;
    const d = dist(a, q);
    return { x: a.x + Math.cos(s) * d, y: a.y + Math.sin(s) * d };
  }
  TD.constrain = constrain;

  function dashArray(dash, w) {
    const on = 3 / K, off = 2 / K;
    if (dash === 'dashed') return `${r2(on)} ${r2(on)}`;
    if (dash === 'dotted') return `${r2(w)} ${r2(off)}`;
    if (dash === 'dashdot') return `${r2(on)} ${r2(off)} ${r2(w)} ${r2(off)}`;
    const pat = TD.dashPat && TD.dashPat(dash);
    if (pat && pat.length && pat.some((n) => n > 0)) return (pat.length % 2 ? pat.concat(pat) : pat).map((n) => r2(n / K)).join(' ');
    return '';
  }
  TD.dashArray = dashArray;

  function strokeAttrs(s, fillable) {
    const a = [];
    if (s.stroke) {
      a.push(`stroke="${css(s.stroke)}" stroke-width="${s.width}"`);
      const da = dashArray(s.dash, s.width);
      if (da) a.push(`stroke-dasharray="${da}"`);
    } else a.push('stroke="none"');
    a.push(`fill="${fillable && s.fill ? css(s.fill) : 'none'}"`);
    return a.join(' ');
  }

  const wrap = (s, inner) => (s.opacity != null && s.opacity < 1 ? `<g opacity="${s.opacity}">${inner}</g>` : inner);
  const hit = (d, ctx) => (ctx.export ? '' : `<path class="hit" d="${d}" stroke-width="${ctx.hit}"/>`);

  // Computer Modern Rightarrow (arrows.meta To, tikz-cd's cm to): width 2.097 x length, two curves from the back
  // corners into the point, round caps and join. d = distance of the drawn point behind P; dir -1 = reversed, its
  // back corners on P. back = where the line stops, end = the back end (where a following tip's point goes).
  function cmArrow(P, u, w, color, len, d, dir) {
    const n = { x: -u.y, y: u.x }, ca = len - w, cb = 2.096774 * len - w;
    const X = (x) => (dir > 0 ? d - x : d + ca + 0.5 * w + x);
    const c = (x, y) => pt({ x: P.x - u.x * X(x) + n.x * y, y: P.y - u.y * X(x) + n.y * y });
    const svg = `<path d="M${c(-ca, cb / 2)}C${c(-0.81731 * ca, 0.2 * cb)} ${c(-0.41019 * ca, 0.05833 * cb)} ${c(0, 0)}C${c(-0.41019 * ca, -0.05833 * cb)} ${c(-0.81731 * ca, -0.2 * cb)} ${c(-ca, -cb / 2)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return { svg, back: dir > 0 ? d + 0.5 * w : d + ca, end: d + ca + w };
  }

  // Arrow tip geometry. P = tip point, u = unit direction pointing out of the path at P.
  function tip(type, P, u, w, color) {
    if (!type || type === 'none') return { svg: '', back: 0 };
    const lw = w * K;
    const L = (3 + 4.5 * lw) / K;
    const n = { x: -u.y, y: u.x };
    const at = (a, b) => ({ x: P.x - u.x * a + n.x * b, y: P.y - u.y * a + n.y * b });
    const W = 0.375 * L;
    const cmTo = (d, dir) => cmArrow(P, u, w, color, (1.6 + 2.2 * lw) / K, d, dir);
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
        const q = tip(type.slice(0, -1), at(L, 0), { x: -u.x, y: -u.y }, w, color);
        return { svg: q.svg, back: 0.3 * L };
      }
      case 'to2': {
        // the second tip's point sits on the first one's back end; the line runs on to the front tip
        const t1 = cmTo(0.5 * w, 1), t2 = cmTo(t1.end, 1);
        return { svg: t1.svg + t2.svg, back: t1.back };
      }
      case 'stealth2': case 'latex2': {
        const base = type.slice(0, -1), off = base === 'latex' ? 0.8 * L : 0.6 * L;
        const a = tip(base, P, u, w, color), b = tip(base, at(off, 0), u, w, color);
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
        const bar = (a) => `<path d="M${pt(at(a + w / 2, H))}L${pt(at(a + w / 2, -H))}" stroke="${color}" stroke-width="${w}"/>`;
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
  let flatPath = null;
  function measurePath(d) {
    if (!flatPath) {
      const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden');
      flatPath = document.createElementNS(NS, 'path');
      sv.appendChild(flatPath); document.body.appendChild(sv);
    }
    flatPath.setAttribute('d', d);
    let len = 0;
    try { len = flatPath.getTotalLength(); } catch (e) { len = 0; }
    const at = (l) => { const p = flatPath.getPointAtLength(Math.max(0, Math.min(len, l))); return { x: p.x, y: p.y }; };
    const dir = (l) => norm(sub(at(Math.min(len, l + 0.5)), at(Math.max(0, l - 0.5))));
    return { len, at, dir };
  }
  TD.measurePath = measurePath;
  const ext = (s, k) => s[k] ?? TD.LINE_EXTRA[k];
  // wavy (TikZ snake: amplitude 2.5pt, segment length 10pt) and ticked versions of a path
  const WAVE_A = 2.5 / K, WAVE_L = 10 / K, TICK_L = 6 / K, TICK_A = 3 / K;
  function wavePath(d) {
    const m = measurePath(d);
    if (m.len < 1) return d;
    const n = Math.max(8, Math.ceil(m.len / 1.5)), out = [];
    for (let i = 0; i <= n; i++) {
      const l = (m.len * i) / n, p = m.at(l), u = m.dir(l), a = WAVE_A * Math.sin((2 * Math.PI * l) / WAVE_L);
      out.push((i ? 'L' : 'M') + pt({ x: p.x + u.y * a, y: p.y - u.x * a }));
    }
    return out.join('');
  }
  function tickPath(d, s = {}) {
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
  function strokeSvg(s, d, full, bends, fillable) {
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
  function decoOpts(s, X, fr) {
    const o = [], shaft = ext(s, 'shaft');
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
  function segX(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y }, q = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * q.y - r.y * q.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den, v = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    return t > 0 && t < 1 && v >= 0 && v <= 1 ? t : null;
  }
  function hopsFor(s, P, scene) {
    if (ext(s, 'cross') !== 'hop' || !scene) return null;
    const idx = scene.indexOf(s);
    const below = (idx < 0 ? scene : scene.slice(0, idx)).filter((o) => o !== s && T[o.type] && T[o.type].samples && !['text', 'image', 'plot', 'solid', 'prim3d', 'revolve', 'sketch3d', 'geo3d', 'geo2d', 'pie', 'cd', 'xy', 'qc', 'forest', 'zx', 'bloch', 'feynman', 'timing', 'automata', 'kmap', 'bytefield', 'chemfig', 'tikz'].includes(o.type));
    const polys = below.map((o) => {
      const q = T[o.type].samples(o);
      if (o.type === 'rect') return [q[0], { x: q[1].x, y: q[0].y }, q[1], { x: q[0].x, y: q[1].y }, q[0]];
      return o.closed ? [...q, q[0]] : q;
    });
    const r = 3 + s.width, hops = P.slice(1).map(() => []);
    for (let i = 0; i + 1 < P.length; i++) {
      const A = P[i], B = P[i + 1], L = dist(A, B);
      if (L < 4 * r) continue;
      for (const q of polys) for (let j = 0; j + 1 < q.length; j++) {
        const t = segX(A, B, q[j], q[j + 1]);
        if (t != null && t * L > 1.5 * r && (1 - t) * L > 1.5 * r && !hops[i].some((x) => Math.abs(x - t) * L < 2.2 * r)) hops[i].push(t);
      }
      hops[i].sort((a, b) => a - b);
    }
    return hops.some((h) => h.length) ? { hops, r } : null;
  }
  // straight path through P with hops → SVG d and TikZ path
  function hopPaths(P, H, X) {
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
  TD.clearTextCache = () => { htmlCache.clear(); sizeCache.clear(); };

  // Split a line into text / math segments: $…$ is inline math; $$…$$ and \[…\] are display
  // math ({ math: true, display: true }), rendered and exported as \displaystyle.
  function segments(line) {
    const out = [];
    let buf = '', math = false, display = false;
    const flush = (m, d) => { out.push({ math: m, display: !!(m && d), s: buf }); buf = ''; };
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
  const PROSE_CMDS = {
    textbf: 'font-weight:bold', textit: 'font-style:italic', emph: 'font-style:italic', textsl: 'font-style:oblique',
    underline: 'text-decoration:underline', texttt: 'font-family:"Courier New",Courier,monospace', textsf: 'font-family:Helvetica,Arial,sans-serif',
    textrm: '', textsc: 'font-variant:small-caps', textup: 'font-style:normal', textmd: 'font-weight:normal', textnormal: 'font-weight:normal;font-style:normal',
  };
  const PROSE_SYMS = {
    ldots: '…', dots: '…', textbackslash: '\\', textasciicircum: '^', textasciitilde: '~', textdegree: '°', S: '§', P: '¶', copyright: '©',
    textendash: '–', textemdash: '—', textbullet: '•', textbraceleft: '{', textbraceright: '}', textunderscore: '_', textdollar: '$', textbar: '|', textless: '&lt;', textgreater: '&gt;', quad: ' ', qquad: '  ', nbsp: ' ',
    LaTeX: 'L<span style="font-size:.75em;vertical-align:.25em;margin:0 -.15em 0 -.36em">A</span>T<span style="vertical-align:-.5ex;margin:0 -.125em 0 -.1667em">E</span>X',
    TeX: 'T<span style="vertical-align:-.5ex;margin:0 -.125em 0 -.1667em">E</span>X',
  };
  function parseProse(src) {
    let i = 0;
    const braced = () => { // a balanced {…} at i, returned whole
      let j = i + 1, d = 1;
      for (; j < src.length && d; j++) { if (src[j] === '\\') j++; else if (src[j] === '{') d++; else if (src[j] === '}') d--; }
      const g = src.slice(i, j); i = j; return g;
    };
    function group(inner) {
      const out = [];
      let buf = '';
      const push = (n) => { if (buf) out.push(buf); buf = ''; if (n) out.push(n); };
      while (i < src.length) {
        const c = src[i];
        if (c === '}' && inner) { i++; break; }
        if (c === '{') { i++; push({ cmd: '', kids: group(true) }); continue; }
        if (c === '~') { i++; push({ sym: 'nbsp' }); continue; }
        if (c !== '\\') { buf += c; i++; continue; }
        const m = /^\\([A-Za-z]+)|^\\(.?)/.exec(src.slice(i));
        i += m[0].length;
        if (m[1] === undefined) { // \% \$ \_ \{ \} \& \# → the character; \  \, \; \: → a space
          if (m[2] && '%$_{}&#'.includes(m[2])) buf += m[2];
          else if (m[2] && ' ,;:'.includes(m[2])) buf += ' ';
          else push({ raw: m[0] });
          continue;
        }
        const name = m[1];
        if (PROSE_CMDS[name] !== undefined && /^\s*\{/.test(src.slice(i))) {
          while (src[i] !== '{') i++;
          i++; push({ cmd: name, kids: group(true) }); continue;
        }
        if (PROSE_SYMS[name] !== undefined && name !== 'nbsp') {
          if (src.startsWith('{}', i)) i += 2; else while (src[i] === ' ') i++; // a control word eats the space after it
          push({ sym: name }); continue;
        }
        let raw = m[0];
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
  const TEXT_FOR = { degree: '\\textdegree', circ: '\\textdegree', times: '\\texttimes', pm: '\\textpm' };
  const mathOnlyCache = new Map();
  function mathOnly(raw) {
    const name = /^\\([A-Za-z]+)/.exec(raw)?.[1];
    if (!name || TEXT_OK.has(name) || name.startsWith('text') || !window.katex) return false;
    if (!mathOnlyCache.has(raw)) {
      let ok = false;
      try { window.katex.renderToString(raw, { throwOnError: true }); ok = true; } catch (e) { /* not maths either */ }
      mathOnlyCache.set(raw, ok);
    }
    return mathOnlyCache.get(raw);
  }
  function rawHtml(raw) {
    if (!mathOnly(raw)) return esc(raw);
    const name = /^\\([A-Za-z]+)/.exec(raw)[1];
    const tip = `Maths command: put it in $…$${TEXT_FOR[name] ? ` (or use ${TEXT_FOR[name]} in text)` : ''}`;
    return `<span class="tx-warn" title="${esc(tip)}">${esc(raw)}</span>`;
  }
  const ligatures = (h) => h.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”');
  function proseHtml(nodes) {
    return nodes.map((n) => (typeof n === 'string' ? ligatures(esc(n))
      : n.sym ? PROSE_SYMS[n.sym]
        : n.raw !== undefined ? rawHtml(n.raw)
          : n.cmd && PROSE_CMDS[n.cmd] ? `<span style='${PROSE_CMDS[n.cmd]}'>${proseHtml(n.kids)}</span>` : proseHtml(n.kids))).join('');
  }
  // nodes → source, with `escStr` deciding how plain characters are written
  function proseSource(nodes, escStr) {
    return nodes.map((n) => (typeof n === 'string' ? escStr(n)
      : n.sym ? (n.sym === 'nbsp' ? '~' : `\\${n.sym}{}`)
        : n.raw !== undefined ? n.raw
          : `${n.cmd ? '\\' + n.cmd : ''}{${proseSource(n.kids, escStr)}}`)).join('');
  }
  // Commands that work in prose (outside $…$): the ones the prose renderer knows, \text… and the usual text-mode commands.
  const textOk = (name) => PROSE_CMDS[name] !== undefined || (PROSE_SYMS[name] !== undefined && name !== 'nbsp') || TEXT_OK.has(name) || name.startsWith('text');
  TD.prose = { parse: parseProse, html: proseHtml, source: proseSource, CMDS: PROSE_CMDS, textOk };

  // TeX for one math segment
  const mathTex = (seg) => (seg.display ? `\\displaystyle ${seg.s.trim()}` : seg.s);
  TD.mathTex = mathTex;
  TD.textSegments = segments;

  function textHtml(text) {
    if (htmlCache.has(text)) return htmlCache.get(text);
    const lines = String(text).split('\n').map((line) =>
      segments(line).map((seg) => {
        if (seg.math && TD.math) return TD.math.render(mathTex(seg));
        if (seg.math) return `<i>${esc(seg.s)}</i>`;
        return proseHtml(parseProse(seg.s));
      }).join('') || '&#8203;'
    );
    const html = lines.map((l) => `<div>${l}</div>`).join('');
    htmlCache.set(text, html);
    return html;
  }
  TD.textHtml = textHtml;

  // Measure rendered size of a text block in px.
  // st: { size, font, bold, italic } (any object carrying those keys, e.g. the shape)
  function textStyle(st) {
    const px = TD.sizePx(st && st.size != null ? st.size : 'normalsize');
    const fam = fontOf(st && st.font)[2];
    return { px, css: `font-size:${r2(px)}px;font-family:${fam.replace(/"/g, "'")};${st && st.bold ? 'font-weight:bold;' : ''}${st && st.italic ? 'font-style:italic;' : ''}` };
  }
  TD.textStyle = textStyle;
  // a wrapping text is exactly its text width wide (the TikZ text width), so resizing it keeps its edges
  // where they were dropped; other text gets 2px of slack round the measured glyphs
  const boxW = (st, w) => (st && st.tw > 0 ? r2(st.tw) : Math.ceil(w) + 2);
  function textBox(text, st) {
    if (typeof st !== 'object' || st === null) st = { size: st || 'normalsize' };
    const ts = textStyle(st), px = ts.px;
    // a text box with a fixed width wraps its lines (TikZ: text width=…, align=…)
    if (st.tw > 0) ts.css += `width:${r2(st.tw)}px;white-space:pre-wrap;text-align:${st.align || 'left'};`;
    else if (st.align && st.align !== 'center') ts.css += `text-align:${st.align};`; // lines of a multi-line label
    const key = ts.css + '|' + text;
    let box = sizeCache.get(key);
    if (!box && batch) { batch.set(key, { css: ts.css, text, tw: st.tw }); box = { w: 10, h: 10 }; } // measured with the rest, then drawn again
    else if (!box) {
      const m = document.getElementById('measure');
      m.setAttribute('style', ts.css);
      m.innerHTML = textHtml(text);
      box = { w: boxW(st, m.offsetWidth), h: Math.ceil(m.offsetHeight) };
      sizeCache.set(key, box);
    }
    return { ...box, px, css: ts.css, html: textHtml(text) };
  }
  TD.textBox = textBox;

  // Measuring a text forces the page's layout, and with thousands of labels on the canvas each one costs
  // milliseconds. measureBatch(fn) runs fn noting every text it has no size for, measures them all in one
  // layout pass, then runs fn again with the real sizes.
  let batch = null;
  TD.measuring = () => !!batch; // true while sizes may still be placeholders
  TD.measureBatch = (fn) => {
    if (batch) return fn();
    batch = new Map();
    let r, miss;
    try { r = fn(); } finally { miss = batch; batch = null; }
    if (!miss.size) return r;
    const m = document.getElementById('measure'), host = m.parentNode, frag = document.createDocumentFragment(), els = [];
    for (const [key, it] of miss) {
      const d = document.createElement('div');
      d.className = m.className;
      d.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;' + it.css;
      d.innerHTML = textHtml(it.text);
      frag.appendChild(d); els.push([key, d]);
    }
    host.appendChild(frag);
    for (const [key, d] of els) sizeCache.set(key, { w: boxW(miss.get(key), d.offsetWidth), h: Math.ceil(d.offsetHeight) });
    for (const [, d] of els) d.remove();
    return fn();
  };

  // font-size:0 on the foreignObject: its line box would otherwise get the page font's strut, which
  // pushes text smaller than that font down inside its box
  function textSvg(text, st, color, cx, cy, ctx, extra = '') {
    const b = textBox(text, st);
    const x = r2(cx - b.w / 2), y = r2(cy - b.h / 2);
    const ns = ctx.export ? ' xmlns="http://www.w3.org/1999/xhtml"' : '';
    const html = ctx.export ? TD.math.forXml(b.html) : b.html;
    return `<foreignObject x="${x}" y="${y}" width="${b.w}" height="${b.h}" style="overflow:visible;font-size:0;text-align:center"${extra}><div${ns} class="tx" style="${b.css}color:${css(color)}">${html}</div></foreignObject>` +
      (ctx.export ? '' : `<rect class="hitfill" x="${x}" y="${y}" width="${b.w}" height="${b.h}"/>`);
  }

  // Escape text for TikZ node contents (outside math only).
  function tikzText(text) {
    return String(text).split('\n').map((line) =>
      segments(line).map((seg) => (seg.math ? `$${mathTex(seg)}$` : seg.s.replace(/(^|[^\\])([%&#])/g, '$1\\$2'))).join('')
    ).join(' \\\\ ');
  }

  // Label placed along a path (line / curve). P = point, u = tangent direction.
  TD.textSvg = textSvg;
  TD.segments = segments;
  function labelPlace(s, P, u) {
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
  function labelSvg(s, P, u, ctx) {
    if (!s.label) return '';
    const L = labelPlace(s, P, u);
    const bg = s.labelSide === 'on' ? `<rect x="${r2(L.x - L.b.w / 2)}" y="${r2(L.y - L.b.h / 2)}" width="${L.b.w}" height="${L.b.h}" fill="#fff"/>` : '';
    return bg + textSvg(s.label, s, s.color || '#000', L.x, L.y, ctx);
  }
  TD.labelPlace = labelPlace;
  function labelTikz(s, X) {
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
  const f = (n) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? '0' : String(v); };
  function makeX() {
    const colors = new Map();
    const X = {
      colors, libs: new Set(), pkgs: new Set(), n: 0,
      uid() { return 'td' + ++this.n; },
      // a point a named point stands at is written by its name (X.refs, set per shape by TD.tikzLines)
      c: (x, y) => { const v = `(${f(x / PX)},${f(-y / PX)})`; return (X.refs && X.refs.get(v)) || v; },
      len: (px) => f(px / PX),
      pt: (px) => `${f(px * K)}pt`,
      col(c) {
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

  function styleOpts(s, X, { fill = false, arrows = false, bends = null } = {}) {
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
        if (pat && pat.length && pat.some((n) => n > 0)) {
          const q = pat.length % 2 ? pat.concat(pat) : pat;
          o.push('dash pattern=' + q.map((n, i) => `${i % 2 ? 'off' : 'on'} ${f(n)}pt`).join(' '));
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
  function cmd(s, fillable) {
    if (s.stroke) return '\\draw';
    if (fillable && s.fill) return typeof s.fill === 'object' ? '\\path' : '\\fill';
    return null;
  }
  const opts = (o) => (o.length ? `[${o.join(', ')}]` : '');
  TD.tikzOpts = opts;
  TD.styleOpts = (s, X, o) => styleOpts(s, X, o);
  TD.fmt = f;

  // font=..., text=... options for nodes from a style source (size, font, bold, italic, color)
  function textOpts(s, X) {
    const o = [], fo = [];
    if (typeof s.size === 'number') { const p = f(s.size * K); fo.push(`\\fontsize{${p}pt}{${f(s.size * K * 1.2)}pt}\\selectfont`); }
    else if (s.size && s.size !== 'normalsize') fo.push('\\' + s.size);
    const fam = fontOf(s.font)[3];
    if (fam) fo.push(fam);
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
  function bez(s, t) {
    const m = 1 - t;
    return {
      x: m * m * m * s.x1 + 3 * m * m * t * s.cx1 + 3 * m * t * t * s.cx2 + t * t * t * s.x2,
      y: m * m * m * s.y1 + 3 * m * m * t * s.cy1 + 3 * m * t * t * s.cy2 + t * t * t * s.y2,
    };
  }
  function bezTan(s, t) {
    const m = 1 - t;
    return norm({
      x: 3 * m * m * (s.cx1 - s.x1) + 6 * m * t * (s.cx2 - s.cx1) + 3 * t * t * (s.x2 - s.cx2),
      y: 3 * m * m * (s.cy1 - s.y1) + 6 * m * t * (s.cy2 - s.cy1) + 3 * t * t * (s.y2 - s.cy2),
    }, norm({ x: s.x2 - s.x1, y: s.y2 - s.y1 }));
  }

  // Rect-like resize used by rect & ellipse (operates on a box {x,y,w,h}).
  const BOX_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function boxHandles(b) {
    const xs = { w: b.x, c: b.x + b.w / 2, e: b.x + b.w };
    const ys = { n: b.y, c: b.y + b.h / 2, s: b.y + b.h };
    return BOX_HANDLES.map((k) => ({
      k, x: xs[k.includes('w') ? 'w' : k.includes('e') ? 'e' : 'c'], y: ys[k.includes('n') ? 'n' : k.includes('s') ? 's' : 'c'],
    }));
  }
  function boxResize(o, k, q, e) {
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
  function dragBox(a, q, e) {
    let w = q.x - a.x, h = q.y - a.y;
    if (e && e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = m * Math.sign(w || 1); h = m * Math.sign(h || 1); }
    return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) };
  }

  TD.box = { handles: (b) => boxHandles(b), resize: (o, k, q, e) => boxResize(o, k, q, e), drag: (a, q, e) => dragBox(a, q, e) };
  const bboxOf = (pts, pad = 0) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
  };
  TD.bboxOf = bboxOf;

  const lineStyle = (d) => ({ stroke: d.stroke || '#000000', width: d.width, dash: d.dash, opacity: 1 });
  const labelDefaults = (d) => ({ label: '', labelPos: 0.5, labelSide: 'left', size: d.size || 'normalsize', font: d.font || 'default', bold: false, italic: false, color: d.color || '#000000' });

  // ---------- types ----------
  const T = (TD.TYPES = {});

  T.line = {
    name: 'Line',
    pts: [['x1', 'y1'], ['x2', 'y2']],
    create: (p, d, tool) => ({
      type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...lineStyle(d),
      startTip: 'none', endTip: tool === 'arrow' ? 'stealth' : 'none', ...TD.LINE_EXTRA, ...labelDefaults(d),
    }),
    drag(s, a, q, e) { const b = e.shiftKey ? constrain(a, q) : q; s.x2 = b.x; s.y2 = b.y; },
    valid: (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2,
    handles: (s) => [{ k: 'p1', x: s.x1, y: s.y1 }, { k: 'p2', x: s.x2, y: s.y2 }],
    setHandle(s, k, q, e) {
      if (k === 'p1') { const b = e.shiftKey ? constrain({ x: s.x2, y: s.y2 }, q) : q; s.x1 = b.x; s.y1 = b.y; }
      else { const b = e.shiftKey ? constrain({ x: s.x1, y: s.y1 }, q) : q; s.x2 = b.x; s.y2 = b.y; }
    },
    anchors: (s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }],
    samples: (s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }],
    labelAt(s) {
      const t = s.labelPos ?? 0.5;
      return { P: { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t }, u: norm({ x: s.x2 - s.x1, y: s.y2 - s.y1 }) };
    },
    svg(s, ctx) {
      const A = { x: s.x1, y: s.y1 }, B = { x: s.x2, y: s.y2 };
      const u = norm(sub(B, A));
      const col = css(s.stroke || '#000');
      const te = tip(s.endTip, B, u, s.width, col), ts = tip(s.startTip, A, { x: -u.x, y: -u.y }, s.width, col);
      const A2 = { x: A.x + u.x * ts.back, y: A.y + u.y * ts.back }, B2 = { x: B.x - u.x * te.back, y: B.y - u.y * te.back };
      const H = hopsFor(s, [A2, B2], ctx.scene);
      const d = H ? hopPaths([A2, B2], H).d : `M${pt(A2)}L${pt(B2)}`;
      const L = this.labelAt(s);
      return wrap(s, strokeSvg(s, d, `M${pt(A)}L${pt(B)}`) + ts.svg + te.svg) + hit(`M${pt(A)}L${pt(B)}`, ctx) + labelSvg(s, L.P, L.u, ctx);
    },
    tikz(s, X) {
      if (!s.stroke) return '';
      const H = hopsFor(s, [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], X.scene);
      if (H) {
        const hp = hopPaths([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], H, X);
        return `\\draw${opts(styleOpts(s, X, { arrows: true }))} ${hp.tz};` + (s.label ? `\n\\path ${X.c(s.x1, s.y1)} --${labelTikz(s, X)} ${X.c(s.x2, s.y2)};` : '');
      }
      return `\\draw${opts(styleOpts(s, X, { arrows: true }))} ${X.c(s.x1, s.y1)} --${labelTikz(s, X)} ${X.c(s.x2, s.y2)};`;
    },
  };

  T.curve = {
    name: 'Curve',
    pts: [['x1', 'y1'], ['cx1', 'cy1'], ['cx2', 'cy2'], ['x2', 'y2']],
    create: (p, d, tool) => ({
      type: 'curve', x1: p.x, y1: p.y, cx1: p.x, cy1: p.y, cx2: p.x, cy2: p.y, x2: p.x, y2: p.y,
      ...lineStyle(d), startTip: 'none', endTip: tool === 'curvearrow' ? 'stealth' : 'none', ...TD.LINE_EXTRA, ...labelDefaults(d),
    }),
    drag(s, a, q) {
      s.x2 = q.x; s.y2 = q.y;
      const dx = q.x - a.x, dy = q.y - a.y, k = 0.35;
      s.cx1 = a.x + dx / 3 + dy * k; s.cy1 = a.y + dy / 3 - dx * k;
      s.cx2 = a.x + (2 * dx) / 3 + dy * k; s.cy2 = a.y + (2 * dy) / 3 - dx * k;
    },
    valid: (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2,
    handles: (s) => [
      { k: 'p1', x: s.x1, y: s.y1 }, { k: 'c1', x: s.cx1, y: s.cy1, ctrl: true },
      { k: 'c2', x: s.cx2, y: s.cy2, ctrl: true }, { k: 'p2', x: s.x2, y: s.y2 },
    ],
    guides: (s) => [[s.x1, s.y1, s.cx1, s.cy1], [s.x2, s.y2, s.cx2, s.cy2]],
    setHandle(s, k, q) {
      const m = { p1: ['x1', 'y1'], c1: ['cx1', 'cy1'], c2: ['cx2', 'cy2'], p2: ['x2', 'y2'] }[k];
      // moving an endpoint drags its control point along
      if (k === 'p1') { s.cx1 += q.x - s.x1; s.cy1 += q.y - s.y1; }
      if (k === 'p2') { s.cx2 += q.x - s.x2; s.cy2 += q.y - s.y2; }
      s[m[0]] = q.x; s[m[1]] = q.y;
    },
    anchors: (s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }],
    samples(s) { const a = []; for (let i = 0; i <= 24; i++) a.push(bez(s, i / 24)); return a; },
    labelAt: (s) => ({ P: bez(s, s.labelPos ?? 0.5), u: bezTan(s, s.labelPos ?? 0.5) }),
    svg(s, ctx) {
      const col = css(s.stroke || '#000');
      const P0 = { x: s.x1, y: s.y1 }, P1 = { x: s.x2, y: s.y2 };
      const ue = norm(sub(P1, { x: s.cx2, y: s.cy2 }), norm(sub(P1, P0)));
      const us = norm(sub(P0, { x: s.cx1, y: s.cy1 }), norm(sub(P0, P1)));
      const te = tip(s.endTip, P1, ue, s.width, col), ts = tip(s.startTip, P0, us, s.width, col);
      const c = { ...s };
      c.x1 -= us.x * ts.back; c.y1 -= us.y * ts.back; c.cx1 -= us.x * ts.back; c.cy1 -= us.y * ts.back;
      c.x2 -= ue.x * te.back; c.y2 -= ue.y * te.back; c.cx2 -= ue.x * te.back; c.cy2 -= ue.y * te.back;
      const dOf = (q) => `M${r2(q.x1)},${r2(q.y1)}C${r2(q.cx1)},${r2(q.cy1)} ${r2(q.cx2)},${r2(q.cy2)} ${r2(q.x2)},${r2(q.y2)}`;
      const L = this.labelAt(s);
      return wrap(s, strokeSvg(s, dOf(c), dOf(s)) + ts.svg + te.svg) + hit(dOf(s), ctx) + labelSvg(s, L.P, L.u, ctx);
    },
    tikz(s, X) {
      if (!s.stroke) return '';
      return `\\draw${opts(styleOpts(s, X, { arrows: true }))} ${X.c(s.x1, s.y1)} .. controls ${X.c(s.cx1, s.cy1)} and ${X.c(s.cx2, s.cy2)} ..${labelTikz(s, X)} ${X.c(s.x2, s.y2)};`;
    },
  };

  // Catmull-Rom spline through points → cubic segments [c1, c2, end]
  function smoothSegs(P, closed) {
    const n = P.length, out = [];
    const g = (i) => (closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    const m = closed ? n : n - 1, k = 1 / 6;
    for (let i = 0; i < m; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      out.push([{ x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k }, { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k }, p2]);
    }
    return out;
  }
  TD.smoothSegs = smoothSegs;

  // Bends of a polyline (where "bend" arrow tips go): the inner vertices, or every vertex but the first when closed.
  function polyPathD(P, s, upto) {
    const A = P.slice(0, upto + 1);
    if (!(s.smooth && P.length > 2)) return A.map((p, i) => (i ? 'L' : 'M') + pt(p)).join('');
    const segs = smoothSegs(P, s.closed).slice(0, upto);
    return 'M' + pt(P[0]) + segs.map(([a, b, c]) => `C${pt(a)} ${pt(b)} ${pt(c)}`).join('');
  }
  function polyBends(s, P) {
    if (!s.bpTip || s.bpTip === 'none' || P.length < 2) return null;
    const out = [], last = s.closed ? P.length - 1 : P.length - 2;
    for (let i = 1; i <= last; i++) {
      let u;
      if (s.smooth && P.length > 2) { const seg = smoothSegs(P, s.closed)[i - 1]; u = norm(sub(P[i], seg[1]), norm(sub(P[i], P[i - 1]))); }
      else u = norm(sub(P[i], P[i - 1]));
      out.push({ P: P[i], u });
    }
    return out;
  }
  function polyBendFractions(s) {
    if (!s.bpTip || s.bpTip === 'none') return null;
    const P = s.pts.map((p) => ({ x: p[0], y: p[1] }));
    const n = P.length, total = measurePath(polyPathD(s.closed ? [...P, P[0]] : P, { ...s, closed: false }, s.closed ? n : n - 1)).len;
    if (!(total > 0)) return null;
    const out = [], last = s.closed ? n - 1 : n - 2;
    for (let i = 1; i <= last; i++) out.push(measurePath(polyPathD(s.closed ? [...P, P[0]] : P, { ...s, closed: false }, i)).len / total);
    return out;
  }

  T.poly = {
    name: 'Polyline',
    create: (p, d) => ({ type: 'poly', pts: [[p.x, p.y], [p.x, p.y]], closed: false, ...lineStyle(d), fill: d.fill || null, startTip: 'none', endTip: 'none', ...TD.LINE_EXTRA, bpTip: 'none' }),
    valid: (s) => s.pts.length >= 2,
    handles: (s) => s.pts.map((p, i) => ({ k: 'v' + i, x: p[0], y: p[1] })),
    setHandle(s, k, q) { const i = +k.slice(1); s.pts[i] = [q.x, q.y]; },
    translate(s, dx, dy) { s.pts = s.pts.map((p) => [p[0] + dx, p[1] + dy]); },
    anchors: (s) => s.pts.map((p) => ({ x: p[0], y: p[1] })),
    samples: (s) => s.pts.map((p) => ({ x: p[0], y: p[1] })),
    svg(s, ctx) {
      const P = s.pts.map((p) => ({ x: p[0], y: p[1] }));
      const col = css(s.stroke || '#000');
      let tips = '';
      const Q = P.map((p) => ({ ...p }));
      if (!s.closed && P.length >= 2) {
        const n = P.length;
        const ue = norm(sub(P[n - 1], P[n - 2])), us = norm(sub(P[0], P[1]));
        const te = tip(s.endTip, P[n - 1], ue, s.width, col), ts = tip(s.startTip, P[0], us, s.width, col);
        Q[n - 1] = { x: P[n - 1].x - ue.x * te.back, y: P[n - 1].y - ue.y * te.back };
        Q[0] = { x: P[0].x - us.x * ts.back, y: P[0].y - us.y * ts.back };
        tips = ts.svg + te.svg;
      }
      const dOf = (A) => (s.smooth && A.length > 2
        ? 'M' + pt(A[0]) + smoothSegs(A, s.closed).map(([a, b, c]) => `C${pt(a)} ${pt(b)} ${pt(c)}`).join('')
        : A.map((p, i) => (i ? 'L' : 'M') + pt(p)).join('')) + (s.closed ? 'Z' : '');
      const fillHit = s.closed && s.fill;
      const H = !s.smooth && hopsFor(s, s.closed ? [...Q, Q[0]] : Q, ctx.scene);
      const dQ = H ? hopPaths(s.closed ? [...Q, Q[0]] : Q, H).d + (s.closed ? 'Z' : '') : dOf(Q);
      return wrap(s, strokeSvg(s, dQ, dOf(P), polyBends(s, P), s.closed) + tips) + hit(dOf(P), ctx) +
        (fillHit && !ctx.export ? `<path class="hitfill" d="${dOf(P)}"/>` : '');
    },
    tikz(s, X) {
      const c = cmd(s, s.closed);
      if (!c) return '';
      let path;
      if (s.smooth && s.pts.length > 2) {
        const P = s.pts.map((p) => ({ x: p[0], y: p[1] }));
        path = X.c(P[0].x, P[0].y) + smoothSegs(P, s.closed).map(([a, b, e]) => ` .. controls ${X.c(a.x, a.y)} and ${X.c(b.x, b.y)} .. ${X.c(e.x, e.y)}`).join('') + (s.closed ? ' -- cycle' : '');
      } else {
        const P = s.pts.map((p) => ({ x: p[0], y: p[1] }));
        const H = hopsFor(s, s.closed ? [...P, P[0]] : P, X.scene);
        path = H ? hopPaths(s.closed ? [...P, P[0]] : P, H, X).tz + (s.closed ? ' -- cycle' : '')
          : s.pts.map((p) => X.c(p[0], p[1])).join(' -- ') + (s.closed ? ' -- cycle' : '');
      }
      return `${c}${opts(styleOpts(s, X, { fill: s.closed, arrows: !s.closed, bends: polyBendFractions(s) }))} ${path};`;
    },
  };

  // Compound filled path made by Combine (unite / intersect / subtract / exclude / divide).
  // rings: closed polygons; holes come from the even-odd rule.
  const ringBox = (s) => bboxOf(s.rings.flat().map((p) => ({ x: p[0], y: p[1] })), 0);
  const ringsD = (s) => s.rings.map((r) => r.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ',' + r2(p[1])).join('') + 'Z').join('');
  T.region = {
    name: 'Region',
    valid: (s) => s.rings && s.rings.length > 0,
    handles: (s) => boxHandles(ringBox(s)),
    setHandle(s, k, q, e, o) {
      const a = ringBox(o), b = boxResize(a, k, q, e);
      const sx = a.w ? b.w / a.w : 1, sy = a.h ? b.h / a.h : 1;
      s.rings = o.rings.map((r) => r.map(([x, y]) => [b.x + (x - a.x) * sx, b.y + (y - a.y) * sy]));
    },
    translate(s, dx, dy) { s.rings = s.rings.map((r) => r.map((p) => [p[0] + dx, p[1] + dy])); },
    anchors: (s) => { const b = ringBox(s); return boxHandles(b).map((h) => ({ x: h.x, y: h.y })).concat([{ x: b.x + b.w / 2, y: b.y + b.h / 2 }]); },
    samples: (s) => s.rings.flat().map((p) => ({ x: p[0], y: p[1] })),
    svg(s, ctx) {
      const d = ringsD(s);
      return wrap(s, `<path d="${d}" fill-rule="evenodd" stroke-linejoin="round" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" fill-rule="evenodd" d="${d}"/>` : '');
    },
    tikz(s, X) {
      const c = cmd(s, true);
      if (!c) return '';
      const o = styleOpts(s, X, { fill: true });
      if (s.rings.length > 1) o.push('even odd rule');
      o.push('line join=round');
      const path = s.rings.map((r) => r.map((p) => X.c(p[0], p[1])).join(' -- ') + ' -- cycle').join(' ');
      return `${c}${opts(o)} ${path};`;
    },
  };

  T.rect = {
    name: 'Rectangle',
    pts: [['x', 'y']],
    create: (p, d) => ({ type: 'rect', x: p.x, y: p.y, w: 0, h: 0, radius: 0, ...lineStyle(d), fill: d.fill || null }),
    drag(s, a, q, e) { Object.assign(s, dragBox(a, q, e)); },
    valid: (s) => s.w > 2 && s.h > 2,
    handles: (s) => boxHandles(s),
    setHandle(s, k, q, e, o) { Object.assign(s, boxResize(o, k, q, e)); },
    anchors: (s) => boxHandles(s).map((h) => ({ x: h.x, y: h.y })).concat([{ x: s.x + s.w / 2, y: s.y + s.h / 2 }]),
    samples: (s) => [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }],
    svg(s, ctx) {
      const d = `M${r2(s.x)},${r2(s.y)}h${r2(s.w)}v${r2(s.h)}h${r2(-s.w)}Z`;
      return wrap(s, `<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" rx="${s.radius || 0}" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" d="${d}"/>` : '');
    },
    tikz(s, X) {
      const c = cmd(s, true);
      if (!c) return '';
      const o = styleOpts(s, X, { fill: true });
      if (s.radius) o.push(`rounded corners=${X.pt(s.radius)}`);
      return `${c}${opts(o)} ${X.c(s.x, s.y + s.h)} rectangle ${X.c(s.x + s.w, s.y)};`;
    },
  };

  const ellBox = (s) => ({ x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry });
  const fromBox = (b) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 });
  T.ellipse = {
    name: 'Ellipse',
    pts: [['cx', 'cy']],
    create: (p, d) => ({ type: 'ellipse', cx: p.x, cy: p.y, rx: 0, ry: 0, ...lineStyle(d), fill: d.fill || null }),
    drag(s, a, q, e) { Object.assign(s, fromBox(dragBox(a, q, e))); },
    valid: (s) => s.rx > 1 && s.ry > 1,
    handles: (s) => boxHandles(ellBox(s)),
    setHandle(s, k, q, e, o) { Object.assign(s, fromBox(boxResize(ellBox(o), k, q, e))); },
    anchors: (s) => [{ x: s.cx, y: s.cy }, { x: s.cx + s.rx, y: s.cy }, { x: s.cx - s.rx, y: s.cy }, { x: s.cx, y: s.cy + s.ry }, { x: s.cx, y: s.cy - s.ry }],
    samples: (s) => [{ x: s.cx - s.rx, y: s.cy - s.ry }, { x: s.cx + s.rx, y: s.cy + s.ry }],
    svg(s, ctx) {
      const d = `M${r2(s.cx - s.rx)},${r2(s.cy)}a${r2(s.rx)},${r2(s.ry)} 0 1,0 ${r2(2 * s.rx)},0a${r2(s.rx)},${r2(s.ry)} 0 1,0 ${r2(-2 * s.rx)},0`;
      return wrap(s, `<ellipse cx="${r2(s.cx)}" cy="${r2(s.cy)}" rx="${r2(s.rx)}" ry="${r2(s.ry)}" ${strokeAttrs(s, true)}/>`) +
        hit(d, ctx) + (s.fill && !ctx.export ? `<path class="hitfill" d="${d}"/>` : '');
    },
    tikz(s, X) {
      const c = cmd(s, true);
      if (!c) return '';
      const shape = Math.abs(s.rx - s.ry) < 0.01 ? `circle (${X.len(s.rx)})` : `ellipse (${X.len(s.rx)} and ${X.len(s.ry)})`;
      return `${c}${opts(styleOpts(s, X, { fill: true }))} ${X.c(s.cx, s.cy)} ${shape};`;
    },
  };

  function shade(hex, k) { // k<1 darker
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
    return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
  }
  T.ball = {
    name: 'Ball',
    pts: [['cx', 'cy']],
    create: (p, d) => ({ type: 'ball', cx: p.x, cy: p.y, r: 0, ballColor: d.ballColor || '#a05a5a', opacity: 1 }),
    drag(s, a, q) { s.r = dist(a, q); },
    fix(s) { if (s.r < 3) s.r = 20; },
    valid: () => true,
    handles: (s) => [{ k: 'r', x: s.cx + s.r, y: s.cy }],
    setHandle(s, k, q) { s.r = Math.max(2, dist({ x: s.cx, y: s.cy }, q)); },
    anchors: (s) => [{ x: s.cx, y: s.cy }, { x: s.cx + s.r, y: s.cy }, { x: s.cx - s.r, y: s.cy }, { x: s.cx, y: s.cy + s.r }, { x: s.cx, y: s.cy - s.r }],
    samples: (s) => [{ x: s.cx - s.r, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy + s.r }],
    svg(s, ctx) {
      const id = 'bg-' + s.id + (ctx.export ? '-x' : '');
      const c = TD.parseColor(s.ballColor).hex;
      return wrap(s, `<defs><radialGradient id="${id}" cx="0.42" cy="0.38" r="0.7" fx="0.3" fy="0.25">` +
        `<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.35)}"/></radialGradient></defs>` +
        `<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" fill="url(#${id})"/>`) +
        (ctx.export ? '' : `<circle class="hitfill" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/>`);
    },
    tikz(s, X) {
      const o = [`ball color=${X.col(s.ballColor)}`];
      const op = (s.opacity ?? 1) * TD.parseColor(s.ballColor).a;
      if (op < 1) o.push(`opacity=${f(op)}`);
      return `\\shade[${o.join(', ')}] ${X.c(s.cx, s.cy)} circle (${X.len(s.r)});`;
    },
  };

  T.dot = {
    name: 'Dot',
    pts: [['cx', 'cy']],
    create: (p, d) => ({ type: 'dot', cx: p.x, cy: p.y, r: 3, color: d.color || '#000000', opacity: 1 }),
    drag(s, a, q) { s.cx = q.x; s.cy = q.y; },
    valid: () => true,
    handles: () => [],
    anchors: (s) => [{ x: s.cx, y: s.cy }],
    samples: (s) => [{ x: s.cx - s.r, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy + s.r }],
    svg(s, ctx) {
      return wrap(s, `<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" fill="${css(s.color)}"/>`) +
        (ctx.export ? '' : `<circle class="hitfill" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/><circle class="hit" cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}"/>`);
    },
    tikz(s, X) {
      const o = X.col(s.color) !== 'black' ? [X.col(s.color)] : [];
      const op = (s.opacity ?? 1) * TD.parseColor(s.color).a;
      if (op < 1) o.push(`opacity=${f(op)}`);
      return `\\fill${opts(o)} ${X.c(s.cx, s.cy)} circle (${X.len(s.r)});`;
    },
  };

  // Arc: angles in degrees, TikZ convention (counter-clockwise, y up). a2 in (a1, a1+360].
  const rad = (d) => (d * Math.PI) / 180;
  const arcPt = (s, a) => ({ x: s.cx + s.r * Math.cos(rad(a)), y: s.cy - s.r * Math.sin(rad(a)) });
  const angOf = (c, q) => (Math.atan2(-(q.y - c.y), q.x - c.x) * 180) / Math.PI;
  const normA2 = (s) => { let d = (((s.a2 - s.a1) % 360) + 360) % 360; if (d < 0.5) d = 360; s.a2 = s.a1 + d; };
  T.arc = {
    name: 'Arc',
    pts: [['cx', 'cy']],
    create: (p, d) => ({ type: 'arc', cx: p.x, cy: p.y, r: 0, a1: 0, a2: 90, ...lineStyle(d), startTip: 'none', endTip: 'none', ...TD.LINE_EXTRA }),
    drag(s, a, q, e) {
      s.r = dist(a, q);
      let ang = angOf(a, q);
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      s.a1 = Math.round(ang * 10) / 10; s.a2 = s.a1 + 90;
    },
    valid: (s) => s.r > 2,
    handles: (s) => [{ k: 'a1', ...arcPt(s, s.a1) }, { k: 'a2', ...arcPt(s, s.a2) }, { k: 'c', x: s.cx, y: s.cy, ctrl: true }],
    setHandle(s, k, q, e) {
      if (k === 'c') { s.cx = q.x; s.cy = q.y; return; }
      let ang = angOf({ x: s.cx, y: s.cy }, q);
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      ang = Math.round(ang * 10) / 10;
      if (k === 'a1') { const span = s.a2 - s.a1; s.r = Math.max(2, dist({ x: s.cx, y: s.cy }, q)); s.a1 = ang; s.a2 = ang + span; }
      else { s.a2 = ang; normA2(s); }
    },
    anchors: (s) => [{ x: s.cx, y: s.cy }, arcPt(s, s.a1), arcPt(s, s.a2)],
    samples(s) { const a = []; for (let i = 0; i <= 32; i++) a.push(arcPt(s, s.a1 + ((s.a2 - s.a1) * i) / 32)); return a; },
    svg(s, ctx) {
      const col = css(s.stroke || '#000');
      const S = arcPt(s, s.a1), E = arcPt(s, s.a2);
      const ue = { x: -Math.sin(rad(s.a2)), y: -Math.cos(rad(s.a2)) };
      const us = { x: Math.sin(rad(s.a1)), y: Math.cos(rad(s.a1)) };
      const te = tip(s.endTip, E, ue, s.width, col), ts = tip(s.startTip, S, us, s.width, col);
      const dOf = (b1, b2) => {
        const r = Math.max(s.r, 0.01);
        const a1 = s.a1 + ((b1 / r) * 180) / Math.PI, a2 = s.a2 - ((b2 / r) * 180) / Math.PI;
        const sw = a2 - a1;
        if (sw <= 0) return '';
        if (sw >= 359.9) { // full circle: two halves
          const m = arcPt(s, a1 + 180);
          return `M${pt(arcPt(s, a1))}A${r2(r)},${r2(r)} 0 0,0 ${pt(m)}A${r2(r)},${r2(r)} 0 0,0 ${pt(arcPt(s, a1 + 359.99))}`;
        }
        return `M${pt(arcPt(s, a1))}A${r2(r)},${r2(r)} 0 ${sw > 180 ? 1 : 0},0 ${pt(arcPt(s, a2))}`;
      };
      return wrap(s, strokeSvg(s, dOf(ts.back, te.back), dOf(0, 0)) + ts.svg + te.svg) + hit(dOf(0, 0), ctx);
    },
    tikz(s, X) {
      if (!s.stroke) return '';
      const S = arcPt(s, s.a1);
      return `\\draw${opts(styleOpts(s, X, { arrows: true }))} ${X.c(S.x, S.y)} arc[start angle=${f(s.a1)}, end angle=${f(s.a2)}, radius=${X.len(s.r)}];`;
    },
  };

  // Spring (zigzag between two points). Matches TikZ decorations.pathmorphing zigzag.
  function springGeom(s) {
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
    create: (p, d) => ({ type: 'spring', x1: p.x, y1: p.y, x2: p.x, y2: p.y, pitch: 12, amplitude: 6, ...lineStyle(d), dash: 'solid' }),
    drag: T.line.drag,
    valid: T.line.valid,
    handles: T.line.handles,
    setHandle: T.line.setHandle,
    anchors: T.line.anchors,
    samples(s) {
      const g = springGeom(s);
      const off = (k) => ({ x: g.n.x * s.amplitude * k, y: g.n.y * s.amplitude * k });
      return [g.A, g.B].flatMap((p) => [{ x: p.x + off(1).x, y: p.y + off(1).y }, { x: p.x - off(1).x, y: p.y - off(1).y }]);
    },
    svg(s, ctx) {
      const g = springGeom(s);
      const at = (d, k) => ({ x: g.A.x + g.u.x * d + g.n.x * s.amplitude * k, y: g.A.y + g.u.y * d + g.n.y * s.amplitude * k });
      const P = [g.A, at(g.pre, 0)];
      for (let i = 0; i < g.coils; i++) {
        const b = g.pre + i * g.seg;
        P.push(at(b + 0.25 * g.seg, 1), at(b + 0.75 * g.seg, -1));
      }
      P.push(at(g.L - g.pre, 0), g.B);
      const d = P.map((p, i) => (i ? 'L' : 'M') + pt(p)).join('');
      return wrap(s, `<path d="${d}" ${strokeAttrs(s)} stroke-linejoin="round"/>`) + hit(d, ctx);
    },
    tikz(s, X) {
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
  const textPad = (s) => TD.sizePx(s.size ?? 'normalsize') / 3;
  // A paragraph box (Photoshop-style area text) is a text shape with both a frame width `tw` and a
  // frame height `th`: (x, y) is the frame centre, lines wrap at the frame width and start at its top.
  // Text that does not fit runs on below the frame rather than being hidden, so nothing is lost on export.
  // With only `tw` set, the text wraps but its height follows the content (the older wrap-width mode).
  const isPara = (s) => s.tw > 0 && s.th > 0;
  TD.isParaText = isPara;
  const paraFrame = (s) => ({ x: s.x - s.tw / 2, y: s.y - s.th / 2, w: s.tw, h: s.th });
  function paraLayout(s) {
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
  const textH = (s) => textBox(s.text || ' ', s).h + (s.boxed ? 2 * textPad(s) : 0);
  TD.textHold = function (s, fn) {
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
    create: (p, d) => ({ type: 'text', x: p.x, y: p.y, text: '', tw: 0, valign: d.valign || 'top', size: d.size || 'normalsize', font: d.font || 'default', bold: false, italic: false, color: d.color || '#000000', opacity: 1 }),
    valid: (s) => s.text.trim().length > 0,
    // paragraph box: eight frame handles; point text: an edge handle that sets a wrapping width, on the right
    // edge, or on the left one for right-aligned text (whose right edge holds still)
    handles(s) {
      if (isPara(s)) return boxHandles(paraFrame(s));
      const b = textBox(s.text || ' ', s); return [{ k: 'tw', x: s.align === 'right' ? s.x - b.w / 2 : s.x + b.w / 2, y: s.y }];
    },
    setHandle(s, k, q, e, o) {
      if (isPara(o) && k !== 'tw') {
        const MIN = 16, f = paraFrame(o), nb = boxResize(f, k, q, e);
        // never collapse past the minimum: hold the edge opposite the dragged one
        if (nb.w < MIN) { nb.w = MIN; if (k.includes('w')) nb.x = f.x + f.w - MIN; else if (k.includes('e')) nb.x = f.x; }
        if (nb.h < MIN) { nb.h = MIN; if (k.includes('n')) nb.y = f.y + f.h - MIN; else if (k.includes('s')) nb.y = f.y; }
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
    anchors(s) {
      const al = s.align || (s.tw > 0 ? 'left' : 'center'), va = s.valign || (isPara(s) ? 'top' : 'middle');
      let b;
      if (isPara(s)) b = paraFrame(s);
      else { const t = textBox(s.text || ' ', s), p = s.boxed ? textPad(s) : 0; b = { x: s.x - t.w / 2 - p, y: s.y - t.h / 2 - p, w: t.w + 2 * p, h: t.h + 2 * p }; }
      const a = { x: al === 'left' ? b.x : al === 'right' ? b.x + b.w : b.x + b.w / 2, y: va === 'top' ? b.y : va === 'bottom' ? b.y + b.h : b.y + b.h / 2 };
      const rest = isPara(s) ? boxHandles(b).map((h) => ({ x: h.x, y: h.y })).concat([{ x: s.x, y: s.y }]) : [{ x: s.x, y: s.y }];
      return [a, ...rest.filter((r) => Math.abs(r.x - a.x) > 1e-6 || Math.abs(r.y - a.y) > 1e-6)];
    },
    samples(s) {
      if (isPara(s)) { const L = paraLayout(s); return [{ x: L.f.x, y: L.f.y }, { x: L.f.x + L.f.w, y: L.bottom }]; }
      const b = textBox(s.text || ' ', s), p = s.boxed ? textPad(s) : 0;
      return [{ x: s.x - b.w / 2 - p, y: s.y - b.h / 2 - p }, { x: s.x + b.w / 2 + p, y: s.y + b.h / 2 + p }];
    },
    svg(s, ctx) {
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
    tikz(s, X) {
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
  TD.PAGE_DEFAULT = { paper: 'a4', orient: 'portrait', w: 21, h: 29.7, mt: 2.5, mb: 2.5, ml: 2.5, mr: 2.5, font: 11, title: true, spread: 1, numbered: false };
  // Resolved page size in cm: {W, H, textW, textH}
  TD.pageSize = function (pg) {
    pg = { ...TD.PAGE_DEFAULT, ...(pg || {}) };
    const P = TD.PAPERS[pg.paper] || TD.PAPERS.a4;
    let W = P.w ?? pg.w, H = P.h ?? pg.h;
    if (pg.orient === 'landscape') [W, H] = [Math.max(W, H), Math.min(W, H)];
    return { ...pg, W, H, textW: W - pg.ml - pg.mr, textH: H - pg.mt - pg.mb };
  };

  // ---------- generic operations ----------
  TD.translate = function (s, dx, dy) {
    const t = T[s.type];
    if (t.translate) return t.translate(s, dx, dy);
    for (const [kx, ky] of t.pts) { s[kx] += dx; s[ky] += dy; }
  };
  TD.bbox = function (s) {
    const t = T[s.type];
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
  TD.preambleCompat = (X) => {
    const qk = X.libs.has('quantikz2'), zx = X.pkgs.has('zx-calculus');
    return { before: qk && (zx || X.pkgs.has('tikz-cd')) ? QK_CD : [], after: qk && zx ? QK_ZX : [] };
  };
  TD.preamble = function (X) {
    const pre = ['\\usepackage{tikz}'];
    const libs = [...X.libs], compat = TD.preambleCompat(X);
    pre.push(...compat.before);
    if (libs.length) pre.push(`\\usetikzlibrary{${libs.join(', ')}}`);
    if (X.pkgs.has('pgfplots')) pre.push('\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}');
    // forest with its libraries: 'forest', 'forest[edges]' … become one \usepackage[edges]{forest}
    const forest = [...X.pkgs].filter((p) => /^forest\b/.test(p));
    for (const p of X.pkgs) if (p !== 'pgfplots' && p !== 'xy:color' && !/^forest\b/.test(p) && !p.startsWith('svgcolor:')) pre.push(p === 'tikz-feynman' ? '\\usepackage[compat=1.1.0]{tikz-feynman}' : p === 'xy' ? `\\usepackage[all${X.pkgs.has('xy:color') ? ',color' : ''}]{xy}` : `\\usepackage{${p}}`);
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
    create: (p) => ({ type: 'coord', x: p.x, y: p.y, tikzName: 'A' }),
    valid: (s) => !!String(s.tikzName || '').trim(),
    handles: () => [],
    anchors: (s) => [{ x: s.x, y: s.y }],
    samples: (s) => [{ x: s.x, y: s.y }],
    svg(s, ctx) {
      if (ctx && ctx.export) return '';
      const x = r2(s.x), y = r2(s.y);
      return `<g class="tkcoord" transform="translate(${x} ${y})"><path class="tkcoord-mark" d="M-1 0H1M0 -1V1"/>`
        + `<text class="tkcoord-tag" x="0" y="0">${esc(s.tikzName || '')}</text><circle class="hitfill" r="1"/></g>`;
    },
    translate(s, dx, dy) { s.x += dx; s.y += dy; },
    tikz(s, X) {
      const nm = String(s.tikzName || '').trim();
      return nm ? `\\coordinate (${nm}) at ${X.c(s.x, s.y)};` : '';
    },
  };

  // ---------- source write-back ----------
  // Imported shapes carry s.tex (tikzimport.js importPicture): the statement they came from and a signature of
  // the shape as imported. While a statement's shapes are all there, in order and unchanged, it exports as it was
  // written (comments and formatting included); a picture with nothing changed exports exactly as written.
  const SIG_SKIP = new Set(['id', 'tex', 'name', 'gname', 'g', 'locked', 'hidden', 'ex']);
  // round: numbers to 1e-4 px (the signature a move and a move back do not change)
  const stable = (v, R) => (Array.isArray(v) ? `[${v.map((q) => stable(q, R)).join(',')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k], R)).join(',')}}`
    : R && typeof v === 'number' ? JSON.stringify(Math.round(v * 1e4) / 1e4 || 0) : JSON.stringify(v));
  TD.texSig = function (s, round) {
    const c = {};
    for (const k of Object.keys(s)) if (!SIG_SKIP.has(k) && k[0] !== '_') c[k] = s[k];
    const str = stable(c, !!round);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36) + '.' + str.length.toString(36);
  };
  const unchanged = (s) => !!(s.tex && s.tex.sig && s.tex.sig === TD.texSig(s));
  // what code written as-is needs: the packages and libraries the shapes would ask for
  function needs(list, X) {
    const Y = makeX(); Y.scene = X.scene || list;
    for (const s of list) { try { T[s.type].tikz(s, Y); } catch (e) { /* only the libraries matter here */ } }
    if (list.some((s) => s.pos)) Y.libs.add('positioning');
    for (const l of Y.libs) X.libs.add(l);
    for (const p of Y.pkgs) X.pkgs.add(p);
  }
  function shapeCode(s, X) {
    // a translucent shape fades as one group (as on the canvas): fill and stroke separately would darken where they overlap
    if (!(s.opacity != null && s.opacity < 1 && GROUPED.has(s.type))) return T[s.type].tikz(s, X);
    X.groupOpacity = true;
    let code;
    try { code = T[s.type].tikz(s, X); } finally { X.groupOpacity = false; }
    return code ? `\\begin{scope}[transparency group, opacity=${f(s.opacity)}]\n  ${code.replace(/\n/g, '\n  ')}\n\\end{scope}` : code;
  }
  const GROUPED = new Set(['line', 'curve', 'poly', 'region', 'rect', 'ellipse', 'arc', 'spring']);
  // ---------- structure kept from the source (tikzimport.js) ----------
  // the TikZ names an object defines: a named point's, an imported node's
  const namesOf = (q) => (q.type === 'coord' && q.tikzName ? [q.tikzName] : q.tex && q.tex.i === 0 && q.tex.nm ? q.tex.nm : []);
  // statements in code: the ; outside braces and brackets
  const stmtCount = (c) => { let d = 0, n = 0; for (let i = 0; i < c.length; i++) { const ch = c[i]; if (ch === '\\') { i++; continue; } if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') d--; else if (ch === ';' && !d) n++; } return n; };
  // points of s that sit on a named point defined before it (one it went through in the source, or one an end
  // is attached to) are written by the name: (A) rather than (1.5,2)
  function refMap(s, list, n, X) {
    const want = new Set(s.refs || []);
    for (const L of ['link1', 'link2']) if (s[L]) { const c = list.find((q) => q.id === s[L].id); if (c && c.type === 'coord' && c.tikzName) want.add(c.tikzName); }
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
  function styledCode(s, X) {
    const S = s.tkStyle;
    if (!S || !S.n || !S.n.length) return null;
    const J = (v) => JSON.stringify(v ?? null);
    const F = Object.entries(S.f || {});
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
    const cur = splitOpts(m[2] || ''), own = splitOpts(mb[2] || ''), key = (o) => o.split('=')[0].trim();
    const lost = new Set(own.filter((o) => !cur.includes(o)).map(key));
    for (const X2 of [cur.filter((o) => own.includes(o)), cur.filter((o) => own.includes(o) || lost.has(key(o)))]) {
      if (!readsBack(s, plain.replace(mp[0], `\\${m[1]}[${[...S.n.map((nm) => (S.d || {})[nm] || ''), ...X2].filter(Boolean).join(', ')}]`))) continue;
      return code.replace(m[0], `\\${m[1]}[${[...S.n, ...X2].join(', ')}]`);
    }
    return null;
  }
  // code read back (styles written out) gives the shape again: the fields the same, numbers to rounding
  function readsBack(s, code) {
    const R = TD.importInternals && TD.importInternals.preview;
    if (!R) return false;
    let r;
    try { r = R(code, [], {}).shapes; } catch (e) { return false; }
    if (!r || r.length !== 1 || r[0].type !== s.type) return false;
    const skip = new Set(['id', 'tex', 'tkStyle', 'refs', 'link1', 'link2', 'g', 'gname', 'name', 'pos', 'locked', 'hidden', 'ex']);
    const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.25
      : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => near(v, b[i]))
      : a && b && typeof a === 'object' && typeof b === 'object' ? [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => near(a[k], b[k]))
      : (a ?? null) === (b ?? null));
    return [...new Set([...Object.keys(s), ...Object.keys(r[0])])].every((k) => skip.has(k) || k[0] === '_' || near(s[k], r[0][k]));
  }
  // an option list's entries (commas inside braces, brackets or parentheses do not split)
  function splitOpts(str) {
    const out = [];
    let d = 0, cur = '';
    for (const ch of str) {
      if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
      if (ch === ',' && !d) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // a node placed with the positioning library (s.pos = { k: 'right', v: '1cm of a', of, off }): written so
  // again while it is still where that puts it from the node it names
  function posCode(s, code, list, n) {
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
  function shiftOf(run) {
    const t = run[0].tex;
    if (!t.b || !run.every((r) => r.tex.sr)) return null;
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
  const mark = (ids, code) => (TD.srcMark && code ? M0 + ids.join(',') + M1 + code + M2 : code);
  TD.srcMap = function (text) {
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
  TD.tikzLines = function (shapes, X) {
    const items = [];
    if (shapes.some((s) => s.pos)) X.libs.add('positioning'); // right=1cm of a, as written or kept (posCode)
    for (const s of shapes) {
      const code = s.type === 'tikz' ? s.code : s.tex && s.tex.src;
      if (!code || !code.includes('color')) continue;
      for (const m of code.matchAll(/\\(?:definecolor|colorlet)\s*\{([^}]*)\}/g)) (X.reserved = X.reserved || new Set()).add(m[1].trim());
      // \definecolor{name}{HTML|RGB|rgb}{…} at the top level: generated code may use the name for that colour
      if (s.type === 'tikz' && !(s.ctx && s.ctx.length)) for (const m of code.matchAll(/\\definecolor\s*\{([^}]*)\}\s*\{(HTML|RGB|rgb)\}\s*\{([^}]*)\}/g)) {
        const v = m[3].split(',').map((x) => x.trim());
        const n = m[2] === 'HTML' ? [0, 2, 4].map((i) => parseInt(v[0].slice(i, i + 2), 16)) : v.map((x) => Math.round(m[2] === 'rgb' ? +x * 255 : +x));
        if (n.length !== 3 || !n.every((x) => x >= 0 && x <= 255)) continue;
        const hex = '#' + n.map((x) => x.toString(16).padStart(2, '0')).join('');
        X.named = X.named || new Map(); if (!X.named.has(hex)) X.named.set(hex, m[1].trim());
      }
    }
    for (let n = 0; n < shapes.length;) {
      const s = shapes[n], t = s.tex;
      if (t && t.i === 0 && t.src != null) {
        const run = shapes.slice(n, n + t.n);
        const whole = run.length === t.n && run.every((r, q) => r.tex && r.tex.p === t.p && r.tex.k === t.k && r.tex.i === q);
        // (a named point alone is simply written where it is now)
        const same = whole && run.every(unchanged), d = whole && !same && !run.every((r) => r.type === 'coord') ? shiftOf(run) : null;
        if (same || d) {
          needs(run, X);
          const own = TD.rawTikz.dedent(t.src.slice(t.cut));
          // only moved: as written, in a shift scope outside its own scopes
          const ids = run.map((r) => r.id);
          if (own.trim()) items.push(d ? { code: mark(ids, TD.rawTikz.wrapCode(own, t.ctx || [], X.c(d.dx, d.dy))), ctx: [] } : { code: mark(ids, own), ctx: t.ctx || [] });
          if (t.drop) (X.notes = X.notes || new Set()).add(`Picture options left out (they belong to the whole picture): ${t.drop.join(', ')}`);
          n += t.n; continue;
        }
      }
      X.refs = refMap(s, shapes, n, X);
      let code, placed = null;
      try {
        code = styledCode(s, X) || shapeCode(s, X);
        placed = posCode(s, code, shapes, n);
        if (placed) code = placed;
      } finally { X.refs = null; }
      // a node other statements still name keeps its name, as a coordinate where the text is (a named point
      // renamed here keeps its old name the same way, for the code kept as written that uses it)
      const old = t && t.nm && t.i === 0 ? t.nm.filter((nm) => !(s.type === 'coord' && nm === s.tikzName)) : [];
      if (code && old.length && !placed && (s.type === 'text' || s.type === 'coord')) code += '\n' + old.map((nm) => `\\coordinate (${nm}) at ${X.c(s.x, s.y)};`).join('\n');
      if (code) items.push({ code: mark([s.id], code), ctx: [] });
      n++;
    }
    // consecutive statements from the same scopes share them
    const out = [];
    for (let a = 0; a < items.length;) {
      const key = JSON.stringify(items[a].ctx);
      let b = a + 1;
      while (b < items.length && JSON.stringify(items[b].ctx) === key) b++;
      if (!items[a].ctx.length) out.push(...items.slice(a, b).map((x) => x.code));
      else out.push(TD.rawTikz.wrapCode(items.slice(a, b).map((x) => x.code).join('\n'), items[a].ctx));
      a = b;
    }
    return out;
  };
  // the whole picture as written, when every statement of one imported picture is there, in order and unchanged
  TD.tikzWhole = function (shapes, X) {
    const L = shapes.filter((s) => !s.hidden && !(s.type === 'tikz' && s.pre));
    const t0 = L.length && L[0].tex;
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
    const pre = shapes.filter((s) => !s.hidden && s.type === 'tikz' && s.pre).map((s) => mark([s.id], T.tikz.tikz(s, X))).filter(Boolean);
    const runIds = (s) => L.filter((r) => r.tex.k === s.tex.k).map((r) => r.id);
    return { open: t0.open, pre, body: L.filter((s) => s.tex.i === 0).map((s) => mark(runIds(s), s.tex.src)).join('') + L[L.length - 1].tex.tail, close: '\\end{tikzpicture}' };
  };
  // Body lines (definecolors + shapes) for a list of shapes.
  TD.tikzBody = function (shapes, X) {
    shapes = shapes.filter((s) => !s.hidden); // a hidden layer is not exported
    X.scene = shapes;
    const body = TD.tikzLines(shapes, X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    if (X.decls) for (const d of X.decls.values()) defs.push(d.decl);
    return [...defs, ...(defs.length ? [''] : []), ...body];
  };
  // \begin{tikzpicture}[…] for written code: the source picture's options that only set defaults the generated
  // code does not rely on (>=Stealth), when the shapes came from one picture
  TD.tikzOpen = function (shapes) {
    const po = [...new Set(shapes.map((s) => s.tex && s.tex.po).filter(Boolean))];
    return `\\begin{tikzpicture}[x=1cm, y=1cm${po.length === 1 ? ', ' + po[0] : ''}]`;
  };
  // what the picture's own options use (a style naming DarkBlue, a library's keys), for the preamble
  const openUses = (open, X) => { if (!TD.lint || !TD.lint.uses) return; const u = TD.lint.uses(open); for (const l of u.libs) X.libs.add(l); for (const p of u.pkgs) X.pkgs.add(p); };
  TD.tikzPicture = function (shapes, X) {
    const W = TD.tikzWhole(shapes, X);
    if (W) { openUses(W.open, X); return W.open + W.pre.map((c) => '\n  ' + c.replace(/\n/g, '\n  ')).join('') + W.body + W.close; }
    const open = TD.tikzOpen(shapes);
    openUses(open, X);
    return [open, ...TD.tikzBody(shapes, X).map((l) => (l ? '  ' + l.replace(/\n/g, '\n  ') : l)), '\\end{tikzpicture}'].join('\n');
  };

  const notesOf = (X) => [...(X.notes || [])].map((n) => '% Note: ' + n);
  TD.tikzNotes = notesOf;
  // Full TikZ document generation.
  TD.toTikz = function (shapes, { standalone = false } = {}) {
    const X = makeX();
    if (standalone) X.preDefs = new Set();
    const pic = TD.tikzPicture(shapes, X);
    const pre = [...TD.preamble(X), ...(X.preDefs ? X.preDefs : [])];
    if (!standalone) {
      // a snippet: the packages on one comment line, and any compatibility lines (each its own line) to copy
      const c = TD.preambleCompat(X), extra = [...c.before, ...c.after];
      const head = '% Requires: ' + pre.filter((l) => !extra.includes(l)).join(' ');
      const note = c.before.length ? ['% and, in the preamble, these lines (the first block before \\usetikzlibrary{quantikz2}):', ...extra.map((l) => '%   ' + l)] : [];
      return [head, ...note, ...notesOf(X), pic, ''].join('\n');
    }
    return [
      ...notesOf(X),
      // standalone's tikz option breaks zx-calculus (an error at \begin{document}); one picture needs no option
      pre.some((l) => l.includes('{zx-calculus}')) ? '\\documentclass[border=4pt]{standalone}' : '\\documentclass[tikz, border=4pt]{standalone}',
      ...pre,
      '\\begin{document}',
      pic,
      '\\end{document}',
      '',
    ].join('\n');
  };
})();
