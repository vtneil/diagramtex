// A block editor's code pane, wired the same way in every editor: typing reads the code a moment after the last key
// (250ms), and leaving the pane reads it at once and makes it one undo step, then writes it back as the editor would
// (its own layout of it). Copy puts the code on the clipboard and says so on the button for a moment.
import { t } from '../i18n';

/** state() is the editor's open state (null when closed), holding codeTimer and codeAt as each editor's does. */
export function wireCode(ta: HTMLTextAreaElement, ed: { state: () => any; read: () => void; commit: () => void; sync: () => void }) {
  ta.addEventListener('input', () => { const E = ed.state(); if (!E) return; clearTimeout(E.codeTimer); E.codeTimer = setTimeout(ed.read, 250); });
  ta.addEventListener('blur', () => { const E = ed.state(); if (!E) return; ed.read(); ed.commit(); E.codeAt = null; ed.sync(); });
}

export function copyCode(btn: Element, text: string) {
  navigator.clipboard?.writeText(text).then(() => { btn.textContent = t('ui.copied', 'Copied'); setTimeout(() => (btn.textContent = t('ui.copy', 'Copy')), 1200); });
}
