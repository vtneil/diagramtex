// The Thai fonts served with the app (fonts/tlwg-*.woff2): Garuda, Kinnari and Laksaman are in the Font list with
// their Thai names, load when text uses them (regular, bold, slanted), and are for viewing only: the LaTeX output
// keeps the document's font.
{
  T.test('Thai fonts: listed with their Thai names, loaded when text uses them, nothing written to LaTeX', async () => {
    const names = Object.fromEntries(TD.FONTS.map(f => [f[0], f[1]]));
    T.eq(names.garuda, 'Garuda (ครุฑ)', 'Garuda');
    T.eq(names.kinnari, 'Kinnari (กินรี)', 'Kinnari');
    T.eq(names.laksaman, 'Laksaman (ลักษมัณ)', 'Laksaman');
    for (const fam of ['Garuda', 'Kinnari', 'Laksaman']) for (const v of ['', 'bold ', 'italic ', 'italic bold ']) {
      const got = await document.fonts.load(`${v}20px ${fam}`, 'กข');
      T.ok(got.some(f => f.family.replace(/["']/g, '') === fam), `${fam} ${v || 'regular '}loads`);
    }
    const s = { ...TD.TYPES.text.create({ x: 0, y: 0 }, TD.state.defaults), id: 'th', text: 'สวัสดี', font: 'garuda', bold: true };
    const tex = TD.toTikz([s]);
    T.ok(tex.includes('สวัสดี'), 'the text is exported');
    T.ok(!/garuda|fontfamily/i.test(tex), 'in the document\'s font: ' + tex.split('\n').find(l => l.includes('สวัสดี')));
    T.ok(/\\bfseries/.test(tex), 'bold still is');
  });
}
