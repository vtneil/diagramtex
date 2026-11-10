// 3D geometry editor: the overlay that opens on a 3D geometry block. A palette of things to add (frames,
// points, vectors, lines, planes, angles, circles, spheres, labels); the picture drawn in 3D, where dragging
// empty space turns the view, dragging a point moves it (level, or up and down with ⇧), and clicking a line,
// face or label selects the command that drew it; that command's properties; and the tikz-3dplot code beside
// them, live both ways. Every edit is a change to the code, so untouched code is handed back as written.
// TD.geo3dEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, G = TD.geo3d, V3 = TD.V3;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const D2R = Math.PI / 180;
  const fmt = G.fmt;

  // ---------------------------------------------------------------- palette
  // each entry: [key, name, code to add (P is a free point name), mini picture code, shortcut]
  const AX = (L = 1) => `\\draw[thick, ->] (0,0,0) -- (${L},0,0) node[anchor=north east]{$x$};\n\\draw[thick, ->] (0,0,0) -- (0,${L},0) node[anchor=north west]{$y$};\n\\draw[thick, ->] (0,0,0) -- (0,0,${L}) node[anchor=south]{$z$};`;
  const mini = (body) => `\\tdplotsetmaincoords{65}{115}\n\\begin{tikzpicture}[tdplot_main_coords]\n\\draw[gray, ->] (0,0,0) -- (1,0,0);\\draw[gray, ->] (0,0,0) -- (0,1,0);\\draw[gray, ->] (0,0,0) -- (0,0,1);\n${body}\n\\end{tikzpicture}`;
  const PAL = [
    ['Frames', [
      ['axes', 'Axes', () => AX(1), `\\tdplotsetmaincoords{65}{115}\n\\begin{tikzpicture}[tdplot_main_coords]\n\\draw[thick, ->] (0,0,0) -- (1,0,0);\\draw[thick, ->] (0,0,0) -- (0,1,0);\\draw[thick, ->] (0,0,0) -- (0,0,1);\n\\end{tikzpicture}`, 'A'],
      ['rframe', 'Rotated frame', () => `\\tdplotsetrotatedcoords{30}{40}{0}\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0.8,0,0) node[anchor=north east]{$x'$};\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0.8,0) node[anchor=west]{$y'$};\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0,0.8) node[anchor=south]{$z'$};`,
        mini(`\\tdplotsetrotatedcoords{30}{40}{0}\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0.8,0,0);\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0.8,0);\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0,0.8);`), 'R'],
      ['grid', 'Grid plane', () => `\\draw[gray!60, very thin] (0,0,0) grid (1,1);`.replace(' grid (1,1)', ' -- (1,0,0) -- (1,1,0) -- (0,1,0) -- cycle (0.5,0,0) -- (0.5,1,0) (0,0.5,0) -- (1,0.5,0)'),
        mini('\\draw[gray, very thin] (0,0,0) -- (1,0,0) -- (1,1,0) -- (0,1,0) -- cycle (0.5,0,0) -- (0.5,1,0) (0,0.5,0) -- (1,0.5,0);')],
    ]],
    ['Points', [
      ['point', 'Point', (n) => `\\coordinate (${n}) at (0.6,0.5,0.5);\n\\fill (${n}) circle (0.8pt) node[above right]{$${n}$};`, mini('\\fill (0.6,0.5,0.5) circle (2.5pt);'), 'P'],
      ['spoint', 'Point (r, θ, φ)', (n) => `\\tdplotsetcoord{${n}}{0.8}{50}{40}\n\\fill (${n}) circle (0.8pt) node[above right]{$${n}$};`, mini('\\tdplotsetcoord{P}{0.8}{50}{40}\\draw[dashed] (0,0,0) -- (Pxy) -- (P);\\fill (P) circle (2.5pt);')],
      ['label', 'Label', () => `\\node at (0.5,0.5,0.5) {$A$};`, mini('\\node at (0.5,0.5,0.5) {$A$};'), 'T'],
    ]],
    ['Lines', [
      ['vector', 'Vector', (n, sel) => `\\draw[-stealth, thick, blue] (0,0,0) -- ${sel ? `(${sel})` : '(0.4,0.7,0.6)'} node[above]{$\\vec{v}$};`, mini('\\draw[-stealth, thick, blue] (0,0,0) -- (0.4,0.7,0.6);'), 'V'],
      ['segment', 'Segment', () => `\\draw (0.2,0.7,0.2) -- (0.7,0.2,0.6);`, mini('\\draw[thick] (0.2,0.7,0.2) -- (0.7,0.2,0.6);'), 'S'],
      ['proj', 'Projection', (n, sel, L) => projOf(sel, L), mini('\\draw[dashed] (0.6,0.6,0.7) -- (0.6,0.6,0) -- (0.6,0,0) (0.6,0.6,0) -- (0,0.6,0);\\fill (0.6,0.6,0.7) circle (2.5pt);')],
      ['curve', 'Space curve', () => `\\draw[blue, thick, domain=0:720, samples=120, variable=\\t] plot ({0.5*cos(\\t)}, {0.5*sin(\\t)}, {\\t/720});`, mini('\\draw[blue, thick, domain=0:720, samples=80, variable=\\t] plot ({0.5*cos(\\t)}, {0.5*sin(\\t)}, {\\t/720});')],
    ]],
    ['Surfaces', [
      ['plane', 'Plane', () => `\\filldraw[fill=blue!15, fill opacity=0.7] (0,0,0.5) -- (1,0,0.5) -- (1,1,0.5) -- (0,1,0.5) -- cycle;`, mini('\\filldraw[fill=blue!20, fill opacity=0.7] (0,0,0.5) -- (1,0,0.5) -- (1,1,0.5) -- (0,1,0.5) -- cycle;'), 'L'],
      ['triangle', 'Triangle', () => `\\filldraw[fill=orange!20, fill opacity=0.7] (1,0,0) -- (0,1,0) -- (0,0,1) -- cycle;`, mini('\\filldraw[fill=orange!30, fill opacity=0.7] (1,0,0) -- (0,1,0) -- (0,0,1) -- cycle;')],
      ['circle', 'Circle', () => `\\draw (0,0,0) circle (0.5);`, mini('\\draw[thick] (0,0,0) circle (0.6);'), 'C'],
      ['sphere', 'Sphere', () => `\\shade[tdplot_screen_coords, ball color=white, opacity=0.6] (0,0,0) circle (1);\n\\draw[dashed] (0,0,0) circle (1);`, mini('\\shade[tdplot_screen_coords, ball color=blue!20] (0,0,0) circle (0.8);')],
      ['plane3', 'Plane ax + by + cz = d', () => `% the plane a x + b y + c z = d over 0 ≤ x, y ≤ 1, and its normal (a, b, c) from the middle
\\def\\pa{1}
\\def\\pb{1}
\\def\\pc{2}
\\def\\pd{2}
\\filldraw[fill=teal!20, fill opacity=0.7, draw=teal!60!black] (0,0,{\\pd/\\pc}) -- (1,0,{(\\pd-\\pa)/\\pc}) -- (1,1,{(\\pd-\\pa-\\pb)/\\pc}) -- (0,1,{(\\pd-\\pb)/\\pc}) -- cycle;
\\draw[-stealth, thick, teal!60!black] (0.5,0.5,{(\\pd-\\pa/2-\\pb/2)/\\pc}) -- ++({0.4*\\pa/sqrt(\\pa*\\pa+\\pb*\\pb+\\pc*\\pc)},{0.4*\\pb/sqrt(\\pa*\\pa+\\pb*\\pb+\\pc*\\pc)},{0.4*\\pc/sqrt(\\pa*\\pa+\\pb*\\pb+\\pc*\\pc)}) node[above]{$\\mathbf{n}$};`,
        mini('\\filldraw[fill=teal!30, fill opacity=0.8] (0,0,1) -- (1,0,0.5) -- (1,1,0) -- (0,1,0.5) -- cycle;\\draw[-stealth, thick] (0.5,0.5,0.5) -- ++(0.2,0.2,0.4);')],
      ['fsurf', 'Surface z = f(x, y)', () => `% z = f(x, y) over -1 ≤ x, y ≤ 1 in 0.2 × 0.2 patches, drawn from the back to the front for this view
\\begin{scope}[declare function={f(\\x,\\y)=0.5*(\\x*\\x-\\y*\\y);}]
  \\foreach \\x in {-1,-0.8,...,0.8} {
    \\foreach \\y in {-1,-0.8,...,0.8} {
      \\filldraw[fill=blue!25, draw=blue!50!black, very thin] (\\x,\\y,{f(\\x,\\y)}) -- ({\\x+0.2},\\y,{f(\\x+0.2,\\y)}) -- ({\\x+0.2},{\\y+0.2},{f(\\x+0.2,\\y+0.2)}) -- (\\x,{\\y+0.2},{f(\\x,\\y+0.2)}) -- cycle;
    }
  }
\\end{scope}`,
        mini('\\begin{scope}[declare function={f(\\x,\\y)=0.5*(\\x*\\x-\\y*\\y);}]\\foreach \\x in {-0.5,-0.25,...,0.25} {\\foreach \\y in {-0.5,-0.25,...,0.25} {\\filldraw[fill=blue!30, very thin] (\\x+0.5,\\y+0.5,{0.4+f(\\x,\\y)}) -- (\\x+0.75,\\y+0.5,{0.4+f(\\x+0.25,\\y)}) -- (\\x+0.75,\\y+0.75,{0.4+f(\\x+0.25,\\y+0.25)}) -- (\\x+0.5,\\y+0.75,{0.4+f(\\x,\\y+0.25)}) -- cycle;}}\\end{scope}')],
      ['uvsurf', 'Surface (u, v)', () => `% a parametric surface (X(u, v), Y(u, v), Z(u, v)): u goes round, v down from the top; the back half first, then the front
\\begin{scope}[declare function={X(\\u,\\v)=sin(\\v)*cos(\\u); Y(\\u,\\v)=sin(\\v)*sin(\\u); Z(\\u,\\v)=cos(\\v);}]
  \\foreach \\u in {110,130,...,270} {
    \\foreach \\v in {75,60,...,0} {
      \\filldraw[fill=orange!30, draw=orange!50!black, very thin] ({X(\\u,\\v)},{Y(\\u,\\v)},{Z(\\u,\\v)}) -- ({X(\\u+20,\\v)},{Y(\\u+20,\\v)},{Z(\\u+20,\\v)}) -- ({X(\\u+20,\\v+15)},{Y(\\u+20,\\v+15)},{Z(\\u+20,\\v+15)}) -- ({X(\\u,\\v+15)},{Y(\\u,\\v+15)},{Z(\\u,\\v+15)}) -- cycle;
    }
  }
  \\foreach \\u in {-70,-50,...,90} {
    \\foreach \\v in {0,15,...,75} {
      \\filldraw[fill=orange!30, draw=orange!50!black, very thin] ({X(\\u,\\v)},{Y(\\u,\\v)},{Z(\\u,\\v)}) -- ({X(\\u+20,\\v)},{Y(\\u+20,\\v)},{Z(\\u+20,\\v)}) -- ({X(\\u+20,\\v+15)},{Y(\\u+20,\\v+15)},{Z(\\u+20,\\v+15)}) -- ({X(\\u,\\v+15)},{Y(\\u,\\v+15)},{Z(\\u,\\v+15)}) -- cycle;
    }
  }
\\end{scope}`,
        mini('\\begin{scope}[declare function={X(\\u,\\v)=0.6*sin(\\v)*cos(\\u); Y(\\u,\\v)=0.6*sin(\\v)*sin(\\u); Z(\\u,\\v)=0.6*cos(\\v);}]\\foreach \\u in {110,140,...,260} {\\foreach \\v in {60,30,0} {\\filldraw[fill=orange!40, very thin] ({X(\\u,\\v)},{Y(\\u,\\v)},{Z(\\u,\\v)}) -- ({X(\\u+30,\\v)},{Y(\\u+30,\\v)},{Z(\\u+30,\\v)}) -- ({X(\\u+30,\\v+30)},{Y(\\u+30,\\v+30)},{Z(\\u+30,\\v+30)}) -- ({X(\\u,\\v+30)},{Y(\\u,\\v+30)},{Z(\\u,\\v+30)}) -- cycle;}}\\foreach \\u in {-70,-40,...,80} {\\foreach \\v in {0,30,60} {\\filldraw[fill=orange!40, very thin] ({X(\\u,\\v)},{Y(\\u,\\v)},{Z(\\u,\\v)}) -- ({X(\\u+30,\\v)},{Y(\\u+30,\\v)},{Z(\\u+30,\\v)}) -- ({X(\\u+30,\\v+30)},{Y(\\u+30,\\v+30)},{Z(\\u+30,\\v+30)}) -- ({X(\\u,\\v+30)},{Y(\\u,\\v+30)},{Z(\\u,\\v+30)}) -- cycle;}}\\end{scope}')],
      ['graph', 'Graph z = f(x, y)', () => `% z = f(x, y) = 1.5 + 0.4((x - 1.2)^2 - (y - 1.4)^2)/0.81 over the disk D of radius 0.9 at (1.2, 1.4)
\\shade[left color=orange!60, right color=orange!10, fill opacity=0.8] (1.2,1.4,0) circle (0.9);
\\filldraw[fill=blue!30, fill opacity=0.75, draw=black!70, domain=0:360, samples=90, variable=\\t] plot ({1.2+0.9*cos(\\t)}, {1.4+0.9*sin(\\t)}, {1.5+0.4*cos(2*\\t)}) -- cycle;
\\draw[double] (1.5,1.6,0) -- (1.5,1.6,1.525) node[midway, right]{$f(x,y)$};
\\fill (1.5,1.6,0) circle (1.5pt) node[below]{$(x,y,0)$};
\\fill (1.5,1.6,1.525) circle (1.5pt);
\\draw[-stealth] (1.5,2.7,2.3) node[above right]{$(x,y,f(x,y))$} -- (1.5,1.6,1.525);`,
        mini('\\shade[left color=orange!60, right color=orange!10] (0.5,0.5,0) circle (0.45);\\filldraw[fill=blue!30, domain=0:360, samples=40, variable=\\t] plot ({0.5+0.45*cos(\\t)}, {0.5+0.45*sin(\\t)}, {0.75+0.2*cos(2*\\t)}) -- cycle;\\draw[double] (0.55,0.55,0) -- (0.55,0.55,0.75);')],
      ['box', 'Box',() => `\\draw (0,0,0) -- (1,0,0) -- (1,1,0) -- (0,1,0) -- cycle (0,0,1) -- (1,0,1) -- (1,1,1) -- (0,1,1) -- cycle (0,0,0) -- (0,0,1) (1,0,0) -- (1,0,1) (1,1,0) -- (1,1,1) (0,1,0) -- (0,1,1);`,
        mini('\\draw (0,0,0) -- (0.8,0,0) -- (0.8,0.8,0) -- (0,0.8,0) -- cycle (0,0,0.8) -- (0.8,0,0.8) -- (0.8,0.8,0.8) -- (0,0.8,0.8) -- cycle (0,0,0) -- (0,0,0.8) (0.8,0,0) -- (0.8,0,0.8) (0.8,0.8,0) -- (0.8,0.8,0.8) (0,0.8,0) -- (0,0.8,0.8);'), 'B'],
    ]],
    ['Angles', [
      ['arc', 'Angle in xy', () => `\\tdplotdrawarc{(0,0,0)}{0.3}{0}{60}{anchor=north}{$\\phi$}`, mini('\\tdplotdrawarc[thick]{(0,0,0)}{0.6}{0}{60}{}{}')],
      ['tarc', 'Angle from z', (n, sel, L) => thetaArc(sel, L), mini('\\tdplotsetthetaplanecoords{40}\\tdplotdrawarc[thick, tdplot_rotated_coords]{(0,0,0)}{0.6}{0}{50}{}{}')],
    ]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, code, m, key] of items) { ITEM[k] = { k, name, code, mini: m, key }; if (key) KEYS[key.toLowerCase()] = k; }
  // dashed lines from a point down to the xy-plane and across to the axes
  function projOf(sel, L) {
    const st = sel != null ? L.S[sel] : null, nm = st && (st.k === 'setcoord' || st.k === 'coordinate') ? st.name : null;
    if (st && st.k === 'setcoord' && !st.simple) return `\\draw[dashed] (${nm}) -- (${nm}xy) -- (${nm}x);\n\\draw[dashed] (${nm}xy) -- (${nm}y);`;
    const p = nm && L.names.get(nm) && L.names.get(nm).m ? L.names.get(nm).m : [0.6, 0.6, 0.7];
    const [x, y, z] = p.map((v) => fmt(v, 2)), a = nm ? `(${nm})` : `(${x},${y},${z})`;
    return `\\draw[dashed] ${a} -- (${x},${y},0) -- (${x},0,0);\n\\draw[dashed] (${x},${y},0) -- (0,${y},0);`;
  }
  // the angle θ from the z-axis to a point given by \tdplotsetcoord, drawn in its theta plane
  function thetaArc(sel, L) {
    const st = sel != null ? L.S[sel] : null;
    if (st && st.k === 'setcoord') {
      const t = (sp) => L.src.slice(sp.s, sp.e).trim();
      return `\\tdplotsetthetaplanecoords{${t(st.ph)}}\n\\tdplotdrawarc[tdplot_rotated_coords]{(0,0,0)}{0.4}{0}{${t(st.th)}}{anchor=south west}{$\\theta$}`;
    }
    return `\\tdplotsetthetaplanecoords{40}\n\\tdplotdrawarc[tdplot_rotated_coords]{(0,0,0)}{0.4}{0}{50}{anchor=south west}{$\\theta$}`;
  }
  const miniCache = new Map();
  function miniSvg(code) {
    if (miniCache.has(code)) return miniCache.get(code);
    const L = G.layout(code), k = Math.min(56 / (L.bb.w || 1), 36 / (L.bb.h || 1)) * L.k;
    const fit = { k, px: (p) => ({ x: p[0] * k, y: -p[1] * k }) };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of L.items) for (const p of it.pts || (it.at ? [it.at] : [])) { const q = fit.px(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const items = L.items.filter((it) => it.k !== 'text').map((it) => (it.stroke && V3.hex(it.stroke) === '#000000' ? { ...it, stroke: { c: 'currentColor', p: 100 }, w: Math.max(it.w, 1.1) } : it.k === 'line' ? { ...it, w: Math.max(it.w, 1.1) } : it));
    let body = '';
    try { body = V3.svg(items, fit, { export: true }); } catch (e) { body = ''; }
    body = body.replace(/stroke="#808080"/g, 'stroke="currentColor" stroke-opacity="0.4"').replace(/fill="currentColor"/g, 'fill="currentColor"');
    const out = `<svg class="zxmini" viewBox="${r2(x0 - 3)} ${r2(y0 - 3)} ${r2(x1 - x0 + 6)} ${r2(y1 - y0 + 6)}" aria-hidden="true">${body}</svg>`;
    miniCache.set(code, out);
    return out;
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'g3Modal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="g3Title">
    <div class="modal-head">
      <strong id="g3Title">3D geometry</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ge="delete" title="Delete the selection (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ge="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-ge="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-ge="fit" title="Fit the picture in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ge="cancel">Cancel</button>
      <button class="primary" data-ge="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list g3-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg g3-svg" aria-label="3D geometry"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>tikz-3dplot</span><small class="cz-count"></small><button class="flat" data-ge="copy" title="Copy the tikz-3dplot code">Copy</button></div>
          <textarea spellcheck="false" aria-label="tikz-3dplot code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.g3-svg', root), stage = $('.cz-stage', root), list = $('.g3-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { src, sel: statement index | null, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E = null, lastDown = { t: 0, x: 0, y: 0 };
  const L = () => G.layout(E.src);
  function begin() { if (E.pending == null) E.pending = E.src; }
  function commit() {
    if (E.pending == null) return;
    if (E.src !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  // a change to the code; keepSel: the selected statement stays the one at the same place in the list
  function edit(fn) { begin(); const r = fn(); if (typeof r === 'string') E.src = r; commit(); clampSel(); draw(); renderProps(); }
  function restore(src) { E.src = src; clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(E.src); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(E.src); restore(E.redo.pop()); }
  const drawable = (st) => st && !['comment', 'begin', 'end', 'raw'].includes(st.k);
  function clampSel() { if (E.sel != null && !drawable(L().S[E.sel])) E.sel = null; }
  const selSt = () => (E.sel != null ? L().S[E.sel] || null : null);
  const text = (sp) => E.src.slice(sp.s, sp.e);

  // ---------------------------------------------------------------- adding
  function freeName(Lx) {
    for (const n of ['P', 'Q', 'R', 'A', 'B', 'C', 'D', 'U', 'W']) if (!Lx.names.has(n)) return n;
    let i = 1; while (Lx.names.has('P' + i)) i++; return 'P' + i;
  }
  // new code goes after the selected command, or at the end of the picture
  function insertAt(Lx) {
    const st = selSt();
    if (st && st.k !== 'main') return { at: st.e, lead: '\n' + indentOf(st.s) };
    const e = Lx.end != null ? Lx.S[Lx.end] : null;
    if (e) { let s = e.s; while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--; return { at: s, lead: '', trail: '\n', ind: indentOf(Lx.S[Lx.end - 1] ? Lx.S[Lx.end - 1].s : e.s) || '  ' }; }
    return { at: E.src.length, lead: '\n', ind: '' };
  }
  function indentOf(i) { let s = i; while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--; return E.src.slice(s, i); }
  function add(key) {
    const it = ITEM[key], Lx = L(), nm = freeName(Lx);
    const selName = (() => { const st = selSt(); return st && (st.k === 'coordinate' || st.k === 'setcoord') ? st.name : null; })();
    const code = it.code(nm, key === 'vector' ? selName : E.sel, Lx);
    const pos = insertAt(Lx), ind = pos.ind ?? (pos.lead.replace('\n', '') || '  ');
    const lines = code.split('\n').map((l) => ind + l).join('\n');
    const ins = pos.trail ? lines + pos.trail : pos.lead + lines.replace(/^[ \t]*/, ind.length ? '' : '').replace(/^/, pos.lead ? '' : '');
    const before = E.src;
    edit(() => before.slice(0, pos.at) + (pos.trail ? lines + '\n' : '\n' + lines) + before.slice(pos.at));
    // select the first drawn command of what was added
    const L2 = L(), at = pos.at + (pos.trail ? 0 : 1);
    const i = L2.S.findIndex((st) => st.s >= at && drawable(st) && !['macro', 'rot', 'tplane'].includes(st.k) && (st.k !== 'coordinate' || key === 'point'));
    E.sel = i >= 0 ? i : null;
    draw(); renderProps();
    setTip(`${it.name} added`);
    setTimeout(() => { if (E && tip.textContent === `${it.name} added`) setTip(''); }, 1200);
  }
  // a statement's span with the line it sits on, so deleting leaves no blank line
  function lineSpan(st) {
    let s = st.s, e = st.e;
    while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--;
    while (e < E.src.length && /[ \t]/.test(E.src[e])) e++;
    if ((s === 0 || E.src[s - 1] === '\n') && E.src[e] === '\n') e++;
    return { s, e };
  }
  function deleteSel() {
    const st = selSt();
    if (!st) return;
    if (st.k === 'main') { setTip('The view stays: turn it instead'); return; }
    // a point goes with the commands that draw it (by its name), as the code would no longer compile
    const Lx = L(), del = [E.sel];
    const nm = st.k === 'coordinate' || st.k === 'setcoord' ? st.name : null;
    if (nm) {
      const re = new RegExp(`\\((\\s*${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(xy|xz|yz|x|y|z)?\\s*)\\)`);
      Lx.S.forEach((x, i) => { if (i !== E.sel && drawable(x) && x.k !== 'macro' && re.test(E.src.slice(x.s, x.e))) del.push(i); });
    }
    edit(() => G.edits(E.src, del.map((i) => ({ ...lineSpan(Lx.S[i]), t: '' }))));
    E.sel = null; draw(); renderProps();
  }
  function duplicate() {
    const st = selSt();
    if (!st || st.k === 'main' || st.k === 'macro') return;
    const sp = lineSpan(st), body = E.src.slice(sp.s, sp.e);
    edit(() => E.src.slice(0, sp.e) + (body.endsWith('\n') ? body : '\n' + body) + E.src.slice(sp.e));
    const L2 = L(); E.sel = L2.S.findIndex((x) => x.s > st.s && drawable(x)); if (E.sel < 0) E.sel = null;
    draw(); renderProps();
  }
  // draw order: swap with the next / previous drawn command
  function reorder(dir) {
    const Lx = L(), i = E.sel;
    if (i == null) return;
    let j = i + dir;
    while (Lx.S[j] && (Lx.S[j].k === 'comment')) j += dir;
    const a = Lx.S[i], b = Lx.S[j];
    if (!b || !drawable(b) || b.k === 'main') return;
    const [x, y] = dir > 0 ? [a, b] : [b, a];
    edit(() => E.src.slice(0, x.s) + E.src.slice(y.s, y.e) + E.src.slice(x.e, y.s) + E.src.slice(x.s, x.e) + E.src.slice(y.e));
    E.sel = j; draw(); renderProps();
  }

  // ---------------------------------------------------------------- palette
  function sizeMinis(el) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(1.4, 60 / vw, 38 / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    for (const [title, items] of PAL) {
      const hits = items.filter(([k, name]) => !q || `${name} ${k} ${title}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , m, key]) =>
        `<button class="qe-item" data-item="${esc(k)}" title="${esc(name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${miniSvg(m)}</span><span>${esc(name)}</span></button>`).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) add(b.dataset.item); search.blur(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.qe-item'); if (b && E) add(b.dataset.item); });
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const fitOf = () => ({ k: E.view.k, px: (p) => ({ x: E.view.ox + p[0] * E.view.k, y: E.view.oy - p[1] * E.view.k }) });
  const S = (p) => { const q = fitOf().px(p); return [q.x, q.y]; };
  function fit() {
    const Lx = L(), r = rect();
    if (Lx.empty) { E.view = { k: 120, ox: r.width / 2, oy: r.height / 2 }; draw(); return; }
    // bounds in projected units
    const b = Lx.bb, k0 = Lx.k, w = b.w / k0, h = b.h / k0, cx = (b.x + b.w / 2) / k0, cy = -(b.y + b.h / 2) / k0;
    const k = Math.max(20, Math.min(900, Math.min((r.width - 100) / w, (r.height - 100) / h)));
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 + cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(2000, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Lb) Lb.pop.place();
  }, { passive: false });
  // what is under the pointer: a point handle first, then the topmost drawn item
  function handleAt(e, px = 9) {
    const Lx = L(), [x, y] = pos(e);
    let best = null, bd = px;
    for (const h of Lx.handles) {
      const [X, Y] = S(h.at.s), d = Math.hypot(X - x, Y - y) - (h.kind !== 'lit' ? 1.5 : 0);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function itemAt(e) {
    const Lx = L(), [x, y] = pos(e), f = fitOf();
    const items = Lx.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.k === 'text') {
        const b = TD.textBox(it.text, V3.NORMAL), q = G.labelAt(it, S(it.at), b);
        if (Math.abs(x - q[0]) <= b.w / 2 + 3 && Math.abs(y - q[1]) <= b.h / 2 + 3) return it.si;
      } else if (it.k === 'line') {
        const P = it.pts.map(S);
        for (let j = 1; j < P.length; j++) if (segDist(x, y, P[j - 1], P[j]) <= 5) return it.si;
      } else if (it.k === 'ball') {
        const [X, Y] = S(it.at); if (Math.hypot(X - x, Y - y) <= it.r * f.k) return it.si;
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.k === 'poly' && inside(it.pts.map(S), x, y)) return it.si;
    }
    return null;
  }
  const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); };
  function inside(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  // a screen position back to 3D: on the level plane z = z0 through the point, or (up) along z from m0
  function unproject(vw, sx, sy, m0, up, d0) {
    const X = (sx - E.view.ox) / E.view.k, Y = (E.view.oy - sy) / E.view.k;
    if (up) { const dz = (d0[1] - sy) / E.view.k / Math.max(0.15, vw.st); return [m0[0], m0[1], m0[2] + dz]; }
    const z = m0[2], ct = Math.abs(vw.ct) < 0.12 ? 0.12 * Math.sign(vw.ct || 1) : vw.ct;
    const u = (Y - z * vw.st) / ct;
    return [X * vw.cp - u * vw.sp, X * vw.sp + u * vw.cp, z];
  }
  const snapV = (v, on) => (on ? Math.round(v * 20) / 20 : Math.round(v * 1000) / 1000);

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, Lx = L(), f = fitOf();
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    // the xy-plane's unit grid, faint, for orientation
    const vw = Lx.view, g = [];
    for (let i = -2; i <= 2; i++) { g.push([[i, -2, 0], [i, 2, 0]]); g.push([[-2, i, 0], [2, i, 0]]); }
    out += `<path class="g3-grid" d="${g.map(([a, b]) => { const A = S(vw.P(a)), B = S(vw.P(b)); return `M${r2(A[0])},${r2(A[1])}L${r2(B[0])},${r2(B[1])}`; }).join('')}"/>`;
    // the selected command, as a halo under the drawing
    if (E.sel != null) {
      for (const it of Lx.items) {
        if (it.si !== E.sel) continue;
        if (it.k === 'line' || it.k === 'poly') out += `<path class="ze-wsel" d="${it.pts.map((p, i) => { const q = S(p); return `${i ? 'L' : 'M'}${r2(q[0])},${r2(q[1])}`; }).join('')}${it.k === 'poly' ? 'Z' : ''}" stroke-width="9"/>`;
        else if (it.k === 'text') { const b = TD.textBox(it.text, V3.NORMAL), q = G.labelAt(it, S(it.at), b); out += `<rect class="g3-tsel" x="${r2(q[0] - b.w / 2 - 3)}" y="${r2(q[1] - b.h / 2 - 2)}" width="${r2(b.w + 6)}" height="${r2(b.h + 4)}" rx="4"/>`; }
        else if (it.k === 'ball') { const q = S(it.at); out += `<circle class="ze-wsel" cx="${r2(q[0])}" cy="${r2(q[1])}" r="${r2(it.r * f.k)}" stroke-width="9"/>`; }
      }
    }
    if (!Lx.empty) { try { out += V3.svg(Lx.items, f, { export: true }); } catch (e) { /* drawn next time */ } }
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">Add axes or a point from the left to start</text>`;
    // points that can be dragged
    for (const h of Lx.handles) {
      const [X, Y] = S(h.at.s), on = E.sel === h.si, hov = E.hover && E.hover.h === h;
      if (on) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="7"/>`;
      else if (hov) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}" r="7"/>`;
      out += `<circle class="${h.kind === 'lit' ? 'g3-lit' : 'g3-pt'}${h.writable ? '' : ' off'}" cx="${r2(X)}" cy="${r2(Y)}" r="${h.kind === 'lit' ? 2.5 : 3.2}"/>`;
    }
    // a point being moved: its shadow on the xy-plane, so its height reads
    const d = E.drag;
    if (d && d.mode === 'move' && d.moved && d.m) {
      const A = S(vw.P(d.m)), B = S(vw.P([d.m[0], d.m[1], 0]));
      out += `<path class="g3-drop" d="M${r2(A[0])},${r2(A[1])}L${r2(B[0])},${r2(B[1])}"/><circle class="g3-shadow" cx="${r2(B[0])}" cy="${r2(B[1])}" r="2.5"/>`;
    }
    // the view's turn, bottom left: the three axes as they now point
    const O = [44, H - 40], ax = [[1, 0, 0, 'x'], [0, 1, 0, 'y'], [0, 0, 1, 'z']];
    out += `<g class="g3-gizmo">${ax.map(([a, b, c, n]) => { const p = vw.P([a, b, c]); const X = O[0] + p[0] * 22, Y = O[1] - p[1] * 22; return `<path d="M${O[0]},${O[1]}L${r2(X)},${r2(Y)}"/><text x="${r2(O[0] + p[0] * 31)}" y="${r2(O[1] - p[1] * 31 + 4)}">${n}</text>`; }).join('')}<text class="g3-ang" x="${O[0] + 34}" y="${O[1] + 28}">θ ${fmt(vw.th, 0)}°  φ ${fmt(vw.ph, 0)}°</text></g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const h = handleAt(e);
    if (h) {
      E.sel = h.si;
      E.drag = h.writable ? { mode: 'move', h, sx, sy, m0: h.at.m.slice(), m: null, moved: false, si: h.si } : null;
      if (!h.writable) setTip('This point is computed in the code: change it there');
      draw(); renderProps(); return;
    }
    const si = itemAt(e);
    if (si != null) {
      if (dbl && E.sel === si) { editLabel(si); return; }
      E.sel = si; E.drag = null; draw(); renderProps(); return;
    }
    // empty space: turn the view
    const vw = L().view;
    E.sel = null; E.drag = { mode: 'orbit', sx, sy, th: vw.th, ph: vw.ph, idle: true };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const h = handleAt(e), si = h ? null : itemAt(e);
      const hv = h ? { h } : si != null ? { si } : null;
      const ch = (hv && hv.h) !== (E.hover && E.hover.h);
      E.hover = hv;
      svg.style.cursor = h ? (h.writable ? 'move' : 'not-allowed') : si != null ? 'pointer' : 'grab';
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') { E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return; }
    if (d.mode === 'orbit') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (d.idle) { begin(); d.idle = false; svg.style.cursor = 'grabbing'; }
      const th = Math.max(0, Math.min(180, Math.round(d.th - (sy - d.sy) * 0.4))), ph = Math.round(d.ph - (sx - d.sx) * 0.4);
      E.src = G.setView(E.src, th, ph);
      setTip(`θ ${th}°  φ ${ph}°  ·  drag to turn the view`);
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; d.src0 = E.src; }
      // the edits are made against the code as it was when the drag started
      const L0 = G.layout(d.src0), h = L0.handles.find((x) => x.si === d.si && Math.hypot(x.at.s[0] - d.h.at.s[0], x.at.s[1] - d.h.at.s[1]) < 1e-9) || d.h;
      const up = e.shiftKey, snap = !e.altKey;
      if (up !== d.up) { d.up = up; d.sx = sx; d.sy = sy; d.m0 = d.m || d.m0; }
      const S0 = S(L0.view.P(d.m0));
      let m = unproject(L0.view, S0[0] + (sx - d.sx), S0[1] + (sy - d.sy), d.m0, up, [d.sx, d.sy]);
      if (up) m = [d.m0[0], d.m0[1], snapV(m[2], snap)];
      else m = [snapV(m[0], snap), snapV(m[1], snap), d.m0[2]];
      d.m = m;
      E.src = G.edits(d.src0, G.moveHandle(L0, h, m));
      setTip(`(${m.map((v) => fmt(v, 2)).join(', ')})  ·  ${up ? 'up and down' : '⇧ moves up and down'}${snap ? ' · ⌥ places freely' : ''}`);
      draw(); renderProps(); return;
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    svg.style.cursor = '';
    if ((d.mode === 'orbit' && !d.idle) || (d.mode === 'move' && d.moved)) { setTip(''); commit(); renderProps(); }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });

  // right-click: the command's actions
  const MI = {
    label: '<path d="M4 15l2-5 6-6 3 3-6 6zM11 5l3 3"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    dup: '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 12V5.5A1.5 1.5 0 015.5 4H12"/>',
    fwd: '<path d="M10 16V4M5 9l5-5 5 5"/>',
    back: '<path d="M10 4v12M5 11l5 5 5-5"/>',
  };
  const mItem = (act, label, icon, key) => `<button class="ctx-item${act === 'del' ? ' danger' : ''}" data-gm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const h = handleAt(e), si = h ? h.si : itemAt(e);
    if (si == null) { closeMenu(); return; }
    E.sel = si;
    const st = selSt();
    menu.innerHTML = (labelOf(si) ? mItem('label', 'Edit Label', 'label', '↩') : '') + mItem('dup', 'Duplicate', 'dup', isMac ? '⌘D' : 'Ctrl+D') + '<hr>'
      + mItem('fwd', 'Draw Later', 'fwd', ']') + mItem('back', 'Draw Earlier', 'back', '[') + '<hr>' + mItem('del', st && (st.k === 'coordinate' || st.k === 'setcoord') ? 'Delete Point' : 'Delete', 'del', '⌫');
    draw(); renderProps();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-gm]'); if (!b) return; closeMenu(); act(b.dataset.gm); });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- labels
  // a command's label: the text of its (last) node, or of the arc / node statement itself
  function labelOf(si) {
    const Lx = L(), st = Lx.S[si];
    if (!st) return null;
    if (st.k === 'node' && st.text) return { span: st.text };
    if (st.k === 'arc') return { span: st.text };
    if (st.k === 'path') { const nodes = st.els.filter((x) => x.t === 'node' && x.text); if (nodes.length) return { span: nodes[nodes.length - 1].text, node: nodes[nodes.length - 1] }; }
    return null;
  }
  const mathOf = (t) => { const m = /^\s*\$([\s\S]*)\$\s*$/.exec(t); return m ? m[1] : t; };
  const wrapMath = (t) => (String(t).trim() ? `$${t.trim()}$` : '');
  // write a label (math) for a command: into its node, or as a new node at the end of a path
  function setLabel(src, si, t) {
    const Lx = G.layout(src), st = Lx.S[si], lb = labelOf(si);
    if (lb) return G.edits(src, [{ ...lb.span, t: wrapMath(t) }]);
    if (st && st.k === 'path' && t) return G.edits(src, [{ s: st.e - 1, e: st.e - 1, t: ` node[above]{${wrapMath(t)}}` }]);
    if (st && (st.k === 'coordinate' || st.k === 'setcoord') && t) {
      const sp = lineSpan(st);
      const line = `${indentOf(st.s)}\\node[above right] at (${st.name}) {${wrapMath(t)}};`;
      return src.slice(0, sp.e) + (src[sp.e - 1] === '\n' ? '' : '\n') + line + (src[sp.e - 1] === '\n' ? '\n' : '') + src.slice(sp.e);
    }
    return src;
  }
  let Lb = null;
  function editLabel(si) {
    if (!TD.input) return false;
    const st = L().S[si];
    if (!st || !(labelOf(si) || st.k === 'path' || st.k === 'coordinate' || st.k === 'setcoord')) return false;
    closeLabel();
    begin();
    const lb = labelOf(si), me = (Lb = { si, base: E.src });
    me.pop = TD.input.popup(stage, {
      text: lb ? mathOf(text(lb.span)) : '', math: true, bare: true,
      at: () => labelPos(si),
      onInput: (t) => { E.src = setLabel(me.base, si, t); draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(si) {
    const Lx = L(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    const t = Lx.items.find((it) => it.si === si && it.k === 'text') || Lx.items.find((it) => it.si === si && (it.pts || it.at));
    const h = Lx.handles.find((x) => x.si === si);
    const p = t ? (t.at || t.pts[t.pts.length - 1]) : h ? h.at.s : [0, 0];
    const [X, Y] = S(p);
    return [vr.left - sr.left + X, vr.top - sr.top + Y + 16];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div>`);
  const seg = (f, cur, opts) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-fs="${f}" data-v="${esc(String(v))}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}>${n}</button>`).join('')}</div>`;
  const CNAMES = ['black', 'darkgray', 'gray', 'lightgray', 'white', 'red', 'orange', 'yellow', 'lime', 'green', 'olive', 'teal', 'cyan', 'blue', 'violet', 'purple', 'magenta', 'pink', 'brown'];
  const sw = (c) => TD.css(TD.tikzColor(c) || '#000000');
  const colorSel = (f, v, none) => { const opts = (none ? ['none'] : []).concat(CNAMES.includes(v) || (none && v === 'none') ? CNAMES : CNAMES.concat([v])); return `<div class="ctl swsel"><span class="sw" style="background:${v === 'none' ? 'transparent' : sw(v)}"></span><select data-f="${f}" aria-label="Colour">${opts.map((c) => `<option value="${esc(c)}"${c === 'none' ? '' : ` data-swatch="${sw(c)}"`}${c === v ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`; };
  const NUMRE = /^-?(\d+\.?\d*|\.\d+)$/;
  // a value field: numbers type straight in; an expression or macro is typed as code
  const valField = (label, f, sp) => field(label, f, text(sp).trim(), ' class="mono"');
  const COLORK = (o) => o.v == null && !!TD.tikzColor(o.k) && !G.WIDTHS[o.k];
  const WIDTH_OPTS = [['ultra thin', 'Ultra thin'], ['very thin', 'Very thin'], ['thin', 'Thin'], ['', 'Normal'], ['semithick', 'Semithick'], ['thick', 'Thick'], ['very thick', 'Very thick'], ['ultra thick', 'Ultra thick']];
  const NAMES = { coordinate: 'Point', setcoord: 'Point (r, θ, φ)', node: 'Label', arc: 'Angle arc', rot: 'Rotated frame', rorig: 'Frame origin', rreset: 'Frame origin', tplane: 'Theta plane', main: 'View', macro: 'Value', cmd: 'Command', foreach: 'Loop', scope: 'Scope' };
  function pathName(st) {
    const sty = G.styleOf(E.src, st.o), els = st.els;
    if (sty.ball) return 'Sphere';
    if (els.some((x) => x.t === 'plot')) return 'Curve';
    if (els.some((x) => x.t === 'circle')) return els.filter((x) => x.t === 'pt').length > 1 ? 'Path' : 'Circle';
    if (els.some((x) => x.t === 'cycle')) return st.cmd === 'draw' && !sty.fillOn ? 'Polygon' : 'Face';
    if (sty.arrow || sty.arrow0) return 'Vector';
    const n = els.filter((x) => x.t === 'pt').length;
    return n === 2 ? 'Segment' : 'Path';
  }
  function renderProps() {
    if (!E) return;
    const Lx = L(), st = selSt();
    if (!st) {
      const vw = Lx.view;
      TD.morph(props, `<div class="sec"><div class="sec-title">Figure <small>${Lx.S.filter(drawable).length} commands</small></div>
        ${row('Tilt θ', `<div class="ctl unit"><input type="number" data-f="vth" value="${fmt(vw.th, 0)}" step="5" min="0" max="180"><span>°</span></div>`)}
        ${row('Turn φ', `<div class="ctl unit"><input type="number" data-f="vph" value="${fmt(vw.ph, 0)}" step="5"><span>°</span></div>`)}
        ${row('Scale', `<div class="ctl"><input type="number" data-f="scale" value="${fmt(Lx.scale, 2)}" step="0.25" min="0.1"></div>`)}
        <div class="help">Drag empty space to turn the view. Drag a point to move it level; hold <kbd>⇧</kbd> to move it up and down, <kbd>⌥</kbd> to place it freely. Click a line, face or label to select what drew it; double-click to label it. Add things from the left.</div></div>`);
      return;
    }
    const title = st.k === 'path' ? pathName(st) : NAMES[st.k] || 'Command';
    let body = '';
    if (st.k === 'coordinate' && st.atPt) {
      const comps = G.splitTop(E.src, st.atPt.is, st.atPt.ie);
      body += field('Name', 'cname', st.name, ' class="mono"');
      if (comps.length === 3) body += comps.map((c, i) => valField('xyz'[i], `c${i}`, c)).join('');
      else body += valField('At', 'at', { s: st.atPt.is, e: st.atPt.ie });
      body += field('Label', 'label', '', ' data-tx="math" placeholder="add a label"');
    } else if (st.k === 'setcoord') {
      body += field('Name', 'cname', st.name, ' class="mono"') + valField('r', 'sr', st.r) + valField('θ from z', 'sth', st.th) + valField('φ from x', 'sph', st.ph);
      body += `<div class="help">${st.simple ? '' : `Also names its shadows (${esc(st.name)}xy), (${esc(st.name)}x), (${esc(st.name)}y), (${esc(st.name)}z)… for projections. `}Drag the point, or type a number or a value such as \\thetavec.</div>`;
    } else if (st.k === 'path' || st.k === 'node' || st.k === 'arc') {
      const sty = G.styleOf(E.src, st.o), O = sty.items;
      const colorItem = O.find((o) => o.k === 'color' && o.v != null) || O.find(COLORK);
      const color = colorItem ? (colorItem.v != null ? colorItem.v : colorItem.k) : 'black';
      const fillItem = O.find((o) => o.k === 'fill' && o.v != null);
      const fill = fillItem ? fillItem.v : st.cmd === 'fill' || st.cmd === 'filldraw' ? color : 'none';
      const lb = labelOf(E.sel);
      if (st.k === 'path') {
        const pts = st.els.filter((x) => x.t === 'pt');
        body += `<div class="g3-pts">${pts.map((p, i) => { const c = G.splitTop(E.src, p.is, p.ie); return c.length === 3 && !p.rel ? `<div class="g3-pt-row"><span>${i + 1}</span>${c.map((x, j) => `<input type="text" class="mono" data-f="p${i}:${j}" value="${esc(x.t)}" aria-label="${'xyz'[j]} of point ${i + 1}" spellcheck="false">`).join('')}</div>` : `<div class="g3-pt-row"><span>${i + 1}</span><input type="text" class="mono wide" data-f="p${i}" value="${esc(E.src.slice(p.is, p.ie))}" aria-label="Point ${i + 1}" spellcheck="false"></div>`; }).join('')}</div>`;
      } else if (st.k === 'node' && st.atPt) body += valField('At', 'at', { s: st.atPt.is, e: st.atPt.ie });
      else if (st.k === 'arc') body += valField('Centre', 'ac', st.c) + valField('Radius', 'ar', st.r) + valField('From', 'a0', st.a0) + valField('To', 'a1', st.a1);
      body += row('Colour', colorSel(st.k === 'node' ? 'tcolor' : 'color', color));
      if (st.k === 'path') {
        // a shading (left/right, top/bottom, inner/outer colours) is its fill: shown, set in Options
        if (sty.shade) body += row('Fill', `<div class="ctl"><input type="text" class="mono" readonly tabindex="-1" value="${esc(O.filter((o) => / color$/.test(o.k)).map((o) => o.t).join(', '))}" title="A shading: change its colours in Options"></div>`);
        else body += row('Fill', colorSel('fill', fill, true));
        const op = O.find((o) => o.k === 'fill opacity' || o.k === 'opacity');
        body += row('Opacity', `<div class="ctl"><input type="number" data-f="opacity" value="${op ? esc(op.v) : 1}" min="0" max="1" step="0.1"></div>`);
      }
      if (st.k !== 'node') {
        const w = (O.find((o) => o.v == null && G.WIDTHS[o.k] != null) || { k: '' }).k;
        body += row('Line', seg('dash', sty.dash ? (/dot/.test(sty.dash) ? 'dotted' : 'dashed') : '', [['', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]));
        body += row('Width', `<div class="ctl"><select data-f="width">${WIDTH_OPTS.map(([v, n]) => `<option value="${v}"${v === w ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`);
        if (st.k === 'path') body += row('Arrow', seg('arrow', `${sty.arrow0 ? 1 : 0}${sty.arrow ? 1 : 0}`, [['00', 'None'], ['01', 'End'], ['10', 'Start'], ['11', 'Both']]));
        body += row('Frame', seg('frame', sty.frame || 'main', [['main', 'Main', 'tdplot_main_coords'], ['rotated', 'Rotated', 'tdplot_rotated_coords: the frame set by \\tdplotsetrotatedcoords'], ['screen', 'Screen', 'tdplot_screen_coords: flat on the page']]));
      }
      body += field('Label', 'label', lb ? mathOf(text(lb.span)) : '', ' data-tx="math" placeholder="none"');
      if (lb || st.k === 'node' || st.k === 'arc') {
        const lo = st.k === 'arc' ? G.styleOf(E.src, st.lo) : G.styleOf(E.src, lb && lb.node ? lb.node.o : st.o);
        const posv = Object.entries(G.POS).find(([, a]) => a === lo.anchor);
        body += row('Position', `<div class="ctl"><select data-f="lpos">${[['', 'Centre']].concat(Object.keys(G.POS).map((k) => [k, k[0].toUpperCase() + k.slice(1)])).map(([v, n]) => `<option value="${v}"${(posv ? posv[0] : '') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`);
      }
      const known = (o) => COLORK(o) || ['color', 'fill', 'opacity', 'fill opacity', 'draw opacity'].includes(o.k) || G.WIDTHS[o.k] != null || ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k) || /^tdplot_/.test(o.k) || (o.v == null && /-/.test(o.k) && !/_/.test(o.k));
      body += field('Options', 'rest', O.filter((o) => !known(o)).map((o) => o.t).join(', '), ' class="mono" placeholder="other TikZ options"');
    } else if (st.k === 'foreach') body += field('Values', 'fl', text(st.list), ' class="mono"') + `<div class="help">Repeats its body for each value of ${st.vars.map((v) => `<code>\\${esc(v)}</code>`).join(', ')}; <code>a,b,...,c</code> counts from a to c in steps of b − a. Its parts are drawn but not dragged: change them in the code.</div>`;
    else if (st.k === 'scope') body += (st.o ? field('Options', 'so', text(st.o), ' class="mono"') : '') + '<div class="help">Its options (colours, frames, <code>declare function</code>) apply to everything inside.</div>';
    else if (st.k === 'rot') body += valField('α about z', 'ra', st.a) + valField('β about y', 'rb', st.b) + valField('γ about z', 'rg', st.g) + '<div class="help">Euler angles (z, y, z) of the frame that <code>tdplot_rotated_coords</code> draws in, from here on.</div>';
    else if (st.k === 'tplane') body += valField('φ', 'tp', st.ph) + '<div class="help">From here on, <code>tdplot_rotated_coords</code> is the plane through the z-axis at angle φ: its x-axis is z, so an arc from 0 to θ there measures the angle from z.</div>';
    else if (st.k === 'rorig') body += valField('Origin', 'ro', st.at);
    else if (st.k === 'macro') body += field('Value', 'mv', text(st.v), ' class="mono"') + `<div class="help">Used as <code>\\${esc(st.name)}</code>. Dragging a point that uses it changes it here.</div>`;
    else if (st.k === 'main') body += valField('Tilt θ', 'mth', st.th) + valField('Turn φ', 'mph', st.ph);
    else body += '<div class="help">Kept in the code as written.</div>';
    const del = st.k === 'main' ? '' : `<div class="row"><button data-ge="dup">Duplicate</button><button class="danger" data-ge="del">${st.k === 'coordinate' || st.k === 'setcoord' ? 'Delete Point' : 'Delete'}</button></div>`;
    TD.morph(props, `<div class="sec"><div class="sec-title">${esc(title)} <small>line ${E.src.slice(0, st.s).split('\n').length}</small></div>${body}${del}</div>`);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { begin(); E.base = E.src; } });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { E.base = null; commit(); renderProps(); } });
  // each keystroke rewrites the code from what it was when the field took focus, so a field never fights itself
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f || !E) return;
    const base = E.base != null ? E.base : E.src;
    const out = applyField(base, f, t.value);
    if (out == null) return;
    E.src = out; clampSel(); draw();
    if (t.tagName === 'SELECT') { commit(); E.base = E.src; begin(); renderProps(); }
  });
  function applyField(src, f, v) {
    const Lx = G.layout(src), st = E.sel != null ? Lx.S[E.sel] : null;
    const val = v.trim();
    const sp = (x) => [{ s: x.s, e: x.e, t: val }];
    if (f === 'vth' || f === 'vph') { const n = parseFloat(v); if (!isFinite(n)) return null; return G.setView(src, f === 'vth' ? n : Lx.view.th, f === 'vph' ? n : Lx.view.ph); }
    if (f === 'scale') { const n = parseFloat(v); if (!(n > 0)) return null; return G.setScale(src, n); }
    if (!st) return null;
    if (!val && !/^(label|rest)$/.test(f)) return null;
    if (f === 'label') return setLabel(src, E.sel, v);
    if (f === 'cname') {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(val) || (val !== st.name && Lx.names.has(val))) return null;
      // the name, and every (name…) that refers to it
      const re = new RegExp(`\\((\\s*)${st.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(xy|xz|yz|x|y|z)?(\\s*)\\)`, 'g');
      const ed = [{ ...st.nameSpan || findName(src, st), t: val }];
      let m; const body = src;
      while ((m = re.exec(body))) if (m.index >= st.e || m.index < st.s) ed.push({ s: m.index, e: m.index + m[0].length, t: `(${m[1]}${val}${m[2] || ''}${m[3]})` });
      return G.edits(src, ed);
    }
    if (/^c\d$/.test(f)) { const c = G.splitTop(src, st.atPt.is, st.atPt.ie)[+f[1]]; return c ? G.edits(src, sp(c)) : null; }
    if (f === 'at') { const a = st.atPt || null; return a ? G.edits(src, [{ s: a.is, e: a.ie, t: val }]) : null; }
    const SP = { sr: st.r, sth: st.th, sph: st.ph, ac: st.c, ar: st.r, a0: st.a0, a1: st.a1, ra: st.a, rb: st.b, rg: st.g, tp: st.ph, ro: st.at, mth: st.th, mph: st.ph, mv: st.v, fl: st.list, so: st.o };
    if (SP[f]) return G.edits(src, sp(SP[f]));
    const pm = /^p(\d+)(?::(\d))?$/.exec(f);
    if (pm) {
      const p = st.els.filter((x) => x.t === 'pt')[+pm[1]];
      if (!p) return null;
      if (pm[2] == null) return G.edits(src, [{ s: p.is, e: p.ie, t: val }]);
      const c = G.splitTop(src, p.is, p.ie)[+pm[2]];
      return c ? G.edits(src, sp(c)) : null;
    }
    const opt = (match, txt) => G.edits(src, G.setOpt(Lx, st, match, txt));
    if (f === 'color' || f === 'tcolor') return opt((o) => (o.k === 'color' && o.v != null) || COLORK(o), val === 'black' ? null : f === 'tcolor' ? `text=${val}` : val);
    if (f === 'fill') {
      if (st.k !== 'path') return null;
      let s2 = opt((o) => o.k === 'fill', val === 'none' ? null : `fill=${val}`);
      // \fill with no fill is just a \draw; a \draw that gains a fill keeps its outline
      if (val === 'none' && st.cmd === 'fill') s2 = s2.slice(0, st.s) + '\\draw' + s2.slice(st.s + 5);
      return s2;
    }
    if (f === 'opacity') { const n = parseFloat(v); if (!isFinite(n)) return null; return opt((o) => o.k === 'fill opacity' || o.k === 'opacity', n >= 1 ? null : `${st.cmd === 'shade' ? 'opacity' : 'fill opacity'}=${fmt(n, 2)}`); }
    if (f === 'width') return opt((o) => o.v == null && G.WIDTHS[o.k] != null, val || null);
    if (f === 'lpos') {
      const lb = labelOf(E.sel);
      const anchorText = val ? val : null;
      const posMatch = (o) => G.POS[o.k] || o.k === 'anchor';
      if (st.k === 'arc') return G.edits(src, [{ ...st.lo, t: val ? `anchor=${G.POS[val]}` : '' }]);
      if (st.k === 'node') return opt(posMatch, anchorText);
      if (lb && lb.node) {
        if (lb.node.o) return G.edits(src, G.setOpt(Lx, lb.node, posMatch, anchorText));
        return anchorText ? G.edits(src, [{ s: lb.node.e - (src.slice(lb.node.s, lb.node.e).length - 4), e: lb.node.s + 4, t: `[${anchorText}]` }]) : null;
      }
      return null;
    }
    if (f === 'rest') {
      const sty = G.styleOf(src, st.o), O = sty.items;
      const known = (o) => COLORK(o) || ['color', 'fill', 'opacity', 'fill opacity', 'draw opacity'].includes(o.k) || G.WIDTHS[o.k] != null || ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k) || /^tdplot_/.test(o.k) || (o.v == null && /-/.test(o.k) && !/_/.test(o.k));
      const keep = O.filter(known).map((o) => o.t), all = keep.concat(val ? [val] : []).join(', ');
      if (st.o) return G.edits(src, [{ s: st.o.s, e: st.o.e, t: all }]);
      return all ? G.edits(src, [{ s: st.oAt, e: st.oAt, t: `[${all}]` }]) : null;
    }
    return null;
  }
  function findName(src, st) {
    const i = src.indexOf('(' + st.name, st.s);
    return { s: i + 1, e: i + 1 + st.name.length };
  }
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, Lx = L(), st = selSt();
    if (!st) return;
    const opt = (match, txt) => G.edits(E.src, G.setOpt(Lx, st, match, txt));
    edit(() => {
      if (f === 'dash') return opt((o) => o.v == null && ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k), v || null);
      if (f === 'arrow') return opt((o) => o.v == null && /-/.test(o.k) && !/_/.test(o.k) && !/\s/.test(o.k), { '00': null, '01': '-stealth', 10: 'stealth-', 11: 'stealth-stealth' }[v]);
      if (f === 'frame') return opt((o) => /^tdplot_/.test(o.k), v === 'main' ? null : `tdplot_${v}_coords`);
      return E.src;
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ge="undo"]', root).disabled = !E.undo.length;
    $('[data-ge="redo"]', root).disabled = !E.redo.length;
    $('[data-ge="delete"]', root).disabled = E.sel == null;
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-ge]'); if (!b || !E) return; act(b.dataset.ge, b); });
  function act(a, b) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete' || a === 'del') deleteSel();
    else if (a === 'dup') duplicate();
    else if (a === 'fwd') reorder(1);
    else if (a === 'back') reorder(-1);
    else if (a === 'label') { if (E.sel != null) editLabel(E.sel); }
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); });
    updateTools();
  }
  // the code follows the drawing, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const Lx = L();
    count.textContent = `${Lx.S.filter(drawable).length} commands`;
    updateTools();
    if (document.activeElement === codeTa) return;
    if (E.src !== E.codeAt) { E.codeAt = E.src; codeTa.value = E.src; }
    codeMsg.innerHTML = Lx.warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.src = codeTa.value; E.codeAt = codeTa.value;
    commit();
    clampSel(); draw(); renderProps();
    codeMsg.innerHTML = L().warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.sel != null) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicate(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ']') { reorder(1); return; }
    if (e.key === '[') { reorder(-1); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel != null) { e.preventDefault(); editLabel(E.sel); return; }
    // arrows turn the view (⇧: by 15°)
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const vw = L().view, d = e.shiftKey ? 15 : 5;
      const th = Math.max(0, Math.min(180, vw.th + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0))), ph = vw.ph + (e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0);
      edit(() => G.setView(E.src, th, ph));
      return;
    }
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); add(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  function save() {
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    if (E.src !== E.start) { E.start = E.src; E.done({ src: E.src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  async function finish(ok) {
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = E.src, changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this figure?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    E = { src: String(block.src || ''), sel: null, view: { ox: 0, oy: 0, k: 120 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null, base: null };
    E.start = E.src;
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(() => { if (E) fit(); });
  }
  TD.geo3dEditor = { open };
})();
