// Chemistry: chemfig 1.x code (the setters chemfig 1.4 removed, \chemfig* and \chemfig[tikz][tikz]) read, drawn and
// converted to today's form; \resetchemfig, \setcharge and \resetcharge; \chemfig[keys] for one molecule.
{
  const M = (src) => TD.chem.modernize(src);
  const conv = {
    '\\setatomsep{4em}\\setcrambond*{3pt}{}{}\\chemfig{A-B}': '\\setchemfig{atom sep=4em,cram rectangle,cram width=3pt}\\chemfig{A-B}',
    '\\setatomsep{4em}\n\\setbondoffset{1pt}\n\\chemfig{A-B}': '\\setchemfig{atom sep=4em,bond offset=1pt}\n\\chemfig{A-B}',
    '\\setlewis[0.5ex]{}{2ex}{red}\\setlewisdist{0.4em}\\chemfig{A}': '\\setchemfig{lewis | width=0.5ex,lewis length=2ex,lewis style=red,lewis dist=0.4em}\\chemfig{A}',
    '\\setarrowdefault{30,1.5,red,thick}\\schemestart A\\arrow B\\schemestop': '\\setchemfig{arrow angle=30,arrow coeff=1.5,arrow style={red,thick}}\\schemestart A\\arrow B\\schemestop',
    '\\enablebondjoin\\schemedebug{true}\\setcompoundstyle{draw}\\setarrowlabelsep{4pt}\\chemfig{A}': '\\setchemfig{bond join,scheme debug,compound style=draw,arrow label sep=4pt}\\chemfig{A}',
    '\\disablefixedbondlength\\setnodestyle{red}\\setbondstyle{blue}\\setcompoundsep{4em}\\setarrowoffset{2pt}\\setstacksep{2pt}\\setdoublesep{3pt}\\setangleincrement{30}\\chemfig{A}': '\\setchemfig{fixed length=false,node style=red,bond style=blue,compound sep=4em,arrow offset=2pt,stack sep=2pt,double bond sep=3pt,angle increment=30}\\chemfig{A}',
    '\\setandsign{1em,1em,2pt}\\schemestart A\\+B\\+{,,}C\\schemestop': '\\schemestart A\\+{1em,1em,2pt}B\\+{,,}C\\schemestop',
    '\\chemfig*{A-B}': '\\chemfig[fixed length]{A-B}',
    '\\chemfig[red][blue]{A}': '\\chemfig[chemfig style={red},node style={blue}]{A}',
    '\\chemfig[scale=2]{A}': '\\chemfig[chemfig style={scale=2}]{A}',
  };
  T.test('chemistry 1.x: every removed setter and the old \\chemfig forms convert', () => {
    for (const [a, b] of Object.entries(conv)) T.eq(M(a).code, b, a);
  });
  T.test('chemistry 1.x: code already current is left exactly as written', () => {
    for (const src of ['\\setchemfig{atom sep=2em}\\chemfig[atom sep=3em]{A-B}', '\\schemestart\\chemname{\\chemfig{**[0,180]6(------)}}{x}\\arrow{->[a][b]}[30,1.5]\\+{1em}B\\schemestop', '% a comment\n\\chemfig{A-[:30,,,,red]B}']) {
      const r = M(src);
      T.eq(r.changes, [], 'nothing to change: ' + src);
      T.eq(r.code, src, 'as written');
    }
  });
  T.test('chemistry 1.x: what the converted code draws matches the 1.x code', () => {
    const w = (src) => TD.chem.build(src).bb.w;
    for (const a of ['\\setatomsep{4em}\\setcrambond*{3pt}{}{}\\chemfig{A-B}', '\\setandsign{1em,1em,2pt}\\schemestart A\\+B\\schemestop', '\\chemfig*{AB-CD}'])
      T.ok(Math.abs(w(a) - w(M(a).code)) < 0.01, `${a}: ${w(a)} vs ${w(M(a).code)}`);
    const p = (src) => { const r = TD.chem.build(src); return r.texts.find((x) => x.t === '$+$').cx; };
    T.ok(p('\\setandsign{2em,2em,}\\schemestart A\\+B\\schemestop') - p('\\schemestart A\\+B\\schemestop') > 5, '\\setandsign widens the space before +');
  });
  T.test('chemistry: \\chemfig[keys] sets one molecule', () => {
    const a = TD.chem.build('\\chemfig{A-B}'), b = TD.chem.build('\\chemfig[atom sep=1.5em]{A-B}\\chemfig{A-B}');
    T.eq(b.warnings, [], 'no warnings');
    T.ok(b.bonds[0].X1 - b.bonds[0].X0 < a.bonds[0].X1 - a.bonds[0].X0 - 1, 'the first is shorter');
    T.ok(Math.abs((b.bonds[1].X1 - b.bonds[1].X0) - (a.bonds[0].X1 - a.bonds[0].X0)) < 0.01, 'the second as before');
  });
  T.test('chemistry: \\resetchemfig counts only when something is drawn after it', () => {
    const len = (src) => { const b = TD.chem.build(src).bonds[0]; return b.X1 - b.X0; };
    const d = len('\\chemfig{A-B}'), s = len('\\setchemfig{atom sep=1.5em}\\chemfig{A-B}');
    T.ok(Math.abs(len('\\setchemfig{atom sep=1.5em}\\chemfig{A-B}\\resetchemfig') - s) < 0.01, 'a reset at the end leaves the drawing as set');
    T.ok(Math.abs(len('\\setchemfig{atom sep=1.5em}\\resetchemfig\\chemfig{A-B}') - d) < 0.01, 'a reset before the drawing undoes the setting');
    T.ok(Math.abs(len('\\setchemfig{atom sep=1.5em}\\resetchemfig\\setchemfig{atom sep=2em}\\chemfig{A-B}') - len('\\setchemfig{atom sep=2em}\\chemfig{A-B}')) < 0.01, 'settings after it count');
    T.eq(TD.chem.build('\\chemfig{A}\\resetchemfig').warnings, [], 'nothing flagged');
  });
  T.test('chemistry: \\setcharge and \\charge[…] size the dots, \\resetcharge undoes it', () => {
    const gap = (src) => { const d = TD.chem.build(src).dots; return Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y); };
    const base = gap('\\chemfig{\\charge{90=\\:}{O}}'), wide = gap('\\setcharge{:sep=1em}\\chemfig{\\charge{90=\\:}{O}}');
    T.ok(wide > base * 2.5, `:sep=1em spreads the pair (${base} → ${wide})`);
    T.ok(Math.abs(gap('\\setcharge{:sep=1em}\\resetcharge\\chemfig{\\charge{90=\\:}{O}}') - base) < 0.01, '\\resetcharge before it undoes it');
    const r = (src) => TD.chem.build(src).dots[0].r;
    T.ok(r('\\chemfig{\\charge{[.radius=1pt]90=\\.}{O}}') > r('\\chemfig{\\charge{90=\\.}{O}}'), "a \\charge's own .radius, at the start of its list");
    T.eq(TD.chem.build('\\setcharge{:sep=1em,extra sep=2pt}\\chemfig{\\charge{90=\\:}{O}}').warnings, [], 'no warnings');
  });
  T.test('chemistry: code brought in comes with the commands before \\chemfig, in today\'s form', () => {
    const B = TD.blocks.nodeImports().find((b) => b.type === 'chemfig');
    const m = B.re.exec('\\setatomsep{4em}\\schemestart\\chemfig*{A-B}\\arrow C\\schemestop');
    T.eq(m && m[0], '\\setatomsep{4em}\\schemestart\\chemfig*{A-B}\\arrow C\\schemestop', 'the whole code');
    const q = { src: m[0] }; B.place(q, { x: 0, y: 0 });
    T.eq(q.src, '\\setchemfig{atom sep=4em}\\schemestart\\chemfig[fixed length]{A-B}\\arrow C\\schemestop', 'converted');
  });

  T.test('chemistry: changing a \\charge keeps its settings, where chemfig reads them', async () => {
    const tick = (ms = 0) => new Promise((res) => setTimeout(res, ms));
    const root = () => document.querySelector('#cfModal'), q = (x) => root().querySelector(x), code = () => q('.cz-code textarea').value.trim();
    const cap = Element.prototype.setPointerCapture; Element.prototype.setPointerCapture = function () {};
    TD.chemEditor.open({ src: '\\chemfig{\\charge{[.radius=1pt]90=\\.}{O}}' }, () => {}); await tick(30);
    try {
      const v = TD.chem.build(code()).verts[0], svg = q('.cf-svg'), r = svg.getBoundingClientRect(), m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg.innerHTML);
      const p = [r.left + +m[1] + v.X * +m[3], r.top + +m[2] + v.Y * +m[3]];
      for (const type of ['pointerdown', 'pointerup']) svg.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true, clientX: p[0], clientY: p[1], pointerId: 7 }));
      await tick(0);
      [...document.querySelectorAll('[data-fs="pair"]')].find((b) => b.dataset.v === '0').click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{[.radius=1pt]90=\\.,0=\\:}{O}}', 'the pair added, the radius kept');
    } finally {
      Element.prototype.setPointerCapture = cap;
      if (!root().hidden) q('[data-ce="cancel"]').click();
      await tick(0); const d = document.querySelector('.td-dialog [data-r="1"]'); if (d) d.click();
    }
  });

  T.test('chemistry: a chemfig setting among a bond\'s TikZ options is flagged as stopping LaTeX', () => {
    const w = TD.chem.build('\\chemfig{A<[7,0.7,,,cram width=6pt]B}').warnings.join('\n');
    T.ok(/"cram width" is a chemfig setting, not a bond option: LaTeX stops on it/.test(w), w);
    T.ok(w.includes('\\chemfig[cram width=6pt]{…}'), 'says where it goes: ' + w);
    T.eq(TD.chem.build('\\chemfig[cram width=6pt]{A<[7,0.7]B}').warnings, [], 'on the molecule it is fine');
  });

  T.test('chemistry: a blank line inside a scheme or a molecule is flagged as stopping LaTeX; one between drawings is not', () => {
    const blank = (code) => TD.chem.build(code).warnings.some((w) => w.startsWith('A blank line inside'));
    const tex = (src) => TD.TYPES.chemfig.tikz({ type: 'chemfig', x: 0, y: 0, src }, { pkgs: new Set(), c: () => '(0,0)', col: () => 'black' });
    T.ok(blank('\\schemestart\n\\chemfig{A}\\arrow\\chemfig{B}\n  \n\\schemestop'), 'in a scheme');
    T.ok(blank('\\chemfig{A-\n\nB}'), 'in a molecule');
    T.ok(!blank('\\chemfig{A}\n\n\\chemfig{B}'), 'between two molecules');
    T.ok(!blank('\\schemestart\n\\chemfig{A}\n%\n\\schemestop'), 'a % line is no break');
    T.ok(tex('\\schemestart\n\\chemfig{A}\\arrow\\chemfig{B}\n  \n\\schemestop').includes('\\chemfig{B}\n  %\n\\schemestop'), 'the LaTeX writes it as %');
    T.ok(/\\chemfig\{A\}\n\n\\chemfig\{B\}/.test(tex('\\chemfig{A}\n\n\\chemfig{B}')), 'a break between drawings stays');
    T.tex('chemfig-blank-in-scheme', '\\documentclass{standalone}\n\\usepackage{tikz,chemfig}\n\\begin{document}\n\\begin{tikzpicture}\n' + tex('\\schemestart\n\\chemfig{A-B}\n  \\arrow\n\n\\chemfig{C}\n\n\\schemestop') + '\n\\end{tikzpicture}\n\\end{document}\n');
  });
}
