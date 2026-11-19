<script lang="ts" module>
  // One flyout open at a time, across every Flyout on the page. Code outside Svelte reaches the group through
  // these: close it, ask whether one is open, keep it open while the pointer is over something that belongs to it
  // (the draw-mode menu beside the shapes flyout) and let it go again, and hear when one closes.
  const HOVER_OPEN = 120, HOVER_CLOSE = 280;
  const group = $state<{ id: string | null; pinned: boolean }>({ id: null, pinned: false });
  let timer = 0;
  const later = (fn?: () => void, ms = 0) => { clearTimeout(timer); timer = fn ? (setTimeout(fn, ms) as unknown as number) : 0; };
  const closeHooks = new Set<() => void>();
  function setOpen(id: string | null, pinned = false) {
    const was = group.id;
    group.id = id; group.pinned = pinned;
    if (was && was !== id) closeHooks.forEach((fn) => fn());
  }
  /** Closes whichever flyout is open. */
  export function closeFlyouts() { later(); setOpen(null); }
  export const flyoutOpen = () => group.id !== null;
  /** The pointer is over something that belongs to the open flyout: don't close it. */
  export function holdFlyout() { later(); }
  /** The pointer has left that: close the flyout after the usual grace, unless it was clicked open. */
  export function releaseFlyout() { if (group.id && !group.pinned) later(closeFlyouts, HOVER_CLOSE); }
  /** Runs `fn` whenever an open flyout closes (or gives way to another); returns the unsubscribe. */
  export function onFlyoutClose(fn: () => void) { closeHooks.add(fn); return () => closeHooks.delete(fn); }
</script>
<script lang="ts">
  // A tool group: a button whose choices fly out beside it (`.popover.flyout`, 8px padding, 16px corners). A mouse
  // resting on the button opens it after 120ms, so sweeping down a rail doesn't flash every group; it closes once
  // the mouse has been off both the button and the panel for 280ms, time to cross the gap. Moving from one open
  // group's button to the next switches at once. A click opens it and pins it open until a choice, a click
  // elsewhere, Esc or a second click; touch and pen open it by tapping. The choices are the children, given a
  // `close` to call after a pick; or `panel`, the id of an element elsewhere on the page (built by code outside
  // Svelte, and kept in its hidden home while closed), shown in the flyout while it is open. Other attributes
  // (`data-*`, `id`) go on the button, and its classes are only set once, so code may mark it (`active`).
  import { untrack, type Snippet } from 'svelte';
  import { runtime as TD } from '../../runtime';
  import { onMount } from 'svelte';
  import { installTooltips } from '../services/tooltip';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';
  import { buttonClass } from './button';
  import type { IconName } from './icons';
  let { icon, svg, title, label, width, class: extra, panel, children, ...rest }: {
    icon?: IconName; svg?: string; title: string;
    /** the panel's name for screen readers; defaults to the title */
    label?: string;
    width?: number; class?: string;
    /** the id of an element to show in the flyout while it is open */
    panel?: string;
    children?: Snippet<[() => void]>;
    [attr: string]: unknown;
  } = $props();
  onMount(installTooltips);
  const id = $props.id();
  let btn: HTMLButtonElement | undefined = $state();
  let byKey = $state(false);
  const open = $derived(group.id === id);
  const show = (pinned: boolean) => { later(); TD.tooltip?.hide(); setOpen(id, pinned); };
  const close = () => { later(); if (group.id === id) setOpen(null); };
  function click(e: MouseEvent) {
    later();
    if (open && group.pinned) { close(); return; }
    byKey = e.detail === 0; // Enter or Space
    show(true);
  }
  function enter(e: PointerEvent) {
    if (e.pointerType !== 'mouse') { if (group.id && !open) show(false); return; }
    if (open) { later(); return; }
    later(() => show(false), group.id ? 0 : HOVER_OPEN);
  }
  function leave(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    if (!open) { later(); return; }
    if (!group.pinned) later(close, HOVER_CLOSE);
  }
  // the panel moves in while open and goes back to its home once the flyout has faded out
  const adopt = (ref: string) => (host: HTMLElement) => {
    const el = document.getElementById(ref);
    if (!el) return;
    const home = el.parentNode!, next = el.nextSibling;
    host.append(el);
    return () => { home.insertBefore(el, next && next.parentNode === home ? next : null); };
  };
  // set once: the button's own classes never change, so marks added by other code stay
  const cls = buttonClass({ icon: true, variant: 'flat', on: false, extra: ['flyout-btn', untrack(() => extra)].filter(Boolean).join(' ') });
</script>
<button bind:this={btn} type="button" class={cls} class:open {title} aria-haspopup="dialog" aria-expanded={open}
  {...rest} onclick={click} onpointerenter={enter} onpointerleave={leave}>{#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}<span class="more" aria-hidden="true"></span></button>
{#if open && btn}
  <Popover anchor={btn} placement="beside" inset={8} {width} class="flyout" label={label ?? title} focusFirst={byKey} onclose={close}
    onpointerenter={(e: PointerEvent) => { if (e.pointerType === 'mouse') later(); }}
    onpointerleave={(e: PointerEvent) => { if (e.pointerType === 'mouse' && !group.pinned) later(close, HOVER_CLOSE); }}>{#if panel}<div class="pop-body" {@attach adopt(panel)}></div>{:else}{@render children?.(close)}{/if}</Popover>
{/if}
