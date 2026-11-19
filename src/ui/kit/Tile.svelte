<script lang="ts">
  // A picture choice: a 40×30 drawing above a short name (11px), as in the Insert and Blocks flyouts, picture
  // menus and galleries. `on` marks the current one (ink edge on a filled tile); `soon` a feature not built yet.
  // The title is its tooltip, and its full name when the label is short. `children` stands in for the label when it
  // has markup (a package name in code).
  import { onMount, type Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { installTooltips } from '../services/tooltip';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  let { label, svg, icon, on = false, soon = false, class: extra, type = 'button', onclick, children, ...rest }: Omit<HTMLButtonAttributes, 'class' | 'children'> & {
    label: string; svg?: string; icon?: IconName; on?: boolean; soon?: boolean; class?: string; children?: Snippet;
  } = $props();
  onMount(installTooltips);
</script>
<button {type} class={['press', 'tile', on && 'on', soon && 'soon', extra]} aria-pressed={on || undefined} aria-disabled={soon ? 'true' : undefined} tabindex={soon ? -1 : undefined} {...rest}
  onclick={(e) => { if (soon) { e.preventDefault(); e.stopPropagation(); return; } onclick?.(e); }}>{#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}<span>{#if children}{@render children()}{:else}{label}{/if}</span></button>
