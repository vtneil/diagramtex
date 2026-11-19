// Open a menu from anywhere, Svelte or not: openContextMenu(items, x, y, pick). One menu is open at a time; a new
// one replaces it (and the old one's onclose runs). `anchor` places it beside a control instead of at a point, `below`
// under one; `class` adds a look (`qe-ctx` puts it above a block editor). It returns the menu's element, for a menu
// that opens on hover and stays while the pointer is over it.
import { mount, unmount, flushSync } from 'svelte';
import ContextMenu from './ContextMenu.svelte';
import type { MenuEntry } from './menu';

type Instance = { leave(): Promise<void>; element(): HTMLElement | undefined };
let current: { menu: Instance; onclose?: () => void } | null = null;

export interface ContextMenuOptions {
  anchor?: DOMRect; below?: DOMRect; label?: string; class?: string; onclose?: () => void;
  /** the control that opened it: a press there is its own (it toggles the menu), not one outside */
  owner?: Element;
  /** an id while it is open (a fading menu gives it up, so `#id` is always the open one) */
  id?: string;
  /** false: the keys stay where they are (a menu opened by hovering) */
  focus?: boolean;
  /** under a control: 'end' lines up the right edges whichever side of the window it is on */
  align?: 'auto' | 'end';
  /** under a control: its narrowest width (otherwise 240px) */
  minWidth?: number;
}

export function closeContextMenu() {
  if (!current) return;
  const was = current; current = null;
  // it fades out, then goes; a new menu can open meanwhile
  was.menu.leave().then(() => unmount(was.menu));
  was.onclose?.();
}

export function openContextMenu(items: MenuEntry[], x: number, y: number, pick: (act: string) => void, opts: ContextMenuOptions = {}): HTMLElement | undefined {
  closeContextMenu();
  const menu = mount(ContextMenu, {
    target: document.body,
    props: {
      items, x, y, anchor: opts.anchor, below: opts.below, owner: opts.owner, label: opts.label, class: opts.class,
      id: opts.id, focus: opts.focus ?? true, align: opts.align, minWidth: opts.minWidth,
      onpick: (act: string) => { closeContextMenu(); pick(act); },
      onclose: () => { if (current?.menu === menu) closeContextMenu(); },
    },
  }) as Instance;
  current = { menu, onclose: opts.onclose };
  flushSync(); // placed now, so a caller can measure it or watch the pointer on it
  return menu.element();
}

export const contextMenuOpen = () => current !== null;
