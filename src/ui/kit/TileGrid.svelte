<script lang="ts">
  // Tiles in a grid, 4px apart; four across by default (a 324px flyout).
  import type { Snippet } from 'svelte';
  let { columns = 4, label, class: extra, children }: { columns?: number; label?: string; class?: string; children: Snippet } = $props();
</script>
<div class={['tile-grid', extra]} role="group" aria-label={label} style:--tile-cols={columns}>{@render children()}</div>
