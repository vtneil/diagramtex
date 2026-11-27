// Direct Chromium/WebKit/Firefox comparison. No per-browser visual baselines: differences
// in the same formula are failures, with paired screenshots and JSON/HTML evidence.
// --report-only writes the same evidence without a failing exit status.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
import { prepare, APP_DIR, args } from './args.mjs';

const fixtures = [
  ['scripts', String.raw`x^2+y_1`],
  ['script-fonts', String.raw`\left(\mathbf{RST^\dagger}\right)^k=\mathbf{RS^\mathit{k}T^\dagger};\quad\mathbf{R}\text{ unitary}`],
  ['fraction', String.raw`\frac{a+b}{c+d}`],
  ['reflection', String.raw`\reflectbox{abc}`],
  ['dashed-array', String.raw`\begin{array}{c}a\\\hdashline b\end{array}`],
  ['integral', String.raw`\displaystyle\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}`],
  ['sum', String.raw`\displaystyle\sum_{n=1}^{\infty}\frac1{n^2}`],
  ['matrix', String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`],
  ['cases', String.raw`f(x)=\begin{cases}x^2&x>0\\0&x\leq0\end{cases}`],
  ['brackets', String.raw`\left\langle\psi\middle|H\middle|\psi\right\rangle`],
  ['vectors', String.raw`\vec F=q(\vec E+\vec v\times\vec B)`],
  ['fonts', String.raw`\mathbf A+\mathbb R+\mathcal F`],
  ['radical', String.raw`\sqrt[3]{x^2+\sqrt{y}}`],
  ['accents', String.raw`\hat x+\bar y+\overline{AB}`],
  ['text', String.raw`\text{Label }\alpha\to\beta`],
  ['boxes', String.raw`\boxed{\frac{a+b}{c+d}}`],
  ['underbrace', String.raw`\underbrace{x+y+z}_{n\text{ terms}}`],
  ['overbrace', String.raw`\overbrace{a+b}^{2}`],
  ['nested-accents', String.raw`\hat{\vec{x}}+\widetilde{ABC}`],
  ['aligned', String.raw`\begin{aligned}a&=b+c\\d&=e+f\end{aligned}`],
  ['arrow-label', String.raw`A\xrightarrow{f\circ g}B`],
].map(([name, tex]) => ({ name, tex }));
const scenarios = [
  { name: 'canvas-minimum', scale: .25 },
  { name: 'canvas-normal', scale: 1 },
  { name: 'canvas-enlarged', scale: 2 },
  { name: 'document', scale: 1, document: true },
  { name: 'standalone-svg', scale: 1, exported: true },
];
const HEIGHT = Math.ceil(fixtures.length / 2) * 120;
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-parity-'));
const captures = {}, failures = [], comparisons = [];
const targets = testBrowsers(args).filter(name => name !== 'chromium');
if (!targets.length) throw new Error('Parity requires a comparison browser: --webkit, --firefox, or omit browser flags');
await prepare();
const server = await serve(APP_DIR, { '/__export/': artifacts });
try {
  for (const name of ['chromium', ...targets]) {
    const b = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      await b.page.setViewportSize({ width: 1600, height: HEIGHT + 200 });
      for (const engine of ['katex', 'temml']) for (const scenario of scenarios) {
        const capture = await b.page.evaluate(async ({ engine, scenario, fixtures, height }) => {
          TD.math.set(engine);
          await TD.math.whenReady();
          // Force the selected engine's fonts to load before measuring or drawing.
          const warm = document.createElement('div'); warm.className = 'tx';
          warm.innerHTML = fixtures.map(f => TD.math.render(f.tex, { throwOnError: true })).join('');
          document.body.append(warm); await document.fonts.ready; warm.remove(); TD.clearTextCache();
          document.querySelector('#parity')?.remove();
          const panel = document.createElement('div'); panel.id = 'parity';
          panel.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:' + height + 'px;z-index:2147483647;background:white;color:black;';
          document.body.append(panel);
          const metrics = [];
          if (scenario.document) {
            panel.innerHTML = fixtures.map((f, i) => `<div data-formula="${i}" style="position:absolute;left:${i % 2 * 640}px;top:${Math.floor(i / 2) * 120}px;width:640px;height:120px;display:flex;align-items:center;justify-content:center;font:20px/1.2 KaTeX_Main,serif"><span>${TD.math.render(f.tex)}</span></div>`).join('');
            await document.fonts.ready;
            for (const element of panel.querySelectorAll('[data-formula] > span')) {
              const rect = element.getBoundingClientRect(); metrics.push({ w: rect.width, h: rect.height });
            }
          } else {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${height}" viewBox="0 0 1280 ${height}"><style>.hitfill{fill:transparent;stroke:none}</style>`;
            if (scenario.exported) svg += TD.math.exportStyle();
            fixtures.forEach((f, i) => {
              const text = '$' + f.tex + '$', style = { size: 'Large' }, box = TD.textBox(text, style);
              metrics.push({ w: box.w, h: box.h });
              svg += `<g transform="translate(${i % 2 * 640 + 320},${Math.floor(i / 2) * 120 + 60}) scale(${scenario.scale})">${TD.textSvg(text, style, '#000000', 0, 0, { export: !!scenario.exported })}</g>`;
            });
            svg += '</svg>';
            panel.innerHTML = scenario.exported ? await TD.app.svgWithFonts(svg) : svg;
          }
          await document.fonts.ready;
          await Promise.all([...panel.querySelectorAll('image.svg-label')].map(element => new Promise((resolve, reject) => {
            const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = element.getAttribute('href');
          })));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return { metrics, markup: scenario.exported ? new XMLSerializer().serializeToString(panel.firstElementChild) : panel.innerHTML };
        }, { engine, scenario, fixtures, height: HEIGHT });
        const file = `${name}-${engine}-${scenario.name}.png`;
        let target = b.page, exported;
        if (scenario.exported) {
          exported = await b.context.newPage(); target = exported;
          await target.setViewportSize({ width: 1600, height: HEIGHT + 200 });
          const svgFile = `${name}-${engine}-export.svg`;
          fs.writeFileSync(path.join(artifacts, svgFile), capture.markup);
          await target.goto(`http://127.0.0.1:${server.port}/__export/${svgFile}`);
          await target.evaluate(() => document.fonts.ready);
          assert.equal(await target.locator('parsererror').count(), 0, name + '/' + engine + ': standalone SVG must parse as XML');
          await target.locator('svg').first().evaluate((svg, height) => { svg.style.width = '1280px'; svg.style.height = height + 'px'; svg.style.display = 'block'; }, HEIGHT);
        }
        const png = PNG.sync.read(await target.locator(scenario.exported ? 'svg' : '#parity').first().screenshot({ path: path.join(artifacts, file) }));
        assert.equal(png.width, 1280, file + ': fixed screenshot width');
        assert.equal(png.height, HEIGHT, file + ': fixed screenshot height');
        await exported?.close();
        captures[`${name}/${engine}/${scenario.name}`] = { metrics: capture.metrics, png, file };
      }
      assert.deepEqual(b.logs, [], name + ': no runtime errors');
    } finally { await b.close(); }
  }
} finally { server.close(); }

function mask(png, index) {
  const left = index % 2 * 640, top = Math.floor(index / 2) * 120;
  const pixels = new Set(); let dark = 0; let x0 = 640, y0 = 120, x1 = -1, y1 = -1;
  for (let y = 0; y < 120; y++) for (let x = 0; x < 640; x++) {
    const at = ((top + y) * png.width + left + x) * 4;
    // Count ink, ignoring almost-white antialiasing fringes.
    if (Math.min(...png.data.subarray(at, at + 3)) >= 245) continue;
    if (Math.max(...png.data.subarray(at, at + 3)) < 130) dark++;
    pixels.add(y * 640 + x); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { pixels, dark, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
function unmatched(a, b) {
  let missing = 0;
  for (const value of a) {
    const x = value % 640, y = Math.floor(value / 640); let found = false;
    // A two-pixel neighbourhood tolerates rasterisation, not moved/missing glyphs.
    for (let dy = -2; dy <= 2 && !found; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (x + dx >= 0 && x + dx < 640 && b.has((y + dy) * 640 + x + dx)) { found = true; break; }
    }
    if (!found) missing++;
  }
  return missing;
}
for (const browser of targets) for (const engine of ['katex', 'temml']) for (const scenario of scenarios) {
  const a = captures[`chromium/${engine}/${scenario.name}`], b = captures[`${browser}/${engine}/${scenario.name}`];
  fixtures.forEach((fixture, i) => {
    const A = mask(a.png, i), B = mask(b.png, i), errors = [];
    if (!A.pixels.size || !B.pixels.size) errors.push('missing formula ink');
    // Tiny formulae can fill their bounds with pale antialiasing fringes.
    // The opaque-rectangle guard counts dark coverage, not those fringes.
    if ([A, B].some(mask => mask.dark / Math.max(1, mask.bounds.w * mask.bounds.h) > .85)) errors.push('solid rectangle obscures formula glyphs');
    for (const dimension of ['w', 'h']) {
      const delta = Math.abs(a.metrics[i][dimension] - b.metrics[i][dimension]);
      if (delta > Math.max(2, a.metrics[i][dimension] * .03)) errors.push(`${dimension}: ${a.metrics[i][dimension]} vs ${b.metrics[i][dimension]}`);
    }
    const different = (unmatched(A.pixels, B.pixels) + unmatched(B.pixels, A.pixels)) / Math.max(1, A.pixels.size + B.pixels.size);
    if (different > .08) errors.push(`${(different * 100).toFixed(1)}% unmatched ink`);
    const result = { browser, engine, scenario: scenario.name, fixture: fixture.name, tex: fixture.tex, chromium: a.metrics[i], candidate: b.metrics[i], chromiumInk: A.bounds, candidateInk: B.bounds, unmatched: different, errors, images: [a.file, b.file] };
    comparisons.push(result);
    if (errors.length) failures.push(result);
  });
}
fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ thresholds: { geometry: 'max(2px, 3%)', ink: '8% after 2px neighbourhood' }, comparisons }, null, 2));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
fs.writeFileSync(path.join(artifacts, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Chromium / WebKit / Firefox maths parity</title><style>body{font:15px system-ui;margin:32px;color:#222}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:left}details{margin:20px 0}img{width:49%;border:1px solid #ccc}code{white-space:pre-wrap}.fail{background:#fee}</style><h1>Chromium / WebKit / Firefox maths parity</h1><p>${comparisons.length - failures.length}/${comparisons.length} comparisons within tolerance. Layout: max(2px, 3%); ink: 8% after a 2px neighbourhood. These tolerances allow rasterisation differences; no browser-specific visual baselines are used.</p><table><tr><th>Engine / view</th><th>Formula</th><th>Result</th></tr>${comparisons.map(r => `<tr class="${r.errors.length ? 'fail' : ''}"><td>${esc(r.browser + ' / ' + r.engine + ' / ' + r.scenario)}</td><td><code>${esc(r.tex)}</code></td><td>${esc(r.errors.join('; ') || 'pass')}</td></tr>`).join('')}</table>${targets.flatMap(browser => ['katex','temml'].flatMap(engine => scenarios.map(s => `<details><summary>${esc(engine + ' / ' + s.name)} — Chromium (left), ${esc(browser)} (right)</summary><img src="chromium-${engine}-${s.name}.png"><img src="${browser}-${engine}-${s.name}.png"></details>`))).join('')}`);
console.log(`${comparisons.length - failures.length}/${comparisons.length} rendering comparisons within tolerance`);
for (const failure of failures) console.log(`[FAILED] ${failure.browser} / ${failure.engine} / ${failure.scenario} / ${failure.fixture}: ${failure.errors.join('; ')}`);
console.log('Parity report: ' + path.join(artifacts, 'report.html'));
if (failures.length && !args.includes('--report-only')) process.exitCode = 1;
