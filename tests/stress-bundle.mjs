// Optional heavy fixture check; deliberately excluded from the normal CI suite.
// node tests/stress-bundle.mjs --dist [--switch-engines] [--chromium|--webkit|--firefox]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepare, APP_DIR, ROOT, args } from './args.mjs';
import { serve } from './chrome.mjs';
import { launchBrowser, testBrowsers } from './browser.mjs';
const stem = args.find(a => a.startsWith('--fixture='))?.split('=')[1] || 'all-modes';
assert(/^[a-z0-9-]+$/.test(stem));
const file = path.join(ROOT, 'tests/stress-fixtures/' + stem + '.diagramtex');
const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(file), stem === 'all-modes' ? 'manifest.json' : stem + '.manifest.json'), 'utf8'));
await prepare();
const server = await serve(APP_DIR);
try {
  for (const browser of testBrowsers()) {
    const b = await launchBrowser(browser, `http://127.0.0.1:${server.port}/`);
    let deadline;
    const timeout = Number(args.find(a => a.startsWith('--timeout='))?.split('=')[1] || 180000);
    assert(Number.isFinite(timeout) && timeout > 0);
    try {
      b.page.setDefaultTimeout(180000);
      await b.page.locator('#fileInput').setInputFiles(file);
      await b.page.waitForFunction(() => TD.app.cmd.files().filter(f => f.name.startsWith('Stress —')).length === 4);
      for (const expected of manifest.files) {
        console.log(browser + ': opening ' + expected.name);
        deadline = setTimeout(() => { console.error(browser + ': timed out opening/switching ' + expected.name); void b.close(); }, timeout);
        const result = await b.page.evaluate(async ({ expected, switchEngines }) => {
          const entry = TD.app.cmd.files().find(f => f.name === expected.name);
          TD.app.cmd.openDoc(entry.id);
          if (expected.name.includes('Diagram (')) TD.app.cmd.setMode('diagram');
          await TD.math.whenReady();
          const d = TD.state.doc;
          const list = d.kind === 'page' ? d.sheet.shapes : d.blocks.filter(b=>b.type==='diagram').flatMap(b=>b.shapes);
          const types = [...new Set(list.map(s=>s.type))].sort();
          if (switchEngines) for (const engine of ['temml','katex']) {
            TD.math.set(engine); await TD.math.whenReady();
            if (document.querySelector('#content .math-pending,#docview .math-pending,#props .math-pending')) throw new Error('Unfinished previews: ' + engine);
          }
          return { name: d.name, mode: TD.state.mode, elements: list.length, types, pagePreviews: document.querySelectorAll('#props .pg-thumb').length, thumbnailHitAreas: document.querySelectorAll('#props .pg-thumb .hitfill').length };
        }, { expected, switchEngines: args.includes('--switch-engines') });
        clearTimeout(deadline);
        assert.equal(result.thumbnailHitAreas, 0, 'Page thumbnails contain no canvas hit-area rectangles');
        if (expected.kind === 'page') assert.equal(result.pagePreviews, manifest.pageCount);
        assert.equal(result.elements, expected.elements, 'No elements dropped during document construction');
        assert.deepEqual(result.types, manifest.coveredTypes);
        console.log(browser + ': ' + JSON.stringify(result));
      }
      assert.deepEqual(b.logs, []);
      assert(!b.warnings.some(w => /damaged shape|Left out/.test(w)), 'No damaged shapes');
    } finally { clearTimeout(deadline); await b.close(); }
  }
} finally { server.close(); }
