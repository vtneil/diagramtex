<script lang="ts">
  // A section of a properties panel (the right panel, a block editor's side): an optional title (11px, pencil; the
  // first in a block editor's side reads as its heading) with a count, a summary and a trailing action, then rows.
  // The summary sits at the far end of the title line (a block's "Optics", "2 parts, 3 wires"); `summaryInline` puts
  // it right after the title instead. `lead` goes before the title (a K-map group's colour).
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import Badge from './Badge.svelte';
  let { title, count, summary, summaryInline = false, lead, action, class: extra, children, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'title'> & {
    title?: string; count?: number | string; summary?: string | number; summaryInline?: boolean;
    lead?: Snippet; action?: Snippet; class?: string; children?: Snippet;
  } = $props();
  const hasSummary = $derived(summary !== undefined && summary !== '');
</script>
<div class={['sec', extra]} {...rest}>
  {#if title}<div class="sec-title">{@render lead?.()}<span>{title}{#if count !== undefined}<Badge {count} />{/if}{#if hasSummary && summaryInline} <small>{summary}</small>{/if}</span>{#if hasSummary && !summaryInline}<small>{summary}</small>{/if}{@render action?.()}</div>{/if}
  {@render children?.()}
</div>
