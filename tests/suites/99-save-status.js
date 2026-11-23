// The top bar's status (showSaveState in src/application/app.ts): a dot and where the open file is kept. Red: no
// autosave; yellow: only in this browser, though it could be on disk; green: saved to its file; blue: only in this
// browser, which can't link files. A title of two lines shows the second under the first (kit/tip-text.ts).
{
  T.test('save status: a dot and a line for each place the open file is kept', () => {
    const keep = { can: TD.files.can, fileOf: TD.files.fileOf, autoSaving: TD.files.autoSaving };
    const el = document.querySelector('#saveStatus'), text = () => el.querySelector('.save-text').textContent, dot = () => getComputedStyle(el.querySelector('.dot')).backgroundColor;
    const pen = (v) => { const i = Object.assign(document.createElement('i'), { style: `color: var(${v})` }); document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const show = (o) => { Object.assign(TD.files, o); TD.app.cmd.showSaveState(); };
    const id = TD.app.state.docId, file = { name: 'notes.diagramtex' }, save = TD.app.cmd.kb('Ctrl+Shift+S');
    try {
      T.ok(!document.querySelector('#saveState'), 'nothing beside the file name any more');
      show({ can: true, fileOf: () => null });
      T.eq(el.dataset.tone, 'warn'); T.eq(text(), `Autosaved in browser only · Save it to disk with ${save}`); T.eq(dot(), pen('--marker'), 'yellow');
      TD.app.cmd.diskWritten(id); show({ can: true, fileOf: () => file, autoSaving: () => false });
      T.eq(el.dataset.tone, 'ok'); T.eq(text(), 'Changes are saved to notes.diagramtex'); T.eq(dot(), pen('--okpen'), 'green');
      T.ok(el.title.startsWith('Changes are saved to notes.diagramtex\n'), 'the whole line, then what it means: ' + el.title);
      TD.app.cmd.diskChanged(id);
      T.eq(el.dataset.tone, 'warn', 'an edit: yellow at once'); T.eq(text(), 'Autosaved in browser only · Not saved to notes.diagramtex yet');
      show({ autoSaving: () => true });
      T.eq(el.dataset.tone, 'warn', 'autosave writes the file, but the change is not on disk until its write lands');
      TD.app.cmd.diskWritten(id);
      T.eq(el.dataset.tone, 'ok', 'written: green');
      show({ can: false, fileOf: () => null, autoSaving: () => false });
      T.eq(el.dataset.tone, 'info'); T.eq(text(), 'Autosaved in browser only'); T.eq(dot(), pen('--bluepen'), 'blue');
    } finally { TD.app.cmd.diskWritten(id); Object.assign(TD.files, keep); TD.app.cmd.showSaveState(); }
  });

  T.test('save status: a write started before the latest edit leaves the file yellow', () => {
    const keep = { fileOf: TD.files.fileOf };
    const id = TD.app.state.docId, el = document.querySelector('#saveStatus');
    try {
      TD.files.fileOf = (x) => (x === id ? { name: 'race.diagramtex' } : null);
      TD.app.cmd.diskChanged(id);
      TD.app.cmd.diskWritten(id, -1); // a write started at an earlier edit holds less than the document now
      T.eq(el.dataset.tone, 'warn', 'still yellow'); T.ok(TD.app.cmd.unsavedToDisk(), 'and closing asks');
      TD.app.cmd.diskWritten(id);
      T.eq(el.dataset.tone, 'ok', 'a write of the document as it is: green'); T.ok(!TD.app.cmd.unsavedToDisk(), 'and closing does not ask');
    } finally { TD.app.cmd.diskWritten(id); Object.assign(TD.files, keep); TD.app.cmd.showSaveState(); }
  });

  T.test('Leaving the page: the browser asks while a file linked to disk has changes not written to it, open or not', async () => {
    const keep = { fileOf: TD.files.fileOf, autoSaving: TD.files.autoSaving };
    const asks = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    const tick = () => new Promise((r) => setTimeout(r, 50));
    const linked = new Set();
    TD.app.newDoc('linked', [], null, null, null, 'board'); await tick();
    const a = TD.app.state.docId;
    try {
      linked.add(a); TD.files.fileOf = (id) => (linked.has(id) ? { name: 'linked.diagramtex' } : null); TD.files.autoSaving = () => false;
      TD.app.cmd.diskWritten(a);
      T.ok(!asks(), 'written: no question');
      TD.app.cmd.placeOnCanvas([{ ...TD.TYPES.text.create({ x: 0, y: 0 }, TD.state.defaults), id: 'lv1', text: 'edit' }]);
      T.ok(asks(), 'an edit not written to its file');
      TD.app.newDoc('other', [], null, null, null, 'board'); await tick();
      T.ok(asks(), 'still, once another file is open');
      linked.delete(a); T.ok(!asks(), 'no longer linked: no question');
    } finally { TD.app.cmd.diskWritten(a); Object.assign(TD.files, keep); }
  });

  T.test('save status: with autosave writing a linked file, a change is yellow until its write lands, then green', async () => {
    if (!TD.files.can || !navigator.storage?.getDirectory) return; // (file links: Chromium)
    const dir = await navigator.storage.getDirectory(), h = await dir.getFileHandle('status-test.diagramtex', { create: true });
    if (!h.createWritable) return;
    const el = document.querySelector('#saveStatus'), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    TD.app.newDoc('status test', [], null, null, null, 'board'); await wait(200);
    const id = TD.app.state.docId, text = TD.app.projectJson(TD.state.doc), w = await h.createWritable(); await w.write(text); await w.close();
    try {
      await TD.files.link(id, h, text); TD.app.cmd.showSaveState();
      T.ok(TD.files.autoSaving(id), 'autosave writes it'); T.eq(el.dataset.tone, 'ok', 'saved to it');
      TD.app.cmd.placeOnCanvas([{ ...TD.TYPES.text.create({ x: 0, y: 0 }, TD.state.defaults), id: 'st1', text: 'new' }]);
      T.eq(el.dataset.tone, 'warn', 'yellow as soon as the change is made'); T.ok(TD.app.cmd.unsavedToDisk(), 'and closing would ask');
      for (let i = 0; i < 40 && el.dataset.tone !== 'ok'; i++) await wait(100);
      T.eq(el.dataset.tone, 'ok', 'green once written'); T.ok(!TD.app.cmd.unsavedToDisk(), 'and closing does not ask');
      T.eq(await (await h.getFile()).text(), TD.app.projectJson(TD.state.doc), 'the file holds it');
    } finally { await TD.files.unlink(id); TD.app.cmd.showSaveState(); await dir.removeEntry('status-test.diagramtex').catch(() => {}); }
  });

  T.test('save status: a long file name is cut in its middle, its start and extension kept', async () => {
    const keep = { can: TD.files.can, fileOf: TD.files.fileOf, autoSaving: TD.files.autoSaving };
    const name = 'Lecture notes for week three of the signals course.diagramtex', txt = document.querySelector('#saveStatus .save-text');
    try {
      Object.assign(TD.files, { can: true, fileOf: () => ({ name }), autoSaving: () => false });
      TD.app.cmd.diskChanged(TD.app.state.docId);
      T.ok(document.querySelector('#saveStatus').title.startsWith(`Autosaved in browser only · Not saved to ${name} yet\n`), 'the tooltip has it all');
      if (innerWidth < 1300) return; // (room for the line, with a name cut in it, at this width)
      T.ok(/^Autosaved in browser only · Not saved to Lect.*….*\.diagramtex yet$/.test(txt.textContent), 'cut in the middle: ' + txt.textContent);
      T.ok(txt.scrollWidth <= txt.clientWidth, 'and it fits');
      Object.assign(TD.files, { fileOf: () => ({ name: 'short.diagramtex' }) }); TD.app.cmd.showSaveState();
      T.eq(txt.textContent, 'Autosaved in browser only · Not saved to short.diagramtex yet', 'a name that fits is whole');
    } finally { TD.app.cmd.diskWritten(TD.app.state.docId); Object.assign(TD.files, keep); TD.app.cmd.showSaveState(); }
  });

  T.test('save status: cut short, the line stops before the file name and keeps its dot', () => {
    const keep = { can: TD.files.can, fileOf: TD.files.fileOf, autoSaving: TD.files.autoSaving };
    try {
      Object.assign(TD.files, { can: true, fileOf: () => ({ name: 'A file with a very long name indeed, far too long for the bar.diagramtex' }), autoSaving: () => false });
      TD.app.cmd.diskChanged(TD.app.state.docId);
      const el = document.querySelector('#saveStatus'), name = document.querySelector('#docName');
      if (innerWidth >= 720) T.ok(el.getBoundingClientRect().right <= name.getBoundingClientRect().left, 'clear of the name');
      T.ok(el.querySelector('.dot').getBoundingClientRect().width > 0, 'the dot stays');
    } finally { TD.app.cmd.diskWritten(TD.app.state.docId); Object.assign(TD.files, keep); TD.app.cmd.showSaveState(); }
  });

  T.test('tooltips: a title of two lines shows the second as the muted line under the first', async () => {
    const b = Object.assign(document.createElement('button'), { title: 'Changes are saved to a.diagramtex\nLater changes are saved to it too.', textContent: 'x' });
    b.style.cssText = 'position:fixed;left:40px;top:200px';
    document.body.append(b);
    try {
      await new Promise((r) => setTimeout(r, 50)); // (its title becomes the app's tip)
      b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      await new Promise((r) => setTimeout(r, 900));
      const t = document.querySelector('.td-tip:not(.static)');
      T.ok(t && !t.hidden, 'a tip shows');
      T.eq(t.querySelector('.td-tip-sub')?.textContent, 'Later changes are saved to it too.', 'the second line under');
      T.ok(t.textContent.startsWith('Changes are saved to a.diagramtex'), 'the first line first');
    } finally { TD.tooltip.hide(); b.remove(); }
  });
}
