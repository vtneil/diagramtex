// The ⌘K search opened again while it fades out (120ms) stays open: the fade's timer no longer hides it, and ⌘K during
// the fade opens it rather than closing it a second time.
T.test('search: closed and opened again within its fade, it stays open', async () => {
  const cmdK = (target) => (target || document).dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  const root = () => document.querySelector('#cmdk'), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await wait(200); // an earlier test's search has faded out
    document.body.focus();
    TD.palette.open();
    T.ok(TD.palette.isOpen, 'open');
    TD.palette.close();
    T.ok(!TD.palette.isOpen, 'fading out counts as closed');
    TD.palette.open();
    await wait(160);
    T.ok(TD.palette.isOpen && !root().hidden, 'opened again within 120ms: still shown after the fade would have ended');
    TD.palette.close();
    cmdK(document.querySelector('#cmdkIn'));
    T.ok(TD.palette.isOpen, 'Ctrl+K during the fade opens it again');
    await wait(160);
    T.ok(!root().hidden && !root().classList.contains('closing'), 'and it stays shown');
  } finally { TD.palette.close(); }
});
