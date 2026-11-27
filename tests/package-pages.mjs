// The package pages (public/<page>/index.html with a figure.try, such as circuitikz-editor/): static pages for search
// engines, one block each, with "Edit this example here" opening the app's Quick editor for that block in a frame
// (?embed=<block>#draft=<code>, src/application/app.ts startEmbed and src/ui/services/quick.ts embed).
//
//   The page: its stylesheet and script load under its Content-Security-Policy, pictures load, local links lead to
//   files, the structured data parses, Copy copies the code, the app's dark choice is followed, nothing scrolls sideways
//   at phone width, and (with --dist) the sitemap lists it.
//   The embed: only the block's editor shows; the example becomes one draft, reopened (as it was left) when the
//   example is opened again; the draft writes exactly the page's code (so a page whose code the app no longer writes
//   fails here: node scripts/package-pages.mjs); the frame has the corners, border and shadow of the editor's window
//   in the app (.modal-box); the app's own Quick view and mode are left as they were; a #draft of
//   another block is ignored; Open in DiagramTeX opens the whole app in Quick on the drawing.
//   The home page on a phone links each page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepare, APP_DIR, DIST } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers, waitForAppReady } from './browser.mjs';
await prepare();
const server = await serve(APP_DIR);
const base = `http://127.0.0.1:${server.port}/`;
// every page with an embed, and its block (data-embed)
const pageOf = (dir) => { const f = path.join(APP_DIR, dir, 'index.html'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
const PAGES = Object.fromEntries(fs.readdirSync(APP_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => [d.name + '/', /<figure class="try" data-embed="(\w+)"/.exec(pageOf(d.name))?.[1]]).filter(([, type]) => type));
assert.ok(Object.keys(PAGES).length >= 7, 'package pages found: ' + Object.keys(PAGES).join(', '));

// in the page: the embedded app, once its block's editor is docked
const EMBEDDED = async () => {
  const w = () => document.querySelector('figure.try iframe')?.contentWindow;
  for (let k = 0; k < 600; k++) {
    try { if (w()?.TD?.ready && w().document.body.classList.contains('mode-quick') && w().document.querySelector('#quick .qk-dock .modal-head')) break; } catch { /* loading */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await w().TD.ready;
  // its fonts too: leaving the page mid-download is logged as a failed font in Firefox
  await w().document.fonts.ready;
};
// in the embedded app: what shows, and the Quick drafts of `type`
const EMBED_STATE = (type) => {
  const w = document.querySelector('figure.try iframe').contentWindow, d = w.document;
  const st = JSON.parse(w.localStorage.getItem('diagramtex.quick.blocks'));
  const vis = (s) => !!d.querySelector(s)?.getClientRects().length;
  const cur = st.items[type].find((x) => x.id === st.cur[type]);
  return { embed: d.documentElement.classList.contains('embed'), topbar: vis('#topbar'), files: vis('#files'), editor: vis('#quick .qk-dock .modal-head'),
    fromExample: st.items[type].filter((x) => x.src).length, name: cur.name || null, tikz: w.TD.toTikz([cur.shape]),
    view: st.view, quick: w.localStorage.getItem('diagramtex.quick'), hash: w.location.hash,
    place: d.querySelector('#quick [data-place]')?.textContent.trim(),
    code: document.querySelector('.code pre code').textContent };
};

try {
  const sitemap = DIST ? fs.readFileSync(path.join(APP_DIR, 'sitemap.xml'), 'utf8') : null;
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, base, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }), p = b.page;
    try {
      // the app's own Quick state, which the embed must leave alone: Quick off, the formula view
      await p.evaluate(() => { localStorage.removeItem('diagramtex.quick'); const s = JSON.parse(localStorage.getItem('diagramtex.quick.blocks') || '{}'); s.view = 'formula'; localStorage.setItem('diagramtex.quick.blocks', JSON.stringify(s)); });
      for (const [page, type] of Object.entries(PAGES)) {
        const at = `${browser} ${page}`;
        await p.goto(base + page);
        await p.evaluate(() => document.fonts.ready);
        const r = await p.evaluate(async () => {
          let copied = null;
          Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
          const btn = document.querySelector('button.copy'); btn.click(); await new Promise((res) => setTimeout(res, 50));
          let ld; try { ld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type']; } catch (e) { ld = String(e); }
          return { font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor,
            images: [...document.images].map((i) => i.complete && i.naturalWidth > 0), ld, copiedOk: copied === btn.parentNode.querySelector('pre code').textContent, said: btn.textContent,
            links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), canonical: document.querySelector('link[rel=canonical]').href };
        });
        assert.match(r.font, /Atkinson/, `${at}: site.css applies`);
        assert.equal(r.bg, 'rgb(244, 242, 236)', `${at}: light paper`);
        assert.ok(r.images.length && r.images.every(Boolean), `${at}: pictures load`);
        assert.equal(r.ld, 'BreadcrumbList', `${at}: structured data parses`);
        assert.ok(r.copiedOk && r.said === 'Copied', `${at}: Copy copies the code`);
        for (const l of r.links) {
          const u = new URL(l, base + page);
          if (u.origin !== new URL(base).origin || u.hash.startsWith('#share=')) continue;
          const f = path.join(APP_DIR, decodeURIComponent(u.pathname), u.pathname.endsWith('/') ? 'index.html' : '');
          assert.ok(fs.existsSync(f), `${at}: link ${l} leads to a file`);
        }
        if (sitemap) assert.ok(sitemap.includes(`<loc>${r.canonical}</loc>`), `${at}: the sitemap lists ${r.canonical}`);

        // the embed, twice: the second time reopens the draft the first made, as it was left
        for (const round of [1, 2]) {
          if (round === 2) await p.goto(base + page);
          await p.locator('.try-btn').click();
          await p.evaluate(`(${EMBEDDED})()`);
          const e = await p.evaluate(`(${EMBED_STATE})(${JSON.stringify(type)})`);
          assert.ok(e.embed && !e.topbar && !e.files && e.editor, `${at} round ${round}: only the block's editor shows ${JSON.stringify({ topbar: e.topbar, files: e.files, editor: e.editor })}`);
          assert.equal(e.fromExample, 1, `${at} round ${round}: one draft from the example`);
          // the drawing as the link brings it; once its editor has run, an engine may measure the block a hair differently
          if (round === 1) assert.equal(e.tikz.trim(), e.code.trim(), `${at}: the example writes the page's code (if the app's export changed, run node scripts/package-pages.mjs)`);
          assert.equal(e.view, 'formula', `${at} round ${round}: the app's Quick view is left as it was`);
          assert.equal(e.quick, null, `${at} round ${round}: the app still opens as it did`);
          assert.equal(e.hash, '', `${at} round ${round}: the drawing is taken out of the address`);
          assert.equal(e.place, 'Open in DiagramTeX', `${at} round ${round}: the bar offers Open in DiagramTeX`);
          if (round === 1) {
            const look = await p.evaluate(() => {
              const w = document.querySelector('figure.try iframe').contentWindow, box = w.document.createElement('div');
              box.className = 'modal-box'; w.document.body.appendChild(box);
              const pick = (cs) => [cs.borderTopLeftRadius, cs.borderTopWidth, cs.borderTopColor, cs.boxShadow].join(' | ');
              const want = pick(w.getComputedStyle(box)); box.remove();
              return { got: pick(getComputedStyle(document.querySelector('figure.try iframe'))), want };
            });
            assert.equal(look.got, look.want, `${at}: the frame looks like the editor's window in the app`);
          }
          if (round === 1) await p.evaluate((type) => { const w = document.querySelector('figure.try iframe').contentWindow, st = JSON.parse(w.localStorage.getItem('diagramtex.quick.blocks')); st.items[type].find((x) => x.src).name = 'left like this'; w.localStorage.setItem('diagramtex.quick.blocks', JSON.stringify(st)); }, type);
          else assert.equal(e.name, 'left like this', `${at}: opening the example again reopens its draft as it was left`);
        }

        // the app's dark choice, then phone width
        await p.evaluate(() => localStorage.setItem('diagramtex.theme', 'dark'));
        await p.goto(base + page);
        assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(28, 27, 25)', `${at}: follows the app's dark choice`);
        await p.evaluate(() => localStorage.removeItem('diagramtex.theme'));
        await p.setViewportSize({ width: 375, height: 800 });
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 375, `${at}: nothing scrolls sideways at 375 px`);
        await p.locator('.try-btn').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => assert.fail(`${at}: no embed where the editor doesn't fit`));
        await p.setViewportSize({ width: 1440, height: 900 });
      }

      // a #draft of another block is ignored: Quick opens on the block without it
      const before = await p.evaluate(() => JSON.parse(localStorage.getItem('diagramtex.quick.blocks')).items.cz.length);
      await p.goto(base + '?embed=cz#draft=0.' + Buffer.from(JSON.stringify({ type: 'qc', id: 'x' })).toString('base64url'));
      await waitForAppReady(p);
      await p.waitForFunction(() => document.body.classList.contains('mode-quick'));
      assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('diagramtex.quick.blocks')).items.cz.length), before, `${browser}: a #draft of another block makes no draft`);

      // Open in DiagramTeX: the whole app, in Quick on the drawing
      await p.goto(base + 'karnaugh-map-latex/');
      await p.locator('.try-btn').click();
      await p.evaluate(`(${EMBEDDED})()`);
      await Promise.all([p.waitForURL(base), p.evaluate(() => document.querySelector('figure.try iframe').contentWindow.document.querySelector('#quick [data-place]').click())]);
      await waitForAppReady(p);
      const app = await p.evaluate(() => ({ quick: document.body.classList.contains('mode-quick'), embed: document.documentElement.classList.contains('embed'),
        view: JSON.parse(localStorage.getItem('diagramtex.quick.blocks')).view, topbar: !!document.querySelector('#topbar').getClientRects().length }));
      assert.deepEqual(app, { quick: true, embed: false, view: 'kmap', topbar: true }, `${browser}: Open in DiagramTeX opens the app in Quick on the K-map`);

      // the home page on a phone links each package page
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(base);
      const links = await p.evaluate(() => [...document.querySelectorAll('#phoneWall .pw-kinds a')].filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')));
      assert.deepEqual(links.sort(), Object.keys(PAGES).sort(), `${browser}: the phone page links the package pages`);

      // Firefox logs a font download that a navigation cut off as failed (status 2152398850, NS_BINDING_ABORTED); this
      // suite navigates between the pages and the app many times, so only that one message is let through
      assert.deepEqual(b.logs.filter((l) => !(browser === 'firefox' && /downloadable font: download failed .*status=2152398850 /.test(l))), []);
      console.log(`[PASSED] ${browser}: ${Object.keys(PAGES).length} package pages (page, embed opened twice, dark, phone width), a foreign #draft ignored, Open in DiagramTeX, phone-page links`);
    } finally { await b.close(); }
  }
} finally { server.close(); }
