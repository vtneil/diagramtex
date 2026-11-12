// Integration guardrails for extension contracts; golden fixtures and markup are from the baseline.
const key = (k, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const menuDescription = (root) => [...root.querySelectorAll('button')].map((b) => ({
  type: b.dataset.insert, title: b.title || b.dataset.tip, label: b.textContent,
  icon: b.querySelector('svg').outerHTML, class: b.className,
  disabled: b.getAttribute('aria-disabled'), tabindex: b.getAttribute('tabindex'),
}));
T.test('architecture: generated block menu preserves baseline labels, icons, order and placeholders', () => {
  const baseline = document.createElement('div');
  baseline.innerHTML = T.fixtures['ui/block-menu.html'];
  T.eq(menuDescription(document.querySelector('#fly-blocks')), menuDescription(baseline));
});

T.test('architecture: every block editor opens through Enter, panel alias and context command; saves undo together', () => {
  for (const [type, definition] of TD.blocks.entries()) {
    if (!definition.editor) continue;
    TD.app.newDoc('Block integration', null, null, null, null, 'board');
    const s = T.make(type);
    TD.state.doc.shapes.push(s); TD.state.sel = new Set([s.id]);
    TD.app.render(); TD.app.renderProps();
    const view = definition.editor.get(), original = view.open;
    let calls = 0, done;
    view.open = (shape, callback, options) => {
      calls++; done = callback; T.eq(shape.id, s.id, type);
      if (type === 'geo2d') T.eq(options, { flat: true });
      if (type === 'xy') T.ok(options === TD.xy);
    };
    try {
      document.activeElement?.blur();
      key('Enter'); T.eq(calls, 1, type + ' Enter');
      TD[definition.editor.alias](s.id); T.eq(calls, 2, type + ' panel API');
      const ctx = document.querySelector('#ctxMenu');
      const button = document.createElement('button'); button.dataset.ctx = 'edit';
      ctx.appendChild(button); button.click(); button.remove();
      T.eq(calls, 3, type + ' context command');
      const before = JSON.stringify(s);
      done(type === 'cz' ? { items: s.items, raw: s.raw } : { src: s.src + '\n% integration test' });
      if (type !== 'cz') {
        T.eq(TD.state.undo.length, 1, type + ' single document undo step');
        key('z', { ctrlKey: true, metaKey: true });
        T.eq(JSON.stringify(TD.state.doc.shapes[0]), before, type + ' undo restores source and placement');
        key('z', { ctrlKey: true, metaKey: true, shiftKey: true });
        T.ok(TD.state.doc.shapes[0].src.endsWith('% integration test'), type + ' redo');
      }
      // A late callback must not resurrect a deleted object.
      TD.state.doc.shapes = [];
      done(type === 'cz' ? { items: [], raw: [] } : { src: s.src });
      T.eq(TD.state.doc.shapes.length, 0, type + ' deleted object');
    } finally { view.open = original; }
  }
});

for (const [type, editorName, modalId, action] of [
  ['kmap', 'kmapEditor', 'kmModal', 'ke'], ['bytefield', 'bytefieldEditor', 'bfModal', 'be'],
]) T.test(`architecture: ${type} editor history, save, cancel and reopen keep their lifecycle`, async () => {
  const block = T.make(type), saves = [], originalConfirm = TD.confirm;
  const root = document.getElementById(modalId), code = root.querySelector('.cz-code textarea');
  const click = (name) => root.querySelector(`[data-${action}="${name}"]`).click();
  const typeCode = async (src) => { code.focus(); code.value = src; code.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); code.blur(); };
  try {
    TD[editorName].open(block, (r) => saves.push(r.src));
    const initial = code.value, changed = initial + '\n% preserve this comment';
    await typeCode(changed);
    click('undo'); T.eq(code.value, initial, 'undo');
    click('redo'); T.eq(code.value, changed, 'redo');
    T.ok(TD.unsaved.some((f) => f()), 'unapplied edits reported');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, metaKey: true, bubbles: true }));
    T.eq(saves, [changed], 'save writes back without closing');
    T.ok(!root.hidden, 'stays open after Save');
    T.ok(!TD.unsaved.some((f) => f()), 'saved editor no longer dirty');
    click('cancel'); await tick();
    T.ok(root.hidden, 'Cancel after Save closes without discarding saved edits');
    TD[editorName].open(block, (r) => saves.push(r.src));
    T.ok(root.querySelector(`[data-${action}="undo"]`).disabled, 'new session has fresh history');
    await typeCode(changed);
    TD.confirm = async () => false;
    click('cancel'); await tick(); T.ok(!root.hidden, 'declined discard stays open');
    TD.confirm = async () => true;
    click('cancel'); await tick(); T.ok(root.hidden, 'confirmed discard closes');
    T.eq(saves.length, 1, 'cancel never writes back');
    TD[editorName].open(block, (r) => saves.push(r.src));
    await typeCode(changed); click('done'); await tick();
    T.ok(root.hidden, 'Done closes'); T.eq(saves, [changed, changed], 'Done applies changed source');
  } finally { TD.confirm = async () => true; if (!root.hidden) { click('cancel'); await tick(); } TD.confirm = originalConfirm; }
});

T.test('architecture: project codec preserves v3 bytes and idempotent legacy migrations', () => {
  const shapes = [T.make('rect')];
  for (const kind of ['classic', 'board', 'page']) {
    const doc = { kind, name: 'Codec', page: { paper: 'A4' }, blocks: [{ type: 'diagram', shapes }], sheet: { pages: 2, shapes, vars: { gap: '2' } } };
    const before = JSON.stringify({ app: 'diagramtex', version: 3, kind, name: doc.name, page: doc.page,
      ...(kind === 'page' ? { sheet: doc.sheet } : { blocks: doc.blocks }) }, null, 1);
    T.eq(TD.projectFiles.stringify(doc), before, kind + ' same wire format');
    const parsed = TD.projectFiles.parse(before);
    T.eq(TD.projectFiles.stringify(parsed), before, kind + ' save/open');
  }
  const old = { shapes: [{ type: 'sketch3d' }, ...shapes] };
  T.eq(TD.projectFiles.dropRetiredDoc(old), 1);
  T.eq(TD.projectFiles.dropRetiredDoc(old), 0, 'migration idempotent');
  const parsed = TD.projectFiles.parse(JSON.stringify(old));
  T.eq(parsed.blocks[0].shapes, shapes, 'old shape array becomes a diagram');
  T.eq(TD.projectFiles.parse('not json'), false);
  T.eq(TD.projectFiles.parse('null'), false);
  for (const bad of [{ blocks: {} }, { kind: 'page', sheet: {} }, { shapes: [{ type: 'unknown' }] }]) {
    let threw = false; try { TD.projectFiles.parse(JSON.stringify(bad)); } catch { threw = true; }
    T.ok(threw, 'invalid shape/block structure rejected');
  }
});
