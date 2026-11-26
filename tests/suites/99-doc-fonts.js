// A Classic Document's font (page.family, src/core/doc-fonts.ts) and the LaTeX engine: the preamble each engine
// writes, objects' own fonts against the document's, Thai with XeLaTeX, and the in-browser XeLaTeX.
{
  const label = (id, x, extra = {}) => ({ ...TD.TYPES.text.create({ x, y: 0 }, TD.state.defaults), id, x, y: 0, text: 'Label $x^2$', ...extra });
  const docOf = (family, blocks) => ({ name: 'fonts', kind: 'classic', page: { ...TD.PAGE_DEFAULT, family }, blocks });
  const has = (tex, line, why) => T.ok(tex.split('\n').includes(line), `${why || 'has'} ${line}:\n${tex}`);

  T.test('document fonts: each font writes its preamble for pdfLaTeX and XeLaTeX, and both compile', () => {
    for (const f of ['lm', 'times', 'palatino', 'helvetica']) {
      const doc = docOf(f, [{ type: 'text', text: 'Some \\textbf{bold} and \\emph{stressed} text with $\\int_0^1 x\\,dx$.' }, { type: 'diagram', shapes: [label('a', 0, { bold: true })] }]);
      const pdf = TD.docToLatex(doc, { engine: 'pdflatex' }), xe = TD.docToLatex(doc, { engine: 'xelatex' });
      T.ok(!/fontspec/.test(pdf), f + ': pdfLaTeX has no fontspec');
      if (f !== 'lm') T.ok(/\\usepackage(\[[^\]]*\])?\{fontspec\}/.test(xe), f + ': XeLaTeX uses fontspec:\n' + xe);
      T.tex(`doc-font-${f}-pdflatex`, pdf);
      T.tex(`doc-font-${f}-xelatex`, xe, null, 'xelatex');
    }
    const times = TD.docToLatex(docOf('times', [{ type: 'text', text: 'x' }]));
    has(times, '\\usepackage{newtxtext,newtxmath}');
    T.ok(times.indexOf('newtxmath') > times.indexOf('{amsmath, amssymb}'), 'newtxmath after amsmath and amssymb');
  });

  T.test('document fonts: Computer Modern writes what it always did', () => {
    const shapes = [label('a', 0, { font: 'cmss' }), label('b', 80, { font: 'times' })];
    const cm = TD.docToLatex(docOf('cm', [{ type: 'diagram', shapes }])), none = TD.docToLatex(docOf(undefined, [{ type: 'diagram', shapes }]));
    T.eq(cm, none, 'cm is the default');
    T.ok(cm.includes('font=\\sffamily') && cm.includes('font=\\fontfamily{ptm}\\selectfont'), cm);
  });

  T.test('document fonts: an object keeps its own font in a document set in another', () => {
    const shapes = [label('a', 0, { font: 'cmr' }), label('b', 80, { font: 'times' }), label('c', 160, { font: 'kinnari', text: 'ไทย' })];
    // (pdfLaTeX can't set Thai: its copy says Garuda in Latin letters)
    const pdf = TD.docToLatex(docOf('palatino', [{ type: 'diagram', shapes: shapes.map((q) => (q.id === 'c' ? { ...q, text: 'Kinnari' } : q)) }]), { engine: 'pdflatex' });
    T.ok(pdf.includes('font=\\fontfamily{cmr}\\selectfont'), 'Computer Modern by name, not \\rmfamily (Palatino):\n' + pdf);
    const xe = TD.docToLatex(docOf('palatino', [{ type: 'diagram', shapes }]), { engine: 'xelatex' });
    T.ok(xe.includes('font=\\tdlmroman') && xe.includes('font=\\tdtermes') && xe.includes('font=\\tdkinnari'), 'XeLaTeX font families:\n' + xe);
    T.ok(/\\newfontfamily\\tdtermes\{texgyretermes\}/.test(xe) && /\\newfontfamily\\tdkinnari\{Kinnari\}/.test(xe), 'each defined once in the preamble');
    T.eq((xe.match(/\\usepackage(\[[^\]]*\])?\{fontspec\}/g) || []).length, 1, 'fontspec loaded once');
    T.tex('doc-font-objects-xelatex', xe, null, 'xelatex');
    T.tex('doc-font-objects-pdflatex', pdf);
  });

  T.test('document fonts: Thai with XeLaTeX (the font, a Thai font for Thai text in a Latin one, and where lines break)', () => {
    const text = 'ภาษาไทยไม่เว้นวรรคระหว่างคำ and English.';
    const thai = TD.docToLatex(docOf('kinnari', [{ type: 'text', text }]), { engine: 'xelatex' });
    T.ok(/\\setmainfont\{Kinnari\}/.test(thai), thai);
    T.ok(/ภาษา\\tdbr ไทย/.test(thai) && thai.includes('\\providecommand*\\tdbr'), 'words marked where a line may break:\n' + thai);
    T.ok(!thai.includes('\\XeTeXinterchartoks'), 'no fallback: the font is Thai');
    const latin = TD.docToLatex(docOf('times', [{ type: 'text', text }]), { engine: 'xelatex' });
    T.ok(latin.includes('\\newfontfamily\\tdthai{Kinnari}') && latin.includes('\\XeTeXinterchartokenstate=1'), 'Thai letters switch to a Thai font:\n' + latin);
    T.tex('doc-font-thai-xelatex', thai, null, 'xelatex');
    T.tex('doc-font-thai-in-times-xelatex', latin, null, 'xelatex');
    // an object in a Thai font keeps it: the fallback switches only where the font in use has no Thai
    T.ok(latin.includes('\\iffontchar\\font"0E01 \\else\\tdthai\\fi'), 'the fallback only for fonts without Thai');
    const own = TD.docToLatex(docOf('times', [{ type: 'diagram', shapes: [label('g', 0, { font: 'garuda', text: 'ครุฑ Garuda' })] }]), { engine: 'xelatex' });
    T.ok(own.includes('font=\\tdgaruda') && own.includes('\\iffontchar'), own);
    T.tex('doc-font-thai-object-xelatex', own, null, 'xelatex');
  });

  T.test('document fonts: Thai with pdfLaTeX (the TLWG fonts in the LTH encoding, the source still in Thai)', () => {
    const text = 'ภาษาไทยไม่เว้นวรรคระหว่างคำ and English.';
    const latin = TD.docToLatex(docOf('times', [{ type: 'text', text }, { type: 'diagram', shapes: [label('g', 0, { font: 'garuda', text: 'ครุฑ Garuda $x$' })] }]), { engine: 'pdflatex' });
    T.ok(latin.includes('\\makeatletter\\input{lthenc.def}\\makeatother') && latin.includes('\\DeclareRobustCommand*\\tdth[1]'), 'the LTH set-up:\n' + latin);
    T.ok(/\\tdth\{ภาษา\\tdbr ไทย\\tdbr /.test(latin), 'each Thai run in \\tdth, its words marked:\n' + latin);
    T.ok(latin.includes('font=\\fontencoding{LTH}\\fontfamily{garuda}\\selectfont\\def\\tdthaifam{garuda}'), 'an object in Garuda');
    T.ok(latin.includes('\\usepackage{newtxtext,newtxmath}'), 'the Latin text stays in Times');
    T.tex('doc-font-thai-in-times-pdflatex', latin);
    const thai = TD.docToLatex(docOf('laksaman', [{ type: 'text', text }]), { engine: 'pdflatex' });
    T.ok(/^% Note: The document font Laksaman \(ลักษมัณ\): pdfLaTeX sets its Thai in it/.test(thai) && thai.includes('\\newcommand*\\tdthaifam{laksaman}'), thai);
    T.ok(thai.indexOf('\\newcommand*\\tdthaifam{laksaman}') < thai.indexOf('\\providecommand*\\tdthaifam{kinnari}'), 'the document\'s Thai font before the default');
    T.tex('doc-font-thai-laksaman-pdflatex', thai);
    const warn = (tex, engine) => TD.lint(tex, { preview: false, engine }).filter((d) => /XeLaTeX sets it best/.test(d.msg));
    T.eq(warn(latin, 'pdflatex').length, 1, 'the LaTeX window says XeLaTeX sets Thai best');
    T.eq(warn(TD.docToLatex(docOf('times', [{ type: 'text', text }]), { engine: 'xelatex' }), 'xelatex').length, 0, 'not for XeLaTeX code');
    const none = TD.docToLatex(docOf('times', [{ type: 'text', text: 'English only.' }]), { engine: 'pdflatex' });
    T.ok(!none.includes('lthenc') && !none.includes('\\tdth'), 'no Thai: nothing for it');
  });

  T.test('document fonts: a diagram of the document, as a standalone document, is set in its font', () => {
    const id = TD.app.newDoc('font diagram', [label('a', 0)], null, null);
    const was = TD.state.doc.page;
    TD.state.doc.page = { ...(was || TD.PAGE_DEFAULT), family: 'times' };
    try {
      const pdf = TD.toTikz(TD.state.doc.shapes, { standalone: true }), xe = TD.toTikz(TD.state.doc.shapes, { standalone: true, engine: 'xelatex' });
      has(pdf, '\\usepackage{newtxtext,newtxmath}', 'pdfLaTeX');
      T.ok(/\\setmainfont\{texgyretermes\}/.test(xe), 'XeLaTeX:\n' + xe);
      const snippet = TD.toTikz(TD.state.doc.shapes);
      T.ok(!snippet.includes('newtx') && !snippet.includes('fontspec'), 'a snippet goes into your own document: no document font:\n' + snippet);
      T.tex('doc-font-standalone-xelatex', xe, null, 'xelatex');
    } finally { TD.state.doc.page = was; TD.app.cmd.docAction?.('del', id); }
  });

  T.test('document fonts: a circuit keeps its font when its own code sets a font for its nodes', () => {
    const cz = (raw) => ({ ...TD.TYPES.cz.create({ x: 0, y: 0 }, TD.state.defaults), id: 'c', font: 'times', raw,
      items: TD.cz.defaultItems().map((it, k) => (k === 0 ? { ...it, l: 'Volt' } : it)) });
    const own = '\\tikzstyle{every node}=[font=\\fontsize{14.0pt}{18.2pt}\\selectfont]';
    const pdf = TD.toTikz([cz(own)], { standalone: true }), xe = TD.toTikz([cz(own)], { standalone: true, engine: 'xelatex' });
    T.ok(pdf.includes('execute at begin scope={\\fontfamily{ptm}\\selectfont}'), 'pdfLaTeX: the family also as the scope\'s own font:\n' + pdf);
    T.ok(xe.includes('execute at begin scope={\\tdtermes}'), 'XeLaTeX:\n' + xe);
    T.ok(!TD.toTikz([cz('')]).includes('execute at begin scope'), 'nothing more when its code sets no font');
    T.tex('circuit-own-node-font-pdflatex', pdf);
    T.tex('circuit-own-node-font-xelatex', xe, null, 'xelatex');
  });

  T.test('label pictures carry the served Thai fonts they are set in (Safari draws a picture with its own fonts only)', async () => {
    const picture = (font) => {
      const svg = TD.textSvg('Volt ไทย $V$', { size: 'normalsize', font }, '#000000', 0, 0, { export: true });
      const m = /href="data:image\/svg\+xml;base64,([^"]+)"/.exec(svg);
      return m ? decodeURIComponent(escape(atob(m[1]))) : '';
    };
    let pic = picture('laksaman');
    for (let i = 0; i < 60 && !pic.includes('@font-face'); i++) { await new Promise((r) => setTimeout(r, 50)); pic = picture('laksaman'); }
    T.ok(/@font-face \{ font-family: 'Laksaman'; font-style: normal; font-weight: 400; src: url\((&quot;|")data:font\/woff2;base64,/.test(pic), 'the face, embedded:\n' + pic.slice(0, 300));
    T.eq((pic.match(/@font-face/g) || []).length, 1, 'only the face it uses');
    T.ok(!picture('times').includes("'Laksaman'") && !picture('default').includes('Garuda'), 'none for other fonts');
  });

  T.test('the circuit editor draws its labels in the block\'s font and size, as the canvas does', async () => {
    const text = { id: 't1', part: 'text', p: [0, -1], text: 'Caption', opts: '' };
    const family = () => getComputedStyle(document.querySelector('.cz-stage foreignObject .tx')).fontFamily;
    // Done closes the editor (TD.czEditor.close only takes it out of Quick's dock, and would leave it open)
    const done = () => document.querySelector('#czModal [data-cz="done"]')?.click();
    try {
      TD.czEditor.open({ items: [text], raw: '', size: 'large', font: 'cmss' }, () => {});
      await new Promise((r) => setTimeout(r, 100));
      T.ok(/KaTeX_SansSerif/.test(family()), 'Computer Modern Sans: ' + family());
      const big = document.querySelector('.cz-stage foreignObject .tx').style.fontSize;
      done(); await new Promise((r) => setTimeout(r, 50));
      TD.czEditor.open({ items: [text], raw: '' }, () => {});
      await new Promise((r) => setTimeout(r, 100));
      T.ok(/KaTeX_Main/.test(family()), 'a block with no font: the default: ' + family());
      T.ok(parseFloat(big) > parseFloat(document.querySelector('.cz-stage foreignObject .tx').style.fontSize), 'large is larger');
    } finally { done(); }
  });

  T.test('dialog: choose picks how in a dropdown at the left; the action and Cancel stay at the right', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 30));
    let p = TD.choose('Print', '', ['As shown', 'pdfLaTeX', 'XeLaTeX'], { ok: 'Print', choiceLabel: 'Render with' });
    await tick();
    const row = document.querySelector('.td-dialog .tdd-btns'), sel = row.querySelector('select.tdd-pick');
    T.eq([...sel.options].map((o) => o.textContent.trim()), ['As shown', 'pdfLaTeX', 'XeLaTeX']);
    T.eq(sel.value, '0', 'starts on the first');
    T.eq(sel.getAttribute('aria-label'), 'Render with');
    const ok = row.querySelector('[data-r="1"]'), cancel = row.querySelector('[data-r="0"]');
    T.eq(ok.textContent.trim(), 'Print'); T.ok(ok.classList.contains('primary'), 'Print is the main action');
    const box = (el) => (el.closest('.sel-prev') || el).getBoundingClientRect();
    T.ok(box(sel).right <= cancel.getBoundingClientRect().left && cancel.getBoundingClientRect().right <= ok.getBoundingClientRect().left, 'dropdown, Cancel, Print from left to right');
    T.ok(Math.abs(ok.getBoundingClientRect().top - box(sel).top) < 8, 'on one line');
    // both corner controls nest in the dialog's corners: the same inset from the side and the bottom
    const B = document.querySelector('.td-dialog .tdd-box').getBoundingClientRect(), S = box(sel), O = ok.getBoundingClientRect();
    T.eq(Math.round(S.left - B.left), Math.round(B.bottom - S.bottom), 'the dropdown: as far from the left as from the bottom');
    T.eq(Math.round(S.left - B.left), Math.round(B.right - O.right), 'and as far in as Print is');
    sel.value = '2'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    ok.click();
    T.eq(await p, 2);
    p = TD.choose('Print', '', ['A', 'B'], { ok: 'Print' });
    await tick();
    document.querySelector('.td-dialog [data-r="0"]').click();
    T.eq(await p, null, 'Cancel');
    await new Promise((r) => setTimeout(r, 300));
  });

  T.test('dialog: a choice\'s warning shows while it is chosen, in red pen; the choice stays when the dialog is clicked', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 30));
    const p = TD.choose('Print', 'How?', ['As shown', 'pdfLaTeX', 'XeLaTeX'], { ok: 'Print', choiceNotes: [null, 'Thai: XeLaTeX sets it best', null] });
    await tick();
    const warn = () => document.querySelector('.td-dialog .tdd-warn'), sel = document.querySelector('.td-dialog select.tdd-pick');
    T.ok(!warn(), 'none while As shown is chosen');
    const tall = () => document.querySelector('.td-dialog .tdd-box').offsetHeight, h = tall(); // (not scaled by its opening)
    sel.focus(); sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true })); await tick();
    T.ok(warn(), 'shown for pdfLaTeX'); T.eq(warn().textContent.trim(), 'Thai: XeLaTeX sets it best');
    T.ok(tall() > h, 'the dialog grows to hold it');
    // a click elsewhere in the dialog blurs the dropdown: the choice stays
    sel.blur(); document.querySelector('#tddMsg').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await tick();
    T.eq(sel.value, '1', 'still pdfLaTeX after the dropdown lost focus'); T.ok(warn(), 'and its warning');
    const pen = Object.assign(document.createElement('i'), { style: 'color: var(--redpen)' }); warn().after(pen);
    T.eq(getComputedStyle(warn()).color, getComputedStyle(pen).color, 'red pen'); pen.remove();
    sel.value = '2'; sel.dispatchEvent(new Event('change', { bubbles: true })); await tick();
    T.ok(!warn(), 'gone for XeLaTeX'); T.eq(tall(), h, 'and the dialog is as tall as its text');
    document.querySelector('.td-dialog [data-r="1"]').click(); T.eq(await p, 2, 'Print with the choice made');
    await new Promise((r) => setTimeout(r, 300));
  });

  T.test('Thai file: found in a page\'s sheet, a board\'s shapes and a document\'s blocks (the LaTeX window starts on XeLaTeX)', async () => {
    const t = TD.TYPES.text.create({ x: 100, y: 100 }, TD.state.defaults), shapes = [{ ...t, id: 'a', text: 'สวัสดี' }];
    const kinds = { board: () => TD.app.newDoc('th-board', shapes, null, null, null, 'board'), page: () => TD.app.newDoc('th-page', null, null, null, null, 'page', { shapes }),
      classic: () => TD.app.newDoc('th-classic', null, null, [{ type: 'diagram', shapes }], null, 'classic') };
    for (const [kind, make] of Object.entries(kinds)) {
      make(); await new Promise((r) => setTimeout(r, 300));
      document.querySelector('#btnTikz').click(); await new Promise((r) => setTimeout(r, 300));
      const eng = document.querySelector('#tikzEngine');
      if (eng && !eng.closest('[hidden]')) T.eq(eng.value, 'xelatex', kind);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 300));
    }
  });

  T.test('tex engine: pdfLaTeX compiles Thai in each TLWG font and in a Latin one', async () => {
    const s = await TD.texEngine.support('pdflatex');
    if (!s.ok) return; // no bundle on this site (made locally by scripts/tex-bundle.mjs)
    for (const f of ['times', 'kinnari', 'garuda', 'laksaman']) {
      const tex = TD.docToLatex(docOf(f, [{ type: 'text', text: 'Hello \\textbf{ตัวหนา} \\emph{เอียง} ภาษาไทยไม่เว้นวรรค $x^2$' }, { type: 'diagram', shapes: [label('a', 0, { font: 'laksaman', text: 'ลักษมัณ $V$' }), label('b', 80, { font: 'garuda', text: 'ครุฑ' })] }]), { engine: 'pdflatex' });
      const r = await TD.texEngine.compile(tex, {}, { engine: 'pdflatex' });
      T.ok(r.ok, f + ': ' + r.errors.map((e) => e.line + ': ' + e.message).join('\n') + ' missing: ' + r.missing.join(', '));
      T.ok(!/Font shape `LTH\/\w+\/\w+\/\w+' undefined/.test(r.log), f + ': every Thai face is there');
    }
  });

  T.test('tex engine: XeLaTeX compiles Times, the Thai fonts and Thai text in a Latin font', async () => {
    const s = await TD.texEngine.support('xelatex');
    if (!s.ok) return; // no XeLaTeX bundle on this site (made locally by scripts/tex-bundle.mjs)
    for (const f of ['times', 'kinnari', 'garuda', 'laksaman', 'helvetica']) {
      const tex = TD.docToLatex(docOf(f, [{ type: 'text', text: 'Hello \\textbf{bold} \\emph{it} ภาษาไทยไม่เว้นวรรค $x^2$' }, { type: 'diagram', shapes: [label('a', 0, { font: 'times' }), label('b', 80, { font: 'garuda', text: 'ครุฑ' })] }]), { engine: 'xelatex' });
      const r = await TD.texEngine.compile(tex, {}, { engine: 'xelatex' });
      T.ok(r.ok, f + ': ' + r.errors.map((e) => e.line + ': ' + e.message).join('\n') + ' missing: ' + r.missing.join(', '));
      if (r.ok) T.eq(String.fromCharCode(...r.pdf.slice(0, 5)), '%PDF-');
    }
  });
}
