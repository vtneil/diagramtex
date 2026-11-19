<script lang="ts">
  // A main action joined to an arrow that opens its choices: Download .zip | ▾, the toolbar's borders, number format
  // and colours. The button does the usual (or the last picked) thing; the arrow opens a menu or a popover, which
  // `onmore` is given the arrow to open from. `toolbar` is the flat look of the Table and Document toolbars, where
  // `on` fills both halves as one control.
  import { onMount, type Snippet } from 'svelte';
  import { installTooltips } from '../services/tooltip';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  let { id, mainId, moreId, mainAttrs, moreAttrs, mainClass, hidden = false, label, icon, svg, swatch, title, moreTitle, popup = 'menu', toolbar = false, on = false, disabled = false, expanded = false, class: extra, onclick, onmore, moreEl = $bindable(), children }: {
    /** ids of the whole and of its two buttons, for code that drives it by id (application/app.ts) */
    id?: string; mainId?: string; moreId?: string; hidden?: boolean;
    /** hooks on the two buttons (data-*), for a controller that handles its clicks by attribute; a class on the main one */
    mainAttrs?: Record<string, string>; moreAttrs?: Record<string, string>; mainClass?: string;
    label?: string; icon?: IconName; svg?: string; title?: string;
    /** the colour a colour button applies, shown by its icon's bar (.sw: the textColour and fillColour icons) */
    swatch?: string;
    /** the arrow's tooltip and name ("More ways to download the .zip") */
    moreTitle: string;
    popup?: 'menu' | 'dialog'; toolbar?: boolean; on?: boolean; disabled?: boolean;
    /** whether what the arrow opens is showing */
    expanded?: boolean; class?: string;
    onclick?: (e: MouseEvent) => void; onmore?: (arrow: HTMLButtonElement) => void;
    moreEl?: HTMLButtonElement; children?: Snippet;
  } = $props();
  onMount(installTooltips);
  const iconOnly = $derived(!label && !children);
</script>
<span {id} {hidden} class={['split-btn', toolbar && 'tb-split', extra]}>
  <button id={mainId} type="button" class={['press', iconOnly && 'icon', on && 'on', mainClass]} style:--sw={swatch} {title} {disabled} {onclick} {...mainAttrs}>{#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}{#if children}{@render children()}{:else}{label}{/if}</button>
  <button bind:this={moreEl} id={moreId} type="button" class={['press', toolbar && 'tb-more']} title={moreTitle} aria-label={moreTitle} aria-haspopup={popup} aria-expanded={expanded} {disabled} {...moreAttrs}
    onclick={(e) => onmore?.(e.currentTarget as HTMLButtonElement)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg></button>
</span>
