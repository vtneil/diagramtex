// Behavioral boundaries introduced by the TypeScript/Svelte migration.
T.test('migration: document factory preserves live shape aliases and upgrades', () => {
  const upgraded = [], make = TD.createDocumentFactory({ uid: () => 'generated', upgrade: s => upgraded.push(s.type), pageDefaults: { paper: 'a4' } });
  const blocks = [{ type: 'diagram', shapes: [{ type: 'rect' }] }];
  const doc = make('Typed core', blocks, 12);
  T.eq(doc.active, 0); T.eq(doc.shapes[0].id, 'generated'); T.eq(upgraded, ['rect']);
  T.ok(!Object.keys(doc).includes('shapes'), 'alias is not persisted twice');
  const replacement = [{ id: 'new', type: 'ellipse' }];
  doc.shapes = replacement; T.ok(doc.blocks[0].shapes === replacement);
  doc.kind = 'page'; doc.shapes = [];
  T.eq(doc.sheet.shapes, []); T.ok(doc.blocks[0].shapes === replacement, 'page alias does not replace diagram');
});

T.test('migration: document history restores deletion, insertion, order, variables and page counts', () => {
  const make = TD.createDocumentFactory({ uid: () => 'id', upgrade() {}, pageDefaults: {} });
  const doc = make('History', undefined, undefined, undefined,
    { pages: 2, shapes: [{ id: 'a', type: 'rect', x: 1 }, { id: 'b', type: 'rect', x: 2 }], vars: { gap: '2' } }, 'page');
  const state = { doc, sel: new Set(['a', 'b']), undo: [], redo: [] };
  let changes = 0, applications = 0;
  const history = TD.createDocumentHistory(state, { syncLinks() {}, changed() { changes++; }, applied() { applications++; }, updateTools() {} });
  const initial = JSON.stringify(doc.sheet);
  history.begin(); doc.shapes[0].x = 9;
  doc.shapes.splice(1, 1, { id: 'c', type: 'ellipse', x: 3 });
  doc.shapes.reverse(); doc.sheet.vars = { gap: '4' }; doc.sheet.pages = 3;
  history.commit(); const edited = JSON.stringify(doc.sheet);
  T.eq(state.undo.length, 1); T.eq(changes, 1);
  history.apply(state.undo[0], true); T.eq(JSON.stringify(doc.sheet), initial);
  history.apply(state.undo[0], false); T.eq(JSON.stringify(doc.sheet), edited);
  T.ok(!state.sel.has('b'), 'selection loses deleted IDs'); T.eq(applications, 2);
  history.begin(); history.commit(); T.eq(state.undo.length, 1, 'applying history refreshes its baseline');
  history.begin(); doc.shapes[0].x = 12; history.commit(); T.eq(state.undo.length, 2);
  history.apply(state.undo[1], true); T.eq(JSON.stringify(doc.sheet), edited);
});

function migrationBloch() {
  TD.app.newDoc('Svelte panel', null, null, null, null, 'board');
  const shape = T.make('bloch');
  TD.state.doc.shapes.push(shape); TD.state.sel = new Set([shape.id]);
  TD.app.render(); TD.app.renderProps();
  return shape;
}
const migrationUndo = shift => {
  document.activeElement?.blur();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, shiftKey: shift, bubbles: true }));
};
T.test('migration: Svelte angle input updates its counterpart and commits one undo step', () => {
  const shape = migrationBloch(), original = shape.src;
  const field = document.querySelector('[data-bkn="tilt"]'); field.focus();
  field.value = '25'; field.dispatchEvent(new Event('input', { bubbles: true }));
  T.ok(document.activeElement === field); T.ok(field.isConnected, 'focused control is retained');
  T.eq(document.querySelector('[data-bk="tilt"]').value, '25');
  T.ok(shape.src.includes('tilt=25')); T.eq(TD.state.undo.length, 0);
  field.dispatchEvent(new Event('change', { bubbles: true }));
  T.eq(TD.state.undo.length, 1);
  migrationUndo(false); T.eq(TD.state.doc.shapes[0].src, original);
  migrationUndo(true); T.ok(TD.state.doc.shapes[0].src.includes('tilt=25'));
});
T.test('migration: Svelte labels preserve focus, caret and raw source while other fields update', () => {
  const shape = migrationBloch();
  const field = document.querySelector('[data-sl="0"]'); field.focus();
  field.value = '\\alpha + x'; field.setSelectionRange(3, 3);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  T.ok(document.activeElement === field); T.eq(field.selectionStart, 3); T.eq(field.value, '\\alpha + x');
  T.ok(document.querySelector('[data-p="src"]').value.includes('\\alpha + x'));
  field.dispatchEvent(new Event('change', { bubbles: true })); field.blur();
  const code = document.querySelector('[data-p="src"]'); code.focus();
  code.value = shape.src + '\n% retain handwritten source'; code.setSelectionRange(7, 7);
  code.dispatchEvent(new Event('input', { bubbles: true }));
  T.ok(document.activeElement === code); T.eq(code.selectionStart, 7);
  T.ok(shape.src.endsWith('% retain handwritten source'));
  code.dispatchEvent(new Event('change', { bubbles: true })); code.blur();
  T.eq(TD.state.undo.length, 2, 'label and source have separate transactions');
});
T.test('migration: a focused number field keeps its typed text through live updates, then shows the model', async () => {
  const shape = migrationBloch();
  const radius = document.getElementById('bloch-radius'); radius.focus();
  // Typing "0", ".", "5": each keystroke fires input and re-renders the panel while the field is focused.
  for (const typed of ['0', '0.5']) { radius.value = typed; radius.dispatchEvent(new Event('input', { bubbles: true })); }
  T.eq(radius.value, '0.5', 'the re-render did not overwrite the typed value');
  T.ok(/radius=0\.5cm/.test(shape.src), 'the source received 0.5, not 50');
  const tilt = document.querySelector('[data-bkn="tilt"]'); tilt.focus();
  tilt.value = '-30'; tilt.dispatchEvent(new Event('input', { bubbles: true }));
  T.eq(tilt.value, '-30'); T.ok(/tilt=-30\b/.test(shape.src), 'negative angle kept its sign');
  // A value the application rejected (no model change) is replaced by the model's once focus leaves.
  // (Headless Chrome has no window focus, so blur is dispatched by hand.)
  radius.focus(); radius.value = '7'; radius.blur(); radius.dispatchEvent(new FocusEvent('blur'));
  await new Promise(r => setTimeout(r, 10));
  T.eq(radius.value, '0.5', 'shows the model after blur');
});
T.test('migration: Svelte state rows, colour fields and ball actions use existing domain commands', () => {
  const shape = migrationBloch(), original = shape.src;
  document.querySelector('[data-panel] [data-act="addstate"]').click();
  T.eq(document.querySelectorAll('[data-sl]').length, 2); T.eq(TD.state.undo.length, 1);
  const colour = document.querySelector('[data-bc="states"]');
  colour.value = 'red'; colour.dispatchEvent(new Event('input', { bubbles: true }));
  colour.dispatchEvent(new Event('change', { bubbles: true }));
  T.ok(shape.src.includes('statecolor=red'));
  document.querySelector('[data-panel] [data-act="ball:circle"]').click();
  T.ok(shape.src.includes('ball=circle')); T.ok(shape.src.includes('color=black'));
  document.querySelector('[data-panel] [data-act="delstate:1"]').click();
  T.eq(document.querySelectorAll('[data-sl]').length, 1);
  for (let i = 0; i < 4; i++) migrationUndo(false);
  T.eq(TD.state.doc.shapes[0].src, original, 'every action restores original source');
});
T.test('migration: Svelte panel unmounts and remounts across selections and document kinds', () => {
  migrationBloch();
  for (const kind of ['classic', 'page', 'board']) {
    TD.state.sel.clear(); TD.app.renderProps();
    T.eq(document.querySelectorAll('[data-panel="bloch"]').length, 0);
    TD.app.newDoc('Next document', null, null, null, null, kind);
    const shape = T.make('bloch');
    TD.state.doc.shapes.push(shape); TD.state.sel = new Set([shape.id]);
    if (kind === 'classic') TD.app.setMode('diagram');
    TD.app.render(); TD.app.renderProps();
    T.eq(document.querySelectorAll('[data-panel="bloch"]').length, 1);
    T.eq(document.querySelectorAll('[data-bk="tilt"]').length, 1);
  }
});

T.test('migration: every domain panel has a Svelte view', () => {
  for (const type of Object.keys(TD.panels)) T.ok(TD.panelViews[type], `${type} has a component view`);
});

T.test('migration: switching an editor inspector removes obsolete switch highlights', async () => {
  TD.app.newDoc('Inspector lifecycle', null, null, null, null, 'board');
  document.activeElement?.blur();
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (let i = 0; i < 2; i++) {
    TD.qcEditor.open(T.make('qc'), () => {});
    await frame();
    const modal = document.getElementById('qcModal');
    modal.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true}));
    await frame();
    const span = modal.querySelector('input[data-f="span"]');
    T.ok(span, 'selected input label exposes its wire count');
    T.eq(span.value, '1');
    T.ok(!span.parentElement.querySelector('.seg-thumb'), 'numeric input is unobscured after a segmented control occupied this row');
    modal.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,bubbles:true}));
    T.ok(modal.hidden, 'unchanged editor closes normally');
  }
});

T.test('migration: inspector labels resolve to labelable controls across style variants', () => {
  TD.app.newDoc('Inspector labels', null, null, null, null, 'board');
  const verify = context => {
    const panel = document.querySelector('#props');
    for (const label of panel.querySelectorAll('label[for]')) {
      T.ok(label.control, context + ': invalid label target ' + label.htmlFor);
      T.ok(panel.contains(label.control), context + ': target belongs to the inspector');
    }
  };
  TD.state.sel = new Set(); TD.app.render(); TD.app.renderProps(); verify('defaults');
  for (const key of ['color', 'ballColor', 'stroke', 'fill']) {
    const button = document.querySelector('#f-' + key);
    T.ok(button && button.labels.length, key + ' colour button has its visible label');
  }
  for (const type of ['text', 'rect', 'line', 'ball']) {
    const shape = T.make(type);
    TD.state.doc.shapes = [shape]; TD.state.sel = new Set([shape.id]);
    TD.app.render(); TD.app.renderProps(); verify(type);
    if (type === 'text') {
      T.ok(document.querySelector('[role="group"][aria-labelledby="f-bold-label"]'), 'bold/italic caption names its group');
      T.ok(document.querySelector('#f-align-label'), 'alignment has a group caption');
      T.ok(document.querySelector('#f-valign-label'), 'vertical alignment has a group caption');
    }
  }
});

T.test('migration: block editor and panel TeX fields declare math vs text mode, highlight and suggest accordingly', async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const suggest = (el, val) => {
    el.focus();
    el.value = val;
    el.setSelectionRange(val.length, val.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const pop = document.getElementById('texComplete');
    return pop && !pop.hidden ? [...pop.querySelectorAll('.tc-name')].map(n => n.textContent) : [];
  };

  // 1. Main-canvas panels: bloch (math), plot/prim3d/solid (text)
  const bloch = migrationBloch();
  const sl = document.querySelector('[data-sl="0"]');
  T.eq(sl.dataset.tx, 'math', 'Bloch state label is math mode');
  sl.value = '$\\ket{+}$'; sl.dispatchEvent(new Event('input', { bubbles: true }));
  T.ok(!bloch.src.includes('$$'), 'Bloch state label strips outer $...$ instead of doubling');
  T.ok(suggest(sl, '\\al').includes('\\alpha'), 'Bloch state label suggests math commands without $');
  sl.blur();

  for (const type of ['plot', 'prim3d', 'revolve', 'solid']) {
    const sh = T.make(type);
    if (type === 'prim3d') sh.axes = true;
    TD.state.doc.shapes = [sh]; TD.state.sel = new Set([sh.id]);
    TD.app.render(); TD.app.renderProps();
    const xl = document.querySelector('#props input[data-p="xlabel"]');
    T.ok(xl && xl.dataset.tx === 'text', `${type} xlabel is text mode`);
    T.eq(xl.placeholder, 'Text, $math$', `${type} xlabel placeholder indicates $math$`);
  }

  // 2. Quantum editor: meter/gate/push are math, lstick/slice/group are text, permute is numeric
  TD.qcEditor.open( { ...T.make('qc'), src: '\\begin{quantikz}\n\\lstick{$\\ket{0}$} & \\gate{H} & \\meter{Z} & \\permute{2,1}\n\\end{quantikz}' }, () => {});
  await frame();
  const qcModal = document.getElementById('qcModal');
  const qcArg = () => qcModal.querySelector('.cz-props input[data-f="arg"]');
  // cell (0,0) is lstick (text)
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await frame();
  T.eq(qcArg().dataset.tx, 'text', 'quantikz lstick is text mode');
  T.eq(qcArg().placeholder, 'Text, $math$');
  T.ok(!suggest(qcArg(), '\\al').includes('\\alpha'), 'text mode outside $ does not suggest math-only \\alpha');
  T.ok(suggest(qcArg(), '$\\al').includes('\\alpha'), 'text mode inside $ suggests \\alpha');
  // cell (0,1) is gate (math)
  qcArg().blur();
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await frame();
  T.eq(qcArg().dataset.tx, 'math', 'quantikz gate is math mode');
  T.eq(qcArg().placeholder, 'Maths, without $');
  T.ok(suggest(qcArg(), '\\al').includes('\\alpha'), 'math mode suggests \\alpha immediately');
  T.ok(!suggest(qcArg(), '\\text{\\al').includes('\\alpha'), 'inside \\text{...} in a math field switches to text suggestions');
  // cell (0,2) is meter (math)
  qcArg().blur();
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await frame();
  T.eq(qcArg().dataset.tx, 'math', 'quantikz meter basis label is math mode');
  // cell (0,3) is permute (plain order list, no data-tx)
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await frame();
  T.ok(!qcArg().dataset.tx, 'quantikz permute order is not a TeX field');
  qcModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));

  // 3. Physics editor: command labels are text mode ($...$ for math)
  TD.blocks.get('physics').editor.get().open(T.make('physics'), () => {});
  await frame();
  const phyModal = document.getElementById('phyModal');
  phyModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  await frame();
  const phyLbl = phyModal.querySelector('.cz-props input[data-pf="label"]');
  T.ok(phyLbl && phyLbl.dataset.tx === 'text', 'physics label is text mode');
  T.eq(phyLbl.placeholder, 'none · $math$', 'physics label: empty means none');
  T.ok(!suggest(phyLbl, '\\al').includes('\\alpha'), 'physics label outside $ does not suggest math-only \\alpha');
  T.ok(suggest(phyLbl, '$\\al').includes('\\alpha'), 'physics label inside $ suggests \\alpha');
  await frame();
  const hl = phyLbl.nextElementSibling;
  T.ok(hl && hl.classList.contains('tx-hl') && hl.querySelector('.tx-m'), 'physics label highlights $...$ span in maths green');
  phyLbl.blur();
  phyModal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
});

