// Drive the real app and capture promo screens. Usage: node shoot.mjs scenes.mjs [only,names]
import fs from 'node:fs'; import path from 'node:path';
import { APP_DIR, prepare } from '../../../tests/args.mjs';
import { serve, launch } from '../../../tests/chrome.mjs';
const [scenesFile, only] = process.argv.slice(2);
const { scenes, W = 1600, H = 1000 } = await import(path.resolve(scenesFile));
const OUT = path.join(import.meta.dirname, 'raw'); fs.mkdirSync(OUT, { recursive: true });
if (!process.env.NOCOMPILE) await prepare();
const server = await serve(APP_DIR);
const pick = only ? only.split(',') : null;
for (const sc of scenes) {
  if (pick && !pick.includes(sc.name)) continue;
  const b = await launch(`http://127.0.0.1:${server.port}/`);
  try {
    await b.send('Emulation.setDeviceMetricsOverride', { width: sc.w || W, height: sc.h || H, deviceScaleFactor: 2, mobile: false });
    if (sc.dark) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await b.ev('await new Promise(r=>setTimeout(r,300));return 1');
    const out = await b.ev(sc.js + '\nawait document.fonts.ready; await new Promise(r=>setTimeout(r,' + (sc.wait || 1200) + ')); return window.__out ?? 1;', 120000);
    const shot = await b.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, sc.name + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('✓', sc.name, out === 1 ? '' : JSON.stringify(out).slice(0, 1500));
    if (b.logs.length) console.log('  logs:', b.logs.slice(0, 3));
  } catch (e) { console.log('✗', sc.name, e.message.slice(0, 500)); }
  finally { b.close(); }
}
server.close();
