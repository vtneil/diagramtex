// Compare the migrated UI to an exported baseline checkout. No golden updates.
// DIAGRAMTEX_BASELINE=/path/to/baseline node tests/migration-ui.mjs [--dist]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { APP_DIR, prepare } from './args.mjs';
import { serve, launch } from './chrome.mjs';

const baseline = process.env.DIAGRAMTEX_BASELINE;
if (!baseline) throw new Error('Set DIAGRAMTEX_BASELINE to the saved starting checkout');
await prepare();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dtx-migration-ui-'));
const blochCases = [
  ['default', null],
  ['no-states', '\\begin{blochsphere}[radius=1cm, ball=none]\n\\drawBall\n\\end{blochsphere}'],
  ['custom', '\\begin{blochsphere}[radius=2cm, tilt=-35, rotation=90, ball=circle, color=blue, statecolor=red]\n\\drawBall\n\\drawStatePolar{q}{25}{30}\n\\node[above] at (q) {$q$};\n\\end{blochsphere}'],
];
const cases = process.env.MIGRATION_TYPES ? process.env.MIGRATION_TYPES.split(',').map(type => [type, null, type]) : blochCases;
const servers = [], browsers = [];
try {
  for (const directory of [path.join(baseline, 'public'), APP_DIR]) {
    const server = await serve(directory); servers.push(server);
    browsers.push(await launch(`http://127.0.0.1:${server.port}/`));
  }
  let count = 0;
  for (const width of [1600, 1024, 820]) for (const theme of ['light', 'dark']) for (const [name, source, type = 'bloch'] of cases) {
    const snapshots = [], pictures = [];
    for (const [index, browser] of browsers.entries()) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      const snapshot = await browser.ev(`
        document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' }));
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        TD.app.newDoc('Migration comparison', null, null, null, null, 'board');
        const random = Math.random; let seed = 12345; Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        const shape = TD.TYPES[${JSON.stringify(type)}].create({ x: 0, y: 0 }, TD.state.defaults, ${JSON.stringify(type)}); shape.id = 'bloch-comparison'; Math.random = random;
        ${source ? `shape.src = ${JSON.stringify(source)};` : ''}
        if (${JSON.stringify(type)} === 'image') Object.assign(shape, {w:80,h:60,file:'example.png',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='});
        TD.state.doc.shapes.push(shape); TD.state.sel = new Set([shape.id]);
        TD.app.render(); TD.app.renderProps(); TD.app.zoomFit();
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const win = document.querySelector('#propsWin');
        const origin = win.getBoundingClientRect();
        const round = n => Math.round(n * 100) / 100;
        const elements = [...win.querySelectorAll('*')].filter(el => !el.classList.contains('seg-thumb'));
        return {
          clip: { x: origin.x, y: origin.y, width: origin.width, height: origin.height },
          elements: elements.map(el => {
            const box = el.getBoundingClientRect(), css = getComputedStyle(el);
            return { tag: el.tagName, class: el.className?.baseVal ?? el.className,
              text: el.children.length || el.tagName === 'TEXTAREA' ? null : el.textContent.trim(),
              value: 'value' in el ? el.value : null, type: el.getAttribute('type'),
              data: Object.fromEntries(Object.entries(el.dataset).filter(([k]) => k !== 'tip')),
              box: [box.x - origin.x, box.y - origin.y, box.width, box.height].map(round),
              style: [css.fontFamily, css.fontSize, css.fontWeight, css.color, css.backgroundColor, css.borderRadius],
            };
          }),
          source: TD.projectFiles.stringify(TD.state.doc),
          // Image export was intentionally fixed after the migration. Its emitted
          // LaTeX is checked by 83-image-export.js; compare the original UI here.
          tikz: ${JSON.stringify(type)} === 'image' ? null : TD.toTikz([shape]),
        };
      `);
      const png = await browser.send('Page.captureScreenshot', { format: 'png', clip: { ...snapshot.clip, scale: 1 } });
      const picture = Buffer.from(png.result.data, 'base64');
      fs.writeFileSync(path.join(output, `${width}-${theme}-${name}-${index ? 'migrated' : 'baseline'}.png`), picture);
      snapshots.push(snapshot); pictures.push(picture);
    }
    const label = `${width}px ${theme} ${name}`;
    try { assert.deepEqual(snapshots[1], snapshots[0], label); }
    catch (error) {
      fs.writeFileSync(path.join(output, 'baseline.json'), JSON.stringify(snapshots[0], null, 2));
      fs.writeFileSync(path.join(output, 'migrated.json'), JSON.stringify(snapshots[1], null, 2));
      throw new Error(label + ': layout differs; see ' + output + '\n' + error.message.slice(0, 1800));
    }
    assert.ok(pictures[0].equals(pictures[1]), `${label}: screenshot differs (see ${output})`);
    console.log('[PASSED] ' + label + ': matching layout, controls, source, TikZ and pixels'); count++;
  }
  for (const browser of browsers) assert.deepEqual(browser.logs, []);
  console.log(`${count} comparisons passed; screenshots: ${output}`);
} finally {
  browsers.forEach(b => b.close()); servers.forEach(s => s.close());
}
