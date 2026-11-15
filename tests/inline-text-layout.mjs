// An app-independent reproduction of mixed-inline text quantization. No math
// engine, application CSS, foreignObject, Blob resource or transition is used.
// --report-only records the known WebKit failure without failing the command.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-inline-layout-'));
fs.copyFileSync(new URL('../public/vendor/katex/fonts/KaTeX_Main-Regular.woff2', import.meta.url), path.join(artifacts, 'font.woff2'));
fs.writeFileSync(path.join(artifacts, 'reproduction.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inline text layout reproduction</title>
<style>
@font-face{font-family:TestFace;src:url(font.woff2)}
body{margin:0;background:white;color:black}#rows{position:absolute;left:12px;top:12px;transform:scale(4);transform-origin:top left}
.row{font:14.06px/1.2 TestFace;white-space:pre-wrap;width:231px;height:28px}
.spacer{display:inline-block;height:16px}
</style><div id="rows"></div><script>
for(let i=0;i<=16;i++){
 const row=document.createElement('div');row.className='row';row.dataset.offset=i/16;
 row.innerHTML='<span class="spacer" style="width:'+(90+i/16)+'px"></span> permutes row';
 document.querySelector('#rows').append(row);
}
</script>`);
const server = await serve(new URL('../public', import.meta.url).pathname, { '/__inline/': artifacts });
const reports = [];
try {
  for (const name of testBrowsers()) {
    const browser = await launchBrowser(name, `http://127.0.0.1:${server.port}/`);
    try {
      await browser.page.goto(`http://127.0.0.1:${server.port}/__inline/reproduction.html`);
      await browser.page.evaluate(async () => { await document.fonts.load('14.06px TestFace'); await document.fonts.ready; });
      const samples = await browser.page.evaluate(() => [...document.querySelectorAll('.row')].map(row => {
        const node = row.lastChild, range = document.createRange();
        range.setStart(node, 1); range.setEnd(node, 9);
        return { offset: +row.dataset.offset, width: range.getBoundingClientRect().width / 4 };
      }));
      await browser.page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: true });
      const widths = samples.map(row => row.width), spread = Math.max(...widths) - Math.min(...widths);
      reports.push({ browser: name, samples, spread });
      assert.deepEqual(browser.logs, [], name + ': no runtime errors');
      console.log(`${name}: identical word widths ${[...new Set(widths)].join(', ')} CSS px; spread ${spread}px`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
fs.writeFileSync(path.join(artifacts, 'measurements.json'), JSON.stringify(reports, null, 2));
console.log('Standalone reproduction, font, screenshots and measurements: ' + artifacts);
if (!process.argv.includes('--report-only')) assert(reports.every(report => report.spread <= .05), 'Identical text changes width with preceding inline geometry; see ' + artifacts);
