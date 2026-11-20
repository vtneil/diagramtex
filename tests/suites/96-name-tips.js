// A name cut short by an ellipsis shows in full in the app's tooltip when hovered (services/tooltip.ts): over the
// name or elsewhere in its row, under the row's own tip if it has one; a name that fits shows none.
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const over = el => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const out = el => el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }));
  const tip = () => { const t = document.querySelector('.td-tip:not(.static)'); return t && !t.hidden ? t : null; };

  T.test('tooltips: a name cut short shows in full on hover; its control\'s tip goes under it; a name that fits shows nothing', async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:20px;top:20px;width:120px;font:13px sans-serif';
    host.innerHTML = '<div class="row" style="display:flex"><i style="width:16px">▣</i><span class="nm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Diagram of the timing between the clock and the data bus</span></div>'
      + '<button class="b" title="Open it" style="width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A rather long button name</button>'
      + '<span class="fits" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Short</span>';
    document.body.append(host);
    try {
      await wait();
      const nm = host.querySelector('.nm');
      over(nm); await wait(900);
      T.ok(tip(), 'a tip shows');
      T.eq(tip().textContent, 'Diagram of the timing between the clock and the data bus', 'the full name');
      out(nm); await wait(50);
      T.ok(!tip(), 'gone when the pointer leaves');
      over(host.querySelector('.row i')); await wait(50);
      T.eq(tip()?.textContent, 'Diagram of the timing between the clock and the data bus', 'from the row\'s icon too');
      out(host.querySelector('.row i')); await wait(50);
      over(host.querySelector('.b')); await wait(50);
      T.eq(tip()?.querySelector('.td-tip-sub')?.textContent, 'Open it', 'a control\'s own tip goes under the name');
      T.ok(tip().textContent.startsWith('A rather long button name'), 'the name first');
      out(host.querySelector('.b')); await wait(900);
      over(host.querySelector('.fits')); await wait(900);
      T.ok(!tip(), 'a name that fits shows nothing');
    } finally { TD.tooltip.hide(); host.remove(); }
  });

  T.test('tooltips: a title names what may be named and has no words of its own; anything else it describes', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<button type="button" class="t-icon" title="3D figures"><svg aria-hidden="false"><text>3D</text></svg></button>'
      + '<button type="button" class="t-text" title="Open the file">Open</button><span class="t-span" title="Drag to set a width"></span>'
      + '<span class="t-sep" role="separator" title="Drag to set a width"></span>';
    document.body.appendChild(host);
    try {
      await wait();
      const $ = (c) => host.querySelector(c);
      T.eq($('.t-icon').getAttribute('aria-label'), '3D figures', 'an icon\'s own letters are not a name: the tip names it');
      T.eq([$('.t-text').getAttribute('aria-label'), $('.t-text').getAttribute('aria-description')], [null, 'Open the file'], 'a button with words is described');
      T.eq([$('.t-span').getAttribute('aria-label'), $('.t-span').getAttribute('aria-description')], [null, 'Drag to set a width'], 'a plain span may not be named');
      T.eq($('.t-sep').getAttribute('aria-label'), 'Drag to set a width', 'a span with a role is named');
      // the app's own: every tool group in the rail has a name, and the top bar is a banner, not a toolbar
      for (const b of document.querySelectorAll('#tools [data-fly]')) T.ok(b.getAttribute('aria-label') || b.textContent.trim(), 'named: ' + b.id);
      T.eq(document.getElementById('topbar').getAttribute('role'), null, 'the top bar keeps its banner role');
      T.eq(document.querySelectorAll('[role="main"], main').length, 1, 'one main landmark');
    } finally { host.remove(); }
  });
}
