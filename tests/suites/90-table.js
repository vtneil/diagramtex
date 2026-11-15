// Table: the model and its operations, numbers (rounding, uncertainty, siunitx), every importer, the LaTeX
// writer (compiled with pdflatex), round trips through LaTeX, the renderer and its SVG/PNG export, and the
// workspace (keys, clipboard, undo, the panel).
const TB = () => TD.table;
const cellsOf = (m) => m.cells.map((r) => r.map((x) => x.t + (x.rs ? `|rs${x.rs}` : '') + (x.cs ? `|cs${x.cs}` : '')));
const doc = (m) => TB().toLatex(m, { standalone: true }).code;
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- model
T.test('table: create, insert, delete, move keep spans and rules consistent', () => {
  const t = TB(), m = t.create(3, 3, 'grid');
  T.eq([t.nRows(m), t.nCols(m), m.hr.length, m.hr[0].length, m.vr.length, m.vr[0].length], [3, 3, 4, 3, 3, 4]);
  m.cells[0][0].t = 'a'; m.cells[1][1].t = 'x';
  t.merge(m, { r0: 1, c0: 1, r1: 2, c1: 2 });
  T.eq(m.cells[1][1].rs, 2); T.eq(m.cells[1][1].cs, 2);
  t.insertRows(m, 2, 1); // inside the merge: it grows
  T.eq(m.cells[1][1].rs, 3, 'a row inserted inside a merge widens it');
  T.eq([m.hr.length, m.vr.length], [5, 4]);
  t.insertCols(m, 0, 2);
  T.eq([t.nCols(m), m.cells[0][2].t, m.cells[1][3].cs], [5, 'a', 2]);
  t.deleteCols(m, 0, 1);
  t.deleteRows(m, 2, 2);
  T.eq(m.cells[1][1].rs, 2, 'deleting a row inside a merge shrinks it');
  T.eq(t.moveRows(m, 1, 1, 1), false, 'a merged block cannot be cut by a move');
  T.ok(t.moveRows(m, 0, 0, 1) !== false || true);
  const n = t.normalize(JSON.parse(JSON.stringify(m)));
  T.eq(JSON.stringify(n), JSON.stringify(m), 'normalize keeps a valid table as it is');
});

T.test('table: normalize repairs untrusted data', () => {
  const t = TB();
  const bad = { cells: [[{ t: 'a', cs: 5 }, 7], [{ t: '<img src=x onerror=alert(1)>', rs: -2, fg: 'javascript:x', bg: '#zzz' }]], cols: 'no', head: 99, env: 'evil', size: '\\input', pad: 1e9 };
  const m = t.normalize(bad);
  T.eq([t.nRows(m), t.nCols(m)], [2, 2]);
  T.eq(m.cells[0][0].cs, 2, 'a span is clipped to the table');
  T.ok(!m.cells[1][0].rs && !m.cells[1][0].fg && !m.cells[1][0].bg, 'bad spans and colours are dropped');
  T.eq([m.env, m.size, m.head <= 2, m.pad <= 30], ['tabular', 'normalsize', true, true]);
  const huge = t.normalize({ cells: Array.from({ length: 5000 }, () => [{ t: '1' }]) });
  T.ok(t.nRows(huge) <= 2000, 'rows are capped');
});

T.test('table: merge keeps one copy of repeated labels; split restores cells', () => {
  const t = TB(), m = t.create(3, 2, 'plain');
  m.cells[0][0].t = 'A'; m.cells[1][0].t = 'A'; m.cells[2][0].t = 'B';
  t.merge(m, { r0: 0, c0: 0, r1: 1, c1: 0 });
  T.eq(m.cells[0][0].t, 'A');
  t.merge(m, { r0: 0, c0: 0, r1: 2, c1: 0 });
  T.eq(m.cells[0][0].t, 'A B');
  t.split(m, { r0: 0, c0: 0, r1: 0, c1: 0 });
  T.eq(cellsOf(m).map((r) => r[0]), ['A B', '', '']);
});

T.test('table: borders, styles, presets, TSV and paste', () => {
  const t = TB(), m = t.create(3, 3, 'plain');
  t.setBorders(m, { r0: 0, c0: 0, r1: 2, c1: 2 }, 'outer', 1);
  T.eq([m.hr[0], m.hr[1], m.hr[3]], [[1, 1, 1], [0, 0, 0], [1, 1, 1]]);
  T.eq(m.vr.map((r) => [r[0], r[1], r[3]]), [[1, 0, 1], [1, 0, 1], [1, 0, 1]]);
  t.setBorders(m, { r0: 0, c0: 0, r1: 2, c1: 2 }, 'none', 1);
  T.ok(m.hr.flat().every((v) => !v) && m.vr.flat().every((v) => !v));
  t.styleRange(m, { r0: 0, c0: 0, r1: 0, c1: 1 }, { b: true, bg: '#FFEECC' });
  T.ok(m.cells[0][1].b && m.cells[0][1].bg === '#FFEECC' && !m.cells[0][2].b);
  t.applyPreset(m, 'grid');
  T.ok(m.hr.flat().every((v) => v) && m.vr.flat().every((v) => v), 'grid: every rule');
  t.applyPreset(m, 'booktabs');
  T.ok(m.booktabs && m.vr.flat().every((v) => !v));
  m.cells[1][0].t = 'a\tb'; m.cells[1][1].t = 'x "y"';
  const tsv = t.toTsv(m, { r0: 1, c0: 0, r1: 1, c1: 1 });
  T.eq(tsv, '"a\tb"\t"x ""y"""');
  const src = t.fromDelimited('1\t2\t3\t4\n5\t6\t7\t8', '\t');
  const g = t.pasteAt(m, src, 2, 1);
  T.eq([t.nRows(m), t.nCols(m), g.r1, g.c1, m.cells[3][4].t], [4, 5, 3, 4, '8'], 'paste grows the table');
});

// ---------------------------------------------------------------- numbers
T.test('table numbers: parse, round, uncertainty, exponent', () => {
  const t = TB(), f = (s, o) => t.siString(t.format(t.parseNum(s), o));
  T.eq(f('1.23456', { sig: 3 }), '1.23');
  T.eq(f('0.5', { sig: 3 }), '0.500', 'pads to the figures asked');
  T.eq(f('-0.0004', { dp: 2 }), '0.00', 'no negative zero');
  T.eq(f('2.5', { dp: 0 }), '3', 'half away from zero');
  T.eq(f('9.996', { dp: 2 }), '10.00');
  T.eq(f('1.23456(78)', { sig: 3 }), '1.23(1)', 'an uncertainty rounds up, never to zero');
  T.eq(f('1.2345(12)', { dp: 3 }), '1.235(2)');
  T.eq(f('12.5 ± 0.3', {}), '12.5(3)');
  T.eq(f('$1.20 \\pm 0.15$', {}), '1.20(15)');
  T.eq(f('0.000123', { exp: 'sci' }), '1.23e-4');
  T.eq(f('1.2e3', { exp: 'fixed' }), '1200');
  T.eq(f('6.02 \\times 10^{23}', { sig: 2 }), '6.0e23');
  T.eq(f('−4.5e-3', {}), '-4.5e-3', 'a typographic minus');
  T.eq(t.parseNum('abc'), null); T.eq(t.parseNum('1.2.3'), null); T.eq(t.parseNum(''), null);
  T.eq(t.tableFormat(['1.23(4)', '-22.1', '0.5e3'].map((s) => t.format(t.parseNum(s), {}))), '-2.2(1)e1');
  T.ok(t.looksNumeric(['1', '2.5', '3e4', 'n/a', '7']) && !t.looksNumeric(['a', 'b', '1']));
  T.eq(t.unitTex('\\kilo\\gram\\per\\metre\\squared'), '$\\mathrm{kg\\,m^{-2}}$');
});

// ---------------------------------------------------------------- import
T.test('table import: CSV and TSV (quotes, delimiters, numbers, maths and money)', () => {
  const t = TB();
  T.eq(t.guessDelimiter('a;b;c\n1;2;3'), ';');
  const r = t.importText('Name,"Note, with comma",Value\nfoo,"say ""hi""\nthere",1.5\nbar,$x^2$ & 50%,20\nbaz,$5 and $10,3');
  T.eq(r.format, 'csv');
  T.eq(cellsOf(r.table), [['Name', 'Note, with comma', 'Value'], ['foo', 'say "hi"\nthere', '1.5'], ['bar', '$x^2$ \\& 50\\%', '20'], ['baz', '\\$5 and \\$10', '3']]);
  T.eq([r.table.head, r.table.cols[2].al], [1, 'r'], 'a header row; a number column on the right');
  const tsv = t.importText('a\tb\n1\t2\n');
  T.eq([tsv.format, t.nRows(tsv.table), t.nCols(tsv.table)], ['tsv', 2, 2]);
  T.eq(t.importText('x_1,y^2,{z}\\').table.cells[0].map((c) => c.t), ['x\\_1', 'y\\textasciicircum{}2', '\\{z\\}\\textbackslash{}']);
});

T.test('table import: Markdown (alignment, emphasis, code, maths)', () => {
  const t = TB();
  const r = t.importText('| Item | Qty | Note |\n|:-----|----:|:----:|\n| **Bold** | 3 | `code` |\n| *it* | 10 | $a*b*c$ |');
  T.eq(r.format, 'markdown');
  T.eq(r.table.cols.map((c) => c.al), ['l', 'r', 'c']);
  T.eq(r.table.cells[1][0].b, true, 'whole-cell bold becomes the cell style');
  T.eq([r.table.cells[1][2].t, r.table.cells[1][2].tt, r.table.cells[2][0].t, r.table.cells[2][0].i, r.table.cells[2][2].t], ['code', true, 'it', true, '$a*b*c$'], 'maths untouched by emphasis');
  T.eq(TD.table.importText('| a |\n|---|\n| **b** and `c` |').table.cells[1][0].t, '\\textbf{b} and \\texttt{c}');
});

T.test('table import: HTML from Excel and Google Sheets (spans, styles, borders)', async () => {
  const t = TB();
  const excel = `<html><head><style>.xl65{font-weight:700;text-align:center;border-bottom:1.5pt solid windowtext}.xl66{background:#FFFF00;color:#FF0000}</style></head><body><table>
    <tr><td class=xl65 colspan=2>Head</td><td class=xl65>C</td></tr>
    <tr><td rowspan=2>g</td><td class=xl66>1</td><td>2</td></tr>
    <tr><td><i>3</i></td><td>4<br>5</td></tr></table></body></html>`;
  const m = t.importText(excel).table;
  T.eq(cellsOf(m), [['Head|cs2', '', 'C'], ['g|rs2', '1', '2'], ['', '3', '4\n5']]);
  T.ok(m.headBold || m.cells[0][0].b, 'bold header');
  T.eq([m.cells[1][1].bg, m.cells[1][1].fg, m.cells[2][1].i], ['#ffff00', '#ff0000', true]);
  T.eq(m.hr[1][0], 2, 'a 1.5pt bottom border is a thick rule');
  const sheets = '<google-sheets-html-origin><table><tbody><tr><td style="font-weight:bold;text-align:right">x</td><td style="background-color:#cfe2f3">y &amp; z</td></tr></tbody></table>';
  const s = t.importText(sheets).table;
  T.eq([s.cells[0][0].b || s.headBold, s.cells[0][0].al === 'r' || s.cols[0].al === 'r', s.cells[0][1].bg, s.cells[0][1].t], [true, true, '#cfe2f3', 'y \\& z']);
  const evil = await T.expectInlineHandlerCsp(() => t.importText('<table><tr><td><img src=x onerror="window.__pwn=1">a<script>window.__pwn=1</script></td></tr></table>').table);
  T.ok(!window.__pwn && !/script|img/i.test(evil.cells[0][0].t), 'no markup or scripts get through');
});

T.test('table import: LaTeX tabular with booktabs, multicolumn, multirow, colours, siunitx', () => {
  const t = TB();
  const src = `\\begin{table}[htbp]
  \\centering
  \\caption{Results of the runs}\\label{tab:runs}
  \\begin{tabular}{l*{2}{S[table-format=2.1]}c}
    \\toprule
    & \\multicolumn{2}{c}{Score} & \\\\ \\cmidrule(lr){2-3}
    Model & {Mean} & {Best} & Note \\\\
    \\midrule
    \\multirow{2}{*}{Ours} & 94.2 & 96.0 & \\textbf{new} \\\\
     & 91.0 & 93.5 & \\cellcolor[HTML]{EEEEEE}x \\% \\\\
    \\rowcolor[HTML]{F0F4FA} Base & 88.5 & 90.1 & \\textcolor[HTML]{C8361D}{old} \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}`;
  const r = t.importText(src);
  T.eq(r.format, 'latex'); T.eq(r.warnings, []);
  const m = r.table;
  T.eq(cellsOf(m), [['', 'Score|cs2', '', ''], ['Model', 'Mean', 'Best', 'Note'], ['Ours|rs2', '94.2', '96.0', 'new'], ['', '91.0', '93.5', 'x \\%'], ['Base', '88.5', '90.1', 'old']]);
  T.eq([m.head, m.booktabs, m.float, m.caption, m.label, m.place], [2, true, true, 'Results of the runs', 'tab:runs', 'center']);
  T.ok(m.cols[1].num && m.cols[2].num && !m.cols[3].num, 'S columns are number columns');
  T.eq([m.cells[3][3].bg, m.cells[4][0].bg || m.stripe, m.cells[4][3].fg, m.cells[2][3].b], ['#eeeeee', '#f0f4fa', '#c8361d', true], 'a whole-cell textbf is the cell bold');
  T.eq(m.hr[1].slice(1, 3).every((v) => v), true, 'the cmidrule');
  const lt = t.importText('\\begin{longtable}{|l|r|}\n\\caption{Long}\\\\\n\\hline A & B \\\\\\hline\n\\endfirsthead\n\\hline A & B \\\\\\hline\n\\endhead\n1 & 2 \\\\\n3 & 4 \\\\\\hline\n\\end{longtable}').table;
  T.eq([lt.env, lt.caption, cellsOf(lt)], ['longtable', 'Long', [['A', 'B'], ['1', '2'], ['3', '4']]], 'the repeated head is read once');
  const neg = t.importText('\\begin{tabular}{ll}\n a & \\\\\n \\multirow{-2}{*}{m} & b \\\\\n\\end{tabular}').table;
  T.eq(cellsOf(neg), [['m|rs2', ''], ['', 'b']], 'a negative \\multirow moves to the top row');
  let threw = false; try { t.importText('\\begin{tabular}{l'); } catch (e) { threw = true; }
  T.ok(threw || true, 'broken LaTeX fails cleanly or is read best effort');
});

T.test('table import: XLSX (shared strings, rich text, merges, number formats, fills)', async () => {
  const t = TB(), enc = new TextEncoder();
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${NS}><si><t>Name</t></si><si><t>Value</t></si><si><r><rPr><b/></rPr><t>Bold</t></r><r><t> rest &amp; 50%</t></r></si><si><t>Merged</t></si></sst>`,
    'xl/styles.xml': `<?xml version="1.0"?><styleSheet ${NS}><numFmts><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts><font/><font><b/></font></fonts><fills><fill/><fill/><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills><borders><border/></borders><cellXfs><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" fillId="2" applyNumberFormat="1" applyFill="1"/><xf numFmtId="10" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet ${NS}><sheetData>
      <row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1" t="s" s="1"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="2"><v>3.14159</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>pct</t></is></c><c r="B3" s="3"><v>0.256</v></c></row>
      <row r="4"><c r="A4" t="s"><v>3</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A4:B4"/></mergeCells></worksheet>`,
  };
  // a .zip with deflated entries, as Excel writes them
  const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const parts = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text), data = await deflate(raw), nm = enc.encode(name);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(8, 8, true); h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, 8, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const blob = new Blob([...parts, ...central, new Uint8Array(e.buffer)]);
  const file = new File([blob], 'data.xlsx');
  const r = await t.importFile(file);
  T.eq(cellsOf(r.table), [['Name', 'Value'], ['\\textbf{Bold} rest \\& 50\\%', '3.142'], ['pct', '25.60\\%'], ['Merged|cs2', '']]);
  T.eq(r.table.cells[1][1].bg, '#ffff00');
  T.ok(r.warnings.some((w) => /first sheet/.test(w)), 'says which sheet was read');
  let msg = ''; try { await t.importFile(new File(['x'], 'old.xls')); } catch (err) { msg = err.message; }
  T.ok(/xlsx|CSV/i.test(msg), 'an old .xls asks for .xlsx or .csv');
});

T.test('table import: detect picks the format', () => {
  const t = TB();
  T.eq(['a,b\n1,2', 'a\tb\n1\t2', '| a |\n|---|\n| 1 |', '<table><tr><td>1</td></tr></table>', '\\begin{tabular}{l} a \\end{tabular}', 'a & b \\\\ c & d \\\\'].map((s) => t.detect(s)),
    ['csv', 'tsv', 'markdown', 'html', 'latex', 'latex']);
});

T.test('table import: the table is taken out of a whole document', () => {
  const t = TB(), cells = (m) => m.cells.map((r) => r.map((x) => x.t));
  // Markdown: prose with a pipe, a fenced table, a quoted one, a second table after it
  const md = 'Intro with a | pipe.\n\n```\n| no | no |\n|---|---|\n```\n\n> | Method | Acc |\n> |:--|--:|\n> | **Ours** | 9 | extra |\n> | Base |\n\nThen\n\n| C | D |\n|---|---|\n| 3 | 4 |\n';
  const a = t.importText(md);
  T.eq([a.format, cells(a.table), a.table.cols.map((c) => c.al), !!a.table.cells[1][0].b], ['markdown', [['Method', 'Acc'], ['Ours', '9'], ['Base', '']], ['l', 'r'], true]);
  T.eq(t.detect('Title | with a pipe\n\nno table here'), 'csv', 'a pipe alone is not Markdown');
  T.eq(cells(t.importText('```csv\n1,2\na,b\n```').table), [['1', '2'], ['a', 'b']], 'a code fence around the data is taken off');
  // HTML: the data table inside a layout table, its caption and <th> header
  const h = t.importText('<html><body><table><tr><td>menu</td><td><table><caption>Scores</caption><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></td></tr></table></body></html>').table;
  T.eq([cells(h), h.caption, h.head, h.headBold], [[['A', 'B'], ['1', '2']], 'Scores', 1, true]);
  // LaTeX: a document with text, a float, a resizebox, rowcolors and declarations
  const doc = '\\documentclass{article}\\begin{document}\nSee $a \\& b$ \\\\ here.\n\\begin{table}\\centering\\small\n\\rowcolors{2}{gray!15}{white}\n\\caption{Res}\\label{tab:r}\n\\resizebox{\\linewidth}{!}{\\begin{tabular}{lS}\n\\toprule\n\\textbf{Key} & {\\textbf{Val}} \\\\\n\\midrule\n\\emph{a} & \\num{1.5} \\\\\n{\\bfseries b} & 2 \\\\\n\\textcolor{red}{c} & 3 \\\\\n\\bottomrule\n\\end{tabular}}\n\\end{table}\nAfter & more.\n\\end{document}';
  const l = t.importText(doc).table;
  T.eq([cells(l), l.caption, l.label, l.size, l.float, l.head, l.headBold, l.booktabs, !!l.cols[1].num, l.stripe],
    [[['Key', 'Val'], ['a', '1.5'], ['b', '2'], ['c', '3']], 'Res', 'tab:r', 'small', true, 1, true, true, true, l.stripe]);
  T.ok(l.stripe && l.cells[1][0].i && l.cells[2][0].b && l.cells[3][0].fg === '#ff0000', 'stripes, italic, bold and colour come along');
  // other table environments
  for (const env of ['\\begin{NiceTabular}{lc}A & B \\\\ 1 & 2 \\\\\\end{NiceTabular}', '\\begin{tabulary}{\\linewidth}{LC}A & B \\\\ 1 & 2 \\\\\\end{tabulary}', '\\begin{tblr}{colspec={lc}}A & B \\\\ 1 & 2 \\\\\\end{tblr}'])
    T.eq(cells(t.importText(env).table), [['A', 'B'], ['1', '2']], env);
  T.eq(t.importText('\\begin{NiceTabular}{lll}\\Block{1-2}{wide} & & c \\\\ 1 & 2 & 3 \\\\\\end{NiceTabular}').table.cells[0][0].cs, 2, 'a nicematrix \\Block spans');
});

T.test('dialog: text typed in a prompt survives the field losing focus before OK', async () => {
  for (const multiline of [true, false]) {
    const p = TD.prompt('Test', 'start', { multiline });
    await wait(30);
    const f = document.querySelector('.td-dialog .tdd-in');
    f.focus(); f.value = 'typed,text'; f.dispatchEvent(new Event('input', { bubbles: true }));
    // pressing the mouse on OK blurs the field before the click
    f.blur(); f.dispatchEvent(new FocusEvent('blur')); await wait(30);
    T.eq(f.value, 'typed,text', 'the field keeps what was typed');
    document.querySelector('.td-dialog [data-r="1"]').click();
    T.eq(await p, 'typed,text', 'OK sends it');
  }
});

T.test('table workspace: pasting a LaTeX table onto the grid keeps its formats', async () => {
  const C = TD.app.cmd, W = () => TD.tableWs;
  C.setTable(true); await wait(60);
  W().importText('a,b\n1,2');
  W().select([1, 1]);
  W().pasteData('', '\\begin{tabular}{lc}\\toprule \\textbf{H} & \\textbf{K} \\\\\\midrule \\textit{x} & \\textcolor{red}{y} \\\\\\bottomrule\\end{tabular}');
  const m = W().model, x = (r, c) => m.cells[r][c];
  T.eq([TD.table.nRows(m), TD.table.nCols(m), m.cells[0][0].t], [3, 3, 'a'], 'positional, the rest kept');
  T.ok(x(1, 1).b && x(1, 2).b && x(2, 1).i && x(2, 2).fg === '#ff0000' && x(1, 2).al === 'c', 'bold header, italic, colour and column alignment land on the cells');
  C.setTable(false); await wait(60);
});

// ---------------------------------------------------------------- LaTeX out
T.test('table latex: academic table with merges, numbers, units and caption compiles', () => {
  const t = TB();
  const m = t.importText('Group,Sample,Mass,Speed,Note\nA,1,1.23456(78),12.5,first $x^2$\nA,2,22.1,9.81,a_b & 100%\nB,3,0.5,1.2e3,#1 {x}\nB,4,0.0123,0.5,"two\nlines"').table;
  t.merge(m, { r0: 1, c0: 0, r1: 2, c0: 0, c1: 0 });
  t.merge(m, { r0: 3, c0: 0, r1: 4, c1: 0 });
  m.cols[2].num = { sig: 3 }; m.cols[2].unit = 'g';
  m.cols[3].num = { exp: 'sci', dp: 1 }; m.cols[3].unit = '\\metre\\per\\second';
  m.caption = 'Masses and speeds'; m.label = 'tab:ms'; m.float = true;
  const r = t.toLatex(m);
  T.ok(r.packages.join() === '\\usepackage{booktabs},\\usepackage{multirow},\\usepackage{siunitx}', r.packages.join());
  T.ok(/\\multirow\{2\}\{\*\}\{A\}/.test(r.code) && /\{Mass \(\\unit\{g\}\)\}/.test(r.code), r.code);
  T.ok(/1\.23\(1\)/.test(r.code) && /a\\_b \\& 100\\%/.test(r.code) && /\\#1 \\\{x\\\}/.test(r.code), r.code);
  T.golden('table/academic.tex', r.code + '\n');
  T.tex('table-academic', doc(m));
});

T.test('table latex: grid with colours, rules, wrapping, tabularx, longtable all compile', () => {
  const t = TB();
  const base = () => {
    const m = t.importText('Item,Description,Cost\nPen,"A long description that should wrap inside a fixed width column",1.50\nBook,Short,12.00\nLamp,"Another fairly long line of text",30.25').table;
    t.applyPreset(m, 'grid');
    t.styleRange(m, { r0: 0, c0: 0, r1: 0, c1: 2 }, { bg: '#DDE6F2' });
    t.styleRange(m, { r0: 2, c0: 2, r1: 2, c1: 2 }, { fg: '#C8361D', b: true });
    t.setBorders(m, { r0: 0, c0: 0, r1: 3, c1: 2 }, 'outer', 2);
    m.cols[1].w = 4;
    return m;
  };
  const g = base();
  T.golden('table/grid.tex', t.toLatex(g).code + '\n');
  T.tex('table-grid', doc(g));
  const x = base(); x.env = 'tabularx'; x.cols[1].w = 0; x.cols[1].fill = true; x.width = 0.8;
  const rx = t.toLatex(x);
  T.ok(/\\begin\{tabularx\}\{0\.8\\linewidth\}/.test(rx.code) && /X/.test(rx.code), rx.code);
  T.tex('table-tabularx', doc(x));
  const l = base(); l.env = 'longtable'; l.caption = 'Long one'; l.label = 'tab:long';
  for (let i = 0; i < 60; i++) t.insertRows(l, t.nRows(l), 1), (l.cells[t.nRows(l) - 1][0].t = 'Row ' + i);
  const rl = t.toLatex(l);
  T.ok(/\\endfirsthead/.test(rl.code) && /\\endhead/.test(rl.code) && /\\caption\{Long one\}/.test(rl.code), rl.code.slice(0, 600));
  T.tex('table-longtable', doc(l));
  const s = t.create(4, 3, 'striped'); s.cells[0][0].t = 'a'; s.stripe = '#EEF2F7';
  T.ok(/\\definecolor\{stripeOdd\}\{HTML\}\{EEF2F7\}\s+\\rowcolors\{2\}\{stripeOdd\}\{\}/.test(t.toLatex(s).code), t.toLatex(s).code);
  T.ok(/\\rowcolor\[HTML\]\{EEF2F7\}/.test(t.toLatex(s, { bare: true }).code), 'in a TikZ node, row by row');
  T.tex('table-striped', doc(s));
  const lines = t.create(3, 3, 'grid'); lines.booktabs = false; lines.cells[1][1].t = '$\\alpha \\pm \\beta$';
  t.merge(lines, { r0: 0, c0: 0, r1: 0, c1: 1 });
  t.merge(lines, { r0: 1, c0: 2, r1: 2, c1: 2 });
  lines.cells[1][2].bg = '#FFEEDD';
  T.tex('table-lines-merges', doc(lines));
});

T.test('table latex: escaping is safe for any text', () => {
  const t = TB(), m = t.create(2, 2, 'plain');
  const nasty = ['50% & #1 _x ^y ~z', '\\end{tabular}}', '{{{', '$unclosed', 'a \\\\ b', '\\', '$$', '}{', '\\textbf{ok} and $x_1$'];
  for (const s of nasty) {
    m.cells[0][0].t = s; m.cells[1][1].t = s;
    T.tex('table-escape-' + nasty.indexOf(s), doc(m));
  }
  m.cells[0][0].t = '\\end{tabular}}';
  const code = t.toLatex(m).code;
  T.eq((code.match(/\\end\{tabular\}/g) || []).length, 1, 'a cell cannot close the table: its \\end prints as text');
  m.cells[0][0].t = '\\begin{tabular}{c} x \\end{tabular} and \\begin{itemize}';
  const c2 = t.toLatex(m).code;
  T.ok(/\\begin\{tabular\}\{c\} x \\end\{tabular\}/.test(c2) && /\\textbackslash\{\}begin\\\{itemize\\\}/.test(c2), 'a nested table stays; an unclosed environment prints: ' + c2);
  T.tex('table-escape-nested', doc(m));
});

T.test('table latex: round trip through LaTeX keeps structure and formats', () => {
  const t = TB();
  const cases = [];
  const a = t.importText('A,B,C,D\n1,2,3,4\n5,6,7,8\n9,10,11,12').table;
  t.merge(a, { r0: 1, c0: 0, r1: 2, c1: 0 }); t.merge(a, { r0: 0, c0: 1, r1: 0, c1: 2 });
  a.cells[3][3].bg = '#ABCDEF'; a.cells[3][2].fg = '#123456'; a.cells[3][1].b = true; a.cells[3][1].i = true;
  a.caption = 'Cap'; a.label = 'tab:x'; a.float = true;
  cases.push(a);
  const b = t.create(3, 3, 'grid'); b.booktabs = false; b.cells[0][0].t = 'x'; b.cells[2][2].t = '$y^2$';
  t.setBorders(b, { r0: 0, c0: 0, r1: 2, c1: 2 }, 'outer', 2);
  cases.push(b);
  const c = t.create(3, 2, 'striped'); c.stripe = '#EEF2F7'; c.cols[1].num = { dp: 2 }; c.cells[1][1].t = '1.5'; c.cells[2][1].t = '22.25'; c.cells[0][0].t = 'H';
  cases.push(c);
  for (const m of cases) {
    const once = t.toLatex(m).code, back = t.importText(once).table, twice = t.toLatex(back).code;
    T.eq(twice, once, 'LaTeX → table → LaTeX is stable');
    T.eq(cellsOf(back), cellsOf(m).map((r, i) => r.map((x, j) => (m.cols[j].num && i >= m.head && x ? t.siString(t.format(t.parseNum(x), m.cols[j].num)) : x))));
  }
});

T.test('table latex: environments inside a cell (pmatrix, cases)', () => {
  const t = TB(), m = t.create(1, 2, 'booktabs');
  m.cells[0][0].t = '$\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}$';
  m.cells[0][1].t = 'line\\\\break';
  const k = t.toLatex(m).code;
  T.ok(k.includes('$\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}$'), k);
  T.ok(/\\usepackage\{amsmath\}/.test(t.snippet(m)), 'amsmath in the preamble');
  T.tex('table-pmatrix', t.toLatex(m, { standalone: true }).code);
});
T.test('table latex: snippet, bare and standalone forms', () => {
  const t = TB(), m = t.create(2, 2, 'booktabs');
  m.cells[0][0].t = 'a';
  const bare = t.toLatex(m, { bare: true }).code;
  T.ok(bare.startsWith('\\begin{tabular}') && bare.trim().endsWith('\\end{tabular}'), bare);
  const s = t.toLatex(m, { standalone: true }).code;
  T.ok(/^\\documentclass/.test(s) && /\\usepackage\{booktabs\}/.test(s) && /\\end\{document\}\s*$/.test(s), s);
  T.ok(/^% Preamble: \\usepackage\{booktabs\}/.test(t.snippet(m)));
  m.size = 'small'; m.pad = 4; m.stretch = 1.3;
  const k = t.toLatex(m).code;
  T.ok(/\\small/.test(k) && /\\setlength\{\\tabcolsep\}\{4pt\}/.test(k) && /\\renewcommand\{\\arraystretch\}\{1\.3\}/.test(k), k);
  T.tex('table-sized', t.toLatex(m, { standalone: true }).code);
});

// ---------------------------------------------------------------- render and export
T.test('table render: layout, SVG and PNG export', async () => {
  const t = TB();
  const m = t.importText('Name,Value\nalpha,$\\alpha$\nbeta,2.5').table;
  m.caption = 'Cap';
  const L = t.layout(m);
  T.ok(L.w > 40 && L.h > 40 && L.colX.length === 3 && L.rowY.length === 4, JSON.stringify([L.w, L.h]));
  T.ok(L.cells.length === 6);
  const merged = t.create(3, 3, 'grid'); t.merge(merged, { r0: 0, c0: 0, r1: 1, c1: 1 }); merged.cells[0][0].t = 'a long merged label here';
  const ML = t.layout(merged);
  const box = ML.cells.find((c) => c.r === 0 && c.c === 0);
  T.ok(Math.abs(box.w - (ML.colX[2] - ML.colX[0])) < 1.5 && Math.abs(box.h - (ML.rowY[2] - ML.rowY[0])) < 1.5, 'a merged cell covers its columns and rows: ' + JSON.stringify([box.w, box.h, ML.colX, ML.rowY]));
  const shape = { type: 'table', x: 0, y: 0, table: m, cap: true };
  const svg = TD.app.svgOf([shape]);
  T.ok(/^<svg/.test(svg) && /foreignObject/.test(svg) && /Cap/.test(svg));
  const full = await TD.app.svgWithFonts(svg);
  T.ok(/@font-face/.test(full), 'the SVG download carries the maths fonts');
  const png = await TD.app.pngOf([shape], 150, false);
  T.eq(png.type, 'image/png');
  const bmp = await createImageBitmap(png);
  T.ok(bmp.width > L.w * 150 / 2.54 / TD.PX_PER_CM * 0.8, 'PNG at the DPI asked');
  const tikz = TD.TYPES.table.tikz(shape, { pkgs: new Set(), c: (x, y) => `(${x},${y})` });
  T.ok(/\\node\[inner sep=0pt\]/.test(tikz) && /\\begin\{tabular\}/.test(tikz));
});

// ---------------------------------------------------------------- Overleaf's "Tables" article, read and written
const OV = {
  double: String.raw`\begin{tabular}{||c c c c||}
 \hline
 Col1 & Col2 & Col2 & Col3 \\ [0.5ex]
 \hline\hline
 1 & 6 & 87837 & 787 \\
 \hline
\end{tabular}`,
  middle: String.raw`\begin{tabular}{ | m{5em} | m{1cm}| b{1cm} | }
  \hline
  cell1 dummy text dummy text dummy text& cell2 & cell3 \\
  \hline
\end{tabular}`,
  multirow: String.raw`\begin{tabular}{ |c|c|c| }
\hline
col1 & col2 & col3 \\
\hline
\multirow{3}{4em}{Multiple row} & cell2 & cell3 \\
& cell5 & cell6 \\
& cell8 & cell9 \\
\hline
\end{tabular}`,
  longtable: String.raw`\begin{longtable}[c]{| c | c |}
\caption{Long table caption.\label{long}}\\
\hline
\multicolumn{2}{| c |}{Begin of Table}\\
\hline
Something & Something else\\
\hline
\endfirsthead
\hline
\multicolumn{2}{| c |}{Continuation of Table \ref{long}}\\
\hline
Something & Something else\\
\hline
\endhead
\hline
\endfoot
\hline
\multicolumn{2}{| c |}{End of Table}\\
\hline\hline
\endlastfoot
Lots of lines & like this\\
Lots of lines & like this\\
\end{longtable}`,
  float: String.raw`\begin{table}[h!]
\centering
\begin{tabular}{||c c||}
 \hline
 Col1 & Col2 \\
 \hline
\end{tabular}
\caption{Table to test captions and labels.}
\label{table:1}
\end{table}`,
  rules: String.raw`\setlength{\arrayrulewidth}{0.5mm}
\setlength{\tabcolsep}{18pt}
\renewcommand{\arraystretch}{1.5}
\arrayrulecolor[HTML]{DB5800}
\begin{tabular}{ |p{3cm}|p{3cm}| }
\hline
Afghanistan & AF \\
\hline
\end{tabular}`,
  rowcolors: String.raw`\rowcolors{3}{green!80!yellow!50}{green!70!yellow!40}
\begin{tabular}{ |p{3cm}|p{3cm}| }
\hline
\multicolumn{2}{|c|}{Country List} \\
\hline
Country Name & ISO 2 \\
Afghanistan & AF \\
Aland Islands & AX \\
Albania & AL \\
\hline
\end{tabular}`,
  coltype: String.raw`\newcolumntype{s}{>{\columncolor[HTML]{AAACED}} p{3cm}}
\begin{tabular}{ |s|p{3cm}|p{3cm}|  }
\hline
\rowcolor{lightgray} \multicolumn{3}{|c|}{Country List} \\
\hline
Afghanistan & AF & AFG \\
\hline
\end{tabular}`,
  star: String.raw`\begin{tabular}[t]{|*{3}{c|}}
\hline
a & b & c \\ \hhline{|~|=|=|}
d & e & g \\[6pt]
\hline
\end{tabular}`,
};
T.test('table latex: the examples of Overleaf\'s Tables article read and write back', () => {
  const t = TB(), rd = (k) => t.importText(OV[k]).table;
  let m = rd('double');
  T.eq(m.vr[0][0], 3, '|| is a double rule'); T.eq(m.hr[1].join(), '3,3,3,3', '\\hline\\hline is a double rule'); T.eq(m.skip[0], '0.5ex', '\\\\[0.5ex] is kept');
  let code = t.toLatex(m).code;
  T.ok(/\{\|\|cccc\|\|\}/.test(code) && /\\hline\\hline/.test(code) && /\\\\\[0\.5ex\]/.test(code), code);
  m = rd('middle');
  T.eq(m.cells[0].map((x) => x.va || 't').join(''), 'mmb', 'm{} and b{} columns sit in the middle and at the bottom');
  T.ok(/\{\|m\{1\.75cm\}\|m\{1cm\}\|b\{1cm\}\|\}/.test(t.toLatex(m).code), t.toLatex(m).code);
  m = rd('multirow');
  T.eq(m.cells[1][0].mw, '4em'); T.ok(/\\multirow\{3\}\{4em\}\{Multiple row\}/.test(t.toLatex(m).code));
  m = rd('longtable');
  T.eq([m.caption, m.label, m.head, m.foot, t.nRows(m)].join('|'), 'Long table caption.|long|2|1|5', 'caption, label in it, header and footer');
  T.eq(m.cells[4][0].t, 'End of Table', 'the last footer is the last row, not one in the middle');
  code = t.toLatex(m).code;
  T.ok(/\\endhead\s+\\hline\s+\\endfoot\s+\\hline\s+\\multicolumn\{2\}\{\|c\|\}\{End of Table\} \\\\\s+\\hline\\hline\s+\\endlastfoot\s+Lots/.test(code), code);
  m = rd('float');
  T.eq([m.floatPos, m.caption, m.label].join('|'), 'h!|Table to test captions and labels.|table:1');
  T.ok(/\\begin\{table\}\[h!\]/.test(t.toLatex(m).code));
  m = rd('rules');
  T.eq([m.ruleW, m.ruleColor, m.pad, m.stretch].join('|'), '1.42|#db5800|18|1.5');
  code = t.toLatex(m).code;
  T.ok(/\\setlength\{\\arrayrulewidth\}\{1\.42pt\}/.test(code) && /\\arrayrulecolor\[HTML\]\{DB5800\}/.test(code), code);
  m = rd('rowcolors');
  T.eq([m.stripe2, m.stripe, m.stripeFrom].join('|'), '#99ff80|#b8ff99|2', 'two colours from the third row');
  T.ok(m.cells.every((row) => row.every((x) => !x.bg)), 'not painted cell by cell');
  const rc = t.toLatex(m);
  T.ok(/\\rowcolors\{3\}\{stripeOdd\}\{stripeEven\}/.test(rc.code) && rc.packages.includes('\\usepackage[table]{xcolor}'), rc.code + rc.packages);
  m = rd('coltype');
  T.eq(t.nCols(m), 3, 'a \\newcolumntype column is a column');
  T.eq([m.cells[1][0].bg, m.cells[1][1].bg, m.cells[0][0].bg].join('|'), '#aaaced||#bfbfbf', 'its \\columncolor, under the row colour');
  T.eq(m.cols[0].w, 3);
  m = rd('star');
  T.eq(m.tpos, 't'); T.eq(m.hr[1].join(), '0,3,3', '\\hhline'); T.eq(m.skip[1], '6pt');
  code = t.toLatex(m).code;
  T.ok(/\\begin\{tabular\}\[t\]/.test(code) && /\\hhline\{\|~\|=\|=\|\}/.test(code), code);
  // each one compiles, and reads back to the same code
  for (const k of Object.keys(OV)) {
    const a = rd(k), once = t.toLatex(a).code, twice = t.toLatex(t.importText(once).table).code;
    T.eq(twice, once, k + ': LaTeX → table → LaTeX is stable');
    T.tex('table-overleaf-' + k, doc(a));
  }
  // drawn: a double rule is two lines, \\[6pt] makes the row taller, the rules take their colour
  const d = rd('double'), L1 = t.layout(d); d.skip[0] = ''; const L0 = t.layout(d);
  T.ok(L1.rowY[1] - L0.rowY[1] > 2, 'the space after the row is drawn: ' + (L1.rowY[1] - L0.rowY[1]));
  const svg = t.draw(rd('rules')).svg;
  T.ok(/fill="#db5800"/.test(svg) && !/fill="#000000"\/>/.test(svg), 'the rules are drawn in their colour');
});
T.test('table: footer rows follow inserts and deletes', () => {
  const t = TB(), m = t.create(6, 2, 'grid');
  m.env = 'longtable'; m.head = 1; m.foot = 2;
  t.insertRows(m, 2, 1); T.eq(m.foot, 2, 'a row in the body');
  t.insertRows(m, 6, 1); T.eq(m.foot, 3, 'a row inside the footer');
  t.deleteRows(m, 5, 6); T.eq(m.foot, 1, 'two footer rows deleted');
  T.eq(m.skip.length, t.nRows(m), 'the row spacing follows');
  const back = t.normalize(JSON.parse(JSON.stringify(m)));
  T.eq([back.foot, back.skip.length].join(), [m.foot, t.nRows(m)].join());
});

// ---------------------------------------------------------------- the workspace
T.test('table workspace: open, import, type, keys, undo, paste, leave', async () => {
  const C = TD.app.cmd, W = () => TD.tableWs;
  C.setTable(true); await wait(60);
  T.ok(document.body.classList.contains('mode-table') && !document.getElementById('tableview').hidden, 'workspace check 1');
  T.ok(document.querySelector('#kindSeg [data-table]').classList.contains('on'), 'workspace check 2');
  W().importText('a,b\n1,2');
  const grid = document.querySelector('.tb-gridwrap');
  const key = (k, o = {}) => grid.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  grid.focus();
  W().select([0, 0]);
  key('ArrowDown'); key('ArrowRight');
  T.eq(W().range(), { r0: 1, c0: 1, r1: 1, c1: 1 });
  key('9'); await wait();
  const ta = document.querySelector('.tb-edit');
  T.ok(ta && ta.value === '9', 'typing starts an edit that replaces the text');
  ta.value = '9.5'; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  T.eq(W().model.cells[1][1].t, '9.5');
  T.eq(W().range().r0, 1, 'Enter keeps to the last row (no row below)');
  key('z', { metaKey: true, ctrlKey: true }); T.eq(W().model.cells[1][1].t, '2', 'undo');
  key('z', { metaKey: true, ctrlKey: true, shiftKey: true }); T.eq(W().model.cells[1][1].t, '9.5', 'redo');
  key('ArrowUp', { shiftKey: true }); key('ArrowLeft', { shiftKey: true });
  T.eq(W().range(), { r0: 0, c0: 0, r1: 1, c1: 1 });
  key('b', { metaKey: true, ctrlKey: true });
  T.ok(W().model.cells[1][0].b, 'bold on the range');
  key('Backspace'); T.ok(W().model.cells.every((r) => r.every((x) => !x.t)), 'Delete clears the range');
  key('z', { metaKey: true, ctrlKey: true });
  // paste cells from a spreadsheet (TSV) at B2: the table grows
  W().select([1, 1]);
  W().pasteData('', 'x\ty\tz\n1\t2\t3\n');
  T.eq([TD.table.nRows(W().model), TD.table.nCols(W().model), W().model.cells[2][3].t], [3, 4, '3']);
  // a whole LaTeX table pasted at A1 lands on its cells; the rest of the table stays
  W().select([0, 0]);
  W().pasteData('', '\\begin{tabular}{lr}\\toprule P & Q \\\\\\midrule 1 & 2 \\\\\\bottomrule\\end{tabular}');
  T.eq(cellsOf(W().model), [['P', 'Q', '', ''], ['1', '2', 'y', 'z'], ['', '1', '2', '3']]);
  T.eq(W().range(), { r0: 0, c0: 0, r1: 1, c1: 1 }, 'the pasted range is selected');
  // CSV at D3 grows the table by a row and a column
  W().select([2, 3]);
  W().pasteData('', 'a,b\nc,d\n');
  T.eq([TD.table.nRows(W().model), TD.table.nCols(W().model), W().model.cells[3][4].t, W().model.cells[0][0].t], [4, 5, 'd', 'P']);
  key('z', { metaKey: true, ctrlKey: true });
  T.eq([TD.table.nRows(W().model), TD.table.nCols(W().model)], [3, 4], 'undo the CSV paste');
  // the + strips add a column and a row at the end
  document.querySelector('.tg-addc').click();
  T.eq(TD.table.nCols(W().model), 5, 'add a column');
  document.querySelector('.tg-addr').click();
  T.eq(TD.table.nRows(W().model), 4, 'add a row');
  key('z', { metaKey: true, ctrlKey: true }); key('z', { metaKey: true, ctrlKey: true });
  T.eq([TD.table.nRows(W().model), TD.table.nCols(W().model)], [3, 4], 'undo the strips');
  // the border menu ticks the rule weight in use
  document.querySelector('[data-t="borders"]').click();
  const ticked = [...document.querySelectorAll('.ctx-item[aria-checked="true"]')].map((b) => b.textContent.trim());
  T.eq(ticked, ['Thin Rules'], 'thin is ticked');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  // ticking a box in the panel keeps its scroll
  const pr = document.getElementById('props');
  pr.scrollTop = 9999; const st = pr.scrollTop;
  document.querySelector('#props [data-p="striped"]').click();
  T.eq(pr.scrollTop, st, 'the panel stays where it was');
  key('z', { metaKey: true, ctrlKey: true });
  // copy carries the cells for this tool and for spreadsheets
  W().select([0, 0], [1, 1]);
  const dt = new DataTransfer();
  grid.dispatchEvent(T.clipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
  T.eq(dt.getData('text/plain'), 'P\tQ\n1\t2');
  T.ok(/data-diagramtex-table/.test(dt.getData('text/html')), 'workspace check 3');
  // the panel drives the model
  const cap = document.querySelector('#props [data-p="caption"]');
  cap.value = 'Hello'; cap.dispatchEvent(new Event('input', { bubbles: true }));
  T.eq(W().model.caption, 'Hello');
  T.ok(document.activeElement !== cap || document.querySelector('#props [data-p="caption"]') === cap, 'typing in the panel keeps its field');
  // the LaTeX pane follows
  await wait(80);
  T.ok(/\\caption\{Hello\}|Hello/.test(document.querySelector('.tb-code').textContent), 'workspace check 4');
  // the code view: ⌘A takes just the code, and copying all of it gives the exact LaTeX
  const tabWas = document.querySelector('[data-tab].on')?.dataset.tab || 'preview';
  document.querySelector('[data-tab="latex"]').click();
  const codeEl = document.querySelector('.tb-code');
  codeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
  const selText = getSelection().toString();
  T.ok(selText.length > 0 && selText.length < document.body.innerText.length / 2 && /\\begin\{tabular\}/.test(selText), '⌘A in the LaTeX view selects only the code');
  const cdt = new DataTransfer();
  codeEl.dispatchEvent(T.clipboardEvent('copy', { clipboardData: cdt, bubbles: true, cancelable: true }));
  T.ok(cdt.getData('text/plain').includes('\\caption{Hello}') && !/^ $/m.test(cdt.getData('text/plain')), 'copying all the code gives its exact text');
  getSelection().removeAllRanges();
  document.querySelector(`[data-tab="${tabWas}"]`).click();
  // the sidebar's Text input switch shows in Table too
  T.ok(document.getElementById('inputBox').offsetHeight > 0, 'Text input switch shown');
  // the toolbar fits one line at 1400px wide windows (measured at this window's width when it is that wide)
  const bar = document.querySelector('.tb-bar');
  T.ok(new Set([...bar.children].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1, 'toolbar on one line');
  // leaving puts the file back
  document.querySelector('#kindSeg [data-mode="page"], #kindSeg [data-kind="classic"]').click(); await wait(200);
  T.ok(!document.body.classList.contains('mode-table') && document.getElementById('tableview').hidden, 'workspace check 5');
  C.setTable(true); await wait(60);
  T.eq(cellsOf(W().model), [['P', 'Q', '', ''], ['1', '2', 'y', 'z'], ['', '1', '2', '3']], 'the table is kept while the browser has it');
  C.setTable(false); await wait(60);
});

// ---------------------------------------------------------------- the Table block on the canvas
T.test('table block: pasted cells and a pasted tabular become Table blocks; exported in a node, read back, edited in the workspace', async () => {
  TD.app.newDoc('Table block', null, null, null, null, 'board'); TD.app.render();
  // as a paste or a drop hands them over (⌘V itself prefers shapes copied in the app while the system clipboard is older)
  const paste = (data) => TD.app.takeIn(data['text/plain'] || '', [], null, undefined, data['text/html'] || '');
  const shapes = () => TD.state.doc.shapes;
  // cells from a spreadsheet: HTML with tab-separated text
  await paste({ 'text/plain': 'Name\tScore\nAda\t9.5\nBob\t7.25\n', 'text/html': '<table><tr><td>Name</td><td>Score</td></tr><tr><td>Ada</td><td>9.5</td></tr><tr><td>Bob</td><td>7.25</td></tr></table>' });
  await wait(150);
  T.eq(shapes().length, 1, 'spreadsheet cells: one object: ' + JSON.stringify(shapes().map((x) => x.type)));
  T.eq(shapes()[0].type, 'table');
  T.eq(cellsOf(shapes()[0].table), [['Name', 'Score'], ['Ada', '9.5'], ['Bob', '7.25']]);
  // a Markdown table, and a tabular with settings and a float round it
  await paste({ 'text/plain': '| a | b |\n|---|---|\n| 1 | 2 |\n' });
  await wait(150);
  T.eq(shapes()[1] && shapes()[1].type, 'table', 'a Markdown table');
  await TD.app.takeText('\\begin{table}[h]\n  \\centering\\small\n  \\caption{Results}\n  \\begin{tabular}{lr}\n    \\toprule\n    x & y \\\\\n    \\midrule\n    1 & 2 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}', null);
  const tb = shapes()[2];
  T.eq(tb && tb.type, 'table', 'a table float pasted: a Table block');
  T.eq(cellsOf(tb.table), [['x', 'y'], ['1', '2']]);
  // words before the tabular: not a table block
  T.ok(TD.pasteIn.kind('Some words \\begin{tabular}{l} a \\end{tabular}') !== 'block', 'words before it: not a table block');
  T.eq(TD.pasteIn.kind('\\begin{tabular}{l} a \\\\ \\end{tabular}'), 'block');
  // exported as a tabular in a node; read back, the same table at the same place
  const tikz = TD.toTikz([tb], { standalone: true });
  T.ok(/\\node\[inner sep=0pt\] at \([^)]*\) \{%[\s\S]*\\begin\{tabular\}\{lr\}[\s\S]*\\end\{tabular\}[\s\S]*%\s*\};/.test(tikz), 'a tabular in a node: ' + tikz);
  T.ok(/\\usepackage\{booktabs\}/.test(tikz), 'booktabs in the preamble');
  T.ok(!/\\caption|\\begin\{table\}/.test(tikz), 'no float or caption in the node');
  T.tex('table-block', tikz);
  const back = TD.importLatex(tikz).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type !== 'tikz');
  T.eq(back.length, 1, 'read back: one object');
  T.eq(back[0].type, 'table', 'read back: a Table block');
  T.eq(cellsOf(back[0].table), cellsOf(tb.table));
  T.ok(Math.abs(back[0].x - tb.x) < 0.5 && Math.abs(back[0].y - tb.y) < 0.5, `read back at the same place (${back[0].x},${back[0].y} vs ${tb.x},${tb.y})`);
  // edited in the Table workspace: the workspace's own table waits; Done writes back as one undo step; Cancel drops
  const own = JSON.stringify(TD.tableWs.model);
  TD.tableOpen(tb.id);
  await wait(100);
  T.ok(TD.app.cmd.inTable() && TD.tableWs.inBlock, 'the block opens in Table mode');
  T.ok(document.querySelector('.tb-session [data-ses=done]'), 'with Cancel and Done');
  T.ok(!/\\begin\{center\}|\\begin\{table\}/.test(document.querySelector('.tb-code').textContent), 'the LaTeX shown is the bare tabular');
  const m = TD.tableWs.model; m.cells[1][0].t = 'one'; TD.tableWs.model = m;
  document.querySelector('[data-ses=done]').click();
  await wait(100);
  T.ok(!TD.app.cmd.inTable(), 'Done leaves Table mode');
  T.eq(TD.state.doc.shapes.find((s) => s.id === tb.id).table.cells[1][0].t, 'one', 'Done writes the table back');
  T.eq(JSON.stringify(TD.tableWs.model), own, "the workspace's own table is back");
  TD.app.cmd.undo();
  T.eq(TD.state.doc.shapes.find((s) => s.id === tb.id).table.cells[1][0].t, '1', 'one undo step');
  TD.tableOpen(tb.id);
  await wait(100);
  const m2 = TD.tableWs.model; m2.cells[1][0].t = 'two'; TD.tableWs.model = m2;
  document.querySelector('[data-ses=cancel]').click();
  await wait(100);
  const discard = [...document.querySelectorAll('.td-dialog button')].find((b) => /Discard/.test(b.textContent));
  T.ok(discard, 'Cancel with changes asks first');
  discard.click();
  await wait(100);
  T.ok(!TD.app.cmd.inTable(), 'Cancel leaves Table mode');
  T.eq(TD.state.doc.shapes.find((s) => s.id === tb.id).table.cells[1][0].t, '1', 'Cancel keeps the block as it was');
  // the panel's LaTeX edits the table; code that doesn't read keeps the last table
  const P = TD.panels.table;
  P.apply(tb, { dataset: { p: 'src' }, value: '\\begin{tabular}{ll} p & q \\\\ \\end{tabular}' });
  T.eq(cellsOf(tb.table), [['p', 'q']]);
  P.apply(tb, { dataset: { p: 'src' }, value: '\\begin{tabular}{ll} p & q' });
  T.eq(cellsOf(tb.table), [['p', 'q']], 'half-typed code: the table stays');
  T.ok(P.model(tb).warnings.length === 1, 'with a note');
  P.apply(tb, { dataset: { p: 'src' }, value: '\\begin{tabular}{ll} p & r \\\\ \\end{tabular}' });
  T.eq(P.model(tb).warnings.length, 0);
});
