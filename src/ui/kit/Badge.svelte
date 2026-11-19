<script lang="ts">
  // A small count or note beside a title: parts in a palette category, lines of code, items in a section. Mono-width
  // digits, so a changing count doesn't jiggle. `faint` for the palette's category counts.
  import type { Snippet } from 'svelte';
  let { count, faint = false, label, class: extra, children }: { count?: number | string; faint?: boolean; label?: string; class?: string; children?: Snippet } = $props();
</script>
<small class={['badge', faint && 'faint', extra]} aria-label={label}>{#if children}{@render children()}{:else}{count}{/if}</small>
