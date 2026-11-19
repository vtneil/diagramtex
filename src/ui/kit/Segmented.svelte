<script lang="ts">
  // A switch. `panel` draws the properties panel's track (.seg-ctl, sized by its row); otherwise the toolbar's (.seg).
  import Icon from './Icon.svelte';
  import type { SegmentOption } from './segmented';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { installSegThumb } from '../services/segthumb';
  let { options, many = false, panel = false, label, class: extra, children, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'class'> & {
    options: SegmentOption[]; many?: boolean; panel?: boolean; label?: string; class?: string;
    /** controls of their own at the start of the track (the grid styles before Guides and Snap) */
    children?: Snippet;
  } = $props();
  // the sliding knob of a one-of switch (src/ui/services/segthumb.ts); toggles (many) have none
  onMount(installSegThumb);
  const track = $derived([panel ? 'seg-ctl' : 'seg', many && 'ze-flags', extra].filter(Boolean).join(' '));
</script>
<div class={track} role={many ? 'group' : 'radiogroup'} aria-label={label} {...rest}>
  {@render children?.()}
  {#each options as o, i (i)}
    {#if many}
      <button type="button" class={[o.on && 'on', o.class].filter(Boolean).join(' ') || undefined} aria-pressed={!!o.on} disabled={o.disabled} title={o.title} aria-label={o.name} {...o.attrs}>{#if o.swatch}<i style:background={o.swatch.css} class={o.swatch.none ? 'none' : undefined}></i>{/if}{#if o.icon}<Icon name={o.icon} />{:else if o.svg}{@html o.svg}{/if}{#if o.labelClass}<span class={o.labelClass}>{o.label ?? ''}</span>{:else}{o.label ?? ''}{/if}</button>
    {:else}
      <button type="button" role="radio" class={[o.on && 'on', o.class].filter(Boolean).join(' ') || undefined} aria-checked={!!o.on} disabled={o.disabled} title={o.title} aria-label={o.name} {...o.attrs}>{#if o.swatch}<i style:background={o.swatch.css} class={o.swatch.none ? 'none' : undefined}></i>{/if}{#if o.icon}<Icon name={o.icon} />{:else if o.svg}{@html o.svg}{/if}{#if o.labelClass}<span class={o.labelClass}>{o.label ?? ''}</span>{:else}{o.label ?? ''}{/if}</button>
    {/if}
  {/each}
</div>
