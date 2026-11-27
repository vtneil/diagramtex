// Screenshots for the user guide (public/guide), taken from the real app so they stay current.
//
//   node scripts/guide-shots/shoot.mjs                 every scene, English and Thai
//   node scripts/guide-shots/shoot.mjs window,table    only these scenes
//   node scripts/guide-shots/shoot.mjs --lang en       one language (en → guide/img/, th → guide/img/th/)
//   NOCOMPILE=1 …                                      skip compiling src/ into public/ first
//
// Each scene (scenes.mjs) drives the app in headless Chrome at 1440 × 900 (2× pixels), may set window.__clip to the
// part worth showing, and is saved as WebP no wider than 1520 px (twice the guide's 760 px column).
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, ROOT, prepare, positional } from '../../tests/args.mjs';
import { serve, launch } from '../../tests/chrome.mjs';
import { scenes, HELPERS } from './scenes.mjs';

const argv = process.argv.slice(2);
const langArg = argv.includes('--lang') ? argv[argv.indexOf('--lang') + 1] : 'all';
const LANGS = langArg === 'all' ? ['en', 'th'] : [langArg];
const pick = positional.filter((a) => a !== langArg)[0]?.split(',') || null;
const IMG = path.join(ROOT, 'public/guide/img');
const MAX_W = 1520, DPR = 2, W = 1440, H = 900;

if (!process.env.NOCOMPILE) await prepare();
const server = await serve(APP_DIR);
const url = `http://127.0.0.1:${server.port}/`;
let failed = 0;
for (const lang of LANGS) {
  const out = lang === 'en' ? IMG : path.join(IMG, lang);
  fs.mkdirSync(out, { recursive: true });
  for (const sc of scenes) {
    if (pick && !pick.includes(sc.name)) continue;
    if (sc.langs && !sc.langs.includes(lang)) continue;
    const b = await launch(url);
    try {
      const w = sc.w || W, h = sc.h || H;
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: DPR, mobile: false });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: sc.dark ? 'dark' : 'light' }] });
      const locale = sc.locale || lang;
      if (locale !== 'en') {
        await b.ev(`localStorage.setItem('diagramtex.language', ${JSON.stringify(locale)}); return 1`);
        await b.send('Page.reload', { ignoreCache: false });
        await new Promise((r) => setTimeout(r, 600));
        for (let k = 0; k < 200; k++) {
          try { if (await b.ev('return !!(window.TD && TD.state && TD.state.doc && document.documentElement.lang)', 2000)) break; } catch { /* loading */ }
          await new Promise((r) => setTimeout(r, 100));
        }
        await b.ev('if (TD.ready) await TD.ready; return 1', 30000);
      }
      await b.ev('await new Promise(r=>setTimeout(r,400));return 1');
      const note = await b.ev(HELPERS + sc.js + `
        await document.fonts.ready; await sleep(${sc.wait ?? 1000}); await frame();
        $$('.tip,[role=tooltip]').forEach(e => e.style.visibility = 'hidden');
        return JSON.stringify({ clip: window.__clip ? clipRect(window.__clip) : null, out: window.__out ?? null });`, 120000);
      const { clip, out: info } = JSON.parse(note);
      const r = clip || { x: 0, y: 0, width: w, height: h };
      const scale = Math.min(1, MAX_W / (r.width * DPR));
      const shot = await b.send('Page.captureScreenshot', { format: 'webp', quality: 84, captureBeyondViewport: false,
        clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale } });
      if (!shot.result?.data) throw new Error('no screenshot: ' + JSON.stringify(shot).slice(0, 300));
      const file = path.join(out, sc.name + '.webp');
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`[PASSED] ${lang} ${sc.name} ${Math.round(r.width * DPR * scale)}×${Math.round(r.height * DPR * scale)} ${kb} KB${info ? ' ' + JSON.stringify(info).slice(0, 300) : ''}`);
      if (b.logs.length) console.log('  logs:', b.logs.slice(0, 3).join(' | ').slice(0, 400));
    } catch (e) { failed++; console.log(`[FAILED] ${lang} ${sc.name} ${String(e.message).slice(0, 600)}`); }
    finally { b.close(); }
  }
}
server.close();
process.exitCode = failed ? 1 : 0;
