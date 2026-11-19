<script lang="ts">
  // A floating menu at a point (a right-click) or beside a control. Placed by positionMenu: kept on screen,
  // scrolling when taller than the window. Closed by a pick, Esc, a click or wheel elsewhere, or the window
  // losing focus or resizing; focus returns to where it was. Open it with openContextMenu() (context-menu.ts).
  import { onMount, tick } from 'svelte';
  import Menu from './Menu.svelte';
  import type { MenuEntry } from './menu';
  import { positionMenu, positionMenuBelow } from '../menu-position';
  let { items, x, y, anchor, below, owner, label, class: extra, id, focus = true, align, minWidth, onpick, onclose }: {
    /** anchor: beside a control (a submenu's way); below: under a control (a split button's arrow) */
    items: MenuEntry[]; x: number; y: number; anchor?: DOMRect; below?: DOMRect; owner?: Element; label?: string; class?: string;
    /** id: while open; focus: false leaves the keys where they are (a menu opened by hovering); align, minWidth: under a control */
    id?: string; focus?: boolean; align?: 'auto' | 'end'; minWidth?: number;
    onpick: (act: string) => void; onclose: () => void;
  } = $props();
  let el: HTMLElement | undefined = $state();
  let leaving = false;
  const before = document.activeElement as HTMLElement | null;
  const giveBackFocus = () => { if (before?.isConnected && el?.contains(document.activeElement)) before.focus({ preventScroll: true }); };
  /** Fade out (the pop-in played backwards, 120ms), then resolve; context-menu.ts unmounts it after. */
  export const element = () => el;
  export function leave(): Promise<void> {
    if (!el || leaving) return Promise.resolve();
    leaving = true;
    el.classList.add('leaving');
    el.removeAttribute('id'); // `#id` is the open menu, not this fading one
    giveBackFocus();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease').trim() || 'ease-out';
    const fade = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 120, easing: ease, fill: 'forwards' });
    return fade.finished.then(() => {}, () => {});
  }
  onMount(() => {
    if (below) positionMenuBelow(el!, below, { align, minWidth }); else positionMenu(el!, x, y, anchor);
    // submenus open to the left when the menu sits near the right edge
    el!.classList.toggle('flip', el!.getBoundingClientRect().right + 200 > innerWidth);
    if (focus) tick().then(() => (el?.querySelector('[role="menu"]') as HTMLElement | null)?.focus({ preventScroll: true })); // gone already if closed at once
    const outside = (e: Event) => { if (!leaving && !el!.contains(e.target as Node) && !owner?.contains(e.target as Node)) onclose(); };
    const keys = (e: KeyboardEvent) => { if (!leaving && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); } };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('wheel', outside, { capture: true, passive: true });
    document.addEventListener('keydown', keys, true);
    const away = () => { if (!leaving) onclose(); };
    addEventListener('blur', away); addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('wheel', outside, { capture: true });
      document.removeEventListener('keydown', keys, true);
      removeEventListener('blur', away); removeEventListener('resize', away);
      giveBackFocus();
    };
  });
</script>
<!-- svelte-ignore a11y_no_static_element_interactions (stops the browser's own menu over this one, and keys going past it) -->
<!-- keys pressed in the menu end here: nothing behind it (a block editor's shortcuts, the app's) acts on them -->
<div bind:this={el} {id} class={['ctx kit-menu', extra].filter(Boolean).join(' ')} aria-label={label} oncontextmenu={(e) => e.preventDefault()} onkeydown={(e) => e.stopPropagation()}>
  <Menu {items} {onpick} />
</div>
