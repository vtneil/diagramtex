// Open the in-place text editor from code that isn't Svelte: openTextPopup(host, opts). The same shape as
// TD.input.popup, so its callers can move over as they are: `at()` gives the box's top centre in host pixels,
// `place()` follows the anchor after a pan or zoom, `close()` finishes it. Finishing (Enter, Esc, a click away,
// or close()) calls onDone once, and the box fades out and goes.
import { flushSync, mount, unmount } from 'svelte';
import TextPopup, { type TextPopupKind } from './TextPopup.svelte';

export interface TextPopupOptions {
  text?: string; kind?: TextPopupKind; math?: boolean; bare?: boolean; prose?: boolean; mode?: 'latex' | 'mathlive';
  start?: 'math' | 'text'; caret?: 'all' | 'end' | number; roomy?: boolean;
  /** px, or a function read again on place() (a paragraph frame's width at the current zoom) */
  width?: number | (() => number); placeholder?: string; label?: string;
  at(): [number, number];
  onInput?(text: string): void;
  onDone(): void;
  /** MathLive couldn't load: the edit goes on in LaTeX */
  onFallback?(): void;
}
export interface TextPopupHandle { place(): void; close(): void }

export function openTextPopup(host: HTMLElement, opts: TextPopupOptions): TextPopupHandle {
  const [x, y] = opts.at();
  const widthNow = () => (typeof opts.width === 'function' ? opts.width() : opts.width);
  const props = $state({ x, y, width: widthNow() });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    opts.onDone();
    unmount(popup, { outro: true }); // it fades out, then goes
  };
  const popup = mount(TextPopup, {
    target: host,
    props: {
      get x() { return props.x; }, get y() { return props.y; },
      get width() { return props.width; },
      value: opts.text ?? '', kind: opts.kind, math: opts.math, bare: opts.bare, prose: opts.prose, mode: opts.mode,
      start: opts.start, caret: opts.caret, roomy: opts.roomy, placeholder: opts.placeholder, label: opts.label,
      oninput: (text: string) => opts.onInput?.(text),
      ondone: close,
      onfallback: () => opts.onFallback?.(),
    },
  }) as { place(): void };
  flushSync(); // in the page, holding its text, when this returns (as TD.input.popup always was)
  return {
    place() { if (closed) return; const [nx, ny] = opts.at(); props.x = nx; props.y = ny; props.width = widthNow(); flushSync(); popup.place(); },
    close,
  };
}
