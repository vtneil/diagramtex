T.test('chemistry grid: shared icon selector, matching isometric spacing and visibility persist without editing chemistry', () => {
  const key = 'diagramtex.cf.grid', previous = localStorage.getItem(key), oldChoice = localStorage.getItem('diagramtex.cf.gridChoice');
  const source = '\\chemfig{-[:30]-[:-30]-[:30]}';
  let saved = false;
  localStorage.removeItem(key);
  const open = () => TD.chemEditor.open({ src: source }, () => { saved = true; });
  const root = () => document.querySelector('#cfModal'), q = s => root().querySelector(s);
  const choose = mode => q(`[data-grid-style="${mode}"]`).click();
  const selected = () => q('[data-grid-style][aria-checked="true"]')?.dataset.gridStyle;
  try {
    open();
    T.ok(!q('[data-ce="gridtoggle"]'), 'no separate grid visibility button');
    const code = q('.cz-code textarea').value;
    T.eq(selected(), 'isometric', 'default is isometric');
    T.ok(q('[data-grid="isometric"]'), 'triangular guide rendered');
    const pattern = q('#cf-isometric-grid');
    T.ok(Math.abs(Number(pattern.getAttribute('width')) / Number(pattern.getAttribute('height')) - Math.sqrt(3)) < .01, 'equilateral grid proportions');
    const size = [pattern.getAttribute('width'), pattern.getAttribute('height')];
    choose('isometric-dot');
    const dots = q('#cf-isometric-grid');
    T.eq([dots.getAttribute('width'), dots.getAttribute('height')], size, 'isometric dots share line spacing');
    T.eq(dots.querySelectorAll('circle').length, 2, 'triangular dot lattice rendered');
    choose('grid'); T.ok(q('[data-grid="grid"]'), 'rectangular guide available');
    choose('dot'); T.ok(q('[data-grid="dot"]'), 'square dot guide available');
    choose('dot'); T.ok(!q('.cf-grid'), 'off clears guides');
    T.eq(q('.cz-code textarea').value, code, 'view preference does not edit chemistry');
    q('[data-ce="done"]').click(); T.ok(!saved, 'view change does not save content');
    open(); T.eq(selected(), undefined, 'no style selected while hidden');
    T.eq(q('[data-grid-style="dot"]').tabIndex, 0, 'last style remains keyboard reachable');
    choose('dot'); T.ok(q('[data-grid="dot"]'), 'clicking remembered style enables grid');
    choose('dot');
    T.ok(!q('.cf-grid'), 'hidden state survives reopening');
    choose('isometric'); q('[data-ce="done"]').click();
  } finally {
    const modal = root(); if (modal && !modal.hidden) q('[data-ce="done"]').click();
    if (oldChoice == null) localStorage.removeItem('diagramtex.cf.gridChoice'); else localStorage.setItem('diagramtex.cf.gridChoice', oldChoice);
    if (previous == null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
  }
});
