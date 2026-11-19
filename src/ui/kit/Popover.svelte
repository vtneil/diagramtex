<script lang="ts">
  // A floating panel opened from a control: the Export panel, the dash and width pickers, a tool group's flyout.
  // Placed by placePopover (popover.ts): `below` the control or `beside` it, kept inside the window, and placed
  // again as its content changes size. Its corner is concentric with what sits in it: the 8px control corner plus
  // its padding (`inset`, 4, 8 or 12px). Esc, or a press outside it and its control, closes it (`onclose`); Esc
  // gives focus back to the control. It fades in and out. It is drawn at the top of the page (document.body), so
  // nothing that clips or transforms the control's ancestors reaches it.
  import { onMount, type Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { placePopover, type PopoverPlacement } from './popover';
  let { anchor, placement = 'below', inset = 12, width, label, role = 'dialog', class: extra, focusFirst = false, onclose, children, ...rest }: {
    /** the control it belongs to (presses on it don't count as outside), or a rectangle to open at */
    anchor: Element | DOMRect;
    placement?: PopoverPlacement;
    inset?: 4 | 8 | 12;
    /** px; otherwise as wide as its content */
    width?: number;
    label?: string;
    role?: string;
    class?: string;
    /** move focus to its first control as it opens (when opened from the keyboard) */
    focusFirst?: boolean;
    onclose?: () => void;
    children: Snippet;
    [attr: string]: unknown;
  } = $props();
  let el: HTMLElement | undefined = $state();
  let origin = $state('top left');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // drawn at the top of the page: nothing around the control clips, transforms or stacks over it
  // (and so taken away by hand: Svelte removes only what is still where it put it; this runs after the fade)
  const portal = (node: HTMLElement) => { document.body.appendChild(node); return () => node.remove(); };
  function place() { if (el && !el.classList.contains('leaving')) origin = placePopover(el, anchor, placement, inset); }
  function pop(node: Element, _: unknown, { direction }: { direction: 'in' | 'out' | 'both' }) {
    if (direction === 'out') node.classList.add('leaving');
    return { duration: reduced() ? 0 : direction === 'out' ? 120 : 140, easing: cubicOut, css: (k: number) => `opacity: ${k}; scale: ${0.97 + 0.03 * k}` };
  }
  onMount(() => {
    place();
    if (focusFirst) el!.querySelector<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    const ctl = anchor instanceof Element ? anchor : null;
    const outside = (e: Event) => { const t = e.target as Node; if (!el!.contains(t) && !ctl?.contains(t) && !(t as Element).closest?.('.selmenu, .ctx, .cp, .td-tip')) onclose?.(); };
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault(); e.stopPropagation();
      if (el!.contains(document.activeElement) && ctl instanceof HTMLElement) ctl.focus({ preventScroll: true });
      onclose?.();
    };
    document.addEventListener('pointerdown', outside, true);
    // Esc inside it ends there (nothing behind it sees it); outside it, it still closes it
    el!.addEventListener('keydown', keys);
    document.addEventListener('keydown', keys);
    addEventListener('resize', place);
    const ro = new ResizeObserver(place); ro.observe(el!);
    return () => { document.removeEventListener('pointerdown', outside, true); el!.removeEventListener('keydown', keys); document.removeEventListener('keydown', keys); removeEventListener('resize', place); ro.disconnect(); };
  });
  $effect(() => { void anchor; void placement; place(); });
</script>
<div bind:this={el} {@attach portal} in:pop|global out:pop|global class={['popover', 'kit-pop', extra]} {role} aria-label={label} tabindex="-1"
  style:--pop-inset={inset + 'px'} style:width={width ? width + 'px' : undefined} style:transform-origin={origin} {...rest}>{@render children()}</div>
