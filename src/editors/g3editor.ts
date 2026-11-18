import { wheelZoomFactor } from '../ui/wheel-zoom';
import { onLocale, t } from '../i18n';
import FormPanel from '../ui/FormPanel.svelte';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { row, section } from '../ui/forms';
import type { FormRow } from '../ui/forms';
import { field, numField, segments, note, actionRow, texColour } from '../ui/editor-fields';
import G3editorFrame from '../ui/editors/G3editorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
// 3D geometry editor: the overlay that opens on a 3D geometry block. A palette of things to add (frames,
// points, vectors, lines, planes, angles, circles, spheres, labels); the picture drawn in 3D, where dragging
// empty space turns the view, dragging a point moves it (level, or up and down with ⇧), and clicking a line,
// face or label selects the command that drew it; that command's properties; and the tikz-3dplot code beside
// them, live both ways. Every edit is a change to the code, so untouched code is handed back as written.
// TD.geo3dEditor.open(block, onDone, { flat }) — block: { src }; onDone({ src }) on Done. With flat, the 2D geometry
// editor: the same picture seen straight on, a 2D palette (points (x, y) and (r:θ), vectors, projections, angle
// marks, function / polar / parametric plots, measures that print Δx, Δy, lengths and angles), and dragging empty
// space moves the view.
(function () {
  const G = TD.geo3d, V3 = TD.V3;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const D2R = Math.PI / 180;
  const fmt = G.fmt;

  // ---------------------------------------------------------------- palette
  // each entry: [key, name, code to add (P is a free point name), mini picture code, shortcut]
  const AX = (L = 1) => `\\draw[thick, ->] (0,0,0) -- (${L},0,0) node[anchor=north east]{$x$};\n\\draw[thick, ->] (0,0,0) -- (0,${L},0) node[anchor=north west]{$y$};\n\\draw[thick, ->] (0,0,0) -- (0,0,${L}) node[anchor=south]{$z$};`;
  const mini = (body: any) => `\\tdplotsetmaincoords{65}{115}\n\\begin{tikzpicture}[tdplot_main_coords]\n\\draw[gray, ->] (0,0,0) -- (1,0,0);\\draw[gray, ->] (0,0,0) -- (0,1,0);\\draw[gray, ->] (0,0,0) -- (0,0,1);\n${body}\n\\end{tikzpicture}`;
  const PAL = [
    ['Frames', [
      ['axes', 'Axes', () => AX(1), `\\tdplotsetmaincoords{65}{115}\n\\begin{tikzpicture}[tdplot_main_coords]\n\\draw[thick, ->] (0,0,0) -- (1,0,0);\\draw[thick, ->] (0,0,0) -- (0,1,0);\\draw[thick, ->] (0,0,0) -- (0,0,1);\n\\end{tikzpicture}`, 'A'],
      ['rframe', 'Rotated frame', () => `\\tdplotsetrotatedcoords{30}{40}{0}\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0.8,0,0) node[anchor=north east]{$x'$};\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0.8,0) node[anchor=west]{$y'$};\n\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0,0.8) node[anchor=south]{$z'$};`,
        mini(`\\tdplotsetrotatedcoords{30}{40}{0}\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0.8,0,0);\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0.8,0);\\draw[thick, ->, blue, tdplot_rotated_coords] (0,0,0) -- (0,0,0.8);`), 'R'],
      ['grid', 'Grid plane', () => `\\draw[gray!60, very thin] (0,0,0) grid (1,1);`.replace(' grid (1,1)', ' -- (1,0,0) -- (1,1,0) -- (0,1,0) -- cycle (0.5,0,0) -- (0.5,1,0) (0,0.5,0) -- (1,0.5,0)'),
        mini('\\draw[gray, very thin] (0,0,0) -- (1,0,0) -- (1,1,0) -- (0,1,0) -- cycle (0.5,0,0) -- (0.5,1,0) (0,0.5,0) -- (1,0.5,0);')],
    ]],
    ['Points', [
      ['point', 'Point', (n: any) => `\\coordinate (${n}) at (0.6,0.5,0.5);\n\\fill (${n}) circle (0.8pt) node[above right]{$${n}$};`, mini('\\fill (0.6,0.5,0.5) circle (2.5pt);'), 'P'],
      ['spoint', 'Point (r, θ, φ)', (n: any) => `\\tdplotsetcoord{${n}}{0.8}{50}{40}\n\\fill (${n}) circle (0.8pt) node[above right]{$${n}$};`, mini('\\tdplotsetcoord{P}{0.8}{50}{40}\\draw[dashed] (0,0,0) -- (Pxy) -- (P);\\fill (P) circle (2.5pt);')],
      ['label', 'Label', () => `\\node at (0.5,0.5,0.5) {$A$};`, mini('\\node at (0.5,0.5,0.5) {$A$};'), 'T'],
    ]],
    ['Lines', [
      ['vector', 'Vector', (n: any, sel: any) => `\\draw[-stealth, thick, blue] (0,0,0) -- ${sel ? `(${sel})` : '(0.4,0.7,0.6)'} node[above]{$\\vec{v}$};`, mini('\\draw[-stealth, thick, blue] (0,0,0) -- (0.4,0.7,0.6);'), 'V'],
      ['segment', 'Segment', () => `\\draw (0.2,0.7,0.2) -- (0.7,0.2,0.6);`, mini('\\draw[thick] (0.2,0.7,0.2) -- (0.7,0.2,0.6);'), 'S'],
      ['proj', 'Projection', (n: any, sel: any, L: any) => projOf(sel, L), mini('\\draw[dashed] (0.6,0.6,0.7) -- (0.6,0.6,0) -- (0.6,0,0) (0.6,0.6,0) -- (0,0.6,0);\\fill (0.6,0.6,0.7) circle (2.5pt);')],
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
      ['tarc', 'Angle from z', (n: any, sel: any, L: any) => thetaArc(sel, L), mini('\\tdplotsetthetaplanecoords{40}\\tdplotdrawarc[thick, tdplot_rotated_coords]{(0,0,0)}{0.6}{0}{50}{}{}')],
    ]],
  ];
  function index(pal: any) {
    const I: Record<string, any> = {}, K: Record<string, any> = {};
    for (const [, items] of pal) for (const [k, name, code, m, key, need] of items) { I[k] = { k, name, code, mini: m, key, need, pt: k === 'point' || k === 'ppoint' }; if (key) K[key.toLowerCase()] = k; }
    return [I, K];
  }
  const [ITEM3, KEYS3] = index(PAL);

  // ---------------------------------------------------------------- 2D palette
  const mini2 = (body: any) => `\\begin{tikzpicture}\n\\draw[gray, ->] (0,0) -- (1.3,0);\\draw[gray, ->] (0,0) -- (0,1);\n${body}\n\\end{tikzpicture}`;
  const NUM = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/;
  const isName = (Lx: any, t: any) => { const m = /^\s*([A-Za-z][\w]*)\s*$/.exec(t); return m && Lx.names.has(m[1]) ? m[1] : null; };
  // the named points of the selection: a point, or the named points a path goes through
  function namedOf(sel: any, Lx: any) {
    const st = sel != null ? Lx.S[sel] : null;
    if (!st) return [];
    if (st.k === 'coordinate') return [st.name];
    if (st.k === 'path') return st.els.filter((x: any) => x.t === 'pt').map((p: any) => isName(Lx, Lx.src.slice(p.is, p.ie))).filter(Boolean);
    return [];
  }
  // two points to measure or join: those of a selected path, or a selected point and the point named before it
  function pairOf(sel: any, Lx: any) {
    const nm = namedOf(sel, Lx), st = Lx.S[sel];
    if (st && st.k === 'path') return nm.length >= 2 ? [nm[0], nm[nm.length - 1]] : null;
    if (nm.length !== 1) return null;
    const all = [...Lx.names.keys()], i = all.indexOf(nm[0]), o = all[i - 1] || all[i + 1];
    return o ? [o, nm[0]] : null;
  }
  function freeNames(Lx: any, n: any) {
    const out: any[] = [], has = (x: any) => Lx.names.has(x) || out.includes(x);
    for (const c of ['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'R', 'S', 'U', 'W']) { if (out.length === n) break; if (!has(c)) out.push(c); }
    for (let i = 1; out.length < n; i++) if (!has('P' + i)) out.push('P' + i);
    return out;
  }
  // macro names are letters only
  const mbase = (n: any) => n.replace(/\d/g, (d: any) => 'abcdefghij'[d]).replace(/[^A-Za-z]/g, '');
  const freeMacro = (Lx: any, n: any, taken: any[] = []) => { let m = n; while (Lx.macros.has(m) || taken.includes(m)) m += 'z'; return m; };
  // a named point's x and y as pgfmath expressions; a point at plain numbers first gets them as values
  // (\pgfmathsetmacro), so dragging it later still moves what is measured from it
  function xyOf(N: any, Lx: any, edits: any, taken: any) {
    const st = Lx.S.find((x: any) => x.k === 'coordinate' && x.name === N && x.atPt);
    if (!st) return null;
    const { is, ie } = st.atPt, comma = G.splitTop(Lx.src, is, ie), colon = G.splitTop(Lx.src, is, ie, ':');
    const polar = comma.length === 1 && colon.length === 2, comps = polar ? colon : comma;
    if (comps.length !== 2) return null;
    let ex = comps.map((c: any) => c.t.trim());
    if (comps.every((c: any) => NUM.test(c.t))) {
      const names = (polar ? ['ang', 'len'] : ['x', 'y']).map((k) => freeMacro(Lx, mbase(N) + k, taken));
      taken.push(...names);
      let ind = ''; for (let i = st.s; i > 0 && /[ \t]/.test(Lx.src[i - 1]); i--) ind = Lx.src[i - 1] + ind;
      edits.push({ s: st.s, e: st.s, t: names.map((m, i) => `\\pgfmathsetmacro{\\${m}}{${ex[i]}}\n${ind}`).join('') });
      comps.forEach((c: any, i: any) => edits.push({ s: c.s, e: c.e, t: `\\${names[i]}` }));
      ex = names.map((m) => `\\${m}`);
    }
    const par = (t: any) => (/^\\?[\w.]+$/.test(t) ? t : `(${t})`);
    ex = ex.map(par);
    return polar ? { x: `${ex[1]}*cos(${ex[0]})`, y: `${ex[1]}*sin(${ex[0]})` } : { x: ex[0], y: ex[1] };
  }
  const NEED_PAIR = 'Select a segment or vector between two named points first';
  // an item's or command's name as shown (the tables keep the English, which search also matches)
  const say = (en: string): string => (({
    Axes: () => t('editor.g3.n.axes', 'Axes'), 'Rotated frame': () => t('editor.g3.n.rframe', 'Rotated frame'), 'Grid plane': () => t('editor.g3.n.gridPlane', 'Grid plane'), Grid: () => t('ui.grid', 'Grid'),
    Point: () => t('editor.g3.n.point', 'Point'), 'Point (r, θ, φ)': () => t('editor.g3.n.spoint', 'Point {coords}', { coords: '(r, θ, φ)' }), 'Point (x, y)': () => t('editor.g3.n.spoint', 'Point {coords}', { coords: '(x, y)' }),
    'Point (r, θ)': () => t('editor.g3.n.spoint', 'Point {coords}', { coords: '(r, θ)' }), Label: () => t('ui.label', 'Label'),
    Vector: () => t('editor.g3.n.vector', 'Vector'), Segment: () => t('editor.g3.n.segment', 'Segment'), Projection: () => t('editor.g3.n.projection', 'Projection'), 'Space curve': () => t('editor.g3.n.curve3', 'Space curve'),
    Plane: () => t('editor.g3.n.plane', 'Plane'), Triangle: () => t('editor.g3.n.triangle', 'Triangle'), Circle: () => t('editor.g3.n.circle', 'Circle'), Sphere: () => t('editor.g3.n.sphere', 'Sphere'),
    'Plane ax + by + cz = d': () => t('editor.g3.n.planeEq', 'Plane {eq}', { eq: 'ax + by + cz = d' }), 'Surface z = f(x, y)': () => t('editor.g3.n.surface', 'Surface {eq}', { eq: 'z = f(x, y)' }),
    'Surface (u, v)': () => t('editor.g3.n.surface', 'Surface {eq}', { eq: '(u, v)' }), 'Graph z = f(x, y)': () => t('editor.g3.n.graph', 'Graph {eq}', { eq: 'z = f(x, y)' }), Box: () => t('editor.g3.n.box', 'Box'),
    'Angle in xy': () => t('editor.g3.n.arc', 'Angle in xy'), 'Angle from z': () => t('editor.g3.n.tarc', 'Angle from z'), Polygon: () => t('editor.g3.n.polygon', 'Polygon'),
    'Angle mark': () => t('prop.mark', 'Angle mark'), 'Right angle': () => t('editor.g3.n.rmark', 'Right angle'), 'Polar r(θ)': () => t('editor.g3.n.polar', 'Polar {eq}', { eq: 'r(θ)' }),
    Parametric: () => t('ui.parametric', 'Parametric'), Length: () => t('editor.g3.n.length', 'Length'), Angle: () => t('ui.angle', 'Angle'),
    'Angle arc': () => t('editor.g3.n.angleArc', 'Angle arc'), 'Frame origin': () => t('editor.g3.n.origin', 'Frame origin'), 'Theta plane': () => t('editor.g3.n.tplane', 'Theta plane'), View: () => t('ui.view', 'View'),
    Value: () => t('editor.g3.value', 'Value'), Command: () => t('editor.g3.n.command', 'Command'), Loop: () => t('editor.g3.n.loop', 'Loop'), Scope: () => t('editor.g3.n.scope', 'Scope'),
    Curve: () => t('editor.g3.n.curve', 'Curve'), Path: () => t('editor.g3.n.path', 'Path'), Face: () => t('editor.g3.n.face', 'Face'),
  } as Record<string, () => string>)[en]?.() ?? en);
  const catName = (en: string): string => (({
    Frames: () => t('editor.g3.cat.frames', 'Frames'), Points: () => t('editor.g3.cat.points', 'Points'), Lines: () => t('editor.g3.cat.lines', 'Lines'), Surfaces: () => t('editor.g3.cat.surfaces', 'Surfaces'),
    Angles: () => t('editor.g3.cat.angles', 'Angles'), Plots: () => t('editor.g3.cat.plots', 'Plots'), Measures: () => t('editor.g3.cat.measures', 'Measures'),
  } as Record<string, () => string>)[en]?.() ?? en);
  // a label's side, as the Position list names it
  const sideName = (p: string) => (({
    right: () => t('editor.commonA.side.right', 'Right'), 'above right': () => t('editor.commonA.side.aboveRight', 'Above right'), above: () => t('editor.commonA.side.above', 'Above'),
    'above left': () => t('editor.commonA.side.aboveLeft', 'Above left'), left: () => t('editor.commonA.side.left', 'Left'), 'below left': () => t('editor.commonA.side.belowLeft', 'Below left'),
    below: () => t('editor.commonA.side.below', 'Below'), 'below right': () => t('editor.commonA.side.belowRight', 'Below right'),
  } as Record<string, () => string>)[p]?.() ?? p[0].toUpperCase() + p.slice(1));
  const commandsText = (n: number) => t('editor.g3.nCommands', '{n} commands', { n });
  function measure(kind: any) {
    return (n: any, sel: any, Lx: any) => {
      const pr = pairOf(sel, Lx);
      if (!pr) return null;
      const [A, B] = pr, edits: any[] = [], taken: any[] = [], a = xyOf(A, Lx, edits, taken), b = xyOf(B, Lx, edits, taken);
      if (!a || !b) return null;
      const m = freeMacro(Lx, ({ dx: 'dx', dy: 'dy', len: 'len', ang: 'ang' } as Record<string, any>)[kind] + mbase(A) + mbase(B), taken);
      const pn = (v?: any, d = 2) => `\\pgfmathprintnumber[fixed,precision=${d}]{\\${m}}`;
      const dx = `${b.x}-${a.x}`, dy = `${b.y}-${a.y}`;
      const code = ({
        dx: `\\pgfmathsetmacro{\\${m}}{${dx}}\n\\path (${A}) -- (${A} -| ${B}) node[midway, below]{$\\Delta x = ${pn()}$};`,
        dy: `\\pgfmathsetmacro{\\${m}}{${dy}}\n\\path (${A} -| ${B}) -- (${B}) node[midway, right]{$\\Delta y = ${pn()}$};`,
        len: `\\pgfmathsetmacro{\\${m}}{veclen(${dx},${dy})}\n\\path (${A}) -- (${B}) node[midway, below right]{$|${A}${B}| = ${pn()}$};`,
        ang: `\\pgfmathsetmacro{\\${m}}{atan2(${dy},${dx})}\n\\node[below right] at (${A}) {$\\theta = ${pn(0, 1)}^\\circ$};`,
      } as Record<string, any>)[kind];
      return { edits, code, atEnd: true };
    };
  }
  // an angle mark at the middle point of a selected path through three named points, or a new corner to mark
  function angleMark(right: any) {
    return (n: any, sel: any, Lx: any) => {
      const nm = namedOf(sel, Lx), st = sel != null ? Lx.S[sel] : null;
      const pic = (a: any, b: any, c: any) => right ? `\\pic[draw, angle radius=3mm] {right angle = ${a}--${b}--${c}};` : `\\pic[draw, "$\\alpha$", angle radius=6mm] {angle = ${a}--${b}--${c}};`;
      if (st && st.k === 'path' && nm.length >= 3) return pic(nm[0], nm[1], nm[2]);
      // otherwise the next click picks the corner of two lines that meet
      if (FLAT && corners(Lx).length) return { pick: true, pic };
      const [a, b, c] = freeNames(Lx, 3);
      return `\\coordinate (${a}) at (2,0);\n\\coordinate (${b}) at (0,0);\n\\coordinate (${c}) at (${right ? '0,1.5' : '1.2,1.6'});\n\\draw (${a}) -- (${b}) -- (${c});\n${pic(a, b, c)}`;
    };
  }
  const PAL2 = [
    ['Frames', [
      ['axes', 'Axes', () => `\\draw[-stealth] (-0.5,0) -- (4.5,0) node[right]{$x$};\n\\draw[-stealth] (0,-0.5) -- (0,3.5) node[above]{$y$};\n\\foreach \\x in {1,...,4} \\draw (\\x,2pt) -- (\\x,-2pt) node[below]{$\\x$};\n\\foreach \\y in {1,...,3} \\draw (2pt,\\y) -- (-2pt,\\y) node[left]{$\\y$};`,
        '\\begin{tikzpicture}\\draw[thick, ->] (0,0) -- (1.4,0);\\draw[thick, ->] (0,0) -- (0,1);\\foreach \\x in {0.4,0.8,1.2} \\draw (\\x,0.08) -- (\\x,-0.08);\\end{tikzpicture}', 'A'],
      ['grid', 'Grid', () => `\\draw[step=1, very thin, black!15] (-0.5,-0.5) grid (4.5,3.5);`, '\\begin{tikzpicture}\\draw[step=0.25, gray] (0,0) grid (1.25,1);\\end{tikzpicture}', 'G'],
    ]],
    ['Points', [
      ['point', 'Point (x, y)', (n: any) => `\\coordinate (${n}) at (1,2);\n\\fill (${n}) circle (1.5pt) node[above right]{$${n}$};`, mini2('\\fill (0.7,0.6) circle (2.5pt);'), 'P'],
      ['ppoint', 'Point (r, θ)', (n: any) => `\\coordinate (${n}) at (40:2);\n\\draw[dashed, gray] (0,0) -- (${n});\n\\fill (${n}) circle (1.5pt) node[above right]{$${n}$};`, mini2('\\draw[dashed] (0,0) -- (40:1.1);\\draw (0.3,0) arc (0:40:0.3);\\fill (40:1.1) circle (2.5pt);')],
      ['label', 'Label', () => `\\node at (1,1) {$A$};`, mini2('\\node at (0.6,0.5) {$A$};'), 'T'],
    ]],
    ['Lines', [
      ['segment', 'Segment', (n: any, sel: any, Lx: any) => { const p = pairOf(sel, Lx), st = sel != null ? Lx.S[sel] : null; return p && st && st.k === 'coordinate' ? `\\draw (${p[0]}) -- (${p[1]});` : `\\draw (0.5,0.5) -- (2.5,1.5);`; }, mini2('\\draw[thick] (0.2,0.2) -- (1.1,0.8);'), 'S'],
      ['vector', 'Vector', (n: any, sel: any, Lx: any) => { const nm = namedOf(sel, Lx), st = sel != null ? Lx.S[sel] : null; return `\\draw[-stealth, thick, blue] (0,0) -- ${st && st.k === 'coordinate' ? `(${nm[0]})` : '(2,1.5)'} node[midway, above left]{$\\vec{v}$};`; }, mini2('\\draw[-stealth, thick, blue] (0,0) -- (1,0.75);'), 'V'],
      ['proj', 'Projection', (n: any, sel: any, Lx: any) => { const st = sel != null ? Lx.S[sel] : null; if (st && st.k === 'coordinate') return `\\draw[dashed, gray] (${st.name}) -- (${st.name} |- 0,0);\n\\draw[dashed, gray] (${st.name}) -- (${st.name} -| 0,0);`; return `\\draw[dashed, gray] (2,1.5) -- (2,0);\n\\draw[dashed, gray] (2,1.5) -- (0,1.5);`; }, mini2('\\draw[dashed] (0.9,0.7) -- (0.9,0) (0.9,0.7) -- (0,0.7);\\fill (0.9,0.7) circle (2.5pt);')],
      ['polygon', 'Polygon', () => `\\draw (0,0) -- (2,0) -- (1.5,1.5) -- cycle;`, mini2('\\draw[thick] (0.1,0.1) -- (1.1,0.1) -- (0.8,0.85) -- cycle;')],
      ['circle', 'Circle', () => `\\draw (1,1) circle (1);`, mini2('\\draw[thick] (0.6,0.5) circle (0.4);'), 'C'],
    ]],
    ['Angles', [
      ['amark', 'Angle mark', angleMark(false), '\\begin{tikzpicture}\\draw[thick] (1.2,0) -- (0,0) -- (0.6,0.8);\\draw (0.35,0) arc (0:53:0.35);\\end{tikzpicture}', 'M'],
      ['rmark', 'Right angle', angleMark(true), '\\begin{tikzpicture}\\draw[thick] (1.2,0) -- (0,0) -- (0,1);\\draw (0.25,0) -- (0.25,0.25) -- (0,0.25);\\end{tikzpicture}'],
    ]],
    ['Plots', [
      ['fplot', 'y = f(x)', () => `\\draw[thick, blue, domain=-2:2, samples=60] plot (\\x, {0.5*\\x*\\x});`, mini2('\\draw[thick, blue, domain=-0.1:1.2, samples=30] plot (\\x, {0.7*\\x*\\x});'), 'F'],
      ['rplot', 'Polar r(θ)', () => `\\draw[thick, blue, domain=0:360, samples=120] plot (\\x:{1+0.5*cos(3*\\x)});`, '\\begin{tikzpicture}\\draw[thick, blue, domain=0:360, samples=90] plot (\\x:{0.6+0.3*cos(3*\\x)});\\end{tikzpicture}'],
      ['pplot', 'Parametric', () => `\\draw[thick, blue, variable=\\t, domain=0:360, samples=120] plot ({2*cos(\\t)}, {sin(2*\\t)});`, '\\begin{tikzpicture}\\draw[thick, blue, variable=\\t, domain=0:360, samples=90] plot ({0.8*cos(\\t)}, {0.5*sin(2*\\t)});\\end{tikzpicture}'],
    ]],
    ['Measures', [
      ['mdx', 'Δx', measure('dx'), '\\begin{tikzpicture}\\draw[thick] (0,0) -- (1,0.7);\\draw[dashed] (0,0) -- (1,0);\\end{tikzpicture}', null, NEED_PAIR],
      ['mdy', 'Δy', measure('dy'), '\\begin{tikzpicture}\\draw[thick] (0,0) -- (1,0.7);\\draw[dashed] (1,0) -- (1,0.7);\\end{tikzpicture}', null, NEED_PAIR],
      ['mlen', 'Length', measure('len'), '\\begin{tikzpicture}\\draw[thick] (0,0) -- (1,0.7);\\draw (0.1,-0.14) -- (1.1,0.56);\\end{tikzpicture}', null, NEED_PAIR],
      ['mang', 'Angle', measure('ang'), '\\begin{tikzpicture}\\draw[thick] (0,0) -- (1,0.7);\\draw[dashed] (0,0) -- (1.1,0);\\draw (0.4,0) arc (0:35:0.4);\\end{tikzpicture}', null, NEED_PAIR],
    ]],
  ];
  const [ITEM2, KEYS2] = index(PAL2);
  let FLAT = false;
  const pal = () => (FLAT ? PAL2 : PAL), ITEMS = () => (FLAT ? ITEM2 : ITEM3), KEYS = () => (FLAT ? KEYS2 : KEYS3);
  // dashed lines from a point down to the xy-plane and across to the axes
  function projOf(sel: any, L: any) {
    const st = sel != null ? L.S[sel] : null, nm = st && (st.k === 'setcoord' || st.k === 'coordinate') ? st.name : null;
    if (st && st.k === 'setcoord' && !st.simple) return `\\draw[dashed] (${nm}) -- (${nm}xy) -- (${nm}x);\n\\draw[dashed] (${nm}xy) -- (${nm}y);`;
    const p = nm && L.names.get(nm) && L.names.get(nm).m ? L.names.get(nm).m : [0.6, 0.6, 0.7];
    const [x, y, z] = p.map((v: any) => fmt(v, 2)), a = nm ? `(${nm})` : `(${x},${y},${z})`;
    return `\\draw[dashed] ${a} -- (${x},${y},0) -- (${x},0,0);\n\\draw[dashed] (${x},${y},0) -- (0,${y},0);`;
  }
  // the angle θ from the z-axis to a point given by \tdplotsetcoord, drawn in its theta plane
  function thetaArc(sel: any, L: any) {
    const st = sel != null ? L.S[sel] : null;
    if (st && st.k === 'setcoord') {
      const t = (sp: any) => L.src.slice(sp.s, sp.e).trim();
      return `\\tdplotsetthetaplanecoords{${t(st.ph)}}\n\\tdplotdrawarc[tdplot_rotated_coords]{(0,0,0)}{0.4}{0}{${t(st.th)}}{anchor=south west}{$\\theta$}`;
    }
    return `\\tdplotsetthetaplanecoords{40}\n\\tdplotdrawarc[tdplot_rotated_coords]{(0,0,0)}{0.4}{0}{50}{anchor=south west}{$\\theta$}`;
  }
  const miniCache = new Map();
  function miniSvg(code: any) {
    const ck = (FLAT ? '2|' : '3|') + code;
    if (miniCache.has(ck)) return miniCache.get(ck);
    const L = G.layout(code, FLAT), k = Math.min(56 / (L.bb.w || 1), 36 / (L.bb.h || 1)) * L.k;
    const fit = { k, px: (p: any) => ({ x: p[0] * k, y: -p[1] * k }) };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of L.items) for (const p of it.pts || (it.at ? [it.at] : [])) { const q = fit.px(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const items = L.items.filter((it: any) => it.k !== 'text').map((it: any) => (it.stroke && V3.hex(it.stroke) === '#000000' ? { ...it, stroke: { c: 'currentColor', p: 100 }, w: Math.max(it.w, 1.1) } : it.k === 'line' ? { ...it, w: Math.max(it.w, 1.1) } : it));
    let body = '';
    try { body = V3.svg(items, fit, { export: true }); } catch (e: any) { body = ''; }
    body = body.replace(/stroke="#808080"/g, 'stroke="currentColor" stroke-opacity="0.4"').replace(/fill="currentColor"/g, 'fill="currentColor"');
    const out = `<svg class="zxmini" viewBox="${r2(x0 - 3)} ${r2(y0 - 3)} ${r2(x1 - x0 + 6)} ${r2(y1 - y0 + 6)}" aria-hidden="true">${body}</svg>`;
    miniCache.set(ck, out);
    return out;
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'g3Modal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d: any) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  mountFrame(root, G3editorFrame, { p0: ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>'), p1: isMac ? '⌘' : 'Ctrl+', p2: ic('<path transform="translate(0 -2)" d="M7 5L3 9l4 4"/><path transform="translate(0 -2)" d="M3 9h9a4.5 4.5 0 010 9H9"/>'), p3: isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z', p4: ic('<path transform="translate(0 -2)" d="M13 5l4 4-4 4"/><path transform="translate(0 -2)" d="M17 9H8a4.5 4.5 0 000 9h3"/>'), p5: ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'), p6: isMac ? '⌘' : 'Ctrl+' });
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.g3-svg', root), stage = $('.cz-stage', root), list = $('.g3-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { src, sel: statement index | null, view: { k (px per cm), ox, oy }, undo, redo, pending, start, done, drag, hover, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  const L = () => G.layout(E.src, FLAT);
  function begin() { if (E.pending == null) E.pending = E.src; }
  function commit() {
    if (E.pending == null) return;
    if (E.src !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
    dock.changed();
  }
  // a change to the code; keepSel: the selected statement stays the one at the same place in the list
  function edit(fn: any) { E.many = null; begin(); const r = fn(); if (typeof r === 'string') E.src = r; commit(); clampSel(); draw(); renderProps(); }
  function restore(src: any) { E.src = src; clampSel(); draw(); renderProps(); updateTools(); }
  function undo() { E.many = null; commit(); if (!E.undo.length) return; E.redo.push(E.src); restore(E.undo.pop()); dock.changed(); }
  function redo() { E.many = null; commit(); if (!E.redo.length) return; E.undo.push(E.src); restore(E.redo.pop()); dock.changed(); }
  const drawable = (st: any) => st && !['comment', 'begin', 'end', 'raw'].includes(st.k);
  function clampSel() { if (E.sel != null && !drawable(L().S[E.sel])) E.sel = null; }
  const selSt = () => (E.sel != null ? L().S[E.sel] || null : null);
  const text = (sp: any) => E.src.slice(sp.s, sp.e);

  // ---------------------------------------------------------------- adding
  function freeName(Lx: any) {
    for (const n of ['P', 'Q', 'R', 'A', 'B', 'C', 'D', 'U', 'W']) if (!Lx.names.has(n)) return n;
    let i = 1; while (Lx.names.has('P' + i)) i++; return 'P' + i;
  }
  // new code goes after the selected command, or at the end of the picture
  function insertAt(Lx: any, atEnd: any) {
    const st = atEnd ? null : selSt();
    if (st && st.k !== 'main') return { at: st.e, lead: '\n' + indentOf(st.s) };
    const e = Lx.end != null ? Lx.S[Lx.end] : null;
    if (e) { let s = e.s; while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--; return { at: s, lead: '', trail: '\n', ind: indentOf(Lx.S[Lx.end - 1] ? Lx.S[Lx.end - 1].s : e.s) || '  ' }; }
    return { at: E.src.length, lead: '\n', ind: '' };
  }
  function indentOf(i: any) { let s = i; while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--; return E.src.slice(s, i); }
  // corners: points where two or more straight segments end, with the far ends of those segments
  function corners(Lx: any) {
    const map = new Map(), key = (m: any) => `${m[0].toFixed(5)},${m[1].toFixed(5)}`;
    for (const [a, b] of Lx.links || []) {
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) continue;
      for (const [p, q] of [[a, b], [b, a]]) {
        const k = key(p);
        if (!map.has(k)) map.set(k, { m: p, ends: [] });
        const c = map.get(k), t = Math.atan2(q[1] - p[1], q[0] - p[0]);
        if (!c.ends.some((o: any) => Math.abs(o.t - t) < 1e-6)) c.ends.push({ m: q, t });
      }
    }
    return [...map.values()].filter((c) => c.ends.length >= 2);
  }
  // the corner nearest a screen point (within reach), and the two lines either side of the pointer
  function cornerAt(sx: any, sy: any, Lx = L()) {
    let best = null;
    for (const c of corners(Lx)) { const [x, y] = S(c.m), dd = Math.hypot(x - sx, y - sy); if (dd < 120 &&(!best || dd < best.dd)) best = { c, dd, x, y }; }
    if (!best) return null;
    const ends = best.c.ends.slice().sort((a: any, b: any) => a.t - b.t), n = ends.length, TAU = 2 * Math.PI;
    const span = (i: any) => ((ends[(i + 1) % n].t - ends[i].t) % TAU + TAU) % TAU || TAU;
    let i = 0;
    if (best.dd < 6) { for (let j = 1; j < n; j++) if (span(j) < span(i)) i = j; }
    else {
      const t = Math.atan2(-(sy - best.y), sx - best.x);
      for (let j = 0; j < n; j++) if (((t - ends[j].t) % TAU + TAU) % TAU < span(j)) { i = j; break; }
    }
    return { at: best.c.m, x: best.x, y: best.y, a: ends[i].m, b: ends[(i + 1) % n].m };
  }
  function endPick() { if (!E.pick) return; E.pick = null; E.pickAt = null; svg.style.cursor = ''; setTip(''); draw(); }
  function markCorner(sx: any, sy: any) {
    const Lx = L(), k = cornerAt(sx, sy, Lx), p = E.pick;
    if (!k) { flashTip(t('editor.g3.tip.nearer', 'Click nearer a corner where two lines meet')); return; }
    const pre: any[] = [], taken: any[] = [];
    const nameOf = (m: any) => {
      let nm = null;
      for (const [n, v] of Lx.names) { const q = v.m || v; if (Math.hypot(q[0] - m[0], q[1] - m[1]) < 1e-6 && (!nm || n.length < nm.length)) nm = n; }
      if (nm) return nm;
      const t = taken.find((x) => Math.hypot(x.m[0] - m[0], x.m[1] - m[1]) < 1e-6);
      if (t) return t.n;
      const [f] = freeNames({ names: new Map([...Lx.names, ...taken.map((x) => [x.n, x])]) }, 1);
      taken.push({ n: f, m }); pre.push(`\\coordinate (${f}) at (${fmt(m[0], 2)}, ${fmt(m[1], 2)});`);
      return f;
    };
    const code = p.pic(nameOf(k.a), nameOf(k.at), nameOf(k.b));
    const key = p.key;
    endPick();
    add(key, { code: [...pre, code].join('\n'), atEnd: true });
  }
  function add(key: any, forced?: any) {
    const it = (ITEMS() as Record<string, any>)[key], Lx = L(), nm = freeName(Lx);
    endPick();
    const selName = (() => { const st = selSt(); return st && (st.k === 'coordinate' || st.k === 'setcoord') ? st.name : null; })();
    // an item's code: text to add, or { edits made first, code, atEnd: added at the end of the picture }
    const r = forced || it.code(nm, key === 'vector' && !FLAT ? selName : E.sel, Lx);
    if (r && r.pick) { E.pick = { key, pic: r.pic }; svg.style.cursor = 'crosshair'; setTip(t('editor.g3.tip.pick', '{name}: click inside a corner where two lines meet  ·  Esc cancels', { name: say(it.name) })); return; }
    if (r == null) { const msg = it.need ? t('editor.g3.needPair', 'Select a segment or vector between two named points first') : t('editor.g3.needSel', 'Select what this applies to first'); setTip(msg); setTimeout(() => { if (E && tip.textContent === msg) setTip(''); }, 2400); return; }
    const code = typeof r === 'string' ? r : r.code, pre = typeof r === 'string' ? [] : r.edits || [];
    const pos = insertAt(Lx, typeof r === 'object' && r.atEnd), ind = pos.ind ?? (pos.lead.replace('\n', '') || '  ');
    const lines = code.split('\n').map((l: any) => ind + l).join('\n');
    const before = E.src;
    edit(() => G.edits(before, [...pre, { s: pos.at, e: pos.at, t: pos.trail ? lines + '\n' : '\n' + lines }]));
    // select the first drawn command of what was added (past what the edits before it added)
    const L2 = L(), at = pos.at + (pos.trail ? 0 : 1) + pre.filter((x: any) => x.e <= pos.at).reduce((a: any, x: any) => a + x.t.length - (x.e - x.s), 0);
    const i = L2.S.findIndex((st: any) => st.s >= at && drawable(st) && !['macro', 'rot', 'tplane'].includes(st.k) && (st.k !== 'coordinate' || it.pt));
    E.sel = i >= 0 ? i : null;
    draw(); renderProps();
    const added = t('editor.g3.added', '{name} added', { name: say(it.name) });
    setTip(added);
    setTimeout(() => { if (E && tip.textContent === added) setTip(''); }, 1200);
  }
  // a statement's span with the line it sits on, so deleting leaves no blank line
  function lineSpan(st: any) {
    let s = st.s, e = st.e;
    while (s > 0 && /[ \t]/.test(E.src[s - 1])) s--;
    while (e < E.src.length && /[ \t]/.test(E.src[e])) e++;
    if ((s === 0 || E.src[s - 1] === '\n') && E.src[e] === '\n') e++;
    return { s, e };
  }
  // a point's name where a 2D picture uses it: (P), (P.north), (P |- Q), (Q -| P), angle = A--P--B
  const nameRe = (nm: any, g = '') => new RegExp(`(?<=[(\\s|-])${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s)|;}.-])`, g);
  // ⌘A: every command the picture draws (not the view or its values); a drag moves them together
  function selectAll() {
    const Lx = L(), all: any[] = [];
    Lx.S.forEach((x: any, i: any) => { if (drawable(x) && !['main', 'macro'].includes(x.k)) all.push(i); });
    if (!all.length) return;
    E.sel = null; E.many = all; closeMenu();
    draw(); renderProps();
  }
  const inMany = (si: any) => !!(E.many && E.many.includes(si));
  function deleteSel() {
    if (E.many) { const Lx = L(), del = E.many; edit(() => G.edits(E.src, del.map((i: any) => ({ ...lineSpan(Lx.S[i]), t: '' })))); E.sel = null; draw(); renderProps(); return; }
    const st = selSt();
    if (!st) return;
    if (st.k === 'main') { setTip(t('editor.g3.tip.viewStays', 'The view stays: turn it instead')); return; }
    // a point goes with the commands that draw it (by its name), as the code would no longer compile
    const Lx = L(), del = [E.sel];
    const nm = st.k === 'coordinate' || st.k === 'setcoord' ? st.name : null;
    if (nm) {
      const re = FLAT ? nameRe(nm) : new RegExp(`\\((\\s*${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(xy|xz|yz|x|y|z)?\\s*)\\)`);
      Lx.S.forEach((x: any, i: any) => { if (i !== E.sel && drawable(x) && x.k !== 'macro' && re.test(E.src.slice(x.s, x.e))) del.push(i); });
    }
    edit(() => G.edits(E.src, del.map((i) => ({ ...lineSpan(Lx.S[i]), t: '' }))));
    E.sel = null; draw(); renderProps();
  }
  function duplicate() {
    const st = selSt();
    if (!st || st.k === 'main' || st.k === 'macro') return;
    const sp = lineSpan(st), body = E.src.slice(sp.s, sp.e);
    edit(() => E.src.slice(0, sp.e) + (body.endsWith('\n') ? body : '\n' + body) + E.src.slice(sp.e));
    const L2 = L(); E.sel = L2.S.findIndex((x: any) => x.s > st.s && drawable(x)); if (E.sel < 0) E.sel = null;
    draw(); renderProps();
  }
  // ⌘C / ⌘X / ⌘V: the selected commands' lines, as text (also on the system clipboard)
  let clip: any = null; // { text, n }: what was copied here, and how many times it has been pasted
  function selLines() {
    const Lx = L(), sis = (E.many || (E.sel != null ? [E.sel] : [])).filter((i: any) => Lx.S[i] && drawable(Lx.S[i]) && Lx.S[i].k !== 'main').sort((a: any, b: any) => a - b);
    return sis.map((i: any) => { const sp = lineSpan(Lx.S[i]), t = E.src.slice(sp.s, sp.e); return t.endsWith('\n') ? t : t + '\n'; }).join('');
  }
  function copySel(cut: any) {
    const text = selLines();
    if (!text) return;
    clip = { text, n: 0 };
    navigator.clipboard?.writeText(text).catch(() => {});
    if (cut) deleteSel();
    flashTip(cut ? t('ui.cut', 'Cut') : t('ui.copied', 'Copied'));
  }
  async function pasteClip() {
    let text = null;
    try { text = await navigator.clipboard.readText(); } catch (e: any) { text = null; }
    if (!text || !/\\[A-Za-z]/.test(text)) text = clip && clip.text;
    if (!text || !E) return;
    // a whole picture pastes its body
    const m = /\\begin\{tikzpicture\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{tikzpicture\}/.exec(text);
    if (m) text = m[1].replace(/^\s*\n/, '');
    if (!text.trim()) return;
    if (!text.endsWith('\n')) text += '\n';
    const n = clip && clip.text === text ? ++clip.n : ((clip = { text, n: 1 }), 1);
    const Lx = L();
    // names the picture already has get a new one in the pasted lines (P → P1), and every use follows
    const taken = new Set(Lx.names.keys());
    const defs = [...text.matchAll(/(?:\\coordinate|\\node|\bcoordinate|\bnode)\s*(?:\[[^\]]*\])?\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g)].map((x) => x[1]);
    for (const nm of new Set(defs)) {
      if (!taken.has(nm)) continue;
      let k = 1; while (taken.has(nm + k) || text.includes(`(${nm + k})`)) k++;
      taken.add(nm + k);
      text = text.replace(nameRe(nm, 'g'), nm + k);
    }
    const end = E.src.lastIndexOf('\\end{tikzpicture}');
    let at = end < 0 ? E.src.length : end;
    while (at > 0 && /[ \t]/.test(E.src[at - 1])) at--;
    // moved by n × 0.5 down and right, when that moves only the pasted lines (not points they share)
    const place = (t: any) => {
      const src1 = E.src.slice(0, at) + t + E.src.slice(at), e1 = at + t.length;
      const L1 = G.layout(src1, FLAT), sis: any[] = [];
      L1.S.forEach((x: any, i: any) => { if (x.s >= at && x.e <= e1 && drawable(x) && x.k !== 'main') sis.push(i); });
      const ed = sis.length ? G.shiftEdits(L1, sis, [0.5 * n, -0.5 * n, 0]) : null;
      const ok = !!(ed && ed.length && ed.every((x: any) => x.s >= at && x.e <= e1));
      return { src: ok ? G.edits(src1, ed) : src1, sis, ok };
    };
    let r = place(text);
    if (!r.ok) {
      // the copy uses points it doesn't define, such as (P): it takes their positions as numbers, so it can move apart
      const own = new Set([...text.matchAll(/(?:\\coordinate|\\node|\bcoordinate|\bnode)\s*(?:\[[^\]]*\])?\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g)].map((x) => x[1]));
      const lit = text.replace(/\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g, (all: any, nm: any) => {
        const p = !own.has(nm) && Lx.names.get(nm);
        return p && p.m ? `(${p.m.slice(0, FLAT ? 2 : 3).map((v: any) => fmt(v, 2)).join(', ')})` : all;
      });
      if (lit !== text) { const r2 = place(lit); if (r2.ok) r = r2; }
    }
    const sis = r.sis;
    edit(() => r.src);
    E.sel = sis.length === 1 ? sis[0] : null; E.many = sis.length > 1 ? sis : null;
    draw(); renderProps();
    flashTip(sis.length ? (sis.length > 1 ? t('editor.g3.pastedN', 'Pasted {n} commands', { n: sis.length }) : t('editor.g3.pasted1', 'Pasted 1 command')) : t('editor.g3.pasted', 'Pasted'));
  }
  // draw order: swap with the next / previous drawn command
  function reorder(dir: any) {
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
  function sizeMinis(el: any) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(1.4, 60 / vw, 38 / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    for (const [title, items] of pal()) {
      const hits = (items as any).filter(([k, name]: any) => !q || `${name} ${k} ${title} ${say(name)} ${catName(title as string)}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(catName(title as string))}</div><div class="qe-grid">${hits.map(([k, name, , m, key]: any) =>
        `<button class="qe-item" data-item="${esc(k)}" title="${esc(say(name))}${key ? ` (${key})` : ''}"><span class="qe-fig">${miniSvg(m)}</span><span>${esc(say(name))}</span></button>`).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">${esc(t('editor.commonA.noMatch', 'Nothing matches “{query}”', { query: search.value }))}</div>`;
    sizeMinis(list);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e: any) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) add(b.dataset.item); search.blur(); }
  });
  list.addEventListener('click', (e: any) => { const b = e.target.closest('.qe-item'); if (b && E) add(b.dataset.item); });
  function setTip(t: any) { tip.textContent = t; tip.hidden = !t; }
  // a tip that clears itself
  function flashTip(t: any) { setTip(t); setTimeout(() => { if (tip.textContent === t) setTip(''); }, 1400); }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const pos = (e: any) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const fitOf = () => ({ k: E.view.k, px: (p: any) => ({ x: E.view.ox + p[0] * E.view.k, y: E.view.oy - p[1] * E.view.k }) });
  const S = (p: any) => { const q = fitOf().px(p); return [q.x, q.y]; };
  function fit() {
    const Lx = L(), r = rect();
    if (Lx.empty) { E.view = { k: 120, ox: r.width / 2, oy: r.height / 2 }; draw(); return; }
    // bounds in projected units
    const b = Lx.bb, k0 = Lx.k, w = b.w / k0, h = b.h / k0, cx = (b.x + b.w / 2) / k0, cy = -(b.y + b.h / 2) / k0;
    const k = Math.max(20, Math.min(900, Math.min((r.width - 100) / w, (r.height - 100) / h)));
    E.view = { k, ox: r.width / 2 - cx * k, oy: r.height / 2 + cy * k };
    draw();
  }
  svg.addEventListener('wheel', (e: any) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(12, Math.min(2000, v.k * wheelZoomFactor(e)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Lb) Lb.pop.place();
  }, { passive: false });
  // what is under the pointer: a point handle first, then the topmost drawn item
  function handleAt(e: any, px = 9) {
    const Lx = L(), [x, y] = pos(e);
    let best = null, bd = px;
    for (const h of Lx.handles) {
      const [X, Y] = S(h.at.s), d = Math.hypot(X - x, Y - y) - (h.kind !== 'lit' ? 1.5 : 0);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  // a circle's rim under the pointer (flat pictures): dragging it sets the radius
  // a radius with a unit (2cm) is on the page, unscaled; a plain one is in the picture's units
  function ringGeom(Lx: any, g: any) {
    const C = S(g.c.s);
    if (g.abs) return { C, R: g.r * E.view.k };
    const E1 = S(Lx.view.P([g.c.m[0] + g.r, g.c.m[1], g.c.m[2]]));
    return { C, R: Math.hypot(E1[0] - C[0], E1[1] - C[1]) };
  }
  function ringAt(e: any, px = 5) {
    if (!FLAT) return null;
    const Lx = L(), [x, y] = pos(e);
    let best = null, bd = px;
    for (const g of Lx.rings || []) {
      const { C, R } = ringGeom(Lx, g);
      if (R < 8) continue;
      const d = Math.abs(Math.hypot(x - C[0], y - C[1]) - R);
      if (d <= bd) { bd = d; best = g; }
    }
    return best;
  }
  const ringKey = (g: any) => g && `${g.si}:${g.span.s}`;
  // a circle moves with its rim (and its centre); its radius has a square at the top right of the rim
  const ringMoves = (Lx: any, g: any) => !!(Lx.moves && Lx.moves.has(g.si));
  function knobPos(Lx: any, g: any) { const { C, R } = ringGeom(Lx, g), a = Math.SQRT1_2; return [C[0] + R * a, C[1] - R * a]; }
  // the squares on show: the hovered circle's, the selected command's, the one being dragged
  function knobRings(Lx: any) {
    const d = E.drag, hk = E.hover && E.hover.ring && ringKey(E.hover.ring), dk = d && d.mode === 'radius' && ringKey(d.ring);
    return (Lx.rings || []).filter((g: any) => g.writable && ringGeom(Lx, g).R >= 8 && (ringKey(g) === hk || ringKey(g) === dk || g.si === E.sel));
  }
  // a selected angle mark: a square on the mark sizes it, a dot at its label moves the label in or out
  function picKnobs(Lx: any) {
    if (E.sel == null || E.many) return [];
    const pc = (Lx.pics || []).find((x: any) => x.si === E.sel);
    if (!pc) return [];
    const out = [{ which: 'r', pc, at: S(pc.mid) }];
    if (pc.label) out.push({ which: 'lab', pc, at: S(pc.lab) });
    return out;
  }
  function picKnobAt(e: any) {
    const [x, y] = pos(e);
    return picKnobs(L()).find((k) => Math.hypot(x - k.at[0], y - k.at[1]) <= (k.which === 'lab' ? 10 : 7)) || null;
  }
  function knobAt(e: any) {
    if (!FLAT) return null;
    const Lx = L(), [x, y] = pos(e);
    for (const g of knobRings(Lx)) { const K = knobPos(Lx, g); if (Math.max(Math.abs(x - K[0]), Math.abs(y - K[1])) <= 7) return g; }
    return null;
  }
  const itemAt = (e: any) => { const h = hitAt(e); return h ? h.si : null; };
  // a path's stroke or fill (not a label) that moves as a whole in a flat picture
  function bodyAt(e: any) {
    if (!FLAT) return null;
    const h = hitAt(e), Lx = L();
    if (!h || h.k === 'text' || !Lx.moves || !Lx.moves.has(h.si)) return null;
    // a circle moves by its rim or its centre, not its inside
    if (h.k === 'poly' && (Lx.rings || []).some((g: any) => g.si === h.si)) return null;
    return h.si;
  }
  function hitAt(e: any) {
    const Lx = L(), [x, y] = pos(e), f = fitOf();
    const items = Lx.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.k === 'text') {
        const b = TD.textBox(it.text, V3.NORMAL), q = G.labelAt(it, S(it.at), b);
        if (Math.abs(x - q[0]) <= b.w / 2 + 3 && Math.abs(y - q[1]) <= b.h / 2 + 3) return { si: it.si, k: 'text' };
      } else if (it.k === 'line') {
        const P = it.pts.map(S);
        for (let j = 1; j < P.length; j++) if (segDist(x, y, P[j - 1], P[j]) <= 5) return { si: it.si, k: 'line' };
      } else if (it.k === 'ball') {
        const [X, Y] = S(it.at); if (Math.hypot(X - x, Y - y) <= it.r * f.k) return { si: it.si, k: 'ball' };
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.k === 'poly' && inside(it.pts.map(S), x, y)) return { si: it.si, k: 'poly' };
    }
    return null;
  }
  const segDist = (x: any, y: any, a: any, b: any) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); };
  function inside(P: any, x: any, y: any) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  // a screen position back to 3D: on the level plane z = z0 through the point, or (up) along z from m0
  function unproject(vw: any, sx: any, sy: any, m0: any, up: any, d0?: any) {
    const X = (sx - E.view.ox) / E.view.k, Y = (E.view.oy - sy) / E.view.k;
    if (up) { const dz = (d0[1] - sy) / E.view.k / Math.max(0.15, vw.st); return [m0[0], m0[1], m0[2] + dz]; }
    const z = m0[2], ct = Math.abs(vw.ct) < 0.12 ? 0.12 * Math.sign(vw.ct || 1) : vw.ct;
    const u = (Y - z * vw.st) / ct;
    return [X * vw.cp - u * vw.sp, X * vw.sp + u * vw.cp, z];
  }
  const snapV = (v: any, on: any) => (on ? Math.round(v * 20) / 20 : Math.round(v * 1000) / 1000);

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, Lx = L(), f = fitOf();
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>`;
    // the xy-plane's unit grid, faint, for orientation
    const vw = Lx.view, g = [];
    if (FLAT) {
      // a faint unit grid across the view (every 5 units when zoomed far out)
      const k = E.view.k, st = k < 14 ? 5 : 1, x0 = Math.floor(-E.view.ox / k / st) * st, x1 = (W - E.view.ox) / k, y0 = Math.floor((E.view.oy - H) / k / st) * st, y1 = E.view.oy / k;
      let d = '';
      for (let x = x0; x <= x1; x += st) d += `M${r2(E.view.ox + x * k)},0V${r2(H)}`;
      for (let y = y0; y <= y1; y += st) d += `M0,${r2(E.view.oy - y * k)}H${r2(W)}`;
      out += `<path class="g3-grid" d="${d}"/>`;
    } else {
      for (let i = -2; i <= 2; i++) { g.push([[i, -2, 0], [i, 2, 0]]); g.push([[-2, i, 0], [2, i, 0]]); }
      out += `<path class="g3-grid" d="${g.map(([a, b]) => { const A = S(vw.P(a)), B = S(vw.P(b)); return `M${r2(A[0])},${r2(A[1])}L${r2(B[0])},${r2(B[1])}`; }).join('')}"/>`;
    }
    // a path under the pointer that drags as a whole: a faint halo
    const hb = E.drag && E.drag.mode === 'shift' ? E.drag.si : E.hover && E.hover.body;
    if (hb != null && hb !== E.sel && !inMany(hb)) for (const it of Lx.items) if (it.si === hb && (it.k === 'line' || it.k === 'poly')) out += `<path class="g3-hov" d="${it.pts.map((p: any, i: any) => { const q = S(p); return `${i ? 'L' : 'M'}${r2(q[0])},${r2(q[1])}`; }).join('')}${it.k === 'poly' ? 'Z' : ''}"/>`;
    // the selected command, as a halo under the drawing
    if (E.sel != null || E.many) {
      for (const it of Lx.items) {
        if (it.si !== E.sel && !inMany(it.si)) continue;
        if (it.k === 'line' || it.k === 'poly') out += `<path class="ze-wsel" d="${it.pts.map((p: any, i: any) => { const q = S(p); return `${i ? 'L' : 'M'}${r2(q[0])},${r2(q[1])}`; }).join('')}${it.k === 'poly' ? 'Z' : ''}" stroke-width="9"/>`;
        else if (it.k === 'text') { const b = TD.textBox(it.text, V3.NORMAL), q = G.labelAt(it, S(it.at), b); out += `<rect class="g3-tsel" x="${r2(q[0] - b.w / 2 - 3)}" y="${r2(q[1] - b.h / 2 - 2)}" width="${r2(b.w + 6)}" height="${r2(b.h + 4)}" rx="4"/>`; }
        else if (it.k === 'ball') { const q = S(it.at); out += `<circle class="ze-wsel" cx="${r2(q[0])}" cy="${r2(q[1])}" r="${r2(it.r * f.k)}" stroke-width="9"/>`; }
      }
    }
    if (!Lx.empty) { try { out += V3.svg(Lx.items, f, { export: true }); } catch (e: any) { /* drawn next time */ } }
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(t('editor.g3.empty', 'Add axes or a point from the left to start'))}</text>`;
    // a circle's rim under the pointer or being dragged
    const rg = E.drag && (E.drag.mode === 'radius' || E.drag.mode === 'shift') ? E.drag.ring : E.hover && E.hover.ring;
    if (rg) { const g = (Lx.rings || []).find((x: any) => ringKey(x) === ringKey(rg)); if (g && (g.writable || ringMoves(Lx, g))) { const { C, R } = ringGeom(Lx, g); out += `<circle class="g3-ring" cx="${r2(C[0])}" cy="${r2(C[1])}" r="${r2(R)}"/>`; } }
    // the square that sizes a circle, at the top right of its rim
    for (const g of knobRings(Lx)) {
      const K = knobPos(Lx, g), on = (E.hover && E.hover.knob && ringKey(E.hover.ring) === ringKey(g)) || (E.drag && E.drag.mode === 'radius' && ringKey(E.drag.ring) === ringKey(g));
      out += `<rect class="g3-knob${on ? ' on' : ''}" x="${r2(K[0] - 4)}" y="${r2(K[1] - 4)}" width="8" height="8"/>`;
    }
    for (const k of picKnobs(Lx)) {
      const on = (E.drag && E.drag.mode === 'pic' && E.drag.which === k.which) || (E.hover && E.hover.pic === k.which);
      if (k.which === 'r') out += `<rect class="g3-knob${on ? ' on' : ''}" x="${r2(k.at[0] - 4)}" y="${r2(k.at[1] - 4)}" width="8" height="8"/>`;
      else out += `<circle class="g3-knob${on ? ' on' : ''}" cx="${r2(k.at[0])}" cy="${r2(k.at[1])}" r="10" fill-opacity="${on ? 0.25 : 0}"/>`;
    }
    // points that can be dragged
    for (const h of Lx.handles) {
      const [X, Y] = S(h.at.s), on = E.sel === h.si || inMany(h.si), hov = E.hover && E.hover.h === h;
      if (on) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="7"/>`;
      else if (hov) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}" r="7"/>`;
      out += `<circle class="${h.kind === 'lit' ? 'g3-lit' : 'g3-pt'}${h.writable ? '' : ' off'}" cx="${r2(X)}" cy="${r2(Y)}" r="${h.kind === 'lit' ? 2.5 : 3.2}"/>`;
    }
    // a point being moved: its shadow on the xy-plane, so its height reads
    const d = E.drag;
    if (!FLAT && d && d.mode === 'move' && d.moved && d.m) {
      const A = S(vw.P(d.m)), B = S(vw.P([d.m[0], d.m[1], 0]));
      out += `<path class="g3-drop" d="M${r2(A[0])},${r2(A[1])}L${r2(B[0])},${r2(B[1])}"/><circle class="g3-shadow" cx="${r2(B[0])}" cy="${r2(B[1])}" r="2.5"/>`;
    }
    // the view's turn, bottom left: the three axes as they now point
    const O = [44, H - 40], ax = [[1, 0, 0, 'x'], [0, 1, 0, 'y'], [0, 0, 1, 'z']];
    if (!FLAT) out += `<g class="g3-gizmo">${ax.map(([a, b, c, n]) => { const p = vw.P([a, b, c]); const X = O[0] + p[0] * 22, Y = O[1] - p[1] * 22; return `<path d="M${O[0]},${O[1]}L${r2(X)},${r2(Y)}"/><text x="${r2(O[0] + p[0] * 31)}" y="${r2(O[1] - p[1] * 31 + 4)}">${n}</text>`; }).join('')}<text class="g3-ang" x="${O[0] + 34}" y="${O[1] + 28}">θ ${fmt(vw.th, 0)}°  φ ${fmt(vw.ph, 0)}°</text></g>`;
    if (E.pick && E.pickAt) {
      const k = E.pickAt, ray = (m: any) => { const [x, y] = S(m), l = Math.hypot(x - k.x, y - k.y) || 1; return [k.x + (x - k.x) / l * 22, k.y + (y - k.y) / l * 22]; };
      const [ax, ay] = ray(k.a), [bx, by] = ray(k.b);
      out += `<path class="anglepick" d="M${r2(ax)} ${r2(ay)} L${r2(k.x)} ${r2(k.y)} L${r2(bx)} ${r2(by)}"/><circle class="anglepick" cx="${r2(k.x)}" cy="${r2(k.y)}" r="4"/>`;
    }
    if (d && d.mode === 'marquee' && d.moved) out += `<rect class="marquee${d.x < d.sx ? ' cross' : ''}" x="${r2(Math.min(d.sx, d.x))}" y="${r2(Math.min(d.sy, d.y))}" width="${r2(Math.abs(d.x - d.sx))}" height="${r2(Math.abs(d.y - d.sy))}"/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; svg.style.cursor = 'grabbing'; return; }
    if (E.pick) { markCorner(sx, sy); return; }
    const prior = E.many ? E.many.slice() : E.sel != null ? [E.sel] : [];
    if (E.many) {
      const hit = FLAT && !handleAt(e) ? (ringAt(e) || {}).si ?? itemAt(e) : null;
      if (hit != null && inMany(hit)) { E.drag = { mode: 'shift', si: E.many.slice(), sx, sy, moved: false }; svg.style.cursor = 'move'; return; }
      E.many = null;
    }
    const pk = picKnobAt(e);
    if (pk) { E.drag = { mode: 'pic', which: pk.which, si: pk.pc.si, sx, sy, moved: false }; svg.style.cursor = pk.which === 'r' ? 'nesw-resize' : 'move'; return; }
    const kn = knobAt(e);
    if (kn) { E.sel = kn.si; E.drag = { mode: 'radius', ring: kn, sx, sy, moved: false }; svg.style.cursor = 'nesw-resize'; draw(); renderProps(); return; }
    const h = handleAt(e);
    if (h) {
      E.sel = h.si;
      E.drag = h.writable ? { mode: 'move', h, sx, sy, m0: h.at.m.slice(), m: null, moved: false, si: h.si } : null;
      if (!h.writable) setTip(t('editor.g3.tip.pointComputed', 'This point is computed in the code: change it there'));
      draw(); renderProps(); return;
    }
    const rg = ringAt(e);
    if (rg && !dbl) {
      // the rim moves the circle; the square at its top right sizes it
      E.sel = rg.si;
      const mv = ringMoves(L(), rg);
      E.drag = mv ? { mode: 'shift', si: rg.si, ring: rg, sx, sy, moved: false } : null;
      if (mv) svg.style.cursor = 'move';
      else setTip(rg.writable ? t('editor.g3.tip.centreComputed', 'This centre is computed in the code: drag the square to resize') : t('editor.g3.tip.circleComputed', 'This circle is computed in the code: change it there'));
      draw(); renderProps(); return;
    }
    const si = itemAt(e);
    if (si != null) {
      if (dbl && E.sel === si) { editLabel(si); return; }
      // a path's stroke or fill in a flat picture: dragging it moves the whole object
      const bs = bodyAt(e);
      E.sel = si; E.drag = bs != null ? { mode: 'shift', si: bs, sx, sy, moved: false } : null;
      if (bs != null) svg.style.cursor = 'move';
      draw(); renderProps(); return;
    }
    // empty space: turn the view (a flat picture: a marquee selects; Space-drag moves the view)
    if (FLAT) {
      const base = e.shiftKey ? prior : [];
      E.sel = null; E.many = null; E.drag = { mode: 'marquee', sx, sy, x: sx, y: sy, base, moved: false };
      draw(); renderProps(); return;
    }
    const vw = L().view;
    E.sel = null; E.drag = { mode: 'orbit', sx, sy, th: vw.th, ph: vw.ph, idle: true };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d && E.pick) { E.pickAt = cornerAt(sx, sy); draw(); return; }
    if (!d) {
      const pk = picKnobAt(e);
      if (pk || (E.hover && E.hover.pic)) {
        const was = E.hover && E.hover.pic;
        E.hover = pk ? { pic: pk.which } : null;
        if (pk) { svg.style.cursor = pk.which === 'r' ? 'nesw-resize' : 'move'; if (was !== pk.which) draw(); return; }
        draw();
      }
      const kn = knobAt(e), h = kn ? null : handleAt(e), rg = kn || h ? null : ringAt(e), si = kn || h || rg ? null : itemAt(e), body = si != null ? bodyAt(e) : null;
      const hv = kn ? { ring: kn, knob: true } : h ? { h } : rg ? { ring: rg } : si != null ? { si, body } : null;
      const ch = (hv && hv.h) !== (E.hover && E.hover.h) || ringKey(hv && hv.ring) !== ringKey(E.hover && E.hover.ring) || !!(hv && hv.knob) !== !!(E.hover && E.hover.knob) || (hv && hv.body) !== (E.hover && E.hover.body);
      E.hover = hv;
      const manyHit = E.many && FLAT && !h && (rg ? inMany(rg.si) : si != null && inMany(si));
      svg.style.cursor = manyHit ? 'move' : kn ? 'nesw-resize' : h ? (h.writable ? 'move' : 'not-allowed') : rg ? (ringMoves(L(), rg) ? 'move' : rg.writable ? 'default' : 'not-allowed') : body != null ? 'move' : si != null ? 'pointer' : E.space || !FLAT ? 'grab' : 'default';
      if (ch) draw();
      return;
    }
    if (d.mode === 'marquee') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.moved = true; d.x = sx; d.y = sy;
      marqueeSelect(d);
      draw(); return;
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
    if (d.mode === 'shift') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; d.src0 = E.src; }
      // the offset snaps to 0.05 (⌥ moves freely), so points on the grid stay on it
      const L0 = G.layout(d.src0, FLAT), snap = !e.altKey;
      const a = unproject(L0.view, d.sx, d.sy, [0, 0, 0], false), b = unproject(L0.view, sx, sy, [0, 0, 0], false);
      const dv = [snapV(b[0] - a[0], snap), snapV(b[1] - a[1], snap), 0];
      const ed = G.shiftEdits(L0, d.si, dv);
      if (ed) E.src = G.edits(d.src0, ed);
      setTip(`moved by (${fmt(dv[0], 2)}, ${fmt(dv[1], 2)})${snap ? '  ·  ⌥ moves freely' : ''}`);
      draw(); renderProps(); return;
    }
    if (d.mode === 'pic') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; d.src0 = E.src; }
      // against the code as it was when the drag started: the size in steps of 0.5mm, the label's distance in steps of 0.05 (⌥ free)
      const L0 = G.layout(d.src0, FLAT), pc = (L0.pics || []).find((x: any) => x.si === d.si), st = L0.S[d.si], snap = !e.altKey;
      if (!pc || !st) return;
      const B = S(pc.B), M = S(pc.mid), unit = Math.hypot(M[0] - B[0], M[1] - B[1]) / pc.r, dist = Math.hypot(sx - B[0], sy - B[1]) / (unit || 1);
      let ed, msg;
      if (d.which === 'r') {
        const mm = Math.max(1, snap ? Math.round(dist * 20) / 2 : Math.round(dist * 100) / 10);
        msg = `angle radius=${fmt(mm, 1)}mm`;
        ed = G.setOpt(L0, st, (o: any) => o.k === 'angle radius', msg);
      } else {
        const ec = Math.max(0, snap ? Math.round((dist / (pc.r * pc.k2)) * 20) / 20 : Math.round((dist / (pc.r * pc.k2)) * 1000) / 1000);
        msg = `angle eccentricity=${fmt(ec, 3)}`;
        ed = G.setOpt(L0, st, (o: any) => o.k === 'angle eccentricity', msg);
      }
      E.src = G.edits(d.src0, ed);
      setTip(`${msg}${snap ? '  ·  ⌥ moves freely' : ''}`);
      draw(); renderProps(); return;
    }
    if (d.mode === 'radius') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; d.src0 = E.src; }
      // against the code as it was when the drag started; the radius snaps to 0.05 (⌥ sizes freely)
      const L0 = G.layout(d.src0, FLAT), g = (L0.rings || []).find((x: any) => ringKey(x) === ringKey(d.ring)) || d.ring, snap = !e.altKey;
      const { C, R } = ringGeom(L0, g);
      const r = Math.max(snap ? 0.05 : 0.001, snapV((g.r * Math.hypot(sx - C[0], sy - C[1])) / (R || 1), snap));
      const ed = G.setRadius(L0, g, r);
      E.src = G.edits(d.src0, [ed]);
      svg.style.cursor = 'nesw-resize';
      setTip(`r ${ed.t}${snap ? '  ·  ⌥ sizes freely' : ''}`);
      draw(); renderProps(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      if (!d.moved) { begin(); d.moved = true; d.src0 = E.src; }
      // the edits are made against the code as it was when the drag started
      const L0 = G.layout(d.src0, FLAT), h = L0.handles.find((x: any) => x.si === d.si && Math.hypot(x.at.s[0] - d.h.at.s[0], x.at.s[1] - d.h.at.s[1]) < 1e-9) || d.h;
      const up = !FLAT && e.shiftKey, snap = !e.altKey;
      if (up !== d.up) { d.up = up; d.sx = sx; d.sy = sy; d.m0 = d.m || d.m0; }
      const S0 = S(L0.view.P(d.m0));
      let m = unproject(L0.view, S0[0] + (sx - d.sx), S0[1] + (sy - d.sy), d.m0, up, [d.sx, d.sy]);
      // ⇧ in 2D: a 15° step along a line, or a whole point, whichever is nearer
      const ang = FLAT && e.shiftKey ? angleSnap(L0, d.m0, m, snap) : null;
      if (up) m = [d.m0[0], d.m0[1], snapV(m[2], snap)];
      else if (ang) m = ang.m;
      else if (FLAT && h.polar) {
        // (angle:radius) snaps its radius to 0.05 and its angle to whole degrees
        const rr = snapV(Math.hypot(m[0], m[1]), snap), aa = Math.atan2(m[1], m[0]) / D2R, a2 = snap ? Math.round(aa) : Math.round(aa * 10) / 10;
        m = [rr * Math.cos(a2 * D2R), rr * Math.sin(a2 * D2R), 0];
      } else m = [snapV(m[0], snap), snapV(m[1], snap), d.m0[2]];
      d.m = m;
      E.src = G.edits(d.src0, G.moveHandle(L0, h, m, ang && ang.a != null ? 3 : 2));
      if (FLAT) setTip(`${h.polar ? `r ${fmt(Math.hypot(m[0], m[1]), 2)}  θ ${fmt(Math.atan2(m[1], m[0]) / D2R, 1)}°` : `(${fmt(m[0], 2)}, ${fmt(m[1], 2)})`}${ang ? (ang.a != null ? `  ·  ${fmt(ang.a, 0)}°` : '') : (L0.links || []).some((k: any) => near(k[0], d.m0) || near(k[1], d.m0)) ? '  ·  ⇧ 15° or whole numbers' : '  ·  ⇧ whole numbers'}${snap ? '  ·  ⌥ places freely' : ''}`);
      else setTip(`(${m.map((v) => fmt(v, 2)).join(', ')})  ·  ${up ? 'up and down' : '⇧ moves up and down'}${snap ? ' · ⌥ places freely' : ''}`);
      draw(); renderProps(); return;
    }
  });
  // ⇧ in 2D: whichever is nearer m, the nearest whole point (x and y integers) or the nearest 15° direction
  // from a point p is joined to by a straight segment (its length on the 0.05 grid). ⌥: the direction only,
  // at any length. a is the angle when the direction won, else null.
  const near = (a: any, b: any) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  function angleSnap(L0: any, p: any, m: any, snap: any) {
    const others = (L0.links || []).flatMap((k: any) => (near(k[0], p) ? [k[1]] : near(k[1], p) ? [k[0]] : [])).filter((o: any) => !near(o, p));
    const z = p[2] || 0;
    let best: any = snap ? { m: [Math.round(m[0]), Math.round(m[1]), z], a: null } : null;
    if (best) best.dist = Math.hypot(best.m[0] - m[0], best.m[1] - m[1]);
    for (const o of others) {
      const vx = m[0] - o[0], vy = m[1] - o[1];
      if (Math.hypot(vx, vy) < 1e-9) continue;
      const a = Math.round(Math.atan2(vy, vx) / D2R / 15) * 15, ux = Math.cos(a * D2R), uy = Math.sin(a * D2R);
      const len = Math.max(snapV(vx * ux + vy * uy, snap), 0), q = [o[0] + len * ux, o[1] + len * uy, z];
      const dist = Math.hypot(q[0] - m[0], q[1] - m[1]);
      if (!best || dist < best.dist) best = { m: q, a: ((a % 360) + 360) % 360, dist };
    }
    return best;
  }
  // the marquee: left to right takes commands wholly inside it, right to left anything it touches (as on the canvas)
  function marqueeSelect(d: any) {
    const x1 = Math.min(d.sx, d.x), x2 = Math.max(d.sx, d.x), y1 = Math.min(d.sy, d.y), y2 = Math.max(d.sy, d.y), cross = d.x < d.sx;
    const inR = (q: any) => q[0] >= x1 && q[0] <= x2 && q[1] >= y1 && q[1] <= y2;
    // does the segment a-b meet the rect? (an end inside, or it crosses one of the four sides)
    const seg = (a: any, b: any) => {
      if (inR(a) || inR(b)) return true;
      const X = (p: any, q: any, r: any, s: any) => { const d1 = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (!d1) return false; const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d1, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d1; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
      const c = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      return c.some((p, i) => X(a, b, p, c[(i + 1) % 4]));
    };
    const Lx = L(), f = fitOf(), pts = new Map(), segs = new Map();
    const add = (m: any, si: any, v: any) => { if (!m.has(si)) m.set(si, []); m.get(si).push(v); };
    for (const it of Lx.items) {
      if (it.k === 'line' || it.k === 'poly') {
        const q = it.pts.map(S);
        q.forEach((p: any) => add(pts, it.si, p));
        for (let i = 1; i < q.length; i++) add(segs, it.si, [q[i - 1], q[i]]);
        if (it.k === 'poly' && q.length > 2) add(segs, it.si, [q[q.length - 1], q[0]]);
      } else if (it.k === 'ball') { const c = S(it.at), r = it.r * f.k; [[-r, 0], [r, 0], [0, -r], [0, r]].forEach(([a, b]) => add(pts, it.si, [c[0] + a, c[1] + b])); }
      else if (it.at) add(pts, it.si, S(it.at));
    }
    for (const h of Lx.handles) add(pts, h.si, S(h.at.s));
    const sel = new Set(d.base);
    Lx.S.forEach((x: any, si: any) => {
      if (!drawable(x) || ['main', 'macro'].includes(x.k)) return;
      const P = pts.get(si);
      if (!P || !P.length) return;
      if (P.every(inR) || (cross && (P.some(inR) || (segs.get(si) || []).some(([a, b]: any) => seg(a, b))))) sel.add(si);
    });
    const all = [...sel].sort((a, b) => (a as any) - (b as any));
    E.sel = all.length === 1 ? all[0] : null; E.many = all.length > 1 ? all : null;
  }
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    svg.style.cursor = E.space ? 'grab' : '';
    if ((d.mode === 'orbit' && !d.idle) || ((d.mode === 'move' || d.mode === 'radius' || d.mode === 'shift' || d.mode === 'pic') && d.moved)) { setTip(''); commit(); renderProps(); }
    if (d.mode === 'pan' && FLAT && Math.hypot(d.ox - E.view.ox, d.oy - E.view.oy) < 1) renderProps();
    if (d.mode === 'marquee') { if (!d.moved && d.base.length) { E.sel = d.base.length === 1 ? d.base[0] : null; E.many = d.base.length > 1 ? d.base : null; } renderProps(); }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });

  // right-click: the command's actions
  const MI: Record<string, any> = {
    label: '<path d="M4 15l2-5 6-6 3 3-6 6zM11 5l3 3"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    dup: '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 12V5.5A1.5 1.5 0 015.5 4H12"/>',
    fwd: '<path d="M10 16V4M5 9l5-5 5 5"/>',
    back: '<path d="M10 4v12M5 11l5 5 5-5"/>',
  };
  const mItem = (act: any, label: any, icon: any, key: any) => `<button class="ctx-item${act === 'del' ? ' danger' : ''}" data-gm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${esc(label)}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const h = handleAt(e), si = h ? h.si : itemAt(e);
    if (si == null) { closeMenu(); return; }
    E.sel = si; E.many = null;
    const st = selSt();
    menu.innerHTML = (labelOf(si) ? mItem('label', t('ctx.editLabel', 'Edit Label'), 'label', '↩') : '') + mItem('dup', t('ui.duplicate', 'Duplicate'), 'dup', isMac ? '⌘D' : 'Ctrl+D') + '<hr>'
      + mItem('fwd', t('editor.commonA.drawLater', 'Draw Later'), 'fwd', ']') + mItem('back', t('editor.commonA.drawEarlier', 'Draw Earlier'), 'back', '[') + '<hr>' + mItem('del', st && (st.k === 'coordinate' || st.k === 'setcoord') ? t('editor.g3.deletePoint', 'Delete Point') : t('ui.delete', 'Delete'), 'del', '⌫');
    draw(); renderProps();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => { const b = (e.target! as Element).closest('[data-gm]'); if (!b) return; closeMenu(); act((b as HTMLElement).dataset.gm); });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !(e.target! as Element).closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- labels
  // a command's label: the text of its (last) node, or of the arc / node statement itself
  // (Lx: the layout of the code being edited, when that isn't the current code)
  function labelOf(si: any, Lx = L()) {
    const st = Lx.S[si];
    if (!st) return null;
    if (st.k === 'node' && st.text) return { span: st.text };
    if (st.k === 'arc') return { span: st.text };
    if (st.k === 'path') { const nodes = st.els.filter((x: any) => x.t === 'node' && x.text); if (nodes.length) return { span: nodes[nodes.length - 1].text, node: nodes[nodes.length - 1] }; }
    return null;
  }
  const mathOf = (t: any) => { const m = /^\s*\$([\s\S]*)\$\s*$/.exec(t); return m ? m[1] : t; };
  // a label mid-typing (\vec{ or a trailing \) must not break the code around it: an unmatched } is
  // dropped, an open { is closed, a lone trailing backslash is left out
  function balanced(t: any) {
    let out = '', depth = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') { if (i + 1 < t.length) out += c + t[++i]; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (!depth) continue; depth--; }
      out += c;
    }
    return out + '}'.repeat(depth);
  }
  const wrapMath = (t: any) => { const v = balanced(mathOf(String(t)).trim()); return v ? `$${v}$` : ''; };
  // write a label (math) for a command: into its node, or as a new node at the end of a path
  function setLabel(src: any, si: any, t: any) {
    const Lx = G.layout(src, FLAT), st = Lx.S[si], lb = labelOf(si, Lx);
    // emptied: a path's label node goes, with the space before it
    if (lb && lb.node && !String(t).trim()) { let s0 = lb.node.s; while (s0 > 0 && /[ \t]/.test(src[s0 - 1])) s0--; return src.slice(0, s0) + src.slice(lb.node.e); }
    if (lb) return G.edits(src, [{ ...lb.span, t: wrapMath(t) }]);
    if (st && st.k === 'path' && t) return G.edits(src, [{ s: st.e - 1, e: st.e - 1, t: ` node[above]{${wrapMath(t)}}` }]);
    if (st && (st.k === 'coordinate' || st.k === 'setcoord') && t) {
      const sp = lineSpan(st);
      const line = `${indentOf(st.s)}\\node[above right] at (${st.name}) {${wrapMath(t)}};`;
      return src.slice(0, sp.e) + (src[sp.e - 1] === '\n' ? '' : '\n') + line + (src[sp.e - 1] === '\n' ? '\n' : '') + src.slice(sp.e);
    }
    return src;
  }
  let Lb: any = null;
  function editLabel(si: any) {
    if (!TD.input) return false;
    const st = L().S[si];
    if (!st || !(labelOf(si) || st.k === 'path' || st.k === 'coordinate' || st.k === 'setcoord')) return false;
    closeLabel();
    begin();
    const lb = labelOf(si), me: any = (Lb = { si, base: E.src });
    me.pop = TD.input.popup(stage, {
      text: lb ? mathOf(text(lb.span)) : '', math: true, bare: true,
      at: () => labelPos(si),
      onInput: (t: any) => { E.src = setLabel(me.base, si, t); draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  function labelPos(si: any) {
    const Lx = L(), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    const t = Lx.items.find((it: any) => it.si === si && it.k === 'text') || Lx.items.find((it: any) => it.si === si && (it.pts || it.at));
    const h = Lx.handles.find((x: any) => x.si === si);
    const p = t ? (t.at || t.pts[t.pts.length - 1]) : h ? h.at.s : [0, 0];
    const [X, Y] = S(p);
    return [vr.left - sr.left + X, vr.top - sr.top + Y + 16];
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }

  // ---------------------------------------------------------------- properties
  const NUMRE = /^-?(\d+\.?\d*|\.\d+)$/;
  // a value field: numbers type straight in; an expression or macro is typed as code

  const COLORK = (o: any) => o.v == null && !!TD.tikzColor(o.k) && !G.WIDTHS[o.k];
  const WIDTH_OPTS = () => [['ultra thin', t('editor.g3.w.ultraThin', 'Ultra thin')], ['very thin', t('editor.g3.w.veryThin', 'Very thin')], ['thin', t('editor.g3.w.thin', 'Thin')], ['', t('ui.normal', 'Normal')], ['semithick', t('editor.g3.w.semithick', 'Semithick')], ['thick', t('editor.g3.w.thick', 'Thick')], ['very thick', t('editor.g3.w.veryThick', 'Very thick')], ['ultra thick', t('editor.g3.w.ultraThick', 'Ultra thick')]];
  const NAMES: Record<string, any> = { coordinate: 'Point', setcoord: 'Point (r, θ, φ)', node: 'Label', arc: 'Angle arc', rot: 'Rotated frame', rorig: 'Frame origin', rreset: 'Frame origin', tplane: 'Theta plane', main: 'View', macro: 'Value', cmd: 'Command', foreach: 'Loop', scope: 'Scope', pic: 'Angle mark' };
  function pathName(st: any) {
    const sty = G.styleOf(E.src, st.o), els = st.els;
    if (sty.ball) return 'Sphere';
    if (els.some((x: any) => x.t === 'grid')) return 'Grid';
    if (els.some((x: any) => x.t === 'plot')) return 'Curve';
    if (els.some((x: any) => x.t === 'circle')) return els.filter((x: any) => x.t === 'pt').length > 1 ? 'Path' : 'Circle';
    if (els.some((x: any) => x.t === 'cycle')) return st.cmd === 'draw' && !sty.fillOn ? 'Polygon' : 'Face';
    if (sty.arrow || sty.arrow0) return 'Vector';
    const n = els.filter((x: any) => x.t === 'pt').length;
    return n === 2 ? 'Segment' : 'Path';
  }
  function renderProps() {
    if (!E) return;
    const Lx = L(), st = selSt();
    const show = (title: string, rows: FormRow[], summary?: string) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), summary }] });
    const del = (text = t('ui.delete', 'Delete')) => actionRow('ge', 'del', text);
    const vf = (label: string, key: string, span: any) => field(label, key, text(span).trim(), { class: 'mono' });
    const col = (label: string, key: string, value: string, nullable = false) => ({ ...row(label, texColour(value === 'none' ? '' : TD.texColor.unwrap(value), { 'data-f': key }, nullable ? { nullable: true, defaultLabel: 'none', title: t('ui.fill', 'Fill') } : { title: t('ui.colour', 'Colour') })), controlClass: 'ctl tc' });
    if (E.many) {
      show(t('editor.g3.selection', 'Selection'), [note(...(FLAT ? [t('editor.g3.help.many', 'Drag any of them to move them together; it snaps to 0.05, hold '), { kbd: '⌥' } as const, t('editor.g3.help.manyFree', ' to move freely. ')] : []), { kbd: '⌫' }, t('editor.g3.help.deletes', ' deletes them; '), { kbd: 'Esc' }, t('editor.g3.help.clears', ' or a click elsewhere clears the selection.')), del(t('editor.g3.deleteAll', 'Delete All'))], commandsText(E.many.length)); return;
    }
    if (!st) {
      const scale = numField(t('ui.scale', 'Scale'), 'scale', fmt(Lx.scale, 2), '', { step: '0.25', min: '0.1' });
      const rows = FLAT ? [scale, note(t('editor.g3.help2d.a', 'Drag a point to move it; it snaps to 0.05, hold '), { kbd: '⇧' }, t('editor.g3.help2d.b', ' for 15° steps along a line or whole numbers, '), { kbd: '⌥' }, t('editor.g3.help2d.c', ' to place it freely. Drag a line or shape to move it whole (a circle by its rim; the square at its top right sizes it), drag across empty space to select (left to right: what lies wholly inside; right to left: anything it touches; '), { kbd: '⇧' }, t('editor.g3.help2d.d', ' adds), and hold '), { kbd: 'Space' }, t('editor.g3.help2d.e', ' to drag the view. Click a line or label to select what drew it; double-click to label it. '), { kbd: '⌘C' }, ' ', { kbd: '⌘X' }, ' ', { kbd: '⌘V' }, t('editor.g3.help2d.f', ' copy, cut and paste commands. Angle marks: pick one, then click inside a corner where two lines meet. Measures need two named points: select a segment between them, or a point.'))]
        : [numField(t('editor.g3.tilt', 'Tilt θ'), 'vth', fmt(Lx.view.th, 0), '°', { step: '5', min: '0', max: '180' }), numField(t('editor.g3.turn', 'Turn φ'), 'vph', fmt(Lx.view.ph, 0), '°', { step: '5' }), scale, note(t('editor.g3.help3d.a', 'Drag empty space to turn the view. Drag a point to move it level; hold '), { kbd: '⇧' }, t('editor.g3.help3d.b', ' to move it up and down, '), { kbd: '⌥' }, t('editor.g3.help3d.c', ' to place it freely. Click a line, face or label to select what drew it; double-click to label it. Add things from the left.'))];
      show(t('editor.g3.figure', 'Figure'), rows, commandsText(Lx.S.filter(drawable).length)); return;
    }
    const title = say(st.k === 'path' ? pathName(st) : NAMES[st.k] || 'Command');
    const rows: FormRow[] = [];
    if (st.k === 'coordinate' && st.atPt) {
      const comps = G.splitTop(E.src, st.atPt.is, st.atPt.ie), polar = FLAT && comps.length === 1 ? G.splitTop(E.src, st.atPt.is, st.atPt.ie, ':') : [];
      rows.push(field(t('ui.name', 'Name'), 'cname', st.name, { class: 'mono' }));
      if (comps.length === (FLAT ? 2 : 3)) rows.push(...comps.map((c: any, i: number) => vf('xyz'[i], `c${i}`, c)));
      else if (polar.length === 2) rows.push(vf(t('editor.g3.angleTheta', 'Angle θ'), 'q0', polar[0]), vf(t('editor.g3.radiusR', 'Radius r'), 'q1', polar[1]));
      else rows.push(vf(t('editor.g3.at', 'At'), 'at', { s: st.atPt.is, e: st.atPt.ie }));
      rows.push(field(t('ui.label', 'Label'), 'label', '', { 'data-tx': 'math', placeholder: 'add a label' }));
    } else if (st.k === 'setcoord') {
      rows.push(field(t('ui.name', 'Name'), 'cname', st.name, { class: 'mono' }), vf('r', 'sr', st.r), vf(t('editor.g3.thetaZ', 'θ from z'), 'sth', st.th), vf(t('editor.g3.phiX', 'φ from x'), 'sph', st.ph), note(`${st.simple ? '' : t('editor.g3.help.shadows', 'Also names its shadows ({name}xy), ({name}x), ({name}y), ({name}z)… for projections. ', { name: st.name })}${t('editor.g3.help.spoint', 'Drag the point, or type a number or a value such as {example}.', { example: '\\thetavec' })}`));
    } else if (st.k === 'path' || st.k === 'node' || st.k === 'arc') {
      const sty = G.styleOf(E.src, st.o), O = sty.items;
      const colorItem = O.find((o: any) => o.k === 'color' && o.v != null) || O.find(COLORK), color = colorItem ? (colorItem.v != null ? colorItem.v : colorItem.k) : 'black';
      const fillItem = O.find((o: any) => o.k === 'fill' && o.v != null), fill = fillItem ? fillItem.v : st.cmd === 'fill' || st.cmd === 'filldraw' ? color : 'none';
      const lb = labelOf(E.sel);
      if (st.k === 'path') rows.push({ kind: 'points', points: st.els.filter((x: any) => x.t === 'pt').map((p: any, i: number) => {
        const c = G.splitTop(E.src, p.is, p.ie);
        return c.length === (FLAT ? 2 : 3) && !p.rel ? c.map((x: any, j: number) => ({ kind: 'input', value: x.t, attrs: { type: 'text', class: 'mono', 'data-f': `p${i}:${j}`, 'aria-label': t('editor.g3.coordOf', '{axis} of point {n}', { axis: 'xyz'[j], n: i + 1 }), spellcheck: 'false' } })) : [{ kind: 'input', value: E.src.slice(p.is, p.ie), attrs: { type: 'text', class: 'mono wide', 'data-f': `p${i}`, 'aria-label': t('editor.g3.pointN', 'Point {n}', { n: i + 1 }), spellcheck: 'false' } }];
      }) });
      else if (st.k === 'node' && st.atPt) rows.push(vf(t('editor.g3.at', 'At'), 'at', { s: st.atPt.is, e: st.atPt.ie }));
      else if (st.k === 'arc') rows.push(vf(t('ui.centre', 'Centre'), 'ac', st.c), vf(t('ui.radius', 'Radius'), 'ar', st.r), vf(t('editor.g3.from', 'From'), 'a0', st.a0), vf(t('editor.g3.to', 'To'), 'a1', st.a1));
      rows.push(col(t('ui.colour', 'Colour'), st.k === 'node' ? 'tcolor' : 'color', color));
      if (st.k === 'path') {
        rows.push(sty.shade ? row(t('ui.fill', 'Fill'), { kind: 'input', value: O.filter((o: any) => / color$/.test(o.k)).map((o: any) => o.t).join(', '), attrs: { type: 'text', class: 'mono', readonly: true, tabindex: '-1', title: t('editor.g3.shading', 'A shading: change its colours in Options') } }) : col(t('ui.fill', 'Fill'), 'fill', fill, true));
        const op = O.find((o: any) => o.k === 'fill opacity' || o.k === 'opacity');
        rows.push(numField(t('ui.opacity', 'Opacity'), 'opacity', op ? op.v : 1, '', { min: '0', max: '1', step: '0.1' }));
      }
      if (st.k !== 'node') {
        const w = (O.find((o: any) => o.v == null && G.WIDTHS[o.k] != null) || { k: '' }).k;
        rows.push(segments(t('ui.line', 'Line'), 'dash', sty.dash ? (/dot/.test(sty.dash) ? 'dotted' : 'dashed') : '', [['', t('ui.solid', 'Solid')], ['dashed', t('ui.dashed', 'Dashed')], ['dotted', t('ui.dotted', 'Dotted')]]), row(t('ui.width', 'Width'), { kind: 'select', value: w, attrs: { 'data-f': 'width' }, options: WIDTH_OPTS() }));
        if (st.k === 'path') rows.push(segments(t('ui.arrow', 'Arrow'), 'arrow', `${sty.arrow0 ? 1 : 0}${sty.arrow ? 1 : 0}`, [['00', t('ui.none', 'None')], ['01', t('ui.end', 'End')], ['10', t('ui.start', 'Start')], ['11', t('editor.commonA.both', 'Both')]]));
        if (!FLAT) rows.push(segments(t('editor.g3.frame', 'Frame'), 'frame', sty.frame || 'main', [['main', t('editor.g3.frame.main', 'Main'), 'tdplot_main_coords'], ['rotated', t('editor.g3.frame.rotated', 'Rotated'), `tdplot_rotated_coords: ${t('editor.g3.frame.rotatedTitle', 'the frame set by {cmd}', { cmd: '\\tdplotsetrotatedcoords' })}`], ['screen', t('editor.g3.frame.screen', 'Screen'), `tdplot_screen_coords: ${t('editor.g3.frame.screenTitle', 'flat on the page')}`]]));
      }
      rows.push(field(t('ui.label', 'Label'), 'label', lb ? mathOf(text(lb.span)) : '', { 'data-tx': 'math', placeholder: 'none' }));
      if (lb || st.k === 'node' || st.k === 'arc') {
        const lo = st.k === 'arc' ? G.styleOf(E.src, st.lo) : G.styleOf(E.src, lb && lb.node ? lb.node.o : st.o), posv = Object.entries<any>(G.POS).find(([, a]) => a === lo.anchor);
        rows.push(row(t('ui.position', 'Position'), { kind: 'select', value: posv ? posv[0] : '', attrs: { 'data-f': 'lpos' }, options: [['', t('ui.centre', 'Centre')], ...Object.keys(G.POS).map(k => [k, sideName(k)])] }));
      }
      const known = (o: any) => COLORK(o) || ['color', 'fill', 'opacity', 'fill opacity', 'draw opacity'].includes(o.k) || G.WIDTHS[o.k] != null || ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k) || /^tdplot_/.test(o.k) || (o.v == null && /-/.test(o.k) && !/_/.test(o.k));
      rows.push(field(t('ui.options', 'Options'), 'rest', O.filter((o: any) => !known(o)).map((o: any) => o.t).join(', '), { class: 'mono', placeholder: t('editor.g3.otherOptions', 'other TikZ options') }));
    } else if (st.k === 'pic') {
      const O = st.o ? G.optList(E.src, st.o.s, st.o.e) : [], g = (k: string) => (O.find((o: any) => o.k === k) || {}).v, q = O.find((o: any) => o.k[0] === '"'), color = (O.find(COLORK) || {}).k || 'black';
      rows.push(field(t('ui.size', 'Size'), 'psize', g('angle radius') || '5mm', { class: 'mono', placeholder: '5mm' }), field(t('ui.label', 'Label'), 'plabel', q ? mathOf(q.k.replace(/^"|"$/g, '')) : '', { 'data-tx': 'math', placeholder: 'none' }));
      if (q) rows.push(numField(t('editor.g3.distance', 'Distance'), 'pecc', g('angle eccentricity') || '0.6', '', { min: '0', step: '0.05', title: t('editor.g3.distanceTitle', 'Where the label sits, as a share of the size: 0 is the corner, 1 the mark, more is outside') }));
      rows.push(col(t('ui.colour', 'Colour'), 'color', color), note(t('editor.g3.help.pic', 'Drag the square to size the mark, and its label to move it in or out.')));
    } else if (st.k === 'foreach') rows.push(field(t('editor.g3.values', 'Values'), 'fl', text(st.list), { class: 'mono' }), note(t('editor.g3.help.foreach', 'Repeats its body for each value of '), ...st.vars.flatMap((v: string, i: number) => [...(i ? [', '] : []), { code: `\\${v}` }]), '; ', { code: 'a,b,...,c' }, t('editor.g3.help.foreachRest', ' counts from a to c in steps of b − a. Its parts are drawn but not dragged: change them in the code.')));
    else if (st.k === 'scope') rows.push(...(st.o ? [field(t('ui.options', 'Options'), 'so', text(st.o), { class: 'mono' })] : []), note(t('editor.g3.help.scope', 'Its options (colours, frames, '), { code: 'declare function' }, t('editor.g3.help.scopeRest', ') apply to everything inside.')));
    else if (st.k === 'rot') rows.push(vf(t('editor.g3.about', '{angle} about {axis}', { angle: 'α', axis: 'z' }), 'ra', st.a), vf(t('editor.g3.about', '{angle} about {axis}', { angle: 'β', axis: 'y' }), 'rb', st.b), vf(t('editor.g3.about', '{angle} about {axis}', { angle: 'γ', axis: 'z' }), 'rg', st.g), note(t('editor.g3.help.rot', 'Euler angles (z, y, z) of the frame that '), { code: 'tdplot_rotated_coords' }, t('editor.g3.help.rotRest', ' draws in, from here on.')));
    else if (st.k === 'tplane') rows.push(vf('φ', 'tp', st.ph), note(t('editor.g3.help.tplane', 'From here on, '), { code: 'tdplot_rotated_coords' }, t('editor.g3.help.tplaneRest', ' is the plane through the z-axis at angle φ: its x-axis is z, so an arc from 0 to θ there measures the angle from z.')));
    else if (st.k === 'rorig') rows.push(vf(t('editor.g3.origin', 'Origin'), 'ro', st.at));
    else if (st.k === 'macro') rows.push(field(t('editor.g3.value', 'Value'), 'mv', text(st.v), { class: 'mono' }), note(t('editor.g3.help.macro', 'Used as '), { code: `\\${st.name}` }, t('editor.g3.help.macroRest', '. Dragging a point that uses it changes it here.')));
    else if (st.k === 'main') rows.push(vf(t('editor.g3.tilt', 'Tilt θ'), 'mth', st.th), vf(t('editor.g3.turn', 'Turn φ'), 'mph', st.ph));
    else rows.push(note(t('editor.g3.help.kept', 'Kept in the code as written.')));
    if (st.k !== 'main') rows.push({ kind: 'actions', class: 'row', buttons: [{ text: t('ui.duplicate', 'Duplicate'), attrs: { 'data-ge': 'dup' } }, { text: st.k === 'coordinate' || st.k === 'setcoord' ? t('editor.g3.deletePoint', 'Delete Point') : t('ui.delete', 'Delete'), attrs: { class: 'danger', 'data-ge': 'del' } }] });
    show(title, rows, t('editor.g3.lineN', 'line {n}', { n: E.src.slice(0, st.s).split('\n').length }));
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { begin(); E.base = E.src; } });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { E.base = null; commit(); renderProps(); } });
  // each keystroke rewrites the code from what it was when the field took focus, so a field never fights itself
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f || !E) return;
    const base = E.base != null ? E.base : E.src;
    const out = applyField(base, f, t.value);
    if (out == null) return;
    E.src = out; clampSel(); draw();
    if (t.tagName === 'SELECT') { commit(); E.base = E.src; begin(); renderProps(); }
  });
  function applyField(src: any, f: any, v: any) {
    const Lx = G.layout(src, FLAT), st = E.sel != null ? Lx.S[E.sel] : null;
    const val = v.trim();
    const sp = (x: any) => [{ s: x.s, e: x.e, t: val }];
    if (f === 'vth' || f === 'vph') { const n = parseFloat(v); if (!isFinite(n)) return null; return G.setView(src, f === 'vth' ? n : Lx.view.th, f === 'vph' ? n : Lx.view.ph); }
    if (f === 'scale') { const n = parseFloat(v); if (!(n > 0)) return null; return G.setScale(src, n, FLAT); }
    if (!st) return null;
    if (!val && !/^(label|rest|plabel)$/.test(f)) return null;
    if (f === 'label') return setLabel(src, E.sel, v);
    if (f === 'cname') {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(val) || (val !== st.name && Lx.names.has(val))) return null;
      // the name, and every (name…) that refers to it
      const re = new RegExp(`\\((\\s*)${st.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(xy|xz|yz|x|y|z)?(\\s*)\\)`, 'g');
      const ed = [{ ...st.nameSpan || findName(src, st), t: val }];
      let m; const body = src;
      if (FLAT) {
        const r2e = nameRe(st.name, 'g');
        while ((m = r2e.exec(body))) if (m.index >= st.e || m.index < st.s) ed.push({ s: m.index, e: m.index + m[0].length, t: val });
        return G.edits(src, ed);
      }
      while ((m = re.exec(body))) if (m.index >= st.e || m.index < st.s) ed.push({ s: m.index, e: m.index + m[0].length, t: `(${m[1]}${val}${m[2] || ''}${m[3]})` });
      return G.edits(src, ed);
    }
    if (/^q\d$/.test(f)) { const c = G.splitTop(src, st.atPt.is, st.atPt.ie, ':')[+f[1]]; return c ? G.edits(src, sp(c)) : null; }
    if (/^c\d$/.test(f)) { const c = G.splitTop(src, st.atPt.is, st.atPt.ie)[+f[1]]; return c ? G.edits(src, sp(c)) : null; }
    if (f === 'at') { const a = st.atPt || null; return a ? G.edits(src, [{ s: a.is, e: a.ie, t: val }]) : null; }
    const SP: Record<string, any> = { sr: st.r, sth: st.th, sph: st.ph, ac: st.c, ar: st.r, a0: st.a0, a1: st.a1, ra: st.a, rb: st.b, rg: st.g, tp: st.ph, ro: st.at, mth: st.th, mph: st.ph, mv: st.v, fl: st.list, so: st.o };
    if (SP[f]) return G.edits(src, sp(SP[f]));
    const pm = /^p(\d+)(?::(\d))?$/.exec(f);
    if (pm) {
      const p = st.els.filter((x: any) => x.t === 'pt')[+pm[1]];
      if (!p) return null;
      if (pm[2] == null) return G.edits(src, [{ s: p.is, e: p.ie, t: val }]);
      const c = G.splitTop(src, p.is, p.ie)[+pm[2]];
      return c ? G.edits(src, sp(c)) : null;
    }
    const opt = (match: any, txt: any) => G.edits(src, G.setOpt(Lx, st, match, txt));
    if (f === 'color' || f === 'tcolor') return opt((o: any) => (o.k === 'color' && o.v != null) || COLORK(o), val === 'black' || !val ? null : f === 'tcolor' ? `text=${TD.texColor.wrap(val)}` : /[,;]/.test(val) ? `color=${TD.texColor.wrap(val)}` : val);
    if (f === 'fill') {
      if (st.k !== 'path') return null;
      const fv = val || 'none';
      let s2 = opt((o: any) => o.k === 'fill', fv === 'none' ? null : `fill=${TD.texColor.wrap(fv)}`);
      // \fill with no fill is just a \draw; a \draw that gains a fill keeps its outline
      if (fv === 'none' && st.cmd === 'fill') s2 = s2.slice(0, st.s) + '\\draw' + s2.slice(st.s + 5);
      return s2;
    }
    if (f === 'opacity') { const n = parseFloat(v); if (!isFinite(n)) return null; return opt((o: any) => o.k === 'fill opacity' || o.k === 'opacity', n >= 1 ? null : `${st.cmd === 'shade' ? 'opacity' : 'fill opacity'}=${fmt(n, 2)}`); }
    if (st.k === 'pic') {
      if (f === 'psize') return /^\d*\.?\d+$/.test(val) ? opt((o: any) => o.k === 'angle radius', `angle radius=${val}mm`) : opt((o: any) => o.k === 'angle radius', `angle radius=${val}`);
      if (f === 'pecc') { const n = parseFloat(v); return isFinite(n) && n >= 0 ? opt((o: any) => o.k === 'angle eccentricity', `angle eccentricity=${fmt(n, 3)}`) : null; }
      if (f === 'plabel') { const t = wrapMath(v); return opt((o: any) => o.k[0] === '"', t ? `"${t}"` : null); }
    }
    if (f === 'width') return opt((o: any) => o.v == null && G.WIDTHS[o.k] != null, val || null);
    if (f === 'lpos') {
      const lb = labelOf(E.sel, Lx);
      const anchorText = val ? val : null;
      const posMatch = (o: any) => G.POS[o.k] || o.k === 'anchor';
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
      const known = (o: any) => COLORK(o) || ['color', 'fill', 'opacity', 'fill opacity', 'draw opacity'].includes(o.k) || G.WIDTHS[o.k] != null || ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k) || /^tdplot_/.test(o.k) || (o.v == null && /-/.test(o.k) && !/_/.test(o.k));
      const keep = O.filter(known).map((o: any) => o.t), all = keep.concat(val ? [val] : []).join(', ');
      if (st.o) return G.edits(src, [{ s: st.o.s, e: st.o.e, t: all }]);
      return all ? G.edits(src, [{ s: st.oAt, e: st.oAt, t: `[${all}]` }]) : null;
    }
    return null;
  }
  function findName(src: any, st: any) {
    const i = src.indexOf('(' + st.name, st.s);
    return { s: i + 1, e: i + 1 + st.name.length };
  }
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E) return;
    const f = bt.dataset.fs, v = bt.dataset.v, Lx = L(), st = selSt();
    if (!st) return;
    const opt = (match: any, txt: any) => G.edits(E.src, G.setOpt(Lx, st, match, txt));
    edit(() => {
      if (f === 'dash') return opt((o: any) => o.v == null && ['dashed', 'dotted', 'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'solid'].includes(o.k), v || null);
      if (f === 'arrow') return opt((o: any) => o.v == null && /-/.test(o.k) && !/_/.test(o.k) && !/\s/.test(o.k), ({ '00': null, '01': '-stealth', 10: 'stealth-', 11: 'stealth-stealth' } as Record<string, any>)[v]);
      if (f === 'frame') return opt((o: any) => /^tdplot_/.test(o.k), v === 'main' ? null : `tdplot_${v}_coords`);
      return E.src;
    });
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ge="undo"]', root).disabled = !E.undo.length;
    $('[data-ge="redo"]', root).disabled = !E.redo.length;
    $('[data-ge="delete"]', root).disabled = E.sel == null && !E.many;
  }
  root.addEventListener('click', (e) => { const b = (e.target! as Element).closest('[data-ge]'); if (!b || !E) return; act((b as HTMLElement).dataset.ge, b); });
  function act(a: any, b?: any) {
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
    else if (a === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { b.textContent = t('ui.copied', 'Copied'); setTimeout(() => (b.textContent = t('ui.copy', 'Copy')), 1200); });
    updateTools();
  }
  // the code follows the drawing, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const Lx = L();
    count.textContent = commandsText(Lx.S.filter(drawable).length);
    updateTools();
    if (document.activeElement === codeTa) return;
    if (E.src !== E.codeAt) { E.codeAt = E.src; codeTa.value = E.src; }
    codeMsg.innerHTML = Lx.warnings.map((w: any) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.src = codeTa.value; E.codeAt = codeTa.value;
    commit();
    clampSel(); draw(); renderProps();
    codeMsg.innerHTML = L().warnings.map((w: any) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    // a focused palette button keeps its own Enter and Space (they click it) instead of the canvas shortcuts
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).closest?.('.qe-item, .cz-part, [data-cmd], [data-tool], [data-ex]')) return;
    if (!E || root.hidden || dock.elsewhere(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if ((e.target! as Element).closest && (e.target! as Element).closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!((e.target! as Element).closest && (e.target! as Element).closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { (e.target! as HTMLElement).blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.pick) { endPick(); return; }
      if (E.sel != null || E.many) { E.sel = null; E.many = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicate(); return; }
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll(); return; }
    if (mod && !e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) { e.preventDefault(); copySel(e.key.toLowerCase() === 'x'); return; }
    if (mod && !e.altKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); pasteClip(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ']') { reorder(1); return; }
    if (e.key === '[') { reorder(-1); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; if (!E.drag) svg.style.cursor = 'grab'; return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel != null) { e.preventDefault(); editLabel(E.sel); return; }
    // arrows turn the view (⇧: by 15°); a flat picture moves instead
    if (e.key.startsWith('Arrow') && FLAT) {
      e.preventDefault();
      const d = e.shiftKey ? 80 : 20;
      E.view.ox += e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0;
      E.view.oy += e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
      draw(); if (Lb) Lb.pop.place();
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const vw = L().view, d = e.shiftKey ? 15 : 5;
      const th = Math.max(0, Math.min(180, vw.th + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0))), ph = vw.ph + (e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0);
      edit(() => G.setView(E.src, th, ph));
      return;
    }
    const k = (KEYS() as Record<string, any>)[e.key.toLowerCase()];
    if (k) { e.preventDefault(); add(k); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') { E.space = false; if (!E.drag) svg.style.cursor = ''; } }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  function save() {
    if (E && dock.docked()) { commit(); return; }
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    if (E.src !== E.start) { E.start = E.src; E.done({ src: E.src }); }
    const saved = t('editor.commonA.saved', 'Saved to the page');
    setTip(saved);
    setTimeout(() => { if (E && tip.textContent === saved) setTip(''); }, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (src/application/app.ts, beforeunload)
  // embedded in a pane (Quick): src/core/editor-session.ts dockable
  const dock = TD.editorSession.dockable({ root, state: () => E, snapshot: () => E.src });
  TD.unsaved.push(() => !!E && !dock.docked() && E.src !== E.start);
  async function finish(ok: any) {
    if (dock.docked()) return;
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    commit();
    const src = E.src, changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm(t('editor.g3.discard', 'Discard changes to this figure?'), t('editor.commonA.discardBody', 'Your edits since opening the editor will be lost.'), { ok: t('editor.commonA.discard', 'Discard'), danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    localeOff?.(); localeOff = undefined;
    E = null;
    if (ok && changed) done({ src });
  }
  let localeOff: (() => void) | undefined;
  // the chrome that depends on the kind of figure, set after the frame's own captions
  function chrome() {
    const lang = FLAT ? 'TikZ' : 'tikz-3dplot', title = FLAT ? t('editor.g3.title2d', '2D geometry') : t('editor.g3.title', '3D geometry');
    $('#g3Title', root).textContent = title;
    const ic = TD.blocks.get(FLAT ? 'geo2d' : 'geo3d')?.menu.icon;
    if (ic) $('#g3Icon', root).innerHTML = ic;
    svg.setAttribute('aria-label', title);
    $('.g3-lang', root).textContent = lang;
    codeTa.setAttribute('aria-label', t('editor.commonA.langCode', '{lang} code', { lang }));
    $('[data-ge="copy"]', root).title = t('editor.commonA.copyCode', 'Copy the {lang} code', { lang });
  }
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, opts: Record<string, any> = {}, host?: any) {
    FLAT = !!opts.flat;
    chrome();
    E = { src: String(block.src || ''), sel: null, many: null, view: { ox: 0, oy: 0, k: 120 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, codeAt: null, codeTimer: null, base: null };
    E.start = E.src;
    dock.show(host);
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, properties, hints and title follow the interface language while the editor is open
    let first = true;
    localeOff?.();
    localeOff = onLocale(() => {
      if (first) { first = false; return; }
      queueMicrotask(() => { if (E) chrome(); });
      if (E) { buildPalette(); renderProps(); draw(); syncCode(); }
    });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.geo3dEditor = { open, dockable: true, close: () => { if (!dock.docked()) return; dock.release(); finish(true); } };
})();
