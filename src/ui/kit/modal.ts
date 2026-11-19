// Open and close a modal window that the page already holds (`.modal`, `#modal`; give it the class `fades`). It opens
// with the kit Dialog's motion (the scrim fades in, the box pops in from 97%) and closes the same way backwards. It is
// closed at once (`hidden`), so everything that asks sees it closed; `.modal-leaving` keeps it drawn while it fades.
const LEAVE_MS = 170;
const timers = new WeakMap<HTMLElement, number>();

export function openModal(el: HTMLElement) {
  clearTimeout(timers.get(el));
  el.classList.remove('modal-leaving');
  el.hidden = false;
}

export function closeModal(el: HTMLElement) {
  if (el.hidden) return;
  el.hidden = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.add('modal-leaving');
  timers.set(el, window.setTimeout(() => el.classList.remove('modal-leaving'), LEAVE_MS));
}

/** A `<dialog>` opened with showModal(): fade it out, then close it (its `close` event follows). */
export function closeDialogElement(dialog: HTMLDialogElement) {
  if (!dialog.open || dialog.classList.contains('leaving')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
  dialog.classList.add('leaving');
  window.setTimeout(() => dialog.close(), LEAVE_MS);
}

/** A `.td-dialog` (a dialog drawn into its own scrim on the body): at once no longer a dialog to anything that looks
 *  for one (editors' keys, [aria-modal] checks, screen readers), it fades out (kit.css, .td-dialog-leaving), then
 *  `done` removes it. Under reduced motion it goes at once. */
export function fadeOutDialog(root: HTMLElement, done: () => void) {
  let gone = false;
  const go = () => { if (!gone) { gone = true; done(); } };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  const box = root.querySelector('.tdd-box');
  root.className = 'td-dialog-leaving';
  box?.removeAttribute('aria-modal'); root.setAttribute('aria-hidden', 'true');
  box?.addEventListener('animationend', go, { once: true });
  setTimeout(go, 400); // in case no animation runs
}
