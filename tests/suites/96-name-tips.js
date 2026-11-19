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
}
