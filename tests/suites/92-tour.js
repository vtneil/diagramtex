// The welcome tour: five cards (Welcome, left, top, right, keep a copy), Previous / Next / I’m All Good, once.
const tourKey = (k) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });

T.test('tour: steps, buttons and keys; the card never moves', async () => {
  T.ok(localStorage.getItem(TD.tour.KEY), 'the test profile has it marked seen, so it never covers the app');
  try {
    TD.tour.show();
    const root = document.querySelector('.td-dialog.tour'), box = root.querySelector('.tour-box');
    const btn = (t) => root.querySelector(`[data-t="${t}"]`), title = () => root.querySelector('#tourTitle').textContent;
    T.ok(TD.tour.open && root, 'shown');
    T.eq(title(), 'Welcome to DiagramTeX');
    T.eq(btn('prev').style.visibility, 'hidden', 'no Previous on the first card');
    T.eq(btn('skip').textContent, 'I’m All Good');
    await new Promise((r) => setTimeout(r, 250)); // past the opening animation
    const place = () => { const b = box.getBoundingClientRect(), n = btn('next').getBoundingClientRect(); return [b.height, n.x, n.y].map(Math.round).join(); };
    const at = place(), titles = [title()], marks = [root.querySelector('.tour-map .on')?.getAttribute('class') || ''];
    for (let k = 1; k < 5; k++) {
      btn('next').click();
      titles.push(title()); marks.push(root.querySelector('.tour-map .on') ? 'on' : '');
      T.eq(place(), at, `card ${k + 1} keeps the size and the buttons' places`);
    }
    T.eq(marks, ['', 'on', 'on', 'on', 'on'], 'each later card marks its part of the window');
    T.ok(/browser/i.test(root.querySelector('.tour-body > .on').textContent) && /\.diagramtex/.test(root.querySelector('.tour-body > .on').textContent), 'the last card warns and points to .diagramtex');
    T.eq(btn('next').textContent, 'Got It');
    T.eq(btn('skip').style.visibility, 'hidden', 'nothing to skip on the last card');
    root.dispatchEvent(tourKey('ArrowLeft'));
    T.eq(title(), titles[3], '← goes back');
    root.dispatchEvent(tourKey('ArrowRight'));
    T.eq(title(), titles[4], '→ goes on');
    btn('next').click();
    T.ok(!TD.tour.open && !document.querySelector('.td-dialog.tour'), 'Got It closes it');
    // I’m All Good and Esc close it from any card
    TD.tour.show(); document.querySelector('.td-dialog.tour [data-t="next"]').click();
    document.querySelector('.td-dialog.tour [data-t="skip"]').click();
    T.ok(!TD.tour.open, 'I’m All Good closes it');
    TD.tour.show(); document.querySelector('.td-dialog.tour').dispatchEvent(tourKey('Escape'));
    T.ok(!TD.tour.open, 'Esc closes it');
  } finally {
    TD.tour.close();
  }
});

T.test('tour: shown once, on the first visit only', async () => {
  const was = localStorage.getItem(TD.tour.KEY);
  try {
    TD.tour.firstRun(); await new Promise((r) => setTimeout(r, 500));
    T.ok(!TD.tour.open, 'not again once seen');
    localStorage.removeItem(TD.tour.KEY);
    TD.tour.firstRun(); await new Promise((r) => setTimeout(r, 500));
    T.ok(TD.tour.open, 'shown on a first visit');
    T.ok(localStorage.getItem(TD.tour.KEY), 'and remembered at once');
    TD.tour.close();
  } finally { if (was) localStorage.setItem(TD.tour.KEY, was); TD.tour.close(); }
});
