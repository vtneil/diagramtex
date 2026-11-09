// In-app dialogs replacing the browser's alert / confirm / prompt, styled like the rest of the app.
// Each returns a Promise:  TD.confirm(...) → true/false,  TD.prompt(...) → string or null,  TD.alert(...) → undefined.
// Keyboard: Enter activates the focused button (the default one when the focus is in the text field),
// Esc cancels, Tab stays inside the dialog. Focus returns to where it was when the dialog closes.
// Destructive confirmations show the action in red and start with the focus on Cancel (Apple HIG: a
// destructive action shouldn't be the one a stray Return triggers).
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let open = null; // { finish } of the dialog on screen; a new one cancels it

  function dialog({ title, message = '', input = null, multiline = false, ok = 'OK', cancel = 'Cancel', danger = false, readonly = false }) {
    if (open) open.finish(false);
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'td-dialog';
    const field = input == null ? ''
      : multiline ? `<textarea class="tdd-in" rows="8" spellcheck="false"${readonly ? ' readonly' : ''}>${esc(input)}</textarea>`
        : `<input class="tdd-in" type="text" value="${esc(input)}" spellcheck="false" autocomplete="off">`;
    root.innerHTML = `<div class="tdd-box" role="${danger ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="tddTitle" aria-describedby="tddMsg">
      <h2 id="tddTitle">${esc(title)}</h2>${message ? `<p id="tddMsg">${esc(message)}</p>` : ''}${field}
      <div class="tdd-btns">${cancel ? `<button type="button" data-r="0">${esc(cancel)}</button>` : ''}<button type="button" data-r="1" class="${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div></div>`;
    document.body.appendChild(root);
    const box = root.firstElementChild, inp = root.querySelector('.tdd-in');
    const okBtn = root.querySelector('[data-r="1"]'), cancelBtn = root.querySelector('[data-r="0"]');

    return new Promise((resolve) => {
      function finish(yes) {
        if (!root.isConnected) return;
        root.remove(); open = null;
        resolve(input == null ? (cancel ? yes : undefined) : yes ? inp.value : null);
        if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
      }
      open = { finish };
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) finish(b.dataset.r === '1');
      });
      // a press on the scrim does nothing (as with a native modal); stop it reaching the app's
      // click-outside handlers, which would otherwise close editors behind the dialog
      for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, (e) => { e.stopPropagation(); if (e.target === root) e.preventDefault(); });
      root.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finish(!cancel); return; }
        if (e.key === 'Enter' && !(multiline && e.target === inp && !(e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          finish(e.target === cancelBtn ? false : e.target === okBtn || e.target === inp || !danger ? true : false);
          return;
        }
        if (e.key === 'Tab') { // keep the focus inside
          const f = [...box.querySelectorAll('input, textarea, button')];
          const i = f.indexOf(document.activeElement), n = f.length;
          e.preventDefault();
          f[(i + (e.shiftKey ? n - 1 : 1)) % n].focus();
        }
      });
      requestAnimationFrame(() => {
        if (inp) { inp.focus(); inp.select(); }
        else (danger && cancelBtn ? cancelBtn : okBtn).focus();
      });
    });
  }

  TD.dialog = dialog;
  TD.confirm = (title, message, opts = {}) => dialog({ title, message, ok: 'OK', ...opts });
  TD.prompt = (title, value = '', opts = {}) => dialog({ title, input: value, ...opts });
  TD.alert = (title, message, opts = {}) => dialog({ title, message, cancel: null, ...opts });
})();
