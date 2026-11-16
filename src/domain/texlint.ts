import { runtime as TD } from '../runtime';
// LaTeX diagnostics shared by Import, the Code dialog and the TikZ code panel: TD.lint(src) lists what would stop
// pdflatex or change the output, each with its line. It reads the text only (no TeX run), so it errs on the side
// of saying nothing: a check reports only what it can see for certain.
//   TD.lint(src, { libs, pkgs }) → [{ sev: 'error' | 'warn' | 'info', line, msg }]
// For a whole document (\documentclass … \begin{document}) the preamble is read for libraries and packages; for a
// snippet, pass the ones that will be loaded (libs, pkgs as Sets) to check those, or leave them out to skip.
(function () {

  // comments become spaces (positions stay), so nothing below reads into them
  const blank = (src: any) => src.split('\n').map((l: any) => { for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '%') return l.slice(0, i) + ' '.repeat(l.length - i); } return l; }).join('\n');
  const lineOf = (s: any, i: any) => { let n = 1; for (let k = 0; k < i && k < s.length; k++) if (s.charCodeAt(k) === 10) n++; return n; };

  // TikZ libraries: what in the code needs them
  const LIBS = [
    ['positioning', /\b(?:above|below|left|right)(?:\s+(?:left|right))?\s*=\s*[^,\]=]*?\bof\b/],
    ['arrows.meta', /(?:[-{,=<>|]\s*)(?:Stealth|Latex|Triangle|Kite|Straight Barb|Arc Barb|Hooks|Rays|Implies)\b(?!\s*\{)/],
    ['calc', /\(\s*\$/],
    ['fit', /\bfit\s*=/],
    // a pattern by name: one of the library's own (not one the code declares itself, which needs patterns.meta)
    ['patterns', (body: any, all: any) => {
      for (const m of body.matchAll(/(?<!dash\s)\bpattern\s*=\s*([^,\]{}]+)/g)) {
        const n = m[1].trim();
        if (!new RegExp(`\\\\pgfdeclarepattern(?:formonly|inherentlycolored)?\\s*(?:\\[[^\\]]*\\])?\\s*\\{(?:\\s*name\\s*=\\s*)?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,}]`).test(all)) return m.index;
      }
      return -1;
    }],
    ['patterns.meta', /(?<!dash\s)\bpattern\s*=\s*\{\s*(?:Lines|Hatch|Dots|Stars)/],
    ['matrix', /\bmatrix of (?:math )?nodes\b/],
    ['backgrounds', /\bon background layer\b|\bbackground rectangle\b/],
    ['shadows', /\b(?:drop shadow|circular drop shadow|copy shadow|double copy shadow)\b/],
    ['decorations.pathmorphing', /\bdecoration\s*=\s*\{?\s*(?:zigzag|saw|coil|bumps|snake|random steps|bent)\b/],
    ['decorations.pathreplacing', /\bdecoration\s*=\s*\{?\s*(?:brace|border|waves|expanding waves|ticks)\b/],
    ['decorations.markings', /\bdecoration\s*=\s*\{?\s*markings\b/],
    ['shapes.geometric', /(?:shape\s*=\s*|[[,]\s*)(?:diamond|trapezium|regular polygon|star|cylinder|isosceles triangle|kite|dart|semicircle|circular sector)\s*[,\]]/],
    ['shapes.multipart', /(?:shape\s*=\s*|[[,]\s*)(?:rectangle split|circle split|circle solidus|ellipse split)\b/],
    ['shapes.arrows', /(?:shape\s*=\s*|[[,]\s*)(?:single arrow|double arrow|signal)\s*[,\]]/],
    ['shapes.symbols', /(?:shape\s*=\s*|[[,]\s*)(?:cloud|starburst|forbidden sign|magnifying glass|tape)\s*[,\]]/],
    ['intersections', /\bname intersections\b|\bname path\s*=/],
    ['through', /\bcircle through\b/],
    ['automata', /[[,]\s*(?:state|initial|accepting)\s*[,\]]/],
    ['graphs', /\\graph\b/],
    ['quotes', /\\graph\b[\s\S]*\[\s*"[^"]*"/],
    ['mindmap', /\bmindmap\b/],
    ['spy', /\bspy using\b|\\spy\b/],
  ];
  // a library that loads another
  const LIB_IMPLIES: Record<string, any> = { shapes: ['shapes.geometric', 'shapes.multipart', 'shapes.arrows', 'shapes.symbols', 'shapes.misc'], decorations: [], 'patterns.meta': [], quantikz2: ['positioning', 'arrows.meta', 'calc', 'fit', 'backgrounds', 'decorations.pathreplacing', 'shapes.geometric', 'matrix'], cd: ['arrows.meta'], mindmap: ['shapes.geometric', 'decorations'], automata: ['shapes.multipart'] };
  // packages: what needs them, and packages that load TikZ (and the libraries they load)
  const PKGS: [string, RegExp][] = [
    ['pgfplots', /\\begin\{(?:axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|groupplot)\}|\\addplot\b/],
    ['tikz-cd', /\\begin\{tikzcd\}/],
    ['circuitikz', /\\begin\{circuitikz\}|\\ctikzset\b/],
    ['chemfig', /\\chemfig\b|\\schemestart\b/],
    ['forest', /\\begin\{forest\}/],
    ['xy', /\\xymatrix\b/],
    ['tikz-feynman', /\\feynmandiagram\b|\\begin\{feynman\}/],
    ['tikz-timing', /\\(?:texttiming|tikztiming)\b|\\begin\{tikztimingtable\}/],
    ['pgf-umlcd', /\\begin\{(?:class|interface|abstractclass|staticclass|object)\}\[?[^\n]*\}\{[^}]*,[^}]*\}|\\(?:umlnote|unidirectionalAssociation|switchUmlcdSchool)\b/],
    ['pgf-umlsd', /\\begin\{sequencediagram\}/],
    ['amssymb', /\\(?:mathbb|mathfrak|Bbb|frak|bold|varnothing|leqslant|geqslant|square|blacksquare|checkmark)\b/],
    ['amsmath', /\\(?:text|dfrac|tfrac|binom|operatorname|xrightarrow|xleftarrow|boldsymbol)\b|\\begin\{(?:align|aligned|pmatrix|bmatrix|vmatrix|cases|gather|multline)\*?\}/],
    ['siunitx', /\\(?:SI|si|qty|unit|num|ang)\s*[[{]/],
    ['mathrsfs', /\\mathscr\b/],
    ['dsfont', /\\mathds\b/],
    ['bbm', /\\mathbbm\b/],
    ['bm', /\\bm\b/],
    ['physics', /\\(?:ket|bra|braket|dv|pdv|abs|norm)\{/],
  ];
  const LOADS_TIKZ = ['tikz', 'pgfplots', 'tikz-cd', 'circuitikz', 'forest', 'tikz-feynman', 'tikz-timing', 'quantikz', 'chemfig', 'tikz-3dplot', 'tkz-euclide', 'smartdiagram', 'zx-calculus', 'blochsphere', 'karnaugh-map', 'pgf-pie', 'pgf-umlcd', 'pgf-umlsd'];
  const PKG_IMPLIES: Record<string, any> = { amssymb: ['amsfonts'], mathtools: ['amsmath'], physics: [], quantikz: ['tikz-cd'], 'tikz-cd': [], bm: [] };
  // pdflatex can't run these; the app compiles and exports for pdflatex
  const LUA = [
    [/\\usegdlibrary\b/, 'graph drawing (\\usegdlibrary) needs LuaLaTeX'],
    [/\\usetikzlibrary\{[^}]*\bgraphdrawing\b/, 'the graphdrawing library needs LuaLaTeX'],
    [/\\(?:directlua|luaexec|luadirect)\b|\\begin\{luacode\*?\}/, 'Lua code needs LuaLaTeX'],
    [/\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|unicode-math|luacode|luatexja|polyglossia)\b/, 'this package needs LuaLaTeX or XeLaTeX'],
    [/\\set(?:main|sans|mono|math)font\b/, 'font selection by name needs LuaLaTeX or XeLaTeX (fontspec)'],
  ];

  function lint(src: any, opt: Record<string, any> = {}) {
    const out: any[] = [], o = String(src || ''), s = blank(o);
    const add = (sev: any, i: any, msg: any) => out.push({ sev, line: lineOf(s, i), msg });

    // braces, and \begin/\end pairs
    const open = [], envs = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\') {
        const m = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(s.slice(i, i + 80));
        if (m) {
          if (m[1] === 'begin') envs.push({ name: m[2].trim(), i });
          else {
            // close the matching \begin; any opened inside it and still open were never ended
            const k = envs.map((e) => e.name).lastIndexOf(m[2].trim());
            if (k < 0) add('error', i, `\\end{${m[2]}} with no \\begin{${m[2]}}`);
            else { for (const e of envs.splice(k).slice(1)) add('error', e.i, `\\begin{${e.name}} is never ended (\\end{${m[2]}} on line ${lineOf(s, i)} comes first)`); }
          }
          i += m[0].length - 1;
          continue;
        }
        i++; continue; // an escaped character: \{ \} \%
      }
      if (ch === '{') open.push(i);
      else if (ch === '}') { if (!open.length) add('error', i, 'a } with no { before it'); else open.pop(); }
    }
    for (const i of open.slice(0, 3)) add('error', i, 'a { that is never closed');
    for (const e of envs.slice(0, 3)) add('error', e.i, `\\begin{${e.name}} is never ended`);

    // what is loaded: the preamble of a whole document, or what the caller says
    const docAt = s.search(/\\begin\{document\}/);
    const whole = /\\documentclass\b/.test(s) && docAt >= 0;
    const pre = whole ? s.slice(0, docAt) : '';
    let libs = opt.libs ? new Set(opt.libs) : null, pkgs = opt.pkgs ? new Set(opt.pkgs) : null;
    if (whole) {
      libs = new Set(libs || []); pkgs = new Set(pkgs || []);
      for (const m of pre.matchAll(/\\usetikzlibrary\s*\{([^}]*)\}/g)) for (const l of m[1].split(',')) if (l.trim()) libs.add(l.trim());
      for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) if (p.trim()) pkgs.add(p.trim());
      const cls = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(pre);
      if (cls && cls[2].trim() === 'standalone' && /\btikz\b/.test(cls[1] || '')) pkgs.add('tikz');
    }
    if (libs) for (const l of [...libs]) for (const x of LIB_IMPLIES[(l as any)] || []) libs.add(x);
    if (pkgs) for (const p of [...pkgs]) for (const x of PKG_IMPLIES[(p as any)] || []) pkgs.add(x);
    const body = whole ? s.slice(docAt) : s, base = whole ? docAt : 0;
    const usesTikz = /\\begin\{tikzpicture\}|\\tikz\b/.test(body);
    if (pkgs) {
      for (const [p, re] of PKGS) {
        const m = (re as any).exec(body);
        // quantikz has its own \ket and \bra
        if (p === 'physics' && m && /^\\(?:ket|bra)\{/.test(m[0]) && (pkgs.has('quantikz') || (libs && libs.has('quantikz2')) || pkgs.has('braket'))) continue;
        if (m && !pkgs.has(p) && !(p === 'amssymb' && pkgs.has('amsfonts') && !/\\(?:varnothing|leqslant|geqslant|square|blacksquare|checkmark)\b/.test(body))) add('warn', base + m.index, `needs \\usepackage{${p}}`);
      }
      if (usesTikz && ![...pkgs].some((p) => LOADS_TIKZ.includes(p as string))) { const i = body.search(/\\begin\{tikzpicture\}|\\tikz\b/); add('error', base + i, 'TikZ is used but no package loads it: \\usepackage{tikz}'); }
    }
    if (libs && (usesTikz || !whole || /\\begin\{(?:tikzcd|circuitikz|axis)\}/.test(body))) {
      const seen = new Set();
      for (const [l, re] of LIBS) {
        if (libs.has(l) || seen.has(l)) continue;
        const at = typeof re === 'function' ? re(body, s) : ((re as any).exec(body) || { index: -1 }).index;
        if (at >= 0) { seen.add(l); add('warn', base + at, `needs \\usetikzlibrary{${l}}`); }
      }
    }
    // quantikz2 restyles every tikz-cd diagram (and breaks zx-calculus) unless the app's compatibility lines come first
    if (libs && pkgs && libs.has('quantikz2') && (pkgs.has('tikz-cd') || pkgs.has('zx-calculus')) && !/\\dtx@cdcell/.test(o)) {
      const i = pre.search(/quantikz2/);
      add('warn', Math.max(0, i), `quantikz2 changes how ${pkgs.has('zx-calculus') ? 'zx-calculus and ' : ''}tikz-cd diagrams look: export from DiagramTeX to get the lines that keep them apart`);
    }
    for (const [re, msg] of LUA) { const m = (re as any).exec(s); if (m) add('error', m.index, msg + ' (DiagramTeX exports for pdfLaTeX)'); }

    // pgf-umlcd draws \inherit, \implement and the relations where they are written: a class they name that comes
    // later in the same picture is not there yet ("No shape named … is known")
    if (/\\begin\{(?:class|interface|abstractclass|staticclass|object)\}/.test(body)) {
      const UML = /\\begin\{tikzpicture\}|\\begin\{(class|interface|abstractclass|staticclass|object)\}\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}|\\umlnote\s*(?:\[[^\]]*\])?\s*\(([^()]*)\)|\\(inherit|implement)\s*\{([^{}]*)\}|\\(association|unidirectionalAssociation|aggregation|composition)\s*(?:\[[^\]]*\])?\s*((?:\{[^{}]*\}\s*){4})/g;
      const pics: any[] = [];
      let cur: any = null;
      for (const m of body.matchAll(UML)) {
        if (!m[1] && !m[3] && !m[4] && !m[6]) { pics.push(cur = { defs: new Map(), refs: [] }); continue; }
        if (!cur) pics.push(cur = { defs: new Map(), refs: [] });
        const at = base + m.index!;
        if (m[1] || m[3]) { const n = (m[2] ?? m[3]).trim(); if (!cur.defs.has(n)) cur.defs.set(n, at); continue; }
        if (m[4]) { for (const n of m[5].split(',')) cur.refs.push({ n: n.trim(), at, cmd: m[4] }); continue; }
        const a = [...m[7].matchAll(/\{([^{}]*)\}/g)].map((x) => x[1].trim());
        for (const n of [a[0], a[3]]) cur.refs.push({ n: n.replace(/\.(?:north|south|east|west|center|north east|north west|south east|south west)$/, ''), at, cmd: m[6] });
      }
      for (const P of pics) for (const r of P.refs) {
        const d = P.defs.get(r.n);
        if (d != null && d > r.at) add('error', r.at, `\\${r.cmd} names "${r.n}" before its class: pgf-umlcd needs "${r.n}" earlier in the picture`);
      }
    }

    // pgf-umlsd draws a message where it is written, at its instances' nodes: one made later is not there yet
    if (TD.umlsd && /\\begin\{sequencediagram\}/.test(body)) {
      for (const m of body.matchAll(/\\begin\{sequencediagram\}([\s\S]*?)\\end\{sequencediagram\}/g)) {
        const inner = m[1], at0 = base + m.index! + 23;
        for (const r of TD.umlsd.lateRefs(TD.umlsd.parse(`\\begin{sequencediagram}${inner}\\end{sequencediagram}`).items)) {
          const i = inner.indexOf(`{${r.name}}`);
          add('error', at0 + Math.max(0, i), `"${r.name}" is used before its \\newinst: pgf-umlsd needs the instance earlier in the diagram`);
        }
      }
    }

    // maths the preview can't draw (KaTeX and Temml); LaTeX itself is fine when the command is defined
    if (TD.TEX_COMMANDS && opt.preview !== false) {
      const known = TD._texKnown || (TD._texKnown = new Set(TD.TEX_COMMANDS.filter((r: any) => r[1] >= 0 || r[2] >= 0).map((r: any) => r[0])));
      const defined = new Set([...s.matchAll(/\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|def|let)\s*\*?\s*\{?\\([a-zA-Z@]+)/g)].map((m) => m[1]));
      const told = new Set();
      for (const m of body.matchAll(/\$([^$]+)\$/g)) for (const c of m[1].matchAll(/\\([a-zA-Z]+)/g)) {
        const n = c[1];
        if (known.has(n) || defined.has(n) || told.has(n)) continue;
        told.add(n);
        add('info', base + m.index + 1 + c.index, `\\${n} is not drawn by the preview (LaTeX output is unaffected if it is defined)`);
        if (told.size >= 5) break;
      }
    }
    return out.sort((a, b) => a.line - b.line);
  }
  // the list as HTML rows for a dialog foot or a panel
  const esc = (t: any) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  lint.html = (list: any, max = 12) => list.slice(0, max).map((d: any) => `<div class="lint ${d.sev}"><span class="ln">line ${d.line}</span> ${esc(d.msg)}</div>`).join('')
    + (list.length > max ? `<div class="lint info">… ${list.length - max} more</div>` : '');
  // the TikZ libraries and packages a piece of code uses (for code kept as written: the export loads them)
  lint.uses = (code: any) => {
    const b = blank(String(code || '')), libs: any[] = [], pkgs = [];
    for (const [l, re] of LIBS) if (!libs.includes(l) && (typeof re === 'function' ? re(b, b) : ((re as any).lastIndex = 0, (re as any).exec(b) || { index: -1 }).index) >= 0) libs.push(l);
    for (const [p, re] of PKGS) if ((re as any).exec(b)) pkgs.push(p);
    // xcolor's svgnames (DarkBlue…): defined in the preamble, so the code compiles without the source's options
    if (TD.svgColor) for (const m of b.matchAll(/(?<![\\A-Za-z@])([A-Z][a-z]+(?:[A-Z][a-z]+)*)(?![A-Za-z@])/g)) {
      const k = 'svgcolor:' + m[1];
      if (!pkgs.includes(k) && TD.svgColor(m[1])) pkgs.push(k);
    }
    return { libs, pkgs };
  };
  // What the maths and text styles in some code need (labels, text blocks): packages, and the definitions of the
  // math alphabets no standard package gives pdflatex without side effects (isomath also makes capital Greek
  // italic): \mathbfit is Computer Modern's bold math italic, \mathsfit its sans-serif italic. A definition is
  // skipped when the preamble already has the command (unicode-math, isomath).
  const MATH_PKGS = new Set(['amsmath', 'amssymb', 'mathrsfs', 'dsfont', 'bbm', 'bm']);
  const MATH_DEFS = [
    [/\\mathbfit\b/, '\\ifdefined\\mathbfit\\else\\DeclareMathAlphabet{\\mathbfit}{OML}{cmm}{b}{it}\\fi'],
    [/\\mathsfit\b/, '\\ifdefined\\mathsfit\\else\\DeclareMathAlphabet{\\mathsfit}{OT1}{cmss}{m}{sl}\\fi'],
  ];
  lint.mathNeeds = (code: any) => {
    const b = blank(String(code || ''));
    return { pkgs: PKGS.filter(([p, re]) => MATH_PKGS.has(p) && (re as any).test(b)).map(([p]) => p), defs: MATH_DEFS.filter(([re]) => (re as any).test(b)).map(([, d]) => d) };
  };
  TD.lint = lint;
})();
