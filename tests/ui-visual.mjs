// Visual regression: the same interactions on a saved checkout (the baseline) and on this one, screenshot for
// screenshot, pixel for pixel. Any pixel that differs fails the run and leaves the two pictures and a diff.
//
//   DIAGRAMTEX_BASELINE=/path/to/checkout node tests/ui-visual.mjs          every scenario, Chromium
//   DIAGRAMTEX_BASELINE=… node tests/ui-visual.mjs dialog --webkit         scenarios whose name contains "dialog"
//
// The baseline checkout must have its public/ compiled. Each scenario runs at two window sizes, in light and dark,
// at 1× and 2× pixels. Animations are finished before each picture; the text caret is hidden.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { APP_DIR, ROOT, prepare, positional } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, reloadApp, testBrowsers } from './browser.mjs';

const BASE = process.env.DIAGRAMTEX_BASELINE;
if (!BASE) throw Error('Set DIAGRAMTEX_BASELINE to a checkout with a compiled public/');
const OUT = path.join(ROOT, 'artifacts', 'ui-visual');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const filter = positional[0] || '';
const VIEWPORTS = [{ width: 1400, height: 900 }, { width: 820, height: 900 }], THEMES = ['light', 'dark'], SCALES = [1, 2];

// Each scenario leaves the app in one state; `app` runs in the page, `act` drives the real mouse and keyboard.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// a picture taken twice in a row the same, so nothing still settling is caught half way
async function steady(page) {
  let last = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(50);
    const next = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    if (next.equals(last)) return next;
    last = next;
  }
  throw Error('the page never stopped changing');
}
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const hover = (sel) => async (page) => { const [x, y] = await center(page, sel); await page.mouse.move(x, y); };
const press = (sel) => async (page) => { const [x, y] = await center(page, sel); await page.mouse.move(x, y); await page.mouse.down(); };
const keys = (...ks) => async (page) => { for (const k of ks) await page.keyboard.press(k); };
const open = (call) => `void ${call};`;
const LONG = 'A question long enough to wrap onto a second line of the dialog, to check how the title breaks';
const SCENARIOS = [
  { name: 'app: board', app: '' },
  { name: 'app: document', app: `TD.app.newDoc('Visual', null, null, null, null, 'classic'); TD.app.setMode('document');` },
  { name: 'dialog: confirm', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced by the imported one.')`) },
  { name: 'dialog: confirm, hover OK', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: hover('.tdd-btns [data-r="1"]') },
  { name: 'dialog: confirm, hover Cancel', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: hover('.tdd-btns [data-r="0"]') },
  { name: 'dialog: confirm, press OK', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: press('.tdd-btns [data-r="1"]') },
  { name: 'dialog: confirm, Tab to Cancel', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: keys('Tab') },
  { name: 'dialog: confirm, Tab twice', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: keys('Tab', 'Tab') },
  { name: 'dialog: confirm, Shift+Tab', app: open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`), act: keys('Shift+Tab') },
  { name: 'dialog: danger', app: open(`TD.confirm('Delete “Sketch”?', 'This can’t be undone.', { ok: 'Delete', danger: true })`) },
  { name: 'dialog: danger, hover Delete', app: open(`TD.confirm('Delete “Sketch”?', 'This can’t be undone.', { ok: 'Delete', danger: true })`), act: hover('.tdd-btns [data-r="1"]') },
  { name: 'dialog: danger, Tab to Delete', app: open(`TD.confirm('Delete “Sketch”?', 'This can’t be undone.', { ok: 'Delete', danger: true })`), act: keys('Tab') },
  { name: 'dialog: danger, long title', app: open(`TD.confirm(${JSON.stringify(LONG)}, 'This can’t be undone.', { ok: 'Delete', danger: true })`) },
  { name: 'dialog: alert', app: open(`TD.alert('Saved', 'The file was written to your Downloads folder.')`) },
  { name: 'dialog: alert, no message', app: open(`TD.alert('Nothing to export')`) },
  { name: 'dialog: prompt', app: open(`TD.prompt('Rename the page', 'Untitled page')`) },
  { name: 'dialog: prompt, typed', app: open(`TD.prompt('Rename the page', 'Untitled page')`), act: async (page) => { await page.keyboard.type('Results'); } },
  { name: 'dialog: prompt, placeholder', app: open(`TD.prompt('Name the style', '', { placeholder: 'e.g. thick red' })`) },
  { name: 'dialog: prompt, Tab to Cancel', app: open(`TD.prompt('Rename the page', 'Untitled page')`), act: keys('Tab') },
  { name: 'dialog: prompt, hover field', app: open(`TD.prompt('Rename the page', 'Untitled page')`), act: hover('.tdd-in') },
  { name: 'dialog: prompt, multiline', app: open(`TD.prompt('Edit the source', 'line one\\nline two\\n$x^2$', { multiline: true })`) },
  { name: 'dialog: prompt, read-only', app: open(`TD.prompt('Exported TikZ', '\\\\begin{tikzpicture}\\n\\\\draw (0,0) -- (1,1);\\n\\\\end{tikzpicture}', { multiline: true, readonly: true, cancel: null, ok: 'Close' })`) },
  { name: 'dialog: over document', app: `TD.app.newDoc('Visual', null, null, null, null, 'classic'); TD.app.setMode('document'); ` + open(`TD.confirm('Replace the drawing?', 'The current drawing is replaced.')`) },
  { name: 'dialog: second replaces first', app: open(`TD.confirm('First?', 'one')`) + open(`TD.prompt('Second', 'two')`) },
  { name: 'dialog: closed with Escape', app: open(`TD.confirm('Close me', 'with Escape')`), act: keys('Escape') },
  { name: 'dialog: closed with Enter', app: open(`TD.prompt('Close me', 'with Enter')`), act: keys('Enter') },
];

const scenarios = SCENARIOS.filter((s) => s.name.includes(filter));
if (!scenarios.length) throw Error('no scenario matches ' + filter);

function compare(a, b, file) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { pixels: -1, size: `${A.width}×${A.height} vs ${B.width}×${B.height}` };
  const D = new PNG({ width: A.width, height: A.height });
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const same = A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2] && A.data[i + 3] === B.data[i + 3];
    if (!same) n++;
    const g = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 12 + 170;
    D.data.set(same ? [g, g, g, 255] : [255, 0, 0, 255], i);
  }
  if (n) { fs.writeFileSync(file + '.base.png', a); fs.writeFileSync(file + '.new.png', b); fs.writeFileSync(file + '.diff.png', PNG.sync.write(D)); }
  return { pixels: n };
}

await prepare();
const servers = [await serve(path.join(BASE, 'public')), await serve(process.env.DIAGRAMTEX_CANDIDATE || APP_DIR)]; // CANDIDATE=BASE/public measures the noise floor
let passed = 0; const failed = [];
try {
  for (const browser of testBrowsers()) for (const scale of SCALES) {
    const apps = [];
    // Chromium rasterises on the GPU, where the same page can come out a level apart from one run to the next;
    // on the CPU it draws the same pixels every time.
    const launch = browser === 'chromium' ? { args: ['--disable-gpu', '--disable-gpu-compositing', '--force-color-profile=srgb'] } : {};
    for (const s of servers) apps.push(await launchBrowser(browser, `http://127.0.0.1:${s.port}/`, { deviceScaleFactor: scale }, launch));
    try {
      for (const vp of VIEWPORTS) for (const theme of THEMES) {
        // each size and theme starts from a fresh load, so nothing drawn under the last one carries over
        for (const b of apps) { await b.page.setViewportSize(vp); await b.page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' }); await reloadApp(b.page); }
      for (const sc of scenarios) {
        const shots = [];
        for (const b of apps) {
          const page = b.page;
          await page.setViewportSize(vp);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
          await page.mouse.move(100, 450); // empty sidebar: no tooltip, no canvas readout
          // a fresh document, nothing open, the pointer parked
          await page.evaluate(async (theme) => {
            for (let i = 0; i < 4 && document.querySelector('.td-dialog'); i++) document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await new Promise((r) => setTimeout(r, 30));
            document.documentElement.dataset.theme = theme;
            TD.app.newDoc('Visual', null, null, null, null, 'board');
            document.activeElement?.blur?.();
          }, theme);
          await page.evaluate(`(async () => { ${sc.app}\n await document.fonts.ready; })()`);
          await page.waitForTimeout(300); // the switches' sliding knobs (220ms)
          await settle(page);
          if (sc.act) { await sc.act(page); await settle(page); }
          await page.waitForTimeout(60);
          shots.push(await steady(page));
          await page.mouse.up();
        }
        const tag = `${browser} ${scale}x ${vp.width}×${vp.height} ${theme} · ${sc.name}`;
        const file = path.join(OUT, tag.replace(/[^\w.-]+/g, '_'));
        const r = compare(shots[0], shots[1], file);
        if (r.pixels) { failed.push(tag); console.log(`✗ ${tag}: ${r.size || r.pixels + ' pixels differ'} → ${file}.diff.png`); }
        else { passed++; console.log(`✓ ${tag}`); }
      }
      }
      for (const [i, b] of apps.entries()) if (b.logs.length) console.log(`console errors (${i ? "new" : "baseline"}):`, b.logs.slice(0, 5));
    } finally { for (const b of apps) await b.close(); }
  }
} finally { for (const s of servers) s.close(); }
console.log(`\n${passed}/${passed + failed.length} pixel-identical${failed.length ? ' · differences in ' + OUT : ''}`);
if (failed.length) process.exitCode = 1;
