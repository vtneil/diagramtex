// Every block editor's palette shows each item whole: no drawing reaches past its own box (set glyphs, strokes),
// no name is cut (an ellipsis, a line clamp, a squeezed line that loses its descenders), no word breaks in the middle,
// and no category title is cut. English and Thai, three palette widths (3 columns, 2 with stacked rows, 1), every
// engine. The fixes are src/ui/kit/fit-item.ts (drawings and long words) and the .qe-item / .cz-part CSS (wrapping).
import assert from 'node:assert/strict';
import { prepare, APP_DIR } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);

// in the page: open `type`'s editor on a fresh object and list what its palette cuts
const MEASURE = async (type) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const s = TD.TYPES[type].create({ x: 0, y: 0 }); s.id = 'pf-' + type;
  if (TD.state.mode === 'document') TD.app.setMode('diagram');
  TD.blocks.open(s, () => {});
  let pals = [];
  for (let k = 0; k < 100 && !pals.length; k++) {
    await frame();
    pals = [...document.querySelectorAll('.cz-pal')].filter((p) => p.getClientRects().length && p.querySelector('[data-item]'));
  }
  if (!pals.length) return null; // an editor without a palette (the Table)
  for (const p of pals) p.querySelectorAll('details').forEach((d) => { d.open = true; });
  await document.fonts.ready; await frame(); await frame();
  const seg = Intl.Segmenter ? new Intl.Segmenter(document.documentElement.lang || undefined, { granularity: 'word' }) : null;
  // the words of a text, as [start, end) offsets: Thai has no spaces between them
  const wordsOf = (t) => (seg ? [...seg.segment(t)].filter((x) => x.isWordLike).map((x) => [x.index, x.index + x.segment.length])
    : [...t.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]));
  // a word laid out on more than one line was broken in the middle
  const lines = (r) => new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
  const bad = []; let n = 0;
  for (const p of pals) {
    for (const item of p.querySelectorAll('[data-item]')) {
      if (!item.getClientRects().length) continue;
      const svg = item.querySelector(':scope > svg, :scope > .qe-fig > svg');
      const tag = item.dataset.item;
      if (svg) {
        n++;
        const R = svg.getBoundingClientRect();
        let c = null;
        // what a clip path lets show, on screen: its shapes' boxes, mapped by the clipped element's transform
        const clipOf = (g) => {
          const id = /url\(\s*["']?#([^"')\s]+)/.exec(g.getAttribute('clip-path') || '')?.[1];
          const cp = id && svg.querySelector(`clipPath[id="${CSS.escape(id)}"]`), m0 = g.getScreenCTM();
          if (!cp || !m0) return null;
          let q = null;
          for (const k of cp.children) {
            const b = k.getBBox(), own = k.transform?.baseVal.consolidate()?.matrix, m = own ? m0.multiply(own) : m0;
            for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
              const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
              q = q ? { l: Math.min(q.l, X), t: Math.min(q.t, Y), r: Math.max(q.r, X), b: Math.max(q.b, Y) } : { l: X, t: Y, r: X, b: Y };
            }
          }
          return q;
        };
        for (const el of svg.querySelectorAll('path,line,rect,circle,ellipse,polygon,polyline,text,image,foreignObject,use')) {
          if (el.closest('defs,clipPath,mask,marker,pattern')) continue;
          const r0 = el.getBoundingClientRect(); if (!r0.width && !r0.height) continue;
          let r = { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom };
          for (let g = el; g && g !== svg.parentElement; g = g.parentElement) {
            const q = g.hasAttribute('clip-path') && clipOf(g);
            if (q) r = { left: Math.max(r.left, q.l), top: Math.max(r.top, q.t), right: Math.min(r.right, q.r), bottom: Math.min(r.bottom, q.b) };
          }
          if (r.right < r.left || r.bottom < r.top) continue;
          c = c ? { l: Math.min(c.l, r.left), t: Math.min(c.t, r.top), r: Math.max(c.r, r.right), b: Math.max(c.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }
        const over = c ? Math.max(R.left - c.l, R.top - c.t, c.r - R.right, c.b - R.bottom) : 0;
        if (over > 0.75) bad.push(`${tag}: drawing reaches ${over.toFixed(1)}px past its box`);
      }
      const name = item.querySelector(':scope > span:last-child:not(.qe-fig)');
      if (name && getComputedStyle(name).display !== 'none' && name.textContent.trim()) {
        const box = name.getBoundingClientRect(), cs = getComputedStyle(name);
        if (cs.overflow !== 'visible' || cs.textOverflow !== 'clip' || cs.webkitLineClamp && cs.webkitLineClamp !== 'none') bad.push(`${tag}: name can be cut (${cs.overflow}, ${cs.textOverflow}, clamp ${cs.webkitLineClamp})`);
        if (name.scrollWidth > box.width + 1) bad.push(`${tag}: name "${name.textContent}" is wider than its room`);
        if (box.bottom > item.getBoundingClientRect().bottom + 0.5) bad.push(`${tag}: name runs out of its item`);
        if (parseFloat(cs.fontSize) < 10) bad.push(`${tag}: name below 10px`);
        const text = name.firstChild;
        if (text && text.nodeType === Node.TEXT_NODE) for (const [a, z] of wordsOf(text.data)) {
          const r = document.createRange(); r.setStart(text, a); r.setEnd(text, z);
          if (lines(r) > 1) bad.push(`${tag}: "${text.data.slice(a, z)}" breaks in the middle`);
        }
      }
    }
    for (const t of p.querySelectorAll('.cz-cat-t')) {
      if (!t.getClientRects().length) continue;
      if (t.scrollWidth > t.getBoundingClientRect().width + 1) bad.push(`title "${t.textContent.trim()}" is cut`);
    }
  }
  return { n, bad };
};

try {
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, `http://127.0.0.1:${server.port}/`), p = b.page;
    try {
      const types = await p.evaluate(() => [...TD.blocks.entries()].filter(([, d]) => d.editor).map(([t]) => t));
      let checked = 0;
      for (const language of ['en', 'th']) {
        await p.evaluate((language) => { document.querySelector('#languagePicker summary').click(); document.querySelector(`[data-language="${language}"]`).click(); }, language);
        // the editor's palette: 3 columns, 2 (list rows stacked), 1 (a 96px column of icons)
        for (const [width, height] of [[1600, 1000], [1200, 860], [960, 760]]) {
          await p.setViewportSize({ width, height });
          for (const type of types) {
            const r = await p.evaluate(`(${MEASURE})(${JSON.stringify(type)})`);
            if (!r) continue;
            assert(r.n > 0, `${browser}/${language}/${width}/${type}: palette drew no items`);
            assert.deepEqual(r.bad, [], `${browser}/${language}/${width}/${type}`);
            checked += r.n;
          }
        }
      }
      assert.deepEqual(b.logs, []);
      console.log(`✓ ${browser}: ${types.length} block editors, ${checked} palette items whole (drawings, names, words, titles) in English/Thai at three widths`);
    } finally { await b.close(); }
  }
} finally { server.close(); }
