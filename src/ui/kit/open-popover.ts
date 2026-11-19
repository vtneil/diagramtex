// Open the kit's Popover from code that builds its panel as an HTML string (the Export panels):
// openPopover(anchor, { content(body) { body.innerHTML = … } }). `content` fills the panel's body before it is placed,
// so it opens at its full size; the caller may fill `body` again later and the popover follows its new size. It
// closes on Esc or a press outside it (then `onclose`), or by `close()`; either way it fades out and goes.
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import Popover from './Popover.svelte';
import type { PopoverPlacement } from './popover';

export interface PopoverOptions {
  placement?: PopoverPlacement;
  inset?: 4 | 8 | 12;
  /** px; otherwise as wide as its content */
  width?: number;
  label?: string;
  role?: string;
  class?: string;
  /** move focus to its first control as it opens */
  focusFirst?: boolean;
  content?: (body: HTMLElement) => void;
  onclose?: () => void;
}

export interface PopoverHandle {
  /** the popover itself (`.popover.kit-pop`) */
  readonly el: HTMLElement;
  /** what the caller fills (`display: contents`, so its children are the popover's) */
  readonly body: HTMLElement;
  readonly closed: boolean;
  close(): void;
}

export function openPopover(anchor: Element | DOMRect, opts: PopoverOptions = {}): PopoverHandle {
  let body: HTMLElement | null = null, closed = false;
  const children = createRawSnippet(() => ({
    render: () => '<div class="pop-body"></div>',
    setup: (node: Element) => { body = node as HTMLElement; opts.content?.(body); },
  }));
  const close = () => {
    if (closed) return;
    closed = true;
    void unmount(comp, { outro: true });
    opts.onclose?.();
  };
  const comp = mount(Popover, {
    target: document.body,
    props: {
      anchor, placement: opts.placement ?? 'below', inset: opts.inset ?? 12, width: opts.width, label: opts.label,
      role: opts.role ?? 'dialog', class: opts.class, focusFirst: opts.focusFirst ?? false, onclose: close, children,
    },
  });
  flushSync();
  return { get el() { return body!.parentElement!; }, get body() { return body!; }, get closed() { return closed; }, close };
}
