// Open the canvas's LaTeX text editor (TextDock.svelte) from code that isn't Svelte: openTextDock(host, opts), docked
// along the bottom of `host` (the canvas's #stage). The same handle as openTextPopup's, so the canvas's editing code
// takes either: `place()` (nothing to follow: it stays docked) and `close()`. Finishing (Done, Enter, Esc, a click
// away, or close()) calls onDone once; Cancel calls onCancel instead. It rises in, and sinks out and goes.
import { flushSync, mount, unmount } from 'svelte';
import TextDock, { type TextDockLook } from './TextDock.svelte';
import type { TextPopupHandle } from './kit';

export interface TextDockOptions {
  text?: string; title: string; placeholder?: string; label?: string;
  /** where the caret starts (otherwise the text is selected) */
  caret?: number;
  look?(): TextDockLook;
  onInput?(text: string): void;
  onDone(): void;
  /** Cancel: the caller puts the text back (and then finishes, as onDone does) */
  onCancel?(): void;
}

export function openTextDock(host: HTMLElement, opts: TextDockOptions): TextPopupHandle {
  let closed = false;
  const end = (cancelled: boolean) => {
    if (closed) return;
    closed = true;
    if (cancelled && opts.onCancel) opts.onCancel(); else opts.onDone();
    unmount(dock, { outro: true }); // it sinks out, then goes
  };
  const dock = mount(TextDock, {
    target: host, intro: true, // it rises in
    props: {
      value: opts.text ?? '', title: opts.title, placeholder: opts.placeholder, label: opts.label, caret: opts.caret,
      look: opts.look ? () => opts.look!() : undefined,
      oninput: (text: string) => opts.onInput?.(text),
      ondone: () => end(false),
      oncancel: () => end(true),
    },
  });
  flushSync(); // in the page, focused and holding its text, when this returns
  return { place() { /* docked: nothing to follow */ }, close: () => end(false) };
}
