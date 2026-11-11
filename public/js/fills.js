// Rich fills: gradients (linear / radial) and hatch patterns, plus the line-width and dash presets.
// A fill is either a colour string ('#rrggbb[aa]') or an object:
//   gradient: { g: 'linear'|'radial', angle (deg, CCW), scale (%), cx, cy (% of the box), stops: [[0..1, '#hex'], ...] }
//   pattern:  { p: 'vlines'|'hlines'|'grid'|'ne'|'nw'|'cross'|'bricks'|'dots', size (px), lw (px), color }
// On the canvas they become <linearGradient>/<radialGradient>/<pattern> defs (collected per render).
// In TikZ, gradients become \pgfdeclare…shading declarations and patterns use patterns.meta.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const f = TD.fmt;
  const K = TD.PT_PER_PX;

  const isObj = (v) => !!v && typeof v === 'object';
  TD.isRichFill = isObj;
  TD.isGradient = (v) => isObj(v) && !!v.g;
  TD.isPattern = (v) => isObj(v) && !!v.p;
  // A representative solid colour (for previews, the Basic tab and anything that needs one colour).
  TD.fillColor = (v) => (!isObj(v) ? v : v.g ? ((v.stops && v.stops[0]) || [0, '#000000'])[1] : v.color || '#000000');

  TD.GRAD_PRESETS = [
    { g: 'linear', angle: 0, stops: [[0, '#ffffff'], [1, '#000000']] },
    { g: 'linear', angle: 90, stops: [[0, '#1e3c72'], [1, '#9ec5fe']] },
    { g: 'linear', angle: 0, stops: [[0, '#f6d365'], [1, '#fda085']] },
    { g: 'linear', angle: 0, stops: [[0, '#84fab0'], [1, '#8fd3f4']] },
    { g: 'linear', angle: 45, stops: [[0, '#a18cd1'], [1, '#fbc2eb']] },
    { g: 'linear', angle: 0, stops: [[0, '#c62828'], [0.5, '#f5e44c'], [1, '#4a7a1e']] },
    { g: 'linear', angle: 0, stops: [[0, '#ff0000'], [0.2, '#ffff00'], [0.4, '#00ff00'], [0.6, '#00ffff'], [0.8, '#0000ff'], [1, '#ff00ff']] },
    { g: 'linear', angle: 90, stops: [[0, '#2459a6'], [0.5, '#ffffff'], [1, '#c8361d']] },
    { g: 'radial', stops: [[0, '#ffffff'], [1, '#5b8ede']] },
    { g: 'radial', stops: [[0, '#fff3b0'], [1, '#e8a33d']] },
    { g: 'radial', cx: 35, cy: 35, scale: 140, stops: [[0, '#ffffff'], [0.45, '#a05a5a'], [1, '#3a1d1d']] },
    { g: 'radial', stops: [[0, '#000000'], [1, '#ffffff']] },
  ];
  TD.PATTERNS = [['vlines', 'Vertical lines'], ['hlines', 'Horizontal lines'], ['grid', 'Grid'], ['ne', 'North-east lines'],
    ['nw', 'North-west lines'], ['cross', 'Crosshatch'], ['bricks', 'Bricks'], ['dots', 'Dots']];

  const gnorm = (v) => ({ g: v.g, angle: v.angle || 0, scale: v.scale ?? 100, cx: v.cx ?? 50, cy: v.cy ?? 50,
    stops: (v.stops || []).slice().sort((a, b) => a[0] - b[0]) });
  const pnorm = (v) => ({ p: v.p, size: Math.max(2, v.size || 8), lw: v.lw ?? 0.75, color: v.color || '#000000' });

  // ---------- SVG defs ----------
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function gradDef(v0, id) {
    const v = gnorm(v0);
    const st = v.stops.map(([o, c]) => { const p = TD.parseColor(c); return `<stop offset="${r2(o)}" stop-color="${p.hex}"${p.a < 1 ? ` stop-opacity="${r2(p.a)}"` : ''}/>`; }).join('');
    const sc = v.scale / 100, cx = v.cx / 100, cy = v.cy / 100;
    if (v.g === 'radial') return `<radialGradient id="${id}" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(0.5 * sc)}">${st}</radialGradient>`;
    return `<linearGradient id="${id}" x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform="translate(${r2(cx - 0.5)} ${r2(cy - 0.5)}) rotate(${r2(-v.angle)} 0.5 0.5) translate(0.5 0.5) scale(${r2(sc)}) translate(-0.5 -0.5)">${st}</linearGradient>`;
  }
  function patBody(v) {
    const s = v.size, h = s / 2, q = s / 4, c = TD.parseColor(v.color);
    const ln = `fill="none" stroke="${c.hex}" stroke-width="${r2(v.lw)}"${c.a < 1 ? ` stroke-opacity="${r2(c.a)}"` : ''}`;
    let d = '', rot = 0;
    switch (v.p) {
      case 'vlines': d = `M${h} 0V${s}`; break;
      case 'hlines': d = `M0 ${h}H${s}`; break;
      case 'ne': d = `M0 ${h}H${s}`; rot = -45; break;
      case 'nw': d = `M0 ${h}H${s}`; rot = 45; break;
      case 'grid': d = `M${h} 0V${s}M0 ${h}H${s}`; break;
      case 'cross': d = `M${h} 0V${s}M0 ${h}H${s}`; rot = 45; break;
      case 'bricks': d = `M0 ${q}H${s}M0 ${3 * q}H${s}M${q} ${q}V${3 * q}M${3 * q} ${3 * q}V${s}M${3 * q} 0V${q}`; break;
      case 'dots': return { body: `<circle cx="${h}" cy="${h}" r="${r2(Math.max(0.3, v.lw))}" fill="${c.hex}"${c.a < 1 ? ` fill-opacity="${r2(c.a)}"` : ''}/>`, rot: 0 };
    }
    return { body: `<path d="${d}" ${ln}/>`, rot };
  }
  function patDef(v0, id) {
    const v = pnorm(v0), { body, rot } = patBody(v);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${r2(v.size)}" height="${r2(v.size)}"${rot ? ` patternTransform="rotate(${rot})"` : ''}>${body}</pattern>`;
  }
  let defs = new Map();
  TD.fillRef = (v) => {
    const id = 'tdf-' + hash(JSON.stringify(v));
    if (!defs.has(id)) defs.set(id, v.g ? gradDef(v, id) : patDef(v, id));
    return `url(#${id})`;
  };
  // Collect (and reset) the defs referenced since the last call.
  TD.takeFillDefs = () => { const s = [...defs.values()].join(''); defs = new Map(); return s ? `<defs>${s}</defs>` : ''; };

  // ---------- CSS previews (UI only) ----------
  function cssGrad(v0) {
    const v = gnorm(v0), sc = v.scale / 100;
    const st = (fn) => v.stops.map(([t, c]) => `${TD.css(c)} ${r2(fn(t))}%`).join(', ');
    if (!v.stops.length) return 'transparent';
    if (v.g === 'radial') return `radial-gradient(farthest-side at ${r2(v.cx)}% ${r2(v.cy)}%, ${st((t) => t * sc * 100)})`;
    return `linear-gradient(${r2(90 - v.angle)}deg, ${st((t) => (0.5 + (t - 0.5) * sc) * 100)})`;
  }
  function patSvgPreview(v0, w, h) {
    const v = pnorm(v0), id = 'pp' + hash(JSON.stringify(v));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${patDef(v, id)}</defs><rect width="${w}" height="${h}" fill="url(#${id})"/></svg>`;
  }
  TD.fillCss = (v) => {
    if (!v) return 'transparent';
    if (!isObj(v)) return TD.css(v);
    if (v.g) return cssGrad(v);
    return `#fff url("data:image/svg+xml,${encodeURIComponent(patSvgPreview(v, 48, 48))}") 0 0/48px 48px`;
  };
  TD.fillLabel = (v) => (!v ? 'none' : !isObj(v) ? v.toUpperCase() : v.g ? (v.g === 'radial' ? 'Radial' : 'Linear') + ' gradient'
    : ((TD.PATTERNS.find((p) => p[0] === v.p) || [0, 'Pattern'])[1]));

  // ---------- TikZ ----------
  const rgb = (c) => { const n = parseInt(TD.parseColor(c).hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255); };
  // pgf shadings are 100bp squares; TikZ fits the middle 50bp onto the path's bounding box.
  function shadingStops(v) {
    const sc = v.scale / 100;
    let pos;
    if (v.g === 'radial') pos = (t) => t * 25 * sc;
    else {
      const a = (v.angle * Math.PI) / 180, off = ((v.cx - 50) / 100) * Math.cos(a) + ((50 - v.cy) / 100) * Math.sin(a);
      pos = (t) => 50 + 50 * off + (t - 0.5) * 50 * sc;
    }
    const pts = v.stops.map(([t, c]) => [pos(t), rgb(c)]);
    if (!pts.length) pts.push([0, [0, 0, 0]]);
    const at = (p) => {
      if (p <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) {
        const [p0, c0] = pts[i - 1], [p1, c1] = pts[i], k = p1 - p0 < 1e-9 ? 1 : (p - p0) / (p1 - p0);
        return c0.map((x, j) => x + (c1[j] - x) * k);
      }
      return pts[pts.length - 1][1];
    };
    const ps = [0, ...pts.map((p) => p[0]).filter((p) => p > 0 && p < 100), 100];
    const out = [];
    let last = -1;
    for (const p0 of ps) {
      const p = Math.max(p0, last + 0.01);
      out.push(`rgb(${f(p)}bp)=(${at(p0).map((x) => Math.round(x * 1000) / 1000).join(',')})`);
      last = p;
    }
    return out.join('; ');
  }
  // Options for a rich fill: e.g. ['shading=tdshade1', 'shading angle=30'] or ['pattern={Lines[…]}', 'pattern color=…'].
  TD.tikzFillOpts = (v0, X) => {
    if (v0.g) {
      const v = gnorm(v0);
      if (!X.decls) X.decls = new Map();
      const k = JSON.stringify(v);
      if (!X.decls.has(k)) {
        const name = 'tdshade' + (X.decls.size + 1), st = shadingStops(v);
        const decl = v.g === 'radial'
          ? `\\pgfdeclareradialshading{${name}}{\\pgfpoint{${f(((v.cx - 50) / 100) * 50)}bp}{${f(((50 - v.cy) / 100) * 50)}bp}}{${st}}`
          : `\\pgfdeclarehorizontalshading{${name}}{100bp}{${st}}`;
        X.decls.set(k, { name, decl });
      }
      const o = ['shade', `shading=${X.decls.get(k).name}`];
      if (v.g === 'linear' && v.angle) o.push(`shading angle=${f(v.angle)}`);
      return o;
    }
    const v = pnorm(v0), d = `distance=${f(v.size * K)}pt`, w = `line width=${f(v.lw * K)}pt`;
    let pat;
    switch (v.p) {
      case 'vlines': pat = `{Lines[angle=90, ${d}, ${w}]}`; break;
      case 'hlines': pat = `{Lines[angle=0, ${d}, ${w}]}`; break;
      case 'ne': pat = `{Lines[angle=45, ${d}, ${w}]}`; break;
      case 'nw': pat = `{Lines[angle=-45, ${d}, ${w}]}`; break;
      case 'grid': pat = `{Hatch[angle=0, ${d}, ${w}]}`; break;
      case 'cross': pat = `{Hatch[angle=45, ${d}, ${w}]}`; break;
      case 'dots': pat = `{Dots[${d}, radius=${f(Math.max(0.3, v.lw) * K)}pt]}`; break;
      case 'bricks': {
        // a declared patterns.meta pattern, so size and line width match the canvas tile (the old `bricks` has a fixed size)
        if (!X.decls) X.decls = new Map();
        const sz = v.size * K, k = 'bricks' + sz.toFixed(3) + '/' + (v.lw * K).toFixed(3);
        if (!X.decls.has(k)) {
          const name = 'tdbricks' + [...X.decls.keys()].filter((x) => x.startsWith('bricks')).length, S = f(sz), Q = f(sz / 4), T = f(sz * 3 / 4);
          X.decls.set(k, { name, decl: `\\pgfdeclarepattern{name=${name}, parameters={}, bottom left={\\pgfpoint{0pt}{0pt}}, top right={\\pgfpoint{${S}pt}{${S}pt}}, tile size={\\pgfpoint{${S}pt}{${S}pt}}, code={\\pgfsetlinewidth{${f(v.lw * K)}pt}\\pgfpathmoveto{\\pgfpoint{0pt}{${Q}pt}}\\pgfpathlineto{\\pgfpoint{${S}pt}{${Q}pt}}\\pgfpathmoveto{\\pgfpoint{0pt}{${T}pt}}\\pgfpathlineto{\\pgfpoint{${S}pt}{${T}pt}}\\pgfpathmoveto{\\pgfpoint{${Q}pt}{${Q}pt}}\\pgfpathlineto{\\pgfpoint{${Q}pt}{${T}pt}}\\pgfpathmoveto{\\pgfpoint{${T}pt}{0pt}}\\pgfpathlineto{\\pgfpoint{${T}pt}{${Q}pt}}\\pgfpathmoveto{\\pgfpoint{${T}pt}{${T}pt}}\\pgfpathlineto{\\pgfpoint{${T}pt}{${S}pt}}\\pgfusepath{stroke}}}` });
        }
        pat = X.decls.get(k).name;
        break;
      }
    }
    X.libs.add('patterns.meta');
    const o = [`pattern=${pat}`];
    if (X.col(v.color) !== 'black') o.push(`pattern color=${X.col(v.color)}`);
    return o;
  };

  // ---------- dash patterns ----------
  // dash: 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'p:<on> <off> …' (custom, lengths in pt)
  TD.dashPat = (dash) => (typeof dash === 'string' && dash.startsWith('p:') ? dash.slice(2).trim().split(/[\s,]+/).map(Number).filter((n) => isFinite(n) && n >= 0) : null);
  TD.DASHES = [['solid', 'Solid'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['dashdot', 'Dash dot'],
    ['p:1.5 1.5', 'Densely dashed'], ['p:6 3', 'Long dashes'], ['p:6 2 1 2 1 2', 'Dash dot dot']];
  TD.WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];

  // ---------- picker panes (used by the colour picker's Gradient / Pattern tabs) ----------
  const swatches = (attr) => `<div class="fp-sw">${(TD.colorPresets ? TD.colorPresets() : []).map((c) => `<button type="button" ${attr}="${c}" style="background:${TD.css(c)}" title="${c}"></button>`).join('')}</div>`;
  const hexOk = (v) => { v = v.trim().replace('#', ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join(''); return /^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? '#' + v.toLowerCase() : null; };

  TD.fillPanes = {
    defaultGrad: (base) => ({ g: 'linear', angle: 0, scale: 100, cx: 50, cy: 50, stops: [[0, '#ffffff'], [1, base && !isObj(base) ? base : '#5b8ede']] }),
    defaultPat: (base) => ({ p: 'ne', size: 8, lw: 0.75, color: base && !isObj(base) && !/^#fff(fff)?/i.test(base) ? base : '#000000' }),

    // el: pane element; get(): current gradient; set(v, final)
    grad(el, get, set) {
      let sel = 0;
      const draw = () => {
        const v = gnorm(get());
        sel = Math.min(sel, v.stops.length - 1);
        const bar = `linear-gradient(90deg, ${v.stops.map(([t, c]) => `${TD.css(c)} ${r2(t * 100)}%`).join(', ')})`;
        el.innerHTML =
          `<div class="fp-presets">${TD.GRAD_PRESETS.map((p, i) => `<button type="button" data-gp="${i}" style="background:${cssGrad(p)}"></button>`).join('')}</div>` +
          `<div class="fp-preview" style="background:${cssGrad(v)}"></div>` +
          `<div class="fp-seg"><button type="button" data-gk="linear" class="${v.g === 'linear' ? 'on' : ''}">Linear</button><button type="button" data-gk="radial" class="${v.g === 'radial' ? 'on' : ''}">Radial</button></div>` +
          `<div class="fp-fields">` +
          (v.g === 'linear' ? `<label><span>Rotate</span><input type="number" data-gf="angle" step="15" value="${r2(v.angle)}"><i>°</i></label>` : '') +
          `<label><span>Scale</span><input type="number" data-gf="scale" min="5" step="10" value="${r2(v.scale)}"><i>%</i></label>` +
          `<label><span>Center</span><input type="number" data-gf="cx" step="5" value="${r2(v.cx)}"><input type="number" data-gf="cy" step="5" value="${r2(v.cy)}"><i>%</i></label></div>` +
          `<div class="fp-stops" title="Click the bar to add a stop; drag a stop to move it"><div class="fp-bar" style="background:${bar}"></div>` +
          v.stops.map(([t, c], i) => `<b data-st="${i}" class="${i === sel ? 'on' : ''}" style="left:${r2(t * 100)}%"><span style="background:${TD.css(c)}"></span></b>`).join('') + `</div>` +
          `<div class="fp-stop-ed"><span>Stop</span><input data-sthex value="${esc(v.stops[sel][1].replace('#', '').toUpperCase())}" maxlength="8"><input type="number" data-stpos min="0" max="100" step="5" value="${Math.round(v.stops[sel][0] * 100)}"><i>%</i>` +
          `<button type="button" data-stdel ${v.stops.length < 3 ? 'disabled' : ''} title="Remove stop">✕</button></div>` + swatches('data-stc');
      };
      const upd = (fn, final = true) => { const v = gnorm(get()); fn(v); set(v, final); if (final) draw(); };
      el.onclick = (e) => {
        const t = e.target.closest('button,[data-st]');
        if (!t) return;
        if (t.dataset.gp != null) { const p = gnorm(TD.GRAD_PRESETS[t.dataset.gp]); sel = 0; set(p, true); draw(); }
        else if (t.dataset.gk) upd((v) => { v.g = t.dataset.gk; });
        else if (t.dataset.stc) upd((v) => { v.stops[sel][1] = t.dataset.stc; });
        else if (t.hasAttribute('data-stdel')) upd((v) => { v.stops.splice(sel, 1); sel = Math.max(0, sel - 1); });
      };
      el.onchange = (e) => {
        const t = e.target;
        if (t.dataset.gf) { const n = parseFloat(t.value); if (isFinite(n)) upd((v) => { v[t.dataset.gf] = t.dataset.gf === 'scale' ? Math.max(5, n) : n; }); }
        else if (t.hasAttribute('data-sthex')) { const c = hexOk(t.value); if (c) upd((v) => { v.stops[sel][1] = c; }); else draw(); }
        else if (t.hasAttribute('data-stpos')) { const n = parseFloat(t.value); if (isFinite(n)) upd((v) => { const st = v.stops[sel]; st[0] = Math.max(0, Math.min(1, n / 100)); v.stops.sort((a, b) => a[0] - b[0]); sel = v.stops.indexOf(st); }); }
      };
      el.onpointerdown = (e) => {
        const box = e.target.closest('.fp-stops');
        if (!box) return;
        e.preventDefault();
        const r = box.getBoundingClientRect(), tAt = (ev) => Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        const v = gnorm(get());
        let st;
        const h = e.target.closest('[data-st]');
        if (h) st = v.stops[+h.dataset.st];
        else {
          // add a stop with the colour the bar shows there
          const t = tAt(e), pts = v.stops;
          let c = pts[0][1];
          for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { c = (t - pts[i - 1][0]) < (pts[i][0] - t) ? pts[i - 1][1] : pts[i][1]; break; } else c = pts[i][1];
          st = [t, c]; v.stops.push(st);
        }
        v.stops.sort((a, b) => a[0] - b[0]);
        sel = v.stops.indexOf(st);
        set(v, false); draw();
        const move = (ev) => { st[0] = tAt(ev); v.stops.sort((a, b) => a[0] - b[0]); sel = v.stops.indexOf(st); set(v, false);
          const hs = el.querySelectorAll('[data-st]'); v.stops.forEach((s2, i) => { if (hs[i]) { hs[i].style.left = r2(s2[0] * 100) + '%'; hs[i].querySelector('span').style.background = TD.css(s2[1]); hs[i].classList.toggle('on', i === sel); } });
          el.querySelector('.fp-bar').style.background = `linear-gradient(90deg, ${v.stops.map(([t, c]) => `${TD.css(c)} ${r2(t * 100)}%`).join(', ')})`;
          el.querySelector('.fp-preview').style.background = cssGrad(v); };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); set(v, true); draw(); };
        addEventListener('pointermove', move); addEventListener('pointerup', up);
      };
      draw();
    },

    pat(el, get, set) {
      const draw = () => {
        const v = pnorm(get());
        el.innerHTML =
          `<div class="fp-pats">${TD.PATTERNS.map(([k, n]) => `<button type="button" data-pk="${k}" title="${n}" class="${k === v.p ? 'on' : ''}">${patSvgPreview({ ...v, p: k, size: Math.min(v.size, 10) }, 40, 26)}</button>`).join('')}</div>` +
          `<div class="fp-preview pat">${patSvgPreview(v, 214, 54)}</div>` +
          `<div class="fp-fields"><label><span>Size</span><input type="number" data-pf="size" min="2" step="1" value="${r2(v.size)}"><i>px</i></label>` +
          `<label><span>${v.p === 'dots' ? 'Radius' : 'Line width'}</span><input type="number" data-pf="lw" min="0.25" step="0.25" value="${r2(v.lw)}"><i>px</i></label>` +
          `<label><span>Colour</span><input data-phex value="${esc(v.color.replace('#', '').toUpperCase())}" maxlength="8"></label></div>` + swatches('data-pc');
      };
      const upd = (fn) => { const v = pnorm(get()); fn(v); set(v, true); draw(); };
      el.onclick = (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.pk) upd((v) => { v.p = t.dataset.pk; });
        else if (t.dataset.pc) upd((v) => { v.color = t.dataset.pc; });
      };
      el.onchange = (e) => {
        const t = e.target;
        if (t.dataset.pf) { const n = parseFloat(t.value); if (isFinite(n)) upd((v) => { v[t.dataset.pf] = Math.max(t.dataset.pf === 'size' ? 2 : 0.25, n); }); }
        else if (t.hasAttribute('data-phex')) { const c = hexOk(t.value); if (c) upd((v) => { v.color = c; }); else draw(); }
      };
      el.onpointerdown = null;
      draw();
    },
  };
})();
