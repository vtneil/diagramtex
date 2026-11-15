import { message as msg } from '../../i18n';
import Dialog from '../Dialog.svelte';
import { mountFrame } from '../mount-frame';
import { unmount } from 'svelte';
import { runtime as TD } from '../../runtime';
// In-app dialogs replacing the browser's alert / confirm / prompt, styled like the rest of the app.
// Each returns a Promise:  TD.confirm(...) → true/false,  TD.prompt(...) → string or null,  TD.alert(...) → undefined.
// Keyboard: Enter activates the focused button (the default one when the focus is in the text field),
// Esc cancels, Tab stays inside the dialog. Focus returns to where it was when the dialog closes.
// Destructive confirmations show the action in red and start with the focus on Cancel (Apple HIG: a
// destructive action shouldn't be the one a stray Return triggers).
(function () {
  'use strict';
  const esc = (t: any) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  let open: any = null; // { finish } of the dialog on screen; a new one cancels it

  function dialog({ title, message = '', input = null, multiline = false, ok = msg("ui.ok", 'OK'), cancel = msg("ui.cancel", 'Cancel'), danger = false, readonly = false, placeholder = '' }: any) {
    if (open) open.finish(false);
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'td-dialog';
    const component = mountFrame(root, Dialog, { title, message, input, multiline, ok, cancel, danger, readonly, placeholder });
    document.body.appendChild(root);
    const box = root.firstElementChild, inp = root.querySelector('.tdd-in');
    const okBtn = root.querySelector('[data-r="1"]'), cancelBtn = root.querySelector('[data-r="0"]');

    return new Promise<boolean | string | null | undefined>((resolve) => {
      function finish(yes: any) {
        if (!root.isConnected) return;
        void unmount(component); root.remove(); open = null;
        resolve(input == null ? (cancel ? yes : undefined) : yes ? (inp! as HTMLInputElement).value : null);
        if (prev && prev.isConnected && (prev as HTMLElement).focus) (prev as HTMLElement).focus({ preventScroll: true });
      }
      open = { finish };
      root.addEventListener('click', (e) => {
        const b = (e.target! as Element).closest('[data-r]');
        if (b) finish((b as HTMLElement).dataset.r === '1');
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
          const f = [...box!.querySelectorAll('input, textarea, button')];
          const i = f.indexOf(document.activeElement!), n = f.length;
          e.preventDefault();
          (f[(i + (e.shiftKey ? n - 1 : 1)) % n] as HTMLElement).focus();
        }
      });
      requestAnimationFrame(() => {
        if (inp) { (inp as HTMLElement).focus(); (inp as HTMLInputElement).select(); }
        else ((danger && cancelBtn ? cancelBtn : okBtn)! as HTMLElement).focus();
      });
    });
  }

  TD.dialog = dialog;
  TD.confirm = (title, message, opts = {}) => dialog({ title, message, ok: msg("ui.ok", 'OK'), ...opts }) as Promise<boolean>;
  TD.prompt = (title: any, value = '', opts = {}) => dialog({ title, input: value, ...opts });
  TD.alert = (title: any, message: any, opts = {}) => dialog({ title, message, cancel: null, ...opts });
})();
