// 2D geometry block: a plain TikZ picture read by the 3D geometry interpreter (geo3d.js) seen straight on.
// Points (x, y) and (angle:radius), vectors, projections such as (Q |- P), grids, angle marks from the angles
// library, function, polar and parametric plots, and labels that print computed values
// (\pgfmathprintnumber of a \pgfmathsetmacro). The code is the object: it is exported as written.
(function () {
  const TD = window.TD, G = TD.geo3d, V3 = TD.V3;
  const { esc, r2 } = TD.util;
  const fmt = G.fmt;
  const layout = (src) => G.layout(src, true);

  const DEFAULT = `\\begin{tikzpicture}
  % the vector v = (\\vlen; \\vang°): drag Q, or change the values
  \\pgfmathsetmacro{\\vlen}{4}
  \\pgfmathsetmacro{\\vang}{53.17}
  \\pgfmathsetmacro{\\dx}{\\vlen*cos(\\vang)}
  \\pgfmathsetmacro{\\dy}{\\vlen*sin(\\vang)}
  \\draw[step=1, very thin, black!15] (-1,-1) grid (4,4);
  \\draw[-stealth] (-1,0) -- (4.4,0) node[right]{$x$};
  \\draw[-stealth] (0,-1) -- (0,4.4) node[above]{$y$};
  \\foreach \\x in {1,...,3} \\draw (\\x,2pt) -- (\\x,-2pt) node[below]{$\\x$};
  \\foreach \\y in {1,...,3} \\draw (2pt,\\y) -- (-2pt,\\y) node[left]{$\\y$};
  \\coordinate (P) at (0,0);
  \\coordinate (Q) at (\\vang:\\vlen);
  \\coordinate (R) at (Q |- P);
  \\draw[dashed, gray] (Q) -- (R) node[midway, right]{$\\Delta y = \\pgfmathprintnumber[fixed,precision=2]{\\dy}$};
  \\path (P) -- (R) node[pos=0.62, above]{$\\Delta x = \\pgfmathprintnumber[fixed,precision=2]{\\dx}$};
  \\pic[draw, "$\\theta$", angle radius=8mm] {angle = R--P--Q};
  \\draw[-stealth, thick, blue] (P) -- (Q) node[midway, above left]{$\\vec{v}$};
  \\fill (P) circle (1.5pt) node[below left]{$P$};
  \\fill (Q) circle (1.5pt) node[above right]{$Q$};
\\end{tikzpicture}`;
  TD.GEO2D_DEFAULT = DEFAULT;

  function draw(s, ctx = {}) {
    const L = layout(s.src);
    let out = L.empty
      ? `<rect x="${s.x}" y="${s.y}" width="${L.bb.w}" height="${L.bb.h}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`
      : V3.svg(L.items, G.fitAt(L, s.x, s.y), ctx);
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(L.bb.w)}" height="${r2(L.bb.h)}"/>`;
    return out;
  }
  // the TikZ libraries the code uses
  function libsOf(src, X) {
    if (/-\{?(Stealth|Latex|Triangle|Kite|Straight Barb)|\{(Stealth|Latex)/.test(src)) X.libs.add('arrows.meta');
    if (/\(\s*\$/.test(src)) X.libs.add('calc');
    if (/\{\s*(right )?angle\s*=/.test(src)) X.libs.add('angles');
    if (/\\pic\s*\[[^\]]*"/.test(src)) X.libs.add('quotes');
  }

  TD.TYPES.geo2d = {
    name: '2D geometry',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'geo2d', x: p.x, y: p.y, src: DEFAULT }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s.src).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the picture becomes a scope moved to where the drawing sits
    tikz(s, X) {
      const L = layout(s.src), P = G.partsOf(s.src, true);
      libsOf(s.src, X);
      const o = [`shift={${X.c(s.x - L.bb.x, s.y - L.bb.y)}}`];
      if (P.opts) o.push(P.opts);
      return [P.pre, `\\begin{scope}[${o.join(', ')}]`, P.body, '\\end{scope}', P.post].filter(Boolean).join('\n');
    },
  };

  // ---------------------------------------------------------------- panel
  // a slider for each value set to a plain number (\pgfmathsetmacro, \def): drag it and the figure follows
  function sliders(L) {
    const out = [];
    for (const [name, m] of L.macros) {
      if (!m.literal || L.S[m.si] == null || L.S[m.si].k !== 'macro') continue;
      const v = parseFloat(L.src.slice(m.span.s, m.span.e));
      const R = Math.abs(v) <= 1 ? 1 : Math.pow(10, Math.ceil(Math.log10(Math.abs(v)) - 1e-9));
      out.push({ name, v, lo: v < 0 ? -R : 0, hi: R, step: R / 200 });
    }
    return out;
  }
  function fullCode(src) { return String(src || '').trim(); }
  TD.panels = TD.panels || {};
  TD.panels.geo2d = {
    html(s) {
      const L = layout(s.src), S = sliders(L);
      const sl = S.map((x) => `<div class="row"><label class="mono" title="\\${esc(x.name)}">${esc(x.name)}</label><div class="ctl"><input type="range" data-g2="${esc(x.name)}" min="${x.lo}" max="${x.hi}" step="${x.step}" value="${x.v}" aria-label="${esc(x.name)}"><label class="ang" title="Click to type a value"><input type="number" data-g2n="${esc(x.name)}" value="${fmt(x.v, 3)}" step="${x.step * 10}" aria-label="${esc(x.name)}"></label></div></div>`).join('');
      return `<div class="sec"><div class="sec-title">2D geometry <small>TikZ</small></div>
        ${sl}
        <div class="row"><label>Scale</label><div class="ctl"><input type="number" data-g2="scale" value="${fmt(L.scale, 2)}" step="0.25" min="0.1"></div></div>
        <div class="help">${S.length ? 'Each value set to a number in the code gets a slider. ' : ''}Double-click the figure to edit it: drag points, add vectors, projections, angle marks, plots and measures.</div></div>
        <div class="sec"><div class="sec-title">TikZ</div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="12">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Plain TikZ; angle marks add <code>\\usetikzlibrary{angles, quotes}</code>. The picture's options go on a scope.</div></div>
        <div class="sec"><button class="wide primary" data-act="editgeo2d">Edit 2D Geometry…</button><button class="wide" data-act="copygeo2d">Copy TikZ Code</button></div>`;
    },
    apply(s, t) {
      if (t.dataset.p === 'src') { s.src = t.value; return false; }
      const k = t.dataset.g2 || t.dataset.g2n;
      if (!k) return false;
      const v = parseFloat(t.value);
      if (!isFinite(v)) return false;
      if (k === 'scale') { if (v > 0) s.src = G.setScale(s.src, v, true); return false; }
      const L = layout(s.src), m = L.macros.get(k);
      if (!m || !m.literal) return false;
      s.src = G.edits(s.src, [{ ...m.span, t: fmt(v, 3) }]);
      return true;
    },
    action(s, act) {
      if (act === 'editgeo2d') { if (TD.geo2dOpen) TD.geo2dOpen(s.id); return; }
      if (act !== 'copygeo2d') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('TikZ Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied TikZ code';
    },
  };

  TD.geo2d = { layout, draw, sliders, libsOf, DEFAULT };
})();
