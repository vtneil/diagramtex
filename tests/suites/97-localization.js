// Language changes affect presentation, never control values, names or source text.
T.test('Localization: language switching, fallback and document preservation', async () => {
  // Slider/editor suites may leave another file kind active. Use an explicit
  // Classic fixture for the document-specific captions asserted below.
  TD.app.newDoc('Localization checks', null, null, null, null, 'classic');
  TD.app.setMode('document');
  const picker = document.querySelector('#languagePicker');
  const selected = () => picker.querySelector('[aria-checked="true"]').dataset.language;
  const original = selected(), saved = localStorage.getItem('diagramtex.language');
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const choose = async (value) => { if (!picker.open) picker.querySelector('summary').click(); picker.querySelector('[data-language="' + value + '"]').click(); await tick(); T.ok(!picker.open, 'menu closes after selection'); };
  const name = document.querySelector('#docName');
  const oldName = name.value;
  try {
    await choose('en');
    T.eq(selected(), 'en', 'English can be selected');
    T.eq(picker.querySelector('[data-language="en"] .language-flag').textContent, '🇬🇧', 'English uses the UK flag');
    T.eq(picker.querySelector('[data-language="th"] .language-flag').textContent, '🇹🇭', 'Thai uses the Thai flag');
    T.ok(picker.querySelector('[data-language="en"]').textContent.includes('English'), 'flag has a visible language name');
    T.ok(document.querySelector('a[href="guide/"]'), 'English guide linked by default');
    T.eq(document.documentElement.lang, 'en', 'English document language');
    const trigger = picker.querySelector('summary');
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    T.ok(picker.open, 'arrow key opens menu');
    T.eq(document.activeElement.dataset.language, 'en', 'arrow key focuses first option');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.ok(!picker.open, 'Escape dismisses menu');
    T.ok(document.activeElement === trigger, 'Escape restores trigger focus');
    trigger.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    T.ok(!picker.open, 'outside click dismisses menu');
    name.value = 'Copy'; // A user name identical to a catalog key must stay verbatim.
    const source = document.querySelector('#tikzOut'), previousCode = source.textContent;
    const optionValues = [...document.querySelectorAll('#tikzScope option')].map((o) => o.value).join(',');
    await choose('th');
    T.eq(document.documentElement.lang, 'th', 'language metadata changes');
    T.eq(localStorage.getItem('diagramtex.language'), 'th', 'choice remembered');
    T.ok(document.querySelector('a[href="guide/th.html"]'), 'Thai guide linked when Thai selected');
    T.eq(document.querySelector('#filesTitle').textContent, 'เอกสารคลาสสิก', 'sidebar translated');
    T.eq(document.querySelector('#btnExport').textContent.trim(), 'ส่งออก', 'toolbar translated');
    T.eq(name.getAttribute('aria-label'), 'ชื่อเอกสาร', 'accessible label translated');
    T.eq(name.value, 'Copy', 'document name untouched');
    T.eq(source.textContent, previousCode, 'source untouched');
    T.eq([...document.querySelectorAll('#tikzScope option')].map((o) => o.value).join(','), optionValues, 'option values preserved');
    T.eq(document.querySelector('#tikzScope option[value="doc"]').textContent, 'ทั้งเอกสาร', 'option caption translated');
    T.eq(document.querySelector('#btnTikz').textContent.trim(), 'LaTeX', 'missing translation falls back to English');
    document.querySelector('#btnSortDocs').click();
    T.eq(document.querySelector('#sortMenu [data-act="sort:custom"] .lb').textContent, 'ลำดับที่กำหนดเอง', 'dynamic menu translated');
    document.querySelector('#btnSortDocs').click();
    const prompt = TD.prompt({ id: 'ui.rename', fallback: 'Rename' }, 'Copy');
    await tick();
    T.eq(document.querySelector('#tddTitle').textContent, 'เปลี่ยนชื่อ', 'explicit dialog caption translated');
    T.eq(document.querySelector('.tdd-in').value, 'Copy', 'dialog input untouched');
    T.eq(document.querySelector('.td-dialog [data-r="0"]').textContent, 'ยกเลิก', 'cancel translated');
    await choose('en');
    T.eq(document.querySelector('#tddTitle').textContent, 'Rename', 'open dialog refreshes');
    T.eq(document.querySelector('.tdd-in').value, 'Copy', 'open dialog input preserved');
    await choose('th');
    document.querySelector('.td-dialog [data-r="0"]').click();
    await prompt;
    await choose('en');
    T.eq(document.querySelector('#filesTitle').textContent, 'Classic documents', 'switches back immediately');
    T.eq(document.querySelector('#btnExport').textContent.trim(), 'Export', 'English toolbar restored');
  } finally {
    name.value = oldName;
    await choose(original);
    saved === null ? localStorage.removeItem('diagramtex.language') : localStorage.setItem('diagramtex.language', saved);
  }
});

T.test('Guide: English and Thai cover the same anchors with valid language links', async () => {
  const parser = new DOMParser();
  const load = async (url) => {
    const response = await fetch(url);
    T.ok(response.ok, 'guide page loads: ' + url);
    return parser.parseFromString(await response.text(), 'text/html');
  };
  const en = await load('guide/'), th = await load('guide/th.html');
  T.eq(en.documentElement.lang, 'en', 'English language metadata');
  T.eq(th.documentElement.lang, 'th', 'Thai language metadata');
  const ids = (doc) => [...doc.querySelectorAll('[id]')].map((el) => el.id).sort();
  T.eq(ids(th), ids(en), 'section anchors survive switching languages');
  T.eq(th.querySelectorAll('details.block > div').length, en.querySelectorAll('details.block > div').length, 'specialist editors covered in both guides');
  T.ok(/[ก-๙]/.test(th.querySelector('h1').textContent), 'Thai guide content');
  for (const doc of [en, th]) {
    T.ok(doc.querySelector('[data-guide-lang="en"][aria-label="English (UK)"]'), 'accessible English flag link');
    T.ok(doc.querySelector('[data-guide-lang="th"][aria-label="ภาษาไทย"]'), 'accessible Thai flag link');
    for (const a of doc.querySelectorAll('a[href^="#"]')) T.ok(doc.getElementById(a.hash.slice(1)), 'valid anchor: ' + a.hash);
    T.ok(doc.querySelector('script[src="language.js"]'), 'section-preserving navigation script');
  }
  T.eq(th.querySelector('pre').textContent, en.querySelector('pre').textContent, 'LaTeX example unchanged');
});

T.test('Document view: pictures that load together lay the page out once, not once each (a change of language reloads every label)', async () => {
  TD.app.newSample(); TD.app.setMode('document');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();
  const root = document.querySelector('#docview'), img = root.querySelector('img, image');
  T.ok(img, 'the Welcome document has a picture in it');
  // layoutPage measures the view's padding: count those measurements
  const real = window.getComputedStyle;
  let layouts = 0;
  window.getComputedStyle = function (el, ...rest) { if (el === root) layouts++; return real.call(this, el, ...rest); };
  try {
    for (let i = 0; i < 40; i++) img.dispatchEvent(new Event('load'));
    T.eq(layouts, 0, 'not laid out while the pictures load');
    await frame();
    T.ok(layouts >= 1 && layouts <= 3, `laid out after them, not once each (${layouts} for 40)`);
  } finally { window.getComputedStyle = real; }
});
