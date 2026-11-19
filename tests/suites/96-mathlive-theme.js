// MathLive in the app's look (services/mathlive-theme.ts): each field carries the sheet that draws its menu as the
// app's menu and its ☰ as a flat line icon, its lines are white, and the command suggestions sit in the top layer
// while they show (over the text popup, itself in the top layer).
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  T.test('MathLive: fields carry the app\'s menu sheet, lines are white, suggestions go to the top layer while shown', async () => {
    await TD.input.load();
    const host = document.createElement('div');
    host.className = 'td-pop-ml';
    document.body.append(host);
    let made = null;
    const ed = TD.input.mount(host, { text: 'Let $a$', onInput() {}, onDone() {} });
    try {
      await wait(50);
      const mf = host.querySelector('math-field');
      const rules = [...mf.shadowRoot.adoptedStyleSheets].flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n');
      T.ok(/\.ui-menu-container > li\.active/.test(rules) && /\.ML__menu-toggle::before/.test(rules), 'the field has the app\'s menu sheet');
      mf.focus(); await wait(50);
      T.eq(getComputedStyle(mf).backgroundColor, 'rgba(0, 0, 0, 0)', 'the line being typed is not tinted');
      // the suggestion box: MathLive's own, or one standing in for it
      let box = document.getElementById('mathlive-suggestion-popover');
      if (!box) { box = made = document.createElement('div'); box.id = 'mathlive-suggestion-popover'; document.body.append(box); await wait(); }
      box.classList.add('is-visible'); await wait();
      T.ok(box.matches(':popover-open'), 'in the top layer while shown');
      const cs = getComputedStyle(box);
      T.eq(cs.borderTopLeftRadius, getComputedStyle(document.documentElement).getPropertyValue('--r-lg').trim() || '12px', 'a card with the menus\' corners');
      box.classList.remove('is-visible'); await wait();
      T.ok(!box.matches(':popover-open'), 'and out of it when hidden');
    } finally { ed.destroy(); host.remove(); if (made) made.remove(); }
  });
}
