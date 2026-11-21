// Chemistry editor panel: lone pairs drawn as dots (\:) or bars (\|), single electrons (\.), and a subscheme's arrow angle, and hiding a bond from its right-click menu.
{
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.querySelector('#cfModal'), q = (s) => root().querySelector(s);
  const code = () => q('.cz-code textarea').value.trim();
  const screen = (X, Y) => {
    const svg = q('.cf-svg'), r = svg.getBoundingClientRect();
    const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg.innerHTML);
    return [r.left + +m[1] + X * +m[3], r.top + +m[2] + Y * +m[3]];
  };
  const fire = (el, type, [x, y]) => el.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true, clientX: x, clientY: y, pointerId: 7 }));
  const pick = (i) => { const v = TD.chem.build(code()).verts[i], p = screen(v.X, v.Y), svg = q('.cf-svg'); fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); };
  const btn = (fs, v) => [...document.querySelectorAll('[data-fs]')].find((b) => b.dataset.fs === fs && b.dataset.v === String(v));
  const on = (fs, v) => btn(fs, v).getAttribute('aria-pressed') === 'true' || btn(fs, v).classList.contains('on');
  async function run(src, fn) {
    const cap = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function () {};
    TD.chemEditor.open({ src }, () => {});
    await tick(30);
    try { await fn(); } finally {
      Element.prototype.setPointerCapture = cap;
      if (!root().hidden) q('[data-ce="cancel"]').click();
      await tick(0);
      const d = document.querySelector('.td-dialog [data-r="1"]'); if (d) d.click();
    }
  }

  T.test('chemistry panel: bar lone pairs show as on, and turn off one by one', async () => {
    await run('\\chemfig{\\charge{90=\\|,0=\\|,270=\\|}{Br}}', async () => {
      pick(0); await tick(0);
      T.ok(on('pair', 90) && on('pair', 0) && on('pair', 270) && !on('pair', 180), 'the three bars are on, the left side off');
      T.ok(on('pstyle', '\\|') && !on('pstyle', '\\:'), 'drawn as bars');
      btn('pair', 0).click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90=\\|,270=\\|}{Br}}', 'the right bar goes, not replaced by dots');
      btn('pair', 180).click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90=\\|,270=\\|,180=\\|}{Br}}', 'a new pair comes as a bar too');
    });
  });

  T.test('chemistry panel: Pairs as turns every pair into dots or bars', async () => {
    await run('\\chemfig{\\charge{90=\\:,270=\\:,0=\\.}{O}}', async () => {
      pick(0); await tick(0);
      T.ok(on('pstyle', '\\:'), 'drawn as dots');
      T.ok(on('single', 0) && !on('pair', 0), 'the single electron is its own toggle');
      btn('pstyle', '\\|').click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90=\\|,270=\\|,0=\\.}{O}}', 'both pairs become bars, the radical stays');
      btn('single', 0).click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90=\\|,270=\\|}{O}}', 'the radical goes');
      btn('single', 180).click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90=\\|,270=\\|,180=\\.}{O}}', 'a radical on the left');
    });
  });
  T.test('chemistry panel: a subscheme angle is written as chemfig reads it, arrow angle=…', async () => {
    await run('\\schemestart\\chemfig{A}\\arrow\\subscheme{\\chemfig{B}\\arrow\\chemfig{C}}\\schemestop', async () => {
      pick(1); await tick(0);
      const f = () => document.querySelector('[data-f="subang"]');
      T.ok(f(), 'the molecule in a subscheme has the field');
      f().focus(); f().value = '90'; f().dispatchEvent(new Event('input', { bubbles: true })); f().blur(); await tick(0);
      T.ok(code().includes('\\subscheme[arrow angle=90]{'), 'written as a setting: ' + code());
      const r = TD.chem.build(code()), y = (l) => r.verts.find((v) => v.label === l);
      T.ok(Math.abs(y('B').X - y('C').X) < 0.01 && y('C').Y < y('B').Y, 'C stands above B');
      pick(1); await tick(0);
      T.eq(f().value, '90', 'the field shows the angle');
    });
  });
  T.test('chemistry panel: right-click a bond to hide it, and again to show it', async () => {
    await run('\\chemfig{A-B-C}', async () => {
      // the kit's menu (a closing one fades out for a moment, so it is left out)
      const menu = () => [...document.querySelectorAll('.qe-ctx:not(.leaving) [data-act]')];
      const rclick = () => { const b = TD.chem.build(code()).bonds[0], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2);
        q('.cf-svg').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1], button: 2 })); };
      rclick(); await tick(0);
      const hide = menu().find((x) => x.dataset.act === 'bhide');
      T.ok(hide && !menu().some((x) => x.dataset.act === 'bshow'), 'a drawn bond offers Hide Bond');
      T.ok(menu().some((x) => x.dataset.act === 'bdel'), 'and still Delete Bond');
      hide.click(); await tick(0);
      T.eq(code(), '\\chemfig{A-[,,,,draw=none]B-C}', 'hidden with draw=none');
      rclick(); await tick(0);
      const show = menu().find((x) => x.dataset.act === 'bshow');
      T.ok(show && !menu().some((x) => x.dataset.act === 'bhide'), 'a hidden bond offers Show Bond');
      show.click(); await tick(0);
      T.eq(code(), '\\chemfig{A-B-C}', 'drawn again, the option gone');
    });
  });

  T.test('chemistry panel: a hidden ring side offers Show Bond, not Delete Bond', async () => {
    await run('\\chemfig{*6(--[,,,,draw=none]----)}', async () => {
      const b = TD.chem.build(code()).bonds[1], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2);
      q('.cf-svg').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1], button: 2 }));
      await tick(0);
      const acts = [...document.querySelectorAll('.qe-ctx:not(.leaving) [data-act]')].map((x) => x.dataset.act);
      T.ok(acts.includes('bshow') && !acts.includes('bdel') && acts.includes('rdel'), 'Show Bond and Delete Ring: ' + acts);
      document.querySelector('.qe-ctx:not(.leaving) [data-act="bshow"]').click(); await tick(0);
      T.eq(code(), '\\chemfig{*6(------)}', 'the side is drawn again');
    });
  });
  T.test('chemistry panel: a bond is hidden and shown again with Line: None', async () => {
    await run('\\chemfig{A-B-C}', async () => {
      const b = TD.chem.build(code()).bonds[0], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2), svg = q('.cf-svg');
      fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); await tick(0);
      const acts = () => [...document.querySelectorAll('[data-ce]')].filter((x) => x.offsetParent && /^b(hide|show|del)$|^rdel$/.test(x.dataset.ce)).map((x) => x.dataset.ce);
      T.eq(acts(), ['bdel'], 'only Delete Bond among the buttons');
      btn('bdash', 'none').click(); await tick(0);
      T.eq(code(), '\\chemfig{A-[,,,,draw=none]B-C}', 'hidden');
      T.ok(on('bdash', 'none'), 'Line shows None');
      btn('bdash', 'solid').click(); await tick(0);
      T.eq(code(), '\\chemfig{A-B-C}', 'shown again');
    });
  });

  const type = async (f, val) => { f.focus(); f.value = val; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur(); await tick(0); };
  const clickAt = async (p) => { const svg = q('.cf-svg'); fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); await tick(0); };

  const dblAt = async (p) => { const svg = q('.cf-svg'); for (let i = 0; i < 2; i++) { fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); } await tick(0); };
  const pop = () => [...document.querySelectorAll('.text-pop')].filter((x) => x.isConnected && x.matches(':popover-open')).pop() || null;
  const typePop = async (val) => { const ta = pop(); ta.value = val; ta.dispatchEvent(new Event('input', { bubbles: true })); await tick(0); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick(30); };
  const centre = (sel) => { const r = q(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const phantomCentre = () => centre('.cf-phantom:not(.cf-tail)');

  T.test('chemistry names: a phantom box under an unnamed compound; one click on it types a name', async () => {
    await run('\\schemestart\\chemname{\\chemfig{A-B}}{Foo}\\arrow\\chemfig{C}\\schemestop', async () => {
      T.eq(root().querySelectorAll('.cf-phantom').length, 1, 'one phantom: C has no name, A-B has one');
      const nm = TD.chem.build(code()).texts.find((x) => x.name);
      await clickAt(screen(nm.cx, nm.cy));
      T.ok(!pop(), 'a single click on a name opens nothing');
      await clickAt(phantomCentre());
      T.ok(pop(), 'a single click on the phantom opens the text box');
      await typePop('Bar');
      T.eq(code(), '\\schemestart\\chemname{\\chemfig{A-B}}{Foo}\\arrow\\chemname{\\chemfig{C}}{Bar}\\schemestop', 'named');
      T.eq(root().querySelectorAll('.cf-phantom').length, 0, 'no phantom left');
    });
  });

  T.test('chemistry names: a compound raised by its arrow has its phantom under it, where its name goes', async () => {
    // \chemname measures from each compound's own baseline: C sits above A-B's bottom, so its name does too
    await run('\\schemestart\\chemfig{A-[6]B}\\arrow[30]\\chemfig{C}\\schemestop', async () => {
      const ph = [...root().querySelectorAll('.cf-phantom:not(.cf-tail)')].map((x) => x.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      T.eq(ph.length, 2, 'a phantom under each compound');
      T.ok(ph[1].top < ph[0].top - 20, `the raised compound's phantom is higher: ${ph[1].top} vs ${ph[0].top}`);
      // below C by what its name will be below it (naming C moves C: the arrow meets its taller box)
      const k = screen(0, 1)[1] - screen(0, 0)[1];
      const below = (L, y) => (y - screen(0, L.mols[1].dy)[1]) / k; // drawing units under C's baseline
      const at = [ph[1].left + ph[1].width / 2, ph[1].top + ph[1].height / 2], was = below(TD.chem.build(code()), at[1]);
      await clickAt(at);
      await typePop('Bar');
      const L = TD.chem.build(code()), nm = L.texts.find((x) => x.name), now = nm.cy - L.mols[1].dy;
      T.ok(Math.abs(now - was) < ph[1].height / 2 / k, `the name as far under C as its phantom was: ${now} vs ${was}`);
    });
  });

  T.test('chemistry scheme: an arrow with nothing after it ends in a box; click it to type the next compound', async () => {
    await run('\\schemestart\\chemfig{A}\\arrow\\schemestop', async () => {
      T.eq(root().querySelectorAll('.cf-tail').length, 1, 'one box, after the arrow');
      const a = TD.chem.build(code()).arrows[0], r = q('.cf-tail').getBoundingClientRect(), [hx] = screen(a.x2, a.y2);
      T.ok(r.left > hx, 'past the arrow head');
      await clickAt(centre('.cf-tail'));
      T.ok(pop(), 'one click opens the text box');
      await typePop('B-C');
      T.ok(/\\arrow\s*\\chemfig\{B-C\}\s*\\schemestop$/.test(code()), 'set after the arrow: ' + code());
      T.eq(root().querySelectorAll('.cf-tail').length, 0, 'the box goes');
      q('[data-ce="undo"]').click();
      await tick(0);
      T.eq(code(), '\\schemestart\\chemfig{A}\\arrow\\schemestop', 'one undo takes it back');
      await clickAt(centre('.cf-tail'));
      await typePop('');
      T.eq(code(), '\\schemestart\\chemfig{A}\\arrow\\schemestop', 'nothing typed: nothing added');
    });
  });

  T.test('chemistry scheme: an atom, ring or group goes into the box after an arrow', async () => {
    await run('\\schemestart\\chemfig{A}\\arrow\\chemfig{B}\\arrow\\schemestop', async () => {
      T.eq(root().querySelectorAll('.cf-tail').length, 1, 'only the last arrow has one');
      const item = (k) => q(`.qe-item[data-item="${k}"]`);
      fire(item('r:6'), 'pointerdown', [0, 0]); fire(item('r:6'), 'pointerup', [0, 0]); await tick(0);
      T.ok(q('.cf-tail'), 'shown while a ring is being placed');
      await clickAt(centre('.cf-tail'));
      T.ok(/\\arrow\s*\\chemfig\{\*6\([^}]*\)\}\s*\\schemestop$/.test(code()), 'a ring set after the arrow: ' + code());
      T.ok(!q('.cf-tail'), 'the box goes');
    });
    await run('\\schemestart\\chemfig{A}\\arrow\\schemestop', async () => {
      const b = q('.qe-item[data-item="a:O"]'), r = b.getBoundingClientRect(), from = [r.left + 5, r.top + 5], to = centre('.cf-tail');
      fire(b, 'pointerdown', from); fire(b, 'pointermove', [from[0] + 20, from[1]]); fire(b, 'pointermove', to);
      await tick(0);
      T.ok(q('.cf-tail.on'), 'the box lights up under the dragged atom');
      fire(b, 'pointerup', to); await tick(0);
      T.ok(/\\arrow\s*\\chemfig\{O\}\s*\\schemestop$/.test(code()), 'dropped in: ' + code());
    });
  });

  T.test('chemistry names: double-click a name to change it in place; two lines become \\\\', async () => {
    await run('\\schemestart\\chemname*{\\chemfig{A-B}}{Foo}\\arrow\\chemfig{C}\\schemestop', async () => {
      const nm = TD.chem.build(code()).texts.find((x) => x.name);
      await dblAt(screen(nm.cx, nm.cy));
      T.eq(pop() && pop().value, 'Foo', 'the box holds the name');
      await typePop('Foo\nbar');
      T.eq(code(), '\\schemestart\\chemname*{\\chemfig{A-B}}{Foo\\\\bar}\\arrow\\chemfig{C}\\schemestop', 'two lines');
      const nm2 = TD.chem.build(code()).texts.find((x) => x.name);
      await dblAt(screen(nm2.cx, nm2.cy));
      await typePop('');
      T.eq(code(), '\\schemestart\\chemfig{A-B}\\arrow\\chemfig{C}\\schemestop', 'emptied: the \\chemname goes');
    });
  });

  T.test('chemistry panel: a molecule outside a scheme can be given a name', async () => {
    await run('\\chemfig{A-B}', async () => {
      pick(0); await tick(0);
      const f = document.querySelector('[data-f="mname"]');
      T.ok(f, 'the Name field is there without \\schemestart');
      T.ok(!document.querySelector('[data-ce="group"], [data-ce="mdel"]'), 'no scheme-only actions');
      await type(f, 'Water');
      T.eq(code(), '\\chemname{\\chemfig{A-B}}{Water}', 'wrapped in \\chemname');
    });
  });

  T.test('chemistry panel: a bond line width is a number field kept with the other options', async () => {
    await run('\\chemfig{A-[:0,,,,red,line width=0.9pt]B-C}', async () => {
      const b = TD.chem.build(code()).bonds[0];
      await clickAt(screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2));
      const f = () => document.querySelector('[data-f="bwidth"]');
      T.eq(f().value, '0.9', 'read from the options');
      await type(f(), '1.5');
      T.eq(code(), '\\chemfig{A-[:0,,,,red,line width=1.5pt]B-C}', 'replaced, red kept');
      await type(f(), '');
      T.eq(code(), '\\chemfig{A-[:0,,,,red]B-C}', 'cleared back to the default');
      const g = TD.chem.build(code()).bonds[1];
      await clickAt(screen((g.X0 + g.X1) / 2, (g.Y0 + g.Y1) / 2));
      await type(f(), '0.8');
      T.ok(/B-\[[^\]]*line width=0\.8pt\]C/.test(code()), 'a plain bond gets one: ' + code());
    });
  });

  const bondAtMid = async (i) => { const b = TD.chem.build(code()).bonds[i]; await clickAt(screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2)); };
  const fld = (k) => document.querySelector(`[data-f="${k}"]`);
  const setHidden = async (k, val) => { const f = fld(k); f.dispatchEvent(new Event('focusin', { bubbles: true })); f.value = val; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('focusout', { bubbles: true })); await tick(0); };

  T.test('chemistry panel: with nothing picked, the drawing settings write \\setchemfig', async () => {
    await run('\\chemfig{A-B}', async () => {
      T.ok(fld('cf:atom sep'), 'Bond length is shown when nothing is picked');
      T.ok(!fld('cf:compound sep'), 'no scheme settings outside a scheme');
      const w0 = TD.chem.build(code()).bb.w;
      await type(fld('cf:atom sep'), '2em');
      T.eq(code(), '\\setchemfig{atom sep=2em}\\chemfig{A-B}', 'a new \\setchemfig in front');
      T.ok(TD.chem.build(code()).bb.w < w0, 'the bond is shorter');
      await type(fld('cf:atom sep'), '2');
      T.eq(code(), '\\setchemfig{atom sep=2em}\\chemfig{A-B}', 'a length without a unit is not written');
      btn('cf:fixed length', 'true').click(); await tick(0);
      T.eq(code(), '\\setchemfig{atom sep=2em,fixed length}\\chemfig{A-B}', 'Fixed length on');
      btn('cf:fixed length', '').click(); await tick(0);
      await type(fld('cf:atom sep'), '');
      T.eq(code(), '\\chemfig{A-B}', 'cleared settings take the \\setchemfig away');
    });
  });

  T.test('chemistry panel: scheme settings edit the \\setchemfig already there', async () => {
    await run('\\setchemfig{compound sep=3.7em,name sep=1.4ex}\\schemestart\\chemname{\\chemfig{A}}{x}\\arrow\\chemfig{B}\\schemestop', async () => {
      T.eq(fld('cf:compound sep').value, '3.7em', 'read from the code');
      T.eq(fld('cf:name sep').value, '1.4ex', 'Name gap is there when a compound has a name');
      await type(fld('cf:arrow offset'), '0.5em');
      T.eq(code(), '\\setchemfig{compound sep=3.7em,name sep=1.4ex,arrow offset=0.5em}\\schemestart\\chemname{\\chemfig{A}}{x}\\arrow\\chemfig{B}\\schemestop', 'added beside the others');
    });
  });

  T.test('chemistry panel: All bonds sets bond style, which the drawing follows', async () => {
    await run('\\chemfig{A-B=C}', async () => {
      await type(fld('cfb:width'), '0.8');
      T.eq(code(), '\\setchemfig{bond style={line width=0.8pt}}\\chemfig{A-B=C}', 'braced, as it has an =');
      btn('cfb:dash', 'dashed').click(); await tick(0);
      await setHidden('cfb:colour', 'blue');
      T.eq(code(), '\\setchemfig{bond style={line width=0.8pt,dashed,blue}}\\chemfig{A-B=C}', 'dashed and blue added');
      const r = TD.chem.build(code()), pt = TD.chem.PT;
      T.eq(r.warnings, [], 'bond style is drawn, no warning');
      T.ok(r.paths.filter((p) => Math.abs(p.sw - 0.8 * pt) < 1e-6).length >= 3, 'all three bond lines are 0.8pt: ' + r.paths.map((p) => p.sw));
      T.ok(r.paths.every((p) => p.dash === 'dash'), 'and dashed');
    });
  });

  T.test('chemistry panel: a bond colour and line kind go into its options', async () => {
    await run('\\chemfig{A-B}', async () => {
      await bondAtMid(0);
      await setHidden('bcol', 'blue');
      T.eq(code(), '\\chemfig{A-[,,,,blue]B}', 'blue');
      btn('bdash', 'dotted').click(); await tick(0);
      T.eq(code(), '\\chemfig{A-[,,,,blue,dotted]B}', 'dotted beside it');
      btn('bdash', 'solid').click(); await tick(0);
      await setHidden('bcol', '');
      T.eq(code(), '\\chemfig{A-B}', 'both taken away again');
    });
  });

  T.test('chemistry panel: Leaves from picks the atom of a group a bond starts at', async () => {
    await run('\\chemfig{CH_2OH-[:0]B}', async () => {
      await bondAtMid(0);
      const f = fld('bdep');
      T.ok(f, 'shown for a group of several atoms');
      T.ok(!fld('barr'), 'not for the one-atom end');
      T.eq(f.options.length, 5, 'Automatic and the four atoms');
      const x0 = TD.chem.build(code()).bonds[0].X0;
      f.value = '1'; f.dispatchEvent(new Event('input', { bubbles: true })); await tick(0);
      T.eq(code(), '\\chemfig{CH_2OH-[:0,,1]B}', 'written as the 3rd argument');
      T.ok(TD.chem.build(code()).bonds[0].X0 < x0, 'the bond now leaves from the C');
    });
  });

  T.test('chemistry panel: a wedge has no Line switch', async () => {
    await run('\\chemfig{A>B-C}', async () => {
      await bondAtMid(0);
      T.ok(!btn('bdash', 'dashed'), 'no Line for a wedge');
      await bondAtMid(1);
      T.ok(btn('bdash', 'dashed'), 'a plain bond has it');
    });
  });

  T.test('chemistry: chemfig 1.x setters are drawn, flagged, and opened in today\'s form', async () => {
    const r = TD.chem.build('\\setatomsep{4em}\\setcrambond{3pt}{}{}\\chemfig{A-B}'), m = TD.chem.build('\\setchemfig{atom sep=4em,cram width=3pt}\\chemfig{A-B}');
    T.ok(r.warnings.some((w) => /setatomsep/.test(w)), 'flagged: ' + r.warnings.join(' | '));
    T.ok(!r.texts.some((x) => /set/.test(x.t)), 'not printed');
    T.ok(Math.abs(r.bb.w - m.bb.w) < 0.01, 'the bond is as long as with atom sep=4em');
    await run('\\setatomsep{4em}\\setcrambond{3pt}{}{}\\chemfig{A-B}', async () => {
      T.eq(code(), '\\setchemfig{atom sep=4em,cram width=3pt}\\chemfig{A-B}', 'opened as one \\setchemfig');
      T.ok(/setatomsep/.test(q('.cz-tip').textContent), 'a note says what changed: ' + q('.cz-tip').textContent);
      T.ok(!q('[data-ce="undo"]').disabled, 'Undo is on');
      q('[data-ce="undo"]').click(); await tick(0);
      T.eq(code(), '\\setatomsep{4em}\\setcrambond{3pt}{}{}\\chemfig{A-B}', 'Undo brings the 1.x code back');
      q('[data-ce="cfup"]').click(); await tick(0);
      T.eq(code(), '\\setchemfig{atom sep=4em,cram width=3pt}\\chemfig{A-B}', 'and the button converts it again');
    });
  });

  T.test('chemistry: the 1.x glucose with \\scriptstyle\\mbox{…} numbers is drawn', () => {
    const src = '\\setatomsep{4em}\\setcrambond{3pt}{}{}\\chemfig{HO-[2,.7,2](-[3,0.15,,,draw=none]\\scriptstyle\\mbox{\\small\\textcolor{orange}{4}})(-[1,.7](-[2,0.5]-[3,0.5]HO)-[0]{O}-[7,0.7])<[7,0.7](-[2,0.5,,2]HO)-[,,,,line width=3pt](-[6,0.5]OH)>[1,0.7](-[1,0.15,,,draw=none]\\scriptstyle\\mbox{\\small\\textcolor{orange}{1}})-[2,.5]OH}';
    const r = TD.chem.build(src), nums = r.texts.filter((x) => /mbox/.test(x.t));
    T.eq(nums.length, 2, 'the two numbers');
    for (const x of nums) T.ok(TD.textBox(x.t, TD.chem.TEXT).w < 20, 'typeset, not shown as code: ' + TD.textBox(x.t, TD.chem.TEXT).w);
    T.eq(r.warnings.filter((w) => !/1\.x/.test(w)), [], 'nothing else is flagged');
  });

  T.test('chemistry: a ring circle **[start,end,style] is drawn and set from the panel', async () => {
    const r = TD.chem.build('\\chemfig{**[0,360,blue,dashed]6(------)}');
    const c = r.paths.find((x) => x.circle);
    T.ok(c && c.color === '#0000ff' && c.dash === 'dash', 'blue and dashed: ' + JSON.stringify(c && { color: c.color, dash: c.dash }));
    const segs = TD.chem.parseDoc('\\chemfig{**[0,180]6(------)}', () => {}); TD.chem.markDirty(segs);
    T.eq(TD.chem.writeDoc(segs), '\\chemfig{**[0,180]6(------)}', 'the arc is written once');
    await run('\\chemfig{**6(------)}', async () => {
      await bondAtMid(0);
      T.ok(on('rcircle', 'true'), 'Circle is on');
      await setHidden('rcol', 'blue');
      T.eq(code(), '\\chemfig{**[,,blue]6(------)}', 'coloured');
      btn('rdash', 'dashed').click(); await tick(0);
      await type(fld('rarc1'), '180');
      T.eq(code(), '\\chemfig{**[,180,blue,dashed]6(------)}', 'dashed, half');
      btn('rcircle', '').click(); await tick(0);
      T.eq(code(), '\\chemfig{*6(------)}', 'off: a plain ring');
    });
  });

  T.test('chemistry: arrows take a colour, a line and a head; the head is drawn', async () => {
    const r = TD.chem.build('\\setchemfig{arrow head=-stealth,arrow style={red}}\\schemestart A\\arrow{->}[,,dashed]B\\schemestop');
    T.eq(r.warnings, [], 'no warnings');
    T.eq(r.arrows[0].head, 'stealth', 'stealth head');
    T.ok(r.arrows[0].color === '#ff0000' && r.arrows[0].dash === 'dash', 'red from arrow style, dashed from its own');
    await run('\\schemestart A\\arrow B\\schemestop', async () => {
      const a = TD.chem.build(code()).arrows[0];
      await clickAt(screen((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2));
      await setHidden('acol', 'blue');
      btn('adash', 'dotted').click(); await tick(0);
      T.eq(code(), '\\schemestart A\\arrow[,,blue,dotted] B\\schemestop', 'its own style');
    });
    await run('\\schemestart A\\arrow B\\schemestop', async () => {
      const f = fld('cf:arrow head');
      f.value = '-latex'; f.dispatchEvent(new Event('input', { bubbles: true })); await tick(0);
      T.eq(code(), '\\setchemfig{arrow head=-latex}\\schemestart A\\arrow B\\schemestop', 'arrow head for all');
    });
  });

  T.test('chemistry: hashed wedge settings and square wedges', async () => {
    const a = TD.chem.build('\\chemfig{A>:B}'), b = TD.chem.build('\\setchemfig{cram dash width=0.5pt,cram dash sep=1pt,cram rectangle}\\chemfig{A>:B}');
    T.eq(b.warnings, [], 'no warnings');
    const n = (r) => (r.paths.find((x) => x.fill).d.match(/M/g) || []).length;
    T.ok(n(b) > n(a), `more, finer hashes (${n(a)} → ${n(b)})`);
    await run('\\chemfig{A>:B}', async () => {
      await type(fld('cf:cram dash width'), '0.5pt');
      btn('cf:cram rectangle', 'true').click(); await tick(0);
      T.eq(code(), '\\setchemfig{cram dash width=0.5pt,cram rectangle}\\chemfig{A>:B}', 'written');
    });
  });

  T.test('chemistry: an atom colour wraps each atom, kept apart with |', async () => {
    await run('\\chemfig{OH-C}', async () => {
      pick(0); await tick(0);
      await setHidden('vcol', 'red');
      T.eq(code(), '\\chemfig{\\textcolor{red}{O}|\\textcolor{red}{H}-C}', 'each atom, split as chemfig splits OH');
      T.eq(TD.chem.build(code()).verts[0].boxes.length, 2, 'still two atoms here');
      await setHidden('vcol', 'rgb,255:red,0;green,128;blue,255');
      T.eq(code(), '\\chemfig{{\\textcolor[RGB]{0,128,255}{O}}|{\\textcolor[RGB]{0,128,255}{H}}-C}', 'a mixed colour, braced');
      await setHidden('vcol', '');
      T.eq(code(), '\\chemfig{OH-C}', 'back to plain');
    });
  });

  T.test('chemistry bonds: a bond\'s own line overrides the drawing\'s bond style, as in chemfig', async () => {
    await run('\\setchemfig{bond style={dashed,line width=0.8pt}}\\chemfig{A-B-C}', async () => {
      await bondAtMid(0);
      T.ok(on('bdash', 'dashed'), 'shown as drawn: dashed from the bond style');
      T.eq(fld('bwidth').placeholder, '0.8', 'the width it draws with, as a hint');
      btn('bdash', 'solid').click(); await tick(0);
      T.eq(code(), '\\setchemfig{bond style={dashed,line width=0.8pt}}\\chemfig{A-[,,,,solid]B-C}', 'solid written, to undo the dashes');
      const r = TD.chem.build(code()), d = (i) => r.paths.find((x) => x.d.startsWith(`M${TD.util.r2(r.bonds[i].p0[0])}`) || true) && r.bonds.length;
      T.ok(d(0), 'built');
      btn('bdash', 'dashed').click(); await tick(0);
      T.eq(code(), '\\setchemfig{bond style={dashed,line width=0.8pt}}\\chemfig{A-B-C}', 'dashed again: nothing of its own');
      btn('bdash', 'dotted').click(); await tick(0);
      T.eq(code(), '\\setchemfig{bond style={dashed,line width=0.8pt}}\\chemfig{A-[,,,,dotted]B-C}', 'dotted, its own');
    });
    const r = TD.chem.build('\\setchemfig{bond style={dashed}}\\chemfig{A-[,,,,solid]B-C}');
    const dashes = r.paths.filter((x) => !x.fill).map((x) => x.dash || 'none');
    T.eq(dashes, ['solid', 'dash'], 'drawn: the first solid, the second dashed');
  });

  T.test('chemistry bonds: lines have Line, Width and Colour; wedges have their sizes per molecule', async () => {
    await run('\\chemfig{A=B>C>:D>|E}', async () => {
      await bondAtMid(0);
      T.ok(btn('bdash', 'none') && fld('bwidth') && fld('bcol'), 'a double bond: Line (with None), Width, Colour');
      T.ok(!fld('mw:cram width'), 'no wedge sizes');
      await bondAtMid(1);
      T.ok(!btn('bdash', 'solid') && !fld('bwidth') && fld('bcol'), 'a wedge: Colour, no Line or Width');
      T.ok(fld('mw:cram width') && !fld('mw:cram dash width'), 'its wedge width, no hashes');
      await type(fld('mw:cram width'), '3pt');
      T.eq(code(), '\\chemfig[cram width=3pt]{A=B>C>:D>|E}', 'written for the molecule');
      await bondAtMid(2);
      T.ok(fld('mw:cram dash width') && fld('mw:cram dash sep'), 'a hashed wedge: hash width and gap too');
      T.eq(fld('mw:cram width').value, '3pt', 'the molecule\'s value shown');
      await bondAtMid(3);
      T.ok(fld('bwidth') && !btn('bdash', 'solid'), 'a hollow wedge: its outline width');
      await bondAtMid(1);
      await type(fld('mw:cram width'), '');
      T.eq(code(), '\\chemfig{A=B>C>:D>|E}', 'cleared: back to the drawing\'s');
    });
    const w = (src) => { const p = TD.chem.build(src).paths.find((x) => x.fill); return p.d; };
    T.ok(w('\\chemfig[cram width=3pt]{A>B}') !== w('\\chemfig{A>B}'), 'the molecule\'s cram width is drawn');
  });

  T.test('chemistry charges: a partial charge clears the atom, and takes a position and a distance', async () => {
    await run('\\chemfig{C-O}', async () => {
      pick(0); await tick(0);
      btn('pq', '+').click(); await tick(0);
      const m = /\\charge\{(\d+):([\d.]+)pt=\$\\delta\+\$\}\{C\}/.exec(code());
      T.ok(m && +m[2] > 0, 'δ+ written with a distance: ' + code());
      const r = TD.chem.build(code()), ch = r.texts.find((x) => /delta/.test(x.t)), at = r.verts[0].boxes[0];
      const V = r.verts[0], ang = +m[1] * Math.PI / 180, gap = Math.abs(Math.cos(ang)) > 0.5 ? Math.abs(ch.cx - V.X) - (ch.b.w - 2) / 2 - at.w / 2 : Math.abs(ch.cy - V.Y) - 0.36 * TD.chem.EM - (at.asc + at.desc) / 2;
      T.ok(gap > 0, 'clear of the atom: ' + gap);
      const sel = fld('pang'); sel.value = '270'; sel.dispatchEvent(new Event('input', { bubbles: true })); await tick(0);
      T.ok(/\\charge\{270:[\d.]+pt=\$\\delta\+\$\}\{C\}/.test(code()), 'below: ' + code());
      await type(fld('poff'), '1');
      T.ok(/\\charge\{270:1pt=\$\\delta\+\$\}\{C\}/.test(code()), 'distance 1pt: ' + code());
      btn('pq', '-').click(); await tick(0);
      T.ok(/\\charge\{270:1pt=\$\\delta-\$\}\{C\}/.test(code()), 'δ− keeps the place: ' + code());
      btn('pq', '').click(); await tick(0);
      T.eq(code(), '\\chemfig{C-O}', 'none: gone');
    });
  });

  T.test('chemistry charges: a distance keeps its unit when the atom changes', async () => {
    await run('\\chemfig{\\charge{90:2pt=$\\delta+$}{O}-C}', async () => {
      pick(0); await tick(0);
      btn('single', 180).click(); await tick(0);
      T.eq(code(), '\\chemfig{\\charge{90:2pt=$\\delta+$,180=\\.}{O}-C}', 'the 2pt kept');
    });
  });
}
