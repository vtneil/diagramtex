// Export: every parity figure (docs/latex-parity/tools/scenes-kit.js) exports the same code every time,
// matches its golden file, and compiles with pdflatex.
for (const n of Object.keys(KIT)) {
  T.test(`export ${n}`, () => {
    const list = KIT[n]();
    const tex = TD.toTikz(list, { standalone: true });
    // deterministic: again, and from a copy that went through a project file's JSON
    T.eq(TD.toTikz(list, { standalone: true }), tex, 'second export');
    T.eq(TD.toTikz(JSON.parse(JSON.stringify(list)), { standalone: true }), tex, 'export of a JSON copy');
    T.golden(`kit/${n}.tex`, tex);
    T.tex(n, tex);
  });
}
