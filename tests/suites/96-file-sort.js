// Sorting the file list: the user's own order (dragging rearranges), or by date created, date modified or name,
// either way round (dragging no longer rearranges then).
T.test('File list: sorts by custom order, date created, date modified and name', () => {
  let saved = null; try { saved = localStorage.getItem('diagramtex.fileSort'); localStorage.removeItem('diagramtex.fileSort'); } catch (e) { /* blocked */ }
  const t0 = Date.now();
  const ids = ['Bravo 10', 'alpha', 'Bravo 9'].map((n) => TD.app.newDoc(n, null, null, null, null, 'board'));
  const btn = document.querySelector('#btnSortDocs'), menu = () => document.querySelector('#sortMenu');
  const pick = (attr) => { if (menu().hidden) btn.click(); menu().querySelector(`[${attr}]`).click(); T.ok(menu().hidden, 'a choice closes the menu'); };
  const order = () => [...document.querySelectorAll('#docList li[data-doc]')].map((li) => li.dataset.doc).filter((id) => ids.includes(id)).map((id) => ids.indexOf(id)).join('');
  try {
    T.ok(btn, 'a Sort button in the header');
    T.ok(TD.app.cmd.files().find((d) => d.id === ids[0]).created >= t0, 'a new file has a created date');
    // dates: created 0 < 1 < 2; modified 2 < 0 < 1
    const set = (stamps) => {
      const inDb = TD.docStore.active && TD.docStore.owns('diagramtex.index');
      const all = JSON.parse(inDb ? TD.docStore.get('diagramtex.index') : localStorage.getItem('diagramtex.index'));
      ids.forEach((id, i) => Object.assign(all.find((d) => d.id === id), stamps[i]));
      inDb ? TD.docStore.set('diagramtex.index', JSON.stringify(all)) : localStorage.setItem('diagramtex.index', JSON.stringify(all));
    };
    set([{ created: 1000, updated: 5000 }, { created: 2000, updated: 6000 }, { created: 3000, updated: 4000 }]);
    pick('data-sort="custom"');
    T.eq(order(), '012', 'custom: list order');
    btn.click(); T.ok(menu().querySelector('[data-dir="asc"]').disabled, 'no direction for custom order'); btn.click(); T.ok(menu().hidden, 'a second click closes it');
    pick('data-sort="created"'); pick('data-dir="asc"');
    T.eq(order(), '012', 'created, oldest first');
    btn.click(); T.eq(menu().querySelector('[data-dir="desc"]').textContent, 'Newest first');
    pick('data-dir="desc"');
    T.eq(order(), '210', 'created, newest first');
    pick('data-sort="modified"');
    T.eq(order(), '102', 'modified, newest first');
    pick('data-sort="name"'); pick('data-dir="asc"');
    T.eq(order(), '120', 'name A to Z, numbers in number order');
    T.eq(JSON.parse(localStorage.getItem('diagramtex.fileSort')).by, 'name', 'remembered');
    // dragging a file onto another doesn't rearrange while sorted
    const li = (i) => document.querySelector(`#docList li[data-doc="${ids[i]}"]`);
    const dt = new DataTransfer(), r = li(0).getBoundingClientRect();
    li(1).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    li(0).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 2 }));
    T.ok(!document.querySelector('#docList .drop-before, #docList .drop-after'), 'no drop place while sorted');
    li(1).dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    pick('data-sort="custom"');
    T.eq(order(), '012', 'back to custom order');
    const r2 = li(0).getBoundingClientRect();
    li(1).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    li(0).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r2.top + 2 }));
    T.ok(li(0).classList.contains('drop-before'), 'custom order: a drop place');
    li(1).dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    btn.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    T.ok(menu().hidden, 'a click elsewhere closes the menu');
    // double-clicking a file name or folder name renames it in place
    const fId = TD.app.newDoc('FolderA/DocA', null, null, null, null, 'board');
    document.querySelector(`#docList li[data-doc="${fId}"] .nm`).click();
    document.querySelector(`#docList li[data-doc="${fId}"] .nm`).click();
    let ed = document.querySelector('#docList input.nm-ed');
    T.ok(ed && ed.value === 'DocA', 'double-clicking a file name opens in-place rename');
    ed.value = 'DocB';
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    T.eq(TD.app.cmd.files().find((d) => d.id === fId).name, 'FolderA/DocB', 'file renamed in place');
    document.querySelector('#docList li[data-folder="FolderA"] .nm').click();
    document.querySelector('#docList li[data-folder="FolderA"] .nm').click();
    ed = document.querySelector('#docList input.nm-ed');
    T.ok(ed && ed.value === 'FolderA', 'double-clicking a folder name opens in-place rename');
    ed.value = 'FolderB';
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    T.eq(TD.app.cmd.files().find((d) => d.id === fId).name, 'FolderB/DocB', 'folder renamed in place');
    T.ok(!document.querySelector('#docList li[data-folder="FolderB"]').classList.contains('shut'), 'folder keeps its open state after double-click rename');
  } finally {
    try { saved == null ? localStorage.removeItem('diagramtex.fileSort') : localStorage.setItem('diagramtex.fileSort', saved); } catch (e) { /* blocked */ }
  }
});

// The rulers are drawn at their own size: after the stage changes size without the window (the sidebar
// folding, say), their scale still matches the canvas and 0 sits on the origin.
T.test('Rulers: follow the stage when it changes size, 0 on the origin', async () => {
  TD.app.newDoc('Rulers', null, null, null, null, 'classic');
  TD.app.cmd.setMode('diagram');
  const files = document.querySelector('#files'), w = files.style.width;
  try {
    files.style.width = '60px';
    await new Promise((r) => setTimeout(r, 120));
    const rx = document.querySelector('#rulerX'), svg = rx.querySelector('svg');
    T.eq(+svg.getAttribute('viewBox').split(' ')[2], rx.clientWidth, 'drawn at the ruler\'s width');
    const o = document.querySelector('#canvas').getBoundingClientRect(), v = TD.state.view;
    const zero = [...svg.querySelectorAll('text')].find((t) => t.textContent === '0');
    if (zero) T.ok(Math.abs(rx.getBoundingClientRect().left + (+zero.getAttribute('x') - 3) - (o.left - v.x * v.zoom)) < 1.5, '0 on the origin');
  } finally { files.style.width = w; }
});

T.test('Classic title: follows file renames from the top bar and sidebar', () => {
  const id = TD.app.newDoc('Original title', null, null, null, null, 'classic');
  TD.app.state.doc.page.title = true;
  TD.app.cmd.setMode('document');
  const name = document.querySelector('#docName');
  const title = () => document.querySelector('#docview .doc-title');
  const page = document.querySelector('#docview .doc-page');
  T.eq(title().textContent, 'Original title', 'initial title');
  name.focus();
  name.value = 'Updated <title>';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  T.eq(title().textContent, 'Updated <title>', 'title updates as the name is typed');
  T.eq(document.activeElement, name, 'typing retains focus');
  T.eq(document.querySelector('#docview .doc-page'), page, 'rename preserves the page DOM');
  const shortHeight = title().getBoundingClientRect().height;
  name.value = 'AA1233443333334782346237846237846238745623875628756287568374654783564387543A'.repeat(3);
  name.dispatchEvent(new Event('input', { bubbles: true }));
  T.eq(title().textContent, name.value, 'long name is kept in full');
  T.ok(title().scrollWidth <= title().clientWidth + 1, 'unbroken title stays within the page margins');
  T.ok(title().getBoundingClientRect().height > shortHeight, 'long title wraps onto multiple lines');
  name.value = '';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  T.eq(title().textContent, 'Untitled', 'empty name uses the fallback');
  name.blur();
  TD.app.saveNow();
  const row = document.querySelector(`#docList li[data-doc="${id}"] .nm`);
  row.click(); row.click();
  const edit = document.querySelector('#docList input.nm-ed');
  T.ok(edit, 'sidebar rename opens');
  edit.value = 'Sidebar title';
  edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  T.eq(title().textContent, 'Sidebar title', 'sidebar rename updates the title');
});

T.test('Rulers: rendered zero and centimetre ticks track the canvas through pan and zoom', () => {
  TD.app.newDoc('Ruler alignment', null, null, null, null, 'classic');
  TD.app.cmd.setMode('diagram');
  const canvas = document.querySelector('#canvas');
  const point = (x, y, svg) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
  for (const zoom of [0.6, 1, 1.75, 2.4]) {
    for (const fraction of [0.15, 0.8]) {
      const r = canvas.getBoundingClientRect();
      Object.assign(TD.state.view, { zoom, x: -r.width * fraction / zoom, y: -r.height * fraction / zoom });
      TD.app.render();
      const origin = point(0, 0, canvas);
      const rx = document.querySelector('#rulerX svg'), ry = document.querySelector('#rulerY svg');
      const xzero = [...rx.querySelectorAll('text')].find((t) => t.textContent === '0');
      const yzero = [...ry.querySelectorAll('text')].find((t) => t.textContent === '0');
      T.ok(xzero && yzero, 'both zeros are visible');
      T.ok(Math.abs(point(+xzero.getAttribute('x') - 3, 0, rx).x - origin.x) < 1.1, `horizontal zero at zoom ${zoom}, pan ${fraction}`);
      const y = +/translate\(9 ([^)]+)\)/.exec(yzero.getAttribute('transform'))[1] + 3;
      T.ok(Math.abs(point(0, y, ry).y - origin.y) < 1.1, `vertical zero at zoom ${zoom}, pan ${fraction}`);
      for (const tick of rx.querySelectorAll('text')) {
        const cm = +tick.textContent.replace('−', '-');
        T.ok(Math.abs(point(+tick.getAttribute('x') - 3, 0, rx).x - point(cm * TD.PX_PER_CM, 0, canvas).x) < 1.1, `x tick ${cm}`);
      }
      for (const tick of ry.querySelectorAll('text')) {
        const cm = +tick.textContent.replace('−', '-');
        const pos = +/translate\(9 ([^)]+)\)/.exec(tick.getAttribute('transform'))[1] + 3;
        T.ok(Math.abs(point(0, pos, ry).y - point(0, -cm * TD.PX_PER_CM, canvas).y) < 1.1, `y tick ${cm}`);
      }
    }
  }
});

T.test('View updates: measure the viewport before SVG writes during pan and zoom', () => {
  const previousId = TD.state.docId, previousMode = TD.state.mode;
  TD.app.newDoc('View read/write order', null, null, null, null, 'page');
  const canvas = document.querySelector('#canvas');
  const rect = canvas.getBoundingClientRect();
  const originalRead = canvas.getBoundingClientRect, originalWrite = canvas.setAttribute;
  let wrote = false, lateReads = 0, reads = 0;
  canvas.getBoundingClientRect = function (...args) {
    reads++;
    if (wrote) lateReads++;
    return originalRead.apply(this, args);
  };
  canvas.setAttribute = function (...args) {
    wrote = true;
    return originalWrite.apply(this, args);
  };
  try {
    for (const [ctrlKey, deltaX, deltaY] of [[false, 20, 30], [true, 0, -10], [false, -20, -30], [true, 0, 10]]) {
      wrote = false; lateReads = reads = 0;
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey, deltaX, deltaY,
        clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
      T.ok(reads > 0 && wrote, 'view update measured the current viewport and updated the canvas');
      T.eq(lateReads, 0, 'no geometry read forces layout after the SVG update starts');
    }
  } finally {
    delete canvas.getBoundingClientRect;
    delete canvas.setAttribute;
    TD.app.cmd.openDoc(previousId);
    TD.app.cmd.setMode(previousMode);
  }
});
