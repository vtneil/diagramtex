// Chemistry editor: Delete takes away as little as it can (a label, a bond, a chain's end), and palette items
// dragged onto the drawing land on the atom or bond under the pointer.
{
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.querySelector('#cfModal'), q = (s) => root().querySelector(s);
  const code = () => q('.cz-code textarea').value.trim();
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  // where the layout's point (X, Y) is on screen
  const screen = (X, Y) => {
    const svg = q('.cf-svg'), r = svg.getBoundingClientRect();
    const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg.innerHTML);
    return [r.left + +m[1] + X * +m[3], r.top + +m[2] + Y * +m[3]];
  };
  const fire = (el, type, [x, y], o = {}) => el.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true, clientX: x, clientY: y, pointerId: 7, ...o }));
  const click = (p) => { const svg = q('.cf-svg'); fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); };
  const vert = (i) => { const v = TD.chem.build(code()).verts[i]; return screen(v.X, v.Y); };
  const bond = (i) => { const b = TD.chem.build(code()).bonds[i]; return screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2); };
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

  T.test('chemistry delete: an atom loses only its label, the molecule stays', async () => {
    await run('\\chemfig{A-B-C}', () => {
      click(vert(1)); key('Delete');
      T.eq(code(), '\\chemfig{A--C}', 'the middle label goes');
      click(vert(0)); key('Delete');
      T.eq(code(), '\\chemfig{--C}', 'the first label goes, its bonds stay');
    });
  });

  T.test('chemistry delete: a bare chain end goes with its bond, a bare start too', async () => {
    await run('\\chemfig{-[:30]-[:-30]-[:30]}', () => {
      click(vert(3)); key('Delete');
      T.eq(code(), '\\chemfig{-[:30]-[:-30]}', 'the last carbon goes');
      click(vert(0)); key('Delete');
      T.eq(code(), '\\chemfig{-[:-30]}', 'the first carbon goes and the next starts the molecule');
    });
  });

  T.test('chemistry delete: a ring side is hidden, not the whole ring', async () => {
    await run('\\chemfig{*6(------)}', () => {
      click(bond(2)); key('Delete');
      T.ok(/^\\chemfig\{\*6\(--(-\[,,,,draw=none\])---\)\}$/.test(code()), 'one side hidden: ' + code());
      T.ok(q('.cf-hidden'), 'the hidden side is drawn dashed in the editor');
      click(bond(2));
      T.ok(q('[data-ce="bshow"]'), 'picked, the panel offers to draw it again');
      q('[data-ce="bshow"]').click();
      T.eq(code(), '\\chemfig{*6(------)}', 'drawn again');
      click(vert(2)); key('Delete');
      T.ok(/\*6\(/.test(code()) && (code().match(/draw=none/g) || []).length === 2, 'a ring corner hides its two sides: ' + code());
    });
  });

  T.test('chemistry delete: a bond in a chain goes with what hangs after it', async () => {
    await run('\\chemfig{A-B(-[2]D)-C}', () => {
      click(bond(2)); key('Delete');
      T.eq(code(), '\\chemfig{A-B(-[2]D)}', 'the last bond and its atom go');
      click(bond(0)); key('Delete');
      T.eq(code(), '\\chemfig{A}', 'a bond from the start takes the rest of the chain');
      T.ok(!q('.cf-hidden'), 'nothing hidden outside rings');
    });
  });

  T.test('chemistry delete: a substituent bond on a ring goes, the ring stays', async () => {
    await run('\\chemfig{*6(---(-OH)---)}', () => {
      const L = TD.chem.build(code()), i = L.bonds.findIndex((b) => !b.ring);
      click(bond(i)); key('Delete');
      T.eq(code(), '\\chemfig{*6(------)}');
    });
  });

  T.test('chemistry: the empty hint goes once something is drawn', async () => {
    await run('', () => {
      T.ok(q('.qe-empty'), 'shown on an empty drawing');
      q('.qe-item[data-item="r:benzene"]').dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 7 }));
      q('.qe-item[data-item="r:benzene"]').dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, pointerId: 7 }));
      T.ok(/\*6/.test(code()), 'placed: ' + code());
      T.ok(!q('.qe-empty'), 'hint gone');
    });
  });

  T.test('chemistry palette: items drag onto an atom or a bond', async () => {
    await run('\\chemfig{A-B}', async () => {
      const item = (k) => q(`.qe-item[data-item="${k}"]`);
      const drag = (k, to) => { const b = item(k), r = b.getBoundingClientRect(), from = [r.left + 5, r.top + 5]; fire(b, 'pointerdown', from); fire(b, 'pointermove', [from[0] + 20, from[1]]); fire(b, 'pointermove', to); fire(b, 'pointerup', to); };
      drag('a:O', vert(1));
      T.eq(code(), '\\chemfig{A-O}', 'an atom dropped on an atom relabels it');
      drag('b:=', bond(0));
      T.eq(code(), '\\chemfig{A=O}', 'a bond dropped on a bond sets its kind');
      drag('b:-', vert(1));
      T.ok(/^\\chemfig\{A=O-/.test(code()), 'a bond dropped on an atom grows one: ' + code());
      const before = code();
      drag('a:N', [5, 5]);
      T.eq(code(), before, 'dropped off the drawing, nothing happens');
      const b = item('a:S'), r = b.getBoundingClientRect(), p = [r.left + 5, r.top + 5];
      fire(b, 'pointerdown', p); fire(b, 'pointerup', p);
      T.ok(b.classList.contains('on') || /S/.test(code()), 'a click still picks the item');
    });
  });

  T.test('chemistry palette: every wedge has its reversed form', async () => {
    await run('\\chemfig{A-B}', async () => {
      const keys = [...root().querySelectorAll('.qe-item[data-item^="b:"]')].map((x) => x.dataset.item);
      for (const k of ['>', '>:', '>|']) T.ok(keys.includes('b:' + k) && keys.includes('b:<' + k.slice(1)), `${k} and its reverse: ${keys}`);
      const b = q('.qe-item[data-item="b:<|"]'), r = b.getBoundingClientRect(), from = [r.left + 5, r.top + 5], to = bond(0);
      fire(b, 'pointerdown', from); fire(b, 'pointermove', [from[0] + 20, from[1]]); fire(b, 'pointermove', to); fire(b, 'pointerup', to);
      T.eq(code(), '\\chemfig{A<|B}', 'dropped on a bond, it makes a reversed hollow wedge');
    });
  });
}

T.test('chemistry arrow labels of several lines stay on their own side of the arrow', () => {
  const one = TD.chem.build('\\schemestart\\chemfig{A}\\arrow{->[Up][Down]}\\chemfig{B}\\schemestop').arrows[0];
  const many = TD.chem.build('\\schemestart\\chemfig{A}\\arrow{->[Line 1\nLine 2\nLine 3][Below 1\nBelow 2]}\\chemfig{B}\\schemestop').arrows[0];
  const [up, down] = many.labs, gap = (a, l) => ({ above: a.y1 - (l.by + l.bh / 2), below: l.by - l.bh / 2 - a.y1 });
  T.ok(up.bh > 2.5 * one.labs[0].bh && down.bh > 1.8 * one.labs[1].bh, 'the frames hold every line');
  T.ok(Math.abs(gap(many, up).above - gap(one, one.labs[0]).above) < 0.5, 'the last line above sits where one line would');
  T.ok(Math.abs(gap(many, down).below - gap(one, one.labs[1]).below) < 0.5, 'the first line below sits where one line would');
});

T.test('chemistry arrow labels of several lines are written so LaTeX breaks them', async () => {
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.querySelector('#cfModal'), q = (s) => root().querySelector(s);
  const code = () => q('.cz-code textarea').value.trim();
  const tab = '\\begin{tabular}{@{}c@{}}Line 1\\\\Line 2\\end{tabular}';
  T.eq(TD.chem.stackLines(['Line 1', 'Line 2']), tab, 'lines stack in a tabular');
  T.eq(TD.chem.stackLines(['Only']), 'Only', 'one line stays as it is');
  T.eq(TD.chem.labelLines(tab).join('|'), 'Line 1|Line 2', 'a tabular reads back as lines');
  T.eq(TD.chem.labelLines('\\shortstack{a\\\\b}').join('|'), 'a|b', 'a shortstack reads back as lines');
  const one = TD.chem.build('\\schemestart\\chemfig{A}\\arrow{->[Up]}\\chemfig{B}\\schemestop').arrows[0].labs[0];
  const two = TD.chem.build(`\\schemestart\\chemfig{A}\\arrow{->[${tab}]}\\chemfig{B}\\schemestop`).arrows[0].labs[0];
  T.ok(two.bh > 1.8 * one.bh, 'the preview stacks the lines');
  T.tex('chemistry two-line arrow label', `\\documentclass{standalone}\\usepackage{chemfig}\\begin{document}\\schemestart\\chemfig{A}\\arrow{->[${tab}][${TD.chem.stackLines(['H$_2$O', '$\\Delta$'])}]}\\chemfig{B}\\schemestop\\end{document}`);
  const src = '\\schemestart\\chemfig{A}\\arrow{->}\\chemfig{B}\\schemestop';
  TD.chemEditor.open({ src }, () => {});
  await tick(30);
  try {
    const A = TD.chem.build(code()).arrows[0], svg = q('.cf-svg'), r = svg.getBoundingClientRect();
    const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg.innerHTML);
    const p = [r.left + +m[1] + ((A.x1 + A.x2) / 2) * +m[3], r.top + +m[2] + ((A.y1 + A.y2) / 2) * +m[3]];
    const fire = (type) => svg.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true, clientX: p[0], clientY: p[1], pointerId: 7 }));
    const cap = Element.prototype.setPointerCapture; Element.prototype.setPointerCapture = function () {};
    try { fire('pointerdown'); fire('pointerup'); } finally { Element.prototype.setPointerCapture = cap; }
    const f = q('[data-f="above"]');
    T.ok(f, 'the arrow panel is open');
    f.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    f.value = 'Line 1 \\\\ Line 2';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    T.ok(code().includes(`\\arrow{->[${tab}]}`), 'written as a tabular: ' + code());
    T.eq(q('[data-f="above"]').value, 'Line 1 \\\\ Line 2', 'the field shows the lines joined by \\\\');
  } finally {
    q('[data-ce="cancel"]').click(); await tick(0);
    const d = document.querySelector('.td-dialog [data-r="1"]'); if (d) d.click();
  }
});
