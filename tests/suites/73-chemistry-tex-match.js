// The chemistry drawing against what LaTeX sets (widths and heights measured from pdfLaTeX's boxes, chemfig 1.6):
// where \setchemfig takes effect, the spaces TeX sets in a scheme, \chemleft…\chemright's delimiters, the font's
// own em at another size, \Chemabove; and dragging a bond's end in its molecule's atom sep.
{
  const PT = 1 / TD.PT_PER_PX;
  const box = (src) => { const b = TD.chem.layout({ type: 'chemfig', x: 0, y: 0, src }).bb; return { w: b.w / PT, h: b.h / PT }; };
  // within 0.6pt: the drawing's letters are KaTeX's, a little off Computer Modern's own widths
  const near = (got, want, why) => T.ok(Math.abs(got - want) <= 0.6, `${why}: ${got.toFixed(2)}pt, LaTeX ${want}pt`);
  // the bonds' lengths, left to right
  const lens = (src) => TD.chem.layout({ type: 'chemfig', x: 0, y: 0, src }).bonds.slice().sort((a, b) => a.X0 - b.X0).map((b) => Math.hypot(b.X1 - b.X0, b.Y1 - b.Y0));

  T.test('chemistry vs LaTeX: a \\setchemfig in a scheme is its compound\'s; at the top level it holds from where it is written', () => {
    const [a, b] = lens('\\schemestart\\setchemfig{atom sep=6em}\\chemfig{A-B}\\arrow\\chemfig{A-B}\\schemestop').map((l) => l / PT);
    T.ok(a > b * 1.5, `the first compound's bond is longer (${a.toFixed(1)}, ${b.toFixed(1)})`);
    const after = lens('\\schemestart\\setchemfig{atom sep=6em}\\chemfig{A-B}\\schemestop\\chemfig{A-B}');
    T.ok(after[0] > after[1] * 1.5, 'nothing leaves the scheme');
    const sub = lens('\\schemestart\\chemfig{A-B}\\arrow\\subscheme{\\setchemfig{atom sep=6em}\\chemfig{A-B}\\arrow\\chemfig{A-B}}\\schemestop');
    T.ok(sub[1] > sub[0] * 1.5 && Math.abs(sub[2] - sub[0]) < 0.5, 'a sub-scheme\'s compound alone');
    near(box('\\chemfig{A-B}\\setchemfig{atom sep=6em}\\chemfig{A-B}').w, 104.58, 'a molecule before the setting keeps 3em');
    near(box('\\schemestart\n  \\setchemfig{atom sep=6em}\n\\chemfig{A-B}\n  \\arrow\n  \\chemfig{A-B}\n\\schemestop').w, 157.92, 'and the line break after it is a space');
  });

  T.test('chemistry vs LaTeX: \\chemleft…\\chemright takes TeX\'s delimiter sizes, with a space inside where written', () => {
    near(box('\\chemleft[\\chemfig{A}\\chemright]').w, 18.23, '[A] wide');
    near(box('\\chemleft[\\chemfig{A}\\chemright]').h, 12.0, '[A] tall');
    near(box('\\chemleft[ \\chemfig{A} \\chemright]').w, 24.9, '[ A ] wide');
    near(box('\\chemleft(\\chemfig{A-[2]B}\\chemright)').w, 27.4, '\\Big parentheses wide');
    near(box('\\chemleft(\\chemfig{A-[2]B}\\chemright)').h, 42.0, '\\Big parentheses tall');
    near(box('\\chemleft\\{\\chemfig{A-[2]B-[2]C-[2]D}\\chemright\\}').w, 27.82, 'braces built from pieces wide');
    near(box('\\chemleft\\{\\chemfig{A-[2]B-[2]C-[2]D}\\chemright\\}').h, 102.0, 'and tall');
  });

  T.test('chemistry vs LaTeX: em at another size is the font\'s own; \\Chemabove counts its text, \\chemabove doesn\'t', () => {
    // (the drawing's width also has the letters, KaTeX's 10pt ones scaled: a little narrower than cmr7's)
    const L = TD.chem.layout({ type: 'chemfig', x: 0, y: 0, src: '\\scriptsize\\chemfig{A-B}' });
    near((L.verts[1].X - L.verts[0].X) / PT, 23.92, '\\scriptsize: the atoms 3em of cmr7 apart');
    near(box('\\chemfig{\\Chemabove{A}{x}}').h, 12.64, '\\Chemabove');
    near(box('\\chemfig{\\chemabove{A}{x}}').h, 6.83, '\\chemabove');
  });

  T.test('chemistry editor: dragging a bond\'s end counts in its molecule\'s atom sep, so the bond keeps the length dragged to', async () => {
    const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    const root = () => document.querySelector('#cfModal'), q = (s) => root().querySelector(s);
    const code = () => q('.cz-code textarea').value.trim();
    const screen = (X, Y) => {
      const svg = q('.cf-svg'), r = svg.getBoundingClientRect();
      const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg.innerHTML);
      return [r.left + +m[1] + X * +m[3], r.top + +m[2] + Y * +m[3]];
    };
    const fire = (type, [x, y]) => q('.cf-svg').dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true, clientX: x, clientY: y, pointerId: 7 }));
    const cap = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function () {};
    TD.chemEditor.open({ src: '\\setchemfig{atom sep=6em}\\chemfig{A-B}' }, () => {});
    await tick(30);
    try {
      const sep = 6 * 10 * PT;
      for (const pass of [1, 2]) {
        const L = TD.chem.build(code()), a = L.verts[0], b = L.verts[1];
        // B's end dragged to 1.5 atom seps from A, to the right
        fire('pointerdown', screen(b.X, b.Y));
        for (const k of [0.3, 0.7, 1]) fire('pointermove', screen(a.X + 1.5 * sep * k, a.Y));
        fire('pointerup', screen(a.X + 1.5 * sep, a.Y));
        await tick(20);
        T.ok(/-\[[^\]]*,1\.5\]/.test(code()), `pass ${pass}: 1.5 × atom sep: ${code()}`);
        const L2 = TD.chem.build(code()), d = L2.verts[1].X - L2.verts[0].X;
        T.ok(Math.abs(d - 1.5 * sep) < 1, `pass ${pass}: drawn where it was dropped (${(d / PT).toFixed(1)}pt)`);
      }
    } finally {
      Element.prototype.setPointerCapture = cap;
      if (!root().hidden) q('[data-ce="cancel"]').click();
      await tick(0);
      const d = document.querySelector('.td-dialog [data-r="1"]'); if (d) d.click();
    }
  });
}
