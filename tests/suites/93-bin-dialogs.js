// The Recycle Bin and Recovery Copies dialogs (ui/BinDialog.svelte, ui/RecoveryDialog.svelte, opened by application/app.ts):
// restore, delete for good, empty, Esc, Tab kept inside, the recovery settings, and a fade that lets them open again at once.
{
  const inDb = k => TD.docStore.active && TD.docStore.owns(k);
  const get = k => { const t = inDb(k) ? TD.docStore.get(k) : localStorage.getItem(k); return t ? JSON.parse(t) : null; };
  const put = (k, v) => inDb(k) ? TD.docStore.set(k, JSON.stringify(v)) : localStorage.setItem(k, JSON.stringify(v));
  const rect = (id, x) => ({ id, type: 'rect', x, y: 0, w: 20, h: 20, stroke: '#000000', width: 1 });
  const C = TD.app.cmd, listed = id => get('diagramtex.index').some(x => x.id === id), inBin = id => (get('diagramtex.bin') || []).some(x => x.id === id);
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const key = (k, target, shift = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  const cleanup = (...list) => {
    put('diagramtex.index', get('diagramtex.index').filter(x => !list.includes(x.id)));
    put('diagramtex.bin', (get('diagramtex.bin') || []).filter(x => !list.includes(x.id)));
    for (const id of list) { TD.docStore.del?.('diagramtex.doc.' + id); TD.app.recovery.forget(id); }
  };

  T.test('bin dialog: lists deleted files; Restore, Delete for good and Empty Bin work; Esc closes; it opens again at once', async () => {
    const confirm = TD.confirm;
    const keep = TD.app.newDoc('bin keep', [rect('k', 0)], null, null), a = TD.app.newDoc('bin A', [rect('a', 0)], null, null), b = TD.app.newDoc('bin B', [rect('b', 0)], null, null);
    try {
      C.openDoc(keep); C.docAction('del', a); C.docAction('del', b);
      C.openBin(); await wait();
      const dlg = () => document.querySelector('#binDlg');
      const rowOf = id => [...dlg().querySelectorAll('li[data-ids]')].find(li => li.dataset.ids.split(',').includes(id));
      T.ok(dlg() && dlg().querySelector('.tdd-box[aria-modal="true"]'), 'a modal dialog');
      T.ok(rowOf(a) && rowOf(b), 'both deleted files are listed');
      T.ok(!dlg().querySelector('.bin-empty').disabled, 'Empty Bin is offered');
      T.eq(document.activeElement, dlg().querySelector('.bin-restore'), 'the focus starts on the first Restore');
      // Tab stays inside
      const buttons = [...dlg().querySelectorAll('button:not([disabled])')];
      buttons.at(-1).focus(); key('Tab', buttons.at(-1));
      T.eq(document.activeElement, buttons[0], 'Tab wraps to the first button');
      // delete for good, after the confirmation
      TD.confirm = async () => true;
      rowOf(b).querySelector('.bin-erase').click(); await wait();
      T.ok(!inBin(b) && !rowOf(b), 'deleted for good and gone from the list');
      // restore closes the dialog and brings the file back
      rowOf(a).querySelector('.bin-restore').click(); await wait();
      T.ok(!document.querySelector('#binDlg'), 'Restore closes it');
      T.ok(listed(a) && !inBin(a), 'the file is back in the list');
      // it opens again at once, while the last one still fades; Esc closes it
      C.openBin(); await wait();
      T.ok(dlg(), 'opens again straight away');
      key('Escape', dlg().querySelector('.bin-done'));
      T.ok(!document.querySelector('#binDlg'), 'Esc closes it');
      // empty the bin
      C.docAction('del', a); C.openBin(); await wait();
      dlg().querySelector('.bin-empty').click(); await wait();
      T.eq((get('diagramtex.bin') || []).length, 0, 'Empty Bin removes everything');
      T.ok(dlg().querySelector('.bin-empty').disabled, 'and is then not offered');
      T.ok(dlg().querySelector('.bin-none'), 'the list says it is empty');
      dlg().querySelector('.bin-done').click();
      await wait(450);
      T.ok(!document.querySelector('.td-dialog-leaving'), 'the faded dialog is gone');
    } finally { TD.confirm = confirm; document.querySelector('#binDlg .bin-done')?.click(); cleanup(keep, a, b); }
  });

  T.test('recovery dialog: settings change and are kept, Done and Esc close it', async () => {
    const before = localStorage.getItem('diagramtex.recovery');
    const id = TD.app.newDoc('recovery dialog', [rect('r', 0)], null, null);
    try {
      C.openRecovery(id); await wait();
      const dlg = () => document.querySelector('#recDlg');
      T.ok(dlg() && /recovery dialog/.test(dlg().querySelector('.bin-sub').textContent), 'names the file');
      T.ok(dlg().querySelector('.bin-none'), 'no copies yet');
      const keep = dlg().querySelector('select[name="keep"]');
      keep.value = keep.options[0].value; keep.dispatchEvent(new Event('change', { bubbles: true })); await wait();
      T.eq(JSON.parse(localStorage.getItem('diagramtex.recovery')).keep, +keep.options[0].value, 'the setting is stored');
      T.eq(dlg().querySelector('select[name="keep"]').value, keep.options[0].value, 'and shown');
      const every = dlg().querySelector('select[name="every"]');
      every.value = '0'; every.dispatchEvent(new Event('change', { bubbles: true })); await wait();
      T.ok(/no longer kept/.test(dlg().querySelector('.bin-sub').textContent), 'turned off: says so');
      dlg().querySelector('.rec-done').click();
      T.ok(!dlg(), 'Done closes it');
      C.openRecovery(id); await wait();
      T.ok(dlg(), 'opens again straight away');
      key('Escape', dlg().querySelector('.rec-done'));
      T.ok(!dlg(), 'Esc closes it');
    } finally {
      document.querySelector('#recDlg .rec-done')?.click();
      if (before == null) localStorage.removeItem('diagramtex.recovery'); else localStorage.setItem('diagramtex.recovery', before);
      cleanup(id);
    }
  });
}
