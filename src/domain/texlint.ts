import { runtime as TD } from '../runtime';
import { REWRITTEN } from './math-rewrite';
import { PACKAGE_COMMANDS } from './package-commands';
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
    // pgfplots' libraries (written as \usepgfplotslibrary, after pgfplots: TD.preamble)
    ['pgfplots.fillbetween', /\bfill between\b|\\tikzfillbetween\b|\bintersection segments\b|\bsoft clip\b/],
    ['pgfplots.groupplots', /\\begin\{groupplot\}|\\nextgroupplot\b|\bgroup style\b/],
    ['pgfplots.polar', /\\begin\{polaraxis\}/],
    ['pgfplots.dateplot', /\bdate coordinates in\b/],
    ['pgfplots.statistics', /\bboxplot\b/],
    ['pgfplots.ternary', /\\begin\{ternaryaxis\}/],
    ['pgfplots.smithchart', /\\begin\{smithchart\}/],
    ['pgfplots.colorbrewer', /\b(?:colormap|cycle list)\s*\/\s*(?:Accent|Blues|BrBG|BuGn|BuPu|Dark2|GnBu|Greens|Greys|OrRd|Oranges|PRGn|Paired|Pastel1|Pastel2|PiYG|PuBu|PuBuGn|PuOr|PuRd|Purples|RdBu|RdGy|RdPu|RdYlBu|RdYlGn|Reds|Set1|Set2|Set3|Spectral|YlGn|YlGnBu|YlOrBr|YlOrRd)\b/],
  ];
  // a library that loads another
  const LIB_IMPLIES: Record<string, any> = { shapes: ['shapes.geometric', 'shapes.multipart', 'shapes.arrows', 'shapes.symbols', 'shapes.misc'], decorations: [], 'patterns.meta': [], quantikz2: ['positioning', 'arrows.meta', 'calc', 'fit', 'backgrounds', 'decorations.pathreplacing', 'shapes.geometric', 'matrix'], cd: ['arrows.meta'], mindmap: ['shapes.geometric', 'decorations'], automata: ['shapes.multipart'] };
  // packages: what needs them, and packages that load TikZ (and the libraries they load)
  const PKGS: [string, RegExp][] = [
    ['pgfplots', /\\begin\{(?:axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|groupplot|ternaryaxis|smithchart)\}|\\addplot\b|\\(?:usepgfplotslibrary|pgfplotsset|pgfplotstableread)\b/],
    ['tikz-cd', /\\begin\{tikzcd\}/],
    ['circuitikz', /\\begin\{circuitikz\}|\\ctikzset\b/],
    ['chemfig', /\\chemfig\b|\\schemestart\b/],
    ['forest', /\\begin\{forest\}/],
    ['xy', /\\xymatrix\b/],
    ['tikz-feynman', /\\feynmandiagram\b|\\begin\{feynman\}/],
    ['tikz-timing', /\\(?:texttiming|tikztiming)\b|\\begin\{tikztimingtable\}/],
    ['pgf-umlcd', /\\begin\{(?:class|interface|abstractclass|staticclass|object)\}\[?[^\n]*\}\{[^}]*,[^}]*\}|\\(?:umlnote|unidirectionalAssociation|switchUmlcdSchool)\b/],
    ['pgf-umlsd', /\\begin\{sequencediagram\}/],
    ['tikz-chemlab', /\\(?:tkz(?:TestTube|HeatTube|RoundFlask|HeatFlask|Funnel|GraduatedCylinder|Pipette|LargePipette|Titration|Distillation|SeparatoryFunnel)|chemlabset)\b/],
    ['amssymb', /\\(?:mathbb|mathfrak|Bbb|frak|bold|varnothing|leqslant|geqslant|square|blacksquare|checkmark)\b/],
    ['amsmath', /\\(?:text|dfrac|tfrac|binom|operatorname|xrightarrow|xleftarrow|boldsymbol|[lr]vert|[lr]Vert|overset|underset|i{2,3}nt|iiiint|idotsint|genfrac|cfrac|dbinom|tbinom|boxed|sideset|implies|impliedby|eqref|dddot|ddddot|var(?:Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)|dots[bcimo]|Hat|Tilde|Vec|Bar|Dot|Ddot|Check|Acute|Grave|Breve)\b|\\begin\{(?:align|aligned|pmatrix|bmatrix|vmatrix|cases|gather|multline)\*?\}/],
    ['siunitx', /\\(?:SI|si|qty|unit|num|ang)\s*[[{]/],
    ['mathrsfs', /\\mathscr\b/],
    ['dsfont', /\\mathds\b/],
    ['bbm', /\\mathbbm\b/],
    ['bm', /\\bm\b/],
    ['physics', /\\(?:ket|bra|braket|dv|pdv|abs|norm)\{/],
    ['ifthen', /\\ifthenelse\b/],
    ['tipa', /\\textipa\b/],
    ['tikz-qtree', /\\Tree\s*\[/],
    ['tikz-qtree-compat', /\\qroof\b/],
    // a table's column types from array: >{…} <{…} before or after a column, m{…} b{…}
    ['array', /\\begin\{(?:tabular|array)\*?\}\s*(?:\[[^\]]*\]\s*)?\{[^}]*(?:[><]\{|\b[mb]\{)/],
  ];
  const LOADS_TIKZ = ['tikz', 'pgfplots', 'tikz-cd', 'circuitikz', 'forest', 'tikz-feynman', 'tikz-timing', 'quantikz', 'chemfig', 'tikz-3dplot', 'tkz-euclide', 'smartdiagram', 'zx-calculus', 'blochsphere', 'karnaugh-map', 'pgf-pie', 'pgf-umlcd', 'pgf-umlsd', 'tikz-chemlab'];
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
        if (p === 'physics' && m && /^\\(?:ket|bra)\{/.test(m[0]) && (pkgs.has('quantikz') || (libs && (libs.has('quantikz2') || libs.has('quantikz'))) || pkgs.has('braket'))) continue;
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
    // Thai in code for pdfLaTeX: it is set (the TLWG Type 1 fonts, src/core/doc-fonts.ts), but XeLaTeX sets it best
    if (opt.engine === 'pdflatex') { const th = s.search(/[\u0E01-\u0E5B]/); if (th >= 0) add('warn', th, 'Thai text: XeLaTeX sets it best (its Latin letters in a Thai font too, with fontspec); pdfLaTeX sets it in the TLWG Type 1 fonts'); }
    // (opt.engine 'xelatex': code for XeLaTeX, where fontspec and its kind are at home; LuaLaTeX's own still aren't)
    for (const [re, msg] of LUA) {
      if (opt.engine === 'xelatex' && /XeLaTeX/.test(msg as string)) continue;
      const m = (re as any).exec(s); if (m) add('error', m.index, msg + (opt.engine === 'xelatex' ? ' (this code is for XeLaTeX)' : ' (DiagramTeX exports for pdfLaTeX)'));
    }

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
        // the engines' own; stand-ins, siunitx and mhchem drawn for them (src/domain/mathengine.ts, math-rewrite.ts)
        if (known.has(n) || defined.has(n) || told.has(n) || REWRITTEN.has(n) || n === 'ce' || n === 'pu' || TD.math?.drawsAs?.(n)) continue;
        told.add(n);
        add('info', base + m.index + 1 + c.index, `\\${n} is not drawn by the preview (LaTeX output is unaffected if it is defined)`);
        if (told.size >= 5) break;
      }
    }
    return out.sort((a, b) => a.line - b.line);
  }
  // the TikZ libraries and packages a piece of code uses (for code kept as written: the export loads them)
  lint.uses = (code: any) => {
    const b = blank(String(code || '')), libs: any[] = [], pkgs = [];
    for (const [l, re] of LIBS) if (!libs.includes(l) && (typeof re === 'function' ? re(b, b) : ((re as any).lastIndex = 0, (re as any).exec(b) || { index: -1 }).index) >= 0) libs.push(l);
    for (const [p, re] of PKGS) if ((re as any).exec(b)) pkgs.push(p);
    // circuitikz's unit labels (l=200<\kilo\ohm>) need its siunitx option
    if (/\bto\s*\[[^\]]*\b[lvia][_^]?\s*=\s*[^,\]]*<[^<>]*\\[A-Za-z]+[^<>]*>/.test(b)) pkgs.push('circuitikz:siunitx');
    // xcolor's svgnames (DarkBlue…), dvipsnames (BrickRed) and x11names (Azure4): defined in the preamble by value, so
    // the code compiles without the source's options
    if (TD.svgColor) for (const m of b.matchAll(/(?<![\\A-Za-z@])([A-Z][a-z]+(?:[A-Z][a-z]+)*[0-9]?)(?![A-Za-z0-9@])/g)) {
      const k = 'svgcolor:' + m[1];
      if (!pkgs.includes(k) && TD.svgColor(m[1])) pkgs.push(k);
    }
    return { libs, pkgs };
  };
  // the named colours in a whole picture (a block's code, labels' text): only where a colour can stand, after [ , = {
  // or ! and before , ] } ! or ; (a label's ":Red" or "Red team" is not one)
  lint.colours = (code: any) => {
    const b = blank(String(code || '')), out: string[] = [];
    if (TD.svgColor) for (const m of b.matchAll(/(?<=[[{,=!]\s*)([A-Z][a-z]+(?:[A-Z][a-z]+)*[0-9]?)(?=\s*[,\]}!;])/g)) {
      const k = 'svgcolor:' + m[1];
      if (!out.includes(k) && TD.svgColor(m[1])) out.push(k);
    }
    return out;
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
  // Packages for commands the maths engines draw (natively, with mhchem, or with stand-ins: src/domain/mathengine.ts
  // and math-rewrite.ts) that LaTeX has only with them: [package, its commands, its environments].
  const LABEL_PKGS: [string, string[], string[]?][] = [
    ['mhchem', ['ce', 'pu']],
    ['siunitx', ['SI', 'si', 'num', 'ang', 'unit', 'SIrange', 'qtyrange', 'numrange', 'SIlist', 'qtylist', 'numlist', 'numproduct', 'qtyproduct', 'tablenum', 'sisetup', 'DeclareSIUnit']],
    ['cancel', ['cancel', 'bcancel', 'xcancel', 'cancelto']],
    ['nicefrac', ['nicefrac']], ['xfrac', ['sfrac']], ['tensor', ['tensor', 'indices']], ['slashed', ['slashed']],
    ['centernot', ['centernot']], ['euscript', ['EuScript']], ['booktabs', ['toprule', 'midrule', 'bottomrule', 'cmidrule']],
    ['multirow', ['multirow']],
    // tests and counters in a file's macros (src/domain/math-functions.ts), mleftright's pairs
    ['ifthen', ['ifthenelse']], ['xifthen', ['isempty']], ['nomencl', ['nomenclature']], ['mleftright', ['mleft', 'mright']],
    ['etoolbox', ['ifstrempty', 'ifstrequal', 'ifblank', 'newrobustcmd', 'renewrobustcmd', 'providerobustcmd']],
    ['mathtools', ['prescript', 'mathclap', 'mathllap', 'mathrlap', 'coloneqq', 'Coloneqq', 'eqqcolon', 'vcentcolon', 'xmapsto',
      'xhookrightarrow', 'xhookleftarrow', 'xLeftarrow', 'xRightarrow', 'xleftrightarrow', 'xLeftrightarrow', 'underbracket',
      'overbracket', 'shortintertext', 'DeclarePairedDelimiter'], ['multlined', 'dcases', 'rcases', 'pmatrix*', 'bmatrix*', 'vmatrix*', 'Vmatrix*', 'Bmatrix*', 'matrix*']],
    ['upgreek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu',
      'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega'].map((g) => 'up' + g)
      .concat(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'].map((g) => 'Up' + g.toLowerCase()))],
    ['braket', ['ket', 'bra', 'braket', 'Ket', 'Bra', 'Braket']],
    ['physics', ['dv', 'pdv', 'abs', 'norm', 'pqty', 'bqty', 'vqty', 'Bqty', 'dd', 'vb', 'vu', 'va', 'expval', 'mel', 'comm', 'acomm', 'order',
      'laplacian', 'curl', 'grad', 'Tr', 'tr', 'Res', 'qty', 'ev', 'expectationvalue', 'vev', 'ketbra', 'dyad', 'op', 'outerproduct',
      'matrixel', 'matrixelement']],
  ];
  // the commands and environments LABEL_PKGS has rules for
  let LABEL_CMDS: Set<string> | null = null;
  const labelCmds = () => (LABEL_CMDS ??= new Set(LABEL_PKGS.flatMap(([, cmds, envs = []]) => [...cmds, ...envs])));
  // command or environment name → the package that defines it (generated from TeX Live), read once
  let CMD_PKG: Map<string, string> | null = null;
  const byCommand = () => {
    if (CMD_PKG) return CMD_PKG;
    CMD_PKG = new Map();
    for (const [p, names] of PACKAGE_COMMANDS) for (const n of names.split(' ')) if (!CMD_PKG.has(n)) CMD_PKG.set(n, p);
    return CMD_PKG;
  };
  // the options a package is loaded with (wasysym's integrals would clash with amsmath's)
  const PKG_OPTIONS: Record<string, string> = { mhchem: 'version=4', wasysym: 'nointegrals' };
  /** \usepackage{p}, with the options the app loads it with */
  lint.packageLine = (p: string) => `\\usepackage${PKG_OPTIONS[p] ? `[${PKG_OPTIONS[p]}]` : ''}{${p}}`;
  // commands a file's own macros define (not \renewcommand, which needs the package's): then the package isn't loaded
  const stripTexComments = (t: string) => t.replace(/(^|[^\\])%.*$/gm, '$1');
  const ownCommands = (macros: string) => new Set([...stripTexComments(String(macros || '')).matchAll(/\\(?:newcommand|providecommand|DeclareRobustCommand|(?:New|Declare|Provide)(?:Expandable)?DocumentCommand|DeclareMathOperator|DeclarePairedDelimiter|DeclareMathAlphabet|DeclareMathSymbol|DeclareSIUnit\s*(?:\[[^\]]*\])?|[gex]?def|let)\s*\*?\s*\{?\s*\\([A-Za-z]+)/g)].map((m) => m[1]));
  lint.ownCommands = ownCommands;
  /**
   * What the maths and text styles in some code need: packages, and definitions. `macros` (the file's own,
   * page.macros) define commands that then need no package; `pkgs` / `libs` are what the export loads already
   * (quantikz has its own \ket and \bra).
   */
  lint.mathNeeds = (code: any, ctx: { macros?: string; pkgs?: Set<string>; libs?: Set<string> } = {}) => {
    // (definitions in the code itself count too: a picture's own \newcommand{\shift})
    const own = ownCommands(String(ctx.macros || '') + '\n' + String(code || ''));
    // (a command the file defines itself needs no package: \newcommand{\bm} with bm loaded would be an error)
    const b = blank(String(code || '')).replace(/\\([A-Za-z]+)/g, (m: string, n: string) => (own.has(n) ? ' '.repeat(m.length) : m))
      // circuitikz's unit labels (l=200<\kilo\ohm>) are siunitx's units, read by circuitikz, not commands
      .replace(/(\b[lvia][_^]?\s*=\s*[^,\]<]*)<([^<>\]\n]*)>/g, (m: string, a: string, u: string) => a + ' '.repeat(u.length + 2));
    const pkgs = PKGS.filter(([p, re]) => MATH_PKGS.has(p) && (re as any).test(b)).map(([p]) => p);
    // (a symbol font amsfonts declares, named by \DeclareMathSymbol{\Z}{\mathalpha}{AMSb}{"5A} …)
    if (/\\(?:DeclareMath(?:Symbol|Accent|Delimiter|Radical)|DeclareSymbolFontAlphabet|SetSymbolFont)\b[^\n]*\{\s*AMS[ab]\s*\}/.test(String(code || '')) && !pkgs.includes('amssymb')) pkgs.push('amssymb');
    const used = new Set([...b.matchAll(/\\([A-Za-z]+)/g)].map((m) => m[1]));
    const envs = new Set([...b.matchAll(/\\begin\s*\{([^{}]*)\}/g)].map((m) => m[1].trim()));
    const quantikz = !!(ctx.pkgs?.has('quantikz') || ctx.libs?.has('quantikz2') || ctx.libs?.has('quantikz'));
    for (const [p, cmds, environments = []] of LABEL_PKGS) {
      let need = cmds.some((c) => used.has(c) && !own.has(c)) || environments.some((e) => envs.has(e));
      // siunitx's \qty{1}{\metre} (two groups), physics' \qty(…) delimiters
      if (p === 'siunitx' && !need && !own.has('qty')) need = /\\qty\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}\s*\{/.test(b);
      // (physics' \qty{…} is one group; siunitx's has two)
      if (p === 'physics' && need && !cmds.some((c) => c !== 'qty' && used.has(c) && !own.has(c))) need = /\\qty\s*(?:[([|]|\{(?:[^{}]|\{[^{}]*\})*\}(?!\s*\{))/.test(b) && !own.has('qty');
      if (p === 'braket' && quantikz) need = false;
      if (need && !pkgs.includes(p)) pkgs.push(p);
    }
    // any other command or environment of a package TeX Live has (src/domain/package-commands.ts), unless something
    // loaded already gives it
    const given = new Set(pkgs.flatMap((p) => [p, ...(PKG_IMPLIES[p] || [])]));
    for (const c of [...used, ...envs]) {
      const p = byCommand().get(c);
      // (a command the packages above have rules for is theirs: siunitx's \unit is not units')
      if (!p || own.has(c) || labelCmds().has(c) || given.has(p) || ctx.pkgs?.has(p) || (p === 'amsmath' && (given.has('mathtools') || given.has('physics')))) continue;
      pkgs.push(p); given.add(p);
    }
    // physics has \ket, \bra and \braket of its own
    return { pkgs: pkgs.includes('physics') ? pkgs.filter((p) => p !== 'braket') : pkgs, defs: MATH_DEFS.filter(([re]) => (re as any).test(b)).map(([, d]) => d) };
  };
  TD.lint = lint;
})();
