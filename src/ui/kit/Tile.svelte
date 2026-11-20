<script lang="ts">
  // A picture choice: a 40×30 drawing above a short name (11px), as in the Insert and Blocks flyouts, picture
  // menus and galleries. `on` marks the current one (ink edge on a filled tile); `soon` a feature not built yet.
  // The title is its tooltip, and its full name when the label is short. `children` stands in for the label when it
  // has markup (a package name in code). `option` makes it one choice of a list box (a Select's picture menu: role
  // option, picked by the list, not a button of its own), drawn the same.
  import { onMount, type Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { installTooltips } from '../services/tooltip';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  let { label, svg, icon, on = false, soon = false, option = false, class: extra, type = 'button', onclick, children, ...rest }: Omit<HTMLButtonAttributes, 'class' | 'children'> & {
    label: string; svg?: string; icon?: IconName; on?: boolean; soon?: boolean; option?: boolean; class?: string | (string | false | null | undefined)[]; children?: Snippet;
  } = $props();
  onMount(installTooltips);
</script>
{#snippet face()}{#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}<span>{#if children}{@render children()}{:else}{label}{/if}</span>{/snippet}
{#if option}
  <div class={['tile', on && 'on', soon && 'soon', extra]} role="option" aria-selected={on} aria-disabled={soon ? 'true' : undefined} {...rest as Record<string, unknown>}>{@render face()}</div>
{:else}
  <button {type} class={['press', 'tile', on && 'on', soon && 'soon', extra]} aria-pressed={on || undefined} aria-disabled={soon ? 'true' : undefined} tabindex={soon ? -1 : undefined} {...rest}
    onclick={(e) => { if (soon) { e.preventDefault(); e.stopPropagation(); return; } onclick?.(e); }}>{@render face()}</button>
{/if}
