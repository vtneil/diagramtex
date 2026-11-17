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
      const menu = () => [...document.querySelectorAll('[data-cm]')].filter((x) => x.offsetParent);
      const rclick = () => { const b = TD.chem.build(code()).bonds[0], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2);
        q('.cf-svg').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1], button: 2 })); };
      rclick(); await tick(0);
      const hide = menu().find((x) => x.dataset.cm === 'bhide');
      T.ok(hide && !menu().some((x) => x.dataset.cm === 'bshow'), 'a drawn bond offers Hide Bond');
      T.ok(menu().some((x) => x.dataset.cm === 'bdel'), 'and still Delete Bond');
      hide.click(); await tick(0);
      T.eq(code(), '\\chemfig{A-[,,,,draw=none]B-C}', 'hidden with draw=none');
      rclick(); await tick(0);
      const show = menu().find((x) => x.dataset.cm === 'bshow');
      T.ok(show && !menu().some((x) => x.dataset.cm === 'bhide'), 'a hidden bond offers Show Bond');
      show.click(); await tick(0);
      T.eq(code(), '\\chemfig{A-B-C}', 'drawn again, the option gone');
    });
  });

  T.test('chemistry panel: a hidden ring side offers Show Bond, not Delete Bond', async () => {
    await run('\\chemfig{*6(--[,,,,draw=none]----)}', async () => {
      const b = TD.chem.build(code()).bonds[1], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2);
      q('.cf-svg').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1], button: 2 }));
      await tick(0);
      const acts = [...document.querySelectorAll('[data-cm]')].filter((x) => x.offsetParent).map((x) => x.dataset.cm);
      T.ok(acts.includes('bshow') && !acts.includes('bdel') && acts.includes('rdel'), 'Show Bond and Delete Ring: ' + acts);
      document.querySelector('[data-cm="bshow"]').click(); await tick(0);
      T.eq(code(), '\\chemfig{*6(------)}', 'the side is drawn again');
    });
  });
  T.test('chemistry panel: a picked bond has Hide Bond beside Delete Bond', async () => {
    await run('\\chemfig{A-B-C}', async () => {
      const b = TD.chem.build(code()).bonds[0], p = screen((b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2), svg = q('.cf-svg');
      fire(svg, 'pointerdown', p); fire(svg, 'pointerup', p); await tick(0);
      const acts = () => [...document.querySelectorAll('[data-ce]')].filter((x) => x.offsetParent && /^b(hide|show|del)$|^rdel$/.test(x.dataset.ce)).map((x) => x.dataset.ce);
      T.eq(acts(), ['bhide', 'bdel'], 'Hide Bond, then Delete Bond');
      document.querySelector('[data-ce="bhide"]').click(); await tick(0);
      T.eq(code(), '\\chemfig{A-[,,,,draw=none]B-C}', 'hidden');
      T.eq(acts(), ['bshow', 'bdel'], 'now Show Bond, then Delete Bond');
      document.querySelector('[data-ce="bshow"]').click(); await tick(0);
      T.eq(code(), '\\chemfig{A-B-C}', 'shown again');
    });
  });
}
