// Real input is essential: HTMLElement.click() skips Safari's mouse focus behaviour.
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { waitForAppReady, reloadApp, STARTUP_TIMEOUT } from './browser.mjs';

export async function runBrowserUI(page, filter = '') {
  const results = [];
  async function test(name, fn) {
    name = 'Browser UI: ' + name;
    if (filter && !name.includes(filter)) return;
    const start = Date.now(), result = { name, err: null, goldens: [], tex: [] };
    try { await fn(); } catch (error) { result.err = error.stack; }
    result.ms = Date.now() - start; results.push(result);
  }
  async function language(value) {
    await page.locator('#languageTrigger').click();
    await page.locator(`[data-language="${value}"]`).click();
    await page.waitForFunction(value => document.documentElement.lang === value, value);
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    assert.equal(await page.locator('#languageTrigger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('diagramtex.language')), value);
  }
  await test('language selection with mouse, persistence and both themes', async () => {
    const original = await page.evaluate(() => TD.app.projectJson(TD.state.doc));
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-theme-pick="${theme}"]`).click();
      await language('th');
      assert.equal((await page.locator('#btnExport').textContent()).trim(), 'ส่งออก');
      assert.equal(await page.evaluate(() => TD.app.projectJson(TD.state.doc)), original, 'language preserves project');
      await reloadApp(page);
      assert.equal(await page.locator('html').getAttribute('lang'), 'th', 'choice survives reload');
      await language('en');
      assert.equal((await page.locator('#btnExport').textContent()).trim(), 'Export');
    }
    await page.locator('[data-theme-pick="system"]').click();
  });
  await test('language selection with keyboard and outside dismissal', async () => {
    const trigger = page.locator('#languageTrigger');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.language), 'th');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.lang === 'th');
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'languageTrigger');
    await trigger.click();
    await page.locator('.brand').click();
    assert.equal(await page.locator('#languagePicker').getAttribute('open'), null);
    await language('en');
  });
  await test('real document and diagram controls stay usable', async () => {
    await page.evaluate(() => TD.app.newDoc('Browser UI scratch', null, null, null, null, 'classic'));
    await page.locator('#classicSeg [data-mode="document"]').click();
    await page.waitForFunction(() => TD.state.mode === 'document');
    await page.locator('#docName').fill('Browser UI renamed');
    await page.locator('#docName').press('Enter');
    await page.waitForFunction(() => document.querySelector('#docview .doc-title')?.textContent === 'Browser UI renamed');
    await page.locator('#classicSeg [data-mode="diagram"]').click();
    await page.waitForFunction(() => TD.state.mode === 'diagram');
    await page.locator('#engineBox [data-engine="temml"]').click();
    assert.equal(await page.evaluate(() => TD.math.engine), 'temml');
    await page.locator('#engineBox [data-engine="katex"]').click();
    assert.equal(await page.evaluate(() => TD.math.engine), 'katex');
  });
  await test('Document text toolbar is pinned to the view and shown only while editing text in place', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Compact document editor', null, null,
        [{ type: 'text', text: 'Compact text with $x^2$.' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    await page.locator('#docview [data-zoom="1"]').click();
    const strip = page.locator('#docview .doc-fmt'), bar = strip.locator('.tb-bar'), editor = page.locator('#docview .blk-ie');
    const text = () => page.evaluate(() => TD.state.doc.blocks[0].text);
    const select = (from, to) => editor.evaluate((ed, [a, z]) => { ed.focus(); const t = ed.querySelector('p').firstChild; const r = document.createRange(); r.setStart(t, a); r.setEnd(t, z); getSelection().removeAllRanges(); getSelection().addRange(r); }, [from, to]);
    const pageTop = () => page.evaluate(() => document.querySelector('#docview .doc-page').getBoundingClientRect().top);
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'hidden', 'no toolbar until a text block is edited');
    const top0 = await pageTop();
    await page.locator('#docview .blk-text .blk-body').click();
    await editor.waitFor();
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'visible', 'editing text shows the toolbar');
    assert.equal(await pageTop(), top0, 'showing the toolbar does not move the page');
    const source = await text();
    assert.equal(await editor.locator('.ie-m').count(), 1, 'the formula shows as maths while editing');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('blk-ie')), true, 'the block is edited where it is');
    const metrics = await bar.evaluate(element => ({
      top: element.getBoundingClientRect().top - document.querySelector('#docview').getBoundingClientRect().top,
      tops: [...element.children].map(e => Math.round(e.getBoundingClientRect().top)),
      fits: element.scrollWidth <= element.clientWidth,
    }));
    assert(metrics.top <= 8, 'the toolbar sits at the top of the view');
    assert(Math.max(...metrics.tops) - Math.min(...metrics.tops) <= 1, 'controls share one row');
    assert(metrics.fits, 'the toolbar fits on one line at 1400px');
    await select(0, 7);
    await bar.locator('[data-fmt="b"]').click();
    assert((await text()).startsWith('\\textbf{Compact}'), 'bold writes \\textbf into the source');
    assert.equal(await editor.locator('b').count(), 1, 'and shows the text bold');
    await bar.locator('[data-fal][data-v="r"]').click();
    assert.equal(await page.evaluate(() => TD.state.doc.blocks[0].align), 'right', 'the alignment switch aligns the block');
    assert.equal(await bar.locator('[data-fal].on').getAttribute('data-v'), 'r');
    assert((await text()).includes(source.slice(7)), 'formatting retains the rest of the text');
    await editor.evaluate(ed => { ed.focus(); const t = ed.querySelector('p b').nextSibling; const r = document.createRange(); r.setStart(t, 1); r.setEnd(t, 5); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await bar.locator('[data-fapply="color"]').click();
    assert((await text()).includes('\\textcolor{'), 'the colour button applies the last colour at once');
    assert.equal(await page.evaluate(() => TD.colorPickerOpen()), false, 'without the picker');
    await bar.locator('[data-fpick="color"]').click();
    await page.locator('.cp .cp-edit').waitFor();
    assert(await page.locator('.cp .cp-edit').isVisible(), "the arrow opens the app's own palette, with its editable presets");
    await page.keyboard.press('Escape');
    assert(await bar.locator('.tb-math').count(), 'inline maths shows a maths italic x');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#docview .blk-ie'));
    assert.equal(await strip.evaluate(e => getComputedStyle(e).visibility), 'hidden', 'leaving the text hides the toolbar');
    assert.equal(await pageTop(), top0, 'hiding the toolbar does not move the page');
  });
  await test('Document text is edited in place and written back as its LaTeX source', async () => {
    const SRC = '# Intro\n\nSome \\textbf{bold}, $x^2$, ``quotes\'\' -- \\LaTeX{} and \\foo{bar}.\n\n- one\n  - nested\n- [ ] task\n\n$$\\int_0^1 f$$\n\nLast.';
    await page.evaluate((text) => {
      TD.app.newDoc('Inline editor', null, null, [{ type: 'text', text }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    }, SRC);
    const editor = page.locator('#docview .blk-ie'), text = () => page.evaluate(() => TD.state.doc.blocks[0].text);
    const geo = () => page.evaluate(() => { const r = document.querySelector('#docview .blk[data-i="0"] .blk-body').getBoundingClientRect(); return [r.top, r.height]; });
    const before = await geo();
    await page.locator('#docview .blk-text p').last().click();
    await editor.waitFor();
    assert.deepEqual(await geo(), before, 'the editor lays the text out as the page does');
    await editor.evaluate(ed => { const p = [...ed.querySelectorAll(':scope > p')].pop(); const r = document.createRange(); r.setStart(p.firstChild, p.firstChild.nodeValue.length); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    assert.equal(await text(), SRC, 'opening the editor keeps the source exactly');
    await page.keyboard.type(' Then $y$ ok');
    assert((await text()).endsWith('Last. Then $y$ ok'), 'a closing $ turns the formula into maths');
    assert.equal(await editor.locator('p:last-child .ie-m').count(), 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item');
    await page.keyboard.press('Enter');
    await page.keyboard.type('sub');
    await page.keyboard.press('Tab');
    assert((await text()).endsWith('\n\n- item\n  - sub'), '"- " starts a list, Enter adds an item and Tab nests it');
    await page.keyboard.press('ControlOrMeta+z');
    assert(!(await text()).includes('  - sub'), 'undo takes back the last step');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert((await text()).endsWith('  - sub'), 'redo puts it back');
    assert((await text()).startsWith(SRC), 'what was not edited keeps its source');
    await editor.locator('.cbx').click();
    assert((await text()).includes('- [x] task'), 'a checkbox ticks in place');
    await editor.locator('.ie-m').first().click();
    const box = page.locator('#docPop .td-pop-ta:not(.leaving)');
    await box.waitFor();
    await box.fill('a+b');
    await box.press('Enter');
    assert((await text()).includes('$a+b$'), 'a formula opens in a box and its edit is written back');
    await page.locator('#docview .doc-fmt [data-fmt="src"]').click();
    assert.equal(await page.locator('#docview .blk-ed').inputValue(), await text(), 'the source button shows the LaTeX');
    await page.locator('#docview .doc-fmt [data-fmt="src"]').click();
    await editor.waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#docview .blk-ie'));
  });
  await test('Document display maths typed as \\[…\\] or an environment is maths, and an edit elsewhere keeps it', async () => {
    const SRC = 'Intro.\n\n\\[ a_1^2 + b_2 \\]\n\n\\begin{align} x^2 &= 1 \\\\ y &= 2 \\end{align}\n\nText $$x_1^2$$ more\n\nLine one\\\\[2pt] two.';
    await page.evaluate((text) => {
      TD.app.newDoc('Display maths', null, null, [{ type: 'text', text }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    }, SRC);
    const editor = page.locator('#docview .blk-ie'), text = () => page.evaluate(() => TD.state.doc.blocks[0].text);
    assert.equal(await page.locator('#docview .blk-text .dmath').count(), 3, '\\[…\\], align and $$…$$ are drawn as display maths');
    assert(!(await page.locator('#docview .blk-text').textContent()).includes('[2pt]'), 'a line break\'s spacing is not shown as text');
    await page.locator('#docview .blk-text p').first().click();
    await editor.waitFor();
    await editor.evaluate(ed => { const p = ed.querySelector(':scope > p'); const r = document.createRange(); r.setStart(p.firstChild, p.firstChild.nodeValue.length); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await page.keyboard.type('!');
    assert.equal(await text(), SRC.replace('Intro.', 'Intro.!').replace('Text $$x_1^2$$ more', () => 'Text\n$$x_1^2$$\nmore'),
      'the displays keep their source, stay in their paragraph, and the line break keeps its spacing');
    const tex = await page.evaluate(() => TD.docview.textToLatex(TD.state.doc.blocks[0].text));
    assert(tex.includes('\\[\n  a_1^2 + b_2\n\\]') && tex.includes('\\begin{align} x^2 &= 1 \\\\ y &= 2 \\end{align}') && !tex.includes('\\&'), 'exported as display maths, the environment as written');
    await editor.locator('.dmath.ie-d').first().click();
    const box = page.locator('#docPop .td-pop-ta:not(.leaving)');
    await box.waitFor();
    // a click in the box (on its maths colouring) moves the caret there and keeps the box open
    await page.locator('#docPop .tx-hl').waitFor();
    const bb = await box.boundingBox();
    await page.mouse.click(bb.x + 16, bb.y + 18);
    assert.equal(await box.count(), 1, 'clicking in the formula box keeps it open');
    assert.equal(await box.evaluate(t => document.activeElement === t && t.selectionStart < t.value.length), true, 'and puts the caret where it was clicked');
    await box.fill('a+b');
    await box.press('Enter');
    assert((await text()).includes('\\[ a+b \\]'), 'an edited \\[…\\] is written back as \\[…\\]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#docview .blk-ie'));
  });
  await test('Page: a new paper or orientation keeps every object on its page, and is one undo step', async () => {
    await page.evaluate(() => {
      const P = TD.PX_PER_CM, top2 = (29.7 + 1) * P; // page 2 of A4 starts a page and a 1 cm gap down
      const r = { id: 'pr', type: 'rect', x: 4.5 * P, y: top2 + 3.3 * P, w: 6 * P, h: 2.25 * P, stroke: '#000000', width: 1, fill: null };
      TD.app.newDoc('Paper change', null, null, null, { paper: 'a4' }, 'page', { pages: 2, shapes: [r] });
    });
    // how far below the top of its page the rectangle is, in cm
    const below = () => page.evaluate(() => { const s = TD.state.doc.shapes[0], G = TD.pageSize(TD.state.doc.page); return +(s.y / TD.PX_PER_CM - (G.H + 1)).toFixed(3); });
    const paper = page.locator('#props select:has(option[value="a5"])').first();
    assert.equal(await below(), 3.3);
    await paper.selectOption('a5');
    assert.equal(await below(), 3.3, 'A5: the rectangle stays 3.3 cm down page 2');
    await page.locator('#props [data-ppo="landscape"]').click();
    assert.equal(await below(), 3.3, 'and in landscape');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ControlOrMeta+z');
    assert.equal(await page.evaluate(() => TD.pageSize(TD.state.doc.page).orient), 'portrait', 'undo takes back the orientation');
    await page.keyboard.press('ControlOrMeta+z');
    assert.equal(await page.evaluate(() => TD.state.doc.page.paper), 'a4', 'then the paper');
    assert.equal(await below(), 3.3);
    assert.equal(await page.evaluate(() => TD.state.doc.shapes.length), 1, 'and nothing drawn is undone with it');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert.equal(await page.evaluate(() => TD.state.doc.page.paper), 'a5', 'redo puts the paper back');
  });
  await test('Block editors keep % comments through edits made in the drawing, undo and Done', async () => {
    const open = (type, edit) => page.evaluate(({ type, edit }) => {
      TD.app.newDoc('Comments ' + type, null, null, null, null, 'board');
      const shape = TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults);
      if (edit) shape.src = shape.src.replace(/\n/, '\n% keep me\n');
      window.__block = shape; window.__saved = null;
      TD.blocks.get(type).editor.get().open(shape, (r) => { window.__saved = r; });
    }, { type, edit });
    const editor = () => page.locator('.modal:not([hidden])');
    const code = () => editor().locator('.cz-code textarea').inputValue();
    const done = async () => { await editor().locator('.modal-head button.primary').click(); return page.evaluate(() => window.__saved); };
    // Quantum: a wire added at the bottom, undone and redone
    await open('qc', true);
    assert.match(await code(), /\\begin\{quantikz\}\n% keep me\n/, 'the comment shows when the editor opens');
    await editor().locator('[data-qe="addrow"]').click();
    assert.equal((await code()).split('\n').length, 6, 'the wire is added');
    assert.match(await code(), /% keep me/, 'and the comment stays');
    await page.keyboard.press('ControlOrMeta+z');
    assert.match(await code(), /% keep me/, 'undo keeps it');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    assert.match((await done()).src, /\\begin\{quantikz\}\n% keep me\n/, 'and Done saves it');
    // tikz-cd: a label typed on the drawing
    await open('cd', true);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('Q');
    await page.keyboard.press('Enter');
    assert.match((await done()).src, /% keep me\n {2}Q /);
    // Circuit: comments typed in the code, then a part nudged; they go with their statements and come back on reopening
    await open('cz', false);
    const ta = editor().locator('.cz-code textarea'), lines = (await code()).split('\n');
    await ta.fill(['% the source', lines[0] + ' % source note', ...lines.slice(1), '% the end'].join('\n'));
    await ta.blur();
    await editor().locator('svg [data-id]').first().click();
    await page.keyboard.press('ArrowRight');
    const nudged = await code();
    assert.notEqual(nudged.split('\n')[1], lines[0], 'the part moved');
    assert.match(nudged, /^% the source\n\\draw [^\n]+; % source note\n[^]*\n% the end$/);
    assert.equal(await editor().locator('.cz-msg').textContent(), '', 'comment lines are not "lines that can\'t be drawn"');
    const saved = await done();
    await page.evaluate((r) => { Object.assign(window.__block, r); TD.blocks.get('cz').editor.get().open(window.__block, () => {}); }, saved);
    assert.equal(await code(), nudged, 'reopened, the code is as it was left');
    await editor().locator('.modal-head button.primary').click();
  });
  await test('Properties: a typed number stays in its field, and the arrow keys step on from it', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Typed numbers', [{ id: 'r', type: 'rect', x: 100, y: 100, w: 120, h: 80, stroke: '#000000', width: 1, fill: null, radius: 0 }], null, null, null, 'board');
      TD.state.sel = new Set(['r']); TD.app.render(); TD.app.renderProps();
    });
    for (const [id, key] of [['#f-width', 'width'], ['#f-radius', 'radius'], ['#f-angle', 'angle']]) {
      const field = page.locator(id);
      await field.click(); await field.fill('6'); await page.keyboard.press('Enter');
      assert.equal(await field.inputValue(), '6', `${key}: the field shows what was typed`);
      await field.click(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Tab');
      const now = await page.evaluate((k) => TD.state.doc.shapes[0][k], key);
      assert.ok(now > 6, `${key}: ↑ steps up from 6 (${now})`);
      assert.equal(await field.inputValue(), String(now), `${key}: and shows it`);
    }
  });
  await test('Fill bucket: an empty bucket never clears the selection, and it fills with its own colour, not Default style\'s', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Bucket', [{ id: 'r', type: 'rect', x: 100, y: 100, w: 120, h: 80, stroke: '#000000', width: 1, fill: '#0000ff' }, { id: 'q', type: 'rect', x: 300, y: 100, w: 120, h: 80, stroke: '#000000', width: 1, fill: null }], null, null, null, 'board');
      TD.state.defaults.fill = null; TD.app.setBucketFill(null);
      TD.state.sel = new Set(['r']); TD.app.render(); TD.app.renderProps();
    });
    await page.locator('#stage').hover();
    await page.keyboard.press('k');
    assert.equal(await page.evaluate(() => TD.state.tool), 'bucket');
    assert.equal(await page.evaluate(() => TD.state.doc.shapes[0].fill), '#0000ff', 'the selected shape keeps its fill');
    await page.evaluate(() => { TD.app.setBucketFill('#cfe2f3'); TD.state.sel = new Set(); TD.app.render(); });
    assert.equal(await page.locator('#props .sec[data-target]').getAttribute('data-target'), 'bucket', 'the panel sets the bucket, not Default style');
    const box = await page.locator('[data-id="q"]').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const fill = await page.evaluate(() => TD.state.doc.shapes[1].fill);
    assert.equal(fill, '#cfe2f3', 'a click fills with the bucket\'s colour');
    assert.equal(await page.evaluate(() => TD.state.defaults.fill), null, 'new shapes still have no fill');
    await page.keyboard.press('v');
  });
  await test("New shapes' points snap to outlines, not the outside of the stroke: identical shapes drawn in turn stay identical", async () => {
    await page.evaluate(() => { TD.app.newDoc('Snap drift', [], null, null, null, 'board'); Object.assign(TD.state.view, { x: 0, y: 0, zoom: 1 }); TD.state.snap = true; TD.state.snapMode = 'objects'; TD.state.defaults.width = 4; TD.app.render(); });
    const at = (x, y) => page.evaluate(({ x, y }) => { const r = document.querySelector('#canvas').getBoundingClientRect(), v = TD.state.view; return { x: r.left + (x - v.x) * v.zoom, y: r.top + (y - v.y) * v.zoom }; }, { x, y });
    const drag = async (x1, y1, x2, y2) => { const a = await at(x1, y1), b = await at(x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); };
    await page.locator('#stage').hover();
    for (let i = 0; i < 4; i++) { await page.keyboard.press('r'); await drag(100, 100 + i * 100, 300, 160 + i * 100); }
    const rects = await page.evaluate(() => TD.state.doc.shapes.map((s) => [s.x, s.w]));
    assert.deepEqual(rects, [[100, 200], [100, 200], [100, 200], [100, 200]], 'each starts where the one above does');
    await page.evaluate(() => { TD.state.defaults.width = 1; });
    await page.keyboard.press('v');
  });
  await test('A dropdown picked with the mouse lets the next letter be a tool shortcut, not a search of its list', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Picker keys', [{ id: 'r', type: 'rect', x: 100, y: 100, w: 120, h: 80, stroke: '#000000', width: 1, fill: null, dash: 'solid' }], null, null, null, 'board');
      TD.state.sel = new Set(['r']); TD.app.render(); TD.app.renderProps();
    });
    await page.locator('#props select[data-key="dash"]').first().click();
    await page.locator('.selmenu .selmenu-item', { hasText: /^Dashed$/ }).first().click();
    assert.equal(await page.evaluate(() => TD.state.doc.shapes[0].dash), 'dashed');
    await page.keyboard.press('l');
    assert.equal(await page.evaluate(() => TD.state.doc.shapes[0].dash), 'dashed', 'L does not pick "Long dashes"');
    assert.equal(await page.evaluate(() => TD.state.tool), 'line', 'it chooses the Line tool');
    await page.keyboard.press('v');
  });
  await test('Table: a cell still being typed into is kept when the page is reloaded', async () => {
    await page.evaluate(async () => {
      const W = TD.tableWs; TD.app.cmd.setTable(true); await new Promise((r) => setTimeout(r, 100));
      W.autoMath = false; W.importText('a,b\n1,2'); document.querySelector('.tb-gridwrap').focus(); W.select([1, 1]);
    });
    await page.keyboard.type('5.55');
    assert.equal(await page.locator('.tb-edit').inputValue(), '5.55', 'the cell is being typed into');
    await reloadApp(page);
    assert.equal(await page.evaluate(() => TD.tableWs.model.cells[1][1].t), '5.55');
    await page.evaluate(() => { TD.tableWs.autoMath = true; TD.app.cmd.setTable(false); });
  });
  await test('Table: Tab moves along a row and then out of the grid, from a cell or from its editor', async () => {
    await page.evaluate(async () => {
      const W = TD.tableWs; TD.app.cmd.setTable(true); await new Promise((r) => setTimeout(r, 100));
      W.importText('a,b\n1,2'); document.querySelector('.tb-gridwrap').focus(); W.select([0, 0]);
    });
    const inGrid = () => page.evaluate(() => document.activeElement === document.querySelector('.tb-gridwrap'));
    const out = async (n) => { for (let i = 0; i < n && await page.evaluate(() => !!document.activeElement.closest('.tb-gridwrap')); i++) await page.keyboard.press('Tab'); return page.evaluate(() => !document.activeElement.closest('.tb-gridwrap')); };
    await page.keyboard.press('Tab');
    assert.ok(await inGrid() && (await page.evaluate(() => TD.tableWs.range().c0)) === 1, 'Tab moves to the next cell');
    assert.ok(await out(4), 'then, past the row\'s end, out of the grid');
    await page.locator('.tb-gridwrap').focus(); await page.evaluate(() => TD.tableWs.select([0, 0]));
    await page.keyboard.press('Shift+Tab');
    assert.ok(!(await page.evaluate(() => !!document.activeElement.closest('.tb-gridwrap'))), 'Shift+Tab at a row\'s start leaves it backwards');
    await page.locator('.tb-gridwrap').focus(); await page.evaluate(() => TD.tableWs.select([1, 1]));
    await page.keyboard.type('7'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => TD.tableWs.model.cells[1][1].t), '7', 'Tab keeps the cell typed into');
    assert.ok(await out(4), 'and goes on out of the grid');
    await page.evaluate(() => TD.app.cmd.setTable(false));
  });
  await test('Quick: a formula wider than its box can be scrolled to its start; a short one is centred', async () => {
    await page.locator('#kindSeg button', { hasText: 'Quick' }).first().click();
    const input = page.locator('#quickView textarea, .qk-input textarea, [class*=qk] textarea').first();
    const box = () => page.evaluate(() => { const s = document.querySelector('.qk-stage'), a = s.getBoundingClientRect(), b = s.firstElementChild.getBoundingClientRect(); return { left: b.left - a.left + s.scrollLeft, right: a.right - b.right, wide: s.scrollWidth > s.clientWidth }; });
    await input.fill('START + ' + Array.from({ length: 60 }, (_, i) => `a_{${i}}`).join(' + ') + ' + END');
    await page.waitForFunction(() => { const s = document.querySelector('.qk-stage'); return s && s.scrollWidth > s.clientWidth; });
    const wide = await box();
    assert.ok(wide.left >= 0 && wide.left < 40, `its start is inside the scrollable box (${wide.left})`);
    await input.fill('x^2');
    await page.waitForFunction(() => { const s = document.querySelector('.qk-stage'); return s && s.scrollWidth <= s.clientWidth; });
    const small = await box();
    assert.ok(Math.abs(small.left - small.right) < 2, 'centred');
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
  });
  await test('Quick: Copy PNG on a broken formula keeps saying what is wrong with it', async () => {
    await page.locator('#kindSeg button', { hasText: 'Quick' }).first().click();
    const input = page.locator('#quickView textarea, .qk-input textarea, [class*=qk] textarea').first();
    await input.fill('\\frac{1}{');
    await page.waitForFunction(() => document.querySelector('.qk-msg')?.classList.contains('err'));
    const why = await page.locator('.qk-msg').textContent();
    await page.locator('[data-q="png"]').first().click();
    const now = await page.locator('.qk-msg').textContent();
    assert.ok(now.includes(why) && /Fix the formula first/.test(now), `the error stays in the message: "${now}" (was "${why}")`);
    await input.fill('x^2');
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
  });
  await test('Whiteboard: Fit brings objects far apart into view, as far out as zooming by hand goes', async () => {
    await page.locator('#kindSeg button', { hasText: 'Whiteboard' }).first().click();
    const seen = await page.evaluate(() => {
      const P = TD.PX_PER_CM, d = { stroke: '#000000', fill: null, width: 1 };
      const a = { ...TD.TYPES.rect.create({ x: 4 * P, y: 4 * P }, d), id: 'far-a', w: 2 * P, h: P };
      const b = { ...TD.TYPES.rect.create({ x: 500 * P, y: 300 * P }, d), id: 'far-b', w: 2 * P, h: P };
      TD.app.newDoc('Far apart', [a, b], null, null, null, 'board');
      TD.app.zoomFit();
      const st = document.querySelector('#stage').getBoundingClientRect();
      return ['far-a', 'far-b'].map((id) => { const q = document.querySelector(`[data-id="${id}"]`).getBoundingClientRect(); return q.left >= st.left && q.right <= st.right && q.top >= st.top && q.bottom <= st.bottom; });
    });
    assert.deepEqual(seen, [true, true], 'both in view');
    assert.ok(await page.evaluate(() => TD.state.view.zoom >= 0.03 && TD.state.view.zoom < 0.1));
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
  });
  await test('Page setup refuses margins or a paper size that leave no room for text', async () => {
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    await page.evaluate(() => { TD.app.newDoc('No room', null, null, [{ type: 'text', text: 'Hello.' }, { type: 'diagram', shapes: [] }], { paper: 'a4' }, 'classic'); TD.app.setMode('document'); });
    const field = (k) => page.locator(`#props [data-pg="${k}"]`).first();
    const set = async (k, v) => { await field(k).fill(v); await field(k).press('Enter'); };
    await set('ml', '15');
    await set('mr', '10');
    assert.deepEqual(await page.evaluate(() => [TD.state.doc.page.ml, TD.state.doc.page.mr]), [15, 2.5], 'the right margin that would leave −4 cm is refused');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForFunction(() => document.querySelector('#props [data-pg="mr"]').value === '2.5'); // and its field goes back once left
    assert.ok(await page.evaluate(() => TD.pageSize(TD.state.doc.page).textW > 0));
    await page.locator('#props select[data-pg="paper"]').first().selectOption('custom');
    await set('w', '0');
    assert.ok(await page.evaluate(() => TD.pageSize(TD.state.doc.page).W > 0), 'a paper 0 cm wide is refused');
  });
  await test('Document: "Diagram 1 of N" follows a diagram added on the page', async () => {
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    await page.evaluate(() => { TD.app.newDoc('Diagram count', null, null, [{ type: 'text', text: 'Hello.' }, { type: 'diagram', shapes: [] }], null, 'classic'); TD.app.setMode('document'); });
    const sel = () => page.evaluate(() => [document.querySelector('#blockSel').textContent, document.querySelector('#blockNext').disabled]);
    assert.deepEqual(await sel(), ['Diagram 1 of 1', true]);
    await page.locator('#docview .doc-page > .ins:last-child [data-add="diagram"]').click();
    assert.deepEqual(await sel(), ['Diagram 1 of 2', false], 'the count and Next follow at once');
  });
  await test('Block editors: Ctrl/⌘+Enter is Done while a palette item has focus', async () => {
    await page.evaluate(() => TD.app.newDoc('Done from the palette', null, null, null, null, 'board'));
    const types = await page.evaluate(() => [...TD.blocks.entries()].filter(([t, d]) => d.editor && t !== 'table').map(([t]) => t));
    assert.ok(types.length >= 15);
    for (const ty of types) {
      await page.evaluate((ty) => {
        window.__saved = null;
        TD.blocks.get(ty).editor.get().open(TD.TYPES[ty].create({ x: 0, y: 0 }, TD.state.defaults), (r) => { window.__saved = r; });
      }, ty);
      const box = page.locator('.modal:not([hidden])'), ta = box.locator('.cz-code textarea');
      await ta.fill((await ta.inputValue()) + '\n% kept');
      await ta.blur();
      await box.locator('.qe-item, .cz-part').first().focus(); // as clicking or dragging one leaves it
      await page.keyboard.press('ControlOrMeta+Enter');
      await page.waitForFunction(() => !document.querySelector('.modal:not([hidden])'), null, { timeout: 2000 }).catch(() => {});
      const r = await page.evaluate(() => [JSON.stringify(window.__saved || '').includes('% kept'), !document.querySelector('.modal:not([hidden])')]);
      assert.deepEqual(r, [true, true], `${ty}: saved and closed`);
    }
  });
  await test('2D Geometry: a dragged point lands under the pointer, however fast the drag', async () => {
    await page.evaluate(() => TD.app.newDoc('Geometry drag', null, null, null, null, 'board'));
    const drag = async (steps) => {
      await page.evaluate(() => TD.blocks.get('geo2d').editor.get().open(TD.TYPES.geo2d.create({ x: 0, y: 0 }, TD.state.defaults), () => {}, { flat: true }));
      const box = page.locator('.modal:not([hidden])');
      const b = await box.locator('.cz-stage svg .g3-pt').first().boundingBox(); // P, at (0,0)
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 90, y - 40, { steps }); await page.mouse.up();
      const line = (await box.locator('.cz-code textarea').inputValue()).split('\n').find((l) => l.includes('coordinate (P)'));
      await box.locator('[data-act="cancel"], .modal-head button', { hasText: 'Cancel' }).first().click();
      if (await page.locator('.td-dialog').count()) await page.locator('.td-dialog button', { hasText: /Discard/ }).first().click();
      await page.waitForFunction(() => !document.querySelector('.modal:not([hidden])'));
      return line.trim();
    };
    const fast = await drag(1), slow = await drag(10);
    assert.notEqual(fast, '\\coordinate (P) at (0,0);', 'it moved');
    assert.equal(fast, slow, 'one quick move lands where ten small ones do');
  });
  await test('Circuit: nudging a part with the arrow keys keeps it connected, as dragging does', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Circuit nudge', null, null, null, null, 'board');
      window.__saved = null;
      TD.blocks.get('cz').editor.get().open(TD.TYPES.cz.create({ x: 0, y: 0 }, TD.state.defaults), (r) => { window.__saved = r; });
    });
    const box = page.locator('.modal:not([hidden])');
    const ids = await box.locator('.cz-stage svg [data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));
    const v = await box.locator(`.cz-stage svg [data-id="${ids[0]}"]`).boundingBox(), r = await box.locator(`.cz-stage svg [data-id="${ids[1]}"]`).boundingBox();
    await page.mouse.click(r.x + r.width / 2, v.y + 1); // R, on the top wire (level with the source's top end)
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // the second stretches the wires the first added
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForFunction(() => window.__saved);
    const res = await page.evaluate(() => {
      const items = window.__saved.items, k = (p) => p.map((x) => Math.round(x * 1000)).join(','), ends = new Map();
      for (const it of items) for (const p of it.p ? [it.p] : [it.a, it.b]) ends.set(k(p), (ends.get(k(p)) || 0) + 1);
      return { r: items.find((i) => i.part === 'res:iec').a[1], loose: [...ends].filter(([, n]) => n < 2).map(([p]) => p), n: items.length };
    });
    assert.equal(res.r, 2.5, 'R moved up two steps');
    assert.deepEqual(res.loose, [], 'no terminal or wire end is left unconnected');
    assert.equal(res.n, 6, 'two wires join R to the source and the capacitor, not one per press');
  });
  await test('Two tabs on one file: shapes drawn in each within a moment are both kept', async () => {
    const id = await page.evaluate(() => { TD.app.newDoc('Two tabs', null, null, null, null, 'board'); TD.app.saveNow(); return TD.state.docId; });
    const other = await page.context().newPage();
    try {
      await other.goto(page.url());
      await other.waitForFunction(() => window.TD && TD.app && TD.state.docId);
      await other.evaluate((id) => TD.app.cmd.openDoc(id), id);
      await other.waitForFunction((id) => TD.state.docId === id, id);
      const draw = (pg, x) => pg.evaluate((x) => {
        const s = TD.TYPES.rect.create({ x, y: 0 }, TD.state.defaults);
        Object.assign(s, { id: 'tab' + x, w: 40, h: 30 });
        TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit();
      }, x);
      await draw(page, 0);
      await page.waitForTimeout(250); // the first tab has not saved yet (autosave waits 400 ms)
      await draw(other, 100);
      const both = (pg) => pg.waitForFunction(() => TD.state.doc.shapes.map((s) => s.id).sort().join() === 'tab0,tab100', null, { timeout: 4000 });
      await both(other);
      await both(page);
      assert.match(await other.evaluate(() => document.querySelector('#hint').textContent), /added to yours/);
    } finally {
      await other.close();
    }
  });
  await test('Double-clicking inside a box with no fill labels it, and the typing goes into the label', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => {
      TD.app.newDoc('Empty box', null, null, null, null, 'board');
      const s = TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults);
      Object.assign(s, { id: 'box', w: 200, h: 120, fill: 'none' });
      TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit();
    });
    const r = await page.locator('[data-id="box"]').first().boundingBox();
    await page.mouse.dblclick(r.x + r.width / 2, r.y + r.height / 2);
    await page.keyboard.type('ol'); // o and l are the arc and line tools' keys
    const got = await page.evaluate(() => ({ tool: TD.state.tool, text: TD.state.doc.shapes.filter((s) => s.type === 'text').map((s) => s.text) }));
    await page.keyboard.press('Escape');
    assert.deepEqual(got, { tool: 'select', text: ['ol'] });
  });
  await test('Esc during a drag puts back what it changed: a shape being drawn, a move, a resize', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => {
      TD.app.newDoc('Esc drags', null, null, null, null, 'board');
      const s = TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults);
      Object.assign(s, { id: 'r', w: 120, h: 80, fill: '#cfe2f3' });
      TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit(); TD.app.resetHistory();
    });
    const state = () => page.evaluate(() => ({ shapes: TD.state.doc.shapes.map((s) => [s.id, s.x, s.y, s.w, s.h].join()), undo: TD.app.cmd.canUndo() }));
    const start = await state();
    const r = await page.locator('[data-id="r"]').first().boundingBox();
    // a new rectangle, half drawn
    await page.keyboard.press('r');
    await page.mouse.move(r.x + r.width + 60, r.y); await page.mouse.down();
    await page.mouse.move(r.x + r.width + 160, r.y + 90, { steps: 4 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await state(), start, 'the shape being drawn goes');
    // a move
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 90, r.y + r.height / 2 + 40, { steps: 4 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await state(), start, 'the move is undone, with nothing to undo');
    // a resize from the bottom-right handle (the shape is selected now)
    await page.evaluate(() => { TD.state.sel = new Set(['r']); TD.app.render(); });
    const hb = await page.locator('[data-handle][data-hid="r"]').last().boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x + 80, hb.y + 60, { steps: 4 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await state(), start, 'the resize is undone');
  });
  await test('Several objects that differ show "Mixed" in the panel, and a value chosen there sets them all', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Mixed', null, null, null, null, 'board');
      const a = TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults), b = TD.TYPES.rect.create({ x: 200, y: 0 }, TD.state.defaults);
      Object.assign(a, { id: 'a', w: 100, h: 60, stroke: '#cc0000', width: 1, dash: 'solid', fill: 'none' });
      Object.assign(b, { id: 'b', w: 100, h: 60, stroke: '#0000cc', width: 2, dash: 'dashed', fill: 'none' });
      TD.app.begin(); TD.state.doc.shapes.push(a, b); TD.app.commit();
      TD.state.sel = new Set(['a', 'b']); TD.app.render(); TD.app.renderProps();
    });
    const shown = () => page.evaluate(() => {
      const dash = document.querySelector('#props select[data-key="dash"]:not(.attached)'), w = document.querySelector('#props input[data-key="width"]');
      const colour = (k) => document.querySelector(`#props [data-color="${k}"]`).closest('.row').querySelector('.cval').textContent;
      return { stroke: colour('stroke'), fill: colour('fill'), width: w.value || w.placeholder, dash: dash.options[dash.selectedIndex].text };
    });
    const s = await shown();
    assert.deepEqual({ ...s, fill: s.fill !== 'Mixed' }, { stroke: 'Mixed', fill: true, width: 'Mixed', dash: 'Mixed' }, 'what differs says so; what is the same (no fill) shows it');
    await page.locator('#props select[data-key="dash"]:not(.attached)').selectOption('dotted');
    assert.deepEqual(await page.evaluate(() => TD.state.doc.shapes.map((s) => s.dash)), ['dotted', 'dotted']);
    assert.equal((await shown()).dash, 'Dotted');
  });
  await test('The zoom and grid fields: a click selects the value, Enter applies it and gives the keys back to the canvas', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => TD.app.newDoc('Zoom field', null, null, null, null, 'board'));
    await page.waitForTimeout(300); // the new file's view settles first
    for (const [id, typed, want] of [['#zoomVal', '150', '150%'], ['#gridVal', '0.5', /^0[.,]5/]]) {
      await page.locator(id).click();
      await page.keyboard.type(typed); // at once, as a quick typist would
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      const v = await page.locator(id).inputValue();
      assert.ok(typeof want === 'string' ? v === want : want.test(v), `${id} reads ${v}`);
      assert.notEqual(await page.evaluate(() => document.activeElement.id), id.slice(1), `${id} is left`);
    }
    await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => TD.state.tool), 'rect', 'the next key is a shortcut again');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { TD.state.gridCm = 1; });
  });
  await test('Right-click → Paste puts the copy where the right-click was', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => {
      TD.app.newDoc('Paste here', null, null, null, null, 'board');
      const s = TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults);
      Object.assign(s, { id: 'src', w: 80, h: 40 });
      TD.app.begin(); TD.state.doc.shapes.push(s); TD.app.commit();
      TD.state.sel = new Set(['src']); TD.app.render();
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('ControlOrMeta+c');
    const r = await page.locator('[data-id="src"]').first().boundingBox();
    const px = r.x + r.width + 250, py = r.y + 180;
    await page.mouse.click(px, py, { button: 'right' });
    await page.locator('#ctxMenu [data-act="paste"]').click();
    const got = await page.evaluate(([px, py]) => {
      const s = TD.state.doc.shapes.find((q) => q.id !== 'src'), el = document.querySelector(`[data-id="${s.id}"]`).getBoundingClientRect();
      return [el.x + el.width / 2 - px, el.y + el.height / 2 - py];
    }, [px, py]);
    const grid = await page.evaluate(() => TD.GRID * TD.state.view.zoom);
    assert.ok(Math.abs(got[0]) <= grid && Math.abs(got[1]) <= grid, `centred on the right-click, to the grid (off by ${got.map(Math.round)})`);
  });
  await test('Welcome sample: dragging "Done" or the ball brings the arrow and the spring along', async () => {
    await page.evaluate(() => { TD.app.newSample(); TD.app.cmd.setMode('diagram'); });
    await page.waitForTimeout(300);
    const ends =() => page.evaluate(() => {
      const sh = TD.state.doc.shapes, done = sh.find((s) => s.text === 'Done'), ball = sh.find((s) => s.type === 'ball');
      const line = sh.find((s) => s.type === 'line' && s.link2?.id === done.id), spring = sh.find((s) => s.type === 'spring');
      return { done: done.id, ball: ball.id, arrow: line && [line.x2 - (done.x + done.w / 2), line.y2 - done.y], spring: [spring.x1 - (ball.cx + ball.r), spring.y1 - ball.cy] };
    });
    const at = await ends();
    assert.ok(at.arrow, 'the arrow into "Done" is attached to it');
    for (const id of [at.done, at.ball]) {
      const r = await page.locator(`[data-id="${id}"]`).first().boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 + 30, r.y + r.height / 2 + 40, { steps: 5 });
      await page.mouse.up();
    }
    const now = await ends();
    assert.deepEqual(now.arrow.map(Math.round), [0, 0], `the arrow ends on the top of "Done" (off by ${now.arrow})`);
    assert.deepEqual(now.spring.map(Math.round), [0, 0], `the spring starts at the ball (off by ${now.spring})`);
  });
  await test('Circuit: a block opens with its code at the first column, however far the last one was scrolled', async () => {
    const at = await page.evaluate(async () => {
      const ed = TD.blocks.get('cz').editor.get(), wait = () => new Promise((r) => setTimeout(r, 200));
      const code = () => [...document.querySelectorAll('.cz-code textarea')].find((t) => t.offsetParent);
      const block = (id) => ({ id, ...TD.TYPES.cz.create({ x: 0, y: 0 }, TD.state.defaults, 'cz') });
      ed.open(block('cz-a'), () => {}); await wait();
      code().scrollLeft = 1e4; code().scrollTop = 1e4;
      const was = code().scrollLeft;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
      const closed = !code();
      ed.open(block('cz-b'), () => {}); await wait();
      const now = [code().scrollLeft, code().scrollTop];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
      return { was, closed, now };
    });
    assert.ok(at.was > 0 && at.closed, `the code was scrolled (${at.was}) and the editor closed`);
    assert.deepEqual(at.now, [0, 0], 'the next block starts at the first column and line');
  });
  // Esc steps back one thing at a time (a label box, then the selection, then the editor, asking before edits are lost),
  // so a test that leaves a block editor presses it until the editor is gone: one left open takes every later click
  const editorOpen = () => page.evaluate(() => [...document.querySelectorAll('.modal')].some((m) => !m.hidden && m.querySelector('.cz-stage') && m.getBoundingClientRect().width > 0));
  async function closeEditor() {
    for (let i = 0; i < 6 && await editorOpen(); i++) {
      if (await page.locator('.td-dialog').count()) await page.locator('.td-dialog [data-act="ok"], .td-dialog button.danger').first().click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    assert.ok(!(await editorOpen()), 'the block editor closed');
  }
  await test('Graph and Automaton: the label box opens one line high, under the node, not over it', async () => {
    for (const type of ['graph', 'automata']) {
      await page.evaluate((type) => TD.blocks.get(type).editor.get().open({ id: 'lb', ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults, type) }, () => {}), type);
      await page.waitForTimeout(300);
      const lab = await page.evaluate(() => {
        const svg = [...document.querySelectorAll('.cz-stage svg')].find((s) => s.getBoundingClientRect().width > 0);
        const r = svg.querySelector('image.svg-label').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, bottom: r.bottom };
      });
      await page.mouse.click(lab.x, lab.y);
      await page.waitForTimeout(400);
      await page.mouse.dblclick(lab.x, lab.y);
      const pop = page.locator('.text-pop');
      await pop.waitFor();
      const box = await pop.boundingBox();
      assert.ok(box.height <= 48, `${type}: one line high (${box.height}px)`);
      assert.ok(box.y >= lab.bottom, `${type}: below the label (${box.y} vs ${lab.bottom})`);
      await closeEditor();
    }
  });
  await test('Block editors: Enter takes the LaTeX command list\'s choice and closes it (ZX Phase, tikz-cd arrow Label)', async () => {
    for (const [type, key] of [['zx', 'phase'], ['cd', 't']]) {
      await page.evaluate((type) => TD.blocks.get(type).editor.get().open({ id: 'ac', ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults, type) }, () => {}), type);
      await page.waitForTimeout(300);
      const spots = await page.evaluate(() => {
        const svg = [...document.querySelectorAll('.cz-stage svg')].find((s) => s.getBoundingClientRect().width > 0);
        const at = [...svg.querySelectorAll('image.svg-label')].map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        // a node, or (tikz-cd's arrows are picked by their line) halfway between two of them
        return [...at, ...at.flatMap((a, i) => at.slice(i + 1).map((b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))];
      });
      const f = page.locator(`.cz-props [data-f="${key}"]:visible`).first();
      for (const [x, y] of spots) { await page.mouse.click(x, y); await page.waitForTimeout(150); if (await f.count()) break; }
      assert.ok(await f.count(), `${type}: the ${key} field is shown`);
      await f.click();
      await f.fill('');
      await page.keyboard.type('\\alp');
      await page.locator('#texComplete:not([hidden])').waitFor();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      assert.equal(await f.inputValue(), '\\alpha', `${type}: Enter puts the command in`);
      assert.ok(await page.evaluate(() => document.getElementById('texComplete').hidden), `${type}: and closes the list`);
      await closeEditor();
    }
  });
  await test('Touch: a finger held still on an object opens its menu, and the press moves nothing', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    const got = await page.evaluate(async () => {
      const s = TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults);
      Object.assign(s, { id: 'held', x: 200, y: 150, w: 120, h: 60 });
      TD.app.newDoc('Long press', [s], null, null, null, 'board');
      TD.app.resetHistory(); TD.state.sel = new Set(); TD.app.render();
      const svg = document.querySelector('#stage svg, svg#canvas, #canvas'), el = document.querySelector('[data-id="held"]'), r = el.getBoundingClientRect();
      svg.setPointerCapture = () => {}; // a made-up pointer can't be captured
      const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', at));
      el.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: at.clientX + 3 })); // a finger is never quite still
      await new Promise((r) => setTimeout(r, 800));
      const open = !!document.querySelector('#ctxMenu') && !document.querySelector('#ctxMenu').hidden;
      el.dispatchEvent(new PointerEvent('pointerup', at));
      delete svg.setPointerCapture;
      const q = TD.state.doc.shapes[0];
      return { open, sel: [...TD.state.sel], at: [q.x, q.y], undo: TD.app.cmd.canUndo() };
    });
    assert.ok(got.open, 'the menu opens');
    assert.deepEqual(got.sel, ['held'], 'for the object held');
    assert.deepEqual(got.at, [200, 150], 'which stays where it was');
    assert.equal(got.undo, false, 'and nothing is added to undo');
    await page.keyboard.press('Escape');
  });
  await test('Opening a file whose name is taken, or importing .tex as a new document, gives the new file a name of its own', async () => {
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    const json = await page.evaluate(() => {
      const s = { ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults), id: 'tw', w: 40, h: 20 };
      TD.app.newDoc('Twin file', [s]);
      return TD.app.projectJson(TD.state.doc);
    });
    const names = () => page.evaluate(() => TD.app.cmd.files().map((f) => f.name));
    await page.locator('#fileInput').setInputFiles({ name: 'Twin file.diagramtex', mimeType: 'application/json', buffer: Buffer.from(json) });
    await page.waitForFunction(() => TD.app.cmd.files().some((f) => f.name === 'Twin file copy'));
    assert.equal((await names()).filter((n) => n === 'Twin file').length, 1, 'one file keeps the name');
    const tex = '\\documentclass{article}\\usepackage{tikz}\\begin{document}\\begin{tikzpicture}\\draw (0,0) rectangle (1,1);\\end{tikzpicture}\\end{document}';
    for (const want of ['lab notes', 'lab notes copy']) {
      await page.locator('#fileInput').setInputFiles({ name: 'lab notes.tex', mimeType: 'text/x-tex', buffer: Buffer.from(tex) });
      await page.locator('#impNew').click();
      await page.waitForFunction((want) => TD.state.doc.name === want, want);
    }
    assert.ok(!(await names()).includes('Imported'), 'not "Imported"');
  });
  await test('Export: a PNG size the browser can\'t draw is said in the panel, with the DPI that works, before exporting', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => {
      const P = TD.PX_PER_CM, s = { ...TD.TYPES.rect.create({ x: 0, y: 0 }, TD.state.defaults), id: 'big', w: 15 * P, h: 12 * P };
      TD.app.newDoc('Big PNG', [s], null, null, null, 'board');
    });
    await page.locator('#btnExport').click();
    await page.locator('[data-efmt="png"]').click();
    const dpi = page.locator('#expDpi');
    const state = async (v) => {
      await dpi.fill(String(v)); await dpi.press('Enter');
      await page.waitForTimeout(150);
      return page.evaluate(() => ({ err: document.querySelector('.exp-note.err')?.textContent || '', off: document.querySelector('[data-ego]').disabled }));
    };
    const big = await state(2400);
    assert.ok(/Choose (\d+) DPI or less/.test(big.err) && big.off, `warned and the button is off: "${big.err}"`);
    const max = +/Choose (\d+)/.exec(big.err)[1];
    assert.ok(max >= 300 && max < 2400, `the DPI offered (${max}) is one that works`);
    const fits = await state(max);
    assert.deepEqual(fits, { err: '', off: false }, 'at that DPI it exports');
    await state(300); // the DPI is kept (localStorage): back to the default, which later tests count on
    await page.keyboard.press('Escape');
  });
  await test('Web page export: the text is set in KaTeX_Main, the font the page shows and the file embeds', async () => {
    const got = await page.evaluate(async () => {
      TD.app.newDoc('Web font', null, null, [{ type: 'text', text: 'Plain words on the page.' }, { type: 'diagram', shapes: [] }]);
      TD.app.setMode('document');
      const html = await TD.docToHtml();
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;opacity:0';
      document.body.appendChild(f);
      await new Promise((r) => { f.onload = r; f.srcdoc = html; });
      const d = f.contentDocument, p = d.querySelector('.doc-page p') || d.querySelector('.doc-page');
      await d.fonts.ready;
      const family = getComputedStyle(p).fontFamily, loaded = d.fonts.check('16px KaTeX_Main');
      f.remove();
      return { family, loaded, embeds: /@font-face[^}]*KaTeX_Main/.test(html) };
    });
    assert.ok(got.embeds, 'the file embeds KaTeX_Main');
    assert.match(got.family, /^"?KaTeX_Main/, `the text asks for it (${got.family})`);
    assert.ok(got.loaded, 'and gets it');
  });
  await test('Document: a word longer than the line wraps, so the page (and its print) keeps its width', async () => {
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(5);
    await page.evaluate((word) => {
      TD.app.newDoc('Long word', null, null, [{ type: 'text', text: `Before ${word} after.` }, { type: 'table', rows: [['a', word], ['b', 'c']], header: true, borders: 'all', colAlign: 'c' }, { type: 'diagram', shapes: [] }]);
      TD.app.setMode('document');
    }, word);
    await page.waitForTimeout(300);
    const screen = await page.evaluate(() => { const p = document.querySelector('.doc-page'); return p.scrollWidth - p.clientWidth; });
    assert.ok(screen <= 0, `on screen the page is not widened (${screen}px)`);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => { document.body.classList.add('printing'); TD.docview.render(true); });
    const print = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => { document.body.classList.remove('printing'); TD.docview.render(); });
    assert.ok(print <= 0, `printed, nothing passes the paper's edge (${print}px)`);
  });
  await test('LaTeX window: the "can\'t restore exactly" note shows only for code that would come back as TikZ', async () => {
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    for (const [type, tool, want] of [['ellipse', 'ellipse', false], ['plot', 'plot:function', true]]) {
      await page.evaluate(([type, tool]) => {
        const s = { ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults, tool), id: 'one', w: 120, h: 80 };
        TD.app.newDoc('Restore ' + type, [s]);
        TD.app.setMode('diagram');
      }, [type, tool]);
      await page.locator('#btnTikz').click();
      await page.waitForTimeout(300);
      const note = await page.locator('#tikzLint .lint.warn').count();
      assert.equal(note > 0, want, `${type}: note ${want ? 'shown' : 'not shown'}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  });
  await test('Thai: option names, the version tip and the Circuit palette are translated, and no panel label is cut off', async () => {
    await language('th');
    try {
      for (const [type, tool] of [['rect', 'rect'], ['text', 'text'], ['line', 'line']]) {
        const got = await page.evaluate(([type, tool]) => {
          const s = { ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults, tool), id: 'th', x: 0, y: 0, w: 80, h: 40, x1: 0, y1: 0, x2: 100, y2: 0, text: 'A' };
          TD.app.newDoc('Thai', [s], null, null, null, 'board'); TD.state.sel = new Set(['th']); TD.app.render(); TD.app.renderProps();
          const cut = [...document.querySelectorAll('#props label')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth).map((e) => e.textContent.trim());
          const opts = [...document.querySelectorAll('#props option')].map((o) => o.textContent.trim());
          return { cut, opts };
        }, [type, tool]);
        assert.deepEqual(got.cut, [], `${type}: labels cut off`);
        if (type !== 'text') assert.ok(got.opts.includes('เส้นทึบ'), `${type}: the dash list is in Thai`);
        if (type === 'rect') assert.ok(got.opts.includes('บน (above)'), 'positions keep their TikZ keyword');
        if (type === 'text') assert.ok(got.opts.includes('(แบบอักษรตั้งต้น)'), 'the default font is named');
      }
      assert.match(await page.evaluate(() => { const v = document.getElementById('appVer'); return v.title || v.dataset.tip; }), /รุ่นนี้/, 'the version tip follows the language');
      const cz = await page.evaluate(async () => {
        TD.blocks.get('cz').editor.get().open({ id: 'czth', ...TD.TYPES.cz.create({ x: 0, y: 0 }, TD.state.defaults, 'cz') }, () => {});
        await new Promise((r) => setTimeout(r, 300));
        const items = [...document.querySelectorAll('[data-part]')].filter((e) => e.offsetParent || e.closest('details, [hidden]'));
        const english = items.filter((e) => { const k = e.dataset.part, n = TD.CZ.parts[k]?.name; return n && e.textContent.trim() === n && !/^[A-Z0-9 .()/-]+$/.test(n); }).map((e) => e.textContent.trim());
        const parts = Object.keys(TD.CZ.parts).length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { english, items: items.length, parts };
      });
      assert.ok(cz.items > 0, 'the palette lists parts');
      assert.deepEqual(cz.english, [], 'every Circuit part has its Thai name');
    } finally { await language('en'); }
  });
  await test('Export button: its tip names what the panel offers in each view', async () => {
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    const tip = () => page.evaluate(() => { const b = document.getElementById('btnExport'); return b.title || b.dataset.tip; });
    await page.evaluate(() => { TD.app.newDoc('Tips', null, null, [{ type: 'text', text: 'x' }, { type: 'diagram', shapes: [] }]); TD.app.setMode('document'); });
    assert.equal(await tip(), 'Export the document as a PDF or a web page');
    await page.evaluate(() => TD.app.setMode('diagram'));
    assert.match(await tip(), /SVG, PDF or a web page/);
    await language('th');
    assert.match(await tip(), /หน้าเว็บ/, 'and the language');
    await language('en');
  });
  await test('Words: the empty whiteboard names this computer\'s zoom key, + is named for the file kind, Page margins for both sides', async () => {
    await page.locator('#kindSeg button[data-mode="board"]').first().click();
    await page.evaluate(() => TD.app.newDoc('Empty board', null, null, null, null, 'board'));
    const mac = await page.evaluate(() => /Mac|iP(hone|ad|od)/.test(navigator.platform));
    const keys = await page.evaluate(() => [...document.querySelectorAll('.eh-board kbd')].map((k) => k.textContent));
    assert.equal(keys[0], mac ? '⌘' : 'Ctrl', `the zoom key (${keys})`);
    const plus = () => page.evaluate(() => { const b = document.getElementById('btnNewDoc'); return [b.getAttribute('aria-label'), b.title || b.dataset.tip]; });
    assert.deepEqual(await plus(), ['New whiteboard', 'New whiteboard']);
    await language('th');
    const th = await plus();
    await language('en');
    assert.ok(th[0] === th[1] && !/New/.test(th[0]), `and in Thai (${th})`);
    await page.locator('#kindSeg button[data-mode="page"]').first().click();
    await page.evaluate(() => { TD.app.newDoc('Margins', null, null, null, null, 'page'); TD.state.sel = new Set(); TD.app.renderProps(); });
    const names = await page.evaluate(() => ['mt', 'ml'].map((k) => document.querySelector(`[data-pp="${k}"]`)?.getAttribute('aria-label')));
    assert.deepEqual(names, ['Margins: Top / bottom', 'Margins: Left / right']);
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
  });
  await test('Block editor words: Cancel after a save loses only what came since it; a pasted block is named', async () => {
    await page.evaluate(() => TD.blocks.get('qc').editor.get().open({ id: 'qcw', ...TD.TYPES.qc.create({ x: 0, y: 0 }, TD.state.defaults, 'qc') }, () => {}));
    await page.waitForTimeout(300);
    const code = page.locator('.cz-code textarea:visible').first();
    const edit = async (gate) => { await code.click(); await code.press('ControlOrMeta+End'); await code.type(` % ${gate}`); };
    await edit('one');
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(150);
    await edit('two');
    await page.locator('[data-qe="cancel"]:visible').click();
    const body = await page.locator('.td-dialog').textContent();
    await page.locator('.td-dialog button.danger, .td-dialog [data-act="ok"]').first().click();
    assert.match(body, /since you last saved/, body);
    await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
    await page.evaluate(() => { TD.app.newDoc('Paste block', []); TD.app.setMode('diagram'); });
    await page.evaluate(() => TD.app.takeIn('\\chemfig{H-O-H}', [], null));
    await page.waitForTimeout(300);
    const hint = await page.locator('#hint').textContent();
    assert.equal(hint, 'Pasted the Chemistry block');
  });
  await test('Opening a file that fails says why: a newer version, objects this version doesn\'t know, or not a drawing', async () => {
    const shape = { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10 };
    for (const [file, want] of [
      [{ app: 'diagramtex', version: 9, kind: 'classic', name: 'New', blocks: [{ type: 'diagram', shapes: [shape, { id: 'b', type: 'hologram' }] }] }, /newer version of DiagramTeX \(file version 9\)/],
      [{ app: 'diagramtex', version: 3, kind: 'classic', name: 'Odd', blocks: [{ type: 'diagram', shapes: [shape, { id: 'b', type: 'hologram' }] }] }, /doesn't know: hologram\./],
      [{ app: 'diagramtex', version: 3, kind: 'classic', name: 'Bad', blocks: 'nothing' }, /isn't a DiagramTeX file, or it is damaged/],
    ]) {
      await page.locator('#fileInput').setInputFiles({ name: file.name + '.diagramtex', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
      const dlg = page.locator('.td-dialog');
      await dlg.waitFor();
      const text = await dlg.textContent();
      // its OK button, not Esc: the dialog takes keys once its focus arrives, a frame after it shows
      await dlg.locator('[data-r="1"]').click();
      await dlg.waitFor({ state: 'detached' });
      assert.match(text, want, text);
      assert.ok(!/\(not a DiagramTeX file\)/.test(text), 'no repeated reason');
    }
  });
  await test('Cosmetics: Circuit names one size, the Automaton panel\'s code inside it, symbols named in Layers, no KaTeX strict warnings', async () => {
    const sizes = await page.evaluate(async () => {
      TD.blocks.get('cz').editor.get().open({ id: 'czs', ...TD.TYPES.cz.create({ x: 0, y: 0 }, TD.state.defaults, 'cz') }, () => {});
      await new Promise((r) => setTimeout(r, 600));
      const s = [...document.querySelectorAll('[data-part]')].filter((e) => e.offsetParent).map((e) => getComputedStyle(e.querySelector(':scope > span:last-child')).fontSize);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return [...new Set(s)];
    });
    assert.equal(sizes.length, 1, `one name size in the Circuit list (${sizes})`);
    const over = await page.evaluate(() => {
      const s = { ...TD.TYPES.automata.create({ x: 0, y: 0 }, TD.state.defaults, 'automata'), id: 'au' };
      TD.app.newDoc('Cosmetics', [s, { ...TD.TYPES.sym.create({ x: 0, y: 0 }, TD.state.defaults, 'sym:diamond'), id: 'dia', x: 300, y: 0, text: '' }], null, null, null, 'board');
      TD.state.sel = new Set(['au']); TD.app.render(); TD.app.renderProps();
      const r = document.querySelector('#props').getBoundingClientRect();
      return [...document.querySelectorAll('#props .help code')].map((c) => Math.round(c.getBoundingClientRect().right - r.right)).filter((d) => d > 0);
    });
    assert.deepEqual(over, [], 'the library code stays inside the panel');
    await page.evaluate(() => { TD.state.sel = new Set(['dia']); TD.app.render(); TD.app.renderProps(); });
    // the Layers list is drawn after the canvas (Svelte, in its own tick): wait for the row
    const row = page.locator('#layers .ly-row[data-id="dia"]');
    await row.waitFor({ state: 'attached' });
    const name = (await row.textContent()).trim();
    assert.ok(name && !/^Shape$/.test(name) && /Diamond/i.test(name), `the symbol is named in Layers (${name})`);
    const warnings = [];
    const listen = (m) => { if (/strict mode/i.test(m.text())) warnings.push(m.text()); };
    page.on('console', listen);
    await page.evaluate(() => { for (const tex of ['\\r', '\\r{a}', '\\o', '\\i']) TD.math.render(tex, { display: false, throwOnError: false }); });
    await page.waitForTimeout(200);
    page.off('console', listen);
    assert.deepEqual(warnings, [], 'no strict-mode warnings in the console');
  });
  await test('Import dialog: the title and its actions sit on one line, in English and Thai', async () => {
    const oneLine = () => page.evaluate(() => {
      const kids = [...document.querySelectorAll('#importModal .modal-head > *')].filter((e) => e.offsetWidth && !e.classList.contains('spacer')).map((e) => e.getBoundingClientRect());
      return Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom));
    });
    for (const lang of ['en', 'th']) {
      if (lang === 'th') await language('th');
      await page.evaluate(() => TD.app.openImport(''));
      await page.waitForTimeout(200);
      const ok = await oneLine();
      await page.locator('#impClose').click();
      assert.ok(ok, `${lang}: one line`);
    }
    await language('en');
  });
  await test('Tablet held upright: the document fills the width, its controls stay usable, and the top bar shows what is scrolled away', async () => {
    const size = page.viewportSize();
    await page.setViewportSize({ width: 820, height: 1180 });
    try {
      await page.locator('#kindSeg button', { hasText: 'Classic' }).first().click();
      await page.evaluate(() => { TD.app.newDoc('Tablet', null, null, [{ type: 'text', text: 'Hello.' }, { type: 'diagram', shapes: [] }], null, 'classic'); TD.app.setMode('document'); });
      await page.mouse.move(400, 900);
      await page.waitForFunction(() => document.body.classList.contains('doc-narrow'));
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect(), dv = document.querySelector('#docview');
        return { page: r('#docview .doc-page').width, view: dv.clientWidth, hud: r('.doc-hud').left, files: r('#files').right, add: r('#docview .doc-page > .ins:last-child [data-add="text"]').height };
      });
      assert.ok(m.page > m.view - 60, `the page fits the whole width, not the room beside the panel (${Math.round(m.page)} of ${m.view})`);
      assert.ok(m.hud >= m.files, 'the zoom bar sits clear of the sidebar');
      assert.ok(m.add >= 20, `the page's + Text button keeps its size (${m.add.toFixed(1)}px)`);
      const bar = page.locator('#topbarTools'), on = bar.locator('.tb-arrow-r');
      await bar.evaluate((b) => { b.scrollLeft = 0; });
      await page.waitForFunction(() => !document.querySelector('#topbarTools .tb-arrow-r').hidden && document.querySelector('#topbarTools .tb-arrow-l').hidden); // » only: nothing to the left at the start
      for (let k = 0; k < 6 && await on.isVisible(); k++) { await on.click(); await page.waitForTimeout(400); }
      assert.ok(await on.isHidden(), 'the » arrow takes the bar to its end, and goes');
      const exp = await page.evaluate(() => { const b = document.querySelector('#topbarTools').getBoundingClientRect(), e = document.querySelector('#btnExport').getBoundingClientRect(); return e.left >= b.left && e.right <= b.right; });
      assert.ok(exp, 'Export is in view');
      assert.ok(await bar.locator('.tb-arrow-l').isVisible(), '« shows there is more to the left');
    } finally {
      await page.setViewportSize(size);
    }
    await page.waitForFunction(() => !document.body.classList.contains('doc-narrow'));
    assert.ok(await page.locator('#topbarTools .tb-arrow-r').isHidden(), 'a wide window has no arrows');
  });
  await test('Quantum: an unclosed { is reported, and edits in the drawing never delete the code it swallowed', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Quantum braces', null, null, null, null, 'board');
      const shape = TD.TYPES.qc.create({ x: 0, y: 0 }, TD.state.defaults);
      window.__saved = null;
      TD.blocks.get('qc').editor.get().open(shape, (r) => { window.__saved = r; });
    });
    const editor = page.locator('.modal:not([hidden])'), ta = editor.locator('.cz-code textarea');
    const lost = (await ta.inputValue()).split('\n')[2]; // the second wire, which the open { swallows
    await ta.fill((await ta.inputValue()).replace('\\gate{H}', '\\gate{H'));
    await ta.blur();
    await page.waitForFunction(() => /not closed/.test(document.querySelector('.modal:not([hidden]) .cz-msg').textContent));
    // the gate's cell, now holding the rest of the circuit: an X typed on it, then a wire added
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('x');
    assert.match(await editor.locator('.cz-tip').textContent(), /don't pair/, 'the tip says why the X was not put there');
    await editor.locator('[data-qe="addrow"]').click();
    const code = await ta.inputValue();
    assert.ok(code.includes('\\gate{H & ') && code.includes(lost.trim().replace(/\s+/g, ' ').split(' & ')[2]), `the swallowed wire is still in the code:\n${code}`);
    assert.ok(!code.includes('\\gate{X}'), 'and the broken cell was not written over');
    await ta.fill(code.replace('\\gate{H', '\\gate{H}'));
    await ta.blur();
    await page.waitForFunction(() => document.querySelector('.modal:not([hidden]) .cz-msg').textContent === '');
    assert.match(await editor.locator('.cz-count').textContent(), /^3 wires/, 'fixed, both wires and the added one are back');
    await editor.locator('.modal-head button.primary').click();
  });
  await test('Document undo and redo cover blocks, typing, tables and page setup, and spare diagram edits', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Document undo', null, null, [{ type: 'text', text: 'First.' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    const sum = () => page.evaluate(() => TD.state.doc.blocks.map(b => b.type === 'text' ? 't:' + b.text : b.type === 'table' ? 'T:' + b.rows[0][0] : b.type[0] + b.shapes.length).join('|'));
    const key = async (redo = false) => { await page.keyboard.press(redo ? 'ControlOrMeta+Shift+z' : 'ControlOrMeta+z'); };
    const away = () => page.locator('#docview').click({ position: { x: 20, y: 400 } });
    await page.locator('#docview .doc-page > .ins:last-child [data-add="text"]').click();
    await page.keyboard.type('Hello');
    assert.equal(await sum(), 't:First.|d0|t:Hello');
    await key();
    assert.equal(await sum(), 't:First.|d0|t:', 'undo takes back the typing, in the editor');
    assert.equal(await page.locator('#docview .blk-ie').count(), 1);
    await key();
    assert.equal(await sum(), 't:First.|d0', 'then the new block');
    await key(true); await key(true);
    assert.equal(await sum(), 't:First.|d0|t:Hello', 'redo brings both back');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#docview .blk[data-i="0"] [data-rm]').click());
    assert.equal(await sum(), 'd0|t:Hello');
    // a diagram edited on the canvas keeps its edit through the document's undo
    await page.evaluate(() => { TD.app.cmd.setMode('diagram'); TD.state.doc.shapes.push({ ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'undo-kept' }); TD.app.cmd.setMode('document'); });
    await away(); await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello', 'undo puts the deleted block back and leaves the diagram as edited');
    await page.locator('#docview .doc-page > .ins:last-child [data-add="table"]').click();
    await page.keyboard.type('abc');
    await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello|T:', 'undo in a cell takes back its typing');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cell')), true, 'and keeps the cell focused');
    await key();
    assert.equal(await sum(), 't:First.|d1|t:Hello');
    const mt = await page.evaluate(() => TD.state.doc.page.mt);
    await page.locator('#props button', { hasText: 'Narrow' }).click();
    assert.notEqual(await page.evaluate(() => TD.state.doc.page.mt), mt);
    await away(); await key();
    assert.equal(await page.evaluate(() => TD.state.doc.page.mt), mt, 'page setup is undone too');
  });
  await test('Document: a quick click on another block opens it, even when the press and release come together', async () => {
    await page.evaluate(() => {
      TD.app.newDoc('Document quick click', null, null, [{ type: 'text', text: 'Some text.' }, { type: 'table', rows: [['a', 'b'], ['1', '2']], header: true, borders: 'all', colAlign: 'c' }, { type: 'diagram', shapes: [] }], null, 'classic');
      TD.app.cmd.setMode('document');
    });
    const open = () => page.evaluate(() => document.querySelector('#docview .blk.editing')?.dataset.i ?? 'none');
    // a trackpad tap: press and release before the page has had a turn
    const tap = (sel) => page.evaluate((sel) => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12, button: 0 };
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
    }, sel);
    await tap('#docview .blk-table .blk-body');
    await page.waitForTimeout(100);
    assert.equal(await open(), '1', 'the table opens');
    await tap('#docview .blk-text .blk-body');
    await page.waitForTimeout(100);
    assert.equal(await open(), '0', 'the text opens straight from the table');
    await tap('#docview .blk-table .blk-body');
    await page.waitForTimeout(100);
    assert.equal(await open(), '1', 'and the table again from the text');
    await page.keyboard.press('Escape');
  });
  await test('PWA Install follows browser eligibility, language and installation', async () => {
    const button = page.locator('#btnInstall');
    assert.equal(await button.count(), 0, 'no install offer means no install button');
    const offer = async (outcome = 'dismissed', fails = false) => page.evaluate(({ outcome, fails }) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      window.__installCalls = 0;
      Object.assign(event, { prompt: async () => { window.__installCalls++; if (fails) throw new Error('Offer expired'); },
        userChoice: Promise.resolve({ outcome }) });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }, { outcome, fails });
    assert(await offer(), 'browser offer is retained for the user click');
    await button.waitFor();
    assert.equal(await button.evaluate(e => e.nextElementSibling.id), 'languagePicker');
    assert.equal(await page.evaluate(() => window.__installCalls), 0, 'never prompts without a click');
    await language('th');
    assert.equal(await button.innerText(), 'ติดตั้ง');
    await language('en');
    assert.equal(await button.innerText(), 'Install');
    await button.click();
    assert.equal(await page.evaluate(() => window.__installCalls), 1);
    await button.waitFor({ state: 'detached' });
    await offer('accepted'); await button.click();
    await button.waitFor({ state: 'detached' });
    // A browser can issue a new offer after uninstalling, so no sticky local flag.
    await offer(); await button.waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await button.waitFor({ state: 'detached' });
    await offer('dismissed', true); await button.click();
    await button.waitFor({ state: 'detached' });
    // Installation from another tab also hides an already displayed offer.
    await offer(); await button.waitFor();
    await page.evaluate(async () => {
      const channel = new BroadcastChannel('diagramtex-pwa-install');
      channel.postMessage('installed');
      await new Promise(r => setTimeout(r, 0)); channel.close();
    });
    await button.waitFor({ state: 'detached' });
  });
  await test('PWA Install stays hidden in installed app windows', async () => {
    for (const legacy of [false, true]) {
      const context = await page.context().browser().newContext({ serviceWorkers: 'block' });
      try {
        await context.addInitScript(legacy => {
          localStorage.setItem('diagramtex.tour', 'seen');
          if (legacy) Object.defineProperty(navigator, 'standalone', { value: true });
          else {
            const original = window.matchMedia.bind(window);
            window.matchMedia = query => {
              const result = original(query);
              if (query.includes('display-mode: standalone')) Object.defineProperty(result, 'matches', { value: true });
              return result;
            };
          }
        }, legacy);
        const app = await context.newPage(); app.setDefaultNavigationTimeout(STARTUP_TIMEOUT); await app.goto(page.url());
        await waitForAppReady(app);
        await app.evaluate(() => {
          const event = new Event('beforeinstallprompt', { cancelable: true });
          Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
          window.dispatchEvent(event);
        });
        assert.equal(await app.locator('#btnInstall').count(), 0);
      } finally { await context.close(); }
    }
  });
  await test('UI language preserves math pixels and measurements', async () => {
    await language('en');
    await page.evaluate(() => {
      const text = [String.raw`$\vec F=q(\vec E+\vec v\times\vec B)$`,
        String.raw`$\hat x+\bar y+\overline{AB}$`,
        String.raw`$\frac{a+b}{c+d}+\sqrt{x^2+y^2}$`,
        String.raw`$\displaystyle\sum_{n=1}^\infty\frac1{n^2}$`,
        String.raw`$\begin{pmatrix}a&b\\c&d\end{pmatrix}$`,
        String.raw`$\text{ภาษาไทย }\alpha\to\beta$`].join('\n');
      const shape = { ...TD.TYPES.text.create({ x: 0, y: 0 }, {}), id: 'locale-math', text };
      TD.app.newDoc('Language-independent math', null, null,
        [{ type: 'diagram', shapes: [shape] }, { type: 'text', text: text.replaceAll('\n', '\n\n') }],
        { title: false }, 'classic');
    });
    const project = await page.evaluate(() => TD.app.projectJson(TD.state.doc));
    try {
    for (const engine of ['katex', 'temml']) {
      await page.locator(`#engineBox [data-engine="${engine}"]`).click();
      await page.evaluate(() => TD.math.whenReady());
      for (const mode of ['diagram', 'document']) {
        await page.locator(`#classicSeg [data-mode="${mode}"]`).click();
        if (mode === 'document') await page.locator('#docview [data-zoom="1"]').click();
        else await page.evaluate(() => { TD.app.zoomFit(); });
        const targets = mode === 'diagram' ? ['#content image.svg-label']
          : ['#docview .blk-diag image.svg-label', '#docview .blk-text .blk-body'];
        let baseline;
        for (const locale of ['en', 'th', 'en']) {
          await language(locale);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            TD.clearTextCache();
            await Promise.all([...document.querySelectorAll('image.svg-label')].map(element => new Promise((resolve, reject) => {
              const image = new Image(); image.onload = () => image.decode().then(resolve, resolve); image.onerror = reject; image.src = element.getAttribute('href');
            })));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          const metrics = await page.evaluate(() => {
            const shape = TD.state.doc.blocks[0].shapes[0], { w, h } = TD.textBox(shape.text, shape);
            return { w, h, engine: TD.math.engine, project: TD.app.projectJson(TD.state.doc) };
          });
          assert.equal(metrics.engine, engine); assert.equal(metrics.project, project);
          const pictures = [];
          for (const selector of targets) {
            // SVG labels are transparent: element screenshots include the canvas
            // grid below them. Chromium can rasterise that pattern at a different
            // subpixel phase after repainting; compare the math on plain paper.
            const png = PNG.sync.read(await page.locator(selector).screenshot({
              style: '#gridRect, #origin { visibility: hidden !important; }',
            }));
            pictures.push({ width: png.width, height: png.height, data: png.data });
          }
          if (!baseline) baseline = { metrics, pictures };
          else {
            assert.deepEqual(metrics, baseline.metrics, `${engine}/${mode}/${locale}: math measurements and source`);
            for (let i = 0; i < pictures.length; i++) {
              const actual = pictures[i], expected = baseline.pictures[i];
              assert.equal(actual.width, expected.width, `${engine}/${mode}/${locale}: image width`);
              assert.equal(actual.height, expected.height, `${engine}/${mode}/${locale}: image height`);
              assert(actual.data.equals(expected.data), `${engine}/${mode}/${locale}: math pixels changed after UI translation`);
            }
          }
        }
      }
    }
    } finally {
      await language('en');
      await page.locator('#engineBox [data-engine="katex"]').click();
    }
  });
  await test('guide language links remain clickable', async () => {
    const guide = await page.context().newPage();
    try {
      await guide.goto(new URL('guide/#files', page.url()).href);
      await guide.locator('.language-picker > summary').click();
      await guide.locator('[data-guide-lang="th"]').click();
      await guide.waitForURL('**/guide/th.html#files');
      assert.equal(await guide.locator('html').getAttribute('lang'), 'th');
      await guide.locator('.language-picker > summary').click();
      await guide.locator('[data-guide-lang="en"]').click();
      await guide.waitForURL('**/guide/#files');
      assert.equal(await guide.locator('html').getAttribute('lang'), 'en');
    } finally { await guide.close(); }
  });
  return results;
}
